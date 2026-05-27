# PC Editor 交互层整理

更新日期：2026-05-27

这个目录是 PC Editor 的输入适配层。它负责把键盘、鼠标 / 手柄、普通 DOM UI、沉浸式 3D UI 等真实输入，转换成统一的 `PcEditorEventBus` 事件，或写入少量“当前按下 / 当前指针 / 当前手柄”的 runtime state。

交互层不直接改 timeline、不直接调播放器兄弟组件、不直接拼后端 payload。业务行为由 `../workflows` 里的订阅者消费事件后完成。

VR 端目标操作映射见：[vr-operation-mapping.md](./vr-operation-mapping.md)。

## 当前主路径

当前新的主路径是 `/xr/player-v2`：

```text
apps/web/src/components/pc_editor/Aframe/player-v2/PlayerV2.tsx
  PcEditorEventRoot
  PcEditorRuntimeStateRoot
  useKeyboardEventBindings(playerV2KeyboardBindings)
  usePcViewportKeyboardMotion
  usePcViewportKeyboardFov
  useSphereFovWheelBinding
  usePcMaskPointerInput
  usePcMaskRayTargetInput
  PlayerV2Spatial3DUiLayer
  usePlayerV2Workflows
```

旧的 `../PcWebXrEditor.tsx`、`../controls/inputs/usePcKeyboardShortcuts.ts` 和 `features/webxr/pc-editor` 下面的副本还在，但属于兼容 / 旧入口。新增交互优先接到 Player V2 的事件总线，不再扩展旧的直连 controls 路径。

## 总体数据流

```text
真实输入
  -> interaction adapter / UI emitter / 3D UI action adapter
  -> PcEditorBinding 或手写 event mapping
  -> PcEditorEventBus
  -> workflow subscriber
  -> runtime state / player handle / timeline bridge / backend bridge
  -> A-Frame renderer、DOM UI、preview 读取最新状态
```

事件描述“发生了什么”，runtime state 描述“现在是什么状态”。

```text
键盘 Space
  -> useKeyboardEventBindings
  -> trigger { kind: "keyboard", target: "Space", action: "keydown" }
  -> player.playback.toggle
  -> usePlayerPlaybackWorkflow
  -> playerRef.togglePlay()

3D 播放按钮
  -> A-Frame clickable hit plane
  -> Spatial3DUiAction { type: "player.playPause.toggle" }
  -> PlayerV2Spatial3DUiLayer
  -> player.playback.toggle
  -> 同一个 usePlayerPlaybackWorkflow
```

## 相关目录职责

| 目录 | 职责 |
| --- | --- |
| `../interactions` | 输入适配器。键盘、滚轮、VR ray 的通用 binding。 |
| `../bindings` | trigger 到 semantic event 的声明式映射。 |
| `../events` | `PcEditorEventBus` 和事件类型。 |
| `../state` | runtime state pool，保存按键、手柄、播放、取景、渲染等当前值。 |
| `../UI` | 普通 DOM UI。通过 `usePcEditorBindingEmitter` 或 `usePcEditorUiEventEmitter` 发事件。 |
| `../3DUI` | A-Frame / WebXR 空间 UI。输出 `Spatial3DUiAction`，由 Player V2 装配层转成事件。 |
| `../mask_controller/inputs` | 取景框相关指针 / ray 输入。虽然物理上在 mask controller，语义上也是交互适配层。 |
| `../workflows` | 事件订阅者。把语义事件变成播放、取景、timeline、效果、渲染行为。 |

## 事件源类型

`PcEditorEventSourceKind` 当前支持：

| kind | 用法 |
| --- | --- |
| `keyboard` | PC 键盘输入。 |
| `ui` | 普通 DOM UI。 |
| `gesture` | PC 指针、滚轮、拖拽等连续输入。 |
| `vr-ray` | Quest controller ray 或 A-Frame `.clickable` hit plane 触发的 3D UI 选择。 |
| `xr-runtime` | 原生 XR runtime / A-Frame controller button 事件。 |
| `workflow` | workflow 内部派生事件。 |
| `system` | 系统或 fallback。 |

