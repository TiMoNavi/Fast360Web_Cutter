import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CutSessionControls } from "@/components/CutSessionControls";
import { apiUrl, getSessionStatus, getVideo } from "@/lib/api";
import type { SessionStatus, VideoDetail } from "@/lib/api";

type PageProps = {
  params: Promise<{
    videoId: string;
  }>;
};

export default async function MobileVideoDetailPage({ params }: PageProps) {
  const { videoId } = await params;
  let video: VideoDetail | null = null;
  let sessionStatus: SessionStatus | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    video = await getVideo(videoId, { cookie: cookieHeader });
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

  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">Mobile Web</p>
          <h1>视频详情：{videoId}</h1>
          <p className="muted">读取 GET /api/videos/{videoId}，并创建或进入 WebXR session。</p>
          <div className="button-row">
            <Link className="button" href="/mobile/videos">
              我的视频
            </Link>
            <Link className="button" href="/mobile/login">
              登录/注册
            </Link>
            <Link className="button" href="/xr/videos">
              WebXR 列表
            </Link>
          </div>
        </section>

        <section className="panel stack">
          <h2>Metadata</h2>
          {error ? <p className="error-text">{error}</p> : null}
          {video ? <pre className="json-block">{JSON.stringify(video, null, 2)}</pre> : null}
        </section>

        <section className="panel stack">
          <h2>WebXR Session</h2>
          <CutSessionControls videoId={videoId} />
        </section>

        {sessionStatus ? (
          <section className="panel stack">
            <h2>裁剪状态</h2>
            <pre className="json-block">{JSON.stringify(sessionStatus, null, 2)}</pre>
            <div className="button-row">
              {sessionStatus.exportId ? (
                <Link
                  className="button"
                  href={`/mobile/exports/${encodeURIComponent(sessionStatus.exportId)}`}
                >
                  查看导出
                </Link>
              ) : null}
              {sessionStatus.downloadReady && sessionStatus.exportId ? (
                <a
                  className="button primary"
                  href={apiUrl(`/api/exports/${encodeURIComponent(sessionStatus.exportId)}/download`)}
                >
                  下载 MP4
                </a>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
