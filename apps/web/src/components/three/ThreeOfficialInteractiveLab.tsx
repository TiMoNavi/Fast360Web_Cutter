"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  GridHelper,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VideoTexture,
  WebGLRenderer
} from "three";
import { HTMLMesh } from "three/examples/jsm/interactive/HTMLMesh.js";
import { InteractiveGroup } from "three/examples/jsm/interactive/InteractiveGroup.js";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import Hls from "hls.js";
import { setRendererSessionWithLabFallback } from "@/components/xr/webXrLabCompat";
import { apiUrl, renderTest, sendViewPathPatch, updateCutSessionVideo } from "@/lib/api";
import type { ViewPathPatch, ViewPathPoint } from "@/lib/path-protocol";
import {
  dispatchWebXrTimelineEvent,
  type ViewInputSource,
  type ViewTargetPose,
  type WebXrSemanticEvent
} from "@/features/webxr/pc-editor/data/timeline-bridge";
import { createCropViewportMaskFragmentShader } from "@/features/webxr/pc-editor/webxr/AFrameCropViewportMask";
import type { AFrame360VideoSource } from "@/features/webxr/pc-editor/controls/types";
import { verticalFovFromHorizontal } from "@/features/webxr/pc-editor/viewFov";
import { ThreeOfficialArwesWorkbenchDesk } from "./three-official-lab/ThreeOfficialArwesWorkbenchDesk";
import { ThreeOfficialLabHud } from "./three-official-lab/ThreeOfficialLabHud";
import { ThreeOfficialModeStrip } from "./three-official-lab/ThreeOfficialModeStrip";
import { ThreeOfficialPlayerPanel } from "./three-official-lab/ThreeOfficialPlayerPanel";
import { ThreeOfficialInteractiveLabStyles } from "./three-official-lab/ThreeOfficialInteractiveLabStyles";
import {
  ARWES_DESK_HTMLMESH_POSITION,
  ARWES_DESK_LAYER_POSITION,
  ARWES_DESK_POPUP_POSITION,
  ARWES_DESK_POPUP_ROTATION_X,
  ARWES_DESK_ROTATION_X
} from "./three-official-lab/ThreeOfficialSpatialDeskLayout";
import { bgmLabel, formatClock } from "./three-official-lab/format";
import {
  CROP_FRAME_DISTANCE,
  CROP_MASK_RADIUS,
  DEFAULT_VIEW_TARGET,
  DEG_TO_RAD,
  DUAL_SELECT_COMBO_MS,
  FALLBACK_VIDEO_SOURCES,
  FOV_FLUSH_DEBOUNCE_MS,
  FOV_THUMBSTICK_DEADZONE,
  FOV_THUMBSTICK_MAX_DEG_PER_SECOND,
  HEAD_GAZE_HOLD_MS,
  LEFT_MENU_BUTTON_INDEX,
  MASK_OPACITY_DEFAULT,
  MASK_OPACITY_MAX,
  MASK_OPACITY_MIN,
  MASK_OPACITY_THUMBSTICK_MAX_PER_SECOND,
  QUICK_MENU_BUTTON_INDEX,
  QUICK_MENU_ITEMS,
  SPHERE_CLICK_MAX_MOVE_PX,
  SPHERE_SMOOTH_MOVE_MS
} from "./three-official-lab/constants";
import {
  actionMessage,
  clampNumber,
  createQuickMenuTileMaterial,
  directionToViewTarget,
  interpolateViewTargetPose,
  makeControllerRay,
  normalizeViewTargetPose,
  readObjectForward,
  semanticSummary,
  styleXrButton,
  viewTargetToDirection
} from "./three-official-lab/runtimeHelpers";
import type {
  BgmChoice,
  BrowserXr,
  ControllerHand,
  CropWorkflowStatus,
  FollowMode,
  LabBackendBinding,
  LabEffectLogItem,
  LabRecordingSample,
  OfficialAction,
  OfficialModule,
  PlayerAction,
  QuickMenuAction,
  SyntheticControllerSelectDetail,
  SyntheticQuickMenuDetail,
  SyntheticThumbstickDetail,
  UiEditMode,
  WorkflowEffectAction,
  XrControllerObject
} from "./three-official-lab/types";

type ThreeOfficialInteractiveLabProps = {
  initialSources?: AFrame360VideoSource[];
  sessionId?: string;
  videoId?: string;
};

