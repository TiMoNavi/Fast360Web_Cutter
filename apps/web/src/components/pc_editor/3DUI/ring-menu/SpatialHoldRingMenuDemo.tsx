"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  SPATIAL_UI_HIT_ATTRIBUTE,
  flatEmissiveMaterial,
  transparentHitMaterial,
  useSpatialButtonEvents,
  useSpatialRayBlockerEvents,
  type SpatialControlVisualState
} from "../shared/SpatialUiInteraction";

type AFrameEntityElement = HTMLElement & {
  object3D?: {
    lookAt?: (target: { x: number; y: number; z: number }) => void;
    traverse?: (callback: (child: { renderOrder?: number }) => void) => void;
  };
};

type AFrameCameraElement = HTMLElement & {
  object3D?: {
    getWorldPosition?: (target: { x: number; y: number; z: number }) => void;
  };
};

type RingItem = {
  id: string;
  label: string;
  tone: "cyan" | "danger" | "magenta" | "orange" | "white";
};

type RingLevel = {
  id: string;
  items: RingItem[];
  radius: number;
  selectedId: string;
  spreadDeg: number;
};

type RingControlVisualState = SpatialControlVisualState;

type RingInteractionState = {
  clickedItemId?: string | null;
  hoveredItemId?: string | null;
  pressedItemId?: string | null;
};

const COLORS = {
  cyan: "#00ffff",
  danger: "#ff5b8a",
  magenta: "#ff00ff",
  orange: "#ff9900",
  white: "#f7ffff"
};

const TOP_ANGLE = 90;
const ARC_GAP = 7;

const LEVELS: RingLevel[] = [
  {
    id: "root",
    items: [
      { id: "cut", label: "CUT", tone: "orange" },
      { id: "fx", label: "FX", tone: "magenta" },
      { id: "camera", label: "CAM", tone: "cyan" },
      { id: "mask", label: "MASK", tone: "cyan" },
      { id: "play", label: "PLAY", tone: "white" }
    ],
    radius: 0.18,
    selectedId: "fx",
    spreadDeg: 360
  },
  {
    id: "fx",
    items: [
      { id: "flash", label: "FLASH", tone: "orange" },
      { id: "black", label: "BLACK", tone: "danger" },
      { id: "lens", label: "LENS", tone: "magenta" },
      { id: "glitch", label: "GLITCH", tone: "cyan" }
    ],
    radius: 0.18 * 1.5,
    selectedId: "lens",
    spreadDeg: 120
  },
  {
    id: "lens",
    items: [
      { id: "soft", label: "SOFT", tone: "cyan" },
      { id: "pulse", label: "PULSE", tone: "orange" },
      { id: "wave", label: "WAVE", tone: "magenta" }
    ],
    radius: 0.18 * 1.5 * 1.5,
    selectedId: "pulse",
    spreadDeg: 120
  }
];

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

const material = flatEmissiveMaterial;

function darkMaterial(opacity = 0.72) {
  return `shader: flat; color: #070011; emissive: #070011; emissiveIntensity: 0.08; opacity: ${opacity}; transparent: true; side: double; depthTest: false; depthWrite: false`;
}

function ringGeometry(innerRadius: number, outerRadius: number, startAngle: number, angleLength: number) {
  return `primitive: ring; radiusInner: ${innerRadius}; radiusOuter: ${outerRadius}; thetaStart: ${startAngle}; thetaLength: ${angleLength}; segmentsTheta: 28`;
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function levelArc({
  index,
  itemCount,
  rotationDeg,
  spreadDeg
}: {
  index: number;
  itemCount: number;
  rotationDeg: number;
  spreadDeg: number;
}) {
  const arcSlot = spreadDeg / itemCount;
  const arcLength = Math.max(12, arcSlot - ARC_GAP);
  const spreadStart = spreadDeg === 360 ? 0 : TOP_ANGLE - spreadDeg / 2;
  const startAngle = normalizeAngle(spreadStart + index * arcSlot + ARC_GAP / 2 + rotationDeg);
  const centerAngle = normalizeAngle(startAngle + arcLength / 2);

  return {
    arcLength,
    centerAngle,
    startAngle
  };
}

function selectedRotation(level: RingLevel) {
  const selectedIndex = Math.max(0, level.items.findIndex((item) => item.id === level.selectedId));
  const arc = levelArc({
    index: selectedIndex,
    itemCount: level.items.length,
    rotationDeg: 0,
    spreadDeg: level.spreadDeg
  });
  return TOP_ANGLE - arc.centerAngle;
}

function labelPosition(radius: number, angleDeg: number) {
  const radians = toRadians(angleDeg);
  return `${Math.cos(radians) * radius} ${Math.sin(radians) * radius} 0.024`;
}

function connectorPosition(fromRadius: number, toRadius: number) {
  const mid = (fromRadius + toRadius) / 2;
  return `0 ${mid} 0.012`;
}

function connectorHeight(fromRadius: number, toRadius: number) {
  return Math.max(0.02, toRadius - fromRadius - 0.055);
}

function RingMenuRayBlocker({ fadeOpacity }: { fadeOpacity: number }) {
  const ref = useSpatialRayBlockerEvents();

  return createElement("a-circle", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-testid": "spatial-ring-menu-ray-blocker",
    material: material("#ffffff", 0.001 * fadeOpacity, 0),
    position: "0 0 0.035",
    radius: "0.78",
    ref,
    segments: "80"
  });
}

