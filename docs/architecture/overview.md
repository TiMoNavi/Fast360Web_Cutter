# The Invisible Director 新版 Plan：WebXR 裁剪 + 安卓端上传下载

> 历史资料提示：本文件保留作为旧阶段架构材料。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

## 1. 总体方案

产品拆成两个前端入口和一个后端。

```text
普通安卓端网站：
只负责上传 360 视频、管理“我的视频”、查看裁剪进度、下载结果。
不做手机陀螺仪裁剪，不做安卓端取景编辑。

WebXR 端网站：
进入“我的视频”，在 Quest / WebXR 设备中播放 360 视频。
播放时采集取景框中心点路径，并把低频路径 patch 发送给后端。

后端服务：
接收视频、全局剪辑参数、取景路径 patch。
后端负责全部正式裁剪，按 60 秒切片边接收边裁剪，生成普通平面视频。
```

核心原则：

```text
安卓端 = 素材入口 + 结果出口。
WebXR 端 = 唯一裁剪入口。
后端 = 唯一正式裁剪入口。
前端不做最终裁切，不发送裁切事件，只发送全局参数和取景路径。
播放设置只影响前端播放体验，不改变后端裁剪时间轴。
```

---

## 2. 前端与播放组件选型

### 普通安卓端网站

```text
框架：React / Next.js
定位：移动端 Web 管理后台
功能：上传、我的视频、进度、下载、重新进入 WebXR 链接
```

页面：

```text
/mobile/videos
/mobile/videos/:videoId
/mobile/exports/:exportId
```

安卓端能力：

```text
上传 360 MP4
查看“我的视频”
查看视频处理状态
生成/展示 Quest WebXR 入口二维码或链接
查看每分钟裁剪进度
下载最终 MP4
放弃整个裁剪任务
```

### WebXR 端网站

```text
框架：React / Next.js
WebXR：Three.js WebXRManager
360 播放：HTMLVideoElement + THREE.VideoTexture
360 场景：inside-out SphereGeometry
取景框：Three.js 3D 几何遮罩
输入：head-gaze + Quest controller
```

WebXR 端能力：

```text
进入“我的视频”
选择已上传视频
进入 WebXR 播放
显示中心取景框和遮罩
边播放边采集取景框中心点
按低频规则生成 ViewPathPatch
支持平滑跟随、锁定/解锁、Cut、FOV 变焦、播放倍速、放弃/恢复
```

不使用 DOM Overlay 作为 XR 主 UI；WebXR 内的核心操作用手柄按键、摇杆和 3D UI 完成。

---

## 3. 数据结构拆分

数据拆成三类：

```text
ClipEditConfig：
整个视频的全局剪辑参数。后端正式裁剪会读取。

ViewPathPatch / ViewPathPoint：
取景框中心点路径。后端正式裁剪会读取。

PlaybackClientState：
播放端状态和体验选项，例如播放倍速、预览亮度。默认不参与后端裁剪。
```

### 3.1 ClipEditConfig：全局剪辑参数

`ClipEditConfig` 在创建裁剪 session 时提交，之后只有用户明确修改全局导出设置时才更新。

```json
{
  "version": 1,
  "videoId": "video_123",
  "sessionId": "session_456",
  "source": "webxr",
  "timelineRevision": 1,
  "output": {
    "aspect": "16:9",
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "projection": {
    "input": "equirectangular",
    "yawOffset": 0,
    "pitchOffset": 0,
    "rollOffset": 0
  },
  "defaults": {
    "hFov": 82,
    "vFov": 46.1,
    "roll": 0,
    "smoothFollow": true,
    "stabilization": true
  },
  "pathPolicy": {
    "sampleIntervalMs": 200,
    "timeQuantizeMs": 100,
    "uploadIntervalMs": 2000,
    "maxPointsPerMinute": 300
  },
  "renderPolicy": {
    "chunkSeconds": 60,
    "maxYawSpeedDegPerSec": 60,
    "maxPitchSpeedDegPerSec": 30
  }
}
```

字段约定：

```text
output：
第一版固定 16:9、1920x1080、30fps。

projection：
描述原始 360 视频输入投影和必要校正。第一版 input 固定 equirectangular。

defaults：
全局默认 FOV、roll、防抖和跟随设置。

pathPolicy：
约定前端采样和上传频率，避免发送大量路径点。

renderPolicy：
约定后端分片裁剪和导出前的路径限制。
```

### 3.2 ViewPathPatch：取景路径上传批次

