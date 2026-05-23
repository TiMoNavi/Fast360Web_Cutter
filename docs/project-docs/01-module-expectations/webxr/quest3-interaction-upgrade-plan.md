# Quest 3 头显交互升级路线

日期：2026-05-23

补充设计稿：

```text
docs/project-docs/01-module-expectations/webxr/quest3-editor-interaction-design-v1.md
```

## 目标

把当前 PC editor 的鼠标、键盘、DOM 控件交互，升级成 Quest 3 immersive-vr 中可用的空间交互。原则是复用现有 operation，不为头显单独重写业务逻辑。

```text
硬件输入
-> WebXR / A-Frame 输入适配
-> 统一 semantic operation
-> ViewPathPatch / EffectEventsPatch / PlaybackClientState
```

## 搜集到的常见做法

### 1. 输入分成 targeting 和 action

WebXR 的常见模型是：

```text
targeting:
  用户看向哪里，或 controller ray 指向哪里。

action:
  select / squeeze / gamepad button / thumbstick。
```

头显朝向用 `XRFrame.getViewerPose()`，controller 指向用 `XRInputSource.targetRaySpace`。是否点中某个按钮不是 WebXR 自动完成的；应用需要自己做 ray hit test 或交给 A-Frame raycaster。

参考：

```text
https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs
https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/targetRaySpace
```

### 2. A-Frame 推荐用 laser-controls + raycaster + cursor

A-Frame 的 `laser-controls` 是跨 VR controller 的高阶组件。它会封装 tracked controller、cursor、raycaster，并画出 controller laser。常见写法：

```html
<a-entity
  laser-controls="hand: right"
  raycaster="objects: .xr-clickable; far: 8"
  line="color: #dcecff; opacity: 0.65">
</a-entity>
```

被点的对象必须能被 raycaster 选中：

```html
<a-entity class="xr-clickable" geometry="primitive: box; width: 0.4; height: 0.18; depth: 0.04">
  <a-text value="CUT"></a-text>
</a-entity>
```

参考：

```text
https://aframe.io/docs/1.7.0/components/laser-controls.html
https://aframe.io/docs/1.7.0/components/raycaster.html
https://aframe.io/docs/1.7.0/components/cursor.html
https://aframe.io/docs/1.7.0/introduction/interactions-and-controllers.html
```

### 3. 点击按钮的核心是“可命中实体 + 事件组件”

让射线点击按钮，需要满足：

```text
1. controller 上有 raycaster / laser-controls。
2. raycaster objects 选择器能匹配按钮实体。
3. 按钮实体有真实 geometry，可被 raycast。
4. 按钮或父实体监听 click / mousedown / mouseup / mouseenter / mouseleave。
5. click handler 调用现有 operation，而不是直接改业务状态。
```

建议按钮分成两层：

```text
visual mesh:
  负责显示，大小可以好看。

hit target:
  透明或半透明，面积更大，负责命中。
```

这可以解决 Quest controller 微抖和当前观察到的射线偏移问题。

### 4. Three.js 原生做法是 getController + Raycaster

如果绕过 A-Frame，Three.js 常见写法是：

```text
renderer.xr.getController(index)
controller.matrixWorld -> ray origin / direction
THREE.Raycaster.intersectObjects(buttonMeshes)
controller select/selectstart/selectend -> dispatch button action
```

参考：

```text
https://threejs.org/manual/en/webxr-point-to-select.html
https://threejs.org/docs/pages/WebXRManager.html
```

当前项目已经在 A-Frame 上构建视频球和 controller，因此第一阶段优先走 A-Frame；只有在需要精细控制 ray hit、拖拽或校准时，再局部引入 Three.js raycaster 逻辑。

## PC 端到头显端的升级路径

### 阶段 1：保留 PC editor，抽出 operation

已有 PC 操作继续作为唯一业务入口：

```text
playPause
seekTo
setViewTarget
nudgeFov
cutHere
flushPath
createEffectEvent
toggleLock
```

PC 输入：

```text
mouse / keyboard / DOM button
-> operation
```

XR 输入：

```text
controller ray / trigger / grip / thumbstick / spatial button
-> 同一个 operation
```

### 阶段 2：做 Quest input adapter

新增一个 `useQuestSpatialEditorInput` 或 A-Frame component，职责只做输入翻译：

