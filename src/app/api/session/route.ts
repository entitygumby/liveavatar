import { NextResponse } from "next/server";
import {
  SANDBOX_AVATAR_ID,
  createContext,
  createSessionToken,
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
    //   3. create a new context from prompt/openingText
    let contextId: string | null =
      body.contextId || process.env.LIVEAVATAR_CONTEXT_ID || null;
    let newContextCreated = false;

    if (!contextId) {
      const ctx = await createContext({
        name: body.contextName ?? DEFAULT_INTERVIEW_CONTEXT.name,
        prompt: body.prompt ?? DEFAULT_INTERVIEW_CONTEXT.prompt,
        opening_text:
          body.openingText ?? DEFAULT_INTERVIEW_CONTEXT.opening_text,
      });
      contextId = ctx.data.id;
      newContextCreated = true;
    }

    const token = await createSessionToken({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        voice_id: voiceId,
        context_id: contextId,
        language: "en",
      },
      is_sandbox: sandbox,
      interactivity_type: "PUSH_TO_TALK",
      video_quality: "high",
    });

    return NextResponse.json({
      sessionId: token.data.session_id,
      sessionToken: token.data.session_token,
      sandbox,
      contextId,
      newContextCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
