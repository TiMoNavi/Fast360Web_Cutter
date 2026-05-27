# PC Editor WebXR 高级运镜预设蓝本

本文先记录 `little-planet` 小行星效果在前端和后端的现状实现，作为后续 `Crystal Ball`、`Slow Rise`、`Dolly Zoom`、`UltraWide Burst` 等高级运镜预设的复制蓝本。

## 1. 核心结论

小行星现在分成两条链路：

1. WebXR 前端预览：在 A-Frame 的 360 球内临时移动 `camera-rig`，让用户看到“起飞到球内上方、镜头向下、FOV 拉大、再回落”的近似效果。
2. 后端导出：不能使用已经 Linear 截平后的画面，而是从原始 2:1 equirectangular 360 源帧重新采样，做真正的 little-planet/stereographic 投影。

这点很重要：Linear 截平后，很多 360 信息已经被丢掉，后面无法再变回完整小行星。所有投影型效果都必须在 `pre_remap_equirect` 阶段处理。

## 2. 小行星效果标识

当前小行星效果使用这些稳定标识：

| 层 | 当前值 |
| --- | --- |
| effectId | `little-planet` |
| eventName | `frame.little_planet_pullback` |
| category | `frame` |
| key | `7` |
| previewTarget | `sphere` |
| previewMode | `sphere_overlay` |
| previewSupport | `approximate` |
| renderStage | `pre_remap_equirect` |

主要落点：

- 后端目录：`apps/api/app/effects/catalog.py`
- 前端 catalog fallback：`apps/web/app/api/effects/catalog/route.ts`
- 前端 effect spec：`apps/web/src/components/pc_editor/effects/compiler/effectSpecs.ts`
- Player V2 effect 映射：`apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts`
- 2D 面板：`apps/web/src/components/pc_editor/UI/PcEffectsPanelSimple.tsx`
- 3D 工作台按钮：`apps/web/src/components/pc_editor/3DUI/arwes-workbench-spatial/ArwesWorkbenchSpatialTable.tsx`

## 3. 前端 WebXR 预览链路

前端实现文件：

`apps/web/src/components/pc_editor/effects/preview/xr/AFrameLittlePlanetFlightPreview.tsx`

挂载点：

`apps/web/src/components/pc_editor/Aframe/player-v2/PlayerV2.tsx`

### 3.1 事件入口

用户从 UI 或快捷键选择效果后，进入统一事件：

```ts
type: "editor.effects.select"
payload: {
  categoryId: "frame",
  effectId: "little-planet",
  eventName: "frame.little_planet_pullback",
  durationMs: 1600,
  params: {
    peakAtMs: 560,
    peakPitch: -88,
    peakSphereFov: 175,
    previewFlightHeight: 46.8,
    previewFov: 138,
    previewPitch: -90
  }
}
```

`AFrameLittlePlanetFlightPreview` 监听 `editor.effects.select`，只处理 `effectId === "little-planet"` 或 `eventName === "frame.little_planet_pullback"` 的事件。

### 3.2 原子事件

小行星没有直接把 DOM 当作状态源，而是新增了单独原子事件：

```ts
type: "editor.xr.camera_rig.pose.set"
payload: {
  active: true,
  id: "little-planet-flight",
  position: { x: 0, y: 46.8, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  cameraRotation: { x: -90, y: currentYaw, z: 0 },
  fov: 138,
  source: "workflow"
}
```

这个事件的职责是描述 WebXR 里 `camera-rig` 和 camera 的临时姿态。它不是遮罩事件，也不是导出路径事件。

### 3.3 运行时状态池

3D 坐标进入运行时状态池：

`apps/web/src/components/pc_editor/state/runtimeStateStore.ts`

关键状态：

```ts
type PcEditorXrCameraRigPoseRuntimeState = {
  active: boolean;
  cameraRotation: PcEditorVector3;
  fov?: number;
  id?: string;
  position: PcEditorVector3;
  rotation: PcEditorVector3;
  source: "gesture" | "workflow" | "xr-runtime";
  updatedAt: number;
};
```

相关状态分工：

- `xrCameraRigPose`：WebXR 6DoF 预览姿态，包含 `position`、`rotation`、`cameraRotation`、`fov`。
- `sphereView.fov`：球内 camera 的预览 FOV。
- `viewTarget`：遮罩/取景框的中心和 FOV，用于让遮罩也配合小行星动起来。

### 3.4 三段式组件职责

`AFrameLittlePlanetFlightPreview` 内部实际分成三段：

| 子职责 | 作用 |
| --- | --- |
| `LittlePlanetFlightEventController` | 监听 `editor.effects.select`，计算起飞、峰值、回落动画，并发出原子 pose 事件 |
| `XrCameraRigPoseStateBridge` | 监听 `editor.xr.camera_rig.pose.set`，写入 `xrCameraRigPose` 和 `sphereView.fov` |
| `AFrameXrCameraRigPoseApplier` | 从状态池读取 pose，真正应用到 A-Frame 的 `#camera-rig` 和 camera |

