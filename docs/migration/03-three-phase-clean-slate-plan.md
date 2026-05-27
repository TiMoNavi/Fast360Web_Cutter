# 3阶段清洁重构计划（新页面策略）

## 执行摘要

**核心策略：** 新建页面，分3个大阶段渐进式迁移

**时间分配：** 3天（每阶段1天）

**新页面路由：** `/xr/player-v2` （开发完成后替换 `/xr/player`）

**原页面保留：** `/xr/player` 作为参考和回退方案

---

## 为什么选择新页面策略？

### ✅ 优势

1. **代码更干净** - 从零开始，没有历史包袱
2. **风险可控** - 原页面继续工作，随时可以回退
3. **并行开发** - 不影响现有功能，可以大胆重构
4. **清晰对比** - 新旧页面可以并排对比验证
5. **渐进上线** - 可以灰度发布，逐步切换流量

### ⚠️ 注意事项

1. **避免重复代码** - 尽量复用底层模块（Timeline Bridge、API等）
2. **保持数据兼容** - 使用相同的后端协议
3. **最终要删除旧页面** - 不是永久维护两套代码

---

## 整体架构设计

### 目录结构

```
apps/web/src/features/webxr/
├── pc-editor/              # 旧页面（保留作为参考）
│   ├── PcWebXrEditor.tsx
│   ├── data/
│   ├── webxr/
│   ├── ui/
│   └── controls/
│
└── player-v2/              # 新页面（重构目标）
    ├── PlayerV2.tsx        # 主组件（精简）
    │
    ├── core/               # 核心基础设施
    │   ├── events/         # 事件系统
    │   ├── state/          # 状态管理
    │   └── hooks/          # 通用hooks
    │
    ├── webxr/              # WebXR兼容层
    │   ├── XrScene.tsx     # A-Frame场景
    │   ├── XrVideoSphere.tsx
    │   ├── XrCropMask.tsx
    │   └── xrCompat.ts     # Meta XR兼容
    │
    ├── ui/                 # UI组件
    │   ├── player/         # 播放器UI
    │   └── editor/         # 编辑器UI
    │
    ├── workflows/          # 工作流编排
    │   ├── player/         # 播放器工作流
    │   └── editor/         # 编辑器工作流
    │
    ├── operations/         # 原子操作
    │   ├── playback/       # 播放控制
    │   ├── viewport/       # 视口控制
    │   ├── timeline/       # 时间轴操作
    │   └── effects/        # 特效操作
    │
    └── adapters/           # 后端适配器
        ├── timelineAdapter.ts
        └── sessionAdapter.ts
```

### 复用的模块

以下模块直接复用，不需要重写：

```
✅ data/timeline-bridge/     # Timeline Bridge完整保留
✅ data/buildPcEditorSessionModel.ts  # Session模型构建
✅ src/lib/api.ts            # API调用
✅ src/lib/path-protocol.ts  # 数据协议
```

---

## 阶段1：新页面空壳 + 基础迁移（Day 1）

### 目标

创建一个可以运行的空壳页面，包含：
- Meta XR兼容机制
- UI外观框架
- 视频球面渲染
- 遮罩层显示

### E2E验证标准

- ✅ 页面可以正常访问 `/xr/player-v2`
- ✅ 外观风格与旧页面一致
- ✅ Meta XR可以正常启动
- ✅ 视频可以播放
- ✅ 遮罩层可以显示
- ✅ 无JavaScript错误

### 并行任务矩阵（8个Agent）

| Agent | 任务 | 产出 | 依赖 | 工作量 |
|-------|------|------|------|--------|
| Agent-1 | 创建页面路由和主组件 | `app/xr/player-v2/page.tsx` + `PlayerV2.tsx` | 无 | 2h |
| Agent-2 | 迁移Meta XR兼容层 | `webxr/xrCompat.ts` | 无 | 2h |
| Agent-3 | 迁移A-Frame场景组件 | `webxr/XrScene.tsx` | Agent-2 | 3h |
| Agent-4 | 迁移视频球面组件 | `webxr/XrVideoSphere.tsx` | Agent-3 | 2h |
| Agent-5 | 迁移遮罩层组件 | `webxr/XrCropMask.tsx` | Agent-3 | 3h |
| Agent-6 | 创建UI框架 | `ui/player/` + `ui/editor/` | 无 | 2h |
| Agent-7 | 创建基础样式 | `PlayerV2.module.css` | Agent-6 | 2h |
| Agent-8 | 创建E2E测试 | `e2e/player-v2-smoke.spec.ts` | Agent-1 | 2h |

### 关键路径

```
Agent-1 (页面路由) → Agent-8 (E2E测试)
Agent-2 (XR兼容) → Agent-3 (场景) → Agent-4/5 (球面/遮罩)
Agent-6 (UI框架) → Agent-7 (样式)
```

**预计完成时间：** 6-8小时（1个工作日）

---

### 阶段1详细任务

#### Task 1.1: 创建页面路由和主组件（Agent-1, 2h）

**产出文件：**
- `apps/web/app/xr/player-v2/page.tsx`
- `apps/web/src/features/webxr/player-v2/PlayerV2.tsx`

**page.tsx 结构：**
```typescript
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PlayerV2 } from "@/features/webxr/player-v2";
import { buildPcEditorPlayerModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";

export default async function PlayerV2Page() {
  const cookieHeader = (await cookies()).toString();
  let model = null;
  let error = null;

  try {
    model = await buildPcEditorPlayerModel(cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  if (error || !model) {
    return <div>Error: {error}</div>;
  }

  return <PlayerV2 model={model} />;
}
```

