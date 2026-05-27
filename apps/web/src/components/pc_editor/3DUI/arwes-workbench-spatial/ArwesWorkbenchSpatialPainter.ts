import {
  ARWES_WORKBENCH_CANVAS_HEIGHT,
  ARWES_WORKBENCH_CANVAS_WIDTH,
  arwesWorkbenchRegions,
  arwesWorkbenchSections,
  type ArwesWorkbenchRegion,
  type ArwesWorkbenchTone
} from "./ArwesWorkbenchSpatialLayout";

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const DANGER = "#ff5b8a";
const MUTED = "#9fefff";
const DEEP = "#070011";

export type ArwesWorkbenchControlState = "disabled" | "hover" | "idle" | "pressed";

export type ArwesWorkbenchControlPaintState = {
  controlStates?: Partial<Record<string, ArwesWorkbenchControlState>>;
  disabledRegionIds?: ReadonlySet<string>;
};

export type ArwesWorkbenchTextPaintState = {
  discardActive?: boolean;
  recordingActive?: boolean;
  renderExportId?: string | null;
  renderStatus?: string;
};

function colorForTone(tone: ArwesWorkbenchTone) {
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

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = ARWES_WORKBENCH_CANVAS_WIDTH * dpr;
  canvas.height = ARWES_WORKBENCH_CANVAS_HEIGHT * dpr;
  canvas.style.width = `${ARWES_WORKBENCH_CANVAS_WIDTH}px`;
  canvas.style.height = `${ARWES_WORKBENCH_CANVAS_HEIGHT}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, ARWES_WORKBENCH_CANVAS_WIDTH, ARWES_WORKBENCH_CANVAS_HEIGHT);
  return context;
}

function cutRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cut = 18) {
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width - cut * 0.8, y);
  context.lineTo(x + width, y + cut * 0.8);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x + cut * 0.8, y + height);
  context.lineTo(x, y + height - cut * 0.8);
  context.lineTo(x, y + cut);
  context.closePath();
}

function strokeCutRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, cut = 18) {
  cutRectPath(context, x, y, width, height, cut);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.shadowColor = color;
  context.shadowBlur = 14;
  context.stroke();
  context.shadowBlur = 0;
}

function fillSection(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, tone: ArwesWorkbenchTone) {
  const color = colorForTone(tone);
  cutRectPath(context, x, y, width, height, 24);
  const gradient = context.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, `${color}24`);
  gradient.addColorStop(0.48, "rgba(8,0,24,0.6)");
  gradient.addColorStop(1, "rgba(255,0,255,0.12)");
  context.fillStyle = gradient;
  context.fill();
  strokeCutRect(context, x, y, width, height, `${color}88`, 24);
}

function drawLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number, color = MUTED, size = 20, align: CanvasTextAlign = "left") {
  const textColor = WHITE;

  context.save();
  context.font = `700 ${size}px "Share Tech Mono", Consolas, monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = textColor;
  context.shadowColor = textColor;
  context.shadowBlur = 8;
  context.fillText(label, x, y);
  context.restore();
}

