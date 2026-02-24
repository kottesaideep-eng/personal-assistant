import os
import json
import urllib.request
import urllib.error


def web_search(query: str, max_results: int = 5) -> str:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return "Web search unavailable: TAVILY_API_KEY is not set."

    payload = json.dumps({
        "query": query,
        "max_results": max_results,
        "search_depth": "basic",
    }).encode()

    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return f"Search failed: HTTP {e.code} — {e.read().decode()}"
    except Exception as e:
        return f"Search failed: {e}"

    results = data.get("results", [])
    if not results:
        return "No search results found."

    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r.get('title', 'No title')}")
        lines.append(f"   URL: {r.get('url', '')}")
        lines.append(f"   {r.get('content', '')[:300]}")
        lines.append("")
    return "\n".join(lines)
