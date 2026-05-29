# PC Editor VR 操作映射设计

更新日期：2026-05-28

目标：让 VR 端也能像 PC 快捷键一样高频、低打断地完成剪辑操作。PC 键盘已经能覆盖大部分操作，VR 端不应该把所有能力硬塞进手柄按键，而是分成四层：

1. 手柄核心键：最高频、必须盲操作、不应该依赖 UI 的动作。
2. 手柄组合键：连续调节类动作，用 modifier + 摇杆，避免误触。
3. 空间 UI：播放器、播放列表、录制、渲染等低频或需要明确确认的动作。
4. 头显 + 手柄：取景、遮罩移动、遮罩跟随头部中心等空间动作。

## 设计结论

| 层级        | 放什么                                                                                                             | 原因                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 直接手柄    | trigger 选择、双 trigger 暂停 / 播放、A 子弹时间、B 打开特效环、X 切换丢弃、左摇杆平滑移动遮罩、右摇杆平滑调透明度 | 高频、沉浸中必须随手完成。                       |
| 组合按键    | 按住 UI chip + 右摇杆调倍速                                                                                         | 连续滑动类动作先只保留已验证链路。               |
| 空间 UI     | 播放器功能、上一段 / 下一段、seek、播放列表、开始 / 结束录制、render、导出、危险操作确认                           | 这些动作需要看状态、看进度或避免误触。           |
| 头显 + 手柄 | trigger 点背景移动遮罩；head gaze 跟随暂时退出核心路径                                                            | 先保证最短 EventBus step 链路可用。              |

## 推荐手柄语义

这里默认以 Quest 手柄命名：

| 手柄输入                       | 推荐语义                       | 备注                                                           |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------- |
| 单 trigger                     | ray select / click             | 点 UI、点环形菜单、点背景移动遮罩。                            |
| 左右 trigger 同时按下          | 播放 / 暂停                    | 最高频全局快捷键。识别后应吞掉本次单 trigger click。           |
| A                              | 子弹时间 toggle                | 第一次按下进入 0.1x 播放，再次按下恢复进入前速度。             |
| B                              | 打开 / 维持特效环形菜单        | B down 打开，B up 可关闭；环内 trigger 选择。                  |
| X toggle                       | 丢弃片段 toggle                | 第一次按下开始标记 discard，再次按下结束；松开只更新按钮状态。 |
| 左摇杆                         | 沉浸模式遮罩中心平滑移动       | 左右调 yaw，上下调 pitch，直接写 `viewTarget.center`。           |
| 右摇杆上下                     | 沉浸模式遮罩透明度平滑变化     | 直接写 `viewTarget.maskOpacity`，不需要 grip modifier。          |
| grip                           | 只同步状态                     | 暂不作为遮罩 modifier，避免真机 hold / toggle 状态影响判断。    |
| 按住 UI rate chip + 右摇杆上下 | 播放倍速 / 录制倍速 / 特效速度 | chip 决定调哪个值，右摇杆只负责连续增减。                      |

不建议把 A / X / Y 绑定成 cut、start crop 这类一次性剪辑命令。A 留给子弹时间，X 留给丢弃片段 toggle，Y 暂不承担遮罩调节，避免和 grip + 摇杆体系混在一起。录制、渲染、cut 等需要看清状态的动作仍然放到播放器 UI / 工作台 UI。

## PC 到 VR 映射总表

