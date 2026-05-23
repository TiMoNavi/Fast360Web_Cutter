"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { AFrameGeometricSkyBackground } from "./AFrameGeometricSkyBackground";
import { patchAFrameSceneXrBindingFallback, requestAFrameMetaVrSession } from "./aframeXrCompat";
import { useAFrameRuntime } from "./useAFrameRuntime";

type ModuleId = "FRAME" | "FOV" | "FX" | "EXPORT" | "SESSION" | "SAMPLER" | null;
type WorkbenchRegion =
  | "CUT"
  | "LOCK"
  | "SAVE"
  | "DISCARD"
  | "RESTORE"
  | "FRAME"
  | "FOV"
  | "FX"
  | "EXPORT"
  | "SESSION"
  | "SAMPLER";
type ExtensionRegion = "CLOSE" | "PREV" | "NEXT" | "PRIMARY" | "FOV_MINUS" | "FOV_PLUS";
type RadialAction = "CUT" | "LOCK" | "FOV+" | "FOV-" | "DISCARD" | "RESTORE" | "SAVE" | "HIDE";

type AFrameSceneElement = HTMLElement & {
  hasLoaded?: boolean;
  is?: (state: string) => boolean;
  renderer?: {
    xr?: {
      isPresenting?: boolean;
    };
  };
};

type AFrameEntityElement = HTMLElement & {
  object3D?: {
    getObjectByProperty?: (name: string, value: string) => {
      material?: {
        map?: {
          needsUpdate?: boolean;
        };
      };
    };
  };
};

type CanvasRegion<T extends string> = {
  id: T;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: "cyan" | "magenta" | "orange" | "danger" | "white";
};

const CANVAS_W = 1600;
const CANVAS_H = 480;
const EXT_CANVAS_W = 1200;
const EXT_CANVAS_H = 480;
const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const DANGER = "#ff5b8a";
const MUTED = "#9fefff";
const DEEP = "#070011";
const PANEL = "#1a103c";

const workbenchRegions: Array<CanvasRegion<WorkbenchRegion>> = [
  { id: "CUT", label: "CUT", x: 78, y: 158, w: 220, h: 190, tone: "orange" },
  { id: "LOCK", label: "LOCK", x: 332, y: 152, w: 130, h: 74, tone: "cyan" },
  { id: "SAVE", label: "SAVE", x: 332, y: 254, w: 130, h: 74, tone: "cyan" },
  { id: "DISCARD", label: "DISCARD", x: 488, y: 152, w: 160, h: 74, tone: "danger" },
  { id: "RESTORE", label: "RESTORE", x: 488, y: 254, w: 160, h: 74, tone: "cyan" },
  { id: "FRAME", label: "FRAME", x: 725, y: 116, w: 138, h: 72, tone: "cyan" },
  { id: "FOV", label: "FOV", x: 888, y: 116, w: 120, h: 72, tone: "magenta" },
  { id: "FX", label: "FX", x: 1033, y: 116, w: 110, h: 72, tone: "magenta" },
  { id: "EXPORT", label: "EXPORT", x: 1168, y: 116, w: 150, h: 72, tone: "cyan" },
  { id: "SESSION", label: "SESSION", x: 725, y: 220, w: 170, h: 72, tone: "cyan" },
  { id: "SAMPLER", label: "SAMPLER", x: 920, y: 220, w: 172, h: 72, tone: "orange" }
];

const radialActions: Array<{ id: RadialAction; label: string; position: string; color: string }> = [
  { id: "CUT", label: "CUT", position: "0 0.34 0.05", color: ORANGE },
  { id: "LOCK", label: "LOCK", position: "0.32 0.22 0.05", color: CYAN },
  { id: "FOV+", label: "FOV+", position: "0.32 -0.08 0.05", color: MAGENTA },
  { id: "FOV-", label: "FOV-", position: "0.12 -0.34 0.05", color: MAGENTA },
  { id: "DISCARD", label: "DROP", position: "-0.18 -0.34 0.05", color: DANGER },
  { id: "RESTORE", label: "BACK", position: "-0.36 -0.08 0.05", color: CYAN },
  { id: "SAVE", label: "SAVE", position: "-0.32 0.22 0.05", color: ORANGE },
  { id: "HIDE", label: "HIDE", position: "0 0 0.07", color: WHITE }
];

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: XRSystem }).xr;
}

function toneColor(tone: CanvasRegion<string>["tone"]) {
  if (tone === "magenta") {
    return MAGENTA;
  }
  if (tone === "orange") {
    return ORANGE;
  }
  if (tone === "danger") {
    return DANGER;
  }
  if (tone === "white") {
    return WHITE;
  }
  return CYAN;
}

function material(color: string, opacity = 0.86, emissiveIntensity = 0.34) {
  return `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: ${emissiveIntensity}; metalness: 0.06; roughness: 0.34; opacity: ${opacity}; transparent: true`;
}

function textProps(value: string, color = WHITE, width = 3) {
  return {
    align: "center",
    color,
    material: `shader: msdf; emissive: ${color}; emissiveIntensity: 0.6`,
    value,
    width: String(width)
  };
}

function markTextureDirty(entity: AFrameEntityElement | null) {
  const mesh = entity?.object3D?.getObjectByProperty?.("type", "Mesh");
  const map = mesh?.material?.map;
  if (map) {
    map.needsUpdate = true;
  }
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut = 16) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut * 0.7, y);
  ctx.lineTo(x + w, y + cut * 0.8);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut * 0.7, y + h);
  ctx.lineTo(x, y + h - cut * 0.8);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function fillCutPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, showText = true) {
  roundedRectPath(ctx, x, y, w, h, 24);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, "rgba(255,153,0,0.34)");
  grad.addColorStop(0.45, "rgba(255,0,255,0.22)");
  grad.addColorStop(1, "rgba(0,255,255,0.18)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,153,0,0.95)";
  ctx.lineWidth = 3;
  ctx.stroke();

  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, 62 + i * 8, i * 0.8, i * 0.8 + Math.PI * 0.9);
    ctx.strokeStyle = i % 2 ? "rgba(0,255,255,0.86)" : "rgba(255,0,255,0.74)";
    ctx.lineWidth = 8 - i;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 18;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (showText) {
    ctx.fillStyle = WHITE;
    ctx.font = "900 42px Orbitron, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CUT", cx, cy + 2);
  }
}

