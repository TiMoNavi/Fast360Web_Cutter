# 视频列表与元数据模块预期

## 职责

视频列表模块负责用户能看到哪些视频，以及每个视频对前端展示所需的元数据。它不负责文件上传细节，也不负责裁切渲染。

它负责：

```text
维护 videos 记录。
按 user_id 隔离视频列表。
返回我的视频。
返回视频详情。
附带 latestSession。
附带 latestExport。
提供 WebXR 播放所需 sourceUrl。
维护视频状态。
```

## 输入

```text
当前用户 user_id。
来自上传模块的视频 metadata。
videoId。
session/export 状态摘要。
```

## 输出

```text
VideoSummary[]
VideoDetail
sourceUrl
latestSession
latestExport
```

## 状态

视频状态应能表达：

```text
uploading
uploaded
ready_for_xr
cutting
export_ready
failed
```

第一版可以精简，但不应让 Web 前端自己推断这些状态。

## 不应承担的职责

视频列表模块不应该：

```text
直接处理 UploadFile 字节流。
生成 ViewPathPatch。
执行 render-test。
提供 export 文件流。
理解取景点序列。
```

## 与其他模块的关系

```text
上传下载模块：
提供源文件和 metadata。

WebXR 桥接模块：
读取 videoId / sessionId，并返回 sourceUrl 给 WebXR。

视频裁切模块：
更新 session/export 状态，供列表模块聚合展示。
```
