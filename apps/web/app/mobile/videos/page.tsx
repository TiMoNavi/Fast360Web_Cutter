import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
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

  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">Mobile Web</p>
          <h1>我的视频</h1>
          <p className="muted">
            {email ? `当前用户：${email}` : "请先登录，再上传和处理 360 视频。"}
          </p>
          <div className="button-row">
            <Link className="button" href="/">
              返回首页
            </Link>
            <Link className="button" href="/mobile/login">
              登录/注册
            </Link>
            <Link className="button" href="/xr/videos">
              WebXR 列表
            </Link>
            {email ? <LogoutButton /> : null}
          </div>
        </section>

        {email ? (
          <section className="panel stack">
          <h2>上传</h2>
          <VideoUploadForm />
          </section>
        ) : null}

        <section className="panel stack">
          <h2>视频列表</h2>
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
                <Link
                  className="button primary"
                  href={`/mobile/videos/${encodeURIComponent(video.id)}`}
                >
                  查看
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
