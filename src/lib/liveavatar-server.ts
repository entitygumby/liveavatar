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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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

export type ContextInput = {
  name: string;
  prompt: string;
  opening_text: string;
  links?: Array<{ url: string; faq: string }>;
};

export async function createContext(
  input: ContextInput,
): Promise<ContextResponse> {
  return call<ContextResponse>("/v1/contexts", {
    method: "POST",
    body: input,
  });
}

export async function updateContext(
  id: string,
  input: ContextInput,
): Promise<ContextResponse> {
  return call<ContextResponse>(`/v1/contexts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

export type SttProvider = "deepgram" | "assembly_ai" | "gladia" | "elevenlabs";

export type SessionTokenResponse = {
  data: { session_id: string; session_token: string };
};

export async function createSessionToken(input: {
  mode: "FULL";
  avatar_id: string;
  avatar_persona: {
    voice_id?: string;
    context_id?: string;
    language: string;
    stt_config?: { provider: SttProvider };
  };
  is_sandbox?: boolean;
  interactivity_type?: "PUSH_TO_TALK" | "CONVERSATIONAL";
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

export type SecretType =
  | "OPENAI_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "GEMINI_API_KEY";

export type Secret = {
  id: string;
  secret_name: string;
  secret_type: SecretType;
  created_at?: string;
};

export async function listSecrets(): Promise<Secret[]> {
  // The list-secrets endpoint returns metadata only (never values).
  // Returns `data` as an array directly (not paginated).
  const res = await call<{ data: Secret[] }>("/v1/secrets");
  return res.data ?? [];
}

export async function createSecret(input: {
  secret_type: SecretType;
  secret_name: string;
  secret_value: string;
}): Promise<{ id: string; secret_name: string }> {
  const res = await call<{ data: { id: string; secret_name: string } }>(
    "/v1/secrets",
    { method: "POST", body: input },
  );
  return res.data;
}

export async function bindThirdPartyVoice(input: {
  provider_voice_id: string;
  secret_id: string;
  name?: string;
}): Promise<{ voice_id: string }> {
  const res = await call<{ data: { voice_id: string } }>(
    "/v1/voices/third_party",
    { method: "POST", body: input },
  );
  return res.data;
}
