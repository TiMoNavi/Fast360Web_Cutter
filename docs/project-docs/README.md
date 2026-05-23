# 整理版项目文档

本目录是整理后的项目文档入口。它不替代原有 `docs/specs/`、`docs/architecture/`、`docs/records/`，也不移动旧文档；它的目的只是把项目的设计意图、模块预期和当前实现状态重新排布成一个更容易阅读的结构。

项目核心一句话：

```text
The Invisible Director 是一个 WebXR 360 视频取景工具：
用户在普通 Web 端上传 360 视频，在 Quest / WebXR 里用头显和手柄决定取景路径，后端把路径正式渲染成普通 16:9 MP4。
```

## 阅读顺序

```text
00-overview/
项目为什么存在，产品概念是什么，边界原则是什么。

01-module-expectations/
WebXR、Web、Backend 三个模块的目标状态。

02-current-state/
当前代码已经实现了什么，哪些只是测试闭环，哪些还没开始。

03-shared-contracts/
三端共同依赖的数据模型、API 合同和黑盒边界。

04-troubleshooting/
开发和测试时反复出现的问题处理手册。
```

## 目录

```text
00-overview/project-vision.md
项目总述：产品设计、使用场景和核心概念。

00-overview/product-principles.md
产品和工程原则：三端边界、协议优先、测试闭环。

01-module-expectations/webxr.md
WebXR 模块的目标设计入口。

01-module-expectations/webxr/
A-Frame 方向的 WebXR 目标设计，拆分为球面播放器、裁剪遮罩、空间播放器 UI、剪辑工作台、输入采样和视觉语言。

01-module-expectations/web.md
普通 Web / 移动 Web 模块的理想设计。

01-module-expectations/backend.md
后端模块的理想设计入口。

01-module-expectations/backend/
后端按注册登录、上传下载、视频列表、WebXR 桥接、视频裁切拆分后的预期设计。

02-current-state/overview.md
当前整体状态和最小闭环。

02-current-state/webxr.md
WebXR 当前实现情况。

02-current-state/web.md
Web 当前实现情况。

02-current-state/backend.md
Backend 当前实现情况入口。

02-current-state/backend/
后端按注册登录、上传下载、视频列表、WebXR 桥接、视频裁切拆分后的当前状态。

02-current-state/end-to-end-loop.md
当前端到端闭环说明。

03-shared-contracts/data-models.md
核心数据模型与语义。

03-shared-contracts/view-path-timeline-file.md
ViewPathTimeline 文件契约：把 WebXR 散点和 patch 编译成可独立渲染、可回归测试的线性时间线文件。

03-shared-contracts/effect-events.md
效果事件协议与接入手册：自由事件名、黑场/转场示例、WebXR 调用方式和后端新增效果步骤。

03-shared-contracts/audio-tracks.md
音乐轨道协议：用户上传音乐列表、session 选择一首、从 output 0ms 对齐播放的简单混音模型。
03-shared-contracts/api-contracts.md
核心 API 合同。

03-shared-contracts/boundaries.md
模块黑盒边界。

04-troubleshooting/nextjs-web-cache-errors.md
Next.js Web 开发时 `.next` 缓存、多进程争用、500/404 和 Playwright baseURL 问题的处理方法。
```

## 原始材料

整理内容主要来自：

```text
../architecture/overview.md
../architecture/system-boundaries.md
../architecture/black-box-boundaries.md
../architecture/webxr-playback-boundaries.md
../specs/mobile-web.md
../specs/webxr.md
../specs/backend.md
../records/current-business-lines.md
../records/webxr-playback-stage.md
../records/webxr-export-lessons.md
../records/webxr-workbench-ui-prototype.md
```

如果整理版和原文档出现冲突，应先看代码和 `../records/` 中最近的阶段记录，再决定是否更新整理版。
