# WebXR Editor 双端操作指南

最后更新：2026-05-24

这份文档把 PC editor 和 Quest / 头显端 Three Official 3D UI 的操作合并到一处。目标是让使用者清楚知道：同一个剪辑动作，在 PC 上怎么做，在头显里用哪个手柄组合完成。

## 入口

| 端 | 路由 | 用途 |
| --- | --- | --- |
| PC editor | `http://localhost:3001/xr/player` | 桌面键鼠编辑、验证时间线、调试完整 PC workflow |
| 头显 / Three Official | `http://127.0.0.1:3001/xr/three-official-interactive-lab` | Quest / WebXR 空间 UI，使用头显视角和手柄完成主要剪辑动作 |

## 核心原则

| 操作类型 | PC 端 | 头显端 |
| --- | --- | --- |
| 播放控制 | 键盘、底部播放条 | 中央 playback rail、双 trigger |
| 取景 | 鼠标、W/A/S/D、Q/E | trigger ray、head gaze、right grip 拖拽 |
| FOV | Q/E 或 PC UI | 必须 `right grip drag + right stick` |
| mask opacity | H + 鼠标滚轮 | 必须 `left grip + right stick` |
| 丢弃片段 | 长按 Delete | 必须 `left grip + right trigger hold` |
| 高频动作 | 快捷键 | B quick menu |
| 低频配置 | 侧边栏 / BGM / effects panel | 主桌面模块：BGM、FX、EXPORT、SESSION |

## 推荐工作流

1. 打开视频并播放。
2. 先用取景操作锁定画面主体。
3. 需要保留路径时开始 crop recording。
4. 播放过程中实时取景、调 FOV、调 mask、打 cut、标记丢弃段。
5. 结束 crop recording，检查 path points。
6. 渲染 preview/export。

PC 端适合调试和精细验证；头显端适合真实观看素材时直接生成取景意图。

## 播放操作

| 动作 | PC editor | 头显 / 3D UI | Timeline 状态 |
| --- | --- | --- | --- |
| 播放 / 暂停 | `Space` 或底部播放按钮 | 左右 trigger 在 160ms 内同时按下；或 playback rail `PLAY` | `playPause` |
| Seek / 进度跳转 | 拖动底部进度条 | playback rail progress；手柄 seek 暂未绑定 | `seekTo` |
| 上一个 / 下一个视频 | 播放条 prev/next | playback rail `PREV` / `NEXT` | 当前主要是本地 source index |
| 选择视频来源 | `P` 打开 playlist | playback rail source list；后续归入 `SESSION` module | 当前主要是本地 source index |
| 播放速度 | `,` / `.`，或 `T + wheel` | playback rail `0.5x / 1x / 2x` | 目前主要影响本地预览 |
| 录制速度 | `R + wheel` | playback rail `Rec - / Rec reset / Rec +` | 目前主要是本地记录状态 |

## 取景与锁定

| 动作 | PC editor | 头显 / 手柄 | Timeline 状态 |
| --- | --- | --- | --- |
| 鼠标/射线点选取景 | 鼠标点击画面 | trigger 短按，用 controller ray 点击 360 sphere | `setViewTarget` + `lockViewport` + `flushPath lock` |
| 头显 gaze 取景 | PC 无主要对应 | trigger 长按超过 280ms，取景框跟随头显；松开提交 | `setViewTarget` + `lockViewport` + `flushPath lock` |
| 拖拽取景 | 鼠标/键盘微调 | right grip hold，右手 ray 连续拖拽；松开提交 | `controllerAimStart` / `setViewTarget` / `controllerAimEnd` |
| 锁定 / 解锁 | `L` 或 workbench Lock | 主桌面 `LOCK`，或 B quick menu `LOCK` | `lockViewport` / `unlockViewport` + `flushPath lock` |
| Yaw/Pitch 微调 | `W/A/S/D` | 主桌面 Yaw/Pitch 按钮；头显优先用 right grip ray | 提交后进入 path |

## FOV 与 Mask

### FOV

FOV 在头显端不使用单独按钮直接改变。必须进入取景拖拽状态后用摇杆调整：

```text
right grip hold -> 拖拽取景
right stick up/down -> 连续调整 FOV
release / stop -> debounce 后 flushPath reason=fov
```

| 端 | 操作 |
| --- | --- |
| PC | `Q` 缩小 FOV，`E` 扩大 FOV |
| 头显 | `right grip drag + right stick up/down` |

### Mask opacity

Mask 透明度也必须使用“按键 + 摇杆”，不放直接按钮：

```text
left grip hold -> 进入 mask opacity modifier
right stick up/down -> 调整 mask opacity
left grip release -> 退出 modifier
```

| 端 | 操作 |
| --- | --- |
| PC | `H + mouse wheel` |
| 头显 | `left grip + right stick up/down` |

当前 mask opacity 只更新本地 UI / shader；如果最终导出需要复现 mask opacity，还需要后续写入 timeline/path patch 或新增语义事件。

## Timeline 剪辑动作

| 动作 | PC editor | 头显 / 手柄 | Timeline 状态 |
| --- | --- | --- | --- |
| Cut here | `C` 或 workbench Cut | 主桌面 `CUT`，或 B quick menu `CUT` | `cutHere` |
| Save / Flush | `F` 或 workbench Flush | 主桌面 `SAVE`，或 B quick menu `SAVE` | `flushPath live` |
| 丢弃片段 | 播放时长按 `Delete`，松开结束 | 播放时 `left grip + right trigger hold`，松开结束 | start: `discardRange startMs`; end: `restoreRange startMs/endMs` + `flushPath discard` |
| Restore | workbench Restore | 主桌面 `RESTORE`，或 B quick menu `UNDO` | `restoreRange` + `flushPath restore` |

