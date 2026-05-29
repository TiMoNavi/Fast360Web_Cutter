"use client";

import { createElement } from "react";
import { verticalFovFromHorizontal } from "../../viewFov";
import { createCropViewportMaskFragmentShader } from "../../mask_controller/webxr/AFrameCropViewportMask";

export const VR_CROP_MASK_ASPECT = "16:9";
export const DEFAULT_VR_CROP_FOV_H = 82;
export const MIN_VR_CROP_FOV_H = 35;
export const MAX_VR_CROP_FOV_H = 178;
export const DEFAULT_VR_CROP_MASK_OPACITY = 0.74;
export const VR_CROP_MASK_CHANGE_EVENT = "pc-editor-vr-crop-mask-change";
export const VR_CROP_MASK_CENTER_EVENT = "pc-editor-vr-crop-mask-center";
export const VR_CROP_MASK_FOV_EVENT = "pc-editor-vr-crop-mask-fov";
export const VR_CROP_MASK_LOCK_EVENT = "pc-editor-vr-crop-mask-lock";
export const VR_CROP_MASK_OPACITY_EVENT = "pc-editor-vr-crop-mask-opacity";

export type VrCropMaskState = {
  center: {
    pitch: number;
    yaw: number;
  };
  fov: {
    h: number;
    v: number;
  };
  input: "controller" | "head_gaze" | "keyboard";
  locked: boolean;
  maskOpacity: number;
  roll: number;
};

type Vector3Like = {
  copy: (value: unknown) => Vector3Like;
  x: number;
  y: number;
  z: number;
};

type Object3DLike = {
  position?: Vector3Like;
};

type MeshLike = {
  frustumCulled?: boolean;
  renderOrder?: number;
};

type ShaderMaterialLike = {
  dispose?: () => void;
  uniforms?: Record<string, { value: unknown }>;
};

type GeometryLike = {
  dispose?: () => void;
};

type AFrameRuntime = {
  components?: Record<string, unknown>;
  registerComponent: (name: string, definition: Record<string, unknown>) => void;
  THREE?: {
    BackSide: unknown;
    Mesh: new (geometry: GeometryLike, material: ShaderMaterialLike) => MeshLike;
    ShaderMaterial: new (parameters: Record<string, unknown>) => ShaderMaterialLike;
    SphereGeometry: new (radius: number, widthSegments: number, heightSegments: number) => GeometryLike;
    Vector2: new (x?: number, y?: number) => { set: (x: number, y: number) => void };
    Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
  };
};

type AFrameVrCropMaskComponentThis = {
  center: { pitch: number; yaw: number };
  centerEventHandler?: EventListener;
  data: {
    centerPitch: number;
    centerYaw: number;
    cornerRadius: number;
    feather: number;
    fovH: number;
    opacity: number;
    radius: number;
    roll: number;
  };
  el: {
    emit?: (name: string, detail?: unknown, bubbles?: boolean) => void;
    removeObject3D?: (name: string) => void;
    setObject3D?: (name: string, object: MeshLike) => void;
  };
  fovH: number;
  fovEventHandler?: EventListener;
  geometry?: GeometryLike;
  input: "controller" | "head_gaze" | "keyboard";
  lastSignature?: string;
  locked: boolean;
  lockEventHandler?: EventListener;
  material?: ShaderMaterialLike;
  mesh?: MeshLike;
  opacityEventHandler?: EventListener;
  opacityValue: number;
  roll: number;
  uniforms?: Record<string, { value: unknown }>;
};

type AFrameVrCropMaskRigThis = {
  cameraPosition?: Vector3Like;
  el: {
    object3D?: Object3DLike;
    sceneEl?: {
      camera?: {
        getWorldPosition?: (target: unknown) => unknown;
      };
    };
  };
};

export type AFrameVrCropViewportMaskProps = {
  center?: {
    pitch: number;
    yaw: number;
  };
  cornerRadius?: number;
  feather?: number;
  fovH?: number;
  locked?: boolean;
  opacity?: number;
  radius?: number;
  roll?: number;
};

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

const DEG_TO_RAD = Math.PI / 180;

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
  return Number(clamp(pitch, -88, 88).toFixed(3));
}

function normalizeRoll(roll: number) {
  let nextRoll = roll;

  while (nextRoll > 180) {
    nextRoll -= 360;
  }
  while (nextRoll < -180) {
    nextRoll += 360;
  }

  return Object.is(nextRoll, -0) ? 0 : Number(nextRoll.toFixed(3));
}

function syncRigToCamera(instance: AFrameVrCropMaskRigThis) {
  const camera = instance.el.sceneEl?.camera;
  if (camera?.getWorldPosition && instance.cameraPosition) {
    instance.el.object3D?.position?.copy(camera.getWorldPosition(instance.cameraPosition));
  }
}

