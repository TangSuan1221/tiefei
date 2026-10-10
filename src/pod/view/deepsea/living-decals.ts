import * as T from 'three';
import {LIVING_ITEMS, LIVING_MAIN_ROUTE, LIVING_PHOTO_STATIONS, LIVING_SPAWN} from '../../content/living-deck-layout';
import {Batcher, rng, type V3} from './living-build';
import {withStaticLights} from './living-materials';
import {LIVING_FONT, onLivingFonts} from './living-signage';

// ================================================================== decal atlas

export type DecalKind = 'rust' | 'leak' | 'stain' | 'grime' | 'puddle' | 'silt' | 'scrape' | 'tide'
  | 'posterCalm' | 'posterSafety' | 'posterSchedule' | 'photo' | 'memo' | 'map' | 'drawing'
  | 'scratch' | 'slime' | 'slimeDrip' | 'mould';

const SIZE = 2048;
/** Atlas rectangles in pixels [x, y, w, h]. Wet kinds use the glossy material. */
const RECT: Record<DecalKind, [number, number, number, number]> = {
  rust: [0, 0, 256, 1024], leak: [256, 0, 256, 1024], stain: [512, 0, 512, 512], grime: [1024, 0, 512, 512],
  puddle: [1536, 0, 512, 512], silt: [512, 512, 512, 512], scrape: [1024, 512, 512, 256], tide: [1024, 768, 1024, 128],
  posterCalm: [1536, 512, 256, 256], posterSafety: [1792, 512, 256, 256], posterSchedule: [0, 1024, 384, 512],
  photo: [384, 1024, 256, 192], memo: [640, 1024, 256, 320], map: [896, 1024, 768, 512], drawing: [1664, 1024, 384, 384],
  scratch: [0, 1536, 512, 256], slime: [512, 1536, 512, 512], slimeDrip: [1024, 1536, 256, 512], mould: [1536, 1536, 512, 512],
};
const WET = new Set<DecalKind>(['leak', 'puddle']);
const GEL = new Set<DecalKind>(['slime', 'slimeDrip']);
const WEATHER = new Set<DecalKind>(['rust', 'leak', 'stain', 'grime', 'puddle', 'silt', 'scrape', 'tide', 'scratch', 'slime', 'slimeDrip', 'mould']);
const fract = (v: number) => v - Math.floor(v);

