# 视觉素材板

这份文档先收集真实材料，再决定 PPT 怎么做。上一版离线 HTML PPT 的问题是只有文字，没有项目画面、实机录屏和输出结果，所以先暂停做 PPT。

原则：

```text
先素材，后 PPT。
每一页必须有真实画面、录屏、输出视频、二维码或路径数据之一。
不再用抽象圆形、假图形和纯文字撑页面。
```

## 现在必须删除的材料

```text
docs/hackathon-narrative/hackathon-pitch-deck.html
```

原因：

```text
它是纯文本化展示，没有使用项目真实截图、GIF、导出视频或二维码。
它不能代表项目，也不适合继续作为路演基础。
```

## 已找到的可用材料

### 1. 360 源素材

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 原始 360 素材示例 | `storage/sample-videos/pano.mp4` | 1920x1080，约 7.52s，可用于“源素材”页或 before/after 对比。 |
| 标准 equirect 网格 | `storage/sample-videos/equirect-grid.mp4` | 4096x2048，约 12s，适合解释 360 到 16:9 重投影。 |
| 网格静态图 | `storage/sample-videos/equirect-grid.png` | 4096x2048，可用于技术页背景或 ViewPath 说明。 |

### 2. 后端输出视频

这些视频可以直接放进 PPT，也可以截成 GIF。

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| FOV 推近/拉远 | `storage/exports/unit-cases/04_fov_zoom_in_out.mp4` | 1280x720，约 6s，适合讲 FOV。 |
| 跳过片段 | `storage/exports/unit-cases/05_skip_2s_4s_no_black.mp4` | 1280x720，约 4s，适合讲 Skip / Drop。 |
| 快速切视角 | `storage/exports/unit-cases/06_fast_cut_90deg.mp4` | 1280x720，约 6s，适合讲 Cut 和大角度切换。 |
| 效果和高亮 | `storage/exports/unit-cases/07_effect_fade_black_highlight.mp4` | 1280x720，约 6s，适合讲后端能吃 effect/path。 |
| 电影化效果包 | `storage/exports/timeline-review/09_cinematic_effect_pack.mp4` | 1280x720，约 6s，适合放在“输出结果”页。 |
| 丢弃中间片段 | `storage/exports/timeline-review/06_discard_middle_segment.mp4` | 适合解释 enabled=false / 跳过区间。 |

### 3. PC / Web 页面截图

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 移动端视频列表/入口 | `apps/web/mobile-xr-videos-after-2.png` | 1082x3452，适合裁成手机长图或二维码入口旁边的小图。 |
| 空间工作台视觉 | `apps/web/arwes-workbench-spatial-layered-check.png` | 1366x820，适合表达“空间 UI / 工作台”气质。 |
| Quest 空间 UI 原型 | `apps/web/quest-spatial-ui-prototype-desktop-ready-2.png` | 1440x900，适合做概念视觉，但要标注为原型。 |
| Three.js 播放器检查 | `apps/web/three-official-interactive-lab-player-final-check.png` | 1280x720，可作为 Web 端播放/实验室视觉补充。 |
| Player UI 桌面图 | `storage/exports/timeline-review/player-ui-lab-vaporwave-desktop-open-check.png` | 1365x768，适合作为 PC 端播放器/控制台氛围图。 |
| XR 登录视觉 | `storage/exports/timeline-review/xr-login-vaporwave-check.png` | 1280x800，适合做“WebXR 入口”视觉补充。 |

### 4. Quest / 实机截图

| 文件 | 当前判断 |
| --- | --- |
| `quest-current-screen.png` | 文件存在，但图像探测显示 PNG 签名异常；需要人工打开确认，可能要重截。 |
| `quest-product-session-screen.png` | 文件存在，但图像探测显示 PNG 签名异常；需要人工打开确认，可能要重截。 |
| `quest-browser-screen.png` | 0 字节，不可用，必须重截。 |

结论：

```text
Quest 实机截图/录屏现在不能直接信任。
必须重新录一段稳定视频，作为 PPT 的主视觉。
```

## 必须补录 / 补截的核心材料

### A. Quest / WebXR 实机视频

目标文件：

