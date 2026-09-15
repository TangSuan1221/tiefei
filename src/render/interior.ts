/**
 * 舱内剖面 —— 程序化绘制的 KYRIE-9 控制舱
 * ============================================================================
 * 全部用 Canvas2D 画出来，没有一张外部贴图。
 *
 * 分两层：
 *   bake()  一次性烘焙静态几何与材质（钢板、铆钉、管线、锈迹、渍水、操作台）。
 *           这层很贵（每像素 fbm），但只在尺寸变化时跑一次。
 *   draw()  每帧只画会动的东西：光照贴图、手电光锥、应急灯、积水与倒影、
 *           尘埃、滴水、呼出的白气。
 *
 * 「静态烘焙 + 动态光照」是这套渲染能在 Canvas2D 上跑满 60 FPS 的唯一原因。
 */

import { fbm2, hash2, valueNoise2 } from '../core/rng';
import { clamp, clamp01, lerp, smoothstep } from '../core/util';
import { PALETTE, rgba } from './palette';

const TAU = Math.PI * 2;

export interface InteriorLayout {
  w: number;
  h: number;
  /** 操作台台面的 y */
  consoleY: number;
  /** 未进水时的舱底 y */
  deckY: number;
  scope: { cx: number; cy: number; r: number };
  schematic: { x: number; y: number; w: number; h: number };
  gauges: { x: number; y: number; w: number; h: number };
  hatch: { cx: number; cy: number; r: number };
}

export function layoutFor(w: number, h: number): InteriorLayout {
  return {
    w,
    h,
    consoleY: h * 0.760,
    deckY: h * 0.965,
    scope: { cx: w * 0.372, cy: h * 0.430, r: h * 0.285 },
    schematic: { x: w * 0.648, y: h * 0.150, w: w * 0.288, h: h * 0.330 },
    gauges: { x: w * 0.648, y: h * 0.520, w: w * 0.288, h: h * 0.200 },
    hatch: { cx: w * 0.068, cy: h * 0.430, r: h * 0.195 },
  };
}

export interface InteriorState {
  time: number;
  dt: number;
  /** 手电强度 0..1 */
  torch: number;
  /** 应急灯供电 0..1 */
  power: number;
  /** 水位 0..1 */
  flooding: number;
  /** 声呐屏当前辉光强度 0..1，会洒到台面和墙上 */
  scopeGlow: number;
  /** -1..1 呼吸相位，光锥与镜头都跟着走 */
  breathPhase: number;
  /** 0..1 */
  heartPulse: number;
  /** Veracity 污染 */
  corruption: number;
  /** 房间噪音 0..1，高时舱壁会震 */
  noise: number;
}

// ============================================================================
// 程序化材质工具
// ============================================================================

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('[interior] 2D context 创建失败');
  return [c, ctx];
}

/** 高频砂砾瓦片：铺在任何金属上都能瞬间「脏」起来 */
function makeGritTile(size: number, seed: number): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 可平铺：用环绕坐标做两次采样再混合
      const n =
        valueNoise2(x * 0.5, y * 0.5, seed) * 0.5 +
        valueNoise2(x * 1.7, y * 1.7, seed + 9) * 0.3 +
        hash2(x, y, seed + 31) * 0.2;
      const v = Math.round(clamp(n, 0, 1) * 255);
      const i = (y * size + x) * 4;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 46;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 锈迹层：低频斑块 + 边缘更饱和的铁锈橙，alpha 随斑块强度 */
