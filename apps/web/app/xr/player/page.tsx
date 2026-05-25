import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PcWebXrEditor } from "@/features/webxr/pc-editor";
import { buildPcEditorLibraryModel, type PcEditorLibraryModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";
import { createCutSession } from "@/lib/api";

export default async function XrPlayerPage() {
  let model: PcEditorLibraryModel | null = null;
  let error: string | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    model = await buildPcEditorLibraryModel(cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load WebXR video library.";
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

  const firstVideoId = model.playlistSources[0]?.id ?? "default-video";
  const sessionId = `player-session-${Date.now()}`;

  try {
    await createCutSession(firstVideoId, sessionId, { cookie: cookieHeader });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to create recording session.";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  if (error) {
    return (
      <main>
        <div className="shell stack">
          <section className="panel stack">
            <p className="muted">WebXR Player</p>
            <h1>Session creation failed</h1>
            <p className="error-text">{error}</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <PcWebXrEditor
      enableTimelineBridge
      initialSourceId={firstVideoId}
      initialSources={model.playlistSources}
      pcWorkbench
      singleSourceTitle="Select a 360 video"
      sourceMode="provided"
      sourceUrl=""
      timelineSessionId={sessionId}
      timelineVideoId={firstVideoId}
      videoId="xr-library-player-video"
    />
  );
}
