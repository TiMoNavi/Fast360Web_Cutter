# Backend 模块预期

Backend 是唯一正式裁剪和导出入口。它不理解前端组件状态，只理解协议、数据库记录和文件。

为了避免继续把所有能力堆进一个大模块，Backend 预期按黑盒拆分为多个互相解耦的模块。这个文件只作为入口索引，详细预期见 `backend/` 子目录。

## 模块拆分

```text
backend/auth.md
用户注册登录模块。

backend/video-transfer.md
视频上传下载模块。

backend/video-library.md
视频列表与视频元数据模块。

backend/webxr-bridge.md
WebXR 桥接模块，接收用户从 WebXR 传回的时间点序列、取景路径和特效事件。

backend/video-cutting.md
视频裁切模块，负责分片、渲染、重渲染和最终导出。

backend/module-boundaries.md
后端代码拆分和模块边界。
```

## 总体目标

```text
认证模块只处理用户和登录态。
上传下载模块只处理文件进入和文件流出。
视频列表模块只处理 videos 元数据和可见性。
WebXR 桥接模块只处理路径、时间点序列和特效事件的协议接收。
视频裁切模块只处理可渲染时间线、分片队列和导出。
```

这些模块可以共享底层数据库连接、配置和存储基础设施，但不应该互相读取内部实现细节。
