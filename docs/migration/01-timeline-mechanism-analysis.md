# Timeline机制深度分析

## 核心数据结构

### 1. ViewPathPoint（视图路径点）

```typescript
type ViewPathPoint = {
  seq: number;              // 序列号
  tMs: number;              // 视频时间戳（毫秒）
  center: {                 // 视口中心
    yaw: number;            // 水平角度
    pitch: number;          // 垂直角度
  };
  fov: {                    // 视野范围
    h: number;              // 水平FOV
    v: number;              // 垂直FOV
  };
  roll: number;             // 滚动角度
  enabled: boolean;         // 是否启用
  cut: boolean;             // 是否为切点
  locked: boolean;          // 是否锁定
  smoothFollow: boolean;    // 是否平滑跟随
  interpolation?: "linear" | "fast" | "hold";  // 插值方式
  transitionMs?: number;    // 过渡时间
  input: "head_gaze" | "controller_ray";  // 输入源
};
```

**关键理解：**
- ViewPathPoint 是timeline的基本单位
- 每个点记录了某个时间戳的完整视口状态
- `cut: true` 表示这是一个切点（剪辑点）
- `input` 区分PC模式（crop-mask）和VR模式（head_gaze/controller_ray）

---

### 2. ViewPathPatch（视图路径补丁）

```typescript
type ViewPathPatch = {
  version: 1;
  videoId: string;
  sessionId: string;
  takeId: string;           // 本次录制的唯一ID
  pathRevision: number;     // 路径版本号（递增）
  replaceRange: {
    startMs: number;        // 替换范围起始
    endMs: number;          // 替换范围结束
    reason: "live" | "replay" | "discard" | "restore" | "cut" | "fov" | "lock";
  };
  points: ViewPathPoint[];  // 要替换的点集合
};
```

**关键理解：**
- Patch是增量更新机制，不是全量替换
- `replaceRange` 定义了要替换的时间范围
- `reason` 标识了这次更新的原因（实时录制/回放/丢弃/恢复/切点/FOV调整/锁定）
- `pathRevision` 用于版本控制和冲突检测

---

### 3. EffectEvent（特效事件）

```typescript
type EffectEvent = {
  seq: number;
  displayName?: string;
  startMs: number;          // 特效开始时间
  endMs: number;            // 特效结束时间
  eventName: EffectEventName;  // 特效类型
  params?: Record<string, unknown>;  // 特效参数
  enabled?: boolean;
  renderPolicy?: {
    fallback?: "ignore" | "warn" | "fail";
    requires?: string[];
    priority?: number;
    conflictGroup?: string;
  };
};
```

**内置特效类型：**
- `highlight` - 高亮
- `black.solid` - 纯黑
- `transition.fade_black` - 淡入淡出黑色
- `transition.flash_white` - 白色闪光
- `filter.blur` - 模糊
- `filter.color_grade` - 调色
- `filter.chromatic_aberration` - 色差
- `filter.vignette` - 暗角
- `overlay.letterbox` - 信箱遮幅
- `overlay.text` - 文字叠加

---

### 4. PlaybackClientState（播放客户端状态）

```typescript
type PlaybackClientState = {
  sessionId: string;
  videoId: string;
  clientTimeMs: number;     // 客户端时间
  videoTimeMs: number;      // 视频时间
  playbackRate: number;     // 播放速度
  previousPlaybackRate?: number;
  discardFastForwardRate: 5;  // 丢弃模式快进速度
  preview: {
    brightness: number;
    contrast: number;
    overlayOpacity: number;
  };
  recording: {
    samplingPaused: boolean;  // 是否暂停采样
    discardMode: boolean;     // 是否丢弃模式
    recordingRate?: number;   // 录制速度意图
  };
};
```

---

## Timeline Bridge工作机制

### 核心组件

```
AFrameTimelineBridge
├── PathSampler          # 路径采样器
├── PathPatchQueue       # 路径补丁队列
├── EffectEventQueue     # 特效事件队列
└── PlaybackStateReporter # 播放状态报告器
```

### 数据流向

```
1. 用户操作（键盘/鼠标/VR控制器）
   ↓
2. 更新 ViewTargetState（视口目标状态）
   ↓
3. PathSampler.record() - 每200ms采样一次
   ↓
4. 缓冲点达到阈值（10个点或2秒）
   ↓
5. PathPatchQueue.buildPatch() - 构建补丁
   ↓
6. PathPatchQueue.flush() - 发送到后端
   ↓
7. 后端返回 accepted 状态
   ↓
8. 更新 lastAcceptedPathPatch
```

### 关键参数

