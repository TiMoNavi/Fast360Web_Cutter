# PC Editor 运行时状态池迁移清单

## 1. 目标

这份文档用于盘点 PC Editor 中哪些实时状态应该逐步接入运行时状态池，以及迁移顺序。

组件扩展原则保持不变：

```text
父组件装配子组件。
子组件通过 props、context、event emit 或 state model 通信。
兄弟组件不能互相 import、互相调用或知道彼此内部实现。
```

运行时状态池负责回答：

```text
现在真实状态是什么？
```

事件系统负责表达：

```text
刚刚发生了什么动作？
```

两者不能混用。比如 `player.playback.toggle` 是事件，`isPlaying=true` 是状态；`editor.viewport.center.step` 是事件，当前 yaw/pitch 是状态。

## 1.1 已启动进度

2026-05-26 已完成第一批迁移落点：

```text
runtimeStateStore 已扩展为 playback / viewTarget / cameraPose / input / effectInput / xrSession 的统一状态池。
AFrameCropViewportMask 写入 cropMask 时同步派生 viewTarget。
Player V2 播放进度、播放状态、XR session 状态已写入状态池。
键盘 raw pressed、指针 primaryDown / draggingMask / lastScreen、相机朝向已写入状态池。
PcEffectsPanelSimple 的快捷键 category / effect / holding / selected / hidden 状态已写入 effectInput。
```

仍保留迁移期镜像状态：Player V2 的本地 `usePlayerV2State` 仍是当前 UI 渲染主读源；后续读侧稳定后再移除重复状态。

2026-05-26 第二批读侧迁移：

```text
PcEffectPreview 优先读取 effectInput，DOM preview event 保留为兼容层。
PcPlayerControlsSimple 优先读取 playback.currentTimeMs / durationMs / isPlaying / status。
PcWorkbenchPanelSimple 读取 viewTarget 的 yaw / pitch / FOV / locked / maskOpacity。
XrHud 读取 xrSession 的 message / canEnter / presenting。
PcEditorDebugState 增加 runtime snapshot 输出，便于验证状态池同步。
```

2026-05-26 第三批 workflow / 3D / VR 输入迁移：

```text
usePlayerV2EditorPreviewWorkflow 在处理 viewport center / FOV / lock / opacity 事件时同步写入 viewTarget。
usePlayerV2TimelineWorkflow 处理 center step/set 时优先读取 runtime viewTarget，再回退到 timelineBridge state。
usePlayerV2EffectsWorkflow 的 hold 起止点优先读取 runtime viewTarget / playback currentTimeMs。
useVrRayEventBinding 将 vr-ray select/click 写入 input.controls.pressed。
SpatialNativePlayerBar / HybridSkinPlayerBar 优先读取 runtime playback。
```

2026-05-26 第四批 XR controller / pose 迁移：

```text
bindAFrameInputEvents 将 trigger / grip / thumbstick / A / B / pinch 写入 input.vrControllers 和 input.controls.pressed。
controllerAimStart / controllerAimEnd 会附带 left/right hand 信息进入 timeline semantic event。
AFrameTimelineBridge tick 读取 headset pose 并写入 cameraPose。
AFrameTimelineBridge 在 xr-pose 模式下读取 headset/controller pose 并写入 viewTarget。
AFrame360VideoControlBridge 的旧 controller placeholder 事件同步写入 input.controls.pressed。
```

2026-05-26 第五批 Player V2 镜像状态收缩：

```text
usePlayerV2State 的 view 输出优先读取 runtime playback / viewTarget，本地 state 仅作为 fallback。
PlayerV2 的 onPlaybackStateChange 不再重复写本地 playback state，只写 runtime playback。
PlayerV2 初始化 / activeSource 切换时写入 runtime playback ready 快照。
usePlayerSourceWorkflow 在 source switching / ready / error 阶段写入 runtime playback sourceId/status/duration。
```

2026-05-26 第六批 viewport/mask 本地 setter 收缩：

