"use client";

import { createElement } from "react";
import { verticalFovFromHorizontal } from "../viewFov";
import { getPcEditorFrontendPlaybackRate } from "../state";

export const WEBXR_CROP_MASK_CHANGE_EVENT = "webxr:crop-mask-change";
export const WEBXR_CROP_MASK_CENTER_EVENT = "webxr:crop-mask-center";
export const WEBXR_CROP_MASK_FOV_EVENT = "webxr:crop-mask-fov";
export const WEBXR_CROP_MASK_LOCK_EVENT = "webxr:crop-mask-lock";
export const WEBXR_CROP_MASK_OPACITY_EVENT = "webxr:crop-mask-opacity";
export const CROP_MASK_ASPECT = "16:9";
export const DEFAULT_CROP_FOV_H = 82;
export const MIN_CROP_FOV_H = 35;
export const MAX_CROP_FOV_H = 110;
export const DEFAULT_CROP_MASK_OPACITY = 0.74;
const DEFAULT_MASK_LOCKED = true;

type Vector3Like = {
  x: number;
  y: number;
  z: number;
  copy: (value: unknown) => Vector3Like;
  normalize: () => Vector3Like;
  set?: (x: number, y: number, z: number) => Vector3Like;
};

type Object3DLike = {
  position: Vector3Like;
  getWorldDirection?: (target: Vector3Like) => Vector3Like;
  getWorldPosition?: (target: Vector3Like) => Vector3Like;
};

type MeshLike = {
  frustumCulled?: boolean;
  renderOrder?: number;
};

type ShaderMaterialLike = {
  uniforms?: Record<string, { value: unknown }>;
  dispose?: () => void;
};

type GeometryLike = {
  dispose?: () => void;
};

type AFrameRuntime = {
  components?: Record<string, unknown>;
  registerComponent: (name: string, definition: Record<string, unknown>) => void;
  THREE?: {
    BackSide: unknown;
    ShaderMaterial: new (parameters: Record<string, unknown>) => ShaderMaterialLike;
    SphereGeometry: new (radius: number, widthSegments: number, heightSegments: number) => GeometryLike;
    Mesh: new (geometry: GeometryLike, material: ShaderMaterialLike) => MeshLike;
    Vector2: new (x?: number, y?: number) => { set: (x: number, y: number) => void };
    Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
  };
};

type AFrameCropComponentThis = {
  data: {
    opacity: number;
    radius: number;
    sourceVideoId: string;
  };
  el: {
    object3D?: Object3DLike;
    sceneEl?: {
      camera?: Object3DLike;
    };
    emit?: (name: string, detail: CropMaskState, bubbles?: boolean) => void;
    removeObject3D?: (name: string) => void;
    setObject3D?: (name: string, object: MeshLike) => void;
  };
  center: { yaw: number; pitch: number };
  currentDirection?: Vector3Like;
  fovH: number;
  input: CropMaskState["input"];
  keydownHandler?: (event: KeyboardEvent) => void;
  lastSignature?: string;
  locked: boolean;
  material?: ShaderMaterialLike;
  mesh?: MeshLike;
  opacityAnimation?: {
    durationMs: number;
    from: number;
    startedAt: number;
    to: number;
  };
  opacityEventHandler?: (event: Event) => void;
  centerEventHandler?: (event: Event) => void;
  fovEventHandler?: (event: Event) => void;
  lockEventHandler?: (event: Event) => void;
  opacityValue: number;
  uniforms?: Record<string, { value: unknown }>;
};

export type CropMaskState = {
  aspect: typeof CROP_MASK_ASPECT;
  center: {
    yaw: number;
    pitch: number;
  };
  cut: false;
  enabled: true;
  fov: {
    h: number;
    v: number;
  };
  input: "head_gaze" | "keyboard";
  locked: boolean;
  maskOpacity: number;
  roll: 0;
  smoothFollow: boolean;
  source: "crop-mask-preview";
  version: 1;
  videoTimeMs: number;
};

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeYaw(yaw: number) {
  let nextYaw = yaw;
  while (nextYaw > 180) {
    nextYaw -= 360;
  }
  while (nextYaw < -180) {
    nextYaw += 360;
  }
  return Object.is(nextYaw, -0) ? 0 : Number(nextYaw.toFixed(3));
}

