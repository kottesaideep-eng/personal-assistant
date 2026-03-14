"""FastAPI server — exposes the personal assistant as a REST API."""

import asyncio
import email as email_lib
import imaplib
import json
import os
import re
import smtplib
import uuid
from datetime import datetime
from email.header import decode_header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

import httpx
import uvicorn
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Request, Response
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
SUGGESTIONS_FILE = os.path.join(DATA_DIR, "suggestions.json")
TRENDING_FILE = os.path.join(DATA_DIR, "trending_articles.json")
GMAIL_WATERMARK_FILE = os.path.join(DATA_DIR, "gmail_watermark.json")
SMS_HISTORY_FILE = os.path.join(DATA_DIR, "sms_history.json")

TWILIO_ACCOUNT_SID  = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN   = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")  # e.g. "+12025551234"
MY_PHONE_NUMBER     = os.environ.get("MY_PHONE_NUMBER", "")      # your personal number for forwarding


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
    source: str = "imessage"          # "imessage" | "email"
    subject: Optional[str] = None     # email subject line
    sender_email: Optional[str] = None  # email address for replying


class DraftReplyRequest(BaseModel):
    sender_name: str
    message: str
    history: List[HistoryMessage] = []
    source: str = "imessage"
    subject: Optional[str] = None


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


