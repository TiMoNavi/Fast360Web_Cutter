"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { patchAFrameSceneXrBindingFallback, requestAFrameMetaVrSession } from "./aframeXrCompat";
import { useAFrameRuntime } from "./useAFrameRuntime";

type ProbeModule = "framing" | "fov" | "effects" | "session" | null;
type GazeMode = "idle" | "head" | "ray";
type ProbeStatus = "pass" | "fail" | "info";
type ProbeEvent = {
  at: string;
  data?: unknown;
  source: string;
  status: ProbeStatus;
  step: string;
};

type AFrameSceneElement = HTMLElement & {
  hasLoaded?: boolean;
  is?: (state: string) => boolean;
  renderer?: {
    xr?: {
      isPresenting?: boolean;
    };
  };
};

const CYAN = "#00ffff";
const MAGENTA = "#ff00ff";
const ORANGE = "#ff9900";
const WHITE = "#f7ffff";
const PANEL = "#15102e";
const DEEP = "#05020c";
const DANGER = "#ff5b8a";
const hiddenStateStyle = {
  height: "1px",
  opacity: 0.01,
  overflow: "hidden",
  pointerEvents: "none",
  position: "absolute",
  width: "1px",
  zIndex: 3
} as const;

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: XRSystem }).xr;
}

