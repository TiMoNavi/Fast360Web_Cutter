import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const candidatePaths = [
    join(process.cwd(), "node_modules", "aframe", "dist", "aframe-master.min.js"),
    join(process.cwd(), "..", "..", "node_modules", "aframe", "dist", "aframe-master.min.js")
  ];
  let script: string | null = null;

  for (const scriptPath of candidatePaths) {
    try {
      script = await readFile(scriptPath, "utf8");
      break;
    } catch {
      // Next can run this route from the repo root or the workspace root.
    }
  }

  if (!script) {
    return new Response("A-Frame runtime script not found.", {
      status: 500
    });
  }

  return new Response(script, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "application/javascript; charset=utf-8"
    }
  });
}
