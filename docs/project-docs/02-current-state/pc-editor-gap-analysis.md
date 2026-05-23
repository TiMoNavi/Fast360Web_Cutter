# PC Editor 功能缺口分析

日期：2026-05-23

## 结论

Quest 3 的交互设计给 PC editor 最大的启发是：PC 不应该只做“键盘微调取景框 + 导出”的页面，而应该成为同一套剪辑语义的桌面工作台。后端已经能接收的能力包括取景路径、FOV、cut/enable、效果事件、播放状态、BGM 选择和 render-test；PC editor 目前只把其中一小部分做成了可用交互。

现在的 PC editor 更像“取景路径录制器”。它可以播放 360 视频、用 WASD/QE/按钮调整 crop mask、flush path、cut、start/end crop、render-test、选择 BGM 并试听 BGM 本身。但它还没有把 Quest 设计里的几类核心动作补齐：音频随视频播放预览、大角度视角/选框移动、点选目标移动、锁定/跟随旋转、效果事件真正落后端、discard/restore、以及清晰的编辑状态机。

## Quest 设计带来的启发

Quest 设计不是把 PC UI 搬进头显，而是把剪辑动作抽象为 operation：

```text
输入设备 -> semantic operation -> ViewPathPatch / EffectEventsPatch / PlaybackClientState
```

这反过来也要求 PC editor 不要把能力停留在几个按钮上。PC 端应该成为更完整的 operation 调用者：鼠标、键盘、DOM 面板、未来的 XR controller 都应触发同一套语义，而不是各自写一套剪辑逻辑。

Quest 设计里最值得迁回 PC 的交互有四类：

1. 指向式移动：点击视频里的目标角度，把取景框中心平滑移动过去。
2. 跟随式移动：按住某个键或鼠标模式，让取景框跟随 camera/head-gaze/mouse ray，松开后锁定并 flush。
3. 锁定语义：区分“正在预览跟随”和“已锁定取景”，避免自然浏览时误写路径。
4. 低频复杂功能进面板：音频、效果、导出、session 状态等不抢高频输入，但必须能真正写入后端。

## 后端实际已经能接收什么

后端当前可接收的剪辑语义比 PC editor UI 暴露出来的更多：

```text
ViewPathPatch:
  center.yaw / center.pitch
  fov.h / fov.v
  enabled
  cut
  locked / smoothFollow / input 等取景语义

EffectEventsPatch:
  type / eventName
  displayName
  startMs / endMs
  params
  renderPolicy

SessionMusic:
  musicId
  enabled
  startMs = 0
  gainDb

PlaybackClientState:
  播放状态上报，当前不持久化，不参与导出

render-test:
  读取取景点和效果事件
  支持部分已注册视觉效果
  如果启用 session music，会把单 BGM mux 进导出 MP4
```

已注册或协议上可表达的效果包括 black.solid、transition.fade_black、transition.flash_white、filter.color_grade、filter.blur、filter.vignette、filter.chromatic_aberration、overlay.letterbox、overlay.text、highlight。也就是说，PC editor 现在不是被后端卡住，而是前端没有把这些能力做成真实编辑入口。

## PC Editor 当前已有能力

当前 PC editor 已经有这些基础：

```text
播放:
  播放 / 暂停
  seek
  播放列表
  playback rate
  recording rate

取景:
  WASD 连续移动 mask center
  Q/E 调整 FOV
  右侧按钮做 yaw/pitch/FOV 步进
  平滑移动动画
  crop mask opacity
  flush path
  cutHere

工作流:
  start crop
  end crop
  render-test
  download export

音频:
  读取 music tracks
  选择/清除 session BGM
  试听 BGM 文件本身

效果:
  有 Effects Rack UI 和快捷键外壳
  但目前只做选择反馈，没有发送 EffectEventsPatch
```

## 主要缺口

### 1. 音频播放没有进入剪辑预览

PC editor 现在的 BGM 控件可以选择曲目，并且能单独试听 BGM 文件；但它没有和主视频播放时间、seek、play/pause、导出预览语义绑定。

缺口：

```text
主视频播放时 BGM 不跟随播放。
视频 pause / seek / rate 改变时，BGM preview 不同步。
只能设置 session music，不能直接听到“当前成片会是什么声音”。
gainDb 有后端字段，但 PC UI 没有音量调节。
没有展示“导出会从 output 0:00 对齐”的时间轴关系。
没有原视频声 / BGM 混合预览，也没有 mute/ducking 预留入口。
```

建议：