function strokeGlow(ctx: CanvasRenderingContext2D, color: string, blur: number) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
}

function drawButtonShell(ctx: CanvasRenderingContext2D, region: CanvasRegion<string>, active: boolean, selected = false) {
  const color = toneColor(region.tone);
  roundedRectPath(ctx, region.x, region.y, region.w, region.h, 15);
  const grad = ctx.createLinearGradient(region.x, region.y, region.x + region.w, region.y + region.h);
  grad.addColorStop(0, active || selected ? `${color}66` : `${color}25`);
  grad.addColorStop(0.5, "rgba(26,16,60,0.72)");
  grad.addColorStop(1, active ? "rgba(255,255,255,0.18)" : "rgba(7,0,17,0.8)");
  ctx.fillStyle = grad;
  ctx.fill();
  strokeGlow(ctx, selected ? ORANGE : color, active ? 24 : 10);
  ctx.lineWidth = active || selected ? 4 : 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = active ? "rgba(255,255,255,0.46)" : "rgba(255,255,255,0.2)";
  ctx.fillRect(region.x + 18, region.y + 10, Math.max(20, region.w - 48), 3);
}

function drawButtonText(ctx: CanvasRenderingContext2D, region: CanvasRegion<string>, active: boolean, selected = false) {
  ctx.shadowColor = active || selected ? toneColor(region.tone) : "transparent";
  ctx.shadowBlur = active || selected ? 14 : 0;
  ctx.fillStyle = active || selected ? WHITE : "rgba(224,224,224,0.94)";
  ctx.font = `700 ${region.w > 150 ? 25 : 23}px Share Tech Mono, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(region.label, region.x + region.w / 2, region.y + region.h / 2 + 1);
  ctx.shadowBlur = 0;
}

function drawButton(ctx: CanvasRenderingContext2D, region: CanvasRegion<string>, active: boolean, selected = false) {
  drawButtonShell(ctx, region, active, selected);
  drawButtonText(ctx, region, active, selected);
}

function drawWorkbenchTexture(
  canvas: HTMLCanvasElement,
  state: {
    activeModule: ModuleId;
    fov: number;
    hoverRegion: WorkbenchRegion | null;
    locked: boolean;
    sampler: boolean;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const bg = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  bg.addColorStop(0, "#1a103c");
  bg.addColorStop(0.5, "#070011");
  bg.addColorStop(1, "#21104c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.globalAlpha = 0.72;
  for (let x = 0; x < CANVAS_W; x += 42) {
    ctx.strokeStyle = "rgba(0,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 130, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y < CANVAS_H; y += 28) {
    ctx.strokeStyle = "rgba(255,0,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y + 18);
    ctx.stroke();
  }
  ctx.restore();

  roundedRectPath(ctx, 16, 16, CANVAS_W - 32, CANVAS_H - 32, 30);
  ctx.strokeStyle = "rgba(0,255,255,0.9)";
  ctx.lineWidth = 5;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 28;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 70, 520, 3);
  ctx.fillRect(704, 70, 720, 3);
  ctx.fillStyle = CYAN;
  ctx.font = "700 28px Share Tech Mono, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("> DIRECT KEYS", 80, 72);
  ctx.fillText("> MODULE STRIP", 704, 72);

  fillCutPanel(ctx, 78, 158, 220, 190);

  workbenchRegions
    .filter((region) => region.id !== "CUT")
    .forEach((region) => {
      const selected =
        (state.activeModule === "FRAME" && region.id === "FRAME") ||
        (state.activeModule === "FOV" && region.id === "FOV") ||
        (state.activeModule === "FX" && region.id === "FX") ||
        (state.activeModule === "EXPORT" && region.id === "EXPORT") ||
        (state.activeModule === "SESSION" && region.id === "SESSION") ||
        (state.activeModule === "SAMPLER" && region.id === "SAMPLER");
      drawButton(ctx, region, state.hoverRegion === region.id, selected);
    });

  ctx.fillStyle = "rgba(7,0,17,0.62)";
  roundedRectPath(ctx, 705, 320, 720, 84, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,0,255,0.48)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const readouts = [
    ["HEAD", "READY", CYAN],
    ["LOCK", state.locked ? "ON" : "OFF", state.locked ? ORANGE : MUTED],
    ["FOV", String(state.fov), MAGENTA],
    ["SAMPLE", state.sampler ? "5HZ" : "PAUSE", state.sampler ? ORANGE : DANGER]
  ];
  readouts.forEach(([label, value, color], index) => {
    const x = 734 + index * 168;
    ctx.fillStyle = "rgba(0,255,255,0.08)";
    roundedRectPath(ctx, x, 338, 132, 42, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "700 18px Share Tech Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, 352);
    ctx.fillStyle = WHITE;
    ctx.textAlign = "right";
    ctx.fillText(value, x + 116, 370);
  });

  ctx.globalAlpha = 0.28;
  for (let y = 0; y < CANVAS_H; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.04)";
    ctx.fillRect(0, y, CANVAS_W, 1);
  }
  ctx.globalAlpha = 1;
}

function clearTextureCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function isWorkbenchRegionSelected(activeModule: ModuleId, region: CanvasRegion<WorkbenchRegion>) {
  return (
    (activeModule === "FRAME" && region.id === "FRAME") ||
    (activeModule === "FOV" && region.id === "FOV") ||
    (activeModule === "FX" && region.id === "FX") ||
    (activeModule === "EXPORT" && region.id === "EXPORT") ||
    (activeModule === "SESSION" && region.id === "SESSION") ||
    (activeModule === "SAMPLER" && region.id === "SAMPLER")
  );
}

function drawWorkbenchBaseTexture(canvas: HTMLCanvasElement) {
  const ctx = clearTextureCanvas(canvas);
  if (!ctx) {
    return;
  }

  const bg = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  bg.addColorStop(0, "#1a103c");
  bg.addColorStop(0.5, "#070011");
  bg.addColorStop(1, "#21104c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.globalAlpha = 0.72;
  for (let x = 0; x < CANVAS_W; x += 42) {
    ctx.strokeStyle = "rgba(0,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 130, CANVAS_H);
    ctx.stroke();
  }
  for (let y = 0; y < CANVAS_H; y += 28) {
    ctx.strokeStyle = "rgba(255,0,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_W, y + 18);
    ctx.stroke();
  }
  ctx.restore();

  roundedRectPath(ctx, 16, 16, CANVAS_W - 32, CANVAS_H - 32, 30);
  ctx.strokeStyle = "rgba(0,255,255,0.9)";
  ctx.lineWidth = 5;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 28;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(80, 70, 520, 3);
  ctx.fillRect(704, 70, 720, 3);

  ctx.fillStyle = "rgba(7,0,17,0.62)";
  roundedRectPath(ctx, 705, 320, 720, 84, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,0,255,0.48)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.globalAlpha = 0.28;
  for (let y = 0; y < CANVAS_H; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.04)";
    ctx.fillRect(0, y, CANVAS_W, 1);
  }
  ctx.globalAlpha = 1;
}

function drawWorkbenchControlTexture(
  canvas: HTMLCanvasElement,
  state: {
    activeModule: ModuleId;
    hoverRegion: WorkbenchRegion | null;
  }
) {
  const ctx = clearTextureCanvas(canvas);
  if (!ctx) {
    return;
  }

  fillCutPanel(ctx, 78, 158, 220, 190, false);
  workbenchRegions
    .filter((region) => region.id !== "CUT")
    .forEach((region) => {
      drawButtonShell(ctx, region, state.hoverRegion === region.id, isWorkbenchRegionSelected(state.activeModule, region));
    });

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(0,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 390);
  ctx.lineTo(304, 390);
  ctx.lineTo(332, 362);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawWorkbenchTextTexture(
  canvas: HTMLCanvasElement,
  state: {
    activeModule: ModuleId;
    fov: number;
    hoverRegion: WorkbenchRegion | null;
    locked: boolean;
    sampler: boolean;
  }
) {
  const ctx = clearTextureCanvas(canvas);
  if (!ctx) {
    return;
  }

  ctx.fillStyle = CYAN;
  ctx.font = "700 28px Share Tech Mono, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("> DIRECT KEYS", 80, 72);
  ctx.fillText("> MODULE STRIP", 704, 72);

  ctx.fillStyle = WHITE;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = state.hoverRegion === "CUT" ? 24 : 10;
  ctx.font = "900 42px Orbitron, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CUT", 188, 255);
  ctx.shadowBlur = 0;

  workbenchRegions
    .filter((region) => region.id !== "CUT")
    .forEach((region) => {
      drawButtonText(ctx, region, state.hoverRegion === region.id, isWorkbenchRegionSelected(state.activeModule, region));
    });

  const readouts = [
    ["HEAD", "READY", CYAN],
    ["LOCK", state.locked ? "ON" : "OFF", state.locked ? ORANGE : MUTED],
    ["FOV", String(state.fov), MAGENTA],
    ["SAMPLE", state.sampler ? "5HZ" : "PAUSE", state.sampler ? ORANGE : DANGER]
  ];
  readouts.forEach(([label, value, color], index) => {
    const x = 734 + index * 168;
    ctx.fillStyle = "rgba(0,255,255,0.08)";
    roundedRectPath(ctx, x, 338, 132, 42, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "700 18px Share Tech Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 14, 352);
    ctx.fillStyle = WHITE;
    ctx.textAlign = "right";
    ctx.fillText(value, x + 116, 370);
  });
}

function extensionRegions(activeModule: ModuleId): Array<CanvasRegion<ExtensionRegion>> {
  if (activeModule === "FOV") {
    return [
      { id: "FOV_MINUS", label: "FOV-", x: 112, y: 314, w: 170, h: 78, tone: "magenta" },
      { id: "FOV_PLUS", label: "FOV+", x: 314, y: 314, w: 170, h: 78, tone: "cyan" },
      { id: "CLOSE", label: "CLOSE", x: 930, y: 314, w: 164, h: 78, tone: "danger" }
    ];
  }

  if (activeModule === "FX") {
    return [
      { id: "PREV", label: "PREV", x: 98, y: 314, w: 150, h: 78, tone: "magenta" },
      { id: "NEXT", label: "NEXT", x: 272, y: 314, w: 150, h: 78, tone: "cyan" },
      { id: "PRIMARY", label: "APPLY", x: 470, y: 314, w: 190, h: 78, tone: "orange" },
      { id: "CLOSE", label: "CLOSE", x: 930, y: 314, w: 164, h: 78, tone: "danger" }
    ];
  }

  return [
    { id: "PRIMARY", label: activeModule === "EXPORT" ? "QUEUE" : activeModule === "SESSION" ? "PIN" : "ARM", x: 114, y: 314, w: 190, h: 78, tone: "orange" },
    { id: "CLOSE", label: "CLOSE", x: 930, y: 314, w: 164, h: 78, tone: "danger" }
  ];
}

function drawExtensionTexture(
  canvas: HTMLCanvasElement,
  state: {
    activeModule: ModuleId;
    effectPage: number;
    fov: number;
    hoverRegion: ExtensionRegion | null;
  }
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, EXT_CANVAS_W, EXT_CANVAS_H);
  const bg = ctx.createLinearGradient(0, 0, EXT_CANVAS_W, EXT_CANVAS_H);
  bg.addColorStop(0, "rgba(26,16,60,0.96)");
  bg.addColorStop(0.52, "rgba(7,0,17,0.96)");
  bg.addColorStop(1, "rgba(28,9,62,0.96)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXT_CANVAS_W, EXT_CANVAS_H);
  roundedRectPath(ctx, 18, 18, EXT_CANVAS_W - 36, EXT_CANVAS_H - 36, 28);
  ctx.strokeStyle = "rgba(0,255,255,0.92)";
  ctx.lineWidth = 5;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = ORANGE;
  ctx.font = "900 40px Orbitron, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${state.activeModule ?? "MODULE"} MORE`, 74, 92);

  ctx.fillStyle = "rgba(224,224,224,0.88)";
  ctx.font = "24px Share Tech Mono, monospace";
  const body =
    state.activeModule === "FX"
      ? state.effectPage === 0
        ? "PAGE 1: BLACK / FADE / GLOW / NOTE"
        : "PAGE 2: LUT / MARK / CAPTION / QUEUE"
      : state.activeModule === "FOV"
        ? `CURRENT FOV ${state.fov}. THUMBSTICK OR PANEL NUDGES THE VIEW.`
        : state.activeModule === "FRAME"
          ? "TRIGGER HOLD BINDS HEAD-GAZE. GRIP HOLD BINDS CONTROLLER RAY."
          : state.activeModule === "EXPORT"
            ? "QUEUE A PREVIEW EXPORT WITHOUT CHANGING BACKEND PROTOCOL."
            : "SESSION HISTORY, RESTORE POINTS, AND LOW FREQUENCY STATE.";
  ctx.fillText(body, 78, 168);
  ctx.fillStyle = "rgba(159,239,255,0.78)";
  ctx.font = "20px Share Tech Mono, monospace";
  ctx.fillText("EXTENSION PLANE: 45 DEGREE DESK POPUP / SINGLE ACTIVE MODULE", 78, 222);

  extensionRegions(state.activeModule).forEach((region) => drawButton(ctx, region, state.hoverRegion === region.id));

  ctx.globalAlpha = 0.24;
  for (let y = 0; y < EXT_CANVAS_H; y += 6) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, y, EXT_CANVAS_W, 1);
  }
  ctx.globalAlpha = 1;
}

