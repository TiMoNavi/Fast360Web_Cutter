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
video_cutting_service.py

apps/api/app/repositories/
users.py
videos.py
cut_sessions.py
view_paths.py
effect_events.py
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
渲染器直接查询用户表。
下载接口直接理解 ViewPathPatch。
```

## 最小拆分顺序

```text
1. 先拆 routes，保持行为不变。
2. 再拆 repositories，把 SQL 从路由中移走。
3. 再拆 services，把业务规则从路由中移走。
4. 最后把 contracts 从 models.py 中分域拆开。
```

拆分时应保留现有 MVP 闭环，不为了架构整理打断上传、路径、render-test 和下载。
