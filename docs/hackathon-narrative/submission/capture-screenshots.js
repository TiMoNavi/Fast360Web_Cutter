const { chromium } = require('playwright');

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Login first
    console.log('Logging in...');
    await page.goto('http://127.0.0.1:3001');
    await page.waitForTimeout(2000);

    // Check if login is needed
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await page.fill('input[type="email"]', process.env.DEMO_EMAIL || 'demo@invisible.local');
      await page.fill('input[type="password"]', process.env.DEMO_PASSWORD || 'password123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    // Capture VR Editor (three-official-interactive-lab)
    console.log('Capturing VR editor...');
    await page.goto('http://127.0.0.1:3001/xr/three-official-interactive-lab');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'screenshots/vr/vr-editor-main.png',
      fullPage: false
    });

    // Capture PC Editor
    console.log('Capturing PC editor...');
    await page.goto('http://127.0.0.1:3001/xr/player');
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'screenshots/pc/pc-editor-main.png',
      fullPage: false
    });

    console.log('Screenshots captured successfully!');
  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots();
