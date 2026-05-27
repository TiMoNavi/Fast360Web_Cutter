# Three Official Interactive Lab 当前状态

日期：2026-05-25

页面：

```text
http://127.0.0.1:3080/xr/three-official-interactive-lab
/xr/three-official-interactive-lab
```

本文记录 VR 端 Three.js 官方交互实验页的当前代码事实。旧文档已经落后于代码，且存在编码乱码，本文件作为当前可读事实源。

## 一句话结论

这个页面已经不是纯视觉原型。它现在是一个能跑起来的 Three.js WebXR lab，包含真实 360 视频球、WebXR session、HTMLMesh 空间 UI、Quest controller 输入、取景遮罩、基础录制流程、最小后端 path patch 和 render-test 链路。

但它还不能算正式 VR editor。第一轮拆分前，核心功能被快速堆进一个 2646 行的 client component；现在已经把 ray targeting、controller input binding、controller state shape、workflow patch/effect helper 抽出去，主文件降到约 2403 行。风险有所下降，但 scene runtime、quick menu mesh、视频源、DOM/HTMLMesh 事件绑定和一部分 workflow orchestration 仍在同一个组件生命周期里。当前最大的风险仍然不是“功能少”，而是“功能已经多到主文件承载不了后续迭代”。

## 入口与代码位置

路由入口：

```text
apps/web/app/xr/three-official-interactive-lab/page.tsx
```

入口页是 server component，当前行为是：

```text
1. 调用 buildPcEditorLibraryModel(cookieHeader) 读取 PC editor 同源素材模型。
2. 取 playlistSources[0] 作为默认视频。
3. 如果有视频，生成 three-lab-session-${Date.now()}。
4. 调用 createCutSession(firstVideoId, sessionId) 创建临时 cut session。
5. 把 initialSources、sessionId、videoId 传给 ThreeOfficialInteractiveLab。
```

这说明页面已经能接到账号视频库和后端 session，但还是 lab 风格：刷新页面会创建新的临时 session，不是稳定的“继续上次 VR 剪辑 session”入口。

