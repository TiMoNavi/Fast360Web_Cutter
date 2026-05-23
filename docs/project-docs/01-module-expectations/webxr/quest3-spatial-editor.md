# Meta Quest 3 空间剪辑器

## 定位

Meta Quest 3 空间剪辑器是 PC WebXR Editor 的头显端形态，对应同一个业务页面：

```text
/xr/videos/:videoId/session/:sessionId
```

它不复制 PC 的键鼠面板，而是把现有语义动作迁移到头显内的空间 UI。核心目标是让用户在观看 360 视频时直接完成裁剪：大部分操作应在 1 到 2 次点击内完成，高频动作优先使用“按住展开或绑定，移动到目标，松开发生效”的模式。

第一版以 Meta Quest controller 为主要输入。手势输入可以作为同语义动作的后续增强，但不作为首轮验收基线。

## Immersive VR 的真实限制

进入 `immersive-vr` 后，Quest Browser 不再把普通网页 DOM 当作可见、可点击的交互层。显卡输出由 WebXR runtime 接管，头显里看到的是 WebGL framebuffer 中渲染出来的 3D 世界；HTML、CSS、固定屏幕按钮、DOM hit layer、React pointer handler 和普通网页遮罩都不能作为沉浸模式内的主 UI 依赖。

这不是兼容性小问题，而是 Quest 端架构边界：

```text
PC 非沉浸模式：
DOM/CSS UI 可以点击。
React pointer / keyboard / wheel 可以驱动 crop mask。
固定屏幕 hit layer 可以把鼠标坐标转换为 yaw / pitch。

Quest immersive-vr：
DOM/CSS UI 不再是沉浸视图中的可靠交互层。
鼠标/触摸式 screen coordinate 失效。
遮罩、取景框、按钮、命中区域和反馈都必须进入 WebGL 3D 世界。
controller ray / head-gaze / XR input 才是主要输入来源。
```

因此，PC Editor 可以继续作为桌面工作台和语义原型，但不能把 PC 的 HTML 面板、CSS 遮罩或 DOM 点击层直接搬进 VR。进入 VR 后必须切换到空间 UI 和 3D 遮罩体系。

DOM Overlay 不作为第一版主方案。即使某些浏览器支持 DOM Overlay，它也不适合承载本项目的核心裁剪遮罩、取景框和高频剪辑操作；最多只能作为进入 VR 前、退出 VR 后、调试或极低频提示的辅助层。

## 空间 UI 技术选型

第一版 Quest UI 采用 A-Frame / Three.js 的空间平面 UI 模式，不再使用普通 DOM 面板作为沉浸式主 UI。

学习和实现参考：

```text
A-Frame:
使用 a-scene、a-entity、a-plane、a-box、a-text 搭建空间按钮和面板。
使用 laser-controls + raycaster 让 Quest controller 点击 .clickable 物体。
使用 cursor / rayOrigin: mouse 保留桌面调试入口。

Three.js:
参考官方 WebXR 示例里的 controller ray、hover、select、drag 交互模式。
webxr_vr_sandbox 可作为复杂 3D 场景和 WebXR session 参考。
interactive/raycaster 类示例可作为空间平面 UI hover / click 参考。
InteractiveGroup 可作为 Three.js 原生交互组参考。
```

第一版优先用 A-Frame 承载产品 UI，因为当前项目已经有 A-Frame scene、videosphere、crop mask、laser-controls 和 raycaster。Three.js 官方示例作为底层交互模型参考：射线命中 3D 对象、对象进入 hover 状态、select/click 后触发 operation。

空间 UI 的基本形态：

```text
普通按钮：
a-box / a-plane + a-text，挂 .clickable。

悬停反馈：
raycaster-intersected / mouseenter 时放大、提亮或显示边框。

按下反馈：
mousedown / trigger selectstart 时压低、闪烁或改变 emissive。

点击执行：
click / selectend 时调用 shared operation。

复杂面板：
用一组固定尺寸 3D entity 组成，不使用 HTML 表单控件。
```

## Three.js 风格 UI 移植方案

目标不是把 PC 的 DOM UI 翻译成一堆 A-Frame 标签，而是按 Three.js 官方 WebXR 示例的交互模型重建一套可长期维护的空间 UI：

