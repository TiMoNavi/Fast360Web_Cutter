# 后端规划

## 定位

后端是唯一正式裁剪入口。它负责接收视频、保存全局剪辑参数、维护取景路径时间线、按 60 秒切片裁剪、合成最终 MP4。

```text
接收安卓端上传的 360 视频
创建裁剪 session
接收 ClipEditConfig
接收 ViewPathPatch
维护可覆盖的路径时间线
按 60 秒分片渲染
导出最终 MP4
提供下载
```

## 技术选型

```text
API：FastAPI
数据模型：Pydantic
数据库：PostgreSQL 或 SQLite MVP
任务队列：RQ + Redis
上传：tusd 或 FastAPI UploadFile MVP
对象存储：本地文件 MVP，后续 S3 兼容对象存储
裁剪：FFmpeg v360 主路径
动态逐帧 fallback：PyAV + OpenCV remap
```

MVP 推荐：

```text
FastAPI + Pydantic + SQLite + 本地文件 + RQ + FFmpeg v360
```

## 可利用的开源项目

直接使用：

```text
FastAPI：
API 服务、上传接口、状态查询接口。

Pydantic：
定义 ClipEditConfig、ViewPathPatch、PlaybackClientState 请求模型。

RQ + Redis：
MVP 任务队列，处理 60 秒分片裁剪和 dirty 重渲染。

FFmpeg v360：
正式裁剪主路径，完成 equirectangular 到 perspective 投影。
```

上传方案：

```text
tusd：
推荐用于大文件断点续传，和安卓端 tus-js-client / Uppy 配合。

FastAPI UploadFile：
MVP 可用，但不适合长期承载大体积手机网络上传。
```

参考或 fallback：

```text
PyAV：
Python 侧解码/编码绑定，用于逐帧 fallback。

OpenCV remap：
用于动态路径逐帧投影。

py360convert：
参考 equirectangular 到 perspective 的数学实现。
```

注意：

```text
FFmpeg 编译选项会影响 LGPL/GPL 合规，正式发布前必须确认。
参考项目代码不能直接复制进产品，除非许可证允许且保留必要声明。
```

## 共享数据库设计

安卓端网页、WebXR 端和后端共用同一个数据库。推荐第一版用 SQLite 快速开发，产品化切 PostgreSQL。

核心表：

```text
users：
用户身份。MVP 可用匿名用户或固定 demo 用户。

videos：
上传视频记录。安卓端写入，WebXR 端读取，后端裁剪读取。

cut_sessions：
某个 video 的一次 WebXR 裁剪 session。

clip_edit_configs：
每个 session 的全局剪辑参数。

view_path_patches：
WebXR 上传的原始 patch。

view_path_points：
后端展开后的最终路径点时间线，支持 replaceRange 覆盖。

playback_states：
WebXR 播放状态日志，不参与正式裁剪。

minute_segments：
60 秒分片渲染状态和 segment 文件地址。

exports：
最终导出结果。
```

关键关系：

```text
users 1 -> n videos
videos 1 -> n cut_sessions
cut_sessions 1 -> 1 clip_edit_configs
cut_sessions 1 -> n view_path_patches
cut_sessions 1 -> n minute_segments
cut_sessions 1 -> n exports
```

共享约束：

```text
安卓端上传完成后必须创建 videos 记录。
WebXR 端只能裁剪 videos 表中已有的视频。
WebXR 端上传路径必须绑定 cut_sessions.sessionId。
后端状态接口必须同时服务安卓端和 WebXR 端。
```

## 核心数据

后端正式裁剪只读取：

```text
ClipEditConfig
ViewPathPatch / ViewPathPoint
原始视频文件
```

后端不使用：

```text
PlaybackClientState 做正式裁剪
安卓端任何裁剪数据
前端录屏结果作为主路径
```

## 建议字段

videos：

```text
id
user_id
original_filename
storage_path
mime_type
size_bytes
duration_ms
width
height
fps
projection_type
status
created_at
updated_at
```

cut_sessions：

```text
id
video_id
user_id
status
active_export_id
created_at
updated_at
abandoned_at
```