function normalizePitch(pitch: number) {
  return Number(clamp(pitch, -85, 85).toFixed(3));
}

export function defaultCropMaskState(): CropMaskState {
  return {
    aspect: CROP_MASK_ASPECT,
    center: {
      yaw: 0,
      pitch: 0
    },
    cut: false,
    enabled: true,
    fov: {
      h: DEFAULT_CROP_FOV_H,
      v: verticalFovFromHorizontal(DEFAULT_CROP_FOV_H)
    },
    input: "keyboard",
    locked: DEFAULT_MASK_LOCKED,
    maskOpacity: DEFAULT_CROP_MASK_OPACITY,
    roll: 0,
    smoothFollow: !DEFAULT_MASK_LOCKED,
    source: "crop-mask-preview",
    version: 1,
    videoTimeMs: 0
  };
}

function directionToPose(direction: Vector3Like) {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;

  return {
    yaw: normalizeYaw(Math.atan2(x, -z) * RAD_TO_DEG),
    pitch: normalizePitch(Math.asin(clamp(y, -1, 1)) * RAD_TO_DEG)
  };
}

function readVideoTimeMs(sourceVideoId: string) {
  const video = document.getElementById(sourceVideoId) as HTMLVideoElement | null;
  return Math.max(0, Math.round((video?.currentTime ?? 0) * 1000));
}

function shouldHandleKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName !== "input" && tagName !== "textarea" && tagName !== "select" && !target.isContentEditable;
}

function buildState(instance: AFrameCropComponentThis): CropMaskState {
  const fovH = Number(instance.fovH.toFixed(2));

  return {
    aspect: CROP_MASK_ASPECT,
    center: {
      yaw: normalizeYaw(instance.center.yaw),
      pitch: normalizePitch(instance.center.pitch)
    },
    cut: false,
    enabled: true,
    fov: {
      h: fovH,
      v: verticalFovFromHorizontal(fovH)
    },
    input: instance.input,
    locked: instance.locked,
    maskOpacity: Number(instance.opacityValue.toFixed(3)),
    roll: 0,
    smoothFollow: !instance.locked,
    source: "crop-mask-preview",
    version: 1,
    videoTimeMs: readVideoTimeMs(instance.data.sourceVideoId)
  };
}

function emitCropState(instance: AFrameCropComponentThis, force = false) {
  const state = buildState(instance);
  const signature = JSON.stringify({
    center: state.center,
    fov: state.fov,
    input: state.input,
    locked: state.locked,
    smoothFollow: state.smoothFollow
  });

  if (!force && signature === instance.lastSignature) {
    return;
  }

  instance.lastSignature = signature;
  instance.el.emit?.(WEBXR_CROP_MASK_CHANGE_EVENT, state, false);
  window.dispatchEvent(
    new CustomEvent<CropMaskState>(WEBXR_CROP_MASK_CHANGE_EVENT, {
      detail: state
    })
  );
}

function applyUniforms(instance: AFrameCropComponentThis) {
  const uniforms = instance.uniforms;

  if (!uniforms) {
    return;
  }

  uniforms.uCenterYaw.value = instance.center.yaw * DEG_TO_RAD;
  uniforms.uCenterPitch.value = instance.center.pitch * DEG_TO_RAD;
  uniforms.uFov.value = {
    x: instance.fovH * DEG_TO_RAD,
    y: verticalFovFromHorizontal(instance.fovH) * DEG_TO_RAD
  };
  uniforms.uLocked.value = instance.locked ? 1 : 0;
  uniforms.uOpacity.value = instance.opacityValue;
}