| 功能             | PC 操作                                      | VR 手柄 / 头显                            | VR UI                              | 事件                                             |
| ---------------- | -------------------------------------------- | ----------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| 播放 / 暂停      | `Space`                                    | 左右 trigger 同时按下                     | 播放器 play 按钮                   | `player.playback.toggle`                       |
| UI 点击 / 选择   | 鼠标点击                                     | 单 trigger ray select                     | 所有 `.clickable` hit plane      | 由目标决定                                       |
| 上一个视频       | UI 或按钮                                    | 不占手柄核心键                            | 播放器 previous                    | `player.source.previous`                       |
| 下一个视频       | UI 或按钮                                    | 不占手柄核心键                            | 播放器 next                        | `player.source.next`                           |
| 播放进度 seek    | DOM progress                                 | trigger 拖拽空间 progress                 | 播放器 progress                    | `player.playback.seek`                         |
| 打开播放列表     | `P`                                        | 不占手柄核心键                            | 播放器 playlist                    | `player.playlist.toggle`                       |
| 选择视频源       | DOM playlist item                            | trigger 点空间列表 item                   | 播放列表 UI                        | `player.source.select`                         |
| 开始录制 crop    | `Shift+R`                                  | 不建议直接硬件键                          | 播放器 record / 工作台 start       | `editor.crop.start`                            |
| 结束录制 crop    | `R`                                        | 不建议直接硬件键                          | 播放器 record / 工作台 end         | `editor.crop.end`                              |
| render / export  | DOM render                                   | 不占手柄核心键                            | 工作台 render / export             | `editor.render.request`                        |
| timeline flush   | `F`                                        | 不占手柄核心键                            | 工作台 flush，或录制结束自动 flush | `editor.timeline.flush`                        |
| cut              | UI cut                                       | 不建议 A 直接触发                         | 工作台 cut                         | `editor.timeline.cut`                          |
| 丢弃片段 toggle  | `Delete` down toggle                       | X down toggle                             | 工作台 hold discard 作为备用       | `editor.timeline.discard.begin/end`            |
| 子弹时间         | `T` toggle；`Z` + wheel 仍可精调播放倍速 | A toggle，进入 0.1x，再按恢复             | 播放器可显示 Bullet Time 状态      | `player.playback.rate.set`                     |
| 打开特效选择     | `Tab`                                      | B                                         | 环形菜单本体                       | `editor.effects.shortcut.open`                 |
| 选择特效分类     | 数字键                                       | B 打开后 trigger 点 ring category         | 环形菜单                           | `ui.panel.effects.category.toggle`             |
| 选择瞬时特效     | 数字键                                       | B 打开后 trigger 点 effect segment        | 环形菜单                           | `editor.effects.select`                        |
| 按住型特效       | 数字 keydown / keyup                         | B 打开后 trigger down / up 点 hold effect | 环形菜单                           | `editor.effects.hold.start/end`                |
| 遮罩中心移动     | `W/A/S/D`                                  | 左摇杆平滑 step；trigger 点背景             | 工作台 yaw / pitch                 | `editor.viewport.center.set/step`              |
| 遮罩点选移动     | 鼠标点击画面                                 | trigger 点背景 sphere                     | 无需 UI                            | `editor.viewport.center.set`                   |
| 遮罩跟随头显中心 | `V` + 左键中心跟随                         | 暂不占手柄                                | 无需 UI                            | `editor.viewport.center.set`                   |
| 遮罩 FOV         | `Q/E`                                      | 暂不占手柄摇杆                            | 工作台 FOV                         | `editor.viewport.fov.set/step`                 |
| 遮罩 roll        | `[` / `]`                                | 暂不占手柄摇杆                            | 工作台 roll                        | `editor.viewport.roll.set/step`                |
| 遮罩 lock        | UI                                           | 不占手柄核心键                            | 工作台 lock                        | `editor.viewport.lock.set`                     |
| 遮罩透明度       | `H` + wheel                                | 右摇杆上下                                | 工作台 opacity slider              | `editor.mask.opacity.set`                      |
| 播放倍速         | `Z` + wheel                                | 按住 Play Rate UI chip + 右摇杆上下       | 播放器 rate chip                   | `player.playback.rate.set/reset`               |
| 录制倍速         | `X` + wheel                                | 按住 Rec Rate UI chip + 右摇杆上下        | 播放器 rate chip                   | `player.recording.rate.set/reset`              |
| 特效速度         | `C` + wheel                                | 按住 FX Rate UI chip + 右摇杆上下         | 播放器 / 特效 rate chip            | `editor.effects.speed.set/reset`               |
| 关闭 overlay     | `Esc` 或 UI                                | trigger 点 close                          | UI close                           | `ui.overlay.close` / `player.playlist.close` |

## 当前输入层入口总览

