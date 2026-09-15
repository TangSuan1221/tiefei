/**
 * 背包。
 *
 * 三条约束让它成为决策而不是仓库：
 *   1. **重量** —— 超载会推高呼吸成本（`weightPenalty()` 交给 Agent A 的 derived 使用）；
 *   2. **响度** —— 背着的金属越多，你走路越响（`movementNoise()`）。
 *      这条把"要不要带消防斧"变成了"要不要被听见"；
 *   3. **耐久** —— 每件工具都有独立实例的耐久，坏掉的会真的消失。
 *
 * 另外：低 SAN 时 `displayName()` 返回 `falseName`。玩家会在背包里看到
 * "人脂""婴儿的脂""骨灰"，而真相只是牛脂、鲸脂和碱石灰。
 */

import type {
  Effect,
  FlagStore,
  ID,
  InventorySystem,
  RoomArchetype,
  StigmaKind,
  Vitals,
  VitalsSystem,
} from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { itemDef, maybeItem, recipe as recipeDef, allRecipes } from '../content/items/index';
import type { GameItem } from '../content/items/index';
import { applyEffects, testCondition, type EffectSinks } from './conditions';
import type { Sense, VitalsPatchFn } from './types';

interface Slot {
  count: number;
  /** 有耐久的物品：每个实例一个条目，长度应等于 count */
  wear: number[];
}

export interface InventoryOptions {
  /** 承载上限（kg）。超过以后每公斤都要付呼吸 */
  capacity?: number;
  flags: FlagStore;
  vitals?: VitalsSystem;
  patchVitals?: VitalsPatchFn;
  /** 当前所处舱段，用于 recipe.station 判定 */
  station?: () => RoomArchetype | undefined;
  stigma?: () => Record<StigmaKind, number>;
  /** 未被本模块消化的效果转交给宿主 */
  forward?: (effects: readonly Effect[]) => void;
  /** 玩家感知到的 SAN（决定是否显示 falseName） */
  perceivedSan?: () => number;
}

export class Inventory implements InventorySystem {
  private slots = new Map<ID, Slot>();
  private readonly opts: InventoryOptions;
  readonly capacity: number;
  /** 最近一次 add 因超重而被丢下的数量，UI 要能解释"为什么没捡起来" */
  lastOverflow: { item: ID; count: number } | null = null;

  constructor(opts: InventoryOptions) {
    this.opts = opts;
    this.capacity = opts.capacity ?? 28;
  }

  // -- 契约实现 -------------------------------------------------------------

  count(item: ID): number {
    return this.slots.get(item)?.count ?? 0;
  }

  add(item: ID, n: number): void {
    if (n <= 0) return;
    const def = itemDef(item);
    const fits = Math.max(0, Math.floor((this.capacity * 1.35 - this.totalWeight()) / Math.max(0.01, def.weight)));
    const taken = Math.min(n, fits);
    if (taken < n) this.lastOverflow = { item, count: n - taken };
    else this.lastOverflow = null;
    if (taken <= 0) return;
    const slot = this.slots.get(item) ?? { count: 0, wear: [] };
    slot.count += taken;
    if (def.durability !== undefined) {
      for (let i = 0; i < taken; i++) slot.wear.push(def.durability);
    }
    this.slots.set(item, slot);
  }

  remove(item: ID, n: number): boolean {
    const slot = this.slots.get(item);
    if (!slot || slot.count < n) return false;
    slot.count -= n;
    if (slot.wear.length) {
      // 先消耗最破的那一件 —— 玩家的直觉也是这样
      slot.wear.sort((a, b) => a - b);
      slot.wear.splice(0, n);
    }
    if (slot.count <= 0) this.slots.delete(item);
    return true;
  }

  all(): readonly { id: ID; count: number; durability?: number }[] {
    const out: { id: ID; count: number; durability?: number }[] = [];
    for (const [id, slot] of this.slots) {
      out.push(
        slot.wear.length
          ? { id, count: slot.count, durability: Math.min(...slot.wear) }
          : { id, count: slot.count },
      );
    }
    return out;
  }

