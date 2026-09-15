/**
 * 《铁肺迷城》— 导演 AI (Agent A)
 * ============================================================
 * GDD §8。结构参考 Left4Dead 的 AI Director（张力曲线 + 强制喘息）
 * 与 Alien: Isolation 的双 AI（一个全知的导演，一个只拿到"提示"的怪物）。
 *
 * 三条铁律：
 *
 *   1. **严禁作弊**。导演知道玩家的一切，但它唯一的干预手段是发 DirectorOrder：
 *      生成点必须距离玩家 ≥3 跳（由 BFS 实测，不是估计），提示的置信度永远 < 1。
 *      它从不把怪物瞬移到你背后。所有恐怖必须是玩家自己走进去的。
 *   2. **必须安排喘息**。持续高压 = 无差别噪音，玩家会脱敏，恐怖归零。
 *      节奏是 AAA 与素人作品的分界线，所以喘息相在这里是硬编码的状态机，
 *      不是"概率性地少刷点怪"。
 *   3. **个性化恐吓**。画像不是统计报表，是武器：重度依赖声呐的玩家会遇到更多
 *      伪造回波，搜刮狂会捡到更多不存在的物资，虔诚者会更常听见唱诗班。
 *      被针对的恐惧远大于随机的恐惧。
 */

import type {
  DirectorContext, DirectorOrder, DirectorSystem, FabricationKind, ID,
  PlayerProfile, Room, StigmaKind, WorldSystem,
} from '../core/contract.ts';
import { clamp, clamp01, damp, lerp, smoothstep } from '../core/util.ts';
import { fbm2 } from '../core/rng.ts';
import { DEPTH_RANGE, TUNING } from './tuning.ts';
import type { ObservedAction } from './types.ts';

type Phase = 'build' | 'sustain' | 'relief';

/** 行为画像的原始计数器。全部按半衰期衰减，玩家改打法时导演要能跟上。 */
interface Counters {
  move: number;
  fast: number;
  search: number;
  sonar: number;
  melee: number;
  force: number;
  hide: number;
  hold: number;
  rest: number;
  debunk: number;
  panicFlee: number;
  panicFight: number;
  panicFreeze: number;
  pietyFor: number;
  pietyAgainst: number;
}

const ZERO_COUNTERS: Counters = {
  move: 0, fast: 0, search: 0, sonar: 0, melee: 0, force: 0, hide: 0, hold: 0,
  rest: 0, debunk: 0, panicFlee: 0, panicFight: 0, panicFreeze: 0,
  pietyFor: 0, pietyAgainst: 0,
};

/** 默认兽栏。Agent D 的实际 id 若不同，主循环调 configureBestiary() 覆盖即可。 */
const DEFAULT_BESTIARY: readonly { id: ID; minDeck: number; weight: number; stealthy: boolean }[] = [
  { id: 'ent.crawler', minDeck: 1, weight: 1.0, stealthy: true },
  { id: 'ent.drowned', minDeck: 1, weight: 0.8, stealthy: false },
  { id: 'ent.tender', minDeck: 2, weight: 0.7, stealthy: false },
  { id: 'ent.choir', minDeck: 3, weight: 0.6, stealthy: true },
  { id: 'ent.hollow', minDeck: 3, weight: 0.5, stealthy: true },
  { id: 'ent.listener', minDeck: 4, weight: 0.35, stealthy: true },
];

/** 喘息室的优先舱段。人味最重的地方最适合让玩家把心跳降下来。 */
const RELIEF_ARCHETYPES = new Set(['bunks', 'galley', 'medbay', 'bridge', 'sonar-room']);

/** flags 里的行为计数键。其他 Agent 只要按约定 add()，导演就自动能读到，无需互相 import。 */
const FLAG_COUNTERS: readonly [keyof Counters, string][] = [
  ['move', 'count.move'],
  ['fast', 'count.run'],
  ['search', 'count.search'],
  ['sonar', 'count.sonar'],
  ['melee', 'count.melee'],
  ['force', 'count.force-door'],
  ['hide', 'count.hide'],
  ['hold', 'count.hold-breath'],
  ['rest', 'count.rest'],
  ['debunk', 'count.debunk'],
];

