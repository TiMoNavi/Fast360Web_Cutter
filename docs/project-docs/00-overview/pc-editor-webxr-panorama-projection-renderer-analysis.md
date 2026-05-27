# PC Editor WebXR 全景重投影渲染器分析

本文讨论一个关键升级方向：

```text
把 360 预览从“球内摄像机”升级为“全景重投影渲染器”。
```

这不是一个普通视觉优化，而是会影响 PC 预览、mask controller、后端裁剪、特效系统和 VR immersive 预览一致性的架构问题。

## 1. 当前问题

当前 Player V2 的 PC / A-Frame 预览主要是：

```text
360 equirectangular video
  -> a-videosphere
  -> A-Frame camera
  -> 用户在球内看视频
```

这种方式适合普通 360 浏览：

```text
look yaw / pitch
camera fov
球面遮罩
```

但它不适合小行星、鱼眼、兔子洞、360 变形运镜这类效果。

原因是普通 camera FOV 属于 rectilinear perspective projection。FOV 接近 180 度时：

```text
tan(fov / 2) -> infinity
```

画面会向屏幕边缘无限拉伸。用户期待的小行星不是这种拉伸，而是：

```text
地面形成一个球。
天空变成外圈环形。
```

这通常来自：

```text
stereographic projection
little planet projection
fisheye / polar reprojection
```

因此，“滚轮拉远到小行星”不能只改 A-Frame camera FOV。滚轮应该改变全景重投影参数。

## 2. 球内摄像机 vs 全景重投影渲染器

### 2.1 球内摄像机

```text
source equirectangular
  -> texture on sphere
  -> camera inside sphere
  -> WebGL perspective camera projects to screen
```

优点：

```text
适合 VR immersive。
头显自然转头就是看球面。
A-Frame 支持成熟。
mask controller 当前就是围绕这个模型建立的。
```

缺点：

```text
只能表达普通透视视角。
极大 FOV 会边缘拉伸。
不能自然得到 little planet / stereographic。
PC 屏幕上的“滚轮缩放”无法等价于专业 360 编辑软件里的投影缩放。
```

### 2.2 全景重投影渲染器

```text
source equirectangular
  -> video texture
  -> shader / canvas / WebGL renderer
  -> output pixel -> sphere direction -> equirectangular uv
  -> final 2D preview frame
```

它的核心不是 camera，而是 projection function。

典型参数：

```text
projection: rectilinear | stereographic | fisheye | equirect | little-planet
yaw
pitch
roll
scale / zoom
fov
output aspect
```

优点：

```text
能连续表达普通视角、鱼眼、小行星、兔子洞。
PC 屏幕预览更接近最终 2D 导出。
后端可以使用同一套数学模型做 remap。
```

缺点：

```text
需要重写 PC 主预览渲染层。
mask controller 的四角、遮罩范围、screenRect 都需要重新定义。
VR immersive 不能直接拿这个 2D 平面预览替代球内真实空间体验。
```

## 3. 小行星投影的坐标变换

小行星常见做法是 stereographic projection。

简化流程：

```text
output pixel (x, y)
  -> normalized screen point p
  -> stereographic inverse
  -> sphere direction
  -> equirectangular uv
  -> sample video
```

伪代码：

```text
p = centered_screen_xy
r = length(p)
phi = atan2(p.x, p.y)

theta = 2 * atan(r / scale)

direction.x = sin(theta) * sin(phi)
direction.y = -cos(theta)
direction.z = sin(theta) * cos(phi)

direction = rotate(direction, yaw, pitch, roll)

lon = atan2(direction.x, -direction.z)
lat = asin(direction.y)

u = lon / (2 * PI) + 0.5
v = 0.5 - lat / PI
```

直觉：

```text
scale 越小：
  小行星球体越明显。

pitch 越接近 -90：
  地面越位于中心。
  天空越容易成为外圈环形。

roll：
  控制小行星旋转。
```

## 4. 遮罩能不能对位

能，但不能沿用现在的简单 screenRect 思路。

当前 mask controller 的语义主要是：

```text
球面中心 center yaw/pitch
球面视场 fov h/v
球面四角 corners
投影到屏幕 screenRect
```

在球内摄像机模型里，四角到屏幕的投影由 A-Frame camera 自然完成。

全景重投影后，遮罩对位要改成：

```text
mask spherical boundary
  -> projection function
  -> output screen polygon / curved boundary
```

难点：

```text
1. 遮罩边界在小行星投影下不一定还是矩形。
2. 四个角投影出来可能不足以描述真实边界。
3. feather / 圆角 / mask opacity 需要在投影后重新计算。
4. 屏幕上的 maskViewportBounds 可能从 rect 变成 polygon 或 sampled contour。
```

短期可行方案：

```text
保留 viewTarget.center / fov 作为导出和 mask 的球面语义。
新增 projectedMaskBounds：
  corners
  edgeSamples
  screenPolygon
  boundingRect
```

这样：

```text
黑场 / 白场：
  可以继续用 boundingRect 或 polygon 近似。

精确遮罩：
  用 sampled contour 或 shader mask。
```

结论：

```text
遮罩可以对位，但状态池需要从“矩形 bounds”升级到“投影后的 mask geometry”。
```

## 5. 后端裁剪能不能一致

能，而且后端更适合做最终准确输出。

后端当前导出可以理解为：