| 输入层              | 主要文件                                                                                  | 角色                                                      | 备注                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PC 键盘离散 binding | `playerV2KeyboardBindings.ts`, `useKeyboardEventBindings.ts`                          | 把 `Space/F/Delete/R/P/Tab/数字键` 等转成 EventBus 事件 | `W/A/S/D/Q/E` 在 Player V2 中不走离散 step，而走连续 hook。                                   |
| PC 键盘连续取景     | `usePcViewportKeyboardMotion.ts`, `usePcViewportKeyboardFov.ts`                       | `W/A/S/D` 连续移动中心，`Q/E` 连续调 FOV              | 松开后发 `commit: true` 和 `meta.phase = "end"`。                                           |
| PC 鼠标 / 滚轮      | `useSphereFovWheelBinding.ts`, `usePcMaskPointerInput.ts`                             | 画面点击、拖拽、滚轮调 sphere FOV / 透明度 / 倍速         | `H/Z/X/C` + wheel 分别对应透明度、播放倍速、录制倍速、特效速度。                              |
| DOM UI              | `../UI/*Simple.tsx`, `usePcEditorBindingEmitter.ts`, `usePcEditorUiEventEmitter.ts` | 普通按钮、slider、progress 统一发事件                     | 有固定 target 的优先走 `defaultPcEditorBindings`。                                            |
| 3D UI               | `../3DUI/*`, `PlayerV2Spatial3DUiLayer.tsx`                                           | 空间按钮先发 `Spatial3DUiAction`，再映射到 EventBus     | source.kind 通常是 `vr-ray`。                                                                 |
| VR 手柄按钮 / 摇杆  | `PlayerV2Spatial3DUiLayer.tsx` 的 `useQuestControllerBindingAdapter`                  | 同步 runtime controller state，并把组合键转成事件         | source.kind 是 `xr-runtime`，连续摇杆优先读 gamepad axes，离散 thumbstick 事件作为 fallback。 |
| VR 背景 ray 取景    | `../mask_controller/inputs/usePcMaskRayTargetInput.ts`                                  | trigger / ray 点背景 sphere 时移动遮罩                    | 会跳过 `.clickable`、`data-ray-blocking="true"` 和 crop arc。                               |

## 直接手柄核心键

### 单 trigger：全局 ray select

单 trigger 不绑定固定业务命令。它只表达“选择当前 ray 命中的目标”：

```text
trigger click on 3D UI
  -> 对应 UI action

trigger click on background sphere
  -> move mask to ray hit
```

这样用户不用记“哪个手柄按钮对应哪个 UI 功能”。只要看见按钮，就用 trigger 点。

### 双 trigger：播放 / 暂停

播放 / 暂停是最常用动作，应该不依赖 UI：

```text
left trigger pressed + right trigger pressed within short window
  -> player.playback.toggle
```

实现注意：

- 建议 180 到 240ms 内识别为 dual trigger。
- 一旦识别 dual trigger，本轮按压周期内要 suppress 左 / 右单 trigger click，避免同时点到 UI 或背景。
- 两个 trigger 都松开后才重新 armed。

### A：子弹时间 toggle

子弹时间是播放速度的紧急降速键，用来防止用户在 VR 里来不及操作：

```text
A press while bullet time inactive
  -> remember current playbackRate
  -> player.playback.rate.set(0.1)
  -> bulletTimeActive = true

A press while bullet time active
  -> restore remembered playbackRate, fallback 1.0
  -> bulletTimeActive = false
```

行为要求：

- 直接按下就是 0.1x，不需要先打开 UI。
- 再次按下结束，恢复进入子弹时间前的播放速度。
- 子弹时间只影响 playback rate，不自动改变 recording rate 或 effect speed。
- 播放器 UI 应显示 Bullet Time 状态，避免用户不知道为什么视频变慢。
- 若用户在子弹时间中手动调播放倍速，应退出 bullet time active 状态，或把新速度记为恢复目标。推荐前者，规则更清楚。

### X：丢弃片段 toggle

丢弃片段是边看边临时决定的动作，保留一个手柄按键比强制点 UI 更顺：

```text
X press while discard inactive and video is playing
  -> editor.timeline.discard.begin

X press while discard active
  -> editor.timeline.discard.end
```

行为要求：