核心组件：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
```

已拆出的局部组件：

```text
apps/web/src/components/three/three-official-lab/ThreeOfficialPlayerPanel.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialWorkbenchPanel.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialWorkflowState.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialArwesModulePopup.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialLabHud.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialModeStrip.tsx
apps/web/src/components/three/three-official-lab/constants.ts
apps/web/src/components/three/three-official-lab/runtimeHelpers.ts
apps/web/src/components/three/three-official-lab/types.ts
apps/web/src/components/three/three-official-lab/rayTargeting.ts
apps/web/src/components/three/three-official-lab/controllerInteractionState.ts
apps/web/src/components/three/three-official-lab/useThreeOfficialControllerInput.ts
apps/web/src/components/three/three-official-lab/workflowOperations.ts
```

## 当前能做什么

### 1. WebXR 进入

页面内部直接创建 `WebGLRenderer`：

```text
new Scene()
new PerspectiveCamera(...)
new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.xr.enabled = true
renderer.xr.setReferenceSpaceType("local")
renderer.setAnimationLoop(...)
```

进入 VR 使用页面自己创建的 DOM 按钮：

```text
data-testid="three-official-vr-button"
```

它会检查：

```text
navigator.xr.isSessionSupported("immersive-vr")
navigator.xr.requestSession("immersive-vr", {
  optionalFeatures: ["local-floor", "bounded-floor"]
})
```

设置 session 时走 lab fallback：

```text
setRendererSessionWithLabFallback(renderer, session, {
  preferLegacyLayer: true
})
```

这个 fallback 是为 Meta WebXR emulator / XRWebGLBinding 兼容问题准备的。它适合 lab，不应直接当成最终生产路径的唯一依据。

### 2. 360 视频播放

页面有隐藏 video element：

```text
data-testid="three-official-video-source"
```

视频源优先来自入口传入的 `initialSources`。如果没有传入，会请求：

```text
GET /api/xr/video-sources
```

失败后回退到：

```text
/api/sample-video
```

支持：

```text
mp4
hls, 通过 hls.js
```

视频进入 Three.js 的方式：

```text
new VideoTexture(video)
new SphereGeometry(18, 64, 32)
videoSphereGeometry.scale(-1, 1, 1)
MeshBasicMaterial({ map: videoTexture, side: FrontSide })
videoSphere.rotation.y = -Math.PI / 2
```

注意：球面旋转有固定偏移，后续任何 ray hit 到 yaw/pitch 的逻辑都必须和这个坐标系保持一致。

### 3. 取景遮罩与取景框

页面复用 PC editor 的 crop mask shader：

```text
createCropViewportMaskFragmentShader()
```

遮罩是 Three.js sphere mesh，不是 A-Frame entity：

```text
SphereGeometry(CROP_MASK_RADIUS, 96, 48)
ShaderMaterial(...)
```

核心状态：

```text
ViewTargetPose {
  input: "head_gaze" | "controller_ray" | ...
  yaw: number
  pitch: number
}
```

当前每帧写入：

```text
uCenterYaw
uCenterPitch
uFov
uLocked
uOpacity
uTime
```

取景框已经不只是一个 reticle。现在有：

```text
center reticle
crop frame
corner handles
target ring
```

但 corner handles 目前主要是视觉反馈：`DRAG` 模式显示明显，尚未形成真正可抓取、hover、drag、cancel 的完整 mask handle 系统。

### 4. 空间 UI

页面使用普通 DOM 渲染 UI，再通过 Three.js 官方示例路径投射到空间里：

```text
HTMLMesh
InteractiveGroup
group.listenToPointerEvents(renderer, camera)
group.listenToXRControllerEvents(controller1)
group.listenToXRControllerEvents(controller2)
```

当前主要空间层：

```text
official-htmlmesh-player
official-htmlmesh-workbench
official-htmlmesh-workbench-popup
official-htmlmesh-mode-strip
three-official-b-button-quick-menu
```

主要 UI 区域：

```text
PLAYBACK CORE
SESSION WORKBENCH
MODULE LAYER
mode strip
debug HUD
```

这条路径的价值很明确：它证明了 DOM 写出来的按钮和表单可以通过 HTMLMesh 进入 Quest controller ray 交互。但产品形态仍偏实验室面板，空间层级、危险操作确认、错误状态和低干扰观看模式还没收敛。

### 5. 播放器能力

`PLAYBACK CORE` 当前支持：

```text
PLAY / PAUSE
PREV / NEXT
playlist select
seek range
0.5x / 1x / 2x playback rate
START REC / END REC
recording rate - / reset / +
DIM / RESTORE
```

播放语义已派发：

```text
playPause
seekTo
```

但播放速率、source 切换、UI dim 主要仍是本地 React/video state，尚未成为完整 timeline/session 协议的一部分。

### 6. 取景与手柄输入

当前 controller 绑定：

```text
renderer.xr.getController(0) -> left
renderer.xr.getController(1) -> right
renderer.xr.getControllerGrip(0/1) -> controller model
```

Trigger / select：

```text
单手短按 select:
  如果 ray 命中 HTMLMesh 可交互 DOM，触发空间按钮。
  否则 ray 命中 360 视频球，平滑移动取景目标。

单手长按 select:
  进入 head-gaze follow。
  松开后把当前头显方向提交为取景目标。

左右 select 在 160ms 内同时按下:
  play / pause。

left grip + right trigger:
  尝试记录 discard range。
```

Grip / squeeze：

```text
left squeeze:
  开启 mask opacity modifier。
  此时 right thumbstick 改为调遮罩透明度。

right squeeze:
  进入 controller ray drag。
  每帧用右手柄 ray 命中视频球更新 view target preview。
  松开后 commit。
```

Right thumbstick：

```text
未按 left grip:
  连续调 FOV。
  deadzone = 0.18
  max speed = 34 deg/s
  range = 35 到 110
  松开 debounce 后 flushPath(reason="fov")

按住 left grip:
  连续调 mask opacity。
  range = 0.00 到 0.95
  max speed = 0.72/s
