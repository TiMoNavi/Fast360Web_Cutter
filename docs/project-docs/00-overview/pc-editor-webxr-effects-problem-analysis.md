# PC Editor WebXR 特效系统规划与实现

关联清单文档：

```text
pc-editor-webxr-effects-catalog-and-roadmap.md
特效分类、特效列表、分类型实现思路，以及后端平面视频开源包调研。

pc-editor-webxr-panorama-projection-renderer-analysis.md
说明将 360 预览从球内摄像机升级为全景重投影渲染器的难点、mask 对位、后端一致性和 VR immersive 分流策略。
```

产品前提：

```text
PC Editor WebXR 的默认特效体验不是专业调参型剪辑软件。
核心目标是“看一遍就能剪”：用户在观看过程中只需按键、按住或点选预设。
duration、speed、direction、strength、curve、mask target 等复杂参数，第一阶段由预设和上下文自动决定。
高级参数编辑可以作为后续能力存在，但不能破坏默认无感剪辑主流程。
```

## 0. 当前正式实现情况

截至当前版本，PC Editor WebXR 的特效系统已经不再只是一个 UI 原型。它已经形成了第一版正式主链路，并以“按住型黑场”为范例打通了 PC 页面、VR/A-Frame 预览、状态池、事件总线、timeline patch 和后端导出渲染。

当前已落地的正式能力：

```text
后端特效 catalog：
  apps/api/app/effects/catalog.py
  apps/api/app/effects/models.py
  GET /api/effects/catalog

前端特效 catalog adapter：
  apps/web/src/components/pc_editor/effects/effectCatalogClient.ts
  apps/web/src/components/pc_editor/effects/usePcEditorEffectCatalog.ts
  PcEffectsPanelSimple 优先从后端 catalog 渲染分类、按钮和 payload。

特效输入状态机：
  apps/web/src/components/pc_editor/effects/input/effectShortcutStateMachine.ts
  apps/web/src/components/pc_editor/effects/input/useEffectShortcutBindings.ts
  支持 Tab -> 分类数字 -> 特效数字。
  支持按住型特效 keydown/keyup。
  忽略 key repeat，Space 不被特效状态机吞掉。

交互适配层：
  apps/web/src/components/pc_editor/interactions
  负责把 keyboard、wheel、flat UI、spatial UI、VR ray/controller/headset 等真实输入翻译成 PcEditorEventBus 事件。
  不直接调用兄弟组件，不直接写 timeline，不直接知道渲染实现。

Player V2 页面级快捷键守卫：
  apps/web/src/components/pc_editor/Aframe/player-v2/PlayerV2.tsx
  捕获 Tab，禁用浏览器默认焦点切换。
  relay Tab / 1..6 / Escape 到特效输入状态机。

运行时状态池：
  apps/web/src/components/pc_editor/state/runtimeStateStore.ts
  保存 playback、viewTarget、cropMask、maskViewportBounds、sphereView、cameraPose、input、effectInput、xrSession 等共享实时状态。

Mask controller 状态广播：
  mask controller 持续写入 crop mask 和 maskViewportBounds。
  特效预览不直接 import mask controller，而是从状态池读取当前遮罩/视口范围。

PC DOM 黑场预览：
  PcEffectPreview
  读取 effectInput 和 maskViewportBounds。
  黑场类效果使用 viewport-mask target，不再默认盖住全屏 UI。

VR/A-Frame 黑场预览：
  AFrameViewportMaskEffectPreview
  黑场预览进入 A-Frame scene，不依赖 DOM overlay。
  VR 侧通过 effectInput 和 PcEditorEventBus 驱动 preview entity。

后端渲染：
  apps/api/app/rendering/effect_registry.py
  apps/api/app/rendering/effect_handlers.py
  transition.fade_black 和 black.solid 已进入 render-test 输出链路。

E2E 验证：
  apps/web/e2e/player-v2-effects-render.spec.ts
  覆盖 PC 真实像素、Tab 1 1、Web 黑场/白场预览、A-Frame VR 预览实体、固定运镜前端 ViewPath 写入、Impact shake 多关键帧 ViewPath、FX speed 对运镜时长的影响、后端 MP4 黑场/白场/运镜/柔焦/RGB split 输出。
```

当前应该视为“正式范例”的部分：

```text
按住型黑场 black-fade
  类型：viewport-mask 遮挡 / 转场类 hold effect
  输入：UI / keyboard / VR controller
  实时状态：playback、viewTarget、maskViewportBounds、effectInput
  前端预览：PC DOM viewport-mask + A-Frame XR viewport-mask
  输出：EffectEventsPatch -> transition.fade_black
  后端：apply_fade_black

按住/短按型白场 white-fade / flash-cut
  类型：viewport-mask 闪白 / 转场类 hold 或 preset effect
  输入：PC keyboard / UI / VR controller
  实时状态：playback、viewTarget、maskViewportBounds、effectInput
  前端预览：PC DOM viewport-mask + A-Frame XR viewport-mask
  输出：EffectEventsPatch -> transition.flash_white
  后端：apply_flash_white

短按型固定运镜 hero-push / reveal-pull / drift-left-parallax
  类型：360/VR 运镜 / viewport path preset
  输入：PC keyboard / UI
  实时状态：playback、viewTarget、cropMask
  前端预览：遮罩中心/FOV 变化，透过遮罩看到真实画面运动
  输出：ViewPathPatch -> frame.hero_push / frame.reveal_pull / frame.drift_left_parallax 的编译结果
  后端：viewport path remap

短按型冲击抖动 impact-shake
  类型：360/VR 运镜 / viewport path preset
  输入：PC keyboard / UI
  快捷键：Tab -> 4 -> 4
  实时状态：playback、viewTarget、cropMask
  前端预览：遮罩中心 yaw/pitch 快速往返抖动并回到起点
  输出：ViewPathPatch -> frame.impact_shake 的多关键帧编译结果
  后端：viewport path remap

短按型柔焦 soft-blur
  类型：滤镜 / post_remap_frame
  输入：PC keyboard / UI
  快捷键：Tab -> 2 -> 6
  输出：EffectEventsPatch -> filter.blur
  后端：apply_blur

短按型故障 RGB split
  类型：故障 / post_remap_frame
  输入：PC keyboard / UI
  快捷键：Tab -> 5 -> 1
  输出：EffectEventsPatch -> filter.chromatic_aberration
  后端：apply_chromatic_aberration
```

