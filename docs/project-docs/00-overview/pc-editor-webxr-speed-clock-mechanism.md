# PC Editor WebXR 三速度与暂停机制

这份文档单独定义 PC Editor WebXR 中“播放倍速、录制倍速、视效倍速、暂停”的底层语义。它服务于特效系统、运镜系统、timeline 采样、事件系统和后端导出，目标是避免所有模块只看一个模糊的 `rate`，从而把预览手感、成片变速和特效时长混在一起。

重复播放覆盖、录制倍速如何编译为 `editSegments`、视效倍速如何进入 effect timeline，以及后端如何重新渲染，见：

```text
docs/project-docs/00-overview/pc-editor-webxr-timeline-overwrite-and-speed-mechanism.md
```

## 1. 核心结论

系统只保留三种速度：

| 名称 | 推荐字段 | 本质 | 进入后端 timeline | 典型用途 |
| --- | --- | --- | --- | --- |
| 播放倍速 | `playbackSpeed` / `playbackRate` | 用户观看和操作时的视频播放速度 | 不直接进入 | 慢看、快看、子弹时间 |
| 录制倍速 | `recordingSpeed` / `segmentSpeed` | 录进成片的原片变速 | 必须进入 | 慢动作、加速、speed ramp |
| 视效倍速 | `effectSpeed` / `visualEffectSpeed` | 所有特效和预设运镜的基础时间倍率 | 需要进入 effect spec 或 effect event | 延长/压缩特效、统一调节动作节奏 |

暂停不是第四种速度。暂停是运行门闸：

```text
paused = true：
  video currentTime 不推进。
  前端特效动作不推进。
  自动运镜 preview 不推进。
  timeline 流式采样不推进。
  不伪造 +1ms。
  不等价于 recordingSpeed = 0。
  不等价于 effectSpeed = 0。
```

子弹时间不是独立速度类型。子弹时间就是播放倍速的一种固定模式：

```text
bullet time = playbackSpeed 固定为 0.1
```

## 2. 三种速度

### 2.1 播放倍速 playbackSpeed

播放倍速只回答一个问题：用户现在以多快的速度观看素材、进行反应和操作。

```text
作用域：
  HTMLVideoElement.playbackRate
  前端播放控制条
  前端预览时钟
  用户操作手感
  子弹时间

不作用于：
  后端导出时长
  timeline segment speed
  已写入的 EffectEventsPatch duration
  已写入的 ViewPathPatch duration
```

规则：

```text
playbackSpeed = 1.0：
  正常观看。

playbackSpeed = 0.5：
  用户慢看，前端预览和视频一起变慢。
  后端 timeline 不因此变长。

playbackSpeed = 0.1：
  子弹时间。
  用于用户反应不过来、需要瞄准、选特效、切视角。
  不表示成片慢动作。

playbackSpeed = 2.0：
  用户快速浏览。
  不表示成片加速。
```

播放倍速影响前端特效和运镜 preview，是为了让用户看到的东西和素材播放节奏同步。例如小行星预设的基础时长是 1600ms，在 `playbackSpeed = 0.1` 时，用户会以约 16000ms 的体感看到它跑完；但写入后端的默认运镜仍然是它自己的 source/output 语义，不因为子弹时间自动乘 10。

### 2.2 录制倍速 recordingSpeed

录制倍速只回答一个问题：这一段原片在最终成片里以多快速度播放。

```text
作用域：
  timeline segment speed
  source time -> output time 映射
  后端导出采样
  绑定成片画面的运镜和特效的输出时长

不作用于：
  用户当前观看速度
  子弹时间
  快捷菜单打开速度
  前端基础 preview clock
```

规则：

```text
recordingSpeed = 1.0：
  成片按原速使用素材。

recordingSpeed = 0.5：
  成片慢放。
  outputDuration = sourceDuration / 0.5。

recordingSpeed = 2.0：
  成片快放。
  outputDuration = sourceDuration / 2.0。

recordingSpeed 变化：
  必须写入 timeline speed segment。
  后端导出必须复现。
```

