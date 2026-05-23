"use client";

import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CROP_FOV_H,
  MAX_CROP_FOV_H,
  MIN_CROP_FOV_H,
  WEBXR_CROP_MASK_CHANGE_EVENT,
  WEBXR_CROP_MASK_FOV_EVENT,
  type CropMaskState
} from "./AFrameCropViewportMask";
import { verticalFovFromHorizontal } from "../viewFov";

type CornerId = "top-left" | "top-right" | "bottom-right" | "bottom-left";

type AFrameRuntime = {
  components?: Record<string, unknown>;
  registerComponent: (name: string, definition: Record<string, unknown>) => void;
  THREE?: {
    DoubleSide: unknown;
    Mesh: new (geometry: unknown, material: unknown) => {
      frustumCulled?: boolean;
      material?: unknown;
      renderOrder?: number;
    };
    PlaneGeometry: new (width: number, height: number) => { dispose?: () => void };
    ShaderMaterial: new (parameters: Record<string, unknown>) => {
      dispose?: () => void;
      uniforms?: Record<string, { value: unknown }>;
    };
    Vector3: new (x?: number, y?: number, z?: number) => {
      copy: (value: unknown) => unknown;
      x: number;
      y: number;
      z: number;
    };
  };
};

type DragState = {
  fovH: number;
  startY: number;
};

type CornerPose = {
  id: CornerId;
  position: string;
};

type ViewportPlane = {
  corners: CornerPose[];
  rotation: string;
};

const ARC_RADIUS = 3.86;
const ARC_PLANE_SIZE = 0.42;
const DEG_TO_RAD = Math.PI / 180;

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function emitFov(fovH: number) {
  window.dispatchEvent(
    new CustomEvent(WEBXR_CROP_MASK_FOV_EVENT, {
      detail: {
        fovH
      }
    })
  );
}

function pointerY(event: Event) {
  const detail = (event as CustomEvent<{ mouseEvent?: MouseEvent }>).detail;
  if (detail?.mouseEvent) {
    return detail.mouseEvent.clientY;
  }
  if ("clientY" in event && typeof (event as MouseEvent).clientY === "number") {
    return (event as MouseEvent).clientY;
  }
  return null;
}

function cornerIndex(corner: CornerId) {
  return ["top-left", "top-right", "bottom-right", "bottom-left"].indexOf(corner);
}

function vecString(x: number, y: number, z: number) {
  return `${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`;
}

function computeViewportPlane(state: CropMaskState): ViewportPlane {
  const halfH = Math.tan((state.fov.h * DEG_TO_RAD) / 2);
  const halfV = Math.tan((state.fov.v * DEG_TO_RAD) / 2);
  const corners: Array<{ id: CornerId; x: number; y: number }> = [
    { id: "top-left", x: -halfH, y: halfV },
    { id: "top-right", x: halfH, y: halfV },
    { id: "bottom-right", x: halfH, y: -halfV },
    { id: "bottom-left", x: -halfH, y: -halfV }
  ];

  return {
    corners: corners.map((corner) => ({
      id: corner.id,
      position: vecString(corner.x * ARC_RADIUS, corner.y * ARC_RADIUS, -ARC_RADIUS)
    })),
    // A-Frame's positive Y rotation turns the -Z viewport opposite to the mask shader's yaw convention.
    rotation: `${state.center.pitch.toFixed(3)} ${(-state.center.yaw).toFixed(3)} 0`
  };
}