**PlayerV2.tsx 结构（空壳）：**
```typescript
"use client";

export function PlayerV2({ model }) {
  return (
    <main className="player-v2-root">
      <div className="xr-stage">
        {/* XR场景将在这里渲染 */}
      </div>
      <div className="ui-overlay">
        {/* UI组件将在这里渲染 */}
      </div>
    </main>
  );
}
```

**验收标准：**
- ✅ 访问 `/xr/player-v2` 可以看到页面
- ✅ 页面可以正常加载session数据
- ✅ 未认证用户会重定向到登录页

---

#### Task 1.2: 迁移Meta XR兼容层（Agent-2, 2h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/webxr/xrCompat.ts`

**从旧代码迁移：**
- `pc-editor/webxr/aframeXrCompat.ts` 中的 `requestAFrameMetaVrSession`
- XRWebGLBinding 兼容逻辑
- XRProjectionLayer 创建逻辑

**核心函数：**
```typescript
export async function requestMetaXrSession(
  sceneElement: HTMLElement
): Promise<{
  session: XRSession;
  usedLegacyLayerFallback: boolean;
}> {
  // 实现Meta XR session请求逻辑
}
```

**验收标准：**
- ✅ 函数可以正常导入
- ✅ 类型定义完整
- ✅ 单元测试通过

---

#### Task 1.3: 迁移A-Frame场景组件（Agent-3, 3h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/webxr/XrScene.tsx`

**从旧代码迁移：**
- `pc-editor/webxr/AFrameEditorScene.tsx` 的场景结构
- A-Frame运行时加载逻辑
- 场景初始化和清理逻辑

**组件结构：**
```typescript
export function XrScene({
  videoElement,
  onSceneReady,
  onSessionStart,
  onSessionEnd
}) {
  return (
    <a-scene embedded>
      <a-entity id="camera-rig">
        <a-camera id="main-camera" />
      </a-entity>
      
      {/* 视频球面和遮罩将作为children传入 */}
    </a-scene>
  );
}
```

**验收标准：**
- ✅ A-Frame场景可以正常渲染
- ✅ 场景ref可以正确传递
- ✅ 生命周期钩子正常工作

---

#### Task 1.4: 迁移视频球面组件（Agent-4, 2h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/webxr/XrVideoSphere.tsx`

**从旧代码迁移：**
- `pc-editor/webxr/AFrameEditorScene.tsx` 中的 videosphere 部分
- 视频纹理映射逻辑

**组件结构：**
```typescript
export function XrVideoSphere({ videoId, videoRef }) {
  return (
    <>
      <video
        ref={videoRef}
        id={videoId}
        crossOrigin="anonymous"
        playsInline
        muted
        loop
      />
      <a-videosphere
        src={`#${videoId}`}
        rotation="0 -90 0"
      />
    </>
  );
}
```

**验收标准：**
- ✅ 视频可以正常播放
- ✅ 360度球面正确渲染
- ✅ 视频ref可以正确传递

---

#### Task 1.5: 迁移遮罩层组件（Agent-5, 3h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/webxr/XrCropMask.tsx`
- `apps/web/src/features/webxr/player-v2/webxr/cropMaskComponents.ts`

**从旧代码迁移：**
- `pc-editor/webxr/AFrameCropViewportMask.tsx` 的遮罩逻辑
- A-Frame自定义组件注册
- 遮罩状态管理

**组件结构：**
```typescript
export function XrCropMask({ 
  center, 
  fov, 
  opacity,
  onChange 
}) {
  return (
    <a-entity
      crop-viewport-mask={`
        centerYaw: ${center.yaw};
        centerPitch: ${center.pitch};
        fovH: ${fov.h};
        fovV: ${fov.v};
        opacity: ${opacity};
      `}
    />
  );
}
```

**验收标准：**
- ✅ 遮罩可以正常显示
- ✅ 遮罩位置和大小正确
- ✅ 遮罩透明度可以调整

---

#### Task 1.6: 创建UI框架（Agent-6, 2h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/ui/player/PlayerControls.tsx`
- `apps/web/src/features/webxr/player-v2/ui/editor/EditorWorkbench.tsx`
- `apps/web/src/features/webxr/player-v2/ui/XrHud.tsx`

**UI组件结构（空壳）：**
```typescript
// PlayerControls.tsx - 播放器控制条
export function PlayerControls() {
  return (
    <div className="player-controls">
      <button>Play/Pause</button>
      <div className="progress-bar" />
      <button>Playlist</button>
    </div>
  );
}

// EditorWorkbench.tsx - 编辑器工作台
export function EditorWorkbench() {
  return (
    <div className="editor-workbench">
      <div className="viewport-controls">
        <button>FOV +</button>
        <button>FOV -</button>
      </div>
      <div className="timeline-controls">
        <button>Start Crop</button>
        <button>End Crop</button>
      </div>
    </div>
  );
}

// XrHud.tsx - XR状态显示
export function XrHud({ status }) {
  return (
    <div className="xr-hud">
      <span>{status}</span>
      <button>Start Meta VR</button>
    </div>
  );
}
```

**验收标准：**
- ✅ UI组件可以正常渲染
- ✅ 布局结构清晰
- ✅ 按钮可以点击（暂无功能）

---

#### Task 1.7: 创建基础样式（Agent-7, 2h）