这个拆法是后续高级运镜的基础：新预设应该复用“选择效果 -> 原子事件 -> 状态池 -> A-Frame 应用器”的分层，不要直接在 UI 按钮里操作 A-Frame 节点。

### 3.5 当前小行星动画

动画开始时保存两份恢复快照：

- 当前 `xrCameraRigPose` 或默认 pose。
- 当前 `viewTarget` 或当前 crop mask。

动画峰值：

- `camera-rig.position` 移到球内上方：默认 `y = sphereRadius * 0.78`，当前配置约 `46.8`。
- camera 朝下：`cameraRotation.x = -90`。
- 球内 camera FOV 放大：默认 `previewFov = 138`。
- 遮罩看向地面：默认 `previewMaskPitch = -88`。
- 遮罩 FOV 拉到最大：默认 `MAX_CROP_FOV_H`。

时间结构：

- `peakAtMs` 前：用 `easeOutCubic` 快速上升到峰值。
- `peakAtMs` 后：用 `easeInOutQuad` 回落到原 pose。
- 遮罩中心/FOV 与位移时间对齐：先转到看向地面并拉大 FOV，再缓慢回到进入效果前的镜头。

卸载或中断时必须恢复：

- 发 `editor.xr.camera_rig.pose.set` 的 `phase: "end"`。
- 写回原始 `viewTarget`。

## 4. 后端导出链路

后端核心文件：

`apps/api/app/rendering/remap.py`

入口调用：

- 增量渲染：`apps/api/app/incremental_render.py`
- 测试/手动导出：`apps/api/app/main.py`
- effect 事件读取：`apps/api/app/storage.py`

### 4.1 effect 事件进入导出

效果事件保存在 `effect_events` 表。导出时：

1. `list_effect_events(conn, session_id, start_ms, end_ms)` 取出当前片段内启用的 effect events。
2. `events_for_segment(effects, start_ms, end_ms)` 转成片段相对时间。
3. `run_frame_remap_equirect(..., effect_events=segment_effects)` 把事件交给 remap 管线。

小行星事件必须作为 `effect_events` 进入 `run_frame_remap_equirect`，而不是在 Linear 输出后再做后处理。

### 4.2 pre-remap 投影识别

`remap.py` 中有两组关键常量：

```py
LITTLE_PLANET_PROJECTIONS = {
    "little-planet",
    "little_planet",
    "stereographic",
    "tiny-planet",
    "tiny_planet",
}

PROJECTION_EFFECT_NAMES = {
    "frame.little_planet_pullback",
    "projection.little_planet",
    "projection.stereographic",
    "projection.tiny_planet",
}
```

`post_remap_frame_events()` 会把投影型事件从普通 post-remap frame effects 里排除，避免同一个事件被重复处理。

### 4.3 每帧 remap 流程

`run_frame_remap_equirect()` 每帧做这些事：

1. 用 ffmpeg 从原始视频解出 equirect 源帧。
2. 根据 view path 插值当前 `yaw`、`pitch`、`fov_h`、`fov_v`。
3. 调用 `resolve_projection_state(effect_events, t_ms, ...)` 判断当前帧是否处于投影效果中。
4. 调用 `remap_frame_with_projection(...)` 生成输出帧。
5. 对非投影类效果再执行 `apply_frame_effects(...)`。
6. 用 ffmpeg 编码输出 mp4。

### 4.4 小行星投影计算

Linear 普通透视：

```py
build_equirect_to_flat_maps(...)
```

小行星投影：

```py
build_equirect_to_little_planet_maps(...)
build_little_planet_direction_vectors(...)
direction_vectors_to_equirect_maps(...)
```

动画过渡：

```py
build_equirect_to_little_planet_motion_maps(...)
```

它会先分别生成：

- 当前 Linear 视角的方向向量。
- Little Planet 目标投影的方向向量。

然后按 `progress` 混合两个方向向量，再映射回 equirect 的 `map_x/map_y`。这样后端导出的运动可以从普通视角逐步变成小行星，再回落。

### 4.5 后端小行星参数

`animated_little_planet_params()` 支持这些关键参数：

| 参数 | 作用 |
| --- | --- |
| `peakAtMs` | `frame.little_planet_pullback` 到达峰值的时间 |
| `peakSphereFov` / `sphereFov` / `projectionFov` | 控制 stereographic scale 的目标 FOV |
| `startSphereFov` / `startProjectionFov` | 从 Linear 视角过渡时的起点 FOV |
| `peakPitch` / `centerPitch` / `planetPitch` | 小行星投影中心 pitch，当前默认接近 `-90` |
| `roll` / `rotation` / `peakRoll` | 投影滚转 |
| `yawOffset` | 投影中心 yaw 偏移 |
| `scale` / `zoom` / `planetScale` | 直接控制 planet 缩放 |

