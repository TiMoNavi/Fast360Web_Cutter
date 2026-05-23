"use client";

import { createElement } from "react";

type Vector3Like = {
  x: number;
  y: number;
  z: number;
  copy: (value: unknown) => Vector3Like;
  normalize: () => Vector3Like;
};

type AFrameRuntime = {
  components?: Record<string, unknown>;
  registerComponent: (name: string, definition: Record<string, unknown>) => void;
  THREE?: {
    AdditiveBlending: unknown;
    ACESFilmicToneMapping: unknown;
    DoubleSide: unknown;
    ShaderMaterial: new (parameters: Record<string, unknown>) => unknown;
    SRGBColorSpace: unknown;
    Vector2: new (x?: number, y?: number) => { set: (x: number, y: number) => void };
    Vector3: new (x?: number, y?: number, z?: number) => Vector3Like;
  };
};

type DeprecatedVisionGlassPanelProps = {
  loginMode: "idle" | "email" | "guest";
  onEmail: () => void;
  onGuest: () => void;
  onReset: () => void;
};

declare global {
  interface Window {
    AFRAME?: unknown;
  }
}

/**
 * @deprecated
 * Archived Apple/visionOS-inspired spatial glass experiment.
 *
 * This approach used A-Frame planes plus custom Three.js ShaderMaterial layers to
 * fake mist, Fresnel highlights, inner rim light, and ACES-style tone mapping.
 * The active XR login visual direction moved to DOM/CSS glassmorphism because it
 * is faster to tune and produces more predictable typography, radii, shadows,
 * and button states.
 *
 * Keep this file as a reference for future true-WebGL glass work. Do not import
 * it into production routes unless the design direction explicitly returns to
 * shader-based spatial glass.
 */