**产出文件：**
- `apps/web/src/features/webxr/player-v2/PlayerV2.module.css`

**从旧代码迁移样式：**
- `pc-editor/ui/PcWebXrEditor.module.css`
- 保持外观一致

**关键样式：**
```css
.player-v2-root {
  position: fixed;
  inset: 0;
  background: #000;
}

.xr-stage {
  position: absolute;
  inset: 0;
}

.ui-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ui-overlay > * {
  pointer-events: auto;
}
```

**验收标准：**
- ✅ 外观与旧页面一致
- ✅ 响应式布局正常
- ✅ 无样式冲突

---

#### Task 1.8: 创建E2E测试（Agent-8, 2h）

**产出文件：**
- `apps/web/e2e/player-v2-smoke.spec.ts`

**测试用例：**
```typescript
test('Player V2 smoke test', async ({ page }) => {
  // 1. 访问页面
  await page.goto('/xr/player-v2');
  
  // 2. 验证页面加载
  await expect(page.locator('.player-v2-root')).toBeVisible();
  
  // 3. 验证XR场景存在
  await expect(page.locator('a-scene')).toBeVisible();
  
  // 4. 验证视频球面存在
  await expect(page.locator('a-videosphere')).toBeVisible();
  
  // 5. 验证遮罩层存在
  await expect(page.locator('[crop-viewport-mask]')).toBeVisible();
  
  // 6. 验证UI组件存在
  await expect(page.locator('.player-controls')).toBeVisible();
  await expect(page.locator('.xr-hud')).toBeVisible();
  
  // 7. 验证无JS错误
  const errors = [];
  page.on('pageerror', err => errors.push(err));
  await page.waitForTimeout(2000);
  expect(errors).toHaveLength(0);
});
```

**验收标准：**
- ✅ 测试可以正常运行
- ✅ 所有断言通过
- ✅ 测试覆盖关键功能

---

## 阶段2：事件系统重构 + 基本操作（Day 2）

### 目标

建立新的层次化事件系统，实现基本的原子操作：
- 事件总线和类型定义
- Timeline Bridge集成
- 基本播放控制操作
- 基本视口控制操作
- 基本时间轴操作

### E2E验证标准

- ✅ 播放/暂停功能正常
- ✅ 视口调整（FOV、center）功能正常
- ✅ 后端收到正确的 ViewPathPatch
- ✅ 后端收到正确的 PlaybackClientState
- ✅ Timeline采样和刷新机制正常

### 并行任务矩阵（7个Agent）

| Agent | 任务 | 产出 | 依赖 | 工作量 |
|-------|------|------|------|--------|
| Agent-1 | 创建事件系统基础 | `core/events/` | 无 | 3h |
| Agent-2 | 集成Timeline Bridge | `core/timelineBridge.ts` | Agent-1 | 2h |
| Agent-3 | 实现播放控制操作 | `operations/playback/` | Agent-2 | 2h |
| Agent-4 | 实现视口控制操作 | `operations/viewport/` | Agent-2 | 3h |
| Agent-5 | 实现时间轴操作 | `operations/timeline/` | Agent-2 | 2h |
| Agent-6 | 连接UI和操作层 | 修改UI组件 | Agent-3,4,5 | 2h |
| Agent-7 | 创建E2E验证测试 | `e2e/player-v2-operations.spec.ts` | Agent-6 | 3h |

### 关键路径

```
Agent-1 (事件系统) → Agent-2 (Timeline) → Agent-3/4/5 (操作) → Agent-6 (UI连接) → Agent-7 (测试)
```

**预计完成时间：** 8小时（1个工作日）

---

### 阶段2详细任务

#### Task 2.1: 创建事件系统基础（Agent-1, 3h）

**产出文件：**
- `core/events/types.ts` - 事件类型定义
- `core/events/EventBus.ts` - 事件总线实现
- `core/events/useEvents.ts` - React hooks

**事件类型定义：**
```typescript
// types.ts
export type PlayerEvent =
  | { type: 'player.play' }
  | { type: 'player.pause' }
  | { type: 'player.toggle' }
  | { type: 'player.seek'; timeMs: number }
  | { type: 'player.rate.change'; rate: number };

export type ViewportEvent =
  | { type: 'viewport.fov.set'; fov: number }
  | { type: 'viewport.fov.adjust'; delta: number }
  | { type: 'viewport.center.set'; yaw: number; pitch: number }
  | { type: 'viewport.center.adjust'; yawDelta: number; pitchDelta: number }
  | { type: 'viewport.lock.toggle' };

export type TimelineEvent =
  | { type: 'timeline.sampling.pause' }
  | { type: 'timeline.sampling.resume' }
  | { type: 'timeline.flush'; reason: 'lock' | 'unlock' }
  | { type: 'timeline.cut' };

export type EditorEvent = PlayerEvent | ViewportEvent | TimelineEvent;
```

**事件总线实现：**
```typescript
// EventBus.ts
export class EventBus<T extends { type: string }> {
  private listeners = new Map<string, Set<(event: T) => void>>();
  
  on<E extends T>(type: E['type'], handler: (event: E) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as any);
    
    return () => {
      this.listeners.get(type)?.delete(handler as any);
    };
  }
  
  emit<E extends T>(event: E): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event));
    }
  }
}
```

**验收标准：**
- ✅ 事件类型定义完整
- ✅ 事件总线可以订阅和发射
- ✅ 类型安全

---

#### Task 2.2: 集成Timeline Bridge（Agent-2, 2h）

