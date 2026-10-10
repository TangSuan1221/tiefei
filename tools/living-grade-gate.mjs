// Exposure / grade gate for level-two film captures, same statistics as qa/review/round3/blind.py:
// centre crop to 16:9, area-resample to 960×540, black out the top-right and bottom-left 170×64 corners,
// Rec.709 luma, HSV saturation on pixels brighter than 0.04. (blind.py also re-encodes to JPEG q82; skipped here.)
//   node tools/living-grade-gate.mjs <dir|file.png>... [--json out.json] [--filter=c,d]
// Targets (round-3 review, items 3 and 14):
//   mean luma 0.08–0.20 · clipped (Y > 0.97) < 0.3 % · brightest 1 % (p99) ≥ 0.65 · saturation ≤ 0.44 (−15 % of 0.517)
// The set PASSes when its mean meets every target and no single frame is blown (clip ≥ 1 %) or washed out (mean > 0.25).
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {inflateSync} from 'node:zlib';

const TARGET = {meanMin: .08, meanMax: .2, clipMax: .003, p99Min: .65, satMax: .44};
const HARD = {clip: .01, mean: .25};
const W = 960, H = 540, MASKS = [[W - 170, 0, W, 64], [0, H - 64, 170, H]];

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw Error('not a PNG');
  let o = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0; const idat = []; let pal = null, trns = null;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; inter = d[12]; }
    else if (kind === 'PLTE') pal = d; else if (kind === 'tRNS') trns = d;
    else if (kind === 'IDAT') idat.push(d); else if (kind === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || inter) throw Error(`unsupported PNG (depth ${depth}, interlace ${inter})`);
  const ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[type]; const bpp = ch, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[prev + x] : 0, c = x >= bpp && y ? px[prev + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255;
    }
  }
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    let r, g, b;
    if (type === 3) { const k = px[i] * 3; r = pal[k]; g = pal[k + 1]; b = pal[k + 2]; void trns; }
    else if (ch < 3) r = g = b = px[i * bpp];
    else { r = px[i * bpp]; g = px[i * bpp + 1]; b = px[i * bpp + 2]; }
    rgb[i * 3] = r / 255; rgb[i * 3 + 1] = g / 255; rgb[i * 3 + 2] = b / 255;
  }
  return {w, h, rgb};
}

/** 16:9 centre crop + box-filter resample to W×H (area average, like a LANCZOS downscale minus ringing). */
function prep({w, h, rgb}) {
  let cx = 0, cy = 0, cw = w, chh = h;
  if (w / h > 16 / 9) { cw = Math.floor(h * 16 / 9); cx = Math.floor((w - cw) / 2); } else { chh = Math.floor(w * 9 / 16); cy = Math.floor((h - chh) / 2); }
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const y0 = cy + y * chh / H, y1 = cy + (y + 1) * chh / H;
    for (let x = 0; x < W; x++) {
      const x0 = cx + x * cw / W, x1 = cx + (x + 1) * cw / W;
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
        const k = (Math.min(h - 1, sy) * w + Math.min(w - 1, sx)) * 3; r += rgb[k]; g += rgb[k + 1]; b += rgb[k + 2]; n++;
      }
      const o = (y * W + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

function stats(a) {
  const ys = []; let sat = 0, satN = 0, sum = 0, dark = 0, clip = 0;
  const masked = (x, y) => MASKS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (masked(x, y)) continue;
    const o = (y * W + x) * 3, r = a[o], g = a[o + 1], b = a[o + 2];
    const Y = .2126 * r + .7152 * g + .0722 * b; ys.push(Y); sum += Y;
    if (Y < .06) dark++; if (Y > .97) clip++;
    if (Y > .04) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx > 1e-4 ? (mx - mn) / mx : 0; satN++; }
  }
  ys.sort((p, q) => p - q);
  const n = ys.length, pos = .99 * (n - 1), lo = Math.floor(pos);
  return {sat_mean: satN ? sat / satN : 0, luma_p99: ys[lo] + (ys[Math.min(n - 1, lo + 1)] - ys[lo]) * (pos - lo), luma_mean: sum / n, dark_ratio: dark / n, clip_ratio: clip / n};
}

const verdict = s => {
  const fails = [];
  if (s.luma_mean < TARGET.meanMin || s.luma_mean > TARGET.meanMax) fails.push('mean');
  if (s.clip_ratio >= TARGET.clipMax) fails.push('clip');
  if (s.luma_p99 < TARGET.p99Min) fails.push('p99');
  if (s.sat_mean > TARGET.satMax) fails.push('sat');
  return fails;
};

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const filt = args.find(a => a.startsWith('--filter='))?.slice(9).split(',');
const inputs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
if (!inputs.length) { console.log('usage: node tools/living-grade-gate.mjs <dir|file.png>... [--json out.json] [--filter=a,b]'); process.exit(2); }
const files = inputs.flatMap(p => statSync(p).isDirectory() ? readdirSync(p).filter(f => /\.png$/i.test(f)).sort().map(f => join(p, f)) : [p])
  .filter(f => !filt || filt.some(k => f.replace(/\\/g, '/').split('/').pop().includes(k)));
const rows = [];
for (const f of files) {
  try { const s = stats(prep(decodePng(readFileSync(f)))); rows.push({file: relative(process.cwd(), f).replace(/\\/g, '/'), ...s}); }
  catch (e) { console.log('SKIP', f, e.message); }
}
if (!rows.length) { console.log('no PNG frames'); process.exit(2); }
const keys = ['sat_mean', 'luma_p99', 'luma_mean', 'dark_ratio', 'clip_ratio'];
const mean = Object.fromEntries(keys.map(k => [k, rows.reduce((a, r) => a + r[k], 0) / rows.length]));
const pct = v => `${(v * 100).toFixed(2)}%`;
const line = (name, s, tag) => `${tag.padEnd(5)} ${name.padEnd(34)} mean ${s.luma_mean.toFixed(3)}  p99 ${s.luma_p99.toFixed(3)}  sat ${s.sat_mean.toFixed(3)}  dark ${pct(s.dark_ratio).padStart(7)}  clip ${pct(s.clip_ratio).padStart(6)}`;
let hard = 0;
for (const r of rows) {
  const f = verdict(r), blown = r.clip_ratio >= HARD.clip || r.luma_mean > HARD.mean; if (blown) hard++;
  console.log(line(r.file.split('/').pop().replace(/\.png$/i, ''), r, blown ? 'HARD' : f.length ? 'warn' : 'ok') + (f.length ? `  [${f.join(',')}]` : ''));
}
const setFails = verdict(mean);
console.log('-'.repeat(118));
console.log(line(`SET (${rows.length} frames)`, mean, setFails.length || hard ? 'FAIL' : 'PASS') + (setFails.length ? `  [${setFails.join(',')}]` : '') + (hard ? `  hard=${hard}` : ''));
console.log(`targets: mean ${TARGET.meanMin}-${TARGET.meanMax}, clip < ${pct(TARGET.clipMax)}, p99 >= ${TARGET.p99Min}, sat <= ${TARGET.satMax}; hard per frame: clip >= ${pct(HARD.clip)} or mean > ${HARD.mean}`);
console.log(`round-3 reference: ours mean .257 p99 .639 sat .517 dark 23.9% clip 1.03% | AAA/AA ref mean .172 p99 .680 sat .434 dark 29.6% clip .12%`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({targets: TARGET, hard: HARD, mean, pass: !setFails.length && !hard, items: rows}, null, 1));
process.exit(setFails.length || hard ? 1 : 0);