```text
triggerdown -> controllerAimStart
triggerup -> controllerAimEnd + flush lock
gripdown -> controller ray follow
gripup -> controller ray lock
thumbstickup/down -> nudgeFov
thumbstickleft/right -> timeline or playback rate
abuttondown -> primary action / radial wheel
bbuttondown -> close / cancel
```

adapter 不直接知道后端协议，只派发项目内 semantic event。

### 阶段 3：建立空间按钮系统

空间按钮最小结构：

```text
<button-root position / rotation>
  <hit-target class="xr-clickable">
  <visual-panel>
  <label/icon>
</button-root>
```

按钮组件状态：

```text
idle
hovered
pressed
disabled
active/toggled
```

事件：

```text
mouseenter -> hover visual
mouseleave -> idle visual
mousedown/selectstart -> pressed visual
mouseup/selectend -> release visual
click/select -> dispatch operation
```

按钮应该比 PC DOM 按钮大得多。建议：

```text
常用按钮宽 0.28m - 0.45m
高度 0.14m - 0.22m
按钮间距 >= 0.04m
hit target 比视觉面大 15%-30%
```

### 阶段 4：射线校准

本轮真机观察到 controller ray 视觉上约偏 30 度。不要硬编码修正，先做校准：

```text
1. 在视频中心显示十字点。
2. 用户用右手柄 ray 指向十字点并按 Trigger。
3. 记录 headPose、controllerRay、videosphere rotation。
4. 计算 world yaw/pitch -> video yaw/pitch 的 offset。
5. 再用左/右/上/下四个点验证误差。
```

因为当前视频球有：

```text
a-videosphere rotation="0 -90 0"
```

所以 WebXR 世界坐标、A-Frame object3D 坐标、视频经纬度坐标一定要显式转换。

## 推荐实现顺序

```text
1. 补齐 xr-frame-sample:
   采集 XRInputSource profiles、gamepad buttons、axes、targetRayPose。

2. 建立 QuestInputAdapter:
   把 WebXR / A-Frame raw input 映射到 semantic operation。

3. 做 4 个最小空间按钮:
   CUT / LOCK / FOV+ / FOV-。

4. 给按钮加大 hit target:
   class="xr-clickable"，用 controller laser click 触发。

5. 做射线校准页:
   记录 controller ray 与视频坐标偏移。

6. 再扩展空间 UI:
   radial menu、workbench panel、timeline scrub、effects panel。
```

## 最小可落地示例

```html
<a-entity
  id="right-controller"
  laser-controls="hand: right"
  raycaster="objects: .xr-clickable; far: 8"
  line="color: #dcecff; opacity: 0.65">
</a-entity>

<a-entity
  class="xr-clickable"
  position="0 1.25 -1.1"
  geometry="primitive: box; width: 0.42; height: 0.18; depth: 0.03"
  material="color: #101820; opacity: 0.92"
  quest-operation-button="operation: cutHere">
  <a-text value="CUT" align="center" position="0 0 0.03"></a-text>
</a-entity>
```

`quest-operation-button` 组件：

```text
init:
  listen mouseenter / mouseleave / mousedown / mouseup / click

click:
  dispatchWebXrTimelineEvent({ type: "cutHere" })
```

这个模式的好处是：PC DOM button 和 XR 3D button 最终都调用同一个 operation，后端 timeline 协议不用变。

## 设计注意点

```text
1. 中央视野不要塞复杂面板，常用按钮放在前下方工作台。
2. 射线按钮要有 hover/pressed 反馈，否则用户不知道是否命中。
3. hit target 要大于视觉按钮。
4. Trigger 用于点击/确认，Grip 更适合临时绑定 controller ray。
5. Thumbstick 不适合精细按钮点击，更适合 FOV、时间线、速率这种连续调节。
6. 所有 XR 输入先进入 semantic operation，再进入产品状态。
7. 对 controller ray 到视频 yaw/pitch 做一次显式校准。
```

## 组合交互模式库

下面这些是从 WebXR / A-Frame / Three.js 常见输入模型整理出来的交互语法。它们应该作为 Quest 端的基础操作单元，而不是一次性写进复杂 UI。

### Hover 反馈

目标：射线悬停在按钮上时，用户立刻知道“我命中了”。

