from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from .models import ClipEditConfig, EffectEvent, EffectEventsPatch, ViewPathPatch, ViewPathPoint


ROOT_DIR = Path(__file__).resolve().parents[3]
STORAGE_DIR = ROOT_DIR / "storage"
VIDEOS_DIR = STORAGE_DIR / "videos"
ORIGINAL_VIDEOS_DIR = VIDEOS_DIR / "originals"
MUSIC_DIR = STORAGE_DIR / "music"
EXPORTS_DIR = STORAGE_DIR / "exports"
TMP_DIR = STORAGE_DIR / "tmp"
THUMBNAILS_DIR = STORAGE_DIR / "thumbnails"
SAMPLE_VIDEOS_DIR = STORAGE_DIR / "sample-videos"
DB_PATH = STORAGE_DIR / "app.db"
LEGACY_USER_ID = "user_legacy_demo"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_storage() -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    ORIGINAL_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLE_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS videos (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'user_legacy_demo',
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                content_type TEXT,
                thumbnail_filename TEXT,
                file_size INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                width INTEGER,
                height INTEGER,
                fps REAL,
                metadata_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS music_tracks (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'user_legacy_demo',
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                content_type TEXT,
                file_size INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                metadata_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_music (
                session_id TEXT PRIMARY KEY,
                music_id TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                start_ms INTEGER NOT NULL DEFAULT 0,
                gain_db REAL NOT NULL DEFAULT -10.0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY(music_id) REFERENCES music_tracks(id)
            );

            CREATE TABLE IF NOT EXISTS cut_sessions (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'user_legacy_demo',
                status TEXT NOT NULL,
                timeline_revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(video_id) REFERENCES videos(id)
            );

            CREATE TABLE IF NOT EXISTS webxr_player_state (
                user_id TEXT PRIMARY KEY,
                active_video_id TEXT,
                active_session_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(active_video_id) REFERENCES videos(id),
                FOREIGN KEY(active_session_id) REFERENCES cut_sessions(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS clip_edit_configs (
                session_id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS view_path_patches (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                take_id TEXT NOT NULL,
                path_revision INTEGER NOT NULL,
                replace_start_ms INTEGER NOT NULL,
                replace_end_ms INTEGER NOT NULL,
                reason TEXT NOT NULL,
                patch_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS view_path_points (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                take_id TEXT NOT NULL,
                path_revision INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                t_ms INTEGER NOT NULL,
                yaw REAL NOT NULL,
                pitch REAL NOT NULL,
                fov_h REAL NOT NULL,
                fov_v REAL NOT NULL,
                roll REAL NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                cut INTEGER NOT NULL DEFAULT 0,
                locked INTEGER NOT NULL DEFAULT 0,
                smooth_follow INTEGER NOT NULL DEFAULT 1,
                interpolation TEXT NOT NULL DEFAULT 'linear',
                transition_ms INTEGER NOT NULL DEFAULT 0,
                input TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_view_path_points_session_time
                ON view_path_points(session_id, t_ms);

            CREATE TABLE IF NOT EXISTS effect_event_patches (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                effect_revision INTEGER NOT NULL,
                replace_start_ms INTEGER NOT NULL,
                replace_end_ms INTEGER NOT NULL,
                reason TEXT NOT NULL,
                patch_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS effect_events (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                video_id TEXT NOT NULL,
                effect_revision INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                event_name TEXT NOT NULL,
                display_name TEXT,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                params_json TEXT NOT NULL,
                render_policy_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_effect_events_session_range
                ON effect_events(session_id, start_ms, end_ms);

            CREATE TABLE IF NOT EXISTS minute_segments (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                minute_index INTEGER NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(session_id, minute_index),
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS exports (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'user_legacy_demo',
                status TEXT NOT NULL,
                file_path TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS segment_renders (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                segment_index INTEGER NOT NULL,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                status TEXT NOT NULL,
                file_path TEXT,
                error_message TEXT,
                timeline_revision INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(session_id) REFERENCES cut_sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_segment_renders_session
                ON segment_renders(session_id, segment_index);
            """
        )
        ensure_column(conn, "videos", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "videos", "thumbnail_filename", "TEXT")
        ensure_column(conn, "cut_sessions", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "exports", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "exports", "error_message", "TEXT")
        ensure_column(conn, "view_path_points", "interpolation", "TEXT NOT NULL DEFAULT 'linear'")
        ensure_column(conn, "view_path_points", "transition_ms", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "effect_events", "display_name", "TEXT")
        ensure_column(conn, "effect_events", "render_policy_json", "TEXT NOT NULL DEFAULT '{}'")
        conn.execute(
            """
            INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (LEGACY_USER_ID, "legacy@example.local", "legacy", "legacy", utc_now()),
        )


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    if not any(row["name"] == column for row in rows):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def dict_from_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def probe_video_metadata(path: Path) -> dict[str, Any]:
    placeholder = {
        "durationMs": 0,
        "width": None,
        "height": None,
        "fps": None,
        "source": "placeholder",
    }
    if shutil.which("ffprobe") is None:
        return placeholder

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration,format_name",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=15)
        raw = json.loads(result.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError):
        return placeholder

    stream = (raw.get("streams") or [{}])[0]
    duration = float((raw.get("format") or {}).get("duration") or 0)
    fps = parse_fps(stream.get("r_frame_rate"))
    return {
        "durationMs": int(duration * 1000),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "fps": fps,
        "videoCodec": stream.get("codec_name"),
        "pixelFormat": stream.get("pix_fmt"),
        "container": (raw.get("format") or {}).get("format_name"),
        "source": "ffprobe",
    }


def probe_audio_metadata(path: Path) -> dict[str, Any]:
    placeholder = {
        "durationMs": 0,
        "sampleRate": None,
        "channels": None,
        "codec": None,
        "source": "placeholder",
    }
    if shutil.which("ffprobe") is None:
        return placeholder

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels:format=duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=15)
        raw = json.loads(result.stdout)
    except (subprocess.SubprocessError, json.JSONDecodeError):
        return placeholder

    stream = (raw.get("streams") or [{}])[0]
    duration = float((raw.get("format") or {}).get("duration") or 0)
    return {
        "durationMs": int(duration * 1000),
        "sampleRate": int(stream["sample_rate"]) if stream.get("sample_rate") else None,
        "channels": stream.get("channels"),
        "codec": stream.get("codec_name"),
        "source": "ffprobe",
    }


def generate_video_thumbnail(path: Path, video_id: str, duration_ms: int | None = None) -> str | None:
    return generate_360_video_thumbnail(path, video_id, duration_ms=duration_ms)


def generate_360_video_thumbnail(
    path: Path,
    video_id: str,
    duration_ms: int | None = None,
    seek_ms: int | None = None,
    yaw: float = 0,
    pitch: float = 0,
    h_fov: float = 100,
    v_fov: float = 56.25,
    output_width: int = 640,
    output_height: int = 360,
) -> str | None:
    if shutil.which("ffmpeg") is None:
        return None

    try:
        import cv2
        import numpy as np
        from .rendering.remap import build_equirect_to_flat_maps, probe_video_dimensions
    except ImportError:
        return None

    thumbnail_filename = f"{video_id}.jpg"
    target = THUMBNAILS_DIR / thumbnail_filename
    if seek_ms is None:
        seek_ms = 1000
        if duration_ms and duration_ms > 0:
            seek_ms = int(min(max(duration_ms / 5, 1000), 8000))

    source_width, source_height = probe_video_dimensions(path)
    if source_width <= 0 or source_height <= 0:
        return None

    safe_width = max(160, min(int(output_width), 1920))
    safe_height = max(90, min(int(output_height), 1080))
    seek_seconds = max(seek_ms / 1000, 0)
    source_frame_bytes = source_width * source_height * 3

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{seek_seconds:.3f}",
        "-i",
        str(path),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "pipe:1",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, check=True, timeout=30)
    except subprocess.SubprocessError:
        target.unlink(missing_ok=True)
        return None

    if len(result.stdout) < source_frame_bytes:
        target.unlink(missing_ok=True)
        return None

    source_frame = np.frombuffer(result.stdout[:source_frame_bytes], dtype=np.uint8).reshape(
        (source_height, source_width, 3)
    )
    output_x = (np.arange(safe_width, dtype=np.float32) + 0.5) / safe_width * 2 - 1
    output_y = 1 - (np.arange(safe_height, dtype=np.float32) + 0.5) / safe_height * 2
    output_u, output_v = np.meshgrid(output_x, output_y)
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
    thumbnail = cv2.remap(
        source_frame,
        map_x,
        map_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )
    if not cv2.imwrite(str(target), thumbnail, [int(cv2.IMWRITE_JPEG_QUALITY), 88]):
        target.unlink(missing_ok=True)
        return None

    return thumbnail_filename if target.is_file() else None


def ensure_video_thumbnail(conn: sqlite3.Connection, row: sqlite3.Row | dict[str, Any]) -> str | None:
    data = dict(row)
    thumbnail_filename = data.get("thumbnail_filename")
    if thumbnail_filename and (THUMBNAILS_DIR / thumbnail_filename).is_file():
        return str(thumbnail_filename)

    source_path = VIDEOS_DIR / data["stored_filename"]
    if not source_path.is_file():
        return None

    thumbnail_filename = generate_video_thumbnail(source_path, data["id"], data.get("duration_ms"))
    if thumbnail_filename:
        conn.execute(
            "UPDATE videos SET thumbnail_filename = ? WHERE id = ?",
            (thumbnail_filename, data["id"]),
        )
    return thumbnail_filename


def parse_fps(value: str | None) -> float | None:
    if not value:
        return None
    if "/" not in value:
        try:
            return float(value)
        except ValueError:
            return None
    numerator, denominator = value.split("/", 1)
    try:
        den = float(denominator)
        return float(numerator) / den if den else None
    except ValueError:
        return None


def video_response(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    thumbnail_filename = data.get("thumbnail_filename")
    return {
        "id": data["id"],
        "filename": data["original_filename"],
        "contentType": data["content_type"],
        "status": data["status"],
        "sourceUrl": f"/media/{data['stored_filename']}",
        "thumbnailUrl": f"/thumbnails/{thumbnail_filename}" if thumbnail_filename else None,
        "fileSize": data["file_size"],
        "durationMs": data["duration_ms"],
        "width": data["width"],
        "height": data["height"],
        "fps": data["fps"],
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
        "metadata": json.loads(data["metadata_json"]),
    }


def music_track_response(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    return {
        "id": data["id"],
        "filename": data["original_filename"],
        "contentType": data["content_type"],
        "status": data["status"],
        "sourceUrl": f"/api/music-tracks/{data['id']}/download",
        "fileSize": data["file_size"],
        "durationMs": data["duration_ms"],
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
        "metadata": json.loads(data["metadata_json"]),
    }


def session_music_response(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any]:
    if row is None:
        return {
            "musicId": None,
            "enabled": False,
            "startMs": 0,
            "gainDb": -10.0,
            "music": None,
        }
    data = dict(row)
    music = None
    if data.get("music_track_id"):
        music = {
            "id": data["music_track_id"],
            "filename": data["original_filename"],
            "contentType": data["content_type"],
            "sourceUrl": f"/api/music-tracks/{data['music_track_id']}/download",
            "fileSize": data["file_size"],
            "durationMs": data["duration_ms"],
            "metadata": json.loads(data["metadata_json"] or "{}"),
        }
    return {
        "musicId": data.get("music_id"),
        "enabled": bool(data.get("enabled")),
        "startMs": int(data.get("start_ms") or 0),
        "gainDb": float(data.get("gain_db") if data.get("gain_db") is not None else -10.0),
        "music": music,
    }


def video_detail_response(conn: sqlite3.Connection, row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    payload = video_response(row)
    session = conn.execute(
        """
        SELECT id, video_id, status, created_at, updated_at
        FROM cut_sessions
        WHERE video_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (payload["id"], dict(row)["user_id"]),
    ).fetchone()
    export = None
    if session:
        export = conn.execute(
            """
            SELECT id, session_id, status, file_path, error_message, created_at, updated_at
            FROM exports
            WHERE session_id = ? AND user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (session["id"], dict(row)["user_id"]),
        ).fetchone()
    payload["latestSession"] = dict(session) if session else None
    payload["latestExport"] = dict(export) if export else None
    return payload


def save_clip_config(conn: sqlite3.Connection, config: ClipEditConfig) -> None:
    now = utc_now()
    payload = config.model_dump(mode="json", by_alias=True)
    conn.execute(
        """
        INSERT INTO clip_edit_configs (session_id, config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            config_json = excluded.config_json,
            updated_at = excluded.updated_at
        """,
        (config.session_id, json.dumps(payload), now, now),
    )


def save_patch(conn: sqlite3.Connection, session_id: str, patch: ViewPathPatch) -> None:
    now = utc_now()
    payload = patch.model_dump(mode="json", by_alias=True)
    patch_id = new_id("patch")
    conn.execute(
        """
        INSERT INTO view_path_patches (
            id, session_id, video_id, take_id, path_revision,
            replace_start_ms, replace_end_ms, reason, patch_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            patch_id,
            session_id,
            patch.video_id,
            patch.take_id,
            patch.path_revision,
            patch.replace_range.start_ms,
            patch.replace_range.end_ms,
            patch.replace_range.reason,
            json.dumps(payload),
            now,
        ),
    )
    conn.execute(
        "DELETE FROM view_path_points WHERE session_id = ? AND t_ms >= ? AND t_ms < ?",
        (session_id, patch.replace_range.start_ms, patch.replace_range.end_ms),
    )
    conn.executemany(
        """
        INSERT INTO view_path_points (
            id, session_id, video_id, take_id, path_revision, seq, t_ms,
            yaw, pitch, fov_h, fov_v, roll, enabled, cut, locked,
            smooth_follow, interpolation, transition_ms, input, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [point_params(session_id, patch, point, now) for point in patch.points],
    )
    mark_minutes(conn, session_id, patch.replace_range.start_ms, patch.replace_range.end_ms, "dirty", now)


def save_effect_events_patch(conn: sqlite3.Connection, session_id: str, patch: EffectEventsPatch) -> None:
    now = utc_now()
    payload = patch.model_dump(mode="json", by_alias=True)
    patch_id = new_id("effect_patch")
    conn.execute(
        """
        INSERT INTO effect_event_patches (
            id, session_id, video_id, effect_revision,
            replace_start_ms, replace_end_ms, reason, patch_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            patch_id,
            session_id,
            patch.video_id,
            patch.effect_revision,
            patch.replace_range.start_ms,
            patch.replace_range.end_ms,
            patch.replace_range.reason,
            json.dumps(payload),
            now,
        ),
    )
    conn.execute(
        """
        DELETE FROM effect_events
        WHERE session_id = ?
            AND start_ms < ?
            AND end_ms > ?
        """,
        (session_id, patch.replace_range.end_ms, patch.replace_range.start_ms),
    )
    conn.executemany(
        """
        INSERT INTO effect_events (
            id, session_id, video_id, effect_revision, seq, event_name,
            display_name, start_ms, end_ms, params_json, render_policy_json, enabled, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [effect_event_params(session_id, patch, event, now) for event in patch.events],
    )
    mark_minutes(conn, session_id, patch.replace_range.start_ms, patch.replace_range.end_ms, "dirty", now)


def effect_event_params(
    session_id: str,
    patch: EffectEventsPatch,
    event: EffectEvent,
    now: str,
) -> tuple[Any, ...]:
    return (
        new_id("effect"),
        session_id,
        patch.video_id,
        patch.effect_revision,
        event.seq,
        event.event_name,
        event.display_name,
        event.start_ms,
        event.end_ms,
        json.dumps(event.params),
        json.dumps(event.render_policy.model_dump(mode="json", by_alias=True)),
        int(event.enabled),
        now,
    )


def list_effect_events(
    conn: sqlite3.Connection,
    session_id: str,
    start_ms: int,
    end_ms: int,
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT seq, event_name, display_name, start_ms, end_ms, params_json, render_policy_json, enabled
        FROM effect_events
        WHERE session_id = ?
            AND enabled = 1
            AND start_ms < ?
            AND end_ms > ?
        ORDER BY start_ms, seq
        """,
        (session_id, end_ms, start_ms),
    ).fetchall()
    return [
        {
            "seq": int(row["seq"]),
            "event_name": row["event_name"],
            "display_name": row["display_name"],
            "start_ms": int(row["start_ms"]),
            "end_ms": int(row["end_ms"]),
            "params": json.loads(row["params_json"] or "{}"),
            "render_policy": json.loads(row["render_policy_json"] or "{}"),
            "enabled": bool(row["enabled"]),
        }
        for row in rows
    ]


def point_params(session_id: str, patch: ViewPathPatch, point: ViewPathPoint, now: str) -> tuple[Any, ...]:
    return (
        new_id("point"),
        session_id,
        patch.video_id,
        patch.take_id,
        patch.path_revision,
        point.seq,
        point.t_ms,
        point.center.yaw,
        point.center.pitch,
        point.fov.h,
        point.fov.v,
        point.roll,
        int(point.enabled),
        int(point.cut),
        int(point.locked),
        int(point.smooth_follow),
        point.interpolation,
        point.transition_ms,
        point.input,
        now,
    )


def mark_minutes(conn: sqlite3.Connection, session_id: str, start_ms: int, end_ms: int, status: str, now: str) -> None:
    start_minute = max(0, start_ms // 60000)
    end_minute = max(start_minute, max(end_ms - 1, start_ms) // 60000)
    rows = []
    for minute in range(start_minute, end_minute + 1):
        rows.append((new_id("minute"), session_id, minute, minute * 60000, (minute + 1) * 60000, status, now))
    conn.executemany(
        """
        INSERT INTO minute_segments (id, session_id, minute_index, start_ms, end_ms, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, minute_index) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at
        """,
        rows,
    )


def export_response(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    file_size = None
    if data.get("file_path"):
        path = Path(str(data["file_path"]))
        file_size = path.stat().st_size if path.is_file() else None
    return {
        "exportId": data["id"],
        "sessionId": data["session_id"],
        "status": data["status"],
        "downloadReady": data["status"] == "ready" and bool(data.get("file_path")),
        "fileSize": file_size,
        "errorMessage": data.get("error_message"),
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
    }


def get_session_music(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT
            session_music.*,
            music_tracks.id AS music_track_id,
            music_tracks.original_filename,
            music_tracks.stored_filename,
            music_tracks.content_type,
            music_tracks.file_size,
            music_tracks.duration_ms,
            music_tracks.metadata_json
        FROM session_music
        LEFT JOIN music_tracks ON music_tracks.id = session_music.music_id
        WHERE session_music.session_id = ?
        """,
        (session_id,),
    ).fetchone()


def mux_music_to_video(
    video_path: Path,
    music_path: Path,
    target_path: Path,
    duration_ms: int,
    gain_db: float = -10.0,
) -> None:
    duration_seconds = max(duration_ms / 1000, 0.05)
    volume = 10 ** (gain_db / 20)
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_path),
        "-i",
        str(music_path),
        "-filter_complex",
        f"[1:a]volume={volume:.6f},apad[a]",
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-t",
        f"{duration_seconds:.3f}",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120)


def concat_segments(segment_paths: list[Path], list_path: Path, target_path: Path) -> None:
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
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=60)


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
