# WebXR 当前状态

> 代码基线：2026-05-25。本文描述当前仓库事实，不描述理想终局。后期目标见 `../01-module-expectations/webxr.md`。

## 一句话结论

WebXR 当前真实产品入口已经转向 `/xr/player`。这个页面不是旧播放器 demo，而是用 `PcWebXrEditor` 组合出来的 PC WebXR 工作台：它会读取当前用户的 360 视频库，通过后端 active session 恢复或创建当前 cut session，并启用 timeline bridge。

```text
/xr/player
apps/web/app/xr/player/page.tsx
apps/web/src/features/webxr/pc-editor/
```

`/xr/videos/:videoId/session/:sessionId` 当前仍存在，并且部分自动化测试仍在使用它打开明确的 video/session。但它应视为过渡兼容深链，不是后期产品路由方向。产品流程中，用户点开某个视频时应先把后端 active session 切到该视频，再进入 `/xr/player`，由页面内的视频列表组件选中并打开对应视频。

## 当前核心入口

### `/xr/player`

当前主入口，代码在：

```text
apps/web/app/xr/player/page.tsx
```

当前流程：

```text
读取 cookies
调用 buildPcEditorPlayerModel(cookieHeader)
  -> GET /api/xr/player-session
     -> 优先读取 webxr_player_state.active_session_id
     -> 无有效 active 时回退到最近可用 session
     -> 无 session 但有 360 视频时创建默认 session
  -> listVideos
  -> 过滤 360/equirectangular source 并转成 playlistSources
  -> 如果 active video 不在列表里，补一次 getVideo(activeVideoId)
未登录时 redirect("/mobile/login")
渲染 PcWebXrEditor
  enableTimelineBridge
  pcWorkbench
  sourceMode="provided"
  initialSources=model.playlistSources
  initialSourceId=model.currentSource.id
  sessionSwitchMode="player-active-session"
  timelineSessionId=model.session.sessionId
  timelineVideoId=model.session.videoId
```

当前切换机制：

```text
前端 playlist 选择、上一条/下一条按钮、键盘/控制器 next/previous 都会走同一个 handleSelectSource。
在 /xr/player 中 handleSelectSource 调用 PUT /api/xr/player-session { videoId }。
后端为目标视频恢复最近未 abandoned 的 cut session；如果没有，则创建一个新 session。
后端把 webxr_player_state.active_video_id / active_session_id 更新为当前选择。
PcWebXrEditor 同步更新 activeTimelineSessionId / activeTimelineVideoId，timeline bridge、BGM、render-test 都跟随新的 session。
```

当前限制：

```text
如果用户没有可用 360 视频，页面会走 player-session 加载错误态。
/xr/player 还没有完整展示 active session 的 effect/export 摘要，只把 latestExport / music 留在后端 payload 里。
切换视频前如果本地还有未 flush 的取景采样，仍需要更明确的切换前保存/提示策略。
```

### `/xr/videos/:videoId/session/:sessionId`

兼容深链入口，代码在：

```text
apps/web/app/xr/videos/[videoId]/session/[sessionId]/page.tsx
```

当前流程：

```text
从 route params 读取 videoId/sessionId
读取 cookies
调用 buildPcEditorSessionModel(videoId, cookieHeader)
渲染 PcWebXrEditor
  enableTimelineBridge
  pcWorkbench
  sourceMode="provided"
  initialSources=model.playlistSources
  initialSourceId=videoId
  sourceUrl=model.currentSource.sourceUrl
  timelineSessionId=sessionId
  timelineVideoId=videoId
```

这条路由当前只适合自动化测试和调试某个明确 session。demo API 当前返回 `/xr/player`，移动/详情入口也应进入 `/xr/player`；后期不应继续把这条路由作为产品主路径。

### `/xr/videos`

当前仍是 WebXR 视频列表入口，页面内也会引导到 `/xr/player`。后期如果 `/xr/player` 能完成素材选择和 session 恢复，`/xr/videos` 可以降级为管理页或被移动端/素材库取代。

## 代码地图

核心组合层：

```text
apps/web/src/features/webxr/pc-editor/PcWebXrEditor.tsx
```

数据层：

```text
data/buildPcEditorSessionModel.ts
data/videoSources.ts
data/timeline-bridge/
```

WebXR/A-Frame 层：

```text
webxr/useAFrameRuntime.ts       从 /api/vendor/aframe 加载 A-Frame
webxr/AFrameEditorScene.tsx     a-scene、a-assets、a-videosphere、camera、controller
webxr/AFrameCropViewportMask.tsx
webxr/AFrameCropViewportArcs.tsx
webxr/aframeXrCompat.ts         Meta XR / XRWebGLLayer fallback
```

控制层：

```text
controls/usePcEditorControls.ts
controls/operations/
controls/inputs/
controls/use360VideoPlaybackController.ts
controls/AFrame360VideoControlBridge.tsx
```

UI 层：

```text
ui/PcPlayerControls.tsx
ui/PcWorkbenchPanel.tsx
ui/PcEffectsPanel.tsx
ui/PcEffectPreview.tsx
ui/PcBgmControls.tsx
ui/PcEditorDebugState.tsx
```

