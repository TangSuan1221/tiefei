// Render-pipeline captures for level two (grade / medium / practical pools / snow / bloom / lens).
// Same viewpoints as tools/living-light-preview.mjs (the round-2 blind review set), own output folder.
//   npx vite --port 5191
//   RENDER_ROUND=r1 node tools/living-render-preview.mjs [filter]   → qa/living/render-r4/r1/
//   python qa/living/render-r4/stats.py qa/living/render-r4/r1      → round-2 review metrics
// Env: RENDER_W/RENDER_H (default 1920×1080), RENDER_PERF=1 (GPU-synced timing, quality=high), RENDER_EXTRA="&live=1"
import {chromium} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = process.env.RENDER_OUT ?? `qa/living/render-r4/${process.env.RENDER_ROUND ?? 'r1'}`;
const W = Number(process.env.RENDER_W ?? 1920), H = Number(process.env.RENDER_H ?? 1080);
const EXTRA = `${process.env.RENDER_EXTRA ?? ''}${process.env.RENDER_PERF ? '&perf=1&quality=high' : ''}`;
mkdirSync(OUT, {recursive: true});

const SHOTS = {
  '01-shaft-S': 'cam=7,24,9&look=13,18,6&lamp=1',
  '02-corridor-C1': 'cam=17,0,7.5&look=40,-.6,7.5&recording=1',
  '03-solarium-C1': 'cam=27,0,8&look=27,-1.2,16&recording=1',
  '04-C1-east-end': 'cam=44,0,7.5&look=64,0,7.5&recording=1',
  '05-C2-end': 'cam=72.5,0,-12&look=72.5,-.4,-60&recording=1',
  '06-C3-east-end': 'cam=92,0,7.5&look=120,-.3,7.5&recording=1',
  '07-security-R3': 'cam=72,0,-52&look=76,-1.2,-61.5&recording=1',
  '08-ballast-R4': 'cam=107,0,24&look=99,-1.5,32&recording=1',
  '09-C4-V': 'cam=130.5,0,-4&look=130,-.5,-40&recording=1',
  '10-C5-south': 'cam=128.5,0,25&look=128.5,-.5,45&recording=1',
  '11-atrium-wide': 'cam=128.5,1,48&look=165,-3,68&recording=1',
  '12-atrium-floor': 'cam=150,-6,50&look=175,-6,74&recording=1',
  '13-atrium-east': 'cam=176,-1,60&look=130,-2,66&recording=1',
  '14-office-R5': 'cam=162,0,96&look=167,-2.2,104&recording=1',
  '15-R5-wide': 'cam=172,0,90&look=152,-1,104&recording=1',
  '16-C7-D': 'cam=125,-1,68&look=94,-1,68&recording=1',
  '17-laundry-R1': 'cam=36,0,1&look=32,0,-16&recording=1',
  '18-live-corridor': 'cam=17,0,7.5&look=40,-.6,7.5&live=1',
  '19-live-atrium': 'cam=128.5,1,48&look=165,-3,68&live=1',
  '20-atrium-north-shops': 'cam=150,-2,68&look=160,-5,42&recording=1',
  '21-atrium-to-C7': 'cam=150,-1,64&look=110,-2,68&recording=1',
  '22-atrium-to-R5': 'cam=145,-1,58&look=162,-2,82&recording=1',
  '23-probe-cocoon': 'probe=cocoon&recording=1&lamp=0',
  '24-probe-slime-wall': 'probe=slime-wall&recording=1&lamp=0',
  '25-C3-long': 'cam=84,0,7.5&look=120,-.3,7.5&recording=1',
};
/** Iteration subset (every review category that this pass owns). RENDER_SET=all for the full list. */
const CORE = ['02', '03', '07', '08', '11', '12', '14', '16', '17', '18', '19', '23', '24', '25'];

const filter = process.argv[2];
if (filter?.startsWith('?')) { for (const k of Object.keys(SHOTS)) delete SHOTS[k]; SHOTS[process.argv[3] ?? 'adhoc'] = filter.slice(1); }
const pick = name => filter && !filter.startsWith('?') ? filter.split(',').some(f => name.includes(f))
  : filter?.startsWith('?') || process.env.RENDER_SET === 'all' || CORE.some(c => name.startsWith(c));
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const results = {};
let page;
const open = async () => {
  page = await browser.newPage({viewport: {width: W, height: H}});
  page.on('console', m => { if (m.type() === 'error' || /^\[(programs|living-|pick)/.test(m.text())) console.log(`[${m.type()}]`, m.text().slice(0, 600)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
};
await open();
for (const [name, query] of Object.entries(SHOTS)) {
  if (!pick(name)) continue;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (attempt > 1) { await page.close().catch(() => {}); await new Promise(r => setTimeout(r, 5000 * attempt)); await open(); }
      await page.goto(`${BASE}?${query}&hud=0&w=${W}&h=${H}&stats=1${EXTRA}`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
      await page.locator('canvas').screenshot({path: `${OUT}/${name}.png`});
      const info = await page.evaluate(() => ({stats: window.__stats, perf: window.__perf}));
      if (!info.stats) throw new Error('no __stats (blank frame)');
      // A full-black capture (first shot on a cold Vite server: dep re-optimise reload / context loss) is retried.
      if (!(info.stats.mean > .005)) throw new Error(`black frame (mean ${info.stats.mean})`);
      results[name] = info;
      const s = info.stats ?? {}, o = s.outsideLamp ?? {};
      console.log(name.padEnd(22), `mean ${s.mean} p99 ${s.p99} out ${o.mean}/${o.p90}`, info.perf ? `| ${info.perf.median}ms p90 ${info.perf.p90} calls ${info.perf.calls}` : '');
      break;
    } catch (e) { console.log(name, `attempt ${attempt} failed:`, String(e.message ?? e).split('\n')[0]); }
  }
}
writeFileSync(`${OUT}/_results${process.env.RENDER_PERF ? '-perf' : ''}.json`, JSON.stringify(results, null, 1));
await browser.close();
