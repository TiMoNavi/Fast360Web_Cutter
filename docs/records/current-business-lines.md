# 当前业务线状态与输入输出

> 历史资料提示：本文件保留作为阶段记录。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

这份文档用于代码清洗和后续合并前对齐事实：哪些业务线已经进入最小闭环，哪些是验证工具，哪些还是规划。360 投影和导出问题详见 [`webxr-export-lessons.md`](./webxr-export-lessons.md)，WebXR 播放端组件化详见 [`webxr-playback-stage.md`](./webxr-playback-stage.md)。

## 当前最小闭环

```text
用户注册 / 登录
-> 移动网页上传 360 MP4
-> 创建 WebXR cut session
-> WebXR 测试页生成 ViewPathPatch
-> 后端保存路径点
-> render-test 逐帧 remap 导出 MP4
-> 移动网页查看状态并下载
```

这个闭环用于验证账号、视频、session、路径协议、后端投影和下载链路，不等同于生产级长视频处理。

## 业务线总览

| 业务线 | 当前状态 | 输入 | 输出 | 主要代码 |
| --- | --- | --- | --- | --- |
| 账号与会话 | MVP 可用 | email、password、session cookie | 当前用户、受保护 API 访问 | `apps/api/app/main.py`、`AuthForm.tsx` |
| 视频上传与视频库 | MVP 可用 | 移动网页上传的 MP4 | `videos` 记录、`storage/videos/*`、视频元数据 | `/api/videos/upload`、`VideoUploadForm.tsx` |
| 裁剪 session | MVP 可用 | `videoId`、默认 `ClipEditConfig` | `cut_sessions`、`clip_edit_configs` | `/api/cut-sessions`、`CutSessionControls.tsx` |
| WebXR 播放验证 | 已组件化 | MP4/HLS source URL、WebXR runtime | 360 球幕播放、session 状态 | `MetaWebXrPlayer.tsx`、`VideoSphereScene.ts` |
| WebXR lab 测试 | 已隔离 | sample MP4/HLS、mock-xr、桌面 emulator | smoke 验证、debug log | `WebXrPlaybackLab.tsx` |
| WebXR 路径生成 | 测试闭环可用 | `videoId`、`sessionId`、测试路径参数 | `ViewPathPatch`、`ViewPathPoint[]` | `FixedOrbitRenderButton.tsx` |
| 路径存储与覆盖 | MVP 可用 | `ViewPathPatch.replaceRange`、points | `view_path_patches`、`view_path_points`、dirty minute | `save_patch()` |
| 后端渲染导出 | smoke render 可用 | 源 360 视频、路径点、FOV、enabled/cut | 1280x720 H.264 MP4 export | `render-test`、`apps/api/app/rendering/remap.py` |
| 移动下载与状态 | MVP 可用 | `sessionId`、`exportId` | session 状态、导出状态、下载链接 | `/mobile/videos/[videoId]`、`/mobile/exports/[exportId]` |
| WebXR 真实取景 | 未完成 | 头显姿态、controller、视频播放时间 | 真实低频路径 patch | 待接入 sampler |
| 生产分片队列 | 未完成 | 完整路径时间线、分钟窗口 | minute segment、最终 concat export | 后端规划中 |

## WebXR 播放端当前事实

这次整理后的入口职责：

```text
/xr/hello
真实 Quest / Meta WebXR 播放入口。
默认使用 /api/sample-video。
只显示必要状态：secure context、navigator.xr、immersive-vr、video source、playback state。
不包含 Start Simulator、mock-xr、HLS 切换、debug log、XRWebGLBinding fallback。

/xr/playback-lab
开发和回归测试入口。
包含桌面双眼模拟器、mock-xr=1、MP4/HLS 切换、debug log、XRWebGLBinding fallback。
```

组件边界：

```text
MetaWebXrPlayer
真机 WebXR session 和播放状态。

VideoSphereScene
Three.js renderer/camera/VideoTexture/inside-out sphere。

createMp4VideoSource
直连 MP4 与 Range 播放状态。

createHlsVideoSource
native HLS 或 hls.js attach/destroy/error。

WebXrPlaybackLab
测试容器，不进入生产路径。
```

## 核心业务对象

### User / AuthSession

输入：

```text
email
password
session cookie
```

输出：

```text
users
auth_sessions
受保护 API 的 user_id
```

当前判断：

```text
足够支撑本地 MVP。
还不是生产账号系统，没有邮箱验证、密码重置、严格安全配置。
清洗代码时不要移除 user_id 隔离，因为视频、session、export 已经依赖它。
```

### Video

输入：

```text
上传文件
original_filename
content_type
ffprobe metadata
```

输出：

```text
videos 表记录
storage/videos/{videoId}.mp4
sourceUrl
durationMs / width / height / fps
status=ready_for_xr
```

当前判断：

