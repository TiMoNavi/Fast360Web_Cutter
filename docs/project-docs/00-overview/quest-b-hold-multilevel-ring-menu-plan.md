# Quest B Hold 多级圆环空间菜单规划

日期：2026-05-26

## 目标

设计一个适合 Quest 手柄的复杂空间 UI：

```text
按住 B 键：
  在手柄位置生成一个面向头显镜头的圆环菜单。

持续按住 B 键：
  圆环持续存在，并跟随当前交互状态展开层级。

松开 B 键：
  如果当前停留在最终可执行项上，触发该项。
  菜单不立刻消失，而是在 2 秒后淡出/移除。

hover 某个圆弧 0.5 秒：
  当前圆弧旋转到正上方。
  打开第二级圆弧。
  第二级半径 = 第一级半径 * 1.5。
  第二级展开角度 = 120 度。
  后续层级按同样规则继续展开。
```

这个菜单不是普通按钮弹窗，而是一个 hold-open / dwell-expand / release-commit 的层级 marking menu。它适合放高频操作、特效分类、工具选择和上下文动作。

## 产品语义

菜单应服务于“看一遍就能剪”的默认工作流。用户不应该进入复杂参数面板，而是通过少量空间动作快速选择预设。

适合放入这个菜单的内容：

```text
一级：
  CUT
  EFFECTS
  CAMERA
  MASK
  PLAYBACK
  SESSION

二级示例：
  EFFECTS -> TRANSITION / LENS / FRAME / FILTER / GLITCH
  CAMERA -> PUSH IN / PULL OUT / DRIFT LEFT / DRIFT RIGHT
  MASK -> LOCK / FOV+ / FOV- / OPACITY

最终级：
  松开 B 时触发具体 command / effect preset / operation。
```

暂时不适合放入这个菜单的内容：

```text
长文本列表
精细 slider
危险删除操作
需要二次确认的操作
需要键盘输入的操作
```

## 交互模型

### 基础流程

```text
idle
  B down
    -> menuOpen(level=0)
    -> 在右手柄附近生成一级圆环
    -> 圆环 billboard 朝向头显

menuOpen
  controller ray / 指针 hover 某个 arc
    -> hover timer 开始

hover >= 500ms
    -> hovered arc 旋转到正上方
    -> 如果有 children，展开下一层 arc
    -> level += 1

B up
  如果当前路径指向 leaf item：
    -> commit leaf action
  否则：
    -> cancel / no-op
  -> menuClosing
  -> 2 秒后 remove
```

### 为什么是按住 B

B 键适合作为“临时菜单 modifier”：

```text
优点：
  不和 Trigger 的射线确认冲突。
  可以持续按住，让用户在层级间浏览。
  松开可以自然表达 commit/cancel。

风险：
  不同 controller / browser 对 B 键 gamepad index 映射可能不完全一致。
  需要先做 input profiler，确认 Quest Browser / Meta Browser 中 B button 的 index。
```

第一版应把 B 键映射写成配置，而不是硬编码：

```ts
type QuestButtonBinding = {
  hand: "left" | "right";
  semantic: "b-button";
  gamepadButtonIndex: number;
};
```

## 空间布局

### 根节点位置

菜单根节点生成在触发手柄附近：

```text
root position:
  controller grip pose 或 target ray pose 附近

建议偏移：
  controller world position
  + controller up * 0.04m
  + controller forward * 0.12m

原因：
  不要完全贴在手柄模型上，避免被手遮挡。
```

菜单出现后第一版建议固定在生成时的位置，不持续跟随手柄漂移。这样用户移动射线选择时，菜单不会跟着抖。

后续可选模式：

```text
anchored-on-open:
  打开瞬间固定在世界空间。

soft-follow-controller:
  低通跟随手柄，适合手柄位置微调。

head-relative:
  出现在视野前方固定深度，适合更稳定阅读。
```

### 朝向头显

菜单每帧 billboard 朝向头显镜头：

