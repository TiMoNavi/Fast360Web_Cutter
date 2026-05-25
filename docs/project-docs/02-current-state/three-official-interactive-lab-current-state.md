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
new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
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
uOpacity: 0.00 - 0.95，默认 0.74
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

### Crop Frame 与遮罩尺寸对齐

`crop frame` 不再使用 `fov / 82` 这种视觉近似缩放。它现在和 shader 使用同一套角度口径：

```text
hFov = fovRef.current
vFov = verticalFovFromHorizontal(hFov)
distance = CROP_FRAME_DISTANCE = 2.08

frameWidth  = 2 * distance * tan(hFov / 2)
frameHeight = 2 * distance * tan(vFov / 2)
```

也就是说，crop frame 在相机前固定距离处显示时，水平/垂直张角应与灰色遮罩窗口一致。后续如果用户仍觉得边缘不完全贴合，优先检查：

```text
shader feather
corner radius
mask opacity 造成的视觉边界主观偏移
球面投影边缘畸变
```

不要再通过任意缩放 crop frame 去“目测对齐”，否则不同 FOV 下会再次偏。

2026-05-24 位置对齐补充：

```text
早期 crop frame 的中心位置是：
  cameraPosition + viewTargetDirection * CROP_FRAME_DISTANCE

这个写法在相机不在视频球/遮罩球中心时会产生视差。
Quest / desktop preview 里 camera 有头部高度，crop mask shader 却是在球体 local direction 上计算透明窗口。
结果就是 frame 尺寸看起来对了，但中心会比实际灰色遮罩窗口略高。

现在 crop frame 和 center reticle 的中心方向改为：
  spherePoint = cropMaskWorldCenter + viewTargetDirection * CROP_MASK_RADIUS
  apparentDirection = normalize(spherePoint - cameraPosition)
  framePosition = cameraPosition + apparentDirection * CROP_FRAME_DISTANCE

这样 frame 仍保持相机前固定距离，尺寸仍按 hFOV/vFOV 计算；
但中心会对齐用户实际看到的球面遮罩窗口。
```

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

当前视觉反馈已经包含三层：

```text
center reticle:
  当前遮罩中心。

crop frame:
  跟随当前遮罩中心和 FOV 缩放的取景框反馈。
  DRAG / GAZE / AIM / LOCKED 会使用不同颜色和透明度。

target ring:
  trigger / pointer 点选移动时，在目标点短暂显示。
```

这已经比早期“只有 shader + reticle”更接近可操作取景框，但还不是完整 mask frame / handle 系统。后续仍需要 hover handle、drag handle、cancel drag、edge pan 等更细状态。

## 空间 UI 结构

当前页面使用 DOM 写 UI，再通过 Three.js `HTMLMesh` 投射到 3D 空间。

四个主要 DOM 面板：

```text
playerRef -> three-official-player-ui
sourceRef -> three-official-source-ui
popupRef  -> three-official-popup-ui
statusRef -> three-official-mode-strip
```

对应 Three.js mesh：

```text
official-htmlmesh-player
official-htmlmesh-workbench
official-htmlmesh-extension
official-htmlmesh-mode-strip
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
点选移动时显示 target ring
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

当前 grip follow 已经复用 trigger click 的 ray-sphere intersection。拖动时会让 crop frame 进入 DRAG 视觉状态。后续如果要做完整 PC editor 的遮罩拖动，还需要补可抓取的 mask frame / handle、拖动取消、边缘联动视角等状态。

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
three-official-mode-strip
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
mode strip -> IDLE / AIM / DRAG / GAZE / FOV / OPACITY / LOCKED
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
1. 已有 grip hold ray follow 和基础 crop frame；还没有完整 mask handle drag 状态机。
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
12. UI 已开始补模式条和 crop frame，但整体仍是实验性赛博面板，不是最终 Quest editor 的简约可读空间 UI。
```

## 交互按钮迁移核对

用户关心的“有没有按钮或交互功能落下”，答案是：**有，尤其是 UI / 工作流按钮层面还差很多**。当前 Three lab 已经补上了不少高频取景输入，但还没有完整迁移 PC editor 的工作台、Effects Rack、BGM、录制/导出闭环。

### 2026-05-24 推进前代码核实结论

