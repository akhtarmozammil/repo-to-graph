import re
from tree_sitter import Language
import tree_sitter_java as tsjava
from backend.app.parsers.base import BaseParser

class JavaParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tsjava.language()))

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

        # 2. Handle Method Declarations
        elif node_type == "method_declaration":
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
                
                # Check for API annotations (e.g. @GetMapping, @PostMapping, etc.)
                self._check_java_annotations(node, code_bytes, result, start_line)
                
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Handle Imports
        elif node_type == "import_declaration":
            # import java.util.List;
            # In tree-sitter-java, imports have children that compose the full package name
            text = self.get_node_text(node, code_bytes)
            # Clean "import" keyword and trailing ";"
            clean_text = text.replace("import", "").replace(";", "").strip()
            if clean_text:
                result["imports"].append({
                    "module": clean_text,
                    "imported_names": [],
                    "start_line": node.start_point[0] + 1
                })

        # 4. Handle Method Invocations
        elif node_type == "method_invocation":
            name_node = node.child_by_field_name("name")
            callee = self.get_node_text(name_node, code_bytes)
            if callee:
                caller = current_context["function"] or "global"
                result["calls"].append({
                    "caller": caller,
                    "callee": callee,
                    "line": node.start_point[0] + 1
                })

        # 5. Handle SQL Queries inside string literals
        elif node_type == "string_literal":
            text = self.get_node_text(node, code_bytes)
            clean_text = text.strip('"')
            self._check_db_queries(clean_text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _check_java_annotations(self, method_node, code_bytes: bytes, result: dict, start_line: int):
        # In tree-sitter-java, modifiers and annotations are not named fields.
        # Find the first child of type 'modifiers'
        modifiers = None
        for child in method_node.children:
            if child.type == "modifiers":
                modifiers = child
                break

        if not modifiers:
            return

        for child in modifiers.children:
            if child.type == "annotation":
                # E.g. @GetMapping("/users") or @RequestMapping(value = "/users", method = RequestMethod.POST)
                annotation_text = self.get_node_text(child, code_bytes)
                
                # Simple Spring mapping
                # Match e.g. @GetMapping("/path") or @GetMapping(value = "/path")
                match_spring = re.match(
                    r"@(?:(Get|Post|Put|Delete|Patch)Mapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?(['\"])(.*?)\2",
                    annotation_text,
                    re.IGNORECASE
                )
                if match_spring:
                    mapping_type = match_spring.group(1)
                    method = mapping_type.upper() if mapping_type else "GET"
                    path = match_spring.group(3)
                    result["apis"].append({
                        "method": method,
                        "path": path,
                        "start_line": start_line
                    })
                    continue

                # Match JAX-RS style @Path("/path") + @GET/@POST
                match_jax = re.match(r"@Path\s*\(\s*(['\"])(.*?)\1", annotation_text)
                if match_jax:
                    path = match_jax.group(2)
                    # Find sibling GET/POST annotation
                    method = "GET"
                    for sibling in modifiers.children:
                        if sibling.type == "annotation":
                            sib_text = self.get_node_text(sibling, code_bytes)
                            if "@POST" in sib_text.upper():
                                method = "POST"
                            elif "@PUT" in sib_text.upper():
                                method = "PUT"
                            elif "@DELETE" in sib_text.upper():
                                method = "DELETE"
                    result["apis"].append({
                        "method": method,
                        "path": path,
                        "start_line": start_line
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
