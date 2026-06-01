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

## Custom voices (ElevenLabs binding)

LiveAvatar doesn't clone voices directly — it **binds voices from providers**
(currently ElevenLabs). The setup form's "+ Add a custom voice" panel walks
you through the two-step flow:

1. **Outside this app** — clone or design a voice at
   [elevenlabs.io](https://elevenlabs.io/app/voice-library) (voice cloning needs
   a Starter+ plan), then copy the voice ID and your ElevenLabs API key.
2. **In the form** — open the panel, paste the API key (first time only — it
   gets stored as an encrypted LiveAvatar secret via `POST /v1/secrets` with
   `secret_type: "ELEVENLABS_API_KEY"`), paste the ElevenLabs voice ID, and
   click **Add voice**. The route calls `POST /v1/voices/third_party` to bind
   it and returns a LiveAvatar `voice_id`. The voice dropdown refreshes and
   the new voice is auto-selected.

Subsequent custom voices reuse the saved ElevenLabs key — no need to paste it
each time. Keys are encrypted at rest by LiveAvatar (AWS KMS); this app
never logs or persists them.

| Step | Endpoint (upstream) | Local route |
|------|--------------------|-------------|
| List your ElevenLabs keys | `GET /v1/secrets` | `GET /api/provider-keys?type=ELEVENLABS_API_KEY` |
| Save a new key | `POST /v1/secrets` | `POST /api/provider-keys` |
| Bind voice | `POST /v1/voices/third_party` | `POST /api/voices/bind` |

## Conversation quality (the part that makes it feel natural)

Two settings drive whether the avatar feels like a real moderator or a confused stranger:

### Panel roster + topic — stops the "who are you?" loop

In FULL Mode there is **one shared audio channel**. The avatar physically cannot tell speakers apart by voice. If the prompt tells it to identify speakers, it loops forever asking people to introduce themselves.

The fix is to *tell it who's there up front*:

- **Who's on the panel?** — e.g. `Alice – Product lead, Bob – Senior engineer, Carol – Designer`
- **What's the conversation about?** — e.g. `Interviewing candidates for a senior PM role`

These are appended to the system prompt as a grounding block (`buildModeratorPrompt` in `src/lib/interview-defaults.ts`). The base prompt also explicitly tells the avatar it's a single audio channel, to never re-ask for introductions, and to ask a brief clarifying question when transcription looks garbled instead of guessing.

### Speech recognition (ASR) — fixes mishearing

The session token accepts `avatar_persona.stt_config.provider`. The form exposes a dropdown:

| Provider | Notes |
|----------|-------|
| **Deepgram** (default) | Strong general-purpose ASR — try this first if the avatar mishears |
| AssemblyAI | Alternative; good with accents/domain terms |
| Gladia | Alternative |
| ElevenLabs | Alternative |
| Let LiveAvatar decide | Sends no `stt_config` — the platform default (use if a provider errors on your plan) |

### Reusable contexts

The **Conversation setup** dropdown lets you reuse a saved context, or create/update one:

- **+ Create new** — fill panel/topic (and optionally edit the persona prompt under "Advanced"). On submit the context is saved under the name you choose.
- **Editing applies in place.** Re-using the same name **PATCHes** the existing context (`PATCH /v1/contexts/{id}`) with your latest prompt/opening — so edits actually take effect instead of silently reusing a stale version.
- **Saved contexts** — pick one to reuse it exactly as saved (no create/update call).
- **Delete** — removes it via `DELETE /v1/contexts/{id}`.

Context resolution order in `/api/session`:

1. `contextId` from the form (saved pick — used as-is)
2. `LIVEAVATAR_CONTEXT_ID` env var
3. Existing context with the same name → **PATCH** to apply edits → reuse
4. Create a fresh context

Defaults for the prompt and opening line live in `src/lib/interview-defaults.ts`.

### Interactivity mode

- **Push-to-talk** — `interactivity_type: "PUSH_TO_TALK"` on the token + `{ mode: SessionInteractivityMode.PUSH_TO_TALK }` on the SDK. Hold space/button to talk. The SDK and server mode **must match** or the mic never opens.
- **Continuous voice (VAD)** — field omitted on the token (server default `CONVERSATIONAL`) + `voiceChat: true` on the SDK. Just talk.

## Gotchas

1. **No `context_id` ⇒ silent avatar.** The avatar will stream video but ignore speech, with no error. This app always creates or reuses a context, but if you bypass the route, remember this.
2. **Use `Bearer <session_token>` for `/sessions/start`, `/keep-alive`, `/stop`** — never the raw `X-API-KEY`. The SDK handles `/start` for us; our API routes handle the rest.
3. **Never leak `LIVEAVATAR_API_KEY` to the browser.** Only server-side files (`src/lib/liveavatar-server.ts` and `src/app/api/*`) read it. Adding `"server-only"` at the top throws at build time if it's accidentally imported in a client component.
4. **Image avatars require `voice_id`.** Video avatars can omit it.
5. **5-minute idle timeout.** Keep-alive runs every 2 minutes from the client while the session is connected.
6. **One audio channel — the avatar can't tell speakers apart.** Everyone shares one mic; all input reaches the LLM as one stream. Don't prompt it to identify speakers by voice (it can't) — instead give it the panel roster up front via the form. For per-panelist *transcript* tracking, extend the speaker-tag selector in `InterviewStage.tsx`.
7. **SDK voiceChat mode must match the token's `interactivity_type`.** PTT token + continuous SDK config (or vice-versa) = mic never opens, no error. See `InterviewStage.tsx` and `/api/session`.

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
| `src/app/api/provider-keys/route.ts` | List / create LiveAvatar secrets (`/v1/secrets`) |
| `src/app/api/voices/bind/route.ts` | Bind a third-party voice (`POST /v1/voices/third_party`) |
| `src/components/AddCustomVoice.tsx` | Inline panel: paste ElevenLabs key + voice ID, bind |
| `src/components/SetupForm.tsx` | Pre-session config UI |
| `src/components/InterviewStage.tsx` | Video + PTT + transcript + SDK lifecycle |
| `src/app/page.tsx` | Top-level flow controller |
