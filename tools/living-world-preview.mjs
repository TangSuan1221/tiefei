// Captures level-two world viewpoints. Expects a running vite dev server:
//   npx vite --port 5191
//   node tools/living-world-preview.mjs [filter]
// Env: LIVING_OUT=qa/living/render-r1  LIVING_W=1280 LIVING_H=720  LIVING_EXTRA="&quality=medium"
//      LIVING_STATS=1 (log luma histogram per shot)  LIVING_PERF=1 (log GPU-synced frame time)
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = process.env.LIVING_OUT ?? 'qa/living/world';
const VW = Number(process.env.LIVING_W ?? 1024), VH = Number(process.env.LIVING_H ?? 720);
const EXTRA = `&w=${VW}&h=${VH}${process.env.LIVING_EXTRA ?? ''}${process.env.LIVING_STATS ? '&stats=1' : ''}${process.env.LIVING_PERF ? '&perf=1' : ''}`;
mkdirSync(OUT, {recursive: true});

/** name -> query string (pod eye at y≈0 unless noted). */
const SHOTS = {
  '01-shaft-S': 'cam=7,24,9&look=13,18,6&lamp=1',
  '02-corridor-C1': 'cam=17,0,7.5&look=40,-.6,7.5&recording=1',
  '03-solarium-C1': 'cam=27,0,8&look=27,-1.2,16&recording=1',
  '04-laundry-R1': 'cam=36,0,1&look=32,0,-16&recording=1&creature=lumen.r1',
  '05-workshop-R2': 'cam=53,0,15&look=58,-1.6,30&recording=1&creature=blind.r2',
  '06-security-R3': 'cam=72,0,-52&look=76,-1.2,-61.5&recording=1&creature=swarm.r3',
  '07-ballast-R4': 'cam=107,0,8&look=113,-.8,30&recording=1&creature=shade.r4',
  '08-glass-G': 'cam=132,0,6&look=146,-1.4,6&recording=1&alex=145.5,-2.1,6&pose=gesture&alexHeading=270',
  '09-pipe-intake-G': 'cam=137.5,0,17&look=142,-.2,17&recording=1',
  '10-valves-V': 'cam=130,0,-29&look=141.4,0,-29&recording=1',
  '11-atrium-wide': 'cam=128.5,1,48&look=165,-3,68&recording=1&creatures=home',
  '12-atrium-floor': 'cam=150,-6,50&look=175,-6,74&recording=1',
  '13-office-R5': 'cam=162,0,96&look=167,-2.2,104&recording=1',
  '14-placard-R5': 'cam=164,0,96&look=173.4,0,96&recording=1',
  '15-delroy-R5': 'cam=158,0,92&look=150.6,0,92&recording=1',
  '16-gate-F': 'cam=188,-1.2,52&look=188,-1.2,42.6&recording=1&alex=188,-2.1,39.5&pose=type',
  '17-shaft-D': 'cam=101,0,68&look=94,-12,68&recording=1',
  '18-probe-alex-glass': 'probe=alex-glass&recording=1&alex=145.5,-2.1,6&pose=film&alexHeading=90',
  '19-probe-pipe-bands': 'probe=pipe-bands&recording=1&slime=1&alex=none',
  '20-probe-slime-M-1': 'probe=slime-wall&recording=1&slime=1&alex=none',
  '21-probe-slime-M-0': 'probe=slime-floor&recording=1&slime=0&alex=none',
  '22-probe-cocoon': 'probe=cocoon&recording=1&slime=1&alex=none',
  '23-probe-gate-inner': 'probe=gate-inner&recording=1&alex=188,-2.1,39.5&pose=type&alexHeading=0',
  '24-probe-security': 'probe=security-console&recording=1&creature=swarm.r3',
  '25-creature-lumen': 'cam=128,0,6&look=124,3.2,-4&recording=1&creature=lumen.g@124,2.2,-2:drift',
  '26-creature-shade': 'cam=107,0,5&look=107,-1,14.5&recording=1&creature=shade.r4@107,-1,14.5:block&heading=90',
  '27-creature-shade-recoil': 'cam=109,0,16&look=117,-1.5,18&recording=1&creature=shade.r4@117,-1.5,18:recoil',
  '28-creature-blind': 'cam=122,0,-28&look=126,-1.6,-33&recording=1&creature=blind.v@127,-1.4,-33:hunt&heading=300',
  '29-creature-swarm-lamp': 'cam=40,0,7.5&look=44,0,7.5&recording=0&creature=swarm.c1@43,0,7.5:swarm',
  '30-live-corridor': 'cam=17,0,7.5&look=40,-.6,7.5&live=1&creature=swarm.c1@24,0,7.5:swarm',
};

// Ad-hoc mode: node tools/living-world-preview.mjs "?query" [name]  → qa/living/world/debug/<name>.png
const filter = process.argv[2];
if (filter?.startsWith('?')) {
  for (const k of Object.keys(SHOTS)) delete SHOTS[k];
  mkdirSync(`${OUT}/debug`, {recursive: true});
  SHOTS[`debug/${process.argv[3] ?? 'adhoc'}`] = filter.slice(1);
}
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const openPage = async () => {
  const p = await browser.newPage({viewport: {width: VW, height: VH}});
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  return p;
};
let page = await openPage();
for (const [name, query] of Object.entries(SHOTS)) {
  if (filter && !filter.startsWith('?') && !name.includes(filter)) continue;
  // Other agents edit living files concurrently; a Vite reload mid-capture is retried on a fresh page.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const t0 = Date.now();
    if (attempt > 1) {
      await page.close().catch(() => {});
      await new Promise(r => setTimeout(r, 4000 * attempt));
      page = await openPage();
    }
    try {
      await page.goto(`${BASE}?${query}&hud=0${EXTRA}`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
      await page.locator('canvas').screenshot({path: `${OUT}/${name}.png`});
      const info = await page.evaluate(() => ({stats: window.__stats, perf: window.__perf}));
      console.log(name, `${Date.now() - t0}ms`, info.stats ? JSON.stringify(info.stats) : '', info.perf ? JSON.stringify(info.perf) : '');
      break;
    } catch (e) { console.log(name, `attempt ${attempt} failed:`, String(e.message ?? e).split('\n')[0]); }
  }
}
await browser.close();