前端不直接上传一堆无法覆盖的散点，而是上传带替换范围的 patch。

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
      "input": "head_gaze"
    }
  ]
}
```

`replaceRange` 是覆盖逻辑的关键。

```text
后端收到 patch 后，先用 replaceRange 删除或废弃该时间范围内旧路径点。
再写入当前 patch 的 points。
这样重复播放同一段时，不依赖 t 完全相等，也不会留下旧的放弃/恢复状态。
```

### 3.3 ViewPathPoint：单个取景点

```text
seq：
前端本 session 内单调递增序号。
同一 replaceRange 内出现同一 tMs 时，seq 更大的点获胜。

tMs：
原视频时间轴上的时间，单位毫秒。
必须由 video.currentTime * 1000 得到后量化。
第一版使用 100ms 时间量化。

center.yaw：
取景框中心点水平角度，单位 degree，标准化为 -180 到 180。

center.pitch：
取景框中心点垂直角度，单位 degree，限制为 -85 到 85。

fov.h / fov.v：
虚拟相机水平 / 垂直 FOV。
取景框缩放只改变 FOV，不改变最终视频分辨率或宽高比。

roll：
第一版固定为 0，预留给地平线校正。

enabled：
true 表示该点之后进入启用状态，后端应裁剪该段。
false 表示该点之后进入放弃状态，后端应丢弃该段。

cut：
true 表示从该点开始新镜头，后端不得跨该点插值。

locked：
true 表示该点来自锁定状态。

smoothFollow：
默认 true。前端发送的是平滑后的取景框中心点，不发送原始头显抖动路径作为主路径。

