# Backend 预期模块索引

Backend 预期拆成多个互相解耦的黑盒模块。拆分目标不是为了制造目录层级，而是避免认证、上传、视频库、WebXR 路径接收和裁切渲染继续互相缠在一起。

```text
auth.md
用户注册登录模块。

video-transfer.md
视频上传下载模块。

video-library.md
视频列表与元数据模块。

webxr-bridge.md
WebXR 桥接模块，维护 /xr/player active session，并接收用户从 WebXR 传回的时间点序列、取景路径和特效事件。

timeline-data.md
Timeline 数据结构预期，说明 patch、ViewPathTimeline、build report 和 render slice 的理想边界。

video-cutting.md
视频裁切模块。

module-boundaries.md
后端代码拆分和模块边界。
```

推荐代码方向：

```text
apps/api/app/routes/
按 auth / videos / cut_sessions / exports 拆路由。

apps/api/app/services/
放业务服务，例如认证、视频库、WebXR bridge、裁切调度。
其中 timeline_assembler_service 负责把 WebXR patch 和散点编译成 ViewPathTimeline。

apps/api/app/repositories/
集中数据库读写。

apps/api/app/contracts/
集中 Pydantic 协议模型。

apps/api/app/rendering/
继续作为渲染器黑盒。
```