## 键盘交互

核心文件：

```text
useKeyboardEventBindings.ts
playerV2KeyboardBindings.ts
usePcViewportKeyboardMotion.ts
usePcViewportKeyboardFov.ts
../effects/input/useEffectShortcutBindings.ts
../mask_controller/inputs/usePcMaskPointerInput.ts
```

### 离散键盘 binding

`useKeyboardEventBindings` 监听 `keydown` / `keyup`，写入：

```text
runtime.keyboard.pressed
runtime.input.controls.pressed
```

然后用 `resolvePcEditorBinding` 查 `playerV2KeyboardBindings` 并发事件。输入框、textarea、select、contenteditable 中的键盘事件会跳过业务 binding。

| 输入 | 事件 | 备注 |
| --- | --- | --- |
| `Space` down | `player.playback.toggle` | 忽略 repeat，阻止默认滚动。 |
| `F` down | `editor.timeline.flush` | payload: `{ reason: "live" }`。 |
| `Delete` down / up | `editor.timeline.discard.begin` / `editor.timeline.discard.end` | 用于按住丢弃片段。 |
| `Shift+R` down | `editor.crop.start` | 开始 crop recording。 |
| `R` down | `editor.crop.end` | 结束 crop recording。 |
| `P` down | `player.playlist.toggle` | 打开 / 关闭播放列表。 |
| `[` / `]` down | `editor.viewport.roll.step` | 取景框 roll -5 / +5。 |
| `Tab` down | `editor.effects.shortcut.open` | Player V2 额外添加。 |
| `Digit1` 到 `Digit9` down / up | `editor.effects.shortcut.key.down` / `editor.effects.shortcut.key.up` | Player V2 额外添加。 |

`playerV2KeyboardBindings` 会从默认 binding 中移除 `W/A/S/D/Q/E` 的离散 step 版本，因为 Player V2 用连续运动 hook 处理这些键，避免同一个按键同时触发“每帧平滑”和“每次 keydown step”。

### 连续取景运动

`usePcViewportKeyboardMotion` 负责 `W/A/S/D`：

| 输入 | 输出事件 | 行为 |
| --- | --- | --- |
| `W/S` 按住 | `editor.viewport.center.set` | pitch 连续运动，`meta.phase = "change"`。 |
| `A/D` 按住 | `editor.viewport.center.set` | yaw 连续运动，带加速度 / 刹车 / line ripple smoothing。 |
| 松开并停止 | `editor.viewport.center.set` | `commit: true`，`meta.phase = "end"`。 |

`usePcViewportKeyboardFov` 负责 `Q/E`：

| 输入 | 输出事件 | 行为 |
| --- | --- | --- |
| `Q` 按住 | `editor.viewport.fov.set` | FOV 连续变小，最小 35。 |
| `E` 按住 | `editor.viewport.fov.set` | FOV 连续变大，最大 154。 |
| 松开并停止 | `editor.viewport.fov.set` | `commit: true`，`meta.phase = "end"`。 |

### 效果快捷键

`useEffectShortcutBindings` 管理 Tab + 数字键的状态机：

```text
hidden
  -> Tab
category
  -> 数字选择 category
effect
  -> 数字选择 effect
holding / selected
```

黑场 / 白场类效果是 hold effect：

```text
数字 keydown -> editor.effects.hold.start
数字 keyup   -> editor.effects.hold.end
```

其他效果：

```text
数字 keydown -> editor.effects.select
```

注意：这个 hook 当前同时监听 window keyboard events 和 EventBus shortcut events，是为了兼容 DOM UI 与 3D UI。后续如果出现重复触发，应收敛到 EventBus-only。

### 组合键 + 滚轮

