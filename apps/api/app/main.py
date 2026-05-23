import hashlib
import json
import os
import secrets
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    AuthRequest,
    AuthUser,
    ClipEditConfig,
    EffectEventsPatch,
    PlaybackClientState,
    SessionMusicConfig,
    SessionStatus,
    ThumbnailRequest,
    ViewPathPatch,
)
from .rendering import run_frame_remap_equirect
from .rendering.effects import events_for_segment
from .rendering.path_pipeline import (
    build_enabled_render_segments,
    prepare_render_segment,
    relative_segment_points,
    render_point_from_row,
)
from .storage import (
    EXPORTS_DIR,
    MUSIC_DIR,
    SAMPLE_VIDEOS_DIR,
    THUMBNAILS_DIR,
    TMP_DIR,
    VIDEOS_DIR,
    connect,
    ensure_video_thumbnail,
    export_response,
    generate_360_video_thumbnail,
    generate_video_thumbnail,
    get_session_music,
    init_storage,
    list_effect_events,
    mark_minutes,
    music_track_response,
    mux_music_to_video,
    new_id,
    probe_audio_metadata,
    probe_video_metadata,
    session_music_response,
    concat_segments_reencode,
    save_clip_config,
    save_effect_events_patch,
    save_patch,
    utc_now,
    video_detail_response,
    video_response,
)


def read_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


app = FastAPI(title="The Invisible Director API", version="0.1.0")
cors_allow_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_origin_regex=(
        r"https?://("
        r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"10(?:\.\d{1,3}){3}|"
        r"192\.168(?:\.\d{1,3}){2}|"
        r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
        r")(?::\d+)?"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
init_storage()
app.mount("/media", StaticFiles(directory=VIDEOS_DIR), name="media")
app.mount("/thumbnails", StaticFiles(directory=THUMBNAILS_DIR), name="thumbnails")

SESSION_COOKIE = "tid_session"
SESSION_DAYS = 14
PBKDF2_ITERATIONS = 200_000
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
UPLOAD_CHUNK_SIZE = 1024 * 1024
DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
MAX_UPLOAD_BYTES = read_int_env("VIDEO_UPLOAD_MAX_BYTES", DEFAULT_MAX_UPLOAD_BYTES)
DEFAULT_MAX_MUSIC_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_MUSIC_UPLOAD_BYTES = read_int_env("MUSIC_UPLOAD_MAX_BYTES", DEFAULT_MAX_MUSIC_UPLOAD_BYTES)
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
ALLOWED_VIDEO_CONTENT_TYPES = {"application/octet-stream"}
ALLOWED_MUSIC_SUFFIXES = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
ALLOWED_MUSIC_CONTENT_TYPES = {"application/octet-stream"}
RENDER_TEST_MAX_DURATION_MS = 60_000
RENDER_TEST_FPS = 30
RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND = 360
RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND = 360
RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND = 360
DEMO_VIDEO_DIR = SAMPLE_VIDEOS_DIR / "public-360"
DEMO_VIDEO_CATALOG = [
    {
        "id": "overpass-warmup",
        "title": "Overpass Warmup",
        "subtitle": "A short outdoor 360 clip for first-time framing.",
        "description": "Use this compact overpass clip to test basic yaw, cuts, and export without uploading your own file.",
        "tags": ["outdoor", "4s", "starter"],
        "difficulty": "beginner",
        "sourceFilename": "valiant-overpass-mono-960x480-4s.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 4000,
        "resolutionLabel": "960 x 480",
        "attribution": "Valiant360 demo clip, MIT license, copyright Charlie Hoey.",
        "tutorialSteps": [
            {"title": "Pick the source", "body": "Start with a tiny 360 file so loading and rendering stay quick."},
            {"title": "Frame the path", "body": "Enter WebXR and point the view toward the moment you want to keep."},
            {"title": "Export a cut", "body": "Return to the web page and run the test render to download an MP4."},
        ],
    },
    {
        "id": "relaxatron-tour",
        "title": "Relaxatron Tour",
        "subtitle": "A mellow room-scale clip with clear spatial cues.",
        "description": "Good for learning how a 360 source becomes a normal 16:9 edit path.",
        "tags": ["indoor", "8s", "guided"],
        "difficulty": "beginner",
        "sourceFilename": "elevr-relaxatron-mono-960x480-8s.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 8000,
        "resolutionLabel": "960 x 480",
        "attribution": "eleVR Web Player demo video, MPL-2.0 license.",
        "tutorialSteps": [
            {"title": "Preview the sphere", "body": "Scrub the clip and notice where the interesting center of action sits."},
            {"title": "Record intent", "body": "Use WebXR to create a view path instead of recording the headset screen."},
            {"title": "Review output", "body": "Download the rendered test clip from the normal web detail page."},
        ],
    },
    {
        "id": "shark-scan",
        "title": "Shark Scan",
        "subtitle": "A playful 360 clip for practicing faster attention shifts.",
        "description": "Use it to try a more dramatic camera path while still keeping the file small.",
        "tags": ["motion", "8s", "practice"],
        "difficulty": "practice",
        "sourceFilename": "videojs-shark-mono-960x480-8s.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 8000,
        "resolutionLabel": "960 x 480",
        "attribution": "videojs-panorama demo asset, Apache-2.0 license, copyright yanwsh@gmail.com.",
        "tutorialSteps": [
            {"title": "Find the action", "body": "Use the preview to decide where your virtual camera should look first."},
            {"title": "Try a motion path", "body": "Enter WebXR and create a more active path through the 360 space."},
            {"title": "Compare results", "body": "Render once, then reopen the same session to adjust the path."},
        ],
    },
]


@app.on_event("startup")
def startup() -> None:
    init_storage()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PBKDF2_ITERATIONS,
    )
    return digest.hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    try:
        password_hash = hash_password(password, salt)
    except ValueError:
        return False
    return secrets.compare_digest(password_hash, expected_hash)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def cleanup_expired_sessions(conn, now: str | None = None) -> None:
    conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ?", (now or datetime.now(timezone.utc).isoformat(),))


