from .web_search import web_search
from .calendar_tool import add_event, list_events, delete_event, update_event
from .notes_tool import create_note, list_notes, read_note, update_note, delete_note
from .reminders_tool import set_reminder, check_reminders, complete_reminder, delete_reminder
from .memory_tool import remember, recall, forget
from .file_tool import list_files, read_file, write_file, delete_file

TOOL_DEFINITIONS = [
    {
        "name": "web_search",
        "description": "Search the web for current information, news, weather, facts, or any topic.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "max_results": {"type": "integer", "description": "Number of results (1-10, default 5)"},
            },
            "required": ["query"],
        },
    },
    # --- Calendar ---
    {
        "name": "add_calendar_event",
        "description": "Add an event to the user's calendar.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "time": {"type": "string", "description": "Time in HH:MM 24h format (optional)"},
                "duration_minutes": {"type": "integer", "description": "Duration in minutes (default 60)"},
                "description": {"type": "string"},
            },
            "required": ["title", "date"],
        },
    },
    {
        "name": "list_calendar_events",
        "description": "List calendar events for a date range.",
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "End date YYYY-MM-DD (optional)"},
            },
            "required": ["start_date"],
        },
    },
    {
        "name": "delete_calendar_event",
        "description": "Delete a calendar event by its ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string", "description": "The event ID"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "update_calendar_event",
        "description": "Update details of an existing calendar event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string"},
                "title": {"type": "string"},
                "date": {"type": "string"},
                "time": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    # --- Notes ---
    {
        "name": "create_note",
        "description": "Create a new note with a title, content, and optional tags.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Optional tags"},
            },
            "required": ["title", "content"],
        },
    },
    {
        "name": "list_notes",
        "description": "List notes, optionally filtered by tag or keyword search.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Keyword to search in title/content"},
                "tag": {"type": "string", "description": "Filter by tag"},
            },
        },
    },
    {
        "name": "read_note",
        "description": "Read the full content of a note by ID or title.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
                "title": {"type": "string"},
            },
        },
    },
    {
        "name": "update_note",
        "description": "Update an existing note's title, content, or tags.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "delete_note",
        "description": "Delete a note by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
            },
            "required": ["note_id"],
        },
    },
    # --- Reminders ---
    {
        "name": "set_reminder",
        "description": "Set a reminder for a specific date and time.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "datetime_str": {"type": "string", "description": "ISO format: YYYY-MM-DDTHH:MM"},
                "description": {"type": "string"},
            },
            "required": ["title", "datetime_str"],
        },
    },
    {
        "name": "check_reminders",
        "description": "Check upcoming and overdue reminders.",
        "input_schema": {
            "type": "object",
            "properties": {
                "include_overdue": {"type": "boolean", "description": "Include overdue reminders (default true)"},
            },
        },
    },
    {
        "name": "complete_reminder",
        "description": "Mark a reminder as done.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reminder_id": {"type": "string"},
            },
            "required": ["reminder_id"],
        },
    },
    {
        "name": "delete_reminder",
        "description": "Delete a reminder by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reminder_id": {"type": "string"},
            },
            "required": ["reminder_id"],
        },
    },
    # --- Memory ---
    {
        "name": "remember",
        "description": "Persist information across conversations (user preferences, important facts, contacts, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Unique key for this memory"},
                "value": {"type": "string", "description": "The value to store"},
                "category": {"type": "string", "description": "Category such as 'preferences', 'contacts', 'facts'"},
            },
            "required": ["key", "value"],
        },
    },
    {
        "name": "recall",
        "description": "Retrieve stored memories. Provide key and/or category to filter, or omit both to list all memories.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "category": {"type": "string"},
            },
        },
    },
    {
        "name": "forget",
        "description": "Remove a stored memory by key and category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "category": {"type": "string", "description": "Category (default 'general')"},
            },
            "required": ["key"],
        },
    },
    # --- Files ---
    {
        "name": "list_files",
        "description": "List files and folders in the user's workspace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path within workspace (default '.')"},
            },
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file from the workspace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path within workspace"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write or overwrite a file in the workspace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file or directory from the workspace.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
            },
            "required": ["path"],
        },
    },
    # --- Research sub-agent ---
    {
        "name": "research_task",
        "description": (
            "Delegate a complex multi-step research task to a specialized research sub-agent. "
            "Use this when a question requires multiple searches, synthesis, or deep investigation. "
            "The sub-agent will perform several web searches and return a comprehensive summary."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "The research task or question to investigate"},
                "depth": {"type": "string", "enum": ["quick", "thorough"], "description": "Research depth (default 'thorough')"},
            },
            "required": ["task"],
        },
    },
]


def get_tools() -> list:
    return TOOL_DEFINITIONS


def execute_tool(name: str, inputs: dict) -> str:
    try:
        match name:
            case "web_search":
                return web_search(**inputs)
            case "add_calendar_event":
                return add_event(**inputs)
            case "list_calendar_events":
                return list_events(**inputs)
            case "delete_calendar_event":
                return delete_event(**inputs)
            case "update_calendar_event":
                return update_event(**inputs)
            case "create_note":
                return create_note(**inputs)
            case "list_notes":
                return list_notes(**inputs)
            case "read_note":
                return read_note(**inputs)
            case "update_note":
                return update_note(**inputs)
            case "delete_note":
                return delete_note(**inputs)
            case "set_reminder":
                return set_reminder(**inputs)
            case "check_reminders":
                return check_reminders(**inputs)
            case "complete_reminder":
                return complete_reminder(**inputs)
            case "delete_reminder":
                return delete_reminder(**inputs)
            case "remember":
                return remember(**inputs)
            case "recall":
                return recall(**inputs)
            case "forget":
                return forget(**inputs)
            case "list_files":
                return list_files(**inputs)
            case "read_file":
                return read_file(**inputs)
            case "write_file":
                return write_file(**inputs)
            case "delete_file":
                return delete_file(**inputs)
            case "research_task":
                from .research_agent import run_research
                return run_research(**inputs)
            case _:
                return f"Unknown tool: {name}"
    except TypeError as e:
        return f"Tool call error for '{name}': {e}"
    except Exception as e:
        return f"Error executing '{name}': {e}"
