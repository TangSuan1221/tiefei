import { Xoshiro, fbm2 } from '@/core/rng';
import { clamp01, damp, smoothstep } from '@/core/util';

/**
 * 标题画面的声呐背景。
 *
 * 它同时是一份**美术方向声明**：玩家看到的第一帧就应该确立
 * "你在一台仪器里，隔着仪器看世界，而仪器并不可靠"这件事。
 *
 * 磷光残留是这块屏幕的灵魂 —— 扫描线扫过时点亮目标，
 * 之后目标以指数衰减，玩家必须在记忆里保持世界的样子。
 */

interface Contact {
  angle: number;      // 弧度
  radius: number;     // 归一化 0..1
  strength: number;   // 回波强度
  lit: number;        // 当前磷光亮度
  drift: number;      // 角漂移速度
  radialDrift: number;
  /** 少数接触点是"不该在那儿的" —— 它们会反向漂移 */
  wrong: boolean;
}

export class TitleBackground {
  private ctx: CanvasRenderingContext2D;
  private rng = new Xoshiro(0x4b595249, 'title'); // "KYRI"
  private contacts: Contact[] = [];
  private sweep = 0;
  private time = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private running = false;
  private rafId = 0;
  private lastT = 0;
  private intensity = 1;
  private targetIntensity = 1;