当前仍不应误认为已经完成的部分：

```text
不是所有 catalog 里的 effect 都有完整后端像素级 handler。
不是所有特效类型都有专用 preview adapter。
DomMaskViewportPreviewAdapter 仍可以继续提高精确度。
XrMaskViewportPreviewAdapter 当前以黑场/白场范例为主，尚未覆盖所有转场、滤镜、图层、VR 空间类特效。
小行星 / Tiny Planet 已从普通运镜范例中移出；它需要 stereographic projection / 全景重投影，不应再伪装成普通 FOV 运镜。
图层、音频、速度、复杂扭曲、datamosh 等类型还需要独立 contract。
后端 catalog 是当前正式来源，长期仍可演进为前后端共享的机器可读 spec。
```

因此，本文档后续所有规划都以当前黑场实现为蓝本，但不会强行把所有特效都套成黑场模式。黑场只是“viewport-mask 遮挡类 hold effect”的标准样例。

## 1. 我们遇到的问题

特效系统不是普通 UI 功能。它同时跨越：

```text
UI 面板
键盘快捷键
VR 手柄和 ray 交互
事件总线
运行时状态池
timeline / effect queue
PC DOM 预览
WebXR / A-Frame 沉浸式预览
后端平面渲染
最终 MP4 导出
版本兼容
```

我们已经遇到或提前识别了这些问题。

### 1.1 前后端定义容易漂移

如果前端维护一套特效列表，后端再维护一套渲染列表，很快会出现：

```text
前端按钮存在，但后端不支持。
后端支持 eventName，但前端没有入口。
同一个 effectId 在前后端参数名不同。
前端 label / key / duration 与后端真实渲染行为不一致。
旧 session 里的 effect event 无法稳定回放。
```

这类错通常不会在 UI 层暴露，而是在导出阶段才出现。

### 1.2 WebXR 预览空间和后端导出空间不同

Player V2 的前端预览发生在 WebXR / A-Frame 里：

```text
360 equirectangular video
  -> sphere texture
  -> camera / mask / viewport
  -> 用户在 PC 页面或 VR 头显里观察
```

后端导出发生在平面帧里：

```text
360 equirectangular source
  -> 根据 ViewPathPoint remap
  -> 得到 16:9 planar frame
  -> 应用 frame effect / overlay / filter
  -> 编码 MP4
```

所以同一个词在两个空间里不一定是同一件事：

```text
blur:
  WebXR 可做 sphere 或 viewport 近似预览。
  后端通常对 remap 后的 16:9 frame 做模糊。

vignette:
  WebXR 里可能围绕当前视口中心。
  后端导出里通常围绕最终平面帧中心。

glitch:
  WebXR sphere UV 上做会产生球面空间扭曲。
  后端 frame 上做是屏幕空间效果。
```

### 1.2.1 重要坑：球内摄像机不是小行星投影

当前 mask controller 的“透过遮罩看画面”模型，本质是常规 360 剪辑里的 `rectilinear reframe`：

```text
360 equirectangular video
  -> sphere
  -> virtual camera inside sphere
  -> yaw / pitch / fov
  -> 16:9 平面画面
```

这不是错，反而是普通 360 剪辑最基础、最常见的方法。它适合：

```text
普通取景
镜头移动
推近 / 拉远一点
平移 / 俯仰
稳定跟拍
常规 16:9 导出
```

但它不能靠继续放大 FOV 变成小行星。原因是普通透视投影的核心近似为：

```text
ray = normalize(vec3(
  x * tan(fov / 2),
  y * tan(fov / 2),
  -1
))
```

当 `fov` 接近 180 度时：

```text
tan(fov / 2) -> infinity
```

所以画面边缘会无限拉伸。这个现象不是实现 bug，而是普通透视投影的数学结果。

小行星 / Tiny Planet 通常是另一类投影：

```text
stereographic projection
little planet projection
fisheye / polar reprojection
```

它的思路不是“相机在球内截图”，而是：

```text
output pixel
  -> stereographic inverse
  -> sphere direction
  -> equirectangular uv
  -> sample video
```

简化公式：

```text
p = screen.xy
r = length(p)
phi = atan2(p.x, p.y)

theta = 2 * atan(r / scale)

direction.x = sin(theta) * sin(phi)
direction.y = -cos(theta)
direction.z = sin(theta) * cos(phi)
```

直觉：

```text
屏幕中心采样地面 / 脚下。
越往外圈，采样方向越抬高。
最外圈逐渐采到天空。
最终地面形成球，天空成为环。
```

因此，后续不能把小行星当成 `viewTarget.fov = very large`。正确建模应该是：

```text
普通剪辑 / 运镜：
  ViewPath / Mask
  yaw, pitch, fov
  rectilinear projection

小行星 / 鱼眼 / 兔子洞：
  ProjectionEffect / ProjectionViewState
  projection: stereographic | fisheye | little-planet
  yaw, pitch, roll, scale
```

两者没有绝对优劣，只有适用场景不同：

| 模型 | 优点 | 缺点 | 适合 |
| --- | --- | --- | --- |
| 球内摄像机 / rectilinear reframe | 直观、常规、符合人眼/相机取景；和 VR immersive 自然一致；mask controller 容易理解 | FOV 大时边缘拉伸；不能自然生成小行星 | 普通剪辑、常规运镜、选景、跟拍、VR 预览 |
| stereographic / little planet projection | 能生成地面成球、天空成环、鱼眼/兔子洞等 360 特色效果；更接近专业 360 特效 | 坐标公式不同；mask 对位更难；VR immersive 里不等价于真实球内观察 | 小行星、鱼眼、360 特色转场、投影变形类特效 |

当前结论：

```text
小行星不是做不了。
但它不应该继续沿用“球内摄像机 + 超大 FOV”的实现。
它应该作为 projection effect 独立设计，先做 PC PanoramaProjectionRenderer demo，再做后端 projection remap 对齐。
```

小行星问题还暴露了一个更具体的建模问题：`FOV` 不能承担所有 360 预览语义。