```text
menuRoot.lookAt(headWorldPosition)
```

但需要锁定 roll，避免用户歪头时菜单跟着倾斜太多：

```text
方向：
  面向 head/camera。

roll：
  优先保持 world-up 稳定。
  或只允许小幅 roll smoothing。
```

### 一级圆环

```text
半径：
  0.16m - 0.22m

段数：
  4 - 6 段

每段角宽：
  360 / count

段间隔：
  4 - 8 度

中心 cancel zone：
  半径约 0.06m
```

视觉建议：

```text
idle arc:
  半透明深色底
  cyan / magenta / orange 细边

hover arc:
  亮度提升
  外发光增强
  arc 厚度略增

selected path:
  保持高亮，形成从内到外的路径线索
```

### 子级圆弧

当某个一级 arc hover 超过 0.5 秒：

```text
1. hovered arc 被旋转到正上方。
2. 以它为父节点，展开下一层。
3. 子级圆弧半径 = 父级半径 * 1.5。
4. 子级总展开角度 = 120 度。
5. 子级 arc 分布在正上方 120 度扇区内。
```

例如父级旋转到正上方后，第二级的角度范围：

```text
centerAngle = 90deg
spread = 120deg
start = 30deg
end = 150deg
```

如果二级有 5 个 item：

```text
itemAngleStep = spread / 5
itemArcAngle = itemAngleStep - gap
```

后续层级同理：

```text
level 0 radius = r
level 1 radius = r * 1.5
level 2 radius = r * 1.5 * 1.5
```

需要限制最大层级：

```text
建议最大 3 级。
超过 3 级说明信息结构太深，不适合这种菜单。
```

## 旋转行为

### hover 后父环旋转到正上方

用户 hover 某个 arc 0.5 秒后，当前环要旋转，使 hovered arc 的中心角对齐正上方。

```ts
targetRotation = TOP_ANGLE - hoveredArc.centerAngle;
```

动画建议：

```text
duration:
  160ms - 240ms

easing:
  easeOutCubic

同时：
  selected arc 高亮保持。
  子级 arc 从父 arc 外侧发散出现。
```

注意：旋转只影响当前 level 的 visual group，不应该改变已展开子级的世界选择语义。实现上建议保存 stable item id path，而不是只依赖角度。

### hover 防抖

因为 controller ray 会抖，不能一命中就展开。

```text
hover enter:
  start dwell timer 500ms

hover leave:
  cancel dwell timer

hover 切换 item:
  reset dwell timer

短暂离开小于 80ms:
  可保留 hover，避免抖动导致 timer 重置
```

建议参数：

```ts
const DWELL_TO_EXPAND_MS = 500;
const HOVER_GRACE_MS = 100;
```

## 状态机

```text
closed
  B down -> opening

opening
  after spawn animation -> open

open
  hover arc -> hoverPending
  B up -> close/cancel

hoverPending
  hover >= 500ms and item has children -> expanding
  hover >= 500ms and item is leaf -> armedLeaf
  hover leave -> open

expanding
  rotate parent arc to top
  spawn child ring
  -> open(level + 1)

armedLeaf
  B up -> commit leaf action
  hover leave -> open

closing
  commit/cancel visual result
  wait 2000ms
  -> closed/remove
```

状态数据：

```ts
type RingMenuState = {
  phase: "closed" | "opening" | "open" | "hoverPending" | "expanding" | "armedLeaf" | "closing";
  openedAtMs: number;
  closeAtMs?: number;
  rootPose: SpatialPose;
  levels: RingMenuLevelState[];
  activePath: string[];
  hoveredItemId: string | null;
  hoverStartedAtMs: number | null;
  armedLeafId: string | null;
};
```

## 菜单数据结构

