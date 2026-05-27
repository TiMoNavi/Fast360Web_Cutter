# Three Official 手柄交互与拆分计划

日期：2026-05-25

关联页面：

```text
/xr/three-official-interactive-lab
```

关联现状总览：

```text
docs/project-docs/02-current-state/three-official-interactive-lab-current-state.md
```

本文只记录手柄输入、空间 UI 点击路径和后续拆分计划。页面总体能力和代码债务见当前状态总览。

## 当前代码位置

主实现：

```text
apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
```

辅助文件：

```text
apps/web/src/components/three/three-official-lab/constants.ts
apps/web/src/components/three/three-official-lab/runtimeHelpers.ts
apps/web/src/components/three/three-official-lab/types.ts
apps/web/e2e/three-official-interactive-lab.spec.ts
```

当前拆分只完成了 UI 展示组件、常量、类型和少量 helper。最重的手柄输入解释仍在主组件里。

## 当前真实手柄映射

### Trigger / Select

事件来源：

```text
controller.addEventListener("selectstart")
controller.addEventListener("selectend")
```

当前约定：

```text
renderer.xr.getController(0) -> left
renderer.xr.getController(1) -> right
```

行为：

| 输入 | 条件 | 当前行为 |
| --- | --- | --- |
| 单手 select start | ray 命中 HTMLMesh 可交互 DOM | 触发空间 UI mousedown，阻止 head-gaze pending |
| 单手 select end | 前面按到了 HTMLMesh | 触发 mouseup + click |
| 单手短按 select | 没按到 UI，按住时间小于 280ms | ray 命中视频球，平滑移动 view target |
| 单手长按 select | 按住超过 280ms | 进入 head-gaze follow |
| 长按后松开 | followMode 为 head_gaze | 提交当前头显 gaze 为 view target |
| 左右 select 160ms 内同时按下 | dual select combo | 播放 / 暂停 |
| left grip + right select | 视频播放中 | 标记 discard range 的实验入口 |

语义事件：

```text
playPause
unlockViewport
setViewTarget
lockViewport
flushPath(reason="lock")
discardRange
restoreRange
flushPath(reason="discard")
```

需要复查：discard range 当前沿用了 PC timeline 操作里的 `discardRange` 开始、`restoreRange` 结束模式。这个命名对新读代码的人很反直觉，需要在协议文档里讲清楚，或者重命名成更明确的 range start/end 事件。

### Grip / Squeeze

事件来源：

```text
controller.addEventListener("squeezestart")
controller.addEventListener("squeezeend")
```

当前左右手含义不同：

| 输入 | 当前行为 |
| --- | --- |
| left squeeze start | 开启 opacity modifier |
| left squeeze end | 关闭 opacity modifier，若正在 discard range 则结束 range |
| right squeeze start | 进入 controller ray drag |
| right squeeze end | 提交右手 ray 当前命中点为 view target |

右手 grip drag 流程：

```text
right squeeze start
-> followMode = controller_ray
-> uiMode = DRAG
-> controllerAimStart
-> 每帧用 right controller ray 命中视频球
-> preview view target
-> right squeeze end
-> commitViewTarget
-> controllerAimEnd
```

左手 grip modifier 流程：

```text
left squeeze start
-> leftGripModifier = true
-> uiMode = OPACITY
-> right thumbstick 从 FOV 改成 mask opacity

left squeeze end
-> leftGripModifier = false
-> uiMode 回到 LOCKED / IDLE
```

### Right Thumbstick

读取来源：

```text
inputSource.handedness === "right"
inputSource.gamepad.axes[3] ?? inputSource.gamepad.axes[1]
```

行为：

| 条件 | 当前行为 |
| --- | --- |
| 未按 left grip | right thumbstick 上下连续调 FOV |
| 正在按 left grip | right thumbstick 上下连续调 mask opacity |
| 正在 discard range | thumbstick 输入被忽略 |

FOV 参数：

```text
deadzone = 0.18
max speed = 34 deg/s
flush debounce = 260ms
page clamp = 48 到 112
```

Opacity 参数：

```text
range = 0.00 到 0.95
max speed = 0.72/s
```