function makeRustLayer(w: number, h: number, seed: number): HTMLCanvasElement {
  const sw = Math.max(8, Math.round(w / 4));
  const sh = Math.max(8, Math.round(h / 4));
  const [cv, ctx] = makeCanvas(sw, sh);
  const img = ctx.createImageData(sw, sh);
  const d = img.data;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const u = x / sw;
      const v = y / sh;
      const n = fbm2(u * 7.5, v * 5.2, 5, seed);
      const n2 = fbm2(u * 22 + 4.1, v * 15 + 9.3, 3, seed + 77);
      // 渗水从上往下更重
      const bias = 0.04 * (1 - v) - 0.05;
      const amount = smoothstep((n + n2 * 0.35 + bias - 0.50) / 0.30);
      if (amount <= 0.002) continue;
      const core = smoothstep((amount - 0.55) / 0.45);
      const r = lerp(94, 196, core);
      const g = lerp(44, 99, core);
      const b = lerp(22, 42, core);
      const i = (y * sw + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = Math.round(amount * 225);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ============================================================================
// 主渲染器
// ============================================================================

export class InteriorRenderer {
  private baked: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private grit: HTMLCanvasElement | null = null;
  private lightmap: HTMLCanvasElement | null = null;
  private lctx: CanvasRenderingContext2D | null = null;
  private key = '';
  layout: InteriorLayout = layoutFor(16, 9);

  private motes: { x: number; y: number; z: number; p: number }[] = [];
  private drips: { x: number; y: number; v: number; life: number; src: number }[] = [];
  private ripples: { x: number; r: number; a: number }[] = [];
  private dripTimer = 0;
  private moteSeed = 0;

  ensure(w: number, h: number): void {
    const k = `${Math.round(w)}x${Math.round(h)}`;
    if (k === this.key && this.baked) return;
    this.key = k;
    this.layout = layoutFor(w, h);
    this.grit = makeGritTile(128, 3);
    this.bake(w, h);
    const lw = Math.max(32, Math.round(w / 5));
    const lh = Math.max(18, Math.round(h / 5));
    const [lc, lx] = makeCanvas(lw, lh);
    this.lightmap = lc;
    this.lctx = lx;
    this.seedMotes(w, h);
  }

  private seedMotes(w: number, h: number): void {
    this.motes = [];
    for (let i = 0; i < 90; i++) {
      this.motes.push({
        x: hash2(i, 5) * w,
        y: hash2(i, 61) * h,
        z: 0.25 + hash2(i, 131) * 0.75,
        p: hash2(i, 211) * TAU,
      });
    }
  }

  // ==========================================================================
  // 烘焙
  // ==========================================================================

  private bake(w: number, h: number): void {
    const L = this.layout;
    const [cv, ctx] = makeCanvas(w, h);
    ctx.fillStyle = PALETTE.abyss;
    ctx.fillRect(0, 0, w, h);

    this.bakeWall(ctx, w, h);
    this.bakeRibs(ctx, w, h);
    this.bakePipes(ctx, w, h);
    this.bakeHatch(ctx, L);
    this.bakeCables(ctx, w, h);
    this.bakeDeck(ctx, w, h, L);

    // 锈迹与渍水盖在所有金属上
    const rust = makeRustLayer(w, h, 1201);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(rust, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();

    this.bakeStreaks(ctx, w, h);

    // 高频砂砾
    if (this.grit) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.55;
      const pat = ctx.createPattern(this.grit, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    this.baked = cv;

    // 前景层：操作台（在光照之后仍要压住场景，所以单独一张）
    const [fv, fctx] = makeCanvas(w, h);
    this.bakeConsole(fctx, w, h, L);
    if (this.grit) {
      fctx.save();
      fctx.globalCompositeOperation = 'overlay';
      fctx.globalAlpha = 0.4;
      const pat = fctx.createPattern(this.grit, 'repeat');
      if (pat) {
        fctx.fillStyle = pat;
        fctx.fillRect(0, L.consoleY - h * 0.02, w, h);
      }
      fctx.restore();
    }
    this.front = fv;
  }

  /** 钢板墙：水平拼板 + 焊缝 + 铆钉行 */
  private bakeWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const plateH = h * 0.145;
    for (let y = -plateH; y < h; y += plateH) {
      const idx = Math.round(y / plateH);
      const shade = 0.82 + hash2(idx, 7) * 0.36;
      const g = ctx.createLinearGradient(0, y, 0, y + plateH);
      g.addColorStop(0, shadeHex(PALETTE.steel, shade * 1.06));
      g.addColorStop(0.45, shadeHex(PALETTE.steelDark, shade));
      g.addColorStop(1, shadeHex('#0d1219', shade * 1.12));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, plateH);

      // 焊缝
      ctx.strokeStyle = 'rgba(0,0,0,0.62)';
      ctx.lineWidth = Math.max(1.5, h * 0.0026);
      ctx.beginPath();
      ctx.moveTo(0, y + plateH);
      ctx.lineTo(w, y + plateH);
      ctx.stroke();
      ctx.strokeStyle = rgba(PALETTE.steelLit, 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + plateH + 1.5);
      ctx.lineTo(w, y + plateH + 1.5);
      ctx.stroke();

      // 铆钉行
      const step = w * 0.0345;
      for (let x = step * 0.5; x < w; x += step) {
        rivet(ctx, x, y + plateH - h * 0.011, Math.max(1.8, h * 0.0044));
      }
    }

    // 竖向拼缝
    for (let i = 1; i < 6; i++) {
      const x = (w / 6) * i + (hash2(i, 13) - 0.5) * w * 0.02;
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      ctx.lineWidth = Math.max(1.2, h * 0.002);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  /** 舱壁肋骨：拱形钢梁，把「圆筒里面」这件事说清楚 */
  private bakeRibs(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const count = 4;
    for (let i = 0; i <= count; i++) {
      const x = (w / count) * i;
      const width = w * 0.052;
      const g = ctx.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.24, shadeHex(PALETTE.steelLit, 1.02));
      g.addColorStop(0.5, shadeHex(PALETTE.steel, 1.0));
      g.addColorStop(0.78, shadeHex(PALETTE.steelDark, 0.9));
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.save();
      ctx.beginPath();
      // 肋骨顶部向内弯
      ctx.moveTo(x - width / 2, h);
      ctx.lineTo(x - width / 2, h * 0.30);
      ctx.quadraticCurveTo(x - width / 2, h * 0.02, x - width / 2 + w * 0.045, -h * 0.05);
      ctx.lineTo(x + width / 2 + w * 0.045, -h * 0.05);
      ctx.quadraticCurveTo(x + width / 2, h * 0.02, x + width / 2, h * 0.30);
      ctx.lineTo(x + width / 2, h);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      // 肋骨上的铆钉
      for (let y = h * 0.05; y < h; y += h * 0.055) {
        rivet(ctx, x, y, Math.max(2, h * 0.005));
      }
    }

    // 顶部横梁
    const beamH = h * 0.075;
    const bg = ctx.createLinearGradient(0, 0, 0, beamH);
    bg.addColorStop(0, shadeHex(PALETTE.steelDark, 0.8));
    bg.addColorStop(0.6, shadeHex(PALETTE.steel, 0.95));
    bg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, beamH);
    for (let x = w * 0.02; x < w; x += w * 0.028) rivet(ctx, x, beamH * 0.62, Math.max(1.8, h * 0.0042));
  }

  /** 管线：水平主管 + 支管 + 法兰 + 阀门 + 保温包扎 */
  private bakePipes(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const runs = [
      { y: h * 0.105, r: h * 0.026, tone: PALETTE.steel, lag: false },
      { y: h * 0.165, r: h * 0.016, tone: PALETTE.rustDeep, lag: true },
      { y: h * 0.610, r: h * 0.032, tone: PALETTE.steelDark, lag: false },
      { y: h * 0.680, r: h * 0.014, tone: PALETTE.rustDim, lag: false },
    ];
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      pipeH(ctx, 0, w, run.y, run.r, run.tone);
      // 法兰
      for (let x = w * 0.09 + i * w * 0.03; x < w; x += w * 0.19) {
        flange(ctx, x, run.y, run.r);
      }
      // 保温包扎
      if (run.lag) {
        for (let x = w * 0.2; x < w; x += w * 0.33) {
          const lw = w * 0.07;
          ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
          ctx.fillRect(x, run.y - run.r * 1.5, lw, run.r * 3);
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 1;
          for (let k = 0; k < 7; k++) {
            const bx = x + (lw / 7) * k;
            ctx.beginPath();
            ctx.moveTo(bx, run.y - run.r * 1.5);
            ctx.lineTo(bx + lw * 0.05, run.y + run.r * 1.5);
            ctx.stroke();
          }
        }
      }
    }

    // 竖向支管，从顶梁下来接到主管
    const drops = [0.145, 0.285, 0.545, 0.815, 0.905];
    for (let i = 0; i < drops.length; i++) {
      const x = drops[i] * w;
      const r = h * 0.013 + hash2(i, 41) * h * 0.008;
      pipeV(ctx, x, h * 0.06, h * 0.62, r, i % 2 ? PALETTE.steel : PALETTE.rustDeep);
      valve(ctx, x, h * (0.30 + hash2(i, 83) * 0.18), r * 2.6);
    }
  }

  private bakeHatch(ctx: CanvasRenderingContext2D, L: InteriorLayout): void {
    const { cx, cy, r } = L.hatch;
    ctx.save();
    // 门框
    const fg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r * 1.22);
    fg.addColorStop(0, shadeHex(PALETTE.steelLit, 1.0));
    fg.addColorStop(0.62, shadeHex(PALETTE.steel, 0.9));
    fg.addColorStop(1, '#090d13');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, 0, TAU);
    ctx.fill();

    // 门板
    const dg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r);
    dg.addColorStop(0, shadeHex(PALETTE.steel, 1.05));
    dg.addColorStop(0.7, shadeHex(PALETTE.steelDark, 0.95));
    dg.addColorStop(1, '#0b1017');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = Math.max(2, r * 0.03);
    ctx.stroke();

    // 门框螺栓
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      rivet(ctx, cx + Math.cos(a) * r * 1.11, cy + Math.sin(a) * r * 1.11, r * 0.055);
    }

    // 手轮
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.42);
    ctx.strokeStyle = shadeHex(PALETTE.rustDim, 1.0);
    ctx.lineWidth = r * 0.085;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = r * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.52, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = shadeHex(PALETTE.rustDim, 0.9);
    ctx.lineWidth = r * 0.055;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
      ctx.stroke();
    }
    ctx.fillStyle = shadeHex(PALETTE.steelLit, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.11, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 舷窗：黑的，什么都看不见（GDD §0）
    const py = cy - r * 0.60;
    ctx.fillStyle = '#05080d';
    ctx.beginPath();
    ctx.arc(cx, py, r * 0.20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shadeHex(PALETTE.steelLit, 0.85);
    ctx.lineWidth = r * 0.045;
    ctx.stroke();

    // 门牌
    ctx.fillStyle = rgba(PALETTE.bloodDim, 0.9);
    ctx.fillRect(cx - r * 0.42, cy + r * 0.58, r * 0.84, r * 0.20);
    ctx.fillStyle = rgba(PALETTE.bone, 0.55);
    ctx.font = `600 ${Math.round(r * 0.13)}px "Consolas",ui-monospace,monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('D2 · 密封', cx, cy + r * 0.68);
    ctx.restore();
  }

  private bakeCables(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    for (let i = 0; i < 7; i++) {
      const x0 = (hash2(i, 301) * 0.9 + 0.05) * w;
      const span = w * (0.10 + hash2(i, 401) * 0.16);
      const y0 = h * (0.075 + hash2(i, 503) * 0.03);
      const sag = h * (0.03 + hash2(i, 601) * 0.075);
      const tone = i % 3 === 0 ? PALETTE.bloodDim : i % 3 === 1 ? '#161a12' : '#1c1713';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(2.5, h * 0.0075);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + span / 2, y0 + sag * 2, x0 + span, y0);
      ctx.stroke();
      ctx.strokeStyle = tone;
      ctx.lineWidth = Math.max(1.6, h * 0.005);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + span / 2, y0 + sag * 2, x0 + span, y0);
      ctx.stroke();
      // 高光
      ctx.strokeStyle = 'rgba(216,210,196,0.10)';
      ctx.lineWidth = Math.max(0.8, h * 0.0016);
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 1);
      ctx.quadraticCurveTo(x0 + span / 2, y0 + sag * 2 - 1.5, x0 + span, y0 - 1);
      ctx.stroke();
    }
  }

  /** 钢格栅甲板 */
  private bakeDeck(ctx: CanvasRenderingContext2D, w: number, h: number, L: InteriorLayout): void {
    const y0 = L.deckY;
    ctx.fillStyle = '#080c12';
    ctx.fillRect(0, y0, w, h - y0);
    const cell = Math.max(6, h * 0.012);
    ctx.strokeStyle = rgba(PALETTE.steel, 0.55);
    ctx.lineWidth = Math.max(1, h * 0.0022);
    for (let x = 0; x < w; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + cell * 0.3, h);
      ctx.stroke();
    }
    for (let y = y0; y < h; y += cell * 0.9) {
      ctx.strokeStyle = rgba(PALETTE.steelLit, 0.3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  /** 渍水痕：从铆钉与焊缝往下淌的深色条 */
  private bakeStreaks(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 110; i++) {
      const x = hash2(i, 701) * w;
      const y = hash2(i, 809) * h * 0.85;
      const len = h * (0.02 + Math.pow(hash2(i, 907), 2.2) * 0.30);
      const wid = Math.max(1, h * (0.0015 + hash2(i, 1009) * 0.006));
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.15, `rgba(150,116,88,${(0.55 + hash2(i, 1103) * 0.3).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, wid, len);
    }
    ctx.restore();

    // 明亮的水渍高光，让锈看起来是「湿的」
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const x = hash2(i, 1201) * w;
      const y = hash2(i, 1301) * h * 0.8;
      const len = h * (0.02 + hash2(i, 1409) * 0.16);
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, `rgba(110,130,150,${(0.05 + hash2(i, 1511) * 0.06).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, Math.max(1, h * 0.0018), len);
    }
    ctx.restore();
  }

  /** 操作台：玩家身体前方的那块钢，是「你在船里」的最强暗示 */
  private bakeConsole(ctx: CanvasRenderingContext2D, w: number, h: number, L: InteriorLayout): void {
    const y0 = L.consoleY;

    // 台面斜板
    const g = ctx.createLinearGradient(0, y0 - h * 0.01, 0, h);
    g.addColorStop(0, shadeHex(PALETTE.steelLit, 0.92));
    g.addColorStop(0.08, shadeHex(PALETTE.steel, 0.86));
    g.addColorStop(0.45, shadeHex(PALETTE.steelDark, 0.78));
    g.addColorStop(1, '#05080c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, h);
    ctx.lineTo(-w * 0.05, y0 + h * 0.035);
    ctx.quadraticCurveTo(w * 0.5, y0 - h * 0.030, w * 1.05, y0 + h * 0.035);
    ctx.lineTo(w * 1.05, h);
    ctx.closePath();
    ctx.fill();

    // 台沿高光
    ctx.strokeStyle = rgba(PALETTE.boneDim, 0.30);
    ctx.lineWidth = Math.max(1.5, h * 0.0028);
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, y0 + h * 0.035);
    ctx.quadraticCurveTo(w * 0.5, y0 - h * 0.030, w * 1.05, y0 + h * 0.035);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = Math.max(2, h * 0.004);
    ctx.beginPath();
    ctx.moveTo(-w * 0.05, y0 + h * 0.041);
    ctx.quadraticCurveTo(w * 0.5, y0 - h * 0.024, w * 1.05, y0 + h * 0.041);
    ctx.stroke();

    // 台面铆钉
    for (let x = w * 0.02; x < w; x += w * 0.032) {
      const t = x / w;
      const yy = y0 + h * 0.035 - Math.sin(t * Math.PI) * h * 0.062 + h * 0.018;
      rivet(ctx, x, yy, Math.max(1.8, h * 0.004));
    }

    // 左侧：一排扳动开关
    const swY = y0 + h * 0.105;
    for (let i = 0; i < 6; i++) {
      const x = w * 0.045 + i * w * 0.030;
      toggleSwitch(ctx, x, swY, h * 0.020, i % 3 === 0);
    }
    labelPlate(ctx, w * 0.035, swY + h * 0.048, w * 0.175, h * 0.030, '主配电 / MAIN BUS', h);

    // 中间：按钮矩阵
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 7; i++) {
        const x = w * 0.255 + i * w * 0.0265;
        const y = swY + r * h * 0.042;
        pushButton(ctx, x, y, h * 0.0145, (i + r) % 4 === 0 ? PALETTE.bloodDim : PALETTE.steelDark);
      }
    }
    labelPlate(ctx, w * 0.245, swY + h * 0.092, w * 0.190, h * 0.030, '声呐阵列 / SONAR ARRAY', h);

    // 右侧：纸带打印机
    const tapeX = w * 0.640;
    const tapeY = y0 + h * 0.080;
    ctx.fillStyle = '#0c1016';
    roundRect(ctx, tapeX, tapeY, w * 0.20, h * 0.105, h * 0.006);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.bone, 0.14);
    ctx.fillRect(tapeX + w * 0.016, tapeY + h * 0.020, w * 0.168, h * 0.062);
    ctx.strokeStyle = rgba(PALETTE.boneWhisper, 0.35);
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const yy = tapeY + h * 0.026 + i * h * 0.0068;
      ctx.beginPath();
      ctx.moveTo(tapeX + w * 0.020, yy);
      ctx.lineTo(tapeX + w * 0.020 + w * 0.14 * (0.35 + hash2(i, 55) * 0.6), yy);
      ctx.stroke();
    }
    labelPlate(ctx, tapeX, tapeY + h * 0.118, w * 0.20, h * 0.030, '深度记录仪 / DEPTH LOG', h);

    // 台面上的积尘与划痕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 50; i++) {
      const x = hash2(i, 1601) * w;
      const yy = y0 + h * 0.04 + hash2(i, 1709) * h * 0.20;
      const len = w * (0.005 + hash2(i, 1801) * 0.05);
      ctx.strokeStyle = `rgba(216,210,196,${(0.02 + hash2(i, 1901) * 0.05).toFixed(3)})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + len, yy + (hash2(i, 2003) - 0.5) * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ==========================================================================
  // 每帧
  // ==========================================================================

  draw(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const { w, h } = this.layout;
    if (!this.baked) return;
    const L = this.layout;

    // 舱壁在噪音高时会颤
    const shake = s.noise * s.noise * h * 0.006;
    const sx = shake ? (valueNoise2(s.time * 37, 0, 5) - 0.5) * shake : 0;
    const sy = shake ? (valueNoise2(0, s.time * 41, 9) - 0.5) * shake : 0;

    ctx.save();
    ctx.translate(sx, sy);

    // --- 1. 静态几何 ---
    ctx.drawImage(this.baked, 0, 0);

    // --- 2. 光照贴图（乘） ---
    this.buildLightmap(s);
    if (this.lightmap) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.lightmap, 0, 0, w, h);
      ctx.restore();
    }

    // --- 3. 前景操作台 ---
    if (this.front) {
      ctx.drawImage(this.front, 0, 0);
      // 台面也要被光照到，但比墙面亮一档（离光源近）
      if (this.lightmap) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.72;
        ctx.drawImage(this.lightmap, 0, L.consoleY - h * 0.05, w, h * 0.35, 0, L.consoleY - h * 0.05, w, h * 0.35);
        ctx.restore();
      }
    }

    // --- 4. 加性光：应急灯、屏幕溢光、手电光锥 ---
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.drawEmergencyLamp(ctx, s);
    this.drawScopeSpill(ctx, s);
    this.drawTorchCone(ctx, s);
    ctx.restore();

    // --- 5. 积水与倒影 ---
    if (s.flooding > 0.01) this.drawWater(ctx, s);

    // --- 6. 微粒 ---
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.drawMotes(ctx, s);
    this.drawDrips(ctx, s);
    ctx.restore();

    ctx.restore();
  }

  private buildLightmap(s: InteriorState): void {
    const lx = this.lctx;
    const lc = this.lightmap;
    if (!lx || !lc) return;
    const lw = lc.width;
    const lh = lc.height;
    const L = this.layout;
    const sx = lw / L.w;
    const sy = lh / L.h;

    // 环境底：深渊里几乎什么都没有
    const amb = 0.055 + s.power * 0.055;
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = `rgb(${Math.round(amb * 210)},${Math.round(amb * 232)},${Math.round(amb * 255)})`;
    lx.fillRect(0, 0, lw, lh);

    lx.globalCompositeOperation = 'lighter';

    // 应急灯（左上），闪烁
    const flick = lampFlicker(s.time, s.power);
    addLight(lx, L.w * 0.155 * sx, L.h * 0.095 * sy, L.h * 0.85 * sy, [1.0, 0.30, 0.22], 0.72 * flick * s.power);

    // 第二盏（右上），更冷更弱
    const flick2 = lampFlicker(s.time * 0.83 + 17, s.power);
    addLight(lx, L.w * 0.88 * sx, L.h * 0.115 * sy, L.h * 0.62 * sy, [0.85, 0.78, 0.72], 0.30 * flick2 * s.power);

    // 声呐屏辉光
    addLight(lx, L.scope.cx * sx, L.scope.cy * sy, L.scope.r * 2.35 * sx, [1.0, 0.62, 0.30], 0.60 * s.scopeGlow);

    // 手电：在玩家正前方偏下，随呼吸上下
    const tx = L.w * 0.50 * sx;
    const ty = (L.h * 0.56 + s.breathPhase * L.h * 0.012) * sy;
    addLight(lx, tx, ty, L.h * 1.05 * sy, [1.0, 0.88, 0.72], 0.82 * s.torch);

    lx.globalCompositeOperation = 'source-over';
  }

  private drawEmergencyLamp(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const L = this.layout;
    const flick = lampFlicker(s.time, s.power) * s.power;
    if (flick < 0.01) return;
    const x = L.w * 0.155;
    const y = L.h * 0.072;
    const r = L.h * 0.30;

    // 灯罩本体
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(PALETTE.bloodHot, 0.85 * flick));
    g.addColorStop(0.10, rgba(PALETTE.blood, 0.42 * flick));
    g.addColorStop(0.42, rgba(PALETTE.bloodDim, 0.14 * flick));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    // 光锥落到墙上
    ctx.save();
    ctx.globalAlpha = 0.28 * flick;
    const cone = ctx.createLinearGradient(x, y, x, y + L.h * 0.55);
    cone.addColorStop(0, rgba(PALETTE.blood, 0.55));
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - L.w * 0.02, y);
    ctx.lineTo(x + L.w * 0.02, y);
    ctx.lineTo(x + L.w * 0.16, y + L.h * 0.55);
    ctx.lineTo(x - L.w * 0.16, y + L.h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawScopeSpill(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const L = this.layout;
    const g = ctx.createRadialGradient(
      L.scope.cx, L.scope.cy, L.scope.r * 0.75,
      L.scope.cx, L.scope.cy, L.scope.r * 2.5,
    );
    g.addColorStop(0, rgba(PALETTE.rust, 0.11 * s.scopeGlow));
    g.addColorStop(0.5, rgba(PALETTE.rustDeep, 0.05 * s.scopeGlow));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.w, L.h);
  }

  /** 体积光：手电光锥 + 噪声调制的光柱 */
  private drawTorchCone(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    if (s.torch < 0.01) return;
    const L = this.layout;
    const ox = L.w * 0.50;
    const oy = L.h * 1.02;
    const aim = L.h * (0.34 + s.breathPhase * 0.010);
    const spread = L.w * 0.30;
    const intensity = s.torch * (0.92 + s.heartPulse * 0.08);

    ctx.save();
    // 主锥
    const g = ctx.createLinearGradient(ox, oy, ox, aim);
    g.addColorStop(0, rgba(PALETTE.ember, 0.14 * intensity));
    g.addColorStop(0.45, rgba(PALETTE.rustHot, 0.07 * intensity));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox - L.w * 0.055, oy);
    ctx.lineTo(ox + L.w * 0.055, oy);
    ctx.lineTo(ox + spread, aim);
    ctx.lineTo(ox - spread, aim);
    ctx.closePath();
    ctx.fill();

    // 光柱条纹：被灰尘打散的光
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const n = valueNoise2(t * 6, s.time * 0.35, 21);
      const xoff = (t - 0.5) * spread * 2 * 0.9;
      const a = 0.030 * intensity * (0.35 + n * 0.9);
      const rg = ctx.createLinearGradient(ox + xoff * 0.15, oy, ox + xoff, aim);
      rg.addColorStop(0, rgba(PALETTE.ember, a));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = rg;
      ctx.lineWidth = L.w * (0.012 + n * 0.022);
      ctx.beginPath();
      ctx.moveTo(ox + xoff * 0.15, oy);
      ctx.lineTo(ox + xoff, aim);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWater(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const L = this.layout;
    const { w, h } = L;
    const wy = h * (1.02 - 0.40 * clamp01(s.flooding));
    if (wy >= h - 2) return;

    // 倒影：把水面以上的画面翻下来，逐行做正弦位移
    const slices = 44;
    const sliceH = (h - wy) / slices;
    ctx.save();
    ctx.globalAlpha = 0.34;
    for (let i = 0; i < slices; i++) {
      const dy = wy + i * sliceH;
      const depth = i / slices;
      const srcY = clamp(wy - (dy - wy) * 0.92, 0, h - 1);
      const amp = (2 + depth * 14) * (0.5 + s.flooding);
      const off = Math.sin(s.time * 1.7 + depth * 9.1) * amp + Math.sin(s.time * 3.3 - depth * 15) * amp * 0.4;
      ctx.globalAlpha = 0.36 * (1 - depth * 0.75);
      ctx.drawImage(
        ctx.canvas,
        0, Math.max(0, srcY - sliceH), w, sliceH + 1,
        off, dy, w, sliceH + 1,
      );
    }
    ctx.restore();

    // 水体本身：越深越蓝越暗
    const wg = ctx.createLinearGradient(0, wy, 0, h);
    wg.addColorStop(0, 'rgba(10,20,32,0.42)');
    wg.addColorStop(0.5, 'rgba(6,12,22,0.70)');
    wg.addColorStop(1, 'rgba(3,6,12,0.92)');
    ctx.fillStyle = wg;
    ctx.fillRect(0, wy, w, h - wy);

    // 水面高光线
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const yy = wy + i * 2.5;
      ctx.strokeStyle = rgba(PALETTE.rustHot, (0.16 - i * 0.045) * (0.6 + s.scopeGlow * 0.6));
      ctx.lineWidth = 1.6 - i * 0.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yo =
          Math.sin(x * 0.014 + s.time * 1.9 + i) * 1.8 +
          Math.sin(x * 0.041 - s.time * 2.7) * 1.1 +
          valueNoise2(x * 0.01, s.time * 0.5, 3) * 2.2;
        if (x === 0) ctx.moveTo(x, yy + yo);
        else ctx.lineTo(x, yy + yo);
      }
      ctx.stroke();
    }

    // 波纹圈（滴水落点）
    for (const r of this.ripples) {
      ctx.strokeStyle = rgba(PALETTE.boneDim, r.a * 0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(r.x, wy + 2, r.r, r.r * 0.22, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // 漂浮物
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const bx = (hash2(i, 77) * 1.2 - 0.1) * w + Math.sin(s.time * 0.3 + i) * w * 0.012;
      const by = wy + 4 + hash2(i, 177) * (h - wy) * 0.35;
      const sz = 2 + hash2(i, 277) * 7;
      ctx.fillStyle = rgba(i % 4 === 0 ? PALETTE.boneWhisper : '#1a1410', 0.5);
      ctx.beginPath();
      ctx.ellipse(bx, by + Math.sin(s.time * 1.2 + i * 2) * 1.6, sz, sz * 0.42, hash2(i, 377) * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // 更新波纹
    for (const r of this.ripples) {
      r.r += 42 * s.dt;
      r.a -= 0.75 * s.dt;
    }
    this.ripples = this.ripples.filter((r) => r.a > 0);
  }

  private drawMotes(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const L = this.layout;
    const lit = s.torch * 0.8 + s.scopeGlow * 0.4;
    if (lit < 0.03) return;
    for (const m of this.motes) {
      const drift = Math.sin(s.time * 0.35 * m.z + m.p) * L.w * 0.012;
      const rise = ((s.time * 6 * m.z + m.p * 40) % (L.h + 40)) - 20;
      const y = (m.y + rise) % L.h;
      const x = m.x + drift;
      // 只有在光锥里的尘埃才可见
      const inCone = smoothstep(1 - Math.abs(x - L.w * 0.5) / (L.w * 0.34));
      const a = 0.16 * m.z * lit * inCone * (0.4 + 0.6 * Math.sin(s.time * 2 + m.p));
      if (a <= 0.004) continue;
      ctx.fillStyle = rgba(PALETTE.ember, a);
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + m.z * 1.5, 0, TAU);
      ctx.fill();
    }
  }

  private drawDrips(ctx: CanvasRenderingContext2D, s: InteriorState): void {
    const L = this.layout;
    this.dripTimer -= s.dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 0.35 + hash2(this.moteSeed++, 3) * 1.5;
      this.drips.push({
        x: hash2(this.moteSeed, 19) * L.w,
        y: L.h * (0.08 + hash2(this.moteSeed, 29) * 0.5),
        v: 0,
        life: 1,
        src: this.moteSeed,
      });
      if (this.drips.length > 14) this.drips.shift();
    }
    const wy = L.h * (1.02 - 0.40 * clamp01(s.flooding));
    for (const d of this.drips) {
      d.v += 900 * s.dt;
      d.y += d.v * s.dt;
      if (d.y > wy) {
        d.life = 0;
        this.ripples.push({ x: d.x, r: 2, a: 0.9 });
        if (this.ripples.length > 10) this.ripples.shift();
      }
      if (d.life <= 0) continue;
      const a = 0.35 * (s.torch * 0.7 + s.scopeGlow * 0.5 + 0.12);
      ctx.strokeStyle = rgba(PALETTE.boneDim, a);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x, d.y - Math.min(18, d.v * 0.022));
      ctx.stroke();
    }
    this.drips = this.drips.filter((d) => d.life > 0);
  }
}

