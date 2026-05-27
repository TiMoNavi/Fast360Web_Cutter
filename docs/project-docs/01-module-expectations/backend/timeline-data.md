# Timeline 数据结构预期

## 定位

Timeline 是后端裁切链路的稳定渲染输入。它不是 WebXR 实时上传协议，也不是前端组件状态快照。

理想链路应保持三层数据清楚分开：

```text
WebXR 上传层：
ClipEditConfig、ViewPathPatch、EffectEventsPatch、SessionMusicConfig、PlaybackClientState。

后端存储层：
原始 patch 日志、展开后的当前取景点 / 效果事件、session / export / segment 状态。

编译后时间线层：
ViewPathTimeline + TimelineBuildReport。
```

正式渲染只读取编译后的 `ViewPathTimeline`，不重新解释前端 UI 状态，也不直接依赖 patch 上传顺序。

## 理想数据流

```text
ClipEditConfig
        +
ViewPathPatch[] / ViewPathPoint[]
        +
EffectEventsPatch[] / EffectEvent[]
        +
SessionMusicConfig
        |
        v
timeline_assembler_service
        |
        v
ViewPathTimeline
        +
TimelineBuildReport
        |
        v
render planner -> RenderSlice[] -> video_cutting_service
```

`PlaybackClientState` 可以用于调试、状态提示或恢复 UI，但不应改变 `ViewPathTimeline`，也不应改变最终导出 MP4。

## ViewPathTimeline 顶层结构

`ViewPathTimeline` 是 versioned JSON 文件，推荐 schema 为 `view-path-timeline.v1`。

```json
{
  "schema": "view-path-timeline.v1",
  "timelineId": "timeline_session_456_rev_12",
  "createdAt": "2026-05-25T12:00:00Z",
  "source": {},
  "session": {},
  "output": {},
  "coordinateSystem": {},
  "effectSystem": {},
  "editSegments": [],
  "viewTracks": [],
  "effectTracks": [],
  "audioTracks": [],
  "coverage": {},
  "build": {}
}
```

字段职责：

```text
schema：
文件协议版本。

timelineId：
session + timelineRevision 形成的时间线快照 ID。

source：
源 360 视频身份、文件名、时长和投影类型。

session：
生成来源、sessionId 和 timelineRevision。

output：
最终成片规格和输出时长。

coordinateSystem：
时间单位、角度单位、yaw / pitch 范围。

effectSystem：
后端当前效果注册表快照，用于回归测试和排查效果解释是否漂移。

editSegments：
最终成片时间 outputMs 到源视频时间 sourceMs 的映射。

viewTracks：
取景路径轨道。第一版通常只有 view_main。

effectTracks：
视觉效果事件轨道。第一版通常只有 effects_main。

audioTracks：
成片层音频轨道，默认使用 output 时间轴。

coverage：
覆盖范围、缺口和 ready / partial / not_ready 状态。

build：
assembler 版本、点数、patch 数和 warning。
```

## editSegments

`editSegments` 是 timeline 最核心的层。它描述最终成片的每一段来自源视频哪里。

```json
{
  "editId": "edit_001",
  "enabled": true,
  "kind": "source",
  "output": { "startMs": 0, "endMs": 10000 },
  "source": { "startMs": 12000, "endMs": 22000 },
  "direction": "forward",
  "speed": 1.0,
  "viewTrackId": "view_main",
  "effectTrackIds": ["effects_main"],
  "transition": {
    "in": { "type": "cut", "durationMs": 0 },
    "out": { "type": "cut", "durationMs": 0 }
  }
}
```

规则：

```text
跳过源视频：
不为被跳过源区间创建 source editSegment。

快进 / 慢放：
通过 source duration / output duration 得到 speed。

倒放：
direction = reverse，source.startMs 可以大于 source.endMs。

黑场 / 标题卡：
使用 kind = generated，而不是伪造源视频点。

cut=true：
应成为 render slice 边界，不能跨 cut 做平滑插值。
```

生产分片应基于 `output.startMs / output.endMs`，再通过 edit segment 映射到源视频时间。

## viewTracks

`viewTracks[].points[]` 保存正式取景轨。WebXR 采样来自 `video.currentTime * 1000`，所以第一版 `timeRef` 默认为 `source`。

