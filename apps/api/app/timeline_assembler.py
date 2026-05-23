from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .rendering.effects import describe_effect_event, effect_execution_manifest
from .rendering.path_pipeline import build_enabled_render_segments


DEFAULT_OUTPUT = {
    "aspect": "16:9",
    "width": 1920,
    "height": 1080,
    "fps": 30,
}


def assemble_view_path_timeline(
    *,
    video_id: str,
    session_id: str,
    duration_ms: int,
    points: list[dict[str, Any]],
    effects: list[dict[str, Any]] | None = None,
    audio_tracks: list[dict[str, Any]] | None = None,
    source_filename: str | None = None,
    timeline_revision: int = 1,
    output_config: dict[str, Any] | None = None,
    created_at: str | None = None,
    soft_gap_ms: int = 500,
    hard_gap_ms: int = 1500,
) -> dict[str, Any]:
    normalized_points = normalize_points(points)
    view_points = [timeline_view_point(point) for point in normalized_points]
    render_segments = build_enabled_render_segments(normalized_points)
    edit_segments = edit_segments_from_render_segments(render_segments)
    gap_report = detect_point_gaps(normalized_points, soft_gap_ms=soft_gap_ms, hard_gap_ms=hard_gap_ms)
    output_duration_ms = edit_segments[-1]["output"]["endMs"] if edit_segments else 0
    status = timeline_status(edit_segments, gap_report)
    warnings = build_warnings(status, gap_report)
    created_at = created_at or datetime.now(timezone.utc).isoformat()

    return {
        "schema": "view-path-timeline.v1",
        "timelineId": f"timeline_{session_id}_rev_{timeline_revision}",
        "createdAt": created_at,
        "source": {
            "videoId": video_id,
            "filename": source_filename,
            "durationMs": duration_ms,
            "projection": "equirectangular",
        },
        "session": {
            "sessionId": session_id,
            "source": "webxr",
            "timelineRevision": timeline_revision,
        },
        "output": {
            "durationMs": output_duration_ms,
            **(output_config or DEFAULT_OUTPUT),
        },
        "coordinateSystem": {
            "timeUnit": "ms",
            "angleUnit": "degree",
            "yawRange": "-180..180",
            "pitchRange": "-85..85",
        },
        "effectSystem": effect_execution_manifest(),
        "editSegments": edit_segments,
        "viewTracks": [
            {
                "trackId": "view_main",
                "timeRef": "source",
                "points": view_points,
            }
        ],
        "effectTracks": [
            {
                "trackId": "effects_main",
                "events": [timeline_effect_event(event) for event in (effects or [])],
            }
        ],
        "audioTracks": [timeline_audio_track(track) for track in (audio_tracks or [])],
        "coverage": {
            "status": status,
            "sourceRanges": source_ranges(edit_segments),
            "outputRanges": [segment["output"] for segment in edit_segments],
            "gaps": gap_report,
        },
        "build": {
            "assemblerVersion": "timeline-assembler.v1",
            "sourcePatchCount": None,
            "pointCount": len(view_points),
            "warnings": warnings,
        },
    }


def normalize_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_time: dict[int, dict[str, Any]] = {}
    for raw in points:
        point = normalize_point(raw)
        t_ms = int(point["t_ms"])
        previous = by_time.get(t_ms)
        if previous is None or int(point.get("seq", 0)) >= int(previous.get("seq", 0)):
            by_time[t_ms] = point
    return [by_time[t_ms] for t_ms in sorted(by_time)]


def normalize_point(point: dict[str, Any]) -> dict[str, Any]:
    center = point.get("center") or {}
    fov = point.get("fov") or {}
    return {
        "seq": int(point.get("seq", 0)),
        "t_ms": int(point.get("t_ms", point.get("tMs", 0))),
        "yaw": float(point.get("yaw", center.get("yaw", 0))),
        "pitch": float(point.get("pitch", center.get("pitch", 0))),
        "fov_h": float(point.get("fov_h", fov.get("h", 82))),
        "fov_v": float(point.get("fov_v", fov.get("v", 46.1))),
        "roll": float(point.get("roll", 0)),
        "enabled": bool(point.get("enabled", True)),
        "cut": bool(point.get("cut", False)),
        "locked": bool(point.get("locked", False)),
        "smooth_follow": bool(point.get("smooth_follow", point.get("smoothFollow", True))),
        "interpolation": str(point.get("interpolation", "linear")),
        "transition_ms": int(point.get("transition_ms", point.get("transitionMs", 0))),
        "input": str(point.get("input", "head_gaze")),
    }