input：
head_gaze / controller_ray。
```

### 3.4 PlaybackClientState：播放端状态

`PlaybackClientState` 只描述前端播放体验和调试状态，不是后端裁剪输入。

```json
{
  "sessionId": "session_456",
  "videoId": "video_123",
  "clientTimeMs": 1716370000000,
  "videoTimeMs": 12400,
  "playbackRate": 2.0,
  "previousPlaybackRate": 1.0,
  "discardFastForwardRate": 5.0,
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

字段约定：

```text
playbackRate：
只影响前端播放速度，不改变 ViewPathPoint.tMs。

preview.brightness / preview.contrast：
只影响 WebXR 观看预览，不影响最终导出。
如果未来要做输出调色，应放入 ClipEditConfig，而不是 PlaybackClientState。

recording.discardMode：
只描述前端当前 UI 状态。
最终是否丢弃某段，以 ViewPathPoint.enabled 为准。
```

---

## 4. 采样、上传与覆盖规则

### 采样频率

WebXR 可以每帧更新本地取景框，但不能每帧上传。

```text
本地渲染/平滑：跟随 XR render loop。
路径记录：最多 5Hz，即每 200ms 视频时间记录 1 个点。
时间量化：100ms。
批量上传：每 2 秒上传一次，或累计 10 个点立即上传。
事件即时上传：Cut、放弃、恢复、锁定切换、FOV 明显变化时立即上传 patch。
```

默认上限：

```text
启用状态下最多 300 个 ViewPathPoint / 视频分钟。
放弃状态下不记录连续注视点，只记录 enabled=false / enabled=true 边界点和必要保活点。
```

### 何时记录一个点

满足任意条件时记录：

```text
距离上一个记录点超过 200ms 视频时间。
yaw 变化超过 1.5°。
pitch 变化超过 1.0°。
FOV 变化超过 0.5°。
enabled / cut / locked 状态发生变化。
用户按下 Cut / 放弃 / 恢复。
```

### 覆盖规则

重复播放某一段时，前端必须开启新的 `takeId`，并为上传 patch 提供明确的 `replaceRange`。

```text
用户从 12.0s 重新播放到 18.0s：
replaceRange = [12000, 18000)
takeId = 新值
pathRevision = 递增
```

后端处理顺序：

```text
1. 找到同 session 中与 replaceRange 重叠的旧路径点。
2. 将旧路径点在该范围内废弃。
3. 写入新 patch 的 points。
4. 如果该范围所在 60 秒分片已经渲染，标记该分片 dirty 并重新渲染。
```

这套规则解决两个问题：

```text
tMs 不完全一致不会产生旧点残留。
放弃段不会因为边界时间偏移而覆盖不全。
```

### enabled 的区间解释

`enabled` 是状态字段，按时间向后生效，直到下一个 `enabled` 值变化点或当前 replaceRange 结束。

```text
enabled=false at 10s
enabled=true at 20s
=> 10s 到 20s 被后端丢弃。

如果用户重放 10s 到 20s 并上传 enabled=true 的 patch：
=> 新 patch 的 replaceRange 覆盖旧放弃状态，10s 到 20s 重新进入导出。
```

---

## 5. WebXR 快速裁剪交互

第一版沉浸式工作台采用“中控长桌 + 左右透明窗口”的空间布局：

```text
下方中控长桌上方的薄播放条：
高度受限，只显示视频进度、上一个、播放/暂停、下一个。

下方中控长桌：
时间码、当前倍速、当前 FOV、采样状态、保存状态、导出状态，以及剪辑状态反馈。

左侧透明窗口：
视频/片段列表、当前 session、历史 take。

右侧透明窗口：
FOV、锁定、平滑跟随、遮罩透明度、特效选单、遮罩样式、导出参数、session 菜单。

中央视野：
保持给 360 视频、取景框、reticle 和裁切遮罩，不放大块控制面板。
```

### 平滑跟随默认开启

```text
target = head-gaze 或 controller target
viewfinderCenter = 平滑追随 target
发送给后端的 center = viewfinderCenter
```

前端先做基础防抖和平滑，后端再做导出前的保底路径处理。

### 锁定 / 解锁

```text
按住 Trigger：
取景框中心跟随平滑后的 head-gaze 或 controller target。

松开 Trigger：
锁定当前 center.yaw / center.pitch / fov。

Grip 拖动：
移动取景框/遮罩整体，用于快速重新定位。
```

### FOV 变焦

```text
右摇杆上：缩小 FOV，画面推近
右摇杆下：放大 FOV，画面拉远
```

最终输出始终保持固定 16:9、1920x1080；FOV 变化只表现为推近/拉远。

### 播放倍速

```text
0.5x
1x
2x
4x
5x 放弃快进
```

播放倍速只影响前端播放和用户浏览素材的速度，不影响 `ViewPathPoint.tMs`。

### 放弃 / 恢复

```text
按下放弃：
前端立即上传一个包含 enabled=false 边界点的 patch。
当前播放段进入放弃状态。
前端自动切换到 5x 播放，帮助用户快速跳过不需要的内容。

按下恢复：
前端立即上传一个包含 enabled=true 边界点的 patch。
当前播放段重新进入启用状态。
播放速度恢复到用户放弃前的速度，或保持用户手动选择的速度。
```

放弃和恢复可以通过重复播放同一时间范围覆盖。

### 快速操作

```text
按住右手 A 或右摇杆点击：
打开剪辑环。

拖向扇区：
高亮并预览 Cut、放弃/恢复、锁定/解锁、暂停采样、回退 5 秒、保存。

松开：
执行当前高亮扇区。

拖回中心或按 B：
取消，不修改路径。

右摇杆左/右：
切换播放倍速。

右摇杆上/下：
调节 FOV。
```

高频操作必须能通过一次按住、拖动、松开完成，避免在视频播放中连续点按小按钮。

### UI 到路径协议

```text
Cut：当前点 cut=true。
放弃/恢复：当前点 enabled=false / enabled=true。
锁定：当前点 locked=true。
FOV 调节：写入 fov.h / fov.v。
平滑跟随：写入 smoothFollow=true / false。
倍速：只写 PlaybackClientState.playbackRate，不改变 ViewPathPoint.tMs。
遮罩透明度和预览特效：默认只影响 WebXR 预览，不参与正式裁剪。
```

---

## 6. 后端边播放边裁剪

### 切片规则

后端固定按 60 秒处理：

```text
minuteIndex = floor(tMs / 60000)
minute 0 = 0s 到 60s
minute 1 = 60s 到 120s
minute 2 = 120s 到 180s
```

当后端确认某一分钟的路径已经覆盖到 `minuteEnd`，即可处理该分钟，不等待整段视频播放完成。

示例：

```text
用户播放到 75s：
第 0 分钟路径完整，后端开始裁剪 0-60s。
第 1 分钟继续 collecting。
```

### 分钟状态

```text
collecting
ready
rendering
done
dirty
failed
discarded
```

ready 条件：

```text
后端已收到覆盖 minuteStart 到 minuteEnd 的路径 patch。
后端已按 replaceRange 解决覆盖。
后端已补齐 minuteStart 和 minuteEnd 边界点。
该分钟内至少存在 enabled=true 的有效时间段。
```

如果某一分钟全部为 `enabled=false`，该分钟状态为 `discarded`，不进入最终导出。

如果某一分钟已经 `done`，但之后收到重叠的 replaceRange，则状态变为 `dirty`，需要重新渲染。

### 裁剪实现

主路径：

```text
接收 ClipEditConfig
接收 ViewPathPatch
按 replaceRange 更新路径时间线
按 60 秒切片
把 enabled=false 的时间范围排除
对每个 enabled=true 的连续区间生成 yaw / pitch / FOV 曲线
使用 FFmpeg v360 或后端逐帧投影渲染
输出 segment mp4
最终 concat 成完整 MP4
```

资源控制：

```text
每个 worker 同时只处理有限数量片段。
单个任务只处理当前 60 秒窗口。
失败只影响当前分钟或当前有效区间。
已完成分钟可立即展示进度。
dirty 分片重新渲染后替换旧 segment。
```

---

## 7. API 与状态

核心接口：

```text
POST /api/videos/upload
GET  /api/videos
GET  /api/videos/:videoId

POST /api/cut-sessions
GET  /api/cut-sessions/:sessionId
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
GET  /api/cut-sessions/:sessionId/status

GET  /api/exports/:exportId/download
```

裁剪输入接口：

```text
POST /api/cut-sessions/:sessionId
创建裁剪 session，并提交 ClipEditConfig。

POST /api/cut-sessions/:sessionId/path-patches
提交 ViewPathPatch。后端正式裁剪只依赖 ClipEditConfig + ViewPathPatch。
```

播放状态接口：

```text
POST /api/cut-sessions/:sessionId/playback-state
提交 PlaybackClientState。
该接口只用于调试、设备状态、前端恢复 UI，不参与后端裁剪。
```

状态返回需包含：

```text
每个 minuteIndex 的状态
整体 session 状态
已完成片段数量
dirty 片段数量
已丢弃片段数量
失败片段数量
最终 export 是否可下载
```

---

## 8. 防抖与路径处理

前端实时处理：

```text
平滑跟随默认开启
低通滤波
最大角速度限制
cut=true 断开插值
暂停播放时暂停路径采样
enabled=false 时不记录连续注视点，只记录边界点
```

后端导出前处理：

```text
按 replaceRange 维护最终路径时间线
同一 tMs 使用 seq 最大的点
标准化 yaw 到 -180 到 180
限制 pitch 到 -85 到 85
对 cut=false 且 enabled=true 的连续段平滑
对 cut=true 点强制断开
补齐每分钟起止边界点
丢弃 enabled=false 的时间范围
```

---

## 9. 测试场景

必须验证：

```text
安卓端能上传 360 MP4。
上传后视频出现在“我的视频”。
安卓端能打开或展示 WebXR 裁剪链接。
WebXR 端能读取同一份“我的视频”。
WebXR 能播放 360 视频并进入沉浸模式。
WebXR 不逐帧上传路径点。
启用状态下每分钟路径点数量不超过 300。
倍速播放时，ViewPathPoint.tMs 仍然来自 video.currentTime。
播放倍速只影响前端播放，不影响后端裁剪时间轴。
预览亮度只影响前端观看，不影响最终导出。
平滑跟随默认开启，发送的是平滑后的取景框中心点。
Cut 通过路径点 cut=true 表达，后端不会跨 cut 插值。
放弃通过 enabled=false 表达，后端丢弃该时间段。
恢复通过 enabled=true 表达，后端重新启用后续时间段。
重放 12s 到 18s 时，replaceRange 覆盖旧路径点，即使新旧 tMs 不完全一致。
已完成分片收到重叠 replaceRange 后变为 dirty 并重新渲染。
播放超过 60 秒后，后端开始处理第 0 分钟。
第 0 分钟失败不阻止第 1 分钟继续接收路径。
最终结果为固定 16:9 MP4。
```

视觉验收：

```text
导出画面中心对应 WebXR 中的取景框中心。
锁定状态下画面稳定。
默认跟随状态下镜头平滑移动。
FOV 变化表现为推近/拉远。
硬切处没有慢速扫视。
enabled=false 的时间段不会出现在最终视频中。
重放覆盖后不会残留旧的放弃段。
```

---

## 10. 明确默认与假设

```text
安卓端不做裁剪，只做上传、管理、下载和任务控制。

WebXR 是唯一裁剪入口。

裁剪只在后端进行。

后端正式裁剪只读取 ClipEditConfig 和 ViewPathPatch。

PlaybackClientState 不参与后端裁剪。

第一版只输出 16:9、1920x1080、30fps。

取景框缩放只改变 FOV，不改变最终视频比例。

播放倍速只影响前端播放，不改变路径时间轴。

播放亮度默认只影响前端预览，不改变最终输出。

放弃/恢复是 ViewPathPoint.enabled 的状态变化，不是独立裁剪事件。

放弃状态下前端默认 5x 播放。

重复播放覆盖必须通过 ViewPathPatch.replaceRange 完成，不能依赖 tMs 完全相等。

平滑跟随默认开启。

后端固定按 60 秒裁剪，边接收路径边处理已完成分钟。

WebXR 第一版优先支持 Quest head-gaze 和 controller，不做手势识别。

真实眼动追踪不进入第一版，统一称为 head-gaze。

前端不实时生成正式裁切视频。

虚拟相机录屏式导出只作为失败退化方案。
```
