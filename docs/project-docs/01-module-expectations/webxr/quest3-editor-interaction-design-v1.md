# Quest 3 剪辑器交互设计 V1

日期：2026-05-23

## 定位

Quest 3 端不是把 PC 编辑器照搬进头显，而是把 PC editor 的 operation 变成一套头显内的输入语法。第一版以 controller 为主，hand tracking 只作为后续同语义输入。

当前视觉原型入口：

```text
/xr/quest-spatial-ui-prototype
```

本原型只验证 WebXR 空间构图和交互形态，不直接写真实 timeline。

核心目标：

```text
1. 遮罩 / 取景框是最高优先级。
2. 高频动作尽量用 hold -> move/aim -> release commit。
3. 物理按钮很少，必须省着用。
4. 复杂参数进入前下方桌面式 3D UI 面板。
5. 所有输入最终落到现有 operation 和 timeline/effect 协议。
```

## 输入预算

Quest controller 可用输入很多，但适合剪辑的“可靠高频键”很少。V1 先这样分配：

```text
Right Trigger:
  主选择 / 点击 / 确认。
  在空白视频区域按住时进入遮罩拖拽或点选移动。
  在按钮上按下时进入按钮 pressed。
  在菜单中松开发生选择。

Right Grip:
  遮罩 controller-ray 临时绑定。
  按住时遮罩中心跟随右手射线。
  松开时锁定并 flush path。

Right Thumbstick:
  默认用于遮罩缺口 / FOV 缩放。
  与 modifier 组合时用于 0-1 滑块调节。
  左右可以用于时间线微调或播放速率，V1 先谨慎使用。

A:
  快捷特效菜单入口。
  按住打开 effect radial menu，射线悬停，松发选择特效。

B:
  取消 / 关闭当前弹层 / 后退一级。
  有菜单或面板时优先关闭 UI，不触发剪辑动作。

Left Trigger:
  辅助选择 / 面板点击。
  可作为双手暂停组合键的一半。

Left Grip:
  双手组合 / 安全 modifier。
  不直接绑定高频剪辑，避免和右手遮罩操作冲突。

Left Thumbstick:
  面板分页 / 面板滚动 / 时间线粗调。

Left Menu:
  优先尝试作为 WebXR 内 UI 呼出/隐藏键。
  注意：该键可能被系统或浏览器保留，必须提供备用：B 长按 或 左 Grip + B。
```

## 总体模式优先级

同一时刻只能有一个主交互模式，避免一次松手触发多件事。

```text
system / browser reserved
> modal confirm
> active radial menu
> active slider adjustment
> active drag / mask edit
> workbench panel button
> global shortcuts
> passive viewing
```

示例：

```text
如果快捷特效菜单打开，Right Trigger release 只提交菜单项或取消菜单。
如果 0-1 滑块正在调节，Right Thumbstick 只改滑块值，不缩放遮罩。
如果用户在遮罩拖拽中，B 先取消本次拖拽，不关闭整个 UI。
```

## 遮罩核心交互

遮罩是头显端剪辑的主语。V1 需要支持三类移动和一类缩放。

### 1. 拖拽移动

用途：用户想连续调整取景框位置。

触发：

```text
Right Trigger hold on mask frame / mask handle
```

流程：

```text
triggerdown:
  enter mask-drag mode
  记录 dragStartRay、maskStartCenter
  取景框边框变亮，显示 "MOVE"

while held:
  controller ray 与视频球 / 虚拟拖拽平面求交
  转换为 video yaw/pitch
  只更新本地 preview，不立即提交正式 patch

triggerup:
  lock mask center
  flushPath(reason=lock)
  exit mask-drag mode
```

视觉反馈：

```text
hover mask:
  边框亮起，四角 handle 出现。

dragging:
  边框变为高亮色。
  中心 reticle 跟随。
  显示 yaw/pitch 小读数。
```

取消：

```text
B:
  回到 dragStart 前的位置。
```

### 2. 点选移动至目标点

用途：用户只想把遮罩中心快速移动到某个目标，不想拖拽。

触发：

```text
Right Trigger click on video area
```

流程：

```text
pointer hit video sphere:
  计算 hit point 的 video yaw/pitch

trigger click:
  smooth move mask center to target
  flushPath(reason=lock) 或等待短 debounce 后 flush
```

建议：

