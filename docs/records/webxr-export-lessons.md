# WebXR 360 取景与导出验证复盘

> 历史资料提示：本文件保留作为阶段复盘。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

这份文档只总结 WebXR 取景路径、360 映射、FOV、后端投影导出相关问题。账号、上传、下载等基础闭环不在这里展开。

## 当前验证目标

当前 WebXR 裁剪页还没有接真实头显姿态，而是用测试按钮生成 `ViewPathPatch`，再交给后端 `render-test` 导出短 MP4。

这个测试闭环的价值是验证：

```text
ViewPathPoint 数据结构能否表达取景中心。
yaw / pitch / FOV 能否影响最终导出画面。
enabled=false 能否丢弃一段画面。
cut=true 能否形成导出边界。
后端是否能按路径点生成稳定的 16:9 平面视频。
```

它不验证：

```text
真实头显佩戴体验。
真实 controller 操作。
最终生产级逐帧裁剪性能。
长视频 60 秒分片队列。
```

## 数据结构启示

后续真实头显接入时，头显姿态只是数据来源。后端不应该依赖 WebXR 的实时状态，而应该只依赖路径时间线：

```text
tMs
center.yaw
center.pitch
fov.h
fov.v
enabled
cut
locked
input
replaceRange
```

这带来一个重要分层：

```text
采集 / 存储：低频关键点。
导出 / 渲染：按目标 fps 在关键点之间插值。
```

不要把头显每帧姿态都持久化。真实头显可以在本地 render loop 里高频跟随，但只在变化超过阈值时写关键点。导出时再按 30fps / 60fps 生成每帧或每 N 帧的投影参数。

## 问题 1：固定 60 度看起来旋转过快

### 现象

固定环绕测试原本是 60 度 yaw sweep，但导出画面看起来转得很快。

### 原因

最早的测试把 60 度压进了很短的 smoke render 时长。测试视频只有几秒时，就会变成：

```text
60 度 / 7.5 秒
```

这不符合正常头显观看路径。

### 处理

改成按角速度推导扫过角度：

```text
目标速率约 1 度/秒。
最长 60 秒。
最多扫 60 度。
如果视频只有 8 秒，只扫约 8 度。
```

结论：测试路径应该优先按“速度”设计，而不是强行在任意视频长度内完成固定角度。

## 问题 2：复杂路径不像真实头显姿态

### 现象

复杂测试路径加入 yaw、pitch、FOV、enabled、cut 后，画面像快速甩动。

### 原因

早期复杂路径用了多周期正弦，在 7.5 秒短素材里塞入过多来回运动。虽然 yaw 数值没有超过几十度，但视觉上不像人头部运动。

### 处理

改成低频 keyframe 插值：

```text
yaw 小幅左右移动。
pitch 小幅上下移动。
FOV 缓慢放大缩小。
中间保留一段 enabled=false。
保留几个 cut=true 边界。
```

同时后端加导出前限速：

```text
yaw 最大约 8 度/秒。
pitch 最大约 5 度/秒。
FOV 最大约 12 度/秒。
```

结论：测试路径应模拟“人在看东西”，不是为了覆盖字段而制造高频运动。

## 问题 3：`sendcmd + v360` 动态参数导致滚筒式旋转

### 现象

用户观察到前两秒几乎旋转 180 度，像滚筒一样翻转。

### 排查

用标准 2:1 经纬网格素材做了对照：

```text
静态 v360：yaw=5.7, pitch=2.9, FOV=88，画面正常。
sendcmd 动态 v360：同一时刻参数，画面出现明显滚转。
```

这说明不是 `yaw/pitch` 单位错，也不是路径里真的写了 180 度，而是动态命令驱动 `v360` 的方式不可靠。

### 处理

放弃 `sendcmd` 作为当前 smoke render 主路。改为：

```text
把路径按小时间片切开。
每个时间片用静态绝对 yaw / pitch / FOV 跑一次 v360。
最后 concat 成 MP4。
```

当前实现是短子段近似动态路径。它比 `sendcmd` 稳定，但不是最终生产方案。

结论：FFmpeg `v360` 的动态命令能力不能直接当作逐帧姿态投影主方案，需要标准素材回归测试。

## 问题 4：分段静态投影造成卡顿

### 现象

滚筒问题解决后，导出画面一开始明显一卡一卡。

### 原因

最初分段粒度是 500ms。也就是每半秒才更新一次投影参数，当然会有台阶感。

### 处理

把分段刷新和输出帧率绑定：

```text
输出 fps = 30
每 3 帧更新一次投影参数
chunk_ms = 3 * 1000 / 30 ≈ 100ms
```

这比 500ms 平滑很多，同时不会像逐帧 33ms 那样启动太多 FFmpeg 子进程。

当前策略：

```text
WebXR 关键点：5Hz，即 200ms 一个点。
后端渲染刷新：30fps 下每 3 帧一个 chunk，即约 100ms。
chunk 内使用插值后的绝对 yaw / pitch / FOV。
```

结论：路径点密度和渲染刷新密度应分开。路径点少一点，导出时插值更密一点。

### 后续状态

这个方案已经完成了滚筒问题后的第一阶段验证，但现在不再作为 `render-test` 主路径。

当前 `render-test` 已改为逐帧 remap：每一帧根据插值后的 yaw / pitch / FOV 重新计算从输出平面到 equirectangular 源视频的采样映射，再编码成 MP4。

保留 chunk 记录的原因是它解释了我们为什么放弃 `sendcmd + v360`，以及为什么“短片段近似”不是最终方向。

## 问题 5：测试素材会误导判断

### 现象

`pano.mp4` 导出时容易产生强烈滚筒感和空间运动错觉。

