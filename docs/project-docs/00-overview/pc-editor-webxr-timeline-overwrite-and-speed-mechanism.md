# PC Editor WebXR Timeline 覆写与三速度机制

这份文档定义“重复播放、暂停、播放倍速、录制倍速、视效倍速”进入 timeline 时的处理规则。它接续：

```text
docs/project-docs/00-overview/pc-editor-webxr-speed-clock-mechanism.md
docs/project-docs/03-shared-contracts/view-path-timeline-file.md
```

核心目标：

```text
用户可以随时 seek 回前面重录。
重复播放默认覆写旧 timeline。
暂停不推进 timeline 流。
录制倍速会改变最终 output timeline 长度。
视效倍速像一条小的 effect timeline，改变特效内部动作节奏。
后端收到的数据不能互相打架。
```

## 1. 两层 timeline

系统必须分清两层：

```text
输入层 input patch log：
  前端发送的 ViewPathPatch、EffectEventsPatch、SpeedSegmentPatch、EffectSpeedPatch。
  以 source time 为主。
  支持 replaceRange 覆写。
  用于表达用户这次操作想替换哪一段旧编辑。

编译层 ViewPathTimeline：
  后端 assembler 生成的稳定渲染输入。
  包含 editSegments、viewTracks、effectTracks、audioTracks。
  明确区分 sourceMs 和 outputMs。
  ffmpeg / renderer 只读取编译层，不重新解释前端操作历史。
```

这意味着：

```text
前端不直接维护最终 outputMs。
前端负责说清楚 source range 内发生了什么。
后端负责把 source range、recordingSpeed、effectSpeed 编译成最终 output timeline。
```

## 2. 重复播放默认覆写

当用户播放到后面，又 seek 回前面重新播放时，理论行为应是直接覆写旧 timeline。

规则：

```text
seek 回前面：
  开启新的 takeId。
  下一段播放形成新的 activeReplaceRange。

重新播放 12s -> 18s：
  replaceRange = [12000, 18000)
  reason = replay
  takeId = 新值

后端收到 patch：
  删除该 replaceRange 内旧的同类 timeline 数据。
  插入新 patch 数据。
  标记受影响范围 dirty。
```

覆写必须按轨道分层，不要让一种 patch 误删另一种语义：

| 轨道 | Patch | 覆写范围 | 覆写内容 |
| --- | --- | --- | --- |
| 取景轨 | `ViewPathPatch` | source replaceRange | 旧 ViewPathPoint |
| 特效轨 | `EffectEventsPatch` | source 或 output replaceRange | 旧 EffectEvent |
| 录制倍速轨 | `SpeedSegmentPatch` | source replaceRange | 旧 recordingSpeed segment |
| 视效倍速轨 | `EffectSpeedPatch` 或 effect event params | source/output replaceRange | 旧 effectSpeed lane 或事件内倍率 |

不要用一个粗暴的“全 timeline 清空”实现重录。正确做法是：同一个 `takeId` / `replaceRange` 下，每条轨道提交自己的 patch；后端按轨道覆写，然后 assembler 统一编译。

## 3. 暂停与 timeline

暂停是运行门闸，不是时间倍率。

```text
paused = true：
  video currentTime 不推进。
  path sampler 不追加连续点。
  自动 effect stream 不推进。
  自动 speed segment 不延长。
  不伪造 +1ms。
```

暂停时可以修改状态，但状态本身不自动产生 timeline 时长：

```text
暂停中打开录制倍速 0.5：
  只改变当前 recordingSpeed state。
  不立刻生成 0 长度 speed segment。
  恢复播放后，新的 source range 才用 recordingSpeed = 0.5 生成 SpeedSegmentPatch。

暂停中打开视效倍速 0.5：
  只改变当前 effectSpeed state。
  不让已有特效继续跑。
  恢复播放或触发新特效时，才把 effectSpeed 写入对应事件或 effect speed lane。

暂停中触发明确特效：
  可以生成 EffectEventsPatch。
  duration 来自预设、effectSpeed、用户参数或 hold gesture。
  不来自“暂停了多久”。
```