@app.post("/draft-reply")
async def draft_reply_endpoint(req: DraftReplyRequest):
    """Draft a short, natural reply to an iMessage or email — no tool use."""
    import anthropic as _anthropic
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not set")

    source_label = "email" if req.source == "email" else "iMessage"
    subject_line = f"\nSubject: {req.subject}" if req.subject else ""

    system = (
        f"You are drafting a brief, natural reply on behalf of the user to a {source_label} message. "
        "Write 1-4 sentences that match the tone of the conversation. "
        "Output only the reply text — no extra commentary, no subject line, no signature unless the context clearly calls for one."
    )

    messages = [{"role": h.role, "content": h.content} for h in req.history[-6:]]
    messages.append({
        "role": "user",
        "content": f"From: {req.sender_name}{subject_line}\n\n{req.message}\n\nDraft a brief reply:",
    })

    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system=system,
                messages=messages,
            )
        )
        return {"reply": msg.content[0].text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/register-device")
async def register_device(reg: DeviceRegistration):
    devices = _load_json(DEVICES_FILE, [])
    # Deduplicate by token
    devices = [d for d in devices if d.get("token") != reg.token]
    devices.append({"token": reg.token, "platform": reg.platform})
    _save_json(DEVICES_FILE, devices)
    return {"status": "registered"}


@app.get("/devices")
async def list_devices():
    devices = _load_json(DEVICES_FILE, [])
    return {"count": len(devices), "devices": [{"platform": d.get("platform"), "token_prefix": d.get("token", "")[:30]} for d in devices]}


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
        "source": req.source,
        "subject": req.subject,
        "sender_email": req.sender_email,
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
    print(f"[approve] id={reply_id} text_len={len(req.approved_text or '')}")
    records = _load_json(PENDING_REPLIES_FILE, [])
    for r in records:
        if r["id"] == reply_id:
            r["status"] = "approved"
            r["approved_text"] = req.approved_text
            _save_json(PENDING_REPLIES_FILE, records)

            source = r.get("source", "imessage")
            print(f"[approve] source={source}")

            if source == "sms":
                # Send SMS directly via Twilio
                to_number = r.get("sender_handle", "")
                ok = await asyncio.to_thread(
                    _twilio_send_sms, to_number, req.approved_text
                )
                if ok:
                    _sms_append_history(to_number, "assistant", req.approved_text)
                    r["status"] = "dismissed"
                    _save_json(PENDING_REPLIES_FILE, records)
            else:
                # iMessage and email: dispatched by Mac companion
                print(f"[approve] queued for companion dispatch: source={source}")

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
    if not anthropic_key:
        print("[ai-feed] Missing ANTHROPIC_API_KEY, skipping fetch")
        return []

    # Gather raw search results via Tavily (optional — falls back to Claude knowledge)
    raw_results: list[dict] = []
    if tavily_key:
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
    else:
        print("[ai-feed] No TAVILY_API_KEY — using Claude knowledge base")

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique_results = []
    for r in raw_results:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            unique_results.append(r)

    # Ask Claude to structure into clean feed items
    if unique_results:
        raw_text = "Based on these search results:\n\n" + "\n\n".join(
            f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content']}"
            for r in unique_results
        )
    else:
        raw_text = "Use your knowledge of the latest AI tools, models, open-source projects, and developer tools. Focus on things released or gaining popularity in the last few weeks."

    prompt = f"""You are curating an AI news feed for a software developer who wants to stay on top of new AI tools, models, libraries, and applications they can use personally or integrate into projects.

Generate 8-10 of the most interesting and actionable recent AI items. For each item return a JSON object with:
- title: short name of the tool/model/project
- summary: 1-2 sentence description of what it is
- category: one of "model", "tool", "library", "paper", "news"
- why_useful: 1 sentence on why a developer would want to use this
- url: the real source URL (GitHub, HuggingFace, official site, or article)

Return a JSON array only, no markdown, no explanation.

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
        raw_response = msg.content[0].text.strip()
        raw_response = raw_response.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        items = json.loads(raw_response)
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


@app.get("/suggestions")
async def get_suggestions():
    """Return daily cached question prompts based on current news."""
    cached = _load_json(SUGGESTIONS_FILE, {})
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if cached.get("date") == today and cached.get("items"):
        return cached["items"]
    # Fetch fresh
    items = await _fetch_suggestions()
    return items


@app.post("/suggestions/refresh")
async def refresh_suggestions():
    items = await _fetch_suggestions()
    return {"count": len(items)}


async def _fetch_suggestions() -> list[dict]:
    import anthropic as _anthropic

    tavily_key = os.environ.get("TAVILY_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        return []

    raw: list[str] = []
    if tavily_key:
        search_queries = [
            "biggest tech and AI news today",
            "trending technology topics this week",
            "new AI tools products launched this week",
            "world news highlights today",
        ]
        async with httpx.AsyncClient(timeout=15) as client:
            for q in search_queries:
                try:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={"query": q, "max_results": 4, "search_depth": "basic"},
                        headers={"Authorization": f"Bearer {tavily_key}"},
                    )
                    for r in resp.json().get("results", []):
                        raw.append(f"{r.get('title','')} — {r.get('content','')[:200]}")
                except Exception as e:
                    print(f"[suggestions] search error: {e}")

    snippets = "\n".join(f"- {r}" for r in raw[:20]) if raw else "Use your knowledge of current tech, AI, and world events."
    prompt = f"""You are generating tappable question prompts for a personal assistant app.
Based on the news snippets below, generate 10 short, curiosity-sparking questions a user might want to ask their AI assistant.

Rules:
- Each question should be under 60 characters
- Mix categories: AI/tech, world news, science, business, trending topics
- Make them feel natural and conversational
- Each has a category: one of "AI", "Tech", "News", "Science", "Business", "Trending"

News snippets:
{snippets}

Return a JSON array only (no markdown), each item: {{"text": "...", "category": "..."}}"""

    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=800,
                messages=[{"role": "user", "content": prompt}],
            )
        )
        raw_text = msg.content[0].text.strip()
        raw_text = raw_text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        items = json.loads(raw_text)
    except Exception as e:
        print(f"[suggestions] Claude error: {e}")
        return []

    today = datetime.utcnow().strftime("%Y-%m-%d")
    _save_json(SUGGESTIONS_FILE, {"date": today, "items": items})
    print(f"[suggestions] Saved {len(items)} prompts")
    return items


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


@app.get("/ai-feed/debug")
async def debug_ai_feed():
    """Returns raw error info for debugging feed generation."""
    import anthropic as _anthropic
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    tavily_key = os.environ.get("TAVILY_API_KEY")
    result = {"anthropic_key": bool(anthropic_key), "tavily_key": bool(tavily_key)}
    if not anthropic_key:
        return {**result, "error": "no anthropic key"}
    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": "Reply with valid JSON array: [{\"test\": true}]"}],
            )
        )
        raw = msg.content[0].text.strip()
        result["raw_response"] = raw
        result["parsed"] = json.loads(raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip())
        result["status"] = "ok"
    except Exception as e:
        result["error"] = str(e)
    return result


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


# ── Trending Articles ─────────────────────────────────────────────────────────

TRENDING_QUERIES = [
    "top trending world news today",
    "breaking news headlines today",
    "trending technology and science news today",
]

async def _fetch_trending_articles() -> list[dict]:
    """Fetch and summarize top trending news articles using Tavily + Claude."""
    import anthropic as _anthropic

    tavily_key = os.environ.get("TAVILY_API_KEY")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        print("[trending] Missing ANTHROPIC_API_KEY, skipping fetch")
        return []

    raw_results: list[dict] = []
    if tavily_key:
        async with httpx.AsyncClient(timeout=20) as client:
            for query in TRENDING_QUERIES:
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
                            "content": r.get("content", "")[:500],
                        })
                except Exception as e:
                    print(f"[trending] Search error: {e}")
    else:
        print("[trending] No TAVILY_API_KEY — using Claude knowledge base")

    seen_urls: set[str] = set()
    unique_results = []
    for r in raw_results:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            unique_results.append(r)

    if unique_results:
        raw_text = "Based on these search results:\n\n" + "\n\n".join(
            f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['content']}"
            for r in unique_results
        )
    else:
        raw_text = "Use your knowledge of today's biggest news stories. Focus on major world events, technology breakthroughs, science discoveries, and business news from the past 24-48 hours."

    prompt = f"""You are curating a trending news feed. Generate 8 of the most significant trending news stories right now.

For each story return a JSON object with:
- title: the article headline (concise, under 90 chars)
- summary: 2-3 sentence plain-English summary of the story
- source: publication name (e.g. "BBC News", "TechCrunch", "Reuters")
- url: the real source URL
- category: one of "World", "Technology", "Science", "Business", "Health", "Sports"

Return a JSON array only, no markdown, no explanation.

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
        raw_response = msg.content[0].text.strip()
        raw_response = raw_response.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        items = json.loads(raw_response)
    except Exception as e:
        print(f"[trending] Claude error: {e}")
        return []

    now = datetime.utcnow().isoformat() + "Z"
    articles = [
        {
            "id": str(uuid.uuid4()),
            "title": item.get("title", ""),
            "summary": item.get("summary", ""),
            "source": item.get("source", ""),
            "url": item.get("url", ""),
            "category": item.get("category", "World"),
            "fetched_at": now,
        }
        for item in items
        if isinstance(item, dict)
    ]
    _save_json(TRENDING_FILE, articles)
    print(f"[trending] Saved {len(articles)} articles")
    return articles


@app.get("/trending-articles")
async def get_trending_articles():
    """Return today's cached trending articles, refreshing if stale."""
    cached = _load_json(TRENDING_FILE, [])
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if cached and cached[0].get("fetched_at", "").startswith(today):
        return cached
    return await _fetch_trending_articles()


@app.post("/trending-articles/refresh")
async def refresh_trending_articles():
    articles = await _fetch_trending_articles()
    return {"count": len(articles)}


# ── Gmail Poller ──────────────────────────────────────────────────────────────

NOREPLY_PATTERNS = [
    "noreply", "no-reply", "donotreply", "mailer-daemon",
    "notifications@", "updates@", "alerts@", "newsletter@",
    "automated@", "bounce@",
]


def _decode_str(value: str | bytes | None) -> str:
    """Decode a possibly-encoded email header value to a plain string."""
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    parts = decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded).strip()