function syncStateFromData(instance: AFrameVrCropMaskComponentThis) {
  instance.center = {
    pitch: normalizePitch(instance.data.centerPitch),
    yaw: normalizeYaw(instance.data.centerYaw)
  };
  instance.fovH = clamp(instance.data.fovH, MIN_VR_CROP_FOV_H, MAX_VR_CROP_FOV_H);
  instance.locked = true;
  instance.opacityValue = clamp(instance.data.opacity, 0, 0.95);
  instance.roll = normalizeRoll(instance.data.roll);
}

function buildVrCropState(instance: AFrameVrCropMaskComponentThis): VrCropMaskState {
  return {
    center: instance.center,
    fov: {
      h: instance.fovH,
      v: verticalFovFromHorizontal(instance.fovH)
    },
    input: instance.input,
    locked: instance.locked,
    maskOpacity: instance.opacityValue,
    roll: instance.roll
  };
}

function emitVrCropState(instance: AFrameVrCropMaskComponentThis, force = false) {
  const state = buildVrCropState(instance);
  const signature = JSON.stringify({
    center: state.center,
    fov: state.fov,
    input: state.input,
    locked: state.locked,
    maskOpacity: state.maskOpacity,
    roll: state.roll
  });

  if (!force && signature === instance.lastSignature) {
    return;
  }

  instance.lastSignature = signature;
  instance.el.emit?.(VR_CROP_MASK_CHANGE_EVENT, state, false);
  window.dispatchEvent(new CustomEvent<VrCropMaskState>(VR_CROP_MASK_CHANGE_EVENT, {
    detail: state
  }));
}

function applyUniforms(instance: AFrameVrCropMaskComponentThis) {
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
  uniforms.uRoll.value = instance.roll * DEG_TO_RAD;
  uniforms.uCornerRadius.value = Math.max(0, instance.data.cornerRadius);
  uniforms.uFeather.value = Math.max(0.001, instance.data.feather);
}

function setMaskOpacity(instance: AFrameVrCropMaskComponentThis, opacity: number) {
  instance.opacityValue = clamp(opacity, 0, 0.95);
  instance.input = "controller";
  applyUniforms(instance);
  emitVrCropState(instance, true);
}

function setMaskFov(instance: AFrameVrCropMaskComponentThis, fovH: number) {
  instance.fovH = clamp(fovH, MIN_VR_CROP_FOV_H, MAX_VR_CROP_FOV_H);
  instance.input = "controller";
  applyUniforms(instance);
  emitVrCropState(instance, true);
}

function nudgeFov(instance: AFrameVrCropMaskComponentThis, deltaH: number) {
  setMaskFov(instance, instance.fovH + deltaH);
}

function setCenter(instance: AFrameVrCropMaskComponentThis, yaw: number, pitch: number) {
  instance.center = {
    pitch: normalizePitch(pitch),
    yaw: normalizeYaw(yaw)
  };
  instance.input = "controller";
  instance.locked = true;
  applyUniforms(instance);
  emitVrCropState(instance, true);
}

function nudgeCenter(instance: AFrameVrCropMaskComponentThis, deltaYaw: number, deltaPitch: number) {
  setCenter(instance, instance.center.yaw + deltaYaw, instance.center.pitch + deltaPitch);
}

function setMaskLocked(instance: AFrameVrCropMaskComponentThis, locked: boolean) {
  instance.locked = locked;
  instance.input = locked ? "controller" : "head_gaze";
  applyUniforms(instance);
  emitVrCropState(instance, true);
}