function drawExtensionBaseTexture(canvas: HTMLCanvasElement) {
  const ctx = clearTextureCanvas(canvas);
  if (!ctx) {
    return;
  }

  const bg = ctx.createLinearGradient(0, 0, EXT_CANVAS_W, EXT_CANVAS_H);
  bg.addColorStop(0, "rgba(26,16,60,0.96)");
  bg.addColorStop(0.52, "rgba(7,0,17,0.96)");
  bg.addColorStop(1, "rgba(28,9,62,0.96)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, EXT_CANVAS_W, EXT_CANVAS_H);
  roundedRectPath(ctx, 18, 18, EXT_CANVAS_W - 36, EXT_CANVAS_H - 36, 28);
  ctx.strokeStyle = "rgba(0,255,255,0.92)";
  ctx.lineWidth = 5;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = 0.24;
  for (let y = 0; y < EXT_CANVAS_H; y += 6) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, y, EXT_CANVAS_W, 1);
  }
  ctx.globalAlpha = 1;
}

function drawExtensionContentTexture(
  canvas: HTMLCanvasElement,
  state: {
    activeModule: ModuleId;
    effectPage: number;
    fov: number;
    hoverRegion: ExtensionRegion | null;
  }
) {
  const ctx = clearTextureCanvas(canvas);
  if (!ctx) {
    return;
  }

  ctx.fillStyle = ORANGE;
  ctx.font = "900 40px Orbitron, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${state.activeModule ?? "MODULE"} MORE`, 74, 92);

  ctx.fillStyle = "rgba(224,224,224,0.88)";
  ctx.font = "24px Share Tech Mono, monospace";
  const body =
    state.activeModule === "FX"
      ? state.effectPage === 0
        ? "PAGE 1: BLACK / FADE / GLOW / NOTE"
        : "PAGE 2: LUT / MARK / CAPTION / QUEUE"
      : state.activeModule === "FOV"
        ? `CURRENT FOV ${state.fov}. THUMBSTICK OR PANEL NUDGES THE VIEW.`
        : state.activeModule === "FRAME"
          ? "TRIGGER HOLD BINDS HEAD-GAZE. GRIP HOLD BINDS CONTROLLER RAY."
          : state.activeModule === "EXPORT"
            ? "QUEUE A PREVIEW EXPORT WITHOUT CHANGING BACKEND PROTOCOL."
            : "SESSION HISTORY, RESTORE POINTS, AND LOW FREQUENCY STATE.";
  ctx.fillText(body, 78, 168);
  ctx.fillStyle = "rgba(159,239,255,0.78)";
  ctx.font = "20px Share Tech Mono, monospace";
  ctx.fillText("EXTENSION PLANE: 45 DEGREE DESK POPUP / SINGLE ACTIVE MODULE", 78, 222);

  extensionRegions(state.activeModule).forEach((region) => drawButton(ctx, region, state.hoverRegion === region.id));
}