def _extract_email_address(from_header: str) -> tuple[str, str]:
    """Return (email_address, display_name) from a From header."""
    match = re.search(r'<([^>]+)>', from_header)
    if match:
        addr = match.group(1).strip()
        name_match = re.match(r'^"?(.+?)"?\s*<', from_header)
        name = name_match.group(1).strip().strip('"') if name_match else addr
    else:
        addr = from_header.strip()
        name = addr
    return addr, name


def _get_plain_text(msg) -> str:
    """Extract plain-text body from an email.message.Message object."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in cd:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                body = payload.decode(charset, errors="replace")
                break
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        if payload:
            body = payload.decode(charset, errors="replace")

    # Strip quoted reply lines ("> ...")
    clean = "\n".join(
        ln for ln in body.splitlines()
        if not ln.strip().startswith(">")
    )
    return clean.strip()[:1200]


def _gmail_fetch_new(gmail_user: str, gmail_pass: str) -> list[dict]:
    """Fetch emails newer than the stored UID watermark. Does not rely on SEEN flag."""
    try:
        watermarks = _load_json(GMAIL_WATERMARK_FILE, {})
        last_uid = watermarks.get(gmail_user, 0)

        imap = imaplib.IMAP4_SSL("imap.gmail.com")
        imap.login(gmail_user, gmail_pass)
        imap.select("INBOX")

        # Fetch by UID greater than watermark
        search_criterion = f"UID {last_uid + 1}:*"
        status, data = imap.uid("search", None, search_criterion)
        if status != "OK" or not data[0]:
            imap.logout()
            return []

        all_uids = data[0].split()
        if not all_uids:
            imap.logout()
            return []

        # Only process the 10 most recent to avoid timeouts
        uids_to_fetch = all_uids[-10:]
        new_watermark = int(uids_to_fetch[-1])

        results = []
        for uid in uids_to_fetch:
            status, raw = imap.uid("fetch", uid, "(RFC822)")
            if status != "OK" or not raw or raw[0] is None:
                continue

            msg = email_lib.message_from_bytes(raw[0][1])
            message_id = msg.get("Message-ID", "").strip() or f"uid:{uid.decode()}"
            subject    = _decode_str(msg.get("Subject", "(no subject)"))
            from_raw   = _decode_str(msg.get("From", ""))
            sender_email, sender_name = _extract_email_address(from_raw)
            body = _get_plain_text(msg)

            results.append({
                "message_id": message_id,
                "subject": subject,
                "sender_email": sender_email,
                "sender_name": sender_name,
                "body": body,
            })

        imap.logout()

        # Update watermark
        watermarks[gmail_user] = new_watermark
        _save_json(GMAIL_WATERMARK_FILE, watermarks)

        return results
    except Exception as e:
        print(f"[gmail] IMAP error: {e}")
        return []


def _gmail_send(gmail_user: str, gmail_pass: str,
                to_addr: str, to_name: str,
                subject: str, body: str) -> bool:
    """Send an email reply via Gmail SMTP."""
    try:
        re_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        msg = MIMEMultipart()
        msg["From"]    = gmail_user
        msg["To"]      = f"{to_name} <{to_addr}>" if to_name else to_addr
        msg["Subject"] = re_subject
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, gmail_pass)
            server.send_message(msg)
        print(f"[gmail] Sent reply to {to_addr}")
        return True
    except Exception as e:
        print(f"[gmail] SMTP error: {e}")
        return False


# ── Twilio SMS ─────────────────────────────────────────────────────────────────

def _twilio_send_sms(to_number: str, body: str) -> bool:
    """Send an SMS via Twilio REST API."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_PHONE_NUMBER:
        print("[twilio] SMS not configured (missing env vars)")
        return False
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=to_number,
        )
        print(f"[twilio] SMS sent to {to_number} sid={msg.sid}")
        return True
    except Exception as e:
        print(f"[twilio] SMS send error: {e}")
        return False


