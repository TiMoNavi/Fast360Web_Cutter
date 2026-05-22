import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "storage", "sample-videos", "pano.mp4");
const outputDir = resolve(root, "storage", "sample-streams", "pano-hls");
const playlist = resolve(outputDir, "index.m3u8");

if (!existsSync(input)) {
  throw new Error(`sample video missing: ${input}`);
}

rmSync(outputDir, { force: true, recursive: true, maxRetries: 8, retryDelay: 250 });
mkdirSync(outputDir, { recursive: true });

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    input,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-g",
    "50",
    "-sc_threshold",
    "0",
    "-hls_time",
    "2",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    resolve(outputDir, "segment_%03d.ts"),
    playlist
  ],
  { stdio: "inherit" }
);

console.log(`prepared HLS sample stream: ${playlist}`);
