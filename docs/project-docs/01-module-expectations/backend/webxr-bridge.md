# WebXR 桥接模块预期

## 职责

WebXR 桥接模块负责接收 WebXR 端传回来的时间点序列和事件序列。它是 WebXR 与后端业务之间的协议入口，不直接做重型裁切。

它负责：

```text
创建和读取 cut session。
保存 ClipEditConfig。
接收 ViewPathPatch。
校验用户、videoId、sessionId。
按 replaceRange 维护 view_path_points。
接收 EffectEventsPatch。
保存用户标记的自定义特效事件。
接收 PlaybackClientState。
维护受影响 minute_segments 的 dirty 状态。
```

## 时间点序列

WebXR 传回来的核心序列是：

```text
ViewPathPoint[]
```

每个点表达：

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
```

WebXR 桥接模块只负责把这些点变成可靠的后端时间线，不负责逐帧渲染。

## 特效事件序列

WebXR 还可以传回用户标记的特效事件：

```text
EffectEvent[]
```

事件表达：

```text
startMs
endMs
eventName 或 customName
params
enabled
```

这些事件用于后处理、自动特效、人工复核或后续渲染扩展。第一版可以只保存自定义名称和时间范围，不强制立即实现真实视觉效果。

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