```text
usePlayerV2EditorPreviewWorkflow 不再接收 setFov / setMaskCenter / setMaskLocked / setMaskOpacity。
viewport center / FOV / lock / opacity 事件只写 runtime viewTarget。
PlayerV2 在 runtime viewTarget 为空时写入初始 viewTarget 快照。
usePlayerV2Workflows / workflows barrel 移除了 PlayerV2MaskCenter 等本地 viewport 类型暴露。
```

2026-05-26 第七批 active Player V2 事件中转器收敛：

```text
/xr/player-v2 关闭 PcEditorCommandEventBridge，active 主链路只走 PcEditorEventBus。
旧 PcEditorCommandBus 仍保留给旧页面和迁移期 fallback，不再作为 Player V2 主入口。
pc-editor-webxr-player-v2-architecture.md 已同步当前 runtime state pool 与 CommandBus 兼容层边界。
```

2026-05-26 第八批 active Player V2 effect preview 收敛：

```text
PcEffectPreview 增加 legacyDomEvents 开关；当前新组件默认关闭旧 DOM preview event 兼容，旧 PcWebXrEditor 显式打开。
/xr/player-v2 显式关闭 legacyDomEvents，active preview 主入口为 runtime effectInput + PcEditorEventBus。
legacy WEBXR_PC_EFFECT_PREVIEW_EVENT 仅保留给旧页面和迁移期 fallback。
```

2026-05-26 第九批 active Player V2 crop mask window command 收敛：

```text
AFrameCropViewportMask 增加 legacyWindowCommands 开关；当前默认关闭旧 window command 兼容，旧页面需要时显式打开。
/xr/player-v2 通过 AFrameCropViewportRig 关闭 legacyWindowCommands。
AFrameCropViewportArcs 增加 legacyWindowEvents 开关；active v2 中角点 FOV 拖拽发 editor.viewport.fov.set。
AFrameCropViewportArcs 优先读取 runtime cropMask 状态，旧 webxr:crop-mask-change 监听仅作为兼容。
```

2026-05-26 第十批 active Player V2 cropMask runtime 回流去重：

```text
/xr/player-v2 移除 useCropMaskRuntimeEventBridge。
AFrameCropViewportMask 已直接写 runtime cropMask / viewTarget，不再需要 window crop-mask-change 再回流一次 EventBus。
maskViewportBounds 仍由 AFrameCropViewportBoundsBroadcaster 写 runtime，后续再继续收旧 window bounds event 兼容层。
```

2026-05-26 第十一批 active Player V2 effect shortcut window relay 收敛：

```text
PlayerV2 移除 pc-editor:effect-shortcut-open / pc-editor:effect-shortcut-key 的 window CustomEvent relay。
PcEffectsPanelSimple 通过 useEffectShortcutBindings 处理键盘输入，并将实时 shortcut 状态写入 runtime effectInput。
useEffectShortcutBindings 后续继续作为 effect input adapter，不再暴露 shortcut window event 兼容入口；键盘、手柄、屏幕 UI 可逐步统一到 editor.effects.shortcut.* 事件入口。
```

2026-05-26 第十二批 active Player V2 timeline crop-mask 读侧收敛：

```text
AFrameTimelineBridge 增加 legacyCropMaskWindowEvents 开关。
/xr/player-v2 在 viewTargetSource=crop-mask 时关闭 webxr:crop-mask-change 监听，改为订阅 runtime state pool 的 viewTarget。
旧 PcWebXrEditor 和迁移期页面默认仍保留 window crop-mask-change 兼容监听，避免一次性破坏旧链路。
```

2026-05-26 第十三批 active Player V2 crop mask bounds window event 收敛：

```text
AFrameCropViewportMask 增加 legacyWindowEvents 开关；active /xr/player-v2 通过 rig 关闭 window crop-mask-change 广播。
AFrameCropViewportBoundsBroadcaster 增加 legacyWindowEvents 开关；active /xr/player-v2 读取 runtime cropMask 并写 runtime maskViewportBounds，不再监听或广播 crop-mask window event。
AFrameCropViewportRig 将 legacyWindowCommands 同步下发给 mask / bounds / arcs 的 legacyWindowEvents，旧页面默认仍保持兼容。
```