如果用户在子弹时间下录制，并不代表成片慢放。只有用户显式设置录制倍速，或者 workflow 明确生成 `segmentSpeed`，成片才会变速。

### 2.3 视效倍速 effectSpeed

视效倍速只回答一个问题：特效和预设运镜自己的基础动作节奏要放大或缩小多少。

它是给“特效系统”和“运镜系统”的倍率，不是给视频原片的倍率。

```text
作用域：
  transition fade duration
  flash duration
  blur ramp duration
  camera push / pull / little planet preset duration
  shake frequency / envelope
  粒子、光效、故障等 visual effect envelope

不作用于：
  HTMLVideoElement.playbackRate
  source video speed
  timeline source -> output 映射
```

规则：

```text
effectSpeed = 1.0：
  使用特效默认时长。

effectSpeed = 0.5：
  特效动作变慢，持续时间约变为 2 倍。

effectSpeed = 2.0：
  特效动作变快，持续时间约变为 1/2。
```

视效倍速可以用来解决“我想把这段特效拉长，但不想改变原片速度”的问题。例如黑场默认 800ms，`effectSpeed = 0.5` 后可以变成 1600ms；原片是否慢放仍由 `recordingSpeed` 决定。

## 3. 暂停机制

暂停是一个 gate：

```text
isRunning = playback.isPlaying && !playback.paused
```

暂停时应该停止这些连续推进：

```text
视频播放：
  video.currentTime 不推进。

前端特效动作：
  active visual effect preview 冻结在当前 phase。
  不继续淡入、淡出、抖动、推拉。

自动运镜 preview：
  preset camera motion 冻结。
  不偷偷推进 source time。

timeline 流：
  path sampler 不追加连续点。
  effect stream 不靠 wall-clock 自动前进。
  不制造 +1ms 假时间点。
```

暂停时仍然允许离散编辑动作：

```text
允许：
  用户调整视角。
  用户选择特效。
  用户修改参数。
  workflow 在恢复或提交时生成明确 patch。

不允许：
  把暂停期间的 wall-clock 自动当作 timeline duration。
  把 pause 解释为 recordingSpeed = 0。
  把 pause 解释为 effectSpeed = 0。
```

如果产品需要“暂停中黑场切视角”，应该由 workflow 生成明确数据：

```text
EffectEventsPatch：
  表达黑场遮挡。

ViewPathRange：
  表达从旧视角切到新视角。

duration：
  来自用户明确的 hold gesture、当前 effectSpeed、预设策略或参数输入。
  不来自播放器暂停了多久。
```

## 4. 合成公式

前端预览时，特效动作的 wall-clock 推进可以按这个思路计算：

```text
if paused:
  effectiveEffectPreviewRate = 0
else:
  effectiveEffectPreviewRate = playbackSpeed * effectSpeed
```

解释：

```text
playbackSpeed：
  让特效 preview 跟着用户看到的视频慢下来或快起来。
  子弹时间时为 0.1。

effectSpeed：
  决定特效自身基础动作节奏。
  例如把所有 fade、shake、pullback 的基础时长统一拉长。

recordingSpeed：
  不参与普通前端 preview clock。
  只有在“预览最终成片速度”的模式下，adapter 才可以显式读取它。
```

后端导出时，时间映射应该分两层：

```text
第一层：原片变速
  outputDuration = sourceDuration / recordingSpeed

第二层：视效时长
  effectDuration = baseEffectDuration / effectSpeed
```

如果某个 effect 绑定 source time：

```text
它跟随源视频区间。
recordingSpeed 会改变它在 output 中占用的时间。
effectSpeed 决定它内部 envelope 的快慢。
```

如果某个 effect 绑定 output time：

```text
它直接在成片时间线上计时。
recordingSpeed 不自动改变它的固定输出时长。
effectSpeed 仍然可以改变它自己的基础动作时长。
```

## 5. 状态机落点

### 5.1 播放状态机

维护：

```text
isPlaying
paused
currentTimeMs
playbackSpeed
playbackSpeedPreset? = bullet_time
```

事件：

