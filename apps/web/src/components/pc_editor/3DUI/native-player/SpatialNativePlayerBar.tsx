"use client";

import { createElement, useEffect, useRef, type RefObject } from "react";
import type { PcEditorCommand } from "../commands";

type AFrameEntity = HTMLElement & {
  object3D?: unknown;
};

export type SpatialNativePlayerBarProps = {
  cameraRef?: RefObject<HTMLElement | null>;
  currentTimeMs: number;
  durationMs: number;
  enabled: boolean;
  isPlaying: boolean;
  onCommand: (command: PcEditorCommand) => void;
  recordingActive?: boolean;
  subtitle?: string;
  title: string;
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const RED = "#ff3344";
const WHITE = "#f7ffff";
const MUTED = "#a8efff";
const DEEP = "#070011";
const PANEL = "#15112a";
const TRACK_WIDTH = 1.5;

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mat(color: string, opacity = 1, glow = 0.24) {
  return `shader: flat; color: ${color}; emissive: ${color}; emissiveIntensity: ${glow}; opacity: ${opacity}; transparent: true; side: double`;
}

function text(value: string, color = WHITE, width = 3) {
  return {
    align: "center",
    color,
    material: `shader: msdf; emissive: ${color}; emissiveIntensity: 0.48`,
    value,
    width: String(width),
    wrapCount: "34"
  };
}

function Circle({ color, opacity = 1, position, radius }: { color: string; opacity?: number; position: string; radius: number }) {
  return createElement("a-circle", {
    material: mat(color, opacity, 0.36),
    position,
    radius: String(radius),
    segments: "36"
  });
}

function Pill({
  color,
  height,
  opacity = 1,
  position = "0 0 0",
  width
}: {
  color: string;
  height: number;
  opacity?: number;
  position?: string;
  width: number;
}) {
  const bodyWidth = Math.max(0.001, width - height);

  return createElement(
    "a-entity",
    { position },
    createElement("a-plane", {
      height: String(height),
      material: mat(color, opacity),
      width: String(bodyWidth)
    }),
    createElement(Circle, {
      color,
      opacity,
      position: `${-bodyWidth / 2} 0 0.001`,
      radius: height / 2
    }),
    createElement(Circle, {
      color,
      opacity,
      position: `${bodyWidth / 2} 0 0.001`,
      radius: height / 2
    })
  );
}

function ChromeDots() {
  return createElement(
    "a-entity",
    null,
    createElement(Circle, { color: MAGENTA, position: "-0.81 0.106 0.034", radius: 0.009 }),
    createElement(Circle, { color: CYAN, position: "-0.785 0.106 0.034", radius: 0.009 }),
    createElement(Circle, { color: ORANGE, position: "-0.76 0.106 0.034", radius: 0.009 })
  );
}

function NativeButton({
  active = false,
  color = CYAN,
  keyLabel,
  label,
  onPress,
  position,
  testId,
  tone = "dark",
  width = 0.12
}: {
  active?: boolean;
  color?: string;
  keyLabel?: string;
  label: string;
  onPress: () => void;
  position: string;
  testId: string;
  tone?: "dark" | "hot" | "primary";
  width?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const isCircle = width <= 0.12;
  const buttonHeight = 0.056;
  const fill = tone === "hot" ? RED : tone === "primary" ? MAGENTA : DEEP;
  const fillOpacity = tone === "dark" ? 0.78 : 0.9;

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return;
    }

    let timer: number | null = null;
    const handleClick = (event: Event) => {
      event.stopPropagation();
      el.setAttribute("animation__press", "property: scale; to: 0.94 0.94 1; dur: 45; easing: easeOutQuad");
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        el.setAttribute("animation__press", "property: scale; to: 1 1 1; dur: 90; easing: easeOutQuad");
      }, 100);
      onPress();
    };

    el.addEventListener("click", handleClick);
    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      el.removeEventListener("click", handleClick);
    };
  }, [onPress]);

  return createElement(
    "a-entity",
    {
      className: "clickable",
      "data-testid": testId,
      position,
      ref
    },
    isCircle
      ? createElement(Circle, { color, opacity: active ? 0.7 : 0.36, position: "0 0 -0.003", radius: 0.038 })
      : createElement(Pill, { color, height: buttonHeight + 0.01, opacity: active ? 0.56 : 0.34, width: width + 0.016 }),
    isCircle
      ? createElement(Circle, { color: fill, opacity: fillOpacity, position: "0 0 0.006", radius: 0.032 })
      : createElement(Pill, { color: fill, height: buttonHeight, opacity: fillOpacity, position: "0 0 0.006", width }),
    tone === "primary"
      ? createElement(Pill, { color: CYAN, height: 0.025, opacity: 0.52, position: "0 0.011 0.012", width: width * 0.72 })
      : null,
    createElement("a-text", {
      ...text(label, WHITE, 1.3),
      position: `0 ${keyLabel ? 0.007 : -0.006} 0.018`,
      scale: `${isCircle ? 0.14 : 0.085} ${isCircle ? 0.14 : 0.085} ${isCircle ? 0.14 : 0.085}`
    }),
    keyLabel
      ? createElement("a-text", {
          ...text(keyLabel, tone === "hot" ? "#ffd3d3" : MUTED, 1.3),
          position: "0 -0.017 0.018",
          scale: "0.052 0.052 0.052"
        })
      : null
  );
}