如果用户暂停中切视角并希望导出呈现这个切换，应由 workflow 生成明确 patch：

```text
ViewPathRange：
  startState = 暂停前或 hold start 的视角
  endState = 用户暂停中调整后的视角
  interpolation = fast / hold

EffectEventsPatch：
  黑场或遮挡效果覆盖同一段输出语义。
```

## 4. 播放倍速与子弹时间

播放倍速只影响用户观看和前端预览。

```text
playbackSpeed = 0.1：
  子弹时间。
  视频和前端特效动作变慢。
  方便用户反应、瞄准、选特效。
```

发送给后端时：

```text
不要发送为 SpeedSegmentPatch。
不要改变 ViewPathPatch 的 tMs。
不要把 effect duration 乘 10 后写死。
```

播放倍速下产生的取景点仍然使用源视频时间：

```text
ViewPathPoint.tMs = video.currentTime * 1000
```

因为播放变慢，用户在同一段 source range 内会有更多 wall-clock 时间反应，但后端只看到更准确的新取景点，而不是成片慢动作。

## 5. 录制倍速与 output timeline

录制倍速表达“这一段原片在成片里要变速”。

推荐新增输入 patch：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "takeId": "take_007",
  "speedRevision": 12,
  "replaceRange": {
    "startMs": 12000,
    "endMs": 18000,
    "reason": "replay"
  },
  "segments": [
    {
      "segmentId": "speed_take_007_001",
      "source": { "startMs": 12000, "endMs": 18000 },
      "recordingSpeed": 0.5,
      "direction": "forward",
      "enabled": true
    }
  ]
}
```

后端编译成 `editSegments`：

```text
sourceDuration = abs(source.endMs - source.startMs)
outputDuration = sourceDuration / recordingSpeed
```

例子：

```text
source [12000, 18000), recordingSpeed = 0.5
sourceDuration = 6000ms
outputDuration = 12000ms

source [12000, 18000), recordingSpeed = 2.0
sourceDuration = 6000ms
outputDuration = 3000ms
```

这会导致后面的 output timeline 整体移动：

```text
某段慢放变长：
  该段之后所有 outputMs 后移。

某段快放变短：
  该段之后所有 outputMs 前移。
```

因此后端不能只把 source minute 标记 dirty。录制倍速变化后，必须：

```text
1. 重新 assemble ViewPathTimeline。
2. 重新计算 editSegments。
3. 找到最早受影响的 outputMs。
4. 取消或废弃该 outputMs 之后的旧 segment render。
5. 用新的 timelineRevision 重新渲染。
```

当前 `ViewPathTimeline.editSegments.speed` 已有字段，正适合承载这个结果；当前缺口是输入层还没有正式的 `SpeedSegmentPatch`，assembler 当前也还主要输出 `speed = 1.0`。

## 6. 视效倍速与“小特效 timeline”

视效倍速不改变原片速度，它改变特效自己的动作时间。

最稳定的理解方式：每个特效都有自己的局部 timeline。

```text
EffectEvent：
  外层决定这个效果挂在哪段 source/output 时间上。

EffectLocalTimeline：
  内层决定这个效果从 0ms 到 baseDurationMs 怎么变化。
  fade alpha、blur strength、shake envelope、little-planet pullback 都属于这里。

effectSpeed：
  决定局部 timeline 走多快。
```

推荐事件结构：

```json
{
  "seq": 42,
  "eventName": "transition.fade_black",
  "displayName": "黑场",
  "timeRef": "source",
  "startMs": 12000,
  "endMs": 13600,
  "params": {
    "baseDurationMs": 800,
    "effectSpeed": 0.5,
    "localTimeline": {
      "durationMs": 800,
      "curves": {
        "opacity": [
          { "tMs": 0, "value": 0 },
          { "tMs": 400, "value": 1 },
          { "tMs": 800, "value": 0 }
        ]
      }
    }
  },
  "renderPolicy": {
    "fallback": "warn"
  }
}
```

采样规则：

```text
effectElapsedMs = renderDomainMs - event.startMs
localTimeMs = effectElapsedMs * effectSpeed