def create_auth_session(response: Response, user_id: str) -> str:
    session_id = new_id("sess")
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(days=SESSION_DAYS)
    with connect() as conn:
        cleanup_expired_sessions(conn, created_at.isoformat())
        conn.execute(
            """
            INSERT INTO auth_sessions (id, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, user_id, created_at.isoformat(), expires_at.isoformat()),
        )
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        secure=SESSION_COOKIE_SECURE,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
    )
    return session_id


def require_user(tid_session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict[str, str]:
    if not tid_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        cleanup_expired_sessions(conn, now)
        row = conn.execute(
            """
            SELECT users.id, users.email
            FROM auth_sessions
            JOIN users ON users.id = auth_sessions.user_id
            WHERE auth_sessions.id = ? AND auth_sessions.expires_at > ?
            """,
            (tid_session, now),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {"id": row["id"], "email": row["email"]}


@app.post("/api/auth/register")
def register(payload: AuthRequest, response: Response) -> AuthUser:
    email = normalize_email(payload.email)
    if "@" not in email or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Use a valid email and a password with at least 6 characters")
    user_id = new_id("user")
    salt = secrets.token_hex(16)
    password_hash = hash_password(payload.password, salt)
    try:
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO users (id, email, password_hash, password_salt, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, email, password_hash, salt, utc_now()),
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Email already registered") from exc
    create_auth_session(response, user_id)
    return AuthUser(id=user_id, email=email)


@app.post("/api/auth/login")
def login(payload: AuthRequest, response: Response) -> AuthUser:
    email = normalize_email(payload.email)
    with connect() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, password_salt FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if row is None or not verify_password(payload.password, row["password_salt"], row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    create_auth_session(response, row["id"])
    return AuthUser(id=row["id"], email=row["email"])


@app.get("/api/auth/me")
def me(user: dict[str, str] = Depends(require_user)) -> AuthUser:
    return AuthUser(id=user["id"], email=user["email"])


@app.post("/api/auth/logout")
def logout(response: Response, tid_session: str | None = Cookie(default=None, alias=SESSION_COOKIE)) -> dict[str, str]:
    if tid_session:
        with connect() as conn:
            conn.execute("DELETE FROM auth_sessions WHERE id = ?", (tid_session,))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "logged_out"}


def demo_video_by_id(sample_id: str) -> dict:
    for item in DEMO_VIDEO_CATALOG:
        if item["id"] == sample_id:
            return item
    raise HTTPException(status_code=404, detail="Demo video not found")


def demo_source_path(item: dict) -> Path:
    path = (DEMO_VIDEO_DIR / item["sourceFilename"]).resolve()
    try:
        path.relative_to(DEMO_VIDEO_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Demo video file missing")
    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Demo video file missing. Restore storage/sample-videos/public-360 before using demos.",
        )
    return path


def demo_thumbnail_filename(item: dict) -> str | None:
    source_path = demo_source_path(item)
    thumbnail_id = f"demo-{item['id']}"
    thumbnail_path = THUMBNAILS_DIR / f"{thumbnail_id}.jpg"
    if thumbnail_path.is_file():
        return thumbnail_path.name
    return generate_360_video_thumbnail(
        source_path,
        thumbnail_id,
        duration_ms=int(item["durationHintMs"]),
        output_width=640,
        output_height=360,
    )


def demo_video_response(item: dict) -> dict:
    thumbnail_filename = demo_thumbnail_filename(item)
    sample_id = item["id"]
    return {
        **item,
        "sourceUrl": f"/api/demo-videos/{sample_id}/stream",
        "thumbnailUrl": f"/thumbnails/{thumbnail_filename}" if thumbnail_filename else None,
    }


def parse_byte_range(range_header: str | None, size: int) -> dict[str, int] | None:
    if not range_header:
        return None
    if not range_header.startswith("bytes="):
        return None
    start_text, _, end_text = range_header.removeprefix("bytes=").partition("-")
    try:
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else size - 1
    except ValueError:
        return None
    if start < 0 or end < start or start >= size:
        return None
    return {"start": start, "end": min(end, size - 1)}


def iter_file_range(path: Path, start: int, end: int):
    with path.open("rb") as file:
        file.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file.read(min(UPLOAD_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def demo_video_id(user_id: str, sample_id: str) -> str:
    digest = hashlib.sha1(f"{user_id}:{sample_id}".encode("utf-8")).hexdigest()[:14]
    return f"video_demo_{digest}_{sample_id.replace('-', '_')}"


def demo_session_id(user_id: str, sample_id: str) -> str:
    digest = hashlib.sha1(f"session:{user_id}:{sample_id}".encode("utf-8")).hexdigest()[:14]
    return f"session_demo_{digest}_{sample_id.replace('-', '_')}"


@app.get("/api/demo-videos")
def list_demo_videos() -> dict[str, list[dict]]:
    return {"videos": [demo_video_response(item) for item in DEMO_VIDEO_CATALOG]}


@app.get("/api/demo-videos/{sample_id}/stream")
def stream_demo_video(sample_id: str, request: Request) -> StreamingResponse:
    item = demo_video_by_id(sample_id)
    path = demo_source_path(item)
    size = path.stat().st_size
    range_request = parse_byte_range(request.headers.get("range"), size)
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "video/mp4",
    }
    if range_request is None:
        headers["Content-Length"] = str(size)
        return StreamingResponse(iter_file_range(path, 0, size - 1), headers=headers)

    start = range_request["start"]
    end = range_request["end"]
    headers["Content-Length"] = str(end - start + 1)
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(iter_file_range(path, start, end), status_code=206, headers=headers)


@app.post("/api/demo-videos/{sample_id}/start")
def start_demo_video(sample_id: str, user: dict[str, str] = Depends(require_user)) -> dict[str, str]:
    item = demo_video_by_id(sample_id)
    source_path = demo_source_path(item)
    video_id = demo_video_id(user["id"], sample_id)
    stored_filename = f"{video_id}{source_path.suffix.lower()}"
    target_path = VIDEOS_DIR / stored_filename
    now = utc_now()

    if not target_path.is_file():
        shutil.copy2(source_path, target_path)

    metadata = probe_video_metadata(target_path)
    metadata_json = {
        **metadata,
        "isDemo": True,
        "demoId": sample_id,
        "demoAttribution": item["attribution"],
        "claimedAt": now,
        "projection": item["projection"],
        "layout": item["layout"],
    }
    thumbnail_filename = generate_video_thumbnail(target_path, video_id, metadata.get("durationMs"))

    with connect() as conn:
        existing_video = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND user_id = ?",
            (video_id, user["id"]),
        ).fetchone()
        if existing_video is None:
            conn.execute(
                """
                INSERT INTO videos (
                    id, user_id, original_filename, stored_filename, content_type,
                    file_size, duration_ms, width, height, fps, metadata_json,
                    thumbnail_filename, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    video_id,
                    user["id"],
                    f"Demo 360 - {item['title']}.mp4",
                    stored_filename,
                    "video/mp4",
                    target_path.stat().st_size,
                    metadata["durationMs"] or item["durationHintMs"],
                    metadata["width"],
                    metadata["height"],
                    metadata["fps"],
                    json.dumps(metadata_json),
                    thumbnail_filename,
                    "ready_for_xr",
                    now,
                    now,
                ),
            )
        else:
            conn.execute(
                """
                UPDATE videos
                SET stored_filename = ?, file_size = ?, metadata_json = ?,
                    thumbnail_filename = COALESCE(thumbnail_filename, ?), updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    stored_filename,
                    target_path.stat().st_size,
                    json.dumps({**json.loads(existing_video["metadata_json"] or "{}"), **metadata_json}),
                    thumbnail_filename,
                    now,
                    video_id,
                    user["id"],
                ),
            )

        session = conn.execute(
            """
            SELECT id
            FROM cut_sessions
            WHERE video_id = ? AND user_id = ? AND status != ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (video_id, user["id"], "abandoned"),
        ).fetchone()
        if session is None:
            preferred_session_id = demo_session_id(user["id"], sample_id)
            abandoned_session = conn.execute(
                "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ? AND status = ?",
                (preferred_session_id, user["id"], "abandoned"),
            ).fetchone()
            session_id = new_id("session") if abandoned_session else preferred_session_id
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
                (session_id, video_id, user["id"], "collecting", 1, now, now),
            )
            save_clip_config(conn, ClipEditConfig(videoId=video_id, sessionId=session_id))
        else:
            session_id = session["id"]

    return {
        "sampleId": sample_id,
        "videoId": video_id,
        "sessionId": session_id,
        "mobileVideoPath": f"/mobile/videos/{video_id}",
        "xrPath": "/xr/player",
    }