def timeline_view_point(point: dict[str, Any]) -> dict[str, Any]:
    t_ms = int(point["t_ms"])
    seq = int(point["seq"])
    return {
        "pointId": f"pt_{t_ms}_{seq}",
        "seq": seq,
        "tMs": t_ms,
        "center": {
            "yaw": float(point["yaw"]),
            "pitch": float(point["pitch"]),
        },
        "fov": {
            "h": float(point["fov_h"]),
            "v": float(point["fov_v"]),
        },
        "roll": float(point["roll"]),
        "enabled": bool(point["enabled"]),
        "cut": bool(point["cut"]),
        "locked": bool(point["locked"]),
        "smoothFollow": bool(point["smooth_follow"]),
        "interpolation": point["interpolation"],
        "transitionMs": int(point["transition_ms"]),
        "input": point["input"],
        "quality": {
            "source": "observed",
            "confidence": 1.0,
        },
    }


def edit_segments_from_render_segments(segments: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    edit_segments: list[dict[str, Any]] = []
    output_cursor = 0
    for index, segment in enumerate(segments):
        source_start_ms = int(float(segment[0]["t_ms"]))
        source_end_ms = int(float(segment[-1]["t_ms"]))
        duration_ms = source_end_ms - source_start_ms
        if duration_ms <= 0:
            continue
        edit_segments.append(
            {
                "editId": f"edit_{index + 1:03d}",
                "enabled": True,
                "kind": "source",
                "output": {
                    "startMs": output_cursor,
                    "endMs": output_cursor + duration_ms,
                },
                "source": {
                    "startMs": source_start_ms,
                    "endMs": source_end_ms,
                },
                "direction": "forward",
                "speed": 1.0,
                "viewTrackId": "view_main",
                "effectTrackIds": ["effects_main"],
                "transition": {
                    "in": {"type": "cut", "durationMs": 0},
                    "out": {"type": "cut", "durationMs": 0},
                },
            }
        )
        output_cursor += duration_ms
    return edit_segments


def timeline_effect_event(event: dict[str, Any]) -> dict[str, Any]:
    event_name = str(event.get("event_name", event.get("eventName", event.get("type", "custom.unknown"))))
    start_ms = int(event.get("start_ms", event.get("startMs", 0)))
    end_ms = int(event.get("end_ms", event.get("endMs", start_ms)))
    render_policy = event.get("render_policy", event.get("renderPolicy", {"fallback": "warn", "requires": []}))
    return {
        "eventId": str(event.get("event_id", event.get("eventId", f"fx_{start_ms}_{end_ms}_{event_name}"))),
        "type": event_name,
        "displayName": event.get("display_name", event.get("displayName")),
        "timeRef": str(event.get("time_ref", event.get("timeRef", "source"))),
        "startMs": start_ms,
        "endMs": end_ms,
        "enabled": bool(event.get("enabled", True)),
        "params": event.get("params") or {},
        "renderPolicy": render_policy,
        "resolvedEffect": describe_effect_event(
            {
                **event,
                "event_name": event_name,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "render_policy": render_policy,
            }
        ),
    }


def timeline_audio_track(track: dict[str, Any]) -> dict[str, Any]:
    music_id = track.get("music_id", track.get("musicId"))
    start_ms = int(track.get("start_ms", track.get("startMs", 0)))
    return {
        "trackId": str(track.get("track_id", track.get("trackId", "music_main"))),
        "kind": "music",
        "musicId": music_id,
        "displayName": track.get("display_name", track.get("displayName")),
        "timeRef": "output",
        "startMs": start_ms,
        "playback": {
            "mode": "one_shot",
            "align": "output_start",
            "loop": False,
        },
        "mix": {
            "gainDb": float(track.get("gain_db", track.get("gainDb", -10.0))),
            "ducking": None,
        },
        "source": {
            "filename": track.get("filename"),
            "durationMs": track.get("duration_ms", track.get("durationMs")),
        },
        "enabled": bool(track.get("enabled", True) and music_id),
    }


def detect_point_gaps(
    points: list[dict[str, Any]],
    *,
    soft_gap_ms: int,
    hard_gap_ms: int,
) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    for previous, current in zip(points, points[1:]):
        if not bool(previous.get("enabled", True)):
            continue
        duration_ms = int(current["t_ms"]) - int(previous["t_ms"])
        if duration_ms <= soft_gap_ms:
            continue
        gaps.append(
            {
                "range": {
                    "timeRef": "source",
                    "startMs": int(previous["t_ms"]),
                    "endMs": int(current["t_ms"]),
                },
                "durationMs": duration_ms,
                "severity": "error" if duration_ms > hard_gap_ms else "warning",
                "reason": "missing_points",
            }
        )
    return gaps


def timeline_status(edit_segments: list[dict[str, Any]], gaps: list[dict[str, Any]]) -> str:
    if not edit_segments:
        return "not_ready"
    if any(gap["severity"] == "error" for gap in gaps):
        return "partial"
    return "ready"


def build_warnings(status: str, gaps: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    if status == "partial":
        warnings.append("Timeline has hard point gaps; production render should wait for repair or replay.")
    if gaps:
        warnings.append(f"Detected {len(gaps)} point gap(s).")
    return warnings


def source_ranges(edit_segments: list[dict[str, Any]]) -> list[dict[str, int]]:
    return [segment["source"] for segment in edit_segments if segment["kind"] == "source"]
