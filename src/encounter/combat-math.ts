/**
 * 遭遇的判定内核。动作库与引擎共用这一份，保证"玩家打它"和"它打玩家"
 * 走的是同一套命中与部位逻辑。
 *
 * 一条原则贯穿全文件：**光、认知、距离三者共同决定命中率**，力量只决定伤害。
 * 黑暗里挥斧子打不中，不是因为斧子不好，是因为你不知道它在哪。
 */

import type {
  CombatOutcome,
  DistanceBand,
  Effect,
  Entity,
  ID,
} from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { enemyDef } from '../content/bestiary/index';
import type { Decoy, EnemyDef, EntityBehavior, EncounterRuntime, PartDef, Sense } from './types';

export const BANDS: readonly DistanceBand[] = ['unknown', 'far', 'near', 'adjacent', 'contact'];

export function bandIndex(b: DistanceBand): number {
  const i = BANDS.indexOf(b);
  return i < 0 ? 0 : i;
}

export function bandAt(i: number): DistanceBand {
  return BANDS[clamp(Math.round(i), 0, BANDS.length - 1)];
}

export function bandOf(rt: EncounterRuntime, entityId: ID): DistanceBand {
  return rt.distance[entityId] ?? 'unknown';
}

/** 位移距离档。返回新的档位；unknown 只能由"它重新找到你"来离开 */
export function shiftBand(rt: EncounterRuntime, entityId: ID, delta: number): DistanceBand {
  const cur = bandIndex(bandOf(rt, entityId));
  const next = bandAt(clamp(cur + delta, 1, 4));
  rt.distance[entityId] = next;
  return next;
}

export function setBand(rt: EncounterRuntime, entityId: ID, band: DistanceBand): void {
  rt.distance[entityId] = band;
}

// ---------------------------------------------------------------------------
// 实体查询
// ---------------------------------------------------------------------------

export function liveEntities(rt: EncounterRuntime): Entity[] {
  return rt.entities.filter((e) => e.hp > 0 || enemyDef(e.defId).unkillable);
}

export function findEntity(rt: EncounterRuntime, id?: ID): Entity | undefined {
  if (id) return rt.entities.find((e) => e.id === id);
  // 未指定目标时选"最可能已经锁定你的那一个"
  const live = liveEntities(rt);
  if (!live.length) return undefined;
  return live.reduce((a, b) => (b.awareness > a.awareness ? b : a));
}

export function defOf(e: Entity): EnemyDef {
  return enemyDef(e.defId);
}

export function partDefOf(def: EnemyDef, partId: ID): PartDef | undefined {
  return def.parts.find((p) => p.id === partId);
}

export function behaviorOf(rt: EncounterRuntime, e: Entity): EntityBehavior {
  let b = rt.behaviors.get(e.id);
  if (!b) {
    b = freshBehavior();
    rt.behaviors.set(e.id, b);
  }
  return b;
}

export function freshBehavior(): EntityBehavior {
  return {
    blind: new Set<Sense>(),
    approachMul: 1,
    powerMul: 1,
    evasionAdd: 0,
    forbidden: new Set(),
    canCall: true,
    bleed: 0,
    awarenessDecayAdd: 0,
  };
}

/** 从"已摧毁部位"重新推导整套行为。摧毁效果必须是可复算的，否则读档会丢 */
export function recomputeBehavior(rt: EncounterRuntime, e: Entity): EntityBehavior {
  const def = defOf(e);
  const b = freshBehavior();
  for (const p of def.parts) {
    if (!rt.destroyed.has(`${e.id}:${p.id}`)) continue;
    const c = p.consequence;
    if (c.blindTo) for (const s of c.blindTo) b.blind.add(s);
    if (c.approachMul !== undefined) b.approachMul *= c.approachMul;
    if (c.powerMul !== undefined) b.powerMul *= c.powerMul;
    if (c.evasionAdd !== undefined) b.evasionAdd += c.evasionAdd;
    if (c.forbidIntents) for (const k of c.forbidIntents) b.forbidden.add(k);
    if (c.silenceCall) b.canCall = false;
    if (c.bleed) b.bleed += c.bleed;
    if (c.awarenessDecayAdd) b.awarenessDecayAdd += c.awarenessDecayAdd;
  }
  rt.behaviors.set(e.id, b);
  return b;
}

