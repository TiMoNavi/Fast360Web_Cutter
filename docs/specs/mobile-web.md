# 安卓端网页规划

> 历史资料提示：本文件保留作为旧阶段模块规格材料。当前整理版入口见 [`../project-docs/README.md`](../project-docs/README.md)。若有冲突，以 `project-docs/` 和当前代码为准。

## 定位

安卓端网页是素材入口和结果出口。它不做取景、不做陀螺仪裁剪、不生成 `ViewPathPatch`。

```text
用户在手机浏览器打开网站
上传 360 MP4
查看“我的视频”
生成 Quest / WebXR 入口链接或二维码
查看后端裁剪进度
下载最终 MP4
```

## 技术选型

```text
框架：React / Next.js
UI：shadcn/ui + Tailwind
上传 UI：Uppy
断点续传：tus-js-client
上传服务：tusd 或后端封装的 tus endpoint
状态请求：REST API
二维码：qrcode 或同类轻量库
普通视频预览可选：Vidstack 或 Plyr
```

第一版不做原生 Android App，直接做移动端 Web。

## 可利用的开源项目

直接集成：

```text
shadcn/ui：
用于按钮、卡片、表单、进度条、弹窗、空状态、移动端布局。

Uppy：
用于上传面板、上传队列、进度、暂停/恢复、失败重试。

tus-js-client：
用于浏览器断点续传，特别适合手机网络上传大体积 360 MP4。

qrcode：
用于生成 Quest / WebXR 入口二维码。
```

参考或可选：

```text
Vidstack / Plyr：
用于安卓端普通 2D 视频预览或导出结果预览。
第一版如果没有预览需求，可以只保留下载。

Mantine：
如果 shadcn/ui 的移动端表单实现成本偏高，可以参考 Mantine 的表单和弹窗体验。
```

界面风格建议：

```text
安静、工具型、移动优先。
首页直接进入“我的视频”，不要做营销 landing page。
上传状态、裁剪状态、下载入口必须一眼可见。
```

## 共享数据库约束

安卓端网页和 WebXR 端共用同一个后端数据库，不各自维护视频列表。

安卓端写入或读取的共享数据：

```text
users：
当前用户身份。

videos：
上传视频记录、源文件地址、视频元数据、处理状态。

cut_sessions：
某个视频的 WebXR 裁剪 session。

minute_segments：
后端每分钟裁剪状态。

exports：
最终导出文件。
```

安卓端上传完成后，必须让 WebXR 端通过同一个 `videoId` 读取到该视频。

## 页面

```text
/mobile/login
登录 / 注册。支持 next 回跳。

/mobile/videos
视频库首页。显示公共示例、上传入口、视频统计、视频列表、源视频下载和最新导出入口。

/mobile/demo/:sampleId
公共示例详情。显示 360 预览、教程、素材来源；登录后可加入账号并进入 WebXR。

/mobile/videos/:videoId
视频详情。显示 360 预览、视频元数据、WebXR 入口、当前裁剪 session、导出入口和下载。

/mobile/account/exports
导出记录。显示全部导出、状态、失败原因、源视频返回、下载和分享入口。

/mobile/exports/:exportId
导出详情。显示最终 MP4 状态、输出预览、失败原因和下载按钮。

/mobile/favorites
收藏/快速访问。目标是用户主动收藏的视频和导出。

/mobile/account/settings
账号设置、默认导出参数和 WebXR 偏好。
```

## 页面细化

### /mobile/videos

核心区块：

```text
公共示例入口
顶部上传入口
上传进度
我的视频列表
每个视频的状态徽标
进入详情按钮
源视频下载按钮
最新导出下载按钮
```

视频卡片字段：

```text
缩略图或占位图
文件名
时长
分辨率
上传状态
最近一次裁剪状态
```

### /mobile/videos/:videoId

核心区块：

```text
普通 360 预览
视频基本信息
Quest WebXR 入口二维码
复制 WebXR 链接按钮
当前裁剪 session 状态
分钟级进度列表
导出结果入口
放弃当前 session 按钮
```

### /mobile/exports/:exportId

核心区块：

```text
导出状态
输出参数
下载按钮
失败原因
重新进入 WebXR 修改按钮
```

### /mobile/favorites

核心区块：

```text
收藏的视频
收藏的导出
快速回到视频详情
快速进入 WebXR
下载 ready 导出
```

## 功能清单

必须做：

```text
选择本地 360 MP4
断点续传上传
上传进度和失败重试
我的视频列表
视频详情
WebXR 入口链接
WebXR 入口二维码
裁剪 session 状态轮询
分钟级裁剪进度展示
最终 MP4 下载
放弃整个裁剪 session
```

不做：

```text
安卓端裁剪
手机陀螺仪取景
手机端时间线编辑
手机端 360 预览裁剪
手机端生成 ViewPathPatch
```

## 数据依赖

安卓端主要读取：

```text
GET /api/videos
GET /api/videos/:videoId
GET /api/cut-sessions/:sessionId/status
GET /api/exports/:exportId/download
```

安卓端主要写入：

```text
POST /api/videos/upload 或 tus upload endpoint
POST /api/cut-sessions
POST /api/cut-sessions/:sessionId/abandon
```

