import re
from tree_sitter import Language
import tree_sitter_php as tsphp
from backend.app.parsers.base import BaseParser

class PhpParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tsphp.language_php()))

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Handle Class Declarations
        if node_type == "class_declaration":
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
                current_context = current_context.copy()
                current_context["class"] = class_name

        # 2. Handle Method & Function Definitions
        elif node_type in ("method_declaration", "function_definition"):
            name_node = node.child_by_field_name("name")
            func_name = self.get_node_text(name_node, code_bytes)
            if func_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                is_method = node_type == "method_declaration"
                
                result["functions"].append({
                    "name": func_name,
                    "class_name": current_context["class"] if is_method else None,
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": is_method
                })
                
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Handle Namespace Use Declarations & Include/Require Expressions
        elif node_type == "namespace_use_clause":
            # use App\Services\UserService;
            text = self.get_node_text(node, code_bytes)
            if text:
                result["imports"].append({
                    "module": text,
                    "imported_names": [],
                    "start_line": node.start_point[0] + 1
                })

        elif node_type in ("require_expression", "include_expression", "require_once_expression", "include_once_expression"):
            # require_once 'config.php';
            # In tree-sitter-php, the argument is usually the first child after the keyword
            arg_node = node.child(1)
            if arg_node:
                arg_text = self.get_node_text(arg_node, code_bytes).strip("'\"")
                result["imports"].append({
                    "module": arg_text,
                    "imported_names": [],
                    "start_line": node.start_point[0] + 1
                })

        # 4. Handle Function / Member Calls & API Routing
        elif node_type in ("function_call_expression", "member_call_expression", "scoped_call_expression"):
            name_node = node.child_by_field_name("name")
            if not name_node:
                # Fallback to children search if name field is not matched directly
                name_node = node.child(0)

            callee = self.get_node_text(name_node, code_bytes)
            # Remove any prefix like -> or ::
            callee_clean = callee.replace("->", "").replace("::", "").strip() if callee else None
            
            if callee_clean:
                caller = current_context["function"] or "global"
                result["calls"].append({
                    "caller": caller,
                    "callee": callee_clean,
                    "line": node.start_point[0] + 1
                })
                
                # Check for routing (e.g. Laravel Route::get('/path', ...))
                self._check_php_api_calls(node, callee_clean, code_bytes, result)

        # 5. Handle SQL string literals
        elif node_type in ("string", "string_value", "encapsed_string"):
            text = self.get_node_text(node, code_bytes)
            # Clean quotes
            clean_text = text.strip("'\"").strip()
            self._check_db_queries(clean_text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _check_php_api_calls(self, call_node, callee: str, code_bytes: bytes, result: dict):
        if callee.upper() not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            return

        # Check call arguments (usually starts with a string path)
        # E.g. Route::get('/users', ...) or $router->get('/users', ...)
        arguments = call_node.child_by_field_name("arguments")
        if arguments and len(arguments.children) > 1:
            # First argument is usually the path string
            first_arg = arguments.child(1) # Index 0 is '('
            path_text = self.get_node_text(first_arg, code_bytes).strip("'\"")
            if path_text.startswith("/"):
                result["apis"].append({
                    "method": callee.upper(),
                    "path": path_text,
                    "start_line": call_node.start_point[0] + 1
                })

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
