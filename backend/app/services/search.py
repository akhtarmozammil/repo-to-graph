from sqlalchemy.orm import Session
from backend.app.models.database import Node

class SearchService:
    @staticmethod
    def search_nodes(db: Session, repository_id: str, query: str) -> list[dict]:
        """
        Searches nodes by name, file_path, or type.
        Returns matching nodes.
        """
        if not query:
            return []

        search_filter = f"%{query}%"
        matches = db.query(Node).filter(
            Node.repository_id == repository_id,
            (Node.name.like(search_filter) |
             Node.file_path.like(search_filter) |
             Node.type.like(search_filter) |
             Node.properties_json.like(search_filter))
        ).all()

        results = []
        for node in matches:
            results.append({
                "id": node.id,
                "name": node.name,
                "type": node.type,
                "file_path": node.file_path,
                "start_line": node.start_line,
                "end_line": node.end_line,
                "properties": node.properties
            })

        return results
