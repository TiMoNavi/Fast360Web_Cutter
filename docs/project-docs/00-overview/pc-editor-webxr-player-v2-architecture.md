# PC Editor WebXR Player V2 架构说明

## 1. 目标和范围

这份文档说明 `/xr/player-v2` 在 PC Editor 前端里的目标架构、当前实现状态和扩展方法。它的目标不是把旧 `/xr/player` 的代码原样搬到新页面，而是把播放、剪辑、WebXR 渲染、平面 UI、交互、事件、数据编排、后端对接拆成可以组合和横向扩展的层。

范围只包含：

```text
apps/web/src/components/pc_editor
/xr/player-v2
PC Editor 前端组件
A-Frame/WebXR 组件
前端事件系统
前端数据编排
Backend Bridge / Transport 的前端封装
```

范围不包含：

```text
普通 Web 页面架构
后端正式渲染实现细节
数据库模型设计
登录、上传、下载等非 PC Editor 页面流程
```

当前事实：

```text
/xr/player
  旧页面，暂时保留为参考面和回退面。

/xr/player-v2
  新架构验证入口。
  当前实际从 @/components/pc_editor/Aframe/player-v2 进入。

apps/web/src/features/webxr/player-v2
  过渡/重复实现，不作为长期主归属。
```

长期主目录：

```text
apps/web/src/components/pc_editor
```

组件扩展原则是父子嵌套组合：父组件装配子组件，子组件通过 props、context、event emit 或 state model 通信。兄弟组件不能互相 import、互相调用或知道彼此内部实现。

如果某个值是实时变化的，并且需要被多个组件持续访问，它不应该由某个 UI 组件私有保存，也不应该让兄弟组件互相引用来读取。应把这类值放进 PC Editor 的运行时状态池，由真实数据源负责写入，其他组件只从状态池读取当前快照或订阅变化。典型例子包括 crop mask 当前中心点、FOV、四角范围、屏幕投影矩形、播放状态、按键是否正在按压等。事件系统负责表达“发生了什么动作”，状态池负责提供“现在的实时值是什么”。

## 2. 当前实现状态

截至当前版本，`/xr/player-v2` 已经完成一条可运行的主链路：

```text
UI / Keyboard / Gesture
  -> Binding Layer
  -> PcEditorEventBus
  -> Workflow Layer
  -> State Layer
  -> A-Frame Runtime / Timeline Bridge
  -> Backend Bridge
  -> Transport
  -> API
```

已经验证通过的真实流程：

```text
注册用户
上传 equirect-grid.mp4
创建并激活 cut session
打开 /xr/player-v2
开启 Auto-render
Start crop
点击 Yaw + 移动视角
End crop
发送 ViewPathPatch
触发 render-test
轮询 export status
显示导出下载链接
显示导出完成弹窗
点击弹窗进入 /mobile/exports/:exportId
平面 export 详情页显示 Ready
```

对应测试：

```text
apps/web/e2e/player-v2-edit-flow.spec.ts
```

验证命令：

```text
npm run typecheck
npx playwright test e2e/player-v2-edit-flow.spec.ts --project=chrome
```

最近一次架构拆分后已确认：

```text
npm run typecheck
  通过。

完整 e2e / render-test 流程需要在后端渲染服务稳定后继续复测。
```

已落地模块：

