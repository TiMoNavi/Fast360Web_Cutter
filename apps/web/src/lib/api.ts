import type {
  ClipEditConfig,
  EffectEventsPatch,
  PlaybackClientState,
  SessionMusicConfig,
  ViewPathPatch
} from "./path-protocol";

export const API_BASE_URL =
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function normalizeApiPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function isLoopbackHost(hostname: string) {
  const normalizedHost = hostname.toLowerCase();
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "0.0.0.0" ||
    normalizedHost === "::1" ||
    normalizedHost === "[::1]" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.startsWith("127.")
  );
}

function getUrlHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function browserApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (!configuredBaseUrl) {
    return "";
  }

  const configuredHost = getUrlHostname(configuredBaseUrl);
  if (!configuredHost || !isLoopbackHost(configuredHost)) {
    return configuredBaseUrl;
  }

  if (typeof window === "undefined") {
    return "";
  }

  return isLoopbackHost(window.location.hostname) ? configuredBaseUrl : "";
}

export function apiUrl(path: string) {
  return `${browserApiBaseUrl()}${normalizeApiPath(path)}`;
}

function apiFetchUrl(path: string) {
  const normalizedPath = normalizeApiPath(path);
  if (typeof window !== "undefined") {
    return apiUrl(normalizedPath);
  }

  return `${API_BASE_URL}${normalizedPath}`;
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
  contentType?: string;
  status: string;
  fileSize?: number;
  durationMs?: number;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  sourceUrl?: string;
  thumbnailUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type DemoVideoSummary = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  difficulty: string;
  sourceFilename: string;
  projection: "equirectangular";
  layout: "mono-2:1";
  durationHintMs: number;
  resolutionLabel: string;
  attribution: string;
  tutorialSteps: Array<{
    title: string;
    body: string;
  }>;
  sourceUrl: string;
  thumbnailUrl?: string | null;
};

export type DemoStartResult = {
  sampleId: string;
  videoId: string;
  sessionId: string;
  mobileVideoPath: string;
  xrPath: string;
};

export type MusicTrackSummary = {
  id: string;
  filename: string;
  contentType?: string;
  status: string;
  sourceUrl?: string;
  fileSize?: number;
  durationMs?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type SessionMusicState = Required<Pick<SessionMusicConfig, "enabled" | "startMs" | "gainDb">> & {
  musicId?: string | null;
  music?: MusicTrackSummary | null;
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
  latestExport?: (ExportStatus & {
    id?: string;
    session_id?: string;
    file_path?: string | null;
    error_message?: string | null;
    created_at?: string;
    updated_at?: string;
  }) | null;
  [key: string]: unknown;
};

export type ThumbnailRequest = {
  timeMs?: number | null;
  yaw?: number;
  pitch?: number;
  hFov?: number;
  vFov?: number;
  width?: number;
  height?: number;
};

export type CutSessionSummary = {
  sessionId: string;
  videoId: string;
  status: string;
};

export type WebXrPlayerSession = {
  sessionId: string;
  videoId: string;
  status: string;
  timelineRevision: number;
  source: "active" | "created" | "latest-session" | "switched" | string;
  xrPath: string;
  latestExport?: ExportStatus | null;
  music?: SessionMusicState | null;
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
  fileSize?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExportSummary = ExportStatus & {
  videoId: string;
  filename: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
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
  const response = await fetch(apiFetchUrl(path), {
    cache: "no-store",
    credentials: "include",
    headers: requestHeaders(options)
  });
  return parseJson<T>(response);
}

export async function apiPostJson<T>(path: string, payload: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(apiFetchUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders(options)
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  return parseJson<T>(response);
}

export async function apiPutJson<T>(path: string, payload: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(apiFetchUrl(path), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders(options)
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

export async function getWebXrPlayerSession(options?: RequestOptions): Promise<WebXrPlayerSession> {
  return apiGet<WebXrPlayerSession>("/api/xr/player-session", options);
}

export async function switchWebXrPlayerSession(
  videoId: string,
  options?: RequestOptions
): Promise<WebXrPlayerSession> {
  return apiPutJson<WebXrPlayerSession>(
    "/api/xr/player-session",
    { videoId },
    options
  );
}

export async function listDemoVideos(): Promise<DemoVideoSummary[]> {
  const data = await apiGet<{ videos: DemoVideoSummary[] }>("/api/demo-videos");
  return data.videos;
}

export async function startDemoVideo(sampleId: string): Promise<DemoStartResult> {
  return apiPostJson<DemoStartResult>(
    `/api/demo-videos/${encodeURIComponent(sampleId)}/start`,
    {}
  );
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

export async function uploadVideoWithProgress(
  file: File,
  onProgress: (progress: { loaded: number; total: number; percent: number }) => void
): Promise<VideoDetail> {
  const form = new FormData();
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/videos/upload"));
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress({ loaded: event.loaded, total: event.total, percent });
    };

    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const message =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail?: unknown }).detail)
            : `${xhr.status} ${xhr.statusText}`;
        reject(new Error(message));
        return;
      }

      resolve(body as VideoDetail);
    };

    xhr.onerror = () => reject(new Error("Network error while uploading video"));
    xhr.onabort = () => reject(new Error("Upload was cancelled"));
    xhr.send(form);
  });
}

