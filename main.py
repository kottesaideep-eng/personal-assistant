#!/usr/bin/env python3
"""Personal Assistant — entry point."""

import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.text import Text
from rich import box

from assistant import run_turn

console = Console()

WELCOME = """
[bold cyan]Personal Assistant[/bold cyan]  [dim]powered by Claude Opus 4.6[/dim]

Tools available:
  [green]web_search[/]       Search the web for current info
  [green]calendar[/]         Manage events (add / list / update / delete)
  [green]notes[/]            Create, search, and manage notes
  [green]reminders[/]        Set and check reminders
  [green]memory[/]           Remember preferences across sessions
  [green]files[/]            Read/write files in your workspace
  [green]research_task[/]    Deep research via a specialized sub-agent

Type [bold]/help[/] for commands, [bold]/quit[/] to exit.
"""

HELP_TEXT = """
[bold]Commands:[/bold]
  [cyan]/help[/]       Show this help
  [cyan]/history[/]    Show conversation history summary
  [cyan]/clear[/]      Clear conversation history (start fresh)
  [cyan]/quit[/]       Exit the assistant

[bold]Example prompts:[/bold]
  "What's the weather in Tokyo?"
  "Add a meeting tomorrow at 3pm called Team Sync"
  "Show my calendar for this week"
  "Create a note about my project ideas"
  "Set a reminder for 2025-06-01T09:00 to review Q2 goals"
  "Remember that I prefer dark mode"
  "Research the latest developments in quantum computing"
"""


def print_welcome() -> None:
    console.print(Panel(WELCOME.strip(), box=box.ROUNDED, border_style="cyan"))


def print_help() -> None:
    console.print(Panel(HELP_TEXT.strip(), title="Help", box=box.SIMPLE))


def print_history(history: list) -> None:
    if not history:
        console.print("[dim]No conversation history yet.[/]")
        return
    console.print(f"[dim]Conversation has {len(history)} messages.[/]")
    for i, msg in enumerate(history[-6:], 1):
        role = msg["role"].upper()
        content = str(msg["content"])[:80].replace("\n", " ")
        console.print(f"  [dim]{role}:[/] {content}…" if len(str(msg["content"])) > 80 else f"  [dim]{role}:[/] {content}")


def main() -> None:
    print_welcome()
    history: list = []

    while True:
        try:
            user_input = Prompt.ask(
                "\n[bold green]You[/bold green]",
                console=console,
            ).strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Goodbye![/]")
            sys.exit(0)

        if not user_input:
            continue

        # Built-in commands
        if user_input.startswith("/"):
            cmd = user_input.lower().split()[0]
            if cmd in ("/quit", "/exit", "/q"):
                console.print("[dim]Goodbye![/]")
                sys.exit(0)
            elif cmd == "/help":
                print_help()
            elif cmd == "/history":
                print_history(history)
            elif cmd == "/clear":
                history = []
                console.print("[dim]Conversation history cleared.[/]")
            else:
                console.print(f"[red]Unknown command: {cmd}[/]. Type /help for a list of commands.")
            continue

        console.print(f"\n[bold blue]Assistant[/bold blue]")

        try:
            _, history = run_turn(user_input, history)
        except KeyboardInterrupt:
            console.print("\n[dim]Interrupted.[/]")
        except Exception as e:
            console.print(f"[red]Error:[/] {e}")


if __name__ == "__main__":
    main()
