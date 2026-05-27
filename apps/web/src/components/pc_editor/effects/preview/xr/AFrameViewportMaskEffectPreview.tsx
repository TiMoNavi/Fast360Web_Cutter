"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { useAFrameRuntime } from "@/components/pc_editor/webxr/useAFrameRuntime";
import { verticalFovFromHorizontal } from "@/components/pc_editor/mask_controller";
import { useOptionalPcEditorEventBus } from "@/components/pc_editor/events";
import {
  usePcEditorCropMaskState,
  usePcEditorEffectInput,
  type PcEditorEffectInputRuntimeState
} from "@/components/pc_editor/state";
import {
  resolveOcclusionPreviewTone,
  resolveEffectEventName,
  resolveEffectPreviewTarget,
  resolveViewportMaskPreviewTone
} from "../effectPreviewSemantics";
import type { EffectOcclusionPreviewTone, EffectViewportMaskPreviewTone } from "../effectPreviewSemantics";
import type { EffectPreviewState, PcEffectPreviewDetail } from "../types";

type ShaderMaterialLike = {
  dispose?: () => void;
  uniforms?: Record<string, { value: unknown }>;
};

type GeometryLike = {
  dispose?: () => void;
};

type MeshLike = {
  frustumCulled?: boolean;
  renderOrder?: number;
};

