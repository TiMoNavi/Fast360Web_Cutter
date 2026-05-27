from __future__ import annotations

from typing import Any

from .effect_types import FrameEffect


def effect_progress(event: FrameEffect, t_ms: int) -> float:
    start_ms = int(event["start_ms"])
    end_ms = int(event["end_ms"])
    return clamp((t_ms - start_ms) / max(end_ms - start_ms, 1), 0, 1)


def edge_envelope(event: FrameEffect, t_ms: int, default_edge_ms: int = 180) -> float:
    params = event.get("params") or {}
    start_ms = int(event["start_ms"])
    end_ms = int(event["end_ms"])
    duration_ms = max(end_ms - start_ms, 1)
    default_edge = int(params.get("edgeMs", min(default_edge_ms, duration_ms / 2)))
    max_edge = max(duration_ms // 2, 1)
    fade_in_ms = max(1, min(int(params.get("fadeInMs", default_edge)), max_edge))
    fade_out_ms = max(1, min(int(params.get("fadeOutMs", default_edge)), max_edge))
    if t_ms < start_ms + fade_in_ms:
        return clamp((t_ms - start_ms) / fade_in_ms, 0, 1)
    if t_ms > end_ms - fade_out_ms:
        return clamp((end_ms - t_ms) / fade_out_ms, 0, 1)
    return 1


def apply_fade_black(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    peak_opacity = clamp(float(params.get("peakOpacity", params.get("opacity", 1.0))), 0, 1)
    direction = str(params.get("direction", "through"))
    progress = effect_progress(event, t_ms)
    if direction == "hold":
        opacity = peak_opacity * edge_envelope(event, t_ms)
    elif direction == "out":
        opacity = peak_opacity * progress
    elif direction == "in":
        opacity = peak_opacity * (1 - progress)
    else:
        opacity = peak_opacity * (1 - abs(progress * 2 - 1))
    return np.clip(frame.astype(np.float32) * (1 - opacity), 0, 255).astype(np.uint8)


def apply_solid_black(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    opacity = clamp(float(params.get("opacity", 1.0)), 0, 1)
    color = parse_hex_color(str(params.get("color", "#000000")))
    overlay = np.empty_like(frame, dtype=np.float32)
    overlay[:, :] = color
    working = frame.astype(np.float32)
    return np.clip(working * (1 - opacity) + overlay * opacity, 0, 255).astype(np.uint8)


def apply_flash_white(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    peak_opacity = clamp(float(params.get("peakOpacity", params.get("opacity", 0.9))), 0, 1)
    direction = str(params.get("direction", "through"))
    progress = effect_progress(event, t_ms)
    if direction == "hold":
        opacity = peak_opacity * edge_envelope(event, t_ms)
    elif direction == "out":
        opacity = peak_opacity * progress
    elif direction == "in":
        opacity = peak_opacity * (1 - progress)
    else:
        opacity = peak_opacity * (1 - abs(progress * 2 - 1))
    color = parse_hex_color(str(params.get("color", "#ffffff")))
    overlay = np.empty_like(frame, dtype=np.float32)
    overlay[:, :] = color
    working = frame.astype(np.float32)
    return np.clip(working * (1 - opacity) + overlay * opacity, 0, 255).astype(np.uint8)


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


def apply_color_grade(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = resolve_color_grade_params(event.get("params") or {})
    strength = clamp(float(params.get("strength", 1.0)), 0, 1) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    working = frame.astype(np.float32)
    contrast = float(params.get("contrast", 1.08))
    brightness = float(params.get("brightness", 0))
    saturation = float(params.get("saturation", 1.08))
    warmth = float(params.get("warmth", 0))
    tint = float(params.get("tint", 0))
    blue_bias = float(params.get("blueBias", params.get("blue_bias", 0)))
    green_bias = float(params.get("greenBias", params.get("green_bias", 0)))
    red_bias = float(params.get("redBias", params.get("red_bias", 0)))

    gray = working[:, :, 0] * 0.114 + working[:, :, 1] * 0.587 + working[:, :, 2] * 0.299
    graded = gray[:, :, None] + (working - gray[:, :, None]) * saturation
    graded = (graded - 127.5) * contrast + 127.5 + brightness
    graded[:, :, 0] -= warmth * 24
    graded[:, :, 2] += warmth * 24
    graded[:, :, 1] += tint * 18
    graded[:, :, 0] += blue_bias
    graded[:, :, 1] += green_bias
    graded[:, :, 2] += red_bias
    return np.clip(working * (1 - strength) + graded * strength, 0, 255).astype(np.uint8)


def resolve_color_grade_params(params: dict[str, Any]) -> dict[str, Any]:
    tint_value = params.get("tint")
    if not isinstance(tint_value, str):
        return params

    presets: dict[str, dict[str, Any]] = {
        "cyan": {
            "blueBias": 8,
            "contrast": 1.08,
            "greenBias": 8,
            "saturation": 1.16,
            "tint": 0.32,
            "warmth": -0.18,
        },
        "magenta": {
            "blueBias": 10,
            "contrast": 1.08,
            "greenBias": -8,
            "redBias": 14,
            "saturation": 1.12,
            "tint": -0.12,
            "warmth": 0.06,
        },
        "sunset": {
            "blueBias": -6,
            "brightness": 2,
            "contrast": 1.07,
            "redBias": 8,
            "saturation": 1.14,
            "tint": 0.06,
            "warmth": 0.42,
        },
        "chrome": {
            "blueBias": 8,
            "brightness": -2,
            "contrast": 1.18,
            "saturation": 0.82,
            "tint": 0.04,
            "warmth": -0.28,
        },
        "warm": {
            "blueBias": -4,
            "brightness": 1,
            "contrast": 1.06,
            "redBias": 5,
            "saturation": 1.1,
            "tint": 0.04,
            "warmth": 0.28,
        },
        "mono": {
            "brightness": -2,
            "contrast": 1.14,
            "saturation": 0.04,
            "tint": 0,
            "warmth": 0,
        },
    }
    preset = presets.get(tint_value.lower())
    if preset is None:
        return {**params, "tint": 0}
    return {**preset, **params, "tint": preset["tint"]}


def apply_blur(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import cv2
    import numpy as np

    params = event.get("params") or {}
    strength = clamp(float(params.get("strength", 1.0)), 0, 1) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    radius = int(params.get("radius", 17))
    radius = max(3, radius if radius % 2 == 1 else radius + 1)
    blurred = cv2.GaussianBlur(frame, (radius, radius), 0)
    return np.clip(
        frame.astype(np.float32) * (1 - strength) + blurred.astype(np.float32) * strength,
        0,
        255,
    ).astype(np.uint8)


def apply_vignette(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import cv2
    import numpy as np

    params = event.get("params") or {}
    strength = clamp(float(params.get("strength", 0.35)), 0, 1) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    height, width = frame.shape[:2]
    sigma_x = max(width * float(params.get("radius", 0.65)), 1)
    sigma_y = max(height * float(params.get("radius", 0.65)), 1)
    kernel_x = cv2.getGaussianKernel(width, sigma_x)
    kernel_y = cv2.getGaussianKernel(height, sigma_y)
    mask = kernel_y @ kernel_x.T
    mask = mask / max(float(mask.max()), 1e-6)
    mask = (1 - strength) + mask * strength
    return np.clip(frame.astype(np.float32) * mask[:, :, None], 0, 255).astype(np.uint8)


def apply_chromatic_aberration(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    strength = clamp(float(params.get("strength", 1.0)), 0, 1) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    height, width = frame.shape[:2]
    max_offset = max(1, min(width, height) // 8)
    offset = int(round(float(params.get("offsetPx", 6)) * strength))
    offset = max(-max_offset, min(max_offset, offset))
    if offset == 0:
        return frame

    rendered = frame.copy()
    rendered[:, :, 0] = shift_channel(frame[:, :, 0], -offset, 0)
    rendered[:, :, 2] = shift_channel(frame[:, :, 2], offset, 0)
    return rendered


def apply_text_overlay(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import cv2
    import numpy as np

    params = event.get("params") or {}
    text = str(params.get("text", params.get("label", "")))
    if not text:
        return frame

    rendered = frame.copy()
    height, width = rendered.shape[:2]
    color = parse_hex_color(str(params.get("color", "#ffffff")))
    background = parse_hex_color(str(params.get("background", "#000000")))
    opacity = clamp(float(params.get("opacity", 1.0)), 0, 1)
    font_scale = clamp(float(params.get("scale", width / 900)), 0.4, 4)
    thickness = max(1, int(params.get("thickness", round(font_scale * 2))))
    margin = int(params.get("margin", max(24, width * 0.035)))
    position = str(params.get("position", "bottom_center"))
    font = cv2.FONT_HERSHEY_SIMPLEX

    (text_width, text_height), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    if position == "top_left":
        x = margin
        y = margin + text_height
    elif position == "top_center":
        x = (width - text_width) // 2
        y = margin + text_height
    elif position == "bottom_left":
        x = margin
        y = height - margin
    else:
        x = (width - text_width) // 2
        y = height - margin

    pad_x = int(params.get("paddingX", 18))
    pad_y = int(params.get("paddingY", 12))
    box_start = (max(0, x - pad_x), max(0, y - text_height - pad_y))
    box_end = (min(width, x + text_width + pad_x), min(height, y + baseline + pad_y))
    box_alpha = clamp(float(params.get("backgroundOpacity", 0.45)), 0, 1)
    if box_alpha > 0:
        overlay = rendered.copy()
        cv2.rectangle(overlay, box_start, box_end, background, thickness=-1)
        rendered = cv2.addWeighted(overlay, box_alpha, rendered, 1 - box_alpha, 0)

    text_layer = rendered.copy()
    cv2.putText(text_layer, text, (x, y), font, font_scale, color, thickness, cv2.LINE_AA)
    return np.clip(
        text_layer.astype(np.float32) * opacity + rendered.astype(np.float32) * (1 - opacity),
        0,
        255,
    ).astype(np.uint8)


def apply_letterbox(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import cv2
    import numpy as np

    params = event.get("params") or {}
    strength = clamp(float(params.get("opacity", 1.0)), 0, 1) * edge_envelope(event, t_ms)
    if strength <= 0:
        return frame

    rendered = frame.copy()
    height, width = rendered.shape[:2]
    ratio = clamp(float(params.get("ratio", 0.12)), 0, 0.45)
    bar_height = int(round(height * ratio))
    if bar_height <= 0:
        return frame

    color = parse_hex_color(str(params.get("color", "#000000")))
    overlay = rendered.copy()
    cv2.rectangle(overlay, (0, 0), (width, bar_height), color, thickness=-1)
    cv2.rectangle(overlay, (0, height - bar_height), (width, height), color, thickness=-1)
    return np.clip(
        overlay.astype(np.float32) * strength + rendered.astype(np.float32) * (1 - strength),
        0,
        255,
    ).astype(np.uint8)


def apply_portal_ring(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    progress = effect_progress(event, t_ms)
    envelope = edge_envelope(event, t_ms, default_edge_ms=140)
    opacity = clamp(float(params.get("opacity", 0.92)), 0, 1) * envelope
    if opacity <= 0:
        return frame

    y, x, center_x, center_y, min_side = overlay_coordinate_grid(frame, params)
    radius = min_side * clamp(float(params.get("radius", 0.31)), 0.08, 0.72)
    thickness = max(2.0, min_side * clamp(float(params.get("thickness", 0.035)), 0.008, 0.16))
    dx = x - center_x
    dy = y - center_y
    distance = np.sqrt(dx * dx + dy * dy)
    angle = np.arctan2(dy, dx)
    spin = progress * np.pi * 6.0

    ring = np.exp(-np.square((distance - radius) / thickness))
    outer_glow = np.exp(-np.square((distance - radius * 1.08) / (thickness * 2.8)))
    inner_glow = np.exp(-np.square((distance - radius * 0.78) / (thickness * 3.4)))
    spokes = 0.5 + 0.5 * np.sin(angle * 18.0 + spin + distance * 0.055)
    sparks = np.power(np.maximum(0.0, spokes), 7.0)

    alpha = np.clip((ring * (0.48 + spokes * 0.42) + outer_glow * 0.22 + inner_glow * 0.12 + sparks * ring * 0.36) * opacity, 0, 0.92)
    core_alpha = np.clip((1.0 - smoothstep(radius * 0.18, radius * 0.72, distance)) * opacity * 0.18, 0, 0.24)

    primary = np.array(parse_hex_color(str(params.get("color", "#00d8ff"))), dtype=np.float32)
    secondary = np.array(parse_hex_color(str(params.get("secondaryColor", "#ff4dff"))), dtype=np.float32)
    core = np.array(parse_hex_color(str(params.get("coreColor", "#05061f"))), dtype=np.float32)
    mix = spokes[:, :, None]
    overlay = primary * (1.0 - mix) + secondary * mix

    rendered = blend_overlay(frame, core[None, None, :], core_alpha)
    rendered = blend_overlay(rendered, overlay, alpha)
    return additive_overlay(rendered, overlay, np.clip(alpha * 0.42 + outer_glow * opacity * 0.18, 0, 0.62))


def apply_time_vortex(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    progress = effect_progress(event, t_ms)
    envelope = edge_envelope(event, t_ms, default_edge_ms=180)
    opacity = clamp(float(params.get("opacity", 0.86)), 0, 1) * envelope
    if opacity <= 0:
        return frame

    y, x, center_x, center_y, min_side = overlay_coordinate_grid(frame, params)
    radius = min_side * clamp(float(params.get("radius", 0.36)), 0.08, 0.82)
    dx = x - center_x
    dy = y - center_y
    distance = np.sqrt(dx * dx + dy * dy)
    angle = np.arctan2(dy, dx)
    normalized = distance / max(radius, 1.0)

    body = 1.0 - smoothstep(0.1, 1.08, normalized)
    spiral = 0.5 + 0.5 * np.sin(angle * 5.6 - normalized * 17.0 + progress * np.pi * 7.0)
    cross_spiral = 0.5 + 0.5 * np.sin(angle * -3.2 - normalized * 10.0 - progress * np.pi * 5.4)
    lanes = np.power(spiral, 3.0) * 0.65 + np.power(cross_spiral, 5.0) * 0.35
    center_dark = 1.0 - smoothstep(0.0, 0.34, normalized)
    rim = np.exp(-np.square((normalized - 0.86) / 0.11))

    alpha = np.clip((body * (0.24 + lanes * 0.58) + rim * 0.28) * opacity, 0, 0.88)
    core_alpha = np.clip(center_dark * opacity * 0.3, 0, 0.36)

    primary = np.array(parse_hex_color(str(params.get("color", "#4be3ff"))), dtype=np.float32)
    secondary = np.array(parse_hex_color(str(params.get("secondaryColor", "#9a4dff"))), dtype=np.float32)
    core = np.array(parse_hex_color(str(params.get("coreColor", "#02030d"))), dtype=np.float32)
    mix = np.clip(lanes[:, :, None], 0, 1)
    overlay = primary * (1.0 - mix) + secondary * mix

    rendered = blend_overlay(frame, core[None, None, :], core_alpha)
    rendered = blend_overlay(rendered, overlay, alpha)
    return additive_overlay(rendered, overlay, np.clip((lanes * body + rim) * opacity * 0.24, 0, 0.48))


def apply_explosion_sticker(frame: Any, t_ms: int, event: FrameEffect) -> Any:
    import numpy as np

    params = event.get("params") or {}
    progress = effect_progress(event, t_ms)
    opacity = clamp(float(params.get("opacity", 0.95)), 0, 1)
    if opacity <= 0:
        return frame

    y, x, center_x, center_y, min_side = overlay_coordinate_grid(frame, params)
    max_radius = min_side * clamp(float(params.get("radius", 0.34)), 0.08, 0.82)
    radius = max_radius * (0.12 + 0.96 * ease_out_cubic(progress))
    thickness = max(3.0, max_radius * (0.065 + progress * 0.07))
    dx = x - center_x
    dy = y - center_y
    distance = np.sqrt(dx * dx + dy * dy)
    angle = np.arctan2(dy, dx)

    life = np.power(max(0.0, 1.0 - progress), 0.55)
    ignition = smoothstep(0.0, 0.18, progress)
    shock = np.exp(-np.square((distance - radius) / thickness))
    core = np.exp(-np.square(distance / max(radius * 0.62, 1.0)))
    plume = np.exp(-np.square((distance - radius * 0.58) / max(radius * 0.42, 1.0)))
    spark_seed = 0.5 + 0.5 * np.sin(angle * 31.0 + progress * 24.0)
    sparks = np.power(np.maximum(0.0, spark_seed), 11.0) * np.exp(-np.square((distance - radius * 0.92) / max(thickness * 2.2, 1.0)))
    smoke = plume * smoothstep(0.28, 0.9, progress) * (1.0 - smoothstep(0.72, 1.0, progress))

    fire_alpha = np.clip((core * (1.15 - progress) + shock * 0.76 + sparks * 0.72) * opacity * ignition * life, 0, 0.95)
    smoke_alpha = np.clip(smoke * opacity * 0.24, 0, 0.28)

    hot = np.array(parse_hex_color(str(params.get("color", "#fff0a0"))), dtype=np.float32)
    fire = np.array(parse_hex_color(str(params.get("secondaryColor", "#ff6a00"))), dtype=np.float32)
    ember = np.array(parse_hex_color(str(params.get("emberColor", "#ff1f00"))), dtype=np.float32)
    smoke_color = np.array(parse_hex_color(str(params.get("smokeColor", "#282018"))), dtype=np.float32)
    heat = np.clip((core + shock + sparks)[:, :, None], 0, 1)
    overlay = fire * (1.0 - heat) + hot * heat
    overlay = overlay * (1.0 - progress * 0.25) + ember * (progress * 0.25)

    rendered = blend_overlay(frame, smoke_color[None, None, :], smoke_alpha)
    rendered = blend_overlay(rendered, overlay, fire_alpha)
    return additive_overlay(rendered, overlay, np.clip(fire_alpha * 0.46 + sparks * opacity * 0.32, 0, 0.72))


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def smoothstep(edge0: float, edge1: float, value: Any) -> Any:
    t = clamp_array((value - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def ease_out_cubic(value: float) -> float:
    t = clamp(value, 0, 1)
    return 1 - (1 - t) ** 3


def clamp_array(value: Any, minimum: float, maximum: float) -> Any:
    import numpy as np

    return np.minimum(maximum, np.maximum(minimum, value))


def overlay_coordinate_grid(frame: Any, params: dict[str, Any]) -> tuple[Any, Any, float, float, float]:
    import numpy as np

    height, width = frame.shape[:2]
    center_x = width * clamp(float(params.get("centerX", 0.5)), -0.5, 1.5)
    center_y = height * clamp(float(params.get("centerY", 0.5)), -0.5, 1.5)
    y, x = np.ogrid[:height, :width]
    return y.astype(np.float32), x.astype(np.float32), center_x, center_y, float(min(width, height))


def blend_overlay(frame: Any, overlay: Any, alpha: Any) -> Any:
    import numpy as np

    working = frame.astype(np.float32)
    alpha_3 = np.clip(alpha, 0, 1)
    if getattr(alpha_3, "ndim", 0) == 2:
        alpha_3 = alpha_3[:, :, None]
    rendered = working * (1.0 - alpha_3) + overlay.astype(np.float32) * alpha_3
    return np.clip(rendered, 0, 255).astype(np.uint8)


def additive_overlay(frame: Any, overlay: Any, alpha: Any) -> Any:
    import numpy as np

    working = frame.astype(np.float32)
    alpha_3 = np.clip(alpha, 0, 1)
    if getattr(alpha_3, "ndim", 0) == 2:
        alpha_3 = alpha_3[:, :, None]
    rendered = working + overlay.astype(np.float32) * alpha_3
    return np.clip(rendered, 0, 255).astype(np.uint8)


def shift_channel(channel: Any, dx: int, dy: int) -> Any:
    import numpy as np

    height, width = channel.shape[:2]
    shifted = np.empty_like(channel)
    source_x_start = max(0, -dx)
    source_x_end = min(width, width - dx)
    source_y_start = max(0, -dy)
    source_y_end = min(height, height - dy)
    target_x_start = max(0, dx)
    target_x_end = min(width, width + dx)
    target_y_start = max(0, dy)
    target_y_end = min(height, height + dy)

    shifted[:, :] = channel
    shifted[target_y_start:target_y_end, target_x_start:target_x_end] = channel[
        source_y_start:source_y_end,
        source_x_start:source_x_end,
    ]
    if dx > 0:
        shifted[:, :dx] = shifted[:, dx : dx + 1]
    elif dx < 0:
        shifted[:, dx:] = shifted[:, dx - 1 : dx]
    if dy > 0:
        shifted[:dy, :] = shifted[dy : dy + 1, :]
    elif dy < 0:
        shifted[dy:, :] = shifted[dy - 1 : dy, :]
    return shifted


def parse_hex_color(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        return (0, 0, 0)
    try:
        red = int(value[0:2], 16)
        green = int(value[2:4], 16)
        blue = int(value[4:6], 16)
    except ValueError:
        return (0, 0, 0)
    return (blue, green, red)