```text
components/pc_editor/events
  typed PcEditorEventBus、事件类型、Provider、订阅 hook。

components/pc_editor/composition
  PcEditorEventRoot 包住 Player V2。
  /xr/player-v2 当前关闭旧 CommandBus bridge，主链路只走 PcEditorEventBus。
  PcEditorCommandEventBridge 仍保留给旧页面或迁移期兼容路径。

components/pc_editor/bindings
  defaultPcEditorBindings 定义 trigger -> event。
  usePcEditorBindingEmitter 用于 UI 控件声明触发器。

components/pc_editor/interactions
  useKeyboardEventBindings 已启用 Player V2 保守快捷键集。
  useVrRayEventBinding 已作为 VR ray target -> Binding Layer 的通用 adapter。

components/pc_editor/3DUI
  AFrameSpatial3DUi 是可嵌入的 A-Frame 3D UI 组件入口。
  组件只读取宿主传入的 model 快照，并通过 onAction 发出动作语义，不直接调用播放器、workflow、后端或 timeline。
  player-v3 目录下保留 PlayerV3SpatialUi 作为父装配组件，同时提供 registerAFrameSpatial3DUiComponent 给非 React A-Frame 宿主使用。
  shared/Spatial3DUiPublicApi.ts 定义 SpatialPlayerState、SpatialVideoSource、Spatial3DUiAction 等对外契约。

components/pc_editor/Aframe/player-v2/immersive-ui
  PlayerV2Spatial3DUiLayer 是 active Player V2 的沉浸式 3D UI 接入层。
  它读取 runtimeStateStore 中的 xrSession、playback、viewTarget 和 controller input。
  只有 xrSession.presenting=true 时渲染 AFrameSpatial3DUi。
  它把 3D UI action 先解析为 trigger，再通过 defaultPcEditorBindings 进入 PcEditorEventBus。
  双手 trigger 同时按下会作为 xr-runtime trigger 触发 player.playback.toggle。

components/pc_editor/workflows
  usePlayerV2Workflows 组合播放、预览、timeline、effects、render、source workflows。
  Workflow 是唯一把事件转成业务动作的位置。

components/pc_editor/state
  runtimeStateStore 是 PC Editor 运行时状态池，保存 playback、rates、sphereView、viewTarget、cropMask、maskViewportBounds、cameraPose、input、effectInput、xrSession 等共享实时状态。
  usePlayerV2State 当前只作为 Player V2 迁移期 view model / fallback，view 输出优先读取 runtime playback 和 viewTarget。

components/pc_editor/mask_controller
  球形遮罩已接入 Player V2。
  AFrameCropViewportRig 负责 spherical mask 和边界弧线。
  pc-crop-viewport-* 命名避免与旧 crop-viewport-mask 全局注册冲突。
  旧 useCropMaskRuntimeEventBridge 已删除，不再作为 window crop-mask-change 兼容桥暴露。
  /xr/player-v2 已关闭 crop mask legacy window command 监听，center/FOV/lock/opacity 主链路通过 PcEditorEventBus + runtime viewTarget。
  四角 FOV 拖拽在 active Player V2 中发 editor.viewport.fov.set，不再发 window crop-mask-fov command。
  cropMask 当前值由 AFrameCropViewportMask 直接写 runtime state。

components/pc_editor/data/timeline-bridge
  录制中采样 crop mask 视角，生成 ViewPathPatch。
  发送 EffectEventsPatch 和 PlaybackClientState。
  当前只在 recordingActive=true 时启用，避免打开页面就持续发 patch。
  已支持 createViewPathRange，用于“暂停中按住黑场并切视角”这类需要写入一段显式视角范围的操作。
  legacyCropMaskWindowEvents / legacyWindowSemanticEvents 默认关闭；旧 PcWebXrEditor 需要兼容时显式打开。
  editor.viewport.center.* 和 editor.viewport.fov.* 录制中会强制写 path sample，避免暂停时 currentTime 不变导致视角变化丢失。

components/pc_editor/backend
  封装后端业务语义。
  playerV2BackendBridge.ts 负责 source session 和 render 请求。
  timelineBackendBridge.ts 负责 path/effect/playback 上报。

components/pc_editor/transport
  最底层网络传输封装。
  复用 src/lib/api.ts 和协议类型，不承载 UI 或业务决策。

components/pc_editor/UI/export_prompt
  PcExportReadyPrompt 订阅 editor.render.completed。
  非沉浸式 PC 页面弹出“是否查看导出结果”。
  沉浸式 VR presenting 时忽略事件，不弹窗。

components/pc_editor/effects
  Player V2 特效前端 adapter、输入状态机和预览基础层。
  fetchPcEditorEffectCatalog 从 /api/effects/catalog 获取后端定义的特效 catalog。
  PcEffectsPanelSimple 优先用后端 catalog 渲染特效分类和按钮，失败时回退本地 fallback。
  usePlayerV2EffectsWorkflow 优先使用后端 catalog payload 中的 eventName、durationMs、params 编译 EffectEventsPatch。
  effects/input 把 Tab -> 分类数字 -> 特效数字的快捷键状态机从 UI 组件中抽出。
  effects/input 会忽略 keydown repeat，避免按住 Tab 或数字键时弹窗闪烁。
  Space 不被 effects shortcut 吞掉，继续作为 player.playback.toggle 的全局快捷键。
  effects/preview 定义 EffectPreviewTarget：screen、viewport-mask、sphere、world-layer。
  当前 DOM fallback 已支持 viewport-mask 目标，黑场类效果不再默认全屏，而是先显示在 16:9 裁剪视窗区域。
  PcEffectPreview 仍是 DOM fallback，不是最终 VR preview runtime。
  /xr/player-v2 中 PcEffectPreview 已关闭 legacy DOM preview event，优先读取 runtime effectInput 和 PcEditorEventBus。
  legacy DOM preview event 只保留给旧页面或迁移期兼容路径。

apps/api/app/effects
  后端特效 catalog 的当前来源。
  GET /api/effects/catalog 返回 category、effectId、eventName、durationMs、params、render support、preview mode、UI key。
  前端不再把所有特效定义硬编码为唯一来源，本地 playerV2EffectCatalog 只作为迁移期 fallback。
```

已修复的重要运行时问题：

```text
Player V2 现在会等待 A-Frame runtime ready，
再注册 pc-crop-viewport-mask，
再渲染 A-Frame scene。

这样可以避免 <a-entity pc-crop-viewport-mask> 已经出现在 DOM，
但 A-Frame 组件没有初始化，导致遮罩移动和 timeline 采样无法可靠工作的情况。
```

仍未完成或尚未完整覆盖：

```text
VR ray target 已有通用 adapter，并已在 Player V2 immersive 3D UI 中接入播放器/播放列表类 target；后续特效、更多工作台 target 仍需继续补齐。
effects/preview 目前只有 DOM fallback 和 target 类型，尚未实现真正的 A-Frame/WebXR preview adapter。
active /xr/player-v2 已不再把 window effect preview event 作为主入口，但旧 preview fallback 仍未完全删除。
viewport-mask DOM preview 当前只是居中 16:9 近似框，尚未绑定真实球形遮罩挖孔的屏幕投影。
沉浸式 VR 中仍需要 XrMaskViewportPreviewAdapter，把黑场/白场/遮挡类效果放进 A-Frame scene。
discard / restore 流程尚未完整迁移和测试。
features/webxr/player-v2 仍需后续去重。
State Layer 后续可从 useState 聚合演进为 reducer 或更明确的 view model。
recordingActive、autoRenderEnabled 等状态当前仍主要在 Player V2 view model 中维护；如果后续被多个 3D UI 子组件持续访问，应迁入 runtimeStateStore。
旧 CommandBus、部分 window CustomEvent、部分 A-Frame 内部监听仍是兼容层，尚未全部收敛到 PcEditorEventBus + runtime state pool。
active /xr/player-v2 已关闭旧 CommandBus bridge、effect preview legacy DOM event、crop mask legacy window command。
本轮明确不处理 player-v3；player-v3 暂时只作为旧链路/迁移候选记录。
```

## 2.1 与目标架构的当前差距

目标架构可以拆成两个问题：

```text
发生了什么动作？
  统一进入 PcEditorEventBus，由 workflow 订阅和编排。

现在真实状态是什么？
  统一进入 runtimeStateStore，由真实数据源写入，UI / XR / workflow 读取快照或订阅变化。
```

当前结论：

```text
active /xr/player-v2 主链路：
  已经基本满足父子装配、兄弟不互相调用、事件总线 + 状态池的原则。
  粗略收敛度约 85% - 90%。

整个 apps/web/src/components/pc_editor 目录：
  仍处在迁移期，旧链路和新链路并存。
  粗略收敛度约 60% - 70%。
```

这里的“状态机”不要理解成一个全局大 FSM。当前更合理的分工是：

```text
runtimeStateStore
  保存可被多个模块持续读取的实时状态。
  例如播放时间、是否播放中、当前取景、crop mask、FOV、按键 pressed、XR session。

局部状态机
  只处理有明确阶段转换的输入流程。
  例如 effects/input 的 Tab -> 分类 -> 特效 -> holding -> release。

workflow
  订阅事件，并在需要时读取 runtime snapshot。
  它不应该把实时共享值私藏在某个兄弟组件里。
```

