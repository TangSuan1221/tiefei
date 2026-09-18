/**
 * 终端外壳 —— 六个工位共用的那层金属和玻璃。
 * ============================================================================
 * 每个工位都是「一块嵌在钢面板里的屏 + 一排贴着漆号的物理按钮」。
 * 这个形制是刻意统一的：玩家学会一个工位，就学会了全部六个，
 * 剩下的认知预算全部留给内容本身。
 *
 * 所有绘制都接受一个 refH（画布高度）做度量基准，这样在任何分辨率下
 * 比例都一致 —— 和 render/ 下的其余渲染器同一套规矩。
 */

import { clamp, clamp01, smoothstep } from '@/core/util';
import { hash2, valueNoise2 } from '@/core/rng';
import { PALETTE, rgba } from '@/render/palette';
import { rivet, roundRect, shadeHex } from '@/render/interior';
import { cjk, mono, tracked } from '@/ui/typography';

const TAU = Math.PI * 2;

// ============================================================================
// 命中测试
// ============================================================================

export interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class HitMap {
  private hits: Hit[] = [];

  clear(): void {
    this.hits.length = 0;
  }

  add(h: Hit): void {
    this.hits.push(h);
  }

  pick(x: number, y: number): string | null {
    // 倒序：后画的在上面
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return null;
  }

  rectOf(id: string): Hit | null {
    for (const h of this.hits) if (h.id === id) return h;
    return null;
  }
}

// ============================================================================
// 控件
// ============================================================================

export type ControlState = 'normal' | 'active' | 'danger' | 'disabled';

export interface Control {
  id: string;
  /** 键帽上的字符 */
  key: string;
  label: string;
  /** 第二行小字，写代价或后果 */
  hint?: string;
  state?: ControlState;
}

/**
 * 按钮排。这是玩家和整个游戏交互的唯一语法。
 *
 * 按钮是**物理**的：有键帽、有行程阴影、按下去会陷进去。不用悬浮态高亮，
 * 用一圈很浅的磷光 —— 悬浮高亮是网页控件的语言，不是潜艇的。
 */
export function drawControls(
  ctx: CanvasRenderingContext2D,
  hits: HitMap,
  x: number,
  y: number,
  w: number,
  h: number,
  controls: readonly Control[],
  hovered: string | null,
  time: number,
): void {
  if (!controls.length) return;
  const n = controls.length;
  const gap = h * 0.055;
  const bw = (w - gap * (n - 1)) / n;

  for (let i = 0; i < n; i++) {
    const c = controls[i];
    const bx = x + i * (bw + gap);
    const state = c.state ?? 'normal';
    const on = state === 'active';
    const off = state === 'disabled';
    const hot = hovered === c.id && !off;

    hits.add({ id: c.id, x: bx, y, w: bw, h });

    // 键帽本体
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (off) {
      g.addColorStop(0, '#171c23');
      g.addColorStop(1, '#0c1016');
    } else {
      g.addColorStop(0, shadeHex(PALETTE.steel, hot ? 1.22 : 1.02));
      g.addColorStop(0.55, shadeHex(PALETTE.steelDark, hot ? 1.14 : 0.96));
      g.addColorStop(1, '#0b1016');
    }
    ctx.fillStyle = g;
    roundRect(ctx, bx, y, bw, h, h * 0.13);
    ctx.fill();

    // 上沿高光 / 下沿投影：键帽的厚度
    ctx.strokeStyle = rgba(PALETTE.steelLit, off ? 0.14 : 0.42);
    ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.beginPath();
    ctx.moveTo(bx + h * 0.16, y + h * 0.02);
    ctx.lineTo(bx + bw - h * 0.16, y + h * 0.02);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.moveTo(bx + h * 0.13, y + h - h * 0.02);
    ctx.lineTo(bx + bw - h * 0.13, y + h - h * 0.02);
    ctx.stroke();

    // 状态色带：贴在键帽左侧的那条漆
    const band =
      state === 'danger' ? PALETTE.blood : on ? PALETTE.rust : off ? PALETTE.boneWhisper : PALETTE.rustDeep;
    const pulse = on ? 0.6 + Math.sin(time * 4.4) * 0.22 : state === 'danger' ? 0.55 + Math.sin(time * 7) * 0.3 : 0.32;
    ctx.fillStyle = rgba(band, off ? 0.16 : pulse);
    roundRect(ctx, bx + h * 0.10, y + h * 0.16, h * 0.085, h * 0.68, h * 0.04);
    ctx.fill();

    // 键号
    ctx.fillStyle = rgba(off ? PALETTE.boneWhisper : PALETTE.ember, off ? 0.3 : 0.85);
    ctx.font = mono(h * 0.30, 700);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.key, bx + h * 0.30, y + h * 0.42);

    // 标签
    ctx.fillStyle = rgba(off ? PALETTE.boneWhisper : PALETTE.bone, off ? 0.34 : 0.92);
    ctx.font = cjk(h * 0.27, 500);
    // 合并台按钮更密，文字限制在本键范围内，不能盖住旁边的操作。
    const textX = bx + h * 0.30;
    const textW = Math.max(1, bw - h * 0.40);
    ctx.fillText(c.label, textX, y + h * (c.hint ? 0.72 : 0.78), textW);

    if (c.hint) {
      ctx.fillStyle = rgba(PALETTE.boneWhisper, off ? 0.3 : 0.72);
      ctx.font = mono(h * 0.185, 400);
      ctx.fillText(c.hint, textX, y + h * 0.93, textW);
    }

    if (hot) {
      ctx.strokeStyle = rgba(PALETTE.rustHot, 0.55);
      ctx.lineWidth = Math.max(1, h * 0.022);
      roundRect(ctx, bx + 1, y + 1, bw - 2, h - 2, h * 0.13);
      ctx.stroke();
    }
  }
}

