"use client";

import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { patchAFrameSceneXrBindingFallback, requestAFrameMetaVrSession } from "./aframeXrCompat";
import { useAFrameRuntime } from "./useAFrameRuntime";

type WorkbenchModule = "clip" | "mask" | "effects" | "audio" | "export" | "session" | null;
type FxItem = "black" | "flash" | "blur" | "hit" | "caption" | "privacy" | "slowmo" | "grade";

type AFrameSceneElement = HTMLElement & {
  is?: (state: string) => boolean;
  renderer?: {
    xr?: {
      isPresenting?: boolean;
    };
  };
};

type SpatialButtonProps = {
  color?: string;
  disabled?: boolean;
  label: string;
  onHover?: () => void;
  onPress: () => void;
  onPressEnd?: () => void;
  onPressStart?: () => void;
  position: string;
  subtitle?: string;
  testId: string;
  width?: number;
};

const CYAN = "#35f7ff";
const GREEN = "#7dff9f";
const MAGENTA = "#ff4fd8";
const ORANGE = "#ffb347";
const RED = "#ff5b75";
const WHITE = "#f5ffff";
const PANEL = "#111827";
const PANEL_DARK = "#060914";
const BLUE = "#355cff";
const MUTED = "#9fb8c7";

const modules: Array<{ id: Exclude<WorkbenchModule, null>; label: string; color: string }> = [
  { id: "clip", label: "CLIP", color: ORANGE },
  { id: "mask", label: "MASK", color: CYAN },
  { id: "effects", label: "FX", color: MAGENTA },
  { id: "audio", label: "AUDIO", color: GREEN },
  { id: "export", label: "EXPORT", color: BLUE },
  { id: "session", label: "SESSION", color: WHITE }
];

const fxItems: Array<{ id: FxItem; label: string; position: string; color: string }> = [
  { id: "black", label: "BLACK", position: "0 0.34 0.05", color: PANEL_DARK },
  { id: "flash", label: "FLASH", position: "0.31 0.22 0.05", color: WHITE },
  { id: "blur", label: "BLUR", position: "0.36 -0.02 0.05", color: CYAN },
  { id: "hit", label: "HIT", position: "0.23 -0.28 0.05", color: ORANGE },
  { id: "caption", label: "TEXT", position: "-0.06 -0.36 0.05", color: GREEN },
  { id: "privacy", label: "MASK", position: "-0.34 -0.18 0.05", color: RED },
  { id: "slowmo", label: "SLOW", position: "-0.34 0.1 0.05", color: BLUE },
  { id: "grade", label: "GRADE", position: "-0.17 0.31 0.05", color: MAGENTA }
];

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: XRSystem }).xr;
}

function material(color: string, opacity = 0.82, emissiveIntensity = 0.18) {
  return `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: ${emissiveIntensity}; metalness: 0.05; roughness: 0.42; opacity: ${opacity}; transparent: true`;
}

function textProps(value: string, color = WHITE, width = 2) {
  return {
    align: "center",
    color,
    material: `shader: msdf; emissive: ${color}; emissiveIntensity: 0.45`,
    value,
    width: String(width)
  };
}

function moduleTitle(module: WorkbenchModule) {
  if (module === "clip") return "CLIP RANGE";
  if (module === "mask") return "MASK CONTROL";
  if (module === "effects") return "MORE EFFECTS";
  if (module === "audio") return "AUDIO MIX";
  if (module === "export") return "EXPORT";
  if (module === "session") return "SESSION";
  return "WORK DESK";
}

