"use client";

import { useCallback, useState } from "react";
import { SetupForm } from "@/components/SetupForm";
import { InterviewStage } from "@/components/InterviewStage";
import { DEFAULT_INTERVIEW_CONTEXT } from "@/lib/interview-defaults";

type ActiveSession = {
  sessionToken: string;
  sandbox: boolean;
  speakerTag: string;
};

export default function HomePage() {
  const [session, setSession] = useState<ActiveSession | null>(null);

  const handleStart = useCallback(
    async (input: {
      speakerTag: string;
      avatarId?: string;
      voiceId?: string;
      contextId?: string;
      contextName?: string;
      prompt?: string;
      openingText?: string;
    }) => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarId: input.avatarId,
          voiceId: input.voiceId,
          contextId: input.contextId,
          contextName: input.contextName,
          prompt: input.prompt,
          openingText: input.openingText,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      setSession({
        sessionToken: body.sessionToken,
        sandbox: !!body.sandbox,
        speakerTag: input.speakerTag,
      });
      return {
        contextId: body.contextId as string | undefined,
        newContextCreated: !!body.newContextCreated,
      };
    },
    [],
  );

  const handleEnd = useCallback(() => {
    setSession(null);
  }, []);

  if (!session) {
    return (
      <main className="min-h-screen">
        <SetupForm
          defaultPrompt={DEFAULT_INTERVIEW_CONTEXT.prompt}
          defaultOpening={DEFAULT_INTERVIEW_CONTEXT.opening_text}
          defaultContextName={DEFAULT_INTERVIEW_CONTEXT.name}
          defaultSpeakerTag="Panel"
          onStart={handleStart}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <InterviewStage
        sessionToken={session.sessionToken}
        sandbox={session.sandbox}
        speakerTag={session.speakerTag}
        onEnd={handleEnd}
      />
    </main>
  );
}
