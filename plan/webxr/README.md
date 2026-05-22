# WebXR 裁剪端规划

## 定位

WebXR 端是唯一裁剪入口。它不做最终视频裁剪，只负责沉浸式播放、取景框交互和低频路径 patch 上传。

```text
读取我的视频
进入 WebXR 播放 360 视频
显示取景框和遮罩
根据 head-gaze / controller 生成平滑后的取景中心
生成 ViewPathPatch
上传给后端
```

## 技术选型

```text
框架：React / Next.js
3D / WebXR：Three.js
WebXR 管理：THREE.WebXRManager
360 播放：HTMLVideoElement + THREE.VideoTexture
360 场景：inside-out SphereGeometry
取景框：Three.js 3D 几何遮罩
手柄输入：WebXR Gamepad API + @webxr-input-profiles/motion-controllers
```

第一版优先直接使用 Three.js，不先引入 A-Frame。`@react-three/xr` 可作为第二阶段组件化选择。

## 可利用的开源项目

直接使用：

```text
three.js：
主渲染引擎。用于 WebXR、VideoTexture、SphereGeometry、取景框几何遮罩。

webxr-input-profiles：
用于识别 Quest controller 的 trigger、grip、thumbstick、A/B 等输入。
```

重点参考：

```text
three.js examples：
参考 equirectangular video panorama、WebXR VR button、controller 输入示例。

webxr-samples：
参考 WebXR session 生命周期、requestSession、XR frame loop、input source 处理。
```

暂不作为 MVP 主框架：

```text
A-Frame：
适合快速 VR 原型，但路径采样、replaceRange、controller 组合交互太定制。

react-three-fiber / pmndrs/xr：
适合第二阶段组件化。MVP 先直接写 Three.js，减少抽象层。
```

界面风格建议：

```text
WebXR 内 UI 必须极简。
核心操作依赖手柄快捷键，不依赖复杂菜单。
状态提示应贴近视野边缘，但不能污染取景中心。
```

## 共享数据库约束

WebXR 端不维护独立视频库。它读取安卓端上传后写入的同一个 `videos` 表。

WebXR 端共享数据：

```text
videos：
读取可裁剪视频和源文件地址。

cut_sessions：
读取/创建当前裁剪 session。

path_patches：
写入 ViewPathPatch。

playback_states：
写入 PlaybackClientState，仅用于调试和恢复 UI。

minute_segments：
读取后端每分钟裁剪状态。
```

WebXR 入口中的 `videoId` 和 `sessionId` 必须来自同一个后端，不允许使用本地临时 ID。

## 页面

```text
/xr/videos
WebXR 端我的视频列表。

/xr/videos/:videoId/session/:sessionId
WebXR 裁剪播放页。
```

## 页面细化

### /xr/videos

用途：

```text
在 Quest 浏览器中选择已上传视频。
如果用户从安卓端扫码直接进入 session，可以跳过该页。
```

显示：

```text
视频文件名
时长
分辨率
最近 session 状态
进入裁剪按钮
```

### /xr/videos/:videoId/session/:sessionId

进入流程：

```text
加载 video 元数据。
加载或创建 ClipEditConfig。
加载 video URL。
初始化 HTMLVideoElement。
初始化 Three.js scene。
等待用户点击进入 WebXR。
开始播放和路径采样。
```

## 360 播放结构

```text
HTMLVideoElement
-> THREE.VideoTexture
-> SphereGeometry 内侧材质
-> 用户位于球心
-> XR camera 观看球内视频
```

场景结构：

```text
Scene
  Camera / XR Camera
  Inside-out video sphere
  Viewfinder mask group
  Reticle
  Controller rays
  Minimal 3D status UI
```

取景框实现：

```text
相机前方固定距离放置取景框 group。
四块半透明 mask 组成外部遮罩。
中心透明区域对应最终输出画幅。
reticle 显示取景中心。
FOV 变化时更新取景框尺寸提示，但最终视频尺寸不变。
```

## 取景与路径

WebXR 端只生成以下裁剪输入：

```text
ClipEditConfig
ViewPathPatch
ViewPathPoint
```

播放端状态另走：

```text
PlaybackClientState
```

`PlaybackClientState` 不参与后端正式裁剪。

## 采样规则

```text
本地渲染/平滑：跟随 XR render loop。
路径记录：最多 5Hz。
时间量化：100ms。
批量上传：每 2 秒上传一次。
快速上传：累计 10 个点上传。
即时上传：Cut、放弃、恢复、锁定切换、FOV 明显变化。
每分钟上限：300 个 ViewPathPoint。
```

满足任意条件时记录一个点：

```text
距离上一个记录点超过 200ms 视频时间。
yaw 变化超过 1.5°。
pitch 变化超过 1.0°。
FOV 变化超过 0.5°。
enabled / cut / locked 状态变化。
用户按下 Cut / 放弃 / 恢复。
```

## 覆盖规则

重复播放某段时，必须开启新的 `takeId`，并上传带 `replaceRange` 的 `ViewPathPatch`。

```text
用户重放 12s 到 18s：
replaceRange = [12000, 18000)
takeId = 新值
pathRevision = 递增
```

WebXR 端不能只依赖相近 `tMs` 覆盖旧点。

## 快捷操作

```text
A：
Cut Here。当前 ViewPathPoint.cut = true。

B：
放弃/恢复切换。当前 ViewPathPoint.enabled = false 或 true。

长按 B：
放弃整个裁剪 session。

右摇杆左/右：
切换播放倍速。

右摇杆上/下：
调节 FOV。

Trigger：
锁定/解锁。

Grip：
暂停/继续路径采样。
```

播放倍速：

```text
0.5x
1x
2x
4x
5x 放弃快进
```

播放倍速只影响 `HTMLVideoElement.playbackRate`，不改变 `ViewPathPoint.tMs`。

## 跟随与防抖

默认开启平滑跟随：

```text
target = head-gaze 或 controller target
viewfinderCenter = smooth(target)
上传 center = viewfinderCenter
```

前端处理：

```text
低通滤波
最大角速度限制
cut=true 断开插值
锁定状态保持 center 不变
enabled=false 时只记录边界点
```

## API 依赖

读取：

```text
GET /api/videos
GET /api/videos/:videoId
GET /api/cut-sessions/:sessionId
GET /api/cut-sessions/:sessionId/status
```

写入：

```text
POST /api/cut-sessions
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
```

写入节奏：

```text
path-patches：
每 2 秒或累计 10 个点上传。

playback-state：
低频上传，例如 5 秒一次，或播放倍速/亮度变化时上传。

abandon：
只有长按 B 放弃整个 session 时调用。
```

## MVP 验收

```text
Quest 浏览器能打开 WebXR 裁剪页。
能播放 H.264 MP4 360 视频。
能进入 immersive-vr。
能看到中心取景框和遮罩。
平滑跟随默认生效。
Trigger 能锁定/解锁取景中心。
A 能产生 cut=true 点。
B 能产生 enabled=false / enabled=true 点。
放弃状态自动 5x 播放。
右摇杆能调节播放倍速和 FOV。
WebXR 端不逐帧上传路径。
上传的 patch 带 replaceRange。
重放同一时间段会产生新的 takeId 和 pathRevision。
安卓端上传的视频能在 WebXR 端读取并播放。
```
