"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AddCustomVoice } from "./AddCustomVoice";

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

type Ctx = {
  id: string;
  name: string;
  created_at: string;
};

const NEW_CONTEXT_SENTINEL = "__new__";

type Props = {
  defaultPrompt: string;
  defaultOpening: string;
  defaultContextName: string;
  defaultSpeakerTag: string;
  onStart: (input: {
    speakerTag: string;
    avatarId?: string;
    voiceId?: string;
    contextId?: string;
    contextName?: string;
    prompt?: string;
    openingText?: string;
  }) => Promise<{ contextId?: string; newContextCreated?: boolean }>;
};

export function SetupForm({
  defaultPrompt,
  defaultOpening,
  defaultContextName,
  defaultSpeakerTag,
  onStart,
}: Props) {
  // Form state
  const [contextChoice, setContextChoice] = useState<string>(NEW_CONTEXT_SENTINEL);
  const [contextName, setContextName] = useState(defaultContextName);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [openingText, setOpeningText] = useState(defaultOpening);
  const [speakerTag, setSpeakerTag] = useState(defaultSpeakerTag);

  // Lookups
  const [avatars, setAvatars] = useState<Avatar[] | null>(null);
  const [privateVoices, setPrivateVoices] = useState<Voice[]>([]);
  const [publicVoices, setPublicVoices] = useState<Voice[]>([]);
  const [contexts, setContexts] = useState<Ctx[] | null>(null);
  const [avatarsErr, setAvatarsErr] = useState<string | null>(null);
  const [voicesErr, setVoicesErr] = useState<string | null>(null);
  const [contextsErr, setContextsErr] = useState<string | null>(null);

  // Selections
  const [avatarId, setAvatarId] = useState<string>("");
  const [voiceId, setVoiceId] = useState<string>("");

  // UX
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/voices");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setPrivateVoices(body.private || []);
      setPublicVoices(body.public || []);
      return {
        privateVoices: (body.private as Voice[]) || [],
        publicVoices: (body.public as Voice[]) || [],
      };
    } catch (err) {
      setVoicesErr(err instanceof Error ? err.message : String(err));
      return { privateVoices: [], publicVoices: [] };
    }
  }, []);

  const refreshContexts = useCallback(async () => {
    try {
      const res = await fetch("/api/contexts");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setContexts((body.contexts as Ctx[]) ?? []);
    } catch (err) {
      setContextsErr(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Fetch avatars, voices, contexts on mount
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
            const dv = active[0].default_voice?.id;
            if (dv) setVoiceId(dv);
          }
        }
      } catch (err) {
        if (!cancelled)
          setAvatarsErr(err instanceof Error ? err.message : String(err));
      }
    })();

    refreshVoices();
    refreshContexts();

    return () => {
      cancelled = true;
    };
  }, [refreshVoices, refreshContexts]);

  const handleCustomVoiceAdded = useCallback(
    async (newVoiceId: string) => {
      await refreshVoices();
      setVoiceId(newVoiceId);
    },
    [refreshVoices],
  );

  const selectedAvatar = useMemo(
    () => avatars?.find((a) => a.id === avatarId),
    [avatars, avatarId],
  );
  const voiceRequired = selectedAvatar?.type === "IMAGE";
  const voiceMissing = voiceRequired && !voiceId;

  const usingExistingContext =
    contextChoice !== NEW_CONTEXT_SENTINEL && contextChoice !== "";

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
      const result = await onStart({
        speakerTag,
        avatarId: avatarId || undefined,
        voiceId: voiceId || undefined,
        contextId: usingExistingContext ? contextChoice : undefined,
        contextName: usingExistingContext ? undefined : contextName,
        prompt: usingExistingContext ? undefined : prompt,
        openingText: usingExistingContext ? undefined : openingText,
      });
      // If a new context was just created, refresh the list so the user
      // sees their new context in the dropdown next time.
      if (result?.newContextCreated) {
        await refreshContexts();
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(m);
      setBusy(false);
    }
  }

  async function handleDeleteContext(id: string, name: string) {
    if (!confirm(`Delete context "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/contexts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      if (contextChoice === id) setContextChoice(NEW_CONTEXT_SENTINEL);
      await refreshContexts();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const selectedContext = contexts?.find((c) => c.id === contextChoice);

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6"
    >
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Panel Interview</h1>
        <p className="text-sm text-zinc-400">
          One AI avatar moderates; multiple humans take turns using push-to-talk.
          Pick your avatar, voice, and context (or create a new one), then start.
        </p>
      </header>

      <Field
        label="Avatar"
        hint={
          avatarsErr
            ? `Couldn't load: ${avatarsErr}`
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
            ? `Couldn't load: ${voicesErr}`
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
        <div className="mt-2">
          <AddCustomVoice onVoiceAdded={handleCustomVoiceAdded} />
        </div>
      </Field>

      <Field
        label="Context (system prompt + opening line)"
        hint={
          contextsErr
            ? `Couldn't load saved contexts: ${contextsErr}`
            : contexts === null
              ? "Loading saved contexts…"
              : usingExistingContext
                ? "Using a saved context. The session will use the prompt and opening line you saved before."
                : "Tune the prompt below — saved on first use so you can reuse it later."
        }
      >
        <div className="flex gap-2">
          <select
            value={contextChoice}
            onChange={(e) => setContextChoice(e.target.value)}
            className="flex-1 rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
          >
            <option value={NEW_CONTEXT_SENTINEL}>
              + Create new context from fields below
            </option>
            {contexts && contexts.length > 0 && (
              <optgroup label="Saved contexts">
                {contexts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({formatDate(c.created_at)})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {usingExistingContext && selectedContext && (
            <button
              type="button"
              onClick={() =>
                handleDeleteContext(selectedContext.id, selectedContext.name)
              }
              className="px-3 rounded-lg border border-red-500/30 text-red-300 text-xs hover:bg-red-500/10"
              title="Delete this saved context"
            >
              Delete
            </button>
          )}
        </div>
      </Field>

      {!usingExistingContext && (
        <>
          <Field
            label="Context name"
            hint="Used to identify this context later in the saved-contexts dropdown."
          >
            <input
              value={contextName}
              onChange={(e) => setContextName(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
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
        </>
      )}

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
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
