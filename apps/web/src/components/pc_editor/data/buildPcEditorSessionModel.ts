import { getVideo, getWebXrPlayerSession, listVideos } from "@/lib/api";
import type { VideoDetail, VideoSummary, WebXrPlayerSession } from "@/lib/api";
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

export type PcEditorPlayerModel = {
  currentSource: AFrame360VideoSource;
  playlistSources: AFrame360VideoSource[];
  session: WebXrPlayerSession;
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

export async function buildPcEditorPlayerModel(cookieHeader: string): Promise<PcEditorPlayerModel> {
  const [session, videos] = await Promise.all([
    getWebXrPlayerSession({ cookie: cookieHeader }),
    listVideos({ cookie: cookieHeader })
  ]);
  let playlistSources = uniqueSources(
    videos
      .filter(isLikelyEquirectangularSource)
      .map((item: VideoSummary) => videoToSource(item))
      .filter((source): source is AFrame360VideoSource => Boolean(source))
  );
  let currentSource = playlistSources.find((source) => source.id === session.videoId) ?? null;

  if (!currentSource) {
    const currentVideo = await getVideo(session.videoId, { cookie: cookieHeader });
    currentSource = videoToSource(currentVideo);
    if (currentSource) {
      playlistSources = uniqueSources([currentSource, ...playlistSources]);
    }
  }

  if (!currentSource) {
    throw new Error("The active WebXR session does not expose a playable sourceUrl.");
  }

  return {
    currentSource,
    playlistSources,
    session
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