`useSphereFovWheelBinding` 在 Player V2 stage 的 `onWheel` 上生效。它从 runtime state 读取当前按下的键：

| 输入 | 输出事件 |
| --- | --- |
| 普通滚轮 | `editor.sphere.fov.step` |
| `H` + 滚轮 | `editor.mask.opacity.set` |
| `Z` + 滚轮 | `player.playback.rate.set` |
| `X` + 滚轮 | `player.recording.rate.set` |
| `C` + 滚轮 | `editor.effects.speed.set` |

### `V` + 指针中心跟随

`../mask_controller/inputs/usePcMaskPointerInput.ts` 使用 `KeyV` 判断是否进入 center-follow：

```text
按住 V + 左键按下
  -> pointer lock / hide cursor
  -> camera center 连续更新
  -> mask.trackMaskToCenter(...)
  -> 松开后提交 camera center
```

它写入 `runtime.input.pointer`，避免 ray 背景点击在拖拽过程中误触发。

## 鼠标 / 指针 / 滚轮交互

| 输入 | 文件 | 输出 |
| --- | --- | --- |
| stage 左键点击 | `../mask_controller/inputs/usePcMaskPointerInput.ts` | `mask.moveMaskTo(...)`，最终发 `editor.viewport.center.*`。 |
| stage 左键拖拽 | 同上 | 拖动相机视角，结束时提交 `editor.camera.center.set`。 |
| mask drag 模式 | 同上 | `editor.viewport.center.step` / `set`，边缘时带 camera edge-pan。 |
| `Shift` + 点击 | 同上 | 平滑移动 mask 到指针位置。 |
| stage 滚轮 | `useSphereFovWheelBinding.ts` | sphere FOV 或速率 / opacity 事件。 |
| A-Frame background ray click / triggerup | `../mask_controller/inputs/usePcMaskRayTargetInput.ts` | controller ray 或背景交点移动 mask。 |

`usePcMaskRayTargetInput` 会跳过这些 ray blocker：

```text
[data-ray-blocking="true"]
[data-crop-arc-id]
.clickable
```

这样 3D UI 按钮不会穿透到背景取景。

## 普通 DOM UI 点击

DOM UI 不应该直接调用 workflow。当前有两种发事件方式：

| API | 用法 |
| --- | --- |
| `usePcEditorBindingEmitter` | 有明确 trigger target 的按钮 / slider，先查 `defaultPcEditorBindings`。 |
| `usePcEditorUiEventEmitter` | 没有 binding target 或需要直接发 semantic event 的 UI。 |

`legacyCommandFallback` 只用于旧 command bus 迁移。Player V2 的 simple UI 基本设置为 `false`，表示必须走 EventBus。

### 播放器 DOM UI

文件：`../UI/PcPlayerControlsSimple.tsx`

| UI | trigger / event | 结果 |
| --- | --- | --- |
| previous | `ui:player-previous:click` | `player.source.previous` |
| play / pause | `ui:player-play-toggle:click` | `player.playback.toggle` |
| next | `ui:player-next:click` | `player.source.next` |
| progress range | `ui:player-progress:change` | `player.playback.seek` |
| record toggle | `ui:player-record-start/end:click` | `editor.crop.start/end` |
| playback rate button | direct event | `player.playback.rate.reset` |
| recording rate button | direct event | `player.recording.rate.reset` |
| effect speed button | direct event | `editor.effects.speed.reset` |
| settings | direct event | `ui.overlay.close` |
| playlist | `ui:playlist-toggle:click` | `player.playlist.toggle` |

### 工作台 DOM UI

文件：`../UI/PcWorkbenchPanelSimple.tsx`