  /**
   * 使用一件物品。
   * 消耗品扣数量，工具扣耐久；耐久归零的实例会真的消失。
   * 返回的是**尚未被本模块消化**的效果，交给宿主系统执行。
   */
  use(item: ID): readonly Effect[] {
    const def = maybeItem(item);
    if (!def || this.count(item) <= 0) return [];
    const sinks: EffectSinks = {
      flags: this.opts.flags,
      vitals: this.opts.vitals,
      patchVitals: this.opts.patchVitals,
      inventory: this,
    };
    const forwarded = applyEffects(def.onUse, sinks);
    if (def.kind === 'consumable') {
      this.remove(item, 1);
    } else if (def.durability !== undefined) {
      this.wear(item, 1);
    }
    this.opts.forward?.(forwarded);
    return forwarded;
  }

  craft(recipeId: ID): boolean {
    const r = recipeDef(recipeId);
    if (
      !testCondition(r.requires, {
        flags: this.opts.flags,
        vitals: this.opts.vitals?.vitals,
        inventory: this,
        stigma: this.opts.stigma?.(),
        roomArchetype: this.opts.station?.(),
      })
    ) {
      return false;
    }
    if (r.station && this.opts.station && this.opts.station() !== r.station) return false;
    for (const i of r.inputs) if (this.count(i.item) < i.count) return false;
    for (const i of r.inputs) this.remove(i.item, i.count);
    this.add(r.output.item, r.output.count);
    this.opts.flags.add('count.crafted', 1);
    this.opts.flags.add(`count.crafted.${r.id}`, 1);
    return true;
  }

  // -- 重量 / 响度 ----------------------------------------------------------

  totalWeight(): number {
    let w = 0;
    for (const [id, slot] of this.slots) w += (maybeItem(id)?.weight ?? 0) * slot.count;
    return w;
  }

  /** 超载惩罚：交给 Agent A 作为 breathCost 的加值 */
  weightPenalty(): number {
    const over = this.totalWeight() - this.capacity;
    return over <= 0 ? 0 : clamp(over * 0.035, 0, 0.9);
  }

  /** 背包总响度。金属堆在一起会互相碰撞，所以是超线性的 */
  totalLoudness(): number {
    let l = 0;
    let metalCount = 0;
    for (const [id, slot] of this.slots) {
      const def = maybeItem(id);
      if (!def) continue;
      l += def.loudness * Math.min(slot.count, 4);
      if (def.tags.includes('metal')) metalCount += slot.count;
    }
    return l + Math.max(0, metalCount - 2) * 0.08;
  }

  /**
   * 移动噪音倍率。1.0 = 空手；带满金属可以到 2.4 左右。
   * 缠上消音包裹（masking 参数）能把它压回接近 1。
   */
  movementNoise(soundMask = 0): number {
    const raw = 1 + this.totalLoudness() * 0.22;
    return 1 + (raw - 1) * (1 - clamp01(soundMask));
  }

  // -- 查询助手 -------------------------------------------------------------

  hasTag(tag: string): boolean {
    for (const id of this.slots.keys()) if (maybeItem(id)?.tags.includes(tag)) return true;
    return false;
  }

  /** 按 tag 找出手上最好的一件（power 优先，其次噪音低的） */
  bestWithTag(tag: string, metric: 'power' | 'pierce' | 'light' = 'power'): GameItem | undefined {
    let best: GameItem | undefined;
    for (const id of this.slots.keys()) {
      const def = maybeItem(id);
      if (!def || !def.tags.includes(tag)) continue;
      const v = def[metric] ?? 0;
      const bv = best ? best[metric] ?? 0 : -1;
      if (v > bv || (v === bv && (def.noise ?? 0) < (best?.noise ?? 99))) best = def;
    }
    return best;
  }

