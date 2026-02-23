import os
from pathlib import Path


def get_data_dir() -> Path:
    env = os.environ.get("DATA_DIR")
    if env:
        return Path(env)
    return Path.home() / ".personal_assistant" / "data"


def get_workspace_dir() -> Path:
    env = os.environ.get("WORKSPACE_DIR")
    if env:
        return Path(env)
    return Path.home() / ".personal_assistant" / "workspace"


DATA_DIR = get_data_dir()
WORKSPACE_DIR = get_workspace_dir()
