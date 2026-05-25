# Three Official Interactive Lab 手柄交互与拆分计划

日期：2026-05-24

本文专门记录 `/xr/three-official-interactive-lab` 当前的 Quest / WebXR 手柄按键交互，以及后续如何把交互逻辑从 `ThreeOfficialInteractiveLab.tsx` 中拆出去。

相关代码：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
apps/web/src/components/three/three-official-lab/constants.ts
apps/web/src/components/three/three-official-lab/runtimeHelpers.ts
apps/web/src/components/three/three-official-lab/types.ts
apps/web/e2e/three-official-interactive-lab.spec.ts
```

## 是否可以继续拆交互

可以，而且应该拆。

当前 `ThreeOfficialInteractiveLab.tsx` 里已经拆出了 UI、样式、常量、类型和纯 helper，但最重的一块仍然留在主文件里：

```text
WebXR controller listener
synthetic test event listener
select / squeeze / thumbstick / quick menu 状态机
ray -> sphere hit -> ViewTargetPose
crop frame / reticle / target ring 的实时更新
semantic event 派发
React state 写入
```

建议下一步不要一次性抽走整个 Three 场景，而是先抽交互适配层：

```text
useThreeOfficialControllerInput
  负责绑定 select/squeeze/thumbstick/B button/synthetic events
  负责把原始输入转换成高层动作

threeOfficialInteractionOperations
  负责 playPause / lock / setFov / setMaskOpacity / start/end crop / create effect 等动作入口

threeOfficialRayTargeting
  负责 ray、sphere hit、ViewTargetPose、smooth move 的几何计算
```

理想方向是：

```text
raw XR input
-> input adapter
-> semantic operation
-> scene state / React state
-> timeline bridge / backend bridge
```

而不是继续：

```text
controller event
-> 直接改 React state
-> 直接 dispatch semantic event
-> 顺手改 mesh / material
```

## 当前真实 WebXR 手柄输入

### 1. Trigger / Select

来源：

```text
controller.addEventListener("selectstart")
controller.addEventListener("selectend")
```

当前绑定：

```text
renderer.xr.getController(0) -> left
renderer.xr.getController(1) -> right
```

行为：

| 输入 | 条件 | 行为 |
| --- | --- | --- |
| 单手 trigger 按下 | 任意手 | 进入 pending head-gaze 判断；提示 “hold to steer viewfinder” |
| 单手 trigger 短按释放 | 按住时间 < 280ms | 用该手 controller ray 命中 360 sphere，平滑移动 view target |
| 单手 trigger 长按 | 按住超过 280ms | viewfinder 跟随头显 gaze |
| 长按后释放 | followMode 为 `head_gaze` | 提交头显 gaze 为最终 view target |
| 左右 trigger 在 160ms 内同时按下 | dual select combo | 播放 / 暂停视频 |

对应语义事件：

```text
playPause
setViewTarget
lockViewport
flushPath reason=lock
```

当前 UI 状态变化：

```text
短按 ray click -> LOCKED
长按 head gaze -> GAZE / PENDING，释放后 LOCKED
双 trigger -> 播放状态变化
```

测试入口：

```text
window.dispatchEvent(new CustomEvent("three-official-controller-select", {
  detail: { hand: "right", phase: "start", rayOrigin, rayDirection }
}))
```

### 2. Grip / Squeeze

来源：

```text
controller.addEventListener("squeezestart")
controller.addEventListener("squeezeend")
```

当前左右手含义不同：

| 输入 | 行为 |
| --- | --- |
| left squeeze start | 开启 opacity modifier |
| left squeeze end | 关闭 opacity modifier |
| right squeeze start | 进入 controller ray 连续拖动 view target |
| right squeeze end | 提交当前 controller ray 指向的 view target |

右手 grip 拖动流程：

```text
right squeeze start
-> followMode = controller_ray
-> uiMode = DRAG
-> controllerAimStart
-> 每帧用 right controller ray preview view target
-> right squeeze end
-> commitViewTarget
-> controllerAimEnd
```

左手 grip 修饰流程：

```text
left squeeze start
-> leftGripModifier = true
-> uiMode = OPACITY
-> 右摇杆改为控制 mask opacity

