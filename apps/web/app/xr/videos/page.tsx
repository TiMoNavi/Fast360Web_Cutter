import Link from "next/link";
import { cookies } from "next/headers";
import { XrSessionLink } from "@/components/XrSessionLink";
import { apiUrl, listVideos } from "@/lib/api";
import type { VideoSummary } from "@/lib/api";

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return "UNKNOWN";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "LIVE";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatResolution(video: VideoSummary) {
  return video.width && video.height ? `${video.width} x ${video.height}` : "360 SOURCE";
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    abandoned: "已放弃",
    collecting: "采集中",
    cutting: "裁剪中",
    dirty: "待重算",
    discarded: "已丢弃",
    done: "完成",
    export_ready: "可下载",
    failed: "失败",
    ready: "就绪",
    ready_for_xr: "XR 就绪",
    rendering: "处理中",
    uploaded: "已上传",
    uploading: "上传中"
  };

  return status ? labels[status] ?? status : "未知";
}

function statusTone(status?: string | null) {
  if (status === "failed") {
    return "danger";
  }

  if (status === "ready_for_xr" || status === "ready" || status === "done" || status === "export_ready") {
    return "success";
  }

  if (status === "rendering" || status === "cutting" || status === "dirty" || status === "collecting") {
    return "warning";
  }

  return "neutral";
}

function thumbnailSrc(video: VideoSummary) {
  return video.thumbnailUrl ? apiUrl(video.thumbnailUrl) : null;
}

export default async function XrVideosPage() {
  let videos: VideoSummary[] = [];
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    videos = await listVideos({ cookie: cookieHeader });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取视频列表失败。";
    if (error === "Not authenticated") {
      error = "尚未登录。你仍然可以查看这个 WebXR 入口；登录后会显示账号内的视频。";
    }
  }

  const readyCount = videos.filter((video) =>
    ["ready_for_xr", "ready", "done", "export_ready"].includes(video.status)
  ).length;
  const processingCount = videos.filter((video) =>
    ["collecting", "rendering", "cutting", "dirty", "uploading"].includes(video.status)
  ).length;
  const totalSize = videos.reduce((total, video) => total + (video.fileSize ?? 0), 0);

  return (
    <main className="xr-videos-page">
      <div className="xr-videos-scanlines" aria-hidden="true" />
      <div className="xr-videos-sun" aria-hidden="true" />
      <div className="xr-videos-grid-floor" aria-hidden="true" />

      <div className="xr-videos-shell">
        <section className="xr-videos-hero">
          <div className="xr-videos-window-chrome">
            <div className="xr-videos-window-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>&gt; WEBXR_VIDEO_ARCHIVE.EXE</p>
          </div>

          <div className="xr-videos-hero-body">
            <div className="xr-videos-hero-copy">
              <p className="xr-videos-command">&gt; SELECT_SOURCE / ENTER_SPATIAL_CUT</p>
              <h1>
                WebXR
                <span>视频矩阵</span>
              </h1>
              <p>
                与移动端共享同一套视频库，选择素材、输入 sessionId，然后进入 360 空间完成取景和裁剪占位。
              </p>
              <div className="xr-videos-actions" aria-label="页面导航">
                <Link className="xr-videos-button xr-videos-button-primary" href="/xr/player">
                  空播放器
                </Link>
                <Link className="xr-videos-button" href="/mobile/videos">
                  移动端视频库
                </Link>
                <Link className="xr-videos-button xr-videos-button-ghost" href="/">
                  返回首页
                </Link>
                <Link className="xr-videos-button xr-videos-button-ghost" href="/mobile/login">
                  登录 / 注册
                </Link>
              </div>
            </div>

            <div className="xr-videos-stats" aria-label="视频库状态">
              <div>
                <span>{videos.length}</span>
                <p>素材总数</p>
              </div>
              <div>
                <span>{readyCount}</span>
                <p>可进入 XR</p>
              </div>
              <div>
                <span>{processingCount}</span>
                <p>处理中</p>
              </div>
              <div>
                <span>{formatBytes(totalSize)}</span>
                <p>源文件体积</p>
              </div>
            </div>
          </div>
        </section>

        <section className="xr-videos-terminal">
          <div className="xr-videos-section-heading">
            <div>
              <p className="xr-videos-command">&gt; BROWSE / XR_READY_SOURCES</p>
              <h2>可进入的视频</h2>
            </div>
            <span>{videos.length.toString().padStart(2, "0")} FILES ONLINE</span>
          </div>

          {error ? <p className="xr-videos-error">&gt; ERROR: {error}</p> : null}

          {videos.length === 0 && !error ? (
            <div className="xr-videos-empty">
              <strong>&gt; 暂无视频</strong>
              <p>先从移动端视频库上传 360 MP4，或启动示例素材后再回到这里进入 WebXR。</p>
              <Link className="xr-videos-button xr-videos-button-primary" href="/mobile/videos">
                打开视频库
              </Link>
            </div>
          ) : null}

          {videos.length > 0 ? (
            <div className="xr-videos-grid">
              {videos.map((video, index) => {
                const cover = thumbnailSrc(video);

                return (
                  <article className="xr-videos-card" key={video.id}>
                    <div className="xr-videos-card-cover">
                      {cover ? (
                        <img alt={`${video.filename || video.id} 的视频封面`} loading="lazy" src={cover} />
                      ) : (
                        <div className="xr-videos-cover-placeholder" aria-hidden="true">
                          <span>360</span>
                        </div>
                      )}
                      <div className="xr-videos-cover-overlay" aria-hidden="true" />
                      <span className="xr-videos-index">#{(index + 1).toString().padStart(2, "0")}</span>
                      <span className={`xr-videos-status ${statusTone(video.status)}`}>
                        {statusLabel(video.status)}
                      </span>
                    </div>

                    <div className="xr-videos-card-body">
                      <div className="xr-videos-card-title">
                        <p className="xr-videos-command">&gt; SOURCE_ID</p>
                        <h3>{video.filename || video.id}</h3>
                        <span>{video.id}</span>
                      </div>

                      <dl className="xr-videos-metrics">
                        <div>
                          <dt>时长</dt>
                          <dd>{formatDuration(video.durationMs)}</dd>
                        </div>
                        <div>
                          <dt>规格</dt>
                          <dd>{formatResolution(video)}</dd>
                        </div>
                        <div>
                          <dt>大小</dt>
                          <dd>{formatBytes(video.fileSize)}</dd>
                        </div>
                      </dl>

                      <XrSessionLink videoId={video.id} />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
