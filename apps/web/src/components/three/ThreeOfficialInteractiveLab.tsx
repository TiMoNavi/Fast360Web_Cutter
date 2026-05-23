"use client";

import { useEffect, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  DoubleSide,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
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
import {
  dispatchWebXrTimelineEvent,
  normalizePitch,
  normalizeYaw,
  type ViewInputSource,
  type ViewTargetPose,
  type WebXrSemanticEvent
} from "@/features/webxr/pc-editor/data/timeline-bridge";
import { createCropViewportMaskFragmentShader } from "@/features/webxr/pc-editor/webxr/AFrameCropViewportMask";
import type { AFrame360VideoSource } from "@/features/webxr/pc-editor/controls/types";
import { verticalFovFromHorizontal } from "@/features/webxr/pc-editor/viewFov";

type OfficialAction =
  | "CUT"
  | "DISCARD"
  | "FLUSH"
  | "LOCK"
  | "PLAY"
  | "RESTORE"
  | "SAVE"
  | "FX"
  | "EXPORT"
  | "SESSION"
  | "FOV";
type OfficialModule = "FRAME" | "FOV" | "FX" | "EXPORT" | "SESSION" | "SAMPLER";
type PlayerAction = "NEXT" | "PLAY_TOGGLE" | "PREV" | "RATE_0_5" | "RATE_1" | "RATE_2" | "SELECT_SOURCE" | "TOGGLE_UI";
type FollowMode = "controller_ray" | "head_gaze" | "idle";
type ControllerHand = "left" | "right";
type XrControllerObject = Group & {
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string, listener: (event: unknown) => void) => void;
};
type BrowserXr = {
  isSessionSupported?: (mode: "immersive-vr") => Promise<boolean>;
  requestSession?: (mode: "immersive-vr", options?: XRSessionInit) => Promise<XRSession>;
};
type SyntheticControllerSelectDetail = {
  hand?: ControllerHand;
  instant?: boolean;
  phase?: "end" | "start";
  rayDirection?: { x: number; y: number; z: number };
  rayOrigin?: { x: number; y: number; z: number };
};
type SyntheticThumbstickDetail = {
  hand?: ControllerHand;
  y?: number;
};

const DEG_TO_RAD = Math.PI / 180;
const HEAD_GAZE_HOLD_MS = 280;
const DUAL_SELECT_COMBO_MS = 160;
const FOV_FLUSH_DEBOUNCE_MS = 260;
const FOV_THUMBSTICK_DEADZONE = 0.18;
const FOV_THUMBSTICK_MAX_DEG_PER_SECOND = 34;
const MASK_OPACITY_DEFAULT = 0.74;
const MASK_OPACITY_MAX = 0.95;
const MASK_OPACITY_MIN = 0;
const MASK_OPACITY_THUMBSTICK_MAX_PER_SECOND = 0.72;
const SPHERE_CLICK_MAX_MOVE_PX = 8;
const SPHERE_SMOOTH_MOVE_MS = 180;
const DEFAULT_VIEW_TARGET: ViewTargetPose = {
  input: "head_gaze",
  pitch: 0,
  yaw: 0
};

const FALLBACK_VIDEO_SOURCES: AFrame360VideoSource[] = [
  {
    durationMs: 185000,
    id: "sample-mp4",
    kind: "mp4",
    resolution: "5760 x 2880",
    sourceUrl: "/api/sample-video",
    thumbnailUrl: "/assets/xr/geometric-360.svg",
    title: "Local 360 MP4 sample"
  }
];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeViewTargetPose(pose: ViewTargetPose): ViewTargetPose {
  return {
    input: pose.input,
    pitch: Number(normalizePitch(pose.pitch).toFixed(2)),
    yaw: Number(normalizeYaw(pose.yaw).toFixed(2))
  };
}

function readObjectForward(object: Object3D, direction: Vector3, quaternion: Quaternion) {
  object.getWorldQuaternion(quaternion);
  return direction.set(0, 0, -1).applyQuaternion(quaternion).normalize();
}

function directionToViewTarget(direction: Vector3, input: ViewInputSource): ViewTargetPose {
  const length = direction.length() || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return normalizeViewTargetPose({
    input,
    pitch: Math.asin(clampNumber(y, -1, 1)) * 180 / Math.PI,
    yaw: Math.atan2(x, -z) * 180 / Math.PI
  });
}

function viewTargetToDirection(pose: ViewTargetPose, target: Vector3) {
  const yaw = pose.yaw * DEG_TO_RAD;
  const pitch = pose.pitch * DEG_TO_RAD;
  const cp = Math.cos(pitch);

  return target.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp).normalize();
}

function shortestYawDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function easeOutCubic(value: number) {
  const clamped = clampNumber(value, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function interpolateViewTargetPose(start: ViewTargetPose, target: ViewTargetPose, progress: number): ViewTargetPose {
  const eased = easeOutCubic(progress);
  return normalizeViewTargetPose({
    input: target.input,
    pitch: start.pitch + (target.pitch - start.pitch) * eased,
    yaw: start.yaw + shortestYawDelta(start.yaw, target.yaw) * eased
  });
}

function makeControllerRay() {
  const geometry = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, 0, -1)]);
  const material = new LineBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.78
  });
  const line = new Line(geometry, material);
  line.name = "official-controller-ray";
  line.scale.z = 5;
  return line;
}

function styleXrButton(button: HTMLButtonElement) {
  button.style.position = "absolute";
  button.style.bottom = "20px";
  button.style.left = "calc(50% - 86px)";
  button.style.zIndex = "999";
  button.style.width = "172px";
  button.style.minHeight = "48px";
  button.style.border = "1px solid rgba(0, 255, 255, 0.78)";
  button.style.borderRadius = "4px";
  button.style.background = "rgba(7, 0, 17, 0.72)";
  button.style.boxShadow = "0 0 22px rgba(0, 255, 255, 0.24)";
  button.style.color = "#e0e0e0";
  button.style.cursor = "pointer";
  button.style.font = "900 13px ui-monospace, Consolas, monospace";
  button.style.letterSpacing = "0";
  button.style.opacity = "0.86";
  button.style.padding = "12px 8px";
}