## 5. 前端和后端为什么不是同一种实现

WebXR 前端在播放 360 视频时，用户本质上是在一个贴了视频纹理的球内看画面。前端可以移动 `camera-rig`，但源素材如果是单目 360，没有真实深度，所以这个移动不可能产生真正的空间视差。

因此：

- 前端 6DoF 预设适合做“即时预览”和“体感反馈”。
- 后端导出要以 equirect 原始帧为准，使用 remap/projection 代码生成最终视频。
- 对于 Little Planet / Crystal Ball 这类投影效果，后端优先级高于前端近似。

## 6. 后续预设复制模板

新增一个高级运镜预设时，按这个顺序做。

### 6.1 Catalog

在后端 catalog 增加 effect：

```py
effect(
    category_id="frame",
    duration_ms=1600,
    effect_id="crystal-ball",
    event_name="frame.crystal_ball_pull",
    family="frame",
    key="8",
    label="Crystal ball",
    params={...},
    preview_mode="sphere_overlay",
    preview_support="approximate",
    preview_target="sphere",
    render_stage="pre_remap_equirect",
)
```

如果前端需要在后端未启动或 catalog 过旧时仍显示，也要更新：

`apps/web/app/api/effects/catalog/route.ts`

### 6.2 前端 spec 和 UI

同步更新：

- `apps/web/src/components/pc_editor/effects/compiler/effectSpecs.ts`
- `apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts`
- 2D effects panel
- 3D workbench button或菜单
- 快捷键占位，避免和已有 `Tab -> 4 -> 7` 冲突

### 6.3 前端预览控制器

如果新预设只是小行星变体，可以把 `AFrameLittlePlanetFlightPreview` 抽成更通用的 `AFrameProjectionFlightPreview`：

```ts
type ProjectionFlightPreset = {
  effectId: string;
  eventName: string;
  durationMs: number;
  peakAtMs: number;
  peakPose: {
    position: PcEditorVector3;
    rotation: PcEditorVector3;
    cameraRotation: PcEditorVector3;
    fov: number;
  };
  peakMask: {
    pitch: number;
    fovH: number;
  };
};
```

无论是否抽象，都必须保留：

- 通过 `editor.effects.select` 进入。
- 通过 `editor.xr.camera_rig.pose.set` 表达 3D 位移。
- 3D 坐标写入 `xrCameraRigPose` 状态池。
- A-Frame 应用器只从状态池读 pose。
- 动画中断时恢复 pose 和 mask。

### 6.4 后端 projection/remap

如果是投影类效果：

1. 把 eventName 加入 `PROJECTION_EFFECT_NAMES`。
2. 在 `resolve_projection_state()` 中解析对应 projection。
3. 复用或新增 direction vector builder。
4. 如果需要从 Linear 过渡到目标投影，增加 motion maps。
5. 确认该效果不会进入普通 post-remap frame effects。

如果只是普通取景运镜：

- 使用 `render_stage="viewport_path"`。
- 优先复用 view path 的 `yaw/pitch/fov` 关键帧，不要假装后端能导出真实 6DoF 平移。

## 7. Crystal Ball 第一版

`Crystal Ball` 已作为 little-planet 投影族的变体接入第一版。

当前标识：

| 层 | 当前值 |
| --- | --- |
| effectId | `crystal-ball` |
| eventName | `frame.crystal_ball_pull` |
| category | `frame` |
| key | `8` |
| shortcut | `Tab -> 4 -> 8` |
| previewTarget | `sphere` |
| previewMode | `sphere_overlay` |
| previewSupport | `approximate` |
| renderStage | `pre_remap_equirect` |

当前接入点：

- 后端 catalog：`apps/api/app/effects/catalog.py`
- 后端投影事件/remap：`apps/api/app/rendering/remap.py`
- 前端 catalog fallback：`apps/web/app/api/effects/catalog/route.ts`
- 前端 WebXR 预览：`apps/web/src/components/pc_editor/effects/preview/xr/AFrameLittlePlanetFlightPreview.tsx`
- 前端 effect spec：`apps/web/src/components/pc_editor/effects/compiler/effectSpecs.ts`
- Player V2 fallback 映射：`apps/web/src/components/pc_editor/workflows/editor/playerV2EffectCatalog.ts`
- 2D Effects Rack：Frame 第 8 项 `Crystal ball`
- 3D Arwes 工作台：`CRYSTAL` 按钮

前端近似：

