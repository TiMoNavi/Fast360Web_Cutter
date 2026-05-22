import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CopyLinkButton } from "@/components/mobile/CopyLinkButton";
import { MobileShell } from "@/components/mobile/MobileShell";
import { QuestQrCode } from "@/components/mobile/QuestQrCode";
import { SessionActions } from "@/components/mobile/SessionActions";
import { StatusBadge } from "@/components/mobile/StatusBadge";
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
  const xrPath = latestSessionId
    ? `/xr/videos/${encodeURIComponent(videoId)}/session/${encodeURIComponent(latestSessionId)}`
    : null;
  const xrUrl = xrPath ? `${getPublicOrigin(requestHeaders)}${xrPath}` : null;
  const latestExportId =
    sessionStatus?.exportId ??
    video?.latestExport?.exportId ??
    video?.latestExport?.id ??
    null;
  const latestExportStatus = video?.latestExport?.status ?? (sessionStatus?.downloadReady ? "ready" : null);
  const latestExportError = video?.latestExport?.errorMessage ?? video?.latestExport?.error_message ?? null;

  return (
    <MobileShell email={email} title="视频详情">
      {error ? <p className="error-text">{error}</p> : null}

      {video ? (
        <>
          <section className="mobile-card">
            <div className="detail-heading">
              <div>
                <p className="eyebrow">Video</p>
                <h2>{video.filename || video.id}</h2>
                <p>{video.id}</p>
              </div>
              <StatusBadge status={video.status} />
            </div>

            <dl className="metric-grid large">
              {metricItems(video).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mobile-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Quest Entry</p>
                <h2>WebXR 入口</h2>
              </div>
              {latestSessionStatus ? <StatusBadge status={latestSessionStatus} /> : null}
            </div>

            {xrUrl && xrPath ? (
              <div className="xr-entry-grid">
                <QuestQrCode value={xrUrl} />
                <div className="stack">
                  <div className="link-box">{xrUrl}</div>
                  <div className="button-row">
                    <CopyLinkButton value={xrUrl} />
                    <Link className="button primary" href={xrPath}>
                      打开 WebXR
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state compact">
                <strong>还没有 session</strong>
                <p>创建入口后，这里会生成 Quest 可扫码打开的二维码。</p>
              </div>
            )}

            <SessionActions currentSessionId={latestSessionId} videoId={video.id} />
          </section>

          <section className="mobile-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Progress</p>
                <h2>裁剪状态</h2>
              </div>
              {sessionStatus ? <StatusBadge status={sessionStatus.sessionStatus} /> : null}
            </div>

            {sessionStatus ? (
              <>
                <div className="dashboard-strip compact">
                  <div>
                    <span>{sessionStatus.completedCount}</span>
                    <p>完成</p>
                  </div>
                  <div>
                    <span>{sessionStatus.dirtyCount}</span>
                    <p>待重渲染</p>
                  </div>
                  <div>
                    <span>{sessionStatus.failedCount}</span>
                    <p>失败</p>
                  </div>
                  <div>
                    <span>{sessionStatus.discardedCount}</span>
                    <p>丢弃</p>
                  </div>
                </div>

                {sessionStatus.minuteStatuses.length > 0 ? (
                  <div className="minute-list">
                    {sessionStatus.minuteStatuses.map((minute) => {
                      const index = Number(minute.minuteIndex ?? 0);
                      const status = String(minute.status ?? "collecting");
                      return (
                        <div className="minute-row" key={`${index}-${status}`}>
                          <span>第 {index + 1} 分钟</span>
                          <StatusBadge status={status} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted">还没有分钟级裁剪状态。进入 WebXR 并提交路径后会更新。</p>
                )}
              </>
            ) : (
              <p className="muted">还没有裁剪 session。</p>
            )}
          </section>

          <section className="mobile-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Export</p>
                <h2>导出结果</h2>
              </div>
              {latestExportStatus ? <StatusBadge status={latestExportStatus} /> : null}
            </div>

            {latestExportId ? (
              <div className="export-summary">
                <p>
                  当前导出：<strong>{latestExportId}</strong>
                </p>
                <p className="muted">状态：{statusLabel(latestExportStatus)}</p>
                {latestExportError ? <p className="error-text">{latestExportError}</p> : null}
                <div className="button-row">
                  <Link className="button" href={`/mobile/exports/${encodeURIComponent(latestExportId)}`}>
                    查看导出
                  </Link>
                  {sessionStatus?.downloadReady ? (
                    <a
                      className="button primary"
                      href={apiUrl(`/api/exports/${encodeURIComponent(latestExportId)}/download`)}
                    >
                      下载 MP4
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
    </MobileShell>
  );
}