  /** 手上所有物品提供的掩蔽度取最大值（不叠加：两块石棉布不会让你更冷） */
  passiveMasking(): Partial<Record<Sense, number>> {
    const out: Partial<Record<Sense, number>> = {};
    for (const id of this.slots.keys()) {
      const m = maybeItem(id)?.masks;
      if (!m) continue;
      for (const k of Object.keys(m) as Sense[]) {
        out[k] = Math.max(out[k] ?? 0, m[k] ?? 0);
      }
    }
    return out;
  }

  /** 身上圣物带来的"信仰signature" —— 靠信仰找人的敌人靠这个锁定你 */
  faithSignature(): number {
    let s = 0;
    for (const [id, slot] of this.slots) {
      const def = maybeItem(id);
      if (!def) continue;
      if (def.tags.includes('faith')) s += 0.18 * Math.min(slot.count, 3);
      else if (def.tags.includes('ritual')) s += 0.07 * Math.min(slot.count, 3);
      else if (def.kind === 'relic') s += 0.04 * Math.min(slot.count, 3);
    }
    return clamp01(s);
  }

  /** 卸下全部圣物，返回被丢下的物品 —— 这是对付 THE LISTENER 的核心操作 */
  dropRelics(): { item: ID; count: number }[] {
    const dropped: { item: ID; count: number }[] = [];
    for (const [id, slot] of Array.from(this.slots)) {
      const def = maybeItem(id);
      if (!def) continue;
      if (def.kind === 'relic' || def.tags.includes('faith')) {
        dropped.push({ item: id, count: slot.count });
        this.slots.delete(id);
      }
    }
    return dropped;
  }

  /** 磨损一件工具。返回是否因此损坏 */
  wear(item: ID, amount: number): boolean {
    const slot = this.slots.get(item);
    if (!slot || !slot.wear.length) return false;
    slot.wear.sort((a, b) => a - b);
    slot.wear[0] -= amount;
    if (slot.wear[0] <= 0) {
      slot.wear.shift();
      slot.count -= 1;
      if (slot.count <= 0) this.slots.delete(item);
      return true;
    }
    return false;
  }

  /** 玩家看到的名字。低 SAN 时返回 falseName —— Veracity Layer 在背包里的落点 */
  displayName(item: ID): string {
    const def = maybeItem(item);
    if (!def) return '???';
    const san = this.opts.perceivedSan?.() ?? 100;
    if (def.falseName && san < 42) return def.falseName;
    return def.name;
  }

  /** 当前能做的配方 */
  availableRecipes(): readonly ID[] {
    const station = this.opts.station?.();
    const out: ID[] = [];
    for (const r of allRecipes()) {
      if (r.station && station !== r.station) continue;
      if (r.inputs.every((i) => this.count(i.item) >= i.count)) out.push(r.id);
    }
    return out;
  }

  // -- 存档 -----------------------------------------------------------------

  serialize(): unknown {
    return {
      capacity: this.capacity,
      slots: Array.from(this.slots, ([id, s]) => ({ id, count: s.count, wear: s.wear })),
    };
  }

  hydrate(data: unknown): void {
    this.slots.clear();
    if (!data || typeof data !== 'object') return;
    const d = data as { slots?: { id: ID; count: number; wear?: number[] }[] };
    for (const s of d.slots ?? []) {
      if (!maybeItem(s.id)) continue;
      this.slots.set(s.id, { count: s.count, wear: s.wear ?? [] });
    }
  }

  /** 给模拟器与测试用：一次性塞入一套装备 */
  loadout(entries: readonly (readonly [ID, number])[]): void {
    for (const [id, n] of entries) this.add(id, n);
  }
}

/** 空的 Vitals 快照，模拟器与 UI 预览需要一个安全默认值 */
export function emptyVitals(): Vitals {
  return {
    oxygen: 900,
    oxygenMax: 900,
    san: 100,
    sanMax: 100,
    coreTemp: 36.6,
    co2: 0,
    trauma: 0,
    infection: 0,
    fatigue: 0,
    fear: 0,
  };
}