```text
player.playback.play
player.playback.pause
player.playback.toggle
player.playback.seek
player.playback.speed.set { playbackSpeed }
player.playback.speed.reset
player.playback.speed.set { playbackSpeed: 0.1, preset: "bullet_time" }
player.playback.speed.reset { preset: "bullet_time" }
```

子弹时间只是播放倍速的一个 UI preset，不是独立速度。短期也可以沿用现有 `player.playback.rate.set`，但 payload 必须叫 `playbackSpeed` 或 `playbackRate`，不能只叫 `rate`。

### 5.2 录制状态机

维护：

```text
recordingActive
recordingSpeed
pendingSpeedSegment
speedSegmentDrafts
```

事件：

```text
editor.recording.start
editor.recording.end
editor.recording.speed.set { recordingSpeed }
editor.timeline.speed_segment.add { sourceRange, recordingSpeed }
editor.timeline.speed_segment.update
editor.timeline.speed_segment.remove
```

长期建议把“录制倍速”从 `player.*` 事件域移到 `editor.*` 或 `timeline.*` 事件域，因为它不是播放器行为，而是成片编辑行为。

### 5.3 视效状态机

维护：

```text
effectSpeed
effectSpeedScope = global | category | effect | gesture
activeEffectId
activeEffectPhase
```

事件：

```text
editor.effects.speed.set { effectSpeed, scope }
editor.effects.speed.reset { scope }
editor.effects.select
editor.effects.hold.start
editor.effects.hold.end
editor.effects.params.set
```

视效状态机只决定特效动作节奏。它不应该改视频 playbackRate，也不应该生成 source video speed segment。

### 5.4 Timeline 流状态机

维护：

```text
streamRunning
lastSourceTimeMs
replaceRange
takeId
pendingViewPathPatch
pendingEffectEventsPatch
```

规则：

```text
播放中：
  sourceTimeMs 推进。
  sampler 可以追加 ViewPathPoint。
  hold effect 可以根据 source time / effectSpeed 形成事件。

暂停中：
  streamRunning = false。
  sampler 不追加连续点。
  自动 effect stream 不推进。
  只接受 workflow 明确提交的离散 patch。
```

## 6. 防错规则

```text
不要把 playbackSpeed 写入 timeline speed segment。
不要把 bullet time 当作录制慢动作。
不要用 recordingSpeed 改 HTMLVideoElement.playbackRate，除非用户显式进入“按成片速度预览”模式。
不要用 pause 表达 freeze frame；freeze frame 是独立时间类特效。
不要用 effectSpeed 改变原片 sourceDuration -> outputDuration 映射。
不要在事件 payload 中只写 rate。
```

推荐字段命名：

```text
playbackSpeed / playbackRate：
  播放倍速。

recordingSpeed / segmentSpeed：
  录制倍速、成片变速。

effectSpeed / visualEffectSpeed：
  视效倍速。

effectiveEffectPreviewRate：
  前端运行时合成值，只读派生，不写 timeline。
```

## 7. 例子

### 7.1 子弹时间下加小行星

```text
playbackSpeed = 0.1
recordingSpeed = 1.0
effectSpeed = 1.0
paused = false

前端：
  视频和小行星 preview 都以 0.1x 体感推进。

后端：
  原片不慢放。
  小行星预设仍按自己的默认 duration 写入。
```

### 7.2 原片慢放，但特效正常

```text
playbackSpeed = 1.0
recordingSpeed = 0.5
effectSpeed = 1.0

后端：
  该段 sourceDuration / 0.5，成片变长。
  绑定 source time 的运镜跟随变长。
  fixed-output-duration 特效仍保持固定输出时长。
```

### 7.3 原片不变速，只拉长黑场

```text
playbackSpeed = 1.0
recordingSpeed = 1.0
effectSpeed = 0.5

后端：
  原片时长不变。
  黑场、闪白、运镜 envelope 的基础动作变慢。
```

### 7.4 暂停中调视角

```text
paused = true

前端：
  视频停住。
  特效动作停住。
  timeline 流停住。
  用户可以调整视角。

提交时：
  workflow 用明确的 ViewPathRange / EffectEventsPatch 表达编辑意图。
  不根据暂停持续 wall-clock 自动增长 timeline。
```
