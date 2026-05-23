# A-Frame 能力说明

资料基线：2026-05-23。当前 npm 上 `aframe` 最新版本为 `1.7.1`；官方文档主版本仍以 `1.7.0` 页面组织。

## 一句话判断

A-Frame 是一个把 three.js、WebGL 和 WebXR 包成 HTML / Entity Component System 的沉浸式 Web 框架。它适合快速搭建 VR / AR 场景、360 视频播放、空间 UI、手柄射线交互、基础模型/材质/动画和自定义交互组件；它不负责视频剪辑算法、最终 MP4 渲染、后端任务调度或复杂业务协议。

对本项目来说，A-Frame 最适合承担这一层：

```text
WebXR 体验层 =
360 视频播放 + 空间播放器 UI + 取景框预览 + 头显/手柄采样 + 语义事件输出
```

正式裁剪、导出、存储和任务编排仍应留在业务协议与后端渲染链路里。

## 核心能力地图

| 能力 | A-Frame 提供什么 | 对 360 Video Cutter 的意义 |
| --- | --- | --- |
| 声明式 3D 场景 | 用 `a-scene`、`a-entity`、`a-camera`、`a-assets` 等 HTML 标签组织场景 | WebXR 页面结构更直观，方便把播放器、遮罩、工作台、输入采样拆成独立实体 |
| ECS 组件模型 | 通过 component 给实体挂载行为，并允许注册自定义 component / system | 可以把 `sphere-player`、`crop-mask-preview`、`viewpath-sampler` 等能力拆开维护 |
| WebXR 会话入口 | 内置 WebXR 相关组件和 XR 模式 UI，处理进入 VR/AR 的基础流程 | Quest 浏览器里可以更快跑通沉浸式播放入口 |
| 360 视频播放 | `a-videosphere` 将视频纹理贴在内侧球面，适合等距矩形 360 视频 | 可作为 360 素材预览的直接基础，而不是从零写球面播放器 |
| 资源管理 | `a-assets` 可组织图片、视频、模型等资源 | 视频、贴图、模型和 UI 材质可以有统一入口 |
| 摄像机与用户视角 | `a-camera` / rig 模式表达用户头显视角与空间位置 | 取景路径采样可以读取 camera 世界姿态，而不是依赖 React 状态 |
| 手柄与射线交互 | `laser-controls`、`cursor`、`raycaster`、各平台 controller 组件 | 空间按钮、进度条、工作台面板可以用射线点击实现 |
| 手部输入 | 提供 hand controls / hand tracking 相关组件 | 后续可探索手势输入，但第一版应优先手柄，降低设备差异风险 |
| 3D 模型与基础图形 | 支持几何体、材质、灯光、阴影、文本、glTF 模型、OBJ 模型等 | 播放器 UI、取景框、半透明遮罩、工作台按钮都能直接建模 |
| 动画与状态反馈 | 内置 animation 组件，实体属性可以响应事件变化 | hover、pressed、panel open/close、遮罩淡入淡出可先用框架能力完成 |
| three.js 访问 | 可直接访问底层 object3D、scene、renderer 和 three.js 能力 | 遇到 A-Frame 原语不够时，可以局部下探到 three.js，而不是全量重写 |
| 浏览器/桌面兼容 | 普通桌面浏览器也能运行非沉浸模式，配合 inspector 调试 | 可以做桌面回归和布局调试，再上 Quest 验证真实 WebXR |
| 开发工具 | 内置 visual inspector、stats/debug 等调试能力 | 空间布局、实体层级和性能问题更容易定位 |
| 社区组件生态 | 有环境、物理、状态、多用户、传送等社区组件可选 | 做原型快，但生产依赖需要逐个评估维护状态和设备兼容性 |

## 它能替我们少写什么

```text
不用从零搭 WebGL renderer。
不用从零处理基础 WebXR 场景入口。
不用从零写 camera / controller / raycaster 的常见绑定。
不用从零把 360 视频贴到内侧球面。
不用从零组织 3D 场景实体和常用组件生命周期。
不用从零做基础空间交互事件。
```

这就是它最有价值的地方：把“能不能在头显里跑起来”这件事降到很低成本，让我们把主要精力放在裁剪产品语义上。

