import os
import logging
import google.generativeai as genai
from sqlalchemy.orm import Session
from backend.app.models.database import Node, Repository
from backend.app.services.search import SearchService

logger = logging.getLogger(__name__)

# Configure Google Generative AI
GEMINI_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
else:
    logger.warning("GEMINI_API_KEY is not set. AI functions will run in demo/fallback mode.")

class AIService:
    @staticmethod
    def _get_code_snippet(repo_path: str, file_path: str, start_line: int | None, end_line: int | None) -> str:
        """Helper to extract a code snippet from a file."""
        if not file_path or start_line is None or end_line is None:
            return ""
        
        abs_path = os.path.join(repo_path, file_path)
        if not os.path.exists(abs_path):
            return f"[Error: File {file_path} not found]"

        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                # 1-indexed lines
                snippet_lines = lines[max(0, start_line - 1) : min(len(lines), end_line)]
                return "".join(snippet_lines)
        except Exception as e:
            return f"[Error reading file: {e}]"

    @classmethod
    def explain_node(cls, db: Session, repository_id: str, node_id: str) -> str:
        """Generates an explanation of a function or class using Gemini."""
        node = db.query(Node).filter(Node.repository_id == repository_id, Node.id == node_id).first()
        repo = db.query(Repository).filter(Repository.id == repository_id).first()
        
        if not node or not repo:
            return "Node or Repository not found."

        # Extract code snippet
        snippet = cls._get_code_snippet(repo.local_path, node.file_path, node.start_line, node.end_line)
        if not snippet:
            return f"No source code available for node '{node.name}' (type: {node.type})."

        prompt = f"""
You are an expert software developer and code analyst.
Analyze the following code snippet of a {node.type} named '{node.name}' from file '{node.file_path}'.

Provide a concise explanation of:
1. What this code does and its primary purpose.
2. Its inputs and outputs (if applicable).
3. Design patterns, databases, or third-party APIs it utilizes.

Snippet:
```
{snippet}
```
"""
        if not GEMINI_KEY:
            # Fallback explanation if API key is not present
            return f"**[Demo Mode - API Key Missing]**\nThis is a {node.type} named `{node.name}` located in `{node.file_path}` lines {node.start_line}-{node.end_line}.\nProvide a `GEMINI_API_KEY` to enable AI explanations!"

        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            return f"Error calling Gemini AI: {e}"

    @classmethod
    def chat_with_repository(cls, db: Session, repository_id: str, message: str) -> str:
        """
        Chats with a repository by retrieving relevant file snippets
        using keyword searches on the graph, then prompting Gemini.
        """
        repo = db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            return "Repository not found."

        # 1. Extract keywords from message to search the graph
        # Clean query, split into terms
        search_terms = [t.strip() for t in message.lower().split() if len(t.strip()) > 3]
        
        # If no terms, default to repo name
        if not search_terms:
            search_terms = [repo.name]

        # Retrieve relevant nodes based on search keywords
        relevant_nodes = []
        for term in search_terms[:3]:  # search up to 3 terms
            nodes = SearchService.search_nodes(db, repository_id, term)
            relevant_nodes.extend(nodes)

        # Remove duplicates
        seen_nodes = set()
        unique_nodes = []
        for n in relevant_nodes:
            if n["id"] not in seen_nodes and n["type"] in ("function", "class", "file"):
                seen_nodes.add(n["id"])
                unique_nodes.append(n)

        # 2. Gather code snippets for the top 5 relevant nodes
        context_snippets = []
        for node in unique_nodes[:5]:
            snippet = cls._get_code_snippet(repo.local_path, node["file_path"], node["start_line"], node["end_line"])
            if snippet:
                context_snippets.append(
                    f"--- File: {node['file_path']} | Type: {node['type']} | Name: {node['name']} ---\n{snippet}"
                )

        context_text = "\n\n".join(context_snippets) if context_snippets else "No matching source code found in the repository index."

        prompt = f"""
You are an AI assistant helping a developer understand their codebase.
Here is some retrieved context from the repository:

{context_text}

Answer the following user question using the retrieved code context. Be clear, technical, and refer to specific files and functions if possible.
Question: "{message}"
"""

        if not GEMINI_KEY:
            return f"**[Demo Mode - API Key Missing]**\nBased on graph search, we found these relevant nodes: {', '.join([n['name'] for n in unique_nodes[:5]])}.\nConfigure `GEMINI_API_KEY` to enable Gemini repository chat answers!"

        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            return f"Error calling Gemini AI: {e}"
