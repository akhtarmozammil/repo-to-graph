import datetime
import uuid
import json
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)  # Git URL if remote
    local_path = Column(String, nullable=False)  # Path to local scanned directory
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    scans = relationship("Scan", back_populates="repository", cascade="all, delete-orphan")

class Scan(Base):
    __tablename__ = "scans"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id = Column(String, ForeignKey("repositories.id"), nullable=False)
    status = Column(String, default="pending")  # pending, scanning, completed, failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    repository = relationship("Repository", back_populates="scans")

class Node(Base):
    __tablename__ = "nodes"

    # id format: "repo_id:node_type:unique_path_or_signature"
    id = Column(String, primary_key=True)
    repository_id = Column(String, ForeignKey("repositories.id"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # repo, folder, file, class, function, api, table
    file_path = Column(String, nullable=True)  # Relative to repo root
    start_line = Column(Integer, nullable=True)
    end_line = Column(Integer, nullable=True)
    properties_json = Column(Text, default="{}")  # Extra attributes stored as JSON

    @property
    def properties(self):
        try:
            return json.loads(self.properties_json or "{}")
        except Exception:
            return {}

    @properties.setter
    def properties(self, value):
        self.properties_json = json.dumps(value or {})

class Edge(Base):
    __tablename__ = "edges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    repository_id = Column(String, ForeignKey("repositories.id"), nullable=False)
    source_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    target_id = Column(String, ForeignKey("nodes.id"), nullable=False)
    type = Column(String, nullable=False)  # CONTAINS, IMPORTS, CALLS, CALLS_API, USES
    properties_json = Column(Text, default="{}")  # Extra attributes stored as JSON

    @property
    def properties(self):
        try:
            return json.loads(self.properties_json or "{}")
        except Exception:
            return {}

    @properties.setter
    def properties(self, value):
        self.properties_json = json.dumps(value or {})