function RingHitArc({
  arcLength,
  innerRadius,
  itemId,
  onClick,
  onState,
  outerRadius,
  startAngle
}: {
  arcLength: number;
  innerRadius: number;
  itemId: string;
  onClick: (itemId: string) => void;
  onState: (itemId: string, state: RingControlVisualState) => void;
  outerRadius: number;
  startAngle: number;
}) {
  const ref = useSpatialButtonEvents({
    onClick: () => onClick(itemId),
    onState: (state) => onState(itemId, state)
  });

  return createElement("a-entity", {
    className: "clickable",
    "data-ray-blocking": "true",
    [SPATIAL_UI_HIT_ATTRIBUTE]: "true",
    "data-ring-hit-id": itemId,
    geometry: ringGeometry(innerRadius, outerRadius, startAngle, arcLength),
    material: transparentHitMaterial(),
    position: "0 0 0.115",
    ref
  });
}

function DemoArc({
  armed,
  clicked,
  dwell,
  hovered,
  item,
  selected,
  level,
  onClick,
  onState,
  pressed,
  rotateToTop,
  visible
}: {
  armed: boolean;
  clicked: boolean;
  dwell: boolean;
  hovered: boolean;
  item: RingItem;
  level: RingLevel;
  onClick: (itemId: string) => void;
  onState: (itemId: string, state: RingControlVisualState) => void;
  pressed: boolean;
  rotateToTop: boolean;
  selected: boolean;
  visible: boolean;
}) {
  const itemIndex = level.items.findIndex((candidate) => candidate.id === item.id);
  const rotationDeg = rotateToTop ? selectedRotation(level) : 0;
  const arc = levelArc({
    index: itemIndex,
    itemCount: level.items.length,
    rotationDeg,
    spreadDeg: level.spreadDeg
  });
  const color = COLORS[item.tone];
  const opacity = visible ? 0.72 : 0;
  const outerRadius = level.radius + (selected ? 0.035 : 0.025);
  const innerRadius = level.radius - (selected ? 0.035 : 0.025);
  const interactive = visible && (selected || hovered || pressed || clicked);
  const highlightRadius = outerRadius + 0.01;
  const glowRadius = outerRadius + 0.026;

  return createElement(
    "a-entity",
    {
      "data-ring-item-id": item.id
    },
    createElement("a-entity", {
      geometry: ringGeometry(innerRadius - 0.006, outerRadius + 0.006, arc.startAngle, arc.arcLength),
      material: darkMaterial(visible ? 0.72 : 0)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(outerRadius - 0.006, highlightRadius, arc.startAngle + 1.2, Math.max(7, arc.arcLength - 2.4)),
      material: material(selected ? COLORS.white : color, visible ? (selected ? 0.9 : 0.34) : 0, selected ? 1.05 : 0.5)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(innerRadius - 0.002, innerRadius + 0.006, arc.startAngle + 2, Math.max(6, arc.arcLength - 4)),
      material: material(selected ? COLORS.white : COLORS.magenta, visible ? (selected ? 0.42 : 0.16) : 0, 0.44)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(innerRadius, outerRadius, arc.startAngle, arc.arcLength),
      material: material(color, opacity * 0.28, selected ? 0.3 : 0.24)
    }),
    createElement("a-entity", {
      geometry: ringGeometry(outerRadius + 0.012, glowRadius, arc.startAngle + 4, Math.max(3, arc.arcLength - 8)),
      material: material(color, visible ? (selected ? 0.18 : 0.07) : 0, selected ? 0.95 : 0.44)
    }),
    interactive
      ? createElement("a-entity", {
          geometry: ringGeometry(outerRadius + 0.018, outerRadius + 0.032, arc.startAngle + 1.5, Math.max(8, arc.arcLength - 3)),
          material: material(
            pressed || clicked || dwell ? COLORS.orange : COLORS.white,
            armed || pressed || clicked ? 0.72 : dwell || hovered ? 0.56 : 0.4,
            armed || pressed || clicked ? 1.1 : 0.78
          )
        })
      : null,
    interactive && (dwell || pressed || clicked)
      ? createElement("a-entity", {
          geometry: ringGeometry(outerRadius + 0.032, outerRadius + 0.044, arc.startAngle + 5, Math.max(5, arc.arcLength * 0.7)),
          material: material(COLORS.orange, 0.72, 1.2)
        })
      : null,
    createElement("a-text", {
      align: "center",
      baseline: "center",
      color: COLORS.white,
      font: "exo2bold",
      letterSpacing: 0.8,
      material: `shader: msdf; emissive: ${COLORS.white}; emissiveIntensity: 0.7; depthTest: false; depthWrite: false`,
      opacity: visible ? 1 : 0,
      position: labelPosition(level.radius, arc.centerAngle).replace("0.024", "0.07"),
      scale: `${selected ? 0.143 : 0.13} ${selected ? 0.143 : 0.13} ${selected ? 0.143 : 0.13}`,
      side: "double",
      value: item.label,
      width: selected ? "4.6" : "4.2",
      wrapCount: "8"
    }),
    visible
      ? createElement(RingHitArc, {
          arcLength: arc.arcLength,
          innerRadius: Math.max(0.01, innerRadius - 0.025),
          itemId: item.id,
          onClick,
          onState,
          outerRadius: outerRadius + 0.052,
          startAngle: arc.startAngle
        })
      : null
  );
}

