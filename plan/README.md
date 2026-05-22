# The Invisible Director 三端实施文档索引

本目录把总方案拆成三个端的实施文档。根目录的 `plan.md` 仍然是产品与协议总方案；本目录下的文档用于指导后续分端实现。

## 三端边界

```text
安卓端网页：
素材入口和结果出口。只做上传、我的视频、任务状态、下载，不做裁剪。

WebXR 端：
唯一裁剪入口。负责 360 播放、取景框交互、低频路径 patch 上传。

后端：
唯一正式裁剪入口。负责视频存储、路径时间线、60 秒切片裁剪、导出结果。
```

## 共享系统约束

平面安卓网页和 WebXR 端必须一起做，并共享同一个后端、数据库和视频库。

```text
同一个用户系统：
安卓端上传的视频，WebXR 端必须能在“我的视频”中看到。

同一个 videos 表：
安卓端写入上传结果，WebXR 端读取视频源，后端读取源文件裁剪。

同一个 cut_sessions 表：
安卓端创建/查看 session，WebXR 端写入路径，后端更新裁剪状态。

同一个 exports 表：
后端写入导出结果，安卓端下载，WebXR 端可查看状态。
```

第一版可以是同一个 Next.js 前端项目的两个路由入口：

```text
/mobile/*
/xr/*
```

也可以是两个前端应用，但必须共用同一个 API 和数据库 schema。

## 文档

```text
android-web/README.md
普通安卓端网页规划。

webxr/README.md
WebXR 裁剪端规划。

backend/README.md
后端上传、路径、裁剪与导出规划。
```

## 共同协议

三端共享以下核心概念：

```text
ClipEditConfig：
整个视频的全局剪辑参数，后端正式裁剪会读取。

ViewPathPatch / ViewPathPoint：
WebXR 端上传的取景路径，后端正式裁剪会读取。

PlaybackClientState：
播放端状态，只用于调试、恢复 UI 和体验分析，不参与正式裁剪。
```

关键默认：

```text
输出：16:9，1920x1080，30fps。
路径记录：最多 5Hz，100ms 时间量化。
路径上传：每 2 秒批量上传，或累计 10 个点上传。
覆盖：必须使用 ViewPathPatch.replaceRange，不依赖 tMs 完全一致。
裁剪：后端按 60 秒分片处理。
```

## 推荐开源项目

这些项目用于参考或直接集成，不能盲目复制代码；正式使用前需要再次核对许可证和版本。

| 模块 | 推荐项目 | 用途 |
| --- | --- | --- |
| WebXR / 3D | [three.js](https://github.com/mrdoob/three.js) | 主渲染引擎、VideoTexture、inside-out sphere、WebXR |
| WebXR 示例 | [webxr-samples](https://github.com/immersive-web/webxr-samples) | WebXR session、render loop、输入示例 |
| WebXR 输入 | [webxr-input-profiles](https://github.com/immersive-web/webxr-input-profiles) | 标准化 Quest 手柄模型、按钮、摇杆 |
| React 3D 可选 | [react-three-fiber](https://github.com/pmndrs/react-three-fiber) | 第二阶段组件化 Three 场景 |
| React XR 可选 | [pmndrs/xr](https://github.com/pmndrs/xr) | 第二阶段 React XR 层 |
| 快速 VR 原型参考 | [A-Frame](https://github.com/aframevr/aframe) | 参考 360/VR 原型，不作为 MVP 主框架 |
| 上传 UI | [Uppy](https://github.com/transloadit/uppy) | 安卓端上传界面、进度、重试 |
| 断点续传客户端 | [tus-js-client](https://github.com/tus/tus-js-client) | 手机网页大文件断点续传 |
| 断点续传服务端 | [tusd](https://github.com/tus/tusd) | tus 官方服务端 |
| 平面网页 UI | [shadcn/ui](https://github.com/shadcn-ui/ui) | 移动网页和管理页基础组件 |
| 备选 UI | [Mantine](https://github.com/mantinedev/mantine) | 表单、弹窗、移动适配参考 |
| 普通视频预览 | [Vidstack](https://github.com/vidstack/player) / [Plyr](https://github.com/sampotts/plyr) | 安卓端非 XR 视频预览参考 |
| 后端视频绑定 | [PyAV](https://github.com/PyAV-Org/PyAV) | Python 解码/编码 fallback |
| 360 投影参考 | [py360convert](https://github.com/sunset1995/py360convert) | equirectangular 到 perspective 数学参考 |

MVP 推荐组合：

```text
前端：
Next.js + shadcn/ui + Uppy + tus-js-client + Three.js

WebXR：
Three.js + WebXR Samples 思路 + WebXR Input Profiles

后端：
FastAPI + Pydantic + RQ + FFmpeg v360

后端 fallback：
PyAV + OpenCV remap，参考 py360convert
```