view_path_patches：

```text
id
session_id
take_id
path_revision
replace_start_ms
replace_end_ms
reason
raw_json
created_at
```

minute_segments：

```text
id
session_id
minute_index
start_ms
end_ms
status
segment_path
error_message
render_revision
updated_at
```

exports：

```text
id
session_id
status
output_path
width
height
fps
duration_ms
created_at
completed_at
```

## 路径时间线维护

收到 `ViewPathPatch` 后：

```text
1. 校验 videoId / sessionId / pathRevision。
2. 校验 replaceRange.startMs < replaceRange.endMs。
3. 校验 points 全部落在 replaceRange 内。
4. 废弃同 session 中与 replaceRange 重叠的旧路径点。
5. 写入新 points。
6. 重建受影响分钟的路径索引。
7. 如果受影响分钟已经 done，标记为 dirty。
```

覆盖不能依赖 `tMs` 完全相等，必须依赖 `replaceRange`。

## 分片裁剪

后端固定 60 秒分片：

```text
minuteIndex = floor(tMs / 60000)
minute 0 = 0s 到 60s
minute 1 = 60s 到 120s
```

分钟状态：

```text
collecting
ready
rendering
done
dirty
failed
discarded
```

ready 条件：

```text
路径覆盖 minuteStart 到 minuteEnd。
replaceRange 覆盖已处理完成。
minuteStart / minuteEnd 边界点已补齐。
至少存在 enabled=true 的有效区间。
```

全部 `enabled=false` 的分钟标记为 `discarded`。

## 裁剪管线

第一阶段主路径：

```text
读取 60 秒源视频窗口
读取该分钟最终 ViewPathPoint 时间线
排除 enabled=false 区间
按 cut=true 分段
对 enabled=true 连续区间生成 yaw / pitch / FOV 曲线
使用 FFmpeg v360 导出 segment
写入 segment 状态
最终 concat 完整 MP4
```

如果 FFmpeg 动态路径表达不够稳定：

```text
使用更短子段近似路径。
或 fallback 到 PyAV 解码 + OpenCV remap 逐帧投影 + FFmpeg 编码。
```

## API

视频：

```text
POST /api/videos/upload
GET  /api/videos
GET  /api/videos/:videoId
```

裁剪 session：

```text
POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
GET  /api/cut-sessions/:sessionId/status
```

导出：

```text
GET /api/exports/:exportId/download
```

`playback-state` 只用于调试和恢复 UI，不触发正式裁剪。

## API 响应约定

`GET /api/videos/:videoId` 必须同时满足安卓端和 WebXR 端：

```text
视频元数据
源文件可播放 URL
最近 cutSession
最新 export
是否 ready_for_xr
```

`GET /api/cut-sessions/:sessionId/status` 必须同时满足安卓端和 WebXR 端：

```text
session 状态
分钟状态
dirty 分片数量
失败原因
下载是否可用
```

## 任务队列

任务类型：

```text
render_minute_segment
rerender_dirty_segment
concat_export
cleanup_abandoned_session
probe_video_metadata
```

资源约束：

```text
同一视频同一分钟只允许一个 rendering job。
dirty 分片重新渲染成功后替换旧 segment。
失败只影响当前分钟或当前有效区间。
worker 并发数量必须可配置。
```

## 状态返回

`GET /api/cut-sessions/:sessionId/status` 返回：

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

安卓端和 WebXR 端都从这个接口读进度。

## MVP 验收

```text
能接收并保存 360 MP4。
安卓端和 WebXR 端能从同一 videos 表读取该视频。
能创建裁剪 session。
能保存 ClipEditConfig。
能接收 ViewPathPatch。
replaceRange 能覆盖旧路径点，即使 tMs 不完全一致。
收到覆盖已完成分钟的 patch 后，该分钟变 dirty。
能按 60 秒分片创建裁剪任务。
enabled=false 区间不会进入导出。
cut=true 不跨点插值。
能生成固定 16:9、1920x1080、30fps MP4。
某一分钟失败不阻止其他分钟继续处理。
最终 MP4 可以下载。
```