effectSpeed = 0.5：
  local timeline 走得慢。
  baseDurationMs 800ms 的动作需要约 1600ms 跑完。

effectSpeed = 2.0：
  local timeline 走得快。
  baseDurationMs 800ms 的动作约 400ms 跑完。
```

推荐第一阶段把 `effectSpeed` 固化在每个 EffectEvent 的 params 里：

```text
用户触发特效时：
  读取当前 effectSpeed。
  把 effectSpeed 写入该 EffectEvent.params。

用户后面改变全局 effectSpeed：
  不反向修改旧事件。
  只影响之后触发的新特效。
```

如果后续需要真正的全局视效速度轨，再引入 `EffectSpeedPatch`：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "takeId": "take_007",
  "effectSpeedRevision": 4,
  "replaceRange": {
    "startMs": 12000,
    "endMs": 18000,
    "reason": "replay"
  },
  "segments": [
    {
      "source": { "startMs": 12000, "endMs": 18000 },
      "effectSpeed": 0.5,
      "scope": "global",
      "enabled": true
    }
  ]
}
```

但这个全局轨会影响旧效果如何重算，工程风险更高。短期优先“事件内快照”，长期再做“视效速度轨”。

## 7. 发送给后端的推荐事务

重复播放时，前端最好把同一段重录产生的多条 patch 作为一个事务发送，避免后端短时间看到半更新状态。

推荐新增统一 envelope：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "patchSetId": "patchset_take_007_12000_18000",
  "takeId": "take_007",
  "baseTimelineRevision": 12,
  "replaceRange": {
    "timeRef": "source",
    "startMs": 12000,
    "endMs": 18000,
    "reason": "replay"
  },
  "patches": {
    "viewPath": {},
    "effectEvents": {},
    "speedSegments": {},
    "effectSpeed": {}
  }
}
```

后端处理：

```text
1. 校验 baseTimelineRevision。
2. 在一个数据库事务中按轨道覆写。
3. 插入所有新数据。
4. timelineRevision + 1。
5. 标记 dirty sourceRanges。
6. 重新 assemble timeline。
7. 标记 dirty outputRanges。
8. 返回新的 timelineRevision、sourceDirtyRanges、outputDirtyRanges。
```

短期如果继续分接口发送，也必须满足：

```text
同一次重录使用同一个 takeId。
各 patch 使用同一个 replaceRange。
每个 patch 带自己的 revision。
后端每次 patch 都把相关 render 标记 dirty。
最终导出前必须重新 assemble 一次完整 ViewPathTimeline。
```

## 8. 典型场景

### 8.1 播到后面，seek 回前面重录

```text
原 timeline：
  source 0s -> 30s 已录过。

用户 seek 到 12s，重新播放到 18s：
  新 takeId = take_008。
  ViewPathPatch.replaceRange = [12000, 18000)。
  EffectEventsPatch.replaceRange = [12000, 18000)。
  SpeedSegmentPatch.replaceRange = [12000, 18000)。

后端：
  删除 12s..18s 的旧取景点、旧特效、旧 speed segment。
  插入新数据。
  重新编译 timeline。
```

### 8.2 暂停开着，录制倍速开着

```text
用户暂停在 12s。
设置 recordingSpeed = 0.5。

前端：
  只更新 recordingSpeed state。
  不发送 0 长度 SpeedSegmentPatch。

用户恢复播放到 18s：
  发送 SpeedSegmentPatch [12000, 18000), recordingSpeed = 0.5。
  发送 ViewPathPatch [12000, 18000)。

