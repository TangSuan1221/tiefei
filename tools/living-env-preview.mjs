// Environment-art preview for level two (materials / geometry / dressing / signage).
// Copy of living-world-preview.mjs with its own output folder so parallel agents don't collide.
//   npx vite --port 5191
//   node tools/living-env-preview.mjs [filter]          → qa/living/env-r1/
//   ENV_ROUND=r4/iter1 node tools/living-env-preview.mjs → qa/living/env-r4/iter1/
//   ENV_W=1920 ENV_H=1080 (default) — 1080p so sign/note text height can be measured.
//   ENV_PERF=1 also records frame time (median/p90 of 40 frames) for the atrium shots → _perf.json
// Every frame gets a 16×9 luma hash; frames closer than ENV_DUP (default 0.06 mean abs diff) to an
// earlier frame of the same run (mean abs diff of z-scored luma < ENV_DUP, default 0.18) are reported as
// duplicates and deleted (no repeated frames in review sets).
import {chromium} from '@playwright/test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = `qa/living/env-${process.env.ENV_ROUND ?? 'r1'}`;
const W = Number(process.env.ENV_W ?? 1920), H = Number(process.env.ENV_H ?? 1080);
const DUP = Number(process.env.ENV_DUP ?? .18);
const PERF = process.env.ENV_PERF === '1';
/** ENV_EXTRA='&foo=1' is appended to every shot URL (A/B toggles). */
const EXTRA = process.env.ENV_EXTRA ?? '';
mkdirSync(OUT, {recursive: true});

/** Each room: at least one near (n) and one mid (m) frame. */
const SHOTS = {
  '01-shaft-S': 'cam=7,24,9&look=13,18,6&lamp=1',
  '02-C1-mid': 'cam=17,0,7.5&look=40,-.6,7.5&recording=1',
  '02b-C1-near-wreck': 'cam=27,.5,6&look=33,-1.5,10.5&recording=1',
  '03-C2-mid': 'cam=72.5,0,-6&look=72.5,-.4,-38&recording=1',
  '04-C3-mid': 'cam=86,0,7.5&look=118,-.4,7.5&recording=1',
  '04b-C3-near-wreck': 'cam=95,.5,6&look=101,-1.5,10.5&recording=1',
  '05-R1-mid': 'cam=36,0,1&look=32,0,-16&recording=1',
  '05b-R1-near': 'cam=40,-.6,-6&look=44,-2.6,-14&recording=1',
  '06-R3-near': 'cam=72,0,-52&look=76,-1.2,-61.5&recording=1',
  '07-R3-mid': 'cam=72.5,0,-42&look=64,-1.5,-58&recording=1',
  '08-R4-mid': 'cam=107,0,8&look=113,-.8,30&recording=1',
  '09-R4-wide': 'cam=107,0,24&look=99,-1.5,32&recording=1',
  '10-V-near': 'cam=130,0,-29&look=141.4,0,-29&recording=1',
  '10b-V-mid': 'cam=131,1,-20&look=118,-2,-36&recording=1',
  '11-A-wide': 'cam=128.5,1,48&look=165,-3,68&recording=1',
  '12-A-floor': 'cam=150,-6,50&look=175,-6,74&recording=1',
  '12b-A-landmark': 'cam=142,-5,55&look=155,-5,62&recording=1',
  '12c-A-landmark-near': 'cam=148,-6.5,66&look=155,-6,62&recording=1',
  '13-R5-code': 'cam=162,0,96&look=167,-2.2,104&recording=1',
  '14-R5-placard': 'cam=164,0,96&look=173.4,0,96&recording=1',
  '15-R5-delroy': 'cam=158,0,92&look=150.6,0,92&recording=1',
  '15b-R5-wide': 'cam=162,1.5,88&look=160,-2,104&recording=1',
  '16-gate-F': 'cam=188,-1.2,52&look=188,-1.2,42.6&recording=1&alex=none',
  '17-shaft-D': 'cam=101,0,68&look=94,-12,68&recording=1',
  '17b-C7-mid': 'cam=113,0,68&look=100,-.5,68&recording=1',
  '18-R2-mid': 'cam=53,0,15&look=58,-1.6,30&recording=1',
  '18b-R2-near': 'cam=50,-.5,22&look=46,-2.4,30&recording=1',
  '19-G-mid': 'cam=124,0,0&look=140,-1,12&recording=1&alex=none',
  '19b-G-near': 'cam=128,0,13&look=122,-2.2,19&recording=1&alex=none',
  '20-R3-cctv-west': 'cam=76,0,-50&look=58.5,-1.5,-57&recording=1',
  '22-R5-bookcase': 'cam=165,0,100&look=156,-1.5,106&recording=1',
  '25-C5-mid': 'cam=128.5,0,24&look=128.5,-.5,42&recording=1',
  '26-C4-mid': 'cam=130.5,0,-9&look=130.5,-.4,-18&recording=1',
  '27-A-banner': 'cam=132,1,52&look=127.5,3,78&recording=1',
  // round-3 review framings (render-r5 names) for before/after pairs
  '28-C1-solarium': 'cam=27,0,8&look=27,-1.2,16&recording=1',
  '29-C1-east-end': 'cam=44,0,7.5&look=64,0,7.5&recording=1',
  '30-C2-end': 'cam=72.5,0,-12&look=72.5,-.4,-60&recording=1',
  '31-C3-long': 'cam=84,0,7.5&look=120,-.3,7.5&recording=1',
  '32-C5-south': 'cam=128.5,0,25&look=128.5,-.5,45&recording=1',
  '33-R5-wide': 'cam=172,0,90&look=152,-1,104&recording=1',
  '34-R1-laundry': 'cam=36,0,1&look=32,0,-16&recording=1',
  '35-R4-ballast': 'cam=107,0,24&look=99,-1.5,32&recording=1',
  '36-R3-security': 'cam=72,0,-52&look=76,-1.2,-61.5&recording=1',
};
/** Shots whose frame time is recorded with ENV_PERF=1. */
const PERF_SHOTS = new Set(['11-A-wide', '12-A-floor', '12b-A-landmark']);
/** ENV_GAIN>1 brightens the captured canvas (inspection copies only; not a lighting change). */
const GAIN = Number(process.env.ENV_GAIN ?? 1);

