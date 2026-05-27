import type {
  EffectEvent,
  EffectEventName,
  PlaybackClientState,
  ViewPathPatch,
  ViewPathPoint
} from "@/lib/path-protocol";

export type AFrameEntityLike = HTMLElement & {
  object3D?: {
    getWorldDirection?: (target: Vector3Like) => Vector3Like;
  };
};

export type Vector3Like = {
  x: number;
  y: number;
  z: number;
  normalize?: () => Vector3Like;
};

export type TimelineBridgeElementRefs = {
  camera: () => AFrameEntityLike | null;
  leftController?: () => AFrameEntityLike | null;
  rightController?: () => AFrameEntityLike | null;
  scene: () => HTMLElement | null;
  video: () => HTMLVideoElement | null;
};

export type TimelineBridgeContext = {
  sessionId: string;
  videoId: string;
  refs: TimelineBridgeElementRefs;
};

export type ViewInputSource = ViewPathPoint["input"];

export type ViewTargetState = {
  center: {
    yaw: number;
    pitch: number;
  };
  cut: boolean;
  enabled: boolean;
  fov: {
    h: number;
    v: number;
  };
  input: ViewInputSource;
  locked: boolean;
  roll: number;
  samplingPaused: boolean;
  smoothFollow: boolean;
};

export type ViewTargetPose = {
  input: ViewInputSource;
  yaw: number;
  pitch: number;
};

export type TimelinePatchReason = ViewPathPatch["replaceRange"]["reason"];

export type WebXrSemanticEvent =
  | { type: "playPause" }
  | { type: "seekTo"; tMs: number }
  | { type: "lockViewport" }
  | { type: "unlockViewport" }
  | { type: "toggleLock" }
  | { type: "setFov"; h: number; v?: number }
  | { type: "nudgeFov"; deltaH: number }
  | { type: "setRoll"; roll: number }
  | { type: "nudgeRoll"; delta: number }
  | { type: "discardRange"; startMs?: number; endMs?: number }
  | { type: "restoreRange"; startMs?: number; endMs?: number }
  | { type: "cutHere" }
  | {
      type: "createEffectEvent";
      displayName?: string;
      durationMs?: number;
      effectType: EffectEventName;
      endMs?: number;
      params?: Record<string, unknown>;
      renderPolicy?: EffectEvent["renderPolicy"];
      startMs?: number;
    }
  | { type: "flushPath"; reason?: TimelinePatchReason }
  | { type: "samplingPause" }
  | { type: "samplingResume" }
  | {
      type: "setViewTarget";
      force?: boolean;
      flushReason?: TimelinePatchReason;
      ignoreLock?: boolean;
      pathAnchor?: boolean;
      pose: ViewTargetPose;
    }
  | {
      type: "createViewPathRange";
      endMs: number;
      endState: ViewTargetState;
      interpolation?: ViewPathPoint["interpolation"];
      keyframes?: Array<{
        interpolation?: ViewPathPoint["interpolation"];
        state: ViewTargetState;
        timeMs: number;
        transitionMs?: number;
      }>;
      reason?: TimelinePatchReason;
      startMs: number;
      startState: ViewTargetState;
      transitionMs?: number;
    }
  | { type: "controllerAimStart"; hand?: "left" | "right" }
  | { type: "controllerAimEnd"; hand?: "left" | "right" };

export type TimelineBridgeStatus = {
  lastAcceptedPathPatch: {
    acceptedPoints: number;
    firstPoint?: {
      center: ViewPathPoint["center"];
      fov: ViewPathPoint["fov"];
      tMs: number;
    };
    lastPoint?: {
      center: ViewPathPoint["center"];
      fov: ViewPathPoint["fov"];
      tMs: number;
    };
    pathRevision: number;
    replaceRange: ViewPathPatch["replaceRange"];
    status?: string;
  } | null;
  lastError: string | null;
  lastPatchRevision: number;
  pendingEffectEvents: number;
  pendingPathPoints: number;
  queuedPathBatches: number;
};

export type PathPatchSender = (sessionId: string, patch: ViewPathPatch) => Promise<Record<string, unknown>>;
export type EffectPatchSender = (sessionId: string, patch: import("@/lib/path-protocol").EffectEventsPatch) => Promise<Record<string, unknown>>;
export type PlaybackStateSender = (
  sessionId: string,
  state: PlaybackClientState
) => Promise<Record<string, unknown>>;
