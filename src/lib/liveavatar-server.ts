import "server-only";

const API_BASE = "https://api.liveavatar.com";

function apiKey(): string {
  const key = process.env.LIVEAVATAR_API_KEY;
  if (!key) {
    throw new Error(
      "LIVEAVATAR_API_KEY is not set. Copy .env.local.example to .env.local and fill it in.",
    );
  }
  return key;
}

type FetchOpts = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  auth?: { bearer: string } | { apiKey: true };
  query?: Record<string, string | number | boolean | undefined>;
};

async function call<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", body, auth = { apiKey: true }, query } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if ("bearer" in auth) {
    headers["Authorization"] = `Bearer ${auth.bearer}`;
  } else {
    headers["X-API-KEY"] = apiKey();
  }
  let url = `${API_BASE}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `LiveAvatar ${method} ${path} → ${res.status}: ${text || res.statusText}`,
    );
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type ContextResponse = {
  data: { id: string; name: string };
};

export async function createContext(input: {
  name: string;
  prompt: string;
  opening_text: string;
  links?: Array<{ url: string; faq: string }>;
}): Promise<ContextResponse> {
  return call<ContextResponse>("/v1/contexts", {
    method: "POST",
    body: input,
  });
}

export type SessionTokenResponse = {
  data: { session_id: string; session_token: string };
};

export async function createSessionToken(input: {
  mode: "FULL";
  avatar_id: string;
  avatar_persona: { voice_id?: string; context_id?: string; language: string };
  is_sandbox?: boolean;
  interactivity_type?: "PUSH_TO_TALK" | "VOICE";
  video_quality?: "very_high" | "high" | "medium" | "low";
}): Promise<SessionTokenResponse> {
  return call<SessionTokenResponse>("/v1/sessions/token", {
    method: "POST",
    body: input,
  });
}

export async function keepAliveSession(sessionToken: string): Promise<void> {
  await call("/v1/sessions/keep-alive", {
    method: "POST",
    auth: { bearer: sessionToken },
  });
}

export async function stopSession(sessionToken: string): Promise<void> {
  await call("/v1/sessions/stop", {
    method: "POST",
    auth: { bearer: sessionToken },
  });
}

export const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

export type Avatar = {
  id: string;
  name: string;
  type: "VIDEO" | "IMAGE";
  status: "ACTIVE" | "INIT" | "DEPLOYING" | "FAILED";
  preview_url?: string;
  default_voice?: { id: string; name: string } | null;
  is_1080p?: boolean;
};

export type Voice = {
  id: string;
  name: string;
  description?: string;
  language?: string;
  gender?: string;
  tags?: string[];
};

type Paginated<T> = {
  data: { count: number; next: string | null; previous: string | null; results: T[] };
};

export async function listAvatars(): Promise<Avatar[]> {
  const res = await call<Paginated<Avatar>>("/v1/avatars", {
    query: { page_size: 100 },
  });
  return res.data.results;
}

export async function listVoices(
  voiceType: "public" | "private" = "public",
): Promise<Voice[]> {
  const res = await call<Paginated<Voice>>("/v1/voices", {
    query: { page_size: 100, voice_type: voiceType },
  });
  return res.data.results;
}

export type ContextSummary = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export async function listContexts(): Promise<ContextSummary[]> {
  const res = await call<Paginated<ContextSummary>>("/v1/contexts", {
    query: { page_size: 100 },
  });
  return res.data.results;
}

export async function deleteContext(id: string): Promise<void> {
  await call(`/v1/contexts/${encodeURIComponent(id)}`, { method: "DELETE" });
}
