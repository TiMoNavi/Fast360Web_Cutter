# immersive-vr 下 2D UI 转 3D UI 的当前处理分析

## 结论

`/xr/player-v3` 现在没有把 PC 的 DOM 控件直接塞进沉浸式 VR。当前路线是保留桌面 DOM overlay 作为进入 VR 前后的操作层，同时在 A-Frame scene 内放入真正会进入 WebXR framebuffer 的 3D UI。

这条方向是对的：进入 `immersive-vr` 后，头显里可靠可见的是 WebGL/A-Frame/Three 渲染出来的对象，不是普通页面 DOM。现在的 `3DUI/hybrid-player` 已经开始按这个边界做播放器控制条：

```text
PC / pre-VR:
  DOM overlay
  XrHud
  mode switch
  PcPlayerControlsSimple

immersive / WebXR framebuffer:
  A-Frame videosphere
  XrCropMask shader entity
  HybridSkinPlayerBar
    HTMLMesh skin
    native a-text labels
    transparent hit planes
```

不过当前实现还处于验证阶段。它已经解决了“沉浸式里必须有 3D 承载物”的大方向问题，但还没有完整解决“Quest controller 能稳定点到 UI、UI 跟随/摆放正确、3D UI 状态和业务状态完全同步”的问题。

## 当前入口和分层

`apps/web/app/xr/player-v3/page.tsx` 是页面入口。它在 server 侧通过 `buildPcEditorPlayerModel` 读取当前播放器模型，然后渲染 `PlayerV3`。

`PlayerV3` 是当前 v3 的组合壳：

```text
PlayerV3
  AFrame360VideoPlayer
    AFrameScene
    AFrameVideoSphere
    XrCropMask
    HybridSkinPlayerBar

  DOM uiOverlay
    XrHud
    ui mode switch
    origin hint
    PcPlayerControlsSimple
```

`AFrame360VideoPlayer` 负责 A-Frame scene、隐藏 `<video>`、`<a-videosphere>` 和播放状态回调。`useMetaImmersiveMode` 负责 HTTPS / `navigator.xr` / `immersive-vr` 检查，并通过 `requestMetaXrSession` 把 session 绑定到 A-Frame 内部的 Three renderer。

进入 VR 时，`requestMetaXrSession` 会：

```text
renderer.xr.enabled = true
renderer.xr.setReferenceSpaceType("local-floor")
navigator.xr.requestSession("immersive-vr")
renderer.xr.setSession(session)
sceneEl.addState("vr-mode")
sceneEl.emit("enter-vr")
session end -> sceneEl.emit("exit-vr")
```

所以 `HybridSkinPlayerBar` 可以监听 A-Frame scene 的 `enter-vr` / `exit-vr`，并根据 `scene.is("vr-mode")` 切换自己的空间位置。

## UI 模式切换

`PlayerV3` 里有一个本地 `uiMode`：

```ts
type UiMode = "flat" | "immersive" | "both";
```

当前行为是：

```text
flat:
  只显示 DOM 播放控制条
  不渲染 HybridSkinPlayerBar

immersive:
  渲染 HybridSkinPlayerBar
  隐藏 PcPlayerControlsSimple

both:
  同时渲染 HybridSkinPlayerBar 和 PcPlayerControlsSimple
```

默认值是 `both`。这对桌面调试友好，因为可以同时看见 DOM 版本和 3D 版本。但它还不是严格的 session-driven 模式切换：进入 `immersive-vr` 时不会自动把 `uiMode` 改成 `immersive`，退出 VR 时也不会自动恢复。

这不影响头显里是否能看见 3D UI，因为 DOM overlay 本来就不会进入 WebXR framebuffer。但从产品行为上，后续应该把“进入 VR 后核心操作只看 3D UI”变成自动状态，而不是靠调试开关。

## 2D 到 3D 的转换方式

当前 3D 播放器条不是纯 A-Frame primitive，也不是完整 DOM Overlay，而是 hybrid 方案。

### 1. HTMLMesh skin

`HybridSkinPlayerBar` 用 `createSkinDom()` 创建一块屏幕外 DOM：

```text
width: 1820px
height: 245px
class: hybrid-skin-player-bar
```

这块 DOM 只承载视觉外壳：

```text
玻璃底板
渐变
边框
按钮壳
progress track 背景
装饰点
静态 chrome
```

然后用 Three 的 `HTMLMesh` 把它变成 scene 里的 mesh。这样可以复用 CSS 的视觉表现力，比完全用 `a-plane` / `a-circle` 拼 UI 更接近现有 PC 播放器条。

### 2. native text layer

动态文字没有放进 HTMLMesh skin，而是用 `a-text` 渲染：

```text
当前时间
总时长
PLAY / PAUSE
标题
subtitle
START RECORD / END RECORD
rate label
MENU
```

这个选择是为了解决 HTMLMesh 文字在 VR 里容易发糊的问题。skin 可以略糊一点，因为它主要是形状和装饰；文字必须更清晰，所以单独走 A-Frame 的 MSDF text。

### 3. native dynamic graphics

进度条填充不是 HTMLMesh 里的一部分，而是单独的 `a-plane`：

```text
progress = currentTimeMs / durationMs
progressWidth = slotWidth * progress
```

这样播放时间变化时不需要重绘整块 DOM skin，只更新一个 3D plane。

### 4. transparent hit planes

可点击区域由透明 `a-plane` 承载：

```text
previous
playPause
next
record
playbackRate
recordingRate
playlist
```

每个 hit plane 使用同一套 slot 坐标，并在 `click` 时调用 `onCommand(command)`。这条边界很重要：skin 只负责看起来像按钮，hit plane 才负责交互和命令语义。

## 坐标和对齐策略

`SpatialPlayerLayout.ts` 定义了统一设计坐标：

```text
skin pixels: 1820 x 245
world size:  1.82m x 0.245m
```

核心换算是：

```ts
worldX = (x / 1820 - 0.5) * 1.82
worldY = (0.5 - y / 245) * 0.245
```

文字、hit plane、progress fill 都通过同一个像素坐标系统转换到 world 坐标。这个设计是当前实现里最值得保留的部分，因为它避免了“skin 缩放一套、文字手调一套、点击区域再猜一套”的漂移问题。

当前层级大致是：

```text
HTMLMesh skin        z = 0
progress fill        z = 0.026
native text layer    root offset z = 0.006, text slot z = 0.002
hit planes           z = 0.012
```

