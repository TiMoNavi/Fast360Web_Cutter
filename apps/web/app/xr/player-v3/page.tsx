import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PlayerV3 } from "@/components/pc_editor/Aframe/player-v3";
import { buildPcEditorPlayerModel } from "@/components/pc_editor/data/buildPcEditorSessionModel";

export default async function PlayerV3Page() {
  const cookieHeader = (await cookies()).toString();
  let model = null;
  let error = null;

  try {
    model = await buildPcEditorPlayerModel(cookieHeader);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load";
    if (error === "Not authenticated") {
      redirect("/mobile/login");
    }
  }

  if (error || !model) {
    return <div>Error: {error}</div>;
  }

  return <PlayerV3 model={model} />;
}