function drawButtonBase(
  context: CanvasRenderingContext2D,
  region: ArwesWorkbenchRegion,
  state: ArwesWorkbenchControlState = "idle"
) {
  const color = colorForTone(region.tone);
  cutRectPath(context, region.x, region.y, region.w, region.h, region.h > 90 ? 28 : 12);
  const gradient = context.createLinearGradient(region.x, region.y, region.x + region.w, region.y + region.h);
  gradient.addColorStop(0, state === "disabled" ? "rgba(80,110,120,0.18)" : `${color}${state === "pressed" ? "66" : "40"}`);
  gradient.addColorStop(0.52, state === "pressed" ? "rgba(28,8,42,0.9)" : "rgba(12,2,30,0.84)");
  gradient.addColorStop(
    1,
    state === "disabled" ? "rgba(60,76,90,0.16)" : region.tone === "danger" ? "rgba(255,91,138,0.28)" : "rgba(0,255,255,0.13)"
  );
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = state === "disabled" ? "rgba(150,190,200,0.22)" : state === "pressed" ? WHITE : `${color}${state === "hover" ? "ee" : "aa"}`;
  context.lineWidth = state === "pressed" ? 4 : region.tone === "orange" || state === "hover" ? 3 : 2;
  context.shadowColor = state === "disabled" ? "transparent" : state === "pressed" ? WHITE : color;
  context.shadowBlur = state === "pressed" ? 24 : state === "hover" ? 20 : region.tone === "orange" ? 18 : 10;
  context.stroke();
  context.shadowBlur = 0;

  context.save();
  context.globalAlpha = state === "disabled" ? 0.12 : state === "pressed" ? 0.78 : state === "hover" ? 0.58 : 0.38;
  context.strokeStyle = "rgba(255,255,255,0.42)";
  context.beginPath();
  context.moveTo(region.x + 12, region.y + 8);
  context.lineTo(region.x + region.w - 18, region.y + 8);
  context.stroke();
  context.restore();

  if (state === "disabled") {
    context.save();
    cutRectPath(context, region.x + 2, region.y + 2, region.w - 4, region.h - 4, region.h > 90 ? 26 : 10);
    context.fillStyle = "rgba(2,8,14,0.46)";
    context.fill();
    context.strokeStyle = "rgba(120,170,180,0.18)";
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  if (state === "pressed" || state === "hover") {
    context.save();
    cutRectPath(context, region.x - 5, region.y - 5, region.w + 10, region.h + 10, region.h > 90 ? 34 : 16);
    context.strokeStyle = state === "pressed" ? "rgba(255,153,0,0.95)" : `${color}cc`;
    context.lineWidth = state === "pressed" ? 3 : 2;
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = state === "pressed" ? 30 : 18;
    context.stroke();
    context.restore();
  }
}

function drawCutCore(context: CanvasRenderingContext2D) {
  const region = arwesWorkbenchRegions.find((item) => item.id === "START");
  if (!region) {
    return;
  }

  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  for (let i = 0; i < 4; i += 1) {
    context.beginPath();
    context.arc(cx, cy, 42 + i * 9, i * 0.75, i * 0.75 + Math.PI * 0.96);
    context.strokeStyle = i % 2 ? "rgba(0,255,255,0.86)" : "rgba(255,0,255,0.76)";
    context.lineWidth = 8 - i;
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = 16;
    context.stroke();
  }
  context.shadowBlur = 0;
}

function drawGrid(context: CanvasRenderingContext2D) {
  context.save();
  context.strokeStyle = "rgba(0,255,255,0.08)";
  context.lineWidth = 1;
  for (let x = 0; x <= ARWES_WORKBENCH_CANVAS_WIDTH; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, ARWES_WORKBENCH_CANVAS_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= ARWES_WORKBENCH_CANVAS_HEIGHT; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(ARWES_WORKBENCH_CANVAS_WIDTH, y);
    context.stroke();
  }
  context.restore();
}

export function paintArwesWorkbenchBase(canvas: HTMLCanvasElement) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  const background = context.createLinearGradient(0, 0, ARWES_WORKBENCH_CANVAS_WIDTH, ARWES_WORKBENCH_CANVAS_HEIGHT);
  background.addColorStop(0, "rgba(0,255,255,0.16)");
  background.addColorStop(0.2, "rgba(26,16,60,0.82)");
  background.addColorStop(0.52, "rgba(8,0,24,0.9)");
  background.addColorStop(0.8, "rgba(255,0,255,0.16)");
  background.addColorStop(1, "rgba(255,153,0,0.12)");
  context.fillStyle = background;
  context.fillRect(0, 0, ARWES_WORKBENCH_CANVAS_WIDTH, ARWES_WORKBENCH_CANVAS_HEIGHT);

  drawGrid(context);
  strokeCutRect(context, 22, 20, ARWES_WORKBENCH_CANVAS_WIDTH - 44, ARWES_WORKBENCH_CANVAS_HEIGHT - 40, "rgba(0,255,255,0.72)", 30);
  strokeCutRect(context, 40, 38, ARWES_WORKBENCH_CANVAS_WIDTH - 80, ARWES_WORKBENCH_CANVAS_HEIGHT - 76, "rgba(255,0,255,0.34)", 22);

  fillSection(context, arwesWorkbenchSections.left.x, arwesWorkbenchSections.left.y, arwesWorkbenchSections.left.w, arwesWorkbenchSections.left.h, "cyan");
  fillSection(context, arwesWorkbenchSections.center.x, arwesWorkbenchSections.center.y, arwesWorkbenchSections.center.w, arwesWorkbenchSections.center.h, "magenta");
  fillSection(context, arwesWorkbenchSections.right.x, arwesWorkbenchSections.right.y, arwesWorkbenchSections.right.w, arwesWorkbenchSections.right.h, "cyan");
}

