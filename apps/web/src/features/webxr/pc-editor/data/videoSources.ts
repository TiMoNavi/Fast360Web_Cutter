import { apiUrl, type VideoSummary } from "@/lib/api";
import type { AFrame360VideoSource } from "../controls/types";

export function browserAssetUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(url) || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }

  return apiUrl(url);
}

export function videoKind(sourceUrl: string): AFrame360VideoSource["kind"] {
  const path = sourceUrl.split("?")[0]?.toLowerCase() ?? sourceUrl.toLowerCase();
  return path.endsWith(".m3u8") ? "hls" : "mp4";
}

export function videoResolution(video: VideoSummary) {
  if (video.width && video.height) {
    return `${video.width}x${video.height}`;
  }

  return undefined;
}

export function videoToSource(video: VideoSummary): AFrame360VideoSource | null {
  const sourceUrl = browserAssetUrl(video.sourceUrl);
  if (!sourceUrl) {
    return null;
  }

  return {
    durationMs: video.durationMs,
    id: video.id,
    kind: videoKind(sourceUrl),
    resolution: videoResolution(video),
    sourceUrl,
    thumbnailUrl: browserAssetUrl(video.thumbnailUrl),
    title: video.filename
  };
}

export function uniqueSources(sources: AFrame360VideoSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) {
      return false;
    }

    seen.add(source.id);
    return true;
  });
}