```text
单击移动应该有短动画，约 120ms - 220ms。
动画期间显示目标点小圆环。
如果用户立刻再次点击，取消上一次动画并移动到新目标。
```

### 3. Controller-ray 跟随

用途：比 head-gaze 更精确，适合局部目标跟踪。

触发：

```text
Right Grip hold
```

流程：

```text
gripdown:
  enter mask-ray-follow mode
  遮罩中心跟随右手 controller ray hit point

while held:
  每帧更新 preview

gripup:
  lock current center
  flushPath(reason=lock)
```

注意：

```text
当前真机观察 controller ray 视觉上约偏 30 度。
不能硬编码修正，必须先做 world -> video yaw/pitch 校准。
```

### 4. 摇杆缩放框选缺口大小

用途：快速调整最终裁剪框 FOV / 遮罩缺口大小。

默认输入：

```text
Right Thumbstick Up:
  缩小 FOV，画面更近，缺口更小。

Right Thumbstick Down:
  放大 FOV，画面更广，缺口更大。
```

调节规则：

```text
轻推:
  每 120ms step 一次，delta 约 1-2 度。

推到底:
  连续加速，delta 约 3-5 度。

松开:
  300ms debounce 后 flushPath(reason=fov)。
```

视觉反馈：

```text
遮罩边缘同步缩放。
显示 FOV h/v 数值。
到 min/max 时短闪，停止继续变化。
```

## 暂停 / 播放

用户提出“双手同时按下什么按键，暂停”。这个适合作为安全的全局快捷键，避免误触。

候选：

```text
Left Trigger + Right Trigger 同时短按:
  playPause

Left Grip + Right Grip 同时短按:
  playPause 备用，但可能和右 Grip 遮罩 ray-follow 冲突。
```

推荐 V1：

```text
Left Trigger + Right Trigger:
  双手同时按下 120ms 内识别为 combo。
  如果两边都在 UI button 上，则优先按 UI，不触发全局暂停。
```

反馈：

```text
暂停:
  中央短暂显示 pause icon。

播放:
  中央短暂显示 play icon。
```

## 放弃某个片段

目标：用户在观看过程中标记“这一段不要”。

因为放弃片段属于高风险编辑，不建议单击触发。V1 用持续按住。

推荐输入：

```text
Left Grip hold:
  标记 discard range。
```

流程：

```text
left grip down:
  discardStartMs = currentTimeMs
  显示红色 discard band 开始生长

while held:
  discardEndMs = currentTimeMs
  时间线或底部条显示被放弃范围

left grip up:
  create discardRange(startMs, endMs)
  flushPath(reason=discard)
```

取消：

```text
B while holding:
  cancel current discard range
```

安全规则：

```text
小于 400ms 的 discard hold 不提交，视为误触。
提交后显示 Undo / Restore 短入口 2 秒。
```

如果 Left Grip 要保留为 modifier，则备用方案：

```text
Y hold:
  discard range
```

但 Y 是否稳定进入 WebXR gamepad/buttons 需要实测确认。

## WebXR 内 UI 呼出 / 隐藏

目标：快速呼出和取消 WebXR 内 UI，包括桌面工作台、播放器 UI、特效菜单入口。

优先输入：

```text
Left Menu:
  toggle main XR UI
```

备用输入：

```text
B long press:
  toggle main XR UI

Left Grip + B:
  toggle main XR UI
```

呼出动画：

```text
show:
  150ms fade in
  180ms scale 0.92 -> 1.0
  panel 从前下方轻微上浮 0.06m

hide:
  120ms fade out
  120ms scale 1.0 -> 0.96
  panel 下沉 0.04m
```

隐藏时保留：

```text
取景框 / 遮罩
reticle
极简状态点：recording / paused / locked
可选的最小唤回提示
```

## 0-1 滑块调节

用户提出“所有 0-1 的选值：某个按键 + 右手摇杆”。这个很适合做成统一参数调节模式。

适用参数：

```text
mask opacity
effect intensity
audio volume
audio ducking
transition amount
blur strength
vignette strength
color grade mix
```

推荐输入：

```text
Left Grip hold + Right Thumbstick X/Y:
  调节当前 focused slider。
```

规则：

```text
如果有 focused slider:
  Right Thumbstick Right/Up -> value + delta
  Right Thumbstick Left/Down -> value - delta

如果没有 focused slider:
  显示 "No parameter selected"，不改变遮罩 FOV。
```

调节体验：

