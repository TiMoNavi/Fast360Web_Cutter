from __future__ import annotations

import threading
from pathlib import Path
import shutil

from .rendering import run_frame_remap_equirect
from .rendering.effects import events_for_segment
from .rendering.path_pipeline import (
    build_enabled_render_segments,
    clip_timeline_points,
    prepare_render_segment,
    relative_segment_points,
    render_point_from_row,
)
from .storage import EXPORTS_DIR, TMP_DIR, connect, concat_segments_reencode, list_effect_events, new_id, utc_now

SEGMENT_DURATION_MS = 30_000
RENDER_FPS = 30
MAX_YAW_RATE = 360
MAX_PITCH_RATE = 360
MAX_FOV_RATE = 360
RERENDER_DEBOUNCE_SECONDS = 30

_active_tasks: dict[str, threading.Thread] = {}
_cancel_flags: dict[str, threading.Event] = {}
_rerender_timers: dict[str, threading.Timer] = {}
_registry_lock = threading.Lock()


def _segment_task_key(session_id: str, segment_index: int) -> str:
    return f"{session_id}_{segment_index}"


def trigger_segment_render(
    session_id: str,
    segment_index: int,
    start_ms: int,
    end_ms: int,
    timeline_revision: int,
) -> bool:
    task_key = _segment_task_key(session_id, segment_index)
    with _registry_lock:
        timer = _rerender_timers.pop(task_key, None)
        if timer is not None:
            timer.cancel()

        active_task = _active_tasks.get(task_key)
        if active_task is not None and active_task.is_alive():
            return False

        cancel_event = threading.Event()
        _cancel_flags[task_key] = cancel_event

        thread = threading.Thread(
            target=_render_segment_worker,
            args=(session_id, segment_index, start_ms, end_ms, timeline_revision, cancel_event),
            daemon=True,
        )
        _active_tasks[task_key] = thread
    thread.start()
    return True


def cancel_segment_render(session_id: str, segment_index: int) -> None:
    task_key = _segment_task_key(session_id, segment_index)
    with _registry_lock:
        cancel_event = _cancel_flags.get(task_key)
    if cancel_event is not None:
        cancel_event.set()


def cancel_scheduled_segment_rerender(session_id: str, segment_index: int) -> None:
    task_key = _segment_task_key(session_id, segment_index)
    with _registry_lock:
        timer = _rerender_timers.pop(task_key, None)
    if timer is not None:
        timer.cancel()


def schedule_segment_rerender(
    session_id: str,
    segment_index: int,
    start_ms: int,
    end_ms: int,
    timeline_revision: int,
    delay_seconds: float = RERENDER_DEBOUNCE_SECONDS,
) -> None:
    task_key = _segment_task_key(session_id, segment_index)

    timer: threading.Timer

    def run_scheduled_render() -> None:
        with _registry_lock:
            current_timer = _rerender_timers.get(task_key)
            if current_timer is not timer:
                return
            _rerender_timers.pop(task_key, None)

        started = trigger_segment_render(session_id, segment_index, start_ms, end_ms, timeline_revision)
        if not started:
            schedule_segment_rerender(session_id, segment_index, start_ms, end_ms, timeline_revision, delay_seconds=1)

    timer = threading.Timer(delay_seconds, run_scheduled_render)
    timer.daemon = True

    with _registry_lock:
        existing_timer = _rerender_timers.pop(task_key, None)
        if existing_timer is not None:
            existing_timer.cancel()
        _rerender_timers[task_key] = timer
    timer.start()


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
                WHERE session_id = ?
                ORDER BY t_ms
                """,
                (session_id,),
            ).fetchall()

        if cancel_event.is_set():
            _mark_cancelled(segment_id)
            return

        if len(points) < 2:
            _mark_failed(segment_id, "Not enough path points")
            return

        all_points = clip_timeline_points([render_point_from_row(p) for p in points], start_ms, end_ms)
        render_segments = build_enabled_render_segments(all_points)
        if not render_segments:
            _mark_failed(segment_id, "No enabled path segments")
            return

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

        rendered_paths: list[Path] = []
        for part_index, render_segment in enumerate(render_segments):
            if cancel_event.is_set():
                _mark_cancelled(segment_id)
                return

            segment_start_ms = int(float(render_segment[0]["t_ms"]))
            segment_end_ms = int(float(render_segment[-1]["t_ms"]))
            duration_ms = segment_end_ms - segment_start_ms
            if duration_ms <= 0:
                continue

            prepared_segment = prepare_render_segment(
                render_segment,
                fps=RENDER_FPS,
                max_yaw_rate=MAX_YAW_RATE,
                max_pitch_rate=MAX_PITCH_RATE,
                max_fov_rate=MAX_FOV_RATE,
            )
            part_path = work_dir / f"part-{part_index:03d}.mp4"
            run_frame_remap_equirect(
                source_path=source_path,
                target_path=part_path,
                work_dir=work_dir / f"part-{part_index:03d}",
                points=relative_segment_points(prepared_segment),
                duration_ms=duration_ms,
                source_start_ms=segment_start_ms,
                fps=RENDER_FPS,
                effect_events=events_for_segment(effects, segment_start_ms, segment_end_ms),
            )
            rendered_paths.append(part_path)

        if not rendered_paths:
            _mark_failed(segment_id, "No valid segment parts")
            return

        if len(rendered_paths) == 1:
            shutil.copy(rendered_paths[0], output_path)
        else:
            concat_segments_reencode(rendered_paths, work_dir / "parts.txt", output_path, fps=RENDER_FPS)

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