## 它不替我们做什么

```text
不生成最终 MP4。
不理解 Cut / Lock / FOV / ViewPathPatch 等业务协议。
不自动解决高码率 360 视频的解码性能问题。
不保证所有浏览器和头显的 WebXR 能力完全一致。
不替代后端转码、队列、存储和导出任务。
不提供现成的视频剪辑时间线。
不保证 AR passthrough、hand tracking、real-world meshing 等能力在每台设备都可用。
```

所以 A-Frame 在本项目里的定位应该是“沉浸式交互运行时”，不是“剪辑系统核心”。

## 本项目建议采用的能力切分

```text
a-scene
WebXR 根场景，承载播放器、遮罩、UI、工作台和输入实体。

a-assets
管理 video、贴图、字体、模型和 UI 材质资源。

a-videosphere
播放 360 视频素材，只负责观看和时间同步。

camera rig
表达用户头显姿态，给 ViewPathPoint 采样使用。

controller / laser / raycaster
负责点击空间按钮、拖动进度、选择工作台模块。

custom components
把业务行为封装为 sphere-player、player-ui-controller、crop-mask-preview、viewpath-sampler。

event bridge
把 A-Frame 的交互事件转成业务语义事件，例如 playPause、seekTo、lockViewport、savePatch。
```

## 推荐的第一版落地范围

第一版不要贪多，目标是把最关键的沉浸式闭环跑通：

```text
1. Quest 中进入 immersive-vr。
2. 加载并播放一个 360 视频。
3. 显示可隐藏的空间播放器 UI。
4. 用右手 controller 射线点击播放、暂停、seek。
5. 显示一个 16:9 取景框或半透明遮罩。
6. 从 camera 姿态采样 yaw / pitch / fov 所需数据。
7. 按低频规则输出 ViewPathPoint / ViewPathPatch。
```

这些完成后，再考虑手势、复杂工作台、AR 混合现实、物理/碰撞、多用户等更重的能力。

## 风险与注意事项

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| 设备能力差异 | WebXR、controller、hand tracking、AR 能力依赖浏览器和设备 | 以 Quest 真实设备作为验收基线，桌面只做辅助调试 |
| 视频播放限制 | 移动浏览器常要求用户手势触发播放，视频纹理也受 autoplay / playsinline / CORS 影响 | 把 `Enter VR` / `Play` 设计成明确用户手势，视频源统一处理 CORS |
| 性能压力 | 8K/高码率 360 视频、透明 UI、后处理效果会迅速吃掉帧预算 | 第一版避免重 shader 和大量透明叠层，优先稳定播放 |
| React 集成边界 | A-Frame 维护自己的实体生命周期，React 状态频繁驱动实体可能抖动 | React 负责页面和业务数据，A-Frame component 负责高频空间状态 |
| 社区组件维护 | 社区插件质量不一，版本兼容可能不稳定 | 核心链路优先用官方组件和少量自定义组件 |
| 业务协议污染 | 空间 UI 很容易直接写业务对象 | A-Frame 只发语义事件，不直接生成最终裁剪结果 |

## 能力结论

A-Frame 对我们最有用的不是“它能做很炫的 VR”，而是它把 WebXR 的基础样板、3D 场景组织、360 视频球面播放和 controller 交互都压缩成一套可读的 HTML + component 模型。

如果我们把它用在体验层，它会让 WebXR 原型更快、更清楚；如果把它推到剪辑、渲染、导出这些业务核心层，它反而会让边界变混乱。

## 官方资料入口

- A-Frame Introduction: https://aframe.io/docs/1.7.0/introduction/
- Entity Component System: https://aframe.io/docs/1.7.0/introduction/entity-component-system.html
- WebXR component: https://aframe.io/docs/1.7.0/components/webxr.html
- `a-videosphere`: https://aframe.io/docs/1.7.0/primitives/a-videosphere.html
- `laser-controls`: https://aframe.io/docs/1.7.0/components/laser-controls.html
- Asset Management System: https://aframe.io/docs/1.7.0/core/asset-management-system.html
- Visual Inspector: https://aframe.io/docs/1.7.0/introduction/visual-inspector-and-dev-tools.html
- npm package: https://www.npmjs.com/package/aframe
