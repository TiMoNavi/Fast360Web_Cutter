from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field


class OutputConfig(BaseModel):
    aspect: Literal["16:9"] = "16:9"
    width: int = 1920
    height: int = 1080
    fps: int = 30


class ClipEditConfig(BaseModel):
    version: Literal[1] = 1
    video_id: str = Field(alias="videoId")
    session_id: str = Field(alias="sessionId")
    source: Literal["webxr"] = "webxr"
    timeline_revision: int = Field(default=1, alias="timelineRevision")
    output: OutputConfig = Field(default_factory=OutputConfig)


class ViewCenter(BaseModel):
    yaw: float
    pitch: float


class ViewFov(BaseModel):
    h: float
    v: float


PatchReason = Literal["live", "replay", "discard", "restore", "cut", "fov", "lock", "effect"]


class ReplaceRange(BaseModel):
    start_ms: int = Field(alias="startMs")
    end_ms: int = Field(alias="endMs")
    reason: PatchReason


class ViewPathPoint(BaseModel):
    seq: int
    t_ms: int = Field(alias="tMs")
    center: ViewCenter
    fov: ViewFov
    roll: float = 0
    enabled: bool = True
    cut: bool = False
    locked: bool = False
    smooth_follow: bool = Field(default=True, alias="smoothFollow")
    interpolation: Literal["linear", "fast", "hold"] = "linear"
    transition_ms: int = Field(default=0, alias="transitionMs")
    input: Literal["head_gaze", "controller_ray"] = "head_gaze"


class ViewPathPatch(BaseModel):
    version: Literal[1] = 1
    video_id: str = Field(alias="videoId")
    session_id: str = Field(alias="sessionId")
    take_id: str = Field(alias="takeId")
    path_revision: int = Field(alias="pathRevision")
    replace_range: ReplaceRange = Field(alias="replaceRange")
    points: list[ViewPathPoint]


EffectFallback = Literal["ignore", "warn", "fail"]


class EffectRenderPolicy(BaseModel):
    fallback: EffectFallback = "warn"
    requires: list[str] = Field(default_factory=list)
    priority: int | None = None
    conflict_group: str | None = Field(default=None, alias="conflictGroup")


class EffectEvent(BaseModel):
    seq: int
    event_name: str = Field(
        alias="eventName",
        validation_alias=AliasChoices("eventName", "type"),
        serialization_alias="eventName",
    )
    display_name: str | None = Field(default=None, alias="displayName")
    start_ms: int = Field(alias="startMs")
    end_ms: int = Field(alias="endMs")
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    render_policy: EffectRenderPolicy = Field(default_factory=EffectRenderPolicy, alias="renderPolicy")


class EffectEventsPatch(BaseModel):
    version: Literal[1] = 1
    video_id: str = Field(alias="videoId")
    session_id: str = Field(alias="sessionId")
    effect_revision: int = Field(alias="effectRevision")
    replace_range: ReplaceRange = Field(alias="replaceRange")
    events: list[EffectEvent]


class SessionMusicConfig(BaseModel):
    music_id: str | None = Field(default=None, alias="musicId")
    enabled: bool = True
    start_ms: int = Field(default=0, alias="startMs")
    gain_db: float = Field(default=-10.0, alias="gainDb")


class PlaybackPreviewState(BaseModel):
    brightness: float = 1.0
    contrast: float = 1.0
    overlay_opacity: float = Field(default=0.55, alias="overlayOpacity")


class PlaybackRecordingState(BaseModel):
    sampling_paused: bool = Field(default=False, alias="samplingPaused")
    discard_mode: bool = Field(default=False, alias="discardMode")
    recording_rate: float = Field(default=1.0, alias="recordingRate")


class PlaybackClientState(BaseModel):
    session_id: str = Field(alias="sessionId")
    video_id: str = Field(alias="videoId")
    client_time_ms: int = Field(alias="clientTimeMs")
    video_time_ms: int = Field(alias="videoTimeMs")
    playback_rate: float = Field(alias="playbackRate")
    previous_playback_rate: float | None = Field(default=None, alias="previousPlaybackRate")
    discard_fast_forward_rate: Literal[5] = Field(default=5, alias="discardFastForwardRate")
    preview: PlaybackPreviewState = Field(default_factory=PlaybackPreviewState)
    recording: PlaybackRecordingState = Field(default_factory=PlaybackRecordingState)


class SessionStatus(BaseModel):
    session_status: str = Field(default="collecting", alias="sessionStatus")
    video_id: str = Field(alias="videoId")
    export_id: str | None = Field(default=None, alias="exportId")
    minute_statuses: list[dict] = Field(default_factory=list, alias="minuteStatuses")
    completed_count: int = Field(default=0, alias="completedCount")
    dirty_count: int = Field(default=0, alias="dirtyCount")
    discarded_count: int = Field(default=0, alias="discardedCount")
    failed_count: int = Field(default=0, alias="failedCount")
    download_ready: bool = Field(default=False, alias="downloadReady")


class AuthRequest(BaseModel):
    email: str
    password: str


class AuthUser(BaseModel):
    id: str
    email: str


class ThumbnailRequest(BaseModel):
    time_ms: int | None = Field(default=None, alias="timeMs")
    yaw: float = 0
    pitch: float = 0
    h_fov: float = Field(default=100, alias="hFov")
    v_fov: float = Field(default=56.25, alias="vFov")
    width: int = 640
    height: int = 360