```text
XR session:
renderer.xr.enabled = true。
renderer.setAnimationLoop(render) 驱动 VR 帧循环。

controller:
renderer.xr.getController(0 / 1) 作为输入源。
controller model 只负责显示手柄。
controller target-ray 负责 raycast。

interactive group:
用 InteractiveGroup 统一接收 pointer 和 XR controller 事件。
桌面调试走 pointer events。
Quest 真机走 XR controller events。

widgets:
按钮、slider、segmented control、radial menu、status badge 都是 Three.js Object3D。
每个 widget 自己处理 hover / pressed / disabled / active 状态。

operations:
widget click 不直接改数据库，只调用 shared operation。
```

当前项目已有 A-Frame scene，因此第一阶段不要立刻把整个播放器改成原生 Three.js。推荐走“Three.js UI 内核 + A-Frame 宿主”的过渡路线：

```text
短期：
A-Frame 继续负责 videosphere、WebXR session、现有 crop mask 宿主。
新增 ThreeXrUiLayer，把 Three.js UI objects 挂到 A-Frame sceneEl.object3D。
从 A-Frame sceneEl.renderer / sceneEl.camera / controller entity 取得 renderer、camera、controller。

中期：
把 SpatialButton、panel、radial menu 从 React/A-Frame createElement 迁到 Three.js widget factory。
所有 widget 注册到 InteractiveGroup。
PC pointer 和 XR controller 共用同一套 widget 事件。

长期：
如果 A-Frame 对底层 XR 输入、性能或状态同步形成阻碍，再把播放器 route 迁成原生 Three.js scene。
```

### 目标模块

建议新增一组 UI runtime 模块，和 PC DOM UI 分离：

```text
features/webxr/quest-ui/
  ThreeXrUiLayer.ts
  XrControllerRig.ts
  XrInteractiveGroup.ts
  widgets/
    XrButton.ts
    XrIconButton.ts
    XrSlider.ts
    XrSegmentedControl.ts
    XrRadialMenu.ts
    XrStatusBadge.ts
    XrPanel.ts
  layouts/
    XrPlaybackPanel.ts
    XrMaskDesk.ts
    XrEffectPanel.ts
    XrExportPanel.ts
  adapters/
    QuestUiOperationsAdapter.ts
```

模块职责：

```text
ThreeXrUiLayer:
创建 UI root、InteractiveGroup、controller ray helper、每帧 update。

XrControllerRig:
封装 getController、getControllerGrip、selectstart/selectend、thumbstick/gamepad 读取。

XrInteractiveGroup:
包装 Three.js InteractiveGroup。
统一 pointer / XR controller 的 click、hover、press 事件。

widgets:
只负责 3D mesh、文本纹理、状态动画和本地事件。

layouts:
把 widgets 组合成播放器面板、剪辑工作台、效果面板等空间布局。

QuestUiOperationsAdapter:
把 widget 事件转成 playPause、seek、setFov、cutHere、flushTimeline、requestExport。
```

### Widget 设计规范

Three.js UI widget 不使用 HTML/CSS 控件。每个控件都必须有稳定几何尺寸和明确输入事件：

```text
XrButton:
PlaneGeometry / BoxGeometry 作为 hit target。
TextGeometry 或 CanvasTexture 显示文字 / 图标。
hover: emissive 提亮、scale 1.04。
pressed: z 方向轻微下压、scale 0.96。
disabled: 降低 opacity，不响应 click。

XrSlider:
固定长度 track。
thumb 是单独 mesh。
ray intersection uv / local x 转换成 0..1。
drag start / drag move / drag end 分开发 operation。

XrSegmentedControl:
一组等宽 button mesh。
active segment 使用独立颜色和 rim。

XrRadialMenu:
按住展开，围绕 controller 或视线目标生成扇区 mesh。
hover 只更新 preview。
release 才触发 operation。

XrStatusBadge:
只读状态显示。
用于 locked / following / pending / accepted / export state。
```

### 事件映射

Three.js UI 的事件模型建议对齐官方 `InteractiveGroup`：

```text
pointermove / XR move:
更新 hover。

pointerdown / selectstart:
进入 pressed 或 drag 状态。

pointerup / selectend:
结束 pressed 或 drag。

click / select:
触发 command。
```

所有 widget 事件都统一成内部事件：

```text
hoverstart
hoverend
pressstart
pressend
click
dragstart
dragmove
dragend
cancel
```

