# 叙事重构完成总结

## 产品名称

**一眼成片** (OneGlance)

**核心卖点**：看一遍，就能发

## 已完成的工作

### 1. 核心叙事文档（v2 版本）

✅ **[02-talk-structure-v2.md](02-talk-structure-v2.md)**
- 新的 5 分钟讲解结构
- 从"问题-方案"改为"酷炫-价值-技术"
- 情绪曲线：演示 → 价值 → 技术 → 可信

✅ **[03-ppt-outline-v2.md](03-ppt-outline-v2.md)**
- 8 页 PPT 详细大纲
- 视觉风格要求（与 web 一致）
- HTML/PDF/图片三种导出格式

✅ **[04-speaker-script-v2.md](04-speaker-script-v2.md)**
- 逐字演讲稿
- 现场应变方案
- 语气控制指南

✅ **[submission-checklist.md](submission-checklist.md)**
- 完整提交材料清单
- 文件夹结构规划
- 制作优先级和时间规划

✅ **[README.md](README.md)** (已更新)
- 反映新的 v2 叙事逻辑
- 文档使用顺序

✅ **submission/ 文件夹结构**
- 已创建所有子文件夹
- 准备好接收提交材料

✅ **[submission/README.md](submission/README.md)**
- 项目简介（中英双语）
- 可直接用作 GitHub README

---

## 核心改变

### 旧版叙事（问题优先）
```
痛点 → 定位 → 演示 → 技术 → 完成度
```

### 新版叙事（酷炫优先）
```
定义 → 演示（高光） → 价值 → 技术 → 完成度 → 定位
```

### 关键差异

| 维度 | 旧版 | 新版 |
|------|------|------|
| 开场 | 360 素材难发出去 | 我们做了什么 |
| 第一高潮 | 定位说明（防御性） | VR 演示（酷炫） |
| 价值说明 | 前置（0:40） | 后置（1:45） |
| 情绪 | 问题 → 方案 | 酷 → 有用 → 可信 |

---

## 接下来要做的事

### 立即开始（P0）

1. **录制 VR 演示视频** (60-90 秒)
   - 佩戴头显
   - 展示 Look/Lock/Skip/Cut/FOV 操作
   - 16:9 预览框清晰可见
   - 导出操作

2. **录制 PC 演示视频** (30-45 秒)
   - 上传、编辑、预览、导出流程

3. **制作 HTML PPT**
   - 按 `03-ppt-outline-v2.md` 制作 8 页
   - 视觉风格与 web 一致
   - 支持键盘翻页

4. **制作处理前后对比 GIF**
   - 左右对比：360 原始 vs 16:9 成片
   - 5-10 秒循环

### 强烈建议（P1）

5. **截取 VR 端截图** (5 张)
6. **截取 PC 端截图** (5 张)
7. **导出 PDF PPT** (从 HTML)
8. **编写详细项目介绍** (800-1000 字)

### 锦上添花（P2）

9. VR 操作 GIF
10. PC 编辑器 GIF
11. 完整流程视频
12. 架构图

---

## 文件位置速查

```
docs/hackathon-narrative/
├── README.md                          # 总览（已更新）
├── 02-talk-structure-v2.md            # 新讲解结构 ⭐
├── 03-ppt-outline-v2.md               # 新 PPT 大纲 ⭐
├── 04-speaker-script-v2.md            # 新演讲稿 ⭐
├── submission-checklist.md            # 提交清单 ⭐
└── submission/                        # 提交材料文件夹
    ├── README.md                      # 项目简介（可用作 GitHub README）
    ├── videos/                        # 演示视频
    ├── presentation/                  # PPT 文件
    ├── gifs/                          # GIF 动图
    └── screenshots/                   # 截图
        ├── vr/
        ├── pc/
        └── comparison/
```

---

## 使用建议

1. **先读核心文档**：
   - `02-talk-structure-v2.md` - 理解新叙事逻辑
   - `03-ppt-outline-v2.md` - 了解 PPT 要求
   - `04-speaker-script-v2.md` - 熟悉演讲内容

2. **按优先级制作材料**：
   - 参考 `submission-checklist.md` 的 P0/P1/P2 分类
   - 先完成 P0（必须），再做 P1（强烈建议）

3. **保持叙事一致性**：
   - 所有材料都遵循"酷炫优先"逻辑
   - 先展示体验，再解释价值

4. **定期检查**：
   - 使用 `submission-checklist.md` 底部的检查清单
   - 确保所有材料符合要求

---

## 快速开始

```bash
# 1. 查看新叙事结构
cat docs/hackathon-narrative/02-talk-structure-v2.md

# 2. 查看 PPT 大纲
cat docs/hackathon-narrative/03-ppt-outline-v2.md

# 3. 查看提交清单
cat docs/hackathon-narrative/submission-checklist.md

# 4. 开始制作材料
cd docs/hackathon-narrative/submission/
```

---

## 需要帮助？

如果需要进一步协助：
- 制作 HTML PPT
- 编写项目介绍文档
- 优化演讲稿
- 准备 Q&A 应对

随时提出！