## `/xr/player` 分层现状

结论：当前代码已经不是一团糊，`data / webxr / controls / ui` 的目录边界基本清楚；但还没有完全落成“交互层、事件层、视觉层、后端对接层、网络发送层”这种更稳定的产品分层。`PcWebXrEditor.tsx` 仍承担了较多编排工作，包括 active session 切换、crop workflow、render-test、部分状态重置和桥接 wiring。

当前可以按以下层理解：

```text
路由 / 服务端数据层
  apps/web/app/xr/player/page.tsx
  data/buildPcEditorPlayerModel
  负责读 cookie、取 player session、取 playlist，并把初始模型传给 client editor。

视觉层
  播放器块：
    webxr/AFrameEditorScene.tsx
    controls/use360VideoPlaybackController.ts
    ui/PcPlayerControls.tsx
  剪辑器块：
    webxr/AFrameCropViewportMask.tsx
    webxr/AFrameCropViewportArcs.tsx
    ui/PcWorkbenchPanel.tsx
    ui/PcEffectsPanel.tsx
    ui/PcEffectPreview.tsx
    ui/PcBgmControls.tsx
  视觉层负责用户看到的东西：360 球幕、播放条、playlist、crop mask、工作台、effects、BGM 面板、debug 状态。

交互层
  controls/inputs/
  ui/* button callbacks
  负责把按钮、键盘、鼠标、未来 controller 输入翻译成用户意图。

语义事件 / operation 层
  controls/operations/
  controls/videoControlEvents.ts
  controls/AFrame360VideoControlBridge.tsx
  webxr/AFrameCropViewportMask.tsx 发出的 WEBXR_CROP_MASK_* custom events
  当前已经有语义动作和 A-Frame/window custom events，但“可订阅的产品事件层”还没有完全独立成一个模块。

后端对接层
  data/timeline-bridge/
  PcWebXrEditor 内的 handleSelectSource / renderCrop / crop workflow
  ui/PcBgmControls.tsx
  负责把 active session、path/effect patch、BGM、render-test 等业务动作对接到后端。

网络发送层
  src/lib/api.ts
  data/timeline-bridge transport
  负责 fetch、cookie 透传、JSON 解析、错误处理和低频 patch 发送。
```

当前清楚的地方：

```text
视觉组件已经大多集中在 webxr/ 和 ui/。
PC 输入适配器和语义 operation 已经分到 controls/inputs 与 controls/operations。
timeline bridge 已从 UI 中抽出，低频发送 ViewPathPatch / PlaybackClientState。
/xr/player 的服务端数据入口已经收敛到 buildPcEditorPlayerModel。
```

当前仍不够清楚的地方：

```text
事件层还不是一等公民：有 window custom event、A-Frame event、operation callback，但没有统一 typed editor event bus。
按钮交互和后端 workflow 有些仍直接连在 PcWebXrEditor 里，例如视频切换、crop render、状态重置。
BGM 面板自己处理一部分后端读取/保存逻辑，还没有统一放到 backend adapter / workflow hook。
播放器视觉块和剪辑器视觉块已经能区分，但代码目录还没有显式叫 player/ 和 editor/ 两个视觉子域。
网络发送低层在 api.ts，业务级后端对接仍散在 timeline bridge、PcWebXrEditor 和个别 UI 组件里。
```

后续如果继续整理，建议优先拆出：

```text
events/ 或 controller/
  typed editor events，例如 source.selected、crop.started、crop.ended、render.requested、effect.selected。

workflows/
  usePlayerSessionSwitch
  useCropWorkflow
  useRenderWorkflow
  useBgmWorkflow

visual/player/
  播放器视觉块：球幕、播放状态、playlist、播放条。

visual/editor/
  剪辑器视觉块：crop mask、工作台、effects、BGM、debug/export。

backend/
  playerSession adapter
  timeline adapter
  music adapter
  export adapter
```

## 当前已实现能力

播放和场景：

```text
A-Frame a-scene / a-videosphere
HTMLVideoElement 自动播放、loop、muted、playsInline、crossOrigin
a-videosphere 固定 rotation="0 -90 0"
PC camera look-controls
左右 controller laser-controls
Meta XR Start 按钮
A-Frame VR fallback 按钮
renderer.xr.isPresenting 状态展示
Quest probe 查询参数遥测
```

取景和预览：

```text
16:9 crop mask state
center.yaw / center.pitch
fov.h / fov.v
locked / input / maskOpacity
crop viewport arcs
mask opacity slider 与渐隐/加深按钮
debug state 中暴露 crop mask、video control、timeline bridge 状态
```

PC 输入：