function SpatialButton({
  color = CYAN,
  disabled = false,
  label,
  onHover,
  onPress,
  onPressEnd,
  onPressStart,
  position,
  subtitle,
  testId,
  width = 0.34
}: SpatialButtonProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    const current = el;
    let restoreTimer: number | null = null;

    function setHover(active: boolean) {
      current.setAttribute(
        "animation__hover",
        `property: scale; to: ${active ? "1.06 1.06 1.06" : "1 1 1"}; dur: 90; easing: easeOutQuad`
      );
      current.setAttribute("data-hovered", active ? "true" : "false");
    }

    function pressVisual() {
      current.setAttribute("animation__press", "property: scale; to: 0.96 0.9 0.96; dur: 55; easing: easeOutQuad");
      if (restoreTimer) window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => setHover(true), 120);
    }

    function handleEnter(event: Event) {
      event.stopPropagation();
      setHover(true);
      onHover?.();
    }

    function handleLeave(event: Event) {
      event.stopPropagation();
      setHover(false);
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

    function handleClick(event: Event) {
      event.stopPropagation();
      pressVisual();
      onPress();
    }

    current.addEventListener("mouseenter", handleEnter);
    current.addEventListener("mouseleave", handleLeave);
    current.addEventListener("mousedown", handleDown);
    current.addEventListener("mouseup", handleUp);
    current.addEventListener("click", handleClick);

    return () => {
      if (restoreTimer) window.clearTimeout(restoreTimer);
      current.removeEventListener("mouseenter", handleEnter);
      current.removeEventListener("mouseleave", handleLeave);
      current.removeEventListener("mousedown", handleDown);
      current.removeEventListener("mouseup", handleUp);
      current.removeEventListener("click", handleClick);
    };
  }, [disabled, onHover, onPress, onPressEnd, onPressStart]);

  const buttonColor = disabled ? "#334155" : color;

  return createElement(
    "a-entity",
    {
      ref,
      className: disabled ? "" : "xr-clickable",
      "data-testid": testId,
      position
    },
    createElement("a-box", {
      depth: "0.055",
      height: "0.13",
      material: material(PANEL_DARK, 0.48, 0.02),
      position: "0 -0.016 -0.038",
      width: String(width + 0.04)
    }),
    createElement("a-box", {
      depth: "0.05",
      height: "0.13",
      material: material(buttonColor, disabled ? 0.24 : 0.84, disabled ? 0.02 : 0.34),
      width: String(width)
    }),
    createElement("a-plane", {
      height: "0.014",
      material: material(WHITE, disabled ? 0.08 : 0.4, 0.16),
      position: "0 0.048 0.03",
      width: String(width - 0.06)
    }),
    createElement("a-text", {
      ...textProps(label, disabled ? MUTED : WHITE, 1.6),
      position: subtitle ? "0 0.004 0.034" : "0 -0.018 0.034",
      scale: "0.13 0.13 0.13"
    }),
    subtitle
      ? createElement("a-text", {
          ...textProps(subtitle, disabled ? MUTED : "#dffcff", 1.7),
          position: "0 -0.042 0.034",
          scale: "0.07 0.07 0.07"
        })
      : null
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
      depth: "0.055",
      height: String(height),
      material: material("#030712", 0.5, 0.02),
      position: "0 -0.028 -0.052",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.035",
      height: String(height),
      material: material(PANEL, 0.72, 0.08),
      width: String(width)
    }),
    createElement("a-plane", {
      height: String(height - 0.08),
      material: material("#ffffff", 0.055, 0.01),
      position: "0 0 0.024",
      width: String(width - 0.1)
    }),
    createElement("a-plane", {
      height: "0.01",
      material: material(CYAN, 0.86, 0.64),
      position: `0 ${height / 2 - 0.026} 0.034`,
      width: String(width - 0.14)
    }),
    createElement("a-plane", {
      height: "0.01",
      material: material(MAGENTA, 0.72, 0.5),
      position: `0 ${-height / 2 + 0.026} 0.034`,
      width: String(width - 0.18)
    }),
    children
  );
}

function ViewingLayer({ fov, maskMode }: { fov: number; maskMode: string }) {
  return createElement(
    "a-entity",
    {
      "data-testid": "quest-editor-prototype-view-layer",
      position: "0 1.58 -2.08"
    },
    createElement("a-ring", {
      material: material(WHITE, 0.52, 0.36),
      radiusInner: "0.195",
      radiusOuter: "0.208"
    }),
    createElement("a-ring", {
      material: material(CYAN, 0.42, 0.32),
      radiusInner: "0.34",
      radiusOuter: "0.35"
    }),
    createElement("a-plane", {
      height: "0.31",
      material: material("#000000", 0.16, 0.01),
      width: "0.56"
    }),
    createElement("a-plane", {
      height: "0.008",
      material: material(WHITE, 0.72, 0.36),
      width: "0.92"
    }),
    createElement("a-plane", {
      height: "0.46",
      material: material("#b8d6ff", 0.045, 0.01),
      position: "0 0 0.006",
      width: "0.82"
    }),
    createElement("a-text", {
      ...textProps(`MASK ${maskMode} / FOV ${fov}`, ORANGE, 2.8),
      position: "0 -0.38 0.03",
      scale: "0.105 0.105 0.105"
    }),
    createElement("a-text", {
      ...textProps("360 video remains the first viewport signal", MUTED, 2.8),
      position: "0 -0.5 0.03",
      scale: "0.075 0.075 0.075"
    })
  );
}

