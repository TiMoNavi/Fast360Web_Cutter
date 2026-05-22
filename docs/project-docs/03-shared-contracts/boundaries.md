# 黑盒边界

## 总边界

目标是让每个模块成为可替换的黑盒：

```text
Web 不知道 WebXR 如何取景。
WebXR 不知道 Web 如何上传和展示下载。
Backend API 不知道前端组件内部状态。
Renderer 不知道页面、账号和 UI。
```

允许依赖方向：

```text
Web        -> Backend API
WebXR      -> Backend API
Backend    -> DB / File Storage / Renderer
Renderer   -> File Storage
```

不允许依赖方向：

```text
Web        -> WebXR 组件函数
WebXR      -> Web 页面状态
Frontend   -> 数据库
Renderer   -> 前端页面状态
Backend    -> 前端组件内部变量
```

## Web 黑盒

Web 可以：

```text
登录 / 注册。
上传视频。
读取视频列表。
创建 session。
展示 WebXR 入口。
读取 session/export 状态。
下载 MP4。
```

Web 不可以：

```text
生成 ViewPathPatch。
解释 yaw / pitch / FOV。
直接访问 view_path_points。
调用 WebXR 组件函数。
执行 360 裁剪。
```

## WebXR 黑盒

WebXR 可以：

```text
播放 360 视频。
进入 immersive-vr。
读取 videoId/sessionId/sourceUrl。
根据头显和 controller 生成取景路径。
压缩为低频 ViewPathPatch。
提交 PlaybackClientState。
发起测试导出或查看状态。
```

WebXR 不可以：

```text
上传原始视频。
直接写数据库。
生成最终 MP4。
依赖移动端页面状态。
每帧持久化头显姿态。
把 lab mock 逻辑带进真实 Quest 路径。
```

## Backend API 黑盒

Backend API 可以：

```text
认证和授权。
保存视频文件。
维护 videos / sessions / configs / points / exports。
校验协议。
按 replaceRange 更新路径时间线。
维护 minute segment 状态。
调度渲染器。
提供下载。
```

Backend API 不可以：

```text
依赖前端组件内部变量。
猜测 WebXR UI 操作意图。
把 PlaybackClientState 当成正式裁剪输入。
绕过协议读取前端临时数据。
```

## Renderer 黑盒

Renderer 可以：

```text
读取源视频。
读取整理后的 RenderPathPoint[]。
按 fps 插值 yaw / pitch / FOV。
执行 equirectangular -> flat remap。
应用已整理的效果事件。
输出 MP4。
返回成功或失败。
```

Renderer 不可以：

```text
查询前端页面。
处理登录态。
决定 session 业务状态。
修改 ViewPathPatch 原始语义。
解释 Web 或 WebXR 的 UI 行为。
```

## WebXR 内部边界

真实生产路径可以 import：

```text
MetaWebXrPlayer
VideoSphereScene
videoSources
types
```

真实生产路径不应 import：

```text
WebXrPlaybackLab
webXrLabCompat
XrDebugLog 默认 UI
mock-xr helper
```

## Fixture 边界

开发 fixture：

```text
/api/sample-video
/api/sample-stream/[...path]
```

这些接口只能用于：

```text
播放验证。
smoke 测试。
本地调试。
```

生产视频源应来自：

```text
GET /api/videos/:videoId
GET /api/cut-sessions/:sessionId
```

再把后端返回的 source URL 传给播放层。

## 当前最需要守住的规则

```text
移动端组件不 import WebXR 组件。
WebXR 组件不 import 移动端页面组件。
两端只共享 API client 和协议类型。
sample-video / sample-stream 保持 fixture 身份。
render-test 保持开发接口身份。
正式裁剪输入只来自 ClipEditConfig 和路径/效果时间线。
```
