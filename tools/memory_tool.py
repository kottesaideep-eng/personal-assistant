import json
from datetime import datetime
from pathlib import Path

from .config import DATA_DIR
MEMORY_FILE = DATA_DIR / "memory.json"


def _load() -> dict:
    if MEMORY_FILE.exists():
        return json.loads(MEMORY_FILE.read_text())
    return {"memories": {}}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    MEMORY_FILE.write_text(json.dumps(data, indent=2))


def remember(key: str, value: str, category: str = "general") -> str:
    data = _load()
    if category not in data["memories"]:
        data["memories"][category] = {}
    data["memories"][category][key] = {
        "value": value,
        "updated_at": datetime.now().isoformat(),
    }
    _save(data)
    return f"Remembered [{category}] {key}: {value}"


def recall(key: str = None, category: str = None) -> str:
    data = _load()
    memories = data["memories"]

    if not memories:
        return "No memories stored yet."

    if key and category:
        cat = memories.get(category, {})
        entry = cat.get(key)
        if entry:
            return f"[{category}] {key}: {entry['value']}"
        return f"No memory found for key '{key}' in category '{category}'."

    if key:
        results = []
        for cat_name, cat_data in memories.items():
            if key in cat_data:
                results.append(f"[{cat_name}] {key}: {cat_data[key]['value']}")
        return "\n".join(results) if results else f"No memory found for key '{key}'."

    if category:
        cat = memories.get(category, {})
        if not cat:
            return f"No memories in category '{category}'."
        lines = [f"Category: {category}"]
        for k, v in cat.items():
            lines.append(f"  {k}: {v['value']}")
        return "\n".join(lines)

    lines = []
    for cat_name, cat_data in memories.items():
        lines.append(f"[{cat_name}]")
        for k, v in cat_data.items():
            lines.append(f"  {k}: {v['value']}")
    return "\n".join(lines)


def forget(key: str, category: str = "general") -> str:
    data = _load()
    cat = data["memories"].get(category, {})
    if key in cat:
        del cat[key]
        if not cat:
            del data["memories"][category]
        _save(data)
        return f"Forgot [{category}] {key}."
    return f"No memory found for '{key}' in '{category}'."
