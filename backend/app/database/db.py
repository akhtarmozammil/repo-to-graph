import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from backend.app.models.database import Base

# Let's put the SQLite database in the root folder of repo-to-graph
DATABASE_URL = "sqlite:///" + os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "repo_to_graph.db")
).replace("\\", "/")

# Connect to SQLite, enabling multi-threaded access (needed for FastAPI async routes)
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