需要注意的是，当前 z 层级有交叉：progress fill 的 z 比 hit plane 更靠前。视觉上通常没问题，但如果后续做更复杂的 raycast 或 depth 行为，建议重新整理为明确的：

```text
skin
dynamic graphics
native text
hit planes
hover / pressed feedback
```

## 当前显示效果的有效点

当前方案的优点比较清楚：

1. 沉浸式可见性方向正确

`HybridSkinPlayerBar` 是 A-Frame scene 的子节点，最终进入 WebGL framebuffer。它不是普通 DOM overlay，所以进入 `immersive-vr` 后理论上仍能被头显看到。

2. CSS 视觉质量被保留了一部分

HTMLMesh skin 能复用渐变、边框、光效和布局，比纯 primitive 原型更接近 PC 端播放器条。

3. 动态文字清晰度优先

动态文本不烘进 HTMLMesh texture，而是用 native `a-text`。这比把所有文字一起做成 DOM texture 更适合 VR 阅读。

4. 布局对齐有统一坐标源

`SpatialPlayerLayout.ts` 把 skin、text、hit plane 的位置统一到 1820 x 245 的设计坐标，后续调版有稳定基础。

5. PC 与 VR 可以共享命令语义

3D hit plane 最终触发的是 `PcEditorCommand` 形态的命令。方向上可以让 DOM button、键盘、VR ray 都落到同一套业务语义。

## 当前兼容和交互风险

### 1. 3D UI 目前缺少完整 controller ray 输入

`HybridSkinPlayerBar` 的 hit plane 已经有 `className: "clickable"` 和 click listener，但当前 `AFrameScene` 默认没有配置：

```text
cursor
raycaster
laser-controls
controller entities
XR controller select adapter
```

这意味着 3D UI 现在更像“显示和命令映射原型”。在桌面或 Quest 里，它未必能稳定收到真实点击。要让它成为可用的沉浸式 UI，需要在 scene 里补齐 controller ray / cursor / raycaster 输入路径。

建议 P0 处理：

```text
desktop debug:
  camera cursor 或 mouse raycaster 能命中 .clickable

Quest:
  controller ray 能命中 .clickable
  selectstart 有 pressed feedback
  selectend / click 触发 command
```

### 2. hybrid bar 是 world-space，不是 camera-relative

`SpatialNativePlayerBar` 原型会把 root object 挂到 `#main-camera` 上：

```text
cameraObject.add(rootObject)
position: 0 -0.49 -1.15
```

这表示它是 camera-relative，始终在用户视野前下方。

但 `HybridSkinPlayerBar` 当前没有挂到 camera，只是监听 `vr-mode` 后切换 root position：

```text
desktop: 0 1.11 -1.15
VR:      0 -0.49 -1.15
```

这会带来两个风险：

```text
1. 用户转头后，player bar 留在世界固定方向，不一定还在视野内。
2. requestMetaXrSession 使用 local-floor reference space，VR 里的 y = -0.49 可能不是“眼睛下方 0.49m”，而是接近地面以下的位置。
```

如果目标是播放器条始终作为随身控制条，hybrid 版本应该像 native 原型一样挂到 camera 或 camera-rig 下。如果目标是 world-pinned UI，则需要增加 recenter、召回和高度校准，而不是写死 `0 -0.49 -1.15`。

### 3. DOM overlay 仍然存在，但不能作为沉浸式核心 UI

`XrHud`、mode switch、origin hint 和默认 `both` 下的 `PcPlayerControlsSimple` 都在 DOM overlay 中。它们适合进入 VR 前、退出 VR 后、桌面调试时使用。

进入 `immersive-vr` 后，不能依赖这些 DOM 控件完成核心操作。当前代码没有把它们彻底隐藏，只是 `XrHud` 在 presenting 时禁用按钮，`PcPlayerControlsSimple` 由 `uiMode` 控制。这对调试可接受，但产品模式应该更明确：

```text
not presenting:
  DOM controls enabled
  3D UI optional preview

presenting:
  DOM controls ignored or hidden
  3D UI + controller input owns core workflow

exit VR:
  DOM controls restored
```

### 4. 3D 播放器按钮有些命令目前是 no-op

`HybridSkinPlayerBar` 会发出：

```text
player.previous
player.playPause.toggle
player.next
crop.start / crop.end
player.playbackRate.reset
player.recordingRate.reset
playlist.toggle
```

但 `PlayerV3.handleCommand` 目前只处理了其中一部分：

```text
已处理:
  player.playPause.toggle
  crop.start
  crop.end
  mask.*
  crop.autoRender.set
  player.seekTo

未处理或暂无实际效果:
  player.previous
  player.next
  player.playbackRate.reset
  player.recordingRate.reset
  playlist.toggle
```

所以当前 3D UI 上的 previous / next / rate / menu 看起来是按钮，但业务上不会产生效果。后续要么补齐命令处理，要么在 3D UI 上先禁用或移除这些按钮，避免误导。

### 5. 3D progress 当前只显示，不支持 seek

DOM 版 `PcPlayerControlsSimple` 的 progress 是 range input，可以 seek。3D 版只渲染 progress fill，没有对应的 drag / seek hit area。

这对播放器条的沉浸式可用性影响较大。VR 里如果没有 seek，用户只能播放 / 暂停，不能快速定位素材。

建议后续把 progress track 升级成 `XrSlider`：

```text
ray hit local x -> 0..1
dragstart -> 暂存 draft seek
dragmove -> 更新 preview
dragend -> player.seekTo(timeMs)
```

### 6. crop mask 的 React state 和 A-Frame shader state 还没有完全同步

`PlayerV3` 维护了：

```text
fov
maskCenter
maskOpacity
```

但 `XrCropMask` 当前只把 `opacity` 和 `sourceVideoId` 写进 A-Frame attribute：

```tsx
"crop-viewport-mask": `opacity: ${opacity}; sourceVideoId: ${sourceVideoId}`
```

`center` 和 `fov` props 没有传给 component。`cropMaskComponents.ts` 里真正控制 shader 的是 component 内部状态和 window events：

```text
webxr:crop-mask-center
webxr:crop-mask-fov
webxr:crop-mask-lock
webxr:crop-mask-opacity
```

而 `PlayerV3.handleCommand` 修改 React state 时没有 dispatch 这些事件。结果可能是：

```text
subtitle 显示 FOV 已变化
React state 也已变化
但 3D crop mask shader 仍保持自己的旧 fov / center
```

