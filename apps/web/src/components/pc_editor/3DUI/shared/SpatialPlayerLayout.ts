export const SPATIAL_PLAYER_SKIN_WIDTH_PX = 1820;
export const SPATIAL_PLAYER_SKIN_HEIGHT_PX = 245;
export const SPATIAL_PLAYER_WORLD_WIDTH = 1.82;
export const SPATIAL_PLAYER_WORLD_HEIGHT = 0.245;
export const SPATIAL_PLAYER_DESKTOP_ROOT_POSITION = "0 1.11 -1.15";
export const SPATIAL_PLAYER_XR_ROOT_POSITION = "0 1.24 -0.9";
export const SPATIAL_PLAYER_ROOT_ROTATION = "-12 0 0";
export const SPATIAL_PLAYER_TEXT_LAYER_POSITION = "0 0 0.006";
export const SPATIAL_PLAYER_HIT_LAYER_Z = 0.012;

export type SpatialTextSlot = {
  align?: "center" | "left" | "right";
  maxChars?: number;
  scale: string;
  width: number;
  x: number;
  y: number;
};

export type SpatialRectSlot = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type SpatialHitSlot = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SpatialProgressSlot = {
  fillStartX: number;
  fillWidth: number;
  height: number;
  y: number;
};

function centerX(slot: SpatialRectSlot) {
  return slot.left + slot.width / 2;
}

function centerY(slot: SpatialRectSlot) {
  return slot.top + slot.height / 2;
}

function pointInRect(slot: SpatialRectSlot, offsetX: number, offsetY: number) {
  return {
    x: slot.left + offsetX,
    y: slot.top + offsetY
  };
}

function hitFromRect(slot: SpatialRectSlot): SpatialHitSlot {
  return {
    height: slot.height,
    width: slot.width,
    x: centerX(slot),
    y: centerY(slot)
  };
}

export function pxToWorld(x: number, y: number, z = 0.018) {
  const worldX = (x / SPATIAL_PLAYER_SKIN_WIDTH_PX - 0.5) * SPATIAL_PLAYER_WORLD_WIDTH;
  const worldY = (0.5 - y / SPATIAL_PLAYER_SKIN_HEIGHT_PX) * SPATIAL_PLAYER_WORLD_HEIGHT;
  return `${worldX} ${worldY} ${z}`;
}

export function sizeToWorld(width: number, height: number) {
  return {
    height: (height / SPATIAL_PLAYER_SKIN_HEIGHT_PX) * SPATIAL_PLAYER_WORLD_HEIGHT,
    width: (width / SPATIAL_PLAYER_SKIN_WIDTH_PX) * SPATIAL_PLAYER_WORLD_WIDTH
  };
}

export function spatialRectCss(slot: SpatialRectSlot) {
  return `left: ${slot.left}px; top: ${slot.top}px; width: ${slot.width}px; height: ${slot.height}px;`;
}

export const spatialPlayerSkinRects = {
  chrome: { height: 28, left: 16, top: 14, width: SPATIAL_PLAYER_SKIN_WIDTH_PX - 32 },
  dotCyan: { height: 15, left: 62, top: 22, width: 15 },
  dotMagenta: { height: 15, left: 34, top: 22, width: 15 },
  dotOrange: { height: 15, left: 90, top: 22, width: 15 },
  effectSpeedPanel: { height: 74, left: 1512, top: 145, width: 150 },
  nextButton: { height: 58, left: 200, top: 153, width: 58 },
  playbackRatePanel: { height: 74, left: 1192, top: 145, width: 150 },
  playButton: { height: 58, left: 128, top: 153, width: 58 },
  playlistPanel: { height: 74, left: 1758, top: 145, width: 58 },
  previousButton: { height: 58, left: 56, top: 153, width: 58 },
  progressShell: { height: 60, left: 128, top: 62, width: SPATIAL_PLAYER_SKIN_WIDTH_PX - 256 },
  progressTrack: { height: 16, left: 168, top: 85, width: SPATIAL_PLAYER_SKIN_WIDTH_PX - 336 },
  recordPanel: { height: 74, left: 1032, top: 145, width: 150 },
  recordingRatePanel: { height: 74, left: 1352, top: 145, width: 150 },
  settingsButton: { height: 58, left: 1688, top: 153, width: 58 },
  titlePanel: { height: 74, left: 296, top: 145, width: 720 },
  transportPanel: { height: 74, left: 28, top: 145, width: 250 }
} satisfies Record<string, SpatialRectSlot>;

export type SpatialPlayerSkinRectKey = keyof typeof spatialPlayerSkinRects;

