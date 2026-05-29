# Player V2 VR 输入问题分析

更新日期：2026-05-27

这份文档记录 Quest 真机反馈后的问题分析。当前结论：播放器 3D UI 的按钮和进度条是唯一相对可信的 VR 交互路径；背景球取景、手柄姿态到 mask center、播放列表、环形菜单都不能继续假设“事件已经正确，只是细节要调”。需要先重建一套可观测、可校准的 VR 输入坐标与 hit-test 基线。

## 真机现象

1. 播放器 UI 基本正常：射线能 hover / click，播放器按钮可触发，进度条点击逻辑可用。
2. 除播放器以外的 3D UI 存在点击失败：播放列表无法点击，其他工作台/弹层也不稳定。
3. 所有“射线或手柄驱动球形遮罩移动”的逻辑都有问题：
   - 单 trigger 点背景移动 mask 位置不对。
   - 摇杆移动 mask 方向/位置不对。
   - 双 grip 头显中心追踪不对，表现像追到背后方向。
   - 这说明问题不只是某个 button event，而是坐标系、ray 命中点、head gaze、mask shader 坐标之间没有统一。
4. 视频列表 3D UI 无法点击，预览图无法加载。
5. 环形菜单期望交互尚未按目标实现：
   - B 键按住时出现。
   - 菜单位置跟随手柄坐标刷新。
   - 菜单面向头显方向。
   - 手柄本体坐标或射线 hover 某个环形分区 0.5 秒打开下一级。
   - 下一级 1 秒没有 hover 或 selection 则收回。
   - 松开 B 键整个环形菜单收回。

## 2026-05-28 重大补充：模拟器正常，Quest 真机异常

新的实验结论：

```text
Meta WebXR Emulator / 浏览器 DevTools 模拟环境:
  双 trigger 正常
  双 grip 正常
  A/B/X/Y 等类似按钮正常
  遮罩控制相关链路在模拟环境中能工作

Meta Quest 真机 / Quest Browser:
  双 trigger 正常
  双 grip 和其它类似按钮不可靠或无效
  遮罩无法连续追踪
```

这说明问题不应再默认归因为 Player V2 的业务事件总线或 workflow。更高概率的根因是：

1. Meta WebXR Emulator 的 controller/gamepad 模型和 Quest Browser 真机不一致。
2. 真机上的 grip / squeeze / secondary buttons 可能没有以 A-Frame 期望的 `gripdown` / `gripup` 形式稳定冒泡。
3. 真机上的 `XRInputSource.gamepad.buttons` index、pressed/value 阈值、`profiles` 顺序，可能和模拟器配置不同。
4. 真机可能优先发送 WebXR 标准的 `squeezestart` / `squeezeend` 到 `XRSession`，而不是 A-Frame controller entity event。
5. Quest Browser 某些版本存在 controller / input source / gamepad 初始化或重连问题，模拟器无法覆盖这类问题。

网上资料与这个方向一致：

| 来源 | 链接 | 相关信息 |
| --- | --- | --- |
| MDN WebXR input 文档 | https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs | WebXR 的 primary squeeze action 会在 `XRSession` 上发送 `squeezestart`、`squeeze`、`squeezeend`；额外按钮、轴和更多能力要通过 `XRInputSource.gamepad` 读取。 |
| Immersive Web input explainer | https://immersive-web.github.io/webxr/input-explainer.html | 输入设备 profile 会决定是否有 trigger、squeeze、thumbstick，不能把所有控制器都假设成同一个固定按钮表。 |
| Meta Immersive Web Emulation Runtime 文档 | https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html | 模拟器控制器是根据 `XRDeviceConfig` 生成的虚拟 gamepad；例如可以直接 `updateButtonValue("squeeze", 0.5)`。这说明模拟器会按配置产生理想化输入，不等于 Quest Browser 真机。 |
| Meta Immersive Web Emulator 仓库 | https://github.com/meta-quest/immersive-web-emulator | 该扩展会向页面注入 WebXR runtime，在桌面浏览器中模拟 Quest 设备；它证明模拟环境可用，但不能替代真机 browser/input source 生命周期。 |
| Babylon.js 社区案例 | https://forum.babylonjs.com/t/webxr-emulator-controller-has-wrong-button-mapping/32753 | 有社区记录 WebXR emulator button mapping 与实际期望不一致的问题，说明 emulator/input mapping 本身就可能与设备路径产生偏差。 |
| Immersive Web SDK Stateful Gamepad | https://iwsdk.dev/concepts/xr-input/stateful-gamepad | 推荐按 input profile component id 读取 `xr-standard-squeeze`，而不是硬编码 button index。 |

因此，当前最高优先级不再是继续改业务语义，而是建立真机输入诊断：

```text
Quest 真机 xrDebug=1
  显示 session inputSources.length
  显示每个 inputSource.handedness / profiles / targetRayMode
  显示 gamepad 是否存在
  显示 gamepad.mapping
  显示 buttons[index].pressed / value / touched
  显示 axes
  显示 XRSession selectstart/selectend/squeezestart/squeezeend 是否到达
  显示 A-Frame controller entity gripdown/gripup 是否到达
  显示 resolved leftGrip/rightGrip/dualGrip
```

如果 DevTools 模拟器全部正常但 Quest 真机不正常，修复策略应该转向：

1. 不依赖单一路径。双 grip 需要同时监听 `XRSession` 的 `squeezestart/squeezeend`、A-Frame entity 的 `gripdown/gripup`、以及 gamepad polling。
2. 不硬编码 grip index。至少在 debug 模式里输出所有 button value，再按真机数据校准 `squeeze` / `grip` 对应 index 和阈值。
3. 不以模拟器通过作为真机通过。模拟器只证明 app 内部事件链可用；Quest 真机必须单独验收。
4. 对 Quest Browser 版本做记录。每次真机测试记录 headset 型号、Horizon OS 版本、Meta Quest Browser 版本、A-Frame 版本。

## 2026-05-28 ADB/CDP 真机实测：事件到达，但仍需验证持续追踪

通过 USB ADB 连接 Quest 3，并用 Chrome DevTools Protocol 检查线上页面：

```text
设备: Quest 3
页面: https://pivotcompute.store/xr/player-v2
Quest Browser: OculusBrowser/146.1.0.43.53.975492479
Chromium: Chrome/146.0.7680.188
scene.is("vr-mode"): true
renderer.xr.isPresenting: true
```

关键发现：

1. Quest 真机并不是完全收不到手柄事件。`trigger`、`grip/squeeze`、`A/B/X/Y` 都能在页面事件层被捕获。
2. `XRSession.inputSources.length` 在真机上可读为 `0`，但 `squeezestart/selectstart` 事件本身仍然携带 `event.inputSource.handedness` 和 profiles。因此不能把 `inputSources.length === 0` 当作“无控制器”的判断依据。
3. A-Frame `tracked-controls.controller` 可为 `-1`，但 controller entity 仍然能产生 `triggerdown/gripdown/abuttondown` 等事件，也能维护部分 `buttonStates`。
4. 事件里的 `detail.hand` 多数为空。可靠手性来源应按优先级使用：