```text
轻推:
  delta = 0.01

推到底:
  delta = 0.03 - 0.05

松开 Left Grip:
  commit value
```

视觉反馈：

```text
focused slider 高亮。
显示数值 0-100%。
thumbstick 输入期间滑块 handle 发光。
```

## 快捷特效菜单

目标：按住一个手柄按键打开特效菜单，射线悬停，松发触发对应特效。

推荐输入：

```text
A hold:
  open quick effect radial menu

A release:
  commit hovered effect
```

流程：

```text
A down:
  在右手 ray 前方或用户视野前方打开 radial menu
  菜单项只 hover，不提交

while A held:
  controller ray hover item
  item 高亮、放大、显示效果名

A up:
  如果 hovered effect 存在:
    createEffectEvent(effectType, currentTimeMs)
  否则:
    cancel menu
```

首批快捷特效建议：

```text
黑场 / black
闪白 / flash
模糊 / blur
强调 / highlight
慢动作标记 / slowmo_marker
音效点 / audio_hit
字幕标记 / text_note
隐私遮罩 / mask.privacy_blur
```

效果菜单视觉：

```text
最多 8 项。
每项用图标 + 短标签。
hover 时中心显示完整名称和一句短参数提示。
危险或长效果不放快捷菜单，进入桌面面板。
```

提交后的反馈：

```text
菜单收起。
视频时间线上出现 effect marker。
短暂显示 "FX added: Blur"。
```

## 桌面式 3D UI 面板

位置：

```text
用户前下方，像桌面一样水平展开并略微倾斜。
低头可见，不遮挡中央 360 视频。
```

桌面面板负责低频、复杂、需要看状态的操作：

```text
播放与素材
音频
更多特效选项
开始裁剪 / 结束裁剪
导出
Session / take 管理
Undo / Restore
```

### 开始裁剪 / 结束裁剪

建议放在桌面面板上，而不是占用手柄高频键。

原因：

```text
开始/结束裁剪是状态切换，需要清晰显示当前状态。
误触成本比 FOV 或 hover 高。
放在桌面面板可以提供明确 label、颜色和确认反馈。
```

桌面按钮：

```text
Start Clip:
  当前时间设为 clipStartMs。
  按钮变为 active，时间线出现 start marker。

End Clip:
  当前时间设为 clipEndMs。
  生成 edit segment 或 cut range。
  时间线出现 end marker。
```

快捷备用：

```text
Quick radial menu 可放 "Start" / "End"，但 V1 默认不放主环。
如果用户确实高频使用，再加入第二页 radial。
```

### 音频面板

音频属于复杂但低频的面板操作：

```text
背景音乐 on/off
音量 0-1 slider
ducking 0-1 slider
fade in/out
节拍点 / audio_hit
```

输入：

```text
射线点击按钮。
focused slider + Left Grip + Right Thumbstick 调节 0-1。
```

### 更多特效面板

快捷菜单只放常用特效，桌面面板放完整效果库：

```text
视觉类：blur / flash / black / vignette / chromatic / color grade
时间类：slowmo marker / freeze marker / speed ramp marker
标注类：text note / caption / arrow / highlight
遮罩类：privacy blur / face area / region blur
音频类：audio hit / fade / duck / mute
```

面板交互：

```text
点击效果 -> 打开参数卡
调参数 -> slider mode
Apply -> createEffectEvent
B -> 返回效果列表
```

## 建议补充的操作

### Undo / Restore

推荐：

```text
B short:
  当前有弹层 -> close/cancel
  当前无弹层 -> no-op

Undo 放桌面面板和 radial 二级页。
```

不要让 B 在无 UI 时直接 Undo，容易误触。

### 临时预览原片

用途：用户想看看遮罩外原始 360 画面。

输入：

```text
Left Trigger hold:
  hide mask preview / show original view

release:
  restore mask preview
```

如果 Left Trigger 已用于双手暂停，则只在单手长按时触发，短按不触发。

### 锁定 / 解锁遮罩

输入：

```text
桌面 LOCK 按钮。
或 quick radial menu 的 LOCK 项。
```

锁定后：

```text
遮罩中心不跟随 accidental ray。
FOV 仍可调，除非用户开启 full lock。
```

### 快速保存 patch

输入：

```text
桌面 SAVE。
quick radial menu 二级项。
```

不建议占用 A/B/Trigger/Grip 直接键位。

## V1 推荐默认键位表

