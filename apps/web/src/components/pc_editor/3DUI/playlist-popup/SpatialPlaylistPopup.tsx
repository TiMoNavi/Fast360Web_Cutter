"use client";

import { createElement, useEffect, useRef, useState } from "react";
import type { SpatialVideoSource } from "../shared/Spatial3DUiPublicApi";
import {
  SPATIAL_PLAYER_DESKTOP_ROOT_POSITION,
  SPATIAL_PLAYER_ROOT_ROTATION,
  SPATIAL_PLAYER_WORLD_HEIGHT,
  SPATIAL_PLAYER_WORLD_WIDTH,
  SPATIAL_PLAYER_XR_ROOT_POSITION
} from "../shared/SpatialPlayerLayout";
import {
  SPATIAL_UI_HIT_ATTRIBUTE,
  SPATIAL_UI_HIT_RENDER_ORDER,
  SPATIAL_UI_RENDER_ORDER,
  flatEmissiveMaterial,
  transparentHitMaterial,
  useSpatialButtonEvents,
  useSpatialRayBlockerEvents
} from "../shared/SpatialUiInteraction";

type AFrameEntityElement = HTMLElement & {
  object3D?: {
    getObjectByProperty?: (name: string, value: string) => {
      material?: {
        map?: {
          needsUpdate?: boolean;
        };
      };
    };
    traverse?: (callback: (child: { renderOrder?: number }) => void) => void;
  };
};

type AFrameSceneElement = HTMLElement & {
  is?: (state: string) => boolean;
};

type PopupControlState = {
  close?: "hover" | "idle" | "pressed";
  clickedSourceId?: string | null;
  down?: "hover" | "idle" | "pressed";
  hoveredSourceId?: string | null;
  pressedSourceId?: string | null;
  up?: "hover" | "idle" | "pressed";
};

type PlaylistThumbnailCacheEntry = {
  image: HTMLImageElement;
  listeners: Set<() => void>;
  status: "error" | "loaded" | "loading";
};

export type SpatialPlaylistPopupProps = {
  activeSourceId: string;
  maxItems?: number;
  message?: string;
  onClose: () => void;
  onSelectSource?: (source: SpatialVideoSource) => void;
  open: boolean;
  sources: SpatialVideoSource[];
  status?: "error" | "ready" | "switching";
};

const CANVAS_WIDTH = 607;
const CANVAS_HEIGHT = 990;
const POPUP_WORLD_WIDTH = SPATIAL_PLAYER_WORLD_WIDTH / 3;
const POPUP_WORLD_HEIGHT = 0.99;
const POPUP_LOCAL_X = SPATIAL_PLAYER_WORLD_WIDTH / 3;
const POPUP_LOCAL_Y = SPATIAL_PLAYER_WORLD_HEIGHT / 2 + POPUP_WORLD_HEIGHT / 2 + 0.035;

const TEXTURE_IDS = {
  base: "spatial-playlist-popup-base",
  controls: "spatial-playlist-popup-controls",
  text: "spatial-playlist-popup-text"
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const MUTED = "#a8efff";
const DEEP = "#070011";
const DANGER = "#ff5b8a";
const thumbnailCache = new Map<string, PlaylistThumbnailCacheEntry>();
const POPUP_RAY_BLOCKER_LAYER_Z = 0.034;
const POPUP_CONTROL_HIT_LAYER_Z = 0.056;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createTextureCanvas(id: string) {
  const existing = document.getElementById(id) as HTMLCanvasElement | null;

  if (existing) {
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "spatial-playlist-popup-texture-source";
  canvas.height = CANVAS_HEIGHT;
  canvas.id = id;
  canvas.width = CANVAS_WIDTH;
  document.body.appendChild(canvas);
  return canvas;
}

function ensureThumbnail(url: string, onUpdate?: () => void) {
  const cached = thumbnailCache.get(url);

  if (cached) {
    if (onUpdate && cached.status === "loading") {
      cached.listeners.add(onUpdate);
    }
    return cached;
  }

  const image = new Image();
  const entry: PlaylistThumbnailCacheEntry = {
    image,
    listeners: new Set(onUpdate ? [onUpdate] : []),
    status: "loading"
  };
  const notify = () => {
    entry.listeners.forEach((listener) => listener());
    entry.listeners.clear();
  };

  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.onload = () => {
    entry.status = "loaded";
    notify();
  };
  image.onerror = () => {
    entry.status = "error";
    notify();
  };
  image.src = url;
  thumbnailCache.set(url, entry);
  return entry;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = CANVAS_WIDTH * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  return context;
}

function markTextureDirty(entity: AFrameEntityElement | null) {
  const mesh = entity?.object3D?.getObjectByProperty?.("type", "Mesh");
  const map = mesh?.material?.map;

  if (map) {
    map.needsUpdate = true;
  }
}

function flatTextureMaterial(id: string) {
  return `shader: flat; src: #${id}; transparent: true; alphaTest: 0.01; side: double; depthTest: false; depthWrite: false`;
}

const material = flatEmissiveMaterial;

function cutRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cut = 18) {
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width - cut * 0.75, y);
  context.lineTo(x + width, y + cut * 0.75);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x + cut * 0.75, y + height);
  context.lineTo(x, y + height - cut * 0.75);
  context.lineTo(x, y + cut);
  context.closePath();
}

