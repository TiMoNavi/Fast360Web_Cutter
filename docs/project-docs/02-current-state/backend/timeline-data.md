# Timeline 数据结构当前状态

## 当前代码来源

当前 timeline 相关代码分散在以下位置：

```text
apps/api/app/models.py
定义 ClipEditConfig、ViewPathPatch、ViewPathPoint、EffectEventsPatch、EffectEvent、SessionMusicConfig、PlaybackClientState。

apps/api/app/storage.py
创建 timeline 相关 SQLite 表，保存 path patch / effect patch，展开写入当前点和当前效果事件。

apps/api/app/main.py
提供 cut session、path-patches、effect-events、playback-state、status、segment-renders、render-test 接口。

apps/api/app/timeline_assembler.py
把 points / effects / audio_tracks 字典编译成 ViewPathTimeline 字典。

apps/api/app/rendering/path_pipeline.py
把 view_path_points 转成可渲染片段，并处理 enabled/cut/fast transition。

apps/api/app/incremental_render.py
实验性的进程内 30 秒 segment render 线程。
```

## 当前数据库形态

`init_storage()` 当前会创建这些 timeline 相关表：

```text
cut_sessions
保存 video_id、user_id、status、timeline_revision。

clip_edit_configs
按 session 保存 ClipEditConfig JSON。

view_path_patches
保存原始 ViewPathPatch JSON，以及 take_id、path_revision、replaceRange、reason。

view_path_points
保存当前展开后的取景点。replaceRange 内旧点会被删除，新点会插入。

effect_event_patches
保存原始 EffectEventsPatch JSON。

effect_events
保存当前展开后的效果事件。

session_music
保存当前 session 选中的一首音乐。

minute_segments
保存分钟级状态，path/effect patch 会标 dirty。

segment_renders
保存实验性增量分片渲染状态和文件路径。
```

当前没有：

```text
view_path_timelines 表。
timeline_build_reports 表。
playback_states 表。
ViewPathTimeline Pydantic 模型。
返回 ViewPathTimeline 的 HTTP 接口。
```

## 当前上传协议

`ViewPathPatch` 当前字段：

```text
version
videoId
sessionId
takeId
pathRevision
replaceRange.startMs
replaceRange.endMs
replaceRange.reason
points[]
```

`ViewPathPoint` 当前字段：

```text
seq
tMs
center.yaw
center.pitch
fov.h
fov.v
roll
enabled
cut
locked
smoothFollow
interpolation
transitionMs
input
```

后端 `PatchReason` 当前接受：

```text
live
replay
discard
restore
cut
fov
lock
effect
```

Web 端 path patch 当前常用 reason 是：

```text
live
replay
discard
restore
cut
fov
lock
```

`EffectEventsPatch` 当前字段：

```text
version
videoId
sessionId
effectRevision
replaceRange.startMs
replaceRange.endMs
replaceRange.reason = effect
events[]
```

`EffectEvent` 当前支持 `eventName` 或 `type`，支持自由字符串事件名、`displayName`、`params` 和 `renderPolicy`。

## 当前 path patch 写入行为

`POST /api/cut-sessions/:sessionId/path-patches` 当前行为：

```text
1. 校验 route sessionId 与 body sessionId 一致。
2. 校验 session 属于当前用户。
3. 调用 save_patch 保存原始 patch_json。
4. 删除 view_path_points 中 [replaceRange.startMs, replaceRange.endMs) 的旧点。
5. 插入 patch.points。
6. 标记受影响 minute_segments = dirty。
7. 如果 patch.points 非空，尝试按 max tMs 推动实验性 segment_renders。
```

当前没有显式校验：

```text
replaceRange.startMs < replaceRange.endMs。
points 必须落在 replaceRange 内。
pathRevision 单调递增。
同一个 patch 是否重复提交。
每分钟点数上限。
```

`pathRevision` 当前会保存，但没有参与冲突判断。`timeline_revision` 当前保存在 `cut_sessions`，但 path patch 接收时不会自动递增。

## 当前 effect event 写入行为

`POST /api/cut-sessions/:sessionId/effect-events` 当前已经做了更完整的范围校验：

```text
route sessionId 与 body sessionId 一致。
replaceRange.startMs < replaceRange.endMs。
每个 event.startMs < event.endMs。
每个 event 都在 replaceRange 内。
session 属于当前用户。
```

保存行为：

```text
保存原始 patch_json 到 effect_event_patches。
删除与 replaceRange 重叠的旧 effect_events。
插入当前 events。
标记受影响 minute_segments = dirty。
```