```text
viewTarget.fov / cropMask.fov：
  表示遮罩本身的裁剪视场角。
  会进入 ViewPathPatch。
  后端 rectilinear 导出依赖它决定最终 16:9 画面从 360 源里取多宽。

sphereView.fov：
  表示前端用户眼前的 360 球内摄像机预览视场角。
  只适合普通 rectilinear 预览。
  不直接写入后端 timeline。

ProjectionViewState：
  表示 stereographic / fisheye / little-planet 这类投影重映射。
  需要 projection、yaw、pitch、roll、scale 等参数。
  未来如果要让滚轮连续进入小行星，应调整 projection scale，而不是继续放大 camera fov。
```

因此，小行星不能再被建模为下面这种临时组合：

```text
viewTarget.fov 拉大
  + sphereView.fov 拉大
  = little planet
```

这只能得到“超广角边缘拉伸”，不能得到真正的地面成球、天空成环。

因此每个特效都必须声明 preview accuracy：

```text
exact       前后端应接近像素一致
approximate 前端只表达体感和方向
symbolic    前端只提示“该效果已触发”
unsupported 前端不预览
```

### 1.3 DOM overlay 不能代表 VR 沉浸模式

PC 页面里的 DOM overlay 进入 WebXR immersive session 后通常不会显示在 Quest/Meta 头显中。头显里看到的是 WebXR scene。

这意味着：

```text
PC DOM preview 可以服务桌面页面。
VR 沉浸模式必须有 A-Frame / WebXR preview adapter。
同一个 effectId 可以有不同 preview adapter，但业务语义不能分叉。
```

黑场问题正是从这里暴露出来的：PC 页面能看到 DOM 黑场，不代表 VR 头显能看到。

### 1.4 黑场最初表现为全屏遮挡，语义不对

黑场、白场、blur、vignette 这类最终作用在导出画面上的特效，正确 target 应该是当前裁剪视窗或遮罩范围，而不是整个浏览器页面。

错误表现：

```text
黑场盖住整个网页。
控制条、effects panel、workbench panel 都被遮住。
VR 里没有对应反馈。
用户无法判断最终导出范围。
```

正确语义：

```text
黑场作用在 viewport-mask。
PC 页面用 DOM viewport-mask 预览。
VR 头显用 A-Frame viewport-mask 预览。
最终导出由后端在平面 frame 上应用。
```

### 1.5 浏览器默认快捷键会干扰剪辑快捷键

`Tab` 默认会移动浏览器焦点。最初用户按 `Tab 1 1` 时，浏览器焦点切换会干扰特效状态机。

正确规则：

```text
Player V2 页面内捕获 Tab。
Tab 禁用浏览器默认 focus traversal。
Tab 仍然进入特效快捷键状态机。
不要 stopPropagation 到让特效系统收不到事件。
```

当前实现已经收敛为 effect input adapter，不再依赖 window CustomEvent relay：

```text
真实键盘事件
  -> useEffectShortcutBindings
手柄 / 屏幕 UI
  -> editor.effects.shortcut.open / key.down / key.up
  -> useEffectShortcutBindings
  -> runtime effectInput
  -> PcEditorEventBus / workflow
```

### 1.6 暂停期间操作不能靠伪造 +1ms 采样解决

曾经讨论过“如果视频时间没推进，强制让采样时间 +1ms，避免 replaceRange 覆盖前一个点”。这个策略不正确，因为它把用户没有推进时间的操作伪装成真实视频时间推进。

当前正确策略：

```text
如果强制采样时视频时间没变，且状态也没有形成新的有效锚点：
  不伪造 +1ms。
  不制造假时间点。

如果用户是在 hold effect 期间暂停并切视角：
  用明确的 ViewPathRange 表达这段视角变化。
  用同一时间范围的 EffectEventsPatch 表达黑场遮挡。
```

也就是说，暂停本身不是后端特殊状态；暂停只会停止前端动作和 timeline 流式推进。暂停期间如果用户做了明确编辑动作，再由前端 workflow 编译成明确 timeline 数据。

### 1.7 暂停、播放倍速、录制倍速、视效倍速必须分清

正式机制单独见：

```text
docs/project-docs/00-overview/pc-editor-webxr-speed-clock-mechanism.md
```

本节只保留特效系统需要遵守的摘要。系统应分成三种速度：

| 速度 | 本质含义 | 对前端预览的影响 | 对后端 timeline / 导出的影响 |
| --- | --- | --- | --- |
| 播放倍速 | 用户观看和操作时的视频播放速度；子弹时间就是播放倍速固定 0.1 | 视频、前端特效动作、自动运镜 preview 跟随变慢/变快 | 不直接改变成片时长，不写 segment speed |
| 录制倍速 | 录进成片的原片变速 | 默认不改变当前观看速度，除非进入“按成片速度预览”模式 | 必须写入 timeline speed segment，改变 source time -> output time 映射 |
| 视效倍速 | 所有特效和预设运镜的基础时间倍率 | 改变 fade、flash、shake、hero-push 等动作节奏 | 进入 effect spec / effect event / ViewPath compiler，用于拉长或压缩特效自身持续时间 |

暂停不是第四种速度，而是运行门闸：

```text
paused = true：
  video currentTime 不推进。
  前端特效动作不推进。
  自动运镜 preview 不推进。
  timeline 流式采样不推进。
  不伪造 +1ms。
  不等价于 recordingSpeed = 0。
  不等价于 effectSpeed = 0。
```

特效 preview 的基础合成规则：

```text
if paused:
  effectiveEffectPreviewRate = 0
else:
  effectiveEffectPreviewRate = playbackSpeed * effectSpeed
```

这意味着：

```text
子弹时间：
  playbackSpeed = 0.1。
  解决用户反应不过来的问题。
  特效和运镜 preview 也随之变慢。
  不改变后端 timeline。

录制慢动作：
  recordingSpeed = 0.5。
  解决“这一段原片在成片里要慢放”的问题。
  必须进入 timeline speed segment。

拉长特效：
  effectSpeed = 0.5。
  解决“黑场、闪白、运镜等视效动作要更慢更长”的问题。
  不改变原片速度。
```

防错规则：

