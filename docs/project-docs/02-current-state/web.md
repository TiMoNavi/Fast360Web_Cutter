# Web 当前状态

## 代码位置

当前 Web 模块位于：

```text
apps/web
```

平面前端使用 Next.js App Router。`/mobile/*` 是普通 Web / 移动 Web 的主路径，`/xr/*` 是 WebXR 和实验入口。

## 已建立的主要路由

```text
/mobile/login
登录 / 注册页，支持 next 回跳和已登录继续。

/mobile/videos
视频库首页，包含公共示例、上传入口、视频统计、视频列表、源视频下载和最新导出入口。

/mobile/demo/:sampleId
公共示例详情页，包含 360 预览、教程、来源说明、登录后加入账号或进入 WebXR。

/mobile/videos/:videoId
视频详情页，包含 360 预览、元数据、WebXR 入口二维码、session 操作和最新导出入口。

/mobile/account/exports
导出记录页，包含导出统计、最新导出、状态、失败原因、源视频返回、下载和分享。

/mobile/exports/:exportId
导出详情页，包含输出预览、导出元数据、失败原因、下载和返回路径。

/mobile/favorites
收藏/快速访问页。当前展示 ready 优先的视频候选和可下载导出，不是后端持久化收藏。

/mobile/account/settings
账号设置占位页，列出账号资料、默认导出设置和 WebXR 偏好。

/xr/player
当前 WebXR PC editor 主入口。

/xr/videos
WebXR 侧视频列表/兼容入口。

/xr/videos/:videoId/session/:sessionId
过渡期显式 session 深链，保留给调试和少量自动化测试，不作为产品按钮默认入口。
```

## 已有关键组件

```text
MobileShell
移动端外壳、侧边导航、账号菜单和登录/登出入口。

AuthForm
登录 / 注册表单，支持测试账号填充和 nextPath 登录后跳转。

VideoUploadForm
视频上传表单，支持扩展名校验、约 2GB 大小提示、XHR 上传进度和上传后刷新。

DemoVideoShowcase
公共示例视频列表、教程入口和公开入口二维码。

DemoStartButton
调用后端把公共示例加入账号，并跳转 WebXR 或视频详情。

Video360Preview
基于 Three.js 的普通 360 视频预览，可播放、拖动看方向和重置视角。

QuestQrCode
基于 qrcode 生成 Quest 可扫码打开的二维码。

CopyLinkButton
复制 WebXR 或公开入口链接。

SessionActions
创建 session、激活当前视频的 WebXR session、进入 /xr/player、放弃当前 session。

StatusBadge
统一展示视频、session、export 状态。

ShareButton
在支持 Web Share API 时分享导出 MP4；否则退化为下载链接。

LogoutButton
登出并回到 /mobile/login。

PcWebXrEditor
WebXR PC editor 的 A-Frame 播放、取景、timeline bridge 和工作台组合组件。
```

历史组件仍存在，例如 `CutSessionControls`、`XrSessionLink`、`FixedOrbitRenderButton`，但当前平面前端主页面已经转向 `MobileShell`、`SessionActions` 和新的 vapor UI。
其中 `XrSessionLink` / `XrPlayerEntryButton` 会先调用 `/api/xr/player-session` 激活目标视频，再跳转 `/xr/player`。

## 已接入后端的能力

当前已经接入真实后端：

```text
注册 / 登录 / 登出。
cookie session。
GET /api/auth/me。
GET /api/demo-videos。
GET /api/demo-videos/:sampleId/stream。
POST /api/demo-videos/:sampleId/start。
GET /api/videos。
POST /api/videos/upload。
GET /api/videos/:videoId。
GET /api/videos/:videoId/download。
POST /api/videos/:videoId/thumbnail。
POST /api/cut-sessions。
GET /api/cut-sessions/:sessionId/status。
POST /api/cut-sessions/:sessionId/abandon。
GET /api/exports。
GET /api/exports/:exportId。
GET /api/exports/:exportId/download。
```

受保护页面在未登录时会跳转 `/mobile/login`。`/mobile/videos` 允许未登录用户浏览公共示例，但上传、个人视频列表、加入示例和导出记录需要登录。

## 当前页面状态

`/mobile/login` 当前可以：

```text
展示品牌化登录页。
支持登录 / 注册切换。
支持 next 参数，且会过滤外链和协议型跳转。
已登录时展示“继续”入口。
提供演示账号填充按钮。
```

`/mobile/videos` 当前可以：

```text
读取公共示例。
展示公开视频入口二维码。
登录后同时读取视频列表和导出列表。
展示素材总数、ready 数、可下载导出数和源文件总量。
上传视频并显示上传进度。
展示缩略图、状态、时长、规格、大小、帧率、更新时间。
进入视频详情。
下载源视频。
下载同视频的最新 ready 导出。
进入导出记录。
未登录时展示登录引导而不是直接报错。
```

`/mobile/demo/:sampleId` 当前可以：