头显端丢弃片段必须直接用手柄组合，不需要先打开 UI。开始丢弃前视频必须正在播放。

## Crop Workflow

| 动作 | PC editor | 头显 / 3D UI | Timeline / backend |
| --- | --- | --- | --- |
| Start crop | Workbench `Start crop`，播放条 Record | playback rail `START REC`，主桌面 `START`，B quick menu `START` | `samplingResume` + 本地 sample |
| End crop | Workbench `End crop`，播放条 Record | playback rail `END REC`，主桌面 `END`，B quick menu `END` | `samplingPause` + `flushPath live` + backend path patch |
| Render | Workbench `Render` | 主桌面 `RENDER`，B quick menu `RENDER` | backend `renderTest` 或本地 preview |
| Download | PC download link | workflow state / `EXPORT` module | 低频导出入口 |

## Effects / BGM / Export

| 动作 | PC editor | 头显 / 3D UI | 状态 |
| --- | --- | --- | --- |
| Black fade | Effects Rack | B quick menu `BLACK`，或 `FX` module | `createEffectEvent transition.fade_black` |
| White flash | Effects Rack | B quick menu `WHITE`，或 `FX` module | `createEffectEvent transition.flash_white` |
| VHS blank | Effects Rack | B quick menu `VHS`，或 `FX` module | `createEffectEvent black.solid` |
| 完整 effects categories | `Tab` + 数字选择 | 后续放 `FX` module | 未完整迁移 |
| BGM 选择 / 试听 | `PcBgmControls` | `BGM` module 当前是本地状态入口 | API 绑定待补 |
| Export 管理 | PC export/download UI | `EXPORT` module / workflow state | 部分完成 |

## 头显端手柄速查

| 手柄输入 | 行为 |
| --- | --- |
| 单手 trigger 短按 | 用 controller ray 点击 360 sphere，平滑移动取景目标 |
| 单手 trigger 长按超过 280ms | 取景框跟随 head gaze，松开提交 |
| 左右 trigger 同按 | 播放 / 暂停 |
| right grip hold | 右手 ray 拖拽取景，松开提交 |
| right grip hold + right stick up/down | 拖拽取景时调整 FOV |
| left grip hold | 进入 mask opacity modifier |
| left grip hold + right stick up/down | 调整 mask opacity |
| left grip hold + right trigger hold | 标记 discard range，松开结束 |
| right B hold | 打开 quick menu，指向选项，松开执行 |

## B Quick Menu

当前 quick menu 用于高频动作，不放 FOV/mask 直接调节按钮。

```text
START      END        RENDER
CUT        LOCK       BLACK
WHITE      SAVE       DROP
UNDO       VHS
```

| Tile | 行为 |
| --- | --- |
| START | 开始 crop recording |
| END | 结束 crop recording 并 flush live path |
| RENDER | 渲染 preview/export |
| CUT | 当前时间切一刀 |
| LOCK | 锁定 / 解锁 viewport |
| BLACK | 插入 black fade |
| WHITE | 插入 white flash |
| SAVE | flush live path |
| DROP | 低频 discard 入口；精确丢弃优先用 `left grip + right trigger hold` |
| UNDO | restore range |
| VHS | 插入 VHS blank |

## PC 快捷键速查

| 快捷键 | 功能 |
| --- | --- |
| `Space` | 播放 / 暂停 |
| `W/A/S/D` | 连续移动取景中心 |
| `Q/E` | 连续调整 FOV |
| `C` | Cut here |
| `F` | Flush live path |
| `Delete` hold | 标记 discard range |
| `T + wheel` | 调播放速度 |
| `R + wheel` | 调录制速度 |
| `H + wheel` | 调 mask opacity |
| `,` / `.` | 降低 / 提高播放速度 |
| `P` | 打开 / 关闭 playlist |
| `Tab` + 数字 | Effects Rack category/effect 快捷选择 |

## 常见问题

### 为什么头显端摇杆不能直接调 FOV？

为了避免误触，FOV 必须和取景拖拽绑定。先按住 right grip 进入拖拽取景，再用 right stick 调 FOV。

### 为什么 mask 没有 MASK0 / MASK+ 按钮？

Mask opacity 现在也收敛为组合操作：left grip + right stick。这样和 PC 的 `H + wheel` 一致，都是“按住 modifier 再连续调参”。

### 为什么头显端丢弃片段不用 quick menu？

丢弃片段是播放中高频动作，需要快速、连续、可按住，所以主路径是 `left grip + right trigger hold`。Quick menu 的 `DROP` 只保留为低频/备用入口。

### 头显端操作是否都进入 timeline？

播放、seek、取景、锁定、FOV、cut、start/end crop、black/white/VHS effect、discard range 大多已经进入 semantic event。mask opacity 和 BGM 目前主要是本地状态，导出语义还需要后续补齐。

## 相关文档

- [PC 到 Three Official 操作映射](../project-docs/02-current-state/pc-editor-to-three-official-operation-mapping.md)
- [Three Official 当前状态](../project-docs/02-current-state/three-official-interactive-lab-current-state.md)
- [Quest 3 硬件输入事实](../project-docs/04-troubleshooting/quest3-webxr-hardware-input-facts.md)
- [首次全链路 WebXR Android 导出测试](../project-docs/05-test-plans/first-full-chain-webxr-android-export.md)
