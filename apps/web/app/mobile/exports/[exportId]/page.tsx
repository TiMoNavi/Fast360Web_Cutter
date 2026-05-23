import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileShell } from "@/components/mobile/MobileShell";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatResolution,
  statusLabel
} from "@/components/mobile/format";
import { apiUrl, getExportStatus, getMe, listExports } from "@/lib/api";
import type { ExportStatus, ExportSummary } from "@/lib/api";

type PageProps = {
  params: Promise<{
    exportId: string;
  }>;
};

function metadataRows(exportStatus: ExportStatus, summary: ExportSummary | null) {
  return [
    ["Export ID", exportStatus.exportId],
    ["Session ID", exportStatus.sessionId],
    ["Video ID", summary?.videoId ?? "-"],
    ["Source Filename", summary?.filename ?? "-"],
    ["Source Duration", formatDuration(summary?.durationMs)],
    ["Source Resolution", formatResolution(summary?.width, summary?.height)],
    ["Created", exportStatus.createdAt],
    ["Updated", exportStatus.updatedAt]
  ];
}

export default async function MobileExportPage({ params }: PageProps) {
  const { exportId } = await params;
  let exportStatus: ExportStatus | null = null;
  let exportSummary: ExportSummary | null = null;
  let error: string | null = null;
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    const [user, status, exportList] = await Promise.all([
      getMe({ cookie: cookieHeader }),
      getExportStatus(exportId, { cookie: cookieHeader }),
      listExports({ cookie: cookieHeader })
    ]);
    email = user.email;
    exportStatus = status;
    exportSummary = exportList.find((item) => item.exportId === exportId) ?? null;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取导出结果失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  const exportDownloadUrl = apiUrl(`/api/exports/${encodeURIComponent(exportId)}/download`);

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="Render Detail"
      title="导出结果"
      variant="vapor"
    >
      <div className="vapor-library-page vapor-detail-page">
        {error ? <p className="error-text">{error}</p> : null}

        {exportStatus ? (
          <>
            <section className="vapor-detail-hero vapor-export-detail-hero">
              <div className="vapor-window-titlebar">
                <div className="vapor-window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p>&gt; OPEN_RENDER_ARTIFACT</p>
              </div>
              <div className="vapor-detail-player-grid">
                <div className="vapor-export-preview">
                  {exportStatus.downloadReady ? (
                    <video
                      className="vapor-export-video-player"
                      controls
                      playsInline
                      preload="metadata"
                      src={exportDownloadUrl}
                    />
                  ) : (
                    <>
                      <div className="vapor-grid-floor" aria-hidden="true" />
                      <div className="vapor-export-preview-label">
                        <p className="vapor-command">&gt; output</p>
                        <h2>MP4</h2>
                        <span>{statusLabel(exportStatus.status)}</span>
                      </div>
                    </>
                  )}
                </div>

                <aside className="vapor-detail-summary">
                  <p className="vapor-command">&gt; artifact</p>
                  <h2>{exportSummary?.filename || exportStatus.exportId}</h2>
                  <p>{exportStatus.exportId}</p>
                  <StatusBadge status={exportStatus.status} />
                  <dl className="vapor-detail-metrics">
                    <div>
                      <dt>状态</dt>
                      <dd>{statusLabel(exportStatus.status)}</dd>
                    </div>
                    <div>
                      <dt>下载</dt>
                      <dd>{exportStatus.downloadReady ? "Ready" : "Not ready"}</dd>
                    </div>
                    <div>
                      <dt>大小</dt>
                      <dd>{formatBytes(exportStatus.fileSize)}</dd>
                    </div>
                    <div>
                      <dt>更新</dt>
                      <dd>{formatDate(exportStatus.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="vapor-card-actions">
                    <Link className="vapor-button vapor-button-ghost" href="/mobile/account/exports">
                      <span>返回导出记录</span>
                    </Link>
                    {exportSummary ? (
                      <Link
                        className="vapor-button vapor-button-ghost"
                        href={`/mobile/videos/${encodeURIComponent(exportSummary.videoId)}`}
                      >
                        <span>源视频</span>
                      </Link>
                    ) : null}
                    {exportStatus.downloadReady ? (
                      <a
                        className="vapor-button vapor-button-primary"
                        href={exportDownloadUrl}
                      >
                        <span>下载裁剪 MP4</span>
                      </a>
                    ) : null}
                  </div>
                </aside>
              </div>
            </section>

            <section className="vapor-library-section">
              <div className="vapor-section-heading">
                <div>
                  <p className="vapor-command">&gt; metadata</p>
                  <h2>导出元数据</h2>
                </div>
                <StatusBadge status={exportStatus.status} />
              </div>
              <dl className="vapor-metadata-table">
                {metadataRows(exportStatus, exportSummary).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {exportStatus.errorMessage ? (
              <section className="vapor-library-section">
                <div className="vapor-section-heading">
                  <div>
                    <p className="vapor-command">&gt; render error</p>
                    <h2>失败原因</h2>
                  </div>
                </div>
                <div className="vapor-error-panel">
                  <strong>FFmpeg render failed</strong>
                  <p>{exportStatus.errorMessage}</p>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </MobileShell>
  );
}
