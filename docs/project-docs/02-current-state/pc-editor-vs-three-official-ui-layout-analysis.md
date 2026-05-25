# PC Editor 与 Three Official Interactive Lab UI 布局对齐分析

日期：2026-05-24

本文专门分析两个页面的 UI 布局关系：

```text
http://localhost:3001/xr/player
http://127.0.0.1:3001/xr/three-official-interactive-lab
```

目标不是要求两边代码一致。`/xr/player` 是 PC DOM/A-Frame 工作台，`/xr/three-official-interactive-lab` 是 Three.js + HTMLMesh 空间 UI。后者应该继续使用空间 UI 的写法，但整体视觉布局要向 PC editor 对齐。

## 一句话结论

`/xr/player` 当前的布局主语是：

```text
全屏 360 画面
+ 左侧编辑工作台
+ 右侧效果面板
+ 底部播放核心条
+ 底部左侧 XR/Meta 状态
+ 底部右侧 BGM 控制
+ 顶部左侧紧凑 session 状态
```

`/xr/three-official-interactive-lab` 当前的布局主语更像：

```text
全屏 Three.js canvas
+ 左前方竖向播放器面板
+ 正前下方大号编辑桌面
+ 正前方大号弹层
+ 顶部左侧较大的 debug HUD
+ 顶部空间 mode strip
```

这就是“复刻 PC editor 时整个布局大改变”的核心原因：three-official 页现在不是 PC editor 的左右侧栏 + 底部播放条构图，而是一个竖向 player + 桌面式主控台 + 大弹层构图。

后续要做的不是把 PC 的 DOM/CSS 直接搬过来，而是把 PC editor 的布局角色映射到 Three.js 的 HTMLMesh 空间面板上。

## 页面入口与实现边界

PC editor library 入口：

```text
apps/web/app/xr/player/page.tsx
apps/web/src/features/webxr/pc-editor/PcWebXrEditor.tsx
```

`/xr/player` 会渲染：

```text
<PcWebXrEditor pcWorkbench sourceMode="provided" ... />
```

核心 UI 由这些组件组成：

```text
PcPlayerControls
PcWorkbenchPanel
PcEffectsPanel
PcEffectPreview
PcBgmControls
PcEditorDebugState
AFrameEditorScene
```

Three official lab 入口：

```text
apps/web/app/xr/three-official-interactive-lab/page.tsx
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
```

它的 UI 不是普通屏幕 DOM 叠层，而是：

```text
隐藏 DOM 面板
-> new HTMLMesh(domElement)
-> InteractiveGroup
-> 放进 Three.js 3D 场景
```

所以这里的 CSS `width / height` 更像“HTMLMesh 纹理源尺寸”，真正的空间位置由 `playerMesh.position / rotation` 等 Three.js 参数决定。

## PC Editor 当前布局蓝图

PC editor 页面主舞台是全屏：

```text
<section className="aframe-sphere-stage" data-testid="aframe-video-sphere-player">
```

在 `pcWorkbench` 模式下，关键布局锚点来自：

```text
apps/web/src/features/webxr/pc-editor/ui/PcWebXrEditor.module.css
```

当前桌面视口 1365x768 下，实际测量结果大致是：

| 区域 | 位置/尺寸 | 布局角色 |
| --- | --- | --- |
| stage | x=0 y=0 w=1365 h=768 | 全屏 360 画面和遮罩舞台 |
| status strip | x=18 y=34 w≈196 h≈37 | 顶部左侧紧凑状态条 |
| left workbench | x=18 y=86 w=340 h≈498 | 左侧主编辑工作台 |
| right effects | x≈1007 y=86 w=340 h≈498 | 右侧效果面板 |
| bottom player | x≈336 y≈608 w≈573 h≈148 | 底部中间播放核心条 |
| bottom XR HUD | x=18 y≈610 w=300 h≈140 | 底部左侧 Meta/WebXR 入口状态 |
| bottom BGM | x≈927 y≈618 w=420 h≈132 | 底部右侧 BGM 控制 |

PC editor 的视觉重点是“中间画面保持干净，工具围绕画面边缘”。左右面板承担编辑功能，底部中间只承担播放/录制/速率/列表入口。

## Three Official 当前空间布局

Three official lab 的核心空间面板创建位置：