function drawLabel(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  options: {
    align?: CanvasTextAlign;
    color?: string;
    font?: string;
    maxWidth?: number;
    shadow?: boolean;
    size?: number;
  } = {}
) {
  const color = WHITE;
  context.save();
  context.font = options.font ?? `700 ${options.size ?? 22}px "Share Tech Mono", Consolas, monospace`;
  context.textAlign = options.align ?? "left";
  context.textBaseline = "middle";
  context.fillStyle = color;
  if (options.shadow ?? true) {
    context.shadowColor = color;
    context.shadowBlur = 8;
  }
  context.fillText(value, x, y, options.maxWidth);
  context.restore();
}

function truncateText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  let next = value;
  while (next.length > 3 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function splitTitleLines(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) {
    return [value];
  }

  let firstLine = "";
  let rest = value;

  for (let index = 1; index <= value.length; index += 1) {
    const candidate = value.slice(0, index);
    if (context.measureText(candidate).width > maxWidth) {
      firstLine = value.slice(0, Math.max(1, index - 1)).trimEnd();
      rest = value.slice(Math.max(1, index - 1)).trimStart();
      break;
    }
  }

  if (!firstLine) {
    firstLine = value;
    rest = "";
  }

  return rest ? [firstLine, truncateText(context, rest, maxWidth)] : [firstLine];
}

function drawThumbnailImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  cut = 16
) {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!imageWidth || !imageHeight) {
    return false;
  }

  const sourceAspect = imageWidth / imageHeight;
  const targetAspect = width / height;
  let sourceWidth = imageWidth;
  let sourceHeight = imageHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceAspect > targetAspect) {
    sourceWidth = imageHeight * targetAspect;
    sourceX = (imageWidth - sourceWidth) / 2;
  } else {
    sourceHeight = imageWidth / targetAspect;
    sourceY = (imageHeight - sourceHeight) / 2;
  }

  context.save();
  cutRectPath(context, x, y, width, height, cut);
  context.clip();
  try {
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  } catch {
    context.restore();
    return false;
  }
  context.restore();
  return true;
}

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function drawScanlines(context: CanvasRenderingContext2D) {
  context.save();
  context.globalAlpha = 0.36;
  context.strokeStyle = "rgba(255,255,255,0.06)";
  context.lineWidth = 1;
  for (let y = 18; y < CANVAS_HEIGHT; y += 14) {
    context.beginPath();
    context.moveTo(24, y);
    context.lineTo(CANVAS_WIDTH - 24, y);
    context.stroke();
  }
  context.restore();
}