def _sms_get_history(phone_number: str) -> list[dict]:
    """Return last 10 SMS exchanges with a given number."""
    history = _load_json(SMS_HISTORY_FILE, {})
    return history.get(phone_number, [])[-10:]


def _sms_append_history(phone_number: str, role: str, content: str) -> None:
    """Append a message to the SMS conversation history."""
    history = _load_json(SMS_HISTORY_FILE, {})
    thread = history.get(phone_number, [])
    thread.append({"role": role, "content": content})
    history[phone_number] = thread[-50:]  # keep last 50 per contact
    _save_json(SMS_HISTORY_FILE, history)


async def _draft_reply_options(sender_name: str, message: str,
                               subject: str | None = None) -> list[str]:
    """Call Claude Haiku to generate 3 reply options (brief, friendly, formal). Returns list."""
    import anthropic as _anthropic
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if not anthropic_key:
        return []

    subject_line = f"\nSubject: {subject}" if subject else ""
    system = (
        "You are drafting reply options on behalf of the user to an email. "
        "Generate exactly 3 reply options with different tones:\n"
        "1. Brief: 1-2 sentences, straight to the point\n"
        "2. Friendly: 2-3 sentences, warm and conversational\n"
        "3. Formal: 2-4 sentences, professional and polished\n\n"
        "Return ONLY a JSON array of 3 strings, no other text. Example:\n"
        '[\"Brief reply here.\", \"Friendly reply here.\", \"Formal reply here.\"]'
    )
    messages = [{
        "role": "user",
        "content": f"From: {sender_name}{subject_line}\n\n{message}\n\nGenerate 3 reply options:",
    }]
    try:
        ac = _anthropic.Anthropic(api_key=anthropic_key)
        msg = await asyncio.to_thread(
            lambda: ac.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                system=system,
                messages=messages,
            )
        )
        raw = msg.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw).strip()
        # Try JSON parse first
        try:
            options = json.loads(raw)
            if isinstance(options, list) and len(options) >= 1:
                # Pad to 3 if needed
                while len(options) < 3:
                    options.append(options[-1])
                return [str(o) for o in options[:3]]
        except json.JSONDecodeError:
            pass
        # Fallback: use raw text as single option, duplicate for the other two
        print(f"[gmail] Draft options JSON parse failed, using raw text as fallback")
        return [raw, raw, raw]
    except Exception as e:
        print(f"[gmail] Draft options error: {e}")
        return []


