export async function GET() {
  return Response.json({
    videos: [
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
    ]
  });
}
