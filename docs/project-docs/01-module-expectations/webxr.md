# WebXR 模块预期

> 目标基线：2026-05-25。本文描述 WebXR 后期应收敛到的产品形态；当前仓库事实见 `../02-current-state/webxr.md`。

## 目标定位

WebXR 是项目里的沉浸式取景、预览和剪辑意图入口。后期产品入口应收敛为一个稳定页面：

```text
/xr/player
apps/web/src/features/webxr/pc-editor/
```

`/xr/player` 应成为唯一稳定的 WebXR 工作面。页面路由本身不再表达 `videoId/sessionId`；当前用户、当前素材、当前或新建 cut session、播放列表、BGM、effect、export 状态都应从页面数据层或后端 session 状态读取。

后期应放弃以 `/xr/videos/:videoId/session/:sessionId` 作为产品路由的思路。用户从视频卡片、视频详情或移动端入口点开某个视频时，应进入 `/xr/player`；在进入前或进入时由数据层/后端 active session 指向该视频，并由页面内视频列表组件选中它。`/xr/videos/:videoId/session/:sessionId` 可以在过渡期作为兼容深链、测试入口或内部调试入口存在，但完成数据层迁移后应下线、隐藏或重定向到 `/xr/player`。

## 职责边界

WebXR 前端负责：

```text
360 视频播放和预览
PC / Quest 取景交互
crop mask / FOV / center 状态维护
语义剪辑事件生成
ViewPathPatch / EffectEventsPatch / PlaybackClientState 上传
render-test / export 状态触发和展示
```

WebXR 前端不负责：

```text
上传原始视频
长期保存业务数据
生成最终 MP4
决定后端渲染策略
```

这些能力应分别留给 Mobile/Web 上传界面、后端 session 存储、timeline assembler 和 renderer。

## 理想数据流

`/xr/player` 的理想数据流：

```text
用户打开 /xr/player
-> server page 读取 cookie / 当前用户
-> 后端返回 WebXR player model
   - playlistSources
   - activeVideoId
   - activeSessionId
   - session config
   - music/effect/export 摘要
-> 页面渲染 PcWebXrEditor
-> 用户切换视频时由数据层更新 active session，而不是改变路由
-> 用户开始/结束取景、打点、特效、BGM、导出都通过 session API 写回后端
```

如果用户没有 active session，后端或 server page 可以自动创建一个默认 session；如果用户切换素材，应调用 session 更新 API，而不是跳转到带参数的新路径。

后端建议提供稳定的 player session API：

```text
GET /api/xr/player-session
  返回当前用户的 active video/session；没有 active 时恢复最近可用 session；仍没有时基于可用 360 视频创建 session。

PUT /api/xr/player-session { videoId }
  用户在 /xr/player 的视频列表里切换素材时调用。
  目标视频已有未 abandoned session 时恢复该 session；没有则创建新 session。
  更新后端 active_video_id / active_session_id，并返回新的 session 摘要。
```

不要把不同视频强行塞进同一个 cut session。每个视频应保留自己的 session、path、effect、BGM 和 export 状态；`/xr/player` 只负责选择当前 active session。

## 模块结构

目标模块边界按能力拆分：

```text
data/
  player/session model、视频源映射、timeline bridge transport

webxr/
  A-Frame runtime、a-scene、a-videosphere、camera、controller、crop mask、Meta XR 兼容

controls/
  语义 operation 与 PC / Quest / 自动化输入适配器

events/
  可订阅的 typed editor events，把按钮、键盘、controller、自动化输入统一成产品事件

workflows/
  active session 切换、crop workflow、render workflow、BGM workflow

backend/
  player session、timeline、music、export 的后端 adapter

ui/
  player 视觉块和 editor 视觉块：播放条、工作台、effects、BGM、debug/export 状态

timeline-bridge/
  ViewPathPatch、EffectEventsPatch、PlaybackClientState 的采样和发送
```

`PcWebXrEditor.tsx` 只应做顶层编排。新的交互不要直接堆到组件主体里，而应优先落到 `controls/operations/` 或对应输入适配器。

目标依赖方向：

```text
视觉层 -> 交互层 -> 事件层 -> workflow -> 后端对接层 -> 网络发送层
```

按钮、键盘和 controller 不应直接拼后端 payload；视觉组件不应直接 fetch；网络发送层不应知道 UI 文案或按钮状态。

## PC 与 Quest 的长期关系

PC editor 是同一套 WebXR 工作面的调试和精细编辑模式，不是另一个产品。Quest / WebXR 真机交互应复用同一批语义 operation：

```text
setPreviewCenter
setPreviewFov
lock/unlock viewport
flush path
cut here
discard/restore range
create effect event
start/end crop
request render/export
```

PC、Quest controller、head-gaze、自动化测试都可以有不同输入适配器，但它们不应该各自生成一套业务结果。

## 路由预期

长期产品入口：

```text
/xr/player
```

过渡期兼容或内部入口：

```text
/xr/videos
/xr/videos/:videoId/session/:sessionId
```

dev/legacy 和实验入口保留用于 smoke、能力对照和历史参考：

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

实验入口里的成熟能力应回流到 `/xr/player` 的数据层、controls 或 UI 模块，而不是继续扩张新的产品路由。

## 文档索引

```text
webxr/README.md
webxr/pc-editor.md
webxr/aframe-runtime.md
webxr/aframe-timeline-bridge.md
webxr/input-and-sampling.md
webxr/editor-workbench-ui.md
webxr/spatial-player-ui.md
webxr/crop-viewport-mask.md
webxr/visual-language.md
```

当前事实记录见：

```text
../02-current-state/webxr.md
../../records/webxr-workbench-ui-prototype.md
```
