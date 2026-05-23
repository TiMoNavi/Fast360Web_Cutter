import { createReadStream, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";

const STREAM_ROOT = resolve(process.cwd(), "..", "..", "storage", "sample-streams", "pano-hls");

const MIME_TYPES: Record<string, string> = {
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t"
};

type RouteContext = {
  params: Promise<{
    file: string;
  }>;
};

function streamFile(path: string, start: number, end: number) {
  return Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
}

function responseHeaders(path: string, size: number, range?: { start: number; end: number }) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  });

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  } else {
    headers.set("Content-Length", String(size));
  }

  return headers;
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

async function resolveStreamPath(context: RouteContext) {
  const { file } = await context.params;

  if (!file || file.includes("..") || file.includes("\\") || file.includes("/")) {
    return null;
  }

  const filePath = resolve(STREAM_ROOT, file);

  if (!filePath.startsWith(STREAM_ROOT)) {
    return null;
  }

  return filePath;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const filePath = await resolveStreamPath(context);

  if (!filePath) {
    return new Response("Invalid stream path", { status: 400 });
  }

  let size = 0;

  try {
    size = statSync(filePath).size;
  } catch {
    return new Response("Sample stream not prepared. Run npm run sample:stream.", { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), size);

  if (!range) {
    return new Response(streamFile(filePath, 0, size - 1), {
      headers: responseHeaders(filePath, size)
    });
  }

  return new Response(streamFile(filePath, range.start, range.end), {
    status: 206,
    headers: responseHeaders(filePath, size, range)
  });
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const filePath = await resolveStreamPath(context);

  if (!filePath) {
    return new Response(null, { status: 400 });
  }

  try {
    const { size } = statSync(filePath);
    const range = parseRange(request.headers.get("range"), size);

    if (range) {
      return new Response(null, {
        status: 206,
        headers: responseHeaders(filePath, size, range)
      });
    }

    return new Response(null, {
      headers: responseHeaders(filePath, size)
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