这样 PC 调试和 Quest 真机不会分叉成两套 UI 逻辑。桌面调试时 `InteractiveGroup.listenToPointerEvents(renderer, camera)`；真机 VR 时 `InteractiveGroup.listenToXRControllerEvents(controller1 / controller2)`。

### UI 布局迁移

从当前 PC editor 迁移时，不照搬 DOM 面板密度，而是重组为适合 VR 的三个空间区域：

```text
中心观看层：
只保留 360 视频、crop mask、reticle、controller target、必要状态 badge。

前下方工作台：
Mask / Cut / FOV / Lock / Save / Undo 等高频按钮。
按钮大、数量少、可闭合。

侧前方低频面板：
Playback、Effects、Audio、Export、Session。
同一时间只打开一个大型面板。
```

PC DOM UI 到 Three.js UI 的迁移表：

```text
DOM button:
-> XrButton / XrIconButton。

DOM range slider:
-> XrSlider，使用 ray hit local x 映射 value。

DOM tabs:
-> XrSegmentedControl。

DOM modal / side panel:
-> XrPanel，固定宽高，分页。

DOM hover / active CSS:
-> material emissive / opacity / scale animation。

DOM click handler:
-> widget event -> QuestUiOperationsAdapter -> shared operation。

DOM keyboard shortcut:
-> controller button / thumbstick / radial menu。
```

### 分阶段迁移

```text
Phase 1: Three.js UI sandbox
在 /xr/playback-lab 或独立 lab 中创建 ThreeXrUiLayer。
只做 2 个按钮：Play/Pause、Cut。
支持桌面 pointer 和 Quest controller select。

Phase 2: 接入产品 scene
把 ThreeXrUiLayer 挂到当前 A-Frame product scene。
保留现有 A-Frame videosphere 和 crop mask。
按钮调用真实 runCommand / cutHere / flushTimeline。

Phase 3: Mask Desk
实现 FOV slider、Lock toggle、Save/Flush、状态 badge。
和 cropMaskState 双向同步。

Phase 4: Radial Menu
实现按住 A 或 thumbstick click 展开，release 触发。
把 Cut、FOV+、FOV-、Lock、Save 放进去。

Phase 5: Low-frequency panels
迁移 Effects、Audio、Export、Session。
面板分页，避免一次性堆太多 UI。

Phase 6: 收敛到 Three.js-first runtime
如果 ThreeXrUiLayer 稳定，再评估是否把整个 Quest editor 从 A-Frame 宿主迁到原生 Three.js route。
```

### 第一版验收

Three.js UI 移植第一版只验收最小闭环：

```text
Quest controller ray 能 hover 3D button。
selectstart 有 pressed 反馈。
select / click 能触发 shared operation。
Play/Pause 能控制视频。
Cut 能写入 timeline 语义。
FOV slider 能改变 3D crop mask。
Lock badge 能显示 locked / following。
退出 VR 后 PC DOM 工作台仍可用。
```

## VR 端遮罩重建原则

Quest 端的裁剪遮罩必须是 WebGL/A-Frame/Three.js 渲染的 3D 物体，而不是网页上的 2D 覆盖层。真实目标是重做一套 VR 可见、可交互、可采样的 3D 遮罩系统：

```text
视频层：
inside-out 360 videosphere。

遮罩层：
跟随相机或位于视频球内侧的 crop mask sphere / shader mesh。
shader 根据 center yaw / pitch 和 FOV 挖出 16:9 输出窗口。
窗口外渲染半透明雾化遮罩。

取景反馈层：
3D viewport border / corner arcs / reticle。
controller ray 命中点。
锁定、跟随、采样、pending / accepted 状态提示。

命中层：
不可见或低可见度的 3D hit sphere / hit plane / target mesh。
controller ray 或 head-gaze 与命中层求交后换算为 yaw / pitch。
```

PC 端已有的 `cropMaskState`、FOV、center、locked、timeline flush 和后端协议可以复用；需要替换的是输入来源和显示载体。换句话说，保留 operation，重做 VR render/input layer。

## 挖孔球形遮罩复用判断

结论：不应该把现有挖孔球形遮罩完全推倒重写。当前 `AFrameCropViewportMask` 已经是 A-Frame / Three.js 的 3D shader mesh，不是普通 CSS 遮罩；它的视觉核心有机会复用。真正需要重写的是 PC 输入层、DOM 点击层和鼠标屏幕坐标到 yaw / pitch 的转换逻辑。

