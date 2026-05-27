# PC Editor 2D UI 到 3D UI 功能等价迁移方案

## 1. 目标

这份文档用于规划 PC Editor 在 immersive VR 模式下，把现有 2D UI 的按钮、滑块、弹窗、点击和按住类交互迁移到 3D UI 的路线。

目标不是把 DOM 组件直接搬进 WebXR，而是让 3D UI 承担同一套业务语义：

```text
键盘 / 平面 UI / 3D UI / 手柄组合输入
  -> interaction trigger
  -> binding / adapter
  -> PcEditorEventBus
  -> workflow
  -> runtimeStateStore / backend bridge / A-Frame runtime
```

3D UI 的视觉组件只能表达“用户点了哪个空间控件、拖了哪个空间滑块、选中了哪个圆环项”。它不能直接调用播放器、timeline、backend、render API，也不能让兄弟组件互相 import 或互相读取内部状态。

## 2. 当前结论

当前 3D UI 已经适合继续迁移，但还不是 2D UI 的完整替代。

已经比较稳定的部分：

```text
播放器条视觉
  HybridSkinPlayerBar 已经基本满足当前视觉要求。

播放列表视觉
  SpatialPlaylistPopup 已经可作为 3D 弹窗基线，后端 source 切换可以复用 2D 的 player.source.select 语义。

3D UI 接入层
  AFrameSpatial3DUi / PlayerV2Spatial3DUiLayer 已经建立了 action -> event bus 的路径。

手柄/射线基础
  shared/SpatialUiInteraction 已经有 hover / pressed / click 的最小工具。

圆环菜单原型
  SpatialHoldRingMenuDemo 已验证 B 键按住、悬停、旋转、展开多级圆环的视觉和基本动作。
```

还没达到功能等价的部分：

```text
播放器 progress 还不是完整 3D slider。
播放列表 source select 视觉已有，但正式后端切换需要纳入事件映射和状态反馈。
Workbench 桌面 UI 目前主要是视觉桌面，还缺逐区域 hit target、状态、事件绑定。
Effects 仍是 demo ring menu，没有接后端 catalog，也没有把 hold/select 事件完整数据化。
Mask opacity 仍依赖 2D range input，3D 需要通用 slider primitive。
Export detail / download / render 完成提示在 VR 内还没有完整 3D 呈现策略。
所有 3D 控件还需要统一 disabled / active / pending / drag / cancel 状态。
```

## 3. 迁移边界

必须遵守的边界：

```text
视觉组件
  只负责 skin、文字、图标、布局和本地 hover/pressed 反馈。

交互组件
  只负责 hit plane、ray blocking、drag、hover、press、release、select。

接入层
  把 Spatial3DUiAction 或 targetId 转成 trigger / PcEditorEvent。

业务 workflow
  唯一执行播放器、剪辑、特效、渲染、后端通信的位置。

runtimeStateStore
  保存多个组件需要持续读取的实时状态。
```

不允许：

```text
不允许 3D button onClick 里直接 playerRef.play()。
不允许 3D effect tile 里直接写 timeline patch。
不允许 3D playlist item 里直接 fetch backend。
不允许 workbench 子组件 import playlist / ring menu 等兄弟内部实现。
不允许把 FOV、播放时间、mask opacity、controller pressed 这类实时值藏在某个 UI 私有 state 里给别人读。
```

## 4. 目标组件结构

3D UI 后续应该按父子嵌套组合，而不是平铺互相引用：

```text
3DUI/
  player-v3/
    AFrameSpatial3DUi
    PlayerV3SpatialUi

  shared/
    SpatialUiRoot
    SpatialControlRegistry
    SpatialButtonTarget
    SpatialSliderTarget
    SpatialRayBlocker
    SpatialPanelFrame
    SpatialTextSlot
    SpatialControlState

  hybrid-player/
    HybridSkinPlayerBar
    SpatialPlayerProgressSlider

  playlist-popup/
    SpatialPlaylistPopup
    SpatialPlaylistItemTarget

  arwes-workbench-spatial/
    ArwesWorkbenchSpatialTable
    ArwesWorkbenchRegionTarget
    SpatialWorkbenchControls

  ring-menu/
    SpatialRingMenu
    SpatialRingLevel
    SpatialRingArcTarget

  effects-popup/
    SpatialEffectsPopup
    SpatialEffectsRingMenuAdapter
```

