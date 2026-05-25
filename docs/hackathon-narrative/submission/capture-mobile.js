const { chromium } = require('playwright');

async function captureMobileScreenshot() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to mobile page...');
    await page.goto('http://127.0.0.1:3001/mobile/videos/video_7d7b46aa833c44f2a2ac3d396b5c9dac');
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: 'presentation/assets/images/mobile-export.png',
      fullPage: false
    });

    console.log('Mobile screenshot captured!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

captureMobileScreenshot();
