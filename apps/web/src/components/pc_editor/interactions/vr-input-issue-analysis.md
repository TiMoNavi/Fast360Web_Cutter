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

## 优先修复顺序

1. 建立 VR debug overlay：显示 hand buttons/axes、head gaze、controller ray、background hit、mask center、last hit target。
2. 修坐标基线：先让双 grip head gaze 追踪完全正确，再修 trigger 背景点选，最后修摇杆增量。
3. 以播放器 UI 为模板，重做播放列表 hit plane 层级，确认 item click 能进 `player.source.select`。
4. 验证缩略图链路：Quest 直接访问 `thumbnailUrl`，再验证 3D canvas image load。
5. 工作台和播放列表统一 `debug3dui` hit plane 可视化。
6. 重写环形菜单为 controller-attached + headset-facing + dwell 状态机。

## 当前不要继续做的事

- 不要继续靠猜测增减 yaw offset，例如 `+90`、`-90`。这会让某个动作看似好了，另一个动作更坏。
- 不要在每个 3D UI 组件里各写一套 hit-test 逻辑。播放器 UI 可用，应抽象或复制它的 hit slot 模式。
- 不要只看 DOM debug state。VR 里的问题必须在头显内显示，否则很难判断手柄事件、ray 命中、坐标转换哪一层错了。
- 不要先优化环形菜单视觉。B 菜单的核心风险是 pose、hover dwell、关闭状态机，不是样式。
