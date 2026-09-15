/**
 * 物品注册表。
 * 加载时校验：id 唯一、配方引用不悬空、四条关键制作链都有终端产物。
 * 内容错误必须在启动时炸掉，而不是让玩家在深度 -2100 处发现配方做不出来。
 */

import type { ID, Recipe } from '../../core/contract';
import { assert } from '../../core/util';
import type { GameItem } from './helpers';
import { MATERIALS } from './materials';
import { TOOLS } from './tools';
import { WEAPONS } from './weapons';
import { CONSUMABLES } from './consumables';
import { CRAFTED } from './crafted';
import { RELICS, DOCUMENTS, KEYS } from './relics';
import { RECIPES } from './recipes';

export type { GameItem } from './helpers';

export const ITEMS: readonly GameItem[] = [
  ...MATERIALS,
  ...TOOLS,
  ...WEAPONS,
  ...CONSUMABLES,
  ...CRAFTED,
  ...RELICS,
  ...DOCUMENTS,
  ...KEYS,
];

const BY_ID = new Map<ID, GameItem>();
for (const it of ITEMS) {
  assert(!BY_ID.has(it.id), `重复的物品 id: ${it.id}`);
  assert(it.weight >= 0, `${it.id} 重量不能为负`);
  assert(it.loudness >= 0 && it.loudness <= 1.5, `${it.id} 响度必须在 0..1.5`);
  BY_ID.set(it.id, it);
}

const RECIPE_BY_ID = new Map<ID, Recipe>();
for (const r of RECIPES) {
  assert(!RECIPE_BY_ID.has(r.id), `重复的配方 id: ${r.id}`);
  assert(r.inputs.length >= 1, `${r.id} 没有输入`);
  for (const i of r.inputs) assert(BY_ID.has(i.item), `配方 ${r.id} 引用了不存在的物品 ${i.item}`);
  assert(BY_ID.has(r.output.item), `配方 ${r.id} 的产物 ${r.output.item} 不存在`);
  RECIPE_BY_ID.set(r.id, r);
}

// GDD §4.6 的四条关键制作链必须各有产物，否则设计意图断了
for (const chain of ['oxygen-chain', 'light-chain', 'silence-chain', 'anchor-chain'] as const) {
  const outputs = RECIPES.filter((r) => BY_ID.get(r.output.item)?.tags.includes(chain));
  assert(outputs.length >= 3, `制作链 ${chain} 的配方不足 3 条（当前 ${outputs.length}）`);
}

export function hasItem(id: ID): boolean {
  return BY_ID.has(id);
}

export function itemDef(id: ID): GameItem {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`[items] 未注册的物品 id: ${id}`);
  return d;
}

export function maybeItem(id: ID): GameItem | undefined {
  return BY_ID.get(id);
}

export function recipe(id: ID): Recipe {
  const r = RECIPE_BY_ID.get(id);
  if (!r) throw new Error(`[items] 未注册的配方 id: ${id}`);
  return r;
}

export function allRecipes(): readonly Recipe[] {
  return RECIPES;
}

/** 按 tag 查物品 —— 动作库用它找"手上有没有可投掷物/有没有光源" */
export function itemsWithTag(tag: string): readonly GameItem[] {
  return ITEMS.filter((i) => i.tags.includes(tag));
}

export function itemStats(): {
  items: number;
  recipes: number;
  byKind: Record<string, number>;
  withFalseName: number;
  totalWeight: number;
} {
  const byKind: Record<string, number> = {};
  let withFalseName = 0;
  let totalWeight = 0;
  for (const i of ITEMS) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
    if (i.falseName) withFalseName++;
    totalWeight += i.weight;
  }
  return { items: ITEMS.length, recipes: RECIPES.length, byKind, withFalseName, totalWeight };
}

export { RECIPES } from './recipes';
