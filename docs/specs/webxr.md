# WebXR 播放与裁剪端规格

> 历史资料提示：本文件保留作为旧阶段 WebXR 规格材料。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

这份文档描述当前 WebXR 端的真实状态。旧版把环境检查、桌面模拟、mock session、360 视频播放和未来裁剪工作台都塞在 `HelloWebXR` 里；现在这些职责已经拆开。

相关记录：

```text
docs/records/webxr-playback-stage.md
docs/architecture/webxr-playback-boundaries.md
docs/records/webxr-export-lessons.md
```

## 当前定位

WebXR 端长期目标仍然是唯一的沉浸式裁剪入口：

```text
读取同一视频库中的 360 视频
在 Quest / WebXR 环境中播放
根据头显姿态和手柄输入生成取景路径
把路径压缩成低频 ViewPathPatch
提交给后端渲染导出
```

当前阶段已经完成的是播放端组件化：

```text
真实 Quest WebXR 播放入口
360 MP4 播放
伪 HLS 串流播放
Three.js inside-out sphere 球幕
桌面模拟、mock-xr、兼容 fallback 的隔离
```

尚未完成的是正式裁剪交互：

```text
头显姿态采样为 ViewPathPoint
controller 快捷操作
取景框、遮罩和 reticle
5Hz path sampler
把真实播放入口合并到 /xr/videos/:videoId/session/:sessionId
```

## 路由职责

```text
/xr/hello
Quest 3 / Meta WebXR 真机播放入口。
使用 MetaWebXrPlayer。
只保留真实 navigator.xr.requestSession("immersive-vr") 和 Three.js WebXRManager。
不包含桌面模拟器、mock-xr、XRWebGLBinding fallback、HLS/MP4 切换测试按钮。

/xr/playback-lab
桌面开发与回归测试入口。
使用 WebXrPlaybackLab。
包含 Start Simulator、mock-xr=1、MP4/HLS 切换、详细日志、XRWebGLBinding fallback。

/xr/dev-check
浏览器 WebXR 能力检查入口。

/xr/workbench
未来 WebXR 裁剪工作台 UI 原型。

/xr/videos
WebXR 侧视频列表。

/xr/videos/:videoId/session/:sessionId
真实业务裁剪 session 入口。
当前仍偏测试处理页，下一步需要接入已拆分的播放组件。
```

核心规则：

```text
/xr/hello 面向 Quest 真机播放。
/xr/playback-lab 面向桌面测试、mock、兼容性兜底和 smoke。
测试代码不能再回流到 /xr/hello。
```

## 组件结构

播放组件位于：

```text
apps/web/src/components/xr/
```

主要组件：

```text
MetaWebXrPlayer.tsx
真实 Quest / Meta WebXR 播放器。
负责 WebXR 支持检测、requestSession、renderer.xr.setSession、最小状态 UI。

WebXrPlaybackLab.tsx
开发测试播放器。
负责桌面双眼模拟、mock-xr 自动化、HLS/MP4 切换、debug log、桌面 emulator fallback。

VideoSphereScene.ts
Three.js 360 球幕封装。
负责 WebGLRenderer、camera、VideoTexture、inside-out sphere、resize、可选桌面 stereo controls。

videoSources.ts
视频源封装。
createMp4VideoSource 负责直连 MP4。
createHlsVideoSource 负责 native HLS 或 hls.js。

webXrLabCompat.ts
只允许 lab 使用的 XRWebGLBinding 兼容 shim。

XrDebugLog.tsx
只在 lab 或 debug 场景展示的日志组件。

types.ts
共享 source、status、session 类型。
```

兼容入口：

```text
apps/web/src/components/HelloWebXR.tsx
```

现在只 re-export `MetaWebXrPlayer`，新代码应直接 import `apps/web/src/components/xr/*` 下的隔离组件。

## 视频源接口

`MetaWebXrPlayer` 对外接收：

```ts
type XrVideoSource =
  | { type: "mp4"; url: string }
  | { type: "hls"; url: string };
```

