import * as T from 'three';
import {Batcher, rng, type V3} from './living-build';
import {withStaticLights} from './living-materials';
import {livingFlicker} from './living-atmosphere';

export type SignStyle = 'enamel' | 'exit' | 'warn' | 'red' | 'room' | 'stencil' | 'stencilRed' | 'stencilYellow' | 'brass' | 'cyan';

const CELL_W = 512, CELL_H = 128, SIZE = 2048, SIZE_H = 2048;

/** Bilingual space names used by door signage. */
export const LIVING_EN: Record<string, string> = {
  S: 'DROP SHAFT', C1: 'DORMITORY GALLERY', R1: 'LAUNDRY / LINEN STORE', R2: 'MAINTENANCE SHOP', J1: 'JUNCTION HALL',
  C2: 'NORTH CORRIDOR', R3: 'SECURITY OFFICE', C3: 'EAST CORRIDOR', R4: 'BALLAST STORES', G: 'OBSERVATION GALLERY',
  C4: 'VALVE ACCESS', V: 'VALVE ROOM', C5: 'SOUTH CORRIDOR', A: 'RESIDENTS\u2019 ATRIUM', C6: 'OFFICE ACCESS',
  R5: 'RESIDENCE OFFICE', C7: 'SHAFT ACCESS', D: 'DESCENT SHAFT', L: 'LIVING QUARTERS LOBBY', M: 'SANATORIUM WING', N: 'INNER DORMITORIES',
};
/** Names painted on the facility's own signs (the corridor M was not called "contaminated" by its builders). */
export const LIVING_SIGN_CN: Record<string, string> = {M: '疗养区走廊'};

// ================================================================== bundled fonts (SIL OFL, public/assets/fonts)

/** Canvas font stacks. Only the bundled OFL faces are named; the generic family covers the frame before they load. */
export const LIVING_FONT = {
  sans: '"LivingSans",sans-serif',
  cond: '"LivingCond","LivingSans",sans-serif',
  stencil: '"LivingStencil","LivingCond",sans-serif',
  hand: '"LivingHand","LivingSans",cursive',
};
const FONT_FILES: [string, string][] = [
  ['LivingSans', 'NotoSansSC-Bold-living.woff2'], ['LivingCond', 'BarlowCondensed-SemiBold-living.woff2'],
  ['LivingStencil', 'SairaStencilOne-living.woff2'], ['LivingHand', 'MaShanZheng-living.woff2'],
];
let fontsLoaded = false;
const fontRedraws = new Set<() => void>();
/** Resolves once the bundled faces are registered (or failed); canvases drawn earlier are redrawn then. */
export const livingFontsReady: Promise<void> = (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts)
  ? Promise.resolve()
  : Promise.all(FONT_FILES.map(([family, file]) => new FontFace(family, `url(/assets/fonts/${file})`, {weight: '100 900', display: 'block'})
    .load().then(f => { document.fonts.add(f); }, () => console.warn(`[living-fonts] ${file} failed to load`)))).then(() => {
    fontsLoaded = true;
    for (const redraw of fontRedraws) redraw();
    fontRedraws.clear();
  });
/** Registers a canvas redraw for when the fonts arrive; returns the unregister function. */
export function onLivingFonts(redraw: () => void) {
  if (fontsLoaded) return () => {};
  fontRedraws.add(redraw); return () => { fontRedraws.delete(redraw); };
}
const SYSTEM_FONTS: [RegExp, string][] = [
  [/"?(Microsoft YaHei|PingFang SC|SimHei)"?/g, '"LivingSans"'],
  [/"?(Impact|Arial Black)"?/g, '"LivingStencil"'],
  [/"?(Bahnschrift|DIN Alternate|Arial Narrow|Arial)"?/g, '"LivingCond"'],
  [/"?(KaiTi|STKaiti|Segoe Print|Ink Free|Comic Sans MS)"?/g, '"LivingHand"'],
];
/** Maps system font names in a CSS font string onto the bundled faces (for canvases drawn by other modules). */
export function livingFontOf(font: string) {
  let out = font; for (const [re, to] of SYSTEM_FONTS) out = out.replace(re, to); return out;
}
/** Makes a 2D context rewrite system font names to bundled ones whenever `font` is set. */
export function bundleFonts(c: CanvasRenderingContext2D) {
  const proto = typeof CanvasRenderingContext2D === 'undefined' ? undefined : Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
  if (!proto?.set || !proto.get) return c;
  Object.defineProperty(c, 'font', {configurable: true, get() { return proto.get!.call(c); }, set(v: string) { proto.set!.call(c, livingFontOf(v)); }});
  return c;
}

