import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileShell } from "@/components/mobile/MobileShell";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import { ShareButton } from "@/components/mobile/ShareButton";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatResolution
} from "@/components/mobile/format";
import { apiUrl, getMe, listExports, listVideos } from "@/lib/api";
import type { ExportSummary, VideoSummary } from "@/lib/api";

function exportTitle(item: ExportSummary) {
  return item.filename || item.exportId;
}

function videoCoverUrl(video?: VideoSummary | null) {
  return video?.thumbnailUrl ? apiUrl(video.thumbnailUrl) : null;
}

export default async function MobileAccountExportsPage() {
  let exports: ExportSummary[] = [];
  let videos: VideoSummary[] = [];
  let email: string | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    const [user, exportList, videoList] = await Promise.all([
      getMe({ cookie: cookieHeader }),
      listExports({ cookie: cookieHeader }),
      listVideos({ cookie: cookieHeader })
    ]);
    email = user.email;
    exports = exportList;
    videos = videoList;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取导出记录失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  const readyCount = exports.filter((item) => item.downloadReady).length;
  const failedCount = exports.filter((item) => item.status === "failed").length;
  const totalSize = exports.reduce((total, item) => total + (item.fileSize ?? 0), 0);
  const latestExport = exports[0] ?? null;
  const videosById = new Map(videos.map((video) => [video.id, video]));

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="Neon Exports"
      title="导出记录"
      variant="vapor"
    >
      <div className="vapor-library-page">
        <section className="vapor-library-hero vapor-exports-hero">
          <div className="vapor-sun" aria-hidden="true" />
          <div className="vapor-grid-floor" aria-hidden="true" />
          <div className="vapor-hero-copy">
            <p className="vapor-command">&gt; RENDER_OUTPUT / MP4</p>
            <h2>
              裁剪后
              <span>视频出口</span>
            </h2>
            <p>所有 WebXR 取景渲染后的 MP4 都在这里，按状态浏览、回到源视频，或直接下载成片。</p>
          </div>
          <div className="vapor-stat-panel" aria-label="导出记录概览">
            <div>
              <span>{exports.length}</span>
              <p>全部导出</p>
            </div>
            <div>
              <span>{readyCount}</span>
              <p>可下载</p>
            </div>
            <div>
              <span>{failedCount}</span>
              <p>失败</p>
            </div>
            <div>
              <span>{formatBytes(totalSize)}</span>
              <p>导出总量</p>
            </div>
          </div>
        </section>

        {latestExport ? (
          <section className="vapor-export-callout">
            <div>
              <p className="vapor-command">&gt; latest</p>
              <h2>{exportTitle(latestExport)}</h2>
              <p>{latestExport.exportId}</p>
            </div>
            <StatusBadge status={latestExport.status} />
            <div className="vapor-card-actions">
              <Link
                className="vapor-button vapor-button-ghost"
                href={`/mobile/videos/${encodeURIComponent(latestExport.videoId)}`}
              >
                <span>源视频</span>
              </Link>
              <Link
                className="vapor-button vapor-button-primary"
                href={`/mobile/exports/${encodeURIComponent(latestExport.exportId)}`}
              >
                <span>查看最新导出</span>
              </Link>
              {latestExport.downloadReady ? (
                <ShareButton
                  exportId={latestExport.exportId}
                  filename={latestExport.filename || `export-${latestExport.exportId}.mp4`}
                  downloadUrl={apiUrl(`/api/exports/${encodeURIComponent(latestExport.exportId)}/download`)}
                />
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; export queue</p>
              <h2>裁剪后视频</h2>
            </div>
            <Link className="vapor-button vapor-button-outline" href="/mobile/videos">
              <span>返回视频列表</span>
            </Link>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {exports.length === 0 && !error ? (
            <div className="vapor-empty-state">
              <strong>&gt; 暂无导出结果</strong>
              <p>完成一次 WebXR 裁剪渲染后，导出的 MP4 会出现在这里。</p>
            </div>
          ) : null}

          <div className="vapor-video-grid">
            {exports.map((item) => {
              const sourceVideo = videosById.get(item.videoId);
              const coverUrl = videoCoverUrl(sourceVideo);
              return (
                <article className="vapor-video-card vapor-export-card" key={item.exportId}>
                  <Link
                    aria-label={`查看 ${exportTitle(item)} 的导出详情`}
                    className="vapor-video-cover"
                    href={`/mobile/exports/${encodeURIComponent(item.exportId)}`}
                  >
                    {coverUrl ? (
                      <img
                        alt={`${exportTitle(item)} 的源视频封面`}
                        loading="lazy"
                        src={coverUrl}
                      />
                    ) : (
                      <div className="vapor-cover-placeholder vapor-export-cover" aria-hidden="true">
                        <span>MP4</span>
                      </div>
                    )}
                    <div className="vapor-cover-gradient" aria-hidden="true" />
                    <span className="vapor-duration">{formatDuration(item.durationMs)}</span>
                  </Link>

                  <div className="vapor-video-body">
                    <div className="vapor-video-title-row">
                      <div>
                        <h3>{exportTitle(item)}</h3>
                        <p>{item.exportId}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <dl className="vapor-video-metrics">
                      <div>
                        <dt>导出大小</dt>
                        <dd>{formatBytes(item.fileSize)}</dd>
                      </div>
                      <div>
                        <dt>源规格</dt>
                        <dd>{formatResolution(sourceVideo?.width ?? item.width, sourceVideo?.height ?? item.height)}</dd>
                      </div>
                      <div>
                        <dt>更新</dt>
                        <dd>{formatDate(item.updatedAt)}</dd>
                      </div>
                    </dl>

                    {item.errorMessage ? (
                      <div className="vapor-error-panel">
                        <strong>失败原因</strong>
                        <p>{item.errorMessage}</p>
                      </div>
                    ) : null}

                    <div className="vapor-card-footer">
                      <span>源视频 {sourceVideo?.filename || item.videoId}</span>
                      <div className="vapor-card-actions">
                        <Link
                          className="vapor-button vapor-button-ghost"
                          href={`/mobile/videos/${encodeURIComponent(item.videoId)}`}
                        >
                          <span>源视频</span>
                        </Link>
                        <Link
                          className="vapor-button vapor-button-primary"
                          href={`/mobile/exports/${encodeURIComponent(item.exportId)}`}
                        >
                          <span>播放导出</span>
                        </Link>
                        {item.downloadReady ? (
                          <>
                            <a
                              className="vapor-button vapor-button-ghost"
                              href={apiUrl(`/api/exports/${encodeURIComponent(item.exportId)}/download`)}
                            >
                              <span>下载</span>
                            </a>
                            <ShareButton
                              exportId={item.exportId}
                              filename={item.filename || `export-${item.exportId}.mp4`}
                              downloadUrl={apiUrl(`/api/exports/${encodeURIComponent(item.exportId)}/download`)}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
