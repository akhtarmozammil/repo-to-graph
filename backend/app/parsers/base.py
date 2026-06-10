import logging
from tree_sitter import Language, Parser

logger = logging.getLogger(__name__)

class BaseParser:
    def __init__(self, language: Language):
        self.parser = Parser(language)

    def get_node_text(self, node, code_bytes: bytes) -> str:
        """Helper to extract UTF-8 text from an AST node."""
        if not node:
            return ""
        return code_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="ignore")

    def parse(self, code: str, file_path: str = "") -> dict:
        """
        Parses code string and returns metadata dictionary.
        Must be implemented by subclasses.
        Returns:
            {
                "classes": [ {"name": str, "start_line": int, "end_line": int} ],
                "functions": [ {"name": str, "class_name": str, "start_line": int, "end_line": int, "is_method": bool} ],
                "imports": [ {"module": str, "imported_names": list, "start_line": int} ],
                "calls": [ {"caller": str, "callee": str, "line": int} ],
                "apis": [ {"method": str, "path": str, "start_line": int} ],
                "db_queries": [ {"table": str, "operation": str, "start_line": int} ]
            }
        """
        code_bytes = code.encode("utf-8")
        tree = self.parser.parse(code_bytes)
        
        result = {
            "classes": [],
            "functions": [],
            "imports": [],
            "calls": [],
            "apis": [],
            "db_queries": []
        }
        
        self.traverse(tree.root_node, code_bytes, result, current_context={"class": None, "function": None})
        return result

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        """
        Recursively walk the AST and populate result.
        Must be implemented by subclass for language specific syntax nodes.
        """
        raise NotImplementedError("Subclasses must implement traverse()")
