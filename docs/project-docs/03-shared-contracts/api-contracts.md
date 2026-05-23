# API 合同

## 认证

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

当前规则：

```text
email trim + lowercase。
密码至少 6 位。
使用 PBKDF2-HMAC-SHA256。
登录成功写入 tid_session cookie。
```

## 视频

```text
GET  /api/videos
POST /api/videos/upload
GET  /api/videos/:videoId
```

`POST /api/videos/upload` 当前：

```text
必须登录。
使用 FastAPI UploadFile。
支持 .mp4 / .mov / .m4v / .webm / .mkv。
默认大小上限 2GB。
上传后保存到 storage/videos。
写入 videos。
status = ready_for_xr。
```

`GET /api/videos/:videoId` 当前会返回：

```text
视频 metadata。
sourceUrl。
latestSession。
latestExport。
```

## Cut Session

```text
POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/abandon
GET  /api/cut-sessions/:sessionId/status
```

`POST /api/cut-sessions`：

```text
输入 ClipEditConfig。
校验 video 属于当前用户。
创建或 upsert cut_sessions。
保存 clip_edit_configs。
```

`POST /api/cut-sessions/:sessionId/abandon` 当前：

```text
把 cut_sessions.status 改为 abandoned。
尚未级联取消生产队列，因为队列还没有实现。
```

## ViewPathPatch

```text
POST /api/cut-sessions/:sessionId/path-patches
```

当前已实现：

```text
校验 route sessionId 与 body sessionId 一致。
校验 session 属于当前用户。
保存原始 patch 到 view_path_patches。
按 [replaceRange.startMs, replaceRange.endMs) 删除旧 view_path_points。
写入当前 points。
把受影响 minute_segments 标记 dirty。
```

当前缺口：

```text
还需要强校验 replaceRange.startMs < replaceRange.endMs。
还需要校验 points 全部落在 replaceRange 内。
还需要定义 pathRevision 冲突策略。
还需要限制每分钟点数。
```

## EffectEventsPatch

```text
POST /api/cut-sessions/:sessionId/effect-events
```

当前已实现：

```text
校验 route sessionId 与 body sessionId 一致。
校验 replaceRange.startMs < replaceRange.endMs。
校验 event.startMs < event.endMs。
校验事件落在 replaceRange 内。
保存原始 patch。
删除重叠旧事件。
写入当前事件。
把受影响 minute_segments 标记 dirty。
```

目标语义：

```text
除了当前固定 eventName，后续还应支持自由事件名或标签。
用户可以标记 startMs 到 endMs 的时间范围。
事件可以先作为后处理标记保存，不要求立即参与 render-test。
eventName / type 应是机器可读字符串，例如 black.solid、transition.fade_black、overlay.text。
displayName 或 params.label 可保存中文展示名。
未知事件名应按 renderPolicy.fallback = ignore / warn / fail 处理。
```

示例：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "effectRevision": 7,
  "replaceRange": {
    "startMs": 10000,
    "endMs": 11200,
    "reason": "effect"
  },
  "events": [
    {
      "seq": 1,
      "type": "black.solid",
      "displayName": "黑场",
      "startMs": 10000,
      "endMs": 11200,
      "enabled": true,
      "params": {
        "color": "#000000",
        "opacity": 1.0
      },
      "renderPolicy": {
        "fallback": "warn",
        "requires": []
      }
    }
  ]
}
```

完整效果接入说明见：

```text
03-shared-contracts/effect-events.md
```

## MusicTracks / SessionMusic

```text
GET  /api/music-tracks
POST /api/music-tracks/upload
GET  /api/music-tracks/:musicId/download

GET  /api/cut-sessions/:sessionId/music
PUT  /api/cut-sessions/:sessionId/music
```

第一版音乐控制：

```text
用户上传音乐文件到 music_tracks。
session_music 只选择一首 musicId。
startMs 只支持 0。
render-test 导出时把音乐从成片开头混入。
音乐长于成片时裁掉，短于成片时补静音。
```

Session 音乐配置：

```json
{
  "musicId": "music_123",
  "enabled": true,
  "startMs": 0,
  "gainDb": -10.0
}
```

详细协议见：

```text
03-shared-contracts/audio-tracks.md
```

## PlaybackClientState

```text
POST /api/cut-sessions/:sessionId/playback-state
```

当前行为：

```text
校验 route sessionId 与 body sessionId 一致。
校验 session 属于当前用户。
返回 accepted。
不持久化。
不参与导出。
```

## render-test

```text
POST /api/cut-sessions/:sessionId/render-test
```

当前行为：

```text
同步开发接口。
读取 view_path_points。
读取 effect_events。
最多渲染 60 秒。
输出 1280x720 / 30fps / H.264 MP4。
成功后 export.status = ready。
失败后 export.status = failed。
```

注意：

```text
render-test 不是生产导出 API。
生产导出应改成任务队列。
```

## Export

```text
GET /api/exports/:exportId
GET /api/exports/:exportId/download
```

下载要求：

```text
必须登录。
export 属于当前用户。
export.status = ready。
file_path 位于 storage/exports。
返回 video/mp4。
Cache-Control = private, no-store。
```

## Web 前端 API client

当前共享 API client 位于：

```text
apps/web/src/lib/api.ts
```

路径协议类型位于：

```text
apps/web/src/lib/path-protocol.ts
```

短期可以由 Web 和 WebXR 共享这两个文件，但不应通过共享 React 组件造成业务耦合。