| UI | trigger / event | 结果 |
| --- | --- | --- |
| collapse | direct event | `ui.panel.workbench.collapse.set` |
| FOV +/- | `ui:viewport-fov-in/out:click` | `editor.viewport.fov.step` |
| yaw +/- | `ui:viewport-yaw-left/right:click` | `editor.viewport.center.step` |
| pitch +/- | `ui:viewport-pitch-up/down:click` | `editor.viewport.center.step` |
| roll +/- | `ui:viewport-roll-counterclockwise/clockwise:click` | `editor.viewport.roll.step` |
| lock toggle | `ui:viewport-lock-toggle:click` | `editor.viewport.lock.set` |
| opacity slider | `ui:mask-opacity-slider:change` | `editor.mask.opacity.set` |
| clear / deepen | `ui:mask-opacity-clear/deepen:click` | `editor.mask.opacity.set` |
| start / end crop | `ui:crop-start/end:click` | `editor.crop.start/end` |
| auto-render checkbox | `ui:render-auto-toggle:change` | `editor.render.auto.set` |
| render | `ui:render-request:click` | `editor.render.request` |
| cut | `ui:cut-button:click` | `editor.timeline.cut` |
| flush | `ui:flush-button:click` | `editor.timeline.flush` |
| hold discard | `ui:discard-button:pointerdown/up` | `editor.timeline.discard.begin/end` |

### 播放列表 DOM UI

文件：`../playlist/PcPlaylistPanel.tsx`

| UI | trigger / event | 结果 |
| --- | --- | --- |
| close | `ui:playlist-close:click` | `player.playlist.close` |
| source item | `ui:playlist-source-select:click` | `player.source.select`，payload 带 `sourceId`。 |

### 效果 DOM UI

文件：`../UI/PcEffectsPanelSimple.tsx`

| UI / 快捷键状态 | event |
| --- | --- |
| collapse | `ui.panel.effects.collapse.set` |
| category toggle | `ui.panel.effects.category.toggle` |
| effect tile click | `editor.effects.select` |
| hold effect start/end | `editor.effects.hold.start/end` |

### BGM DOM UI

文件：`../UI/PcBgmControls.tsx`

BGM 控件当前直接调用 `listMusicTracks`、`getSessionMusic`、`updateSessionMusic`，并用本地 `<audio>` 预听。它还没有进入 `PcEditorEventBus`。如果后续要让 3D UI 或快捷键也能控制 BGM，需要先补 `editor.effects.bgm.set` / `editor.effects.bgm.clear` 的 workflow。

## 3D UI 点击

核心文件：

```text
../3DUI/shared/SpatialUiInteraction.ts
../3DUI/player-v3/PlayerV3SpatialUi.tsx
../Aframe/player-v2/immersive-ui/PlayerV2Spatial3DUiLayer.tsx
```

A-Frame scene 默认只 raycast `.clickable`：

```text
raycaster="objects: .clickable; recursive: true; interval: 0"
```

每个空间 UI 控件通常是透明 hit plane：

```text
className: "clickable"
data-ray-blocking="true"
```

`useSpatialButtonEvents` 统一处理：

```text
mouseenter / raycaster-intersected         -> hover
mouseleave / raycaster-intersected-cleared -> idle
mousedown                                  -> pressed
mouseup                                    -> hover
click                                      -> onClick
```

### 3D UI 到事件总线

3D UI 组件不直接发 `PcEditorEventBus`。它们先发 `Spatial3DUiAction` 或 legacy `PcEditorCommand`：

```text
HybridSkinPlayerBar / ArwesWorkbenchSpatialTable / SpatialPlaylistPopup / SpatialEffectRingMenu
  -> PlayerV3SpatialUi
  -> AFrameSpatial3DUi
  -> PlayerV2Spatial3DUiLayer.emitSpatialEvent
  -> eventFromSpatialAction
  -> PcEditorEventBus source.kind = "vr-ray"
```

核心 player / playlist action 会先走 `defaultPcEditorBindings` 的 spatial target：

