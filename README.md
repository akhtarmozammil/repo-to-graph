# Repo-to-Graph 🌐🔍

A beautiful, premium codebase intelligence application that imports, parses, and visualizes source repositories (Python, JavaScript, TypeScript) as interactive architectural graphs. It maps system components from **APIs (routes) ➡️ Files/Methods ➡️ Database Tables**, allowing developers to visually navigate code, detect cycles, calculate refactoring blast radius, and chat with their codebase using Gemini AI.

---

## 🚀 Key Features

*   **Multi-Language AST Parsing**: Direct AST parsing using Tree-sitter for Python, JavaScript, and TypeScript without needing code execution.
*   **Architectural Flow Mapping**: Automatically identifies HTTP routing decorators (FastAPI and Express) and maps them to functions, which are then connected to SQL tables (based on raw query strings and ORM calls).
*   **Interactive React Flow Canvas**: Visualizes codebases in left-to-right logical layers (APIs 🌐 ➡️ Directories & Files 📁📄 ➡️ Classes & Functions 🧱⚙️ ➡️ Database Tables 🗄️).
*   **Smart Starting Focus**: Large repositories automatically align the initial camera viewport with the leftmost starting nodes (APIs, Folders, and Files) rather than centering on the middle of a massive canvas, while small focused graphs are automatically fully fitted.
*   **Focus & Isolation Modes**: Click on any node to dynamically isolate its 1-5 hop call neighborhood (callers and callees), bringing related nodes together.
*   **High-Performance Viewport Transitions**: Remembers your exact viewport pan/zoom position on node selection, and restores it instantly behind a quick hardware-accelerated fade-out overlay on deselect, eliminating rendering jitter entirely.
*   **Refactoring Impact (Blast Radius) Score**: Uses NetworkX graph traversals (ancestors and descendants) to score how risky a change to a specific function or file is.
*   **Circular Dependency Detection**: Instantly detects and lists structural cycles in your import or call graph.
*   **AI Code Explanation & Chat**: Integrated with Gemini 2.5 Flash to explain selected code snippets or answer codebase-wide architecture queries through an interactive chat drawer.

---

## 📁 Repository Structure

```text
repo-to-graph/
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── api/              # API endpoints for scans, repositories, graph data
│   │   ├── database/         # SQLite DB adapters and graph insertion logic
│   │   ├── models/           # SQLAlchemy schemas
│   │   ├── parsers/          # Custom Tree-sitter AST parsers (Python, JS, TS)
│   │   └── services/         # NetworkX traversals, Cloner, and Gemini integration
│   └── requirements.txt      # Python dependencies (macOS ARM compatible)
│
├── frontend/                 # Next.js 15 App Router Application
│   ├── app/                  # Pages for repo selection & visualizer canvas
│   ├── components/           # React Flow canvas, AI Chat, and Sidebars
│   ├── public/               # Static assets
│   └── package.json          # Node dependencies (Next.js, React Flow, Tailwind)
│
├── docs/                     # Project design & walkthrough records
│   ├── implementation_plan.md
│   ├── task.md
│   └── walkthrough.md
│
└── repo_to_graph.db         # Local SQLite database (Auto-created)
```

---

## 🛠️ Installation & Setup

### 1. Configure Environment Variables
To activate the Gemini code explanation and chat features, export your Gemini API key:
```bash
export GEMINI_API_KEY="your-google-gemini-api-key"
```
*(If the key is omitted, the application will run in fallback/demo mode using mock responses).*

---

### 2. Setup & Launch the FastAPI Backend
1. Open a terminal and navigate to the project root.
2. Create and activate a Python virtual environment (recommended/tested with **Python 3.12**):
   ```bash
   # Create a virtual environment
   python -m venv venv

   # Activate the environment
   # On macOS/Linux:
   source venv/bin/activate
   # On Windows (Command Prompt):
   venv\Scripts\activate
   # On Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   ```
3. Install the backend dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Start the development server:
   ```bash
   uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
   ```
*   **API Root**: `http://localhost:8000`
*   **Swagger Documentation**: `http://localhost:8000/docs`

---

### 3. Setup & Launch the Next.js Frontend
1. Open a second terminal window and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install the Node package dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
*   **Frontend Web App**: `http://localhost:3000`

---

## 💡 How to Use the App

1.  **Register a Repository**:
    *   Open `http://localhost:3000`.
    *   Enter a **Local Path** (e.g. `/Users/mozammil/personal/antigravity/my git repos/my-resume`) or a **Remote Git URL** to scan a new codebase.
2.  **Explore the Graph**:
    *   Click on any repository to open the interactive visualization canvas.
    *   Double-click to expand directory/folder nodes.
    *   Left-click any node to **isolate its connection path** and view its details in the right inspector panel.
3.  **Analyze Blast Radius**:
    *   View the **Refactoring Impact Score** in the sidebar to understand how changes propagate through the system.
4.  **Chat with your Code**:
    *   Use the Chat Drawer on the bottom right to ask questions like *"Explain how routing works here"* or *"Which tables does the user creation function modify?"*.

---

## 🔬 Under the Hood

### Zero-Dependency Relational & Graph Database
To keep the application highly portable, it uses a unified **SQLite** database layout:
*   **Relational Tables**: Tracks `repositories` metadata, `scans` logs, and parsed code files.
*   **Graph Tables**: Stores `nodes` (representing classes, functions, files, routes, tables) and `edges` (representing calls, imports, containment, queries).
*   **In-Memory Graph Analysis**: On load, the backend builds a NetworkX `DiGraph` directly from the SQLite tables to perform sub-graph extraction, cycle checks, and ancestor/descendant counts in milliseconds.

### Robust Parser Pipeline
The custom parser pipeline reads files line-by-line using **Tree-sitter** grammars:
1.  **Extracts Nodes**: Identifies declarations (functions, classes), routing endpoints (Express `router.get(...)`, FastAPI `@app.post(...)`), and database interactions (`SELECT * FROM <table_name>`).
2.  **Resolves Edges**: Compiles relative imports, matches function calls to defined functions, and binds HTTP routes/controllers to databases.