```text
展示公共示例的 360 预览。
展示时长、规格、布局、难度、标签、教程步骤和素材来源。
生成当前教程二维码。
登录后调用 start demo，把示例加入账号。
可跳转 WebXR 或加入后回到视频详情。
```

`/mobile/videos/:videoId` 当前可以：

```text
读取视频详情。
展示 Three.js 360 预览。
展示可读元数据表，已不再直接显示原始 JSON。
下载源视频。
生成 /xr/player 的 Quest 二维码和复制链接。
读取最新 session 状态。
创建 session。
进入 WebXR；产品按钮会创建或激活当前视频的 session 后进入 /xr/player。
直接打开 /xr/player；会先按当前 videoId 切换 active session。
放弃当前 session。
展示最新 export 状态、失败原因、导出详情和下载入口。
```

`/mobile/account/exports` 当前可以：

```text
读取全部导出和视频列表。
展示导出总数、可下载数、失败数和导出文件总量。
展示最新导出 callout。
展示每个导出的源视频封面或 MP4 占位图。
展示状态、大小、源规格、更新时间和失败原因。
返回源视频详情。
进入导出详情。
下载或分享 ready 导出。
```

`/mobile/exports/:exportId` 当前可以：

```text
读取导出状态和导出列表中的汇总信息。
ready 时用 video 标签预览输出 MP4。
未 ready 时展示输出占位和状态。
展示导出 ID、session ID、video ID、源文件名、源时长、源规格、创建/更新时间。
展示失败原因。
返回导出记录。
返回源视频。
下载裁剪 MP4。
```

`/mobile/favorites` 当前可以：

```text
读取视频列表和导出列表。
优先选择 ready_for_xr 视频，再补其他视频，最多展示 6 个候选。
展示第一个候选视频的 360 预览。
展示候选视频卡片、详情入口和导出下载入口。
展示最多 4 个 ready 导出。
```

当前收藏页是“快速访问/收藏候选”实现，还没有用户主动收藏、取消收藏和后端持久化。

## 当前上传状态

当前上传使用：

```text
FastAPI UploadFile。
FormData。
XMLHttpRequest upload progress。
前端扩展名校验。
约 2GB 大小提示。
上传成功后 router.refresh() 刷新列表。
```

还没有：

```text
Uppy。
tus-js-client。
断点续传。
上传队列。
取消上传。
失败重试按钮。
后台上传记录 UI。
```

## 当前 WebXR 入口状态

当前已经实现了二维码，但入口策略仍处在过渡期：

```text
详情页展示 /xr/player 的二维码和复制链接。
详情页“打开 WebXR”按钮会先激活当前视频的 player session，再进入 /xr/player。
SessionActions 创建并进入时跳转 /xr/player，后端会把创建的 session 设为 active session。
SessionActions / CutSessionControls 的“直接打开/直接进入”也会先按当前 videoId 切换 active session。
XrSessionLink 用于 /xr/videos 卡片入口，同样先切 active session，再进入 /xr/player。
/xr/videos/:videoId/session/:sessionId 仍作为显式 session 深链和测试兼容入口存在。
```

下一步需要减少显式 session 深链在产品 UI 里的可见度，把它保留给调试和自动化测试；产品侧继续围绕 `/xr/player` 和后端 active session 展开。

## 当前缺口

Web 模块主要缺口：

```text
收藏页还没有真实收藏数据模型、后端 API 和收藏/取消收藏按钮。
session 分钟级状态还没有做成正式进度视图，也没有前端轮询。
/xr/player 的 active video/session 基础链路已经打通，但 active session 的 effect/export 摘要展示、切换前 flush/提示策略仍需补强。
上传没有断点续传、队列、取消和失败重试。
账号设置仍是占位页。
导出分享依赖浏览器能力，完整跨端分享体验仍需验证。
视频详情中的 session 状态仍较粗，需要展示 minuteStatuses、dirty/failed/discarded/done 统计。
```

## 需要继续保持的边界

当前 Web 端没有生成真实 ViewPathPatch，这是正确方向。后续也应保持：

```text
Web 不生成路径。
Web 不解释 yaw / pitch / FOV。
Web 不做手机陀螺仪裁剪。
Web 不执行 360 投影或最终裁剪。
Web 的 360 预览只用于查看源素材，不作为裁剪工具。
Web 只展示状态、入口、下载和轻量管理动作。
```

## 建议下一步

```text
1. 为收藏补后端持久化模型和 API，再把 /mobile/favorites 从候选页升级为真实收藏页。
2. 继续收敛 WebXR 产品入口：保留 /xr/player，减少 /xr/videos/:videoId/session/:sessionId 在产品 UI 中的可见度。
3. 把 session 状态做成分钟级进度视图，展示 done / dirty / failed / discarded 统计并加入轮询。
4. 上传补取消、失败重试和更清晰错误反馈，再升级 Uppy/tus。
5. 把 /mobile/account/settings 从占位页推进到账号和默认导出参数设置。
```