```text
P0:
  BGM preview 跟随主视频 play/pause/seek。
  增加 gainDb slider，并保存到 PUT /api/cut-sessions/:sessionId/music。
  明确当前是 output timeline 0ms 对齐，不跟随 source skip。

P1:
  增加 master mute、BGM mute、source audio mute。
  在 render 前显示当前 BGM 是否启用、gainDb、曲目名。

P2:
  再考虑 fade in/out、ducking、beat marker。
```

### 2. 大角度视角变动没有桌面级交互

Quest 设计强调点选目标、ray follow、smooth move。PC 现在只有 WASD 连续移动和按钮每次 5 度移动；它适合微调，不适合从画面左后方跳到右前方这种 60-180 度的大角度重构。

缺口：

```text
没有“点击视频目标 -> 取景框中心移动到该 yaw/pitch”的交互。
usePcMaskPointerInput 已有 screenPointToViewCenter 逻辑，但当前没有接入 active editor。
Ctrl+drag / Ctrl+Shift+click 在文档里标记为暂时下线。
大角度移动只能多次按键或按钮，效率低，也不利于形成稳定关键帧。
```

建议：

```text
P0:
  恢复“Shift/Ctrl + click stage -> moveMaskTo(pointer yaw/pitch)”。
  用 120-220ms 平滑动画，结束后 flushPath(reason=lock)。

P1:
  增加“点击目标点”的视觉反馈：target ring、当前 yaw/pitch、移动中状态。
  对大于 90 度的移动做更长 easing，避免画面突然跳。

P2:
  支持双击直接添加 cut=true 的大角度切换点，和普通平滑移动区分。
```

### 3. 取景框锁定、跟随旋转、预览/提交边界不清晰

后端和 timeline bridge 已经有 locked、smoothFollow、controllerAimStart/controllerAimEnd、lockViewport/unlockViewport 等语义。PC 端 UI 现在没有把这些做成明确模式。用户看到的是 mask 在移动，但很难知道它是“正在预览”“正在采样”“已锁定”还是“即将 flush”。

缺口：

```text
没有 Lock / Unlock 控件。
没有“按住跟随 camera/mouse，松开锁定”的 PC 等价交互。
自然拖动视角和写入取景路径之间边界不够清楚。
PcTrajectoryRippleCorrector 有 bindMaskAndCameraBy，但没有完整输入模式接入。
timeline reducer 支持 locked，但 PC crop-mask source 基本没有暴露锁定状态。
```

建议：

```text
P0:
  增加 Lock toggle，触发 lockViewport / unlockViewport / toggleLock。
  UI 展示 locked / sampling / pending patch 状态。

P1:
  增加“按住 L 或鼠标中键：mask 跟随 camera/mouse ray；松开：lock + flush”。
  browsing mode 和 editing mode 分离，避免用户只是转视角时写入路径。

P2:
  增加 horizon lock / view.follow / view.look_at 这类更高级 view 语义，但要先确认后端 timeline 如何表达。
```

### 4. 鼠标点选角度移动选框没有真正接入

代码里已经有 `screenPointToViewCenter` 和 pointer input hook，说明之前意识到了这个问题。但 `usePcEditorControls` 现在返回的 `handleMaskPointerDown/Move/Leave` 是 undefined，active 页面也没有把 pointer handler 接到 stage 上。

缺口：

```text
无法直接用鼠标在 360 画面上点一个目标。
无法拖拽 mask 或按住 modifier 移动 mask。
无法把屏幕坐标稳定转换为 mask center 后提交。
edge pan 也处于未接入状态。
```

建议：

```text
P0:
  接回 usePcMaskPointerInput 的 click-to-move 分支。
  stage 层接 pointer handlers。
  避开按钮、slider、面板等 interactive target。

P1:
  接回 drag 模式：按住 Ctrl 拖拽时 bindMaskAndCameraBy。
  支持 B/Escape 取消当前拖拽并回到 dragStart。

P2:
  加边缘平移和拖拽捕获状态显示。
```

### 5. Effects Rack 只是 UI，没有写入后端

PC editor 的 Effects Rack 看起来已经有分类、快捷键和选中反馈，但它没有调用 `createEffectEvent`，也没有发 `EffectEventsPatch`。这导致后端已经支持的效果系统在 PC 上基本不可用。

缺口：

```text
点击效果 tile 不会创建 EffectEvent。
没有效果 duration、start/end、params 编辑。
没有展示已保存 effect events。
Clip events 区域仍显示 No timeline events。
没有 pending/accepted/error 状态。
快捷键选择效果后只是 1.2s UI 反馈。
```

建议：

