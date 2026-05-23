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


DEFAULT_EMAIL = "madjad020@gmail.com"

INSTA360_ITEMS = [
    {
        "slug": "pro2-drone-industrial-flight",
        "title": "Training Insta360 - Pro2 Drone Industrial Flight",
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c8/Test_Insta360_Pro2_on_DJI_Inspire2_8K_59%2C9_fps_-_YouTube.webm/Test_Insta360_Pro2_on_DJI_Inspire2_8K_59%2C9_fps_-_YouTube.webm.2160p.vp9.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Test_Insta360_Pro2_on_DJI_Inspire2_8K_59,9_fps_-_YouTube.webm",
        "sourceTitle": "Test Insta360 Pro2 on DJI Inspire2 8K 59,9 fps",
        "attribution": "KinoLet, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "camera": "Insta360 Pro2",
        "sport": "drone_flight",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "startSeconds": 0,
        "durationSeconds": 60,
        "targetWidth": 4096,
        "targetHeight": 2048,
        "sourceWidth": 7680,
        "sourceHeight": 3840,
        "decoder": "libvpx-vp9",
    },
    {
        "slug": "x5-norah-head-rock-walk",
        "title": "Training Insta360 - X5 Norah Head Rock Walk",
        "url": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Norah_Head_Insta360_X5_Virtual_Tour_OHNE_TON.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Norah_Head_Insta360_X5_Virtual_Tour_OHNE_TON.webm",
        "sourceTitle": "Norah Head Insta360 X5 Virtual Tour",
        "attribution": "GlennsYouTube, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "camera": "Insta360 X5",
        "sport": "rock_coast_walk",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "startSeconds": 20,
        "durationSeconds": 60,
        "targetWidth": 4096,
        "targetHeight": 2048,
        "sourceWidth": 7680,
        "sourceHeight": 3840,
    },
    {
        "slug": "x3-pohorje-downhill-ride",
        "title": "Training Insta360 - X3 Pohorje Downhill Ride",
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/2/28/Downhill_Ride_from_Pohorje%2C_Slovenia_%E2%80%93_Yamaha_XSR_125.webm/Downhill_Ride_from_Pohorje%2C_Slovenia_%E2%80%93_Yamaha_XSR_125.webm.1080p.vp9.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Downhill_Ride_from_Pohorje,_Slovenia_%E2%80%93_Yamaha_XSR_125.webm",
        "sourceTitle": "Downhill Ride from Pohorje, Slovenia - Yamaha XSR 125",
        "attribution": "Big Mark Moto, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "camera": "Insta360 X3",
        "sport": "motorcycle_downhill",
        "projection": "flat_pov_from_360_camera",
        "layout": "16:9",
        "startSeconds": 0,
        "durationSeconds": 60,
        "targetWidth": 1920,
        "targetHeight": 1080,
        "sourceWidth": 3840,
        "sourceHeight": 2160,
        "decoder": "libvpx-vp9",
    },
    {
        "slug": "x3-spirited-twisty-road",
        "title": "Training Insta360 - X3 Spirited Twisty Road",
        "url": "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/59/Spirited_ride_on_epic_road_-_Yamaha_XSR_125_%26_360_camera_-Slovenia.webm/Spirited_ride_on_epic_road_-_Yamaha_XSR_125_%26_360_camera_-Slovenia.webm.1080p.vp9.webm",
        "sourcePage": "https://commons.wikimedia.org/wiki/File:Spirited_ride_on_epic_road_-_Yamaha_XSR_125_%26_360_camera_-Slovenia.webm",
        "sourceTitle": "Spirited ride on epic road - Yamaha XSR 125 & 360 camera - Slovenia",
        "attribution": "Big Mark Moto, CC BY 3.0, via Wikimedia Commons.",
        "license": "CC BY 3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
        "camera": "Insta360 X3",
        "sport": "motorcycle_twisty_road",
        "projection": "flat_pov_from_360_camera",
        "layout": "16:9",
        "startSeconds": 0,
        "durationSeconds": 60,
        "targetWidth": 1920,
        "targetHeight": 1080,
        "sourceWidth": 1920,
        "sourceHeight": 1080,
        "decoder": "libvpx-vp9",
    },
]


def user_key(user_id: str) -> str:
    return hashlib.sha1(user_id.encode("utf-8")).hexdigest()[:12]


def deterministic_video_id(user_id: str, slug: str) -> str:
    return f"video_insta360_{user_key(user_id)}_{slug.replace('-', '_')}"


def deterministic_session_id(user_id: str, slug: str) -> str:
    return f"session_insta360_{user_key(user_id)}_{slug.replace('-', '_')}"


def find_user_id(email: str) -> str:
    with connect() as conn:
        row = conn.execute("SELECT id FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    if row is None:
        raise SystemExit(f"User not found for email: {email}")
    return str(row["id"])


def transcode_item(item: dict, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    vf = f"scale={item['targetWidth']}:{item['targetHeight']}:flags=lanczos,fps=30,format=yuv420p"
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(item["startSeconds"]),
        "-user_agent",
        "360videocutter-local-seed/0.1",
    ]
    if item.get("decoder"):
        cmd.extend(["-c:v", item["decoder"]])
    cmd.extend(
        [
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
    )
    subprocess.run(cmd, check=True, timeout=2400)


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
        "trainingCategory": "insta360_action",
        "camera": item["camera"],
        "sport": item["sport"],
        "projection": item["projection"],
        "layout": item["layout"],
        "targetResolution": f"{item['targetWidth']}x{item['targetHeight']}",
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
        "camera": item["camera"],
        "projection": item["projection"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Insta360-shot training media for a local user.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Existing account email to receive the training media.")
    parser.add_argument("--force", action="store_true", help="Re-transcode local MP4 files even if they already exist.")
    args = parser.parse_args()

    init_storage()
    user_id = find_user_id(args.email)
    print(f"Seeding {len(INSTA360_ITEMS)} Insta360 training videos for {args.email} ({user_id})", flush=True)
    for item in INSTA360_ITEMS:
        print(f"Processing {item['slug']}...", flush=True)
        result = seed_item(user_id, item, force=args.force)
        print(json.dumps(result, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
