# 后端规格与当前实现

> 历史资料提示：本文件保留作为旧阶段后端规格材料。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

这份文档描述当前 `apps/api` 后端的真实实现状态，并把后续规划单独列出。后端仍然是唯一正式裁剪入口，但当前已落地的是上传、协议存储、同步 smoke render 和下载闭环；生产级 60 秒分片队列还没有实现。

## 当前定位

```text
接收登录用户上传的 360 视频
保存视频元数据和本地源文件
创建 WebXR 裁剪 session
保存 ClipEditConfig
接收 ViewPathPatch 并维护可覆盖的取景路径时间线
接收 EffectEventsPatch 并维护效果事件时间线
提供同步 render-test，用于短视频 smoke render
保存 export 状态并提供 MP4 下载
```

当前后端不承担：

```text
生产级异步任务队列
正式 60 秒分片渲染
dirty 分片重渲染队列
tusd 断点续传
对象存储
PlaybackClientState 持久化
```

## 技术栈

当前实现：

```text
API：FastAPI
数据模型：Pydantic v2
数据库：SQLite
文件存储：本地 storage 目录
认证：tid_session HTTP-only cookie
上传：FastAPI UploadFile
metadata：ffprobe，失败时回落 placeholder
渲染：OpenCV remap + NumPy + FFmpeg 解码/编码
```

后续规划：

```text
任务队列：RQ / Redis 或同类队列
上传：tusd / tus-js-client / Uppy
数据库：PostgreSQL
对象存储：S3 兼容存储
渲染优化：PyAV、map 缓存或 GPU 投影
```

## 运行与存储

运行命令：

```powershell
npm run dev:api
npm run check:api
```

等价启动：

```powershell
python -m uvicorn app.main:app --reload --app-dir apps/api
```

本地目录：

```text
storage/app.db
SQLite 数据库。

storage/videos
上传的源视频文件。

storage/exports
render-test 生成的 MP4。

storage/tmp
渲染临时目录。

storage/sample-videos
本地样片目录。
```

关键环境变量：

```text
VIDEO_UPLOAD_MAX_BYTES
上传大小上限，默认 2GB。

SESSION_COOKIE_SECURE
设为 1 / true / yes 时，tid_session cookie 使用 secure。
```

## 数据库表

当前 `init_storage()` 会创建并轻量补列以下表：

```text
users
用户账号，保存 email、password_hash、password_salt。

auth_sessions
登录会话，tid_session cookie 指向这里。

videos
上传视频记录，包含 user_id、original_filename、stored_filename、content_type、file_size、duration_ms、width、height、fps、metadata_json、status。

cut_sessions
某个 video 的一次 WebXR 裁剪 session，包含 status 和 timeline_revision。

clip_edit_configs
每个 session 的 ClipEditConfig JSON。

view_path_patches
WebXR 上传的原始 ViewPathPatch JSON。

view_path_points
按 replaceRange 展开的最终取景路径点时间线。

effect_event_patches
WebXR 上传的原始 EffectEventsPatch JSON。

effect_events
按 replaceRange 展开的效果事件时间线。

minute_segments
按分钟记录渲染状态。当前由 path/effect patch 标记 dirty，由 render-test 标记 done/failed。

exports
导出记录，包含 status、file_path、error_message。
```

注意：当前没有 `playback_states` 表。`POST /api/cut-sessions/:sessionId/playback-state` 只做请求验收和鉴权，不持久化。

## 认证与权限

已实现接口：

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

规则：

```text
email 会 trim + lowercase。
密码长度至少 6。
密码使用 PBKDF2-HMAC-SHA256 和随机 salt。
登录成功后写入 auth_sessions，并设置 tid_session cookie。
视频、session、export 都按 user_id 隔离。
```

未实现：

```text
邮箱验证
密码重置
角色权限
生产级安全策略
```

## 视频上传

接口：

```text
POST /api/videos/upload
GET  /api/videos
GET  /api/videos/:videoId
```

上传规则：

```text
必须登录。
支持后缀：.mp4、.mov、.m4v、.webm、.mkv。
content-type 允许 video/* 或 application/octet-stream。
空文件会被拒绝。
超过 VIDEO_UPLOAD_MAX_BYTES 会返回 413。
写文件或数据库失败时，会清理已经写入的目标文件。
```

上传成功后：

```text
文件保存为 storage/videos/{videoId}{suffix}
videos.status = ready_for_xr
metadata 优先来自 ffprobe
sourceUrl 返回 /media/{stored_filename}
```

`GET /api/videos/:videoId` 当前会附带：

```text
latestSession
latestExport
```

## 裁剪 Session 与配置

接口：

```text
POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/abandon
GET  /api/cut-sessions/:sessionId/status
```

`POST /api/cut-sessions` 接收 `ClipEditConfig`，当前默认协议为：

```text
version = 1
source = webxr
output.aspect = 16:9
output.width = 1920
output.height = 1080
output.fps = 30
```

创建 session 时会校验 video 属于当前用户。重复提交同一个 sessionId 时，会通过 SQLite upsert 更新 session 和 config。

`abandon` 当前只把 `cut_sessions.status` 改为 `abandoned`，还没有级联取消渲染任务，因为正式任务队列尚未实现。

## ViewPathPatch

接口：

```text
POST /api/cut-sessions/:sessionId/path-patches
```

当前已实现：

```text
校验 route sessionId 与 body sessionId 一致。
校验 session 属于当前用户。
保存原始 patch 到 view_path_patches。
按 [replaceRange.startMs, replaceRange.endMs) 删除同 session 旧 view_path_points。
写入当前 patch.points。
把受影响 minute_segments 标记为 dirty。
```

