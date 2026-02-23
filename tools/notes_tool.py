import json
import uuid
from datetime import datetime
from pathlib import Path

from .config import DATA_DIR
NOTES_FILE = DATA_DIR / "notes.json"


def _load() -> dict:
    if NOTES_FILE.exists():
        return json.loads(NOTES_FILE.read_text())
    return {"notes": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    NOTES_FILE.write_text(json.dumps(data, indent=2))


def create_note(title: str, content: str, tags: list = None) -> str:
    data = _load()
    note = {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "content": content,
        "tags": tags or [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    data["notes"].append(note)
    _save(data)
    return f"Note created: '{title}' (ID: {note['id']})"


def list_notes(search: str = None, tag: str = None) -> str:
    data = _load()
    notes = data["notes"]

    if tag:
        notes = [n for n in notes if tag.lower() in [t.lower() for t in n.get("tags", [])]]
    if search:
        q = search.lower()
        notes = [n for n in notes if q in n["title"].lower() or q in n["content"].lower()]

    if not notes:
        return "No notes found."

    lines = []
    for n in notes:
        tags_str = f" [{', '.join(n['tags'])}]" if n.get("tags") else ""
        lines.append(f"[{n['id']}] {n['title']}{tags_str}")
        lines.append(f"    Created: {n['created_at'][:10]}")
        preview = n["content"][:80].replace("\n", " ")
        if len(n["content"]) > 80:
            preview += "..."
        lines.append(f"    {preview}")
        lines.append("")
    return "\n".join(lines)


def read_note(note_id: str = None, title: str = None) -> str:
    data = _load()
    note = None

    if note_id:
        note = next((n for n in data["notes"] if n["id"] == note_id), None)
    elif title:
        note = next((n for n in data["notes"] if n["title"].lower() == title.lower()), None)

    if not note:
        return f"Note not found."

    tags_str = f"\nTags: {', '.join(note['tags'])}" if note.get("tags") else ""
    return (
        f"Title: {note['title']}\n"
        f"ID: {note['id']}{tags_str}\n"
        f"Created: {note['created_at'][:10]}\n"
        f"---\n"
        f"{note['content']}"
    )


def update_note(note_id: str, title: str = None, content: str = None,
                tags: list = None) -> str:
    data = _load()
    for note in data["notes"]:
        if note["id"] == note_id:
            if title:
                note["title"] = title
            if content is not None:
                note["content"] = content
            if tags is not None:
                note["tags"] = tags
            note["updated_at"] = datetime.now().isoformat()
            _save(data)
            return f"Note {note_id} updated."
    return f"Note '{note_id}' not found."


def delete_note(note_id: str) -> str:
    data = _load()
    before = len(data["notes"])
    data["notes"] = [n for n in data["notes"] if n["id"] != note_id]
    if len(data["notes"]) == before:
        return f"No note found with ID '{note_id}'."
    _save(data)
    return f"Note {note_id} deleted."
