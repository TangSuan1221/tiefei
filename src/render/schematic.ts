/**
 * 舱段剖面显示器 —— 操作台右侧的第二块屏
 * ============================================================================
 * 声呐屏给你「周围有什么」，剖面屏给你「你在船的哪一层」。
 * 两块屏加起来才是 GDD §8.1 说的「双层视图」。
 *
 * 它消费 contract 的 Room[]，并且**会撒谎**：
 *   - phantom 房间画出来跟真的一样，只是边框会以 0.7 Hz 微微呼吸（可识破的 tell）
 *   - unstable 门用虚线，重织发生时会瞬间重画
 *   - corruption 高时会多画一个不存在的房间
 */

import type { ID, Room } from '../core/contract';
import { hash2, valueNoise2 } from '../core/rng';
import { clamp01 } from '../core/util';
import { PALETTE, phosphor, rgba } from './palette';
import { roundRect, shadeHex } from './interior';

const TAU = Math.PI * 2;

const DECK_NAMES = ['生活层', '机械层', '指挥层', '圣所层', '月池层'];
const DECK_CODES = ['D1', 'D2', 'D3', 'D4', 'D5'];

export interface SchematicState {
  rooms: readonly Room[];
  currentRoomId: ID;
  time: number;
  depth: number;
  flooding: number;
  corruption: number;
  power: number;
  /** 最近一次声呐揭示的房间，会亮一下 */
  highlighted: readonly ID[];
}