2026-05-26 第十四批 active Player V2 timeline semantic window event 收敛：

```text
AFrameTimelineBridge 增加 legacyWindowSemanticEvents 开关。
/xr/player-v2 显式关闭 window 级 webxr:timeline-event 监听。
active Player V2 的 timeline 操作由 PcEditorEventBus -> workflow -> timelineBridge.dispatch 进入；scene 级 A-Frame semantic adapter 仍可保留给 XR runtime。
旧 PcWebXrEditor 和迁移期 controls/operations/timelineOperations.ts 默认仍可通过 window semantic event 兼容。
```

2026-05-26 第十五批 active Player V2 CommandBus fallback 收敛：

```text
usePcEditorUiEventEmitter / usePcEditorBindingEmitter 增加 legacyCommandFallback 开关。
PcPlayerControlsSimple、PcWorkbenchPanelSimple、PcEffectsPanelSimple、PcPlaylistPanel 在 active Player V2 中显式关闭 legacyCommandFallback。
这些组件仍保留 fallbackCommand 参数给旧页面使用，但 active v2 不再回退发旧 PcEditorCommandBus。
```

2026-05-26 第十六批 3DUI 直接 DOM 查询收敛：

```text
SpatialNativePlayerBar 移除 document.querySelector("#main-camera")。
camera attachment 改为由父组件传入 cameraRef，避免 3DUI 子组件知道 A-Frame camera 的全局 DOM id。
同时清理 active Player V2 已不存在的 AFrameBlackFadeHoldTarget 导出和引用，保留新的 AFrameViewportMaskEffectPreview。
```

2026-05-26 第十七批低难度旧 Player V2 链路删除：

```text
删除 effects/preview/xr/AFrameBlackFadeHoldTarget.tsx，active Player V2 只保留 AFrameViewportMaskEffectPreview。
删除 components/pc_editor/Aframe/player-v2/ui/editor/*、旧 DebugState、旧 MaskOpacityControls、旧 player/PlayerControls。
删除 components/pc_editor/Aframe/player-v2/webxr/* 旧 cropMaskComponents / XrCropMask；active v2 使用 mask_controller/webxr。
useEffectShortcutBindings 移除 legacyWindowEvents 和 PC_EFFECT_SHORTCUT_* 兼容事件，保留真实键盘输入路径，并新增 editor.effects.shortcut.open / key.down / key.up 作为非 window 的手柄和屏幕 UI 语义输入入口。
```

2026-05-26 第十八批 effect input adapter 与 preview 默认值收敛：

```text
PcEditorEventName 增加 editor.effects.shortcut.open / key.down / key.up。
useEffectShortcutBindings 订阅 PcEditorEventBus 的 shortcut 语义输入事件，键盘、手柄、屏幕 UI 后续可进入同一状态机。
新版 PcEffectPreview 默认关闭 legacyDomEvents；旧 PcWebXrEditor 显式传 legacyDomEvents 保留旧页面兼容。
```

2026-05-26 第十九批 mask bridge 兼容层继续收敛：

```text
AFrameCropViewportRig 拆开 legacyWindowCommands 和 legacyWindowEvents，不再把旧命令监听和旧事件广播强行绑定。
AFrameCropViewportArcs 在 legacyWindowEvents=false 且没有 EventBus 时不再隐式回退发 window crop-mask-fov。
删除未使用的 mask_controller/useCropMaskRuntimeEventBridge.ts 和 barrel export。
active Player V2 的 mask 当前值继续由 AFrameCropViewportMask / BoundsBroadcaster 直接写 runtime state，不再通过 window crop-mask-change 回流。
```

2026-05-26 第二十批 timeline bridge 默认值收敛：

```text
AFrameTimelineBridge 的 legacyCropMaskWindowEvents / legacyWindowSemanticEvents 默认值改为 false。
旧 PcWebXrEditor 显式传 true 保留旧页面兼容，active Player V2 继续显式 false。
新 timeline bridge 实例默认只订阅 runtime state 和组件内输入 adapter，不再默认监听 window 级 crop-mask / semantic event。
```