```text
event.inputSource.handedness
event.target.id: left-controller / right-controller
controller entity attribute: hand / data-hand
```

本轮捕获到的事件计数：

```text
session:selectstart   7
session:selectend     8
scene:triggerdown     7
scene:triggerup       8
left/right trigger    正常

session:squeezestart 10
session:squeeze      10
session:squeezeend   10
scene:gripdown       10
scene:gripup         10
left/right grip      正常

scene:abuttondown/up 2
scene:bbuttondown/up 1
scene:xbuttondown/up 2
scene:ybuttondown/up 2
```

双 grip 时间线也出现过实际重叠，例如：

```text
left squeezestart
right squeezestart  +42ms
dual grip active    约 70-220ms
left/right squeezeend
left/right gripup
```

这说明“Quest 真机不发 grip 事件”不是当前最佳解释。更准确的当前判断是：

```text
Quest 真机事件层:
  有事件，有左右手信息，有 grip/trigger/A/B/X/Y。

应用遮罩控制层:
  仍未证明双 grip 按住期间能连续调用 trackMaskToCenter。
  需要记录 grip down -> runtime pressed -> headFollowActive -> trackMaskToCenter -> viewTarget.center 的整条链路。
```

下一步真机验证必须从“事后读按钮状态”升级为“按住期间采样”。因为松开以后 `data-left-grip-pressed=false` 是正常结果，不能用它证明按住时没有进入追踪。

建议加入临时诊断：

```text
xrDebug=1
  lastControllerEvent: name / hand / targetId / inputSource.hand
  leftGripPressed / rightGripPressed / dualGripPressed
  headFollowActive
  trackMaskToCenter call count
  headGazeCenter yaw/pitch
  viewTarget.center yaw/pitch
  per-frame mask center delta
```

真机验收动作应改为：

1. 按住双 grip 至少 3 秒，不要只点按。
2. 按住期间缓慢转头 30-60 度。
3. 诊断面板必须显示 `dualGripPressed=true`、`headFollowActive=true`、`trackMaskToCenter` 持续增加。
4. `viewTarget.center` 应在按住期间连续变化，松开只负责 commit，不应该第一次跳变。

### 第二轮真机按住测试结论

用户按住双 grip 并转头后，ADB/CDP 探针读到：

```text
squeezestart: 4
squeezeend:   4
gripdown:     8
gripup:       8

dual grip active window #1: 约 5743ms
dual grip active window #2: 约 6712ms
```

这轮可以确认：

1. 真机双 grip 不是短促抖动，确实可以保持 5-7 秒。
2. 应用暴露的 `player-v2-immersive-state` 在 gripdown 后能看到 `data-left-grip-pressed=true`、`data-right-grip-pressed=true`。
3. controller raw `buttonStates[1]` 也能看到 grip value / pressed。
4. controller raycaster 在按住期间主要命中 `pc-mask-background-hit-target`。

但按住结束后读取 mask shader：

```text
aframe-crop-mask-preview.uniforms.uCenterYaw:   0
aframe-crop-mask-preview.uniforms.uCenterPitch: 0
aframe-viewport-mask-effect-preview.uCenterYaw: 0
aframe-viewport-mask-effect-preview.uCenterPitch: 0
```

因此当前最佳判断更新为：

```text
已基本排除:
  Quest 真机收不到 grip
  双 grip 判定无法保持
  controller ray 完全打不到背景 target

仍然高度可疑:
  readHeadGazeCenter(scene) 在 Quest 真机沉浸模式返回 null 或固定 0/0
  syncHeadFollow 启动了，但 tickHeadFollow 没有持续运行
  mask.trackMaskToCenter 被调用，但 target 一直是 0/0
  PcTrajectoryRippleCorrector 收到 target，但没有把 change 写到 WEBXR_CROP_MASK_CENTER_EVENT / shader uniform
```

下一步修复不应该再围绕 grip event 本身，而应该给双 grip head follow 增加一条真实可观测链路：

```text
gripdown
  -> runtime left/right grip true
  -> headFollowActive true
  -> readHeadGazeCenter result yaw/pitch
  -> trackMaskToCenter(target) call count + target
  -> PcTrajectoryRippleCorrector onMaskCenter emitted center
  -> WEBXR_CROP_MASK_CENTER_EVENT detail
  -> pc-crop-viewport-mask uniform uCenterYaw/uCenterPitch
```

### 已实施修复：双 grip head follow 的 runtime 兜底

本地修复集中在两处：

```text
PlayerV2.tsx
  emitMaskGestureCenter(center, phase)
    -> 先同步写 setPcEditorViewTarget(center)
    -> 再继续发 editor.viewport.center.set

PlayerV2Spatial3DUiLayer.tsx
  双 grip head follow 每帧仍优先调用 mask.trackMaskToCenter(center)
  如果连续多帧发现 runtime center 没有变化，而 head gaze target 与 runtime center 有明显距离
    -> 调用 mask.setPreviewCenter(center) 作为真机兜底
```

这个修复的意图：

1. 正常情况下继续走 PC 已有的 `PcTrajectoryRippleCorrector.trackMaskToCenter`，保留速度/加速度/平滑。
2. Quest 真机如果出现 `trackMaskToCenter` 已被调用但 runtime/viewTarget 没有实时推进的情况，双 grip 不再卡死在 `0/0`。
3. 兜底只在双 grip head-follow 的 stall 场景触发，不改变 PC 普通鼠标/键盘路径，也不改变 trigger 背景点选和摇杆路径。

本地验证：

```text
npm run typecheck:web
PASS

PLAYWRIGHT_BASE_URL=http://127.0.0.1:4317 npx playwright test e2e/player-v2-immersive-ui.spec.ts -g "dual grip"
PASS

PLAYWRIGHT_BASE_URL=http://127.0.0.1:4317 npx playwright test e2e/player-v2-immersive-ui.spec.ts -g "background trigger|left grip"
PASS
```

### 第三轮真机反馈：yaw+/yaw- 能动，但双 grip 不动

新的现象：

```text
left grip + stick / yaw+ / yaw- 类操作:
  遮罩可以移动。

dual grip head follow:
  视窗不移动。
  眼前出现黑色团块/闪烁，像 shader 输入异常。
```

这进一步收窄了问题：

1. 遮罩 shader、`viewTarget`、`editor.viewport.center.set`、PC/VR 的相对 yaw/pitch nudge 链路是活的。
2. 问题不应再描述为“遮罩不能移动”，而应描述为“双 grip 读取到的 head gaze target 不可信”。
3. 黑色团块说明不能在 head gaze 异常时强行 `setPreviewCenter`。如果 center 出现 `NaN`、无限值、反向大跳变，直接喂 shader 会污染画面。

已调整策略：

```text
readHeadGazeCenter(scene)
  -> 沉浸模式优先读实时 XR/A-Frame camera direction
  -> fallback 才使用 runtime cameraPose.center
  -> 所有 direction / center 必须 Number.isFinite

dual grip head follow
  -> 只调用 trackMaskToCenter
  -> 移除激进的 setPreviewCenter stall fallback
  -> 如果 head gaze target 单帧跳变超过 90 度，跳过这一帧
```