function regionFromUv<T extends string>(uv: { x: number; y: number }, regions: Array<CanvasRegion<T>>, width: number, height: number) {
  const x = uv.x * width;
  const y = (1 - uv.y) * height;
  return regions.find((region) => x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h)?.id ?? null;
}

function uvFromEvent(event: Event) {
  const custom = event as CustomEvent<{ intersection?: { uv?: { x: number; y: number } } }>;
  return custom.detail?.intersection?.uv ?? null;
}

function SpatialButton({
  color = CYAN,
  label,
  onHover,
  onPress,
  onPressEnd,
  onPressStart,
  position,
  testId,
  width = 0.34
}: {
  color?: string;
  label: string;
  onHover?: () => void;
  onPress: () => void;
  onPressEnd?: () => void;
  onPressStart?: () => void;
  position: string;
  testId: string;
  width?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const currentEl = el;

    function handleClick(event: Event) {
      event.stopPropagation();
      onPress();
    }

    function handleDown(event: Event) {
      event.stopPropagation();
      onPressStart?.();
    }

    function handleUp(event: Event) {
      event.stopPropagation();
      onPressEnd?.();
    }

    function handleEnter() {
      onHover?.();
    }

    currentEl.addEventListener("click", handleClick);
    currentEl.addEventListener("mousedown", handleDown);
    currentEl.addEventListener("mouseup", handleUp);
    currentEl.addEventListener("mouseenter", handleEnter);

    return () => {
      currentEl.removeEventListener("click", handleClick);
      currentEl.removeEventListener("mousedown", handleDown);
      currentEl.removeEventListener("mouseup", handleUp);
      currentEl.removeEventListener("mouseenter", handleEnter);
    };
  }, [onHover, onPress, onPressEnd, onPressStart]);

  return createElement(
    "a-entity",
    {
      ref,
      className: "clickable",
      "data-testid": testId,
      position
    },
    createElement("a-box", {
      depth: "0.045",
      height: "0.12",
      material: material(DEEP, 0.48, 0.05),
      position: "0 -0.012 -0.034",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.04",
      height: "0.12",
      material: material(color, 0.78, 0.5),
      width: String(width)
    }),
    createElement("a-text", {
      ...textProps(label, WHITE, 1.5),
      position: "0 -0.014 0.032",
      scale: "0.13 0.13 0.13"
    })
  );
}