export async function createVideoThumbnail(
  videoId: string,
  payload: ThumbnailRequest = {}
): Promise<VideoDetail> {
  return apiPostJson<VideoDetail>(
    `/api/videos/${encodeURIComponent(videoId)}/thumbnail`,
    payload
  );
}

export async function listMusicTracks(options?: RequestOptions): Promise<MusicTrackSummary[]> {
  const data = await apiGet<{ musicTracks: MusicTrackSummary[] }>("/api/music-tracks", options);
  return data.musicTracks;
}

export async function uploadMusicTrack(file: File): Promise<MusicTrackSummary> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiUrl("/api/music-tracks/upload"), {
    method: "POST",
    credentials: "include",
    body: form
  });

  return parseJson<MusicTrackSummary>(response);
}

export async function getSessionMusic(
  sessionId: string,
  options?: RequestOptions
): Promise<SessionMusicState> {
  return apiGet<SessionMusicState>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/music`,
    options
  );
}

export async function updateSessionMusic(
  sessionId: string,
  config: SessionMusicConfig
): Promise<SessionMusicState> {
  return apiPutJson<SessionMusicState>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/music`,
    config
  );
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
  sessionId: string,
  options?: RequestOptions
): Promise<CutSessionSummary> {
  return apiPostJson<CutSessionSummary>(
    "/api/cut-sessions",
    defaultClipEditConfig(videoId, sessionId),
    options
  );
}

export async function updateCutSessionVideo(
  sessionId: string,
  videoId: string,
  options?: RequestOptions
): Promise<{ sessionId: string; videoId: string }> {
  return apiPutJson<{ sessionId: string; videoId: string }>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/config`,
    defaultClipEditConfig(videoId, sessionId),
    options
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

export async function sendEffectEventsPatch(
  sessionId: string,
  patch: EffectEventsPatch
): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/effect-events`,
    patch
  );
}

export async function sendPlaybackClientState(
  sessionId: string,
  state: PlaybackClientState
): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/playback-state`,
    state
  );
}

export async function renderTest(sessionId: string): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/render-test`,
    {}
  );
}

export async function finalizeRecording(
  sessionId: string,
  payload: { endMs?: number; startMs?: number } = {}
): Promise<Record<string, unknown>> {
  return apiPostJson<Record<string, unknown>>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/finalize-recording`,
    payload
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

export async function abandonCutSession(
  sessionId: string
): Promise<{ sessionId: string; status: string }> {
  return apiPostJson<{ sessionId: string; status: string }>(
    `/api/cut-sessions/${encodeURIComponent(sessionId)}/abandon`,
    {}
  );
}

export async function getExportStatus(
  exportId: string,
  options?: RequestOptions
): Promise<ExportStatus> {
  return apiGet<ExportStatus>(`/api/exports/${encodeURIComponent(exportId)}`, options);
}

export async function listExports(options?: RequestOptions): Promise<ExportSummary[]> {
  const data = await apiGet<{ exports: ExportSummary[] }>("/api/exports", options);
  return data.exports;
}
