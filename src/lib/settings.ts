import {
  DEFAULT_INTERVIEW_CONTEXT,
  DEFAULT_OPENING_TEXT,
  BASE_MODERATOR_PROMPT,
} from "./interview-defaults";

export type InteractivityType = "PUSH_TO_TALK" | "CONVERSATIONAL";

export interface AppSettings {
  /** Default avatar to launch with ("" = first active avatar). */
  avatarId: string;
  /** Voice override ("" = use the avatar's paired default voice). */
  voiceId: string;
  /** When true, launch uses a pre-saved context by id (skip create/update). */
  useExistingContext: boolean;
  contextId: string;
  /** Friendly name the context is saved/updated under when building from fields. */
  contextName: string;
  /** Persona base prompt; panel + topic are appended at session start. */
  prompt: string;
  openingText: string;
  panel: string;
  topic: string;
  /** ASR engine ("" = let LiveAvatar decide). */
  sttProvider: string;
  interactivityType: InteractivityType;
  /** Label used to tag transcript lines. */
  speakerTag: string;
}

/** The payload POSTed to /api/session. Built from settings + chosen avatar. */
export interface SessionStartInput {
  avatarId?: string;
  voiceId?: string;
  contextId?: string;
  contextName?: string;
  prompt?: string;
  openingText?: string;
  panel?: string;
  topic?: string;
  sttProvider?: string;
  interactivityType: InteractivityType;
  speakerTag: string;
}

export const SETTINGS_KEY = "liveavatar.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  avatarId: "",
  voiceId: "",
  useExistingContext: false,
  contextId: "",
  contextName: DEFAULT_INTERVIEW_CONTEXT.name,
  prompt: BASE_MODERATOR_PROMPT,
  openingText: DEFAULT_OPENING_TEXT,
  panel: "",
  topic: "",
  sttProvider: "deepgram",
  interactivityType: "PUSH_TO_TALK",
  speakerTag: "Panel",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage full / disabled — non-fatal
  }
}

/** True once the user has saved settings at least once on this browser. */
export function hasSavedSettings(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

/** Build the /api/session payload from settings + the avatar/voice chosen at launch. */
export function buildSessionInput(
  settings: AppSettings,
  overrides: { avatarId?: string; voiceId?: string },
): SessionStartInput {
  const base: SessionStartInput = {
    avatarId: overrides.avatarId || settings.avatarId || undefined,
    voiceId: overrides.voiceId || settings.voiceId || undefined,
    sttProvider: settings.sttProvider || undefined,
    interactivityType: settings.interactivityType,
    speakerTag: settings.speakerTag,
  };

  if (settings.useExistingContext && settings.contextId) {
    return { ...base, contextId: settings.contextId };
  }
  return {
    ...base,
    contextName: settings.contextName,
    prompt: settings.prompt,
    openingText: settings.openingText,
    panel: settings.panel,
    topic: settings.topic,
  };
}