type Vector3Like = {
  copy?: (value: unknown) => unknown;
  set?: (x: number, y: number, z: number) => void;
  x?: number;
  y?: number;
  z?: number;
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

type AFrameViewportMaskPreviewComponentThis = {
  data: {
    active: boolean;
    colorB: number;
    colorG: number;
    colorR: number;
    centerPitch: number;
    centerYaw: number;
    cornerRadius: number;
    feather: number;
    fovH: number;
    opacity: number;
    radius: number;
  };
  el: {
    removeObject3D?: (name: string) => void;
    setObject3D?: (name: string, object: MeshLike) => void;
  };
  geometry?: GeometryLike;
  material?: ShaderMaterialLike;
  mesh?: MeshLike;
  uniforms?: Record<string, { value: unknown }>;
};

type AFrameViewportMaskPreviewRigThis = {
  cameraPosition?: Vector3Like;
  el: {
    object3D?: { position?: Vector3Like };
    sceneEl?: { camera?: { getWorldPosition?: (target: unknown) => unknown } };
  };
  rafId?: number;
};

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_PREVIEW_RADIUS = 4.08;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStringPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function detailFromPayload(payload: unknown): PcEffectPreviewDetail | null {
  const effectId = readStringPayload(payload, "effectId");

  if (!effectId) {
    return null;
  }

  const eventName = resolveEffectEventName(effectId, readStringPayload(payload, "eventName"));
  const previewTarget = readStringPayload(payload, "previewTarget") ?? readStringPayload(payload, "target");

  return {
    categoryId: readStringPayload(payload, "categoryId") ?? "uncategorized",
    effectId,
    eventName,
    label: readStringPayload(payload, "label") ?? effectId,
    target: resolveEffectPreviewTarget({
      effectId,
      eventName,
      previewTarget: previewTarget === "viewport-mask" ? "viewport-mask" : undefined
    })
  };
}

function effectFromRuntimeInput(effectInput: PcEditorEffectInputRuntimeState | null): EffectPreviewState | null {
  if (!effectInput?.effectId || (effectInput.mode !== "holding" && effectInput.mode !== "selected")) {
    return null;
  }

  const eventName = resolveEffectEventName(effectInput.effectId, effectInput.eventName);

  return {
    categoryId: effectInput.categoryId ?? "uncategorized",
    effectId: effectInput.effectId,
    eventName,
    label: effectInput.label ?? effectInput.effectId,
    mode: effectInput.mode === "holding" ? "hold" : "momentary",
    target: resolveEffectPreviewTarget({
      effectId: effectInput.effectId,
      eventName,
      previewTarget: effectInput.previewTarget
    })
  };
}

function resolveRenderableOcclusionTone(effect: EffectPreviewState | null): EffectOcclusionPreviewTone | null {
  if (!effect || effect.target !== "viewport-mask") {
    return null;
  }

  return resolveOcclusionPreviewTone({
    effectId: effect.effectId,
    eventName: effect.eventName,
    previewTarget: effect.target
  });
}

function resolveRenderableViewportTone(effect: EffectPreviewState | null): EffectViewportMaskPreviewTone | null {
  if (!effect || effect.target !== "viewport-mask") {
    return null;
  }

  return resolveViewportMaskPreviewTone({
    effectId: effect.effectId,
    eventName: effect.eventName,
    previewTarget: effect.target
  });
}

function colorForTone(tone: EffectViewportMaskPreviewTone | null) {
  if (tone === "white") {
    return { b: 1, g: 1, r: 1 };
  }

  if (tone === "cyan") {
    return { b: 0.94, g: 0.92, r: 0.08 };
  }

  if (tone === "magenta") {
    return { b: 0.96, g: 0.1, r: 1 };
  }

  if (tone === "orange") {
    return { b: 0.16, g: 0.52, r: 1 };
  }

  if (tone === "steel") {
    return { b: 0.82, g: 0.74, r: 0.58 };
  }

  if (tone === "mono") {
    return { b: 0.78, g: 0.78, r: 0.78 };
  }

  return { b: 0, g: 0, r: 0 };
}

function syncPreviewRigToCamera(instance: AFrameViewportMaskPreviewRigThis) {
  const camera = instance.el.sceneEl?.camera;
  if (camera?.getWorldPosition && instance.cameraPosition) {
    instance.el.object3D?.position?.copy?.(camera.getWorldPosition(instance.cameraPosition));
  }
}

function makeAttribute(input: {
  active: boolean;
  color: { b: number; g: number; r: number };
  centerPitch: number;
  centerYaw: number;
  cornerRadius: number;
  feather: number;
  fovH: number;
  opacity: number;
  radius?: number;
}) {
  return [
    `active: ${input.active}`,
    `radius: ${input.radius ?? DEFAULT_PREVIEW_RADIUS}`,
    `opacity: ${input.opacity}`,
    `colorR: ${input.color.r}`,
    `colorG: ${input.color.g}`,
    `colorB: ${input.color.b}`,
    `fovH: ${input.fovH}`,
    `centerYaw: ${input.centerYaw}`,
    `centerPitch: ${input.centerPitch}`,
    `cornerRadius: ${input.cornerRadius}`,
    `feather: ${input.feather}`
  ].join("; ");
}

function createFragmentShader() {
  return `
    precision highp float;

    uniform float uActive;
    uniform vec3 uColor;
    uniform float uCenterYaw;
    uniform float uCenterPitch;
    uniform vec2 uFov;
    uniform float uOpacity;
    uniform float uTime;
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
      if (uActive < 0.5 || uOpacity <= 0.002) {
        discard;
      }

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
      float edgeDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uCornerRadius;
      float windowFill = inFront * (1.0 - smoothstep(-uFeather, uFeather, edgeDistance));

      if (windowFill <= 0.002) {
        discard;
      }

      float insideDistance = max(-edgeDistance, 0.0);
      float innerBody = smoothstep(0.0, 0.34, insideDistance);
      float edgeMist = 1.0 - smoothstep(0.0, 0.18, insideDistance);
      float centerFalloff = 1.0 - smoothstep(0.55, 1.2, length(viewport));
      float grain = hash(dir.xy * 520.0 + vec2(uTime * 0.00004, -uTime * 0.00003));
      float slowFog = sin((dir.x * 2.7 + dir.y * 3.4 - dir.z * 1.2) * 4.0 + uTime * 0.00036) * 0.5 + 0.5;
      float alpha = windowFill * uOpacity * mix(0.34, 1.0, innerBody);
      alpha *= mix(0.82, 1.06, centerFalloff);
      alpha += edgeMist * windowFill * uOpacity * 0.08;
      alpha += (grain * 0.03 + slowFog * 0.035) * windowFill * uOpacity;

      float colorBrightness = dot(uColor, vec3(0.333333));
      vec3 darkTexture = mix(vec3(0.0), vec3(0.014, 0.016, 0.018), 0.32 + grain * 0.16 + edgeMist * 0.12);
      vec3 lightTexture = mix(uColor * 0.84, uColor, 0.68 + grain * 0.08 + centerFalloff * 0.1);
      vec3 color = mix(darkTexture, lightTexture, smoothstep(0.15, 0.65, colorBrightness));
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.98));
    }
  `;
}

function applyUniforms(instance: AFrameViewportMaskPreviewComponentThis) {
  const uniforms = instance.uniforms;

  if (!uniforms) {
    return;
  }

  uniforms.uActive.value = instance.data.active ? 1 : 0;
  const colorR = clamp(instance.data.colorR, 0, 1);
  const colorG = clamp(instance.data.colorG, 0, 1);
  const colorB = clamp(instance.data.colorB, 0, 1);
  const colorUniform = uniforms.uColor.value as { set?: (x: number, y: number, z: number) => void } | undefined;
  if (colorUniform?.set) {
    colorUniform.set(colorR, colorG, colorB);
  } else {
    uniforms.uColor.value = { x: colorR, y: colorG, z: colorB };
  }
  uniforms.uCenterYaw.value = instance.data.centerYaw * DEG_TO_RAD;
  uniforms.uCenterPitch.value = instance.data.centerPitch * DEG_TO_RAD;
  uniforms.uFov.value = {
    x: instance.data.fovH * DEG_TO_RAD,
    y: verticalFovFromHorizontal(instance.data.fovH) * DEG_TO_RAD
  };
  uniforms.uOpacity.value = clamp(instance.data.opacity, 0, 1);
  uniforms.uCornerRadius.value = Math.max(0, instance.data.cornerRadius);
  uniforms.uFeather.value = Math.max(0.001, instance.data.feather);
}

export function registerAFrameViewportMaskEffectPreviewComponent() {
  const aframe = window.AFRAME as AFrameRuntime | undefined;

  if (!aframe) {
    return;
  }

  if (!aframe.components?.["pc-viewport-mask-effect-preview-rig"]) {
    aframe.registerComponent("pc-viewport-mask-effect-preview-rig", {
      init: function init(this: AFrameViewportMaskPreviewRigThis) {
        const THREE = aframe.THREE;
        if (THREE) {
          this.cameraPosition = new THREE.Vector3();
        }
        const sync = () => {
          syncPreviewRigToCamera(this);
          this.rafId = window.requestAnimationFrame(sync);
        };
        this.rafId = window.requestAnimationFrame(sync);
      },
      tick: function tick(this: AFrameViewportMaskPreviewRigThis) {
        syncPreviewRigToCamera(this);
      },
      remove: function remove(this: AFrameViewportMaskPreviewRigThis) {
        if (typeof this.rafId === "number") {
          window.cancelAnimationFrame(this.rafId);
          this.rafId = undefined;
        }
      }
    });
  }

  if (aframe.components?.["pc-viewport-mask-effect-preview"]) {
    return;
  }

  aframe.registerComponent("pc-viewport-mask-effect-preview", {
    schema: {
      active: { default: false },
      colorB: { default: 0 },
      colorG: { default: 0 },
      colorR: { default: 0 },
      centerPitch: { default: 0 },
      centerYaw: { default: 0 },
      cornerRadius: { default: 0.18 },
      feather: { default: 0.18 },
      fovH: { default: 82 },
      opacity: { default: 0 },
      radius: { default: DEFAULT_PREVIEW_RADIUS }
    },
    init: function init(this: AFrameViewportMaskPreviewComponentThis) {
      const THREE = aframe.THREE;

      if (!THREE) {
        return;
      }

      const uniforms = {
        uActive: { value: this.data.active ? 1 : 0 },
        uColor: { value: new THREE.Vector3(this.data.colorR, this.data.colorG, this.data.colorB) },
        uCenterYaw: { value: this.data.centerYaw * DEG_TO_RAD },
        uCenterPitch: { value: this.data.centerPitch * DEG_TO_RAD },
        uCornerRadius: { value: Math.max(0, this.data.cornerRadius) },
        uFeather: { value: Math.max(0.001, this.data.feather) },
        uFov: { value: new THREE.Vector2(this.data.fovH * DEG_TO_RAD, verticalFovFromHorizontal(this.data.fovH) * DEG_TO_RAD) },
        uOpacity: { value: clamp(this.data.opacity, 0, 1) },
        uTime: { value: 0 }
      };
      const geometry = new THREE.SphereGeometry(this.data.radius, 96, 48);
      const material = new THREE.ShaderMaterial({
        depthTest: false,
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
      mesh.renderOrder = 46;

      this.geometry = geometry;
      this.material = material;
      this.mesh = mesh;
      this.uniforms = uniforms;
      this.el.setObject3D?.("mesh", mesh);
    },
    update: function update(this: AFrameViewportMaskPreviewComponentThis) {
      applyUniforms(this);
    },
    remove: function remove(this: AFrameViewportMaskPreviewComponentThis) {
      this.material?.dispose?.();
      this.geometry?.dispose?.();
      this.el.removeObject3D?.("mesh");
    },
    tick: function tick(this: AFrameViewportMaskPreviewComponentThis, time: number) {
      if (this.uniforms) {
        this.uniforms.uTime.value = time;
      }
    }
  });
}

export function AFrameViewportMaskEffectPreview() {
  const { ready } = useAFrameRuntime();
  const eventBus = useOptionalPcEditorEventBus();
  const cropMask = usePcEditorCropMaskState();
  const effectInput = usePcEditorEffectInput();
  const [eventEffect, setEventEffect] = useState<EffectPreviewState | null>(null);
  const [componentRegistered, setComponentRegistered] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const runtimeEffect = useMemo(() => effectFromRuntimeInput(effectInput), [effectInput]);

  useEffect(() => {
    if (ready) {
      registerAFrameViewportMaskEffectPreviewComponent();
      setComponentRegistered(true);
      return;
    }

    setComponentRegistered(false);
  }, [ready]);

  useEffect(() => {
    if (!eventBus) {
      return undefined;
    }

    const clearHideTimer = () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    const hideAfter = (delayMs: number) => {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        setEventEffect(null);
        hideTimerRef.current = null;
      }, delayMs);
    };

    const unbindStart = eventBus.on("editor.effects.hold.start", (event) => {
      const detail = detailFromPayload(event.payload);

      if (!detail) {
        return;
      }

      clearHideTimer();
      setEventEffect({ ...detail, mode: "hold" });
    });
    const unbindEnd = eventBus.on("editor.effects.hold.end", (event) => {
      const detail = detailFromPayload(event.payload);

      setEventEffect((value) => {
        if (!value || (detail?.effectId && value.effectId !== detail.effectId)) {
          return value;
        }

        return { ...value, mode: "release" };
      });
      hideAfter(420);
    });

    return () => {
      unbindStart();
      unbindEnd();
      clearHideTimer();
    };
  }, [eventBus]);

  const activeEffect = eventEffect ?? runtimeEffect;
  const occlusionTone = resolveRenderableOcclusionTone(activeEffect);
  const tone = occlusionTone ?? resolveRenderableViewportTone(activeEffect);
  const renderable = tone !== null;
  const color = colorForTone(tone);
  const opacity = renderable
    ? activeEffect?.mode === "release"
      ? occlusionTone === "white"
        ? 0.36
        : occlusionTone === "black"
          ? 0.42
          : 0.18
      : activeEffect?.mode === "momentary"
        ? occlusionTone === "white"
          ? 0.82
          : occlusionTone === "black"
            ? 0.72
            : 0.32
        : occlusionTone === "white"
          ? 0.88
          : occlusionTone === "black"
            ? 0.92
            : 0.36
    : 0;
  const fovH = cropMask?.fov.h ?? 82;
  const center = cropMask?.center ?? { pitch: 0, yaw: 0 };

  if (!ready || !componentRegistered) {
    return null;
  }

  return createElement("a-entity", {
    "data-testid": "aframe-viewport-mask-effect-preview",
    "pc-viewport-mask-effect-preview-rig": "",
    "pc-viewport-mask-effect-preview": makeAttribute({
      active: renderable,
      color,
      centerPitch: center.pitch,
      centerYaw: center.yaw,
      cornerRadius: 0.18,
      feather: 0.22,
      fovH,
      opacity
    })
  });
}
