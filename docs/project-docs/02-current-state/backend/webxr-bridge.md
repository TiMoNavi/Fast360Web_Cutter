# WebXR 桥接模块当前状态

## 已实现接口

```text
POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/effect-events
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
GET  /api/cut-sessions/:sessionId/status
```

## 已实现能力

```text
创建 cut session。
保存 ClipEditConfig。
接收 ViewPathPatch。
校验 route sessionId 与 body sessionId 一致。
校验 session 属于当前用户。
保存原始 patch。
按 [replaceRange.startMs, replaceRange.endMs) 删除旧 view_path_points。
写入当前 points。
把受影响 minute_segments 标记 dirty。
接收 EffectEventsPatch。
保存效果事件时间线。
PlaybackClientState 只验收不持久化。
abandon 会把 session 状态改为 abandoned。
```

## 当前协议命名

当前代码已经使用 `ViewPathPatch / ViewPathPoint` 表达 WebXR 回传的取景剪辑意图。这里的点不是严格意义上的眼动“注视点”，而是由 head-gaze 或 controller ray 推导出的取景路径点：

```text
ViewPathPoint.center.yaw / center.pitch：
导出画面的取景中心。

ViewPathPoint.fov.h / fov.v：
虚拟相机 FOV。

ViewPathPoint.enabled：
保留或放弃某段的状态边界。

ViewPathPoint.cut：
新镜头边界。

ViewPathPoint.input：
head_gaze 或 controller_ray。
```

播放状态仍由 `PlaybackClientState` 表达。当前接口只验收，不写入 `playback_states` 表，也不影响导出。

## 特效事件当前状态

当前后端已有：

```text
effect_event_patches
effect_events
POST /api/cut-sessions/:sessionId/effect-events
```

当前支持事件名：

```text
highlight
black.solid
transition.fade_black
transition.flash_white
filter.color_grade
filter.blur
filter.vignette
filter.chromatic_aberration
overlay.letterbox
overlay.text
```

这已经具备“独立事件时间线”的基础，但还没有完全满足用户自定义名称事件列表。后续需要把自定义名称或标签作为协议字段纳入 EffectEvent，或在 params 中先保存。

目标协议应支持自由事件名，例如：

```text
black.solid
transition.fade_black
transition.cross_dissolve
overlay.text
filter.blur
custom.customer_event
```

当前代码已放开 Pydantic 模型和 Web 端 TypeScript 类型，可以接收自由事件名，并为未知事件名保留 `renderPolicy.fallback`。渲染器当前只实际处理已实现的效果，未知效果默认不参与画面计算。

新增效果的开发手册见：

```text
docs/project-docs/03-shared-contracts/effect-events.md
```

## Timeline Assembler 当前起点

当前代码已新增一个纯 Python 起点：

```text
apps/api/app/timeline_assembler.py
```

它可以把线性 `ViewPathPoint` 字典和效果事件字典编译成 `ViewPathTimeline` 字典，包含：

```text
editSegments
viewTracks
effectTracks
coverage.gaps
build.warnings
```

当前能力仍然是第一步：

```text
支持 enabled=false 跳过区间。
支持按 source 时间生成 forward / speed=1.0 的 editSegments。
支持把 effect events 透传成 effectTracks。
支持检测点间缺口并标记 ready / partial / not_ready。
尚未接 HTTP 导出接口。
尚未支持快进、慢放、倒放等时间变速意图的编译。
尚未把 assembler 接入 render-test。
```

## Timeline Review Fixtures

当前已新增一组可观看验证样例：

```text
scripts/render_timeline_review_cases.py
storage/exports/timeline-review/index.html
```

这些样例使用 `storage/sample-videos/equirect-grid.mp4` 作为 360 网格源素材，覆盖：

```text
水平 yaw 90 度。
垂直 pitch 90 度。
斜向 yaw + pitch 90 度。
90 度跳跃并通过 fast transition 补中间帧。
黑场转场。
enabled=false 放弃中间片段。
自由事件名 black.solid / transition.fade_black。
```

每个样例都会生成：

```text
*.mp4
*.timeline.json
```

重新生成：

```powershell
python scripts/render_timeline_review_cases.py
```

## 当前代码位置

```text
apps/api/app/main.py
create_cut_session、get_cut_session、update_cut_session_config、receive_path_patch、receive_effect_events_patch、receive_playback_state、abandon_cut_session、get_cut_session_status。

apps/api/app/storage.py
save_clip_config、save_patch、save_effect_events_patch、mark_minutes、list_effect_events。

apps/api/app/models.py
ClipEditConfig、ViewPathPatch、ViewPathPoint、EffectEventsPatch、EffectEvent、PlaybackClientState、SessionStatus。
```

## 当前缺口

```text
WebXR 桥接逻辑还没有从 main.py / storage.py 拆出。
ViewPathPatch 还没有完整校验 replaceRange.startMs < replaceRange.endMs。
还没有校验 points 全部落在 replaceRange 内。
pathRevision 冲突策略未定义。
PlaybackClientState 不持久化。
自定义名称的特效事件还没有正式协议字段。
dirty 只标记，不触发队列。
```