`opacity` 也有类似风险：A-Frame attribute 更新后，如果 component 没有 `update` lifecycle 主动同步 uniforms，shader 不一定会跟随 React prop 更新。

这是当前显示效果里最需要小心的一处：UI 状态和 3D 画面可能出现“看起来参数变了，但遮罩没变”的分裂。

### 7. native text 的字体和中文标题风险

`HybridSkinPlayerBar` 用的是 `a-text`：

```text
font: exo2bold / monoid
shader: msdf
```

英文短标签会比较稳定，但真实 `model.currentSource.title` 可能包含中文。A-Frame/MSDF 字体未必覆盖中文字符，可能出现方块、缺字或 fallback 风格不一致。

短期建议：

```text
1. 对 VR title 做 ASCII-safe fallback 或拼音/英文短名。
2. 中文标题保留在 DOM / 调试层。
3. 如果必须在 VR 内显示中文，单独准备 CJK bitmap/font atlas。
```

### 8. HTMLMesh skin 的 depth 设置可能导致空间遮挡不自然

当前 skin material 设置了：

```text
depthWrite = false
depthTest = false
```

这有助于避免 skin 被其他对象错误遮挡，但也可能让它在某些角度下表现为“总在前面”。如果后续 UI 和 crop mask、controller ray、视频球、其他面板同时存在，需要重新确认 renderOrder 和 depth 策略。

### 9. CommandBus 在 UI 和 3DUI 中有重复定义

当前存在两份结构几乎相同的 command bus：

```text
components/pc_editor/UI/PcEditorCommandBus.tsx
components/pc_editor/3DUI/commands/EditorCommandBus.tsx
```

`PlayerV3` 从 `UI` 导入 `PcEditorCommand`，`HybridSkinPlayerBar` 从 `3DUI/commands` 导入 `PcEditorCommand`。TypeScript 结构兼容，所以现在能工作。但后续如果两边命令 union 不同步，会出现 2D UI 和 3D UI 语义漂移。

建议把 command contract 收敛到一个 shared 位置，例如：

```text
components/pc_editor/commands
```

然后 `UI` 和 `3DUI` 都只 re-export，不各自维护。

## native-player 原型的价值

`native-player/SpatialNativePlayerBar.tsx` 没有在 `PlayerV3` 当前路径中使用，但它仍然有参考价值：

```text
优点:
  纯 A-Frame primitive
  native a-text
  root 挂到 main-camera，camera-relative 行为清楚
  证明了基本 spatial placement 和 command hit zone

缺点:
  视觉粗糙
  很难复刻 PC/CSS 的复杂玻璃质感
  同样还需要完整 controller ray 输入
```

因此当前 README 里的判断是合理的：native prototype 用来证明交互和摆放，不作为最终视觉方向；hybrid 方案更适合继续推进视觉质量。

## 建议的下一步

P0：补齐真实输入链路。

```text
在 AFrameScene 或 PlayerV3 scene 内增加 desktop cursor / Quest controller ray。
确保 .clickable hit planes 能收到 hover、pressed、click/select。
为 hit plane 增加可见 debug mode，验证命中区域和 skin 对齐。
```

P0：确定 spatial root 策略。

```text
如果播放器条要随用户视野:
  HybridSkinPlayerBar 挂到 #main-camera 或 camera-rig。

如果播放器条要固定在世界中:
  增加 recenter / summon / height calibration。
  不再写死 VR y = -0.49。
```

P0：修正 mask state 同步。

```text
React fov / center / opacity 改变时:
  dispatch webxr:crop-mask-* events
  或给 crop-viewport-mask 增加 update lifecycle
  或把 crop mask renderer 改成明确消费 props/store
```

P0：补齐或隐藏未实现命令。

```text
previous / next / rate / playlist 如果还没有业务实现，先在 3D UI 上禁用。
已经显示的按钮应该都能产生可观察效果。
```

P1：统一 command contract。

```text
把 PcEditorCommand 从 UI 和 3DUI 中抽到共享目录。
DOM UI、3D UI、keyboard、future VR ray adapter 都使用同一份类型。
```

P1：升级 progress 为 3D slider。

```text
让 3D 播放器条支持 seek。
这是沉浸式播放器从“可看”变成“可用”的关键一步。
```

P1：处理 VR 字体策略。

```text
英文 UI label 继续用 MSDF。
真实素材标题做长度、字符集和 fallback 处理。
中文 VR 文本需要单独字体资产或 bitmap atlas。
```

P2：把更多 2D 面板迁移为空间 UI。

当前 3DUI 只覆盖播放器条。workbench、effects、playlist、export prompt 仍主要停留在 DOM / PC 模式。后续应该按频率拆分：

```text
高频:
  play / pause
  record start / end
  cut
  fov
  lock / follow

中频:
  seek
  playlist
  source switch

低频:
  effects
  export
  session/debug
```

## 当前状态判断

现在的 v3 方向是“正确但未闭环”：

```text
已成立:
  DOM 不作为 immersive 核心 UI
  3D UI 已进入 A-Frame scene
  hybrid skin + native text 的显示路线合理
  slot layout 能控制对齐漂移

未闭环:
  Quest controller ray 输入
  camera-relative / world-space 定位策略
  mask state 与 shader state 同步
  所有按钮的真实命令效果
  progress seek
  字体和中文标题
  workbench/effects/export 的空间化
```

短期最值得优先做的是输入链路和空间定位。只要 3D UI 能在 Quest 里稳定看见、稳定点到、并且触发的状态和 3D 画面一致，后续再扩展视觉和面板规模才会比较稳。

## 2026-05-26 layout 同源实验

已在 `hybrid-player/SpatialPlayerLayout.ts` 和 `hybrid-player/HybridSkinPlayerBar.tsx` 先试了一版保守改法：

```text
spatialPlayerSkinRects
  -> 生成 HTMLMesh skin 的 CSS rect
  -> 推导 native text slot
  -> 推导 transparent hit plane slot
```

这一步的目标不是解决字体 metrics 的全部差异，而是先消除最容易漂的部分：skin 框、native text 锚点和 hit plane 不再各自维护一套 x/y/width/height。

随后已接入更硬核的运行时测量方案：skin DOM 内的关键视觉元素带 `data-skin-slot`，`HybridSkinPlayerBar` 在创建 HTMLMesh 前读取这些元素的真实 `getBoundingClientRect()`，再把测量结果转换成 native text 坐标。这样按钮框、标题框、rate 框等只要在 CSS skin 里移动或变宽，native text 锚点会跟着真实 DOM 框走。按钮类文本也显式补上了 `center` align，避免没有 align 的 `a-text` 按默认 left 行为从锚点向右生长。