- X up 不结束 discard，只负责清除 pressed state，避免用户还要一直按住。
- active 期间播放器 / 工作台要显示 discard active 状态。
- 如果视频暂停，X press 只提示“播放中才能丢弃”，不开始 range。
- 工作台 UI 的 hold discard 保留为备用入口和可视化确认。

### B：特效环形菜单

B 是特效模式入口：

```text
B down
  -> open effect ring

B held + trigger on category
  -> open category level

B held + trigger click on effect
  -> editor.effects.select

B held + trigger down/up on hold effect
  -> editor.effects.hold.start/end

B up
  -> close ring, finish active hold effect
```

B 不直接选择特效，只负责进入“特效选择层”。这样 ring menu 和普通 player UI 不会互相抢焦点。

## 遮罩与视角控制

### trigger 点背景：快速放置遮罩

适合把取景框快速放到某个人 / 物体上：

```text
right ray hits background sphere
trigger up
  -> directionToViewCenter(hitPoint)
  -> editor.viewport.center.set(commit: true)
```

如果 ray 命中 `.clickable` 或 `data-ray-blocking="true"`，必须阻止穿透到背景。

### 单 left grip：拖拽遮罩 toggle

这是 VR 里替代 PC `V` + 左键中心跟随的主要动作：

| 输入                       | 行为                                      |
| -------------------------- | ----------------------------------------- |
| left grip click，左摇杆回中 | 开启 / 关闭拖拽模式；开启后 mask center 连续跟随 head gaze center。 |
| 转动头显                   | 遮罩拖拽到当前视野中心方向。              |
| 再次点击 left grip         | 关闭拖拽模式并 commit 当前 mask center。  |

建议参数：

```text
target deadzone: 0.02 - 0.08 deg
max speed: 160 - 220 deg/s
acceleration/brake: 复用 PC smoothing 的速度 / 加速度 / 刹车模型
toggle off: emit commit true + phase end
```

输出事件：

```text
editor.viewport.center.set
source.kind = "xr-runtime"
source.id = "vr-left-grip-head-drag"
meta.phase = "change" / "end"
payload.input = "head_gaze"
payload.commit = false / true
```

### left grip + 左摇杆：FOV 缩放

| 输入                        | 行为                         |
| --------------------------- | ---------------------------- |
| left grip toggle 开启 + 左摇杆上   | crop mask FOV 变小。          |
| left grip toggle 开启 + 左摇杆下   | crop mask FOV 变大。          |
| left grip toggle 开启 + 左摇杆左右 | 暂不绑定，避免缩放时误触。    |
| 再次点击 left grip                 | 关闭模式并 commit FOV。       |

FOV 是高频 framing 操作，适合放在同一只手的 grip + 摇杆上。只要左摇杆离开 deadzone，单 left grip 的 head-gaze 拖拽应暂停，避免“边缩放边飘”。

输出事件：

```text
editor.viewport.fov.set
source.kind = "xr-runtime"
source.id = "vr-left-grip-left-stick-fov"
meta.phase = "change" / "end"
payload.commit = false / true
```

### 双 grip：头显中心追踪

这是保留的双手确认版 head-gaze follow：

```text
left grip + right grip held
  -> mask center tracks head gaze center

release either grip
  -> commit mask center
```

交互语义：

- 按住时，用户只要转头，遮罩就跟到头显视野中心。
- 松开时，当前遮罩位置写入 timeline / preview state。
- 双 grip 优先级高于单 left grip 拖拽和 left grip + 左摇杆缩放。

输出事件：

```text
editor.viewport.center.set
source.kind = "xr-runtime"
source.id = "vr-dual-grip-head-follow"
meta.phase = "change" / "end"
payload.input = "head_gaze"
payload.commit = false / true
```

## 连续调节类组合键

### right grip + 右摇杆：遮罩透明度 toggle

遮罩透明度在 VR 中很常用，放到右手 grip + 右摇杆，和左手的拖拽 / 缩放分开：

| 输入                            | 行为                    |
| ------------------------------- | ----------------------- |
| right grip click                | 开启 / 关闭透明度模式。 |
| right grip toggle 开启 + 右摇杆上 | opacity 增加。          |
| right grip toggle 开启 + 右摇杆下 | opacity 减少。          |
| UI opacity chip click           | 可选：重置到默认 0.74。 |