```ts
type SpatialRingMenuItem = {
  id: string;
  label: string;
  icon?: string;
  tone?: "cyan" | "magenta" | "orange" | "danger" | "white";
  command?: PcEditorCommand;
  effectId?: string;
  children?: SpatialRingMenuItem[];
  disabled?: boolean;
};

type SpatialRingMenuDefinition = {
  id: string;
  trigger: "quest-b-hold";
  rootItems: SpatialRingMenuItem[];
  maxDepth: number;
};
```

执行规则：

```text
只有 leaf item 可以在 B up 时 commit。
非 leaf item 的 B up 默认 cancel。
disabled item 可以 hover，但不能 expand/commit。
danger item 不允许 B up 直接提交，除非有二次确认层。
```

## 几何实现建议

### 第一版

第一版不用急着做真实弧形 mesh，可以用近似方案：

```text
每个 arc item:
  a-ring / custom Three arc geometry 作为 visual
  透明 wedge 或 box hit target 作为 interaction
  native a-text label
```

但如果使用 `a-ring`，它天然是完整圆环的一部分，精确扇区和 hit test 不够好。更稳的做法是自定义 Three geometry：

```text
ArcSegmentMesh:
  innerRadius
  outerRadius
  startAngle
  endAngle
  gapAngle
  material
```

命中层：

```text
ArcSegmentHitTarget:
  可先用同样的扇区 geometry，材质透明。
  class="clickable" 或 "xr-clickable"。
```

### 角度坐标

菜单本地坐标约定：

```text
0deg:
  正右

90deg:
  正上

180deg:
  正左

270deg:
  正下
```

从本地点计算角度：

```ts
angle = atan2(localY, localX)
```

因为菜单 billboard 后，命中点需要先转到 menu local space，再判断落在哪个 arc。

## 输入实现建议

### B 键检测

不要只依赖 A-Frame click。B 键是 gamepad button，需要读取 XRInputSource / gamepad 状态。

实现入口建议：

```text
QuestControllerButtonAdapter
  每帧读取 XR session inputSources。
  找到 right hand controller。
  读取 gamepad.buttons[index].pressed。
  生成 semantic events：
    quest:b-down
    quest:b-held
    quest:b-up
```

事件：

```ts
type QuestButtonEvent =
  | { type: "quest:b-down"; hand: "right"; timestamp: number; controllerPose: SpatialPose }
  | { type: "quest:b-held"; hand: "right"; timestamp: number; controllerPose: SpatialPose }
  | { type: "quest:b-up"; hand: "right"; timestamp: number; controllerPose: SpatialPose };
```

### hover 检测

有两条可选路线：

```text
A-Frame raycaster:
  给每个 hit target 加 class="clickable"。
  监听 raycaster-intersected / raycaster-intersected-cleared。

Three Raycaster:
  每帧用 controller targetRaySpace 算 ray。
  intersect menu hit meshes。
  自己管理 hovered item。
```

这个菜单层级复杂、需要 dwell 和 release commit，建议中期用 Three Raycaster 自己管理；第一版可以先用 A-Frame raycaster 快速验证视觉和事件。

### release commit

松开 B 时不要依赖 item click：

```text
B up:
  读取当前 menuState.armedLeafId 或 hovered leaf。
  如果存在 leaf:
    dispatch command/effect。
  否则:
    cancel。
```

原因：

```text
这个交互是“按住 B 打开，移动/悬停选择，松开 B 提交”。
它不是“Trigger click 某个 item”。
```

## 视觉规则

### 出现动画

```text
0ms:
  root at controller position
  scale 0.2
  opacity 0

120ms:
  scale 1
  opacity 1
  arc stagger appear
```

### hover dwell 反馈

hover 0.5 秒必须有可见进度，避免用户不知道为什么还没展开。

建议：

```text
hovered arc 外沿出现细 progress glow。
progress 从 0 -> 100%。
到 100% 时触发展开。
```

### 子级展开

```text
父 arc 旋转到正上方。
父 arc 到子级 arc 之间出现一条短连接光线。
子级 arc 从父 arc 外侧 0.85 scale / 0 opacity 展开到目标位置。
```