function setMaskOpacity(instance: AFrameCropComponentThis, opacity: number, durationMs = 0) {
  const to = clamp(opacity, 0, 0.95);
  const from = typeof instance.opacityValue === "number" ? instance.opacityValue : DEFAULT_CROP_MASK_OPACITY;

  if (durationMs > 0) {
    instance.opacityAnimation = {
      durationMs,
      from,
      startedAt: performance.now(),
      to
    };
  } else {
    instance.opacityAnimation = undefined;
    instance.opacityValue = to;
  }

  applyUniforms(instance);
  emitCropState(instance, true);
}

function nudgeFov(instance: AFrameCropComponentThis, deltaH: number) {
  instance.fovH = clamp(instance.fovH + deltaH, MIN_CROP_FOV_H, MAX_CROP_FOV_H);
  instance.input = "keyboard";
  applyUniforms(instance);
  emitCropState(instance, true);
}

function setMaskFov(instance: AFrameCropComponentThis, fovH: number) {
  instance.fovH = clamp(fovH, MIN_CROP_FOV_H, MAX_CROP_FOV_H);
  instance.input = "keyboard";
  applyUniforms(instance);
  emitCropState(instance, true);
}

function nudgeCenter(instance: AFrameCropComponentThis, deltaYaw: number, deltaPitch: number) {
  if (!instance.locked) {
    return;
  }

  instance.center = {
    yaw: normalizeYaw(instance.center.yaw + deltaYaw),
    pitch: normalizePitch(instance.center.pitch + deltaPitch)
  };
  instance.input = "keyboard";
  applyUniforms(instance);
  emitCropState(instance, true);
}

function setCenter(instance: AFrameCropComponentThis, yaw: number, pitch: number) {
  instance.center = {
    yaw: normalizeYaw(yaw),
    pitch: normalizePitch(pitch)
  };
  instance.input = "keyboard";
  instance.locked = true;
  applyUniforms(instance);
  emitCropState(instance, true);
}

function setMaskLocked(instance: AFrameCropComponentThis, locked: boolean) {
  instance.locked = locked;
  instance.input = locked ? "keyboard" : "head_gaze";
  applyUniforms(instance);
  emitCropState(instance, true);
}

function resetToHeadGaze(instance: AFrameCropComponentThis) {
  const camera = instance.el.sceneEl?.camera;
  if (camera?.getWorldDirection && instance.currentDirection) {
    const pose = directionToPose(camera.getWorldDirection(instance.currentDirection));
    instance.center = pose;
  } else {
    instance.center = { yaw: 0, pitch: 0 };
  }

  instance.input = "keyboard";
  instance.locked = true;
  applyUniforms(instance);
  emitCropState(instance, true);
}

