# 球面 360 视频播放器

## 职责

球面视频播放器负责把后端视频源变成 WebXR 里的 360 播放体验。它是播放层，不是剪辑层。

播放器负责：

```text
加载业务 sourceUrl。
支持 MP4。
目标支持 HLS。
维护 HTMLVideoElement。
把视频贴到 a-videosphere。
提供播放、暂停、seek、倍速和当前时间。
进入 immersive-vr。
报告 loading / ready / playing / blocked / error。
```

播放器不负责：

```text
生成 ViewPathPatch。
解释 Cut、锁定、FOV 等剪辑语义。
上传原始视频。
生成最终 MP4。
```

## 视频源

业务视频源来自后端 video/session 元数据：

```text
videoId
sessionId
sourceUrl
durationMs
fps
width
height
```

本地 sample video 和 sample HLS 只属于开发 fixture。正式播放器不应把 fixture 当成隐形视频库。

## 播放状态

播放器应暴露统一状态给空间播放器 UI 和剪辑工作台：

```text
sourceStatus
playbackStatus
currentTimeMs
durationMs
playbackRate
bufferedRange
errorMessage
```

空间 UI 只消费这些状态，不直接读取视频元素内部变量。

## WebXR 进入流程

第一版以用户手势触发：

```text
用户点击 Play 或 Enter VR。
尝试 video.play() 解锁浏览器播放限制。
请求 immersive-vr session。
进入 A-Frame WebXR 场景。
保持播放器 UI 和工作台在用户舒适视野内。
```

如果 WebXR 不可用，页面应明确显示原因：

```text
非 secure context。
navigator.xr 缺失。
immersive-vr 不支持。
视频播放被浏览器策略阻止。
sourceUrl 加载失败。
```

## 与剪辑层的关系

播放器只提供视频时间和播放控制。剪辑层通过 `currentTimeMs` 给 `ViewPathPoint.tMs` 定时，不把播放倍速写成正式裁剪语义。

```text
playbackRate:
只影响用户浏览素材速度。

currentTimeMs:
用于采样点时间。

durationMs:
用于进度条、seek 和边界限制。
```
