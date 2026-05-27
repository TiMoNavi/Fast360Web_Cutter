# PC Editor WebXR 特效分类、清单与实现路线

本文档是 `pc-editor-webxr-effects-problem-analysis.md` 的配套清单文档。

`pc-editor-webxr-effects-problem-analysis.md` 负责说明我们遇到的问题、当前架构和正式解决原则；本文档负责回答三个更落地的问题：

```text
1. 我们后续可以添加哪些特效。
2. 每一类特效在前端、VR、后端分别怎么实现。
3. GitHub / 开源生态里是否有后端平面视频处理可借力的视觉效果包。
```

调研时间：2026-05-26。

## 0. 当前结论

可以继续添加更多特效，但不能把每个特效都写成临时 UI 逻辑。

后续所有特效都应该走同一条工程链路：

```text
后端 catalog 定义 effect
  -> 前端 effects panel 读取 catalog
  -> 输入系统产生 EffectEventsPatch / ViewPathPatchDraft / OverlayLayerDraft / MarkerDraft
  -> 状态池保存实时输入和预览依赖状态
  -> PC preview adapter 负责桌面预览
  -> XR preview adapter 负责 VR 沉浸预览
  -> 后端 registry / handler / external adapter 负责最终导出
  -> E2E 验证 PC 像素、XR entity、后端 MP4 输出
```

当前“按住型黑场”是第一个正式范例，适合作为 `viewport-mask` 遮挡类、转场类、hold effect 的模板。后续特效可以参考它的结构，但不要把所有特效都强行做成黑场式 DOM overlay。

### 0.1 产品前提：看一遍，无脑剪

PC Editor WebXR 的核心产品定义是：

```text
用户看一遍 360 视频，就能顺手完成主要剪辑。
```

因此，特效系统不是传统专业剪辑软件里的“打开面板、调十个参数、反复预览”的模式。第一阶段的特效应该是“无脑预设”：

```text
用户只做一件事：
  在看到合适时机时，按一个键 / 按住一个键 / 点一个按钮。

系统自动决定：
  duration
  speed
  direction
  curve
  strength
  mask target
  PC preview
  VR preview
  backend render params
```

复杂特效不要先暴露自由参数，而是拆成多个可直接触发的预设：

```text
不是一个“镜头移动”特效让用户再选择方向和速度。
而是多个无脑按钮：
  Push in 1.2s
  Pull out 1.2s
  Drift left 1.6s
  Drift right 1.6s
  Tiny shake 0.7s
```

默认体验规则：

```text
短按：
  在当前播放时间打一个预设效果。

按住：
  只用于黑场、白场、强调闪烁这类一维 envelope 效果。
  松开即结束。

复杂效果：
  不进入参数编辑态。
  不要求用户选择方向。
  不强制长期接管 mask controller。
  只生成一段可撤销、可覆盖、可重播的 timeline/effect patch。

后续高级模式：
  可以允许参数面板、方向编辑、曲线编辑。
  但高级能力不能影响默认“看一遍就能剪”的主流程。
```

这个前提会影响特效选择：第一批效果优先选择“预设后就能好看”的效果，而不是需要用户精细调参才成立的效果。

## 1. 特效定义的最小字段

每个 effect 至少应该有这些定义字段：

| 字段 | 说明 |
| --- | --- |
| `effectId` | 前端展示和用户选择使用的稳定 ID。 |
| `eventName` | 后端渲染事件名，例如 `transition.fade_black`、`filter.blur`。 |
| `categoryId` | 所属分类，例如 `transition`、`color`、`glitch`。 |
| `family` | 更粗的效果族，用于冲突、排序和 UI 组织。 |
| `renderStage` | 后端作用阶段，例如 `viewport_path`、`post_remap_frame`、`overlay_frame`、`source_time`。 |
| `previewTarget` | 预览目标，例如 `viewport-mask`、`flat-frame`、`xr-world`、`marker-only`。 |
| `inputMode` | 输入方式，例如 `preset-tap`、`preset-hold`、`auto-preset`、`audio-driven`。第一阶段避免默认使用 `parameter-panel`。 |
| `durationMs` | 默认持续时间。hold effect 可以由按下/松开决定。 |
| `params` | 参数默认值。复杂参数要逐步升级为 schema。 |
| `previewAccuracy` | `exact`、`approximate`、`symbolic`、`unsupported`。 |
| `stackMode` | 多个效果叠加策略，例如 `compose`、`exclusive`、`max-priority`。 |
| `conflictGroup` | 互斥组，例如同一时间只能有一个遮挡转场。 |
| `backendSupport` | `implemented`、`planned`、`experimental`、`preview-only`。 |

不要让兄弟组件互相 import 或互相调用。需要共享的实时值放入状态池；需要长期保存和导出的效果写入 timeline / effect events。

## 2. 特效分类总表

