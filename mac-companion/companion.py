"""Mac companion — watches chat.db for new iMessages, drafts AI replies,
sends push notifications, and dispatches approved replies via AppleScript."""

import os
import sqlite3
import subprocess
import threading
import time

import requests

BACKEND_URL = os.environ.get("ROAR_BACKEND_URL", "http://localhost:8000")
CHAT_DB = os.path.expanduser("~/Library/Messages/chat.db")
POLL_MESSAGES_INTERVAL = 3   # seconds
POLL_APPROVED_INTERVAL = 5   # seconds
HISTORY_CONTEXT = 10         # messages to include as chat history

sent_ids: set[str] = set()
sent_lock = threading.Lock()


# ── SQLite helpers ─────────────────────────────────────────────────────────────

def open_db():
    uri = f"file:{CHAT_DB}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def get_max_rowid(conn) -> int:
    row = conn.execute("SELECT MAX(ROWID) as m FROM message").fetchone()
    return row["m"] or 0


def get_new_messages(conn, watermark: int):
    """Return incoming messages with ROWID > watermark."""
    sql = """
        SELECT
            m.ROWID,
            m.text,
            m.date,
            h.id          AS sender_handle,
            COALESCE(h.uncanonicalized_id, h.id) AS sender_name,
            c.chat_identifier
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat c ON c.ROWID = cmj.chat_id
        LEFT JOIN handle h ON h.ROWID = m.handle_id
        WHERE m.is_from_me = 0
          AND m.ROWID > ?
          AND m.text IS NOT NULL
          AND m.text != ''
        ORDER BY m.ROWID ASC
    """
    return conn.execute(sql, (watermark,)).fetchall()


def get_chat_history(conn, chat_identifier: str, before_rowid: int) -> list[dict]:
    """Return last HISTORY_CONTEXT messages in the thread before the given message."""
    sql = """
        SELECT
            m.text,
            m.is_from_me
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        JOIN chat c ON c.ROWID = cmj.chat_id
        WHERE c.chat_identifier = ?
          AND m.ROWID < ?
          AND m.text IS NOT NULL
          AND m.text != ''
        ORDER BY m.ROWID DESC
        LIMIT ?
    """
    rows = conn.execute(sql, (chat_identifier, before_rowid, HISTORY_CONTEXT)).fetchall()
    history = []
    for row in reversed(rows):
        role = "assistant" if row["is_from_me"] else "user"
        history.append({"role": role, "content": row["text"]})
    return history


# ── AppleScript sender ─────────────────────────────────────────────────────────

def send_via_applescript(chat_identifier: str, sender_handle: str, text: str) -> bool:
    """Send a message through Messages.app via AppleScript."""
    # Escape double quotes in text
    safe_text = text.replace('"', '\\"')

    is_group = chat_identifier.startswith("chat")

    if is_group:
        script = f'''
tell application "Messages"
    set targetChat to first chat whose id is "{chat_identifier}"
    send "{safe_text}" to targetChat
end tell
'''
    else:
        script = f'''
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "{sender_handle}" of targetService
    send "{safe_text}" to targetBuddy
end tell
'''

    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[companion] AppleScript error: {result.stderr.strip()}")
        return False
    return True


# ── Backend API helpers ────────────────────────────────────────────────────────

def call_chat(message: str, history: list[dict]) -> str | None:
    """POST /chat and return draft reply text."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/chat",
            json={"message": message, "history": history},
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json().get("reply", "")
    except Exception as e:
        print(f"[companion] /chat error: {e}")
        return None


def post_pending_reply(sender_name: str, sender_handle: str, chat_id: str,
                       original_message: str, draft_reply: str) -> str | None:
    """POST /pending-reply and return the record id."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/pending-reply",
            json={
                "sender_name": sender_name,
                "sender_handle": sender_handle,
                "chat_id": chat_id,
                "original_message": original_message,
                "draft_reply": draft_reply,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        print(f"[companion] /pending-reply error: {e}")
        return None


def send_push(title: str, body: str, data: dict | None = None) -> None:
    try:
        requests.post(
            f"{BACKEND_URL}/push-notify",
            json={"title": title, "body": body, "data": data or {}},
            timeout=10,
        )
    except Exception as e:
        print(f"[companion] /push-notify error: {e}")


def get_pending_replies() -> list[dict]:
    try:
        resp = requests.get(f"{BACKEND_URL}/pending-replies", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"[companion] /pending-replies error: {e}")
        return []


def dismiss_reply(reply_id: str) -> None:
    try:
        requests.patch(f"{BACKEND_URL}/pending-reply/{reply_id}/dismiss", timeout=10)
    except Exception as e:
        print(f"[companion] dismiss error: {e}")


# ── Thread 1 — message watcher ─────────────────────────────────────────────────

def message_watcher():
    conn = open_db()
    watermark = get_max_rowid(conn)
    print(f"[companion] Starting message watcher (watermark={watermark})")

    while True:
        try:
            rows = get_new_messages(conn, watermark)
            for row in rows:
                rowid = row["ROWID"]
                text = row["text"]
                sender_handle = row["sender_handle"] or ""
                sender_name = row["sender_name"] or sender_handle
                chat_identifier = row["chat_identifier"] or ""

                print(f"[companion] New message from {sender_name}: {text[:60]}")

                history = get_chat_history(conn, chat_identifier, rowid)
                draft = call_chat(text, history)
                if not draft:
                    watermark = max(watermark, rowid)
                    continue

                record_id = post_pending_reply(
                    sender_name=sender_name,
                    sender_handle=sender_handle,
                    chat_id=chat_identifier,
                    original_message=text,
                    draft_reply=draft,
                )

                if record_id:
                    send_push(
                        title=f"iMessage from {sender_name}",
                        body="Tap to review Roar's draft reply",
                        data={"type": "pending_reply", "id": record_id},
                    )

                watermark = max(watermark, rowid)

        except Exception as e:
            print(f"[companion] watcher error: {e}")
            try:
                conn.close()
            except Exception:
                pass
            try:
                conn = open_db()
            except Exception:
                pass

        time.sleep(POLL_MESSAGES_INTERVAL)


# ── Thread 2 — approved reply sender ──────────────────────────────────────────

def approved_sender():
    print("[companion] Starting approved reply sender")
    while True:
        try:
            records = get_pending_replies()
            approved = [r for r in records if r.get("status") == "approved"]

            for record in approved:
                reply_id = record["id"]
                with sent_lock:
                    if reply_id in sent_ids:
                        continue
                    sent_ids.add(reply_id)

                approved_text = record.get("approved_text") or record.get("draft_reply", "")
                chat_id = record.get("chat_id", "")
                sender_handle = record.get("sender_handle", "")

                print(f"[companion] Sending approved reply for {reply_id}: {approved_text[:60]}")
                ok = send_via_applescript(chat_id, sender_handle, approved_text)
                if ok:
                    dismiss_reply(reply_id)
                else:
                    # Remove from sent_ids so it can be retried
                    with sent_lock:
                        sent_ids.discard(reply_id)

        except Exception as e:
            print(f"[companion] sender error: {e}")

        time.sleep(POLL_APPROVED_INTERVAL)


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"[companion] Backend: {BACKEND_URL}")
    print(f"[companion] chat.db: {CHAT_DB}")

    t1 = threading.Thread(target=message_watcher, daemon=True)
    t2 = threading.Thread(target=approved_sender, daemon=True)
    t1.start()
    t2.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[companion] Stopped.")
