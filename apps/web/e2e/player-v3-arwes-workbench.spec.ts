import { expect, test } from "@playwright/test";
import { inflateSync } from "node:zlib";

type RgbaPng = {
  data: Uint8Array;
  height: number;
  width: number;
};

function paethPredictor(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  if (upDistance <= upLeftDistance) {
    return up;
  }

  return upLeft;
}

function readRgbaPng(buffer: Buffer): RgbaPng {
  const pngSignature = "89504e470d0a1a0a";

  if (buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Screenshot is not a PNG image.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }

  const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
  const outputBytesPerPixel = 4;
  const stride = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * outputBytesPerPixel);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(stride);

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= sourceBytesPerPixel ? row[x - sourceBytesPerPixel] : 0;
      const up = previousRow[x];
      const upLeft = x >= sourceBytesPerPixel ? previousRow[x - sourceBytesPerPixel] : 0;
      let predictor = 0;

      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = Math.floor((left + up) / 2);
      } else if (filter === 4) {
        predictor = paethPredictor(left, up, upLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }

      row[x] = (raw + predictor) & 255;
    }

    sourceOffset += stride;
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * sourceBytesPerPixel;
      const targetIndex = (y * width + x) * outputBytesPerPixel;
      rgba[targetIndex] = row[sourceIndex];
      rgba[targetIndex + 1] = row[sourceIndex + 1];
      rgba[targetIndex + 2] = row[sourceIndex + 2];
      rgba[targetIndex + 3] = colorType === 6 ? row[sourceIndex + 3] : 255;
    }

    previousRow = row;
  }

  return { data: rgba, height, width };
}

function countWorkbenchPixels(buffer: Buffer) {
  const png = readRgbaPng(buffer);
  const sampleX = Math.floor(png.width * 0.2);
  const sampleY = Math.floor(png.height * 0.62);
  const sampleWidth = Math.floor(png.width * 0.62);
  const sampleHeight = Math.floor(png.height * 0.34);
  const sampleRight = Math.min(png.width, sampleX + sampleWidth);
  const sampleBottom = Math.min(png.height, sampleY + sampleHeight);
  let cyan = 0;
  let magenta = 0;
  let orange = 0;

  for (let y = sampleY; y < sampleBottom; y += 2) {
    for (let x = sampleX; x < sampleRight; x += 2) {
      const index = (y * png.width + x) * 4;
      const red = png.data[index];
      const green = png.data[index + 1];
      const blue = png.data[index + 2];
      const alpha = png.data[index + 3];

      if (alpha > 0 && green > 145 && blue > 145 && red < 130) {
        cyan += 1;
      }

      if (alpha > 0 && red > 135 && blue > 120 && green < 120) {
        magenta += 1;
      }

      if (alpha > 0 && red > 150 && green > 80 && green < 190 && blue < 110) {
        orange += 1;
      }
    }
  }

  return {
    cyan,
    magenta,
    orange,
    total: cyan + magenta + orange
  };
}

test.use({
  ignoreHTTPSErrors: true,
  viewport: { height: 900, width: 1440 }
});

test.describe("Player V3 Arwes workbench table", () => {
  test("captures flat source and player-v3 spatial table screenshots", async ({ page }, testInfo) => {
    const email = `player-v3-arwes-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const password = "secret123";

    const register = await page.request.post("/api/auth/register", {
      data: { email, password }
    });
    expect(register.status()).toBe(200);

    await page.goto("/xr/arwes-workbench-plane-lab");
    await expect(page.getByTestId("arwes-workbench-plane-lab")).toBeVisible();
    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("arwes-flat-source.png")
    });

    const response = await page.goto("/xr/player-v3");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByTestId("player-v3-xr-stage")).toBeVisible();
    await expect(page.getByTestId("player-v3-ui-overlay")).toBeVisible();

    await expect(page.getByTestId("xr-session-player-ui")).toHaveCount(0);
    await expect(page.getByTestId("hybrid-skin-player-bar")).toBeAttached();
    await expect(page.getByTestId("spatial-playlist-popup")).toHaveCount(0);
    await expect(page.getByTestId("arwes-spatial-desk-root")).toHaveCount(0);

    await expect(page.getByTestId("arwes-workbench-spatial-table")).toBeAttached({ timeout: 15_000 });
    const spatialTableParentTag = await page
      .getByTestId("arwes-workbench-spatial-table")
      .evaluate((element) => element.parentElement?.tagName);
    expect(spatialTableParentTag).toBe("A-SCENE");

    await page.waitForFunction(
      () => {
        const scene = document.querySelector("a-scene") as (HTMLElement & { hasLoaded?: boolean }) | null;
        const planes = Array.from(document.querySelectorAll('[data-testid^="arwes-workbench-spatial-table-"][data-testid$="-plane"]'));

        return Boolean(
          scene?.hasLoaded &&
            planes.length >= 3 &&
            planes.every((plane) => Boolean((plane as HTMLElement & { getObject3D?: (name: string) => unknown }).getObject3D?.("mesh")))
        );
      },
      undefined,
      { timeout: 30_000 }
    );

    await page.waitForFunction(() => {
      const base = document.querySelector("#arwes-workbench-spatial-table-base") as HTMLCanvasElement | null;
      const control = document.querySelector("#arwes-workbench-spatial-table-controls") as HTMLCanvasElement | null;
      const text = document.querySelector("#arwes-workbench-spatial-table-text") as HTMLCanvasElement | null;

      return Boolean(base?.width && control?.width && text?.width);
    });

    const paintStats = await page.evaluate(() => {
      function countPaintedPixels(id: string) {
        const canvas = document.getElementById(id) as HTMLCanvasElement | null;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          return 0;
        }

        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let painted = 0;

        for (let index = 3; index < data.length; index += 160) {
          if (data[index] > 0) {
            painted += 1;
          }
        }

        return painted;
      }

      return {
        base: countPaintedPixels("arwes-workbench-spatial-table-base"),
        controls: countPaintedPixels("arwes-workbench-spatial-table-controls"),
        text: countPaintedPixels("arwes-workbench-spatial-table-text")
      };
    });

    expect(paintStats.base).toBeGreaterThan(1000);
    expect(paintStats.controls).toBeGreaterThan(300);
    expect(paintStats.text).toBeGreaterThan(100);

    await page.waitForTimeout(500);
    const tableScreenshot = await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("player-v3-arwes-table.png")
    });
    const workbenchPixels = countWorkbenchPixels(tableScreenshot);
    expect(workbenchPixels.total).toBeGreaterThan(700);
    expect(workbenchPixels.magenta + workbenchPixels.orange).toBeGreaterThan(120);
  });
});
