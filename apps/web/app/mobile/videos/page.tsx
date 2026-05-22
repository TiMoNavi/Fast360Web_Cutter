import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
import { getMe, listVideos } from "@/lib/api";
import type { VideoSummary } from "@/lib/api";

export default async function MobileVideosPage() {
  let videos: VideoSummary[] = [];
  let error: string | null = null;
  let email: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    const [user, videoList] = await Promise.all([
      getMe({ cookie: cookieHeader }),
      listVideos({ cookie: cookieHeader })
    ]);
    email = user.email;
    videos = videoList;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取视频列表失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  const readyCount = videos.filter((video) => video.status === "ready_for_xr").length;

  return (
    <MobileShell email={email} title="我的视频">
      <section className="dashboard-strip">
        <div>
          <span>{videos.length}</span>
          <p>视频</p>
        </div>
        <div>
          <span>{readyCount}</span>
          <p>可进入 WebXR</p>
        </div>
        <div>
          <span>{email ? "已登录" : "未登录"}</span>
          <p>{email ?? "Account"}</p>
        </div>
      </section>

      <section className="mobile-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload</p>
            <h2>上传 360 视频</h2>
          </div>
        </div>
        <VideoUploadForm />
      </section>

      <section className="mobile-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2>视频列表</h2>
          </div>
          <Link className="button" href="/xr/videos">
            WebXR 列表
          </Link>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {videos.length === 0 && !error ? (
          <div className="empty-state">
            <strong>暂无视频</strong>
            <p>先上传一段 360 MP4，上传完成后它会出现在这里。</p>
          </div>
        ) : null}

        <div className="video-card-list">
          {videos.map((video) => (
            <article className="video-card" key={video.id}>
              <div className="video-card-main">
                <div>
                  <h3>{video.filename || video.id}</h3>
                  <p>{video.id}</p>
                </div>
                <StatusBadge status={video.status} />
              </div>

              <dl className="metric-grid">
                <div>
                  <dt>时长</dt>
                  <dd>{formatDuration(video.durationMs)}</dd>
                </div>
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

              <div className="card-footer">
                <span>更新于 {formatDate(video.updatedAt ?? video.createdAt)}</span>
                <Link
                  className="button primary"
                  href={`/mobile/videos/${encodeURIComponent(video.id)}`}
                >
                  查看详情
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </MobileShell>
  );
}