事件来源：

```text
A-Frame cursor/raycaster:
  mouseenter
  mouseleave
  raycaster-intersection
  raycaster-intersection-cleared

Three.js/WebXR:
  每帧 raycaster.intersectObjects()
  记录上一帧 hovered object
  新对象 -> hover enter
  离开对象 -> hover leave
```

视觉反馈建议：

```text
hover enter:
  按钮边框变亮
  背板轻微放大 1.04 - 1.08
  显示命中点或小光环
  controller ray 颜色变亮

hover leave:
  恢复 idle
  清除命中点

disabled hover:
  不触发 operation
  可显示低亮度或红色短闪，但不要弹大提示遮挡视野
```

实现建议：

```text
按钮不要只靠文字或 plane 做命中。
每个按钮放一个略大的 invisible/transparent hit target。
hit target 加 class="xr-clickable"。
raycaster objects 只指向 .xr-clickable，减少误命中。
```

### Press / Release 点击

目标：按下时有 pressed 反馈，松开时提交，符合 controller trigger 手感。

事件映射：

```text
selectstart / mousedown / triggerdown:
  pressed=true
  记录 pressedTarget

selectend / mouseup / triggerup:
  如果当前 hoveredTarget === pressedTarget:
    commit click
  否则:
    cancel press

select / click:
  可作为简单按钮快捷路径
```

为什么要记录 `pressedTarget`：

```text
用户按下后可能手抖移出按钮。
只有“按下和松开都在同一按钮上”才提交，避免误触。
如果是菜单选择，则允许按下打开、移动到别的选项、松发选择。
```

按钮状态机：

```text
idle -> hover -> pressed -> commit -> hover
idle -> hover -> pressed -> cancel -> idle/hover
disabled 状态不进入 pressed。
```

### 按住打开选单，松发选择

目标：支持“按一个按钮出来菜单，然后射线滑到某项，松开选择”。这是 Quest controller 很自然的 radial/quick menu 模式。

典型流程：

```text
1. Trigger/A/Grip selectstart on launcher。
2. 打开 menu，menu 锚定在用户前方或 launcher 附近。
3. 保持 pressed=true，不立即提交 launcher。
4. controller ray 悬停到 menu item，item hover 高亮。
5. selectend:
   如果 hovered item 存在 -> commit item operation。
   如果没有 hovered item -> cancel / close menu。
6. 关闭 menu，清理 pressed/hover 状态。
```

适合放进快速选单的操作：

```text
CUT
LOCK
FOV+
FOV-
SAVE PATCH
HIDE UI
EFFECTS
SESSION
```

radial menu 建议：

```text
半径: 0.22m - 0.36m
选项数: 4 - 8 个
每个选项角宽: >= 35 度
选项之间留空隙
当前 hovered item 放大 / 发光
中心区域作为 cancel zone
```

扇形菜单不一定要真的做扇形 mesh。第一版可以用环形排列的大按钮：

```text
top: FOV+
bottom: FOV-
left: CUT
right: LOCK
upper-right: FX
upper-left: HIDE
```

### Hold-to-Arm 操作

目标：按住进入某种临时模式，松开发送结果。

适合：

```text
Trigger hold:
  使用 head-gaze 或当前取景框持续采样。

Grip hold:
  使用 controller ray 持续指向取景目标。

A hold:
  打开 radial menu。

Thumbstick hold:
  连续 FOV 或时间线微调。
```

状态机：

```text
hold start:
  armed=true
  sampling source=head_gaze/controller_ray
  显示模式提示和目标框

hold move:
  每帧更新 preview
  不立即写最终 patch

hold end:
  lock preview
  flush patch
  armed=false
```

这类操作要优先走语义层：

```text
controllerAimStart
controllerAimEnd
setViewTarget
flushPath(reason=lock)
```

### Drag / Scrub

目标：用射线拖拽滑条、时间线或 FOV 控件。

流程：

```text
selectstart on draggable:
  capture pointer/controller
  store dragPlane
  store initial value

while pressed:
  ray 与 dragPlane 求交点
  把交点投影到控件局部坐标
  更新 preview value

selectend:
  commit value
  release capture
```

适合：

```text
timeline scrub
FOV slider
playback rate slider
mask opacity slider
effect duration trim
```

