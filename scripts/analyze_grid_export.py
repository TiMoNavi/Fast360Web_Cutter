from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def expected_red_axis_x(width: int, yaw: float, h_fov: float) -> float:
    x_norm = -math.tan(math.radians(yaw)) / math.tan(math.radians(h_fov) / 2)
    return (clamp(x_norm, -1.0, 1.0) + 1.0) * width / 2


def expected_latitude_y(height: int, pitch: float, v_fov: float, latitude: float) -> float:
    y_norm = math.tan(math.radians(latitude - pitch)) / math.tan(math.radians(v_fov) / 2)
    return (1.0 - clamp(y_norm, -1.0, 1.0)) * height / 2


def angular_delta_degrees(value: float, target: float) -> float:
    delta = value - target
    while delta > 180:
        delta -= 360
    while delta < -180:
        delta += 360
    return delta


def pixel_lon_lat(
    x: np.ndarray,
    y: np.ndarray,
    *,
    width: int,
    height: int,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
) -> tuple[np.ndarray, np.ndarray]:
    output_u = (x + 0.5) / width * 2 - 1
    output_v = 1 - (y + 0.5) / height * 2
    camera_x = output_u * math.tan(math.radians(h_fov) / 2)
    camera_y = output_v * math.tan(math.radians(v_fov) / 2)
    camera_z = np.ones_like(camera_x)
    norm = np.sqrt(camera_x * camera_x + camera_y * camera_y + camera_z * camera_z)
    camera_x = camera_x / norm
    camera_y = camera_y / norm
    camera_z = camera_z / norm

    pitch_rad = math.radians(pitch)
    pitch_cos = math.cos(pitch_rad)
    pitch_sin = math.sin(pitch_rad)
    y_pitch = camera_y * pitch_cos + camera_z * pitch_sin
    z_pitch = -camera_y * pitch_sin + camera_z * pitch_cos

    yaw_rad = math.radians(yaw)
    yaw_cos = math.cos(yaw_rad)
    yaw_sin = math.sin(yaw_rad)
    x_world = camera_x * yaw_cos + z_pitch * yaw_sin
    z_world = -camera_x * yaw_sin + z_pitch * yaw_cos

    longitude = np.degrees(np.arctan2(x_world, z_world))
    latitude = np.degrees(np.arcsin(np.clip(y_pitch, -1, 1)))
    return longitude, latitude


def expected_longitude_x(
    width: int,
    height: int,
    *,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
    longitude: float,
) -> float | None:
    xs = np.arange(width, dtype=np.float64)
    ys = np.full_like(xs, (height - 1) / 2)
    lon, _ = pixel_lon_lat(xs, ys, width=width, height=height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov)
    delta = np.vectorize(angular_delta_degrees)(lon, longitude)
    index = int(np.argmin(np.abs(delta)))
    if abs(float(delta[index])) > 1.5:
        return None
    return float(index)


def expected_latitude_center_y(
    width: int,
    height: int,
    *,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
    latitude: float,
) -> float | None:
    ys = np.arange(height, dtype=np.float64)
    xs = np.full_like(ys, (width - 1) / 2)
    _, lat = pixel_lon_lat(xs, ys, width=width, height=height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov)
    index = int(np.argmin(np.abs(lat - latitude)))
    if abs(float(lat[index] - latitude)) > 1.5:
        return None
    return float(index)


def choose_visible_latitude(height: int, pitch: float, v_fov: float) -> tuple[float, float]:
    candidates = []
    for latitude in (-60.0, -30.0, 0.0, 30.0, 60.0):
        y = expected_latitude_y(height, pitch, v_fov, latitude)
        if 24 <= y <= height - 24:
            candidates.append((abs(latitude), latitude, y))
    if not candidates:
        latitude = min((-60.0, -30.0, 0.0, 30.0, 60.0), key=lambda item: abs(item - pitch))
        return latitude, expected_latitude_y(height, pitch, v_fov, latitude)
    _, latitude, y = min(candidates)
    return latitude, y


