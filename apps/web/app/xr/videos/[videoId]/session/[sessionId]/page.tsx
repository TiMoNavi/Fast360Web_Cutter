import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PcWebXrEditor } from "@/features/webxr/pc-editor";
import { buildPcEditorSessionModel, type PcEditorSessionModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";

type PageProps = {
  params: Promise<{
    videoId: string;
    sessionId: string;
  }>;
};

export default async function XrSessionPage({ params }: PageProps) {
  const { videoId, sessionId } = await params;
  let model: PcEditorSessionModel | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    model = await buildPcEditorSessionModel(videoId, cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load video";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  if (error || !model) {
    return (
      <main>
        <div className="shell stack">
          <section className="panel stack">
            <p className="muted">WebXR Session</p>
            <h1>Video session unavailable</h1>
            <p className="error-text">{error ?? "This video does not expose a playable sourceUrl."}</p>
            <div className="button-row">
              <Link className="button" href="/xr/videos">
                WebXR videos
              </Link>
              <Link className="button" href={`/mobile/videos/${encodeURIComponent(videoId)}`}>
                Mobile detail
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <PcWebXrEditor
      enableTimelineBridge
      initialSourceId={videoId}
      initialSources={model.playlistSources}
      pcWorkbench
      singleSourceTitle={model.video.filename}
      sourceMode="provided"
      sourceUrl={model.currentSource.sourceUrl}
      timelineSessionId={sessionId}
      timelineVideoId={videoId}
      videoId={`session-video-${videoId}`}
    />
  );
}