```text
不要把 playbackSpeed 写入 timeline speed segment。
不要把 bullet time 当作录制慢动作。
不要用 recordingSpeed 改 HTMLVideoElement.playbackRate，除非用户显式进入“按成片速度预览”模式。
不要用 pause 表达 freeze frame；freeze frame 是独立时间类特效。
不要用 effectSpeed 改变原片 sourceDuration -> outputDuration 映射。
不要在事件 payload 中只写 rate；必须写 playbackSpeed、recordingSpeed 或 effectSpeed。
```

### 1.8 特效数量会很多，事件名不能爆炸

如果每个特效都新增一个事件：

```text
editor.effects.blackFade.add
editor.effects.whiteFade.add
editor.effects.rgbSplit.add
editor.effects.scanTear.add
...
```

事件层会变成按钮表，后续无法维护。

正确方向：

```text
通用选择事件：
  editor.effects.select

按住型连续输入：
  editor.effects.hold.start
  editor.effects.hold.end

少数有独立业务语义的类型再新增专用事件：
  editor.effects.params.set
  editor.effects.remove
  editor.effects.bgm.set
```

特效 catalog 决定“有哪些特效”，事件系统只表达“发生了什么动作”。

### 1.9 兄弟组件不能互相 import 和调用

后续特效会越来越多。如果每个特效都直接 import PlayerV2、PcEffectsPanelSimple、timelineBridge、mask controller 或其它兄弟特效，系统会迅速失控。

组件扩展原则：

```text
父组件装配子组件。
子组件通过 props、context、event emit 或 state model 通信。
兄弟组件不能互相 import、互相调用或知道彼此内部实现。
实时变化且需要跨组件访问的值进入状态池。
动作表达走事件总线。
导出语义由 workflow 编译成 patch。
```

## 2. 当前整体架构

当前 Player V2 特效系统的正式链路可以拆成九层。

```text
Catalog / Spec Layer
  -> Interaction / Input Layer
  -> Event Layer
  -> Runtime State Pool
  -> Workflow / Compiler Layer
  -> Timeline Data Layer
  -> Backend Bridge / Transport
  -> Backend Renderer
  -> Preview Adapters
```

### 2.1 Catalog / Spec Layer

当前正式来源在后端：

```text
apps/api/app/effects/catalog.py
apps/api/app/effects/models.py
GET /api/effects/catalog
```

它提供：

```text
effectId
categoryId
label
key
eventName
durationMs
default params
render stage
backend support
fallback policy
preview mode
preview target
UI operation payload
```

前端读取位置：

```text
apps/web/src/components/pc_editor/effects/effectCatalogClient.ts
apps/web/src/components/pc_editor/effects/usePcEditorEffectCatalog.ts
apps/web/src/components/pc_editor/UI/PcEffectsPanelSimple.tsx
```

迁移期允许 fallback：

```text
PcEffectsPanelSimple 内部 fallback categories
apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts
```

但 fallback 只能用于接口不可用或旧 payload 兼容，不应该作为长期主定义来源。

### 2.2 Interaction / Input Layer

输入来源包括：

```text
UI tile click
键盘 Tab / 数字键 / Escape
鼠标滚轮 / pointer gesture
平面 UI click / change
3D / spatial UI click
VR controller button
VR ray target
头显姿态 / controller pose
未来的 hand tracking
```

当前关键实现：

```text
interactions/useKeyboardEventBindings.ts
interactions/playerV2KeyboardBindings.ts
interactions/useSphereFovWheelBinding.ts
interactions/useVrRayEventBinding.ts
effects/input/effectShortcutStateMachine.ts
effects/input/useEffectShortcutBindings.ts
UI/usePcEditorUiEventEmitter.ts
AFrameViewportMaskEffectPreview.tsx
```

职责边界：

```text
interaction adapter：
  把真实输入翻译成 PcEditorEventBus 事件。
  必要时写 input pressed 状态。
  不直接写 timeline。
  不 import 兄弟 preview / renderer / mask controller 内部实现。

workflow：
  订阅事件。
  根据状态池 snapshot 和 catalog spec 写状态池或 timeline patch。

runtime state pool：
  保存实时值，例如 viewTarget.fov、maskViewportBounds、sphereView.fov、pressed keys。
```

例如 Player V2 滚轮：

```text
wheel
  -> interactions/useSphereFovWheelBinding
  -> editor.sphere.fov.step
  -> usePlayerV2EditorPreviewWorkflow
  -> sphereView.fov
  -> A-Frame camera 读取并预览
```

平面 UI 和 3D UI 也必须走同一条语义事件链。旧的 `3DUI/commands` 只作为兼容桥，不作为新增能力的主 contract。

特效快捷键状态机规则：

```text
idle
  Tab -> category

category
  1..6 -> effect(category)
  Escape -> idle

effect(category)
  1..6 keydown -> selected 或 holding
  Escape -> idle

holding(effect, key)
  same key keyup -> hold.end
  Escape -> cancel / end
  Space -> pass through，不结束 hold
```

### 2.3 Event Layer

正式事件入口保持少量、稳定：

```text
editor.effects.select
editor.effects.hold.start
editor.effects.hold.end
ui.panel.effects.category.toggle
ui.panel.effects.collapse.set
```

黑场从键盘进入时：

```text
Tab -> 1 -> hold 1
  -> editor.effects.hold.start

release 1
  -> editor.effects.hold.end
```

黑场从 VR 进入时：

```text
A button down / X button down
  -> editor.effects.hold.start

A button up / X button up
  -> editor.effects.hold.end
```

事件只表达动作，不直接写后端、不直接操作 A-Frame、不直接改 sibling UI。

### 2.4 Runtime State Pool

状态池保存跨模块共享的实时值：

```text
playback.currentTimeMs
playback.isPlaying
playback.durationMs
viewTarget.center
viewTarget.fov
viewTarget.locked
cropMask.center
cropMask.fov
cropMask.maskOpacity
maskViewportBounds.corners
maskViewportBounds.screenRect
sphereView.fov
cameraPose
xrSession
input.keyboard / input.controls pressed
effectInput
```

规则：

```text
实时变化且需要多组件访问的值，进入状态池。
只属于一个 UI 组件的折叠、hover、modal visible，可留在本地 state。
catalog / config 是静态配置，不属于状态池。
事件总线负责“发生了什么”。
状态池负责“现在是什么值”。
```

