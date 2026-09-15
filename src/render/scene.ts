/**
 * 主场景渲染 —— Canvas2D
 * ============================================================================
 * 「声呐屏 + 舱内剖面」双层视图的合成层。自己不画像素级细节，
 * 只负责：布局、把三个子渲染器摆在正确的位置、并保证它们共享同一套光照。
 *
 * 渲染顺序（每一步都会被下一步的光照影响，顺序不能换）：
 *   1. 舱内剖面（静态烘焙 + 动态光照）
 *   2. 声呐 PPI（它自己就是场景里最亮的光源）
 *   3. 剖面显示器 + 船体仪表
 *   4. 台面前缘压暗，把玩家「压」在舱里
 *
 * 输出是一张 Canvas2D，交给 post.ts 上 GPU。
 */

import type { ID, Room, SonarResult, Vitals } from '../core/contract';
import { clamp, clamp01, damp, smoothstep } from '../core/util';
import { valueNoise2 } from '../core/rng';
import { PALETTE, rgba } from './palette';
import { InteriorRenderer, lampFlicker, type InteriorLayout } from './interior';
import { SonarScope, type ContactKind, type SonarContact } from './sonar';
import { SchematicDisplay, drawGaugeCluster, type GaugeReading } from './schematic';

export interface SceneState {
  time: number;
  dt: number;
  vitals: Vitals;
  depth: number;
  /** 0..1 */
  flooding: number;
  /** 手电 0..1 */
  torch: number;
  /** 供电 0..1 */
  power: number;
  /** 当前房间噪音归一 0..1 */
  noise: number;
  /** Veracity 污染 0..1 */
  corruption: number;
  breathPhase: number;
  heartPulse: number;
  rooms: readonly Room[];
  currentRoomId: ID;
  highlighted: readonly ID[];
  /** 是否在屏息 */
  holdingBreath: boolean;
}

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly interior = new InteriorRenderer();
  readonly sonar = new SonarScope();
  readonly schematic = new SchematicDisplay();

  private w = 0;
  private h = 0;
  private scopeGlow = 0.25;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: false });
    if (!ctx) throw new Error('[scene] 无法获取 2D 上下文');
    this.ctx = ctx;
  }

  get layout(): InteriorLayout {
    return this.interior.layout;
  }

  resize(w: number, h: number): void {
    const iw = Math.max(16, Math.round(w));
    const ih = Math.max(9, Math.round(h));
    if (iw === this.w && ih === this.h) return;
    this.w = iw;
    this.h = ih;
    this.canvas.width = iw;
    this.canvas.height = ih;
    this.interior.ensure(iw, ih);
  }

  /** 把 Agent B 的 SonarResult 翻译成屏幕上的回波 */
  applySonar(result: SonarResult, rooms: readonly Room[], currentRoomId: ID, power: number): void {
    this.sonar.contacts = sonarContactsFrom(result, rooms, currentRoomId);
    this.sonar.ping(power);
  }

  render(s: SceneState): void {
    const ctx = this.ctx;
    const { w, h } = this;
    if (w === 0 || h === 0) return;
    const L = this.interior.layout;

    // 屏幕辉光跟随脉冲能量，供电不足时整块屏会暗下去
    const targetGlow = clamp01((0.20 + this.sonar.energy * 0.9) * clamp01(s.power * 1.3));
    this.scopeGlow = damp(this.scopeGlow, targetGlow, 6, Math.min(s.dt, 0.1));
    this.sonar.gain = clamp01(s.power * 1.25);
    this.sonar.interference = clamp01(0.06 + s.noise * 0.45 + s.corruption * 0.42 + (1 - clamp01(s.vitals.san / 100)) * 0.25);
    this.sonar.corruption = s.corruption;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.abyss;
    ctx.fillRect(0, 0, w, h);

    // --- 1. 舱内剖面 ---
    this.interior.draw(ctx, {
      time: s.time,
      dt: s.dt,
      torch: s.torch,
      power: s.power,
      flooding: s.flooding,
      scopeGlow: this.scopeGlow,
      breathPhase: s.breathPhase,
      heartPulse: s.heartPulse,
      corruption: s.corruption,
      noise: s.noise,
    });

    // --- 2. 声呐 PPI ---
    this.sonar.update(s.dt);
    // 屏息时手会稳下来，画面里的抖动也跟着收
    const steady = s.holdingBreath ? 0.35 : 1;
    const jx = (valueNoise2(s.time * 1.7, 0, 3) - 0.5) * h * 0.0035 * steady;
    const jy = (valueNoise2(0, s.time * 1.9, 7) - 0.5) * h * 0.0035 * steady + s.breathPhase * h * 0.0022;
    this.sonar.draw(ctx, L.scope.cx + jx, L.scope.cy + jy, L.scope.r, s.time);

    // --- 3. 剖面显示器 ---
    this.schematic.draw(ctx, L.schematic.x + jx * 0.6, L.schematic.y + jy * 0.6, L.schematic.w, L.schematic.h, {
      rooms: s.rooms,
      currentRoomId: s.currentRoomId,
      time: s.time,
      depth: s.depth,
      flooding: s.flooding,
      corruption: s.corruption,
      power: s.power,
      highlighted: s.highlighted,
    });

    // --- 4. 船体仪表组 ---
    const v = s.vitals;
    const gauges: GaugeReading[] = [
      { label: 'ATM', value: clamp01(s.depth / 2100), danger: 0.82, jitter: 0.010 + s.noise * 0.03 },
      { label: 'BALLAST', value: clamp01(1 - s.flooding), danger: undefined, jitter: 0.016 },
      { label: 'BUS-A', value: clamp01(s.power), danger: undefined, jitter: 0.03 * lampFlicker(s.time, 1) },
      { label: 'CO₂', value: clamp01(v.co2 / 100), danger: 0.72, jitter: 0.012 },
    ];
    drawGaugeCluster(
      ctx,
      L.gauges.x + jx * 0.6, L.gauges.y + jy * 0.6, L.gauges.w, L.gauges.h,
      gauges, s.time, this.scopeGlow * 0.6 + s.torch * 0.4,
    );

    // --- 5. 台面前缘压暗 ---
    const front = ctx.createLinearGradient(0, h * 0.86, 0, h);
    front.addColorStop(0, 'rgba(0,0,0,0)');
    front.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = front;
    ctx.fillRect(0, h * 0.86, w, h * 0.14);

    // --- 6. 低 SAN：舱壁上爬出来的东西（只在余光里） ---
    if (s.corruption > 0.45) this.drawPresence(ctx, s);
  }

  /**
   * 「注视感」：不是跳脸，是墙上多出来的一块比周围更黑的形状。
   * 玩家往往先感觉不对，过两秒才看出那是个人形 —— 这比任何 jumpscare 都有效。
   */
  private drawPresence(ctx: CanvasRenderingContext2D, s: SceneState): void {
    const { w, h } = this;
    const t = clamp01((s.corruption - 0.45) / 0.45);
    const drift = Math.sin(s.time * 0.13) * w * 0.10;
    const x = w * 0.885 + drift;
    const y = h * 0.44;
    const sc = h * 0.30;
    const a = t * (0.30 + 0.16 * Math.sin(s.time * 0.61));

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(2,3,6,${a.toFixed(3)})`;
    ctx.beginPath();
    // 头
    ctx.ellipse(x, y - sc * 0.72, sc * 0.20, sc * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    // 肩与躯干：拉长、不成比例
    ctx.beginPath();
    ctx.moveTo(x - sc * 0.34, y - sc * 0.40);
    ctx.quadraticCurveTo(x, y - sc * 0.58, x + sc * 0.34, y - sc * 0.40);
    ctx.quadraticCurveTo(x + sc * 0.26, y + sc * 0.95, x, y + sc * 1.05);
    ctx.quadraticCurveTo(x - sc * 0.26, y + sc * 0.95, x - sc * 0.34, y - sc * 0.40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 两个反光点。只有它们是亮的。
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const eye = t * (0.12 + 0.10 * Math.sin(s.time * 1.9));
    ctx.fillStyle = rgba(PALETTE.ember, eye);
    ctx.beginPath();
    ctx.arc(x - sc * 0.075, y - sc * 0.74, sc * 0.016, 0, Math.PI * 2);
    ctx.arc(x + sc * 0.075, y - sc * 0.74, sc * 0.016, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 供 post 上传纹理 */
  get source(): HTMLCanvasElement {
    return this.canvas;
  }
}

// ============================================================================
// SonarResult → 屏幕极坐标
// ============================================================================

const KIND_BY_ARCHETYPE: Partial<Record<Room['archetype'], ContactKind>> = {
  corridor: 'room',
  crawlspace: 'room',
  flooded: 'wreck',
  void: 'anomaly',
  moonpool: 'wreck',
  chapel: 'room',
  reliquary: 'room',
};

/**
 * 把「名义坐标」换算成方位 / 距离。
 * 注意：Room.pos 与真实拓扑可能矛盾（GDD 明说这是故意的），
 * 我们照画不误 —— 屏幕上的矛盾正是玩家要推理的线索。
 */
export function sonarContactsFrom(
  result: SonarResult,
  rooms: readonly Room[],
  currentRoomId: ID,
): SonarContact[] {
  const byId = new Map<ID, Room>();
  for (const r of rooms) byId.set(r.id, r);
  const me = byId.get(currentRoomId);
  if (!me) return [];

  const artifacts = new Set(result.artifacts);
  const anomalyAt = new Map<ID, number>();
  for (const a of result.anomalies) anomalyAt.set(a.at, a.confidence);

  // 归一化半径：最远的被揭示房间落在屏幕边缘的 92%
  let maxD = 1e-6;
  const entries: { room: Room; d: number; dx: number; dy: number }[] = [];
  for (const id of result.revealed) {
    const r = byId.get(id);
    if (!r || r.id === currentRoomId) continue;
    const dx = r.pos.x - me.pos.x;
    const dy = r.pos.y - me.pos.y + (r.deck - me.deck) * 2.2;
    const d = Math.hypot(dx, dy);
    if (d > maxD) maxD = d;
    entries.push({ room: r, d, dx, dy });
  }

  const contacts: SonarContact[] = [];
  for (const e of entries) {
    const bearing = Math.atan2(e.dx, -e.dy);
    const range = clamp(e.d / maxD, 0.08, 1) * 0.92;
    const isArtifact = artifacts.has(e.room.id);
    const conf = anomalyAt.get(e.room.id);
    const kind: ContactKind = isArtifact
      ? 'artifact'
      : conf !== undefined
        ? conf > 0.75 ? 'listener' : 'anomaly'
        : KIND_BY_ARCHETYPE[e.room.archetype] ?? 'room';

    const strength = clamp01(
      (kind === 'listener' ? 1 : kind === 'anomaly' ? 0.82 : 0.55 + (e.room.visited ? 0.22 : 0)) *
        (1 - range * 0.35),
    );
    contacts.push({
      id: e.room.id,
      bearing,
      range,
      strength,
      arc: clamp(0.11 + (1 - range) * 0.40, 0.05, 0.85),
      kind,
      label: e.room.name,
    });

    // 门：在房间回波上再打一个更窄更亮的记号
    for (const door of e.room.doors) {
      if (door.state === 'sealed' || door.state === 'welded') continue;
      contacts.push({
        id: `${e.room.id}:${door.id}`,
        bearing: bearing + (door.unstable ? 0.05 : -0.05),
        range: range * 0.94,
        strength: strength * 0.5,
        arc: 0.035,
        kind: 'door',
      });
    }
  }

  // 本舱的舱壁：一圈近距离的强回波，让屏幕中心永远不空
  const hullR = 0.16;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    contacts.push({
      id: `hull${i}`,
      bearing: a,
      range: hullR + valueNoise2(i * 3.1, 0, 5) * 0.035,
      strength: 0.30 + valueNoise2(i * 1.7, 2, 9) * 0.22,
      arc: 0.24,
      kind: 'hull',
    });
  }

  return contacts;
}

/** 演示与实战共用：由 Vitals 推导屏幕辉光与手电亮度的默认曲线 */
export function deriveLighting(v: Vitals, power: number): { torch: number; glow: number } {
  const fearN = clamp01(v.fear / 100);
  return {
    torch: clamp01(0.55 + power * 0.35 - fearN * 0.12),
    glow: clamp01(power * (0.7 + smoothstep(1 - fearN) * 0.2)),
  };
}
