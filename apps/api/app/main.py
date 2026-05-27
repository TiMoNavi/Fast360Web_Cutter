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
    FinalizeRecordingRequest,
    PlaybackClientState,
    RenderTestRequest,
    SessionMusicConfig,
    SessionStatus,
    ThumbnailRequest,
    ViewPathPatch,
    WebXrPlayerSessionSwitch,
)
from .incremental_render import (
    SEGMENT_DURATION_MS,
    cancel_scheduled_segment_rerender,
    cancel_segment_render,
    schedule_segment_rerender,
    trigger_segment_render,
)
from .rendering import run_frame_remap_equirect
from .rendering.effects import events_for_segment
from .rendering.path_pipeline import (
    build_enabled_render_segments,
    clip_timeline_points,
    prepare_render_segment,
    relative_segment_points,
    render_point_from_row,
)
from .storage import (
    EXPORTS_DIR,
    MUSIC_DIR,
    ORIGINAL_VIDEOS_DIR,
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
from .video_ingest import (
    REJECTED_CAMERA_RAW_SUFFIXES,
    SUPPORTED_VIDEO_SUFFIXES,
    ingest_uploaded_video,
    video_ingest_rule_for_suffix,
)
from .effects import effect_catalog_payload


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
ALLOWED_VIDEO_SUFFIXES = SUPPORTED_VIDEO_SUFFIXES
ALLOWED_VIDEO_CONTENT_TYPES = {"application/octet-stream"}
ALLOWED_MUSIC_SUFFIXES = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
ALLOWED_MUSIC_CONTENT_TYPES = {"application/octet-stream"}
RENDER_TEST_MAX_DURATION_MS = 60_000
RENDER_TEST_FPS = 30
RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND = 360
RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND = 360
RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND = 360
RECORDING_MIN_DURATION_MS = read_int_env("RECORDING_MIN_DURATION_MS", 1000)
RECORDING_MAX_DURATION_MS = read_int_env("RECORDING_MAX_DURATION_MS", 10 * 60_000)
DEMO_VIDEO_DIR = SAMPLE_VIDEOS_DIR / "public-360"
DEMO_VIDEO_CATALOG = [
    {
        "id": "norah-head-walk",
        "title": "Norah Head Rock Walk",
        "subtitle": "4K outdoor coastal 360 experience.",
        "description": "High-quality 4K 360 video of a scenic coastal walk, perfect for testing the full editing workflow.",
        "tags": ["outdoor", "4k", "60s"],
        "difficulty": "beginner",
        "sourceFilename": "norah-head-rock-walk-4k.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 60000,
        "resolutionLabel": "4096 x 2048",
        "attribution": "Insta360 sample footage.",
        "tutorialSteps": [
            {"title": "Preview in 4K", "body": "Experience high-resolution 360 video playback."},
            {"title": "Frame your shot", "body": "Use WebXR to create smooth camera paths through the scene."},
            {"title": "Export in quality", "body": "Render and download your edited 4K clip."},
        ],
    },
    {
        "id": "ghost-road-bike",
        "title": "Old Ghost Road Mountain Bike",
        "subtitle": "4K action-packed mountain biking adventure.",
        "description": "Immersive 4K 360 mountain biking footage with dynamic motion and scenic views.",
        "tags": ["action", "4k", "60s"],
        "difficulty": "practice",
        "sourceFilename": "ghost-road-bike-4k.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 60000,
        "resolutionLabel": "4096 x 2048",
        "attribution": "Training sample footage.",
        "tutorialSteps": [
            {"title": "Track the action", "body": "Follow the fast-paced movement with your camera path."},
            {"title": "Create dynamic cuts", "body": "Use WebXR to capture the most exciting moments."},
            {"title": "Polish your edit", "body": "Export a professional-quality action sequence."},
        ],
    },
    {
        "id": "default-sample-1",
        "title": "4K Sample Experience",
        "subtitle": "High-quality 360 video for testing.",
        "description": "A 4K 360 video sample perfect for exploring the full capabilities of the editor.",
        "tags": ["4k", "60s", "sample"],
        "difficulty": "beginner",
        "sourceFilename": "default-4k-sample-1.mp4",
        "projection": "equirectangular",
        "layout": "mono-2:1",
        "durationHintMs": 60000,
        "resolutionLabel": "4096 x 2048",
        "attribution": "Sample footage.",
        "tutorialSteps": [
            {"title": "Load 4K content", "body": "Start with high-resolution 360 video."},
            {"title": "Edit with precision", "body": "Create your camera path in WebXR."},
            {"title": "Export your work", "body": "Download the final rendered video."},
        ],
    },
]


@app.on_event("startup")
def startup() -> None:
    init_storage()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/network-info")
def network_info() -> dict[str, str]:
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "127.0.0.1"
    return {"localIp": local_ip, "hostname": hostname}


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


def seed_default_videos_for_user(conn: sqlite3.Connection, user_id: str) -> None:
    now = utc_now()
    for item in DEMO_VIDEO_CATALOG:
        source_path = DEMO_VIDEO_DIR / item["sourceFilename"]
        if not source_path.is_file():
            continue
        video_id = new_id("video")
        stored_filename = f"{video_id}{source_path.suffix}"
        target_path = VIDEOS_DIR / stored_filename
        shutil.copy2(source_path, target_path)
        metadata = probe_video_metadata(target_path)
        conn.execute(
            """
            INSERT INTO videos (
                id, user_id, original_filename, stored_filename, content_type,
                file_size, duration_ms, width, height, fps, metadata_json, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                video_id,
                user_id,
                item["sourceFilename"],
                stored_filename,
                "video/mp4",
                target_path.stat().st_size,
                metadata["durationMs"],
                metadata["width"],
                metadata["height"],
                metadata["fps"],
                json.dumps(metadata),
                "ready",
                now,
                now,
            ),
        )


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
            seed_default_videos_for_user(conn, user_id)
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


@app.get("/api/effects/catalog")
def effects_catalog(user: dict[str, str] = Depends(require_user)) -> dict:
    return effect_catalog_payload()


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


def is_likely_webxr_video(row: sqlite3.Row | dict) -> bool:
    data = dict(row)
    try:
        metadata = json.loads(data.get("metadata_json") or "{}")
    except json.JSONDecodeError:
        metadata = {}

    projection = str(metadata.get("projection") or "").lower()
    layout = str(metadata.get("layout") or "").lower()

    if projection and projection != "equirectangular":
        return False
    if layout and layout != "mono-2:1":
        return False
    if projection == "equirectangular" or layout == "mono-2:1":
        return True

    width = data.get("width")
    height = data.get("height")
    if width and height:
        aspect = float(width) / float(height)
        return 1.92 < aspect < 2.08

    return True


def list_webxr_video_rows(conn: sqlite3.Connection, user_id: str) -> list[sqlite3.Row]:
    rows = conn.execute(
        """
        SELECT *
        FROM videos
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC
        """,
        (user_id,),
    ).fetchall()
    return [row for row in rows if is_likely_webxr_video(row)]


def activate_webxr_player_session(
    conn: sqlite3.Connection,
    user_id: str,
    video_id: str,
    session_id: str,
    now: str | None = None,
) -> None:
    timestamp = now or utc_now()
    conn.execute(
        "UPDATE cut_sessions SET updated_at = ? WHERE id = ? AND user_id = ?",
        (timestamp, session_id, user_id),
    )
    conn.execute(
        """
        INSERT INTO webxr_player_state (user_id, active_video_id, active_session_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            active_video_id = excluded.active_video_id,
            active_session_id = excluded.active_session_id,
            updated_at = excluded.updated_at
        """,
        (user_id, video_id, session_id, timestamp, timestamp),
    )


def create_session_for_video(
    conn: sqlite3.Connection,
    user_id: str,
    video_id: str,
    now: str | None = None,
) -> sqlite3.Row:
    timestamp = now or utc_now()
    session_id = new_id("session")
    conn.execute(
        """
        INSERT INTO cut_sessions (id, video_id, user_id, status, timeline_revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_id, video_id, user_id, "collecting", 1, timestamp, timestamp),
    )
    save_clip_config(conn, ClipEditConfig(videoId=video_id, sessionId=session_id))
    return conn.execute("SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?", (session_id, user_id)).fetchone()


def ensure_webxr_session_for_video(
    conn: sqlite3.Connection,
    user_id: str,
    video_id: str,
    now: str | None = None,
) -> sqlite3.Row:
    video = conn.execute(
        "SELECT * FROM videos WHERE id = ? AND user_id = ?",
        (video_id, user_id),
    ).fetchone()
    if video is None:
        raise HTTPException(status_code=404, detail="Video not found")
    if not is_likely_webxr_video(video):
        raise HTTPException(status_code=400, detail="Video is not a WebXR 360 source")

    session = conn.execute(
        """
        SELECT *
        FROM cut_sessions
        WHERE video_id = ? AND user_id = ? AND status != ?
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
        """,
        (video_id, user_id, "abandoned"),
    ).fetchone()
    if session is None:
        session = create_session_for_video(conn, user_id, video_id, now)

    activate_webxr_player_session(conn, user_id, session["video_id"], session["id"], now)
    return conn.execute("SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?", (session["id"], user_id)).fetchone()


def webxr_player_session_payload(conn: sqlite3.Connection, session: sqlite3.Row, source: str) -> dict:
    latest_export = conn.execute(
        """
        SELECT id, session_id, status, file_path, error_message, created_at, updated_at
        FROM exports
        WHERE session_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (session["id"], session["user_id"]),
    ).fetchone()
    return {
        "sessionId": session["id"],
        "videoId": session["video_id"],
        "status": session["status"],
        "timelineRevision": session["timeline_revision"],
        "source": source,
        "xrPath": "/xr/player",
        "latestExport": export_response(latest_export) if latest_export else None,
        "music": session_music_response(get_session_music(conn, session["id"])),
    }


def resolve_active_webxr_player_session(conn: sqlite3.Connection, user_id: str) -> tuple[sqlite3.Row, str]:
    state = conn.execute(
        """
        SELECT active_session_id
        FROM webxr_player_state
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()

    if state and state["active_session_id"]:
        session = conn.execute(
            """
            SELECT *
            FROM cut_sessions
            WHERE id = ? AND user_id = ? AND status != ?
            """,
            (state["active_session_id"], user_id, "abandoned"),
        ).fetchone()
        if session is not None:
            video = conn.execute("SELECT * FROM videos WHERE id = ? AND user_id = ?", (session["video_id"], user_id)).fetchone()
            if video is not None and is_likely_webxr_video(video):
                return session, "active"

    sessions = conn.execute(
        """
        SELECT *
        FROM cut_sessions
        WHERE user_id = ? AND status != ?
        ORDER BY updated_at DESC, created_at DESC
        """,
        (user_id, "abandoned"),
    ).fetchall()
    for session in sessions:
        video = conn.execute("SELECT * FROM videos WHERE id = ? AND user_id = ?", (session["video_id"], user_id)).fetchone()
        if video is not None and is_likely_webxr_video(video):
            activate_webxr_player_session(conn, user_id, session["video_id"], session["id"])
            return conn.execute("SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?", (session["id"], user_id)).fetchone(), "latest-session"

    videos = list_webxr_video_rows(conn, user_id)
    if not videos:
        raise HTTPException(status_code=404, detail="No WebXR video sources available")

    session = create_session_for_video(conn, user_id, videos[0]["id"])
    activate_webxr_player_session(conn, user_id, session["video_id"], session["id"])
    return conn.execute("SELECT * FROM cut_sessions WHERE id = ? AND user_id = ?", (session["id"], user_id)).fetchone(), "created"


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

        activate_webxr_player_session(conn, user["id"], video_id, session_id, now)

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


@app.get("/api/xr/player-session")
def get_webxr_player_session(user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        session, source = resolve_active_webxr_player_session(conn, user["id"])
        return webxr_player_session_payload(conn, session, source)


@app.put("/api/xr/player-session")
def switch_webxr_player_session(
    payload: WebXrPlayerSessionSwitch,
    user: dict[str, str] = Depends(require_user),
) -> dict:
    with connect() as conn:
        session = ensure_webxr_session_for_video(conn, user["id"], payload.video_id)
        return webxr_player_session_payload(conn, session, "switched")


def validate_upload_metadata(original_name: str, content_type: str | None) -> str:
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_VIDEO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported video file extension")
    if suffix in REJECTED_CAMERA_RAW_SUFFIXES:
        rule = video_ingest_rule_for_suffix(suffix)
        raise HTTPException(
            status_code=400,
            detail=rule.note if rule else "Camera raw format is not supported yet",
        )

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
    upload_path: Path | None = None
    stored_path: Path | None = None
    original_path: Path | None = None

    try:
        suffix = validate_upload_metadata(original_name, file.content_type)
        upload_path = VIDEOS_DIR / f"{video_id}.upload{suffix}"
        copy_upload_with_limit(file, upload_path)
        ingest = ingest_uploaded_video(
            video_id=video_id,
            upload_path=upload_path,
            original_name=original_name,
            content_type=file.content_type,
            videos_dir=VIDEOS_DIR,
            originals_dir=ORIGINAL_VIDEOS_DIR,
        )
        stored_path = VIDEOS_DIR / ingest.stored_filename
        if ingest.original_stored_filename:
            original_path = VIDEOS_DIR / ingest.original_stored_filename
        metadata = ingest.metadata
        thumbnail_filename = generate_video_thumbnail(stored_path, video_id, metadata.get("durationMs"))
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
                    ingest.stored_filename,
                    ingest.content_type,
                    ingest.file_size,
                    metadata["durationMs"],
                    metadata["width"],
                    metadata["height"],
                    metadata["fps"],
                    json.dumps(metadata),
                    thumbnail_filename,
                    ingest.status,
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return video_response(row)
    except Exception as exc:
        if upload_path is not None:
            upload_path.unlink(missing_ok=True)
        if stored_path is not None:
            stored_path.unlink(missing_ok=True)
        if original_path is not None:
            original_path.unlink(missing_ok=True)
        if isinstance(exc, RuntimeError):
            raise HTTPException(status_code=400, detail=str(exc)) from exc
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
        activate_webxr_player_session(conn, user["id"], config.video_id, config.session_id, now)
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
        activate_webxr_player_session(conn, user["id"], config.video_id, session_id, now)
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
    segment_renders_to_start: list[tuple[int, int, int, int]] = []
    segment_rerenders_to_schedule: list[tuple[int, int, int, int, float]] = []
    with connect() as conn:
        session = conn.execute(
            "SELECT id, timeline_revision FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")
        save_patch(conn, session_id, patch)

        timeline_revision = max(int(session["timeline_revision"] or 0), int(patch.path_revision))
        patch_start_ms = int(patch.replace_range.start_ms)
        patch_end_ms = int(patch.replace_range.end_ms)
        path_bounds = conn.execute(
            "SELECT MIN(t_ms) AS start_ms, MAX(t_ms) AS end_ms FROM view_path_points WHERE session_id = ?",
            (session_id,),
        ).fetchone()

        if not path_bounds or path_bounds["start_ms"] is None or path_bounds["end_ms"] is None:
            now = utc_now()
            stale_segments = conn.execute(
                """
                SELECT id, segment_index, status
                FROM segment_renders
                WHERE session_id = ? AND status IN ('rendering', 'completed', 'dirty')
                """,
                (session_id,),
            ).fetchall()
            for seg in stale_segments:
                cancel_segment_render(session_id, int(seg["segment_index"]))
                cancel_scheduled_segment_rerender(session_id, int(seg["segment_index"]))
                conn.execute(
                    "UPDATE segment_renders SET status = ?, updated_at = ? WHERE id = ?",
                    ("cancelled", now, seg["id"]),
                )
        else:
            recording_start_ms = int(path_bounds["start_ms"])
            recording_end_ms = int(path_bounds["end_ms"])
            capped_recording_end_ms = min(recording_end_ms, recording_start_ms + RECORDING_MAX_DURATION_MS)
            completed_segment_count = max(0, (capped_recording_end_ms - recording_start_ms) // SEGMENT_DURATION_MS)

            def segment_range(segment_index: int) -> tuple[int, int]:
                start_ms = recording_start_ms + segment_index * SEGMENT_DURATION_MS
                return start_ms, start_ms + SEGMENT_DURATION_MS

            existing_segment_rows = conn.execute(
                """
                SELECT id, segment_index, start_ms, end_ms, status
                FROM segment_renders
                WHERE session_id = ? AND status IN ('rendering', 'completed', 'dirty')
                ORDER BY updated_at DESC
                """,
                (session_id,),
            ).fetchall()
            latest_segments: dict[int, sqlite3.Row] = {}
            for seg in existing_segment_rows:
                segment_index = int(seg["segment_index"])
                if segment_index not in latest_segments:
                    latest_segments[segment_index] = seg

            deferred_segments: set[int] = set()
            now = utc_now()
            for segment_index, seg in latest_segments.items():
                if segment_index >= completed_segment_count:
                    if seg["status"] == "rendering":
                        cancel_segment_render(session_id, segment_index)
                    cancel_scheduled_segment_rerender(session_id, segment_index)
                    conn.execute(
                        "UPDATE segment_renders SET status = ?, updated_at = ? WHERE id = ?",
                        ("cancelled", now, seg["id"]),
                    )
                    continue

                segment_overlaps_patch = int(seg["start_ms"]) < patch_end_ms and int(seg["end_ms"]) > patch_start_ms
                if not segment_overlaps_patch:
                    continue

                start_ms, end_ms = segment_range(segment_index)
                status = str(seg["status"])
                if status == "rendering":
                    cancel_segment_render(session_id, segment_index)
                    conn.execute(
                        "UPDATE segment_renders SET status = ?, updated_at = ? WHERE id = ?",
                        ("cancelled", now, seg["id"]),
                    )
                    segment_rerenders_to_schedule.append((
                        segment_index,
                        start_ms,
                        end_ms,
                        timeline_revision,
                        1,
                    ))
                    deferred_segments.add(segment_index)
                elif status in ("completed", "dirty"):
                    conn.execute(
                        """
                        UPDATE segment_renders
                        SET status = ?, error_message = NULL, updated_at = ?
                        WHERE id = ?
                        """,
                        ("dirty", now, seg["id"]),
                    )
                    segment_rerenders_to_schedule.append((
                        segment_index,
                        start_ms,
                        end_ms,
                        timeline_revision,
                        30,
                    ))
                    deferred_segments.add(segment_index)

            for seg_idx in range(completed_segment_count):
                if seg_idx in deferred_segments:
                    continue
                existing = conn.execute(
                    """
                    SELECT id, status
                    FROM segment_renders
                    WHERE session_id = ? AND segment_index = ?
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    (session_id, seg_idx),
                ).fetchone()

                if existing is None or existing["status"] in ("cancelled", "failed"):
                    start_ms, end_ms = segment_range(seg_idx)
                    segment_renders_to_start.append((seg_idx, start_ms, end_ms, timeline_revision))

    for segment_index, start_ms, end_ms, timeline_revision, delay_seconds in segment_rerenders_to_schedule:
        schedule_segment_rerender(
            session_id,
            segment_index,
            start_ms,
            end_ms,
            timeline_revision,
            delay_seconds=delay_seconds,
        )

    for segment_index, start_ms, end_ms, timeline_revision in segment_renders_to_start:
        trigger_segment_render(session_id, segment_index, start_ms, end_ms, timeline_revision)

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
        conn.execute(
            "DELETE FROM webxr_player_state WHERE user_id = ? AND active_session_id = ?",
            (user["id"], session_id),
        )
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


@app.get("/api/cut-sessions/{session_id}/segment-renders")
def get_segment_renders(session_id: str, user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        session = conn.execute(
            "SELECT id FROM cut_sessions WHERE id = ? AND user_id = ?",
            (session_id, user["id"]),
        ).fetchone()
        if session is None:
            raise HTTPException(status_code=404, detail="Cut session not found")

        segment_rows = conn.execute(
            """
            SELECT segment_index, start_ms, end_ms, status, file_path, error_message, updated_at
            FROM segment_renders
            WHERE session_id = ?
            ORDER BY segment_index, updated_at DESC
            """,
            (session_id,)
        ).fetchall()
        latest_segments: dict[int, sqlite3.Row] = {}
        for segment in segment_rows:
            segment_index = int(segment["segment_index"])
            if segment_index not in latest_segments:
                latest_segments[segment_index] = segment
        segments = [latest_segments[index] for index in sorted(latest_segments)]

    return {
        "segments": [
            {
                "segmentIndex": s["segment_index"],
                "startMs": s["start_ms"],
                "endMs": s["end_ms"],
                "status": s["status"],
                "filePath": s["file_path"],
                "errorMessage": s["error_message"],
                "updatedAt": s["updated_at"],
            }
            for s in segments
        ]
    }


def latest_completed_segment_path(
    session_id: str,
    segment_index: int,
    start_ms: int,
    end_ms: int,
    timeline_revision: int,
) -> Path | None:
    with connect() as conn:
        segment = conn.execute(
            """
            SELECT status, file_path, timeline_revision
            FROM segment_renders
            WHERE session_id = ?
                AND segment_index = ?
                AND start_ms = ?
                AND end_ms = ?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (session_id, segment_index, start_ms, end_ms),
        ).fetchone()
    if segment is None or segment["status"] != "completed":
        return None
    if int(segment["timeline_revision"] or 0) < timeline_revision:
        return None
    if not segment["file_path"]:
        return None

    path = Path(str(segment["file_path"]))
    return path if path.is_file() else None


@app.post("/api/cut-sessions/{session_id}/finalize-recording")
def finalize_recording(
    session_id: str,
    payload: FinalizeRecordingRequest | None = None,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | bool | int | None]:
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
        rows = conn.execute(
            """
            SELECT t_ms, yaw, pitch, fov_h, fov_v, enabled, cut,
                interpolation, transition_ms
            FROM view_path_points
            WHERE session_id = ?
            ORDER BY t_ms
            """,
            (session_id,),
        ).fetchall()
        if len(rows) < 2:
            raise HTTPException(status_code=400, detail="Need at least two path points before finalizing")

        first_point_ms = int(rows[0]["t_ms"])
        last_point_ms = int(rows[-1]["t_ms"])
        requested_start_ms = payload.start_ms if payload and payload.start_ms is not None else first_point_ms
        requested_end_ms = payload.end_ms if payload and payload.end_ms is not None else last_point_ms
        raw_start_ms = max(first_point_ms, int(requested_start_ms))
        raw_end_ms = min(last_point_ms, int(requested_end_ms))
        video_duration_ms = int(session["duration_ms"] or 0)
        validated_end_ms = min(raw_end_ms, video_duration_ms) if video_duration_ms > 0 else raw_end_ms
        validated_end_ms = min(validated_end_ms, raw_start_ms + RECORDING_MAX_DURATION_MS)
        if validated_end_ms - raw_start_ms < RECORDING_MIN_DURATION_MS:
            raise HTTPException(status_code=400, detail="Recording duration is too short")

        effects = list_effect_events(conn, session_id, raw_start_ms, validated_end_ms)
        music_config = get_session_music(conn, session_id)
        conn.execute(
            """
            INSERT INTO exports (id, session_id, user_id, status, file_path, error_message, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (export_id, session_id, user["id"], "rendering", None, None, now, now),
        )
        conn.execute(
            "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            ("rendering", now, session_id, user["id"]),
        )

    all_points = [render_point_from_row(point) for point in rows]
    first_point_ms = int(float(all_points[0]["t_ms"]))
    last_point_ms = int(float(all_points[-1]["t_ms"]))
    requested_start_ms = payload.start_ms if payload and payload.start_ms is not None else first_point_ms
    requested_end_ms = payload.end_ms if payload and payload.end_ms is not None else last_point_ms
    record_start_ms = max(first_point_ms, int(requested_start_ms))
    recorded_end_ms = min(last_point_ms, int(requested_end_ms))
    video_duration_ms = int(session["duration_ms"] or 0)
    capped = False
    record_end_ms = recorded_end_ms
    if video_duration_ms > 0:
        record_end_ms = min(record_end_ms, video_duration_ms)
    if record_end_ms - record_start_ms > RECORDING_MAX_DURATION_MS:
        record_end_ms = record_start_ms + RECORDING_MAX_DURATION_MS
        capped = True

    recording_duration_ms = record_end_ms - record_start_ms
    if recording_duration_ms < RECORDING_MIN_DURATION_MS:
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                UPDATE exports
                SET status = ?, error_message = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                ("failed", "Recording duration is too short.", now, export_id, user["id"]),
            )
            conn.execute(
                "UPDATE cut_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
                ("collecting", now, session_id, user["id"]),
            )
        raise HTTPException(status_code=400, detail="Recording duration is too short")

    source_path = VIDEOS_DIR / session["stored_filename"]
    output_path = EXPORTS_DIR / f"{export_id}.mp4"
    work_dir = TMP_DIR / export_id
    work_dir.mkdir(parents=True, exist_ok=True)
    segment_paths: list[Path] = []
    rendered_duration_ms = 0
    loop_source = bool(payload.loop_source) if payload is not None else False
    timeline_revision = int(session["timeline_revision"] or 0)
    timeline_base_start_ms = first_point_ms

    try:
        chunk_start_ms = record_start_ms
        while chunk_start_ms < record_end_ms:
            chunk_end_ms = min(record_end_ms, chunk_start_ms + SEGMENT_DURATION_MS)
            cached_segment_path: Path | None = None
            chunk_duration_ms = chunk_end_ms - chunk_start_ms
            segment_offset_ms = chunk_start_ms - timeline_base_start_ms
            if (
                not loop_source
                and chunk_duration_ms == SEGMENT_DURATION_MS
                and segment_offset_ms >= 0
                and segment_offset_ms % SEGMENT_DURATION_MS == 0
            ):
                cached_segment_path = latest_completed_segment_path(
                    session_id,
                    segment_offset_ms // SEGMENT_DURATION_MS,
                    chunk_start_ms,
                    chunk_end_ms,
                    timeline_revision,
                )

            if cached_segment_path is not None:
                segment_paths.append(cached_segment_path)
                metadata = probe_video_metadata(cached_segment_path)
                cached_duration_ms = int(metadata.get("durationMs") or 0)
                rendered_duration_ms += cached_duration_ms if cached_duration_ms > 0 else chunk_duration_ms
                chunk_start_ms = chunk_end_ms
                continue

            chunk_points = clip_timeline_points(all_points, chunk_start_ms, chunk_end_ms)
            render_segments = build_enabled_render_segments(chunk_points)

            for render_segment in render_segments:
                segment_start_ms = int(float(render_segment[0]["t_ms"]))
                segment_end_ms = int(float(render_segment[-1]["t_ms"]))
                duration_ms = segment_end_ms - segment_start_ms
                if duration_ms <= 0:
                    continue

                prepared_segment = prepare_render_segment(
                    render_segment,
                    fps=RENDER_TEST_FPS,
                    max_yaw_rate=RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND,
                    max_pitch_rate=RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND,
                    max_fov_rate=RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND,
                )
                segment_path = work_dir / f"segment-{len(segment_paths):03d}.mp4"
                run_frame_remap_equirect(
                    source_path,
                    segment_path,
                    work_dir / f"segment-{len(segment_paths):03d}",
                    relative_segment_points(prepared_segment),
                    duration_ms,
                    source_start_ms=segment_start_ms % video_duration_ms if loop_source and video_duration_ms > 0 else segment_start_ms,
                    fps=RENDER_TEST_FPS,
                    effect_events=events_for_segment(effects, segment_start_ms, segment_end_ms),
                    loop_source=loop_source and video_duration_ms > 0,
                )
                segment_paths.append(segment_path)
                rendered_duration_ms += duration_ms

            chunk_start_ms = chunk_end_ms

        if not segment_paths:
            raise RuntimeError("No valid recording segments to export")
        if len(segment_paths) == 1:
            shutil.copy(segment_paths[0], output_path)
        else:
            concat_segments_reencode(segment_paths, work_dir / "segments.txt", output_path, fps=RENDER_TEST_FPS)

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
            mark_minutes(conn, session_id, record_start_ms, record_end_ms, "done", now)
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
            mark_minutes(conn, session_id, record_start_ms, max(record_end_ms, record_start_ms + 1000), "failed", now)
        raise HTTPException(status_code=500, detail=f"Recording finalize failed: {error_message}") from exc
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    return {
        "capped": capped,
        "downloadReady": True,
        "durationMs": rendered_duration_ms,
        "exportId": export_id,
        "loopSource": loop_source,
        "maxDurationMs": RECORDING_MAX_DURATION_MS,
        "sessionId": session_id,
        "status": "ready",
    }


@app.post("/api/cut-sessions/{session_id}/render-test")
def render_test(
    session_id: str,
    payload: RenderTestRequest | None = None,
    user: dict[str, str] = Depends(require_user),
) -> dict[str, str | bool | int | None]:
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
    loop_source = bool(payload.loop_source) if payload is not None else False
    if loop_source:
        smoke_duration_ms = min(max_path_ms, RENDER_TEST_MAX_DURATION_MS)
    else:
        smoke_duration_ms = min(max_path_ms, video_duration_ms or max_path_ms, RENDER_TEST_MAX_DURATION_MS)
    rendered_duration_ms = 0

    try:
        if smoke_duration_ms <= 0:
            raise RuntimeError("Invalid smoke render duration")

        capped_points = [point for point in all_points if float(point["t_ms"]) <= smoke_duration_ms]
        if not capped_points:
            capped_points = [{**all_points[0], "t_ms": 0.0}]
        if float(capped_points[0]["t_ms"]) > 0:
            capped_points.insert(0, {**capped_points[0], "t_ms": 0.0})
        if float(capped_points[-1]["t_ms"]) < smoke_duration_ms:
            capped_points.append({**capped_points[-1], "t_ms": float(smoke_duration_ms)})

        render_segments = build_enabled_render_segments(capped_points)
        segment_paths: list[Path] = []

        for seg_idx, render_segment in enumerate(render_segments):
            start_ms = int(float(render_segment[0]["t_ms"]))
            end_ms = int(float(render_segment[-1]["t_ms"]))
            duration_ms = end_ms - start_ms
            if duration_ms <= 0:
                continue

            segment = prepare_render_segment(
                render_segment,
                fps=RENDER_TEST_FPS,
                max_yaw_rate=RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND,
                max_pitch_rate=RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND,
                max_fov_rate=RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND,
            )

            segment_path = work_dir / f"segment-{seg_idx:03d}.mp4"
            run_frame_remap_equirect(
                source_path,
                segment_path,
                work_dir / f"segment-{seg_idx:03d}",
                relative_segment_points(segment),
                duration_ms,
                source_start_ms=start_ms % video_duration_ms if loop_source and video_duration_ms > 0 else start_ms,
                fps=RENDER_TEST_FPS,
                effect_events=events_for_segment(effects, start_ms, end_ms),
                loop_source=loop_source and video_duration_ms > 0,
            )
            segment_paths.append(segment_path)
            rendered_duration_ms += duration_ms

        if not segment_paths:
            raise RuntimeError("No segments to render")
        if len(segment_paths) == 1:
            shutil.copy(segment_paths[0], output_path)
        else:
            concat_segments_reencode(segment_paths, work_dir / "segments.txt", output_path, fps=RENDER_TEST_FPS)

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
        "loopSource": loop_source,
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