def _get_gmail_accounts() -> list[dict]:
    """Return list of {nickname, user, password} dicts from env vars.

    Supports two formats:
    1. Multi-account JSON: GMAIL_ACCOUNTS='[{"nickname":"Work","user":"a@gmail.com","password":"xxxx"},...]'
    2. Legacy single-account: GMAIL_USER + GMAIL_APP_PASSWORD (nickname defaults to "Gmail")
    """
    raw = os.environ.get("GMAIL_ACCOUNTS")
    if raw:
        try:
            accounts = json.loads(raw)
            return [a for a in accounts if a.get("user") and a.get("password")]
        except Exception as e:
            print(f"[gmail] Failed to parse GMAIL_ACCOUNTS JSON: {e}")

    # Legacy fallback
    user = os.environ.get("GMAIL_USER")
    pwd  = os.environ.get("GMAIL_APP_PASSWORD")
    if user and pwd:
        return [{"nickname": "Gmail", "user": user, "password": pwd}]
    return []


async def _poll_gmail_account(account: dict) -> int:
    """Poll a single Gmail account. Returns count of new items."""
    nickname = account.get("nickname", "Gmail")
    gmail_user = account["user"]
    gmail_pass = account["password"]

    print(f"[gmail:{nickname}] Polling inbox…")
    emails = await asyncio.to_thread(_gmail_fetch_new, gmail_user, gmail_pass)
    if not emails:
        return 0

    # Load existing records to skip already-processed message IDs
    existing = _load_json(PENDING_REPLIES_FILE, [])
    existing_chat_ids = {r.get("chat_id", "") for r in existing}

    new_count = 0
    for em in emails:
        chat_id = f"email:{em['message_id']}"
        if chat_id in existing_chat_ids:
            continue

        sender_email = em["sender_email"]
        sender_name  = em["sender_name"]
        subject      = em["subject"]
        body         = em["body"]

        # Skip automated/noreply senders
        if any(p in sender_email.lower() for p in NOREPLY_PATTERNS):
            print(f"[gmail:{nickname}] Skipping automated sender: {sender_email}")
            continue

        if not body.strip():
            continue

        print(f"[gmail:{nickname}] New email from {sender_name} <{sender_email}>: {subject[:50]}")

        options = await _draft_reply_options(sender_name, body, subject)
        if not options:
            continue
        draft = options[0]  # first option as default

        record = {
            "id": str(uuid.uuid4()),
            "sender_name": sender_name,
            "sender_handle": sender_email,
            "chat_id": chat_id,
            "original_message": body,
            "draft_reply": draft,
            "draft_options": options,
            "source": "email",
            "subject": subject,
            "sender_email": sender_email,
            "gmail_account": gmail_user,
            "gmail_nickname": nickname,
            "status": "pending",
            "approved_text": None,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }
        records = _load_json(PENDING_REPLIES_FILE, [])
        records.append(record)
        _save_json(PENDING_REPLIES_FILE, records)
        existing_chat_ids.add(chat_id)
        new_count += 1

        # Push notify
        devices = _load_json(DEVICES_FILE, [])
        tokens = [d["token"] for d in devices if d.get("token")]
        if tokens:
            async with httpx.AsyncClient() as client:
                for token in tokens:
                    try:
                        resp = await client.post(
                            "https://exp.host/--/api/v2/push/send",
                            json={
                                "to": token,
                                "title": f"✉️ [{nickname}] Email from {sender_name}",
                                "body": subject,
                                "sound": "default",
                                "data": {"type": "pending_reply", "id": record["id"], "draft": draft},
                                "categoryId": "PENDING_REPLY",
                            },
                        )
                        print(f"[push] token={token[:20]}... status={resp.status_code} body={resp.text[:200]}")
                    except Exception as e:
                        print(f"[push] error: {e}")

    print(f"[gmail:{nickname}] {new_count} new emails queued")
    return new_count