父组件负责装配：

```text
AFrameSpatial3DUi
  -> PlayerV3SpatialUi
    -> HybridSkinPlayerBar
    -> SpatialPlaylistPopup
    -> ArwesWorkbenchSpatialTable
    -> SpatialEffectsPopup
      -> SpatialRingMenu
```

通信方式：

```text
父 -> 子
  props 传 model snapshot、layout config、enabled、selectedId。

子 -> 父
  emit Spatial3DUiAction 或 SpatialControlTrigger。

跨组件实时状态
  runtimeStateStore 读取，不通过兄弟组件互相调用。

业务事件
  接入层统一进入 PcEditorEventBus。
```

## 5. 通用交互层设计

后续所有 3D 按钮、列表项、圆环项、滑块都应进入统一交互层。

建议抽象：

```ts
type SpatialControlTarget = {
  targetId: string;
  role: "button" | "slider" | "toggle" | "menuitem" | "ray-blocker";
  action: string;
  disabled?: boolean;
  active?: boolean;
  payload?: unknown;
};
```

按钮事件：

```text
ray enter
  -> visual state hover

trigger down / mousedown
  -> visual state pressed

trigger up / click
  -> emit trigger { kind: "vr-ray", target, action: "select" }

ray leave / cancel
  -> visual state idle
```

滑块事件：

```text
ray enter
  -> hover

trigger down
  -> drag start

drag move
  -> local hit x/y 转 normalized value
  -> 更新 draft visual value
  -> 可节流发 change 事件

trigger up
  -> drag end
  -> emit final event

cancel
  -> 丢弃 draft 或回到 runtime snapshot
```

射线阻挡：

```text
每个弹窗、播放器条、桌面面板都需要透明 blocker。
button hit plane 在 blocker 前方。
非按钮区域命中 blocker 时 stopPropagation。
这样手柄射线不会穿过 UI 打到后面的 360 视频或其他空间对象。
```

## 6. 2D UI 与 3D UI 差距清单

### 6.1 播放器控制

来源：`PcPlayerControlsSimple`

| 2D 控件 | 2D target | 目标 3D 控件 | 3D target | 事件 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 播放/暂停 | `player-play-toggle` | 播放器主按钮 | `spatial-player-play-toggle` | `player.playback.toggle` | 已接入 |
| 上一个视频 | `player-previous` | 播放器 previous | `spatial-player-previous` | `player.source.previous` | 已接入，需设备验证 |
| 下一个视频 | `player-next` | 播放器 next | `spatial-player-next` | `player.source.next` | 已接入，需设备验证 |
| 开始录制 | `player-record-start` | 播放器 record | `spatial-player-record-start` | `editor.crop.start` | 已接入 |
| 结束录制 | `player-record-end` | 播放器 record | `spatial-player-record-end` | `editor.crop.end` | 已接入 |
| 播放进度 | `player-progress` | 3D progress slider | `spatial-player-progress` | `player.playback.seek` | 待实现 |
| 播放速率重置 | 无 binding target，直接 UI event | 速率按钮 | `spatial-player-playback-rate-reset` | `player.playback.rate.reset` | 待补 target |
| 录制速率重置 | 无 binding target，直接 UI event | 速率按钮 | `spatial-player-recording-rate-reset` | `player.recording.rate.reset` | 待补 target |
| 播放列表开关 | `playlist-toggle` | 播放器列表按钮 | `spatial-playlist-toggle` | `player.playlist.toggle` | 已接入 |
| 关闭 overlay | 无 binding target，直接 UI event | 设置/关闭按钮 | `spatial-overlay-close` | `ui.overlay.close` | 待明确是否 VR 需要 |

播放器迁移结论：

```text
播放器视觉已经可以保留。
下一步重点是把 progress 升级成 SpatialSliderTarget。
速率按钮需要正式 targetId，不能继续只靠 ad hoc action。
```

### 6.2 播放列表

来源：`PcPlaylistPanel`

