from pathlib import Path
from .config import WORKSPACE_DIR as WORKSPACE


def _safe_path(rel_path: str) -> Path:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    resolved = (WORKSPACE / rel_path).resolve()
    if not str(resolved).startswith(str(WORKSPACE.resolve())):
        raise ValueError("Access outside workspace is not allowed.")
    return resolved


def list_files(path: str = ".") -> str:
    try:
        target = _safe_path(path)
        if not target.exists():
            return f"Path '{path}' does not exist."
        if target.is_file():
            return f"{path} (file, {target.stat().st_size} bytes)"

        items = sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name))
        if not items:
            return f"Directory '{path}' is empty."

        lines = [f"Contents of '{path}':"]
        for item in items:
            if item.is_dir():
                lines.append(f"  📁 {item.name}/")
            else:
                size = item.stat().st_size
                lines.append(f"  📄 {item.name} ({size} bytes)")
        return "\n".join(lines)
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Error listing files: {e}"


def read_file(path: str) -> str:
    try:
        target = _safe_path(path)
        if not target.exists():
            return f"File '{path}' does not exist."
        if target.is_dir():
            return f"'{path}' is a directory, not a file."
        if target.stat().st_size > 1_000_000:
            return f"File '{path}' is too large to read (>1MB)."
        return target.read_text(encoding="utf-8", errors="replace")
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Error reading file: {e}"


def write_file(path: str, content: str) -> str:
    try:
        target = _safe_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return f"File '{path}' written ({len(content)} characters)."
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Error writing file: {e}"


def delete_file(path: str) -> str:
    try:
        target = _safe_path(path)
        if not target.exists():
            return f"'{path}' does not exist."
        if target.is_dir():
            import shutil
            shutil.rmtree(target)
            return f"Directory '{path}' deleted."
        target.unlink()
        return f"File '{path}' deleted."
    except ValueError as e:
        return str(e)
    except Exception as e:
        return f"Error deleting: {e}"
