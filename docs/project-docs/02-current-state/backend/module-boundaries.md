# Backend 当前代码拆分状态

## 当前事实

当前后端功能已经按业务概念形成了多个边界，但代码还没有完全按边界拆开。

主要集中点：

```text
apps/api/app/main.py
路由、认证、上传、session、patch、render-test 和下载混在一起。

apps/api/app/storage.py
SQLite schema、数据库 helper、响应组装、patch 保存和部分文件 helper 混在一起。

apps/api/app/models.py
所有 Pydantic 模型集中在一个文件。
```

已经比较独立的部分：

```text
apps/api/app/rendering/
渲染相关代码已经从 main.py / storage.py 中分出一层。
```

## 当前风险

```text
新增功能时容易继续扩大 main.py。
storage.py 同时承担 schema、repository 和部分业务 helper。
WebXR bridge 和视频裁切之间边界不够硬。
render-test 作为开发接口容易被误认为正式导出管线。
EffectEvent 自定义名称需求如果直接塞进渲染器，可能污染事件协议。
```

## 建议拆分顺序

```text
1. 拆 routes：
auth、videos、cut_sessions、exports。

2. 拆 repositories：
users、videos、cut_sessions、view_paths、effect_events、exports、minute_segments。

3. 拆 services：
auth_service、video_transfer_service、video_library_service、webxr_bridge_service、video_cutting_service。

4. 拆 contracts：
auth、videos、webxr、exports。

5. 保持 rendering 作为黑盒：
只接收 RenderPathPoint[] 和 EffectEvent[]。
```

## 拆分时必须保留

```text
现有注册登录闭环。
现有上传和视频列表闭环。
现有 cut session 创建。
现有 ViewPathPatch replaceRange 覆盖语义。
现有 EffectEventsPatch 独立时间线。
现有 render-test smoke 能力。
现有 export 下载能力。
```