建议判断如下：

```text
可以复用：
CropMaskState 数据结构。
center yaw / pitch、FOV、locked、smoothFollow 语义。
normalizeYaw / normalizePitch / directionToPose 这类角度工具。
verticalFovFromHorizontal 的 16:9 FOV 换算。
SphereGeometry + BackSide + ShaderMaterial 的球形遮罩结构。
shader 中按 center + FOV 挖出 16:9 窗口的算法。
maskOpacity、边缘 glow、雾化和半透明材质表现。
webxr:crop-mask-change 这类临时本地事件可以作为过渡层。

需要重写或剥离：
window keydown 作为主输入。
React pointer handler。
DOM hit layer。
screenPointToViewCenter。
isInteractiveTarget / DOM target guard。
鼠标拖拽 corner arc 调 FOV 的 pointerY 逻辑。
PC workbench 上的 HTML/CSS 按钮、slider 和 panel。

需要改造成双端共用：
mask operation 层。
crop mask renderer 的状态入口。
timeline flush 时机。
controller/head-gaze 与 mask center 的坐标换算。
```

因此，“重做 3D 遮罩”的准确含义不是丢掉现有 shader，而是把它从 PC 页面控制方式中拆出来，变成真正由 XR 输入和空间 UI 驱动的独立 3D renderer。

推荐重构边界：

```text
CropMaskRenderer:
只负责根据 center / fov / locked / opacity 渲染 3D 挖孔球形遮罩。
不绑定键盘、鼠标、DOM target。

PcMaskInputAdapter:
DOM pointer / keyboard / wheel -> shared mask operation。
只在非沉浸桌面工作台启用。

QuestMaskInputAdapter:
XRFrame / viewer pose / controller target-ray / gamepad axes -> shared mask operation。
只在 immersive-vr session 中启用。

MaskOperations:
moveMaskTo / setFov / toggleLock / flushTimeline。
PC 和 Quest 都调用这一层。
```

## 遮罩移植方案

### 第一步：拆出纯 3D 遮罩渲染器

把当前 `AFrameCropViewportMask` 中可复用的 3D 部分保留下来：

```text
SphereGeometry。
ShaderMaterial。
uCenterYaw / uCenterPitch / uFov / uOpacity / uLocked uniforms。
createFragmentShader。
buildState / emitCropState 的状态输出。
```

同时把 PC 专属输入剥离：

```text
不要让 renderer 自己监听 window keydown 作为核心逻辑。
不要让 renderer 负责 PC pointer、DOM button 或 screen coordinate。
renderer 只消费外部传入的 mask state 或 mask event。
```

阶段性可以继续使用 `webxr:crop-mask-center`、`webxr:crop-mask-fov`、`webxr:crop-mask-lock` 事件驱动 uniforms；后续再升级为更清晰的 React state / store / operation 调用。

### 第二步：新增 QuestMaskInputAdapter

Quest 输入适配器负责把 XR 输入转为同一套 mask operation：

```text
head-gaze:
读取 camera / viewer forward direction。
用 directionToPose 转成 yaw / pitch。

controller ray:
读取 right/left controller target-ray。
与不可见 hit sphere 或视频球求交。
把交点方向转成 yaw / pitch。

Trigger hold:
每帧更新本地 preview center。
不每帧上传后端。

Trigger release:
toggleLock(true)。
flushTimeline("lock")。

Grip hold:
切换到 controller ray follow。

Thumbstick:
调整 FOV，并在稳定后 flushTimeline("fov")。
```

如果命中层使用以用户为中心的球体，controller ray 命中点到球心的方向可以直接换算为 yaw / pitch。需要注意当前视频球可能带有 `rotation: 0 -90 0`，Quest adapter 必须统一处理“世界 yaw”和“视频经纬度 yaw”的偏移，不能复制 PC 的 screen coordinate 假设。

### 第三步：把取景框和命中反馈也变成 3D

当前 corner arcs / viewport border 的视觉思路可以保留，但拖拽输入要改成 XR 语义：

```text
保留：
3D corner arcs。
viewport border。
reticle。
locked / following 的颜色和呼吸动画。

替换：
鼠标拖拽 corner arc。
DOM hover。
PC pointer capture。

新增：
controller ray 命中点。
head-gaze reticle。
trigger hold 的 following 状态。
release lock 的确认反馈。
pending / accepted 的轻量状态提示。
```