function DemoLevel({
  armed,
  dwell,
  interaction,
  level,
  onItemClick,
  onItemState,
  rotateToTop,
  visible
}: {
  armed: boolean;
  dwell: boolean;
  interaction: RingInteractionState;
  level: RingLevel;
  onItemClick: (itemId: string) => void;
  onItemState: (itemId: string, state: RingControlVisualState) => void;
  rotateToTop: boolean;
  visible: boolean;
}) {
  return createElement(
    "a-entity",
    {
      "data-ring-level-id": level.id
    },
    ...level.items.map((item) =>
      createElement(DemoArc, {
        armed,
        clicked: interaction.clickedItemId === item.id,
        dwell,
        hovered: interaction.hoveredItemId === item.id,
        item,
        key: item.id,
        level,
        onClick: onItemClick,
        onState: onItemState,
        pressed: interaction.pressedItemId === item.id,
        rotateToTop,
        selected: item.id === level.selectedId,
        visible
      })
    )
  );
}

function readStepLabel(step: number) {
  if (step <= 0) {
    return "B HOLD // LEVEL 1";
  }
  if (step <= 2) {
    return "DWELL FX // ROTATE TOP";
  }
  if (step <= 4) {
    return "DWELL LENS // LEVEL 2";
  }
  if (step <= 5) {
    return "ARM PULSE // LEVEL 3";
  }
  return "COMMIT PULSE";
}

function useKeyboardDemo(onStart: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || event.repeat) {
        return;
      }

      onStart();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onStart]);
}

function useBillboard(rootRef: React.RefObject<AFrameEntityElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let frameId = 0;
    const cameraPosition = { x: 0, y: 1.6, z: 0 };

    const tick = () => {
      const root = rootRef.current;
      const camera = document.querySelector("#main-camera") as AFrameCameraElement | null;

      camera?.object3D?.getWorldPosition?.(cameraPosition);
      root?.object3D?.lookAt?.(cameraPosition);
      root?.object3D?.traverse?.((child) => {
        child.renderOrder = 90;
      });
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled, rootRef]);
}