| 类型 | 代表特效 | PC 前端预览 | VR 沉浸预览 | 后端导出处理 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| 转场 | 黑场、白闪、交叉淡化、wipe、push、grid dissolve、zoom blur transition | `viewport-mask` 或 `flat-frame` preview adapter | A-Frame 平面、球面内视口遮罩或 world layer | `post_remap_frame` handler；复杂双素材转场用 FFmpeg filtergraph 或专用 adapter | 高 |
| 镜头移动 | push-in、pull-out、pan、tilt、roll、shake、dolly zoom | 改写 `viewTarget` / camera preview | 改写 XR camera rig / view target 反馈 | 编译成 `ViewPathPoint` 或 `viewport_path` patch，在 remap 前生效 | 高 |
| 遮罩 | 裁剪视口、软边、圆角、spotlight、shape mask、letterbox | DOM mask / CSS clip / canvas mask | A-Frame geometry / shader mask | OpenCV alpha mask、FFmpeg overlay/alpha、frame blend | 高 |
| 滤镜 | 调色、LUT、曝光、对比度、模糊、锐化、暗角、颗粒 | CSS/canvas/WebGL 近似 | A-Frame shader 或 viewport plane material | OpenCV、FFmpeg filters、libplacebo、LUT handler | 高 |
| 扭曲变形 | fisheye、bulge、wave、twirl、lens distortion、mirror、kaleidoscope | WebGL shader preview | A-Frame shader preview | OpenCV remap、FFmpeg/frei0r distort、GPU shader adapter | 中 |
| 故障 | RGB split、scan tear、noise burst、pixel shift、signal loss、datamosh | DOM/canvas/WebGL preview | A-Frame shader / overlay plane | OpenCV frame ops、FFmpeg filters；datamosh 需要编码层实验 | 中 |
| 时间速度 | speed ramp、freeze frame、reverse hit、beat stutter、time skip | 改 playback / timeline ghost preview | XR 内播放速率和 marker 反馈 | `source_time` 映射、FFmpeg trim/setpts/reverse、帧缓存 | 中 |
| 图层合成 | 文本、字幕、贴纸、水印、画中画、lower-third、AR 指示框 | DOM overlay 或 canvas layer | A-Frame plane / text / image layer | OpenCV alpha blend、FFmpeg overlay/drawtext、MoviePy 原型 | 高 |
| 光效粒子 | lens flare、light leak、glow、dust、spark、rain、snow、particle burst | canvas/WebGL overlay | A-Frame 粒子或半透明 plane | 预渲染 alpha 序列 + frame blend；G'MIC/OpenCV 可辅助 | 中 |
| 360/VR 空间 | horizon lock、nadir blur/logo、world marker、gaze vignette、viewport-only warp | PC 中近似显示视口语义 | A-Frame 精确预览，绑定球面/世界坐标 | `pre_remap_sphere` 或 remap 前后组合处理 | 中 |
| 音频节奏 | beat flash、bass pulse、beat cut、waveform glow、节拍标记 | timeline marker + 预览 pulse | XR 内 marker / controller haptic / pulse | 先做音频分析轨，再生成 effect events | 中 |

## 3. 分类型实现思路

### 3.1 转场

适合先做的特效：

```text
black fade
white flash
dip to black
dip to white
cross dissolve
linear wipe
radial wipe
grid dissolve
zoom blur transition
```

实现原则：

```text
单素材遮挡类转场：
  eventName -> transition.fade_black / transition.flash_white
  renderStage -> post_remap_frame
  previewTarget -> viewport-mask
  backend -> 当前 effect handler 模式即可

双素材转场：
  需要 clip A / clip B 的时间范围和 overlap 信息
  renderStage -> transition_between_segments
  backend -> FFmpeg xfade/filtergraph 或自定义帧混合
  不能只靠单个 effect event 表达完整语义
```

优先级建议：

```text
1. white flash：几乎复用黑场链路。
2. dip to black / dip to white：复用 fade handler，只换颜色和曲线。
3. linear wipe：新增 mask progress。
4. cross dissolve：等 clip/segment overlap contract 稳定后做。
```

### 3.2 镜头移动

代表特效：

```text
push-in
pull-out
pan-left / pan-right
tilt-up / tilt-down
roll pulse
handheld shake
dolly zoom
orbit glance
```

这类特效不是简单盖在画面上的滤镜，而是改变取景路径。它应该优先输出 `ViewPathPatchDraft` 或更正式的 `viewport_path` effect，而不是 `post_remap_frame` effect。

在“看一遍就能剪”的默认模式下，镜头移动不让用户现场选择方向、速度和曲线。方向和速度先做成预设：

| 预设 | 默认持续时间 | 默认方向 / 速度 | 适合场景 |
| --- | --- | --- | --- |
| `frame.hero_push` | 900ms | FOV 收窄 10 度，中心不变，ease-out 后轻微回弹 | 强调当前主体。 |
| `frame.reveal_pull` | 1400ms | FOV 放宽 14 度，pitch +2 度，ease-in-out | 从细节退回环境。 |
| `frame.drift_left_parallax` | 1600ms | yaw -8 度，FOV 收窄 3 度，ease-in-out | 让画面有轻微横移感。 |
| `frame.drift_right_parallax` | 1600ms | yaw +8 度，FOV 收窄 3 度，ease-in-out | 让画面有轻微横移感。 |
| `frame.impact_shake` | 520ms | 小幅 yaw/pitch/roll 衰减抖动，固定 seed | 冲击、碰撞、节奏点。 |

触发方式：

```text
用户短按某个预设：
  当前播放时间 = effect start
  duration / speed / direction / curve 使用预设
  生成可撤销的 path patch 或 viewport_path effect

编辑器预览：
  可以在接下来几秒显示运镜结果
  但不能永久接管 mask controller
  用户继续看视频时仍然可以继续打点
```

后端处理：

```text
source equirectangular frame
  -> 根据原始 ViewPathPoint 插值
  -> 叠加 frame.hero_push / frame.roll_pulse_soft / frame.impact_shake 的路径偏移
  -> remap 成 16:9 平面帧
  -> 再进入 post_remap_frame effects
```

PC/VR 预览：

```text
PC：状态池写入临时 viewTarget offset，桌面预览跟随变化。
VR：A-Frame camera rig 或 sphere sampling 读取同一份 effectInput/viewTarget 状态。
```

### 3.2.1 适合“看一遍就能剪”的高级固定运镜