def read_last_frame(video_path: Path) -> np.ndarray:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if frame_count > 2:
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_count - 2)

    last_frame = None
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        last_frame = frame

    capture.release()
    if last_frame is None:
        raise RuntimeError(f"Could not read a frame from video: {video_path}")
    return last_frame


def detect_red_axis_x(frame: np.ndarray) -> float:
    b, g, r = cv2.split(frame)
    mask = (r > 135) & (g < 115) & (b < 115)
    scores = mask.sum(axis=0)
    if int(scores.max()) < 12:
        raise RuntimeError("Could not find the red yaw axis in the exported frame")
    return float(np.argmax(scores))


def detect_latitude_axis_y(frame: np.ndarray, expected_y: float, search_radius: int = 110) -> float:
    height, width = frame.shape[:2]
    b, g, r = cv2.split(frame)
    brightness = np.maximum.reduce([b, g, r])
    saturation = np.maximum.reduce([b, g, r]) - np.minimum.reduce([b, g, r])
    mask = (brightness > 72) & ((saturation > 16) | (brightness > 145))
    x0 = round(width * 0.44)
    x1 = round(width * 0.56)
    y0 = max(0, round(expected_y - search_radius))
    y1 = min(height, round(expected_y + search_radius + 1))
    scores = mask[y0:y1, x0:x1].sum(axis=1)
    threshold = max(12, int(scores.max()) * 0.35)
    candidates = np.where(scores >= threshold)[0]
    if not len(candidates):
        raise RuntimeError("Could not find a visible latitude axis in the exported frame")
    best = min(candidates, key=lambda index: abs((y0 + int(index)) - expected_y))
    return float(y0 + int(best))


def grid_mask(frame: np.ndarray) -> np.ndarray:
    b, g, r = cv2.split(frame)
    brightness = np.maximum.reduce([b, g, r])
    saturation = np.maximum.reduce([b, g, r]) - np.minimum.reduce([b, g, r])
    return (brightness > 72) & ((saturation > 16) | (brightness > 145))


def detect_grid_x(frame: np.ndarray, expected_x: float, search_radius: int = 90) -> float:
    height, width = frame.shape[:2]
    mask = grid_mask(frame)
    x0 = max(0, round(expected_x - search_radius))
    x1 = min(width, round(expected_x + search_radius + 1))
    y0 = round(height * 0.18)
    y1 = round(height * 0.82)
    scores = mask[y0:y1, x0:x1].sum(axis=0)
    if int(scores.max()) < 12:
        raise RuntimeError(f"Could not find a vertical grid line near x={expected_x:.1f}")
    return float(x0 + np.argmax(scores))


def detect_grid_y(frame: np.ndarray, expected_y: float, search_radius: int = 90) -> float:
    height, width = frame.shape[:2]
    mask = grid_mask(frame)
    y0 = max(0, round(expected_y - search_radius))
    y1 = min(height, round(expected_y + search_radius + 1))
    x0 = round(width * 0.18)
    x1 = round(width * 0.82)
    scores = mask[y0:y1, x0:x1].sum(axis=1)
    if int(scores.max()) < 12:
        raise RuntimeError(f"Could not find a horizontal grid line near y={expected_y:.1f}")
    return float(y0 + np.argmax(scores))


def choose_visible_longitude_pair(
    width: int,
    height: int,
    *,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
) -> tuple[float, float, float, float]:
    best: tuple[float, float, float, float, float] | None = None
    grid_step = 22.5
    grid_lines = [index * grid_step for index in range(-7, 8)]
    for left in grid_lines[:-1]:
        right = left + grid_step
        left_x = expected_longitude_x(width, height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov, longitude=left)
        right_x = expected_longitude_x(width, height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov, longitude=right)
        if left_x is None or right_x is None:
            continue
        if not (24 <= left_x <= width - 24 and 24 <= right_x <= width - 24):
            continue
        score = abs(left - yaw) + abs(right - yaw)
        if best is None or score < best[0]:
            best = (score, float(left), float(right), left_x, right_x)
    if best is None:
        raise RuntimeError("Could not choose a visible 30 degree longitude pair")
    _, left, right, left_x, right_x = best
    return left, right, left_x, right_x