```text
playerMesh = new HTMLMesh(playerSource)
playerMesh.position.set(-0.76, 1.15, -1.3)
playerMesh.rotation.y = 0.26

htmlMesh = new HTMLMesh(source)
htmlMesh.position.set(0, 0.91, -1.4)
htmlMesh.rotation.x = -0.66

popupMesh = new HTMLMesh(popupSource)
popupMesh.position.set(0, 1.16, -1.66)
popupMesh.rotation.x = -0.9

statusMesh = new HTMLMesh(statusSource)
statusMesh.position.set(0, 1.55, -1.42)
statusMesh.rotation.x = -0.24
```

对应 DOM 源尺寸：

| DOM 源 | 当前尺寸 | 当前空间角色 |
| --- | --- | --- |
| `three-official-player-ui` | 330 x 640 | 左前方竖向播放器 |
| `three-official-source-ui` | 1000 x 300 | 正前下方编辑桌面 |
| `three-official-popup-ui` | 760 x 650 | 正前方大弹层/扩展面板 |
| `three-official-mode-strip` | 720 x 72 | 顶部空间状态条 |
| `three-official-hud` | 屏幕 DOM 约 560 x 234 | 左上角 debug HUD |

当前和 PC editor 的主要不一致：

1. PC 的播放控件是底部横向 rail；Three 页现在是左侧竖向 player panel。
2. PC 的主编辑区是左侧栏；Three 页现在是正前下方 1000x300 的桌面控制台。
3. PC 的效果区是右侧栏；Three 页没有稳定的右侧效果栏，而是依赖 module/popup。
4. PC 的 BGM 是底部右侧常驻；Three 页的 BGM 主要藏在 workflow popup 内。
5. PC 顶部状态很轻；Three 页左上角 debug HUD 偏大，会抢视觉。
6. Three 页的 popup 760x650 太大，打开时会改变主画面的视觉重心。

## 为什么不能直接复制 PC CSS

PC editor 的 CSS 大量依赖屏幕坐标：

```text
position: absolute
left / right / bottom
100vw / 100vh
calc(...)
z-index
```

但 HTMLMesh 的 DOM 源通常被放在屏幕外：

```text
position: fixed;
left: -12000px;
```

然后由 Three.js 把这块 DOM 渲成空间里的 mesh。也就是说：

```text
PC CSS 的 left/bottom = 屏幕上的位置
HTMLMesh 源 DOM 的 left/bottom = 纹理源排版，不等于空间位置
HTMLMesh 的 position/rotation/scale = 真正的空间位置
```

如果把 `.xr-session-player-ui`、`.xr-pc-workbench` 这类 PC 绝对定位样式直接塞进 Three 页，常见结果是：

```text
面板在纹理内部跑偏
HTMLMesh 采样到空白或超大区域
原本的空间面板比例被撑坏
z-index 预期失效
整个页面构图从空间 UI 变回屏幕叠层或混乱纹理
```

所以 three-official 页应该复刻“布局角色”和“视觉语言”，不应该复刻 PC 的定位方式。

## 建议的布局合同

Three official lab 要长得像 PC editor，可以按下面的空间角色重排。

| PC editor 角色 | Three official 建议写法 |
| --- | --- |
| 全屏 360 stage | 保持当前 Three.js canvas + video sphere + crop mask |
| 左侧 workbench | 新建或改造一个 340x500 左侧 HTMLMesh，放在用户左前方 |
| 右侧 effects | 新建 340x500 右侧 HTMLMesh，和左侧对称 |
| 底部 playback core | 把当前竖向 `three-official-player-ui` 改成 1000x160~190 横向底部 rail |
| 底部左侧 XR HUD | 作为小型空间/屏幕状态块，不能压过播放条 |
| 底部右侧 BGM | 做成常驻小面板，或并入底部 rail 右段 |
| 顶部状态 | 保留 `mode-strip`，减少左上 debug HUD 的视觉权重 |
| popup/module | 只作为二级扩展层，默认不改变主布局 |

建议目标构图：

```text
                 [ compact mode strip ]

  [ left workbench ]        video / crop mask        [ right effects ]

           [ XR status ]  [ playback core rail ]  [ BGM / session ]
```

这个构图和 PC editor 的“边缘工具 + 中央画面”一致，同时仍然是 Three.js 空间 UI。

## Three 页可采用的面板尺寸与空间锚点

这些数值不是最终设计，只是比当前构图更接近 PC editor 的起点：

