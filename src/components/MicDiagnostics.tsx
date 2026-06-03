"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Voice chat is active (mic permission granted via the SDK). */
  enabled: boolean;
  /** SDK speech-detection state — drives the "hearing you" indicator. */
  isUserTalking: boolean;
  /** Called with a deviceId when the user picks a different microphone. */
  onDeviceChange?: (deviceId: string) => void;
}

/**
 * Microphone picker + live "hearing you" indicator.
 *
 * IMPORTANT: this component does NOT open its own getUserMedia stream. The
 * LiveAvatar SDK already owns the microphone, and grabbing a second stream for
 * the same device throws "NotReadableError / device in use" on Windows — which
 * previously showed a mic error and broke device selection. We enumerate
 * devices (labels are available once the SDK has been granted permission) and
 * route changes through the SDK's own setDevice().
 */
export function MicDiagnostics({
  enabled,
  isUserTalking,
  onDeviceChange,
}: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const update = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(list.filter((d) => d.kind === "audioinput" && d.deviceId));
      } catch {
        // enumerateDevices can throw in some locked-down contexts — ignore
      }
    };

    update();
    navigator.mediaDevices.addEventListener?.("devicechange", update);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", update);
    };
  }, [enabled]);

  const hasLabels = devices.some((d) => d.label);

  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="shrink-0 text-zinc-400">Microphone</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${
            !enabled
              ? "bg-zinc-800 text-zinc-500"
              : isUserTalking
                ? "bg-green-500/15 text-green-300"
                : "bg-zinc-800 text-zinc-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !enabled
                ? "bg-zinc-600"
                : isUserTalking
                  ? "bg-green-400 animate-pulse"
                  : "bg-zinc-500"
            }`}
          />
          {!enabled
            ? "connecting…"
            : isUserTalking
              ? "hearing you…"
              : "ready"}
        </span>
      </div>

      <select
        value={selectedDevice}
        disabled={!enabled || devices.length === 0}
        onChange={(e) => {
          const id = e.target.value;
          setSelectedDevice(id);
          if (id) onDeviceChange?.(id);
        }}
        className="w-full text-xs rounded bg-zinc-900 border border-white/10 px-2 py-1.5 focus:outline-none focus:border-white/30 disabled:opacity-50"
      >
        <option value="">System default microphone</option>
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${i + 1}`}
          </option>
        ))}
      </select>

      {enabled && !hasLabels && (
        <p className="text-[11px] text-zinc-500">
          Microphone names appear once you&apos;ve allowed mic access in the
          browser.
        </p>
      )}
    </div>
  );
}