// ============================================================================
// 零件画法
// ============================================================================

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, 0, x, y, r);
  g.addColorStop(0, 'rgba(126,136,148,0.95)');
  g.addColorStop(0.55, 'rgba(58,66,76,0.9)');
  g.addColorStop(1, 'rgba(8,12,18,0.95)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x + r * 0.18, y + r * 0.22, r * 0.62, 0, TAU);
  ctx.fill();
}

function pipeH(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, r: number, tone: string): void {
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.22, shadeHex(tone, 1.45));
  g.addColorStop(0.42, shadeHex(tone, 1.0));
  g.addColorStop(0.75, shadeHex(tone, 0.55));
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - r, x1 - x0, r * 2);
  ctx.strokeStyle = 'rgba(216,210,196,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y - r * 0.55);
  ctx.lineTo(x1, y - r * 0.55);
  ctx.stroke();
}

function pipeV(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, r: number, tone: string): void {
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.8)');
  g.addColorStop(0.25, shadeHex(tone, 1.4));
  g.addColorStop(0.45, shadeHex(tone, 1.0));
  g.addColorStop(0.8, shadeHex(tone, 0.5));
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y0, r * 2, y1 - y0);
}

function flange(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const fw = r * 0.55;
  const fh = r * 1.35;
  const g = ctx.createLinearGradient(0, y - fh, 0, y + fh);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.3, '#4a535e');
  g.addColorStop(0.6, '#2b323b');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(x - fw, y - fh, fw * 2, fh * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - fw, y - fh, fw * 2, fh * 2);
  rivet(ctx, x, y - fh * 0.62, Math.max(1.2, r * 0.18));
  rivet(ctx, x, y + fh * 0.62, Math.max(1.2, r * 0.18));
}