/** 该实体还能感知的通道（部位被毁会真的删掉一条通道） */
export function activeSenses(rt: EncounterRuntime, e: Entity): Sense[] {
  const b = behaviorOf(rt, e);
  return defOf(e).senses.filter((s) => !b.blind.has(s)) as Sense[];
}

export function isDestroyed(rt: EncounterRuntime, e: Entity, partId: ID): boolean {
  return rt.destroyed.has(`${e.id}:${partId}`);
}

export function livingParts(rt: EncounterRuntime, e: Entity): PartDef[] {
  return defOf(e).parts.filter((p) => !isDestroyed(rt, e, p.id));
}

// ---------------------------------------------------------------------------
// 噪音
// ---------------------------------------------------------------------------

/**
 * 发出噪音。返回**实际**噪音值（经掩蔽与环境底噪修正）。
 * 噪音同时做三件事：喂给靠声音的敌人、推高 listenerPressure、打断静默连击。
 */
export function emitNoise(rt: EncounterRuntime, base: number, source: string): number {
  const actual = base * (1 - clamp01(rt.masking.sound) * 0.75);
  if (actual > 0.5) {
    rt.noise += actual;
    rt.noiseDelta += actual;
    rt.silentStreak = 0;
    if (rt.noise > 0) rt.listenerPressure += Math.max(0, (rt.noise - 40) * 0.01) + actual * 0.006;
    rt.log.push(`[噪音 +${actual.toFixed(0)}] ${source}`);
  }
  return actual;
}

export function addDecoy(rt: EncounterRuntime, d: Decoy): void {
  rt.decoys.push(d);
}

/** 给实体的觉察度一个即时增量（被看见、被打中、走漏声音） */
export function bumpAwareness(rt: EncounterRuntime, e: Entity, amount: number): void {
  e.awareness = clamp01(e.awareness + amount);
}

// ---------------------------------------------------------------------------
// 命中与伤害
// ---------------------------------------------------------------------------

export interface AttackOptions {
  /** 基础命中 */
  base: number;
  power: number;
  pierce?: number;
  /** 精准动作：无视部分闪避（切腱、刺耳器这类） */
  precision?: number;
  /** 该动作在黑暗中是否依然可靠（触觉类动作不吃光照惩罚） */
  lightIndependent?: boolean;
}

export interface AttackResult {
  hit: boolean;
  chance: number;
  damage: number;
  destroyed: boolean;
  lethal: boolean;
  log: string[];
  effects: Effect[];
  phantom: boolean;
}

/**
 * 对部位的一次攻击。
 * `partId` 以 `phantom.` 开头时表示玩家打的是自己臆想出来的部位 ——
 * 必定落空，并且因为挥空动作幅度更大而额外暴露自己。这是认知系统的惩罚出口。
 */
