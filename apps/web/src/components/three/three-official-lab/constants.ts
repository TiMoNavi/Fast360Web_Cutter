import type { AFrame360VideoSource } from "@/features/webxr/pc-editor/controls/types";
import type { ViewTargetPose } from "@/features/webxr/pc-editor/data/timeline-bridge";
import type { QuickMenuItem } from "./types";

export const DEG_TO_RAD = Math.PI / 180;
export const HEAD_GAZE_HOLD_MS = 280;
export const DUAL_SELECT_COMBO_MS = 160;
export const FOV_FLUSH_DEBOUNCE_MS = 260;
export const FOV_THUMBSTICK_DEADZONE = 0.18;
export const FOV_THUMBSTICK_MAX_DEG_PER_SECOND = 34;
export const MASK_OPACITY_DEFAULT = 0.74;
export const MASK_OPACITY_MAX = 0.95;
export const MASK_OPACITY_MIN = 0;
export const MASK_OPACITY_THUMBSTICK_MAX_PER_SECOND = 0.72;
export const CROP_FRAME_DISTANCE = 2.08;
export const CROP_MASK_RADIUS = 17.5;
export const SPHERE_CLICK_MAX_MOVE_PX = 8;
export const SPHERE_SMOOTH_MOVE_MS = 180;

export const DEFAULT_VIEW_TARGET: ViewTargetPose = {
  input: "head_gaze",
  pitch: 0,
  yaw: 0
};

export const QUICK_MENU_BUTTON_INDEX = 5;
export const LEFT_MENU_BUTTON_INDEX = 6;
export const QUICK_MENU_ITEMS: QuickMenuItem[] = [
  { action: "startCrop", label: "START", subLabel: "crop" },
  { action: "endCrop", label: "END", subLabel: "seal" },
  { action: "render", label: "RENDER", subLabel: "export" },
  { action: "cut", label: "CUT", subLabel: "mark" },
  { action: "lock", label: "LOCK", subLabel: "view" },
  { action: "blackFade", label: "BLACK", subLabel: "fade" },
  { action: "whiteFlash", label: "WHITE", subLabel: "flash" },
  { action: "save", label: "SAVE", subLabel: "path" },
  { action: "discard", label: "DROP", subLabel: "range" },
  { action: "restore", label: "UNDO", subLabel: "range" },
  { action: "vhsBlank", label: "VHS", subLabel: "blank" }
];

export const FALLBACK_VIDEO_SOURCES: AFrame360VideoSource[] = [
  {
    durationMs: 185000,
    id: "sample-mp4",
    kind: "mp4",
    resolution: "5760 x 2880",
    sourceUrl: "/api/sample-video",
    thumbnailUrl: "/assets/xr/geometric-360.svg",
    title: "Local 360 MP4 sample"
  }
];