function valve(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = shadeHex(PALETTE.rustDim, 1.05);
  ctx.lineWidth = Math.max(1.6, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(0.8, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = shadeHex(PALETTE.rustDim, 0.85);
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.fillStyle = '#3c454f';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function toggleSwitch(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, up: boolean): void {
  ctx.fillStyle = '#0a0e14';
  roundRect(ctx, x - s * 0.55, y - s * 0.9, s * 1.1, s * 1.8, s * 0.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const g = ctx.createLinearGradient(x, y - s, x, y + s);
  g.addColorStop(0, '#8b949e');
  g.addColorStop(1, '#2b323b');
  ctx.strokeStyle = g;
  ctx.lineWidth = s * 0.32;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s * 0.12, y + (up ? -s * 0.75 : s * 0.75));
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function pushButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tone: string): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
  g.addColorStop(0, shadeHex(tone, 1.9));
  g.addColorStop(0.65, shadeHex(tone, 1.0));
  g.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(216,210,196,0.18)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.15, r * 0.55, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

function labelPlate(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  text: string, refH: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8,11,16,0.85)';
  roundRect(ctx, x, y, w, h, h * 0.18);
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.62);
  ctx.font = `500 ${Math.round(refH * 0.0165)}px "Consolas","SF Mono",ui-monospace,monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.4px';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.restore();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function addLight(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  color: readonly [number, number, number],
  intensity: number,
): void {
  if (intensity <= 0.002 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  const c = (m: number) => Math.round(clamp(color[m] * intensity * 255, 0, 255));
  g.addColorStop(0, `rgba(${c(0)},${c(1)},${c(2)},1)`);
  g.addColorStop(0.35, `rgba(${Math.round(c(0) * 0.45)},${Math.round(c(1) * 0.45)},${Math.round(c(2) * 0.45)},1)`);
  g.addColorStop(0.72, `rgba(${Math.round(c(0) * 0.12)},${Math.round(c(1) * 0.12)},${Math.round(c(2) * 0.12)},1)`);
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** 应急灯的闪烁：两个不同周期的噪声相乘，偶尔整灯掉一下 */
export function lampFlicker(t: number, power: number): number {
  if (power <= 0.001) return 0;
  const n1 = valueNoise2(t * 3.1, 0, 11);
  const n2 = valueNoise2(t * 11.7, 5, 23);
  const base = 0.72 + n1 * 0.28;
  const jitter = 0.88 + n2 * 0.12;
  const dropout = valueNoise2(t * 0.7, 9, 31) < 0.08 ? 0.18 : 1;
  return clamp01(base * jitter * dropout);
}

/** 按倍率调整一个 hex 的明度，用来给同一块金属做不同受光面 */
export function shadeHex(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const r = clamp(parseInt(h.slice(0, 2), 16) * k, 0, 255);
  const g = clamp(parseInt(h.slice(2, 4), 16) * k, 0, 255);
  const b = clamp(parseInt(h.slice(4, 6), 16) * k, 0, 255);
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