export class Director implements DirectorSystem {
  private _tension = 0;
  private _intensity = 0;
  private phase: Phase = 'build';
  private phaseUntil = 0;

  private credits = 0;
  private lastBreath = 0;
  private counters: Counters = { ...ZERO_COUNTERS };
  private flagSeen = new Map<string, number>();

  /** 导演自己下单生成的实体，用于事后发提示。它不知道别人生成的东西在哪——这是故意的。 */
  private fielded: { id: ID; roomId: ID; bornAt: number }[] = [];
  private bestiary = DEFAULT_BESTIARY;

  private lastReliefRoom: ID | null = null;
  private reliefsGranted = 0;
  private spawnsOrdered = 0;
  /** 上一次 tick 时房间的噪音，用来判断"玩家刚刚弄出了动静"。 */
  private lastNoise = 0;

  private readonly decayPerBreath = Math.pow(0.5, 1 / TUNING.director.profileHalfLife);

  get tension(): number {
    return this._tension;
  }

  get intensity(): number {
    return this._intensity;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  get stats(): { reliefs: number; spawns: number; credits: number } {
    return { reliefs: this.reliefsGranted, spawns: this.spawnsOrdered, credits: this.credits };
  }

  configureBestiary(table: readonly { id: ID; minDeck: number; weight: number; stealthy: boolean }[]): void {
    if (table.length > 0) this.bestiary = table;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 主循环
  // ──────────────────────────────────────────────────────────────────────

  tick(ctx: DirectorContext): readonly DirectorOrder[] {
    const dt = Math.max(0, ctx.breathsElapsed - this.lastBreath);
    this.lastBreath = ctx.breathsElapsed;
    if (dt <= 0) return [];

    this.decay(dt);
    this.syncFlags(ctx);

    const room = this.currentRoom(ctx.world);
    const stress = this.stress(ctx, room);
    const D = TUNING.director;

    this._tension = damp(this._tension, stress, D.tensionLambda, dt);

    // 强度是"玩家被压了多久"的积分，不是"现在多可怕"。
    // 它只在张力高于地板线时增长——这条线定义了什么叫"高压"。
    if (this._tension > D.intensityFloor) {
      this._intensity = clamp01(this._intensity + (this._tension - D.intensityFloor) * D.intensityGain * dt);
    } else {
      this._intensity = clamp01(this._intensity - D.intensityDecay * dt * (1 - this._tension));
    }

    this.credits = Math.min(D.creditCap, this.credits + D.creditPerBreath * dt);

    const orders: DirectorOrder[] = [];
    this.runPhase(ctx, orders);
    this.emitAmbience(ctx, orders);
    if (this.phase !== 'relief') {
      this.maybeSpawn(ctx, orders);
      this.maybeHint(ctx, room, orders);
    }
    this.maybeFabricate(ctx, orders);

    this.lastNoise = room?.noise ?? 0;
    return orders;
  }

  /**
   * 玩家压力函数。权重之和为 1，所以 stress 天然落在 0..1。
   * 注意它读的是**真值**而不是 perceived()：导演必须知道玩家实际有多惨，
   * 否则 Veracity Layer 会把导演自己也骗了，节奏就彻底乱套。
   */
  private stress(ctx: DirectorContext, room: Room | null): number {
    const w = TUNING.director.stressWeights;
    const v = ctx.vitals;
    const noise = room && room.noiseThreshold > 0 ? clamp01(room.noise / room.noiseThreshold) : 0;
    return clamp01(
      w.fear * (v.fear / 100) +
      w.oxygen * (1 - clamp01(v.oxygen / Math.max(1, v.oxygenMax))) +
      w.co2 * (v.co2 / 100) +
      w.san * (1 - clamp01(v.san / Math.max(1, v.sanMax))) +
      w.trauma * (v.trauma / 100) +
      w.noise * noise,
    );
  }

  /** 张力曲线状态机 —— 这段代码就是本作的"节奏感"。 */
  private runPhase(ctx: DirectorContext, orders: DirectorOrder[]): void {
    const D = TUNING.director;
    const now = ctx.breathsElapsed;

    switch (this.phase) {
      case 'build':
        if (this._intensity >= D.peakAt) {
          this.phase = 'sustain';
          this.phaseUntil = now + ctx.rng.float(D.sustain[0], D.sustain[1]);
          orders.push({ kind: 'escalate', amount: 0.35 + this._tension * 0.3 });
        } else if (this._tension < 0.25 && ctx.rng.bool(0.04)) {
          // 玩家太安逸了。轻推一下，但不生成任何东西——只是让船响一声。
          orders.push({ kind: 'escalate', amount: 0.12 });
        }
        break;

      case 'sustain':
        // 高压相里也只是"更吵"，不是"更强"。真正的危险来自玩家在高压下做的蠢事。
        if (now >= this.phaseUntil || this._tension > 0.9) {
          this.phase = 'relief';
          this.phaseUntil = now + ctx.rng.float(D.relief[0], D.relief[1]);
          this.grantRelief(ctx, orders);
        } else if (ctx.rng.bool(0.06)) {
          orders.push({ kind: 'escalate', amount: 0.2 });
        }
        break;

      case 'relief':
        if (now >= this.phaseUntil && this._intensity <= D.relaxTo) {
          this.phase = 'build';
        } else if (this._intensity > D.relaxTo) {
          // 喘息相里主动把强度往下拽：玩家需要的是真的松一口气，不是"稍微少一点压"。
          this._intensity = Math.max(0, this._intensity - D.intensityDecay * 0.6);
        }
        break;

      default:
        this.phase = 'build';
        break;
    }
  }

  private grantRelief(ctx: DirectorContext, orders: DirectorOrder[]): void {
    const room = this.pickReliefRoom(ctx);
    if (!room) return;
    this.lastReliefRoom = room;
    this.reliefsGranted++;
    orders.push({ kind: 'grant-relief', roomId: room });
    orders.push({ kind: 'ambience', cue: 'amb.hull-settle', intensity: 0.25 });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 生成与提示 —— "严禁作弊"在这里被机械地强制执行
  // ──────────────────────────────────────────────────────────────────────

  private maybeSpawn(ctx: DirectorContext, orders: DirectorOrder[]): void {
    const D = TUNING.director;
    if (this.credits < D.spawnCost) return;
    // 生成概率与张力挂钩，但与强度**反向**挂钩：已经被压了很久的玩家不该再挨一刀。
    const p = 0.05 * this._tension * (1.2 - this._intensity);
    if (!ctx.rng.bool(clamp01(p))) return;

    const dist = this.distances(ctx.world);
    const candidates: [ID, number][] = [];
    for (const [id, hops] of dist) {
      if (hops < D.minSpawnHops) continue;
      const room = ctx.world.rooms.get(id);
      if (!room || room.veracity === 'phantom') continue;
      // 越远越可能，但不至于生成到地图另一端去——那样玩家永远碰不到它。
      candidates.push([id, 1 / (1 + Math.abs(hops - (D.minSpawnHops + 2)))]);
    }
    if (candidates.length === 0) return;

    const roomId = ctx.rng.weighted(candidates);
    const room = ctx.world.rooms.get(roomId);
    if (!room) return;

    const profile = this.profile();
    const pool = this.bestiary
      .filter((e) => e.minDeck <= room.deck)
      // 潜行型玩家碰上潜行型怪物才有戏；莽夫就给他一个能正面撞上的东西。
      .map((e) => [e, e.weight * (e.stealthy ? 1.4 - profile.aggression : 0.6 + profile.aggression)] as [typeof e, number]);
    if (pool.length === 0) return;

    const entity = ctx.rng.weighted(pool);
    this.credits -= D.spawnCost;
    this.spawnsOrdered++;
    this.fielded.push({ id: entity.id, roomId, bornAt: ctx.breathsElapsed });
    orders.push({
      kind: 'spawn',
      entity: entity.id,
      roomId,
      reason: `tension=${this._tension.toFixed(2)} hops=${dist.get(roomId)} phase=${this.phase}`,
    });
  }

  /**
   * 给已在场的怪物一条线索。
   * 置信度来自**玩家自己制造的噪音**，而不是导演的上帝视角——
   * 这让"安静"在机械层面真正有意义，也让提示永远是玩家行为的后果。
   */
  private maybeHint(ctx: DirectorContext, room: Room | null, orders: DirectorOrder[]): void {
    if (!room || this.fielded.length === 0) return;
    const noiseDelta = room.noise - this.lastNoise;
    const loudness = clamp01(room.noise / Math.max(1, room.noiseThreshold));
    if (noiseDelta <= 0.5 && loudness < 0.4) return;

    const D = TUNING.director;
    const confidence = clamp(
      loudness * 0.6 + clamp01(noiseDelta / 20) * 0.5,
      0.1, D.maxHintConfidence,
    );

    // 提示指向"玩家所在房间的一个邻居"，不是玩家本人。它在靠近，不是在命中。
    const neighbours = room.doors
      .filter((d) => ctx.world.rooms.has(d.to))
      .map((d) => d.to);
    const towards = neighbours.length > 0 && ctx.rng.bool(0.45) ? ctx.rng.pick(neighbours) : room.id;

    const target = ctx.rng.pick(this.fielded);
    orders.push({ kind: 'hint', entityId: target.id, towards, confidence });
  }

  private emitAmbience(ctx: DirectorContext, orders: DirectorOrder[]): void {
    // 用分形噪声给环境音一个缓慢的有机起伏，避免"氛围强度 = 张力"这种一眼看穿的线性关系。
    const organic = fbm2(ctx.breathsElapsed * 0.012, this._intensity * 3, 3, 7717);
    const depthN = clamp01((ctx.flags.getNum('sys.depth', DEPTH_RANGE[0]) - DEPTH_RANGE[0]) /
      (DEPTH_RANGE[1] - DEPTH_RANGE[0]));

    let cue: string;
    if (this.phase === 'relief') cue = 'amb.quiet-water';
    else if (this._tension > 0.72) cue = 'amb.close-breathing';
    else if (this._tension > 0.45) cue = 'amb.hull-stress';
    else cue = depthN > 0.6 ? 'amb.deep-drone' : 'amb.ballast-tick';

    orders.push({
      kind: 'ambience',
      cue,
      intensity: clamp01(lerp(this._tension, organic, 0.3) * (this.phase === 'relief' ? 0.45 : 1)),
    });
  }

  /**
   * 个性化恐吓。这是画像系统唯一的存在理由：
   * 把玩家最依赖的那条感知通道变成他最不敢相信的那一条。
   */
  private maybeFabricate(ctx: DirectorContext, orders: DirectorOrder[]): void {
    const p = this.profile();
    const g = TUNING.director.personalizationGain;
    const picks: [FabricationKind, number][] = [
      // 声呐依赖者：伪造回波与不可能的几何。他越信声呐，声呐越会害他。
      ['impossible-geometry', 0.25 + p.sonarReliance * g],
      ['mirrored-room', 0.2 + p.sonarReliance * g * 0.7],
      // 搜刮狂：让他捡到不存在的补给，并在背包里发现它变了名字。
      ['fake-item', 0.25 + p.thoroughness * g],
      // 莽夫：假门与假脚步，惩罚"不看就冲"。
      ['fake-door', 0.15 + p.aggression * g * 0.6],
      ['footstep', 0.3 + p.aggression * g * 0.4],
      // 虔诚者：声音与假人。他想听见的东西，它会说给他听。
      ['voice', 0.2 + p.piety * g * 0.8],
      ['fake-npc', 0.12 + p.piety * g * 0.5],
      // 僵住型玩家：假记忆与假存档，攻击他"停下来想一想"的习惯。
      ['false-memory', 0.15 + (p.panicResponse === 'freeze' ? g * 0.5 : 0)],
      ['save-prompt', 0.08 + (p.panicResponse === 'freeze' ? g * 0.3 : 0)],
      ['hud-drift', 0.35],
    ];

    // 每 tick 至多下单一次伪造：Veracity 自己还有冷却与层级门槛，这里只负责"倾向"。
    if (!ctx.rng.bool(clamp01(0.05 + this._tension * 0.12))) return;
    orders.push({ kind: 'fabricate', lie: ctx.rng.weighted(picks) });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 玩家画像
  // ──────────────────────────────────────────────────────────────────────

  /** 由其他系统显式喂入行为。没人喂也没关系，syncFlags() 会兜底。 */
  observe(action: ObservedAction, fear = 0): void {
    const c = this.counters;
    switch (action.kind) {
      case 'move': c.move++; if (action.fast) c.fast++; break;
      case 'search': c.search += action.thorough ? 1.6 : 1; break;
      case 'sonar': c.sonar += 0.6 + action.power * 0.5; break;
      case 'melee': c.melee++; break;
      case 'force': c.force++; break;
      case 'hide': c.hide++; break;
      case 'rest': c.rest++; break;
      case 'debunk': c.debunk++; break;
      case 'hold-breath': c.hold += Math.min(3, action.breaths / 8); break;
      case 'flee': c.panicFlee += fear >= TUNING.fear.panicAt ? 1 : 0.3; break;
      case 'freeze': c.panicFreeze += fear >= TUNING.fear.panicAt ? 1 : 0.3; break;
      case 'ritual': this.notePiety(action.stigma); break;
      default: break;
    }
    if (action.kind === 'melee' && fear >= TUNING.fear.panicAt) c.panicFight++;
  }

  private notePiety(stigma: StigmaKind): void {
    // 顺从教团的四种印记算"虔诚"，缄默中立，叛教是反向票。
    if (stigma === 'apostasy') this.counters.pietyAgainst += 1;
    else if (stigma === 'silence') this.counters.pietyAgainst += 0.3;
    else this.counters.pietyFor += 1;
  }

  /** 从 flags 的 count.* 键里补读行为，让导演对"没有调用 observe 的系统"也有效。 */
  private syncFlags(ctx: DirectorContext): void {
    for (const [field, key] of FLAG_COUNTERS) {
      const cur = ctx.flags.getNum(key, 0);
      const seen = this.flagSeen.get(key) ?? 0;
      if (cur > seen) {
        this.counters[field] += cur - seen;
        this.flagSeen.set(key, cur);
      }
    }
    for (const s of ['listening', 'drowned', 'iron', 'flesh', 'silence', 'apostasy'] as StigmaKind[]) {
      const key = `stigma.${s}`;
      const cur = ctx.flags.getNum(key, 0);
      const seen = this.flagSeen.get(key) ?? 0;
      if (cur > seen) {
        for (let i = 0; i < cur - seen; i++) this.notePiety(s);
        this.flagSeen.set(key, cur);
      }
    }
  }

  private decay(dt: number): void {
    const f = Math.pow(this.decayPerBreath, dt);
    for (const k of Object.keys(this.counters) as (keyof Counters)[]) {
      this.counters[k] *= f;
    }
    // 场上实体的记忆也会过期：导演不会永远记得它三十分钟前扔在 D2 的那只东西。
    this.fielded = this.fielded.filter((e) => this.lastBreath - e.bornAt < 400);
  }

  profile(): PlayerProfile {
    const c = this.counters;
    const violent = c.melee + c.force * 0.7 + c.fast * 0.4;
    const careful = c.hide + c.hold + c.rest * 0.5;
    const aggression = clamp01(violent / (violent + careful + 2));

    const actions = c.move + c.sonar + c.search + 2;
    const thoroughness = clamp01(smoothstep(c.search / actions * 2.6));
    const sonarReliance = clamp01(smoothstep(c.sonar / actions * 2.2));

    const pietyTotal = c.pietyFor + c.pietyAgainst;
    const piety = pietyTotal < 0.5 ? 0.5 : clamp01(c.pietyFor / pietyTotal);

    let panicResponse: PlayerProfile['panicResponse'] = 'unknown';
    const panicTotal = c.panicFlee + c.panicFight + c.panicFreeze;
    if (panicTotal >= 1.5) {
      if (c.panicFreeze >= c.panicFlee && c.panicFreeze >= c.panicFight) panicResponse = 'freeze';
      else if (c.panicFlee >= c.panicFight) panicResponse = 'flee';
      else panicResponse = 'fight';
    }

    return { aggression, thoroughness, sonarReliance, piety, panicResponse };
  }

  // ──────────────────────────────────────────────────────────────────────
  // 图论工具
  // ──────────────────────────────────────────────────────────────────────

  private currentRoom(world: WorldSystem): Room | null {
    return world.rooms.get(world.currentRoomId) ?? null;
  }

  /** 从玩家所在房间出发的跳数。焊死/封死的门不计入——那不是一条路。 */
  private distances(world: WorldSystem): Map<ID, number> {
    const dist = new Map<ID, number>();
    const start = world.currentRoomId;
    if (!world.rooms.has(start)) return dist;
    dist.set(start, 0);
    const queue: ID[] = [start];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      const d = dist.get(id) ?? 0;
      const room = world.rooms.get(id);
      if (!room) continue;
      for (const door of room.doors) {
        if (door.state === 'welded' || door.state === 'sealed') continue;
        if (dist.has(door.to) || !world.rooms.has(door.to)) continue;
        dist.set(door.to, d + 1);
        queue.push(door.to);
      }
    }
    return dist;
  }

  private pickReliefRoom(ctx: DirectorContext): ID | null {
    const D = TUNING.director;
    const dist = this.distances(ctx.world);
    const candidates: [ID, number][] = [];
    for (const [id, hops] of dist) {
      if (hops < D.minReliefHops) continue;
      const room = ctx.world.rooms.get(id);
      if (!room || room.veracity === 'phantom') continue;
      let w = 1;
      if (RELIEF_ARCHETYPES.has(room.archetype)) w *= 3;
      w *= 1 - clamp01(room.ambient.presence) * 0.8;
      w *= 1 - clamp01(room.ambient.flooding) * 0.6;
      w /= 1 + hops * 0.25;
      if (id === this.lastReliefRoom) w *= 0.2;  // 别老把人往同一个避难所赶
      if (w > 0.01) candidates.push([id, w]);
    }
    if (candidates.length === 0) return null;
    return ctx.rng.weighted(candidates);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 存档
  // ──────────────────────────────────────────────────────────────────────

  serialize(): unknown {
    return {
      tension: this._tension,
      intensity: this._intensity,
      phase: this.phase,
      phaseUntil: this.phaseUntil,
      credits: this.credits,
      lastBreath: this.lastBreath,
      counters: { ...this.counters },
      fielded: this.fielded.map((f) => ({ ...f })),
      flagSeen: Object.fromEntries(this.flagSeen),
      reliefs: this.reliefsGranted,
      spawns: this.spawnsOrdered,
    };
  }

  hydrate(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;
    this._tension = typeof d.tension === 'number' ? d.tension : 0;
    this._intensity = typeof d.intensity === 'number' ? d.intensity : 0;
    this.phase = (d.phase as Phase) ?? 'build';
    this.phaseUntil = typeof d.phaseUntil === 'number' ? d.phaseUntil : 0;
    this.credits = typeof d.credits === 'number' ? d.credits : 0;
    this.lastBreath = typeof d.lastBreath === 'number' ? d.lastBreath : 0;
    this.counters = { ...ZERO_COUNTERS, ...(d.counters as Partial<Counters> | undefined) };
    this.fielded = Array.isArray(d.fielded) ? (d.fielded as typeof this.fielded).map((f) => ({ ...f })) : [];
    this.flagSeen = new Map(Object.entries((d.flagSeen as Record<string, number>) ?? {}));
    this.reliefsGranted = typeof d.reliefs === 'number' ? d.reliefs : 0;
    this.spawnsOrdered = typeof d.spawns === 'number' ? d.spawns : 0;
  }
}
