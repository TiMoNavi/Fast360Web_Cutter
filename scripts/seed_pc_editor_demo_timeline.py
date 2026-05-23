from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "apps" / "api"))

from app.models import ClipEditConfig, EffectEvent, EffectEventsPatch, ViewPathPatch, ViewPathPoint  # noqa: E402
from app.storage import DB_PATH, connect, save_clip_config, save_effect_events_patch, save_patch, utc_now  # noqa: E402


DEFAULT_EMAIL = "madjad020@gmail.com"
VIDEO_ID = "video_training_07e4e3c1e9b6_old_ghost_road_mountain_bike"
SESSION_ID = "session_training_07e4e3c1e9b6_old_ghost_road_mountain_bike"
TAKE_ID = "take_pc_editor_demo_old_ghost_road_v1"
TIMELINE_REVISION = 2
PATH_REVISION = 2
EFFECT_REVISION = 2
DURATION_MS = 60_000


def backup_database() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = DB_PATH.with_name(f"app.before-pc-editor-demo-old-ghost-road-{stamp}.db")
    shutil.copy2(DB_PATH, backup_path)
    return backup_path


def fov_v(fov_h: float) -> float:
    return round(fov_h * 9 / 16, 2)


def point(
    seq: int,
    t_ms: int,
    yaw: float,
    pitch: float,
    fov_h: float,
    *,
    enabled: bool = True,
    cut: bool = False,
    locked: bool = False,
    smooth_follow: bool = True,
    interpolation: str = "linear",
    transition_ms: int = 0,
    input_source: str = "head_gaze",
) -> ViewPathPoint:
    return ViewPathPoint(
        seq=seq,
        tMs=t_ms,
        center={"yaw": yaw, "pitch": pitch},
        fov={"h": fov_h, "v": fov_v(fov_h)},
        roll=0,
        enabled=enabled,
        cut=cut,
        locked=locked,
        smoothFollow=smooth_follow,
        interpolation=interpolation,
        transitionMs=transition_ms,
        input=input_source,
    )


