"use client";

import { useCallback, useState } from "react";
import { Launcher } from "@/components/Launcher";
import { InterviewStage } from "@/components/InterviewStage";
import type { InteractivityType, SessionStartInput } from "@/lib/settings";

type ActiveSession = {
  sessionToken: string;
  sandbox: boolean;
  speakerTag: string;
  interactivityType: InteractivityType;
};

export default function HomePage() {
  const [session, setSession] = useState<ActiveSession | null>(null);

  const handleStart = useCallback(async (input: SessionStartInput) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.error || `Failed (${res.status})`);
    }
    setSession({
      sessionToken: body.sessionToken,
      sandbox: !!body.sandbox,
      speakerTag: input.speakerTag,
      interactivityType: input.interactivityType,
    });
  }, []);

  const handleEnd = useCallback(() => {
    setSession(null);
  }, []);

  if (!session) {
    return (
      <main className="min-h-screen">
        <Launcher onStart={handleStart} />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <InterviewStage
        sessionToken={session.sessionToken}
        sandbox={session.sandbox}
        speakerTag={session.speakerTag}
        interactivityType={session.interactivityType}
        onEnd={handleEnd}
      />
    </main>
  );
}