覆盖语义必须依赖 `replaceRange`，不能依赖 `tMs` 完全相等。当前删除范围使用半开区间 `[startMs, endMs)`，避免误删下一段起点。

当前缺口：

```text
还没有校验 replaceRange.startMs < replaceRange.endMs。
还没有校验 points 全部落在 replaceRange 内。
还没有校验 pathRevision 单调递增或定义冲突策略。
dirty 只更新状态，还没有触发重渲染队列。
```

## EffectEventsPatch

接口：

```text
POST /api/cut-sessions/:sessionId/effect-events
```

当前支持的效果事件：

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

当前已实现：

```text
校验 route sessionId 与 body sessionId 一致。
校验 replaceRange.startMs < replaceRange.endMs。
校验每个 event.startMs < event.endMs。
校验每个 event 都落在 replaceRange 内。
保存原始 patch 到 effect_event_patches。
删除与 replaceRange 重叠的旧 effect_events。
写入当前 patch.events。
把受影响 minute_segments 标记为 dirty。
render-test 会读取 enabled=true 的效果事件并逐帧应用。
```

注意：效果事件和取景路径是两条独立时间线。正式裁剪输入仍以 `ClipEditConfig + ViewPathPatch/ViewPathPoint + EffectEventsPatch/EffectEvent` 为准，不读取前端临时 UI 状态。

## PlaybackClientState

接口：

```text
POST /api/cut-sessions/:sessionId/playback-state
```

当前只做：

```text
校验 route sessionId 与 body sessionId 一致。
校验 session 属于当前用户。
返回 accepted。
```

它不参与正式裁剪，也不会影响 export。

## render-test

接口：

```text
POST /api/cut-sessions/:sessionId/render-test
```

这是同步开发接口，不是生产导出管线。

当前行为：

```text
创建 exports 记录，状态置为 rendering。
读取当前 session 的所有 view_path_points。
读取 0 到 60 秒内的 effect_events。
最多渲染 60 秒。
输出固定为 1280x720、30fps、H.264 MP4。
按 enabled=false 排除区间。
按 cut=true 或 enabled 状态变化拆分片段。
支持 fast transition 展开和 yaw / pitch / FOV 速率限制。
逐帧执行 equirectangular -> flat remap。
逐帧应用 fade/highlight 等效果。
多段输出时重新 concat/reencode。
成功后 export.status = ready，session.status = export_ready。
失败后 export.status = failed，session.status = failed。
成功会把渲染范围内 minute_segments 标记 done，失败会标记 failed。
```

限制：

```text
同步执行，长视频会阻塞请求。
输出规格低于 ClipEditConfig 的 1920x1080 目标。
只覆盖 smoke render，不代表最终生产质量。
没有队列、重试、并发控制和生产级 concat。
```

## 导出与下载

接口：

```text
GET /api/exports/:exportId
GET /api/exports/:exportId/download
```

`GET /api/exports/:exportId` 返回：

```text
exportId
sessionId
status
downloadReady
errorMessage
createdAt
updatedAt
```

下载规则：

```text
必须登录。
export 必须属于当前用户。
export.status 必须为 ready。
file_path 必须解析到 storage/exports 内的真实文件。
响应 media_type = video/mp4。
响应 Cache-Control = private, no-store。
```

## 状态接口

`GET /api/cut-sessions/:sessionId/status` 当前返回：

```text
sessionStatus
videoId
exportId
minuteStatuses[]
completedCount
dirtyCount
discardedCount
failedCount
downloadReady
```

`minuteStatuses[]` 包含：

```text
minuteIndex
startMs
endMs
status
updatedAt
```

当前计数逻辑已覆盖 `ready`、`rendering`、`done`、`dirty`、`discarded`、`failed`，但响应里还没有单独暴露 readyCount / renderingCount。

## 当前验收状态

已完成：

```text
注册、登录、当前用户、登出。
cookie 会话保护 video / session / export。
真实视频上传到本地 storage/videos。
ffprobe 元数据读取和 fallback。
视频列表和视频详情。
创建、读取、更新 cut session config。
保存 ViewPathPatch，并按 replaceRange 覆盖 view_path_points。
保存 EffectEventsPatch，并按 replaceRange 覆盖 effect_events。
session 状态读取。
同步 render-test。
export 状态读取和下载。
本地 CORS 支持 http://localhost:3000 / http://127.0.0.1:3000。
```

部分完成：

```text
minute_segments 已有状态表，但还不是正式 60 秒任务队列。
dirty 标记已落库，但还不会自动重渲染。
OpenCV remap 已可用，但还没有生产级性能优化。
用户隔离已具备 MVP 形态，但生产安全能力不足。
```

未开始：

```text
tusd 断点续传。
轻量 migration 版本管理。
ready 条件判断和分钟边界点补齐。
60 秒分片任务创建和 worker。
dirty 分片重渲染。
最终 concat 导出管线。
PlaybackClientState 持久化日志。
对象存储。
```

## 下一步优先级

1. 补齐数据库演进机制，避免后续 schema 改动依赖删库。
2. 强化 `ViewPathPatch` 校验：replaceRange、points 范围、pathRevision 冲突策略。
3. 完善状态响应：ready/rendering 计数、失败原因、abandon 后级联状态。
4. 把 `render-test` 拆成可排队的渲染任务骨架。
5. 实现 60 秒分片 ready 判断、边界点补齐、dirty 重渲染和最终 concat。
6. 上传链路从 `UploadFile` 升级到 Uppy / tus-js-client / tusd。
