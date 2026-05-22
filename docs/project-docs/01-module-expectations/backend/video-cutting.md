# 视频裁切模块预期

## 职责

视频裁切模块负责把后端已经整理好的时间线转换成最终 MP4。它不接收前端组件状态，只读取协议展开后的数据库记录和源文件。

它负责：

```text
读取源 360 视频。
读取 ViewPathPoint 时间线。
读取 EffectEvent 时间线。
判断 minute segment 是否 ready。
创建渲染任务。
调度 worker。
执行 equirectangular -> flat remap。
处理 enabled=false 区间。
处理 cut=true 边界。
应用可渲染的效果事件。
写入 segment。
dirty 分片重渲染。
最终 concat。
维护 exports。
```

## 分片策略

生产级裁切应按固定窗口处理：

```text
chunkSeconds = 60
minuteIndex = floor(tMs / 60000)
```

目标状态：

```text
collecting
ready
rendering
done
dirty
failed
discarded
```

## 渲染输入

渲染器应接收：

```text
sourcePath
targetPath
durationMs
sourceStartMs
fps
outputWidth
outputHeight
RenderPathPoint[]
EffectEvent[]
```

## 渲染输出

```text
segment MP4。
最终 MP4。
渲染错误。
基础 metadata。
```

## 正式输出目标

```text
16:9
1920x1080
30fps
```

开发 smoke render 可以使用较低规格，但必须明确标记为开发接口。

## 不应承担的职责

视频裁切模块不应该：

```text
处理登录表单。
接收 UploadFile。
解析 WebXR 页面状态。
修改 ViewPathPatch 原始语义。
决定某个 video 是否属于某个用户。
```