```text
source equirectangular frame
  -> projection/remap
  -> 16:9 output frame
```

要支持小行星，只需要把 projection/remap 扩展为同一套 projection spec：

```text
ProjectionViewState
  projection
  yaw
  pitch
  roll
  scale
  fov
  outputAspect
```

后端每帧生成 remap map：

```text
output pixel
  -> projection inverse
  -> sphere direction
  -> equirectangular uv
  -> cv2.remap
```

一致性的关键不在“前后端都叫 little planet”，而在：

```text
前端 shader 和后端 remap 使用同一份数学定义。
参数单位一致。
旋转顺序一致。
equirectangular u/v 约定一致。
边界 wrap / clamp 一致。
插值方式尽量一致。
```

风险：

```text
WebGL texture sampling 和 OpenCV remap 的插值会有轻微差异。
边缘、极点、wrap seam 可能不同。
抗锯齿和色彩空间可能不同。
```

所以目标应分级：

```text
preview-equivalent：
  前端和后端体感一致。

pixel-close：
  测试帧平均差异小。

pixel-identical：
  不建议作为短期目标。
```

## 6. VR immersive 模式怎么办

VR immersive 完全可以继续使用球内摄像机。

原因：

```text
用户戴头显时，本质是在 360 空间里转头。
球内摄像机是最自然、最舒适、最符合 WebXR 的预览方式。
把 little planet 2D 重投影硬贴到头显里，反而可能不舒适。
```

但需要明确：

```text
球内摄像机和全景重投影渲染器看到的画面不总是一致。
```

一致的情况：

```text
projection = rectilinear
pitch/yaw/fov 与 camera pose 对齐
FOV 不极端
```

这时 PC 全景重投影可以近似模拟普通球内摄像机看到的画面。

不一致的情况：

```text
projection = stereographic / little-planet / fisheye
scale 很小
pitch 接近 -90
roll 明显
```

这时 PC 看到的是 2D 成片预览，VR 看到的是球内空间观察，两者不是同一种视觉。

因此建议：

```text
PC 模式：
  以最终导出预览为主。
  使用全景重投影渲染器。

VR immersive 模式：
  以沉浸式选景和操作为主。
  继续使用球内摄像机。
  对 little planet 等 2D 投影效果，用 symbolic / inset preview / floating preview panel 提示。
```

VR 中可选方案：

```text
方案 A：保持球内摄像机，只显示效果提示。
  最稳定，舒适度最好。

方案 B：在 VR 中放一个浮动 2D 预览板。
  板上显示最终 little planet 画面。
  用户仍在球内环境中操作。

方案 C：VR 也切成 2D 投影世界。
  不建议短期做，容易晕，也会破坏沉浸式选景。
```

## 7. 推荐架构

新增一个投影视图状态，而不是继续滥用 camera fov：

```text
ProjectionViewState
  projection: rectilinear | stereographic | fisheye
  yaw: number
  pitch: number
  roll: number
  scale: number
  fov: number
  outputAspect: 16 / 9
```

数据流：

```text
wheel / preset / keyboard
  -> interaction adapter
  -> PcEditorEventBus
  -> workflow
  -> runtime state pool: projectionView
  -> PC PanoramaProjectionRenderer
  -> backend projection remap
```

mask 数据流：

```text
viewTarget / cropMask
  -> spherical mask geometry
  -> projectionView
  -> projectedMaskBounds
  -> PC preview / effect preview / backend export
```

## 8. 分阶段路线

### 阶段 1：PC projection renderer demo

目标：

```text
不替换现有 Player V2 主链路。
新建独立 demo / adapter。
验证滚轮能连续从普通视角过渡到 little planet。
```

验收：

```text
地面能形成球。
天空能形成环。
没有普通 FOV 175 的边缘无限拉伸。
```

### 阶段 2：后端 projection remap

目标：

```text
后端支持 projection=stereographic。
同一组参数能导出 little planet MP4。
```

验收：

```text
前端 demo 截图与后端导出关键帧体感一致。
```

### 阶段 3：mask projection 对位

目标：

```text
新增 projectedMaskBounds。
黑场、白场、遮罩类效果能跟随投影后画面。
```

验收：

```text
PC preview 的 viewport-mask 位置与导出效果范围一致。
```

### 阶段 4：接入 Player V2 PC 模式

目标：

```text
PC Player V2 主预览可以选择 rectilinear / stereographic projection。
滚轮缩放改为 projection scale。
小行星预设改为 projection path。
```

### 阶段 5：VR immersive 分流

目标：

```text
VR 继续球内摄像机。
对 2D 投影效果提供 floating preview panel 或 symbolic cue。
```

## 9. 当前结论

```text
把 360 预览升级为全景重投影渲染器是正确方向。
但不能直接在现有 Player V2 里临时叠一个小行星 shader。
```

必须先定义清楚：

```text
ProjectionViewState
projection math
mask projected geometry
backend remap contract
PC / VR preview 分流策略
```

否则会出现：

```text
前端看着像小行星，后端导出不一致。
mask 黑场范围对不上。
VR immersive 看到的画面和 PC 预览语义混乱。
滚轮缩放从普通 FOV 突然跳到另一个投影，产生顿挫和黑遮罩。
```

因此下一步不建议继续补丁式修改 `camera.fov`，而应先做独立的 `PanoramaProjectionRenderer` demo 和后端 projection remap 原型。
