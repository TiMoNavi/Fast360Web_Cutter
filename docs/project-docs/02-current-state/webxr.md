# WebXR 当前状态

## 目标设计与当前事实

整理版目标文档已经把下一阶段 WebXR 方向改为 A-Frame：

```text
docs/project-docs/01-module-expectations/webxr/
```

这只是目标设计，不代表当前代码已经迁移到 A-Frame。当前实现仍主要沿用 Three.js、WebGLRenderer、VideoTexture、pmndrs/uikit 原型和现有 playback lab。后续实现 A-Frame 时，应把当前事实和目标设计分开维护，避免把原型能力写成已上线能力。

## 已完成

WebXR 播放端已经从旧的混合 demo 中拆出多个职责清晰的部分：

```text
/xr/hello
真实 Quest / Meta WebXR 播放入口。
使用 MetaWebXrPlayer。
只保留真实 navigator.xr.requestSession("immersive-vr") 和 Three.js WebXRManager。

/xr/playback-lab
桌面开发和回归测试入口。
包含桌面 stereo simulator、mock-xr、HLS/MP4 切换、debug log 和 emulator fallback。

/xr/dev-check
浏览器 WebXR 能力检查入口。

/xr/workbench
未来 WebXR 裁剪工作台 UI 原型。
```

播放组件位于：

```text
apps/web/src/components/xr/
```

核心组件：

```text
MetaWebXrPlayer.tsx
真实 Quest / Meta WebXR 播放器。

WebXrPlaybackLab.tsx
开发测试播放器。

VideoSphereScene.ts
Three.js 360 球幕封装。

videoSources.ts
MP4 / HLS 视频源 helper。

webXrLabCompat.ts
lab 专用 XRWebGLBinding 兼容 shim。

XrDebugLog.tsx
lab/debug 日志组件。
```

## 当前播放能力

已具备：

```text
HTMLVideoElement。
THREE.VideoTexture。
inside-out SphereGeometry。
WebGLRenderer.xr。
真实 immersive-vr session 请求。
MP4 fixture 播放。
HLS fixture lab 播放。
桌面 stereo simulator。
mock-xr smoke 测试入口。
```

## 当前业务 session 页

真实业务入口：

```text
/xr/videos/:videoId/session/:sessionId
```

当前仍是裁剪占位页。它会：

```text
读取 videoId 和 sessionId。
读取后端 video 详情。
展示待接入模块说明。
提供 FixedOrbitRenderButton。
生成测试 ViewPathPatch。
调用后端 render-test。
```

它还没有：

```text
接入 MetaWebXrPlayer。
播放真实上传视频。
进入真实 immersive-vr 裁剪体验。
采样头显姿态。
读取 controller 输入。
显示取景框、遮罩和 reticle。
按 5Hz 输出真实 ViewPathPatch。
```

## 当前工作台原型

`/xr/workbench` 是空间 UI 原型。它已经验证了一种方向：

```text
左右透明面板。
下方中控长桌。
薄播放条。
中央视野保持清空。
Edit Ring 环形菜单原型。
亮色玻璃风格。
可请求 immersive-vr session。
```

但它仍是 mock 状态：

```text
不连接真实 /api/videos。
不加载真实 VideoTexture。
不读取真实 controller gamepad。
不生成真实 ViewPathPatch。
```

## 当前测试和验证

已有记录显示：

```text
build:web 通过。
typecheck:web 通过。
smoke:webxr 在 fresh dev server 上 7/7 通过。
```

smoke 主要覆盖：

```text
sample video Range。
sample HLS playlist 和 segment。
/xr/hello 不含 lab-only 控件。
/xr/playback-lab 可模拟和切换 HLS。
mock-xr 自动化。
```

## 当前缺口

最重要缺口：

```text
真实业务 session 页没有接上播放组件。
真实上传视频 sourceUrl 没有进入 WebXR 播放层。
真实头显和 controller 没有转为 ViewPathPoint。
取景框和遮罩没有进入生产路径。
路径 sampler 没实现。
WebXR UI 原型没有和业务状态连接。
```

## 建议下一步

```text
1. 在 /xr/videos/:videoId/session/:sessionId 中加载后端 video sourceUrl。
2. 把真实 source 传给 MetaWebXrPlayer。
3. 保持播放层不直接写路径。
4. 新增独立 sampler，监听 video.currentTime 和目标取景中心。
5. 先用 head-gaze 生成低频 ViewPathPatch。
6. 再接 controller、取景框、遮罩和 Edit Ring。
```
