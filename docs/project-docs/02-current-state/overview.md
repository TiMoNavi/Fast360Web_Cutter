# 当前整体状态

## 当前阶段

项目当前处于开发 MVP 阶段。已经跑通了账号、上传、session、WebXR PC 取景、timeline patch、后端 smoke render、BGM mux 和下载的开发闭环，但还没有完成生产级渲染队列和 Quest 真机主流程验收。

当前最小闭环：

```text
注册 / 登录
-> 移动 Web 上传 360 MP4
-> 创建 WebXR cut session
-> /xr/player 或兼容 session 深链打开 PC WebXR Editor
-> PC crop mask / 键鼠 / 工作台生成 ViewPathPatch 和 EffectEventsPatch
-> 后端保存路径点、效果事件和播放状态
-> render-test 逐帧 remap 导出 MP4，可选 mux BGM
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
WebXR 已收敛到 `apps/web/src/features/webxr/pc-editor/` 的 A-Frame + PC 工作台实现，`/xr/player` 是当前主入口；legacy lab 仍保留用于 smoke 和能力对照。
后端用数据库和文件系统管理 videos / sessions / path / exports。
后端渲染读取 ViewPathPoint 时间线，不读取前端组件状态。
fixture 视频接口已经被标记为开发用途。
```

## 仍在整理中的边界

```text
Mobile 和 WebXR 仍在同一个 Next.js app 中，需要继续避免组件互相耦合。
`/xr/player` 已能通过后端 active session 恢复上次编辑；切换视频时会切换到目标视频自己的最近 session，或自动创建一个新 session。
`/xr/videos/:videoId/session/:sessionId` 仍被部分自动化测试使用；后期应降级为兼容深链或重定向到 `/xr/player`。
sample-video / sample-stream 仍是 /xr/hello、lab 和 /xr/aframe-player 的默认开发源。
render-test 仍是同步开发接口。
生产级任务队列、60 秒分片、dirty 重渲染还没有实现。
```

## 当前模块完成度粗略判断

```text
Web：
MVP 闭环可用，正式移动 UI 和大文件上传能力不足。

WebXR：
PC WebXR Editor 已接入真实 360 视频库、A-Frame 播放、crop mask、timeline bridge、effect event、BGM、render-test 和 `/xr/player` active session 数据层；Quest 真机输入适配仍需推进。

Backend：
协议存储和 smoke render 可用，生产级渲染队列未完成。
```

## 当前最重要的下一步

从产品角度，下一步重点不是继续写更多 demo，而是把 `/xr/player` 固化成唯一产品工作面，并把当前 `videoId/sessionId` 路由参数迁移到数据层或后端 active session。

推荐顺序：

```text
1. 增加 /xr/player authenticated smoke，并逐步迁移现有 /xr/videos/:videoId/session/:sessionId e2e。
2. 把 player model 的 session/music/effect/export 摘要展示到工作台 UI。
3. 为视频切换增加切换前 flush/保存/提示策略。
4. 继续把移动端、详情页和 demo flow 的产品入口统一到 /xr/player。
5. 继续保持播放器层、剪辑语义层和后端协议分离。
6. 后端继续强化 patch/effect/music 校验。
7. 再推进 Quest 真机 input adapter、60 秒分片队列和 dirty 重渲染。
```
