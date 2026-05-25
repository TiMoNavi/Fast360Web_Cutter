import { ThreeOfficialInteractiveLab } from "@/components/three/ThreeOfficialInteractiveLab";
import { buildPcEditorLibraryModel, type PcEditorLibraryModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";
import { createCutSession } from "@/lib/api";
import { cookies } from "next/headers";

export default async function ThreeOfficialInteractiveLabPage() {
  let model: PcEditorLibraryModel | null = null;
  const cookieHeader = (await cookies()).toString();

  try {
    model = await buildPcEditorLibraryModel(cookieHeader);
  } catch {
    model = null;
  }

  const firstVideoId = model?.playlistSources[0]?.id;
  let sessionId: string | undefined;

  if (firstVideoId) {
    sessionId = `three-lab-session-${Date.now()}`;
    try {
      await createCutSession(firstVideoId, sessionId, { cookie: cookieHeader });
    } catch {
      sessionId = undefined;
    }
  }

  return <ThreeOfficialInteractiveLab initialSources={model?.playlistSources} sessionId={sessionId} videoId={firstVideoId} />;
}
