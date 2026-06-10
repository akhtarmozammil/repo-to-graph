# Project Walkthrough - repo-to-graph

We have successfully built **repo-to-graph** (Version 1, Option B: Zero-Dependency SQLite Stack). The project is organized into a FastAPI backend service and a Next.js 15 frontend web app.

---

## Architectural Deliverables

Here is a summary of the files created and their roles:

### 1. Backend Service (`backend/`)
- [requirements.txt](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/requirements.txt): Pinned backend packages, customized for macOS arm64 support.
- [config.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/config.py): Configuration manager for workspace paths and AI credentials.
- [db.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/database/db.py) & [database.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/models/database.py): Relational metadata tables (`repositories`, `scans`) and graph index tables (`nodes`, `edges`) stored in a local SQLite file (`repo_to_graph.db`).
- [graph_db.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/database/graph_db.py): High-performance bulk database transaction inserts for scanned AST objects.
- [base.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/parsers/base.py): Abstract Tree-sitter walk and traversal framework.
- [python.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/parsers/python.py), [javascript.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/parsers/javascript.py) & [typescript.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/parsers/typescript.py): Syntactical AST parsers extracting classes, functions, calls, imports, Express/FastAPI routes, and raw SQL queries.
- [cloner.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/services/cloner.py): Clones remote repos via Git or validates local path folders.
- [parser.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/services/parser.py): Directory parsing orchestrator. Computes relative imports and resolves local/global caller-callee bindings.
- [graph.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/services/graph.py): Core NetworkX-powered graph service computing call trees, simple cycles, and upstream/downstream refactoring blast radius.
- [search.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/services/search.py): Code symbol search using SQL LIKE statements.
- [ai.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/services/ai.py): Interface with Gemini 2.5 Flash for node explanation and codebase chat.
- [endpoints.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/api/endpoints.py) & [main.py](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/backend/app/main.py): Registers FastAPI routing handlers. Launches scans as async background processes.

### 2. Frontend Interface (`frontend/`)
- [globals.css](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/app/globals.css): Premium design system configuring custom scrollbars, dark mode glows, glassmorphism cards, and React Flow visual controls.
- [page.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/app/page.tsx): Main dashboard allowing local folder upload or remote Git cloning, displaying list of tracked projects and scan statuses.
- [GraphCanvas.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/components/graph/GraphCanvas.tsx): Render window mapping nodes with color schemes (indigo for Repo, amber for Folder, slate for File, cyan for Class, purple for Function, rose for API, teal for Table) and arranging them left-to-right (APIs -> Files -> Tables) to represent standard architectural flow.
- [Sidebar.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/components/graph/Sidebar.tsx): Displays metrics summary counts, circular dependency warnings, and global symbol search.
- [NodeDetails.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/components/graph/NodeDetails.tsx): Right inspector panel housing the code slice viewer, upstream/downstream callers list, refactoring Impact Score, and Gemini explanation trigger.
- [ChatWindow.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/components/chat/ChatWindow.tsx): Collapsible chat drawer in the bottom right corner to ask structural questions about the code.
- [page.tsx](file:///Users/mozammil/personal/antigravity/my%20git%20repos/repo-to-graph/frontend/app/repo/%5Bid%5D/page.tsx): Parent visualizer layout coordinating sub-graphs, searches, and panel toggles.

---

## Technical Features Demonstrated

1. **Modern AST Grammars**: Direct tree-sitter bindings for JS, TS, and Python that execute statically without needing execution runtimes.
2. **Controller-to-Database Flow Mapping**: Automatically parses routing decorators (Express/FastAPI) and SQL query strings, aligning APIs on the left and tables on the right of the canvas.
3. **Blast Radius Refactoring Scores**: Calculated dynamically via NetworkX ancestors and descendants counts.
4. **Interactive Focus Modes**: Setting a focus node automatically isolates the graph canvas to its 1-5 hop call neighborhood.
5. **High-Performance Viewport Transitions**: Remembers your exact viewport pan/zoom position on node selection, and restores it instantly behind a quick hardware-accelerated fade-out overlay on deselect, eliminating rendering jitter entirely.
6. **Smart Starting Focus**: Large repositories automatically align the initial camera viewport with the leftmost starting nodes (APIs, Folders, and Files at the entry point) rather than centering on the middle of a massive canvas, while small focused graphs are automatically fully fitted.

---

## How to Run the Application

We have configured both environments inside the `/Users/mozammil/uv_python_env/.repo-to-graph` virtual environment (running **Python 3.12.13**). Follow these steps to run:

### 1. Launch the FastAPI Backend
Open a terminal window, navigate to the project root, and execute:
```bash
# 1. Activate the environment
source /Users/mozammil/uv_python_env/.repo-to-graph/bin/activate

# 2. Run the FastAPI development server
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```
*API will be active at http://localhost:8000. You can view Swagger documentation at http://localhost:8000/docs.*

### 2. Launch the Next.js Frontend
Open a second terminal window, navigate to the `frontend/` directory, and execute:
```bash
# 1. Activate the environment (Node.js and npm are pre-loaded here!)
source /Users/mozammil/uv_python_env/.repo-to-graph/bin/activate

# 2. Navigate to frontend
cd frontend

# 3. Start the Next.js development server
npm run dev
```
*Frontend will be active at http://localhost:3000.*

---

## Optional: Enable Gemini AI Features
To activate the codebase explanations and AI repository chat, simply export your Gemini API key in your terminal before launching the backend:
```bash
export GEMINI_API_KEY="your-google-api-key"
```
*(If the key is omitted, the app will run in demo/fallback mode, printing descriptive mock outputs and indicating that the key is missing).*