高级运镜第一阶段不做自由轨迹编辑，而是做“短按即生成固定 path patch”的预设。用户不需要选择方向、速度、曲线和关键帧，系统只读取当前状态池里的 `viewTarget / cropMask / playbackTime / recordSpeed` 快照，然后生成一段可撤销、可覆盖、可导出的 `ViewPathPatchDraft`。

固定运镜的标准流程：

```text
用户短按一个运镜预设
  -> 输入层发出 effect.trigger
  -> effect engine 读取状态池当前 viewTarget / mask center / fov / playback time
  -> preset resolver 根据预设生成 yaw / pitch / roll / fov 曲线
  -> 写入 timeline 的 ViewPathPatchDraft
  -> PC preview adapter 临时播放这段 path patch
  -> VR preview adapter 读取同一段 path patch
  -> 后端导出时在 remap 前叠加同一段 path patch
```

第一批高级固定运镜必须满足这些条件：

```text
只改 yaw / pitch / roll / fov。
属于 rectilinear reframe，不切换投影模型。
不要求 6DoF、深度、主体识别或空间重建。
不永久接管 mask controller，只在预览和导出时叠加一段路径。
PC、VR、后端都能复用 ViewPath 数学。
用户只需要短按，不需要调方向、速度、曲线。
```

推荐预设按用途分组如下。

强调与揭示：

| 预设 | 默认持续时间 | 路径参数 | 适合场景 | 难度 |
| --- | --- | --- | --- | --- |
| `frame.hero_push` | 900ms | FOV -10，pitch/yaw 不变，ease-out 后轻微回弹 1 度 | 主体出现、人物动作、关键物体 | 低 |
| `frame.focus_breath` | 1500ms | FOV -5 -> +2 -> 0，平滑呼吸曲线 | 情绪强调，不打断观看 | 低 |
| `frame.reveal_pull` | 1400ms | FOV +14，pitch +2，ease-in-out | 从局部退到环境，展示空间关系 | 低 |

观察方向提示：

| 预设 | 默认持续时间 | 路径参数 | 适合场景 | 难度 |
| --- | --- | --- | --- | --- |
| `frame.look_up_reveal` | 1300ms | pitch +8，FOV +6 | 建筑、天空、舞台、垂直空间 | 低 |
| `frame.look_down_reveal` | 1300ms | pitch -8，FOV +6 | 地面动作、桌面、脚下事件 | 低 |
| `frame.subject_peek_left` | 1000ms | yaw -5 后回原点，FOV -2 | 左侧有信息，但不想手动转视角 | 低 |
| `frame.subject_peek_right` | 1000ms | yaw +5 后回原点，FOV -2 | 右侧有信息，但不想手动转视角 | 低 |

空间运动感：

| 预设 | 默认持续时间 | 路径参数 | 适合场景 | 难度 |
| --- | --- | --- | --- | --- |
| `frame.drift_left_parallax` | 1600ms | yaw -8，FOV -3，ease-in-out | 给静态画面一点运动感 | 低 |
| `frame.drift_right_parallax` | 1600ms | yaw +8，FOV -3，ease-in-out | 给静态画面一点运动感 | 低 |
| `frame.horizon_settle` | 900ms | roll 自动缓慢回 0，pitch/yaw 不变 | 纠正倾斜画面，提升稳定感 | 中 |

节奏与冲击：

| 预设 | 默认持续时间 | 路径参数 | 适合场景 | 难度 |
| --- | --- | --- | --- | --- |
| `frame.impact_shake` | 520ms | 固定 seed 的 yaw/pitch/roll 小幅衰减震动 | 碰撞、鼓点、跳跃落地 | 中 |
| `frame.roll_pulse_soft` | 800ms | roll -4 -> +4 -> 0，FOV -2 | 音乐节奏、轻微失衡感 | 中 |
| `frame.whip_left_cut` | 420ms | yaw -22，motion blur 标记，结束回原点或接 cut | 快速转场、节奏点 | 中 |
| `frame.whip_right_cut` | 420ms | yaw +22，motion blur 标记，结束回原点或接 cut | 快速转场、节奏点 | 中 |

不建议第一批做的高级运镜：

```text
小行星 / Tiny Planet：
  需要 stereographic projection，不是普通 FOV 运镜。

Dolly zoom：
  传统 dolly zoom 需要真实 3D 前后位移或主体深度感。
  360 纯 3DoF 视频里只能做 FOV 变化近似，容易像普通 zoom。

Orbit around subject：
  需要主体位置、深度、或多视角/3D 信息。
  单个 360 equirectangular 视频里只能做 yaw/pitch 近似，不是真 orbit。

Auto subject tracking：
  需要检测/跟踪模型和目标选择。
  可以作为后续 AI 辅助，不适合第一批无脑预设。
```

建议第一批落地顺序：

```text
1. hero_push / reveal_pull：先验证最简单的 FOV path patch。
2. drift_left_parallax / drift_right_parallax：验证 yaw + FOV 的组合。
3. look_up_reveal / look_down_reveal：验证 pitch 方向的观察提示。
4. impact_shake：验证固定 seed 的程序化路径。
5. roll_pulse_soft / horizon_settle：验证 roll 叠加和回正。
6. whip_left_cut / whip_right_cut：等 motion blur / cut 语义稳定后再做。
```

### 3.2.2 第一批固定运镜的正式契约

先做 3 个固定运镜作为样例：`hero_push`、`reveal_pull`、`drift_left_parallax`。这三个覆盖了三种最常用的镜头语义：强调主体、揭示空间、制造横向运动感。`drift_right_parallax` 暂时作为 `drift_left_parallax` 的镜像预设，等左移链路稳定后复制接入。

#### 3.2.2.1 effect catalog 定义