黑场预览读取：

```text
effectInput
maskViewportBounds
playback
viewTarget
```

小行星 / 投影类预览后续可能额外读取：

```text
projectionMode
projectionScale
sphereView.fov
```

其中 `viewTarget.fov` 是遮罩/导出取景 FOV，`sphereView.fov` 是球内摄像机预览 FOV。两者不能合并；Tiny Planet 还需要 projection scale / projection mode，不能再靠继续放大 `viewTarget.fov` 实现。

mask controller 写入：

```text
cropMask
maskViewportBounds
viewTarget 相关值
```

因此特效不需要 import mask controller。

### 2.5 Workflow / Compiler Layer

workflow 订阅 `editor.effects.*`，读取 catalog spec 和状态池 snapshot，把动作编译成标准输出。

当前黑场输出：

```text
EffectEventDraft
  eventName = transition.fade_black
  startMs
  endMs
  params
  renderPolicy

必要时：
ViewPathRangeDraft
  startState
  endState
  interpolation = fast
```

重要规则：

```text
UI 不写 timeline。
键盘 hook 不写 timeline。
A-Frame component 不写 timeline。
workflow 是事件转业务语义的唯一入口。
```

### 2.6 Timeline Data Layer

当前标准 patch：

```text
EffectEventsPatch
ViewPathPatch
PlaybackClientState
```

黑场和切视角是两条轨道：

```text
黑场：
  EffectEventsPatch

视角：
  ViewPathPatch / ViewPathRange
```

它们可以时间范围一致，但不能互相改写。

### 2.7 Backend Bridge / Transport

网络发送只允许出现在：

```text
components/pc_editor/backend
components/pc_editor/transport
src/lib/api.ts
```

禁止出现在：

```text
UI button onClick
effect preview component
keyboard hook
VR target
A-Frame entity
```

当前 effect events API：

```text
POST /api/cut-sessions/:sessionId/effect-events
```

### 2.8 Backend Renderer

后端负责最终导出真相：

```text
apps/api/app/rendering/effect_registry.py
apps/api/app/rendering/effect_handlers.py
apps/api/app/rendering/effect_runtime.py
apps/api/app/rendering/effect_policy.py
```

当前已验证：

```text
transition.fade_black
black.solid
```

后端职责：

```text
规范 eventName
验证 params
处理 conflictGroup / priority / fallback
在正确 render stage 应用效果
输出确定性的 MP4 结果
```

### 2.9 Preview Adapters

预览不是导出真相，只是当前运行时反馈。

当前已落地：

```text
PC:
  PcEffectPreview
  DOM viewport-mask 黑场预览

VR / A-Frame:
  AFrameViewportMaskEffectPreview
```

长期目标：

```text
DomScreenPreviewAdapter
DomMaskViewportPreviewAdapter
XrMaskViewportPreviewAdapter
XrSphereOverlayPreviewAdapter
XrWorldLayerPreviewAdapter
```

DOM overlay 与 XR overlay 可以完全不同实现，但必须解释同一份 effect spec，读取同一份状态池，触发同一套事件。

## 3. 我们如何逐项解决问题

| 问题 | 当前解决方案 | 当前状态 |
| --- | --- | --- |
| 前后端定义漂移 | 后端提供 `/api/effects/catalog`，前端优先读取 catalog 生成面板和 payload | 已作为当前正式来源，仍保留 fallback |
| 事件名爆炸 | 使用 `editor.effects.select` 和 `editor.effects.hold.start/end`，effectId 放 payload | 已落地 |
| Tab 被浏览器焦点切换吞掉 | Player V2 捕获 Tab，禁用默认行为，并 relay 到特效状态机 | 已落地并验证 |
| 数字键 hold 手感不稳 | `useEffectShortcutBindings` 独立处理 Tab -> 分类 -> 特效 -> holding，忽略 repeat | 已落地并验证 |
| Space 与特效冲突 | Space 不被特效状态机吞掉，继续走全局播放器语义 | 已落地 |
| 黑场全屏误导 | 黑场 preview target 改为 `viewport-mask`，PC DOM 预览读取 `maskViewportBounds` | 已落地，后续可继续提高投影精度 |
| VR 看不到 DOM 黑场 | A-Frame scene 内增加 viewport-mask effect preview，VR controller A/X 可触发 | 已落地基础能力，需 Quest 实机持续验证 |
| 实时 mask 范围共享困难 | mask controller 写状态池，特效从状态池读取，不直接 import mask controller | 已落地 |
| 小行星前端看不到球面化 | 明确 Tiny Planet 是 stereographic projection，不再占用普通 Frame key；普通运镜只做 rectilinear ViewPath | 已重新定性，待全景重投影渲染器 |
| 暂停中视频时间不推进 | 不伪造 +1ms；hold effect 用 wall-clock 编译持续时间，必要时写 ViewPathRange | 已落地核心语义 |
| 播放倍速、录制倍速、视效倍速语义混淆 | 播放倍速只影响观看和前端 preview，子弹时间就是 playbackSpeed = 0.1；录制倍速进入 timeline speed segment；视效倍速进入 effect spec / effect event，用于拉长或压缩特效自身动作 | 已形成正式规则，speed segment 与 effectSpeed contract 待实现 |
| 后端是否真的输出效果 | render-test 读取 effect events 和 ViewPath points；E2E 分析黑场/白场帧亮度与运镜帧差异 | 已验证 |
| PC/VR/后端三套表现不一致 | 用 spec 声明 render stage、preview target、preview accuracy 和 backend support | 已形成规则，部分 adapter 待扩展 |

## 4. 黑场范例的标准链路

黑场是当前特效系统的第一条完整范例。它的价值不是“黑一下屏幕”，而是证明一个特效如何穿过完整架构。

### 4.1 输入

PC 键盘：

```text
Tab
  -> 打开特效分类

1
  -> 选择 Transition

按住 1
  -> black-fade hold.start

松开 1
  -> black-fade hold.end
```

VR 手柄：

```text
A button down / X button down
  -> black-fade hold.start

A button up / X button up
  -> black-fade hold.end
```

UI tile：

```text
点击普通特效 tile
  -> editor.effects.select
```

### 4.2 状态池输入

黑场读取或依赖：