### 关闭动画

```text
B up 后：
  如果 commit，目标 leaf 闪一下 orange/cyan。
  其余 arc 降低 opacity。
  2 秒后整体淡出。
```

## 和现有系统的边界

这个菜单属于 `3DUI` 的交互层，不应该直接写后端逻辑。

推荐目录：

```text
apps/web/src/components/pc_editor/3DUI/ring-menu/
  SpatialRingMenu.tsx
  SpatialRingMenuGeometry.ts
  SpatialRingMenuLayout.ts
  SpatialRingMenuState.ts
  QuestBHoldRingMenuAdapter.tsx
  index.ts
```

后续触发业务时，只派发现有 command / event：

```text
SpatialRingMenu
  -> PcEditorCommand
  -> PcEditorEvent / workflow
  -> timeline / effect event / backend
```

不要让 ring menu 直接调用：

```text
fetch backend
render-test
switch session
write timeline file
```

## 第一阶段 MVP

目标：验证“B hold 出菜单、hover 展开、B up 提交”的最小闭环。

范围：

```text
1. 只做右手 B 键。
2. 一级 4 段。
3. 二级最多 4 段。
4. 最多 2 级。
5. release leaf 只 console / debug event，不接真实业务。
6. 菜单 world-anchored on open。
7. 始终 billboard 朝向 head。
```

示例菜单：

```text
一级：
  CUT
  FX
  CAMERA
  MASK

FX 二级：
  FLASH
  BLACK
  LENS
  GLITCH

CAMERA 二级：
  PUSH
  PULL
  LEFT
  RIGHT
```

验收：

```text
B down:
  手柄附近出现 4 段圆环。

B held:
  菜单持续存在。

hover FX 0.5s:
  FX 旋转到正上方。
  半径 1.5 倍处出现 120 度二级圆弧。

hover FLASH:
  FLASH 高亮为 armed leaf。

B up:
  记录 menu-commit FLASH。
  菜单保持 2 秒，然后消失。
```

## 第二阶段

目标：让它成为可复用空间菜单组件。

新增：

```text
1. 支持 3 级菜单。
2. 支持 custom arc geometry。
3. 支持 dwell progress 可视化。
4. 支持 hover grace / jitter protection。
5. 支持 disabled / danger / active item。
6. 支持命令派发到 PcEditorCommand。
7. 支持 Playwright desktop mock 输入。
8. 支持 Quest 真机事件记录。
```

验收：

```text
同一套 menu definition 可以渲染不同菜单。
桌面 mock 能模拟 B down / hover / B up。
Quest 真机能记录 button index、hover item、commit item。
```

## 风险

### B 键映射风险

不同浏览器中 B 键 index 可能不同。必须先做 input profiler。

### hover 误触

0.5 秒 dwell 如果没有 grace，会被手抖打断。需要 hover debounce。

### 菜单太深

超过 3 级会让用户迷失。产品上应限制层级。

### 角度选择不稳定

如果 ray hit wedge 不稳定，可以退一步用 marking menu 方向选择：

```text
不要求精确命中 arc mesh。
只根据 controller ray 在 menu plane 上的方向角判断 item。
```

这个方式对 controller ray 偏差更宽容。

### 视觉遮挡

手柄附近菜单可能遮挡视频内容。打开时可以把菜单偏移到手柄上方/前方，并保持半透明。

## 建议下一步

先做一个 dev-only 原型，不接业务：

```text
1. 新增 ring-menu 目录。
2. 做静态 4 段一级圆环。
3. 加 B down/up mock 或 keyboard B mock。
4. 加 billboard 朝向 camera。
5. 加 hover dwell 0.5 秒。
6. 加二级 120 度圆弧。
7. B up 输出 commit/cancel debug state。
8. 再接 Quest 真机 B button profiler。
```

等这个闭环稳定后，再把 `FX / CAMERA / MASK` 的 leaf item 映射到真实 `PcEditorCommand` 或 effect preset。
