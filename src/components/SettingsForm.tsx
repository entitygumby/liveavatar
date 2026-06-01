"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AddCustomVoice } from "./AddCustomVoice";
import {
  type AppSettings,
  type InteractivityType,
  loadSettings,
  saveSettings,
} from "@/lib/settings";

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

type Ctx = { id: string; name: string; created_at: string };

const NEW_CONTEXT_SENTINEL = "__new__";

const STT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "deepgram", label: "Deepgram (recommended)" },
  { value: "assembly_ai", label: "AssemblyAI" },
  { value: "gladia", label: "Gladia" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "", label: "Let LiveAvatar decide (default)" },
];

export function SettingsForm() {
  const initial = useMemo(() => loadSettings(), []);

  // Context choice maps to useExistingContext + contextId on save
  const [contextChoice, setContextChoice] = useState<string>(
    initial.useExistingContext && initial.contextId
      ? initial.contextId
      : NEW_CONTEXT_SENTINEL,
  );
  const [contextName, setContextName] = useState(initial.contextName);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [openingText, setOpeningText] = useState(initial.openingText);
  const [panel, setPanel] = useState(initial.panel);
  const [topic, setTopic] = useState(initial.topic);
  const [speakerTag, setSpeakerTag] = useState(initial.speakerTag);
  const [sttProvider, setSttProvider] = useState(initial.sttProvider);
  const [interactivityType, setInteractivityType] =
    useState<InteractivityType>(initial.interactivityType);
  const [avatarId, setAvatarId] = useState(initial.avatarId);
  const [voiceId, setVoiceId] = useState(initial.voiceId);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lookups
  const [avatars, setAvatars] = useState<Avatar[] | null>(null);
  const [privateVoices, setPrivateVoices] = useState<Voice[]>([]);
  const [publicVoices, setPublicVoices] = useState<Voice[]>([]);
  const [contexts, setContexts] = useState<Ctx[] | null>(null);
  const [avatarsErr, setAvatarsErr] = useState<string | null>(null);
  const [voicesErr, setVoicesErr] = useState<string | null>(null);
  const [contextsErr, setContextsErr] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  const refreshVoices = useCallback(async () => {
    try {
      const res = await fetch("/api/voices");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      setPrivateVoices(body.private || []);
      setPublicVoices(body.public || []);
    } catch (err) {
      setVoicesErr(err instanceof Error ? err.message : String(err));
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

  useEffect(() => {
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
        // If no avatar saved yet, default to the first one + its voice
        if (!avatarId && active.length > 0) {
          setAvatarId(active[0].id);
          const dv = active[0].default_voice?.id;
          if (dv && !voiceId) setVoiceId(dv);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const selectedContext = contexts?.find((c) => c.id === contextChoice);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const next: AppSettings = {
      avatarId,
      voiceId,
      useExistingContext: usingExistingContext,
      contextId: usingExistingContext ? contextChoice : "",
      contextName,
      prompt,
      openingText,
      panel,
      topic,
      sttProvider,
      interactivityType,
      speakerTag,
    };
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
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
      setContextsErr(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="w-full max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6"
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-200 underline"
          >
            ← Launcher
          </Link>
        </div>
        <p className="text-sm text-zinc-400">
          Configure the avatar, voice, moderator persona, and conversation once.
          The launcher uses these so people don&apos;t pick them every time.
          Saved in this browser.
        </p>
      </header>

      <Field
        label="Default avatar"
        hint={
          avatarsErr
            ? `Couldn't load: ${avatarsErr}`
            : avatars === null
              ? "Loading from your account…"
              : avatars.length === 0
                ? "No active avatars found. Create one at app.liveavatar.com."
                : "The avatar the launcher opens with."
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
          <option value="">— first active avatar —</option>
          {avatars?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} — {a.type === "IMAGE" ? "image" : "video"}
            </option>
          ))}
        </select>
        {selectedAvatar?.preview_url && (
          // eslint-disable-next-line @next/next/no-img-element
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
              ? "Image avatars have no built-in voice — pick the one you paired (e.g. your ElevenLabs clone)."
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
          <option value="">— use avatar default —</option>
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
        label="How people talk to the avatar"
        hint={
          interactivityType === "PUSH_TO_TALK"
            ? "Hold space/button to talk; release to send. Best for shared-mic panels."
            : "Just talk — the avatar listens continuously and replies when you pause."
        }
      >
        <div className="flex gap-2">
          {(
            [
              ["PUSH_TO_TALK", "Push-to-talk", "Hold space / button"],
              ["CONVERSATIONAL", "Continuous voice", "Just talk"],
            ] as const
          ).map(([val, label, sub]) => (
            <label
              key={val}
              className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${
                interactivityType === val
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/10 bg-zinc-900 hover:bg-white/5 text-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="interactivity"
                value={val}
                checked={interactivityType === val}
                onChange={() => setInteractivityType(val)}
                className="sr-only"
              />
              <span className="font-medium">{label}</span>
              <span className="block text-xs text-zinc-500 mt-0.5">{sub}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Conversation"
        hint={
          contextsErr
            ? `Couldn't load saved contexts: ${contextsErr}`
            : contexts === null
              ? "Loading saved contexts…"
              : usingExistingContext
                ? "Using a saved context as-is."
                : "Built from the panel + topic below and saved under the name you choose."
        }
      >
        <div className="flex gap-2">
          <select
            value={contextChoice}
            onChange={(e) => setContextChoice(e.target.value)}
            className="flex-1 rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
          >
            <option value={NEW_CONTEXT_SENTINEL}>
              + Build from panel + topic below
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
            >
              Delete
            </button>
          )}
        </div>
      </Field>

      {!usingExistingContext && (
        <>
          <Field
            label="Who's on the panel? (recommended)"
            hint="So the avatar doesn't ask for introductions. e.g. 'Alice – Product lead, Bob – Senior engineer, Carol – Designer'."
          >
            <textarea
              value={panel}
              onChange={(e) => setPanel(e.target.value)}
              rows={3}
              placeholder="Alice – Product lead, Bob – Senior engineer, Carol – Designer"
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
          </Field>

          <Field
            label="What's the conversation about? (optional)"
            hint="Keeps the avatar on-topic and primes the right vocabulary."
          >
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Interviewing candidates for a senior PM role"
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
          </Field>

          <Field
            label="Save conversation as"
            hint="Re-using this name updates the saved context with your latest edits."
          >
            <input
              value={contextName}
              onChange={(e) => setContextName(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="self-start text-xs text-zinc-400 hover:text-zinc-200"
          >
            {showAdvanced ? "▾ Hide" : "▸ Show"} advanced: moderator persona &
            opening line
          </button>

          {showAdvanced && (
            <>
              <Field
                label="Moderator persona prompt"
                hint="The base behaviour. Panel + topic above are appended automatically."
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-white/30 font-mono"
                />
              </Field>

              <Field
                label="Opening line"
                hint="The first thing the avatar says when it joins."
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
        </>
      )}

      <Field
        label="Speech recognition (ASR)"
        hint="Which engine transcribes speech. If the avatar mishears, try a different one."
      >
        <select
          value={sttProvider}
          onChange={(e) => setSttProvider(e.target.value)}
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        >
          {STT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Transcript speaker tag (optional)"
        hint="Labels each transcript line so you can tell panelists apart later."
      >
        <input
          value={speakerTag}
          onChange={(e) => setSpeakerTag(e.target.value)}
          placeholder="e.g. Panel"
          className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
        />
      </Field>

      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-100 transition-colors"
        >
          Save settings
        </button>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg border border-white/15 text-sm hover:bg-white/5 transition-colors"
        >
          Done
        </Link>
        {saved && (
          <span className="text-sm text-green-300">Saved ✓</span>
        )}
      </div>
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
