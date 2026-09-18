/**
 * 声呐 PPI 屏（Plan Position Indicator）
 * ============================================================================
 * 玩家 80% 的时间在看这块屏。它必须有真正的雷达质感，而不是「一条转动的线」。
 *
 * 做对的几件事：
 *  1. 磷光余辉是**独立的累积缓冲**，扫描线扫过时往里「烧」，之后按指数衰减。
 *     不是每帧重画目标 —— 那样永远得不到残留拖尾。
 *  2. 目标**只在扫描线扫过它的那一瞬间**被点亮。没扫到就是黑的，这是 PPI 的灵魂。
 *  3. 回波是**弧**不是点。房间的墙面朝向你，回波就是一段弧；越近的目标弧越宽。
 *  4. 海杂波（clutter）也由扫描线刷出来，近处密、远处疏 —— 这是真实设备的行为。
 *  5. 玻璃、金属圈、铆钉、刻字都画，屏幕才「长在船上」而不是浮在空中。
 */

import { hash2, valueNoise2 } from '../core/rng';
import { clamp, clamp01, damp, smoothstep } from '../core/util';
import { PALETTE, phosphor, rgba } from './palette';

export type ContactKind = 'hull' | 'room' | 'door' | 'anomaly' | 'artifact' | 'listener' | 'wreck';

export interface SonarContact {
  id: string;
  /** 方位，弧度。0 = 正前（屏幕正上方），顺时针增加 */
  bearing: number;
  /** 归一化距离 0..1 */
  range: number;
  /** 回波强度 0..1 */
  strength: number;
  /** 回波的角宽度（弧度）。墙面宽，点目标窄 */
  arc: number;
  kind: ContactKind;
  label?: string;
}

/**
 * 近场阴影地图的一个扇区。
 *
 * 和 SonarContact 不同：回波是扫描线扫过才亮一下的**事件**，阴影是一直在那儿的
 * **地形**。近距离上声呐给不出细节，只给得出「这个方向上这一段被东西占着」——
 * 所以它画出来就该是一块说不清边界的暗斑，而不是一条干净的弧。
 */
export interface SonarShadow {
  /** 方位，弧度。0 = 正前 */
  bearing: number;
  arc: number;
  /** 阴影内缘 / 外缘，0..1 归一化到屏幕半径 */
  near: number;
  far: number;
  /** 浓度 0..1 */
  density: number;
}

export interface SonarScopeOptions {
  /** 磷光余辉半衰期（秒）。真设备约 2–4 s */
  persistence?: number;
  /** 扫描一圈的秒数 */
  revolution?: number;
  /** 磷光缓冲分辨率 */
  buffer?: number;
}

interface Wavefront {
  t: number;
  power: number;
}

const TAU = Math.PI * 2;

export class SonarScope {
  private ph: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private grat: HTMLCanvasElement | null = null;
  private glass: HTMLCanvasElement | null = null;
  private gratKey = '';

  private sweep = -Math.PI / 2;
  private prevSweep = -Math.PI / 2;
  private wavefronts: Wavefront[] = [];
  private tick = 0;
  private timeAcc = 0;

  /** 当前脉冲能量 0..1，决定回波亮度。被动聆听时也留一点底能量 */
  energy = 0.16;
  /** 干扰强度 0..1 —— 房间噪音、感染、污染都会推高它 */
  interference = 0.12;
  /** 保真度 0..1，低保真时伪影会「呼吸」 */
  fidelity = 0.8;
  /** Veracity 污染，>0 时伪影会伪装成真回波 */
  corruption = 0;
  /** 屏幕整体增益（断电时压到 0） */
  gain = 1;

  contacts: SonarContact[] = [];
  /** 近场阴影地图。空数组 = 远场模式，屏上只有回波 */
  shadows: SonarShadow[] = [];

  readonly persistence: number;
  readonly revolution: number;

  constructor(opts: SonarScopeOptions = {}) {
    this.persistence = opts.persistence ?? 2.9;
    this.revolution = opts.revolution ?? 4.6;
    const size = opts.buffer ?? 768;
    this.ph = document.createElement('canvas');
    this.ph.width = size;
    this.ph.height = size;
    const c = this.ph.getContext('2d', { alpha: true });
    if (!c) throw new Error('[sonar] 无法创建磷光缓冲');
    this.pctx = c;
  }