function PlaybackPanel({
  hidden,
  onToggle,
  playing,
  progress,
  onPlay
}: {
  hidden: boolean;
  onPlay: () => void;
  onToggle: () => void;
  playing: boolean;
  progress: number;
}) {
  if (hidden) {
    return createElement(SpatialButton, {
      color: CYAN,
      label: "SHOW",
      onPress: onToggle,
      position: "-1.08 1.1 -1.76",
      subtitle: "UI",
      testId: "quest-editor-prototype-show-ui",
      width: 0.32
    });
  }

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-editor-prototype-playback-panel",
      position: "-1.08 1.36 -1.72",
      rotation: "0 16 0"
    },
    createElement(
      GlassPanel,
      {
        height: 1.08,
        testId: "quest-editor-prototype-playback-glass",
        width: 0.78
      },
      createElement("a-text", {
        ...textProps("PLAYBACK", CYAN, 1.4),
        align: "left",
        position: "-0.31 0.46 0.045",
        scale: "0.115 0.115 0.115"
      }),
      createElement("a-text", {
        ...textProps("sample 360 clip\n0:08 / 0:42\nlive path preview", WHITE, 1.5),
        align: "left",
        position: "-0.31 0.28 0.045",
        scale: "0.084 0.084 0.084"
      }),
      createElement(SpatialButton, {
        color: playing ? ORANGE : GREEN,
        label: playing ? "PAUSE" : "PLAY",
        onPress: onPlay,
        position: "-0.18 0.03 0.055",
        testId: "quest-editor-prototype-play",
        width: 0.28
      }),
      createElement(SpatialButton, {
        color: BLUE,
        label: "LIST",
        onPress: () => undefined,
        position: "0.17 0.03 0.055",
        testId: "quest-editor-prototype-list",
        width: 0.28
      }),
      createElement("a-box", {
        depth: "0.018",
        height: "0.38",
        material: material(PANEL_DARK, 0.45, 0.02),
        position: "0 -0.26 0.046",
        width: "0.58"
      }),
      createElement("a-plane", {
        height: "0.038",
        material: material(CYAN, 0.85, 0.56),
        position: `${-0.27 + progress * 0.54} -0.26 0.06`,
        width: "0.05"
      }),
      createElement("a-text", {
        ...textProps("timeline scrub placeholder", MUTED, 1.5),
        position: "0 -0.49 0.05",
        scale: "0.065 0.065 0.065"
      }),
      createElement(SpatialButton, {
        color: RED,
        label: "HIDE",
        onPress: onToggle,
        position: "0 -0.39 0.055",
        testId: "quest-editor-prototype-hide-ui",
        width: 0.28
      })
    )
  );
}

