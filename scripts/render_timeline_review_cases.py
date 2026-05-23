from __future__ import annotations

import json
import math
import shutil
import sys
import wave
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.rendering import run_frame_remap_equirect
from app.rendering.effects import events_for_segment
from app.rendering.path_pipeline import (
    build_enabled_render_segments,
    prepare_render_segment,
    relative_segment_points,
)
from app.storage import concat_segments_reencode, mux_music_to_video
from app.timeline_assembler import assemble_view_path_timeline


SOURCE = ROOT / "storage" / "sample-videos" / "equirect-grid.mp4"
DEMO_MUSIC = ROOT / "storage" / "music" / "demo-electro-loop.wav"
OUT_DIR = ROOT / "storage" / "exports" / "timeline-review"
TMP_DIR = ROOT / "storage" / "tmp" / "timeline-review"
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
    *,
    fov_h: float = FOV_H,
    fov_v: float = FOV_V,
    enabled: bool = True,
    cut: bool = False,
    interpolation: str = "linear",
    transition_ms: int = 0,
    seq: int = 0,
) -> dict[str, Any]:
    return {
        "seq": seq,
        "t_ms": float(t_ms),
        "yaw": float(yaw),
        "pitch": float(pitch),
        "fov_h": float(fov_h),
        "fov_v": float(fov_v),
        "roll": 0,
        "enabled": enabled,
        "cut": cut,
        "locked": False,
        "smooth_follow": True,
        "interpolation": interpolation,
        "transition_ms": float(transition_ms),
        "input": "head_gaze",
    }


