# PC Editor 交互实现与 VR 迁移索引

日期：2026-05-24

本文记录当前产品级 PC editor 页面 `/xr/player` 的交互、UI 组件位置、操作层边界和自动化测试覆盖。目标是给后续 VR 端迁移使用：VR 端应该尽量复用同一套 semantic operation，只替换输入适配器和空间 UI。

`/xr/videos/:videoId/session/:sessionId` 当前仍作为兼容深链和部分自动化测试入口存在，但后期不再作为产品路由主线。

## 页面范围

PC editor 主实现目录：

```text
apps/web/src/features/webxr/pc-editor/
```

业务路由入口：

```text
apps/web/app/xr/player/page.tsx
apps/web/app/xr/videos/[videoId]/session/[sessionId]/page.tsx
```

页面级组合组件：

```text
apps/web/src/features/webxr/pc-editor/PcWebXrEditor.tsx
```

主要自动化测试：

```text
apps/web/e2e/webxr-crop-render.spec.ts
```

## 分层结构

当前模块按下面方式组织：

```text
pc-editor/
  PcWebXrEditor.tsx          页面组合层
  controls/                  语义操作和 PC 输入适配器
  data/                      session model、视频源、timeline bridge
  ui/                        DOM 面板、播放器控件、工作台
  webxr/                     A-Frame scene、crop mask、arcs、runtime 注册
```

核心边界是：

```text
输入适配器 -> semantic operation -> timeline / playback / A-Frame state
```

后续 VR 迁移时，不应该把 PC 鼠标键盘逻辑直接搬进 Quest controller。应该这样迁移：

```text
Quest 手柄/头显输入 -> 同一个 semantic operation
```

例如：

```text
PC Q/E 长按                   -> mask.setPreviewFov(...)
VR pinch / dial               -> mask.setPreviewFov(...)

PC Ctrl + 点击目标             -> mask.moveMaskTo(...)
VR controller ray 点击目标     -> mask.moveMaskTo(...)

PC Ctrl + 边缘拖动             -> mask.bindMaskAndCameraBy(...)
VR grab 到边缘后继续拖         -> mask.bindMaskAndCameraBy(...)
```

## 顶层组合

`PcWebXrEditor.tsx` 当前组合这些模块：

```text
PcTrajectoryRippleCorrector
AFrame360VideoControlBridge
PcPlayerControls
PcEditorDebugState
PcWorkbenchPanel
PcEffectsPanel
PcEffectPreview
PcBgmControls
AFrameEditorScene
xr-pc-stage-hit-layer
```

来自 `usePcEditorControls` 的主要 handler / operation：

```text
handleMaskPointerDown / Move / Up / Leave
handleStageWheel
setCameraCenter
setPreviewCenter
setPreviewFov
setPreviewLocked
setPreviewMaskOpacity
smoothMaskMove
cutHere
flushTimeline
```

PC editor 的主舞台是：

```text
<section className="aframe-sphere-stage" data-testid="aframe-video-sphere-player">
```

PC workbench 模式下还会覆盖一层：

```text
<div className="xr-pc-stage-hit-layer" data-testid="xr-pc-stage-hit-layer" />
```

这层用于捕获桌面端 pointer 手势，避免依赖 A-Frame mesh picking。

## 当前交互清单

### 1. 普通拖动浏览 360 视角

交互：

```text
普通左键拖动
```

行为：

```text
转动 360 相机视角
不移动 crop mask
不写入 mask path
```

实现位置：

```text
controls/inputs/usePcMaskPointerInput.ts
controls/operations/cameraOperations.ts
```

关键细节：

`cameraOperations.ts` 不只更新 A-Frame `rotation/object3D`，也同步更新 `look-controls` 内部的 `yawObject/pitchObject`。否则 debug state 可能变化，但真实画面会被 `look-controls` 覆盖，看起来没有转动。

VR 迁移说明：

这对应 headset/controller 的 browse mode。自然浏览不应该写入取景路径，除非用户明确进入编辑或采样动作。

### 2. 普通点击移动遮罩

交互：

```text
普通点击视频画面
```

行为：

```text
把屏幕点转换为球面 yaw/pitch
crop mask 平滑移动到目标
移动结束后 flush timeline
```

实现位置：

```text
controls/inputs/usePcMaskPointerInput.ts
controls/operations/viewGeometry.ts
controls/operations/maskOperations.ts
controls/PcTrajectoryRippleCorrector.tsx
```

关键函数：

```text
screenPointToViewCenter(...)
```

VR 迁移说明：

这是 PC 端的 ray target selection。VR 端可用 controller ray 或 head ray 得到方向，再调用 `moveMaskTo`。

### 3. Ctrl + 点击立即移动遮罩