| 3D action | spatial trigger | event |
| --- | --- | --- |
| `player.playPause.toggle` | `vr-ray:spatial-player-play-toggle:select` | `player.playback.toggle` |
| `player.previous` | `vr-ray:spatial-player-previous:select` | `player.source.previous` |
| `player.next` | `vr-ray:spatial-player-next:select` | `player.source.next` |
| `player.seekTo` | `vr-ray:spatial-player-progress:change` | `player.playback.seek` |
| `crop.start` | `vr-ray:spatial-player-record-start:select` | `editor.crop.start` |
| `crop.end` | `vr-ray:spatial-player-record-end:select` | `editor.crop.end` |
| `playlist.toggle` | `vr-ray:spatial-playlist-toggle:select` | `player.playlist.toggle` |
| `playlist.close` | `vr-ray:spatial-playlist-close:select` | `player.playlist.close` |
| `player.source.select` | `vr-ray:spatial-playlist-source-select:select` | `player.source.select` |

其他 3D action 在 `eventFromSpatialAction` 中手写映射：

| 3D action | event |
| --- | --- |
| `crop.render` / `render.request` | `editor.render.request` |
| `crop.autoRender.set` / `render.auto.set` | `editor.render.auto.set` |
| `mask.fov.step` | `editor.viewport.fov.step` |
| `mask.yaw.step` | `editor.viewport.center.step` |
| `mask.pitch.step` | `editor.viewport.center.step` |
| `mask.lock.set` | `editor.viewport.lock.set` |
| `mask.opacity.set` | `editor.mask.opacity.set` |
| `timeline.cut` | `editor.timeline.cut` |
| `timeline.flush` | `editor.timeline.flush` |
| `timeline.discard.begin/end` | `editor.timeline.discard.begin/end` |
| `effects.shortcut.open` | `editor.effects.shortcut.open` |
| `effects.shortcut.key.down/up` | `editor.effects.shortcut.key.down/up` |
| `effects.select` | `editor.effects.select` |
| `effects.hold.start/end` | `editor.effects.hold.start/end` |
| `effects.speed.set/reset` | `editor.effects.speed.set/reset` |
| `player.playbackRate.set/reset` | `player.playback.rate.set/reset` |
| `player.recordingRate.set/reset` | `player.recording.rate.set/reset` |
| `panel.*.collapse.set` | `ui.panel.*.collapse.set` |

### 当前 3D UI 组件交互

| 组件 | 交互 |
| --- | --- |
| `HybridSkinPlayerBar` | move handle、progress drag/click、previous、play/pause、next、record、playback rate reset、recording rate reset、settings close、playlist toggle。 |
| `ArwesWorkbenchSpatialTable` | CUT、PLAY、START、END、RENDER、SAMPLE auto-render、LOCK、Yaw/Pitch、Little Planet / Crystal Ball / Dolly / Look Around，DROP / MORE_DROP hold discard。 |
| `SpatialPlaylistPopup` | close、source select。 |
| `SpatialEffectRingMenu` | category select、effect select、hold effect start/end。 |

## 手柄 / XR runtime 交互

核心文件：`../Aframe/player-v2/immersive-ui/PlayerV2Spatial3DUiLayer.tsx`

`useQuestControllerBindingAdapter` 只在 `runtime.xrSession.presenting === true` 时启用，监听 scene 上的 A-Frame controller events。

它会同时写入：

```text
runtime.input.vrControllers.left/right.buttons
runtime.input.controls.pressed["vr-{hand}-{buttonId}"]
```

### 手柄按钮

| 输入 | runtime state | event |
| --- | --- | --- |
| trigger down / up | `trigger` pressed true / false | 单 trigger 只做 ray select / click。 |
| left + right trigger 同时按下 | `trigger` pressed | `player.playback.toggle`，并短暂 suppress 本轮 ray click。 |
| grip down / up | `grip` pressed true / false | 单 left grip 作为遮罩变换 modifier；双 grip 进入头显中心追踪。 |
| A down | `a` pressed | 子弹时间 toggle：进入 `0.1x`，再次按下恢复进入前播放速度。 |
| X down / up | `x` pressed | `editor.timeline.discard.begin` / `editor.timeline.discard.end`。 |
| Y down / up | `y` pressed | 遮罩透明度 modifier，配合右摇杆上下。 |
| B down | `b` pressed | `editor.effects.shortcut.open`，进入特效环形菜单。 |

