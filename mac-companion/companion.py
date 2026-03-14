"""Mac companion — watches iMessages and Apple Mail for new messages,
drafts AI replies via Roar backend, and dispatches approved replies."""

import os
import re
import sqlite3
import subprocess
import threading
import time

import requests

BACKEND_URL = os.environ.get("ROAR_BACKEND_URL", "http://localhost:8000")
CHAT_DB = os.path.expanduser("~/Library/Messages/chat.db")
POLL_MESSAGES_INTERVAL = 3    # seconds
POLL_EMAIL_INTERVAL    = 30   # seconds
POLL_APPROVED_INTERVAL = 5    # seconds
HISTORY_CONTEXT        = 10   # iMessage history to include

sent_ids: set[str] = set()
sent_lock = threading.Lock()


# ── SQLite helpers (iMessage) ──────────────────────────────────────────────────

def open_db():
    uri = f"file:{CHAT_DB}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def get_max_rowid(conn) -> int:
    row = conn.execute("SELECT MAX(ROWID) as m FROM message").fetchone()
    return row["m"] or 0


def get_new_messages(conn, watermark: int):
    """Return incoming iMessages with ROWID > watermark."""
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
        SELECT m.text, m.is_from_me
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


# ── AppleScript — iMessage sender ─────────────────────────────────────────────

def send_imessage_via_applescript(chat_identifier: str, sender_handle: str, text: str) -> bool:
    safe_text = text.replace('"', '\\"').replace("\\", "\\\\")
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

    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[companion] iMessage AppleScript error: {result.stderr.strip()}")
        return False
    return True


# ── AppleScript — Apple Mail reader ───────────────────────────────────────────

def get_unread_emails() -> list[dict]:
    """Read unread emails from Mail.app inbox via AppleScript. Marks them as read."""
    script = r'''
tell application "Mail"
    set acct to first account
    set inbox to missing value
    repeat with boxName in {"INBOX", "Inbox", "inbox"}
        try
            set inbox to mailbox boxName of acct
            exit repeat
        end try
    end repeat
    if inbox is missing value then
        return {}
    end if
    set unreadMsgs to (messages of inbox whose read status is false)
    set output to {}
    repeat with msg in unreadMsgs
        set msgId to (id of msg) as string
        set msgSubject to subject of msg
        set msgSender to sender of msg
        set msgContent to content of msg
        if length of msgContent > 1200 then
            set msgContent to (text 1 thru 1200 of msgContent) & "..."
        end if
        set read status of msg to true
        set end of output to msgId & "||" & msgSubject & "||" & msgSender & "||" & msgContent
    end repeat
    return output
end tell
'''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[companion] Mail.app read error: {result.stderr.strip()}")
        return []

    raw = result.stdout.strip()
    if not raw:
        return []

    emails = []
    # AppleScript returns a comma-separated list of items
    for item in raw.split(", "):
        parts = item.split("||")
        if len(parts) < 4:
            continue
        msg_id, subject, sender_raw, content = parts[0], parts[1], parts[2], "||".join(parts[3:])

        # Parse "Name <email@example.com>" or just "email@example.com"
        email_match = re.search(r'<([^>]+)>', sender_raw)
        sender_email = email_match.group(1) if email_match else sender_raw.strip()
        sender_name_match = re.match(r'^(.+?)\s*<', sender_raw)
        sender_name = sender_name_match.group(1).strip() if sender_name_match else sender_email

        # Strip quoted reply sections (lines starting with ">")
        clean_lines = [ln for ln in content.splitlines() if not ln.strip().startswith(">")]
        clean_content = "\n".join(clean_lines).strip()

        emails.append({
            "id": msg_id,
            "subject": subject.strip(),
            "sender_name": sender_name,
            "sender_email": sender_email,
            "content": clean_content[:1000],
        })

    return emails


# ── AppleScript — Apple Mail sender ───────────────────────────────────────────

def send_email_via_applescript(to_address: str, to_name: str, subject: str, body: str) -> bool:
    """Send an email reply via Mail.app."""
    re_subject = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    safe_body    = body.replace('"', '\\"').replace("\\", "\\\\").replace("\n", "\\n")
    safe_subject = re_subject.replace('"', '\\"')
    safe_to      = to_address.replace('"', '\\"')
    safe_name    = to_name.replace('"', '\\"')

    script = f'''
tell application "Mail"
    set newMsg to make new outgoing message with properties {{subject:"{safe_subject}", content:"{safe_body}", visible:false}}
    tell newMsg
        make new to recipient with properties {{address:"{safe_to}", name:"{safe_name}"}}
    end tell
    send newMsg
end tell
'''
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[companion] Mail.app send error: {result.stderr.strip()}")
        return False
    return True


# ── Backend API helpers ────────────────────────────────────────────────────────

