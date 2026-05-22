# Web 当前状态

## 已完成

当前 Web 模块位于：

```text
apps/web
```

已经建立的主要路由：

```text
/mobile/login
登录 / 注册。

/mobile/videos
我的视频和上传入口。

/mobile/videos/:videoId
视频详情、session 创建、状态和下载入口。

/mobile/exports/:exportId
导出详情和下载。

/xr/videos
WebXR 侧视频列表占位。
```

已有组件：

```text
AuthForm
登录 / 注册表单。

VideoUploadForm
最小上传表单。

CutSessionControls
创建 session 并进入 WebXR。

LogoutButton
登出。

FixedOrbitRenderButton
WebXR session 页上的测试路径和 render-test 按钮。
```

## 已接入后端的能力

当前已经接入真实后端：

```text
注册 / 登录 / 登出。
cookie session。
GET /api/auth/me。
GET /api/videos。
POST /api/videos/upload。
GET /api/videos/:videoId。
POST /api/cut-sessions。
GET /api/cut-sessions/:sessionId/status。
GET /api/exports/:exportId。
GET /api/exports/:exportId/download。
```

移动端页面在未登录时会跳转 `/mobile/login`。

## 当前页面状态

`/mobile/videos` 当前可以：

```text
显示当前用户。
上传视频。
展示视频列表。
进入视频详情。
跳转 WebXR 列表。
登出。
```

`/mobile/videos/:videoId` 当前可以：

```text
读取视频详情。
显示原始 JSON metadata。
创建 WebXR session。
进入 /xr/videos/:videoId/session/:sessionId。
读取最新 session 状态。
展示 export 下载入口。
```

这说明业务闭环已存在，但 UI 仍偏开发调试形态。

## 当前上传状态

当前上传使用：

```text
FastAPI UploadFile
FormData
普通一次性上传
```

还没有：

```text
Uppy。
tus-js-client。
断点续传。
上传队列。
细粒度进度。
失败重试 UI。
文件大小和类型的完整前端提示。
```

## 当前缺口

Web 模块主要缺口：

```text
移动端正式 UI 还没有打磨。
视频列表信息密度不足。
视频详情页仍直接展示 JSON。
WebXR 入口二维码未实现。
分钟级进度展示仍粗糙。
放弃 session 操作未接入页面。
上传进度和失败体验不足。
导出详情页还需要更完整的失败原因和返回路径。
```

## 需要继续保持的边界

当前 Web 端没有生成真实 ViewPathPatch，这是正确方向。后续也应保持：

```text
Web 不生成路径。
Web 不解释 yaw / pitch / FOV。
Web 不做手机陀螺仪裁剪。
Web 不执行 360 投影。
Web 只展示状态和入口。
```

## 建议下一步

```text
1. 把 /mobile/videos 和详情页从调试布局改成可用 MVP UI。
2. 在详情页生成 Quest 入口二维码。
3. 把 session 状态从 JSON 改成分钟级进度视图。
4. 增加 abandon session 操作。
5. 上传先补进度、错误、限制提示，再升级 Uppy/tus。
```