**产出文件：**
- `core/timelineBridge.ts` - Timeline Bridge封装

**实现：**
```typescript
import { AFrameTimelineBridge } from '@/features/webxr/pc-editor/data/timeline-bridge';
import type { EventBus } from './events/EventBus';
import type { EditorEvent, TimelineEvent } from './events/types';

export function createTimelineBridge(
  eventBus: EventBus<EditorEvent>,
  context: TimelineBridgeContext
) {
  const bridge = new AFrameTimelineBridge(context, {
    viewTargetSource: 'crop-mask',
    playbackRate: 1.0,
    recordingRate: 1.0
  });
  
  // 监听Timeline事件，转换为Timeline Bridge调用
  eventBus.on('timeline.sampling.pause', () => {
    bridge.dispatch({ type: 'samplingPause' });
  });
  
  eventBus.on('timeline.sampling.resume', () => {
    bridge.dispatch({ type: 'samplingResume' });
  });
  
  eventBus.on('timeline.flush', (event) => {
    bridge.dispatch({ 
      type: 'flushPath', 
      reason: event.reason 
    });
  });
  
  eventBus.on('timeline.cut', () => {
    bridge.dispatch({ type: 'cutHere' });
  });
  
  bridge.start();
  
  return bridge;
}
```

**验收标准：**
- ✅ Timeline Bridge可以正常启动
- ✅ 事件可以正确转换
- ✅ 采样机制正常工作

---

#### Task 2.3: 实现播放控制操作（Agent-3, 2h）

**产出文件：**
- `operations/playback/playbackOperations.ts`
- `operations/playback/usePlaybackControl.ts`

**操作函数：**
```typescript
// playbackOperations.ts
export const playbackOperations = {
  play(videoElement: HTMLVideoElement) {
    return videoElement.play();
  },
  
  pause(videoElement: HTMLVideoElement) {
    videoElement.pause();
  },
  
  toggle(videoElement: HTMLVideoElement) {
    if (videoElement.paused) {
      return this.play(videoElement);
    } else {
      this.pause(videoElement);
    }
  },
  
  seek(videoElement: HTMLVideoElement, timeMs: number) {
    videoElement.currentTime = timeMs / 1000;
  },
  
  setRate(videoElement: HTMLVideoElement, rate: number) {
    videoElement.playbackRate = rate;
  }
};
```

**React Hook：**
```typescript
// usePlaybackControl.ts
export function usePlaybackControl(
  eventBus: EventBus<EditorEvent>,
  videoRef: RefObject<HTMLVideoElement>
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const unsubscribers = [
      eventBus.on('player.play', () => playbackOperations.play(video)),
      eventBus.on('player.pause', () => playbackOperations.pause(video)),
      eventBus.on('player.toggle', () => playbackOperations.toggle(video)),
      eventBus.on('player.seek', (e) => playbackOperations.seek(video, e.timeMs)),
      eventBus.on('player.rate.change', (e) => playbackOperations.setRate(video, e.rate))
    ];
    
    return () => unsubscribers.forEach(unsub => unsub());
  }, [eventBus, videoRef]);
}
```

**验收标准：**
- ✅ 播放/暂停功能正常
- ✅ 跳转功能正常
- ✅ 播放速度调整正常

---

#### Task 2.4: 实现视口控制操作（Agent-4, 3h）

**产出文件：**
- `operations/viewport/viewportOperations.ts`
- `operations/viewport/useViewportControl.ts`

**操作函数：**
```typescript
// viewportOperations.ts
export const viewportOperations = {
  setFov(currentFov: number, targetFov: number) {
    return Math.max(30, Math.min(120, targetFov));
  },
  
  adjustFov(currentFov: number, delta: number) {
    return this.setFov(currentFov, currentFov + delta);
  },
  
  setCenter(yaw: number, pitch: number) {
    return {
      yaw: normalizeYaw(yaw),
      pitch: normalizePitch(pitch)
    };
  },
  
  adjustCenter(current: { yaw: number; pitch: number }, yawDelta: number, pitchDelta: number) {
    return this.setCenter(
      current.yaw + yawDelta,
      current.pitch + pitchDelta
    );
  }
};

function normalizeYaw(yaw: number) {
  let normalized = yaw % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

function normalizePitch(pitch: number) {
  return Math.max(-85, Math.min(85, pitch));
}
```

**验收标准：**
- ✅ FOV调整功能正常
- ✅ 视口中心调整功能正常
- ✅ 数值范围限制正确

---

#### Task 2.5: 实现时间轴操作（Agent-5, 2h）

**产出文件：**
- `operations/timeline/timelineOperations.ts`

**操作函数：**
```typescript
// timelineOperations.ts
export const timelineOperations = {
  pauseSampling(eventBus: EventBus<EditorEvent>) {
    eventBus.emit({ type: 'timeline.sampling.pause' });
  },
  
  resumeSampling(eventBus: EventBus<EditorEvent>) {
    eventBus.emit({ type: 'timeline.sampling.resume' });
  },
  
  flush(eventBus: EventBus<EditorEvent>, reason: 'lock' | 'unlock') {
    eventBus.emit({ type: 'timeline.flush', reason });
  },
  
  cut(eventBus: EventBus<EditorEvent>) {
    eventBus.emit({ type: 'timeline.cut' });
  }
};
```

**验收标准：**
- ✅ 采样暂停/恢复功能正常
- ✅ 路径刷新功能正常
- ✅ 切点标记功能正常

---

