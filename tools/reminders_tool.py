import json
import uuid
from datetime import datetime
from pathlib import Path

from .config import DATA_DIR
REMINDERS_FILE = DATA_DIR / "reminders.json"


def _load() -> dict:
    if REMINDERS_FILE.exists():
        return json.loads(REMINDERS_FILE.read_text())
    return {"reminders": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REMINDERS_FILE.write_text(json.dumps(data, indent=2))


def set_reminder(title: str, datetime_str: str, description: str = None) -> str:
    data = _load()
    reminder = {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "datetime": datetime_str,
        "description": description or "",
        "done": False,
        "created_at": datetime.now().isoformat(),
    }
    data["reminders"].append(reminder)
    _save(data)
    return f"Reminder set: '{title}' at {datetime_str} (ID: {reminder['id']})"


def check_reminders(include_overdue: bool = True) -> str:
    data = _load()
    now = datetime.now()
    reminders = [r for r in data["reminders"] if not r["done"]]

    upcoming = []
    overdue = []
    for r in reminders:
        try:
            dt = datetime.fromisoformat(r["datetime"])
            if dt < now:
                overdue.append(r)
            else:
                upcoming.append(r)
        except ValueError:
            upcoming.append(r)

    upcoming.sort(key=lambda r: r["datetime"])
    overdue.sort(key=lambda r: r["datetime"])

    lines = []
    if overdue and include_overdue:
        lines.append("OVERDUE:")
        for r in overdue:
            lines.append(f"  [{r['id']}] {r['datetime']} — {r['title']}")
            if r.get("description"):
                lines.append(f"    {r['description']}")
        lines.append("")

    if upcoming:
        lines.append("UPCOMING:")
        for r in upcoming:
            lines.append(f"  [{r['id']}] {r['datetime']} — {r['title']}")
            if r.get("description"):
                lines.append(f"    {r['description']}")
    elif not overdue:
        lines.append("No pending reminders.")

    return "\n".join(lines) if lines else "No pending reminders."


def complete_reminder(reminder_id: str) -> str:
    data = _load()
    for r in data["reminders"]:
        if r["id"] == reminder_id:
            r["done"] = True
            r["completed_at"] = datetime.now().isoformat()
            _save(data)
            return f"Reminder '{r['title']}' marked as done."
    return f"Reminder '{reminder_id}' not found."


def delete_reminder(reminder_id: str) -> str:
    data = _load()
    before = len(data["reminders"])
    data["reminders"] = [r for r in data["reminders"] if r["id"] != reminder_id]
    if len(data["reminders"]) == before:
        return f"No reminder found with ID '{reminder_id}'."
    _save(data)
    return f"Reminder {reminder_id} deleted."