视频源 helper 输出统一的运行时句柄：

```ts
type VideoSourceHandle = {
  videoElement: HTMLVideoElement;
  status: "loading" | "ready" | "playing" | "blocked" | "error";
  play: () => Promise<void>;
  dispose: () => void;
};
```

MP4 与 HLS 的状态机分开实现，但 `VideoSphereScene` 只关心 `HTMLVideoElement`。这样后续真实视频库只需要替换 source URL，不需要改 Three.js 球幕。

## 360 播放模型

核心渲染链路：

```text
HTMLVideoElement
-> THREE.VideoTexture
-> SphereGeometry
-> scale(-1, 1, 1) 或等价 inside-out 处理
-> 用户/头显相机位于球心
-> WebXR camera 观看球幕内侧视频
```

真实 Quest 路径：

```text
创建视频源
创建 VideoSphereScene，禁用桌面控制
检查 secure context、navigator.xr、immersive-vr
用户点击 Play 或 Enter VR
先尝试 video.play()
调用 navigator.xr.requestSession("immersive-vr")
把真实 XRSession 交给 renderer.xr.setSession(session)
头显姿态由 Quest Browser / WebXR runtime 驱动
```

lab 路径：

```text
可开启 StereoCamera 桌面双眼预览
可用鼠标拖拽和 WASD/方向键调整桌面视角
可用 mock-xr=1 跑自动化
可切换 MP4 与 HLS
可启用 XRWebGLBinding fallback 兼容桌面 emulator
```

## 本地样片与伪串流

本地 fixture 仍然保留，专用于开发和 smoke：

```text
GET /api/sample-video
返回 storage/sample-videos/pano.mp4，支持 Range。

GET /api/sample-stream/index.m3u8
GET /api/sample-stream/segment_*.ts
返回 storage/sample-streams/pano-hls/ 下的 HLS VOD 文件，segment 支持 Range。
```

生成样片：

```powershell
npm.cmd run sample:video
npm.cmd run sample:stream
```

这些接口不是最终视频库协议。真实业务视频应从后端 `videos` / `cut_sessions` 元数据中拿到 source URL，再传给 MP4/HLS source helper。

## 与业务裁剪页的关系

当前 `/xr/videos/:videoId/session/:sessionId` 已经承载业务 session 概念，但还没有接入真实 WebXR 播放和真实路径采样。

下一步合并方式：

```text
1. session 页面通过 API 读取 videoId / sessionId / sourceUrl。
2. 根据 sourceUrl 或后端标记选择 mp4/hls。
3. 把 source 传给 MetaWebXrPlayer 或更底层的 source + VideoSphereScene。
4. 在播放渲染循环外单独加入 ViewPath sampler。
5. sampler 只输出 ViewPathPatch，不污染播放组件。
```

播放和裁剪应保持分层：

```text
播放层：视频源、球幕、WebXR session、播放状态。
裁剪层：头显/controller 输入、取景框、路径采样、patch 上传。
业务层：video/session 元数据、权限、导出状态。
```

## 沉浸式裁剪控制面板

第一版裁剪工作台沿用 `/xr/workbench` 的空间结构：下方中控长桌、左右两侧透明窗口、中央视野保持空。设计目标不是提供桌面剪辑软件式的密集按钮，而是让用户在视频播放中用一次按住、拖动、松开的动作完成高频选择，避免连续点按跟不上素材播放。

参考交互来源：

```text
Steam Input radial menu: joystick 指向扇区，松开触发。
MDN WebXR inputs: controller 按钮和摇杆可从 XRInputSource.gamepad 读取。
Adobe 360/VR editing: horizontal / vertical FOV 是明确的 360 编辑参数。
```

参考链接：

```text
https://partner.steamgames.com/doc/features/steam_controller/radial_menus?l=english
https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Inputs
https://helpx.adobe.com/premiere-elements/using/vr-and-360-editing.html
```

### 空间布局