export function registerAFrameVrCropViewportMaskComponents() {
  const aframe = window.AFRAME as AFrameRuntime | undefined;

  if (!aframe) {
    return;
  }

  if (!aframe.components?.["vr-crop-viewport-player-rig"]) {
    aframe.registerComponent("vr-crop-viewport-player-rig", {
      init: function init(this: AFrameVrCropMaskRigThis) {
        const THREE = aframe.THREE;
        if (THREE) {
          this.cameraPosition = new THREE.Vector3();
        }
      },
      tick: function tick(this: AFrameVrCropMaskRigThis) {
        syncRigToCamera(this);
      }
    });
  }

  if (aframe.components?.["vr-crop-viewport-mask"]) {
    return;
  }

  aframe.registerComponent("vr-crop-viewport-mask", {
    schema: {
      centerPitch: { default: 0 },
      centerYaw: { default: 0 },
      cornerRadius: { default: 0.18 },
      feather: { default: 0.195 },
      fovH: { default: DEFAULT_VR_CROP_FOV_H },
      opacity: { default: DEFAULT_VR_CROP_MASK_OPACITY },
      radius: { default: 4.2 },
      roll: { default: 0 }
    },
    init: function init(this: AFrameVrCropMaskComponentThis) {
      const THREE = aframe.THREE;

      this.input = "controller";
      syncStateFromData(this);

      if (!THREE) {
        return;
      }

      const uniforms = {
        uCenterYaw: { value: this.center.yaw * DEG_TO_RAD },
        uCenterPitch: { value: this.center.pitch * DEG_TO_RAD },
        uCornerRadius: { value: Math.max(0, this.data.cornerRadius) },
        uFeather: { value: Math.max(0.001, this.data.feather) },
        uFov: { value: new THREE.Vector2(this.fovH * DEG_TO_RAD, verticalFovFromHorizontal(this.fovH) * DEG_TO_RAD) },
        uLocked: { value: 1 },
        uOpacity: { value: this.opacityValue },
        uRoll: { value: this.roll * DEG_TO_RAD },
        uTime: { value: 0 }
      };
      const geometry = new THREE.SphereGeometry(this.data.radius, 96, 48);
      const material = new THREE.ShaderMaterial({
        depthTest: true,
        depthWrite: false,
        fragmentShader: createCropViewportMaskFragmentShader(),
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

      this.geometry = geometry;
      this.material = material;
      this.mesh = mesh;
      this.uniforms = uniforms;
      this.el.setObject3D?.("mesh", mesh);
      this.opacityEventHandler = ((event: Event) => {
        const detail = (event as CustomEvent<{ opacity?: number }>).detail;
        if (typeof detail?.opacity === "number") {
          setMaskOpacity(this, detail.opacity);
        }
      }) as EventListener;
      this.centerEventHandler = ((event: Event) => {
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
      }) as EventListener;
      this.fovEventHandler = ((event: Event) => {
        const detail = (event as CustomEvent<{ deltaH?: number; fovH?: number }>).detail;

        if (typeof detail?.fovH === "number") {
          setMaskFov(this, detail.fovH);
          return;
        }

        if (typeof detail?.deltaH === "number") {
          nudgeFov(this, detail.deltaH);
        }
      }) as EventListener;
      this.lockEventHandler = ((event: Event) => {
        const detail = (event as CustomEvent<{ locked?: boolean }>).detail;
        if (typeof detail?.locked === "boolean") {
          setMaskLocked(this, detail.locked);
        }
      }) as EventListener;
      window.addEventListener(VR_CROP_MASK_OPACITY_EVENT, this.opacityEventHandler);
      window.addEventListener(VR_CROP_MASK_CENTER_EVENT, this.centerEventHandler);
      window.addEventListener(VR_CROP_MASK_FOV_EVENT, this.fovEventHandler);
      window.addEventListener(VR_CROP_MASK_LOCK_EVENT, this.lockEventHandler);
      window.setTimeout(() => emitVrCropState(this, true), 0);
    },
    update: function update(this: AFrameVrCropMaskComponentThis) {
      if (!this.uniforms) {
        return;
      }

      applyUniforms(this);
      emitVrCropState(this);
    },
    remove: function remove(this: AFrameVrCropMaskComponentThis) {
      if (this.opacityEventHandler) {
        window.removeEventListener(VR_CROP_MASK_OPACITY_EVENT, this.opacityEventHandler);
      }
      if (this.centerEventHandler) {
        window.removeEventListener(VR_CROP_MASK_CENTER_EVENT, this.centerEventHandler);
      }
      if (this.fovEventHandler) {
        window.removeEventListener(VR_CROP_MASK_FOV_EVENT, this.fovEventHandler);
      }
      if (this.lockEventHandler) {
        window.removeEventListener(VR_CROP_MASK_LOCK_EVENT, this.lockEventHandler);
      }
      this.material?.dispose?.();
      this.geometry?.dispose?.();
      this.el.removeObject3D?.("mesh");
    },
    tick: function tick(this: AFrameVrCropMaskComponentThis, time: number) {
      if (this.uniforms) {
        this.uniforms.uTime.value = time;
      }
    }
  });
}

function maskAttribute({
  center = { pitch: 0, yaw: 0 },
  cornerRadius = 0.18,
  feather = 0.195,
  fovH = DEFAULT_VR_CROP_FOV_H,
  opacity = DEFAULT_VR_CROP_MASK_OPACITY,
  radius = 4.2,
  roll = 0
}: AFrameVrCropViewportMaskProps) {
  return [
    `radius: ${radius}`,
    `opacity: ${opacity}`,
    `fovH: ${fovH}`,
    `centerYaw: ${center.yaw}`,
    `centerPitch: ${center.pitch}`,
    `roll: ${roll}`,
    `cornerRadius: ${cornerRadius}`,
    `feather: ${feather}`
  ].join("; ");
}

export function AFrameVrCropViewportMask(props: AFrameVrCropViewportMaskProps) {
  return createElement("a-entity", {
    "data-testid": "aframe-crop-mask-preview",
    "data-vr-mask-renderer": "true",
    "vr-crop-viewport-mask": maskAttribute(props)
  });
}
