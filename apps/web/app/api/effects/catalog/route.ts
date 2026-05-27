import { NextResponse, type NextRequest } from "next/server";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";

const categories = [
  { id: "transition", key: "1", label: "Transition" },
  { id: "color", key: "2", label: "Color" },
  { id: "speed", key: "3", label: "Speed" },
  { id: "frame", key: "4", label: "Frame" },
  { id: "glitch", key: "5", label: "Glitch" },
  { id: "marker", key: "6", label: "Marker" },
  { id: "overlay", key: "7", label: "Overlay" }
];

function defaultPreviewTarget(eventName: string, renderStage: string) {
  if (
    [
      "black.solid",
      "filter.blur",
      "filter.chromatic_aberration",
      "filter.color_grade",
      "filter.vignette",
      "overlay.letterbox",
      "overlay.text",
      "transition.fade_black",
      "transition.flash_white"
    ].includes(eventName)
  ) {
    return "viewport-mask";
  }

  return ["post_remap_frame", "overlay_frame"].includes(renderStage) ? "viewport-mask" : "screen";
}

function effect({
  categoryId,
  durationMs = 900,
  effectId,
  eventName,
  family,
  key,
  label,
  params = {},
  previewMode = "ui_overlay",
  previewSupport = "symbolic",
  previewTarget,
  renderStage = "post_remap_frame"
}: {
  categoryId: string;
  durationMs?: number;
  effectId: string;
  eventName: string;
  family: string;
  key: string;
  label: string;
  params?: Record<string, unknown>;
  previewMode?: string;
  previewSupport?: string;
  previewTarget?: string;
  renderStage?: string;
}) {
  const resolvedPreviewTarget = previewTarget ?? defaultPreviewTarget(eventName, renderStage);

  return {
    description: "",
    event: {
      defaultDurationMs: durationMs,
      defaultParams: params,
      name: eventName
    },
    family,
    id: effectId,
    label,
    operation: {
      eventType: "editor.effects.select",
      payload: {
        categoryId,
        durationMs,
        effectId,
        eventName,
        label,
        params,
        previewTarget: resolvedPreviewTarget
      },
      type: "pc-editor-event"
    },
    preview: {
      mode: previewMode,
      renderer: previewMode === "ui_overlay" ? "pc-effect-preview" : null,
      target: resolvedPreviewTarget,
      webxrSupport: previewSupport
    },
    render: {
      backendSupport: "supported",
      conflictGroup: null,
      fallback: "warn",
      stage: renderStage
    },
    ui: {
      categoryId,
      key,
      visible: true
    }
  };
}