#### Task 2.6: 连接UI和操作层（Agent-6, 2h）

**修改文件：**
- `ui/player/PlayerControls.tsx`
- `ui/editor/EditorWorkbench.tsx`

**实现示例：**
```typescript
// PlayerControls.tsx
export function PlayerControls({ eventBus }) {
  const handlePlayPause = () => {
    eventBus.emit({ type: 'player.toggle' });
  };
  
  return (
    <div className="player-controls">
      <button onClick={handlePlayPause}>Play/Pause</button>
      {/* 其他控制 */}
    </div>
  );
}

// EditorWorkbench.tsx
export function EditorWorkbench({ eventBus }) {
  const handleFovIn = () => {
    eventBus.emit({ type: 'viewport.fov.adjust', delta: -5 });
  };
  
  const handleFovOut = () => {
    eventBus.emit({ type: 'viewport.fov.adjust', delta: 5 });
  };
  
  return (
    <div className="editor-workbench">
      <button onClick={handleFovIn}>FOV -</button>
      <button onClick={handleFovOut}>FOV +</button>
      {/* 其他控制 */}
    </div>
  );
}
```

**验收标准：**
- ✅ UI按钮可以触发事件
- ✅ 事件可以正确传递到操作层
- ✅ 操作结果可以反映到UI

---

#### Task 2.7: 创建E2E验证测试（Agent-7, 3h）

**产出文件：**
- `e2e/player-v2-operations.spec.ts`

**测试用例：**
```typescript
test('播放控制功能', async ({ page }) => {
  await page.goto('/xr/player-v2');
  
  // 点击播放按钮
  await page.click('button:has-text("Play")');
  
  // 验证视频正在播放
  const video = page.locator('video');
  await expect(video).toHaveJSProperty('paused', false);
  
  // 点击暂停
  await page.click('button:has-text("Pause")');
  await expect(video).toHaveJSProperty('paused', true);
});

test('视口调整功能', async ({ page }) => {
  await page.goto('/xr/player-v2');
  
  // 点击FOV+按钮
  await page.click('button:has-text("FOV +")');
  
  // 验证遮罩FOV变化
  const mask = page.locator('[crop-viewport-mask]');
  const fovBefore = await mask.getAttribute('crop-viewport-mask');
  
  await page.click('button:has-text("FOV +")');
  const fovAfter = await mask.getAttribute('crop-viewport-mask');
  
  expect(fovBefore).not.toBe(fovAfter);
});

test('后端信号验证', async ({ page }) => {
  // 监听网络请求
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/path-patches')) {
      requests.push(req);
    }
  });
  
  await page.goto('/xr/player-v2');
  
  // 触发操作
  await page.click('button:has-text("Start Crop")');
  await page.waitForTimeout(3000);
  
  // 验证后端收到正确的patch
  expect(requests.length).toBeGreaterThan(0);
  
  const body = await requests[0].postDataJSON();
  expect(body).toHaveProperty('points');
  expect(body).toHaveProperty('pathRevision');
});
```

**验收标准：**
- ✅ 所有操作测试通过
- ✅ 后端收到正确的数据
- ✅ Timeline机制正常工作

---

## 阶段3：功能模块迁移（Day 3）

### 目标

将原页面的功能模块迁移到新页面，分为两大模式：
- **播放器模式** - 视频播放、列表管理、源切换
- **剪辑器模式** - 运镜（遮罩移动）、特效、暂停/删除、渲染导出

### E2E验证标准

**播放器模式：**
- ✅ 视频列表可以正常显示
- ✅ 视频切换功能正常
- ✅ 播放进度显示正常
- ✅ 播放速度调整正常

**剪辑器模式：**
- ✅ 运镜录制功能正常（遮罩移动 → ViewPathPatch）
- ✅ 特效添加功能正常（EffectEvent）
- ✅ 暂停/删除功能正常（discard/restore）
- ✅ 渲染导出功能正常

### 并行任务矩阵（8个Agent）

| Agent | 任务 | 产出 | 依赖 | 工作量 |
|-------|------|------|------|--------|
| Agent-1 | 播放器工作流 | `workflows/player/` | 无 | 3h |
| Agent-2 | 运镜工作流 | `workflows/editor/cropWorkflow.ts` | 无 | 4h |
| Agent-3 | 特效工作流 | `workflows/editor/effectWorkflow.ts` | 无 | 3h |
| Agent-4 | 渲染工作流 | `workflows/editor/renderWorkflow.ts` | Agent-2 | 3h |
| Agent-5 | 暂停/删除操作 | `operations/timeline/discardOperations.ts` | 无 | 2h |
| Agent-6 | 完善UI组件 | 修改所有UI组件 | Agent-1,2,3,4,5 | 3h |
| Agent-7 | 键盘快捷键 | `core/shortcuts/` | Agent-6 | 2h |
| Agent-8 | 完整E2E测试 | `e2e/player-v2-full.spec.ts` | Agent-6 | 3h |

### 关键路径

```
Agent-1/2/3/4/5 (工作流和操作) → Agent-6 (UI完善) → Agent-7 (快捷键) → Agent-8 (测试)
```

**预计完成时间：** 8-10小时（1个工作日）

---

### 阶段3详细任务

#### Task 3.1: 播放器工作流（Agent-1, 3h）

**产出文件：**
- `workflows/player/PlaylistWorkflow.ts`
- `workflows/player/SourceSwitchWorkflow.ts`