### 摇杆

| 输入 | event |
| --- | --- |
| left grip + left thumbstick left / right | axes sampler 发 `editor.viewport.center.set`，fallback 离散事件发 yaw -5 / +5。 |
| left grip + left thumbstick up / down | axes sampler 发 `editor.viewport.center.set`，fallback 离散事件发 pitch +5 / -5。 |
| left grip + right thumbstick up / down | axes sampler 发 `editor.viewport.fov.set`，fallback 离散事件发 FOV -5 / +5。 |
| left grip + right thumbstick left / right | axes sampler 发 `editor.viewport.roll.set`，fallback 离散事件发 roll -5 / +5。 |
| Y + right thumbstick up / down | `editor.mask.opacity.set`，连续 axes 调节，范围 0 - 0.95。 |
| hold Play / Record / FX rate chip + right thumbstick up / down | `player.playback.rate.set` / `player.recording.rate.set` / `editor.effects.speed.set`，小推 +/- 0.05，大推 +/- 0.25，范围 0.25x - 4.00x。 |
| left grip + right grip | `editor.viewport.center.set`，持续跟随 head gaze center，松开时 `commit: true`。 |

### 手柄 ray 取景

`../mask_controller/inputs/usePcMaskRayTargetInput.ts` 监听：

```text
scene click
scene triggerup
```

如果 ray 命中背景 hit target，就把交点转换为 yaw / pitch 并移动 mask。若当前命中 `.clickable` 或 `data-ray-blocking="true"` 的 3D UI，则不会穿透到取景背景。

## Binding 表的核心 target

`../bindings/defaultBindings.ts` 是当前 trigger -> event 的主表。新增“多个输入触发同一语义”的功能时，优先在这里补 target。

| 语义 | keyboard | DOM UI target | 3D UI target | XR runtime |
| --- | --- | --- | --- | --- |
| 播放 / 暂停 | `Space` | `player-play-toggle` | `spatial-player-play-toggle` | `dual-trigger` |
| seek |  | `player-progress` | `spatial-player-progress` |  |
| 开始录制 | `Shift+R` | `player-record-start`, `crop-start` | `spatial-player-record-start` | `X` 按钮派生 |
| 结束录制 | `R` | `player-record-end`, `crop-end` | `spatial-player-record-end` | `X` 按钮派生 |
| 上一个视频 |  | `player-previous` | `spatial-player-previous` |  |
| 下一个视频 |  | `player-next` | `spatial-player-next` |  |
| 选择视频 |  | `playlist-source-select` | `spatial-playlist-source-select` |  |
| 播放列表开关 | `P` | `playlist-toggle` | `spatial-playlist-toggle` |  |
| 关闭播放列表 |  | `playlist-close` | `spatial-playlist-close` |  |
| flush timeline | `F` | `flush-button` |  |  |
| 丢弃片段 hold | `Delete` down/up | `discard-button` pointerdown/up |  | `Y` down/up |
| cut |  | `cut-button` | `cut-target` | `A` |
| FOV step | 默认 Q/E，Player V2 改用连续 hook | `viewport-fov-in/out` | action `mask.fov.step` | thumbstick up/down |
| yaw / pitch step | 默认 WASD，Player V2 改用连续 hook | `viewport-yaw-*`, `viewport-pitch-*` | action `mask.yaw.step`, `mask.pitch.step` | thumbstick left/right |
| roll step | `[` / `]` | `viewport-roll-*` |  |  |
| viewport lock |  | `viewport-lock-toggle` | action `mask.lock.set` |  |
| mask opacity | `H` + wheel | `mask-opacity-*` | action `mask.opacity.set` |  |
| render |  | `render-request` | action `render.request` |  |
| auto render |  | `render-auto-toggle` | action `render.auto.set` |  |

