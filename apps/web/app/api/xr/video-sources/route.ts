import { cookies } from "next/headers";
import { buildPcEditorLibraryModel } from "@/features/webxr/pc-editor/data/buildPcEditorSessionModel";

const FALLBACK_VIDEOS = [
  {
    durationMs: 185000,
    id: "sample-mp4",
    title: "Local 360 MP4 sample",
    kind: "mp4",
    resolution: "5760 x 2880",
    sourceUrl: "/api/sample-video",
    thumbnailUrl: "/assets/xr/geometric-360.svg"
  },
  {
    durationMs: 185000,
    id: "sample-hls",
    title: "Generated 360 HLS stream",
    kind: "hls",
    resolution: "5760 x 2880",
    sourceUrl: "/xr/sample-stream/index.m3u8",
    thumbnailUrl: "/assets/xr/geometric-360.svg"
  }
];

export async function GET() {
  try {
    const model = await buildPcEditorLibraryModel((await cookies()).toString());
    if (model.playlistSources.length) {
      return Response.json({
        source: "backend",
        videos: model.playlistSources
      });
    }
  } catch {
    // Keep the public WebXR lab usable when the API server is offline or the user is not logged in.
  }

  return Response.json({
    source: "fallback",
    videos: FALLBACK_VIDEOS
  });
}
