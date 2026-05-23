# A-Frame Timeline Bridge

## 定位

`A-Frame Timeline Bridge` 是 WebXR/A-Frame 侧的非 UI 集成层。它不绘制按钮、遮罩、工作台或播放器面板，只负责把头显、手柄、手势和空间 UI 触发的语义动作转换成后端已有协议。

第一版后端边界保持不变：

```text
ViewPathPatch / ViewPathPoint
正式裁剪输入，表达源视频时间轴上“看哪里、是否保留、是否切开、FOV 怎么变”。

EffectEventsPatch / EffectEvent
独立效果事件时间线，表达黑场、转场、滤镜、字幕、人工标记等事件。

PlaybackClientState
播放端体验状态，用于状态提示、调试和恢复，不参与最终导出。
```

手势信息第一版不作为原始数据保存。手势只会归一化成稳定语义事件，例如 `lockViewport`、`cutHere`、`setFov`、`createEffectEvent`。

## 前端代码落点

```text
apps/web/src/components/aframe/timeline-bridge/
```

建议分层：

```text
compat/
封装 A-Frame scene、camera、controller、hand tracking 的事件差异，输出稳定输入快照。

events/
定义 WebXrSemanticEvent，并统一接收空间 UI 或 controller 发出的自定义事件。

state/
维护当前取景状态：center yaw/pitch、fov、enabled、cut、locked、input。

sampler/
按低频规则把当前取景状态转换成 ViewPathPoint。

transport/
把 ViewPathPoint 批量发送成 ViewPathPatch，把效果动作发送成 EffectEventsPatch，把播放状态发送成 PlaybackClientState。
```

## 数据映射

```text
头显姿态:
camera world direction -> center.yaw / center.pitch
input = head_gaze

手柄射线:
controller ray direction -> center.yaw / center.pitch
input = controller_ray

FOV 操作:
thumbstick 或语义事件 -> ViewPathPoint.fov

锁定 / 解锁:
locked -> ViewPathPoint.locked
replaceRange.reason = lock

放弃 / 恢复:
enabled -> ViewPathPoint.enabled
replaceRange.reason = discard / restore

Cut:
cut -> ViewPathPoint.cut
replaceRange.reason = cut

效果:
createEffectEvent -> EffectEventsPatch

播放状态:
video.currentTime、playbackRate、samplingPaused、discardMode -> PlaybackClientState
```

## 上传规则

采样层使用源视频时间：

```text
tMs = video.currentTime * 1000
```

默认规则：

```text
最高采样频率：5Hz
常规上传：约 2 秒或累计 10 个点
即时上传：cut、discard、restore、lock、明显 FOV 变化、手动保存
replaceRange：半开区间 [startMs, endMs)
```

Bridge 会主动保证：

```text
replaceRange.startMs < replaceRange.endMs
points 全部落在 replaceRange 内
EffectEventsPatch 不混入 ViewPathPoint
PlaybackClientState 不改变正式裁剪结果
```

## 与 UI 的关系

空间按钮、拖动遮罩、工作台模块、手势识别都不直接调用后端。它们只需要向 scene 或 window 发出语义事件：

```text
webxr:timeline-event
```

示例语义：

```text
lockViewport
unlockViewport
toggleLock
setFov
nudgeFov
discardRange
restoreRange
cutHere
createEffectEvent
flushPath
samplingPause
samplingResume
```

Bridge 接收这些语义事件后，统一决定是否更新本地取景状态、是否采样、是否立即上传 patch。

## 边界

Bridge 不做：

```text
不绘制 A-Frame UI。
不创建空间按钮。
不实现遮罩视觉效果。
不生成最终 MP4。
不新增后端正式协议。
不保存原始手势数据。
不解释后端 render-test 或生产渲染细节。
```

Bridge 只做：

```text
读取 A-Frame / WebXR 输入。
归一化语义事件。
维护当前取景状态。
降频采样 ViewPathPoint。
排队发送 ViewPathPatch。
发送 EffectEventsPatch。
低频发送 PlaybackClientState。
```
