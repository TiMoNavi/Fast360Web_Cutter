"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultCropMaskState,
  registerAFrameCropViewportMaskComponents,
  WEBXR_CROP_MASK_CHANGE_EVENT,
  type CropMaskState
} from "./webxr/AFrameCropViewportMask";
import { PcTrajectoryRippleCorrector, type PcTrajectoryRippleCorrectorHandle } from "./controls/PcTrajectoryRippleCorrector";
import { requestAFrameMetaVrSession } from "./webxr/aframeXrCompat";
import { useAFrameTimelineBridge, type TimelineBridgeStatus } from "./data/timeline-bridge";
import { useAFrameRuntime } from "./webxr/useAFrameRuntime";
import { AFrame360VideoControlBridge } from "./controls/AFrame360VideoControlBridge";
import { use360VideoPlaybackController } from "./controls/use360VideoPlaybackController";
import { usePcEditorControls } from "./controls/usePcEditorControls";
import type { AFrame360VideoCommand, AFrame360VideoCommandPayload, AFrame360VideoSource } from "./controls/types";
import type { AFrameEntityLike, Vector3Like, ViewTargetPose } from "./data/timeline-bridge/types";
import { apiUrl, renderTest, switchWebXrPlayerSession, updateCutSessionVideo } from "@/lib/api";
import { AFrameEditorScene } from "./webxr/AFrameEditorScene";
import { PcBgmControls } from "./UI/PcBgmControls";
import { PcEditorDebugState } from "./UI/PcEditorDebugState";
import { PcEffectPreview } from "./UI/PcEffectPreview";
import { PcEffectsPanel } from "./UI/PcEffectsPanel";
import { PcMaskOpacityControls } from "./UI/PcMaskOpacityControls";
import { PcPlayerControls } from "./UI/PcPlayerControls";
import { PcWorkbenchPanel } from "./UI/PcWorkbenchPanel";
import styles from "./UI/PcWebXrEditor.module.css";

export type PcWebXrEditorProps = {
  enableTimelineBridge?: boolean;
  initialSourceId?: string | null;
  initialSources?: AFrame360VideoSource[];
  pcWorkbench?: boolean;
  playbackRate?: number;
  singleSourceTitle?: string;
  sourceUrl?: string;
  sourceListUrl?: string;
  sourceMode?: "list" | "provided" | "single";
  sessionSwitchMode?: "fixed-session" | "player-active-session";
  timelineSessionId?: string;
  timelineVideoId?: string;
  videoId?: string;
};

const DEFAULT_SOURCE_URL = "/api/sample-video";
const DEFAULT_VIDEO_ID = "aframe-360-source-video";

type BrowserXr = {
  isSessionSupported?: (mode: XRSessionMode) => Promise<boolean>;
};

type AFrameSceneElement = HTMLElement & {
  enterVR?: (arMode?: boolean, offerSession?: boolean) => Promise<unknown>;
  renderer?: {
    xr?: {
      isPresenting?: boolean;
    };
  };
  xrSession?: XRSession;
};

type QuestProbeStatus = "pass" | "fail" | "info";
type CropWorkflowStatus = "idle" | "recording" | "ending" | "ready" | "rendering" | "done" | "error";

type QuestProbeInputSource = XRInputSource & {
  gamepad?: Gamepad;
};

type QuestProbeXrInputSource = QuestProbeInputSource & {
  gripSpace?: XRSpace;
  targetRaySpace?: XRSpace;
};

type ProbeAFrameGlobal = Window &
  typeof globalThis & {
    AFRAME?: {
      THREE?: {
        Vector3?: new (x?: number, y?: number, z?: number) => Vector3Like;
      };
    };
  };

function getNavigatorXr() {
  return (navigator as Navigator & { xr?: BrowserXr }).xr;
}