async def _poll_gmail() -> int:
    """Poll all configured Gmail accounts. Returns total count of new items."""
    accounts = _get_gmail_accounts()
    if not accounts:
        return 0
    total = 0
    for account in accounts:
        total += await _poll_gmail_account(account)
    return total


@app.get("/gmail/status")
async def gmail_status():
    """Check whether Gmail credentials are configured."""
    accounts = _get_gmail_accounts()
    return {
        "configured": len(accounts) > 0,
        "accounts": [{"nickname": a.get("nickname", "Gmail"), "user": a["user"]} for a in accounts],
    }


@app.get("/smtp-config")
async def smtp_config():
    """Return Gmail SMTP credentials for the Mac companion to use directly.
    The companion cannot send via Mail.app reliably; it uses smtplib instead."""
    accounts = _get_gmail_accounts()
    if not accounts:
        raise HTTPException(status_code=404, detail="No Gmail accounts configured")
    # Return all accounts so companion can match sender_email → credentials
    return {"accounts": [{"user": a["user"], "password": a["password"]} for a in accounts]}


@app.post("/gmail/poll")
async def gmail_poll_now():
    """Manually trigger a Gmail inbox poll."""
    count = await _poll_gmail()
    return {"new_emails": count}


@app.get("/gmail/debug")
async def gmail_debug():
    """Test IMAP connection and return unread email count."""
    accounts = _get_gmail_accounts()
    if not accounts:
        return {"error": "No Gmail accounts configured"}
    results = []
    for acct in accounts:
        try:
            imap = imaplib.IMAP4_SSL("imap.gmail.com")
            imap.login(acct["user"], acct["password"])
            imap.select("INBOX")
            _, data = imap.uid("search", None, "ALL")
            all_ids = data[0].split() if data[0] else []
            watermarks = _load_json(GMAIL_WATERMARK_FILE, {})
            last_uid = watermarks.get(acct["user"], 0)
            imap.logout()
            results.append({
                "nickname": acct.get("nickname", "Gmail"),
                "user": acct["user"],
                "status": "ok",
                "total_emails": len(all_ids),
                "last_processed_uid": last_uid,
            })
        except Exception as e:
            results.append({
                "nickname": acct.get("nickname", "Gmail"),
                "user": acct["user"],
                "status": "error",
                "error": str(e),
            })
    return {"accounts": results}