2026-05-26 第二十一批 mask controller 公共出口收敛：

```text
mask_controller/index.ts 不再导出 WEBXR_CROP_MASK_* window event 常量。
遗留 window event 常量仍留在具体 legacy 实现文件内部使用，新增代码应通过 PcEditorEventBus 或 runtime state pool 接入。
```

2026-05-26 第二十二批 UI / effects 公共出口收敛：

```text
UI/index.ts 不再导出旧 PcEditorCommandBus、mapPcEditorCommandToEvent、usePcEditorUiCommandEmitter。
PlayerV3 和 PcEditorCommandEventBridge 改为直接从 legacy PcEditorCommandBus 文件导入，避免新 UI 代码从公共 barrel 误用旧命令总线。
effects/index.ts 和 effects/preview/index.ts 不再导出 WEBXR_PC_EFFECT_PREVIEW_EVENT / dispatchDomEffectPreview；旧 DOM preview 事件只保留在 PcEffectPreview legacy 兼容文件内。
删除未使用的 UI/usePcEditorUiCommandEmitter.ts。
UI/PcEditorCommandBus.tsx 和 3DUI/commands/EditorCommandBus.tsx 增加 legacy-only 代码注释。
```

2026-05-26 第二十三批 active Player V2 rate / sphere view 收敛：

```text
PcEditorEventName 增加 player.recording.rate.set、editor.effects.speed.set、editor.effects.speed.reset。
useSphereFovWheelBinding 不再通过 PlayerV2 props 回调直接改播放、录制或特效速度；Z/X/C + wheel 分别发 playback rate、recording rate、effect speed 语义事件。
播放速度由 player.playback.rate.set -> usePlayerPlaybackWorkflow -> player adapter 处理。
录制速度和特效速度由 player.recording.rate.* / editor.effects.speed.* -> usePlayerV2EditorPreviewWorkflow 写入 runtime rates。
PlayerV2 和 PcPlayerControlsSimple 读取 usePcEditorRateState，不再各自私有保存 recordingRate / effectSpeed。
普通 wheel 只发 editor.sphere.fov.step，sphereView.fov 由 workflow 写入 runtime state，A-Frame camera 作为运行时 adapter 读取并应用。
这批之后，active Player V2 的 rate 与 sphere FOV 已符合“事件表达动作、状态池提供当前值”的原则。
```

2026-05-26 第二十四批 effect preview legacy 出口继续收敛：

```text
UI/PcEffectPreview.tsx 不再 re-export WEBXR_PC_EFFECT_PREVIEW_EVENT / PcEffectPreviewDetail。
旧 UI/PcEffectsPanel.tsx 如果需要 DOM preview 兼容，必须显式从 effects/preview/domPreviewEvents.ts 和 effects/preview/types.ts 导入。
这样 PcEffectPreview 组件文件只作为 preview 组件入口，新代码更不容易误把 legacy DOM CustomEvent 当成新架构 API。
active /xr/player-v2 仍保持 legacyDomEvents=false，主路径继续是 PcEditorEventBus + runtime effectInput。
```

## 2. 当前基线

初始状态池位置：

```text
apps/web/src/components/pc_editor/state/runtimeStateStore.ts
```

当前已经包含：

```text
cropMask
  当前 center、fov、locked、opacity、input source、videoTimeMs。

playback
  当前播放时间、总时长、播放中状态、播放速度、sourceId、ready/status。

rates
  当前录制速度 recordingRate 和特效速度 effectSpeed。

sphereView
  球面播放器自身的当前 FOV。

viewTarget
  编辑和导出真正使用的当前取景中心、FOV、锁定状态和 mask opacity。

maskViewportBounds
  crop viewport 四角、球面坐标、可选屏幕投影矩形。

keyboard.pressed
  当前按下的键盘按键。
```

当前写入方：

```text
mask_controller/webxr/AFrameCropViewportMask.tsx
  写入 cropMask。

mask_controller/webxr/AFrameCropViewportBoundsBroadcaster.tsx
  写入 maskViewportBounds。

interactions/useKeyboardEventBindings.ts
  写入 keyboard.pressed。

workflows/editor/usePlayerV2EditorPreviewWorkflow.ts
  写入 viewTarget、rates、sphereView。
```