// ============================================================================
// 面板与屏幕
// ============================================================================

/** 嵌在舱壁上的钢面板：倒角、螺钉、编号 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  refH: number,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, shadeHex(PALETTE.steel, 1.06));
  g.addColorStop(0.35, shadeHex(PALETTE.steelDark, 0.98));
  g.addColorStop(1, '#0a0e14');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, refH * 0.008);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1.4, refH * 0.0022);
  ctx.stroke();

  const s = refH * 0.0075;
  const pad = refH * 0.016;
  rivet(ctx, x + pad, y + pad, s);
  rivet(ctx, x + w - pad, y + pad, s);
  rivet(ctx, x + pad, y + h - pad, s);
  rivet(ctx, x + w - pad, y + h - pad, s);
}

export interface ScreenOptions {
  /** 屏幕增益 0..1。断电时是 0 */
  gain: number;
  /** 磷光色偏，0 = 铁锈橙，1 = 骨白 */
  tone?: number;
  /** 扫描线密度，相对屏高 */
  scanline?: number;
  /** 信号噪点 0..1 */
  noise?: number;
  /** 画面扭曲 0..1 */
  warp?: number;
}

/**
 * CRT 屏：裁剪出一块微凸的玻璃，把内容画进去，然后压上扫描线、噪点、
 * 玻璃反光和边缘暗角。
 *
 * 「屏幕」和「画在屏幕位置上的图」的区别全在这几层后处理里。
 */