### 第四步：空间按钮和工作台接入 shared operation

VR 工作台按钮用 A-Frame 3D entity 实现：

```text
按钮 mesh：
a-box / a-plane / a-text。

命中：
class="clickable"。
laser-controls + raycaster: objects: .clickable。

反馈：
mouseenter / mouseleave / mousedown / mouseup / click。

执行：
click 后调用 moveMaskTo / setFov / cutHere / flushTimeline / requestExport。
```

这里可以直接沿用当前 `AFrameSpatialPlayerControls` 和 `AFrameQuestEditorSpatialUiPrototype` 里已经出现的 `SpatialButton` 模式，再把按钮动作从原型状态迁到真实 operation。

### 第五步：保留 PC，切换 VR

最终页面应该是同一个业务入口，两套交互外壳：

```text
未进入 immersive-vr：
PC DOM workbench + A-Frame 预览。
DOM pointer 可以操作 mask。

进入 immersive-vr：
DOM workbench 只作为浏览器外层残留，不再承担核心操作。
3D mask + 3D buttons + QuestMaskInputAdapter 接管。

退出 immersive-vr：
恢复 PC DOM workbench。
继续使用同一份 cropMaskState / timeline status。
```

## 解决方案

Quest 端解决方案按“共享语义、重建空间层”的原则推进：

```text
1. 保留共享 operation：
   moveMaskTo
   setFov
   toggleLock
   cutHere
   flushTimeline
   createEffectEvent
   requestExport

2. 新增 Quest 输入适配器：
   head-gaze -> yaw / pitch
   controller ray -> hit sphere intersection -> yaw / pitch
   trigger hold -> follow preview
   trigger release -> lock + flush
   grip hold -> controller ray follow
   thumbstick -> FOV / playback rate

3. 重做 3D 遮罩和取景框：
   videosphere 内部显示 360 视频。
   crop mask shader mesh 根据 cropMaskState 渲染遮罩和 16:9 挖孔。
   viewport arcs / reticle / ray target 都作为 3D entity 渲染。

4. 重做 VR 工作台 UI：
   播放、FOV、Cut、Lock、Effect、Export 等按钮做成 A-Frame/Three 3D 按钮。
   使用 raycaster 命中 .clickable 或专门的 XR hit target。
   不依赖 DOM button、CSS panel 或 fixed overlay。

5. 明确模式切换：
   未进入 VR：显示 PC DOM 工作台。
   已进入 VR：隐藏或忽略 DOM 工作台，使用 3D 空间 UI。
   退出 VR：恢复 PC DOM 工作台和调试面板。
```

最小可落地版本：

```text
P0:
只做 3D 视频球、3D crop mask、3D reticle、controller/head-gaze 输入。
Trigger 按住跟随，松开锁定并 flush。
Thumbstick 调 FOV。
Cut 和 Save 用两个 3D 大按钮。

P1:
补充前下方工作台、快捷滑轮、特效和导出模块。

P2:
补充更完整的空间面板、手势输入和高级剪辑语义。
```

## 设计原则

```text
边看边剪：
中央视野优先留给 360 视频、取景框和遮罩预览，不堆叠大面板。

少点击：
高频动作通过按住、移动、松开的连续手势完成，避免层层点菜单。

语义复用：
Quest 输入层只调用现有 operation，不复制 PC keyboard/mouse 业务逻辑。

空间分工：
播放 UI 负责看视频和换视频，剪辑工作台负责编辑动作和参数。

可隐藏：
播放器 UI 和工作台模块都必须能快速收起，避免遮挡取景。
```

## 三层空间结构

### 观看层

观看层始终是头显端的主层：

```text
360 视频。
3D 遮罩挖孔预览。
reticle / ray 命中点。
当前取景中心和 FOV 反馈。
轻量状态提示。
```

观看层不承载大型编辑面板，也不使用 DOM/CSS 覆盖层承载核心裁剪 UI。取景框默认不始终跟随头显，避免用户自然转头时误写路径。默认交互是：

```text
按住 Trigger：
遮罩挖孔中心绑定头显视线方向。

移动头部：
实时更新本地预览取景中心。

松开 Trigger：
锁定当前取景状态，并触发采样 / patch 上传。
```

如果用户需要更精细地指向局部区域，可以提供 controller ray 模式：