### 文字偏右的实际发现

本轮实测反馈是：视频内容 / 标题类文本基本正常，但按钮上的 native text 明显偏右。这个现象说明问题不只是 skin/text 两层坐标不同源，也可能来自 text renderer 自己的默认对齐行为。

关键判断：

```text
按钮 text slot 的 x/y 本来落在按钮视觉中心附近。
但部分按钮 slot 没有显式传 align。
A-Frame a-text 在没有明确 center align 时，容易按 left 行为从锚点向右生长。
结果就是：锚点看似正确，字形整体却偏右。
```

对应修复：

```text
StyledText:
  align ?? "center"

PlayerText:
  slot.align ?? "center"
```

也就是说，后续所有未声明 `left` / `right` 的文本，都明确按中心对齐处理。标题、subtitle、current time、duration 这类需要左右对齐的文本继续显式声明 `left` 或 `right`。

这次反馈也验证了当前的修复顺序是合理的：

```text
1. 先修 native text align。
   解决“锚点正确但字形从锚点往右长”的问题。

2. 再让文字坐标跟真实 DOM skin 框走。
   解决“skin 框移动或变宽后，native text 仍停留在旧坐标”的问题。
```

当前结果：按钮文字偏右已经基本恢复正常。剩余风险主要不再是按钮中心锚点，而是不同字体 metrics 导致的细微宽度、高度和 baseline 差异。后续如果继续压精度，应优先做：

```text
按钮短标签:
  保持 center align。

长标题 / subtitle:
  增加 maxWidth、truncate 或 scale-down。

中英文混排:
  准备明确的 VR 字体 fallback 或单独字体 atlas。

调试:
  增加 text anchor / skin rect / hit plane debug overlay，截图比较偏差。
```

### 文本保护和 debug overlay

已补充两个继续稳定 hybrid layer 的小工具：

```text
Text maxChars:
  所有 spatialPlayerTextSlots 都增加 maxChars。
  PlayerText 渲染前统一 truncate，避免长素材名、按钮文案或状态文本撑出原本框位。
  但 maxChars 不能是拍脑袋的短值，必须按真实 skin rect 的可用宽度分配。titlePanel 是 760px 长条，标题不应该像小按钮一样只给 30 字符。

Debug overlay:
  URL 增加 ?debug3dui=1 时启用。
  紫色小方块显示 native text anchor。
  青色 wireframe plane 显示 transparent hit plane。
```

这个 debug overlay 的目的不是给最终用户看，而是给后续调版用。之后如果又出现“文字正常但 hit 区偏”“按钮框正常但文字上下偏”“某个 rate label 和框不一致”，可以直接打开：

```text
/xr/player-v3?debug3dui=1
```

然后看三层关系：

```text
HTMLMesh skin 框
native text anchor
transparent hit plane
```

如果紫色点在按钮中心但文字仍然偏，问题多半是字体 metrics / align / baseline。如果紫色点本身偏，问题在 DOM measurement 或 slot anchor。如果青色 hit plane 偏，问题在 hit rect，不在文字层。

### 视觉还原和透明度调整

在文字对齐稳定后，开始回到播放器组件本身的视觉还原。当前方向不是继续做更重的 neon primitive UI，而是向 PC 端 `player-ui-control-bar` 靠拢：

```text
PC player visual source:
  半透明玻璃底板
  细 cyan / magenta 边线
  轻扫光和低强度 scanline
  button 背景克制
  primary play 保留 cyan / magenta / orange 渐变
```

本轮 hybrid skin 调整：

```text
主底板:
  降低 rgba alpha，让 360 视频背景透出来更多。
  边框从厚 neon 改成细 cyan/magenta 玻璃边线。
  box-shadow 降低强度，保留轻微外发光和 inset 高光。

progress shell:
  背景更透明。
  border 从 2px 降为 1px。
  track 保留半透明灰底，让 native progress fill 更清楚。

row panel / rate / title:
  改成更轻的透明 button/panel 底。
  降低 cyan glow，避免像一块实心仪表板压在视频上。

record:
  保留红色危险语义，但降低红色面板实心感。

play button:
  保留渐变主按钮识别度。
  降低渐变 alpha 和 glow，和整体透明底板统一。
```

这轮的设计判断是：沉浸式播放器条应该像贴在视频前方的一层轻玻璃，而不是一块厚重的 HUD。透明度更高以后，VR 中对 360 内容的遮挡会更少，但仍保留足够的按钮边界和状态识别。

### 视觉差距的二次发现

进一步实看后发现，只降低背景 alpha 不够。上一版虽然更透明，但和 PC 播放器条仍有明显差距：

```text
缺少原播放器的磨砂玻璃层次。
边缘高光不够明显。
内部 panel 还是更像 3D 原型按钮，而不是 PC player-ui-control-bar。
transport / playlist 按钮用了 PREV / NEXT / MENU 文字，不像原组件的 icon button。
```

因此又补了一轮视觉还原：

```text
glass frost layer:
  增加 hybrid-glass-frost，用 radial gradient / repeating gradient 模拟磨砂雾面和轻噪声。

edge highlight:
  增加 hybrid-edge-top / hybrid-edge-bottom。
  顶部白色和 cyan 高光更接近玻璃边缘。
  底部保留弱 magenta / cyan 反光。

sheen:
  增加 hybrid-sheen，模拟播放器条上的斜向扫光。

button icon:
  previous / play-pause / next / settings / playlist 对齐 2D UI 的 icon 语义。
  不再依赖 unicode 字符和 A-Frame 字体字库，改用同一 native text layer 里的 geometry icon。
  深色按钮使用亮色 icon，播放按钮这种亮色渐变底使用深色反色 icon。
```

后续观察点：

```text
如果 Quest 上 icon 仍然有深度或遮挡问题：
  继续保留 geometry icon，但微调 icon layer z / material depthTest。

如果玻璃层太抢画面：
  降低 hybrid-glass-frost opacity，而不是继续降低主底板 alpha。

如果边缘高光过亮：
  优先调 hybrid-edge-top / bottom，不动文本和 hit plane。
```

### 背景色调专项回归

