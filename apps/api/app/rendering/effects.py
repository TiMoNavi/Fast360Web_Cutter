from __future__ import annotations

from collections.abc import Callable
from typing import Any


FrameEffect = dict[str, Any]
EffectHandler = Callable[[Any, int, FrameEffect], Any]


def apply_frame_effects(frame: Any, t_ms: int, events: list[FrameEffect] | None) -> Any:
    if not events:
        return frame

    rendered = frame
    for event in events:
        if not event.get("enabled", True):
            continue
        if not is_event_active(event, t_ms):
            continue
        handler = EFFECT_HANDLERS.get(normalize_event_name(str(event.get("event_name", ""))))
        if handler is not None:
            rendered = handler(rendered, t_ms, event)
    return rendered


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


def normalize_event_name(event_name: str) -> str:
    aliases = {
        "fade_black": "fadeBlack",
        "fade-black": "fadeBlack",
        "fadeoutblack": "fadeOutBlack",
        "fade_out_black": "fadeOutBlack",
        "fadeinblack": "fadeInBlack",
        "fade_in_black": "fadeInBlack",
        "high_light": "highlight",
        "high-light": "highlight",
    }
    return aliases.get(event_name, event_name)


def effect_progress(event: FrameEffect, t_ms: int) -> float:
    start_ms = int(event["start_ms"])
    end_ms = int(event["end_ms"])
    return clamp((t_ms - start_ms) / max(end_ms - start_ms, 1), 0, 1)


def edge_envelope(event: FrameEffect, t_ms: int, default_edge_ms: int = 180) -> float:
    params = event.get("params") or {}
    start_ms = int(event["start_ms"])
    end_ms = int(event["end_ms"])
    duration_ms = max(end_ms - start_ms, 1)
    edge_ms = int(params.get("edgeMs", min(default_edge_ms, duration_ms / 2)))
    edge_ms = max(1, min(edge_ms, max(duration_ms // 2, 1)))
    if t_ms < start_ms + edge_ms:
        return clamp((t_ms - start_ms) / edge_ms, 0, 1)
    if t_ms > end_ms - edge_ms:
        return clamp((end_ms - t_ms) / edge_ms, 0, 1)
    return 1


def apply_fade_black(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    peak_opacity = clamp(float(params.get("peakOpacity", 1.0)), 0, 1)
    progress = effect_progress(event, t_ms)
    opacity = peak_opacity * (1 - abs(progress * 2 - 1))
    return np.clip(frame.astype(np.float32) * (1 - opacity), 0, 255).astype(np.uint8)


def apply_fade_out_black(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    peak_opacity = clamp(float(params.get("peakOpacity", 1.0)), 0, 1)
    opacity = peak_opacity * effect_progress(event, t_ms)
    return np.clip(frame.astype(np.float32) * (1 - opacity), 0, 255).astype(np.uint8)


def apply_fade_in_black(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    peak_opacity = clamp(float(params.get("peakOpacity", 1.0)), 0, 1)
    opacity = peak_opacity * (1 - effect_progress(event, t_ms))
    return np.clip(frame.astype(np.float32) * (1 - opacity), 0, 255).astype(np.uint8)


def apply_highlight(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import cv2
    import numpy as np

    params = event.get("params") or {}
    strength = clamp(float(params.get("strength", 0.28)), 0, 1.5) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    working = frame.astype(np.float32)
    brightness = float(params.get("brightness", 18))
    contrast = float(params.get("contrast", 1.0 + strength * 0.28))
    warm = float(params.get("warmth", 0.12))
    bloom = clamp(float(params.get("bloom", 0.18)), 0, 1.0) * strength

    highlighted = working * contrast + brightness * strength
    highlighted[:, :, 1] += 10 * warm * strength
    highlighted[:, :, 2] += 22 * warm * strength

    if bloom > 0:
        bright_mask = np.maximum(working - 180, 0) / 75
        glow = cv2.GaussianBlur(bright_mask, (0, 0), sigmaX=8, sigmaY=8)
        highlighted += glow * (55 * bloom)

    return np.clip(highlighted, 0, 255).astype(np.uint8)


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


EFFECT_HANDLERS: dict[str, EffectHandler] = {
    "fadeBlack": apply_fade_black,
    "fadeOutBlack": apply_fade_out_black,
    "fadeInBlack": apply_fade_in_black,
    "highlight": apply_highlight,
}
