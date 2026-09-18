/**
 * 逃生舱过道 —— 玩家真正「待着」的那九米。
 * ============================================================================
 * 这不是一张示意图。这是一个封闭的圆筒：头顶压着电缆，脚下是格栅，
 * 六个工位沿右舷排开。没有窗户。舱尾的逃生盖已经被焊死。
 *
 * 视角沿舱体平移（camX 0 = 舱尾生命维持，1 = 舱首推进台）。
 * 点击工位 = 走过去并坐下。坐下之后由 stations.ts 把那台设备推到眼前。
 */

import { hash2, valueNoise2 } from '@/core/rng';
import { clamp, clamp01, damp, lerp } from '@/core/util';
import {
  flange,
  lampFlicker,
  makeCanvas,
  makeGritTile,
  makeRustLayer,
  pipeH,
  pipeV,
  rivet,
  roundRect,
  shadeHex,
  valve,
} from '@/render/interior';
import { PALETTE, rgba } from '@/render/palette';
import { cjk, mono, tracked } from '@/ui/typography';
import { STATIONS, STATION_ORDER, type StationId } from '../types';
import { PodRun } from '../sim/run';
import { HitMap } from './chrome';

const TAU = Math.PI * 2;

export interface CabinDrawState {
  time: number;
  dt: number;
  hovered: string | null;
}

interface StationBox {
  id: StationId;
  x: number;
  y: number;
  w: number;
  h: number;
  screen: { x: number; y: number; w: number; h: number };
}

export class CabinRenderer {
  private baked: HTMLCanvasElement | null = null;
  private grit: HTMLCanvasElement | null = null;
  private key = '';
  worldW = 0;
  worldH = 0;
  stations: StationBox[] = [];
  private motes: { x: number; y: number; z: number; p: number }[] = [];
  private drips: { x: number; y: number; v: number; life: number }[] = [];
  private dripTimer = 0;
  private pan = 0;