function material(color: string, opacity = 0.86, emissiveIntensity = 0.28) {
  return `shader: standard; color: ${color}; emissive: ${color}; emissiveIntensity: ${emissiveIntensity}; metalness: 0.04; roughness: 0.38; opacity: ${opacity}; transparent: true`;
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

function makeRunId() {
  return `quest-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function moduleLabel(module: ProbeModule) {
  if (module === "framing") {
    return "FRAMING";
  }
  if (module === "fov") {
    return "FOV";
  }
  if (module === "effects") {
    return "EFFECTS";
  }
  if (module === "session") {
    return "SESSION";
  }
  return "NONE";
}

function SpatialButton({
  color = CYAN,
  label,
  onPress,
  position,
  testId,
  width = 0.34
}: {
  color?: string;
  label: string;
  onPress: () => void;
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

    function handleClick(event: Event) {
      event.stopPropagation();
      el?.setAttribute("animation__press", "property: scale; to: 0.94 0.9 0.94; dur: 50; dir: alternate; loop: 1");
      onPress();
    }

    el.addEventListener("click", handleClick);
    return () => el.removeEventListener("click", handleClick);
  }, [onPress]);

  return createElement(
    "a-entity",
    {
      ref,
      className: "clickable",
      "data-testid": testId,
      position
    },
    createElement("a-box", {
      depth: "0.054",
      height: "0.13",
      material: material(DEEP, 0.5, 0.04),
      position: "0 -0.012 -0.036",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.05",
      height: "0.13",
      material: material(color, 0.8, 0.46),
      width: String(width)
    }),
    createElement("a-text", {
      ...textProps(label, WHITE, 1.5),
      position: "0 -0.014 0.034",
      scale: "0.13 0.13 0.13"
    })
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
      material: material(DEEP, 0.46, 0.05),
      position: "0 -0.026 -0.052",
      width: String(width)
    }),
    createElement("a-box", {
      depth: "0.038",
      height: String(height),
      material: material(PANEL, 0.78, 0.24),
      width: String(width)
    }),
    createElement("a-plane", {
      height: "0.012",
      material: material(CYAN, 0.88, 0.58),
      position: `0 ${height / 2 - 0.026} 0.032`,
      width: String(width - 0.14)
    }),
    createElement("a-plane", {
      height: "0.01",
      material: material(MAGENTA, 0.72, 0.5),
      position: `0 ${-height / 2 + 0.026} 0.032`,
      width: String(width - 0.18)
    }),
    children
  );
}

export function AFrameQuestSpatialEditorProbe() {
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const rightControllerRef = useRef<HTMLElement | null>(null);
  const leftControllerRef = useRef<HTMLElement | null>(null);
  const autoRanRef = useRef(false);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  const [activeModule, setActiveModule] = useState<ProbeModule>(null);
  const [events, setEvents] = useState<ProbeEvent[]>([]);
  const [fov, setFov] = useState(82);
  const [gazeMode, setGazeMode] = useState<GazeMode>("idle");
  const [locked, setLocked] = useState(false);
  const [playerHidden, setPlayerHidden] = useState(false);
  const [radialOpen, setRadialOpen] = useState(false);
  const [runId] = useState(() =>
    typeof window === "undefined" ? makeRunId() : new URLSearchParams(window.location.search).get("runId") ?? makeRunId()
  );
  const [vrSupported, setVrSupported] = useState<"checking" | "supported" | "unsupported">("checking");
  const [vrState, setVrState] = useState<"idle" | "requesting" | "presenting" | "failed">("idle");

  const state = useMemo(
    () => ({
      activeModule,
      eventCount: events.length,
      fov,
      gazeMode,
      locked,
      playerHidden,
      radialOpen,
      runId,
      vrState,
      vrSupported
    }),
    [activeModule, events.length, fov, gazeMode, locked, playerHidden, radialOpen, runId, vrState, vrSupported]
  );

  const log = useCallback(
    (step: string, status: ProbeStatus = "info", data?: unknown, source = "quest-spatial-editor-probe") => {
      const event = {
        at: new Date().toISOString(),
        data,
        source,
        status,
        step
      } satisfies ProbeEvent;

      setEvents((value) => [...value.slice(-79), event]);
      void fetch("/api/xr/quest-spatial-probe/events", {
        body: JSON.stringify({ ...event, runId }),
        headers: { "content-type": "application/json" },
        method: "POST"
      }).catch(() => undefined);
    },
    [runId]
  );

  const fovIn = useCallback(() => {
    setFov((value) => Math.min(112, value + 4));
    log("fov-in", "pass");
  }, [log]);

  const fovOut = useCallback(() => {
    setFov((value) => Math.max(48, value - 4));
    log("fov-out", "pass");
  }, [log]);

  const triggerDown = useCallback(() => {
    setGazeMode("head");
    log("trigger-hold-head-gaze", "pass");
  }, [log]);

  const triggerUp = useCallback(() => {
    setGazeMode("idle");
    setLocked(true);
    log("trigger-release-lock-patch", "pass", { patch: "mock-flush", source: "head-gaze" });
  }, [log]);

  const gripDown = useCallback(() => {
    setGazeMode("ray");
    log("grip-hold-controller-ray", "pass");
  }, [log]);

  const gripUp = useCallback(() => {
    setGazeMode("idle");
    setLocked(true);
    log("grip-release-lock-ray", "pass", { patch: "mock-flush", source: "controller-ray" });
  }, [log]);

  const openModule = useCallback(
    (module: ProbeModule) => {
      setActiveModule(module);
      log("open-workbench-module", "pass", { module });
    },
    [log]
  );

  const closeOverlays = useCallback(() => {
    setActiveModule(null);
    setRadialOpen(false);
    log("b-close-overlay", "pass");
  }, [log]);

  const togglePlayer = useCallback(() => {
    setPlayerHidden((value) => !value);
    log("toggle-player-ui", "pass");
  }, [log]);

  const commitRadial = useCallback(
    (action: string) => {
      setRadialOpen(false);
      if (action === "fov-in") {
        setFov((value) => Math.min(112, value + 4));
      }
      if (action === "fov-out") {
        setFov((value) => Math.max(48, value - 4));
      }
      if (action === "hide-ui") {
        setPlayerHidden((value) => !value);
      }
      log("radial-release-commit", "pass", { action });
    },
    [log]
  );

  useEffect(() => {
    log("page-loaded", "info", {
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent
    });
  }, [log]);

  useEffect(() => {
    let cancelled = false;
    const xr = getNavigatorXr();

    if (!xr?.isSessionSupported) {
      setVrSupported("unsupported");
      log("navigator-xr-missing", "fail", { isSecureContext: window.isSecureContext });
      return () => {
        cancelled = true;
      };
    }

    log("navigator-xr-present", "pass");
    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (cancelled) {
          return;
        }
        setVrSupported(supported ? "supported" : "unsupported");
        log("immersive-vr-support", supported ? "pass" : "fail", { supported });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setVrSupported("unsupported");
        log("immersive-vr-support-error", "fail", { message: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [log]);

  useEffect(() => {
    if (!aframeReady) {
      return;
    }

    const sceneEl = sceneRef.current;
    if (!sceneEl) {
      return;
    }

    let cleanup = () => {};
    let cancelled = false;

    function installPatch() {
      if (cancelled || !sceneEl) {
        return;
      }
      cleanup = patchAFrameSceneXrBindingFallback(sceneEl);
      log("aframe-scene-loaded", "pass");
    }

    if (sceneEl.hasLoaded) {
      installPatch();
    } else {
      sceneEl.addEventListener("loaded", installPatch, { once: true });
    }

    return () => {
      cancelled = true;
      sceneEl.removeEventListener("loaded", installPatch);
      cleanup();
    };
  }, [aframeReady, log]);

  useEffect(() => {
    const controllers = [rightControllerRef.current, leftControllerRef.current].filter(Boolean) as HTMLElement[];

    controllers.forEach((controller) => {
      controller.addEventListener("triggerdown", triggerDown);
      controller.addEventListener("triggerup", triggerUp);
      controller.addEventListener("gripdown", gripDown);
      controller.addEventListener("gripup", gripUp);
      controller.addEventListener("abuttondown", () => {
        setRadialOpen(true);
        log("a-hold-open-radial", "pass");
      });
      controller.addEventListener("thumbstickdown", () => {
        setRadialOpen(true);
        log("thumbstick-click-open-radial", "pass");
      });
      controller.addEventListener("bbuttondown", closeOverlays);
      controller.addEventListener("thumbstickmoved", (event) => {
        const detail = (event as CustomEvent<{ x?: number; y?: number }>).detail;
        const x = detail?.x ?? 0;
        const y = detail?.y ?? 0;

        if (y > 0.55) {
          fovIn();
        } else if (y < -0.55) {
          fovOut();
        } else if (Math.abs(x) > 0.55) {
          log("thumbstick-rate-change", "pass", { direction: x > 0 ? "right" : "left" });
        }
      });
    });

    function keydown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "t") {
        triggerDown();
      } else if (event.key.toLowerCase() === "g") {
        gripDown();
      } else if (event.key.toLowerCase() === "a") {
        setRadialOpen(true);
        log("keyboard-open-radial", "pass");
      } else if (event.key.toLowerCase() === "b" || event.key === "Escape") {
        closeOverlays();
      } else if (event.key === "[") {
        fovOut();
      } else if (event.key === "]") {
        fovIn();
      }
    }

    function keyup(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "t") {
        triggerUp();
      } else if (event.key.toLowerCase() === "g") {
        gripUp();
      }
    }

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);

    return () => {
      controllers.forEach((controller) => {
        controller.removeEventListener("triggerdown", triggerDown);
        controller.removeEventListener("triggerup", triggerUp);
        controller.removeEventListener("gripdown", gripDown);
        controller.removeEventListener("gripup", gripUp);
        controller.removeEventListener("bbuttondown", closeOverlays);
      });
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, [closeOverlays, fovIn, fovOut, gripDown, gripUp, log, triggerDown, triggerUp]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!aframeReady || autoRanRef.current || params.get("auto") !== "1") {
      return;
    }

    autoRanRef.current = true;
    const timers = [
      window.setTimeout(() => openModule("framing"), 120),
      window.setTimeout(triggerDown, 260),
      window.setTimeout(triggerUp, 430),
      window.setTimeout(gripDown, 590),
      window.setTimeout(gripUp, 760),
      window.setTimeout(() => openModule("fov"), 920),
      window.setTimeout(fovIn, 1080),
      window.setTimeout(fovOut, 1240),
      window.setTimeout(() => setRadialOpen(true), 1400),
      window.setTimeout(() => commitRadial("cut"), 1580),
      window.setTimeout(togglePlayer, 1740),
      window.setTimeout(togglePlayer, 1900),
      window.setTimeout(() => openModule("effects"), 2060),
      window.setTimeout(closeOverlays, 2220),
      window.setTimeout(() => log("auto-sequence-complete", "pass"), 2380)
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [
    aframeReady,
    closeOverlays,
    commitRadial,
    fovIn,
    fovOut,
    gripDown,
    gripUp,
    log,
    openModule,
    togglePlayer,
    triggerDown,
    triggerUp
  ]);

  async function enterVr() {
    const sceneEl = sceneRef.current;

    if (!sceneEl?.renderer?.xr || sceneEl.is?.("vr-mode")) {
      log("enter-vr-not-ready", "fail");
      return;
    }

    try {
      setVrState("requesting");
      log("enter-vr-request", "info");
      const { session, usedLegacyLayerFallback } = await requestAFrameMetaVrSession(sceneEl);
      session.addEventListener("end", () => {
        setVrState("idle");
        log("xr-session-ended", "info");
      });
      setVrState("presenting");
      log("xr-session-presenting", "pass", { usedLegacyLayerFallback });
    } catch (error) {
      setVrState("failed");
      log("enter-vr-failed", "fail", { message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (loadError) {
    return (
      <main className="quest-probe-page">
        <div className="quest-probe-message" role="alert">
          {loadError}
        </div>
      </main>
    );
  }

  return (
    <main
      className="quest-probe-page"
      style={{
        background: "#05020c",
        color: WHITE,
        fontFamily: '"Share Tech Mono", Consolas, ui-monospace, monospace',
        minHeight: "100vh"
      }}
    >
      <section
        className="quest-probe-stage"
        data-testid="quest-spatial-editor-probe"
        style={{ minHeight: "100vh", overflow: "hidden", position: "relative" }}
      >
        <div
          className="quest-probe-hud"
          style={{
            backdropFilter: "blur(14px)",
            background: "rgba(9, 3, 24, 0.78)",
            border: "1px solid rgba(0, 255, 255, 0.42)",
            borderRadius: 8,
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.38)",
            display: "grid",
            gap: 10,
            left: 18,
            maxWidth: 960,
            padding: 14,
            position: "absolute",
            right: 18,
            top: 18,
            zIndex: 3
          }}
        >
          <div>
            <p className="muted" style={{ margin: 0 }}>
              Quest 3 Spatial Editor Probe
            </p>
            <h1 style={{ fontSize: 22, margin: 0 }}>空间操作探针</h1>
          </div>
          <div className="quest-probe-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              data-testid="quest-probe-enter-vr"
              onClick={() => void enterVr()}
              style={{
                background: CYAN,
                border: 0,
                borderRadius: 6,
                color: DEEP,
                cursor: "pointer",
                font: "inherit",
                fontWeight: 900,
                minHeight: 36,
                padding: "0 13px"
              }}
              type="button"
            >
              {vrState === "presenting" ? "VR Running" : "Enter VR"}
            </button>
            <button
              data-testid="quest-probe-run-auto"
              onClick={() => log("manual-run-marker", "pass")}
              style={{
                background: CYAN,
                border: 0,
                borderRadius: 6,
                color: DEEP,
                cursor: "pointer",
                font: "inherit",
                fontWeight: 900,
                minHeight: 36,
                padding: "0 13px"
              }}
              type="button"
            >
              Mark
            </button>
          </div>
          <div
            className="quest-probe-status-line"
            style={{ color: "#9fefff", display: "flex", flexWrap: "wrap", fontSize: 12, gap: 8 }}
          >
            {[
              `run: ${runId}`,
              `immersive-vr: ${vrSupported}`,
              `vr: ${vrState}`,
              `module: ${moduleLabel(activeModule)}`,
              `gaze: ${gazeMode}`,
              `fov: ${fov}`
            ].map((item) => (
              <span key={item} style={{ background: "rgba(255, 255, 255, 0.08)", borderRadius: 4, padding: "4px 7px" }}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {!aframeReady ? (
          <div
            className="quest-probe-message"
            style={{
              background: "rgba(9, 3, 24, 0.78)",
              border: "1px solid rgba(255, 153, 0, 0.6)",
              borderRadius: 8,
              bottom: 18,
              left: 18,
              padding: "10px 12px",
              position: "absolute",
              zIndex: 3
            }}
          >
            Loading A-Frame...
          </div>
        ) : null}
        {aframeReady
          ? createElement(
              "a-scene",
              {
                ref: sceneRef,
                embedded: true,
                renderer: "colorManagement: true",
                webxr: "optionalFeatures: local-floor, bounded-floor",
                "xr-mode-ui": "enabled: false",
                cursor: "rayOrigin: mouse",
                raycaster: "objects: .clickable",
                style: { height: "100vh", width: "100%" }
              },
              createElement("a-sky", {
                color: "#08030f"
              }),
              createElement("a-entity", {
                light: "type: ambient; color: #eaf7ff; intensity: 0.56"
              }),
              createElement("a-entity", {
                light: `type: point; color: ${CYAN}; intensity: 0.9; distance: 5`,
                position: "-1.4 2 -1.2"
              }),
              createElement("a-entity", {
                geometry: "primitive: torus; radius: 3.2; radiusTubular: 0.004; segmentsTubular: 8",
                material: material(CYAN, 0.18, 0.2),
                position: "0 0 -2.1",
                rotation: "90 0 0"
              }),
              createElement(
                "a-entity",
                {
                  "data-testid": "quest-probe-viewing-layer",
                  position: "0 1.58 -1.92"
                },
                createElement("a-ring", {
                  material: material(gazeMode === "idle" ? WHITE : ORANGE, 0.82, 0.62),
                  radiusInner: "0.16",
                  radiusOuter: "0.18"
                }),
                createElement("a-plane", {
                  height: "0.006",
                  material: material(WHITE, 0.76, 0.48),
                  width: "0.82"
                }),
                createElement("a-text", {
                  ...textProps(`${gazeMode.toUpperCase()} / FOV ${fov} / ${locked ? "LOCKED" : "READY"}`, ORANGE, 2.4),
                  position: "0 -0.32 0.02",
                  scale: "0.11 0.11 0.11"
                })
              ),
              playerHidden
                ? createElement(SpatialButton, {
                    label: "SHOW UI",
                    onPress: togglePlayer,
                    position: "-1.02 1.08 -1.72",
                    testId: "quest-probe-show-player",
                    width: 0.42
                  })
                : createElement(
                    "a-entity",
                    {
                      "data-testid": "quest-probe-player-panel",
                      position: "-1.08 1.36 -1.72",
                      rotation: "0 14 0"
                    },
                    createElement(
                      GlassPanel,
                      {
                        height: 0.9,
                        testId: "quest-probe-player-glass",
                        width: 0.78
                      },
                      createElement("a-text", {
                        ...textProps("PLAYBACK\nmock clip\n1.0x", WHITE, 1.6),
                        position: "0 0.22 0.045",
                        scale: "0.11 0.11 0.11"
                      }),
                      createElement(SpatialButton, {
                        color: DANGER,
                        label: "HIDE",
                        onPress: togglePlayer,
                        position: "0 -0.26 0.06",
                        testId: "quest-probe-hide-player",
                        width: 0.3
                      })
                    )
                  ),
              createElement(
                "a-entity",
                {
                  "data-testid": "quest-probe-workbench",
                  position: "0 0.72 -1.18",
                  rotation: "-62 0 0"
                },
                createElement(
                  GlassPanel,
                  {
                    height: 0.74,
                    testId: "quest-probe-workbench-glass",
                    width: 2.55
                  },
                  createElement("a-text", {
                    ...textProps("QUEST EDIT DESK // unit operations", CYAN, 3.6),
                    position: "0 0.28 0.045",
                    scale: "0.11 0.11 0.11"
                  }),
                  createElement(SpatialButton, {
                    color: activeModule === "framing" ? ORANGE : CYAN,
                    label: "FRAME",
                    onPress: () => openModule("framing"),
                    position: "-0.92 0.06 0.06",
                    testId: "quest-probe-module-framing"
                  }),
                  createElement(SpatialButton, {
                    color: activeModule === "fov" ? ORANGE : MAGENTA,
                    label: "FOV",
                    onPress: () => openModule("fov"),
                    position: "-0.5 0.06 0.06",
                    testId: "quest-probe-module-fov"
                  }),
                  createElement(SpatialButton, {
                    color: ORANGE,
                    label: "CUT",
                    onPress: () => log("desk-cut", "pass"),
                    position: "-0.1 0.06 0.06",
                    testId: "quest-probe-cut"
                  }),
                  createElement(SpatialButton, {
                    color: locked ? ORANGE : CYAN,
                    label: locked ? "UNLOCK" : "LOCK",
                    onPress: () => {
                      setLocked((value) => !value);
                      log("desk-toggle-lock", "pass");
                    },
                    position: "0.32 0.06 0.06",
                    testId: "quest-probe-lock"
                  }),
                  createElement(SpatialButton, {
                    color: CYAN,
                    label: "SAVE",
                    onPress: () => log("desk-save-patch", "pass", { patch: "mock-flush" }),
                    position: "0.76 0.06 0.06",
                    testId: "quest-probe-save"
                  }),
                  createElement(SpatialButton, {
                    color: activeModule === "effects" ? ORANGE : MAGENTA,
                    label: "FX",
                    onPress: () => openModule("effects"),
                    position: "-0.28 -0.18 0.06",
                    testId: "quest-probe-module-effects"
                  }),
                  createElement(SpatialButton, {
                    color: activeModule === "session" ? ORANGE : CYAN,
                    label: "SESSION",
                    onPress: () => openModule("session"),
                    position: "0.18 -0.18 0.06",
                    testId: "quest-probe-module-session",
                    width: 0.42
                  }),
                  activeModule
                    ? createElement(
                        "a-entity",
                        {
                          "data-testid": "quest-probe-extension-panel",
                          position: "0 0.48 -0.24",
                          rotation: "-45 0 0"
                        },
                        createElement(
                          GlassPanel,
                          {
                            height: 0.56,
                            testId: "quest-probe-extension-glass",
                            width: 1.56
                          },
                          createElement("a-text", {
                            ...textProps(`${moduleLabel(activeModule)} PANEL`, ORANGE, 2.6),
                            position: "0 0.16 0.045",
                            scale: "0.12 0.12 0.12"
                          }),
                          activeModule === "fov"
                            ? createElement(
                                "a-entity",
                                null,
                                createElement(SpatialButton, {
                                  color: MAGENTA,
                                  label: "FOV-",
                                  onPress: fovOut,
                                  position: "-0.24 -0.12 0.06",
                                  testId: "quest-probe-fov-out"
                                }),
                                createElement(SpatialButton, {
                                  color: CYAN,
                                  label: "FOV+",
                                  onPress: fovIn,
                                  position: "0.18 -0.12 0.06",
                                  testId: "quest-probe-fov-in"
                                })
                              )
                            : createElement("a-text", {
                                ...textProps("fixed size / 45 deg / one module", WHITE, 2.4),
                                position: "0 -0.08 0.045",
                                scale: "0.095 0.095 0.095"
                              }),
                          createElement(SpatialButton, {
                            color: DANGER,
                            label: "CLOSE",
                            onPress: closeOverlays,
                            position: "0.52 -0.12 0.06",
                            testId: "quest-probe-close",
                            width: 0.32
                          })
                        )
                      )
                    : null
                )
              ),
              createElement(
                "a-entity",
                {
                  "data-testid": "quest-probe-radial-root",
                  position: "0.92 1.08 -1.38",
                  rotation: "0 -18 0"
                },
                radialOpen
                  ? createElement(
                      "a-entity",
                      {
                        "data-testid": "quest-probe-radial-wheel"
                      },
                      createElement("a-ring", {
                        material: material(PANEL, 0.68, 0.3),
                        radiusInner: "0.22",
                        radiusOuter: "0.46"
                      }),
                      createElement(SpatialButton, {
                        color: ORANGE,
                        label: "CUT",
                        onPress: () => commitRadial("cut"),
                        position: "0 0.32 0.04",
                        testId: "quest-probe-radial-cut",
                        width: 0.26
                      }),
                      createElement(SpatialButton, {
                        color: CYAN,
                        label: "FOV+",
                        onPress: () => commitRadial("fov-in"),
                        position: "0.3 0 0.04",
                        testId: "quest-probe-radial-fov-in",
                        width: 0.26
                      }),
                      createElement(SpatialButton, {
                        color: MAGENTA,
                        label: "FOV-",
                        onPress: () => commitRadial("fov-out"),
                        position: "-0.3 0 0.04",
                        testId: "quest-probe-radial-fov-out",
                        width: 0.26
                      }),
                      createElement(SpatialButton, {
                        color: DANGER,
                        label: "HIDE",
                        onPress: () => commitRadial("hide-ui"),
                        position: "0 -0.32 0.04",
                        testId: "quest-probe-radial-hide",
                        width: 0.28
                      })
                    )
                  : null,
                createElement(SpatialButton, {
                  color: radialOpen ? ORANGE : CYAN,
                  label: radialOpen ? "OPEN" : "HOLD A",
                  onPress: () => {
                    setRadialOpen(true);
                    log("open-radial-button", "pass");
                  },
                  position: "0 0 0.05",
                  testId: "quest-probe-radial-open",
                  width: 0.42
                })
              ),
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
                  opacity: "0.72",
                  raycaster: "objects: .clickable"
                })
              )
            )
          : null}

        <pre className="quest-probe-json" data-testid="quest-probe-state" style={hiddenStateStyle}>
          {JSON.stringify(state)}
        </pre>
        <pre className="quest-probe-events" data-testid="quest-probe-events" style={hiddenStateStyle}>
          {JSON.stringify(events.slice(-16), null, 2)}
        </pre>
      </section>
    </main>
  );
}
