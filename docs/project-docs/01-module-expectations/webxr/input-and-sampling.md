# 输入与路径采样

## 输入来源

WebXR 裁剪意图来自：

```text
头显姿态。
controller ray。
controller buttons。
thumbstick axes。
空间按钮 click / hover / press。
视频当前时间。
```

输入层只输出语义事件和目标取景状态，不直接写数据库。

## 空间按钮事件

空间按钮第一版优先功能性：

```text
hover:
按钮高亮。

press:
按钮进入按下状态。

release:
触发动作。

disabled:
不可点击并显示弱化状态。
```

按钮动作使用语义名称：

```text
playPause
seek
togglePlayerUi
openWorkbenchModule
closeWorkbenchModule
setFov
toggleLock
toggleSampling
savePatch
createEffectEvent
requestExport
```

`createEffectEvent` 不直接生成视频，也不直接修改取景点。它应生成 `EffectEventsPatch`，由后端保存到独立效果时间线，再由 timeline assembler 编译进 `ViewPathTimeline.effectTracks`。

## Controller 映射

第一版默认映射：

```text
Trigger 按住：
取景目标跟随 controller ray 或 head-gaze。

Trigger 松开：
锁定当前取景目标。

Grip：
拖动取景窗口或遮罩整体，用于快速重新定位。

右手 A：
打开或确认剪辑环形菜单。

右手 B：
取消当前弹出模块或环形菜单。

右手 thumbstick 上 / 下：
缩小 / 放大 FOV。

右手 thumbstick 左 / 右：
切换播放倍速。
```

实际实现可以根据 Quest Browser 的事件表现微调，但文档语义保持稳定。

## 取景状态

采样层维护当前取景状态：

```text
center.yaw
center.pitch
fov.h
fov.v
roll
enabled
cut
locked
smoothFollow
input
```

本地预览可以跟随 XR render loop 高频更新。持久化时必须降频。

## 采样规则

目标规则：

```text
持久化频率：
最高约 5Hz。

时间来源：
video.currentTime * 1000。

时间量化：
100ms 或 200ms，按协议最终统一。

批量上传：
约每 2 秒，或累计 10 个点。

即时上传：
cut、放弃、恢复、锁定切换、FOV 明显变化、保存。
```

上传时使用 `ViewPathPatch.replaceRange`，支持用户重放某段并覆盖旧路径。

## 效果事件上传

WebXR 端触发黑场、转场、字幕、滤镜、人工标记等剪辑效果时，应走独立效果协议：

```text
POST /api/cut-sessions/:sessionId/effect-events
```

示例：

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

WebXR 端应使用 `video.currentTime * 1000` 生成 `startMs / endMs`。如果效果是瞬时动作，可以给一个默认持续时间；如果效果是范围动作，应让用户在空间 UI 中确认范围。

效果事件不要混入 `ViewPathPoint`。取景路径表达“看哪里、是否保留、是否切开”；效果事件表达“这段时间额外做什么视觉处理或标记”。

完整效果事件接入手册见：

```text
docs/project-docs/03-shared-contracts/effect-events.md
```

## 不持久化的状态

这些状态不进入正式裁剪路径：

```text
播放器 UI 是否隐藏。
工作台哪个模块打开。
按钮 hover / pressed 状态。
遮罩透明度。
玻璃材质。
预览亮度。
桌面 lab mock 状态。
```

正式后端导出只依赖稳定路径和配置。