| 2D 控件 | 2D target | 目标 3D 控件 | 3D target | 事件 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 关闭列表 | `playlist-close` | 弹窗关闭按钮 | `spatial-playlist-close` | `player.playlist.close` | 已接入 |
| 选择视频源 | `playlist-source-select` | 3D source item | `spatial-playlist-source-select` | `player.source.select { sourceId }` | 视觉可用，后端切换待正式验收 |

播放列表迁移结论：

```text
3D 弹窗样式当前可继续使用。
source 切换不应该在 SpatialPlaylistPopup 内直接调用后端。
点击 item 后只发 sourceId，由 PlayerV2Spatial3DUiLayer 转成 player.source.select。
source switching / loading / error 状态从 runtime 或父 model 传回弹窗。
```

### 6.3 特效面板

来源：`PcEffectsPanelSimple`

2D 当前能力：

```text
后端 catalog / fallback catalog
分类展开/折叠
点击选择 effect
按住型 effect start/end
Tab + 数字快捷键状态机
previewTarget / previewMode / renderStage / conflictGroup 等 payload
```

3D 目标：

```text
弹窗负责显示当前特效上下文、分类标题、提示和结果。
圆环菜单负责分类和 effect 的空间选择。
catalog 是唯一数据来源，不能继续写死 demo LEVELS。
hold 型 effect 用 B hold / trigger hold / ring dwell 映射到 editor.effects.hold.start/end。
普通选择映射到 editor.effects.select。
```

| 2D 功能 | 目标 3D 表现 | 事件 | 当前状态 |
| --- | --- | --- | --- |
| 打开特效面板 | Workbench 的 EFFECT 按钮打开弹窗 | `ui.panel.effects.toggle` 或 `ui.panel.effects.collapse.set` | 待实现 |
| 分类选择 | 一级圆环 4-6 段 | `ui.panel.effects.category.toggle` 或本地选中态 | demo 已有，待 catalog 化 |
| effect 选择 | 二级/三级圆环 | `editor.effects.select` | 待实现 |
| hold effect 开始 | 悬停/按住最终 effect | `editor.effects.hold.start` | 待实现 |
| hold effect 结束 | 松开 trigger / B | `editor.effects.hold.end` | 待实现 |
| preview 状态 | A-Frame preview adapter | 读 `effectInput` runtime | 待实现 |

特效迁移结论：

```text
不要把 PcEffectsPanelSimple 直接搬成 3D DOM。
应该把 catalog 转换成 SpatialRingMenuModel。
SpatialRingMenu 只关心 level/items/selected/hover/hold。
SpatialEffectsPopup 负责承载背景、标题、说明、当前选择和错误/禁用状态。
最终 event payload 必须保留 2D 已经使用的 catalog 字段。
```

### 6.4 Workbench / 常规剪辑选项

来源：`PcWorkbenchPanelSimple`

3D 目标是使用当前 “桌子一样的 UI” 作为剪辑选项按钮地点。`ArwesWorkbenchSpatialLayout` 已经有区域定义，但当前 `ArwesWorkbenchSpatialTable` 还主要是整体视觉和大 hit plane，缺少逐区域 target。

建议映射：

| 3D region | 目标 target | 事件 | 状态 |
| --- | --- | --- | --- |
| `CUT` | `spatial-workbench-cut` | `editor.timeline.cut` | 待接 |
| `LOCK` | `spatial-workbench-lock-toggle` | `editor.viewport.lock.set { locked }` | 待接 |
| `PLAY` | `spatial-workbench-play-toggle` | `player.playback.toggle` | 待接 |
| `START` | `spatial-workbench-crop-start` | `editor.crop.start` | 待接 |
| `END` | `spatial-workbench-crop-end` | `editor.crop.end` | 待接 |
| `RENDER` | `spatial-workbench-render-request` | `editor.render.request` | 待接 |
| `YAW_LEFT` | `spatial-workbench-yaw-left` | `editor.viewport.center.step { yawDelta: -5 }` | 待接 |
| `YAW_RIGHT` | `spatial-workbench-yaw-right` | `editor.viewport.center.step { yawDelta: 5 }` | 待接 |
| `PITCH_UP` | `spatial-workbench-pitch-up` | `editor.viewport.center.step { pitchDelta: 5 }` | 待接 |
| `PITCH_DOWN` | `spatial-workbench-pitch-down` | `editor.viewport.center.step { pitchDelta: -5 }` | 待接 |
| `EFFECT` | `spatial-workbench-effects-toggle` | 打开 SpatialEffectsPopup | 待接 |
| `EXPORT` | `spatial-workbench-export-open` | 打开 VR export/result panel | 待设计 |
| `DROP` / `MORE_DROP` | `spatial-workbench-discard-*` | `editor.timeline.discard.*` | 待设计 |
| `UNDO` / `MORE_RESTORE` | `spatial-workbench-restore-*` | `editor.timeline.restore.range` | 待设计 |
| `SAVE` / `MORE_SAVE` | `spatial-workbench-save-*` | 暂不直接接业务 | 待明确 |

