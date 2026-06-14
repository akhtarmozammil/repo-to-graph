import re
from tree_sitter import Language
import tree_sitter_ruby as tsruby
from backend.app.parsers.base import BaseParser

class RubyParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tsruby.language()))

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Handle Class Definitions
        if node_type == "class":
            # class User < ActiveRecord::Base
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

        # 2. Handle Method Definitions
        elif node_type in ("method", "singleton_method"):
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
                
                current_context = current_context.copy()
                current_context["function"] = func_name

        # 3. Handle Method Calls & API Routing & Imports
        elif node_type in ("call", "command", "method_call"):
            # E.g. require 'db' or get '/users'
            method_node = node.child_by_field_name("method")
            if not method_node:
                # In command nodes, the first child might be the identifier for method name
                method_node = node.child(0)
            
            method_name = self.get_node_text(method_node, code_bytes)
            if method_name:
                caller = current_context["function"] or "global"
                
                # Check if it's an import call
                if method_name in ("require", "require_relative", "load"):
                    # Check arguments
                    args_node = node.child_by_field_name("arguments")
                    if not args_node and len(node.children) > 1:
                        args_node = node.child(1)
                    if args_node:
                        arg_text = self.get_node_text(args_node, code_bytes).strip("'\"")
                        result["imports"].append({
                            "module": arg_text,
                            "imported_names": [],
                            "start_line": node.start_point[0] + 1
                        })
                # Check if it's a standard call
                else:
                    result["calls"].append({
                        "caller": caller,
                        "callee": method_name,
                        "line": node.start_point[0] + 1
                    })
                    
                    # Check for API Routing calls (Sinatra / Rails controllers style)
                    # get '/path' or post '/path'
                    self._check_ruby_api_calls(node, method_name, code_bytes, result)

        # 4. Handle SQL string literals
        elif node_type in ("string_content", "heredoc_body"):
            text = self.get_node_text(node, code_bytes)
            # Clean quotes
            clean_text = text.strip("'\"`").strip()
            self._check_db_queries(clean_text, current_context["function"], node.start_point[0] + 1, result)

        # Recurse through children
        for child in node.children:
            self.traverse(child, code_bytes, result, current_context)

    def _check_ruby_api_calls(self, call_node, callee: str, code_bytes: bytes, result: dict):
        if callee.upper() not in ("GET", "POST", "PUT", "DELETE", "PATCH"):
            return

        # Check arguments (usually a string path followed by block/handler)
        # E.g. get '/users' do ... end
        args_node = call_node.child_by_field_name("arguments")
        if not args_node and len(call_node.children) > 1:
            # Command nodes arguments might be the second child
            args_node = call_node.child(1)

        if args_node:
            first_arg = args_node.child(0) if args_node.children else args_node
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
