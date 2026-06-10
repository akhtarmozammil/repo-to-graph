import os
import re
import git
import shutil
import logging
from backend.app.config import settings

logger = logging.getLogger(__name__)

def clean_repo_name(url_or_path: str) -> str:
    """Extract a clean folder name from a Git URL or directory path."""
    name = url_or_path.strip().rstrip("/")
    if name.endswith(".git"):
        name = name[:-4]
    name = re.sub(r"[^a-zA-Z0-9_\-]", "_", os.path.basename(name))
    return name or "repository"

class ClonerService:
    @staticmethod
    def clone_or_validate(url_or_path: str) -> str:
        """
        Clones remote repository OR validates local path.
        Returns:
            Absolute path to the repository directory.
        """
        # Check if it looks like a Git URL
        is_git_url = (
            url_or_path.startswith("http://") or
            url_or_path.startswith("https://") or
            url_or_path.startswith("git@")
        )
        
        if is_git_url:
            folder_name = clean_repo_name(url_or_path)
            target_path = os.path.join(settings.WORKSPACE_DIR, folder_name)
            
            # If it already exists, pull or delete & re-clone
            if os.path.exists(target_path):
                try:
                    logger.info(f"Repository already cloned. Attempting git pull at {target_path}")
                    repo = git.Repo(target_path)
                    repo.remotes.origin.pull()
                    return target_path
                except Exception as e:
                    logger.warning(f"Failed to pull existing repo: {e}. Re-cloning...")
                    shutil.rmtree(target_path, ignore_errors=True)
            
            logger.info(f"Cloning {url_or_path} into {target_path}")
            git.Repo.clone_from(url_or_path, target_path, depth=1)
            return target_path
        
        else:
            # Local directory path
            local_path = os.path.abspath(url_or_path)
            if not os.path.exists(local_path):
                raise ValueError(f"Local path does not exist: {local_path}")
            if not os.path.isdir(local_path):
                raise ValueError(f"Local path is not a directory: {local_path}")
            
            return local_path
