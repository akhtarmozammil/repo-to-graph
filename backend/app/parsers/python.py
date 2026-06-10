import re
from tree_sitter import Language
import tree_sitter_python as tspython
from backend.app.parsers.base import BaseParser

class PythonParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tspython.language()))

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Handle Class Definitions
        if node_type == "class_definition":
            name_node = node.child_by_field_name("name")
            class_name = self.get_node_text(name_node, code_bytes)
            if class_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                result["classes"].append({
                    "name": class_name,
                    "start_line": start_line,
                    "end_line": end_line
                })
                # Set class context for children
                current_context = current_context.copy()
                current_context["class"] = class_name

        # 2. Handle Function Definitions
        elif node_type == "function_definition":
            name_node = node.child_by_field_name("name")
            func_name = self.get_node_text(name_node, code_bytes)
            if func_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                is_method = current_context["class"] is not None
                
                result["functions"].append({
                    "name": func_name,
                    "class_name": current_context["class"],
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": is_method
                })
                
                # Check for API endpoints in decorators
                self._check_api_decorators(node, code_bytes, result, start_line)
                
                # Set function context for parsing calls/DB inside it
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Handle Imports
        elif node_type == "import_statement":
            # e.g., import os, sys
            text = self.get_node_text(node, code_bytes)
            # Simple regex parser for import names
            modules = re.findall(r"import\s+([a-zA-Z0-9_\.,\s]+)", text)
            if modules:
                for mod_group in modules:
                    for mod in mod_group.split(","):
                        mod_name = mod.strip().split(" as ")[0].strip()
                        if mod_name:
                            result["imports"].append({
                                "module": mod_name,
                                "imported_names": [],
                                "start_line": node.start_point[0] + 1
                            })

        elif node_type == "import_from_statement":
            # e.g., from datetime import datetime, timezone
            text = self.get_node_text(node, code_bytes)
            match = re.match(r"from\s+([a-zA-Z0-9_\.]+)\s+import\s+(.+)", text)
            if match:
                module = match.group(1).strip()
                imports_raw = match.group(2).strip()
                imported_names = [
                    name.strip().split(" as ")[0].strip()
                    for name in re.split(r"[\(,\)\s]+", imports_raw)
                    if name.strip()
                ]
                result["imports"].append({
                    "module": module,
                    "imported_names": imported_names,
                    "start_line": node.start_point[0] + 1
                })

        # 4. Handle Function Calls
        elif node_type == "call":
            func_node = node.child_by_field_name("function")
            callee = self._resolve_callee_name(func_node, code_bytes)
            if callee:
                caller = current_context["function"] or "global"
                result["calls"].append({
                    "caller": caller,
                    "callee": callee,
                    "line": node.start_point[0] + 1
                })

        # 5. Handle SQL Queries inside strings
        elif node_type in ("string", "string_content", "concatenated_string"):
            text = self.get_node_text(node, code_bytes)
            self._check_db_queries(text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through all children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _resolve_callee_name(self, node, code_bytes: bytes) -> str | None:
        if not node:
            return None
        
        # Simple identifier: save_user()
        if node.type == "identifier":
            return self.get_node_text(node, code_bytes)
        
        # Attribute call: user_service.save_user() or self.save_user()
        elif node.type == "attribute":
            attribute_node = node.child_by_field_name("attribute")
            # We want the method name itself to easily link callers to functions.
            # E.g. self.save_user() -> save_user
            return self.get_node_text(attribute_node, code_bytes)
            
        return None

    def _check_api_decorators(self, func_node, code_bytes: bytes, result: dict, start_line: int):
        # In tree-sitter-python, decorators are usually children of a parent decorated_definition node,
        # but sometimes decorators are on the function node itself if it's parsed as part of a block.
        # Let's search upstream or look for sibling nodes if needed.
        # However, a cleaner way is: decorators are inside the parent decorated_definition.
        parent = func_node.parent
        if parent and parent.type == "decorated_definition":
            for sibling in parent.children:
                if sibling.type == "decorator":
                    decorator_text = self.get_node_text(sibling, code_bytes)
                    # Detect route decorators: @app.get("/path"), @router.post("/path"), etc.
                    # Match HTTP methods: get, post, put, delete, patch
                    match = re.search(
                        r"\.(get|post|put|delete|patch)\s*\(\s*(['\"])(.*?)\2", 
                        decorator_text, 
                        re.IGNORECASE
                    )
                    if match:
                        method = match.group(1).upper()
                        path = match.group(3)
                        result["apis"].append({
                            "method": method,
                            "path": path,
                            "start_line": start_line
                        })

    def _check_db_queries(self, text: str, current_func: str | None, line: int, result: dict):
        if not current_func:
            return
        
        # Clean quotes and docstring indicators
        clean_text = text.replace('"""', '').replace("'''", "").strip()
        
        # Look for SQL commands: SELECT, INSERT, UPDATE, DELETE
        # E.g. SELECT * FROM users
        # E.g. INSERT INTO orders
        sql_patterns = [
            (r"\bSELECT\b.*?\bFROM\b\s+([a-zA-Z0-9_]+)", "SELECT"),
            (r"\bINSERT\s+INTO\b\s+([a-zA-Z0-9_]+)", "INSERT"),
            (r"\bUPDATE\b\s+([a-zA-Z0-9_]+)\s+\bSET\b", "UPDATE"),
            (r"\bDELETE\s+FROM\b\s+([a-zA-Z0-9_]+)", "DELETE")
        ]
        
        for pattern, operation in sql_patterns:
            matches = re.finditer(pattern, clean_text, re.IGNORECASE | re.DOTALL)
            for m in matches:
                table_name = m.group(1)
                # Ensure it's not a false positive like SQL keywords
                if table_name.upper() not in ("SELECT", "FROM", "WHERE", "JOIN", "SET"):
                    result["db_queries"].append({
                        "table": table_name,
                        "operation": operation,
                        "start_line": line
                    })
