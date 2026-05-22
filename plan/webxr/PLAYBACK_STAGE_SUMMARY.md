# WebXR 播放端阶段总结

本文档总结当前阶段在 WebXR 播放端完成的能力验证、核心组件实现方法、调试经验和后续可复用的基础设施。

阶段目标是先证明“播放端链路”可行：浏览器能进入 WebXR，占位场景能渲染，360 视频能贴到球幕中播放，本地文件和伪串流都能作为 360 视频源，开发过程中的缓存问题也有稳定清理流程。

## 已完成成果

当前 `/xr/hello` 已经从单纯的 WebXR 占位测试页，演进为一个可验证的 360 视频 WebXR 播放原型：

- WebXR 环境检测：
  - 检测 `window.isSecureContext`。
  - 检测 `navigator.xr`。
  - 检测 `immersive-vr` 是否支持。
  - 支持 `mock-xr=1` 自动化测试模式。

- Three.js 场景：
  - 使用 `THREE.WebGLRenderer`。
  - 启用 `renderer.xr.enabled = true`。
  - 使用 `renderer.setAnimationLoop` 驱动普通渲染、桌面双眼模拟和 WebXR 渲染。
  - 添加旋转 cube、marker、grid、彩色方向参照物，便于确认视角和姿态变化。

- 桌面模拟器：
  - `Start Simulator` 可在普通 Chrome 桌面中显示左右眼画面。
  - 支持鼠标拖拽、WASD、方向键改变桌面模拟视角。
  - 不依赖 Meta Quest 或 WebXR DevTools。

- WebXR Enter VR：
  - 通过 `navigator.xr.requestSession("immersive-vr")` 创建 session。
  - 调用 `renderer.xr.setSession(session)` 交给 Three.js WebXRManager 接管。
  - 针对当前 Chrome / Meta WebXR 模拟器与 Three.js 0.177 的 `XRWebGLBinding` 兼容问题，增加了 fallback。

- 360 视频文件播放：
  - 从 `storage/sample-videos/pano.mp4` 读取本地样片。
  - 通过 `/api/sample-video` 暴露给前端。
  - API 支持 `Range` 请求，返回 `206 Partial Content`。
  - 使用 HTMLVideoElement + `THREE.VideoTexture`。
  - 将视频贴到 inside-out sphere，形成 360 球幕播放。

- 伪 360 串流播放：
  - 使用 `ffmpeg` 将本地 MP4 转成 HLS。
  - 输出到 `storage/sample-streams/pano-hls`。
  - 通过 `/api/sample-stream/index.m3u8` 和 `/api/sample-stream/segment_*.ts` 暴露。
  - Chrome 桌面通过 `hls.js` 播放 HLS。
  - 支持原生 HLS 的浏览器可直接走 video 原生播放能力。
  - 页面可在 MP4 文件和 HLS stream 之间切换。

- 开发稳定性：
  - 新增 `reset:web` 脚本，关闭 3000/3001 旧服务并清理缓存。
  - 避免 Next dev server 与 `.next` 构建缓存错位导致的 runtime module error。
  - 日志列表改为唯一 id key，解决重复日志触发的 React key warning。

## 关键文件

当前播放端相关的核心文件如下：

```text
apps/web/src/components/HelloWebXR.tsx
```

WebXR 播放端主组件。负责 Three.js 场景、WebXR session、桌面模拟器、360 视频球幕、MP4/HLS 切换和页面状态展示。

```text
apps/web/app/api/sample-video/route.ts
```

本地 MP4 样片接口。读取 `storage/sample-videos/pano.mp4`，支持普通 GET 和 Range GET。

```text
apps/web/app/api/sample-stream/[...path]/route.ts
```

本地 HLS 伪串流接口。读取 `storage/sample-streams/pano-hls` 下的 `.m3u8` 和 `.ts` 文件，支持 Range GET/HEAD。

```text
scripts/prepare-sample-stream.mjs
```

HLS 生成脚本。用 `ffmpeg` 将 `pano.mp4` 转为 HLS playlist 和 TS segments。

```text
scripts/reset-web-dev-cache.mjs
```

开发缓存重置脚本。关闭旧 dev server 并清理 `.next`、TypeScript 增量缓存和 Playwright 测试产物。

```text
apps/web/e2e/webxr-smoke.spec.ts
```

播放端 smoke 测试。覆盖 MP4 Range、HLS playlist、HLS segment、桌面模拟器、HLS 切换、mock WebXR Enter VR。

## WebXR 入口实现