function RadialWheel({
  highlighted,
  onCancel,
  onCommit,
  onHighlight,
  onOpen,
  open
}: {
  highlighted: RadialAction | null;
  onCancel: () => void;
  onCommit: (action: RadialAction) => void;
  onHighlight: (action: RadialAction | null) => void;
  onOpen: () => void;
  open: boolean;
}) {
  return createElement(
    "a-entity",
    {
      "data-testid": "arwes-spatial-radial-root",
      position: "0.88 1.08 -1.32",
      rotation: "0 -18 0"
    },
    open
      ? createElement(
          "a-entity",
          {
            "data-testid": "arwes-spatial-radial-wheel"
          },
          createElement("a-ring", {
            material: material(PANEL, 0.66, 0.28),
            radiusInner: "0.22",
            radiusOuter: "0.46"
          }),
          createElement("a-text", {
            ...textProps(highlighted ? `RELEASE ${highlighted}` : "MOVE / RELEASE", ORANGE, 1.6),
            position: "0 -0.55 0.04",
            scale: "0.09 0.09 0.09"
          }),
          ...radialActions.map((action) =>
            createElement(SpatialButton, {
              key: action.id,
              color: highlighted === action.id ? ORANGE : action.color,
              label: action.label,
              onHover: () => onHighlight(action.id),
              onPress: () => onCommit(action.id),
              onPressEnd: () => onCommit(action.id),
              position: action.position,
              testId: `arwes-spatial-radial-${action.id.toLowerCase().replace("+", "plus").replace("-", "minus")}`,
              width: action.id === "HIDE" ? 0.28 : 0.25
            })
          ),
          createElement(SpatialButton, {
            color: DANGER,
            label: "CANCEL",
            onPress: onCancel,
            position: "0 -0.68 0.04",
            testId: "arwes-spatial-radial-cancel",
            width: 0.34
          })
        )
      : null,
    createElement(SpatialButton, {
      color: open ? ORANGE : CYAN,
      label: open ? "RELEASE" : "HOLD A",
      onPress: onOpen,
      onPressStart: onOpen,
      onPressEnd: () => {
        if (highlighted) {
          onCommit(highlighted);
        }
      },
      position: "0 0 0.04",
      testId: "arwes-spatial-radial-open",
      width: 0.42
    })
  );
}

function moduleFromRegion(region: WorkbenchRegion): ModuleId | null {
  if (region === "FX") {
    return "FX";
  }
  if (region === "FRAME" || region === "FOV" || region === "EXPORT" || region === "SESSION" || region === "SAMPLER") {
    return region;
  }
  return null;
}