```text
P0:
  把常用效果映射到后端 type：
    Black fade -> transition.fade_black
    White/Flash -> transition.flash_white
    Blur -> filter.blur
    Vignette -> filter.vignette
    Text -> overlay.text
  点击后 dispatch createEffectEvent，默认 durationMs 800-1200。

P1:
  增加当前时间点 effect marker 列表。
  支持删除/禁用某个 effect range。
  参数面板支持 opacity、strength、radius、text 等基础 params。

P2:
  speed/time 类效果不要先伪装成普通 frame effect，应进入 editSegments 或明确标记为 marker。
```

### 6. Discard / Restore 没有产品化入口

Quest 设计里 Left Grip hold 标记 discard range；后端 ViewPathPoint.enabled 和 discard/restore reason 已经能表达跳过/恢复意图，timeline assembler 文档也把 enabled=false 作为跳过源片段的基础。但 PC editor 目前没有让用户选择一段并 discard/restore 的入口。

缺口：

```text
没有 mark discard start/end。
没有 restore range。
没有 discard band / timeline marker。
cutHere 只有瞬时 cut 点，不等于删除片段。
```

建议：

```text
P0:
  在 Workbench 增加 Mark out / Restore here 或 Discard range 的最小入口。
  先用当前时间和一个明确按钮流程，不做复杂 timeline。

P1:
  加底部 mini timeline，显示 discarded ranges。
  支持 Undo last discard。
```

### 7. 播放与取景 timeline 的关系还不够可见

PC editor 已上报 playback state，也能采样 path patch，但用户无法直观看到哪些时间段已经有取景点、哪些点已 accepted、哪里有 gap、哪里有 cut/effect/music。

缺口：

```text
没有真正的剪辑时间线。
只展示 lastAcceptedPathPatch JSON。
pending/queued/accepted 对普通用户不可读。
没有 source time 和 output time 的区别提示。
没有 coverage/gap 反馈。
```

建议：

```text
P0:
  用简化状态条显示 current time、pending points、last accepted revision。
  用 human-readable 文案替代裸 JSON。

P1:
  增加 mini timeline：
    path coverage
    cut markers
    effect markers
    discard ranges
    BGM enabled

P2:
  接 timeline assembler build report，用 ready/partial/not_ready 解释导出可信度。
```

### 8. PC 和 Quest 的 operation 还没有完全共用成产品层

现在 PC controls、Quest probe、A-Frame input、timeline bridge 之间已经有共同语义的雏形，但 PC editor 仍有一些交互直接停留在组件本地，Quest 也主要是 probe/原型事件。

缺口：

```text
playPause / seekTo 语义类型存在，但 AFrameTimelineBridge 当前主要处理 path/effect/sampling，播放命令仍在播放器控制器里。
PC EffectsPanel 没有接 timeline operation。
PC BGM 是独立 API 控件，不进入 unified operation 层。
Quest controller 真实输入还没有映射成完整剪辑操作。
```

建议：

```text
P0:
  梳理 PcEditorOperations：
    playback
    view/mask
    timeline
    effects
    audio
  所有 UI 控件只调用 operation，不直接散落 API 调用。

P1:
  Quest input adapter 和 PC input adapter 都调用同一套 semantic operation。
```

## 优先级建议

### P0：把 PC editor 从取景录制器补成可用剪辑器

```text
1. 接回鼠标点选移动选框。
2. 增加 Lock / Unlock 和明确的采样状态。
3. BGM 跟随视频播放/暂停/seek，并支持 gainDb。
4. Effects Rack 点击后真正发送 createEffectEvent。
5. Workbench 用可读状态替代 last patch JSON。
```

### P1：补齐大角度和片段级编辑

```text
1. Ctrl drag / hold follow / release lock。
2. 大角度 smooth move 和 target ring。
3. discard / restore range。
4. mini timeline 显示 path/cut/effect/audio。
5. effect params 最小编辑。
```

### P2：进入高级剪辑语义

```text
1. speed ramp / freeze / reverse 进入 editSegments，而不是普通 effect。
2. audio fade / ducking / beat markers。
3. horizon lock / look_at / follow rotation 等高级 view track。
4. timeline assembler build report 接入 PC 导出前检查。
```

## 一句话判断

PC editor 当前欠缺的不是后端能力，而是把后端已有协议和 Quest 设计里的高频剪辑语法转成桌面端可用交互。下一步最划算的是先补“点选大角度移动 + 锁定/跟随 + 音频同步预览 + 效果真实落库”这四件事；它们一补，PC editor 才会从 demo 工作台变成真正能剪 360 视频的 editor。
