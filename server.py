"""FastAPI server — exposes the personal assistant as a REST API."""

import asyncio
import json
import os
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
