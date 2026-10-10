// Captures level-two creature viewpoints (lumen / shade / blind GLBs, swarm), including half-revealed shots
// (head in the lamp, body trailing into the dark) and far shots that switch to LOD1.
// Expects a running vite dev server:  npx vite --port 5191
//   node tools/living-creatures-preview.mjs [filter]      (LIVING_CREATURES_OUT=qa/living/creatures-r5 to change the folder)
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = process.env.LIVING_CREATURES_OUT ?? 'qa/living/creatures-r4';
mkdirSync(OUT, {recursive: true});

const LUMEN = 'creature=lumen.g@124,2.2,-2';
const SHADE = 'creature=shade.r4@107,-1,14.5';
const BLIND = 'creature=blind.v@127,-1.4,-33';
const SHOTS = {
  // same framings as tools/living-actors-preview.mjs (before/after comparison)
  'k1-lumen': `cam=128,0,6&look=124,3.2,-4&recording=1&${LUMEN}:drift`,
  'k2-lumen-close': `cam=126.2,2.4,1.2&look=124,2.1,-2&fov=55&recording=1&${LUMEN}:drift`,
  'k3-shade': `cam=107,0,5&look=107,-1,14.5&recording=1&${SHADE}:block&heading=90`,
  'k4-shade-close': `cam=104.6,-.4,11.6&look=107,-1,14.5&fov=55&recording=1&${SHADE}:block&heading=90`,
  'k5-blind': `cam=122,0,-28&look=126,-1.6,-33&recording=1&${BLIND}:hunt&heading=300`,
  'k6-blind-close': `cam=124.6,-1.0,-30.6&look=127,-1.4,-33&fov=55&recording=1&${BLIND}:hunt&heading=300`,
  'g1-lumen-reach': `cam=124.6,2.3,1.4&look=124,1.9,-2&fov=50&recording=1&${LUMEN}:cling`,
  'g2-shade-curl': `cam=104.6,-.4,11.6&look=107,-1,14.5&fov=55&recording=1&${SHADE}:recoil&heading=90`,
  'g3-blind-sleep': `cam=123.6,-.6,-29.8&look=127,-1.4,-33&fov=50&recording=1&${BLIND}:sleep&heading=200`,
  'g4-shade-gape': `cam=105.2,-.7,12&look=107,-1,14.5&fov=50&recording=1&${SHADE}:idle&heading=200`,
  // half-revealed: the lamp catches the head / a flank, the rest of the body runs off into the dark
  'r1-blind-half': `cam=125.4,-1.1,-31.2&look=126.6,-1.35,-32.4&fov=50&recording=1&${BLIND}:hunt&heading=135`,
  'r2-blind-edge': `cam=124.2,-.9,-30.4&look=125.6,-1.1,-31.6&fov=55&recording=1&${BLIND}:sleep&heading=20`,
  'r3-shade-half': `cam=105.6,-.6,12.2&look=106.6,-.9,13.6&fov=50&recording=1&${SHADE}:idle&heading=300`,
  'r4-shade-edge': `cam=106.2,-.5,11.4&look=105.4,-.9,13.4&fov=55&recording=1&${SHADE}:block&heading=90`,
  'r5-lumen-half': `cam=125.3,2.3,0.6&look=124.4,2.4,-1.4&fov=50&recording=1&${LUMEN}:drift`,
  'r6-lumen-edge': `cam=125.8,1.6,0.2&look=125.2,2.6,-2&fov=55&recording=1&${LUMEN}:cling`,
  // far: beyond the LOD switch distance (lumen 9 m, shade 12 m, blind 9 m)
  'f1-blind-far': `cam=118,0,-24&look=127,-1.4,-33&fov=40&recording=1&${BLIND}:hunt&heading=300`,
  'f2-shade-far': `cam=107,0,1&look=107,-1,14.5&fov=40&recording=1&${SHADE}:block&heading=90`,
  // swarm (visible without the recording rule; pod view)
  'k7-swarm': 'cam=40,0,7.5&look=44,0,7.5&recording=0&creature=swarm.c1@43,0,7.5:swarm',
  'k8-swarm-close': 'cam=41.6,0,7.5&look=43,0,7.5&fov=50&recording=0&creature=swarm.c1@43,0,7.5:swarm',
  'k9-swarm-wall': 'cam=40,-.5,6&look=44,.2,9&fov=60&recording=0&creature=swarm.c1@43,0,7.5:swarm',
};

const filter = process.argv[2];
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
async function freshPage() {
  const page = await browser.newPage({viewport: {width: 1024, height: 720}});
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('response', r => { if (r.status() >= 400) console.log(`[${r.status()}]`, r.url()); });
  return page;
}
for (const [name, query] of Object.entries(SHOTS)) {
  if (filter && !filter.split(',').some(f => name.includes(f))) continue;
  // other agents edit living files concurrently; a Vite reload mid-capture is retried on a fresh page
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    const page = await freshPage();
    try {
      await page.goto(`${BASE}?${query}&hud=0&w=1024&h=720`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
      await page.locator('canvas').screenshot({path: `${OUT}/${name}.png`});
      console.log(name, `${Date.now() - t0}ms`);
      break;
    } catch (e) { console.log(name, `attempt ${attempt} failed:`, String(e.message ?? e).split('\n')[0]); await new Promise(r => setTimeout(r, 4000)); }
    finally { await page.close(); }
  }
}
await browser.close();