本次按实际代码核对了：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
apps/web/src/features/webxr/pc-editor/PcWebXrEditor.tsx
apps/web/src/features/webxr/pc-editor/ui/PcPlayerControls.tsx
apps/web/src/features/webxr/pc-editor/ui/PcWorkbenchPanel.tsx
apps/web/src/features/webxr/pc-editor/ui/PcEffectsPanel.tsx
apps/web/src/features/webxr/pc-editor/ui/PcBgmControls.tsx
```

结论不是“没有按钮落下”，而是：

```text
没有落下的:
  播放/暂停按钮与 Quest 双 select 播放暂停。
  基础 CUT / LOCK / FLUSH / DISCARD / RESTORE。
  FOV UI 与右摇杆连续调节。
  黑场特效的最小入口，当前是 FX popup 的 FADE。
  特效弹窗的基础呼出，当前是 workbench FX -> popup extension。

明确落下或只占位的:
  开始录制 / 结束录制，也就是 PC 的 Start crop / End crop 工作流。
  Render / Export / Download 闭环，当前只有 EXPORT 模块入口或占位语义。
  BGM / 伴奏面板，Three lab 当前没有 PcBgmControls 等价能力。
  完整 Effects Rack，当前只有 FADE / MARK 的极小集合。
  录制倍率 recording rate。
  discard 按住生成范围、松开结束范围的完整工作流。
  session / timeline / export 的 pending、accepted、error 状态面板。
```

因此继续推进时，P0 不应该再优先堆取景快捷键，而应该先补三块 UI / 工作流：

```text
1. Start crop / End crop / Render / Download 状态入口。
2. FX popup 升级为 Effect Tray，至少补 Black fade / White flash / VHS blank。
3. BGM / 伴奏入口，先做到可见、可选择、可试听或明确 session 未绑定状态。
```

2026-05-24 后续补充：P0 的 UI 层已经先补了一个实验版 `WORKFLOW` 入口。它不是完整后端闭环，但解决了“按钮完全缺席”的问题：

```text
入口:
  水平桌面 workbench 的 WORKFLOW 按钮。
  打开后使用原有 popup HTMLMesh 显示工作流弹窗。

开始录制:
  弹窗内最大的 START CROP 多圆环按钮。
  点击后 workflow 进入 RECORDING。
  派发 samplingResume。
  mode strip 进入 PENDING。

结束录制:
  END CROP 按钮。
  点击后 workflow 进入 READY TO RENDER。
  派发 samplingPause + flushPath(reason=live)。

渲染 / 下载:
  RENDER 按钮。
  当前是 lab preview render，不是真实后端 render-test。
  完成后显示 Download preview 链接。

BGM:
  弹窗内有 No BGM / Ambient / Kick 三个 lab 选择。
  有 PREVIEW BGM / PAUSE BGM 状态切换。
  当前不调用 PcBgmControls 的真实 listMusicTracks / updateSessionMusic。

快速特效:
  BLACK FADE -> transition.fade_black。
  WHITE FLASH -> transition.flash_white。
  VHS BLANK -> black.solid。
  都通过 createEffectEvent 派发语义事件。

录制审计 UI:
  WORKFLOW popup 增加 RECORD RATE。
  增加 PATH AUDIT 行，显示最后一个本地样本：
    seq / tMs / yaw / pitch / hFOV / vFOV。
  增加 EFFECT QUEUE 行，显示最近加入的快捷 effect。

后端桥接:
  页面支持可选 query：
    ?videoId=<videoId>&sessionId=<sessionId>
  没有 query 时仍是 lab preview only。
  有 query 时：
    END CROP 会把本地 lab samples 转成 ViewPathPatch。
    POST /api/cut-sessions/:sessionId/path-patches。
    RENDER 会调用 /api/cut-sessions/:sessionId/render-test。
    exportId 会生成真实 /api/exports/:exportId/download 链接。
```

新增自动化覆盖：

```text
apps/web/e2e/three-official-interactive-lab.spec.ts

three official lab exposes workflow popup for recording, effects, BGM, and render:
  打开 WORKFLOW popup。
  校验 START CROP 有 3 个 record ring。
  校验 RECORD RATE 和 PATH AUDIT。
  start crop -> samplingResume + RECORDING + PENDING。
  end crop -> READY TO RENDER + flushPath(reason=live)。
  BGM Ambient 选择。
  White flash effect event。
  render -> EXPORT READY + Download preview。