def path_points() -> list[ViewPathPoint]:
    raw_points = [
        # Cold open: wide view, locked horizon, slow gaze pickup.
        (0, 0, 0, -4, 104, True, True, True, True, "hold", 0, "head_gaze"),
        (1, 1000, 4, -4, 102, True, False, True, True, "linear", 0, "head_gaze"),
        (2, 2000, 10, -5, 100, True, False, True, True, "linear", 0, "head_gaze"),
        (3, 3000, 18, -6, 96, True, False, False, True, "linear", 0, "head_gaze"),
        (4, 4000, 25, -6, 94, True, False, False, True, "linear", 0, "head_gaze"),
        (5, 5000, 32, -7, 91, True, False, False, True, "linear", 0, "head_gaze"),
        (6, 6000, 41, -7, 88, True, False, False, True, "linear", 0, "head_gaze"),
        (7, 7000, 51, -8, 85, True, False, False, True, "linear", 0, "head_gaze"),
        (8, 8000, 63, -8, 82, True, False, False, True, "linear", 0, "controller_ray"),
        (9, 9000, 76, -9, 78, True, False, False, True, "linear", 0, "controller_ray"),
        (10, 10000, 89, -8, 76, True, False, False, True, "linear", 0, "controller_ray"),
        (11, 11000, 101, -8, 77, True, False, False, True, "linear", 0, "controller_ray"),
        (12, 12000, 112, -7, 79, True, False, False, True, "linear", 0, "controller_ray"),
        (13, 13000, 122, -6, 82, True, False, False, True, "linear", 0, "head_gaze"),
        (14, 14000, 130, -5, 84, True, False, False, True, "linear", 0, "head_gaze"),
        (15, 15000, 137, -5, 86, True, False, False, True, "linear", 0, "head_gaze"),
        (16, 16000, 142, -5, 84, True, False, False, True, "linear", 0, "head_gaze"),
        (17, 17000, 146, -5, 82, True, False, False, True, "linear", 0, "head_gaze"),
        (18, 18480, 148, -6, 82, True, False, True, True, "hold", 0, "head_gaze"),
        # Intentional direction jump, shown as a PC editor cut operation.
        (19, 18500, -165, -9, 82, True, True, True, False, "fast", 120, "controller_ray"),
        (20, 19500, -156, -10, 78, True, False, False, True, "linear", 0, "controller_ray"),
        (21, 20500, -146, -10, 75, True, False, False, True, "linear", 0, "controller_ray"),
        (22, 21500, -135, -9, 72, True, False, False, True, "linear", 0, "controller_ray"),
        (23, 22500, -124, -8, 72, True, False, False, True, "linear", 0, "controller_ray"),
        (24, 23500, -112, -7, 74, True, False, False, True, "linear", 0, "controller_ray"),
        (25, 24500, -101, -6, 76, True, False, False, True, "linear", 0, "head_gaze"),
        (26, 25500, -90, -6, 78, True, False, False, True, "linear", 0, "head_gaze"),
        (27, 26500, -78, -6, 80, True, False, False, True, "linear", 0, "head_gaze"),
        (28, 27500, -66, -5, 82, True, False, False, True, "linear", 0, "head_gaze"),
        (29, 28500, -54, -5, 84, True, False, False, True, "linear", 0, "head_gaze"),
        (30, 29500, -42, -5, 86, True, False, False, True, "linear", 0, "head_gaze"),
        (31, 30500, -30, -4, 88, True, False, False, True, "linear", 0, "head_gaze"),
        (32, 31500, -18, -4, 90, True, False, False, True, "linear", 0, "head_gaze"),
        (33, 32500, -6, -4, 92, True, False, False, True, "linear", 0, "head_gaze"),
        (34, 33500, 8, -4, 93, True, False, False, True, "linear", 0, "head_gaze"),
        (35, 34500, 22, -5, 91, True, False, False, True, "linear", 0, "controller_ray"),
        (36, 35500, 38, -6, 88, True, False, False, True, "linear", 0, "controller_ray"),
        (37, 36500, 55, -7, 85, True, False, False, True, "linear", 0, "controller_ray"),
        (38, 37500, 70, -7, 83, True, False, False, True, "linear", 0, "controller_ray"),
        (39, 38500, 82, -7, 82, True, False, False, True, "linear", 0, "head_gaze"),
        (40, 39500, 94, -6, 84, True, False, False, True, "linear", 0, "head_gaze"),
        (41, 41000, 104, -6, 88, True, False, True, True, "hold", 0, "head_gaze"),
        # Source range 42s-48s is deliberately discarded.
        (42, 42000, 108, -5, 96, False, True, True, False, "hold", 0, "head_gaze"),
        (43, 43000, 110, -5, 96, False, False, True, False, "hold", 0, "head_gaze"),
        (44, 44000, 112, -5, 96, False, False, True, False, "hold", 0, "head_gaze"),
        (45, 45000, 114, -5, 96, False, False, True, False, "hold", 0, "head_gaze"),
        (46, 46000, 116, -5, 96, False, False, True, False, "hold", 0, "head_gaze"),
        (47, 47000, 118, -5, 96, False, False, True, False, "hold", 0, "head_gaze"),
        (48, 48000, 126, -7, 78, True, True, False, False, "fast", 160, "controller_ray"),
        (49, 49000, 136, -7, 76, True, False, False, True, "linear", 0, "controller_ray"),
        (50, 50000, 146, -7, 75, True, False, False, True, "linear", 0, "controller_ray"),
        (51, 51000, 157, -6, 76, True, False, False, True, "linear", 0, "controller_ray"),
        (52, 52000, 169, -6, 78, True, False, False, True, "linear", 0, "head_gaze"),
        (53, 53000, 179, -5, 82, True, False, False, True, "linear", 0, "head_gaze"),
        (54, 54000, -172, -5, 86, True, False, False, True, "linear", 0, "head_gaze"),
        (55, 55000, -164, -4, 90, True, False, False, True, "linear", 0, "head_gaze"),
        (56, 56000, -158, -4, 94, True, False, False, True, "linear", 0, "head_gaze"),
        (57, 57000, -154, -4, 98, True, False, False, True, "linear", 0, "head_gaze"),
        (58, 58000, -151, -4, 101, True, False, True, True, "linear", 0, "head_gaze"),
        (59, 59000, -150, -4, 104, True, False, True, True, "linear", 0, "head_gaze"),
        (60, 60000, -150, -4, 104, True, False, True, True, "hold", 0, "head_gaze"),
    ]
    return [
        point(
            seq,
            t_ms,
            yaw,
            pitch,
            fov_h,
            enabled=enabled,
            cut=cut,
            locked=locked,
            smooth_follow=smooth_follow,
            interpolation=interpolation,
            transition_ms=transition_ms,
            input_source=input_source,
        )
        for (
            seq,
            t_ms,
            yaw,
            pitch,
            fov_h,
            enabled,
            cut,
            locked,
            smooth_follow,
            interpolation,
            transition_ms,
            input_source,
        ) in raw_points
    ]


