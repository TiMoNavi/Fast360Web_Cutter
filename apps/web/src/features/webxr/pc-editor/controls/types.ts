export type AFrame360VideoKind = "mp4" | "hls";

export type AFrame360VideoSource = {
  durationMs?: number;
  id: string;
  title: string;
  kind: AFrame360VideoKind;
  resolution?: string;
  sourceUrl: string;
  thumbnailUrl?: string | null;
};

export type AFrame360VideoCommand =
  | "play"
  | "pause"
  | "toggle-play"
  | "seek-to"
  | "set-rate"
  | "select-source"
  | "toggle-playlist"
  | "close-overlays"
  | "zoom-in"
  | "zoom-out"
  | "next"
  | "previous"
  | "reload-list";

export type AFrame360ActiveMenu = "rate" | "settings" | null;

export type AFrame360VideoCommandPayload = {
  menu?: AFrame360ActiveMenu;
  playbackRate?: number;
  recordingRate?: number;
  sourceId?: string;
  timeMs?: number;
};

export type AFrame360PlaybackState = {
  activeMenu: AFrame360ActiveMenu;
  currentIndex: number;
  currentSource: AFrame360VideoSource | null;
  currentTimeMs: number;
  durationMs: number;
  fov: number;
  isPlaying: boolean;
  lastCommand: AFrame360VideoCommand | "init" | "loaded-source" | "list-loaded" | "error";
  playbackRate: number;
  recordingRate: number;
  playlistOpen: boolean;
  selectedSourceId: string | null;
  sourceCount: number;
  sources: AFrame360VideoSource[];
  status: "idle" | "loading-list" | "ready" | "playing" | "paused" | "blocked" | "error";
};

export type AFrame360VideoSourcesResponse = {
  videos: AFrame360VideoSource[];
};
