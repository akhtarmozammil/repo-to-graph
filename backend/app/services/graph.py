import networkx as nx
import json
from sqlalchemy.orm import Session
from backend.app.models.database import Node, Edge

class GraphService:
    @staticmethod
    def _build_nx_graph(db: Session, repository_id: str) -> nx.DiGraph:
        """Loads SQLite nodes and edges into a NetworkX directed graph."""
        nodes = db.query(Node).filter(Node.repository_id == repository_id).all()
        edges = db.query(Edge).filter(Edge.repository_id == repository_id).all()

        G = nx.DiGraph()

        for node in nodes:
            G.add_node(
                node.id,
                name=node.name,
                type=node.type,
                file_path=node.file_path,
                start_line=node.start_line,
                end_line=node.end_line,
                properties=node.properties
            )

        for edge in edges:
            G.add_edge(
                edge.source_id,
                edge.target_id,
                type=edge.type,
                properties=edge.properties
            )

        return G

    @classmethod
    def get_graph_data(
        cls, 
        db: Session, 
        repository_id: str, 
        focus_node_id: str | None = None,
        depth: int = 2
    ) -> dict:
        """
        Returns nodes and edges formatting for React Flow frontend.
        Optionally filters to the neighborhood of a focus node.
        For large repositories, defaults to a high-level architectural view (files/folders/APIs/tables)
        when no focus node is active to optimize frontend rendering performance.
        """
        G = cls._build_nx_graph(db, repository_id)
        total_nodes_count = len(G)
        high_level_view = False

        # Calculate repository-wide metrics from full graph G before filtering
        type_counts = {"repo": 0, "folder": 0, "file": 0, "class": 0, "function": 0, "api": 0, "table": 0}
        for _, attrs in G.nodes(data=True):
            n_type = attrs.get("type")
            if n_type in type_counts:
                type_counts[n_type] += 1

        # If focusing, extract the subgraph of neighbors up to 'depth' hops
        if focus_node_id and G.has_node(focus_node_id):
            # Convert to undirected to get neighbors in both directions (upstream and downstream)
            undir_G = G.to_undirected()
            lengths = nx.single_source_shortest_path_length(undir_G, focus_node_id, cutoff=depth)
            subgraph_nodes = list(lengths.keys())
            G = G.subgraph(subgraph_nodes)
        
        # If no focus is set and the repository is large (> 600 nodes),
        # default to a high-level view (repo, folder, file, api, table) to prevent browser freeze
        elif total_nodes_count > 600:
            high_level_types = {'repo', 'folder', 'file', 'api', 'table'}
            high_level_nodes = {n_id for n_id, attrs in G.nodes(data=True) if attrs.get("type") in high_level_types}
            
            # Create a copy of the subgraph containing only high-level nodes
            H = G.subgraph(high_level_nodes).copy()
            
            # Project edges going through hidden function/class nodes up to file-level nodes
            for u, v, attrs in G.edges(data=True):
                edge_type = attrs.get("type")
                u_type = G.nodes[u].get("type")
                v_type = G.nodes[v].get("type")
                
                # API Route -> Function/Class => Project to API Route -> File
                if u_type == 'api' and v_type in ('function', 'class'):
                    v_file_path = G.nodes[v].get("file_path")
                    if v_file_path:
                        file_id = f"{repository_id}:file:{v_file_path}"
                        if file_id in high_level_nodes:
                            H.add_edge(u, file_id, type=edge_type)
                
                # Function/Class -> Table => Project to File -> Table
                elif u_type in ('function', 'class') and v_type == 'table':
                    u_file_path = G.nodes[u].get("file_path")
                    if u_file_path:
                        file_id = f"{repository_id}:file:{u_file_path}"
                        if file_id in high_level_nodes:
                            H.add_edge(file_id, v, type=edge_type)
                
                # Function/Class -> Function/Class => Project to File -> File (cross-file calls)
                elif u_type in ('function', 'class') and v_type in ('function', 'class'):
                    u_file_path = G.nodes[u].get("file_path")
                    v_file_path = G.nodes[v].get("file_path")
                    if u_file_path and v_file_path and u_file_path != v_file_path:
                        file_id_u = f"{repository_id}:file:{u_file_path}"
                        file_id_v = f"{repository_id}:file:{v_file_path}"
                        if file_id_u in high_level_nodes and file_id_v in high_level_nodes:
                            H.add_edge(file_id_u, file_id_v, type='CALLS')

            G = H
            high_level_view = True

        # Format for React Flow
        nodes_list = []
        for n_id, attrs in G.nodes(data=True):
            nodes_list.append({
                "id": n_id,
                "name": attrs.get("name", ""),
                "type": attrs.get("type", ""),
                "file_path": attrs.get("file_path", ""),
                "start_line": attrs.get("start_line"),
                "end_line": attrs.get("end_line"),
                "properties": attrs.get("properties", {})
            })

        edges_list = []
        for u, v, attrs in G.edges(data=True):
            edges_list.append({
                "source": u,
                "target": v,
                "type": attrs.get("type", "")
            })

        return {
            "nodes": nodes_list,
            "edges": edges_list,
            "metrics": {
                "files": type_counts["file"],
                "classes": type_counts["class"],
                "functions": type_counts["function"],
                "apis": type_counts["api"],
                "tables": type_counts["table"],
                "total": total_nodes_count
            },
            "high_level_view": high_level_view
        }

    @classmethod
    def detect_circular_dependencies(cls, db: Session, repository_id: str) -> dict:
        """
        Detects circular dependencies:
        1. File-level imports (File A imports File B imports File A)
        2. Function-level calls (Func A calls Func B calls Func A)
        Returns a list of cycles (paths forming loops).
        """
        G = cls._build_nx_graph(db, repository_id)

        # File import cycles
        import_edges = [(u, v) for u, v, data in G.edges(data=True) if data.get("type") == "IMPORTS"]
        file_subgraph = nx.DiGraph(import_edges)
        for node in G.nodes():
            if G.nodes[node].get("type") == "file" and not file_subgraph.has_node(node):
                file_subgraph.add_node(node)
        
        file_cycles = list(nx.simple_cycles(file_subgraph))
        # Format file cycles
        formatted_file_cycles = []
        for cycle in file_cycles:
            formatted_file_cycles.append([
                {"id": n, "name": G.nodes[n].get("name", ""), "file_path": G.nodes[n].get("file_path", "")}
                for n in cycle
            ])

        # Function call cycles (recursion)
        call_edges = [(u, v) for u, v, data in G.edges(data=True) if data.get("type") == "CALLS"]
        func_subgraph = nx.DiGraph(call_edges)
        for node in G.nodes():
            if G.nodes[node].get("type") == "function" and not func_subgraph.has_node(node):
                func_subgraph.add_node(node)

        func_cycles = list(nx.simple_cycles(func_subgraph))
        formatted_func_cycles = []
        for cycle in func_cycles:
            formatted_func_cycles.append([
                {"id": n, "name": G.nodes[n].get("name", ""), "file_path": G.nodes[n].get("file_path", "")}
                for n in cycle
            ])

        return {
            "file_cycles": formatted_file_cycles,
            "function_cycles": formatted_func_cycles,
            "total_cycles_count": len(file_cycles) + len(func_cycles)
        }

    @classmethod
    def get_impact_analysis(cls, db: Session, repository_id: str, node_id: str) -> dict:
        """
        Performs Impact Analysis for a given node.
        Finds:
        - Upstream (Ancestors): nodes that transitively call/use this node
        - Downstream (Descendants): nodes transitively called/used by this node
        - Impact Score and breakdown of affected files, classes, functions
        """
        G = cls._build_nx_graph(db, repository_id)

        if not G.has_node(node_id):
            return {"error": f"Node {node_id} not found"}

        # We want to perform call impact analysis primarily for functions, APIs or files.
        # Upstream: things calling me (transitive)
        upstream_nodes = nx.ancestors(G, node_id)
        # Downstream: things I call (transitive)
        downstream_nodes = nx.descendants(G, node_id)

        affected_files = set()
        affected_classes = set()
        affected_functions = set()

        # Compile metrics for upstream nodes (the ones affected by changes to this node)
        for u_id in upstream_nodes:
            attrs = G.nodes[u_id]
            node_type = attrs.get("type")
            file_path = attrs.get("file_path")
            
            if file_path:
                affected_files.add(file_path)
            
            if node_type == "class":
                affected_classes.add(u_id)
            elif node_type == "function":
                affected_functions.add(u_id)
                # If function is a method, also capture class
                class_name = attrs.get("properties", {}).get("class_name")
                if class_name and file_path:
                    class_id = f"{repository_id}:class:{file_path}:{class_name}"
                    affected_classes.add(class_id)

        # Include self in affected files
        self_file = G.nodes[node_id].get("file_path")
        if self_file:
            affected_files.add(self_file)

        # Format lists
        upstream_list = [
            {"id": uid, "name": G.nodes[uid].get("name"), "type": G.nodes[uid].get("type"), "file_path": G.nodes[uid].get("file_path")}
            for uid in upstream_nodes
        ]
        
        downstream_list = [
            {"id": did, "name": G.nodes[did].get("name"), "type": G.nodes[did].get("type"), "file_path": G.nodes[did].get("file_path")}
            for did in downstream_nodes
        ]

        # Calculate a basic Impact Score (sum of affected nodes weighted by type)
        impact_score = len(affected_files) * 5 + len(affected_classes) * 3 + len(affected_functions) * 1

        return {
            "node_id": node_id,
            "node_name": G.nodes[node_id].get("name"),
            "node_type": G.nodes[node_id].get("type"),
            "upstream": upstream_list,
            "downstream": downstream_list,
            "metrics": {
                "affected_files_count": len(affected_files),
                "affected_classes_count": len(affected_classes),
                "affected_functions_count": len(affected_functions),
                "impact_score": impact_score
            },
            "affected_files": list(affected_files)
        }
