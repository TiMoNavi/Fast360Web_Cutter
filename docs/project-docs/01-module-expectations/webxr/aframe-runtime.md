# A-Frame Runtime

## 场景结构

A-Frame 运行时以 `a-scene` 为 WebXR 根。长期业务入口仍是：

```text
/xr/videos/:videoId/session/:sessionId
```

页面从后端读取 `videoId`、`sessionId`、`sourceUrl` 和已有 session 状态，然后把这些数据交给 A-Frame 场景中的播放器、UI 和采样模块。

建议的概念结构：

```html
<a-scene>
  <a-assets>
    <video id="source-video" playsinline crossorigin="anonymous"></video>
  </a-assets>

  <a-entity id="rig">
    <a-camera id="user-camera"></a-camera>
    <a-entity id="left-controller"></a-entity>
    <a-entity id="right-controller"></a-entity>
  </a-entity>

  <a-videosphere src="#source-video"></a-videosphere>
  <a-entity id="crop-preview"></a-entity>
  <a-entity id="player-ui"></a-entity>
  <a-entity id="editor-workbench"></a-entity>
</a-scene>
```

这只是文档级结构，不要求第一版代码完全照抄。

## Camera Rig

`rig` 表示用户在空间中的稳定父节点，`camera` 表示头显视角。取景采样读取 camera 的世界姿态，而不是读取 DOM 或 React 组件状态。

第一版默认：

```text
reference space: local-floor
用户初始朝向：正前方是视频和播放器 UI
工作台位置：用户前下方，类似桌面
播放器 UI：用户前方或轻微上方，始终面向用户
```

## Controller 和射线

Quest controller 使用 A-Frame 的 controller / laser / raycaster 能力承接。第一版优先保证：

```text
右手射线可以点击空间按钮。
左手射线可以辅助选择列表或面板。
按钮 hover 有可见反馈。
click / trigger / grip / thumbstick 事件进入统一输入层。
```

UI 模块不直接解释裁剪协议。空间按钮只发出语义事件，例如：

```text
playPause
seekTo
togglePlayerUi
openWorkbenchModule
lockViewport
savePatch
```

## Component 责任

A-Frame 自定义 component 按能力拆分，而不是按页面拆分：

```text
video-source
创建和维护 HTMLVideoElement，处理 MP4/HLS。

sphere-player
同步播放状态、时间、duration、错误。

spatial-button
处理 hover、pressed、released、disabled。

player-ui-controller
管理播放器 UI 的显示、隐藏和按钮语义。

crop-mask-preview
根据 FOV 和取景中心更新遮罩预览。

workbench-controller
管理工作台模块打开和关闭。

viewpath-sampler
按低频规则输出 ViewPathPatch。
```

## 边界

运行时层可以知道 A-Frame、WebXR session、controller 和视频元素。它不应该知道后端渲染细节，也不应该直接生成最终视频。
