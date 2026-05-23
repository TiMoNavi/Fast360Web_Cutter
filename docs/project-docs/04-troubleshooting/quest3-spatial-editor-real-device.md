# Quest 3 空间剪辑器真机调查

日期：2026-05-23

## 目标

按 `docs/project-docs/01-module-expectations/webxr/quest3-spatial-editor.md` 的方向，建立一个可自动化复测的 Quest 3 WebXR 空间操作探针，先拆出大量单元操作，后续再拼成复杂交互。

新增探针入口：

```text
/xr/quest-spatial-editor-probe
/xr/quest-spatial-editor-probe?auto=1
```

事件收集 API：

```text
GET /api/xr/quest-spatial-probe/events
GET /api/xr/quest-spatial-probe/events?runId=...
POST /api/xr/quest-spatial-probe/events
DELETE /api/xr/quest-spatial-probe/events?runId=...
```

## 本次设备事实

ADB 设备：

```text
model: Quest_3
product/device: eureka
Android: 14
build incremental: 52168470033700520
browser package: com.oculus.browser
browser version from logcat: 146.1.0.27.53.958285939
```

本机 ADB：

```text
D:\Android\Sdk\platform-tools\adb.exe
```

## 已完成代码

新增：

```text
apps/web/app/xr/quest-spatial-editor-probe/page.tsx
apps/web/src/components/aframe/AFrameQuestSpatialEditorProbe.tsx
apps/web/app/api/xr/quest-spatial-probe/events/route.ts
apps/web/e2e/quest-spatial-editor-probe.spec.ts
```

修复：

```text
apps/web/src/components/aframe/AFrameQuestSpatialWorkbenchLab.tsx
```

将 Quest lab HUD 标题修正为合法 JSX。

## 探针场景结构

探针场景是一个最小 A-Frame WebXR 空间操作台，不替代产品页。

它包含：

```text
观看层：
中心取景环、FOV 状态、gaze mode 状态、locked 状态。

播放器垂直 UI：
左侧播放面板、隐藏 / 唤回入口。

剪辑工作台：
前下方倾斜工作台，FRAME、FOV、CUT、LOCK、SAVE、FX、SESSION。

45 度延展面板：
打开模块后固定尺寸展开，FOV 模块含 FOV+ / FOV-。

快捷滑轮：
HOLD A 入口，包含 CUT、FOV+、FOV-、HIDE。

controller 实体：
left / right laser-controls，监听 trigger、grip、A、B、thumbstick。
```

## 当前单元操作目录

这些事件都会写入页面隐藏状态和本地 API，后续可作为组合复杂交互的积木：

```text
page-loaded
navigator-xr-present
immersive-vr-support
aframe-scene-loaded
open-workbench-module
trigger-hold-head-gaze
trigger-release-lock-patch
grip-hold-controller-ray
grip-release-lock-ray
fov-in
fov-out
open-radial-button
radial-release-commit
toggle-player-ui
b-close-overlay
desk-cut
desk-toggle-lock
desk-save-patch
enter-vr-request
xr-session-presenting
enter-vr-failed
xr-session-ended
```

`?auto=1` 会自动执行一条基础序列：

```text
open framing
trigger down / up
grip down / up
open FOV
FOV+ / FOV-
open radial
commit CUT
hide player UI
show player UI
open effects
close overlays
auto-sequence-complete
```

## 自动化验证结果

桌面 Playwright：

```text
npm run typecheck:web
npm --workspace apps/web exec playwright test e2e/quest-spatial-editor-probe.spec.ts --project=chrome
```

结果：

```text
typecheck passed
2 passed
```

验证内容：

```text
A-Frame scene 创建成功。
观看层、播放器面板、工作台存在。
auto 序列可完成。
trigger / grip / FOV / radial / player toggle 等事件被记录。
事件能 POST 到 /api/xr/quest-spatial-probe/events。
```

## Quest 真机自动化链路

设备识别成功：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' devices -l
& 'D:\Android\Sdk\platform-tools\adb.exe' shell getprop ro.product.model
```

启动 Browser 的包名确认：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' shell pm list packages | Select-String -Pattern 'oculus|browser'
```

近距 / 睡眠绕过尝试：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' shell am broadcast -a com.oculus.vrpowermanager.prox_close
& 'D:\Android\Sdk\platform-tools\adb.exe' shell svc power stayon usb
```

这一步可以把 `dumpsys activity` 中的 `isSleeping` 从 `true` 变为 `false`。

端口反向：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' reverse tcp:3033 tcp:3033
```

