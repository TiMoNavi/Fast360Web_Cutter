const { chromium } = require('playwright');

async function captureExportFlow() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // 1. Capture login page
    console.log('Capturing login page...');
    await page.goto('http://127.0.0.1:3001');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'presentation/assets/images/flow-1-login.png',
      fullPage: false
    });

    // 2. Login
    console.log('Logging in...');
    const emailInput = await page.$('input[type="email"]');
    if (emailInput) {
      await page.fill('input[type="email"]', process.env.DEMO_EMAIL || 'demo@invisible.local');
      await page.fill('input[type="password"]', process.env.DEMO_PASSWORD || 'password123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    // 3. Capture export/collection page
    console.log('Capturing export page...');
    await page.goto('http://127.0.0.1:3001/');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'presentation/assets/images/flow-2-export.png',
      fullPage: false
    });

    console.log('Screenshots captured!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

captureExportFlow();
