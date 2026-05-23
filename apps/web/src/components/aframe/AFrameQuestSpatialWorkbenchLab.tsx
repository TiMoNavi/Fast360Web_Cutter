"use client";

import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AFrameGeometricSkyBackground } from "./AFrameGeometricSkyBackground";
import { patchAFrameSceneXrBindingFallback, requestAFrameMetaVrSession } from "./aframeXrCompat";
import { useAFrameRuntime } from "./useAFrameRuntime";

type WorkbenchModule = "framing" | "fov" | "effects" | "export" | "session" | null;
type GazeMode = "idle" | "head" | "ray";
type RadialAction = "cut" | "lock" | "fovIn" | "fovOut" | "discard" | "restore" | "save" | "hideUi";

type AFrameSceneElement = HTMLElement & {
  hasLoaded?: boolean;
  is?: (state: string) => boolean;
  renderer?: {
    xr?: {
      isPresenting?: boolean;
    };
  };
};

type SpatialButtonProps = {
  children?: ReactNode;
  color?: string;
  disabled?: boolean;
  label: string;
  onHover?: () => void;
  onPress: () => void;
  onPressStart?: () => void;
  onPressEnd?: () => void;
  position: string;
  testId: string;
  width?: number;
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const PANEL = "#1a103c";
const PANEL_SOFT = "#241653";
const DEEP = "#070011";
const MUTED = "#9fefff";
const DANGER = "#ff5b8a";

const radialActions: Array<{ id: RadialAction; label: string; position: string; color: string }> = [
  { id: "cut", label: "CUT", position: "0 0.34 0.05", color: ORANGE },
  { id: "lock", label: "LOCK", position: "0.32 0.22 0.05", color: CYAN },
  { id: "fovIn", label: "FOV+", position: "0.32 -0.08 0.05", color: MAGENTA },
  { id: "fovOut", label: "FOV-", position: "0.12 -0.34 0.05", color: MAGENTA },
  { id: "discard", label: "DROP", position: "-0.18 -0.34 0.05", color: DANGER },
  { id: "restore", label: "BACK", position: "-0.36 -0.08 0.05", color: CYAN },
  { id: "save", label: "SAVE", position: "-0.32 0.22 0.05", color: ORANGE },
  { id: "hideUi", label: "HIDE", position: "0 0 0.07", color: WHITE }
];

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: XRSystem }).xr;
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

function moduleTitle(module: WorkbenchModule) {
  if (module === "framing") {
    return "FRAMING";
  }
  if (module === "fov") {
    return "FOV";
  }
  if (module === "effects") {
    return "EFFECTS";
  }
  if (module === "export") {
    return "EXPORT";
  }
  if (module === "session") {
    return "SESSION";
  }
  return "WORKBENCH";
}

function applyRadialActionLabel(action: RadialAction) {
  const labels: Record<RadialAction, string> = {
    cut: "Cut marker inserted",
    lock: "View lock toggled",
    fovIn: "FOV increased",
    fovOut: "FOV decreased",
    discard: "Range marked for discard",
    restore: "Last range restored",
    save: "Patch saved",
    hideUi: "Player UI hidden"
  };

  return labels[action];
}

