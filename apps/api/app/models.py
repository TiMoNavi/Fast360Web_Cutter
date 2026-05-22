from typing import Literal

from pydantic import BaseModel, Field


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


class ReplaceRange(BaseModel):
    start_ms: int = Field(alias="startMs")
    end_ms: int = Field(alias="endMs")
    reason: Literal["live", "replay", "discard", "restore", "cut", "fov", "lock"]


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
    input: Literal["head_gaze", "controller_ray"] = "head_gaze"


class ViewPathPatch(BaseModel):
    version: Literal[1] = 1
    video_id: str = Field(alias="videoId")
    session_id: str = Field(alias="sessionId")
    take_id: str = Field(alias="takeId")
    path_revision: int = Field(alias="pathRevision")
    replace_range: ReplaceRange = Field(alias="replaceRange")
    points: list[ViewPathPoint]


class PlaybackPreviewState(BaseModel):
    brightness: float = 1.0
    contrast: float = 1.0
    overlay_opacity: float = Field(default=0.55, alias="overlayOpacity")


class PlaybackRecordingState(BaseModel):
    sampling_paused: bool = Field(default=False, alias="samplingPaused")
    discard_mode: bool = Field(default=False, alias="discardMode")


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
