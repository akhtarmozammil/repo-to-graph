import datetime
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from backend.app.database.db import get_db, SessionLocal
from backend.app.models.database import Repository, Scan
from backend.app.schemas.repository import RepositoryCreate, RepositoryOut
from backend.app.schemas.scan import ScanOut
from backend.app.services.cloner import ClonerService, clean_repo_name
from backend.app.services.parser import ParserService
from backend.app.services.graph import GraphService
from backend.app.services.search import SearchService
from backend.app.services.ai import AIService

logger = logging.getLogger(__name__)

router = APIRouter()

# ----------------- BACKGROUND TASKS -----------------

def background_scan_task(repo_id: str, local_path: str, scan_id: str):
    """Worker task that parses a repository and generates graph nodes/edges."""
    db = SessionLocal()
    try:
        logger.info(f"Starting background scan {scan_id} for repo {repo_id}")
        # 1. Update scan status to scanning
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = "scanning"
            db.commit()

        # 2. Run tree-sitter scan
        parser_service = ParserService()
        parser_service.scan_repository(db, repo_id, local_path)

        # 3. Mark scan as completed
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = "completed"
            scan.completed_at = datetime.datetime.utcnow()
            db.commit()
            logger.info(f"Background scan {scan_id} completed successfully")

    except Exception as e:
        logger.error(f"Background scan {scan_id} failed: {e}", exc_info=True)
        db.rollback()
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if scan:
            scan.status = "failed"
            scan.error_message = str(e)
            scan.completed_at = datetime.datetime.utcnow()
            db.commit()
    finally:
        db.close()


# ----------------- REPOSITORY ROUTES -----------------

@router.post("/repositories", response_model=RepositoryOut)
def create_repository(payload: RepositoryCreate, db: Session = Depends(get_db)):
    """Registers a local repo path or clones a remote Git repo URL."""
    try:
        # Validate path or clone git
        local_path = ClonerService.clone_or_validate(payload.url_or_path)
        
        # Determine name if not provided
        name = payload.name or clean_repo_name(payload.url_or_path)
        
        # Check if already registered
        existing = db.query(Repository).filter(Repository.local_path == local_path).first()
        if existing:
            return existing
            
        repo = Repository(
            name=name,
            url=payload.url_or_path if payload.url_or_path.startswith(("http", "git@")) else None,
            local_path=local_path
        )
        db.add(repo)
        db.commit()
        db.refresh(repo)
        return repo
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/repositories", response_model=list[RepositoryOut])
def list_repositories(db: Session = Depends(get_db)):
    return db.query(Repository).all()

@router.get("/repositories/{id}", response_model=RepositoryOut)
def get_repository(id: str, db: Session = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo

@router.delete("/repositories/{id}")
def delete_repository(id: str, db: Session = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Cascade deletes scans, nodes, and edges via custom logic
    # Nodes/Edges don't have cascade delete configured in SQL, let's clear graph manually
    from backend.app.database.graph_db import clear_graph
    clear_graph(db, id)
    
    db.delete(repo)
    db.commit()
    return {"message": "Repository and associated graph data deleted successfully"}


# ----------------- SCAN ROUTES -----------------

@router.post("/repositories/{id}/scan", response_model=ScanOut)
def trigger_scan(id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Triggers static AST parsing on the repository."""
    repo = db.query(Repository).filter(Repository.id == id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Create pending scan entry
    scan = Scan(repository_id=id, status="pending")
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Queue background task
    background_tasks.add_task(background_scan_task, id, repo.local_path, scan.id)
    return scan

@router.get("/repositories/{id}/scans", response_model=list[ScanOut])
def list_scans(id: str, db: Session = Depends(get_db)):
    return db.query(Scan).filter(Scan.repository_id == id).order_by(Scan.created_at.desc()).all()


# ----------------- GRAPH RENDERING & TRAVERSALS -----------------

@router.get("/repositories/{id}/graph")
def get_graph(
    id: str, 
    focus_node_id: str | None = Query(None),
    depth: int = Query(2, ge=1, le=5),
    db: Session = Depends(get_db)
):
    """Returns nodes and edges. Supports centering on a node and custom depth."""
    return GraphService.get_graph_data(db, id, focus_node_id=focus_node_id, depth=depth)

@router.get("/repositories/{id}/cycles")
def get_cycles(id: str, db: Session = Depends(get_db)):
    """Detects circular imports and recursion loops."""
    return GraphService.detect_circular_dependencies(db, id)

@router.get("/repositories/{id}/impact")
def get_impact_analysis(id: str, node_id: str, db: Session = Depends(get_db)):
    """Performs upstream and downstream impact analysis for a changed node."""
    return GraphService.get_impact_analysis(db, id, node_id)


# ----------------- GLOBAL SEARCH -----------------

@router.get("/repositories/{id}/search")
def search_repository(id: str, q: str = Query(...), db: Session = Depends(get_db)):
    """Performs global search across filenames, functions, classes, and tables."""
    return SearchService.search_nodes(db, id, q)


# ----------------- FILE SOURCE VIEWER -----------------

@router.get("/repositories/{id}/file-content")
def get_file_content(id: str, file_path: str = Query(...), db: Session = Depends(get_db)):
    """Serves raw file contents for the code viewer."""
    repo = db.query(Repository).filter(Repository.id == id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    abs_path = os.path.normpath(os.path.join(repo.local_path, file_path))
    # Safety check: prevent path traversal out of repo directory
    if not abs_path.startswith(os.path.abspath(repo.local_path)):
        raise HTTPException(status_code=403, detail="Access denied: outside repository boundaries")
        
    if not os.path.exists(abs_path) or not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {"file_path": file_path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {e}")


# ----------------- AI ASSISTANT ROUTES -----------------

@router.get("/repositories/{id}/explain")
def explain_code_node(id: str, node_id: str = Query(...), db: Session = Depends(get_db)):
    """Generates Gemini AI explanation for a function/class code snippet."""
    explanation = AIService.explain_node(db, id, node_id)
    return {"node_id": node_id, "explanation": explanation}

@router.post("/repositories/{id}/chat")
def chat_with_codebase(id: str, payload: dict, db: Session = Depends(get_db)):
    """Chat with the codebase using graph-retrieved snippets + Gemini."""
    message = payload.get("message")
    if not message:
        raise HTTPException(status_code=400, detail="Message payload is required")
    response = AIService.chat_with_repository(db, id, message)
    return {"response": response}