function postQuestProbeEvent(runId: string, step: string, status: QuestProbeStatus = "info", data?: unknown) {
  void fetch("/api/xr/quest-spatial-probe/events", {
    body: JSON.stringify({
      at: new Date().toISOString(),
      data,
      runId,
      source: "pc-webxr-editor-session",
      status,
      step
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }).catch(() => undefined);
}

function roundProbeNumber(value: number | undefined | null, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function quaternionToProbePose(orientation: DOMPointReadOnly | DOMPointInit | undefined) {
  if (!orientation) {
    return null;
  }

  const x = orientation.x ?? 0;
  const y = orientation.y ?? 0;
  const z = orientation.z ?? 0;
  const w = orientation.w ?? 1;
  const forwardX = -2 * (x * z + w * y);
  const forwardY = -2 * (y * z - w * x);
  const forwardZ = -(1 - 2 * (x * x + y * y));
  const yaw = normalizeProbeYaw(Math.atan2(forwardX, -forwardZ) * 180 / Math.PI);
  const pitch = Math.max(-85, Math.min(85, Math.asin(Math.max(-1, Math.min(1, forwardY))) * 180 / Math.PI));
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * 180 / Math.PI;

  return {
    pitch: roundProbeNumber(pitch),
    roll: roundProbeNumber(roll),
    yaw: roundProbeNumber(yaw)
  };
}

function normalizeProbeYaw(yaw: number) {
  let nextYaw = yaw;
  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }
  return Object.is(nextYaw, -0) ? 0 : nextYaw;
}

function readProbeTargetPose(entityEl: AFrameEntityLike | null, input: ViewTargetPose["input"]) {
  const object3D = entityEl?.object3D;
  const Vector3 = (window as ProbeAFrameGlobal).AFRAME?.THREE?.Vector3;

  if (!object3D?.getWorldDirection || !Vector3) {
    return null;
  }

  const direction = object3D.getWorldDirection(new Vector3());
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return {
    input,
    pitch: Math.max(-85, Math.min(85, Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI)),
    yaw: normalizeProbeYaw(Math.atan2(x, -z) * 180 / Math.PI)
  } satisfies ViewTargetPose;
}

function readProbeRotation(entityEl: AFrameEntityLike | null) {
  const object3D = entityEl?.object3D as ({ rotation?: { x?: number; y?: number; z?: number } } & AFrameEntityLike["object3D"]) | undefined;
  const rotation = object3D?.rotation;
  const radToDeg = 180 / Math.PI;

  if (!rotation) {
    return null;
  }

  return {
    pitch: roundProbeNumber((rotation.x ?? 0) * radToDeg),
    roll: roundProbeNumber((rotation.z ?? 0) * radToDeg),
    yaw: roundProbeNumber((rotation.y ?? 0) * radToDeg)
  };
}

function summarizeAFrameInputEvent(event: Event, hand: "left" | "right" | "scene") {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail;
  const payload: Record<string, unknown> = {
    eventType: event.type,
    hand
  };

  if (detail && typeof detail === "object") {
    for (const key of ["axis", "button", "id", "pressed", "state", "value", "x", "y"] as const) {
      const value = detail[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        payload[key] = value;
      } else if (Array.isArray(value)) {
        payload[key] = value.filter((item) => typeof item === "number").map((item) => roundProbeNumber(item as number));
      }
    }
  }

  return payload;
}

function summarizeXrInputSource(source: QuestProbeInputSource) {
  const gamepad = source.gamepad;

  return {
    gamepad: gamepad
      ? {
          axes: Array.from(gamepad.axes ?? []).map((axis) => roundProbeNumber(axis, 3)),
          buttons: Array.from(gamepad.buttons ?? []).map((button, index) => ({
            index,
            pressed: button.pressed,
            touched: button.touched,
            value: roundProbeNumber(button.value, 3)
          })),
          id: gamepad.id,
          mapping: gamepad.mapping
        }
      : null,
    handedness: source.handedness,
    profiles: Array.from(source.profiles ?? []),
    targetRayMode: source.targetRayMode
  };
}

export function PcWebXrEditor({
  enableTimelineBridge = false,
  initialSourceId,
  initialSources: providedInitialSources,
  pcWorkbench = false,
  playbackRate,
  singleSourceTitle = "Session source",
  sourceUrl = DEFAULT_SOURCE_URL,
  sourceListUrl,
  sourceMode = "list",
  sessionSwitchMode = "fixed-session",
  timelineSessionId,
  timelineVideoId,
  videoId = DEFAULT_VIDEO_ID
}: PcWebXrEditorProps) {
  const cameraRef = useRef<HTMLElement | null>(null);
  const leftControllerRef = useRef<HTMLElement | null>(null);
  const rightControllerRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<AFrameSceneElement | null>(null);
  const activeXrSessionRef = useRef<XRSession | null>(null);
  const stopXrFrameProbeRef = useRef<(() => void) | null>(null);
  const trajectoryCorrectorRef = useRef<PcTrajectoryRippleCorrectorHandle | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoElementKey, setVideoElementKey] = useState(0);
  const [cropMaskReady, setCropMaskReady] = useState(false);
  const [cropMaskState, setCropMaskState] = useState<CropMaskState>(() => defaultCropMaskState());
  const [entryStatus, setEntryStatus] = useState("Checking Meta WebXR support...");
  const [rendererPresenting, setRendererPresenting] = useState(false);
  const [sessionState, setSessionState] = useState<"idle" | "requesting" | "presenting" | "ended" | "error">("idle");
  const [timelineStatus, setTimelineStatus] = useState<TimelineBridgeStatus | null>(null);
  const [cropWorkflowStatus, setCropWorkflowStatus] = useState<CropWorkflowStatus>("idle");
  const [cropWorkflowMessage, setCropWorkflowMessage] = useState("Ready to record a crop path.");
  const [cropExportId, setCropExportId] = useState<string | null>(null);
  const [activeTimelineSessionId, setActiveTimelineSessionId] = useState<string | undefined>(timelineSessionId);
  const [activeTimelineVideoId, setActiveTimelineVideoId] = useState<string | undefined>(timelineVideoId);
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("xr-auto-render-enabled");
    return stored === null ? true : stored === "true";
  });
  const [questProbeRunId, setQuestProbeRunId] = useState<string | null>(null);
  const { ready: aframeReady, error: loadError } = useAFrameRuntime();
  useEffect(() => {
    setActiveTimelineSessionId(timelineSessionId);
    setActiveTimelineVideoId(timelineVideoId);
    setTimelineStatus(null);
    setCropExportId(null);
  }, [timelineSessionId, timelineVideoId]);

  const resolvedInitialSources = useMemo<AFrame360VideoSource[] | undefined>(() => {
    if (sourceMode === "provided") {
      return providedInitialSources;
    }

    if (sourceMode !== "single") {
      return undefined;
    }

    return [
      {
        id: videoId,
        kind: sourceUrl.endsWith(".m3u8") ? "hls" : "mp4",
        sourceUrl,
        title: singleSourceTitle
      }
    ];
  }, [providedInitialSources, singleSourceTitle, sourceMode, sourceUrl, videoId]);
  const { playbackState, runCommand } = use360VideoPlaybackController({
    cameraRef,
    initialSourceId,
    initialSources: resolvedInitialSources,
    mediaElementKey: videoElementKey,
    sourceListUrl: sourceMode === "single" || sourceMode === "provided" ? null : sourceListUrl,
    videoRef
  });
  const bridgePlaybackRate = playbackRate ?? playbackState.playbackRate;
  const timelineBridge = useAFrameTimelineBridge({
    cameraRef,
    enabled: Boolean(enableTimelineBridge && activeTimelineSessionId && activeTimelineVideoId),
    legacyCropMaskWindowEvents: true,
    legacyWindowSemanticEvents: true,
    leftControllerRef,
    playbackRate: bridgePlaybackRate,
    rightControllerRef,
    sceneRef,
    sessionId: activeTimelineSessionId ?? "",
    videoId: activeTimelineVideoId ?? "",
    videoRef,
    viewTargetSource: pcWorkbench ? "crop-mask" : "xr-pose"
  });
  const logQuestProbe = useCallback(
    (step: string, status: QuestProbeStatus = "info", data?: unknown) => {
      if (!questProbeRunId) {
        return;
      }

      postQuestProbeEvent(questProbeRunId, step, status, data);
    },
    [questProbeRunId]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("questProbeRunId");

    if (!runId) {
      return;
    }

    setQuestProbeRunId(runId);
    postQuestProbeEvent(runId, "session-page-loaded", "info", {
      href: window.location.href,
      isSecureContext: window.isSecureContext,
      userAgent: navigator.userAgent,
      videoId: activeTimelineVideoId,
      sessionId: activeTimelineSessionId,
      sourceMode
    });
  }, [activeTimelineSessionId, activeTimelineVideoId, sourceMode]);

  useEffect(() => {
    if (!questProbeRunId) {
      return;
    }

    const xr = getNavigatorXr();

    if (!xr?.isSessionSupported) {
      logQuestProbe("navigator-xr-missing", "fail", { isSecureContext: window.isSecureContext });
      return;
    }

    logQuestProbe("navigator-xr-present", "pass");
    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        logQuestProbe("immersive-vr-support", supported ? "pass" : "fail", { supported });
      })
      .catch((error) => {
        logQuestProbe("immersive-vr-support-error", "fail", { message: error instanceof Error ? error.message : String(error) });
      });
  }, [logQuestProbe, questProbeRunId]);

  useEffect(() => {
    if (!enableTimelineBridge) {
      setTimelineStatus(null);
      return;
    }

    const update = () => setTimelineStatus(timelineBridge.getStatus());
    update();
    const timer = window.setInterval(update, 300);
    return () => window.clearInterval(timer);
  }, [enableTimelineBridge, timelineBridge]);

  useEffect(() => {
    if (!aframeReady) {
      setCropMaskReady(false);
      logQuestProbe("aframe-runtime-waiting", "info");
      return;
    }

    registerAFrameCropViewportMaskComponents();
    setCropMaskReady(true);
    logQuestProbe("aframe-runtime-ready", "pass");
  }, [aframeReady, logQuestProbe]);

  useEffect(() => {
    let cancelled = false;
    const xr = getNavigatorXr();

    if (!xr?.isSessionSupported) {
      setEntryStatus("navigator.xr is missing. Enable Meta WebXR support first.");
      return () => {
        cancelled = true;
      };
    }

    xr.isSessionSupported("immersive-vr")
      .then((supported) => {
        if (!cancelled) {
          setEntryStatus(supported ? "Meta WebXR is ready. Use Start Meta VR." : "WebXR exists, but immersive-vr is unavailable.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntryStatus("WebXR support check failed. Reopen the Meta WebXR panel and retry.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      setCropMaskState((event as CustomEvent<CropMaskState>).detail);
    };

    window.addEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
    return () => window.removeEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
  }, []);

  const {
    cameraLookRef,
    closeDomOverlays,
    cutHere,
    discardNotice,
    domPlaylistOpen,
    edgePanActive,
    effectSpeed,
    flushTimeline,
    handleMaskPointerDown,
    handleMaskPointerLeave,
    handleMaskPointerMove,
    handleMaskPointerUp,
    handleStageWheel,
    maskDragArmed,
    maskDragging,
    pauseSampling,
    progressPercent,
    rateWheelTarget,
    recordingRate,
    resetEffectSpeed,
    resetPlaybackRate,
    resetRecordingRate,
    resumeSampling,
    selectSource,
    setCameraCenter,
    setPreviewFov,
    setPreviewLocked,
    setPreviewMaskOpacity,
    setPreviewCenter,
    smoothMaskMove,
    toggleDomPlaylist
  } = usePcEditorControls({
    cameraRef,
    cropMaskState,
    pcWorkbench,
    playbackState,
    runCommand,
    sceneRef,
    setCropMaskState,
    setTimelineStatus,
    timelineBridge,
    trajectoryCorrectorRef
  });

  useEffect(() => {
    timelineBridge.setRecordingRate(recordingRate);
  }, [recordingRate, timelineBridge]);

  useEffect(() => {
    if (!questProbeRunId) {
      return;
    }

    logQuestProbe("playback-state", playbackState.status === "error" ? "fail" : "info", {
      currentSourceId: playbackState.currentSource?.id ?? null,
      currentSourceKind: playbackState.currentSource?.kind ?? null,
      lastCommand: playbackState.lastCommand,
      sourceCount: playbackState.sourceCount,
      status: playbackState.status
    });
  }, [
    logQuestProbe,
    playbackState.currentSource?.id,
    playbackState.currentSource?.kind,
    playbackState.lastCommand,
    playbackState.sourceCount,
    playbackState.status,
    questProbeRunId
  ]);

  useEffect(() => {
    if (!questProbeRunId || !timelineStatus) {
      return;
    }

    logQuestProbe("timeline-status", timelineStatus.lastAcceptedPathPatch?.status === "accepted" ? "pass" : "info", {
      lastAcceptedPathPatch: timelineStatus.lastAcceptedPathPatch,
      lastPatchRevision: timelineStatus.lastPatchRevision
    });
  }, [logQuestProbe, questProbeRunId, timelineStatus]);

  useEffect(() => {
    if (!questProbeRunId) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const payload = () => ({
      currentSrc: video.currentSrc,
      duration: Number.isFinite(video.duration) ? video.duration : null,
      errorCode: video.error?.code ?? null,
      networkState: video.networkState,
      readyState: video.readyState
    });

    const handleLoadedMetadata = () => logQuestProbe("video-loadedmetadata", "pass", payload());
    const handleCanPlay = () => logQuestProbe("video-canplay", "pass", payload());
    const handlePlaying = () => logQuestProbe("video-playing", "pass", payload());
    const handlePause = () => logQuestProbe("video-pause", "info", payload());
    const handleError = () => logQuestProbe("video-error", "fail", payload());

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }
    if (video.readyState >= 3) {
      handleCanPlay();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
    };
  }, [logQuestProbe, questProbeRunId, videoElementKey]);

  useEffect(() => {
    if (!questProbeRunId || !aframeReady || !cropMaskReady) {
      return;
    }

    const eventNames = [
      "controllerconnected",
      "controllerdisconnected",
      "triggerdown",
      "triggerup",
      "triggerchanged",
      "gripdown",
      "gripup",
      "gripchanged",
      "abuttondown",
      "abuttonup",
      "abuttonchanged",
      "bbuttondown",
      "bbuttonup",
      "bbuttonchanged",
      "xbuttondown",
      "xbuttonup",
      "ybuttondown",
      "ybuttonup",
      "thumbstickdown",
      "thumbstickup",
      "thumbstickleft",
      "thumbstickright",
      "thumbstickmoved",
      "axismove",
      "buttonchanged"
    ];
    let removeListeners: (() => void) | null = null;

    const bind = () => {
      if (removeListeners) {
        return;
      }

      const scene = sceneRef.current;
      const left = leftControllerRef.current;
      const right = rightControllerRef.current;

      if (!scene || !left || !right) {
        return;
      }

      const removers: Array<() => void> = [];
      const addListeners = (target: HTMLElement, hand: "left" | "right" | "scene") => {
        for (const eventName of eventNames) {
          const listener = (event: Event) => {
            logQuestProbe("aframe-controller-event", "pass", summarizeAFrameInputEvent(event, hand));
          };
          target.addEventListener(eventName, listener);
          removers.push(() => target.removeEventListener(eventName, listener));
        }
      };

      addListeners(left, "left");
      addListeners(right, "right");
      addListeners(scene, "scene");
      removeListeners = () => removers.forEach((remove) => remove());
      logQuestProbe("quest-input-listeners-ready", "pass", {
        eventNames,
        targets: ["left-controller", "right-controller", "scene"]
      });
    };

    bind();
    const retryTimer = window.setInterval(bind, 250);

    return () => {
      window.clearInterval(retryTimer);
      removeListeners?.();
    };
  }, [aframeReady, cropMaskReady, logQuestProbe, questProbeRunId]);

  useEffect(() => {
    if (!questProbeRunId || !aframeReady || !cropMaskReady) {
      return;
    }

    let lastPoseSignature = "";
    let lastInputSignature = "";
    let lastPoseHeartbeat = 0;

    const readInputSources = () => {
      const session = activeXrSessionRef.current ?? sceneRef.current?.xrSession ?? null;
      if (!session) {
        return [];
      }

      return Array.from(session.inputSources ?? []).map((source) => summarizeXrInputSource(source as QuestProbeInputSource));
    };

    const timer = window.setInterval(() => {
      try {
        const camera = cameraRef.current as AFrameEntityLike | null;
        const leftController = leftControllerRef.current as AFrameEntityLike | null;
        const rightController = rightControllerRef.current as AFrameEntityLike | null;
        const headPose = readProbeTargetPose(camera, "head_gaze");
        const headRotation = readProbeRotation(camera);
        const leftTarget = readProbeTargetPose(leftController, "controller_ray");
        const rightTarget = readProbeTargetPose(rightController, "controller_ray");
        const rendererPresentingNow = Boolean(sceneRef.current?.renderer?.xr?.isPresenting);
        const now = Date.now();
        const posePayload = {
          headPose: headPose
            ? {
                input: headPose.input,
                pitch: roundProbeNumber(headPose.pitch),
                yaw: roundProbeNumber(headPose.yaw)
              }
            : null,
          headRotation,
          leftControllerRay: leftTarget
            ? {
                pitch: roundProbeNumber(leftTarget.pitch),
                yaw: roundProbeNumber(leftTarget.yaw)
              }
            : null,
          rendererPresenting: rendererPresentingNow,
          rightControllerRay: rightTarget
            ? {
                pitch: roundProbeNumber(rightTarget.pitch),
                yaw: roundProbeNumber(rightTarget.yaw)
              }
            : null,
          sessionState
        };
        const poseSignature = JSON.stringify({
          headPitch: headPose ? roundProbeNumber(headPose.pitch, 1) : null,
          headRoll: headRotation?.roll,
          headYaw: headPose ? roundProbeNumber(headPose.yaw, 1) : null,
          leftPitch: leftTarget ? roundProbeNumber(leftTarget.pitch, 1) : null,
          leftYaw: leftTarget ? roundProbeNumber(leftTarget.yaw, 1) : null,
          presenting: rendererPresentingNow,
          rightPitch: rightTarget ? roundProbeNumber(rightTarget.pitch, 1) : null,
          rightYaw: rightTarget ? roundProbeNumber(rightTarget.yaw, 1) : null,
          state: sessionState
        });

        if (poseSignature !== lastPoseSignature || now - lastPoseHeartbeat > 5000) {
          lastPoseSignature = poseSignature;
          lastPoseHeartbeat = now;
          logQuestProbe("xr-pose-sample", headPose ? "pass" : "info", posePayload);
        }

        const inputSources = readInputSources();
        const inputSignature = JSON.stringify(inputSources);
        if (inputSignature !== lastInputSignature) {
          lastInputSignature = inputSignature;
          logQuestProbe(inputSources.length > 0 ? "xr-input-sources" : "xr-input-sources-empty", inputSources.length > 0 ? "pass" : "info", {
            inputSources
          });
        }
      } catch (error) {
        logQuestProbe("xr-pose-sample-error", "fail", { message: error instanceof Error ? error.message : String(error) });
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [aframeReady, cropMaskReady, logQuestProbe, questProbeRunId, sessionState]);

  const bindVideoRef = useCallback((element: HTMLVideoElement | null) => {
    if (videoRef.current === element) {
      return;
    }

    videoRef.current = element;
    if (element) {
      setVideoElementKey((key) => key + 1);
    }
  }, []);

  async function enterMetaVr() {
    const sceneEl = sceneRef.current;
    const video = videoRef.current;

    if (!sceneEl || sessionState === "requesting" || sessionState === "presenting" || sceneEl.renderer?.xr?.isPresenting) {
      return;
    }

    setSessionState("requesting");
    setEntryStatus("Requesting Meta XR immersive-vr...");
    logQuestProbe("enter-meta-vr-request", "info");

    try {
      void video?.play().catch(() => undefined);
      const { session, usedLegacyLayerFallback } = await requestAFrameMetaVrSession(sceneEl);
      activeXrSessionRef.current = session;
      stopXrFrameProbeRef.current?.();

      if (questProbeRunId) {
        let cancelled = false;
        let frameHandle: number | null = null;
        let lastFrameSignature = "";
        let lastFrameLogAt = 0;

        const readInputSourcePose = (frame: XRFrame, source: QuestProbeXrInputSource, referenceSpace: XRReferenceSpace) => {
          const space = source.targetRaySpace ?? source.gripSpace;
          if (!space) {
            return null;
          }

          const pose = frame.getPose(space, referenceSpace);
          return quaternionToProbePose(pose?.transform.orientation);
        };

        const startFrameProbe = async () => {
          try {
            const referenceSpace = await session.requestReferenceSpace("local-floor");

            const tick: XRFrameRequestCallback = (time, frame) => {
              if (cancelled) {
                return;
              }

              const viewerPose = frame.getViewerPose(referenceSpace);
              const inputSources = Array.from(session.inputSources ?? []).map((source) => {
                const xrSource = source as QuestProbeXrInputSource;
                return {
                  ...summarizeXrInputSource(xrSource),
                  targetRayPose: readInputSourcePose(frame, xrSource, referenceSpace)
                };
              });
              const payload = {
                inputSources,
                rendererPresenting: Boolean(sceneEl.renderer?.xr?.isPresenting),
                time: roundProbeNumber(time, 1),
                viewerPose: viewerPose
                  ? {
                      orientation: quaternionToProbePose(viewerPose.transform.orientation),
                      position: {
                        x: roundProbeNumber(viewerPose.transform.position.x, 3),
                        y: roundProbeNumber(viewerPose.transform.position.y, 3),
                        z: roundProbeNumber(viewerPose.transform.position.z, 3)
                      }
                    }
                  : null
              };
              const signature = JSON.stringify({
                inputSources,
                viewer: payload.viewerPose?.orientation
              });
              const now = Date.now();

              if (signature !== lastFrameSignature || now - lastFrameLogAt > 1000) {
                lastFrameSignature = signature;
                lastFrameLogAt = now;
                logQuestProbe("xr-frame-sample", viewerPose ? "pass" : "info", payload);
              }

              frameHandle = session.requestAnimationFrame(tick);
            };

            logQuestProbe("xr-frame-probe-ready", "pass");
            frameHandle = session.requestAnimationFrame(tick);
          } catch (error) {
            logQuestProbe("xr-frame-probe-failed", "fail", { message: error instanceof Error ? error.message : String(error) });
          }
        };

        void startFrameProbe();
        stopXrFrameProbeRef.current = () => {
          cancelled = true;
          if (frameHandle !== null) {
            session.cancelAnimationFrame(frameHandle);
          }
          stopXrFrameProbeRef.current = null;
        };
      }

      session.addEventListener("inputsourceschange", (event) => {
        const inputEvent = event as XRInputSourcesChangeEvent;
        logQuestProbe("xr-input-sources-change", "pass", {
          added: inputEvent.added.map((source) => summarizeXrInputSource(source as QuestProbeInputSource)),
          removed: inputEvent.removed.map((source) => summarizeXrInputSource(source as QuestProbeInputSource))
        });
      });

      session.addEventListener("end", () => {
        stopXrFrameProbeRef.current?.();
        if (activeXrSessionRef.current === session) {
          activeXrSessionRef.current = null;
        }
        setSessionState("ended");
        setRendererPresenting(false);
        setEntryStatus("Meta XR session ended.");
        logQuestProbe("xr-session-ended", "info");
      });

      setSessionState("presenting");
      setRendererPresenting(Boolean(sceneEl.renderer?.xr?.isPresenting));
      logQuestProbe("xr-session-presenting", "pass", {
        rendererPresenting: Boolean(sceneEl.renderer?.xr?.isPresenting),
        usedLegacyLayerFallback
      });
      setEntryStatus(
        usedLegacyLayerFallback
          ? "Meta XR session is running with XRWebGLLayer fallback."
          : "Meta XR immersive-vr session is running."
      );
    } catch (error) {
      setSessionState("error");
      setRendererPresenting(false);
      logQuestProbe("enter-meta-vr-failed", "fail", { message: error instanceof Error ? error.message : String(error) });
      setEntryStatus(error instanceof Error ? error.message : "Failed to enter Meta XR.");
    }
  }

  async function enterAFrameFallbackVr() {
    const sceneEl = sceneRef.current;

    if (!sceneEl?.enterVR || sessionState === "requesting" || sessionState === "presenting") {
      return;
    }

    setSessionState("requesting");
    setEntryStatus("Trying A-Frame VR fallback...");

    try {
      await sceneEl.enterVR(false);
      setSessionState("presenting");
      setRendererPresenting(Boolean(sceneEl.renderer?.xr?.isPresenting));
      setEntryStatus("A-Frame VR fallback entered. Verify Meta IWE binocular output manually.");
    } catch (error) {
      setSessionState("error");
      setEntryStatus(error instanceof Error ? error.message : "A-Frame VR fallback failed.");
    }
  }

  useEffect(() => {
    if (!questProbeRunId || !aframeReady || !cropMaskReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("questStartMetaVrOnPointer") !== "1") {
      return;
    }

    let fired = false;
    const startFromGesture = (event: Event) => {
      if (fired) {
        return;
      }

      fired = true;
      logQuestProbe("enter-meta-vr-pointer-gesture", "info", { eventType: event.type });
      window.removeEventListener("click", startFromGesture, true);
      window.removeEventListener("keydown", startFromGesture, true);
      window.removeEventListener("pointerdown", startFromGesture, true);
      window.removeEventListener("touchend", startFromGesture, true);
      void enterMetaVr();
    };

    logQuestProbe("enter-meta-vr-pointer-armed", "info");
    window.addEventListener("click", startFromGesture, { capture: true });
    window.addEventListener("keydown", startFromGesture, { capture: true });
    window.addEventListener("pointerdown", startFromGesture, { capture: true });
    window.addEventListener("touchend", startFromGesture, { capture: true });

    return () => {
      window.removeEventListener("click", startFromGesture, true);
      window.removeEventListener("keydown", startFromGesture, true);
      window.removeEventListener("pointerdown", startFromGesture, true);
      window.removeEventListener("touchend", startFromGesture, true);
    };
  }, [aframeReady, cropMaskReady, logQuestProbe, questProbeRunId, sessionState]);

  useEffect(() => {
    if (!aframeReady) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    if (!sourceUrl || playbackState.currentSource) {
      return;
    }

    video.src = sourceUrl;
    video.setAttribute("src", sourceUrl);
    const playPromise = video.play();
    if (playPromise) {
      void playPromise.catch(() => {
        // Muted autoplay can still be blocked in some browsers; A-Frame's VR scene remains usable.
      });
    }
  }, [aframeReady, playbackState.currentSource, sourceUrl]);

  const cropExportDownloadUrl = cropExportId
    ? apiUrl(`/api/exports/${encodeURIComponent(cropExportId)}/download`)
    : null;

  const refreshTimelineStatus = useCallback(() => {
    const nextStatus = timelineBridge.getStatus();
    setTimelineStatus(nextStatus);
    return nextStatus;
  }, [timelineBridge]);

  const handleSelectSource = useCallback(
    async (sourceId: string) => {
      try {
        if (sessionSwitchMode === "player-active-session") {
          const session = await switchWebXrPlayerSession(sourceId);
          setActiveTimelineSessionId(session.sessionId);
          setActiveTimelineVideoId(session.videoId);
        } else if (activeTimelineSessionId) {
          const session = await updateCutSessionVideo(activeTimelineSessionId, sourceId);
          setActiveTimelineVideoId(session.videoId);
        }

        setTimelineStatus(null);
        setCropExportId(null);
        setCropWorkflowStatus("idle");
        setCropWorkflowMessage("Ready to record a crop path.");
        selectSource(sourceId);
      } catch (error) {
        setCropWorkflowStatus("error");
        setCropWorkflowMessage(error instanceof Error ? error.message : "Failed to switch WebXR session.");
      }
    },
    [activeTimelineSessionId, selectSource, sessionSwitchMode]
  );

  const selectRelativeSource = useCallback(
    (offset: -1 | 1) => {
      const sources = playbackState.sources;
      if (!sources.length) {
        return;
      }

      const currentIndex = playbackState.currentIndex < 0 ? 0 : playbackState.currentIndex;
      const nextIndex = (currentIndex + offset + sources.length) % sources.length;
      const nextSource = sources[nextIndex];
      if (nextSource) {
        void handleSelectSource(nextSource.id);
      }
    },
    [handleSelectSource, playbackState.currentIndex, playbackState.sources]
  );

  const runPlayerCommand = useCallback(
    async (command: AFrame360VideoCommand, payload?: AFrame360VideoCommandPayload) => {
      if (command === "next") {
        selectRelativeSource(1);
        return;
      }

      if (command === "previous") {
        selectRelativeSource(-1);
        return;
      }

      if (command === "select-source" && payload?.sourceId) {
        await handleSelectSource(payload.sourceId);
        return;
      }

      await Promise.resolve(runCommand(command, payload));
    },
    [handleSelectSource, runCommand, selectRelativeSource]
  );

  const waitForAcceptedPathFlush = useCallback(
    async (afterRevision: number) => {
      const timeoutMs = 7000;
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        const status = refreshTimelineStatus();
        const acceptedPatch = status.lastAcceptedPathPatch;
        if (
          acceptedPatch &&
          acceptedPatch.pathRevision > afterRevision &&
          acceptedPatch.status === "accepted" &&
          status.pendingPathPoints === 0 &&
          status.queuedPathBatches === 0
        ) {
          return status;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }

      throw new Error("Timed out waiting for the PC crop path to flush.");
    },
    [refreshTimelineStatus]
  );

  const sealCropPath = useCallback(async () => {
    const beforeRevision = refreshTimelineStatus().lastPatchRevision;
    await Promise.resolve(runCommand("pause"));
    resumeSampling();
    flushTimeline("lock");
    const status = await waitForAcceptedPathFlush(beforeRevision);
    pauseSampling();
    refreshTimelineStatus();
    return status;
  }, [flushTimeline, pauseSampling, refreshTimelineStatus, resumeSampling, runCommand, waitForAcceptedPathFlush]);

  const renderCrop = useCallback(async () => {
    if (!activeTimelineSessionId) {
      setCropWorkflowStatus("error");
      setCropWorkflowMessage("This PC editor session does not have a timeline session id.");
      return;
    }

    setCropExportId(null);
    setCropWorkflowStatus("rendering");
    setCropWorkflowMessage("Sending final path to the backend renderer...");

    try {
      if (cropWorkflowStatus !== "ready" && cropWorkflowStatus !== "done") {
        await sealCropPath();
      }
      setCropWorkflowMessage("Backend render-test is running...");
      const result = await renderTest(activeTimelineSessionId);
      const nextExportId = typeof result.exportId === "string" ? result.exportId : null;
      if (!nextExportId) {
        throw new Error("Render finished without an export id.");
      }
      setCropExportId(nextExportId);
      setCropWorkflowStatus("done");
      setCropWorkflowMessage(`Export ready: ${nextExportId}`);
    } catch (error) {
      setCropWorkflowStatus("error");
      setCropWorkflowMessage(error instanceof Error ? error.message : "Render failed.");
    }
  }, [activeTimelineSessionId, cropWorkflowStatus, sealCropPath]);

  const startCrop = useCallback(() => {
    setCropExportId(null);
    setCropWorkflowStatus("recording");
    setCropWorkflowMessage("Recording crop path from the current PC mask.");
    resumeSampling();
    flushTimeline("lock");
    void runCommand("play");
  }, [flushTimeline, resumeSampling, runCommand]);

  const endCrop = useCallback(async () => {
    setCropWorkflowStatus("ending");
    setCropWorkflowMessage("Sealing the crop path and sending the final mask sample...");
    try {
      const status = await sealCropPath();
      const points = status.lastAcceptedPathPatch?.acceptedPoints ?? 0;
      setCropWorkflowStatus("ready");
      setCropWorkflowMessage(`Crop path sealed. Last patch accepted ${points} point${points === 1 ? "" : "s"}.`);

      if (autoRenderEnabled) {
        void renderCrop();
      }
    } catch (error) {
      setCropWorkflowStatus("error");
      setCropWorkflowMessage(error instanceof Error ? error.message : "Failed to seal the crop path.");
    }
  }, [autoRenderEnabled, renderCrop, sealCropPath]);

  useEffect(() => {
    if (cropWorkflowStatus !== "recording") {
      return;
    }

    if (playbackState.isPlaying) {
      resumeSampling();
      setCropWorkflowMessage("Recording crop path from the current PC mask.");
      return;
    }

    pauseSampling();
    setCropWorkflowMessage("Recording paused while video playback is paused.");
  }, [cropWorkflowStatus, pauseSampling, playbackState.isPlaying, resumeSampling]);

  const isCropRecording = cropWorkflowStatus === "recording";
  const isCropRecordingPaused = isCropRecording && !playbackState.isPlaying;
  const isCropRecordingBusy = cropWorkflowStatus === "rendering" || cropWorkflowStatus === "ending";
  const toggleCropRecording = useCallback(() => {
    if (isCropRecording) {
      void endCrop();
      return;
    }

    startCrop();
  }, [endCrop, isCropRecording, startCrop]);

  const handleAutoRenderToggle = useCallback((enabled: boolean) => {
    setAutoRenderEnabled(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("xr-auto-render-enabled", String(enabled));
    }
  }, []);

  if (loadError) {
    return (
      <main className={styles.root}>
        <div className="aframe-player-message" role="alert">
          A-Frame failed to load: {loadError}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.root}>
        <section
          className="aframe-sphere-stage"
          data-testid="aframe-video-sphere-player"
          onPointerDownCapture={handleMaskPointerDown}
          onPointerLeave={handleMaskPointerLeave}
          onPointerMoveCapture={handleMaskPointerMove}
          onPointerUpCapture={handleMaskPointerUp}
          onWheel={handleStageWheel}
        >
        {!aframeReady ? <div className="aframe-player-message">Loading A-Frame sphere player...</div> : null}
        <PcTrajectoryRippleCorrector
          enabled={pcWorkbench}
          onCameraCenter={setCameraCenter}
          onMaskCenter={setPreviewCenter}
          ref={trajectoryCorrectorRef}
        />
        <AFrame360VideoControlBridge runCommand={runPlayerCommand} sceneRef={sceneRef} />
        {pcWorkbench && discardNotice.visible ? (
          <div className="xr-pc-discard-toast" data-tone={discardNotice.tone} role="status" data-testid="xr-pc-discard-toast">
            <span>{discardNotice.active ? "DISCARD ACTIVE" : "DISCARD"}</span>
            <strong>{discardNotice.message}</strong>
          </div>
        ) : null}
        <div className="aframe-player-xr-hud" data-testid="aframe-player-xr-hud">
          <span data-testid="aframe-player-xr-status">{entryStatus}</span>
          <span data-testid="aframe-player-renderer-presenting">
            renderer.xr.isPresenting: {rendererPresenting ? "true" : "false"}
          </span>
          <button
            data-testid="aframe-player-start-meta-vr"
            disabled={sessionState === "requesting" || sessionState === "presenting"}
            onClick={() => void enterMetaVr()}
            type="button"
          >
            {sessionState === "presenting" ? "Meta VR Running" : sessionState === "requesting" ? "Starting..." : "Start Meta VR"}
          </button>
          <button
            data-testid="aframe-player-aframe-vr"
            disabled={sessionState === "requesting" || sessionState === "presenting"}
            id="aframe-player-aframe-vr"
            onClick={() => void enterAFrameFallbackVr()}
            type="button"
          >
            A-Frame VR fallback
          </button>
        </div>
        {pcWorkbench ? (
          <PcPlayerControls
            domPlaylistOpen={domPlaylistOpen}
            onCloseOverlays={closeDomOverlays}
            onNext={() => selectRelativeSource(1)}
            onPrevious={() => selectRelativeSource(-1)}
            onResetPlaybackRate={resetPlaybackRate}
            onResetEffectSpeed={resetEffectSpeed}
            onResetRecordingRate={resetRecordingRate}
            onSeekTo={(timeMs) => void runCommand("seek-to", { timeMs })}
            onSelectSource={(source) => void handleSelectSource(source.id)}
            onTogglePlay={() => void runCommand("toggle-play")}
            onTogglePlaylist={toggleDomPlaylist}
            onToggleRecording={toggleCropRecording}
            playbackState={playbackState}
            progressPercent={progressPercent}
            rateWheelTarget={rateWheelTarget}
            effectSpeed={effectSpeed}
            recordingRate={recordingRate}
            recordingToggleActive={isCropRecording}
            recordingToggleDisabled={isCropRecordingBusy}
            recordingTogglePaused={isCropRecordingPaused}
            singleSourceTitle={singleSourceTitle}
          />
        ) : null}
        <PcEditorDebugState
          cameraLookRef={cameraLookRef}
          cropMaskState={cropMaskState}
          edgePanActive={edgePanActive}
          maskDragArmed={maskDragArmed}
          playbackState={playbackState}
          effectSpeed={effectSpeed}
          recordingRate={recordingRate}
          timelineStatus={timelineStatus}
        />
        {pcWorkbench ? (
          <PcWorkbenchPanel
            autoRenderEnabled={autoRenderEnabled}
            cropMaskState={cropMaskState}
            discardActive={discardNotice.active}
            discardLastRange={discardNotice.lastRange}
            discardMessage={discardNotice.message}
            cropWorkflowMessage={cropWorkflowMessage}
            cropWorkflowStatus={cropWorkflowStatus}
            exportDownloadUrl={cropExportDownloadUrl}
            isRenderDisabled={!activeTimelineSessionId}
            onAutoRenderToggle={handleAutoRenderToggle}
            onCut={cutHere}
            onEndCrop={() => void endCrop()}
            onFlush={() => flushTimeline("lock")}
            onFovIn={() => setPreviewFov(cropMaskState.fov.h - 5)}
            onFovOut={() => setPreviewFov(cropMaskState.fov.h + 5)}
            onLockToggle={() => setPreviewLocked(!cropMaskState.locked)}
            onMaskOpacity={setPreviewMaskOpacity}
            onPitchDown={() => smoothMaskMove(0, -5)}
            onRenderCrop={() => void renderCrop()}
            onStartCrop={startCrop}
            onPitchUp={() => smoothMaskMove(0, 5)}
            onYawLeft={() => smoothMaskMove(-5, 0)}
            onYawRight={() => smoothMaskMove(5, 0)}
            timelineStatus={timelineStatus}
          />
        ) : null}
        {pcWorkbench ? <PcEffectsPanel /> : null}
        {pcWorkbench ? <PcEffectPreview legacyDomEvents /> : null}
        {pcWorkbench ? <PcBgmControls sessionId={activeTimelineSessionId} /> : null}
        {pcWorkbench ? null : (
          <PcMaskOpacityControls
            cropMaskState={cropMaskState}
            onSetOpacity={setPreviewMaskOpacity}
            pcWorkbench={pcWorkbench}
          />
        )}
        <AFrameEditorScene
          aframeReady={aframeReady}
          bindVideoRef={bindVideoRef}
          cameraRef={cameraRef}
          cropMaskReady={cropMaskReady}
          leftControllerRef={leftControllerRef}
          pcWorkbench={pcWorkbench}
          playbackState={playbackState}
          rightControllerRef={rightControllerRef}
          runCommand={runPlayerCommand}
          sceneRef={sceneRef}
          videoId={videoId}
        />
        {pcWorkbench ? (
          <div
            aria-hidden="true"
            className="xr-pc-stage-hit-layer"
            data-testid="xr-pc-stage-hit-layer"
            onPointerDown={handleMaskPointerDown}
            onPointerLeave={handleMaskPointerLeave}
            onPointerMove={handleMaskPointerMove}
            onPointerUp={handleMaskPointerUp}
          />
        ) : null}
      </section>
    </main>
  );
}
