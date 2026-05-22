# 当前整体状态

## 当前阶段

项目当前处于开发 MVP 阶段。已经跑通了账号、上传、session、测试路径、后端 smoke render 和下载的最小闭环，但还没有完成真实 WebXR 裁剪体验和生产级渲染队列。

当前最小闭环：

```text
注册 / 登录
-> 移动 Web 上传 360 MP4
-> 创建 WebXR cut session
-> WebXR 业务页用测试按钮生成 ViewPathPatch
-> 后端保存路径点
-> render-test 逐帧 remap 导出 MP4
-> 移动 Web 查看状态并下载
```

这个闭环的意义是验证三端合同，不等同于最终产品体验。

## 当前仓库结构

```text
apps/web
Next.js 前端，包含 /mobile/* 和 /xr/*。

apps/api
FastAPI 后端，包含认证、上传、session、路径存储、render-test 和下载。

docs
原始架构、规格和记录文档。

scripts
本地清理、样片生成、WebXR Chrome 启动等开发脚本。

storage
本地数据库、上传视频、样片、导出结果和临时文件。
```

## 已经比较清楚的边界

```text
移动 Web 通过 API 做登录、上传、读取视频、创建 session、查看导出。
WebXR 播放入口已拆成真实 Quest 路径和桌面 lab 路径。
后端用数据库和文件系统管理 videos / sessions / path / exports。
后端渲染读取 ViewPathPoint 时间线，不读取前端组件状态。
fixture 视频接口已经被标记为开发用途。
```

## 仍在整理中的边界

```text
Mobile 和 WebXR 仍在同一个 Next.js app 中，需要继续避免组件互相耦合。
/xr/videos/:videoId/session/:sessionId 仍没有接入真实 MetaWebXrPlayer。
sample-video / sample-stream 仍是 /xr/hello 和 lab 的默认源。
render-test 仍是同步开发接口。
生产级任务队列、60 秒分片、dirty 重渲染还没有实现。
```

## 当前模块完成度粗略判断

```text
Web：
MVP 闭环可用，正式移动 UI 和大文件上传能力不足。

WebXR：
播放组件化完成一部分，真实裁剪交互未完成。

Backend：
协议存储和 smoke render 可用，生产级渲染队列未完成。
```

## 当前最重要的下一步

从产品角度，下一步重点不是继续写更多 demo，而是把真实业务 session 页接上已隔离的 WebXR 播放组件，再在播放层外加路径采样器。

推荐顺序：

```text
1. /xr/videos/:videoId/session/:sessionId 读取真实 video sourceUrl。
2. 把 source 传入 MetaWebXrPlayer 或更底层 source + VideoSphereScene。
3. 保持播放层纯净。
4. 新增独立 ViewPath sampler。
5. 让 sampler 输出 ViewPathPatch。
6. 后端继续强化 patch 校验。
7. 再推进 60 秒分片队列。
```