交互：

```text
Ctrl + 点击视频画面
```

行为：

```text
把屏幕点转换为 yaw/pitch
crop mask 立即跳到目标点
duration = 0
```

实现位置：

```text
controls/inputs/usePcMaskPointerInput.ts
mask.moveMaskTo(target, 0)
```

VR 迁移说明：

可以映射为 snap action，例如 trigger + modifier。

### 4. Ctrl + 拖动遮罩

交互：

```text
Ctrl + 左键拖动
```

行为：

```text
移动 crop mask
不转动相机
```

实现位置：

```text
controls/inputs/usePcMaskPointerInput.ts
mask.nudgePreviewCenterBy(...)
```

VR 迁移说明：

对应 controller grab/drag viewport frame。这里的语义是移动取景框，不是浏览相机。

### 5. Ctrl + 边缘拖动时相机和遮罩一起平移

交互：

```text
Ctrl + 拖动遮罩到屏幕边缘并保持
```

行为：

```text
相机和 crop mask 一起移动
避免遮罩拖到桌面可视边界后拖不过去
```

实现位置：

```text
controls/inputs/usePcEdgePan.ts
controls/operations/viewGeometry.ts
controls/operations/maskOperations.ts
controls/PcTrajectoryRippleCorrector.tsx
```

关键 operation：

```text
mask.bindMaskAndCameraBy(...)
```

关键细节：

`usePcEdgePan` 使用 ref 保存最新 mask operation，避免 crop state 每帧更新时重建 edge-pan 动画循环。

VR 迁移说明：

VR 端可以做成“抓住取景框拖到舒适视野边缘后，世界和取景框一起继续平移”。不要重新写插值逻辑，复用 `bindMaskAndCameraBy`。

### 6. WASD 连续移动遮罩

交互：

```text
按住 W / A / S / D
```

行为：

```text
W pitch up
S pitch down
A yaw left
D yaw right
连续移动 crop mask center
```

实现位置：

```text
controls/inputs/usePcKeyboardShortcuts.ts
mask.setPreviewCenter(...)
```

当前速度：

```text
KEYBOARD_MASK_SPEED_DEG_PER_SECOND = 42
```

VR 迁移说明：

对应 thumbstick nudge / D-pad nudge。使用连续速度，不要做成离散按钮跳动。

### 7. Q/E 连续缩放遮罩 FOV

交互：

```text
按住 Q / E
```

行为：

```text
Q 缩小 mask FOV
E 放大 mask FOV
连续、平滑变化
```

实现位置：

```text
controls/inputs/usePcKeyboardShortcuts.ts
controls/operations/maskOperations.ts
```

当前速度：

```text
KEYBOARD_MASK_FOV_SPEED_DEG_PER_SECOND = 48
```

关键细节：

Q/E 使用 `requestAnimationFrame` 连续变化，不依赖系统按键 repeat。`maskOperations.ts` 对 FOV flush 做了延迟合并，避免长按时频繁 flush 造成卡顿。

VR 迁移说明：

对应 pinch、grip + thumbstick、空间 dial。VR 端也应该做连续变化，而不是每次固定跳 5 度。

### 8. 普通滚轮缩放相机 FOV

交互：

```text
鼠标滚轮
```

行为：

```text
缩放 360 相机 FOV
支持非常小的 FOV，用于 tiny-planet / 起飞式预览
```

实现位置：

```text
controls/inputs/usePcWheelZoom.ts
controls/use360VideoPlaybackController.ts
```

当前相机 FOV 范围：

```text
MIN_FOV = 1
MAX_FOV = 140
```

VR 迁移说明：

这是浏览相机缩放，不是 mask FOV。真实 VR 头显中可能不需要同等功能，但可用于 spectator view 或 debug preview。

### 9. H + 滚轮调整黑色遮罩深度

交互：

```text
按住 H + 鼠标滚轮
```

行为：

```text
滚轮上：增加黑色遮罩 opacity
滚轮下：降低黑色遮罩 opacity
```

实现位置：

```text
controls/inputs/usePcKeyboardShortcuts.ts
controls/inputs/usePcWheelZoom.ts
controls/operations/maskOperations.ts
webxr/AFrameCropViewportMask.tsx
```

关键细节：

H/T/R 这类 wheel modifier 使用同步 ref `rateWheelTargetRef`。这样刚按下 H 后立刻滚轮，也会优先进入 mask opacity 分支，不会被普通滚轮相机缩放抢走。

VR 迁移说明：

可以映射为 modifier + thumbstick，或空间 opacity slider。最终调用 `setPreviewMaskOpacity`。

### 10. 播放速度和记录速度

交互：

```text
按住 T + 滚轮 -> playback speed
按住 R + 滚轮 -> recording speed intent
```

