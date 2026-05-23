# PC Editor 实机剪辑 Timeline - Old Ghost Road Mountain Bike

视频：`Training 4K 360 - Old Ghost Road Mountain Bike.mp4`  
账号：`madjad020@gmail.com`  
Video ID：`video_training_07e4e3c1e9b6_old_ghost_road_mountain_bike`  
Session ID：`session_training_07e4e3c1e9b6_old_ghost_road_mountain_bike`

打开路径：

```text
/xr/videos/video_training_07e4e3c1e9b6_old_ghost_road_mountain_bike/session/session_training_07e4e3c1e9b6_old_ghost_road_mountain_bike
```

## 录屏目标

用一条 60 秒 4K 360 山地车素材，演示 PC editor 的基础单元操作：播放定位、视角采样、锁定视角、控制器/鼠标指向、FOV 推拉、硬切、片段丢弃、片段恢复、效果轨道、字幕叠加、颜色/高光/暗角/运动效果、最终 timeline 组装。

## 剪辑 Timeline

| 源时间 | 画面意图 | 已写入操作 |
| --- | --- | --- |
| 0.0-3.0s | 开场建立环境，宽视角进入山路 | 视角锁定，FOV 104 -> 96，黑场淡入，电影遮幅 |
| 3.0-8.0s | 逐渐把注意力带到前方线路 | 平滑跟随，yaw 18 -> 63，FOV 96 -> 82，开始色彩增强 |
| 8.0-13.0s | 第一组转向/线路选择 | 切到 controller_ray 输入，FOV 推近到 76，叠加 `LOCK LINE` 标签和高光 |
| 13.0-18.5s | 转向出口，准备节奏切换 | 回到 head_gaze，视角看向出口，18.5s 做硬切 |
| 18.5s | 明确展示 cut 操作 | `cut=true`，yaw 从 148 跳到 -165，叠加白闪转场 |
| 18.5-27.5s | 高速下坡段 | controller_ray 跟线，FOV 82 -> 80，加入 chromatic aberration 和短 motion blur |
| 27.5-34.5s | 重新居中，给观众呼吸 | 平滑回中，FOV 82 -> 91，暗角聚焦 |
| 34.5-41.0s | 第二次线路选择 | controller_ray 观察路线，`LINE CHOICE` 标签，高光强调 |
| 42.0-48.0s | 丢弃低价值/抖动段 | `enabled=false`，保留黑场 mask 事件作为 UI 轨道提示 |
| 48.0s | 恢复片段 | `enabled=true`，`cut=true`，白闪恢复到有效素材 |
| 48.0-56.0s | Hero follow，速度感收尾 | FOV 78 -> 94，退出段高光，视角扫向终点方向 |
| 56.0-60.0s | 收束结尾 | FOV 94 -> 104，视角锁定，黑场淡出 |

## 数据库写入摘要

```text
timelineRevision: 2
pathRevision: 2
effectRevision: 2
view_path_points: 61
effect_events: 16
discard source range: 42000-48000ms
assembled output duration: 54000ms
source ranges: 0-18500ms, 18500-42000ms, 48000-60000ms
```

## 建议录屏顺序

1. 打开 PC editor 页面，先展示素材是 4K 360 山地车。
2. 播放前 10 秒，展示视角跟随、FOV 收紧和 `LOCK LINE`。
3. 跳到 18.5 秒，展示硬切和白闪。
4. 跳到 34.5 秒，展示线路选择、高光、字幕叠加。
5. 跳到 42-48 秒，展示丢弃段，再跳到 48 秒恢复。
6. 播放 48-60 秒，展示恢复后的 hero follow 和 fade out。