def call_draft_reply(sender_name: str, message: str, history: list[dict],
                     source: str = "imessage", subject: str | None = None) -> str | None:
    """POST /draft-reply — get a short, natural AI draft (no tool use)."""
    try:
        resp = requests.post(
            f"{BACKEND_URL}/draft-reply",
            json={
                "sender_name": sender_name,
                "message": message,
                "history": history,
                "source": source,
                "subject": subject,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("reply", "")
    except Exception as e:
        print(f"[companion] /draft-reply error: {e}")
        return None


def post_pending_reply(sender_name: str, sender_handle: str, chat_id: str,
                       original_message: str, draft_reply: str,
                       source: str = "imessage", subject: str | None = None,
                       sender_email: str | None = None) -> str | None:
    try:
        resp = requests.post(
            f"{BACKEND_URL}/pending-reply",
            json={
                "sender_name": sender_name,
                "sender_handle": sender_handle,
                "chat_id": chat_id,
                "original_message": original_message,
                "draft_reply": draft_reply,
                "source": source,
                "subject": subject,
                "sender_email": sender_email,
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


# ── Thread 1 — iMessage watcher ───────────────────────────────────────────────

def message_watcher():
    conn = open_db()
    watermark = get_max_rowid(conn)
    print(f"[companion] iMessage watcher started (watermark={watermark})")

    while True:
        try:
            rows = get_new_messages(conn, watermark)
            for row in rows:
                rowid         = row["ROWID"]
                text          = row["text"]
                sender_handle = row["sender_handle"] or ""
                sender_name   = row["sender_name"] or sender_handle
                chat_identifier = row["chat_identifier"] or ""

                print(f"[companion] iMessage from {sender_name}: {text[:60]}")

                history = get_chat_history(conn, chat_identifier, rowid)
                draft = call_draft_reply(sender_name, text, history, source="imessage")
                if not draft:
                    watermark = max(watermark, rowid)
                    continue

                record_id = post_pending_reply(
                    sender_name=sender_name,
                    sender_handle=sender_handle,
                    chat_id=chat_identifier,
                    original_message=text,
                    draft_reply=draft,
                    source="imessage",
                )

                if record_id:
                    send_push(
                        title=f"💬 iMessage from {sender_name}",
                        body=draft,
                        data={"type": "pending_reply", "id": record_id, "draft": draft, "categoryId": "PENDING_REPLY"},
                    )

                watermark = max(watermark, rowid)

        except Exception as e:
            print(f"[companion] iMessage watcher error: {e}")
            try:
                conn.close()
            except Exception:
                pass
            try:
                conn = open_db()
            except Exception:
                pass

        time.sleep(POLL_MESSAGES_INTERVAL)


# ── Thread 2 — Email watcher ──────────────────────────────────────────────────

def email_watcher():
    processed_ids: set[str] = set()
    print("[companion] Email watcher started")

    while True:
        try:
            emails = get_unread_emails()
            for email in emails:
                msg_id = email["id"]
                if msg_id in processed_ids:
                    continue
                processed_ids.add(msg_id)

                sender_name  = email["sender_name"]
                sender_email = email["sender_email"]
                subject      = email["subject"]
                content      = email["content"]

                # Skip automated/noreply emails
                noreply_patterns = ["noreply", "no-reply", "donotreply", "notifications@", "mailer@"]
                if any(p in sender_email.lower() for p in noreply_patterns):
                    print(f"[companion] Skipping automated email from {sender_email}")
                    continue

                print(f"[companion] Email from {sender_name} <{sender_email}>: {subject[:50]}")

                draft = call_draft_reply(
                    sender_name=sender_name,
                    message=content,
                    history=[],
                    source="email",
                    subject=subject,
                )
                if not draft:
                    continue

                record_id = post_pending_reply(
                    sender_name=sender_name,
                    sender_handle=sender_email,
                    chat_id=f"email:{msg_id}",
                    original_message=content,
                    draft_reply=draft,
                    source="email",
                    subject=subject,
                    sender_email=sender_email,
                )

                if record_id:
                    send_push(
                        title=f"✉️ Email from {sender_name}",
                        body=draft,
                        data={"type": "pending_reply", "id": record_id, "draft": draft, "categoryId": "PENDING_REPLY"},
                    )

        except Exception as e:
            print(f"[companion] email watcher error: {e}")

        time.sleep(POLL_EMAIL_INTERVAL)


# ── Thread 3 — Approved reply sender ─────────────────────────────────────────

def approved_sender():
    print("[companion] Approved reply sender started")
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
                source        = record.get("source", "imessage")

                if source == "email":
                    sender_email = record.get("sender_email", "")
                    sender_name  = record.get("sender_name", "")
                    subject      = record.get("subject", "")
                    print(f"[companion] Sending email reply to {sender_email}: {approved_text[:60]}")
                    ok = send_email_via_applescript(sender_email, sender_name, subject, approved_text)
                else:
                    chat_id       = record.get("chat_id", "")
                    sender_handle = record.get("sender_handle", "")
                    print(f"[companion] Sending iMessage reply for {reply_id}: {approved_text[:60]}")
                    ok = send_imessage_via_applescript(chat_id, sender_handle, approved_text)

                if ok:
                    dismiss_reply(reply_id)
                else:
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
    t2 = threading.Thread(target=email_watcher,   daemon=True)
    t3 = threading.Thread(target=approved_sender, daemon=True)
    t1.start()
    t2.start()
    t3.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[companion] Stopped.")