export class SchematicDisplay {
  private frame: HTMLCanvasElement | null = null;
  private key = '';

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: SchematicState): void {
    this.ensureFrame(w, h);
    ctx.save();
    ctx.translate(x, y);

    // 面板外壳
    if (this.frame) ctx.drawImage(this.frame, 0, 0);

    const pad = h * 0.10;
    const ix = pad * 0.8;
    const iy = pad * 0.95;
    const iw = w - pad * 1.6;
    const ih = h - pad * 1.75;

    // 屏底
    const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, '#080e15');
    g.addColorStop(0.55, '#050a10');
    g.addColorStop(1, '#03060b');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);

    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();

    const on = clamp01(s.power * 1.4);
    if (on > 0.02) {
      this.drawContents(ctx, ix, iy, iw, ih, s, on);
    }

    // 屏幕扫描行
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = '#000';
    for (let yy = iy; yy < iy + ih; yy += 3) ctx.fillRect(ix, yy, iw, 1.4);
    ctx.globalAlpha = 1;

    // 玻璃反光
    const spec = ctx.createLinearGradient(ix, iy, ix + iw * 0.7, iy + ih);
    spec.addColorStop(0, 'rgba(216,210,196,0.055)');
    spec.addColorStop(0.4, 'rgba(216,210,196,0.008)');
    spec.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(ix, iy, iw, ih);

    ctx.restore();
    ctx.restore();
  }

  private drawContents(
    ctx: CanvasRenderingContext2D,
    ix: number, iy: number, iw: number, ih: number,
    s: SchematicState, on: number,
  ): void {
    const flick = 0.92 + valueNoise2(s.time * 6, 3, 17) * 0.08;
    const a = on * flick;

    // --- 标题行 ---
    ctx.fillStyle = rgba(PALETTE.rust, 0.72 * a);
    ctx.font = `600 ${Math.round(ih * 0.062)}px "Consolas","SF Mono",ui-monospace,monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px';
    ctx.fillText('KYRIE-9 · 舱段剖面', ix + iw * 0.030, iy + ih * 0.085);
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.62 * a);
    ctx.font = `400 ${Math.round(ih * 0.052)}px "Consolas",ui-monospace,monospace`;
    ctx.fillText(`-${s.depth.toFixed(0)} m`, ix + iw * 0.97, iy + ih * 0.085);

    ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.6 * a);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.030, iy + ih * 0.115);
    ctx.lineTo(ix + iw * 0.970, iy + ih * 0.115);
    ctx.stroke();

    // --- 甲板带 ---
    const top = iy + ih * 0.165;
    const bottom = iy + ih * 0.935;
    const bandH = (bottom - top) / 5;
    const left = ix + iw * 0.120;
    const right = ix + iw * 0.965;

    const rooms = s.rooms;
    // 归一化 pos.x 到面板宽度
    let minX = Infinity;
    let maxX = -Infinity;
    for (const r of rooms) {
      if (r.pos.x < minX) minX = r.pos.x;
      if (r.pos.x > maxX) maxX = r.pos.x;
    }
    if (!isFinite(minX) || maxX - minX < 1e-6) {
      minX = 0;
      maxX = 1;
    }
    const nx = (v: number) => left + ((v - minX) / (maxX - minX)) * (right - left - iw * 0.04) + iw * 0.02;

    // 水位
    const waterTop = bottom - (bottom - top) * clamp01(s.flooding * 1.15);
    if (s.flooding > 0.01) {
      ctx.fillStyle = 'rgba(18,44,72,0.28)';
      ctx.fillRect(ix, waterTop, iw, bottom - waterTop + ih * 0.02);
      ctx.strokeStyle = rgba('#2a6f9e', 0.5 * a);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ix; x <= ix + iw; x += 6) {
        const yo = Math.sin(x * 0.06 + s.time * 2.1) * 1.4;
        if (x === ix) ctx.moveTo(x, waterTop + yo);
        else ctx.lineTo(x, waterTop + yo);
      }
      ctx.stroke();
    }

    for (let d = 0; d < 5; d++) {
      const by = top + d * bandH;
      // 甲板线
      ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.5 * a);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(left - iw * 0.02, by + bandH);
      ctx.lineTo(right, by + bandH);
      ctx.stroke();
      ctx.setLineDash([]);

      // 层号
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.72 * a);
      ctx.font = `600 ${Math.round(bandH * 0.30)}px "Consolas",ui-monospace,monospace`;
      ctx.fillText(DECK_CODES[d], ix + iw * 0.030, by + bandH * 0.48);
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.40 * a);
      ctx.font = `400 ${Math.round(bandH * 0.235)}px "Microsoft YaHei","Noto Sans SC",sans-serif`;
      ctx.fillText(DECK_NAMES[d], ix + iw * 0.030, by + bandH * 0.80);
    }

    // --- 连线（门） ---
    const byId = new Map<ID, Room>();
    for (const r of rooms) byId.set(r.id, r);
    ctx.lineWidth = 1.2;
    for (const r of rooms) {
      if (!r.mapped && !r.visited) continue;
      const ax = nx(r.pos.x);
      const ay = top + (r.deck - 1 + 0.5) * bandH;
      for (const door of r.doors) {
        const o = byId.get(door.to);
        if (!o || (!o.mapped && !o.visited)) continue;
        const bx = nx(o.pos.x);
        const by2 = top + (o.deck - 1 + 0.5) * bandH;
        ctx.strokeStyle = rgba(door.unstable ? PALETTE.blood : PALETTE.rustDim, (door.unstable ? 0.45 : 0.34) * a);
        ctx.setLineDash(door.unstable ? [3, 3] : []);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        if (Math.abs(r.deck - o.deck) > 0) {
          ctx.bezierCurveTo(ax, (ay + by2) / 2, bx, (ay + by2) / 2, bx, by2);
        } else {
          ctx.lineTo(bx, by2);
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // --- 房间 ---
    for (const r of rooms) {
      if (!r.mapped && !r.visited) continue;
      const cx = nx(r.pos.x);
      const cy = top + (r.deck - 1 + 0.5) * bandH;
      const isCurrent = r.id === s.currentRoomId;
      const isHot = s.highlighted.includes(r.id);
      const phantom = r.veracity === 'phantom';
      // tell：幻觉房间的边框以 0.7 Hz 呼吸
      const breath = phantom ? 0.55 + 0.45 * Math.sin(s.time * TAU * 0.7 + r.pos.x) : 1;
      const size = bandH * (isCurrent ? 0.30 : 0.22);

      let tone: string = r.visited ? PALETTE.rust : PALETTE.rustDeep;
      if (r.veracity === 'unstable') tone = PALETTE.bloodDim;
      const alpha = (r.visited ? 0.85 : 0.45) * a * breath * (isHot ? 1.25 : 1);

      ctx.save();
      if (isCurrent || isHot) {
        ctx.shadowBlur = bandH * 0.42;
        ctx.shadowColor = rgba(PALETTE.ember, 0.75 * a);
      }
      ctx.fillStyle = rgba(tone, alpha * 0.30);
      ctx.strokeStyle = rgba(isCurrent ? PALETTE.bone : tone, clamp01(alpha));
      ctx.lineWidth = isCurrent ? 1.8 : 1.1;
      roundRect(ctx, cx - size, cy - size * 0.62, size * 2, size * 1.24, size * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 噪音溢出：房间在发烫
      const noiseN = clamp01(r.noise / Math.max(1, r.noiseThreshold));
      if (noiseN > 0.15) {
        ctx.strokeStyle = rgba(PALETTE.bloodHot, noiseN * 0.55 * a);
        ctx.lineWidth = 1 + noiseN * 2;
        roundRect(ctx, cx - size * 1.25, cy - size * 0.85, size * 2.5, size * 1.7, size * 0.25);
        ctx.stroke();
      }

      if (isCurrent) {
        const p = 0.45 + 0.55 * Math.abs(Math.sin(s.time * 2.4));
        ctx.fillStyle = rgba(PALETTE.bone, p * a);
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.30, 0, TAU);
        ctx.fill();
      }
    }

    // --- 污染：多画一个不存在的舱 ---
    if (s.corruption > 0.32) {
      const ghostX = nx(minX + (maxX - minX) * (0.5 + 0.35 * Math.sin(s.time * 0.21)));
      const ghostY = top + (3 + 0.5) * bandH;
      const gA = clamp01((s.corruption - 0.32) / 0.4) * (0.35 + 0.30 * Math.sin(s.time * 1.7)) * a;
      ctx.strokeStyle = rgba(PALETTE.bone, gA);
      ctx.lineWidth = 1.2;
      const gs = bandH * 0.22;
      roundRect(ctx, ghostX - gs, ghostY - gs * 0.62, gs * 2, gs * 1.24, gs * 0.22);
      ctx.stroke();
      ctx.fillStyle = rgba(PALETTE.bone, gA * 0.8);
      ctx.font = `400 ${Math.round(bandH * 0.20)}px "Consolas",ui-monospace,monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('???', ghostX, ghostY + bandH * 0.42);
    }

    // --- 底部状态条 ---
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55 * a);
    ctx.font = `400 ${Math.round(ih * 0.046)}px "Consolas",ui-monospace,monospace`;
    const mapped = rooms.filter((r) => r.mapped || r.visited).length;
    ctx.fillText(`已测绘 ${mapped}/${rooms.length}`, ix + iw * 0.030, iy + ih * 0.985);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(s.flooding > 0.5 ? PALETTE.bloodHot : PALETTE.boneWhisper, 0.55 * a);
    ctx.fillText(`水位 ${(s.flooding * 100).toFixed(0)}%`, ix + iw * 0.970, iy + ih * 0.985);
  }

  private ensureFrame(w: number, h: number): void {
    const k = `${Math.round(w)}x${Math.round(h)}`;
    if (k === this.key && this.frame) return;
    this.key = k;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    const ctx = cv.getContext('2d')!;

    // 外壳
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, shadeHex(PALETTE.steelLit, 0.92));
    g.addColorStop(0.35, shadeHex(PALETTE.steel, 0.85));
    g.addColorStop(1, shadeHex(PALETTE.steelDark, 0.7));
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, w, h, h * 0.045);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 内陷阴影
    const pad = h * 0.10;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundRect(ctx, pad * 0.62, pad * 0.78, w - pad * 1.24, h - pad * 1.45, h * 0.02);
    ctx.fill();

    // 螺钉
    const screws: [number, number][] = [
      [pad * 0.34, pad * 0.40],
      [w - pad * 0.34, pad * 0.40],
      [pad * 0.34, h - pad * 0.40],
      [w - pad * 0.34, h - pad * 0.40],
    ];
    for (let i = 0; i < screws.length; i++) {
      const [sx, sy] = screws[i];
      const r = h * 0.030;
      const sg = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, 0, sx, sy, r);
      sg.addColorStop(0, '#78828e');
      sg.addColorStop(0.6, '#39424c');
      sg.addColorStop(1, '#0b1016');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.3;
      const a = hash2(i, 91) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(a) * r * 0.6, sy - Math.sin(a) * r * 0.6);
      ctx.lineTo(sx + Math.cos(a) * r * 0.6, sy + Math.sin(a) * r * 0.6);
      ctx.stroke();
    }

    this.frame = cv;
  }
}

