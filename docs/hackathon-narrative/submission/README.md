# The Invisible Director

**看一遍，就能发** - Watch once, share instantly.

## What is it?

The Invisible Director is a spatial editing system for 360° videos. Put on a VR headset, watch your 360° footage, and use head tracking + buttons to create a shareable 16:9 video - no timeline scrubbing, no keyframe editing.

## Core Features

- 🥽 **VR-native editing**: Look where viewers should look, press buttons to express director intent
- 🎯 **Attention path recording**: System captures ViewPath (yaw/pitch/FOV/Lock/Skip/Cut) instead of screen recording
- 🎬 **Instant export**: Backend re-projects 360° footage along your attention path → standard 16:9 MP4
- 💻 **PC editor**: Visualize and fine-tune paths on desktop before export

## How it works

```
1. Upload 360° video
2. Enter VR session (WebXR)
3. Watch + interact (Look / Lock / Skip / Cut / FOV)
4. System records ViewPath (attention path)
5. Backend renders along path
6. Download 16:9 MP4
```

## Tech Stack

- **Frontend**: Next.js, React, Three.js, WebXR
- **Backend**: Node.js, FFmpeg, 360° re-projection
- **VR**: Meta Quest (WebXR compatible)

## Current Status

✅ MVP complete:
- Upload & session management
- WebXR VR playback
- ViewPath recording & submission
- Backend smoke render
- Download flow

🚧 In progress:
- Precise headset sampling
- Rich interaction buttons
- Production-grade render queue

## Demo

[Demo videos and screenshots in `/docs/hackathon-narrative/submission/`]

## Project Context

This is a hackathon prototype exploring spatial intelligence workflows. It's not a replacement for mature editing tools like Insta360 Studio - it's a lighter layer for generating framing intent during first-time viewing.

**Positioning**: Insta360 cameras solve "capture everything". This prototype explores "decide attention faster".

---

## 中文简介

**The Invisible Director** 是一个 360° 视频的空间编辑系统。

戴上 VR 头显，观看 360° 素材，用头部转向和按钮直接生成可分享的 16:9 视频 - 无需拖时间轴，无需调关键帧。

### 核心功能

- 🥽 VR 原生编辑：看向哪里，观众就看哪里
- 🎯 注意力路径：记录 ViewPath（视角/FOV/Lock/Skip/Cut）而非录屏
- 🎬 即时导出：后端按路径重新投影 → 标准 16:9 MP4
- 💻 PC 编辑器：可视化路径编辑和预览

### 工作流程

```
1. 上传 360° 视频
2. 进入 VR session (WebXR)
3. 观看 + 交互（Look / Lock / Skip / Cut / FOV）
4. 系统记录 ViewPath（注意力路径）
5. 后端按路径渲染
6. 下载 16:9 MP4
```

### 项目定位

这是一个黑客松原型，探索空间智能工作流。不是替代成熟工具（如影石 Studio），而是在更轻的一层：第一次观看素材时就生成取景意图。

**定位**：影石相机解决了"拍到全部"，这个原型探索"更快确定注意力"。

---

Made with ❤️ for hackathon exploration
