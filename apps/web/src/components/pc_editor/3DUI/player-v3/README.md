# A-Frame Spatial 3D UI

这个目录提供面向外部 A-Frame scene 的 3D UI 装配入口。目标是让任意已有 A-Frame 的站点可以把这套 UI 当作一个 React component 接入，而不是依赖 `/xr/player-v3` 的页面内部结构。

## 公开入口

### React 宿主

```tsx
import { AFrameSpatial3DUi } from "@/components/pc_editor/3DUI";

<a-scene raycaster="objects: .clickable; recursive: true; far: 8; interval: 0">
  <AFrameSpatial3DUi
    model={{
      activeSourceId: "video-1",
      currentTimeMs: 12_000,
      durationMs: 180_000,
      isPlaying: true,
      playlistSources: [
        {
          id: "video-1",
          kind: "mp4",
          resolution: "360",
          title: "Demo source",
          sourceUrl: "/demo.mp4"
        }
      ],
      title: "Demo source"
    }}
    onAction={(action) => {
      // 外部宿主在这里把 UI 动作映射到自己的播放器、状态池或事件系统。
    }}
  />
</a-scene>
```

### 非 React / A-Frame 宿主

```ts
import { registerAFrameSpatial3DUiComponent } from "@/components/pc_editor/3DUI";

registerAFrameSpatial3DUiComponent();
```

```html
<a-scene raycaster="objects: .clickable; recursive: true; far: 8; interval: 0">
  <a-entity
    spatial-3d-ui='model: {"activeSourceId":"video-1","currentTimeMs":0,"durationMs":180000,"isPlaying":false,"playlistSources":[],"title":"Demo"}'
  ></a-entity>
</a-scene>

<script>
  document.querySelector("[spatial-3d-ui]").addEventListener("spatial-3dui-action", (event) => {
    console.log(event.detail);
  });
</script>
```

## 边界

- `AFrameSpatial3DUi` 只读取 `model` 快照，不直接读取 PC Editor runtime state。
- UI 只通过 `onAction` 发出动作，不直接调用播放器、后端、timeline 或宿主业务对象。
- 子组件之间不互相 import，不互相调用。`PlayerV3SpatialUi` / `AFrameSpatial3DUi` 是父装配层，负责组合播放器条、播放列表、工作台和圆环菜单。
- hover、pressed、click、ray blocker 等 A-Frame 交互原语放在 `../shared`。
- 当前 Quest 手柄、鼠标 ray 都依赖宿主 scene 把 raycaster 限定到 `.clickable`。

## 数据与事件

`SpatialPlayerState` 是宿主写入的当前显示状态：

```ts
type SpatialPlayerState = {
  activeSourceId: string;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  playlistSources: SpatialVideoSource[];
  title: string;
};
```

`Spatial3DUiAction` 是 UI 发出的动作语义，例如：

```ts
{ type: "player.playPause.toggle" }
{ type: "playlist.toggle" }
{ type: "player.source.select", source }
{ type: "crop.start" }
```

宿主负责把这些动作接到自己的 event bus、状态池、播放器 handle 或业务 workflow。