function ExtensionPanel({
  activeModule,
  onClose,
  onFovChange,
  sliderValue
}: {
  activeModule: WorkbenchModule;
  onClose: () => void;
  onFovChange: (delta: number) => void;
  sliderValue: number;
}) {
  if (!activeModule) return null;

  const details = {
    audio: "Volume, ducking, fade and audio-hit markers.\nFocused slider + Left Grip + Right Stick.",
    clip: "Start and End are clear desk actions.\nThey should not consume scarce controller buttons.",
    effects: "More effects live here.\nQuick FX stays on A-hold radial.",
    export: "Export queue, render status and recent files.\nLow-frequency and panel-first.",
    mask: "Point move, drag move, ray-follow and FOV.\nMask remains the core interaction.",
    session: "videoId, sessionId, take history and restore.\nNever blocks the center view."
  } satisfies Record<Exclude<WorkbenchModule, null>, string>;

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-editor-prototype-extension-panel",
      position: "0 0.5 -0.26",
      rotation: "-45 0 0"
    },
    createElement(
      GlassPanel,
      {
        height: 0.72,
        testId: "quest-editor-prototype-extension-glass",
        width: 1.82
      },
      createElement("a-text", {
        ...textProps(moduleTitle(activeModule), ORANGE, 2.5),
        align: "left",
        position: "-0.78 0.27 0.046",
        scale: "0.13 0.13 0.13"
      }),
      createElement("a-text", {
        ...textProps(details[activeModule], WHITE, 2.8),
        align: "left",
        position: "-0.78 0.08 0.046",
        scale: "0.078 0.078 0.078"
      }),
      activeModule === "mask"
        ? createElement(
            "a-entity",
            null,
            createElement(SpatialButton, {
              color: CYAN,
              label: "POINT",
              onPress: () => undefined,
              position: "-0.52 -0.24 0.058",
              subtitle: "MOVE",
              testId: "quest-editor-prototype-mask-point",
              width: 0.28
            }),
            createElement(SpatialButton, {
              color: MAGENTA,
              label: "FOV-",
              onPress: () => onFovChange(-4),
              position: "-0.18 -0.24 0.058",
              testId: "quest-editor-prototype-mask-fov-minus",
              width: 0.28
            }),
            createElement(SpatialButton, {
              color: CYAN,
              label: "FOV+",
              onPress: () => onFovChange(4),
              position: "0.16 -0.24 0.058",
              testId: "quest-editor-prototype-mask-fov-plus",
              width: 0.28
            })
          )
        : null,
      activeModule === "clip"
        ? createElement(
            "a-entity",
            null,
            createElement(SpatialButton, {
              color: GREEN,
              label: "START",
              onPress: () => undefined,
              position: "-0.42 -0.24 0.058",
              subtitle: "CLIP",
              testId: "quest-editor-prototype-start-clip",
              width: 0.32
            }),
            createElement(SpatialButton, {
              color: ORANGE,
              label: "END",
              onPress: () => undefined,
              position: "-0.02 -0.24 0.058",
              subtitle: "CLIP",
              testId: "quest-editor-prototype-end-clip",
              width: 0.32
            })
          )
        : null,
      activeModule === "audio"
        ? createElement(
            "a-entity",
            null,
            createElement("a-plane", {
              height: "0.036",
              material: material(PANEL_DARK, 0.62, 0.02),
              position: "-0.25 -0.24 0.052",
              width: "0.72"
            }),
            createElement("a-plane", {
              height: "0.046",
              material: material(GREEN, 0.9, 0.48),
              position: `${-0.61 + sliderValue * 0.72} -0.24 0.063`,
              width: "0.052"
            }),
            createElement("a-text", {
              ...textProps(`VOL ${Math.round(sliderValue * 100)}%`, GREEN, 1.2),
              position: "0.34 -0.25 0.058",
              scale: "0.078 0.078 0.078"
            })
          )
        : null,
      createElement(SpatialButton, {
        color: RED,
        label: "CLOSE",
        onPress: onClose,
        position: "0.62 -0.24 0.058",
        testId: "quest-editor-prototype-extension-close",
        width: 0.32
      })
    )
  );
}

function WorkDesk({
  activeModule,
  onModule,
  onClose,
  onFovChange,
  sliderValue
}: {
  activeModule: WorkbenchModule;
  onClose: () => void;
  onFovChange: (delta: number) => void;
  onModule: (module: WorkbenchModule) => void;
  sliderValue: number;
}) {
  return createElement(
    "a-entity",
    {
      "data-testid": "quest-editor-prototype-work-desk",
      position: "0 0.72 -1.16",
      rotation: "-62 0 0"
    },
    createElement(
      GlassPanel,
      {
        height: 0.76,
        testId: "quest-editor-prototype-work-desk-glass",
        width: 2.7
      },
      createElement("a-text", {
        ...textProps("SPATIAL EDIT DESK", CYAN, 3.2),
        position: "0 0.29 0.047",
        scale: "0.108 0.108 0.108"
      }),
      modules.map((module, index) =>
        createElement(SpatialButton, {
          color: activeModule === module.id ? ORANGE : module.color,
          key: module.id,
          label: module.label,
          onPress: () => onModule(activeModule === module.id ? null : module.id),
          position: `${-1.04 + index * 0.42} 0.08 0.058`,
          testId: `quest-editor-prototype-module-${module.id}`,
          width: 0.32
        })
      ),
      createElement(SpatialButton, {
        color: GREEN,
        label: "SAVE",
        onPress: () => undefined,
        position: "-0.82 -0.16 0.058",
        subtitle: "PATCH",
        testId: "quest-editor-prototype-save",
        width: 0.34
      }),
      createElement(SpatialButton, {
        color: RED,
        label: "DROP",
        onPress: () => undefined,
        position: "-0.42 -0.16 0.058",
        subtitle: "HOLD",
        testId: "quest-editor-prototype-drop",
        width: 0.34
      }),
      createElement(SpatialButton, {
        color: ORANGE,
        label: "UNDO",
        onPress: () => undefined,
        position: "-0.02 -0.16 0.058",
        testId: "quest-editor-prototype-undo",
        width: 0.32
      }),
      createElement(SpatialButton, {
        color: activeModule ? RED : "#334155",
        disabled: !activeModule,
        label: "CLOSE",
        onPress: onClose,
        position: "0.38 -0.16 0.058",
        testId: "quest-editor-prototype-close-module",
        width: 0.34
      }),
      createElement("a-text", {
        ...textProps("panel opens upward at 45 deg; center view stays clean", MUTED, 3),
        position: "0 -0.31 0.046",
        scale: "0.07 0.07 0.07"
      }),
      createElement(ExtensionPanel, {
        activeModule,
        onClose,
        onFovChange,
        sliderValue
      })
    )
  );
}

