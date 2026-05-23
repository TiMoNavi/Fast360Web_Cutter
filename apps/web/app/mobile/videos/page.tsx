import Link from "next/link";
import { cookies, headers } from "next/headers";
import { DemoVideoShowcase } from "@/components/mobile/DemoVideoShowcase";
import { MobileShell } from "@/components/mobile/MobileShell";
import { StatusBadge } from "@/components/mobile/StatusBadge";
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatFps,
  formatResolution
} from "@/components/mobile/format";
import { VideoUploadForm } from "@/components/VideoUploadForm";
import { apiUrl, getMe, listDemoVideos, listExports, listVideos } from "@/lib/api";
import type { DemoVideoSummary, ExportSummary, VideoSummary } from "@/lib/api";

function latestReadyExportForVideo(exports: ExportSummary[], videoId: string) {
  return exports.find((item) => item.videoId === videoId && item.downloadReady) ?? null;
}

function videoCoverUrl(video: VideoSummary) {
  return video.thumbnailUrl ? apiUrl(video.thumbnailUrl) : null;
}

function getPublicOrigin(requestHeaders: Headers) {
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export default async function MobileVideosPage() {
  let demos: DemoVideoSummary[] = [];
  let videos: VideoSummary[] = [];
  let exports: ExportSummary[] = [];
  let error: string | null = null;
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();
  const requestHeaders = await headers();
  const publicEntryUrl = `${getPublicOrigin(requestHeaders)}/mobile/videos`;

  try {
    demos = await listDemoVideos();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not load demo videos.";
  }

  try {
    const user = await getMe({ cookie: cookieHeader });
    email = user.email;
    const [videoList, exportList] = await Promise.all([
      listVideos({ cookie: cookieHeader }),
      listExports({ cookie: cookieHeader })
    ]);
    videos = videoList;
    exports = exportList;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not load your video library.";
    if (message !== "Not authenticated") {
      error = message;
    }
  }

  const readyCount = videos.filter((video) => video.status === "ready_for_xr").length;
  const readyExportCount = exports.filter((item) => item.downloadReady).length;
  const totalSize = videos.reduce((total, video) => total + (video.fileSize ?? 0), 0);

  return (
    <MobileShell
      contentClassName="mobile-content-vapor-wide"
      email={email}
      eyebrow="Neon Library"
      title="我的视频"
      variant="vapor"
    >
      <div className="vapor-library-page">
        <section className="vapor-library-hero">
          <div className="vapor-sun" aria-hidden="true" />
          <div className="vapor-grid-floor" aria-hidden="true" />
          <div className="vapor-hero-copy">
            <p className="vapor-command">&gt; VIDEO_ARCHIVE / XR_READY</p>
            <h2>
              360
              <span>视频库</span>
            </h2>
            <p>
              上传自己的 360 素材，或先用公共示例进入 WebXR 取景。示例会被加入你的账号，之后就像普通视频一样处理。
            </p>
          </div>
          <div className="vapor-stat-panel" aria-label="视频库概览">
            <div>
              <span>{videos.length}</span>
              <p>素材</p>
            </div>
            <div>
              <span>{readyCount}</span>
              <p>可进入 WebXR</p>
            </div>
            <div>
              <span>{readyExportCount}</span>
              <p>可下载导出</p>
            </div>
            <div>
              <span>{formatBytes(totalSize)}</span>
              <p>源文件总量</p>
            </div>
          </div>
        </section>

        <DemoVideoShowcase demos={demos} isAuthenticated={Boolean(email)} publicEntryUrl={publicEntryUrl} />

        {email ? (
          <section className="vapor-upload-window">
            <div className="vapor-window-titlebar">
              <div className="vapor-window-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <p>&gt; UPLOAD_NEW_360_SOURCE</p>
            </div>
            <div className="vapor-window-body">
              <div>
                <p className="vapor-command">&gt; ingest</p>
                <h2>上传 360 视频</h2>
              </div>
              <VideoUploadForm />
            </div>
          </section>
        ) : (
          <section className="vapor-library-section">
            <div className="vapor-section-heading">
              <div>
                <p className="vapor-command">&gt; account required</p>
                <h2>登录后保存你的素材</h2>
              </div>
              <Link className="vapor-button vapor-button-primary" href="/mobile/login?next=%2Fmobile%2Fvideos">
                <span>登录 / 注册</span>
              </Link>
            </div>
            <p className="muted">
              路人观众可以先看示例和教程；要把示例加入自己的视频库、进入 WebXR 或导出结果，需要登录。
            </p>
          </section>
        )}

        <section className="vapor-library-section">
          <div className="vapor-section-heading">
            <div>
              <p className="vapor-command">&gt; browse</p>
              <h2>{email ? "视频列表" : "我的视频"}</h2>
            </div>
            {email ? (
              <Link className="vapor-button vapor-button-outline" href="/mobile/account/exports">
                <span>导出记录</span>
              </Link>
            ) : null}
          </div>

          {error ? <p className="error-text">{error}</p> : null}
          {!email ? (
            <div className="vapor-empty-state">
              <strong>&gt; 尚未登录</strong>
              <p>登录后这里会显示你上传或加入的 360 视频，示例视频也会像普通素材一样出现在这里。</p>
            </div>
          ) : videos.length === 0 && !error ? (
            <div className="vapor-empty-state">
              <strong>&gt; 暂无视频</strong>
              <p>先上传一段 360 MP4，或从上方示例开始。上传完成后，后端会尝试用 FFmpeg 自动截取封面。</p>
            </div>
          ) : null}

          {email ? (
            <div className="vapor-video-grid">
              {videos.map((video) => {
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
                          <a
                            className="vapor-button vapor-button-ghost"
                            href={apiUrl(`/api/videos/${encodeURIComponent(video.id)}/download`)}
                          >
                            <span>源视频</span>
                          </a>
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
          ) : null}
        </section>
      </div>
    </MobileShell>
  );
}