后端 catalog 是产品定义的来源，前端不应该在兄弟组件里硬编码这些效果。第一批可以这样定义：

| effectId | eventName | key | durationMs | renderStage | previewTarget | previewAccuracy | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hero-push` | `frame.hero_push` | `1` | 900 | `viewport_path` | `viewport-mask` | `exact` | `deltaFovH=-10, reboundFovH=1, curve=easeOutBackSoft` |
| `reveal-pull` | `frame.reveal_pull` | `2` | 1400 | `viewport_path` | `viewport-mask` | `exact` | `deltaFovH=14, deltaPitch=2, curve=easeInOutCubic` |
| `drift-left-parallax` | `frame.drift_left_parallax` | `3` | 1600 | `viewport_path` | `viewport-mask` | `exact` | `deltaYaw=-8, deltaFovH=-3, curve=easeInOutSine` |

当前实现状态：

```text
已接入后端 catalog：
  apps/api/app/effects/catalog.py

已接入前端 fallback catalog：
  apps/web/app/api/effects/catalog/route.ts
  apps/web/src/components/pc_editor/UI/PcEffectsPanelSimple.tsx

已接入前端 compiler / workflow / preview：
  apps/web/src/components/pc_editor/effects/compiler/effectSpecs.ts
  apps/web/src/components/pc_editor/effects/compiler/effectCompiler.ts
  apps/web/src/components/pc_editor/effects/preview/ViewportPathMotionPreviewController.tsx
  apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts

已接入 e2e：
  apps/web/e2e/player-v2-effects-render.spec.ts
  覆盖 Tab -> 4 -> 1/3 写入 ViewPathPatch、FX speed 缩短运镜时长、render-test 导出 MP4 帧差异。
```

过渡期兼容：

```text
旧 `frame.push_in` 可以先作为 `frame.hero_push` 的 alias。
旧 `frame.pull_out` 可以先作为 `frame.reveal_pull` 的 alias。
`little-planet` 不再占用普通 frame 分类的默认 key 3。
```

#### 3.2.2.2 统一交互模式

这三个运镜都使用 `preset-tap`，不使用 hold，不打开参数面板。

```text
键盘：
  Tab -> Frame category -> 1：hero_push
  Tab -> Frame category -> 2：reveal_pull
  Tab -> Frame category -> 3：drift_left_parallax

平面 UI：
  用户点击 Effects Panel 里的对应按钮。

3D UI：
  用户在空间菜单里点同一个 catalog item。

VR 手柄：
  手柄射线点选同一个 catalog item。
  后续可以增加一个快速 radial menu，但输出仍然是同一条 effect.trigger。
```

所有输入层只负责表达“用户触发了哪个效果”，不直接改 mask controller，也不直接写 timeline：

```text
eventName: editor.effects.select
payload:
  effectId: hero-push
  eventName: frame.hero_push
  categoryId: frame
  renderStage: viewport_path
  durationMs: 900
  params:
    deltaFovH: -10
    reboundFovH: 1
    curve: easeOutBackSoft
```

#### 3.2.2.3 前端处理方式

前端要分成三层，避免效果按钮、mask controller、预览渲染互相 import：

```text
PcEffectsPanel / keyboard input / 3D UI / VR controller
  -> event bus: editor.effects.select
  -> effect workflow / compiler
  -> runtime state pool 读取当前状态
  -> 生成 ViewPathPatchDraft
  -> timeline model 保存正式 patch
  -> preview adapter 播放 activeViewPathPatchPreview
```

状态池读取项：

```text
playback.currentTimeMs：当前落点时间。
playback.isPaused：暂停时仍允许打点，但 start time 使用当前视频时间。
speed.recordSpeed：录制倍速会影响最终 timeline 时长换算。
viewTarget.yaw / pitch / roll / fovH：当前取景中心。
cropMask.center / bounds / fov：用于确认运镜起点和 mask 对位。
```

前端生成的 `ViewPathPatchDraft` 形态：

```text
hero_push:
  start: current viewTarget
  mid: fovH += -10
  end: fovH += -9

reveal_pull:
  start: current viewTarget
  end: fovH += 14, pitch += 2

drift_left_parallax:
  start: current viewTarget
  end: yaw += -8, fovH += -3
```

PC 预览：

```text
不让按钮组件直接控制 mask。
preview adapter 读取 activeViewPathPatchPreview。
mask controller 继续广播自己的实时状态。
预览画面通过同一份 view path 叠加结果更新。
```

VR 预览：

```text
沉浸模式不依赖 DOM overlay。
XR preview adapter 读取同一份 ViewPathPatchDraft。
可以表现为 camera rig / sampling target 的短时间偏移。
如果当前 VR 模式为了舒适性不想强行移动头显视角，应使用世界内 preview frame 或轻量提示，并明确标记 previewAccuracy。
```

#### 3.2.2.4 后端处理方式

第一版实现里，前端 compiler 直接把这三个 preset 编译成 `ViewPathPatch` / `createViewPathRange`，后端 render-test 读取最终 ViewPath points。也就是说，当前后端不需要额外识别 `frame.hero_push` 事件就能导出真实运镜；catalog 中的 `eventName` 是产品语义和未来共享 spec 的名字。

导出发生在 equirectangular source remap 到平面帧之前：

```text
source equirectangular frame
  -> 读取已经写好的 ViewPathPoint
  -> 插值 yaw / pitch / fovH / fovV
  -> remap 输出平面帧
  -> 再进入 black/white/filter/overlay 等 post_remap_frame effect
