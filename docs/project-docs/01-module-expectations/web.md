# Web 模块预期

## 定位

Web 模块是普通浏览器和移动浏览器入口。它负责素材进入、WebXR 交接、状态查看和成片下载；不负责真正裁剪，不生成取景路径。

```text
Web = 登录 + 示例引导 + 上传 + 我的视频 + 视频详情 + 收藏/快速访问 + WebXR 入口 + 状态 + 下载
```

当前项目把普通 Web、移动 Web 和 WebXR 入口放在同一个 Next.js app 中。平面前端的产品路径主要是：

```text
/mobile/*
```

这里的“移动端”第一版指移动网页，不是原生 Android App。桌面浏览器也可以打开这些页面完成上传、管理和下载。

## 核心职责

Web 模块负责：

```text
注册 / 登录 / 登出。
登录后按 next 参数回到原目标页。
展示公共 360 示例和上手教程。
把公共示例加入当前账号的视频库。
上传 360 视频文件并展示上传进度。
展示“我的视频”列表、缩略图、基础元数据和最新导出入口。
展示视频详情、普通 360 预览和可读元数据。
创建或进入 WebXR cut session。
展示 Quest 可打开的 WebXR 链接、复制按钮和二维码。
轮询或刷新 session 和 minute segment 状态。
展示导出记录、最近导出、失败原因和下载入口。
展示用户收藏或常用视频/导出的快速访问页。
放弃当前裁剪 session。
```

## 用户页面

目标页面：

```text
/mobile/login
登录和注册。支持安全 next 跳转、已登录继续、演示账号辅助入口。

/mobile/videos
视频库首页。包含公共示例、上传入口、视频统计、视频列表、源视频下载和最新导出入口。

/mobile/demo/:sampleId
公共示例详情。展示示例预览、教程、来源说明；登录后可加入账号并进入 WebXR。

/mobile/videos/:videoId
视频详情。展示 360 预览、视频元数据、WebXR 入口二维码、session 操作和最新导出入口。

/mobile/account/exports
导出记录。展示全部导出、状态统计、失败原因、分享/下载入口和源视频返回路径。

/mobile/exports/:exportId
导出详情。展示输出预览、导出元数据、失败原因、下载按钮、返回导出记录和源视频。

/mobile/favorites
我的收藏。目标状态应是用户主动收藏的视频和导出，而不是临时排序出的候选列表。

/mobile/account/settings
账号设置。集中管理账号、安全、默认导出参数和 WebXR 入口偏好。
```

## 登录预期

登录页应满足：

```text
未登录访问受保护页面时跳转 /mobile/login。
登录成功后回到安全校验过的 next 路径。
已登录用户能一键继续到目标页。
注册成功后直接建立 cookie session。
测试账号填充只服务开发/演示，不应成为正式安全机制。
```

受保护页面包括视频详情、导出记录、导出详情、收藏页和账号页。视频库首页可以允许未登录用户浏览公共示例，但上传、加入示例、进入个人视频库和导出下载必须要求登录。

## 视频库预期

`/mobile/videos` 应是平面前端的主工作台：

```text
展示公共示例，解决没有 360 素材时无法体验的问题。
展示账号视频总数、WebXR ready 数、可下载导出数和源文件总量。
提供上传入口和上传反馈。
以卡片展示缩略图、文件名、视频状态、时长、分辨率、帧率、大小、更新时间。
提供源视频下载、最新导出下载和详情入口。
空状态应明确提示上传或从示例开始。
未登录时仍可看示例，但个人视频列表显示登录引导。
```

## 视频详情预期

`/mobile/videos/:videoId` 应把“查看视频”和“交给 WebXR”放在同一页：

```text
展示可拖动查看的普通 360 预览，但不把它包装成手机端裁剪工具。
展示可读元数据表，不直接暴露大段调试 JSON。
展示源视频下载。
展示稳定的 WebXR 入口链接、复制按钮和 Quest 二维码。
展示当前或最新 session 状态。
展示创建 session、进入 WebXR、放弃 session 操作。
展示最新 export 状态、失败原因和下载入口。
```

## 收藏预期

收藏页的长期目标是用户主动维护的快速访问区：

```text
用户可以收藏 / 取消收藏视频。
用户可以收藏 / 取消收藏导出结果。
收藏状态应持久化到后端，而不是只由前端按 ready 状态临时筛选。
收藏页优先展示可继续编辑的视频、可下载成片和最近使用项目。
收藏卡片应能回到视频详情、进入 WebXR、查看导出或下载文件。
```

可选的数据形态：

```text
favorite_videos(user_id, video_id, created_at)
favorite_exports(user_id, export_id, created_at)
```

或统一收藏表：

```text
favorites(user_id, target_type, target_id, created_at)
```

## 上传预期

第一版可以继续使用普通上传和 XHR 进度，但目标状态应支持大文件移动网络场景：

```text
上传进度。
上传中禁用重复提交。
文件类型校验。
文件大小限制提示。
失败原因展示。
失败重试。
取消上传。
上传队列。
断点续传。
后台保存上传记录。
上传完成后视频立刻进入“我的视频”。
```

规划技术：

```text
Uppy
tus-js-client
tusd 或后端 tus endpoint
```

## WebXR 入口预期

视频详情页应生成稳定的 WebXR 产品入口：

```text
/xr/player
```

如果没有 session：

```text
先请求后端创建 session。
保存默认 ClipEditConfig。
把 activeVideoId / activeSessionId 写入后端或 WebXR player model。
再展示 /xr/player 链接和二维码。
```

如果已有最新 session：

```text
展示当前 session 状态。
允许重新进入 /xr/player。
允许查看最新 export。
```

后期不再把 `videoId/sessionId` 放进 WebXR 产品路径。`/xr/videos/:videoId/session/:sessionId` 可以作为过渡期兼容深链、显式 session 调试或 E2E 入口，但不应继续作为移动端生成的长期产品链接。

二维码用于 Quest Browser 扫码或在同一局域网中打开 `/xr/player`。

## 状态预期

Web 端只展示状态，不解释路径点。

应展示：

```text
视频状态。
session 状态。
每分钟分片状态。
dirty / failed / discarded / done 统计。
export 状态。
失败原因。
downloadReady。
```

Web 端不应解析：

```text
yaw。
pitch。
FOV 曲线。
head-gaze 细节。
controller input 细节。
```

## 不应承担的职责

Web 模块不应该：

```text
生成 ViewPathPatch。
用手机陀螺仪做裁剪。
直接访问 view_path_points。
调用 WebXR 内部组件函数完成业务。
执行 360 投影或最终裁剪。
把普通 360 预览误导成最终裁剪结果。
```

## 成功标准

Web 模块达到预期时，应满足：

```text
手机浏览器能上传 360 视频。
上传失败能重试。
上传完成后 WebXR 端能读取同一个 videoId。
公共示例能被加入账号并进入 WebXR。
视频详情页能创建 session 并展示 Quest 二维码。
WebXR 上传路径后，Web 端能看到分钟级进度。
导出成功后 Web 端能预览和下载 MP4。
收藏页展示用户主动收藏的视频和导出。
页面没有任何误导用户在手机端裁剪的入口。
```