```text
FastAPI UploadFile 已跑通最小上传。
Uppy / tus-js-client / tusd 是后续大文件上传方向。
sample video / sample stream 已明确属于 fixture，不应成为 WebXR 端独立视频库。
```

### ClipEditConfig

输入：

```text
videoId
sessionId
timelineRevision
output.width / output.height / output.fps
```

输出：

```text
cut_sessions
clip_edit_configs
后端渲染的全局输出约束
```

当前判断：

```text
默认协议目标仍是正式输出规格。
render-test 为了速度可以使用较小输出规格。
后续要区分协议目标规格和 smoke render 临时规格。
```

### ViewPathPatch / ViewPathPoint

输入：

```text
takeId
pathRevision
replaceRange.startMs / endMs / reason
tMs
center.yaw / center.pitch
fov.h / fov.v
enabled
cut
locked
interpolation
transitionMs
input
```

输出：

```text
view_path_patches 原始 patch
view_path_points 展开后的路径时间线
minute_segments dirty 标记
```

当前判断：

```text
这是后续真实 WebXR 取景的核心协议。
当前路径仍主要来自测试按钮，不来自真实头显。
清洗时可以移除过时 demo，但不要弱化 replaceRange 覆盖语义。
```

### PlaybackClientState

输入：

```text
clientTimeMs
videoTimeMs
playbackRate
preview
recording
```

输出：

```text
调试状态和 UI 恢复信息
```

当前判断：

```text
它是体验/调试状态，不是裁剪输入。
不要把 playbackRate、brightness、overlayOpacity 混进后端导出结果。
```

### Export

输入：

```text
sessionId
源视频文件
最终 ViewPathPoint 时间线
enabled/cut 有效区间
```

输出：

```text
exports 表记录
storage/exports/{exportId}.mp4
GET /api/exports/:exportId
GET /api/exports/:exportId/download
```

当前判断：

```text
当前 export 是同步 smoke render。
render-test 已从 chunked v360 改为逐帧 OpenCV remap。
还没有正式 60 秒任务队列、dirty 重渲染和最终 concat。
```

## 跨业务输入输出

### 移动端 -> 后端

输入：

```text
登录/注册表单
上传 MP4 文件
创建 session 的默认 ClipEditConfig
下载 export 的 exportId
```

输出：

```text
当前用户
视频列表和视频详情
WebXR session 链接
session/export 状态
MP4 下载
```

边界：

```text
移动端不生成 ViewPathPatch。
移动端不做 360 裁剪。
移动端是素材入口和结果出口。
```

### WebXR 端 -> 后端

输入：

```text
videoId
sessionId
ClipEditConfig
ViewPathPatch
PlaybackClientState
```

输出：

```text
路径保存结果
render-test exportId
session 状态
下载链接或回到移动端查看
```

边界：

```text
WebXR 端是唯一裁剪入口。
真实头显姿态后续应转换成低频 ViewPathPoint，而不是逐帧写库。
WebXR 不直接生成最终 MP4。
```

### 后端 -> 移动端 / WebXR 端

输入：

```text
videos
cut_sessions
clip_edit_configs
view_path_points
exports
```

输出：

```text
视频元数据
session 状态
minute 状态
export 状态
下载文件
```

边界：

```text
后端是唯一正式裁剪和导出入口。
当前 render-test 是同步开发接口。
生产路径应改成队列化 60 秒分片。
```

## 清洗代码时应保留的合同

```text
同一用户系统。
同一 videos 表。
同一 cut_sessions 表。
同一 exports 表。
ClipEditConfig + ViewPathPatch 是正式裁剪输入。
PlaybackClientState 不参与正式裁剪。
replaceRange 使用 [startMs, endMs) 覆盖旧点。
enabled=false 区间不进入导出。
cut=true 作为切段边界。
render-test 当前使用逐帧 remap，不再使用 sendcmd + v360。
标准网格素材用于投影回归。
```

## 可清洗候选

```text
把真实播放、桌面 lab、未来取景 sampler 继续保持隔离。
把 sample video / sample stream 路由和真实上传视频路由标注清楚。
把 smoke render 输出规格集中成常量，避免和 ClipEditConfig 的生产目标规格混淆。
继续检查 README 和 spec 中是否还有 FFmpeg v360 主路径旧表述。
旧 chunked/dynamic v360 只作为历史对照或调试 helper。
```

## 暂时不建议清洗掉

```text
FixedOrbitRenderButton 的测试路径能力：它仍是端到端回归入口。
equirect-grid.mp4 / equirect-grid.png：它们是投影正确性的标准素材。
replaceRange、enabled、cut、locked 字段：它们是后续真实头显路径的核心语义。
interpolation、transitionMs 字段：用于表达不连续视角变化的后端补帧策略。
legacy demo user 兼容逻辑：除非同时做数据迁移。
```
