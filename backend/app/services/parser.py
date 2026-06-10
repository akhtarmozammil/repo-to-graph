import os
import logging
from sqlalchemy.orm import Session
from backend.app.parsers.python import PythonParser
from backend.app.parsers.javascript import JavascriptParser
from backend.app.parsers.typescript import TypescriptParser
from backend.app.database.graph_db import clear_graph, bulk_insert_graph

logger = logging.getLogger(__name__)

# Folders to ignore during scan
IGNORE_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__",
    ".next", "dist", "build", ".idea", ".vscode", "out"
}

class ParserService:
    def __init__(self):
        self.py_parser = PythonParser()
        self.js_parser = JavascriptParser()
        self.ts_parser = TypescriptParser()

    def get_parser(self, file_path: str):
        _, ext = os.path.splitext(file_path.lower())
        if ext == ".py":
            return self.py_parser
        elif ext in (".js", ".jsx"):
            return self.js_parser
        elif ext in (".ts", ".tsx"):
            return self.ts_parser
        return None

    def scan_repository(self, db: Session, repo_id: str, repo_path: str):
        """
        Traverses a repository, parses files, resolves dependencies,
        and saves nodes & edges to SQLite.
        """
        logger.info(f"Starting repository scan for repo_id: {repo_id} at path: {repo_path}")
        
        # Clear existing graph for this repo
        clear_graph(db, repo_id)

        nodes = []
        edges = []

        # Maps to help resolve dependencies
        # { file_rel_path: [functions_list] }
        file_functions = {}
        # { file_rel_path: [imports_list] }
        file_imports = {}
        # { file_rel_path: [raw_calls_list] }
        file_calls = {}
        # { function_name: [list_of_nodes] }
        global_function_index = {}

        # 1. Create Repository root node
        repo_node_id = f"{repo_id}:repo"
        nodes.append({
            "id": repo_node_id,
            "repository_id": repo_id,
            "name": os.path.basename(repo_path),
            "type": "repo",
            "properties": {"path": repo_path}
        })

        # Keep track of created folder nodes to link them
        # Key: rel_path, Value: node_id
        folder_nodes = {"": repo_node_id}

        # Walk directory tree
        for root, dirs, files in os.walk(repo_path):
            # Prune ignore folders in-place
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            # Get folder relative path from repo root
            rel_folder_path = os.path.relpath(root, repo_path)
            if rel_folder_path == ".":

                rel_folder_path = ""

            # Ensure current folder has a node
            if rel_folder_path != "":
                folder_name = os.path.basename(root)
                folder_node_id = f"{repo_id}:folder:{rel_folder_path}"
                nodes.append({
                    "id": folder_node_id,
                    "repository_id": repo_id,
                    "name": folder_name,
                    "type": "folder",
                    "file_path": rel_folder_path
                })
                folder_nodes[rel_folder_path] = folder_node_id

                # Link folder to its parent folder
                parent_rel_path = os.path.dirname(rel_folder_path)
                parent_node_id = folder_nodes.get(parent_rel_path, repo_node_id)
                edges.append({
                    "repository_id": repo_id,
                    "source_id": parent_node_id,
                    "target_id": folder_node_id,
                    "type": "CONTAINS"
                })

            # Process files in current folder
            for file in files:
                file_abs_path = os.path.join(root, file)
                file_rel_path = os.path.relpath(file_abs_path, repo_path)
                
                file_node_id = f"{repo_id}:file:{file_rel_path}"
                ext = os.path.splitext(file)[1]
                language = ext[1:] if ext else "unknown"
                
                nodes.append({
                    "id": file_node_id,
                    "repository_id": repo_id,
                    "name": file,
                    "type": "file",
                    "file_path": file_rel_path,
                    "properties": {"language": language}
                })

                # Link file to parent folder node
                parent_node_id = folder_nodes[rel_folder_path]
                edges.append({
                    "repository_id": repo_id,
                    "source_id": parent_node_id,
                    "target_id": file_node_id,
                    "type": "CONTAINS"
                })

                # Read and Parse File Code (only if we have an AST parser for it)
                parser = self.get_parser(file_abs_path)
                if not parser:
                    continue

                try:
                    with open(file_abs_path, "r", encoding="utf-8", errors="ignore") as f:
                        code_content = f.read()

                    parse_data = parser.parse(code_content, file_rel_path)
                    
                    # Store for linkage phase
                    file_imports[file_rel_path] = parse_data["imports"]
                    file_calls[file_rel_path] = parse_data["calls"]

                    # Add class nodes and contains links
                    class_nodes = {}
                    for cls in parse_data["classes"]:
                        class_node_id = f"{repo_id}:class:{file_rel_path}:{cls['name']}_L{cls['start_line']}"
                        nodes.append({
                            "id": class_node_id,
                            "repository_id": repo_id,
                            "name": cls["name"],
                            "type": "class",
                            "file_path": file_rel_path,
                            "start_line": cls["start_line"],
                            "end_line": cls["end_line"]
                        })
                        class_nodes[cls["name"]] = class_node_id
                        
                        edges.append({
                            "repository_id": repo_id,
                            "source_id": file_node_id,
                            "target_id": class_node_id,
                            "type": "CONTAINS"
                        })

                    # Add function nodes and contains links
                    file_funcs_list = []
                    for func in parse_data["functions"]:
                        class_name = func["class_name"]
                        func_key = f"{class_name}:{func['name']}" if class_name else func["name"]
                        func_node_id = f"{repo_id}:function:{file_rel_path}:{func_key}_L{func['start_line']}"

                        
                        func_info = {
                            "id": func_node_id,
                            "name": func["name"],
                            "class_name": class_name,
                            "file_path": file_rel_path,
                            "start_line": func["start_line"],
                            "end_line": func["end_line"],
                            "is_method": func["is_method"]
                        }
                        
                        nodes.append({
                            "id": func_node_id,
                            "repository_id": repo_id,
                            "name": func["name"],
                            "type": "function",
                            "file_path": file_rel_path,
                            "start_line": func["start_line"],
                            "end_line": func["end_line"],
                            "properties": {
                                "is_method": func["is_method"],
                                "class_name": class_name
                            }
                        })
                        
                        file_funcs_list.append(func_info)
                        
                        # Populate global function index for caller resolution
                        if func["name"] not in global_function_index:
                            global_function_index[func["name"]] = []
                        global_function_index[func["name"]].append(func_info)

                        # Link contains
                        parent_id = class_nodes.get(class_name) if class_name else file_node_id
                        edges.append({
                            "repository_id": repo_id,
                            "source_id": parent_id,
                            "target_id": func_node_id,
                            "type": "CONTAINS"
                        })
                    
                    file_functions[file_rel_path] = file_funcs_list

                    # Add API Endpoints nodes & links
                    for api in parse_data["apis"]:
                        api_node_id = f"{repo_id}:api:{api['method']}:{api['path']}"
                        # Check if API node already exists (e.g. from multiple endpoints)
                        if not any(n["id"] == api_node_id for n in nodes):
                            nodes.append({
                                "id": api_node_id,
                                "repository_id": repo_id,
                                "name": f"{api['method']} {api['path']}",
                                "type": "api",
                                "file_path": file_rel_path,
                                "start_line": api["start_line"],
                                "properties": {"method": api["method"], "path": api["path"]}
                            })
                        
                        # Link API node to the specific function that wraps it
                        # Typically the function starting at or around that line
                        for func_info in file_funcs_list:
                            if func_info["start_line"] <= api["start_line"] <= func_info["end_line"]:
                                edges.append({
                                    "repository_id": repo_id,
                                    "source_id": api_node_id,
                                    "target_id": func_info["id"],
                                    "type": "CALLS_API"
                                })
                                break

                    # Add Database Table nodes & links
                    for db_q in parse_data["db_queries"]:
                        table_node_id = f"{repo_id}:table:{db_q['table']}"
                        if not any(n["id"] == table_node_id for n in nodes):
                            nodes.append({
                                "id": table_node_id,
                                "repository_id": repo_id,
                                "name": db_q["table"],
                                "type": "table"
                            })
                        
                        # Link function performing query to table node
                        for func_info in file_funcs_list:
                            if func_info["start_line"] <= db_q["start_line"] <= func_info["end_line"]:
                                edges.append({
                                    "repository_id": repo_id,
                                    "source_id": func_info["id"],
                                    "target_id": table_node_id,
                                    "type": "USES",
                                    "properties": {"operation": db_q["operation"]}
                                })
                                break

                except Exception as e:
                    logger.error(f"Error parsing file {file_rel_path}: {e}", exc_info=True)

        # 2. RESOLVE IMPORTS & BUILD IMPORT GRAPH
        for file_rel, imports in file_imports.items():
            file_node_id = f"{repo_id}:file:{file_rel}"
            for imp in imports:
                target_rel_path = self._resolve_import_file_path(file_rel, imp["module"], repo_path, file_imports.keys())
                if target_rel_path:
                    target_file_node_id = f"{repo_id}:file:{target_rel_path}"
                    edges.append({
                        "repository_id": repo_id,
                        "source_id": file_node_id,
                        "target_id": target_file_node_id,
                        "type": "IMPORTS"
                    })

        # 3. RESOLVE FUNCTION CALLS & BUILD CALL GRAPH
        for file_rel, calls in file_calls.items():
            funcs_in_file = file_functions.get(file_rel, [])
            
            for call in calls:
                caller_func = call["caller"]
                callee_name = call["callee"]
                call_line = call["line"]

                # Find caller node id
                caller_node_id = None
                if caller_func == "global":
                    caller_node_id = f"{repo_id}:file:{file_rel}"
                else:
                    for f_info in funcs_in_file:
                        if f_info["name"] == caller_func and f_info["start_line"] <= call_line <= f_info["end_line"]:
                            caller_node_id = f_info["id"]
                            break
                    # Fallback to any function with that name in file
                    if not caller_node_id:
                        for f_info in funcs_in_file:
                            if f_info["name"] == caller_func:
                                caller_node_id = f_info["id"]
                                break

                if not caller_node_id:
                    continue

                # Find callee node id (resolve the target function)
                callee_node_id = self._resolve_callee_node_id(
                    file_rel,
                    callee_name,
                    funcs_in_file,
                    file_imports.get(file_rel, []),
                    global_function_index,
                    repo_id,
                    repo_path,
                    file_imports.keys()
                )

                if callee_node_id:
                    edges.append({
                        "repository_id": repo_id,
                        "source_id": caller_node_id,
                        "target_id": callee_node_id,
                        "type": "CALLS",
                        "properties": {"line": call_line}
                    })

        # 4. Save to Database
        logger.info(f"Scan complete. Saving {len(nodes)} nodes and {len(edges)} edges to database.")
        bulk_insert_graph(db, nodes, edges)
        logger.info("Successfully saved graph scan data.")

    def _resolve_import_file_path(self, current_file: str, module_name: str, repo_path: str, all_files: list) -> str | None:
        """Resolves an import name (module) to a relative file path in the repository."""
        # Clean relative parts e.g. from ./db or ../services/db
        curr_dir = os.path.dirname(current_file)
        
        # Try python dotted modules (e.g. from services.db import x)
        dotted_path = module_name.replace(".", "/")
        
        candidates = [
            module_name,
            module_name + ".py",
            module_name + ".js",
            module_name + ".ts",
            module_name + ".tsx",
            os.path.join(curr_dir, module_name),
            os.path.join(curr_dir, module_name) + ".py",
            os.path.join(curr_dir, module_name) + ".js",
            os.path.join(curr_dir, module_name) + ".ts",
            os.path.join(curr_dir, module_name) + ".tsx",
            dotted_path,
            dotted_path + ".py",
            dotted_path + "/__init__.py"
        ]

        for candidate in candidates:
            # Normalize path
            norm = os.path.normpath(candidate)
            # Remove leading ./ or ../ if normpath left it or path is relative
            if norm.startswith("../") or norm.startswith("./"):
                # Make relative to repo root
                norm = os.path.normpath(os.path.join(curr_dir, candidate))
            
            if norm in all_files:
                return norm
                
        # Last resort: check if candidate is a prefix or contains file in all_files
        for f in all_files:
            if f.endswith(module_name) or module_name in f:
                return f

        return None

    def _resolve_callee_node_id(
        self,
        current_file: str,
        callee_name: str,
        local_funcs: list,
        imports: list,
        global_index: dict,
        repo_id: str,
        repo_path: str,
        all_files: list
    ) -> str | None:
        """Resolves a function call target node id."""
        # 1. Local resolution (is it defined in the same file?)
        for f in local_funcs:
            if f["name"] == callee_name:
                return f["id"]

        # 2. Check if imported explicitly
        for imp in imports:
            if callee_name in imp["imported_names"]:
                # The function is imported from imp['module']
                target_file = self._resolve_import_file_path(current_file, imp["module"], repo_path, all_files)
                if target_file:
                    # Look up if target_file contains this function
                    target_node_id = f"{repo_id}:function:{target_file}:{callee_name}"
                    # Quick check: does this function actually exist in global index?
                    for g_func in global_index.get(callee_name, []):
                        if g_func["file_path"] == target_file:
                            return g_func["id"]

        # 3. Global Fallback
        # If we can't find it via imports, check if there is a global function with this name.
        # If there is exactly one function with this name in the entire repository, it's highly likely to be it.
        # If there are multiple, we link to the one in the most logical file or the first one.
        global_candidates = global_index.get(callee_name, [])
        if len(global_candidates) == 1:
            return global_candidates[0]["id"]
        elif len(global_candidates) > 1:
            # Prefer functions in imports modules or sub-directories
            return global_candidates[0]["id"]

        return None