输出事件：

```text
editor.mask.opacity.set
payload.opacity
payload.durationMs = 0
source.id = "vr-right-grip-right-stick-mask-opacity"
```

### UI chip + 右摇杆：倍速调节

播放倍速、录制倍速、特效速度都不要再占手柄固定组合。原因是三者语义相似，用户需要先看清当前调的是哪个速度。

推荐在播放器 UI 上放三个可按住的 chip：

```text
PLAY 1.00X
REC  1.00X
FX   1.00X
```

交互：

| 输入                         | 行为                       |
| ---------------------------- | -------------------------- |
| trigger click chip           | reset 对应倍速。           |
| trigger hold chip + 右摇杆上 | 对应倍速增加。             |
| trigger hold chip + 右摇杆下 | 对应倍速减少。             |
| release trigger              | commit / stop adjustment。 |

映射：

| UI chip   | 右摇杆输出                    |
| --------- | ----------------------------- |
| Play Rate | `player.playback.rate.set`  |
| Rec Rate  | `player.recording.rate.set` |
| FX Rate   | `editor.effects.speed.set`  |

建议步进：

```text
小推: +/- 0.05 per tick
大推: +/- 0.25 per tick
范围: 0.25x - 4.00x
回中: stop
```

建议平滑变化，而不是每个 tick 直接跳到目标值：

```text
axis deadzone: 0.18
target step: 小推 0.05 / 大推 0.25
targetRate = clamp(currentRate + targetStep, 0.25, 4.00)
displayRate -> targetRate: 120ms 到 220ms ease-out
emit rate.set: 使用平滑后的 displayRate，或在动画结束时提交 targetRate
```

这样摇杆微调不会抖，用户也能在头显里看清速度正在变化。子弹时间是例外：A 键直接切到 0.1x，再次按下恢复，不走 0.25x 到 4.00x 范围限制。

## 空间 UI 分工

### 播放器 UI

播放器 UI 是 VR 里的“状态可见 + 低点击次数”主控台，应该包含：

| UI               | 行为                                               |
| ---------------- | -------------------------------------------------- |
| Play / Pause     | 备用入口，双 trigger 是快捷入口。                  |
| Bullet Time 状态 | 显示 A 键子弹时间是否 active，必要时提供恢复按钮。 |
| Previous / Next  | 视频源切换。                                       |
| Progress         | 点击 / 拖拽 seek。                                 |
| Record           | start / end crop。                                 |
| Playlist         | 打开播放列表。                                     |
| Play Rate chip   | reset / hold + right stick adjust。                |
| Rec Rate chip    | reset / hold + right stick adjust。                |
| FX Rate chip     | reset / hold + right stick adjust。                |

### 工作台 UI

工作台 UI 放低频、确认型、状态型动作：

| UI                               | 行为                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| Render / Export                  | 渲染和导出入口。                                            |
| Auto-render                      | 开关。                                                      |
| Lock                             | mask lock。                                                 |
| Cut                              | 明确点击，不建议硬件键。                                    |
| Flush                            | dev / advanced。                                            |
| Discard                          | X toggle 的可见状态确认；工作台按钮仍可作为 hold 备用入口。 |
| Opacity slider                   | 精确调整或重置。                                            |
| FOV / yaw / pitch / roll buttons | 手柄组合键的备用精确入口。                                  |

### 特效环形菜单

特效不放普通播放器 UI 里翻页。VR 里用 B 打开环形菜单：

| 动作        | 操作                                 |
| ----------- | ------------------------------------ |
| 打开菜单    | B down。                             |
| 选择分类    | trigger 点内圈 category。            |
| 选择效果    | trigger 点外圈 effect。              |
| hold effect | trigger down 开始，trigger up 结束。 |
| 关闭        | B up 或点关闭区域。                  |

## 当前代码已收敛的地方

当前 `PlayerV2Spatial3DUiLayer.tsx` 已经有一部分映射：

