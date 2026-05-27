# PC Editor 到 Three Official 3D UI 操作映射

日期：2026-05-24

本文用于确认 `/xr/player` 的 PC editor 单元操作，在 `/xr/three-official-interactive-lab` 中是否已经有对应的 3D UI、手柄按键方案，以及是否能正常合成进 timeline / semantic event。

目标不是继续拆代码，而是先把当前复刻后的效果讲清楚：平面布局和按钮优先对齐 PC editor；具体视觉仍保留 three-official 的霓虹、半透明、空间 UI 气质。

相关代码：

```text
apps/web/src/features/webxr/pc-editor/PcWebXrEditor.tsx
apps/web/src/features/webxr/pc-editor/ui/PcPlayerControls.tsx
apps/web/src/features/webxr/pc-editor/ui/PcWorkbenchPanel.tsx
apps/web/src/features/webxr/pc-editor/ui/PcEffectsPanel.tsx
apps/web/src/features/webxr/pc-editor/ui/PcBgmControls.tsx
apps/web/src/features/webxr/pc-editor/controls/inputs/usePcKeyboardShortcuts.ts
apps/web/src/features/webxr/pc-editor/data/timeline-bridge/types.ts

apps/web/src/components/three/ThreeOfficialInteractiveLab.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialPlayerPanel.tsx
apps/web/src/components/three/three-official-lab/ThreeOfficialArwesWorkbenchDesk.tsx
apps/web/src/components/ArwesWorkbenchPlaneLab.tsx
apps/web/src/components/three/three-official-lab/constants.ts
```

## 当前处理后的 UI 效果

当前 three-official 页面已经不再使用中间 45 度的大扩展面板作为主要操作 UI。该位置改成 PC editor 风格的播放进度条 / playback rail：

```text
ThreeOfficialPlayerPanel
-> HTMLMesh
-> position: (0, 1.16, -1.66)
-> rotation.x: -0.9
```

它现在承载：

| 区域 | 当前 3D UI 位置 | 角色 |
| --- | --- | --- |
| 中间 playback rail | `ThreeOfficialPlayerPanel.tsx` | 播放进度、播放/暂停、上一条/下一条、录制开关、播放速率、录制速率、来源选择 |
| 主桌面 | `ThreeOfficialArwesWorkbenchDesk.tsx` + `ArwesWorkbenchSurface` | CUT、LOCK、SAVE、DISCARD、RESTORE、Yaw/Pitch、Workflow、模块入口、状态灯、FOV/mask 读数 |
| B 键 quick menu | Three.js 空间 tile | 高频手柄操作：start/end/render/cut/lock/save/discard/restore/mask/effect |
| 隐藏 workflow state | `ThreeOfficialWorkflowState.tsx` | e2e / backend bridge 保留入口，用户主视觉中不抢位置 |
| HUD / mode strip | `ThreeOfficialLabHud` / mode state | 调试、状态、当前 action 反馈 |

这个布局的判断是：PC editor 的“底部播放条 + 侧边/桌面工作台”已经有对应角色；视觉语言不直接复制 PC CSS，而是用 three-official 的空间 HTMLMesh 写法重新承载。

## 状态标记

| 标记 | 含义 |
| --- | --- |
| OK | 已有 UI / 手柄入口，并且会派发 timeline semantic event 或 backend path patch |
| Partial | UI 或本地状态已有，但 timeline / backend 合成还不完整 |
| UI Only | 只是视觉或本地交互入口，还没有接到真实 timeline 语义 |
| Proposed | 当前没有实现，本文给出建议映射 |