- `camera-rig` 缓慢上升，但高度比小行星低一些。
- camera 朝下或斜向下，FOV 拉大到 `130-150`。
- 遮罩 FOV 拉大后保留更久，回落更慢，形成“玻璃球拉开”的节奏。
- 可以加轻微 roll，但要非常克制，避免用户眩晕。

后端导出：

- 复用 stereographic/little-planet remap。
- 把 `centerPitch` 从小行星的 `-88/-90` 改到 `+88/+90`，并加 `roll=180`，得到“水晶球/反小行星”方向。
- 单独 eventName 使用 `frame.crystal_ball_pull`，内部 projection 仍然走 `little_planet` builder。

第一版参数：

```json
{
  "peakAtMs": 760,
  "centerPitch": 88,
  "peakSphereFov": 165,
  "previewFlightHeight": 34,
  "previewFov": 145,
  "previewPitch": -82,
  "previewMaskPitch": -78,
  "previewMaskFov": 178,
  "roll": 180
}
```

## 8. Slow Rise 建议做法

`Slow Rise` 更像 WebXR 体感运镜，不一定是投影效果。

前端近似：

- `camera-rig.position.y` 缓慢升高。
- camera pitch 轻微下压，例如 `-12` 到 `-28`。
- FOV 稍微拉大，例如 `90 -> 108`。
- 遮罩中心可轻微向下，FOV 小幅拉宽。
- 全程时间可以更长，例如 `2200-3200ms`。

后端导出限制：

- 单目 360 素材没有深度，后端无法导出真实“上升平移”的视差。
- 可以导出近似的 viewport path：pitch 下压、FOV 拉宽、yaw 稳定。
- 如果要更强烈的升空感，可以叠加投影类 remap，但这会从“真实升高”变成“风格化投影”。

## 9. Look Around 第一版

`Look around` 是一套简单环顾运镜，已接入第一版。

当前标识：

| 层 | 当前值 |
| --- | --- |
| effectId | `look-around` |
| eventName | `frame.look_around` |
| category | `frame` |
| key | `9` |
| shortcut | `Tab -> 4 -> 9` |
| previewTarget | `viewport-mask` |
| previewMode | `viewport_simulation` |
| renderStage | `viewport_path` |

前端预览：

- 由 `ViewportPathMotionPreviewController` 驱动。
- 默认先向一侧环顾 `sweepYaw=28`，再轻微反向 `returnYaw=-10`，最后回到原镜头。
- FOV 默认小幅变宽 `widenFovH=3`，避免纯 yaw 看起来太机械。

后端导出：

- 通过 `compileViewPathMotionDraft()` 生成 view path range 和 keyframes。
- 后端不需要新 remap 投影，沿用普通 Linear equirect -> viewport 导出。

## 10. Dolly Zoom 第一版

`Dolly zoom` 已接入第一版。它分成两层：

- WebXR 前端：使用 6DoF 近似，临时移动 `camera-rig`，同时反向拉 FOV。
- 后端导出：单目 360 没有真实深度，只导出 FOV 关键帧近似。

当前标识：

| 层 | 当前值 |
| --- | --- |
| effectId | `dolly-zoom` |
| eventName | `frame.dolly_zoom` |
| category | `frame` |
| key | `0` |
| shortcut | `Tab -> 4 -> 0` |
| previewTarget | `sphere` |
| previewMode | `sphere_overlay` |
| renderStage | `viewport_path` |

前端预览：

- 由 `AFrameProjectionFlightPreview` 内部的 Dolly Zoom controller 驱动。
- 继续通过 `editor.xr.camera_rig.pose.set` 原子事件写入 `xrCameraRigPose`。
- 默认 `previewDollyDistance=-6.5`，表示沿当前视线反方向后退。
- 默认 `previewFov=64`，形成“后退 + 变焦压缩”的 vertigo 感。
- 遮罩默认同步收窄 `previewMaskFovDelta=-18`，结束后恢复原 pose 和 mask。

后端导出：

- 通过 `compileViewPathMotionDraft()` 生成一个峰值 FOV keyframe。
- 默认 `peakDeltaFovH=-18`，到 `peakAtMs=820` 时最窄，然后回到原 FOV。
- 这不是物理 dolly，只是 360 单目素材下可导出的近似版本。

## 11. 验证清单

每新增一个高级运镜预设，至少验证：

- `npm run typecheck`
- `python -m compileall apps/api/app`
- `/api/effects/catalog` 能看到新 effect，key 不冲突。
- `/xr/player-v2` 页面正常加载。
- 2D UI、快捷键、3D 工作台都能触发同一个 `editor.effects.select`。
- Runtime state 中能看到 `xrCameraRigPose.position` 等 3D 坐标变化。
- 动画结束或切换效果后 pose、FOV、mask 都能恢复。
- 后端导出使用原始 equirect 源帧，不使用 Linear 截平后的中间结果。