three official lab can send recorded path samples to backend without coordinate sign drift:
  使用 ?videoId=e2e-video&sessionId=e2e-session 进入 backend-bound lab。
  拦截 path-patches 请求并检查 payload。
  确认 patch.sessionId / patch.videoId 正确。
  确认 controller ray 点击生成的 yaw / pitch 都为正，不发生符号反转。
  确认 hFOV=82，vFOV 使用 verticalFovFromHorizontal 后为约 52.11。
  确认 replaceRange.endMs > replaceRange.startMs。
  拦截 render-test 并确认 export download href 指向 /api/exports/:id/download。

后端解析补充验证:
  python -m compileall apps/api 通过。
  使用 apps/api/app/models.py 的 ViewPathPatch 直接解析同型 payload 通过。
  验证输出保留 sessionId/videoId、2 个 points、yaw=9.23、pitch=7.32、vFOV=52.11。
  注意：这一步验证的是后端模型解析；尚未启动真实 FastAPI + SQLite 写库跑完整链路。
```

### 2026-05-24 B 键 hold-release 快捷菜单

新增一个 Quest 原生感更强的交互原型：**按住右手 B 键，在按下瞬间的右手手柄 3D 空间坐标生成 3x3 快捷菜单；持续按住时用右手手柄点位移动到格子内，高亮后松开 B 直接触发该格动作**。这类交互的意义是把 9 个高频动作压缩到一次按键手势里，熟练后不需要层层打开选单。

实现位置：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
```

实现方式：

```text
菜单不是 HTMLMesh，而是真 Three.js 3D tile group。
每个 tile 使用 CanvasTexture 绘制 label/subLabel。
右手 B 键通过 WebXR inputSource.gamepad.buttons[5].pressed 轮询。
右手锚点不再硬绑 controller2，而是根据 session.inputSources 中 handedness=right 的索引，取对应 getControllerGrip(index)。
B press:
  菜单出现在右手 grip 的世界坐标。
  位置 = B 按下那一刻的右手物理手柄 grip position。
  菜单朝向 = 打开时面向头显 camera。
  打开后菜单的空间坐标和朝向保持静止，不继续跟随手柄。
  视觉大小约两个拳头宽，不是视野中央的大面板。

B hold:
  读取当前右手 grip 世界坐标作为碰撞点。
  把该点转换到 quick menu group 的 local 坐标。
  local x/y 落入 3x3 cell 后高亮对应 tile。

B release:
  如果有选中 tile，立即执行该 tile action。
  如果没有选中，关闭菜单不触发。
```

当前 3x3 映射：

```text
START      END        RENDER
CUT        LOCK       BLACK FADE
FOV +      FOV -      WHITE FLASH
```

当前执行语义：

```text
START:
  startCropWorkflow()

END:
  endCropWorkflow()

RENDER:
  renderCropWorkflow()

CUT:
  cutHere

LOCK:
  lockViewport / unlockViewport + flushPath(reason=lock)

BLACK FADE:
  createEffectEvent(effectType=transition.fade_black)

WHITE FLASH:
  createEffectEvent(effectType=transition.flash_white)

FOV + / FOV -:
  nudgeFov + flushPath(reason=fov)
```

自动化入口：

```text
window.dispatchEvent(new CustomEvent("three-official-quick-menu", {
  detail: {
    phase: "press" | "aim" | "release",
    pointerPosition: { x, y, z },
    rayOrigin: { x, y, z },
    rayDirection: { x, y, z }
  }
}))
```

新增 e2e：

```text
three official lab supports B hold release quick menu selection:
  synthetic press 打开 quick menu。
  synthetic aim 命中中心 LOCK tile。
  release 后菜单关闭。
  mode strip 进入 LOCKED。
  last semantic 为 flushPath(reason=lock)。

three official lab quick menu selects by moving the controller point into an anchored tile:
  synthetic press 在固定 world point 打开 quick menu。
  synthetic aim 把 pointerPosition 移到左上 START tile。
  quick menu status 高亮 startCrop。
  release 后 workflow 进入 RECORDING。
```