function drawBaseLayer(canvas: HTMLCanvasElement) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  const bg = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  bg.addColorStop(0, "rgba(0,255,255,0.18)");
  bg.addColorStop(0.18, "rgba(26,10,58,0.78)");
  bg.addColorStop(0.55, "rgba(7,0,17,0.86)");
  bg.addColorStop(0.82, "rgba(255,0,255,0.18)");
  bg.addColorStop(1, "rgba(255,153,0,0.11)");

  cutRectPath(context, 18, 16, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 32, 30);
  context.fillStyle = bg;
  context.fill();

  drawScanlines(context);

  context.save();
  cutRectPath(context, 18, 16, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 32, 30);
  context.shadowColor = "rgba(255,0,255,0.38)";
  context.shadowBlur = 28;
  context.strokeStyle = "rgba(255,0,255,0.66)";
  context.lineWidth = 2;
  context.stroke();
  context.shadowColor = "rgba(0,255,255,0.46)";
  context.shadowBlur = 22;
  context.strokeStyle = "rgba(0,255,255,0.42)";
  cutRectPath(context, 38, 36, CANVAS_WIDTH - 76, CANVAS_HEIGHT - 72, 22);
  context.stroke();
  context.restore();

  const topLight = context.createLinearGradient(70, 58, CANVAS_WIDTH - 70, 58);
  topLight.addColorStop(0, "rgba(255,255,255,0)");
  topLight.addColorStop(0.22, "rgba(255,255,255,0.36)");
  topLight.addColorStop(0.72, "rgba(0,255,255,0.28)");
  topLight.addColorStop(1, "rgba(255,255,255,0)");
  context.strokeStyle = topLight;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(72, 58);
  context.lineTo(CANVAS_WIDTH - 72, 58);
  context.stroke();
}

function drawControlLayer(
  canvas: HTMLCanvasElement,
  sources: SpatialVideoSource[],
  activeSourceId: string,
  visibleOffset: number,
  maxItems: number,
  controlState: PopupControlState = {}
) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  const visibleSources = sources.slice(visibleOffset, visibleOffset + maxItems);
  const itemX = 28;
  const itemWidth = CANVAS_WIDTH - 56;
  const itemHeight = 204;
  const itemGap = 24;
  const startY = 176;

  visibleSources.forEach((source, index) => {
    const active = source.id === activeSourceId;
    const clicked = source.id === controlState.clickedSourceId;
    const hovered = source.id === controlState.hoveredSourceId;
    const pressed = source.id === controlState.pressedSourceId;
    const y = startY + index * (itemHeight + itemGap);
    const accent = active ? CYAN : (visibleOffset + index) % 3 === 1 ? MAGENTA : ORANGE;

    cutRectPath(context, itemX, y, itemWidth, itemHeight, 22);
    const itemFill = context.createLinearGradient(itemX, y, itemX + itemWidth, y + itemHeight);
    itemFill.addColorStop(0, active ? "rgba(0,255,255,0.9)" : hovered || clicked ? "rgba(0,255,255,0.3)" : "rgba(0,255,255,0.13)");
    itemFill.addColorStop(0.42, active ? "rgba(0,255,255,0.72)" : pressed ? "rgba(0,255,255,0.38)" : "rgba(12,2,30,0.78)");
    itemFill.addColorStop(1, active ? "rgba(255,153,0,0.56)" : hovered || clicked ? "rgba(255,153,0,0.22)" : "rgba(255,0,255,0.12)");
    context.fillStyle = itemFill;
    context.fill();
    context.shadowColor = accent;
    context.shadowBlur = active || hovered || pressed || clicked ? 24 : 12;
    context.strokeStyle = active || pressed || clicked ? "rgba(255,255,255,0.88)" : hovered ? CYAN : `${accent}aa`;
    context.lineWidth = active || hovered || pressed || clicked ? 3 : 2;
    context.stroke();
    context.shadowBlur = 0;

    const thumbX = itemX + 14;
    const thumbY = y + 18;
    cutRectPath(context, thumbX, thumbY, 168, 168, 16);
    let thumbnailDrawn = false;

    if (source.thumbnailUrl) {
      const thumbnail = thumbnailCache.get(source.thumbnailUrl);

      if (thumbnail?.status === "loaded") {
        thumbnailDrawn = drawThumbnailImage(context, thumbnail.image, thumbX, thumbY, 168, 168, 16);
      }
    }

    if (!thumbnailDrawn) {
      const thumbFill = context.createLinearGradient(thumbX, thumbY, thumbX + 168, thumbY + 168);
      thumbFill.addColorStop(0, `${accent}cc`);
      thumbFill.addColorStop(1, "rgba(255,153,0,0.48)");
      context.fillStyle = thumbFill;
      context.fill();
    }
    context.strokeStyle = active ? DEEP : accent;
    context.lineWidth = 2;
    context.stroke();

    context.save();
    context.globalAlpha = 0.35;
    context.strokeStyle = active ? "rgba(7,0,17,0.28)" : "rgba(255,255,255,0.28)";
    for (let x = thumbX + 16; x < thumbX + 168; x += 24) {
      context.beginPath();
      context.moveTo(x, thumbY + 12);
      context.lineTo(x - 76, thumbY + 168);
      context.stroke();
    }
    context.restore();
  });

  if (controlState.close === "hover" || controlState.close === "pressed") {
    context.save();
    context.beginPath();
    context.arc(CANVAS_WIDTH - 54, 118, controlState.close === "pressed" ? 24 : 20, 0, Math.PI * 2);
    context.fillStyle = controlState.close === "pressed" ? "rgba(255,153,0,0.32)" : "rgba(0,255,255,0.22)";
    context.shadowColor = controlState.close === "pressed" ? ORANGE : CYAN;
    context.shadowBlur = 20;
    context.fill();
    context.strokeStyle = WHITE;
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  }

  const navItems: Array<{ key: "down" | "up"; x: number; y: number; label: string }> = [
    { key: "up", label: "UP", x: CANVAS_WIDTH - 166, y: 118 },
    { key: "down", label: "DOWN", x: CANVAS_WIDTH - 102, y: 118 }
  ];

  navItems.forEach((item) => {
    const state = controlState[item.key];

    if (state !== "hover" && state !== "pressed") {
      return;
    }

    context.save();
    cutRectPath(context, item.x - 30, item.y - 18, 60, 36, 8);
    context.fillStyle = state === "pressed" ? "rgba(255,153,0,0.28)" : "rgba(0,255,255,0.2)";
    context.shadowColor = state === "pressed" ? ORANGE : CYAN;
    context.shadowBlur = 18;
    context.fill();
    context.strokeStyle = WHITE;
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  });
}

