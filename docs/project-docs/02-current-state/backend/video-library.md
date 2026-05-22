# 视频列表与元数据模块当前状态

## 已实现接口

```text
GET /api/videos
GET /api/videos/:videoId
```

## 当前能力

```text
按 user_id 返回视频列表。
返回视频详情。
返回 sourceUrl。
返回 durationMs / width / height / fps。
返回 latestSession。
返回 latestExport。
```

当前 `GET /api/videos/:videoId` 已经可以作为移动 Web 和 WebXR 业务页共享的视频详情来源。

## 当前表

```text
videos
cut_sessions
exports
```

视频详情会聚合最近一次 session 和最近一次 export。

## 当前代码位置

```text
apps/api/app/main.py
list_videos、get_video。

apps/api/app/storage.py
video_response、video_detail_response。
```

## 当前缺口

```text
视频列表逻辑还没有拆成独立 repository/service。
状态字段还比较 MVP。
没有缩略图。
没有上传中队列状态。
没有更完整的筛选、排序和分页。
WebXR 真实播放页还没有把 sourceUrl 接入 MetaWebXrPlayer。
```