真机注意：

```text
当前假设 Meta Quest Touch 右手 B 键是 gamepad button index 5。
如果真机上 B 无响应，需要先用现有 controller/gamepad probe 记录 buttons index，再把 QUICK_MENU_BUTTON_INDEX 调整为实测值。
菜单当前是 3x3；后续可以扩展为 radial wheel、分页 ring、或按熟练度动态重排。
如果用户觉得 collision point 太靠近手柄中心，下一步只需要给 grip position 加一个很小的 controller-local offset，而不是恢复 ray 菜单。
```

### 中心蓝框和黄色四角点说明

用户看到屏幕中心的蓝色线框和四个黄色正方形点，是当前 Three lab 的 `crop frame + corner handles` 视觉层，不是视频内容，也不是 WebXR 系统 UI。

代码位置：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
three-official-crop-frame
```

原始目的：

```text
提示“当前正在移动的是遮罩/取景框”。
right grip drag 时让用户知道自己抓住的是 mask frame。
controller click 大角度移动时给出目标框反馈。
```

但默认常驻会干扰观看，因此已经改为：

```text
IDLE / LOCKED:
  crop frame 隐藏。

AIM / DRAG / GAZE:
  crop frame 出现，并按 hFOV / vFOV 角度计算真实宽高。

corner handles:
  只在 DRAG 时显示明显不透明度。
  非 DRAG 时隐藏。
```

### 已覆盖或部分覆盖

这些在 Three lab 中已经有入口或等价输入：

```text
播放 / 暂停:
  已覆盖。
  UI: PLAYBACK CORE 的 PLAY / PAUSE。
  Quest: 左右 select 近同时按下。
  semantic: playPause。

上一条 / 下一条 / 选择素材:
  已部分覆盖。
  UI: PREV / NEXT / playlist 前 3 项。
  限制: playlist 没有完整滚动/分页。

播放倍率:
  已部分覆盖。
  UI: 0.5x / 1x / 2x。
  限制: 没有 PC 端那种连续 playback rate。

Cut:
  已覆盖入口。
  UI: workbench CUT。
  semantic: cutHere。

Lock / Unlock:
  已覆盖入口。
  UI: workbench LOCK。
  semantic: lockViewport / unlockViewport / flushPath(reason=lock)。

Flush:
  已覆盖入口。
  UI: workbench FLUSH / SAVE。
  semantic: flushPath。

Discard / Restore:
  已覆盖非常粗的入口。
  UI: workbench DISCARD / RESTORE。
  semantic: discardRange / restoreRange / flushPath。
  限制: 没有 PC 那种按住生成时间范围、toast、last range、确认/取消。

FOV:
  已覆盖。
  UI: FOV slider、popup FOV+/FOV-。
  Quest: right thumbstick 连续调节。
  Quest quick menu: B hold -> FOV + / FOV - -> release。
  semantic: nudgeFov / setFov / flushPath(reason=fov)。

Mask opacity:
  已覆盖输入。
  Quest: left grip + right thumbstick。
  状态: uOpacity 本地 preview。
  限制: 没有空间 UI slider / preset。

点选移动 / 大角度移动:
  已覆盖核心输入。
  Desktop: click sphere。
  Quest: short trigger/select ray click。
  反馈: target ring + crop frame。

拖动遮罩:
  已覆盖基础版本。
  Quest: right grip hold ray follow。
  限制: 不是 handle drag；没有 cancel / edge pan。

黑场/黑色转场特效:
  已覆盖最小入口。
  UI: FX popup 的 FADE。
  Quest quick menu: B hold -> BLACK FADE -> release。
  semantic: createEffectEvent(effectType="transition.fade_black")。
  限制: 只有少量按钮，没有完整 Effects Rack、参数、marker、删除、预览编辑。

特效弹窗:
  已覆盖基本呼出。
  UI: workbench FX -> popup extension。
  限制: popup 仍是实验室模块，不是最终 effect tray。
```

### 明确还没有完整迁移

这些不能算已经完成：

```text
开始录制 / 结束录制:
  已有实验版 UI 入口。
  Three lab: WORKFLOW popup -> START CROP / END CROP。
  semantic: samplingResume / samplingPause / flushPath(reason=live)。
  限制: 还不是正式 session-bound recording；没有 paused 状态和真实 seal path API。

