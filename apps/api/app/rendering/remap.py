from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .effects import apply_frame_effects


def run_frame_remap_equirect(
    source_path: Path,
    target_path: Path,
    work_dir: Path,
    points: list[dict[str, float]],
    duration_ms: int,
    source_start_ms: int = 0,
    fps: int = 30,
    output_width: int = 1280,
    output_height: int = 720,
    effect_events: list[dict[str, Any]] | None = None,
) -> None:
    if len(points) < 2:
        raise RuntimeError("Need at least two path points for frame remap render")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required for frame remap render")

    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("Frame remap render requires numpy and opencv-python-headless") from exc

    source_width, source_height = probe_video_dimensions(source_path)
    if source_width <= 0 or source_height <= 0:
        raise RuntimeError("Could not probe source video dimensions")

    work_dir.mkdir(parents=True, exist_ok=True)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    duration_seconds = max(duration_ms / 1000, 0.05)
    start_seconds = max(source_start_ms / 1000, 0)
    expected_frames = max(1, math.ceil(duration_seconds * fps))
    source_frame_bytes = source_width * source_height * 3

    output_x = (np.arange(output_width, dtype=np.float32) + 0.5) / output_width * 2 - 1
    output_y = 1 - (np.arange(output_height, dtype=np.float32) + 0.5) / output_height * 2
    output_u, output_v = np.meshgrid(output_x, output_y)

    decode_cmd = [
        "ffmpeg",
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
        f"fps={fps}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "pipe:1",
    ]
    encode_cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{output_width}x{output_height}",
        "-r",
        str(fps),
        "-i",
        "pipe:0",
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

    decoder = subprocess.Popen(decode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    encoder = subprocess.Popen(encode_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    rendered_frames = 0
    try:
        if decoder.stdout is None or encoder.stdin is None:
            raise RuntimeError("Could not open ffmpeg frame pipes")
        for frame_index in range(expected_frames):
            raw_frame = read_exact(decoder.stdout, source_frame_bytes)
            if len(raw_frame) != source_frame_bytes:
                break
            source_frame = np.frombuffer(raw_frame, dtype=np.uint8).reshape(
                (source_height, source_width, 3)
            )
            t_ms = min(round(frame_index * 1000 / fps), duration_ms)
            map_x, map_y = build_equirect_to_flat_maps(
                source_width,
                source_height,
                output_u,
                output_v,
                interpolate_path_value(points, t_ms, "yaw"),
                interpolate_path_value(points, t_ms, "pitch"),
                interpolate_path_value(points, t_ms, "fov_h"),
                interpolate_path_value(points, t_ms, "fov_v"),
            )
            rendered_frame = cv2.remap(
                source_frame,
                map_x,
                map_y,
                interpolation=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            )
            rendered_frame = apply_frame_effects(rendered_frame, t_ms, effect_events)
            encoder.stdin.write(rendered_frame.tobytes())
            rendered_frames += 1
    finally:
        if decoder.stdout is not None:
            decoder.stdout.close()
        if encoder.stdin is not None:
            encoder.stdin.close()

    decoder_stderr = decoder.stderr.read().decode("utf-8", errors="replace") if decoder.stderr else ""
    encoder_stderr = encoder.stderr.read().decode("utf-8", errors="replace") if encoder.stderr else ""
    decoder_returncode = decoder.wait()
    encoder_returncode = encoder.wait()

    if rendered_frames == 0:
        raise RuntimeError("No frames rendered by frame remap pipeline")
    if decoder_returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {decoder_stderr.strip()}")
    if encoder_returncode != 0:
        raise RuntimeError(f"ffmpeg encode failed: {encoder_stderr.strip()}")


def probe_video_dimensions(path: Path) -> tuple[int, int]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=15)
        raw = json.loads(result.stdout)
        stream = (raw.get("streams") or [{}])[0]
        return int(stream.get("width") or 0), int(stream.get("height") or 0)
    except (subprocess.SubprocessError, json.JSONDecodeError, TypeError, ValueError):
        return 0, 0


def read_exact(stream: Any, byte_count: int) -> bytes:
    chunks: list[bytes] = []
    remaining = byte_count
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def build_equirect_to_flat_maps(
    source_width: int,
    source_height: int,
    output_u: Any,
    output_v: Any,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
) -> tuple[Any, Any]:
    import numpy as np

    safe_h_fov = math.radians(clamp_float(h_fov, 1, 179))
    safe_v_fov = math.radians(clamp_float(v_fov, 1, 179))
    yaw_rad = math.radians(yaw)
    pitch_rad = math.radians(pitch)

    x = output_u * math.tan(safe_h_fov / 2)
    y = output_v * math.tan(safe_v_fov / 2)
    z = np.ones_like(x)

    norm = np.sqrt(x * x + y * y + z * z)
    x = x / norm
    y = y / norm
    z = z / norm

    pitch_cos = math.cos(pitch_rad)
    pitch_sin = math.sin(pitch_rad)
    y_pitch = y * pitch_cos + z * pitch_sin
    z_pitch = -y * pitch_sin + z * pitch_cos

    yaw_cos = math.cos(yaw_rad)
    yaw_sin = math.sin(yaw_rad)
    x_world = x * yaw_cos + z_pitch * yaw_sin
    z_world = -x * yaw_sin + z_pitch * yaw_cos

    longitude = np.arctan2(x_world, z_world)
    latitude = np.arcsin(np.clip(y_pitch, -1, 1))

    map_x = ((longitude / (2 * math.pi) + 0.5) * source_width) % source_width
    map_y = (0.5 - latitude / math.pi) * source_height
    map_y = np.clip(map_y, 0, source_height - 1)
    return map_x.astype(np.float32), map_y.astype(np.float32)


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