function drawTextLayer(
  canvas: HTMLCanvasElement,
  sources: SpatialVideoSource[],
  activeSourceId: string,
  visibleOffset: number,
  maxItems: number,
  message?: string,
  status: "error" | "ready" | "switching" = "ready"
) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  drawLabel(context, "> MEDIA LIST", 54, 82, { color: CYAN, size: 28 });
  drawLabel(context, `${sources.length} SOURCES`, CANVAS_WIDTH - 54, 82, { align: "right", color: MUTED, size: 18 });

  const statusColor = status === "error" ? DANGER : status === "switching" ? ORANGE : MUTED;
  drawLabel(context, message ?? "Visual playlist preview. Backend switching is disabled in this pass.", 54, 118, {
    color: statusColor,
    size: 17,
    maxWidth: CANVAS_WIDTH - 250
  });
  drawLabel(context, "UP", CANVAS_WIDTH - 166, 118, { align: "center", color: WHITE, size: 15 });
  drawLabel(context, "DOWN", CANVAS_WIDTH - 102, 118, { align: "center", color: WHITE, size: 15 });
  drawLabel(context, "X", CANVAS_WIDTH - 54, 118, { align: "center", color: WHITE, size: 22 });

  const visibleSources = sources.slice(visibleOffset, visibleOffset + maxItems);
  const itemX = 28;
  const itemHeight = 204;
  const itemGap = 24;
  const startY = 176;

  visibleSources.forEach((source, index) => {
    const active = source.id === activeSourceId;
    const y = startY + index * (itemHeight + itemGap);
    const textColor = WHITE;
    const metaColor = WHITE;

    drawLabel(context, source.kind.toUpperCase(), itemX + 98, y + 158, {
      align: "center",
      color: WHITE,
      shadow: false,
      size: 18
    });

    const titleFont = '700 24px "Orbitron", "Share Tech Mono", Consolas, sans-serif';
    context.font = titleFont;
    const titleLines = splitTitleLines(context, source.title, 260);
    drawLabel(context, titleLines[0] ?? "", itemX + 202, y + (titleLines.length > 1 ? 62 : 78), {
      color: textColor,
      font: titleFont,
      shadow: !active
    });
    if (titleLines[1]) {
      drawLabel(context, titleLines[1], itemX + 202, y + 94, {
        color: textColor,
        font: titleFont,
        shadow: !active
      });
    }
    drawLabel(context, `${formatDuration(source.durationMs)} / ${source.resolution ?? "360"}`, itemX + 202, y + 146, {
      color: metaColor,
      shadow: !active,
      size: 18
    });

    if (active) {
      drawLabel(context, "ACTIVE", CANVAS_WIDTH - 38, y + 174, { align: "right", color: WHITE, shadow: false, size: 16 });
    }
  });
}

