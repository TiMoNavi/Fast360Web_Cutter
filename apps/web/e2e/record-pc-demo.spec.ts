import { test, expect } from "@playwright/test";

/**
 * PC端演示自动化录制脚本
 *
 * 运行方法：
 * 1. 启动开发服务器：npm run dev
 * 2. 录制视频：npx playwright test record-pc-demo --headed --video=on
 * 3. 视频保存在：test-results/record-pc-demo-chrome/video.webm
 */

test("PC端演示录制", async ({ page }) => {
  // 设置视口大小（1920x1080用于演示）
  await page.setViewportSize({ width: 1920, height: 1080 });

  // TODO: 替换为实际的PC编辑器URL
  // 例如：await page.goto("/xr/pc-editor");
  await page.goto("/xr/three-official-interactive-lab");

  // 等待页面加载
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // TODO: 等待360视频加载
  // 可能需要点击"开始"按钮或等待特定元素

  // 演示1：鼠标点击运镜
  console.log("演示：鼠标点击运镜");
  await page.mouse.click(800, 400);
  await page.waitForTimeout(1000);

  await page.mouse.click(1200, 600);
  await page.waitForTimeout(1000);

  // 演示2：Ctrl + 拖动调整
  console.log("演示：Ctrl + 拖动");
  await page.keyboard.down("Control");
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(1100, 600, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.waitForTimeout(1000);

  // 演示3：直接拖动观察全景
  console.log("演示：拖动观察全景");
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(700, 540, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(1000);

  // 演示4：Tab特效菜单
  console.log("演示：Tab特效系统");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(800);

  // Tab + 1 (转场特效)
  await page.keyboard.press("1");
  await page.waitForTimeout(800);

  // 选择第一个特效
  await page.keyboard.press("1");
  await page.waitForTimeout(1500);

  // 再次演示 Tab + 2 (调色)
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  await page.keyboard.press("2");
  await page.waitForTimeout(800);
  await page.keyboard.press("3");
  await page.waitForTimeout(1500);

  // 演示5：Tab + 3 (速度特效)
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
  await page.keyboard.press("3");
  await page.waitForTimeout(800);
  await page.keyboard.press("1");
  await page.waitForTimeout(1500);

  // 最后停留几秒展示结果
  await page.waitForTimeout(3000);

  console.log("录制完成！");
});
