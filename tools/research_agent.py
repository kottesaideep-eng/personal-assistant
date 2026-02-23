"""Research sub-agent: performs multi-step web research and returns a synthesized report."""

import anthropic
from .web_search import web_search

_client = anthropic.Anthropic()

RESEARCH_TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for information.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer"},
            },
            "required": ["query"],
        },
    }
]

RESEARCH_SYSTEM = (
    "You are a research specialist. Your job is to thoroughly investigate a topic by "
    "performing multiple targeted web searches, then synthesizing the findings into a "
    "clear, well-organized report. Search for different aspects of the topic, verify "
    "information across sources, and present a comprehensive summary with key facts."
)


def run_research(task: str, depth: str = "thorough") -> str:
    max_searches = 6 if depth == "thorough" else 3
    messages = [
        {
            "role": "user",
            "content": (
                f"Research the following topic thoroughly using up to {max_searches} web searches:\n\n"
                f"{task}\n\n"
                "After your research, provide a comprehensive, well-organized summary."
            ),
        }
    ]

    search_count = 0

    while True:
        response = _client.messages.create(
            model="claude-opus-4-6",
            max_tokens=8192,
            thinking={"type": "adaptive"},
            system=RESEARCH_SYSTEM,
            tools=RESEARCH_TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            text = next(
                (b.text for b in response.content if b.type == "text"), ""
            )
            return f"[Research Sub-agent Report]\n\n{text}"

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    if block.name == "web_search" and search_count < max_searches:
                        result = web_search(**block.input)
                        search_count += 1
                    else:
                        result = "Search limit reached."
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            messages.append({"role": "user", "content": tool_results})
        else:
            break

    return "Research sub-agent completed without producing a report."
