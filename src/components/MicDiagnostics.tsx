"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  enabled: boolean;
  onDeviceChange?: (deviceId: string) => void;
}

/**
 * Live mic-level meter + device picker. Independent of the LiveAvatar SDK so
 * we can confirm that the browser sees mic input even if the SDK pipeline
 * is broken further downstream.
 */
export function MicDiagnostics({ enabled, onDeviceChange }: Props) {
  const [level, setLevel] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("default");
  const [err, setErr] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // Enumerate devices (labels populate only after first getUserMedia grant)
  useEffect(() => {
    if (!enabled) return;
    const updateDevices = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(
          list.filter((d) => d.kind === "audioinput" && d.deviceId),
        );
      } catch {
        // ignore
      }
    };
    updateDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", updateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener?.(
        "devicechange",
        updateDevices,
      );
    };
  }, [enabled]);

  // Open a *separate* mic stream just for the level meter. Browsers happily
  // share the mic with the SDK so this doesn't conflict.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setErr(null);

    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio:
            selectedDevice === "default"
              ? true
              : { deviceId: { exact: selectedDevice } },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const AudioCtor =
          window.AudioContext ||
          (
            window as unknown as {
              webkitAudioContext: typeof AudioContext;
            }
          ).webkitAudioContext;
        const ctx = new AudioCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          // RMS over the waveform → ~0..1 level
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, selectedDevice]);

  const segments = 14;
  const lit = Math.round(level * segments);

  return (
    <div className="w-full max-w-md flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className="shrink-0">Mic</span>
        <div className="flex-1 flex gap-[2px]">
          {Array.from({ length: segments }, (_, i) => {
            const isLit = i < lit;
            const colour =
              i < 8
                ? "bg-green-400"
                : i < 11
                  ? "bg-yellow-400"
                  : "bg-red-400";
            return (
              <div
                key={i}
                className={`flex-1 h-2 rounded ${isLit ? colour : "bg-zinc-800"}`}
              />
            );
          })}
        </div>
        <span className="shrink-0 tabular-nums w-8 text-right text-zinc-500">
          {Math.round(level * 100)}
        </span>
      </div>
      {devices.length > 1 && (
        <select
          value={selectedDevice}
          onChange={(e) => {
            const id = e.target.value;
            setSelectedDevice(id);
            onDeviceChange?.(id);
          }}
          className="w-full text-xs rounded bg-zinc-900 border border-white/10 px-2 py-1 focus:outline-none focus:border-white/30"
        >
          <option value="default">Default microphone</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
            </option>
          ))}
        </select>
      )}
      {err && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded">
          Mic level error: {err}
        </p>
      )}
    </div>
  );
}
