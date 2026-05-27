import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CopyLinkButton } from "@/components/mobile/CopyLinkButton";
import { MobileShell } from "@/components/mobile/MobileShell";
import { QuestQrCode } from "@/components/mobile/QuestQrCode";
import { SessionActions } from "@/components/mobile/SessionActions";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import { Video360Preview } from "@/components/mobile/Video360Preview";
import { XrPlayerEntryButton } from "@/components/XrSessionLink";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatFps,
  formatResolution,
  statusLabel
} from "@/components/mobile/format";
import { apiUrl, getMe, getSessionStatus, getVideo } from "@/lib/api";
import type { SessionStatus, VideoDetail } from "@/lib/api";

type PageProps = {
  params: Promise<{
    videoId: string;
  }>;
};

function getPublicOrigin(requestHeaders: Headers) {
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function metricItems(video: VideoDetail) {
  return [
    ["时长", formatDuration(video.durationMs)],
    ["规格", formatResolution(video.width, video.height)],
    ["大小", formatBytes(video.fileSize)],
    ["帧率", formatFps(video.fps)],
    ["类型", video.contentType ?? "Unknown"],
    ["更新", formatDate(video.updatedAt ?? video.createdAt)]
  ];
}

function metadataRows(video: VideoDetail) {
  const metadata = video.metadata ?? {};
  return [
    ["Video ID", video.id],
    ["Source URL", video.sourceUrl ?? "-"],
    ["Thumbnail", video.thumbnailUrl ?? "-"],
    ["Duration", `${video.durationMs ?? 0} ms`],
    ["Dimensions", video.width && video.height ? `${video.width} x ${video.height}` : "-"],
    ["FPS", video.fps ? String(video.fps) : "-"],
    ["Probe Source", typeof metadata.source === "string" ? metadata.source : "-"],
    ["Created", video.createdAt ?? "-"],
    ["Updated", video.updatedAt ?? "-"]
  ];
}

export default async function MobileVideoDetailPage({ params }: PageProps) {
  const { videoId } = await params;
  let video: VideoDetail | null = null;
  let sessionStatus: SessionStatus | null = null;
  let error: string | null = null;
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();
  const requestHeaders = await headers();

  try {
    const [user, videoDetail] = await Promise.all([
      getMe({ cookie: cookieHeader }),
      getVideo(videoId, { cookie: cookieHeader })
    ]);
    email = user.email;
    video = videoDetail;
    const latestSessionId = video.latestSession?.id;
    if (latestSessionId) {
      sessionStatus = await getSessionStatus(latestSessionId, { cookie: cookieHeader });
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取视频详情失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  const latestSessionId = video?.latestSession?.id ?? null;
  const latestSessionStatus = sessionStatus?.sessionStatus ?? video?.latestSession?.status ?? null;
  const xrPath = "/xr/player";
  const xrUrl = `${getPublicOrigin(requestHeaders)}${xrPath}`;
  const latestExportId =
    sessionStatus?.exportId ??
    video?.latestExport?.exportId ??
    video?.latestExport?.id ??
    null;
  const latestExportStatus = video?.latestExport?.status ?? (sessionStatus?.downloadReady ? "ready" : null);
  const latestExportError = video?.latestExport?.errorMessage ?? video?.latestExport?.error_message ?? null;
  const exportDownloadReady = Boolean(sessionStatus?.downloadReady || video?.latestExport?.status === "ready");
  const previewSourceUrl = video
    ? apiUrl(video.sourceUrl ?? `/api/videos/${encodeURIComponent(video.id)}/download`)
    : "";
  const posterUrl = video?.thumbnailUrl ? apiUrl(video.thumbnailUrl) : null;

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="360 Stream Detail"
      title="视频详情"
      variant="vapor"
    >
      <div className="vapor-library-page vapor-detail-page">
        {error ? <p className="error-text">{error}</p> : null}

        {video ? (
          <>
            <section className="vapor-detail-hero">
              <div className="vapor-window-titlebar">
                <div className="vapor-window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p>&gt; OPEN_360_SOURCE_STREAM</p>
              </div>
              <div className="vapor-detail-player-grid">
                <Video360Preview
                  posterUrl={posterUrl}
                  sourceUrl={previewSourceUrl}
                  title={video.filename || video.id}
                />
                <aside className="vapor-detail-summary">
                  <p className="vapor-command">&gt; source</p>
                  <h2>{video.filename || video.id}</h2>
                  <p>{video.id}</p>
                  <StatusBadge status={video.status} />
                  <dl className="vapor-detail-metrics">
                    {metricItems(video).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="vapor-card-actions">
                    <a
                      className="vapor-button vapor-button-primary"
                      href={apiUrl(`/api/videos/${encodeURIComponent(video.id)}/download`)}
                    >
                      <span>下载源视频</span>
                    </a>
                    <Link className="vapor-button vapor-button-ghost" href="/mobile/videos">
                      <span>返回列表</span>
                    </Link>
                  </div>
                </aside>
              </div>
            </section>

            <section className="vapor-library-section">
              <div className="vapor-section-heading">
                <div>
                  <p className="vapor-command">&gt; metadata</p>
                  <h2>视频元数据</h2>
                </div>
              </div>
              <dl className="vapor-metadata-table">
                {metadataRows(video).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="vapor-library-section">
              <div className="vapor-section-heading">
                <div>
                  <p className="vapor-command">&gt; quest entry</p>
                  <h2>WebXR 入口</h2>
                </div>
                {latestSessionStatus ? <StatusBadge status={latestSessionStatus} /> : null}
              </div>

              {xrUrl && xrPath ? (
                <div className="vapor-xr-entry-grid">
                  <QuestQrCode value={xrUrl} />
                  <div className="stack">
                    <div className="vapor-link-box">{xrUrl}</div>
                    <div className="vapor-card-actions">
                      <CopyLinkButton value={xrUrl} />
                      <XrPlayerEntryButton
                        buttonClassName="vapor-button vapor-button-primary"
                        label="打开 WebXR"
                        videoId={video.id}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="vapor-empty-state">
                  <strong>&gt; 还没有 session</strong>
                  <p>创建入口后，这里会出现 Quest 可扫码打开的二维码。</p>
                </div>
              )}

              <SessionActions currentSessionId={latestSessionId} videoId={video.id} />
            </section>

            <section className="vapor-library-section">
              <div className="vapor-section-heading">
                <div>
                  <p className="vapor-command">&gt; export</p>
                  <h2>导出结果</h2>
                </div>
                {latestExportStatus ? <StatusBadge status={latestExportStatus} /> : null}
              </div>

              {latestExportId ? (
                <div className="vapor-export-panel">
                  <p>
                    当前导出：<strong>{latestExportId}</strong>
                  </p>
                  <p>状态：{statusLabel(latestExportStatus)}</p>
                  {latestExportError ? <p className="error-text">{latestExportError}</p> : null}
                  <div className="vapor-card-actions">
                    <Link className="vapor-button vapor-button-ghost" href={`/mobile/exports/${encodeURIComponent(latestExportId)}`}>
                      <span>查看导出</span>
                    </Link>
                    {exportDownloadReady ? (
                      <a
                        className="vapor-button vapor-button-primary"
                        href={apiUrl(`/api/exports/${encodeURIComponent(latestExportId)}/download`)}
                      >
                        <span>下载裁剪 MP4</span>
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="muted">暂无导出结果。WebXR 测试处理完成后会出现下载入口。</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </MobileShell>
  );
}
