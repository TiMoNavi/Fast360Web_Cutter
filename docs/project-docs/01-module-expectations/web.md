# Web 模块预期

## 定位

Web 模块是普通浏览器和移动浏览器入口。它是素材入口和结果出口，不做裁剪，不生成取景路径。

```text
Web = 登录 + 上传 + 我的视频 + WebXR 入口 + 状态 + 下载
```

当前项目把普通 Web 和移动 Web 放在同一个 Next.js app 中，路径主要是：

```text
/mobile/*
```

这里的“移动端”第一版指移动网页，不是原生 Android App。

## 核心职责

Web 模块负责：

```text
注册 / 登录 / 登出。
上传 360 MP4。
展示“我的视频”。
展示视频元数据。
创建或进入 WebXR cut session。
展示 Quest 可打开的 WebXR 链接或二维码。
轮询 session 和 minute segment 状态。
展示最近导出。
下载最终 MP4。
放弃当前裁剪 session。
```

## 用户页面

目标页面：

```text
/mobile/login
登录和注册。

/mobile/videos
我的视频列表和上传入口。

/mobile/videos/:videoId
视频详情、WebXR 入口、session 状态、导出入口。

/mobile/exports/:exportId
导出详情、失败原因、下载按钮、返回视频详情。
```

## 上传预期

第一版可以继续使用普通表单上传，但目标状态应支持大文件移动网络场景：

```text
上传进度。
失败重试。
文件类型校验。
文件大小限制提示。
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

视频详情页应生成稳定的入口：

```text
/xr/videos/:videoId/session/:sessionId
```

如果没有 session：

```text
先请求后端创建 session。
保存默认 ClipEditConfig。
再展示链接和二维码。
```

如果已有最新 session：

```text
展示当前 session 状态。
允许重新进入 WebXR。
允许查看最新 export。
```

二维码用于 Quest Browser 扫码或在同一局域网中打开。

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
```

## 成功标准

Web 模块达到预期时，应满足：

```text
手机浏览器能上传 360 MP4。
上传失败能重试。
上传完成后 WebXR 端能读取同一个 videoId。
视频详情页能创建 session 并展示二维码。
WebXR 上传路径后，Web 端能看到分钟级进度。
导出成功后 Web 端能下载 MP4。
页面没有任何误导用户在手机端裁剪的入口。
```