注意：timeline bridge reducer 里的 FOV 范围仍是 35 到 110。页面层和协议层范围需要统一。

### Right B / Quick Menu

读取来源：

```text
inputSource.gamepad.buttons[5].pressed
```

行为：

```text
B press
-> open quick menu

B hold + aim
-> update tile selection

B release
-> execute selected action
```

当前菜单数据：

```text
START
END
RENDER
CUT
LOCK
BLACK
WHITE
SAVE
DROP
UNDO
VHS
```

当前执行函数还支持：

```text
fovIn
fovOut
```

但 `QUICK_MENU_ITEMS` 没有暴露这两个 action。后续要么删掉死分支，要么把 FOV 项放回菜单。

left grip + right B：

```text
toggle crop workflow
```

这是一条快速录制入口，当前仍偏 lab。

### Left Menu Button

读取来源：

```text
inputSource.gamepad.buttons[6].pressed
```

行为：

```text
toggleSpatialMenusVisible()
```

它会隐藏或恢复 player/workbench/mode strip/popup，并关闭 quick menu。

按钮 index 5 和 6 是当前 Quest/Meta controller 假设。正式化之前要在真机记录里确认不同浏览器/运行时的稳定性。

## HTMLMesh 空间按钮路径

页面不是只读手柄物理按钮，也支持 controller ray 点击空间 UI。

当前链路：

```text
InteractiveGroup.listenToXRControllerEvents(controller)
HTMLMesh(domElement)
ray -> HTMLMesh uv
HTMLMesh.dispatchEvent({ type: "mousedown" | "mouseup" | "click" })
DOM button listener
data-action / data-module / data-player-action
```

主文件中还手写了一层 ray hit 判断：

```text
getUiHitFromRay()
domSourceForHtmlMesh()
hasInteractiveDomTarget()
dispatchHtmlMeshPointerEventFromRay()
dispatchHtmlMeshPointerEventFromController()
```

这部分应该独立成 `htmlMeshPointerAdapter` 或归入 `useThreeOfficialControllerInput`，否则 DOM、raycast、button 分发会继续绑死在主组件里。

## Desktop 与测试输入

当前仍保留桌面和 synthetic 输入，主要用于开发和 Playwright。

Desktop：

```text
canvas click -> raycast sphere -> smooth view target move
ctrl/cmd + canvas click -> instant commit
```

Synthetic events：

```text
three-official-controller-select
three-official-controller-aim
three-official-controller-squeeze
three-official-quick-menu
three-official-menu-toggle
three-official-record-toggle
three-official-thumbstick
```

这些事件非常有测试价值，但不应无限期散落在生产组件里。建议由 input adapter 统一暴露，只在测试环境和 lab 页面打开。

## 为什么现在必须拆

`ThreeOfficialInteractiveLab.tsx` 当前 2646 行。手柄相关逻辑和这些内容混在一起：

```text
Three scene 创建
renderer/camera 生命周期
WebXR requestSession
video source / HLS
crop mask shader
reticle / frame / target ring 每帧更新
HTMLMesh 创建
DOM query listener
backend path patch
render-test
BGM / effect lab state
synthetic test event
cleanup
```

继续新增 UI 会让输入状态机越来越难改。更危险的是，有些状态通过 React state 与 ref mirror 同步，有些函数被 `useEffect([])` 捕获，有些 DOM listener 又靠依赖数组重绑。这种结构能跑，但后续会很容易出现 stale closure、重复 listener、状态不同步、资源释放不完整的问题。

## 建议拆分结构

### 1. ray targeting helper

建议文件：

```text
apps/web/src/components/three/three-official-lab/rayTargeting.ts
```

职责：

```text
readObjectForward
ray -> sphere intersection
pointer event -> ray
controller object -> ray
ray hit -> ViewTargetPose
smooth move interpolation
```

不负责：

```text
React state
DOM listener
backend request
semantic dispatch
```

这是第一刀，因为它最容易做成纯函数/小对象，也最容易用现有测试验证坐标没有反号。

### 2. controller interaction state

建议文件：

```text
apps/web/src/components/three/three-official-lab/controllerInteractionState.ts
```

职责：

