"""
Orchestrator agent: routes user requests, uses tools, and maintains conversation history.
"""

import anthropic
import os
from datetime import date
from rich.console import Console
from rich.markdown import Markdown

from tools import get_tools, execute_tool

console = Console()
_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are a highly capable personal assistant. Today's date is {today}.

You have access to the following capabilities:
- **Web search**: Look up current information, news, weather, and facts
- **Calendar**: Add, list, update, and delete events
- **Notes**: Create, search, read, update, and delete notes
- **Reminders**: Set reminders and check what's upcoming or overdue
- **Memory**: Remember user preferences and important info across conversations
- **File workspace**: Read and write files in the user's personal workspace
- **Research**: Delegate complex multi-step research to a specialized sub-agent

Guidelines:
- Always check relevant data (calendar, reminders, memory) proactively when contextually useful
- Be concise in responses but thorough when detail is needed
- When given ambiguous dates, assume the nearest future occurrence
- Store important user preferences using the remember tool
- For research tasks requiring multiple searches, use the research_task sub-agent
"""


def run_turn(user_message: str, history: list) -> tuple[str, list]:
    """
    Process one user turn. Returns the assistant's reply and the updated history.
    Uses an agentic loop to handle tool calls.
    """
    system = SYSTEM_PROMPT.format(today=date.today().isoformat())
    history.append({"role": "user", "content": user_message})

    # Working copy of messages for the agentic loop
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history
    ]

    final_text = ""

    while True:
        with console.status("[bold cyan]Thinking…[/]", spinner="dots"):
            with _client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=16000,
                thinking={"type": "adaptive"},
                system=system,
                tools=get_tools(),
                messages=messages,
            ) as stream:
                response = stream.get_final_message()

        # Collect text from this response
        turn_text = ""
        for block in response.content:
            if hasattr(block, "text"):
                turn_text += block.text

        if turn_text:
            console.print()
            console.print(Markdown(turn_text))
            final_text = turn_text  # keep the last text as final reply

        if response.stop_reason == "end_turn":
            # Save a clean text-only assistant message to history
            history.append({
                "role": "assistant",
                "content": final_text or "(no text response)",
            })
            return final_text, history

        if response.stop_reason == "tool_use":
            # Include full content (with thinking blocks) in the loop messages
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    console.print(
                        f"[dim]  ↳ tool: [bold]{block.name}[/bold][/]"
                    )
                    result = execute_tool(block.name, dict(block.input))
                    preview = str(result)[:120].replace("\n", " ")
                    if len(str(result)) > 120:
                        preview += "…"
                    console.print(f"[dim]    ← {preview}[/]")
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result),
                    })

            messages.append({"role": "user", "content": tool_results})

        else:
            # Unexpected stop reason
            history.append({
                "role": "assistant",
                "content": final_text or "(stopped unexpectedly)",
            })
            return final_text, history


def run_turn_headless(
    user_message: str,
    history: list,
    image_base64: str | None = None,
    image_mime_type: str | None = "image/jpeg",
) -> tuple[str, list]:
    """
    API-friendly version of run_turn — no Rich console output.
    history: list of {"role": "user"|"assistant", "content": str}
    Returns: (reply_text, updated_history)
    """
    system = SYSTEM_PROMPT.format(today=date.today().isoformat())
    history = list(history)

    # Build user content — multi-modal if image is present
    if image_base64:
        user_content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_mime_type or "image/jpeg",
                    "data": image_base64,
                },
            },
            {"type": "text", "text": user_message},
        ]
    else:
        user_content = user_message

    # Store text-only in persistent history (images are one-turn only)
    history.append({"role": "user", "content": user_message})

    # For the actual API call, use multi-modal content on the last turn
    messages = [{"role": m["role"], "content": m["content"]} for m in history[:-1]]
    messages.append({"role": "user", "content": user_content})

    final_text = ""

    while True:
        with _client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=system,
            tools=get_tools(),
            messages=messages,
        ) as stream:
            response = stream.get_final_message()

        turn_text = "".join(
            block.text for block in response.content if hasattr(block, "text")
        )
        if turn_text:
            final_text = turn_text

        if response.stop_reason == "end_turn":
            history.append({"role": "assistant", "content": final_text or "(no response)"})
            return final_text, history

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = execute_tool(block.name, dict(block.input))
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result),
                    })
            messages.append({"role": "user", "content": tool_results})
        else:
            history.append({"role": "assistant", "content": final_text or "(stopped)"})
            return final_text, history