当前读取方：

```text
UI/PcEffectPreview.tsx
  读取 maskViewportBounds，用于把 viewport-mask 预览放到真实裁剪窗口位置。
```

`Aframe/player-v2/PlayerV2.tsx` 当前已经接入：

```text
PcEditorEventRoot
  PcEditorRuntimeStateRoot
    PlayerV2Content
```

这说明组合边界已经有了，但实际接入还只是第一步。

## 3. 什么应该进状态池

应该进入运行时状态池的值：

```text
持续变化。
多个模块需要读当前值。
真实来源来自 runtime adapter、播放器、A-Frame、输入层或 XR session。
workflow 需要在事件发生时读取当前快照。
DOM UI、3D UI、debug、preview 需要读同一份实时值。
```

应该保留为组件局部状态的值：

```text
只有一个组件使用。
只是 UI 外观状态，例如某个分类是否展开。
是 catalog/config 数据，而不是运行时实时值。
是表单草稿，提交前不影响编辑器真实状态。
```

边界规则：

```text
没有第二个读取方时，可以先留在局部。
一旦出现跨组件读取，就迁入状态池。
不要把状态池变成所有 useState 的垃圾桶。
```

## 4. 建议的状态结构

状态池后续建议扩展为：

```typescript
type PcEditorRuntimeState = {
  playback: PcEditorPlaybackRuntimeState | null;
  viewTarget: PcEditorViewTargetRuntimeState | null;
  cameraPose: PcEditorCameraPoseRuntimeState | null;
  cropMask: PcEditorCropMaskRuntimeState | null;
  maskViewportBounds: PcEditorMaskViewportBounds | null;
  input: PcEditorInputRuntimeState;
  effectInput: PcEditorEffectInputRuntimeState | null;
  xrSession: PcEditorXrSessionRuntimeState | null;
};
```

字段语义：

```text
playback
  currentTimeMs、durationMs、isPlaying、playbackRate、status、sourceId、updatedAt。

viewTarget
  编辑/导出的取景状态。PC Player V2 中通常由 cropMask 派生。

cameraPose
  原始 camera/head/controller pose。它不一定等于最终导出取景。

cropMask
  A-Frame crop mask runtime 上报的真实遮罩状态。

maskViewportBounds
  16:9 裁剪窗口的屏幕投影和球面四角。

input
  keyboard pressed、pointer pressed、语义按钮 pressed、VR controller button 状态。

effectInput
  特效快捷键、按住型特效、当前预览 target 等共享输入状态。

xrSession
  Meta/WebXR session 状态，包含 ready/requesting/presenting/error 等。
```

特别注意：

```text
cameraPose 是用户/相机看向哪里。
cropMask 是当前裁剪窗口在哪里。
viewTarget 是编辑和导出真正使用的视角。
```

在 PC Player V2 中，导出取景应该主要跟随 `cropMask/viewTarget`，不要默认使用裸 camera pose。

## 5. 需要动的模块

### 5.1 Player V2 主壳

文件：

```text
apps/web/src/components/pc_editor/Aframe/player-v2/PlayerV2.tsx
apps/web/src/components/pc_editor/state/usePlayerV2State.ts
```

当前 `usePlayerV2State` 保存：

```text
isPlaying
currentTimeMs
durationMs
fov
maskCenter
maskLocked
maskOpacity
recordingActive
autoRenderEnabled
playlistOpen
xrStatus
sceneReady
source/render 状态
```

建议迁移：

```text
迁入状态池：
  isPlaying、currentTimeMs、durationMs、playbackRate/status。
  fov、maskCenter、maskLocked、maskOpacity，对应 cropMask/viewTarget。
  sceneReady、XR presenting 状态，如果多个模块需要读。

暂时保留在 view/workflow state：
  active session/source。
  renderExportId/renderStatus/renderMessage。
  source switching status/message。
  playlistOpen，除非 3D UI 和 flat UI 都需要读。
  autoRenderEnabled、recordingActive，直到 workflow/reducer 更明确。
```

