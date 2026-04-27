import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5176/");
  
  await page.waitForTimeout(1000);
  await page.fill("#nickname-input", "Agent");
  await page.click("button[type='submit']");
  await page.waitForTimeout(2000);
  
  const debugInfo = await page.evaluate(() => {
    // We exposed __TADEO_MODEL earlier.
    // Wait, the clips are in characterAnimationClips Map? It's not exposed.
    // Let's modify main.ts slightly or just search window for clips.
    // Actually, __TADEO_MODEL might have animations? No, gltf.scene doesn't store animations natively unless we attach them.
    // Wait, we can just use fs in a node script to load the GLB using three.js or gltf-pipeline?
    // It's easier to just expose playerAnimationClips to window in main.ts.
    return window.__TADEO_CLIPS?.map(c => c.name);
  });
  console.log(JSON.stringify(debugInfo, null, 2));
  
  await browser.close();
})();