进一步修正：不能优先返回 runtime `cameraPose.center`，因为它在 Quest 真机上可能是旧的 `0/0`，会遮住真实 XR camera。现在双 grip 目标直接从实时 camera direction 解算 yaw/pitch；runtime 只作为最后 fallback。

新的判断：下一轮真机直接读取 `data-head-yaw/pitch` 和 `data-mask-yaw/pitch`。只要 yaw+/yaw- 能动而双 grip 不动，优先查 head gaze，不再查 shader 输出链路。

### 第四轮 ADB 结论：head gaze 能读到，trackMaskToCenter 路径不推进

进入沉浸 UI 后，线上真机页面已经加载新包，且可以读到实时 XR camera：

```text
scene.renderer.xr.isPresenting: true
XR camera center: yaw -149.5 / pitch 12.1
mask center:      yaw -32.3  / pitch 18.0
```

随后用 CDP 在页面内合成双 grip：

```text
scene.dispatchEvent(gripdown left)
scene.dispatchEvent(gripdown right)

data-left-grip-pressed:  true
data-right-grip-pressed: true
XR camera center:        -149.5 / 12.1
mask center:             -32.3 / 18.0
```

结论：

1. 双 grip handler 能执行，左右 grip runtime state 能变 true。
2. Quest / A-Frame 能提供实时 XR camera direction。
3. 遮罩不动的原因不是“拿不到头显角度”，而是 `mask.trackMaskToCenter(center)` 这条 corrector 路径在真机/线上没有把 change 推进到 `viewTarget`。
4. `yaw+ / yaw-` 能动，是因为它直接发 `editor.viewport.center.set`，绕过了 `trackMaskToCenter`。

因此双 grip head follow 改为：

```text
按住双 grip:
  每帧读取 XR camera direction
  direction -> yaw/pitch
  直接 emit editor.viewport.center.set(commit:false, input:"head_gaze")

松开双 grip:
  emit editor.viewport.center.set(commit:true)
```

这牺牲了一部分 PC corrector 的平滑，但先保证 Quest 真机可用；后续如需手感，再在 VR 层做一个直接输出 center.set 的轻量 smoothing，而不是依赖当前失效的 `trackMaskToCenter` 路径。

### 第五轮真机反馈：能动但不平滑

用户确认双 grip 已经能移动，但运动非常不平滑。处理策略：

```text
继续绕过 trackMaskToCenter
  因为该路径在 Quest 真机上不推进 viewTarget。

在 VR 层新增 head-follow smoothing
  current = 上一帧已输出的 mask center
  target = 当前 XR camera yaw/pitch
  stepTowardTarget(config, current, target, velocity, deltaSeconds)
  每帧直接 emit editor.viewport.center.set(commit:false)
  松开双 grip emit commit:true
```

使用参数：

```text
maxSpeedDegPerSecond:        185
accelerationDegPerSecond2:   760
brakeDegPerSecond2:          980
settleDistanceDeg:           0.025
settleSpeedDegPerSecond:     0.12
```

这条路径保留 Quest 真机已验证可动的 `center.set`，同时恢复速度、加速度、刹车和球面 slerp 手感。后续如果仍觉得慢，可以优先微调 `maxSpeedDegPerSecond`；如果仍觉得抖，优先降低 `accelerationDegPerSecond2` 或增加目标低通。

### 第六轮真机反馈：只在 gripdown 更新一次，不持续刷新

现象：

```text
dual grip:
  按下瞬间位置更新。
  按住后不持续刷新。

left grip + stick:
  也需要一起保证连续移动。

single trigger:
  至少要能稳定移动到 ray / background hit 对应位置。
```

原因判断：

1. 之前持续循环每帧依赖 `runtime.vrControllers[hand].buttons.grip.pressed`。
2. Quest 真机上 runtime pressed 可能被 A-Frame/gamepad polling 抖成 false，或者 `session.inputSources.length` 为 0 导致 polling 不可靠。
3. 结果是 `gripdown/squeezestart` 启动了一帧，下一帧 `isDualGripPressed()` 认为已经松开，于是停止 head-follow RAF。

已实施修复：

```text
heldButtonsRef
  gripdown / squeezestart  -> held true
  gripup / squeezeend      -> held false

dual grip head-follow
  每帧使用 heldButtonsRef 判断是否仍按住
  不再只依赖 runtime pressed

left grip + stick
  同样使用 heldButtonsRef 判断 grip modifier
  增加 thumbstickmoved / axismove 事件轴缓存
  如果 XRSession.inputSources 无 axes，则使用最近 220ms 的事件轴值

single trigger
  triggerup 命中 background / controller ray center 后直接 setPreviewCenter
  不再走可能在真机不推进的 moveMaskTo/corrector 路径
```

本地验证：

```text
npm run typecheck:web
PASS

PLAYWRIGHT_BASE_URL=http://127.0.0.1:4317 npx playwright test e2e/player-v2-immersive-ui.spec.ts -g "background trigger|dual grip|left grip"
PASS
```

## 2026-05-28 重大补充：DevTools 能点，Quest 真机吞非播放器 3D UI

新的更精确发现：

```text
浏览器 DevTools / Meta WebXR Emulator:
  工作台、播放列表、环形菜单等 3D UI hover / pressed / click 都能触发。

Meta Quest 真机:
  播放器栏 hover / click 正常。
  工作台、播放列表、环形菜单等类似按钮的 hover 特效和点击效果被吞。
```

这说明非播放器 3D UI 的业务 command、EventBus 映射、workflow 大概率不是主因；模拟器已经证明这些链路可以跑通。更高概率的问题在 Quest Browser 真机的 A-Frame controller ray / cursor 事件分发：

1. 真机 raycaster 可能已经命中 `.clickable`，但没有稳定派发 `mouseenter` / `mousedown` / `mouseup` / `click` 到目标元素。
2. 真机可能只在 controller entity 或 scene 上产生 `triggerdown` / `triggerup` / `selectstart` / `selectend`，而没有把它们转换成目标 hit element 的 DOM 风格鼠标事件。
3. 播放器栏没被吞，说明它的 hit slot 尺寸、距离、姿态和事件监听更接近 Quest Browser 的稳定路径；非播放器 UI 不能继续只依赖 A-Frame 自动 click。
4. `renderOrder` 不是主要判断依据。A-Frame raycaster 主要看几何交点和距离，视觉渲染层级不会决定 click 目标。真正需要确认的是当前 controller raycaster 的 `intersections[0]` 是哪个 spatial target。

短期修复方向：

```text
useSpatialButtonEvents
  -> 保留 mouseenter / mousedown / mouseup / click
  -> 额外每帧 polling controller raycaster.intersections，补 hover
  -> 监听 scene triggerdown/selectstart，当前 ray target 进入 pressed
  -> 监听 scene triggerup/selectend，当前 ray target 手动触发 onClick
```