function elevatePopup(root: AFrameEntityElement | null) {
  root?.object3D?.traverse?.((child) => {
    child.renderOrder = SPATIAL_UI_RENDER_ORDER;
  });
}

function popupControlStateEquals(left: PopupControlState, right: PopupControlState) {
  return (
    left.close === right.close &&
    (left.clickedSourceId ?? null) === (right.clickedSourceId ?? null) &&
    left.down === right.down &&
    (left.hoveredSourceId ?? null) === (right.hoveredSourceId ?? null) &&
    (left.pressedSourceId ?? null) === (right.pressedSourceId ?? null) &&
    left.up === right.up
  );
}

function popupControlStateIsIdle(state: PopupControlState) {
  return popupControlStateEquals(state, {});
}

function updatePopupControlState(current: PopupControlState, patch: PopupControlState) {
  const next = {
    ...current,
    ...patch
  };

  return popupControlStateEquals(current, next) ? current : next;
}

function CloseHitPlane({
  onClose,
  onState
}: {
  onClose: () => void;
  onState: (state: "hover" | "idle" | "pressed") => void;
}) {
  const ref = useSpatialButtonEvents({
    onClick: onClose,
    onState
  });

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "spatial-playlist-close-hit",
    height: "0.075",
    material: transparentHitMaterial(CYAN),
    position: `${POPUP_WORLD_WIDTH / 2 - 0.074} ${POPUP_WORLD_HEIGHT / 2 - 0.118} ${POPUP_CONTROL_HIT_LAYER_Z}`,
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: "0.075"
  });
}

function NavHitPlane({
  disabled,
  direction,
  onClick,
  onState
}: {
  disabled?: boolean;
  direction: "down" | "up";
  onClick: () => void;
  onState: (state: "hover" | "idle" | "pressed") => void;
}) {
  const ref = useSpatialButtonEvents({
    onClick: disabled ? undefined : onClick,
    onState
  });
  const x = direction === "up" ? POPUP_WORLD_WIDTH / 2 - 0.166 : POPUP_WORLD_WIDTH / 2 - 0.102;

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": `spatial-playlist-${direction}-hit`,
    height: "0.052",
    material: transparentHitMaterial(WHITE),
    position: `${x} ${POPUP_WORLD_HEIGHT / 2 - 0.118} ${POPUP_CONTROL_HIT_LAYER_Z}`,
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: "0.07"
  });
}

function SourceHitPlane({
  index,
  onClick,
  onState
}: {
  index: number;
  onClick?: () => void;
  onState: (state: "hover" | "idle" | "pressed") => void;
}) {
  const ref = useSpatialButtonEvents({
    onClick,
    onState
  });
  const itemHeightPx = 204;
  const itemGapPx = 24;
  const itemTopPx = 176 + index * (itemHeightPx + itemGapPx);
  const itemCenterYPx = itemTopPx + itemHeightPx / 2;
  const itemWorldHeight = (itemHeightPx / CANVAS_HEIGHT) * POPUP_WORLD_HEIGHT;
  const itemWorldWidth = ((CANVAS_WIDTH - 56) / CANVAS_WIDTH) * POPUP_WORLD_WIDTH;
  const itemWorldY = (0.5 - itemCenterYPx / CANVAS_HEIGHT) * POPUP_WORLD_HEIGHT;

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": `spatial-playlist-source-hit-${index}`,
    height: String(itemWorldHeight),
    material: transparentHitMaterial(WHITE),
    position: `0 ${itemWorldY} ${POPUP_CONTROL_HIT_LAYER_Z}`,
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: String(itemWorldWidth)
  });
}

function PopupRayBlocker() {
  const ref = useSpatialRayBlockerEvents();

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "spatial-playlist-ray-blocker",
    height: String(POPUP_WORLD_HEIGHT),
    material: transparentHitMaterial(WHITE),
    position: `0 0 ${POPUP_RAY_BLOCKER_LAYER_Z}`,
    renderOrder: SPATIAL_UI_HIT_RENDER_ORDER,
    ref,
    width: String(POPUP_WORLD_WIDTH)
  });
}