@app.get("/api/videos")
def list_videos(user: dict[str, str] = Depends(require_user)) -> dict[str, list[dict]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
        videos = []
        for row in rows:
            data = dict(row)
            thumbnail_filename = ensure_video_thumbnail(conn, row)
            if thumbnail_filename:
                data["thumbnail_filename"] = thumbnail_filename
            videos.append(video_response(data))
    return {"videos": videos}


def validate_upload_metadata(original_name: str, content_type: str | None) -> str:
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported video file extension")

    normalized_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type and not (
        normalized_content_type.startswith("video/") or normalized_content_type in ALLOWED_VIDEO_CONTENT_TYPES
    ):
        raise HTTPException(status_code=400, detail="Unsupported video content type")
    return suffix


def validate_music_upload_metadata(original_name: str, content_type: str | None) -> str:
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_MUSIC_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported music file extension")

    normalized_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type and not (
        normalized_content_type.startswith("audio/") or normalized_content_type in ALLOWED_MUSIC_CONTENT_TYPES
    ):
        raise HTTPException(status_code=400, detail="Unsupported music content type")
    return suffix


def copy_upload_with_limit(file: UploadFile, target: Path, max_bytes: int = MAX_UPLOAD_BYTES) -> int:
    written = 0
    with target.open("wb") as output:
        while chunk := file.file.read(UPLOAD_CHUNK_SIZE):
            written += len(chunk)
            if written > max_bytes:
                raise HTTPException(status_code=413, detail="Uploaded file is too large")
            output.write(chunk)
    if written == 0:
        raise HTTPException(status_code=400, detail="Uploaded video is empty")
    return written


@app.post("/api/videos/upload")
async def upload_video(
    file: UploadFile = File(...),
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int | float | None | dict]:
    video_id = new_id("video")
    original_name = Path(file.filename or "upload.bin").name
    target: Path | None = None

    try:
        suffix = validate_upload_metadata(original_name, file.content_type)
        stored_filename = f"{video_id}{suffix}"
        target = VIDEOS_DIR / stored_filename
        file_size = copy_upload_with_limit(file, target)
        metadata = probe_video_metadata(target)
        thumbnail_filename = generate_video_thumbnail(target, video_id, metadata.get("durationMs"))
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO videos (
                    id, user_id, original_filename, stored_filename, content_type, file_size,
                    duration_ms, width, height, fps, metadata_json, thumbnail_filename, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    video_id,
                    user["id"],
                    original_name,
                    stored_filename,
                    file.content_type,
                    file_size,
                    metadata["durationMs"],
                    metadata["width"],
                    metadata["height"],
                    metadata["fps"],
                    json.dumps(metadata),
                    thumbnail_filename,
                    "ready_for_xr",
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return video_response(row)
    except Exception:
        if target is not None:
            target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


def resolve_export_file(path: str) -> Path:
    try:
        resolved = Path(path).resolve(strict=True)
        resolved.relative_to(EXPORTS_DIR.resolve())
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=404, detail="Export file missing")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="Export file missing")
    return resolved


