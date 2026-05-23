from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


FrameEffect = dict[str, Any]
EffectHandler = Callable[[Any, int, FrameEffect], Any]


@dataclass(frozen=True)
class EffectDefinition:
    canonical_name: str
    namespace: str
    phase: str
    order: int
    priority: int
    stack_mode: str
    conflict_group: str | None
    handler: EffectHandler
    aliases: tuple[str, ...] = ()


PHASE_ORDER = {
    "generate": 0,
    "transition": 100,
    "filter": 200,
    "overlay": 300,
    "marker": 900,
}