function bindKeyboard(instance: AFrameCropComponentThis) {
  instance.keydownHandler = (event: KeyboardEvent) => {
    if (!shouldHandleKeyboardTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    const step = event.shiftKey ? 5 : 1.5;

    if (key === "l" || code === "keyl") {
      instance.locked = !instance.locked;
      instance.input = instance.locked ? "keyboard" : "head_gaze";
      applyUniforms(instance);
      emitCropState(instance, true);
      event.preventDefault();
      return;
    }

    if (key === "=" || key === "+" || code === "equal" || code === "numpadadd") {
      nudgeFov(instance, -5);
      event.preventDefault();
      return;
    }

    if (key === "-" || key === "_" || code === "minus" || code === "numpadsubtract") {
      nudgeFov(instance, 5);
      event.preventDefault();
      return;
    }

    if (key === "r" || code === "keyr") {
      resetToHeadGaze(instance);
      event.preventDefault();
      return;
    }

    if (key === "arrowleft" || code === "arrowleft") {
      nudgeCenter(instance, -step, 0);
      event.preventDefault();
      return;
    }

    if (key === "arrowright" || code === "arrowright") {
      nudgeCenter(instance, step, 0);
      event.preventDefault();
      return;
    }

    if (key === "arrowup" || code === "arrowup") {
      nudgeCenter(instance, 0, step);
      event.preventDefault();
      return;
    }

    if (key === "arrowdown" || code === "arrowdown") {
      nudgeCenter(instance, 0, -step);
      event.preventDefault();
    }
  };

  window.addEventListener("keydown", instance.keydownHandler);
}

function createFragmentShader() {
  return `
    precision highp float;

    uniform float uCenterYaw;
    uniform float uCenterPitch;
    uniform vec2 uFov;
    uniform float uOpacity;
    uniform float uTime;
    uniform float uLocked;
    uniform float uFeather;
    uniform float uCornerRadius;
    varying vec3 vLocalDirection;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    vec3 centerForward(float yaw, float pitch) {
      float cp = cos(pitch);
      return normalize(vec3(sin(yaw) * cp, sin(pitch), -cos(yaw) * cp));
    }

    vec3 safeRight(vec3 forward) {
      vec3 up = vec3(0.0, 1.0, 0.0);
      vec3 right = normalize(cross(forward, up));
      if (length(right) < 0.01) {
        right = vec3(1.0, 0.0, 0.0);
      }
      return right;
    }

    void main() {
      vec3 dir = normalize(vLocalDirection);
      vec3 forward = centerForward(uCenterYaw, uCenterPitch);
      vec3 right = safeRight(forward);
      vec3 up = normalize(cross(right, forward));
      float denom = dot(dir, forward);
      float halfH = tan(uFov.x * 0.5);
      float halfV = tan(uFov.y * 0.5);
      float viewX = dot(dir, right) / max(denom, 0.0001);
      float viewY = dot(dir, up) / max(denom, 0.0001);
      vec2 viewport = vec2(viewX / halfH, viewY / halfV);
      float inFront = step(0.0, denom);
      vec2 q = abs(viewport) - vec2(1.0) + uCornerRadius;
      float roundedRectSdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCornerRadius;
      float edgeDistance = roundedRectSdf;
      float windowCutout = inFront * (1.0 - smoothstep(-uFeather, uFeather, edgeDistance));
      float maskAmount = 1.0 - windowCutout;
      float transparentWindow = windowCutout;

      if (transparentWindow > 0.995 || uOpacity <= 0.002) {
        discard;
      }

      float border = inFront * exp(-pow(edgeDistance / 0.025, 2.0));
      float softRim = inFront * exp(-pow(edgeDistance / 0.12, 2.0));
      float innerGlow = inFront * (1.0 - smoothstep(0.0, 0.22, abs(edgeDistance)));
      float edgeDarken = smoothstep(0.0, 0.45, edgeDistance);
      float grain = hash(dir.xz * 260.0 + vec2(uTime * 0.00005, -uTime * 0.00004));
      float fineGrain = hash(dir.xy * 620.0 + vec2(-uTime * 0.00003, uTime * 0.00002));
      float fogWave = sin((dir.x * 3.1 + dir.y * 2.7 + dir.z * 1.4) * 5.0 + uTime * 0.00042) * 0.5 + 0.5;
      float sweep = exp(-pow(dir.x * 0.32 + dir.y * 0.68 + sin(uTime * 0.00028) * 0.14, 2.0) / 0.02);
      float gloss = exp(-pow(dir.x * 0.58 - dir.y * 0.82 + sin(uTime * 0.00022) * 0.18, 2.0) / 0.006);

      vec3 smoke = vec3(0.015, 0.017, 0.019);
      vec3 glass = vec3(0.085, 0.095, 0.105);
      vec3 mist = vec3(0.18, 0.20, 0.215);
      vec3 highlight = vec3(0.62, 0.68, 0.70);
      vec3 color = mix(smoke, glass, 0.46 + grain * 0.11 + fogWave * 0.08);
      color *= mix(0.92, 1.04, edgeDarken);
      color = mix(color, mist, softRim * 0.12);
      color += highlight * border * 0.42;
      color += highlight * innerGlow * 0.045;
      color += highlight * sweep * 0.04;
      color += highlight * gloss * 0.075;
      color += vec3(0.025) * fineGrain;

      float alpha = maskAmount * (uOpacity + grain * 0.03 + fogWave * 0.035 + innerGlow * 0.025);
      alpha = max(alpha, border * min(0.76, uOpacity + 0.16));
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.92));
    }
  `;
}

export { createFragmentShader as createCropViewportMaskFragmentShader };

export function registerAFrameCropViewportMaskComponents() {
  const aframe = window.AFRAME as AFrameRuntime | undefined;

  if (!aframe) {
    return;
  }

  if (!aframe.components?.["crop-viewport-player-rig"]) {
    aframe.registerComponent("crop-viewport-player-rig", {
      init: function init(this: {
        cameraPosition?: Vector3Like;
        el: {
          object3D?: { position?: { copy: (value: unknown) => unknown } };
          sceneEl?: { camera?: { getWorldPosition?: (target: unknown) => unknown } };
        };
      }) {
        const THREE = aframe.THREE;
        if (THREE) {
          this.cameraPosition = new THREE.Vector3();
        }
      },
      tick: function tick(this: {
        cameraPosition?: Vector3Like;
        el: {
          object3D?: { position?: { copy: (value: unknown) => unknown } };
          sceneEl?: { camera?: { getWorldPosition?: (target: unknown) => unknown } };
        };
      }) {
        const camera = this.el.sceneEl?.camera;
        if (camera?.getWorldPosition && this.cameraPosition) {
          this.el.object3D?.position?.copy(camera.getWorldPosition(this.cameraPosition));
        }
      }
    });
  }

  if (aframe.components?.["crop-viewport-mask"]) {
    return;
  }

  aframe.registerComponent("crop-viewport-mask", {
    schema: {
      opacity: { default: DEFAULT_CROP_MASK_OPACITY },
      radius: { default: 4.2 },
      sourceVideoId: { default: "aframe-360-source-video" }
    },
    init: function init(this: AFrameCropComponentThis) {
      const THREE = aframe.THREE;

      this.center = { yaw: 0, pitch: 0 };
      this.fovH = DEFAULT_CROP_FOV_H;
      this.input = "keyboard";
      this.locked = DEFAULT_MASK_LOCKED;
      this.opacityValue = clamp(this.data.opacity, 0, 0.95);

      if (!THREE) {
        return;
      }

      this.currentDirection = new THREE.Vector3(0, 0, -1);
      const fov = new THREE.Vector2(DEFAULT_CROP_FOV_H * DEG_TO_RAD, verticalFovFromHorizontal(DEFAULT_CROP_FOV_H) * DEG_TO_RAD);
      const uniforms = {
        uCenterYaw: { value: 0 },
        uCenterPitch: { value: 0 },
        uCornerRadius: { value: 0.18 },
        uFov: { value: fov },
        uFeather: { value: 0.195 },
        uLocked: { value: 0 },
        uOpacity: { value: this.opacityValue },
        uTime: { value: 0 }
      };
      const geometry = new THREE.SphereGeometry(this.data.radius, 96, 48);
      const material = new THREE.ShaderMaterial({
        depthTest: true,
        depthWrite: false,
        fragmentShader: createFragmentShader(),
        side: THREE.BackSide,
        transparent: true,
        uniforms,
        vertexShader: `
          varying vec3 vLocalDirection;

          void main() {
            vLocalDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 30;

      this.uniforms = uniforms;
      this.material = material;
      this.mesh = mesh;
      this.el.setObject3D?.("mesh", mesh);
      bindKeyboard(this);
      this.opacityEventHandler = (event: Event) => {
        const detail = (event as CustomEvent<{ durationMs?: number; opacity?: number }>).detail;
        if (typeof detail?.opacity === "number") {
          setMaskOpacity(this, detail.opacity, detail.durationMs ?? 0);
        }
      };
      this.centerEventHandler = (event: Event) => {
        const detail = (event as CustomEvent<{
          deltaPitch?: number;
          deltaYaw?: number;
          pitch?: number;
          yaw?: number;
        }>).detail;
        if (typeof detail?.yaw === "number" || typeof detail?.pitch === "number") {
          setCenter(this, detail.yaw ?? this.center.yaw, detail.pitch ?? this.center.pitch);
          return;
        }
        if (typeof detail?.deltaYaw === "number" || typeof detail?.deltaPitch === "number") {
          nudgeCenter(this, detail.deltaYaw ?? 0, detail.deltaPitch ?? 0);
        }
      };
      this.fovEventHandler = (event: Event) => {
        const detail = (event as CustomEvent<{ fovH?: number }>).detail;
        if (typeof detail?.fovH === "number") {
          setMaskFov(this, detail.fovH);
        }
      };
      this.lockEventHandler = (event: Event) => {
        const detail = (event as CustomEvent<{ locked?: boolean }>).detail;
        if (typeof detail?.locked === "boolean") {
          setMaskLocked(this, detail.locked);
        }
      };
      window.addEventListener(WEBXR_CROP_MASK_OPACITY_EVENT, this.opacityEventHandler);
      window.addEventListener(WEBXR_CROP_MASK_CENTER_EVENT, this.centerEventHandler);
      window.addEventListener(WEBXR_CROP_MASK_FOV_EVENT, this.fovEventHandler);
      window.addEventListener(WEBXR_CROP_MASK_LOCK_EVENT, this.lockEventHandler);
      applyUniforms(this);
      window.setTimeout(() => emitCropState(this, true), 0);
    },
    remove: function remove(this: AFrameCropComponentThis) {
      if (this.keydownHandler) {
        window.removeEventListener("keydown", this.keydownHandler);
      }
      if (this.opacityEventHandler) {
        window.removeEventListener(WEBXR_CROP_MASK_OPACITY_EVENT, this.opacityEventHandler);
      }
      if (this.centerEventHandler) {
        window.removeEventListener(WEBXR_CROP_MASK_CENTER_EVENT, this.centerEventHandler);
      }
      if (this.fovEventHandler) {
        window.removeEventListener(WEBXR_CROP_MASK_FOV_EVENT, this.fovEventHandler);
      }
      if (this.lockEventHandler) {
        window.removeEventListener(WEBXR_CROP_MASK_LOCK_EVENT, this.lockEventHandler);
      }
      this.material?.dispose?.();
      this.el.removeObject3D?.("mesh");
    },
    tick: function tick(this: AFrameCropComponentThis, time: number) {
      const camera = this.el.sceneEl?.camera;
      const uniforms = this.uniforms;

      if (uniforms) {
        uniforms.uTime.value = time;
        if (this.opacityAnimation) {
          const elapsed = (performance.now() - this.opacityAnimation.startedAt) * getPcEditorFrontendPlaybackRate();
          const progress = clamp(elapsed / Math.max(this.opacityAnimation.durationMs, 1), 0, 1);
          const eased = progress * progress * (3 - 2 * progress);
          this.opacityValue = this.opacityAnimation.from + (this.opacityAnimation.to - this.opacityAnimation.from) * eased;
          if (progress >= 1) {
            this.opacityValue = this.opacityAnimation.to;
            this.opacityAnimation = undefined;
            emitCropState(this, true);
          }
        }
        uniforms.uOpacity.value = this.opacityValue;
      }

      if (!this.locked && camera?.getWorldDirection && this.currentDirection) {
        const pose = directionToPose(camera.getWorldDirection(this.currentDirection));
        this.center = pose;
        this.input = "head_gaze";
        applyUniforms(this);
        emitCropState(this);
      }
    }
  });
}

export function AFrameCropViewportMask({ sourceVideoId = "aframe-360-source-video" }: { sourceVideoId?: string }) {
  return createElement("a-entity", {
    "crop-viewport-mask": `sourceVideoId: ${sourceVideoId}`,
    "data-testid": "aframe-crop-mask-preview"
  });
}
