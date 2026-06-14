import re
from tree_sitter import Language
import tree_sitter_hcl as tshcl
from backend.app.parsers.base import BaseParser

class TerraformParser(BaseParser):
    def __init__(self):
        super().__init__(Language(tshcl.language()))

    def traverse(self, node, code_bytes: bytes, result: dict, current_context: dict):
        node_type = node.type

        # 1. Handle Blocks (resource, module, provider, data, variable, output)
        if node_type == "block":
            block_type = ""
            labels = []
            body_node = None

            for child in node.children:
                if child.type == "identifier":
                    if not block_type:
                        block_type = self.get_node_text(child, code_bytes)
                elif child.type == "string_lit":
                    # In tree-sitter-hcl, labels are string_lit nodes containing template_literal
                    # e.g., "aws_subnet" -> we want to strip the outer quotes
                    label = self.get_node_text(child, code_bytes).strip('"')
                    labels.append(label)
                elif child.type == "body":
                    body_node = child

            if block_type:
                start_line = node.start_point[0] + 1
                end_line = node.end_point[0] + 1

                # If resource or data source, map as Class
                if block_type in ("resource", "data"):
                    # E.g. resource "aws_instance" "web" -> class name: "aws_instance.web"
                    label_str = ".".join(labels) if labels else "unnamed"
                    class_name = f"{block_type}.{label_str}" if block_type == "data" else label_str
                    
                    result["classes"].append({
                        "name": class_name,
                        "start_line": start_line,
                        "end_line": end_line
                    })

                    current_context = current_context.copy()
                    current_context["class"] = class_name
                    current_context["function"] = None

                    # Parse attributes inside block body
                    if body_node:
                        self._parse_hcl_body(body_node, code_bytes, class_name, result)

                # If module block, map as Import
                elif block_type == "module" and labels:
                    module_name = labels[0]
                    # Find source attribute inside block body
                    source_val = ""
                    if body_node:
                        for sub in body_node.children:
                            if sub.type == "attribute":
                                # Extract key and val dynamically
                                key_node = None
                                val_node = None
                                for attr_child in sub.children:
                                    if attr_child.type == "identifier":
                                        if not key_node:
                                            key_node = attr_child
                                    elif attr_child.type == "expression":
                                        val_node = attr_child
                                        
                                if key_node and val_node:
                                    key_name = self.get_node_text(key_node, code_bytes)
                                    if key_name == "source":
                                        source_val = self.get_node_text(val_node, code_bytes).strip('"')
                                        break
                    
                    result["imports"].append({
                        "module": source_val or f"module.{module_name}",
                        "imported_names": [module_name],
                        "start_line": start_line
                    })

        # Recurse through children (only if not a block, since block body is parsed customly)
        if node_type != "block":
            for child in node.children:
                self.traverse(child, code_bytes, result, current_context)

    def _parse_hcl_body(self, body_node, code_bytes: bytes, resource_name: str, result: dict):
        # Traverse attributes inside body object to find variable/resource references (dependencies)
        for child in body_node.children:
            if child.type == "attribute":
                # Find expression value child dynamically
                val_node = None
                for sub in child.children:
                    if sub.type == "expression":
                        val_node = sub
                        break
                        
                if val_node:
                    val_text = self.get_node_text(val_node, code_bytes)
                    
                    # Look for references like aws_subnet.main.id, module.vpc.vpc_id, var.subnet_prefix
                    # E.g. matches resource_type.resource_name.attribute
                    ref_matches = re.finditer(r"\b([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)(?:\.[a-zA-Z0-9_-]+)*\b", val_text)
                    for match in ref_matches:
                        ref_type = match.group(1)
                        ref_name = match.group(2)
                        
                        # Handle module dependencies explicitly
                        if ref_type == "module":
                            target_resource = f"module.{ref_name}"
                            result["calls"].append({
                                "caller": resource_name,
                                "callee": target_resource,
                                "line": child.start_point[0] + 1
                            })
                        # Filter out common false keywords (var, local, count, each, path)
                        elif ref_type not in ("var", "local", "count", "each", "path"):
                            target_resource = f"{ref_type}.{ref_name}"
                            result["calls"].append({
                                "caller": resource_name,
                                "callee": target_resource,
                                "line": child.start_point[0] + 1
                            })