function wear(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, amount = 1) {
  const r = rng(seed);
  for (let i = 0; i < 260 * amount; i++) {
    const px = x + r() * w, py = y + r() * h, edge = Math.min(px - x, x + w - px, py - y, y + h - py);
    if (edge > 10 && r() > .12) continue;
    c.fillStyle = r() > .5 ? 'rgba(92,55,30,.55)' : 'rgba(30,34,28,.45)';
    c.fillRect(px, py, 1 + r() * 6, 1 + r() * 3);
  }
  for (let i = 0; i < 5 * amount; i++) {
    const px = x + r() * w, len = 10 + r() * h * .9;
    const g = c.createLinearGradient(px, y, px, y + len);
    g.addColorStop(0, 'rgba(80,46,22,.45)'); g.addColorStop(1, 'rgba(80,46,22,0)');
    c.fillStyle = g; c.fillRect(px, y + r() * 8, 1.5 + r() * 3, len);
  }
  const g = c.createRadialGradient(x + w * .5, y + h * .5, Math.min(w, h) * .2, x + w * .5, y + h * .5, Math.max(w, h) * .7);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,24,18,${.35 * amount})`);
  c.fillStyle = g; c.fillRect(x, y, w, h);
}

function fit(c: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, max: number) {
  let size = px; c.font = font(size);
  while (size > 8 && c.measureText(text).width > max) { size -= 2; c.font = font(size); }
  return size;
}

/**
 * Backlight level per style (0..1, written into the emissive mask). Light boxes (exit, red, cyan)
 * read as the brightest wayfinding marks in a dark space; enamel plates only catch the lamp.
 */
export const SIGN_GLOW: Record<SignStyle, number> = {
  exit: 1, red: .85, cyan: .7, warn: .12, enamel: .05, room: .05, brass: .03, stencil: 0, stencilRed: 0, stencilYellow: 0,
};

/**
 * Titles printed into hero GLBs (tools/blender/build-living-*.py). A generated plate with the same
 * text within `r` metres (XZ) is dropped so the room never shows the title twice; the GLB wins.
 */
export const GLB_OWNED_TITLES: readonly {cn: string; near: V3; r: number; glb: string}[] = [
  {cn: '员工公告栏', near: [150.6, 1, 92], r: 2.5, glb: 'living-manager-office.glb'},
  {cn: '钥匙柜', near: [170, 0, 104], r: 6, glb: 'living-manager-office.glb'},
];

/** A 2048² canvas holding up to 64 signs (further signs go to an overflow page); every sign is a quad in one merged mesh. */
export class SignAtlas {
  private canvas = document.createElement('canvas');
  private glowCanvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private glow: CanvasRenderingContext2D;
  private next = 0;
  private overflow?: SignAtlas;
  private entries: {cn: string; en: string; style: SignStyle; x: number; y: number; glow: number}[] = [];
  private unfont: () => void;
  readonly texture: T.CanvasTexture;
  readonly glowTexture: T.CanvasTexture;
  readonly material: T.MeshStandardMaterial;
  /**
   * Plate/light-box housings drawn behind non-decal signs so no sign floats as a bare quad.
   * Set once by the shell builder (materials live there).
   */
  static housing: {plate: T.Material; box: T.Material; bolt: T.Material} | null = null;
  /** Generated titles skipped because a hero GLB already carries the same printed title there. */
  static suppressed: string[] = [];
  constructor(readonly batch: Batcher, readonly decal: boolean) {
    this.canvas.width = SIZE; this.canvas.height = SIZE_H;
    this.glowCanvas.width = decal ? 4 : SIZE; this.glowCanvas.height = decal ? 4 : SIZE_H;
    this.ctx = bundleFonts(this.canvas.getContext('2d')!);
    this.glow = this.glowCanvas.getContext('2d')!;
    this.unfont = onLivingFonts(() => this.redraw());
    this.glow.fillStyle = '#000'; this.glow.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    if (!decal) { this.ctx.fillStyle = '#20231f'; this.ctx.fillRect(0, 0, SIZE, SIZE_H); }
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 16;
    this.texture.flipY = true;
    this.glowTexture = new T.CanvasTexture(this.glowCanvas); this.glowTexture.colorSpace = T.SRGBColorSpace; this.glowTexture.anisotropy = 16;
    this.material = new T.MeshStandardMaterial({
      map: this.texture, roughness: decal ? .9 : .5, metalness: decal ? 0 : .2,
      transparent: decal, depthWrite: !decal, alphaTest: decal ? .04 : 0,
      emissive: decal ? '#000000' : '#ffffff', emissiveMap: decal ? null : this.glowTexture, emissiveIntensity: decal ? 0 : 1.6,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.material.name = decal ? 'living.sign-decals' : 'living.signs';
    withStaticLights(this.material);
  }
  private cell(): [number, number] | null {
    if (this.next >= (SIZE / CELL_W) * (SIZE_H / CELL_H)) return null;
    const i = this.next++; return [(i % (SIZE / CELL_W)) * CELL_W, Math.floor(i / (SIZE / CELL_W)) * CELL_H];
  }
  private draw(cn: string, en: string, style: SignStyle, x: number, y: number) {
    const c = this.ctx, w = CELL_W, h = CELL_H, seed = (x * 7 + y * 13) | 0;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const yahei = (px: number) => `bold ${px}px ${LIVING_FONT.sans}`;
    const latin = (px: number) => `600 ${px}px ${LIVING_FONT.cond}`;
    const stencilFont = (px: number) => `400 ${px}px ${LIVING_FONT.stencil}`;
    if (style.startsWith('stencil')) {
      c.clearRect(x, y, w, h);
      const col = style === 'stencilRed' ? '#a3352a' : style === 'stencilYellow' ? '#c79d35' : '#d9d4c2';
      c.fillStyle = col; c.globalAlpha = .9;
      const s1 = fit(c, cn, cn.match(/[\u4e00-\u9fff]/) ? yahei : stencilFont, en ? 70 : 100, w - 24);
      c.textBaseline = 'middle'; c.fillText(cn, x + 12, y + (en ? h * .40 : h * .52));
      if (en) { fit(c, en, stencilFont, 30, w - 24); c.fillText(en, x + 14, y + h * .82); }
      // Stencil bridges and paint loss.
      c.globalCompositeOperation = 'destination-out'; const r = rng(seed);
      for (let i = 0; i < 9; i++) c.fillRect(x + 12 + r() * (w - 24), y, 3, h);
      for (let i = 0; i < 900; i++) { c.globalAlpha = .3 + r() * .7; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 4, 1 + r() * 3); }
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; void s1;
      c.restore(); return;
    }
    const pal: Record<string, [string, string, string]> = {
      enamel: ['#1d3431', '#e1dcc4', '#a7b49d'], exit: ['#1d6b43', '#f1f4e8', '#cfe6d2'], warn: ['#c9a033', '#141414', '#2b2618'],
      red: ['#8f2420', '#f3e6dc', '#f0c9bd'], room: ['#2a2622', '#d9c79a', '#b9a77a'], brass: ['#7a5f32', '#1b1610', '#2b2116'], cyan: ['#20434a', '#d8efe9', '#a4cdc8'],
    };
    const [bg, fg, sub] = pal[style] ?? pal.enamel;
    c.fillStyle = bg; c.fillRect(x, y, w, h);
    c.strokeStyle = fg; c.globalAlpha = .55; c.lineWidth = 3; c.strokeRect(x + 7, y + 7, w - 14, h - 14); c.globalAlpha = 1;
    c.fillStyle = fg; c.textBaseline = 'middle';
    let tx = x + 22;
    if (style === 'exit') { // running-man pictogram block
      c.fillStyle = fg; c.fillRect(x + 16, y + 18, 88, h - 36); c.fillStyle = bg;
      c.beginPath(); c.arc(x + 66, y + 38, 9, 0, Math.PI * 2); c.fill();
      c.lineWidth = 9; c.strokeStyle = bg; c.lineCap = 'round'; c.beginPath();
      c.moveTo(x + 62, y + 52); c.lineTo(x + 54, y + 78); c.lineTo(x + 38, y + 96); c.moveTo(x + 54, y + 78); c.lineTo(x + 72, y + 92); c.lineTo(x + 76, y + 108);
      c.moveTo(x + 60, y + 58); c.lineTo(x + 80, y + 70); c.moveTo(x + 60, y + 58); c.lineTo(x + 42, y + 66); c.stroke();
      c.fillStyle = fg; tx = x + 120;
    }
    if (style === 'warn') { c.beginPath(); c.moveTo(x + 60, y + 18); c.lineTo(x + 104, y + 108); c.lineTo(x + 16, y + 108); c.closePath(); c.fillStyle = fg; c.fill(); c.fillStyle = bg; c.fillRect(x + 55, y + 50, 10, 34); c.fillRect(x + 55, y + 90, 10, 10); c.fillStyle = fg; tx = x + 120; }
    const maxW = x + w - 18 - tx;
    if (en) {
      fit(c, cn, yahei, 58, maxW); c.fillText(cn, tx, y + h * .38);
      c.fillStyle = sub; fit(c, en, latin, 30, maxW); c.fillText(en, tx + 2, y + h * .76);
    } else { fit(c, cn, cn.match(/[\u4e00-\u9fff]/) ? yahei : latin, 76, maxW); c.fillText(cn, tx, y + h * .54); }
    wear(c, x, y, w, h, seed, style === 'exit' ? .6 : 1);
    sediment(c, x, y, w, h, seed);
    c.restore();
  }
  private paint(e: {cn: string; en: string; style: SignStyle; x: number; y: number; glow: number}) {
    this.draw(e.cn, e.en, e.style, e.x, e.y); this.texture.needsUpdate = true;
    if (e.glow > 0) {
      this.glow.globalAlpha = e.glow; this.glow.drawImage(this.canvas, e.x, e.y, CELL_W, CELL_H, e.x, e.y, CELL_W, CELL_H);
      this.glow.globalAlpha = 1; this.glowTexture.needsUpdate = true;
    }
  }
  private redraw() {
    const c = this.ctx;
    if (this.decal) c.clearRect(0, 0, SIZE, SIZE_H); else { c.fillStyle = '#20231f'; c.fillRect(0, 0, SIZE, SIZE_H); }
    this.glow.fillStyle = '#000'; this.glow.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    for (const e of this.entries) this.paint(e);
  }
  /**
   * Places a sign quad facing `normal` (unit axis vector in XZ) centred at `p`.
   * Height is width/4 (atlas cell aspect).
   */
  add(cn: string, en: string, style: SignStyle, p: V3, normal: V3, width: number, opts: {glow?: number; depth?: number} = {}) {
    const owned = GLB_OWNED_TITLES.find(t => t.cn === cn && Math.hypot(p[0] - t.near[0], p[2] - t.near[2]) < t.r);
    if (owned) { SignAtlas.suppressed.push(`${cn} @ ${p.map(v => v.toFixed(1)).join(',')} (${owned.glb})`); return; }
    const cell = this.cell(); if (!cell) { (this.overflow ??= new SignAtlas(this.batch, this.decal)).add(cn, en, style, p, normal, width, opts); return; }
    const glow = this.decal ? 0 : opts.glow ?? SIGN_GLOW[style];
    const entry = {cn, en, style, x: cell[0], y: cell[1], glow};
    this.entries.push(entry); this.paint(entry);
    const g = new T.PlaneGeometry(width, width / 4);
    const uv = g.getAttribute('uv');
    const u0 = cell[0] / SIZE, u1 = (cell[0] + CELL_W) / SIZE, v1 = 1 - cell[1] / SIZE_H, v0 = 1 - (cell[1] + CELL_H) / SIZE_H;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    const n = new T.Vector3(...normal).normalize();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
    this.batch.add(g, this.material, new T.Matrix4().compose(new T.Vector3(...p), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
    // Housing: light boxes get a deep steel tray with a lip; plates get a thin backer with four bolts.
    const H = SignAtlas.housing;
    if (this.decal || !H) return;
    const lit = glow >= .5, d = opts.depth ?? (lit ? .12 : .035), h = width / 4;
    const back = new T.Vector3(...p).addScaledVector(n, -d / 2 - .004);
    this.batch.add(new T.BoxGeometry(width + (lit ? .08 : .04), h + (lit ? .08 : .04), d), lit ? H.box : H.plate, new T.Matrix4().compose(back, q, new T.Vector3(1, 1, 1)), {shadow: true});
    if (!lit) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const off = new T.Vector3(sx * (width / 2 - Math.min(.05, width * .04)), sy * (h / 2 - Math.min(.04, h * .15)), .004).applyQuaternion(q);
      const bolt = new T.CylinderGeometry(.012, .012, .01, 8).rotateX(Math.PI / 2);
      this.batch.add(bolt, H.bolt, new T.Matrix4().compose(new T.Vector3(...p).add(off), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
    } else for (const s of [-1, 1]) {
      const lip = new T.Vector3(0, s * (h / 2 + .03), .01).applyQuaternion(q);
      this.batch.add(new T.BoxGeometry(width + .1, .025, .05), H.box, new T.Matrix4().compose(new T.Vector3(...p).add(lip), q, new T.Vector3(1, 1, 1)), {shadow: false});
    }
  }
  dispose() { this.unfont(); this.texture.dispose(); this.glowTexture.dispose(); this.material.dispose(); this.overflow?.dispose(); }
}

export type FasciaTint = 'amber' | 'cyan' | 'red';
const FASCIA_W = 1024, FASCIA_H = 204, FASCIA_COLS = 2, FASCIA_ROWS = 5;
const TUBE: Record<FasciaTint, {glow: string; glass: string; dead: string}> = {
  amber: {glow: '#ff9d3c', glass: '#f6dcb4', dead: '#6b5a44'},
  cyan: {glow: '#5fe0d2', glass: '#d2f2ec', dead: '#4b5f5c'},
  red: {glow: '#ff4a36', glass: '#f6c6bc', dead: '#6a4440'},
};
/** Letter states of a fascia tube sign: lit, two flicker groups, dead glass, fallen off, hanging askew. */
type LetterState = 'lit' | 'flickA' | 'flickB' | 'dead' | 'missing' | 'tilted';

/**
 * Storefront fascia names as individual tube letters on a corroded enamel plate. Each letter has its own
 * state; flickering letters live in two mask channels animated by `update` (one material, one draw).
 */
export class FasciaSigns {
  private canvas = document.createElement('canvas');
  private glowCanvas = document.createElement('canvas');
  private maskCanvas = document.createElement('canvas');
  private entries: {cn: string; en: string; tint: FasciaTint; life: number; x: number; y: number; seed: number}[] = [];
  private unfont: () => void;
  private uFlick = {uFlickA: {value: 1}, uFlickB: {value: 1}};
  private uMask: {value: T.Texture};
  readonly texture: T.CanvasTexture; readonly glowTexture: T.CanvasTexture; readonly maskTexture: T.CanvasTexture;
  readonly material: T.MeshStandardMaterial;
  constructor(readonly batch: Batcher) {
    for (const cv of [this.canvas, this.glowCanvas, this.maskCanvas]) { cv.width = FASCIA_W * FASCIA_COLS; cv.height = FASCIA_H * FASCIA_ROWS; }
    bundleFonts(this.canvas.getContext('2d')!); bundleFonts(this.glowCanvas.getContext('2d')!); bundleFonts(this.maskCanvas.getContext('2d')!);
    const tex = (cv: HTMLCanvasElement, srgb: boolean) => { const t = new T.CanvasTexture(cv); t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; t.anisotropy = 8; return t; };
    this.texture = tex(this.canvas, true); this.glowTexture = tex(this.glowCanvas, true); this.maskTexture = tex(this.maskCanvas, false);
    this.uMask = {value: this.maskTexture};
    this.clear();
    this.material = new T.MeshStandardMaterial({
      map: this.texture, roughness: .55, metalness: .25, emissive: '#ffffff', emissiveMap: this.glowTexture, emissiveIntensity: 2.6,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.material.name = 'living.fascia-signs';
    this.material.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.uFlick); sh.uniforms.uFasciaMask = this.uMask;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlickA, uFlickB; uniform sampler2D uFasciaMask;')
        .replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
 vec3 fsMask = texture2D(uFasciaMask, vEmissiveMapUv).rgb;
 totalEmissiveRadiance *= texture2D(emissiveMap, vEmissiveMapUv).rgb * dot(fsMask, vec3(1., uFlickA, uFlickB));
#endif`);
    };
    this.material.customProgramCacheKey = () => 'living-fascia-v1';
    withStaticLights(this.material, 'fascia');
    this.unfont = onLivingFonts(() => { this.clear(); for (const e of this.entries) this.paint(e); });
  }
  private clear() {
    const W = this.canvas.width, H = this.canvas.height;
    for (const [cv, col] of [[this.canvas, '#1c201d'], [this.glowCanvas, '#000'], [this.maskCanvas, '#000']] as const) { const c = cv.getContext('2d')!; c.fillStyle = col; c.fillRect(0, 0, W, H); }
    for (const t of [this.texture, this.glowTexture, this.maskTexture]) t.needsUpdate = true;
  }
  private paint(e: FasciaSigns['entries'][number]) {
    const c = this.canvas.getContext('2d')!, g = this.glowCanvas.getContext('2d')!, k = this.maskCanvas.getContext('2d')!;
    const {x, y} = e, w = FASCIA_W, h = FASCIA_H, r = rng(e.seed), tube = TUBE[e.tint];
    for (const cc of [c, g, k]) { cc.save(); cc.beginPath(); cc.rect(x, y, w, h); cc.clip(); }
    // Enamel plate: dark paint, brushed streaks, edge rust, a bolt in each corner.
    c.fillStyle = '#1d2a27'; c.fillRect(x, y, w, h);
    for (let i = 0; i < 240; i++) { c.fillStyle = `rgba(${r() > .5 ? '60,72,66' : '12,16,14'},${.15 + r() * .25})`; c.fillRect(x + r() * w, y + r() * h, 20 + r() * 120, 1 + r() * 2); }
    c.strokeStyle = 'rgba(160,150,120,.35)'; c.lineWidth = 4; c.strokeRect(x + 10, y + 10, w - 20, h - 20);
    // A dark or fallen-off CJK glyph changes the word on a lit sign (居民小卖部 reads 居 小卖部), so Chinese
    // letters age by flicker, tilt and grime only; Latin letters may drop out or die, the English line stays legible.
    const pick = (ch: string): LetterState => {
      const v = r(), latin = ch.charCodeAt(0) < 0x80;
      if (v > e.life + .25) return !latin ? 'flickB' : v > .93 ? 'missing' : 'dead';
      if (v > e.life) return r() < .5 ? 'flickA' : 'flickB';
      return r() < .06 ? 'tilted' : 'lit';
    };
    const line = (text: string, family: string, weight: string, px: number, cy: number, x0: number, maxW: number, stroke: number) => {
      const setFont = () => { c.font = g.font = k.font = `${weight} ${px}px ${family}`; };
      setFont();
      const chars = [...text], gap = px * .12;
      let total = chars.reduce((s, ch) => s + c.measureText(ch).width + gap, -gap);
      if (total > maxW) { px *= maxW / total; setFont(); total = chars.reduce((s, ch) => s + c.measureText(ch).width + px * .12, -px * .12); }
      let cx = x0 + (maxW - total) / 2;
      for (const ch of chars) {
        const cw = c.measureText(ch).width;
        if (ch.trim()) {
          const st = pick(ch), mid = cx + cw / 2;
          for (const cc of [c, g, k]) { cc.save(); cc.textAlign = 'center'; cc.textBaseline = 'middle'; cc.translate(mid, cy); if (st === 'tilted') cc.rotate((r() < .5 ? -1 : 1) * (.18 + r() * .2)); }
          if (st === 'missing') {
            // Clean ghost where the letter shielded the paint, three bolt holes, a rust run below.
            c.fillStyle = 'rgba(120,140,128,.16)'; c.fillText(ch, 0, 0);
            c.fillStyle = '#0b0d0c'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc((r() - .5) * cw * .7, (r() - .5) * px * .6, 3, 0, PI2); c.fill(); }
            const rg = c.createLinearGradient(0, px * .2, 0, px * .2 + h * .5); rg.addColorStop(0, 'rgba(110,60,28,.55)'); rg.addColorStop(1, 'rgba(110,60,28,0)');
            c.fillStyle = rg; c.fillRect(-2, px * .2, 4, h * .5);
          } else {
            // Channel letter: dark return, then the glass tube on top.
            c.lineJoin = 'round'; c.strokeStyle = '#0e100e'; c.lineWidth = stroke * 2.2; c.strokeText(ch, 0, 0);
            const lit = st !== 'dead';
            c.fillStyle = lit ? tube.glass : tube.dead; c.fillText(ch, 0, 0);
            if (!lit) { c.fillStyle = 'rgba(20,18,14,.45)'; for (let i = 0; i < 6; i++) c.fillRect((r() - .5) * cw, (r() - .5) * px * .8, 4 + r() * 10, 3 + r() * 6); }
            if (lit) {
              g.shadowColor = tube.glow; g.shadowBlur = px * .35; g.fillStyle = tube.glow; g.fillText(ch, 0, 0); g.shadowBlur = 0;
              const ch3 = st === 'flickA' ? '#00ff00' : st === 'flickB' ? '#0000ff' : '#ff0000';
              k.shadowColor = ch3; k.shadowBlur = px * .35; k.fillStyle = ch3; k.fillText(ch, 0, 0); k.shadowBlur = 0;
            }
          }
          for (const cc of [c, g, k]) cc.restore();
        }
        cx += cw + gap;
      }
    };
    line(e.cn, LIVING_FONT.sans, 'bold', h * (e.en ? .5 : .66), y + h * (e.en ? .4 : .52), x + 30, w - 60, 4);
    if (e.en) line(e.en, LIVING_FONT.cond, '600', h * .2, y + h * .8, x + 60, w - 120, 2);
    wear(c, x, y, w, h, e.seed, 1.7);
    sediment(c, x, y, w, h, e.seed, 1.2);
    // Silt on the top edge also blocks the tubes.
    const sg = k.createLinearGradient(0, y, 0, y + h * .3); sg.addColorStop(0, 'rgba(0,0,0,.85)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    k.fillStyle = sg; k.fillRect(x, y, w, h * .3);
    for (const [bx, by] of [[x + 22, y + 22], [x + w - 22, y + 22], [x + 22, y + h - 22], [x + w - 22, y + h - 22]]) {
      c.fillStyle = '#5c5a52'; c.beginPath(); c.arc(bx, by, 7, 0, PI2); c.fill();
      const rg = c.createLinearGradient(0, by, 0, by + 60); rg.addColorStop(0, 'rgba(120,64,30,.6)'); rg.addColorStop(1, 'rgba(120,64,30,0)'); c.fillStyle = rg; c.fillRect(bx - 3, by, 6, 60);
    }
    for (const cc of [c, g, k]) cc.restore();
    for (const t of [this.texture, this.glowTexture, this.maskTexture]) t.needsUpdate = true;
  }
  /**
   * Places a fascia sign quad facing `normal` at `p`. `life` is the share of letters still lit (0..1);
   * the rest flicker, are dead glass or have fallen off.
   */
  add(cn: string, en: string, tint: FasciaTint, p: V3, normal: V3, width: number, life: number, seed: number) {
    const i = this.entries.length; if (i >= FASCIA_COLS * FASCIA_ROWS) return;
    const e = {cn, en, tint, life, x: (i % FASCIA_COLS) * FASCIA_W, y: Math.floor(i / FASCIA_COLS) * FASCIA_H, seed};
    this.entries.push(e); this.paint(e);
    const W = FASCIA_W * FASCIA_COLS, H = FASCIA_H * FASCIA_ROWS;
    const g = new T.PlaneGeometry(width, width * FASCIA_H / FASCIA_W), uv = g.getAttribute('uv');
    const u0 = e.x / W, u1 = (e.x + FASCIA_W) / W, v1 = 1 - e.y / H, v0 = 1 - (e.y + FASCIA_H) / H;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) ? u1 : u0, uv.getY(j) ? v1 : v0);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...normal).normalize());
    this.batch.add(g, this.material, new T.Matrix4().compose(new T.Vector3(...p), q, new T.Vector3(1, 1, 1)), {uv: 'keep', shadow: false});
  }
  /** Flicker groups: A stutters like a failing ballast, B dies for seconds and bursts back. */
  update(t: number) {
    this.uFlick.uFlickA.value = livingFlicker('flicker', 3.7, t);
    this.uFlick.uFlickB.value = livingFlicker('dying', 8.1, t);
  }
  dispose() { this.unfont(); this.texture.dispose(); this.glowTexture.dispose(); this.maskTexture.dispose(); this.material.dispose(); }
}
const PI2 = Math.PI * 2;

