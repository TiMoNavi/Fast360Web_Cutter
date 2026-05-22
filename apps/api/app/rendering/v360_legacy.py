from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


"""
Legacy FFmpeg v360 helpers kept only for geometry comparison and debugging.

Do not use this module as the current render-test path. The dynamic
`sendcmd + v360` path produced non-expected roll during validation, and the
chunked static path produced visible stepping. The current smoke renderer is
`rendering.remap.run_frame_remap_equirect`.
"""

ROOT_DIR = Path(__file__).resolve().parents[4]


def run_ffmpeg_segment_v360(
    source_path: Path,
    target_path: Path,
    start_ms: int,
    duration_ms: int,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
    fps: int = 30,
) -> None:
    duration_seconds = max(duration_ms / 1000, 0.05)
    start_seconds = max(start_ms / 1000, 0)
    vf = (
        "v360=input=equirect:output=flat:"
        f"yaw={yaw:.4f}:pitch={pitch:.4f}:"
        f"h_fov={h_fov:.4f}:v_fov={v_fov:.4f}:w=1280:h=720,"
        f"fps={fps},"
        "format=yuv420p"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-i",
        str(source_path),
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=60)


def run_ffmpeg_chunked_v360_legacy(
    source_path: Path,
    target_path: Path,
    work_dir: Path,
    points: list[dict[str, float]],
    duration_ms: int,
    source_start_ms: int = 0,
    chunk_ms: int = 500,
    fps: int = 30,
) -> None:
    if len(points) < 2:
        raise RuntimeError("Need at least two path points for chunked render")

    work_dir.mkdir(parents=True, exist_ok=True)
    chunk_paths: list[Path] = []
    current_ms = 0
    chunk_index = 0
    while current_ms < duration_ms:
        next_ms = min(current_ms + chunk_ms, duration_ms)
        chunk_duration_ms = next_ms - current_ms
        sample_ms = current_ms + chunk_duration_ms // 2
        chunk_path = work_dir / f"chunk-{chunk_index:04d}.mp4"
        run_ffmpeg_segment_v360(
            source_path,
            chunk_path,
            source_start_ms + current_ms,
            chunk_duration_ms,
            interpolate_path_value(points, sample_ms, "yaw"),
            interpolate_path_value(points, sample_ms, "pitch"),
            interpolate_path_value(points, sample_ms, "fov_h"),
            interpolate_path_value(points, sample_ms, "fov_v"),
            fps=fps,
        )
        chunk_paths.append(chunk_path)
        chunk_index += 1
        current_ms = next_ms

    if not chunk_paths:
        raise RuntimeError("No chunks rendered")
    if len(chunk_paths) == 1:
        shutil.copy2(chunk_paths[0], target_path)
    else:
        concat_segments_reencode(chunk_paths, work_dir / "chunks.txt", target_path, fps=fps)


def run_ffmpeg_dynamic_v360_legacy(
    source_path: Path,
    target_path: Path,
    command_path: Path,
    points: list[dict[str, float]],
    duration_ms: int,
    source_start_ms: int = 0,
    fps: int = 30,
) -> None:
    if len(points) < 2:
        raise RuntimeError("Need at least two path points for dynamic render")

    frame_step_ms = max(int(1000 / fps), 1)
    command_lines: list[str] = []
    for t_ms in range(0, duration_ms + frame_step_ms, frame_step_ms):
        clamped_t_ms = min(t_ms, duration_ms)
        timestamp = clamped_t_ms / 1000
        yaw = interpolate_path_value(points, clamped_t_ms, "yaw")
        pitch = interpolate_path_value(points, clamped_t_ms, "pitch")
        h_fov = interpolate_path_value(points, clamped_t_ms, "fov_h")
        v_fov = interpolate_path_value(points, clamped_t_ms, "fov_v")
        command_lines.extend(
            [
                f"{timestamp:.3f} v360 yaw {yaw:.6f};",
                f"{timestamp:.3f} v360 pitch {pitch:.6f};",
                f"{timestamp:.3f} v360 h_fov {h_fov:.6f};",
                f"{timestamp:.3f} v360 v_fov {v_fov:.6f};",
            ]
        )
    command_path.write_text("\n".join(command_lines) + "\n", encoding="utf-8")

    command_file = command_path.relative_to(ROOT_DIR).as_posix()
    vf = (
        f"sendcmd=f={command_file},"
        "v360@v360=input=equirect:output=flat:"
        f"yaw={float(points[0]['yaw']):.6f}:pitch={float(points[0]['pitch']):.6f}:"
        f"h_fov={float(points[0]['fov_h']):.6f}:v_fov={float(points[0]['fov_v']):.6f}:"
        f"w=1280:h=720,fps={fps},format=yuv420p"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{max(source_start_ms / 1000, 0):.3f}",
        "-t",
        f"{duration_ms / 1000:.3f}",
        "-i",
        str(source_path),
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120, cwd=ROOT_DIR)


def concat_segments_reencode(segment_paths: list[Path], list_path: Path, target_path: Path, fps: int = 30) -> None:
    lines = []
    for path in segment_paths:
        escaped = path.as_posix().replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    list_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
        "-vf",
        f"fps={fps},format=yuv420p",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120)


def interpolate_path_value(points: list[dict[str, float]], t_ms: int, key: str) -> float:
    if t_ms <= points[0]["t_ms"]:
        return float(points[0][key])
    if t_ms >= points[-1]["t_ms"]:
        return float(points[-1][key])
    for index in range(len(points) - 1):
        left = points[index]
        right = points[index + 1]
        if left["t_ms"] <= t_ms <= right["t_ms"]:
            span = max(right["t_ms"] - left["t_ms"], 1)
            alpha = (t_ms - left["t_ms"]) / span
            return float(left[key]) + (float(right[key]) - float(left[key])) * alpha
    return float(points[-1][key])
