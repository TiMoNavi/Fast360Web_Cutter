from __future__ import annotations

from typing import Any

from ..rendering.effect_registry import EFFECT_REGISTRY

from .models import (
    EffectCatalogResponse,
    EffectCategorySpec,
    EffectDefinitionSpec,
    EffectEventSpec,
    EffectOperationSpec,
    EffectPreviewSpec,
    EffectRenderSpec,
    EffectUiSpec,
)


EFFECT_CATEGORIES = [
    EffectCategorySpec(id="transition", key="1", label="Transition"),
    EffectCategorySpec(id="color", key="2", label="Color"),
    EffectCategorySpec(id="speed", key="3", label="Speed"),
    EffectCategorySpec(id="frame", key="4", label="Frame"),
    EffectCategorySpec(id="glitch", key="5", label="Glitch"),
    EffectCategorySpec(id="marker", key="6", label="Marker"),
    EffectCategorySpec(id="overlay", key="7", label="Overlay"),
]

VIEWPORT_PATH_EFFECTS = {
    "frame.drift_left_parallax",
    "frame.dolly_zoom",
    "frame.hero_push",
    "frame.impact_shake",
    "frame.look_around",
    "frame.pull_out",
    "frame.push_in",
    "frame.reveal_pull",
}

PRE_REMAP_EFFECTS = {
    "frame.crystal_ball_pull",
    "frame.little_planet_pullback",
    "projection.crystal_ball",
    "projection.little_planet",
}


def backend_support(event_name: str, render_stage: str = "post_remap_frame") -> str:
    if render_stage == "viewport_path" and event_name in VIEWPORT_PATH_EFFECTS:
        return "supported"
    if render_stage == "pre_remap_equirect" and event_name in PRE_REMAP_EFFECTS:
        return "supported"
    return "supported" if event_name in EFFECT_REGISTRY else "unsupported"


def backend_conflict_group(event_name: str) -> str | None:
    definition = EFFECT_REGISTRY.get(event_name)
    return definition.conflict_group if definition is not None else None


def effect(
    *,
    category_id: str,
    description: str = "",
    duration_ms: int = 900,
    effect_id: str,
    event_name: str,
    family: str,
    key: str,
    label: str,
    params: dict[str, Any] | None = None,
    preview_mode: str = "ui_overlay",
    preview_support: str = "symbolic",
    preview_target: str | None = None,
    render_stage: str = "post_remap_frame",
) -> EffectDefinitionSpec:
    default_params = params or {}
    resolved_preview_target = preview_target or default_preview_target(event_name=event_name, render_stage=render_stage)
    return EffectDefinitionSpec(
        id=effect_id,
        family=family,
        label=label,
        description=description,
        event=EffectEventSpec(
            name=event_name,
            defaultDurationMs=duration_ms,
            defaultParams=default_params,
        ),
        render=EffectRenderSpec(
            stage=render_stage,
            backendSupport=backend_support(event_name, render_stage),
            conflictGroup=backend_conflict_group(event_name),
            fallback="warn",
        ),
        preview=EffectPreviewSpec(
            webxrSupport=preview_support,
            mode=preview_mode,
            target=resolved_preview_target,
            renderer="pc-effect-preview" if preview_mode == "ui_overlay" else None,
        ),
        ui=EffectUiSpec(categoryId=category_id, key=key, visible=True),
        operation=EffectOperationSpec(
            eventType="editor.effects.select",
            payload={
                "categoryId": category_id,
                "durationMs": duration_ms,
                "effectId": effect_id,
                "eventName": event_name,
                "label": label,
                "params": default_params,
                "previewTarget": resolved_preview_target,
            },
        ),
    )


def default_preview_target(*, event_name: str, render_stage: str) -> str:
    if event_name in {
        "black.solid",
        "filter.blur",
        "filter.chromatic_aberration",
        "filter.color_grade",
        "filter.vignette",
        "transition.fade_black",
        "transition.flash_white",
    }:
        return "viewport-mask"

    if render_stage in {"post_remap_frame", "overlay_frame"}:
        return "viewport-mask"

    return "screen"


