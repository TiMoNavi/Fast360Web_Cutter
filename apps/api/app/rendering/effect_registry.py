from __future__ import annotations

from typing import Any

from .effect_handlers import (
    apply_blur,
    apply_chromatic_aberration,
    apply_color_grade,
    apply_fade_black,
    apply_flash_white,
    apply_highlight,
    apply_explosion_sticker,
    apply_letterbox,
    apply_portal_ring,
    apply_solid_black,
    apply_text_overlay,
    apply_time_vortex,
    apply_vignette,
)
from .effect_policy import event_conflict_group, event_priority, event_type
from .effect_types import EffectDefinition, EffectHandler, FrameEffect, PHASE_ORDER


def normalize_event_name(event_name: str) -> str:
    return EFFECT_ALIASES.get(event_name, event_name)


def describe_effect_event(event: FrameEffect) -> dict[str, Any]:
    event_name = event_type(event)
    canonical_name = normalize_event_name(event_name)
    definition = EFFECT_REGISTRY.get(canonical_name)
    if definition is None:
        return {
            "supported": False,
            "canonicalName": canonical_name,
            "namespace": event_namespace(canonical_name),
            "phase": "unknown",
            "order": None,
            "priority": event_priority(event, None),
            "stackMode": "passthrough",
            "conflictGroup": event_conflict_group(event, None),
        }
    return {
        "supported": True,
        "canonicalName": definition.canonical_name,
        "namespace": definition.namespace,
        "phase": definition.phase,
        "order": definition.order,
        "priority": event_priority(event, definition),
        "stackMode": definition.stack_mode,
        "conflictGroup": event_conflict_group(event, definition),
    }


def effect_execution_manifest() -> dict[str, Any]:
    definitions = sorted(EFFECT_REGISTRY.values(), key=lambda item: (item.order, item.canonical_name))
    return {
        "schema": "effect-registry.v1",
        "phases": PHASE_ORDER,
        "conflictPolicy": (
            "Within the same conflictGroup, the active event with the highest priority wins; "
            "ties prefer later seq/startMs."
        ),
        "registeredEffects": [
            {
                "type": definition.canonical_name,
                "namespace": definition.namespace,
                "phase": definition.phase,
                "order": definition.order,
                "priority": definition.priority,
                "stackMode": definition.stack_mode,
                "conflictGroup": definition.conflict_group,
                "aliases": list(definition.aliases),
            }
            for definition in definitions
        ],
    }


def event_namespace(event_name: str) -> str:
    if "." in event_name:
        return event_name.split(".", 1)[0]
    return "custom"


def build_registry() -> tuple[dict[str, EffectDefinition], dict[str, str]]:
    definitions = [
        EffectDefinition(
            canonical_name="transition.fade_black",
            namespace="transition",
            phase="transition",
            order=110,
            priority=60,
            stack_mode="exclusive",
            conflict_group="frame.occlusion",
            handler=apply_fade_black,
            aliases=("fade_black", "fade-black"),
        ),
        EffectDefinition(
            canonical_name="black.solid",
            namespace="black",
            phase="transition",
            order=120,
            priority=100,
            stack_mode="exclusive",
            conflict_group="frame.occlusion",
            handler=apply_solid_black,
            aliases=("solid_black", "solid-black"),
        ),
        EffectDefinition(
            canonical_name="transition.flash_white",
            namespace="transition",
            phase="transition",
            order=130,
            priority=80,
            stack_mode="exclusive",
            conflict_group="frame.occlusion",
            handler=apply_flash_white,
            aliases=("flash_white", "flash-white"),
        ),
        EffectDefinition(
            canonical_name="filter.color_grade",
            namespace="filter",
            phase="filter",
            order=205,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_color_grade,
            aliases=("color_grade", "color-grade"),
        ),
        EffectDefinition(
            canonical_name="highlight",
            namespace="filter",
            phase="filter",
            order=210,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_highlight,
            aliases=("filter.highlight", "high_light", "high-light"),
        ),
        EffectDefinition(
            canonical_name="filter.blur",
            namespace="filter",
            phase="filter",
            order=220,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_blur,
        ),
        EffectDefinition(
            canonical_name="filter.vignette",
            namespace="filter",
            phase="filter",
            order=230,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_vignette,
        ),
        EffectDefinition(
            canonical_name="filter.chromatic_aberration",
            namespace="filter",
            phase="filter",
            order=240,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_chromatic_aberration,
            aliases=("chromatic_aberration", "chromatic-aberration"),
        ),
        EffectDefinition(
            canonical_name="overlay.letterbox",
            namespace="overlay",
            phase="overlay",
            order=305,
            priority=10,
            stack_mode="additive",
            conflict_group="frame.matte",
            handler=apply_letterbox,
        ),
        EffectDefinition(
            canonical_name="overlay.text",
            namespace="overlay",
            phase="overlay",
            order=310,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_text_overlay,
        ),
        EffectDefinition(
            canonical_name="overlay.portal_ring",
            namespace="overlay",
            phase="overlay",
            order=320,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_portal_ring,
        ),
        EffectDefinition(
            canonical_name="overlay.time_vortex",
            namespace="overlay",
            phase="overlay",
            order=330,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_time_vortex,
        ),
        EffectDefinition(
            canonical_name="overlay.explosion_sticker",
            namespace="overlay",
            phase="overlay",
            order=340,
            priority=10,
            stack_mode="additive",
            conflict_group=None,
            handler=apply_explosion_sticker,
        ),
    ]
    registry = {definition.canonical_name: definition for definition in definitions}
    aliases: dict[str, str] = {}
    for definition in definitions:
        aliases[definition.canonical_name] = definition.canonical_name
        for alias in definition.aliases:
            aliases[alias] = definition.canonical_name
    return registry, aliases


EFFECT_REGISTRY, EFFECT_ALIASES = build_registry()
EFFECT_HANDLERS: dict[str, EffectHandler] = {
    name: definition.handler for name, definition in EFFECT_REGISTRY.items()
}