实现位置：

```text
controls/inputs/usePcKeyboardShortcuts.ts
controls/inputs/usePcWheelZoom.ts
controls/operations/rateCurve.ts
controls/operations/playbackOperations.ts
controls/operations/recordingOperations.ts
```

范围：

```text
0.1x .. 5x
```

VR 迁移说明：

`rateCurve.ts` 是可复用曲线。VR dial / slider / thumbstick 调速都应该复用它。

### 11. Lock / Unlock

交互：

```text
右侧 workbench 的 Lock / Unlock 按钮
```

行为：

```text
在 locked mask 和 head-gaze follow state 之间切换
切换后 flush timeline lock state
```

实现位置：

```text
ui/PcWorkbenchPanel.tsx
controls/operations/maskOperations.ts
webxr/AFrameCropViewportMask.tsx
```

VR 迁移说明：

可映射为 controller aim start/end，或者显式空间按钮。timeline semantic event 已经有 lock/unlock 相关概念。

## UI 组件位置

### 播放控制

```text
ui/PcPlayerControls.tsx
```

包含：

```text
play / pause
seek
next / previous source
playlist toggle
playback speed reset
recording speed reset
close overlays
```

相关操作：

```text
controls/operations/playbackOperations.ts
controls/use360VideoPlaybackController.ts
controls/AFrame360VideoControlBridge.tsx
```

VR 迁移说明：

视觉布局不迁移，但命令组要保留。VR 端可做成空间媒体控制条或 controller shortcut。

### 取景工作台

```text
ui/PcWorkbenchPanel.tsx
```

包含：

```text
Yaw left / right
Pitch up / down
FOV in / out
Opacity slider
Lock / Unlock
Flush
Cut
Start crop
End crop
Render crop
Download export
```

相关操作：

```text
smoothMaskMove
setPreviewFov
setPreviewMaskOpacity
setPreviewLocked
flushTimeline
cutHere
renderTest
```

VR 迁移说明：

这代表当前 framing / timeline / export 的命令集合。VR 端应该重新设计空间布局，但不要改变语义分组。

### Effects Rack

```text
ui/PcEffectsPanel.tsx
ui/PcEffectPreview.tsx
```

交互：

```text
点击 effect tile
Tab -> 选择分类 -> 数字键选择 effect
```

行为：

```text
dispatch createEffectEvent
通过 timeline bridge 发送 EffectEventsPatch
屏幕下方显示简约半透明提示
```

timeline bridge 路径：

```text
data/timeline-bridge/events/semanticEvents.ts
data/timeline-bridge/AFrameTimelineBridge.ts
data/timeline-bridge/transport/effectEventQueue.ts
```

关键设计：

`PcEffectPreview` 不是全屏视觉效果层，只是底部提示。这样不会和 crop mask 黑色遮罩叠加，避免影响真实取景判断。

VR 迁移说明：

VR 端可改成 radial menu、wrist menu 或空间面板，但仍然 dispatch `createEffectEvent`。

### BGM 控制

```text
ui/PcBgmControls.tsx
```

当前行为：

```text
加载 BGM tracks
选择 / 清除 session BGM
试听 BGM 文件本身
同步 BGM 到 session API
```

VR 迁移说明：

BGM 选择是否进头显需要另行决定。底层 session music API 可复用。

### Debug State

```text
ui/PcEditorDebugState.tsx
```

暴露隐藏测试状态：

```text
aframe-video-control-state
aframe-crop-mask-state
aframe-timeline-bridge-state
```

说明：

这是 Playwright 的重要测试接口。不要随意移除，除非提供新的测试 seam。

### 样式

```text
ui/PcWebXrEditor.module.css
```

包含 PC editor 的 stage、hit layer、播放器控件、workbench、effects、BGM 等样式。

VR 迁移说明：

这些 DOM 样式不是 VR 空间 UI 模板，只能作为视觉/信息层次参考。

## Operation 文件索引

### Camera

```text
controls/operations/cameraOperations.ts
```

职责：

```text
setCameraCenter
normalize yaw/pitch
同步 A-Frame rotation、object3D rotation、look-controls yaw/pitch
```

### Mask

```text
controls/operations/maskOperations.ts
```

职责：

```text
setPreviewCenter
nudgePreviewCenterBy
moveMaskBy
moveMaskTo
bindMaskAndCameraBy
setPreviewFov
setPreviewLocked
setPreviewMaskOpacity
debounced timeline flush
dispatch crop mask custom events
```

这是 VR 迁移最重要的复用层之一。

### Timeline

```text
controls/operations/timelineOperations.ts
data/timeline-bridge/
```

职责：

