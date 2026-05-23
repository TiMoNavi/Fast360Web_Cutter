# 效果事件协议与接入手册

## 当前实现状态

当前代码已经支持自由效果事件名。效果事件可以从 WebXR 端以 `EffectEventsPatch` 上传，后端保存到独立效果时间线，并在 `ViewPathTimeline.effectTracks` 中表达。

已实现代码位置：

```text
apps/api/app/models.py
EffectEvent 支持 eventName 或 type 输入。
EffectEvent 支持 displayName、params、renderPolicy。

apps/api/app/storage.py
effect_events 表保存 event_name、display_name、params_json、render_policy_json。

apps/api/app/rendering/effect_handlers.py
保存具体帧效果 handler。
apps/api/app/rendering/effect_registry.py
保存效果注册表、别名和 timeline metadata。
apps/api/app/rendering/effect_runtime.py
apply_frame_effects 根据 event_name/type 分发到具体帧效果。

apps/api/app/timeline_assembler.py
把 effect events 编译进 ViewPathTimeline.effectTracks。

apps/web/src/lib/path-protocol.ts
Web 端 EffectEvent 类型支持自由字符串事件名。

scripts/render_timeline_review_cases.py
生成可观看的 timeline review cases。
```

当前渲染器已经能实际处理：

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

未知事件名可以被保存和进入 timeline。渲染时默认忽略；如果事件设置 `renderPolicy.fallback = "fail"`，后端遇到未知事件会失败，适合强依赖效果。

## 事件结构

推荐使用 `type` 表达机器可读事件名。为了兼容当前 API，也支持 `eventName`。

```json
{
  "seq": 1,
  "type": "black.solid",
  "displayName": "黑场",
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

字段约定：

```text
type / eventName：
机器可读事件名。使用稳定字符串，不放中文展示文案。

displayName：
给用户看的名称，可中文。

startMs / endMs：
当前 EffectEventsPatch 中使用源视频时间轴。进入 ViewPathTimeline 后可通过 timeRef 表达 source 或 output。

params：
效果私有参数。后端只读取自己认识的参数。

renderPolicy.fallback：
ignore、warn、fail。后端不认识事件时按这个策略处理。
```

## 命名建议

事件名建议使用命名空间：

```text
black.solid
transition.fade_black
transition.flash_white
transition.cross_dissolve
transition.wipe
overlay.text
overlay.image
overlay.letterbox
filter.color_grade
filter.blur
filter.vignette
filter.chromatic_aberration
marker.review
custom.customer_event
```

规则：

```text
使用 lower_snake_case 或 dot.namespace。
同一个 type 的 params 结构要稳定。
新增实验效果可以先放在 custom.* 或 marker.*。
一旦后端渲染器正式支持，就迁移到明确命名空间。
```

## WebXR 如何调用

WebXR 端不要直接写数据库，也不要直接生成 MP4。它只需要在用户触发某个效果动作时，发送 `EffectEventsPatch`。

示例：用户在 10.0s 到 11.2s 添加黑场：

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "effectRevision": 7,
  "replaceRange": {
    "startMs": 10000,
    "endMs": 11200,
    "reason": "effect"
  },
  "events": [
    {
      "seq": 1,
      "type": "black.solid",
      "displayName": "黑场",
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
  ]
}
```

WebXR 端触发时机：

```text
空间按钮或剪辑环选择某个效果。
使用当前 video.currentTime * 1000 作为 startMs。
如果效果是范围型，WebXR UI 需要让用户确认 endMs，或使用默认持续时间。
上传时 replaceRange 应覆盖该效果所在时间范围。
收到后端 accepted 后，再把本地保存状态标为 saved。
```

WebXR 端建议只把效果意图写成协议事件，不在本地实现最终画面效果。WebXR 可以做预览，但最终以 `EffectEventsPatch -> ViewPathTimeline -> backend render` 为准。

## Timeline 中如何表达

`EffectEventsPatch` 进入 assembler 后，会出现在 `ViewPathTimeline.effectTracks`：

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
      }
    }
  ]
}
```

第一版从 WebXR 上传的效果默认是 `timeRef = "source"`，因为它们来自 `video.currentTime`。如果未来要做片头字幕、输出水印等固定在成片时间上的效果，应在 timeline assembler 或后端编辑器中生成 `timeRef = "output"` 的事件。

## 后端如何添加新效果

新增一个视觉效果的最小步骤：

```text
1. 确定事件名，例如 filter.blur。
2. 约定 params，例如 radius、strength。
3. 在 apps/api/app/rendering/effect_handlers.py 中添加 apply_xxx(frame, t_ms, event)。
4. 在 apps/api/app/rendering/effect_registry.py 的 build_registry() 中注册 EffectDefinition。
5. 如需兼容别名，把别名放进 EffectDefinition.aliases。
6. 在 docs/project-docs/03-shared-contracts/effect-events.md 记录事件名和参数。
7. 在 scripts/render_timeline_review_cases.py 添加一个可观看 case。
8. 跑 python -m compileall apps/api 和 review render 脚本。
```

示意：

```python
def apply_blur(frame, t_ms, event):
    import cv2

    params = event.get("params") or {}
    radius = int(params.get("radius", 9))
    radius = radius if radius % 2 == 1 else radius + 1
    return cv2.GaussianBlur(frame, (radius, radius), 0)