WebXR 入口生成规则：

```text
/xr/player
```

如果没有现有 session，视频详情页先请求后端创建 session，再把 active video/session 写入后端或 WebXR player model，最后展示 `/xr/player` 链接和二维码。

`/xr/videos/:videoId/session/:sessionId` 仍可作为过渡期显式 session 深链、兼容入口或 E2E 测试入口，但不再作为长期产品链接。

创建 session 时应提交或使用默认 `ClipEditConfig`：

```text
output：16:9，1920x1080，30fps。
defaults.hFov：82。
pathPolicy：5Hz 记录、100ms 量化、2s 上传。
```

## 状态展示

视频状态：

```text
uploading
uploaded
ready_for_xr
cutting
export_ready
failed
```

裁剪分钟状态：

```text
collecting
ready
rendering
done
dirty
failed
discarded
```

安卓端只负责展示状态，不解释路径内容。

## MVP 验收

```text
手机浏览器可以上传一个 360 MP4。
上传中断后可以继续上传。
上传完成后视频出现在“我的视频”。
WebXR 端能用同一个账号/用户看到该视频。
视频详情页可以展示 WebXR 二维码。
WebXR 端完成路径上传后，安卓端能看到分钟级进度变化。
导出完成后安卓端能下载 MP4。
安卓端没有任何裁剪入口或陀螺仪裁剪控件。
```

---

## 当前情况

已完成：

```text
已建立 Next.js 前端骨架：apps/web。
已建立登录/注册路由：/mobile/login。
已建立视频库路由：/mobile/videos。
已建立公共示例详情路由：/mobile/demo/[sampleId]。
已建立视频详情路由：/mobile/videos/[videoId]。
已建立导出记录路由：/mobile/account/exports。
已建立导出详情路由：/mobile/exports/[exportId]。
已建立收藏/快速访问路由：/mobile/favorites。
已建立账号设置占位路由：/mobile/account/settings。
已建立前端 API client：apps/web/src/lib/api.ts。
已建立移动端外壳：MobileShell。
已建立认证组件：AuthForm。
已建立带 XHR 进度、扩展名校验和大小提示的视频上传组件：VideoUploadForm。
已建立公共示例组件：DemoVideoShowcase / DemoStartButton。
已建立普通 360 预览组件：Video360Preview。
已建立 Quest 二维码组件：QuestQrCode。
已建立 session 操作组件：SessionActions，可创建、进入和放弃 session。
已建立导出记录、导出详情、下载和分享入口。
qrcode 已安装并用于入口二维码。
页面已从占位 UI 推进到当前 vapor 风格的可用 MVP UI。
```

部分完成：

```text
注册/登录已接入真实后端 cookie session。
/mobile/videos 支持未登录浏览公共示例，登录后读取个人视频和导出列表。
GET /api/videos 已接入真实后端列表。
GET /api/demo-videos 和 POST /api/demo-videos/:sampleId/start 已接入公共示例流程。
POST /api/videos/upload 已接入上传闭环，文件会写入后端 SQLite 和 storage/videos。
/mobile/videos/[videoId] 已能读取真实视频详情、latestSession 和 latestExport。
视频详情页已生成 /xr/player 二维码和复制链接。
创建并进入 WebXR 的按钮仍使用 /xr/videos/:videoId/session/:sessionId 过渡深链。
/mobile/account/exports 和 /mobile/exports/[exportId] 已能读取导出状态，ready 后可预览或下载 MP4。
POST /api/cut-sessions/:sessionId/abandon 已接入详情页。
分钟级状态已有后端接口，但移动端展示还需要继续细化为进度视图和轮询。
```

未开始 / 仍需补齐：

```text
收藏页的真实收藏数据模型、后端 API、收藏/取消收藏按钮。
/xr/player 的 active video/session 模型完全打通。
裁剪进度轮询的正式 UI。
Uppy / tus-js-client / 断点续传。
上传队列、取消上传和失败重试按钮。
账号设置的真实功能。
```

## 当前完成度

```text
框架搭建：85%
移动端 MVP UI：70%
真实业务功能：65%
上传链路：55%
状态/下载链路：60%
收藏链路：20%
```

## 下一步规划

优先级 1：把收藏从候选页升级为真实用户收藏。

```text
补 favorite 数据模型。
补收藏/取消收藏 API。
在视频卡片、视频详情和导出卡片上补收藏按钮。
让 /mobile/favorites 展示用户主动收藏结果。
```

优先级 2：统一 WebXR 入口。

```text
创建 session 后默认进入 /xr/player。
把 activeVideoId / activeSessionId 写入后端或 WebXR player model。
保留 /xr/videos/:videoId/session/:sessionId 作为兼容深链和 E2E 入口。
```

优先级 3：增强状态展示。

```text
把 session minuteStatuses 做成进度视图。
显示 done / dirty / failed / discarded 统计。
增加前端轮询。
```

优先级 4：增强上传。

```text
保留 FastAPI UploadFile 作为当前 MVP。
补取消上传、失败重试和更清晰错误反馈。
之后再升级为 Uppy + tus-js-client + tusd。
```
