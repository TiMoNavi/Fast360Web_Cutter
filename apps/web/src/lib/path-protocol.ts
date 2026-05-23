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

export type BuiltInEffectEventName =
  | "highlight"
  | "black.solid"
  | "transition.fade_black"
  | "transition.flash_white"
  | "filter.blur"
  | "filter.color_grade"
  | "filter.chromatic_aberration"
  | "filter.vignette"
  | "overlay.letterbox"
  | "overlay.text";

export type EffectEventName = BuiltInEffectEventName | (string & {});

export type EffectRenderPolicy = {
  fallback?: "ignore" | "warn" | "fail";
  requires?: string[];
  priority?: number;
  conflictGroup?: string;
};

export type EffectEventBase = {
  seq: number;
  displayName?: string;
  startMs: number;
  endMs: number;
  params?: Record<string, unknown>;
  enabled?: boolean;
  renderPolicy?: EffectRenderPolicy;
};

export type EffectEvent =
  | (EffectEventBase & {
      eventName: EffectEventName;
      type?: EffectEventName;
    })
  | (EffectEventBase & {
      eventName?: EffectEventName;
      type: EffectEventName;
    });

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

export type SessionMusicConfig = {
  musicId?: string | null;
  enabled?: boolean;
  startMs?: 0;
  gainDb?: number;
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
    recordingRate?: number;
  };
};