```text
Right Trigger click video:
  点选移动遮罩中心。

Right Trigger hold mask:
  拖拽移动遮罩。

Right Trigger click UI:
  点击按钮。

Right Grip hold:
  controller ray 跟随遮罩，松开锁定。

Right Thumbstick Up/Down:
  遮罩 FOV / 缺口大小。

Left Trigger + Right Trigger:
  播放 / 暂停。

Left Grip hold:
  放弃片段 discard range。

Left Grip + Right Thumbstick:
  调节当前 focused 0-1 slider。

A hold:
  快捷特效 radial menu，松发提交。

B:
  取消 / 关闭 / 返回。

Left Menu:
  呼出 / 隐藏主 WebXR UI。

B long press 或 Left Grip + B:
  Left Menu 不可用时的 UI 呼出备用。
```

## 冲突与保留问题

```text
1. Left Menu 可能被 Quest Browser 或系统保留，需要真机确认。
2. Left Grip 同时承担 discard 和 slider modifier，必须由 focused slider 状态区分。
3. Right Thumbstick 默认 FOV，但在 slider mode 下改参数，不改 FOV。
4. A hold 用于特效菜单后，不再作为通用快捷菜单入口；通用剪辑 radial 可改为 thumbstick click 或桌面入口。
5. 开始/结束裁剪优先放桌面面板，避免占用物理键。
6. 所有危险操作必须支持 B 取消和 Undo/Restore。
```

## 下一步原型顺序

```text
1. 遮罩点选移动：
   ray hit video -> move mask center -> flush lock。

2. 遮罩 FOV：
   Right Thumbstick Up/Down -> local preview -> debounce flush。

3. A hold 快捷特效菜单：
   open radial -> hover item -> release createEffectEvent。

4. 桌面面板最小版：
   Start Clip / End Clip / Undo / Audio / More FX。

5. 0-1 slider mode：
   focused slider + Left Grip + Right Thumbstick。

6. Discard hold：
   Left Grip hold range -> release discard。

7. UI 呼出动画：
   Left Menu 或 fallback combo。
```
## PC Editor 全量交互的 Quest 迁移方案

本节基于 `docs/project-docs/02-current-state/pc-editor-interaction-implementation.md`，目标是把 PC editor 已经验证过的交互语义完整迁移到 Quest 3，同时承认一个现实：手柄按钮数量有限，不能给每个 PC 快捷键都分配一个独立物理键。

因此 Quest 端不采用“按钮一一对应”的迁移方式，而采用三层输入模型：

```text
高频连续动作：
  用 hold -> move/aim -> release commit。

低频明确命令：
  用空间工作台大按钮或快捷滑轮。

连续参数：
  用 focused parameter + thumbstick / pinch / slider。
```

这套模型的核心是：物理按钮只负责进入模式，真正的编辑量来自头显转头、controller ray、thumbstick 轴和空间 UI focus。

### 输入预算

Quest 3 controller 的 V1 输入预算建议如下：

```text
Right Trigger:
  点击视频目标 / 点击空间 UI。
  按住时进入 head-gaze mask follow。
  松开时 lock + flush。

Right Grip:
  按住时进入 controller-ray mask follow / drag。
  松开时 lock + flush。

Right Thumbstick:
  默认调 mask FOV。
  有 focused parameter 时调当前参数。
  有 timeline focus 时做时间线微调。

A:
  按住打开快捷滑轮。
  松开提交当前高亮项。

B:
  取消 / 关闭 / 返回。
  当前有 active drag、radial、panel、slider 时优先取消当前模式。

Left Trigger:
  与 Right Trigger 组合做 play / pause。
  或用于临时预览原片 / 隐藏 mask，具体取决于实机舒适度。

Left Grip:
  modifier / focused parameter 调节。
  没有 focused parameter 时可用于 discard hold。

Left Thumbstick:
  面板翻页 / 列表滚动 / timeline 粗调。

Left Menu:
  呼出 / 隐藏主空间 UI。
  如果被系统保留，则用 B long press 或 Left Grip + B 作为 fallback。
```

这里的关键不是“按钮很多”，而是“同一个按钮在不同模式下含义不同，但同一时刻只能有一个 active mode”。模式优先级必须固定：

```text
system/browser reserved
> modal confirm
> active radial menu
> active slider/parameter adjustment
> active mask follow/drag
> spatial panel button
> global shortcuts
> passive viewing
```