```

Right B / quick menu：

```text
button index = 5
B press -> open quick menu
B hold + aim -> 更新 tile selection
B release -> 执行 selection
```

当前 `QUICK_MENU_ITEMS` 暴露：

```text
START / END / RENDER
CUT / LOCK / BLACK
WHITE / SAVE / DROP
UNDO / VHS
```

第一轮拆分已移除 quick menu 执行函数里未暴露的 `fovIn` / `fovOut` 死分支。当前 quick menu 不直接改 FOV；FOV 统一走 right stick 连续调节。

Left menu button：

```text
button index = 6
切换 spatial menus visible
```

Desktop / test 输入：

```text
canvas click -> raycast sphere，平滑移动取景目标
ctrl/cmd + canvas click -> 立即提交取景目标
window CustomEvent synthetic inputs -> Playwright 测试入口
```

### 7. Crop workflow 与后端桥接

页面已经有最小剪辑闭环：

```text
START CROP
  清空本地 samples
  push "start" sample
  emit samplingResume

END CROP
  push "end" sample
  emit samplingPause
  emit flushPath(reason="live")
  如果 backendBinding 存在，调用 sendViewPathPatch(sessionId, patch)

RENDER
  如果 backendBinding 存在，调用 renderTest(sessionId)
  设置 cropExportId
  生成 /api/exports/{exportId}/download 链接
```

`ViewPathPatch` 由本地 `recordingSamplesRef` 编译出来，包含：

```text
sessionId
videoId
takeId
pathRevision
replaceRange
points[].center yaw/pitch
points[].fov h/v
points[].input
points[].locked
points[].tMs
```

这条链路说明 VR 页已经能把一次 lab 录制转换成后端可接受的 path patch。限制是：它还没有完整 session 状态轮询、pending queue、失败重试、effect event 上传队列、export job 状态面板。

### 8. Effect 与 BGM

当前有基础入口：

```text
FX:
  transition.fade_black
  transition.flash_white
  black.solid / VHS blank

BGM:
  none
  ambient-pulse
  kick-guide
  preview toggle
```

但这部分主要还是空间 UI 与 semantic event 实验：

```text
createEffectEvent 会 dispatch 到 window。
页面本身没有完整 EffectEventsPatch 后端上传队列。
BGM 选择没有真正绑定到 export session music。
没有 effect list、params 编辑、删除、禁用、预览层。
```

因此它可以证明“VR 中有入口”，不能证明“VR 中已完成效果和伴奏编辑器”。

## 测试覆盖

已有专项 Playwright：

```text
apps/web/e2e/three-official-interactive-lab.spec.ts
```

当前覆盖点包括：

```text
页面加载与 canvas 非空像素
canvas click / ctrl click 取景目标移动
PLAYBACK CORE 控件
backend playlist selector
player rail workflow controls
录制 samples 发送 path patch
render-test export download href
dual select 播放/暂停
B hold quick menu lock/startCrop
quick menu release 无选中
long hold select -> head gaze follow -> release commit
short controller select ray click
right grip ray drag
right thumbstick FOV
right thumbstick 负方向和 35/110 FOV 边界
left grip + right thumbstick opacity 正/负方向
```

仍缺：

```text
真实 Quest Browser 手测记录
left trigger ray click
quick menu 的所有 action，包括 save/discard/restore/effect/render
真实 HTMLMesh controller ray 拖 range/select 的稳定性
left grip + right trigger discard range 的协议正确性
资源清理与反复 mount/unmount 的内存回归
```

## 代码不规范性与大文件评估

### 核心问题

主文件当前是：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
约 2403 lines
第一轮拆分前为 2646 lines
```

粗略结构：

```text
21 个 useState 字符串匹配
25 个 useRef 字符串匹配
约 138 个 function / const arrow / let / useEffect 结构匹配
一个 Three scene useEffect 从约 588 行持续到约 1880 行
一个 DOM query listener useEffect 从约 2081 行持续到约 2313 行
```

这已经比拆分前好一些，但仍不是“稍微大一点”的组件，而是一个把多个子系统塞进同一生命周期的运行时文件。

### 职责混杂

`ThreeOfficialInteractiveLab.tsx` 同时负责：

```text
React 页面状态
Three.js scene / camera / renderer 创建
WebXR session 进入和退出
video element / VideoTexture / HLS 加载
360 sphere 与 crop mask geometry
HTMLMesh / InteractiveGroup 空间 UI
controller model / controller ray
select / squeeze / thumbstick / B button 状态机
quick menu mesh 创建、选中、执行
canvas pointer desktop lab 输入
semantic event dispatch
path patch 构造与发送
render-test 调用
BGM / effect lab state
DOM querySelector 手动绑定按钮事件
synthetic CustomEvent 测试入口
每帧 shader uniform / reticle / frame / menu visible 更新
资源 cleanup
```