Workbench 迁移结论：

```text
先把 arwesWorkbenchRegions 变成数据驱动 target registry。
每个 region 生成自己的 transparent hit plane。
region 的 active / disabled / pressed 状态进入 control canvas 重绘。
尚无 workflow 的按钮先 disabled 或仅作为 visual placeholder，避免误导。
```

### 6.5 Mask 与视角控制

2D 当前能力：

```text
FOV +/- 
Yaw +/- 
Pitch +/- 
Lock toggle
Mask opacity slider
Clear / Deepen opacity
实时显示 yaw / pitch / FOV
```

3D 迁移方式：

```text
高频按钮放 Workbench table。
Mask opacity 使用 SpatialSliderTarget。
实时数值显示可放在桌面 text slots 或小型 HUD readout。
真实值从 runtimeStateStore.viewTarget 读取。
```

| 功能 | 目标 3D 控件 | 事件 | 状态 |
| --- | --- | --- | --- |
| FOV - | Workbench 或 radial 快捷项 | `editor.viewport.fov.step { delta: -5 }` | 待接 |
| FOV + | Workbench 或 radial 快捷项 | `editor.viewport.fov.step { delta: 5 }` | 待接 |
| Yaw -/+ | Workbench | `editor.viewport.center.step` | 待接 |
| Pitch -/+ | Workbench | `editor.viewport.center.step` | 待接 |
| Lock | Workbench toggle | `editor.viewport.lock.set` | 待接 |
| Opacity | 3D slider | `editor.mask.opacity.set` | 待实现 |
| Clear / Deepen | Workbench buttons 或 slider presets | `editor.mask.opacity.set` | 待接 |

### 6.6 Render / Export

2D 当前能力：

```text
Auto-render checkbox
Render request
renderMessage / renderStatus
Export detail link
Download MP4 link
Export ready prompt
```

3D 迁移建议：

```text
Workbench 的 RENDER 触发 editor.render.request。
Auto-render 作为 Workbench toggle 或 settings popup item。
VR 内不要直接弹 DOM prompt。
render completed 后打开 SpatialExportResultPopup。
如果用户要查看 detail/download，退出 VR 或在 3D popup 里给出明确动作。
```

## 7. 事件与 target 命名规范

3D target 建议全部使用 `spatial-` 前缀，并带区域：

```text
播放器:
  spatial-player-play-toggle
  spatial-player-progress

播放列表:
  spatial-playlist-toggle
  spatial-playlist-close
  spatial-playlist-source-select

Workbench:
  spatial-workbench-cut
  spatial-workbench-lock-toggle
  spatial-workbench-yaw-left

Effects:
  spatial-effects-popup-close
  spatial-effects-category-select
  spatial-effects-item-select
  spatial-effects-item-hold

Ring menu:
  spatial-ring-level-0-item
  spatial-ring-level-1-item
```

target 表达“哪个空间控件被操作”。业务事件表达“发生了什么语义动作”。两者不能混在一起。

示例：

```text
trigger:
  { kind: "vr-ray", target: "spatial-workbench-cut", action: "select" }

event:
  { type: "editor.timeline.cut" }
```

## 8. Effects 的 catalog -> ring menu 数据转换

当前 demo 写死：

```text
root: CUT / FX / CAM / MASK / PLAY
fx: FLASH / BLACK / LENS / GLITCH
lens: SOFT / PULSE / WAVE
```