### PC 到 Quest 的交互映射表

```text
PC 普通左键拖动：转动 360 相机视角
Quest:
  自然转头就是浏览视角。
  不写 path，不移动 mask。
  如果需要 controller 浏览，可用非编辑模式下 Right Grip + thumbstick 左右转场景，但 V1 不优先做。

PC 普通点击：带过渡移动 mask 到目标点
Quest:
  Right Trigger quick click on video target。
  controller ray 命中视频球，换算为 yaw/pitch。
  调用 moveMaskTo(target, 120-220ms)。
  debounce 后 flush lock。

PC Ctrl + 点击：立即移动 mask
Quest:
  Right Trigger + modifier quick click。
  建议 modifier 为 Left Grip hold。
  调用 moveMaskTo(target, 0)。
  用短促 snap feedback 表明无过渡。

PC Ctrl + 拖动：拖动 mask
Quest:
  Right Grip hold。
  mask center 跟随 controller ray hit。
  松开 Right Grip 后 lock + flush。
  如果用户想用头显而不是手柄，则 Right Trigger hold 进入 head-gaze follow。

PC Ctrl + 拖到屏幕边缘：相机和 mask 一起移动
Quest:
  VR 没有屏幕边缘，但有 comfort cone / comfortable field。
  当 controller ray 或 head-gaze follow 目标接近舒适视野边缘时，启动 edge-follow。
  调用 bindMaskAndCameraBy(deltaYaw, deltaPitch)。
  目标是让用户不用把头或手扭到很别扭，也能继续把 mask 拖向远处。

PC WASD：连续移动 mask
Quest:
  Right Thumbstick X/Y 在 nudge mode 中移动 mask。
  默认可以保留给 FOV，所以建议 nudge mode 由工作台 Mask 模块或 Left Grip modifier 激活。
  调用 setPreviewCenter / nudgePreviewCenterBy。

PC Q/E：连续缩放 mask FOV
Quest:
  Right Thumbstick Up/Down 默认控制 mask FOV。
  使用 requestAnimationFrame / XR frame loop 连续变化。
  松开后 debounce flush fov。

PC 鼠标滚轮：相机 FOV zoom
Quest:
  V1 不作为核心 VR 功能。
  可放入 debug/spectator 面板。
  真实头显观看中优先保留自然头动，不建议频繁改变头显相机 FOV。

PC H + 滚轮：调黑色遮罩深度 / opacity
Quest:
  focused parameter = Mask Opacity 时，Right Thumbstick 调整。
  进入方式：
    1. 工作台点击 Opacity slider 后自动 focus。
    2. Left Grip hold + Right Thumbstick 调当前 focused slider。
  调用 setPreviewMaskOpacity。

PC T/R + 滚轮：播放速度 / 记录速度
Quest:
  放进播放面板或 timeline 面板。
  focused parameter = Playback Rate / Recording Rate 时用 Right Thumbstick 调整。
  复用 rateCurve。

PC Lock / Unlock 按钮
Quest:
  工作台 Lock 大按钮。
  快捷滑轮可放 Lock / Unlock。
  Right Trigger/Grip follow release 默认也会 lock + flush。

PC Effects Rack
Quest:
  A hold 打开 quick effect radial。
  释放 A 提交 hovered effect。
  更多效果进入工作台 Effects 面板。
  统一 dispatch createEffectEvent。

PC BGM Controls
Quest:
  不占高频按钮。
  放进 Audio 面板。
  controller ray 点击 track / volume / enable。
  focused slider + thumbstick 调 volume。

PC Start / End / Render / Download
Quest:
  放进前下方工作台和 Export 面板。
  不占 Trigger / Grip / A / B 高频键位。
```

### 头显转头如何参与编辑

Quest 端最大的差异是：用户的头部转动天然就是“看”。它不应该默认等于“编辑”。否则用户只是环顾 360 视频，就会误写取景路径。

建议 V1 的规则：

```text
Passive viewing:
  头显转头只改变观看方向。
  不移动 mask，不写 path。

Right Trigger hold:
  进入 head-gaze follow。
  mask center 跟随头显视线。
  每帧只更新本地 preview。

Right Trigger release:
  锁定当前 mask center。
  flushTimeline("lock")。

B during hold:
  取消本次 follow，回到 hold 前的 mask center。
```

这种设计把 PC 的“普通拖动浏览”和“点击/拖动编辑”清楚拆开：

