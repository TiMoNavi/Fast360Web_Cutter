# Backend 当前状态

当前后端已经跑通 MVP 闭环，但代码还没有真正拆成多个后端业务模块。这个文件只作为当前状态入口，详细状态见 `backend/` 子目录。

## 当前总览

```text
apps/api/app/main.py
当前承载大部分 FastAPI 路由、认证、上传、session、patch、render-test 和 export 接口。

apps/api/app/storage.py
当前承载 SQLite 初始化、文件路径、响应组装、patch 写入和部分导出 helper。

apps/api/app/models.py
当前承载 Pydantic 协议模型。

apps/api/app/rendering/
当前承载后端渲染器相关逻辑，包括逐帧 remap、路径预处理和效果应用。
```

## 模块化状态

```text
backend/auth.md
用户注册登录模块当前状态。

backend/video-transfer.md
视频上传下载模块当前状态。

backend/video-library.md
视频列表与视频元数据模块当前状态。

backend/webxr-bridge.md
WebXR 桥接模块当前状态。

backend/video-cutting.md
视频裁切模块当前状态。

backend/module-boundaries.md
当前代码拆分缺口和后续拆分方向。
```

## 当前核心判断

```text
功能上：
MVP 闭环已经可用。

结构上：
认证、上传、视频库、WebXR 桥接、裁切导出仍主要集中在 main.py / storage.py，需要继续解耦。

生产能力上：
render-test 仍是同步开发接口，不是生产级分片队列。
```
