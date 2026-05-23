# Backend 模块边界预期

## 目标

后端代码应从“一个大入口文件 + 一个大 storage helper”逐步拆成清晰模块。目标不是为了形式上的微服务，而是让每个业务黑盒可以独立演进和测试。

## 推荐目录

```text
apps/api/app/routes/
auth.py
videos.py
cut_sessions.py
exports.py

apps/api/app/services/
auth_service.py
video_transfer_service.py
video_library_service.py
webxr_bridge_service.py
timeline_assembler_service.py
video_cutting_service.py

apps/api/app/repositories/
users.py
videos.py
cut_sessions.py
view_paths.py
effect_events.py
view_path_timelines.py
exports.py
minute_segments.py

apps/api/app/contracts/
auth.py
videos.py
webxr.py
exports.py

apps/api/app/rendering/
继续作为渲染器黑盒。
```

## 允许共享

```text
数据库连接 helper。
时间和 id helper。
配置读取。
错误类型。
基础存储路径配置。
```

## 不建议共享

```text
路由函数之间互相调用。
上传逻辑直接写路径点。
WebXR bridge 直接启动重型同步渲染。
WebXR bridge 直接把散点解释成最终可渲染 timeline。
渲染器直接查询用户表。
下载接口直接理解 ViewPathPatch。
```

## Timeline Assembler 边界

`timeline_assembler_service.py` 是 WebXR bridge 和 video cutting 之间的独立组件。

它负责：

```text
读取 ViewPathPatch / EffectEventsPatch 原始日志。
按 replaceRange、takeId、pathRevision 生成最终线性 ViewPathTimeline。
把 enabled=false、快进、慢放、倒放和跳过编译成 editSegments。
为分片渲染生成 RenderSlice。
检测网络波动导致的缺点、乱序、重复和局部丢失。
对小缺口做可追踪修复，对大缺口输出 TimelineBuildReport。
```

它不负责：

```text
接收 HTTP 请求。
管理登录和鉴权。
解码或编码视频。
执行 OpenCV / FFmpeg remap。
修改原始 patch 历史。
```

这样后端链路保持为：

```text
webxr_bridge_service
接收、校验、保存原始 patch。

timeline_assembler_service
把 patch 编译为 ViewPathTimeline。

video_cutting_service
按 ViewPathTimeline 分批裁剪和导出。
```

## 最小拆分顺序

```text
1. 先拆 routes，保持行为不变。
2. 再拆 repositories，把 SQL 从路由中移走。
3. 再拆 services，把业务规则从路由中移走。
4. 最后把 contracts 从 models.py 中分域拆开。
```

拆分时应保留现有 MVP 闭环，不为了架构整理打断上传、路径、render-test 和下载。