迁移方式：

```text
不要一次删除 usePlayerV2State。
先新增 runtime writers/readers。
再把 UI 读数改成 selector-backed container。
最后移除重复状态。
```

### 5.2 播放器状态

相关文件：

```text
Aframe/360video_player/AFrame360VideoPlayer.tsx
Aframe/360video_player/types.ts
UI/PcPlayerControlsSimple.tsx
3DUI/native-player/SpatialNativePlayerBar.tsx
3DUI/hybrid-player/HybridSkinPlayerBar.tsx
workflows/player/usePlayerPlaybackWorkflow.ts
```

当前方式：

```text
AFrame360VideoPlayer 通过 onPlaybackStateChange 上报。
PlayerV2Content 把结果写进本地 usePlayerV2State。
Flat UI 和 3D UI 通过 props 得到播放状态。
```

目标方式：

```text
AFrame360VideoPlayer 或 PlayerV2Content 写入 runtime playback。
播放器 UI 可以保持纯 props 组件，但由 state-backed container 提供 props。
workflow 只在处理事件时读取当前 snapshot。
```

新增字段：

```text
playback.currentTimeMs
playback.durationMs
playback.isPlaying
playback.playbackRate
playback.status
playback.sourceId
playback.updatedAt
```

高频更新规则：

```text
不要无脑每帧更新整个 store。
video time 可以沿用 timeupdate 或节流更新。
只有需要逐帧视觉反馈的组件才订阅高频字段。
```

### 5.3 当前视角、mask 和 bounds

相关文件：

```text
mask_controller/webxr/AFrameCropViewportMask.tsx
mask_controller/webxr/AFrameCropViewportBoundsBroadcaster.tsx
data/timeline-bridge/AFrameTimelineBridge.ts
workflows/editor/usePlayerV2EditorPreviewWorkflow.ts
workflows/editor/usePlayerV2TimelineWorkflow.ts
UI/PcWorkbenchPanelSimple.tsx
UI/PcEffectPreview.tsx
```

已经进状态池：

```text
cropMask
maskViewportBounds
```

仍然分散的地方：

```text
PlayerV2Content 仍保存 view.maskCenter/view.fov/view.maskOpacity。
AFrameTimelineBridge 内部仍有 viewState。
Timeline bridge 仍直接监听 webxr:crop-mask-change。
Workbench 通过 props 接收 mask 值。
```

目标方式：

```text
crop mask runtime 写 cropMask。
状态池写入或派生 viewTarget。
Timeline bridge 从状态池 snapshot 或 bridge adapter 读取 viewTarget。
Workbench/debug/effect preview 通过 selector 读取 viewTarget/cropMask/bounds。
```

建议顺序：

```text
1. 给状态池新增 viewTarget。
2. cropMask 变化时同步写 viewTarget。
3. 新增 selector hook：
   usePcEditorViewTarget()
   usePcEditorPlaybackState()
   usePcEditorPressedControl(id)
4. 迁移 PcWorkbenchPanelSimple 的实时读数。
5. 让 timeline bridge 消费 runtime viewTarget，再移除重复 window listener。
```

### 5.4 按钮、鼠标、键盘、VR 控制器按压状态

相关文件：

```text
interactions/useKeyboardEventBindings.ts
effects/input/useEffectShortcutBindings.ts
mask_controller/inputs/usePcMaskPointerInput.ts
mask_controller/inputs/usePcEdgePan.ts
UI/PcPlayerControlsSimple.tsx
UI/PcWorkbenchPanelSimple.tsx
UI/PcEffectsPanelSimple.tsx
3DUI/hybrid-player/HybridSkinPlayerBar.tsx
3DUI/native-player/SpatialNativePlayerBar.tsx
interactions/useVrRayEventBinding.ts
```

已经进状态池：

```text
keyboard.pressed
```

缺失：

```text
语义按钮 pressed 状态。
鼠标 pointer down / mask dragging 状态。
VR controller trigger/grip/thumbstick pressed 状态。
effect hold key 状态，如果它要被 preview/XR/workflow 多方读取。
3D ray hover/active target 状态，如果 3D UI 需要共享。
```