**PlaylistWorkflow：**
```typescript
export class PlaylistWorkflow {
  constructor(
    private eventBus: EventBus<EditorEvent>,
    private sources: VideoSource[]
  ) {}
  
  start() {
    this.eventBus.on('player.source.select', async (event) => {
      // 1. 切换后端session
      const session = await switchPlayerSession(event.sourceId);
      
      // 2. 更新视频源
      this.eventBus.emit({ 
        type: 'player.source.changed', 
        sourceId: event.sourceId,
        sessionId: session.sessionId 
      });
      
      // 3. 重置状态
      this.eventBus.emit({ type: 'editor.reset' });
    });
  }
}
```

**验收标准：**
- ✅ 视频列表可以显示
- ✅ 视频切换功能正常
- ✅ Session切换正确

---

#### Task 3.2: 运镜工作流（Agent-2, 4h）

**产出文件：**
- `workflows/editor/CropWorkflow.ts`

**CropWorkflow：**
```typescript
export class CropWorkflow {
  private status: 'idle' | 'recording' | 'ending' | 'ready' = 'idle';
  
  constructor(
    private eventBus: EventBus<EditorEvent>,
    private timelineBridge: AFrameTimelineBridge
  ) {}
  
  start() {
    // 监听开始录制
    this.eventBus.on('crop.start', () => {
      this.status = 'recording';
      
      // 1. 恢复采样
      this.eventBus.emit({ type: 'timeline.sampling.resume' });
      
      // 2. 锁定路径
      this.eventBus.emit({ type: 'timeline.flush', reason: 'lock' });
      
      // 3. 开始播放
      this.eventBus.emit({ type: 'player.play' });
      
      // 4. 发射状态变化
      this.eventBus.emit({ type: 'crop.started' });
    });
    
    // 监听结束录制
    this.eventBus.on('crop.end', async () => {
      this.status = 'ending';
      await this.sealPath();
      this.status = 'ready';
      this.eventBus.emit({ type: 'crop.ended' });
    });
  }
  
  private async sealPath() {
    // 1. 暂停播放
    this.eventBus.emit({ type: 'player.pause' });
    
    // 2. 恢复采样
    this.eventBus.emit({ type: 'timeline.sampling.resume' });
    
    // 3. 刷新路径
    this.eventBus.emit({ type: 'timeline.flush', reason: 'lock' });
    
    // 4. 等待后端确认
    await this.waitForAccepted();
    
    // 5. 暂停采样
    this.eventBus.emit({ type: 'timeline.sampling.pause' });
  }
}
```

**验收标准：**
- ✅ 运镜录制可以开始
- ✅ 运镜录制可以结束
- ✅ 后端收到正确的ViewPathPatch

---

#### Task 3.3: 特效工作流（Agent-3, 3h）

**产出文件：**
- `workflows/editor/EffectWorkflow.ts`
- `operations/effects/effectOperations.ts`

**EffectWorkflow：**
```typescript
export class EffectWorkflow {
  constructor(
    private eventBus: EventBus<EditorEvent>,
    private timelineBridge: AFrameTimelineBridge
  ) {}
  
  start() {
    this.eventBus.on('effect.add', (event) => {
      // 通过Timeline Bridge发送特效事件
      this.timelineBridge.dispatch({
        type: 'createEffectEvent',
        effectType: event.effectType,
        startMs: event.startMs,
        endMs: event.endMs,
        params: event.params
      });
      
      this.eventBus.emit({ type: 'effect.added', effectId: event.effectType });
    });
  }
}
```

**验收标准：**
- ✅ 特效可以添加
- ✅ 后端收到正确的EffectEvent
- ✅ 特效参数正确传递

---

#### Task 3.4: 渲染工作流（Agent-4, 3h）

**产出文件：**
- `workflows/editor/RenderWorkflow.ts`

**RenderWorkflow：**
```typescript
export class RenderWorkflow {
  constructor(
    private eventBus: EventBus<EditorEvent>,
    private sessionId: string
  ) {}
  
  start() {
    this.eventBus.on('render.request', async () => {
      try {
        this.eventBus.emit({ type: 'render.started' });
        
        // 调用后端render API
        const result = await renderTest(this.sessionId);
        
        this.eventBus.emit({ 
          type: 'render.completed', 
          exportId: result.exportId 
        });
      } catch (error) {
        this.eventBus.emit({ 
          type: 'render.failed', 
          error: error.message 
        });
      }
    });
  }
}
```

**验收标准：**
- ✅ 渲染可以触发
- ✅ 渲染结果正确返回
- ✅ 导出文件可以下载

---

#### Task 3.5: 暂停/删除操作（Agent-5, 2h）

**产出文件：**
- `operations/timeline/discardOperations.ts`

**实现：**
```typescript
export const discardOperations = {
  discardRange(
    eventBus: EventBus<EditorEvent>,
    startMs?: number,
    endMs?: number
  ) {
    // 通过Timeline Bridge发送discard事件
    eventBus.emit({
      type: 'timeline.discard',
      startMs,
      endMs
    });
  },
  
  restoreRange(
    eventBus: EventBus<EditorEvent>,
    startMs?: number,
    endMs?: number
  ) {
    eventBus.emit({
      type: 'timeline.restore',
      startMs,
      endMs
    });
  }
};
```

**验收标准：**
- ✅ 暂停功能正常
- ✅ 删除功能正常
- ✅ 恢复功能正常

---

#### Task 3.6: 完善UI组件（Agent-6, 3h）