const effects = [
  effect({ categoryId: "transition", effectId: "black-fade", eventName: "transition.fade_black", family: "transition", key: "1", label: "Black fade" }),
  effect({ categoryId: "transition", durationMs: 720, effectId: "white-fade", eventName: "transition.flash_white", family: "transition", key: "2", label: "White fade", params: { color: "#ffffff", peakOpacity: 0.92 } }),
  effect({ categoryId: "transition", durationMs: 260, effectId: "flash-cut", eventName: "transition.flash_white", family: "transition", key: "3", label: "Flash cut", params: { color: "#ffffff", peakOpacity: 0.96 } }),
  effect({ categoryId: "transition", effectId: "neon-wipe", eventName: "highlight", family: "transition", key: "4", label: "Neon wipe", params: { tint: "cyan" } }),
  effect({ categoryId: "transition", effectId: "grid-dissolve", eventName: "filter.blur", family: "transition", key: "5", label: "Grid dissolve", params: { strength: 0.42 } }),
  effect({ categoryId: "transition", durationMs: 700, effectId: "vhs-blank", eventName: "black.solid", family: "transition", key: "6", label: "VHS blank" }),
  effect({ categoryId: "color", effectId: "cyan-boost", eventName: "filter.color_grade", family: "color", key: "1", label: "Cyan boost", params: { tint: "cyan" } }),
  effect({ categoryId: "color", effectId: "magenta-wash", eventName: "filter.color_grade", family: "color", key: "2", label: "Magenta wash", params: { tint: "magenta" } }),
  effect({ categoryId: "color", effectId: "sunset-grade", eventName: "filter.color_grade", family: "color", key: "3", label: "Sunset grade", params: { tint: "sunset" } }),
  effect({ categoryId: "color", effectId: "cold-chrome", eventName: "filter.color_grade", family: "color", key: "4", label: "Cold chrome", params: { tint: "chrome" } }),
  effect({ categoryId: "color", effectId: "warm-vhs", eventName: "filter.color_grade", family: "color", key: "5", label: "Warm VHS", params: { tint: "warm" } }),
  effect({ categoryId: "color", durationMs: 760, effectId: "soft-blur", eventName: "filter.blur", family: "filter", key: "6", label: "Soft blur", params: { edgeMs: 180, radius: 21, strength: 0.48 } }),
  effect({ categoryId: "speed", effectId: "speed-ramp", eventName: "speed.ramp", family: "speed", key: "1", label: "Speed ramp", renderStage: "viewport_path" }),
  effect({ categoryId: "speed", effectId: "slow-drift", eventName: "speed.slow_drift", family: "speed", key: "2", label: "Slow drift", renderStage: "viewport_path" }),
  effect({ categoryId: "speed", effectId: "freeze-frame", eventName: "speed.freeze_frame", family: "speed", key: "3", label: "Freeze frame", renderStage: "viewport_path" }),
  effect({ categoryId: "speed", effectId: "beat-stutter", eventName: "speed.beat_stutter", family: "speed", key: "4", label: "Beat stutter", renderStage: "viewport_path" }),
  effect({ categoryId: "speed", effectId: "reverse-hit", eventName: "speed.reverse_hit", family: "speed", key: "5", label: "Reverse hit", renderStage: "viewport_path" }),
  effect({ categoryId: "speed", effectId: "time-skip", eventName: "speed.time_skip", family: "speed", key: "6", label: "Time skip", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", durationMs: 900, effectId: "hero-push", eventName: "frame.hero_push", family: "frame", key: "1", label: "Hero push", params: { deltaFovH: -10, reboundFovH: 1, peakAtRatio: 0.72, curve: "easeOutBackSoft" }, previewMode: "viewport_simulation", previewSupport: "exact", previewTarget: "viewport-mask", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", durationMs: 1400, effectId: "reveal-pull", eventName: "frame.reveal_pull", family: "frame", key: "2", label: "Reveal pull", params: { deltaFovH: 14, deltaPitch: 2, curve: "easeInOutCubic" }, previewMode: "viewport_simulation", previewSupport: "exact", previewTarget: "viewport-mask", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", durationMs: 1600, effectId: "drift-left-parallax", eventName: "frame.drift_left_parallax", family: "frame", key: "3", label: "Drift left", params: { deltaYaw: -8, deltaFovH: -3, curve: "easeInOutSine" }, previewMode: "viewport_simulation", previewSupport: "exact", previewTarget: "viewport-mask", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", durationMs: 620, effectId: "impact-shake", eventName: "frame.impact_shake", family: "frame", key: "4", label: "Impact shake", params: { amplitudePitch: 1.4, amplitudeYaw: 2.6, decay: 0.62, shakes: 4 }, previewMode: "viewport_simulation", previewSupport: "exact", previewTarget: "viewport-mask", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", effectId: "focus-box", eventName: "highlight", family: "frame", key: "5", label: "Focus box" }),
  effect({ categoryId: "frame", effectId: "edge-vignette", eventName: "filter.vignette", family: "frame", key: "6", label: "Edge vignette" }),
  effect({ categoryId: "frame", durationMs: 1600, effectId: "little-planet", eventName: "frame.little_planet_pullback", family: "frame", key: "7", label: "Little planet", params: { peakAtMs: 560, peakPitch: -88, peakSphereFov: 175, previewFlightHeight: 46.8, previewFov: 138, previewPitch: -90 }, previewMode: "sphere_overlay", previewSupport: "approximate", previewTarget: "sphere", renderStage: "pre_remap_equirect" }),
  effect({ categoryId: "frame", durationMs: 1900, effectId: "crystal-ball", eventName: "frame.crystal_ball_pull", family: "frame", key: "8", label: "Crystal ball", params: { centerPitch: 88, peakAtMs: 760, peakSphereFov: 165, previewFlightHeight: 34, previewFov: 145, previewMaskFov: 178, previewMaskPitch: -78, previewPitch: -82, roll: 180 }, previewMode: "sphere_overlay", previewSupport: "approximate", previewTarget: "sphere", renderStage: "pre_remap_equirect" }),
  effect({ categoryId: "frame", durationMs: 2200, effectId: "look-around", eventName: "frame.look_around", family: "frame", key: "9", label: "Look around", params: { returnYaw: -10, sweepYaw: 28, widenFovH: 3 }, previewMode: "viewport_simulation", previewSupport: "exact", previewTarget: "viewport-mask", renderStage: "viewport_path" }),
  effect({ categoryId: "frame", durationMs: 1700, effectId: "dolly-zoom", eventName: "frame.dolly_zoom", family: "frame", key: "0", label: "Dolly zoom", params: { peakAtMs: 820, peakDeltaFovH: -18, previewDollyDistance: -6.5, previewFov: 64, previewMaskFovDelta: -18 }, previewMode: "sphere_overlay", previewSupport: "approximate", previewTarget: "sphere", renderStage: "viewport_path" }),
  effect({ categoryId: "glitch", durationMs: 520, effectId: "rgb-split", eventName: "filter.chromatic_aberration", family: "glitch", key: "1", label: "RGB split", params: { edgeMs: 110, offsetPx: 14, strength: 0.88 } }),
  effect({ categoryId: "glitch", effectId: "scan-tear", eventName: "glitch.scan_tear", family: "glitch", key: "2", label: "Scan tear" }),
  effect({ categoryId: "glitch", effectId: "datamosh", eventName: "glitch.datamosh", family: "glitch", key: "3", label: "Datamosh" }),
  effect({ categoryId: "glitch", effectId: "noise-burst", eventName: "glitch.noise_burst", family: "glitch", key: "4", label: "Noise burst" }),
  effect({ categoryId: "glitch", effectId: "signal-loss", eventName: "glitch.signal_loss", family: "glitch", key: "5", label: "Signal loss" }),
  effect({ categoryId: "glitch", effectId: "pixel-shift", eventName: "glitch.pixel_shift", family: "glitch", key: "6", label: "Pixel shift" }),
  effect({ categoryId: "marker", effectId: "beat-mark", eventName: "marker.beat", family: "marker", key: "1", label: "Beat mark", renderStage: "marker_only" }),
  effect({ categoryId: "marker", effectId: "cut-note", eventName: "marker.cut_note", family: "marker", key: "2", label: "Cut note", renderStage: "marker_only" }),
  effect({ categoryId: "marker", effectId: "restore-here", eventName: "marker.restore_here", family: "marker", key: "3", label: "Restore here", renderStage: "marker_only" }),
  effect({ categoryId: "marker", effectId: "discard-here", eventName: "marker.discard_here", family: "marker", key: "4", label: "Discard here", renderStage: "marker_only" }),
  effect({ categoryId: "marker", effectId: "hero-shot", eventName: "highlight", family: "marker", key: "5", label: "Hero shot" }),
  effect({ categoryId: "marker", effectId: "review-flag", eventName: "marker.review_flag", family: "marker", key: "6", label: "Review flag", renderStage: "marker_only" }),
  effect({
    categoryId: "overlay",
    durationMs: 2400,
    effectId: "text-title",
    eventName: "overlay.text",
    family: "overlay",
    key: "1",
    label: "Text title",
    params: { backgroundOpacity: 0.45, position: "bottom_center", text: "TEXT" },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 1800,
    effectId: "letterbox-bars",
    eventName: "overlay.letterbox",
    family: "overlay",
    key: "2",
    label: "Letterbox",
    params: { opacity: 1, ratio: 0.12 },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 1800,
    effectId: "portal-ring",
    eventName: "overlay.portal_ring",
    family: "overlay",
    key: "3",
    label: "Portal ring",
    params: { color: "#00d8ff", coreColor: "#05061f", opacity: 0.92, radius: 0.31, secondaryColor: "#ff4dff", thickness: 0.035 },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 2200,
    effectId: "time-vortex",
    eventName: "overlay.time_vortex",
    family: "overlay",
    key: "4",
    label: "Time vortex",
    params: { color: "#4be3ff", coreColor: "#02030d", opacity: 0.86, radius: 0.36, secondaryColor: "#9a4dff" },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 900,
    effectId: "explosion-sticker",
    eventName: "overlay.explosion_sticker",
    family: "overlay",
    key: "5",
    label: "Explosion sticker",
    params: { color: "#fff0a0", emberColor: "#ff1f00", opacity: 0.95, radius: 0.34, secondaryColor: "#ff6a00", smokeColor: "#282018" },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  })
];

const littlePlanetEffect = effect({
  categoryId: "frame",
  durationMs: 1600,
  effectId: "little-planet",
  eventName: "frame.little_planet_pullback",
  family: "frame",
  key: "7",
  label: "Little planet",
  params: { peakAtMs: 560, peakPitch: -88, peakSphereFov: 175, previewFlightHeight: 46.8, previewFov: 138, previewPitch: -90 },
  previewMode: "sphere_overlay",
  previewSupport: "approximate",
  previewTarget: "sphere",
  renderStage: "pre_remap_equirect"
});

const crystalBallEffect = effect({
  categoryId: "frame",
  durationMs: 1900,
  effectId: "crystal-ball",
  eventName: "frame.crystal_ball_pull",
  family: "frame",
  key: "8",
  label: "Crystal ball",
  params: { centerPitch: 88, peakAtMs: 760, peakSphereFov: 165, previewFlightHeight: 34, previewFov: 145, previewMaskFov: 178, previewMaskPitch: -78, previewPitch: -82, roll: 180 },
  previewMode: "sphere_overlay",
  previewSupport: "approximate",
  previewTarget: "sphere",
  renderStage: "pre_remap_equirect"
});

const lookAroundEffect = effect({
  categoryId: "frame",
  durationMs: 2200,
  effectId: "look-around",
  eventName: "frame.look_around",
  family: "frame",
  key: "9",
  label: "Look around",
  params: { returnYaw: -10, sweepYaw: 28, widenFovH: 3 },
  previewMode: "viewport_simulation",
  previewSupport: "exact",
  previewTarget: "viewport-mask",
  renderStage: "viewport_path"
});

const dollyZoomEffect = effect({
  categoryId: "frame",
  durationMs: 1700,
  effectId: "dolly-zoom",
  eventName: "frame.dolly_zoom",
  family: "frame",
  key: "0",
  label: "Dolly zoom",
  params: { peakAtMs: 820, peakDeltaFovH: -18, previewDollyDistance: -6.5, previewFov: 64, previewMaskFovDelta: -18 },
  previewMode: "sphere_overlay",
  previewSupport: "approximate",
  previewTarget: "sphere",
  renderStage: "viewport_path"
});

const overlayStickerEffects = [
  effect({
    categoryId: "overlay",
    durationMs: 1800,
    effectId: "portal-ring",
    eventName: "overlay.portal_ring",
    family: "overlay",
    key: "3",
    label: "Portal ring",
    params: { color: "#00d8ff", coreColor: "#05061f", opacity: 0.92, radius: 0.31, secondaryColor: "#ff4dff", thickness: 0.035 },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 2200,
    effectId: "time-vortex",
    eventName: "overlay.time_vortex",
    family: "overlay",
    key: "4",
    label: "Time vortex",
    params: { color: "#4be3ff", coreColor: "#02030d", opacity: 0.86, radius: 0.36, secondaryColor: "#9a4dff" },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  }),
  effect({
    categoryId: "overlay",
    durationMs: 900,
    effectId: "explosion-sticker",
    eventName: "overlay.explosion_sticker",
    family: "overlay",
    key: "5",
    label: "Explosion sticker",
    params: { color: "#fff0a0", emberColor: "#ff1f00", opacity: 0.95, radius: 0.34, secondaryColor: "#ff6a00", smokeColor: "#282018" },
    previewTarget: "viewport-mask",
    renderStage: "overlay_frame"
  })
];

const fallbackCatalog = {
  catalogVersion: 1,
  categories,
  effects,
  schema: "pc-editor-effect-catalog.v1"
};

function withLittlePlanetFallback(catalog: unknown) {
  if (!catalog || typeof catalog !== "object") {
    return fallbackCatalog;
  }

  const rawCatalog = catalog as typeof fallbackCatalog;
  const catalogEffects = Array.isArray(rawCatalog.effects) ? rawCatalog.effects : [];
  let hasLittlePlanet = false;
  let hasCrystalBall = false;
  let hasLookAround = false;
  let hasDollyZoom = false;
  const missingOverlayStickerEffects = new Map(overlayStickerEffects.map((item) => [item.id, item]));
  const nextEffects = catalogEffects.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }

    if (item.id === "drift-left-parallax" && item.ui?.categoryId === "frame") {
      return {
        ...item,
        ui: {
          ...item.ui,
          key: "3"
        }
      };
    }

    if (item.id === "little-planet" || item.event?.name === "frame.little_planet_pullback") {
      hasLittlePlanet = true;
      return {
        ...littlePlanetEffect,
        ...item,
        event: {
          ...littlePlanetEffect.event,
          ...(item.event ?? {}),
          defaultDurationMs: item.event?.defaultDurationMs ?? littlePlanetEffect.event.defaultDurationMs,
          defaultParams: {
            ...littlePlanetEffect.event.defaultParams,
            ...(item.event?.defaultParams ?? {})
          },
          name: "frame.little_planet_pullback"
        },
        id: "little-planet",
        label: "Little planet",
        operation: littlePlanetEffect.operation,
        preview: littlePlanetEffect.preview,
        render: littlePlanetEffect.render,
        ui: {
          ...littlePlanetEffect.ui,
          ...(item.ui ?? {}),
          categoryId: "frame",
          key: "7",
          visible: true
        }
      };
    }

    if (item.id === "crystal-ball" || item.event?.name === "frame.crystal_ball_pull") {
      hasCrystalBall = true;
      return {
        ...crystalBallEffect,
        ...item,
        event: {
          ...crystalBallEffect.event,
          ...(item.event ?? {}),
          defaultDurationMs: item.event?.defaultDurationMs ?? crystalBallEffect.event.defaultDurationMs,
          defaultParams: {
            ...crystalBallEffect.event.defaultParams,
            ...(item.event?.defaultParams ?? {})
          },
          name: "frame.crystal_ball_pull"
        },
        id: "crystal-ball",
        label: "Crystal ball",
        operation: crystalBallEffect.operation,
        preview: crystalBallEffect.preview,
        render: crystalBallEffect.render,
        ui: {
          ...crystalBallEffect.ui,
          ...(item.ui ?? {}),
          categoryId: "frame",
          key: "8",
          visible: true
        }
      };
    }

    if (item.id === "look-around" || item.event?.name === "frame.look_around") {
      hasLookAround = true;
      return {
        ...lookAroundEffect,
        ...item,
        event: {
          ...lookAroundEffect.event,
          ...(item.event ?? {}),
          defaultDurationMs: item.event?.defaultDurationMs ?? lookAroundEffect.event.defaultDurationMs,
          defaultParams: {
            ...lookAroundEffect.event.defaultParams,
            ...(item.event?.defaultParams ?? {})
          },
          name: "frame.look_around"
        },
        id: "look-around",
        label: "Look around",
        operation: lookAroundEffect.operation,
        preview: lookAroundEffect.preview,
        render: lookAroundEffect.render,
        ui: {
          ...lookAroundEffect.ui,
          ...(item.ui ?? {}),
          categoryId: "frame",
          key: "9",
          visible: true
        }
      };
    }

    if (item.id === "dolly-zoom" || item.event?.name === "frame.dolly_zoom") {
      hasDollyZoom = true;
      return {
        ...dollyZoomEffect,
        ...item,
        event: {
          ...dollyZoomEffect.event,
          ...(item.event ?? {}),
          defaultDurationMs: item.event?.defaultDurationMs ?? dollyZoomEffect.event.defaultDurationMs,
          defaultParams: {
            ...dollyZoomEffect.event.defaultParams,
            ...(item.event?.defaultParams ?? {})
          },
          name: "frame.dolly_zoom"
        },
        id: "dolly-zoom",
        label: "Dolly zoom",
        operation: dollyZoomEffect.operation,
        preview: dollyZoomEffect.preview,
        render: dollyZoomEffect.render,
        ui: {
          ...dollyZoomEffect.ui,
          ...(item.ui ?? {}),
          categoryId: "frame",
          key: "0",
          visible: true
        }
      };
    }

    if (typeof item.id === "string" && missingOverlayStickerEffects.has(item.id)) {
      missingOverlayStickerEffects.delete(item.id);
    }

    return item;
  });

  if (!hasLittlePlanet) {
    nextEffects.push(littlePlanetEffect);
  }
  if (!hasCrystalBall) {
    nextEffects.push(crystalBallEffect);
  }
  if (!hasLookAround) {
    nextEffects.push(lookAroundEffect);
  }
  if (!hasDollyZoom) {
    nextEffects.push(dollyZoomEffect);
  }
  nextEffects.push(...missingOverlayStickerEffects.values());

  return {
    ...fallbackCatalog,
    ...rawCatalog,
    categories: Array.isArray(rawCatalog.categories) ? rawCatalog.categories : categories,
    effects: nextEffects
  };
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/effects/catalog`, {
      cache: "no-store",
      headers: {
        cookie: request.headers.get("cookie") ?? ""
      }
    });

    if (response.ok) {
      return NextResponse.json(withLittlePlanetFallback(await response.json()));
    }
  } catch {
    // Local fallback below keeps the editor usable when the backend dev process is stale or offline.
  }

  return NextResponse.json(withLittlePlanetFallback(fallbackCatalog));
}