def effect(
    seq: int,
    event_name: str,
    display_name: str,
    start_ms: int,
    end_ms: int,
    params: dict[str, Any] | None = None,
    *,
    priority: int | None = None,
    conflict_group: str | None = None,
) -> EffectEvent:
    render_policy: dict[str, Any] = {"fallback": "warn", "requires": []}
    if priority is not None:
        render_policy["priority"] = priority
    if conflict_group is not None:
        render_policy["conflictGroup"] = conflict_group
    return EffectEvent(
        seq=seq,
        eventName=event_name,
        displayName=display_name,
        startMs=start_ms,
        endMs=end_ms,
        params=params or {},
        enabled=True,
        renderPolicy=render_policy,
    )


def effect_events() -> list[EffectEvent]:
    return [
        effect(
            1,
            "transition.fade_black",
            "Fade in",
            0,
            1000,
            {"direction": "in", "peakOpacity": 1.0, "edgeMs": 300},
            priority=65,
            conflict_group="frame.occlusion",
        ),
        effect(
            2,
            "overlay.letterbox",
            "Cinematic matte",
            0,
            DURATION_MS,
            {"ratio": 0.075, "opacity": 0.82, "color": "#000000", "edgeMs": 900},
        ),
        effect(
            3,
            "filter.color_grade",
            "Forest contrast grade",
            2500,
            58500,
            {"strength": 0.72, "contrast": 1.12, "saturation": 1.13, "warmth": 0.08, "tint": -0.02, "edgeMs": 1200},
        ),
        effect(
            4,
            "highlight",
            "First turn highlight",
            7200,
            11800,
            {"strength": 0.34, "brightness": 16, "contrast": 1.1, "warmth": 0.1, "bloom": 0.14, "edgeMs": 550},
        ),
        effect(
            5,
            "overlay.text",
            "Line lock label",
            7600,
            10400,
            {
                "text": "LOCK LINE",
                "position": "top_left",
                "scale": 0.78,
                "opacity": 0.92,
                "backgroundOpacity": 0.35,
                "color": "#ffffff",
                "background": "#000000",
            },
        ),
        effect(
            6,
            "transition.flash_white",
            "Hard cut flash",
            18400,
            19050,
            {"peakOpacity": 0.72, "edgeMs": 160},
            priority=85,
            conflict_group="frame.occlusion",
        ),
        effect(
            7,
            "filter.chromatic_aberration",
            "Speed edge",
            19000,
            26000,
            {"strength": 0.26, "offsetPx": 5, "edgeMs": 700},
        ),
        effect(
            8,
            "filter.blur",
            "Drop motion blur",
            22300,
            23900,
            {"strength": 0.22, "radius": 9, "edgeMs": 260},
        ),
        effect(
            9,
            "filter.vignette",
            "Focus vignette",
            27000,
            41500,
            {"strength": 0.28, "radius": 0.68, "edgeMs": 900},
        ),
        effect(
            10,
            "highlight",
            "Line choice highlight",
            34200,
            38400,
            {"strength": 0.3, "brightness": 14, "contrast": 1.08, "warmth": 0.06, "bloom": 0.1, "edgeMs": 500},
        ),
        effect(
            11,
            "overlay.text",
            "Line choice label",
            34500,
            37300,
            {
                "text": "LINE CHOICE",
                "position": "bottom_left",
                "scale": 0.74,
                "opacity": 0.9,
                "backgroundOpacity": 0.35,
                "color": "#ffffff",
                "background": "#000000",
            },
        ),
        effect(
            12,
            "black.solid",
            "Discarded section mask",
            42000,
            48000,
            {"opacity": 1.0, "color": "#000000"},
            priority=100,
            conflict_group="frame.occlusion",
        ),
        effect(
            13,
            "transition.flash_white",
            "Restore flash",
            48000,
            48650,
            {"peakOpacity": 0.58, "edgeMs": 150},
            priority=82,
            conflict_group="frame.occlusion",
        ),
        effect(
            14,
            "highlight",
            "Exit speed highlight",
            49200,
            55600,
            {"strength": 0.36, "brightness": 18, "contrast": 1.12, "warmth": 0.12, "bloom": 0.18, "edgeMs": 650},
        ),
        effect(
            15,
            "overlay.text",
            "Exit speed label",
            54500,
            57300,
            {
                "text": "EXIT SPEED",
                "position": "bottom_center",
                "scale": 0.78,
                "opacity": 0.92,
                "backgroundOpacity": 0.38,
                "color": "#ffffff",
                "background": "#000000",
            },
        ),
        effect(
            16,
            "transition.fade_black",
            "Fade out",
            58600,
            60000,
            {"direction": "out", "peakOpacity": 1.0, "edgeMs": 400},
            priority=65,
            conflict_group="frame.occlusion",
        ),
    ]


