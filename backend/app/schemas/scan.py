from pydantic import BaseModel
from datetime import datetime

class ScanOut(BaseModel):
    id: str
    repository_id: str
    status: str
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True
