from __future__ import annotations

from .effect_types import EffectDefinition, FrameEffect, PHASE_ORDER


def event_type(event: FrameEffect) -> str:
    return str(event.get("event_name", event.get("eventName", event.get("type", ""))))


def effect_fallback(event: FrameEffect) -> str:
    policy = event.get("render_policy") or event.get("renderPolicy") or {}
    fallback = str(policy.get("fallback", "ignore"))
    if fallback not in {"ignore", "warn", "fail"}:
        return "ignore"
    return fallback


def event_priority(event: FrameEffect, definition: EffectDefinition | None) -> int:
    policy = event.get("render_policy") or event.get("renderPolicy") or {}
    params = event.get("params") or {}
    raw_priority = policy.get("priority", params.get("priority"))
    if raw_priority is None:
        return definition.priority if definition is not None else 0
    try:
        return int(raw_priority)
    except (TypeError, ValueError):
        return definition.priority if definition is not None else 0


def event_conflict_group(event: FrameEffect, definition: EffectDefinition | None) -> str | None:
    policy = event.get("render_policy") or event.get("renderPolicy") or {}
    conflict_group = policy.get("conflictGroup", policy.get("conflict_group"))
    if conflict_group:
        return str(conflict_group)
    return definition.conflict_group if definition is not None else None


def effect_wins(
    candidate: tuple[EffectDefinition, FrameEffect],
    current: tuple[EffectDefinition, FrameEffect],
) -> bool:
    candidate_definition, candidate_event = candidate
    current_definition, current_event = current
    candidate_key = (
        event_priority(candidate_event, candidate_definition),
        int(candidate_event.get("seq", 0)),
        int(candidate_event.get("start_ms", candidate_event.get("startMs", 0))),
    )
    current_key = (
        event_priority(current_event, current_definition),
        int(current_event.get("seq", 0)),
        int(current_event.get("start_ms", current_event.get("startMs", 0))),
    )
    return candidate_key >= current_key


def effect_sort_key(definition: EffectDefinition, event: FrameEffect) -> tuple[int, int, int, str]:
    return (
        PHASE_ORDER.get(definition.phase, 500),
        definition.order,
        int(event.get("start_ms", event.get("startMs", 0))),
        definition.canonical_name,
    )