```text
按住 Grip：
取景目标跟随 controller ray。

松开 Grip：
锁定 controller ray 指向的取景目标。
```

### 播放器垂直 UI

播放器 UI 保留为垂直空间面板，负责播放和素材切换：

```text
视频列表。
当前视频标题。
播放 / 暂停。
上一条 / 下一条。
进度条和 seek。
当前时间 / 总时长。
倍速。
加载、错误和进入 XR 状态提示。
```

默认位置：

```text
用户正前方或略偏左 / 右。
略低于视线中心。
面板始终面向用户。
不遮挡中央取景区域。
```

播放器 UI 可以整体隐藏。隐藏后只保留最小唤回入口或快捷滑轮项。隐藏播放器 UI 不影响播放状态、取景状态、采样状态或路径上传。

### 剪辑工作台水平 UI

剪辑工作台位于用户前下方，像桌面一样水平展开并略微倾斜。用户可以低头看到工作台，用 controller ray 点击。

工作台承载编辑动作：

```text
取景。
Cut。
FOV。
锁定 / 解锁。
放弃 / 恢复。
采样。
保存。
特效。
导出。
Session。
```

工作台按钮应少而大，适合 Quest controller 稳定命中。大按钮只负责执行明确单步动作或打开模块；复杂参数进入延展面板。

同一时间默认只打开一个大型工作台模块。打开新模块时，旧模块自动收起，避免空间中出现多个互相遮挡的编辑面板。

## 工作台延展面板

工作台模块点击后，从工作台前缘或上方弹出 45 度倾斜延展 UI。延展 UI 的目标不是模拟桌面窗口，而是让用户保持观看姿态时可以快速扫视和选择。

默认规则：

```text
从工作台向前上方延展。
面板保持 45 度左右倾斜，面向头部中心。
面板尺寸固定，内容用分页承载。
B 键关闭当前模块。
点击工作台空白区域也可收起模块。
```

第一版模块建议：

```text
FOV 模块：
显示当前 FOV，提供 FOV+ / FOV- / 重置。

采样模块：
显示采样中 / 暂停、待上传点数、最近 accepted 状态。

特效模块：
分页展示黑场、转场、滤镜、标记等效果。
选择效果后使用当前 video.currentTime 生成事件起点。

导出模块：
显示导出入口、导出状态和最近导出结果。

Session 模块：
显示 videoId、sessionId、take 历史、恢复入口。
```

特效、导出、Session 这类低频复杂模块允许翻页。翻页按钮应固定在面板左右边缘或底部，不能因页面内容变化而移动。

## 快捷滑轮 UI

快捷滑轮用于高频剪辑动作。它应使用按住展开、移动选择、松开发生效的模式：

```text
按住 A 或 thumbstick click：
展开环形菜单。

保持按住：
用 controller ray、thumbstick 方向或手柄朝向移动到目标扇区。

松开：
触发当前高亮选项。

B：
取消当前快捷滑轮。
```

第一版快捷项：

```text
Cut。
锁定 / 解锁。
FOV+。
FOV-。
放弃。
恢复。
保存。
隐藏 / 显示 UI。
```

快捷滑轮必须清楚显示当前将要触发的动作。松开前不应写入正式业务状态，避免用户划过某个选项时误触发。

## Controller 映射

第一版 Quest controller 映射：

```text
Trigger 按住：
取景框跟随 head-gaze。

Trigger 松开：
锁定当前 head-gaze 取景，并触发采样 / patch。

Grip 按住：
取景框跟随 controller ray。

Grip 松开：
锁定 controller ray 取景。

A 按住或 thumbstick click 按住：
打开快捷滑轮。

A / thumbstick click 松开：
触发快捷滑轮当前选项。

B：
关闭当前延展面板或取消快捷滑轮。

右手 thumbstick 上 / 下：
FOV- / FOV+。

右手 thumbstick 左 / 右：
切换播放倍速。
```

手势输入后续可以映射到同一套语义：

```text
捏合按住：
等价 Trigger 按住。

松开捏合：
等价 Trigger 松开。

掌心菜单手势：
等价快捷滑轮入口。
```

手势不改变 operation 语义，也不新增后端协议。

## 语义动作和协议边界

Quest 3 端不新增后端协议。所有业务结果继续使用当前桥接消息：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

Quest 输入适配器建议独立实现，例如：

```text
useQuestSpatialEditorInput
```

