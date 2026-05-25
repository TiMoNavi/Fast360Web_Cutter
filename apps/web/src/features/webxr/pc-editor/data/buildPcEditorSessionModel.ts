import { getVideo, listVideos } from "@/lib/api";
import type { VideoDetail, VideoSummary } from "@/lib/api";
import type { AFrame360VideoSource } from "../controls/types";
import { isLikelyEquirectangularSource, videoToSource, uniqueSources } from "./videoSources";

export type PcEditorSessionModel = {
  currentSource: AFrame360VideoSource;
  playlistSources: AFrame360VideoSource[];
  video: VideoDetail;
};

export type PcEditorLibraryModel = {
  playlistSources: AFrame360VideoSource[];
};

export async function buildPcEditorLibraryModel(cookieHeader: string): Promise<PcEditorLibraryModel> {
  const videos = await listVideos({ cookie: cookieHeader });
  const playlistSources = uniqueSources(
    videos
      .filter(isLikelyEquirectangularSource)
      .map((item: VideoSummary) => videoToSource(item))
      .filter((source): source is AFrame360VideoSource => Boolean(source))
  );

  return {
    playlistSources
  };
}

export async function buildPcEditorSessionModel(videoId: string, cookieHeader: string): Promise<PcEditorSessionModel> {
  const [video, videos] = await Promise.all([
    getVideo(videoId, { cookie: cookieHeader }),
    listVideos({ cookie: cookieHeader })
  ]);

  const currentSource = videoToSource(video);
  if (!currentSource) {
    throw new Error("This video does not expose a playable sourceUrl.");
  }

  const playlistSources = uniqueSources([
    ...videos
      .filter(isLikelyEquirectangularSource)
      .map((item: VideoSummary) => videoToSource(item))
      .filter((source): source is AFrame360VideoSource => Boolean(source)),
    currentSource
  ]);

  return {
    currentSource,
    playlistSources,
    video
  };
}