function SpatialButton({
  children,
  color = CYAN,
  disabled = false,
  label,
  onHover,
  onPress,
  onPressEnd,
  onPressStart,
  position,
  testId,
  width = 0.34
}: SpatialButtonProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!el || disabled) {
      return;
    }

    const currentEl = el;
    let timer: number | null = null;

    function restore() {
      currentEl.setAttribute("animation__press", "property: scale; to: 1 1 1; dur: 85; easing: easeOutQuad");
    }

    function pressVisual() {
      currentEl.setAttribute("animation__press", "property: scale; to: 0.95 0.88 0.95; dur: 45; easing: easeOutQuad");
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(restore, 120);
    }

    function handleClick(event: Event) {
      event.stopPropagation();
      pressVisual();
      onPress();
    }

    function handleDown(event: Event) {
      event.stopPropagation();
      pressVisual();
      onPressStart?.();
    }

    function handleUp(event: Event) {
      event.stopPropagation();
      onPressEnd?.();
    }

    function handleHover() {
      onHover?.();
    }

    currentEl.addEventListener("click", handleClick);
    currentEl.addEventListener("mousedown", handleDown);
    currentEl.addEventListener("mouseup", handleUp);
    currentEl.addEventListener("mouseenter", handleHover);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      currentEl.removeEventListener("click", handleClick);
      currentEl.removeEventListener("mousedown", handleDown);
      currentEl.removeEventListener("mouseup", handleUp);
      currentEl.removeEventListener("mouseenter", handleHover);
    };
  }, [disabled, onHover, onPress, onPressEnd, onPressStart]);

  return createElement(
    "a-entity",
    {
      ref,
      className: disabled ? "" : "clickable",
      "data-testid": testId,
      position
    },
    createElement("a-box", {
      depth: "0.055",
      height: "0.12",
      material: material(DEEP, 0.42, 0.05),
      position: "0 -0.012 -0.038",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.055",
      height: "0.12",
      material: material(disabled ? "#42394e" : color, disabled ? 0.28 : 0.82, disabled ? 0.08 : 0.46),
      width: String(width)
    }),
    createElement("a-plane", {
      height: "0.014",
      material: material(WHITE, disabled ? 0.08 : 0.34, 0.2),
      position: "0 0.046 0.032",
      width: String(Math.max(0.02, width - 0.06))
    }),
    createElement("a-text", {
      ...textProps(label, disabled ? "#817894" : WHITE, 1.5),
      position: "0 -0.014 0.036",
      scale: "0.14 0.14 0.14"
    }),
    children
  );
}

function GlassPanel({
  children,
  height,
  testId,
  width
}: {
  children?: ReactNode;
  height: number;
  testId: string;
  width: number;
}) {
  return createElement(
    "a-entity",
    {
      "data-testid": testId
    },
    createElement("a-box", {
      depth: "0.05",
      height: String(height),
      material: material(DEEP, 0.36, 0.07),
      position: "0 -0.025 -0.052",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.04",
      height: String(height),
      material: material(PANEL, 0.76, 0.28),
      width: String(width)
    }),
    createElement("a-plane", {
      height: String(Math.max(0.04, height - 0.08)),
      material: material("#ffffff", 0.06, 0.02),
      position: "0 0 0.028",
      width: String(Math.max(0.04, width - 0.1))
    }),
    createElement("a-plane", {
      height: "0.012",
      material: material(CYAN, 0.92, 0.72),
      position: `0 ${height / 2 - 0.02} 0.033`,
      width: String(width - 0.12)
    }),
    createElement("a-plane", {
      height: "0.01",
      material: material(MAGENTA, 0.76, 0.58),
      position: `0 ${-height / 2 + 0.02} 0.033`,
      width: String(width - 0.16)
    }),
    children
  );
}

function ViewingLayer({ fov, gazeMode, locked }: { fov: number; gazeMode: GazeMode; locked: boolean }) {
  const status = gazeMode === "head" ? "HEAD GAZE BIND" : gazeMode === "ray" ? "RAY BIND" : locked ? "LOCKED" : "READY";

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-workbench-viewing-layer",
      position: "0 1.58 -1.92"
    },
    createElement("a-ring", {
      material: material(gazeMode === "idle" ? WHITE : ORANGE, 0.82, 0.62),
      radiusInner: "0.16",
      radiusOuter: "0.18"
    }),
    createElement("a-ring", {
      material: material(gazeMode === "idle" ? CYAN : ORANGE, 0.58, 0.48),
      radiusInner: "0.36",
      radiusOuter: "0.372"
    }),
    createElement("a-plane", {
      height: "0.006",
      material: material(WHITE, 0.76, 0.48),
      width: "0.82"
    }),
    createElement("a-plane", {
      height: "0.28",
      material: material(WHITE, 0.07, 0.02),
      width: "0.5"
    }),
    createElement("a-text", {
      ...textProps(`${status} / FOV ${fov}`, ORANGE, 2.2),
      position: "0 -0.32 0.02",
      scale: "0.11 0.11 0.11"
    })
  );
}