WebXR 入口主要分为三步：

1. 检查环境。

```ts
const xr = navigator.xr;
const supported = await xr.isSessionSupported("immersive-vr");
```

2. 用户点击 `Enter VR` 后请求 session。

```ts
const session = await xr.requestSession("immersive-vr", {
  optionalFeatures: ["local-floor", "bounded-floor"]
});
```

3. 将 session 交给 Three.js。

```ts
await renderer.xr.setSession(session);
```

当前项目还保留了一个兼容层：如果 Three.js 优先使用 `XRWebGLBinding + XRProjectionLayer` 时，浏览器或模拟器报出：

```text
Failed to construct 'XRWebGLBinding': parameter 1 is not of type 'XRSession'.
```

组件会临时隐藏全局 `XRWebGLBinding`，让 Three.js 回退到旧的 `XRWebGLLayer` 路径。这样可以让 Meta/WebXR DevTools 模拟环境继续工作。

## 360 视频球幕实现

360 视频播放的核心是“视频纹理 + 内翻球体”。

1. 创建隐藏 video 元素。

```ts
const sampleVideo = document.createElement("video");
sampleVideo.loop = true;
sampleVideo.muted = true;
sampleVideo.playsInline = true;
sampleVideo.preload = "auto";
sampleVideo.src = "/api/sample-video";
```

2. 创建 VideoTexture。

```ts
const videoTexture = new THREE.VideoTexture(sampleVideo);
videoTexture.colorSpace = THREE.SRGBColorSpace;
videoTexture.minFilter = THREE.LinearFilter;
videoTexture.magFilter = THREE.LinearFilter;
```

3. 创建 inside-out sphere。

```ts
const videoSphereGeometry = new THREE.SphereGeometry(24, 64, 32);
videoSphereGeometry.scale(-1, 1, 1);

const videoSphereMaterial = new THREE.MeshBasicMaterial({
  map: videoTexture,
  side: THREE.FrontSide
});

const videoSphere = new THREE.Mesh(videoSphereGeometry, videoSphereMaterial);
scene.add(videoSphere);
```

`scale(-1, 1, 1)` 会把球体翻到内部可见，摄像机位于球心附近时就能看到 360 全景视频。

## 本地 MP4 播放接口

`/api/sample-video` 不把 `storage` 目录直接暴露为静态目录，而是通过 Next route handler 主动读取文件。

这样做有几个好处：

- 可控制文件路径，避免任意文件访问。
- 可设置正确 MIME type：`video/mp4`。
- 可支持 Range 请求。
- 后续替换成后端鉴权、视频库、转码结果时，前端使用方式不需要大改。

Range 请求对 video 播放很重要。浏览器通常不会一次性下载完整视频，而是请求类似：

```text
Range: bytes=0-99
```

接口返回：

```text
206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 0-99/962456
Content-Type: video/mp4
```

## 伪 HLS 串流实现

当前没有真实串流源，所以用本地 MP4 生成一份 HLS VOD，模拟“串流播放”。

生成命令：

```powershell
npm.cmd run sample:stream
```

脚本内部使用 `ffmpeg`：

```text
ffmpeg -i storage/sample-videos/pano.mp4 \
  -an \
  -c:v libx264 \
  -preset veryfast \
  -crf 23 \
  -g 50 \
  -sc_threshold 0 \
  -hls_time 2 \
  -hls_playlist_type vod \
  -hls_segment_filename storage/sample-streams/pano-hls/segment_%03d.ts \
  storage/sample-streams/pano-hls/index.m3u8
```

生成结果类似：

```text
storage/sample-streams/pano-hls/index.m3u8
storage/sample-streams/pano-hls/segment_000.ts
storage/sample-streams/pano-hls/segment_001.ts
storage/sample-streams/pano-hls/segment_002.ts
storage/sample-streams/pano-hls/segment_003.ts
```

前端访问：

```text
/api/sample-stream/index.m3u8
/api/sample-stream/segment_000.ts
```

playlist MIME type：

```text
application/vnd.apple.mpegurl
```

segment MIME type：

```text
video/mp2t
```

## HLS 前端播放方法

桌面 Chrome 不原生播放 HLS `.m3u8`，所以项目引入了 `hls.js`。

逻辑分三种：

1. 浏览器原生支持 HLS：

```ts
video.canPlayType("application/vnd.apple.mpegurl")
```

直接：

```ts
video.src = "/api/sample-stream/index.m3u8";
```

2. 浏览器不原生支持，但 hls.js 支持：

