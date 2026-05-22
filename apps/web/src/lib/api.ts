import type { ClipEditConfig, ViewPathPatch } from "./path-protocol";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export type MinuteStatus =
  | "collecting"
  | "ready"
  | "rendering"
  | "done"
  | "dirty"
  | "failed"
  | "discarded";

export type VideoSummary = {
  id: string;
  filename: string;
  status: string;
  durationMs?: number;
  sourceUrl?: string;
  createdAt?: string;
};

export type VideoDetail = VideoSummary & {
  contentType?: string;
  metadata?: Record<string, unknown>;
  latestSession?: {
    id: string;
    video_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  } | null;
  latestExport?: ExportStatus | null;
  [key: string]: unknown;
};

export type CutSessionSummary = {
  sessionId: string;
  videoId: string;
  status: string;
};

export type AuthUser = {
  id: string;
  email: string;
};

export type SessionStatus = {
  sessionStatus: string;
  videoId: string;
  exportId?: string | null;
  minuteStatuses: Array<Record<string, unknown>>;
  completedCount: number;
  dirtyCount: number;
  discardedCount: number;
  failedCount: number;
  downloadReady: boolean;
};

export type ExportStatus = {
  exportId: string;
  sessionId: string;
  status: string;
  downloadReady: boolean;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequestOptions = {
  cookie?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { detail?: string } | null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "detail" in body && body.detail
        ? String(body.detail)
        : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return body as T;
}

function requestHeaders(options?: RequestOptions): HeadersInit {
  return options?.cookie ? { cookie: options.cookie } : {};
}

export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    credentials: "include",
    headers: requestHeaders(options)
  });
  return parseJson<T>(response);
}

export async function apiPostJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  return parseJson<T>(response);
}

export async function register(email: string, password: string): Promise<AuthUser> {
  return apiPostJson<AuthUser>("/api/auth/register", { email, password });
}

export async function login(email: string, password: string): Promise<AuthUser> {
  return apiPostJson<AuthUser>("/api/auth/login", { email, password });
}

export async function logout(): Promise<{ status: string }> {
  return apiPostJson<{ status: string }>("/api/auth/logout", {});
}

export async function getMe(options?: RequestOptions): Promise<AuthUser> {
  return apiGet<AuthUser>("/api/auth/me", options);
}

export async function listVideos(options?: RequestOptions): Promise<VideoSummary[]> {
  const data = await apiGet<{ videos: VideoSummary[] }>("/api/videos", options);
  return data.videos;
}

export async function getVideo(videoId: string, options?: RequestOptions): Promise<VideoDetail> {
  return apiGet<VideoDetail>(`/api/videos/${encodeURIComponent(videoId)}`, options);
}

export async function uploadVideo(file: File): Promise<VideoDetail> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiUrl("/api/videos/upload"), {
    method: "POST",
    credentials: "include",
    body: form
  });

  return parseJson<VideoDetail>(response);
}

export function defaultClipEditConfig(videoId: string, sessionId: string): ClipEditConfig {
  return {
    version: 1,
    videoId,
    sessionId,
    source: "webxr",
    timelineRevision: 1,
    output: {
      aspect: "16:9",
      width: 1920,
      height: 1080,
      fps: 30
    }
  };
}

export async function createCutSession(
  videoId: string,
  sessionId: string
): Promise<CutSessionSummary> {
  return apiPostJson<CutSessionSummary>(
    "/api/cut-sessions",
    defaultClipEditConfig(videoId, sessionId)
  );
}

export async function sendViewPathPatch(
  sessionId: string,
  patch: ViewPathPatch
): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/path-patches`,
    patch
  );
}

export async function renderTest(sessionId: string): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/render-test`,
    {}
  );
}

export async function getSessionStatus(
  sessionId: string,
  options?: RequestOptions
): Promise<SessionStatus> {
  return apiGet<SessionStatus>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/status`,
    options
  );
}

export async function getExportStatus(
  exportId: string,
  options?: RequestOptions
): Promise<ExportStatus> {
  return apiGet<ExportStatus>(`/api/exports/${encodeURIComponent(exportId)}`, options);
}
