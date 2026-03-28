/**
 * api.ts — Typed HTTP client for all Avataar Platform backend endpoints.
 *
 * Conventions:
 *  - All functions return the parsed JSON response (or throw on HTTP error).
 *  - The BASE_URL is read from NEXT_PUBLIC_BACKEND_URL at build/runtime.
 *  - File uploads use FormData (multipart/form-data).
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Bot {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_provider: string;
  avatar_id: string | null;
  avatar_name: string | null;
  avatar_preview_url: string | null;
  voice_provider: string;
  voice_id: string | null;
  voice_name: string | null;
  knowledge_prompt: string | null;
  system_prompt: string | null;
  bot_name: string;
  greeting_en: string;
  greeting_hi: string;
  theme_color: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  doc_count: number;
}

export interface BotPublic {
  id: string;
  name: string;
  slug: string;
  avatar_provider: string;
  avatar_id: string | null;
  avatar_name: string | null;
  avatar_preview_url: string | null;
  voice_provider: string;
  voice_id: string | null;
  voice_name: string | null;
  bot_name: string;
  greeting_en: string;
  greeting_hi: string;
  theme_color: string;
}

export interface Document {
  id: string;
  bot_id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  is_active: boolean;
  description: string | null;
  uploaded_at: string | null;
}

export interface AvatarInfo {
  id: string;
  name: string;
  preview_image_url?: string | null;
}

export interface VoiceInfo {
  voice_id: string;
  name: string;
  language?: string | null;
  gender?: string | null;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

export interface Provider {
  id: string;
  display_name: string;
  requires_keys: string[];
  configured: boolean;
}

export interface BotSessionConfig {
  id: string;
  name: string;
  slug: string;
  avatar_provider: string;
  avatar_id: string | null;
  avatar_name: string | null;
  voice_provider: string;
  voice_id: string | null;
  bot_name: string;
  greeting_en: string;
  greeting_hi: string;
  theme_color: string;
}

export interface SessionStartResponse {
  session_id: string;
  started_at: string;
  bot: BotSessionConfig;
  greeting: string;
}

export interface ChatResponse {
  session_id: string;
  response: string;
  language: string;
}

export interface AnalyticsData {
  sentiment: "positive" | "neutral" | "negative";
  lead_score: number;
  intent: string;
  topics: string[];
  concerns: string[];
  recommended_actions: string[];
  summary: string;
}

export interface SessionReport {
  session_id: string;
  bot_id: string | null;
  bot_slug: string | null;
  customer_name: string | null;
  channel: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  analytics: AnalyticsData | Record<string, unknown>;
}

export interface SummaryReport {
  total_sessions: number;
  sentiment_breakdown: Record<string, number>;
  avg_lead_score: number;
  intent_breakdown: Record<string, number>;
  top_topics: string[];
  common_concerns: string[];
}

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------

export const authStorage = {
  getToken: () => typeof window !== "undefined" ? localStorage.getItem("rlai_admin_token") : null,
  setToken: (t: string) => localStorage.setItem("rlai_admin_token", t),
  clearToken: () => localStorage.removeItem("rlai_admin_token"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch {
      // ignore parse error
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

async function getWithAuth<T>(path: string): Promise<T> {
  const token = authStorage.getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function upload<T>(
  path: string,
  file: File,
  description?: string
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  if (description) {
    form.append("description", description);
  }

  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: "POST",
    body: form,
    // Do NOT set Content-Type here — browser sets it with boundary automatically
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const api = {
  // --- Auth ---
  login: (email: string, password: string) => post<{ token: string; email: string }>("/api/auth/login", { email, password }),
  me: () => getWithAuth<{ email: string }>("/api/auth/me"),

  // --- Bots ---
  createBot: (name: string, description?: string): Promise<Bot> =>
    post<Bot>("/api/bots", { name, description }),

  listBots: (): Promise<{ bots: Bot[] }> =>
    get<{ bots: Bot[] }>("/api/bots"),

  getBot: (id: string): Promise<Bot> =>
    get<Bot>(`/api/bots/${id}`),

  getBotBySlug: (slug: string): Promise<BotPublic> =>
    get<BotPublic>(`/api/bots/slug/${slug}`),

  updateBot: (id: string, data: Partial<Bot>): Promise<Bot> =>
    put<Bot>(`/api/bots/${id}`, data),

  deleteBot: (id: string): Promise<{ deleted: boolean; id: string }> =>
    del(`/api/bots/${id}`),

  // --- Bot Documents ---
  uploadDocument: (botId: string, file: File, description?: string): Promise<Document> =>
    upload<Document>(`/api/bots/${botId}/documents/upload`, file, description),

  getBotDocuments: (botId: string): Promise<{ documents: Document[] }> =>
    get<{ documents: Document[] }>(`/api/bots/${botId}/documents`),

  toggleDocument: (botId: string, docId: string): Promise<Document> =>
    patch<Document>(`/api/bots/${botId}/documents/${docId}/toggle`),

  deleteDocument: (
    botId: string,
    docId: string
  ): Promise<{ deleted: boolean; id: string }> =>
    del(`/api/bots/${botId}/documents/${docId}`),

  previewDocument: (
    botId: string,
    docId: string
  ): Promise<{ id: string; preview: string; original_name: string }> =>
    get(`/api/bots/${botId}/documents/${docId}/preview`),

  // --- Avatar providers ---
  getAvatarProviders: (): Promise<{ providers: Provider[] }> =>
    get<{ providers: Provider[] }>("/api/avatars/providers"),

  getAvatarList: (
    provider: string
  ): Promise<{ provider: string; avatars: AvatarInfo[] }> =>
    get(`/api/avatars/${provider}/avatars`),

  getProviderVoices: (
    provider: string
  ): Promise<{ provider: string; voices: VoiceInfo[] }> =>
    get(`/api/avatars/${provider}/voices`),

  getHeyGenToken: (): Promise<{ token: string }> =>
    post<{ token: string }>("/api/avatars/heygen/token", {}),

  getLiveAvatarToken: (
    avatarId: string,
    mode = "LITE"
  ): Promise<{ session_token: string; session_id: string }> =>
    post<{ session_token: string; session_id: string }>(
      "/api/avatars/liveavatar/token",
      { avatar_id: avatarId, mode }
    ),

  generateSuggestions: (
    botId: string
  ): Promise<{ system_prompt: string; faqs: { q: string; a: string }[] }> =>
    post(`/api/bots/${botId}/generate-suggestions`, {}),

  createDIDSession: (
    avatarId: string
  ): Promise<Record<string, unknown>> =>
    post("/api/avatars/did/session", { avatar_id: avatarId }),

  sendDIDSDP: (
    streamId: string,
    sessionId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<Record<string, unknown>> =>
    post(`/api/avatars/did/session/${streamId}/sdp`, {
      session_id: sessionId,
      answer,
    }),

  sendDIDICE: (
    streamId: string,
    sessionId: string,
    candidate: RTCIceCandidateInit
  ): Promise<Record<string, unknown>> =>
    post(`/api/avatars/did/session/${streamId}/ice`, {
      session_id: sessionId,
      candidate,
    }),

  didSpeak: (
    streamId: string,
    sessionId: string,
    text: string,
    voiceId?: string
  ): Promise<Record<string, unknown>> =>
    post(`/api/avatars/did/session/${streamId}/speak`, {
      session_id: sessionId,
      text,
      voice_id: voiceId,
    }),

  closeDIDSession: (
    streamId: string,
    sessionId: string
  ): Promise<{ closed: boolean }> =>
    del(`/api/avatars/did/session/${streamId}?session_id=${sessionId}`),

  getSimliToken: (
    faceId: string
  ): Promise<Record<string, unknown>> =>
    post("/api/avatars/simli/token", { face_id: faceId }),

  // --- Voice providers ---
  getVoiceProviders: (): Promise<{ providers: Provider[] }> =>
    get<{ providers: Provider[] }>("/api/voices/providers"),

  getVoiceList: (
    provider: string
  ): Promise<{ provider: string; voices: VoiceInfo[] }> =>
    get(`/api/voices/${provider}/voices`),

  synthesizeVoice: (
    provider: string,
    voiceId: string,
    text: string,
    language?: string
  ): Promise<{ audio_base64: string; content_type: string }> =>
    post(`/api/voices/${provider}/synthesize`, {
      voice_id: voiceId,
      text,
      language,
    }),

  // --- Sessions & Chat ---
  startSession: (
    botSlug: string,
    customerName?: string,
    channel?: string
  ): Promise<SessionStartResponse> =>
    post<SessionStartResponse>("/api/session/start", {
      bot_slug: botSlug,
      customer_name: customerName,
      channel: channel || "web",
    }),

  endSession: (
    sessionId: string
  ): Promise<{ session_id: string; duration_seconds: number; analytics: AnalyticsData }> =>
    post("/api/session/end", { session_id: sessionId }),

  chat: (
    sessionId: string,
    message: string,
    language: string
  ): Promise<ChatResponse> =>
    post<ChatResponse>("/api/chat", {
      session_id: sessionId,
      message,
      language,
    }),

  // --- Reports ---
  getReports: (
    botId?: string,
    limit?: number,
    offset?: number
  ): Promise<{ sessions: SessionReport[]; limit: number; offset: number }> => {
    const params = new URLSearchParams();
    if (botId) params.set("bot_id", botId);
    params.set("limit", String(limit ?? 50));
    params.set("offset", String(offset ?? 0));
    return get(`/api/reports?${params.toString()}`);
  },

  getSummaryReport: (botId?: string): Promise<SummaryReport> => {
    const params = botId ? `?bot_id=${botId}` : "";
    return get<SummaryReport>(`/api/reports/summary${params}`);
  },

  getSessionAnalytics: (
    sessionId: string
  ): Promise<{
    session_id: string;
    analytics: AnalyticsData;
    duration_seconds: number | null;
  }> => get(`/api/analytics/${sessionId}`),
};