```text
Space                 播放/暂停
W/A/S/D               连续移动取景中心
Q / E                 连续调整 crop mask FOV
鼠标滚轮              缩放 360 camera FOV
T + 鼠标滚轮          调整预览播放速度，范围 0.1x..5x
R + 鼠标滚轮          调整录制速度意图，范围 0.1x..5x
H + 鼠标滚轮          调整 mask opacity
, / .                 降低 / 提高播放速度
F                     flush path
C                     cut here
P                     打开/关闭视频列表
Delete 长按           播放时标记 discard range
L                     由 crop mask component 处理锁定/解锁
点击画面              平滑移动取景中心
普通拖拽              旋转 360 camera，不移动 mask
Ctrl + 点击           立即移动 mask
Ctrl + 拖拽           移动 mask；拖到边缘时联动 camera
Shift + 点击          以较慢过渡移动 mask
```

PC 工作台：

```text
FOV in/out
Yaw/Pitch 微调
Flush / Cut
Lock / Unlock
Start crop / End crop
Auto-render toggle
Render
Download export
Discard 状态提示
最近 accepted path patch 展示
```

Effects / BGM：

```text
Effects Rack 已有 transition、color、speed、frame、glitch、marker 分类。
点击 effect 或 Tab + 数字快捷选择会发送 createEffectEvent。
Effect event 通过 /api/cut-sessions/:sessionId/effect-events 写入后端。
PcEffectPreview 会显示本地效果反馈。
PcBgmControls 会读取 /api/music-tracks 和 /api/cut-sessions/:sessionId/music。
选择 BGM 会更新 session music，后端 render-test 已有 mux music 的路径。
```

Crop workflow：

```text
Start crop:
  samplingResume
  flushTimeline("lock")
  播放视频

End crop:
  pause 视频
  force sample
  等待 accepted path patch
  samplingPause
  如果 auto-render 开启则调用 render-test

Render:
  必要时先 seal crop path
  POST /api/cut-sessions/:sessionId/render-test
  成功后展示 /api/exports/:exportId/download
```

## Timeline / 后端桥接

当前 bridge 仍发送三类协议：

```text
ViewPathPatch
EffectEventsPatch
PlaybackClientState
```

PC 工作台启用时：

```text
viewTargetSource = "crop-mask"
```

也就是说，timeline bridge 持久化的是用户透过固定 crop mask 看到的取景状态，而不是裸 camera pose。这一点对 PC 模式很重要：PC 上 camera 可以被普通拖拽旋转，但最终裁剪中心应以 crop mask state 为准。

## 当前自动化验收

`apps/web/e2e/webxr-smoke.spec.ts` 已覆盖：

```text
sample video range request
HLS stream
/api/xr/video-sources fallback
demo videos
真实用户 + demo session
/xr/videos/:videoId/session/:sessionId 打开 PC editor
A-Frame scene、videosphere、crop mask、PC UI、Meta XR 入口
播放速度、录制速度、滚轮 FOV、W/A/S/D
accepted path patch 与 crop mask state 对齐
dev/legacy 页面 smoke
```

其中 demo start flow 已改为返回 `/xr/player`，测试会先切换后端 active session，再打开 player 页面。

`apps/web/e2e/webxr-crop-render.spec.ts` 已覆盖：

```text
上传 equirect-grid.mp4
创建真实 cut session
键盘和指针移动生成 matching path
render-test 导出并用 analyzer 校准画面中心
plain drag / Ctrl drag / Ctrl click
Q/E 连续 FOV
H + wheel mask opacity
effect rack 写入 effect event
start/end/render/download 完整 crop workflow
```

测试缺口：

```text
/xr/player 自身还需要更完整的 authenticated smoke，覆盖刷新恢复 active session、playlist 切换 active session、render-test 使用切换后的 session。
后期从 session 深链迁移到 player 数据层时，现有 e2e 需要同步改入口。
```

## dev/legacy 页面

以下页面保留，不作为核心产品入口：

```text
/xr/aframe-player                dev/legacy A-Frame 播放器 smoke
/xr/player-ui-lab                dev/legacy 2D 播放条视觉实验
/xr/playback-lab                 dev/legacy playback/mock XR 实验
/xr/hello                        dev/legacy Three.js / Meta WebXR 对照
/xr/workbench                    dev/legacy 早期工作台参考
/xr/dev-check                    dev/legacy 环境检查
/xr/login                        WebXR 登录实验
/xr/three-official-interactive-lab Quest/Three.js 3D UI 实验，不是当前 /xr/player 主实现
```

旧的 `src/components/aframe/*` 播放器相关入口目前多为兼容 wrapper，供 lab 页面和 smoke 测试继续使用。新产品代码应从 `@/features/webxr/pc-editor` 导入。

## 下一步整理建议

```text
1. 把 /xr/player 定义成唯一产品入口。
2. 增加 /xr/player authenticated smoke：登录、准备素材、打开页面、确认 session 创建/恢复、切换视频、确认 accepted patch。
3. 扩展 player model 的展示侧：activeVideoId、activeSessionId、playlistSources、music/effect/export 摘要。
4. 为视频切换增加“切换前 flush/保存/提示”策略，避免本地未提交采样被误解。
5. 逐步把 /xr/videos/:videoId/session/:sessionId 从产品入口降级为测试/兼容入口。
6. 再推进 Quest 真机 input adapter，不复用 PC 坐标假设。
```
