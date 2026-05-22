# 空间视觉语言

## 参考来源

本项目参考 Apple visionOS 的空间 UI 方向，但不复制原生实现，也不把 visionOS API 当成 WebXR 依赖。

官方参考：

```text
Spatial layout
https://developer.apple.com/design/human-interface-guidelines/spatial-layout/

Windows
https://developer.apple.com/design/human-interface-guidelines/windows/

Immersive experiences
https://developer.apple.com/design/human-interface-guidelines/immersive-experiences/

Materials
https://developer.apple.com/design/human-interface-guidelines/materials/

visionOS
https://developer.apple.com/visionos/
```

## 本项目规则

WebXR 空间 UI 的目标气质：

```text
轻量。
清晰。
留白充足。
中心视野少遮挡。
按钮大而稳定。
层级通过空间深度表达。
玻璃质感用于承载信息，不作为装饰。
```

第一版不追求精致美术，优先保证按钮能点、状态能看、空间关系能理解。

## 玻璃质感

WebGL 里不强求真实系统级毛玻璃。可用近似规则：

```text
浅灰 / 白色半透明面板。
低饱和边框。
轻微阴影或 Z 轴抬升表达层级。
背景不过度模糊，避免影响视频判断。
按钮比面板更实，保证可读性。
```

裁剪遮罩使用灰白半透明毛玻璃质感，但不能让用户看不清 360 视频内容。

## 空间层级

建议层级：

```text
最远层：
360 视频球幕。

预览层：
取景框、reticle、裁剪遮罩。

播放器层：
悬浮播放器 UI，可整体隐藏。

工作台层：
前下方桌面式剪辑入口。

弹出层：
从工作台弹出的当前模块。
```

层级必须帮助用户理解“哪个东西可以操作”，不能堆叠成平面网页。

## 舒适视野

默认避免：

```text
大面板长期贴在头显正中。
头锁定 UI 跟随用户每次转头。
过小按钮。
过多同时打开的面板。
高对比闪烁或频繁移动。
```

播放器 UI 可以短暂面向用户，剪辑工作台保持相对固定的桌面位置。用户需要操作时低头看工作台，需要看视频时中心视野保持开放。

## 文本和按钮

第一版空间按钮规则：

```text
按钮尺寸宁大勿小。
文字短。
同类按钮保持固定位置。
危险动作需要二次确认或明确状态。
hover 和 pressed 状态必须可见。
禁用状态必须可见。
```

如果 3D 字体对中文支持不稳定，第一版可以优先用短英文或图标，并在外层 DOM / 文档中保留中文语义。