const filter = process.argv[2];
if (filter?.startsWith('?')) {
  for (const k of Object.keys(SHOTS)) delete SHOTS[k];
  mkdirSync(`${OUT}/debug`, {recursive: true});
  SHOTS[`debug/${process.argv[3] ?? 'adhoc'}`] = filter.slice(1);
}
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const queue = Object.entries(SHOTS).filter(([name]) => !filter || filter.startsWith('?') || filter.split(',').some(f => name.includes(f)));
const tries = new Map(), hashes = [], perf = {};
for (let qi = 0; qi < queue.length; qi++) {
  const [name, query] = queue[qi];
  tries.set(name, (tries.get(name) ?? 0) + 1);
  // Fresh page per shot: other agents' edits trigger Vite full reloads mid-capture.
  const page = await browser.newPage({viewport: {width: W, height: H}});
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message, (e.stack ?? '').split('\n').slice(1, 4).join(' | ')));
  try { await shoot(page, name, query); }
  catch (e) { console.log(name, 'FAILED', String(e).split('\n')[0]); if (tries.get(name) < 6) { queue.push([name, query]); await new Promise(r => setTimeout(r, 4000)); } }
  await page.close();
}
await browser.close();
if (PERF) writeFileSync(`${OUT}/_perf.json`, JSON.stringify(perf, null, 1));

async function shoot(page, name, query) {
  const t0 = Date.now(), perfOn = PERF && PERF_SHOTS.has(name);
  await page.goto(`${BASE}?${query}&hud=0&w=${W}&h=${H}${perfOn ? '&perf=1' : ''}${EXTRA}`, {waitUntil: 'load'});
  try { await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000}); }
  catch { console.log(name, 'TIMEOUT'); return; }
  if (GAIN !== 1) await page.addStyleTag({content: `canvas{filter:brightness(${GAIN})}`});
  const path = `${OUT}/${name}.png`;
  const png = await page.locator('canvas').screenshot({path});
  if (perfOn) perf[name] = await page.evaluate(() => window.__perf);
  // 16×9 luma thumbnail decoded in the page (no image library in node_modules).
  const hash = await page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = 16; c.height = 9; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 16, 9); const d = x.getImageData(0, 0, 16, 9).data, out = [];
    for (let i = 0; i < d.length; i += 4) out.push((d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722) / 255);
    // z-scored so dark frames compare by structure, not by their (tiny) absolute luma differences
    const mean = out.reduce((s, v) => s + v, 0) / out.length;
    const sd = Math.sqrt(out.reduce((s, v) => s + (v - mean) ** 2, 0) / out.length) || 1;
    return out.map(v => (v - mean) / sd);
  }, png.toString('base64'));
  let near = {name: '-', d: Infinity};
  for (const h of hashes) { const d = h.hash.reduce((s, v, i) => s + Math.abs(v - hash[i]), 0) / hash.length; if (d < near.d) near = {name: h.name, d}; }
  if (near.d < DUP) { rmSync(path); console.log(name, `DUPLICATE of ${near.name} (d=${near.d.toFixed(3)}) — removed`); return; }
  hashes.push({name, hash});
  console.log(name, `${Date.now() - t0}ms nearest ${near.name} d=${near.d.toFixed(3)}`, perfOn ? JSON.stringify(perf[name]) : '');
}