## Workflow 消费方

| event family | consumer |
| --- | --- |
| `player.playback.*` | `../workflows/player/usePlayerPlaybackWorkflow.ts` |
| `player.source.*`, `player.playlist.*` | `../workflows/player/usePlayerSourceWorkflow.ts` |
| `editor.viewport.*`, `editor.sphere.*`, `editor.mask.*`, rates, crop UI state | `../workflows/editor/usePlayerV2EditorPreviewWorkflow.ts` |
| `editor.timeline.*`, crop end sealing, recording timeline writes | `../workflows/editor/usePlayerV2TimelineWorkflow.ts` |
| `editor.effects.select`, `editor.effects.hold.*` | `../workflows/editor/usePlayerV2EffectsWorkflow.ts` |
| `editor.render.request` | `../workflows/editor/usePlayerV2RenderWorkflow.ts` |
| `editor.camera.center.set` | Player V2 composition boundary in `PlayerV2.tsx` |

## Runtime state 写入点

| state | 写入者 |
| --- | --- |
| `keyboard.pressed` | `useKeyboardEventBindings` |
| `input.controls.pressed` | keyboard binding、VR ray binding、Quest controller binding |
| `input.pointer` | `usePcMaskPointerInput` |
| `input.vrControllers` | `useQuestControllerBindingAdapter` |
| `playback` | `AFrame360VideoPlayer.onPlaybackStateChange` |
| `viewTarget` | workflow、mask controller、初始化状态 |
| `sphereView` | `editor.sphere.*` workflow |
| `effectInput` | effect shortcut controller、DOM effects panel、3D effects ring |
| `editorUi`, `render`, `discard`, `xrSession` | Player V2 composition / workflows |

## 新增交互的建议步骤

1. 先确认它是不是已有语义事件能表达。能复用就不要新增 event。
2. 如果需要新语义，先在 `../events/eventTypes.ts` 添加事件名和 payload 约定。
3. 如果是“输入 target -> 事件”的固定映射，补到 `../bindings/defaultBindings.ts`。
4. DOM UI 用 `usePcEditorBindingEmitter` 或 `usePcEditorUiEventEmitter`。
5. 3D UI 先发 `Spatial3DUiAction`，再在 `PlayerV2Spatial3DUiLayer.eventFromSpatialAction` 映射到事件。
6. 手柄硬件按钮放到 `useQuestControllerBindingAdapter`，并同步 `runtime.input.vrControllers`。
7. 连续输入要用 `meta.phase` 和 `commit` 区分预览与提交。
8. 业务行为放到 workflow 订阅者里，不在输入适配器里直接调 sibling component。
9. 如果需要多个组件读取“当前值”，写 runtime state；不要藏在某个 UI 本地 state 里。

## 已知迁移注意点

- `../UI/PcEditorCommandBus.tsx` 和 `../3DUI/commands/EditorCommandBus.tsx` 是 legacy command bus。新功能不要扩展 command bus，除非为了迁移旧入口。
- `../composition/PcEditorCommandEventBridge.tsx` 只负责把 legacy command 映射到 EventBus。
- `../PcWebXrEditor.tsx` 仍有 props callback 和旧 controls 直连路径，不代表 Player V2 的最终交互架构。
- `../controls/inputs/usePcKeyboardShortcuts.ts` 是旧 PC workbench 的键盘控制，里面直接调 operation。Player V2 新路径使用本目录的 EventBus 适配器。
- `useVrRayEventBinding.ts` 是通用 ref target 的 vr-ray binding 工具。当前 Player V2 的主要 3D UI 点击由 `PlayerV2Spatial3DUiLayer` 统一映射，背景 ray 取景由 `usePcMaskRayTargetInput` 处理。