```text
docs/hackathon-narrative/assets/demo-quest-webxr.mp4
```

视频长度：

```text
35-60 秒。
```

必须出现：

```text
进入 360 素材。
看到 16:9 取景框或裁剪区域。
视角/取景框移动。
Lock 或类似锁定动作。
Cut 或大角度切换。
Skip / Drop 片段。
FOV 推近/拉远。
最后切到导出结果或路径说明。
```

### B. PC 端核心截图

目标文件：

```text
docs/hackathon-narrative/assets/pc-editor-session.png
docs/hackathon-narrative/assets/mobile-entry-qr.png
docs/hackathon-narrative/assets/export-download.png
```

必须证明：

```text
不是纯概念。
项目有真实 Web 页面。
可以进入 session。
可以导出/下载 MP4。
二维码是试用入口，不是 PPT 页面。
```

### C. 输出结果视频 / GIF

目标文件：

```text
docs/hackathon-narrative/assets/output-fov.gif
docs/hackathon-narrative/assets/output-cut.gif
docs/hackathon-narrative/assets/output-skip.gif
docs/hackathon-narrative/assets/source-to-export.mp4
```

候选来源：

```text
storage/exports/unit-cases/04_fov_zoom_in_out.mp4
storage/exports/unit-cases/05_skip_2s_4s_no_black.mp4
storage/exports/unit-cases/06_fast_cut_90deg.mp4
storage/exports/timeline-review/09_cinematic_effect_pack.mp4
```

示例转换命令：

```powershell
ffmpeg -y -i storage/exports/unit-cases/06_fast_cut_90deg.mp4 -vf "fps=12,scale=960:-1:flags=lanczos" docs/hackathon-narrative/assets/output-cut.gif
```

### D. 二维码

目标文件：

```text
docs/hackathon-narrative/assets/qr-trial.png
```

二维码应该指向：

```text
现场 LAN / 部署环境里的真实试用入口。
移动端视频页。
XR session 页。
PC editor 页。
备用演示页。
```

二维码不应该指向：

```text
/hackathon-deck
已经删除的 PPT 页面
不可访问的 localhost
```

## PPT 每页材料映射

| 页 | 标题 | 必须使用的材料 |
| --- | --- | --- |
| 1 | 看一遍，就能发 | Quest 实机视频截图 + 16:9 导出结果截图。 |
| 2 | 360 相机拍到全部，但很多素材卡在发布前 | `pano.mp4` 或 equirect 网格图 + “没发出去”的流程图。 |
| 3 | 不是另一个 360 剪辑器，而是最轻空间导演层 | 生态流程图 + 真实 PC 页面小截图。 |
| 4 | 上传 -> 观看 -> 注意力路径 -> 导出 -> 分享 | PC 截图、ViewPath 数据片段、导出 MP4 缩略图。 |
| 5 | Demo：看、锁、切、跳过、导出 | `demo-quest-webxr.mp4` 主画面 + 二维码 + PC 截图。 |
| 6 | 不是录屏，是 ViewPath / 注意力路径 | ViewPath 字段图 + `output-cut.gif` / `output-fov.gif`。 |
| 7 | 学生黑客松 MVP：已跑通闭环 | `export-download.png` + 输出视频清单 + “建设中”列表。 |
| 8 | 相机捕捉全部，我的系统快速确定注意力 | before/after 视频或 GIF，收束到“看一遍，就能发”。 |

## 不要使用的材料

```text
.tmp/hackathon-deck-*.png
```

原因：

```text
这些是上一版失败 PPT 的截图，会把问题带回纯文本展示。
```

```text
抽象球体、假路径、假二维码。
```

原因：

```text
这个项目需要真实感：实机画面、PC 截图、输出 MP4、可扫二维码。
```

## 下一步顺序

```text
1. 删除纯文本 HTML PPT。
2. 建立 docs/hackathon-narrative/assets/ 素材目录。
3. 先补录 demo-quest-webxr.mp4。
4. 从现有 output MP4 截 2-3 个 GIF。
5. 截 PC editor / mobile entry / export download 三张图。
6. 生成现场二维码。
7. 再重新做 U 盘可播放的 HTML PPT。
```
