// Recording-profile captures for level two: what the film / probe footage shows (creatures, slime before/after,
// environment light sources). Every shot sets recording=1 (creatures resolve only on film) or probe=<shot>.
//   npx vite --port 5191
//   REC_ROUND=r1 node tools/living-rec-preview.mjs [filter]      → qa/living/rec-r6/r1/
//   node tools/living-grade-gate.mjs qa/living/rec-r6/r1
// Env: REC_W/REC_H (default 1280×720, 16:9 so the gate does not crop), REC_OUT (folder), REC_EXTRA (appended query).
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = process.env.REC_OUT ?? `qa/living/rec-r6/${process.env.REC_ROUND ?? 'r1'}`;
const W = Number(process.env.REC_W ?? 1280), H = Number(process.env.REC_H ?? 720);
const EXTRA = process.env.REC_EXTRA ?? '';
mkdirSync(OUT, {recursive: true});

const LUMEN = 'creature=lumen.g@124,2.2,-2';
const SHADE = 'creature=shade.r4@107,-1,14.5';
const BLIND = 'creature=blind.v@127,-1.4,-33';
const SHOTS = {
  // environment on film (light sources, floor hot spots, colour)
  'e02-corridor-C1': 'cam=17,0,7.5&look=40,-.6,7.5&recording=1',
  'e07-security-R3': 'cam=72,0,-52&look=76,-1.2,-61.5&recording=1',
  'e10-C5-south': 'cam=128.5,0,25&look=128.5,-.5,45&recording=1',
  'e11-atrium-wide': 'cam=128.5,1,48&look=165,-3,68&recording=1',
  'e12-atrium-floor': 'cam=150,-6,50&look=175,-6,74&recording=1',
  'e13-atrium-east': 'cam=176,-1,60&look=130,-2,66&recording=1',
  'e14-office-R5': 'cam=162,0,96&look=167,-2.2,104&recording=1',
  'e20-atrium-north-shops': 'cam=150,-2,68&look=160,-5,42&recording=1',
  // people / helmet lamps (self-emission caps)
  'h-a9-alex-meet-close': 'cam=187.9,-1.55,43.4&look=187.2,-1.75,40.8&fov=45&recording=1&gate=1&alex=187.2,-1.9,40.8&pose=gesture&alexHeading=170',
  'h-p1-security-diver-close': 'cam=74.1,-.45,-60.1&look=75.2,-.85,-61.5&fov=50&recording=1&slime=0&alex=none',
  // slime: the game starts at .75; a cleared feed is .05 (living-deck-site tape override)
  's1-probe-slime-wall-on': 'probe=slime-wall&recording=1&lamp=0&slime=.75&alex=none',
  's1-probe-slime-wall-off': 'probe=slime-wall&recording=1&lamp=0&slime=.05&alex=none',
  's2-slime-corridor-on': 'cam=170,-1.4,-3&look=170,-1.8,-16&fov=60&recording=1&slime=.75&alex=none',
  's2-slime-corridor-off': 'cam=170,-1.4,-3&look=170,-1.8,-16&fov=60&recording=1&slime=.05&alex=none',
  's3-slime-wall-east-on': 'cam=172.4,-1.5,-9.5&look=175.6,-1.2,-13&fov=55&recording=1&slime=.75&alex=none',
  's3-slime-wall-east-off': 'cam=172.4,-1.5,-9.5&look=175.6,-1.2,-13&fov=55&recording=1&slime=.05&alex=none',
  's4-probe-slime-floor-on': 'probe=slime-floor&recording=1&lamp=0&slime=.75&alex=none',
  's4-probe-slime-floor-off': 'probe=slime-floor&recording=1&lamp=0&slime=.05&alex=none',
  // living-deck-site's own probe framings (pipe bands + the gel sleeve on the yellow pipe)
  's6-site-slime-wall-on': 'probe=slime-wall&cam=174.1,-.75,-10.2&look=175.4,-.2,-15.2&recording=1&lamp=0&slime=.75&alex=none',
  's6-site-slime-wall-off': 'probe=slime-wall&cam=174.1,-.75,-10.2&look=175.4,-.2,-15.2&recording=1&lamp=0&slime=.05&alex=none',
  's7-site-pipe-bands': 'probe=pipe-bands&cam=173.5,-.15,-9&look=175.45,-.25,-15&recording=1&lamp=0&slime=.75&alex=none',
  's5-probe-cocoon': 'probe=cocoon&recording=1&lamp=0&slime=.75&alex=none',
  // creatures on film
  'c1-lumen-close': `cam=126.2,2.4,1.2&look=124,2.1,-2&fov=55&recording=1&${LUMEN}:drift`,
  'c2-lumen-half': `cam=125.3,2.3,0.6&look=124.4,2.4,-1.4&fov=50&recording=1&${LUMEN}:drift`,
  'c3-lumen-mid': `cam=128,0,6&look=124,3.2,-4&recording=1&${LUMEN}:cling`,
  'c4-shade-close': `cam=104.6,-.4,11.6&look=107,-1,14.5&fov=55&recording=1&${SHADE}:block&heading=90`,
  'c5-shade-half': `cam=105.6,-.6,12.2&look=106.6,-.9,13.6&fov=50&recording=1&${SHADE}:idle&heading=300`,
  'c6-shade-gape': `cam=105.2,-.7,12&look=107,-1,14.5&fov=50&recording=1&${SHADE}:idle&heading=200`,
  // (the round-3 f2 framing sat behind the R4 bulkhead with the lamp on the wall; this one is inside R4, 16 m off)
  'c7-shade-far': `cam=113,0,30&look=107,-1,14.5&fov=40&recording=1&${SHADE}:block&heading=90`,
  // headlamp near-field: R4 north bulkhead (z = 12) at 1.0 m and 0.6 m (the old cam=107,0,1 sat inside the wall)
  'c7b-lamp-1m-wall': 'cam=100,-.5,13&look=100,-.6,5&fov=55&recording=1',
  'c7c-lamp-06m-wall': 'cam=103,-.8,12.6&look=103,-.9,5&fov=55&recording=1',
  'c8-blind-half': `cam=125.4,-1.1,-31.2&look=126.6,-1.35,-32.4&fov=50&recording=1&${BLIND}:hunt&heading=135`,
  'c9-blind-close': `cam=124.6,-1.0,-30.6&look=127,-1.4,-33&fov=55&recording=1&${BLIND}:hunt&heading=300`,
  'd1-swarm': 'cam=40,0,7.5&look=44,0,7.5&recording=1&creature=swarm.c1@43,0,7.5:swarm',
  'd2-swarm-close': 'cam=41.6,0,7.5&look=43,0,7.5&fov=50&recording=1&creature=swarm.c1@43,0,7.5:swarm',
  'd3-swarm-wall': 'cam=40,-.5,6&look=44,.2,9&fov=60&recording=1&creature=swarm.c1@43,0,7.5:idle',
};