left squeeze end
-> leftGripModifier = false
-> uiMode 回到 LOCKED / IDLE
```

测试入口：

```text
window.dispatchEvent(new CustomEvent("three-official-controller-squeeze", {
  detail: { hand: "right", phase: "start", rayOrigin, rayDirection }
}))
```

### 3. Right Thumbstick

来源：

```text
inputSource.gamepad.axes[3] ?? inputSource.gamepad.axes[1]
```

合成测试入口：

```text
window.dispatchEvent(new CustomEvent("three-official-thumbstick", {
  detail: { hand: "right", y: 1 }
}))
```

行为分两种：

| 条件 | 行为 |
| --- | --- |
| 未按 left grip | 右摇杆上下连续调 FOV |
| 正在按 left grip | 右摇杆上下连续调 mask opacity |

FOV 行为：

```text
deadzone = 0.18
max speed = 34 deg/s
release debounce = 260ms
```

触发语义：

```text
nudgeFov
flushPath reason=fov
```

Opacity 行为：

```text
mask opacity min = 0
mask opacity max = 0.95
max speed = 0.72 / s
```

当前 opacity 只更新本地 UI / shader uniform，不派发 timeline semantic event。

### 4. Right B Button / Quick Menu

来源：

```text
inputSource.gamepad.buttons[5].pressed
```

当前假设：

```text
right controller button index 5 -> B button / quick menu button
```

行为：

| 输入 | 行为 |
| --- | --- |
| B press | 打开 quick menu |
| B hold + aim | 更新当前 tile selection |
| B release | 执行当前选中 action 并关闭 |

Quick menu 当前是 3x3 tile：

```text
START      END        RENDER
CUT        LOCK       BLACK
FOV +      FOV -      WHITE
```

内部 action：

| action | 行为 |
| --- | --- |
| startCrop | 开始 crop workflow |
| endCrop | 结束 / seal crop workflow |
| render | preview render |
| cut | dispatch cutHere |
| lock | lock / unlock viewport |
| blackFade | create black fade effect |
| whiteFlash | create white flash effect |
| fovIn | FOV -5 |
| fovOut | FOV +5 |

当前测试覆盖：

```text
center point -> lock
top-left tile -> startCrop
```

合成测试入口：

```text
window.dispatchEvent(new CustomEvent("three-official-quick-menu", {
  detail: { phase: "press", pointerPosition }
}))
window.dispatchEvent(new CustomEvent("three-official-quick-menu", {
  detail: { phase: "aim", pointerPosition }
}))
window.dispatchEvent(new CustomEvent("three-official-quick-menu", {
  detail: { phase: "release", pointerPosition }
}))
```

## HTMLMesh / 空间按钮交互

Three official lab 还有一类不是物理按键，而是 controller ray 点空间 UI。

当前路径：

```text
InteractiveGroup.listenToXRControllerEvents(controller)
HTMLMesh(domElement)
DOM button click listener
```

也就是说，手柄 ray 可以点到 HTMLMesh 上的 DOM button，最后触发普通 DOM click。

### Player rail 按钮

来源：

```text
button[data-player-action]
```

当前动作：

| action | 行为 |
| --- | --- |
| PLAY_TOGGLE | 播放 / 暂停 |
| PREV | 上一个 source |
| NEXT | 下一个 source |
| RATE_0_5 | 播放 0.5x |
| RATE_1 | 播放 1x |
| RATE_2 | 播放 2x |
| RECORD_TOGGLE | 开始 / 结束 crop recording |
| RECORD_RATE_DOWN | recording rate -0.25 |
| RECORD_RATE_RESET | recording rate = 1 |
| RECORD_RATE_UP | recording rate +0.25 |
| SELECT_SOURCE | 切换 source |
| TOGGLE_UI | DIM / RESTORE player rail |

### Workbench 按钮

来源：

```text
button[data-action]
button[data-module]
```

当前高频动作：

| action | 行为 |
| --- | --- |
| CUT | cutHere |
| LOCK | lock / unlock viewport |
| FOV_IN | FOV -5 |
| FOV_OUT | FOV +5 |
| YAW_LEFT | yaw -5 |
| YAW_RIGHT | yaw +5 |
| PITCH_UP | pitch +5 |
| PITCH_DOWN | pitch -5 |
| START_CROP | start workflow |
| END_CROP | end workflow |
| RENDER | render workflow |
| PLAY | play / pause |
| SAVE / FLUSH | flushPath reason=live |
| DISCARD | discardRange + flush |
| RESTORE | restoreRange + flush |

当前 module：

```text
FRAME / FOV / FX / WORKFLOW / BGM / EXPORT / SESSION / SAMPLER
```

module 现在主要改变 `openModule` 和 workbench UI 状态；旧的中央 popup 已经移除。

## 非手柄但相关的屏幕输入

PC / test 环境也支持 canvas 点击 360 sphere：

| 输入 | 行为 |
| --- | --- |
| canvas click | raycast sphere，平滑移动 view target |
| ctrl/cmd + canvas click | raycast sphere，立即提交 view target |

这不是 Quest 手柄交互，但它复用了同一套：

```text
ray -> sphere hit -> ViewTargetPose -> commit / smooth move
```

因此后续应归到 `rayTargeting` helper，而不是放在 React 组件内。

## 当前交互代码为什么适合拆

现在主文件里的交互逻辑有三类职责混在一起：

```text
1. 输入读取
   WebXR select/squeeze/gamepad axes/buttons
   synthetic CustomEvent
   canvas pointer

