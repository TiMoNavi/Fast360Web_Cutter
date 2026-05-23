# ViewPathTimeline 文件契约

## 定位

`ViewPathTimeline` 是后端把 WebXR 回传的 `ViewPathPatch / ViewPathPoint` 整理、覆盖、补边界、校验后生成的线性时间线文件。

它的目标不是替代 WebXR 实时上传协议，而是提供一个可以脱离 WebXR 页面和数据库单独复现的渲染输入：

```text
一个 360 源视频
+ 一个 ViewPathTimeline JSON 文件
= 可以独立跑后端裁切、效果、回归测试
```

## EffectSystem 元信息

`ViewPathTimeline` 现在可以带一个 `effectSystem` 字段，用于把后端当前的效果注册表一起写进 timeline 文件。这样单独拿一个 360 视频和一个 timeline JSON 做后端回归测试时，可以知道当时后端如何解释效果顺序和冲突规则。

结构示例：

```json
{
  "effectSystem": {
    "schema": "effect-registry.v1",
    "phases": {
      "generate": 0,
      "transition": 100,
      "filter": 200,
      "overlay": 300,
      "marker": 900
    },
    "conflictPolicy": "Within the same conflictGroup, the active event with the highest priority wins; ties prefer later seq/startMs.",
    "registeredEffects": []
  }
}
```

每个 `effectTracks[].events[]` 也会带 `resolvedEffect`：

```json
{
  "type": "black.solid",
  "resolvedEffect": {
    "supported": true,
    "canonicalName": "black.solid",
    "namespace": "black",
    "phase": "transition",
    "order": 120,
    "priority": 100,
    "stackMode": "exclusive",
    "conflictGroup": "frame.occlusion"
  }
}
```

`resolvedEffect` 是构建时快照，不替代原始 `type/params/renderPolicy`。后续 renderer 仍应以事件本身为准，再用当前 registry 执行；测试和排查时可以用 `resolvedEffect` 对比“当时预期”和“当前实现”是否发生漂移。

推荐文件名：

```text
view-path-timeline.v1.json
```

相关文件可以分开保存：

```text
view-path-patches.v1.jsonl
原始 patch 日志。用于调试网络、覆盖、重放和冲突。

view-path-timeline.v1.json
最终线性时间线。用于渲染和回归测试。

timeline-build-report.v1.json
assembler 生成的构建报告。用于发现缺点、补点、丢包和不可渲染区间。
```

## 核心原则

```text
ViewPathPatch 是增量输入。
ViewPathTimeline 是编译后的稳定输出。
渲染器优先读取 ViewPathTimeline，不重新解释 patch 历史。
源视频时间 sourceMs 和成片时间 outputMs 必须分开。
跳过、快进、慢放、快退、倒放都通过 editSegments 表达。
取景点默认绑定 sourceMs，因为 WebXR 采样来自 video.currentTime。
```

## 顶层结构

```json
{
  "schema": "view-path-timeline.v1",
  "timelineId": "timeline_session_456_rev_12",
  "createdAt": "2026-05-23T12:00:00Z",
  "source": {
    "videoId": "video_123",
    "filename": "source.mp4",
    "durationMs": 62000,
    "projection": "equirectangular"
  },
  "session": {
    "sessionId": "session_456",
    "source": "webxr",
    "timelineRevision": 12
  },
  "output": {
    "durationMs": 42000,
    "aspect": "16:9",
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "coordinateSystem": {
    "timeUnit": "ms",
    "angleUnit": "degree",
    "yawRange": "-180..180",
    "pitchRange": "-85..85"
  },
  "editSegments": [],
  "viewTracks": [],
  "effectTracks": [],
  "coverage": {
    "status": "ready",
    "sourceRanges": [],
    "outputRanges": [],
    "gaps": []
  },
  "build": {
    "assemblerVersion": "timeline-assembler.v1",
    "sourcePatchCount": 0,
    "pointCount": 0,
    "warnings": []
  }
}
```

## 时间轴映射

`editSegments` 是这个文件最重要的层。它描述最终成片的每一段来自源视频哪里，以及速度和方向如何变化。