  /** 深度读数在缓慢下沉，UI 层来读它 */
  depth = 340;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D 不可用');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.seedContacts();
  }

  private seedContacts(): void {
    this.contacts = [];
    for (let i = 0; i < 46; i++) {
      const wrong = this.rng.bool(0.13);
      this.contacts.push({
        angle: this.rng.float(0, Math.PI * 2),
        radius: Math.sqrt(this.rng.float(0.02, 1)) * 0.94,
        strength: this.rng.float(0.18, 1),
        lit: 0,
        drift: this.rng.float(-0.04, 0.04) * (wrong ? -2.4 : 1),
        radialDrift: this.rng.float(-0.012, 0.008),
        wrong,
      });
    }
  }

  private resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.resize);
  }

  /** 菜单交互时短暂提亮，给操作以物理回馈 */
  pulse(): void {
    this.targetIntensity = 1.55;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;
    this.time += dt;
    this.targetIntensity = damp(this.targetIntensity, 1, 2.6, dt);
    this.intensity = damp(this.intensity, this.targetIntensity, 7, dt);
    this.depth += dt * 0.34; // 船还在往下沉，非常缓慢
    this.update(dt);
    this.draw();
  };

  private update(dt: number): void {
    const prev = this.sweep;
    // 扫描一圈 6.5 秒 —— 比真实声呐慢，为了让磷光衰减看得见
    this.sweep = (this.sweep + (dt / 6.5) * Math.PI * 2) % (Math.PI * 2);
    const wrapped = this.sweep < prev;

    for (const c of this.contacts) {
      c.angle = (c.angle + c.drift * dt + Math.PI * 2) % (Math.PI * 2);
      c.radius = clamp01(c.radius + c.radialDrift * dt);
      // 扫描线扫过 → 点亮
      const passed = wrapped
        ? c.angle >= prev || c.angle <= this.sweep
        : c.angle >= prev && c.angle <= this.sweep;
      if (passed) c.lit = c.strength;
      // 磷光指数衰减
      c.lit *= Math.exp(-dt * 0.52);
    }
  }

  /**
   * KYRIE-9 的侧剖影。它是断的 —— 船体在 D3 后段已经折了，
   * 这个细节在玩家读到任何一行文字之前就说完了整个前提。
   */
  private drawHull(cx: number, cy: number, R: number): void {
    const { ctx } = this;
    // 船体是背景锚点而非主体：压到右下象限，让出左上的标题区
    const L = R * 0.62;
    const H = R * 0.092;

    // 艏段：t=0 是尖艏，t=1 是断口（平且参差）
    const bowProfile = (t: number) => Math.pow(1 - Math.pow(1 - t, 2.6), 0.44);
    // 艉段：t=0 是断口，t=1 收成艉锥
    const sternProfile = (t: number) => Math.pow(1 - Math.pow(t, 3.4), 0.4);

    const segs: { len: number; dx: number; dy: number; tilt: number; prof: (t: number) => number; bow: boolean }[] = [
      { len: L * 0.6, dx: -L * 0.5, dy: 0, tilt: -0.02, prof: bowProfile, bow: true },
      { len: L * 0.38, dx: L * 0.105, dy: H * 0.62, tilt: 0.2, prof: sternProfile, bow: false },
    ];

    ctx.save();
    ctx.translate(cx + R * 0.26, cy + R * 0.26);
    ctx.rotate(-0.06);

    for (const s of segs) {
      ctx.save();
      ctx.translate(s.dx + s.len * 0.5, s.dy);
      ctx.rotate(s.tilt);

      const steps = 72;
      const halfH = (t: number) => H * s.prof(t);
      const xAt = (t: number) => (t - 0.5) * s.len;

      // 断口那一端不是切面，是撕口。平整的竖边会让两截读成两个无关的方块，
      // 参差的边缘才说得出"这里断过"。
      const jag = (x: number, from: number, to: number, seed: number) => {
        const n = 9;
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          const bite = (fbm2(i * 5.1 + seed, seed * 0.7, 2, 3300 + seed) - 0.5) * s.len * 0.055;
          ctx.lineTo(x + bite, from + (to - from) * k);
        }
      };

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (i === 0) ctx.moveTo(xAt(t), -halfH(t));
        else ctx.lineTo(xAt(t), -halfH(t));
      }
      if (s.bow) jag(xAt(1), -halfH(1), halfH(1), 17);
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        ctx.lineTo(xAt(t), halfH(t));
      }
      if (!s.bow) jag(xAt(0), halfH(0), -halfH(0), 41);
      ctx.closePath();

      // 船体内部比外面的水更黑 —— 这是"里面"与"外面"的第一次视觉分野
      ctx.fillStyle = 'rgba(4, 7, 11, 0.78)';
      ctx.fill();
      ctx.strokeStyle = `rgba(74, 155, 168, ${0.46 * this.intensity})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 五层甲板：玩家要走的每一层，在标题画面上已经都在了
      ctx.save();
      ctx.clip();
      for (let d = 1; d < 5; d++) {
        const y = -H + (2 * H * d) / 5;
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.11 * this.intensity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-s.len, y);
        ctx.lineTo(s.len, y);
        ctx.stroke();
      }
      const bulkheads = s.bow ? 7 : 4;
      for (let b = 1; b < bulkheads; b++) {
        const x = -s.len * 0.5 + (s.len * b) / bulkheads;
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.075 * this.intensity})`;
        ctx.beginPath();
        ctx.moveTo(x, -H);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.restore();

      // 指挥塔围壳。这是"这是一艘潜艇"最强的一个视觉线索，所以画得比写实更大。
      if (s.bow) {
        // 围壳的宽高比比绝对尺寸更重要：真实帆罩是横躺的梯形，
        // 一旦画高了就会读成塔楼，整艘船跟着变成建筑。
        const sx = -s.len * 0.1;
        const sw = s.len * 0.34;
        const sh = H * 1.15;
        ctx.fillStyle = 'rgba(4, 7, 11, 0.96)';
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.42 * this.intensity})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(sx, -H * 0.55);
        ctx.lineTo(sx + sw * 0.16, -H - sh);
        ctx.lineTo(sx + sw * 0.86, -H - sh);
        ctx.lineTo(sx + sw, -H * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 潜望镜与通气管：两根细杆，让围壳不只是个梯形
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.34 * this.intensity})`;
        ctx.lineWidth = 1;
        for (const [mx, mh] of [[0.4, 0.85], [0.58, 0.6]] as const) {
          ctx.beginPath();
          ctx.moveTo(sx + sw * mx, -H - sh);
          ctx.lineTo(sx + sw * mx, -H - sh - H * mh);
          ctx.stroke();
        }

        // 艏水平舵
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.3 * this.intensity})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-s.len * 0.3, H * 0.1);
        ctx.lineTo(-s.len * 0.42, H * 0.1);
        ctx.stroke();
      } else {
        // 艉部十字舵与桨毂：第二强的线索，补在断掉的那一半上，
        // 让后段不至于读成一块无名的残骸
        const tx = s.len * 0.5;
        ctx.strokeStyle = `rgba(74, 155, 168, ${0.34 * this.intensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tx - s.len * 0.09, -H * 1.5);
        ctx.lineTo(tx - s.len * 0.02, 0);
        ctx.lineTo(tx - s.len * 0.09, H * 1.5);
        ctx.moveTo(tx - s.len * 0.13, 0);
        ctx.lineTo(tx + s.len * 0.02, 0);
        ctx.stroke();

        ctx.strokeStyle = `rgba(74, 155, 168, ${0.26 * this.intensity})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.ellipse(tx + s.len * 0.01, 0, H * 0.2, H * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 断口：一小片还没沉下去的碎屑云
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const n = fbm2(i * 7.3, 2.1, 2, 4711);
      const m = fbm2(i * 3.9 + 11, 5.7, 2, 8123);
      const x = L * 0.055 + (n - 0.5) * L * 0.13;
      const y = H * 0.25 + (m - 0.5) * H * 2.4;
      ctx.fillStyle = `rgba(74, 155, 168, ${0.06 + n * 0.09})`;
      ctx.fillRect(x, y, 1 + n * 3.4, 1 + m * 2.2);
    }
    ctx.restore();

    ctx.restore();
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const R = Math.max(w, h) * 0.62;

    // ---- 底：深渊，带一层缓慢流动的密度不均 ----
    ctx.fillStyle = '#060a10';
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(18, 30, 40, 0.55)');
    grad.addColorStop(0.55, 'rgba(10, 16, 22, 0.32)');
    grad.addColorStop(1, 'rgba(6, 10, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // ---- 船体剖影：整幅画的构图锚点，也是"你在什么里面"的一次无声说明 ----
    this.drawHull(cx, cy, R);

    // ---- 距离环 ----
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      const r = (R * i) / 5;
      ctx.strokeStyle = `rgba(74, 155, 168, ${0.13 * this.intensity})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // 每个环上标一个距离数字，让它像一台真的仪器
      if (i % 2 === 0) {
        ctx.fillStyle = `rgba(74, 155, 168, ${0.22 * this.intensity})`;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`${i * 200}m`, 6, -r - 5);
      }
    }
    // 方位刻度
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const major = i % 18 === 0;
      const mid = i % 6 === 0;
      if (!major && !mid && i % 2 !== 0) continue;
      const r0 = R * (major ? 0.94 : mid ? 0.965 : 0.98);
      ctx.strokeStyle = `rgba(74, 155, 168, ${(major ? 0.34 : mid ? 0.17 : 0.09) * this.intensity})`;
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // ---- 扫描扇形：一条带角度衰减的尾迹，而不是一根硬线 ----
    const tail = 0.92;
    const sweepGrad = ctx.createConicGradient(this.sweep - tail, 0, 0);
    sweepGrad.addColorStop(0, 'rgba(74, 155, 168, 0)');
    sweepGrad.addColorStop(tail / (Math.PI * 2) * 0.72, `rgba(74, 155, 168, ${0.045 * this.intensity})`);
    sweepGrad.addColorStop(tail / (Math.PI * 2), `rgba(120, 210, 220, ${0.14 * this.intensity})`);
    sweepGrad.addColorStop(tail / (Math.PI * 2) + 0.0006, 'rgba(74, 155, 168, 0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // 扫描线本体
    ctx.strokeStyle = `rgba(150, 226, 232, ${0.3 * this.intensity})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(this.sweep) * R, Math.sin(this.sweep) * R);
    ctx.stroke();

    // ---- 接触点 ----
    for (const c of this.contacts) {
      if (c.lit < 0.008) continue;
      const x = Math.cos(c.angle) * c.radius * R;
      const y = Math.sin(c.angle) * c.radius * R;
      const a = c.lit * this.intensity;
      const size = 1.6 + c.strength * 3.4;

      const g = ctx.createRadialGradient(x, y, 0, x, y, size * 5);
      // "不该在那儿的"接触点是锈红色 —— 玩家未必意识到，但会不安
      const hue = c.wrong ? '196, 99, 42' : '150, 226, 232';
      g.addColorStop(0, `rgba(${hue}, ${a * 0.92})`);
      g.addColorStop(0.28, `rgba(${hue}, ${a * 0.34})`);
      g.addColorStop(1, `rgba(${hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${hue}, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- 悬浮微粒：靠近镜头的碎屑，制造景深 ----
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const n1 = fbm2(i * 3.7, this.time * 0.08, 2, 991);
      const n2 = fbm2(i * 5.1 + 50, this.time * 0.065, 2, 331);
      const x = n1 * w;
      const y = ((n2 + this.time * 0.006 * (0.4 + (i % 5) / 5)) % 1) * h;
      const s = 0.4 + ((i * 37) % 11) / 11 * 1.5;
      ctx.fillStyle = `rgba(216, 210, 196, ${0.035 + (s / 2) * 0.05})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ---- 扫描线纹理 + 暗角，交给 CSS 的 #visor 补最外圈 ----
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#000';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();

    // ---- 偶发的信号丢失：一瞬间的横向撕裂 ----
    const glitch = smoothstep((fbm2(this.time * 0.9, 17.3, 3, 7) - 0.74) * 8);
    if (glitch > 0.01) {
      const bandY = fbm2(this.time * 3.1, 4.2, 2, 13) * h;
      const bandH = 2 + glitch * 26;
      const shift = (fbm2(this.time * 7, 9.1, 2, 29) - 0.5) * 40 * glitch;
      const band = ctx.getImageData(0, bandY * this.dpr, this.canvas.width, bandH * this.dpr);
      ctx.putImageData(band, shift * this.dpr, bandY * this.dpr);
      ctx.fillStyle = `rgba(196, 99, 42, ${glitch * 0.05})`;
      ctx.fillRect(0, bandY, w, bandH);
    }
  }
}