@app.get("/api/videos/{video_id}/download")
def download_video(video_id: str, user: dict[str, str] = Depends(require_user)) -> FileResponse:
    with connect() as conn:
        video = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND user_id = ?",
            (video_id, user["id"]),
        ).fetchone()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    path = (VIDEOS_DIR / video["stored_filename"]).resolve()
    try:
        path.relative_to(VIDEOS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Video file missing")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Video file missing")
    return FileResponse(
        path,
        media_type=video["content_type"] or "video/mp4",
        filename=video["original_filename"],
        headers={"Cache-Control": "private, no-store"},
    )


@app.post("/api/videos/{video_id}/thumbnail")
def create_video_thumbnail(
    video_id: str,
    payload: ThumbnailRequest | None = None,
    user: dict[str, str] = Depends(require_user),
) -> dict:
    config = payload or ThumbnailRequest()
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND user_id = ?",
            (video_id, user["id"]),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Video not found")

        source_path = (VIDEOS_DIR / row["stored_filename"]).resolve()
        try:
            source_path.relative_to(VIDEOS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Video file missing")
        if not source_path.is_file():
            raise HTTPException(status_code=404, detail="Video file missing")

        thumbnail_filename = generate_360_video_thumbnail(
            source_path,
            row["id"],
            duration_ms=row["duration_ms"],
            seek_ms=config.time_ms,
            yaw=config.yaw,
            pitch=config.pitch,
            h_fov=config.h_fov,
            v_fov=config.v_fov,
            output_width=config.width,
            output_height=config.height,
        )
        if not thumbnail_filename:
            raise HTTPException(status_code=500, detail="Could not generate thumbnail")

        now = utc_now()
        conn.execute(
            "UPDATE videos SET thumbnail_filename = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (thumbnail_filename, now, video_id, user["id"]),
        )
        updated = dict(row)
        updated["thumbnail_filename"] = thumbnail_filename
        updated["updated_at"] = now
        return video_response(updated)


@app.get("/api/videos/{video_id}")
def get_video(video_id: str, user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND user_id = ?",
            (video_id, user["id"]),
        ).fetchone()
        if row is not None:
            data = dict(row)
            thumbnail_filename = ensure_video_thumbnail(conn, row)
            if thumbnail_filename:
                data["thumbnail_filename"] = thumbnail_filename
            return video_detail_response(conn, data)
    if row is None:
        raise HTTPException(status_code=404, detail="Video not found")


@app.get("/api/music-tracks")
def list_music_tracks(user: dict[str, str] = Depends(require_user)) -> dict[str, list[dict]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM music_tracks WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return {"musicTracks": [music_track_response(row) for row in rows]}


@app.post("/api/music-tracks/upload")
async def upload_music_track(
    file: UploadFile = File(...),
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int | float | None | dict]:
    music_id = new_id("music")
    original_name = Path(file.filename or "upload.bin").name
    target: Path | None = None

    try:
        suffix = validate_music_upload_metadata(original_name, file.content_type)
        stored_filename = f"{music_id}{suffix}"
        target = MUSIC_DIR / stored_filename
        file_size = copy_upload_with_limit(file, target, MAX_MUSIC_UPLOAD_BYTES)
        metadata = probe_audio_metadata(target)
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO music_tracks (
                    id, user_id, original_filename, stored_filename, content_type,
                    file_size, duration_ms, metadata_json, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    music_id,
                    user["id"],
                    original_name,
                    stored_filename,
                    file.content_type,
                    file_size,
                    metadata["durationMs"],
                    json.dumps(metadata),
                    "ready",
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM music_tracks WHERE id = ?", (music_id,)).fetchone()
        return music_track_response(row)
    except Exception:
        if target is not None:
            target.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@app.get("/api/music-tracks/{music_id}/download")
def download_music_track(music_id: str, user: dict[str, str] = Depends(require_user)) -> FileResponse:
    with connect() as conn:
        music = conn.execute(
            "SELECT * FROM music_tracks WHERE id = ? AND user_id = ?",
            (music_id, user["id"]),
        ).fetchone()
    if music is None:
        raise HTTPException(status_code=404, detail="Music track not found")
    path = (MUSIC_DIR / music["stored_filename"]).resolve()
    try:
        path.relative_to(MUSIC_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Music file missing")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Music file missing")
    return FileResponse(
        path,
        media_type=music["content_type"] or "audio/mpeg",
        filename=music["original_filename"],
        headers={"Cache-Control": "private, no-store"},
    )


@app.post("/api/cut-sessions")
def create_cut_session(config: ClipEditConfig, user: dict[str, str] = Depends(require_user)) -> dict[str, str]:
    now = utc_now()
    with connect() as conn:
        video = conn.execute(
            "SELECT id FROM videos WHERE id = ? AND user_id = ?",
            (config.video_id, user["id"]),
        ).fetchone()
        if video is None:
            raise HTTPException(status_code=404, detail="Video not found")
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
            (config.session_id, config.video_id, user["id"], "collecting", config.timeline_revision, now, now),
        )
        save_clip_config(conn, config)
    return {"sessionId": config.session_id, "videoId": config.video_id, "status": "collecting"}


@app.get("/api/cut-sessions/{session_id}")
def get_cut_session(session_id: str, user: dict[str, str] = Depends(require_user)) -> dict[str, str | int | dict | None]:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        config = conn.execute(
            "SELECT config_json FROM clip_edit_configs WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Cut session not found")
    return {
        "sessionId": row["id"],
        "videoId": row["video_id"],
        "status": row["status"],
        "timelineRevision": row["timeline_revision"],
        "config": json.loads(config["config_json"]) if config else None,
    }


@app.put("/api/cut-sessions/{session_id}/config")
def update_cut_session_config(
    session_id: str,
    config: ClipEditConfig,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int]:
    if session_id != config.session_id:
        raise HTTPException(status_code=400, detail="sessionId does not match route")
    now = utc_now()
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        conn.execute(
            """
            UPDATE cut_sessions
            SET video_id = ?, timeline_revision = ?, updated_at = ?
            WHERE id = ?
            """,
            (config.video_id, config.timeline_revision, now, session_id),
        )
        save_clip_config(conn, config)
    return {
        "sessionId": session_id,
        "videoId": config.video_id,
        "timelineRevision": config.timeline_revision,
        "status": "saved"
    }


@app.get("/api/cut-sessions/{session_id}/music")
def get_cut_session_music(session_id: str, user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        return session_music_response(get_session_music(conn, session_id))


@app.put("/api/cut-sessions/{session_id}/music")
def update_cut_session_music(
    session_id: str,
    config: SessionMusicConfig,
    user: dict[str, str] = Depends(require_user),
) -> dict:
    if config.start_ms != 0:
        raise HTTPException(status_code=400, detail="Only startMs=0 is supported for music in the first version")
    now = utc_now()
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        if config.music_id is not None:
            music = conn.execute(
                "SELECT id FROM music_tracks WHERE id = ? AND user_id = ?",
                (config.music_id, user["id"]),
            ).fetchone()
            if music is None:
                raise HTTPException(status_code=404, detail="Music track not found")
        conn.execute(
            """
            INSERT INTO session_music (session_id, music_id, enabled, start_ms, gain_db, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                music_id = excluded.music_id,
                enabled = excluded.enabled,
                start_ms = excluded.start_ms,
                gain_db = excluded.gain_db,
                updated_at = excluded.updated_at
            """,
            (
                session_id,
                config.music_id,
                int(config.enabled and config.music_id is not None),
                config.start_ms,
                config.gain_db,
                now,
                now,
            ),
        )
        return session_music_response(get_session_music(conn, session_id))


@app.post("/api/cut-sessions/{session_id}/path-patches")
def receive_path_patch(
    session_id: str,
    patch: ViewPathPatch,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int]:
    if session_id != patch.session_id:
        raise HTTPException(status_code=400, detail="sessionId does not match route")
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        save_patch(conn, session_id, patch)
    return {
        "sessionId": session_id,
        "takeId": patch.take_id,
        "pathRevision": patch.path_revision,
        "acceptedPoints": len(patch.points),
        "status": "accepted"
    }


@app.post("/api/cut-sessions/{session_id}/effect-events")
def receive_effect_events_patch(
    session_id: str,
    patch: EffectEventsPatch,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int]:
    if session_id != patch.session_id:
        raise HTTPException(status_code=400, detail="sessionId does not match route")
    if patch.replace_range.start_ms >= patch.replace_range.end_ms:
        raise HTTPException(status_code=400, detail="replaceRange must have startMs < endMs")
    for event in patch.events:
        if event.start_ms >= event.end_ms:
            raise HTTPException(status_code=400, detail="effect event must have startMs < endMs")
        if event.start_ms < patch.replace_range.start_ms or event.end_ms > patch.replace_range.end_ms:
            raise HTTPException(status_code=400, detail="effect events must be inside replaceRange")

    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        save_effect_events_patch(conn, session_id, patch)
    return {
        "sessionId": session_id,
        "effectRevision": patch.effect_revision,
        "acceptedEvents": len(patch.events),
        "status": "accepted"
    }


@app.post("/api/cut-sessions/{session_id}/playback-state")
def receive_playback_state(
    session_id: str,
    state: PlaybackClientState,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | int]:
    if session_id != state.session_id:
        raise HTTPException(status_code=400, detail="sessionId does not match route")
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
    if session is None:
        raise HTTPException(status_code=404, detail="Cut session not found")
    return {
        "sessionId": session_id,
        "videoId": state.video_id,
        "videoTimeMs": state.video_time_ms,
        "status": "accepted"
    }


@app.post("/api/cut-sessions/{session_id}/abandon")
def abandon_cut_session(session_id: str, user: dict[str, str] = Depends(require_user)) -> dict[str, str]:
    now = utc_now()
    with connect() as conn:
        result = conn.execute(
            "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            ("abandoned", now, session_id, user["id"]),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Cut session not found")
    return {"sessionId": session_id, "status": "abandoned"}


@app.get("/api/cut-sessions/{session_id}/status")
def get_cut_session_status(session_id: str, user: dict[str, str] = Depends(require_user)) -> SessionStatus:
    with connect() as conn:
        session = conn.execute(
            "SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        minute_rows = conn.execute(
            """
            SELECT minute_index, start_ms, end_ms, status, updated_at
            FROM minute_segments
            WHERE session_id = ?
            ORDER BY minute_index
            """,
            (session_id,),
        ).fetchall()
        export = conn.execute(
            "SELECT id, status FROM exports WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
            (session_id, user["id"]),
        ).fetchone()

    minute_statuses = [
        {
            "minuteIndex": row["minute_index"],
            "startMs": row["start_ms"],
            "endMs": row["end_ms"],
            "status": row["status"],
            "updatedAt": row["updated_at"],
        }
        for row in minute_rows
    ]
    counts = {status: 0 for status in ("ready", "rendering", "done", "dirty", "discarded", "failed")}
    for row in minute_rows:
        if row["status"] in counts:
            counts[row["status"]] += 1
    return SessionStatus(
        sessionStatus=session["status"],
        videoId=session["video_id"],
        exportId=export["id"] if export else None,
        minuteStatuses=minute_statuses,
        completedCount=counts["done"],
        dirtyCount=counts["dirty"],
        discardedCount=counts["discarded"],
        failedCount=counts["failed"],
        downloadReady=bool(export and export["status"] == "ready"),
    )


@app.post("/api/cut-sessions/{session_id}/render-test")
def render_test(session_id: str, user: dict[str, str] = Depends(require_user)) -> dict[str, str | bool | int | None]:
    export_id = new_id("export")
    now = utc_now()
    with connect() as conn:
        session = conn.execute(
            """
            SELECT cut_sessions.*, videos.stored_filename, videos.duration_ms
            FROM cut_sessions
            JOIN videos ON videos.id = cut_sessions.video_id
            WHERE cut_sessions.id = ? AND cut_sessions.user_id = ?
            """,
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        points = conn.execute(
            """
            SELECT t_ms, yaw, pitch, fov_h, fov_v, enabled, cut
            , interpolation, transition_ms
            FROM view_path_points
            WHERE session_id = ?
            ORDER BY t_ms
            """,
            (session_id,),
        ).fetchall()
        if len(points) < 2:
            raise HTTPException(status_code=400, detail="Need at least two path points before rendering")
        effects = list_effect_events(conn, session_id, 0, RENDER_TEST_MAX_DURATION_MS)
        music_config = get_session_music(conn, session_id)
        conn.execute(
            """
            INSERT INTO exports (id, session_id, user_id, status, file_path, error_message, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (export_id, session_id, user["id"], "rendering", None, None, now, now),
        )
        conn.execute(
            "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ?",
            ("rendering", now, session_id),
        )

    source_path = VIDEOS_DIR / session["stored_filename"]
    output_path = EXPORTS_DIR / f"{export_id}.mp4"
    work_dir = TMP_DIR / export_id
    work_dir.mkdir(parents=True, exist_ok=True)
    error_message: str | None = None
    all_points = [render_point_from_row(point) for point in points]
    max_path_ms = int(all_points[-1]["t_ms"])
    video_duration_ms = int(session["duration_ms"] or 0)
    smoke_duration_ms = min(max_path_ms, video_duration_ms or max_path_ms, RENDER_TEST_MAX_DURATION_MS)

    try:
        if smoke_duration_ms <= 0:
            raise RuntimeError("Invalid smoke render duration")
        selected = [point for point in all_points if float(point["t_ms"]) <= smoke_duration_ms]
        if not selected:
            raise RuntimeError("No renderable path points in smoke duration")
        if float(selected[-1]["t_ms"]) < smoke_duration_ms:
            selected.append({**selected[-1], "t_ms": float(smoke_duration_ms)})

        render_segments = build_enabled_render_segments(selected)
        if not render_segments:
            raise RuntimeError("No enabled path ranges to render")

        segment_paths: list[Path] = []
        for index, segment in enumerate(render_segments):
            segment = prepare_render_segment(
                segment,
                fps=RENDER_TEST_FPS,
                max_yaw_rate=RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND,
                max_pitch_rate=RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND,
                max_fov_rate=RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND,
            )
            segment_duration_ms = int(segment[-1]["t_ms"] - segment[0]["t_ms"])
            if segment_duration_ms <= 0:
                continue
            segment_path = output_path if len(render_segments) == 1 else work_dir / f"segment-{index:03d}.mp4"
            run_frame_remap_equirect(
                source_path,
                segment_path,
                work_dir / f"segment-{index:03d}",
                relative_segment_points(segment),
                segment_duration_ms,
                source_start_ms=int(segment[0]["t_ms"]),
                fps=RENDER_TEST_FPS,
                effect_events=events_for_segment(
                    effects,
                    int(segment[0]["t_ms"]),
                    int(segment[-1]["t_ms"]),
                ),
            )
            segment_paths.append(segment_path)

        if not segment_paths:
            raise RuntimeError("No non-empty enabled path ranges to render")
        if len(segment_paths) > 1:
            concat_segments_reencode(segment_paths, work_dir / "segments.txt", output_path, fps=RENDER_TEST_FPS)

        rendered_duration_ms = sum(
            int(segment[-1]["t_ms"] - segment[0]["t_ms"]) for segment in render_segments
        )
        if (
            music_config is not None
            and bool(music_config["enabled"])
            and music_config["stored_filename"]
            and rendered_duration_ms > 0
        ):
            music_path = MUSIC_DIR / music_config["stored_filename"]
            if music_path.is_file():
                silent_video_path = work_dir / "video-without-music.mp4"
                shutil.move(output_path, silent_video_path)
                mux_music_to_video(
                    silent_video_path,
                    music_path,
                    output_path,
                    rendered_duration_ms,
                    gain_db=float(music_config["gain_db"]),
                )
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                UPDATE exports
                SET status = ?, file_path = ?, error_message = NULL, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                ("ready", str(output_path), now, export_id, user["id"]),
            )
            conn.execute(
                "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                ("export_ready", now, session_id, user["id"]),
            )
            mark_minutes(conn, session_id, 0, smoke_duration_ms, "done", now)
    except Exception as exc:
        error_message = str(exc)
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                UPDATE exports
                SET status = ?, error_message = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                ("failed", error_message[:1000], now, export_id, user["id"]),
            )
            conn.execute(
                "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                ("failed", now, session_id, user["id"]),
            )
            mark_minutes(conn, session_id, 0, max(smoke_duration_ms, 1000), "failed", now)
        raise HTTPException(status_code=500, detail=f"FFmpeg render failed: {error_message}") from exc
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return {
        "exportId": export_id,
        "sessionId": session_id,
        "status": "ready",
        "downloadReady": True,
        "durationMs": rendered_duration_ms,
    }


@app.get("/api/exports")
def list_exports(user: dict[str, str] = Depends(require_user)) -> dict[str, list[dict]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                exports.*,
                cut_sessions.video_id,
                videos.original_filename,
                videos.duration_ms,
                videos.width,
                videos.height
            FROM exports
            JOIN cut_sessions ON cut_sessions.id = exports.session_id
            JOIN videos ON videos.id = cut_sessions.video_id
            WHERE exports.user_id = ?
            ORDER BY exports.updated_at DESC
            """,
            (user["id"],),
        ).fetchall()

    exports = []
    for row in rows:
        payload = export_response(row)
        payload.update(
            {
                "videoId": row["video_id"],
                "filename": row["original_filename"],
                "durationMs": row["duration_ms"],
                "width": row["width"],
                "height": row["height"],
            }
        )
        exports.append(payload)
    return {"exports": exports}


@app.get("/api/exports/{export_id}/download")
def download_export(export_id: str, user: dict[str, str] = Depends(require_user)) -> FileResponse:
    with connect() as conn:
        export = conn.execute(
            "SELECT * FROM exports WHERE id = ? AND user_id = ?",
            (export_id, user["id"]),
        ).fetchone()
    if export is None:
        raise HTTPException(status_code=404, detail="Export not found")
    if export["status"] != "ready" or not export["file_path"]:
        raise HTTPException(status_code=409, detail="Export is not ready")
    path = resolve_export_file(export["file_path"])
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"invisible-director-{export_id}.mp4",
        headers={"Cache-Control": "private, no-store"},
    )


@app.get("/api/exports/{export_id}")
def get_export(export_id: str, user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        export = conn.execute(
            "SELECT * FROM exports WHERE id = ? AND user_id = ?",
            (export_id, user["id"]),
        ).fetchone()
    if export is None:
        raise HTTPException(status_code=404, detail="Export not found")
    return export_response(export)