| 当前行为                               | 说明                                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| 双 trigger 播放 / 暂停                 | 已保留，并 suppress 本轮单 trigger click。                       |
| B down 打开 effect shortcut            | 已作为特效环形菜单入口。                                         |
| A down                                 | 已改为子弹时间 toggle；cut 保持在工作台 UI。                     |
| X down                                 | 已改为 discard toggle；start/end crop 保持在播放器 / 工作台 UI。 |
| Y down/up                              | 仅同步按钮状态；遮罩透明度改由 right grip + 右摇杆上下控制。     |
| rate chip + right thumbstick           | 已用于调播放 / 录制 / 特效倍速。                                 |
| 单 left grip                           | 已作为 head-gaze 拖拽遮罩入口，松开提交。                        |
| left grip + left thumbstick            | 已用于缩放遮罩 FOV；左右方向暂不绑定。                           |
| right grip + right thumbstick          | 已用于调整遮罩透明度。                                           |

实现要点仍然是：

1. VR controller axes sampler：持续读取左右摇杆；`thumbstickup/down/left/right` 只作为拿不到 axes 时的 fallback。
2. Modifier state：`leftGrip`, `rightGrip`, `bHeld`, `discardActive`, `bulletTimeActive`, `bulletTimeRestoreRate`, `activeRateChip`。
3. Priority resolver：

```text
dual grip head follow
  > B effect ring
  > X discard toggle
  > active UI rate chip + right stick
  > right grip + right stick opacity
  > left grip + left stick FOV
  > single left grip head-gaze drag
  > trigger select
```

4. Axis-to-event adapter：按帧把摇杆轴转换成 `editor.viewport.*`、`editor.mask.opacity.set`、`player.*.rate.set` 事件。

## 最小实现顺序

1. 保留双 trigger 播放 / 暂停，补 suppress 单 trigger click。
2. 把 A 改成子弹时间 toggle，进入 0.1x，再次按下恢复。
3. 把 X 改成 discard toggle：按下 begin，再按 end，松开只更新 pressed state。
4. 把录制 start/end、cut、render 保持在播放器 / 工作台 UI。
5. 实现单 left grip 拖拽遮罩到 head gaze。
6. 实现 left grip + 左摇杆缩放遮罩。
7. 实现 B 环形菜单选择特效。
8. 实现 right grip + 右摇杆透明度。
9. 给播放器 UI 的三个 rate chip 增加 hold + 右摇杆调节，并加入平滑变化。
10. 保留双 grip 头显中心追踪作为双手确认路径。

## 当前实现进度

代码位置：`../Aframe/player-v2/immersive-ui/PlayerV2Spatial3DUiLayer.tsx`

已完成：

1. 双 trigger 播放 / 暂停，并 suppress 本轮 ray click。
2. A 子弹时间 toggle：进入 `0.1x`，再次按下恢复原播放速度。
3. X toggle 丢弃片段：down begin / end，up 只清按钮状态。
4. B 打开特效环形菜单。
5. left grip toggle 开启时让 mask center 跟随 head gaze，再次点击关闭并 commit。
6. left grip toggle 开启 + 左摇杆上下调整 FOV。
7. right grip toggle 开启 + 右摇杆上下调整遮罩透明度。
8. left / right grip toggle 同时开启时让 mask center 跟随 head gaze，关闭模式时 commit。
9. 按住播放器 Play / Record / FX rate chip + 右摇杆上下调倍速，步进 `0.05` / `0.25`，范围 `0.25x - 4.00x`，并做短时平滑。
10. 按帧读取 XR gamepad axes，让拖拽、FOV、透明度、倍速调节真正连续；离散 thumbstick 事件保留为 fallback。
11. 播放器 UI 显示当前 Play / Rec / FX rate；子弹时间时 Play chip 显示 `BULLET 0.1X`。

仍待下一轮：

1. 在 Quest 真机上校准 gamepad axes 索引与方向；当前实现会优先读 `[2,3]`，再回退 `[0,1]` / 最后一组轴。
2. 根据真机手感微调 deadzone、head-gaze 拖拽速度、FOV 速度、opacity 速度、rate tick 间隔。
3. B 环形菜单的关闭 / hold effect 结束语义还可以继续细化。