这条兜底只应该加在共享空间 UI 事件层，优先覆盖工作台、播放列表、环形菜单；播放器栏保持当前已知可用实现，避免把正常链路也搅动。

2026-05-28 真机复测后仍不可用，补充判断：

```text
fallback 监听 trigger/select 仍不够
  -> 说明不是只有 click 事件没派发
  -> 更可能是当前 raycaster first spatial target 被 blocker 抢走
```

非播放器 UI 的 blocker 和按钮都带 `data-spatial-ui-hit="true"`。如果真机 raycaster 的 `intersections[0]` 返回的是 blocker，fallback 会认为当前没有命中具体按钮，于是 hover/click 仍然不会进按钮。播放器栏没出现这个问题，可能是因为它的 hit slot 更靠前、尺寸更大、blocker 与 control 的空间关系更稳定。

因此共享空间 UI 事件层需要区分：

```text
data-spatial-ui-control="true"  -> 真正按钮 / slider / item / ring segment
data-spatial-ui-blocker="true"  -> 只负责挡背景，不参与按钮选择优先级
```

raycaster fallback 选择目标时应优先取最近的 `control`，只有没有 control 时才退回 blocker。这样 blocker 仍能防止背景穿透，但不会吞掉工作台、播放列表和环形菜单的按钮反馈。

## 已知正确路径：播放器 UI

播放器 UI 可以作为 3D UI 交互的参考实现。

关键文件：

```text
../3DUI/hybrid-player/HybridSkinPlayerBar.tsx
../3DUI/shared/SpatialPlayerLayout.ts
../3DUI/shared/SpatialUiInteraction.ts
../Aframe/player-v2/immersive-ui/PlayerV2Spatial3DUiLayer.tsx
```

播放器进度条关键点：

```text
raycaster intersection
  -> event.detail.intersection.uv.x
  -> progress = clamp(uv.x, 0, 1)
  -> player.seekTo(timeMs)
  -> PlayerV2Spatial3DUiLayer
  -> player.playback.seek
```

播放器 UI 可靠的原因：

| 点 | 做法 |
| --- | --- |
| hit target | 每个控件有明确 hit slot，而不是只靠一张大面片。 |
| progress 坐标 | 直接读 hit plane 的 `intersection.uv.x`，不自己把世界坐标反推局部坐标。 |
| ray blocker | 有 `data-ray-blocking="true"` 和 `data-spatial-ui-hit="true"`，能阻止背景球穿透点击。 |
| 反馈 | hover / pressed 会重绘控制层，用户能看见是否命中。 |
| 事件出口 | 先发 `Spatial3DUiAction`，再由 Player V2 装配层转成 EventBus 事件。 |

后续修播放列表、工作台、环形菜单，应优先复用这个模式：独立 hit slot + `useSpatialButtonEvents` + 明确 `data-spatial-target-id` + 可见 hover/pressed 反馈。

## 失效区域一：背景 ray 到 mask center

当前相关文件：

```text
../mask_controller/inputs/usePcMaskRayTargetInput.ts
../mask_controller/webxr/AFrameMaskBackgroundTarget.tsx
../mask_controller/operations/viewGeometry.ts
../mask_controller/webxr/AFrameCropViewportMask.tsx
../Aframe/media/AFrameVideoSphere.tsx
```

当前风险点：

| 风险 | 说明 |
| --- | --- |
| 背景 hit sphere 跟随 camera 位置 | `AFrameCropViewportRig` 会被 `pc-crop-viewport-player-rig` 放到 camera world position；如果直接用 world point 算 direction，会带入 camera 高度/位置偏移。 |
| 视频球有 `rotation="0 -90 0"` | 视频纹理、mask shader、A-Frame camera forward、ray hit sphere 可能不在同一个 yaw 原点。 |
| fallback 使用 controller `getWorldDirection` | 如果没有真实背景 intersection，就会退到 controller forward。真机上如果 raycaster 没打到背景 sphere，会表现成固定偏移或固定方向。 |
| mask shader 和 A-Frame rotation 约定相反 | 代码里已有注释：A-Frame 正 Y rotation 和 mask shader yaw convention 相反。说明统一坐标前不能随便复用方向公式。 |

需要先建立四个坐标定义：

| 名称 | 应该表示什么 | 必须校验 |
| --- | --- | --- |
| `headGazeDirection` | 头显中心看向的世界方向 | 看正前方时应等于当前画面中心，不应追到背后。 |
| `controllerRayDirection` | 手柄射线世界方向 | 单 trigger 点背景时应和 visible laser 一致。 |
| `backgroundHitDirection` | 从 camera/ray origin 指向背景命中点的方向 | 必须减去 ray origin 或背景球中心，不能直接用 world point。 |
| `maskCenter` | crop mask shader 使用的 yaw/pitch | 和 `AFrameCropViewportMask`、arcs、bounds broadcaster 同源。 |

建议新增一个临时 XR debug overlay，显示：

```text
head yaw/pitch
controller left/right yaw/pitch
background hit yaw/pitch
mask center yaw/pitch
last event source id
```

并在真机上做 5 个校准动作：

1. 头显正看视频正前方，双 grip：mask 应回到画面中心。
2. 头显向左 30 度，双 grip：mask 应到当前视野中心，不应反向。
3. 右手 laser 点当前视野中心，单 trigger：mask 应到 laser 点。
4. 点左上/右上/左下/右下四角：mask 移动方向必须和手柄 laser 一致。
5. left grip + 左摇杆：左右应改 yaw，上下应改 pitch，且不应受到头显朝向反向影响。

## 失效区域二：手柄按钮和摇杆状态

当前相关文件：

```text
../Aframe/player-v2/immersive-ui/PlayerV2Spatial3DUiLayer.tsx
../state/runtimeStateStore.ts
```

当前实现同时依赖两类输入：

| 输入来源 | 用途 | 风险 |
| --- | --- | --- |
| A-Frame controller events | `triggerdown`, `gripdown`, `abuttondown`, `xbuttondown`, `ybuttondown`, `bbuttondown`, `thumbstick*` | Quest Browser / A-Frame 事件名和 hand 映射不一定稳定。 |
| WebXR `inputSource.gamepad` polling | axes、button fallback | button index 需要真机校准；不同 profile 可能不完全一致。 |

从真机现象看，单个按钮事件可能有到达，但组合动作不可信。下一步应把 button/axes 的实时值可视化：

```text
left.buttons[0..5]
right.buttons[0..5]
left.axes
right.axes
resolved: trigger/grip/x/y/a/b
```

再确认 Quest Touch 的实际映射：

| 语义 | 预期 hand | 预期 index | 待真机确认 |
| --- | --- | --- | --- |
| trigger | left/right | 0 | 是 |
| grip | left/right | 1 | 是 |
| X | left | 4 | 是 |
| Y | left | 5 | 是 |
| A | right | 4 | 是 |
| B | right | 5 | 是 |
| thumbstick axes | left/right | `[2,3]` 或 `[0,1]` | 是 |

