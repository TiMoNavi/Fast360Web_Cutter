from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from .storage import probe_video_metadata


VideoIngestAction = Literal["passthrough", "mp4_compatible_or_transcode", "transcode_mp4", "reject"]


@dataclass(frozen=True)
class VideoIngestRule:
    code: str
    label: str
    suffixes: tuple[str, ...]
    action: VideoIngestAction
    note: str


@dataclass(frozen=True)
class VideoIngestResult:
    stored_filename: str
    content_type: str | None
    file_size: int
    metadata: dict[str, Any]
    status: str
    original_stored_filename: str | None


VIDEO_INGEST_RULES: tuple[VideoIngestRule, ...] = (
    VideoIngestRule(
        code="V001",
        label="Standard MP4/M4V",
        suffixes=(".mp4", ".m4v"),
        action="mp4_compatible_or_transcode",
        note="Use as-is when browser-compatible, otherwise create an H.264 MP4 proxy.",
    ),
    VideoIngestRule(
        code="V010",
        label="QuickTime MOV",
        suffixes=(".mov",),
        action="transcode_mp4",
        note="Keep the original and create an H.264 MP4 proxy for WebXR playback.",
    ),
    VideoIngestRule(
        code="V020",
        label="WebM",
        suffixes=(".webm",),
        action="transcode_mp4",
        note="Keep the original and create an H.264 MP4 proxy for WebXR playback.",
    ),
    VideoIngestRule(
        code="V030",
        label="Matroska MKV",
        suffixes=(".mkv",),
        action="transcode_mp4",
        note="Keep the original and create an H.264 MP4 proxy for WebXR playback.",
    ),
    VideoIngestRule(
        code="V900",
        label="Insta360 camera raw",
        suffixes=(".insv",),
        action="reject",
        note="Camera raw files need stitching/export from Insta360 Studio before upload.",
    ),
    VideoIngestRule(
        code="V901",
        label="GoPro MAX camera raw",
        suffixes=(".360",),
        action="reject",
        note="Camera raw files need export from GoPro Player before upload.",
    ),
)

SUPPORTED_VIDEO_SUFFIXES = frozenset(suffix for rule in VIDEO_INGEST_RULES for suffix in rule.suffixes)
REJECTED_CAMERA_RAW_SUFFIXES = frozenset(
    suffix for rule in VIDEO_INGEST_RULES if rule.action == "reject" for suffix in rule.suffixes
)


def video_ingest_rule_for_suffix(suffix: str) -> VideoIngestRule | None:
    normalized = suffix.lower()
    for rule in VIDEO_INGEST_RULES:
        if normalized in rule.suffixes:
            return rule
    return None


def ingest_uploaded_video(
    *,
    video_id: str,
    upload_path: Path,
    original_name: str,
    content_type: str | None,
    videos_dir: Path,
    originals_dir: Path,
) -> VideoIngestResult:
    suffix = upload_path.suffix.lower()
    rule = video_ingest_rule_for_suffix(suffix)
    if rule is None:
        raise RuntimeError(f"No video ingest rule registered for {suffix}")
    if rule.action == "reject":
        raise RuntimeError(rule.note)

    source_metadata = probe_video_metadata(upload_path)
    should_transcode = rule.action == "transcode_mp4" or (
        rule.action == "mp4_compatible_or_transcode" and not is_browser_ready_mp4(source_metadata)
    )

    if should_transcode:
        originals_dir.mkdir(parents=True, exist_ok=True)
        original_stored_filename = f"originals/{video_id}{suffix}"
        original_path = videos_dir / original_stored_filename
        upload_path.replace(original_path)
        stored_filename = f"{video_id}.mp4"
        target_path = videos_dir / stored_filename
        transcode_to_browser_mp4(original_path, target_path)
        metadata = probe_video_metadata(target_path)
        content_type = "video/mp4"
    else:
        original_stored_filename = None
        stored_filename = f"{video_id}{suffix}"
        target_path = videos_dir / stored_filename
        upload_path.replace(target_path)
        metadata = source_metadata

    ingest_notes = [rule.note]
    if should_transcode:
        ingest_notes.append("Generated browser playback proxy: H.264/AAC MP4.")
    if not is_likely_equirectangular_2to1(metadata):
        ingest_notes.append("Projection was not verified as 2:1 equirectangular; manual review may be required.")

    metadata = {
        **metadata,
        "ingest": {
            "version": 1,
            "ruleCode": rule.code,
            "ruleLabel": rule.label,
            "action": "transcode_mp4" if should_transcode else "passthrough",
            "originalFilename": original_name,
            "originalStoredFilename": original_stored_filename,
            "notes": ingest_notes,
        },
    }

    return VideoIngestResult(
        stored_filename=stored_filename,
        content_type=content_type,
        file_size=target_path.stat().st_size,
        metadata=metadata,
        status="ready_for_xr",
        original_stored_filename=original_stored_filename,
    )


def is_browser_ready_mp4(metadata: dict[str, Any]) -> bool:
    if metadata.get("source") == "placeholder":
        return True
    codec = str(metadata.get("videoCodec") or "").lower()
    pix_fmt = str(metadata.get("pixelFormat") or "").lower()
    if codec not in {"h264", "avc1"}:
        return False
    return pix_fmt in {"", "yuv420p", "yuvj420p"}


def is_likely_equirectangular_2to1(metadata: dict[str, Any]) -> bool:
    width = metadata.get("width")
    height = metadata.get("height")
    if not width or not height:
        return False
    try:
        aspect = float(width) / float(height)
    except (TypeError, ValueError, ZeroDivisionError):
        return False
    return 1.92 < aspect < 2.08


def transcode_to_browser_mp4(source_path: Path, target_path: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required to normalize this video format")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=1800)
    except subprocess.CalledProcessError as exc:
        target_path.unlink(missing_ok=True)
        error = (exc.stderr or exc.stdout or "unknown ffmpeg error").strip()
        raise RuntimeError(f"ffmpeg normalize failed: {error}") from exc
