# Three Official Interactive Lab 当前代码情况

日期：2026-05-24

本文只记录 `http://127.0.0.1:3001/xr/three-official-interactive-lab` 当前实际代码状态，用于后续把 PC editor 的交互迁移到 Quest / WebXR 端。本文不是改造方案，也不代表已经开始迁移实现。

## 页面入口

路由入口：

```text
apps/web/app/xr/three-official-interactive-lab/page.tsx
```

该 route 只负责渲染一个组件：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
```

核心页面目前是一个 Three.js 原生 WebXR lab，主要验证：

```text
Three.js WebGLRenderer.xr
HTMLMesh
InteractiveGroup
XRControllerModelFactory
360 视频球
PC editor crop mask shader 复用
WebXR semantic timeline event 派发
```

## 当前定位

这个页面已经不是纯视觉原型。它已经有真实 360 视频源、视频球、遮罩 shader、空间 HTMLMesh 面板、Quest controller ray、controller model，以及一部分语义事件派发。

但它也还不是完整的 Quest editor。当前更准确的定位是：

```text
Three.js 官方交互路径验证页
       +
PC editor 部分语义事件桥接实验页
       +
Quest 空间 UI/输入层迁移的候选底座
```

后续迁移时，不能把它当成已经完成的 VR editor。它目前缺少 PC editor 已经稳定下来的很多编辑语义和高频操作细节。

## 运行时结构

主组件内部直接创建 Three.js runtime：

```text
new Scene()
new PerspectiveCamera()
new WebGLRenderer({ antialias: true, alpha: true })
renderer.xr.enabled = true
renderer.setAnimationLoop(...)
```

WebXR 进入按钮不是使用 Three.js 默认 `VRButton`，而是组件内创建的普通 DOM button：

```text
data-testid="three-official-vr-button"
```

它会检查：

```text
navigator.xr.isSessionSupported("immersive-vr")
navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] })
```

设置 XR session 时调用：

```text
apps/web/src/components/xr/webXrLabCompat.ts
setRendererSessionWithLabFallback(renderer, session)
```

这个 fallback 用来处理 `XRWebGLBinding` 相关兼容问题。若 Three.js 新路径失败，会临时隐藏 `window.XRWebGLBinding`，回落到 legacy `XRWebGLLayer` 路径。

## 视频播放层

页面有一个隐藏的 `<video>`：

```text
data-testid="three-official-video-source"
```

视频源加载逻辑：

```text
GET /api/xr/video-sources
```

如果接口失败，会回退到：

```text
/api/sample-video
```

支持两类 source：

```text
mp4
hls
```

HLS 逻辑使用：

```text
hls.js
```

视频纹理进入 Three.js：

```text
new VideoTexture(video)
new SphereGeometry(18, 64, 32)
MeshBasicMaterial({ map: videoTexture, side: BackSide })
```

当前视频球名称：

```text
three-official-video-sphere
```

视频球旋转：

```text
videoSphere.rotation.y = -Math.PI / 2
```

这意味着后续做 controller ray -> video yaw/pitch 时，需要保持和这层坐标偏移一致，不能只按默认球面坐标推导。

## Crop Mask 层

当前页面已经复用 PC editor 的遮罩 shader：

```text
createCropViewportMaskFragmentShader()
```

来源：

```text
apps/web/src/features/webxr/pc-editor/webxr/AFrameCropViewportMask
```

遮罩不是 A-Frame entity，而是 Three.js sphere mesh：

```text
new SphereGeometry(17.5, 96, 48)
new ShaderMaterial(...)
```

关键 uniforms：

```text
uCenterYaw
uCenterPitch
uFov
uCornerRadius
uFeather
uLocked
uOpacity
uTime
```

当前值域：

```text
fov: 48 - 112
uOpacity: 固定 0.74
uCornerRadius: 固定 0.18
uFeather: 固定 0.195
```

当前遮罩中心状态使用：

```text
ViewTargetPose
{
  input: "head_gaze" | "controller_ray" | ...
  yaw: number
  pitch: number
}
```

页面每帧把 `viewTargetRef.current` 写入 shader uniforms。也就是说，后续如果迁移 PC editor 的移动、拖动、锁定、平滑位移，优先应该改 `viewTargetRef / setViewTarget / commitViewTarget` 这条链路，而不是另起一套遮罩中心状态。

## Reticle / 目标点显示

页面有一个目标 reticle：

```text
three-official-view-target-reticle
```

它用 `RingGeometry` 创建，位置由当前 `viewTarget` 转成方向后，放在 camera 前方约 `2.05` 距离：

```text
viewTargetToDirection(pose, markerDirection)
targetReticle.position = cameraWorldPosition + markerDirection * 2.05
```

颜色含义：

```text
locked: cyan
controller_ray follow: orange
head_gaze follow: magenta
```

这个 reticle 目前是“中心点提示”，不是完整 PC editor 取景框边框、四角 handle 或遮罩可拖动框。

## 空间 UI 结构

当前页面使用 DOM 写 UI，再通过 Three.js `HTMLMesh` 投射到 3D 空间。

三个主要 DOM 面板：

```text
playerRef -> three-official-player-ui
sourceRef -> three-official-source-ui
popupRef  -> three-official-popup-ui
```

对应 Three.js mesh：

```text
official-htmlmesh-player
official-htmlmesh-workbench
official-htmlmesh-extension
```

它们被加入同一个：

```text
InteractiveGroup
```

并开启两类交互监听：

```text
group.listenToPointerEvents(renderer, camera)
group.listenToXRControllerEvents(controller1)
group.listenToXRControllerEvents(controller2)
```

这说明当前的空间按钮点击路径是 Three.js 官方 `HTMLMesh + InteractiveGroup` 路径，不是 A-Frame raycaster，也不是自定义 DOM overlay。

## Workbench 面板

主 workbench 面板 `three-official-source-ui` 提供：

```text
CUT
LOCK / UNLOCK
SAVE
PLAY
FLUSH
DISCARD
RESTORE
FRAME
FOV
FX
EXPORT
SESSION
SAMPLER
FOV range input
状态 readout
```

按钮事件通过原生 DOM `click` 绑定：

```text
button[data-action]
button[data-module]
```

已派发的 semantic events 包括：

```text
cutHere
playPause
flushPath
discardRange
restoreRange
lockViewport
unlockViewport
```

注意：`SAVE` 和 `FLUSH` 当前都只是派发 `flushPath`。它没有完整的 session 保存确认流程。

## Popup / 扩展面板

`three-official-popup-ui` 根据 `openModule` 显示不同内容。

当前支持：

```text
FX page prev / next
FOV- / FOV+
FADE / MARK effect
CLOSE
```

FOV 按钮派发：

```text
nudgeFov
flushPath(reason="fov")
```

特效按钮派发：

```text
createEffectEvent
```

当前 effect 映射：

```text
fade -> transition.fade_black
mark -> highlight
```

事件 params 里会带：

```text
source: "three-official-interactive-lab"
```

这说明特效已经接到了 PC editor 的 semantic event 协议，但当前没有 PC editor 那种屏幕下方 80% 透明提示弹窗，也没有真实视频画面特效预览层。

## Player 面板

`three-official-player-ui` 是一个空间播放器面板。当前已经从早期竖向展示面板，推进为更接近 PC editor 的 `PLAYBACK CORE` 工作条结构。

当前支持：

```text
PREV / NEXT source
PLAY / PAUSE
双手 select 同按 PLAY / PAUSE
seek range input
0.5X / 1X / 2X rate
playlist 前 3 项
DIM / RESTORE UI
```

播放器语义事件：

```text
playPause
seekTo
```

播放速率、source 切换和 UI dim 当前只改本地 React state / video element，没有派发后端 timeline 语义事件。

当前播放器 UI 的主要 test id：

```text
three-official-player-ui
three-official-player-status-strip
three-official-player-progress
```

## Controller / XR 输入

当前创建两个 controller：

```text
renderer.xr.getController(0)
renderer.xr.getController(1)
```

每个 controller 添加一条 cyan ray：

```text
official-controller-ray
scale.z = 5
```

并创建 controller grip model：

```text
XRControllerModelFactory.createControllerModel(...)
```

### Select / Trigger

当前绑定：

```text
单手 selectstart -> queueHeadGazeFollow
单手短按 selectend -> controller ray 点选视频球，平滑移动遮罩
单手长按 selectend -> commitHeadGazeFollow
左右手 selectstart 在 160ms 内同时出现 -> playPause
```

逻辑：

```text
selectstart 后先等待 280ms
如果 280ms 内短按释放，则把 controller ray 与视频球求交，转换成 yaw/pitch
如果还没松开，则进入 head_gaze follow
selectend 时，如果处于 head_gaze follow，就 commit 当前头显视线方向
如果左右手 select 在 160ms 内同时按下，则取消 head gaze pending，直接切换播放/暂停
```

进入 follow 时派发：

```text
unlockViewport
```

释放 commit 时派发：

```text
setViewTarget
lockViewport
flushPath(reason="lock")
```

当前已经实现：

```text
trigger 单击视频球 -> 平滑移动遮罩
synthetic/debug instant trigger -> 立即移动遮罩
```

当前还没有实现：

```text
trigger drag mask frame -> 拖动遮罩
```

### Squeeze / Grip

当前绑定：

```text
squeezestart -> beginControllerFollow(controller, hand)
squeezeend   -> commitControllerFollow(controller, hand)
```

逻辑：

```text
按住 grip 时，遮罩中心跟随 controller ray 与视频球的命中点
拖动过程中每帧更新 preview yaw/pitch
松开时 commit 当前球面命中点
```

开始和结束会派发：

```text
controllerAimStart
controllerAimEnd
```

commit 时同样派发：

```text
setViewTarget
lockViewport
flushPath(reason="lock")
```

当前 grip follow 已经复用 trigger click 的 ray-sphere intersection。后续如果要做完整 PC editor 的遮罩拖动，还需要补可抓取的 mask frame / handle、拖动取消、边缘联动视角等状态。

### Right Thumbstick

在 animation loop 中读取当前 XR session 的 inputSources：

```text
inputSource.handedness === "right"
gamepad.axes[3] 或 axes[1]
```

当前已经改为按帧连续积分，而不是 `260ms` step。

```text
deadzone: 0.18
max speed: 34 deg / second
yAxis < 0 -> FOV in
yAxis > 0 -> FOV out
```

按住时持续派发：

```text
nudgeFov
```

摇杆回中后 debounce 约 `260ms`，再派发一次：

```text
flushPath(reason="fov")
```

这比旧的离散 step 更接近 PC editor 里 Q/E 长按的平滑缩放体验。后续如果要继续贴近 PC editor，可以加入轻推/推到底不同加速度曲线、边界短闪反馈。

### Left Grip + Right Thumbstick

左手 grip 当前作为安全 modifier，不再直接做遮罩拖动。按住左手 grip 时，右手 thumbstick 上下改为调节黑色遮罩透明度：

```text
left grip hold:
  enter mask-opacity modifier

