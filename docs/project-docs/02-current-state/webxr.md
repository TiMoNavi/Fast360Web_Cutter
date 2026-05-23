# WebXR 当前状态

> 代码基线：2026-05-23。本文描述当前仓库状态，不描述理想终局。

## 一句话结论

WebXR 已经进入 PC WebXR Editor 集成阶段。真实业务 session 页不再是 FixedOrbit 占位页，而是核心 PC 剪辑界面：

```text
/xr/videos/:videoId/session/:sessionId
apps/web/src/features/webxr/pc-editor/
```

当前可以在 PC 上用键鼠和屏幕按钮验证 360 视频播放、固定屏幕遮罩、FOV/中心点调整、timeline bridge patch 发送和后端 accepted。VR 真机交互还没有进入本阶段验收。

## 当前核心页面

### `/xr/videos`

WebXR 360 视频列表入口。用户从这里选择属于当前用户的 WebXR 360 视频，并进入对应 session。

### `/xr/videos/:videoId/session/:sessionId`

PC WebXR Editor 业务页面。当前已接入：

```text
真实 video.sourceUrl
当前用户可访问的视频 source list
A-Frame a-scene / a-videosphere
黑色/渐变 crop mask 预览
2D 屏幕空间播放条和 PC 工作台
Meta XR Start 入口
timeline bridge
真实 ViewPathPatch / PlaybackClientState 发送
```

页面代码已集中到：

```text
apps/web/src/features/webxr/pc-editor/
```

业务 route 保持 thin server page：读取 params/cookie，调用 `buildPcEditorSessionModel`，渲染 `PcWebXrEditor`。

## PC 与 VR 坐标边界

PC 模式：

```text
视觉体验：360 视频/camera 视角在固定屏幕遮罩背后移动。
协议来源：timeline bridge 使用 crop mask state。
验收重点：用户透过遮罩看到的中心 == ViewPathPatch.lastPoint.center。
```

VR 模式：

```text
暂未作为当前验收目标。
后续会单独处理视频空间、视线目标、遮罩目标和 controller 输入之间的关系。
```

这条边界很重要：PC 端不能直接用裸 camera pose 覆盖 crop mask state，否则容易出现“拖动方向看起来对，但后端裁剪方向反了”的错位。

## 控制层现状

控制层已按“语义动作 + 输入适配器”拆开，方便后续 VR 复用：

```text
controls/operations/
  cameraOperations.ts
  maskOperations.ts
  playbackOperations.ts
  timelineOperations.ts
  viewGeometry.ts

controls/inputs/
  usePcKeyboardShortcuts.ts
  usePcWheelZoom.ts
  usePcMaskPointerInput.ts
  usePcEdgePan.ts
```

当前 PC 输入：

```text
Space                 播放/暂停
Q / E                 FOV 缩放
W/A/S/D               平滑移动裁剪遮罩
鼠标滚轮              缩放 360 视频/camera FOV
T + 鼠标滚轮          连续调节预览播放速度，范围 0.1x..5x
R + 鼠标滚轮          连续调节录制速度意图，范围 0.1x..5x
F                     flush path
C                     cut here
P                     打开/关闭视频列表
```

同一个 operation 后续可以由 PC、自动化测试或 VR controller/head-gaze 触发，不应把具体键鼠事件写成业务结果。

`Ctrl+drag`、`Ctrl+Shift+click`、edge pan 这组 PC 手势已暂时下线，等待重新设计。底层 operation 保留，但 active editor 不再接入这些输入。

播放速度和录制速度已经分离：

```text
Playback speed 只改变本地预览视频的 HTMLVideoElement.playbackRate。
Record speed 进入 PC editor 状态和 PlaybackClientState.recording.recordingRate。
当前正式导出仍不读取 PlaybackClientState；如果要让录制速度改变最终 MP4 时间轴，需要后续新增正式 timeline/effect 协议。
```

## 后端桥接

后端协议不变，仍发送：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

当前事件列表只是占位；discard/restore/effect 编辑仍未进入首轮集成。

## dev/legacy 页面

以下页面保留，不作为核心产品入口：

```text
/xr/aframe-player    dev/legacy A-Frame 播放器 smoke
/xr/player-ui-lab    dev/legacy 2D 播放条视觉实验
/xr/playback-lab     dev/legacy playback/mock XR 实验
/xr/hello            dev/legacy Three.js / Meta WebXR 对照
/xr/workbench        dev/legacy 早期工作台参考
/xr/dev-check        dev/legacy 环境检查
```

`/xr/login` 保留为 WebXR 登录实验模块，不混入 PC editor。

旧的 `src/components/aframe/*` 播放器相关入口目前多为兼容 wrapper，供 lab 页面和 smoke 测试继续使用。新产品代码应从 `@/features/webxr/pc-editor` 导入。

## 当前自动化验收

Playwright smoke 覆盖：

```text
注册唯一测试用户
调用 /api/demo-videos/overpass-warmup/start 创建真实 session
进入 /xr/videos/:videoId/session/:sessionId
验证 A-Frame scene、videosphere、crop mask、PC 2D UI、Meta XR 入口
验证 source list、播放速度、录制速度、Space、滚轮 FOV、W/A/S/D 组合平移、FOV 平滑过渡
等待真实 /path-patches accepted
检查 accepted patch 的 center/fov 与 crop mask state 一致
```

`/xr/aframe-player`、`/xr/player-ui-lab`、`/xr/playback-lab` 的 smoke 继续保留，作为 dev/legacy 回归。

## 下一步风险

```text
用网格视频 render-test 校准最终 MP4 输出中心，确认球幕 -90deg 固定偏移不会导致导出错位。
为 VR 真机定义单独的 input adapter，不复用 PC 的方向假设。
把事件列表从占位推进到 discard/restore/effect 编辑。
```