function PlayerVerticalPanel({
  hidden,
  onToggleHidden,
  playing,
  progress,
  onTogglePlay
}: {
  hidden: boolean;
  onToggleHidden: () => void;
  onTogglePlay: () => void;
  playing: boolean;
  progress: number;
}) {
  if (hidden) {
    return createElement(SpatialButton, {
      color: CYAN,
      label: "SHOW UI",
      onPress: onToggleHidden,
      position: "-1.05 1.05 -1.78",
      testId: "quest-workbench-show-player",
      width: 0.42
    });
  }

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-workbench-player-panel",
      position: "-1.08 1.38 -1.72",
      rotation: "0 14 0"
    },
    createElement(
      GlassPanel,
      {
        height: 1.18,
        testId: "quest-workbench-player-glass",
        width: 0.82
      },
      createElement("a-text", {
        ...textProps("> PLAYBACK", CYAN, 1.5),
        align: "left",
        position: "-0.34 0.5 0.045",
        scale: "0.12 0.12 0.12"
      }),
      createElement("a-text", {
        ...textProps("Ridge flight 360\n0:42 / 3:05\n1.0x / live mock", WHITE, 1.8),
        align: "left",
        position: "-0.34 0.33 0.045",
        scale: "0.105 0.105 0.105"
      }),
      createElement(SpatialButton, {
        color: playing ? ORANGE : CYAN,
        label: playing ? "PAUSE" : "PLAY",
        onPress: onTogglePlay,
        position: "-0.18 0.06 0.06",
        testId: "quest-workbench-player-play",
        width: 0.28
      }),
      createElement(SpatialButton, {
        color: MAGENTA,
        label: "LIST",
        onPress: () => undefined,
        position: "0.18 0.06 0.06",
        testId: "quest-workbench-player-list",
        width: 0.28
      }),
      createElement("a-plane", {
        height: "0.42",
        material: material(DEEP, 0.46, 0.08),
        position: "0 -0.24 0.044",
        width: "0.62"
      }),
      createElement("a-plane", {
        height: String(Math.max(0.04, progress * 0.42)),
        material: material(CYAN, 0.82, 0.64),
        position: `0 ${-0.45 + progress * 0.21} 0.055`,
        width: "0.075"
      }),
      createElement("a-text", {
        ...textProps("seek\nbar", MUTED, 1),
        position: "0.16 -0.25 0.06",
        scale: "0.08 0.08 0.08"
      }),
      createElement(SpatialButton, {
        color: DANGER,
        label: "HIDE",
        onPress: onToggleHidden,
        position: "0 -0.5 0.06",
        testId: "quest-workbench-player-hide",
        width: 0.3
      })
    )
  );
}

function ExtensionPanel({
  activeModule,
  effectPage,
  fov,
  onClose,
  onEffectPage,
  onFovIn,
  onFovOut
}: {
  activeModule: WorkbenchModule;
  effectPage: number;
  fov: number;
  onClose: () => void;
  onEffectPage: (page: number) => void;
  onFovIn: () => void;
  onFovOut: () => void;
}) {
  if (!activeModule) {
    return null;
  }

  const body =
    activeModule === "effects"
      ? effectPage === 0
        ? "Page 1 / black, fade, flash\nRelease chooses the current effect."
        : "Page 2 / LUT, marker, caption\nFixed pager, no layout shift."
      : activeModule === "fov"
        ? `Current FOV ${fov}\nThumbstick or panel adjusts it.`
        : activeModule === "framing"
          ? "Trigger hold: head-gaze bind\nGrip hold: controller ray bind"
          : activeModule === "export"
            ? "Preview export queue\nKeeps backend protocol unchanged."
            : "videoId / sessionId / take history\nRestore is a low-frequency action.";

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-workbench-extension-panel",
      position: "0 0.48 -0.24",
      rotation: "-45 0 0"
    },
    createElement(
      GlassPanel,
      {
        height: 0.66,
        testId: "quest-workbench-extension-glass",
        width: 1.7
      },
      createElement("a-text", {
        ...textProps(moduleTitle(activeModule), ORANGE, 2.6),
        align: "left",
        position: "-0.72 0.24 0.045",
        scale: "0.13 0.13 0.13"
      }),
      createElement("a-text", {
        ...textProps(body, WHITE, 2.8),
        align: "left",
        position: "-0.72 0.06 0.045",
        scale: "0.1 0.1 0.1"
      }),
      activeModule === "fov"
        ? createElement(
            "a-entity",
            null,
            createElement(SpatialButton, {
              color: MAGENTA,
              label: "FOV-",
              onPress: onFovOut,
              position: "-0.36 -0.22 0.06",
              testId: "quest-workbench-extension-fov-out",
              width: 0.28
            }),
            createElement(SpatialButton, {
              color: CYAN,
              label: "FOV+",
              onPress: onFovIn,
              position: "0 -0.22 0.06",
              testId: "quest-workbench-extension-fov-in",
              width: 0.28
            })
          )
        : null,
      activeModule === "effects"
        ? createElement(
            "a-entity",
            null,
            createElement(SpatialButton, {
              color: effectPage === 0 ? "#42394e" : MAGENTA,
              disabled: effectPage === 0,
              label: "PREV",
              onPress: () => onEffectPage(0),
              position: "-0.52 -0.22 0.06",
              testId: "quest-workbench-effects-prev",
              width: 0.28
            }),
            createElement(SpatialButton, {
              color: effectPage === 1 ? "#42394e" : CYAN,
              disabled: effectPage === 1,
              label: "NEXT",
              onPress: () => onEffectPage(1),
              position: "-0.18 -0.22 0.06",
              testId: "quest-workbench-effects-next",
              width: 0.28
            }),
            createElement(SpatialButton, {
              color: ORANGE,
              label: effectPage === 0 ? "FADE" : "MARK",
              onPress: () => undefined,
              position: "0.24 -0.22 0.06",
              testId: "quest-workbench-effects-choose",
              width: 0.34
            })
          )
        : null,
      createElement(SpatialButton, {
        color: DANGER,
        label: "CLOSE",
        onPress: onClose,
        position: "0.58 -0.22 0.06",
        testId: "quest-workbench-extension-close",
        width: 0.32
      })
    )
  );
}

