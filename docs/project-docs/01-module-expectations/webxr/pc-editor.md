# [00-3day-parallel-migration-plan.md](vscode-webview://1ki0evqfsbsslffgfs0onctu6602gn9idlgt15bvpnt18o1etk4s/index.html?id=b6ab67f0-e224-43c3-b663-0d65aac9300d&parentId=1&origin=f10e36f0-ba31-4175-baef-79037e1c642f&swVersion=5&extensionId=Anthropic.claude-code&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView&session=4712bd50-9d6d-4de3-8646-6570dd58542d)PC WebXR Edito

## 定位

PC WebXR Editor 是当前 WebXR 的核心业务界面。后期产品路由应固定为：

```text
/xr/player
```

`/xr/player` 是 WebXR 工作台，不只是播放器 demo。它应在同一个页面里完成素材选择、取景、路径采样、特效事件、BGM 选择、render-test/export 和 Meta XR 入口。

产品流程里，用户从视频卡片或详情页点开某个视频时，应进入稳定入口 `/xr/player`。进入前由数据层或后端把 active session 切到该视频；进入后由 `/xr/player` 页面内的视频列表组件选中并打开对应视频。

当前仓库仍保留 `/xr/videos/:videoId/session/:sessionId`，但它只应作为过渡期兼容深链、显式 session 调试或少量自动化测试入口。长期不应继续把 `videoId/sessionId` 作为产品 URL 的一部分；这些上下文应由数据层或后端 active session 提供。

## 四层结构

```text
apps/web/src/features/webxr/pc-editor/
  data/      player/session model、视频源映射、timeline bridge transport
  webxr/     A-Frame runtime、videosphere、camera、controller、crop mask、Meta XR 兼容
  ui/        PC 播放条、工作台、effects、BGM、debug/export 状态
  controls/ 语义动作 operations 和 PC / Quest / 自动化输入适配器
```

`PcWebXrEditor.tsx` 只做顶层编排，不继续堆放交互细节。

## 目标分层

后期 `/xr/player` 建议按产品职责拆成更明确的六层。这里的“层”不是一定要对应六个目录，而是代码依赖方向和职责边界。

```text
视觉层 Visual
  用户看到的界面和 WebXR 场景。
  应再分成两个视觉块：
    player：360 球幕、video element、播放条、playlist、播放状态。
    editor：crop mask、工作台、effects、BGM、export/debug 状态。
  视觉组件只接收状态和 callback，不直接决定后端协议。

交互层 Interaction
  按钮、键盘、鼠标、Quest controller、自动化测试 driver。
  交互层只表达“用户做了什么”，不直接拼 API payload。
  例：点击 Next、按 W/A/S/D、拖动 mask、点击 Render。

事件层 Events
  把交互变成可订阅的 typed editor event。
  例：
    source.selected
    playback.toggled
    crop.started
    crop.ended
    viewport.changed
    effect.selected
    render.requested
  事件层应允许 PC、Quest、自动化测试和未来多人/远端控制订阅同一批语义事件。

业务 workflow 层
  把事件推进为前端状态变化和后端 workflow。
  例：
    usePlayerSessionSwitch
    useCropWorkflow
    useRenderWorkflow
    useBgmWorkflow
  这一层决定切换视频前是否 flush、是否清空 export 状态、render 前是否 seal crop path。

后端对接层 Backend Adapter
  把 workflow 转成后端领域 API。
  例：
    playerSession adapter
    timeline adapter
    music adapter
    export adapter
  这一层知道 sessionId、videoId、active session、latest export、BGM 状态等业务字段。

网络发送层 Transport
  最底层 fetch / JSON / cookie / error handling。
  当前可以继续由 src/lib/api.ts 和 timeline bridge transport 承担。
  UI、交互层和事件层不应直接调用 fetch。
```

理想依赖方向：

```text
Visual -> Interaction callbacks -> Events -> Workflow -> Backend Adapter -> Transport
```

反向依赖应避免。例如按钮不应直接知道 `/api/cut-sessions/:sessionId/render-test`，crop mask 视觉组件不应直接保存 ViewPathPatch，网络层不应知道按钮或具体 UI 文案。

当前仓库已有 `data / webxr / ui / controls` 四层雏形，但它还不是完整目标分层。后续重构应优先让“事件层”和“workflow / backend adapter 层”显式化，而不是继续往 `PcWebXrEditor.tsx` 里追加流程。

## 理想路由数据流

