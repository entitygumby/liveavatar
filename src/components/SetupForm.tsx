"use client";

import { useEffect, useMemo, useState } from "react";

type Avatar = {
  id: string;
  name: string;
  type: "VIDEO" | "IMAGE";
  status: "ACTIVE" | "INIT" | "DEPLOYING" | "FAILED";
  preview_url?: string;
  default_voice?: { id: string; name: string } | null;
};

type Voice = {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string;
};

type Props = {
  defaultPrompt: string;
  defaultOpening: string;
  defaultSpeakerTag: string;
  onStart: (input: {
    prompt: string;
    openingText: string;
    speakerTag: string;
    avatarId?: string;
    voiceId?: string;
  }) => Promise<void>;
};

export function SetupForm({
  defaultPrompt,
  defaultOpening,
  defaultSpeakerTag,
  onStart,
}: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [openingText, setOpeningText] = useState(defaultOpening);
  const [speakerTag, setSpeakerTag] = useState(defaultSpeakerTag);

  const [avatars, setAvatars] = useState<Avatar[] | null>(null);
  const [privateVoices, setPrivateVoices] = useState<Voice[]>([]);
  const [publicVoices, setPublicVoices] = useState<Voice[]>([]);
  const [avatarsErr, setAvatarsErr] = useState<string | null>(null);
  const [voicesErr, setVoicesErr] = useState<string | null>(null);

  const [avatarId, setAvatarId] = useState<string>("");
  const [voiceId, setVoiceId] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch avatars + voices on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/avatars");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        if (!cancelled) {
          const active = (body.avatars as Avatar[]).filter(
            (a) => a.status === "ACTIVE",
          );
          setAvatars(active);
          if (active.length > 0) {
            setAvatarId(active[0].id);
            // pre-fill voice with avatar's default if present
            const dv = active[0].default_voice?.id;
            if (dv) setVoiceId(dv);
          }
        }
      } catch (err) {
        if (!cancelled)
          setAvatarsErr(err instanceof Error ? err.message : String(err));
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/voices");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        if (!cancelled) {
          setPrivateVoices(body.private || []);
          setPublicVoices(body.public || []);
        }
      } catch (err) {
        if (!cancelled)
          setVoicesErr(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAvatar = useMemo(
    () => avatars?.find((a) => a.id === avatarId),
    [avatars, avatarId],
  );

  const voiceRequired = selectedAvatar?.type === "IMAGE";
  const voiceMissing = voiceRequired && !voiceId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (voiceMissing) {
      setError(
        "This is an image avatar — please pick a voice (image avatars have no built-in voice).",
      );
      return;
    }
    setBusy(true);
    try {
      await onStart({
        prompt,
        openingText,
        speakerTag,
        avatarId: avatarId || undefined,
        voiceId: voiceId || undefined,
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6"
    >
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Panel Interview</h1>
        <p className="text-sm text-zinc-400">
          One AI avatar moderates; multiple humans take turns using push-to-talk.
          Pick your avatar and voice, tune the moderator persona, then start.
        </p>
      </header>

      <Field
        label="Avatar"
        hint={
          avatarsErr
            ? "Couldn't load — check LIVEAVATAR_API_KEY in .env.local."
            : avatars === null
              ? "Loading from your account…"
              : avatars.length === 0
                ? "No active avatars found. Create one at app.liveavatar.com."
                : `${avatars.length} active avatar${avatars.length === 1 ? "" : "s"} in your account.`
        }
      >
        <select
          value={avatarId}
          onChange={(e) => {
            const id = e.target.value;
            setAvatarId(id);
            const a = avatars?.find((x) => x.id === id);
            const dv = a?.default_voice?.id;
            if (dv) setVoiceId(dv);
          }}
          disabled={!avatars || avatars.length === 0}
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30 disabled:opacity-50"
        >
          {avatars?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.type === "IMAGE" ? "image" : "video"}
            </option>
          ))}
        </select>
        {selectedAvatar?.preview_url && (
          <img
            src={selectedAvatar.preview_url}
            alt={selectedAvatar.name}
            className="mt-2 w-32 h-32 rounded-lg object-cover border border-white/10"
          />
        )}
      </Field>

      <Field
        label={voiceRequired ? "Voice (required for image avatars)" : "Voice"}
        hint={
          voicesErr
            ? "Couldn't load voices."
            : voiceRequired
              ? "Image avatars have no built-in voice — picking one is required."
              : "Optional for video avatars; the avatar's default voice is used if blank."
        }
      >
        <select
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          className={`w-full rounded-lg bg-zinc-900 border px-3 py-2 text-sm focus:outline-none focus:border-white/30 ${
            voiceMissing ? "border-red-500/60" : "border-white/10"
          }`}
        >
          <option value="">— pick a voice —</option>
          {privateVoices.length > 0 && (
            <optgroup label="Your voices">
              {privateVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatVoice(v)}
                </option>
              ))}
            </optgroup>
          )}
          {publicVoices.length > 0 && (
            <optgroup label="Public voices">
              {publicVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatVoice(v)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>

      <Field
        label="Moderator system prompt"
        hint="Defines the avatar's role, tone, and rules."
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-white/30"
        />
      </Field>

      <Field
        label="Opening line"
        hint="The first thing the avatar will say when it joins."
      >
        <textarea
          value={openingText}
          onChange={(e) => setOpeningText(e.target.value)}
          rows={3}
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
      </Field>

      <Field
        label="Default speaker tag (optional)"
        hint="Used to label each transcript line so you can tell panelists apart later."
      >
        <input
          value={speakerTag}
          onChange={(e) => setSpeakerTag(e.target.value)}
          placeholder="e.g. Panel"
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
      </Field>

      {error && (
        <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !avatars || avatars.length === 0}
        className="self-start px-5 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 transition-colors"
      >
        {busy ? "Starting…" : "Start session"}
      </button>
    </form>
  );
}

function formatVoice(v: Voice): string {
  const parts = [v.name];
  const meta: string[] = [];
  if (v.gender) meta.push(v.gender.toLowerCase());
  if (v.language) meta.push(v.language);
  if (meta.length) parts.push(`(${meta.join(", ")})`);
  return parts.join(" ");
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      {children}
    </label>
  );
}