**修改文件：**
- `ui/player/PlayerControls.tsx` - 添加完整播放控制
- `ui/editor/EditorWorkbench.tsx` - 添加完整编辑控制
- `ui/editor/EffectsPanel.tsx` - 特效面板
- `ui/editor/RenderPanel.tsx` - 渲染面板

**实现示例：**
```typescript
// EditorWorkbench.tsx
export function EditorWorkbench({ eventBus, cropStatus }) {
  return (
    <div className="editor-workbench">
      {/* 运镜控制 */}
      <div className="crop-controls">
        {cropStatus === 'idle' && (
          <button onClick={() => eventBus.emit({ type: 'crop.start' })}>
            Start Crop
          </button>
        )}
        {cropStatus === 'recording' && (
          <button onClick={() => eventBus.emit({ type: 'crop.end' })}>
            End Crop
          </button>
        )}
      </div>
      
      {/* 视口控制 */}
      <div className="viewport-controls">
        <button onClick={() => eventBus.emit({ type: 'viewport.fov.adjust', delta: -5 })}>
          FOV -
        </button>
        <button onClick={() => eventBus.emit({ type: 'viewport.fov.adjust', delta: 5 })}>
          FOV +
        </button>
      </div>
      
      {/* 时间轴控制 */}
      <div className="timeline-controls">
        <button onClick={() => eventBus.emit({ type: 'timeline.cut' })}>
          Cut Here
        </button>
        <button onClick={() => eventBus.emit({ type: 'timeline.flush', reason: 'lock' })}>
          Flush
        </button>
      </div>
    </div>
  );
}
```

**验收标准：**
- ✅ 所有UI控制可用
- ✅ 状态显示正确
- ✅ 交互流畅

---

#### Task 3.7: 键盘快捷键（Agent-7, 2h）

**产出文件：**
- `core/shortcuts/keyboardShortcuts.ts`
- `core/shortcuts/useKeyboardShortcuts.ts`

**实现：**
```typescript
// keyboardShortcuts.ts
export const defaultShortcuts = {
  'Space': { type: 'player.toggle' },
  'KeyF': { type: 'timeline.flush', reason: 'lock' },
  'KeyC': { type: 'timeline.cut' },
  'KeyQ': { type: 'viewport.fov.adjust', delta: -5 },
  'KeyE': { type: 'viewport.fov.adjust', delta: 5 },
  'KeyW': { type: 'viewport.center.adjust', yawDelta: 0, pitchDelta: 5 },
  'KeyS': { type: 'viewport.center.adjust', yawDelta: 0, pitchDelta: -5 },
  'KeyA': { type: 'viewport.center.adjust', yawDelta: -5, pitchDelta: 0 },
  'KeyD': { type: 'viewport.center.adjust', yawDelta: 5, pitchDelta: 0 }
};

// useKeyboardShortcuts.ts
export function useKeyboardShortcuts(eventBus: EventBus<EditorEvent>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = defaultShortcuts[e.code];
      if (action) {
        e.preventDefault();
        eventBus.emit(action as any);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [eventBus]);
}
```

**验收标准：**
- ✅ 所有快捷键正常工作
- ✅ 快捷键不冲突
- ✅ 可以自定义快捷键

---

#### Task 3.8: 完整E2E测试（Agent-8, 3h）

**产出文件：**
- `e2e/player-v2-full.spec.ts`

**测试用例：**
```typescript
test('完整工作流：播放器模式', async ({ page }) => {
  await page.goto('/xr/player-v2');
  
  // 1. 验证视频列表
  await page.click('button:has-text("Playlist")');
  await expect(page.locator('.playlist')).toBeVisible();
  
  // 2. 切换视频
  await page.click('.playlist-item:nth-child(2)');
  await page.waitForTimeout(1000);
  
  // 3. 播放控制
  await page.click('button:has-text("Play")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Pause")');
});

test('完整工作流：剪辑器模式', async ({ page }) => {
  await page.goto('/xr/player-v2');
  
  // 1. 开始运镜录制
  await page.click('button:has-text("Start Crop")');
  await page.waitForTimeout(1000);
  
  // 2. 调整视口
  await page.keyboard.press('KeyQ'); // FOV -
  await page.keyboard.press('KeyW'); // Pitch up
  await page.waitForTimeout(2000);
  
  // 3. 结束录制
  await page.click('button:has-text("End Crop")');
  await page.waitForTimeout(1000);
  
  // 4. 添加特效
  await page.click('button:has-text("Add Effect")');
  await page.click('.effect-item:has-text("Fade")');
  
  // 5. 渲染导出
  await page.click('button:has-text("Render")');
  await page.waitForSelector('.render-status:has-text("Completed")');
  
  // 6. 验证导出链接
  await expect(page.locator('a:has-text("Download")')).toBeVisible();
});

test('快捷键功能', async ({ page }) => {
  await page.goto('/xr/player-v2');
  
  // Space - 播放/暂停
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  
  // F - 刷新路径
  await page.keyboard.press('KeyF');
  
  // C - 切点
  await page.keyboard.press('KeyC');
  
  // Q/E - FOV调整
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyE');
  
  // W/A/S/D - 视口移动
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyA');
  await page.keyboard.press('KeyS');
  await page.keyboard.press('KeyD');
});
```

**验收标准：**
- ✅ 所有测试通过
- ✅ 功能与旧页面一致
- ✅ 性能无明显下降

---

## 总体成功标准