export function paintArwesWorkbenchControls(canvas: HTMLCanvasElement, paintState: ArwesWorkbenchControlPaintState = {}) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  arwesWorkbenchRegions.forEach((region) =>
    drawButtonBase(context, region, paintState.disabledRegionIds?.has(region.id) ? "disabled" : paintState.controlStates?.[region.id] ?? "idle")
  );
  drawCutCore(context);

  const screen = { h: 138, w: 470, x: 565, y: 174 };
  cutRectPath(context, screen.x, screen.y, screen.w, screen.h, 18);
  context.fillStyle = "rgba(2,0,12,0.62)";
  context.fill();
  context.strokeStyle = "rgba(0,255,255,0.44)";
  context.lineWidth = 2;
  context.stroke();
  context.strokeStyle = "rgba(255,0,255,0.34)";
  context.beginPath();
  context.moveTo(screen.x + screen.w / 2, screen.y + 16);
  context.lineTo(screen.x + screen.w / 2, screen.y + screen.h - 16);
  context.moveTo(screen.x + 24, screen.y + screen.h / 2);
  context.lineTo(screen.x + screen.w - 24, screen.y + screen.h / 2);
  context.stroke();
}

export function paintArwesWorkbenchText(canvas: HTMLCanvasElement, paintState: ArwesWorkbenchTextPaintState = {}) {
  const context = setupCanvas(canvas);
  if (!context) {
    return;
  }

  drawLabel(context, "DIRECT KEYS", 108, 94, WHITE, 24);
  drawLabel(context, "01", 430, 94, CYAN, 20, "right");
  drawLabel(context, "HEAD-GAZE FRAMING CORE", 556, 94, WHITE, 24);
  drawLabel(context, "YAW -12   PITCH 4   FOV 82", 1030, 94, MUTED, 18, "right");
  drawLabel(context, "MODULE STRIP", 1160, 94, WHITE, 24);
  drawLabel(context, "02", 1494, 94, CYAN, 20, "right");

  arwesWorkbenchRegions.forEach((region) => {
    const label = region.id === "START" && paintState.recordingActive ? "END" : region.label;
    const color = region.id === "PLAY" || region.id === "START" || region.id === "CUT" ? DEEP : WHITE;
    const size = region.h > 90 ? 44 : label.length > 7 ? 19 : 22;
    drawLabel(context, label, region.x + region.w / 2, region.y + region.h / 2 + 1, color, size, "center");
  });

  drawLabel(context, "VIEW LOCK", 108, 316, MUTED, 18);
  drawLabel(context, paintState.recordingActive ? "RECORDING" : "ARMED", 226, 316, paintState.recordingActive ? DANGER : ORANGE, 24);
  drawLabel(context, "RETICLE / MASK PREVIEW", 800, 204, MUTED, 18, "center");
  drawLabel(context, "FOV 82", 572, 404, CYAN, 18);
  drawLabel(context, "MASK 0.74", 808, 404, MAGENTA, 18);
  const renderStatus = (paintState.renderStatus ?? "idle").toUpperCase();
  const exportLabel = paintState.renderExportId ? `EXPORT ${paintState.renderExportId.slice(0, 8)}` : "EXPORT WAIT";
  const discardLabel = paintState.discardActive ? "DISCARD ACTIVE" : "SAMPLER IDLE";

  drawLabel(context, renderStatus === "DONE" ? "EXPORT READY" : `EXPORT ${renderStatus}`, 1164, 372, renderStatus === "ERROR" ? DANGER : MUTED, 18);
  drawLabel(context, discardLabel, 1320, 372, paintState.discardActive ? DANGER : ORANGE, 18);
  drawLabel(context, exportLabel, 1510, 372, renderStatus === "DONE" ? CYAN : MUTED, 18, "right");
}
