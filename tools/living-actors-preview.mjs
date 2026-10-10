// Captures level-two actor viewpoints (cocoon corpse, slime, creatures, Elias/Alex diver).
// Expects a running vite dev server:  npx vite --port 5191
//   node tools/living-actors-preview.mjs [filter]        (LIVING_ACTORS_OUT=qa/living/actors-r2 to change the folder)
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const BASE = process.env.LIVING_PREVIEW_URL ?? 'http://127.0.0.1:5191/living-preview.html';
const OUT = process.env.LIVING_ACTORS_OUT ?? 'qa/living/actors-r1';
mkdirSync(OUT, {recursive: true});

const SHOTS = {
  // cocoon (probe framing used by the story camera + two closer looks)
  'c1-cocoon-probe': 'probe=cocoon&recording=1&slime=1&alex=none',
  'c2-cocoon-close': 'cam=168.1,-2.05,-12.4&look=170.1,-2.65,-14&fov=50&recording=1&slime=1&alex=none',
  'c3-cocoon-side': 'cam=172.3,-1.7,-11.6&look=170,-2.6,-14&fov=55&recording=1&slime=1&alex=none',
  // slime=0: same cocoon framing without the slime-zone volumetric thickening, to judge the actor itself
  'c4-cocoon-close-clear': 'cam=168.1,-2.05,-12.4&look=170.1,-2.65,-14&fov=50&recording=1&slime=0&alex=none',
  'c5-cocoon-side-clear': 'cam=172.3,-1.7,-11.6&look=170,-2.6,-14&fov=55&recording=1&slime=0&alex=none',
  // slime
  's1-slime-wall': 'probe=slime-wall&recording=1&slime=1&alex=none',
  's2-slime-floor': 'probe=slime-floor&recording=1&slime=1&alex=none',
  's3-slime-floor-0': 'probe=slime-floor&recording=1&slime=0&alex=none',
  's4-slime-pipe': 'cam=172.6,-1.0,-18.5&look=175.4,-.6,-14.5&fov=55&recording=1&slime=1&alex=none',
  // creatures (only visible in recordings; rule unchanged)
  'k1-lumen': 'cam=128,0,6&look=124,3.2,-4&recording=1&creature=lumen.g@124,2.2,-2:drift',
  'k2-lumen-close': 'cam=126.2,2.4,1.2&look=124,2.1,-2&fov=55&recording=1&creature=lumen.g@124,2.2,-2:drift',
  'k3-shade': 'cam=107,0,5&look=107,-1,14.5&recording=1&creature=shade.r4@107,-1,14.5:block&heading=90',
  'k4-shade-close': 'cam=104.6,-.4,11.6&look=107,-1,14.5&fov=55&recording=1&creature=shade.r4@107,-1,14.5:block&heading=90',
  'k5-blind': 'cam=122,0,-28&look=126,-1.6,-33&recording=1&creature=blind.v@127,-1.4,-33:hunt&heading=300',
  'k6-blind-close': 'cam=124.6,-1.0,-30.6&look=127,-1.4,-33&fov=55&recording=1&creature=blind.v@127,-1.4,-33:hunt&heading=300',
  // sculpted creature GLB clips (living-creature-*.glb): cling ? reach, recoil ? curl, sleep, mid-distance silhouette
  'g1-lumen-reach': 'cam=124.6,2.3,1.4&look=124,1.9,-2&fov=50&recording=1&creature=lumen.g@124,2.2,-2:cling',
  'g2-shade-curl': 'cam=104.6,-.4,11.6&look=107,-1,14.5&fov=55&recording=1&creature=shade.r4@107,-1,14.5:recoil&heading=90',
  'g3-blind-sleep': 'cam=123.6,-.6,-29.8&look=127,-1.4,-33&fov=50&recording=1&creature=blind.v@127,-1.4,-33:sleep&heading=200',
  'g4-shade-gape': 'cam=105.2,-.7,12&look=107,-1,14.5&fov=50&recording=1&creature=shade.r4@107,-1,14.5:idle&heading=200',
  'k7-swarm': 'cam=40,0,7.5&look=44,0,7.5&recording=0&creature=swarm.c1@43,0,7.5:swarm',
  'k8-swarm-close': 'cam=41.6,0,7.5&look=43,0,7.5&fov=50&recording=0&creature=swarm.c1@43,0,7.5:swarm',
  // Elias (code: alex)
  'a1-alex-glass': 'probe=alex-glass&recording=1&alex=145.5,-2.1,6&pose=film&alexHeading=90',
  'a2-alex-gesture': 'cam=143.2,-1.5,7.2&look=145.5,-1.9,6&fov=55&recording=1&alex=145.5,-2.1,6&pose=gesture&alexHeading=270',
  'a3-alex-idle': 'cam=143.4,-1.7,4.6&look=145.5,-2.0,6&fov=55&recording=1&alex=145.5,-2.1,6&pose=idle&alexHeading=250',
  'a4-alex-gate': 'probe=gate-inner&recording=1&alex=188,-2.1,39.5&pose=type&alexHeading=0',
  'a5-alex-swim': 'cam=142.5,-1.4,8&look=145.5,-2.0,6&fov=55&recording=1&alex=145.5,-2.0,6&pose=swim&alexHeading=200',
  'a6-security-guard': 'probe=security-console&recording=1&creature=swarm.r3',
  // Elias close-ups: as seen in the probe footage (glass side) and at the gate meeting (gate open, pod side)
  'a7-alex-probe-close': 'cam=146.9,-1.55,5.6&look=145.5,-1.75,6&fov=45&recording=1&alex=145.5,-2.1,6&pose=gesture&alexHeading=90',
  'a8-alex-meet-mid': 'cam=188,-1.3,47&look=187.2,-1.9,40.8&fov=50&recording=1&gate=1&alex=187.2,-1.9,40.8&pose=idle&alexHeading=180',
  'a9-alex-meet-close': 'cam=187.9,-1.55,43.4&look=187.2,-1.75,40.8&fov=45&recording=1&gate=1&alex=187.2,-1.9,40.8&pose=gesture&alexHeading=170',
  // corpses: close (<2 m, one-sided light) and mid shots
  'p1-security-diver-close': 'cam=74.1,-.45,-60.1&look=75.2,-.85,-61.5&fov=50&recording=1&slime=0&alex=none',
  'p1b-security-diver-pod': 'cam=74.6,-.2,-59.4&look=75.2,-.95,-61.5&fov=55&recording=0&slime=0&alex=none',
  'p2-security-diver-mid': 'cam=72.6,.1,-57.8&look=75.4,-1,-61.5&fov=55&recording=1&slime=0&alex=none',
  'p3-manager-close': 'cam=165.7,-1.65,105.9&look=167,-2.3,104.5&fov=50&recording=1&slime=0&alex=none',
  'p4-manager-mid': 'cam=164.4,-1,107.6&look=167,-2.4,104.3&fov=55&recording=1&slime=0&alex=none',
  // M slime: east (N side) and west (L side) walls, probe footage lighting
  's5-slime-wall-east': 'cam=172.4,-1.5,-9.5&look=175.6,-1.2,-13&fov=55&recording=1&slime=1&alex=none',
  's6-slime-wall-west': 'cam=167.5,-1.5,-11&look=164.3,-1.2,-14.5&fov=55&recording=1&slime=1&alex=none',
  's7-slime-wall-east-0': 'cam=172.4,-1.5,-9.5&look=175.6,-1.2,-13&fov=55&recording=1&slime=0&alex=none',
  's8-slime-corridor': 'cam=170,-1.4,-3&look=170,-1.8,-16&fov=60&recording=1&slime=1&alex=none',
  // Blender hero assets from pod viewpoints (parking poses, photo stations)
  'h01-glass-door': 'cam=134,.5,6&look=142,-.5,6&slime=0&alex=none',
  'h02-intake-park': 'cam=138.2,.3,17&look=141.4,0,17&fov=55&slime=0&alex=none',
  'h03-valves': 'cam=133.5,1,-29&look=141.4,0,-29&slime=0&alex=none',
  'h04-valve-feed-turned': 'cam=138.3,.2,-29&look=141.3,0,-29&fov=50&valves=feed&slime=0&alex=none',
  'h05-security-park': 'cam=76,0,-57.6&look=76,-1.3,-62&fov=60&slime=0&alex=none',
  'h06-security-wide': 'cam=70,1.5,-50&look=76,-1.5,-62&slime=0&alex=none',
  'h07-office-z1': {q: 'cam=162,0,96&look=167,-2.08,104&fov=64&slime=0&alex=none', w: 1920, h: 1080},
  'h08-office-z2': {q: 'cam=162,0,96&look=167,-2.08,104&fov=32&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  'h09-office-z25': {q: 'cam=162,0,96&look=167,-2.08,104&fov=25.6&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  'h10-office-z32': {q: 'cam=162,0,96&look=167,-2.08,104&fov=20&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  // legal photo poses for living.photo.code at 1? (fov 64): pod centre 3.1?3.4 m from the note, nose clear of the desk
  'h22-code-legal-31': {q: 'cam=167,-1.4,101&look=167,-2.08,104&fov=64&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  'h23-code-legal-34': {q: 'cam=167,-1,100.8&look=167,-2.08,104&fov=64&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  'h24-code-legal-oblique': {q: 'cam=165.4,-1.4,101.2&look=167,-2.08,104&fov=64&slime=0&alex=none', w: 1920, h: 1080, measure: true},
  'h11-guide': 'cam=166,0,96&look=173.4,0,96&slime=0&alex=none',
  'h12-delroy': 'cam=156,0,92&look=150.6,0,92&slime=0&alex=none',
  'x3-pick': 'cam=146,2,70&look=158,5.5,44&slime=0&alex=none&pick=.127,.4;.544,.44;.99,.39',
  'x5-pick': 'cam=156,0,92&look=150.6,0,92&slime=0&alex=none&pick=.5,.31;.47,.69;.47,.36;.53,.36',
  'x4-pick': 'cam=155,-1.5,58&look=155,.5,44&slime=0&alex=none&pick=.68,.05',
  'h13b-laundry-washers': 'cam=33.7,-.9,-18.8&look=33.7,-1.9,-23&fov=60&slime=0&alex=none',
  'h13c-laundry-shelf': 'cam=29,-.9,-17.6&look=29,-1.3,-20.4&fov=60&slime=0&alex=none',
  'h13-laundry-park': 'cam=29,0,-16.6&look=30.5,-1.2,-22&fov=60&slime=0&alex=none',
  'h14-laundry-wide': 'cam=40,1,-11&look=32,-1.5,-22&slime=0&alex=none',
  'h15-ballast-park': 'cam=111.6,.3,32.5&look=115.5,-.6,32.5&fov=60&slime=0&alex=none',
  'h16-ballast-wide': 'cam=106,1.5,24&look=115.5,-1,32&slime=0&alex=none',
  'h17-atrium-balcony': 'cam=155,-1.5,58&look=155,.5,44&slime=0&alex=none',
  'h18-atrium-upper': 'cam=146,2,70&look=158,5.5,44&slime=0&alex=none',
  'h19-gate': 'cam=188,-1.2,50&look=188,-1.2,42.4&slime=0&alex=none',
  'h20-gate-open': 'cam=188,-1.2,50&look=188,-1.2,42.4&gate=1&slime=0&alex=none',
  'h21-gate-uplink': 'cam=188,-1.2,45.2&look=188,-1.2,42.6&fov=50&slime=0&alex=none',
};

/**
 * Height in px of the tallest ink band around the frame centre (the code-note digits when the shot is
 * centred on the clipboard): paper = bright pixels, ink = pixels darker than 55% of the local paper level.
 */
function measureInk() {
  const src = document.querySelector('canvas'), W = src.width, H = src.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const R = Math.round(H * .3), x0 = Math.round(W / 2 - R), y0 = Math.round(H / 2 - R), S = 2 * R;
  const d = g.getImageData(x0, y0, S, S).data, L = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) L[i] = d[i * 4] * .2126 + d[i * 4 + 1] * .7152 + d[i * 4 + 2] * .0722;
  // paper: flood from the centre over pixels brighter than half the centre-window 90th percentile
  const win = []; for (let y = R - 20; y < R + 20; y++) for (let x = R - 20; x < R + 20; x++) win.push(L[y * S + x]);
  win.sort((a, b) => a - b); const paper = win[Math.floor(win.length * .9)];
  // paper box = bounding box of bright pixels connected to the centre through bright (or central ink) pixels
  const inPaper = new Uint8Array(S * S), stack = [R * S + R];
  const bright = v => v > paper * .7, ink = v => v < paper * .55;
  let minX = S, maxX = 0, minY = S, maxY = 0;
  while (stack.length) {
    const p = stack.pop(); if (inPaper[p]) continue; inPaper[p] = 1;
    const x = p % S, y = (p / S) | 0;
    if (bright(L[p])) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const q = ny * S + nx; if (!inPaper[q] && (bright(L[q]) || (ink(L[q]) && Math.abs(nx - R) < S * .2 && Math.abs(ny - R) < S * .2))) stack.push(q);
    }
  }
  // ink rows inside the paper bounding box (inset 3 px)
  const rows = [];
  for (let y = minY + 3; y <= maxY - 3; y++) { let n = 0; for (let x = minX + 3; x <= maxX - 3; x++) if (ink(L[y * S + x])) n++; rows.push(n); }
  const thr = Math.max(3, Math.max(...rows) * .12);
  let best = {h: 0, at: 0}, run = 0, gap = 0, start = 0;
  rows.forEach((n, i) => {
    if (n >= thr) { if (!run) start = i; run = i - start + 1; gap = 0; if (run > best.h) best = {h: run, at: start}; }
    else if (run && ++gap > 1) run = 0;
  });
  return {paperPx: {w: maxX - minX + 1, h: maxY - minY + 1}, paperLuma: Math.round(paper), digitBandPx: best.h, bandTop: best.at + minY + 3 + y0, rows: rows.length};
}

const filter = process.argv[2];
const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']});
const page = await browser.newPage({viewport: {width: 1024, height: 720}});
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('response', r => { if (r.status() >= 400) console.log(`[${r.status()}]`, r.url()); });
for (const [name, shot] of Object.entries(SHOTS)) {
  if (filter && !filter.split(',').some(f => name.includes(f))) continue;
  const {q: query, w = 1024, h = 720, measure = false} = typeof shot === 'string' ? {q: shot} : shot;
  await page.setViewportSize({width: w, height: h});
  // other agents edit living files concurrently; a Vite reload mid-capture is retried
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      await page.goto(`${BASE}?${query}&hud=0&w=${w}&h=${h}`, {waitUntil: 'load'});
      await page.waitForFunction(() => window.__ready === true, null, {timeout: 180000});
      await page.locator('canvas').screenshot({path: `${OUT}/${name}.png`});
      if (measure) {
        console.log(name, 'ink', JSON.stringify(await page.evaluate(measureInk)));
        const box = await page.locator('canvas').boundingBox();
        await page.screenshot({path: `${OUT}/${name}-crop.png`, clip: {x: box.x + w / 2 - 240, y: box.y + h / 2 - 240, width: 480, height: 480}});
      }
      console.log(name, `${Date.now() - t0}ms`);
      break;
    } catch (e) { console.log(name, `attempt ${attempt} failed:`, String(e.message ?? e).split('\n')[0]); }
  }
}
await browser.close();
