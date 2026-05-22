# 黑盒业务边界架构

> 历史资料提示：本文件保留作为旧阶段边界材料。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

这份文档描述当前项目的业务边界。目标是让移动端、WebXR 端、后端 API、后端渲染器各自成为可替换的黑盒，只通过协议和文件/API 交互。

## 总原则

```text
移动端不知道 WebXR 如何取景。
WebXR 端不知道移动端如何上传和展示下载。
后端 API 不知道前端组件内部状态。
渲染器不知道页面、账号和 UI，只接收源视频与路径时间线，输出 MP4。
```

允许的依赖方向：

```text
Mobile Web  -> Backend API
WebXR Web   -> Backend API
Backend API -> DB / File Storage / Renderer
Renderer    -> File Storage
```

不允许的依赖方向：

```text
Mobile Web  -> WebXR 组件函数
WebXR Web   -> Mobile 页面状态
Frontend    -> 数据库
Renderer    -> 前端页面状态
Backend     -> 前端组件内部变量
```

## 当前状态判断

方向基本正确，但仍处在整理期。

已经符合边界的部分：

```text
移动端通过 API 注册、登录、上传、读取视频、创建 session、下载 export。
WebXR 业务页通过 API 读取 videoId/sessionId，提交 ViewPathPatch，触发 render-test。
后端通过数据库和文件路径组织 videos、sessions、path、exports。
后端渲染只读取 ViewPathPoint 时间线，不依赖 WebXR 页面运行状态。
逐帧 remap 已经从旧的 FFmpeg dynamic v360 方案中独立出来。
```

这次已经改善的部分：

```text
HelloWebXR 不再是实验大杂烩。
/xr/hello 已收敛为 Quest / Meta WebXR 真机播放入口。
/xr/playback-lab 承接桌面模拟、mock-xr、HLS 切换、debug log 和 emulator fallback。
MP4 与 HLS source 分开实现，并统一输出 HTMLVideoElement。
VideoSphereScene 独立封装 Three.js 360 球幕。
XRWebGLBinding fallback 只留在 lab，不进入真机路径。
```

仍需继续清晰化的部分：

```text
Mobile 和 WebXR 仍在同一个 Next.js app 中，需避免组件互相 import。
/xr/videos/:videoId/session/:sessionId 还没有接入真实 MetaWebXrPlayer。
sample-video / sample-stream 是 fixture，不能和真实上传视频入口混淆。
render-test 仍是同步开发接口，生产路径需要任务队列和分片状态。
```

## 四个黑盒

### 1. 移动端素材与结果端

职责：

```text
注册 / 登录
上传 360 视频
查看我的视频
创建或进入 WebXR session
查看 session/export 状态
下载导出 MP4
```

输入：

```text
用户 email / password
本地 MP4 文件
videoId
sessionId
exportId
```

输出：

```text
videos 记录
cut session 创建请求
WebXR 入口 URL
下载请求
```

不能做：

```text
生成 ViewPathPatch
解释 yaw / pitch / FOV
直接访问 view_path_points
调用 WebXR 组件函数
执行 360 裁剪
```

### 2. WebXR 播放与取景端

职责：

```text
播放 360 视频
进入 WebXR / Quest 环境
根据头显和手柄生成取景路径
把路径压缩成低频 ViewPathPatch
提交路径 patch
发起测试导出或查看状态
```

输入：

```text
videoId
sessionId
后端返回的视频 sourceUrl
ClipEditConfig
当前视频播放时间
头显姿态 / controller 输入
```

输出：

```text
ViewPathPatch
PlaybackClientState
render-test 请求
```

不能做：

```text
上传原始视频
直接写数据库
直接生成最终 MP4
依赖移动端页面状态
把每帧头显姿态全部持久化
```

播放端内部再分两条边界：

```text
MetaWebXrPlayer
真机路径，只允许真实 WebXR session 和最小播放状态。

WebXrPlaybackLab
测试路径，只允许桌面模拟、mock、fallback、日志和 source 切换。
```

### 3. 后端 API 与状态端

职责：

```text
认证和授权
接收上传并保存视频文件
维护 videos / cut_sessions / clip_edit_configs
接收和校验 ViewPathPatch
按 replaceRange 维护 view_path_points
维护 minute_segments / exports 状态
调度渲染器
提供下载
```

输入：

```text
HTTP 请求
cookie session
上传文件
ClipEditConfig
ViewPathPatch
render/export 请求
```

输出：

```text
API JSON
数据库记录
storage/videos 文件
storage/exports 文件路径
状态变化
```

不能做：

