"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { Material, Object3D } from "three";
import { HTMLMesh } from "three/examples/jsm/interactive/HTMLMesh.js";
import type { PcEditorCommand } from "../commands";
import {
  SPATIAL_UI_HIT_ATTRIBUTE,
  SPATIAL_UI_RENDER_ORDER,
  SPATIAL_UI_TEXT_RENDER_ORDER,
  setSpatialUiRayActive
} from "../shared/SpatialUiInteraction";
import {
  SPATIAL_PLAYER_DESKTOP_ROOT_POSITION,
  SPATIAL_PLAYER_HIT_LAYER_Z,
  SPATIAL_PLAYER_ROOT_ROTATION,
  SPATIAL_PLAYER_SKIN_HEIGHT_PX,
  SPATIAL_PLAYER_SKIN_WIDTH_PX,
  SPATIAL_PLAYER_TEXT_LAYER_POSITION,
  SPATIAL_PLAYER_XR_ROOT_POSITION,
  pxToWorld,
  sizeToWorld,
  spatialPlayerHitSlots,
  spatialPlayerSkinRects,
  spatialRectCss,
  spatialPlayerTextAnchors,
  spatialPlayerTextSlots,
  type SpatialRectSlot,
  type SpatialPlayerTextSlotMap,
  type SpatialTextAnchor,
  type SpatialHitSlot,
  type SpatialTextSlot
} from "../shared/SpatialPlayerLayout";

type AFrameEntity = HTMLElement & {
  object3D?: {
    add?: (object: unknown) => void;
    remove?: (object: unknown) => void;
  };
};

type HtmlMeshMaterial = Material & {
  map?: {
    needsUpdate?: boolean;
    update?: () => void;
  };
};

type HybridControlId =
  | "effectSpeed"
  | "move"
  | "next"
  | "playToggle"
  | "playbackRate"
  | "playlist"
  | "previous"
  | "progress"
  | "recordToggle"
  | "recordingRate"
  | "settings";

type HybridControlVisualState = "active" | "hover" | "idle" | "pressed";
type HybridControlVisualStateMap = Partial<Record<HybridControlId, HybridControlVisualState>>;

type Point3 = {
  x: number;
  y: number;
  z: number;
};