这些职责不应该长期在同一个 React component 里。继续堆功能会让 bug 更隐蔽，也会让任何 UI 调整都可能碰到 XR 输入或后端桥接。

### 明显技术债

1. `useEffect([])` 内部包含大量会调用外层函数的输入逻辑。外层函数依赖 React state，虽然很多状态用 ref mirror 规避了 stale closure，但并不是所有依赖都被清晰表达。尤其 backendBinding、bgmChoice、openModule 等状态和 imperative listener 的关系需要复查。

2. DOM 事件通过 `querySelectorAll` 手动绑定，再依赖 `data-action`、`data-module`、`data-player-action` 分发。HTMLMesh 场景下这条路可以理解，但应该被封装成空间 UI adapter，而不是散落在主组件末尾。

3. synthetic test events 已从主组件的散落 `window.addEventListener` 收敛到 `useThreeOfficialControllerInput.ts`，但仍属于生产组件可用的测试协议：

```text
three-official-controller-select
three-official-controller-aim
three-official-controller-squeeze
three-official-quick-menu
three-official-menu-toggle
three-official-record-toggle
three-official-thumbstick
```

这些入口对测试很有价值。后续如果要进一步产品化，可以让 synthetic binding 在 test/dev adapter 中开关化，避免主运行时长期无条件背负测试协议。

4. 后端绑定是 lab 风格。入口页会在加载时创建临时 session，client 也允许 query sessionId/videoId 绑定，但没有“选择 session、恢复 session、确认覆盖 path”的正式产品流程。

5. effect 和 BGM 只完成了空间入口，不是业务闭环。当前没有完整 effect event queue，也没有 BGM export 参数持久化。

6. quick menu 的 `fovIn/fovOut` 死分支已经移除，当前菜单数据和执行函数更一致。剩余风险是 quick menu mesh 创建、tile hit test、selection state 和 action execution 仍在主 scene effect 内，后续适合拆到 `quickMenuRuntime`。

7. FOV clamp 已统一到共享 crop mask 范围 35 到 110，工作台只读 range 也使用同一组常量。后续仍需确认后端导出、PC editor、VR editor 的 UI 文案都把 35/110 当作同一产品边界。

8. 资源生命周期复杂，cleanup 已经做了一部分，但仍需要专项复查 geometry/material/video texture 是否全部释放。`preserveDrawingBuffer: true` 有测试价值，但生产路径应避免默认开启。

9. 样式文件也变大：

```text
ThreeOfficialInteractiveLabStyles.tsx
766 lines
约 23 KB
```

这说明视觉样式也进入了快速堆叠阶段。后续需要拆成 player、workbench、popup、hud、mode-strip 等局部样式，或者迁移到更稳定的样式组织方式。

10. 页面文案仍偏 debug/lab，例如 `PLAYBACK CORE`、`SESSION WORKBENCH`、`B HOLD`、`backend accepted points`。这对研发调试有用，但还不是最终 Quest 用户可理解的信息架构。

## 第一轮拆分结果

本轮已经完成中等拆分的第一步：保留 scene/runtime wiring 在 `ThreeOfficialInteractiveLab.tsx`，先把最容易独立测试和复用的逻辑层移出主组件。

```text
rayTargeting.ts
  统一 pointer/controller/ray -> sphere hit -> ViewTargetPose
  统一 HTMLMesh ray hit 与 pointer event dispatch
  提供 head gaze / object forward pose 读取

controllerInteractionState.ts
  集中创建 controller ray override、thumbstick override、quick menu button、left menu、select combo、discard range 等状态 shape

useThreeOfficialControllerInput.ts
  集中绑定真实 XR controller select/squeeze
  集中绑定 synthetic CustomEvent 测试入口
  集中绑定 canvas pointer down/up 与 cleanup

workflowOperations.ts
  生成 recording sample
  构造 ViewPathPatch
  映射 workflow effect action、effect log item 与 semantic event
```

本轮没有拆 scene runtime、quick menu mesh runtime、样式文件，也没有改变 URL、`data-testid`、按钮文案、synthetic event 名称或后端 `ViewPathPatch` 形状。

