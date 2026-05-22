# 视频上传下载模块预期

## 职责

视频上传下载模块负责文件进入系统和导出文件流出系统。它不负责视频列表筛选，也不解释 WebXR 路径。

它负责：

```text
接收源 360 视频上传。
校验文件类型和大小。
保存源文件。
读取源视频 metadata。
清理失败上传的残留文件。
提供 export MP4 下载。
保证下载路径不能逃逸 storage/exports。
```

## 上传输入

```text
当前用户 user_id。
上传文件。
original_filename。
content_type。
文件大小。
```

## 上传输出

```text
storage/videos/{videoId}{suffix}
视频 metadata。
给视频列表模块创建或更新 videos 记录所需的数据。
```

## 下载输入

```text
当前用户 user_id。
exportId。
```

## 下载输出

```text
video/mp4 文件响应。
downloadReady 状态。
失败原因。
```

## 后续目标

第一版可以保留普通 `UploadFile`，但长期应支持：

```text
Uppy。
tus-js-client。
tusd 或后端 tus endpoint。
断点续传。
上传进度。
上传失败重试。
对象存储。
```

## 不应承担的职责

上传下载模块不应该：

```text
决定视频是否出现在列表。
创建 WebXR session。
保存取景路径。
调度裁切任务。
解释 EffectEvent。
```