进一步反馈表明：当前最不像原 2D UI 的地方不是按钮或文字，而是播放器条大背景的色调。原 2D `player-ui-control-bar` 的识别点是：

```text
炫彩但不实心。
cyan / magenta / purple 叠出来的半透明玻璃底。
白色斜向扫光。
边缘有细高光。
背景不是纯透明，而是带紫色深色雾面。
```

因此本轮先不继续改按钮、图标或布局，只把 hybrid skin 的主背景公式拉回 PC 端基准：

```text
background:
  linear-gradient(120deg,
    rgba(255,255,255,0.12),
    transparent 18%,
    rgba(0,255,255,0.07) 58%,
    transparent
  ),
  linear-gradient(145deg,
    rgba(26,16,60,0.5),
    rgba(8,0,24,0.44)
  )

border:
  1px rgba(0,255,255,0.62)
  top 2px cyan
  bottom 2px magenta

shadow:
  0 24px 70px rgba(0,0,0,0.48)
  0 0 32px rgba(255,0,255,0.18)
  inset top white highlight
```

额外的 `hybrid-glass-frost` 也降低了 opacity，避免它把原本的紫 / cyan 玻璃色调洗掉。后续如果还觉得不像，应优先继续调主底板 `background`，暂时不要再分散到按钮、文本或 hit plane。

### 质感截图后的关键发现

对比 `C:\Users\Administrator\Desktop\质感.png` 后确认：上方 3D UI 的大框不是“透明度调得太低”这么简单，而是 `HTMLMesh` 的 DOM 到 canvas 过程没有完整浏览器渲染能力。

Three `HTMLMesh` 当前内置的简化 `html2canvas` 主要绘制：

```text
backgroundColor
border
text
image / canvas / input
```

它不会可靠绘制这些原 2D UI 依赖的效果：

```text
linear-gradient / radial-gradient
box-shadow
backdrop-filter
::before / ::after pseudo element
filter blur
```

这解释了为什么代码里已经写了很多玻璃渐变，但 Quest / WebXR 里看起来还是整块透明：这些 CSS 对真实浏览器 2D DOM 有效，但进入 `HTMLMesh` 纹理时大多没有被画进 canvas。

因此本轮把大背景从“CSS 玻璃层”改为“真实 canvas 像素底图”：

```text
<canvas class="hybrid-glass-canvas">
  由 Canvas 2D 绘制紫青深色底、cyan bloom、magenta bloom、顶部雾面、斜向扫光、scanline、圆角边缘高光。
```

`HTMLMesh` 会把 `HTMLCanvasElement` 当图片绘制，所以这条路径比继续堆 CSS 渐变稳定得多。后续如果还需要微调质感，优先调 `paintHybridGlassCanvas()` 里的颜色、alpha、扫光和边缘线，不要再把主要精力放在 CSS `background` / `box-shadow` / `backdrop-filter` 上。

### 透明度和局部质感二次修复

进一步观察后确认：只把大底板画成 canvas 还不够。第一版 canvas 底图偏实，透明感不够好；同时 progress shell、transport button、play button、rate panel 等局部仍然依赖 CSS gradient，所以按钮边缘高光、斜向扫光和炫彩播放条仍然还原不足。

本轮调整方向：

```text
整体底板：
  降低 canvas 深紫底的 alpha。
  保留 cyan / magenta 色雾，但让它更像薄玻璃反光，而不是实色 HUD。

DOM fallback：
  降低 .hybrid-progress-shell / .hybrid-row-panel / .hybrid-button-circle 的 background-color。
  避免 HTMLMesh 只绘制 backgroundColor 时把 canvas 玻璃层盖脏。

局部还原：
  在 paintHybridGlassCanvas() 里直接画 progress shell 的彩色 track。
  在 canvas 里画 button / panel 的圆角边、斜向高光和顶部细高光。
  play button 单独画 orange / magenta / cyan 的彩色玻璃填充。

动态播放进度：
  保留 A-Frame 原生 progress fill。
  增加 magenta glow、orange 前段、cyan fill 和 cyan 圆形亮点。
```

这个结构的边界是：静态皮肤质感放到 canvas，动态播放进度放到 A-Frame primitive。这样比每帧重绘 HTMLMesh 更稳，也不会重新破坏文字坐标和 hit plane 对齐。

### 背景层和按钮层分离

继续观察后发现：如果背景玻璃、progress、panel、button 都画在同一张 canvas 里，视觉层次会不够清楚，按钮会像背景底纹的一部分。按钮层应当明确压在背景层上面，并且按钮本身不能过度透明。

因此 skin canvas 拆成两层：

```text
hybrid-glass-canvas
  只画整体玻璃背景、色雾、scanline、外框高光。

hybrid-control-canvas
  单独画 progress shell / track、panel、button、button 斜向高光、play button 炫彩填充。
  DOM slot 后插入，保证它在背景层和基础 DOM slot 之上。
```

文字仍然保持 native A-Frame text 层，不进入 canvas。这样按钮视觉更像独立控件层，同时不影响前面已经校准好的文字坐标和 hit plane。

同时给所有 `spatialPlayerTextSlots` 补上 `maxChars`，统一经过 `truncateText()`。当标题、路径、按钮文案或状态文案超过 slot 预算时，一律显示省略号，避免长文本穿出真实 DOM skin 框。

### 按钮实底和文件名垂直校正

后续实看反馈表明：按钮层虽然已经分离，但视觉还没有回到原 2D player button 的基准。原 2D 按钮不是透明玻璃按钮，而是：

```text
深色实底 rgba(12, 2, 30, 0.68) 方向
cyan 边框
轻微 skewX(-10deg)
顶部 inset 高光
primary play button 使用实色 orange / magenta / cyan 渐变
```

因此 control canvas 的按钮绘制继续收敛：

```text
secondary button:
  改为不透明深色底。
  保留 cyan 边和轻微 glow。
  用 canvas transform 模拟 -10deg skew，文字仍保持 native text 不倾斜。

play button:
  改为不透明 #ff9900 / #ff00ff / #00ffff 渐变。
  保留白色边和 magenta / cyan glow。

solid action panel:
  record / rate / playlist / transport 也走更实的 button-like panel。
```

同时确认长文件名这一条 title 文本偏下，原因是 title slot 自身有单独的 vertical anchor。只把 title 的 `offsetY` 从 37px 收到 31px，subtitle 和其他文本 anchor 不跟着移动，避免重新破坏已对齐的文字层。

### 播放进度条归入按钮层

