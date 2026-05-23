# Quest 3 WebXR 硬件输入事实表

日期：2026-05-23

## 测试入口

真实产品 session 页：

```text
http://localhost:3036/xr/videos/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s/session/video_sample_897b16c05d6c_01_elevr-relaxatron-mono-960x480-8s-session?questProbeRunId=...&questStartMetaVrOnPointer=1
```

有效 run：

```text
quest3-product-session-20260523-06
quest3-immersive-manual-20260523-01
```

`questStartMetaVrOnPointer=1` 的作用：页面收到一次真实 `pointerdown` / `touchend` / `click` / `keydown` 后调用 `navigator.xr.requestSession("immersive-vr")`。ADB tap/keyevent 不能稳定产生 WebXR user activation；这一步需要在头显内用 controller trigger 点击页面或按钮。

## 设备与浏览器

ADB / Android 层：

```text
model: Quest 3
product: eureka
device: eureka
Android: 14
SDK: 34
build incremental: 52168470033700520
```

浏览器层：

```text
package: com.oculus.browser
userAgent: Mozilla/5.0 ... Quest 3 ... OculusBrowser/146.1.0.27.53.958285939 Chrome/146.0.7680.188 VR Safari/537.36
isSecureContext: true
navigator.xr: present
immersive-vr support: true
```

## 数据来源分层

当前页面能从三层拿输入信息：

```text
1. WebXR 原生层
   navigator.xr
   XRSession
   XRFrame
   XRInputSource
   Gamepad buttons / axes

2. A-Frame / Three.js 层
   a-camera.object3D.getWorldDirection()
   left/right controller entity object3D.getWorldDirection()
   laser-controls / controller events

3. 产品语义层
   timeline bridge semantic event
   ViewPathPatch
   EffectEventsPatch
   PlaybackClientState
```

本轮已经稳定验证的是第 2 层的姿态采样和第 3 层的 timeline patch。第 1 层的 `XRFrame + XRInputSource.gamepad` 采样代码已加入，但需要重新打开页面并重新进入 immersive-vr 后继续补采。

## 平面网页模式

未进入 immersive-vr 时：

```text
rendererPresenting: false
sessionState: idle
inputSources: []
headPose: yaw=180, pitch=0
leftControllerRay/rightControllerRay: yaw=180, pitch=0
```

结论：

```text
Quest Browser 平面网页可以加载产品页、播放视频、运行 A-Frame、写 timeline patch。
平面网页模式不能可靠拿到头显旋转、手柄按钮、摇杆、controller ray。
真实硬件输入必须进入 immersive-vr session 后采集。
```

## immersive-vr 模式

进入成功事件：

```text
enter-meta-vr-pointer-gesture
enter-meta-vr-request
xr-session-presenting:
  rendererPresenting: true
  usedLegacyLayerFallback: false
```

进入 immersive-vr 后，`xr-pose-sample` 开始返回真实姿态。样例：

```json
{
  "headPose": {
    "input": "head_gaze",
    "yaw": 179.31,
    "pitch": -6.37
  },
  "headRotation": {
    "yaw": 0,
    "pitch": 6.37,
    "roll": 0.36
  },
  "leftControllerRay": {
    "yaw": -99.09,
    "pitch": -21.25
  },
  "rightControllerRay": {
    "yaw": -95.17,
    "pitch": -20.19
  },
  "rendererPresenting": true,
  "sessionState": "presenting"
}
```

说明：

```text
headPose 是把 camera 世界方向转换成 yaw/pitch。
headRotation 是 A-Frame/Three camera rotation 的欧拉角读数。
leftControllerRay/rightControllerRay 是 controller entity 世界方向转换成 yaw/pitch。
rendererPresenting=true 是当前是否已经进入 WebXR immersive session 的关键判断。
```

## 坐标约定

当前 yaw/pitch 是项目内的临时事实约定：

```text
yaw: 以 A-Frame/Three 世界 -Z 方向为 0 度，范围归一到 [-180, 180]
pitch: 向上为正，向下为负，限制在 [-85, 85]
roll: camera 自身 z 轴旋转角
```

注意产品视频球当前有：

```text
a-videosphere rotation="0 -90 0"
```

所以 WebXR 世界 yaw、A-Frame camera yaw、视频经纬度 yaw、屏幕上看到的画面方向不是同一个坐标基准。后续把 controller ray 映射到视频取景框时，需要明确做一次世界坐标到视频经纬度的换算。

## 手柄射线偏移

用户在头显中观察到 WebXR 内网页有 controller ray，但射线视觉上约偏 30 度。

当前遥测事实：

