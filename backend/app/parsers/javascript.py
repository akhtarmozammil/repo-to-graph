import re
from tree_sitter import Language
import tree_sitter_javascript as tsjavascript
from backend.app.parsers.base import BaseParser

class JavascriptParser(BaseParser):
    def __init__(self, language: Language = None):
        if language is None:
            language = Language(tsjavascript.language())
        super().__init__(language)

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Class Declaration
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

        # 2. Function Declarations (standard named functions)
        elif node_type == "function_declaration":
            name_node = node.child_by_field_name("name")
            func_name = self.get_node_text(name_node, code_bytes)
            if func_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                result["functions"].append({
                    "name": func_name,
                    "class_name": current_context["class"],
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": current_context["class"] is not None
                })
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Class Method Definitions
        elif node_type == "method_definition":
            name_node = node.child_by_field_name("name")
            func_name = self.get_node_text(name_node, code_bytes)
            if func_name:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1
                result["functions"].append({
                    "name": func_name,
                    "class_name": current_context["class"],
                    "start_line": start_line,
                    "end_line": end_line,
                    "is_method": True
                })
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 4. Arrow Functions & Anonymous Function Expressions
        elif node_type in ("arrow_function", "function_expression"):
            func_name = self._resolve_anonymous_func_name(node, code_bytes)
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            
            result["functions"].append({
                "name": func_name,
                "class_name": current_context["class"],
                "start_line": start_line,
                "end_line": end_line,
                "is_method": current_context["class"] is not None
            })
            current_context = current_context.copy()
            current_context["function"] = func_name

        # 5. Imports (ES6 imports)
        elif node_type == "import_statement":
            text = self.get_node_text(node, code_bytes)
            match = re.match(r"import\s+(?:(.+?)\s+from\s+)?(['\"])(.*?)\2", text)
            if match:
                module = match.group(3)
                imports_raw = match.group(1) or ""
                imported_names = [
                    name.strip()
                    for name in re.split(r"[\{,\}\s]+", imports_raw)
                    if name.strip() and name.strip() not in ("import", "from", "*", "as")
                ]
                result["imports"].append({
                    "module": module,
                    "imported_names": imported_names,
                    "start_line": node.start_point[0] + 1
                })

        # 6. Call Expressions & CommonJS require
        elif node_type == "call_expression":
            func_node = node.child_by_field_name("function")
            
            # CommonJS require
            if func_node and func_node.type == "identifier" and self.get_node_text(func_node, code_bytes) == "require":
                arguments = node.child_by_field_name("arguments")
                if arguments and len(arguments.children) > 1:
                    module_node = arguments.children[1]
                    module_text = self.get_node_text(module_node, code_bytes).strip("'\"")
                    result["imports"].append({
                        "module": module_text,
                        "imported_names": [],
                        "start_line": node.start_point[0] + 1
                    })

            callee = self._resolve_callee_name(func_node, code_bytes)
            if callee:
                caller = current_context["function"] or "global"
                result["calls"].append({
                    "caller": caller,
                    "callee": callee,
                    "line": node.start_point[0] + 1
                })
                
                # Check for Express API endpoint registration
                self._check_express_endpoint(func_node, node, code_bytes, result)

        # 7. Database queries
        elif node_type in ("string", "template_string", "string_fragment"):
            text = self.get_node_text(node, code_bytes)
            self._check_db_queries(text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through all children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _resolve_callee_name(self, node, code_bytes: bytes) -> str | None:
        if not node:
            return None
        if node.type == "identifier":
            return self.get_node_text(node, code_bytes)
        elif node.type == "member_expression":
            property_node = node.child_by_field_name("property")
            return self.get_node_text(property_node, code_bytes)
        return None

    def _resolve_anonymous_func_name(self, node, code_bytes: bytes) -> str:
        parent = node.parent
        start_line = node.start_point[0] + 1
        
        if not parent:
            return f"anonymous_fn_line_{start_line}"

        # Pattern: const foo = () => {}
        if parent.type == "variable_declarator":
            name_node = parent.child_by_field_name("name")
            name = self.get_node_text(name_node, code_bytes)
            if name:
                return name

        # Pattern: foo = () => {} (assignment)
        elif parent.type == "assignment_expression":
            left_node = parent.child_by_field_name("left")
            name = self.get_node_text(left_node, code_bytes)
            if name:
                # if member expression e.g. user_service.save, get last part
                if "." in name:
                    return name.split(".")[-1]
                return name

        # Pattern: { save: () => {} } (object literal key/pair)
        elif parent.type == "pair":
            key_node = parent.child_by_field_name("key")
            name = self.get_node_text(key_node, code_bytes)
            if name:
                return name

        # Pattern: app.post('/register', async (req, res) => {})
        elif parent.type == "arguments":
            call_expr = parent.parent
            if call_expr and call_expr.type == "call_expression":
                func_node = call_expr.child_by_field_name("function")
                if func_node and func_node.type == "member_expression":
                    obj_node = func_node.child_by_field_name("object")
                    prop_node = func_node.child_by_field_name("property")
                    
                    obj_name = self.get_node_text(obj_node, code_bytes)
                    method = self.get_node_text(prop_node, code_bytes).upper()
                    
                    if obj_name in ("app", "router", "route", "server") and method in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                        # Get path from first argument
                        first_arg = parent.children[1]
                        if first_arg.type in ("string", "template_string"):
                            path_str = self.get_node_text(first_arg, code_bytes).strip("'\"`")
                            # Normalize path characters to make a clean function name
                            clean_path = re.sub(r"[^a-zA-Z0-9]", "_", path_str).strip("_")
                            return f"route_handler_{method}_{clean_path}"

        return f"anonymous_fn_line_{start_line}"

    def _check_express_endpoint(self, func_node, call_node, code_bytes: bytes, result: dict):
        if not func_node or func_node.type != "member_expression":
            return
        
        obj_node = func_node.child_by_field_name("object")
        prop_node = func_node.child_by_field_name("property")
        
        obj_name = self.get_node_text(obj_node, code_bytes)
        method = self.get_node_text(prop_node, code_bytes).upper()
        
        if obj_name in ("app", "router", "route", "server") and method in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            arguments_node = call_node.child_by_field_name("arguments")
            if arguments_node and len(arguments_node.children) > 1:
                first_arg = arguments_node.children[1]
                if first_arg.type in ("string", "template_string"):
                    path = self.get_node_text(first_arg, code_bytes).strip("'\"`")
                    result["apis"].append({
                        "method": method,
                        "path": path,
                        "start_line": call_node.start_point[0] + 1
                    })

    def _check_db_queries(self, text: str, current_func: str | None, line: int, result: dict):
        # Allow global/anonymous scope SQL detection as well
        func_context = current_func or "global"
        
        clean_text = text.strip("`'\"")
        
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
                if table_name.upper() not in ("SELECT", "FROM", "WHERE", "JOIN", "SET"):
                    result["db_queries"].append({
                        "table": table_name,
                        "operation": operation,
                        "start_line": line
                    })
