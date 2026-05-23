# 第一次全链路 E2E 测试计划：导入 -> WebXR 真剪辑 -> 导出 -> Android 下载/分享

日期：2026-05-24  
目标账号：`madjad020@gmail.com`  
测试口径：先写计划，下一步再按本文执行。

## 目标

验证一条素材从导入到成片分享的真实闭环：

```text
素材导入 -> 创建/进入 WebXR session -> 在 WebXR editor 中真实剪辑 -> 从 WebXR 点导出 -> Android 端下载 -> Android 端分享导出 MP4
```

这次测试的核心不是证明数据库里能放 timeline，而是证明用户可见的产品链路可以产生真实编辑数据。剪辑过程必须有录屏或截图证据，不能只用脚本写库、不能只复用预置 timeline。

## 当前范围

第一轮主路径使用当前最稳的业务入口：

```text
Mobile/Web 上传与管理：/mobile/videos
WebXR 剪辑页面：/xr/videos/:videoId/session/:sessionId
Android 下载/分享页：/mobile/account/exports 或 /mobile/exports/:exportId
导出接口：WebXR 页面里的 Render 按钮触发 render-test
```

Quest 真机 WebXR 可以作为增强证据追加，但不是第一轮通过的硬性前提。原因是当前代码的正式业务剪辑入口已经收敛到 PC WebXR editor，Quest 真机输入仍需要单独验收。

## 不可替代项

以下动作必须从 UI 发生：

```text
上传或导入素材
创建或进入 cut session
Start crop
至少一次 yaw / pitch / FOV 调整
至少一次 Cut
至少一次丢弃段，建议按住 Del 完成
至少一次效果事件，建议从 Effects Rack 选择可渲染效果
End crop
Render / Export
Android 下载导出 MP4
Android 分享导出 MP4 或打开系统分享面板
```

允许使用数据库和脚本做验证，但不能用它们替代上述 UI 动作。

## 测试素材

首选用已经准备好的极限运动 4K 360 素材作为上传源：

```text
storage/videos/video_training_07e4e3c1e9b6_old_ghost_road_mountain_bike.mp4
Training 4K 360 - Old Ghost Road Mountain Bike.mp4
4096x2048, 60s, equirectangular
```

第一轮建议通过 `/mobile/videos` 上传这份文件形成一个新的 video 记录，而不是直接使用已 seed 的那条记录。这样可以覆盖“导入/上传”环节。为了避免和已有数据混淆，录屏时把测试 run id 写在记录表里：

```text
run id: e2e-20260524-01
素材备注：Old Ghost Road Mountain Bike 4K 360
```

如果上传耗时影响演示节奏，可以先用已有视频跑 WebXR 编辑和导出，但这只能算“剪辑到分享闭环”，不能算完整导入闭环。

## 环境准备

建议使用 HTTPS Web 服务，因为 Android Chrome 的 `navigator.share({ files })` 通常要求安全上下文。Next.js 走同源 `/api` rewrite 代理到本机 API，Android 只需要访问 Web 服务地址。

后端：

```powershell
python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port 8000
```

前端 HTTPS：

```powershell
$env:API_BASE_URL="http://127.0.0.1:8000"
$env:NEXT_PUBLIC_API_BASE_URL=""
npm --workspace apps/web run dev:https -- --hostname 0.0.0.0 --port 3001
```

访问地址按本机局域网 IP 替换：

```text
Desktop: https://127.0.0.1:3001/mobile/login
Android: https://<PC_LAN_IP>:3001/mobile/login
WebXR:   https://<PC_LAN_IP>:3001/xr/videos/:videoId/session/:sessionId
```

如果 HTTPS 证书警告出现，先在 Android Chrome 接受本次测试证书。若 Android 分享按钮仍提示不支持，则记录为 Web Share API 环境问题，并执行“下载后从系统文件管理器分享”的回退步骤。

## 证据目录

本次测试证据不要直接提交大型视频文件。建议本地保存到：

```text
storage/e2e-artifacts/2026-05-24-first-full-chain/
```

建议文件名：

```text
01-mobile-upload.png
02-webxr-editor-start.png
03-webxr-editing-recording.mp4
04-webxr-patch-accepted.png
05-webxr-render-ready.png
06-android-export-page.png
07-android-download-complete.png
08-android-share-sheet.png
09-export-result.mp4
10-db-verification.txt
```

## 执行流程

### 1. 登录