### 阶段1完成标准
- ✅ `/xr/player-v2` 页面可访问
- ✅ Meta XR可以正常启动
- ✅ 视频球面和遮罩层正常显示
- ✅ UI外观与旧页面一致
- ✅ 无JavaScript错误

### 阶段2完成标准
- ✅ 事件系统正常工作
- ✅ Timeline Bridge集成成功
- ✅ 基本操作功能正常（播放、视口、时间轴）
- ✅ 后端收到正确的信号

### 阶段3完成标准
- ✅ 播放器模式功能完整
- ✅ 剪辑器模式功能完整
- ✅ 所有E2E测试通过
- ✅ 功能与旧页面完全一致

### 最终验收标准
- ✅ 代码行数减少30%以上
- ✅ 代码结构清晰，分层明确
- ✅ 可扩展性强，易于添加新功能
- ✅ 性能无下降
- ✅ 文档完整

---

## 风险控制

### 回滚策略

**阶段级回滚：**
- 每个阶段结束创建git tag
- 出问题立即回滚到上一个阶段
- 旧页面始终可用作为备份

**功能级回滚：**
- 通过路由切换回旧页面
- 用户无感知

### 灰度发布

```typescript
// 根据用户ID灰度放量
function shouldUseV2(userId: string) {
  const hash = hashCode(userId);
  const percentage = parseInt(process.env.V2_ROLLOUT_PERCENTAGE || '0');
  return (hash % 100) < percentage;
}

// 在page.tsx中使用
if (shouldUseV2(userId)) {
  return <PlayerV2 model={model} />;
} else {
  return <PcWebXrEditor {...props} />;
}
```

### 监控指标

**关键指标：**
- 页面加载时间
- JavaScript错误率
- Timeline采样延迟
- Patch发送成功率
- 用户操作成功率

**告警阈值：**
- 错误率 > 1%
- 采样延迟 > 500ms
- Patch失败率 > 5%

---

## 代码质量对比

### 旧页面（PcWebXrEditor.tsx）
- **代码行数：** 1310行
- **职责：** 混杂（UI + 业务逻辑 + 状态管理 + API调用）
- **可测试性：** 低
- **可扩展性：** 低

### 新页面（PlayerV2）
- **主组件行数：** ~200行（预计）
- **职责：** 清晰（只做组件编排）
- **可测试性：** 高（每层独立测试）
- **可扩展性：** 高（添加新功能不影响现有代码）

### 代码组织对比

**旧页面：**
```
PcWebXrEditor.tsx (1310行)
├── 状态管理 (200行)
├── 业务逻辑 (400行)
├── API调用 (100行)
├── 事件处理 (300行)
└── UI渲染 (310行)
```

**新页面：**
```
PlayerV2.tsx (200行) - 只做编排
├── core/events/ (100行) - 事件系统
├── workflows/ (300行) - 业务逻辑
├── operations/ (200行) - 原子操作
├── ui/ (400行) - UI组件
└── webxr/ (300行) - WebXR层
总计：1500行，但分层清晰，易于维护
```

---

## 后续扩展路径

完成3阶段重构后，可以轻松扩展：

### Week 4: 特效系统增强
- 添加10+个新特效
- 特效预览功能
- 特效参数调整UI

### Week 5: 镜头运动预设
- 环绕运动
- 螺旋运动
- 8字形运动
- 自定义路径

### Week 6: 多图层支持
- 文字图层
- 形状图层
- 粒子图层
- 图层混合模式

### Week 7: 协作功能
- 多人同时编辑
- 实时同步
- 评论和标注

---

## 迁移完成后的清理工作

### 1. 删除旧页面（Week 8）
- 确认新页面稳定运行2周
- 将 `/xr/player` 路由指向 `PlayerV2`
- 删除 `pc-editor/` 目录
- 更新所有引用

### 2. 文档更新
- 更新架构文档
- 更新开发指南
- 添加最佳实践

### 3. 性能优化
- 代码分割
- 懒加载
- 缓存优化

---

## 总结

### 为什么这个计划可行？

1. **分阶段验证** - 每个阶段都有明确的验收标准
2. **并行开发** - 多Agent同时工作，提高效率
3. **风险可控** - 旧页面始终可用，随时可以回滚
4. **代码更干净** - 从零开始，没有历史包袱
5. **架构更清晰** - 分层明确，职责单一

### 关键成功因素

1. **严格遵守分层原则** - 不要跨层调用
2. **充分利用Timeline Bridge** - 不要重新发明轮子
3. **完善的测试覆盖** - 每个阶段都要有E2E测试
4. **及时的代码审查** - Agent之间互相审查
5. **清晰的文档** - 记录所有决策和变更

### 预期收益

- ✅ 代码行数减少30%
- ✅ 代码可读性提升50%
- ✅ 添加新功能时间减少60%
- ✅ Bug修复时间减少40%
- ✅ 新人上手时间减少50%

---

## 下一步行动

**立即开始阶段1**

我将启动8个并行Agent执行阶段1的任务：
1. Agent-1: 创建页面路由和主组件
2. Agent-2: 迁移Meta XR兼容层
3. Agent-3: 迁移A-Frame场景组件
4. Agent-4: 迁移视频球面组件
5. Agent-5: 迁移遮罩层组件
6. Agent-6: 创建UI框架
7. Agent-7: 创建基础样式
8. Agent-8: 创建E2E测试

**需要你确认：**
1. 是否同意这个3阶段计划？
2. 是否立即开始执行阶段1？
3. 是否需要调整某些任务的优先级？

确认后我将立即启动多个Agent并行工作！
