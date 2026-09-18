/**
 * HUD —— 面罩内壁的投影
 * ============================================================================
 * GDD §8.3 的铁律：HUD 不是浮层。它是投在面罩内侧那层曲面玻璃上的光。
 * 所以：
 *   - 它被画在**独立的 canvas** 上，交给 post.ts 用**比场景更强的曲率**去弯，
 *     并单独吃色差、划痕、反光与起雾。玩家能看出「那层玻璃离眼睛很近」。
 *   - 所有元素都是**发光的细线**，不是实心色块。投影没有不透明的东西。
 *   - 氧气是**压力表指针**，不是数字条。指针会抖 —— 因为你的手在抖。
 *   - 低 SAN 时 HUD 自己撒谎：数值漂移、标签被替换、指针指错、多出一行读数。
 *     **没有任何提示。** 玩家只能靠交叉验证（表针 vs 数码管）自己发现不对。
 */

import type { LogTone, StatusEffect, Vitals } from '../core/contract';
import { clamp, clamp01, damp, lerp, smoothstep } from '../core/util';
import { hash2, valueNoise2 } from '../core/rng';
import { PALETTE, rgba } from '../render/palette';
import { roundRect } from '../render/interior';
import {
  cjk, clearTracking, drawSegText, mono, segWidth, setTracking, tracked,
} from './typography';

const TAU = Math.PI * 2;

export interface HudLogLine {
  text: string;
  tone: LogTone;
  /** 出现时刻（秒），用于淡出 */
  at: number;
}

export interface HudState {
  /** 真实生理值 */
  vitals: Vitals;
  /** 玩家「感知到的」值。VitalsSystem.perceived() 的输出，有则优先显示 */
  perceived?: Vitals;
  /** Veracity 污染 0..1 */
  corruption: number;
  depth: number;
  /** 面朝方位（弧度，0 = 船首） */
  bearing: number;
  /** 当前房间噪音 0..1 */
  noise: number;
  breath: { fullness: number; holding: boolean; holdTime: number };
  statuses: readonly StatusEffect[];
  log: readonly HudLogLine[];
  time: number;
  dt: number;
  /** 供电 0..1，断电时 HUD 会掉 */
  power: number;
}

/** 低 SAN 时 HUD 会把标签换成这些。它们都「差不多对」，所以更难发现。 */
const LABEL_LIES: Record<string, string[]> = {
  氧气: ['储气', '余量', '氧气'],
  深度: ['深度', '压强', '标高'],
  噪音: ['噪音', '回响', '声压'],
  体温: ['体温', '舱温'],
  理智: ['理智', '共鸣', '清明'],
};