```ts
const hls = new Hls();
hls.loadSource("/api/sample-stream/index.m3u8");
hls.attachMedia(video);
```

3. 两者都不支持：

页面状态显示：

```text
360 video: stream unsupported
```

当前页面有两个源切换按钮：

```text
Use HLS Stream
Use MP4 File
```

切换源时会销毁旧的 HLS 实例，暂停 video，清空 src，再加载新的源，避免旧 segment 请求继续挂着。

## 桌面模拟器与真实 WebXR 的区别

当前页面有两套视角控制路径：

- `Start Simulator`：
  - 项目自带桌面双眼预览。
  - 鼠标拖拽、WASD、方向键改变虚拟 camera yaw/pitch。
  - 适合快速验证 360 球幕、视频纹理、HLS 播放。

- `Enter VR`：
  - 浏览器 WebXR session。
  - 头显姿态由浏览器 / Quest Browser / WebXR DevTools 面板控制。
  - 代码不再在 WebXR presenting 时覆盖 camera yaw/pitch，避免干扰真实头显 pose。

如果在 WebXR DevTools 里移动 controller，画面视角不会改变；需要改变 headset/device pose，尤其是 rotation/yaw/pitch。

## 页面状态与日志

页面会展示几个关键状态：

```text
Secure: OK/NO
navigator.xr: OK/NO
immersive-vr: checking/supported/unsupported/error
360 video: loading/ready/playing/stream ready/stream error/blocked
source: MP4 file/HLS stream
```

日志列表使用结构化 entry：

```ts
type XrLogEntry = {
  id: number;
  line: string;
};
```

这样即使同一秒内出现重复日志文本，也不会再触发 React duplicate key warning。

## 缓存清理与开发流程

Next dev server 和 `.next` 构建产物容易出现状态错位。曾经遇到过：

```text
__webpack_modules__[moduleId] is not a function
```

以及页面只出现 SSR 初始文案、不出现 canvas、不水合的问题。

当前推荐开发流程：

```powershell
npm.cmd run reset:web
npm.cmd run typecheck:web
npm.cmd run build:web
npm.cmd run reset:web
npm.cmd --workspace apps/web run dev -- --port 3000 --hostname 127.0.0.1
```

日常只启动开发服务也可以用：

```powershell
npm.cmd run dev:web:reset
```

`reset:web` 会处理：

```text
关闭 3000/3001 端口上的旧服务
删除 apps/web/.next
删除 apps/web/tsconfig.tsbuildinfo
删除 apps/web/test-results
删除 apps/web/playwright-report
```

## 自动化验证

当前 smoke 测试覆盖 5 条用例：

```text
1. /api/sample-video 支持 MP4 Range 请求
2. /api/sample-stream 可返回 HLS playlist，并支持 TS segment Range 请求
3. /xr/hello 可显示 canvas，并启动桌面双眼 360 播放
4. /xr/hello 可从 MP4 切换到 HLS stream
5. /xr/hello?mock-xr=1 可完成 mock Enter VR
```

运行命令：

```powershell
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:3000'
npm.cmd --workspace apps/web run smoke:webxr
```

最近一次验证结果：

```text
5 passed
```

## 当前限制

这一阶段是播放端能力验证，不是最终产品形态。当前仍有这些限制：

- 只有一条本地样片。
- HLS 是 VOD 伪串流，不是真实 live stream。
- HLS 只有单码率，没有 adaptive bitrate ladder。
- 还没有绑定真实视频库中的 `videoId`。
- 还没有把 WebXR 裁剪路径采样和视频播放时间完整联动。
- 还没有 Quest 真机端的长时间稳定性测试记录。
- WebXR DevTools 模拟器与 Three.js 新 layers API 仍依赖 fallback。

## 下一阶段建议

建议下一阶段从“播放验证”进入“裁剪交互验证”：

1. 在 WebXR 内读取真实 `videoId/sessionId`。
2. 将当前 360 播放组件抽成可复用播放器。
3. 记录每帧或固定频率下的 camera yaw/pitch/roll。
4. 以 5Hz 上传 view path patch 到后端。
5. 在移动端视频详情页显示 session 状态和裁剪进度。
6. 用同一段 360 视频跑一次端到端：上传、进入 WebXR、播放、取景、上传路径、后端导出。

当前阶段已经证明：WebXR 播放端可以稳定渲染 Three.js 场景，可以播放本地 360 MP4，也可以播放本地转码得到的 HLS 伪串流，并且这些能力已经进入自动化 smoke 测试覆盖。
