import json
from sqlalchemy.orm import Session
from backend.app.models.database import Node, Edge

def clear_graph(db: Session, repository_id: str):
    """Deletes all nodes and edges associated with a repository."""
    db.query(Edge).filter(Edge.repository_id == repository_id).delete(synchronize_session=False)
    db.query(Node).filter(Node.repository_id == repository_id).delete(synchronize_session=False)
    db.commit()

def bulk_insert_graph(db: Session, nodes: list[dict], edges: list[dict]):
    """
    Inserts nodes and edges in batch transactions for extreme speed.
    nodes format: [{id, repository_id, name, type, file_path, start_line, end_line, properties}]
    edges format: [{repository_id, source_id, target_id, type, properties}]
    """
    # 1. Prepare node objects
    node_objs = []
    for n in nodes:
        node_objs.append(Node(
            id=n["id"],
            repository_id=n["repository_id"],
            name=n["name"],
            type=n["type"],
            file_path=n.get("file_path"),
            start_line=n.get("start_line"),
            end_line=n.get("end_line"),
            properties_json=json.dumps(n.get("properties", {}))
        ))
        
    # 2. Prepare edge objects
    edge_objs = []
    for e in edges:
        edge_objs.append(Edge(
            repository_id=e["repository_id"],
            source_id=e["source_id"],
            target_id=e["target_id"],
            type=e["type"],
            properties_json=json.dumps(e.get("properties", {}))
        ))

    # Bulk save to DB
    if node_objs:
        db.bulk_save_objects(node_objs)
    if edge_objs:
        db.bulk_save_objects(edge_objs)
        
    db.commit()
