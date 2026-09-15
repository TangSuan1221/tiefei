/**
 * world/props.ts — 可交互物注册表
 *
 * 契约里的 `Prop` 带一个 `describe(san)` 方法，也就是说它**不是纯数据**，
 * 不能直接 JSON 序列化。解决办法：实例 id 编码为 `定义id@序号`，
 * 存档只存 id，读档时从注册表重建方法。这样存档体积小，而且内容可热更。
 */

import type { ID, InteractionSpec, Prop, PropKind, RoomArchetype } from '../core/contract';
import type { PropDef } from './types';
import { propDefIdOf, sanTier } from './types';
import { CULT_PROPS } from './content/props.cult';
import { HUMAN_PROPS } from './content/props.human';
import { MACHINE_PROPS } from './content/props.machine';

export const ALL_PROP_DEFS: readonly PropDef[] = [...HUMAN_PROPS, ...MACHINE_PROPS, ...CULT_PROPS];

const BY_ID = new Map<string, PropDef>();
const BY_KIND = new Map<PropKind, PropDef[]>();
const BY_ARCHETYPE = new Map<RoomArchetype, PropDef[]>();
const KEY_SOURCES = new Map<string, PropDef[]>();

/** 从一条交互的 effects 里读出它能产出的"钥匙"（统一成字符串键空间） */
export function keysGrantedByInteraction(spec: InteractionSpec): string[] {
  const out: string[] = [];
  for (const e of spec.effects ?? []) {
    switch (e.op) {
      case 'flag':
        // 只有置真才算产出。置假是消费
        if (e.value === true || (typeof e.value === 'number' && e.value > 0)) out.push(e.key);
        break;
      case 'flag-add':
        if (e.delta > 0) out.push(e.key);
        break;
      case 'item':
        if (e.count > 0) out.push(e.item);
        break;
      case 'knowledge':
        out.push(e.node);
        break;
      default:
        break;
    }
  }
  return out;
}

/** 这个定义能产出哪些钥匙（不分交互条件，供索引用） */
export function keysGrantedByDef(def: PropDef): string[] {
  const set = new Set<string>();
  for (const spec of def.interactions) for (const k of keysGrantedByInteraction(spec)) set.add(k);
  return [...set];
}

for (const def of ALL_PROP_DEFS) {
  if (BY_ID.has(def.id)) throw new Error(`[world/props] 重复的 prop 定义 id: ${def.id}`);
  BY_ID.set(def.id, def);

  const kindList = BY_KIND.get(def.kind) ?? [];
  kindList.push(def);
  BY_KIND.set(def.kind, kindList);

  for (const arch of def.fits ?? []) {
    const list = BY_ARCHETYPE.get(arch) ?? [];
    list.push(def);
    BY_ARCHETYPE.set(arch, list);
  }

  // 只有"无条件产出"的交互才进钥匙源索引 ——
  // 带 requires 的产出在悲观验证里不被采信，索引进来会让可通关性证明变成谎话
  for (const spec of def.interactions) {
    if (spec.requires) continue;
    for (const key of keysGrantedByInteraction(spec)) {
      const list = KEY_SOURCES.get(key) ?? [];
      if (!list.includes(def)) list.push(def);
      KEY_SOURCES.set(key, list);
    }
  }
}

export function propDef(id: string): PropDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`[world/props] 未知 prop 定义: ${id}`);
  return def;
}

export function hasPropDef(id: string): boolean {
  return BY_ID.has(id);
}

export function propDefsOfKind(kind: PropKind): readonly PropDef[] {
  return BY_KIND.get(kind) ?? [];
}

export function propDefsFor(archetype: RoomArchetype): readonly PropDef[] {
  return BY_ARCHETYPE.get(archetype) ?? [];
}

/**
 * 哪些 prop 定义可以**无条件**产出这把钥匙。
 * 生成器做约束放置时只认这个列表 —— 这是「绝不卡死」的机械保证。
 */
export function unconditionalSourcesOf(key: string): readonly PropDef[] {
  return KEY_SOURCES.get(key) ?? [];
}

export function allKeySourceKeys(): readonly string[] {
  return [...KEY_SOURCES.keys()];
}

/** 描述文本：三档随 SAN 切换。这是 §9「describe 必须真的随 SAN 不同」的落点 */
export function describeProp(defId: string, san: number): string {
  const def = BY_ID.get(defId);
  if (!def) return '一件你认不出的东西。';
  switch (sanTier(san)) {
    case 'lucid':
      return def.lucid;
    case 'drift':
      return def.drift;
    default:
      return def.resonant;
  }
}

/** 低 SAN 时 UI 应当显示的名字 */
export function propDisplayName(defId: string, san: number): string {
  const def = BY_ID.get(defId);
  if (!def) return '？';
  if (def.falseName && san < 30) return def.falseName;
  return def.name;
}

/**
 * 实例化。id 形如 `prop.corpse.bunk-sleeper@3`。
 * describe 闭包只捕获 defId，不捕获整个 def，读档重建时行为完全一致。
 */
export function instantiateProp(defId: string, serial: number): Prop {
  const def = propDef(defId);
  const id: ID = `${defId}@${serial}`;
  return {
    id,
    kind: def.kind,
    name: def.name,
    concealment: def.concealment,
    interactions: def.interactions,
    describe: (san: number) => describeProp(defId, san),
  };
}

/** 从存档 id 重建，无需额外元数据 */
export function rehydrateProp(propId: string): Prop | null {
  const defId = propDefIdOf(propId);
  if (!BY_ID.has(defId)) return null;
  const def = propDef(defId);
  return {
    id: propId,
    kind: def.kind,
    name: def.name,
    concealment: def.concealment,
    interactions: def.interactions,
    describe: (san: number) => describeProp(defId, san),
  };
}

export const PROP_COUNT = ALL_PROP_DEFS.length;

export const PROP_KIND_COVERAGE: Readonly<Record<PropKind, number>> = (() => {
  const kinds: PropKind[] = [
    'corpse', 'terminal', 'valve', 'locker', 'altar', 'radio',
    'porthole', 'pipe', 'breaker', 'logbook', 'icon', 'hatch',
    'specimen', 'mirror', 'nest',
  ];
  const out = {} as Record<PropKind, number>;
  for (const k of kinds) out[k] = (BY_KIND.get(k) ?? []).length;
  return out;
})();

/** 内容自检：15 种 PropKind 必须全覆盖。缺一种宁可启动就崩 */
export function assertPropCoverage(): void {
  const missing = Object.entries(PROP_KIND_COVERAGE)
    .filter(([, n]) => n === 0)
    .map(([k]) => k);
  if (missing.length) throw new Error(`[world/props] PropKind 未覆盖: ${missing.join(', ')}`);
}
