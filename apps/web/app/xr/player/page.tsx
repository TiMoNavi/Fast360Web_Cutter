import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PcWebXrEditor } from "@/features/webxr/pc-editor";
import { buildPcEditorPlayerModel, type PcEditorPlayerModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";

export default async function XrPlayerPage() {
  let model: PcEditorPlayerModel | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    model = await buildPcEditorPlayerModel(cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load WebXR player session.";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  if (error || !model) {
    return (
      <main>
        <div className="shell stack">
          <section className="panel stack">
            <p className="muted">WebXR Player</p>
            <h1>Video library unavailable</h1>
            <p className="error-text">{error ?? "The video library could not be loaded."}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <PcWebXrEditor
      enableTimelineBridge
      initialSourceId={model.currentSource.id}
      initialSources={model.playlistSources}
      pcWorkbench
      sessionSwitchMode="player-active-session"
      singleSourceTitle="Select a 360 video"
      sourceMode="provided"
      sourceUrl={model.currentSource.sourceUrl}
      timelineSessionId={model.session.sessionId}
      timelineVideoId={model.session.videoId}
      videoId="xr-library-player-video"
    />
  );
}
