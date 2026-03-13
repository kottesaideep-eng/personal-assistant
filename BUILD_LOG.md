# Personal Assistant App — Build Log

A complete record of all prompts, decisions, commands, and fixes used to build this multi-agent personal assistant from scratch.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Phase 1 — Python Backend](#phase-1--python-backend)
3. [Phase 2 — Railway Deployment](#phase-2--railway-deployment)
4. [Phase 3 — GitHub Setup](#phase-3--github-setup)
5. [Phase 4 — React Native Mobile App](#phase-4--react-native-mobile-app)
6. [Phase 5 — Bug Fixes & Debugging](#phase-5--bug-fixes--debugging)
7. [Phase 6 — UI Polish](#phase-6--ui-polish)
8. [All User Prompts (Chronological)](#all-user-prompts-chronological)
9. [All Shell Commands Executed](#all-shell-commands-executed)
10. [Files Created](#files-created)
11. [Environment Variables Required](#environment-variables-required)
12. [Architecture Decisions](#architecture-decisions)

---

## Project Overview

**Goal:** A multi-agent personal assistant accessible from an iOS/Android phone.

**Stack:**
- **AI:** Claude Opus 4.6 (Anthropic) with adaptive thinking
- **Backend:** Python + FastAPI, deployed on Railway
- **Mobile:** Expo (React Native) app tested via Expo Go
- **Storage:** Railway persistent volume at `/data`
- **Web Search:** Tavily API (replaced DuckDuckGo)
- **Version Control:** GitHub (SSH authentication)

---

## Phase 1 — Python Backend

### User Prompts
```
"create a folder"
"personal_assistant"
"build a personal assistant app in this folder which is a multi agent app
 with orchestrator + sub-agents (web search, calendar, notes, reminders,
 memory, file management) and persistent memory"
```

### Files Created

#### `tools/config.py`
Centralizes data directory paths. Reads `DATA_DIR` and `WORKSPACE_DIR` from
environment variables so Railway can override them to use a persistent volume.

```python
def get_data_dir() -> Path:
    env = os.environ.get("DATA_DIR")
    if env:
        return Path(env)
    return Path.home() / ".personal_assistant" / "data"
```

#### `tools/web_search.py`
Initial version used `duckduckgo_search`. Later switched to Tavily API (see Phase 5).

#### `tools/calendar_tool.py`
JSON-backed calendar. Operations: add, list, delete, update events.

#### `tools/notes_tool.py`
Markdown files stored in `DATA_DIR/notes/`. Operations: create, list, read, update, delete.

#### `tools/reminders_tool.py`
JSON-backed reminders with due dates. Operations: set, check, complete, delete.

#### `tools/memory_tool.py`
Long-term key-value memory in `DATA_DIR/memory.json`. Operations: remember, recall, forget.

#### `tools/file_tool.py`
File manager in `WORKSPACE_DIR/`. Operations: list, read, write, delete.

#### `tools/research_agent.py`
Sub-agent: a separate Claude instance that runs its own web-search agentic loop
and returns a synthesized research report. Called via the `research_task` tool.

#### `tools/__init__.py`
Registers all 22 tools and dispatches via `execute_tool(name, inputs)`.

**Full tool list:**
```
web_search, add_calendar_event, list_calendar_events, delete_calendar_event,
update_calendar_event, create_note, list_notes, read_note, update_note,
delete_note, set_reminder, check_reminders, complete_reminder, delete_reminder,
remember, recall, forget, list_files, read_file, write_file, delete_file,
research_task
```

#### `assistant.py`
Orchestrator with two entry points:
- `run_turn()` — CLI mode with Rich console output
- `run_turn_headless()` — API mode (no console output), returns `(reply, history)`

Key implementation details:
- Uses `client.messages.stream()` for real-time streaming
- Full `response.content` (including thinking blocks) preserved during tool use loop
- Explicit API key: `anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))`
- Adaptive thinking: `thinking={"type": "adaptive"}`

#### `main.py`
CLI entry point. Runs a REPL loop calling `run_turn()`.

#### `requirements.txt`
```
anthropic>=0.40.0
rich>=13.0.0
python-dateutil>=2.8.0
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
```

---

## Phase 2 — Railway Deployment

### User Prompts
```
"how can i host this as an app on my phone"
"Railway"
"lets get started"
```

### Files Created

#### `server.py`
FastAPI app wrapping the assistant for HTTP access.

```python
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    reply, updated_history = await asyncio.to_thread(
        run_turn_headless, req.message, history
    )
    return ChatResponse(reply=reply, history=updated_history)
```

Uses `asyncio.to_thread` to bridge the synchronous `run_turn_headless` into
FastAPI's async event loop.

#### `Procfile`
```
web: uvicorn server:app --host 0.0.0.0 --port $PORT
```

#### `railway.toml`
```toml
[build]
builder = "nixpacks"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

### Railway Setup Steps
1. Created Railway account and new project
2. Connected GitHub repo (`kottesaideep-eng/personal-assistant`)
3. Added environment variables (separate Key / Value fields — **not** `KEY=VALUE` format):
   - `ANTHROPIC_API_KEY` — Anthropic API key
   - `TAVILY_API_KEY` — Tavily search API key
   - `DATA_DIR` — `/data` (Railway persistent volume mount)
4. Added a Volume in Railway and mounted it at `/data`
5. Deployed — Railway URL: `https://web-production-e4f17.up.railway.app`

---

## Phase 3 — GitHub Setup

### User Prompts
```
"kottesaideep-eng"  (GitHub username)
"set up SSH keys"
"kotte.saideep@gmail.com"  (email for SSH key)
"done, now test the SSH connection"
```

### Commands Executed
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "kotte.saideep@gmail.com" -f ~/.ssh/id_ed25519 -N ""

# Add to SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Display public key (added to GitHub → Settings → SSH Keys)
cat ~/.ssh/id_ed25519.pub

# Test connection
ssh -T git@github.com

# Switch remote URL to SSH
git remote set-url origin git@github.com:kottesaideep-eng/personal-assistant.git

# Push
git push origin main
```

---

## Phase 4 — React Native Mobile App

### User Prompts
```
"lets get started on step 2"  (mobile app)
"make it look better on the phone"
```

### Scaffold Command (final, working)
```bash
npx create-expo-app@latest mobile-fresh --template blank-typescript
```
This produced React Native 0.81.5, React 19.1.0, Expo SDK 54 — matching
the version installed in Expo Go.

### Files Created

#### `mobile-fresh/src/types.ts`
```typescript
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}
```

#### `mobile-fresh/src/api.ts`
```typescript
export async function sendMessage(
  backendUrl: string,
  message: string,
  history: HistoryItem[]
): Promise<{ reply: string; history: HistoryItem[] }> { ... }

export async function checkHealth(backendUrl: string): Promise<boolean> { ... }
```

#### `mobile-fresh/src/components/SettingsModal.tsx`
Bottom-sheet modal for configuring the Railway backend URL.
Includes a **Test Connection** button that calls `/health`.

#### `mobile-fresh/src/components/MessageBubble.tsx`
Chat bubble component using `react-native-markdown-display` for rich text.
- User bubbles: blue (`#2563eb`), right-aligned
- Assistant bubbles: dark slate (`#1e293b`), left-aligned with robot avatar
- Renders: **bold**, *italic*, `code`, code blocks, lists, blockquotes, links

#### `mobile-fresh/src/components/ChatInput.tsx`
- Animated send button: bounces on press via `Animated.sequence`
- Button active (blue) vs inactive (grey) based on text content
- Multiline input, max 4000 chars

#### `mobile-fresh/App.tsx`
Main screen with:
- `TypingIndicator` component — 3 animated dots using `Animated.loop`
- Suggestion chip grid on empty chat: "Search the web", "Add calendar event",
  "Create a note", "Set a reminder"
- Header: robot emoji avatar + title + online/offline status dot
- ✕ button to clear conversation
- ⚙️ button to open Settings
- `FlatList` auto-scrolls to bottom on new messages
- State: `messages` (display), `apiHistory` (sent to backend), `backendUrl`

### Package Installed
```bash
npm install react-native-markdown-display
```

---

## Phase 5 — Bug Fixes & Debugging

### Bug 1: expo-router Plugin Error
**Error:** `PluginError: Cannot find module 'expo-router/plugin'`
**Fix:** Removed `expo-router` from `plugins` array in `app.json`.
Changed `main` from `expo-router/entry` to `node_modules/expo/AppEntry.js`.

### Bug 2: Missing Expo Packages
**Error:** `Cannot find module 'expo-asset'`
**Fix:**
```bash
npm install expo-asset expo-font expo-modules-core
```

### Bug 3: Expo Go SDK Mismatch
**Error:** SDK 52 app trying to run on Expo Go SDK 54
**Fix:**
```bash
npx expo install --fix
# Full reinstall after package.json update
rm -rf node_modules && npm install
```

### Bug 4: Missing babel-preset-expo
**Error:** `Cannot find module 'babel-preset-expo'`
**Fix:**
```bash
npm install --save-dev babel-preset-expo
```

### Bug 5: TurboModule PlatformConstants Error
**Error:** `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found`
**Root Cause:** Deep version mismatch between React Native packages
**Fix:** Scaffolded a completely fresh project:
```bash
npx create-expo-app@latest mobile-fresh --template blank-typescript
```

### Bug 6: Railway Environment Variable Format
**Error:** `invalid key-value pair '= DATA_DIR=/data': empty key`
**Root Cause:** User entered `KEY=VALUE` in a single field instead of separate Key/Value fields
**Fix:** In Railway dashboard → Variables → add Key in one field, Value in another

### Bug 7: ANTHROPIC_API_KEY Not Found on Railway
**Error:** `AuthenticationError: API key not found`
**Root Cause:** SDK auto-detection failed on Railway
**Fix:** Explicitly pass key in `assistant.py`:
```python
_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
```

### Bug 8: DuckDuckGo Search Returns No Results on Railway
**Root Cause:** Railway server IPs are blocked by DuckDuckGo
**Fix:** Switched to [Tavily API](https://tavily.com) (free tier: 1,000 searches/month)

`tools/web_search.py` rewritten to use Tavily:
```python
def web_search(query: str, max_results: int = 5) -> str:
    api_key = os.environ.get("TAVILY_API_KEY")
    payload = {"api_key": api_key, "query": query, "max_results": max_results}
    # POST to https://api.tavily.com/search
```

### Bug 9: GitHub Push Authentication Failures
**Root Cause:** HTTPS tokens had expired or insufficient permissions
**Fix:** Set up permanent SSH key authentication (see Phase 3)

---

## Phase 6 — UI Polish

### User Prompt
```
"make it look better on the phone"
```

### Changes Made

| Component | Before | After |
|-----------|--------|-------|
| MessageBubble | Plain text only | Markdown rendering (bold, lists, code blocks) |
| ChatInput | Basic button | Animated bounce, active/inactive states |
| App | Simple list | Typing indicator, suggestion chips, polished header |

### Commit
```
Redesign mobile UI with polished chat interface
- MessageBubble: react-native-markdown-display, shadows, border
- ChatInput: animated bounce on send, active/inactive button states
- App: animated 3-dot typing indicator, suggestion chips, online status dot
```

---

## All User Prompts (Chronological)

| # | Prompt |
|---|--------|
| 1 | "create a folder" |
| 2 | "personal_assistant" |
| 3 | "build a personal assistant app in this folder which is a multi agent..." |
| 4 | "try it out" (interrupted) |
| 5 | "how can i host this as an app on my phone" |
| 6 | "Railway" |
| 7 | "lets get started" |
| 8 | "lets get started on step 2" (mobile app) |
| 9 | "kottesaideep-eng" (GitHub username) |
| 10 | "it says no repo found" (Railway GitHub access issue) |
| 11 | "cant find volume in the tabs" |
| 12 | "I FOUND IT" (found Railway volume) |
| 13 | "its online" (Railway deployed) |
| 14 | "the build shows a failure message" |
| 15 | "ERROR: invalid key-value pair '= DATA_DIR=/data': empty key" |
| 16 | "it's deployed now" |
| 17 | "do i have to purchase some credits, or come back in sometime for it to work?" |
| 18 | "ok I've added credits" |
| 19 | "it works now" |
| 20 | "shows an error cannot find module babel preset expo" |
| 21 | "invariant violation: turbomodule registry..." (first occurrence) |
| 22 | "it shows a HTTP response error 404: endpoint is offline" |
| 23 | "invariant violation: turbomodule registry..." (second occurrence) |
| 24 | "in server setting it asks for railway backend url now" |
| 25 | "it's connected" |
| 26 | "it says web search isn't returning results" |
| 27 | "done" (Tavily key added) |
| 28 | "push the mobile app changes to github" |
| 29 | "set up SSH keys" |
| 30 | "kotte.saideep@gmail.com" (email for SSH key) |
| 31 | "done, now test the SSH connection" |
| 32 | "test it by sending a message from the phone" |
| 33 | "it works on my phone" |
| 34 | "make it look better on the phone" |
| 35 | "it's connected" (new UI connected to Railway) |
| 36 | "push the changes to github" |
| 37 | "Could you document all the prompts used to build this app and the queries executed" |
| 38 | "Implement the following plan: Add 6 New Features to Personal Assistant App" |
| 39 | "i need a ios widget as well" |
| 40 | "ok, could you add a feature where i call SARVIS from my phone it should answer" |
| 41 | "Can you name it Roar" |
| 42 | "Can you give the header as Roar-at your service for the app" |

---

## All Shell Commands Executed

### Project Setup
```bash
mkdir -p /Users/sdk/personal_assistant
cd /Users/sdk/personal_assistant
python3 -m venv venv
source venv/bin/activate
pip install anthropic rich python-dateutil
```

### Git Setup
```bash
git init
git add .
git commit -m "Initial commit: multi-agent personal assistant"
git remote add origin https://github.com/kottesaideep-eng/personal-assistant.git
```

### SSH Key Setup
```bash
ssh-keygen -t ed25519 -C "kotte.saideep@gmail.com" -f ~/.ssh/id_ed25519 -N ""
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
ssh -T git@github.com
git remote set-url origin git@github.com:kottesaideep-eng/personal-assistant.git
git push origin main
```

### Expo App — Initial Scaffold Attempts (failed)
```bash
# Attempt 1 — manual setup (SDK mismatch issues)
mkdir mobile && cd mobile
npm init -y
npm install expo react react-native

# Attempt 2 — create-expo-app with SDK 52 (version mismatch with Expo Go)
npx create-expo-app mobile --template blank-typescript
```

### Expo App — Final Working Scaffold
```bash
npx create-expo-app@latest mobile-fresh --template blank-typescript
cd mobile-fresh
npm install react-native-markdown-display
npx expo install --fix
```

### Expo Dev Server
```bash
# Start with tunnel (for Expo Go on phone)
npx expo start --tunnel

# Start fresh (clear cache)
npx expo start --tunnel --clear
```

### Dependency Fixes
```bash
npm install expo-asset expo-font expo-modules-core
npm install --save-dev babel-preset-expo
npx expo install --fix
rm -rf node_modules && npm install
```

---

## Files Created

```
personal_assistant/
├── assistant.py              # Orchestrator (CLI + headless API mode)
├── main.py                   # CLI entry point
├── server.py                 # FastAPI server for Railway
├── Procfile                  # Railway process definition
├── railway.toml              # Railway build/deploy config
├── requirements.txt          # Python dependencies
├── BUILD_LOG.md              # This file
│
├── tools/
│   ├── __init__.py           # 22 tool definitions + dispatcher
│   ├── config.py             # Centralized path config (DATA_DIR, WORKSPACE_DIR)
│   ├── web_search.py         # Tavily API web search
│   ├── calendar_tool.py      # JSON-backed calendar
│   ├── notes_tool.py         # Markdown note files
│   ├── reminders_tool.py     # JSON-backed reminders
│   ├── memory_tool.py        # Long-term key-value memory
│   ├── file_tool.py          # Workspace file manager
│   └── research_agent.py    # Research sub-agent (separate Claude instance)
│
└── mobile-fresh/
    ├── App.tsx               # Main screen (typing indicator, suggestions, header)
    ├── app.json              # Expo config
    ├── package.json          # Node dependencies
    └── src/
        ├── types.ts          # Message + HistoryItem interfaces
        ├── api.ts            # sendMessage() + checkHealth()
        ├── components/
        │   ├── MessageBubble.tsx   # Markdown chat bubbles + long-press copy/share + image
        │   ├── ChatInput.tsx       # Camera button, image preview, mic button + voice
        │   ├── SettingsModal.tsx   # Railway URL configuration
        │   └── HistoryModal.tsx    # Saved conversation list
        ├── utils/
        │   ├── storage.ts          # Conversation save/load/list/delete (AsyncStorage)
        │   └── notifications.ts    # Push token registration + local scheduling
        └── widgets/
            └── AssistantWidget.tsx # Android home screen widget
```

---

## Environment Variables Required

| Variable | Where | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | Railway | Anthropic API key for Claude |
| `TAVILY_API_KEY` | Railway | Tavily API key for web search |
| `DATA_DIR` | Railway | `/data` — path to Railway persistent volume |

---

## Phase 7 — 6 New Features (Copy/Share, Chat History, Images, EAS Build, Voice, Push Notifications, Widget)

### User Prompt
```
"Implement the following plan: Add 6 New Features to Personal Assistant App"
```

### Features Added

#### Step 1 — Message Copy/Share
- Long-press any message bubble → ActionSheetIOS (iOS) or Alert (Android) with "Copy text" / "Share" / "Cancel"
- Uses `expo-clipboard` and `react-native`'s `Share` API
- File: `src/components/MessageBubble.tsx`

#### Step 2 — Chat History
- Auto-saves conversation when tapping ✕ (if there are user messages)
- 📋 history button in header opens `HistoryModal`
- Conversations stored in AsyncStorage under `CONV_<timestamp>` keys with an index at `CONV_INDEX`
- Tap to reload, long-press or 🗑 button to delete
- Files: `src/utils/storage.ts` (NEW), `src/components/HistoryModal.tsx` (NEW)

#### Step 3 — Image Sharing
- 📷 camera button in input bar — opens photo library or camera
- Selected image shown as thumbnail preview with ✕ to remove
- Image sent as base64 in `image_base64` field to `/chat`
- `assistant.py` builds multi-modal Claude content block (image + text) for the first turn; history remains text-only
- Backend: `ChatRequest` extended with `image_base64` and `image_mime_type` fields

#### Step 4 — EAS Build Setup
- Created `mobile-fresh/eas.json` with development / preview / production profiles
- Updated `app.json` with `bundleIdentifier` and `package` fields
- Build commands: `eas build --platform ios --profile preview`

#### Step 5 — Voice Input
- 🎤 mic button appears when text input is empty
- Hold to record, release to stop — `@react-native-voice/voice`
- Pulsing red animation while recording
- Speech result populates text input

#### Step 6 — Push Notifications
- On startup: `registerForPushNotificationsAsync()` → Expo push token → POST `/register-device`
- APScheduler runs every 1 minute on backend, checks `reminders.json` for due items, sends via Expo Push API
- New backend endpoint: `POST /register-device` saves token to `DATA_DIR/devices.json`
- Files: `src/utils/notifications.ts` (NEW)

#### Step 7 — Android Home Screen Widget
- `AssistantWidget.tsx` using `react-native-android-widget`
- Shows last message and "Open app →" tap target
- File: `src/widgets/AssistantWidget.tsx` (NEW)

### Packages Installed
```bash
# Expo SDK packages
npx expo install expo-clipboard expo-image-picker expo-notifications expo-device

# Native packages (require EAS build, not Expo Go)
npm install @react-native-voice/voice react-native-android-widget
```

### Python Dependencies Added
```
apscheduler>=3.10.0
httpx>=0.27.0
```

### Files Modified
| File | Change |
|------|--------|
| `mobile-fresh/App.tsx` | History button, auto-save on clear, push init, load conversation, image send |
| `mobile-fresh/src/types.ts` | Add `imageUri?` to Message, add `ConversationSummary` type |
| `mobile-fresh/src/api.ts` | Image params in `sendMessage()`, add `registerDevice()` |
| `mobile-fresh/src/components/MessageBubble.tsx` | Long-press copy/share, render `imageUri` |
| `mobile-fresh/src/components/ChatInput.tsx` | Camera button + preview, mic button + voice |
| `mobile-fresh/src/utils/storage.ts` | NEW — conversation save/load/list/delete |
| `mobile-fresh/src/utils/notifications.ts` | NEW — push token, local scheduling |
| `mobile-fresh/src/components/HistoryModal.tsx` | NEW — conversation history list |
| `mobile-fresh/src/widgets/AssistantWidget.tsx` | NEW — Android home screen widget |
| `mobile-fresh/app.json` | Plugins for image-picker, notifications, voice, widget; permissions; dark UI |
| `mobile-fresh/eas.json` | NEW — EAS build configuration |
| `server.py` | Image fields in ChatRequest, /register-device, APScheduler for reminders |
| `assistant.py` | Multi-modal content block support (image + text) |
| `requirements.txt` | apscheduler, httpx |

---

## Phase 8 — iOS Home Screen Widget

### User Prompt
```
"i need a ios widget as well"
```

### Approach
iOS widgets require native SwiftUI/WidgetKit code — no pure-JS solution exists.
Used `@bacons/apple-targets` (by Evan Bacon / Expo team) as the Expo config plugin
to inject the widget extension into the Xcode project during `eas build`.

Widget reads the last assistant reply from an **App Group shared UserDefaults**
(`group.com.saideep.personalassistant`) so it stays in sync without network calls.

### Files Created
| File | Purpose |
|------|---------|
| `targets/widget/index.swift` | SwiftUI widget — small + medium layouts, dark theme matching app |
| `targets/widget/Info.plist` | Widget extension info plist |
| `targets/widget/expo-target.config.js` | Tells `@bacons/apple-targets` this is a WidgetKit extension |
| `modules/shared-defaults/ios/SharedDefaults.swift` | Native Expo module — writes/reads App Group UserDefaults |
| `modules/shared-defaults/index.ts` | JS API: `updateWidgetLastMessage(msg)` |
| `modules/shared-defaults/expo-module.config.json` | Expo module config |

### Files Modified
| File | Change |
|------|--------|
| `app.json` | Added `@bacons/apple-targets` plugin; iOS App Group entitlement |
| `App.tsx` | Call `updateWidgetLastMessage(reply)` after each assistant response |

### How It Works
1. After every Claude reply: `updateWidgetLastMessage(reply.slice(0,140))` writes to `UserDefaults(suiteName: "group.com.saideep.personalassistant")`
2. The SwiftUI widget reads this key on its 15-minute refresh cycle (or on WidgetKit's system schedule)
3. Small widget: emoji + title + message preview + "Open →"
4. Medium widget: left branding column + right "last reply" column

### Package Installed
```bash
npm install @bacons/apple-targets
```

### Setup Required Before Building
1. In `app.json`, replace `"REPLACE_WITH_YOUR_TEAM_ID"` with your Apple Developer Team ID
   (find it at developer.apple.com → Membership — 10-character string like `A1B2C3D4E5`)
2. Register the App Group `group.com.saideep.personalassistant` in Apple Developer portal
   (Identifiers → App Groups → +)
3. Add the App Group to both the main app identifier AND a new widget extension identifier
4. Run: `eas build --platform ios --profile preview`

---

## Phase 9 — "Hey SARVIS" Voice Activation

### User Prompt
```
"ok, could you add a feature where i call SARVIS from my phone it should answer"
```

### What Was Built
"Hey Siri, SARVIS" (iOS) and "Hey Google, open SARVIS" (Android) open the app
and automatically activate the microphone — so the user can speak immediately.

### How It Works

#### iOS — Siri Shortcut
1. On first launch, `donateSarvisShortcut()` donates an `NSUserActivity` with
   suggested phrase `"SARVIS"` to Siri
2. iOS suggests adding it to Siri in Settings → Siri & Search
3. User can also tap **"Add SARVIS to Siri"** in Settings ⚙️ to set a custom phrase
4. When triggered: `addShortcutListener` fires → `autoVoice = true` →
   `ChatInput` auto-starts mic after 600 ms

#### Android — Google Assistant
1. App is renamed **"SARVIS"** in `app.json`
2. "Hey Google, open SARVIS" opens the app (no code needed — Google reads app name)
3. Android home screen shortcut: `sarvis://voice` deep link → auto-starts mic

#### Deep Link fallback (`sarvis://voice`)
- Works on both platforms via `Linking.getInitialURL()` and `Linking.addEventListener`
- Any shortcut, NFC tag, or QR code pointing to `sarvis://voice` triggers auto-mic

### Files Created
| File | Purpose |
|------|---------|
| `src/utils/shortcut.ts` | `donateSarvisShortcut()`, `addSarvisShortcutListener()`, `presentAddToSiriDialog()` |

### Files Modified
| File | Change |
|------|--------|
| `app.json` | Renamed app to "SARVIS"; added `scheme: "sarvis"`; `NSUserActivityTypes`; Siri entitlement; Android intent filter |
| `App.tsx` | Donate shortcut on launch; Siri + URL deep link listeners; `autoVoice` state → passed to ChatInput |
| `src/components/ChatInput.tsx` | `autoActivateMic` prop — starts mic 600ms after mount if true |
| `src/components/SettingsModal.tsx` | "Add SARVIS to Siri" button (iOS) / Google Assistant instructions (Android) |
| `src/widgets/AssistantWidget.tsx` | Renamed to "SARVIS" |
| `targets/widget/index.swift` | Renamed widget to "SARVIS" |

### Package Installed
```bash
npm install react-native-siri-shortcut --legacy-peer-deps
npm install expo-linking --legacy-peer-deps
```

### User Setup (iOS)
After installing the EAS build:
1. Open SARVIS → tap ⚙️ → tap **"Add 'SARVIS' to Siri"**
2. Record your phrase (default suggestion: "SARVIS")
3. Say **"Hey Siri, SARVIS"** — app opens and mic activates

### User Setup (Android)
After installing the EAS build:
- Say **"Hey Google, open SARVIS"** — app opens
- Or create a home screen shortcut with URL `sarvis://voice` for instant mic

---

## Architecture Decisions

### Why Multi-Agent?
The orchestrator handles all 22 tools directly. The `research_task` tool
delegates to a separate Claude instance (`research_agent.py`) that runs its
own web-search agentic loop, allowing deeper research without polluting the
main conversation context.

### Why Stateless API?
The full conversation history is stored client-side (in the mobile app's state)
and sent with each request. The backend is completely stateless, making it
simple to deploy and scale on Railway.

### Why Tavily Instead of DuckDuckGo?
Railway's server IPs are rate-limited/blocked by DuckDuckGo's scraping
protection. Tavily is a proper search API designed for LLM applications,
with a free tier of 1,000 searches/month.

### Why Expo SDK 54?
The Expo Go app on the App Store ships with a specific SDK version. Building
against the wrong SDK version causes a version mismatch error at runtime.
Using `npx create-expo-app@latest` ensures the scaffold matches the latest
Expo Go.

### Why SSH Keys for GitHub?
HTTPS personal access tokens expire or require re-entry. SSH keys are
persistent and don't require entering credentials on every push.

---

## Phase 11 — Mac iMessage Companion + Approval Flow

### User Prompt
```
"Implement the following plan: Mac iMessage Companion + Approval Flow"
```

### What Was Built
Roar can now read incoming iMessages on Mac, draft AI replies, push them to the
iPhone for review/editing, and send with one tap.

### Flow
```
chat.db new message
  → companion.py reads it
  → calls /chat for draft
  → POST /pending-reply (Railway)
  → push notification → iPhone
  → user opens 📥 inbox in app, edits if needed, taps Send
  → PATCH /pending-reply/{id}/approve
  → companion.py polls and sees it
  → AppleScript sends via Messages.app
```

### Files Created
| File | Purpose |
|------|---------|
| `mac-companion/companion.py` | Two-thread daemon: watches chat.db (3s poll) + sends approved replies via AppleScript (5s poll) |
| `mac-companion/requirements.txt` | `requests>=2.31.0` |
| `mac-companion/start.sh` | Creates venv, installs deps, prints permission instructions, runs companion.py |
| `mobile-fresh/src/components/PendingRepliesModal.tsx` | Bottom-sheet modal: FlatList of pending reply cards with editable draft, Send + Dismiss buttons, auto-refresh every 5s |

### Files Modified
| File | Change |
|------|--------|
| `server.py` | Added `import uuid`, `datetime`, `PENDING_REPLIES_FILE`; added `PendingReply`, `ApproveRequest`, `PushNotifyRequest` models; added 5 new endpoints |
| `mobile-fresh/src/types.ts` | Added `PendingReplyRecord` interface |
| `mobile-fresh/App.tsx` | Import `PendingRepliesModal`; state `showPendingReplies`, `pendingCount`; 📥 inbox button with red badge; notification tap handler opens inbox on `type==="pending_reply"`; 30s background badge poll; render `<PendingRepliesModal>` |

### New Backend Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /pending-reply` | Create pending reply record (status="pending", uuid id, utc timestamp) |
| `GET /pending-replies` | Return all non-dismissed records (status != "dismissed") |
| `PATCH /pending-reply/{id}/approve` | Set status="approved", store approved_text |
| `PATCH /pending-reply/{id}/dismiss` | Set status="dismissed" |
| `POST /push-notify` | Send push to all registered devices via Expo Push API |

### Mac Setup (one-time)
1. System Settings → Privacy & Security → **Full Disk Access** → add Terminal
2. System Settings → Privacy & Security → **Automation** → Terminal → Messages ✓
3. `cd ~/personal_assistant/mac-companion && ./start.sh`

---

## Phase 10 — Expo Go Compatibility Fix for Voice Input

### User Prompt
```
"commit the fix and push"
```

### What Was Fixed
`@react-native-voice/voice` is a native module that is not bundled in Expo Go.
Previously the app crashed immediately on launch in Expo Go because the module
import threw at the top of `ChatInput.tsx`.

The fix lazy-loads Voice with a `try/catch` so the import failure is silently
caught. All voice-dependent code paths are guarded with `if (!Voice) ...` so
the app runs normally in Expo Go — voice buttons show a friendly alert instead
of crashing.

### Files Modified
| File | Change |
|------|--------|
| `mobile-fresh/src/components/ChatInput.tsx` | Dynamic `require()` for Voice module; null-guards on all Voice API calls; user-facing alert when Voice is unavailable |

---

## Phase 12 — Expo Go Compatibility: Notifications & Siri Shortcut

### User Prompt
```
"continue where we left off"
```

### What Was Fixed
Additional Expo Go compatibility fixes for modules that are native-only:

- **`expo-notifications`**: Wrapped `setNotificationHandler()` in `try/catch` so the app doesn't crash on launch in Expo Go where the native module is absent.
- **`react-native-siri-shortcut`**: Improved error handling — instead of silently swallowing the error, now shows an `Alert` telling the user to install the EAS build.
- **`app.json`**: Fixed plugin config — removed broken `@bacons/apple-targets` entry, corrected `react-native-android-widget` config format with empty `widgets: []`.

### Files Modified
| File | Change |
|------|--------|
| `mobile-fresh/src/utils/notifications.ts` | Wrapped `setNotificationHandler` in try/catch |
| `mobile-fresh/src/utils/shortcut.ts` | Alert user when Siri shortcut unavailable in Expo Go |
| `mobile-fresh/app.json` | Remove `@bacons/apple-targets`; fix android-widget plugin config |

---

## Phase 13 — AI Radar Feed

### User Prompt
```
"i want to build something that keeps me posted on any new developments on AI,
which give me feed of any new applications or opensource items developed that
i can utilize, and allows me to integrate it for my use"
```

### What Was Built
A personal AI news feed — **AI Radar** — that searches the web for the latest AI tools,
models, libraries, and open-source projects, summarizes them with Claude, and delivers
them as a beautiful card feed in the Roar app.

### How It Works
1. Backend searches Tavily across 4 curated queries (new tools, HuggingFace models, GitHub trending, AI APIs)
2. Claude Haiku deduplicates and structures results into feed cards with title, summary, category, and "why useful"
3. Feed is cached in `ai_feed.json` and refreshed daily at 8 AM UTC via scheduler
4. Push notification sent to phone when feed updates
5. Mobile app: 📡 button in header opens the AI Radar modal — pull-to-refresh fetches latest

### New Backend Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /ai-feed` | Return cached feed items |
| `POST /ai-feed/refresh` | Trigger fresh fetch + push notify |

### Files Modified/Created
| File | Change |
|------|--------|
| `server.py` | `AI_FEED_FILE`, `_fetch_ai_feed()`, `/ai-feed`, `/ai-feed/refresh`, daily scheduler job |
| `mobile-fresh/src/types.ts` | Added `AiFeedItem` interface |
| `mobile-fresh/src/api.ts` | Added `getAiFeed()`, `refreshAiFeed()` |
| `mobile-fresh/src/components/AiFeedModal.tsx` | New — card feed UI with category badges, pull-to-refresh |
| `mobile-fresh/App.tsx` | 📡 button in header, `showAiFeed` state, `AiFeedModal` render, notification tap handler |

---

## Phase 14 — AI Integration Playground

### User Prompt
```
"Could you also build me a playground kind of thing, where you can show me
on how to integrate the new plugins or applications within my own application
or create a new copy of it to be utilized by me"
```

### What Was Built
An **AI Integration Playground** accessible from every AI Radar feed card.
Tap "🧪 Try It" on any tool to get a full integration guide + a live chat
to ask Claude to customize it for your specific needs.

### How It Works
1. Tap **🧪 Try It** on any AI Radar card
2. Backend fetches extra docs via Tavily, then Claude Sonnet generates a structured guide
3. **Guide tab** shows: Overview, Install command (copyable), Quick Start code, Roar-specific integration snippet, Standalone script, and Tips
4. **Ask Claude tab** — a full chat pre-seeded with tool context; ask "add this to my backend", "show me a React Native version", etc.
5. All code blocks are copyable with one tap

### New Backend Endpoint
| Endpoint | Purpose |
|----------|---------|
| `POST /playground/explore` | Takes tool details, returns structured integration guide via Claude Sonnet |

### Files Modified/Created
| File | Change |
|------|--------|
| `server.py` | `PlaygroundRequest` model, `/playground/explore` endpoint |
| `mobile-fresh/src/api.ts` | `PlaygroundGuide` interface, `explorePlayground()` |
| `mobile-fresh/src/components/AiFeedModal.tsx` | "🧪 Try It" button on each card, mounts `PlaygroundModal` |
| `mobile-fresh/src/components/PlaygroundModal.tsx` | New — Guide tab (code blocks, tips) + Ask Claude chat tab |

---

## Phase 15 — Suggestion Chips & Contextual Question Prompts

### User Prompt
```
"Could you also add in to all the pages, like articles coming up, just
prompting users to ask any questions and whats happening around"
```

### What Was Built
Dynamic question prompts across the entire app so users are always one tap
away from asking about current events or any tool in their feed.

**Main Chat — SuggestionBar:**
- Persistent horizontal chip bar above the input, always visible
- Fetches live prompts daily from `GET /suggestions` (Tavily news + Claude Haiku)
- Falls back to static prompts instantly while network loads
- Tap any chip → auto-sends as a chat message

**AI Radar Cards — Question Chips:**
- Each feed card shows 3 contextual question chips (e.g. "How do I get started with X?")
- Tap a chip → opens PlaygroundModal directly on the **Ask Claude** chat tab
- The question is pre-filled so the user just hits send

**Backend — `/suggestions` endpoint:**
- Searches 4 news categories via Tavily daily
- Claude Haiku generates 10 curiosity-sparking prompts with categories
- Cached by date; refreshed daily at 7 AM UTC

### New Backend Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /suggestions` | Return daily cached question prompts |
| `POST /suggestions/refresh` | Force refresh |

### Files Modified/Created
| File | Change |
|------|--------|
| `server.py` | `SUGGESTIONS_FILE`, `_fetch_suggestions()`, `/suggestions`, `/suggestions/refresh`, daily cron |
| `mobile-fresh/src/api.ts` | `Suggestion` interface, `getSuggestions()` |
| `mobile-fresh/src/components/SuggestionBar.tsx` | New — horizontal chip bar with live prompts |
| `mobile-fresh/src/components/AiFeedModal.tsx` | Question chips on each card, `openPlayground()` with initial question |
| `mobile-fresh/src/components/PlaygroundModal.tsx` | `initialQuestion` prop — auto-opens chat tab + pre-fills input |
| `mobile-fresh/App.tsx` | Import + render `<SuggestionBar>` above ChatInput |

---

## Phase 16 — Expo Go Fix & Railway Deployment Recovery

### User Prompt
```
"its is working now" / "i do not see anything in the AI feed section" /
"not able to see anything yet" / "update the build log and push"
```

### What Was Fixed

**Expo Go crash (shortcut.ts):**
- `react-native-siri-shortcut` loads but initializes with undefined native
  internals in Expo Go — try/catch didn't help
- Fix: detect Expo Go via `Constants.appOwnership === "expo"` and skip all
  shortcut calls before they touch the native module

**AI Feed empty (Railway not deploying):**
- Railway was silently failing to deploy new commits because Nixpacks was
  detecting `mobile-fresh/package.json` and trying to run `npm install`,
  which failed due to peer dependency conflicts from `@expo/ngrok`
- Fix: added `.railwayignore` to exclude `mobile-fresh/`, `mobile/`, and
  `mac-companion/` from Railway builds
- Once unblocked, 6 queued commits deployed in one go

**AI Feed returning 0 items (Tavily fallback + JSON parsing):**
- Old code returned `[]` if either Tavily or Anthropic key was missing
- New code: Tavily is optional — falls back to Claude's knowledge base
- Prompt was still saying "given these search results" when no results existed
- JSON parsing didn't strip markdown fences before `json.loads()`
- All three issues fixed; feed now returns 10 items per refresh

**Pull-to-refresh conflict:**
- iOS sheet dismiss gesture was intercepting pull-to-refresh, closing the modal
- Fix: replaced `RefreshControl` with a **↻ Refresh** button in the header

### Files Modified/Created
| File | Change |
|------|--------|
| `mobile-fresh/src/utils/shortcut.ts` | `isExpoGo` guard using `Constants.appOwnership` |
| `server.py` | Tavily optional fallback; fixed prompt; fixed JSON fence stripping; added `/ai-feed/debug` |
| `mobile-fresh/src/components/AiFeedModal.tsx` | Replace pull-to-refresh with header Refresh button |
| `.railwayignore` | Exclude mobile/mac dirs from Railway Nixpacks build |

---

## Phase 17 — Modern Chat UI Redesign

### User Prompt
```
"I want to improve the UI of my app" / "Modern chat app feel" / "go for it"
```

### What Was Changed

**Goal:** Make the app feel like a polished, modern chat app (iMessage/Telegram style).

**MessageBubble.tsx:**
- Replaced `🤖` emoji avatar with a clean indigo circle showing letter "R"
- Moved timestamps **outside** the bubble (below it) — like iMessage
- Tightened bubble border-radius, removed border from assistant bubbles
- Assistant bubble now uses `#141b2d` (deeper dark) for better contrast
- Improved markdown font sizes and line-height for readability

**ChatInput.tsx:**
- Send/mic button moved **inside** the input pill — iMessage style
- Camera button redesigned as a smaller `sideBtn` outside left
- Input pill border glows indigo on focus
- More compact padding, cleaner layout

**SuggestionBar.tsx:**
- Removed the "📰 Ask about" label row (less clutter)
- Replaced category text with a small colored dot
- Chips are taller, rounder, single-line text

**App.tsx:**
- Header avatar: `🤖` → indigo "R" circle (matches MessageBubble)
- Status text changed to "Active now" (more chat-like)
- Empty state redesigned: large avatar, name, subtitle, then suggestion chips
- Suggestion chips now include emoji icons per category
- Typing indicator updated to use same indigo "R" avatar + indigo dots

### Files Modified
| File | Change |
|------|--------|
| `mobile-fresh/src/components/MessageBubble.tsx` | New avatar, timestamps outside bubble, cleaner bubbles |
| `mobile-fresh/src/components/ChatInput.tsx` | Send button inside input pill |
| `mobile-fresh/src/components/SuggestionBar.tsx` | Cleaner chips, no label row |
| `mobile-fresh/App.tsx` | Header, empty state, typing indicator redesigned |

---

## Phase 18 — Floating Menu Repositioned & Interactivity Improvements

### User Prompt
```
"can you make the floating buttons a bit more interactive and not at the bottom right
find a more suitable position for it"
```

### What Was Changed

**FloatingMenu.tsx — repositioned to bottom-left:**
- Moved from `bottom-right` to `bottom-left` to avoid conflicting with the send button
- Items fan out in a **quarter-circle arc** (12 o'clock → 3 o'clock) going upward and to the right
- Labels now appear **to the right** of each item button (natural reading direction from left side)

**FloatingMenu.tsx — interactivity:**
- FAB has an **idle pulse animation** (subtle scale breathing) when the menu is closed
- FAB shadow glow **intensifies** when the menu opens
- Each item button has its own **accent color** (tinted background + colored border + glow shadow)
- Item press triggers a **bounce animation** before the menu closes
- Items animate in with a **stagger spring** + overshoot (0.6 → 1.08 → 1.0 scale)
- Labels slide in from the left as items appear

**App.tsx:**
- Each FloatingMenu item now passes a `color` prop:
  - AI Radar: indigo `#6366f1`
  - Inbox: amber `#f59e0b`
  - History: emerald `#10b981`
  - Settings: slate `#64748b`

### Files Modified
| File | Change |
|------|--------|
| `mobile-fresh/src/components/FloatingMenu.tsx` | Repositioned, arc fan, per-color items, pulse/bounce/glow |
| `mobile-fresh/App.tsx` | Added `color` prop to each menu item |