主事件中转器位置：

```text
components/pc_editor/events/eventBus.ts
  createPcEditorEventBus，定义 emit / subscribe。

components/pc_editor/events/PcEditorEventProvider.tsx
  提供 scoped PcEditorEventBus context。

components/pc_editor/composition/PcEditorEventRoot.tsx
  装配事件 Provider，并可选择是否桥接旧 CommandBus。

apps/web/src/components/pc_editor/Aframe/player-v2/PlayerV2.tsx
  active Player V2 入口。
  当前以 PcEditorEventRoot bridgeLegacyCommands={false} 包住主链路。
```

主状态池位置：

```text
components/pc_editor/state/runtimeStateStore.ts
  createPcEditorRuntimeStateStore / PcEditorRuntimeStateRoot。
  当前包含 playback、rates、sphereView、viewTarget、cropMask、maskViewportBounds、cameraPose、input、effectInput、xrSession。

active Player V2
  由 PcEditorRuntimeStateRoot 包住。
  A-Frame、workflow、UI 逐步通过 writer / selector 接入。
```

已经符合目标原则的部分：

```text
UI / Keyboard / Gesture -> Binding -> PcEditorEventBus -> Workflow 的主路径已经成立。
PcEditorCommandEventBridge 在 active Player V2 中已关闭，旧 CommandBus 不再是主入口。
播放状态 playback 已进入 runtime state，Player controls 优先读 runtime。
播放速度、录制速度、特效速度已收敛到事件总线 + runtime rates；PlayerV2 和 Player controls 不再各自保存 recordingRate / effectSpeed。
球面播放器 FOV 已进入 runtime sphereView；wheel 只发 editor.sphere.fov.step，由 workflow 写入状态池，A-Frame camera 作为 adapter 应用当前值。
当前取景 viewTarget、cropMask、maskViewportBounds 已进入 runtime state。
cameraPose 已由 A-Frame / timeline bridge 写入 runtime state。
keyboard / pointer / VR controller pressed 等 input 状态已开始进入 runtime state。
effectInput 已承载特效快捷键、hold、selected、preview target 等共享输入状态。
xrSession 已进入 runtime state，XrHud 优先读取状态池。
PcEffectPreview 在 active Player V2 中已关闭 legacy DOM preview event，优先读 effectInput 和事件总线。
crop mask legacy window command 在 active Player V2 中已关闭。
effect shortcut 在 active Player V2 中已不再通过 window CustomEvent relay；键盘由 useEffectShortcutBindings 处理，手柄/屏幕 UI 可通过 editor.effects.shortcut.* 语义事件进入同一状态机，并写 runtime effectInput。
timeline bridge 在 active Player V2 的 crop-mask 模式中已不再监听 webxr:crop-mask-change，改为订阅 runtime viewTarget。
crop mask bounds 在 active Player V2 中已不再监听或广播 window crop-mask/bounds event，改为 cropMask -> runtime maskViewportBounds。
timeline bridge 在 active Player V2 中已关闭 window 级 webxr:timeline-event，timeline 操作由 PcEditorEventBus -> workflow -> timelineBridge.dispatch 进入。
active Player V2 的 Simple UI 已关闭 legacyCommandFallback，不再回退发旧 PcEditorCommandBus。
SpatialNativePlayerBar 已移除 document.querySelector("#main-camera")，改为父组件传 cameraRef。
```

仍然没有完全符合目标原则的部分：

```text
旧 PcEditorCommandBus 仍存在：
  components/pc_editor/UI/PcEditorCommandBus.tsx
  components/pc_editor/3DUI/commands/EditorCommandBus.tsx
  这些已不再从 UI/index.ts 公共 barrel 导出，应继续标记为 legacy / migration-only，不再作为新功能入口。

window CustomEvent 仍存在：
  旧 video control event。
  旧 crop mask change / bounds / fov / center / lock / opacity event。
  旧 timeline semantic event。
  旧 effect preview event 已不再从 effects/index.ts、UI/index.ts 或 UI/PcEffectPreview.tsx 公共入口导出。
  active Player V2 已关闭其中一部分主入口，但旧页面、旧 player-v2/v3、兼容 adapter 仍会用到。

A-Frame 兼容层仍存在：
  A-Frame component 不能直接拿 React context，所以仍有 window event、singleton runtime store、adapter bridge。
  这是迁移期合理的边界，但长期应由 React 装配层把 scoped store / event bus 明确传入 adapter。

重复实现仍存在：
  PcWebXrEditor.tsx 是旧 PC Editor 页面。
  Aframe/player-v2/ui/editor/* 已删除，active v2 使用 UI/*Simple、playlist 和 effects/preview。
  Aframe/player-v3/* 仍有独立旧链路。
  features/webxr/player-v2 仍是过渡/重复实现。

局部直接 DOM 耦合仍存在：
  3DUI/native-player/SpatialNativePlayerBar.tsx 已移除 document.querySelector("#main-camera")。
  后续仍需检查 demo / legacy 3DUI 是否还有类似全局查询。

usePlayerV2State 仍保留迁移期 fallback：
  view 输出已优先读 runtime playback / viewTarget。
  但本地镜像状态还没有完全移除。
```

### 2.2 本轮扫描后的剩余直接路径

当前不处理 `player-v3`。只看 active `/xr/player-v2` 和 `components/pc_editor` 新架构，剩余路径应按下面优先级理解：