```text
playback.currentTimeMs
playback.isPlaying
viewTarget.center
viewTarget.fov
cropMask / maskViewportBounds
effectInput
input pressed state
```

黑场不读取：

```text
PcEffectsPanelSimple 内部 state
PlayerV2 子组件 ref
mask controller 私有变量
兄弟特效内部实现
```

### 4.3 事件

按住开始：

```text
editor.effects.hold.start
payload:
  effectId = black-fade
  categoryId = transition
  eventName = transition.fade_black
  previewTarget = viewport-mask
```

按住结束：

```text
editor.effects.hold.end
payload:
  effectId = black-fade
  durationMs
  eventName = transition.fade_black
```

### 4.4 前端预览

PC 页面：

```text
PcEffectPreview
  -> usePcEditorEffectInput()
  -> usePcEditorMaskViewportBounds()
  -> createViewportMaskPreviewStyle()
  -> DOM viewport-mask black fade
```

VR / A-Frame：

```text
AFrameViewportMaskEffectPreview
  -> 读取 effectInput / mask viewport 相关状态
  -> 在 A-Frame scene 内显示黑场材质
```

这里不再依赖 DOM overlay 进入头显。

### 4.5 Timeline 输出

普通 hold 输出：

```text
EffectEventsPatch
  eventName = transition.fade_black
  startMs = hold.start 的 video time
  endMs = startMs + hold duration
  params.direction = hold
  renderPolicy.conflictGroup = frame.occlusion
```

暂停中切视角时：

```text
EffectEventsPatch
  覆盖同一时间段的黑场

ViewPathRange
  startState = hold.start 时视角
  endState = hold.end 时视角
  interpolation = fast
```

这样导出语义是：

```text
黑场淡入
  -> 黑场保持期间完成视角变化
  -> 黑场淡出后露出新视角
```

时间域补充：

```text
播放倍速：
  只改变观看速度和前端 preview clock。
  不改变 EffectEventsPatch / ViewPathRange 的 source-time 持续时间。

子弹时间：
  就是播放倍速固定 0.1。
  让黑场、预设运镜和快捷操作反馈都慢下来，帮助用户反应。
  不写 timeline speed segment。

录制倍速：
  需要写入 timeline segment speed。
  会改变 sourceDuration -> outputDuration 的映射。
  对于绑定成片画面的特效和运镜，导出时应随输出时长拉伸或压缩。

视效倍速：
  进入 effect spec / effect event。
  用于改变黑场、闪白、运镜 envelope 等特效自身动作时长。
  不改变原片 sourceDuration -> outputDuration 的映射。

暂停：
  是运行门闸，不是速度。
  暂停时前端黑场动作、自动运镜和 timeline 流式采样都不推进。
  不伪造 +1ms。

按住型 hold：
  keydown/keyup 是明确编辑输入。
  如果暂停中需要提交黑场切视角，由 workflow 生成明确的 EffectEventsPatch / ViewPathRange。
  不把暂停持续 wall-clock 自动当作 timeline duration。
```

### 4.6 后端输出

后端渲染：

```text
EffectEventsPatch
  -> storage effect_events
  -> render-test / export
  -> events_for_segment
  -> resolve_frame_effects
  -> apply_fade_black
```

E2E 已验证：

```text
PC stage 不是空白。
Tab 1 1 能触发黑场。
DOM preview data-effect = black-fade。
DOM preview data-target = viewport-mask。
A-Frame preview entity active。
后端输出 MP4 在黑场时间点明显变暗。
```

## 5. 新增特效的通用流程

新增任何特效都必须先回答四个问题：

```text
1. 它属于哪一类？
2. 它读取哪些实时状态？
3. 它输出哪一种标准 draft / patch？
4. 它在 PC、VR、后端分别如何表现？
```

### 5.1 标准步骤

1. 在 catalog 中声明 effect。

```text
effectId
categoryId
label
key
eventName
durationMs
defaultParams
render.stage
render.backendSupport
render.fallback
render.conflictGroup
preview.target
preview.mode
preview.webxrSupport
```

2. 选择触发方式。

```text
普通点击：
  editor.effects.select

按住时长决定区间：
  editor.effects.hold.start
  editor.effects.hold.end

需要调参：
  editor.effects.params.set

不要为每个 effectId 新增专用事件。
```

3. 选择标准输出。

```text
EffectEventDraft
ViewPathPatchDraft
OverlayLayerDraft
MarkerOrAudioDraft
```

4. 定义 preview adapter。

```text
PC:
  DOM screen / DOM viewport-mask / canvas / symbolic

VR:
  XR viewport-mask / XR sphere / XR world-layer / symbolic / unsupported

后端:
  supported / unsupported / warn / fail
```

5. 如果需要导出，增加或绑定后端 handler。

```text
eventName -> effect_registry
params validation
handler
fallback policy
conflictGroup
```

6. 加测试。

```text
catalog schema / payload 测试
workflow compile 测试
PC preview 测试
A-Frame preview layer 测试
backend render-test 输出测试
```

### 5.2 标准输入

```text
EffectTriggerInput
  UI click / keyboard / VR ray / controller button

EffectParamInput
  强度、颜色、速度、方向、混合模式、seed

RuntimeStateInput
  playback、viewTarget、cropMask、maskViewportBounds、sphereView、cameraPose、xrSession、pressed controls

AssetInput
  文本、图片、贴纸、LUT、音频、字体、外部素材 id
```

### 5.3 标准输出

```text
EffectEventDraft
  适合转场、遮挡、滤镜、扭曲、故障、光效等 frame effect。

ViewPathPatchDraft
  适合镜头移动、自动 reframe、camera shake 等改变视角路径的效果。

OverlayLayerDraft
  适合文字、logo、贴纸、PIP、letterbox、subtitle 等图层合成。

MarkerOrAudioDraft
  适合 beat marker、BGM、音效、audio ducking、审片标记等。
```

## 6. 按类型新增特效

