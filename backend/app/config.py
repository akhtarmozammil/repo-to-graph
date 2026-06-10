import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "repo-to-graph"
    API_V1_STR: str = "/api"
    
    # Store cloned/uploaded repositories here
    WORKSPACE_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "scanned_repos")
    )
    
    # AI API keys
    GEMINI_API_KEY: str | None = None
    
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Ensure the scan workspace exists
os.makedirs(settings.WORKSPACE_DIR, exist_ok=True)