const filter = process.argv[2];
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
{
  // warm-up: the first load after a source edit compiles the module graph and can screenshot a blank canvas
  const page = await browser.newPage({viewport: {width: 320, height: 180}});
  try { await page.goto(`${BASE}?w=320&h=180&hud=0`, {waitUntil: 'load'}); await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000}); } catch { /* the shots retry */ }
  await page.close();
}
for (const [name, query] of Object.entries(SHOTS)) {
  if (filter && !filter.split(',').some(f => name.includes(f))) continue;
  // other agents edit living files concurrently; a Vite reload mid-capture is retried on a fresh page
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    const page = await browser.newPage({viewport: {width: W, height: H}});
    let meter = '';
    page.on('console', m => { if (m.text().startsWith('[living-meter]')) meter = m.text().slice(15); else if (m.type() === 'error' && !m.text().includes('404')) console.log('[error]', m.text().slice(0, 300)); });
    page.on('pageerror', e => console.log('[pageerror]', e.message));
    try {
      await page.goto(`${BASE}?${query}&hud=0&w=${W}&h=${H}&t=12&meter=1${EXTRA}`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
      await page.waitForTimeout(150);
      const png = await page.locator('canvas').screenshot({path: `${OUT}/${name}.png`});
      // an all-black canvas (lost first frame after a module reload) compresses to a few KB
      if (png.length < 20000 && attempt < 3) throw new Error(`blank frame (${png.length} B)`);
      console.log(name, `${Date.now() - t0}ms`, meter && `meter ${meter}`);
      break;
    } catch (e) { console.log(name, `attempt ${attempt} failed:`, String(e.message ?? e).split('\n')[0]); await new Promise(r => setTimeout(r, 4000)); }
    finally { await page.close(); }
  }
}
await browser.close();