## 失效区域三：播放列表点击和缩略图

当前相关文件：

```text
../playlist/PcPlaylistPanel.tsx
../3DUI/playlist-popup/SpatialPlaylistPopup.tsx
../data/videoSources.ts
../../../../lib/api.ts
apps/api/app/main.py
apps/api/app/storage.py
```

平面 UI 的播放列表逻辑：

```text
PcPlaylistPanel item click
  -> ui:playlist-source-select:click
  -> player.source.select payload { sourceId }
  -> usePlayerSourceWorkflow
  -> switchWebXrPlayerSession / update active source
```

3D 播放列表逻辑：

```text
SpatialPlaylistPopup SourceHitPlane
  -> onSelectSource(source)
  -> Spatial3DUiAction { type: "player.source.select", source }
  -> PlayerV2Spatial3DUiLayer
  -> player.source.select payload { sourceId }
```

可能问题：

| 问题 | 说明 |
| --- | --- |
| hit plane 层级 | Popup 有 `PopupRayBlocker` 和 item hit planes；如果 blocker 比 item 更先被 raycaster 命中，item hover/click 可能被挡住。播放器 UI 应作为参考，为 item 独立 hit plane 设置更明确的 z/renderOrder。 |
| root pose | 播放列表 root 复用播放器 root pose，但 popup local offset 在上方/侧边；可能超出 controller ray 的舒适命中区域。 |
| texture thumbnail CORS | 3D popup 用 canvas `drawImage(image)` 画缩略图。图片跨域或 cookie 不可用会污染 canvas 或加载失败。 |
| `apiUrl` loopback 规则 | 如果 Quest 打开的是局域网地址，而 `NEXT_PUBLIC_API_BASE_URL` 是 localhost，`apiUrl` 会返回相对 URL，要求 Next 代理/同源路由能访问 `/thumbnails/...`。如果当前页面没有代理这些后端静态文件，平面 UI 和 3D UI 都可能拿不到图。 |
| 后端缩略图生成 | `/api/videos` 会调用 `ensure_video_thumbnail`，返回 `thumbnailUrl: /thumbnails/{id}.jpg`；如果缩略图文件不存在或生成失败，前端只会显示 fallback。 |

需要核对：

1. 在 Quest 浏览器直接打开某个 `thumbnailUrl` 是否 200。
2. 平面 UI `<img src={source.thumbnailUrl}>` 是否能显示同一张图。
3. 3D canvas `ensureThumbnail` 是否收到 `onload`，还是 `onerror`。
4. 如果平面 UI 正常、3D 不正常，重点查 canvas CORS / image `crossOrigin="anonymous"` 与 cookie/static headers。
5. 如果平面 UI 也不正常，重点查 `/thumbnails` 静态挂载、API base URL、后端 thumbnail 文件。

## 失效区域四：其他 3D UI 点击

播放器能点，播放列表/工作台不能点，说明问题可能在空间 UI hit target 设计不一致。

对比：

| 组件 | 当前模式 | 风险 |
| --- | --- | --- |
| `HybridSkinPlayerBar` | 控件 slot + progress uv + blocker | 已知可用。 |
| `SpatialPlaylistPopup` | 大 canvas 面片 + blocker + item planes | blocker 可能盖住 item；item plane 坐标可能和纹理区域不完全对齐。 |
| `ArwesWorkbenchSpatialTable` | 大表格 canvas + region box hit targets | region box depth/renderOrder/position 可能没进入 raycaster 首选命中。 |
| `SpatialEffectRingMenu` | 多 ring segment hit targets | 还没有按“手柄坐标 + hover dwell”目标重做。 |

建议统一标准：

```text
root
  visual planes: 不参与 raycast，或 renderOrder 较低
  ray blocker: 只挡背景，不抢控件
  control hit planes: class clickable + data-spatial-ui-hit + data-spatial-target-id
```

并加调试模式：

```text
?debug3dui=1
  -> 所有 hit plane 显示 wireframe
  -> hover target id 显示在 camera toast
  -> last clicked target id 显示在 camera toast
```

## 总体解决方案：VR 不应绕过 PC 运镜层

当前最关键的判断：VR 问题不是“单个按钮事件错了”，而是 VR 端把输入、坐标转换、运动平滑、mask shader 目标值混在了一起。PC 端之所以可用，是因为它已经有明确分层：

```text
键盘 / 鼠标 / 指针
  -> 输入适配器
  -> motionSmoothing / PcTrajectoryRippleCorrector / PcMaskOperations
  -> editor.viewport.* events
  -> workflow
  -> viewTarget / crop mask shader
```

VR 端现在更像：

```text
手柄 / head gaze / controller ray
  -> PlayerV2Spatial3DUiLayer 内部直接换算 yaw/pitch/fov/roll
  -> editor.viewport.* events
  -> workflow
```

这会导致两个问题：

| 问题 | 结果 |
| --- | --- |
| VR 没有统一复用 PC 的速度、加速度、刹车、line ripple filter、track 逻辑 | 摇杆和双 grip 看起来生硬、跳变，甚至只有 release 时才像是“瞬移到一次最终位置”。 |
| VR 在事件层直接产出 `center.set`，但没有统一校准 head gaze / controller ray / background hit / shader center 的坐标协议 | 单 trigger、摇杆、双 grip 可能分别错在不同方向，靠调 offset 会越修越乱。 |

结论：不要先复制一堆 magic number 到 VR。优先把 PC 的 motion 核心抽成共享层；VR 只负责把手柄状态翻译成“目标中心 / 目标速度 / modifier 状态”。

## 推荐架构：共享 Viewport Motion Driver

推荐新增一个不依赖 DOM、不依赖 A-Frame 的共享 driver，放在 `mask_controller/operations` 或 `interactions` 附近。它只处理数学和运动状态：

```text
ViewportMotionDriver
  输入:
    currentCenter
    targetCenter
    axisVector
    deltaSeconds
    mode: "axis" | "track" | "moveTo"
    config: speed / acceleration / brake / deadzone / filter

  输出:
    nextCenter
    phase: "start" | "change" | "end"
    commit
    motionId
```

它应该复用现有代码里的这些能力：

| 现有能力 | 文件 | VR 复用方式 |
| --- | --- | --- |
| yaw/pitch 归一化、最短 yaw delta、球面 slerp | `motionSmoothing.ts` | 所有 VR center 运动都走同一套角度数学。 |
| `axisVelocityStep` | `motionSmoothing.ts` | left grip + 左摇杆不再每帧按轴值直接位移，而是先加速到目标速度，再刹车停下。 |
| `correctLineRippleDelta` | `motionSmoothing.ts` | 过滤摇杆细小抖动，避免 mask 在直线移动时蛇形漂。 |
| `stepTowardTarget` | `motionSmoothing.ts` | 单 trigger 点背景、head gaze track 都可以变成“朝目标平滑追踪”。 |
| `PcTrajectoryRippleCorrector.moveMaskTo` | `PcTrajectoryRippleCorrector.tsx` | trigger 点背景继续使用 PC 的 move-to 手感。 |
| `PcTrajectoryRippleCorrector.trackMaskToCenter` | `PcTrajectoryRippleCorrector.tsx` | 双 grip 跟随头显中心应优先复用这条路径，而不是每帧裸发 `center.set`。 |

