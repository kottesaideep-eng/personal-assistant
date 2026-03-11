"""FastAPI server — exposes the personal assistant as a REST API."""

import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import List, Optional

import httpx
import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from assistant import run_turn_headless

app = FastAPI(title="Personal Assistant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.environ.get("DATA_DIR", "./data")
DEVICES_FILE = os.path.join(DATA_DIR, "devices.json")
REMINDERS_FILE = os.path.join(DATA_DIR, "reminders.json")
PENDING_REPLIES_FILE = os.path.join(DATA_DIR, "pending_replies.json")
AI_FEED_FILE = os.path.join(DATA_DIR, "ai_feed.json")


# ── Models ────────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[HistoryMessage] = []
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = "image/jpeg"


class ChatResponse(BaseModel):
    reply: str
    history: List[HistoryMessage]


class DeviceRegistration(BaseModel):
    token: str
    platform: str  # "ios" | "android"


class PendingReply(BaseModel):
    sender_name: str
    sender_handle: str
    chat_id: str
    original_message: str
    draft_reply: str


class ApproveRequest(BaseModel):
    approved_text: str


class PushNotifyRequest(BaseModel):
    title: str
    body: str
    data: Optional[dict] = None


class AiFeedItem(BaseModel):
    id: str
    title: str
    summary: str
    category: str        # "model" | "tool" | "library" | "paper" | "news"
    why_useful: str
    url: str
    fetched_at: str


class PlaygroundRequest(BaseModel):
    title: str
    summary: str
    category: str
    url: str
    why_useful: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_json(path: str, default):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


def _save_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    try:
        reply, updated_history = await asyncio.to_thread(
            run_turn_headless,
            req.message,
            history,
            req.image_base64,
            req.image_mime_type,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return ChatResponse(
        reply=reply,
        history=[HistoryMessage(role=m["role"], content=m["content"]) for m in updated_history],
    )


@app.post("/register-device")
async def register_device(reg: DeviceRegistration):
    devices = _load_json(DEVICES_FILE, [])
    # Deduplicate by token
    devices = [d for d in devices if d.get("token") != reg.token]
    devices.append({"token": reg.token, "platform": reg.platform})
    _save_json(DEVICES_FILE, devices)
    return {"status": "registered"}


@app.post("/pending-reply")
async def create_pending_reply(req: PendingReply):
    records = _load_json(PENDING_REPLIES_FILE, [])
    record = {
        "id": str(uuid.uuid4()),
        "sender_name": req.sender_name,
        "sender_handle": req.sender_handle,
        "chat_id": req.chat_id,
        "original_message": req.original_message,
        "draft_reply": req.draft_reply,
        "status": "pending",
        "approved_text": None,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    records.append(record)
    _save_json(PENDING_REPLIES_FILE, records)
    return record


@app.get("/pending-replies")
async def get_pending_replies():
    records = _load_json(PENDING_REPLIES_FILE, [])
    return [r for r in records if r.get("status") != "dismissed"]


@app.patch("/pending-reply/{reply_id}/approve")
async def approve_pending_reply(reply_id: str, req: ApproveRequest):
    records = _load_json(PENDING_REPLIES_FILE, [])
    for r in records:
        if r["id"] == reply_id:
            r["status"] = "approved"
            r["approved_text"] = req.approved_text
            _save_json(PENDING_REPLIES_FILE, records)
            return r
    raise HTTPException(status_code=404, detail="Reply not found")


@app.patch("/pending-reply/{reply_id}/dismiss")
async def dismiss_pending_reply(reply_id: str):
    records = _load_json(PENDING_REPLIES_FILE, [])
    for r in records:
        if r["id"] == reply_id:
            r["status"] = "dismissed"
            _save_json(PENDING_REPLIES_FILE, records)
            return r
    raise HTTPException(status_code=404, detail="Reply not found")


@app.post("/push-notify")
async def push_notify(req: PushNotifyRequest):
    devices = _load_json(DEVICES_FILE, [])
    tokens = [d["token"] for d in devices if d.get("token")]
    if not tokens:
        return {"sent": 0}
    sent = 0
    async with httpx.AsyncClient() as client:
        for token in tokens:
            payload = {
                "to": token,
                "title": req.title,
                "body": req.body,
                "sound": "default",
                "data": req.data or {},
            }
            try:
                await client.post("https://exp.host/--/api/v2/push/send", json=payload)
                sent += 1
            except Exception:
                pass
    return {"sent": sent}


@app.get("/send-due-reminders")
async def send_due_reminders_endpoint():
    """Manual trigger — normally called by the scheduler."""
    count = await _dispatch_due_reminders()
    return {"sent": count}


# ── Push notification dispatcher ──────────────────────────────────────────────

async def _dispatch_due_reminders():
    """Check reminders.json for due items and push via Expo Push API."""
    from datetime import datetime

    reminders = _load_json(REMINDERS_FILE, [])
    devices = _load_json(DEVICES_FILE, [])
    tokens = [d["token"] for d in devices if d.get("token")]

    if not tokens:
        return 0

    now = datetime.utcnow().timestamp()
    due = [r for r in reminders if not r.get("sent") and r.get("due_ts", float("inf")) <= now]

    sent = 0
    async with httpx.AsyncClient() as client:
        for reminder in due:
            for token in tokens:
                payload = {
                    "to": token,
                    "title": "⏰ Reminder",
                    "body": reminder.get("text", "You have a reminder"),
                    "sound": "default",
                }
                try:
                    await client.post("https://exp.host/--/api/v2/push/send", json=payload)
                    sent += 1
                except Exception:
                    pass
            reminder["sent"] = True

    if due:
        _save_json(REMINDERS_FILE, reminders)

    return sent


# ── AI Feed ───────────────────────────────────────────────────────────────────

FEED_SEARCH_QUERIES = [
    "new AI tools and applications launched this week",
    "new open source AI models released this week site:huggingface.co OR site:github.com",
    "GitHub trending AI machine learning repositories this week",
    "new AI developer tools APIs released 2026",
]

async def _fetch_ai_feed() -> list[dict]:
    """Search for AI news + summarize into structured feed items using Claude."""
    import anthropic as _anthropic

    tavily_key = os.environ.get("TAVILY_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not tavily_key or not anthropic_key:
        print("[ai-feed] Missing API keys, skipping fetch")
        return []

    # Gather raw search results
    raw_results: list[dict] = []
    async with httpx.AsyncClient(timeout=20) as client:
        for query in FEED_SEARCH_QUERIES:
            try:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={"query": query, "max_results": 5, "search_depth": "basic"},
                    headers={"Authorization": f"Bearer {tavily_key}"},
                )
                data = resp.json()
                for r in data.get("results", []):
                    raw_results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", "")[:400],
                    })
            except Exception as e:
                print(f"[ai-feed] Search error: {e}")

    if not raw_results:
        return []

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique_results = []
    for r in raw_results:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            unique_results.append(r)

    # Ask Claude to structure into clean feed items
    raw_text = "\n\n".join(
        f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content']}"
        for r in unique_results
    )

    prompt = f"""You are curating an AI news feed for a software developer who wants to stay on top of new AI tools, models, libraries, and applications they can use personally or integrate into projects.

Given these raw search results, extract the 8-10 most interesting and actionable items. For each item return a JSON object with:
- title: short name of the tool/model/project
- summary: 1-2 sentence description of what it is
- category: one of "model", "tool", "library", "paper", "news"
- why_useful: 1 sentence on why a developer would want to use this
- url: the source URL

Return a JSON array only, no markdown, no explanation.

Search results:
{raw_text}"""

    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )
        )
        items = json.loads(msg.content[0].text)
    except Exception as e:
        print(f"[ai-feed] Claude error: {e}")
        return []

    now = datetime.utcnow().isoformat() + "Z"
    feed = [
        {
            "id": str(uuid.uuid4()),
            "title": item.get("title", ""),
            "summary": item.get("summary", ""),
            "category": item.get("category", "news"),
            "why_useful": item.get("why_useful", ""),
            "url": item.get("url", ""),
            "fetched_at": now,
        }
        for item in items
        if isinstance(item, dict)
    ]
    _save_json(AI_FEED_FILE, feed)
    print(f"[ai-feed] Saved {len(feed)} items")
    return feed


