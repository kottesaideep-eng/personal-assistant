import json
import uuid
from datetime import datetime, date
from pathlib import Path

from .config import DATA_DIR
CALENDAR_FILE = DATA_DIR / "calendar.json"


def _load() -> dict:
    if CALENDAR_FILE.exists():
        return json.loads(CALENDAR_FILE.read_text())
    return {"events": []}


def _save(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CALENDAR_FILE.write_text(json.dumps(data, indent=2))


def add_event(title: str, date: str, time: str = None,
              duration_minutes: int = 60, description: str = None) -> str:
    data = _load()
    event = {
        "id": str(uuid.uuid4())[:8],
        "title": title,
        "date": date,
        "time": time,
        "duration_minutes": duration_minutes,
        "description": description or "",
        "created_at": datetime.now().isoformat(),
    }
    data["events"].append(event)
    _save(data)
    time_str = f" at {time}" if time else ""
    return f"Added event '{title}' on {date}{time_str} (ID: {event['id']})"


def list_events(start_date: str, end_date: str = None) -> str:
    data = _load()
    events = [e for e in data["events"] if e["date"] >= start_date]
    if end_date:
        events = [e for e in events if e["date"] <= end_date]
    events.sort(key=lambda e: (e["date"], e.get("time") or ""))

    if not events:
        return "No events found for the given date range."

    lines = []
    for e in events:
        line = f"[{e['id']}] {e['date']}"
        if e.get("time"):
            line += f" {e['time']}"
        line += f" — {e['title']}"
        if e.get("duration_minutes"):
            line += f" ({e['duration_minutes']} min)"
        if e.get("description"):
            line += f"\n    {e['description']}"
        lines.append(line)
    return "\n".join(lines)


def delete_event(event_id: str) -> str:
    data = _load()
    before = len(data["events"])
    data["events"] = [e for e in data["events"] if e["id"] != event_id]
    if len(data["events"]) == before:
        return f"No event found with ID '{event_id}'."
    _save(data)
    return f"Event {event_id} deleted."


def update_event(event_id: str, title: str = None, date: str = None,
                 time: str = None, description: str = None) -> str:
    data = _load()
    for event in data["events"]:
        if event["id"] == event_id:
            if title:
                event["title"] = title
            if date:
                event["date"] = date
            if time is not None:
                event["time"] = time
            if description is not None:
                event["description"] = description
            _save(data)
            return f"Event {event_id} updated."
    return f"No event found with ID '{event_id}'."