注意：3000 上已有 dev 进程监听 `::3000`，Quest shell 通过 reverse 访问时没有拿到 HTTP 响应。后来单独启动 3033，监听 `0.0.0.0:3033`：

```powershell
npm --workspace apps/web exec -- next dev --hostname 0.0.0.0 --port 3033
```

Quest shell 层能连到 3033：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' shell "(echo 'GET /api/xr/quest-spatial-probe/events HTTP/1.0'; echo 'Host: localhost'; echo; sleep 1) | nc 127.0.0.1 3033"
```

返回过 HTTP 响应，说明 `adb reverse` 到 3033 是通的。

启动 Browser：

```powershell
$runId='quest3-device-20260523-1838'
$url="http://localhost:3033/xr/quest-spatial-editor-probe?auto=1\&runId=$runId"
& 'D:\Android\Sdk\platform-tools\adb.exe' shell am start -a android.intent.action.VIEW -d $url -p com.oculus.browser
```

`am start -W` 返回：

```text
Status: ok
Activity: com.oculus.browser/org.chromium.chrome.browser.document.ChromeLauncherActivity
```

## 当前阻塞

Browser Activity 能启动，但没有实际访问探针页面。

现象：

```text
/api/xr/quest-spatial-probe/events 中没有 Quest runId 事件。
Next 3033 日志没有来自 Browser 的 GET /xr/quest-spatial-editor-probe。
dumpsys activity 显示 BrowserActivity resumed，但窗口 waitingToShow=true。
```

结论：

```text
ADB、设备识别、Browser 包、反向端口、Next 探针页本身都已打通到可验证边界。
当前卡点是 Quest Browser 窗口没有真正 show / execute。
需要戴上头显、保持 Browser 窗口可见，或打开投屏确认窗口实际显示后，再跑同一条 am start。
```

本次没有得到“Quest Browser 页面内 navigator.xr / immersive-vr”的真实回传，因此不能把 Quest 端 WebXR 能力标为已验证。只能确认系统层面存在 `com.oculus.browser`、WebXR 相关 Activity，以及 ADB 可以启动 Browser。

## 下一轮复测步骤

1. 戴上 Quest 3，或开启投屏，确认 Browser 窗口实际可见。
2. 保持 3033 dev server：

```powershell
npm --workspace apps/web exec -- next dev --hostname 0.0.0.0 --port 3033
```

3. 建立 reverse：

```powershell
& 'D:\Android\Sdk\platform-tools\adb.exe' reverse tcp:3033 tcp:3033
```

4. 打开探针：

```powershell
$runId='quest3-device-manual-001'
$url="http://localhost:3033/xr/quest-spatial-editor-probe?auto=1\&runId=$runId"
& 'D:\Android\Sdk\platform-tools\adb.exe' shell am start -a android.intent.action.VIEW -d $url -p com.oculus.browser
```

5. 在电脑端观察事件：

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:3033/api/xr/quest-spatial-probe/events?runId=$runId"
```

6. 如果能看到 `page-loaded`、`navigator-xr-present`、`immersive-vr-support`、`aframe-scene-loaded`，再在头显里点 `Enter VR`。
7. 进入 VR 后按手柄：

```text
Trigger down / up
Grip down / up
A
B
thumbstick up / down / left / right
```

8. 检查事件中是否出现：

```text
trigger-hold-head-gaze
trigger-release-lock-patch
grip-hold-controller-ray
grip-release-lock-ray
a-hold-open-radial
b-close-overlay
thumbstick-rate-change
fov-in
fov-out
xr-session-presenting
```

## 对后续实现的建议

短期先保持探针页独立，不要直接塞进产品页。

下一步应把真实 Quest 事件结果固化为 `useQuestSpatialEditorInput`：

```text
WebXR / A-Frame raw event
-> Quest input adapter
-> existing semantic operation
-> ViewPathPatch / EffectEventsPatch / PlaybackClientState
```

先只接入这些高价值动作：

```text
Trigger hold/release -> head-gaze bind / lock / flush
Grip hold/release -> controller ray bind / lock / flush
Thumbstick up/down -> FOV
Thumbstick left/right -> playback rate
A hold/release -> radial wheel
B -> close/cancel
```

后端协议暂时不需要变化。