function QuickFxMenu({
  highlighted,
  onCommit,
  onHighlight,
  open
}: {
  highlighted: FxItem | null;
  onCommit: (item: FxItem) => void;
  onHighlight: (item: FxItem) => void;
  open: boolean;
}) {
  if (!open) return null;

  return createElement(
    "a-entity",
    {
      "data-testid": "quest-editor-prototype-quick-fx",
      position: "0.94 1.28 -1.5",
      rotation: "0 -24 0"
    },
    createElement(
      GlassPanel,
      {
        height: 0.98,
        testId: "quest-editor-prototype-quick-fx-glass",
        width: 0.98
      },
      createElement("a-text", {
        ...textProps("A-HOLD FX", MAGENTA, 1.6),
        position: "0 0.43 0.046",
        scale: "0.09 0.09 0.09"
      }),
      fxItems.map((item) =>
        createElement(SpatialButton, {
          color: highlighted === item.id ? ORANGE : item.color,
          key: item.id,
          label: item.label,
          onHover: () => onHighlight(item.id),
          onPress: () => onCommit(item.id),
          position: item.position,
          testId: `quest-editor-prototype-fx-${item.id}`,
          width: item.id === "black" ? 0.25 : 0.27
        })
      ),
      createElement("a-text", {
        ...textProps(highlighted ? `release -> ${highlighted}` : "hover with ray, release to commit", WHITE, 1.5),
        position: "0 -0.46 0.046",
        scale: "0.062 0.062 0.062"
      })
    )
  );
}

