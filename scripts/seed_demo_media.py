from __future__ import annotations

import hashlib
import json
import secrets
import shutil
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.storage import (  # noqa: E402
    DB_PATH,
    EXPORTS_DIR,
    VIDEOS_DIR,
    connect,
    init_storage,
    probe_video_metadata,
    utc_now,
)


DEMO_EMAIL = "demo@invisible.local"
DEMO_PASSWORD = "password123"
PBKDF2_ITERATIONS = 200_000

DEMO_ITEMS = [
    {
        "slug": "pano_slow_yaw",
        "title": "Demo 360 - Pano slow yaw.mp4",
        "source": ROOT_DIR / "storage" / "sample-videos" / "pano.mp4",
        "export": EXPORTS_DIR / "timeline-review" / "01_horizontal_yaw_90deg.mp4",
        "session_suffix": "slow-yaw",
    },
    {
        "slug": "grid_pitch",
        "title": "Demo 360 - Equirect grid pitch.mp4",
        "source": ROOT_DIR / "storage" / "sample-videos" / "equirect-grid.mp4",
        "export": EXPORTS_DIR / "timeline-review" / "02_vertical_pitch_90deg.mp4",
        "session_suffix": "pitch-cut",
    },
    {
        "slug": "public_relaxatron",
        "title": "Demo 360 - Relaxatron source.mp4",
        "source": ROOT_DIR
        / "storage"
        / "sample-videos"
        / "public-360"
        / "elevr-relaxatron-mono-960x480-8s.mp4",
        "export": EXPORTS_DIR / "timeline-review" / "05_black_field_transition.mp4",
        "session_suffix": "fade-export",
    },
]


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
    )
    return digest.hex()


def ensure_demo_user() -> str:
    with connect() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL,)).fetchone()
        if existing:
            return str(existing["id"])

        salt = secrets.token_hex(16)
        user_id = "user_demo_media"
        conn.execute(
            """
            INSERT OR REPLACE INTO users (id, email, password_hash, password_salt, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, DEMO_EMAIL, hash_password(DEMO_PASSWORD, salt), salt, utc_now()),
        )
        return user_id


def seed_for_user(user_id: str) -> int:
    inserted = 0
    now = utc_now()

    with connect() as conn:
        for item in DEMO_ITEMS:
            slug = item["slug"]
            video_id = f"video_demo_{user_id.removeprefix('user_')}_{slug}"
            session_id = f"session_demo_{user_id.removeprefix('user_')}_{item['session_suffix']}"
            export_id = f"export_demo_{user_id.removeprefix('user_')}_{slug}"

            source_path = Path(item["source"])
            export_source_path = Path(item["export"])
            if not source_path.is_file() or not export_source_path.is_file():
                raise FileNotFoundError(f"Missing demo media for {slug}")

            stored_filename = f"{video_id}{source_path.suffix.lower()}"
            stored_video_path = VIDEOS_DIR / stored_filename
            if not stored_video_path.exists():
                shutil.copy2(source_path, stored_video_path)

            export_path = EXPORTS_DIR / f"{export_id}.mp4"
            if not export_path.exists():
                shutil.copy2(export_source_path, export_path)

            metadata = probe_video_metadata(stored_video_path)
            result = conn.execute(
                """
                INSERT OR IGNORE INTO videos (
                    id, user_id, original_filename, stored_filename, content_type,
                    file_size, duration_ms, width, height, fps, metadata_json,
                    status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    video_id,
                    user_id,
                    item["title"],
                    stored_filename,
                    "video/mp4",
                    stored_video_path.stat().st_size,
                    metadata["durationMs"],
                    metadata["width"],
                    metadata["height"],
                    metadata["fps"],
                    json.dumps({**metadata, "demo": True, "source": metadata.get("source", "demo")}),
                    "ready_for_xr",
                    now,
                    now,
                ),
            )
            inserted += result.rowcount

            conn.execute(
                """
                INSERT INTO cut_sessions (id, video_id, user_id, status, timeline_revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    video_id = excluded.video_id,
                    user_id = excluded.user_id,
                    status = excluded.status,
                    timeline_revision = excluded.timeline_revision,
                    updated_at = excluded.updated_at
                """,
                (session_id, video_id, user_id, "export_ready", 1, now, now),
            )
            conn.execute(
                """
                INSERT INTO clip_edit_configs (session_id, config_json, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    config_json = excluded.config_json,
                    updated_at = excluded.updated_at
                """,
                (
                    session_id,
                    json.dumps(
                        {
                            "version": 1,
                            "videoId": video_id,
                            "sessionId": session_id,
                            "source": "demo-seed",
                            "timelineRevision": 1,
                            "output": {"aspect": "16:9", "width": 1920, "height": 1080, "fps": 30},
                        }
                    ),
                    now,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO exports (id, session_id, user_id, status, file_path, error_message, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    session_id = excluded.session_id,
                    user_id = excluded.user_id,
                    status = excluded.status,
                    file_path = excluded.file_path,
                    error_message = excluded.error_message,
                    updated_at = excluded.updated_at
                """,
                (export_id, session_id, user_id, "ready", str(export_path), None, now, now),
            )
            conn.execute(
                """
                INSERT INTO minute_segments (id, session_id, minute_index, start_ms, end_ms, status, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id, minute_index) DO UPDATE SET
                    status = excluded.status,
                    updated_at = excluded.updated_at
                """,
                (f"minute_demo_{session_id}_0", session_id, 0, 0, 60000, "done", now),
            )

    return inserted


def main() -> None:
    init_storage()
    ensure_demo_user()
    with connect() as conn:
        user_ids = [row["id"] for row in conn.execute("SELECT id FROM users ORDER BY created_at")]

    total_inserted = 0
    for user_id in user_ids:
        total_inserted += seed_for_user(str(user_id))

    print(f"Seeded demo media for {len(user_ids)} users using {DB_PATH}")
    print(f"New video rows inserted: {total_inserted}")
    print(f"Demo login: {DEMO_EMAIL} / {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