```text
Playback rail:
  DOM size: 1000 x 170
  position: (0, 0.72, -1.34)
  rotation.x: -0.42 ~ -0.62
  role: 底部横向播放条

Left workbench:
  DOM size: 340 x 500
  position: (-0.82, 1.06, -1.32)
  rotation.y: 0.20 ~ 0.30
  role: 左侧编辑工作台

Right effects:
  DOM size: 340 x 500
  position: (0.82, 1.06, -1.32)
  rotation.y: -0.20 ~ -0.30
  role: 右侧效果面板

BGM/session mini panel:
  DOM size: 360 x 130
  position: (0.58, 0.68, -1.24)
  rotation.x: -0.45
  role: 底部右侧状态/音频

Mode strip:
  DOM size: 720 x 72
  position: (0, 1.55, -1.42)
  role: 顶部状态，可保留

Popup:
  DOM size: <= 620 x 420
  role: 二级扩展，不作为默认主面板
```

关键不是数值完全正确，而是视觉角色必须稳定：

```text
player 永远是底部 rail
workbench 永远在左侧
effects 永远在右侧
BGM/session 永远在底部右侧或 rail 右段
popup 永远是临时扩展
```

## 内容层如何对齐

`three-official-player-ui` 现在内容是竖向排列：

```text
chrome
progress
transport
source
rates
playlist
hide button
```

要接近 PC editor，应该改成底部横向组合：

```text
chrome: PLAYBACK_CORE // status
progress row: current / range / duration
control row:
  prev
  play/pause
  next
  title/source summary
  start/end recording
  play rate
  record rate
  options
  playlist
```

playlist 不应该占据常驻 player 大面积。它应该像 PC editor 一样作为从底部 rail 右侧弹出的列表，或在空间里作为临时右侧小面板出现。

`three-official-source-ui` 现在承担了 direct keys、module strip、FOV slider、readout。若要像 PC editor，应拆成：

```text
left workbench:
  framing buttons
  mask opacity
  crop workflow
  discard
  path stats

right effects:
  effect categories
  effect shortcuts
  effect queue/status

bottom/BGM:
  BGM selected track
  preview/play
  session music status
```

这样内容分布才和 PC editor 的信息架构一致。

## P0 改造顺序

第一步只做布局，不重写交互语义：

```text
1. 把 `three-official-player-ui` 从 330x640 竖向面板改成底部横向 rail。
2. 把 `three-official-source-ui` 从 1000x300 桌面改成左侧 340x500 workbench。
3. 新增右侧 `three-official-effects-ui`，先放 FX / effect log / module buttons。
4. 把 BGM/session 做成常驻小面板，或先并入底部 rail 的右侧。
5. 缩小或折叠 `.three-official-hud`，让它只做 debug，不参与主视觉。
6. 限制 `three-official-popup-ui` 默认尺寸，作为二级扩展，不遮挡中心 crop mask。
```

第二步再做内容和交互对齐：

```text
1. player rail 的按钮顺序对齐 PcPlayerControls。
2. workbench 的 section 顺序对齐 PcWorkbenchPanel。
3. effects panel 对齐 PcEffectsPanel 的分类结构。
4. BGM/session 面板对齐 PcBgmControls 的常驻状态。
5. 保留 `data-player-action` / `data-action` / `data-popup-action`，继续走 HTMLMesh + InteractiveGroup 事件。
```

## 验收标准

桌面预览应满足：

```text
中心视频和 crop mask 不被主面板遮住。
底部能一眼看到 PLAYBACK CORE。
左侧是 framing/workflow，右侧是 effects。
BGM/session 不再只藏在 workflow popup。
左上 debug HUD 不抢主视觉。
```

Quest / WebXR 预览应满足：

```text
面板在舒适视角内，不需要大幅转头才能找到播放条。
controller ray 能稳定命中底部 rail、左右面板和 popup。
打开 popup 时不遮住 crop frame 的主要观察区域。
文字在 HTMLMesh 上可读，不因为 DOM 源过大/过小而糊掉。
```

代码层应满足：

```text
不直接导入 PC CSS module 到 Three official 页。
不直接复用 PC 的 absolute viewport 定位。
可以复用颜色、chrome、按钮风格和信息架构。
空间位置继续由 HTMLMesh 的 position / rotation / scale 控制。
```

## 最重要的判断

`/xr/three-official-interactive-lab` 的代码不需要和 `/xr/player` 一样，但它的视觉布局应该遵守同一套产品构图：

```text
画面居中，工具靠边，播放在底部，编辑左右分栏，复杂功能进临时扩展。
```

只要 three-official 页继续是“竖向 player + 中央大桌面 + 大 popup”，它就会天然不像 PC editor；哪怕颜色、按钮文字和功能都复制过去，整体也会看起来是另一个应用。