```

后续如果要保留 `frame.*` 事件而不是提前展开成 ViewPath points，可以在后端增加 `viewport_path effect resolver`：

```text
source equirectangular frame
  -> 读取基础 ViewPathPoint
  -> 查询当前时间命中的 frame.* viewport_path effect
  -> 根据 preset params 计算 yaw / pitch / roll / fovH offset
  -> 叠加到基础 view path
  -> remap 输出平面帧
```

导出约束：

```text
同一个 eventName + params + startMs + durationMs 必须 deterministic。
曲线函数必须在前端和后端同名同义。
角度单位统一使用 degree。
FOV 使用水平 FOV：fovH。
如果后端暂时不认识某个 frame.*，必须 warning，而不是静默导出无效果。
```

#### 3.2.2.5 时间、暂停和倍速

固定运镜的“用户体验时间”和“导出 timeline 时间”要区分：

```text
暂停：
  用户可以触发运镜，startMs = 当前视频时间。
  前端可以播放一遍预览，或在恢复播放后跟随视频时间显示。

播放倍速：
  只影响用户观看和反应速度。
  前端预览可以跟随播放倍速变慢/变快。
  写入 timeline 的 startMs / durationMs 不因为播放倍速改变。

录制倍速：
  表示这段素材本身要变速。
  会影响最终导出 timeline 的时间映射。
  固定运镜可以被录制倍速自然拉长或压短，用来延长/压缩效果持续感。
```

#### 3.2.2.6 验收标准

```text
catalog：
  后端 /api/effects/catalog 能返回三个 effect。
  前端 panel、键盘、3D UI、VR controller 都从 catalog 触发同一个 eventName。

前端：
  触发后能看到遮罩内真实画面运动，不只是 UI 光环。
  状态池中能看到 activeViewPathPatchPreview 或等价状态。
  组件之间没有兄弟 import / 互相调用。

后端：
  render-test 导出的视频帧能测到 FOV 或 yaw/pitch 差异。
  未支持时有明确 warning。

一致性：
  同一段 timeline 在 PC 预览、VR 预览、后端导出中的方向和时长一致。
```

### 3.2.3 第二批已落地特效：抖动、柔焦、RGB split

第二批继续遵守“看一遍就能剪”：不打开参数面板，全部使用固定预设。它们的价值是把范例从“遮挡转场 + 基础运镜”扩展到三条更常见的剪辑语义：

| effectId | eventName | key | category | durationMs | renderStage | previewTarget | params |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `impact-shake` | `frame.impact_shake` | `Frame 4` | 镜头移动 | 620 | `viewport_path` | `viewport-mask` | `amplitudeYaw=2.6, amplitudePitch=1.4, shakes=4, decay=0.62` |
| `soft-blur` | `filter.blur` | `Color 6` | 滤镜 | 760 | `post_remap_frame` | `viewport-mask` | `strength=0.48, radius=21, edgeMs=180` |
| `rgb-split` | `filter.chromatic_aberration` | `Glitch 1` | 故障 | 520 | `post_remap_frame` | `viewport-mask` | `strength=0.88, offsetPx=14, edgeMs=110` |

实现状态：

```text
impact-shake：
  前端 compiler 生成多关键帧 ViewPathRange。
  预览控制器通过状态池写入临时 viewTarget，表现为遮罩画面快速往返抖动。
  后端 render-test 读取展开后的 ViewPathPoint，按 yaw/pitch/FOV remap 导出。

soft-blur：
  前端 catalog/spec/panel 作为 Color 6。
  输出 EffectEventsPatch -> filter.blur。
  后端 apply_blur 已支持 Gaussian blur，并通过 edge envelope 做进入/退出。

rgb-split：
  前端 catalog/spec/panel 作为 Glitch 1。
  输出 EffectEventsPatch -> filter.chromatic_aberration。
  后端 apply_chromatic_aberration 已支持 B/R 通道横向偏移。
```

验收状态：

```text
apps/web/e2e/player-v2-effects-render.spec.ts
  Tab -> 4 -> 4 能写入 Impact shake 的多点 ViewPathPatch。
  render-test 能输出 soft-blur MP4，并和 baseline 帧产生可测差异。
  render-test 能输出 rgb-split MP4，并和 baseline 帧产生可测差异。
```

这三项暂时不需要独立高级参数 UI。后续如果要开放参数，应该先在 effect catalog 增加参数 schema，再让 UI 自动渲染安全范围，不要让某个按钮组件私有保存参数。

### 3.2.4 小行星从普通运镜中移出

当前 `little-planet` 曾作为第一版无脑运镜近似接入：

```text
快捷键：Tab -> 4 -> 3
effectId：little-planet
eventName：frame.little_planet_pullback
输出：3 个 ViewPathPoint
  start：当前视角
  peak：pitch=-82deg, fov.h=170deg
  end：回到当前视角
前端预览：通过状态池临时写入 viewTarget，驱动现有 mask controller 更新球面遮罩窗口。
  也就是“透过遮罩看到的画面在动”，而不是只显示一个 UI 光环。
  这仍然是 3DoF + FOV，不升级为 6DoF。
当前性质：perspective 超广角近似
后续升级：真正 Tiny Planet / Little Planet 应该使用 stereographic projection
```

后续规划中，小行星不再推荐作为 `ViewPathPatchDraft` 的普通镜头移动预设，而应进入：

```text
ProjectionEffect
ProjectionViewState
PanoramaProjectionRenderer
backend projection remap
```

也就是说：

```text
普通高级运镜：
  继续走 ViewPath / rectilinear reframe。

小行星、鱼眼、兔子洞：
  走 projection effect。
```

参考资料和搜索关键词：

```text
Tiny Planet / Little Planet：常见 360 相机 App 里的效果名。
Stereographic projection：小行星效果更准确的投影模型。
FFmpeg v360：可研究 stereographic output，后续可作为后端 adapter。
  https://ffmpeg.org/ffmpeg-filters.html#v360
