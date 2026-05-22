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
EXPORTS_DIR = STORAGE_DIR / "exports"
TMP_DIR = STORAGE_DIR / "tmp"
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
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
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
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                params_json TEXT NOT NULL,
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
            """
        )
        ensure_column(conn, "videos", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "cut_sessions", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "exports", "user_id", "TEXT NOT NULL DEFAULT 'user_legacy_demo'")
        ensure_column(conn, "exports", "error_message", "TEXT")
        ensure_column(conn, "view_path_points", "interpolation", "TEXT NOT NULL DEFAULT 'linear'")
        ensure_column(conn, "view_path_points", "transition_ms", "INTEGER NOT NULL DEFAULT 0")
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
        "stream=width,height,r_frame_rate:format=duration",
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
        "source": "ffprobe",
    }


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
    return {
        "id": data["id"],
        "filename": data["original_filename"],
        "contentType": data["content_type"],
        "status": data["status"],
        "sourceUrl": f"/media/{data['stored_filename']}",
        "fileSize": data["file_size"],
        "durationMs": data["duration_ms"],
        "width": data["width"],
        "height": data["height"],
        "fps": data["fps"],
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
        "metadata": json.loads(data["metadata_json"]),
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
            start_ms, end_ms, params_json, enabled, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        event.start_ms,
        event.end_ms,
        json.dumps(event.params),
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
        SELECT event_name, start_ms, end_ms, params_json, enabled
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
            "event_name": row["event_name"],
            "start_ms": int(row["start_ms"]),
            "end_ms": int(row["end_ms"]),
            "params": json.loads(row["params_json"] or "{}"),
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
    return {
        "exportId": data["id"],
        "sessionId": data["session_id"],
        "status": data["status"],
        "downloadReady": data["status"] == "ready" and bool(data.get("file_path")),
        "errorMessage": data.get("error_message"),
        "createdAt": data["created_at"],
        "updatedAt": data["updated_at"],
    }


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
