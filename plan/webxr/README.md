# WebXR 裁剪端规划

验证过程中的问题、结论和处理办法见：[WebXR 360 取景与导出验证复盘](./LESSONS.md)。

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

当前已经先跑通了一个测试闭环：WebXR 页面不做真实取景，只生成固定环绕路径，触发后端短测试导出，用来验证“上传 -> WebXR 处理 -> 后端裁剪 -> 安卓网页下载”的链路。

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
WebXR 裁剪播放页。当前是固定环绕测试处理页，后续替换为真实 WebXR 裁剪播放页。

/xr/hello
WebXR / Three.js 本地环境检查页。
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

目标进入流程：

```text
加载 video 元数据。
加载或创建 ClipEditConfig。
加载 video URL。
初始化 HTMLVideoElement。
初始化 Three.js scene。
等待用户点击进入 WebXR。
开始播放和路径采样。
```

当前测试流程：

```text
读取 video 元数据。
显示 videoId / sessionId。
点击“固定环绕测试处理”。
生成固定 5Hz ViewPathPatch。
上传 path-patches。
触发后端 render-test。
导出完成后显示下载结果入口。
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

当前固定环绕测试：

```text
最长 60 秒。
每 200ms 一个点，约 5Hz。
目标旋转速率约 1°/s。
yaw 以当前导出时长按速率计算，最多扫 60°。
pitch = 0。
hFOV = 90，vFOV = 50.6。
enabled = true，cut = false。
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

当前后端已经按 `[startMs, endMs)` 覆盖旧点，避免误删下一段起点。

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
GET /api/exports/:exportId
GET /api/exports/:exportId/download
```

写入：

```text
POST /api/cut-sessions
PUT  /api/cut-sessions/:sessionId/config
POST /api/cut-sessions/:sessionId/path-patches
POST /api/cut-sessions/:sessionId/playback-state
POST /api/cut-sessions/:sessionId/abandon
```

测试写入：

```text
POST /api/cut-sessions/:sessionId/render-test
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

---

## 当前情况

已完成：

```text
已建立 /xr/hello WebXR / Three.js 环境检查页。
已建立 /xr/videos 视频列表页，读取同一账号下的后端 videos。
已建立 /xr/videos/:videoId/session/:sessionId 测试处理页。
已建立 XrSessionLink，可从 WebXR 列表创建默认 session 并进入处理页。
已建立 FixedOrbitRenderButton，可生成固定环绕 ViewPathPatch。
固定环绕测试会调用 path-patches 和 render-test，触发后端 FFmpeg 短测试导出。
已建立本地桌面双眼模拟预览 Start Simulator。
已建立 mock-xr 自动烟测入口。
```

部分完成：

```text
WebXR 页面已接入真实账号、视频、session 数据，但真实 360 播放和路径采样还未实现。
/xr/videos/:videoId/session/:sessionId 目前是测试处理页，不是正式 immersive-vr 裁剪页。
固定环绕路径能验证端到端链路，但不是用户头显/手柄输入生成的真实取景路径。
download 链路可用于测试导出，但正式分片导出状态展示还需要和后端任务队列对齐。
```

未开始：

```text
真实 360 VideoTexture 播放页。
inside-out SphereGeometry 场景。
XR controller 输入。
取景框、遮罩和 reticle。
5Hz 真实路径 sampler。
Cut / 放弃 / 恢复 / 锁定 / FOV / 倍速快捷操作。
播放端 PlaybackClientState 持久化恢复。
```

## 当前最小闭环

```text
1. 在 /mobile/login 注册或登录。
2. 在 /mobile/videos 上传 360 MP4。
3. 在 /mobile/videos/:videoId 创建 WebXR cut session。
4. 进入 /xr/videos/:videoId/session/:sessionId。
5. 点击“固定环绕测试处理”。
6. 前端生成 5Hz、约 1°/s、最多 60 秒/60° 的固定 yaw 环绕 ViewPathPatch。
7. 后端保存路径点，并调用 /api/cut-sessions/:sessionId/render-test。
8. render-test 使用 FFmpeg v360 分段静态投影导出短测试 MP4。
9. 回到安卓网页详情页或 /mobile/exports/:exportId 下载结果。
```

