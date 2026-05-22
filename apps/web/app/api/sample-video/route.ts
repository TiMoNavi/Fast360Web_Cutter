import { createReadStream, statSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

const SAMPLE_VIDEO_PATH = resolve(process.cwd(), "..", "..", "storage", "sample-videos", "pano.mp4");
const MIME_TYPE = "video/mp4";

function streamFile(start: number, end: number) {
  return Readable.toWeb(createReadStream(SAMPLE_VIDEO_PATH, { start, end })) as ReadableStream;
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

  if (!match) {
    return null;
  }

  const [, startText, endText] = match;
  const start = startText ? Number.parseInt(startText, 10) : 0;
  const end = endText ? Number.parseInt(endText, 10) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

export async function GET(request: NextRequest) {
  const { size } = statSync(SAMPLE_VIDEO_PATH);
  const range = parseRange(request.headers.get("range"), size);

  if (!range) {
    return new Response(streamFile(0, size - 1), {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Content-Type": MIME_TYPE
      }
    });
  }

  const contentLength = range.end - range.start + 1;

  return new Response(streamFile(range.start, range.end), {
    status: 206,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(contentLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Content-Type": MIME_TYPE
    }
  });
}