/**
 * 压力表组 —— 操作台右下的一排仪表。
 * 与 HUD 上那只氧气表不同：这几只是**船的**仪表，不是面罩投影，所以有金属反光。
 */
export interface GaugeReading {
  label: string;
  /** 0..1 */
  value: number;
  /** 红区起点 0..1 */
  danger?: number;
  unit?: string;
  /** 指针抖动幅度 */
  jitter?: number;
}

export function drawGaugeCluster(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  readings: readonly GaugeReading[],
  time: number,
  lightLevel: number,
): void {
  const n = Math.max(1, readings.length);
  const gw = w / n;
  for (let i = 0; i < n; i++) {
    drawGauge(ctx, x + gw * i + gw * 0.5, y + h * 0.46, Math.min(gw * 0.40, h * 0.40), readings[i], time + i * 1.7, lightLevel);
  }
}

export function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  g: GaugeReading,
  time: number,
  lightLevel: number,
): void {
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.save();

  // 表壳
  const body = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, 0, cx, cy, r * 1.22);
  body.addColorStop(0, shadeHex(PALETTE.steelLit, 1.0));
  body.addColorStop(0.62, shadeHex(PALETTE.steel, 0.82));
  body.addColorStop(1, '#070b11');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.22, 0, TAU);
  ctx.fill();

  // 表盘
  const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
  face.addColorStop(0, '#12161d');
  face.addColorStop(0.7, '#0a0e14');
  face.addColorStop(1, '#05080c');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  // 红区
  if (g.danger !== undefined) {
    ctx.strokeStyle = rgba(PALETTE.blood, 0.75);
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, start + sweep * g.danger, start + sweep);
    ctx.stroke();
  }

  // 刻度
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const a = start + sweep * t;
    const major = i % 5 === 0;
    const len = major ? r * 0.20 : r * 0.10;
    ctx.strokeStyle = rgba(PALETTE.boneDim, major ? 0.8 : 0.4);
    ctx.lineWidth = major ? Math.max(1.2, r * 0.045) : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86);
    ctx.lineTo(cx + Math.cos(a) * (r * 0.86 - len), cy + Math.sin(a) * (r * 0.86 - len));
    ctx.stroke();
  }

  // 标签
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.7);
  ctx.font = `600 ${Math.round(r * 0.26)}px "Consolas",ui-monospace,monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.label, cx, cy + r * 0.42);

  // 指针：抖
  const jitter = (g.jitter ?? 0.012) * (0.5 + valueNoise2(time * 9, 1, 7));
  const v = clamp01(g.value) + (valueNoise2(time * 7.3, 3, 13) - 0.5) * jitter;
  const a = start + sweep * clamp01(v);
  const inDanger = g.danger !== undefined && v >= g.danger;
  ctx.save();
  ctx.shadowBlur = r * 0.35;
  ctx.shadowColor = rgba(inDanger ? PALETTE.bloodHot : PALETTE.bone, 0.5);
  ctx.strokeStyle = rgba(inDanger ? PALETTE.bloodHot : PALETTE.bone, 0.95);
  ctx.lineWidth = Math.max(1.4, r * 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.16, cy - Math.sin(a) * r * 0.16);
  ctx.lineTo(cx + Math.cos(a) * r * 0.76, cy + Math.sin(a) * r * 0.76);
  ctx.stroke();
  ctx.restore();

  // 轴心
  ctx.fillStyle = shadeHex(PALETTE.steelLit, 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.10, 0, TAU);
  ctx.fill();

  // 玻璃反光
  const spec = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.4);
  spec.addColorStop(0, `rgba(216,210,196,${(0.10 + lightLevel * 0.10).toFixed(3)})`);
  spec.addColorStop(0.45, 'rgba(216,210,196,0.012)');
  spec.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  // 表圈
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}