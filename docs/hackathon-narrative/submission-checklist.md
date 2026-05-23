# 黑客松提交材料清单

## 提交要求

所有材料放在 `docs/hackathon-narrative/submission/` 文件夹，方便打包到 U 盘。

---

## 必需材料

### 1. 实机演示视频

#### 1.1 VR 端演示视频
- **文件名**：`demo-vr-headset.mp4`
- **时长**：60-90 秒
- **内容**：
  - 佩戴 VR 头显
  - 进入 360 视频
  - 展示操作：Look / Lock / Skip / Cut / FOV
  - 16:9 预览框清晰可见
  - 导出操作
- **录制方式**：
  - Quest 内录屏（带手柄和视角）
  - 或外部摄像机拍摄佩戴者 + 屏幕镜像
- **分辨率**：1920x1080 或更高
- **格式**：MP4 (H.264)
- **状态**：🚧 待录制

#### 1.2 PC 端演示视频
- **文件名**：`demo-pc-editor.mp4`
- **时长**：30-45 秒
- **内容**：
  - 上传 360 视频
  - 时间轴和路径点可视化
  - 16:9 预览
  - 导出和下载
- **录制方式**：屏幕录制（OBS / QuickTime）
- **分辨率**：1920x1080
- **格式**：MP4 (H.264)
- **状态**：🚧 待录制

#### 1.3 完整流程视频（可选）
- **文件名**：`demo-full-workflow.mp4`
- **时长**：2-3 分钟
- **内容**：从上传到导出的完整流程
- **状态**：⏸️ 可选

---

### 2. PPT 演示文稿

#### 2.1 HTML 版本（主要）
- **文件名**：`presentation.html`
- **要求**：
  - 单文件，内嵌 CSS/JS
  - 可离线运行
  - 支持键盘翻页
  - 适配 1920x1080 投影仪
  - 视觉风格与 web 一致
- **页数**：8 页
- **内容**：按 `03-ppt-outline-v2.md` 制作
- **状态**：🚧 待制作

#### 2.2 PDF 版本（备用）
- **文件名**：`presentation.pdf`
- **来源**：从 HTML 导出
- **状态**：🚧 待导出

#### 2.3 图片版本（备用）
- **文件夹**：`presentation-slides/`
- **文件名**：`slide-01.png` ~ `slide-08.png`
- **分辨率**：3840x2160 (2x)
- **状态**：🚧 待导出

---

### 3. 项目简介

#### 3.1 README.md
- **文件名**：`README.md`（放在项目根目录）
- **内容**：
  - 项目名称和一句话介绍
  - 核心功能（3-5 条）
  - 技术栈
  - 演示链接（如果有）
  - 截图/GIF
  - 快速开始（可选）
- **长度**：300-500 字
- **语言**：中英双语
- **状态**：🚧 待编写

#### 3.2 项目介绍文档
- **文件名**：`submission/project-intro.md`
- **内容**：
  - 项目背景
  - 核心创新点
  - 技术实现
  - 当前完成度
  - 未来规划
- **长度**：800-1000 字
- **状态**：🚧 待编写

---

### 4. GIF 动图

#### 4.1 处理前后对比
- **文件名**：`before-after-comparison.gif`
- **内容**：
  - 左侧：原始 360 视频（球形展开或等距投影）
  - 右侧：导出的 16:9 成片
  - 同步播放
- **时长**：5-10 秒循环
- **分辨率**：1280x640 (左右各 640x640)
- **帧率**：15-20 fps
- **文件大小**：< 5MB
- **状态**：🚧 待制作

#### 4.2 VR 操作演示
- **文件名**：`vr-interaction.gif`
- **内容**：VR 中转头和按按钮的操作
- **时长**：3-5 秒循环
- **状态**：🚧 待制作

#### 4.3 PC 编辑器演示
- **文件名**：`pc-editor.gif`
- **内容**：时间轴编辑和预览
- **时长**：3-5 秒循环
- **状态**：🚧 待制作

---

### 5. 高光时刻截图

#### 5.1 VR 端截图
- **文件名**：`screenshot-vr-*.png` (编号 01-05)
- **内容**：
  - `screenshot-vr-01.png`：VR 中的 360 视频 + 16:9 预览框
  - `screenshot-vr-02.png`：Lock 操作界面
  - `screenshot-vr-03.png`：时间轴和路径点
  - `screenshot-vr-04.png`：FOV 调节
  - `screenshot-vr-05.png`：导出界面
- **分辨率**：原生分辨率（Quest 3: 2064x2208 per eye）
- **格式**：PNG
- **状态**：🚧 待截取

#### 5.2 PC 端截图
- **文件名**：`screenshot-pc-*.png` (编号 01-05)
- **内容**：
  - `screenshot-pc-01.png`：上传界面
  - `screenshot-pc-02.png`：编辑器主界面
  - `screenshot-pc-03.png`：时间轴特写
  - `screenshot-pc-04.png`：16:9 预览
  - `screenshot-pc-05.png`：导出和下载
