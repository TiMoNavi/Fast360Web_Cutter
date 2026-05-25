from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.models import ClipEditConfig  # noqa: E402
from app.storage import (  # noqa: E402
    VIDEOS_DIR,
    connect,
    generate_video_thumbnail,
    init_storage,
    probe_video_metadata,
    save_clip_config,
    utc_now,
)


DEFAULT_EMAIL = "demo@invisible.local"

TRAINING_ITEMS = [
    {
        "slug": "paragliding-tolmin-kangri",
        "title": "Training 4K 360 - Paragliding Tolmin Kangri",
        "url": "https://upload.wikimedia.org/wikipedia/commons/a/a3/2021_06_12_PARA_360_Tolmin_SokoleONE_2_-_UP_Kangri.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:2021_06_12_PARA_360_Tolmin_SokoleONE_2_-_UP_Kangri.webm",
        "sourceTitle": "2021 06 12 PARA 360 Tolmin SokoleONE 2 - UP Kangri",
        "attribution": "Sokole ONE, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "sport": "paragliding",
        "startSeconds": 0,
        "durationSeconds": 52,
        "sourceWidth": 5760,
        "sourceHeight": 2880,
    },
    {
        "slug": "old-ghost-road-mountain-bike",
        "title": "Training 4K 360 - Old Ghost Road Mountain Bike",
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a4/3-mins-in-360_on_The_Old_Ghost_Road.webm/3-mins-in-360_on_The_Old_Ghost_Road.webm.2160p.vp9.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:3-mins-in-360_on_The_Old_Ghost_Road.webm",
        "sourceTitle": "3-mins-in-360 on The Old Ghost Road",
        "attribution": "360 New Zealand Ltd, CC BY-SA 3.0, via Wikimedia Commons.",
        "license": "CC BY-SA 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
        "sport": "mountain_bike",
        "startSeconds": 0,
        "durationSeconds": 60,
        "sourceWidth": 4096,
        "sourceHeight": 2048,
    },
    {
        "slug": "bellpuig-onboard-moto",
        "title": "Training 4K 360 - Bellpuig Onboard Moto",
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/4/48/Video_360_VR_on_board_de_Raul_Sanchez_en_Bellpuig.webm/Video_360_VR_on_board_de_Raul_Sanchez_en_Bellpuig.webm.2160p.vp9.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Video_360_VR_on_board_de_Raul_Sanchez_en_Bellpuig.webm",
        "sourceTitle": "Video 360 VR on board de Raul Sanchez en Bellpuig",
        "attribution": "Fotos, Joel Molina, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "sport": "motocross",
        "startSeconds": 0,
        "durationSeconds": 60,
        "sourceWidth": 3840,
        "sourceHeight": 2048,
    },
]


def user_key(user_id: str) -> str:
    return hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:12]


def deterministic_video_id(user_id: str, slug: str) -> str:
    digest = user_key(user_id)
    return f"video_training_{digest}_{slug.replace('-', '_')}"


def deterministic_session_id(user_id: str, slug: str) -> str:
    digest = user_key(user_id)
    return f"session_training_{digest}_{slug.replace('-', '_')}"


def find_user_id(email: str) -> str:
    with connect() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if row is None:
        raise SystemExit(f"User not found for email: {email}")
    return str(row["id"])


def transcode_item(item: dict, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    vf = "scale=4096:2048:flags=lanczos,fps=30,format=yuv420p"
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(item["startSeconds"]),
        "-c:v",
        "libvpx-vp9",
        "-user_agent",
        "360videocutter-local-seed/0.1",
        "-i",
        item["url"],
        "-t",
        str(item["durationSeconds"]),
        "-vf",
        vf,
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "30",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    subprocess.run(cmd, check=True, timeout=1800)


def seed_item(user_id: str, item: dict, force: bool = False) -> dict:
    video_id = deterministic_video_id(user_id, item["slug"])
    session_id = deterministic_session_id(user_id, item["slug"])
    stored_filename = f"{video_id}.mp4"
    target_path = VIDEOS_DIR / stored_filename

    if force or not target_path.is_file():
        tmp_path = target_path.with_suffix(".tmp.mp4")
        tmp_path.unlink(missing_ok=True)
        transcode_item(item, tmp_path)
        tmp_path.replace(target_path)

    metadata = probe_video_metadata(target_path)
    now = utc_now()
    metadata_json = {
        **metadata,
        "isTrainingSample": True,
        "trainingCategory": "extreme_360",
        "sport": item["sport"],
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "targetResolution": "4096x2048",
        "sourceTitle": item["sourceTitle"],
        "sourceUrl": item["url"],
        "sourcePage": item["sourcePage"],
        "sourceWidth": item["sourceWidth"],
        "sourceHeight": item["sourceHeight"],
        "sourceStartSeconds": item["startSeconds"],
        "sourceDurationSeconds": item["durationSeconds"],
        "license": item["license"],
        "licenseUrl": item["licenseUrl"],
        "attribution": item["attribution"],
        "transcode": {
            "videoCodec": "libx264",
            "preset": "veryfast",
            "crf": 30,
            "fps": 30,
            "audio": "none",
        },
    }
    thumbnail_filename = generate_video_thumbnail(target_path, video_id, metadata.get("durationMs"))

    with connect() as conn:
        conn.execute(
            """
            INSERT INTO videos (
                id, user_id, original_filename, stored_filename, content_type,
                thumbnail_filename, file_size, duration_ms, width, height, fps,
                metadata_json, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                user_id = excluded.user_id,
                original_filename = excluded.original_filename,
                stored_filename = excluded.stored_filename,
                content_type = excluded.content_type,
                thumbnail_filename = excluded.thumbnail_filename,
                file_size = excluded.file_size,
                duration_ms = excluded.duration_ms,
                width = excluded.width,
                height = excluded.height,
                fps = excluded.fps,
                metadata_json = excluded.metadata_json,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                video_id,
                user_id,
                f"{item['title']}.mp4",
                stored_filename,
                "video/mp4",
                thumbnail_filename,
                target_path.stat().st_size,
                metadata["durationMs"],
                metadata["width"],
                metadata["height"],
                metadata["fps"],
                json.dumps(metadata_json),
                "ready_for_xr",
                now,
                now,
            ),
        )
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
            (session_id, video_id, user_id, "collecting", 1, now, now),
        )
        save_clip_config(conn, ClipEditConfig(videoId=video_id, sessionId=session_id))

    return {
        "videoId": video_id,
        "sessionId": session_id,
        "filename": stored_filename,
        "durationMs": metadata["durationMs"],
        "width": metadata["width"],
        "height": metadata["height"],
        "fps": metadata["fps"],
        "fileSize": target_path.stat().st_size,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed 4K 360 extreme sports training media for a local user.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Existing account email to receive the training media.")
    parser.add_argument("--force", action="store_true", help="Re-transcode local MP4 files even if they already exist.")
    args = parser.parse_args()

    init_storage()
    user_id = find_user_id(args.email)
    print(f"Seeding {len(TRAINING_ITEMS)} 4K 360 training videos for {args.email} ({user_id})")
    for item in TRAINING_ITEMS:
        print(f"Processing {item['slug']}...", flush=True)
        result = seed_item(user_id, item, force=args.force)
        print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
