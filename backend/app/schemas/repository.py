from pydantic import BaseModel
from datetime import datetime

class RepositoryBase(BaseModel):
    name: str
    url: str | None = None
    local_path: str

class RepositoryCreate(BaseModel):
    name: str | None = None
    url_or_path: str  # Can be a git clone URL or a local folder path

class RepositoryOut(RepositoryBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