/** Silt settled on the top edge of a sign plate and in its lower lip, with an irregular front. */
function sediment(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, amount = 1) {
  const r = rng(seed * 31 + 7);
  c.fillStyle = `rgba(104,98,78,${.55 * amount})`;
  c.beginPath(); c.moveTo(x, y);
  for (let t = 0; t <= 1.0001; t += .04) c.lineTo(x + w * t, y + h * (.05 + .07 * r() + .05 * Math.sin(t * 9 + seed)) * amount);
  c.lineTo(x + w, y); c.closePath(); c.fill();
  for (let i = 0; i < 90 * amount; i++) {
    c.fillStyle = `rgba(${r() > .5 ? '120,112,90' : '70,66,52'},${.2 + r() * .35})`;
    c.fillRect(x + r() * w, y + h * (.08 + r() * .14) * amount + (r() > .8 ? r() * h * .5 : 0), 1 + r() * 3, 1 + r() * 2);
  }
  const g = c.createLinearGradient(0, y + h * .82, 0, y + h); g.addColorStop(0, 'rgba(80,74,58,0)'); g.addColorStop(1, `rgba(80,74,58,${.45 * amount})`);
  c.fillStyle = g; c.fillRect(x, y + h * .82, w, h * .18);
}

/** A large high-resolution document texture (R5 evidence). Returned mesh is not batched. */
export function documentMesh(width: number, height: number, px: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, opts: {emissive?: number; name?: string} = {}) {
  const canvas = document.createElement('canvas'); canvas.width = px; canvas.height = Math.round(px * height / width);
  const c = bundleFonts(canvas.getContext('2d')!); draw(c, canvas.width, canvas.height);
  const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 16;
  const unfont = onLivingFonts(() => { c.clearRect(0, 0, canvas.width, canvas.height); draw(c, canvas.width, canvas.height); tex.needsUpdate = true; });
  // Paper is lit by the scene only: albedo held near 0.6 linear (canvas white × tint) and the
  // self-glow capped so the sheet never reads as a glowing UI card under a close lamp.
  const mat = new T.MeshStandardMaterial({map: tex, color: '#c9c3b6', roughness: .94, metalness: 0, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: Math.min(opts.emissive ?? 0, .006), side: T.DoubleSide});
  mat.name = `living.doc.${opts.name ?? 'sheet'}`;
  const geo = new T.PlaneGeometry(width, height);
  const mesh = new T.Mesh(geo, mat); mesh.name = opts.name ?? 'living-document'; mesh.receiveShadow = true;
  return {mesh, dispose() { unfont(); geo.dispose(); mat.dispose(); tex.dispose(); }};
}

export function paperWear(c: CanvasRenderingContext2D, w: number, h: number, seed: number, water = 1) {
  const r = rng(seed);
  for (let i = 0; i < 7 * water; i++) {
    const x = r() * w, y = r() * h, rad = (.08 + r() * .25) * Math.max(w, h);
    const g = c.createRadialGradient(x, y, rad * .3, x, y, rad);
    g.addColorStop(0, 'rgba(140,120,80,0)'); g.addColorStop(.85, 'rgba(130,105,60,.16)'); g.addColorStop(.93, 'rgba(110,85,45,.32)'); g.addColorStop(1, 'rgba(110,85,45,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(70,60,40,${r() * .12})`; c.fillRect(r() * w, r() * h, 2, 2); }
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,50,30,.35)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
}