```text
可以保留的 adapter 边界调用：
  workflows/player/usePlayerPlaybackWorkflow.ts
    playerRef.current?.setPlaybackRate(...)
    这是 EventBus -> workflow -> player adapter 的业务出口，不是兄弟组件互调。

  Aframe/player-v2/PlayerV2.tsx
    timelineBridge.setRecordingRate(recordingRate)
    recordingRate 已来自 runtime rates；这里是父装配层把状态应用给 timeline adapter。

  Aframe/player-v2/PlayerV2.tsx
    cameraRef.current?.setAttribute("camera", fov)
    sphereView.fov 已来自 runtime state；这里是 XR runtime adapter 应用当前 FOV。

仍是兼容层、后续可逐步拆的旧路径：
  mask_controller/operations/maskOperations.ts
    仍通过 WEBXR_CROP_MASK_* window event 驱动旧 mask command。

  mask_controller/webxr/AFrameCropViewportMask.tsx
  mask_controller/webxr/AFrameCropViewportArcs.tsx
  mask_controller/webxr/AFrameCropViewportBoundsBroadcaster.tsx
    仍保留 window crop-mask change / bounds / fov / center / lock / opacity 兼容代码。
    active Player V2 已通过 legacyWindowCommands=false / legacyWindowEvents=false 关闭主入口。

  UI/PcEffectsPanel.tsx
    旧 PcWebXrEditor 使用的 legacy effects panel，仍走 dispatchWebXrTimelineEvent 和 DOM preview event。
    active Player V2 使用 PcEffectsPanelSimple，不走这里。

  controls/operations/timelineOperations.ts
    旧 controls 仍走 dispatchWebXrTimelineEvent，属于旧页面兼容路径。

输入 adapter 中合理存在的 window 监听：
  interactions/usePcViewportKeyboardMotion.ts
  effects/input/useEffectShortcutBindings.ts
    这些监听真实键盘输入，并写状态池或发 PcEditorEventBus。
    它们不是组件之间的私有通信；后续手柄和屏幕 UI 应继续走 editor.effects.shortcut.* 语义事件。
```

需要特别区分的合理例外：

```text
collapsed / open / hover / loading message / modal visible
  如果只属于一个 UI 组件，并且不是跨模块实时值，可以继续留在组件本地。

catalog / config / static effect definitions
  它们是配置或后端数据，不是 runtime state pool 的职责。

timeline sampler 内部缓存
  如果只是内部采样算法状态，可以保留在 sampler 内部。
  但当前视角、播放时间、按键按压、XR session 等共享实时值应进入状态池。
```

下一轮优先修复顺序：

```text
1. 低难度：继续收敛 active Player V2 内剩余 window CustomEvent 依赖。
   effect shortcut relay、timeline crop-mask listener、crop mask bounds window event、timeline semantic window event 已完成。
   旧 A-Frame player-v2/ui/editor 和 player-v2/webxr 已删除。
   下一步低风险项只剩旧 video control event 的 legacy 标记和 demo-only 全局监听梳理。

2. 中低难度：继续缩小 usePlayerV2State。
   playback、viewTarget、cropMask 这类实时共享值不再长期双写。

3. 中等难度：把 A-Frame 兼容层从 singleton 写入逐步改成 scoped adapter。
   React root 创建 store / bus，A-Frame adapter 只通过明确边界写入。

4. 中等难度：旧 CommandBus 只保留 legacy 标签。
   active Player V2 的 Simple UI 已关闭 legacyCommandFallback。
   UI/index.ts 已不再导出旧 PcEditorCommandBus；后续继续处理 3DUI CommandBus。

5. 高难度：清理旧 player-v2 和 features/webxr/player-v2 重复实现。
   避免新功能被误加到旧链路。
   player-v3 本轮不处理，只保持 legacy / migration candidate 标记。
```

## 3. 目标分层

目标依赖方向：

```text
UI click / Keyboard / VR ray / Gesture / XR runtime
  -> Interaction Layer
  -> Binding Layer
  -> Event Layer
  -> Workflow Layer
  -> State Layer
  -> Data Orchestration Layer
  -> Backend Bridge Layer
  -> Transport Layer
```

XR Runtime Layer 和 UI Layer 都可以成为事件来源，也可以根据 State Layer 更新显示。但它们不能互相直接调用。任何跨层或跨兄弟组件通信，都必须经过父组件编排、事件总线、绑定注册表或状态模型。

正式层名和职责：

| 层 | 目录 | 职责 |
| --- | --- | --- |
| Composition Layer | `composition/`, `Aframe/player-v2/PlayerV2.tsx` | 装配父子组件树、Provider、状态容器和模块开关。 |
| Interaction Layer | `interactions/` | 把屏幕点击、键盘、VR ray、手势转换成标准触发器。 |
| Binding Layer | `bindings/` | 把多个触发器映射到同一个语义事件，支持自由切换按钮和事件关系。 |
| Event Layer | `events/` | 定义 `PcEditorEventBus`、事件类型、事件命名空间和订阅规则。 |
| Workflow Layer | `workflows/` | 订阅事件，把事件编排成播放器、剪辑器、特效、运镜、导出等业务动作。 |
| UI Layer | `UI/` | 平面 UI。只触发事件和显示状态，不直接调后端或 A-Frame 内部对象。 |
| XR Runtime Layer | `Aframe/`, `mask_controller/` | A-Frame scene、video sphere、mask、controller、pose、WebXR session。 |
| Immersive VR Module | `Aframe/immersive_mode/` | Meta/Quest 沉浸式进入、session 生命周期、HTTPS/能力检查。 |
| State Layer | `state/` | 播放、mask、panel、workflow、XR session 等前端视图状态。 |
| Data Orchestration Layer | `data/` | session model、timeline bridge、队列、协议转换。 |
| Backend Bridge Layer | `backend/` | 封装 session/source/render/timeline 等后端语义接口。 |
| Transport Layer | `transport/`, `src/lib/api.ts` | 底层 fetch/API 发送，不包含 UI 或业务决策。 |

推荐目录结构：

```text
apps/web/src/components/pc_editor/
  PlayerV2.tsx
  composition/
  interactions/
  bindings/
  events/
  workflows/
    player/
    editor/
  state/
  UI/
    export_prompt/
  effects/
    input/
    preview/
  Aframe/
    runtime/
    media/
    immersive_mode/
    360video_player/
    player-v2/
  mask_controller/
  data/
    timeline-bridge/
  backend/
  transport/
```

## 4. 事件标准

事件命名使用层级结构：

```text
player.playback.toggle
player.playback.rate.set
player.recording.rate.set
player.playback.seek
player.source.select
editor.viewport.fov.step
editor.sphere.fov.step
editor.viewport.center.set
editor.mask.opacity.set
editor.timeline.cut
editor.timeline.flush
editor.effects.blur.add
editor.effects.color.add
editor.effects.select
editor.effects.hold.start
editor.effects.hold.end
editor.effects.preview.start
editor.effects.preview.end
editor.effects.speed.set
editor.effects.speed.reset
editor.effects.bgm.set
editor.render.request
editor.render.completed
ui.panel.effects.toggle
xr.session.enter
```