export function SpatialHoldRingMenuDemo() {
  const rootRef = useRef<AFrameEntityElement | null>(null);
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const [interaction, setInteraction] = useState<RingInteractionState>({});
  const clickTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  const startDemo = () => {
    clearTimers();
    setActive(true);
    setClosing(false);
    setInteraction({});
    setStep(0);

    const schedule = (delay: number, nextStep: number) => {
      const timer = window.setTimeout(() => setStep(nextStep), delay);
      timersRef.current.push(timer);
    };

    schedule(650, 1);
    schedule(1150, 2);
    schedule(1850, 3);
    schedule(2450, 4);
    schedule(3200, 5);
    schedule(3900, 6);
    const closeTimer = window.setTimeout(() => setClosing(true), 4100);
    const removeTimer = window.setTimeout(() => {
      setActive(false);
      setClosing(false);
      setInteraction({});
      setStep(0);
    }, 6100);
    timersRef.current.push(closeTimer, removeTimer);
  };

  const handleItemState = (itemId: string, state: RingControlVisualState) => {
    setInteraction((value) => {
      if (state === "idle") {
        return {
          ...value,
          hoveredItemId: value.hoveredItemId === itemId ? null : value.hoveredItemId,
          pressedItemId: value.pressedItemId === itemId ? null : value.pressedItemId
        };
      }

      return {
        ...value,
        hoveredItemId: itemId,
        pressedItemId: state === "pressed" ? itemId : value.pressedItemId === itemId ? null : value.pressedItemId
      };
    });
  };

  const handleItemClick = (itemId: string) => {
    setInteraction((value) => ({
      ...value,
      clickedItemId: itemId,
      hoveredItemId: itemId,
      pressedItemId: null
    }));

    if (itemId === "fx") {
      setStep((value) => Math.max(value, 2));
    } else if (itemId === "lens") {
      setStep((value) => Math.max(value, 4));
    } else if (itemId === "pulse") {
      setStep((value) => Math.max(value, 6));
    }

    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = window.setTimeout(() => {
      setInteraction((value) => ({
        ...value,
        clickedItemId: value.clickedItemId === itemId ? null : value.clickedItemId
      }));
    }, 260);
  };

  useKeyboardDemo(startDemo);
  useBillboard(rootRef, active);

  useEffect(() => clearTimers, []);

  const visibleLevels = useMemo(
    () => ({
      level0: active,
      level1: active && step >= 2,
      level2: active && step >= 4
    }),
    [active, step]
  );

  if (!active) {
    return null;
  }

  const fadeOpacity = closing ? 0.32 : 1;

  return createElement(
    "a-entity",
    {
      ref: rootRef,
      "data-demo-step": String(step),
      "data-testid": "spatial-hold-ring-menu-demo",
      position: "0.42 1.22 -0.82",
      scale: closing ? "0.92 0.92 0.92" : "1 1 1"
    },
    createElement(RingMenuRayBlocker, {
      fadeOpacity
    }),
    createElement("a-circle", {
      material: material("#070011", 0.38 * fadeOpacity, 0.08),
      radius: "0.08",
      segments: "40"
    }),
    createElement("a-circle", {
      material: material(COLORS.magenta, 0.08 * fadeOpacity, 0.72),
      radius: "0.125",
      segments: "48"
    }),
    createElement("a-ring", {
      material: material(COLORS.cyan, 0.22 * fadeOpacity, 0.5),
      "radius-inner": "0.075",
      "radius-outer": "0.087",
      "theta-length": "360"
    }),
    createElement(DemoLevel, {
      armed: step >= 6,
      dwell: step === 1,
      interaction,
      level: LEVELS[0],
      onItemClick: handleItemClick,
      onItemState: handleItemState,
      rotateToTop: step >= 1,
      visible: visibleLevels.level0
    }),
    visibleLevels.level1
      ? createElement(
          "a-entity",
          null,
          createElement("a-plane", {
            height: String(connectorHeight(LEVELS[0].radius, LEVELS[1].radius)),
            material: material(COLORS.magenta, 0.42 * fadeOpacity, 0.72),
            position: connectorPosition(LEVELS[0].radius, LEVELS[1].radius),
            width: "0.012"
          }),
          createElement(DemoLevel, {
            armed: step >= 6,
            dwell: step === 3,
            interaction,
            level: LEVELS[1],
            onItemClick: handleItemClick,
            onItemState: handleItemState,
            rotateToTop: step >= 4,
            visible: true
          })
        )
      : null,
    visibleLevels.level2
      ? createElement(
          "a-entity",
          null,
          createElement("a-plane", {
            height: String(connectorHeight(LEVELS[1].radius, LEVELS[2].radius)),
            material: material(COLORS.orange, 0.42 * fadeOpacity, 0.72),
            position: connectorPosition(LEVELS[1].radius, LEVELS[2].radius),
            width: "0.012"
          }),
          createElement(DemoLevel, {
            armed: step >= 5,
            dwell: step === 5,
            interaction,
            level: LEVELS[2],
            onItemClick: handleItemClick,
            onItemState: handleItemState,
            rotateToTop: false,
            visible: true
          })
        )
      : null,
    createElement("a-text", {
      align: "center",
      baseline: "center",
      color: step >= 6 ? COLORS.orange : COLORS.cyan,
      font: "exo2bold",
      letterSpacing: 1.8,
      material: `shader: msdf; emissive: ${step >= 6 ? COLORS.orange : COLORS.cyan}; emissiveIntensity: 0.58`,
      opacity: fadeOpacity,
      position: "0 -0.58 0.03",
      scale: "0.093 0.093 0.093",
      side: "double",
      value: readStepLabel(step),
      width: "8",
      wrapCount: "24"
    }),
    createElement("a-text", {
      align: "center",
      baseline: "center",
      color: COLORS.white,
      font: "monoid",
      letterSpacing: 1.1,
      material: `shader: msdf; emissive: ${COLORS.white}; emissiveIntensity: 0.36`,
      opacity: 0.82 * fadeOpacity,
      position: "0 -0.64 0.03",
      scale: "0.06 0.06 0.06",
      side: "double",
      value: "Keyboard K simulates Quest B hold / dwell / release.",
      width: "8",
      wrapCount: "34"
    })
  );
}