export const spatialPlayerHitRects = {
  effectSpeed: { height: 74, left: spatialPlayerSkinRects.effectSpeedPanel.left, top: 146, width: spatialPlayerSkinRects.effectSpeedPanel.width },
  next: { height: 74, left: centerX(spatialPlayerSkinRects.nextButton) - 36, top: 146, width: 72 },
  playbackRate: { height: 74, left: spatialPlayerSkinRects.playbackRatePanel.left, top: 146, width: spatialPlayerSkinRects.playbackRatePanel.width },
  playToggle: { height: 74, left: centerX(spatialPlayerSkinRects.playButton) - 36, top: 146, width: 72 },
  playlist: { height: 74, left: spatialPlayerSkinRects.playlistPanel.left, top: 146, width: spatialPlayerSkinRects.playlistPanel.width },
  previous: { height: 74, left: centerX(spatialPlayerSkinRects.previousButton) - 36, top: 146, width: 72 },
  progress: { height: 50, left: spatialPlayerSkinRects.progressTrack.left, top: spatialPlayerSkinRects.progressShell.top + 5, width: spatialPlayerSkinRects.progressTrack.width },
  recordToggle: { height: 74, left: spatialPlayerSkinRects.recordPanel.left, top: 146, width: spatialPlayerSkinRects.recordPanel.width },
  recordingRate: {
    height: 74,
    left: spatialPlayerSkinRects.recordingRatePanel.left,
    top: 146,
    width: spatialPlayerSkinRects.recordingRatePanel.width
  },
  settings: {
    height: 74,
    left: centerX(spatialPlayerSkinRects.settingsButton) - 36,
    top: 146,
    width: 72
  }
} satisfies Record<string, SpatialRectSlot>;

export const spatialPlayerProgress: SpatialProgressSlot = {
  fillStartX: spatialPlayerSkinRects.progressTrack.left + 82,
  fillWidth: spatialPlayerSkinRects.progressTrack.width - 164,
  height: spatialPlayerSkinRects.progressTrack.height,
  y: centerY(spatialPlayerSkinRects.progressTrack)
};

const chromeLabelPoint = pointInRect(spatialPlayerSkinRects.chrome, spatialPlayerSkinRects.chrome.width - 96, 13);
const currentTimePoint = pointInRect(spatialPlayerSkinRects.progressShell, -70, 25);
const durationPoint = pointInRect(spatialPlayerSkinRects.progressShell, spatialPlayerSkinRects.progressShell.width + 70, 25);
const titlePoint = pointInRect(spatialPlayerSkinRects.titlePanel, 22, 25);
const subtitlePoint = pointInRect(spatialPlayerSkinRects.titlePanel, 22, 60);

export const spatialPlayerTextSlots = {
  chromeLabel: { align: "right", maxChars: 24, scale: "0.146 0.146 0.146", width: 2.2, x: chromeLabelPoint.x, y: chromeLabelPoint.y },
  currentTime: { align: "left", maxChars: 5, scale: "0.162 0.162 0.162", width: 0.8, x: currentTimePoint.x, y: currentTimePoint.y },
  duration: { align: "right", maxChars: 5, scale: "0.162 0.162 0.162", width: 0.8, x: durationPoint.x, y: durationPoint.y },
  effectSpeedKey: { maxChars: 12, scale: "0.11 0.11 0.11", width: 1.5, x: centerX(spatialPlayerSkinRects.effectSpeedPanel), y: spatialPlayerSkinRects.effectSpeedPanel.top + 54 },
  effectSpeedLabel: { maxChars: 9, scale: "0.17 0.17 0.17", width: 1.5, x: centerX(spatialPlayerSkinRects.effectSpeedPanel), y: spatialPlayerSkinRects.effectSpeedPanel.top + 29 },
  next: { maxChars: 2, scale: "0.22 0.22 0.22", width: 1.05, x: centerX(spatialPlayerSkinRects.nextButton), y: spatialPlayerSkinRects.nextButton.top + 26 },
  playbackRateKey: { maxChars: 12, scale: "0.11 0.11 0.11", width: 1.5, x: centerX(spatialPlayerSkinRects.playbackRatePanel), y: spatialPlayerSkinRects.playbackRatePanel.top + 54 },
  playbackRateLabel: { maxChars: 10, scale: "0.17 0.17 0.17", width: 1.5, x: centerX(spatialPlayerSkinRects.playbackRatePanel), y: spatialPlayerSkinRects.playbackRatePanel.top + 29 },
  playKey: { maxChars: 6, scale: "0.13 0.13 0.13", width: 0.95, x: centerX(spatialPlayerSkinRects.playButton), y: spatialPlayerSkinRects.playButton.top + 46 },
  playLabel: { maxChars: 2, scale: "0.22 0.22 0.22", width: 1.05, x: centerX(spatialPlayerSkinRects.playButton), y: spatialPlayerSkinRects.playButton.top + 23 },
  playlistKey: { maxChars: 4, scale: "0.12 0.12 0.12", width: 0.95, x: centerX(spatialPlayerSkinRects.playlistPanel), y: spatialPlayerSkinRects.playlistPanel.top + 54 },
  playlistLabel: { maxChars: 2, scale: "0.17 0.17 0.17", width: 0.95, x: centerX(spatialPlayerSkinRects.playlistPanel), y: spatialPlayerSkinRects.playlistPanel.top + 29 },
  previous: { maxChars: 2, scale: "0.22 0.22 0.22", width: 1.05, x: centerX(spatialPlayerSkinRects.previousButton), y: spatialPlayerSkinRects.previousButton.top + 26 },
  recordKey: { maxChars: 8, scale: "0.12 0.12 0.12", width: 1.55, x: centerX(spatialPlayerSkinRects.recordPanel), y: spatialPlayerSkinRects.recordPanel.top + 54 },
  recordLabel: { maxChars: 10, scale: "0.18 0.18 0.18", width: 1.55, x: centerX(spatialPlayerSkinRects.recordPanel), y: spatialPlayerSkinRects.recordPanel.top + 29 },
  recordingRateKey: { maxChars: 12, scale: "0.11 0.11 0.11", width: 1.5, x: centerX(spatialPlayerSkinRects.recordingRatePanel), y: spatialPlayerSkinRects.recordingRatePanel.top + 54 },
  recordingRateLabel: { maxChars: 10, scale: "0.17 0.17 0.17", width: 1.5, x: centerX(spatialPlayerSkinRects.recordingRatePanel), y: spatialPlayerSkinRects.recordingRatePanel.top + 29 },
  settings: { maxChars: 2, scale: "0.17 0.17 0.17", width: 0.95, x: centerX(spatialPlayerSkinRects.settingsButton), y: spatialPlayerSkinRects.settingsButton.top + 29 },
  subtitle: { align: "left", maxChars: 72, scale: "0.108 0.108 0.108", width: 4.6, x: subtitlePoint.x, y: subtitlePoint.y },
  title: { align: "left", maxChars: 64, scale: "0.132 0.132 0.132", width: 4.6, x: titlePoint.x, y: titlePoint.y }
} satisfies Record<string, SpatialTextSlot>;