标准事件形态：

```typescript
type PcEditorEvent = {
  type: PcEditorEventName;
  payload?: unknown;
  source: {
    kind: "ui" | "keyboard" | "vr-ray" | "gesture" | "xr-runtime" | "workflow" | "system";
    id?: string;
    device?: "pc" | "quest" | "mobile";
  };
  meta: {
    id: string;
    at: number;
    phase?: "start" | "change" | "end";
    repeat?: boolean;
    traceId?: string;
  };
};
```

事件处理器只关心 `type` 和 payload。除日志、遥测或设备兼容判断外，业务逻辑不应该根据 `source.kind` 分叉。这样 UI 点击、键盘快捷键、VR 手柄都可以触发同一个事件，并进入同一套 workflow。

## 5. 如何给一个事件设置不同交互

Interaction、Binding、Event 必须分开：

```text
Interaction
  用户或设备做了什么。
  例：button click、KeyZ + wheel、VR ray select。

Binding
  这个触发器当前绑定到哪个语义事件。
  例：KeyZ + wheel -> player.playback.rate.set。

Event
  产品语义上发生了什么。
  例：editor.timeline.cut。
```

绑定形态：

```typescript
type PcEditorBinding = {
  id: string;
  trigger: {
    kind: "ui" | "keyboard" | "vr-ray" | "gesture" | "xr-runtime";
    target: string;
    action: string;
    modifiers?: {
      alt?: boolean;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
    };
  };
  event: {
    type: PcEditorEventName;
    payload?: unknown;
  };
  enabledWhen?: string;
  ignoreRepeat?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
};
```

同一个事件绑定 UI、键盘、VR 手柄的例子：

```typescript
export const defaultPcEditorBindings = [
  {
    id: "timeline.cut.ui",
    trigger: { kind: "ui", target: "cut-button", action: "click" },
    event: { type: "editor.timeline.cut" }
  },
  {
    id: "timeline.cut.vr",
    trigger: { kind: "vr-ray", target: "cut-target", action: "select" },
    event: { type: "editor.timeline.cut" }
  }
] satisfies PcEditorBinding[];
```

UI 点击接入方式：

```tsx
const emitBound = usePcEditorBindingEmitter("pc-workbench-panel");

<button
  onClick={() =>
    emitBound({
      trigger: { kind: "ui", target: "cut-button", action: "click" },
      fallbackCommand: { type: "timeline.cut" }
    })
  }
>
  Cut
</button>
```

键盘接入方式：

```typescript
useKeyboardEventBindings({
  bindings: playerV2KeyboardBindings,
  enabled: true
});
```

键盘 adapter 只负责把 keydown 变成 trigger，然后从 Binding Layer 找到事件。它不能直接调用 workflow、播放器 handle 或后端 API。

VR 手柄接入方式：

```tsx
const cutTargetRef = useRef<HTMLElement | null>(null);

useVrRayEventBinding({
  targetId: "cut-target",
  targetRef: cutTargetRef,
  action: "select"
});

return createElement("a-entity", {
  ref: cutTargetRef,
  "data-pc-ray-target": "cut-target"
});
```

VR ray adapter 只发 `vr-ray` trigger。它不直接打开 UI，不直接裁剪，不直接调用后端。

## 6. 如何新增事件

新增事件步骤：

```text
1. 选择清晰的层级命名。
2. 在 Event Layer 添加事件名。
3. 定义 payload 形态。
4. 在 Binding Layer 添加一个或多个触发器。
5. 在 Workflow Layer 添加唯一业务处理入口。
6. 如需显示反馈，更新 State Layer，再由 UI 或 XR Runtime 显示。
7. 如需后端交互，只能走 Data -> Backend Bridge -> Transport。
```

示例：新增 `editor.viewport.center.reset`

事件类型：

```typescript
export type PcEditorEventName =
  | "editor.viewport.center.reset"
  | ExistingEvents;
```

绑定：

```typescript
{
  id: "viewport.center.reset.keyboard",
  trigger: { kind: "keyboard", target: "KeyR", action: "keydown", modifiers: { alt: true } },
  event: { type: "editor.viewport.center.reset" },
  ignoreRepeat: true,
  preventDefault: true
}
```

workflow：

```typescript
usePcEditorEventSubscription("editor.viewport.center.reset", () => {
  setMaskCenter({ yaw: 0, pitch: 0 });
});
```

注意：新增事件时不要把业务逻辑写进按钮、键盘 hook、VR target 或 A-Frame component。

## 7. 如何新增按钮

新增按钮只应该表达“我触发了什么 trigger”：

```text
1. 在某个 UI 父组件下添加按钮或按钮子组件。
2. 使用 usePcEditorBindingEmitter 或 usePcEditorUiEventEmitter。
3. trigger.target 使用稳定名称，例如 viewport-yaw-right。
4. payload 可以由 UI 提供，例如 opacity、timeMs、enabled。
5. 按钮不 import workflow。
6. 按钮不 import A-Frame player handle。
7. 按钮不 import backend 或 transport。
```

如果只是换按钮绑定的事件，改 `defaultPcEditorBindings`，不改按钮内部逻辑。

## 8. 如何新增键盘快捷键

新增快捷键步骤：

```text
1. 确认快捷键不会和浏览器、输入框、A-Frame 内部热键冲突。
2. 在 playerV2KeyboardBindings 或 defaultPcEditorBindings 中添加 keyboard trigger。
3. 指向已有事件，或先新增事件。
4. 如果按住连续触发合理，允许 repeat；如果只允许触发一次，设置 ignoreRepeat。
5. 不在 keyboard hook 中直接写业务动作。
```

当前 Player V2 已启用的典型快捷键：

```text
Space -> player.playback.toggle
F -> editor.timeline.flush
Q/E -> editor.viewport.fov.step
W/A/S/D -> editor.viewport.center.step
P -> player.playlist.toggle
Z + wheel -> player playback speed
X + wheel -> recording speed
C + wheel -> effect speed
H + wheel -> mask opacity
```