继续反馈后确认：progress 的动态部分如果继续用独立 A-Frame plane，会在视觉上脱离 control/button layer，看起来不像原 2D 播放条。原 2D progress 的实现更接近：

```text
底轨：rgba(255, 255, 255, 0.18)
已播放：orange / magenta / cyan 渐变，只覆盖 progress 百分比
thumb：白色圆点，cyan 边框和 cyan glow
```

因此本轮移除了 progress 的 A-Frame glow / fill / circle primitive，把动态 progress 也放进 `hybrid-control-canvas`：

```text
paintHybridControlsCanvas(host, progress)
  drawProgressGlass(context, progress)
  draw solid panels/buttons
```

因为 canvas 像素变化不会触发 `HTMLMesh` 的 MutationObserver，所以组件现在保存 `skinDomRef`，当 progress 像素宽度变化超过 2px 时重画 control canvas，并手动调用 HTMLTexture update。这样播放条属于按钮层，同时避免每一帧都重绘整张 HTMLMesh。

另外 `titlePanel` 后面的圆角块也明确归入 control/button layer。对应的两行 `video_training...` 文本整体额外上移：title `offsetY` 调到 25px，subtitle `offsetY` 调到 60px，只影响这个文件名区域。

### 播放条视觉还原

进一步针对 progress bar 做视觉回归：只还原原生 range input 的 8px 细轨会显得太像“一条线”，沉浸式播放器里需要更明显的炫彩进度条。

本轮改为播放器式彩色 capsule：

```text
progress shell:
  保留轻底板和轻高光，作为进度条所在槽位。

visual track:
  在 progressTrack slot 内居中画 22px 高的圆角胶囊。
  未播放部分是深紫 / 深青的实体槽，不再是纯透明线。
  已播放部分只覆盖 fillWidth，使用 #ff9900 / #ff00ff / #8adfff / #00ffff 高饱和渐变。
  已播放部分叠顶部白色高光，形成有体积的彩色条。

thumb:
  12px 半径，白色填充，cyan 描边和 glow。
```

这样进度条不再是一根细线，而是 control/button layer 里的主视觉彩色进度条；按钮背景仍保持深色不透明。

后续实看发现还有一条“细轨道”残留，来源有两个：

```text
DOM skin slot:
  .hybrid-progress-track 仍有 fallback background / box-shadow。

canvas highlight:
  drawProgressGlass() 里还有一条 stroke 形式的顶部高光。
```

这两处都已移除：

```text
.hybrid-progress-track:
  background: transparent
  box-shadow: none

canvas:
  不再画细 stroke。
  改为在 22px capsule 上铺整块面状玻璃高光。
```

此后 progressTrack DOM 只作为测量/布局 slot，不再贡献视觉；进度条视觉完全由 `hybrid-control-canvas` 负责。

### 文件名字体优化

`video_training...` 这类素材名最初单独尝试过 monoid / cyan glow 的 `title` tone，但实看后发现它和后面的 `START RECORD` 按钮字体不统一，而且 native text 的字宽再次超出了 titlePanel 范围。

因此最终回到和 `START RECORD` 一致的 `record` tone：

```text
font: exo2bold
letterSpacing: 2.6
emissiveIntensity: 0.52
glowOpacity: 0.32
```

为了避免同字体后再次溢出，title slot 曾经被过度收紧：

```text
maxChars: 30
scale: 0.142
width: 3.16
```

这和 2D UI 的实现不一致。2D 代码里 `.player-ui-title-block strong/span` 是真实 DOM 容器内的 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`，只有在标题超过 title block 宽度时才省略；它并没有给标题写死 30 字符。

因此 titlePanel 的 3D 规则改成：仍然用 native A-Frame text，不进入 canvas；仍然保留省略号作为安全边界；但省略预算按 760px titlePanel 分配，而不是按小按钮分配。

```text
title:
  maxChars: 46
  scale: 0.132
  width: 3.5

subtitle:
  maxChars: 58
  scale: 0.112
  width: 3.5
```

这样 `video_training...` 这类素材名会先吃满后面的长圆角块，只有真的接近穿出 titlePanel 时才 truncate。

## 阶段总结：视觉还原完成，交互闭环未完成

截至当前阶段，`/xr/player-v3` 的 immersive VR hybrid player bar 已经完成的是“视觉显示路径”的还原，而不是完整空间 UI 交互系统。

### 已完成范围

```text
2D UI -> 3D UI 的视觉迁移路径：
  使用 HTMLMesh 承载 skin。
  使用 native A-Frame text 承载清晰文字。
  使用 transparent A-Frame hit plane 预留交互层。

HTMLMesh 限制确认：
  Three HTMLMesh 的简化 html2canvas 不可靠支持 CSS gradient / box-shadow / backdrop-filter / pseudo element。
  因此不能继续依赖普通 CSS 复刻 2D 毛玻璃视觉。

canvas 分层视觉方案：
  hybrid-glass-canvas:
    负责整体玻璃背景、色雾、scanline、外框高光。

  hybrid-control-canvas:
    负责 progress、titlePanel、record/rate/list panels、settings button、transport buttons、play button。
    作为明确的按钮/control 视觉层，压在背景层上方。

文本层：
  native A-Frame text 独立在 skin 上方。
  title / subtitle / button text 坐标基于 DOM skin slot 测量。
  transport / settings / playlist icon 也是同一层的 geometry icon，避免字体缺 glyph。
  所有 text slot 都有 maxChars，但预算必须跟真实 rect 宽度一致；titlePanel 这种长条不能按按钮宽度提前省略。

播放器视觉：
  主背景具备半透明、紫青色雾、玻璃边缘高光。
  按钮层使用深色不透明底，接近原 player button 的 skew / cyan border / glow 风格。
  play button 使用不透明 orange / magenta / cyan 渐变。
  progress bar 已归入 control canvas，使用 22px 炫彩 capsule，而不是独立 A-Frame 细线。
  video_training... 文件名回到和 START RECORD 一致的 record 字体 tone，并按 titlePanel 长条宽度限制。
```

### 当前明确边界

下面这些还没有完成，不能把当前状态误认为完整空间 UI：

```text
按钮按下反馈：
  还没有真实 pressed / hover / active 状态视觉。
  目前按钮层主要是静态视觉还原。

按钮交互闭环：
  transparent hit plane 已存在，但 Quest controller ray 输入还没有完整闭环验证。
  还没有把每个按钮的 hover / down / up / cancel 状态和 canvas skin 视觉绑定起来。