```text
/xr/player
  server page:
    读取 cookie
    获取当前用户 WebXR playlist
    通过 /api/xr/player-session 获取或创建 active cut session
    返回 activeVideoId / activeSessionId / playlistSources

  client editor:
    用 sourceMode="provided" 接收 playlist
    用 timelineSessionId / timelineVideoId 连接 timeline bridge
    用户切换视频时切换后端 active session，而不是改路由
    用户操作通过 bridge/API 写回后端
```

这个模式避免把业务上下文散落到路径里，也让移动端、PC、Quest 和恢复上次编辑状态共享同一个后端 session model。

视频切换应恢复或创建目标视频自己的 session。不要把一个 session 在多个视频之间反复改 `videoId`，否则 path、effect、BGM 和 export 状态会混在一起。

## 控制层原则

控制层分两段：

```text
operation：用户到底要做什么
input adapter：这次是怎么触发的
```

当前 operation 单元：

```text
cameraOperations.ts      设置 camera center
maskOperations.ts        设置遮罩中心、FOV、透明度、平滑移动、遮罩/镜头绑定移动
playbackOperations.ts    播放、暂停、倍速、视频选择、播放列表
recordingOperations.ts   录制速度意图
timelineOperations.ts    flushPath、cutHere、discard/restore、sampling pause/resume
viewGeometry.ts          yaw/pitch/FOV/屏幕点映射等几何工具
```

当前 PC input adapter：

```text
usePcKeyboardShortcuts.ts  Space、W/A/S/D、Q/E、F、C、P、Delete、T/R/H、,/.
usePcWheelZoom.ts          鼠标滚轮缩放 camera FOV；按住 T/R/H 时改为播放速度、录制速度或 mask opacity
usePcMaskPointerInput.ts   点击移动遮罩、拖拽旋转视角、Ctrl 拖拽移动遮罩、边缘联动 camera
usePcEdgePan.ts            Ctrl 拖拽到边缘时辅助移动 camera / mask
```

后续 VR 输入必须优先调用已有 operation，而不是复制 PC 逻辑。例如 controller ray 的“指向并平滑移动遮罩”应该调用 `moveMaskTo`，VR 抓取式运镜应该调用 `bindMaskAndCameraBy` 或新的同层 operation。

播放速度与录制速度分离：

```text
Playback speed：Z + 鼠标滚轮，0.1x..5x，只影响本地预览播放。
Record speed：X + 鼠标滚轮，0.1x..5x，表达录制/导出速度意图。
Effect speed：C + 鼠标滚轮，0.1x..5x，表达前端视效/预设运镜基础动作倍率。
```

所有连续速率类滑块都应走自适应滚轮曲线：接近默认值 1x 时变化更细，越靠近 0.1x 或 5x 边缘时每格滚轮变化更大。

## PC 与 VR 取景坐标差异

PC 模式：

```text
鼠标/键盘改变 camera 或 crop mask 状态。
用户视觉上看到的是 360 视频在屏幕固定遮罩后面移动。
发送给后端的 ViewPathPoint.center/fov 必须来自 crop mask state。
自动化测试必须验证遮罩中心和最后 accepted patch center 同向且一致。
```

VR 模式：

```text
Quest 真机可以进入 Meta XR，但长期交互仍应单独定义 input adapter。
VR 可以使用 head-gaze/controller pose 作为 view target source。
是否使用 crop-mask 或 xr-pose 作为 timeline source，需要按真机体验单独验收。
```

## 后端边界

本模块不改协议，继续发送现有三类消息：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

黑色/渐变遮罩是预览层；正式导出依赖 `ViewPathPoint.center/fov/enabled/cut`。如果球幕 `-90deg` 固定偏移导致最终 MP4 错位，应通过网格视频 render-test 单独校准，不在 UI 层偷偷补偿。

## 当前验收方向

Playwright 真实后端优先：

```text
注册测试用户
准备一个或多个真实 WebXR 360 视频
打开 /xr/player
确认页面能创建或恢复 active session
验证 A-Frame scene、videosphere、crop mask、PC 2D UI、Meta XR 入口存在
验证视频列表包含该用户可访问的 WebXR 360 视频
验证播放速度、录制速度、Space、滚轮 FOV、W/A/S/D、指针点选/拖拽、FOV 平滑过渡
等待 /path-patches accepted
检查 accepted patch 的 center/fov 与 crop mask state 一致
验证 start/end crop、render-test、download、effect event、BGM 选择能写回后端
```

当前 `/xr/videos/:videoId/session/:sessionId` 的测试应逐步迁移到 `/xr/player` 数据层模式；迁移期间保留它作为兼容深链。