迁移后应该变成：

```ts
type SpatialRingMenuModel = {
  levels: SpatialRingMenuLevel[];
};

type SpatialRingMenuLevel = {
  id: string;
  parentItemId?: string;
  spreadDeg: number;
  radius: number;
  items: SpatialRingMenuItem[];
};

type SpatialRingMenuItem = {
  id: string;
  label: string;
  tone: "cyan" | "magenta" | "orange" | "danger" | "white";
  payload: {
    categoryId?: string;
    effectId?: string;
    eventName?: string;
    params?: unknown;
    previewMode?: string;
    previewTarget?: string;
    renderStage?: string;
  };
};
```

数据来源：

```text
usePcEditorEffectCatalog
  -> categories
  -> SpatialEffectsPopup
  -> SpatialRingMenuModel
```

交互结果：

```text
选中 category:
  更新 ring local selection / popup state
  必要时 emit ui.panel.effects.category.toggle

选中普通 effect:
  emit editor.effects.select

按住型 effect start:
  emit editor.effects.hold.start
  runtimeStateStore.effectInput = holding

按住型 effect end:
  emit editor.effects.hold.end
```

注意：SpatialRingMenu 不应该知道后端 effect patch 怎么生成。它只发 catalog payload，workflow 继续负责 EffectEventsPatch。

## 9. 3D Slider primitive

需要至少两个 slider：

```text
spatial-player-progress
  读 playback.currentTimeMs / durationMs
  写 player.playback.seek { timeMs }

spatial-mask-opacity
  读 viewTarget.maskOpacity
  写 editor.mask.opacity.set { opacity }
```

建议实现：

```text
SpatialSliderTarget
  props:
    targetId
    value
    min
    max
    step
    orientation
    onPreviewValue
    onCommitValue

  interaction:
    ray hit local point -> normalized value
    trigger down -> dragging
    trigger move -> draft value
    trigger up -> commit
```

进度条需要支持：

```text
hover 显示预览点
pressed/drag 显示 draft fill
release 后发 player.playback.seek
播放过程中从 runtime playback 刷新
拖动中优先显示 draft value
```

Mask opacity 需要支持：

```text
滑动连续预览
release 后发最终值
Clear / Deepen 可以作为 preset button，也可以作为 slider 两端快捷按钮
```

## 10. 状态池要求

下列实时值必须来自 runtimeStateStore 或父层 model snapshot：

```text
playback.currentTimeMs
playback.durationMs
playback.isPlaying
recordingActive
playlistOpen
activeSourceId
viewTarget.center
viewTarget.fov
viewTarget.locked
viewTarget.maskOpacity
effectInput.mode
effectInput.categoryId
effectInput.effectId
xrSession.presenting
controller buttons pressed
```

可以留在组件本地的状态：

```text
hoveredControlId
pressedControlId
dragging slider draft value
popup local open animation
ring menu dwell timer
temporary close animation
```

如果某个本地状态开始被多个 3D 子组件持续读取，就应该提升到父组件 model 或 runtimeStateStore。

## 11. 推荐迁移阶段

### P0：冻结现有可用视觉，补交互规范

目标：

```text
保留播放器、播放列表当前视觉。
新增 SpatialControlTarget / SpatialButtonTarget / SpatialSliderTarget 规范。
把现有播放器 hit plane 和播放列表 hit plane 向统一 target registry 靠拢。
明确 ray blocker 层级。
```

验收：

```text
所有已有 3D 按钮都有 targetId。
hover / pressed / click 视觉反馈统一。
射线不会穿透到 360 视频。
```

### P1：播放器和播放列表功能等价

目标：

```text
实现 spatial-player-progress slider。
正式接通 spatial-playlist-source-select -> player.source.select。
补速率重置 target。
播放列表 loading / active / disabled 状态从父 model 输入。
```

验收：

```text
VR 中可以播放/暂停、前后切源、打开列表、关闭列表、选择 source、seek。
所有动作都能在 PcEditorEventBus 看到同一类语义事件。
```

### P2：Workbench 桌面按钮迁移

目标：