1. 打开 `/mobile/login`。
2. 使用 `madjad020@gmail.com / yanbaojie00000` 登录。
3. 截图记录登录后的素材库页面。

通过标准：

```text
页面显示当前账号。
GET /api/auth/me 成功。
素材库可以读取视频列表和导出列表。
```

### 2. 导入素材

1. 打开 `/mobile/videos`。
2. 使用上传入口选择 4K 360 山地车素材。
3. 等待上传完成，进入新视频详情页。
4. 记录新 `videoId`、文件名、分辨率、时长。

通过标准：

```text
视频状态为 ready_for_xr。
视频详情页出现 sourceUrl。
storage/videos 下存在新文件。
videos 表中 owner/user 为当前账号。
```

### 3. 创建并进入 WebXR session

1. 在视频详情页创建或进入 WebXR session。
2. 打开 `/xr/videos/:videoId/session/:sessionId`。
3. 确认 360 视频真实播放，不是 placeholder。
4. 截图记录 WebXR editor 初始状态。

通过标准：

```text
页面显示真实 video source。
PC workbench 出现。
crop mask 可见。
timeline bridge 状态区域可见。
```

### 4. 真实剪辑操作

从这里开始录屏。录屏至少覆盖 Start crop 到 End crop，最好覆盖 Render ready。

建议操作脚本：

```text
00s: 点击 Start crop。
02s: 播放视频，按 D 或点击 Yaw +，让取景向右跟随。
04s: 点击 FOV + 或按 Q，做一次推近。
06s: 按 W / S 做一次 pitch 调整。
08s: 点击 Cut 或按 C，制造一个明确剪辑点。
10s: 用 Effects Rack 选择 transition.flash_white 或 filter.vignette。
12s: 按住 Del 约 2 秒，松开后形成 discard range。
15s: 点击 FOV - 或按 E，做一次拉远。
18s: 点击 Flush，确认 patch accepted。
20s: 点击 End crop。
```

注意：

```text
不要用 seed_pc_editor_demo_timeline.py。
不要直接 POST path-patches。
不要直接改 storage/app.db。
效果事件优先选当前渲染器支持的事件：transition.fade_black, transition.flash_white, black.solid, filter.color_grade, highlight, filter.blur, filter.vignette, filter.chromatic_aberration, overlay.letterbox, overlay.text。
```

通过标准：

```text
UI 显示 Crop path sealed 或等价完成状态。
last patch JSON 中能看到 center / fov 变化。
view_path_points 至少 8 个。
view_path_points 中至少有 1 个 cut=1。
如果 Del 丢弃成功，至少有一个 enabled=0 的时间段。
如果效果选择成功，effect_events 至少 1 条。
```

### 5. WebXR 页面点导出

1. 在 WebXR editor 中点击 Render。
2. 等待状态变为 Export ready。
3. 截图 Render ready 状态和 Download 链接。
4. 不用 curl 或脚本直接触发导出。

通过标准：

```text
exports 表生成新 export。
export.status = ready。
WebXR 页面出现下载链接。
storage/exports 下存在对应 MP4。
下载接口返回 video/mp4。
```

### 6. Android 端下载

1. Android Chrome 打开 `https://<PC_LAN_IP>:3001/mobile/login`。
2. 登录同一账号。
3. 进入 `/mobile/account/exports` 或视频详情页。
4. 找到刚刚导出的结果。
5. 点击下载裁剪 MP4。
6. 记录下载完成截图。

通过标准：

```text
Android 能看到同一 exportId。
下载开始并完成。
Android Downloads 或浏览器下载列表中出现 MP4。
MP4 可播放。
```

### 7. Android 端分享

首选路径：

```text
在 /mobile/account/exports 点击分享按钮。
Android 系统分享面板出现。
选择一个安全目标，例如 Files、Nearby Share、Drive 草稿或测试聊天。
截图记录分享面板或分享成功页。
```

回退路径：

```text
如果 Web Share API 不可用，打开 Android Downloads。
找到导出的 MP4。
使用系统文件管理器的 Share 操作分享。
记录这是浏览器安全上下文限制，而不是导出文件不可用。
```

通过标准：

```text
系统分享面板可接收到 video/mp4 文件。
文件名和导出文件匹配。
分享目标能看到或接收该 MP4。
```

## Android 录屏建议

如果 Android 设备通过 ADB 连接：

```powershell
adb shell screenrecord /sdcard/webxr-e2e-android-download-share.mp4
```

停止录屏后：

