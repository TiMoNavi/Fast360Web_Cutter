import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Line,
  LineBasicMaterial,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3
} from "three";
import {
  normalizePitch,
  normalizeYaw,
  type ViewInputSource,
  type ViewTargetPose,
  type WebXrSemanticEvent
} from "@/features/webxr/pc-editor/data/timeline-bridge";
import { DEG_TO_RAD } from "./constants";
import type { OfficialAction, QuickMenuItem } from "./types";

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeViewTargetPose(pose: ViewTargetPose): ViewTargetPose {
  return {
    input: pose.input,
    pitch: Number(normalizePitch(pose.pitch).toFixed(2)),
    yaw: Number(normalizeYaw(pose.yaw).toFixed(2))
  };
}

export function readObjectForward(object: Object3D, direction: Vector3, quaternion: Quaternion) {
  object.getWorldQuaternion(quaternion);
  return direction.set(0, 0, -1).applyQuaternion(quaternion).normalize();
}

export function directionToViewTarget(direction: Vector3, input: ViewInputSource): ViewTargetPose {
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

export function viewTargetToDirection(pose: ViewTargetPose, target: Vector3) {
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

export function interpolateViewTargetPose(start: ViewTargetPose, target: ViewTargetPose, progress: number): ViewTargetPose {
  const eased = easeOutCubic(progress);
  return normalizeViewTargetPose({
    input: target.input,
    pitch: start.pitch + (target.pitch - start.pitch) * eased,
    yaw: start.yaw + shortestYawDelta(start.yaw, target.yaw) * eased
  });
}

export function makeControllerRay() {
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

export function styleXrButton(button: HTMLButtonElement) {
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

export function actionMessage(action: OfficialAction, fov: number, locked: boolean) {
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

export function semanticSummary(event: WebXrSemanticEvent) {
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

export function createQuickMenuTileMaterial(item: QuickMenuItem, active: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = active ? "rgba(255, 153, 0, 0.9)" : "rgba(7, 0, 17, 0.84)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = active ? "rgba(255, 255, 255, 0.92)" : "rgba(0, 255, 255, 0.82)";
    context.lineWidth = active ? 8 : 5;
    context.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    context.fillStyle = active ? "#070011" : "#e0e0e0";
    context.font = "900 38px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.label, canvas.width / 2, 82);
    context.fillStyle = active ? "#3a1300" : "#9fefff";
    context.font = "900 24px Arial, sans-serif";
    context.fillText(item.subLabel.toUpperCase(), canvas.width / 2, 128);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({
    depthWrite: false,
    map: texture,
    opacity: active ? 0.96 : 0.84,
    side: DoubleSide,
    transparent: true
  });
}
