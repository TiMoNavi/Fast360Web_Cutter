import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MobileShell } from "@/components/mobile/MobileShell";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import { Video360Preview } from "@/components/mobile/Video360Preview";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatFps,
  formatResolution
} from "@/components/mobile/format";
import { apiUrl, getMe, listExports, listVideos } from "@/lib/api";
import type { ExportSummary, VideoSummary } from "@/lib/api";

function videoCoverUrl(video: VideoSummary) {
  return video.thumbnailUrl ? apiUrl(video.thumbnailUrl) : null;
}

function latestReadyExportForVideo(exports: ExportSummary[], videoId: string) {
  return exports.find((item) => item.videoId === videoId && item.downloadReady) ?? null;
}

export default async function MobileFavoritesPage() {
  let email: string | null = null;
  let error: string | null = null;
  let videos: VideoSummary[] = [];
  let exports: ExportSummary[] = [];
  const cookieHeader = (await cookies()).toString();

  try {
    const [user, videoList, exportList] = await Promise.all([
      getMe({ cookie: cookieHeader }),
      listVideos({ cookie: cookieHeader }),
      listExports({ cookie: cookieHeader })
    ]);
    email = user.email;
    videos = videoList;
    exports = exportList;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取收藏页失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  const readyVideos = videos.filter((video) => video.status === "ready_for_xr");
  const favoriteCandidates = [...readyVideos, ...videos.filter((video) => video.status !== "ready_for_xr")].slice(0, 6);
  const readyExports = exports.filter((item) => item.downloadReady).slice(0, 4);
  const totalSourceSize = favoriteCandidates.reduce((total, video) => total + (video.fileSize ?? 0), 0);
  const featuredVideo = favoriteCandidates[0] ?? null;

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="Neon Collection"
      title="我的收藏"
      variant="vapor"
    >
      <div className="vapor-library-page">
        <section className="vapor-library-hero vapor-favorites-hero">
          <div className="vapor-sun" aria-hidden="true" />
          <div className="vapor-grid-floor" aria-hidden="true" />
          <div className="vapor-hero-copy">
            <p className="vapor-command">&gt; COLLECTION / QUICK_ACCESS</p>
            <h2>
              收藏的
              <span>360 素材</span>
            </h2>
            <p>先把最适合继续编辑和演示的素材集中展示，视觉和视频列表、视频详情保持同一套霓虹界面。</p>
          </div>
          <div className="vapor-stat-panel" aria-label="收藏概览">
            <div>
              <span>{favoriteCandidates.length}</span>
              <p>视频候选</p>
            </div>
            <div>
              <span>{readyVideos.length}</span>
              <p>可进入 WebXR</p>
            </div>
            <div>
              <span>{readyExports.length}</span>
              <p>可下载导出</p>
            </div>
            <div>
              <span>{formatBytes(totalSourceSize)}</span>
              <p>候选素材量</p>
            </div>
          </div>
        </section>

        {featuredVideo ? (
          <section className="vapor-detail-hero">
            <div className="vapor-window-titlebar">
              <div className="vapor-window-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p>&gt; FEATURED_VIDEO_VIEW</p>
            </div>
            <div className="vapor-detail-player-grid">
              <Video360Preview
                posterUrl={videoCoverUrl(featuredVideo)}
                sourceUrl={apiUrl(featuredVideo.sourceUrl ?? `/api/videos/${encodeURIComponent(featuredVideo.id)}/download`)}
                title={featuredVideo.filename || featuredVideo.id}
              />
              <aside className="vapor-detail-summary">
                <p className="vapor-command">&gt; quick view</p>
                <h2>{featuredVideo.filename || featuredVideo.id}</h2>
                <p>{featuredVideo.id}</p>
                <StatusBadge status={featuredVideo.status} />
                <dl className="vapor-detail-metrics">
                  <div>
                    <dt>时长</dt>
                    <dd>{formatDuration(featuredVideo.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>规格</dt>
                    <dd>{formatResolution(featuredVideo.width, featuredVideo.height)}</dd>
                  </div>
                  <div>
                    <dt>大小</dt>
                    <dd>{formatBytes(featuredVideo.fileSize)}</dd>
                  </div>
                  <div>
                    <dt>帧率</dt>
                    <dd>{formatFps(featuredVideo.fps)}</dd>
                  </div>
                </dl>
                <div className="vapor-card-actions">
                  <Link
                    className="vapor-button vapor-button-primary"
                    href={`/mobile/videos/${encodeURIComponent(featuredVideo.id)}`}
                  >
                    <span>打开视频详情</span>
                  </Link>
                  <a
                    className="vapor-button vapor-button-ghost"
                    href={apiUrl(`/api/videos/${encodeURIComponent(featuredVideo.id)}/download`)}
                  >
                    <span>下载源视频</span>
                  </a>
                </div>
              </aside>
            </div>
          </section>
        ) : null}

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; pinned videos</p>
              <h2>收藏的视频</h2>
            </div>
            <Link className="vapor-button vapor-button-outline" href="/mobile/videos">
              <span>查看全部视频</span>
            </Link>
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {favoriteCandidates.length === 0 && !error ? (
            <div className="vapor-empty-state">
              <strong>&gt; 暂无收藏候选</strong>
              <p>上传 360 视频后，这里会优先展示可进入 WebXR 的素材。</p>
            </div>
          ) : null}

          <div className="vapor-video-grid">
            {favoriteCandidates.map((video) => {
              const latestExport = latestReadyExportForVideo(exports, video.id);
              const coverUrl = videoCoverUrl(video);
              return (
                <article className="vapor-video-card" key={video.id}>
                  <Link
                    aria-label={`查看 ${video.filename || video.id} 的详情`}
                    className="vapor-video-cover"
                    href={`/mobile/videos/${encodeURIComponent(video.id)}`}
                  >
                    {coverUrl ? (
                      <img
                        alt={`${video.filename || video.id} 的视频封面`}
                        loading="lazy"
                        src={coverUrl}
                      />
                    ) : (
                      <div className="vapor-cover-placeholder" aria-hidden="true">
                        <span>360</span>
                      </div>
                    )}
                    <div className="vapor-cover-gradient" aria-hidden="true" />
                    <span className="vapor-duration">{formatDuration(video.durationMs)}</span>
                  </Link>

                  <div className="vapor-video-body">
                    <div className="vapor-video-title-row">
                      <div>
                        <h3>{video.filename || video.id}</h3>
                        <p>{video.id}</p>
                      </div>
                      <StatusBadge status={video.status} />
                    </div>

                    <dl className="vapor-video-metrics">
                      <div>
                        <dt>规格</dt>
                        <dd>{formatResolution(video.width, video.height)}</dd>
                      </div>
                      <div>
                        <dt>大小</dt>
                        <dd>{formatBytes(video.fileSize)}</dd>
                      </div>
                      <div>
                        <dt>帧率</dt>
                        <dd>{formatFps(video.fps)}</dd>
                      </div>
                    </dl>

                    <div className="vapor-card-footer">
                      <span>更新于 {formatDate(video.updatedAt ?? video.createdAt)}</span>
                      <div className="vapor-card-actions">
                        {latestExport ? (
                          <a
                            className="vapor-button vapor-button-ghost"
                            href={apiUrl(`/api/exports/${encodeURIComponent(latestExport.exportId)}/download`)}
                          >
                            <span>导出</span>
                          </a>
                        ) : null}
                        <Link
                          className="vapor-button vapor-button-primary"
                          href={`/mobile/videos/${encodeURIComponent(video.id)}`}
                        >
                          <span>详情</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; saved outputs</p>
              <h2>收藏的导出</h2>
            </div>
            <Link className="vapor-button vapor-button-outline" href="/mobile/account/exports">
              <span>导出记录</span>
            </Link>
          </div>

          {readyExports.length === 0 && !error ? (
            <div className="vapor-empty-state">
              <strong>&gt; 暂无可下载导出</strong>
              <p>完成 WebXR 渲染测试后，可下载 MP4 会出现在这里。</p>
            </div>
          ) : null}

          <div className="vapor-favorite-export-list">
            {readyExports.map((item) => (
              <article className="vapor-favorite-export-row" key={item.exportId}>
                <div>
                  <p className="vapor-command">&gt; ready mp4</p>
                  <h3>{item.filename || item.exportId}</h3>
                  <span>{item.exportId}</span>
                </div>
                <StatusBadge status={item.status} />
                <dl className="vapor-video-metrics">
                  <div>
                    <dt>大小</dt>
                    <dd>{formatBytes(item.fileSize)}</dd>
                  </div>
                  <div>
                    <dt>时长</dt>
                    <dd>{formatDuration(item.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>更新</dt>
                    <dd>{formatDate(item.updatedAt)}</dd>
                  </div>
                </dl>
                <div className="vapor-card-actions">
                  <Link className="vapor-button vapor-button-ghost" href={`/mobile/exports/${encodeURIComponent(item.exportId)}`}>
                    <span>详情</span>
                  </Link>
                  <a
                    className="vapor-button vapor-button-primary"
                    href={apiUrl(`/api/exports/${encodeURIComponent(item.exportId)}/download`)}
                  >
                    <span>下载</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </MobileShell>
  );
}
