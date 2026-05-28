"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentEventsEnum,
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  VoiceChatEvent,
  VoiceChatState,
} from "@heygen/liveavatar-web-sdk";
import { MicDiagnostics } from "./MicDiagnostics";

const log = (...args: unknown[]) =>
  // eslint-disable-next-line no-console
  console.log("[LiveAvatar]", ...args);

type TranscriptLine = {
  id: string;
  sender: "user" | "avatar";
  speakerTag?: string;
  text: string;
  partial: boolean;
};

type Props = {
  sessionToken: string;
  sandbox: boolean;
  speakerTag: string;
  interactivityType: "PUSH_TO_TALK" | "VOICE";
  onEnd: () => void;
};

const KEEPALIVE_MS = 2 * 60 * 1000;

export function InterviewStage({
  sessionToken,
  sandbox,
  speakerTag,
  interactivityType,
  onEnd,
}: Props) {
  const isPTT = interactivityType === "PUSH_TO_TALK";
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const speakerTagRef = useRef(speakerTag);
  const userPartialRef = useRef<string>("");
  const avatarPartialRef = useRef<string>("");
  const handlePushStartRef = useRef<(() => void) | null>(null);
  const handlePushStopRef = useRef<(() => void) | null>(null);

  const [sessionState, setSessionState] = useState<SessionState>(
    SessionState.INACTIVE,
  );
  const [voiceActive, setVoiceActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    speakerTagRef.current = speakerTag;
  }, [speakerTag]);

  const appendLine = useCallback((line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line]);
  }, []);

  const updatePartial = useCallback(
    (sender: "user" | "avatar", text: string) => {
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.sender === sender && last.partial) {
          return [...prev.slice(0, -1), { ...last, text }];
        }
        return [
          ...prev,
          {
            id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender,
            speakerTag:
              sender === "user" ? speakerTagRef.current || undefined : undefined,
            text,
            partial: true,
          },
        ];
      });
    },
    [],
  );

  const finalisePartial = useCallback(
    (sender: "user" | "avatar", text: string) => {
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.sender === sender && last.partial) {
          return [
            ...prev.slice(0, -1),
            { ...last, text, partial: false },
          ];
        }
        return [
          ...prev,
          {
            id: `${sender}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sender,
            speakerTag:
              sender === "user" ? speakerTagRef.current || undefined : undefined,
            text,
            partial: false,
          },
        ];
      });
    },
    [],
  );

  // Start session + wire all SDK events
  useEffect(() => {
    let cancelled = false;
    const session = new LiveAvatarSession(sessionToken, { voiceChat: true });
    sessionRef.current = session;

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state: SessionState) => {
      log("SESSION_STATE_CHANGED", state);
      setSessionState(state);
      if (state === SessionState.DISCONNECTED) {
        session.removeAllListeners();
        session.voiceChat.removeAllListeners();
      }
    });

    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      log("SESSION_STREAM_READY");
      setIsStreamReady(true);
      if (videoRef.current) {
        session.attach(videoRef.current);
      }
    });

    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (s: VoiceChatState) => {
      log("VOICE_CHAT_STATE_CHANGED", s);
      setVoiceActive(s === VoiceChatState.ACTIVE);
    });

    session.voiceChat.on(VoiceChatEvent.MUTED, () => {
      log("VOICE_CHAT_MUTED");
      setIsMuted(true);
    });
    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => {
      log("VOICE_CHAT_UNMUTED");
      setIsMuted(false);
    });

    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
      log("USER_SPEAK_STARTED");
      setIsUserTalking(true);
    });
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
      log("USER_SPEAK_ENDED");
      setIsUserTalking(false);
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      log("AVATAR_SPEAK_STARTED");
      setIsAvatarTalking(true);
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
      log("AVATAR_SPEAK_ENDED");
      setIsAvatarTalking(false);
    });

    session.on(
      AgentEventsEnum.USER_TRANSCRIPTION_CHUNK,
      (e: { text?: string }) => {
        const chunk = e?.text ?? "";
        log("USER_TRANSCRIPTION_CHUNK", chunk);
        if (!chunk) return;
        userPartialRef.current += chunk;
        updatePartial("user", userPartialRef.current);
      },
    );
    session.on(
      AgentEventsEnum.USER_TRANSCRIPTION,
      (e: { text?: string }) => {
        const finalText = e?.text ?? userPartialRef.current;
        log("USER_TRANSCRIPTION (final)", finalText);
        userPartialRef.current = "";
        if (finalText) finalisePartial("user", finalText);
      },
    );
    session.on(
      AgentEventsEnum.AVATAR_TRANSCRIPTION_CHUNK,
      (e: { text?: string }) => {
        const chunk = e?.text ?? "";
        log("AVATAR_TRANSCRIPTION_CHUNK", chunk);
        if (!chunk) return;
        avatarPartialRef.current += chunk;
        updatePartial("avatar", avatarPartialRef.current);
      },
    );
    session.on(
      AgentEventsEnum.AVATAR_TRANSCRIPTION,
      (e: { text?: string }) => {
        const finalText = e?.text ?? avatarPartialRef.current;
        log("AVATAR_TRANSCRIPTION (final)", finalText);
        avatarPartialRef.current = "";
        if (finalText) finalisePartial("avatar", finalText);
      },
    );

    (async () => {
      try {
        log("session.start() …");
        await session.start();
        log("session.start() ok");
        if (cancelled) return;
        log("voiceChat.start() …");
        await session.voiceChat.start();
        log("voiceChat.start() ok — mic permission granted");
        // Force unmute in case the SDK starts in a muted state (some
        // versions do for PTT mode, expecting the PTT button to unmute).
        try {
          await session.voiceChat.unmute();
          log("voiceChat.unmute() ok");
        } catch (err) {
          log("voiceChat.unmute() error (continuing anyway)", err);
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        log("startup error", err);
        setErrorMsg(m);
      }
    })();

    return () => {
      cancelled = true;
      session.removeAllListeners();
      session.voiceChat.removeAllListeners();
      session.stop().catch(() => {});
    };
  }, [sessionToken, updatePartial, finalisePartial]);

  // Keep-alive heartbeat
  useEffect(() => {
    if (sessionState !== SessionState.CONNECTED) return;
    const id = setInterval(() => {
      fetch("/api/keep-alive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken }),
      }).catch(() => {});
    }, KEEPALIVE_MS);
    return () => clearInterval(id);
  }, [sessionState, sessionToken]);

  // Notify parent when session ends
  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onEnd();
    }
  }, [sessionState, onEnd]);

  // Global mouseup: if you press the PTT button and drift off it, capture
  // should still stop on release — not on the moment your cursor leaves.
  useEffect(() => {
    if (!isPTT || !isPushing) return;
    const onUp = () => handlePushStopRef.current?.();
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [isPTT, isPushing]);

  const handlePushStart = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    log("PTT start");
    setIsPushing(true);
    // Start audio capture FIRST (Promise) — no await, capture begins immediately.
    session.voiceChat
      .startPushToTalk()
      .then(() => log("PTT capturing audio"))
      .catch((err: unknown) => {
        log("PTT start error", err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setIsPushing(false);
      });
    // startListening is SYNC (returns event_id string), so wrap in try/catch
    try {
      session.startListening();
    } catch (err) {
      log("startListening error", err);
    }
  }, []);

  const handlePushStop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    log("PTT stop");
    setIsPushing(false);
    session.voiceChat
      .stopPushToTalk()
      .catch((err: unknown) => log("stopPushToTalk error", err));
    try {
      session.stopListening();
    } catch (err) {
      log("stopListening error", err);
    }
  }, []);

  // Keep refs to latest PTT handlers so global listeners stay current
  useEffect(() => {
    handlePushStartRef.current = handlePushStart;
    handlePushStopRef.current = handlePushStop;
  }, [handlePushStart, handlePushStop]);

  // Keyboard PTT: hold SPACE to talk (skip when typing in an input)
  useEffect(() => {
    if (!isPTT) return;
    const isEditable = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isEditable(e.target)) return;
      e.preventDefault();
      handlePushStartRef.current?.();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isEditable(e.target)) return;
      e.preventDefault();
      handlePushStopRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleDeviceChange = useCallback((deviceId: string) => {
    const session = sessionRef.current;
    if (!session) return;
    log("setDevice", deviceId);
    try {
      // SDK accepts a deviceId string (ConstrainDOMString)
      void session.voiceChat.setDevice(deviceId);
    } catch (err) {
      log("setDevice error", err);
    }
  }, []);

  const handleInterrupt = useCallback(() => {
    sessionRef.current?.interrupt();
  }, []);

  const handleToggleMute = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      if (isMuted) {
        await session.voiceChat.unmute();
        log("manual unmute");
      } else {
        await session.voiceChat.mute();
        log("manual mute");
      }
    } catch (err) {
      log("mute toggle error", err);
    }
  }, [isMuted]);

  const handleEnd = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      await session.stop();
    } catch {
      // ignore
    }
    fetch("/api/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    }).catch(() => {});
  }, [sessionToken]);

  const stateLabel = useMemo(() => {
    switch (sessionState) {
      case SessionState.CONNECTED:
        return "Connected";
      case SessionState.CONNECTING:
        return "Connecting…";
      case SessionState.DISCONNECTED:
        return "Disconnected";
      default:
        return "Idle";
    }
  }, [sessionState]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              sessionState === SessionState.CONNECTED
                ? "bg-green-400"
                : sessionState === SessionState.CONNECTING
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-gray-500"
            }`}
          />
          <span className="text-sm uppercase tracking-wider text-zinc-400">
            {stateLabel}
          </span>
          {sandbox && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
              sandbox
            </span>
          )}
        </div>
        <button
          onClick={handleEnd}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition-colors"
        >
          End Session
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-contain transition-opacity ${
              isStreamReady ? "opacity-100" : "opacity-0"
            }`}
          />
          {!isStreamReady && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-sm">
              Waiting for avatar to join…
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            <Badge active={isUserTalking} colour="blue" label="Panelist" />
            <Badge active={isAvatarTalking} colour="purple" label="Moderator" />
          </div>
        </div>

        <aside className="border border-white/10 rounded-xl bg-white/5 flex flex-col min-h-[320px] lg:min-h-0">
          <div className="px-4 py-3 border-b border-white/10 text-sm font-medium">
            Transcript
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 text-sm">
            {transcript.length === 0 ? (
              <p className="text-zinc-500 text-center mt-6 text-xs">
                Transcription appears here in real time.
              </p>
            ) : (
              transcript.map((line) => (
                <div
                  key={line.id}
                  className={`flex ${line.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[88%] px-3 py-2 rounded-lg ${
                      line.sender === "user"
                        ? "bg-blue-500/20 text-blue-100 border border-blue-500/15"
                        : "bg-white/10 text-zinc-100 border border-white/10"
                    }`}
                  >
                    <span className="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
                      {line.sender === "user"
                        ? line.speakerTag || "Panel"
                        : "Moderator"}
                    </span>
                    <p className="leading-snug whitespace-pre-wrap">
                      {line.text}
                      {line.partial && <span className="opacity-50">…</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <div className="flex flex-col items-center gap-3">
        {errorMsg && (
          <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
            {errorMsg}
          </p>
        )}

        {/* Diagnostic breadcrumb — confirm each stage of the chain */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 font-mono">
          <Crumb
            label="session"
            value={sessionState}
            ok={sessionState === SessionState.CONNECTED}
          />
          <Crumb
            label="voice"
            value={voiceActive ? "ACTIVE" : "off"}
            ok={voiceActive}
          />
          <Crumb
            label="mic"
            value={isMuted ? "MUTED" : "open"}
            ok={!isMuted && voiceActive}
          />
          {isPTT && (
            <Crumb
              label="pushing"
              value={isPushing ? "yes" : "no"}
              ok={isPushing}
            />
          )}
          <Crumb
            label="user-spk"
            value={isUserTalking ? "yes" : "no"}
            ok={isUserTalking}
          />
          <Crumb label="mode" value={isPTT ? "PTT" : "VOICE"} ok={true} />
        </div>

        {isPTT && (
          <PushToTalkButton
            ready={voiceActive && sessionState === SessionState.CONNECTED}
            pushing={isPushing}
            onStart={handlePushStart}
            onStop={handlePushStop}
          />
        )}

        <MicDiagnostics
          enabled={voiceActive}
          onDeviceChange={handleDeviceChange}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleMute}
            disabled={!voiceActive}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              isMuted
                ? "border-red-500/40 text-red-300 bg-red-500/10 hover:bg-red-500/20"
                : "border-white/10 hover:bg-white/5"
            }`}
          >
            {isMuted ? "Unmute mic" : "Mute mic"}
          </button>
          <button
            onClick={handleInterrupt}
            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
          >
            Interrupt
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 max-w-md text-center leading-relaxed">
          {isPTT ? (
            <>
              Hold the button (or <kbd className="px-1 rounded bg-white/10">space</kbd>)
              while speaking; release to send. The mic meter should jump while
              you talk. If <span className="text-zinc-300">user-spk</span> never
              turns on, the SDK isn&apos;t getting your audio — try the
              microphone selector above, or restart in Continuous Voice mode.
            </>
          ) : (
            <>
              Just speak — the avatar listens continuously and replies when you
              pause. <span className="text-zinc-300">user-spk</span> should
              light up shortly after you start talking.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Crumb({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          ok ? "bg-green-400" : "bg-zinc-700"
        }`}
      />
      <span className="text-zinc-600">{label}:</span>
      <span className={ok ? "text-zinc-200" : "text-zinc-500"}>{value}</span>
    </span>
  );
}

function Badge({
  active,
  colour,
  label,
}: {
  active: boolean;
  colour: "blue" | "purple";
  label: string;
}) {
  const ring =
    colour === "blue"
      ? "bg-blue-400 ring-blue-400/30"
      : "bg-purple-400 ring-purple-400/30";
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm ${
        active ? "ring-1" : ""
      } ${active ? ring : ""}`}
    >
      <div
        className={`w-2 h-2 rounded-full ${active ? ring.split(" ")[0] : "bg-zinc-600"} ${active ? "animate-pulse" : ""}`}
      />
      <span className="text-xs text-white/80 font-medium">{label}</span>
    </div>
  );
}

function PushToTalkButton({
  ready,
  pushing,
  onStart,
  onStop,
}: {
  ready: boolean;
  pushing: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      disabled={!ready}
      onMouseDown={onStart}
      onMouseUp={onStop}
      onTouchStart={(e) => {
        e.preventDefault();
        onStart();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        onStop();
      }}
      className={`select-none px-8 py-4 rounded-full font-semibold text-sm border transition-all ${
        !ready
          ? "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed"
          : pushing
            ? "bg-blue-500 text-white border-blue-400 scale-105 shadow-lg shadow-blue-500/30"
            : "bg-white text-black border-white hover:bg-zinc-100 active:scale-95"
      }`}
    >
      {!ready
        ? "Connecting microphone…"
        : pushing
          ? "Listening — release to send"
          : "Hold to talk"}
    </button>
  );
}