## 播放与进度

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 播放 / 暂停 | `Space`，播放条主按钮 | playback rail `PLAY_TOGGLE`，主桌面 `PLAY` | OK：左右 trigger 在 160ms 内同时按下 | OK：`playPause` | 已经是最常用操作，适合保留为双 trigger 组合 |
| 拖动进度 / seek | PC 播放条 range | playback rail progress range | Proposed：`B hold + right stick left/right` 或 future A/X 长按 seek | OK：`seekTo` | Three rail 已经会派发 `seekTo`，但真实手柄 seek 还没绑定 |
| 上一个 / 下一个视频 | PC 播放条 prev/next | playback rail `PREV` / `NEXT` | Proposed：`B hold + stick left/right` 在播放菜单页切换 | Partial：当前只切本地 `videoIndex` | 还没有 timeline semantic；如果只切 3D 播放源，本地即可 |
| 来源列表选择 | PC playlist `P` + item | playback rail 前两条 source button | Proposed：放在主桌面 `SESSION` 或 playback rail source list | Partial：本地 source index | PC 有完整 playlist；Three 目前是简化 source list |
| 打开 / 关闭 playlist | `P` | playback rail `SELECT_SOURCE` 列表常驻简化版 | Proposed：主桌面 `SESSION` 模块 | UI Only | three-official 不需要照搬 DOM 弹层，可以做空间小列表 |
| 播放速率 | `Z + wheel` | playback rail `0.5x / 1x / 2x` | Proposed：`right grip + right stick up/down` 或 quick menu 第二页 | Partial：只改 video.playbackRate | 当前没有独立 semantic event，PC 端也主要是 playback controller 状态 |
| 录制速率 | `X + wheel` | playback rail `Rec - / Rec reset / Rec +` | Proposed：`left grip + B` 打开 workflow page 后用 stick 调整 | Partial：本地 recordingRate | 录制路径采样目前不真正按 recordingRate 重采样 |
| 隐藏 / 恢复播放 UI | PC close overlays / options | playback rail `DIM / RESTORE` | Proposed：`B + menu button` 或放在 HUD | UI Only | 只影响空间 UI 强弱，不进入 timeline |

## 取景、视角与 FOV

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 设置取景中心 | 鼠标点击 / mask pointer | 主桌面 yaw/pitch 操作；canvas click；controller ray | OK：trigger 短按 ray click；right grip hold 拖动 ray | OK：`setViewTarget` + `lockViewport` + `flushPath lock` | Three 这里比 PC 更适合空间操作 |
| 头显 gaze 取景 | PC 主要是鼠标/键盘；XR 可读 headset pose | 3D viewfinder / crop mask | OK：trigger 长按超过 280ms，松开提交 | OK：`setViewTarget` + `lockViewport` + `flushPath lock` | 这是 three-official 的优势操作，应保留 |
| 锁定 / 解锁 viewport | PC `L` / workbench Lock | 主桌面 `LOCK`，quick menu 中心 `LOCK` | OK：B quick menu 选 `LOCK` | OK：`lockViewport` / `unlockViewport` + `flushPath lock` | 目前主桌面与手柄都有入口 |
| Yaw 左 / 右 | PC `A` / `D` | 主桌面 `YAW_LEFT` / `YAW_RIGHT` | OK 替代：right grip ray 或 trigger ray；Proposed：quick menu 第二页 | OK：提交后走 `setViewTarget` + `flushPath lock` | 不一定需要单独绑定物理按键，ray 更自然 |
| Pitch 上 / 下 | PC `W` / `S` | 主桌面 `PITCH_UP` / `PITCH_DOWN` | OK 替代：right grip ray 或 trigger ray；Proposed：quick menu 第二页 | OK：提交后走 `setViewTarget` + `flushPath lock` | 同上 |
| FOV 连续调整 | PC `Q` / `E`，wheel | 主桌面只显示 FOV 读数，不再把 FOV +/- 作为主要按钮 | OK：right grip 拖拽取景时 + right thumbstick 上下 | OK：`nudgeFov` + debounce `flushPath fov` | 已按“摇杆 + 拖拽”收敛，避免误触按钮改 FOV |
| FOV 精确设置 | PC slider / operation | 主桌面显示 FOV 读数；实际修改交给手柄拖拽 + 摇杆 | Proposed：后续如需精确值，可做只在 FOV module 中出现的细调模式 | OK if wired：`setFov` | 当前不建议在主桌面放 FOV +/- 按钮 |
| 路径 flush / save | PC `F` / Flush | 主桌面 `SAVE` / `FLUSH` | Proposed：`B quick menu` 第二页放 `SAVE` | OK：`flushPath live` | 当前主桌面有按钮，手柄缺少高频快捷 |