export function SpatialNativePlayerBar({
  cameraRef,
  currentTimeMs,
  durationMs,
  enabled,
  isPlaying,
  onCommand,
  recordingActive = false,
  subtitle,
  title
}: SpatialNativePlayerBarProps) {
  const rootRef = useRef<AFrameEntity | null>(null);
  const displayCurrentTimeMs = currentTimeMs;
  const displayDurationMs = durationMs;
  const displayIsPlaying = isPlaying;
  const progress = displayDurationMs > 0 ? clamp(displayCurrentTimeMs / displayDurationMs, 0, 1) : 0;
  const fillWidth = Math.max(0.012, TRACK_WIDTH * progress);
  const shortTitle = title.length > 54 ? `${title.slice(0, 51)}...` : title;

  useEffect(() => {
    const root = rootRef.current;
    const camera = cameraRef?.current as AFrameEntity | null | undefined;
    const rootObject = root?.object3D;
    const cameraObject = camera?.object3D as { add?: (object: unknown) => void; remove?: (object: unknown) => void } | undefined;

    if (!rootObject || !cameraObject?.add) {
      return;
    }

    cameraObject.add(rootObject);
    return () => cameraObject.remove?.(rootObject);
  }, [cameraRef]);

  if (!enabled) {
    return null;
  }

  return createElement(
    "a-entity",
    {
      "data-testid": "spatial-native-player-bar",
      position: "0 -0.49 -1.15",
      ref: rootRef
    },
    createElement(Pill, { color: MAGENTA, height: 0.27, opacity: 0.18, position: "0 -0.01 -0.04", width: 1.86 }),
    createElement(Pill, { color: CYAN, height: 0.255, opacity: 0.28, position: "0 0 -0.028", width: 1.84 }),
    createElement(Pill, { color: PANEL, height: 0.245, opacity: 0.78, position: "0 0 -0.018", width: 1.82 }),
    createElement(Pill, { color: "#ffffff", height: 0.08, opacity: 0.07, position: "0 0.05 -0.012", width: 1.72 }),
    createElement("a-plane", {
      height: "0.004",
      material: mat(CYAN, 0.9, 0.65),
      position: "0 0.13 0.012",
      width: "1.68"
    }),
    createElement("a-plane", {
      height: "0.004",
      material: mat(MAGENTA, 0.72, 0.5),
      position: "0 -0.13 0.012",
      width: "1.62"
    }),
    createElement(ChromeDots),
    createElement("a-text", {
      ...text("PLAYBACK_CORE // 2088", CYAN, 2.2),
      align: "right",
      position: "0.78 0.106 0.036",
      scale: "0.064 0.064 0.064"
    }),
    createElement("a-text", {
      ...text(formatTime(displayCurrentTimeMs), MUTED, 0.8),
      align: "left",
      position: "-0.79 0.035 0.038",
      scale: "0.072 0.072 0.072"
    }),
    createElement("a-text", {
      ...text(formatTime(displayDurationMs), MUTED, 0.8),
      align: "right",
      position: "0.79 0.035 0.038",
      scale: "0.072 0.072 0.072"
    }),
    createElement(Pill, { color: CYAN, height: 0.05, opacity: 0.26, position: "0 0.035 0.02", width: TRACK_WIDTH }),
    createElement(Pill, { color: DEEP, height: 0.044, opacity: 0.72, position: "0 0.035 0.024", width: TRACK_WIDTH - 0.018 }),
    createElement(Pill, {
      color: `#6f7f8c`,
      height: 0.04,
      opacity: 0.62,
      position: "0 0.035 0.028",
      width: TRACK_WIDTH - 0.04
    }),
    createElement(Pill, {
      color: CYAN,
      height: 0.038,
      opacity: 0.92,
      position: `${-(TRACK_WIDTH - fillWidth) / 2} 0.035 0.034`,
      width: fillWidth
    }),
    createElement(Circle, {
      color: WHITE,
      opacity: 0.92,
      position: `${-TRACK_WIDTH / 2 + fillWidth} 0.035 0.042`,
      radius: 0.015
    }),
    createElement(NativeButton, {
      color: CYAN,
      label: "\u23EE",
      onPress: () => onCommand({ type: "player.previous" }),
      position: "-0.73 -0.06 0.042",
      testId: "spatial-native-player-previous"
    }),
    createElement(NativeButton, {
      active: true,
      color: CYAN,
      label: displayIsPlaying ? "\u23F8" : "\u25B6",
      keyLabel: "Space",
      onPress: () => onCommand({ type: "player.playPause.toggle" }),
      position: "-0.63 -0.06 0.042",
      testId: "spatial-native-player-toggle",
      tone: "primary",
      width: 0.12
    }),
    createElement(NativeButton, {
      color: CYAN,
      label: "\u23ED",
      onPress: () => onCommand({ type: "player.next" }),
      position: "-0.53 -0.06 0.042",
      testId: "spatial-native-player-next"
    }),
    createElement("a-text", {
      ...text(shortTitle, WHITE, 3.4),
      align: "left",
      position: "-0.44 -0.044 0.042",
      scale: "0.08 0.08 0.08"
    }),
    createElement("a-text", {
      ...text(subtitle ?? "360 source / FOV 90 / mask 70% / auto off", MUTED, 3.2),
      align: "left",
      position: "-0.44 -0.083 0.042",
      scale: "0.058 0.058 0.058"
    }),
    createElement(NativeButton, {
      active: recordingActive,
      color: recordingActive ? RED : RED,
      keyLabel: "Record",
      label: recordingActive ? "END RECORD" : "START RECORD",
      onPress: () => onCommand(recordingActive ? { type: "crop.end" } : { type: "crop.start" }),
      position: "0.26 -0.062 0.042",
      testId: "spatial-native-player-record",
      tone: "hot",
      width: 0.22
    }),
    createElement(NativeButton, {
      color: CYAN,
      keyLabel: "Hold + R stick",
      label: "PLAY 1.00X",
      onPress: () => onCommand({ type: "player.playbackRate.reset" }),
      position: "0.49 -0.062 0.042",
      testId: "spatial-native-player-playback-rate",
      width: 0.19
    }),
    createElement(NativeButton, {
      color: CYAN,
      keyLabel: "Hold + R stick",
      label: "RECORD 1.00X",
      onPress: () => onCommand({ type: "player.recordingRate.reset" }),
      position: "0.7 -0.062 0.042",
      testId: "spatial-native-player-recording-rate",
      width: 0.2
    }),
    createElement(NativeButton, {
      color: CYAN,
      label: "\u2630",
      keyLabel: "P",
      onPress: () => onCommand({ type: "playlist.toggle" }),
      position: "0.84 -0.062 0.042",
      testId: "spatial-native-player-list"
    })
  );
}