  ensure(viewW: number, viewH: number): void {
    const worldW = Math.round(viewW * 2.18);
    const worldH = Math.round(viewH);
    const k = `${worldW}x${worldH}`;
    if (k === this.key && this.baked) return;
    this.key = k;
    this.worldW = worldW;
    this.worldH = worldH;
    this.grit = makeGritTile(128, 19);
    this.layoutStations();
    this.bake();
    this.motes = [];
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        x: hash2(i, 5) * worldW,
        y: hash2(i, 61) * worldH * 0.7,
        z: 0.25 + hash2(i, 131) * 0.75,
        p: hash2(i, 211) * TAU,
      });
    }
  }

  private layoutStations(): void {
    const H = this.worldH;
    const W = this.worldW;
    const consoleY = H * 0.58;
    const consoleH = H * 0.30;
    const consoleW = W * 0.105;
    this.stations = STATION_ORDER.map((id) => {
      const cx = PodRun.STATION_X[id] * W;
      const x = cx - consoleW / 2;
      const screenPad = consoleW * 0.12;
      return {
        id,
        x,
        y: consoleY,
        w: consoleW,
        h: consoleH,
        screen: {
          x: x + screenPad,
          y: consoleY + consoleH * 0.10,
          w: consoleW - screenPad * 2,
          h: consoleH * 0.48,
        },
      };
    });
  }

  /** 当前视角左边缘在世界坐标里的 x */
  viewLeft(camX: number, viewW: number): number {
    return clamp(camX * (this.worldW - viewW), 0, Math.max(0, this.worldW - viewW));
  }

  draw(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    run: PodRun,
    hits: HitMap,
    s: CabinDrawState,
  ): void {
    this.ensure(viewW, viewH);
    this.pan = damp(this.pan, this.viewLeft(run.camX, viewW), 10, s.dt);
    const left = this.pan;
    const H = this.worldH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewW, viewH);
    ctx.clip();
    ctx.translate(-left, 0);

    if (this.baked) ctx.drawImage(this.baked, 0, 0);

    this.drawLighting(ctx, run, s.time, left, viewW);
    this.drawStationLive(ctx, run, s, hits, left, viewW);
    this.drawFlood(ctx, run, s.time);
    this.drawMotes(ctx, run, s.time, s.dt);
    this.drawPlayerPresence(ctx, run, s.time);

    ctx.restore();

    // 舱体两端的暗角：强调「圆筒很窄，你看不见头」
    const vg = ctx.createLinearGradient(0, 0, viewW, 0);
    vg.addColorStop(0, 'rgba(3,5,8,0.72)');
    vg.addColorStop(0.12, 'rgba(3,5,8,0)');
    vg.addColorStop(0.88, 'rgba(3,5,8,0)');
    vg.addColorStop(1, 'rgba(3,5,8,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, viewW, viewH);

    // 头顶压下来的那条弧，让人觉得舱顶就在头发上方
    const ceil = ctx.createLinearGradient(0, 0, 0, H * 0.22);
    ceil.addColorStop(0, 'rgba(4,6,10,0.65)');
    ceil.addColorStop(1, 'rgba(4,6,10,0)');
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, viewW, H * 0.22);
  }

  // ==========================================================================
  // 烘焙
  // ==========================================================================

  private bake(): void {
    const W = this.worldW;
    const H = this.worldH;
    const [cv, ctx] = makeCanvas(W, H);
    ctx.fillStyle = PALETTE.abyss;
    ctx.fillRect(0, 0, W, H);

    this.bakeHull(ctx, W, H);
    this.bakeRibs(ctx, W, H);
    this.bakePipes(ctx, W, H);
    this.bakeHatch(ctx, W, H);
    this.bakeBowPlate(ctx, W, H);
    this.bakeDeck(ctx, W, H);
    this.bakeConsoles(ctx, W, H);

    const rust = makeRustLayer(W, H, 441);
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.drawImage(rust, 0, 0, W, H);
    ctx.restore();

    if (this.grit) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.5;
      const pat = ctx.createPattern(this.grit, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    this.baked = cv;
  }

  private bakeHull(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    // 圆筒内壁：上下暗、中间稍亮。这是「你在管子里」的全部几何。
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070a10');
    g.addColorStop(0.18, shadeHex(PALETTE.steelDark, 0.85));
    g.addColorStop(0.5, shadeHex(PALETTE.steel, 0.92));
    g.addColorStop(0.78, shadeHex(PALETTE.steelDark, 0.8));
    g.addColorStop(1, '#05070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 水平拼板
    const plateH = H * 0.13;
    for (let y = 0; y < H; y += plateH) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1.4, H * 0.0024);
      ctx.beginPath();
      ctx.moveTo(0, y + plateH);
      ctx.lineTo(W, y + plateH);
      ctx.stroke();
      ctx.strokeStyle = rgba(PALETTE.steelLit, 0.16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + plateH + 1.4);
      ctx.lineTo(W, y + plateH + 1.4);
      ctx.stroke();
      const step = W * 0.028;
      for (let x = step * 0.4; x < W; x += step) {
        rivet(ctx, x, y + plateH - H * 0.01, Math.max(1.6, H * 0.004));
      }
    }
  }

  private bakeRibs(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x = (W / (n - 1)) * i;
      const g = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.5, shadeHex(PALETTE.steelLit, 0.5));
      g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - H * 0.018, 0, H * 0.036, H);
    }
  }

  private bakePipes(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    pipeH(ctx, 0, W, H * 0.085, H * 0.016, PALETTE.steel);
    pipeH(ctx, 0, W, H * 0.125, H * 0.011, PALETTE.rustDeep);
    pipeH(ctx, W * 0.08, W * 0.55, H * 0.165, H * 0.009, PALETTE.steelDark);
    flange(ctx, W * 0.22, H * 0.085, H * 0.02);
    flange(ctx, W * 0.61, H * 0.085, H * 0.02);
    valve(ctx, W * 0.38, H * 0.125, H * 0.018);
    valve(ctx, W * 0.79, H * 0.085, H * 0.016);
    // 垂下来的软管
    for (const x of [W * 0.17, W * 0.48, W * 0.71, W * 0.91]) {
      pipeV(ctx, x, H * 0.125, H * 0.42, H * 0.007, PALETTE.rustDeep);
    }
  }

  /** 舱尾：焊死的逃生盖。你进得来，出不去。 */
  private bakeHatch(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const cx = W * 0.028;
    const cy = H * 0.42;
    const r = H * 0.16;
    ctx.save();
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.1, cx, cy, r);
    g.addColorStop(0, shadeHex(PALETTE.steel, 1.1));
    g.addColorStop(1, '#0a0e14');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.steelLit, 0.4);
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.stroke();
    // 焊接疤
    ctx.strokeStyle = rgba(PALETTE.ember, 0.35);
    ctx.lineWidth = Math.max(1.4, r * 0.035);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0.4, 2.2);
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.rust, 0.75);
    ctx.font = mono(r * 0.16, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    tracked(ctx, 'WELDED', cx, cy - r * 0.08, r * 0.02);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.7);
    ctx.font = cjk(r * 0.14, 500);
    ctx.fillText('上浮锁定', cx, cy + r * 0.14);
    ctx.restore();
  }

  /** 舱首：本来该有观察窗的位置，钉了一块钢板 */
  private bakeBowPlate(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const x = W * 0.955;
    const y = H * 0.22;
    const w = W * 0.05;
    const h = H * 0.38;
    ctx.save();
    ctx.fillStyle = shadeHex(PALETTE.steelDark, 0.9);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeRect(x, y, w, h);
    const step = h / 6;
    for (let i = 1; i < 6; i++) {
      rivet(ctx, x + w * 0.3, y + step * i, H * 0.006);
      rivet(ctx, x + w * 0.7, y + step * i, H * 0.006);
    }
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
    ctx.save();
    ctx.translate(x + w * 0.55, y + h * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.font = cjk(H * 0.018, 500);
    ctx.textAlign = 'center';
    ctx.fillText('观察窗已封', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  private bakeDeck(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const y = H * 0.88;
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, y, W, H - y);
    // 格栅
    ctx.strokeStyle = rgba(PALETTE.steelLit, 0.18);
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += H * 0.03) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let gy = y; gy < H; gy += H * 0.022) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(PALETTE.rustDeep, 0.35);
    ctx.fillRect(0, y, W, H * 0.01);
  }

  private bakeConsoles(ctx: CanvasRenderingContext2D, _W: number, H: number): void {
    for (const st of this.stations) {
      const g = ctx.createLinearGradient(0, st.y, 0, st.y + st.h);
      g.addColorStop(0, shadeHex(PALETTE.steel, 1.08));
      g.addColorStop(0.4, shadeHex(PALETTE.steelDark, 0.95));
      g.addColorStop(1, '#0a0e14');
      ctx.fillStyle = g;
      roundRect(ctx, st.x, st.y, st.w, st.h, H * 0.01);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = Math.max(1.4, H * 0.002);
      ctx.stroke();
      rivet(ctx, st.x + H * 0.012, st.y + H * 0.012, H * 0.005);
      rivet(ctx, st.x + st.w - H * 0.012, st.y + H * 0.012, H * 0.005);

      // 铭牌
      ctx.fillStyle = '#12161d';
      roundRect(ctx, st.x + st.w * 0.1, st.y + st.h * 0.64, st.w * 0.8, st.h * 0.12, H * 0.004);
      ctx.fill();
      const meta = STATIONS[st.id];
      ctx.fillStyle = rgba(PALETTE.rust, 0.85);
      ctx.font = mono(H * 0.016, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      tracked(ctx, meta.code, st.x + st.w / 2, st.y + st.h * 0.70, H * 0.003);
      ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
      ctx.font = cjk(H * 0.018, 500);
      ctx.fillText(meta.name, st.x + st.w / 2, st.y + st.h * 0.84);

      // 暗着的屏槽（亮起来是 live 层的事）
      ctx.fillStyle = '#070605';
      roundRect(ctx, st.screen.x, st.screen.y, st.screen.w, st.screen.h, H * 0.008);
      ctx.fill();
    }
  }

  // ==========================================================================
  // 动态
  // ==========================================================================

  private drawLighting(
    ctx: CanvasRenderingContext2D,
    run: PodRun,
    time: number,
    left: number,
    viewW: number,
  ): void {
    const H = this.worldH;
    const power = run.blackout ? 0.08 : run.power;
    const flicker = lampFlicker(time, power);
    const emergency = run.mode === 'alert' || run.blackout;

    // 应急灯：沿舱顶一排
    for (let i = 0; i < 6; i++) {
      const x = this.worldW * (0.12 + i * 0.15);
      if (x < left - 40 || x > left + viewW + 40) continue;
      const on = emergency
        ? (Math.sin(time * 7.5 + i) > 0 ? 0.9 : 0.15) * flicker
        : 0.35 * flicker;
      const hex = emergency ? PALETTE.bloodHot : PALETTE.ember;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, H * 0.07, 0, x, H * 0.07, H * 0.55);
      g.addColorStop(0, rgba(hex, 0.22 * on));
      g.addColorStop(0.4, rgba(hex, 0.06 * on));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - H * 0.6, 0, H * 1.2, H);
      ctx.restore();
    }
  }

  private drawStationLive(
    ctx: CanvasRenderingContext2D,
    run: PodRun,
    s: CabinDrawState,
    hits: HitMap,
    left: number,
    viewW: number,
  ): void {
    const H = this.worldH;
    for (const st of this.stations) {
      const sc = st.screen;
      const live = !run.blackout && run.power > 0.04;
      const hot = s.hovered === `station:${st.id}`;
      const here = run.at === st.id || (!run.at && run.closestStation() === st.id && Math.abs(run.camX - PodRun.STATION_X[st.id]) < 0.08);
      const radioWait = st.id === 'radio' && run.radioWaiting;
      const threatGlow = st.id === 'nav' && !!run.threat;

      // 屏内辉光
      if (live) {
        ctx.save();
        roundRect(ctx, sc.x, sc.y, sc.w, sc.h, H * 0.008);
        ctx.clip();
        const tone = threatGlow ? PALETTE.blood : st.id === 'camera' ? PALETTE.abyssHaze : PALETTE.rust;
        ctx.fillStyle = rgba(tone, 0.18 + (here ? 0.12 : 0));
        ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
        this.drawMiniScreen(ctx, st.id, sc, run, s.time);
        ctx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const spill = ctx.createRadialGradient(
          sc.x + sc.w / 2, sc.y + sc.h / 2, sc.h * 0.2,
          sc.x + sc.w / 2, sc.y + sc.h / 2, sc.h * 1.4,
        );
        spill.addColorStop(0, rgba(threatGlow ? PALETTE.bloodHot : PALETTE.rust, 0.12));
        spill.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spill;
        ctx.fillRect(sc.x - sc.w, sc.y - sc.h, sc.w * 3, sc.h * 3);
        ctx.restore();
      }

      // 指示灯
      const lx = st.x + st.w * 0.14;
      const ly = st.y + st.h * 0.07;
      const on =
        radioWait ? 0.6 + Math.sin(s.time * 8) * 0.4
        : threatGlow ? 0.7 + Math.sin(s.time * 10) * 0.3
        : live ? 0.55 : 0.05;
      const lampHex = radioWait || threatGlow ? PALETTE.bloodHot : PALETTE.ember;
      ctx.fillStyle = on > 0.1 ? rgba(lampHex, 0.35 + on * 0.6) : 'rgba(30,28,24,0.9)';
      ctx.beginPath();
      ctx.arc(lx, ly, H * 0.007, 0, TAU);
      ctx.fill();
      if (on > 0.2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, H * 0.04);
        lg.addColorStop(0, rgba(lampHex, 0.55 * on));
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.arc(lx, ly, H * 0.04, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      if (hot) {
        ctx.strokeStyle = rgba(PALETTE.rustHot, 0.7);
        ctx.lineWidth = Math.max(1.5, H * 0.003);
        roundRect(ctx, st.x - 2, st.y - 2, st.w + 4, st.h + 4, H * 0.012);
        ctx.stroke();
      } else if (here) {
        ctx.strokeStyle = rgba(PALETTE.ember, 0.35);
        ctx.lineWidth = Math.max(1, H * 0.002);
        roundRect(ctx, st.x - 1, st.y - 1, st.w + 2, st.h + 2, H * 0.011);
        ctx.stroke();
      }

      // 坐下之后，过道工位不再抢点击 —— 近景面板说了算
      if (!run.at) {
        hits.add({
          id: `station:${st.id}`,
          x: st.x - left,
          y: st.y,
          w: st.w,
          h: st.h,
        });
      }
    }
    void viewW;
  }

  private drawMiniScreen(
    ctx: CanvasRenderingContext2D,
    id: StationId,
    sc: StationBox['screen'],
    run: PodRun,
    time: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(sc.x, sc.y, sc.w, sc.h);
    ctx.clip();
    if (id === 'nav') {
      const split = sc.w * 0.48;
      const cx = sc.x + split * 0.5;
      const cy = sc.y + sc.h / 2;
      const r = Math.min(split, sc.h) * 0.38;
      ctx.strokeStyle = rgba(PALETTE.rust, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      const sweep = (time * 1.3) % TAU - Math.PI / 2;
      ctx.strokeStyle = rgba(PALETTE.ember, 0.7);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweep) * r, cy + Math.sin(sweep) * r);
      ctx.stroke();
      if (run.threat) {
        const a = run.threat.bearing - Math.PI / 2;
        const rr = r * run.threat.range;
        ctx.fillStyle = rgba(PALETTE.bloodHot, 0.9);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.4, 0, TAU);
        ctx.fill();
      }
      const ha = ((run.heading - 90) * Math.PI) / 180;
      ctx.strokeStyle = rgba(PALETTE.rustHot, 0.8);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ha) * r * 0.55, cy + Math.sin(ha) * r * 0.55);
      ctx.stroke();

      const hx = sc.x + split + 3;
      const hy = sc.y + 3;
      const hw = sc.w - split - 6;
      const hh = sc.h - 6;
      ctx.strokeStyle = rgba(PALETTE.ember, 0.35 + Math.sin(time * 2) * 0.1);
      ctx.strokeRect(hx, hy, hw, hh);
      if (run.phase === 'site' && run.volume?.identified) {
        const nodes = run.volume.nodes;
        ctx.strokeStyle = rgba(PALETTE.phosphorMid, 0.55);
        ctx.lineWidth = 1;
        const n0 = nodes[0];
        if (n0) {
          let minX = n0.pos.x;
          let maxX = n0.pos.x;
          let minY = n0.pos.y;
          let maxY = n0.pos.y;
          for (const n of nodes) {
            minX = Math.min(minX, n.pos.x);
            maxX = Math.max(maxX, n.pos.x);
            minY = Math.min(minY, n.pos.y);
            maxY = Math.max(maxY, n.pos.y);
          }
          const sx = hw / Math.max(8, maxX - minX);
          const sy = hh / Math.max(8, maxY - minY);
          const px = (n: { pos: { x: number; y: number } }): number => hx + 4 + (n.pos.x - minX) * sx * 0.8;
          const py = (n: { pos: { x: number; y: number } }): number => hy + 4 + (n.pos.y - minY) * sy * 0.8;
          for (const e of run.volume.edges) {
            const a = nodes.find((n) => n.id === e.from);
            const b = nodes.find((n) => n.id === e.to);
            if (!a || !b) continue;
            ctx.beginPath();
            ctx.moveTo(px(a), py(a));
            ctx.lineTo(px(b), py(b));
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.35);
        ctx.font = mono(hh * 0.22, 500);
        ctx.textAlign = 'center';
        ctx.fillText('HOLO', hx + hw / 2, hy + hh * 0.58);
      }
    } else if (id === 'radio') {
      ctx.fillStyle = rgba(PALETTE.ember, 0.55);
      ctx.font = mono(sc.h * 0.16, 400);
      ctx.textAlign = 'left';
      const last = run.heard[run.heard.length - 1];
      const line = last ? last.text.slice(0, 18) : run.radioWaiting ? 'INCOMING…' : '—— 静默 ——';
      ctx.fillText(line, sc.x + 4, sc.y + sc.h * 0.55);
    } else if (id === 'camera') {
      ctx.fillStyle = '#05080c';
      ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
      if (run.lamp) {
        const g = ctx.createRadialGradient(sc.x + sc.w / 2, sc.y + sc.h, 4, sc.x + sc.w / 2, sc.y, sc.h);
        g.addColorStop(0, 'rgba(196,99,42,0.25)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
      }
    } else if (id === 'lab') {
      ctx.fillStyle = '#08060a';
      ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
      ctx.fillStyle = rgba(PALETTE.rustDeep, 0.55);
      ctx.fillRect(sc.x, sc.y + sc.h * 0.18, sc.w, sc.h * 0.64);
      ctx.fillStyle = rgba(PALETTE.abyss, 0.9);
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(sc.x + 3, sc.y + sc.h * (0.22 + i * 0.12), sc.w * 0.08, sc.h * 0.06);
        ctx.fillRect(sc.x + sc.w * 0.88, sc.y + sc.h * (0.22 + i * 0.12), sc.w * 0.08, sc.h * 0.06);
      }
      const scan = sc.y + sc.h * (0.2 + (0.5 + 0.5 * Math.sin(time * 1.6)) * 0.55);
      ctx.fillStyle = rgba(PALETTE.ember, 0.35);
      ctx.fillRect(sc.x, scan, sc.w, 2);
      ctx.fillStyle = rgba(PALETTE.ember, 0.55);
      ctx.font = mono(sc.h * 0.16, 500);
      ctx.textAlign = 'center';
      ctx.fillText(run.unanalyzedCount ? 'UNREAD' : 'LAB', sc.x + sc.w / 2, sc.y + sc.h * 0.58);
    } else if (id === 'life') {
      const v = run.vitals.vitals;
      const bars: [number, string][] = [
        [v.oxygen / v.oxygenMax, PALETTE.ember],
        [run.power, PALETTE.rust],
        [run.hull, PALETTE.boneDim],
        [1 - run.flood, PALETTE.blood],
      ];
      bars.forEach(([val, hex], i) => {
        const y = sc.y + sc.h * (0.18 + i * 0.2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(sc.x + 6, y, sc.w - 12, sc.h * 0.1);
        ctx.fillStyle = rgba(hex, 0.8);
        ctx.fillRect(sc.x + 6, y, (sc.w - 12) * clamp01(val), sc.h * 0.1);
      });
    } else {
      // salvage: 机械臂剪影
      ctx.strokeStyle = rgba(PALETTE.steelLit, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sc.x + sc.w * 0.2, sc.y + sc.h * 0.2);
      ctx.lineTo(sc.x + sc.w * 0.55, sc.y + sc.h * 0.55);
      ctx.lineTo(sc.x + sc.w * 0.8, sc.y + sc.h * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFlood(ctx: CanvasRenderingContext2D, run: PodRun, time: number): void {
    const flood = run.flood;
    if (flood < 0.02) return;
    const y = lerp(this.worldH * 0.96, this.worldH * 0.55, clamp01(flood));
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, this.worldH);
    g.addColorStop(0, 'rgba(18, 40, 52, 0.35)');
    g.addColorStop(0.4, 'rgba(10, 22, 32, 0.55)');
    g.addColorStop(1, 'rgba(4, 8, 12, 0.72)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= this.worldW; x += 24) {
      const n = valueNoise2(x * 0.01, time * 0.4, 3);
      ctx.lineTo(x, y + Math.sin(time * 1.6 + x * 0.02) * 3 + (n - 0.5) * 4);
    }
    ctx.lineTo(this.worldW, this.worldH);
    ctx.lineTo(0, this.worldH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D, run: PodRun, time: number, dt: number): void {
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 0.6 + hash2(Math.floor(time * 10), 2) * 1.8;
      this.drips.push({
        x: hash2(Math.floor(time * 7), 9) * this.worldW,
        y: this.worldH * 0.08,
        v: 40 + hash2(Math.floor(time * 3), 4) * 50,
        life: 1,
      });
    }
    ctx.save();
    ctx.fillStyle = 'rgba(180,190,200,0.35)';
    for (const d of this.drips) {
      d.y += d.v * dt;
      d.life -= dt * 0.25;
      ctx.globalAlpha = clamp01(d.life) * 0.5;
      ctx.fillRect(d.x, d.y, 1.4, 5);
    }
    this.drips = this.drips.filter((d) => d.life > 0 && d.y < this.worldH * 0.9);
    ctx.globalAlpha = 0.25 + run.power * 0.2;
    ctx.fillStyle = 'rgba(210,200,180,0.5)';
    for (const m of this.motes) {
      const x = m.x + Math.sin(time * 0.3 + m.p) * 8 * m.z;
      const y = (m.y + time * 6 * m.z) % (this.worldH * 0.75);
      ctx.fillRect(x, y, 1.2 * m.z, 1.2 * m.z);
    }
    ctx.restore();
  }

  /** 玩家在舱里的位置：一盏手持的、会呼吸的光，不是一个小人 */
  private drawPlayerPresence(ctx: CanvasRenderingContext2D, run: PodRun, time: number): void {
    const x = run.camX * this.worldW;
    const y = this.worldH * 0.72;
    const breath = 0.85 + Math.sin(time * 1.7) * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 8, x, y, this.worldH * 0.42 * breath);
    g.addColorStop(0, `rgba(232,196,140,${0.16 * breath * (run.blackout ? 0.25 : 1)})`);
    g.addColorStop(0.35, `rgba(196,99,42,${0.06 * breath})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, this.worldH * 0.42, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

export function stationHint(id: StationId): string {
  return `${STATIONS[id].name}  ·  点击进入`;
}
