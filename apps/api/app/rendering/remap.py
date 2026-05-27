from __future__ import annotations

import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .effects import apply_frame_effects

LINEAR_PROJECTIONS = {"flat", "linear", "rectilinear"}
LITTLE_PLANET_PROJECTIONS = {
    "crystal-ball",
    "crystal_ball",
    "little-planet",
    "little_planet",
    "stereographic",
    "tiny-planet",
    "tiny_planet",
}
PROJECTION_EFFECT_NAMES = {
    "frame.crystal_ball_pull",
    "frame.little_planet_pullback",
    "projection.crystal_ball",
    "projection.little_planet",
    "projection.stereographic",
    "projection.tiny_planet",
}
ANIMATED_PROJECTION_EFFECT_NAMES = {
    "frame.crystal_ball_pull",
    "frame.little_planet_pullback",
}


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
    projection: str = "linear",
    projection_params: dict[str, Any] | None = None,
    loop_source: bool = False,
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
    base_projection = normalize_projection_name(projection)
    base_projection_params = projection_params or {}
    post_remap_events = post_remap_frame_events(effect_events)

    output_x = (np.arange(output_width, dtype=np.float32) + 0.5) / output_width * 2 - 1
    output_y = 1 - (np.arange(output_height, dtype=np.float32) + 0.5) / output_height * 2
    output_u, output_v = np.meshgrid(output_x, output_y)

    decode_cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
    ]
    if loop_source:
        decode_cmd.extend(["-stream_loop", "-1"])
    decode_cmd.extend(
        [
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
    )
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
            yaw = interpolate_path_value(points, t_ms, "yaw")
            pitch = interpolate_path_value(points, t_ms, "pitch")
            h_fov = interpolate_path_value(points, t_ms, "fov_h")
            v_fov = interpolate_path_value(points, t_ms, "fov_v")
            projection_state = resolve_projection_state(
                effect_events,
                t_ms,
                base_projection,
                base_projection_params,
            )
            rendered_frame = remap_frame_with_projection(
                cv2,
                source_frame,
                source_width,
                source_height,
                output_u,
                output_v,
                yaw,
                pitch,
                h_fov,
                v_fov,
                projection_state,
            )
            rendered_frame = apply_frame_effects(rendered_frame, t_ms, post_remap_events)
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


def normalize_projection_name(value: str | None) -> str:
    projection = (value or "linear").strip().lower()
    if projection in LINEAR_PROJECTIONS:
        return "linear"
    if projection in LITTLE_PLANET_PROJECTIONS:
        return "little_planet"
    raise RuntimeError(f"Unsupported equirect remap projection: {value}")


def effect_event_name(event: dict[str, Any]) -> str:
    return str(event.get("event_name", event.get("eventName", event.get("type", ""))))


def is_projection_effect(event: dict[str, Any]) -> bool:
    return effect_event_name(event) in PROJECTION_EFFECT_NAMES


def post_remap_frame_events(events: list[dict[str, Any]] | None) -> list[dict[str, Any]] | None:
    if not events:
        return events
    return [event for event in events if not is_projection_effect(event)]


def is_event_active(event: dict[str, Any], t_ms: int) -> bool:
    if not event.get("enabled", True):
        return False
    return int(event.get("start_ms", event.get("startMs", 0))) <= t_ms < int(
        event.get("end_ms", event.get("endMs", 0))
    )


def read_float_param(params: dict[str, Any], keys: tuple[str, ...], fallback: float) -> float:
    for key in keys:
        value = params.get(key)
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            return float(value)
    return fallback


def ease_out_cubic(value: float) -> float:
    t = clamp_float(value, 0, 1)
    return 1 - math.pow(1 - t, 3)


def ease_in_out_quad(value: float) -> float:
    t = clamp_float(value, 0, 1)
    if t < 0.5:
        return 2 * t * t
    return 1 - math.pow(-2 * t + 2, 2) / 2


def lerp_float(start: float, end: float, progress: float) -> float:
    return start + (end - start) * clamp_float(progress, 0, 1)


def little_planet_event_progress(event: dict[str, Any], t_ms: int) -> float:
    params = event.get("params") or {}
    fixed_progress = params.get("progress", params.get("strength"))
    if isinstance(fixed_progress, (int, float)) and math.isfinite(float(fixed_progress)):
        return clamp_float(float(fixed_progress), 0, 1)

    start_ms = int(event.get("start_ms", event.get("startMs", 0)))
    end_ms = int(event.get("end_ms", event.get("endMs", start_ms + 1)))
    duration_ms = max(end_ms - start_ms, 1)
    local_ms = clamp_float(t_ms - start_ms, 0, duration_ms)

    if effect_event_name(event) not in ANIMATED_PROJECTION_EFFECT_NAMES:
        return 1

    peak_at_ms = clamp_float(
        read_float_param(params, ("peakAtMs", "peak_at_ms"), duration_ms * 0.35),
        1,
        duration_ms,
    )
    if local_ms <= peak_at_ms:
        return ease_out_cubic(local_ms / peak_at_ms)

    tail_ms = max(duration_ms - peak_at_ms, 1)
    return 1 - ease_in_out_quad((local_ms - peak_at_ms) / tail_ms)


def resolve_projection_state(
    events: list[dict[str, Any]] | None,
    t_ms: int,
    base_projection: str,
    base_params: dict[str, Any],
) -> dict[str, Any]:
    if events:
        for event in reversed(events):
            if is_projection_effect(event) and is_event_active(event, t_ms):
                params = {**base_params, **(event.get("params") or {})}
                return {
                    "progress": little_planet_event_progress(event, t_ms),
                    "params": params,
                    "projection": "little_planet",
                }

    return {
        "progress": 1 if base_projection == "little_planet" else 0,
        "params": base_params,
        "projection": base_projection,
    }


def remap_frame_with_projection(
    cv2: Any,
    source_frame: Any,
    source_width: int,
    source_height: int,
    output_u: Any,
    output_v: Any,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
    projection_state: dict[str, Any],
) -> Any:
    projection = projection_state.get("projection", "linear")
    progress = clamp_float(float(projection_state.get("progress", 0)), 0, 1)

    if projection == "linear" or progress <= 0:
        map_x, map_y = build_equirect_to_flat_maps(
            source_width,
            source_height,
            output_u,
            output_v,
            yaw,
            pitch,
            h_fov,
            v_fov,
        )
        return remap_frame(cv2, source_frame, map_x, map_y)

    projection_params = animated_little_planet_params(
        projection_state.get("params") or {},
        pitch,
        h_fov,
        progress,
    )
    if progress >= 0.999:
        planet_map_x, planet_map_y = build_equirect_to_little_planet_maps(
            source_width,
            source_height,
            output_u,
            output_v,
            yaw,
            projection_params,
        )
    else:
        planet_map_x, planet_map_y = build_equirect_to_little_planet_motion_maps(
            source_width,
            source_height,
            output_u,
            output_v,
            yaw,
            pitch,
            h_fov,
            v_fov,
            projection_params,
            progress,
        )
    return remap_frame(cv2, source_frame, planet_map_x, planet_map_y)


def remap_frame(cv2: Any, source_frame: Any, map_x: Any, map_y: Any) -> Any:
    return cv2.remap(
        source_frame,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


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
    x_world, y_world, z_world = build_flat_direction_vectors(
        output_u,
        output_v,
        yaw,
        pitch,
        h_fov,
        v_fov,
    )
    return direction_vectors_to_equirect_maps(source_width, source_height, x_world, y_world, z_world)


def build_flat_direction_vectors(
    output_u: Any,
    output_v: Any,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
) -> tuple[Any, Any, Any]:
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

    return x_world, y_pitch, z_world


def build_equirect_to_little_planet_maps(
    source_width: int,
    source_height: int,
    output_u: Any,
    output_v: Any,
    yaw: float,
    params: dict[str, Any] | None = None,
) -> tuple[Any, Any]:
    x_world, y_world, z_world = build_little_planet_direction_vectors(
        output_u,
        output_v,
        yaw,
        params,
    )
    return direction_vectors_to_equirect_maps(source_width, source_height, x_world, y_world, z_world)


def build_equirect_to_little_planet_motion_maps(
    source_width: int,
    source_height: int,
    output_u: Any,
    output_v: Any,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
    params: dict[str, Any],
    progress: float,
) -> tuple[Any, Any]:
    import numpy as np

    linear_x, linear_y, linear_z = build_flat_direction_vectors(
        output_u,
        output_v,
        yaw,
        pitch,
        h_fov,
        v_fov,
    )
    planet_x, planet_y, planet_z = build_little_planet_direction_vectors(
        output_u,
        output_v,
        yaw,
        params,
    )
    safe_progress = clamp_float(progress, 0, 1)
    x_world = linear_x * (1 - safe_progress) + planet_x * safe_progress
    y_world = linear_y * (1 - safe_progress) + planet_y * safe_progress
    z_world = linear_z * (1 - safe_progress) + planet_z * safe_progress
    norm = np.sqrt(x_world * x_world + y_world * y_world + z_world * z_world)
    norm = np.maximum(norm, 1e-6)
    return direction_vectors_to_equirect_maps(
        source_width,
        source_height,
        x_world / norm,
        y_world / norm,
        z_world / norm,
    )


def build_little_planet_direction_vectors(
    output_u: Any,
    output_v: Any,
    yaw: float,
    params: dict[str, Any] | None = None,
) -> tuple[Any, Any, Any]:
    import numpy as np

    params = params or {}
    height, width = output_u.shape[:2]
    aspect = width / max(height, 1)
    default_scale = little_planet_scale_from_fov(
        read_float_param(params, ("sphereFov", "peakSphereFov", "projectionFov"), 164)
    )
    scale = clamp_float(read_float_param(params, ("scale", "zoom", "planetScale"), default_scale), 0.05, 10)
    center_yaw = yaw + read_float_param(params, ("yawOffset", "yaw_offset"), 0)
    center_pitch = read_float_param(
        params,
        ("centerPitch", "center_pitch", "planetPitch", "peakPitch"),
        -90,
    )
    roll = read_float_param(params, ("roll", "rotation"), 0)

    x = output_u * aspect
    y = output_v
    if roll:
        roll_rad = math.radians(roll)
        roll_cos = math.cos(roll_rad)
        roll_sin = math.sin(roll_rad)
        x, y = x * roll_cos - y * roll_sin, x * roll_sin + y * roll_cos

    radius = np.sqrt(x * x + y * y) / scale
    phi = np.arctan2(y, x)
    theta = 2 * np.arctan(radius)

    yaw_rad = math.radians(center_yaw)
    pitch_rad = math.radians(clamp_float(center_pitch, -90, 90))
    yaw_sin = math.sin(yaw_rad)
    yaw_cos = math.cos(yaw_rad)
    pitch_sin = math.sin(pitch_rad)
    pitch_cos = math.cos(pitch_rad)

    center_x = yaw_sin * pitch_cos
    center_y = pitch_sin
    center_z = yaw_cos * pitch_cos

    right_x = yaw_cos
    right_y = 0
    right_z = -yaw_sin

    up_x = -pitch_sin * yaw_sin
    up_y = pitch_cos
    up_z = -pitch_sin * yaw_cos

    sin_theta = np.sin(theta)
    cos_theta = np.cos(theta)
    cos_phi = np.cos(phi)
    sin_phi = np.sin(phi)

    x_world = cos_theta * center_x + sin_theta * (cos_phi * right_x + sin_phi * up_x)
    y_world = cos_theta * center_y + sin_theta * (cos_phi * right_y + sin_phi * up_y)
    z_world = cos_theta * center_z + sin_theta * (cos_phi * right_z + sin_phi * up_z)

    return x_world, y_world, z_world


def direction_vectors_to_equirect_maps(
    source_width: int,
    source_height: int,
    x_world: Any,
    y_world: Any,
    z_world: Any,
) -> tuple[Any, Any]:
    import numpy as np

    longitude = np.arctan2(x_world, z_world)
    latitude = np.arcsin(np.clip(y_world, -1, 1))

    map_x = ((longitude / (2 * math.pi) + 0.5) * source_width) % source_width
    map_y = (0.5 - latitude / math.pi) * source_height
    map_y = np.clip(map_y, 0, source_height - 1)
    return map_x.astype(np.float32), map_y.astype(np.float32)


def animated_little_planet_params(
    params: dict[str, Any],
    current_pitch: float,
    current_h_fov: float,
    progress: float,
) -> dict[str, Any]:
    target_fov = read_float_param(params, ("sphereFov", "peakSphereFov", "projectionFov"), 175)
    start_fov = read_float_param(params, ("startSphereFov", "startProjectionFov"), current_h_fov)
    target_scale = read_float_param(
        params,
        ("scale", "zoom", "planetScale"),
        little_planet_scale_from_fov(target_fov),
    )
    start_scale = read_float_param(
        params,
        ("startScale", "startZoom", "startPlanetScale"),
        little_planet_scale_from_fov(start_fov),
    )
    target_pitch = read_float_param(
        params,
        ("centerPitch", "center_pitch", "planetPitch", "peakPitch"),
        -88,
    )
    start_pitch = read_float_param(
        params,
        ("startCenterPitch", "start_center_pitch", "startPlanetPitch"),
        current_pitch,
    )
    target_roll = read_float_param(params, ("roll", "rotation", "peakRoll"), 0)
    start_roll = read_float_param(params, ("startRoll", "startRotation"), 0)
    target_yaw_offset = read_float_param(params, ("yawOffset", "yaw_offset"), 0)
    start_yaw_offset = read_float_param(params, ("startYawOffset", "start_yaw_offset"), 0)

    return {
        **params,
        "centerPitch": lerp_float(start_pitch, target_pitch, progress),
        "roll": lerp_float(start_roll, target_roll, progress),
        "scale": lerp_float(start_scale, target_scale, progress),
        "yawOffset": lerp_float(start_yaw_offset, target_yaw_offset, progress),
    }


def little_planet_scale_from_fov(fov_degrees: float) -> float:
    safe_fov = math.radians(clamp_float(fov_degrees, 1, 340))
    return 1 / max(math.tan(safe_fov / 4), 1e-6)


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
