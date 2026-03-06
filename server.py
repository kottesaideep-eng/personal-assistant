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


# ── Scheduler ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_dispatch_due_reminders, "interval", minutes=1)
    scheduler.start()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
