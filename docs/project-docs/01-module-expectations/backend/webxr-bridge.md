# WebXR 桥接模块预期

## 职责

WebXR 桥接模块负责接收 WebXR 端传回来的时间点序列和事件序列。它是 WebXR 与后端业务之间的协议入口，不直接做重型裁切。

这里容易混淆的“注视点”建议不要作为正式协议名。第一版 WebXR 不读取真实眼动追踪，只读取头显朝向或 controller ray 推导出的取景目标。因此后端协议里的正式名称是：

```text
ViewPathPoint
单个取景路径点，也可以理解为一个视角关键帧。

ViewPathPatch
WebXR 按低频规则上传的一批取景路径点，带 replaceRange，用于覆盖某段旧路径。

PlaybackClientState
播放端状态。用于调试、恢复 UI 或状态提示，不是正式裁剪输入。
```

它负责：

```text
创建和读取 cut session。
维护 /xr/player active video/session 状态。
保存 ClipEditConfig。
接收 ViewPathPatch。
校验用户、videoId、sessionId。
按 replaceRange 维护 view_path_points。
接收 EffectEventsPatch。
保存用户标记的自定义特效事件。
接收 PlaybackClientState。
维护受影响 minute_segments 的 dirty 状态。
```

## `/xr/player` session 状态

后端应把 `/xr/player` 视为稳定产品入口的状态源，而不是要求前端路径携带 `videoId/sessionId`。

建议职责：

```text
GET /api/xr/player-session：
  返回当前用户的 active video/session、timeline revision、music/effect/export 摘要。
  active 缺失时恢复最近可用 session。
  首次使用且有可用 360 视频时自动创建 session。

PUT /api/xr/player-session { videoId }：
  用户在 /xr/player 切换视频时调用。
  目标视频已有 session 时恢复该视频自己的 session。
  没有 session 时创建新 session。
  更新 active state。
```

不要通过一个 session 的 `video_id` 来承载不同视频之间的切换。视频切换应切换 active session，而不是把 path/effect/BGM/export 状态从一个视频迁移到另一个视频。

## WebXR 回传数据分层

WebXR 回传给后端的数据分三类：

```text
ClipEditConfig：
全局导出配置，例如输出比例、分辨率、fps。创建或更新 cut session 时保存。

ViewPathPatch / ViewPathPoint：
用户真正的剪辑意图。描述源视频时间轴上“什么时候看哪里、是否保留、是否切开、FOV 怎么变”。
后端正式裁剪会读取。

PlaybackClientState：
播放体验状态，例如当前播放时间、倍速、预览亮度、采样暂停状态。
后端可以验收或用于恢复 UI，但默认不持久化，也不参与正式裁剪。
```

WebXR bridge 向后端保存的稳定业务输入边界是：

```text
ClipEditConfig + 展开后的 view_path_points + 可选 effect_events
```

`PlaybackClientState` 即使上传成功，也不能改变最终导出结果。比如用户用 5x 快进跳过素材，正式时间轴仍以 `ViewPathPoint.tMs` 为准。

理想状态下，WebXR bridge 只保存和校验这些输入，不直接决定最终渲染片段。后续应由 timeline assembler 把它们编译成 `ViewPathTimeline`：

```text
ViewPathPatch / EffectEventsPatch / SessionMusicConfig
        ->
timeline_assembler_service
        ->
ViewPathTimeline + TimelineBuildReport
```

Timeline 数据结构预期见：

```text
backend/timeline-data.md
```

## 取景路径点

WebXR 传回来的核心序列是：

```text
ViewPathPoint[]
```

每个点表达源视频时间轴上的一个取景状态：

```text
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

WebXR 桥接模块只负责把这些点变成可靠的后端时间线，不负责逐帧渲染。

### 命名约定

```text
不要把 ViewPathPoint 叫 eye gaze point。
第一版没有真实眼动数据，input=head_gaze 表示头显朝向推导出的视线方向。

不要把 ViewPathPoint 叫 playback point。
播放状态是 PlaybackClientState；取景路径点是后端导出的正式裁剪输入。

可以在中文产品沟通里叫“取景点”“视角点”或“取景路径点”。
技术协议统一叫 ViewPathPoint。
```

### ViewPathPoint 字段语义

```text
seq：
前端在当前 session 或当前 patch 内生成的单调序号。同一 tMs 出现多个点时，后端可用 seq 决定顺序。

tMs：
源视频时间轴毫秒数，来自 video.currentTime * 1000，而不是墙上时钟时间。
播放倍速不会改变 tMs。

center.yaw：
取景框中心的水平角度，单位 degree。建议标准化到 -180 到 180。

center.pitch：
取景框中心的垂直角度，单位 degree。建议限制在 -85 到 85，避免接近极点时投影不稳定。

fov.h / fov.v：
虚拟相机水平 / 垂直 FOV。FOV 变化表示推近或拉远，不改变最终输出宽高比。

roll：
镜头横滚角。第一版可固定为 0，保留给地平线校正或特殊镜头。