```text
下方中控长桌上方的薄播放条：
高度受限，只显示视频进度、上一个、播放/暂停、下一个。它只负责浏览素材，不承载剪辑参数。

下方中控长桌：
当前时间/总时长、当前倍速、当前 FOV、采样状态、保存状态、导出状态，以及剪辑相关状态反馈。

左侧透明窗口：
视频/片段列表、当前 session、历史 take。用于选择上下文，不放高频剪辑按钮。

右侧透明窗口：
参数与结果区，包含 FOV 数值、锁定状态、平滑跟随、遮罩透明度、特效选单、遮罩样式、导出参数、session 菜单。

中央视频视野：
只显示 360 视频、取景框、reticle、球面遮罩和必要状态提示，不放大块 UI 面板。
```

按钮归属规则：

```text
永久可见：
薄播放条中的上一个、播放/暂停、下一个、视频进度，以及中控长桌中的当前速度、当前 FOV、保存状态。

环形菜单高频动作：
Cut、放弃/恢复、锁定/解锁、暂停采样、回退 5 秒、保存。

右侧窗口低频动作：
特效选单、遮罩样式、导出参数、session 菜单、导出。
```

### 环形菜单

核心高频操作使用“剪辑环”：

```text
打开：
按住右手 A，或按住右手摇杆点击。

选择：
按住后拖向扇区；扇区高亮即预览将要执行的动作。

确认：
松开打开按钮，执行当前高亮扇区。

取消：
拖回中心死区后松开，或按 B。
```

第一版扇区：

```text
Cut
放弃/恢复
锁定/解锁
暂停/恢复采样
回退 5 秒
保存
```

右摇杆没有按下时保留连续调节：

```text
右摇杆上：缩小 FOV，画面推近。
右摇杆下：放大 FOV，画面拉远。
右摇杆左/右：切换播放倍速。
```

放弃模式进入后，前端自动切到 5x 播放；恢复后回到进入放弃前的倍速，除非用户在放弃期间手动选择了新的倍速。

### 球面遮罩与取景框

裁剪预览使用一个灰色毛玻璃球面遮罩覆盖非输出区域，并在取景框位置挖出 16:9 矩形孔：

```text
孔中心：
对应 ViewPathPoint.center.yaw / center.pitch。

孔大小：
对应 ViewPathPoint.fov.h / fov.v。

遮罩透明度：
只影响 WebXR 预览，不参与后端正式裁剪。

输出比例：
第一版固定 16:9；FOV 变化只表现为推近/拉远，不改变最终视频比例。
```

Controller 语义：

```text
Trigger 按住：
取景框跟随 controller ray 或 head-gaze 的平滑目标。

Trigger 松开：
锁定当前 yaw / pitch / FOV。

Grip 拖动：
拖动取景框/遮罩整体，用于快速重新定位；避免和 Trigger 的跟随/锁定语义混淆。
```

### UI 到协议字段映射

本节不新增后端正式裁剪协议。正式裁剪仍只依赖 `ClipEditConfig` 与 `ViewPathPatch` 展开的时间线。

```text
Cut:
当前点 cut=true。

放弃/恢复:
当前点 enabled=false / enabled=true。

锁定:
当前点 locked=true。

FOV 调节:
写入 fov.h / fov.v。

平滑跟随:
写入 smoothFollow=true / false。

播放倍速:
只写 PlaybackClientState.playbackRate，不改变 ViewPathPoint.tMs。

遮罩透明度和预览特效:
只属于前端预览状态，默认不参与后端正式裁剪。
```

## ViewPath 目标协议

WebXR 裁剪端最终只提交：

```text
ClipEditConfig
ViewPathPatch
ViewPathPoint
PlaybackClientState
```

其中 `PlaybackClientState` 只用于调试、恢复 UI 和状态提示，不参与正式导出。

目标采样规则：