# ── Twilio SMS routes ──────────────────────────────────────────────────────────

@app.post("/twilio/incoming")
async def twilio_incoming(request: Request):
    """Twilio webhook — called when an SMS arrives on our Twilio number."""
    form = await request.form()
    from_number = form.get("From", "")
    body        = (form.get("Body") or "").strip()

    if not from_number or not body:
        return Response(content="<Response/>", media_type="application/xml")

    print(f"[twilio] SMS from {from_number}: {body[:80]}")

    # Build conversation history for context
    history = _sms_get_history(from_number)
    _sms_append_history(from_number, "user", body)

    # Use display name from history metadata if we have one; fall back to number
    sender_name = from_number

    # Draft 3 reply options
    options = await _draft_reply_options(sender_name=sender_name, message=body, subject=None)
    draft_reply = options[0] if options else ""

    record_id = str(uuid.uuid4())
    record = {
        "id": record_id,
        "sender_name": sender_name,
        "sender_handle": from_number,
        "chat_id": from_number,
        "original_message": body,
        "draft_reply": draft_reply,
        "draft_options": options,
        "source": "sms",
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }
    records = _load_json(PENDING_REPLIES_FILE, [])
    records.append(record)
    _save_json(PENDING_REPLIES_FILE, records)

    # Forward to personal number via SMS
    if MY_PHONE_NUMBER:
        fwd = f"SMS from {from_number}:\n{body}"
        await asyncio.to_thread(_twilio_send_sms, MY_PHONE_NUMBER, fwd)

    # Push notification
    if draft_reply:
        devices = _load_json(DEVICES_FILE, [])
        tokens = [d["token"] for d in devices if d.get("token")]
        if tokens:
            async with httpx.AsyncClient() as client:
                for token in tokens:
                    payload = {
                        "to": token,
                        "title": f"💬 SMS from {sender_name}",
                        "body": body,
                        "sound": "default",
                        "data": {
                            "type": "pending_reply",
                            "id": record_id,
                            "draft": draft_reply,
                            "categoryId": "PENDING_REPLY",
                        },
                    }
                    try:
                        await client.post("https://exp.host/--/api/v2/push/send", json=payload)
                        print(f"[push] SMS notification sent to token ...{token[-10:]}")
                    except Exception:
                        pass

    # Return empty TwiML — we never auto-reply; human approves first
    return Response(content="<Response/>", media_type="application/xml")


@app.get("/twilio/status")
async def twilio_status():
    return {
        "configured": bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER),
        "phone_number": TWILIO_PHONE_NUMBER or None,
    }


# ── Scheduler ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_dispatch_due_reminders, "interval", minutes=1)
    scheduler.add_job(_fetch_ai_feed, "cron", hour=8, minute=0)
    scheduler.add_job(_fetch_suggestions, "cron", hour=7, minute=0)
    scheduler.add_job(_fetch_trending_articles, "cron", hour=7, minute=30)
    scheduler.add_job(_poll_gmail, "interval", minutes=5)
    scheduler.start()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)