如果短期不想抽新 driver，第二选择是复制 PC 的 smoothing 逻辑到一个 `useVrViewportMotion`。但这只是临时方案，复制时必须满足两个条件：

1. 复制的是 `motionSmoothing.ts` 里的纯算法和 PC 参数，不复制 DOM pointer 事件。
2. VR 的输出仍然使用与 PC 相同的 `editor.viewport.center.set` / `editor.viewport.fov.set` 事件格式，带 `motionId`、`meta.phase` 和 `commit`。

## VR 遮罩控制的目标数据流

VR 端应该改成三层，而不是在 `PlayerV2Spatial3DUiLayer` 中一次性完成所有事。

```text
XR raw input
  -> VrControllerStateAdapter
  -> VrViewportIntentAdapter
  -> Shared ViewportMotionDriver / PcMaskOperations
  -> EventBus
  -> workflow
```

### 1. VrControllerStateAdapter

只负责读硬件：

```text
button pressed / touched / value
axes
controller pose
controller ray direction
head pose / head gaze direction
hovered spatial target
```

这一层不应该 emit 剪辑事件，也不应该计算 mask center。它的结果可以写进 runtime state 和 debug overlay。

### 2. VrViewportIntentAdapter

把硬件状态翻译成意图：

```text
dual grip held
  -> intent: track head gaze center

left grip + left stick
  -> intent: axis move mask center

trigger up on background
  -> intent: move mask to ray hit center

left grip + right stick
  -> intent: axis change fov / roll
```

这一层只判断优先级，不做平滑。

优先级应固定为：

```text
dual grip head follow
  > B ring menu
  > active UI rate chip + right stick
  > Y + right stick opacity
  > left grip mask transform
  > trigger select / background point
```

### 3. Shared ViewportMotionDriver / PcMaskOperations

这一层才产生连续运动：

| VR 操作 | 推荐驱动方式 |
| --- | --- |
| 单 trigger 点背景 | `moveMaskTo(rayHitCenter, 520ms / playbackRate)`，复用 PC 点击画面的 move-to 手感。 |
| left grip + 左摇杆 | axis velocity driver：deadzone -> target velocity -> acceleration/brake -> line ripple -> `center.set(change)`；回中刹停后 `center.set(end, commit: true)`。 |
| 双 grip | 每帧读取校准后的 head gaze center，经过 target deadzone + response + max speed，再调用 `trackMaskToCenter(center, 180-420ms)`；松开时 commit。 |
| left grip + 右摇杆 FOV | 复用 PC `Q/E` 的 FOV 速度、加速度、刹车，不直接按轴值跳变。 |
| left grip + 右摇杆 roll | 用同样的 axis velocity 模型，roll 单独归一化到 -180..180。 |
| Y + 右摇杆透明度 | 可以不进 viewport driver，但也应有 deadzone、速度和回中停止。 |

## 是否复制 PC 逻辑

建议顺序：

1. **优先复用**：把 `motionSmoothing.ts` 继续作为唯一数学核心，把 PC 键盘、PC pointer、VR joystick、VR head follow 都接到这套算法。
2. **局部抽象**：把 `usePcViewportKeyboardMotion` 和 `usePcViewportKeyboardFov` 里和键盘无关的速度积分抽成 shared driver。
3. **短期复制**：如果需要很快救真机手感，可以先做 `useVrViewportMotion`，复制 PC 的参数和算法，但保留 TODO，后续收敛回 shared driver。

不建议直接把 `usePcMaskPointerInput` 整个复制到 VR。它包含 pointer lock、DOM stage、mouse move、screen coordinate 到 view center 的逻辑，这些对 Quest 手柄不是同一种输入。应该复用它背后的三类能力：

```text
smooth target follow
smooth mask nudge
trackMaskToCenter
```

而不是复用 DOM pointer 事件本身。

## 坐标协议必须先统一

在接入平滑之前，必须先让这些输入都输出同一个 `PcViewCenter` 语义：

```text
PcViewCenter:
  yaw: 0 表示视频 / mask shader 的正前方
  pitch: 0 表示水平线
  yaw 正方向必须和 PC WASD、mask shader、crop arcs 一致
```

每种 VR 输入都要先通过同一个转换函数：

```text
headGazeDirection -> viewCenter
controllerRayDirection -> viewCenter
backgroundHitPoint - rayOrigin/backgroundCenter -> viewCenter
```

验收动作：

| 动作 | 预期 |
| --- | --- |
| 正看画面中心，双 grip | mask 平滑追到当前视野中心。 |
| 向左转头 30 度，双 grip | mask 向用户视野左侧对应内容移动，不反向、不追到背后。 |
| 右手 ray 点视野中心，trigger | mask 移到 laser 命中的内容，不落到球面固定偏移点。 |
| ray 点四角 | yaw/pitch 方向和 visible laser 一致。 |
| left grip + 左摇杆右推 | mask yaw 方向和 PC `D` 一致。 |
| left grip + 左摇杆上推 | mask pitch 方向和 PC `W` 一致。 |

坐标协议没过之前，不要再加 `+90`、`-90`、取反这类局部补丁。

## 具体问题到修复策略

| 真机问题 | 可能原因 | 修复策略 |
| --- | --- | --- |
| 3D UI 能点但看不见 hover / pressed | hit plane 有事件，但反馈没有统一绘制，或 hover 状态没有进入 canvas texture repaint | 所有空间按钮统一用播放器的 `useSpatialButtonEvents` 模式，hover/pressed 必须改变视觉层；加 `debug3dui=1` 显示 hovered target id。 |
| 工作台 start/end 看不到切换 | 可能未命中，或命中了但 recording state 没回写到 canvas texture | 先用 hit-plane debug 确认 click target，再确认 `recordingActive` 变化会触发工作台 canvas repaint。 |
| 双 grip 只在松开瞬移 | VR head follow 没走 PC `trackMaskToCenter` 的连续追踪路径，或 change 事件没有让 shader 实时更新 | 双 grip 改成每帧输入 head gaze target，由 shared driver / `trackMaskToCenter` 平滑追踪；release 只负责 commit，不负责第一次移动。 |
| trigger 点背景落到固定偏移 | ray 命中点、ray origin、背景球中心、视频球旋转未统一 | 先显示 background hit center 和 controller ray center；只使用校准后的 `viewCenter` 喂给 `moveMaskTo`。 |
| grip 追踪像到后脑勺 | `getWorldDirection` 的 +Z/-Z 或 yaw convention 反了 | 统一 head gaze 转换函数，并用正看、左转、右转三个校准动作验证。 |
| X 没有视野中心 discard toast | X 事件可能没到，或 discard state active 没变，或 toast 不在 camera children/被遮挡 | debug overlay 先显示 X pressed 和 last event；discard active 后必须在 camera 坐标系中显示 toast。 |
| B 菜单在正前方固定区域 | ring menu pose 当前不是 controller-attached | B down 记录 active hand，菜单 root 每帧跟随该手柄 world position，并 billboard 到 headset。 |
| A 没触发子弹时间 | A/B/X/Y 事件名或 gamepad index 未校准，或右手 handedness 未识别 | debug overlay 显示 gamepad button index 和 resolved semantic button；确认后再接 `player.playback.rate.set(0.1)`。 |