同一事件可以有多种触发方式。以播放/暂停为例，事件语义只声明一次：

```text
player.playback.toggle
```

当前或目标触发方式包括：

```text
keyboard Space
  -> trigger { kind: "keyboard", target: "Space", action: "keydown" }
  -> player.playback.toggle

flat UI 播放按钮
  -> trigger { kind: "ui", target: "player-play-toggle", action: "click" }
  -> player.playback.toggle

3D UI 播放按钮
  -> trigger { kind: "vr-ray", target: "spatial-player-play-toggle", action: "select" }
  -> player.playback.toggle

Quest 左右手 trigger 同时按下
  -> trigger { kind: "xr-runtime", target: "dual-trigger", action: "press" }
  -> player.playback.toggle
```

新增交互方式时，应优先新增 trigger 绑定，而不是在按钮、手柄监听或 3D UI 组件里直接调用播放器。

特效快捷键不直接放在普通 `playerV2KeyboardBindings` 中，因为它需要多阶段状态机：

```text
Tab -> 打开特效分类
1..6 -> 选择分类
1..6 keydown -> 选择或开始 hold effect
same key keyup -> 结束 hold effect
Escape -> 关闭特效快捷菜单
Space -> 不被特效状态机吞掉，继续交给 player.playback.toggle
```

当前实现位置：

```text
components/pc_editor/effects/input/effectShortcutStateMachine.ts
components/pc_editor/effects/input/useEffectShortcutBindings.ts
```

这个状态机会忽略 `event.repeat`，避免按住 Tab 或数字键时重复切换和弹窗闪烁。分类数字只选择分类，最终特效数字的按住时长才决定 hold effect 时长。

`R` 当前需要谨慎使用，因为旧 A-Frame crop mask 内部曾使用 `R` 做 reset。新增涉及 `R` 的绑定时，要先确认不会重复触发。

## 9. 如何新增 VR ray target

新增 VR ray target 步骤：

```text
1. 在 XR Runtime Layer 创建可命中的 A-Frame entity。
2. 给 target 一个稳定 targetId，例如 cut-target、effect-blur-target。
3. 用 useVrRayEventBinding 把 A-Frame click/select 接入 Binding Layer。
4. 在 defaultPcEditorBindings 中配置 vr-ray trigger。
5. Workflow 处理最终事件。
```

3D UI 接入时也遵守同一规则。3D UI 子组件可以发出 `Spatial3DUiAction`，但 Player V2 接入层必须把它转换成 trigger，再走 `defaultPcEditorBindings`：

```text
AFrameSpatial3DUi
  -> onAction({ type: "player.playPause.toggle" })
  -> PlayerV2Spatial3DUiLayer
  -> trigger { kind: "vr-ray", target: "spatial-player-play-toggle", action: "select" }
  -> defaultPcEditorBindings
  -> PcEditorEventBus: player.playback.toggle
  -> usePlayerPlaybackWorkflow
  -> playerRef.togglePlay()
```

示例：

```typescript
{
  id: "effect.blur.vr",
  trigger: { kind: "vr-ray", target: "effect-blur-target", action: "select" },
  event: {
    type: "editor.effects.select",
    payload: {
      categoryId: "blur",
      effectId: "soft-blur",
      label: "Soft blur"
    }
  }
}
```

边界规则：

```text
A-Frame target 可以发 trigger。
A-Frame target 不可以直接操作 UI。
A-Frame target 不可以直接写 timeline。
A-Frame target 不可以直接调用后端 API。
```

Player V2 当前已接入的 3D UI target 命名约定：

```text
spatial-player-play-toggle
spatial-player-previous
spatial-player-next
spatial-player-record-start
spatial-player-record-end
spatial-playlist-toggle
spatial-playlist-close
spatial-playlist-source-select
```

组合手柄输入属于 `xr-runtime` trigger，不属于具体 ray target：

```text
dual-trigger
```

## 10. 如何新增特效

特效跨 UI、事件、WebXR 预览、后端编排和最终导出，详细问题分析见：

```text
docs/project-docs/00-overview/pc-editor-webxr-effects-problem-analysis.md
```

特效有三条链路必须同时考虑：

```text
1. 交互可触发
   UI tile / keyboard / VR target 都能绑定到同一个 editor.effects.* 事件。

2. 后端可编排
   Workflow 必须把前端事件转换成 EffectEventsPatch。

3. 渲染层可见
   选择特效后，UI 或 XR Runtime 应该显示即时预览或状态反馈。
```

当前已有后端编排路径：

```text
PcEffectsPanelSimple
  -> editor.effects.select
  -> usePlayerV2EffectsWorkflow
  -> 优先读取后端 catalog payload 中的 eventName / durationMs / params
  -> timelineBridge.dispatch({ type: "createEffectEvent" })
  -> EffectEventQueue
  -> EffectEventsPatch
  -> timelineBackendBridge
  -> timelineTransport
  -> /api/cut-sessions/:sessionId/effect-events
```

后端 catalog 路径：

```text
apps/api/app/effects/catalog.py
  -> GET /api/effects/catalog
  -> apps/web/src/components/pc_editor/effects/effectCatalogClient.ts
  -> usePcEditorEffectCatalog
  -> PcEffectsPanelSimple
```

迁移期 fallback：

```text
apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts
```

fallback 只用于接口不可用或旧 payload 兼容，不应该继续作为长期主定义来源。

新增一个普通特效的步骤：

```text
1. 优先在后端 catalog 中添加 effect definition。
2. 为 effect 定义稳定 effectId、eventName、durationMs、defaultParams。
3. 定义 render.stage、backendSupport、fallback、conflictGroup。
4. 定义 preview.mode 和 preview target 语义。
5. 前端通过 /api/effects/catalog 自动得到分类、按钮、事件 payload。
6. Workflow 保持统一处理 editor.effects.select。
7. 如果是按住型连续输入，使用 editor.effects.hold.start / editor.effects.hold.end。
8. 如果需要新的特效家族，再新增 editor.effects.<family>.<action> 或扩展 catalog operation。
```

示例：新增 `soft-blur`

UI 配置：

```typescript
{
  id: "blur",
  key: "7",
  label: "Blur",
  effects: [
    { id: "soft-blur", key: "1", label: "Soft blur" }
  ]
}
```