```text
转头 = 浏览
按住 Trigger + 转头 = 编辑取景
松开 Trigger = 提交编辑
```

### 手柄 ray 如何参与编辑

Controller ray 比 head-gaze 更适合精确指向画面里的局部目标。建议 V1 中 Right Grip 专门负责 controller ray follow：

```text
Right Grip hold:
  读取 right controller target-ray。
  与视频球 / invisible hit sphere 求交。
  把交点方向换算为 video yaw/pitch。
  mask center 跟随该 yaw/pitch。

Right Grip release:
  lock + flush。

Right Trigger quick click:
  只做一次 ray target selection。
  moveMaskTo(target, duration)。
```

这解决 PC 的两类编辑：

```text
PC click-to-move     -> Quest Trigger quick click
PC Ctrl drag mask    -> Quest Grip hold ray follow
```

注意：Quest 真机记录显示 controller ray 可能存在视觉偏差或坐标基准差异。实现时必须单独做 world ray -> video yaw/pitch 的校准，不要复制 PC 的 `screenPointToViewCenter`。

### 有限按钮下的模式设计

按钮有限时，最容易失败的是一个按钮承担太多隐含功能。V1 要把“当前模式”显示出来，并且用明确的优先级避免冲突。

建议状态机：

```text
Viewing:
  默认状态。
  头显转头浏览。
  Trigger click 可点选目标。
  Trigger hold 进入 HeadGazeFollow。
  Grip hold 进入 ControllerRayFollow。
  A hold 进入 RadialMenu。

HeadGazeFollow:
  Trigger held。
  mask 跟随头显视线。
  Trigger release -> CommitLock。
  B -> Cancel。

ControllerRayFollow:
  Grip held。
  mask 跟随右手 controller ray。
  Grip release -> CommitLock。
  B -> Cancel。

RadialMenu:
  A held。
  ray / thumbstick hover item。
  A release -> commit highlighted command。
  B -> cancel。

PanelFocus:
  空间面板打开。
  Trigger click UI button。
  Left Thumbstick 翻页 / 滚动。
  B -> close panel。

ParameterAdjust:
  focused slider active。
  Right Thumbstick 调值。
  release modifier 或离开 slider -> commit。
  B -> cancel value。
```

用户必须能看到当前模式，例如：

```text
FOLLOW HEAD
FOLLOW RAY
DRAG MASK
FOV 72
OPACITY 80%
FX RADIAL
LOCKED
PENDING SAVE
```

这些状态提示应是轻量 3D badge，不是大面积面板。

### 参数调节的统一规则

PC 里有多组“滚轮 + modifier”：

```text
H + wheel -> mask opacity
Z + wheel -> playback rate
X + wheel -> recording rate
C + wheel -> effect speed
wheel -> camera FOV
```

Quest 端不要给每个参数一个按钮组合。建议统一成：

```text
focused parameter + Right Thumbstick
```

进入 focused parameter 的方式：

```text
1. Ray hover / click 某个 slider。
2. 工作台模块打开后，默认 focus 第一个主要 slider。
3. Left Grip hold 作为“调参 modifier”。
```

映射：

```text
Mask opacity:
  focus Opacity slider -> Right Thumbstick Up/Right 增加，Down/Left 降低。

Playback rate:
  focus Play Rate -> Right Thumbstick 调整，复用 rateCurve。

Recording rate:
  focus Record Rate -> Right Thumbstick 调整，复用 rateCurve。

Effect intensity:
  focus effect strength -> Right Thumbstick 调整 0..1。

BGM gain:
  focus volume slider -> Right Thumbstick 调整。
```

这样按钮预算不会爆炸，用户也能学到一条统一规则。

### 快捷滑轮承担什么

快捷滑轮不应该塞所有功能。它只承载“当前观看时最常用、最需要 1 秒内完成”的命令。

V1 建议 A hold radial 放：

```text
Cut
Lock / Unlock
Save / Flush
FOV+
FOV-
Black fade
Flash
Highlight
```

不建议放：

```text
BGM 选曲
Render export
Session 管理
复杂效果参数
长文本 / 字幕输入
危险删除
```

这些低频复杂动作应放入前下方工作台面板。

### 空间工作台承担什么

前下方工作台承载低频、需要看状态、需要避免误触的动作：