- **分辨率**：1920x1080 或更高
- **格式**：PNG
- **状态**：🚧 待截取

#### 5.3 成片对比截图
- **文件名**：`screenshot-comparison-*.png` (编号 01-03)
- **内容**：原始 360 vs 导出 16:9 的对比
- **状态**：🚧 待制作

---

### 6. 技术文档（可选）

#### 6.1 架构图
- **文件名**：`architecture-diagram.png`
- **内容**：系统架构图（前端/后端/渲染）
- **状态**：⏸️ 可选

#### 6.2 ViewPath 数据格式
- **文件名**：`viewpath-format.md`
- **内容**：ViewPath JSON 格式说明
- **状态**：⏸️ 可选

---

## 文件夹结构

```
docs/hackathon-narrative/
├── submission/                    # 提交材料文件夹
│   ├── videos/                   # 视频文件
│   │   ├── demo-vr-headset.mp4
│   │   ├── demo-pc-editor.mp4
│   │   └── demo-full-workflow.mp4 (可选)
│   ├── presentation/             # PPT 文件
│   │   ├── presentation.html
│   │   ├── presentation.pdf
│   │   └── slides/               # 图片备份
│   │       ├── slide-01.png
│   │       └── ...
│   ├── gifs/                     # GIF 动图
│   │   ├── before-after-comparison.gif
│   │   ├── vr-interaction.gif
│   │   └── pc-editor.gif
│   ├── screenshots/              # 截图
│   │   ├── vr/
│   │   │   ├── screenshot-vr-01.png
│   │   │   └── ...
│   │   ├── pc/
│   │   │   ├── screenshot-pc-01.png
│   │   │   └── ...
│   │   └── comparison/
│   │       ├── screenshot-comparison-01.png
│   │       └── ...
│   ├── README.md                 # 项目简介（复制到根目录）
│   └── project-intro.md          # 详细介绍
└── [其他叙事文档]
```

---

## 制作优先级

### P0（必须完成）
1. ✅ 讲解结构 v2
2. ✅ PPT 大纲 v2
3. ✅ 演讲稿 v2
4. 🚧 VR 端演示视频
5. 🚧 PC 端演示视频
6. 🚧 HTML PPT
7. 🚧 README.md
8. 🚧 处理前后对比 GIF

### P1（强烈建议）
9. 🚧 VR 端截图（5 张）
10. 🚧 PC 端截图（5 张）
11. 🚧 PDF PPT（备用）
12. 🚧 项目介绍文档

### P2（锦上添花）
13. ⏸️ VR 操作 GIF
14. ⏸️ PC 编辑器 GIF
15. ⏸️ 成片对比截图
16. ⏸️ 完整流程视频
17. ⏸️ 架构图

---

## 制作工具推荐

### 视频录制
- **VR 端**：Quest 内置录屏 / SideQuest
- **PC 端**：OBS Studio / QuickTime (Mac)

### 视频编辑
- **剪辑**：DaVinci Resolve / Premiere / Final Cut Pro
- **压缩**：HandBrake / FFmpeg

### GIF 制作
- **从视频**：FFmpeg / Gifski / ezgif.com
- **优化**：gifsicle / ImageOptim

### 截图
- **VR 端**：Quest 内置截图
- **PC 端**：系统截图工具 / Snipaste

### PPT 制作
- **HTML**：Reveal.js / Slidev / 自定义 HTML
- **设计**：Figma / Sketch / Canva

---

## 检查清单

提交前确认：

- [ ] 所有视频可正常播放
- [ ] 所有 GIF 正常循环
- [ ] 所有截图清晰无水印
- [ ] HTML PPT 可离线运行
- [ ] PDF PPT 排版正确
- [ ] README.md 格式正确
- [ ] 文件命名规范统一
- [ ] 文件大小合理（总计 < 500MB）
- [ ] 所有文件放在 `submission/` 文件夹
- [ ] 准备好 U 盘（至少 1GB）

---

## 时间规划

假设距离提交还有 X 天：

- **Day 1-2**：录制演示视频
- **Day 3**：制作 HTML PPT
- **Day 4**：制作 GIF 和截图
- **Day 5**：编写 README 和文档
- **Day 6**：排练演讲，微调材料
- **Day 7**：最终检查，打包提交

---

## 注意事项

1. **版权**：确保所有素材（音乐、字体、图片）有使用权
2. **隐私**：视频中不要出现敏感信息
3. **文件大小**：视频压缩到合理大小，保持清晰度
4. **备份**：所有材料至少备份 2 份
5. **测试**：在不同设备上测试 HTML PPT 和视频播放
6. **命名**：使用英文文件名，避免中文和特殊字符