```text
ArwesWorkbenchSpatialTable 逐 region 生成 hit target。
CUT / LOCK / PLAY / START / END / RENDER / YAW / PITCH 先接入。
SAVE / DROP / UNDO 等未明确 workflow 的按钮先 disabled 或 visual-only。
```

验收：

```text
每个可点区域和视觉 region 对齐。
点击只进入事件层，不直接调用业务。
active/disabled/hover/pressed 状态能重绘 control canvas。
```

### P3：Effects popup + ring menu

目标：

```text
新增 SpatialEffectsPopup。
把 SpatialHoldRingMenuDemo 抽成数据驱动 SpatialRingMenu。
从 effect catalog 生成分类和 effect 层级。
接 editor.effects.select / hold.start / hold.end。
```

验收：

```text
Workbench EFFECT 打开弹窗。
一级圆环选分类。
二级/三级圆环选 effect。
按住型 effect 松开后写入同一套 workflow。
payload 与 2D PcEffectsPanelSimple 保持一致。
```

### P4：Mask slider、Export、状态读数

目标：

```text
Mask opacity slider 迁移到 3D。
Workbench 显示 yaw / pitch / FOV / opacity。
Render completed 时使用 3D export result popup，而不是 DOM prompt。
```

验收：

```text
VR 内可以完成基础剪辑闭环：Start crop -> 调整视角/遮罩 -> End crop -> Render -> 看到结果提示。
```

### P5：Quest 设备验收和回归

目标：

```text
Quest 手柄 ray enter / down / up / click 顺序实测。
双 trigger toggle 与 UI trigger 不重复触发。
平面 UI 在非 presenting 时保持可用。
presenting=true 时平面 UI 隐藏，3D UI 接管核心操作。
```

## 12. 实现顺序建议

建议不要先做全量业务迁移。顺序应该是：

```text
1. 统一 3D target / control state / blocker。
2. 给播放器 progress 做第一个 SpatialSliderTarget。
3. 给 Workbench 做 region target registry。
4. 迁移 CUT / LOCK / START / END / RENDER 这些高频按钮。
5. 把 ring menu 从 demo 改成 data-driven。
6. 接 effects catalog 和 hold/select payload。
7. 最后处理 export / discard / restore 这类低频或流程更重的功能。
```

这样每一步都有可观察结果，也不会让视觉组件临时塞业务逻辑。

## 13. 验收标准

功能验收：

```text
同一个语义事件可以来自键盘、平面 UI、3D UI、手柄组合输入。
3D UI 不直接调用 workflow/backend/playerRef。
所有按钮有 hover / pressed / active 或 disabled 状态。
所有弹窗和面板有 ray blocker。
所有滑块支持 drag start / move / commit / cancel。
```

架构验收：

```text
父组件装配子组件。
兄弟组件不互相 import。
实时共享值进入 runtimeStateStore。
视觉层、交互层、事件接入层、workflow 层职责清楚。
```

设备验收：

```text
桌面 mouse/cursor 可操作。
Quest controller ray 可操作。
点击 UI 不会穿透命中 360 videosphere。
进入 immersive VR 后 2D overlay 关闭，3D UI 可承担核心操作。
退出 VR 后 2D overlay 恢复。
```

回归验收：

```text
npm run typecheck
桌面 /xr/player-v2 非 immersive 模式不受影响。
现有 player-v2 edit flow 不回退。
已有 /xr/player-v3 视觉 demo 不被破坏。
```

## 14. 当前迁移判断

播放器和播放列表可以继续保留当前视觉方向，下一步补交互层和 slider。

特效不应该复刻 2D panel，而应该使用：

```text
SpatialEffectsPopup
  + catalog-driven SpatialRingMenu
```

Workbench 不应该继续只做一整块视觉桌面，而应该使用：

```text
arwesWorkbenchRegions
  -> SpatialControlTarget registry
  -> per-region hit plane
  -> event bus
```

最终目标是让 3D UI 在 immersive VR 中承担 2D UI 的核心操作，同时保持这套 3D UI 可以作为独立 A-Frame component 接入其他网站：

```text
宿主提供 model snapshot
宿主接收 Spatial3DUiAction
宿主决定 action 如何映射到自己的业务事件
3D UI 不绑定 PC Editor 私有 workflow
```

这是后续实现时最重要的边界。
