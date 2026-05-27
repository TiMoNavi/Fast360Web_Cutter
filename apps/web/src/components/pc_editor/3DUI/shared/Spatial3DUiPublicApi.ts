export type SpatialVideoSourceKind = "hls" | "mp4" | string;

export type SpatialVideoSource = {
  durationMs?: number;
  id: string;
  kind: SpatialVideoSourceKind;
  resolution?: string;
  sourceUrl?: string;
  thumbnailUrl?: string | null;
  title: string;
};

export type SpatialEffectWebXrSupport = "exact" | "approximate" | "symbolic" | "unsupported";

export type SpatialEffectItem = {
  categoryId?: string;
  conflictGroup?: string | null;
  durationMs?: number;
  eventName?: string;
  id: string;
  key?: string;
  label: string;
  params?: Record<string, unknown>;
  previewMode?: string;
  previewTarget?: "screen" | "viewport-mask" | "sphere" | "world-layer";
  renderFallback?: "ignore" | "warn" | "fail";
  renderStage?: string;
  renderSupported?: boolean;
  webxrSupport?: SpatialEffectWebXrSupport;
};

export type SpatialEffectCategory = {
  effects: SpatialEffectItem[];
  id: string;
  key?: string;
  label: string;
};

export type SpatialPlayerState = {
  activeSourceId: string;
  autoRenderEnabled?: boolean;
  currentTimeMs: number;
  discardActive?: boolean;
  discardMessage?: string;
  effectSpeed?: number;
  effectCategories?: SpatialEffectCategory[];
  effectShortcutMode?: "hidden" | "category" | "effect" | "holding" | "selected";
  durationMs: number;
  isPlaying: boolean;
  maskLocked?: boolean;
  maskOpacity?: number;
  playbackRate?: number;
  playlistOpen?: boolean;
  playlistSources: SpatialVideoSource[];
  recordingActive?: boolean;
  recordingRate?: number;
  renderExportId?: string | null;
  renderMessage?: string;
  renderReady?: boolean;
  renderStatus?: "idle" | "rendering" | "done" | "error" | string;
  sourceResolution?: string;
  title: string;
};

export type Spatial3DUiAction =
  | { type: "crop.autoRender.set"; enabled: boolean }
  | { type: "crop.end" }
  | { type: "crop.render" }
  | { type: "crop.start" }
  | { type: "effects.category.toggle"; categoryId: string; open: boolean }
  | {
      categoryId: string;
      conflictGroup?: string | null;
      durationMs?: number;
      effectId: string;
      eventName?: string;
      label: string;
      params?: Record<string, unknown>;
      previewMode?: string;
      previewTarget?: SpatialEffectItem["previewTarget"];
      renderFallback?: SpatialEffectItem["renderFallback"];
      renderStage?: string;
      renderSupported?: boolean;
      type: "effects.select";
    }
  | {
      categoryId: string;
      conflictGroup?: string | null;
      effectId: string;
      eventName?: string;
      label: string;
      params?: Record<string, unknown>;
      previewMode?: string;
      previewTarget?: SpatialEffectItem["previewTarget"];
      renderFallback?: SpatialEffectItem["renderFallback"];
      renderStage?: string;
      renderSupported?: boolean;
      type: "effects.hold.start";
    }
  | {
      categoryId?: string;
      conflictGroup?: string | null;
      durationMs?: number;
      effectId?: string;
      eventName?: string;
      label?: string;
      params?: Record<string, unknown>;
      previewMode?: string;
      previewTarget?: SpatialEffectItem["previewTarget"];
      renderFallback?: SpatialEffectItem["renderFallback"];
      renderStage?: string;
      renderSupported?: boolean;
      type: "effects.hold.end";
    }
  | { type: "effects.shortcut.key.down"; key: string; repeat?: boolean }
  | { type: "effects.shortcut.key.up"; key: string }
  | { type: "effects.shortcut.open" }
  | { type: "effects.speed.reset" }
  | { type: "effects.speed.set"; effectSpeed: number }
  | { type: "mask.fov.step"; delta: number }
  | { type: "mask.lock.set"; locked: boolean }
  | { type: "mask.opacity.set"; durationMs?: number; opacity: number }
  | { type: "mask.pitch.step"; delta: number }
  | { type: "mask.yaw.step"; delta: number }
  | { type: "overlays.close" }
  | { type: "panel.effects.collapse.set"; collapsed: boolean }
  | { type: "panel.workbench.collapse.set"; collapsed: boolean }
  | { type: "player.next" }
  | { type: "player.playPause.toggle" }
  | { type: "player.playbackRate.reset" }
  | { type: "player.playbackRate.set"; playbackRate: number }
  | { type: "player.previous" }
  | { type: "player.recordingRate.reset" }
  | { type: "player.recordingRate.set"; recordingRate: number }
  | { type: "player.seekTo"; timeMs: number }
  | { type: "player.source.select"; source: SpatialVideoSource }
  | { type: "playlist.close" }
  | { type: "playlist.open" }
  | { type: "playlist.toggle" }
  | { type: "render.auto.set"; enabled: boolean }
  | { type: "render.request" }
  | { type: "ringMenu.item.select"; itemId: string }
  | { type: "timeline.cut" }
  | { type: "timeline.discard.begin" }
  | { type: "timeline.discard.end" }
  | { type: "timeline.flush" };

export type Spatial3DUiActionHandler = (action: Spatial3DUiAction) => void;

export type Spatial3DUiController = {
  emit: Spatial3DUiActionHandler;
};
