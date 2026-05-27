# WebXR 模块预期

## 当前目标核心

WebXR 后期应收敛到一个稳定产品入口：

```text
/xr/player
apps/web/src/features/webxr/pc-editor/
```

`/xr/player` 负责承载真实业务视频、A-Frame 360 播放、PC 工作台、crop mask 预览、Meta XR 入口、timeline bridge、BGM、effects 和 export workflow。

后期不再把 `videoId/sessionId` 放进路由路径。页面应通过 server/data layer 或后端当前 session 状态取得 active video/session。`/xr/videos/:videoId/session/:sessionId` 只作为当前过渡期兼容深链或测试入口记录，不作为长期产品形态。

`/xr/player` 的 session 状态应由后端 API 维护，例如 `GET /api/xr/player-session` 恢复当前 active session，`PUT /api/xr/player-session { videoId }` 在视频列表切换时恢复或创建目标视频自己的 session。

## 文档索引

```text
pc-editor.md                 PC WebXR Editor 四层架构、路由收敛、控制层解耦
aframe-capabilities.md       A-Frame 能力和限制
aframe-timeline-bridge.md    A-Frame timeline bridge 与后端 patch 协议
input-and-sampling.md        输入、采样和 ViewPathPoint 生成规则
editor-workbench-ui.md       工作台 UI 的长期空间形态
spatial-player-ui.md         空间播放器 UI
crop-viewport-mask.md        取景遮罩与 FOV 预览
vaporwave-outrun-spatial-ui.md
spatial-glass-ui-references.md
deprecated-vision-glass-login.md
```

## 路由状态

长期产品入口：

```text
/xr/player
```

过渡期兼容或内部入口：

```text
/xr/videos
/xr/videos/:videoId/session/:sessionId
```

dev/legacy 页面，保留用于 smoke、能力对照或历史参考：

```text
/xr/aframe-player
/xr/player-ui-lab
/xr/playback-lab
/xr/hello
/xr/workbench
/xr/dev-check
/xr/login
/xr/three-official-interactive-lab
```

## 设计原则

WebXR 前端不生成最终 MP4；最终导出由后端根据 timeline/path/effect contract 渲染。前端只负责预览、交互采样和向后端发送协议消息。

新交互必须先定义语义 operation，再接入 PC / Quest / 自动化输入适配器。不要把键盘、鼠标、controller 事件直接写成业务结果。

页面 URL 应稳定，业务上下文应进入数据层。后期任何需要恢复当前素材、当前 session、最近导出或 BGM 状态的逻辑，都应优先通过后端 session model 或前端 player model 解决，而不是新增路径参数。