Insta360 FOV / keyframes / camera movements：可参考消费级 360 剪辑软件怎样把复杂运镜做成模板。
  https://onlinemanual.insta360.com/app/en-us/operation-tutorial/edit-function/app-fov
  https://onlinemanual.insta360.com/app/en-us/operation-tutorial/edit-function/keyframes-and-camera-movements
```

### 3.3 遮罩

代表特效：

```text
soft crop
rounded viewport
spotlight
oval focus
letterbox
split mask
shape reveal
```

当前 mask controller 已经广播 `cropMask` 和 `maskViewportBounds`，后续遮罩类特效应该继续沿用这个思路：

```text
mask controller / effect controller
  -> runtime state pool
  -> preview adapter
  -> effect event / render params
  -> backend alpha mask
```

注意：

```text
用于编辑器布局的遮罩，不一定等于最终导出的画面遮罩。
能影响最终导出的遮罩必须进入 timeline/effect event。
只用于 UI 辅助的遮罩可以只留在 runtime state pool。
```

### 3.4 滤镜

代表特效：

```text
color grade
LUT
brightness / contrast / saturation
temperature / tint
blur
sharpen
vignette
film grain
deband
```

实现路径：

```text
轻量滤镜：
  OpenCV / numpy handler

标准视频滤镜：
  FFmpeg libavfilter adapter

高质量色彩和 HDR：
  libplacebo / 3D LUT adapter

前端预览：
  CSS filter 可以做 symbolic / approximate
  WebGL shader 更适合 exact / approximate
```

第一批可做：

```text
filter.blur
filter.vignette
filter.color_grade
filter.chromatic_aberration
```

它们已经在 catalog / registry 里有雏形，适合作为黑场之后的第二批标准样例。

### 3.5 扭曲变形

代表特效：

```text
wave
bulge
twirl
fisheye
lens distortion
mirror
kaleidoscope
pinch
```

后端最稳妥的实现是 `OpenCV remap`：

```text
为每一帧生成 x/y map
  -> cv2.remap
  -> apply_frame_effects 继续处理后续效果
```

如果效果天然是 shader，可以后续增加 GPU adapter，但第一版不要为了一个变形效果重构整个后端渲染。

第一批扭曲也应该是无脑预设，不做自由中心点、自由方向、自由半径：

| 预设 | 默认持续时间 | 默认参数 | 适合场景 |
| --- | --- | --- | --- |
| `distort.lens_pulse_soft` | 650ms | center = 当前 viewport 中心，radius = 0.42，strength = 0.22 | 轻微强调主体。 |
| `distort.lens_pulse_strong` | 480ms | center = 当前 viewport 中心，radius = 0.36，strength = 0.36 | 节奏点、冲击点。 |
| `distort.wave_hit` | 700ms | direction = 水平，amplitude = 0.018，frequency = 2.5 | 画面轻微波动。 |

触发方式：

```text
短按：
  在当前播放时间生成一个固定时长 pulse。

按住：
  暂时不作为默认输入方式。
  扭曲类一旦允许按住，很容易变成用户不知道何时该松手的调参行为。
```

VR 预览要特别注意坐标空间：

```text
屏幕空间变形：
  作用于最终 16:9 frame，VR 中只能 approximate。

球面空间变形：
  作用于 equirectangular/sphere UV，VR 可更接近真实，但后端要在 remap 前处理。
```

### 3.6 故障

代表特效：

```text
RGB split
scan tear
noise burst
pixel shift
signal loss
VHS tracking
datamosh
pixel sort
```

建议分两级：

```text
可控故障：
  RGB split、scan tear、noise burst、pixel shift。
  这些都是普通 frame effect，可以先做。

编码故障：
  datamosh、GOP 层面的错帧、压缩残影。
  这些不是普通 frame effect，应该放入 experimental pipeline。
```

不要让 datamosh 污染当前稳定 render-test。它需要单独的 source/encode 实验链路。

### 3.7 时间速度

代表特效：

```text
speed ramp
freeze frame
reverse hit
beat stutter
time skip
echo frames
motion trail
```

这类特效的核心不是像素处理，而是“当前输出帧应该读取源视频的哪个时间点”。

推荐 contract：

```text
source_time effect:
  outputTimeMs -> sourceTimeMs
```

后端处理：

```text
输出时间线
  -> source time mapper
  -> decoder seek / frame buffer
  -> remap
  -> frame effects
```

前端预览：

```text
简单版：改变 video playbackRate / pause / seek。
稳定版：不直接操控 video 元素，而是通过状态池表达 sourceTime preview intent。
```

### 3.8 图层合成

代表特效：

```text
text overlay
subtitle
sticker
watermark
picture-in-picture
lower-third
callout arrow
progress bar
```

这类特效应该逐步从 `EffectEventsPatch` 中拆出 `OverlayLayerDraft` 或 `LayerTrack`。

原因：

```text
图层有层级 zIndex。
图层有独立 transform。
图层有入场/出场动画。
图层可能引用图片、字体、视频等外部资源。
图层合成顺序和普通 filter 不同。
```

短期可以先用 effect event 表达简单文本；中期应该升级为 layer track。

### 3.9 光效粒子

代表特效：

```text
light leak
lens flare
glow
dust
spark
rain
snow
particle burst
energy ring
```

推荐实现：

```text
第一版：
  预渲染透明 alpha 序列或程序生成 overlay frame。
  后端做 alpha blend。

第二版：
  PC 使用 canvas/WebGL 预览。
  VR 使用 A-Frame particles / planes。

第三版：
  GPU shader 或外部视觉包生成更复杂效果。