后端编排映射：

```typescript
effect(
  category_id="filter",
  duration_ms=900,
  effect_id="soft-blur",
  event_name="filter.blur",
  family="filter",
  key="1",
  label="Soft blur",
  params={ "strength": 0.35 }
)
```

最终发送给后端的语义会进入：

```text
EffectEventsPatch.events[].eventName = "filter.blur"
EffectEventsPatch.events[].params = { strength: 0.35, category: "blur", effectId: "soft-blur" }
```

让特效在渲染层可见有两种推荐方式：

```text
DOM fallback 预览
  当前由 effects/preview/domPreviewEvents.ts 和 PcEffectPreview 提供。
  支持 screen 和 viewport-mask 两种 target。
  viewport-mask 目前是 16:9 裁剪视窗近似框，适合 PC 页面过渡验证。

XR Runtime 预览
  适合 mask、viewport、3D gizmo、VR 控件、空间标记。
  需要 XrMaskViewportPreviewAdapter 或 XrWorldLayerPreviewAdapter。
  由 State Layer 输入状态，A-Frame 组件根据 props 更新。
```

推荐预览目标：

```text
screen
  普通 DOM 提示和非沉浸式 UI fallback。

viewport-mask
  黑场、白场、blur、vignette 等最终作用在裁剪视窗上的效果。

sphere
  贴在 360 球面上的热点、传送门入口、球面标记。

world-layer
  VR 世界空间、手柄附近或相机前方的 3D 图层。
```

当前 preview 基础类型：

```text
components/pc_editor/effects/preview/types.ts
  EffectPreviewTarget = screen | viewport-mask | sphere | world-layer
```

按住型黑场当前路径：

```text
Tab -> category key -> hold effect key
  -> editor.effects.hold.start
  -> PcEffectPreview 显示 viewport-mask DOM fallback

release same key
  -> editor.effects.hold.end
  -> usePlayerV2EffectsWorkflow
  -> createEffectEvent transition.fade_black
```

如果 hold 期间视频时间几乎没有前进，Workflow 会额外写入：

```text
timelineBridge.dispatch({ type: "createViewPathRange" })
  startState = hold.start 时的视角
  endState = hold.end 时的视角
  interpolation = fast
```

这样可以表达“暂停中黑场遮挡，同时切视角”的导出语义。

特效不要这样做：

```text
不要在 effect tile onClick 里 fetch。
不要在 effect tile onClick 里直接调用 timelineBridge。
不要在 A-Frame entity 里直接发 EffectEventsPatch。
不要让后端 EffectEventName 泄漏成每个按钮各写一套业务逻辑。
```

## 11. 播放器域事件

播放器事件以 `player.*` 开头，负责视频播放、源切换、播放列表和速率：

```text
player.playback.play
player.playback.pause
player.playback.toggle
player.playback.seek
player.playback.rate.set
player.playback.rate.reset

player.source.select
player.source.next
player.source.previous
player.source.reload

player.playlist.open
player.playlist.close
player.playlist.toggle
```

播放器事件不直接表达剪辑语义。例如 Start crop 需要自动播放时，应由 workflow 订阅 `editor.crop.start`，再发出 `player.playback.play`。

播放器事件的扩展原则：

```text
事件表达“发生了什么语义动作”。
trigger 表达“用户通过什么方式触发了它”。
workflow 是唯一执行播放器业务动作的位置。
```

例如 `player.playback.toggle` 可以来自键盘、平面 UI、3D UI 或双手 trigger 组合；这些入口都不应该直接调用 `playerRef.togglePlay()`，而应该进入同一个 `player.playback.toggle` 事件，由 `usePlayerPlaybackWorkflow` 执行。

## 12. 剪辑器域事件

剪辑器事件以 `editor.*` 开头，负责 viewport、mask、timeline、effects、render、discard/restore。

视角与遮罩：

```text
editor.viewport.fov.set
editor.viewport.fov.step
editor.viewport.center.set
editor.viewport.center.step
editor.viewport.lock.set

editor.mask.opacity.set
editor.mask.visible.set
```

时间线：

```text
editor.timeline.cut
editor.timeline.flush
editor.timeline.sampling.pause
editor.timeline.sampling.resume
editor.timeline.discard.begin
editor.timeline.discard.end
editor.timeline.restore.range
```

特效与音频：

```text
editor.effects.blur.add
editor.effects.color.add
editor.effects.transition.add
editor.effects.params.set
editor.effects.select
editor.effects.hold.start
editor.effects.hold.end
editor.effects.preview.start
editor.effects.preview.end
editor.effects.category.toggle

editor.effects.bgm.set
editor.effects.bgm.clear
```

渲染导出：

```text
editor.render.request
editor.render.completed
editor.render.cancel
editor.render.auto.set
```

UI 状态：

```text
ui.panel.effects.toggle
ui.panel.effects.collapse.set
ui.panel.workbench.toggle
ui.panel.workbench.collapse.set
ui.overlay.close
```

XR session：

```text
xr.session.enter
xr.session.exit
xr.session.started
xr.session.ended
```

## 13. A-Frame 与 Immersive VR 边界

XR Runtime Layer 负责：

```text
创建和销毁 A-Frame scene。
管理 HTMLVideoElement、videosphere、mask entity、controller entity。
读取 head pose、controller ray、camera direction。
把 runtime 观察转换成事件。
根据 State Layer 输入更新 mask、FOV、opacity、视频源和播放表现。
```

XR Runtime Layer 不负责：

```text
选择业务 video session。
决定是否提交 ViewPathPatch。
决定是否添加特效。
决定是否打开 UI 面板。
直接调用 render API。
```

Immersive VR Module 是 XR Runtime 的专用子模块，负责：

```text
Meta/Quest session 请求。
HTTPS 和浏览器能力检查。
presenting/requesting/idle session 状态。
进入 VR 前后的播放恢复和清理。
```

Player V2 的沉浸式 UI 切换规则：