export function ThreeOfficialInteractiveLab({ initialSources, sessionId: propSessionId, videoId: propVideoId }: ThreeOfficialInteractiveLabProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workflowStateRef = useRef<HTMLDivElement | null>(null);
  const [backendAcceptedPoints, setBackendAcceptedPoints] = useState(0);
  const [backendBinding, setBackendBinding] = useState<LabBackendBinding | null>(null);
  const [backendStatus, setBackendStatus] = useState(initialSources?.length ? "backend playlist loaded" : "lab preview only");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [bgmChoice, setBgmChoice] = useState<BgmChoice>("none");
  const [bgmPreviewPlaying, setBgmPreviewPlaying] = useState(false);
  const [cropExportId, setCropExportId] = useState<string | null>(null);
  const [cropWorkflowMessage, setCropWorkflowMessage] = useState("Open workflow to record a crop path.");
  const [cropWorkflowStatus, setCropWorkflowStatus] = useState<CropWorkflowStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [effectLog, setEffectLog] = useState<LabEffectLogItem[]>([]);
  const [fov, setFov] = useState(82);
  const [lastAction, setLastAction] = useState("Ready: Three.js HTMLMesh + InteractiveGroup official interaction path.");
  const [lastSemantic, setLastSemantic] = useState("none");
  const [leftGripModifier, setLeftGripModifier] = useState(false);
  const [locked, setLocked] = useState(false);
  const [maskOpacity, setMaskOpacity] = useState(MASK_OPACITY_DEFAULT);
  const [mode, setMode] = useState("FX");
  const [openModule, setOpenModule] = useState<OfficialModule | null>(null);
  const [followMode, setFollowMode] = useState<FollowMode>("idle");
  const [pendingEdit, setPendingEdit] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playerUiVisible, setPlayerUiVisible] = useState(true);
  const [playbackStatus, setPlaybackStatus] = useState<"blocked" | "loading" | "ready" | "playing" | "paused" | "error">("loading");
  const [recordingRate, setRecordingRate] = useState(1);
  const [recordingSamples, setRecordingSamples] = useState<LabRecordingSample[]>([]);
  const [spatialMenusVisible, setSpatialMenusVisible] = useState(true);
  const [quickMenuActive, setQuickMenuActive] = useState(false);
  const [quickMenuSelection, setQuickMenuSelection] = useState("none");
  const quickMenuActiveRef = useRef(false);
  const quickMenuSelectionRef = useRef<QuickMenuAction | null>(null);
  const openModuleRef = useRef<OfficialModule | null>(openModule);
  const spatialMenusVisibleRef = useRef(true);
  const [viewTarget, setViewTarget] = useState<ViewTargetPose>(DEFAULT_VIEW_TARGET);
  const [videoIndex, setVideoIndex] = useState(0);
  const [videoSources, setVideoSources] = useState<AFrame360VideoSource[]>(() =>
    initialSources?.length ? initialSources : FALLBACK_VIDEO_SOURCES
  );
  const currentTimeMsRef = useRef(currentTimeMs);
  const followModeRef = useRef<FollowMode>("idle");
  const fovRef = useRef(fov);
  const leftGripModifierRef = useRef(leftGripModifier);
  const lockedRef = useRef(locked);
  const maskOpacityRef = useRef(maskOpacity);
  const pendingEditRef = useRef(pendingEdit);
  const pathRevisionRef = useRef(0);
  const cropWorkflowStatusRef = useRef<CropWorkflowStatus>("idle");
  const recordingSamplesRef = useRef<LabRecordingSample[]>([]);
  const takeIdRef = useRef(`three_lab_${Date.now().toString(36)}`);
  const uiModeRef = useRef<UiEditMode>("IDLE");
  const viewTargetRef = useRef<ViewTargetPose>(DEFAULT_VIEW_TARGET);
  const [uiMode, setUiMode] = useState<UiEditMode>("IDLE");

  const currentVideoSource = videoSources[videoIndex] ?? videoSources[0] ?? FALLBACK_VIDEO_SOURCES[0];

  useEffect(() => {
    currentTimeMsRef.current = currentTimeMs;
  }, [currentTimeMs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("sessionId");
    const urlVideoId = params.get("videoId");
    const sessionId = propSessionId || urlSessionId;
    const videoId = propVideoId || urlVideoId;
    if (sessionId && videoId) {
      setBackendBinding({ sessionId, videoId });
      setBackendStatus("backend session bound");
    }
  }, [propSessionId, propVideoId]);

  function emitSemantic(event: WebXrSemanticEvent) {
    dispatchWebXrTimelineEvent(event);
    setLastSemantic(semanticSummary(event));
    recordTimelineSampleForEvent(event);
  }

  function recordTimelineSampleForEvent(event: WebXrSemanticEvent) {
    if (cropWorkflowStatusRef.current !== "recording") {
      return;
    }

    if (event.type === "cutHere") {
      pushRecordingSample("timeline:cut");
      return;
    }

    if (event.type === "flushPath" && (event.reason === "fov" || event.reason === "discard" || event.reason === "restore")) {
      pushRecordingSample(`timeline:${event.reason}`);
    }
  }

  function setFollowModeValue(next: FollowMode) {
    followModeRef.current = next;
    setFollowMode(next);
  }

  function setLockedValue(next: boolean) {
    lockedRef.current = next;
    setLocked(next);
  }

  function setLeftGripModifierValue(next: boolean) {
    leftGripModifierRef.current = next;
    setLeftGripModifier(next);
  }

  function setSpatialMenusVisibleValue(next: boolean) {
    spatialMenusVisibleRef.current = next;
    setSpatialMenusVisible(next);
    if (!next) {
      setOpenModule(null);
      openModuleRef.current = null;
      quickMenuActiveRef.current = false;
      quickMenuSelectionRef.current = null;
      setQuickMenuActive(false);
      setQuickMenuSelection("none");
    } else {
      setPlayerUiVisible(true);
    }
    setLastAction(next ? "LEFT MENU: spatial menus restored." : "LEFT MENU: spatial menus collapsed.");
  }

  function toggleSpatialMenusVisible() {
    setSpatialMenusVisibleValue(!spatialMenusVisibleRef.current);
  }

  function toggleCropWorkflowFromController(sourceLabel: string) {
    if (cropWorkflowStatusRef.current === "recording") {
      void endCropWorkflow();
      setLastAction(`${sourceLabel}: ending crop recording.`);
      return;
    }

    if (cropWorkflowStatusRef.current === "ending" || cropWorkflowStatusRef.current === "rendering") {
      setLastAction(`${sourceLabel}: recording toggle ignored while workflow is busy.`);
      return;
    }

    startCropWorkflow();
    setLastAction(`${sourceLabel}: starting crop recording.`);
  }

  function setUiModeValue(next: UiEditMode, pending = pendingEditRef.current) {
    uiModeRef.current = next;
    pendingEditRef.current = pending;
    setUiMode(next);
    setPendingEdit(pending);
  }

  function setFovValue(next: number, semanticEvent?: WebXrSemanticEvent) {
    const clamped = clampNumber(next, 48, 112);
    fovRef.current = clamped;
    setFov(clamped);
    if (semanticEvent) {
      emitSemantic(semanticEvent);
    }
    return clamped;
  }

  function setMaskOpacityValue(next: number) {
    const clamped = clampNumber(next, MASK_OPACITY_MIN, MASK_OPACITY_MAX);
    maskOpacityRef.current = clamped;
    setMaskOpacity(Number(clamped.toFixed(3)));
    return clamped;
  }

  function previewViewTarget(pose: ViewTargetPose) {
    const next = normalizeViewTargetPose(pose);
    viewTargetRef.current = next;
    setViewTarget(next);
    return next;
  }

  function commitViewTarget(pose: ViewTargetPose, sourceLabel: string) {
    const next = previewViewTarget(pose);
    setFollowModeValue("idle");
    setLockedValue(true);
    setUiModeValue("LOCKED", false);
    emitSemantic({ type: "setViewTarget", pose: next });
    emitSemantic({ type: "lockViewport" });
    emitSemantic({ type: "flushPath", reason: "lock" });
    if (cropWorkflowStatusRef.current === "recording") {
      pushRecordingSample(sourceLabel);
    }
    setLastAction(`${sourceLabel}: locked yaw ${next.yaw.toFixed(1)} / pitch ${next.pitch.toFixed(1)}.`);
  }

  useEffect(() => {
    fovRef.current = fov;
  }, [fov]);

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  useEffect(() => {
    leftGripModifierRef.current = leftGripModifier;
  }, [leftGripModifier]);

  useEffect(() => {
    maskOpacityRef.current = maskOpacity;
  }, [maskOpacity]);

  useEffect(() => {
    pendingEditRef.current = pendingEdit;
  }, [pendingEdit]);

  useEffect(() => {
    viewTargetRef.current = viewTarget;
  }, [viewTarget]);

  useEffect(() => {
    cropWorkflowStatusRef.current = cropWorkflowStatus;
  }, [cropWorkflowStatus]);

  useEffect(() => {
    openModuleRef.current = openModule;
  }, [openModule]);

  async function toggleVideoPlayback(sourceLabel = "PLAY") {
    const video = videoRef.current;
    if (!video) {
      setLastAction(`${sourceLabel}: video element is not ready.`);
      return;
    }

    emitSemantic({ type: "playPause" });

    if (video.paused) {
      try {
        await video.play();
        setPlaybackStatus("playing");
        setLastAction(`${sourceLabel}: 360 sphere video playing.`);
      } catch (error) {
        setPlaybackStatus("error");
        setLastAction(error instanceof Error ? `${sourceLabel} blocked: ${error.message}` : `${sourceLabel} blocked by browser.`);
      }
    } else {
      video.pause();
      setPlaybackStatus("paused");
      setLastAction(`${sourceLabel}: 360 sphere video paused.`);
    }
  }

  function seekVideoTo(timeMs: number) {
    const video = videoRef.current;
    if (!video) {
      setLastAction("SEEK: video element is not ready.");
      return;
    }

    const limitMs = Number.isFinite(video.duration) ? video.duration * 1000 : durationMs;
    const nextTimeMs = Math.max(0, Math.min(timeMs, Math.max(limitMs || timeMs, 0)));
    video.currentTime = nextTimeMs / 1000;
    currentTimeMsRef.current = Math.round(nextTimeMs);
    setCurrentTimeMs(Math.round(nextTimeMs));
    emitSemantic({ type: "seekTo", tMs: Math.round(nextTimeMs) });
    setLastAction(`SEEK: sphere player moved to ${formatClock(nextTimeMs)}.`);
  }

  function setVideoRate(rate: number) {
    const video = videoRef.current;
    const nextRate = Math.max(0.25, Math.min(rate, 3));
    if (video) {
      video.playbackRate = nextRate;
    }
    setPlaybackRate(nextRate);
    setLastAction(`RATE: sphere player set to ${nextRate}x.`);
  }

  function pushRecordingSample(reason: string) {
    const pose = viewTargetRef.current;
    const hFov = fovRef.current;
    const sample: LabRecordingSample = {
      fovH: Number(hFov.toFixed(2)),
      fovV: Number(verticalFovFromHorizontal(hFov).toFixed(2)),
      input: pose.input,
      pitch: Number(pose.pitch.toFixed(2)),
      reason,
      seq: recordingSamplesRef.current.length + 1,
      tMs: currentTimeMsRef.current,
      yaw: Number(pose.yaw.toFixed(2))
    };
    const nextSamples = [...recordingSamplesRef.current, sample].slice(-24);
    recordingSamplesRef.current = nextSamples;
    setRecordingSamples(nextSamples);
    return sample;
  }

  function setRecordingRateValue(rate: number) {
    const nextRate = Number(clampNumber(rate, 0.25, 3).toFixed(2));
    setRecordingRate(nextRate);
    setLastAction(`RECORD RATE: lab recording rate set to ${nextRate}x.`);
  }

  function nudgeViewTarget(deltaYaw: number, deltaPitch: number, sourceLabel: string) {
    const current = viewTargetRef.current;
    commitViewTarget(
      {
        input: current.input,
        pitch: current.pitch + deltaPitch,
        yaw: current.yaw + deltaYaw
      },
      sourceLabel
    );
  }

  function buildBackendPathPatch(binding: LabBackendBinding, reason: ViewPathPatch["replaceRange"]["reason"]): ViewPathPatch | null {
    const samples = recordingSamplesRef.current;
    if (!samples.length) {
      return null;
    }

    let previousTime = -1;
    const points: ViewPathPoint[] = samples.map((sample, index) => {
      const tMs = Math.max(sample.tMs, previousTime + 1);
      previousTime = tMs;
      return {
        center: {
          pitch: sample.pitch,
          yaw: sample.yaw
        },
        cut: index === 0 && reason === "cut",
        enabled: true,
        fov: {
          h: sample.fovH,
          v: sample.fovV
        },
        input: sample.input === "controller_ray" ? "controller_ray" : "head_gaze",
        interpolation: "linear",
        locked: lockedRef.current,
        roll: 0,
        seq: index + 1,
        smoothFollow: sample.reason !== "SPHERE CTRL CLICK",
        tMs,
        transitionMs: sample.reason === "start" ? 0 : SPHERE_SMOOTH_MOVE_MS
      };
    });
    const startMs = points[0]?.tMs ?? 0;
    const endMs = Math.max(startMs + 1, (points.at(-1)?.tMs ?? startMs) + 200);
    return {
      pathRevision: ++pathRevisionRef.current,
      points,
      replaceRange: {
        endMs,
        reason,
        startMs
      },
      sessionId: binding.sessionId,
      takeId: takeIdRef.current,
      version: 1,
      videoId: binding.videoId
    };
  }

  async function flushBackendPath(reason: ViewPathPatch["replaceRange"]["reason"]) {
    if (!backendBinding) {
      setBackendStatus("lab preview only");
      return null;
    }

    const patch = buildBackendPathPatch(backendBinding, reason);
    if (!patch) {
      setBackendStatus("no local samples to send");
      return null;
    }

    setBackendStatus(`sending path revision ${patch.pathRevision}`);
    const result = await sendViewPathPatch(backendBinding.sessionId, patch);
    const acceptedPoints = typeof result.acceptedPoints === "number" ? result.acceptedPoints : patch.points.length;
    setBackendAcceptedPoints(acceptedPoints);
    setBackendStatus(`accepted ${acceptedPoints} path point${acceptedPoints === 1 ? "" : "s"}`);
    return { patch, result };
  }

  function startCropWorkflow() {
    setCropExportId(null);
    recordingSamplesRef.current = [];
    setRecordingSamples([]);
    cropWorkflowStatusRef.current = "recording";
    setCropWorkflowStatus("recording");
    setCropWorkflowMessage("Recording crop path from the current viewfinder.");
    setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", true);
    pushRecordingSample("start");
    emitSemantic({ type: "samplingResume" });
    setLastAction("WORKFLOW: start crop recording from spatial desk.");
  }

  async function endCropWorkflow() {
    if (cropWorkflowStatusRef.current === "idle") {
      setCropWorkflowMessage("Start recording before sealing a crop path.");
      setLastAction("WORKFLOW: end crop ignored because recording has not started.");
      return;
    }

    const sample = pushRecordingSample("end");
    cropWorkflowStatusRef.current = "ending";
    setCropWorkflowStatus("ending");
    setCropWorkflowMessage(`Sealing ${sample.seq} lab samples for backend handoff...`);
    setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", false);
    emitSemantic({ type: "samplingPause" });
    emitSemantic({ type: "flushPath", reason: "live" });
    try {
      await flushBackendPath("live");
      cropWorkflowStatusRef.current = "ready";
      setCropWorkflowStatus("ready");
      setCropWorkflowMessage(`Crop path sealed with ${sample.seq} lab samples. Ready to render a preview export.`);
      setLastAction("WORKFLOW: end crop sealed the current path.");
    } catch (error) {
      cropWorkflowStatusRef.current = "ready";
      setCropWorkflowStatus("ready");
      const message = error instanceof Error ? error.message : "Backend path flush failed.";
      setBackendStatus(message);
      setCropWorkflowMessage(`Lab path sealed locally. Backend flush failed: ${message}`);
      setLastAction("WORKFLOW: local seal completed; backend path flush failed.");
    }
  }

  async function renderCropWorkflow() {
    if (cropWorkflowStatusRef.current !== "ready" && cropWorkflowStatusRef.current !== "done") {
      setCropWorkflowMessage("Seal the crop path before rendering.");
      setLastAction("WORKFLOW: render needs a sealed crop path.");
      return;
    }

    setCropWorkflowStatus("rendering");
    cropWorkflowStatusRef.current = "rendering";
    setCropWorkflowMessage("Rendering preview export in lab mode...");
    setLastAction("WORKFLOW: preview render queued.");
    if (backendBinding) {
      try {
        setBackendStatus("backend render-test running");
        const result = await renderTest(backendBinding.sessionId);
        const nextExportId = typeof result.exportId === "string" ? result.exportId : "backend-render";
        setCropExportId(nextExportId);
        setBackendStatus(`render accepted ${nextExportId}`);
        cropWorkflowStatusRef.current = "done";
        setCropWorkflowStatus("done");
        setCropWorkflowMessage(`Export ready with ${bgmLabel(bgmChoice)}.`);
        setLastAction("WORKFLOW: backend preview export ready.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Backend render-test failed.";
        setBackendStatus(message);
        cropWorkflowStatusRef.current = "ready";
        setCropWorkflowStatus("ready");
        setCropWorkflowMessage(`Backend render failed: ${message}`);
        setLastAction("WORKFLOW: backend render-test failed.");
      }
      return;
    }

    window.setTimeout(() => {
      setCropExportId("three-lab-preview-export");
      cropWorkflowStatusRef.current = "done";
      setCropWorkflowStatus("done");
      setCropWorkflowMessage(`Export ready with ${bgmLabel(bgmChoice)}.`);
      setLastAction("WORKFLOW: preview export ready.");
    }, 240);
  }

  function selectBgm(choice: BgmChoice) {
    setBgmChoice(choice);
    setBgmPreviewPlaying(false);
    setCropWorkflowMessage(choice === "none" ? "BGM disabled for this lab take." : `${bgmLabel(choice)} selected for export preview.`);
    setLastAction(`BGM: ${bgmLabel(choice)} selected for spatial workflow.`);
  }

  function toggleBgmPreview() {
    setBgmPreviewPlaying((playing) => !playing);
    setLastAction(bgmChoice === "none" ? "BGM: choose a track before preview." : `BGM: ${bgmLabel(bgmChoice)} preview toggled.`);
  }

  function createWorkflowEffect(action: WorkflowEffectAction) {
    const effect =
      action === "effectWhite"
        ? { displayName: "White flash", effectType: "transition.flash_white" as const }
        : action === "effectVhs"
          ? { displayName: "VHS blank", effectType: "black.solid" as const }
          : { displayName: "Black fade", effectType: "transition.fade_black" as const };
    setEffectLog((items) => [{ displayName: effect.displayName, effectType: effect.effectType, seq: items.length + 1 }, ...items].slice(0, 4));
    emitSemantic({
      type: "createEffectEvent",
      displayName: effect.displayName,
      durationMs: action === "effectWhite" ? 520 : 860,
      effectType: effect.effectType,
      params: {
        source: "three-official-spatial-controls"
      },
      renderPolicy: {
        fallback: "warn"
      }
    });
    setLastAction(`EFFECT: ${effect.displayName} queued from spatial controls.`);
  }

  useEffect(() => {
    const mount = mountRef.current;
    const playerSource = playerRef.current;
    const popupSource = popupRef.current;
    const source = sourceRef.current;
    const statusSource = statusRef.current;
    const video = videoRef.current;
    if (!mount || !playerSource || !popupSource || !source || !statusSource || !video) {
      return;
    }

    let disposed = false;
    let htmlMesh: HTMLMesh | null = null;
    let playerMesh: HTMLMesh | null = null;
    let popupMesh: HTMLMesh | null = null;
    let statusMesh: HTMLMesh | null = null;
    let cropMaskGeometry: SphereGeometry | null = null;
    let cropMaskMaterial: ShaderMaterial | null = null;
    let cropFrameBarGeometry: PlaneGeometry | null = null;
    let cropFrameHandleGeometry: PlaneGeometry | null = null;
    let cropFrameHandleMaterial: MeshBasicMaterial | null = null;
    let cropFrameMaterial: MeshBasicMaterial | null = null;
    let targetRingGeometry: RingGeometry | null = null;
    let targetRingMaterial: MeshBasicMaterial | null = null;
    let reticleGeometry: RingGeometry | null = null;
    let reticleMaterial: MeshBasicMaterial | null = null;
    let videoTexture: VideoTexture | null = null;
    const scene = new Scene();
    scene.background = new Color(0x070011);

    const camera = new PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.01, 50);
    camera.position.set(0, 1.58, 0.45);
    camera.lookAt(0, 0.98, -1.45);

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    renderer.domElement.setAttribute("data-testid", "three-official-canvas");
    mount.appendChild(renderer.domElement);

    const vrButton = document.createElement("button");
    let currentXrSession: XRSession | null = null;
    styleXrButton(vrButton);
    vrButton.setAttribute("data-testid", "three-official-vr-button");
    vrButton.textContent = "CHECKING XR";
    mount.appendChild(vrButton);

    const setXrButtonEnabled = (enabled: boolean) => {
      vrButton.disabled = !enabled;
      vrButton.style.cursor = enabled ? "pointer" : "auto";
      vrButton.style.opacity = enabled ? "0.86" : "0.48";
    };

    const navigatorXr = (navigator as Navigator & { xr?: BrowserXr }).xr;

    if (!navigatorXr?.isSessionSupported || !navigatorXr.requestSession) {
      vrButton.textContent = window.isSecureContext ? "WEBXR UNAVAILABLE" : "WEBXR NEEDS HTTPS";
      setXrButtonEnabled(false);
    } else {
      setXrButtonEnabled(false);
      navigatorXr
        .isSessionSupported("immersive-vr")
        .then((supported) => {
          if (disposed) {
            return;
          }
          vrButton.textContent = supported ? "ENTER META VR" : "VR NOT SUPPORTED";
          setXrButtonEnabled(supported);
        })
        .catch((error) => {
          if (disposed) {
            return;
          }
          vrButton.textContent = "VR NOT ALLOWED";
          setXrButtonEnabled(false);
          setLastAction(error instanceof Error ? `XR support check failed: ${error.message}` : "XR support check failed.");
        });
    }

    vrButton.onclick = async () => {
      if (currentXrSession) {
        await currentXrSession.end();
        return;
      }

      if (!navigatorXr?.requestSession) {
        setLastAction("XR: navigator.xr.requestSession is unavailable.");
        return;
      }

      try {
        setXrButtonEnabled(false);
        vrButton.textContent = "STARTING VR";
        void video.play().catch(() => undefined);

        const session = await navigatorXr.requestSession("immersive-vr", {
          optionalFeatures: ["local-floor", "bounded-floor"]
        });
        const usedLegacyLayerFallback = await setRendererSessionWithLabFallback(renderer, session, {
          preferLegacyLayer: true
        });

        currentXrSession = session;
        vrButton.textContent = "EXIT VR";
        setXrButtonEnabled(true);
        setLastAction(
          usedLegacyLayerFallback
            ? "XR: Meta VR session running with XRWebGLLayer fallback."
            : "XR: Meta VR session running."
        );

        session.addEventListener("end", () => {
          currentXrSession = null;
          if (!disposed) {
            vrButton.textContent = "ENTER META VR";
            setXrButtonEnabled(true);
            setLastAction("XR: session ended.");
          }
        });
      } catch (error) {
        currentXrSession = null;
        vrButton.textContent = "ENTER META VR";
        setXrButtonEnabled(true);
        setLastAction(error instanceof Error ? `XR failed: ${error.message}` : "XR failed.");
      }
    };

    const grid = new GridHelper(6, 24, 0x00ffff, 0x24385c);
    grid.position.y = 0.02;
    scene.add(grid);

    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    videoTexture = new VideoTexture(video);
    videoTexture.colorSpace = SRGBColorSpace;
    videoTexture.minFilter = LinearFilter;
    videoTexture.magFilter = LinearFilter;
    const videoSphereGeometry = new SphereGeometry(18, 64, 32);
    videoSphereGeometry.scale(-1, 1, 1);
    const videoSphere = new Mesh(
      videoSphereGeometry,
      new MeshBasicMaterial({
        map: videoTexture,
        side: FrontSide,
        toneMapped: false
      })
    );
    videoSphere.name = "three-official-video-sphere";
    videoSphere.rotation.y = -Math.PI / 2;
    scene.add(videoSphere);

    const cropMaskUniforms = {
      uCenterYaw: { value: viewTargetRef.current.yaw * DEG_TO_RAD },
      uCenterPitch: { value: viewTargetRef.current.pitch * DEG_TO_RAD },
      uCornerRadius: { value: 0.18 },
      uFov: {
        value: new Vector2(fovRef.current * DEG_TO_RAD, verticalFovFromHorizontal(fovRef.current) * DEG_TO_RAD)
      },
      uFeather: { value: 0.195 },
      uLocked: { value: lockedRef.current ? 1 : 0 },
      uOpacity: { value: maskOpacityRef.current },
      uTime: { value: 0 }
    };
    cropMaskGeometry = new SphereGeometry(CROP_MASK_RADIUS, 96, 48);
    cropMaskMaterial = new ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      fragmentShader: createCropViewportMaskFragmentShader(),
      side: BackSide,
      transparent: true,
      uniforms: cropMaskUniforms,
      vertexShader: `
        varying vec3 vLocalDirection;

        void main() {
          vLocalDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `
    });
    const cropMask = new Mesh(cropMaskGeometry, cropMaskMaterial);
    cropMask.frustumCulled = false;
    cropMask.name = "three-official-crop-mask";
    cropMask.renderOrder = 30;
    scene.add(cropMask);

    reticleGeometry = new RingGeometry(0.035, 0.052, 64);
    reticleMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0x00ffff,
      depthWrite: false,
      opacity: 0.9,
      side: DoubleSide,
      transparent: true
    });
    const targetReticle = new Mesh(reticleGeometry, reticleMaterial);
    targetReticle.name = "three-official-view-target-reticle";
    targetReticle.renderOrder = 42;
    scene.add(targetReticle);

    cropFrameMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0x00ffff,
      depthWrite: false,
      opacity: 0.72,
      side: DoubleSide,
      transparent: true
    });
    cropFrameHandleMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0xff9900,
      depthWrite: false,
      opacity: 0.92,
      side: DoubleSide,
      transparent: true
    });
    cropFrameBarGeometry = new PlaneGeometry(1, 0.018);
    cropFrameHandleGeometry = new PlaneGeometry(0.075, 0.075);
    const cropFrame = new Group();
    cropFrame.name = "three-official-crop-frame";
    cropFrame.renderOrder = 43;
    const frameTop = new Mesh(cropFrameBarGeometry, cropFrameMaterial);
    const frameBottom = new Mesh(cropFrameBarGeometry, cropFrameMaterial);
    const frameLeft = new Mesh(cropFrameBarGeometry, cropFrameMaterial);
    const frameRight = new Mesh(cropFrameBarGeometry, cropFrameMaterial);
    frameTop.position.y = 0.32;
    frameBottom.position.y = -0.32;
    frameLeft.position.x = -0.5;
    frameLeft.rotation.z = Math.PI / 2;
    frameRight.position.x = 0.5;
    frameRight.rotation.z = Math.PI / 2;
    cropFrame.add(frameTop, frameBottom, frameLeft, frameRight);
    const cropFrameHandles: Array<Mesh<PlaneGeometry, MeshBasicMaterial>> = [];
    for (const [x, y] of [
      [-0.5, 0.32],
      [0.5, 0.32],
      [-0.5, -0.32],
      [0.5, -0.32]
    ] as const) {
      const handle = new Mesh(cropFrameHandleGeometry, cropFrameHandleMaterial);
      handle.position.set(x, y, 0.002);
      cropFrame.add(handle);
      cropFrameHandles.push(handle);
    }
    scene.add(cropFrame);

    targetRingGeometry = new RingGeometry(0.06, 0.084, 64);
    targetRingMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: 0xff9900,
      depthWrite: false,
      opacity: 0,
      side: DoubleSide,
      transparent: true
    });
    const targetRing = new Mesh(targetRingGeometry, targetRingMaterial);
    targetRing.name = "three-official-target-ring";
    targetRing.renderOrder = 44;
    targetRing.visible = false;
    scene.add(targetRing);

    const workbenchLayerGroup = new Group();
    workbenchLayerGroup.name = "official-arwes-layered-desk";
    workbenchLayerGroup.position.set(ARWES_DESK_LAYER_POSITION.x, ARWES_DESK_LAYER_POSITION.y, ARWES_DESK_LAYER_POSITION.z);
    workbenchLayerGroup.rotation.x = ARWES_DESK_ROTATION_X;
    scene.add(workbenchLayerGroup);

    const underGlow = new Mesh(
      new PlaneGeometry(1.24, 0.44),
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: 0xff00ff,
        depthWrite: false,
        opacity: 0.16,
        side: DoubleSide,
        transparent: true
      })
    );
    underGlow.position.z = -0.018;
    underGlow.renderOrder = 0;
    workbenchLayerGroup.add(underGlow);

    const glassBase = new Mesh(
      new PlaneGeometry(1.08, 0.34),
      new MeshBasicMaterial({
        color: 0x140a36,
        depthWrite: false,
        opacity: 0.28,
        side: DoubleSide,
        transparent: true
      })
    );
    glassBase.position.z = -0.006;
    glassBase.renderOrder = 1;
    workbenchLayerGroup.add(glassBase);

    const cyanRim = new Mesh(
      new PlaneGeometry(1.04, 0.315),
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: 0x00ffff,
        depthWrite: false,
        opacity: 0.11,
        side: DoubleSide,
        transparent: true
      })
    );
    cyanRim.position.z = 0.008;
    cyanRim.renderOrder = 2;
    workbenchLayerGroup.add(cyanRim);

    const playerGlow = new Mesh(
      new PlaneGeometry(1.12, 0.28),
      new MeshBasicMaterial({
        color: 0x00ffff,
        opacity: 0.07,
        transparent: true,
        depthWrite: false
      })
    );
    playerGlow.position.set(0, 1.16, -1.68);
    playerGlow.rotation.x = -0.9;
    scene.add(playerGlow);

    const group = new InteractiveGroup();
    group.listenToPointerEvents(renderer, camera);
    scene.add(group);

    playerMesh = new HTMLMesh(playerSource);
    playerMesh.name = "official-htmlmesh-player";
    playerMesh.position.set(0, 1.16, -1.66);
    playerMesh.rotation.x = -0.9;
    playerMesh.renderOrder = 4;
    group.add(playerMesh);

    htmlMesh = new HTMLMesh(source);
    htmlMesh.name = "official-htmlmesh-workbench";
    htmlMesh.position.set(ARWES_DESK_HTMLMESH_POSITION.x, ARWES_DESK_HTMLMESH_POSITION.y, ARWES_DESK_HTMLMESH_POSITION.z);
    htmlMesh.rotation.x = ARWES_DESK_ROTATION_X;
    htmlMesh.renderOrder = 3;
    group.add(htmlMesh);

    popupMesh = new HTMLMesh(popupSource);
    popupMesh.name = "official-htmlmesh-workbench-popup";
    popupMesh.position.set(ARWES_DESK_POPUP_POSITION.x, ARWES_DESK_POPUP_POSITION.y, ARWES_DESK_POPUP_POSITION.z);
    popupMesh.rotation.x = ARWES_DESK_POPUP_ROTATION_X;
    popupMesh.renderOrder = 6;
    popupMesh.visible = Boolean(openModuleRef.current);
    group.add(popupMesh);

    statusMesh = new HTMLMesh(statusSource);
    statusMesh.name = "official-htmlmesh-mode-strip";
    statusMesh.position.set(0, 1.55, -1.42);
    statusMesh.rotation.x = -0.24;
    statusMesh.renderOrder = 5;
    group.add(statusMesh);

    const quickMenuGroup = new Group();
    quickMenuGroup.name = "three-official-b-button-quick-menu";
    quickMenuGroup.visible = false;
    quickMenuGroup.renderOrder = 80;
    scene.add(quickMenuGroup);
    const quickMenuTiles: Array<{
      action: QuickMenuAction;
      activeMaterial: MeshBasicMaterial;
      inactiveMaterial: MeshBasicMaterial;
      mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
      x: number;
      y: number;
    }> = [];
    const quickMenuCellWidth = 0.1;
    const quickMenuCellHeight = 0.074;
    const quickMenuGap = 0.012;
    const quickMenuTileGeometry = new PlaneGeometry(quickMenuCellWidth, quickMenuCellHeight);
    QUICK_MENU_ITEMS.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = (col - 1) * (quickMenuCellWidth + quickMenuGap);
      const y = (1 - row) * (quickMenuCellHeight + quickMenuGap);
      const inactiveMaterial = createQuickMenuTileMaterial(item, false);
      const activeMaterial = createQuickMenuTileMaterial(item, true);
      const tile = new Mesh(quickMenuTileGeometry, inactiveMaterial);
      tile.name = `three-official-quick-menu-${item.action}`;
      tile.position.set(x, y, 0);
      tile.renderOrder = 81;
      quickMenuGroup.add(tile);
      quickMenuTiles.push({ action: item.action, activeMaterial, inactiveMaterial, mesh: tile, x, y });
    });

    const controllerModelFactory = new XRControllerModelFactory();
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);
    controller1.add(makeControllerRay());
    controller2.add(makeControllerRay());
    scene.add(controller1);
    scene.add(controller2);

    const grip1 = renderer.xr.getControllerGrip(0);
    const grip2 = renderer.xr.getControllerGrip(1);
    grip1.add(controllerModelFactory.createControllerModel(grip1));
    grip2.add(controllerModelFactory.createControllerModel(grip2));
    scene.add(grip1);
    scene.add(grip2);
    const quickMenuGripAnchors = [grip1, grip2];

    const direction = new Vector3();
    const frameDirection = new Vector3();
    const hitDirection = new Vector3();
    const markerDirection = new Vector3();
    const markerPosition = new Vector3();
    const cameraPosition = new Vector3();
    const quaternion = new Quaternion();
    const pointerNdc = new Vector2();
    const raycaster = new Raycaster();
    const rayDirection = new Vector3();
    const rayOrigin = new Vector3();
    const quickMenuLocalPoint = new Vector3();
    const quickMenuPointerWorld = new Vector3();
    const sphereCenter = new Vector3();
    const followControllerRef: { current: Object3D | null } = { current: null };
    const followControllerHandRef: { current: ControllerHand | null } = { current: null };
    const controllerRayOverrideState: Record<ControllerHand, { rayDirection: Vector3 | null; rayOrigin: Vector3 | null }> = {
      left: { rayDirection: null, rayOrigin: null },
      right: { rayDirection: null, rayOrigin: null }
    };
    const thumbstickOverrideState: Record<ControllerHand, { active: boolean; y: number }> = {
      left: { active: false, y: 0 },
      right: { active: false, y: 0 }
    };
    const thumbstickFovState = {
      active: false,
      lastFrameAt: performance.now(),
      lastInputAt: 0,
      pendingFlush: false
    };
    const quickMenuState = {
      lastButtonDown: false,
      recordToggleButtonDown: false,
      syntheticPointerPosition: null as Vector3 | null,
      syntheticRayDirection: null as Vector3 | null,
      syntheticRayOrigin: null as Vector3 | null
    };
    const leftMenuButtonState = {
      lastButtonDown: false
    };
    const selectComboState: Record<
      ControllerHand,
      {
        comboConsumed: boolean;
        down: boolean;
        instant: boolean;
        rayDirection: Vector3 | null;
        rayOrigin: Vector3 | null;
        startedAt: number;
        uiPressed: boolean;
      }
    > = {
      left: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0, uiPressed: false },
      right: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0, uiPressed: false }
    };
    const controllerDiscardState: {
      active: boolean;
      hand: ControllerHand | null;
      startMs: number;
    } = {
      active: false,
      hand: null,
      startMs: 0
    };
    let pointerClickStart: { x: number; y: number } | null = null;
    let smoothViewTargetMove: {
      durationMs: number;
      sourceLabel: string;
      start: ViewTargetPose;
      startedAt: number;
      target: ViewTargetPose;
    } | null = null;
    let targetRingPose: ViewTargetPose | null = null;
    let targetRingVisibleUntil = 0;
    let lastViewTargetUiUpdate = 0;
    let pendingHeadGazeStartedAt: number | null = null;

    function readPoseFromObject(object: Object3D, input: ViewInputSource) {
      return directionToViewTarget(readObjectForward(object, direction, quaternion), input);
    }

    function previewPoseFromObject(object: Object3D, input: ViewInputSource) {
      const pose = readPoseFromObject(object, input);
      viewTargetRef.current = pose;

      const now = performance.now();
      if (now - lastViewTargetUiUpdate > 120) {
        lastViewTargetUiUpdate = now;
        setViewTarget(pose);
      }

      return pose;
    }

    function getSpherePoseFromRay(origin: Vector3, rayDirectionValue: Vector3, input: ViewInputSource) {
      raycaster.ray.set(origin, rayDirectionValue.normalize());
      const uiObjects = [playerMesh, htmlMesh, popupMesh].filter((object): object is HTMLMesh => Boolean(object?.visible));
      const uiHit = uiObjects.length ? raycaster.intersectObjects(uiObjects, true)[0] : null;
      const sphereHit = raycaster.intersectObject(videoSphere, false)[0] ?? null;
      if (!sphereHit || (uiHit && uiHit.distance < sphereHit.distance)) {
        return null;
      }

      videoSphere.getWorldPosition(sphereCenter);
      return directionToViewTarget(hitDirection.copy(sphereHit.point).sub(sphereCenter).normalize(), input);
    }

    function getUiHitFromRay(origin: Vector3, rayDirectionValue: Vector3) {
      const uiObjects = [playerMesh, htmlMesh, popupMesh].filter((object): object is HTMLMesh => Boolean(object?.visible));
      if (!uiObjects.length) {
        return null;
      }

      raycaster.ray.set(origin, rayDirectionValue.normalize());
      return raycaster.intersectObjects(uiObjects, false)[0] ?? null;
    }

    function domSourceForHtmlMesh(mesh: HTMLMesh) {
      if (mesh === playerMesh) {
        return playerSource;
      }
      if (mesh === htmlMesh) {
        return source;
      }
      if (mesh === popupMesh) {
        return popupSource;
      }
      return null;
    }

    function hasInteractiveDomTarget(mesh: HTMLMesh, uv: Vector2) {
      const domSource = domSourceForHtmlMesh(mesh);
      if (!domSource) {
        return false;
      }

      const rootRect = domSource.getBoundingClientRect();
      const x = rootRect.left + uv.x * rootRect.width;
      const y = rootRect.top + (1 - uv.y) * rootRect.height;
      const interactiveElements = Array.from(domSource.querySelectorAll<HTMLElement>("button, input, select, a[href]"));

      return interactiveElements.some((element) => {
        if (element instanceof HTMLButtonElement && element.disabled) {
          return false;
        }
        if (element instanceof HTMLInputElement && element.disabled) {
          return false;
        }
        if (element instanceof HTMLSelectElement && element.disabled) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
    }

    function dispatchHtmlMeshPointerEventFromRay(origin: Vector3, rayDirectionValue: Vector3, eventType: "click" | "mousedown" | "mouseup") {
      const uiHit = getUiHitFromRay(origin, rayDirectionValue);
      if (!uiHit?.uv || !(uiHit.object instanceof HTMLMesh)) {
        return false;
      }
      if (!hasInteractiveDomTarget(uiHit.object, uiHit.uv)) {
        return false;
      }

      uiHit.object.dispatchEvent({
        data: new Vector2(uiHit.uv.x, 1 - uiHit.uv.y),
        type: eventType
      } as never);
      return true;
    }

    function dispatchHtmlMeshPointerEventFromController(
      hand: ControllerHand,
      controller: Object3D,
      eventType: "click" | "mousedown" | "mouseup",
      detail?: SyntheticControllerSelectDetail
    ) {
      const detailOrigin = vectorFromDetail(detail?.rayOrigin);
      const detailDirection = vectorFromDetail(detail?.rayDirection);
      const override = controllerRayOverrideState[hand];
      const origin = detailOrigin ?? override.rayOrigin;
      const directionValue = detailDirection ?? override.rayDirection;

      if (origin && directionValue) {
        return dispatchHtmlMeshPointerEventFromRay(origin, directionValue, eventType);
      }

      controller.getWorldPosition(rayOrigin);
      readObjectForward(controller, rayDirection, quaternion);
      return dispatchHtmlMeshPointerEventFromRay(rayOrigin, rayDirection, eventType);
    }

    function getSpherePoseFromPointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(pointerNdc, camera);
      return getSpherePoseFromRay(raycaster.ray.origin, raycaster.ray.direction, "controller_ray");
    }

    function getSpherePoseFromController(controller: Object3D) {
      controller.getWorldPosition(rayOrigin);
      readObjectForward(controller, rayDirection, quaternion);
      return getSpherePoseFromRay(rayOrigin, rayDirection, "controller_ray");
    }

    function setQuickMenuHighlightedAction(action: QuickMenuAction | null) {
      quickMenuSelectionRef.current = action;
      setQuickMenuSelection(action ?? "none");
      for (const tile of quickMenuTiles) {
        tile.mesh.material = tile.action === action ? tile.activeMaterial : tile.inactiveMaterial;
      }
    }

    function placeQuickMenu(anchorObject: Object3D) {
      camera.getWorldPosition(cameraPosition);
      const syntheticPointer = quickMenuState.syntheticPointerPosition ?? quickMenuState.syntheticRayOrigin;
      if (syntheticPointer) {
        quickMenuGroup.position.copy(syntheticPointer);
      } else {
        anchorObject.getWorldPosition(rayOrigin);
        quickMenuGroup.position.copy(rayOrigin);
      }
      quickMenuGroup.lookAt(cameraPosition);
      quickMenuGroup.updateMatrixWorld(true);
    }

    function openQuickMenu(anchorObject: Object3D = grip2) {
      quickMenuActiveRef.current = true;
      setQuickMenuActive(true);
      setQuickMenuHighlightedAction(null);
      placeQuickMenu(anchorObject);
      quickMenuGroup.visible = true;
      setUiModeValue("AIM", pendingEditRef.current);
      setLastAction("B HOLD: quick menu opened.");
    }

    async function executeQuickMenuAction(action: QuickMenuAction) {
      if (action === "startCrop") {
        startCropWorkflow();
      } else if (action === "endCrop") {
        await endCropWorkflow();
      } else if (action === "render") {
        await renderCropWorkflow();
      } else if (action === "cut") {
        emitSemantic({ type: "cutHere" });
        setLastAction("B QUICK MENU: Cut triggered.");
      } else if (action === "lock") {
        const next = !lockedRef.current;
        setLockedValue(next);
        setUiModeValue(next ? "LOCKED" : "IDLE", pendingEditRef.current);
        emitSemantic({ type: next ? "lockViewport" : "unlockViewport" });
        emitSemantic({ type: "flushPath", reason: "lock" });
        setLastAction(`B QUICK MENU: viewfinder ${next ? "locked" : "unlocked"}.`);
      } else if (action === "blackFade") {
        createWorkflowEffect("effectBlack");
      } else if (action === "whiteFlash") {
        createWorkflowEffect("effectWhite");
      } else if (action === "save") {
        emitSemantic({ type: "flushPath", reason: "live" });
        setLastAction("B QUICK MENU: path flush requested.");
      } else if (action === "discard") {
        emitSemantic({ type: "discardRange" });
        emitSemantic({ type: "flushPath", reason: "discard" });
        setLastAction("B QUICK MENU: discard range event queued.");
      } else if (action === "restore") {
        emitSemantic({ type: "restoreRange" });
        emitSemantic({ type: "flushPath", reason: "restore" });
        setLastAction("B QUICK MENU: restore range event queued.");
      } else if (action === "vhsBlank") {
        createWorkflowEffect("effectVhs");
      } else if (action === "fovIn") {
        setFovValue(fovRef.current - 5, { type: "nudgeFov", deltaH: -5 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("B QUICK MENU: FOV pushed in.");
      } else if (action === "fovOut") {
        setFovValue(fovRef.current + 5, { type: "nudgeFov", deltaH: 5 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("B QUICK MENU: FOV pulled out.");
      }
    }

    function closeQuickMenu(trigger = true) {
      const action = quickMenuSelectionRef.current;
      quickMenuActiveRef.current = false;
      setQuickMenuActive(false);
      setQuickMenuHighlightedAction(null);
      quickMenuGroup.visible = false;
      setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", pendingEditRef.current);
      if (trigger && action) {
        void executeQuickMenuAction(action);
      } else {
        setLastAction("B RELEASE: quick menu closed without selection.");
      }
    }

    function updateQuickMenuSelection(pointerObject: Object3D) {
      if (!quickMenuActiveRef.current) {
        return;
      }

      const syntheticPointer = quickMenuState.syntheticPointerPosition ?? quickMenuState.syntheticRayOrigin;
      if (syntheticPointer) {
        quickMenuPointerWorld.copy(syntheticPointer);
      } else {
        pointerObject.getWorldPosition(quickMenuPointerWorld);
      }
      quickMenuLocalPoint.copy(quickMenuPointerWorld);
      quickMenuGroup.worldToLocal(quickMenuLocalPoint);
      const hit = quickMenuTiles.find(
        (tile) =>
          Math.abs(quickMenuLocalPoint.x - tile.x) <= quickMenuCellWidth / 2 &&
          Math.abs(quickMenuLocalPoint.y - tile.y) <= quickMenuCellHeight / 2
      );
      setQuickMenuHighlightedAction(hit?.action ?? null);
    }

    function beginSmoothViewTargetMove(target: ViewTargetPose, sourceLabel: string) {
      smoothViewTargetMove = {
        durationMs: SPHERE_SMOOTH_MOVE_MS,
        sourceLabel,
        start: viewTargetRef.current,
        startedAt: performance.now(),
        target
      };
      targetRingPose = target;
      targetRingVisibleUntil = performance.now() + SPHERE_SMOOTH_MOVE_MS + 420;
      followControllerRef.current = null;
      followControllerHandRef.current = null;
      setFollowModeValue("idle");
      setLockedValue(false);
      setUiModeValue("AIM", true);
      emitSemantic({ type: "unlockViewport" });
      setLastAction(`${sourceLabel}: moving to yaw ${target.yaw.toFixed(1)} / pitch ${target.pitch.toFixed(1)}.`);
    }

    function handleCanvasPointerDown(event: PointerEvent) {
      if (event.button !== 0) {
        pointerClickStart = null;
        return;
      }

      pointerClickStart = {
        x: event.clientX,
        y: event.clientY
      };
    }

    function handleCanvasPointerUp(event: PointerEvent) {
      if (event.button !== 0 || !pointerClickStart) {
        pointerClickStart = null;
        return;
      }

      const movement = Math.hypot(event.clientX - pointerClickStart.x, event.clientY - pointerClickStart.y);
      pointerClickStart = null;
      if (movement > SPHERE_CLICK_MAX_MOVE_PX) {
        return;
      }

      const pose = getSpherePoseFromPointer(event);
      if (!pose) {
        return;
      }

      pendingHeadGazeStartedAt = null;
      if (event.ctrlKey || event.metaKey) {
        smoothViewTargetMove = null;
        commitViewTarget(pose, "SPHERE CTRL CLICK");
      } else {
        beginSmoothViewTargetMove(pose, "SPHERE CLICK");
      }
    }

    function beginHeadGazeFollow() {
      pendingHeadGazeStartedAt = null;
      followControllerRef.current = null;
      followControllerHandRef.current = null;
      setFollowModeValue("head_gaze");
      setLockedValue(false);
      setUiModeValue("GAZE", true);
      emitSemantic({ type: "unlockViewport" });
      setLastAction("TRIGGER HOLD: viewfinder follows headset gaze.");
    }

    function queueHeadGazeFollow() {
      pendingHeadGazeStartedAt = performance.now();
      setLastAction("TRIGGER: hold to steer viewfinder, tap remains available for spatial buttons.");
    }

    function readControllerTimelineTimeMs() {
      const currentVideo = videoRef.current;
      if (currentVideo && Number.isFinite(currentVideo.currentTime)) {
        return Math.max(0, Math.round(currentVideo.currentTime * 1000));
      }
      return currentTimeMsRef.current;
    }

    function beginControllerDiscardRange(hand: ControllerHand) {
      if (controllerDiscardState.active) {
        return;
      }

      const currentVideo = videoRef.current;
      if (!currentVideo || currentVideo.paused) {
        setLastAction("LEFT GRIP + RIGHT TRIGGER: play the video before marking a discard range.");
        return;
      }

      const startMs = readControllerTimelineTimeMs();
      controllerDiscardState.active = true;
      controllerDiscardState.hand = hand;
      controllerDiscardState.startMs = startMs;
      pendingHeadGazeStartedAt = null;
      setFollowModeValue("idle");
      setUiModeValue("AIM", true);
      emitSemantic({ type: "discardRange", startMs });
      setLastAction(`LEFT GRIP + RIGHT TRIGGER HOLD: discard starts at ${formatClock(startMs)}.`);
    }

    function finishControllerDiscardRange(reason: string) {
      if (!controllerDiscardState.active) {
        return false;
      }

      const startMs = controllerDiscardState.startMs;
      const endMs = Math.max(startMs + 1, readControllerTimelineTimeMs());
      controllerDiscardState.active = false;
      controllerDiscardState.hand = null;
      controllerDiscardState.startMs = 0;
      emitSemantic({ type: "restoreRange", startMs, endMs });
      emitSemantic({ type: "flushPath", reason: "discard" });
      setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", false);
      setLastAction(`${reason}: discard marked ${formatClock(startMs)}-${formatClock(endMs)}.`);
      return true;
    }

    function vectorFromDetail(value: SyntheticControllerSelectDetail["rayDirection"] | SyntheticControllerSelectDetail["rayOrigin"]) {
      if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
        return null;
      }

      return new Vector3(value.x, value.y, value.z);
    }

    function setControllerRayOverride(hand: ControllerHand, detail?: SyntheticControllerSelectDetail) {
      const detailOrigin = vectorFromDetail(detail?.rayOrigin);
      const detailDirection = vectorFromDetail(detail?.rayDirection);

      if (detailOrigin) {
        controllerRayOverrideState[hand].rayOrigin = detailOrigin;
      }
      if (detailDirection) {
        controllerRayOverrideState[hand].rayDirection = detailDirection;
      }
    }

    function clearControllerRayOverride(hand: ControllerHand) {
      controllerRayOverrideState[hand].rayOrigin = null;
      controllerRayOverrideState[hand].rayDirection = null;
    }

    function poseFromControllerRay(hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) {
      const detailOrigin = vectorFromDetail(detail?.rayOrigin);
      const detailDirection = vectorFromDetail(detail?.rayDirection);
      const override = controllerRayOverrideState[hand];
      const origin = detailOrigin ?? override.rayOrigin;
      const directionValue = detailDirection ?? override.rayDirection;

      if (origin && directionValue) {
        return getSpherePoseFromRay(origin, directionValue, "controller_ray");
      }

      return getSpherePoseFromController(controller);
    }

    function poseFromSelectState(hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) {
      const current = selectComboState[hand];
      const detailOrigin = vectorFromDetail(detail?.rayOrigin);
      const detailDirection = vectorFromDetail(detail?.rayDirection);
      const override = controllerRayOverrideState[hand];
      const origin = detailOrigin ?? current.rayOrigin ?? override.rayOrigin;
      const directionValue = detailDirection ?? current.rayDirection ?? override.rayDirection;

      if (origin && directionValue) {
        return getSpherePoseFromRay(origin, directionValue, "controller_ray");
      }

      return getSpherePoseFromController(controller);
    }

    function handleSelectStart(hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) {
      const now = performance.now();
      const current = selectComboState[hand];
      const otherHand: ControllerHand = hand === "left" ? "right" : "left";
      const other = selectComboState[otherHand];
      const detailOrigin = vectorFromDetail(detail?.rayOrigin);
      const detailDirection = vectorFromDetail(detail?.rayDirection);

      current.down = true;
      current.startedAt = now;
      current.comboConsumed = false;
      current.instant = Boolean(detail?.instant);
      current.rayOrigin = detailOrigin;
      current.rayDirection = detailDirection;
      current.uiPressed = false;
      setControllerRayOverride(hand, detail);

      if (hand === "right" && leftGripModifierRef.current) {
        current.comboConsumed = true;
        beginControllerDiscardRange(hand);
        return;
      }

      if (other.down && now - other.startedAt <= DUAL_SELECT_COMBO_MS) {
        current.comboConsumed = true;
        other.comboConsumed = true;
        pendingHeadGazeStartedAt = null;
        setFollowModeValue("idle");
        void toggleVideoPlayback("DUAL SELECT");
        return;
      }

      if (dispatchHtmlMeshPointerEventFromController(hand, controller, "mousedown", detail)) {
        current.comboConsumed = true;
        current.uiPressed = true;
        pendingHeadGazeStartedAt = null;
        setFollowModeValue("idle");
        setUiModeValue("AIM", pendingEditRef.current);
        setLastAction(`UI RAY ${hand.toUpperCase()}: spatial button pressed.`);
        return;
      }

      queueHeadGazeFollow();
    }

    function handleSelectEnd(hand: ControllerHand, controller: Object3D, detail?: SyntheticControllerSelectDetail) {
      const current = selectComboState[hand];
      const comboConsumed = current.comboConsumed;
      const heldMs = performance.now() - current.startedAt;
      const instant = current.instant || Boolean(detail?.instant);
      current.down = false;
      current.comboConsumed = false;
      current.instant = false;

      if (current.uiPressed) {
        current.uiPressed = false;
        pendingHeadGazeStartedAt = null;
        dispatchHtmlMeshPointerEventFromController(hand, controller, "mouseup", detail);
        dispatchHtmlMeshPointerEventFromController(hand, controller, "click", detail);
        setLastAction(`UI RAY ${hand.toUpperCase()}: spatial button clicked.`);
        current.rayOrigin = null;
        current.rayDirection = null;
        return;
      }

      if (controllerDiscardState.active && controllerDiscardState.hand === hand) {
        finishControllerDiscardRange("RIGHT TRIGGER RELEASE");
        pendingHeadGazeStartedAt = null;
        current.rayOrigin = null;
        current.rayDirection = null;
        return;
      }

      if (comboConsumed) {
        pendingHeadGazeStartedAt = null;
        current.rayOrigin = null;
        current.rayDirection = null;
        return;
      }

      if (followModeRef.current === "head_gaze") {
        commitHeadGazeFollow();
      } else if (heldMs < HEAD_GAZE_HOLD_MS) {
        pendingHeadGazeStartedAt = null;
        const pose = poseFromSelectState(hand, controller, detail);
        if (pose) {
          if (instant) {
            commitViewTarget(pose, `TRIGGER RAY SNAP ${hand.toUpperCase()}`);
          } else {
            beginSmoothViewTargetMove(pose, `TRIGGER RAY CLICK ${hand.toUpperCase()}`);
          }
        } else {
          setLastAction(`TRIGGER RAY CLICK ${hand.toUpperCase()}: no video sphere target.`);
        }
      } else {
        commitHeadGazeFollow();
      }

      current.rayOrigin = null;
      current.rayDirection = null;
    }

    function commitHeadGazeFollow() {
      if (followModeRef.current === "head_gaze") {
        commitViewTarget(readPoseFromObject(camera, "head_gaze"), "TRIGGER RELEASE");
      } else {
        pendingHeadGazeStartedAt = null;
      }
    }

    function beginOpacityModifier() {
      setLeftGripModifierValue(true);
      setFollowModeValue("idle");
      setUiModeValue("OPACITY", false);
      setLastAction("LEFT GRIP HOLD: right stick controls mask opacity.");
    }

    function endOpacityModifier() {
      setLeftGripModifierValue(false);
      if (controllerDiscardState.active) {
        finishControllerDiscardRange("LEFT GRIP RELEASE");
        return;
      }
      setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", pendingEditRef.current);
      setLastAction(`LEFT GRIP RELEASE: mask opacity ${maskOpacityRef.current.toFixed(2)}.`);
    }

    function previewControllerFollow(controller: Object3D, hand: ControllerHand) {
      const pose = poseFromControllerRay(hand, controller);
      if (!pose) {
        return null;
      }

      viewTargetRef.current = pose;
      const now = performance.now();
      if (now - lastViewTargetUiUpdate > 120) {
        lastViewTargetUiUpdate = now;
        setViewTarget(pose);
      }
      return pose;
    }

    function beginControllerFollow(controller: Object3D, hand: ControllerHand, detail?: SyntheticControllerSelectDetail) {
      setControllerRayOverride(hand, detail);
      followControllerRef.current = controller;
      followControllerHandRef.current = hand;
      setFollowModeValue("controller_ray");
      setLockedValue(false);
      setUiModeValue("DRAG", true);
      emitSemantic({ type: "controllerAimStart", hand });
      setLastAction(`GRIP HOLD: ${hand} controller ray drags viewfinder; right stick changes FOV while dragging.`);
    }

    function commitControllerFollow(controller: Object3D, hand: ControllerHand, detail?: SyntheticControllerSelectDetail) {
      setControllerRayOverride(hand, detail);
      const pose = poseFromControllerRay(hand, controller);
      if (pose) {
        commitViewTarget(pose, `GRIP RELEASE ${hand.toUpperCase()}`);
      } else {
        setFollowModeValue("idle");
        setUiModeValue("IDLE", false);
        setLastAction(`GRIP RELEASE ${hand.toUpperCase()}: no video sphere target.`);
      }
      followControllerRef.current = null;
      followControllerHandRef.current = null;
      clearControllerRayOverride(hand);
      emitSemantic({ type: "controllerAimEnd", hand });
    }

    const controllerListeners: Array<() => void> = [];
    const bindControllerListener = (controller: XrControllerObject, type: string, listener: (event: unknown) => void) => {
      controller.addEventListener(type, listener);
      controllerListeners.push(() => controller.removeEventListener(type, listener));
    };
    const xrController1 = controller1 as XrControllerObject;
    const xrController2 = controller2 as XrControllerObject;

    bindControllerListener(xrController1, "selectstart", () => handleSelectStart("left", controller1));
    bindControllerListener(xrController2, "selectstart", () => handleSelectStart("right", controller2));
    bindControllerListener(xrController1, "selectend", () => handleSelectEnd("left", controller1));
    bindControllerListener(xrController2, "selectend", () => handleSelectEnd("right", controller2));
    bindControllerListener(xrController1, "squeezestart", beginOpacityModifier);
    bindControllerListener(xrController2, "squeezestart", () => beginControllerFollow(controller2, "right"));
    bindControllerListener(xrController1, "squeezeend", endOpacityModifier);
    bindControllerListener(xrController2, "squeezeend", () => commitControllerFollow(controller2, "right"));

    function handleSyntheticControllerSelect(event: Event) {
      const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
      if (detail?.hand !== "left" && detail?.hand !== "right") {
        return;
      }

      const controller = detail.hand === "left" ? controller1 : controller2;
      if (detail.phase === "start") {
        handleSelectStart(detail.hand, controller, detail);
      } else if (detail.phase === "end") {
        handleSelectEnd(detail.hand, controller, detail);
      }
    }

    function handleSyntheticControllerAim(event: Event) {
      const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
      if (detail?.hand !== "left" && detail?.hand !== "right") {
        return;
      }

      setControllerRayOverride(detail.hand, detail);
    }

    function handleSyntheticControllerSqueeze(event: Event) {
      const detail = (event as CustomEvent<SyntheticControllerSelectDetail>).detail;
      if (detail?.hand !== "left" && detail?.hand !== "right") {
        return;
      }

      const controller = detail.hand === "left" ? controller1 : controller2;
      if (detail.phase === "start") {
        if (detail.hand === "left") {
          beginOpacityModifier();
        } else {
          beginControllerFollow(controller, detail.hand, detail);
        }
      } else if (detail.phase === "end") {
        if (detail.hand === "left") {
          endOpacityModifier();
        } else {
          commitControllerFollow(controller, detail.hand, detail);
        }
      }
    }

    function handleSyntheticThumbstick(event: Event) {
      const detail = (event as CustomEvent<SyntheticThumbstickDetail>).detail;
      if (detail?.hand !== "left" && detail?.hand !== "right") {
        return;
      }

      const y = Number.isFinite(detail.y) ? clampNumber(Number(detail.y), -1, 1) : 0;
      thumbstickOverrideState[detail.hand].active = true;
      thumbstickOverrideState[detail.hand].y = y;
    }

    function handleSyntheticQuickMenu(event: Event) {
      const detail = (event as CustomEvent<SyntheticQuickMenuDetail>).detail;
      const pointerPosition = vectorFromDetail(detail?.pointerPosition);
      const origin = vectorFromDetail(detail?.rayOrigin);
      const directionValue = vectorFromDetail(detail?.rayDirection);
      if (pointerPosition) {
        quickMenuState.syntheticPointerPosition = pointerPosition;
      }
      if (origin) {
        quickMenuState.syntheticRayOrigin = origin;
      }
      if (directionValue) {
        quickMenuState.syntheticRayDirection = directionValue;
      }

      if (detail?.phase === "press") {
        openQuickMenu(grip2);
      } else if (detail?.phase === "aim") {
        updateQuickMenuSelection(grip2);
      } else if (detail?.phase === "release") {
        updateQuickMenuSelection(grip2);
        closeQuickMenu(true);
        quickMenuState.syntheticPointerPosition = null;
        quickMenuState.syntheticRayOrigin = null;
        quickMenuState.syntheticRayDirection = null;
      }
    }

    function handleSyntheticMenuToggle() {
      toggleSpatialMenusVisible();
    }

    function handleSyntheticRecordToggle() {
      toggleCropWorkflowFromController("SYNTHETIC RECORD TOGGLE");
    }

    function readRightThumbstickYAxis() {
      if (thumbstickOverrideState.right.active) {
        return thumbstickOverrideState.right.y;
      }

      const session = renderer.xr.getSession();
      if (!session) {
        return 0;
      }

      for (const inputSource of Array.from(session.inputSources)) {
        if (inputSource.handedness !== "right") {
          continue;
        }

        return inputSource.gamepad?.axes?.[3] ?? inputSource.gamepad?.axes?.[1] ?? 0;
      }

      return 0;
    }

    function readRightQuickMenuButtonState() {
      const session = renderer.xr.getSession();
      if (!session) {
        return { anchor: grip2 as Object3D, pressed: false };
      }

      const inputSources = Array.from(session.inputSources);
      for (const [index, inputSource] of inputSources.entries()) {
        if (inputSource.handedness !== "right") {
          continue;
        }

        return {
          anchor: quickMenuGripAnchors[index] ?? grip2,
          pressed: Boolean(inputSource.gamepad?.buttons?.[QUICK_MENU_BUTTON_INDEX]?.pressed)
        };
      }

      return { anchor: grip2 as Object3D, pressed: false };
    }

    function readLeftMenuButtonPressed() {
      const session = renderer.xr.getSession();
      if (!session) {
        return false;
      }

      for (const inputSource of Array.from(session.inputSources)) {
        if (inputSource.handedness !== "left") {
          continue;
        }

        return Boolean(inputSource.gamepad?.buttons?.[LEFT_MENU_BUTTON_INDEX]?.pressed);
      }

      return false;
    }

    function tickQuickMenuButton() {
      const { anchor, pressed } = readRightQuickMenuButtonState();
      if (leftGripModifierRef.current) {
        if (pressed && !quickMenuState.recordToggleButtonDown) {
          toggleCropWorkflowFromController("LEFT GRIP + RIGHT B");
        }
        quickMenuState.recordToggleButtonDown = pressed;
        quickMenuState.lastButtonDown = pressed;
        if (quickMenuActiveRef.current) {
          closeQuickMenu(false);
        }
        return;
      }

      if (!spatialMenusVisibleRef.current) {
        quickMenuState.recordToggleButtonDown = false;
        quickMenuState.lastButtonDown = pressed;
        return;
      }

      quickMenuState.recordToggleButtonDown = false;
      if (pressed && !quickMenuState.lastButtonDown) {
        openQuickMenu(anchor);
      }
      if (pressed) {
        updateQuickMenuSelection(anchor);
      }
      if (!pressed && quickMenuState.lastButtonDown) {
        closeQuickMenu(true);
      }
      quickMenuState.lastButtonDown = pressed;
    }

    function tickLeftMenuButton() {
      const pressed = readLeftMenuButtonPressed();
      if (pressed && !leftMenuButtonState.lastButtonDown) {
        toggleSpatialMenusVisible();
      }
      leftMenuButtonState.lastButtonDown = pressed;
    }

    function tickThumbstickControls(now: number) {
      const dtSeconds = Math.min(0.05, Math.max(0, (now - thumbstickFovState.lastFrameAt) / 1000));
      thumbstickFovState.lastFrameAt = now;

      const yAxis = readRightThumbstickYAxis();
      const magnitude = Math.abs(yAxis);
      if (magnitude > FOV_THUMBSTICK_DEADZONE) {
        const normalized = (magnitude - FOV_THUMBSTICK_DEADZONE) / (1 - FOV_THUMBSTICK_DEADZONE);
        if (controllerDiscardState.active) {
          thumbstickFovState.active = false;
          thumbstickFovState.lastInputAt = now;
          return;
        }
        if (leftGripModifierRef.current) {
          const deltaOpacity = Math.sign(yAxis) * normalized * MASK_OPACITY_THUMBSTICK_MAX_PER_SECOND * dtSeconds;
          if (Math.abs(deltaOpacity) >= 0.001) {
            const nextOpacity = setMaskOpacityValue(maskOpacityRef.current + deltaOpacity);
            setUiModeValue("OPACITY", false);
            setLastAction(`LEFT GRIP + RIGHT STICK: mask opacity ${nextOpacity.toFixed(2)}.`);
          }
          thumbstickFovState.active = false;
          thumbstickFovState.lastInputAt = now;
          return;
        }

        const signedVelocity = Math.sign(yAxis) * normalized * FOV_THUMBSTICK_MAX_DEG_PER_SECOND;
        const deltaH = signedVelocity * dtSeconds;
        if (Math.abs(deltaH) >= 0.01) {
          const nextFov = setFovValue(fovRef.current + deltaH, { type: "nudgeFov", deltaH: Number(deltaH.toFixed(2)) });
          setUiModeValue("FOV", true);
          thumbstickFovState.active = true;
          thumbstickFovState.lastInputAt = now;
          thumbstickFovState.pendingFlush = true;
          const sourceLabel = followModeRef.current === "controller_ray" ? "RIGHT GRIP DRAG + RIGHT STICK" : "RIGHT STICK HOLD";
          setLastAction(`${sourceLabel}: FOV ${deltaH < 0 ? "in" : "out"} to ${nextFov.toFixed(1)}.`);
        }
        return;
      }

      if (thumbstickFovState.active) {
        thumbstickFovState.active = false;
        thumbstickFovState.lastInputAt = now;
      }

      if (thumbstickFovState.pendingFlush && now - thumbstickFovState.lastInputAt >= FOV_FLUSH_DEBOUNCE_MS) {
        thumbstickFovState.pendingFlush = false;
        emitSemantic({ type: "flushPath", reason: "fov" });
        setUiModeValue(lockedRef.current ? "LOCKED" : "IDLE", false);
        setLastAction(`RIGHT STICK RELEASE: FOV committed at ${fovRef.current.toFixed(1)}.`);
      }
    }

    window.addEventListener("three-official-controller-select", handleSyntheticControllerSelect as EventListener);
    window.addEventListener("three-official-controller-aim", handleSyntheticControllerAim as EventListener);
    window.addEventListener("three-official-controller-squeeze", handleSyntheticControllerSqueeze as EventListener);
    window.addEventListener("three-official-quick-menu", handleSyntheticQuickMenu as EventListener);
    window.addEventListener("three-official-menu-toggle", handleSyntheticMenuToggle as EventListener);
    window.addEventListener("three-official-record-toggle", handleSyntheticRecordToggle as EventListener);
    window.addEventListener("three-official-thumbstick", handleSyntheticThumbstick as EventListener);
    renderer.domElement.addEventListener("pointerdown", handleCanvasPointerDown);
    renderer.domElement.addEventListener("pointerup", handleCanvasPointerUp);

    function resize() {
      if (!mount || disposed) {
        return;
      }
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    }

    window.addEventListener("resize", resize);
    renderer.setAnimationLoop((time) => {
      if (
        pendingHeadGazeStartedAt !== null &&
        followModeRef.current === "idle" &&
        performance.now() - pendingHeadGazeStartedAt >= HEAD_GAZE_HOLD_MS
      ) {
        beginHeadGazeFollow();
      }

      if (followModeRef.current === "head_gaze") {
        previewPoseFromObject(camera, "head_gaze");
      } else if (followModeRef.current === "controller_ray" && followControllerRef.current && followControllerHandRef.current) {
        previewControllerFollow(followControllerRef.current, followControllerHandRef.current);
      }

      if (smoothViewTargetMove) {
        const progress = (performance.now() - smoothViewTargetMove.startedAt) / smoothViewTargetMove.durationMs;
        if (progress >= 1) {
          const finishedMove = smoothViewTargetMove;
          smoothViewTargetMove = null;
          commitViewTarget(finishedMove.target, finishedMove.sourceLabel);
        } else {
          previewViewTarget(interpolateViewTargetPose(smoothViewTargetMove.start, smoothViewTargetMove.target, progress));
        }
      }

      tickLeftMenuButton();
      tickQuickMenuButton();
      tickThumbstickControls(performance.now());

      const pose = viewTargetRef.current;
      cropMaskUniforms.uCenterYaw.value = pose.yaw * DEG_TO_RAD;
      cropMaskUniforms.uCenterPitch.value = pose.pitch * DEG_TO_RAD;
      cropMaskUniforms.uFov.value.set(fovRef.current * DEG_TO_RAD, verticalFovFromHorizontal(fovRef.current) * DEG_TO_RAD);
      cropMaskUniforms.uLocked.value = lockedRef.current ? 1 : 0;
      cropMaskUniforms.uOpacity.value = maskOpacityRef.current;
      cropMaskUniforms.uTime.value = time;

      viewTargetToDirection(pose, markerDirection);
      camera.getWorldPosition(cameraPosition);
      cropMask.getWorldPosition(sphereCenter);
      frameDirection
        .copy(sphereCenter)
        .add(markerPosition.copy(markerDirection).multiplyScalar(CROP_MASK_RADIUS))
        .sub(cameraPosition)
        .normalize();
      targetReticle.position.copy(cameraPosition).add(markerPosition.copy(frameDirection).multiplyScalar(2.05));
      targetReticle.lookAt(cameraPosition);
      targetReticle.scale.setScalar(followModeRef.current === "idle" ? 1 : 1.22);
      reticleMaterial?.color.set(lockedRef.current ? 0x00ffff : followModeRef.current === "controller_ray" ? 0xff9900 : 0xff00ff);
      if (reticleMaterial) {
        reticleMaterial.opacity = followModeRef.current === "idle" ? 0.86 : 1;
      }

      const frameHorizontalFovRad = fovRef.current * DEG_TO_RAD;
      const frameVerticalFovRad = verticalFovFromHorizontal(fovRef.current) * DEG_TO_RAD;
      const frameWidth = 2 * CROP_FRAME_DISTANCE * Math.tan(frameHorizontalFovRad / 2);
      const frameHeight = 2 * CROP_FRAME_DISTANCE * Math.tan(frameVerticalFovRad / 2);
      const frameHandleSize = clampNumber(Math.min(frameWidth, frameHeight) * 0.055, 0.04, 0.08);
      cropFrame.position.copy(cameraPosition).add(markerPosition.copy(frameDirection).multiplyScalar(CROP_FRAME_DISTANCE));
      cropFrame.lookAt(cameraPosition);
      cropFrame.scale.setScalar(1);
      frameTop.position.y = frameHeight / 2;
      frameBottom.position.y = -frameHeight / 2;
      frameLeft.position.x = -frameWidth / 2;
      frameRight.position.x = frameWidth / 2;
      frameTop.scale.set(frameWidth, 1, 1);
      frameBottom.scale.set(frameWidth, 1, 1);
      frameLeft.scale.set(frameHeight, 1, 1);
      frameRight.scale.set(frameHeight, 1, 1);
      for (let index = 0; index < cropFrameHandles.length; index += 1) {
        const x = index % 2 === 0 ? -frameWidth / 2 : frameWidth / 2;
        const y = index < 2 ? frameHeight / 2 : -frameHeight / 2;
        const handle = cropFrameHandles[index];
        handle.position.set(x, y, 0.002);
        handle.scale.setScalar(frameHandleSize / 0.075);
      }
      const cropFrameActive = uiModeRef.current === "AIM" || uiModeRef.current === "DRAG" || uiModeRef.current === "GAZE";
      cropFrame.visible = cropFrameActive;
      if (cropFrameMaterial) {
        cropFrameMaterial.color.set(
          uiModeRef.current === "DRAG"
            ? 0xff9900
            : uiModeRef.current === "GAZE"
              ? 0xff00ff
              : uiModeRef.current === "AIM"
                ? 0xffff66
                : 0x00ffff
        );
        cropFrameMaterial.opacity = cropFrameActive ? (uiModeRef.current === "DRAG" ? 0.92 : 0.56) : 0;
      }
      if (cropFrameHandleMaterial) {
        cropFrameHandleMaterial.opacity = uiModeRef.current === "DRAG" ? 0.9 : 0;
      }

      if (targetRingPose && targetRingMaterial && performance.now() <= targetRingVisibleUntil) {
        viewTargetToDirection(targetRingPose, direction);
        targetRing.visible = true;
        targetRing.position.copy(cameraPosition).add(markerPosition.copy(direction).multiplyScalar(2.14));
        targetRing.lookAt(cameraPosition);
        targetRing.scale.setScalar(1 + Math.sin(time * 0.012) * 0.08);
        targetRingMaterial.opacity = 0.92;
      } else if (targetRingMaterial) {
        targetRing.visible = false;
        targetRingMaterial.opacity = 0;
      }

      const menusVisible = spatialMenusVisibleRef.current;
      playerGlow.visible = menusVisible;
      workbenchLayerGroup.visible = menusVisible;
      if (playerMesh) {
        playerMesh.visible = menusVisible;
      }
      if (htmlMesh) {
        htmlMesh.visible = menusVisible;
      }
      if (statusMesh) {
        statusMesh.visible = menusVisible;
      }
      if (!menusVisible) {
        quickMenuGroup.visible = false;
      }
      if (popupMesh) {
        popupMesh.visible = menusVisible && Boolean(openModuleRef.current);
      }

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("three-official-controller-select", handleSyntheticControllerSelect as EventListener);
      window.removeEventListener("three-official-controller-aim", handleSyntheticControllerAim as EventListener);
      window.removeEventListener("three-official-controller-squeeze", handleSyntheticControllerSqueeze as EventListener);
      window.removeEventListener("three-official-quick-menu", handleSyntheticQuickMenu as EventListener);
      window.removeEventListener("three-official-menu-toggle", handleSyntheticMenuToggle as EventListener);
      window.removeEventListener("three-official-record-toggle", handleSyntheticRecordToggle as EventListener);
      window.removeEventListener("three-official-thumbstick", handleSyntheticThumbstick as EventListener);
      renderer.domElement.removeEventListener("pointerdown", handleCanvasPointerDown);
      renderer.domElement.removeEventListener("pointerup", handleCanvasPointerUp);
      renderer.setAnimationLoop(null);
      controllerListeners.forEach((remove) => remove());
      group.disconnect();
      htmlMesh?.dispose?.();
      playerMesh?.dispose?.();
      popupMesh?.dispose?.();
      statusMesh?.dispose?.();
      cropMaskGeometry?.dispose();
      cropMaskMaterial?.dispose();
      cropFrameBarGeometry?.dispose();
      cropFrameHandleGeometry?.dispose();
      cropFrameMaterial?.dispose();
      cropFrameHandleMaterial?.dispose();
      targetRingGeometry?.dispose();
      targetRingMaterial?.dispose();
      quickMenuTileGeometry.dispose();
      for (const tile of quickMenuTiles) {
        tile.activeMaterial.map?.dispose();
        tile.activeMaterial.dispose();
        tile.inactiveMaterial.map?.dispose();
        tile.inactiveMaterial.dispose();
      }
      reticleGeometry?.dispose();
      reticleMaterial?.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
      videoTexture?.dispose();
      renderer.dispose();
      vrButton.onclick = null;
      void currentXrSession?.end().catch(() => undefined);
      vrButton.remove();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    async function loadVideoSources() {
      if (initialSources?.length) {
        setVideoSources(initialSources);
        setVideoIndex((index) => Math.min(index, initialSources.length - 1));
        setLastAction(`PLAYER: ${initialSources.length} backend video${initialSources.length === 1 ? "" : "s"} loaded for playlist selector.`);
        return;
      }

      try {
        const response = await fetch("/api/xr/video-sources", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`video source list returned ${response.status}`);
        }
        const body = (await response.json()) as { videos?: AFrame360VideoSource[] };
        const videos = body.videos;
        if (!disposed && videos?.length) {
          setVideoSources(videos);
          setVideoIndex((index) => Math.min(index, videos.length - 1));
          setLastAction("PLAYER: video source list loaded for spatial panel.");
        }
      } catch (error) {
        if (!disposed) {
          setVideoSources(FALLBACK_VIDEO_SOURCES);
          setLastAction(error instanceof Error ? `PLAYER: using fallback source (${error.message}).` : "PLAYER: using fallback source.");
        }
      }
    }

    void loadVideoSources();

    return () => {
      disposed = true;
    };
  }, [initialSources]);

  useEffect(() => {
    const video = videoRef.current;
    const source = currentVideoSource;
    if (!video || !source) {
      return;
    }

    let disposed = false;
    let hls: Hls | null = null;

    video.pause();
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.playbackRate = playbackRate;
    video.removeAttribute("src");
    video.load();

    setPlaybackStatus("loading");
    currentTimeMsRef.current = 0;
    setCurrentTimeMs(0);
    setDurationMs(source.durationMs ?? 0);

    if (source.kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source.sourceUrl;
        video.load();
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!disposed && data.fatal) {
            setPlaybackStatus("error");
            setLastAction("PLAYER: HLS source failed.");
          }
        });
        hls.loadSource(source.sourceUrl);
        hls.attachMedia(video);
      } else {
        setPlaybackStatus("error");
        setLastAction("PLAYER: HLS is not supported in this browser.");
      }
    } else {
      video.src = source.sourceUrl;
      video.load();
    }

    setLastAction(
      initialSources?.length ? `PLAYER: loaded ${source.title} from backend playlist.` : `PLAYER: loaded ${source.title}.`
    );

    return () => {
      disposed = true;
      hls?.destroy();
    };
  }, [currentVideoSource, initialSources?.length]);

  useEffect(() => {
    if (!backendBinding) {
      return;
    }

    const newVideoId = videoSources[videoIndex]?.id;
    if (newVideoId && newVideoId !== backendBinding.videoId) {
      void updateCutSessionVideo(backendBinding.sessionId, newVideoId).catch((error) => {
        console.error("Failed to update session video:", error);
      });
    }
  }, [videoIndex, videoSources, backendBinding]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const currentVideo = video;

    function updateReady() {
      setPlaybackStatus(currentVideo.paused ? "ready" : "playing");
      setDurationMs(Number.isFinite(currentVideo.duration) ? Math.round(currentVideo.duration * 1000) : 0);
    }

    function updateTime() {
      const nextTimeMs = Math.max(0, Math.round(currentVideo.currentTime * 1000));
      currentTimeMsRef.current = nextTimeMs;
      setCurrentTimeMs(nextTimeMs);
    }

    function updatePlaying() {
      setPlaybackStatus("playing");
    }

    function updatePaused() {
      setPlaybackStatus(currentVideo.readyState >= 2 ? "paused" : "ready");
    }

    function updateError() {
      setPlaybackStatus("error");
    }

    video.addEventListener("canplay", updateReady);
    video.addEventListener("durationchange", updateReady);
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("playing", updatePlaying);
    video.addEventListener("pause", updatePaused);
    video.addEventListener("error", updateError);

    return () => {
      video.removeEventListener("canplay", updateReady);
      video.removeEventListener("durationchange", updateReady);
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("playing", updatePlaying);
      video.removeEventListener("pause", updatePaused);
      video.removeEventListener("error", updateError);
    };
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const popup = popupRef.current;
    const source = sourceRef.current;
    const workflowState = workflowStateRef.current;
    if (!player || !popup || !source || !workflowState) {
      return;
    }

    function handleClick(event: Event) {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.action as OfficialAction | undefined;
      const module = target.dataset.module as OfficialModule | undefined;

      if (module) {
        setMode(module);
        setOpenModule((current) => (current === module ? null : module));
        setLastAction(`${module}: extension HTMLMesh toggled from native DOM click.`);
        return;
      }

      if (!action) {
        return;
      }

      if (action === "LOCK") {
        const next = !locked;
        setLockedValue(next);
        emitSemantic({ type: next ? "lockViewport" : "unlockViewport" });
        emitSemantic({ type: "flushPath", reason: "lock" });
        setLastAction(actionMessage(action, fov, next));
        return;
      }

      if (action === "FOV") {
        setOpenModule("FOV");
        setMode("FOV");
        setLastAction(actionMessage(action, fov, locked));
        return;
      }

      if (action === "BGM_AMBIENT") {
        selectBgm("ambient-pulse");
        return;
      } else if (action === "BGM_KICK") {
        selectBgm("kick-guide");
        return;
      } else if (action === "BGM_NONE") {
        selectBgm("none");
        return;
      } else if (action === "BGM_PREVIEW") {
        toggleBgmPreview();
        return;
      } else if (action === "EFFECT_BLACK") {
        createWorkflowEffect("effectBlack");
        return;
      } else if (action === "EFFECT_WHITE") {
        createWorkflowEffect("effectWhite");
        return;
      } else if (action === "EFFECT_VHS") {
        createWorkflowEffect("effectVhs");
        return;
      }

      if (action === "CUT") {
        emitSemantic({ type: "cutHere" });
      } else if (action === "FOV_IN") {
        setFovValue(fovRef.current - 5, { type: "nudgeFov", deltaH: -5 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("FOV: panel pushed the viewfinder in.");
        return;
      } else if (action === "FOV_OUT") {
        setFovValue(fovRef.current + 5, { type: "nudgeFov", deltaH: 5 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("FOV: panel pulled the viewfinder out.");
        return;
      } else if (action === "YAW_LEFT") {
        nudgeViewTarget(-5, 0, "PANEL YAW LEFT");
        return;
      } else if (action === "YAW_RIGHT") {
        nudgeViewTarget(5, 0, "PANEL YAW RIGHT");
        return;
      } else if (action === "PITCH_UP") {
        nudgeViewTarget(0, 5, "PANEL PITCH UP");
        return;
      } else if (action === "PITCH_DOWN") {
        nudgeViewTarget(0, -5, "PANEL PITCH DOWN");
        return;
      } else if (action === "START_CROP") {
        startCropWorkflow();
        return;
      } else if (action === "END_CROP") {
        void endCropWorkflow();
        return;
      } else if (action === "RENDER") {
        void renderCropWorkflow();
        return;
      } else if (action === "PLAY") {
        void toggleVideoPlayback("PLAY");
        return;
      } else if (action === "SAVE" || action === "FLUSH") {
        emitSemantic({ type: "flushPath", reason: "live" });
      } else if (action === "DISCARD") {
        emitSemantic({ type: "discardRange" });
        emitSemantic({ type: "flushPath", reason: "discard" });
      } else if (action === "RESTORE") {
        emitSemantic({ type: "restoreRange" });
        emitSemantic({ type: "flushPath", reason: "restore" });
      }

      setMode(action);
      if (action === "FX" || action === "EXPORT" || action === "SESSION") {
        setOpenModule(action);
      }
      setLastAction(actionMessage(action, fov, locked));
    }

    function handleWorkflowClick(event: Event) {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.workflowAction;

      if (action === "startCrop") {
        startCropWorkflow();
      } else if (action === "endCrop") {
        void endCropWorkflow();
      } else if (action === "renderCrop") {
        void renderCropWorkflow();
      }
    }

    function handlePopupClose() {
      setOpenModule(null);
      setLastAction("MODULE: raised popup layer closed.");
    }

    function handlePlayerClick(event: Event) {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.playerAction as PlayerAction | undefined;
      if (!action) {
        return;
      }

      if (action === "PLAY_TOGGLE") {
        void toggleVideoPlayback("PLAYER BUTTON");
      } else if (action === "PREV") {
        setVideoIndex((index) => (videoSources.length ? (index - 1 + videoSources.length) % videoSources.length : 0));
        setLastAction("PLAYER: previous video selected from HTMLMesh.");
      } else if (action === "NEXT") {
        setVideoIndex((index) => (videoSources.length ? (index + 1) % videoSources.length : 0));
        setLastAction("PLAYER: next video selected from HTMLMesh.");
      } else if (action === "RATE_0_5") {
        setVideoRate(0.5);
      } else if (action === "RATE_1") {
        setVideoRate(1);
      } else if (action === "RATE_2") {
        setVideoRate(2);
      } else if (action === "RECORD_TOGGLE") {
        if (cropWorkflowStatusRef.current === "recording") {
          void endCropWorkflow();
        } else {
          startCropWorkflow();
        }
      } else if (action === "RECORD_RATE_DOWN") {
        setRecordingRateValue(recordingRate - 0.25);
      } else if (action === "RECORD_RATE_UP") {
        setRecordingRateValue(recordingRate + 0.25);
      } else if (action === "RECORD_RATE_RESET") {
        setRecordingRateValue(1);
      } else if (action === "TOGGLE_UI") {
        setPlayerUiVisible((visible) => !visible);
        setLastAction("PLAYER: panel prominence toggled.");
      } else if (action === "SELECT_SOURCE") {
        const nextIndex = Number(target.dataset.sourceIndex);
        if (Number.isInteger(nextIndex)) {
          setVideoIndex(Math.max(0, Math.min(nextIndex, videoSources.length - 1)));
          setLastAction("PLAYER: source selected from HTMLMesh list.");
        }
      }
    }

    function handleInput(event: Event) {
      const target = event.currentTarget as HTMLInputElement;
      const next = Number(target.value);
      if (target.dataset.control === "mask-opacity") {
        setMaskOpacityValue(next);
        setLastAction(`MASK: panel opacity set to ${next.toFixed(2)}.`);
        return;
      }
      setFovValue(next, { type: "setFov", h: next });
      setLastAction(actionMessage("FOV", next, locked));
    }

    function handlePlayerInput(event: Event) {
      const target = event.currentTarget as HTMLInputElement;
      if (target.dataset.playerControl !== "seek") {
        return;
      }
      const percent = Number(target.value);
      const nextTimeMs = Math.round((Math.max(0, Math.min(percent, 100)) / 100) * durationMs);
      seekVideoTo(nextTimeMs);
    }

    function handlePlayerSelect(event: Event) {
      const target = event.currentTarget as HTMLSelectElement;
      if (target.dataset.playerControl !== "source-select") {
        return;
      }

      const nextIndex = videoSources.findIndex((sourceItem) => sourceItem.id === target.value);
      if (nextIndex >= 0) {
        setVideoIndex(nextIndex);
        setLastAction("PLAYER: source selected from backend playlist.");
      }
    }

    const buttons = Array.from(
      source.querySelectorAll<HTMLButtonElement>("button[data-action], button[data-module]")
    ).concat(Array.from(popup.querySelectorAll<HTMLButtonElement>("button[data-action], button[data-module]")));
    const popupCloseButtons = Array.from(popup.querySelectorAll<HTMLButtonElement>("button[data-popup-close]"));
    const playerButtons = Array.from(player.querySelectorAll<HTMLButtonElement>("button[data-player-action]"));
    const workflowButtons = Array.from(workflowState.querySelectorAll<HTMLButtonElement>("button[data-workflow-action]"));
    const playerSeek = player.querySelector<HTMLInputElement>('input[data-player-control="seek"]');
    const playerSourceSelect = player.querySelector<HTMLSelectElement>('select[data-player-control="source-select"]');
    const sliders = Array.from(source.querySelectorAll<HTMLInputElement>('input[data-control="fov"], input[data-control="mask-opacity"]'));
    buttons.forEach((button) => button.addEventListener("click", handleClick));
    popupCloseButtons.forEach((button) => button.addEventListener("click", handlePopupClose));
    playerButtons.forEach((button) => button.addEventListener("click", handlePlayerClick));
    workflowButtons.forEach((button) => button.addEventListener("click", handleWorkflowClick));
    playerSeek?.addEventListener("input", handlePlayerInput);
    playerSourceSelect?.addEventListener("change", handlePlayerSelect);
    sliders.forEach((slider) => slider.addEventListener("input", handleInput));

    return () => {
      buttons.forEach((button) => button.removeEventListener("click", handleClick));
      popupCloseButtons.forEach((button) => button.removeEventListener("click", handlePopupClose));
      playerButtons.forEach((button) => button.removeEventListener("click", handlePlayerClick));
      workflowButtons.forEach((button) => button.removeEventListener("click", handleWorkflowClick));
      playerSeek?.removeEventListener("input", handlePlayerInput);
      playerSourceSelect?.removeEventListener("change", handlePlayerSelect);
      sliders.forEach((slider) => slider.removeEventListener("input", handleInput));
    };
  }, [bgmChoice, cropWorkflowStatus, durationMs, fov, locked, openModule, recordingRate, videoSources]);

  const seekPercent = durationMs > 0 ? Math.min(100, Math.max(0, Math.round((currentTimeMs / durationMs) * 100))) : 0;
  const playbackButtonText = playbackStatus === "playing" ? "PAUSE" : "PLAY";
  const cropExportDownloadUrl = cropExportId ? apiUrl(`/api/exports/${cropExportId}/download`) : "#";

  return (
    <main className="three-official-lab-page">
      <section className="three-official-stage" data-testid="three-official-interactive-lab">
        <div ref={mountRef} className="three-official-mount" />
        <ThreeOfficialLabHud
          backendStatus={backendStatus}
          cropExportId={cropExportId}
          cropWorkflowStatus={cropWorkflowStatus}
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          followMode={followMode}
          fov={fov}
          lastAction={lastAction}
          lastSemantic={lastSemantic}
          leftGripModifier={leftGripModifier}
          maskOpacity={maskOpacity}
          playbackStatus={playbackStatus}
          quickMenuActive={quickMenuActive}
          quickMenuSelection={quickMenuSelection}
          recordingRate={recordingRate}
          recordingSamplesCount={recordingSamples.length}
          spatialMenusVisible={spatialMenusVisible}
          viewTarget={viewTarget}
        />
        <video ref={videoRef} className="three-official-video-source" data-testid="three-official-video-source" />
        <div ref={statusRef} className="three-official-mode-strip" data-testid="three-official-mode-strip">
          <ThreeOfficialModeStrip
            followMode={followMode}
            leftGripModifier={leftGripModifier}
            locked={locked}
            pendingEdit={pendingEdit}
            uiMode={uiMode}
          />
        </div>
        <div
          ref={playerRef}
          className="three-official-player-ui"
          data-testid="three-official-player-ui"
          data-visible={playerUiVisible ? "true" : "false"}
        >
          <ThreeOfficialPlayerPanel
            cropWorkflowStatus={cropWorkflowStatus}
            currentTimeMs={currentTimeMs}
            currentVideoSource={currentVideoSource}
            durationMs={durationMs}
            playbackButtonText={playbackButtonText}
            playbackRate={playbackRate}
            playbackStatus={playbackStatus}
            playerUiVisible={playerUiVisible}
            recordingRate={recordingRate}
            seekPercent={seekPercent}
            videoIndex={videoIndex}
            videoSources={videoSources}
          />
        </div>
        <ThreeOfficialArwesWorkbenchDesk
          backendAcceptedPoints={backendAcceptedPoints}
          backendStatus={backendStatus}
          cropExportDownloadUrl={cropExportDownloadUrl}
          cropWorkflowStatus={cropWorkflowStatus}
          deskRef={sourceRef}
          fov={fov}
          locked={locked}
          maskOpacity={maskOpacity}
          openModule={openModule}
          playbackStatus={playbackStatus}
          popupRef={popupRef}
          recordingSamples={recordingSamples}
          viewTarget={viewTarget}
          workflowStateRef={workflowStateRef}
        />
      </section>
      <ThreeOfficialInteractiveLabStyles />
    </main>
  );
}
