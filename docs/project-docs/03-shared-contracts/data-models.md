# 共享数据模型

## 核心模型总览

三端共享以下核心模型：

```text
User / AuthSession
Video
CutSession
ClipEditConfig
ViewPathPatch
ViewPathPoint
ViewPathTimeline
TimelineBuildReport
EffectEventsPatch
EffectEvent
MusicTrack
SessionMusicConfig
PlaybackClientState
MinuteSegment
Export
```

其中最关键的是：

```text
ClipEditConfig
ViewPathPatch
ViewPathPoint
ViewPathTimeline
```

它们定义了正式裁剪输入。

## 命名与边界

用户口语里说的“注视点”在本项目里拆成两个概念：

```text
head_gaze：
输入来源，表示头显朝向推导出的视线方向。它不是眼动追踪。

ViewPathPoint：
协议数据，表示源视频时间轴上的一个取景路径点。它可以来自 head_gaze，也可以来自 controller_ray。
```

因此后端和共享协议里统一使用 `ViewPathPoint`，中文可以叫“取景点”“视角点”或“取景路径点”。不要把它命名成 `EyeGazePoint`，否则会误导成真实眼动数据；也不要把它命名成 `PlaybackPoint`，因为播放状态和剪辑路径是两类数据。

WebXR 回传给后端的数据边界：

```text
正式裁剪输入：
ClipEditConfig
ViewPathPatch / ViewPathPoint
EffectEventsPatch / EffectEvent

音乐输入：
MusicTrack
SessionMusicConfig

播放体验与调试状态：
PlaybackClientState
```

后端正式导出只应依赖正式裁剪输入。`PlaybackClientState` 可以用于恢复 UI、显示设备状态或调试，但默认不影响最终 MP4。

`ViewPathTimeline` 是把多个 `ViewPathPatch` 编译后的线性时间线文件。详细文件契约见：

```text
03-shared-contracts/view-path-timeline-file.md
```

## ClipEditConfig

含义：

```text
整个视频的全局剪辑参数。
创建 cut session 时提交。
后端正式裁剪会读取。
```

当前已实现字段：

```text
version
videoId
sessionId
source
timelineRevision
output.aspect
output.width
output.height
output.fps
```

目标扩展字段：

```text
projection
defaults
pathPolicy
renderPolicy
```

第一版默认：

```text
aspect = 16:9
width = 1920
height = 1080
fps = 30
source = webxr
```

## ViewPathPatch

含义：

```text
WebXR 端上传的一批取景路径点，也就是用户在某段视频时间内的取景剪辑意图。
必须带 replaceRange。
后端用 replaceRange 覆盖旧点后写入新点。
```

核心字段：

```text
version
videoId
sessionId
takeId
pathRevision
replaceRange.startMs
replaceRange.endMs
replaceRange.reason
points[]
```

关键语义：

```text
replaceRange 使用半开区间 [startMs, endMs)。
重放同一段必须提交新的 takeId 和 replaceRange。
后端不能依赖 tMs 完全相等来覆盖旧点。
points 是低频关键点，不是每帧采样。
```

## ViewPathPoint

含义：

```text
取景时间线上的一个关键点。
后端会在关键点之间插值，生成每帧渲染参数。
它表达“这个视频时间点应该看哪里、是否保留、是否切开、FOV 是多少”。
```

核心字段：

```text
seq
tMs
center.yaw
center.pitch
fov.h
fov.v
roll
enabled
cut
locked
smoothFollow
interpolation
transitionMs
input
```

字段语义：

```text
seq：
前端生成的顺序号，用于同一 patch 内排序和调试。

tMs：
源视频时间轴上的毫秒数，来自 video.currentTime * 1000。
播放倍速不会改变 tMs。

center.yaw / center.pitch：
取景框中心点，单位 degree。yaw 建议标准化到 -180 到 180，pitch 建议限制在 -85 到 85。

fov.h / fov.v：
虚拟相机 FOV。改变 FOV 表现为推近或拉远，不改变输出比例。

enabled：
状态字段。false 表示该点之后进入放弃区间，直到下一次 enabled=true 或 replaceRange 结束。

cut：
切段边界。后端不应跨 cut 做平滑插值。

locked：
表示取景框处于锁定状态。

smoothFollow：
表示前端上传的是平滑后的取景中心。

interpolation：
该点到下一点之间的插值方式。第一版支持 linear / fast / hold。

transitionMs：
与 interpolation 配合描述快速转场或保持时间。第一版可以默认 0。

input：
head_gaze 或 controller_ray。
```

## PlaybackClientState

含义：

```text
播放端体验状态。
用于调试、状态提示和 UI 恢复。
不参与正式裁剪。
```

示例字段：

```text
clientTimeMs
videoTimeMs
playbackRate
previousPlaybackRate
discardFastForwardRate
preview.brightness
preview.contrast
preview.overlayOpacity
recording.samplingPaused
recording.discardMode
```

明确规则：

```text
playbackRate 不改变 ViewPathPoint.tMs。
preview 不影响最终导出。
overlayOpacity 不参与后端裁剪。
recording.discardMode 只是当前 UI 状态；最终丢弃区间以 ViewPathPoint.enabled=false 为准。
recording.samplingPaused 表示前端暂停采样；它本身不是剪辑指令。
```

## EffectEventsPatch / EffectEvent

含义：

```text
独立于取景路径的效果事件时间线。
用于标记某个视频时间范围内需要的后处理、特效、人工复核或其他语义事件。
```

当前支持：

```text
highlight
black.solid
transition.fade_black
transition.flash_white
filter.color_grade
filter.blur
filter.vignette
filter.chromatic_aberration
overlay.letterbox
overlay.text
```

目标形态还应支持用户自定义名称：

```text
startMs
endMs
eventName 或 type
displayName
params
enabled
renderPolicy.fallback
```

示例：

```text
startMs = 12000
endMs = 18500
eventName = "highlight"
displayName = "人物高亮"
params.note = "强调舞台左侧人物"
```

自由事件名建议使用命名空间字符串：

```text
black.solid
transition.fade_black
transition.cross_dissolve
overlay.text
filter.blur
custom.customer_event
```

`eventName` / `type` 是稳定机器名，不要放中文展示文案；`displayName` 或 `params.label` 可以放中文。未知事件名不应破坏 timeline 解析，应按 `renderPolicy.fallback = ignore / warn / fail` 处理。

它和 ViewPathPoint 是两条时间线。正式导出可以同时读取二者，但不应把效果状态混进取景路径。第一版可以先保存自定义名称和时间范围，不要求渲染器立即实现对应视觉效果。

## MinuteSegment

含义：

```text
后端按分钟追踪渲染状态。
```

状态：

```text
collecting
ready
rendering
done
dirty
failed
discarded
```

当前已落库，但还没有完整生产级 ready 判断和队列。

## Export

含义：

```text
一次导出结果。
```

核心字段：

```text
exportId
sessionId
status
filePath
errorMessage
createdAt
updatedAt
downloadReady
```

下载规则：

```text
必须登录。
export 必须属于当前用户。
status 必须为 ready。
file_path 必须位于 storage/exports 内。
```
