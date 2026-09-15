/**
 * 知识节点树 —— roguelite 元进度的唯一载体。
 *
 * 设计要点（GDD P6 / §7.1）：
 *  1. 死亡不清空知识。清空的是船、身体、物品。
 *  2. 知识有**依赖**：知道 A 和 B 才"理解" C。只持有 C 而缺依赖 = 碎片，
 *     碎片在 UI 上显示为残句，且不计入真相层深度。
 *  3. 真相分五层（表层/中层/深层/真层/底层）。
 *     `deepestLayer()` 只有在某层的全部正典节点都被**理解**时才推进。
 *     玩家只挖到第 1 层也能通关；第 5 层才解锁 end.author。
 *  4. `cyclesWitnessed()` 统计"首次获得某知识"发生在多少个不同轮回里。
 *     end.author 要求 ≥ 4 —— 这保证真结局不可能在单轮速通。
 */

import type { ID } from '../core/contract';

export type TruthLayer = 1 | 2 | 3 | 4 | 5;

export interface KnowledgeDef {
  id: ID;
  /** UI 上的短标题，本身就是一句台词 */
  title: string;
  layer: TruthLayer;
  /** 依赖的其它知识节点 —— 缺一个就只是碎片 */
  requires: readonly ID[];
  /** "你知道的事"列表里的一行 */
  summary: string;
  /** 获得瞬间弹出的一句 */
  revealText: string;
  /** 低 SAN 时这条知识在列表里显示成什么 */
  corrupted?: string;
  /** 非正典：有趣但 end.author 不要求 */
  apocrypha?: boolean;
  /** 从哪里挖出来 —— 写给设计师和校验器看 */
  source: string;
}

export interface KnowledgeSnapshot {
  held: ID[];
  firstCycle: [ID, number][];
}

const LAYERS: readonly TruthLayer[] = [1, 2, 3, 4, 5];

export class KnowledgeTree {
  readonly defs: ReadonlyMap<ID, KnowledgeDef>;
  private held = new Set<ID>();
  /** id -> 首次获得所在轮回编号 */
  private firstCycle = new Map<ID, number>();

  constructor(defs: readonly KnowledgeDef[]) {
    const m = new Map<ID, KnowledgeDef>();
    for (const d of defs) m.set(d.id, d);
    this.defs = m;
  }

  has(id: ID): boolean {
    return this.held.has(id);
  }

  /** 返回 true 表示这是首次获得 */
  learn(id: ID, cycle = 0): boolean {
    if (this.held.has(id)) return false;
    this.held.add(id);
    this.firstCycle.set(id, cycle);
    return true;
  }

  forget(id: ID): void {
    this.held.delete(id);
    this.firstCycle.delete(id);
  }

  /** 持有且全部依赖都被理解 —— 递归 */
  understood(id: ID, seen: Set<ID> = new Set()): boolean {
    if (!this.held.has(id)) return false;
    if (seen.has(id)) return false; // 环，交由 validate() 报错
    seen.add(id);
    const def = this.defs.get(id);
    if (!def) return false;
    for (const r of def.requires) if (!this.understood(r, seen)) return false;
    return true;
  }

  /** 持有但依赖不全 —— 玩家手里的残句 */
  fragments(): ID[] {
    return [...this.held].filter((id) => !this.understood(id));
  }

  /** 依赖已齐、尚未获得 —— 下一轮该去挖的东西 */
  frontier(): ID[] {
    const out: ID[] = [];
    for (const [id, def] of this.defs) {
      if (this.held.has(id)) continue;
      if (def.requires.every((r) => this.held.has(r))) out.push(id);
    }
    return out;
  }

  /** 某层的正典节点是否全部被理解 */
  layerComplete(layer: TruthLayer): boolean {
    for (const def of this.defs.values()) {
      if (def.layer !== layer || def.apocrypha) continue;
      if (!this.understood(def.id)) return false;
    }
    return true;
  }

  /** 已抵达的最深真相层。0 = 什么都没拼起来 */
  deepestLayer(): number {
    let deepest = 0;
    for (const l of LAYERS) {
      if (!this.layerComplete(l)) break;
      deepest = l;
    }
    return deepest;
  }

  /** 正典节点持有数 */
  canonCount(): number {
    let n = 0;
    for (const id of this.held) {
      const d = this.defs.get(id);
      if (d && !d.apocrypha) n++;
    }
    return n;
  }

  canonTotal(): number {
    let n = 0;
    for (const d of this.defs.values()) if (!d.apocrypha) n++;
    return n;
  }

  count(): number {
    return this.held.size;
  }

  heldIds(): ID[] {
    return [...this.held];
  }

  /** 有多少个不同轮回贡献过新知识 */
  cyclesWitnessed(): number {
    return new Set(this.firstCycle.values()).size;
  }

  /** 某层内已理解 / 总数，用于 UI 进度 */
  layerProgress(layer: TruthLayer): { got: number; total: number } {
    let got = 0;
    let total = 0;
    for (const d of this.defs.values()) {
      if (d.layer !== layer || d.apocrypha) continue;
      total++;
      if (this.understood(d.id)) got++;
    }
    return { got, total };
  }

  /** 静态自检：悬空依赖、依赖环、层序倒置 */
  validate(): string[] {
    const errs: string[] = [];
    for (const [id, def] of this.defs) {
      for (const r of def.requires) {
        const rd = this.defs.get(r);
        if (!rd) {
          errs.push(`knowledge '${id}' 依赖不存在的节点 '${r}'`);
          continue;
        }
        if (rd.layer > def.layer) {
          errs.push(`knowledge '${id}'(L${def.layer}) 依赖了更深层的 '${r}'(L${rd.layer})`);
        }
        if (!def.apocrypha && rd.apocrypha) {
          errs.push(`正典 knowledge '${id}' 依赖了非正典节点 '${r}'`);
        }
      }
    }
    // 环检测
    const color = new Map<ID, 0 | 1 | 2>();
    const stack: ID[] = [];
    const visit = (id: ID): void => {
      const st = color.get(id) ?? 0;
      if (st === 2) return;
      if (st === 1) {
        errs.push(`knowledge 依赖环: ${[...stack, id].join(' -> ')}`);
        return;
      }
      color.set(id, 1);
      stack.push(id);
      for (const r of this.defs.get(id)?.requires ?? []) if (this.defs.has(r)) visit(r);
      stack.pop();
      color.set(id, 2);
    };
    for (const id of this.defs.keys()) visit(id);
    return errs;
  }

  serialize(): KnowledgeSnapshot {
    return { held: [...this.held], firstCycle: [...this.firstCycle] };
  }

  hydrate(data: unknown): void {
    this.held.clear();
    this.firstCycle.clear();
    const d = data as Partial<KnowledgeSnapshot> | null | undefined;
    if (!d) return;
    for (const id of d.held ?? []) if (this.defs.has(id)) this.held.add(id);
    for (const [id, cyc] of d.firstCycle ?? []) {
      if (this.defs.has(id)) this.firstCycle.set(id, cyc);
    }
    // 兼容旧档：持有但没有轮回记录的，归到轮回 0
    for (const id of this.held) if (!this.firstCycle.has(id)) this.firstCycle.set(id, 0);
  }
}
