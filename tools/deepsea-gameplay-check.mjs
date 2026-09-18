import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Real DOM keyboard + WebGL test. Fixture affects only this isolated browser context.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /开始下潜/ }).click();
  await page.waitForFunction(() => window.__pod);
  await page.keyboard.press('4');
  await page.waitForFunction(() => window.__pod.at === 'camera' && window.__pod.zoom > .995);
  for (let i = 0; i < 7; i++) await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__pod.phase === 'site');
  assert.equal(await page.evaluate(() => window.__pod.volume.identified), false);
  await page.keyboard.press('3');
  await page.screenshot({ path: 'qa/deepsea/camera-driving-live.png' });
  const initial = await page.evaluate(() => {
    const r = window.__pod;
    const v = r.volume;
    const node = v.nodes.find(n => n.id === r.volumeAt);
    // A deterministic clear area + one crate lets the test validate real input,
    // retrieval timing and frame progression without a lucky generated layout.
    v.nodes = [{ ...node, size: { x: 20, y: 20, z: 20 }, obstacles: [
      { id: 'browser-cargo', kind: 'crate', pos: { x: 0, y: 4, z: 0 }, size: { x: 2, y: 2, z: 2 } },
    ] }];
    v.edges = []; v.locks = []; v.hazards = []; v.fauna = [];
    r.threat = null; r.mode = 'calm'; r.rng.next = () => .99;
    r.cabinPos = { x: 0, y: 0, z: 0 };
    r.heading = r.pitch = r.camPan = r.camTilt = 0;
    r.lamp = true; r.power = .9;
    r.containers.clear(); r.containerItems.clear();
    r.containers.set('browser-cargo', {
      obstacleId: 'browser-cargo', nodeId: node.id, kind: 'supply', seal: 'bone',
      searched: 0, passes: 2, opened: false, exhausted: false,
      loot: [[['sup.tape', 1]], [['sup.flare', 1]]], noise: 0, cost: 0, risk: 0,
    });
    return { tape: r.count('sup.tape'), flare: r.count('sup.flare') };
  });
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__pod.cabinPos.y), .75);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__pod.arm.phase === 'aiming');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__pod.cabinPos.y), .75);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__pod.boxItems.length === 2);
  await page.keyboard.press(']');
  const selected = await page.evaluate(() => window.__pod.selectedBoxItem);
  assert.ok(['sup.tape', 'sup.flare'].includes(selected));
  const before = await page.evaluate(id => window.__pod.count(id), selected);
  await page.screenshot({ path: 'qa/deepsea/camera-retrieval-selection.png' });
  await page.keyboard.press('c');
  assert.equal(await page.evaluate(id => window.__pod.count(id), selected), before);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__pod.cabinPos.y), .75);
  await page.waitForFunction(() => window.__pod.arm.phase === 'stowed');
  assert.equal(await page.evaluate(id => window.__pod.count(id), selected), before + 1);
  await page.keyboard.press('n');
  assert.equal(await page.evaluate(() => window.__pod.cabinPos.y), 0);
  await page.evaluate(() => { window.__pod.shot.viewing = true; });
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__pod.cabinPos.y), 0);
  await page.evaluate(() => { window.__pod.shot.viewing = false; });
  await page.screenshot({ path: 'qa/deepsea/camera-retrieval-complete.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, initial, selected, checks: ['real transit keyboard', 'unidentified room', 'same-screen 0.75m drive', 'arm blocks motion', 'select item', 'inventory only after retraction', 'reverse after retrieval', 'replay blocks motion'], errors }));
} finally { await browser.close(); }