export function AFrameArwesWorkbenchSpatialLab() {
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const deskBasePlaneRef = useRef<AFrameEntityElement | null>(null);
  const deskControlPlaneRef = useRef<AFrameEntityElement | null>(null);
  const deskHitPlaneRef = useRef<AFrameEntityElement | null>(null);
  const deskTextPlaneRef = useRef<AFrameEntityElement | null>(null);
  const extensionBasePlaneRef = useRef<AFrameEntityElement | null>(null);
  const extensionContentPlaneRef = useRef<AFrameEntityElement | null>(null);
  const extensionHitPlaneRef = useRef<AFrameEntityElement | null>(null);
  const workbenchBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workbenchControlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workbenchTextCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const extensionBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const extensionContentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightControllerRef = useRef<HTMLElement | null>(null);
  const leftControllerRef = useRef<HTMLElement | null>(null);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  const [activeModule, setActiveModule] = useState<ModuleId>("FX");
  const [effectPage, setEffectPage] = useState(0);
  const [entryStatus, setEntryStatus] = useState("Loading A-Frame spatial texture workbench...");
  const [extensionHover, setExtensionHover] = useState<ExtensionRegion | null>(null);
  const [fov, setFov] = useState(82);
  const [hoverRegion, setHoverRegion] = useState<WorkbenchRegion | null>(null);
  const [lastAction, setLastAction] = useState("Raycast the 1m x 0.3m desk plane. Trigger commits the mapped 2D region.");
  const [locked, setLocked] = useState(false);
  const [playerHidden, setPlayerHidden] = useState(false);
  const [radialHighlighted, setRadialHighlighted] = useState<RadialAction | null>(null);
  const [radialOpen, setRadialOpen] = useState(false);
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [sampler, setSampler] = useState(true);
  const [vrSupported, setVrSupported] = useState<"checking" | "supported" | "unsupported">("checking");

  const spatialState = useMemo(
    () => ({
      activeModule: activeModule ?? "NONE",
      effectPage,
      fov,
      hoverRegion: hoverRegion ?? "NONE",
      lastAction,
      locked,
      playerHidden,
      radialOpen,
      sampler,
      vrSupported
    }),
    [activeModule, effectPage, fov, hoverRegion, lastAction, locked, playerHidden, radialOpen, sampler, vrSupported]
  );

  useEffect(() => {
    const xr = getNavigatorXr();
    let cancelled = false;

    if (!xr?.isSessionSupported) {
      setVrSupported("unsupported");
      setEntryStatus("navigator.xr is missing. Use Quest Browser or the Meta WebXR emulator.");
      return () => {
        cancelled = true;
      };
    }

    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!cancelled) {
          setVrSupported(supported ? "supported" : "unsupported");
          setEntryStatus(
            supported
              ? "WebXR ready. Enter VR to inspect the texture-mapped workbench."
              : "immersive-vr is unavailable in this browser."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVrSupported("unsupported");
          setEntryStatus("Could not verify immersive-vr support.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!aframeReady) {
      return;
    }

    const sceneEl = sceneRef.current;
    if (!sceneEl) {
      return;
    }
    const currentSceneEl = sceneEl;
    let cleanup = () => {};
    let cancelled = false;

    function installPatch() {
      if (cancelled) {
        return;
      }
      cleanup = patchAFrameSceneXrBindingFallback(currentSceneEl);
    }

    if (currentSceneEl.hasLoaded) {
      installPatch();
    } else {
      currentSceneEl.addEventListener("loaded", installPatch, { once: true });
    }

    return () => {
      cancelled = true;
      currentSceneEl.removeEventListener("loaded", installPatch);
      cleanup();
    };
  }, [aframeReady]);

  useEffect(() => {
    const canvas = workbenchBaseCanvasRef.current;
    if (!canvas) {
      return;
    }
    drawWorkbenchBaseTexture(canvas);
    markTextureDirty(deskBasePlaneRef.current);
  }, []);

  useEffect(() => {
    const controlCanvas = workbenchControlCanvasRef.current;
    const textCanvas = workbenchTextCanvasRef.current;
    if (!controlCanvas || !textCanvas) {
      return;
    }

    drawWorkbenchControlTexture(controlCanvas, {
      activeModule,
      hoverRegion
    });
    drawWorkbenchTextTexture(textCanvas, {
      activeModule,
      fov,
      hoverRegion,
      locked,
      sampler
    });
    markTextureDirty(deskControlPlaneRef.current);
    markTextureDirty(deskTextPlaneRef.current);
  }, [activeModule, fov, hoverRegion, locked, sampler]);

  useEffect(() => {
    const baseCanvas = extensionBaseCanvasRef.current;
    const contentCanvas = extensionContentCanvasRef.current;
    if (!baseCanvas || !contentCanvas || !activeModule) {
      return;
    }
    drawExtensionBaseTexture(baseCanvas);
    drawExtensionContentTexture(contentCanvas, {
      activeModule,
      effectPage,
      fov,
      hoverRegion: extensionHover
    });
    markTextureDirty(extensionBasePlaneRef.current);
    markTextureDirty(extensionContentPlaneRef.current);
  }, [activeModule, effectPage, extensionHover, fov]);

  function commitRegion(region: WorkbenchRegion) {
    const module = moduleFromRegion(region);
    if (module) {
      setActiveModule((current) => (current === module ? null : module));
      setLastAction(`${module} module ${activeModule === module ? "closed" : "opened"} from texture plane.`);
      return;
    }

    if (region === "CUT") {
      setLastAction("CUT committed from 2D texture region.");
    } else if (region === "LOCK") {
      setLocked((value) => !value);
      setLastAction(locked ? "View lock disabled from desk plane." : "View lock enabled from desk plane.");
    } else if (region === "SAVE") {
      setLastAction("SAVE pressed: ViewPathPatch would flush.");
    } else if (region === "DISCARD") {
      setLastAction("DISCARD pressed: current range would be disabled.");
    } else if (region === "RESTORE") {
      setLastAction("RESTORE pressed: last discarded range would return.");
    }
  }

  function commitExtension(region: ExtensionRegion) {
    if (region === "CLOSE") {
      setActiveModule(null);
      setLastAction("Extension plane closed.");
    } else if (region === "PREV") {
      setEffectPage(0);
      setLastAction("FX extension page 1 selected.");
    } else if (region === "NEXT") {
      setEffectPage(1);
      setLastAction("FX extension page 2 selected.");
    } else if (region === "FOV_MINUS") {
      setFov((value) => Math.max(48, value - 4));
      setLastAction("FOV decreased from 45 degree extension plane.");
    } else if (region === "FOV_PLUS") {
      setFov((value) => Math.min(112, value + 4));
      setLastAction("FOV increased from 45 degree extension plane.");
    } else if (region === "PRIMARY") {
      setLastAction(`${activeModule ?? "MODULE"} primary action committed from extension plane.`);
    }
  }

  function commitRadial(action: RadialAction) {
    setRadialOpen(false);
    setRadialHighlighted(null);
    if (action === "LOCK") {
      setLocked((value) => !value);
    } else if (action === "FOV+") {
      setFov((value) => Math.min(112, value + 4));
    } else if (action === "FOV-") {
      setFov((value) => Math.max(48, value - 4));
    } else if (action === "HIDE") {
      setPlayerHidden((value) => !value);
    }
    setLastAction(`Radial ${action} committed on release.`);
  }

  useEffect(() => {
    const desk = deskHitPlaneRef.current;
    if (!desk) {
      return;
    }

    function handleMove(event: Event) {
      const uv = uvFromEvent(event);
      if (!uv) {
        return;
      }
      setHoverRegion(regionFromUv(uv, workbenchRegions, CANVAS_W, CANVAS_H));
    }

    function handleClick(event: Event) {
      const uv = uvFromEvent(event);
      if (!uv) {
        return;
      }
      event.stopPropagation();
      const region = regionFromUv(uv, workbenchRegions, CANVAS_W, CANVAS_H);
      if (region) {
        setHoverRegion(region);
        commitRegion(region);
      }
    }

    function handleLeave() {
      setHoverRegion(null);
    }

    desk.addEventListener("mousemove", handleMove);
    desk.addEventListener("click", handleClick);
    desk.addEventListener("mouseleave", handleLeave);

    return () => {
      desk.removeEventListener("mousemove", handleMove);
      desk.removeEventListener("click", handleClick);
      desk.removeEventListener("mouseleave", handleLeave);
    };
  });

  useEffect(() => {
    const plane = extensionHitPlaneRef.current;
    if (!plane || !activeModule) {
      return;
    }

    function handleMove(event: Event) {
      const uv = uvFromEvent(event);
      if (!uv) {
        return;
      }
      setExtensionHover(regionFromUv(uv, extensionRegions(activeModule), EXT_CANVAS_W, EXT_CANVAS_H));
    }

    function handleClick(event: Event) {
      const uv = uvFromEvent(event);
      if (!uv) {
        return;
      }
      event.stopPropagation();
      const region = regionFromUv(uv, extensionRegions(activeModule), EXT_CANVAS_W, EXT_CANVAS_H);
      if (region) {
        setExtensionHover(region);
        commitExtension(region);
      }
    }

    function handleLeave() {
      setExtensionHover(null);
    }

    plane.addEventListener("mousemove", handleMove);
    plane.addEventListener("click", handleClick);
    plane.addEventListener("mouseleave", handleLeave);

    return () => {
      plane.removeEventListener("mousemove", handleMove);
      plane.removeEventListener("click", handleClick);
      plane.removeEventListener("mouseleave", handleLeave);
    };
  }, [activeModule]);

  useEffect(() => {
    function closeOverlays() {
      setRadialOpen(false);
      setRadialHighlighted(null);
      setActiveModule(null);
      setLastAction("B / Escape closed radial and extension planes.");
    }

    function openRadial() {
      setRadialOpen(true);
      setLastAction("Quick radial opened. Move to an option and release.");
    }

    function thumbstick(event: Event) {
      const detail = (event as CustomEvent<{ y?: number; x?: number }>).detail;
      const y = detail?.y ?? 0;
      const x = detail?.x ?? 0;
      if (y < -0.55) {
        setFov((value) => Math.max(48, value - 4));
        setLastAction("Thumbstick down: FOV decreased.");
      } else if (y > 0.55) {
        setFov((value) => Math.min(112, value + 4));
        setLastAction("Thumbstick up: FOV increased.");
      } else if (Math.abs(x) > 0.55) {
        setLastAction(x > 0 ? "Thumbstick right: playback rate up." : "Thumbstick left: playback rate down.");
      }
    }

    function keydown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "a") {
        openRadial();
      } else if (event.key.toLowerCase() === "b" || event.key === "Escape") {
        closeOverlays();
      } else if (event.key === "[") {
        setFov((value) => Math.max(48, value - 4));
      } else if (event.key === "]") {
        setFov((value) => Math.min(112, value + 4));
      }
    }

    const controllers = [rightControllerRef.current, leftControllerRef.current].filter(Boolean) as HTMLElement[];
    controllers.forEach((controller) => {
      controller.addEventListener("abuttondown", openRadial);
      controller.addEventListener("thumbstickdown", openRadial);
      controller.addEventListener("bbuttondown", closeOverlays);
      controller.addEventListener("thumbstickmoved", thumbstick);
    });
    window.addEventListener("keydown", keydown);

    return () => {
      controllers.forEach((controller) => {
        controller.removeEventListener("abuttondown", openRadial);
        controller.removeEventListener("thumbstickdown", openRadial);
        controller.removeEventListener("bbuttondown", closeOverlays);
        controller.removeEventListener("thumbstickmoved", thumbstick);
      });
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  async function enterVr() {
    const sceneEl = sceneRef.current;
    if (!sceneEl?.renderer?.xr || sceneEl.is?.("vr-mode")) {
      setEntryStatus("A-Frame scene is still loading or already presenting.");
      return;
    }

    try {
      setEntryStatus("Requesting Meta immersive-vr session...");
      const { session, usedLegacyLayerFallback } = await requestAFrameMetaVrSession(sceneEl);
      session.addEventListener("end", () => {
        setRendererPresenting(false);
        setEntryStatus("Meta XR session ended.");
      });
      setRendererPresenting(Boolean(sceneEl.renderer.xr.isPresenting));
      setEntryStatus(
        usedLegacyLayerFallback
          ? "VR session running with XRWebGLLayer fallback."
          : "VR session running. Raycast the texture plane with Quest controllers."
      );
    } catch (error) {
      setEntryStatus(error instanceof Error ? error.message : "Failed to enter VR.");
    }
  }

  if (loadError) {
    return (
      <main className="quest-workbench-lab-page">
        <div className="aframe-login-message" role="alert">
          {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="quest-workbench-lab-page arwes-spatial-lab-page">
      <canvas
        ref={workbenchBaseCanvasRef}
        className="arwes-spatial-texture-source"
        height={CANVAS_H}
        id="arwes-spatial-workbench-base-texture"
        width={CANVAS_W}
      />
      <canvas
        ref={workbenchControlCanvasRef}
        className="arwes-spatial-texture-source"
        height={CANVAS_H}
        id="arwes-spatial-workbench-control-texture"
        width={CANVAS_W}
      />
      <canvas
        ref={workbenchTextCanvasRef}
        className="arwes-spatial-texture-source"
        height={CANVAS_H}
        id="arwes-spatial-workbench-text-texture"
        width={CANVAS_W}
      />
      <canvas
        ref={extensionBaseCanvasRef}
        className="arwes-spatial-texture-source"
        height={EXT_CANVAS_H}
        id="arwes-spatial-extension-base-texture"
        width={EXT_CANVAS_W}
      />
      <canvas
        ref={extensionContentCanvasRef}
        className="arwes-spatial-texture-source"
        height={EXT_CANVAS_H}
        id="arwes-spatial-extension-content-texture"
        width={EXT_CANVAS_W}
      />
      <section className="quest-workbench-lab-stage" data-testid="arwes-workbench-spatial-lab">
        {!aframeReady ? <div className="quest-workbench-lab-message">Loading A-Frame texture workbench...</div> : null}
        <div className="quest-workbench-lab-hud" data-testid="arwes-spatial-hud">
          <div>
            <p className="muted">Arwes Texture Workbench / World Space Canvas Pattern</p>
            <h1>Spatialized Flat UI Plane</h1>
          </div>
          <p data-testid="arwes-spatial-status">{entryStatus}</p>
          <div className="quest-workbench-lab-actions">
            <button className="button primary" data-testid="arwes-spatial-enter-vr" onClick={() => void enterVr()} type="button">
              {rendererPresenting ? "VR Running" : "Enter VR"}
            </button>
            <a className="button" href="/xr/arwes-workbench-plane-lab">
              Flat Master
            </a>
            <a className="button" href="/xr/quest-workbench-lab">
              Entity Lab
            </a>
          </div>
          <div className="quest-workbench-lab-status-line">
            <span>immersive-vr: {vrSupported}</span>
            <span>module: {activeModule ?? "none"}</span>
            <span>hover: {hoverRegion ?? "none"}</span>
            <span>FOV: {fov}</span>
          </div>
        </div>
        {aframeReady
          ? createElement(
              "a-scene",
              {
                ref: sceneRef,
                embedded: true,
                renderer: "colorManagement: true; preserveDrawingBuffer: true",
                webxr: "optionalFeatures: local-floor, bounded-floor",
                "xr-mode-ui": "enabled: false",
                "device-orientation-permission-ui": "enabled: true",
                cursor: "rayOrigin: mouse",
                raycaster: "objects: .clickable"
              },
              createElement(AFrameGeometricSkyBackground, {
                assetId: "arwes-spatial-sky"
              }),
              createElement("a-entity", {
                light: "type: ambient; color: #eaf7ff; intensity: 0.5"
              }),
              createElement("a-entity", {
                light: `type: point; color: ${CYAN}; intensity: 0.9; distance: 5`,
                position: "-1.2 1.8 -1.1"
              }),
              createElement("a-entity", {
                light: `type: point; color: ${MAGENTA}; intensity: 0.78; distance: 5`,
                position: "1.3 1.2 -1.35"
              }),
              createElement("a-entity", {
                geometry: "primitive: torus; radius: 3.25; radiusTubular: 0.004; segmentsTubular: 8",
                material: material(CYAN, 0.14, 0.18),
                position: "0 0 -2.1",
                rotation: "90 0 0"
              }),
              createElement(
                "a-entity",
                {
                  "data-testid": "arwes-spatial-desk-root",
                  position: "0 0.88 -1.42",
                  rotation: "-58 0 0"
                },
                createElement("a-plane", {
                  ref: deskBasePlaneRef,
                  "data-testid": "arwes-spatial-workbench-base-plane",
                  height: "0.3",
                  material:
                    "shader: flat; src: #arwes-spatial-workbench-base-texture; transparent: true; alphaTest: 0.01; side: double",
                  width: "1"
                }),
                createElement("a-plane", {
                  ref: deskControlPlaneRef,
                  "data-testid": "arwes-spatial-workbench-control-plane",
                  height: "0.3",
                  material:
                    "shader: flat; src: #arwes-spatial-workbench-control-texture; transparent: true; alphaTest: 0.01; side: double",
                  position: "0 0 0.012",
                  width: "1"
                }),
                createElement("a-plane", {
                  ref: deskTextPlaneRef,
                  "data-testid": "arwes-spatial-workbench-text-plane",
                  height: "0.3",
                  material:
                    "shader: flat; src: #arwes-spatial-workbench-text-texture; transparent: true; alphaTest: 0.01; side: double",
                  position: "0 0 0.024",
                  width: "1"
                }),
                createElement("a-plane", {
                  ref: deskHitPlaneRef,
                  className: "clickable",
                  "data-testid": "arwes-spatial-workbench-plane",
                  height: "0.3",
                  material: "shader: flat; color: #ffffff; opacity: 0.001; transparent: true; side: double",
                  position: "0 0 0.034",
                  width: "1"
                }),
                createElement("a-plane", {
                  height: "0.31",
                  material: material(CYAN, 0.08, 0.12),
                  position: "0 -0.004 -0.012",
                  width: "1.04"
                })
              ),
              activeModule
                ? createElement(
                    "a-entity",
                    {
                      "data-testid": "arwes-spatial-extension-root",
                      position: "0 1.12 -1.62",
                      rotation: "-45 0 0"
                    },
                    createElement("a-plane", {
                      ref: extensionBasePlaneRef,
                      "data-testid": "arwes-spatial-extension-base-plane",
                      height: "0.22",
                      material:
                        "shader: flat; src: #arwes-spatial-extension-base-texture; transparent: true; alphaTest: 0.01; side: double",
                      width: "0.55"
                    }),
                    createElement("a-plane", {
                      ref: extensionContentPlaneRef,
                      "data-testid": "arwes-spatial-extension-content-plane",
                      height: "0.22",
                      material:
                        "shader: flat; src: #arwes-spatial-extension-content-texture; transparent: true; alphaTest: 0.01; side: double",
                      position: "0 0 0.016",
                      width: "0.55"
                    }),
                    createElement("a-plane", {
                      ref: extensionHitPlaneRef,
                      className: "clickable",
                      "data-testid": "arwes-spatial-extension-plane",
                      height: "0.22",
                      material: "shader: flat; color: #ffffff; opacity: 0.001; transparent: true; side: double",
                      position: "0 0 0.028",
                      width: "0.55"
                    }),
                    createElement("a-plane", {
                      height: "0.23",
                      material: material(MAGENTA, 0.08, 0.12),
                      position: "0 -0.004 -0.012",
                      width: "0.58"
                    })
                  )
                : null,
              playerHidden
                ? createElement("a-text", {
                    ...textProps("> PLAYER UI HIDDEN", ORANGE, 2),
                    "data-testid": "arwes-spatial-player-hidden",
                    position: "-0.7 1.2 -1.5",
                    rotation: "0 18 0",
                    scale: "0.11 0.11 0.11"
                  })
                : createElement(
                    "a-entity",
                    {
                      "data-testid": "arwes-spatial-player-panel",
                      position: "-0.92 1.28 -1.5",
                      rotation: "0 16 0"
                    },
                    createElement("a-plane", {
                      height: "0.72",
                      material: material(PANEL, 0.62, 0.22),
                      width: "0.38"
                    }),
                    createElement("a-text", {
                      ...textProps("> PLAYBACK\n0:42 / 3:05\n1.0X\nVERTICAL UI", CYAN, 1.4),
                      position: "0 0.12 0.025",
                      scale: "0.1 0.1 0.1"
                    })
                  ),
              createElement(RadialWheel, {
                highlighted: radialHighlighted,
                onCancel: () => {
                  setRadialOpen(false);
                  setRadialHighlighted(null);
                  setLastAction("Quick radial canceled.");
                },
                onCommit: commitRadial,
                onHighlight: setRadialHighlighted,
                onOpen: () => {
                  setRadialOpen(true);
                  setLastAction("Quick radial open. Hover an action and release.");
                },
                open: radialOpen
              }),
              createElement("a-entity", {
                ref: leftControllerRef,
                "laser-controls": "hand: left",
                line: `color: ${WHITE}; opacity: 0.48`,
                raycaster: "objects: .clickable; far: 8"
              }),
              createElement("a-entity", {
                ref: rightControllerRef,
                "laser-controls": "hand: right",
                line: `color: ${CYAN}; opacity: 0.74`,
                raycaster: "objects: .clickable; far: 8"
              }),
              createElement(
                "a-camera",
                {
                  camera: "fov: 72",
                  position: "0 1.6 0",
                  rotation: "-12 0 0",
                  "look-controls": "enabled: true"
                },
                createElement("a-cursor", {
                  color: WHITE,
                  fuse: "false",
                  opacity: "0.72",
                  raycaster: "objects: .clickable"
                })
              )
            )
          : null}
        <span className="quest-workbench-lab-test-state" data-testid="arwes-spatial-last-action">
          {lastAction}
        </span>
        <script
          data-testid="arwes-spatial-state"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(spatialState) }}
        />
      </section>
    </main>
  );
}
