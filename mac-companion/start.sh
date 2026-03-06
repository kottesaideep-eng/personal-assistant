#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Config ─────────────────────────────────────────────────────────────────────
export ROAR_BACKEND_URL="${ROAR_BACKEND_URL:-https://web-production-e4f17.up.railway.app}"

# ── Setup venv ─────────────────────────────────────────────────────────────────
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# ── Permissions reminder ────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Roar Mac Companion"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Backend URL: $ROAR_BACKEND_URL"
echo ""
echo "  Required permissions (one-time setup):"
echo "  1. System Settings → Privacy & Security → Full Disk Access"
echo "     → Add Terminal (so it can read ~/Library/Messages/chat.db)"
echo ""
echo "  2. System Settings → Privacy & Security → Automation"
echo "     → Terminal → Messages ✓"
echo "     (so AppleScript can send via Messages.app)"
echo ""
echo "  Starting companion..."
echo ""

python3 companion.py