```text
runtimeStateStore.xrSession.presenting === true
  -> 渲染 PlayerV2Spatial3DUiLayer / AFrameSpatial3DUi
  -> 关闭 DOM 平面 uiOverlay

runtimeStateStore.xrSession.presenting !== true
  -> 不渲染 3D UI
  -> 保持 XrHud、PcPlayerControlsSimple、PcPlaylistPanel、PcWorkbenchPanelSimple、PcEffectsPanelSimple 等平面 UI
```

3D UI 必须挂在 A-Frame scene 子树中，而不是 DOM overlay 中：

```text
AFrame360VideoPlayer
  -> AFrameCropViewportRig
  -> AFrameViewportMaskEffectPreview
  -> PlayerV2Spatial3DUiLayer
```

`PlayerV2Spatial3DUiLayer` 是接入层，不是业务层。它可以：

```text
读取 runtime state pool。
把 Spatial3DUiAction 转换为 trigger。
通过 defaultPcEditorBindings 解析成 PcEditorEventBus 事件。
```

它不可以：

```text
直接调用 playerRef。
直接调用 backend / transport。
直接写 timeline patch。
让 3D UI 子组件知道 Player V2 workflow 内部实现。
```

导出完成弹窗的规则：

```text
普通 PC 页面：
  editor.render.completed -> PcExportReadyPrompt -> 弹窗询问是否查看。

沉浸式 VR presenting：
  PcExportReadyPrompt 忽略事件。
  不弹窗，不补弹，不打断 VR session。
```

## 14. 数据与后端边界

前端只提交剪辑意图，不生成最终 MP4。

稳定协议包括：

```text
ViewPathPatch
ViewPathPoint
EffectEventsPatch
PlaybackClientState
ClipEditConfig
```

正确路径：

```text
UI / XR / Keyboard
  -> Binding
  -> Event
  -> Workflow
  -> Data Orchestration
  -> Backend Bridge
  -> Transport
```

禁止把网络发送写进：

```text
UI 组件
Interaction adapter
Binding registry
A-Frame scene 组件
普通按钮 onClick
```

## 15. 迁移路线

阶段 1：确认主归属。

```text
apps/web/src/components/pc_editor 是 PC Editor 长期主目录。
/xr/player-v2 是新架构验证入口。
/xr/player 继续作为旧页面参考和回退面。
```

阶段 2：保留旧 CommandBus 作为兼容层。

```text
短期保留 PcEditorCommandBus。
PcEditorCommandEventBridge 把旧命令转发成 typed event。
不要一次性删除旧命令。
```

阶段 3：事件命名层级化。

```text
player.playback.toggle
editor.viewport.fov.step
editor.timeline.cut
editor.effects.select
editor.render.request
```

阶段 4：抽出 Binding Layer。

```text
按钮点击、键盘快捷键、VR ray select 都先进入 Binding Layer。
Binding Layer 决定当前触发哪个标准事件。
```

阶段 5：抽出 Workflow Layer。

```text
播放 workflow 处理 play/pause/seek/source/playlist。
剪辑 workflow 处理 viewport/mask/timeline/render。
特效 workflow 处理 EffectEventsPatch 和预览状态。
```

阶段 6：特效输入和预览拆层。

```text
effects/input 处理 Tab -> 分类 -> 特效 -> hold/release 状态机。
effects/preview 定义 screen / viewport-mask / sphere / world-layer 预览目标。
PcEffectPreview 只作为 DOM fallback，不再作为最终预览架构。
```

阶段 7：实现 XR Runtime preview adapter。

```text
DomMaskViewportPreviewAdapter 绑定真实 mask/crop viewport 的屏幕投影。
XrMaskViewportPreviewAdapter 在 A-Frame scene 内显示黑场、白场、遮挡类预览。
XrWorldLayerPreviewAdapter 支持传送门、文本、3D 图层类效果。
```

阶段 8：去重旧 v2 目录。

```text
保留 components/pc_editor 下的产品实现。
features/webxr/player-v2 标记为过渡实现，后续删除或合并。
```

## 16. 验收场景

新增 UI 按钮：

```text
只需要新增按钮组件和绑定配置。
不修改播放器、A-Frame runtime 或兄弟 UI。
```

同一事件多端触发：

```text
editor.timeline.cut 可以由按钮和 VR ray select 触发。
键盘 C 已释放给 effect speed wheel modifier。
多种触发方式进入同一个 workflow。
```

新增特效分类：

```text
优先扩展后端 /api/effects/catalog。
前端 Effects Panel 从 catalog 自动获得按钮、分类和 event payload。
playerV2EffectCatalog 只作为迁移期 fallback。
必要时新增 editor.effects.* 事件。
必要时新增 effects/preview adapter 或 XR runtime preview entity。
不改播放层。
```

按住型黑场：

```text
Tab -> 1 -> 按住 1
  -> editor.effects.hold.start
  -> viewport-mask DOM fallback 预览

松开 1
  -> editor.effects.hold.end
  -> EffectEventsPatch transition.fade_black

如果中途暂停并切视角：
  -> createViewPathRange 写入 startState/endState
  -> 黑场和快速视角变化使用同一时间范围组合表达
```

特效快捷键手感：

```text
按住 Tab 不闪烁。
分类数字 keydown 只选分类。
最终特效数字 keydown/keyup 决定 hold 时长。
Space 不被特效状态机吞掉，仍然暂停/播放。
```

A-Frame controller 命中：

```text
只发 interaction trigger 或 xr runtime event。
不直接调用 UI 组件。
不直接调用后端 API。
```

网络发送边界：

```text
网络发送只出现在 Backend Bridge 或 Transport。
UI、Interaction、Binding、A-Frame 组件中不出现 fetch/API 发送。
```

完整剪辑流程：

```text
Start crop
移动视角
End crop
ViewPathPatch accepted
Auto render
Export ready
Export prompt
Mobile export detail page ready
```

## 17. 结论

`/xr/player-v2` 的方向不是继续做一个更大的单体组件，而是做一个可装配的 PC Editor 前端系统。组件树负责结构，Interaction 负责输入，Binding 负责映射，Event 负责语义，Workflow 负责业务，State 负责显示状态，Data 和 Backend Bridge 负责协议，Transport 负责发送。

这样新增几十个特效事件、多种设备输入方式、多个 UI 按钮或 VR 控件时，都可以横向扩展，而不是把逻辑继续塞回 `PlayerV2` 或旧的 `PcWebXrEditor`。