- **采样间隔：** 200ms（DEFAULT_SAMPLE_INTERVAL_MS）
- **刷新间隔：** 2000ms（DEFAULT_FLUSH_INTERVAL_MS）
- **最大缓冲点：** 10个（DEFAULT_MAX_BUFFERED_POINTS）
- **替换范围填充：** 200ms（DEFAULT_REPLACE_PADDING_MS）

---

## 语义事件系统（WebXrSemanticEvent）

Timeline Bridge已经有一个内置的语义事件系统：

```typescript
type WebXrSemanticEvent =
  | { type: "playPause" }
  | { type: "seekTo"; tMs: number }
  | { type: "lockViewport" }
  | { type: "unlockViewport" }
  | { type: "toggleLock" }
  | { type: "setFov"; h: number; v?: number }
  | { type: "nudgeFov"; deltaH: number }
  | { type: "discardRange"; startMs?: number; endMs?: number }
  | { type: "restoreRange"; startMs?: number; endMs?: number }
  | { type: "cutHere" }
  | { type: "createEffectEvent"; ... }
  | { type: "flushPath"; reason?: TimelinePatchReason }
  | { type: "samplingPause" }
  | { type: "samplingResume" }
  | { type: "setViewTarget"; pose: ViewTargetPose }
  | { type: "controllerAimStart"; hand?: "left" | "right" }
  | { type: "controllerAimEnd"; hand?: "left" | "right" };
```

**重要发现：** Timeline Bridge已经实现了事件驱动架构！

---

## PC模式 vs VR模式的差异

### PC模式（crop-mask）

```
用户操作 → 更新 CropMaskState → Timeline Bridge读取crop-mask状态
→ 生成 ViewPathPoint（input: "head_gaze"）
```

- 视口来源：固定的屏幕crop mask
- 用户看到：360视频在固定遮罩后面移动
- 发送给后端：crop mask的center/fov

### VR模式（xr-pose）

```
用户操作 → XR头显/控制器姿态 → Timeline Bridge读取XR pose
→ 生成 ViewPathPoint（input: "head_gaze" | "controller_ray"）
```

- 视口来源：头显姿态或控制器射线
- 用户看到：通过头显直接观看360视频
- 发送给后端：头显/控制器的pose

---

## 关键发现与重构影响

### 发现1：Timeline Bridge已经是事件驱动的

Timeline Bridge内部使用 `WebXrSemanticEvent` 进行通信，这意味着：
- ✅ 不需要从零开始建立事件系统
- ✅ 可以扩展现有的 `WebXrSemanticEvent`
- ⚠️ 需要区分"Timeline内部事件"和"Editor全局事件"

### 发现2：数据流是单向的

```
UI操作 → 语义事件 → Timeline Bridge → 后端API
```

这个流向已经很清晰，重构时应该保持这个模式。

### 发现3：状态管理是分层的

```
ViewTargetState（视口目标状态）
  ↓ 采样
ViewPathPoint（路径点）
  ↓ 批处理
ViewPathPatch（补丁）
  ↓ 发送
后端Timeline
```

每一层都有明确的职责，重构时不应该打破这个分层。

### 发现4：PC和VR的差异在输入源

- PC模式：`viewTargetSource: "crop-mask"`
- VR模式：`viewTargetSource: "xr-pose"`

重构时应该保持这个抽象，让不同输入源可以共享同一套timeline逻辑。

---

## 对重构计划的影响

### 需要调整的地方

1. **事件系统设计**
   - 不要重新发明轮子，扩展 `WebXrSemanticEvent`
   - 区分"Timeline事件"（已有）和"Editor事件"（新增）
   - Editor事件应该转换为Timeline事件

2. **工作流提取**
   - Crop工作流本质是：控制 `samplingPaused` 和发送 `flushPath` 事件
   - Render工作流本质是：等待 `lastAcceptedPathPatch` 达到预期状态，然后调用后端API
   - 不要破坏Timeline Bridge的内部逻辑

3. **适配器层**
   - Timeline Bridge已经是一个适配器（前端状态 → 后端协议）
   - 新的适配器层应该在Timeline Bridge之上，处理更高层的业务逻辑

4. **特效系统**
   - 特效已经有明确的数据结构（EffectEvent）
   - 特效系统应该生成 `EffectEvent`，然后通过 `EffectEventQueue` 发送
   - 不要绕过Timeline Bridge直接调用API

---

## 下一步

基于这些发现，我需要重新设计重构计划，确保：
1. 尊重现有的Timeline Bridge架构
2. 扩展而不是替换现有的事件系统
3. 保持数据流的单向性和分层清晰度
