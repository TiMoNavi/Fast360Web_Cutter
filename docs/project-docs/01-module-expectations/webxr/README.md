# WebXR 模块预期

## 当前核心

当前核心工作面是 PC WebXR Editor：

```text
/xr/videos/:videoId/session/:sessionId
apps/web/src/features/webxr/pc-editor/
```

它负责把真实业务视频、A-Frame 360 播放、PC 2D 播放条、crop mask 预览、Meta XR 兼容入口和 timeline bridge 组织到同一个业务页面。

## 文档索引

```text
pc-editor.md                 PC WebXR Editor 四层架构、控制层解耦、PC/VR 坐标边界
aframe-capabilities.md       A-Frame 能力和限制
aframe-timeline-bridge.md    A-Frame timeline bridge 与后端 patch 协议
input-and-sampling.md        输入、采样和 ViewPathPoint 生成规则
vaporwave-outrun-spatial-ui.md
spatial-glass-ui-references.md
deprecated-vision-glass-login.md
```

## 路由状态

核心产品入口：

```text
/xr/videos
/xr/videos/:videoId/session/:sessionId
```

dev/legacy 页面，保留用于 smoke、能力对照或历史参考：

```text
/xr/aframe-player
/xr/player-ui-lab
/xr/playback-lab
/xr/hello
/xr/workbench
/xr/dev-check
```

登录实验：

```text
/xr/login
```

## 设计原则

WebXR 前端不生成最终 MP4；最终导出由后端根据 timeline/path/effect contract 渲染。前端只负责预览、交互采样和向后端发送协议消息。

新交互必须先定义语义 operation，再接入 PC/VR/自动化输入适配器。不要把键盘、鼠标、controller 事件直接写成业务结果。