第一版不建议直接做复杂拖拽。先用 thumbstick step 和大按钮完成同类功能，再补 scrub。

### Dwell / Gaze Select

目标：无手柄或手柄不可用时，用头显 gaze 停留选择。

流程：

```text
gaze ray hover item
start dwell timer
显示环形进度
达到阈值后 select
离开 item 则取消
```

建议：

```text
dwell 时间: 650ms - 1000ms
危险操作不允许 dwell 直接提交
用于播放/暂停、打开菜单、关闭面板等低风险操作
```

当前第一版 Quest controller 优先，gaze select 作为降级能力。

## 菜单类型建议

### Quick Radial Menu

触发：

```text
A hold 或 Trigger hold on launcher
```

提交：

```text
松发选择 hovered item
```

用途：

```text
高频单步操作，最多 8 个。
```

### Context Panel

触发：

```text
点击工作台按钮，如 FX / SESSION / EXPORT。
```

提交：

```text
射线点击面板内大按钮。
```

用途：

```text
参数较多的模块，不适合 radial。
```

### Tool Shelf

触发：

```text
常驻在前下方，低头可见。
```

提交：

```text
射线点击大按钮。
```

用途：

```text
播放、剪切、锁定、保存、显示/隐藏。
```

### Marking Menu

触发：

```text
按住后根据射线方向选择，不一定需要精确点中按钮。
```

提交：

```text
松发时按方向扇区提交。
```

用途：

```text
熟练用户快速操作。比如上=FOV+，下=FOV-，左=CUT，右=LOCK。
```

这个模式对 30 度射线偏移更宽容，但需要清晰的扇区高亮。

## 事件优先级

同一时间可能有多个交互层。建议固定优先级：

```text
modal menu item
> active drag target
> radial menu item
> workbench button
> video viewfinder / controller ray sampling
> global shortcuts
```

示例：

```text
如果 radial menu 打开，Trigger release 应先提交 menu item。
如果没有 menu item hover，再取消菜单。
不要同时触发 CUT 和 controllerAimEnd。
```

## 防误触规则

```text
1. 松发选择必须有 hovered item，或者有明确方向扇区。
2. 危险操作如 DISCARD / DELETE 需要二次确认或长按。
3. 同一个 selectstart/selectend 只能提交一个 operation。
4. 菜单打开后，launcher 本身不再接收 click。
5. controller ray 抖动时，用 80ms - 150ms hover debounce。
6. 按钮 hover 状态最多只能有一个 active target。
```

## 推荐新增组件

```text
QuestRayInteractor
  统一读取 right/left controller ray。
  管理 hoveredTarget / pressedTarget / activeMenu。
  派发 hover/press/release/select 语义事件。

QuestSpatialButton
  大 hit target。
  hover/pressed/disabled/active visual。
  operation prop。

QuestRadialMenu
  hold open。
  ray hover item。
  release commit。
  cancel zone。

QuestInteractionState
  当前模式：idle / hovering / pressing / menuOpen / dragging / armed。
```

## A-Frame 事件草案

```text
quest:hover-enter
quest:hover-leave
quest:press-start
quest:press-end
quest:select
quest:menu-open
quest:menu-hover-item
quest:menu-commit
quest:menu-cancel
quest:drag-start
quest:drag-update
quest:drag-end
```

这些事件再映射到产品语义：

```text
quest:select CUT -> cutHere
quest:menu-commit FOV+ -> nudgeFov(deltaH=-5)
quest:menu-commit FOV- -> nudgeFov(deltaH=5)
quest:press-start VIEW -> controllerAimStart
quest:press-end VIEW -> controllerAimEnd
```

## 下一步实验

建议做一个极小 Demo，不和完整空间 UI 绑定：

```text
1. 前方放一个 launcher 按钮。
2. Hover 时变亮，pressed 时缩小。
3. Trigger 按住 launcher 打开 4 项 radial menu。
4. 射线移动到 CUT / LOCK / FOV+ / FOV-，item 高亮。
5. 松开 Trigger，记录 quest:menu-commit 和对应 operation。
6. 如果松开时没有 item hover，记录 quest:menu-cancel。
```

验收事件：

```text
hover-enter launcher
press-start launcher
menu-open
menu-hover-item CUT
menu-commit CUT
operation cutHere
```