## Mask 与透明度

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| mask opacity | PC opacity slider，`H + wheel` | 主桌面只显示 mask 读数 | OK：left grip hold + right thumbstick 上下 | Partial：只更新本地 shader / UI | 已按“按键 + 摇杆”收敛；当前不派发 semantic event |
| mask clear | PC `Clear` | 不再放直接按钮 | Proposed：left grip + right stick 拉到底，或后续 left grip + stick click reset | UI Only / Proposed | 避免一个按钮直接改变 mask |
| mask deepen | PC `Deepen` | 不再放直接按钮 | Proposed：left grip + right stick 推到默认深度，或后续 left grip + stick click reset | UI Only / Proposed | 避免一个按钮直接改变 mask |
| mask center 微调 | PC `W/A/S/D` 连续移动 | Three 使用 viewTarget / crop frame 取景模型 | OK 替代：trigger ray、right grip ray、head gaze | OK：作为 view target 合成进 path | Three 不建议机械复刻 WASD，空间 ray 更符合 Quest |

## Timeline 剪辑与路径合成

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Cut here | workbench Cut 按钮 | 主桌面大 `CUT`，quick menu `CUT` | OK：B quick menu 选 `CUT` | OK：`cutHere` | 键盘 `C` 已释放给视效倍速，Cut 走 UI / VR 入口 |
| Discard range | 长按 `Delete` 开始，松开结束 | 主桌面 `DISCARD` 保留低频按钮 | OK：left grip + right trigger hold 开始，松开 right trigger 或 left grip 结束 | OK：开始 `discardRange startMs`，结束 `restoreRange startMs/endMs` + `flushPath discard` | 已改成直接手柄按键，不需要先打开 UI |
| Restore range | workbench restore / marker | 主桌面 `RESTORE` | Proposed：`left grip + B` quick menu 第二页 `RESTORE` | Partial：当前按钮派发 `restoreRange` + `flushPath restore`，无时间参数 | 适合低频入口，不必占主手柄快捷 |
| Start crop recording | workbench Start crop，播放条 Record | playback rail `START REC`，主桌面 workflow，quick menu `START` | OK：B quick menu `START` | OK：`samplingResume`，并记录本地 sample | 高频工作流入口，也可放主桌面醒目按钮 |
| End crop recording | workbench End crop，播放条 Record | playback rail `END REC`，workflow，quick menu `END` | OK：B quick menu `END` | OK：`samplingPause` + `flushPath live` + backend path patch | 可以正常合成 path points |
| Render preview/export | workbench Render | workflow state / quick menu `RENDER` | OK：B quick menu `RENDER` | Partial：调用 backend `renderTest` 或本地 preview；本身不是 timeline event | 依赖 session/video query binding |
| Download export | PC download link | workflow state download link | Proposed：主桌面 `EXPORT` module | UI Only | 适合放主桌面，不建议手柄高频化 |

## Effects

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Black fade | Effects Rack transition / number shortcut | quick menu `BLACK` | OK：B quick menu `BLACK` | OK：`createEffectEvent transition.fade_black` | 已经能进入 effect event queue |
| White flash | Effects Rack transition / number shortcut | quick menu `WHITE` | OK：B quick menu `WHITE` | OK：`createEffectEvent transition.flash_white` | 已经能进入 effect event queue |
| VHS blank | PC Effects Rack | 代码有 `effectVhs`，当前没有明显按钮 | Proposed：主桌面 `FX` module 或 quick menu effects page | OK if wired：`createEffectEvent black.solid` | 函数存在，缺 UI 入口 |
| 完整 PC effects categories | Tab + 1-6 category/effect | 主桌面 `FX` module 目前偏占位 | Proposed：`B + right grip` 打开 effects page，stick / ray 选择 | Missing / Proposed | 不建议塞进 playback rail，应放右侧/主桌面 FX module |

## BGM / Audio / Session / Export

| PC editor 操作 | PC 入口 | Three official 入口 | 手柄方案 | Timeline / 合成状态 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 选择 BGM | `PcBgmControls` list | 主桌面有 `BGM` module 名称；Three 内部有 `selectBgm` 本地状态 | Proposed：放 `ThreeOfficialArwesWorkbenchDesk.tsx` 的 BGM module | UI Only / Missing backend | 用户说的“少数新增音频”适合放主桌面，不抢手柄高频 |
| BGM preview | PC BGM play/pause | Three 内部有 `toggleBgmPreview` 本地状态 | Proposed：主桌面 BGM module 小按钮 | UI Only | 还没有接真实 audio element / API |
| session music update | PC `updateSessionMusic` | 当前 Three 未接 | Proposed：主桌面 `BGM` / `SESSION` module | Missing | 后续需要复用 `PcBgmControls` 的 API 逻辑 |
| Session / source 管理 | PC playlist + session UI | 主桌面 `SESSION` module 名称 | Proposed：主桌面模块 | UI Only | 低频操作，不建议挤进 quick menu 第一页 |
| Export / download | PC export status + download | 主桌面 `EXPORT` module + workflow state | Proposed：主桌面模块 | Partial | render 已有，导出管理 UI 还需完善 |

