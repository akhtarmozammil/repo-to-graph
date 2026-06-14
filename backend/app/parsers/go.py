import re
from tree_sitter import Language
import tree_sitter_go as tsgo
from backend.app.parsers.base import BaseParser

class GoParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tsgo.language()))

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Handle Struct Declarations (Go's class equivalent)
        if node_type == "type_spec":
            # type User struct { ... }
            name_node = node.child_by_field_name("name")
            type_node = node.child_by_field_name("type")
            if name_node and type_node and type_node.type == "struct_type":
                struct_name = self.get_node_text(name_node, code_bytes)
                if struct_name:
                    start_line = node.start_point[0] + 1
                    end_line = node.end_point[0] + 1
                    result["classes"].append({
                        "name": struct_name,
                        "start_line": start_line,
                        "end_line": end_line
                    })
                    # Set struct context
                    current_context = current_context.copy()
                    current_context["class"] = struct_name

        # 2. Handle Function Declarations
        elif node_type == "function_declaration":
            name_node = node.child_by_field_name("name")
            func_name = self.get_node_text(name_node, code_bytes)
            if func_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                result["functions"].append({
                    "name": func_name,
                    "class_name": None,
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": False
                })
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Handle Method Declarations (Associated with receiver structs)
        elif node_type == "method_declaration":
            name_node = node.child_by_field_name("name")
            receiver_node = node.child_by_field_name("receiver")
            func_name = self.get_node_text(name_node, code_bytes)
            
            if func_name and receiver_node:
                # Extract struct name from receiver: (r *Repo) Save() -> Repo
                struct_name = self._resolve_receiver_struct(receiver_node, code_bytes)
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                
                result["functions"].append({
                    "name": func_name,
                    "class_name": struct_name,
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": struct_name is not None
                })
                
                current_context = current_context.copy()
                current_context["class"] = struct_name
                current_context["function"] = func_name

        # 4. Handle Imports
        elif node_type == "import_spec":
            # e.g. import "fmt" or import alias "github.com/gin-gonic/gin"
            path_node = node.child_by_field_name("path")
            if path_node:
                path_text = self.get_node_text(path_node, code_bytes)
                # Clean quotes
                clean_path = path_text.strip('"')
                if clean_path:
                    result["imports"].append({
                        "module": clean_path,
                        "imported_names": [],
                        "start_line": node.start_point[0] + 1
                    })

        # 5. Handle Calls & API Endpoint Declarations
        elif node_type == "call_expression":
            func_node = node.child_by_field_name("function")
            callee = self._resolve_callee_name(func_node, code_bytes)
            if callee:
                caller = current_context["function"] or "global"
                result["calls"].append({
                    "caller": caller,
                    "callee": callee,
                    "line": node.start_point[0] + 1
                })
                
                # Check for routing frameworks: router.GET("/path", handler)
                self._check_go_api_calls(node, callee, code_bytes, result)

        # 6. Handle SQL string literals
        elif node_type in ("interpreted_string_literal", "raw_string_literal"):
            text = self.get_node_text(node, code_bytes)
            # Clean backticks and quotes
            clean_text = text.strip('`').strip('"')
            self._check_db_queries(clean_text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _resolve_receiver_struct(self, receiver_node, code_bytes: bytes) -> str | None:
        # receiver_node type is usually parameter_list
        # containing parameter_declaration
        for child in receiver_node.children:
            if child.type == "parameter_declaration":
                type_node = child.child_by_field_name("type")
                if type_node:
                    # Pointer receiver: *Repo
                    if type_node.type == "pointer_type":
                        element_node = type_node.child(1) # get element identifier
                        if element_node:
                            return self.get_node_text(element_node, code_bytes)
                    # Value receiver: Repo
                    else:
                        return self.get_node_text(type_node, code_bytes)
        return None

    def _resolve_callee_name(self, node, code_bytes: bytes) -> str | None:
        if not node:
            return None
        if node.type == "identifier":
            return self.get_node_text(node, code_bytes)
        elif node.type == "selector_expression":
            field_node = node.child_by_field_name("field")
            if field_node:
                return self.get_node_text(field_node, code_bytes)
        return None

    def _check_go_api_calls(self, call_node, callee: str, code_bytes: bytes, result: dict):
        # Match HTTP methods: GET, POST, PUT, DELETE, PATCH
        if callee.upper() not in ("GET", "POST", "PUT", "DELETE", "PATCH", "HANDLEFUNC", "HANDLE"):
            return

        # E.g., router.GET("/users", handler)
        # Check call arguments
        args_node = call_node.child_by_field_name("arguments")
        if args_node and len(args_node.children) > 1:
            # First argument is usually the path string
            # In tree-sitter-go, arguments starts with '(' and ends with ')'
            for child in args_node.children:
                if child.type in ("interpreted_string_literal", "raw_string_literal"):
                    path_text = self.get_node_text(child, code_bytes).strip('"').strip('`')
                    if path_text.startswith("/"):
                        result["apis"].append({
                            "method": "GET" if callee.upper() == "HANDLEFUNC" or callee.upper() == "HANDLE" else callee.upper(),
                            "path": path_text,
                            "start_line": call_node.start_point[0] + 1
                        })
                        break

    def _check_db_queries(self, text: str, current_func: str | None, line: int, result: dict):
        if not current_func:
            return
        
        sql_patterns = [
            (r"\bSELECT\b.*?\bFROM\b\s+([a-zA-Z0-9_]+)", "SELECT"),
            (r"\bINSERT\s+INTO\b\s+([a-zA-Z0-9_]+)", "INSERT"),
            (r"\bUPDATE\b\s+([a-zA-Z0-9_]+)\s+\bSET\b", "UPDATE"),
            (r"\bDELETE\s+FROM\b\s+([a-zA-Z0-9_]+)", "DELETE")
        ]
        
        for pattern, operation in sql_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE | re.DOTALL)
            for m in matches:
                table_name = m.group(1)
                if table_name.upper() not in ("SELECT", "FROM", "WHERE", "JOIN", "SET"):
                    result["db_queries"].append({
                        "table": table_name,
                        "operation": operation,
                        "start_line": line
                    })