EFFECTS = [
    effect(category_id="transition", effect_id="black-fade", event_name="transition.fade_black", family="transition", key="1", label="Black fade"),
    effect(
        category_id="transition",
        duration_ms=720,
        effect_id="white-fade",
        event_name="transition.flash_white",
        family="transition",
        key="2",
        label="White fade",
        params={"color": "#ffffff", "peakOpacity": 0.92},
    ),
    effect(
        category_id="transition",
        duration_ms=260,
        effect_id="flash-cut",
        event_name="transition.flash_white",
        family="transition",
        key="3",
        label="Flash cut",
        params={"color": "#ffffff", "peakOpacity": 0.96},
    ),
    effect(category_id="transition", effect_id="neon-wipe", event_name="highlight", family="transition", key="4", label="Neon wipe", params={"tint": "cyan"}),
    effect(category_id="transition", effect_id="grid-dissolve", event_name="filter.blur", family="transition", key="5", label="Grid dissolve", params={"strength": 0.42}),
    effect(category_id="transition", duration_ms=700, effect_id="vhs-blank", event_name="black.solid", family="transition", key="6", label="VHS blank"),
    effect(category_id="color", effect_id="cyan-boost", event_name="filter.color_grade", family="color", key="1", label="Cyan boost", params={"tint": "cyan"}),
    effect(category_id="color", effect_id="magenta-wash", event_name="filter.color_grade", family="color", key="2", label="Magenta wash", params={"tint": "magenta"}),
    effect(category_id="color", effect_id="sunset-grade", event_name="filter.color_grade", family="color", key="3", label="Sunset grade", params={"tint": "sunset"}),
    effect(category_id="color", effect_id="cold-chrome", event_name="filter.color_grade", family="color", key="4", label="Cold chrome", params={"tint": "chrome"}),
    effect(category_id="color", effect_id="warm-vhs", event_name="filter.color_grade", family="color", key="5", label="Warm VHS", params={"tint": "warm"}),
    effect(category_id="color", duration_ms=760, effect_id="soft-blur", event_name="filter.blur", family="filter", key="6", label="Soft blur", params={"edgeMs": 180, "radius": 21, "strength": 0.48}),
    effect(category_id="speed", effect_id="speed-ramp", event_name="speed.ramp", family="speed", key="1", label="Speed ramp", render_stage="viewport_path"),
    effect(category_id="speed", effect_id="slow-drift", event_name="speed.slow_drift", family="speed", key="2", label="Slow drift", render_stage="viewport_path"),
    effect(category_id="speed", effect_id="freeze-frame", event_name="speed.freeze_frame", family="speed", key="3", label="Freeze frame", render_stage="viewport_path"),
    effect(category_id="speed", effect_id="beat-stutter", event_name="speed.beat_stutter", family="speed", key="4", label="Beat stutter", render_stage="viewport_path"),
    effect(category_id="speed", effect_id="reverse-hit", event_name="speed.reverse_hit", family="speed", key="5", label="Reverse hit", render_stage="viewport_path"),
    effect(category_id="speed", effect_id="time-skip", event_name="speed.time_skip", family="speed", key="6", label="Time skip", render_stage="viewport_path"),
    effect(
        category_id="frame",
        duration_ms=900,
        effect_id="hero-push",
        event_name="frame.hero_push",
        family="frame",
        key="1",
        label="Hero push",
        params={"deltaFovH": -10, "reboundFovH": 1, "peakAtRatio": 0.72, "curve": "easeOutBackSoft"},
        preview_mode="viewport_simulation",
        preview_support="exact",
        preview_target="viewport-mask",
        render_stage="viewport_path",
    ),
    effect(
        category_id="frame",
        duration_ms=1400,
        effect_id="reveal-pull",
        event_name="frame.reveal_pull",
        family="frame",
        key="2",
        label="Reveal pull",
        params={"deltaFovH": 14, "deltaPitch": 2, "curve": "easeInOutCubic"},
        preview_mode="viewport_simulation",
        preview_support="exact",
        preview_target="viewport-mask",
        render_stage="viewport_path",
    ),
    effect(
        category_id="frame",
        duration_ms=1600,
        effect_id="drift-left-parallax",
        event_name="frame.drift_left_parallax",
        family="frame",
        key="3",
        label="Drift left",
        params={"deltaYaw": -8, "deltaFovH": -3, "curve": "easeInOutSine"},
        preview_mode="viewport_simulation",
        preview_support="exact",
        preview_target="viewport-mask",
        render_stage="viewport_path",
    ),
    effect(
        category_id="frame",
        duration_ms=620,
        effect_id="impact-shake",
        event_name="frame.impact_shake",
        family="frame",
        key="4",
        label="Impact shake",
        params={"amplitudePitch": 1.4, "amplitudeYaw": 2.6, "decay": 0.62, "shakes": 4},
        preview_mode="viewport_simulation",
        preview_support="exact",
        preview_target="viewport-mask",
        render_stage="viewport_path",
    ),
    effect(category_id="frame", effect_id="focus-box", event_name="highlight", family="frame", key="5", label="Focus box"),
    effect(category_id="frame", effect_id="edge-vignette", event_name="filter.vignette", family="frame", key="6", label="Edge vignette"),
    effect(
        category_id="frame",
        duration_ms=1600,
        effect_id="little-planet",
        event_name="frame.little_planet_pullback",
        family="frame",
        key="7",
        label="Little planet",
        params={
            "peakAtMs": 560,
            "peakPitch": -88,
            "peakSphereFov": 175,
            "previewFlightHeight": 46.8,
            "previewFov": 138,
            "previewPitch": -90,
        },
        preview_mode="sphere_overlay",
        preview_support="approximate",
        preview_target="sphere",
        render_stage="pre_remap_equirect",
    ),
    effect(
        category_id="frame",
        duration_ms=1900,
        effect_id="crystal-ball",
        event_name="frame.crystal_ball_pull",
        family="frame",
        key="8",
        label="Crystal ball",
        params={
            "centerPitch": 88,
            "peakAtMs": 760,
            "peakSphereFov": 165,
            "previewFlightHeight": 34,
            "previewFov": 145,
            "previewMaskFov": 178,
            "previewMaskPitch": -78,
            "previewPitch": -82,
            "roll": 180,
        },
        preview_mode="sphere_overlay",
        preview_support="approximate",
        preview_target="sphere",
        render_stage="pre_remap_equirect",
    ),
    effect(
        category_id="frame",
        duration_ms=2200,
        effect_id="look-around",
        event_name="frame.look_around",
        family="frame",
        key="9",
        label="Look around",
        params={"returnYaw": -10, "sweepYaw": 28, "widenFovH": 3},
        preview_mode="viewport_simulation",
        preview_support="exact",
        preview_target="viewport-mask",
        render_stage="viewport_path",
    ),
    effect(
        category_id="frame",
        duration_ms=1700,
        effect_id="dolly-zoom",
        event_name="frame.dolly_zoom",
        family="frame",
        key="0",
        label="Dolly zoom",
        params={
            "peakAtMs": 820,
            "peakDeltaFovH": -18,
            "previewDollyDistance": -6.5,
            "previewFov": 64,
            "previewMaskFovDelta": -18,
        },
        preview_mode="sphere_overlay",
        preview_support="approximate",
        preview_target="sphere",
        render_stage="viewport_path",
    ),
    effect(category_id="glitch", duration_ms=520, effect_id="rgb-split", event_name="filter.chromatic_aberration", family="glitch", key="1", label="RGB split", params={"edgeMs": 110, "offsetPx": 14, "strength": 0.88}),
    effect(category_id="glitch", effect_id="scan-tear", event_name="glitch.scan_tear", family="glitch", key="2", label="Scan tear"),
    effect(category_id="glitch", effect_id="datamosh", event_name="glitch.datamosh", family="glitch", key="3", label="Datamosh"),
    effect(category_id="glitch", effect_id="noise-burst", event_name="glitch.noise_burst", family="glitch", key="4", label="Noise burst"),
    effect(category_id="glitch", effect_id="signal-loss", event_name="glitch.signal_loss", family="glitch", key="5", label="Signal loss"),
    effect(category_id="glitch", effect_id="pixel-shift", event_name="glitch.pixel_shift", family="glitch", key="6", label="Pixel shift"),
    effect(category_id="marker", effect_id="beat-mark", event_name="marker.beat", family="marker", key="1", label="Beat mark", render_stage="marker_only"),
    effect(category_id="marker", effect_id="cut-note", event_name="marker.cut_note", family="marker", key="2", label="Cut note", render_stage="marker_only"),
    effect(category_id="marker", effect_id="restore-here", event_name="marker.restore_here", family="marker", key="3", label="Restore here", render_stage="marker_only"),
    effect(category_id="marker", effect_id="discard-here", event_name="marker.discard_here", family="marker", key="4", label="Discard here", render_stage="marker_only"),
    effect(category_id="marker", effect_id="hero-shot", event_name="highlight", family="marker", key="5", label="Hero shot"),
    effect(category_id="marker", effect_id="review-flag", event_name="marker.review_flag", family="marker", key="6", label="Review flag", render_stage="marker_only"),
    effect(
        category_id="overlay",
        duration_ms=2400,
        effect_id="text-title",
        event_name="overlay.text",
        family="overlay",
        key="1",
        label="Text title",
        params={"backgroundOpacity": 0.45, "position": "bottom_center", "text": "TEXT"},
        preview_target="viewport-mask",
        render_stage="overlay_frame",
    ),
    effect(
        category_id="overlay",
        duration_ms=1800,
        effect_id="letterbox-bars",
        event_name="overlay.letterbox",
        family="overlay",
        key="2",
        label="Letterbox",
        params={"opacity": 1, "ratio": 0.12},
        preview_target="viewport-mask",
        render_stage="overlay_frame",
    ),
]


def effect_catalog_payload() -> dict[str, Any]:
    return EffectCatalogResponse(
        categories=EFFECT_CATEGORIES,
        effects=EFFECTS,
    ).model_dump(by_alias=True)