## 当前真实手柄按键

| 输入 | 当前行为 | 对应 PC 操作 | Timeline / 合成 |
| --- | --- | --- | --- |
| 单手 trigger 短按 | controller ray 点击 360 sphere，平滑移动 view target | 鼠标点击设置取景 | 最终提交时 `setViewTarget` / `lockViewport` / `flushPath lock` |
| 单手 trigger 长按超过 280ms | viewfinder 跟随头显 gaze，松开提交 | XR gaze 取景 | `setViewTarget` / `lockViewport` / `flushPath lock` |
| 左右 trigger 160ms 内同时按 | 播放 / 暂停 | `Space` | `playPause` |
| right grip hold | 右手 ray 连续拖动取景，松开提交 | 拖动取景 / 微调中心 | `controllerAimStart` / `setViewTarget` / `controllerAimEnd` |
| left grip hold | 进入 opacity modifier | `H + wheel` | 本地 opacity，暂不进 timeline |
| right grip hold + right thumbstick 上下 | 拖拽取景时同步调 FOV | `Q/E` 或 wheel FOV | `nudgeFov` + `flushPath fov` |
| left grip + right thumbstick 上下 | 调 mask opacity | opacity slider | 本地 opacity |
| left grip + right trigger hold | 直接标记 discard range，松开结束 | 长按 `Delete` 丢弃片段 | `discardRange` + `restoreRange` + `flushPath discard` |
| right B button hold | 打开 3x3 quick menu | 高频工具盘 | 释放时执行选中 action |

## 当前 B 快捷菜单

```text
START      END        RENDER
CUT        LOCK       BLACK
WHITE      SAVE       DROP
UNDO       VHS
```

| Tile | 当前 action | Timeline / backend |
| --- | --- | --- |
| START | `startCropWorkflow()` | `samplingResume` + 本地 path sample |
| END | `endCropWorkflow()` | `samplingPause` + `flushPath live` + backend path patch |
| RENDER | `renderCropWorkflow()` | backend `renderTest` 或本地 preview |
| CUT | `cutHere` | OK |
| LOCK | `lockViewport` / `unlockViewport` + `flushPath lock` | OK |
| BLACK | `createEffectEvent transition.fade_black` | OK |
| WHITE | `createEffectEvent transition.flash_white` | OK |
| SAVE | `flushPath live` | OK |
| DROP | `discardRange` + `flushPath discard` | Partial：按钮入口保留，精确区间优先用 left grip + right trigger |
| UNDO | `restoreRange` + `flushPath restore` | Partial：无时间参数 |
| VHS | `createEffectEvent black.solid` | OK |

## 建议的手柄组合键补齐

当前第一优先级应该是覆盖 PC editor 的高频单元操作，而不是把低频设置全部塞进手柄。

| 建议组合 | 操作 | 原因 | 状态 |
| --- | --- | --- | --- |
| 保留：左右 trigger 同按 | Play / Pause | 高频且不误触 | 已实现 |
| 保留：right trigger tap / hold | ray target / head gaze | Quest 空间操作优势 | 已实现 |
| 保留：right grip hold | 连续拖动取景 | 比 PC WASD 更自然 | 已实现 |
| 调整：right grip drag + right stick | FOV | 高频调景别，但必须在拖拽取景时发生 | 已实现 |
| 保留：left grip + right stick | mask opacity | 类似 PC `H + wheel` | 已实现，本地状态 |
| 新增：B menu 第二页 | SAVE / DISCARD / RESTORE / MASK 0 / MASK 0.74 / VHS | 不挤爆第一屏 | Proposed |
| 新增：B hold + right stick left/right | seek 或 quick menu page switch | 对应 PC 进度条拖动 / playlist | Proposed |
| 已加：left grip + right trigger hold | discard range hold | 对应 PC 长按 Delete，并满足直接手柄按键操作 | 已实现 |
| 新增：right grip + B | effects page | 对应 PC Tab effects | Proposed |
| 新增：left grip + B | workflow/audio page | Start/End/Render/BGM/Export 等低频模块 | Proposed |

