# WebXR 模块预期

WebXR 是项目里的唯一沉浸式取景和裁剪意图入口。下一阶段目标设计改按 A-Frame 组织，先把 360 视频播放、空间播放器 UI、裁剪遮罩和桌面式剪辑工作台拆成清晰模块。

详细设计已拆到：

```text
webxr/README.md
webxr/aframe-runtime.md
webxr/sphere-video-player.md
webxr/crop-viewport-mask.md
webxr/spatial-player-ui.md
webxr/editor-workbench-ui.md
webxr/input-and-sampling.md
webxr/visual-language.md
```

## 目标定位

```text
WebXR = A-Frame 360 播放 + 空间播放器 UI + 沉浸式取景 + 低频路径上传
```

WebXR 不负责上传原始视频，也不负责生成最终 MP4。它负责在 Quest / WebXR 环境中播放 360 视频，并把用户的头显、手柄和空间按钮操作转换成稳定的裁剪路径协议。

## 设计边界

```text
播放层：
球面 360 视频、视频源、播放状态、进入 immersive-vr。

播放器 UI：
悬浮在空中，面向用户，提供视频列表、进度条、播放控制和全隐藏。

裁剪预览层：
16:9 取景窗口、reticle、灰白半透明毛玻璃质感遮罩、FOV 预览。

剪辑工作台：
前下方桌面式空间 UI，大块按钮作为模块入口，弹出对应剪辑模块。

采样层：
读取头显和 controller 意图，按低频规则生成 ViewPathPatch。
```

后端协议不因 UI 拆分改变，正式裁剪仍以 `ClipEditConfig`、`ViewPathPatch` 和 `ViewPathPoint` 为准。

## 当前实现说明

当前代码仍主要是 Three.js / pmndrs 原型路线。A-Frame 是下一阶段目标设计，不要求立刻删除当前播放实验和工作台原型。当前事实记录见：

```text
../02-current-state/webxr.md
../../records/webxr-workbench-ui-prototype.md
```
