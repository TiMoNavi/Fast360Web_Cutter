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
/mobile/videos
我的视频列表。显示上传中、可裁剪、裁剪中、已完成、失败状态。

/mobile/videos/:videoId
视频详情。显示视频元数据、WebXR 入口、当前裁剪 session、分钟级进度。

/mobile/exports/:exportId
导出详情。显示最终 MP4 状态和下载按钮。
```

## 页面细化

### /mobile/videos

核心区块：

```text
顶部上传入口
上传中队列
我的视频列表
每个视频的状态徽标
进入详情按钮
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
/xr/videos/:videoId/session/:sessionId
```

如果没有现有 session，视频详情页先请求后端创建 session，再展示入口。

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
已建立安卓端路由：/mobile/videos。
已建立登录/注册路由：/mobile/login。
已建立视频详情路由：/mobile/videos/[videoId]。
已建立导出详情路由：/mobile/exports/[exportId]。
已建立全局占位样式和 PlaceholderPage 组件。
已建立前端 API client：apps/web/src/lib/api.ts。
已建立认证组件：AuthForm。
已建立最小上传组件：VideoUploadForm。
已建立 WebXR session 创建/入口组件：XrSessionLink。
已建立移动端详情页里的 CutSessionControls，可创建 session 并进入 WebXR。
已建立导出状态读取和 ready 后下载按钮。
已下载本地参考项目：shadcn-ui、uppy、tus-js-client、vidstack-player。
前端 build 已通过。
本地 Web 服务已可访问：http://localhost:3000。
```

部分完成：

```text
注册/登录已接入真实后端 cookie session，移动端页面会在未登录时跳转 /mobile/login。
GET /api/videos 已接入真实后端列表。
POST /api/videos/upload 已接入最小上传闭环，文件会写入后端 SQLite 和 storage/videos。
/mobile/videos/[videoId] 已能读取真实视频详情。
视频详情页已能创建 WebXR cut session，并生成 /xr/videos/:videoId/session/:sessionId 入口链接。
/mobile/exports/[exportId] 已能读取导出状态，ready 后可下载 MP4。
WebXR 固定环绕测试完成后，安卓端详情页能看到 latestExport 和下载入口。
页面仍以占位 UI 为主，尚未进入正式移动端界面打磨。
上传技术栈已确定，但当前只接 FastAPI UploadFile，Uppy / tus-js-client 尚未接入页面。
二维码入口已规划，但 qrcode 尚未安装和实现。
分钟级状态已有后端接口，但安卓端展示还需要继续细化。
```

未开始：

```text
WebXR 入口二维码生成。
裁剪进度轮询的正式 UI。
放弃 session 操作。
上传进度、错误提示、文件大小限制和断点续传。
```

## 当前完成度

```text
框架搭建：70%
占位页面：70%
真实业务功能：45%
上传链路：35%
状态/下载链路：35%
```

## 下一步规划

优先级 1：把移动端页面从占位状态推进到可用 MVP。

```text
完善 /mobile/videos 的列表布局、空状态、上传成功刷新和错误状态。
完善 /mobile/videos/:videoId 的视频元数据、session 状态、WebXR 入口和最近导出信息。
确认 WebXR 端读取的是同一个 videoId 和 sessionId。
```

优先级 2：增强 MVP 上传。

```text
保留 FastAPI UploadFile 作为当前 MVP。
增加上传进度、失败提示、类型/大小限制。
之后再升级为 Uppy + tus-js-client + tusd。
```

优先级 3：接入二维码和任务控制。

```text
生成 Quest 可扫码打开的二维码。
显示 session 分钟级状态。
增加放弃当前 session 操作。
```

优先级 4：接入下载。

```text
把当前导出下载从 JSON/按钮占位整理成移动端正式 UI。
在视频详情页和导出详情页之间补更清晰的返回路径。
失败时显示后端错误原因。
```
