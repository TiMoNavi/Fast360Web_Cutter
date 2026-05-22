export type ClipEditConfig = {
  version: 1;
  videoId: string;
  sessionId: string;
  source: "webxr";
  timelineRevision: number;
  output: {
    aspect: "16:9";
    width: 1920;
    height: 1080;
    fps: 30;
  };
};

export type ViewPathPoint = {
  seq: number;
  tMs: number;
  center: {
    yaw: number;
    pitch: number;
  };
  fov: {
    h: number;
    v: number;
  };
  roll: number;
  enabled: boolean;
  cut: boolean;
  locked: boolean;
  smoothFollow: boolean;
  interpolation?: "linear" | "fast" | "hold";
  transitionMs?: number;
  input: "head_gaze" | "controller_ray";
};

export type ViewPathPatch = {
  version: 1;
  videoId: string;
  sessionId: string;
  takeId: string;
  pathRevision: number;
  replaceRange: {
    startMs: number;
    endMs: number;
    reason: "live" | "replay" | "discard" | "restore" | "cut" | "fov" | "lock";
  };
  points: ViewPathPoint[];
};

export type EffectEventName =
  | "fadeBlack"
  | "fadeOutBlack"
  | "fadeInBlack"
  | "highlight";

export type EffectEvent = {
  seq: number;
  eventName: EffectEventName;
  startMs: number;
  endMs: number;
  params?: Record<string, unknown>;
  enabled?: boolean;
};

export type EffectEventsPatch = {
  version: 1;
  videoId: string;
  sessionId: string;
  effectRevision: number;
  replaceRange: {
    startMs: number;
    endMs: number;
    reason: "effect";
  };
  events: EffectEvent[];
};

export type PlaybackClientState = {
  sessionId: string;
  videoId: string;
  clientTimeMs: number;
  videoTimeMs: number;
  playbackRate: number;
  previousPlaybackRate?: number;
  discardFastForwardRate: 5;
  preview: {
    brightness: number;
    contrast: number;
    overlayOpacity: number;
  };
  recording: {
    samplingPaused: boolean;
    discardMode: boolean;
  };
};