## 环形菜单目标交互

当前 B 键只打开 effect shortcut/ring menu，尚未实现“手柄空间菜单”的完整交互。

目标状态机：

```text
hidden
  B down -> root menu open at controller pose

root menu open
  every frame -> follow controller position, face headset
  hover segment >= 500ms -> open child level
  trigger click segment -> select if leaf
  B up -> close all

child menu open
  every frame -> follow controller position, face headset
  hover child >= 500ms -> preview / arm
  trigger click child -> select effect
  no hover/selection >= 1000ms -> collapse child
  B up -> close all, end active hold effect
```

定位规则：

| 项 | 规则 |
| --- | --- |
| position | 使用按住 B 的那只手柄 world position，向上/向前偏移一小段，避免盖住手柄模型。 |
| facing | 每帧 billboarding 到 headset/camera，不使用固定 world rotation。 |
| hover | 优先用 raycaster intersected segment；如果 ray 不稳定，可用 controller forward 与 segment plane 的交点。 |
| dwell | root 500ms 打开下级；child 1000ms 无 hover 收回。 |
| close | B up 立即关闭，并发送任何 active hold effect 的 end。 |

需要新增的数据：

```text
activeRingHand: "left" | "right"
ringRootPose: { position, rotation }
hoveredRingItemId
hoverStartedAt
childOpenCategoryId
lastChildInteractionAt
activeHoldEffect
```

## 分阶段修复计划

### P0：可观测性

先让真机里能看到输入和坐标，不然每次都在猜。

```text
xrDebug=1
  buttons: raw gamepad buttons + resolved A/B/X/Y/trigger/grip
  axes: left/right raw axes + normalized axes
  ray: controller ray center
  hit: background hit center
  head: head gaze center
  mask: current viewTarget center/fov/roll/opacity
  ui: hovered spatial target / clicked spatial target
  lastEvent: type/source/phase
```

### P1：坐标基线

只修坐标，不修手感：

1. head gaze -> `PcViewCenter` 正确。
2. controller ray -> `PcViewCenter` 正确。
3. background hit point -> `PcViewCenter` 正确。
4. mask shader / crop arcs / runtime `viewTarget.center` 同源。

P1 完成标准：不加平滑，mask 也能瞬移到正确内容位置。

### P2：复用 PC 运镜手感

把 VR 遮罩输入接到 shared motion：

1. 单 trigger 点背景走 `moveMaskTo`。
2. 双 grip 走 `trackMaskToCenter` 或 shared target-follow driver。
3. left grip + 左摇杆走 axis velocity + acceleration + brake + line ripple。
4. left grip + 右摇杆 FOV 复用 PC `Q/E` 的速度模型。
5. release 只做 commit，不做第一次实际移动。

P2 完成标准：双 grip 按住时连续跟随，松开只是确定当前位置；摇杆回中后自然刹停并提交。

### 第七轮映射调整：left grip 拖拽，左右手职责拆开

用户最新真机反馈后，遮罩手柄映射改成更低冲突的三条：

1. 单独按住 left grip：遮罩按 head gaze center 连续拖拽，松开提交。
2. left grip + 左摇杆上下：缩放遮罩 FOV。左摇杆左右暂不绑定，避免缩放时误触 yaw / roll。
3. right grip + 右摇杆上下：调整遮罩透明度。

实现原则：

- 单 left grip 拖拽复用已经能在 Quest 真机上移动遮罩的 `editor.viewport.center.set` 直写路径，并走 `stepTowardTarget` 平滑。
- 只要左摇杆离开 deadzone，就暂停单 left grip 的 head-gaze 拖拽，避免“边缩放边漂移”。
- right grip + 右摇杆透明度替代旧的 `Y + 右摇杆`，让 Y 不再参与遮罩连续调节。
- 双 grip head-follow 保留为双手确认版，优先级仍高于单手拖拽和摇杆缩放。

### 第八轮真机反馈：grip 持续按住不可靠，改为 toggle

ADB/CDP 探针显示：

1. `thumbstickmoved` / `axismove` 会稳定到达 `left-controller` / `right-controller`。
2. `XRSession.inputSources` 仍可能为空。
3. 真机上 `gripdown -> gripup` 可能非常短，后续摇杆运动已经没有“按住 grip”的状态，因此 hold-as-modifier 会被当成裸摇杆并被忽略。

因此 grip 不再作为持续按住 modifier，而改为模式开关：

| 操作 | 新语义 |
| --- | --- |
| left grip click | 开 / 关左手遮罩模式。开启后，左摇杆回中时 head-gaze 拖拽；左摇杆上下时缩放 FOV。 |
| right grip click | 开 / 关右手透明度模式。开启后，右摇杆上下调 opacity。 |
| gripup / squeezeend | 只标记物理释放，不关闭模式。 |
| 第二次 gripdown / squeezestart | 关闭对应模式，并提交当前值。 |

实现补充：

- `readControllerHand()` 增加 `event.inputSource.handedness`、`detail.inputSource.handedness`、`detail.sourceEvent.inputSource.handedness` 兜底。
- `readQuestButtonPressed()` 在 `XRSession.inputSources` 为空时读取 A-Frame `tracked-controls.buttonStates`，用于 grip/trigger/A/B/X/Y 的轮询兜底。
- event-driven button 写入后，不再让空轮询立刻覆盖刚收到的 true 状态。

### 第九轮回退：回到 yaw/pitch 按钮同源的 step 路径

用户指出 `yaw+ / yaw-` 按钮能让遮罩稳定移动。这个对照组说明：

```text
3D UI action
  -> editor.viewport.center.step
  -> workflow
  -> viewTarget.center
  -> mask shader
```

这条链路是可用的。因此 VR 摇杆先从复杂路径回退到同源 step 事件：

| 输入 | 当前基线 |
| --- | --- |
| 左摇杆左右 | 低通轴值后按帧发 `editor.viewport.center.step { yawDelta }`。 |
| 左摇杆上下 | 低通轴值后按帧发 `editor.viewport.center.step { pitchDelta }`。 |
| 右摇杆上下 | 低通轴值后按帧发 `editor.mask.opacity.set { opacity }`。 |
| grip / head gaze / absolute center.set | 暂时退出遮罩核心控制路径，只保留按钮状态同步和调试信息。 |

保留的平滑只在输入侧做：左摇杆轴值低通后输出小步 `center.step` 事件；右摇杆轴值低通后输出小步 opacity 变化。这样既保留手感，又不重新引入 head gaze 坐标、绝对 yaw/pitch、grip modifier、toggle 状态机等变量。

