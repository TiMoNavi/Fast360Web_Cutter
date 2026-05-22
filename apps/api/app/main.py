import hashlib
import json
import os
import secrets
import shutil
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .models import AuthRequest, AuthUser, ClipEditConfig, EffectEventsPatch, PlaybackClientState, SessionStatus, ViewPathPatch
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
    TMP_DIR,
    VIDEOS_DIR,
    connect,
    export_response,
    init_storage,
    list_effect_events,
    mark_minutes,
    new_id,
    probe_video_metadata,
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
init_storage()
app.mount("/media", StaticFiles(directory=VIDEOS_DIR), name="media")

SESSION_COOKIE = "tid_session"
SESSION_DAYS = 14
PBKDF2_ITERATIONS = 200_000
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
UPLOAD_CHUNK_SIZE = 1024 * 1024
DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
MAX_UPLOAD_BYTES = read_int_env("VIDEO_UPLOAD_MAX_BYTES", DEFAULT_MAX_UPLOAD_BYTES)
ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
ALLOWED_VIDEO_CONTENT_TYPES = {"application/octet-stream"}
RENDER_TEST_MAX_DURATION_MS = 60_000
RENDER_TEST_FPS = 30
RENDER_TEST_MAX_YAW_RATE_DEGREES_PER_SECOND = 8
RENDER_TEST_MAX_PITCH_RATE_DEGREES_PER_SECOND = 5
RENDER_TEST_MAX_FOV_RATE_DEGREES_PER_SECOND = 12


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


@app.get("/api/videos")
def list_videos(user: dict[str, str] = Depends(require_user)) -> dict[str, list[dict]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC",
            (user["id"],),
        ).fetchall()
    return {"videos": [video_response(row) for row in rows]}


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


def copy_upload_with_limit(file: UploadFile, target: Path) -> int:
    written = 0
    with target.open("wb") as output:
        while chunk := file.file.read(UPLOAD_CHUNK_SIZE):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Uploaded video is too large")
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
        now = utc_now()
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO videos (
                    id, user_id, original_filename, stored_filename, content_type, file_size,
                    duration_ms, width, height, fps, metadata_json, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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


@app.get("/api/videos/{video_id}")
def get_video(video_id: str, user: dict[str, str] = Depends(require_user)) -> dict:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM videos WHERE id = ? AND user_id = ?",
            (video_id, user["id"]),
        ).fetchone()
        if row is not None:
            return video_detail_response(conn, row)
    if row is None:
        raise HTTPException(status_code=404, detail="Video not found")


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
