# 3DUI

`3DUI` 是 PC editor 里用于沉浸式 WebXR / A-Frame 空间 UI 实验的目录。这里的 UI 目标不是普通页面 DOM overlay，而是要真正渲染进 A-Frame / WebXR scene，进入头显里的 WebXR framebuffer。

当前验证入口：

- `https://localhost:3080/xr/player-v3`
- Next 页面入口：`apps/web/app/xr/player-v3/page.tsx`
- 播放器组合壳：`apps/web/src/components/pc_editor/Aframe/player-v3/PlayerV3.tsx`

当前最重要的边界：这个阶段只确认了视觉表现路径测试正常。交互、命令语义、controller 输入、真实剪辑行为、Quest 真机完整流程都还没有验证。

## Player V3 当前组合方式

`/xr/player-v3` 会先在 server 侧读取当前 PC editor player model，然后在 client 侧渲染 `PlayerV3`。

```text
PlayerV3Page
  buildPcEditorPlayerModel(cookieHeader)
  PlayerV3
    AFrame360VideoPlayer
      AFrameScene
        AFrameVideoSphere
        ArwesWorkbenchSpatialTable
        XrCropMask
    DOM overlay
      XrHud
```

`AFrame360VideoPlayer` 负责 A-Frame scene、camera、mouse cursor、controller laser controls、video element 和 360 video sphere。`PlayerV3` 自己维护播放状态、mask center/FOV/opacity、recording flag、auto-render flag 和 XR status。

当前真正挂到 `/xr/player-v3` 里的 3D UI 是 `ArwesWorkbenchSpatialTable`。旧的 player-bar 实验仍然从这个目录导出，但现在没有被 `PlayerV3` 渲染。

## 当前生效的 3D UI：Arwes Workbench Spatial Table

相关文件：

```text
arwes-workbench-spatial/
  ArwesWorkbenchSpatialTable.tsx
  ArwesWorkbenchSpatialLayout.ts
  ArwesWorkbenchSpatialPainter.ts
  ArwesWorkbenchFlatReference.tsx
```

这个 table 是放在 player-v3 A-Frame scene 内的 world-space 对象。它不是 DOM overlay，也不是 camera-locked 的屏幕固定 UI。

当前实现方式是：把一个平面的 Arwes 风格 workbench 转成 canvas texture，再把这些 texture 挂到透明的 A-Frame plane 上：

```text
base canvas:
  glass panel、frame、grid、section containers

control canvas:
  CUT core、direct buttons、workflow buttons、module buttons、framing screen

text canvas:
  titles、telemetry、button labels、status text
```

运行时空间分层：

```text
glow/backing plane   z -0.012
base plane           z  0
control plane        z  0.014
text plane           z  0.028
single hit plane     z  0.04
```

texture canvas 会创建在 `document.body` 里，并使用稳定 ID：

```text
arwes-workbench-spatial-table-base
arwes-workbench-spatial-table-controls
arwes-workbench-spatial-table-text
```

`ArwesWorkbenchSpatialPainter.ts` 用 Canvas 2D API 绘制每一层。`ArwesWorkbenchSpatialTable.tsx` 在绘制后把 A-Frame material map 标记为 dirty，让 WebGL texture 更新。

## Layout 模型

`ArwesWorkbenchSpatialLayout.ts` 是当前 spatial table 的坐标源：

```text
canvas size:
  1600 x 480

world size:
  1.25 x 0.3

desktop preview pose:
  position 0 1.05 -0.95
  rotation -58 0 0

XR pose:
  position 0 0.92 -0.72
  rotation -72 0 0
```

table 会监听最近的 `a-scene` 上的 `enter-vr` / `exit-vr` 事件，并在 desktop preview pose 和 XR pose 之间切换。

`arwesWorkbenchRegions` 已经定义了按钮类区域的 canvas pixel 坐标。现在这些 region 只是视觉和布局数据，还没有转换成每个按钮独立的 hit plane，也没有绑定真实 command。

## 当前测试边界

现在的自动化覆盖是视觉探针：

- `apps/web/e2e/player-v3-arwes-workbench.spec.ts`
- 截取 flat source 和 player-v3 spatial table 截图。
- 验证 `/xr/player-v3` 能加载 A-Frame stage 和 DOM overlay。
- 验证当前 route 不渲染旧的 `xr-session-player-ui`、`HybridSkinPlayerBar`、`arwes-spatial-desk-root`。
- 等待 A-Frame scene 和 table plane mesh 就绪。
- 检查 base / control / text 三个 canvas 都有实际绘制像素。
- 对最终截图采样 neon table 像素，避免 WebGL 空白画面误通过。

所以当前可以相信的是：

```text
已验证：
  visual canvas painting
  A-Frame plane attachment
  texture presence
  desktop screenshot visibility
  player-v3 没有加载旧 UI 实现

未验证：
  每个按钮的交互
  command dispatch
  controller ray 行为
  hover / pressed / active 状态重绘
  真实剪辑 workflow
  从 3D table 触发 seek / play / record
  Quest 头显内的人机工学
  长时间 session 稳定性
```

因此评估这个 route 时，要把它当成视觉 baseline，而不是完成的空间编辑器。

## 保留但当前未接入的实验

`hybrid-player/`

- `HybridSkinPlayerBar` 会创建一个离屏 DOM/CSS skin，把它转成 Three `HTMLMesh`，再叠加 native A-Frame text/icons 和透明 hit planes。
- 它对后续“视觉 skin + native text + hit plane”的分层架构有参考价值。
- 它当前没有挂到 `/xr/player-v3`。

`native-player/`

- `SpatialNativePlayerBar` 是纯 A-Frame primitive 的播放器条原型。
- 它可以证明基础 placement 和 click handling 思路，但不是最终视觉方向。
- 它当前没有挂到 `/xr/player-v3`。

`commands/`

- 这里保留了一份 3DUI 实验用的 `PcEditorCommand` command bus。
- 当前 `PlayerV3` 从 `components/pc_editor/UI` 导入 command subscription 类型，而 hybrid 3DUI 从 `3DUI/commands` 导入。
- 正式做交互前应该统一这份 command contract，否则 2D UI 和 3D UI 的语义可能漂移。

## 后续实现原则

任何必须在 immersive VR 里工作的 UI，都按下面的规则推进：

1. 不依赖普通页面 DOM overlay 承担头显内核心操作。
2. 可见 XR UI 必须进入 A-Frame scene，确保进入 WebXR framebuffer。
3. 复杂 UI 先拆成明确层级：
   - visual skin：canvas texture 或 native geometry
   - text：快速视觉对齐可以先用 canvas text，需要头显清晰度时再换 native `a-text`
   - interaction：透明 raycast hit planes
   - behavior：共享 editor command / event contract
4. layout 数据集中维护，避免 visual rect、text anchor、hit target 变成三套手写坐标。
5. 视觉 baseline 稳定后再补交互，并且交互要单独测试。

## 下一步

下一阶段不要描述成已经完成。真正需要新增并测试的是：

- 从 `arwesWorkbenchRegions` 生成每个 region 的 hit plane
- 把 region ID 映射到真实 `PcEditorCommand`
- hover / pressed / active 状态触发 control canvas 局部重绘
- controller ray、mouse cursor、Quest 真机输入验证
- 统一 `UI` 和 `3DUI` 的 command bus / command type
- 只有在头显里 canvas text 不够清晰的地方，再替换成 native text

在这些完成前，`/xr/player-v3` 应该继续标记为视觉验证 route。
