# Backend 当前状态模块索引

当前后端功能已经跑通 MVP，但代码尚未按模块完全拆开。本目录按目标模块视角描述现有状态，方便后续拆代码时对照。

```text
auth.md
用户注册登录模块当前状态。

video-transfer.md
视频上传下载模块当前状态。

video-library.md
视频列表与元数据模块当前状态。

webxr-bridge.md
WebXR 桥接模块当前状态。

timeline-data.md
Timeline 数据结构当前状态，说明当前代码如何保存 patch、展开点、生成 ViewPathTimeline 字典，以及还缺哪些持久化和编译环节。

video-cutting.md
视频裁切模块当前状态。

module-boundaries.md
当前代码拆分缺口。
```

核心判断：

```text
功能闭环：
已具备开发 MVP。

模块边界：
文档上已经能拆清楚，但代码仍主要集中在 main.py / storage.py。

生产能力：
同步 render-test 可用，生产级分片队列未完成。
```
