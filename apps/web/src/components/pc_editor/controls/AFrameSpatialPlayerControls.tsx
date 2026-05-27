"use client";

import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type {
  AFrame360PlaybackState,
  AFrame360VideoCommand,
  AFrame360VideoCommandPayload,
  AFrame360VideoSource
} from "./types";

type AFrameSpatialPlayerControlsProps = {
  playbackState: AFrame360PlaybackState;
  runCommand: (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => void | Promise<void>;
};

type SpatialButtonProps = {
  children?: ReactNode;
  color?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  position: string;
  testId: string;
  width?: number;
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const PANEL = "#1a103c";
const DEEP = "#070011";
const RATES = [0.5, 1, 1.5, 2];
const PROGRESS_WIDTH = 1.18;
const VISIBLE_ROWS = 6;

function formatTime(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, Math.max(0, length - 1))}...` : value;
}

function material(color: string, opacity = 0.9, emissiveIntensity = 0.32) {
  return `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: ${emissiveIntensity}; metalness: 0.05; roughness: 0.38; opacity: ${opacity}; transparent: true`;
}

function textProps(value: string, color = WHITE, width = 3) {
  return {
    align: "center",
    color,
    material: `shader: msdf; emissive: ${color}; emissiveIntensity: 0.55`,
    value,
    width: String(width)
  };
}

function SpatialButton({
  children,
  color = CYAN,
  disabled = false,
  label,
  onPress,
  position,
  testId,
  width = 0.22
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
      currentEl.setAttribute("animation__press", "property: scale; to: 1 1 1; dur: 80; easing: easeOutQuad");
    }

    function handleClick(event: Event) {
      event.stopPropagation();
      currentEl.setAttribute("animation__press", "property: scale; to: 0.94 0.9 1; dur: 45; easing: easeOutQuad");
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(restore, 120);
      onPress();
    }

    currentEl.addEventListener("click", handleClick);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      currentEl.removeEventListener("click", handleClick);
    };
  }, [disabled, onPress]);

  return createElement(
    "a-entity",
    {
      "data-layer": "interactive-button",
      ref,
      className: disabled ? "" : "clickable",
      "data-testid": testId,
      position
    },
    createElement("a-box", {
      depth: "0.032",
      height: "0.14",
      material: material("#020006", 0.44, 0.02),
      position: "0 -0.012 -0.028",
      width: String(width)
    }),
    createElement("a-box", {
      "data-layer": "button-surface",
      depth: "0.035",
      height: "0.14",
      material: material(disabled ? "#3a3146" : color, disabled ? 0.32 : 0.86, disabled ? 0.08 : 0.42),
      width: String(width)
    }),
    createElement("a-plane", {
      "data-layer": "button-highlight",
      height: "0.014",
      material: material(WHITE, disabled ? 0.08 : 0.34, 0.2),
      position: "0 0.055 0.022",
      width: String(Math.max(0.02, width - 0.05))
    }),
    createElement("a-text", {
      "data-layer": "button-text",
      ...textProps(label, disabled ? "#827894" : WHITE, 1.25),
      position: "0 -0.018 0.022",
      scale: "0.18 0.18 0.18"
    }),
    children
  );
}

function SpatialProgress({
  currentTimeMs,
  durationMs,
  runCommand
}: {
  currentTimeMs: number;
  durationMs: number;
  runCommand: AFrameSpatialPlayerControlsProps["runCommand"];
}) {
  const ref = useRef<HTMLElement | null>(null);
  const progress = durationMs > 0 ? clamp(currentTimeMs / durationMs, 0, 1) : 0;
  const fillWidth = Math.max(0.025, PROGRESS_WIDTH * progress);

  useEffect(() => {
    const el = ref.current;

    if (!el) {
      return;
    }

    const currentEl = el;
    const localPoint = new THREE.Vector3();

    function handleClick(event: Event) {
      event.stopPropagation();
      const intersection = (event as CustomEvent<{ intersection?: { point?: THREE.Vector3 } }>).detail?.intersection;

      if (!intersection?.point || durationMs <= 0) {
        return;
      }

      localPoint.copy(intersection.point);
      (currentEl as HTMLElement & { object3D: THREE.Object3D }).object3D.worldToLocal(localPoint);
      const ratio = clamp((localPoint.x + PROGRESS_WIDTH / 2) / PROGRESS_WIDTH, 0, 1);
      void runCommand("seek-to", { timeMs: Math.round(durationMs * ratio) });
    }

    currentEl.addEventListener("click", handleClick);
    return () => currentEl.removeEventListener("click", handleClick);
  }, [durationMs, runCommand]);

  return createElement(
    "a-entity",
    {
      ref,
      className: "clickable",
      "data-layer": "interactive-progress",
      "data-testid": "xr-spatial-player-progress",
      position: "0 -0.005 0.03"
    },
    createElement("a-plane", {
      "data-layer": "progress-track",
      height: "0.035",
      material: material("#ffffff", 0.18, 0.04),
      width: String(PROGRESS_WIDTH)
    }),
    createElement("a-plane", {
      "data-layer": "progress-fill",
      height: "0.037",
      material: `shader: standard; color: ${CYAN}; emissive: ${CYAN}; emissiveIntensity: 0.78; opacity: 0.95; transparent: true`,
      position: `${-(PROGRESS_WIDTH - fillWidth) / 2} 0 0.006`,
      width: String(fillWidth)
    }),
    createElement("a-plane", {
      "data-layer": "progress-scanline",
      height: "0.006",
      material: material(ORANGE, 0.64, 0.5),
      position: `${-(PROGRESS_WIDTH - fillWidth) / 2} 0.016 0.012`,
      width: String(fillWidth)
    })
  );
}

function PlaylistRow({
  isActive,
  onSelect,
  position,
  source
}: {
  isActive: boolean;
  onSelect: () => void;
  position: string;
  source: AFrame360VideoSource;
}) {
  return createElement(
    SpatialButton,
    {
      color: isActive ? CYAN : MAGENTA,
      label: "",
      onPress: onSelect,
      position,
      testId: `xr-spatial-playlist-${source.id}`,
      width: 0.86
    },
    createElement("a-plane", {
      "data-layer": "playlist-cover",
      height: "0.13",
      material: material(isActive ? CYAN : ORANGE, isActive ? 0.74 : 0.48, 0.46),
      position: "-0.31 0 0.026",
      width: "0.13"
    }),
    createElement("a-plane", {
      "data-layer": "playlist-cover-rim",
      height: "0.103",
      material: material(PANEL, 0.48, 0.24),
      position: "-0.31 0 0.032",
      width: "0.103"
    }),
    createElement("a-text", {
      ...textProps(source.kind.toUpperCase(), DEEP, 1.1),
      align: "center",
      position: "-0.31 -0.038 0.04",
      scale: "0.055 0.055 0.055"
    }),
    createElement("a-text", {
      "data-layer": "playlist-title",
      ...textProps(truncate(source.title, 36), WHITE, 2.1),
      align: "left",
      position: "-0.2 0.026 0.029",
      scale: "0.09 0.09 0.09"
    }),
    createElement("a-text", {
      "data-layer": "playlist-meta",
      ...textProps(`${formatTime(source.durationMs ?? 0)} / ${source.resolution ?? source.kind.toUpperCase()}`, "#bfefff", 2.1),
      align: "left",
      position: "-0.2 -0.04 0.029",
      scale: "0.085 0.085 0.085"
    })
  );
}

export function AFrameSpatialPlayerControls({ playbackState, runCommand }: AFrameSpatialPlayerControlsProps) {
  const [rateOpen, setRateOpen] = useState(false);
  const [playlistOffset, setPlaylistOffset] = useState(0);
  const sources = playbackState.sources;
  const maxOffset = Math.max(0, sources.length - VISIBLE_ROWS);
  const safeOffset = clamp(playlistOffset, 0, maxOffset);

  useEffect(() => {
    setRateOpen(false);
    setPlaylistOffset(clamp(playbackState.currentIndex - 2, 0, Math.max(0, sources.length - VISIBLE_ROWS)));
  }, [playbackState.playlistOpen, playbackState.currentIndex, sources.length]);

  const visibleSources = useMemo(() => sources.slice(safeOffset, safeOffset + VISIBLE_ROWS), [safeOffset, sources]);
  const title = playbackState.currentSource?.title ?? "No source loaded";
  const meta = `${formatTime(playbackState.currentTimeMs)} / ${formatTime(playbackState.durationMs)} / ${playbackState.playbackRate}x`;

  function closeOverlays() {
    setRateOpen(false);
    setPlaylistOffset(clamp(playbackState.currentIndex - 2, 0, maxOffset));
    void runCommand("close-overlays");
  }

  return createElement(
    "a-entity",
    {
      "data-layer": "spatial-player-root",
      "data-testid": "xr-spatial-player-ui"
    },
    createElement(
      "a-entity",
      {
        "data-layer": "control-panel-root",
        "data-testid": "xr-spatial-player-control-bar",
        position: "0 1.05 -1.8"
      },
      createElement("a-box", {
        "data-layer": "panel-shadow",
        depth: "0.035",
        height: "0.48",
        material: material(DEEP, 0.34, 0.08),
        position: "0 -0.018 -0.038",
        width: "2.52"
      }),
      createElement("a-box", {
        "data-layer": "panel-glass",
        depth: "0.04",
        height: "0.42",
        material: material(PANEL, 0.78, 0.3),
        position: "0 0 -0.012",
        width: "2.42"
      }),
      createElement("a-plane", {
        "data-layer": "panel-inner-glow",
        height: "0.34",
        material: material("#ffffff", 0.07, 0.02),
        position: "0 0 0.012",
        width: "2.24"
      }),
      createElement("a-plane", {
        "data-layer": "panel-cyan-rim",
        height: "0.012",
        material: material(CYAN, 0.95, 0.75),
        position: "0 0.214 0.015",
        width: "2.2"
      }),
      createElement("a-plane", {
        "data-layer": "panel-magenta-rim",
        height: "0.012",
        material: material(MAGENTA, 0.9, 0.7),
        position: "0 -0.214 0.015",
        width: "2.2"
      }),
      createElement("a-plane", {
        "data-layer": "panel-orange-scanline",
        height: "0.006",
        material: material(ORANGE, 0.78, 0.68),
        position: "-0.58 0.17 0.019",
        width: "0.56"
      }),
      createElement("a-text", {
        ...textProps("PLAYBACK_CORE // 2088", CYAN, 2.6),
        align: "right",
        position: "1.02 0.18 0.03",
        scale: "0.075 0.075 0.075"
      }),
      createElement("a-text", {
        "data-layer": "panel-title-text",
        ...textProps(title, WHITE, 4.6),
        align: "left",
        position: "-1.05 0.12 0.03",
        scale: "0.15 0.15 0.15"
      }),
      createElement("a-text", {
        "data-layer": "panel-meta-text",
        ...textProps(meta, "#9fefff", 3.4),
        align: "right",
        position: "1.05 0.12 0.03",
        scale: "0.12 0.12 0.12"
      }),
      createElement(SpatialProgress, {
        currentTimeMs: playbackState.currentTimeMs,
        durationMs: playbackState.durationMs,
        runCommand
      }),
      createElement(SpatialButton, {
        color: MAGENTA,
        label: "\u23EE",
        onPress: () => void runCommand("previous"),
        position: "-0.9 -0.13 0.035",
        testId: "xr-spatial-player-previous"
      }),
      createElement(SpatialButton, {
        color: playbackState.isPlaying ? ORANGE : CYAN,
        label: playbackState.isPlaying ? "\u23F8" : "\u25B6",
        onPress: () => void runCommand("toggle-play"),
        position: "-0.58 -0.13 0.035",
        testId: "xr-spatial-player-toggle",
        width: 0.3
      }),
      createElement(SpatialButton, {
        color: MAGENTA,
        label: "\u23ED",
        onPress: () => void runCommand("next"),
        position: "-0.24 -0.13 0.035",
        testId: "xr-spatial-player-next"
      }),
      createElement(SpatialButton, {
        color: rateOpen ? ORANGE : CYAN,
        label: `${playbackState.playbackRate}x`,
        onPress: () => setRateOpen((open) => !open),
        position: "0.28 -0.13 0.035",
        testId: "xr-spatial-player-rate",
        width: 0.26
      }),
      createElement(SpatialButton, {
        color: playbackState.playlistOpen ? ORANGE : CYAN,
        label: "\u2630",
        onPress: () => {
          setRateOpen(false);
          void runCommand("toggle-playlist");
        },
        position: "0.62 -0.13 0.035",
        testId: "xr-spatial-player-list"
      }),
      createElement(SpatialButton, {
        color: MAGENTA,
        label: "\u00D7",
        onPress: closeOverlays,
        position: "0.93 -0.13 0.035",
        testId: "xr-spatial-player-reset",
        width: 0.27
      }),
      rateOpen
        ? createElement(
            "a-entity",
            {
              "data-testid": "xr-spatial-player-rate-menu",
              position: "0.22 -0.42 0.08"
            },
            createElement("a-box", {
              depth: "0.035",
              height: "0.22",
              material: material(DEEP, 0.76, 0.2),
              width: "1.18"
            }),
            ...RATES.map((rate, index) =>
              createElement(SpatialButton, {
                key: rate,
                color: rate === playbackState.playbackRate ? ORANGE : CYAN,
                label: `${rate}x`,
                onPress: () => {
                  setRateOpen(false);
                  void runCommand("set-rate", { playbackRate: rate });
                },
                position: `${-0.42 + index * 0.28} 0 0.03`,
                testId: `xr-spatial-player-rate-${rate}`,
                width: 0.22
              })
            )
          )
        : null
    ),
    createElement(
      "a-entity",
      {
        "data-layer": "playlist-panel-root",
        "data-testid": "xr-spatial-player-playlist",
        animation__open: playbackState.playlistOpen
          ? "property: scale; from: 0.9 0.72 0.9; to: 1 1 1; dur: 180; easing: easeOutQuad"
          : undefined,
        position: "-0.82 1.38 -1.75",
        scale: playbackState.playlistOpen ? "1 1 1" : "0.9 0.72 0.9",
        visible: playbackState.playlistOpen
      },
      createElement("a-box", {
        "data-layer": "playlist-shadow",
        depth: "0.035",
        height: "1.08",
        material: material(DEEP, 0.36, 0.08),
        position: "0 -0.39 -0.045",
        width: "1.11"
      }),
      createElement("a-box", {
        "data-layer": "playlist-glass",
        depth: "0.04",
        height: "1.02",
        material: material(PANEL, 0.82, 0.32),
        position: "0 -0.37 -0.014",
        width: "1.05"
      }),
      createElement("a-plane", {
        "data-layer": "playlist-inner-wash",
        height: "0.92",
        material: material("#ffffff", 0.06, 0.02),
        position: "0 -0.37 0.012",
        width: "0.93"
      }),
      createElement("a-plane", {
        "data-layer": "playlist-top-rim",
        height: "0.012",
        material: material(MAGENTA, 0.95, 0.78),
        position: "0 0.14 0.014",
        width: "0.92"
      }),
      createElement("a-text", {
        "data-layer": "playlist-heading-text",
        ...textProps("> MEDIA LIST", CYAN, 2),
        align: "left",
        position: "-0.43 0.2 0.03",
        scale: "0.13 0.13 0.13"
      }),
      createElement(SpatialButton, {
        color: CYAN,
        disabled: safeOffset <= 0,
        label: "Up",
        onPress: () => setPlaylistOffset((offset) => clamp(offset - 1, 0, maxOffset)),
        position: "0.26 0.2 0.03",
        testId: "xr-spatial-playlist-up",
        width: 0.18
      }),
      createElement(SpatialButton, {
        color: CYAN,
        disabled: safeOffset >= maxOffset,
        label: "Down",
        onPress: () => setPlaylistOffset((offset) => clamp(offset + 1, 0, maxOffset)),
        position: "0.41 0.2 0.03",
        testId: "xr-spatial-playlist-down",
        width: 0.22
      }),
      ...visibleSources.map((source, index) =>
        createElement(PlaylistRow, {
          key: source.id,
          isActive: source.id === playbackState.selectedSourceId,
          onSelect: () => void runCommand("select-source", { sourceId: source.id }),
          position: `0 ${0.035 - index * 0.15} 0.035`,
          source
        })
      )
    )
  );
}
