from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from .rendering import run_frame_remap_equirect
from .rendering.effects import events_for_segment
from .rendering.path_pipeline import prepare_render_segment, relative_segment_points, render_point_from_row
from .storage import EXPORTS_DIR, TMP_DIR, connect, list_effect_events, new_id, utc_now

SEGMENT_DURATION_MS = 30_000
RENDER_FPS = 30
MAX_YAW_RATE = 360
MAX_PITCH_RATE = 360
MAX_FOV_RATE = 360

_active_tasks: dict[str, threading.Thread] = {}
_cancel_flags: dict[str, threading.Event] = {}


def trigger_segment_render(
    session_id: str,
    segment_index: int,
    start_ms: int,
    end_ms: int,
    timeline_revision: int,
) -> None:
    task_key = f"{session_id}_{segment_index}"
    if task_key in _active_tasks and _active_tasks[task_key].is_alive():
        return

    cancel_event = threading.Event()
    _cancel_flags[task_key] = cancel_event

    thread = threading.Thread(
        target=_render_segment_worker,
        args=(session_id, segment_index, start_ms, end_ms, timeline_revision, cancel_event),
        daemon=True,
    )
    _active_tasks[task_key] = thread
    thread.start()


def cancel_segment_render(session_id: str, segment_index: int) -> None:
    task_key = f"{session_id}_{segment_index}"
    if task_key in _cancel_flags:
        _cancel_flags[task_key].set()


def _render_segment_worker(
    session_id: str,
    segment_index: int,
    start_ms: int,
    end_ms: int,
    timeline_revision: int,
    cancel_event: threading.Event,
) -> None:
    segment_id = new_id("segment")
    now = utc_now()

    try:
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO segment_renders
                (id, session_id, segment_index, start_ms, end_ms, status, timeline_revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (segment_id, session_id, segment_index, start_ms, end_ms, "rendering", timeline_revision, now, now),
            )

            session = conn.execute(
                "SELECT video_id FROM cut_sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if not session:
                raise RuntimeError("Session not found")

            video = conn.execute(
                "SELECT stored_filename, duration_ms FROM videos WHERE id = ?", (session["video_id"],)
            ).fetchone()
            if not video:
                raise RuntimeError("Video not found")

            points = conn.execute(
                """
                SELECT * FROM view_path_points
                WHERE session_id = ? AND t_ms >= ? AND t_ms <= ?
                ORDER BY t_ms
                """,
                (session_id, start_ms, end_ms),
            ).fetchall()

        if cancel_event.is_set():
            _mark_cancelled(segment_id)
            return

        if len(points) < 2:
            _mark_failed(segment_id, "Not enough path points")
            return

        all_points = [render_point_from_row(p) for p in points]
        segment = prepare_render_segment(
            all_points,
            fps=RENDER_FPS,
            max_yaw_rate=MAX_YAW_RATE,
            max_pitch_rate=MAX_PITCH_RATE,
            max_fov_rate=MAX_FOV_RATE,
        )

        if cancel_event.is_set():
            _mark_cancelled(segment_id)
            return

        from .storage import VIDEOS_DIR

        source_path = VIDEOS_DIR / video["stored_filename"]
        output_path = EXPORTS_DIR / f"{segment_id}.mp4"
        work_dir = TMP_DIR / segment_id
        work_dir.mkdir(parents=True, exist_ok=True)

        with connect() as conn:
            effects = list_effect_events(conn, session_id, start_ms, end_ms)
        segment_effects = events_for_segment(effects, start_ms, end_ms)

        duration_ms = end_ms - start_ms

        run_frame_remap_equirect(
            source_path=source_path,
            target_path=output_path,
            work_dir=work_dir,
            points=relative_segment_points(segment),
            duration_ms=duration_ms,
            source_start_ms=start_ms,
            fps=RENDER_FPS,
            effect_events=segment_effects,
        )

        if cancel_event.is_set():
            _mark_cancelled(segment_id)
            if output_path.exists():
                output_path.unlink()
            return

        _mark_completed(segment_id, str(output_path))

    except Exception as exc:
        _mark_failed(segment_id, str(exc))


def _mark_completed(segment_id: str, file_path: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE segment_renders SET status = ?, file_path = ?, updated_at = ? WHERE id = ?",
            ("completed", file_path, utc_now(), segment_id),
        )


def _mark_cancelled(segment_id: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE segment_renders SET status = ?, updated_at = ? WHERE id = ?",
            ("cancelled", utc_now(), segment_id),
        )


def _mark_failed(segment_id: str, error_message: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE segment_renders SET status = ?, error_message = ?, updated_at = ? WHERE id = ?",
            ("failed", error_message[:1000], utc_now(), segment_id),
        )
