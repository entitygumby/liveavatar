"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type AppSettings,
  type SessionStartInput,
  buildSessionInput,
  loadSettings,
} from "@/lib/settings";

type Avatar = {
  id: string;
  name: string;
  type: "VIDEO" | "IMAGE";
  status: "ACTIVE" | "INIT" | "DEPLOYING" | "FAILED";
  preview_url?: string;
  default_voice?: { id: string; name: string } | null;
};

type Props = {
  onStart: (input: SessionStartInput) => Promise<void>;
};

export function Launcher({ onStart }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [avatars, setAvatars] = useState<Avatar[] | null>(null);
  const [avatarsErr, setAvatarsErr] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/avatars");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        if (cancelled) return;
        const active = (body.avatars as Avatar[]).filter(
          (a) => a.status === "ACTIVE",
        );
        setAvatars(active);
        // Default to the configured avatar, else the first active one
        const preferred =
          active.find((a) => a.id === settings.avatarId)?.id ||
          active[0]?.id ||
          "";
        setAvatarId(preferred);
      } catch (err) {
        if (!cancelled)
          setAvatarsErr(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const selectedAvatar = useMemo(
    () => avatars?.find((a) => a.id === avatarId),
    [avatars, avatarId],
  );

  async function handleStart() {
    if (!settings) return;
    setError(null);
    setBusy(true);
    try {
      // Voice: explicit override > settings > the avatar's paired default voice
      const voiceId =
        settings.voiceId || selectedAvatar?.default_voice?.id || "";
      const input = buildSessionInput(settings, {
        avatarId: avatarId || undefined,
        voiceId: voiceId || undefined,
      });
      await onStart(input);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const loading = settings === null || avatars === null;
  const noAvatars = avatars !== null && avatars.length === 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-semibold">Panel Interview</h1>
          <p className="text-sm text-zinc-400">
            Pick the avatar and start. Everything else is pre-configured.
          </p>
        </div>

        {avatarsErr && (
          <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg text-center">
            Couldn&apos;t load avatars: {avatarsErr}
            <br />
            Check your API key in Settings / Vercel env.
          </p>
        )}

        {loading && !avatarsErr && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}

        {noAvatars && (
          <p className="text-sm text-zinc-400 text-center">
            No active avatars found. Create one at app.liveavatar.com, then
            refresh.
          </p>
        )}

        {!loading && !noAvatars && (
          <>
            {selectedAvatar?.preview_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedAvatar.preview_url}
                alt={selectedAvatar.name}
                className="w-44 h-44 rounded-2xl object-cover border border-white/10 shadow-lg"
              />
            )}

            {avatars && avatars.length > 1 ? (
              <select
                value={avatarId}
                onChange={(e) => setAvatarId(e.target.value)}
                className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm text-center focus:outline-none focus:border-white/30"
              >
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-medium">{selectedAvatar?.name}</p>
            )}

            {error && (
              <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg text-center w-full">
                {error}
              </p>
            )}

            <button
              onClick={handleStart}
              disabled={busy || !avatarId}
              className="w-full px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100 disabled:opacity-50 transition-colors"
            >
              {busy ? "Starting…" : "Start session"}
            </button>
          </>
        )}

        <Link
          href="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ⚙ Settings
        </Link>
      </div>
    </div>
  );
}