function registerCropViewportArcComponents() {
  const aframe = window.AFRAME as AFrameRuntime | undefined;

  if (!aframe || aframe.components?.["crop-viewport-arc-plane"]) {
    return;
  }

  aframe.registerComponent("crop-viewport-arc-plane", {
    schema: {
      active: { default: false },
      corner: { default: 0 }
    },
    init: function init(this: {
      data: { active: boolean; corner: number };
      el: {
        removeObject3D?: (name: string) => void;
        setObject3D?: (name: string, object: unknown) => void;
      };
      material?: { dispose?: () => void; uniforms?: Record<string, { value: unknown }> };
    }) {
      const THREE = aframe.THREE;
      if (!THREE) {
        return;
      }

      const geometry = new THREE.PlaneGeometry(ARC_PLANE_SIZE, ARC_PLANE_SIZE);
      const material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        transparent: true,
        uniforms: {
          uActive: { value: this.data.active ? 1 : 0 },
          uCorner: { value: this.data.corner },
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;

          uniform float uActive;
          uniform float uCorner;
          uniform float uTime;
          varying vec2 vUv;

          vec2 rotateCornerUv(vec2 uv, float corner) {
            if (corner < 0.5) {
              return uv;
            }
            if (corner < 1.5) {
              return vec2(1.0 - uv.y, uv.x);
            }
            if (corner < 2.5) {
              return vec2(1.0 - uv.x, 1.0 - uv.y);
            }
            return vec2(uv.y, 1.0 - uv.x);
          }

          void main() {
            vec2 uv = rotateCornerUv(vUv, uCorner);
            vec2 p = uv - vec2(1.0, 0.0);
            float dist = length(p);
            float angleMask = smoothstep(0.02, 0.08, uv.x) * smoothstep(0.02, 0.08, 1.0 - uv.y);
            float arc = exp(-pow((dist - 0.72) / 0.026, 2.0)) * angleMask;
            float halo = exp(-pow((dist - 0.72) / 0.09, 2.0)) * angleMask;
            float breath = 0.72 + sin(uTime * 0.0036) * 0.18 + uActive * 0.22;
            float alpha = max(arc * 0.96, halo * 0.18) * breath;
            vec3 color = vec3(0.9, 0.97, 1.0) * (0.75 + arc * 0.55 + uActive * 0.32);
            if (alpha < 0.01) {
              discard;
            }
            gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
          }
        `
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 42;
      this.material = material;
      this.el.setObject3D?.("mesh", mesh);
    },
    remove: function remove(this: {
      el: { removeObject3D?: (name: string) => void };
      material?: { dispose?: () => void };
    }) {
      this.material?.dispose?.();
      this.el.removeObject3D?.("mesh");
    },
    tick: function tick(this: {
      data: { active: boolean; corner: number };
      material?: { uniforms?: Record<string, { value: unknown }> };
    }, time: number) {
      const uniforms = this.material?.uniforms;
      if (!uniforms) {
        return;
      }
      uniforms.uActive.value = this.data.active ? 1 : 0;
      uniforms.uCorner.value = this.data.corner;
      uniforms.uTime.value = time;
    }
  });
}

export function AFrameCropViewportArcs() {
  const [registered, setRegistered] = useState(false);
  const [state, setState] = useState<CropMaskState>(() => ({
    aspect: "16:9",
    center: { yaw: 0, pitch: 0 },
    cut: false,
    enabled: true,
    fov: { h: DEFAULT_CROP_FOV_H, v: verticalFovFromHorizontal(DEFAULT_CROP_FOV_H) },
    input: "keyboard",
    locked: true,
    maskOpacity: 0.74,
    roll: 0,
    smoothFollow: false,
    source: "crop-mask-preview",
    version: 1,
    videoTimeMs: 0
  }));
  const [hovered, setHovered] = useState<CornerId | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    registerCropViewportArcComponents();
    setRegistered(true);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<CropMaskState>).detail;
      if (detail?.fov) {
        setState(detail);
      }
    };

    window.addEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
    return () => window.removeEventListener(WEBXR_CROP_MASK_CHANGE_EVENT, listener);
  }, []);

  useEffect(() => {
    const move = (event: MouseEvent | PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      const deltaY = event.clientY - drag.startY;
      const nextFov = clamp(drag.fovH + deltaY * 0.18, MIN_CROP_FOV_H, MAX_CROP_FOV_H);
      emitFov(nextFov);
      event.preventDefault();
    };

    const up = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const arcFromEvent = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const arc = target?.closest?.("[data-crop-arc-id]") as HTMLElement | null;
      return (arc?.dataset.cropArcId as CornerId | undefined) ?? null;
    };

    const over = (event: Event) => {
      const arc = arcFromEvent(event);
      if (arc) {
        setHovered(arc);
      }
    };

    const out = (event: Event) => {
      const arc = arcFromEvent(event);
      if (arc) {
        setHovered((value) => (value === arc ? null : value));
      }
    };

    const down = (event: Event) => {
      const arc = arcFromEvent(event);
      const y = pointerY(event);
      if (!arc || y === null) {
        return;
      }
      dragRef.current = { fovH: state.fov.h, startY: y };
      setHovered(arc);
      event.preventDefault();
    };

    root.addEventListener("mouseover", over);
    root.addEventListener("mouseout", out);
    root.addEventListener("mousedown", down);
    root.addEventListener("pointerdown", down);
    return () => {
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseout", out);
      root.removeEventListener("mousedown", down);
      root.removeEventListener("pointerdown", down);
    };
  }, [state.fov.h]);

  const viewportPlane = useMemo(() => computeViewportPlane(state), [state]);

  if (!registered) {
    return null;
  }

  return createElement(
    "a-entity",
    {
      "data-testid": "aframe-crop-viewport-arcs",
      ref: rootRef,
      rotation: viewportPlane.rotation
    },
    ...viewportPlane.corners.map((corner) => {
      const active = hovered === corner.id || Boolean(dragRef.current);
      const scale = active ? 1.26 : 1;
      return createElement("a-entity", {
        "crop-viewport-arc-plane": `corner: ${cornerIndex(corner.id)}; active: ${active}`,
        className: "clickable",
        "data-crop-arc-id": corner.id,
        "data-testid": `aframe-crop-arc-${corner.id}`,
        key: corner.id,
        position: corner.position,
        scale: `${scale} ${scale} ${scale}`
      });
    })
  );
}