def choose_visible_latitude_pair(
    width: int,
    height: int,
    *,
    yaw: float,
    pitch: float,
    h_fov: float,
    v_fov: float,
) -> tuple[float, float, float, float]:
    best: tuple[float, float, float, float, float] | None = None
    grid_step = 22.5
    grid_lines = [index * grid_step for index in range(-3, 4)]
    for lower in grid_lines[:-1]:
        upper = lower + grid_step
        lower_y = expected_latitude_center_y(
            width, height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov, latitude=lower
        )
        upper_y = expected_latitude_center_y(
            width, height, yaw=yaw, pitch=pitch, h_fov=h_fov, v_fov=v_fov, latitude=upper
        )
        if lower_y is None or upper_y is None:
            continue
        if not (24 <= lower_y <= height - 24 and 24 <= upper_y <= height - 24):
            continue
        score = abs(lower - pitch) + abs(upper - pitch)
        if best is None or score < best[0]:
            best = (score, float(lower), float(upper), lower_y, upper_y)
    if best is None:
        raise RuntimeError("Could not choose a visible 30 degree latitude pair")
    _, lower, upper, lower_y, upper_y = best
    return lower, upper, lower_y, upper_y


def annotate(frame: np.ndarray, *, axis: str, expected: float, detected: float) -> np.ndarray:
    annotated = frame.copy()
    if axis == "horizontal":
        cv2.line(annotated, (round(expected), 0), (round(expected), frame.shape[0] - 1), (255, 255, 255), 2)
        cv2.line(annotated, (round(detected), 0), (round(detected), frame.shape[0] - 1), (0, 255, 255), 2)
    else:
        cv2.line(annotated, (0, round(expected)), (frame.shape[1] - 1, round(expected)), (255, 255, 255), 2)
        cv2.line(annotated, (0, round(detected)), (frame.shape[1] - 1, round(detected)), (0, 255, 255), 2)
    return annotated