```

光效粒子不要先做成一堆不可控随机数。每个效果都要有 seed，这样导出和预览才能复现。

### 3.10 360/VR 空间特效

代表特效：

```text
horizon lock
nadir blur / nadir logo
world marker
gaze vignette
viewport-only warp
spatial arrow
hotspot highlight
```

这类特效的重点是坐标空间：

```text
world-space：
  绑定 360 球面或世界坐标，VR 预览最准。

viewport-space：
  绑定最终输出视口，后端导出最准。

sphere-pre-remap：
  在 equirectangular/sphere UV 上处理，然后再 remap。
```

每个 360/VR 特效必须明确自己属于哪一种空间，不能只写“加一个 overlay”。

### 3.11 音频节奏

代表特效：

```text
beat flash
bass pulse
beat cut
beat stutter
waveform glow
drop zoom
marker from beat
```

推荐链路：

```text
音频分析
  -> beat / onset / energy markers
  -> 写入 MarkerTrack 或 AudioFeatureTrack
  -> 用户选择生成效果
  -> 生成 effect events / path patches / cut suggestions
```

不要让音频分析直接改画面。音频只应该生成可检查、可编辑、可撤销的中间轨道。

## 4. 后端平面视频开源包调研

结论：GitHub 上能找到可用的视觉效果包，但我们不应该马上用某个包替代当前后端渲染主链路。当前主链路已经是：

```text
FFmpeg decode pipe
  -> OpenCV equirectangular remap
  -> apply_frame_effects
  -> FFmpeg encode pipe
```

这条链路适合继续作为主干。外部包应该以 adapter 形式接入。

| 包 / 项目 | 链接 | 能解决什么 | 接入方式 | 风险 | 建议 |
| --- | --- | --- | --- | --- | --- |
| FFmpeg / libavfilter | https://github.com/FFmpeg/FFmpeg / https://ffmpeg.org/ffmpeg-filters.html | 标准视频滤镜、转码、overlay、drawtext、xfade、音频处理 | 保持当前 FFmpeg decode/encode；必要时增加 filtergraph adapter | filtergraph 拼装复杂；不同 build 支持的 filter 不一致 | 必选基础能力 |
| OpenCV | https://github.com/opencv/opencv | per-frame 图像处理、mask、remap、blur、warp、轮廓、追踪 | 继续在 `apply_frame_effects` 中用 Python/OpenCV handler | CPU 性能压力；复杂效果要优化 | 当前首选实现层 |
| frei0r | https://github.com/dyne/frei0r | 大量视频效果插件，包括调色、模糊、扭曲等 | 通过 FFmpeg `frei0r` filter 或单独插件 adapter | GPL/许可证要确认；Windows/部署要测试；参数模型偏简单 | 适合 R&D adapter |
| libplacebo | https://github.com/haasn/libplacebo | 高质量 GPU 视频处理、色彩、HDR、缩放、deband、dither、custom shader | 通过 FFmpeg libplacebo filter 或未来 GPU render adapter | GPU/headless 环境复杂；build 要求高 | 中长期高质量滤镜方向 |
| MoviePy | https://github.com/Zulko/moviepy | Python 视频编辑、合成、标题、简单特效原型 | 用于离线原型或测试生成，不进入主渲染热路径 | 比直接 FFmpeg 慢；生产稳定性要评估 | 原型工具，不做主干 |
| MLT Framework | https://github.com/mltframework/mlt | 完整视频编辑框架，支持 filter/transition/compositing | 作为外部渲染 backend 或参考架构 | 引入后会改变后端架构边界 | 暂不接入，作为参考 |
| G'MIC | https://github.com/GreycLab/gmic | 大量图像滤镜、艺术化、变形、光影处理 | CLI/libgmic 对单帧或序列处理，或用于生成素材 | 不是视频编辑主框架；参数和性能要验证 | 适合离线滤镜/素材实验 |
| gl-transitions | https://github.com/gl-transitions/gl-transitions | GLSL 转场集合 | 作为 shader 资源库或前端 WebGL 预览参考 | 后端直接运行需要 GL adapter | 可做转场灵感库 |
| ffmpeg-gl-transition | https://github.com/transitive-bullshit/ffmpeg-gl-transition | 让 FFmpeg 使用 gl-transitions 的实验 filter | 自定义 FFmpeg build，启用 `gltransition` | 需要改 FFmpeg build；无 releases；维护风险 | 只做实验，不进 MVP |

## 5. 外部包接入原则

### 5.1 adapter 边界

外部视觉包不能直接散落在 effect handler 里。每个包都应该有独立 adapter：

```text
effect_handlers.py
  -> apply_xxx(frame, t_ms, event)
  -> external_adapters/frei0r_adapter.py
  -> external_adapters/libplacebo_adapter.py
  -> external_adapters/ffmpeg_filtergraph_adapter.py
```

handler 负责我们自己的 effect contract；adapter 负责包的调用细节。

### 5.2 参数归一

不要把外部包的参数直接暴露给前端。

正确做法：

```text
前端/后端共享参数：
  strength: 0..1
  color: "#ffffff"
  softness: 0..1
  progressCurve: "linear" | "ease-in" | "ease-out"

adapter 内部转换：
  strength -> frei0r amount
  color -> BGR/RGB/LUT
  softness -> kernel size
```

这样以后替换实现库时，不会破坏用户项目文件。

### 5.3 可复现

有随机性的效果必须带 seed：

```text
noise-burst:
  seed: 12345
  intensity: 0.6
  density: 0.3
