# LiveAvatar Interview Panel

A Next.js + TypeScript app where **one AI avatar moderates a group interview** with several humans on the call. Humans share one mic and take turns using push-to-talk; the avatar runs the conversation via LiveAvatar FULL Mode (LiveAvatar handles ASR, LLM, TTS, and the video stream).

## Architecture

```
+-------------------+              +----------------------+
|   Browser (you)   |              |   Next.js server     |
|                   |   POST       |                      |
|  - SetupForm      | -----------> | /api/session         |  X-API-KEY (secret)
|  - InterviewStage |              |   - create context   | ----------------> api.liveavatar.com
|  - Web SDK        | <----------- |   - mint session tok |
|    (LiveKit room) |              |                      |
+-------------------+              | /api/keep-alive      |  Bearer <session_token>
        ^                          | /api/stop            |
        |  LiveKit WebRTC          +----------------------+
        v
   wss://livekit (LiveAvatar)
```

- **`X-API-KEY` lives only on the server.** The browser only ever gets a short-lived `session_token`.
- The avatar joins a LiveKit room. The SDK handles `/v1/sessions/start` and the WebRTC connection internally.
- Push-to-Talk (`interactivity_type: "PUSH_TO_TALK"`) means mic audio outside PTT windows is ignored — clean turn-taking for a panel.

## Setup

1. **Install dependencies**
   ```powershell
   npm install
   ```

2. **Get an API key** at https://app.liveavatar.com.

3. **Configure environment**
   ```powershell
   copy .env.local.example .env.local
   ```
   Open `.env.local` and set `LIVEAVATAR_API_KEY`. Leave `LIVEAVATAR_SANDBOX=true` for free testing.

4. **Run**
   ```powershell
   npm run dev
   ```
   Open http://localhost:3000.

## Sandbox vs Production

| Mode | What you get | Cost |
|------|--------------|------|
| `LIVEAVATAR_SANDBOX=true` | Built-in test avatar `dd73ea75-1218-4ef3-92ce-606d5f7fbc0a`, ~1-minute sessions | Free |
| `LIVEAVATAR_SANDBOX=false` (default in this repo) | Your chosen avatar, full-length sessions | 2 credits/min |

When sandbox is off, the setup form fetches your active avatars and voices via
`/api/avatars` and `/api/voices` and shows them as dropdowns. Image avatars
require a voice (the form enforces this). The avatar's `default_voice` is
pre-selected when available.

You can still pin defaults via env (`LIVEAVATAR_AVATAR_ID`, `LIVEAVATAR_VOICE_ID`) —
they're used as fallbacks if the form leaves a field blank, useful for
single-avatar deployments.

## How it works

- **`/api/session`** — creates a context (`/v1/contexts`) from your moderator prompt, then mints a session token (`/v1/sessions/token`) with `mode: "FULL"`, `interactivity_type: "PUSH_TO_TALK"`. Returns the `session_token` to the browser. Contexts are created per session here; for production, set `LIVEAVATAR_CONTEXT_ID` to reuse one.
- **`/api/keep-alive`** — the InterviewStage pings this every 2 minutes (5-minute server-side timeout).
- **`/api/stop`** — called when the user clicks "End Session".

In the browser (`InterviewStage.tsx`):
- `new LiveAvatarSession(sessionToken)` → `session.start()` → `session.attach(video)` when `SESSION_STREAM_READY` fires.
- `session.voiceChat.start()` requests mic permission.
- **Hold "Hold to talk"** → `session.startListening()` + `session.voiceChat.startPushToTalk()`.
- **Release** → `session.voiceChat.stopPushToTalk()` + `session.stopListening()`. The avatar then processes the audio and responds.
- Live transcripts come in via `AgentEventsEnum.USER_TRANSCRIPTION_CHUNK` and `AVATAR_TRANSCRIPTION_CHUNK`.

## Customising the moderator (reusable contexts)

The setup form has a **Context** dropdown:

- **+ Create new context from fields below** (default) — type a name, prompt, and opening line. On submit, the API creates a context, returns its ID, and the session uses it. The dropdown refreshes automatically, so the new context is available next time.
- **Saved contexts** — pick one and the prompt/opening fields disappear; the session uses the saved context directly (no `POST /v1/contexts` call).
- **Delete** — removes the selected context via `DELETE /v1/contexts/{id}`.

You can also pin a context via `LIVEAVATAR_CONTEXT_ID` in `.env.local`. The resolution order in `/api/session` is:

1. `contextId` from the form (user picked a saved one)
2. `LIVEAVATAR_CONTEXT_ID` env var
3. Create a new one from the prompt/opening fields

Default values for the prompt and opening line live in `src/lib/interview-defaults.ts`.

## Gotchas

1. **No `context_id` ⇒ silent avatar.** The avatar will stream video but ignore speech, with no error. This app always creates or reuses a context, but if you bypass the route, remember this.
2. **Use `Bearer <session_token>` for `/sessions/start`, `/keep-alive`, `/stop`** — never the raw `X-API-KEY`. The SDK handles `/start` for us; our API routes handle the rest.
3. **Never leak `LIVEAVATAR_API_KEY` to the browser.** Only server-side files (`src/lib/liveavatar-server.ts` and `src/app/api/*`) read it. Adding `"server-only"` at the top throws at build time if it's accidentally imported in a client component.
4. **Image avatars require `voice_id`.** Video avatars can omit it.
5. **5-minute idle timeout.** Keep-alive runs every 2 minutes from the client while the session is connected.
6. **Multi-human note.** Everyone shares one browser session and one mic. The avatar treats all input as "the user"; the moderator prompt instructs it to ask for identification when ambiguity matters. For per-panelist tracking, extend the speaker-tag selector in `InterviewStage.tsx` and prefix transcripts before sending them to your own analytics.

## Files

| Path | Purpose |
|------|---------|
| `src/lib/liveavatar-server.ts` | Server-only API client (`X-API-KEY`) |
| `src/lib/interview-defaults.ts` | Default moderator prompt + opening |
| `src/app/api/session/route.ts` | Create context + mint session token |
| `src/app/api/keep-alive/route.ts` | Heartbeat for the session |
| `src/app/api/stop/route.ts` | End the session |
| `src/app/api/avatars/route.ts` | List your active avatars (`GET /v1/avatars`) |
| `src/app/api/voices/route.ts` | List public + private voices (`GET /v1/voices`) |
| `src/app/api/contexts/route.ts` | List your saved contexts (`GET /v1/contexts`) |
| `src/app/api/contexts/[id]/route.ts` | Delete a saved context (`DELETE /v1/contexts/{id}`) |
| `src/components/SetupForm.tsx` | Pre-session config UI |
| `src/components/InterviewStage.tsx` | Video + PTT + transcript + SDK lifecycle |
| `src/app/page.tsx` | Top-level flow controller |