### 第十轮隔离：沉浸模式使用独立 VR viewTarget 写入

用户观察到左摇杆只让遮罩“顿一下”，随后不再持续移动；右摇杆 opacity 也不变化。这更像 PC workflow / timeline / lock / preview 同步在沉浸模式里覆盖了 VR 发出的事件，而不是单个按钮映射错误。

当前处理：

1. 只在 `PlayerV2Spatial3DUiLayer` 的 Quest controller adapter 内直接调用 `setPcEditorViewTarget()`。
2. 这个 adapter 只有 `xrSession.presenting === true` 时启用，因此非沉浸 PC 操作仍走原有 workflow / EventBus。
3. 左摇杆低通后直接写 `viewTarget.center`。
4. 右摇杆低通后直接写 `viewTarget.maskOpacity`。
5. trigger / UI / keyboard 等 PC 兼容路径暂不改。

这一步的目的不是最终架构，而是把 VR 遮罩控制从 PC 遮罩控件链路中隔离出来，验证“沉浸模式单独控制 runtime viewTarget”能否绕开遮罩被锁住的问题。

新增诊断开关：

```text
?vrMaskProbe=1
```

进入沉浸层后，不需要按任何手柄按钮，代码会每帧直接写 `viewTarget.center` 和 `viewTarget.maskOpacity`，让遮罩按正弦曲线移动和闪动。这个 probe 只用于判断“遮罩是否能被代码持续驱动”：

- 如果 probe 能持续移动，说明遮罩渲染和 `setPcEditorViewTarget()` 可用，问题在 controller axes / 手柄事件层。
- 如果 probe 也只动一下然后回弹，说明沉浸模式还有其它同步源在覆盖 `viewTarget`。

### P3：3D UI 命中和反馈

以播放器 UI 为基准统一所有空间 UI：

1. 工作台、播放列表、环形菜单每个可点区域都有独立 hit plane。
2. hit plane 设置 `.clickable`、`data-ray-blocking="true"`、`data-spatial-ui-hit="true"`、`data-spatial-target-id`。
3. hover、pressed、click 都有可见反馈。
4. `debug3dui=1` 可以看见 wireframe 和 target id。

### P4：环形菜单状态机

完成 controller-attached ring menu：

1. B down 在对应手柄处打开。
2. 每帧跟随手柄位置并面向头显。
3. hover 0.5 秒打开子级。
4. 子级 1 秒无 hover / selection 收回。
5. B up 关闭全部，并结束 active hold effect。

## E2E 与真机验收

Playwright 只能验证“事件链能被 synthetic input 触发”，不能证明 Quest 手柄姿态、ray 命中、gamepad axes 在真机正确。因此 VR 遮罩修复要分两类测试：

| 测试类型 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| Playwright / synthetic XR | EventBus、workflow、UI 状态、`viewTarget` 是否响应 | Quest controller pose、真实 ray direction、A/B/X/Y gamepad index、头显内视觉反馈 |
| Quest 真机校准 | 坐标、手感、hover/click 反馈是否真实可用 | 自动回归覆盖较弱 |

最低验收脚本：

1. 进入 VR 后打开 `xrDebug=1`，按 A/B/X/Y/trigger/grip，debug 面板必须显示 resolved button。
2. A 按下后播放器 play rate 变成 `0.1`，再次按下恢复。
3. X 按下后视野中心出现 discard toast，再按一次消失或结束 discard range。
4. 单 trigger 点背景四角，mask 移动方向与 laser 一致。
5. 点一下 left grip 打开模式，转头时 mask 连续跟随当前视野中心；再点一下 left grip 关闭并提交。
6. left grip 模式开启后，左摇杆上下让 mask FOV 连续缩放，左右方向不应误触 yaw / roll。
7. 点一下 right grip 打开模式，右摇杆上下让 mask opacity 连续变化；再点一下 right grip 关闭。
8. 工作台 START/END、播放列表 item、播放器 progress 都有 hover 和 pressed 反馈，并能触发对应状态变化。

## 优先修复顺序

1. 建立 VR debug overlay：显示 hand buttons/axes、head gaze、controller ray、background hit、mask center、last hit target。
2. 修坐标基线：先让 head gaze / controller ray / background hit 都能产出正确 `PcViewCenter`。
3. 把 VR 遮罩驱动接入 PC 已有的 smoothing / track 体系，优先复用 shared motion，短期可复制纯算法但不要复制 DOM pointer 事件。
4. 以播放器 UI 为模板，重做播放列表和工作台 hit plane 层级，确认 click 能进对应 EventBus。
5. 验证缩略图链路：Quest 直接访问 `thumbnailUrl`，再验证 3D canvas image load。
6. 工作台和播放列表统一 `debug3dui` hit plane 可视化。
7. 重写环形菜单为 controller-attached + headset-facing + dwell 状态机。

## 当前不要继续做的事

- 不要继续靠猜测增减 yaw offset，例如 `+90`、`-90`。这会让某个动作看似好了，另一个动作更坏。
- 不要在每个 3D UI 组件里各写一套 hit-test 逻辑。播放器 UI 可用，应抽象或复制它的 hit slot 模式。
- 不要只看 DOM debug state。VR 里的问题必须在头显内显示，否则很难判断手柄事件、ray 命中、坐标转换哪一层错了。
- 不要先优化环形菜单视觉。B 菜单的核心风险是 pose、hover dwell、关闭状态机，不是样式。
### 第十一轮诊断：VR 直接写入必须锁定 crop mask

真机现象“摇杆只让遮罩顿一下，然后又回到原位”与 `AFrameCropViewportMask` 的内部 tick 逻辑一致：当 mask `locked=false` 时，组件每帧都会读取 scene camera 的 head gaze，并把 `center` 重写为头显当前朝向。这样 VR 摇杆、`vrMaskProbe=1` 或其它直接写 `viewTarget.center` 的路径即使成功写入，也会马上被 head-gaze follow 覆盖，视觉上就是不持续移动。

当前修复：

1. `PlayerV2Spatial3DUiLayer` 中的 VR direct viewTarget writer 在沉浸模式下写 `locked: true`。
2. 这只影响 `xrSession.presenting === true` 时启用的 VR adapter，不改变 PC 鼠标、键盘、普通 UI workflow。
3. 增加 `data-mask-locked` 到 `player-v2-immersive-state`，Quest/ADB 调试时可以直接确认遮罩是否仍处于 unlocked/head-gaze 接管状态。
4. e2e 增加“先故意把 A-Frame mask 设为 unlocked，再用左摇杆接管移动”的验证，防止这个 snap-back 问题回归。

判断方法：

- 如果 `data-mask-locked=false`，遮罩会被 head gaze tick 接管，VR 直接驱动会表现为轻微抖动/回弹。
- 如果 `data-mask-locked=true` 且 `data-mask-yaw/pitch` 在变，但头显内画面不变，则问题转向 shader uniform / A-Frame component update。
- 如果 `data-mask-yaw/pitch` 也不变，则问题仍在 controller axes / adapter 是否启用 / 页面是否加载最新代码。