```json
{
  "trackId": "view_main",
  "timeRef": "source",
  "points": [
    {
      "pointId": "pt_12000_320",
      "seq": 320,
      "tMs": 12000,
      "center": { "yaw": 21.4, "pitch": -2.0 },
      "fov": { "h": 82, "v": 46.1 },
      "roll": 0,
      "enabled": true,
      "cut": false,
      "locked": false,
      "smoothFollow": true,
      "interpolation": "linear",
      "transitionMs": 0,
      "input": "head_gaze",
      "quality": {
        "source": "observed",
        "confidence": 1.0
      }
    }
  ]
}
```

`ViewPathPoint` 语义：

```text
tMs：
源视频时间轴毫秒数，不受播放倍速影响。

center.yaw / center.pitch：
输出画面取景中心，单位 degree。

fov.h / fov.v：
虚拟相机 FOV，表达推近 / 拉远。

enabled：
false 表示从该点之后进入放弃区间，直到下一次 enabled=true。

cut：
新镜头边界。

locked：
来自前端锁定状态，用于调试和回放意图。

smoothFollow：
前端上传的是平滑后的取景中心。

interpolation / transitionMs：
该点到下一点的插值策略。第一版支持 linear / fast / hold。

input：
head_gaze 或 controller_ray，不表示真实眼动追踪。
```

`quality.source` 应区分：

```text
observed
WebXR 实际上传。

interpolated
assembler 为小缺口线性补点。

held
小缺口内沿用上一个稳定点。

syntheticBoundary
assembler 为 editSegment 起止边界补点。
```

## effectTracks

效果事件独立于取景路径，不能混进 `ViewPathPoint`。

```json
{
  "trackId": "effects_main",
  "events": [
    {
      "eventId": "fx_10000_11200_black.solid",
      "type": "black.solid",
      "displayName": "黑场",
      "timeRef": "source",
      "startMs": 10000,
      "endMs": 11200,
      "enabled": true,
      "params": {
        "color": "#000000",
        "opacity": 1.0
      },
      "renderPolicy": {
        "fallback": "warn",
        "requires": []
      },
      "resolvedEffect": {
        "supported": true,
        "canonicalName": "black.solid"
      }
    }
  ]
}
```

规则：

```text
type / eventName 是机器可读稳定名称。
displayName / params.label 才是用户展示文案。
未知 type 不应破坏 timeline 解析，应按 renderPolicy.fallback 处理。
改变画面的事件放在 effectTracks。
改变时间映射的事件应编译进 editSegments。
```

## audioTracks

音频轨属于输出时间轴，默认不跟随源视频跳剪。

```json
{
  "trackId": "music_main",
  "kind": "music",
  "musicId": "music_123",
  "timeRef": "output",
  "startMs": 0,
  "playback": {
    "mode": "one_shot",
    "align": "output_start",
    "loop": false
  },
  "mix": {
    "gainDb": -10.0,
    "ducking": null
  },
  "enabled": true
}
```

第一版只要求一条音乐轨，从 output 0ms 开始。

## coverage 与 build report

`coverage.status` 表示 timeline 是否可以进入正式渲染：

```text
ready：
覆盖完整，可以进入生产渲染。

partial：
存在可解释缺口。开发 smoke render 可以显式允许，生产渲染默认拒绝。

not_ready：
缺少关键边界或有效片段，不能渲染。

invalid：
结构或核心字段不合法。
```

`TimelineBuildReport` 应单独保存或至少嵌入 `build` 中，记录：

```text
sourcePatchCount
acceptedPointCount
droppedPointCount
syntheticPointCount
gaps
repairs
warnings
```

## 持久化预期

理想数据库里应区分：

```text
view_path_patches / effect_event_patches：
原始输入日志。用于审计、重放、调试和重新编译。

view_path_points / effect_events：
当前展开状态，可作为查询缓存，但不应替代原始 patch 日志。

view_path_timelines：
按 sessionId + timelineRevision 保存编译后的 ViewPathTimeline snapshot。

timeline_build_reports：
保存 assembler 的校验、缺口和修复说明。
```

`timelineRevision` 应代表一次可渲染 timeline snapshot，而不是单个网络 patch 的序号。`pathRevision` / `effectRevision` 用于 patch 冲突和排序，不能替代 `timelineRevision`。

## 不进入正式 timeline 的内容

以下数据不应改变最终导出：

```text
PlaybackClientState.playbackRate
PlaybackClientState.preview.*
WebXR overlay opacity
本地 UI 打开 / 关闭状态
调试 HUD 状态
临时 controller hover / focus 状态
```

如果某个 UI 状态未来需要影响成片，必须升级成明确协议字段：取景轨、效果轨、音频轨或 edit segment。