```json
{
  "editId": "edit_001",
  "enabled": true,
  "kind": "source",
  "output": {
    "startMs": 0,
    "endMs": 10000
  },
  "source": {
    "startMs": 12000,
    "endMs": 22000
  },
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

字段语义：

```text
output.startMs / output.endMs：
最终成片时间轴上的半开区间 [startMs, endMs)。

source.startMs / source.endMs：
源 360 视频时间轴上的区间。forward 时 startMs < endMs；reverse 时可以 startMs > endMs。

direction：
forward 或 reverse。reverse 表示输出时间向前走，但源视频时间向后采样。

speed：
abs(source.endMs - source.startMs) / (output.endMs - output.startMs)。
1.0 表示正常速度，2.0 表示 2x 快进，0.5 表示慢放，reverse + 2.0 表示 2x 倒放。

viewTrackId：
这一段使用哪条取景路径。

effectTrackIds：
这一段叠加哪些效果轨。
```

跳过某段源视频时，不需要为那段创建 `editSegment`。如果需要在成片里插入黑场、静帧或标题卡，可使用非 source 类型：

```json
{
  "editId": "edit_black_001",
  "enabled": true,
  "kind": "generated",
  "output": { "startMs": 10000, "endMs": 11000 },
  "generator": {
    "type": "solid",
    "params": { "color": "#000000" }
  },
  "transition": {
    "in": { "type": "fade", "durationMs": 250 },
    "out": { "type": "cut", "durationMs": 0 }
  }
}
```

## 取景轨

`viewTracks` 保存取景点。第一版通常只有一条 `view_main`。

取景点默认使用 `timeRef = "source"`，也就是点的 `tMs` 对应源视频时间。这样 WebXR 端可以继续直接使用 `video.currentTime * 1000` 采样，后端通过 `editSegments` 把它映射到输出时间。

```json
{
  "trackId": "view_main",
  "timeRef": "source",
  "points": [
    {
      "pointId": "pt_take_003_320",
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

`quality.source` 用于记录点是怎么来的：

```text
observed：
WebXR 端真实上传。

interpolated：
assembler 因小缺口自动补点。

held：
小缺口内沿用上一个稳定点。

syntheticBoundary：
assembler 为 editSegment 起止边界补的点。

invalidDropped：
原始点非法，被丢弃，只应出现在 build report，不应进入最终 points。
```

## 剪辑效果轨

`effectTracks` 为未来效果预留。效果既可以绑定源时间，也可以绑定输出时间：

效果事件的完整接入手册见：

```text
03-shared-contracts/effect-events.md
```

```json
{
  "trackId": "effects_main",
  "events": [
    {
      "eventId": "fx_001",
      "type": "highlight",
      "displayName": "人物高亮",
      "timeRef": "source",
      "startMs": 12000,
      "endMs": 18500,
      "enabled": true,
      "params": {
        "strength": 0.6
      },
      "renderPolicy": {
        "fallback": "ignore",
        "requires": []
      }
    }
  ]
}
```

效果字段约定：

```text
type：
机器可读的事件名。允许固定内置名，也允许自由字符串。未知 type 不应让 timeline 文件失效。

displayName：
给用户看的名称，可自由填写。后端不应依赖它做渲染分发。

timeRef：
source 表示随源视频片段走；output 表示固定在成片时间上，例如片头字幕。

params：
效果私有参数。后端可以只保存和透传，未实现的效果按 renderPolicy.fallback 处理。

renderPolicy.fallback：
ignore、warn、fail。第一版默认 ignore 或 warn。
```

### 自由事件名规范

后端后续添加黑场、转场、字幕、滤镜、AI 标记等效果时，不需要每次都重写整个 timeline 文件结构。事件名采用字符串，并建议使用命名空间：

```text
black.solid
transition.fade_black
transition.cross_dissolve
transition.wipe
overlay.text
overlay.image
filter.blur
filter.vignette
marker.review
custom.customer_event
```

命名规则：

```text
type 使用 lower_snake_case 或 dot.namespace。
type 是稳定机器名，不要放中文展示文案。
displayName / params.label 可以放中文。
params 保存效果私有参数。
renderPolicy.fallback 决定当前后端不认识该 type 时如何处理。
```

黑场示例：

```json
{
  "eventId": "fx_black_001",
  "type": "black.solid",
  "displayName": "黑场",
  "timeRef": "output",
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
  }
}
```

转场示例：

```json
{
  "eventId": "fx_transition_001",
  "type": "transition.fade_black",
  "displayName": "淡入黑场",
  "timeRef": "output",
  "startMs": 9800,
  "endMs": 10300,
  "enabled": true,
  "params": {
    "direction": "out",
    "easing": "ease_in_out"
  },
  "renderPolicy": {
    "fallback": "warn",
    "requires": []
  }
}
```

如果效果改变片段的时间长度，例如速度 ramp、冻结帧、倒放，不应只写成 `effectTracks` 里的视觉事件，而应优先编译进 `editSegments`，因为它会改变 `sourceMs -> outputMs` 映射。

## 表达跳过、快进、快退

### 跳过源视频 10s 到 20s

只创建 0-10s 和 20s 之后的 segment，中间源区间不进入输出：

```json
[
  {
    "editId": "edit_001",
    "kind": "source",
    "output": { "startMs": 0, "endMs": 10000 },
    "source": { "startMs": 0, "endMs": 10000 },
    "direction": "forward",
    "speed": 1.0,
    "viewTrackId": "view_main"
  },
  {
    "editId": "edit_002",
    "kind": "source",
    "output": { "startMs": 10000, "endMs": 20000 },
    "source": { "startMs": 20000, "endMs": 30000 },
    "direction": "forward",
    "speed": 1.0,
    "viewTrackId": "view_main"
  }
]
```

### 源视频 60s 到 90s 用 3x 快进

```json
{
  "editId": "edit_fast_001",
  "kind": "source",
  "output": { "startMs": 30000, "endMs": 40000 },
  "source": { "startMs": 60000, "endMs": 90000 },
  "direction": "forward",
  "speed": 3.0,
  "viewTrackId": "view_main"
}
```

### 源视频 90s 倒放回 60s

```json
{
  "editId": "edit_reverse_001",
  "kind": "source",
  "output": { "startMs": 40000, "endMs": 70000 },
  "source": { "startMs": 90000, "endMs": 60000 },
  "direction": "reverse",
  "speed": 1.0,
  "viewTrackId": "view_main"
}
```

## 后端 Timeline Assembler

后端应新增一个独立组件，专门把散点、patch 和编辑意图编译成 `ViewPathTimeline`。

推荐模块名：

```text
timeline_assembler_service.py
```

推荐输入：

```text
ClipEditConfig
ViewPathPatch[]
EffectEventsPatch[]
TimeEditIntent[] 或已有 enabled/cut 状态
源视频 metadata
上一版 ViewPathTimeline，可选
```

推荐输出：

```text
ViewPathTimeline
TimelineBuildReport
受影响 minute_segments
```

Assembler 职责：

```text
读取原始 patch 日志。
按 takeId、pathRevision、replaceRange 应用覆盖。
清洗非法点，标准化 yaw / pitch / fov。
按 tMs 和 seq 排序。
去重同一时间点。
根据 enabled=false 生成跳过源区间。
根据后续速度/倒放意图生成 editSegments。
为 editSegment 起止补 syntheticBoundary 点。
检测缺口、低密度区间和断裂。
对小缺口做插值或 hold 修复。
对大缺口标记 not_ready，不让生产渲染静默通过。
生成 timeline-build-report。
```

Assembler 不负责：

```text
解码视频。
执行 remap。
编码 MP4。
解释 WebXR React 组件状态。
修改原始 patch 日志。
```

## 网络波动与散点丢失策略

WebXR 上传不能假设网络稳定。后端应把 patch 当成可能延迟、重复、乱序或缺失的输入。

### 上传侧建议

```text
每个 patch 带 takeId、pathRevision、replaceRange。
每 2 秒上传一次时，建议带 300-500ms 重叠窗口。
关键事件 cut / discard / restore / fov / lock 立即上传。
patch 上传失败时本地重试，同一个 patch 保持同一个 patchId。
前端保留最近若干秒未确认点，收到后端 ack 后再清理。
```

当前协议还没有正式 `patchId` 字段，后续可以扩展：

```json
{
  "patchId": "patch_client_00042",
  "clientSeq": 42,
  "basePathRevision": 11,
  "pathRevision": 12
}
```

### 后端接收侧

```text
重复 patch：
按 patchId 幂等处理；短期没有 patchId 时，可用 sessionId + takeId + pathRevision + replaceRange 近似去重。

乱序 patch：
先保存原始 patch，再由 assembler 按 pathRevision 和 createdAt 生成 timeline。

部分 patch 丢失：
通过 coverage 和 gap 检测发现，不直接假装完整。

局部点缺失：
小缺口可修复，大缺口必须进入 build report。
```

### 缺口修复默认阈值

```text
targetSampleIntervalMs = 200
softGapMs = 500
hardGapMs = 1500
```

处理规则：

```text
gap <= softGapMs：
允许线性插值，并把补点 quality.source 标记为 interpolated。

softGapMs < gap <= hardGapMs：
允许 hold 或降级插值，并在 build report 中 warning。

gap > hardGapMs：
标记 coverage.status = partial 或 not_ready。
生产渲染不能自动通过；开发 smoke render 可以显式允许。
```

边界事件不能靠插值伪造：

```text
enabled 状态变化。
cut=true。
方向切换。
speed 变化。
大幅 FOV 跳变。
```

这些事件丢失时，assembler 只能报告缺口或不确定区间，不能擅自创造用户意图。

## TimelineBuildReport

构建报告用于解释 timeline 是否可信。

```json
{
  "schema": "timeline-build-report.v1",
  "timelineId": "timeline_session_456_rev_12",
  "status": "partial",
  "sourcePatchCount": 18,
  "acceptedPointCount": 240,
  "droppedPointCount": 3,
  "syntheticPointCount": 8,
  "gaps": [
    {
      "range": { "timeRef": "source", "startMs": 32400, "endMs": 34200 },
      "durationMs": 1800,
      "severity": "error",
      "reason": "missing_points"
    }
  ],
  "repairs": [
    {
      "range": { "timeRef": "source", "startMs": 12000, "endMs": 12400 },
      "method": "linear_interpolation"
    }
  ],
  "warnings": [
    "render-test may proceed with allowPartialTimeline=true; production render must wait for ready timeline."
  ]
}
```

状态：

```text
ready：
覆盖完整，可以进入生产渲染。

partial：
存在可解释缺口。开发测试可显式允许，生产渲染默认不允许。

not_ready：
缺少关键边界或大范围点，不能渲染。

invalid：
文件结构或核心字段不合法。
```

## 后端分批裁剪关系

生产裁剪仍按固定窗口进行，例如 60 秒分片。但分片应基于 `outputMs`，不是简单使用源视频分钟。

```text
output minute 0 = output 0s 到 60s
output minute 1 = output 60s 到 120s
```

每个 output 分片通过 `editSegments` 找到对应源视频区间，再读取对应 `viewTracks` 和 `effectTracks`。

如果一个 output 分片跨多个 source segment，渲染器应拆成更小的 render slice：

```text
RenderSlice:
outputStartMs
outputEndMs
sourceStartMs
sourceEndMs
direction
speed
viewPoints
effectEvents
```

这样跳过、快进、倒放和重复播放都可以在同一个分片系统里处理。

## 校验规则

```text
schema 必须等于 view-path-timeline.v1。
output segment 必须按 output.startMs 单调递增。
source segment 可以前进或倒退，但 direction 必须匹配。
speed 必须等于 source duration / output duration，允许小误差。
viewTrack.points 按 tMs 排序。
同一 viewTrack 内 pointId 唯一。
enabled=false 的源区间默认不生成 source editSegment。
cut=true 应导致渲染 slice 边界或禁用跨点平滑。
unknown effect type 不能破坏 timeline 解析。
coverage.status 非 ready 时，生产渲染默认拒绝。
```