export class HudRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

  // 平滑跟随的显示量 —— 指针不能瞬移
  private needleO2 = 1;
  private needleVel = 0;
  private noiseShown = 0;
  private noisePeak = 0;
  private noisePeakAt = 0;
  private sanTrace: number[] = new Array(96).fill(0);
  private traceAcc = 0;
  private bootT = 0;
  private lieSeed = 0;
  private lieUntil = 0;
  private activeLie: 'needle' | 'number' | 'label' | 'ghost' | null = null;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    const c = this.canvas.getContext('2d', { alpha: true });
    if (!c) throw new Error('[hud] 无法获取 2D 上下文');
    this.ctx = c;
  }

  /** 面板层画在同一张 HUD canvas 上，这样它们共享同一层玻璃曲率 */
  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  resize(w: number, h: number): void {
    const iw = Math.max(16, Math.round(w));
    const ih = Math.max(9, Math.round(h));
    if (iw === this.w && ih === this.h) return;
    this.w = iw;
    this.h = ih;
    this.canvas.width = iw;
    this.canvas.height = ih;
  }

  render(s: HudState): void {
    const ctx = this.ctx;
    const { w, h } = this;
    if (!w || !h) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.bootT = Math.min(1, this.bootT + s.dt * 0.55);
    const power = clamp01(s.power * 1.2);
    if (power < 0.03) return;

    // 谎言调度：每隔一段时间挑一种撒法，持续几秒
    this.updateLies(s);

    const shown = s.perceived ?? s.vitals;
    const v = s.vitals;

    ctx.save();
    // 投影本身有一点点抖动（面罩在头上，头在动）
    const jx = (valueNoise2(s.time * 1.3, 0, 41) - 0.5) * h * 0.0022;
    const jy = (valueNoise2(0, s.time * 1.1, 53) - 0.5) * h * 0.0022;
    ctx.translate(jx, jy);
    ctx.globalAlpha = smoothstep(this.bootT) * power;

    this.drawScrim(ctx);
    this.drawFrame(ctx, s);
    this.drawOxygenGauge(ctx, s, shown, v);
    this.drawBreath(ctx, s);
    this.drawDepth(ctx, s, shown);
    this.drawSanScope(ctx, s, shown);
    this.drawBearingTape(ctx, s);
    this.drawNoiseMeter(ctx, s);
    this.drawStatuses(ctx, s);
    this.drawLog(ctx, s);
    this.drawVitalsStrip(ctx, s, shown);

    ctx.restore();
  }

  // ==========================================================================
  // 谎言层
  // ==========================================================================

  private updateLies(s: HudState): void {
    if (s.time > this.lieUntil) {
      const c = clamp01(s.corruption);
      if (c > 0.14 && hash2(Math.floor(s.time * 3), this.lieSeed) < c * 0.06) {
        this.lieSeed++;
        const pool: ('needle' | 'number' | 'label' | 'ghost')[] =
          c > 0.5 ? ['needle', 'number', 'label', 'ghost'] : ['number', 'label'];
        this.activeLie = pool[Math.floor(hash2(this.lieSeed, 7) * pool.length) % pool.length];
        this.lieUntil = s.time + lerp(2.5, 9, hash2(this.lieSeed, 11));
      } else {
        this.activeLie = null;
      }
    }
  }

  private lieNumber(raw: number, s: HudState, key: number): number {
    if (this.activeLie !== 'number' && this.activeLie !== 'ghost') return raw;
    const mag = 2 + s.corruption * 9;
    return raw + (hash2(this.lieSeed, key) - 0.5) * 2 * mag;
  }

  private lieLabel(raw: string): string {
    if (this.activeLie !== 'label') return raw;
    const pool = LABEL_LIES[raw];
    if (!pool) return raw;
    return pool[Math.floor(hash2(this.lieSeed, 23) * pool.length) % pool.length];
  }

  // ==========================================================================
  // 元件
  // ==========================================================================

  /** 面罩边框：四角的定位括号 + 一条极淡的投影栅格。它界定「屏幕」的存在。 */
  /**
   * 熏黑层。
   * 面罩上正对读数的那几块玻璃是熏过的 —— 真实的潜水面罩与飞行头盔都这么做，
   * 否则背后的舱壁会把细线读数吃干净。这是 HUD 可读性的全部秘密：
   * 不要把字画得更亮，要把字背后的东西压暗。
   */
  private drawScrim(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    // [中心x(×w), 中心y(×h), 半宽(×h), 半高(×h), 强度]
    const zones: [number, number, number, number, number][] = [
      [0.118, 0.780, 0.26, 0.22, 0.66],   // 氧气压力表
      [0.118, 0.105, 0.40, 0.13, 0.58],   // 理智示波器
      [0.115, 0.440, 0.36, 0.26, 0.50],   // 状态 + 日志
      [0.900, 0.105, 0.22, 0.13, 0.58],   // 深度
      [0.885, 0.845, 0.26, 0.08, 0.54],   // 噪音表
      [0.500, 0.960, 0.46, 0.055, 0.50],  // 底部生理条
    ];
    ctx.save();
    for (const [nx, ny, rxN, ryN, a] of zones) {
      const cx = w * nx;
      const cy = h * ny;
      const rx = h * rxN;
      const ry = h * ryN;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1);
      g.addColorStop(0, rgba(PALETTE.abyss, a));
      g.addColorStop(0.55, rgba(PALETTE.abyss, a * 0.72));
      g.addColorStop(1, rgba(PALETTE.abyss, 0));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawFrame(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const m = h * 0.035;
    const L = h * 0.045;
    ctx.strokeStyle = rgba(PALETTE.rust, 0.34);
    ctx.lineWidth = Math.max(1, h * 0.0016);
    const corners: [number, number, number, number][] = [
      [m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
      ctx.stroke();
    }

    // 中心极小的准星 —— 让玩家的视线有一个默认落点
    ctx.strokeStyle = rgba(PALETTE.bone, 0.16);
    const c = h * 0.010;
    ctx.beginPath();
    ctx.moveTo(w / 2 - c, h * 0.5); ctx.lineTo(w / 2 - c * 0.35, h * 0.5);
    ctx.moveTo(w / 2 + c * 0.35, h * 0.5); ctx.lineTo(w / 2 + c, h * 0.5);
    ctx.moveTo(w / 2, h * 0.5 - c); ctx.lineTo(w / 2, h * 0.5 - c * 0.35);
    ctx.moveTo(w / 2, h * 0.5 + c * 0.35); ctx.lineTo(w / 2, h * 0.5 + c);
    ctx.stroke();

    // 投影栅格：只在角落，暗示这是一块有像素的投影面
    ctx.strokeStyle = rgba(PALETTE.rust, 0.05);
    ctx.lineWidth = 1;
    const step = h * 0.028;
    for (let i = 0; i < 6; i++) {
      const y = m + i * step;
      ctx.beginPath();
      ctx.moveTo(m, y);
      ctx.lineTo(m + L * (1 - i / 7), y);
      ctx.stroke();
    }
  }

  /**
   * 氧气压力表。
   * 指针用弹簧-阻尼跟随目标，且叠加了呼吸与恐惧驱动的手抖 —— 这是 GDD 点名的细节。
   */
  private drawOxygenGauge(
    ctx: CanvasRenderingContext2D, s: HudState, shown: Vitals, real: Vitals,
  ): void {
    const { w, h } = this;
    const cx = w * 0.118;
    const cy = h * 0.780;
    const r = h * 0.108;

    const trueRatio = clamp01(real.oxygen / Math.max(1, real.oxygenMax));
    let target = clamp01(shown.oxygen / Math.max(1, shown.oxygenMax));
    // 指针撒谎：它指向一个不存在的读数，但数码管是对的
    if (this.activeLie === 'needle') {
      target = clamp01(target + (hash2(this.lieSeed, 31) - 0.5) * 0.34);
    }

    // 弹簧跟随 + 手抖
    const k = 26;
    const damping = 7.2;
    const dt = Math.min(s.dt, 0.05);
    this.needleVel += (target - this.needleO2) * k * dt - this.needleVel * damping * dt;
    this.needleO2 += this.needleVel * dt;
    const fearN = clamp01(real.fear / 100);
    const tremor =
      (valueNoise2(s.time * 13, 0, 3) - 0.5) * (0.004 + fearN * 0.016) +
      (valueNoise2(s.time * 3.1, 7, 5) - 0.5) * 0.006;
    const shownRatio = clamp(this.needleO2 + tremor, 0, 1);

    const start = Math.PI * 0.76;
    const sweep = Math.PI * 1.48;
    const low = trueRatio < 0.22;

    ctx.save();

    // 表盘轮廓：双圈，外圈虚线
    ctx.strokeStyle = rgba(PALETTE.rust, 0.42);
    ctx.lineWidth = Math.max(1, h * 0.0018);
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = rgba(PALETTE.rust, 0.20);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.14, start, start + sweep);
    ctx.stroke();
    ctx.setLineDash([]);

    // 红区
    ctx.strokeStyle = rgba(PALETTE.bloodHot, low ? 0.55 + 0.25 * Math.sin(s.time * 6) : 0.38);
    ctx.lineWidth = Math.max(2, h * 0.0055);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.93, start, start + sweep * 0.22);
    ctx.stroke();

    // 刻度
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const a = start + sweep * t;
      const major = i % 5 === 0;
      const len = major ? r * 0.20 : r * 0.10;
      ctx.strokeStyle = rgba(PALETTE.bone, major ? 0.62 : 0.28);
      ctx.lineWidth = major ? Math.max(1.4, h * 0.0022) : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = rgba(PALETTE.boneDim, 0.55);
        ctx.font = mono(h * 0.0155, 500);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(i * 5),
          cx + Math.cos(a) * (r - len - h * 0.017),
          cy + Math.sin(a) * (r - len - h * 0.017),
        );
      }
    }

    // 指针
    const na = start + sweep * shownRatio;
    ctx.save();
    ctx.shadowBlur = h * 0.012;
    ctx.shadowColor = rgba(low ? PALETTE.bloodHot : PALETTE.bone, 0.8);
    ctx.strokeStyle = rgba(low ? PALETTE.bloodHot : PALETTE.bone, 0.95);
    ctx.lineWidth = Math.max(1.6, h * 0.0028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(na) * r * 0.16, cy - Math.sin(na) * r * 0.16);
    ctx.lineTo(cx + Math.cos(na) * r * 0.82, cy + Math.sin(na) * r * 0.82);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = rgba(PALETTE.bone, 0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.045, 0, TAU);
    ctx.fill();

    // 标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(PALETTE.rustHot, 0.78);
    ctx.font = cjk(h * 0.0195, 500);
    setTracking(ctx, h * 0.004);
    ctx.fillText(this.lieLabel('氧气'), cx, cy - r * 0.42);
    clearTracking(ctx);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
    ctx.font = mono(h * 0.0145, 400);
    ctx.fillText('O₂  BAR', cx, cy - r * 0.22);

    // 数码管读数：剩余呼吸数换算成分秒
    const breaths = Math.max(0, this.lieNumber(shown.oxygen, s, 3));
    const mm = Math.floor(breaths / 60);
    const ss = Math.floor(breaths % 60);
    const txt = `${mm.toString().padStart(2, '0')}.${ss.toString().padStart(2, '0')}`;
    const segH = h * 0.042;
    const tw = segWidth(txt, segH);
    drawSegText(ctx, txt, cx - tw / 2, cy + r * 0.30, segH, {
      on: rgba(low ? PALETTE.bloodHot : PALETTE.ember, 0.95),
      off: rgba(PALETTE.rustDeep, 0.20),
      glow: h * 0.010,
      skew: 0.09,
    }, this.activeLie === 'ghost' ? (i) => (i === 1 ? 0b1111011 : 0b1111111) : undefined);

    // 幽灵读数：一行几乎看不见的、不同的数字
    if (this.activeLie === 'ghost') {
      ctx.globalAlpha *= 0.22;
      const gt = `${((mm + 3) % 100).toString().padStart(2, '0')}.${((ss + 17) % 60).toString().padStart(2, '0')}`;
      drawSegText(ctx, gt, cx - tw / 2 + h * 0.004, cy + r * 0.30 + h * 0.003, segH, {
        on: rgba(PALETTE.bone, 0.9),
        off: 'rgba(0,0,0,0)',
        skew: 0.09,
      });
      ctx.globalAlpha /= 0.22;
    }

    ctx.restore();
  }

  /** 呼吸指示：一条会胀缩的弧 + 屏息计时。它就在准星下方，永远在余光里。 */
  private drawBreath(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const cx = w * 0.5;
    const cy = h * 0.905;
    const r = h * 0.052;
    const fill = clamp01(s.breath.fullness);
    const holding = s.breath.holding;

    ctx.save();
    // 底弧
    ctx.strokeStyle = rgba(PALETTE.rust, 0.22);
    ctx.lineWidth = Math.max(1.5, h * 0.0030);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    // 充盈弧
    const span = Math.PI * 0.76;
    const strain = holding ? clamp01(s.breath.holdTime / 14) : 0;
    ctx.strokeStyle = rgba(
      strain > 0.7 ? PALETTE.bloodHot : holding ? PALETTE.ember : PALETTE.bone,
      0.85,
    );
    ctx.lineWidth = Math.max(2.2, h * 0.0046);
    ctx.lineCap = 'round';
    ctx.shadowBlur = h * 0.012;
    ctx.shadowColor = rgba(holding ? PALETTE.bloodHot : PALETTE.ember, 0.6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.12, Math.PI * 1.12 + span * fill);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 屏息时整条弧在颤
    if (holding) {
      const shake = strain * h * 0.004;
      for (let i = 0; i < 3; i++) {
        const o = (valueNoise2(s.time * 24 + i * 9, 0, 13) - 0.5) * shake;
        ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.18 * strain);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx + o, cy + o, r + i * 2, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(holding ? PALETTE.bloodHot : PALETTE.boneWhisper, 0.72);
    ctx.font = cjk(h * 0.0175, 500);
    setTracking(ctx, h * 0.006);
    ctx.fillText(holding ? '屏息' : '呼吸', cx, cy + r * 0.28);
    clearTracking(ctx);
    if (holding) {
      ctx.font = mono(h * 0.020, 600);
      ctx.fillStyle = rgba(PALETTE.bloodHot, 0.85);
      ctx.fillText(`${s.breath.holdTime.toFixed(1)}s`, cx, cy + r * 0.28 + h * 0.024);
    }
    ctx.restore();
  }

  /** 深度与压强：右上角，最大的一组数字 */
  private drawDepth(ctx: CanvasRenderingContext2D, s: HudState, shown: Vitals): void {
    const { w, h } = this;
    const right = w * 0.955;
    const top = h * 0.062;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = rgba(PALETTE.rustHot, 0.72);
    ctx.font = cjk(h * 0.0195, 500);
    setTracking(ctx, h * 0.005);
    ctx.fillText(this.lieLabel('深度'), right, top);
    clearTracking(ctx);

    const d = Math.max(0, this.lieNumber(s.depth, s, 9));
    const txt = `-${Math.round(d).toString().padStart(4, '0')}`;
    const segH = h * 0.062;
    const tw = segWidth(txt, segH);
    drawSegText(ctx, txt, right - tw, top + h * 0.014, segH, {
      on: rgba(PALETTE.ember, 0.92),
      off: rgba(PALETTE.rustDeep, 0.18),
      glow: h * 0.012,
    });
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.6);
    ctx.font = mono(h * 0.0165, 400);
    ctx.fillText('METRES', right, top + h * 0.096);

    // 压强条
    const atm = 1 + d / 10.06;
    const bx = right - w * 0.135;
    const by = top + h * 0.112;
    const bw = w * 0.135;
    const bh = h * 0.0075;
    ctx.strokeStyle = rgba(PALETTE.rust, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    const p = clamp01(atm / 210);
    ctx.fillStyle = rgba(p > 0.8 ? PALETTE.bloodHot : PALETTE.rustHot, 0.7);
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * p, bh - 2);
    for (let i = 1; i < 6; i++) {
      const x = bx + (bw / 6) * i;
      ctx.strokeStyle = rgba(PALETTE.abyss, 0.9);
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.lineTo(x, by + bh);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
    ctx.font = mono(h * 0.0145, 400);
    ctx.fillText(`${atm.toFixed(1)} ATM`, right, by + bh + h * 0.020);
    ctx.restore();
  }

  /**
   * 理智示波器。SAN 不是条 —— 它是一条波形：
   * 清明时是平静的窦性节律，低 SAN 时开始出现不属于这条线的尖峰。
   */
  private drawSanScope(ctx: CanvasRenderingContext2D, s: HudState, shown: Vitals): void {
    const { w, h } = this;
    const x = w * 0.045;
    const y = h * 0.062;
    const bw = w * 0.205;
    const bh = h * 0.088;

    const sanN = clamp01(shown.san / Math.max(1, shown.sanMax));
    const mad = 1 - sanN;

    // 推进轨迹
    this.traceAcc += s.dt;
    const stepT = 1 / 70;
    while (this.traceAcc > stepT) {
      this.traceAcc -= stepT;
      const t = s.time;
      // 基线：缓慢的窦性波
      let v = Math.sin(t * 2.1) * 0.18 + Math.sin(t * 5.3) * 0.06;
      // 疯狂度越高，噪声与突刺越多
      v += (valueNoise2(t * 40, 0, 17) - 0.5) * mad * 1.5;
      if (hash2(Math.floor(t * 70), 29) < mad * 0.09) v += (hash2(Math.floor(t * 70), 31) - 0.5) * 3.2 * mad;
      this.sanTrace.push(clamp(v, -1.6, 1.6));
      if (this.sanTrace.length > 96) this.sanTrace.shift();
    }

    ctx.save();
    // 框
    ctx.strokeStyle = rgba(PALETTE.rust, 0.30);
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, bw, bh, h * 0.004);
    ctx.stroke();
    // 中线
    ctx.strokeStyle = rgba(PALETTE.rust, 0.14);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y + bh * 0.62);
    ctx.lineTo(x + bw, y + bh * 0.62);
    ctx.stroke();
    ctx.setLineDash([]);

    // 波形
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, bw - 2, bh - 2);
    ctx.clip();
    ctx.strokeStyle = rgba(mad > 0.6 ? PALETTE.bloodHot : PALETTE.ember, 0.85);
    ctx.lineWidth = Math.max(1.1, h * 0.0018);
    ctx.shadowBlur = h * 0.008;
    ctx.shadowColor = rgba(mad > 0.6 ? PALETTE.bloodHot : PALETTE.ember, 0.7);
    ctx.beginPath();
    const n = this.sanTrace.length;
    for (let i = 0; i < n; i++) {
      const px = x + (i / (n - 1)) * bw;
      const py = y + bh * 0.62 - this.sanTrace[i] * bh * 0.30;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // 标题与读数
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(PALETTE.rustHot, 0.72);
    ctx.font = cjk(h * 0.0185, 500);
    setTracking(ctx, h * 0.005);
    ctx.fillText(this.lieLabel('理智'), x, y - h * 0.010);
    clearTracking(ctx);

    ctx.textAlign = 'right';
    ctx.font = mono(h * 0.0175, 600);
    const sanShown = Math.round(clamp(this.lieNumber(shown.san, s, 17), 0, 999));
    ctx.fillStyle = rgba(mad > 0.7 ? PALETTE.bloodHot : PALETTE.boneDim, 0.85);
    ctx.fillText(`${sanShown}`, x + bw, y - h * 0.010);
    ctx.font = mono(h * 0.013, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.5);
    ctx.fillText(mad > 0.88 ? 'RESONANCE' : mad > 0.5 ? 'DRIFT' : 'LUCID', x + bw, y + bh + h * 0.017);
    ctx.restore();
  }

  /** 方位带：顶部中央的一条尺。它让「转向」这件事有了物理反馈。 */
  private drawBearingTape(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const cx = w * 0.5;
    const y = h * 0.072;
    const half = w * 0.13;
    const degPerPx = 0.19;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - half, y - h * 0.024, half * 2, h * 0.044);
    ctx.clip();

    const bearingDeg = ((s.bearing * 180) / Math.PI + 360) % 360;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (let d = -70; d <= 70; d += 5) {
      const deg = bearingDeg + d;
      const px = cx + d / degPerPx;
      if (px < cx - half || px > cx + half) continue;
      const major = Math.round(deg) % 30 === 0 || Math.abs(Math.round(deg) % 30) < 0.5;
      const fade = 1 - Math.abs(d) / 78;
      ctx.strokeStyle = rgba(PALETTE.bone, (major ? 0.55 : 0.22) * fade);
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(px, y - h * 0.008);
      ctx.lineTo(px, y - h * 0.008 + (major ? h * 0.012 : h * 0.006));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = rgba(PALETTE.boneDim, 0.55 * fade);
        ctx.font = mono(h * 0.0135, 500);
        ctx.fillText((((Math.round(deg) % 360) + 360) % 360).toString().padStart(3, '0'), px, y + h * 0.016);
      }
    }
    ctx.restore();

    // 中央指标
    ctx.fillStyle = rgba(PALETTE.ember, 0.9);
    ctx.beginPath();
    ctx.moveTo(cx, y - h * 0.013);
    ctx.lineTo(cx - h * 0.006, y - h * 0.022);
    ctx.lineTo(cx + h * 0.006, y - h * 0.022);
    ctx.closePath();
    ctx.fill();
  }

  /** 噪音表：VU 段 + 峰值保持。超过阈值它会变红并闪 —— 这是 GDD §4.3 的生命线。 */
  private drawNoiseMeter(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const x = w * 0.775;
    const y = h * 0.845;
    const bw = w * 0.180;
    const bh = h * 0.020;

    this.noiseShown = damp(this.noiseShown, clamp01(s.noise), 9, Math.min(s.dt, 0.05));
    if (this.noiseShown >= this.noisePeak) {
      this.noisePeak = this.noiseShown;
      this.noisePeakAt = s.time;
    } else if (s.time - this.noisePeakAt > 1.1) {
      this.noisePeak = Math.max(this.noiseShown, this.noisePeak - s.dt * 0.55);
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(PALETTE.rustHot, 0.72);
    ctx.font = cjk(h * 0.0185, 500);
    setTracking(ctx, h * 0.005);
    ctx.fillText(this.lieLabel('噪音'), x, y - h * 0.012);
    clearTracking(ctx);

    const segs = 24;
    const sw = bw / segs;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const lit = this.noiseShown >= t - 0.001;
      const danger = t > 0.72;
      const col = danger ? PALETTE.bloodHot : t > 0.5 ? PALETTE.rustHot : PALETTE.rust;
      const a = lit ? (danger ? 0.92 : 0.72) : 0.11;
      ctx.fillStyle = rgba(col, a);
      ctx.fillRect(x + i * sw, y, sw * 0.68, bh * (0.55 + t * 0.45));
    }
    // 峰值保持
    const pi = Math.round(this.noisePeak * (segs - 1));
    ctx.fillStyle = rgba(PALETTE.bone, 0.85);
    ctx.fillRect(x + pi * sw, y - h * 0.003, sw * 0.68, bh * (0.55 + (pi / (segs - 1)) * 0.45) + h * 0.006);

    // 阈值刻线
    const tx = x + 0.72 * bw;
    ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.75);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tx, y - h * 0.006);
    ctx.lineTo(tx, y + bh + h * 0.006);
    ctx.stroke();

    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.5);
    ctx.font = mono(h * 0.0135, 400);
    ctx.fillText('dB  REL', x, y + bh + h * 0.022);
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(this.noiseShown > 0.72 ? PALETTE.bloodHot : PALETTE.boneDim, 0.8);
    ctx.font = mono(h * 0.0165, 600);
    ctx.fillText(`${Math.round(this.noiseShown * 120)}`, x + bw, y + bh + h * 0.022);
    ctx.restore();
  }

  /** 状态效果：左侧竖排的小牌子。hidden 的不显示 —— 那正是欺骗层的一部分。 */
  private drawStatuses(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const x = w * 0.045;
    let y = h * 0.200;
    const rowH = h * 0.032;

    ctx.save();
    ctx.textBaseline = 'middle';
    let shown = 0;
    for (const st of s.statuses) {
      if (st.hidden) continue;
      if (shown >= 8) break;
      const bad = st.tags.includes('debuff') || st.tags.includes('terminal');
      const col = bad ? PALETTE.bloodHot : st.tags.includes('buff') ? PALETTE.ember : PALETTE.boneDim;
      // 左侧色条
      ctx.fillStyle = rgba(col, 0.75);
      ctx.fillRect(x, y - rowH * 0.32, h * 0.0035, rowH * 0.64);
      // 名称
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(col, 0.86);
      ctx.font = cjk(h * 0.0175, 500);
      ctx.fillText(st.name, x + h * 0.012, y);
      // 层数
      if (st.stacks > 1) {
        ctx.font = mono(h * 0.0145, 600);
        ctx.fillStyle = rgba(PALETTE.bone, 0.7);
        ctx.fillText(`×${st.stacks}`, x + h * 0.012 + ctx.measureText(st.name).width + h * 0.09, y);
      }
      // 剩余时间条
      if (st.duration > 0) {
        const bw = w * 0.055;
        const t = clamp01(st.duration / 60);
        ctx.fillStyle = rgba(col, 0.16);
        ctx.fillRect(x + h * 0.012, y + rowH * 0.30, bw, h * 0.0022);
        ctx.fillStyle = rgba(col, 0.6);
        ctx.fillRect(x + h * 0.012, y + rowH * 0.30, bw * t, h * 0.0022);
      }
      y += rowH;
      shown++;
    }
    ctx.restore();
  }

  /** 日志：左下角滚动的一小摞行，最新的最亮。不是聊天框，是「你注意到的东西」。 */
  private drawLog(ctx: CanvasRenderingContext2D, s: HudState): void {
    const { w, h } = this;
    const x = w * 0.045;
    const base = h * 0.610;
    const rowH = h * 0.0265;
    const maxRows = 6;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lines = s.log.slice(-maxRows);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const age = s.time - l.at;
      const fade = clamp01(1 - (age - 9) / 4);
      const depth = 1 - (lines.length - 1 - i) / maxRows;
      const a = fade * (0.28 + depth * 0.62);
      if (a <= 0.02) continue;
      const col =
        l.tone === 'bad' ? PALETTE.bloodHot
        : l.tone === 'good' ? PALETTE.ember
        : l.tone === 'eerie' ? PALETTE.rustHot
        : l.tone === 'whisper' ? PALETTE.boneWhisper
        : l.tone === 'system' ? PALETTE.rust
        : PALETTE.boneDim;
      const y = base - (lines.length - 1 - i) * rowH;
      // 行首记号
      ctx.fillStyle = rgba(col, a * 0.6);
      ctx.fillRect(x, y - h * 0.0018, h * 0.0075, h * 0.0036);
      ctx.fillStyle = rgba(col, a);
      ctx.font = l.tone === 'whisper' ? cjk(h * 0.0175, 300) : cjk(h * 0.0178, 400);
      if (l.tone === 'whisper') ctx.font = cjk(h * 0.0172, 300);
      ctx.fillText(l.text, x + h * 0.016, y);
    }
    ctx.restore();
  }

  /** 生理副读数：体温 / CO₂ / 感染 / 外伤，一行紧凑的工业排版 */
  private drawVitalsStrip(ctx: CanvasRenderingContext2D, s: HudState, shown: Vitals): void {
    const { w, h } = this;
    const x = w * 0.262;
    const y = h * 0.930;

    const items: [string, string, number, number][] = [
      ['CO₂', `${Math.round(clamp(this.lieNumber(shown.co2, s, 41), 0, 999))}`, clamp01(shown.co2 / 100), 0.7],
      [this.lieLabel('体温'), `${shown.coreTemp.toFixed(1)}°`, clamp01((37 - shown.coreTemp) / 5), 0.6],
      ['感染', `${Math.round(shown.infection)}`, clamp01(shown.infection / 100), 0.5],
      ['外伤', `${Math.round(shown.trauma)}`, clamp01(shown.trauma / 100), 0.5],
      ['恐惧', `${Math.round(shown.fear)}`, clamp01(shown.fear / 100), 0.85],
    ];

    ctx.save();
    ctx.textBaseline = 'middle';
    let cx = x;
    for (const [label, value, level, dangerAt] of items) {
      const danger = level >= dangerAt;
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.62);
      ctx.font = cjk(h * 0.0155, 400);
      ctx.fillText(label, cx, y);
      const lw = ctx.measureText(label).width;
      ctx.font = mono(h * 0.0185, 600);
      ctx.fillStyle = rgba(danger ? PALETTE.bloodHot : PALETTE.boneDim, danger ? 0.95 : 0.78);
      ctx.fillText(value, cx + lw + h * 0.008, y);
      const vw = ctx.measureText(value).width;
      // 小竖条
      const barX = cx + lw + h * 0.008 + vw + h * 0.008;
      ctx.fillStyle = rgba(danger ? PALETTE.bloodHot : PALETTE.rust, 0.20);
      ctx.fillRect(barX, y - h * 0.010, h * 0.0030, h * 0.020);
      ctx.fillStyle = rgba(danger ? PALETTE.bloodHot : PALETTE.rustHot, 0.8);
      ctx.fillRect(barX, y + h * 0.010 - h * 0.020 * level, h * 0.0030, h * 0.020 * level);
      cx = barX + h * 0.028;
    }

    // 轮回计数，极小，右对齐 —— 这行字是给第二周目的玩家看的
    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.32);
    ctx.font = mono(h * 0.0135, 400);
    tracked(ctx, 'KYRIE-9 / IRONLUNG MAZE', w * 0.955, h * 0.968, h * 0.004);
    ctx.restore();
  }
}