```text
dual select combo
head gaze hold timer
right grip drag state
left grip opacity modifier
thumbstick active/debounce/pendingFlush
B quick menu pressed/aim/release
left menu button edge trigger
discard range active state
```

目标是把“输入状态机”从“执行动作”里拆开。

### 3. controller input adapter

建议文件：

```text
apps/web/src/components/three/three-official-lab/useThreeOfficialControllerInput.ts
```

职责：

```text
绑定 selectstart/selectend
绑定 squeezestart/squeezeend
读取 gamepad axes/buttons
绑定 synthetic CustomEvent
cleanup listeners
输出高层动作
```

它可以暴露类似：

```text
onRayClick(hand, ray)
onHeadGazeCommit()
onControllerDragStart(hand)
onControllerDragMove(hand, ray)
onControllerDragEnd(hand, ray)
onFovDelta(delta)
onMaskOpacityDelta(delta)
onQuickMenuAction(action)
onMenuToggle()
onRecordToggle()
```

不应该直接知道 `sendViewPathPatch` 或 React JSX。

### 4. quick menu runtime

建议文件：

```text
apps/web/src/components/three/three-official-lab/quickMenuRuntime.ts
```

职责：

```text
创建 quick menu Group 和 tile meshes
tile hit test
highlight selection
open / aim / release / close
dispose materials
```

动作执行不放在这里，只返回 `QuickMenuAction` 给上层 operation。

### 5. workflow bridge

建议文件：

```text
apps/web/src/components/three/three-official-lab/workflowBridge.ts
```

职责：

```text
startCropWorkflow
endCropWorkflow
buildBackendPathPatch
flushBackendPath
renderCropWorkflow
backend status
export download url
```

后续 effect event queue 和 BGM export binding 也应该放在这个方向，而不是继续塞进输入事件。

### 6. scene runtime hook

建议最后再做：

```text
apps/web/src/components/three/three-official-lab/useThreeOfficialSceneRuntime.ts
```

职责：

```text
scene / camera / renderer
video sphere
crop mask
crop frame / reticle / target ring
HTMLMesh attach
controller models
animation loop
cleanup
```

这是风险最高的一步。不要在 ray targeting、controller state、workflow bridge 之前先抽它。

## 安全拆分顺序

建议顺序：

```text
1. 抽 rayTargeting，不改行为。
2. 跑 sphere click、controller ray click、backend coordinate sign drift 测试。
3. 抽 quickMenuRuntime，只让它返回 action。
4. 跑 B hold quick menu 测试。
5. 抽 controllerInteractionState。
6. 跑 select/grip/thumbstick/opacity/discard range 测试。
7. 抽 workflowBridge。
8. 跑 path patch 和 render-test 测试。
9. 最后考虑 scene runtime hook。
```

每一步至少跑：

```text
npm --workspace apps/web run typecheck
npx playwright test -c apps/web/playwright.config.ts e2e/three-official-interactive-lab.spec.ts
```

如果只做局部拆分，可以先 grep：

```text
npx playwright test -c apps/web/playwright.config.ts e2e/three-official-interactive-lab.spec.ts -g "sphere click|controller|thumbstick|quick menu|backend"
```

## 当前测试缺口

已有覆盖：

```text
canvas sphere click
ctrl click instant commit
dual select play toggle
backend playlist selector
player rail workflow controls
path patch coordinate sign drift
render-test download link
B quick menu lock/startCrop
short controller select ray click
right grip drag
right thumbstick FOV
left grip + right thumbstick opacity
```

拆分前后应补：

```text
long hold select -> head gaze follow -> release commit
left select ray click
right thumbstick negative direction
left grip + thumbstick negative opacity
quick menu save/discard/restore/render/effects
quick menu release without selection
left menu button hide/restore
left grip + right trigger discard range
repeated mount/unmount cleanup
```

## 当前结论

当前手柄交互已经足够复杂，继续留在主组件里会拖慢后续 VR UI 迭代。

最先拆的不是视觉组件，而是：

```text
ray targeting
controller interaction state
controller input adapter
quick menu runtime
workflow bridge
```

这些拆出来后，主组件才能重新变成“组合场景和 UI 的壳”，而不是所有输入、业务和渲染运行时的总开关。
