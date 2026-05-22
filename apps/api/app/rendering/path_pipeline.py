from __future__ import annotations

DEFAULT_MAX_YAW_RATE_DEGREES_PER_SECOND = 8
DEFAULT_MAX_PITCH_RATE_DEGREES_PER_SECOND = 5
DEFAULT_MAX_FOV_RATE_DEGREES_PER_SECOND = 12


def render_point_from_row(row) -> dict[str, float | bool | str]:
    return {
        "t_ms": float(row["t_ms"]),
        "yaw": float(row["yaw"]),
        "pitch": float(row["pitch"]),
        "fov_h": float(row["fov_h"]),
        "fov_v": float(row["fov_v"]),
        "enabled": bool(row["enabled"]),
        "cut": bool(row["cut"]),
        "interpolation": row["interpolation"],
        "transition_ms": float(row["transition_ms"]),
    }


def build_enabled_render_segments(points: list[dict[str, float | bool | str]]) -> list[list[dict[str, float | str]]]:
    segments: list[list[dict[str, float | str]]] = []
    current: list[dict[str, float | str]] = []

    def render_fields(point: dict[str, float | bool | str]) -> dict[str, float | str]:
        return {
            "t_ms": float(point["t_ms"]),
            "yaw": float(point["yaw"]),
            "pitch": float(point["pitch"]),
            "fov_h": float(point["fov_h"]),
            "fov_v": float(point["fov_v"]),
            "interpolation": str(point.get("interpolation") or "linear"),
            "transition_ms": float(point.get("transition_ms") or 0),
        }

    def close_current() -> None:
        nonlocal current
        if len(current) >= 2 and float(current[-1]["t_ms"]) > float(current[0]["t_ms"]):
            segments.append(current)
        current = []

    for index in range(len(points) - 1):
        left = points[index]
        right = points[index + 1]
        if float(right["t_ms"]) <= float(left["t_ms"]):
            continue

        if not bool(left["enabled"]):
            close_current()
            continue

        left_render = render_fields(left)
        right_render = render_fields(right)
        if not current:
            current = [left_render]
        elif current[-1]["t_ms"] != left_render["t_ms"]:
            current.append(left_render)

        current.append(right_render)

        if bool(right.get("cut")) or not bool(right["enabled"]):
            close_current()

    close_current()
    return segments


def relative_segment_points(segment: list[dict[str, float | str]]) -> list[dict[str, float | str]]:
    start_ms = float(segment[0]["t_ms"])
    return [{**point, "t_ms": float(point["t_ms"]) - start_ms} for point in segment]


def prepare_render_segment(
    segment: list[dict[str, float | str]],
    fps: int,
    max_yaw_rate: float = DEFAULT_MAX_YAW_RATE_DEGREES_PER_SECOND,
    max_pitch_rate: float = DEFAULT_MAX_PITCH_RATE_DEGREES_PER_SECOND,
    max_fov_rate: float = DEFAULT_MAX_FOV_RATE_DEGREES_PER_SECOND,
) -> list[dict[str, float | str]]:
    frame_step_ms = max(round(1000 / fps), 1)
    return limit_render_segment_dynamics(
        expand_fast_transition_points(segment, frame_step_ms=frame_step_ms),
        max_yaw_rate=max_yaw_rate,
        max_pitch_rate=max_pitch_rate,
        max_fov_rate=max_fov_rate,
    )


def limit_delta(previous: float, next_value: float, max_delta: float) -> float:
    return previous + max(-max_delta, min(max_delta, next_value - previous))


def limit_render_segment_dynamics(
    segment: list[dict[str, float | str]],
    max_yaw_rate: float = DEFAULT_MAX_YAW_RATE_DEGREES_PER_SECOND,
    max_pitch_rate: float = DEFAULT_MAX_PITCH_RATE_DEGREES_PER_SECOND,
    max_fov_rate: float = DEFAULT_MAX_FOV_RATE_DEGREES_PER_SECOND,
) -> list[dict[str, float | str]]:
    if not segment:
        return segment
    limited = [segment[0].copy()]
    for point in segment[1:]:
        previous = limited[-1]
        if str(point.get("interpolation", "linear")) == "fast":
            limited.append(point.copy())
            continue
        delta_seconds = max((float(point["t_ms"]) - float(previous["t_ms"])) / 1000, 0.001)
        limited.append(
            {
                **point,
                "yaw": limit_delta(
                    float(previous["yaw"]),
                    float(point["yaw"]),
                    max_yaw_rate * delta_seconds,
                ),
                "pitch": limit_delta(
                    float(previous["pitch"]),
                    float(point["pitch"]),
                    max_pitch_rate * delta_seconds,
                ),
                "fov_h": limit_delta(
                    float(previous["fov_h"]),
                    float(point["fov_h"]),
                    max_fov_rate * delta_seconds,
                ),
                "fov_v": limit_delta(
                    float(previous["fov_v"]),
                    float(point["fov_v"]),
                    max_fov_rate * delta_seconds * 9 / 16,
                ),
            }
        )
    return limited


def expand_fast_transition_points(
    segment: list[dict[str, float | str]],
    frame_step_ms: int,
) -> list[dict[str, float | str]]:
    if len(segment) < 2:
        return segment

    expanded: list[dict[str, float | str]] = [segment[0].copy()]
    for point in segment[1:]:
        previous = expanded[-1]
        transition_ms = int(float(point.get("transition_ms", 0)))
        interpolation = str(point.get("interpolation", "linear"))
        if interpolation == "fast" and transition_ms > 0:
            start_ms = max(float(previous["t_ms"]), float(point["t_ms"]) - transition_ms)
            if start_ms > float(previous["t_ms"]) and start_ms < float(point["t_ms"]):
                expanded.append({**previous, "t_ms": start_ms})
            t_ms = start_ms + frame_step_ms
            while t_ms < float(point["t_ms"]):
                span = max(float(point["t_ms"]) - start_ms, 1)
                alpha = (t_ms - start_ms) / span
                expanded.append(
                    {
                        **point,
                        "t_ms": float(t_ms),
                        "yaw": float(previous["yaw"]) + (float(point["yaw"]) - float(previous["yaw"])) * alpha,
                        "pitch": float(previous["pitch"]) + (float(point["pitch"]) - float(previous["pitch"])) * alpha,
                        "fov_h": float(previous["fov_h"]) + (float(point["fov_h"]) - float(previous["fov_h"])) * alpha,
                        "fov_v": float(previous["fov_v"]) + (float(point["fov_v"]) - float(previous["fov_v"])) * alpha,
                        "interpolation": "fast",
                        "transition_ms": 0,
                    }
                )
                t_ms += frame_step_ms
        expanded.append(point.copy())
    return expanded