## 建议拆分方向

不要第一步就抽整个 scene runtime。风险太大。推荐先拆“纯逻辑”和“输入解释层”，每一步都配合现有 Playwright。

### P0：先拆最容易失控的逻辑

```text
rayTargeting.ts（第一轮已完成）
  ray -> sphere hit
  pointer -> ViewTargetPose
  controller -> ViewTargetPose

controllerInteractionState.ts（第一轮已完成 state shape）
  dual select combo
  head gaze hold
  thumbstick debounce
  left grip opacity modifier
  B hold quick menu press/aim/release

useThreeOfficialControllerInput.ts（第一轮已完成 binding/cleanup）
  bind select/squeeze/gamepad buttons/axes
  bind synthetic CustomEvent
  cleanup listeners
  只输出高层动作，不直接改 React state

workflowOperations.ts（第一轮已完成 patch/effect/sample helper）
  create recording sample
  build ViewPathPatch
  workflow effect action -> semantic event/log
```

### P1：拆业务桥接和空间菜单

```text
threeOfficialWorkflowBridge.ts
  start/end/render crop
  build ViewPathPatch
  sendViewPathPatch
  renderTest
  backend status model

quickMenuRuntime.ts
  quick menu mesh 创建
  tile hit test
  selection 更新
  execute action adapter

videoSourceRuntime.ts
  initialSources / /api/xr/video-sources / fallback
  HLS attach/destroy
  video event binding
```

### P2：最后再拆 scene runtime

```text
useThreeOfficialSceneRuntime.ts
  renderer / scene / camera
  video sphere
  crop mask
  crop frame / reticle / target ring
  HTMLMesh attach
  animation loop
  cleanup
```

这一步最后做，因为它会碰到最多 refs、materials、state setters、controller objects 和 effect lifecycle。

## 推进优先级

优先级建议：

```text
P0:
  1. 已完成：把 ray targeting、controller input binding、controller state shape、workflow patch/effect helper 从主组件抽出来。
  2. 已完成：补 long hold head-gaze、quick menu release 无选中、right thumbstick 负方向/FOV 边界、left grip + right thumbstick 负方向测试。
  3. 已完成：统一 FOV 范围到 35-110，移除 quick menu 未暴露的 fovIn/fovOut 死分支。
  4. 待做：quick menu 所有 action、discard range、backendBinding stale closure 风险复查。

P1:
  5. 把 quick menu mesh/runtime 从 scene effect 独立出来。
  6. 把 workflow bridge 进一步独立成 hook/adapter，补 pending/error/retry 状态。
  7. effect event 从 semantic dispatch 升级为真实 EffectEventsPatch 队列。
  8. BGM 从 lab state 升级为 session export 参数。
  9. 播放器变成低干扰空间控制条，playlist 移到 extension panel。

P2:
  10. 补完整 mask handle hover/drag/cancel/edge pan。
  11. 把 style 文件和 scene runtime 拆开。
  12. 做真实 Quest Browser 操作记录，和自动化结果分开归档。
```

## 当前判断

这个页面最值得保留的是：

```text
Three.js 官方 HTMLMesh + InteractiveGroup 路径
WebXR session fallback 经验
360 VideoTexture sphere
PC editor crop mask shader 复用
ViewTargetPose yaw/pitch 模型
controller ray -> sphere -> view target 链路
最小 ViewPathPatch / render-test 后端闭环
Playwright synthetic input 测试基础
```

最需要尽快处理的是：

```text
约 2403 行主组件，仍偏大
quick menu mesh/runtime 还在 scene effect 内
scene runtime、视频 runtime、HTMLMesh runtime 还未拆
workflow orchestration 仍有一部分留在主组件
effect/BGM 只有入口没有闭环
DOM query listener adapter 还在主组件末尾
资源 cleanup 和 stale closure 风险
```

简短结论：

```text
VR 页已经进入“功能可继续打磨”的阶段，不再只是 demo。
第一轮已经拆出输入绑定、ray targeting、controller state shape 和 workflow helper。
但代码组织仍处于“急写大团块向模块化过渡”的阶段，下一步应优先拆 quick menu runtime、workflow hook/adapter、scene runtime，再继续扩 UI。
```
