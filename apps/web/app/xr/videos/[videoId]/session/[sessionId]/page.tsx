import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FixedOrbitRenderButton } from "@/components/FixedOrbitRenderButton";
import { getVideo } from "@/lib/api";
import type { VideoDetail } from "@/lib/api";

type PageProps = {
  params: Promise<{
    videoId: string;
    sessionId: string;
  }>;
};

export default async function XrSessionPage({ params }: PageProps) {
  const { videoId, sessionId } = await params;
  let video: VideoDetail | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    video = await getVideo(videoId, { cookie: cookieHeader });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "读取视频失败。";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  return (
    <main>
      <div className="shell stack">
        <section className="panel stack">
          <p className="muted">WebXR</p>
          <h1>WebXR 裁剪占位页</h1>
          <p className="muted">
            videoId={videoId}，sessionId={sessionId}。这里后续会初始化 Three.js、VideoTexture、
            取景框、手柄输入和路径采样。
          </p>
          <div className="button-row">
            <Link className="button" href="/xr/videos">
              WebXR 视频列表
            </Link>
            <Link className="button" href={`/mobile/videos/${encodeURIComponent(videoId)}`}>
              手机端详情
            </Link>
          </div>
        </section>

        <section className="grid">
          <div className="panel stack">
            <h2>待接入模块</h2>
            <ul>
              <li>Three.js scene</li>
              <li>inside-out video sphere</li>
              <li>XR controller input</li>
              <li>5Hz path sampler</li>
            </ul>
          </div>
          <div className="panel stack">
            <h2>路径协议</h2>
            <ul>
              <li>ClipEditConfig</li>
              <li>ViewPathPatch</li>
              <li>ViewPathPoint</li>
              <li>PlaybackClientState</li>
            </ul>
          </div>
        </section>

        <section className="panel stack">
          <h2>发送路径 Patch</h2>
          {error ? <p className="error-text">{error}</p> : null}
          <FixedOrbitRenderButton
            durationMs={typeof video?.durationMs === "number" ? video.durationMs : undefined}
            sessionId={sessionId}
            videoId={videoId}
          />
        </section>
      </div>
    </main>
  );
}
