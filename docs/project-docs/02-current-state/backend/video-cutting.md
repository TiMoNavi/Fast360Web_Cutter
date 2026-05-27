# 视频裁切模块当前状态

## 已实现接口

```text
POST /api/cut-sessions/:sessionId/render-test
GET  /api/cut-sessions/:sessionId/segment-renders
GET  /api/exports/:exportId
GET  /api/exports/:exportId/download
```

`render-test` 是同步开发接口，不是生产队列。

## 当前 render-test 行为

```text
创建 exports 记录。
读取当前 session 的 view_path_points。
读取 0 到 60 秒内 effect_events。
最多渲染 60 秒。
输出 1280x720、30fps、H.264 MP4。
使用 30 秒 segment 窗口。
如果 segment_renders 已有 completed 分片且文件存在，render-test 会复用该分片。
按 enabled=false 排除区间。
按 cut=true 或 enabled 状态变化拆分片段。
执行 equirectangular -> flat remap。
多段输出时 concat/reencode。
如果 session_music 启用，会在视频渲染完成后 mux 一条音乐轨。
成功后 export.status = ready，session.status = export_ready。
失败后 export.status = failed，session.status = failed。
```

## 当前增量分片实验

当前已有一个实验性模块：

```text
apps/api/app/incremental_render.py
```

它的行为：

```text
path patch 接收后，根据 patch.points 的时间范围尝试触发已完整覆盖的 30 秒分片。
使用进程内 daemon thread 执行 segment render。
segment_renders 表记录 rendering / completed / cancelled / failed。
后续 patch 命中已完成或渲染中的分片时，会尝试取消并标记 cancelled。
GET /api/cut-sessions/:sessionId/segment-renders 可以查看分片状态。
```

当前判断：

```text
这是增量渲染方向的代码起点，但还不是生产队列。
它没有跨进程 worker、任务重试、稳定取消、最终 concat 任务和基于 ViewPathTimeline 的 RenderSlice 规划。
```

## 当前渲染管线

当前主路：

```text
FFmpeg 解码源视频为 raw frame。
Python / OpenCV 按每帧 yaw / pitch / FOV 计算 remap。
cv2.remap 生成平面帧。
apply_frame_effects 应用当前支持的效果事件。
FFmpeg 编码输出 MP4。
```

旧的 `sendcmd + v360` 动态方案已经不作为主路，只保留 legacy 对照。

## 当前代码位置

```text
apps/api/app/main.py
render_test、segment_renders 查询和 export 状态更新。

apps/api/app/incremental_render.py
实验性的 30 秒 segment worker。

apps/api/app/rendering/remap.py
逐帧 equirectangular -> flat remap。

apps/api/app/rendering/path_pipeline.py
enabled/cut 分段、路径动态限制、fast transition 展开。

apps/api/app/rendering/effects.py
fade/highlight 等帧效果。

apps/api/app/timeline_assembler.py
当前可以生成 ViewPathTimeline 字典，供 review fixture 和后续文件化渲染使用。

scripts/render_timeline_review_cases.py
生成可观看的 timeline review cases，用于检查取景路径、跳过片段和效果事件是否正确。

apps/api/app/rendering/v360_legacy.py
旧 v360 对照方案。
```

## 当前缺口

```text
没有生产级异步任务队列。
没有基于 outputMs 的 60 秒分片 ready 判断。
只有进程内实验线程，没有生产 worker 并发和重试。
dirty 分片还没有接入稳定重渲染队列。
没有最终 concat 正式任务。
输出规格仍是 smoke render 的 1280x720。
长视频会阻塞请求。
性能还未达到生产级。
render-test 尚未直接读取 ViewPathTimeline 文件。
segment render 尚未基于 editSegments 生成 RenderSlice。
```