def validate_target(email: str) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT
                users.id AS user_id,
                users.email,
                videos.id AS video_id,
                videos.original_filename,
                videos.duration_ms,
                videos.width,
                videos.height,
                cut_sessions.id AS session_id
            FROM users
            JOIN videos ON videos.user_id = users.id
            JOIN cut_sessions ON cut_sessions.video_id = videos.id AND cut_sessions.user_id = users.id
            WHERE users.email = ?
                AND videos.id = ?
                AND cut_sessions.id = ?
            """,
            (email.strip().lower(), VIDEO_ID, SESSION_ID),
        ).fetchone()
    if row is None:
        raise SystemExit(f"Target video/session was not found for {email}: {VIDEO_ID} / {SESSION_ID}")
    return dict(row)


def seed_timeline(email: str, *, make_backup: bool = True) -> dict[str, Any]:
    target = validate_target(email)
    backup_path = backup_database() if make_backup else None
    now = utc_now()
    points = path_points()
    events = effect_events()

    with connect() as conn:
        for table in (
            "view_path_points",
            "view_path_patches",
            "effect_events",
            "effect_event_patches",
            "minute_segments",
        ):
            conn.execute(f"DELETE FROM {table} WHERE session_id = ?", (SESSION_ID,))

        view_patch = ViewPathPatch(
            videoId=VIDEO_ID,
            sessionId=SESSION_ID,
            takeId=TAKE_ID,
            pathRevision=PATH_REVISION,
            replaceRange={"startMs": 0, "endMs": DURATION_MS, "reason": "replay"},
            points=points,
        )
        effects_patch = EffectEventsPatch(
            videoId=VIDEO_ID,
            sessionId=SESSION_ID,
            effectRevision=EFFECT_REVISION,
            replaceRange={"startMs": 0, "endMs": DURATION_MS, "reason": "effect"},
            events=events,
        )

        save_patch(conn, SESSION_ID, view_patch)
        save_effect_events_patch(conn, SESSION_ID, effects_patch)
        save_clip_config(
            conn,
            ClipEditConfig(videoId=VIDEO_ID, sessionId=SESSION_ID, timelineRevision=TIMELINE_REVISION),
        )
        conn.execute(
            """
            UPDATE cut_sessions
            SET status = ?, timeline_revision = ?, updated_at = ?
            WHERE id = ?
            """,
            ("collecting", TIMELINE_REVISION, now, SESSION_ID),
        )
        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError(f"Foreign key check failed: {[tuple(row) for row in fk_errors]}")

    return {
        **target,
        "backupPath": str(backup_path) if backup_path else None,
        "timelineRevision": TIMELINE_REVISION,
        "pathRevision": PATH_REVISION,
        "effectRevision": EFFECT_REVISION,
        "pathPointCount": len(points),
        "effectEventCount": len(events),
        "discardRangeMs": {"startMs": 42_000, "endMs": 48_000},
        "cutMarkersMs": [0, 18_500, 42_000, 48_000],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a PC editor demo timeline for the Old Ghost Road 4K 360 clip.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Owner account email.")
    parser.add_argument("--no-backup", action="store_true", help="Skip the SQLite backup copy.")
    args = parser.parse_args()

    result = seed_timeline(args.email, make_backup=not args.no_backup)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