function WorkbenchDeck({
  activeModule,
  effectPage,
  fov,
  locked,
  onCloseModule,
  onCut,
  onEffectPage,
  onFovIn,
  onFovOut,
  onOpenModule,
  onSave,
  onToggleLock
}: {
  activeModule: WorkbenchModule;
  effectPage: number;
  fov: number;
  locked: boolean;
  onCloseModule: () => void;
  onCut: () => void;
  onEffectPage: (page: number) => void;
  onFovIn: () => void;
  onFovOut: () => void;
  onOpenModule: (module: WorkbenchModule) => void;
  onSave: () => void;
  onToggleLock: () => void;
}) {
  return createElement(
    "a-entity",
    {
      "data-testid": "quest-workbench-horizontal-deck",
      position: "0 0.72 -1.18",
      rotation: "-62 0 0"
    },
    createElement(
      GlassPanel,
      {
        height: 0.74,
        testId: "quest-workbench-deck-glass",
        width: 2.55
      },
      createElement("a-text", {
        ...textProps("QUEST EDIT DESK // one to two clicks", CYAN, 3.6),
        position: "0 0.28 0.045",
        scale: "0.11 0.11 0.11"
      }),
      createElement(SpatialButton, {
        color: activeModule === "framing" ? ORANGE : CYAN,
        label: "FRAME",
        onPress: () => onOpenModule("framing"),
        position: "-0.96 0.08 0.06",
        testId: "quest-workbench-module-framing",
        width: 0.3
      }),
      createElement(SpatialButton, {
        color: ORANGE,
        label: "CUT",
        onPress: onCut,
        position: "-0.58 0.08 0.06",
        testId: "quest-workbench-cut",
        width: 0.28
      }),
      createElement(SpatialButton, {
        color: activeModule === "fov" ? ORANGE : MAGENTA,
        label: "FOV",
        onPress: () => onOpenModule("fov"),
        position: "-0.22 0.08 0.06",
        testId: "quest-workbench-module-fov",
        width: 0.28
      }),
      createElement(SpatialButton, {
        color: locked ? ORANGE : CYAN,
        label: locked ? "UNLOCK" : "LOCK",
        onPress: onToggleLock,
        position: "0.16 0.08 0.06",
        testId: "quest-workbench-lock",
        width: 0.34
      }),
      createElement(SpatialButton, {
        color: CYAN,
        label: "SAVE",
        onPress: onSave,
        position: "0.58 0.08 0.06",
        testId: "quest-workbench-save",
        width: 0.28
      }),
      createElement(SpatialButton, {
        color: activeModule === "effects" ? ORANGE : MAGENTA,
        label: "FX",
        onPress: () => onOpenModule("effects"),
        position: "0.94 0.08 0.06",
        testId: "quest-workbench-module-effects",
        width: 0.26
      }),
      createElement(SpatialButton, {
        color: activeModule === "export" ? ORANGE : CYAN,
        label: "EXPORT",
        onPress: () => onOpenModule("export"),
        position: "-0.56 -0.16 0.06",
        testId: "quest-workbench-module-export",
        width: 0.34
      }),
      createElement(SpatialButton, {
        color: activeModule === "session" ? ORANGE : CYAN,
        label: "SESSION",
        onPress: () => onOpenModule("session"),
        position: "-0.14 -0.16 0.06",
        testId: "quest-workbench-module-session",
        width: 0.38
      }),
      createElement(SpatialButton, {
        color: DANGER,
        label: "DROP",
        onPress: () => undefined,
        position: "0.3 -0.16 0.06",
        testId: "quest-workbench-discard",
        width: 0.3
      }),
      createElement(SpatialButton, {
        color: CYAN,
        label: "RESTORE",
        onPress: () => undefined,
        position: "0.72 -0.16 0.06",
        testId: "quest-workbench-restore",
        width: 0.36
      }),
      createElement(ExtensionPanel, {
        activeModule,
        effectPage,
        fov,
        onClose: onCloseModule,
        onEffectPage,
        onFovIn,
        onFovOut
      })
    )
  );
}