  /** 发射一次脉冲：能量拉满，并放出一圈可见的波前 */
  ping(power: number): void {
    this.energy = clamp01(Math.max(this.energy, 0.35 + power * 0.65));
    this.wavefronts.push({ t: 0, power: clamp01(power) });
    if (this.wavefronts.length > 4) this.wavefronts.shift();
    // 脉冲瞬间把扫描线拽到正前方，让「按下按钮 → 世界被照亮」有因果感
    this.sweep = -Math.PI / 2 - 0.22;
    this.prevSweep = this.sweep;
  }

  update(dt: number): void {
    const d = Math.min(dt, 1 / 20);
    this.timeAcc += d;
    this.prevSweep = this.sweep;
    // 能量高时扫得更快 —— 全功率脉冲后画面明显更「急」
    this.sweep += (TAU / this.revolution) * (1 + this.energy * 0.55) * d;
    if (this.sweep - this.prevSweep > Math.PI) this.prevSweep = this.sweep;

    this.energy = damp(this.energy, 0.14, 0.55, d);
    for (const w of this.wavefronts) w.t += d;
    this.wavefronts = this.wavefronts.filter((w) => w.t < 1.6);

    this.decay(d);
    this.paintSweep(d);
  }

  /** 磷光衰减：对 alpha 做指数削减，得到真正的余辉拖尾 */
  private decay(dt: number): void {
    const k = Math.pow(0.5, dt / this.persistence);
    const ctx = this.pctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${(1 - k).toFixed(5)})`;
    ctx.fillRect(0, 0, this.ph.width, this.ph.height);
    ctx.restore();
  }

  /** 扫描线扫过的那一小段角度区间：把落在里面的东西「烧」进磷光层 */
  private paintSweep(dt: number): void {
    const ctx = this.pctx;
    const S = this.ph.width;
    const R = S / 2 - 6;
    const cx = S / 2;
    const cy = S / 2;
    const a0 = this.prevSweep;
    const a1 = this.sweep;
    if (a1 <= a0) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';

    // --- 海杂波：近处密、远处疏，由扫描线现场刷出 ---
    const clutterCount = Math.round((14 + this.interference * 90) * Math.min(1, (a1 - a0) * 12));
    for (let i = 0; i < clutterCount; i++) {
      this.tick++;
      const h1 = hash2(this.tick, 17);
      const h2 = hash2(this.tick, 91);
      const h3 = hash2(this.tick, 233);
      const ang = a0 + (a1 - a0) * h1;
      const rr = Math.pow(h2, 1.85) * R;
      const alpha = (0.05 + h3 * 0.16) * (0.35 + this.interference * 1.5) * this.gain;
      const size = 0.9 + h3 * 2.1;
      ctx.fillStyle = phosphor(0.18 + h3 * 0.22, alpha);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rr, Math.sin(ang) * rr, size, 0, TAU);
      ctx.fill();
    }

    // --- 真正的回波 ---
    for (const c of this.contacts) {
      const base = c.bearing - Math.PI / 2;
      const half = Math.max(0.012, c.arc * 0.5);
      if (!Number.isFinite(base) || !Number.isFinite(half)) continue;
      // 把接触点的角度归到扫描区间附近
      let a = base;
      let hops = 0;
      while (a < a0 - Math.PI && hops++ < 8) a += TAU;
      hops = 0;
      while (a > a0 + Math.PI && hops++ < 8) a -= TAU;
      if (a + half < a0 || a - half > a1) continue;

      const rr = clamp01(c.range) * R;
      const lit = clamp01(c.strength) * (0.25 + this.energy * 0.95) * this.gain;
      if (lit <= 0.01) continue;
      this.stamp(ctx, a, half, rr, lit, c);
    }
    ctx.restore();
  }

  private stamp(
    ctx: CanvasRenderingContext2D,
    ang: number,
    half: number,
    rr: number,
    lit: number,
    c: SonarContact,
  ): void {
    const hot = c.kind === 'listener' ? 1 : c.kind === 'anomaly' ? 0.86 : 0.62;
    const isFalse = c.kind === 'artifact';
    // 伪影在低保真时会「呼吸」—— 这是玩家可以学会识别的破绽（GDD §5 tell）
    const falseFlicker = isFalse
      ? 0.45 + 0.55 * Math.abs(Math.sin(this.timeAcc * 2.1 + c.range * 9))
      : 1;
    const alpha = lit * falseFlicker;

    ctx.save();
    if (c.kind === 'listener' || c.kind === 'anomaly') {
      ctx.shadowBlur = 18;
      ctx.shadowColor = rgba(c.kind === 'listener' ? PALETTE.bloodHot : PALETTE.ember, alpha * 0.9);
    }

    // 回波主体：一段弧。厚度随强度与距离变化（近处目标占更多角度）
    const thick = (1.6 + lit * 5.2) * (c.kind === 'hull' ? 0.8 : 1.15);
    const grad = ctx.createRadialGradient(0, 0, Math.max(0, rr - thick * 2), 0, 0, rr + thick * 2);
    grad.addColorStop(0, phosphor(hot * 0.35, 0));
    grad.addColorStop(0.5, phosphor(clamp01(hot + lit * 0.4), alpha));
    grad.addColorStop(1, phosphor(hot * 0.4, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, rr, ang - half, ang + half);
    ctx.stroke();

    // 异常用血红描一层，只此一处允许红色进声呐屏
    if (c.kind === 'anomaly' || c.kind === 'listener') {
      ctx.strokeStyle = rgba(PALETTE.bloodHot, alpha * 0.55);
      ctx.lineWidth = thick * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, rr, ang - half * 0.7, ang + half * 0.7);
      ctx.stroke();
    }

    // 距离向的余尾：真设备的回波会往外拖一小段
    const tailGrad = ctx.createRadialGradient(0, 0, rr, 0, 0, rr + 16 + lit * 22);
    tailGrad.addColorStop(0, phosphor(hot, alpha * 0.5));
    tailGrad.addColorStop(1, phosphor(hot * 0.3, 0));
    ctx.strokeStyle = tailGrad;
    ctx.lineWidth = thick * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, rr + 8 + lit * 10, ang - half * 0.55, ang + half * 0.55);
    ctx.stroke();

    // 门：在弧上开一个亮口子
    if (c.kind === 'door') {
      ctx.strokeStyle = phosphor(1, alpha * 0.95);
      ctx.lineWidth = thick * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, rr, ang - half * 0.18, ang + half * 0.18);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ==========================================================================
  // 绘制
  // ==========================================================================

  /**
   * 近场阴影：一圈说不清边界的暗斑，拼出舱体周围这块地方的形状。
   *
   * 关键是**不能画得太干净**。真设备在近距离上分辨率很差，边界是糊的，
   * 而且会随着水里的东西轻轻晃。画成一圈整齐的扇形就变成了棋盘格，
   * 那是策略游戏的地图，不是一台泡在海底的雷达。
   */
  private drawShadows(ctx: CanvasRenderingContext2D, R: number, time: number): void {
    if (!this.shadows.length || this.gain <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const s of this.shadows) {
      // 呼吸：每个扇区用自己的相位轻轻晃，整张图就不会像贴图
      const wob = Math.sin(time * 0.6 + s.bearing * 3.1) * 0.012;
      const r0 = Math.max(0, (s.near + wob) * R);
      const r1 = Math.max(r0 + R * 0.01, (s.far + wob) * R);
      const a = s.bearing - Math.PI / 2;
      const half = s.arc * 0.62; // 相邻扇区互相压边，缝就糊掉了
      const alpha = s.density * 0.30 * this.gain * (0.82 + this.energy * 0.4);
      if (alpha < 0.004) continue;

      const grad = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
      grad.addColorStop(0, phosphor(0.30, 0));
      grad.addColorStop(0.42, phosphor(0.44 + s.density * 0.3, alpha));
      grad.addColorStop(1, phosphor(0.26, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r1, a - half, a + half);
      ctx.arc(0, 0, r0, a + half, a - half, true);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * 把整块屏画到目标 ctx。(cx,cy) 是屏心，R 是可视半径（不含金属圈）。
   */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, time: number): void {
    this.ensureLayers(R);
    ctx.save();
    ctx.translate(cx, cy);

    // --- 玻璃井：底色 ---
    const well = ctx.createRadialGradient(0, -R * 0.2, R * 0.1, 0, 0, R * 1.05);
    well.addColorStop(0, '#0a1119');
    well.addColorStop(0.62, '#070c13');
    well.addColorStop(1, '#03060a');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    // --- 刻度盘（缓存） ---
    if (this.grat) {
      ctx.globalAlpha = 0.9 * this.gain;
      ctx.drawImage(this.grat, -R, -R, R * 2, R * 2);
      ctx.globalAlpha = 1;
    }

    // --- 近场阴影地图（在回波下面：它是底图，不是目标） ---
    this.drawShadows(ctx, R, time);

    // --- 磷光层 ---
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.ph, -R, -R, R * 2, R * 2);

    // --- 脉冲波前：一圈向外推的亮环 ---
    for (const w of this.wavefronts) {
      const t = w.t / 1.6;
      const rr = smoothstep(t) * R * 1.02;
      const a = (1 - t) * (1 - t) * 0.55 * w.power * this.gain;
      if (a < 0.004) continue;
      const g = ctx.createRadialGradient(0, 0, Math.max(0, rr - R * 0.06), 0, 0, rr + R * 0.03);
      g.addColorStop(0, phosphor(0.5, 0));
      g.addColorStop(0.75, phosphor(0.92, a));
      g.addColorStop(1, phosphor(0.6, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = R * 0.035;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }

    // --- 扫描楔形 ---
    this.drawSweep(ctx, R);

    // --- 中心本舰标记 ---
    this.drawOwnShip(ctx, R, time);

    // --- CRT 中心辉光 ---
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.9);
    glow.addColorStop(0, rgba(PALETTE.rust, 0.10 * this.gain));
    glow.addColorStop(0.45, rgba(PALETTE.rustDeep, 0.05 * this.gain));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-R, -R, R * 2, R * 2);

    ctx.globalCompositeOperation = 'source-over';

    // --- 屏幕自身的细扫描行（比全局后处理更密，属于这块 CRT 的特征） ---
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.round(R / 120));
    for (let y = -R; y < R; y += step * 2) ctx.fillRect(-R, y, R * 2, step);
    ctx.globalAlpha = 1;

    // --- 玻璃：污渍、划痕、反光（缓存） ---
    if (this.glass) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glass, -R, -R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    const spec = ctx.createLinearGradient(-R * 0.8, -R * 0.9, R * 0.2, R * 0.1);
    spec.addColorStop(0, 'rgba(216,210,196,0.085)');
    spec.addColorStop(0.35, 'rgba(216,210,196,0.018)');
    spec.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spec;
    ctx.beginPath();
    ctx.ellipse(-R * 0.34, -R * 0.42, R * 0.52, R * 0.30, -0.62, 0, TAU);
    ctx.fill();

    ctx.restore(); // clip

    // --- 金属圈 ---
    this.drawBezel(ctx, R, time);
    ctx.restore();
  }

  private drawSweep(ctx: CanvasRenderingContext2D, R: number): void {
    const a = this.sweep;
    const e = 0.30 + this.energy * 0.70;
    const supported = typeof (ctx as { createConicGradient?: unknown }).createConicGradient === 'function';
    if (supported) {
      const cg = ctx.createConicGradient(a - 1.05, 0, 0);
      cg.addColorStop(0, phosphor(0.35, 0));
      cg.addColorStop(0.7, phosphor(0.55, 0.05 * e * this.gain));
      cg.addColorStop(0.955, phosphor(0.85, 0.24 * e * this.gain));
      cg.addColorStop(0.998, phosphor(1, 0.55 * e * this.gain));
      cg.addColorStop(1, phosphor(0.35, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
    } else {
      const slices = 26;
      for (let i = 0; i < slices; i++) {
        const t = i / slices;
        const w = 1.05 / slices;
        ctx.fillStyle = phosphor(0.4 + t * 0.6, Math.pow(t, 2.4) * 0.4 * e * this.gain);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a - 1.05 + t * 1.05, a - 1.05 + t * 1.05 + w);
        ctx.closePath();
        ctx.fill();
      }
    }
    // 扫描线本体
    const lg = ctx.createLinearGradient(0, 0, Math.cos(a) * R, Math.sin(a) * R);
    lg.addColorStop(0, phosphor(1, 0.55 * e * this.gain));
    lg.addColorStop(0.55, phosphor(0.92, 0.32 * e * this.gain));
    lg.addColorStop(1, phosphor(0.7, 0.06 * e * this.gain));
    ctx.strokeStyle = lg;
    ctx.lineWidth = Math.max(1.2, R * 0.006);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    ctx.stroke();
  }

  private drawOwnShip(ctx: CanvasRenderingContext2D, R: number, time: number): void {
    const s = R * 0.028;
    const pulse = 0.55 + 0.45 * Math.sin(time * 1.9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(PALETTE.bone, (0.55 + pulse * 0.35) * this.gain);
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.9);
    ctx.lineTo(s * 0.95, s * 1.5);
    ctx.lineTo(0, s * 0.85);
    ctx.lineTo(-s * 0.95, s * 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.bone, 0.16 * this.gain);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -R);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawBezel(ctx: CanvasRenderingContext2D, R: number, time: number): void {
    const ringW = Math.max(8, R * 0.085);
    const outer = R + ringW;

    // 金属圈本体
    const mg = ctx.createLinearGradient(-outer, -outer, outer, outer);
    mg.addColorStop(0, PALETTE.steelLit);
    mg.addColorStop(0.28, PALETTE.steel);
    mg.addColorStop(0.55, PALETTE.steelDark);
    mg.addColorStop(0.78, PALETTE.steel);
    mg.addColorStop(1, '#0d1219');
    ctx.strokeStyle = mg;
    ctx.lineWidth = ringW;
    ctx.beginPath();
    ctx.arc(0, 0, R + ringW / 2, 0, TAU);
    ctx.stroke();

    // 内缘暗边：玻璃嵌进金属里
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = Math.max(2, R * 0.016);
    ctx.beginPath();
    ctx.arc(0, 0, R + 1, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.5);
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.beginPath();
    ctx.arc(0, 0, R + ringW * 0.16, 0, TAU);
    ctx.stroke();

    // 铆钉
    const bolts = 16;
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * TAU + 0.196;
      const bx = Math.cos(a) * (R + ringW * 0.55);
      const by = Math.sin(a) * (R + ringW * 0.55);
      const br = ringW * 0.22;
      const bg = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, 0, bx, by, br);
      bg.addColorStop(0, '#6d7783');
      bg.addColorStop(0.6, '#39424c');
      bg.addColorStop(1, '#10151c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 一字槽
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.moveTo(bx - br * 0.55 * Math.cos(a * 3), by - br * 0.55 * Math.sin(a * 3));
      ctx.lineTo(bx + br * 0.55 * Math.cos(a * 3), by + br * 0.55 * Math.sin(a * 3));
      ctx.stroke();
    }

    // 指示灯：脉冲时点亮
    const lampA = -Math.PI / 2 + 0.85;
    const lx = Math.cos(lampA) * (R + ringW * 0.52);
    const ly = Math.sin(lampA) * (R + ringW * 0.52);
    const on = this.energy > 0.3 ? 1 : 0.12 + 0.06 * Math.sin(time * 3);
    const lampG = ctx.createRadialGradient(lx, ly, 0, lx, ly, ringW * 0.5);
    lampG.addColorStop(0, rgba(PALETTE.ember, 0.95 * on));
    lampG.addColorStop(0.35, rgba(PALETTE.rust, 0.6 * on));
    lampG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lampG;
    ctx.beginPath();
    ctx.arc(lx, ly, ringW * 0.5, 0, TAU);
    ctx.fill();

    // 刻字
    ctx.save();
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.62);
    ctx.font = `600 ${Math.round(R * 0.055)}px "Consolas","SF Mono",ui-monospace,monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(R * 0.018).toFixed(1)}px`;
    ctx.fillText('KYRIE-9 · PPI', 0, R + ringW * 0.52);
    ctx.fillText('SND-04', 0, -R - ringW * 0.52);
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    ctx.restore();
  }

  // ==========================================================================
  // 缓存层
  // ==========================================================================

  private ensureLayers(R: number): void {
    const size = Math.max(64, Math.round(R * 2));
    const key = `${size}`;
    if (this.gratKey === key && this.grat && this.glass) return;
    this.gratKey = key;
    this.grat = this.bakeGraticule(size);
    this.glass = this.bakeGlass(size);
  }

  /** 距离环 + 方位刻度 + 字。一次烘焙，之后只是一张图。 */
  private bakeGraticule(size: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d')!;
    const R = size / 2 - 1;
    ctx.translate(size / 2, size / 2);

    // 距离环
    const rings = 5;
    for (let i = 1; i <= rings; i++) {
      const rr = (i / rings) * R;
      const major = i === rings;
      ctx.strokeStyle = rgba(PALETTE.rustDim, major ? 0.42 : 0.22);
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.setLineDash(major ? [] : [6, 7]);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 方位射线
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180 - Math.PI / 2;
      const major = deg % 30 === 0;
      const mid = deg % 10 === 0;
      const len = major ? R * 0.075 : mid ? R * 0.042 : R * 0.024;
      ctx.strokeStyle = rgba(PALETTE.rustDim, major ? 0.55 : mid ? 0.3 : 0.18);
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.lineTo(Math.cos(a) * (R - len), Math.sin(a) * (R - len));
      ctx.stroke();
      if (major) {
        ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.20);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (R - len), Math.sin(a) * (R - len));
        ctx.lineTo(0, 0);
        ctx.stroke();
      }
    }

    // 方位数字
    ctx.fillStyle = rgba(PALETTE.rust, 0.62);
    ctx.font = `500 ${Math.round(size * 0.030)}px "Consolas","SF Mono",ui-monospace,monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180 - Math.PI / 2;
      const rr = R - size * 0.062;
      ctx.fillText(deg.toString().padStart(3, '0'), Math.cos(a) * rr, Math.sin(a) * rr);
    }

    // 距离标注（沿 045 方位）
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.5);
    ctx.font = `400 ${Math.round(size * 0.024)}px "Consolas","SF Mono",ui-monospace,monospace`;
    ctx.textAlign = 'left';
    for (let i = 1; i <= rings; i++) {
      const rr = (i / rings) * R;
      const a = -Math.PI / 4;
      ctx.fillText(`${i * 12}m`, Math.cos(a) * rr + 4, Math.sin(a) * rr - 4);
    }

    // 中心十字
    ctx.strokeStyle = rgba(PALETTE.rustDim, 0.45);
    ctx.lineWidth = 1;
    const ch = R * 0.045;
    ctx.beginPath();
    ctx.moveTo(-ch, 0); ctx.lineTo(ch, 0);
    ctx.moveTo(0, -ch); ctx.lineTo(0, ch);
    ctx.stroke();

    return cv;
  }

  /** 玻璃缺陷：灰尘、指痕、细划痕。烘焙一次，永远不变 —— 因为它是同一块玻璃。 */
  private bakeGlass(size: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d')!;

    // 划痕
    for (let i = 0; i < 26; i++) {
      const h = hash2(i, 401);
      const h2 = hash2(i, 733);
      const h3 = hash2(i, 977);
      const x = h * size;
      const y = h2 * size;
      const len = size * (0.03 + h3 * 0.26);
      const ang = h3 * Math.PI * 2;
      const g = ctx.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(216,210,196,0)');
      g.addColorStop(0.5, `rgba(216,210,196,${(0.03 + h * 0.05).toFixed(3)})`);
      g.addColorStop(1, 'rgba(216,210,196,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 0.6 + h2 * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(ang + 0.4) * len * 0.5,
        y + Math.sin(ang + 0.4) * len * 0.5,
        x + Math.cos(ang) * len,
        y + Math.sin(ang) * len,
      );
      ctx.stroke();
    }

    // 灰尘
    for (let i = 0; i < 180; i++) {
      const x = hash2(i, 51) * size;
      const y = hash2(i, 113) * size;
      const r = 0.4 + hash2(i, 199) * 1.4;
      ctx.fillStyle = `rgba(216,210,196,${(0.02 + hash2(i, 307) * 0.05).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    // 指痕油渍：低频噪声斑
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    const inv = 1 / size;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = valueNoise2(x * inv * 5.5, y * inv * 5.5, 88);
        const v = Math.max(0, n - 0.62) * 34;
        if (v <= 0) continue;
        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, d[idx] + v * 0.9);
        d[idx + 1] = Math.min(255, d[idx + 1] + v * 0.86);
        d[idx + 2] = Math.min(255, d[idx + 2] + v * 0.78);
        d[idx + 3] = Math.min(255, d[idx + 3] + v);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** 清屏（切换房间 / 断电时） */
  clear(): void {
    this.pctx.clearRect(0, 0, this.ph.width, this.ph.height);
    this.wavefronts.length = 0;
  }

  get sweepAngle(): number {
    return this.sweep;
  }
}

/**
 * 从「房间 + 距离」造一组接触点。
 * 真正接线时 Agent B 的 SonarResult 会喂进来，这里做的是几何到极坐标的翻译。
 */
export function contactsFromBearings(
  entries: readonly { bearing: number; range: number; strength: number; kind: ContactKind; label?: string }[],
): SonarContact[] {
  return entries.map((e, i) => ({
    id: `c${i}`,
    bearing: e.bearing,
    range: clamp01(e.range),
    strength: clamp01(e.strength),
    // 近处的东西占更大的角，远处收窄 —— 这一步让屏幕有了「透视」
    arc: clamp(0.10 + (1 - e.range) * 0.42, 0.04, 0.9) * (e.kind === 'door' ? 0.45 : 1),
    kind: e.kind,
    label: e.label,
  }));
}
