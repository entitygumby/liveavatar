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
      prompt: string;
      openingText: string;
      speakerTag: string;
      avatarId?: string;
      voiceId?: string;
    }) => {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: input.prompt,
          openingText: input.openingText,
          avatarId: input.avatarId,
          voiceId: input.voiceId,
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
