# PC WebXR Editor

## 定位

PC WebXR Editor 是当前 WebXR 的核心业务界面，对应路由：

```text
/xr/videos/:videoId/session/:sessionId
```

第一阶段只面向 PC 键鼠和屏幕按钮验证，不依赖头显。VR 真机交互后续单独规划，但本模块的动作语义必须提前解耦，保证同一个剪辑动作可以由 PC、自动化测试、未来 controller/head-gaze 多种输入触发。

## 四层结构

```text
apps/web/src/features/webxr/pc-editor/
  data/      业务 session 数据、视频源映射、timeline bridge transport
  webxr/     A-Frame runtime、videosphere、camera、crop mask、Meta XR 兼容
  ui/        2D 屏幕空间播放条、工作台、遮罩透明度、提示、debug state
  controls/ 语义动作 operations 和输入适配 inputs
```

`PcWebXrEditor.tsx` 只做顶层编排，不继续堆放交互细节。

## 控制层原则

控制层分两段：

```text
operation：用户到底要做什么
input adapter：这次是怎么触发的
```

当前 operation 单元：

```text
cameraOperations.ts    设置 camera center
maskOperations.ts      设置遮罩中心、FOV、透明度、平滑移动、遮罩/镜头绑定移动
playbackOperations.ts  播放、暂停、倍速、视频选择、播放列表
timelineOperations.ts  flushPath、cutHere
viewGeometry.ts        yaw/pitch/FOV/屏幕点映射等几何工具
```

当前 PC input adapter：

```text
usePcKeyboardShortcuts.ts  Space、W/A/S/D、Q/E、F、C、P、T、R
usePcWheelZoom.ts         鼠标滚轮缩放 360 视频视角；按住 T/R 时转为速率调节
usePcMaskPointerInput.ts  暂时不接入 active editor，等待重新设计
usePcEdgePan.ts           暂时不接入 active editor，等待重新设计
```

后续 VR 输入必须优先调用已有 operation，而不是复制 PC 逻辑。例如 controller ray 的“指向并平滑移动遮罩”应该调用 `moveMaskTo`，VR 抓取式运镜应该调用 `bindMaskAndCameraBy` 或新的同层 operation。

2026-05-23 交互复盘后，`Ctrl+drag` 和 `Ctrl+Shift+click` 暂时下线。相关 operation 保留，PC input adapter 不作为当前验收目标。

播放速度与录制速度分离：

```text
Playback speed：T + 鼠标滚轮，0.1x..5x，只影响本地预览播放。
Record speed：R + 鼠标滚轮，0.1x..5x，表达录制/导出速度意图。
```

所有连续速率类滑块都应走自适应滚轮曲线：接近默认值 1x 时变化更细，越靠近 0.1x 或 5x 边缘时每格滚轮变化更大。

## PC 与 VR 取景坐标差异

PC 模式：

```text
鼠标/键盘改变 camera 或 crop mask 状态。
用户视觉上看到的是 360 视频在屏幕固定遮罩后面移动。
发送给后端的 ViewPathPoint.center/fov 必须来自 crop mask state。
自动化测试必须验证遮罩中心和最后 accepted patch center 同向且一致。
```

VR 模式：

```text
暂不作为本阶段验收目标。
后续真机体验会更接近视频空间稳定、视线/遮罩目标移动。
VR 输入可以触发同一批 operation，但是否使用 crop-mask 或 xr-pose 作为 timeline source 需要单独验收。
```

## 后端边界

本模块不改协议，继续发送现有三类消息：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

黑色/渐变遮罩是预览层；正式导出依赖 `ViewPathPoint.center/fov/enabled/cut`。如果球幕 `-90deg` 固定偏移导致最终 MP4 错位，应通过网格视频 render-test 单独校准，不在 UI 层偷偷补偿。

## 当前验收

Playwright 真实后端优先：

```text
注册测试用户
调用 /api/demo-videos/overpass-warmup/start 创建真实 videoId/sessionId
打开 /xr/videos/:videoId/session/:sessionId
验证 A-Frame scene、videosphere、crop mask、PC 2D UI、Meta XR 入口存在
验证视频列表包含该用户可访问的 WebXR 360 视频
验证播放速度、录制速度、Space、滚轮 FOV、W/A/S/D 组合平移、FOV 平滑过渡
等待 /path-patches accepted
检查 accepted patch 的 center/fov 与 crop mask state 一致
```

`/xr/aframe-player`、`/xr/player-ui-lab`、`/xr/playback-lab`、`/xr/hello`、`/xr/workbench`、`/xr/dev-check` 保留为 dev/legacy 页面，用于 smoke、能力对照和历史参考，不作为核心产品入口。
