import type { EffectEventName } from "@/lib/path-protocol";
import type { PcEditorEffectSpec } from "./types";

const EFFECT_SPECS = {
  "black-fade": {
    defaultDurationMs: 900,
    defaultParams: {
      peakOpacity: 1
    },
    engine: "frame-effect",
    eventName: "transition.fade_black" as EffectEventName,
    family: "transition",
    id: "black-fade",
    inputs: {
      state: ["playback", "viewTarget", "cropMask", "maskViewportBounds", "effectInput"]
    },
    label: "Black fade",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      conflictGroup: "frame.occlusion",
      fallback: "warn",
      priority: 80,
      stage: "post_remap_frame"
    }
  },
  "white-fade": {
    defaultDurationMs: 720,
    defaultParams: {
      color: "#ffffff",
      peakOpacity: 0.92
    },
    engine: "frame-effect",
    eventName: "transition.flash_white" as EffectEventName,
    family: "transition",
    id: "white-fade",
    inputs: {
      state: ["playback", "viewTarget", "cropMask", "maskViewportBounds", "effectInput"]
    },
    label: "White fade",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      conflictGroup: "frame.occlusion",
      fallback: "warn",
      priority: 75,
      stage: "post_remap_frame"
    }
  },
  "soft-blur": {
    defaultDurationMs: 760,
    defaultParams: {
      edgeMs: 180,
      radius: 21,
      strength: 0.48
    },
    engine: "frame-effect",
    eventName: "filter.blur" as EffectEventName,
    family: "filter",
    id: "soft-blur",
    inputs: {
      state: ["playback", "viewTarget", "cropMask", "maskViewportBounds"]
    },
    label: "Soft blur",
    preview: {
      accuracy: "approximate",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "post_remap_frame"
    }
  },
  "hero-push": {
    defaultDurationMs: 900,
    defaultParams: {
      curve: "easeOutBackSoft",
      deltaFovH: -10,
      peakAtRatio: 0.72,
      reboundFovH: 1
    },
    engine: "view-path",
    eventName: "frame.hero_push" as EffectEventName,
    family: "camera-motion",
    id: "hero-push",
    inputs: {
      state: ["playback", "viewTarget", "cropMask"]
    },
    label: "Hero push",
    preview: {
      accuracy: "exact",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "reveal-pull": {
    defaultDurationMs: 1400,
    defaultParams: {
      curve: "easeInOutCubic",
      deltaFovH: 14,
      deltaPitch: 2
    },
    engine: "view-path",
    eventName: "frame.reveal_pull" as EffectEventName,
    family: "camera-motion",
    id: "reveal-pull",
    inputs: {
      state: ["playback", "viewTarget", "cropMask"]
    },
    label: "Reveal pull",
    preview: {
      accuracy: "exact",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "little-planet": {
    defaultDurationMs: 1600,
    defaultParams: {
      peakAtMs: 560,
      peakPitch: -88,
      peakSphereFov: 175,
      previewFlightHeight: 46.8,
      previewFov: 138,
      previewPitch: -90
    },
    engine: "frame-effect",
    eventName: "frame.little_planet_pullback" as EffectEventName,
    family: "distortion",
    id: "little-planet",
    inputs: {
      state: ["playback", "sphereView", "xrCameraRigPose"]
    },
    label: "Little planet",
    preview: {
      accuracy: "approximate",
      pc: "symbolic",
      target: "sphere",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "pre_remap_equirect"
    }
  },
  "crystal-ball": {
    defaultDurationMs: 1900,
    defaultParams: {
      centerPitch: 88,
      peakAtMs: 760,
      peakSphereFov: 165,
      previewFlightHeight: 34,
      previewFov: 145,
      previewMaskFov: 178,
      previewMaskPitch: -78,
      previewPitch: -82,
      roll: 180
    },
    engine: "frame-effect",
    eventName: "frame.crystal_ball_pull" as EffectEventName,
    family: "distortion",
    id: "crystal-ball",
    inputs: {
      state: ["playback", "sphereView", "xrCameraRigPose"]
    },
    label: "Crystal ball",
    preview: {
      accuracy: "approximate",
      pc: "symbolic",
      target: "sphere",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "pre_remap_equirect"
    }
  },
  "drift-left-parallax": {
    defaultDurationMs: 1600,
    defaultParams: {
      curve: "easeInOutSine",
      deltaFovH: -3,
      deltaYaw: -8
    },
    engine: "view-path",
    eventName: "frame.drift_left_parallax" as EffectEventName,
    family: "camera-motion",
    id: "drift-left-parallax",
    inputs: {
      state: ["playback", "viewTarget", "cropMask"]
    },
    label: "Drift left",
    preview: {
      accuracy: "exact",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "impact-shake": {
    defaultDurationMs: 620,
    defaultParams: {
      amplitudePitch: 1.4,
      amplitudeYaw: 2.6,
      decay: 0.62,
      shakes: 4
    },
    engine: "view-path",
    eventName: "frame.impact_shake" as EffectEventName,
    family: "camera-motion",
    id: "impact-shake",
    inputs: {
      state: ["playback", "viewTarget", "cropMask"]
    },
    label: "Impact shake",
    preview: {
      accuracy: "exact",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "look-around": {
    defaultDurationMs: 2200,
    defaultParams: {
      returnYaw: -10,
      sweepYaw: 28,
      widenFovH: 3
    },
    engine: "view-path",
    eventName: "frame.look_around" as EffectEventName,
    family: "camera-motion",
    id: "look-around",
    inputs: {
      state: ["playback", "viewTarget", "cropMask"]
    },
    label: "Look around",
    preview: {
      accuracy: "exact",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "dolly-zoom": {
    defaultDurationMs: 1700,
    defaultParams: {
      peakAtMs: 820,
      peakDeltaFovH: -18,
      previewDollyDistance: -6.5,
      previewFov: 64,
      previewMaskFovDelta: -18
    },
    engine: "view-path",
    eventName: "frame.dolly_zoom" as EffectEventName,
    family: "camera-motion",
    id: "dolly-zoom",
    inputs: {
      state: ["playback", "viewTarget", "cropMask", "sphereView", "xrCameraRigPose"]
    },
    label: "Dolly zoom",
    preview: {
      accuracy: "approximate",
      pc: "symbolic",
      target: "sphere",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "viewport_path"
    }
  },
  "rgb-split": {
    defaultDurationMs: 520,
    defaultParams: {
      edgeMs: 110,
      offsetPx: 14,
      strength: 0.88
    },
    engine: "frame-effect",
    eventName: "filter.chromatic_aberration" as EffectEventName,
    family: "glitch",
    id: "rgb-split",
    inputs: {
      state: ["playback", "viewTarget", "cropMask", "maskViewportBounds"]
    },
    label: "RGB split",
    preview: {
      accuracy: "approximate",
      pc: "canvas",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "post_remap_frame"
    }
  },
  "text-title": {
    defaultDurationMs: 2400,
    defaultParams: {
      backgroundOpacity: 0.45,
      position: "bottom_center",
      text: "TEXT"
    },
    engine: "overlay",
    eventName: "overlay.text" as EffectEventName,
    family: "overlay",
    id: "text-title",
    inputs: {
      assets: ["font"],
      state: ["playback", "viewTarget"]
    },
    label: "Text title",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "overlay_frame"
    }
  },
  "letterbox-bars": {
    defaultDurationMs: 1800,
    defaultParams: {
      opacity: 1,
      ratio: 0.12
    },
    engine: "overlay",
    eventName: "overlay.letterbox" as EffectEventName,
    family: "overlay",
    id: "letterbox-bars",
    inputs: {
      state: ["playback", "viewTarget"]
    },
    label: "Letterbox",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      conflictGroup: "frame.matte",
      fallback: "warn",
      stage: "overlay_frame"
    }
  },
  "portal-ring": {
    defaultDurationMs: 1800,
    defaultParams: {
      color: "#00d8ff",
      coreColor: "#05061f",
      opacity: 0.92,
      radius: 0.31,
      secondaryColor: "#ff4dff",
      thickness: 0.035
    },
    engine: "overlay",
    eventName: "overlay.portal_ring" as EffectEventName,
    family: "light-particle",
    id: "portal-ring",
    inputs: {
      state: ["playback", "viewTarget"]
    },
    label: "Portal ring",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "overlay_frame"
    }
  },
  "time-vortex": {
    defaultDurationMs: 2200,
    defaultParams: {
      color: "#4be3ff",
      coreColor: "#02030d",
      opacity: 0.86,
      radius: 0.36,
      secondaryColor: "#9a4dff"
    },
    engine: "overlay",
    eventName: "overlay.time_vortex" as EffectEventName,
    family: "light-particle",
    id: "time-vortex",
    inputs: {
      state: ["playback", "viewTarget"]
    },
    label: "Time vortex",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "overlay_frame"
    }
  },
  "explosion-sticker": {
    defaultDurationMs: 900,
    defaultParams: {
      color: "#fff0a0",
      emberColor: "#ff1f00",
      opacity: 0.95,
      radius: 0.34,
      secondaryColor: "#ff6a00",
      smokeColor: "#282018"
    },
    engine: "overlay",
    eventName: "overlay.explosion_sticker" as EffectEventName,
    family: "light-particle",
    id: "explosion-sticker",
    inputs: {
      state: ["playback", "viewTarget"]
    },
    label: "Explosion sticker",
    preview: {
      accuracy: "approximate",
      pc: "dom",
      target: "viewport-mask",
      vr: "aframe-shader"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "overlay_frame"
    }
  },
  "beat-marker": {
    engine: "audio",
    family: "audio-beat",
    id: "beat-marker",
    inputs: {
      state: ["playback"]
    },
    label: "Beat marker",
    preview: {
      accuracy: "symbolic",
      pc: "dom",
      target: "screen",
      vr: "world-layer"
    },
    render: {
      backendSupport: "supported",
      fallback: "warn",
      stage: "audio_timeline"
    }
  },
  hotspot: {
    engine: "xr-spatial",
    family: "xr-spatial",
    id: "hotspot",
    inputs: {
      state: ["cameraPose", "xrSession", "viewTarget"]
    },
    label: "Hotspot",
    preview: {
      accuracy: "exact",
      pc: "symbolic",
      target: "sphere",
      vr: "aframe-entity"
    },
    render: {
      backendSupport: "unsupported",
      fallback: "ignore",
      stage: "xr_runtime_only"
    }
  }
} satisfies Record<string, PcEditorEffectSpec>;

export type KnownPcEditorEffectId = keyof typeof EFFECT_SPECS;

export function getPcEditorEffectSpec(effectId: string): PcEditorEffectSpec | null {
  return EFFECT_SPECS[effectId as KnownPcEditorEffectId] ?? null;
}

export function listPcEditorEffectSpecs(): PcEditorEffectSpec[] {
  return Object.values(EFFECT_SPECS);
}