enabled：
状态字段。true 表示从该点之后进入保留区间；false 表示从该点之后进入放弃区间，直到下一次 enabled=true 或 replaceRange 结束。

cut：
切段边界。true 表示从该点开始新镜头，后端不得跨这个点做平滑插值。

locked：
取景框是否来自锁定状态。它帮助回放和调试理解用户意图，但后端仍以 center / fov 数值为准。

smoothFollow：
表示前端上传的是平滑后的取景框中心，而不是原始头显抖动。

interpolation：
后端在该点到下一点之间如何插值。第一版支持 linear / fast / hold。

transitionMs：
与 interpolation 配合，表达快速转场或保持时间。第一版可以默认 0。

input：
取景来源。第一版为 head_gaze 或 controller_ray。
```

### ViewPathPatch 上传形态

WebXR 不应该逐帧写库，而是按低频规则上传 patch：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "takeId": "take_003",
  "pathRevision": 12,
  "replaceRange": {
    "startMs": 12000,
    "endMs": 18000,
    "reason": "replay"
  },
  "points": [
    {
      "seq": 320,
      "tMs": 12000,
      "center": {
        "yaw": 21.4,
        "pitch": -2.0
      },
      "fov": {
        "h": 82,
        "v": 46.1
      },
      "roll": 0,
      "enabled": true,
      "cut": false,
      "locked": false,
      "smoothFollow": true,
      "interpolation": "linear",
      "transitionMs": 0,
      "input": "head_gaze"
    }
  ]
}
```

后端处理顺序：

```text
1. 验证 route sessionId 与 body sessionId 一致。
2. 验证 session 和 video 属于当前用户。
3. 验证 replaceRange.startMs < replaceRange.endMs。
4. 验证 points 全部落在 [replaceRange.startMs, replaceRange.endMs) 内。
5. 保存原始 ViewPathPatch 到 view_path_patches。
6. 删除或废弃 replaceRange 内的旧 view_path_points。
7. 展开写入当前 points。
8. 标记受影响 minute_segments dirty。
```

`replaceRange` 是覆盖语义的核心。用户重放 12s 到 18s 并重新剪辑时，WebXR 必须提交新的 `takeId` 和 `[12000, 18000)`，后端不能靠 `tMs` 完全相等来猜哪些旧点要被替换。

## 播放端状态

`PlaybackClientState` 描述播放端体验，不描述最终剪辑结果：

```json
{
  "sessionId": "session_456",
  "videoId": "video_123",
  "clientTimeMs": 1716370000000,
  "videoTimeMs": 12400,
  "playbackRate": 2.0,
  "previousPlaybackRate": 1.0,
  "discardFastForwardRate": 5,
  "preview": {
    "brightness": 1.0,
    "contrast": 1.0,
    "overlayOpacity": 0.55
  },
  "recording": {
    "samplingPaused": false,
    "discardMode": false
  }
}
```

边界规则：

```text
videoTimeMs 可用于恢复 UI，但正式导出以 ViewPathPoint.tMs 为准。
playbackRate 只影响用户看素材的速度，不改变后端裁剪时间轴。
preview.brightness / contrast / overlayOpacity 只影响 WebXR 预览，不影响 export。
recording.discardMode 只是当前 UI 状态；最终丢弃区间以 ViewPathPoint.enabled=false 为准。
samplingPaused 表示前端暂时不采样；它本身不是剪辑指令。
```

## 特效事件序列

WebXR 还可以传回用户标记的特效事件：

```text
EffectEvent[]
```

事件表达：

```text
startMs
endMs
eventName 或 type
displayName
params
enabled
renderPolicy.fallback
```

这些事件用于后处理、自动特效、人工复核或后续渲染扩展。第一版可以只保存自定义名称和时间范围，不强制立即实现真实视觉效果。

事件名应支持自由字符串，推荐使用命名空间：

```text
black.solid
transition.fade_black
transition.cross_dissolve
overlay.text
filter.blur
custom.customer_event
```

`eventName` / `type` 是机器可读的稳定名称；`displayName` 或 `params.label` 是用户可见名称。后端不认识某个事件名时，应根据 `renderPolicy.fallback` 决定忽略、告警或失败，而不是直接破坏整条取景时间线。

## 校验预期

```text
route sessionId 与 body sessionId 一致。
session 属于当前用户。
videoId 属于当前用户。
replaceRange.startMs < replaceRange.endMs。
points 必须落在 replaceRange 内。
events 必须落在 replaceRange 内。
pathRevision / effectRevision 冲突策略明确。
每分钟点数不超过策略上限。
```

## 输出

```text
view_path_patches 原始记录。
view_path_points 展开时间线。
effect_event_patches 原始记录。
effect_events 展开时间线。
minute_segments dirty 标记。
accepted 状态响应。
```

## 不应承担的职责

WebXR 桥接模块不应该：

```text
执行 remap。
编码 MP4。
管理上传文件。
提供下载文件流。
依赖 WebXR React 组件内部状态。
```