```text
依赖前端组件内部变量
猜测 WebXR UI 操作意图
把 PlaybackClientState 当成正式裁剪输入
绕过协议读取前端临时数据
```

### 4. 后端渲染器

职责：

```text
读取源 360 视频
读取整理好的视窗序列
按 fps 插值得到每帧 yaw / pitch / FOV
执行 equirectangular -> flat remap
输出 MP4
返回成功/失败和文件路径
```

输入：

```text
sourcePath
targetPath
durationMs
sourceStartMs
fps
outputWidth / outputHeight
RenderPathPoint[]
```

输出：

```text
MP4 文件
渲染错误信息
基本 metadata
```

不能做：

```text
查询前端页面
处理登录态
决定 session 业务状态
修改 ViewPathPatch 原始语义
解释移动端或 WebXR 的 UI 行为
```

## WebXR 播放端组件边界

当前播放端组件化后的允许依赖：

```text
生产/真机路径可以 import：
MetaWebXrPlayer
VideoSphereScene
videoSources
types

生产/真机路径不能 import：
WebXrPlaybackLab
webXrLabCompat
XrDebugLog 默认 UI
mock-xr helper
```

fixture API 边界：

```text
/api/sample-video
/api/sample-stream/[...path]
```

这些只属于开发 fixture。正式视频库应从后端 `videos` 或 `cut_sessions` 元数据获得 URL，再交给 source helper。

## 共享合同

### VideoSummary / VideoDetail

由后端输出给移动端和 WebXR 端：

```text
id
filename
sourceUrl
durationMs
width
height
fps
status
latestSession
latestExport
```

### ClipEditConfig

由前端创建 session 时提交，后端保存：

```text
videoId
sessionId
timelineRevision
output.aspect
output.width
output.height
output.fps
```

### ViewPathPatch

由 WebXR 端提交，后端正式裁剪只依赖它和 ClipEditConfig：

```text
videoId
sessionId
takeId
pathRevision
replaceRange
points[]
```

### ViewPathPoint

```text
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

### ExportStatus

由后端输出给移动端和 WebXR 端：

```text
exportId
sessionId
status
downloadReady
errorMessage
createdAt
updatedAt
```

## 失败隔离

目标不是让每个模块对其他故障完全无感，而是故障通过状态表达，不发生级联崩溃。

建议规则：

```text
上传失败：只影响当前 video，不影响已有视频列表。
WebXR 路径提交失败：只影响当前 patch，不破坏旧路径时间线。
播放 fixture 失败：不影响真实上传视频闭环。
render-test 失败：export.status=failed，session 保持可重试。
下载失败：返回 export missing / not ready，不影响 session 数据。
```

## 清洗方向

短期代码边界：

```text
apps/web/app/mobile/*
移动端登录、上传、列表、详情、下载路由。

apps/web/src/components/*
当前移动端与共享 UI 组件仍集中在这里，后续再按 feature 拆分。

apps/web/src/components/xr/*
WebXR 播放、场景、source、lab 工具。

apps/web/src/lib/api.ts
当前唯一共享的前端 API client。

apps/web/src/lib/path-protocol.ts
当前共享的前端路径协议类型。

apps/api/app/main.py
当前 FastAPI 路由入口。短期可以继续保持单文件，但新增大型能力时再拆分。

apps/api/app/storage.py
当前 SQLite、文件路径、响应组装和轻量存储 helper。需要避免继续塞入渲染算法。

apps/api/app/models.py
当前 Pydantic 协议模型。

apps/api/app/rendering/*
渲染器黑盒，只接收源文件、目标文件、路径点和效果事件。
```

后续拆分目标：

```text
apps/api/app/routes/*
按 auth / videos / cut_sessions / exports 拆路由。

apps/api/app/repositories/*
集中数据库读写。

apps/api/app/contracts/*
集中 Pydantic 协议模型。
```

短期必须保持：

```text
移动端组件不 import WebXR 组件。
WebXR 组件不 import 移动端组件。
两端只共享 API client 和 path-protocol 类型。
sample-video/sample-stream 明确属于 fixture 或 playback-lab。
render-test 调用 rendering.remap 模块，不把渲染逻辑散落在 storage.py。
legacy v360 对照代码只作为历史对照或调试 helper。
```

## 风险

```text
协议不稳定会导致各端一起改。
sample/demo 代码混进正式路径会污染边界。
前端共享组件过多会重新产生隐式耦合。
后端 storage.py 如果同时承担数据库、文件、渲染，会越来越难清洗。
```

下一步重点不是马上拆服务，而是稳定合同，并把代码按合同分层。