| 特效类型 | 代表特效 | 后端处理 | 前端处理 | PC / VR 渲染层处理 |
| --- | --- | --- | --- | --- |
| 转场 / 遮挡 | black fade、white flash、dissolve、wipe、dip to color | 写 `EffectEventsPatch`；通常 `post_remap_frame` 或 `overlay_frame`；使用 `frame.occlusion` 冲突组 | UI/键盘/VR 都触发 `select` 或 `hold.*`；读取 playback、maskViewportBounds | PC 用 DOM viewport-mask；VR 用 A-Frame viewport-mask；导出以后端 frame handler 为准 |
| 镜头移动 | hero push、reveal pull、drift left、pan、tilt、roll、shake、auto reframe | 第一版直接写 `ViewPathPatch` / `ViewPathRange`；不伪装成 frame filter；小行星另属 projection effect | 读取 viewTarget、cameraPose、mask；固定运镜通过 compiler 生成 ViewPath range | PC 和 VR 共用 viewTarget 状态；A-Frame camera/mask 预览；导出按 ViewPath remap；小行星需要另建全景重投影链路 |
| 遮罩 / Matte | shape mask、feather mask、spotlight、tracked mask、vignette mask | 使用 mask params 或 viewport bounds 约束效果范围；可生成 alpha/matte operation | mask controller 写状态池；特效只读状态池和 params | PC 用 DOM/canvas mask preview；VR 用 spherical mask、viewport mesh 或 shader |
| 滤镜 / 调色 | LUT、exposure、contrast、saturation、B&W、blur、sharpen、denoise | `post_remap_frame` 像素处理；参数必须可验证 | 参数面板和强度预览；不在 UI 中写最终像素真相 | PC 可 CSS/canvas 近似；VR 可 A-Frame shader 近似；复杂 LUT/denoise 可 symbolic |
| 扭曲 / 变形 | fisheye、lens distortion、wave、ripple、bulge、twirl | 需要后端像素采样或 shader；必须声明采样空间是 frame 还是 equirect | 只负责参数、范围和近似预览 | PC 可 WebGL/canvas；VR 可 sphere/viewport shader 近似；不稳定则 symbolic |
| 故障 / 信号 | RGB split、scanline、noise、VHS、datamosh、frame tear | 简单 glitch 可 frame handler；datamosh 需独立 pipeline，否则 unsupported/fail | 短暂 preview adapter 表达体感；workflow 按 catalog 判定能否导出 | PC 用 DOM/canvas glitch；VR 用 shader/world-layer 近似；导出能力由后端声明 |
| 时间 / 速度 | speed ramp、slow motion、freeze frame、reverse、strobe、time skip | 修改时间采样或生成 temporal event；可能影响音频同步 | 时间段、速度曲线、关键点编辑；读取 playback/time selection | PC/VR 多数显示状态和 cue；不一定需要画面 shader |
| 图层 / 合成 | text、subtitle、logo、sticker、PIP、letterbox、frame border | 生成 overlay/layer event；引用 assetId、layout、zIndex、blendMode | 编辑文本、位置、样式、素材 | PC DOM 只作编辑预览；VR 用 world-layer/camera-attached/sphere layer；导出由 backend overlay 合成 |
| 光效 / 粒子 | glow、bloom、lens flare、light leak、spark、rain、snow | 简单光效可 frame filter；粒子/贴图可 overlay layer；复杂粒子需声明 backend support | 参数、seed、范围、素材；预览可近似 | PC 可 canvas/WebGL；VR 可 world-layer/sphere particle；差异大时标 approximate |
| 360 / VR 空间 | hotspot、portal、spatial label、world marker、controller hint | 默认不进入 2D 导出，除非有明确 overlay/export contract | 读取 cameraPose、xrSession、controller state；写 XR runtime state 或发语义事件 | 主要由 A-Frame/WebXR 处理；PC 用 2D inspector 或 symbolic |
| 音频 / 节奏 | BGM、sound effect、beat marker、audio ducking、beat flash | 写 audio timeline event、marker 或 beat-synced effect event；导出需音频混合 | 选择音频、打点、节奏同步；状态池提供 playback/time | PC/VR 显示 beat cue；VR 可用 world-layer 或 controller feedback；画面 flash 仍走 frame effect |

关键原则：

```text
不是所有特效都进 EffectEventsPatch。
不是所有特效都需要 A-Frame 精确预览。
不是所有特效都能立即导出。
每个特效必须声明自己属于哪类、输出什么、PC/VR/后端分别怎么处理。
```

## 7. Preview Target 与 Render Stage

### 7.1 Preview Target

```text
screen
  普通 PC 屏幕空间。
  适合提示、debug、非沉浸式 UI feedback。

viewport-mask
  当前裁剪视窗 / mask viewport。
  适合黑场、白场、flash、blur、vignette 等最终作用在导出画面上的效果。

sphere
  360 球面空间。
  适合 hotspot、portal、球面标记。

world-layer
  XR 世界空间或相机前方空间。
  适合 VR 控件、空间文字、controller hint。
```

### 7.2 Render Stage

```text
pre_remap_equirect
  在原始 360 equirectangular frame 上处理。
  适合源级别全景效果，但容易产生球面空间差异。

post_remap_frame
  在 ViewPath remap 后的 16:9 平面 frame 上处理。
  适合绝大多数导出视觉特效。

viewport_path
  改变 ViewPath，而不是改变像素。
  适合镜头移动、auto reframe、shake。

overlay_frame
  在最终 frame 上合成图层。
  适合文字、logo、贴纸、letterbox、PIP。

audio_timeline
  音频轨、BGM、音效、ducking、beat sync。

marker_only
  只作编辑标记，不影响最终画面。
```

## 8. 组件独立性与代码规范

每个特效模块允许：

```text
读取 catalog spec。
读取状态池 snapshot 或订阅状态池变化。
通过事件总线表达动作。
实现自己的 preview adapter。
把输入编译成标准 draft。
```

每个特效模块禁止：

```text
import 兄弟特效。
import PcEffectsPanelSimple / PlayerV2 / 具体 UI panel。
直接调用 timelineBridge。
直接调用 backend transport/API。
直接读取其它组件 ref。
自己维护一份与状态池重复的全局实时状态。
把后端 eventName 写死在按钮 onClick 中。
```

推荐目录方向：

```text
apps/web/src/components/pc_editor/effects/
  input/
    effectShortcutStateMachine.ts
    useEffectShortcutBindings.ts
  preview/
    types.ts
    viewportMaskPreviewStyle.ts
    xr/
      AFrameViewportMaskEffectPreview.tsx
  compiler/
    effectEventDrafts.ts
  modules/
    black-fade/
      spec.ts
      preview.ts
      compile.ts
```