```text
Playback:
  play/pause、seek、source list、rate。

Mask:
  lock、opacity、FOV 数值、reset、save。

Cut:
  cut here、start/end crop、discard/restore、undo。

Effects:
  完整 effect list、effect params、event markers。

Audio:
  BGM enable、track、gain、preview。

Export:
  render、export status、download/transfer。
```

工作台按钮应该大、少、稳定，不要做成 PC 右侧面板那种密集控件。

### PC 交互完整迁移的 V1 验收表

```text
浏览:
  头显转头可以自然浏览 360 视频。
  浏览不会移动 mask，也不会写 path。

目标点选:
  Right Trigger quick click 可以把 mask 平滑移动到 ray 命中的视频目标。

立即点选:
  Left Grip + Right Trigger click 可以让 mask 立即跳到目标。

连续跟随:
  Right Trigger hold + 转头，mask 跟随 head-gaze。
  Right Grip hold + 手柄 ray，mask 跟随 controller ray。
  release 后 lock + flush。

边缘/舒适区平移:
  follow 目标接近舒适视野边缘时，相机/世界和 mask 一起平移。

微调:
  thumbstick nudge 或工作台按钮可连续移动 mask。

FOV:
  Right Thumbstick Up/Down 连续调 mask FOV。
  debounce 后 flush。

Opacity:
  focused Opacity slider + thumbstick 调整黑色遮罩深度。

Playback / recording rate:
  focused rate slider + thumbstick 调整，复用 rateCurve。

Effects:
  A hold radial 可添加常用 effect。
  Effects 面板可添加更多 effect。
  结果走 createEffectEvent。

Lock:
  release follow 会 lock。
  工作台 / radial 可显式 Lock / Unlock。

BGM:
  Audio 面板可选择 BGM 和 gain。

Export:
  Export 面板可触发 render/export。
```

### 推荐实现文件边界

建议新增或整理为：

```text
apps/web/src/features/webxr/quest-editor/
  controls/
    useQuestSpatialEditorInput.ts
    questControllerState.ts
    questInputModeMachine.ts
    questRayToVideoPose.ts
  ui/
    QuestSpatialWorkbench.tsx
    QuestRadialMenu.tsx
    QuestStatusBadges.tsx
    QuestParameterSlider.tsx
  webxr/
    QuestMaskHitSphere.tsx
    QuestControllerRayCursor.tsx
    QuestComfortEdgePan.tsx
  adapters/
    QuestEditorOperationsAdapter.ts
```

这些文件不应该复制 PC 的 DOM input hook。它们应该调用：

```text
apps/web/src/features/webxr/pc-editor/controls/operations/*
apps/web/src/features/webxr/pc-editor/data/timeline-bridge/*
apps/web/src/features/webxr/pc-editor/webxr/AFrameCropViewportMask.tsx
```

后续如果命名上不想让 VR 依赖 `pc-editor` 目录，可以再把 `controls/operations`、`data/timeline-bridge` 和 `webxr/AFrameCropViewportMask` 提升到 shared WebXR editor 层。

### 首轮实现优先级

P0：先做最小闭环

```text
1. Right Trigger click -> ray target -> moveMaskTo。
2. Right Trigger hold -> head-gaze follow -> release lock + flush。
3. Right Grip hold -> controller ray follow -> release lock + flush。
4. Right Thumbstick Up/Down -> mask FOV continuous。
5. Workbench Lock / Save / Cut 三个大按钮。
6. A hold radial -> Cut / Save / Lock / FOV+ / FOV-。
```

P1：补齐 PC 已有的参数能力

```text
1. focused Opacity slider + thumbstick。
2. focused Playback/Recording rate + thumbstick。
3. Effects 面板和 createEffectEvent。
4. Audio 面板和 BGM selection / gain。
5. Comfort edge pan。
```

P2：完善复杂剪辑

```text
1. discard / restore range。
2. effect params。
3. mini timeline / marker display。
4. export status panel。
5. hand tracking 同语义输入。
```

## 结论

PC editor 的完整交互可以迁移到 Quest，但不能靠“给每个快捷键找一个手柄按钮”。正确方式是：

```text
Trigger / Grip 负责进入高频编辑模式。
头显转头和 controller ray 负责提供方向。
Thumbstick 负责连续参数。
A hold radial 负责高频命令。
前下方工作台负责低频复杂操作。
B 永远负责取消/返回。
```

这样既能覆盖 PC editor 当前所有能力，又不会把有限的手柄按钮用爆。