空间 UI 移动：
  播放器条目前有 desktop / XR root position 切换。
  还没有完成用户可抓取、拖动、重新定位、吸附或跟随视角的空间 UI 移动系统。

合理的层级嵌套绑定：
  当前分层是视觉层级：
    glass canvas
    control canvas
    native text
    transparent hit planes
  但还没有形成统一的 spatial UI component tree / ownership / event binding 模型。

手柄射线阻挡：
  目前没有完善的 ray occlusion / blocking 策略。
  也就是说按钮面板是否应该阻挡后面的 360 视频、其他空间 UI 或编辑 gizmo，还没有完整定义。

状态同步：
  progress 已通过 repaint control canvas 实现视觉同步。
  但按钮 pressed、菜单 open、focus、disabled、record active 等状态还没有全部进入同一套 visual state machine。

可访问性和输入一致性：
  PC mouse / keyboard、Quest controller ray、可能的 hand tracking 还没有统一到一个输入抽象。
```

### 下一阶段建议

下一阶段不要继续大幅改视觉，应该进入交互架构：

```text
1. 定义 SpatialControlSlot：
   rect
   visual state
   command
   hit plane
   native text slots

2. 建立 control state machine：
   idle
   hover
   pressed
   active
   disabled

3. 让 Quest controller ray 事件闭环：
   ray enter
   ray leave
   trigger down
   trigger up
   cancel / lost focus

4. 绑定 visual repaint：
   control state 改变后只重画 hybrid-control-canvas。
   不重画 glass canvas。

5. 再处理空间 UI 移动：
   抓取根节点
   跟随/固定模式
   防遮挡策略
   与其他 editor 3D UI 的层级关系
```

当前结论：视觉还原已经基本可接受，可以作为下一阶段交互闭环的视觉基线。

## 通用视觉迁移方案：其他 2D UI 进入 3DUI 时怎么处理

播放器这轮验证后，可以把 2D UI -> immersive VR 3DUI 的视觉迁移固定成一套流程。核心原则是：不要假设浏览器 CSS 能原样进入 WebXR；先拆清楚视觉层、文字层、交互层，再决定每一层用 HTMLMesh、canvas、native text 还是 A-Frame geometry。

### 总体原则

```text
1. 先还原视觉结构，不急着复制 DOM 结构。
2. 复杂 CSS 视觉不要直接依赖 HTMLMesh。
3. 文本尽量用 native A-Frame text，而不是 HTMLMesh 文字。
4. 可点击区域用独立 transparent hit plane。
5. 动态视觉集中在最小 canvas 层重画，不重画整套 UI。
6. 所有位置必须回到统一设计坐标，而不是分散手调。
```

### 推荐分层

每个迁移进来的 2D UI，都按下面四层拆：

```text
Layer 1: background / glass layer
  用 canvas。
  负责大背景、毛玻璃假底、色雾、边缘高光、scanline、装饰光。
  通常是静态或低频变化。

Layer 2: control / component skin layer
  用 canvas。
  负责按钮、进度条、卡片、tab、slider、active 状态底色。
  有 hover / pressed / active 时，只重画这一层。

Layer 3: native text layer
  用 A-Frame text。
  负责标题、按钮文字、状态文本、数值。
  所有 text slot 必须有 maxChars / scale / width / align。

Layer 4: hit / interaction layer
  用 transparent A-Frame plane。
  负责 raycast、click、hover、pressed 命中。
  不承担视觉。
```

不要把所有东西塞进一个 HTMLMesh，也不要把所有东西都做成 A-Frame primitive。HTMLMesh 适合当 skin host，但不适合承担复杂浏览器渲染。

### HTMLMesh 能做和不能做

已验证 Three `HTMLMesh` 内部简化 html2canvas 大致可靠支持：

```text
backgroundColor
border
普通文本
image
canvas
input 的一部分基础绘制
```

不应依赖：

```text
linear-gradient / radial-gradient
box-shadow
backdrop-filter
filter blur
::before / ::after
mix-blend-mode
复杂 CSS transform 层叠
真实 DOM overflow ellipsis 视觉
```

因此迁移规则是：

```text
如果视觉依赖 gradient / shadow / blur / pseudo element:
  画进 canvas。

如果只是用于测量 rect / 保留 slot:
  DOM element 可以存在，但视觉 fallback 要透明或很轻。

如果文本需要清晰:
  不走 HTMLMesh，改 native A-Frame text。
```

### 设计坐标和 slot 规范

所有 UI 先定义一个设计坐标系，例如播放器现在是：

```text
skin width: 1820px
skin height: 245px
```

每个视觉组件必须有 slot：

```ts
type SpatialRectSlot = {
  left: number;
  top: number;
  width: number;
  height: number;
};
```

每类对象对应不同 slot：

```text
skin rect:
  视觉绘制区域，例如 button / panel / progress / tab。

text slot:
  native text anchor，必须带 align / width / scale / maxChars。

hit slot:
  raycast 命中区域，可以比视觉区域略大。
```

约束：

```text
视觉、文字、hit plane 不能各自手写坐标。
它们必须从同一组 skin rect 推导。
如果需要微调，也写成 slot anchor offset，不写散落魔法值。
```

### 文本迁移规则

文本是 2D UI 迁移到 VR 最容易出问题的部分。统一规则：

```text
1. 文字用 native A-Frame text。
2. 每个文本都有 maxChars。
3. 长文本按 slot 的真实可用宽度预算 truncate 为省略号。
4. 文件名 / 状态 / 按钮文字分别定义 tone。
5. 不允许依赖 CSS text-overflow。
6. 不允许让文本决定按钮尺寸。
```

推荐 tone：

```text
accent:
  顶部状态、品牌标签、系统标签。

record / primary:
  重要按钮标签，和 START RECORD 这种 CTA 保持一致。

mono / soft:
  数值、快捷键、副标题、状态描述。

geometry icon:
  transport / settings / playlist 控制图标。和文本同层，避免 Quest 字体缺 icon glyph。
```

文本对齐调试方法：

```text
?debug3dui=1
  紫色点：native text anchor
  青色框：hit plane
```

如果文字看起来偏：

```text
紫色点对，文字偏:
  font metrics / align / baseline 问题。

紫色点也偏:
  slot anchor / DOM measurement 问题。

按钮视觉对，hit 偏:
  hit slot 问题。