@app.post("/playground/explore")
async def playground_explore(req: PlaygroundRequest):
    """Generate an integration guide for a given AI tool using Claude."""
    import anthropic as _anthropic

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    # Fetch a bit more context from the URL via Tavily if possible
    extra_context = ""
    tavily_key = os.environ.get("TAVILY_API_KEY")
    if tavily_key:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={"query": f"{req.title} getting started tutorial documentation", "max_results": 3, "search_depth": "basic"},
                    headers={"Authorization": f"Bearer {tavily_key}"},
                )
                results = resp.json().get("results", [])
                extra_context = "\n".join(
                    f"- {r['title']}: {r['content'][:300]}" for r in results
                )
        except Exception:
            pass

    prompt = f"""You are an expert developer helping someone integrate a new AI tool into their projects.

Tool details:
- Name: {req.title}
- Category: {req.category}
- Summary: {req.summary}
- Why useful: {req.why_useful}
- URL: {req.url}

Additional context from docs/web:
{extra_context or "Not available"}

The user's existing app is called "Roar" — a personal assistant with:
- Python FastAPI backend (with Anthropic Claude + Tavily web search)
- React Native mobile app (Expo SDK 54)
- Deployed on Railway

Generate a practical integration guide as a JSON object with these exact fields:
- "overview": 2-3 sentence plain-English explanation of what this tool does and its best use case
- "install": the exact install command(s) as a single string (e.g. "pip install x" or "npm install x")
- "quickstart": a self-contained working code snippet (15-30 lines) showing the most useful thing you can do with this tool
- "roar_integration": a concrete code snippet showing how to add this tool to the Roar Python backend (as a new endpoint or tool function)
- "standalone": a complete minimal standalone script or app (Python preferred, or JS if it's a JS-only tool) that the user can run immediately to try the tool
- "tips": array of 3 practical tips or gotchas for using this tool effectively
- "chat_starter": a one-sentence opening message the assistant should say when the user wants to chat about this tool

Return JSON only, no markdown fences, no explanation outside the JSON."""

    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}],
            )
        )
        guide = json.loads(msg.content[0].text)
    except json.JSONDecodeError:
        # Claude returned markdown fences — strip them
        raw = msg.content[0].text
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        guide = json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Guide generation failed: {e}")

    return guide


@app.get("/ai-feed")
async def get_ai_feed():
    """Return the latest cached AI feed."""
    return _load_json(AI_FEED_FILE, [])


@app.post("/ai-feed/refresh")
async def refresh_ai_feed():
    """Manually trigger a feed refresh and push-notify devices."""
    feed = await _fetch_ai_feed()
    if feed:
        devices = _load_json(DEVICES_FILE, [])
        tokens = [d["token"] for d in devices if d.get("token")]
        if tokens:
            async with httpx.AsyncClient() as client:
                for token in tokens:
                    await client.post(
                        "https://exp.host/--/api/v2/push/send",
                        json={
                            "to": token,
                            "title": "🤖 AI Feed Updated",
                            "body": f"{len(feed)} new AI tools & models for you",
                            "sound": "default",
                            "data": {"type": "ai_feed"},
                        },
                    )
    return {"count": len(feed)}


# ── Scheduler ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_dispatch_due_reminders, "interval", minutes=1)
    # Refresh AI feed daily at 8 AM UTC
    scheduler.add_job(_fetch_ai_feed, "cron", hour=8, minute=0)
    scheduler.start()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