```text
head yaw: 约 179.3
right controller ray yaw: 约 -95.2
left controller ray yaw: 约 -99.1
videosphere yaw offset: -90
```

这说明“能拿到 controller ray”，但也说明至少存在一个坐标基准差异。可能来源：

```text
1. videosphere 自身 -90 度旋转。
2. controller target-ray space 与 grip/手柄模型朝向不同。
3. A-Frame laser-controls 可视射线与产品取景/视频经纬度映射不在同一坐标系。
4. WebXR 世界坐标、A-Frame object3D 世界方向、视频纹理经纬度之间缺少统一校准。
```

不要先硬编码 30 度修正。建议下一轮做一个校准单元：

```text
用户把 controller ray 指向视频中心十字。
记录 headPose、controllerRay、当前视频球 rotation。
计算 controllerRay -> video yaw/pitch 的固定变换。
再指向左/右/上/下四个点验证误差。
```

## 手柄与手势识别现状

这里的“手势”先分成两类：

```text
controller gesture:
  Trigger / Grip / A / B / thumbstick / controller ray movement

hand tracking gesture:
  pinchstarted / pinchended / 手部骨骼或手势
```

当前首轮以 Quest controller 为基线。hand tracking 没有在本轮验证，不应作为第一版验收依赖。

已设计的 A-Frame controller 事件映射：

```text
triggerdown -> controllerAimStart
triggerup -> controllerAimEnd
gripdown -> controllerAimStart
gripup -> controllerAimEnd
thumbstickup -> nudgeFov(deltaH=-5)
thumbstickdown -> nudgeFov(deltaH=5)
abuttondown -> cutHere
bbuttondown -> flushPath(reason=live)
pinchstarted -> toggleLock
pinchended -> flushPath(reason=lock)
```

当前真机观察：

```text
1. 进入 immersive-vr 后能看到 controller ray。
2. 姿态层能拿到左右 controller ray yaw/pitch。
3. timeline 出现大量 reason=lock 的 patch，说明某些输入已经触发产品语义层。
4. 原始 A-Frame trigger/grip/A/B 事件尚未稳定记录到 probe API，需要继续补采。
```

## 后续要补的硬件字段

下一轮重新进入 immersive-vr 后，重点看 `xr-frame-sample`：

```json
{
  "viewerPose": {
    "orientation": {
      "yaw": 0,
      "pitch": 0,
      "roll": 0
    },
    "position": {
      "x": 0,
      "y": 1.6,
      "z": 0
    }
  },
  "inputSources": [
    {
      "handedness": "right",
      "targetRayMode": "tracked-pointer",
      "profiles": ["oculus-touch-v3", "oculus-touch", "generic-trigger-squeeze-thumbstick"],
      "targetRayPose": {
        "yaw": 0,
        "pitch": 0,
        "roll": 0
      },
      "gamepad": {
        "id": "...",
        "mapping": "xr-standard",
        "axes": [0, 0, 0, 0],
        "buttons": [
          { "index": 0, "pressed": false, "touched": false, "value": 0 }
        ]
      }
    }
  ]
}
```

需要验证的单元动作：

```text
头显：
  左转 / 右转 -> viewerPose.orientation.yaw 变化
  抬头 / 低头 -> viewerPose.orientation.pitch 变化
  侧歪头 -> viewerPose.orientation.roll 变化

右手柄：
  移动手柄 -> right targetRayPose yaw/pitch 变化
  Trigger 按下/松开 -> gamepad button 或 A-Frame triggerdown/triggerup
  Grip 按下/松开 -> gamepad button 或 A-Frame gripdown/gripup
  A/B -> button event 或 gamepad button index
  Thumbstick 上下左右 -> axes 变化或 thumbstick direction event

左手柄：
  同右手柄，重点确认 handedness=left 和 button/axis index 是否一致。
```

## 对交互实现的建议

第一版不要直接依赖“视觉上射线刚好命中”的感觉，而应分层：

```text
硬件层：
  XRFrame / XRInputSource / A-Frame controller pose

校准层：
  world yaw/pitch -> video yaw/pitch
  controller target-ray -> 取景框中心

语义层：
  Trigger hold/release -> bind / lock / flush
  Grip hold/release -> controller ray mode
  Thumbstick -> FOV 或时间线微调
  A/B -> primary / cancel

产品层：
  ViewPathPatch / EffectEventsPatch / PlaybackClientState
```

只要先把校准层补齐，后面的空间 UI Agent 可以把按钮、面板、射线命中都接到同一套 operation 上，不需要重复写 WebXR 输入逻辑。