export function registerDeprecatedVisionGlassComponents() {
  const aframe = window.AFRAME as AFrameRuntime | undefined;

  if (!aframe) {
    return;
  }

  if (!aframe.components?.["deprecated-vision-glass-renderer"]) {
    aframe.registerComponent("deprecated-vision-glass-renderer", {
      schema: {
        exposure: { default: 1.32 }
      },
      init: function init(this: {
        data: { exposure: number };
        el: {
          addEventListener: (eventName: string, handler: () => void, options?: { once?: boolean }) => void;
          renderer?: { toneMapping?: unknown; toneMappingExposure?: number; outputColorSpace?: unknown };
        };
      }) {
        const applyRendererSettings = () => {
          const renderer = this.el.renderer;
          const THREE = aframe.THREE;

          if (!renderer || !THREE) {
            return;
          }

          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = this.data.exposure;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
        };

        applyRendererSettings();
        this.el.addEventListener("render-target-loaded", applyRendererSettings, { once: true });
      }
    });
  }

  if (aframe.components?.["deprecated-vision-glass-layer"]) {
    return;
  }

  aframe.registerComponent("deprecated-vision-glass-layer", {
    schema: {
      variant: { default: "glass" },
      opacity: { default: 0.5 },
      aspect: { default: 1.6 }
    },
    init: function init(this: {
      data: { variant: "mist" | "glass" | "control"; opacity: number; aspect: number };
      el: {
        addEventListener: (eventName: string, handler: () => void, options?: { once?: boolean }) => void;
        getObject3D: (name: "mesh") => { material?: unknown; worldToLocal?: (value: unknown) => unknown } | undefined;
        sceneEl?: { camera?: unknown };
      };
      material?: { uniforms?: Record<string, { value: unknown }> };
      cameraPosition?: Vector3Like;
      viewShift?: { set: (x: number, y: number) => void };
    }) {
      const THREE = aframe.THREE;

      if (!THREE) {
        return;
      }

      this.cameraPosition = new THREE.Vector3();
      this.viewShift = new THREE.Vector2();

      const applyMaterial = () => {
        const mesh = this.el.getObject3D("mesh");

        if (!mesh) {
          return;
        }

        const isMist = this.data.variant === "mist";
        const isControl = this.data.variant === "control";
        const material = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: isMist ? THREE.AdditiveBlending : undefined,
          toneMapped: true,
          uniforms: {
            uAspect: { value: this.data.aspect },
            uOpacity: { value: this.data.opacity },
            uTime: { value: 0 },
            uViewShift: { value: this.viewShift },
            uFresnel: { value: 0 },
            uMist: { value: isMist ? 1 : 0 },
            uControl: { value: isControl ? 1 : 0 }
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

            uniform float uAspect;
            uniform float uOpacity;
            uniform float uTime;
            uniform vec2 uViewShift;
            uniform float uFresnel;
            uniform float uMist;
            uniform float uControl;
            varying vec2 vUv;

            float roundedRectSdf(vec2 p, vec2 halfSize, float radius) {
              vec2 q = abs(p) - halfSize + radius;
              return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
            }

            vec3 acesApprox(vec3 value) {
              value *= 1.34;
              return clamp((value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14), 0.0, 1.0);
            }

            void main() {
              vec2 uv = vUv;
              vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
              vec2 halfSize = mix(vec2(uAspect * 0.395, 0.315), vec2(uAspect * 0.405, 0.255), uControl);
              float radius = mix(0.185, 0.245, uControl);
              float sdf = roundedRectSdf(p, halfSize, radius);
              float feather = mix(0.065, 0.018, uControl);
              float mask = 1.0 - smoothstep(-feather, feather, sdf);
              float inner = 1.0 - smoothstep(-0.28, 0.08, sdf);
              float rim = (1.0 - smoothstep(0.0, mix(0.055, 0.026, uControl), abs(sdf))) * mask;
              float innerRim = (1.0 - smoothstep(0.0, mix(0.05, 0.026, uControl), abs(sdf + mix(0.045, 0.018, uControl)))) * mask;
              float radial = exp(-dot(p, p) * 2.1);
              float diagonal = exp(-pow(p.x * 0.54 - p.y * 0.82 + uViewShift.x * 0.45 - uViewShift.y * 0.2 + sin(uTime * 0.00028) * 0.05, 2.0) / 0.006);
              float grazing = clamp(uFresnel, 0.0, 1.0);

              vec3 pearl = vec3(0.94, 0.975, 1.0);
              vec3 blueMist = vec3(0.58, 0.73, 0.86);
              vec3 warmSpecular = vec3(1.0, 0.985, 0.91);

              if (uMist > 0.5) {
                float mistFalloff = 1.0 - smoothstep(0.28, 0.86, length(p / vec2(uAspect * 0.42, 0.4)));
                float drift = exp(-dot(p + vec2(sin(uTime * 0.00019) * 0.08, cos(uTime * 0.00023) * 0.04), p) * 3.2);
                float breath = 0.78 + sin(uTime * 0.00055) * 0.09;
                float mistAlpha = (radial * 0.72 + drift * 0.28) * mistFalloff * breath * uOpacity;
                vec3 mistColor = mix(blueMist, pearl, radial);

                if (mistAlpha < 0.01) {
                  discard;
                }

                gl_FragColor = vec4(acesApprox(mistColor * 0.95), mistAlpha);
                return;
              }

              vec3 virtualNormal = normalize(vec3(
                -p.x * 0.5 + uViewShift.x * 0.24,
                -p.y * 0.42 + uViewShift.y * 0.2,
                1.0
              ));
              vec3 viewDir = normalize(vec3(-uViewShift.x * 0.72, -uViewShift.y * 0.72, 1.0));
              vec3 keyLight = normalize(vec3(-0.42 + uViewShift.x * 0.3, 0.76 + uViewShift.y * 0.18, 0.92));
              vec3 fillLight = normalize(vec3(0.68 - uViewShift.x * 0.18, -0.24, 0.74));
              vec3 halfVector = normalize(viewDir + keyLight);

              float specularCore = pow(max(dot(virtualNormal, halfVector), 0.0), mix(72.0, 118.0, 1.0 - uControl));
              float specularBloom = pow(max(dot(virtualNormal, halfVector), 0.0), 14.0);
              float fillSpecular = pow(max(dot(virtualNormal, normalize(viewDir + fillLight)), 0.0), 32.0);
              float fresnel = pow(1.0 - max(dot(virtualNormal, viewDir), 0.0), 2.35);
              float sheen = diagonal * (0.36 + grazing * 0.74);
              float upperLeft = smoothstep(-0.35, 0.18, -p.x) * smoothstep(-0.35, 0.22, p.y);
              float topGlow = smoothstep(0.16, 1.0, uv.y) * 0.055 * mask;
              float controlLift = uControl * 0.34;

              float milk = (inner * 0.08 + radial * 0.15 + controlLift * 0.2) * mask;
              vec3 hdr = pearl * milk;
              hdr += blueMist * (0.028 + fresnel * 0.22 + rim * (0.16 + grazing * 0.24));
              hdr += warmSpecular * (specularCore * 6.4 + specularBloom * 1.08 + fillSpecular * 0.42 + sheen * 2.6);
              hdr += pearl * innerRim * mix(0.16 + upperLeft * 0.42, 1.35 + upperLeft * 2.1, uControl);
              hdr += pearl * topGlow;

              float alpha = (milk + rim * mix(0.08, 0.22, uControl) + innerRim * mix(0.06, 0.48, uControl) + fresnel * 0.13 + specularBloom * 0.2 + sheen * 0.28) * uOpacity;
              alpha *= mask;

              if (alpha < 0.012) {
                discard;
              }

              gl_FragColor = vec4(acesApprox(hdr), clamp(alpha, 0.0, 0.82));
            }
          `
        }) as { uniforms?: Record<string, { value: unknown }> };

        mesh.material = material;
        this.material = material;
      };

      if (this.el.getObject3D("mesh")) {
        applyMaterial();
      } else {
        this.el.addEventListener("loaded", applyMaterial, { once: true });
      }
    },
    tick: function tick(this: {
      data: { opacity: number; aspect: number };
      el: {
        getObject3D: (name: "mesh") => { material?: unknown; worldToLocal?: (value: unknown) => unknown } | undefined;
        sceneEl?: { camera?: unknown };
      };
      material?: { uniforms?: Record<string, { value: unknown }> };
      cameraPosition?: Vector3Like;
      viewShift?: { set: (x: number, y: number) => void };
    }, time: number) {
      const uniforms = this.material?.uniforms;

      if (!uniforms) {
        return;
      }

      uniforms.uTime.value = time;
      uniforms.uOpacity.value = this.data.opacity;
      uniforms.uAspect.value = this.data.aspect;

      const mesh = this.el.getObject3D("mesh");
      const camera = this.el.sceneEl?.camera;

      if (!mesh?.worldToLocal || !camera || !this.cameraPosition) {
        return;
      }

      const localCamera = mesh.worldToLocal(this.cameraPosition.copy((camera as { position: unknown }).position));
      const direction = this.cameraPosition.copy(localCamera).normalize();
      this.viewShift?.set(direction.x, direction.y);
      uniforms.uFresnel.value = 1 - Math.min(1, Math.abs(direction.z));
    }
  });
}

function deprecatedVisionGlassButton(label: string, position: string, onClick: () => void, testId: string) {
  return createElement(
    "a-entity",
    {
      className: "clickable",
      position,
      "data-testid": testId,
      onClick
    },
    createElement("a-plane", {
      position: "0 -0.012 -0.016",
      width: "0.62",
      height: "0.2",
      "deprecated-vision-glass-layer": "variant: mist; opacity: 0.13; aspect: 3.1"
    }),
    createElement("a-plane", {
      width: "0.58",
      height: "0.18",
      "deprecated-vision-glass-layer": "variant: control; opacity: 0.9; aspect: 3.22"
    }),
    createElement("a-text", {
      value: label,
      align: "center",
      color: "#1b2731",
      width: "1.35",
      position: "0 -0.018 0.036"
    })
  );
}

function deprecatedVisionGlassRoundButton(
  label: string,
  position: string,
  onClick: () => void,
  testId: string,
  active = false
) {
  return createElement(
    "a-entity",
    {
      className: "clickable",
      position,
      "data-testid": testId,
      onClick
    },
    createElement("a-plane", {
      position: "0 -0.008 -0.014",
      width: "0.17",
      height: "0.17",
      "deprecated-vision-glass-layer": "variant: mist; opacity: 0.14; aspect: 0.62"
    }),
    createElement("a-plane", {
      width: "0.145",
      height: "0.145",
      "deprecated-vision-glass-layer": `variant: control; opacity: ${active ? "1" : "0.78"}; aspect: 0.62`
    }),
    createElement("a-text", {
      value: label,
      align: "center",
      color: active ? "#17202a" : "#f9fbff",
      width: "0.46",
      position: "0 -0.014 0.04"
    })
  );
}

/**
 * @deprecated See registerDeprecatedVisionGlassComponents.
 */
export function DeprecatedVisionGlassLoginPanel({
  loginMode,
  onEmail,
  onGuest,
  onReset
}: DeprecatedVisionGlassPanelProps) {
  return createElement(
    "a-entity",
    {
      position: "0 1.46 -1.66",
      rotation: "-3 0 0",
      "data-testid": "deprecated-vision-glass-spatial-panel"
    },
    createElement("a-plane", {
      position: "0 -0.015 -0.052",
      width: "1.95",
      height: "1.28",
      "deprecated-vision-glass-layer": "variant: mist; opacity: 0.36; aspect: 1.52"
    }),
    createElement("a-plane", {
      position: "0 0 -0.012",
      width: "1.58",
      height: "0.98",
      "deprecated-vision-glass-layer": "variant: glass; opacity: 0.82; aspect: 1.61"
    }),
    deprecatedVisionGlassRoundButton("...", "0.44 0.51 0.072", onReset, "deprecated-spatial-menu-more", true),
    deprecatedVisionGlassRoundButton("in", "0.22 0.51 0.064", onEmail, "deprecated-spatial-menu-email"),
    deprecatedVisionGlassRoundButton("+", "0.66 0.51 0.064", onGuest, "deprecated-spatial-menu-plus"),
    createElement("a-text", {
      value: "Invisible Director",
      align: "center",
      color: "#18242d",
      width: "2.05",
      position: "0 0.255 0.044"
    }),
    createElement("a-text", {
      value: "XR sign in",
      align: "center",
      color: "#60707c",
      width: "1.42",
      position: "0 0.085 0.046"
    }),
    createElement("a-text", {
      value:
        loginMode === "email"
          ? "Email flow selected"
          : loginMode === "guest"
            ? "Guest flow selected"
            : "Soft glass access panel",
      align: "center",
      color: "#344653",
      width: "1.35",
      position: "0 -0.075 0.048"
    }),
    deprecatedVisionGlassButton("Email", "-0.32 -0.31 0.068", onEmail, "deprecated-spatial-email-login"),
    deprecatedVisionGlassButton("Guest", "0.32 -0.31 0.068", onGuest, "deprecated-spatial-guest-login")
  );
}