当前已注册并可渲染的效果：

```text
transition.fade_black
black.solid
transition.flash_white
filter.color_grade
highlight
filter.blur
filter.vignette
filter.chromatic_aberration
overlay.letterbox
overlay.text
```

未知效果可以保存并进入 timeline。渲染时默认忽略；如果 `renderPolicy.fallback = "fail"`，渲染阶段会报错。

## 当前 ViewPathTimeline 输出结构

`apps/api/app/timeline_assembler.py` 当前可以生成一个 `ViewPathTimeline` 字典，顶层字段为：

```text
schema
timelineId
createdAt
source
session
output
coordinateSystem
effectSystem
editSegments
viewTracks
effectTracks
audioTracks
coverage
build
```

当前实现细节：

```text
normalize_points()
把输入点标准化，并按 t_ms 去重。同一 t_ms 保留 seq 更大的点。

timeline_view_point()
把后端点字典转成 ViewPathTimeline 的 viewTracks[].points[]。

build_enabled_render_segments()
来自 rendering/path_pipeline.py。enabled=false 会关闭当前可渲染片段，cut=true 会切段。

edit_segments_from_render_segments()
把可渲染片段转成 forward / speed=1.0 的 editSegments。

timeline_effect_event()
把 effect events 转成 effectTracks[].events[]，并附加 resolvedEffect。

timeline_audio_track()
把 session music 风格的 dict 转成 output 时间轴上的 audioTracks[]。

detect_point_gaps()
按 softGapMs / hardGapMs 检测点缺口。

timeline_status()
没有 editSegments 时 not_ready；存在 hard gap 时 partial；否则 ready。
```

当前 assembler 是纯 Python 函数：

```text
输入来自调用方传入的 dict list。
不直接读取数据库。
不保存 ViewPathTimeline 文件。
不写 build report 表。
不接 HTTP endpoint。
render-test 也还没有改成读取它的输出。
```

## 当前 render-test 与 timeline 的关系

`POST /api/cut-sessions/:sessionId/render-test` 当前不读取 `ViewPathTimeline`。

它的实际输入是：

```text
当前 session 的所有 view_path_points，按 t_ms 排序。
0 到 60 秒内 enabled=true 的 effect_events。
当前 session_music，可选。
源视频文件。
```

当前行为：

```text
最多渲染 60 秒。
使用 30 秒 segment 窗口。
如果 segment_renders 中已有 completed 分片且文件存在，会复用。
否则读取该分片范围内的点，补起止点，执行 remap。
多段输出时 concat/reencode。
音乐在视频渲染完成后 mux 进去。
成功后 export.status = ready，session.status = export_ready。
```

这意味着当前渲染链路仍是：

```text
view_path_points + effect_events -> path_pipeline -> remap/effects -> MP4
```

还不是理想链路：

```text
ViewPathTimeline -> RenderSlice[] -> segment render -> final export
```

## 实验性 segment_renders

当前代码里已经有一段实验性的增量渲染能力：

```text
apps/api/app/incremental_render.py
```

特点：

```text
使用进程内 daemon thread。
分片长度为 30_000ms。
path patch 接收后，可能触发之前完整分片的渲染。
patch 修改到已有 completed/rendering 分片时，会尝试取消并标记 cancelled。
GET /api/cut-sessions/:sessionId/segment-renders 可查看 segment 状态。
render-test 会优先复用 completed segment 文件。
```

当前它仍应视为实验代码，不是生产队列：

```text
没有跨进程任务管理。
没有持久 worker。
没有重试策略。
没有最终 concat 正式任务。
没有基于 ViewPathTimeline 的 RenderSlice 规划。
与 effect_events 的连接还需要单独验收。
```

## 当前缺口

timeline 方向的主要缺口：

```text
没有把 raw patch log 重新编译成 versioned ViewPathTimeline snapshot。
没有持久化 ViewPathTimeline。
没有 TimelineBuildReport 表或下载文件。
render-test 没有读取 ViewPathTimeline。
segment render 还没有基于 outputMs 和 editSegments 做 RenderSlice。
ViewPathPatch 缺少 replaceRange 和 points 范围强校验。
pathRevision / effectRevision 冲突策略未定义。
没有 patchId / clientSeq / baseRevision 等幂等字段。
timelineRevision 还没有和一次 assembler snapshot 严格绑定。
editSegments 当前只支持 enabled=false 跳过、forward、speed=1.0。
还没有快进、慢放、倒放、冻结帧、generated segment 的编译。
```