Render / Export / Download:
  PC editor 有 render-test、export id、download link。
  Three lab 已有 WORKFLOW popup -> RENDER -> Download preview。
  如果 URL 带 sessionId/videoId，会调用真实 render-test 并生成真实 export download href。
  限制: 还没有完整 session 状态轮询、失败重试、真实 export status panel。

BGM / 伴奏:
  PC editor 有 PcBgmControls。
  Three lab 已有 WORKFLOW popup 内的 BGM 入口。
  支持 No BGM / Ambient / Kick lab 选择和 preview toggle。
  缺少真实曲目列表、选择/清除、单独试听 audio、gainDb、与导出 session music 绑定。
  也没有“BGM 跟随主视频预览”的产品化能力。

完整 Effects Rack:
  PC editor 有分类和快捷键：
    Transition / Color / Speed / Frame / Glitch / Marker。
  Three lab 现在有两层入口：
    旧 FX popup: FADE / MARK。
    WORKFLOW popup 快捷特效: BLACK FADE / WHITE FLASH / VHS BLANK。
  仍缺完整 effect tile：
    filter.blur、filter.vignette、filter.color_grade、chromatic_aberration 等。
  缺少 effect list、duration/params 编辑、删除/禁用。

录制倍率 recording rate:
  PC editor 有 Record rate 和 hold R + wheel。
  Three lab 没有 recordingRate UI 或输入。

Discard range 工作流:
  Three lab 有 DISCARD 按钮，但没有“按住期间记录范围、松开结束范围”的完整流程。

Session / timeline bridge 状态:
  Three lab 支持 query 绑定 sessionId/videoId。
  END CROP 可发送 ViewPathPatch。
  UI 有 backend accepted point count。
  仍没有完整 pendingPathPoints、lastAcceptedPathPatch、queuedPathBatches、pendingEffectEvents、lastError 的空间 UI。

BGM / Export / Session / Sampler 模块:
  workbench 有模块按钮，但大多是打开/状态占位，不是完整功能面板。
```

### 当前按钮覆盖表

```text
PC / 业务能力                         Three lab 当前状态
---------------------------------------------------------------
Play / Pause                         已覆盖，含双手 select
Prev / Next / source list             部分覆盖，playlist 仅前 3 项
Seek                                  有 range UI，但 Quest 拖动体验未产品化
Playback rate                         部分覆盖，0.5/1/2
Recording rate                        部分覆盖，WORKFLOW 有 lab rate UI
Start crop / End crop                 部分覆盖，WORKFLOW 里有 lab recording UI
Render / Download                     部分覆盖，WORKFLOW 里有 preview / backend render-test
Cut                                   已覆盖
Flush / Save                          已覆盖基础语义
Lock / Unlock                         已覆盖
Discard / Restore                     部分覆盖，缺 range 工作流
FOV                                   已覆盖，含右摇杆连续调节
Mask opacity                          已覆盖输入，缺空间 slider/preset
Click / ray target move               已覆盖
Right grip ray drag                   已覆盖基础版本
B hold quick menu                     已覆盖原型，3x3 hold-release
Mask handles / edge pan / cancel      未覆盖
Black fade                            已覆盖，FX popup FADE + WORKFLOW BLACK FADE
Full Effects Rack                     部分覆盖，WORKFLOW 补了 3 个快捷 effect
BGM / accompaniment                   部分覆盖，WORKFLOW 有 lab 选择和 preview toggle
Session status / bridge status        部分覆盖，query 绑定 + accepted points
Export status                         部分覆盖，render-test export href
```

### 推进前的结论

接下来如果继续做 UI，优先级不应只围绕取景输入。更合理的顺序是：

```text
P0:
  1. Start crop / End crop / Render 三个 workflow 按钮进入 Three lab。已做 lab 版。
  2. Effects popup 升级为小型 Effect Tray，至少补 Black fade / White flash / VHS blank。已做 workflow 快捷版。
  3. BGM 先做空间面板入口和只读/选择雏形，避免完全缺席。已做 workflow lab 版。