export function AFrameQuestEditorSpatialUiPrototype() {
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const leftControllerRef = useRef<HTMLElement | null>(null);
  const rightControllerRef = useRef<HTMLElement | null>(null);
  const [activeModule, setActiveModule] = useState<WorkbenchModule>("clip");
  const [entryStatus, setEntryStatus] = useState("Checking immersive-vr support...");
  const [fov, setFov] = useState(82);
  const [fxHighlighted, setFxHighlighted] = useState<FxItem | null>("blur");
  const [fxOpen, setFxOpen] = useState(true);
  const [lastAction, setLastAction] = useState("Prototype ready.");
  const [maskMode, setMaskMode] = useState("POINT");
  const [playing, setPlaying] = useState(true);
  const [playerHidden, setPlayerHidden] = useState(false);
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.64);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  const progress = useMemo(() => 0.32, []);

  useEffect(() => {
    if (!aframeReady || !sceneRef.current) return;
    return patchAFrameSceneXrBindingFallback(sceneRef.current);
  }, [aframeReady]);

  useEffect(() => {
    let cancelled = false;
    const xr = getNavigatorXr();
    if (!xr?.isSessionSupported) {
      setEntryStatus("navigator.xr missing. Open in Quest Browser for immersive mode.");
      return () => {
        cancelled = true;
      };
    }

    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!cancelled) setEntryStatus(supported ? "immersive-vr ready. Enter VR to inspect desk UI." : "immersive-vr unavailable.");
      })
      .catch(() => {
        if (!cancelled) setEntryStatus("immersive-vr support check failed.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function openFx() {
      setFxOpen(true);
      setLastAction("Quick FX opened. Hover item, release to choose.");
    }

    function closeOrCancel() {
      if (fxOpen) {
        setFxOpen(false);
        setLastAction("Quick FX canceled.");
        return;
      }
      if (activeModule) {
        setActiveModule(null);
        setLastAction("Workbench panel closed.");
      }
    }

    function thumbstick(event: Event) {
      const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
      const y = Number(detail?.y ?? 0);
      if (Math.abs(y) < 0.35) return;
      setFov((value) => Math.max(46, Math.min(116, value + (y > 0 ? 3 : -3))));
      setMaskMode("STICK FOV");
      setLastAction("Right thumbstick adjusts mask opening size.");
    }

    const controllers = [leftControllerRef.current, rightControllerRef.current].filter(Boolean) as HTMLElement[];
    controllers.forEach((controller) => {
      controller.addEventListener("abuttondown", openFx);
      controller.addEventListener("thumbstickdown", openFx);
      controller.addEventListener("bbuttondown", closeOrCancel);
      controller.addEventListener("thumbstickmoved", thumbstick);
      controller.addEventListener("gripdown", () => {
        setMaskMode("RAY HOLD");
        setLastAction("Grip hold: mask follows controller ray.");
      });
      controller.addEventListener("gripup", () => {
        setMaskMode("LOCKED");
        setLastAction("Grip release: mask locks and path would flush.");
      });
    });

    function keydown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "a") openFx();
      if (event.key.toLowerCase() === "b") closeOrCancel();
      if (event.key === "ArrowUp") {
        setFov((value) => Math.max(46, value - 3));
        setMaskMode("STICK FOV");
      }
      if (event.key === "ArrowDown") {
        setFov((value) => Math.min(116, value + 3));
        setMaskMode("STICK FOV");
      }
      if (event.key.toLowerCase() === "m") {
        setPlayerHidden((value) => !value);
        setLastAction("Main XR UI toggled.");
      }
    }

    window.addEventListener("keydown", keydown);

    return () => {
      controllers.forEach((controller) => {
        controller.removeEventListener("abuttondown", openFx);
        controller.removeEventListener("thumbstickdown", openFx);
        controller.removeEventListener("bbuttondown", closeOrCancel);
        controller.removeEventListener("thumbstickmoved", thumbstick);
      });
      window.removeEventListener("keydown", keydown);
    };
  }, [activeModule, fxOpen]);

  async function enterVr() {
    const sceneEl = sceneRef.current;
    if (!sceneEl?.renderer?.xr || sceneEl.is?.("vr-mode")) {
      setEntryStatus("A-Frame scene is still loading or already in VR.");
      return;
    }

    try {
      setEntryStatus("Requesting Meta immersive-vr...");
      const { session, usedLegacyLayerFallback } = await requestAFrameMetaVrSession(sceneEl);
      session.addEventListener("end", () => {
        setRendererPresenting(false);
        setEntryStatus("Meta XR session ended.");
      });
      setRendererPresenting(Boolean(sceneEl.renderer.xr.isPresenting));
      setEntryStatus(usedLegacyLayerFallback ? "VR running with XRWebGLLayer fallback." : "VR running. Inspect desk, panels, and ray hover.");
    } catch (error) {
      setEntryStatus(error instanceof Error ? error.message : "Failed to enter Meta VR.");
    }
  }

  if (loadError) {
    return (
      <main className="quest-spatial-ui-prototype-page">
        <div className="quest-spatial-ui-prototype-message" role="alert">
          {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className="quest-spatial-ui-prototype-page">
      <section className="quest-spatial-ui-prototype-stage" data-testid="quest-editor-spatial-ui-prototype">
        {!aframeReady ? <div className="quest-spatial-ui-prototype-message">Loading A-Frame spatial UI...</div> : null}
        <div className="quest-spatial-ui-prototype-hud" data-testid="quest-editor-spatial-ui-hud">
          <div>
            <p>Quest 3 Spatial UI Prototype</p>
            <h1>3D edit desk</h1>
          </div>
          <p data-testid="quest-editor-spatial-ui-status">{entryStatus}</p>
          <div className="quest-spatial-ui-prototype-actions">
            <button data-testid="quest-editor-spatial-ui-enter-vr" onClick={() => void enterVr()} type="button">
              {rendererPresenting ? "VR Running" : "Enter VR"}
            </button>
            <a href="/xr/videos">Videos</a>
            <a href="/xr/quest-workbench-lab">Old Lab</a>
          </div>
          <span>
            module {moduleTitle(activeModule)} / fov {fov} / mask {maskMode}
          </span>
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
                raycaster: "objects: .xr-clickable"
              },
              createElement(
                "a-assets",
                null,
                createElement("img", {
                  crossOrigin: "anonymous",
                  id: "quest-prototype-grid",
                  src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='512' viewBox='0 0 1024 512'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1'%3E%3Cstop stop-color='%23051020'/%3E%3Cstop offset='0.5' stop-color='%23122b3a'/%3E%3Cstop offset='1' stop-color='%23210835'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='1024' height='512'/%3E%3Cg stroke='%2335f7ff' stroke-opacity='.32'%3E%3Cpath d='M0 256h1024M512 0v512' stroke-width='4'/%3E%3Cg stroke-width='1'%3E%3Cpath d='M0 64h1024M0 128h1024M0 192h1024M0 320h1024M0 384h1024M0 448h1024M128 0v512M256 0v512M384 0v512M640 0v512M768 0v512M896 0v512'/%3E%3C/g%3E%3C/g%3E%3Cg fill='%23ffffff' font-family='Arial' font-size='28' opacity='.8'%3E%3Ctext x='448' y='246'%3E360 VIDEO%3C/text%3E%3Ctext x='424' y='286'%3ECENTER TARGET%3C/text%3E%3C/g%3E%3C/svg%3E"
                })
              ),
              createElement("a-sky", {
                color: "#050914",
                src: "#quest-prototype-grid"
              }),
              createElement("a-plane", {
                height: "2.4",
                material: "src: #quest-prototype-grid; opacity: 0.42; transparent: true",
                position: "0 1.55 -2.45",
                width: "4.8"
              }),
              createElement("a-entity", { light: "type: ambient; color: #edfaff; intensity: 0.58" }),
              createElement("a-entity", { light: `type: point; color: ${CYAN}; intensity: 0.92; distance: 5`, position: "-1.4 1.8 -1.2" }),
              createElement("a-entity", { light: `type: point; color: ${MAGENTA}; intensity: 0.78; distance: 5`, position: "1.3 1.24 -1.1" }),
              createElement(ViewingLayer, { fov, maskMode }),
              createElement(PlaybackPanel, {
                hidden: playerHidden,
                onPlay: () => {
                  setPlaying((value) => !value);
                  setLastAction(playing ? "Playback paused." : "Playback resumed.");
                },
                onToggle: () => {
                  setPlayerHidden((value) => !value);
                  setLastAction(playerHidden ? "Player UI shown." : "Player UI hidden.");
                },
                playing,
                progress
              }),
              createElement(WorkDesk, {
                activeModule,
                onClose: () => {
                  setActiveModule(null);
                  setLastAction("45 degree extension panel closed.");
                },
                onFovChange: (delta) => {
                  setFov((value) => Math.max(46, Math.min(116, value + delta)));
                  setMaskMode("PANEL FOV");
                  setLastAction("Mask FOV changed from extension panel.");
                },
                onModule: (module) => {
                  setActiveModule(module);
                  setLastAction(module ? `${moduleTitle(module)} panel opened at 45 degrees.` : "Workbench panel closed.");
                },
                sliderValue
              }),
              createElement(QuickFxMenu, {
                highlighted: fxHighlighted,
                onCommit: (item) => {
                  setFxHighlighted(item);
                  setFxOpen(false);
                  setLastAction(`Quick FX committed: ${item}.`);
                },
                onHighlight: (item) => {
                  setFxHighlighted(item);
                  setLastAction(`Hover FX: ${item}.`);
                },
                open: fxOpen
              }),
              createElement("a-entity", {
                ref: leftControllerRef,
                "laser-controls": "hand: left",
                line: `color: ${WHITE}; opacity: 0.46`,
                raycaster: "objects: .xr-clickable; far: 8"
              }),
              createElement("a-entity", {
                ref: rightControllerRef,
                "laser-controls": "hand: right",
                line: `color: ${CYAN}; opacity: 0.78`,
                raycaster: "objects: .xr-clickable; far: 8"
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
                  raycaster: "objects: .xr-clickable"
                })
              )
            )
          : null}
        <span className="quest-spatial-ui-prototype-last-action" data-testid="quest-editor-spatial-ui-last-action">
          {lastAction}
        </span>
      </section>
    </main>
  );
}