def with_seq(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for index, item in enumerate(points, start=1):
        item["seq"] = index
    return points


def linear_points(
    *,
    start_yaw: float,
    end_yaw: float,
    start_pitch: float,
    end_pitch: float,
    duration_ms: int = DURATION_MS,
    step_ms: int = 1000,
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for t_ms in range(0, duration_ms + 1, step_ms):
        alpha = t_ms / max(duration_ms, 1)
        points.append(
            point(
                t_ms,
                start_yaw + (end_yaw - start_yaw) * alpha,
                start_pitch + (end_pitch - start_pitch) * alpha,
            )
        )
    if points[-1]["t_ms"] != duration_ms:
        points.append(point(duration_ms, end_yaw, end_pitch))
    return with_seq(points)


def effect(
    event_name: str,
    start_ms: int,
    end_ms: int,
    *,
    display_name: str,
    params: dict[str, Any] | None = None,
    fallback: str = "warn",
) -> dict[str, Any]:
    return {
        "event_name": event_name,
        "display_name": display_name,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "params": params or {},
        "enabled": True,
        "render_policy": {
            "fallback": fallback,
            "requires": [],
        },
    }


CASES: list[dict[str, Any]] = [
    {
        "name": "01_horizontal_yaw_90deg",
        "title": "水平旋转 90 度",
        "description": "Yaw 从 -45 到 +45，验证水平取景方向。",
        "points": linear_points(start_yaw=-45, end_yaw=45, start_pitch=0, end_pitch=0),
    },
    {
        "name": "02_vertical_pitch_90deg",
        "title": "垂直旋转 90 度",
        "description": "Pitch 从 -45 到 +45，验证上下取景方向。",
        "points": linear_points(start_yaw=0, end_yaw=0, start_pitch=-45, end_pitch=45),
    },
    {
        "name": "03_diagonal_yaw_pitch_90deg",
        "title": "斜向旋转 90 度",
        "description": "Yaw 和 Pitch 同时从 -45 到 +45，验证斜向取景路径。",
        "points": linear_points(start_yaw=-45, end_yaw=45, start_pitch=-45, end_pitch=45),
    },
    {
        "name": "04_jump_90deg_with_fast_fill",
        "title": "跳跃 90 度并补中间帧",
        "description": "3 秒处从 0 度快速转到 90 度，transitionMs=900，会展开中间帧。",
        "points": with_seq(
            [
                point(0, 0, 0),
                point(1000, 0, 0),
                point(2000, 0, 0),
                point(3000, 0, 0),
                point(3300, 30, 0, interpolation="fast", transition_ms=300),
                point(3600, 60, 0, interpolation="fast", transition_ms=300),
                point(3900, 90, 0, interpolation="fast", transition_ms=300),
                point(5000, 90, 0),
                point(DURATION_MS, 90, 0),
            ]
        ),
    },
    {
        "name": "05_black_field_transition",
        "title": "黑场转场",
        "description": "2.2s 淡出到黑场，2.8s-3.4s 纯黑，3.4s 淡入。",
        "points": linear_points(start_yaw=-25, end_yaw=25, start_pitch=0, end_pitch=0),
        "effects": [
            effect(
                "transition.fade_black",
                2200,
                2800,
                display_name="淡出黑场",
                params={"peakOpacity": 1.0, "direction": "out"},
            ),
            effect("black.solid", 2800, 3400, display_name="黑场", params={"opacity": 1.0}),
            effect(
                "transition.fade_black",
                3400,
                4000,
                display_name="淡入画面",
                params={"peakOpacity": 1.0, "direction": "in"},
            ),
        ],
    },
    {
        "name": "06_discard_middle_segment",
        "title": "放弃中间片段",
        "description": "2s-4s enabled=false，导出会跳过这一段，输出长度约 4 秒。",
        "points": with_seq(
            [
                point(0, 0, 0),
                point(1000, 5, 0),
                point(2000, 10, 0, enabled=False),
                point(4000, 20, 0, enabled=True),
                point(5000, 25, 0),
                point(DURATION_MS, 30, 0),
            ]
        ),
    },
    {
        "name": "07_free_event_names",
        "title": "自由事件名组合",
        "description": "使用 black.solid 和 transition.fade_black 验证自由事件名能被保存和渲染。",
        "points": linear_points(start_yaw=-30, end_yaw=30, start_pitch=0, end_pitch=0),
        "effects": [
            effect("transition.fade_black", 1200, 2200, display_name="自由事件名淡黑", params={"peakOpacity": 0.8}),
            effect("black.solid", 4300, 5000, display_name="自由事件名黑场", params={"opacity": 0.75}),
        ],
    },
    {
        "name": "08_effect_order_and_conflict",
        "title": "Effect order and conflict",
        "description": "Vignette/filter runs before overlay; black.solid wins over transition.fade_black in the frame.occlusion conflict group.",
        "points": linear_points(start_yaw=-35, end_yaw=35, start_pitch=-8, end_pitch=8),
        "effects": [
            effect("filter.vignette", 0, DURATION_MS, display_name="Vignette", params={"strength": 0.42}),
            effect(
                "highlight",
                700,
                5200,
                display_name="Warm highlight",
                params={"strength": 0.18, "warmth": 0.18},
            ),
            effect("transition.fade_black", 2100, 3900, display_name="Fade black", params={"peakOpacity": 0.9}),
            effect("black.solid", 2700, 3300, display_name="Solid black wins", params={"opacity": 1.0}),
            effect(
                "overlay.text",
                2400,
                4200,
                display_name="Text overlay",
                params={
                    "text": "ORDER TEST",
                    "position": "bottom_center",
                    "color": "#ffffff",
                    "backgroundOpacity": 0.55,
                    "scale": 1.15,
                },
            ),
        ],
    },
    {
        "name": "09_cinematic_effect_pack",
        "title": "Cinematic effect pack",
        "description": "Color grade, flash white, blur, chromatic aberration, vignette, letterbox, and text overlay in one short cut.",
        "points": with_seq(
            [
                point(0, -55, -12, fov_h=105, fov_v=vertical_fov_from_horizontal(105)),
                point(900, -25, -4, fov_h=95, fov_v=vertical_fov_from_horizontal(95)),
                point(1600, 15, 7, fov_h=82, fov_v=vertical_fov_from_horizontal(82)),
                point(2400, 50, 13, fov_h=72, fov_v=vertical_fov_from_horizontal(72)),
                point(3300, 15, -7, fov_h=86, fov_v=vertical_fov_from_horizontal(86)),
                point(4500, -32, 4, fov_h=92, fov_v=vertical_fov_from_horizontal(92)),
                point(DURATION_MS, 38, 0, fov_h=76, fov_v=vertical_fov_from_horizontal(76)),
            ]
        ),
        "effects": [
            effect(
                "filter.color_grade",
                0,
                DURATION_MS,
                display_name="Cinematic color",
                params={"strength": 0.92, "contrast": 1.16, "saturation": 1.18, "warmth": 0.18},
            ),
            effect("filter.vignette", 0, DURATION_MS, display_name="Vignette", params={"strength": 0.36}),
            effect("overlay.letterbox", 0, DURATION_MS, display_name="Letterbox", params={"ratio": 0.105}),
            effect(
                "transition.flash_white",
                850,
                1250,
                display_name="Flash white",
                params={"peakOpacity": 0.88},
            ),
            effect(
                "filter.chromatic_aberration",
                1400,
                2300,
                display_name="Chromatic impact",
                params={"strength": 1.0, "offsetPx": 9},
            ),
            effect("filter.blur", 2300, 3050, display_name="Focus blur", params={"radius": 23, "strength": 0.72}),
            effect(
                "overlay.text",
                3200,
                5550,
                display_name="Title",
                params={
                    "text": "WEBXR CUT",
                    "position": "bottom_center",
                    "color": "#ffffff",
                    "backgroundOpacity": 0.34,
                    "scale": 1.3,
                },
            ),
        ],
        "audioTracks": [
            {
                "track_id": "music_main",
                "music_id": "demo_electro_loop",
                "display_name": "Demo electro loop",
                "filename": "demo-electro-loop.wav",
                "duration_ms": DURATION_MS,
                "gain_db": -9.0,
                "enabled": True,
            }
        ],
    },
]


def render_case(case: dict[str, Any]) -> Path:
    name = str(case["name"])
    points = case["points"]
    effects = case.get("effects") or []
    segments = build_enabled_render_segments(points)
    if not segments:
        raise RuntimeError(f"{name}: no enabled segments")

    case_tmp = TMP_DIR / name
    case_tmp.mkdir(parents=True, exist_ok=True)
    segment_paths: list[Path] = []

    for index, segment in enumerate(segments):
        prepared = prepare_render_segment(
            segment,
            fps=FPS,
            max_yaw_rate=360,
            max_pitch_rate=360,
            max_fov_rate=360,
        )
        start_ms = int(float(prepared[0]["t_ms"]))
        end_ms = int(float(prepared[-1]["t_ms"]))
        duration_ms = end_ms - start_ms
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
            effect_events=events_for_segment(effects, start_ms, end_ms),
        )
        segment_paths.append(target)

    if not segment_paths:
        raise RuntimeError(f"{name}: no rendered segments")

    output_path = OUT_DIR / f"{name}.mp4"
    if len(segment_paths) == 1:
        shutil.copy2(segment_paths[0], output_path)
    else:
        concat_segments_reencode(segment_paths, case_tmp / "segments.txt", output_path, fps=FPS)
    if case.get("audioTracks"):
        ensure_demo_music(DURATION_MS)
        silent_path = case_tmp / "silent-output.mp4"
        shutil.move(output_path, silent_path)
        mux_music_to_video(silent_path, DEMO_MUSIC, output_path, DURATION_MS, gain_db=-9.0)
    return output_path


def ensure_demo_music(duration_ms: int) -> None:
    if DEMO_MUSIC.is_file():
        return
    DEMO_MUSIC.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 44_100
    total_samples = int(sample_rate * duration_ms / 1000)
    beat_seconds = 0.5
    rng_state = 17

    def noise() -> float:
        nonlocal rng_state
        rng_state = (1103515245 * rng_state + 12345) & 0x7FFFFFFF
        return (rng_state / 0x7FFFFFFF) * 2 - 1

    with wave.open(str(DEMO_MUSIC), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        frames = bytearray()
        for index in range(total_samples):
            t = index / sample_rate
            beat_t = t % beat_seconds
            kick_env = math.exp(-beat_t * 28) if beat_t < 0.18 else 0
            kick = math.sin(2 * math.pi * (52 + 28 * kick_env) * t) * kick_env * 0.82
            bass = math.sin(2 * math.pi * 110 * t) * 0.16
            hat_env = math.exp(-(t % 0.25) * 80)
            hat = noise() * hat_env * 0.08
            lead = math.sin(2 * math.pi * 440 * t) * 0.045 * (0.5 + 0.5 * math.sin(2 * math.pi * 0.25 * t))
            sample = max(-1.0, min(1.0, kick + bass + hat + lead))
            value = int(sample * 32767)
            frames.extend(value.to_bytes(2, "little", signed=True))
            frames.extend(value.to_bytes(2, "little", signed=True))
        audio.writeframes(bytes(frames))


def write_timeline(case: dict[str, Any]) -> Path:
    timeline = assemble_view_path_timeline(
        video_id="fixture_equirect_grid",
        session_id=str(case["name"]),
        duration_ms=12_000,
        points=case["points"],
        effects=case.get("effects") or [],
        audio_tracks=case.get("audioTracks") or [],
        source_filename=SOURCE.name,
        timeline_revision=1,
        created_at="2026-05-23T00:00:00Z",
    )
    timeline["review"] = {
        "title": case["title"],
        "description": case["description"],
        "sourceVideo": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
    }
    path = OUT_DIR / f"{case['name']}.timeline.json"
    path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def write_index(rendered: list[dict[str, str]]) -> Path:
    rows = "\n".join(
        f"""
        <section>
          <h2>{item["title"]}</h2>
          <p>{item["description"]}</p>
          <video controls preload="metadata" src="{item["video"]}"></video>
          <p><a href="{item["timeline"]}">timeline JSON</a></p>
        </section>
        """
        for item in rendered
    )
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>ViewPathTimeline Review Cases</title>
  <style>
    body {{
      margin: 0;
      padding: 24px;
      background: #111;
      color: #eee;
      font-family: Arial, sans-serif;
    }}
    h1 {{ margin: 0 0 8px; }}
    section {{
      margin: 24px 0;
      padding-top: 20px;
      border-top: 1px solid #333;
    }}
    video {{
      display: block;
      width: min(960px, 100%);
      background: #000;
    }}
    a {{ color: #8bd3ff; }}
    p {{ max-width: 900px; line-height: 1.5; }}
  </style>
</head>
<body>
  <h1>ViewPathTimeline Review Cases</h1>
  <p>源素材：storage/sample-videos/equirect-grid.mp4。每个视频旁边都有对应 timeline JSON。</p>
  {rows}
</body>
</html>
"""
    path = OUT_DIR / "index.html"
    path.write_text(html, encoding="utf-8")
    return path


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    rendered: list[dict[str, str]] = []
    for case in CASES:
        print(f"rendering {case['name']}")
        video_path = render_case(case)
        timeline_path = write_timeline(case)
        rendered.append(
            {
                "title": str(case["title"]),
                "description": str(case["description"]),
                "video": video_path.name,
                "timeline": timeline_path.name,
            }
        )

    index_path = write_index(rendered)
    print(index_path)


if __name__ == "__main__":
    main()