export function drawCRT(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  opts: ScreenOptions,
  content: (c: CanvasRenderingContext2D) => void,
): void {
  const gain = clamp01(opts.gain);
  const r = Math.min(w, h) * 0.055;

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();

  // 屏底：没通电的磷光是暗棕色，不是黑色
  ctx.fillStyle = gain > 0.02 ? '#0a0805' : '#07090c';
  ctx.fillRect(x, y, w, h);

  if (gain > 0.02) {
    ctx.save();
    ctx.globalAlpha = gain;
    ctx.translate(x, y);
    content(ctx);
    ctx.restore();
  }

  // 扫描线
  const step = Math.max(2, h * (opts.scanline ?? 0.0075));
  ctx.globalAlpha = 0.16 + gain * 0.12;
  ctx.fillStyle = '#000';
  for (let sy = y; sy < y + h; sy += step) ctx.fillRect(x, sy, w, step * 0.42);
  ctx.globalAlpha = 1;

  // 行同步不稳：一条缓慢上爬的亮带
  if (gain > 0.05) {
    const rollY = y + ((time * 0.11) % 1) * h;
    const rg = ctx.createLinearGradient(0, rollY - h * 0.05, 0, rollY + h * 0.05);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.5, `rgba(255,224,190,${0.035 * gain})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x, rollY - h * 0.05, w, h * 0.1);
  }

  // 噪点
  const nz = opts.noise ?? 0;
  if (nz > 0.01) {
    ctx.globalAlpha = nz * 0.5;
    for (let i = 0; i < 260 * nz; i++) {
      const px = x + hash2(i, Math.floor(time * 24)) * w;
      const py = y + hash2(i + 7, Math.floor(time * 24) + 3) * h;
      ctx.fillStyle = hash2(i, 99) > 0.5 ? 'rgba(255,220,180,0.9)' : 'rgba(0,0,0,0.9)';
      ctx.fillRect(px, py, Math.max(1, w * 0.0018), Math.max(1, h * 0.003));
    }
    ctx.globalAlpha = 1;
  }

  // 边缘暗角：CRT 的四角永远是暗的
  const vg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.30, x + w / 2, y + h / 2, Math.max(w, h) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);

  // 玻璃反光：左上一道很淡的斜条
  const sg = ctx.createLinearGradient(x, y, x + w * 0.62, y + h * 0.75);
  sg.addColorStop(0, 'rgba(206,222,240,0.055)');
  sg.addColorStop(0.42, 'rgba(206,222,240,0.012)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w, h);

  ctx.restore();

  // 屏框：玻璃比面板低一层
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.014);
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.3);
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.005);
  roundRect(ctx, x - ctx.lineWidth, y - ctx.lineWidth, w + ctx.lineWidth * 2, h + ctx.lineWidth * 2, r);
  ctx.stroke();
  ctx.restore();

  // 屏幕溢光：屏亮的时候会照亮它周围的钢
  if (gain > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const spill = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.4, x + w / 2, y + h / 2, Math.max(w, h) * 0.9);
    const tone = opts.tone ?? 0;
    spill.addColorStop(0, rgba(tone > 0.5 ? PALETTE.bone : PALETTE.rust, 0.075 * gain));
    spill.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spill;
    ctx.fillRect(x - w * 0.3, y - h * 0.3, w * 1.6, h * 1.6);
    ctx.restore();
  }
}

// ============================================================================
// 零件
// ============================================================================

/** 指示灯。真的会烧坏 —— on=false 时灯泡本身还在，只是不亮 */
export function drawLamp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  on: number,
  hex: string,
): void {
  ctx.save();
  // 灯座
  ctx.fillStyle = '#0a0d12';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.4);
  ctx.lineWidth = Math.max(1, r * 0.18);
  ctx.stroke();

  // 灯泡
  ctx.fillStyle = on > 0.02 ? rgba(hex, 0.35 + on * 0.6) : 'rgba(40,34,30,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  if (on > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4.2);
    g.addColorStop(0, rgba(hex, 0.55 * on));
    g.addColorStop(0.3, rgba(hex, 0.16 * on));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 4.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 铭牌：蚀刻在铝片上的一行字 */
export function drawNameplate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  code: string,
  name: string,
): void {
  ctx.save();
  ctx.fillStyle = '#12161d';
  roundRect(ctx, x, y, w, h, h * 0.16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(PALETTE.rust, 0.85);
  ctx.font = mono(h * 0.46, 700);
  tracked(ctx, code, x + h * 0.4, y + h * 0.52, h * 0.06);
  const cw = ctx.measureText(code).width + h * 0.5;

  ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
  ctx.font = cjk(h * 0.42, 500);
  tracked(ctx, name, x + h * 0.4 + cw, y + h * 0.52, h * 0.05);
  ctx.restore();
}

/** 模拟指针表 */
export function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  value01: number,
  label: string,
  opts?: { danger?: number; time?: number },
): void {
  const v = clamp01(value01);
  const danger = opts?.danger ?? 0.2;
  const t = opts?.time ?? 0;
  ctx.save();

  // 表盘
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#1b2028');
  g.addColorStop(0.7, '#10141a');
  g.addColorStop(1, '#070a0e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.45);
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.stroke();

  // 刻度
  const a0 = Math.PI * 0.78;
  const a1 = Math.PI * 2.22;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    const major = i % 5 === 0;
    ctx.strokeStyle = rgba(i / 10 < danger ? PALETTE.blood : PALETTE.boneDim, major ? 0.8 : 0.4);
    ctx.lineWidth = major ? Math.max(1.4, r * 0.05) : Math.max(1, r * 0.028);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * (major ? 0.68 : 0.76), cy + Math.sin(a) * r * (major ? 0.68 : 0.76));
    ctx.lineTo(cx + Math.cos(a) * r * 0.87, cy + Math.sin(a) * r * 0.87);
    ctx.stroke();
  }

  // 危险区弧
  ctx.strokeStyle = rgba(PALETTE.blood, 0.5);
  ctx.lineWidth = Math.max(1.6, r * 0.07);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.80, a0, a0 + (a1 - a0) * danger);
  ctx.stroke();

  // 指针：低于危险线时会抖
  const jitter = v < danger ? (valueNoise2(t * 19, 0, 3) - 0.5) * 0.06 : 0;
  const a = a0 + (a1 - a0) * v + jitter;
  ctx.strokeStyle = rgba(v < danger ? PALETTE.bloodHot : PALETTE.ember, 0.95);
  ctx.lineWidth = Math.max(1.6, r * 0.065);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(a) * r * 0.16, cy - Math.sin(a) * r * 0.16);
  ctx.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
  ctx.stroke();
  ctx.fillStyle = shadeHex(PALETTE.steelLit, 0.9);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.10, 0, TAU);
  ctx.fill();

  // 表盘玻璃
  const gl = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r);
  gl.addColorStop(0, 'rgba(210,226,244,0.10)');
  gl.addColorStop(0.5, 'rgba(210,226,244,0.02)');
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();

  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
  ctx.font = mono(r * 0.3, 500);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + r * 0.44);
  ctx.restore();
}

/** 横向拨杆（推力、增益这类） */
export function drawLever(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  notches: readonly string[],
  index: number,
): void {
  ctx.save();
  // 槽
  ctx.fillStyle = '#05080c';
  roundRect(ctx, x, y + h * 0.36, w, h * 0.28, h * 0.14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.stroke();

  const n = notches.length;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (let i = 0; i < n; i++) {
    const px = x + (w / (n - 1)) * i;
    ctx.strokeStyle = rgba(PALETTE.boneWhisper, 0.5);
    ctx.lineWidth = Math.max(1, h * 0.022);
    ctx.beginPath();
    ctx.moveTo(px, y + h * 0.28);
    ctx.lineTo(px, y + h * 0.36);
    ctx.stroke();
    ctx.fillStyle = rgba(i === index ? PALETTE.ember : PALETTE.boneWhisper, i === index ? 0.9 : 0.5);
    ctx.font = mono(h * 0.2, i === index ? 700 : 400);
    ctx.fillText(notches[i], px, y + h * 0.22);
  }

  // 手柄
  const hx = x + (w / (n - 1)) * clamp(index, 0, n - 1);
  const g = ctx.createLinearGradient(hx - h * 0.14, 0, hx + h * 0.14, 0);
  g.addColorStop(0, shadeHex(PALETTE.rustDeep, 1.4));
  g.addColorStop(0.4, shadeHex(PALETTE.rustDim, 1.2));
  g.addColorStop(1, '#2a1207');
  ctx.fillStyle = g;
  roundRect(ctx, hx - h * 0.14, y + h * 0.20, h * 0.28, h * 0.60, h * 0.1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = Math.max(1, h * 0.025);
  ctx.stroke();
  ctx.restore();
}

/** 屏内的那种细横条读数（不是七段管，是「一行字 + 一条填充」） */
export function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  v01: number,
  hex: string,
  label?: string,
  refH = 1000,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = rgba(hex, 0.8);
  ctx.fillRect(x, y, w * clamp01(v01), h);
  // 分格
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 20; i++) {
    const px = x + (w / 20) * i;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) {
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.75);
    ctx.font = mono(refH * 0.016, 500);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y - refH * 0.005);
  }
  ctx.restore();
}

/** 屏内标题：一行带下划线的小标题 */
export function screenTitle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  text: string,
  refH: number,
  hex = PALETTE.rustHot,
): void {
  ctx.save();
  ctx.fillStyle = rgba(hex, 0.85);
  ctx.font = mono(refH * 0.019, 700);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  tracked(ctx, text, x, y, refH * 0.004);
  ctx.strokeStyle = rgba(hex, 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + refH * 0.008);
  ctx.lineTo(x + w, y + refH * 0.008);
  ctx.stroke();
  ctx.restore();
}

/** 危险斜条纹，贴在会伤到你的东西旁边 */
export function hazardStripe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  phase = 0,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(10,8,6,0.85)';
  ctx.fillRect(x, y, w, h);
  const step = h * 1.6;
  ctx.fillStyle = rgba(PALETTE.rustDim, 0.55);
  for (let px = x - h * 2 + ((phase * step) % step); px < x + w + h * 2; px += step) {
    ctx.beginPath();
    ctx.moveTo(px, y + h);
    ctx.lineTo(px + h, y);
    ctx.lineTo(px + h * 1.8, y);
    ctx.lineTo(px + h * 0.8, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 把一个 0..1 的值画成「还剩多久」的环。警报倒计时用 */
export function drawFuseRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  v01: number,
  time: number,
): void {
  const v = clamp01(v01);
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = r * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();

  const urgency = 1 - v;
  const flash = 0.7 + Math.sin(time * (4 + urgency * 14)) * 0.3 * urgency;
  ctx.strokeStyle = rgba(v > 0.45 ? PALETTE.rust : PALETTE.bloodHot, 0.55 + flash * 0.4);
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * v);
  ctx.stroke();
  ctx.restore();
}

/** 小工具：把一个 0..1 映射成会呼吸的透明度 */
export function breathe(time: number, speed = 2.2, base = 0.6, amp = 0.4): number {
  return base + Math.sin(time * speed) * amp;
}

export { smoothstep };