function RadialWheel({
  highlighted,
  open,
  onCancel,
  onCommit,
  onHighlight,
  onOpen
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
      "data-testid": "quest-workbench-radial-root",
      position: "0.92 1.08 -1.38",
      rotation: "0 -18 0"
    },
    open
      ? createElement(
          "a-entity",
          {
            "data-testid": "quest-workbench-radial-wheel"
          },
          createElement("a-ring", {
            material: material(PANEL_SOFT, 0.64, 0.26),
            radiusInner: "0.22",
            radiusOuter: "0.46"
          }),
          createElement("a-text", {
            ...textProps(highlighted ? `RELEASE ${highlighted.toUpperCase()}` : "MOVE / RELEASE", ORANGE, 1.5),
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
              testId: `quest-workbench-radial-${action.id}`,
              width: action.id === "hideUi" ? 0.28 : 0.24
            })
          ),
          createElement(SpatialButton, {
            color: DANGER,
            label: "CANCEL",
            onPress: onCancel,
            position: "0 -0.68 0.04",
            testId: "quest-workbench-radial-cancel",
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
      testId: "quest-workbench-radial-open",
      width: 0.42
    })
  );
}

export function AFrameQuestSpatialWorkbenchLab() {
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const rightControllerRef = useRef<HTMLElement | null>(null);
  const leftControllerRef = useRef<HTMLElement | null>(null);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  const [activeModule, setActiveModule] = useState<WorkbenchModule>("effects");
  const [effectPage, setEffectPage] = useState(0);
  const [entryStatus, setEntryStatus] = useState("Loading A-Frame spatial workbench...");
  const [fov, setFov] = useState(82);
  const [gazeMode, setGazeMode] = useState<GazeMode>("idle");
  const [lastAction, setLastAction] = useState("Point at the desk, open a module, or hold A for the quick wheel.");
  const [locked, setLocked] = useState(false);
  const [playerHidden, setPlayerHidden] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [radialHighlighted, setRadialHighlighted] = useState<RadialAction | null>(null);
  const [radialOpen, setRadialOpen] = useState(false);
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [vrSupported, setVrSupported] = useState<"checking" | "supported" | "unsupported">("checking");

  const progress = useMemo(() => (playing ? 0.38 : 0.32), [playing]);

  useEffect(() => {
    let cancelled = false;
    const xr = getNavigatorXr();

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
              ? "WebXR is ready. Enter VR to inspect the multi-surface desk."
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
    function fovIn() {
      setFov((value) => Math.min(112, value + 4));
      setLastAction("FOV increased from controller input.");
    }

    function fovOut() {
      setFov((value) => Math.max(48, value - 4));
      setLastAction("FOV decreased from controller input.");
    }

    function triggerDown() {
      setGazeMode("head");
      setLastAction("Trigger held: viewfinder follows head gaze.");
    }

    function triggerUp() {
      setGazeMode("idle");
      setLocked(true);
      setLastAction("Trigger released: head-gaze framing locked and patch would flush.");
    }

    function gripDown() {
      setGazeMode("ray");
      setLastAction("Grip held: viewfinder follows controller ray.");
    }

    function gripUp() {
      setGazeMode("idle");
      setLocked(true);
      setLastAction("Grip released: ray framing locked.");
    }

    function openWheel() {
      setRadialOpen(true);
      setLastAction("Quick wheel open. Move to an option, release to commit.");
    }

    function closeWheel() {
      setRadialOpen(false);
      setRadialHighlighted(null);
      setActiveModule(null);
      setLastAction("B pressed: overlays closed.");
    }

    function thumbstick(event: Event) {
      const detail = (event as CustomEvent<{ y?: number; x?: number }>).detail;
      const y = detail?.y ?? 0;
      const x = detail?.x ?? 0;

      if (y < -0.55) {
        fovOut();
      } else if (y > 0.55) {
        fovIn();
      } else if (Math.abs(x) > 0.55) {
        setLastAction(x > 0 ? "Thumbstick right: playback rate up." : "Thumbstick left: playback rate down.");
      }
    }

    function keydown(event: KeyboardEvent) {
      if (event.code === "Space") {
        setPlaying((value) => !value);
      } else if (event.key.toLowerCase() === "a") {
        openWheel();
      } else if (event.key.toLowerCase() === "b" || event.key === "Escape") {
        closeWheel();
      } else if (event.key === "[") {
        fovOut();
      } else if (event.key === "]") {
        fovIn();
      } else if (event.key.toLowerCase() === "t") {
        triggerDown();
      } else if (event.key.toLowerCase() === "g") {
        gripDown();
      }
    }

    function keyup(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "t") {
        triggerUp();
      } else if (event.key.toLowerCase() === "g") {
        gripUp();
      }
    }

    const controllers = [rightControllerRef.current, leftControllerRef.current].filter(Boolean) as HTMLElement[];
    controllers.forEach((controller) => {
      controller.addEventListener("triggerdown", triggerDown);
      controller.addEventListener("triggerup", triggerUp);
      controller.addEventListener("gripdown", gripDown);
      controller.addEventListener("gripup", gripUp);
      controller.addEventListener("abuttondown", openWheel);
      controller.addEventListener("thumbstickdown", openWheel);
      controller.addEventListener("bbuttondown", closeWheel);
      controller.addEventListener("thumbstickmoved", thumbstick);
    });
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);

    return () => {
      controllers.forEach((controller) => {
        controller.removeEventListener("triggerdown", triggerDown);
        controller.removeEventListener("triggerup", triggerUp);
        controller.removeEventListener("gripdown", gripDown);
        controller.removeEventListener("gripup", gripUp);
        controller.removeEventListener("abuttondown", openWheel);
        controller.removeEventListener("thumbstickdown", openWheel);
        controller.removeEventListener("bbuttondown", closeWheel);
        controller.removeEventListener("thumbstickmoved", thumbstick);
      });
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
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
          : "VR session running. Use Trigger, Grip, A, B, and thumbstick."
      );
    } catch (error) {
      setEntryStatus(error instanceof Error ? error.message : "Failed to enter VR.");
    }
  }

  function commitRadial(action: RadialAction) {
    setRadialOpen(false);
    setRadialHighlighted(null);
    setLastAction(applyRadialActionLabel(action));

    if (action === "lock") {
      setLocked((value) => !value);
    } else if (action === "fovIn") {
      setFov((value) => Math.min(112, value + 4));
    } else if (action === "fovOut") {
      setFov((value) => Math.max(48, value - 4));
    } else if (action === "hideUi") {
      setPlayerHidden((value) => !value);
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
    <main className="quest-workbench-lab-page">
      <section className="quest-workbench-lab-stage" data-testid="quest-workbench-lab">
        {!aframeReady ? <div className="quest-workbench-lab-message">Loading A-Frame quest workbench...</div> : null}
        <div className="quest-workbench-lab-hud" data-testid="quest-workbench-lab-hud">
          <div>
            <p className="muted">Meta Quest WebXR Lab</p>
            <h1>空间剪辑工作台</h1>
          </div>
          <p data-testid="quest-workbench-status">{entryStatus}</p>
          <div className="quest-workbench-lab-actions">
            <button className="button primary" data-testid="quest-workbench-enter-vr" onClick={() => void enterVr()} type="button">
              {rendererPresenting ? "VR Running" : "Enter VR"}
            </button>
            <a className="button" href="/xr/workbench">
              Old Workbench
            </a>
            <a className="button" href="/xr/videos">
              Videos
            </a>
          </div>
          <div className="quest-workbench-lab-status-line">
            <span>immersive-vr: {vrSupported}</span>
            <span>module: {moduleTitle(activeModule)}</span>
            <span>gaze: {gazeMode}</span>
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
                assetId: "quest-workbench-sky"
              }),
              createElement("a-entity", {
                light: "type: ambient; color: #eaf7ff; intensity: 0.52"
              }),
              createElement("a-entity", {
                light: `type: point; color: ${CYAN}; intensity: 0.82; distance: 5`,
                position: "-1.4 1.8 -1.2"
              }),
              createElement("a-entity", {
                light: `type: point; color: ${MAGENTA}; intensity: 0.72; distance: 5`,
                position: "1.4 1.35 -1.5"
              }),
              createElement("a-entity", {
                geometry: "primitive: torus; radius: 3.4; radiusTubular: 0.004; segmentsTubular: 8",
                material: material(CYAN, 0.18, 0.2),
                position: "0 0 -2.2",
                rotation: "90 0 0"
              }),
              createElement(ViewingLayer, {
                fov,
                gazeMode,
                locked
              }),
              createElement(PlayerVerticalPanel, {
                hidden: playerHidden,
                onToggleHidden: () => {
                  setPlayerHidden((value) => !value);
                  setLastAction(playerHidden ? "Player UI shown." : "Player UI hidden.");
                },
                onTogglePlay: () => {
                  setPlaying((value) => !value);
                  setLastAction(playing ? "Playback paused." : "Playback resumed.");
                },
                playing,
                progress
              }),
              createElement(WorkbenchDeck, {
                activeModule,
                effectPage,
                fov,
                locked,
                onCloseModule: () => {
                  setActiveModule(null);
                  setLastAction("Extension panel closed.");
                },
                onCut: () => setLastAction("Cut marker inserted from desk button."),
                onEffectPage: setEffectPage,
                onFovIn: () => {
                  setFov((value) => Math.min(112, value + 4));
                  setLastAction("FOV increased from extension panel.");
                },
                onFovOut: () => {
                  setFov((value) => Math.max(48, value - 4));
                  setLastAction("FOV decreased from extension panel.");
                },
                onOpenModule: (module) => {
                  setActiveModule(module);
                  setLastAction(`${moduleTitle(module)} module opened.`);
                },
                onSave: () => setLastAction("Save pressed: ViewPathPatch would flush."),
                onToggleLock: () => {
                  setLocked((value) => !value);
                  setLastAction(locked ? "Viewfinder unlocked." : "Viewfinder locked.");
                }
              }),
              createElement(RadialWheel, {
                highlighted: radialHighlighted,
                onCancel: () => {
                  setRadialOpen(false);
                  setRadialHighlighted(null);
                  setLastAction("Quick wheel canceled.");
                },
                onCommit: commitRadial,
                onHighlight: setRadialHighlighted,
                onOpen: () => {
                  setRadialOpen(true);
                  setLastAction("Quick wheel open. Hover an action and release.");
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
                line: `color: ${CYAN}; opacity: 0.72`,
                raycaster: "objects: .clickable; far: 8"
              }),
              createElement(
                "a-camera",
                {
                  camera: "fov: 72",
                  position: "0 1.6 0",
                  "look-controls": "enabled: true"
                },
                createElement("a-cursor", {
                  color: WHITE,
                  fuse: "false",
                  opacity: "0.7",
                  raycaster: "objects: .clickable"
                })
              )
            )
          : null}
        <span className="quest-workbench-lab-test-state" data-testid="quest-workbench-last-action">
          {lastAction}
        </span>
      </section>
    </main>
  );
}
