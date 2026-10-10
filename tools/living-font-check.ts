// Glyph coverage of the bundled level-two fonts (run: npx tsx tools/living-font-check.ts).
// Collects every non-ASCII character that appears in a string/template literal of the level-two view
// sources (sign, poster, fascia and document canvases) and checks it against the cmap of each subset
// woff2 in public/assets/fonts. A missing glyph would fall back to a system font or render blank on a sign.
import {readFileSync, readdirSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';

const ROOT = new URL('..', import.meta.url);
/** Modules that paint text onto sign, poster, fascia or document canvases (plus the space names used on door plates). */
const SIGN_MODULES = ['signage', 'decals', 'dressing', 'clutter', 'shells', 'hero', 'wreck', 'props'];
const SOURCES = [
  ...readdirSync(new URL('src/pod/view/deepsea/', ROOT)).filter(f => SIGN_MODULES.some(k => f === `living-${k}.ts`)).map(f => `src/pod/view/deepsea/${f}`),
  'src/pod/content/living-deck-layout.ts',
];
/**
 * Which face draws which characters: Han/CJK punctuation go through LivingSans and the hand-note face,
 * symbols (arrows, middle dot, dashes) through LivingSans, Latin extras (Ø, ’) through the condensed face.
 */
const RULES: {font: string; test: (cp: number) => boolean}[] = [
  {font: 'NotoSansSC-Bold-living.woff2', test: cp => cp > 127 && !(cp >= 0xa0 && cp <= 0x24f && cp !== 0xb7) && cp !== 0x2019},
  {font: 'MaShanZheng-living.woff2', test: cp => (cp >= 0x2e80 && cp <= 0x9fff) || (cp >= 0xff00 && cp <= 0xffef)},
  {font: 'BarlowCondensed-SemiBold-living.woff2', test: cp => (cp >= 0xa0 && cp <= 0x24f) || cp === 0x2019},
];

/** Characters inside quotes/backticks; comments and regex literals skipped. */
export function literalChars(src: string) {
  const out = new Set<string>();
  let i = 0, prev = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};'.includes(prev))) {
      let j = i + 1, cls = false;
      for (; j < src.length && src[j] !== '\n'; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
      }
      i = j + 1; prev = ')'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    if (c === '\'' || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] === '\\') {
          const m = /^\\u([0-9a-fA-F]{4})/.exec(src.slice(j));
          if (m) { const ch = String.fromCharCode(parseInt(m[1], 16)); if (ch.charCodeAt(0) > 127) out.add(ch); j += 5; } else j++;
          continue;
        }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') { let d = 1; j += 2; while (j < src.length && d) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++; } j--; continue; }
        if (c !== '`' && src[j] === '\n') break;
        const cp = src.codePointAt(j)!;
        if (cp > 127) { out.add(String.fromCodePoint(cp)); if (cp > 0xffff) j++; }
      }
      i = j + 1; prev = 'x'; continue;
    }
    i++;
  }
  return out;
}

function base128(b: Buffer, o: {p: number}) {
  let v = 0;
  for (let k = 0; k < 5; k++) { const x = b[o.p++]; v = v * 128 + (x & 127); if (!(x & 128)) return v; }
  throw new Error('bad UIntBase128');
}
/** Unicode code points mapped by a woff2 font (cmap formats 4 and 12). */
export function woff2Cmap(file: Buffer): Set<number> {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not woff2');
  const numTables = file.readUInt16BE(12), compressed = file.readUInt32BE(20);
  const o = {p: 48}, tables: {tag: number; len: number}[] = [];
  for (let t = 0; t < numTables; t++) {
    const flags = file[o.p++], idx = flags & 63, version = flags >> 6;
    if (idx === 63) o.p += 4;
    const orig = base128(file, o);
    let len = orig;
    if (idx === 10 || idx === 11 ? version !== 3 : version !== 0) len = base128(file, o);
    tables.push({tag: idx, len});
  }
  const data = brotliDecompressSync(file.subarray(o.p, o.p + compressed));
  let off = 0, cmapAt = -1;
  for (const t of tables) { if (t.tag === 0) cmapAt = off; off += t.len; }
  if (cmapAt < 0) throw new Error('no cmap');
  const cm = data.subarray(cmapAt), n = cm.readUInt16BE(2), cps = new Set<number>();
  for (let r = 0; r < n; r++) {
    const sub = cm.subarray(cm.readUInt32BE(4 + r * 8 + 4)), fmt = sub.readUInt16BE(0);
    if (fmt === 4) {
      const seg = sub.readUInt16BE(6) / 2, ends = 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      for (let s = 0; s < seg; s++) {
        const end = sub.readUInt16BE(ends + s * 2), start = sub.readUInt16BE(starts + s * 2), delta = sub.readInt16BE(deltas + s * 2), ro = sub.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const g = ro ? sub.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2) : (c + delta) & 0xffff;
          if (g) cps.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = sub.readUInt32BE(12);
      for (let g = 0; g < groups; g++) { const a = sub.readUInt32BE(16 + g * 12), b = sub.readUInt32BE(20 + g * 12); for (let c = a; c <= b; c++) cps.add(c); }
    }
  }
  return cps;
}

export function checkLivingFonts() {
  const chars = new Set<string>();
  for (const f of SOURCES) for (const ch of literalChars(readFileSync(new URL(f, ROOT), 'utf8'))) chars.add(ch);
  const missing: Record<string, string> = {};
  for (const {font, test} of RULES) {
    const cps = woff2Cmap(readFileSync(new URL(`public/assets/fonts/${font}`, ROOT)));
    const miss = [...chars].filter(ch => test(ch.codePointAt(0)!) && !cps.has(ch.codePointAt(0)!)).sort().join('');
    if (miss) missing[font] = miss;
  }
  return {chars, missing};
}
export const LIVING_FONT_FILES = RULES.map(r => r.font);

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('living-font-check.ts')) {
  const {chars, missing} = checkLivingFonts();
  if (process.argv.includes('--chars')) console.log([...chars].sort().join(''));
  for (const [font, miss] of Object.entries(missing)) console.error(`FAIL ${font}: ${[...miss].length} glyphs missing: ${miss}`);
  console.log(Object.keys(missing).length ? 'FAIL living fonts' : `PASS living fonts: ${chars.size} non-ASCII sign characters covered by ${LIVING_FONT_FILES.join(', ')}`);
  process.exit(Object.keys(missing).length ? 1 : 0);
}