建议输入状态结构：

```typescript
type PcEditorInputRuntimeState = {
  keyboard: {
    pressed: Record<string, PcEditorPressedKeyState>;
  };
  controls: {
    pressed: Record<string, PcEditorPressedControlState>;
  };
  pointer: {
    primaryDown: boolean;
    draggingMask: boolean;
    lastScreen?: { x: number; y: number };
  };
  vrControllers: Record<"left" | "right", PcEditorControllerInputState | null>;
};
```

语义 control id 尽量复用 binding trigger target：

```text
player-play-toggle
player-record-start
player-record-end
viewport-yaw-left
viewport-yaw-right
crop-start
crop-end
render-request
effect:<categoryId>:<effectId>
```

规则：

```text
button pointerdown/up 写 pressed state。
button click 仍然 emit event。
状态池不能替代事件系统。
```

### 5.5 特效输入和预览

相关文件：

```text
UI/PcEffectsPanelSimple.tsx
effects/input/useEffectShortcutBindings.ts
effects/input/effectShortcutStateMachine.ts
UI/PcEffectPreview.tsx
effects/preview/domPreviewEvents.ts
workflows/editor/usePlayerV2EffectsWorkflow.ts
```

当前方式：

```text
PcEffectsPanelSimple 自己保存 collapsed/openCategories。
useEffectShortcutBindings 保存 shortcut mode 和 holdKeyRef。
PcEffectPreview 已经读取 runtime maskViewportBounds。
momentary preview 仍使用 webxr:pc-effect-preview window event。
hold preview 已部分走 PcEditorEventBus。
```

目标方式：

```text
collapsed/openCategories 继续局部保存，除非其他模块要读。
active hold/pressed effect 如果被 DOM preview、XR preview、workflow 多方读取，则迁入 effectInput。
用 PcEditorEventBus 或 effectInput 替代 webxr:pc-effect-preview window event。
```

建议 effectInput：

```typescript
type PcEditorEffectInputRuntimeState = {
  mode: "hidden" | "category" | "effect" | "holding" | "selected";
  categoryId?: string;
  effectId?: string;
  holdKey?: string;
  startedAtMs?: number;
  previewTarget?: "screen" | "viewport-mask" | "sphere" | "world-layer";
  updatedAt: number;
};
```

注意：

```text
effects catalog 不进 runtime state。
catalog 是配置/数据，不是实时状态。
```

### 5.6 XR session 和控制器状态

相关文件：

```text
Aframe/immersive_mode/useMetaImmersiveMode.ts
Aframe/runtime/AFrameScene.tsx
Aframe/player-v2/ui/XrHud.tsx
data/timeline-bridge/compat/inputEvents.ts
data/timeline-bridge/compat/pose.ts
interactions/useVrRayEventBinding.ts
3DUI/hybrid-player/HybridSkinPlayerBar.tsx
```

当前方式：

```text
useMetaImmersiveMode 保存 canEnter/sessionState/message。
AFrame scene callbacks 更新局部 xrStatus。
Timeline bridge 内部保存 controller aim state。
VR ray binding 只 emit event，不暴露 pressed/hover state。
```

目标方式：

```text
XR adapter 写 xrSession。
controller input adapter 写 vrControllers。
VR ray binding 写 active/pressed control state，同时继续 emit event。
XrHud 和 3D UI 从 xrSession 读取。
Timeline bridge 可以继续保留 sampler 内部状态，但共享 controller/button 状态应进 runtime state。
```

### 5.7 旧 PC Editor 和 Player V3

相关文件：

```text
PcWebXrEditor.tsx
controls/usePcEditorControls.ts
controls/inputs/*
Aframe/player-v3/PlayerV3.tsx
Aframe/player-v2/ui/*
Aframe/player-v3/ui/*
```

这些位置还有大量局部实时状态和旧 command path。它们不应阻塞 Player V2 的状态池迁移。

建议策略：

