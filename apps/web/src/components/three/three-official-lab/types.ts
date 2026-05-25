import type { Group } from "three";
import type { ViewInputSource } from "@/features/webxr/pc-editor/data/timeline-bridge";

export type OfficialAction =
  | "BGM_AMBIENT"
  | "BGM_KICK"
  | "BGM_NONE"
  | "BGM_PREVIEW"
  | "CUT"
  | "DISCARD"
  | "EFFECT_BLACK"
  | "EFFECT_VHS"
  | "EFFECT_WHITE"
  | "FLUSH"
  | "FOV_IN"
  | "FOV_OUT"
  | "LOCK"
  | "PITCH_DOWN"
  | "PITCH_UP"
  | "PLAY"
  | "RESTORE"
  | "RENDER"
  | "SAVE"
  | "START_CROP"
  | "END_CROP"
  | "FX"
  | "EXPORT"
  | "SESSION"
  | "FOV"
  | "YAW_LEFT"
  | "YAW_RIGHT";

export type OfficialModule = "BGM" | "EXPORT" | "FOV" | "FRAME" | "FX" | "SAMPLER" | "SESSION" | "WORKFLOW";

export type PlayerAction =
  | "NEXT"
  | "PLAY_TOGGLE"
  | "PREV"
  | "RATE_0_5"
  | "RATE_1"
  | "RATE_2"
  | "RECORD_RATE_DOWN"
  | "RECORD_RATE_RESET"
  | "RECORD_RATE_UP"
  | "RECORD_TOGGLE"
  | "SELECT_SOURCE"
  | "TOGGLE_UI";

export type FollowMode = "controller_ray" | "head_gaze" | "idle";
export type ControllerHand = "left" | "right";
export type UiEditMode = "AIM" | "DRAG" | "FOV" | "GAZE" | "IDLE" | "LOCKED" | "OPACITY";
export type CropWorkflowStatus = "done" | "ending" | "idle" | "ready" | "recording" | "rendering";
export type BgmChoice = "ambient-pulse" | "kick-guide" | "none";
export type WorkflowEffectAction = "effectBlack" | "effectVhs" | "effectWhite";

export type LabRecordingSample = {
  fovH: number;
  fovV: number;
  input: ViewInputSource;
  pitch: number;
  reason: string;
  seq: number;
  tMs: number;
  yaw: number;
};

export type LabEffectLogItem = {
  displayName: string;
  effectType: string;
  seq: number;
};

export type LabBackendBinding = {
  sessionId: string;
  videoId: string;
};

export type XrControllerObject = Group & {
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
};

export type BrowserXr = {
  isSessionSupported?: (mode: "immersive-vr") => Promise<boolean>;
  requestSession?: (mode: "immersive-vr", options?: XRSessionInit) => Promise<XRSession>;
};

export type SyntheticControllerSelectDetail = {
  hand?: ControllerHand;
  instant?: boolean;
  phase?: "end" | "start";
  rayDirection?: { x: number; y: number; z: number };
  rayOrigin?: { x: number; y: number; z: number };
};

export type SyntheticThumbstickDetail = {
  hand?: ControllerHand;
  y?: number;
};

export type SyntheticQuickMenuDetail = {
  pointerPosition?: { x: number; y: number; z: number };
  phase?: "aim" | "press" | "release";
  rayDirection?: { x: number; y: number; z: number };
  rayOrigin?: { x: number; y: number; z: number };
};

export type QuickMenuAction =
  | "blackFade"
  | "cut"
  | "discard"
  | "endCrop"
  | "fovIn"
  | "fovOut"
  | "lock"
  | "render"
  | "restore"
  | "save"
  | "startCrop"
  | "vhsBlank"
  | "whiteFlash";

export type QuickMenuItem = {
  action: QuickMenuAction;
  label: string;
  subLabel: string;
};