right thumbstick up:
  increase mask opacity / deepen black mask

right thumbstick down:
  decrease mask opacity / lighten black mask

left grip release:
  exit mask-opacity modifier
```

透明度范围：

```text
0.00 - 0.95
default: 0.74
max speed: 0.72 / second
```

该操作只更新本地 preview shader uniform：

```text
uOpacity
```

它不派发 timeline semantic event，因为 mask opacity 目前是编辑器预览参数，不是后端 view path 的一部分。

## Desktop / 非 XR 输入

页面的 desktop 交互主要用于测试 HTMLMesh 与 HUD：

```text
鼠标可以点击 HTMLMesh 上的 DOM button
可以点击 ENTER META VR 按钮
可以看 HUD state / last action / last semantic
```

当前没有 PC editor 那套 desktop 输入：

```text
普通左键拖动转动 360 相机
普通点击平滑移动遮罩
Ctrl + 点击立即移动遮罩
Ctrl + 拖动遮罩
Ctrl + 边缘拖动带动视角
WASD 移动遮罩
Q/E 平滑缩放遮罩
鼠标滚轮大范围 camera FOV
H + 鼠标滚轮调黑色遮罩透明度
```

这对后续迁移很重要：不能用这个页面的 desktop 行为判断 PC editor 行为是否已经迁移成功。这个页面目前 desktop 只是 lab 操作台。

## Semantic Event 桥接

页面直接调用：

```text
dispatchWebXrTimelineEvent(event)
```

类型来自：

```text
apps/web/src/features/webxr/pc-editor/data/timeline-bridge
```

当前主要派发：

```text
playPause
seekTo
lockViewport
unlockViewport
setFov
nudgeFov
discardRange
restoreRange
cutHere
createEffectEvent
flushPath
setViewTarget
controllerAimStart
controllerAimEnd
```

这是本页面最有价值的迁移基础：UI 和输入可以换成 Quest 语法，但业务层应该继续落到同一套 semantic event。

## 当前状态显示与测试锚点

HUD 显示：

```text
three-official-last-action
three-official-last-semantic
three-official-playback-status
three-official-view-target
three-official-mask-opacity
```

主要 test id：

```text
three-official-interactive-lab
three-official-canvas
three-official-vr-button
three-official-video-source
three-official-player-ui
three-official-source-ui
three-official-popup-ui
```

当前已有专门覆盖该页面的 Playwright spec：

```text
apps/web/e2e/three-official-interactive-lab.spec.ts
```

该 spec 目前覆盖：

```text
页面加载
canvas 可见
canvas 像素非空
PLAYBACK CORE 播放器 UI
双手 select 同按 -> playPause
短按 controller select -> controller ray 点选视频球并移动遮罩
grip hold -> controller ray 连续拖动遮罩
right thumbstick hold -> 连续平滑 FOV
left grip + right thumbstick -> 调节 mask opacity
普通点击视频球 -> 平滑移动遮罩目标
Ctrl + 点击视频球 -> 立即移动并锁定遮罩目标
last semantic 最终落到 flushPath(reason=lock)
```

仓库里还保留了一些截图和日志产物：

```text
apps/web/three-official-interactive-lab-*.png
apps/web/three-official-3120.out.log
apps/web/three-official-3120.err.log
```

后续每迁移一组交互，都应该补这个页面自己的自动化验证，而不是只依赖 PC editor 的 `webxr-crop-render.spec.ts`。

## 与 PC Editor 的主要差距

PC editor 当前稳定交互记录在：

```text
docs/project-docs/02-current-state/pc-editor-interaction-implementation.md
```

相对 PC editor，这个 Three lab 当前缺口如下：

```text
1. 已有 grip hold ray follow；还没有完整 mask frame / handle drag 状态机。
2. 已有 desktop click target 和 Quest controller trigger ray click -> smooth mask move。
3. 已有 desktop Ctrl + click instant move；Quest modifier / snap move 手柄语义还没有正式绑定到物理键。
4. 没有边缘拖动时 camera + mask 同步移动。
5. 已有 right thumbstick 连续平滑 FOV；还没有边界短闪、轻推/推到底加速度分层。
6. 已有 left grip + right thumbstick mask opacity；还没有空间 UI slider / preset。
7. 没有 PC 的普通拖动浏览视角。
8. 没有 WASD / Q / E / wheel / H+wheel 这些 desktop 快捷操作。
9. desktop pointer、controller short select、grip hold 已经具备 ray -> sphere yaw/pitch；mask handle / edge pan 还没有迁移。
10. 没有特效的真实 WebXR 画面预览，只派发 effect event。
11. 没有完整 timeline bridge context，例如 sessionId / videoId / 后端 path patch sender。
12. UI 仍是实验性赛博面板，不是最终 Quest editor 的简约可读空间 UI。
```

## 可以复用的部分

后续迁移 PC editor 交互到这个页面时，优先复用：

```text
Three.js WebXR session 初始化
HTMLMesh + InteractiveGroup 空间按钮路径
controller model / controller ray 初始化
360 VideoTexture sphere
PC editor crop mask shader
ViewTargetPose yaw/pitch 模型
dispatchWebXrTimelineEvent semantic event 协议
HUD test id 和 last semantic 调试输出
```

这些部分已经证明能在同一个页面里协作，不需要推倒重来。

## 需要重写或补强的部分

后续真正迁移时，建议新增独立输入层，而不是继续把所有逻辑堆在组件里：

```text
Quest controller input adapter
Ray/sphere hit geometry helper
Mask drag state machine
Smooth move / instant move operation
Effect preview adapter
Timeline bridge session binding
Automated test helpers
```

理想结构应该接近 PC editor 的分层：

```text
input adapter -> semantic operation -> view/mask state -> timeline/event bridge
```

而不是：

```text
controller event -> 直接改 React state -> 顺手 dispatch event
```

## 下一步迁移建议

在开始改代码前，建议按以下顺序拆小步：

```text
1. 先给本页面补基础自动化：页面加载、canvas 非空、HUD 状态、按钮 semantic event。
2. 抽出 viewTarget / fov / lock 的 operation helper。
3. 在 grip hold ray follow 基础上补 mask frame / handle drag 状态机。
4. 为 mask opacity 补空间 UI slider / preset。
5. 最后再迁移 effect preview 和更复杂面板。
```

这个顺序能把风险压在坐标系统和输入状态机上，而不是一开始就混入 UI 重构。
