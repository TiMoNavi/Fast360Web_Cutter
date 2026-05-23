from __future__ import annotations

from .effect_policy import effect_fallback, effect_sort_key, effect_wins, event_conflict_group, event_type
from .effect_registry import EFFECT_REGISTRY, normalize_event_name
from .effect_types import EffectDefinition, FrameEffect


def apply_frame_effects(frame: object, t_ms: int, events: list[FrameEffect] | None) -> object:
    if not events:
        return frame

    rendered = frame
    for definition, event in resolve_frame_effects(events, t_ms):
        rendered = definition.handler(rendered, t_ms, event)
    return rendered


def resolve_frame_effects(
    events: list[FrameEffect] | None,
    t_ms: int,
) -> list[tuple[EffectDefinition, FrameEffect]]:
    if not events:
        return []

    resolved: list[tuple[EffectDefinition, FrameEffect]] = []
    exclusive_by_group: dict[str, tuple[EffectDefinition, FrameEffect]] = {}
    for event in events:
        if not event.get("enabled", True):
            continue
        if not is_event_active(event, t_ms):
            continue

        canonical_name = normalize_event_name(event_type(event))
        definition = EFFECT_REGISTRY.get(canonical_name)
        if definition is None:
            if effect_fallback(event) == "fail":
                raise ValueError(f"Unsupported effect event: {canonical_name}")
            continue

        event = {**event, "_resolved_effect_name": definition.canonical_name}
        conflict_group = event_conflict_group(event, definition)
        if conflict_group:
            current = exclusive_by_group.get(conflict_group)
            if current is None or effect_wins((definition, event), current):
                exclusive_by_group[conflict_group] = (definition, event)
        else:
            resolved.append((definition, event))

    resolved.extend(exclusive_by_group.values())
    resolved.sort(key=lambda item: effect_sort_key(item[0], item[1]))
    return resolved


def events_for_segment(events: list[FrameEffect], start_ms: int, end_ms: int) -> list[FrameEffect]:
    selected: list[FrameEffect] = []
    for event in events:
        event_start = int(event["start_ms"])
        event_end = int(event["end_ms"])
        if event_start < end_ms and event_end > start_ms:
            selected.append(
                {
                    **event,
                    "start_ms": event_start - start_ms,
                    "end_ms": event_end - start_ms,
                }
            )
    return selected


def is_event_active(event: FrameEffect, t_ms: int) -> bool:
    return int(event["start_ms"]) <= t_ms < int(event["end_ms"])