## 360 测试视频

本地已有测试视频准备脚本：

```powershell
npm run sample:video
```

当前会把参考项目里的 `pano.mp4` 复制到：

```text
storage/sample-videos/pano.mp4
```

如果本地参考文件不存在，脚本会从 `https://threejs.org/examples/textures/pano.mp4` 下载。这个文件可用于移动端上传测试。

## 本地开发与 Quest 3 模拟

启动本地服务：

```powershell
npm run clean:web
npm run dev:api
npm run dev:web:host
```

按测试目的打开：

```text
http://localhost:3000/xr/hello
http://localhost:3000/xr/videos
http://localhost:3000/xr/videos/:videoId/session/:sessionId
```

当前不需要额外启动 Meta 的桌面模拟器。优先使用普通 Google Chrome，因为 Meta/WebXR 扩展已经安装在默认 Chrome 配置里。

之前尝试的“专用 WebXR Chrome 配置文件”不会继承默认 Chrome 里的扩展，所以会看不到 WebXR 面板。这条路先不用。

### /xr/hello 入口

```text
Start Simulator
```

项目内置的桌面双眼模拟预览，不依赖 Meta 插件。点下去后应该看到 `LEFT EYE` 和 `RIGHT EYE`。

```text
Enter VR
```

浏览器 WebXR immersive-vr 入口。它需要 Chrome DevTools 里的 WebXR/Meta 扩展面板已经启用 Quest 3 模拟。

### 使用 Meta Quest 3 模拟

1. 用普通 Chrome 打开 `http://localhost:3000/xr/hello`。
2. 按 `F12` 打开 DevTools。
3. 在 DevTools 顶部找 `WebXR` 面板。
4. 如果没看到，点 DevTools 顶部的 `>>`，或者按 `Ctrl+Shift+P`，输入 `WebXR`。
5. 在 WebXR 面板里选择类似 `Meta Quest 3` 的设备。
6. 启用面板里的模拟、polyfill 或 start emulating 按钮。
7. 刷新页面。
8. 点页面里的 `Recheck WebXR`。
9. 如果页面显示 `immersive-vr: supported`，再点 `Enter VR`。

如果仍然显示：

```text
Secure: OK
navigator.xr: OK
immersive-vr: unsupported
```

说明页面能看到 WebXR API，但 DevTools 里的 immersive-vr 模拟还没有真正启用。此时先用 `Start Simulator` 验证 Three.js 场景和双眼预览。

## 自动测试

本地 Chrome 烟测：

```powershell
npm --workspace apps/web run smoke:webxr
```

测试内容：

```text
打开 /xr/hello
确认 Three.js canvas 出现
点击 Start Simulator
确认 LEFT EYE / RIGHT EYE 出现
打开 /xr/hello?mock-xr=1
点击 Enter VR
确认 mock WebXR session 成功启动
```

## 常见问题

### Internal Server Error / Cannot find module './997.js'

这是 Next.js dev cache 或旧 dev server 残留导致的。处理方式：

```powershell
npm run clean:web
npm run dev:web:host
```

不要同时启动多个 Next dev server，也不要在 dev server 跑着时反复跑 build。

### 为什么不能打开类似 http://data/Default/Extensions/...

那个不是网页地址，而是 Chrome 本地配置里的扩展目录路径。扩展要在 Chrome 的扩展管理页面和 DevTools 面板里操作，不能用 `http://...` 访问本地扩展目录。

### 我需要接 Quest 3 吗

当前不需要。桌面阶段用两层测试：

```text
Start Simulator：项目内置双眼预览，马上能看到画面。
DevTools WebXR + Meta Quest 3：模拟 navigator.xr 和 immersive-vr。
```