该适配器只负责把 head-gaze、controller ray、controller buttons、thumbstick axes、空间按钮事件转换为现有 operation：

```text
playPause
seek
togglePlayerUi
openWorkbenchModule
closeWorkbenchModule
moveMaskTo
setFov
toggleLock
cutHere
toggleSampling
savePatch
discard
restore
createEffectEvent
requestExport
```

不要在 Quest 输入层直接写数据库，也不要复制 PC input adapter 的方向假设。PC 和 VR 的取景坐标差异必须在各自 input adapter 中处理，最终落到同一套 center / fov / cut / enabled 语义。

PC 端的 DOM pointer pipeline 只能作为非沉浸桌面输入：

```text
DOM pointer / screen coordinate / fixed hit layer
-> PC adapter
-> shared operation
```

Quest 端必须走 XR pipeline：

```text
XRFrame / viewer pose / controller target-ray
-> 3D hit test or direction vector
-> yaw / pitch
-> shared operation
```

两条 pipeline 的共同点只能是 operation 和后端协议，不是 UI 技术栈。

## 状态边界

需要持久化或发送到业务协议的状态：

```text
center.yaw
center.pitch
fov.h
fov.v
enabled
cut
effect events
playback state
```

只存在于头显本地预览和 UI 的状态：

```text
当前打开哪个空间面板。
hover / pressed 状态。
快捷滑轮展开状态。
工作台位置微调。
播放器 UI 是否隐藏。
面板透明度。
视觉主题。
controller ray 命中反馈。
```

本地预览可以在 XR render loop 高频更新；持久化采样必须降频，并复用 `input-and-sampling.md` 中的上传节奏。cut、锁定切换、FOV 明显变化、保存等动作可以即时 flush。

## 验收场景

第一版 Quest 3 空间剪辑器验收：

```text
Quest Browser 可以进入 /xr/videos/:videoId/session/:sessionId。
A-Frame scene、videosphere、XR session 和 controller 输入正常工作。
视频可以播放、暂停、seek、切换视频。
进入 immersive-vr 后，不依赖 DOM/CSS UI 完成核心裁剪操作。
遮罩、取景框、reticle、命中区域和核心按钮均由 WebGL 3D entity 渲染。
播放器垂直 UI 可以隐藏和唤回。
隐藏播放器 UI 后，取景采样和播放状态不受影响。
剪辑工作台位于前下方，中央视野不被大面板遮挡。
点击工作台模块后，延展面板以约 45 度角展开。
特效面板支持分页选择。
按住 Trigger 时，取景框跟随头显视线。
松开 Trigger 后，当前取景被锁定并发送 patch。
按住 Grip 时，取景框可以跟随 controller ray。
快捷滑轮可以通过按住 A 或 thumbstick click 展开。
Cut、FOV、保存、放弃 / 恢复可以通过工作台或快捷滑轮触发。
高频动作能在 1 到 2 次点击内完成。
patch accepted 后，后端接收的 center / fov 与头显端锁定取景一致。
```

## 实现顺序

建议分阶段推进：

```text
第一阶段：
保留现有 PC Editor 页面和后端协议，新增 Quest 输入适配器、3D crop mask 和基础 head-gaze 锁定取景。

第二阶段：
接入播放器垂直 UI 的 XR 空间形态，支持隐藏 / 唤回。

第三阶段：
实现前下方剪辑工作台和基础模块：Cut、FOV、锁定、保存。

第四阶段：
实现 45 度延展面板和分页模块：特效、导出、Session。

第五阶段：
实现快捷滑轮 UI，并把 Cut、FOV、保存、放弃 / 恢复迁入快捷项。

第六阶段：
补充手势输入映射，但仍复用同一套 operation。
```

## 设计结论

这个方向可行，并且与当前 PC WebXR Editor 的分层设计兼容。关键不是把桌面编辑器搬进头显，而是保留现有业务 operation，把输入和 UI 换成空间化形态：

```text
播放相关：
垂直空间 UI，服务观看和换素材。

编辑相关：
前下方水平工作台，服务低频清晰操作。

高频剪辑：
Trigger / Grip / 快捷滑轮，服务边看边剪。
```

只要第一版坚持 controller 优先、中央视野清爽、operation 复用、松发触发，Quest 3 端就可以在不改后端协议的前提下逐步演进成真正适合头显的剪辑系统。