export function attackPart(
  rt: EncounterRuntime,
  e: Entity,
  partId: ID | undefined,
  o: AttackOptions,
): AttackResult {
  const def = defOf(e);
  const b = behaviorOf(rt, e);
  const tier = rt.cogTier[e.defId] ?? 0;
  const log: string[] = [];

  if (partId && partId.startsWith('phantom.')) {
    bumpAwareness(rt, e, 0.14);
    emitNoise(rt, 6, '挥空');
    log.push('你的手穿过了那个位置。那里什么都没有 —— 那东西只存在于你自己画的图上。');
    return { hit: false, chance: 0, damage: 0, destroyed: false, lethal: false, log, effects: [], phantom: true };
  }

  // 未指定部位时打向最容易命中的活部位；黑暗中你没得挑
  const candidates = livingParts(rt, e);
  if (!candidates.length) {
    log.push('它身上已经没有你还能下手的地方了。');
    return { hit: false, chance: 0, damage: 0, destroyed: false, lethal: false, log, effects: [], phantom: false };
  }
  const pd =
    (partId ? partDefOf(def, partId) : undefined) ??
    candidates.reduce((a, c) => (c.evasion < a.evasion ? c : a));
  if (isDestroyed(rt, e, pd.id)) {
    log.push(`${pd.name}已经不在了。你的刀落在空处。`);
    emitNoise(rt, 4, '落空');
    return { hit: false, chance: 0, damage: 0, destroyed: false, lethal: false, log, effects: [], phantom: false };
  }

  const lightTerm = o.lightIndependent ? 0.08 : rt.light * 0.26 - 0.08;
  const bandTerm = bandIndex(bandOf(rt, e.id)) >= 3 ? 0.08 : -0.06;
  const evasion = (pd.evasion + def.evasion * 0.5 + b.evasionAdd) * (1 - clamp01(o.precision ?? 0));
  const chance = clamp(o.base + lightTerm + tier * 0.05 + bandTerm - evasion, 0.05, 0.96);

  if (!rt.rng.bool(chance)) {
    log.push(`没打中。${pd.name}在你落手之前移开了。`);
    bumpAwareness(rt, e, 0.07);
    return { hit: false, chance, damage: 0, destroyed: false, lethal: false, log, effects: [], phantom: false };
  }

  const roll = o.power * rt.rng.float(0.82, 1.24);
  const armor = Math.max(0, pd.armor - (o.pierce ?? 0));
  const dealt = Math.max(1, Math.round(roll - armor));
  const runtimePart = e.parts.find((p) => p.id === pd.id);
  if (runtimePart) runtimePart.hp = Math.max(0, runtimePart.hp - dealt);
  e.hp = Math.max(0, e.hp - dealt);
  bumpAwareness(rt, e, 0.18);
  log.push(`命中${pd.name}，${dealt} 点。`);

  const effects: Effect[] = [];
  let destroyed = false;
  let lethal = false;
  if (runtimePart && runtimePart.hp <= 0) {
    destroyed = true;
    rt.destroyed.add(`${e.id}:${pd.id}`);
    recomputeBehavior(rt, e);
    log.push(`【${pd.name}被破坏】${pd.consequence.note}`);
    if (pd.effects) effects.push(...pd.effects);
    // 打坏部位本身就是一种解剖学知识
    const gained = rt.ledger.observe(e.defId, 'wound', 1);
    if (gained.tierUp) log.push(gained.note);
    rt.cogTier[e.defId] = rt.ledger.tierIndex(e.defId);
    if (pd.consequence.lethal && !def.unkillable) lethal = true;
    if (pd.consequence.spawnBrood) {
      log.push('破口里有东西出来了。不止一个。');
    }
  }
  return { hit: true, chance, damage: dealt, destroyed, lethal, log, effects, phantom: false };
}

// ---------------------------------------------------------------------------
// 结果构造
// ---------------------------------------------------------------------------

export function mkOutcome(o: Partial<CombatOutcome> & { log: readonly string[] }): CombatOutcome {
  return {
    log: o.log,
    damage: o.damage,
    effects: o.effects,
    noise: o.noise ?? 0,
    resolved: o.resolved,
  };
}

/** 逃脱判定。距离越远、觉察越低、噪音越低、做过门标记就越容易 */
export function escapeChance(rt: EncounterRuntime): number {
  const live = liveEntities(rt);
  if (!live.length) return 1;
  let worst = 0;
  for (const e of live) {
    const band = bandIndex(bandOf(rt, e.id));
    const c = 0.72 - e.awareness * 0.42 - band * 0.1 + (rt.markedExit ? 0.16 : 0) - rt.noise * 0.0016;
    worst = Math.max(worst, 1 - clamp(c, 0.04, 0.95));
  }
  return clamp(1 - worst, 0.04, 0.95);
}

/** 玩家的热signature：体温、剧烈运动、加热贴抬高它；冷水与石棉压低它 */
export function heatSignature(rt: EncounterRuntime, coreTemp: number): number {
  const base = clamp01((coreTemp - 30) / 9);
  return clamp01(base * (1 - clamp01(rt.masking.heat)) + rt.movement * 0.05);
}