2. 状态机
   dual select combo
   head-gaze hold
   controller ray drag
   thumbstick FOV debounce
   left grip opacity modifier
   quick menu press/aim/release

3. 执行动作
   setFovValue
   setMaskOpacityValue
   commitViewTarget
   toggleVideoPlayback
   start/end/render crop workflow
   createWorkflowEffect
   emitSemantic
```

拆分时不要把这三类继续放在同一个文件里。

## 建议拆分结构

### 第一刀：输入绑定 hook

```text
apps/web/src/components/three/three-official-lab/useThreeOfficialControllerInput.ts
```

职责：

```text
bind selectstart/selectend
bind squeezestart/squeezeend
read gamepad axes
read B button
bind synthetic CustomEvent
cleanup listeners
```

不应该负责：

```text
创建 scene / renderer
创建 HTMLMesh
修改 React JSX
发 backend request
渲染 UI
```

### 第二刀：交互状态机

```text
apps/web/src/components/three/three-official-lab/controllerInteractionState.ts
```

职责：

```text
dual select combo state
head gaze hold state
thumbstick FOV debounce state
quick menu state
controller ray override state
```

这部分可以先是普通 factory：

```text
createControllerInteractionState()
```

不要急着做 React hook。

### 第三刀：ray targeting helper

```text
apps/web/src/components/three/three-official-lab/rayTargeting.ts
```

职责：

```text
readObjectForward
ray -> sphere intersection
direction -> ViewTargetPose
pointer -> ViewTargetPose
controller -> ViewTargetPose
smooth target interpolation
```

当前已有一部分在 `runtimeHelpers.ts`，但仍有一些 raycaster / sphere hit 逻辑留在主文件里。

### 第四刀：quick menu runtime

```text
apps/web/src/components/three/three-official-lab/quickMenuRuntime.ts
```

职责：

```text
create quick menu tile meshes
place quick menu
update tile selection
open / close
dispose materials
```

它可以只暴露：

```text
open(anchor)
aim(pointer/controller)
release()
tickBButton()
dispose()
```

### 第五刀：scene runtime hook

最后再考虑：

```text
useThreeOfficialSceneRuntime
```

职责：

```text
renderer / scene / camera
video sphere
crop mask
HTMLMesh planes
controller models
animation loop
cleanup
```

这一步风险最大，因为它会碰到大量 refs、state setters、semantic emitters。建议在前四刀完成后再做。

## 拆分顺序建议

安全顺序：

```text
1. 先抽文档中列出的类型和状态结构，不改变行为。
2. 抽 ray targeting helper，跑 sphere click / controller ray tests。
3. 抽 quick menu runtime，跑 B hold quick menu tests。
4. 抽 controller input binding，跑全部 controller tests。
5. 最后抽 scene runtime hook。
```

每一步至少跑：

```text
npm --workspace apps/web run typecheck
npx playwright test -c apps/web/playwright.config.ts e2e/three-official-interactive-lab.spec.ts -g "controller|thumbstick|quick menu|PC-style player controls|player-rail workflow"
```

## 当前测试覆盖的手柄交互

已有 e2e 覆盖：

```text
dual select 播放/暂停
right trigger short ray click
right grip hold ray drag
right thumbstick FOV
left grip + right thumbstick opacity
B hold quick menu lock
B hold quick menu startCrop
player rail workflow controls
backend path samples without coordinate sign drift
```

还缺的测试：

```text
trigger long hold -> head gaze follow -> release commit
left trigger ray click
right B quick menu fovIn / fovOut / render / effects
real HTMLMesh controller ray click player buttons
right thumbstick negative direction
left grip + right thumbstick negative opacity direction
quick menu close without selected action
```

## 结论

当前交互已经足够复杂，继续留在 `ThreeOfficialInteractiveLab.tsx` 会拖慢后续 UI 迭代。

最值得先拆的是：

```text
controller input binding
controller interaction state
ray targeting
quick menu runtime
```

暂时不建议第一步就拆整个 Three scene runtime。先把“输入怎么被解释成动作”从主文件拿出来，风险更小，也更容易写测试。
