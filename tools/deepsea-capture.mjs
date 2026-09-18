import { chromium } from '@playwright/test';

// Real browser evidence. This script never starts the video-generation service.
const url = process.argv[2] ?? 'http://127.0.0.1:5173/tools/deepsea-browser-probe.html';
const output = process.argv[3] ?? 'qa/deepsea/procedural-baseline.png';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.deepseaProbe?.draw === 'function'
    || document.querySelector('#error')?.style.display === 'block', { }, { timeout: 60000 });
  // Optional fixed pose in Three coordinates: x y z yaw pitch.
  const pose = process.argv.slice(4).map(Number);
  if (pose.length) {
    if (pose.length !== 5 || pose.some(value => !Number.isFinite(value))) throw new Error('Pose requires x y z yaw pitch');
    await page.evaluate(values => {
      if (!window.deepseaProbe?.setPose) throw new Error('Preview pose control is unavailable');
      window.deepseaProbe.setPose(...values);
    }, pose);
  }
  const samples = await page.evaluate(async () => {
    const probe = window.deepseaProbe;
    if (!probe?.draw) return [];
    const result = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      result.push(probe.draw());
    }
    return result;
  });
  await page.screenshot({ path: output, fullPage: true });
  if (samples.length !== 12 || samples.some(sample => sample.ok !== true)) errors.push('Renderer did not return 12 successful draws');
  const stats = await page.evaluate(() => window.deepseaProbe?.stats ?? null);
  console.log(JSON.stringify({ url, screenshot: output, status: await page.locator('#status').innerText(), pose, stats, samples, errors }));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