function actionMessage(action: OfficialAction, fov: number, locked: boolean) {
  if (action === "CUT") {
    return "CUT: native DOM button event from HTMLMesh";
  }
  if (action === "LOCK") {
    return locked ? "LOCK: viewfinder locked" : "LOCK: viewfinder unlocked";
  }
  if (action === "SAVE") {
    return "SAVE: patch flush would be requested";
  }
  if (action === "FX") {
    return "FX: secondary menu would open";
  }
  if (action === "EXPORT") {
    return "EXPORT: queue preview export";
  }
  if (action === "SESSION") {
    return "SESSION: session panel selected";
  }
  return `FOV: ${fov}`;
}

function semanticSummary(event: WebXrSemanticEvent) {
  if (event.type === "setFov") {
    return `webxr:timeline-event ${event.type} h=${event.h}`;
  }
  if (event.type === "nudgeFov") {
    return `webxr:timeline-event ${event.type} deltaH=${event.deltaH}`;
  }
  if (event.type === "flushPath") {
    return `webxr:timeline-event ${event.type} reason=${event.reason ?? "live"}`;
  }
  if (event.type === "createEffectEvent") {
    return `webxr:timeline-event ${event.type} effectType=${event.effectType}`;
  }
  if (event.type === "setViewTarget") {
    return `webxr:timeline-event ${event.type} ${event.pose.input} yaw=${event.pose.yaw.toFixed(1)} pitch=${event.pose.pitch.toFixed(1)}`;
  }
  return `webxr:timeline-event ${event.type}`;
}

