from tree_sitter import Language
import tree_sitter_typescript as tstypescript
from backend.app.parsers.javascript import JavascriptParser

class TypescriptParser(JavascriptParser):
    def __init__(self):
        # Use tree-sitter-typescript grammar
        super().__init__(Language(tstypescript.language_typescript()))