P1:
  4. 完整 effect marker / params / delete。
  5. recording rate / playback rate 连续调节。recording rate 已有 lab UI，playback rate 仍待连续化。
  6. export status / download link 真实后端绑定。已有 query-bound render-test，仍待 status 轮询。

P2:
  7. BGM 跟随主视频预览、gainDb、mute/ducking。
```

## UI 差异分析

当前 Three lab 的输入能力已经向 PC editor 追近了一大步：点选移动、controller ray follow、连续 FOV、mask opacity、双手播放暂停都已经有了。但页面还不能称为 Quest editor，最大差异确实来自 UI，而不是单个按钮映射。

现在的问题不是“没有按钮”，而是：

```text
1. UI 还没有形成头显里的稳定工作流。
2. UI 的视觉语言仍偏实验室/赛博展示，不是剪辑工具。
3. UI 已有基础 mode strip，但还没有把提交状态、风险动作和当前模式讲清楚。
4. UI 面板的空间布局还没有围绕“观看不中断”重排。
5. UI 和后端 session/timeline 状态还没有真正绑定成产品闭环。
```

### 1. 空间 UI 结构仍是实验室组合

当前页面有三个 HTMLMesh：

```text
official-htmlmesh-player
official-htmlmesh-workbench
official-htmlmesh-extension
```

它们能被 Quest controller 点击，但还像“把几个 DOM 面板摆进空间里”。它缺少最终 Quest editor 应有的层级：

```text
观看层:
  360 视频、遮罩、reticle、最小状态提示。

播放器层:
  播放/暂停、seek、素材切换、速度、隐藏/唤回。

剪辑工作台:
  cut、lock、flush、discard/restore、FOV、mask opacity、effect、export。

延展面板:
  只在用户打开某个模块时出现，承载参数和列表。

危险动作确认层:
  discard、restore、export、覆盖 path 等需要明确确认。
```

当前 lab 只粗略有播放器、workbench、popup 三层；还没有“观看层最小化”和“模块延展”的产品化组织。

### 2. UI 不够解释当前编辑模式

Quest 端最容易出错的地方是模式冲突。用户需要随时知道：

```text
当前是 browsing 还是 editing。
trigger 短按会点选移动，长按会 head-gaze follow。
right grip 正在拖遮罩。
left grip 正在作为 opacity modifier。
right thumbstick 当前是在调 FOV 还是 opacity。
当前遮罩是否 locked。
当前修改是否已经 flush。
```

现在 HUD 能显示 last action / last semantic / view target / mask opacity，并且新增了一个空间 `mode strip`。它已经能显示：

```text
IDLE / AIM / DRAG / GAZE / FOV / OPACITY / LOCKED
PENDING / READY
LOCKED / UNLOCKED
RIGHT GRIP / HEAD GAZE / OPACITY / STANDBY
```

但它仍偏 debug，视觉上还没有成为最终用户可读的“编辑安全条”。后续需要把 pending / flushed / error / risky action 做成更明确的空间状态。

### 3. 遮罩 UI 有了基础 frame，但还不是可操作取景框

现在遮罩有 shader、center reticle、crop frame、target ring，已经能让用户看到“正在移动的是取景框”。但它还不是一个真正的可抓取对象。仍缺少：

```text
四角 handle
hover 反馈
dragging 反馈
大角度移动的过渡轨迹提示
边缘拖动时 camera + mask 联动提示
取消/回退当前拖动的提示
```

这就是 PC editor 和 Quest editor 最大的体验差异之一。PC 端用户可以通过鼠标和键盘理解“我在拖一个框”；Quest 端如果只有 reticle 和遮罩变化，会像在操控一个隐形参数。

后续 UI 优先级应是：

```text
P0:
  在现有 crop frame 上补 corner handle。
  right grip hold 时显示 MOVE / yaw-pitch 小读数。
  trigger click smooth move 时显示 target ring 和过渡方向。

P1:
  edge pan / large move 时显示方向提示。
  B cancel 或等价取消动作显示可撤销状态。