```text
flush path patches
cut here
pause/resume sampling
effect event queue
playback state reporting
```

### Playback

```text
controls/use360VideoPlaybackController.ts
controls/operations/playbackOperations.ts
controls/videoControlEvents.ts
controls/AFrame360VideoControlBridge.tsx
```

职责：

```text
加载 source list
切换 video source
play / pause / seek
相机 FOV zoom
playback rate
playlist state
```

## A-Frame / WebXR 组件索引

Scene：

```text
webxr/AFrameEditorScene.tsx
```

Crop mask：

```text
webxr/AFrameCropViewportMask.tsx
```

Crop arcs / viewport frame：

```text
webxr/AFrameCropViewportArcs.tsx
```

Runtime：

```text
webxr/useAFrameRuntime.ts
webxr/aframeXrCompat.ts
```

FOV helper：

```text
viewFov.ts
```

VR 迁移说明：

Crop mask 已经通过 custom event 接收 center、FOV、opacity、lock。VR 端可以通过 operation 间接触发同一套事件。

## 后端协议

共享类型：

```text
apps/web/src/lib/path-protocol.ts
```

主要 payload：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
SessionMusicConfig
```

PC editor 当前使用的后端能力：

```text
path patches
effect events
playback state
render-test
session music
BGM tracks
```

VR 迁移原则：

不要发明 Quest-only wire protocol。优先复用 timeline bridge 和 semantic event。

## 自动化测试覆盖

主文件：

```text
apps/web/e2e/webxr-crop-render.spec.ts
```

关键测试：

```text
pointer click on the video sphere moves the mask target and render
pointer clicks on each side of the video sphere move the mask in matching directions
PC lock toggle switches between locked mask and head-gaze follow state
plain drag rotates the 360 view without moving the mask
Ctrl drag on the video sphere moves the mask without moving the camera
Ctrl drag at the screen edge pans camera and mask together
Ctrl click on the video sphere moves the mask without transition
holding Q and E resizes the mask continuously
holding WASD moves the mask continuously
mouse wheel can zoom the 360 camera into tiny-planet style FOV
holding H and using the wheel adjusts mask opacity
effect rack sends an effect event and shows a WebXR preview
vertical 90 degree pitch stress sends a matching timeline path and render
FOV zoom in/out sends a matching timeline path and render
PC workflow start/end/render buttons run a complete crop export
```

VR 迁移建议：

真实头显自动化不稳定时，先做 probe route，模拟 controller semantic event，验证 operation 和 timeline payload。

## VR 迁移建议

### 第一步：保留 operation，替换 input adapter

优先复用：

```text
maskOperations
timelineOperations
playbackOperations
recordingOperations
rateCurve
viewGeometry
```

替换 PC 输入层：

```text
usePcMaskPointerInput
usePcKeyboardShortcuts
usePcWheelZoom
usePcEdgePan
```

为 VR 输入层：

```text
controller ray click
controller grab / drag
thumbstick nudge
pinch or grip+stick FOV
modifier + stick opacity
```

### 第二步：timeline 走 semantic event

优先使用：

```text
dispatchWebXrTimelineEvent({ type: "createEffectEvent", ... })
dispatchWebXrTimelineEvent({ type: "controllerAimStart", ... })
dispatchWebXrTimelineEvent({ type: "controllerAimEnd", ... })
```

避免 VR UI 直接散落 API 调用。

### 第三步：重做空间 UI，但保留命令分组

PC 当前命令分组：

```text
Player controls
Framing workbench
Effects rack
BGM/session controls
Render/export status
```

VR 不应该照搬：

```text
右侧固定 DOM 面板
mouse hover 假设
keyboard-only shortcut
DOM range slider 作为主要输入
```

### 第四步：保留当前交互语义

应该迁移的核心语义：

```text
浏览相机不等于编辑 mask
明确点选目标才移动 mask
拖动 mask 到边缘时，相机和 mask 一起移动
FOV 是连续变化，不是按键阶梯跳动
黑色遮罩深度是独立可调控制
effects 是真实 timeline event，不只是 UI 反馈
```

## 当前已知限制

1. BGM preview 目前主要是试听 BGM 文件本身，还不是完整的视频+BGM 混合成片预览。
2. Effects preview 是底部提示，不模拟最终导出效果。
3. 真实 Quest controller 输入仍需要实机验证；Playwright 主要验证语义和 DOM/A-Frame 状态。
4. `PcEditorDebugState` 目前承担测试 seam，不应在没有替代方案前移除。

## 一句话总结

当前 PC editor 已经可以作为 VR editor 的语义参考实现：鼠标和键盘只是输入适配器，真正值得迁移的是 operation 层、timeline bridge、crop mask event model，以及已经被自动化测试锁住的交互契约。