function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ThreeOfficialInteractiveLab() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [effectPage, setEffectPage] = useState(0);
  const [fov, setFov] = useState(82);
  const [lastAction, setLastAction] = useState("Ready: Three.js HTMLMesh + InteractiveGroup official interaction path.");
  const [lastSemantic, setLastSemantic] = useState("none");
  const [leftGripModifier, setLeftGripModifier] = useState(false);
  const [locked, setLocked] = useState(false);
  const [maskOpacity, setMaskOpacity] = useState(MASK_OPACITY_DEFAULT);
  const [mode, setMode] = useState("FX");
  const [openModule, setOpenModule] = useState<OfficialModule | null>("FX");
  const [followMode, setFollowMode] = useState<FollowMode>("idle");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playerUiVisible, setPlayerUiVisible] = useState(true);
  const [playbackStatus, setPlaybackStatus] = useState<"blocked" | "loading" | "ready" | "playing" | "paused" | "error">("loading");
  const [viewTarget, setViewTarget] = useState<ViewTargetPose>(DEFAULT_VIEW_TARGET);
  const [videoIndex, setVideoIndex] = useState(0);
  const [videoSources, setVideoSources] = useState<AFrame360VideoSource[]>(FALLBACK_VIDEO_SOURCES);
  const followModeRef = useRef<FollowMode>("idle");
  const fovRef = useRef(fov);
  const leftGripModifierRef = useRef(leftGripModifier);
  const lockedRef = useRef(locked);
  const maskOpacityRef = useRef(maskOpacity);
  const viewTargetRef = useRef<ViewTargetPose>(DEFAULT_VIEW_TARGET);

  const currentVideoSource = videoSources[videoIndex] ?? videoSources[0] ?? FALLBACK_VIDEO_SOURCES[0];

  function emitSemantic(event: WebXrSemanticEvent) {
    dispatchWebXrTimelineEvent(event);
    setLastSemantic(semanticSummary(event));
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
    emitSemantic({ type: "setViewTarget", pose: next });
    emitSemantic({ type: "lockViewport" });
    emitSemantic({ type: "flushPath", reason: "lock" });
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
    viewTargetRef.current = viewTarget;
  }, [viewTarget]);

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

  useEffect(() => {
    const mount = mountRef.current;
    const playerSource = playerRef.current;
    const popupSource = popupRef.current;
    const source = sourceRef.current;
    const video = videoRef.current;
    if (!mount || !playerSource || !popupSource || !source || !video) {
      return;
    }

    let disposed = false;
    let htmlMesh: HTMLMesh | null = null;
    let playerMesh: HTMLMesh | null = null;
    let popupMesh: HTMLMesh | null = null;
    let cropMaskGeometry: SphereGeometry | null = null;
    let cropMaskMaterial: ShaderMaterial | null = null;
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
        const usedLegacyLayerFallback = await setRendererSessionWithLabFallback(renderer, session);

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
    const videoSphere = new Mesh(
      new SphereGeometry(18, 64, 32),
      new MeshBasicMaterial({
        map: videoTexture,
        side: BackSide,
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
    cropMaskGeometry = new SphereGeometry(17.5, 96, 48);
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

    const underGlow = new Mesh(
      new PlaneGeometry(1.14, 0.4),
      new MeshBasicMaterial({
        color: 0xff00ff,
        opacity: 0.12,
        transparent: true,
        depthWrite: false
      })
    );
    underGlow.position.set(0, 0.86, -1.43);
    underGlow.rotation.x = -0.66;
    scene.add(underGlow);

    const cyanRim = new Mesh(
      new PlaneGeometry(1.06, 0.33),
      new MeshBasicMaterial({
        color: 0x00ffff,
        opacity: 0.08,
        transparent: true,
        depthWrite: false
      })
    );
    cyanRim.position.set(0, 0.895, -1.405);
    cyanRim.rotation.x = -0.66;
    scene.add(cyanRim);

    const playerGlow = new Mesh(
      new PlaneGeometry(0.38, 0.72),
      new MeshBasicMaterial({
        color: 0x00ffff,
        opacity: 0.1,
        transparent: true,
        depthWrite: false
      })
    );
    playerGlow.position.set(-0.76, 1.15, -1.32);
    playerGlow.rotation.y = 0.26;
    scene.add(playerGlow);

    const group = new InteractiveGroup();
    group.listenToPointerEvents(renderer, camera);
    scene.add(group);

    playerMesh = new HTMLMesh(playerSource);
    playerMesh.name = "official-htmlmesh-player";
    playerMesh.position.set(-0.76, 1.15, -1.3);
    playerMesh.rotation.y = 0.26;
    playerMesh.renderOrder = 3;
    group.add(playerMesh);

    htmlMesh = new HTMLMesh(source);
    htmlMesh.name = "official-htmlmesh-workbench";
    htmlMesh.position.set(0, 0.91, -1.4);
    htmlMesh.rotation.x = -0.66;
    htmlMesh.renderOrder = 2;
    group.add(htmlMesh);

    popupMesh = new HTMLMesh(popupSource);
    popupMesh.name = "official-htmlmesh-extension";
    popupMesh.position.set(0, 1.16, -1.66);
    popupMesh.rotation.x = -0.9;
    popupMesh.renderOrder = 4;
    group.add(popupMesh);

    const controllerModelFactory = new XRControllerModelFactory();
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);
    controller1.add(makeControllerRay());
    controller2.add(makeControllerRay());
    scene.add(controller1);
    scene.add(controller2);
    group.listenToXRControllerEvents(controller1);
    group.listenToXRControllerEvents(controller2);

    const grip1 = renderer.xr.getControllerGrip(0);
    const grip2 = renderer.xr.getControllerGrip(1);
    grip1.add(controllerModelFactory.createControllerModel(grip1));
    grip2.add(controllerModelFactory.createControllerModel(grip2));
    scene.add(grip1);
    scene.add(grip2);

    const direction = new Vector3();
    const hitDirection = new Vector3();
    const markerDirection = new Vector3();
    const markerPosition = new Vector3();
    const cameraPosition = new Vector3();
    const quaternion = new Quaternion();
    const pointerNdc = new Vector2();
    const raycaster = new Raycaster();
    const rayDirection = new Vector3();
    const rayOrigin = new Vector3();
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
    const selectComboState: Record<
      ControllerHand,
      { comboConsumed: boolean; down: boolean; instant: boolean; rayDirection: Vector3 | null; rayOrigin: Vector3 | null; startedAt: number }
    > = {
      left: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0 },
      right: { comboConsumed: false, down: false, instant: false, rayDirection: null, rayOrigin: null, startedAt: 0 }
    };
    let pointerClickStart: { x: number; y: number } | null = null;
    let smoothViewTargetMove: {
      durationMs: number;
      sourceLabel: string;
      start: ViewTargetPose;
      startedAt: number;
      target: ViewTargetPose;
    } | null = null;
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

    function beginSmoothViewTargetMove(target: ViewTargetPose, sourceLabel: string) {
      smoothViewTargetMove = {
        durationMs: SPHERE_SMOOTH_MOVE_MS,
        sourceLabel,
        start: viewTargetRef.current,
        startedAt: performance.now(),
        target
      };
      followControllerRef.current = null;
      followControllerHandRef.current = null;
      setFollowModeValue("idle");
      setLockedValue(false);
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
      emitSemantic({ type: "unlockViewport" });
      setLastAction("TRIGGER HOLD: viewfinder follows headset gaze.");
    }

    function queueHeadGazeFollow() {
      pendingHeadGazeStartedAt = performance.now();
      setLastAction("TRIGGER: hold to steer viewfinder, tap remains available for spatial buttons.");
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
      setControllerRayOverride(hand, detail);

      if (other.down && now - other.startedAt <= DUAL_SELECT_COMBO_MS) {
        current.comboConsumed = true;
        other.comboConsumed = true;
        pendingHeadGazeStartedAt = null;
        setFollowModeValue("idle");
        void toggleVideoPlayback("DUAL SELECT");
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
      setLastAction("LEFT GRIP HOLD: right stick controls mask opacity.");
    }

    function endOpacityModifier() {
      setLeftGripModifierValue(false);
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
      emitSemantic({ type: "controllerAimStart", hand });
      setLastAction(`GRIP HOLD: ${hand} controller ray is steering the viewfinder.`);
    }

    function commitControllerFollow(controller: Object3D, hand: ControllerHand, detail?: SyntheticControllerSelectDetail) {
      setControllerRayOverride(hand, detail);
      const pose = poseFromControllerRay(hand, controller);
      if (pose) {
        commitViewTarget(pose, `GRIP RELEASE ${hand.toUpperCase()}`);
      } else {
        setFollowModeValue("idle");
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

    function tickThumbstickControls(now: number) {
      const dtSeconds = Math.min(0.05, Math.max(0, (now - thumbstickFovState.lastFrameAt) / 1000));
      thumbstickFovState.lastFrameAt = now;

      const yAxis = readRightThumbstickYAxis();
      const magnitude = Math.abs(yAxis);
      if (magnitude > FOV_THUMBSTICK_DEADZONE) {
        const normalized = (magnitude - FOV_THUMBSTICK_DEADZONE) / (1 - FOV_THUMBSTICK_DEADZONE);
        if (leftGripModifierRef.current) {
          const deltaOpacity = Math.sign(yAxis) * normalized * MASK_OPACITY_THUMBSTICK_MAX_PER_SECOND * dtSeconds;
          if (Math.abs(deltaOpacity) >= 0.001) {
            const nextOpacity = setMaskOpacityValue(maskOpacityRef.current + deltaOpacity);
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
          thumbstickFovState.active = true;
          thumbstickFovState.lastInputAt = now;
          thumbstickFovState.pendingFlush = true;
          setLastAction(`RIGHT STICK HOLD: FOV ${deltaH < 0 ? "in" : "out"} to ${nextFov.toFixed(1)}.`);
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
        setLastAction(`RIGHT STICK RELEASE: FOV committed at ${fovRef.current.toFixed(1)}.`);
      }
    }

    window.addEventListener("three-official-controller-select", handleSyntheticControllerSelect as EventListener);
    window.addEventListener("three-official-controller-aim", handleSyntheticControllerAim as EventListener);
    window.addEventListener("three-official-controller-squeeze", handleSyntheticControllerSqueeze as EventListener);
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
      if (popupMesh) {
        popupMesh.visible = popupSource.dataset.open === "true";
      }

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
      targetReticle.position.copy(cameraPosition).add(markerPosition.copy(markerDirection).multiplyScalar(2.05));
      targetReticle.lookAt(cameraPosition);
      targetReticle.scale.setScalar(followModeRef.current === "idle" ? 1 : 1.22);
      reticleMaterial?.color.set(lockedRef.current ? 0x00ffff : followModeRef.current === "controller_ray" ? 0xff9900 : 0xff00ff);
      if (reticleMaterial) {
        reticleMaterial.opacity = followModeRef.current === "idle" ? 0.86 : 1;
      }

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("three-official-controller-select", handleSyntheticControllerSelect as EventListener);
      window.removeEventListener("three-official-controller-aim", handleSyntheticControllerAim as EventListener);
      window.removeEventListener("three-official-controller-squeeze", handleSyntheticControllerSqueeze as EventListener);
      window.removeEventListener("three-official-thumbstick", handleSyntheticThumbstick as EventListener);
      renderer.domElement.removeEventListener("pointerdown", handleCanvasPointerDown);
      renderer.domElement.removeEventListener("pointerup", handleCanvasPointerUp);
      renderer.setAnimationLoop(null);
      controllerListeners.forEach((remove) => remove());
      group.disconnect();
      htmlMesh?.dispose?.();
      playerMesh?.dispose?.();
      popupMesh?.dispose?.();
      cropMaskGeometry?.dispose();
      cropMaskMaterial?.dispose();
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
  }, []);

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

    setLastAction(`PLAYER: loaded ${source.title}.`);

    return () => {
      disposed = true;
      hls?.destroy();
    };
  }, [currentVideoSource]);

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
      setCurrentTimeMs(Math.max(0, Math.round(currentVideo.currentTime * 1000)));
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
    const source = sourceRef.current;
    const popup = popupRef.current;
    if (!player || !source || !popup) {
      return;
    }

    function handleClick(event: Event) {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.action as OfficialAction | undefined;
      const module = target.dataset.module as OfficialModule | undefined;

      if (module) {
        setMode(module);
        setOpenModule((current) => (current === module ? module : module));
        setLastAction(`${module}: extension HTMLMesh opened from native DOM click.`);
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

      if (action === "CUT") {
        emitSemantic({ type: "cutHere" });
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

    function handlePopupClick(event: Event) {
      const target = event.currentTarget as HTMLButtonElement;
      const action = target.dataset.popupAction;

      if (action === "close") {
        setOpenModule(null);
        setLastAction("CLOSE: extension HTMLMesh hidden.");
      } else if (action === "prev") {
        setEffectPage(0);
        setLastAction("FX page 1 selected in 45 degree HTMLMesh.");
      } else if (action === "next") {
        setEffectPage(1);
        setLastAction("FX page 2 selected in 45 degree HTMLMesh.");
      } else if (action === "fovMinus") {
        setFovValue(fovRef.current - 4, { type: "nudgeFov", deltaH: -4 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("FOV- from extension HTMLMesh.");
      } else if (action === "fovPlus") {
        setFovValue(fovRef.current + 4, { type: "nudgeFov", deltaH: 4 });
        emitSemantic({ type: "flushPath", reason: "fov" });
        setLastAction("FOV+ from extension HTMLMesh.");
      } else if (action) {
        emitSemantic({
          type: "createEffectEvent",
          displayName: action.toUpperCase(),
          durationMs: 800,
          effectType: action === "fade" ? "transition.fade_black" : "highlight",
          params: {
            source: "three-official-interactive-lab"
          }
        });
        setLastAction(`${action.toUpperCase()}: popup option committed from HTMLMesh.`);
      }
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
        setLastAction("PLAYER: previous video selected from vertical HTMLMesh.");
      } else if (action === "NEXT") {
        setVideoIndex((index) => (videoSources.length ? (index + 1) % videoSources.length : 0));
        setLastAction("PLAYER: next video selected from vertical HTMLMesh.");
      } else if (action === "RATE_0_5") {
        setVideoRate(0.5);
      } else if (action === "RATE_1") {
        setVideoRate(1);
      } else if (action === "RATE_2") {
        setVideoRate(2);
      } else if (action === "TOGGLE_UI") {
        setPlayerUiVisible((visible) => !visible);
        setLastAction("PLAYER: vertical panel prominence toggled.");
      } else if (action === "SELECT_SOURCE") {
        const nextIndex = Number(target.dataset.sourceIndex);
        if (Number.isInteger(nextIndex)) {
          setVideoIndex(Math.max(0, Math.min(nextIndex, videoSources.length - 1)));
          setLastAction("PLAYER: source selected from vertical HTMLMesh list.");
        }
      }
    }

    function handleInput(event: Event) {
      const target = event.currentTarget as HTMLInputElement;
      const next = Number(target.value);
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

    const buttons = Array.from(source.querySelectorAll<HTMLButtonElement>("button[data-action], button[data-module]"));
    const playerButtons = Array.from(player.querySelectorAll<HTMLButtonElement>("button[data-player-action]"));
    const popupButtons = Array.from(popup.querySelectorAll<HTMLButtonElement>("button[data-popup-action]"));
    const playerSeek = player.querySelector<HTMLInputElement>('input[data-player-control="seek"]');
    const slider = source.querySelector<HTMLInputElement>('input[data-control="fov"]');
    buttons.forEach((button) => button.addEventListener("click", handleClick));
    playerButtons.forEach((button) => button.addEventListener("click", handlePlayerClick));
    popupButtons.forEach((button) => button.addEventListener("click", handlePopupClick));
    playerSeek?.addEventListener("input", handlePlayerInput);
    slider?.addEventListener("input", handleInput);

    return () => {
      buttons.forEach((button) => button.removeEventListener("click", handleClick));
      playerButtons.forEach((button) => button.removeEventListener("click", handlePlayerClick));
      popupButtons.forEach((button) => button.removeEventListener("click", handlePopupClick));
      playerSeek?.removeEventListener("input", handlePlayerInput);
      slider?.removeEventListener("input", handleInput);
    };
  }, [durationMs, fov, locked, videoSources.length]);

  const seekPercent = durationMs > 0 ? Math.min(100, Math.max(0, Math.round((currentTimeMs / durationMs) * 100))) : 0;
  const playbackButtonText = playbackStatus === "playing" ? "PAUSE" : "PLAY";

  return (
    <main className="three-official-lab-page">
      <section className="three-official-stage" data-testid="three-official-interactive-lab">
        <div ref={mountRef} className="three-official-mount" />
        <div className="three-official-hud">
          <p>Three.js official pattern</p>
          <h1>HTMLMesh + InteractiveGroup + Crop Mask</h1>
          <span data-testid="three-official-last-action">{lastAction}</span>
          <span data-testid="three-official-last-semantic">{lastSemantic}</span>
          <span data-testid="three-official-playback-status">
            sphere player: {playbackStatus} / {formatClock(currentTimeMs)} / {formatClock(durationMs)}
          </span>
          <span data-testid="three-official-view-target">
            viewfinder: {followMode} / {viewTarget.input} / yaw {viewTarget.yaw.toFixed(1)} / pitch {viewTarget.pitch.toFixed(1)} / FOV {fov}
          </span>
          <span data-testid="three-official-mask-opacity">
            mask opacity: {maskOpacity.toFixed(2)} / left grip modifier {leftGripModifier ? "on" : "off"}
          </span>
        </div>
        <video ref={videoRef} className="three-official-video-source" data-testid="three-official-video-source" />
        <div
          ref={playerRef}
          className="three-official-player-ui"
          data-testid="three-official-player-ui"
          data-visible={playerUiVisible ? "true" : "false"}
        >
          <div className="three-official-player-chrome">
            <span className="three-official-player-dot magenta" />
            <span className="three-official-player-dot cyan" />
            <span className="three-official-player-dot orange" />
            <strong>PLAYBACK CORE</strong>
            <span data-testid="three-official-player-status-strip">{playbackStatus.toUpperCase()}</span>
          </div>
          <section className="three-official-player-progress">
            <span>{formatClock(currentTimeMs)}</span>
            <input
              aria-label="Playback progress"
              data-player-control="seek"
              data-testid="three-official-player-progress"
              max="100"
              min="0"
              readOnly
              type="range"
              value={seekPercent}
            />
            <span>{formatClock(durationMs)}</span>
          </section>
          <section className="three-official-player-transport">
            <button data-player-action="PREV" type="button">
              <span>PREV</span>
            </button>
            <button className="primary" data-player-action="PLAY_TOGGLE" type="button">
              <strong>{playbackButtonText}</strong>
              <span>both select</span>
            </button>
            <button data-player-action="NEXT" type="button">
              <span>NEXT</span>
            </button>
          </section>
          <section className="three-official-player-now">
            <p>&gt; SOURCE</p>
            <h2>{currentVideoSource.title}</h2>
            <span>
              {currentVideoSource.resolution ?? "360 VIDEO"} / {currentVideoSource.kind.toUpperCase()} / play {playbackRate}x
            </span>
          </section>
          <section className="three-official-player-rates">
            <button className={playbackRate === 0.5 ? "active" : ""} data-player-action="RATE_0_5" type="button">
              Play 0.5x
            </button>
            <button className={playbackRate === 1 ? "active" : ""} data-player-action="RATE_1" type="button">
              Play 1x
            </button>
            <button className={playbackRate === 2 ? "active" : ""} data-player-action="RATE_2" type="button">
              Play 2x
            </button>
          </section>
          <section className="three-official-player-list">
            <p>&gt; PLAYLIST</p>
            {videoSources.slice(0, 3).map((source, index) => (
              <button
                className={index === videoIndex ? "active" : ""}
                data-player-action="SELECT_SOURCE"
                data-source-index={index}
                key={source.id}
                type="button"
              >
                <strong>{index + 1}. {source.title}</strong>
                <span>
                  {formatClock(source.durationMs ?? 0)} / {source.resolution ?? "360"}
                </span>
              </button>
            ))}
          </section>
          <button className="three-official-player-hide" data-player-action="TOGGLE_UI" type="button">
            {playerUiVisible ? "DIM PLAYER UI" : "RESTORE PLAYER UI"}
          </button>
        </div>
        <div ref={sourceRef} className="three-official-source-ui" data-testid="three-official-source-ui">
          <div className="three-official-panel-chrome">
            <span />
            <span />
            <span />
            <strong>QUEST EDIT DESK // HTMLMESH</strong>
          </div>
          <div className="three-official-panel-body">
            <section className="three-official-direct">
              <p>&gt; DIRECT KEYS</p>
              <button className="three-official-orb" data-action="CUT" type="button">
                <span className="three-official-orb-ring" />
                <strong>CUT</strong>
              </button>
            </section>
            <section className="three-official-direct-grid">
              <button data-action="LOCK" type="button">
                {locked ? "UNLOCK" : "LOCK"}
              </button>
              <button data-action="SAVE" type="button">
                SAVE
              </button>
              <button data-action="PLAY" type="button">
                PLAY
              </button>
              <button data-action="FLUSH" type="button">
                FLUSH
              </button>
              <button data-action="DISCARD" type="button">
                DISCARD
              </button>
              <button data-action="RESTORE" type="button">
                RESTORE
              </button>
            </section>
            <section className="three-official-modules">
              <p>&gt; MODULE STRIP</p>
              <div className="three-official-module-grid">
                {(["FRAME", "FOV", "FX", "EXPORT", "SESSION", "SAMPLER"] as const).map((module) => (
                  <button className={openModule === module ? "active" : ""} data-module={module} key={module} type="button">
                    {module}
                  </button>
                ))}
              </div>
              <label className="three-official-slider">
                <span>FOV {fov}</span>
                <input data-control="fov" max="112" min="48" type="range" value={fov} readOnly />
              </label>
              <div className="three-official-readout">
                <span>MODE</span>
                <strong>{mode}</strong>
                <span>VIDEO</span>
                <strong>{playbackStatus}</strong>
                <span>LOCK</span>
                <strong>{locked ? "ON" : "OFF"}</strong>
                <span>MASK</span>
                <strong>{maskOpacity.toFixed(2)}</strong>
                <span>POSE</span>
                <strong>
                  {viewTarget.yaw.toFixed(0)}/{viewTarget.pitch.toFixed(0)}
                </strong>
              </div>
            </section>
          </div>
        </div>
        <div
          ref={popupRef}
          className="three-official-popup-ui"
          data-open={openModule ? "true" : "false"}
          data-testid="three-official-popup-ui"
        >
          <div className="three-official-popup-title">
            <strong>{openModule ?? "MODULE"} MORE</strong>
            <span>45 DEGREE HTMLMESH EXTENSION</span>
          </div>
          <p>
            {openModule === "FX"
              ? effectPage === 0
                ? "PAGE 1: BLACK / FADE / GLOW / NOTE"
                : "PAGE 2: LUT / MARK / CAPTION / QUEUE"
              : openModule === "FOV"
                ? `CURRENT FOV ${fov}. CHANGE WITHOUT LEAVING VIEW.`
                : `${openModule ?? "MODULE"} OPTIONS LIVE ON A SEPARATE INTERACTIVE PLANE.`}
          </p>
          <div className="three-official-popup-grid">
            {openModule === "FOV" ? (
              <>
                <button data-popup-action="fovMinus" type="button">
                  FOV-
                </button>
                <button data-popup-action="fovPlus" type="button">
                  FOV+
                </button>
              </>
            ) : (
              <>
                <button data-popup-action="prev" type="button">
                  PREV
                </button>
                <button data-popup-action="next" type="button">
                  NEXT
                </button>
                <button data-popup-action={effectPage === 0 ? "fade" : "mark"} type="button">
                  {effectPage === 0 ? "FADE" : "MARK"}
                </button>
              </>
            )}
            <button data-popup-action="close" type="button">
              CLOSE
            </button>
          </div>
        </div>
      </section>
      <style jsx>{`
        .three-official-lab-page {
          min-height: 100vh;
          overflow: hidden;
          background: #070011;
          color: #e0e0e0;
          font-family: "Share Tech Mono", ui-monospace, Consolas, monospace;
        }

        .three-official-stage,
        .three-official-mount {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
        }

        .three-official-mount :global(canvas) {
          display: block;
          width: 100%;
          height: 100%;
        }

        .three-official-video-source {
          position: fixed;
          left: -12000px;
          top: -12000px;
          width: 1px;
          height: 1px;
          opacity: 0.01;
          pointer-events: none;
        }

        .three-official-player-ui {
          position: fixed;
          left: -12000px;
          top: 24px;
          width: 330px;
          height: 640px;
          overflow: hidden;
          border: 2px solid #00ffff;
          background:
            linear-gradient(132deg, rgba(255, 255, 255, 0.1), transparent 18%, rgba(255, 0, 255, 0.08)),
            linear-gradient(145deg, rgba(26, 16, 60, 0.96), rgba(9, 0, 20, 0.98) 58%, rgba(10, 34, 72, 0.94));
          box-shadow:
            0 0 28px rgba(0, 255, 255, 0.34),
            0 0 54px rgba(255, 0, 255, 0.18),
            inset 0 0 26px rgba(0, 255, 255, 0.13);
          color: #e0e0e0;
          clip-path: polygon(18px 0, calc(100% - 24px) 0, 100% 18px, 100% calc(100% - 34px), calc(100% - 20px) 100%, 12px 100%, 0 calc(100% - 18px), 0 22px);
          padding: 18px;
        }

        .three-official-player-ui[data-visible="false"] {
          opacity: 0.46;
        }

        .three-official-player-chrome {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: -18px -18px 14px;
          min-height: 42px;
          padding: 0 16px;
          border-bottom: 1px solid rgba(0, 255, 255, 0.45);
          background: linear-gradient(90deg, rgba(0, 255, 255, 0.16), rgba(255, 0, 255, 0.08));
        }

        .three-official-player-chrome strong {
          margin-right: auto;
          color: #00ffff;
          font: 900 17px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 12px rgba(0, 255, 255, 0.78);
        }

        .three-official-player-chrome span {
          color: #ff9900;
          font-size: 12px;
          text-shadow: 0 0 10px rgba(255, 153, 0, 0.55);
        }

        .three-official-player-dot {
          width: 9px;
          height: 9px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 10px currentColor;
        }

        .three-official-player-dot.magenta {
          color: #ff00ff;
        }

        .three-official-player-dot.cyan {
          color: #00ffff;
        }

        .three-official-player-dot.orange {
          color: #ff9900;
        }

        .three-official-player-now,
        .three-official-player-progress,
        .three-official-player-list {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
          padding: 12px;
          border: 1px solid rgba(255, 0, 255, 0.32);
          background: linear-gradient(135deg, rgba(7, 0, 17, 0.56), rgba(0, 255, 255, 0.08));
          box-shadow:
            0 0 18px rgba(0, 255, 255, 0.13),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          clip-path: polygon(12px 0, calc(100% - 10px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 14px) 100%, 0 100%, 0 14px);
        }

        .three-official-player-now p,
        .three-official-player-list p {
          margin: 0;
          color: #00ffff;
          font-size: 13px;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.7);
        }

        .three-official-player-now h2 {
          margin: 0;
          overflow: hidden;
          color: #fff;
          font: 900 19px Orbitron, system-ui, sans-serif;
          line-height: 1.16;
          text-overflow: ellipsis;
          text-shadow: 0 0 14px rgba(255, 0, 255, 0.45);
          white-space: nowrap;
        }

        .three-official-player-now span,
        .three-official-player-progress span,
        .three-official-player-list button span {
          color: #9fefff;
          font-size: 12px;
        }

        .three-official-player-progress {
          grid-template-columns: 42px 1fr 42px;
          align-items: center;
          margin-bottom: 12px;
          padding: 10px;
        }

        .three-official-player-progress input {
          width: 100%;
          accent-color: #ff00ff;
        }

        .three-official-player-transport,
        .three-official-player-rates {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 14px;
        }

        .three-official-player-transport button,
        .three-official-player-rates button,
        .three-official-player-list button,
        .three-official-player-hide {
          min-height: 40px;
          border: 2px solid rgba(0, 255, 255, 0.68);
          background: linear-gradient(135deg, rgba(7, 0, 17, 0.78), rgba(26, 16, 60, 0.8), rgba(0, 255, 255, 0.1));
          color: #e0e0e0;
          cursor: pointer;
          font: 900 13px "Share Tech Mono", monospace;
          text-shadow: 0 0 8px rgba(0, 255, 255, 0.52);
          box-shadow:
            0 0 16px rgba(0, 255, 255, 0.18),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-player-transport button {
          display: grid;
          place-items: center;
        }

        .three-official-player-transport button.primary {
          gap: 2px;
        }

        .three-official-player-transport button.primary strong {
          font-size: 15px;
        }

        .three-official-player-transport button.primary span {
          color: #ffcf83;
          font-size: 10px;
          text-transform: uppercase;
        }

        .three-official-player-transport button.primary,
        .three-official-player-rates button.active,
        .three-official-player-list button.active {
          border-color: #ff9900;
          color: #fff;
          background: linear-gradient(135deg, rgba(255, 153, 0, 0.36), rgba(255, 0, 255, 0.18), rgba(0, 255, 255, 0.12));
          box-shadow:
            0 0 20px rgba(255, 153, 0, 0.34),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .three-official-player-list {
          max-height: 180px;
          overflow: hidden;
        }

        .three-official-player-list button {
          display: grid;
          gap: 2px;
          min-height: 46px;
          overflow: hidden;
          text-align: left;
        }

        .three-official-player-list button strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .three-official-player-hide {
          width: 100%;
          border-color: rgba(255, 0, 255, 0.68);
          background: linear-gradient(135deg, rgba(255, 0, 255, 0.2), rgba(7, 0, 17, 0.72), rgba(0, 255, 255, 0.12));
        }

        .three-official-player-transport button:hover,
        .three-official-player-rates button:hover,
        .three-official-player-list button:hover,
        .three-official-player-hide:hover {
          filter: brightness(1.24);
        }

        .three-official-hud {
          position: absolute;
          left: 18px;
          top: 18px;
          z-index: 4;
          display: grid;
          gap: 8px;
          width: min(560px, calc(100vw - 36px));
          padding: 14px;
          border: 1px solid rgba(0, 255, 255, 0.55);
          border-top: 2px solid #00ffff;
          background: rgba(14, 4, 34, 0.78);
          box-shadow: 0 0 32px rgba(0, 255, 255, 0.16);
        }

        .three-official-hud p,
        .three-official-hud h1 {
          margin: 0;
        }

        .three-official-hud h1 {
          color: #fff;
          font-family: "Orbitron", system-ui, sans-serif;
          font-size: 22px;
        }

        .three-official-hud p,
        .three-official-hud span {
          color: #9fefff;
          font-size: 12px;
        }

        .three-official-source-ui {
          position: fixed;
          left: -12000px;
          top: 24px;
          width: 1000px;
          height: 300px;
          overflow: hidden;
          border: 2px solid #00ffff;
          background:
            linear-gradient(125deg, rgba(255, 255, 255, 0.1), transparent 18%, rgba(255, 0, 255, 0.1)),
            linear-gradient(115deg, rgba(26, 16, 60, 0.96), rgba(7, 0, 17, 0.96) 52%, rgba(33, 16, 76, 0.96));
          box-shadow:
            0 0 22px rgba(0, 255, 255, 0.55),
            inset 0 0 34px rgba(255, 0, 255, 0.14);
          color: #e0e0e0;
          clip-path: polygon(18px 0, calc(100% - 30px) 0, 100% 18px, 100% calc(100% - 34px), calc(100% - 18px) 100%, 12px 100%, 0 calc(100% - 18px), 0 18px);
        }

        .three-official-panel-chrome {
          display: flex;
          gap: 10px;
          align-items: center;
          height: 38px;
          padding: 0 22px;
          border-bottom: 1px solid rgba(0, 255, 255, 0.4);
          background: rgba(0, 255, 255, 0.08);
        }

        .three-official-panel-chrome span {
          width: 11px;
          height: 11px;
          border-radius: 999px;
          background: #ff00ff;
          box-shadow: 0 0 12px currentColor;
        }

        .three-official-panel-chrome span:nth-child(2) {
          background: #00ffff;
        }

        .three-official-panel-chrome span:nth-child(3) {
          background: #ff9900;
        }

        .three-official-panel-chrome strong {
          margin-left: auto;
          color: #00ffff;
          font-size: 18px;
        }

        .three-official-panel-body {
          display: grid;
          grid-template-columns: 190px 280px 1fr;
          gap: 16px;
          align-items: center;
          height: 262px;
          padding: 12px 28px 16px;
        }

        .three-official-direct,
        .three-official-direct-grid,
        .three-official-modules {
          min-width: 0;
        }

        .three-official-direct p,
        .three-official-modules p {
          margin: 0 0 9px;
          color: #00ffff;
          font-size: 15px;
          font-weight: 900;
          text-shadow: 0 0 10px rgba(0, 255, 255, 0.72);
        }

        .three-official-orb {
          position: relative;
          display: grid;
          width: 150px;
          height: 142px;
          place-items: center;
          overflow: hidden;
          border: 3px solid #ff9900;
          border-radius: 999px;
          background:
            radial-gradient(circle, rgba(255, 255, 255, 0.12), transparent 46%),
            conic-gradient(from 40deg, #ff9900, #ff00ff, #00ffff, #ff9900);
          color: #fff;
          cursor: pointer;
          font: 900 34px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 14px #ff00ff;
          box-shadow:
            0 0 26px rgba(255, 0, 255, 0.52),
            inset 0 0 34px rgba(7, 0, 17, 0.9);
        }

        .three-official-orb-ring {
          position: absolute;
          inset: 18px;
          border: 10px solid transparent;
          border-left-color: rgba(0, 255, 255, 0.9);
          border-right-color: rgba(255, 0, 255, 0.82);
          border-radius: inherit;
          filter: drop-shadow(0 0 12px rgba(0, 255, 255, 0.72));
        }

        .three-official-orb strong {
          position: relative;
          z-index: 1;
        }

        .three-official-direct-grid,
        .three-official-module-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .three-official-module-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .three-official-direct-grid button,
        .three-official-module-grid button,
        .three-official-slider,
        .three-official-readout {
          border: 2px solid rgba(0, 255, 255, 0.7);
          background: rgba(7, 0, 17, 0.76);
          color: #e0e0e0;
          box-shadow:
            0 0 14px rgba(0, 255, 255, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }

        .three-official-direct-grid button,
        .three-official-module-grid button {
          min-height: 36px;
          cursor: pointer;
          font: 900 16px "Share Tech Mono", monospace;
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-module-grid button.active {
          border-color: #ff9900;
          color: #fff;
          background: linear-gradient(135deg, rgba(255, 153, 0, 0.32), rgba(255, 0, 255, 0.2), rgba(0, 255, 255, 0.14));
          box-shadow:
            0 0 20px rgba(255, 153, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.18);
        }

        .three-official-direct-grid button:hover,
        .three-official-module-grid button:hover,
        .three-official-orb:hover {
          filter: brightness(1.25);
        }

        .three-official-modules {
          display: grid;
          gap: 8px;
        }

        .three-official-slider,
        .three-official-readout {
          display: grid;
          gap: 5px;
          padding: 7px 10px;
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }

        .three-official-slider span,
        .three-official-readout span {
          color: #00ffff;
          font-size: 14px;
        }

        .three-official-slider input {
          width: 100%;
          accent-color: #ff00ff;
        }

        .three-official-readout {
          grid-template-columns: auto 1fr auto 1fr auto 1fr;
          align-items: center;
          font-size: 12px;
        }

        .three-official-popup-ui {
          position: fixed;
          left: -12000px;
          top: 360px;
          width: 680px;
          height: 260px;
          overflow: hidden;
          border: 2px solid #00ffff;
          background:
            linear-gradient(125deg, rgba(255, 255, 255, 0.1), transparent 22%, rgba(255, 0, 255, 0.12)),
            linear-gradient(115deg, rgba(26, 16, 60, 0.96), rgba(7, 0, 17, 0.96) 52%, rgba(33, 16, 76, 0.96));
          color: #e0e0e0;
          box-shadow:
            0 0 22px rgba(255, 0, 255, 0.42),
            inset 0 0 28px rgba(0, 255, 255, 0.12);
          clip-path: polygon(18px 0, calc(100% - 28px) 0, 100% 18px, 100% calc(100% - 28px), calc(100% - 18px) 100%, 12px 100%, 0 calc(100% - 16px), 0 18px);
          padding: 24px;
        }

        .three-official-popup-title {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid rgba(0, 255, 255, 0.34);
          padding-bottom: 12px;
        }

        .three-official-popup-title strong {
          color: #ff9900;
          font: 900 30px Orbitron, system-ui, sans-serif;
          text-shadow: 0 0 14px rgba(255, 153, 0, 0.54);
        }

        .three-official-popup-title span,
        .three-official-popup-ui p {
          color: #9fefff;
          font-size: 14px;
        }

        .three-official-popup-ui p {
          min-height: 42px;
          margin: 18px 0;
        }

        .three-official-popup-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .three-official-popup-grid button {
          min-height: 50px;
          border: 2px solid rgba(255, 0, 255, 0.68);
          background: rgba(7, 0, 17, 0.72);
          color: #fff;
          cursor: pointer;
          font: 900 16px "Share Tech Mono", monospace;
          box-shadow: 0 0 16px rgba(255, 0, 255, 0.22);
          clip-path: polygon(10px 0, calc(100% - 8px) 0, 100% 9px, 100% calc(100% - 10px), calc(100% - 11px) 100%, 0 100%, 0 10px);
        }
      `}</style>
    </main>
  );
}