如果后续能稳定读取 Meta Quest 的 A/X/Y button：

| 物理键 | 建议用途 | 说明 |
| --- | --- | --- |
| A | Cut here | 超高频，PC 端当前由 workbench Cut 按钮承载 |
| X | Lock / unlock | 左手确认类操作 |
| Y | Restore 或 open module | 低频恢复/菜单 |
| B | Quick menu | 当前已经使用，继续作为 radial/menu 入口 |

这些 A/X/Y 目前不在当前代码的真实读取路径里，所以文档只作为下一步建议。

## 主桌面应该承载的低频/新增操作

用户特别提到“音频、开始录制等少数新增的放在主桌面 `ThreeOfficialArwesWorkbenchDesk.tsx` 等”。当前建议如下：

| 模块 | 应放内容 | 原因 |
| --- | --- | --- |
| `WORKFLOW` | Start crop、End crop、Render、recording rate、path samples | 录制/导出是流程状态，适合桌面清楚展示 |
| `BGM` | BGM select、preview、clear、gain/startMs | 音频是低频配置，放手柄第一层会干扰剪辑 |
| `FX` | 完整 effects categories、VHS、color/speed/frame/glitch/marker | quick menu 第一页只保留 black/white 高频效果 |
| `EXPORT` | render status、download、last export id | 和 backend 状态绑定，适合桌面 |
| `SESSION` | source list、playlist、session binding、video id/session id | 低频管理操作 |
| `FOV` | FOV 读数、mask opacity 读数、手柄提示 | FOV 修改交给 right grip drag + right stick；mask 修改交给 left grip + right stick |

## 当前缺口清单

| 缺口 | 影响 | 建议优先级 |
| --- | --- | --- |
| Playback rate 只改本地 video，不派发 semantic | timeline 不知道速率变化 | P2，若导出需要速度曲线则升 P1 |
| Prev/Next/Source select 只改本地 index | session playlist 状态不统一 | P2 |
| Mask opacity 不进入 timeline/path patch | 导出可能无法复现透明度 | P1，如果 mask opacity 会影响最终裁剪 |
| Discard 的直接手柄 hold range 已补；主桌面 DROP 仍是无时间参数入口 | 桌面按钮不能精确标记区间 | P2 |
| BGM 只是 module 名称/本地状态，没有复用 API | 音频无法真实写入 session music | P2 |
| 完整 Effects Rack 没有 3D UI | 只有 black/white 高频效果完整 | P2 |
| FOV 不再用 +/- 按钮，后续需要更清楚的手柄提示 | Quest 首次使用者可能不知道要 grip+stick | P2 |
| A/X/Y 物理键未读取 | 可用组合键数量受限 | P3，先依赖 trigger/grip/B/stick |

## 最小验收路径

当前要证明 “PC 单元操作在 Three 里有对应方案，并且合成进 timeline 正常”，建议按这个顺序验收：

1. Playback rail 点击 `PLAY_TOGGLE`，确认派发 `playPause`，视频状态变化。
2. Playback rail 拖 progress，确认派发 `seekTo`。
3. right trigger 短按 sphere，确认 view target 提交并派发 `setViewTarget`、`lockViewport`、`flushPath lock`。
4. right grip 拖拽取景时推动 right thumbstick 调 FOV，确认派发 `nudgeFov`，停止后 `flushPath fov`。
5. B quick menu 执行 `CUT`，确认 `cutHere`。
6. B quick menu 执行 `START -> END`，确认 `samplingResume`、`samplingPause`、`flushPath live`，并看到 backend accepted path points。
7. B quick menu 执行 `BLACK / WHITE`，确认 `createEffectEvent`。
8. 主桌面执行 `DISCARD / RESTORE`，确认至少派发对应 semantic；后续再补 range 参数。

## 一句话结论

目前 three-official 已经具备 PC editor 核心剪辑链路的对应入口：播放、seek、取景、锁定、FOV、cut、start/end/render、black/white effects 都有 UI 或手柄路径，并且大部分会进入 timeline semantic event。当前已补上直接手柄 discard range，以及 right grip drag + right stick 的 FOV 模式。还需要优先补齐的是：mask opacity 的导出语义、BGM/API 和完整 effects rack。
