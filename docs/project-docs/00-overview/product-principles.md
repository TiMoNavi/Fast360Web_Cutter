# 产品和工程原则

## 1. 三端职责必须清楚

```text
Web 端：
素材入口和结果出口。

WebXR 端：
唯一取景和裁剪意图入口。

Backend：
唯一正式裁剪和导出入口。
```

不要让某一端偷偷承担另一端的职责。短期 demo 可以有测试按钮，但长期文档和代码都应围绕这个边界收敛。

## 2. 前端只提交意图，不提交最终视频

WebXR 端可以高频更新本地预览，但持久化时只上传低频关键点：

```text
最多约 5Hz。
按视频时间轴记录 tMs。
使用 replaceRange 支持重放覆盖。
用 enabled / cut / locked / fov 表达剪辑语义。
```

前端不应该上传每一帧头显姿态，也不应该通过录屏生成正式结果。

## 3. 后端只读取稳定协议

后端正式导出应依赖：

```text
ClipEditConfig
ViewPathPatch 展开的 ViewPathPoint 时间线
EffectEventsPatch 展开的效果事件时间线
```

后端不应该依赖：

```text
React 组件状态
WebXR 页面是否仍在运行
播放倍速
预览亮度
遮罩透明度
桌面 lab 的 mock 状态
```

## 4. 播放和裁剪要分层

WebXR 内部也要保持分层：

```text
播放层：
视频源、HTMLVideoElement、VideoTexture、球幕、WebXR session。

裁剪层：
取景框、遮罩、头显/controller 输入、路径采样、patch 上传。

业务层：
videoId、sessionId、权限、状态、导出信息。
```

这样 `/xr/hello`、`/xr/playback-lab` 和真实业务 session 页可以复用播放能力，但不会互相污染。

## 5. fixture 和真实业务源要分开

本地样片接口只服务开发和 smoke：

```text
/api/sample-video
/api/sample-stream/[...path]
```

真实业务视频应来自后端 `videos` 或 `cut_sessions` 元数据返回的 `sourceUrl`。fixture 不能成为 WebXR 端的隐形视频库。

## 6. 测试闭环先验证正确性

当前 `render-test` 的价值是验证：

```text
yaw / pitch / FOV 是否能影响导出画面。
enabled=false 是否能丢弃片段。
cut=true 是否能形成边界。
replaceRange 是否能覆盖旧路径。
OpenCV remap 是否能正确做 equirectangular 到平面视角。
```

它不是生产导出管线。生产导出应继续走异步任务、60 秒分片、dirty 重渲染和最终 concat。

## 7. 文档应区分理想目标和当前事实

本项目很容易把计划、实验记录和当前实现混在一起。整理文档应始终区分：

```text
预期设计：
模块最终应该是什么样。

当前状态：
代码现在实际做到了什么。

缺口：
从当前状态到预期设计还差什么。
```