```

### 4. 播放器 UI 已改善，但仍不是最终 Quest 形态

当前 `PLAYBACK CORE` 已经比早期竖向面板更接近 PC editor，但仍有差距：

```text
seek range 在 HTMLMesh 中可见，但 Quest 射线拖动 range 的体验不稳定。
playlist 只显示前三项，没有滚动/分页。
播放速率只有 0.5/1/2，没有 PC 的连续 rate 调节。
播放器 UI 的隐藏/唤回还只是 DIM/RESTORE，不是空间里的低干扰收纳。
播放器状态没有和正式 PlaybackClientState 上报/恢复做完整产品绑定。
```

建议：

```text
P0:
  播放器压缩成前下方低高度控制条。
  只保留 play/pause、时间、seek、source title、hide。
  playlist 进入独立 extension panel。

P1:
  用 thumbstick / dial 处理 seek 或 rate，避免直接拖 range。
  增加隐藏后的最小唤回按钮。
```

### 5. Workbench UI 缺少任务分组和风险等级

当前 workbench 同时放了：

```text
CUT
LOCK
SAVE
PLAY
FLUSH
DISCARD
RESTORE
FRAME / FOV / FX / EXPORT / SESSION / SAMPLER
```

这在实验室里方便，但在 Quest 中会显得拥挤，且风险等级不清：

```text
高频安全动作:
  cut、lock、FOV、opacity。

高频但需要状态的动作:
  discard start/end、restore。

低频模块:
  effects、export、session。

危险动作:
  discard range、restore range、overwrite/flush final、export。
```

建议把 workbench 改成“少按钮 + 模块化”：

```text
第一排:
  CUT / LOCK / FOV / FX

第二排:
  DISCARD / RESTORE / EXPORT / SESSION

模块打开后:
  45 度 extension panel 展示参数。
```

### 6. Effect UI 仍是占位，不是可预览编辑器

当前 popup 可以派发：

```text
createEffectEvent
```

但 UI 还没有达到 PC editor 期望：

```text
没有 effect timeline marker。
没有当前时间点的 effect 列表。
没有参数编辑。
没有删除/禁用。
没有 WebXR 画面里的真实预览反馈。
没有区分 transition / filter / overlay / highlight 的视觉分类。
```

这部分是 UI 差异的第二大块。后续不应该只继续加 “FADE/MARK” 按钮，而应该做一个 Effect Tray：

```text
left: effect category
center: effect presets
right: params / duration
bottom: current clip event markers
```

### 7. 后端闭环状态没有进入 UI

Three lab 当前很多操作只是 dispatch semantic event 或改本地 state，但它不是业务 session 页面：

```text
已有可选 query sessionId / videoId 绑定。
已有 END CROP -> path-patches 的最小发送状态。
已有 accepted point count。
没有 effect event queue 状态。
没有 export queue 状态。
已有 WORKFLOW -> render-test / download href 的最小链路。
没有完整 pending / error / retry / polling UI。
```

因此它现在证明了“Quest 输入和空间 UI 可行”，但还没有证明“Quest 端完整剪辑闭环可用”。后续如果要接近产品，需要把 PC editor 里这些状态迁过来：

```text
lastAcceptedPathPatch
pendingPathPoints
queuedPathBatches
pendingEffectEvents
lastError
export job status
```

### UI 优先级建议

我建议接下来不要先堆更多手柄快捷键，而是按 UI 风险排序：

```text
P0:
  1. 在已有 crop frame 上补 handles / hover / MOVE 标签。
  2. 把 mode strip 从 debug 条打磨成用户状态条。
  3. 把 workbench 按高频动作和模块入口重排。

P1:
  4. 播放器 UI 做成低干扰控制条 + 可收起 playlist。
  5. Effect Tray 从按钮占位升级为 effect event 编辑入口。
  6. 增加 pending / accepted / error 的空间状态反馈。

P2:
  7. 加 edge pan / cancel drag / undo last local move。
  8. 加 export/session/bgm 的完整业务 UI。
```

简短结论：

```text
输入层：已经进入“可继续打磨”的阶段。
UI 层：仍是最大差距，尤其是状态表达、可抓取遮罩、模块组织和业务闭环反馈。
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
3. 在已有 crop frame 基础上补 mask handle drag 状态机。
4. 为 mask opacity 补空间 UI slider / preset。
5. 最后再迁移 effect preview 和更复杂面板。
```

这个顺序能把风险压在坐标系统和输入状态机上，而不是一开始就混入 UI 重构。
