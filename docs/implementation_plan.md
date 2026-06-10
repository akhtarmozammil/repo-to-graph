# Implementation Plan - repo-to-graph (Finalized)

We will build **repo-to-graph**, a code intelligence and repository visualization platform. We are implementing **Option B (Zero-Dependency SQLite Stack)** for Version 1. Relational data, graph structure, and local metadata will be stored in SQLite files. We will keep in mind that Version 2 will transition to Option A (PostgreSQL + Neo4j).

## Architectural Design

### 1. Database (SQLite)
We will use a single SQLite file (e.g., `repo_to_graph.db`) containing two schemas:
- **Relational Tables**: `repositories`, `scans`, `chat_sessions`, `chat_messages`.
- **Graph Tables**:
  - `nodes`: `id` (text, primary key), `repository_id` (text), `name` (text), `type` (text: repo, folder, file, class, function, api, table), `file_path` (text), `start_line` (integer), `end_line` (integer), `properties` (json text).
  - `edges`: `id` (integer, primary key auto-increment), `repository_id` (text), `source_id` (text), `target_id` (text), `type` (text: CONTAINS, IMPORTS, CALLS, CALLS_API, USES), `properties` (json text).

### 2. Graph Traverser (Python Memory)
Because SQLite does not natively support Cypher queries, graph traversal (e.g. caller/callee trees, call depth, circular dependency detection) will be implemented using Python's standard recursive/stack-based depth-first search (DFS) and breadth-first search (BFS). This is highly efficient for repositories up to hundreds of thousands of nodes.

### 3. Parser Service (Tree-Sitter)
We will use the modern, pip-installable python packages `tree-sitter`, `tree-sitter-python`, `tree-sitter-javascript`, and `tree-sitter-typescript` to extract:
- File imports
- Class definitions
- Function/Method definitions
- Function call expressions
- Express/FastAPI API endpoints
- SQL queries / ORM database access patterns

---

## Proposed Project Structure

We will create the directory `repo-to-graph` under:
`/Users/mozammil/personal/antigravity/my git repos/repo-to-graph`

```
repo-to-graph/
├── backend/
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── database/
│       │   ├── db.py         # SQLAlchemy SQLite session
│       │   └── graph_db.py   # SQL-based node/edge insertion
│       ├── models/         # SQLAlchemy Models
│       │   ├── database.py   # Relational & Graph schemas
│       │   └── chat.py
│       ├── schemas/        # Pydantic models
│       │   ├── repository.py
│       │   ├── scan.py
│       │   └── graph.py
│       ├── parsers/        # Tree-sitter Parsers
│       │   ├── base.py
│       │   ├── python.py
│       │   ├── javascript.py
│       │   └── typescript.py
│       ├── services/       # Core Business Logic
│       │   ├── cloner.py
│       │   ├── parser.py   # Code analysis runner
│       │   ├── graph.py    # Graph traversal & impact analysis
│       │   ├── search.py   # Search queries
│       │   └── ai.py       # Gemini AI integration
│       └── api/            # API Endpoints
│           ├── repositories.py
│           ├── scans.py
│           ├── graph.py
│           ├── search.py
│           └── ai.py
├── frontend/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx        # Dashboard / Import repo
│   │   ├── repo/[id]/page.tsx  # Graph Viewer & Chat
│   └── components/
│       ├── graph/
│       │   ├── GraphCanvas.tsx  # React Flow Canvas
│       │   ├── Sidebar.tsx      # Info panel & controls
│       │   └── NodeDetails.tsx  # Node attributes & code viewer
│       ├── chat/
│       │   └── ChatWindow.tsx   # Repository AI Chat
│       └── ui/                  # Shadcn components
└── docs/
```

---

## Phase 1 (MVP) & Phase 2 Execution Plan

### Step 1: Initialize Workspace & Backend Setup
1. Create `backend/requirements.txt`.
2. Initialize SQLite schemas using SQLAlchemy in `backend/app/database/db.py` and `backend/app/models/database.py`.
3. Create `backend/app/main.py` and setup FastAPI.

### Step 2: Tree-Sitter Parser Integration
1. Implement the generic code parsing framework in `backend/app/parsers/base.py`.
2. Implement specific parsers for Python (`python.py`) and JavaScript/TypeScript (`javascript.py`, `typescript.py`).
3. Set up directory traversing and AST matching for functions, classes, imports, and calls.

### Step 3: Graph Generator & Traversal Algorithms
1. Implement node and edge insertion queries in SQLite (`backend/app/database/graph_db.py`).
2. Write Python algorithms for:
   - Call depth, caller/callee trees.
   - Circular dependency detection (Cycle detection in directed graphs).
   - Upstream/Downstream impact analysis.

### Step 4: Backend API Endpoints
1. Create CRUD endpoints for repositories, trigger-scan endpoint, search, and graph querying.

### Step 5: Frontend - Next.js Setup
1. Initialize a Next.js 15 app in `frontend/`.
2. Configure Tailwind CSS and Lucide React.
3. Install React Flow (`@xyflow/react`) for graph rendering.

### Step 6: Interactive UI Components
1. Build import/scan page.
2. Build interactive graph explorer (Zoom/Pan, custom Node styles for File, Class, Function, API).
3. Build node detail sidebar showing code snippets and caller/callee lists.

---

## Verification Plan

### Automated Tests
- Parse a sample python file and test that all functions and function calls are correctly extracted.
- Verify node/edge insertions and Cypher-like queries execute correctly in SQLite.

### Manual Verification
1. Run backend using `uvicorn app.main:app --reload`.
2. Run frontend using `npm run dev`.
3. Load a test repository (either local path or git clone).
4. Run scanning process and view graph rendering.
