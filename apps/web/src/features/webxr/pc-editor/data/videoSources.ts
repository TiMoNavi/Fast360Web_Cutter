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

function metadataString(video: VideoSummary, key: string) {
  const value = video.metadata?.[key];
  return typeof value === "string" ? value.toLowerCase() : null;
}

export function isLikelyEquirectangularSource(video: VideoSummary) {
  const projection = metadataString(video, "projection");
  const layout = metadataString(video, "layout");

  if (projection && projection !== "equirectangular") {
    return false;
  }

  if (layout && layout !== "mono-2:1") {
    return false;
  }

  if (projection === "equirectangular" || layout === "mono-2:1") {
    return true;
  }

  if (video.width && video.height) {
    const aspect = video.width / video.height;
    return aspect > 1.92 && aspect < 2.08;
  }

  return true;
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