function drawAtlas(c: CanvasRenderingContext2D) {
  const r = rng(4242);
  const rect = (k: DecalKind) => RECT[k];
  const clip = (k: DecalKind, f: (x: number, y: number, w: number, h: number) => void) => {
    const [x, y, w, h] = rect(k); c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); f(x, y, w, h); c.restore();
  };
  const blot = (cx: number, cy: number, rad: number, rgb: string, a: number, ring = 0) => {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(ring ? .82 : .5, `rgba(${rgb},${a * (ring ? .7 : .6)})`);
    if (ring) g.addColorStop(.92, `rgba(${rgb},${Math.min(1, a * 1.8)})`);
    g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
  };
  const speckle = (x: number, y: number, w: number, h: number, n: number, rgb: string, a: number) => {
    for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${rgb},${a * r()})`; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1 + r() * 3); }
  };
  // Rust runs: a bloom at the top bleeding into thin drips.
  clip('rust', (x, y, w, h) => {
    for (let i = 0; i < 9; i++) blot(x + w * (.25 + r() * .5), y + 40 + r() * 70, 30 + r() * 50, '120,62,26', .55);
    for (let i = 0; i < 26; i++) {
      const px = x + w * (.15 + r() * .7), len = h * (.25 + r() * .7), wd = 2 + r() * 9;
      const g = c.createLinearGradient(0, y + 40, 0, y + 40 + len);
      g.addColorStop(0, `rgba(${110 + r() * 40 | 0},${52 + r() * 20 | 0},22,${.45 + r() * .3})`); g.addColorStop(1, 'rgba(90,45,20,0)');
      c.fillStyle = g; c.fillRect(px, y + 40, wd, len);
    }
    speckle(x, y, w, 300, 900, '70,36,14', .7);
  });
  // Dark wet leak from a seam.
  clip('leak', (x, y, w, h) => {
    for (let i = 0; i < 14; i++) {
      const px = x + w * (.3 + r() * .4), len = h * (.4 + r() * .6), wd = 6 + r() * 30;
      const g = c.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(10,14,12,.75)'); g.addColorStop(.7, 'rgba(10,14,12,.35)'); g.addColorStop(1, 'rgba(10,14,12,0)');
      c.fillStyle = g; c.fillRect(px - wd / 2, y, wd, len);
    }
  });
  // Dried water stain with tide rings.
  clip('stain', (x, y, w, h) => {
    for (let i = 0; i < 6; i++) blot(x + w * (.3 + r() * .4), y + h * (.3 + r() * .4), w * (.18 + r() * .25), r() < .5 ? '96,80,52' : '60,64,48', .2, 1);
    speckle(x, y, w, h, 1200, '40,36,26', .25);
  });
  // Soot / handling grime.
  clip('grime', (x, y, w, h) => {
    for (let i = 0; i < 40; i++) blot(x + w * (.15 + r() * .7), y + h * (.15 + r() * .7), 20 + r() * 90, '18,20,17', .18);
    speckle(x, y, w, h, 2000, '12,12,10', .35);
  });
  // Floor puddle: soft dark pool.
  clip('puddle', (x, y, w, h) => {
    for (let i = 0; i < 12; i++) blot(x + w * (.3 + r() * .4), y + h * (.3 + r() * .4), w * (.15 + r() * .22), '8,12,12', .5);
  });
  // Silt drift edge with ripples.
  clip('silt', (x, y, w, h) => {
    for (let i = 0; i < 30; i++) blot(x + w * (.2 + r() * .6), y + h * (.2 + r() * .6), 40 + r() * 110, '92,86,70', .22);
    c.strokeStyle = 'rgba(60,56,44,.25)'; c.lineWidth = 3;
    for (let i = 0; i < 9; i++) { c.beginPath(); const yy = y + h * (.2 + i * .07); c.moveTo(x + w * .15, yy); for (let t = 0; t <= 1; t += .05) c.lineTo(x + w * (.15 + t * .7), yy + Math.sin(t * 9 + i) * 6); c.stroke(); }
    speckle(x, y, w, h, 1500, '120,112,92', .3);
  });
  // Scrapes and drag marks.
  clip('scrape', (x, y, w, h) => {
    for (let i = 0; i < 70; i++) {
      c.strokeStyle = r() < .35 ? `rgba(150,146,132,${.1 + r() * .18})` : `rgba(20,20,18,${.2 + r() * .3})`; c.lineWidth = .7 + r() * 2;
      const sx = x + r() * w * .5, sy = y + h * (.2 + r() * .6); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + w * (.3 + r() * .5), sy + (r() - .5) * 30); c.stroke();
    }
  });
  // Horizontal flood tide line.
  clip('tide', (x, y, w, h) => {
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(60,52,36,0)'); g.addColorStop(.45, 'rgba(70,60,40,.55)'); g.addColorStop(.55, 'rgba(40,36,26,.7)'); g.addColorStop(1, 'rgba(30,28,22,.25)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${r()})`; c.fillRect(x + r() * w, y + r() * h, 4 + r() * 30, 2 + r() * 10); }
    c.globalCompositeOperation = 'source-over';
  });
  // Gouges through the paint: bright scored metal with dark burr edges, in parallel sets.
  clip('scratch', (x, y, w, h) => {
    for (let s = 0; s < 7; s++) {
      const sx = x + r() * w * .6, sy = y + h * (.15 + r() * .7), ang = (r() - .5) * .5, len = w * (.15 + r() * .35), n = 2 + (r() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const ox = k * 9 * Math.sin(ang + 1.57), oy = k * 9 * Math.cos(ang + 1.57);
        for (const [col, wd, off] of [['22,20,16,.55', 3.2, 1.6], ['150,144,128,.4', 1.3, 0]] as const) {
          c.strokeStyle = `rgba(${col})`; c.lineWidth = wd; c.beginPath();
          c.moveTo(sx + ox + off, sy + oy + off);
          c.quadraticCurveTo(sx + ox + len * .5, sy + oy + len * .5 * Math.sin(ang) + (r() - .5) * 8, sx + ox + len, sy + oy + len * Math.sin(ang)); c.stroke();
        }
      }
    }
    speckle(x, y, w, h, 400, '200,190,170', .3);
  });
  // Panacea gel film: translucent amber-olive sheet with a thicker rim and trapped specks.
  // Low-chroma olive / yellow-green (blue kept near the green so amber light turns it olive, not orange).
  clip('slime', (x, y, w, h) => {
    for (let i = 0; i < 16; i++) blot(x + w * (.25 + r() * .5), y + h * (.25 + r() * .5), w * (.12 + r() * .22), r() < .5 ? '44,52,36' : '36,46,34', .6, 1);
    for (let i = 0; i < 5; i++) blot(x + w * (.35 + r() * .3), y + h * (.35 + r() * .3), w * (.06 + r() * .08), '70,82,56', .4);
    speckle(x, y, w, h, 500, '118,130,100', .35);
  });
  // Gel runs: wide at the top, thinning into beads.
  clip('slimeDrip', (x, y, w, h) => {
    blot(x + w * .5, y + 30, w * .45, '42,50,34', .65, 1);
    for (let i = 0; i < 10; i++) {
      const px = x + w * (.2 + r() * .6), len = h * (.3 + r() * .65), wd = 5 + r() * 16;
      const g = c.createLinearGradient(0, y + 20, 0, y + 20 + len); g.addColorStop(0, 'rgba(44,52,36,.75)'); g.addColorStop(.85, 'rgba(38,48,34,.5)'); g.addColorStop(1, 'rgba(38,48,34,0)');
      c.fillStyle = g; c.fillRect(px - wd / 2, y + 20, wd, len);
      blot(px, y + 20 + len * .92, wd * .8, '56,66,44', .65);
    }
  });
  // Black mould bloom in a damp corner.
  clip('mould', (x, y, w, h) => {
    for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = r() * r() * w * .42; blot(x + w / 2 + Math.cos(a) * d, y + h / 2 + Math.sin(a) * d, 8 + r() * 40, r() < .7 ? '14,16,12' : '40,44,26', .35); }
    speckle(x, y, w, h, 2500, '10,12,8', .5);
  });
  const paper = (k: DecalKind, bg: string, draw: (x: number, y: number, w: number, h: number) => void) => clip(k, (x, y, w, h) => {
    c.fillStyle = bg; c.fillRect(x + 4, y + 4, w - 8, h - 8); draw(x + 4, y + 4, w - 8, h - 8);
    for (let i = 0; i < 4; i++) blot(x + r() * w, y + r() * h, w * (.2 + r() * .3), '110,90,50', .18, 1);
    speckle(x, y, w, h, 600, '50,40,26', .25);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.moveTo(x + w, y + h); c.lineTo(x + w - w * (.1 + r() * .15), y + h); c.lineTo(x + w, y + h - h * (.08 + r() * .1)); c.fill();
    for (let i = 0; i < 80; i++) { const ex = r() < .5 ? x + r() * w : (r() < .5 ? x + r() * 8 : x + w - r() * 8); const ey = r() < .5 ? y + r() * h : (r() < .5 ? y + r() * 8 : y + h - r() * 8); c.fillRect(ex, ey, 2 + r() * 6, 2 + r() * 6); }
    c.globalCompositeOperation = 'source-over';
  });
  const yahei = (px: number) => `bold ${px}px ${LIVING_FONT.sans}`;
  const latin = (px: number) => `600 ${px}px ${LIVING_FONT.cond}`;
  paper('posterCalm', '#cfd8cf', (x, y, w, h) => {
    const g = c.createLinearGradient(0, y, 0, y + h * .65); g.addColorStop(0, '#2c5a66'); g.addColorStop(1, '#7fb0aa'); c.fillStyle = g; c.fillRect(x, y, w, h * .65);
    c.fillStyle = 'rgba(230,240,232,.8)'; c.beginPath(); c.arc(x + w * .7, y + h * .22, w * .1, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1d3a40'; c.beginPath(); c.moveTo(x, y + h * .65); for (let t = 0; t <= 1; t += .1) c.lineTo(x + w * t, y + h * (.55 + .05 * Math.sin(t * 7))); c.lineTo(x + w, y + h * .65); c.fill();
    c.fillStyle = '#20343a'; c.font = yahei(h * .1); c.fillText('呼吸 · 休息 · 康复', x + w * .06, y + h * .79);
    c.font = latin(h * .055); c.fillText('BREATHE · REST · RECOVER', x + w * .06, y + h * .9);
  });
  paper('posterSafety', '#e2dccb', (x, y, w, h) => {
    c.fillStyle = '#b6892a'; c.fillRect(x, y, w, h * .2); c.fillStyle = '#141414'; c.font = yahei(h * .09); c.fillText('压力舱门安全', x + w * .06, y + h * .13);
    c.strokeStyle = '#222'; c.lineWidth = 5; c.strokeRect(x + w * .2, y + h * .28, w * .6, h * .38); c.beginPath(); c.arc(x + w * .5, y + h * .47, h * .1, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#222'; c.font = yahei(h * .06); c.fillText('通过后立即关闭', x + w * .1, y + h * .78); c.font = latin(h * .045); c.fillText('CLOSE AFTER PASSING', x + w * .1, y + h * .88);
  });
  paper('posterSchedule', '#e6e0cf', (x, y, w, h) => {
    c.fillStyle = '#2a4a50'; c.fillRect(x, y, w, h * .12); c.fillStyle = '#eef2ea'; c.font = yahei(h * .055); c.fillText('住户每日安排', x + w * .05, y + h * .075);
    c.fillStyle = '#333'; const rows = ['07:30  晨间体检', '09:00  加压适应', '12:00  午餐 · 中庭', '15:00  静养', '18:00  晚餐', '21:00  熄灯'];
    rows.forEach((t, i) => { c.font = yahei(h * .042); c.fillText(t, x + w * .07, y + h * (.22 + i * .12)); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + w * .05, y + h * (.25 + i * .12), w * .9, 2); c.fillStyle = '#333'; });
  });
  paper('photo', '#d8d2c0', (x, y, w, h) => {
    const g = c.createLinearGradient(0, y + 10, 0, y + h - 10); g.addColorStop(0, '#6f8c96'); g.addColorStop(1, '#b8a888'); c.fillStyle = g; c.fillRect(x + 10, y + 10, w - 20, h - 34);
    c.fillStyle = '#2c2a26'; for (const [px, s] of [[.32, 1], [.52, .8], [.68, .6]]) { c.beginPath(); c.arc(x + w * px, y + h * .38, 12 * s, 0, Math.PI * 2); c.fill(); c.fillRect(x + w * px - 14 * s, y + h * .38 + 12 * s, 28 * s, 50 * s); }
  });
  paper('memo', '#ece6cf', (x, y, w, h) => {
    c.fillStyle = 'rgba(70,100,150,.35)'; for (let yy = y + 40; yy < y + h; yy += 22) c.fillRect(x, yy, w, 1.5);
    c.fillStyle = '#26314a'; c.font = `${h * .07}px ${LIVING_FONT.hand}`;
    ['巡检记录', '02:00 C2 走廊 正常', '04:00 闸门 F 正常', '06:00 '].forEach((t, i) => c.fillText(t, x + 12, y + 34 + i * 44));
  });
  paper('map', '#d6d0bd', (x, y, w, h) => {
    c.fillStyle = '#2a3c46'; c.fillRect(x, y, w, h * .1); c.fillStyle = '#eef0e8'; c.font = yahei(h * .06); c.fillText('−1 层 生活区 · 应急疏散图', x + w * .03, y + h * .068);
    c.strokeStyle = '#34444a'; c.lineWidth = 4;
    const R = (a: number, b: number, cc: number, d: number) => c.strokeRect(x + w * a, y + h * b, w * cc, h * d);
    R(.05, .2, .1, .3); R(.15, .3, .3, .08); R(.2, .15, .12, .15); R(.45, .25, .1, .2); R(.55, .3, .2, .08); R(.6, .45, .2, .4); R(.8, .2, .12, .25);
    c.strokeStyle = '#a33'; c.lineWidth = 6; c.setLineDash([16, 10]); c.beginPath(); c.moveTo(x + w * .1, y + h * .35); c.lineTo(x + w * .5, y + h * .34); c.lineTo(x + w * .7, y + h * .65); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#a33'; c.beginPath(); c.arc(x + w * .3, y + h * .34, 10, 0, Math.PI * 2); c.fill(); c.font = yahei(h * .045); c.fillText('您在此处', x + w * .27, y + h * .3);
  });
  paper('drawing', '#efe9d8', (x, y, w, h) => {
    c.lineWidth = 6; c.lineCap = 'round';
    c.strokeStyle = '#3a6fb0'; c.beginPath(); c.moveTo(x, y + h * .75); for (let t = 0; t <= 1; t += .05) c.lineTo(x + w * t, y + h * (.72 + .03 * Math.sin(t * 20))); c.stroke();
    c.strokeStyle = '#d0a020'; c.beginPath(); c.arc(x + w * .8, y + h * .2, w * .08, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#333'; for (const px of [.35, .55]) { c.beginPath(); c.arc(x + w * px, y + h * .42, w * .05, 0, Math.PI * 2); c.moveTo(x + w * px, y + h * .47); c.lineTo(x + w * px, y + h * .62); c.moveTo(x + w * (px - .06), y + h * .52); c.lineTo(x + w * (px + .06), y + h * .52); c.stroke(); }
  });
}

export class DecalSet {
  private canvas = document.createElement('canvas');
  readonly texture: T.CanvasTexture;
  readonly material: T.MeshStandardMaterial;
  readonly wet: T.MeshStandardMaterial;
  readonly paper: T.MeshStandardMaterial;
  readonly gel: T.MeshStandardMaterial;
  private unfont: () => void;
  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    const ctx = this.canvas.getContext('2d')!;
    drawAtlas(ctx);
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 16;
    this.unfont = onLivingFonts(() => { ctx.clearRect(0, 0, SIZE, SIZE); drawAtlas(ctx); this.texture.needsUpdate = true; });
    const base = {map: this.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3};
    this.material = new T.MeshStandardMaterial({...base, roughness: .95, metalness: 0}); this.material.name = 'living.decals';
    this.wet = new T.MeshStandardMaterial({...base, roughness: .12, metalness: .1, color: '#9aa4a2'}); this.wet.name = 'living.decals-wet';
    this.paper = new T.MeshStandardMaterial({...base, color: '#c8c2b5', roughness: .9, metalness: 0, alphaTest: .3, depthWrite: true, side: T.DoubleSide}); this.paper.name = 'living.decals-paper';
    this.gel = new T.MeshStandardMaterial({...base, color: '#55604f', roughness: .22, metalness: 0, emissive: '#0e160c', emissiveMap: this.texture, emissiveIntensity: .12}); this.gel.name = 'living.decals-gel';
    for (const mm of [this.material, this.wet, this.paper, this.gel]) withStaticLights(mm);
  }
  private quad(kind: DecalKind, w: number, h: number, flipU = false, seed = 0) {
    let [x, y, cw, ch] = RECT[kind];
    if (seed && WEATHER.has(kind)) {
      // Weathering stamps use a random sub-window of their cell so repeats never read as the same blot.
      const h1 = fract(Math.sin(seed * 12.9898) * 43758.5453), h2 = fract(Math.sin(seed * 78.233) * 12543.123), h3 = fract(Math.sin(seed * 39.425) * 9631.71);
      const fw = .5 + .5 * h1, fh = kind === 'rust' || kind === 'leak' ? 1 : .6 + .4 * h3;
      x += (cw - cw * fw) * h2; cw *= fw; y += (ch - ch * fh) * h3; ch *= fh;
    }
    const g = new T.PlaneGeometry(w, h), uv = g.getAttribute('uv');
    const u0 = x / SIZE, u1 = (x + cw) / SIZE, v1 = 1 - y / SIZE, v0 = 1 - (y + ch) / SIZE;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) > .5) !== flipU ? u1 : u0, uv.getY(i) > .5 ? v1 : v0);
    return g;
  }
  private mat(kind: DecalKind) { return GEL.has(kind) ? this.gel : WET.has(kind) ? this.wet : kind.startsWith('poster') || kind === 'photo' || kind === 'memo' || kind === 'map' || kind === 'drawing' ? this.paper : this.material; }
  /** Wall decal centred at p, facing the unit normal n (XZ axis), optional roll. */
  wall(b: Batcher, kind: DecalKind, p: V3, n: V3, w: number, h: number, roll = 0, flip = false) {
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...n).normalize());
    q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), roll));
    b.add(this.quad(kind, w, h, flip, p[0] * 1.7 + p[1] * 3.1 + p[2] * 2.3 + 1), this.mat(kind), new T.Matrix4().compose(new T.Vector3(...p), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
  }
  /** Floor decal lying flat at p (y = surface + 3 mm), rotated by yaw. */
  floor(b: Batcher, kind: DecalKind, p: V3, w: number, d: number, yaw = 0) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
    b.add(this.quad(kind, w, d, false, p[0] * 2.9 + p[2] * 1.3 + 7), this.mat(kind), new T.Matrix4().compose(new T.Vector3(p[0], p[1] + .003, p[2]), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
  }
  /** Ceiling decal facing down at p (y = ceiling face − 3 mm). */
  ceiling(b: Batcher, kind: DecalKind, p: V3, w: number, d: number, yaw = 0) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(0, yaw, 0)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
    b.add(this.quad(kind, w, d, false, p[0] * 1.9 + p[2] * 2.7 + 11), this.mat(kind), new T.Matrix4().compose(new T.Vector3(p[0], p[1] - .003, p[2]), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
  }
  dispose() { this.unfont(); this.texture.dispose(); this.material.dispose(); this.wet.dispose(); this.paper.dispose(); this.gel.dispose(); }
}

// ================================================================== instanced scatter

type Part = {geo: T.BufferGeometry; mat: T.Material; shadow: boolean; matrices: T.Matrix4[]; colors: (T.Color | null)[]};

/**
 * Repeated small parts (rivets, bolts, clamps, debris) collected per space and emitted as one
 * InstancedMesh per geometry/material pair into the space's Batcher (culled with the space).
 */
export class Scatter {
  private parts = new Map<string, Part>();
  count = 0;
  /** Geometries are owned by the caller (shared between spaces). */
  define(key: string, geo: T.BufferGeometry, mat: T.Material, shadow = false) {
    if (!this.parts.has(key)) this.parts.set(key, {geo, mat, shadow, matrices: [], colors: []});
  }
  has(key: string) { return this.parts.has(key); }
  /** `color` tints this instance (multiplies the material colour); omitted instances stay white. */
  put(key: string, p: V3, rot: V3 = [0, 0, 0], s: V3 = [1, 1, 1], color?: T.ColorRepresentation) {
    const part = this.parts.get(key); if (!part) throw new Error(`scatter part ${key}`);
    part.matrices.push(new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(rot[0], rot[1], rot[2], 'YXZ')), new T.Vector3(...s)));
    part.colors.push(color === undefined ? null : new T.Color(color));
    this.count++;
  }
  /** Placements per part key so far (for dressing density reports). */
  tally() { const out: Record<string, number> = {}; for (const [k, p] of this.parts) if (p.matrices.length) out[k] = p.matrices.length; return out; }
  /** Emit everything placed into batch `b`, then clear the placements (definitions stay). */
  emit(b: Batcher) {
    for (const [key, part] of this.parts) {
      if (!part.matrices.length) continue;
      const mesh = new T.InstancedMesh(part.geo, part.mat, part.matrices.length);
      part.matrices.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      if (part.colors.some(c => c)) {
        const white = new T.Color(1, 1, 1);
        part.colors.forEach((c, i) => mesh.setColorAt(i, c ?? white));
        mesh.instanceColor!.needsUpdate = true;
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
      mesh.castShadow = part.shadow; mesh.receiveShadow = true; mesh.name = `${b.name}:inst:${key}`;
      b.extras.push(mesh); part.matrices = []; part.colors = [];
    }
  }
}

// ================================================================== route clearance

const POD_HALF_W = 1.4, POD_HALF_H = 1.5, POD_HALF_L = 2.5, MARGIN = .25;
let samples: {p: T.Vector3; turn: boolean}[] | null = null;
function routeSamples() {
  if (samples) return samples;
  samples = [];
  const pts = [LIVING_SPAWN.position, ...LIVING_MAIN_ROUTE].map(v => new T.Vector3(...v));
  for (const s of Object.values(LIVING_PHOTO_STATIONS)) samples.push({p: new T.Vector3(...s.position), turn: true});
  // Parking poses in front of every pod-operable item (hull facing the item; no turning there).
  for (const it of LIVING_ITEMS) {
    if (it.kind !== 'box' && it.kind !== 'terminal' && it.kind !== 'pipe') continue;
    const f = it.face * Math.PI / 180, dir = new T.Vector3(Math.sin(f), 0, -Math.cos(f));
    for (const d of [3.2, 4.2, 5.2]) { const park = new T.Vector3(...it.position).addScaledVector(dir, d); park.y = 0; samples.push({p: park, turn: false}); }
  }
  for (let i = 0; i < pts.length; i++) {
    samples.push({p: pts[i], turn: true});
    if (i === 0) continue;
    const a = pts[i - 1], d = pts[i].clone().sub(a), n = Math.ceil(d.length() / .4);
    for (let k = 1; k < n; k++) samples.push({p: a.clone().addScaledVector(d, k / n), turn: false});
  }
  return samples;
}

/**
 * True when a visual-only box stays out of the pod's swept route volume (2.8 × 3 × 5 m hull,
 * turning circles at waypoints and photo stations). Dressing has no collision, so anything
 * failing this would be driven through.
 */
export function routeClear(box: T.Box3): boolean {
  for (const {p, turn} of routeSamples()) {
    if (box.max.y < p.y - POD_HALF_H - MARGIN || box.min.y > p.y + POD_HALF_H + MARGIN) continue;
    const dx = Math.max(box.min.x - p.x, 0, p.x - box.max.x), dz = Math.max(box.min.z - p.z, 0, p.z - box.max.z);
    const rad = (turn ? Math.hypot(POD_HALF_W, POD_HALF_L) : POD_HALF_W) + MARGIN;
    if (dx * dx + dz * dz < rad * rad) return false;
  }
  return true;
}
/** Point form of routeClear for scatter placement (item of radius r and height h standing at p). */
export function spotClear(p: V3, r: number, h: number) {
  return routeClear(new T.Box3(new T.Vector3(p[0] - r, p[1], p[2] - r), new T.Vector3(p[0] + r, p[1] + h, p[2] + r)));
}