export type SpatialPlayerTextSlotKey = keyof typeof spatialPlayerTextSlots;
export type SpatialPlayerTextSlotMap = Record<SpatialPlayerTextSlotKey, SpatialTextSlot>;

export type SpatialTextAnchor = {
  offsetX?: number;
  offsetY?: number;
  rect: SpatialPlayerSkinRectKey;
  x: "center" | "left" | "right";
  y: "bottom" | "center" | "top";
};

export const spatialPlayerTextAnchors = {
  chromeLabel: { offsetX: -96, offsetY: 13, rect: "chrome", x: "right", y: "top" },
  currentTime: { offsetX: -70, offsetY: 25, rect: "progressShell", x: "left", y: "top" },
  duration: { offsetX: 70, offsetY: 25, rect: "progressShell", x: "right", y: "top" },
  effectSpeedKey: { offsetY: 54, rect: "effectSpeedPanel", x: "center", y: "top" },
  effectSpeedLabel: { offsetY: 29, rect: "effectSpeedPanel", x: "center", y: "top" },
  next: { offsetY: 26, rect: "nextButton", x: "center", y: "top" },
  playbackRateKey: { offsetY: 54, rect: "playbackRatePanel", x: "center", y: "top" },
  playbackRateLabel: { offsetY: 29, rect: "playbackRatePanel", x: "center", y: "top" },
  playKey: { offsetY: 46, rect: "playButton", x: "center", y: "top" },
  playLabel: { offsetY: 23, rect: "playButton", x: "center", y: "top" },
  playlistKey: { offsetY: 54, rect: "playlistPanel", x: "center", y: "top" },
  playlistLabel: { offsetY: 29, rect: "playlistPanel", x: "center", y: "top" },
  previous: { offsetY: 26, rect: "previousButton", x: "center", y: "top" },
  recordKey: { offsetY: 54, rect: "recordPanel", x: "center", y: "top" },
  recordLabel: { offsetY: 29, rect: "recordPanel", x: "center", y: "top" },
  recordingRateKey: { offsetY: 54, rect: "recordingRatePanel", x: "center", y: "top" },
  recordingRateLabel: { offsetY: 29, rect: "recordingRatePanel", x: "center", y: "top" },
  settings: { offsetY: 29, rect: "settingsButton", x: "center", y: "top" },
  subtitle: { offsetX: 22, offsetY: 60, rect: "titlePanel", x: "left", y: "top" },
  title: { offsetX: 22, offsetY: 25, rect: "titlePanel", x: "left", y: "top" }
} satisfies Record<SpatialPlayerTextSlotKey, SpatialTextAnchor>;

export const spatialPlayerHitSlots = {
  effectSpeed: hitFromRect(spatialPlayerHitRects.effectSpeed),
  next: hitFromRect(spatialPlayerHitRects.next),
  playbackRate: hitFromRect(spatialPlayerHitRects.playbackRate),
  playToggle: hitFromRect(spatialPlayerHitRects.playToggle),
  playlist: hitFromRect(spatialPlayerHitRects.playlist),
  previous: hitFromRect(spatialPlayerHitRects.previous),
  progress: hitFromRect(spatialPlayerHitRects.progress),
  recordToggle: hitFromRect(spatialPlayerHitRects.recordToggle),
  recordingRate: hitFromRect(spatialPlayerHitRects.recordingRate),
  settings: hitFromRect(spatialPlayerHitRects.settings)
} satisfies Record<string, SpatialHitSlot>;
