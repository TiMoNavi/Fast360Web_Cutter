import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { XrSessionLink } from "@/components/XrSessionLink";
import { listVideos } from "@/lib/api";
import type { VideoSummary } from "@/lib/api";

export default async function XrVideosPage() {
  let videos: VideoSummary[] = [];
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    videos = await listVideos({ cookie: cookieHeader });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取视频列表失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">WebXR</p>
          <h1>WebXR 视频列表</h1>
          <p className="muted">与移动端共用 GET /api/videos，用 sessionId 进入裁剪占位页。</p>
          <div className="button-row">
            <Link className="button" href="/">
              返回首页
            </Link>
            <Link className="button" href="/mobile/videos">
              移动端列表
            </Link>
            <Link className="button" href="/mobile/login">
              登录/注册
            </Link>
          </div>
        </section>

        <section className="panel stack">
          <h2>可进入的视频</h2>
          {error ? <p className="error-text">{error}</p> : null}
          {videos.length === 0 && !error ? <p className="muted">暂无视频。</p> : null}
          <div className="table-list">
            {videos.map((video) => (
              <div className="table-row" key={video.id}>
                <div>
                  <strong>{video.filename || video.id}</strong>
                  <p className="muted">id: {video.id}</p>
                </div>
                <div className="status-pill">{video.status}</div>
                <XrSessionLink videoId={video.id} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
