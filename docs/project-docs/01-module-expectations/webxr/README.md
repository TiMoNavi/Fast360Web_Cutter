# WebXR A-Frame 目标设计

## 定位

下一阶段 WebXR 端按 A-Frame 框架重新组织目标设计。目标不是立即替换所有现有代码，而是先明确一个更适合空间 UI 和快速验证的模块边界。

```text
A-Frame WebXR 端 =
球面视频播放器
+ 悬浮播放器 UI
+ 裁剪视窗遮罩
+ 桌面式剪辑工作台
+ 头显 / controller 采样
```

## 为什么选 A-Frame

A-Frame 的声明式场景结构适合先把 WebXR 产品形态跑通：

```text
a-scene 承载 WebXR 场景。
a-assets 管理视频资源。
a-videosphere 负责 360 球面视频。
camera rig 表达用户视角。
controller / ray / cursor 负责空间按钮。
自定义 component 负责采样、UI 状态和协议输出。
```

当前 Three.js / pmndrs 工作台原型仍是重要参考：它记录了空间布局、播放实验和视觉方向。但新目标文档以 A-Frame 为主，避免继续把播放、剪辑、测试和 UI 混在一个实现模型里。

## 模块拆分

```text
aframe-runtime.md
A-Frame 场景、camera rig、controller、空间按钮交互基础。

sphere-video-player.md
360 视频播放、视频源、播放状态、进入 WebXR 的能力边界。

crop-viewport-mask.md
取景框、FOV、挖孔遮罩和预览语义。

spatial-player-ui.md
悬浮播放器 UI：视频列表、进度条、播放控制和全隐藏。

editor-workbench-ui.md
桌面式剪辑工作台：剪辑动作入口和弹出模块。

input-and-sampling.md
头显、controller、按钮事件与 ViewPathPoint 采样。

visual-language.md
参考 visionOS 的空间视觉准则。
```

## 成功标准

第一版 A-Frame 目标设计完成后，应该能指导实现一个功能优先的 WebXR 原型：

```text
Quest 中能播放 360 视频。
用户能通过空间按钮控制播放。
播放器 UI 可以整体隐藏。
工作台按钮可以打开剪辑模块。
取景框和遮罩能表达 FOV 与输出区域。
头显和 controller 操作能转成 ViewPathPoint。
路径按低频规则上传，而不是持久化每帧姿态。
```

## 不做的事

```text
不把 WebXR 做成上传入口。
不在前端生成最终 MP4。
不让播放器 UI 直接写后端裁剪结果。
不让遮罩透明度、玻璃材质等预览状态进入正式裁剪协议。
不把当前 Three.js mock 状态描述成 A-Frame 已实现能力。
```