### 原因

这个素材本身在管道里快速推进，而且不是最理想的静态几何验证素材。它适合测试“能不能导出真实 360 视频”，但不适合判断 yaw / pitch / FOV 几何是否正确。

### 处理

新增标准 2:1 经纬网格素材：

```text
storage/sample-videos/equirect-grid.png
storage/sample-videos/equirect-grid.mp4
```

这个素材用于检查：

```text
yaw 是否左右平移正确。
pitch 是否上下移动正确。
FOV 是否放大缩小正确。
画面是否发生非预期 roll。
enabled=false 是否删除时间段。
cut=true 是否切段。
```

结论：几何和投影问题必须先用标准网格素材验证，再用真实素材做主观体验验证。

## 问题 6：逐帧 remap 替代短片段近似

### 现象

chunked v360 解决了角度可信问题，但还存在两个明显代价：

```text
chunk 越大，导出画面越容易出现台阶感。
chunk 越小，FFmpeg 子进程越多，导出越慢。
```

这说明问题不适合继续靠缩短 chunk 解决。更合理的方式是按输出帧率逐帧计算投影。

### 处理

当前后端 `render-test` 已改为 OpenCV remap 管线：

```text
读取源 360 视频帧。
按目标 fps 计算当前 tMs。
从 ViewPathPoint 时间线插值得到 yaw / pitch / fov_h / fov_v。
对 1280x720 输出画面中的每个像素生成虚拟相机射线。
用 yaw / pitch 旋转射线。
把射线转成球面 longitude / latitude。
映射回 equirectangular 源视频 x / y。
用 cv2.remap 采样生成输出帧。
通过 FFmpeg 编码为 H.264 MP4。
```

这更接近通用 360 裁切模型：不是在平面视频上裁一个矩形，而是在球心放一个虚拟相机，从内球面上的 equirectangular 视频采样。

### 验证

使用标准 2:1 经纬网格素材验证：

```text
源素材：storage/sample-videos/equirect-grid.mp4
验证输出：storage/exports/remap-grid-yaw-verify.mp4
抽帧图：storage/tmp/remap-grid-frames/yaw-contact.png
路径：yaw 0° -> 60° / 6s
输出：1280x720, 30fps, 180 frames, 6.0s
```

观察结果：

```text
水平线保持水平。
yaw 网格标签按预期移动。
没有非预期 roll。
没有 chunk 台阶感。
```

### 代价

逐帧 remap 是正确性更高的方案，但不是零成本：

```text
4096x2048 源视频 -> 1280x720 输出，6 秒测试约耗时 20 秒。
每帧都要计算或复用采样映射，并执行一次 remap。
60 秒分片和更高输出规格需要继续做性能优化。
```

后续优化方向：

```text
缓存相近姿态/FOV 的 map。
降低 smoke render 输出规格。
正式分片队列并行处理。
GPU shader / CUDA / Vulkan / WebGPU 投影。
直接使用 quaternion / rotation matrix 接真实 WebXR 姿态。
```

## 当前可接受的 MVP 策略

当前 smoke render 策略：

```text
WebXR / 测试端生成 5Hz 关键点。
后端按目标 fps 逐帧插值 yaw / pitch / FOV。
每帧使用 equirectangular -> flat remap 投影。
FFmpeg 负责源帧解码和最终 MP4 编码。
enabled=false 的区间不进入最终导出。
cut=true 用于切段边界。
```

优点：

```text
不会出现 sendcmd 导致的滚筒式旋转。
不再有 chunk 造成的台阶感。
数据量可控。
能验证 yaw / pitch / FOV / enabled / cut 的基本语义。
容易定位问题。
```

缺点：

```text
比普通裁剪和静态 v360 更耗 CPU。
当前同步 render-test 只适合作为短 smoke render。
还没有进入 60 秒分片队列、并行渲染和生产级导出。
```

## 性能判断

历史 chunk 方案的性能判断：

```text
500ms chunk：每秒 2 个投影任务，快，但明显卡。
100ms chunk：每秒 10 个投影任务，当前折中。
33ms chunk：每秒 30 个投影任务，接近逐帧，但会显著变慢。
```

当前逐帧 remap 的性能判断：

```text
1280x720、30fps 已能验证几何正确性。
6 秒网格素材导出约 20 秒，说明生产导出必须队列化。
下一阶段优先保留正确性，再逐步优化性能。
GPU 加速或更底层的视频管线是生产级方向。
```

## 后续接真实 WebXR 的建议

真实头显接入时，建议分三层：

```text
1. 实时预览层
   跟随 XR frame loop，高频更新取景框和预览。

2. 路径记录层
   只记录关键点，默认 5Hz。
   角度 / FOV / enabled / cut 变化超过阈值时立即补点。

3. 导出插值层
   根据输出 fps 生成渲染参数。
   关键点之间做平滑插值和限速。
```

关键点记录阈值建议继续保留：

```text
时间间隔 >= 200ms。
yaw 变化超过 1.5 度。
pitch 变化超过 1.0 度。
FOV 变化超过 0.5 度。
enabled / cut / locked 状态变化。
```

真实头显不应该直接把每帧姿态全部写入数据库。每帧姿态可以用于本地预览，但正式导出应读取关键点时间线。

## 需要保留的回归测试

每次改投影逻辑后，都应该用标准网格素材做回归：

```text
固定 yaw=0。
固定 yaw=+/-10。
固定 pitch=+/-5。
FOV 从 90 缓慢变到 100。
yaw + pitch 同时变化，确认没有 roll。
enabled=false 删除中间一段。
cut=true 切段后 concat。
```

通过标准网格后，再用真实 360 素材观察主观体验。