```powershell
adb pull /sdcard/webxr-e2e-android-download-share.mp4 storage/e2e-artifacts/2026-05-24-first-full-chain/
```

截图：

```powershell
adb exec-out screencap -p > storage/e2e-artifacts/2026-05-24-first-full-chain/android-current.png
```

如果 Quest 也参与 WebXR 剪辑，可用同样的 ADB 录屏方式保存 Quest 浏览器画面。

## 数据验证

UI 测试结束后，用数据库做佐证。以下查询只读，不改库。

```powershell
@'
import sqlite3, json
session_id = "<SESSION_ID_FROM_TEST>"
conn = sqlite3.connect("storage/app.db")
conn.row_factory = sqlite3.Row
for table in ["view_path_patches", "view_path_points", "effect_event_patches", "effect_events", "minute_segments", "exports"]:
    if table == "exports":
        rows = conn.execute("""
            SELECT COUNT(*) AS count
            FROM exports
            WHERE session_id = ?
        """, (session_id,)).fetchone()
    else:
        rows = conn.execute(f"SELECT COUNT(*) AS count FROM {table} WHERE session_id = ?", (session_id,)).fetchone()
    print(table, rows["count"])
print("cut points", conn.execute("SELECT COUNT(*) FROM view_path_points WHERE session_id=? AND cut=1", (session_id,)).fetchone()[0])
print("disabled points", conn.execute("SELECT COUNT(*) FROM view_path_points WHERE session_id=? AND enabled=0", (session_id,)).fetchone()[0])
print("latest export", dict(conn.execute("SELECT id,status,file_path FROM exports WHERE session_id=? ORDER BY created_at DESC LIMIT 1", (session_id,)).fetchone()))
conn.close()
'@ | python -
```

保存输出到：

```text
storage/e2e-artifacts/2026-05-24-first-full-chain/10-db-verification.txt
```

## 通过标准总表

| 模块 | 必须通过 |
| --- | --- |
| Auth | 同一账号在 Desktop/WebXR/Android 都能登录 |
| Import | 新视频通过 UI 上传进入当前账号素材库 |
| Session | 能创建并进入真实业务 session |
| WebXR playback | WebXR editor 播放真实 360 视频 |
| Real edit | UI 操作产生 ViewPathPatch，不是脚本写库 |
| Unit ops | yaw/pitch/FOV/cut/discard/effect 至少覆盖主要项 |
| Export | 从 WebXR 页面点击 Render 后生成 ready export |
| Android download | Android 能下载导出 MP4 并播放 |
| Android share | Android 能打开分享面板或完成一次分享 |
| Evidence | 录屏/截图/DB 只读验证/导出 MP4 均保存 |

## 失败分层

| 失败点 | 优先检查 |
| --- | --- |
| Android 无法访问页面 | PC 和 Android 是否同一网络，Web 是否绑定 `0.0.0.0`，防火墙是否放行端口 |
| Android 分享按钮不可用 | 是否 HTTPS，Chrome 是否认为当前 origin 是 secure context，`navigator.share` 是否支持 files |
| 上传失败 | 文件大小、后端 upload limit、API 日志、`storage/videos` 写入权限 |
| WebXR 页面跳登录 | cookie 是否同源，是否用同一 HTTPS host，是否跨 host 导致 cookie 不共享 |
| 视频不播放 | sourceUrl、range 请求、浏览器控制台、API `/media` rewrite |
| Start crop 后没有 patch | timeline bridge 状态、`path-patches` 请求、video currentTime 是否在走 |
| Del 没有丢弃段 | 页面焦点是否在编辑器，是否被输入框吞掉键盘事件，是否确实播放中 |
| effect_events 为空 | Effects Rack 是否选中效果，`effect-events` 请求是否返回 accepted |
| Render 失败 | 至少两个路径点、源视频文件存在、OpenCV/FFmpeg、effect params 是否被渲染器支持 |
| Android 下载失败 | export.status、downloadReady、`/api/exports/:id/download` 是否返回 200 |

## 第一轮建议结论模板

测试结束后在同目录补一份 run 记录：

```text
docs/project-docs/05-test-plans/runs/2026-05-24-first-full-chain-result.md
```

记录内容：

```text
run id
执行人
设备
服务地址
videoId / sessionId / exportId
上传是否通过
WebXR 真剪辑是否通过
导出是否 ready
Android 下载是否通过
Android 分享是否通过
证据文件清单
失败项和下一步修复
```