后端：
  editSegment source 6s 编译成 output 12s。
```

### 8.3 暂停开着，视效倍速开着

```text
用户暂停在 12s。
设置 effectSpeed = 0.5。

前端：
  只更新 effectSpeed state。
  已经在前端显示中的特效动作冻结。

用户触发黑场：
  新 EffectEvent.params.effectSpeed = 0.5。
  baseDurationMs = 800。
  实际事件 duration 可以按 1600ms 写入，或由后端根据 baseDurationMs / effectSpeed 解析。
```

建议短期采用显式写入事件 duration：

```text
event.startMs = 12000
event.endMs = 13600
params.baseDurationMs = 800
params.effectSpeed = 0.5
```

这样后端无需猜测事件应持续多久，仍能知道内部局部 timeline 如何采样。

### 8.4 播放倍速 0.1 子弹时间下重录

```text
playbackSpeed = 0.1
recordingSpeed = 1.0
effectSpeed = 1.0

用户从 source 12s 慢慢播放到 18s。

发送：
  ViewPathPatch [12000, 18000)
  EffectEventsPatch [12000, 18000) 如果期间触发了特效
  不发送 SpeedSegmentPatch，除非用户显式设置 recordingSpeed。

后端：
  成片仍然是 6s 原速。
  只是这 6s 的取景和特效来自新的 take。
```

### 8.5 重录时录制倍速改变导致后段 outputMs 移动

```text
原来：
  source 0s..30s -> output 0s..30s

重录：
  source 12s..18s recordingSpeed = 0.5

编译后：
  source 0s..12s -> output 0s..12s
  source 12s..18s -> output 12s..24s
  source 18s..30s -> output 24s..36s
```

后端必须认识到：

```text
source 18s 之后的内容本身没有重录。
但它在 output timeline 上整体后移。
旧的 output 18s..30s render 已经不能复用。
应该从 output 12s 或更保守从受影响 editSegment 起点开始重新渲染。
```

## 9. 后端 ffmpeg 对齐

最终 renderer 应按 `ViewPathTimeline.editSegments` 生成输出帧，而不是按源时间分钟硬切。

每个输出帧：

```text
outputMs -> 找到 editSegment
editSegment.kind = source：
  sourceMs = source.startMs + (outputMs - output.startMs) * speed * direction
  view = sample viewTrack at sourceMs
  effects = resolve effectTracks at sourceMs 或 outputMs
  取 source video 的 sourceMs 帧
  做 360 remap 和 frame effects

editSegment.kind = generated：
  由 generator 生成帧。
```

ffmpeg 层可以有两种实现：

```text
简单但慢：
  后端逐帧按 outputMs 采样 sourceMs，直接写出目标 fps。

分段优化：
  先按 editSegment 切源视频并用 setpts / fps 做变速。
  再按输出帧时间应用 view path 和 effects。
```

无论实现方式如何，权威映射都应该来自 `editSegments`：

```text
recordingSpeed 只改变 editSegments source/output 映射。
effectSpeed 只改变 effect local timeline。
playbackSpeed 不进入 renderer。
pause 不进入 renderer。
```

## 10. 当前工程缺口

当前已有：

```text
ViewPathPatch.replaceRange 覆写取景点。
EffectEventsPatch.replaceRange 覆写特效事件。
ViewPathTimeline.editSegments.speed 字段。
sourceMs / outputMs 分离的文档原则。
```

仍需补齐：

```text
SpeedSegmentPatch 输入协议。
EffectEvent.params.effectSpeed / baseDurationMs 规范。
可选的 EffectSpeedPatch 全局视效速度轨。
统一 TimelinePatchSet 事务 envelope。
assembler 根据 speed segment 生成非 1.0 editSegments。
dirty outputRanges 计算。
segment renderer 从 source-minute 模型升级为 output editSegment 模型。
timelineRevision 与每次 patch set 严格绑定。
```

