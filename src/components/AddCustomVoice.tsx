"use client";

import { useEffect, useState } from "react";

type ProviderKey = {
  id: string;
  secret_name: string;
  secret_type: string;
};

type Props = {
  onVoiceAdded: (voiceId: string) => void;
};

const NEW_KEY_SENTINEL = "__new__";

export function AddCustomVoice({ onVoiceAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ProviderKey[] | null>(null);
  const [keysErr, setKeysErr] = useState<string | null>(null);

  const [keyChoice, setKeyChoice] = useState<string>(NEW_KEY_SENTINEL);
  const [newKeyName, setNewKeyName] = useState("ElevenLabs (default)");
  const [newKeyValue, setNewKeyValue] = useState("");

  const [providerVoiceId, setProviderVoiceId] = useState("");
  const [voiceDisplayName, setVoiceDisplayName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/provider-keys?type=ELEVENLABS_API_KEY");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        if (!cancelled) {
          const ks = (body.providerKeys as ProviderKey[]) ?? [];
          setKeys(ks);
          if (ks.length > 0) setKeyChoice(ks[0].id);
        }
      } catch (err) {
        if (!cancelled)
          setKeysErr(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const usingExistingKey = keyChoice !== NEW_KEY_SENTINEL;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!providerVoiceId.trim()) {
      setError("ElevenLabs voice ID is required.");
      return;
    }
    if (!usingExistingKey && !newKeyValue.trim()) {
      setError("Paste your ElevenLabs API key (or pick an existing one).");
      return;
    }

    setBusy(true);
    try {
      let secretId = keyChoice;
      if (!usingExistingKey) {
        const res = await fetch("/api/provider-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret_type: "ELEVENLABS_API_KEY",
            secret_name: newKeyName || "ElevenLabs",
            secret_value: newKeyValue.trim(),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
        secretId = body.id;
      }

      const bindRes = await fetch("/api/voices/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_voice_id: providerVoiceId.trim(),
          secret_id: secretId,
          name: voiceDisplayName.trim() || undefined,
        }),
      });
      const bindBody = await bindRes.json();
      if (!bindRes.ok)
        throw new Error(bindBody?.error || `Failed (${bindRes.status})`);

      setSuccess(`Voice added (LiveAvatar voice_id: ${bindBody.voice_id})`);
      // Clear voice fields but keep the key selection so the user can add more
      setProviderVoiceId("");
      setVoiceDisplayName("");
      setNewKeyValue("");
      onVoiceAdded(bindBody.voice_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span>+ Add a custom voice (bind from ElevenLabs)</span>
        <span className="text-zinc-500 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-3 bg-zinc-950/50">
          <div className="text-xs text-zinc-400 leading-relaxed">
            LiveAvatar doesn&apos;t clone voices directly — it binds voices from
            providers like ElevenLabs. To use a custom voice:
            <ol className="list-decimal ml-5 mt-1 space-y-0.5">
              <li>
                Clone or design a voice at{" "}
                <a
                  href="https://elevenlabs.io/app/voice-library"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 underline"
                >
                  elevenlabs.io
                </a>{" "}
                (voice cloning needs a Starter+ plan).
              </li>
              <li>
                Copy the voice ID from ElevenLabs (Voices &rarr; click your voice &rarr; ID).
              </li>
              <li>
                Get your ElevenLabs API key (Profile &rarr; API key) — only on
                first add.
              </li>
              <li>Paste both below and click &quot;Add voice&quot;.</li>
            </ol>
          </div>

          <Field label="ElevenLabs API key">
            {keysErr ? (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded">
                {keysErr}
              </div>
            ) : (
              <>
                <select
                  value={keyChoice}
                  onChange={(e) => setKeyChoice(e.target.value)}
                  className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                >
                  <option value={NEW_KEY_SENTINEL}>
                    + Use a new ElevenLabs API key
                  </option>
                  {keys && keys.length > 0 && (
                    <optgroup label="Saved ElevenLabs keys">
                      {keys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.secret_name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {!usingExistingKey && (
                  <div className="mt-2 flex flex-col gap-2">
                    <input
                      placeholder="Key name (e.g. ElevenLabs personal)"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                    />
                    <input
                      placeholder="ElevenLabs API key (sk_...)"
                      value={newKeyValue}
                      onChange={(e) => setNewKeyValue(e.target.value)}
                      type="password"
                      autoComplete="off"
                      className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                    />
                    <p className="text-[11px] text-zinc-500">
                      Encrypted at rest by LiveAvatar (AWS KMS). Never sent to or
                      stored by this app.
                    </p>
                  </div>
                )}
              </>
            )}
          </Field>

          <Field label="ElevenLabs voice ID">
            <input
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              value={providerVoiceId}
              onChange={(e) => setProviderVoiceId(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30 font-mono"
            />
          </Field>

          <Field label="Display name (optional)">
            <input
              placeholder="e.g. Alice — warm, narrator"
              value={voiceDisplayName}
              onChange={(e) => setVoiceDisplayName(e.target.value)}
              className="w-full rounded-lg bg-zinc-900 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-white/30"
            />
          </Field>

          {error && (
            <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1.5 rounded">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 px-2 py-1.5 rounded">
              {success}
            </p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="self-start px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 transition-colors"
          >
            {busy ? "Adding…" : "Add voice"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-300">{label}</span>
      {children}
    </label>
  );
}