EffectDefinition(
    canonical_name="filter.blur",
    namespace="filter",
    phase="filter",
    order=220,
    priority=10,
    stack_mode="additive",
    conflict_group=None,
    handler=apply_blur,
)
```

如果效果只改变画面内容，例如黑场、滤镜、字幕、颜色，它属于 `effectTracks`。

如果效果改变时间轴，例如快进、慢放、倒放、冻结帧、删除片段，它不应只作为效果事件处理，而应编译进 `ViewPathTimeline.editSegments`，因为它改变 `sourceMs -> outputMs` 映射。

## 当前 Review Cases

当前已经生成一组可观看验证文件：

```text
storage/exports/timeline-review/index.html
```

包含：

```text
01_horizontal_yaw_90deg
02_vertical_pitch_90deg
03_diagonal_yaw_pitch_90deg
04_jump_90deg_with_fast_fill
05_black_field_transition
06_discard_middle_segment
07_free_event_names
```

每个 case 都有：

```text
*.mp4
*.timeline.json
```

重新生成：

```powershell
python scripts/render_timeline_review_cases.py
```

## Effect Registry / 生效顺序 / 冲突规则

后端现在把效果事件分成两个层次：

```text
EffectEvent
用户或 WebXR 上传的剪辑意图。

EffectDefinition
后端注册表里的渲染定义，决定 namespace、phase、order、priority、stackMode、conflictGroup 和 handler。
```

渲染前，后端会先做一次解析：

```text
1. 根据 eventName/type 规范化成 canonicalName。
2. 找到注册表里的 EffectDefinition。
3. 过滤掉当前帧不活跃的事件。
4. 对同一个 conflictGroup 内的事件做互斥选择。
5. 按 phase/order 排序后依次执行。
```

当前 phase 顺序：

```text
generate    生成类，预留给黑场片段、标题卡、AI 生成帧
transition  转场和遮挡类，例如 transition.fade_black、black.solid
filter      画面滤镜，例如 highlight、filter.vignette
overlay     叠加层，例如 overlay.text
marker      标记类，通常不参与最终画面
```

当前已经注册的效果：

```text
transition.fade_black
black.solid
transition.flash_white
filter.color_grade
highlight
filter.blur
filter.vignette
filter.chromatic_aberration
overlay.letterbox
overlay.text
```

冲突规则：

```text
同一个 conflictGroup 内，同一帧只允许一个事件生效。
优先比较 priority。
priority 相同时，优先 seq 更大的事件。
seq 也相同时，优先 startMs 更晚的事件。
```

例如 `transition.fade_black` 和 `black.solid` 都属于：

```text
conflictGroup = frame.occlusion
```

如果 `transition.fade_black` 和 `black.solid` 在同一帧重叠，`black.solid` 的默认 priority 更高，所以黑场生效，fade 不再叠加。这样可以避免多个唯一遮挡效果被错误叠在一起。

WebXR 或后端编辑器可以通过 `renderPolicy` 覆盖默认优先级或冲突组：

```json
{
  "type": "black.solid",
  "startMs": 2700,
  "endMs": 3300,
  "params": {
    "opacity": 1.0
  },
  "renderPolicy": {
    "fallback": "warn",
    "priority": 120,
    "conflictGroup": "frame.occlusion"
  }
}
```

新增效果时，优先使用 namespace：

```text
projection.*  360 投影模式，例如 projection.tiny_planet
view.*        取景控制，例如 view.look_at、view.horizon_lock
time.*        时间轴变换，例如 time.speed_ramp、time.freeze、time.reverse
transition.*  转场，例如 transition.cross_dissolve
filter.*      滤镜，例如 filter.vignette、filter.blur
overlay.*     叠加，例如 overlay.text
mask.*        遮罩，例如 mask.privacy_blur
audio.*       音频，例如 audio.fade
marker.*      标记，不直接渲染
custom.*      实验事件
```

注意：`time.*`、`projection.*`、`view.*` 这类会改变采样、投影或时间映射的事件，不应该只作为普通 frame effect 处理。它们应该进入 render planner 或 timeline assembler，把影响编译到 `editSegments`、`viewTracks` 或独立的 projection/view 轨道里。

当前新增一个普通视觉效果的最小步骤：

```text
1. 在 apps/api/app/rendering/effect_handlers.py 添加 apply_xxx(frame, t_ms, event)。
2. 在 build_registry() 里注册 EffectDefinition。
3. 设置 namespace、phase、order、priority、stackMode、conflictGroup。
4. 如果需要兼容旧名字，把旧名字放进 aliases。
5. 在 docs/project-docs/03-shared-contracts/effect-events.md 记录 params。
6. 在 scripts/render_timeline_review_cases.py 添加 review case。
7. 跑 python -m compileall apps/api scripts/render_timeline_review_cases.py。
```

当前新增的 review case：

```text
08_effect_order_and_conflict
09_cinematic_effect_pack
```

它验证：

```text
filter.vignette 和 highlight 可以叠加。
overlay.text 在滤镜后执行。
black.solid 与 transition.fade_black 重叠时，black.solid 赢得 frame.occlusion 冲突组。
09_cinematic_effect_pack 验证调色、闪白、模糊、色散、暗角、遮幅和文字叠加能组合成一个短剪辑。
```

## 当前效果包参数

```text
transition.fade_black
params: peakOpacity, opacity, direction
direction: through | out | in

black.solid
params: opacity, color

transition.flash_white
params: peakOpacity, opacity, color

filter.color_grade
params: strength, contrast, brightness, saturation, warmth, tint

highlight
params: strength, brightness, contrast, warmth, bloom

filter.blur
params: radius, strength, edgeMs

filter.vignette
params: strength, radius, edgeMs

filter.chromatic_aberration
params: strength, offsetPx, edgeMs

overlay.letterbox
params: ratio, opacity, color, edgeMs

overlay.text
params: text, position, color, background, opacity, backgroundOpacity, scale, margin, paddingX, paddingY
```