短期不要求一次性移动所有文件，但新增特效应按这个边界写，避免继续把逻辑堆回 `PcEffectsPanelSimple`、`PcEffectPreview` 或 `PlayerV2`。

## 9. 后端规范

后端 catalog 负责产品定义：

```text
effectId
label
category
UI key
eventName
default params
duration
render stage
preview target
backend support
fallback
conflict policy
```

后端 renderer registry 负责渲染能力：

```text
canonical eventName
aliases
handler
phase order
conflict group
priority
fallback
params normalization / validation
```

不要让 registry 重新定义产品 UI 语义。registry 只声明“这个底层 eventName 是否能渲染、怎么渲染”。

示例关系：

```text
black-fade
  effectId: black-fade
  eventName: transition.fade_black
  previewTarget: viewport-mask

vhs-blank
  effectId: vhs-blank
  eventName: black.solid
  previewTarget: viewport-mask

cyan-boost
  effectId: cyan-boost
  eventName: filter.color_grade
  params: { tint: "cyan" }
```

多个产品 effectId 可以映射到同一个底层 eventName，只要 params 和 label 不同。

## 10. 测试和验收

新增或修改特效时，至少考虑这些测试层级。

```text
类型检查：
  npm run typecheck:web

catalog/API：
  /api/effects/catalog 返回合法结构。

输入：
  Tab / 数字键 / keyup / Escape / Space 不冲突。

PC 预览：
  DOM preview 存在。
  data-effect / data-target / data-mode 正确。
  viewport-mask preview 不遮住整个 UI。

VR/A-Frame 预览：
  A-Frame preview entity 存在。
  触发同一 effect 后 component active。
  真实 Quest 头显仍需要人工确认。

后端导出：
  render-test 输出 MP4。
  对关键帧做像素统计或视觉回归。

回归套件：
  player-v2-smoke
  player-v2-edit-flow
  player-v2-effects-render
```

当前黑场范例已通过：

```text
npm run typecheck:web
npx playwright test e2e/player-v2-effects-render.spec.ts --project=chrome
npx playwright test e2e/player-v2-smoke.spec.ts e2e/player-v2-edit-flow.spec.ts e2e/player-v2-effects-render.spec.ts --project=chrome
```

## 11. 对旧追加问题的当前结论

旧文档中有一些追加问题，现在需要更新为当前状态。

### 11.1 “黑场仍是全屏或近似全屏”

当前结论：

```text
Player V2 当前黑场已经不再按全屏 UI 语义处理。
它使用 viewport-mask target。
PC DOM preview 读取 maskViewportBounds。
VR 侧有 A-Frame viewport-mask preview。
```

仍可继续完善：

```text
提高 DOM preview 与真实球面遮罩投影的精确度。
扩展 XrMaskViewportPreviewAdapter 支持更多遮挡/滤镜类效果。
```

### 11.2 “暂停键会打断黑场”

当前结论：

```text
Space 不被 effect shortcut state machine 吞掉。
播放器快捷键仍保持全局语义。
黑场 hold 的开始/结束由 effect key 或 VR button 的 down/up 决定。
视频时间不推进时，不伪造 +1ms。
需要表达暂停中切视角时，workflow 写明确的 ViewPathRange。
```

后续如果做更复杂的长动画特效，可以继续引入：

```text
EffectHoldSession
previewClockMs
accumulatedPausedMs
player.playback.state.changed
```

但这不是当前黑场导出语义的阻塞项。

### 11.3 “沉浸模式完全看不到黑场”

当前结论：

```text
基础问题已修正。
黑场不再只依赖 DOM overlay。
A-Frame scene 内有 viewport-mask effect preview。
VR 侧可通过 A / X controller button 触发 hold。
```

仍需要：

```text
Quest 实机持续验证。
更多 controller mapping。
更多 preview target 的 XR adapter。
```

### 11.4 “PC 和 VR 是否必须同一套渲染”

当前结论：

```text
不必须。
特效语义、标准输入、标准输出必须统一。
PC preview adapter、VR preview adapter、backend render handler 可以分开。
```

这条规则是后续大量特效不会压垮系统的关键。

## 12. 后续路线

优先级建议：

```text
1. 固化 black-fade 作为范例。
   文档、代码注释、测试都以它为第一条标准链路。

2. 把 preview adapter 继续模块化。
   DomMaskViewportPreviewAdapter
   XrMaskViewportPreviewAdapter
   XrWorldLayerPreviewAdapter

3. 减少 fallback catalog。
   前端只在接口失败或旧 session 兼容时使用 fallback。

4. 为每类特效建立最小 contract。
   ViewPathPatchDraft
   OverlayLayerDraft
   MarkerOrAudioDraft

5. 扩展第二个范例特效。
   white flash 和 soft blur 已落地。
   它们复用 viewport-mask 预览，但验证不同 params / handler。

6. 再做一个非黑场类型范例。
   固定运镜 hero-push / reveal-pull / drift-left-parallax / impact-shake 已作为 ViewPathPatchDraft 范例落地。
   下一个推荐 text overlay。
   用来验证 ViewPathPatchDraft 或 OverlayLayerDraft，不要所有范例都停留在 EffectEventsPatch。

7. 完善 VR controller 输入。
   A/X 当前用于黑场试验。
   后续应走统一 Binding / Event 入口，支持更多 target 和可配置映射。
```

## 13. 最终原则

特效系统的核心不是“把每个特效都做成 A-Frame 组件”，也不是“在 Effects Panel 里不断加按钮逻辑”。

最终原则是：

```text
特效定义来自 catalog/spec。
实时值来自状态池。
动作表达走事件总线。
业务语义由 workflow 编译。
导出数据走标准 patch。
PC 和 VR 预览由不同 adapter 承载。
后端 renderer 是最终导出真相。
每个特效模块相对独立，不知道兄弟组件内部实现。
```

黑场已经证明这条路能跑通。后续新增特效时，先判断类型，再选择标准输入、标准输出、preview target、render stage 和后端 support，不要直接复制黑场代码，也不要把新逻辑塞回某个单体组件。
