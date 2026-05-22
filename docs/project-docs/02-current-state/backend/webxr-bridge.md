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

## 特效事件当前状态

当前后端已有：

```text
effect_event_patches
effect_events
POST /api/cut-sessions/:sessionId/effect-events
```

当前支持事件名：

```text
fadeBlack
fadeOutBlack
fadeInBlack
highlight
```

这已经具备“独立事件时间线”的基础，但还没有完全满足用户自定义名称事件列表。后续需要把自定义名称或标签作为协议字段纳入 EffectEvent，或在 params 中先保存。

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
