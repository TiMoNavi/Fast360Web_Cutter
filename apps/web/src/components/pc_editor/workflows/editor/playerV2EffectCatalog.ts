import type { EffectEventName } from "@/lib/path-protocol";

type PlayerV2EffectDefinition = {
  durationMs?: number;
  eventName: EffectEventName;
  params?: Record<string, unknown>;
};

const PLAYER_V2_EFFECTS: Record<string, PlayerV2EffectDefinition> = {
  "black-fade": { durationMs: 900, eventName: "transition.fade_black" },
  "white-fade": { durationMs: 720, eventName: "transition.flash_white", params: { color: "#ffffff", peakOpacity: 0.92 } },
  "flash-cut": { durationMs: 260, eventName: "transition.flash_white", params: { color: "#ffffff", peakOpacity: 0.96 } },
  "neon-wipe": { durationMs: 900, eventName: "highlight", params: { tint: "cyan" } },
  "grid-dissolve": { durationMs: 900, eventName: "filter.blur", params: { strength: 0.42 } },
  "vhs-blank": { durationMs: 700, eventName: "black.solid" },

  "cyan-boost": { eventName: "filter.color_grade", params: { tint: "cyan" } },
  "magenta-wash": { eventName: "filter.color_grade", params: { tint: "magenta" } },
  "sunset-grade": { eventName: "filter.color_grade", params: { tint: "sunset" } },
  "cold-chrome": { eventName: "filter.color_grade", params: { tint: "chrome" } },
  "warm-vhs": { eventName: "filter.color_grade", params: { tint: "warm" } },
  "soft-blur": { durationMs: 760, eventName: "filter.blur", params: { edgeMs: 180, radius: 21, strength: 0.48 } },

  "speed-ramp": { eventName: "speed.ramp" },
  "slow-drift": { eventName: "speed.slow_drift" },
  "freeze-frame": { eventName: "speed.freeze_frame" },
  "beat-stutter": { eventName: "speed.beat_stutter" },
  "reverse-hit": { eventName: "speed.reverse_hit" },
  "time-skip": { eventName: "speed.time_skip" },

  "hero-push": {
    durationMs: 900,
    eventName: "frame.hero_push",
    params: { curve: "easeOutBackSoft", deltaFovH: -10, peakAtRatio: 0.72, reboundFovH: 1 }
  },
  "reveal-pull": {
    durationMs: 1400,
    eventName: "frame.reveal_pull",
    params: { curve: "easeInOutCubic", deltaFovH: 14, deltaPitch: 2 }
  },
  "little-planet": {
    durationMs: 1600,
    eventName: "frame.little_planet_pullback",
    params: { peakAtMs: 560, peakPitch: -88, peakSphereFov: 175, previewFlightHeight: 46.8, previewFov: 138, previewPitch: -90 }
  },
  "crystal-ball": {
    durationMs: 1900,
    eventName: "frame.crystal_ball_pull",
    params: { centerPitch: 88, peakAtMs: 760, peakSphereFov: 165, previewFlightHeight: 34, previewFov: 145, previewMaskFov: 178, previewMaskPitch: -78, previewPitch: -82, roll: 180 }
  },
  "drift-left-parallax": {
    durationMs: 1600,
    eventName: "frame.drift_left_parallax",
    params: { curve: "easeInOutSine", deltaFovH: -3, deltaYaw: -8 }
  },
  "impact-shake": {
    durationMs: 620,
    eventName: "frame.impact_shake",
    params: { amplitudePitch: 1.4, amplitudeYaw: 2.6, decay: 0.62, shakes: 4 }
  },
  "look-around": {
    durationMs: 2200,
    eventName: "frame.look_around",
    params: { returnYaw: -10, sweepYaw: 28, widenFovH: 3 }
  },
  "dolly-zoom": {
    durationMs: 1700,
    eventName: "frame.dolly_zoom",
    params: { peakAtMs: 820, peakDeltaFovH: -18, previewDollyDistance: -6.5, previewFov: 64, previewMaskFovDelta: -18 }
  },
  "push-in": { eventName: "frame.hero_push", params: { deltaFovH: -10, reboundFovH: 1 } },
  "pull-out": { eventName: "frame.reveal_pull", params: { deltaFovH: 14, deltaPitch: 2 } },
  "roll-pulse": { eventName: "frame.impact_shake", params: { amplitudePitch: 1.4, amplitudeYaw: 2.6, shakes: 4 } },
  "focus-box": { eventName: "highlight" },
  "edge-vignette": { eventName: "filter.vignette" },

  "rgb-split": { durationMs: 520, eventName: "filter.chromatic_aberration", params: { edgeMs: 110, offsetPx: 14, strength: 0.88 } },
  "scan-tear": { eventName: "glitch.scan_tear" },
  datamosh: { eventName: "glitch.datamosh" },
  "noise-burst": { eventName: "glitch.noise_burst" },
  "signal-loss": { eventName: "glitch.signal_loss" },
  "pixel-shift": { eventName: "glitch.pixel_shift" },

  "beat-mark": { eventName: "marker.beat" },
  "cut-note": { eventName: "marker.cut_note" },
  "restore-here": { eventName: "marker.restore_here" },
  "discard-here": { eventName: "marker.discard_here" },
  "hero-shot": { eventName: "highlight" },
  "review-flag": { eventName: "marker.review_flag" },

  "text-title": { durationMs: 2400, eventName: "overlay.text", params: { backgroundOpacity: 0.45, position: "bottom_center", text: "TEXT" } },
  "letterbox-bars": { durationMs: 1800, eventName: "overlay.letterbox", params: { opacity: 1, ratio: 0.12 } },
  "portal-ring": {
    durationMs: 1800,
    eventName: "overlay.portal_ring",
    params: { color: "#00d8ff", coreColor: "#05061f", opacity: 0.92, radius: 0.31, secondaryColor: "#ff4dff", thickness: 0.035 }
  },
  "time-vortex": {
    durationMs: 2200,
    eventName: "overlay.time_vortex",
    params: { color: "#4be3ff", coreColor: "#02030d", opacity: 0.86, radius: 0.36, secondaryColor: "#9a4dff" }
  },
  "explosion-sticker": {
    durationMs: 900,
    eventName: "overlay.explosion_sticker",
    params: { color: "#fff0a0", emberColor: "#ff1f00", opacity: 0.95, radius: 0.34, secondaryColor: "#ff6a00", smokeColor: "#282018" }
  }
};

export function resolvePlayerV2Effect(effectId: string): PlayerV2EffectDefinition {
  return PLAYER_V2_EFFECTS[effectId] ?? { eventName: effectId as EffectEventName };
}
