# Quest 3 产品 Session 页输入真机调查

日期：2026-05-23

## 目标页面

用户确认应测试真实视频 session 页，不是独立 probe 页：

```text
http://localhost:3001/xr/videos/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s/session/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s-session
```

本轮使用隔离 Next dev server 复测，避免 3001 旧缓存和依赖状态影响：

```text
http://localhost:3036/xr/videos/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s/session/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s-session
```

## 已确认事实

```text
runId: quest3-product-session-20260523-06
Quest Browser UA: OculusBrowser/146.1.0.27.53.958285939 Chrome/146.0.7680.188
isSecureContext: true
navigator.xr: present
immersive-vr support: true
A-Frame runtime: ready
video source: /media/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s.mp4
video duration: 8s
video readyState: 4
timeline bridge: accepted path patches
```

产品页可以在 Quest Browser 里加载并播放真实视频，timeline bridge 可以把真实 session 的 view path patch 写回。平面网页状态下 timeline 记录到的中心点保持 `yaw=0, pitch=0`，说明当前 PC editor 的产品路径仍以固定视角/裁剪状态为主，不等同于 immersive-vr 头显姿态。

## 输入与姿态遥测

已给 `PcWebXrEditor` 增加 probe-only 遥测，只有 URL 携带 `questProbeRunId` 时启用：

```text
xr-pose-sample
xr-input-sources / xr-input-sources-empty
xr-input-sources-change
aframe-controller-event
enter-meta-vr-pointer-armed
enter-meta-vr-pointer-gesture
enter-meta-vr-request
xr-session-presenting
enter-meta-vr-failed
xr-session-ended
```

复测 run：

```text
quest3-product-input-20260523-02
quest3-product-immersive-input-20260523-03
quest3-product-immersive-input-20260523-04
```

平面网页模式拿到的数据：

```text
xr-pose-sample:
  headPose: input=head_gaze, yaw=180, pitch=0
  headRotation: yaw=0, pitch=0, roll=0
  leftControllerRay/rightControllerRay: yaw=180, pitch=0
  rendererPresenting=false
  sessionState=idle

xr-input-sources-empty:
  inputSources=[]

aframe-controller-event:
  controllerdisconnected left
  controllerdisconnected right
```

结论：

```text
1. Quest Browser 平面网页模式可以加载产品页、播放 360 视频、运行 A-Frame、写 timeline patch。
2. 平面网页模式不会给页面暴露可用 XRSession inputSources。
3. 平面网页模式下 A-Frame camera/controller 世界方向是固定场景值，不随头显转动变化。
4. 手柄按钮事件在未进入 immersive-vr 前不可作为可靠输入来源。
5. 真正的头显旋转、手柄按钮、thumbstick、controller ray 数据需要先进入 immersive-vr session。
```

## 自动进入 immersive-vr 的边界

新增测试参数：

```text
questStartMetaVrOnPointer=1
```

它会在页面中注册 `click` / `pointerdown` / `touchend` / `keydown` 一次性监听，收到用户手势后调用 `enterMetaVr()`。

ADB 尝试：

```powershell
adb shell input tap 6192 4000
adb shell input tap 2064 1104
adb shell input keyevent 66
adb shell input keyevent 23
```

结果：

```text
enter-meta-vr-pointer-armed 出现。
enter-meta-vr-pointer-gesture 没有出现。
enter-meta-vr-request / xr-session-presenting 没有出现。
```

结论：ADB 可以打开 URL、保持反向端口、采集页面遥测，但不能可靠地把 tap/keyevent 注入 Quest Browser 网页 DOM 当作 WebXR user activation。进入 immersive-vr 仍需要头显内用 controller trigger 对页面产生一次真实点击，或后续接入更底层的浏览器自动化能力。

## 后续手柄单元操作清单

进入 immersive-vr 后优先验证这些最小单元，不先做空间 UI：

```text
head-gaze pose sample:
  yaw/pitch/roll 随头显旋转变化。

XR inputSources:
  handedness, targetRayMode, profiles, gamepad.id, buttons, axes。

controller connection:
  controllerconnected / controllerdisconnected。

right trigger:
  triggerdown -> controllerAimStart 或 head-gaze bind。
  triggerup -> controllerAimEnd / lock / flush。

right grip:
  gripdown -> controller ray follow。
  gripup -> controller ray lock / flush。

A button:
  abuttondown/up -> radial menu or primary action。

B button:
  bbuttondown/up -> close/cancel。

thumbstick:
  thumbstickmoved axes -> direction quantization。
  thumbstickup/down -> FOV nudge。
  thumbstickleft/right -> playback/rate or timeline nudge。
```