export function SpatialPlaylistPopup({
  activeSourceId,
  maxItems = 3,
  message,
  onClose,
  onSelectSource,
  open,
  sources,
  status = "ready"
}: SpatialPlaylistPopupProps) {
  const basePlaneRef = useRef<AFrameEntityElement | null>(null);
  const controlPlaneRef = useRef<AFrameEntityElement | null>(null);
  const rootRef = useRef<AFrameEntityElement | null>(null);
  const textPlaneRef = useRef<AFrameEntityElement | null>(null);
  const [pose, setPose] = useState({
    position: SPATIAL_PLAYER_DESKTOP_ROOT_POSITION,
    rotation: SPATIAL_PLAYER_ROOT_ROTATION
  });
  const [texturesReady, setTexturesReady] = useState(false);
  const [controlState, setControlState] = useState<PopupControlState>({});
  const [playlistOffset, setPlaylistOffset] = useState(0);
  const [thumbnailVersion, setThumbnailVersion] = useState(0);
  const clickTimerRef = useRef<number | null>(null);
  const maxOffset = Math.max(0, sources.length - maxItems);
  const visibleOffset = clamp(playlistOffset, 0, maxOffset);
  const visibleSources = sources.slice(visibleOffset, visibleOffset + maxItems);

  useEffect(() => {
    if (!open) {
      return;
    }

    const activeIndex = Math.max(0, sources.findIndex((source) => source.id === activeSourceId));
    setPlaylistOffset(clamp(activeIndex - 1, 0, Math.max(0, sources.length - maxItems)));
  }, [activeSourceId, maxItems, open, sources]);

  useEffect(() => {
    if (!open) {
      setTexturesReady((value) => (value ? false : value));
      setControlState((value) => (popupControlStateIsIdle(value) ? value : {}));
      return undefined;
    }

    const baseCanvas = createTextureCanvas(TEXTURE_IDS.base);
    const controlCanvas = createTextureCanvas(TEXTURE_IDS.controls);
    const textCanvas = createTextureCanvas(TEXTURE_IDS.text);

    drawBaseLayer(baseCanvas);
    setupCanvas(controlCanvas);
    setupCanvas(textCanvas);
    setTexturesReady(true);

    return () => {
      baseCanvas.remove();
      controlCanvas.remove();
      textCanvas.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let active = true;
    const refreshThumbnails = () => {
      if (active) {
        setThumbnailVersion((value) => value + 1);
      }
    };

    visibleSources.forEach((source) => {
      if (source.thumbnailUrl) {
        ensureThumbnail(source.thumbnailUrl, refreshThumbnails);
      }
    });

    return () => {
      active = false;
    };
  }, [maxItems, open, sources, visibleOffset]);

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    const controlCanvas = document.getElementById(TEXTURE_IDS.controls) as HTMLCanvasElement | null;
    if (!controlCanvas) {
      return;
    }

    drawControlLayer(controlCanvas, sources, activeSourceId, visibleOffset, maxItems, controlState);
    window.requestAnimationFrame(() => {
      markTextureDirty(controlPlaneRef.current);
    });
  }, [activeSourceId, controlState, maxItems, sources, texturesReady, thumbnailVersion, visibleOffset]);

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    const textCanvas = document.getElementById(TEXTURE_IDS.text) as HTMLCanvasElement | null;
    if (!textCanvas) {
      return;
    }

    drawTextLayer(textCanvas, sources, activeSourceId, visibleOffset, maxItems, message, status);
    window.requestAnimationFrame(() => {
      markTextureDirty(textPlaneRef.current);
    });
  }, [activeSourceId, maxItems, message, sources, status, texturesReady, visibleOffset]);

  useEffect(
    () => () => {
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!texturesReady) {
      return;
    }

    window.requestAnimationFrame(() => {
      elevatePopup(rootRef.current);
      markTextureDirty(basePlaneRef.current);
      markTextureDirty(controlPlaneRef.current);
      markTextureDirty(textPlaneRef.current);
    });
  }, [texturesReady]);

  useEffect(() => {
    const root = rootRef.current;
    const scene = root?.closest("a-scene") as AFrameSceneElement | null;

    if (!scene) {
      return undefined;
    }

    const syncPose = () => {
      const nextPose = {
        position: scene.is?.("vr-mode") ? SPATIAL_PLAYER_XR_ROOT_POSITION : SPATIAL_PLAYER_DESKTOP_ROOT_POSITION,
        rotation: SPATIAL_PLAYER_ROOT_ROTATION
      };

      setPose((value) => {
        if (value.position === nextPose.position && value.rotation === nextPose.rotation) {
          return value;
        }

        return nextPose;
      });
    };

    syncPose();
    scene.addEventListener("enter-vr", syncPose);
    scene.addEventListener("exit-vr", syncPose);
    return () => {
      scene.removeEventListener("enter-vr", syncPose);
      scene.removeEventListener("exit-vr", syncPose);
    };
  }, [texturesReady]);

  if (!open || !texturesReady) {
    return null;
  }

  return createElement(
    "a-entity",
    {
      ref: rootRef,
      "data-testid": "spatial-playlist-popup",
      position: pose.position,
      rotation: pose.rotation
    },
    createElement(
      "a-entity",
      {
        position: `${POPUP_LOCAL_X} ${POPUP_LOCAL_Y} 0.045`
      },
      createElement("a-plane", {
        height: String(POPUP_WORLD_HEIGHT + 0.028),
        material: material(MAGENTA, 0.1, 0.34),
        position: "0 0 -0.012",
        width: String(POPUP_WORLD_WIDTH + 0.04)
      }),
      createElement("a-plane", {
        ref: basePlaneRef,
        "data-testid": "spatial-playlist-popup-base-plane",
        height: String(POPUP_WORLD_HEIGHT),
        material: flatTextureMaterial(TEXTURE_IDS.base),
        width: String(POPUP_WORLD_WIDTH)
      }),
      createElement("a-plane", {
        ref: controlPlaneRef,
        "data-testid": "spatial-playlist-popup-control-plane",
        height: String(POPUP_WORLD_HEIGHT),
        material: flatTextureMaterial(TEXTURE_IDS.controls),
        position: "0 0 0.012",
        width: String(POPUP_WORLD_WIDTH)
      }),
      createElement("a-plane", {
        ref: textPlaneRef,
        "data-testid": "spatial-playlist-popup-text-plane",
        height: String(POPUP_WORLD_HEIGHT),
        material: flatTextureMaterial(TEXTURE_IDS.text),
        position: "0 0 0.024",
        width: String(POPUP_WORLD_WIDTH)
      }),
      createElement(PopupRayBlocker),
      createElement(NavHitPlane, {
        direction: "up",
        disabled: visibleOffset <= 0,
        onClick: () => setPlaylistOffset((value) => clamp(value - 1, 0, maxOffset)),
        onState: (state) => setControlState((value) => updatePopupControlState(value, { up: state }))
      }),
      createElement(NavHitPlane, {
        direction: "down",
        disabled: visibleOffset >= maxOffset,
        onClick: () => setPlaylistOffset((value) => clamp(value + 1, 0, maxOffset)),
        onState: (state) => setControlState((value) => updatePopupControlState(value, { down: state }))
      }),
      ...visibleSources.map((source, index) =>
        createElement(SourceHitPlane, {
          index,
          key: source.id,
          onClick: () => {
            onSelectSource?.(source);
            setControlState((value) => updatePopupControlState(value, {
              clickedSourceId: source.id,
              hoveredSourceId: source.id,
              pressedSourceId: null
            }));
            if (clickTimerRef.current !== null) {
              window.clearTimeout(clickTimerRef.current);
            }
            clickTimerRef.current = window.setTimeout(() => {
              setControlState((value) => updatePopupControlState(value, {
                clickedSourceId: value.clickedSourceId === source.id ? null : value.clickedSourceId
              }));
            }, 220);
          },
          onState: (state) => {
            setControlState((value) => {
              if (state === "idle") {
                return updatePopupControlState(value, {
                  hoveredSourceId: value.hoveredSourceId === source.id ? null : value.hoveredSourceId,
                  pressedSourceId: value.pressedSourceId === source.id ? null : value.pressedSourceId
                });
              }

              return updatePopupControlState(value, {
                hoveredSourceId: source.id,
                pressedSourceId: state === "pressed" ? source.id : value.pressedSourceId === source.id ? null : value.pressedSourceId
              });
            });
          }
        })
      ),
      createElement(CloseHitPlane, {
        onClose,
        onState: (state) => setControlState((value) => updatePopupControlState(value, { close: state }))
      })
    )
  );
}
