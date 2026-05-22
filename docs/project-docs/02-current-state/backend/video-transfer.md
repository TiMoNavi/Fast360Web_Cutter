# 视频上传下载模块当前状态

## 上传已实现

当前接口：

```text
POST /api/videos/upload
```

当前能力：

```text
必须登录。
支持 .mp4 / .mov / .m4v / .webm / .mkv。
允许 video/* 或 application/octet-stream。
拒绝空文件。
默认最大 2GB，可通过 VIDEO_UPLOAD_MAX_BYTES 调整。
写入 storage/videos。
ffprobe 读取 metadata。
失败时清理已写入目标文件。
```

上传成功后：

```text
写入 videos。
status = ready_for_xr。
返回 video detail。
```

## 下载已实现

当前接口：

```text
GET /api/exports/:exportId/download
```

当前能力：

```text
必须登录。
校验 export 属于当前用户。
要求 export.status = ready。
校验 file_path 位于 storage/exports。
返回 video/mp4。
Cache-Control = private, no-store。
```

## 当前代码位置

```text
apps/api/app/main.py
upload_video、download_export、validate_upload_metadata、copy_upload_with_limit、resolve_export_file。

apps/api/app/storage.py
probe_video_metadata、video response helper、exports 表初始化。
```

## 当前缺口

```text
上传下载逻辑还没有从 main.py 拆出。
上传仍是普通 UploadFile。
没有 Uppy / tus-js-client / tusd。
没有断点续传。
没有上传进度持久化。
没有对象存储。
```