```

同一个 session、同一个 effect event、同一个后端版本应该输出稳定结果。

### 5.4 能力探测

后端启动时应该能报告可用能力：

```text
opencv: available
ffmpeg: available
ffmpegFilters:
  xfade: true
  drawtext: true
  frei0r: false
  libplacebo: false
frei0rPlugins:
  loaded: false
gpu:
  libplacebo: false
```

前端 catalog 可以根据能力把效果标记为：

```text
enabled
previewOnly
exportUnsupported
experimental
```

## 6. 建议的新增顺序

### 第一批：无脑预设闭环

目标不是一次性做很多强大的效果，而是验证三类最小输入模型：

```text
一键转场：
  用户短按或按住，系统自动生成遮挡/闪白。

一键扭曲：
  用户短按，系统自动生成固定中心、固定强度、固定曲线的 pulse。

一键运镜：
  用户短按，系统自动生成固定方向、固定速度、固定时长的 path patch。
```

建议第一批只选这些：

```text
transition.flash_white
distort.lens_pulse_soft
frame.hero_push
frame.reveal_pull
frame.drift_left_parallax
```

验收：

```text
PC 预览真实改变像素。
VR 预览能看到对应实体或 shader。
后端 render-test 输出真实效果。
effect catalog、runtime state、effect event、backend handler 全链路一致。
用户不需要打开参数面板。
用户不需要选择方向、速度、半径或曲线。
```

### 第二批：扩展同族预设

目标是在第一批成功后，快速补同族预设，让用户开始真正感觉“可剪”。当前已经先落地了 `frame.impact_shake`、`filter.blur` 的 `soft-blur` 预设、`filter.chromatic_aberration` 的 `rgb-split` 预设。

```text
transition.dip_to_white
transition.dip_to_black
distort.lens_pulse_strong
distort.wave_hit
frame.drift_right_parallax
frame.impact_shake  已落地：Frame 4
filter.blur / soft-blur  已落地：Color 6
filter.chromatic_aberration / rgb-split  已落地：Glitch 1
frame.roll_pulse_soft
frame.look_up_reveal
frame.look_down_reveal
```

验收：

```text
同一分类下每个数字键都是一个明确预设。
预设命名表达效果，不暴露技术参数。
用户连按多个预设时，冲突、覆盖和叠加规则稳定。
```

### 第三批：验证滤镜和图层

目标是在无脑预设前提下，把滤镜和简单图层纳入系统。

```text
filter.vignette_soft
filter.blur_hit
filter.color_boost_cyan
overlay.center_caption_quick
overlay.beat_label
```

验收：

```text
滤镜也是一键预设，不要求调色参数。
图层先使用模板，不要求用户现场排版。
PC DOM 和 VR A-Frame 可以分别预览。
后端可以稳定合成到最终 MP4。
```

### 第四批：实验型外部包

目标是验证外部包，而不是承诺产品能力。

```text
frei0r distortion / color plugin
libplacebo LUT / deband
G'MIC light leak / artistic filter
gl-transitions shader transition
```

验收：

```text
能跑出对照样片。
能被 effect registry 包装。
失败时不影响主渲染链路。
许可证和部署成本有明确结论。
```

## 7. 新增特效的标准 PR 清单

新增任何正式特效时，至少检查：

```text
后端：
  effect catalog 有定义。
  effect registry 有 handler 或明确 fallback。
  handler 有参数默认值和边界保护。
  render-test 能输出视觉变化。

前端：
  effects panel 由 catalog 渲染。
  输入状态机能触发。
  运行时状态只走状态池，不 import 兄弟组件内部实现。
  PC preview adapter 存在或明确 unsupported。
  XR preview adapter 存在或明确 unsupported。

协议：
  eventName 稳定。
  params 可序列化。
  previewTarget / renderStage 明确。
  previewAccuracy 明确。

测试：
  至少有一个 PC 预览断言。
  如果支持 VR 预览，至少有 A-Frame entity 或 shader 状态断言。
  如果支持导出，至少有 render-test 像素或帧差异断言。
```

## 8. 短期推荐目标

下一步最适合做三个“小而完整”的无脑预设范例：

```text
推荐 1：white flash
  状态：已实现第一版。
  类型：一键转场 / hold envelope
  输入：短按生成 260ms 闪白；按住则按住多久持续多久，设置最大时长。
  原因：复用黑场输入和 viewport-mask 预览，后端只要换颜色/曲线。

推荐 2：lens pulse soft
  类型：一键扭曲 / preset pulse
  输入：短按生成 650ms 镜头鼓起脉冲。
  参数：center = 当前 viewport 中心，radius / strength / curve 全部使用预设。
  原因：验证真实像素变形，但不把参数选择交给用户。

推荐 3：advanced fixed camera presets
  类型：一键运镜 / viewport_path preset
  输入：短按生成 hero_push / reveal_pull / drift_left_parallax 三个固定 path patch。
  参数：全部由预设决定，不暴露方向、速度、曲线面板。
  原因：验证路径类特效，证明特效系统不只是 overlay；同时适合“看一遍就能剪”。

暂不进入短期实现：little planet / tiny planet
  原因：它不是普通 FOV 运镜，而是 stereographic projection / 全景重投影。
  后续方向：等 PanoramaProjectionRenderer 和 backend projection remap 方案稳定后，再作为 projection effect 处理。
```

我建议顺序是：

```text
white flash
  -> lens pulse soft
  -> hero_push / reveal_pull / drift_left_parallax
```

这样三个样例刚好覆盖：

```text
转场
扭曲变形
镜头移动
```

等这三个跑通后，再扩展：

```text
dip to black / white
drift left / right
tiny shake
vignette soft
blur hit
quick caption
beat flash
```

原则保持不变：默认给用户预设，不把专业参数暴露到主剪辑流程里。
