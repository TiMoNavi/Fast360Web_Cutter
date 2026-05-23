from __future__ import annotations

import shutil
import sys
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.rendering import run_frame_remap_equirect
from app.rendering.path_pipeline import (
    build_enabled_render_segments,
    prepare_render_segment,
    relative_segment_points,
)
from app.rendering.effects import events_for_segment


SOURCE = ROOT / "storage" / "sample-videos" / "pano.mp4"
OUT_DIR = ROOT / "storage" / "exports" / "unit-cases"
TMP_DIR = ROOT / "storage" / "tmp" / "unit-cases"
FPS = 30
DURATION_MS = 6000
FOV_H = 90.0


def vertical_fov_from_horizontal(horizontal_fov: float, aspect_ratio: float = 16 / 9) -> float:
    return round(math.degrees(2 * math.atan(math.tan(math.radians(horizontal_fov) / 2) / aspect_ratio)), 2)


FOV_V = vertical_fov_from_horizontal(FOV_H)


def point(
    t_ms: int,
    yaw: float,
    pitch: float,
    fov_h: float = FOV_H,
    fov_v: float = FOV_V,
    enabled: bool = True,
    cut: bool = False,
    interpolation: str = "linear",
    transition_ms: int = 0,
) -> dict[str, float | bool | str]:
    return {
        "t_ms": float(t_ms),
        "yaw": float(yaw),
        "pitch": float(pitch),
        "fov_h": float(fov_h),
        "fov_v": float(fov_v),
        "enabled": enabled,
        "cut": cut,
        "interpolation": interpolation,
        "transition_ms": float(transition_ms),
    }


CASES: dict[str, list[dict[str, float | bool | str]]] = {
    "01_horizontal_60deg": [
        point(0, -30, 0),
        point(DURATION_MS, 30, 0),
    ],
    "02_vertical_60deg": [
        point(0, 0, -30),
        point(DURATION_MS, 0, 30),
    ],
    "03_diagonal_60deg": [
        point(0, -30, -30),
        point(DURATION_MS, 30, 30),
    ],
    "04_fov_zoom_in_out": [
        point(0, 0, 0, 100, vertical_fov_from_horizontal(100)),
        point(3000, 0, 0, 55, 30.9375),
        point(DURATION_MS, 0, 0, 100, vertical_fov_from_horizontal(100)),
    ],
    "05_skip_2s_4s_no_black": [
        point(0, 0, 0),
        point(2000, 2, 0, cut=True),
        point(4000, 4, 0, enabled=False),
        point(DURATION_MS, 6, 0, enabled=True),
    ],
    "06_fast_cut_90deg": [
        point(0, 0, 0),
        point(3000, 0, 0),
        point(3300, 90, 0, interpolation="fast", transition_ms=300),
        point(DURATION_MS, 90, 0),
    ],
    "07_effect_fade_black_highlight": [
        point(0, -20, 0),
        point(3000, 0, 0),
        point(DURATION_MS, 20, 0),
    ],
}


EFFECT_CASES: dict[str, list[dict[str, object]]] = {
    "07_effect_fade_black_highlight": [
        {
            "event_name": "transition.fade_black",
            "start_ms": 1500,
            "end_ms": 2500,
            "params": {"peakOpacity": 0.9},
            "enabled": True,
        },
        {
            "event_name": "highlight",
            "start_ms": 3200,
            "end_ms": 5200,
            "params": {"strength": 0.35, "warmth": 0.18, "bloom": 0.22},
            "enabled": True,
        },
    ],
}


def render_case(
    name: str,
    points: list[dict[str, float | bool | str]],
    effect_events: list[dict[str, object]] | None = None,
) -> None:
    segments = build_enabled_render_segments(points)
    if not segments:
        raise RuntimeError(f"{name}: no enabled segments")

    segment_paths: list[Path] = []
    case_tmp = TMP_DIR / name
    case_tmp.mkdir(parents=True, exist_ok=True)
    for index, segment in enumerate(segments):
        prepared = prepare_render_segment(segment, fps=FPS)
        start_ms = int(float(prepared[0]["t_ms"]))
        duration_ms = int(float(prepared[-1]["t_ms"]) - float(prepared[0]["t_ms"]))
        if duration_ms <= 0:
            continue
        target = case_tmp / f"segment-{index:03d}.mp4"
        run_frame_remap_equirect(
            SOURCE,
            target,
            case_tmp / f"work-{index:03d}",
            relative_segment_points(prepared),
            duration_ms,
            source_start_ms=start_ms,
            fps=FPS,
            effect_events=events_for_segment(effect_events or [], start_ms, int(float(prepared[-1]["t_ms"]))),
        )
        segment_paths.append(target)

    if not segment_paths:
        raise RuntimeError(f"{name}: no rendered segments")

    output_path = OUT_DIR / f"{name}.mp4"
    if len(segment_paths) == 1:
        shutil.copy2(segment_paths[0], output_path)
    else:
        from app.storage import concat_segments_reencode

        concat_segments_reencode(segment_paths, case_tmp / "segments.txt", output_path, fps=FPS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    for name, points in CASES.items():
        print(f"rendering {name}")
        render_case(name, points, EFFECT_CASES.get(name))
    print(OUT_DIR)


if __name__ == "__main__":
    main()