```

### Canvas 绘制规则

canvas 不应该随便画成一大坨。推荐拆为：

```text
static canvas:
  背景、玻璃、装饰。
  初始化时画一次。

control canvas:
  按钮、进度、active 状态。
  状态变化时重画。
```

动态更新原则：

```text
progress:
  只在像素宽度变化超过阈值时重画，例如 2px。

hover / pressed / active:
  只重画 control canvas。

背景:
  不随按钮状态重画。
```

因为 canvas 像素改变不会触发 HTMLMesh 的 MutationObserver，重画后必须：

```text
paintControlCanvas(host, state)
updateHtmlMeshTexture(mesh)
```

### 交互层迁移规则

视觉还原不等于交互完成。别的 UI 迁移进来时，每个 control 都应该定义：

```ts
type SpatialControlSlot = {
  id: string;
  rect: SpatialRectSlot;
  hitRect: SpatialRectSlot;
  textSlots: string[];
  command?: PcEditorCommand;
  state: "idle" | "hover" | "pressed" | "active" | "disabled";
};
```

后续交互闭环应统一处理：

```text
mouse click
Quest controller ray
trigger down / up
ray enter / leave
focus lost
disabled blocking
active state sync
```

当前播放器还没完成这些，只是视觉和基础 hit plane 先准备好了。

### 空间布局迁移规则

2D UI 变成 VR UI 后，要先决定它属于哪种空间模式：

```text
HUD-follow:
  跟随头部或相机，适合播放控制条。

World-anchored:
  固定在世界空间，适合场景标注、剪辑点、空间面板。

Object-anchored:
  绑定到某个视频、mask、gizmo 或编辑对象。

Grab-movable:
  用户可抓取移动，适合工作台面板。
```

目前 player bar 只是 root position 在 desktop / XR 间切换，还没有完整 grab / follow / anchor 系统。其他 UI 进入前要先选空间模式，否则后续层级和输入都会混乱。

### 迁移决策表

```text
大面积背景 / 毛玻璃:
  canvas static layer

按钮 / tab / slider / progress:
  canvas control layer

清晰文本:
  native A-Frame text

图标:
  使用 native layer geometry icon
  不依赖 unicode icon 字体

点击区域:
  transparent A-Frame plane

复杂动态图表:
  独立 canvas texture，不混进主 skin

3D gizmo / handle:
  A-Frame / Three geometry，不走 HTMLMesh

真实可拖拽空间面板:
  root entity + control slots + ray interaction state
```

### 新 UI 接入 checklist

新 UI 进入 `3DUI` 前，按这个顺序做：

```text
1. 截图标注原 2D UI 的视觉分层。
2. 定义设计坐标宽高。
3. 建立 skin rect / text slot / hit slot。
4. 判断哪些 CSS 效果必须 canvas 化。
5. 画 static background canvas。
6. 画 control canvas。
7. 接 native text，设置 maxChars。
8. 接 transparent hit plane。
9. 打开 debug3dui 检查 text / skin / hit 对齐。
10. 再接 hover / pressed / active 交互状态。
11. 最后接 Quest controller ray 和空间移动。
```

### 当前播放器对其他 UI 的价值

播放器这轮不是最终架构，但已经验证了几个关键结论：

```text
HTMLMesh 可以作为 skin host，但不能信任复杂 CSS。
canvas 是还原 2D UI 质感的主路径。
native text 是清晰文字的主路径。
DOM measurement 可以解决 text anchor 和真实 skin slot 对齐。
control canvas 可以承载动态视觉，但需要手动 texture update。
视觉层级必须和交互层级分开建模。
```

因此，后续其他 UI 进入 immersive VR 时，应复用这套分层和 slot 策略，而不是重新手写一套孤立的 3D 控件。

## 最小交互闭环尝试：在播放器 UI 上先做通

在视觉基线基本满意后，开始在最小播放器 UI 上补交互闭环，而不是直接扩展到全部空间 UI。

### 本轮新增能力

```text
control id:
  每个 hit plane 都绑定明确的 HybridControlId。
  visual canvas / hit plane / command 不再只是松散对应。

hover / pressed:
  hit plane 监听 mouseenter / mouseleave。
  同时监听 raycaster-intersected / raycaster-intersected-cleared。
  mousedown -> pressed。
  mouseup -> hover。
  click -> emit command。

control canvas repaint:
  hover / pressed 状态变化后，只重画 hybrid-control-canvas。
  不重画 glass canvas。

ray blocking:
  增加 hybrid-player-ray-blocker。
  覆盖整个播放器条，透明但可 raycast。
  按钮 hit plane 在 blocker 前面，优先命中按钮。
  非按钮区域命中 blocker，从而避免射线继续打到后方对象。

空间 UI 移动:
  titlePanel 现在同时作为最小 move handle。
  mousedown 时读取 ray/cursor intersection point。
  mousemove 时根据 world point delta 更新 root position。
  mouseup / leave 时结束拖拽。
```

### 当前实现边界

这仍然是“播放器内最小闭环”，不是完整空间 UI 框架：

```text
pressed 状态:
  已有视觉反馈，但还没有细分 trigger cancel / long press / disabled。

controller ray:
  依赖 A-Frame scene 已有 .clickable raycaster / laser-controls。
  还需要在 Quest 设备上实测 triggerdown/up 是否完整映射到 mousedown/up/click。

空间移动:
  当前是 titlePanel drag handle。
  只是按 intersection point delta 移动 root position。
  还没有 grab constraint、距离锁定、吸附、跟随头部、重置位置。

ray blocking:
  已有整条透明 blocker。
  还没有全局 z-order / modal / gizmo occlusion 策略。

层级绑定:
  已建立 HybridControlId 和 visual/hit/command 的对应。
  但还没有抽成通用 SpatialControlSlot registry。
```

### 下一步如果继续打磨

```text
1. 在 Quest 上验证事件序列:
   ray enter
   trigger down
   trigger up
   click
   ray leave

2. 如果 laser-controls 不稳定产生 click:
   需要在 controller triggerup 时读取当前 intersectedEl，手动派发 command。

3. move handle 需要增加:
   reset position
   clamp distance
   follow head / world fixed mode

4. control state 需要增加:
   disabled
   active
   command pending
   record active

5. 最后再抽象成通用 SpatialControlSlot。
```

当前结论：播放器已经从“视觉还原”推进到“最小可交互空间 UI 原型”，但 Quest controller 和全局空间层级还需要设备验证和架构化抽象。