```text
本地渲染和平滑：跟随 XR render loop。
路径记录：最高 5Hz。
时间量化：200ms。
批量上传：约每 2 秒或累计 10 个点。
即时上传：cut、放弃、恢复、锁定切换、FOV 明显变化。
每分钟上限：约 300 个 ViewPathPoint。
```

后端正式导出只依赖 `ViewPathPatch` 展开后的时间线，不依赖 WebXR 页面实时运行状态。

## 本地开发流程

清理缓存：

```powershell
npm.cmd run reset:web
```

构建检查建议串行执行，避免 Next.js `.next` 目录竞争：

```powershell
npm.cmd run reset:web
npm.cmd run typecheck:web
npm.cmd run build:web
```

启动 Web：

```powershell
npm.cmd --workspace apps/web run dev -- --port 3000 --hostname 127.0.0.1
```

如果 3000 上已有旧的 `next start` 或 dev server，优先换一个干净端口，避免 build 后静态 chunk 清单失配：

```powershell
npm.cmd --workspace apps/web run dev -- --port 3002 --hostname 127.0.0.1
```

打开：

```text
http://127.0.0.1:3000/xr/hello
http://127.0.0.1:3000/xr/playback-lab
http://127.0.0.1:3002/xr/hello
http://127.0.0.1:3002/xr/playback-lab
http://127.0.0.1:3002/xr/workbench
```

Quest 3 真机测试应优先使用同一局域网下的 HTTPS 或可被 Quest Browser 视为 secure context 的地址。桌面 Chrome 的 WebXR/Meta 扩展只用于 lab 与 smoke，不代表真机路径。

## Smoke 覆盖

当前 smoke 应覆盖：

```text
/api/sample-video Range 返回 206。
/api/sample-stream/index.m3u8 返回 HLS playlist。
/api/sample-stream/segment_000.ts Range 返回 206。
/xr/hello 渲染真实 Meta player 和 canvas。
/xr/hello 不出现 Start Simulator、Mock XR automation mode、Use HLS Stream 等 lab 控件。
/xr/playback-lab 可启动桌面模拟器并播放 MP4。
/xr/playback-lab 可切换到 HLS stream。
/xr/playback-lab?mock-xr=1 可完成 mock Enter VR。
```

运行：

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm.cmd --workspace apps/web run smoke:webxr
```

2026-05-23 本地验证结果：

```text
build:web 通过。
typecheck:web 在 build 后单独运行通过。
smoke:webxr 在 fresh dev server http://127.0.0.1:3002 上 7/7 通过。
```

## 常见问题

### 点击 Enter VR 没反应

先确认：

```text
Secure: OK
navigator.xr: OK
immersive-vr: supported
360 video: ready 或 playing
```

如果在桌面浏览器中测试，请进入 `/xr/playback-lab`。`/xr/hello` 不再内置桌面模拟器。

### XRWebGLBinding 类型错误

旧问题示例：

```text
Failed to construct 'XRWebGLBinding': parameter 1 is not of type 'XRSession'
```

这个兼容处理现在只放在 `webXrLabCompat.ts`，由 `/xr/playback-lab` 使用。真实 Quest 路径不使用 fake session，也不隐藏这类错误。

### Next.js webpack module 缓存错误

处理方式：

```powershell
npm.cmd run reset:web
```

然后重新启动 dev server。不要在同一个 `.next` 目录上同时跑 dev、build、typecheck。

如果旧的 `next start` 进程在 build 前已经运行，build 后可能继续引用旧 chunk 名称，表现为 `/_next/static/...` 返回 400，页面只出现 SSR 文本而没有 canvas。处理方式是重启这个 server，或换一个 fresh dev server 端口再跑 smoke。

## 当前限制

```text
/xr/hello 仍默认使用 /api/sample-video。
HLS 是本地 VOD 伪串流，不是直播。
真实 Quest 路径尚未合并进 /xr/videos/:videoId/session/:sessionId。
真实头显姿态尚未采样成 ViewPathPoint。
controller、取景框、遮罩、reticle 仍是后续裁剪工作台任务。
```
