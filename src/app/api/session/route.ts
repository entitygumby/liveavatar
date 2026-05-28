import { NextResponse } from "next/server";
import {
  SANDBOX_AVATAR_ID,
  createContext,
  createSessionToken,
  listContexts,
} from "@/lib/liveavatar-server";
import { DEFAULT_INTERVIEW_CONTEXT } from "@/lib/interview-defaults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  contextId?: string;
  prompt?: string;
  openingText?: string;
  contextName?: string;
  avatarId?: string;
  voiceId?: string;
  interactivityType?: "PUSH_TO_TALK" | "CONVERSATIONAL";
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

    // Context resolution order:
    //   1. explicit contextId in request (user picked a saved one)
    //   2. LIVEAVATAR_CONTEXT_ID env var (pinned default)
    //   3. reuse an existing context with the same name (idempotent)
    //   4. create a new context from prompt/openingText
    let contextId: string | null =
      body.contextId || process.env.LIVEAVATAR_CONTEXT_ID || null;
    let newContextCreated = false;
    let reusedExistingContext = false;

    if (!contextId) {
      const wantName = body.contextName ?? DEFAULT_INTERVIEW_CONTEXT.name;

      // Reuse an existing context with the same name if one is there.
      // This makes repeat sessions cheap and avoids the 4000 conflict.
      try {
        const existing = await listContexts();
        const match = existing.find((c) => c.name === wantName);
        if (match) {
          contextId = match.id;
          reusedExistingContext = true;
        }
      } catch {
        // If listing fails, fall through and try to create anyway.
      }

      if (!contextId) {
        const ctx = await createContext({
          name: wantName,
          prompt: body.prompt ?? DEFAULT_INTERVIEW_CONTEXT.prompt,
          opening_text:
            body.openingText ?? DEFAULT_INTERVIEW_CONTEXT.opening_text,
        });
        contextId = ctx.data.id;
        newContextCreated = true;
      }
    }

    const interactivity = body.interactivityType ?? "PUSH_TO_TALK";

    // Match the official demo's pattern: only send interactivity_type when
    // PTT is wanted. CONVERSATIONAL is the server default — sending it
    // explicitly used to 422 in the past, so we conditionally spread.
    const token = await createSessionToken({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        voice_id: voiceId,
        context_id: contextId,
        language: "en",
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
      reusedExistingContext,
      interactivityType: interactivity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
