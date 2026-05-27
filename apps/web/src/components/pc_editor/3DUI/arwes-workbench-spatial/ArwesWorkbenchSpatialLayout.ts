export const ARWES_WORKBENCH_CANVAS_WIDTH = 1600;
export const ARWES_WORKBENCH_CANVAS_HEIGHT = 480;
export const ARWES_WORKBENCH_WORLD_WIDTH = 1.25;
export const ARWES_WORKBENCH_WORLD_HEIGHT = 0.3;
export const ARWES_WORKBENCH_DESKTOP_TABLE_POSITION = "0 1.05 -0.95";
export const ARWES_WORKBENCH_DESKTOP_TABLE_ROTATION = "-58 0 0";
export const ARWES_WORKBENCH_XR_TABLE_POSITION = "0 0.92 -0.72";
export const ARWES_WORKBENCH_XR_TABLE_ROTATION = "-72 0 0";

export const ARWES_WORKBENCH_TEXTURE_IDS = {
  base: "arwes-workbench-spatial-table-base",
  controls: "arwes-workbench-spatial-table-controls",
  text: "arwes-workbench-spatial-table-text"
};

export type ArwesWorkbenchTone = "cyan" | "danger" | "magenta" | "orange" | "white";

export type ArwesWorkbenchRegion = {
  h: number;
  id: string;
  label: string;
  tone: ArwesWorkbenchTone;
  w: number;
  x: number;
  y: number;
};

export const arwesWorkbenchSections = {
  center: { h: 366, w: 560, x: 520, y: 58 },
  left: { h: 366, w: 390, x: 80, y: 58 },
  right: { h: 366, w: 390, x: 1130, y: 58 }
};

export const arwesWorkbenchRegions: ArwesWorkbenchRegion[] = [
  { h: 150, id: "START", label: "START", tone: "orange", w: 160, x: 112, y: 148 },
  { h: 46, id: "LOCK", label: "LOCK", tone: "cyan", w: 118, x: 300, y: 126 },
  { h: 46, id: "SAVE", label: "SAVE", tone: "cyan", w: 118, x: 300, y: 184 },
  { h: 46, id: "DROP", label: "DROP", tone: "danger", w: 118, x: 300, y: 242 },
  { h: 46, id: "UNDO", label: "UNDO", tone: "cyan", w: 118, x: 300, y: 300 },
  { h: 42, id: "PLAY", label: "PLAY", tone: "orange", w: 72, x: 108, y: 350 },
  { h: 42, id: "CUT", label: "CUT", tone: "orange", w: 78, x: 188, y: 350 },
  { h: 42, id: "END", label: "AUTO", tone: "cyan", w: 68, x: 274, y: 350 },
  { h: 42, id: "RENDER", label: "RENDER", tone: "cyan", w: 94, x: 350, y: 350 },
  { h: 42, id: "HEAD", label: "HEAD ON", tone: "cyan", w: 120, x: 568, y: 110 },
  { h: 42, id: "SNAP", label: "SNAP FREE", tone: "magenta", w: 132, x: 706, y: 110 },
  { h: 42, id: "SAMPLE", label: "SAMPLE ON", tone: "orange", w: 132, x: 856, y: 110 },
  { h: 46, id: "YAW_LEFT", label: "YAW -", tone: "cyan", w: 104, x: 566, y: 328 },
  { h: 46, id: "YAW_RIGHT", label: "YAW +", tone: "cyan", w: 104, x: 686, y: 328 },
  { h: 46, id: "PITCH_UP", label: "PITCH +", tone: "cyan", w: 112, x: 806, y: 328 },
  { h: 46, id: "PITCH_DOWN", label: "PITCH -", tone: "cyan", w: 112, x: 934, y: 328 },
  { h: 52, id: "CRYSTAL", label: "CRYSTAL", tone: "magenta", w: 104, x: 1160, y: 126 },
  { h: 52, id: "EFFECT", label: "PLANET", tone: "magenta", w: 104, x: 1286, y: 126 },
  { h: 52, id: "EXPORT", label: "EXPORT", tone: "cyan", w: 104, x: 1412, y: 126 },
  { h: 52, id: "LOOK", label: "LOOK", tone: "cyan", w: 104, x: 1160, y: 196 },
  { h: 52, id: "SAMPLER", label: "SAMPLER", tone: "orange", w: 104, x: 1286, y: 196 },
  { h: 52, id: "DOLLY", label: "DOLLY", tone: "magenta", w: 104, x: 1412, y: 196 },
  { h: 48, id: "MORE_SAVE", label: "SAVE", tone: "cyan", w: 96, x: 1168, y: 292 },
  { h: 48, id: "MORE_DROP", label: "DROP", tone: "danger", w: 96, x: 1288, y: 292 },
  { h: 48, id: "MORE_RESTORE", label: "UNDO", tone: "cyan", w: 104, x: 1408, y: 292 }
];

export function worldSizeFromPx(width: number, height: number) {
  return {
    height: (height / ARWES_WORKBENCH_CANVAS_HEIGHT) * ARWES_WORKBENCH_WORLD_HEIGHT,
    width: (width / ARWES_WORKBENCH_CANVAS_WIDTH) * ARWES_WORKBENCH_WORLD_WIDTH
  };
}

export function worldPositionFromPx(x: number, y: number, z = 0.02) {
  const worldX = (x / ARWES_WORKBENCH_CANVAS_WIDTH - 0.5) * ARWES_WORKBENCH_WORLD_WIDTH;
  const worldY = (0.5 - y / ARWES_WORKBENCH_CANVAS_HEIGHT) * ARWES_WORKBENCH_WORLD_HEIGHT;
  return `${worldX} ${worldY} ${z}`;
}