def annotate_fov_scale(frame: np.ndarray, expected: dict[str, float], detected: dict[str, float]) -> np.ndarray:
    annotated = frame.copy()
    height, width = frame.shape[:2]
    for key in ("longitudeA", "longitudeB"):
        cv2.line(annotated, (round(expected[key]), 0), (round(expected[key]), height - 1), (255, 255, 255), 2)
        cv2.line(annotated, (round(detected[key]), 0), (round(detected[key]), height - 1), (0, 255, 255), 2)
    for key in ("latitudeA", "latitudeB"):
        cv2.line(annotated, (0, round(expected[key])), (width - 1, round(expected[key])), (255, 255, 255), 2)
        cv2.line(annotated, (0, round(detected[key])), (width - 1, round(detected[key])), (0, 255, 255), 2)
    return annotated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--axis", choices=("horizontal", "vertical", "fov-scale"), required=True)
    parser.add_argument("--yaw", type=float, required=True)
    parser.add_argument("--pitch", type=float, required=True)
    parser.add_argument("--h-fov", type=float, required=True)
    parser.add_argument("--v-fov", type=float, required=True)
    parser.add_argument("--tolerance-px", type=float, default=48)
    parser.add_argument("--frame-out")
    parser.add_argument("--annotated-out")
    args = parser.parse_args()

    frame = read_last_frame(Path(args.video))
    height, width = frame.shape[:2]

    if args.axis == "horizontal":
        expected = expected_red_axis_x(width, args.yaw, args.h_fov)
        detected = detect_red_axis_x(frame)
        error_px = abs(detected - expected)
        ok = error_px <= args.tolerance_px
        payload = {
            "axis": args.axis,
            "detectedPx": detected,
            "errorPx": error_px,
            "expectedPx": expected,
            "frame": {
                "height": height,
                "width": width,
            },
            "latitude": None,
            "ok": ok,
        }
        annotated = annotate(frame, axis=args.axis, expected=expected, detected=detected)
    elif args.axis == "vertical":
        latitude, expected = choose_visible_latitude(height, args.pitch, args.v_fov)
        detected = detect_latitude_axis_y(frame, expected)
        error_px = abs(detected - expected)
        ok = error_px <= args.tolerance_px
        payload = {
            "axis": args.axis,
            "detectedPx": detected,
            "errorPx": error_px,
            "expectedPx": expected,
            "frame": {
                "height": height,
                "width": width,
            },
            "latitude": latitude,
            "ok": ok,
        }
        annotated = annotate(frame, axis=args.axis, expected=expected, detected=detected)
    else:
        lon_a, lon_b, expected_x_a, expected_x_b = choose_visible_longitude_pair(
            width, height, yaw=args.yaw, pitch=args.pitch, h_fov=args.h_fov, v_fov=args.v_fov
        )
        lat_a, lat_b, expected_y_a, expected_y_b = choose_visible_latitude_pair(
            width, height, yaw=args.yaw, pitch=args.pitch, h_fov=args.h_fov, v_fov=args.v_fov
        )
        detected_x_a = detect_grid_x(frame, expected_x_a)
        detected_x_b = detect_grid_x(frame, expected_x_b)
        detected_y_a = detect_grid_y(frame, expected_y_a)
        detected_y_b = detect_grid_y(frame, expected_y_b)
        expected_horizontal_span = abs(expected_x_b - expected_x_a)
        expected_vertical_span = abs(expected_y_b - expected_y_a)
        detected_horizontal_span = abs(detected_x_b - detected_x_a)
        detected_vertical_span = abs(detected_y_b - detected_y_a)
        expected_ratio = expected_vertical_span / max(expected_horizontal_span, 1)
        detected_ratio = detected_vertical_span / max(detected_horizontal_span, 1)
        coordinate_error_px = max(
            abs(detected_x_a - expected_x_a),
            abs(detected_x_b - expected_x_b),
            abs(detected_y_a - expected_y_a),
            abs(detected_y_b - expected_y_b),
        )
        ratio_error = abs(detected_ratio - expected_ratio)
        ok = coordinate_error_px <= args.tolerance_px and ratio_error <= 0.12
        payload = {
            "axis": args.axis,
            "coordinateErrorPx": coordinate_error_px,
            "detected": {
                "horizontalSpanPx": detected_horizontal_span,
                "latitudeA": detected_y_a,
                "latitudeB": detected_y_b,
                "longitudeA": detected_x_a,
                "longitudeB": detected_x_b,
                "ratio": detected_ratio,
                "verticalSpanPx": detected_vertical_span,
            },
            "expected": {
                "horizontalSpanPx": expected_horizontal_span,
                "latitudeA": expected_y_a,
                "latitudeB": expected_y_b,
                "longitudeA": expected_x_a,
                "longitudeB": expected_x_b,
                "ratio": expected_ratio,
                "verticalSpanPx": expected_vertical_span,
            },
            "frame": {
                "height": height,
                "width": width,
            },
            "grid": {
                "latitudeA": lat_a,
                "latitudeB": lat_b,
                "longitudeA": lon_a,
                "longitudeB": lon_b,
            },
            "ok": ok,
            "ratioError": ratio_error,
        }
        annotated = annotate_fov_scale(
            frame,
            expected={
                "latitudeA": expected_y_a,
                "latitudeB": expected_y_b,
                "longitudeA": expected_x_a,
                "longitudeB": expected_x_b,
            },
            detected={
                "latitudeA": detected_y_a,
                "latitudeB": detected_y_b,
                "longitudeA": detected_x_a,
                "longitudeB": detected_x_b,
            },
        )

    if args.frame_out:
        cv2.imwrite(args.frame_out, frame)
    if args.annotated_out:
        cv2.imwrite(args.annotated_out, annotated)

    print(json.dumps(payload, sort_keys=True))


if __name__ == "__main__":
    main()