```text
第一阶段只迁移 /xr/player-v2 当前活跃链路。
旧 /xr/player 和 player-v3 先标记为 legacy/migration candidates。
等 Player V2 状态池 API 稳定后，再决定是否合并或删除旧实现。
```

## 6. 迁移阶段

### Phase 1：扩展 schema 和 hooks

新增字段：

```text
playback
viewTarget
cameraPose
input.controls
input.pointer
input.vrControllers
effectInput
xrSession
```

新增 hooks：

```text
usePcEditorPlaybackState()
usePcEditorViewTarget()
usePcEditorCameraPose()
usePcEditorPressedKey(code)
usePcEditorPressedControl(id)
usePcEditorEffectInput()
usePcEditorXrSession()
```

新增 writers：

```text
setPcEditorPlaybackState
setPcEditorViewTarget
setPcEditorCameraPose
setPcEditorControlPressed
setPcEditorPointerState
setPcEditorControllerState
setPcEditorEffectInput
setPcEditorXrSession
```

### Phase 2：迁移真实数据源

优先迁移真实写入方：

```text
AFrame360VideoPlayer -> playback
AFrameCropViewportMask -> cropMask and viewTarget
AFrameCropViewportBoundsBroadcaster -> maskViewportBounds
useKeyboardEventBindings -> keyboard.pressed
UI button pointerdown/up -> input.controls.pressed
usePcMaskPointerInput -> input.pointer.draggingMask
useMetaImmersiveMode -> xrSession
useVrRayEventBinding -> input.controls / controller state
```

### Phase 3：迁移读取方

先不改行为，只改读取来源：

```text
PcEffectPreview -> 已读取 maskViewportBounds 和 effectInput。
PcEditorDebugState -> 读取 runtime snapshot。
PcWorkbenchPanelSimple -> 通过 container 读取 crop/view/playback snapshot。
PcPlayerControlsSimple -> 保持纯组件，必要时新增 state-backed container。
3D player bars -> 读取 playback 和 pressed controls。
Timeline workflows -> 在事件处理时读取 snapshot。
```

### Phase 4：移除重复状态

读取方稳定后：

```text
移除 PlayerV2 中重复的 playback local state。
移除重复的 maskCenter/fov state，或改为由 runtime viewTarget 派生。
移除与 runtime state 重复的 window event listener。
用 EventBus 或 effectInput 替代 momentary effect preview window event。
```

### Phase 5：收敛 scoped store

当前 A-Frame 兼容层仍使用默认 singleton 写入状态池。等 React adapter 边界稳定后，应收敛为真正 scoped store：

```text
PcEditorRuntimeStateRoot 创建 store instance。
React writer hooks 使用 usePcEditorRuntimeStateStore()。
A-Frame 全局事件由 React bridge adapter 转写入 scoped store。
测试可以创建隔离 store。
```

## 7. 风险

高频 rerender：

```text
playback time、pointer movement、projected bounds 都可能高频更新。
大组件不要直接订阅整个 usePcEditorRuntimeState()。
优先使用字段级 selector。
不要求逐帧精度的字段要节流或量化。
```

重复 source of truth：

```text
迁移期可以有镜像状态。
长期必须明确每个字段只有一个真实写入方。
```

A-Frame 全局注册：

```text
全局 A-Frame component 不能直接使用 React context。
需要 React bridge adapter 做边界转换。
默认 singleton 可以作为迁移期兼容层，但不是最终 scoped 模型。
```

事件和状态混淆：

```text
click/select/hold-start/crop-end 仍是事件。
pressed/currentTime/currentView 是状态。
不要用状态写入替代命令或事件。
```

## 8. 验收清单

迁移完成时应满足：

```text
所有共享实时值都有唯一 runtime writer。
UI、3D UI、workflow 通过 selector 或 snapshot 读取共享实时值。
没有兄弟组件 import 另一个兄弟组件来读实时状态。
Player V2 不再在多个位置重复保存 playback 和 crop view 状态。
特效预览位置读取真实 mask bounds。
按钮、键盘、VR controller pressed 状态都可以从状态池获取。
typecheck 和 Player V2 smoke/edit-flow 测试通过。
```