export type HybridSkinPlayerBarProps = {
  currentTimeMs: number;
  durationMs: number;
  effectSpeed?: number;
  enabled: boolean;
  isPlaying: boolean;
  onCommand: (command: PcEditorCommand) => void;
  playbackRate?: number;
  recordingActive?: boolean;
  recordingRate?: number;
  subtitle?: string;
  title: string;
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const MUTED = "#9fefff";
const BUTTON_INK = "#070011";

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatRateLabel(rate: number) {
  const fixed = rate < 1 ? rate.toFixed(2) : rate.toFixed(1);

  return fixed.replace(/\.0$/, "").replace(/0$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parsePosition(value: string): Point3 {
  const [x = 0, y = 0, z = 0] = value.split(/\s+/).map((part) => Number(part));

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0
  };
}

function formatPosition(point: Point3) {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)} ${point.z.toFixed(3)}`;
}

function hitSlotFromRect(slot: SpatialRectSlot): SpatialHitSlot {
  return {
    height: slot.height,
    width: slot.width,
    x: slot.left + slot.width / 2,
    y: slot.top + slot.height / 2
  };
}

function readIntersectionPoint(event: Event): Point3 | null {
  const point = (event as Event & { detail?: { intersection?: { point?: Point3 } } }).detail?.intersection?.point;

  if (!point) {
    return null;
  }

  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

function readIntersectionUvX(event: Event) {
  const uvX = (event as Event & { detail?: { intersection?: { uv?: { x?: number } } } }).detail?.intersection?.uv?.x;

  if (typeof uvX !== "number" || !Number.isFinite(uvX)) {
    return null;
  }

  return clamp(uvX, 0, 1);
}

function readDebug3dUiFlag() {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("debug3dui") === "1";
}

function truncateText(value: string, maxChars?: number) {
  if (!maxChars || value.length <= maxChars) {
    return value;
  }

  if (maxChars <= 3) {
    return ".".repeat(Math.max(1, maxChars));
  }

  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function material(color: string, opacity = 1, glow = 0.4) {
  return `shader: flat; color: ${color}; emissive: ${color}; emissiveIntensity: ${glow}; opacity: ${opacity}; transparent: true; side: double; depthTest: false; depthWrite: false`;
}

type TextTone = "accent" | "icon" | "mono" | "primary" | "record" | "soft";

function textProps(value: string, color = WHITE, width = 3, tone: TextTone = "primary") {
  const textColor = WHITE;
  const font = tone === "icon" ? undefined : tone === "mono" || tone === "soft" ? "monoid" : "exo2bold";
  const letterSpacing = tone === "icon" ? 0 : tone === "mono" || tone === "soft" ? 1.8 : 2.6;

  return {
    align: "center",
    baseline: "center",
    color: textColor,
    ...(font ? { font } : {}),
    letterSpacing,
    material: `shader: msdf; emissive: ${textColor}; emissiveIntensity: 0.52; depthTest: false; depthWrite: false`,
    opacity: tone === "soft" ? 0.86 : 1,
    side: "double",
    value,
    width: String(width),
    wrapCount: "44"
  };
}

function StyledText({
  align,
  color = WHITE,
  glowColor,
  position,
  scale,
  tone = "primary",
  value,
  width
}: {
  align?: "center" | "left" | "right";
  color?: string;
  glowColor?: string;
  position: string;
  scale: string;
  tone?: TextTone;
  value: string;
  width: number;
}) {
  const glow = WHITE;
  const textColor = WHITE;
  const resolvedAlign = align ?? "center";

  return createElement(
    "a-entity",
    { position },
    createElement("a-text", {
      ...textProps(value, glow, width, tone),
      align: resolvedAlign,
      opacity: 0.32,
      position: "0.001 -0.001 -0.003",
      scale
    }),
    createElement("a-text", {
      ...textProps(value, textColor, width, tone),
      align: resolvedAlign,
      position: "0 0 0",
      scale
    })
  );
}

type PlayerIconKind = "gear" | "menu" | "next" | "pause" | "play" | "previous";

function iconMaterial(color: string) {
  const glow = color === BUTTON_INK ? 0.08 : 0.62;

  return `shader: flat; color: ${color}; emissive: ${color}; emissiveIntensity: ${glow}; opacity: 1; transparent: true; side: double; depthTest: false; depthWrite: false`;
}

function iconBar(key: string, x: number, y: number, width: number, height: number, color: string, rotation = 0) {
  return createElement("a-plane", {
    className: "hybrid-native-icon",
    height: String(height),
    key,
    material: iconMaterial(color),
    position: `${x} ${y} 0`,
    rotation: `0 0 ${rotation}`,
    width: String(width)
  });
}

function iconTriangle(key: string, centerX: number, direction: "left" | "right", width: number, height: number, color: string) {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = height / 2;
  const bottom = -height / 2;
  const vertexA = direction === "right" ? `${left} ${bottom} 0` : `${right} ${bottom} 0`;
  const vertexB = direction === "right" ? `${right} 0 0` : `${left} 0 0`;
  const vertexC = direction === "right" ? `${left} ${top} 0` : `${right} ${top} 0`;

  return createElement("a-entity", {
    className: "hybrid-native-icon",
    geometry: `primitive: triangle; vertexA: ${vertexA}; vertexB: ${vertexB}; vertexC: ${vertexC}`,
    key,
    material: iconMaterial(color)
  });
}

function renderIconParts(kind: PlayerIconKind, color: string) {
  if (kind === "play") {
    return [iconTriangle("play-triangle", 0.001, "right", 0.026, 0.03, color)];
  }

  if (kind === "pause") {
    return [iconBar("pause-left", -0.006, 0, 0.0055, 0.028, color), iconBar("pause-right", 0.006, 0, 0.0055, 0.028, color)];
  }

  if (kind === "previous") {
    return [
      iconBar("previous-bar", -0.017, 0, 0.004, 0.026, color),
      iconTriangle("previous-left", -0.005, "left", 0.016, 0.026, color),
      iconTriangle("previous-right", 0.008, "left", 0.016, 0.026, color)
    ];
  }

  if (kind === "next") {
    return [
      iconTriangle("next-left", -0.008, "right", 0.016, 0.026, color),
      iconTriangle("next-right", 0.005, "right", 0.016, 0.026, color),
      iconBar("next-bar", 0.017, 0, 0.004, 0.026, color)
    ];
  }

  if (kind === "menu") {
    return [
      iconBar("menu-top", 0, 0.01, 0.03, 0.004, color),
      iconBar("menu-middle", 0, 0, 0.03, 0.004, color),
      iconBar("menu-bottom", 0, -0.01, 0.03, 0.004, color)
    ];
  }

  return [
    createElement("a-ring", {
      className: "hybrid-native-icon",
      key: "gear-ring",
      material: iconMaterial(color),
      position: "0 0 0",
      "radius-inner": "0.0058",
      "radius-outer": "0.0105",
      "theta-length": "360"
    }),
    ...Array.from({ length: 8 }, (_, index) => {
      const angle = index * 45;
      const radians = (angle * Math.PI) / 180;
      return iconBar(`gear-tooth-${index}`, Math.cos(radians) * 0.014, Math.sin(radians) * 0.014, 0.004, 0.008, color, angle - 90);
    })
  ];
}

function PlayerIcon({ color = WHITE, kind, slot }: { color?: string; kind: PlayerIconKind; slot: SpatialTextSlot }) {
  return createElement(
    "a-entity",
    {
      position: textSlotPosition(slot)
    },
    ...renderIconParts(kind, color)
  );
}

function textSlotPosition(slot: SpatialTextSlot) {
  return pxToWorld(slot.x, slot.y, 0.002);
}

function elevateNativeLayer(root: AFrameEntity | null) {
  const object = root?.object3D as Object3D | undefined;

  object?.traverse((child) => {
    const element = (child as Object3D & { el?: HTMLElement }).el;
    const tag = element?.tagName.toLowerCase();

    if (tag === "a-text" || element?.classList.contains("hybrid-native-icon")) {
      child.renderOrder = SPATIAL_UI_TEXT_RENDER_ORDER;
    } else if (element?.classList.contains("clickable")) {
      child.renderOrder = SPATIAL_UI_RENDER_ORDER;
    }
  });
}

type LocalRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function localRectFromElement(hostRect: DOMRect, element: HTMLElement): LocalRect {
  const rect = element.getBoundingClientRect();

  return {
    height: rect.height,
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    width: rect.width
  };
}

function resolveAnchorAxis(start: number, size: number, anchor: "bottom" | "center" | "left" | "right" | "top") {
  switch (anchor) {
    case "bottom":
    case "right":
      return start + size;
    case "center":
      return start + size / 2;
    case "left":
    case "top":
    default:
      return start;
  }
}

function resolveMeasuredTextPoint(rect: LocalRect, anchor: SpatialTextAnchor) {
  return {
    x: resolveAnchorAxis(rect.left, rect.width, anchor.x) + (anchor.offsetX ?? 0),
    y: resolveAnchorAxis(rect.top, rect.height, anchor.y) + (anchor.offsetY ?? 0)
  };
}

function measureSkinTextSlots(host: HTMLElement): SpatialPlayerTextSlotMap | null {
  const hostRect = host.getBoundingClientRect();
  const measuredSlots: SpatialPlayerTextSlotMap = { ...spatialPlayerTextSlots };

  for (const [slotId, anchor] of Object.entries(spatialPlayerTextAnchors) as Array<[
    keyof SpatialPlayerTextSlotMap,
    SpatialTextAnchor
  ]>) {
    const element = host.querySelector<HTMLElement>(`[data-skin-slot="${anchor.rect}"]`);

    if (!element) {
      return null;
    }

    const point = resolveMeasuredTextPoint(localRectFromElement(hostRect, element), anchor);
    measuredSlots[slotId] = {
      ...measuredSlots[slotId],
      x: point.x,
      y: point.y
    };
  }

  return measuredSlots;
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawDiagonalSheen(context: CanvasRenderingContext2D, slot: SpatialRectSlot, opacity = 0.18) {
  context.save();
  roundedRectPath(context, slot.left, slot.top, slot.width, slot.height, Math.min(slot.height / 2, 34));
  context.clip();
  context.translate(slot.left + slot.width * 0.42, slot.top + slot.height * 0.52);
  context.rotate(-0.42);

  const sheen = context.createLinearGradient(-slot.width * 0.35, 0, slot.width * 0.35, 0);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(0.46, `rgba(255, 255, 255, ${opacity})`);
  sheen.addColorStop(0.58, `rgba(185, 244, 255, ${opacity * 0.76})`);
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = sheen;
  context.fillRect(-slot.width * 0.45, -slot.height * 1.3, slot.width * 0.42, slot.height * 2.6);
  context.restore();
}

function withSkewedButtonShape(context: CanvasRenderingContext2D, slot: SpatialRectSlot, draw: () => void) {
  const centerX = slot.left + slot.width / 2;
  const centerY = slot.top + slot.height / 2;
  const skew = Math.tan((-10 * Math.PI) / 180);

  context.save();
  context.translate(centerX, centerY);
  context.transform(1, 0, skew, 1, 0, 0);
  context.translate(-centerX, -centerY);
  draw();
  context.restore();
}

function drawGlassPanel(
  context: CanvasRenderingContext2D,
  slot: SpatialRectSlot,
  options?: { accent?: "cyan" | "red"; radius?: number; solid?: boolean }
) {
  const radius = options?.radius ?? Math.min(slot.height / 2, 36);
  const fill = context.createLinearGradient(slot.left, slot.top, slot.left + slot.width, slot.top + slot.height);
  const solid = options?.solid ?? false;

  fill.addColorStop(0, options?.accent === "red" ? (solid ? "rgba(154, 28, 38, 0.96)" : "rgba(154, 28, 38, 0.2)") : solid ? "rgba(16, 6, 36, 0.98)" : "rgba(255, 255, 255, 0.12)");
  fill.addColorStop(0.42, solid ? "rgba(12, 2, 30, 0.98)" : "rgba(8, 0, 24, 0.16)");
  fill.addColorStop(0.76, options?.accent === "red" ? (solid ? "rgba(186, 24, 34, 0.96)" : "rgba(255, 48, 48, 0.16)") : solid ? "rgba(12, 2, 30, 0.96)" : "rgba(0, 255, 255, 0.11)");
  fill.addColorStop(1, solid ? "rgba(8, 0, 24, 0.98)" : "rgba(255, 0, 255, 0.08)");

  const paint = () => {
    context.save();
    roundedRectPath(context, slot.left, slot.top, slot.width, slot.height, radius);
    context.fillStyle = fill;
    context.fill();
    context.restore();

    drawDiagonalSheen(context, slot, options?.accent === "red" ? (solid ? 0.2 : 0.2) : solid ? 0.16 : 0.15);

    context.save();
    roundedRectPath(context, slot.left + 0.5, slot.top + 0.5, slot.width - 1, slot.height - 1, radius);
    context.shadowColor = options?.accent === "red" ? "rgba(255, 42, 42, 0.28)" : "rgba(0, 255, 255, 0.22)";
    context.shadowBlur = options?.accent === "red" ? 14 : 12;
    context.strokeStyle = options?.accent === "red" ? "rgba(255, 82, 82, 0.72)" : "rgba(0, 255, 255, 0.5)";
    context.lineWidth = solid ? 1.5 : 1;
    context.stroke();

    const topLine = context.createLinearGradient(slot.left + 18, slot.top + 8, slot.left + slot.width - 18, slot.top + 8);
    topLine.addColorStop(0, "rgba(255, 255, 255, 0)");
    topLine.addColorStop(0.2, "rgba(255, 255, 255, 0.34)");
    topLine.addColorStop(0.78, options?.accent === "red" ? "rgba(255, 120, 110, 0.3)" : "rgba(0, 255, 255, 0.26)");
    topLine.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.strokeStyle = topLine;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(slot.left + 22, slot.top + 8);
    context.lineTo(slot.left + slot.width - 22, slot.top + 8);
    context.stroke();
    context.restore();
  };

  if (solid) {
    withSkewedButtonShape(context, slot, paint);
  } else {
    paint();
  }
}

function drawButtonGlass(context: CanvasRenderingContext2D, slot: SpatialRectSlot, variant: "play" | "secondary") {
  const radius = slot.height / 2;
  const x = slot.left;
  const y = slot.top;
  const width = slot.width;
  const height = slot.height;

  withSkewedButtonShape(context, slot, () => {
    context.save();
    roundedRectPath(context, x, y, width, height, radius);

    if (variant === "play") {
      const playFill = context.createLinearGradient(x, y + height, x + width, y);
      playFill.addColorStop(0, "#ff9900");
      playFill.addColorStop(0.46, "#ff00ff");
      playFill.addColorStop(1, "#00ffff");
      context.fillStyle = playFill;
    } else {
      const buttonFill = context.createLinearGradient(x, y, x + width, y + height);
      buttonFill.addColorStop(0, "rgba(28, 14, 55, 1)");
      buttonFill.addColorStop(0.48, "rgba(12, 2, 30, 1)");
      buttonFill.addColorStop(1, "rgba(9, 0, 20, 1)");
      context.fillStyle = buttonFill;
    }

    context.fill();
    context.restore();

    drawDiagonalSheen(context, slot, variant === "play" ? 0.26 : 0.14);

    context.save();
    roundedRectPath(context, x + 1, y + 1, width - 2, height - 2, radius);
    context.shadowColor = variant === "play" ? "rgba(255, 0, 255, 0.38)" : "rgba(0, 255, 255, 0.24)";
    context.shadowBlur = variant === "play" ? 18 : 12;
    context.strokeStyle = variant === "play" ? "rgba(255, 255, 255, 0.72)" : "rgba(0, 255, 255, 0.52)";
    context.lineWidth = 2;
    context.stroke();
    context.restore();
  });
}

function drawControlStateOverlay(
  context: CanvasRenderingContext2D,
  slot: SpatialRectSlot,
  state: HybridControlVisualState | undefined,
  options?: { radius?: number; skew?: boolean }
) {
  if (!state || state === "idle") {
    return;
  }

  const radius = options?.radius ?? Math.min(slot.height / 2, 36);
  const paint = () => {
    context.save();
    roundedRectPath(context, slot.left + 1, slot.top + 1, slot.width - 2, slot.height - 2, radius);

    if (state === "pressed") {
      context.fillStyle = "rgba(0, 255, 255, 0.2)";
      context.shadowColor = "rgba(0, 255, 255, 0.42)";
      context.shadowBlur = 22;
      context.fill();
      context.strokeStyle = "rgba(255, 255, 255, 0.88)";
      context.lineWidth = 2.5;
      context.stroke();
    } else if (state === "hover") {
      context.fillStyle = "rgba(0, 255, 255, 0.08)";
      context.shadowColor = "rgba(0, 255, 255, 0.28)";
      context.shadowBlur = 16;
      context.fill();
      context.strokeStyle = "rgba(0, 255, 255, 0.72)";
      context.lineWidth = 2;
      context.stroke();
    } else {
      context.fillStyle = "rgba(255, 153, 0, 0.14)";
      context.strokeStyle = "rgba(255, 153, 0, 0.72)";
      context.lineWidth = 2;
      context.fill();
      context.stroke();
    }

    context.restore();
  };

  if (options?.skew) {
    withSkewedButtonShape(context, slot, paint);
  } else {
    paint();
  }
}

function drawProgressGlass(context: CanvasRenderingContext2D, progress: number) {
  const shell = spatialPlayerSkinRects.progressShell;
  const track = spatialPlayerSkinRects.progressTrack;
  const visualTrackHeight = 22;
  const visualTrackTop = track.top + (track.height - visualTrackHeight) / 2;
  const safeProgress = clamp(progress, 0, 1);
  const fillWidth = Math.max(0, track.width * safeProgress);
  const thumbRadius = 12;
  const thumbX = clamp(track.left + fillWidth, track.left + thumbRadius, track.left + track.width - thumbRadius);
  const thumbY = visualTrackTop + visualTrackHeight / 2;

  context.save();
  roundedRectPath(context, shell.left, shell.top, shell.width, shell.height, 34);
  context.fillStyle = "rgba(7, 0, 17, 0.22)";
  context.fill();
  context.strokeStyle = "rgba(255, 0, 255, 0.18)";
  context.lineWidth = 1;
  context.stroke();

  const shellTop = context.createLinearGradient(shell.left + 28, shell.top + 10, shell.left + shell.width - 28, shell.top + 10);
  shellTop.addColorStop(0, "rgba(255, 255, 255, 0)");
  shellTop.addColorStop(0.2, "rgba(255, 255, 255, 0.22)");
  shellTop.addColorStop(0.72, "rgba(0, 255, 255, 0.16)");
  shellTop.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.strokeStyle = shellTop;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(shell.left + 34, shell.top + 11);
  context.lineTo(shell.left + shell.width - 34, shell.top + 11);
  context.stroke();
  context.restore();

  context.save();
  roundedRectPath(context, track.left, visualTrackTop, track.width, visualTrackHeight, visualTrackHeight / 2);
  context.shadowColor = "rgba(0, 255, 255, 0.28)";
  context.shadowBlur = 20;
  const trackBase = context.createLinearGradient(track.left, visualTrackTop, track.left + track.width, visualTrackTop + visualTrackHeight);
  trackBase.addColorStop(0, "rgba(255, 255, 255, 0.16)");
  trackBase.addColorStop(0.28, "rgba(38, 22, 70, 0.72)");
  trackBase.addColorStop(0.68, "rgba(13, 35, 56, 0.68)");
  trackBase.addColorStop(1, "rgba(255, 255, 255, 0.1)");
  context.fillStyle = trackBase;
  context.fill();

  if (fillWidth > 0.5) {
    context.save();
    roundedRectPath(context, track.left, visualTrackTop, track.width, visualTrackHeight, visualTrackHeight / 2);
    context.clip();

    context.shadowColor = "rgba(255, 0, 255, 0.34)";
    context.shadowBlur = 16;
    const spectrum = context.createLinearGradient(track.left, visualTrackTop, track.left + track.width, visualTrackTop);
    spectrum.addColorStop(0, "#ff9900");
    spectrum.addColorStop(0.34, "#ff00ff");
    spectrum.addColorStop(0.68, "#8adfff");
    spectrum.addColorStop(1, "#00ffff");
    context.fillStyle = spectrum;
    context.fillRect(track.left, visualTrackTop, fillWidth, visualTrackHeight);

    const fillHighlight = context.createLinearGradient(track.left, visualTrackTop, track.left, visualTrackTop + visualTrackHeight);
    fillHighlight.addColorStop(0, "rgba(255, 255, 255, 0.42)");
    fillHighlight.addColorStop(0.34, "rgba(255, 255, 255, 0.12)");
    fillHighlight.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = fillHighlight;
    context.fillRect(track.left, visualTrackTop, fillWidth, visualTrackHeight);
    context.restore();
  }

  context.save();
  roundedRectPath(context, track.left, visualTrackTop, track.width, visualTrackHeight, visualTrackHeight / 2);
  context.clip();
  const trackGlass = context.createLinearGradient(track.left, visualTrackTop, track.left, visualTrackTop + visualTrackHeight);
  trackGlass.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  trackGlass.addColorStop(0.34, "rgba(255, 255, 255, 0.06)");
  trackGlass.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = trackGlass;
  context.fillRect(track.left, visualTrackTop, track.width, visualTrackHeight);
  context.restore();
  context.restore();

  context.save();
  context.beginPath();
  context.arc(thumbX, thumbY, thumbRadius, 0, Math.PI * 2);
  context.shadowColor = "rgba(0, 255, 255, 0.72)";
  context.shadowBlur = 18;
  context.fillStyle = "#f7ffff";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "#00ffff";
  context.stroke();
  context.restore();
}

function paintHybridGlassCanvas(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>(".hybrid-glass-canvas");
  const context = canvas?.getContext("2d");

  if (!canvas || !context) {
    return;
  }

  const width = SPATIAL_PLAYER_SKIN_WIDTH_PX;
  const height = SPATIAL_PLAYER_SKIN_HEIGHT_PX;
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  context.save();
  roundedRectPath(context, 1, 1, width - 2, height - 2, 46);
  context.clip();

  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "rgba(54, 31, 94, 0.52)");
  base.addColorStop(0.34, "rgba(23, 10, 53, 0.46)");
  base.addColorStop(0.58, "rgba(19, 35, 67, 0.4)");
  base.addColorStop(0.82, "rgba(18, 83, 95, 0.34)");
  base.addColorStop(1, "rgba(15, 4, 34, 0.44)");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const cyanBloom = context.createRadialGradient(width * 0.74, height * 0.24, 18, width * 0.74, height * 0.24, width * 0.52);
  cyanBloom.addColorStop(0, "rgba(0, 255, 255, 0.2)");
  cyanBloom.addColorStop(0.42, "rgba(0, 255, 255, 0.08)");
  cyanBloom.addColorStop(1, "rgba(0, 255, 255, 0)");
  context.fillStyle = cyanBloom;
  context.fillRect(0, 0, width, height);

  const magentaBloom = context.createRadialGradient(width * 0.2, height * 1.12, 20, width * 0.2, height * 1.12, width * 0.48);
  magentaBloom.addColorStop(0, "rgba(255, 0, 255, 0.24)");
  magentaBloom.addColorStop(0.5, "rgba(255, 0, 255, 0.08)");
  magentaBloom.addColorStop(1, "rgba(255, 0, 255, 0)");
  context.fillStyle = magentaBloom;
  context.fillRect(0, 0, width, height);

  const topMist = context.createLinearGradient(0, 0, 0, height);
  topMist.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  topMist.addColorStop(0.25, "rgba(255, 255, 255, 0.07)");
  topMist.addColorStop(0.6, "rgba(255, 255, 255, 0.014)");
  topMist.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = topMist;
  context.fillRect(0, 0, width, height);

  const sheen = context.createLinearGradient(width * -0.08, height * 0.22, width * 0.42, height * 0.74);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(0.44, "rgba(255, 255, 255, 0.2)");
  sheen.addColorStop(0.58, "rgba(199, 233, 255, 0.18)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);

  for (let y = 8; y < height; y += 6) {
    context.fillStyle = y % 12 === 8 ? "rgba(255, 255, 255, 0.034)" : "rgba(0, 255, 255, 0.018)";
    context.fillRect(0, y, width, 1);
  }

  context.restore();

  context.save();
  roundedRectPath(context, 3, 3, width - 6, height - 6, 43);
  context.shadowColor = "rgba(0, 255, 255, 0.42)";
  context.shadowBlur = 18;
  context.strokeStyle = "rgba(0, 255, 255, 0.78)";
  context.lineWidth = 2;
  context.stroke();

  roundedRectPath(context, 8, 8, width - 16, height - 16, 37);
  context.shadowColor = "rgba(255, 0, 255, 0.3)";
  context.shadowBlur = 12;
  context.strokeStyle = "rgba(255, 0, 255, 0.26)";
  context.lineWidth = 1;
  context.stroke();
  context.restore();

  context.save();
  context.lineCap = "round";
  const topLine = context.createLinearGradient(44, 10, width - 44, 10);
  topLine.addColorStop(0, "rgba(0, 255, 255, 0)");
  topLine.addColorStop(0.18, "rgba(255, 255, 255, 0.62)");
  topLine.addColorStop(0.62, "rgba(0, 255, 255, 0.56)");
  topLine.addColorStop(1, "rgba(0, 255, 255, 0)");
  context.strokeStyle = topLine;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(44, 10);
  context.lineTo(width - 44, 10);
  context.stroke();

  const bottomLine = context.createLinearGradient(70, height - 10, width - 70, height - 10);
  bottomLine.addColorStop(0, "rgba(255, 0, 255, 0)");
  bottomLine.addColorStop(0.18, "rgba(255, 0, 255, 0.62)");
  bottomLine.addColorStop(0.72, "rgba(0, 255, 255, 0.38)");
  bottomLine.addColorStop(1, "rgba(0, 255, 255, 0)");
  context.strokeStyle = bottomLine;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(70, height - 10);
  context.lineTo(width - 70, height - 10);
  context.stroke();
  context.restore();
}

function paintHybridControlsCanvas(host: HTMLElement, progress = 0, controlStates: HybridControlVisualStateMap = {}) {
  const canvas = host.querySelector<HTMLCanvasElement>(".hybrid-control-canvas");
  const context = canvas?.getContext("2d");

  if (!canvas || !context) {
    return;
  }

  const width = SPATIAL_PLAYER_SKIN_WIDTH_PX;
  const height = SPATIAL_PLAYER_SKIN_HEIGHT_PX;
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  context.save();
  roundedRectPath(context, 1, 1, width - 2, height - 2, 46);
  context.clip();
  drawProgressGlass(context, progress);
  drawGlassPanel(context, spatialPlayerSkinRects.transportPanel, { solid: true });
  drawGlassPanel(context, spatialPlayerSkinRects.titlePanel);
  drawGlassPanel(context, spatialPlayerSkinRects.recordPanel, { accent: "red", solid: true });
  drawGlassPanel(context, spatialPlayerSkinRects.playbackRatePanel, { solid: true });
  drawGlassPanel(context, spatialPlayerSkinRects.recordingRatePanel, { solid: true });
  drawGlassPanel(context, spatialPlayerSkinRects.effectSpeedPanel, { solid: true });
  drawGlassPanel(context, spatialPlayerSkinRects.playlistPanel, { solid: true });
  drawButtonGlass(context, spatialPlayerSkinRects.previousButton, "secondary");
  drawButtonGlass(context, spatialPlayerSkinRects.playButton, "play");
  drawButtonGlass(context, spatialPlayerSkinRects.nextButton, "secondary");
  drawButtonGlass(context, spatialPlayerSkinRects.settingsButton, "secondary");
  drawControlStateOverlay(context, spatialPlayerSkinRects.titlePanel, controlStates.move, { radius: 36 });
  drawControlStateOverlay(context, spatialPlayerSkinRects.progressShell, controlStates.progress, { radius: 34 });
  drawControlStateOverlay(context, spatialPlayerSkinRects.previousButton, controlStates.previous, { skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.playButton, controlStates.playToggle, { skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.nextButton, controlStates.next, { skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.recordPanel, controlStates.recordToggle, { radius: 36, skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.playbackRatePanel, controlStates.playbackRate, { radius: 36, skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.recordingRatePanel, controlStates.recordingRate, { radius: 36, skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.effectSpeedPanel, controlStates.effectSpeed, { radius: 36, skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.settingsButton, controlStates.settings, { skew: true });
  drawControlStateOverlay(context, spatialPlayerSkinRects.playlistPanel, controlStates.playlist, { radius: 36, skew: true });
  context.restore();
}

function createSkinDom(progress = 0) {
  const host = document.createElement("div");

  host.className = "hybrid-skin-player-bar";
  host.innerHTML = `
    <style>
      .hybrid-skin-player-bar {
        position: fixed;
        left: -14000px;
        top: 24px;
        width: ${SPATIAL_PLAYER_SKIN_WIDTH_PX}px;
        height: ${SPATIAL_PLAYER_SKIN_HEIGHT_PX}px;
        overflow: hidden;
        box-sizing: border-box;
        border: 1px solid rgba(0, 255, 255, 0.62);
        border-top: 2px solid rgba(0, 255, 255, 0.92);
        border-bottom: 2px solid rgba(255, 0, 255, 0.58);
        border-radius: 46px;
        background:
          linear-gradient(120deg, rgba(255,255,255,0.16), transparent 18%, rgba(0,255,255,0.12) 58%, transparent),
          linear-gradient(145deg, rgba(42,30,82,0.78), rgba(8,0,24,0.7) 58%, rgba(20,84,104,0.42));
        background-color: rgba(18, 6, 42, 0.18);
        box-shadow:
          0 24px 70px rgba(0, 0, 0, 0.48),
          0 0 32px rgba(255, 0, 255, 0.18),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
        backdrop-filter: blur(22px) saturate(1.35);
      }

      .hybrid-skin-player-bar * {
        box-sizing: border-box;
        position: absolute;
      }

      .hybrid-glass-canvas,
      .hybrid-control-canvas {
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .hybrid-glass-canvas {
        z-index: 0;
      }

      .hybrid-control-canvas {
        z-index: 6;
      }

      .hybrid-skin-player-bar::before {
        position: absolute;
        inset: 9px;
        content: "";
        border: 1px solid rgba(255,0,255,0.18);
        border-radius: 37px;
      }

      .hybrid-skin-player-bar::after {
        position: absolute;
        inset: 0;
        pointer-events: none;
        content: "";
        border-radius: inherit;
        background:
          linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 12%, transparent 28%),
          repeating-linear-gradient(to bottom, transparent 0, transparent 5px, rgba(255,255,255,0.026) 6px);
        opacity: 0.34;
      }

      .hybrid-glass-base {
        inset: 0;
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
        background:
          linear-gradient(112deg, rgba(255,255,255,0.16), transparent 18%, rgba(0,255,255,0.1) 58%, rgba(255,0,255,0.1)),
          linear-gradient(145deg, rgba(42,30,82,0.84), rgba(9,0,28,0.76) 58%, rgba(18,82,104,0.5));
        box-shadow:
          inset 0 38px 90px rgba(255,255,255,0.1),
          inset 0 -42px 86px rgba(255,0,255,0.1),
          inset 0 0 120px rgba(0,255,255,0.08);
        opacity: 0.92;
      }

      .hybrid-glass-frost {
        inset: 0;
        z-index: 1;
        pointer-events: none;
        border-radius: inherit;
        background:
          radial-gradient(circle at 18% 10%, rgba(255,255,255,0.22), transparent 24%),
          radial-gradient(circle at 52% 58%, rgba(190,220,255,0.12), transparent 34%),
          radial-gradient(circle at 82% 90%, rgba(0,255,255,0.14), transparent 30%),
          radial-gradient(circle at 72% 18%, rgba(255,0,255,0.11), transparent 26%),
          repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 5px);
        opacity: 0.72;
      }

      .hybrid-edge-top,
      .hybrid-edge-bottom {
        left: 42px;
        right: 42px;
        z-index: 3;
        height: 3px;
        pointer-events: none;
        border-radius: 999px;
      }

      .hybrid-edge-top {
        top: 8px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.52), rgba(0,255,255,0.42), transparent);
        box-shadow: 0 0 18px rgba(255,255,255,0.18), 0 0 20px rgba(0,255,255,0.22);
      }

      .hybrid-edge-bottom {
        bottom: 8px;
        background: linear-gradient(90deg, transparent, rgba(255,0,255,0.36), rgba(0,255,255,0.24), transparent);
        opacity: 0.72;
      }

      .hybrid-sheen {
        top: -20px;
        left: -160px;
        z-index: 3;
        width: 620px;
        height: 300px;
        pointer-events: none;
        background: linear-gradient(105deg, transparent 12%, rgba(255,255,255,0.22) 46%, transparent 72%);
        opacity: 0.28;
        transform: skewX(-18deg);
      }

      .hybrid-chrome,
      .hybrid-dot,
      .hybrid-progress-shell,
      .hybrid-progress-track,
      .hybrid-row-panel,
      .hybrid-button-circle {
        z-index: 4;
      }

      .hybrid-chrome {
        ${spatialRectCss(spatialPlayerSkinRects.chrome)}
        border-bottom: 2px solid rgba(0,255,255,0.3);
        background: linear-gradient(90deg, rgba(0,255,255,0.08), rgba(255,0,255,0.052), transparent);
      }

      .hybrid-dot {
        border-radius: 999px;
        box-shadow: 0 0 12px currentColor;
      }

      .hybrid-dot.magenta { ${spatialRectCss(spatialPlayerSkinRects.dotMagenta)} color: #ff00ff; background: #ff00ff; }
      .hybrid-dot.cyan { ${spatialRectCss(spatialPlayerSkinRects.dotCyan)} color: #00ffff; background: #00ffff; }
      .hybrid-dot.orange { ${spatialRectCss(spatialPlayerSkinRects.dotOrange)} color: #ff9900; background: #ff9900; }

      .hybrid-progress-shell {
        ${spatialRectCss(spatialPlayerSkinRects.progressShell)}
        border: 1px solid rgba(255,0,255,0.18);
        border-radius: 34px;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.045), rgba(0,255,255,0.055), rgba(255,0,255,0.045)),
          repeating-linear-gradient(90deg, rgba(255,255,255,0.038) 0 1px, transparent 1px 116px),
          rgba(7,0,17,0.18);
        background-color: rgba(7,0,17,0.045);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.18),
          inset 0 -1px 0 rgba(0,0,0,0.16),
          0 0 18px rgba(0,255,255,0.08);
      }

      .hybrid-progress-track {
        ${spatialRectCss(spatialPlayerSkinRects.progressTrack)}
        border-radius: 999px;
        background: transparent;
        box-shadow: none;
      }

      .hybrid-row-panel {
        border: 1px solid rgba(0,255,255,0.28);
        border-radius: 36px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12), transparent 54%),
          linear-gradient(135deg, rgba(0,255,255,0.035), rgba(255,0,255,0.026)),
          rgba(12,2,30,0.22);
        background-color: rgba(12,2,30,0.055);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.18),
          inset 0 -1px 0 rgba(0,0,0,0.16),
          0 0 16px rgba(0,255,255,0.08);
      }

      .hybrid-transport { ${spatialRectCss(spatialPlayerSkinRects.transportPanel)} }
      .hybrid-title { ${spatialRectCss(spatialPlayerSkinRects.titlePanel)} }
      .hybrid-record {
        ${spatialRectCss(spatialPlayerSkinRects.recordPanel)}
        border-color: rgba(255,70,70,0.58);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.12), transparent 54%),
          rgba(166,18,28,0.38);
        background-color: rgba(166,18,28,0.11);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.14),
          0 0 16px rgba(255,42,42,0.18);
      }
      .hybrid-rate-a { ${spatialRectCss(spatialPlayerSkinRects.playbackRatePanel)} }
      .hybrid-rate-b { ${spatialRectCss(spatialPlayerSkinRects.recordingRatePanel)} }
      .hybrid-rate-c { ${spatialRectCss(spatialPlayerSkinRects.effectSpeedPanel)} }
      .hybrid-list { ${spatialRectCss(spatialPlayerSkinRects.playlistPanel)} }

      .hybrid-button-circle {
        border-radius: 999px;
        border: 1px solid rgba(0,255,255,0.5);
        background:
          radial-gradient(circle at 34% 24%, rgba(255,255,255,0.28), rgba(255,255,255,0.07) 28%, transparent 54%),
          linear-gradient(180deg, rgba(255,255,255,0.12), transparent 58%),
          rgba(12,2,30,0.26);
        background-color: rgba(12,2,30,0.055);
        box-shadow:
          0 0 16px rgba(0,255,255,0.14),
          inset 0 1px 0 rgba(255,255,255,0.22),
          inset 0 -1px 0 rgba(0,0,0,0.22);
      }

      .hybrid-button-circle.prev { ${spatialRectCss(spatialPlayerSkinRects.previousButton)} }
      .hybrid-button-circle.settings { ${spatialRectCss(spatialPlayerSkinRects.settingsButton)} }
      .hybrid-button-circle.play {
        ${spatialRectCss(spatialPlayerSkinRects.playButton)}
        border-color: rgba(255,255,255,0.62);
        background:
          linear-gradient(90deg, rgba(255,153,0,0.72), rgba(255,0,255,0.66), rgba(0,255,255,0.62)),
          rgba(12,2,30,0.22);
        background-color: rgba(12,2,30,0.04);
        box-shadow:
          0 0 22px rgba(255,0,255,0.28),
          0 0 22px rgba(0,255,255,0.18),
          inset 0 1px 0 rgba(255,255,255,0.22);
      }
      .hybrid-button-circle.next { ${spatialRectCss(spatialPlayerSkinRects.nextButton)} }
    </style>
    <canvas class="hybrid-glass-canvas" width="${SPATIAL_PLAYER_SKIN_WIDTH_PX}" height="${SPATIAL_PLAYER_SKIN_HEIGHT_PX}"></canvas>
    <div class="hybrid-glass-base"></div>
    <div class="hybrid-glass-frost"></div>
    <div class="hybrid-edge-top"></div>
    <div class="hybrid-edge-bottom"></div>
    <div class="hybrid-sheen"></div>
    <div class="hybrid-chrome" data-skin-slot="chrome"></div>
    <div class="hybrid-dot magenta"></div>
    <div class="hybrid-dot cyan"></div>
    <div class="hybrid-dot orange"></div>
    <div class="hybrid-progress-shell" data-skin-slot="progressShell"></div>
    <div class="hybrid-progress-track" data-skin-slot="progressTrack"></div>
    <div class="hybrid-row-panel hybrid-transport" data-skin-slot="transportPanel"></div>
    <div class="hybrid-row-panel hybrid-title" data-skin-slot="titlePanel"></div>
    <div class="hybrid-row-panel hybrid-record" data-skin-slot="recordPanel"></div>
    <div class="hybrid-row-panel hybrid-rate-a" data-skin-slot="playbackRatePanel"></div>
    <div class="hybrid-row-panel hybrid-rate-b" data-skin-slot="recordingRatePanel"></div>
    <div class="hybrid-row-panel hybrid-rate-c" data-skin-slot="effectSpeedPanel"></div>
    <div class="hybrid-row-panel hybrid-list" data-skin-slot="playlistPanel"></div>
    <div class="hybrid-button-circle prev" data-skin-slot="previousButton"></div>
    <div class="hybrid-button-circle play" data-skin-slot="playButton"></div>
    <div class="hybrid-button-circle next" data-skin-slot="nextButton"></div>
    <div class="hybrid-button-circle settings" data-skin-slot="settingsButton"></div>
    <canvas class="hybrid-control-canvas" width="${SPATIAL_PLAYER_SKIN_WIDTH_PX}" height="${SPATIAL_PLAYER_SKIN_HEIGHT_PX}"></canvas>
  `;

  document.body.appendChild(host);
  paintHybridGlassCanvas(host);
  paintHybridControlsCanvas(host, progress);
  return host;
}

function updateHtmlMeshTexture(mesh: HTMLMesh | null) {
  const texture = (mesh?.material as HtmlMeshMaterial | undefined)?.map;

  if (!texture) {
    return;
  }

  if (texture.update) {
    texture.update();
  } else {
    texture.needsUpdate = true;
  }
}

function HitPlane({
  command,
  controlId,
  height,
  onControlState,
  onCommand,
  onClick,
  onDragEnd,
  onDragMove,
  onDragStart,
  slot,
  testId,
  width,
  x,
  y
}: {
  command?: PcEditorCommand;
  controlId: HybridControlId;
  height?: number;
  onControlState: (controlId: HybridControlId, state: HybridControlVisualState) => void;
  onCommand: (command: PcEditorCommand) => void;
  onClick?: (event: Event) => void;
  onDragEnd?: (event: Event) => void;
  onDragMove?: (event: Event) => void;
  onDragStart?: (event: Event) => void;
  slot?: SpatialHitSlot;
  testId: string;
  width?: number;
  x?: number;
  y?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const resolvedSlot = slot ?? {
    height: height ?? 0,
    width: width ?? 0,
    x: x ?? 0,
    y: y ?? 0
  };
  const size = sizeToWorld(resolvedSlot.width, resolvedSlot.height);

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return;
    }

    const setState = (state: HybridControlVisualState) => {
      onControlState(controlId, state);
    };

    const handleHoverStart = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, true);
      setState("hover");
    };

    const handleHoverEnd = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, false);
      onDragEnd?.(event);
      setState("idle");
    };

    const handleDown = (event: Event) => {
      event.stopPropagation();
      setState("pressed");
      onDragStart?.(event);
    };

    const handleMove = (event: Event) => {
      if (onDragMove) {
        event.stopPropagation();
        onDragMove(event);
      }
    };

    const handleUp = (event: Event) => {
      event.stopPropagation();
      onDragEnd?.(event);
      setState("hover");
    };

    const handleClick = (event: Event) => {
      event.stopPropagation();
      onClick?.(event);
      if (command) {
        onCommand(command);
      }
    };

    el.addEventListener("mouseenter", handleHoverStart);
    el.addEventListener("mouseleave", handleHoverEnd);
    el.addEventListener("raycaster-intersected", handleHoverStart);
    el.addEventListener("raycaster-intersected-cleared", handleHoverEnd);
    el.addEventListener("mousedown", handleDown);
    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseup", handleUp);
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("mouseenter", handleHoverStart);
      el.removeEventListener("mouseleave", handleHoverEnd);
      el.removeEventListener("raycaster-intersected", handleHoverStart);
      el.removeEventListener("raycaster-intersected-cleared", handleHoverEnd);
      el.removeEventListener("mousedown", handleDown);
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseup", handleUp);
      el.removeEventListener("click", handleClick);
    };
  }, [command, controlId, onClick, onCommand, onControlState, onDragEnd, onDragMove, onDragStart]);

  return createElement("a-plane", {
    className: "clickable",
    "data-hybrid-control-id": controlId,
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": testId,
    height: String(size.height),
    material: material(CYAN, 0.001, 0),
    position: pxToWorld(resolvedSlot.x, resolvedSlot.y, SPATIAL_PLAYER_HIT_LAYER_Z),
    renderOrder: SPATIAL_UI_RENDER_ORDER,
    ref,
    width: String(size.width)
  });
}

function RayBlockerPlane() {
  const ref = useRef<HTMLElement | null>(null);
  const size = sizeToWorld(SPATIAL_PLAYER_SKIN_WIDTH_PX, SPATIAL_PLAYER_SKIN_HEIGHT_PX);

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return;
    }

    const stop = (event: Event) => event.stopPropagation();
    const stopAndSetActive = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, true);
    };
    const stopAndSetIdle = (event: Event) => {
      event.stopPropagation();
      setSpatialUiRayActive(el, false);
    };

    el.addEventListener("click", stop);
    el.addEventListener("mousedown", stop);
    el.addEventListener("mouseup", stop);
    el.addEventListener("mouseenter", stopAndSetActive);
    el.addEventListener("mouseleave", stopAndSetIdle);
    el.addEventListener("raycaster-intersected", stopAndSetActive);
    el.addEventListener("raycaster-intersected-cleared", stopAndSetIdle);
    return () => {
      el.removeEventListener("click", stop);
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("mouseup", stop);
      el.removeEventListener("mouseenter", stopAndSetActive);
      el.removeEventListener("mouseleave", stopAndSetIdle);
      el.removeEventListener("raycaster-intersected", stopAndSetActive);
      el.removeEventListener("raycaster-intersected-cleared", stopAndSetIdle);
    };
  }, []);

  return createElement("a-plane", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "hybrid-player-ray-blocker",
    height: String(size.height),
    material: material(CYAN, 0.001, 0),
    position: pxToWorld(SPATIAL_PLAYER_SKIN_WIDTH_PX / 2, SPATIAL_PLAYER_SKIN_HEIGHT_PX / 2, SPATIAL_PLAYER_HIT_LAYER_Z - 0.004),
    renderOrder: SPATIAL_UI_RENDER_ORDER,
    ref,
    width: String(size.width)
  });
}

function PlayerText({
  color,
  glowColor,
  slot,
  tone,
  value
}: {
  color?: string;
  glowColor?: string;
  slot: SpatialTextSlot;
  tone?: TextTone;
  value: string;
}) {
  const resolvedValue = truncateText(value, slot.maxChars);

  return createElement(StyledText, {
    align: slot.align ?? "center",
    color: WHITE,
    glowColor: WHITE,
    position: textSlotPosition(slot),
    scale: slot.scale,
    tone,
    value: resolvedValue,
    width: slot.width
  });
}

function DebugTextAnchors({ slots }: { slots: SpatialPlayerTextSlotMap }) {
  return createElement(
    "a-entity",
    { "data-testid": "hybrid-debug-text-anchors" },
    ...(Object.entries(slots) as Array<[keyof SpatialPlayerTextSlotMap, SpatialTextSlot]>).map(([id, slot]) =>
      createElement("a-plane", {
        "data-debug-slot": String(id),
        height: "0.011",
        key: `text-${String(id)}`,
        material: material(MAGENTA, 0.82, 0.48),
        position: pxToWorld(slot.x, slot.y, 0.048),
        width: "0.011"
      })
    )
  );
}

function DebugHitPlanes({ slots }: { slots: Record<string, SpatialHitSlot> }) {
  return createElement(
    "a-entity",
    { "data-testid": "hybrid-debug-hit-planes" },
    ...Object.entries(slots).map(([id, slot]) => {
      const size = sizeToWorld(slot.width, slot.height);

      return createElement("a-plane", {
        "data-debug-hit-slot": id,
        height: String(size.height),
        key: `hit-${id}`,
        material: `${material(CYAN, 0.08, 0.18)}; wireframe: true`,
        position: pxToWorld(slot.x, slot.y, 0.042),
        width: String(size.width)
      });
    })
  );
}

export function HybridSkinPlayerBar({
  currentTimeMs,
  durationMs,
  effectSpeed = 1,
  enabled,
  isPlaying,
  onCommand,
  playbackRate = 1,
  recordingActive = false,
  recordingRate = 1,
  subtitle,
  title
}: HybridSkinPlayerBarProps) {
  const rootRef = useRef<AFrameEntity | null>(null);
  const skinRef = useRef<HTMLMesh | null>(null);
  const skinDomRef = useRef<HTMLElement | null>(null);
  const controlStatesRef = useRef<HybridControlVisualStateMap>({});
  const controlProgressPaintWidthRef = useRef(-1);
  const dragRef = useRef<{ startPoint: Point3; startPosition: Point3 } | null>(null);
  const lastProgressCommitAtRef = useRef(0);
  const progressDraftRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const rootPositionRef = useRef(SPATIAL_PLAYER_DESKTOP_ROOT_POSITION);
  const [debugEnabled] = useState(readDebug3dUiFlag);
  const [rootPosition, setRootPosition] = useState(SPATIAL_PLAYER_DESKTOP_ROOT_POSITION);
  const [textSlots, setTextSlots] = useState<SpatialPlayerTextSlotMap>(() => spatialPlayerTextSlots);
  const displayCurrentTimeMs = currentTimeMs;
  const displayDurationMs = durationMs;
  const displayIsPlaying = isPlaying;
  const bulletTimeActive = playbackRate <= 0.11;
  const playbackRateLabel = bulletTimeActive ? `BULLET ${formatRateLabel(playbackRate)}X` : `PLAY ${formatRateLabel(playbackRate)}X`;
  const recordingRateLabel = `REC ${formatRateLabel(recordingRate)}X`;
  const effectSpeedLabel = `FX ${formatRateLabel(effectSpeed)}X`;
  const progress = displayDurationMs > 0 ? clamp(displayCurrentTimeMs / displayDurationMs, 0, 1) : 0;
  const controlProgressPaintWidth = Math.round(spatialPlayerSkinRects.progressTrack.width * progress);

  if (progressDraftRef.current === null) {
    progressRef.current = progress;
  }

  const repaintControlLayer = () => {
    const skinDom = skinDomRef.current;

    if (!skinDom) {
      return;
    }

    paintHybridControlsCanvas(skinDom, progressRef.current, controlStatesRef.current);
    updateHtmlMeshTexture(skinRef.current);
  };

  const setRootPositionValue = (position: string) => {
    rootPositionRef.current = position;
    setRootPosition(position);
  };

  const setControlVisualState = (controlId: HybridControlId, state: HybridControlVisualState) => {
    if (controlStatesRef.current[controlId] === state) {
      return;
    }

    controlStatesRef.current = {
      ...controlStatesRef.current,
      [controlId]: state
    };
    repaintControlLayer();
  };

  const beginMoveDrag = (event: Event) => {
    const point = readIntersectionPoint(event);

    if (!point) {
      return;
    }

    dragRef.current = {
      startPoint: point,
      startPosition: parsePosition(rootPositionRef.current)
    };
  };

  const updateMoveDrag = (event: Event) => {
    const drag = dragRef.current;
    const point = readIntersectionPoint(event);

    if (!drag || !point) {
      return;
    }

    setRootPositionValue(
      formatPosition({
        x: drag.startPosition.x + point.x - drag.startPoint.x,
        y: drag.startPosition.y + point.y - drag.startPoint.y,
        z: drag.startPosition.z + point.z - drag.startPoint.z
      })
    );
  };

  const endMoveDrag = () => {
    dragRef.current = null;
  };

  const progressFromEvent = (event: Event) => readIntersectionUvX(event) ?? progressDraftRef.current ?? progressRef.current;

  const previewProgressFromEvent = (event: Event) => {
    const nextProgress = progressFromEvent(event);

    progressDraftRef.current = nextProgress;
    progressRef.current = nextProgress;
    repaintControlLayer();
    return nextProgress;
  };

  const commitProgressFromEvent = (event: Event) => {
    const nextProgress = previewProgressFromEvent(event);

    progressDraftRef.current = null;
    if (displayDurationMs <= 0) {
      return;
    }

    lastProgressCommitAtRef.current = Date.now();
    onCommand({
      timeMs: Math.round(displayDurationMs * nextProgress),
      type: "player.seekTo"
    });
  };

  const beginProgressDrag = (event: Event) => {
    previewProgressFromEvent(event);
  };

  const updateProgressDrag = (event: Event) => {
    if (progressDraftRef.current === null) {
      return;
    }

    previewProgressFromEvent(event);
  };

  const endProgressDrag = (event: Event) => {
    if (progressDraftRef.current === null) {
      return;
    }

    commitProgressFromEvent(event);
  };

  const clickProgress = (event: Event) => {
    if (Date.now() - lastProgressCommitAtRef.current < 80) {
      return;
    }

    commitProgressFromEvent(event);
  };

  useEffect(() => {
    const rootObject = rootRef.current?.object3D;

    if (!enabled || !rootObject?.add || skinRef.current) {
      return;
    }

    const skinDom = createSkinDom(progress);
    const measuredSlots = measureSkinTextSlots(skinDom);
    let measurementFrame = 0;

    skinDomRef.current = skinDom;
    controlProgressPaintWidthRef.current = controlProgressPaintWidth;

    if (measuredSlots) {
      setTextSlots(measuredSlots);
    }

    measurementFrame = window.requestAnimationFrame(() => {
      const nextMeasuredSlots = measureSkinTextSlots(skinDom);

      if (nextMeasuredSlots) {
        setTextSlots(nextMeasuredSlots);
      }
    });

    const skinMesh = new HTMLMesh(skinDom);
    skinMesh.name = "hybrid-skin-player-bar";
    skinMesh.position.set(0, 0, 0);
    skinMesh.renderOrder = SPATIAL_UI_RENDER_ORDER;
    const skinMaterial = skinMesh.material as Material;
    skinMaterial.depthWrite = false;
    skinMaterial.depthTest = false;
    rootObject.add(skinMesh);
    skinRef.current = skinMesh;

    return () => {
      window.cancelAnimationFrame(measurementFrame);
      rootObject.remove?.(skinMesh);
      skinMesh.dispose?.();
      skinDom.remove();
      skinRef.current = null;
      skinDomRef.current = null;
      controlStatesRef.current = {};
      controlProgressPaintWidthRef.current = -1;
    };
  }, [enabled]);

  useEffect(() => {
    const skinDom = skinDomRef.current;

    if (!enabled || !skinDom || !skinRef.current) {
      return;
    }

    if (Math.abs(controlProgressPaintWidth - controlProgressPaintWidthRef.current) < 2) {
      return;
    }

    controlProgressPaintWidthRef.current = controlProgressPaintWidth;
    paintHybridControlsCanvas(skinDom, progress, controlStatesRef.current);
    updateHtmlMeshTexture(skinRef.current);
  }, [controlProgressPaintWidth, enabled, progress]);

  useEffect(() => {
    const root = rootRef.current;
    const scene = root?.closest("a-scene") as (HTMLElement & { is?: (state: string) => boolean }) | null;

    if (!scene) {
      return;
    }

    const syncRootPosition = () => {
      setRootPositionValue(scene.is?.("vr-mode") ? SPATIAL_PLAYER_XR_ROOT_POSITION : SPATIAL_PLAYER_DESKTOP_ROOT_POSITION);
    };

    syncRootPosition();
    scene.addEventListener("enter-vr", syncRootPosition);
    scene.addEventListener("exit-vr", syncRootPosition);
    return () => {
      scene.removeEventListener("enter-vr", syncRootPosition);
      scene.removeEventListener("exit-vr", syncRootPosition);
    };
  }, []);

  useEffect(() => {
    elevateNativeLayer(rootRef.current);
  });

  if (!enabled) {
    return null;
  }

  return createElement(
    "a-entity",
    {
      "data-testid": "hybrid-skin-player-bar",
      position: rootPosition,
      renderOrder: SPATIAL_UI_RENDER_ORDER,
      rotation: SPATIAL_PLAYER_ROOT_ROTATION,
      ref: rootRef
    },
    createElement(
      "a-entity",
      {
        "data-testid": "hybrid-native-text-layer",
        position: SPATIAL_PLAYER_TEXT_LAYER_POSITION,
        renderOrder: SPATIAL_UI_TEXT_RENDER_ORDER
      },
      createElement(PlayerText, {
        color: CYAN,
        glowColor: CYAN,
        slot: textSlots.chromeLabel,
        tone: "accent",
        value: "PLAYBACK_CORE // HYBRID"
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.currentTime,
        tone: "mono",
        value: formatTime(displayCurrentTimeMs)
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.duration,
        tone: "mono",
        value: formatTime(displayDurationMs)
      }),
      createElement(PlayerIcon, {
        color: WHITE,
        kind: "previous",
        slot: textSlots.previous,
      }),
      createElement(PlayerIcon, {
        color: BUTTON_INK,
        kind: displayIsPlaying ? "pause" : "play",
        slot: textSlots.playLabel,
      }),
      createElement(PlayerText, {
        color: BUTTON_INK,
        slot: textSlots.playKey,
        tone: "soft",
        value: "Space"
      }),
      createElement(PlayerIcon, {
        color: WHITE,
        kind: "next",
        slot: textSlots.next,
      }),
      createElement(PlayerText, {
        color: WHITE,
        glowColor: CYAN,
        slot: textSlots.title,
        tone: "record",
        value: title
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.subtitle,
        tone: "mono",
        value: subtitle ?? "360 source / FOV 90 / mask 70% / auto off"
      }),
      createElement(PlayerText, {
        color: WHITE,
        glowColor: ORANGE,
        slot: textSlots.recordLabel,
        tone: "record",
        value: recordingActive ? "END RECORD" : "START RECORD"
      }),
      createElement(PlayerText, {
        color: "#ffd1d1",
        slot: textSlots.recordKey,
        tone: "soft",
        value: "Record"
      }),
      createElement(PlayerText, {
        color: WHITE,
        glowColor: CYAN,
        slot: textSlots.playbackRateLabel,
        tone: "mono",
        value: playbackRateLabel
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.playbackRateKey,
        tone: "soft",
        value: "Hold + R stick"
      }),
      createElement(PlayerText, {
        color: WHITE,
        glowColor: CYAN,
        slot: textSlots.recordingRateLabel,
        tone: "mono",
        value: recordingRateLabel
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.recordingRateKey,
        tone: "soft",
        value: "Hold + R stick"
      }),
      createElement(PlayerText, {
        color: WHITE,
        glowColor: CYAN,
        slot: textSlots.effectSpeedLabel,
        tone: "mono",
        value: effectSpeedLabel
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.effectSpeedKey,
        tone: "soft",
        value: "Hold + R stick"
      }),
      createElement(PlayerIcon, {
        color: WHITE,
        kind: "gear",
        slot: textSlots.settings
      }),
      createElement(PlayerIcon, {
        color: WHITE,
        kind: "menu",
        slot: textSlots.playlistLabel
      }),
      createElement(PlayerText, {
        color: MUTED,
        slot: textSlots.playlistKey,
        tone: "soft",
        value: "P"
      })
    ),
    debugEnabled ? createElement(DebugTextAnchors, { slots: textSlots }) : null,
    debugEnabled ? createElement(DebugHitPlanes, { slots: spatialPlayerHitSlots }) : null,
    createElement(RayBlockerPlane),
    createElement(HitPlane, {
      controlId: "move",
      onCommand,
      onControlState: setControlVisualState,
      onDragEnd: endMoveDrag,
      onDragMove: updateMoveDrag,
      onDragStart: beginMoveDrag,
      slot: hitSlotFromRect(spatialPlayerSkinRects.titlePanel),
      testId: "hybrid-player-move-handle"
    }),
    createElement(HitPlane, {
      controlId: "progress",
      onClick: clickProgress,
      onCommand,
      onControlState: setControlVisualState,
      onDragEnd: endProgressDrag,
      onDragMove: updateProgressDrag,
      onDragStart: beginProgressDrag,
      slot: spatialPlayerHitSlots.progress,
      testId: "hybrid-player-progress"
    }),
    createElement(HitPlane, {
      command: { type: "player.previous" },
      controlId: "previous",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.previous,
      testId: "hybrid-player-previous"
    }),
    createElement(HitPlane, {
      command: { type: "player.playPause.toggle" },
      controlId: "playToggle",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.playToggle,
      testId: "hybrid-player-toggle"
    }),
    createElement(HitPlane, {
      command: { type: "player.next" },
      controlId: "next",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.next,
      testId: "hybrid-player-next"
    }),
    createElement(HitPlane, {
      command: recordingActive ? { type: "crop.end" } : { type: "crop.start" },
      controlId: "recordToggle",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.recordToggle,
      testId: "hybrid-player-record"
    }),
    createElement(HitPlane, {
      command: { type: "player.playbackRate.reset" },
      controlId: "playbackRate",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.playbackRate,
      testId: "hybrid-player-playback-rate"
    }),
    createElement(HitPlane, {
      command: { type: "player.recordingRate.reset" },
      controlId: "recordingRate",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.recordingRate,
      testId: "hybrid-player-recording-rate"
    }),
    createElement(HitPlane, {
      command: { type: "effects.speed.reset" },
      controlId: "effectSpeed",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.effectSpeed,
      testId: "hybrid-player-effect-speed"
    }),
    createElement(HitPlane, {
      command: { type: "overlays.close" },
      controlId: "settings",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.settings,
      testId: "hybrid-player-settings"
    }),
    createElement(HitPlane, {
      command: { type: "playlist.toggle" },
      controlId: "playlist",
      onCommand,
      onControlState: setControlVisualState,
      slot: spatialPlayerHitSlots.playlist,
      testId: "hybrid-player-list"
    })
  );
}
