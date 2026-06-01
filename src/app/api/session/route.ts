import { NextResponse } from "next/server";
import {
  SANDBOX_AVATAR_ID,
  type SttProvider,
  createContext,
  createSessionToken,
  listContexts,
  updateContext,
} from "@/lib/liveavatar-server";
import {
  DEFAULT_INTERVIEW_CONTEXT,
  buildModeratorPrompt,
} from "@/lib/interview-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STT_PROVIDERS: SttProvider[] = [
  "deepgram",
  "assembly_ai",
  "gladia",
  "elevenlabs",
];

type RequestBody = {
  contextId?: string;
  prompt?: string;
  openingText?: string;
  contextName?: string;
  panel?: string;
  topic?: string;
  avatarId?: string;
  voiceId?: string;
  interactivityType?: "PUSH_TO_TALK" | "CONVERSATIONAL";
  sttProvider?: string;
};

export async function POST(req: Request) {
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // empty body is fine — defaults will be used
  }

  try {
    const sandbox =
      (process.env.LIVEAVATAR_SANDBOX ?? "true").toLowerCase() === "true";

    const avatarId = sandbox
      ? SANDBOX_AVATAR_ID
      : body.avatarId || process.env.LIVEAVATAR_AVATAR_ID;
    if (!avatarId) {
      return NextResponse.json(
        {
          error:
            "Avatar ID is required. Pick one in the form, set LIVEAVATAR_AVATAR_ID, or enable sandbox mode.",
        },
        { status: 400 },
      );
    }

    const voiceId =
      (sandbox ? undefined : body.voiceId) ||
      process.env.LIVEAVATAR_VOICE_ID ||
      undefined;

    // Compose the effective prompt: the (possibly edited) persona prompt plus
    // a grounding block built from the panel roster + topic. This is what
    // actually stops the avatar asking for introductions.
    const effectivePrompt = buildModeratorPrompt({
      basePrompt: body.prompt ?? DEFAULT_INTERVIEW_CONTEXT.prompt,
      panel: body.panel,
      topic: body.topic,
    });
    const effectiveOpening =
      body.openingText ?? DEFAULT_INTERVIEW_CONTEXT.opening_text;

    // Context resolution order:
    //   1. explicit contextId in request (user picked a saved one — used as-is)
    //   2. LIVEAVATAR_CONTEXT_ID env var (pinned default)
    //   3. existing context with the same name → PATCH it so prompt edits
    //      actually apply (avoids the stale-prompt + 4000-conflict traps)
    //   4. create a fresh context
    let contextId: string | null =
      body.contextId || process.env.LIVEAVATAR_CONTEXT_ID || null;
    let newContextCreated = false;
    let updatedExistingContext = false;

    if (!contextId) {
      const wantName = body.contextName?.trim() || DEFAULT_INTERVIEW_CONTEXT.name;
      const contextPayload = {
        name: wantName,
        prompt: effectivePrompt,
        opening_text: effectiveOpening,
      };

      let existingId: string | null = null;
      try {
        const existing = await listContexts();
        existingId = existing.find((c) => c.name === wantName)?.id ?? null;
      } catch {
        // listing failed — fall through to create
      }

      if (existingId) {
        // Apply the latest prompt/opening to the existing context in place.
        await updateContext(existingId, contextPayload);
        contextId = existingId;
        updatedExistingContext = true;
      } else {
        const ctx = await createContext(contextPayload);
        contextId = ctx.data.id;
        newContextCreated = true;
      }
    }

    const interactivity = body.interactivityType ?? "PUSH_TO_TALK";

    const sttProvider =
      body.sttProvider && STT_PROVIDERS.includes(body.sttProvider as SttProvider)
        ? (body.sttProvider as SttProvider)
        : undefined;

    // Match the official demo: only send interactivity_type when PTT is wanted.
    // CONVERSATIONAL is the server default and was rejected when sent explicitly.
    const token = await createSessionToken({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        voice_id: voiceId,
        context_id: contextId,
        language: "en",
        ...(sttProvider ? { stt_config: { provider: sttProvider } } : {}),
      },
      is_sandbox: sandbox,
      ...(interactivity === "PUSH_TO_TALK"
        ? { interactivity_type: "PUSH_TO_TALK" as const }
        : {}),
      video_quality: "high",
    });

    return NextResponse.json({
      sessionId: token.data.session_id,
      sessionToken: token.data.session_token,
      sandbox,
      contextId,
      newContextCreated,
      updatedExistingContext,
      interactivityType: interactivity,
      sttProvider: sttProvider ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
