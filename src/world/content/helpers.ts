/**
 * world/content/helpers.ts — 内容库的书写语法糖
 *
 * 为什么：一百多个房间变体、八十多个 prop，如果每条 InteractionSpec 都手写
 * 完整对象字面量，内容会被样板代码淹没，写作者读不下去也校不出错。
 * 这些函数唯一的职责是让内容文件读起来像剧本而不是像 JSON。
 */

import type {
  Breaths,
  Condition,
  Effect,
  FlagValue,
  ID,
  InteractionSpec,
  RoomArchetype,
  StigmaKind,
  Vitals,
} from '../../core/contract';
import type { PropDef, PropPick, RoomVariant } from '../types';

// ---------------------------------------------------------------- 交互

export interface IxExtra {
  requires?: Condition;
  effects?: readonly Effect[];
}

export function ix(
  id: string,
  label: string,
  cost: Breaths,
  noise: number,
  extra: IxExtra = {},
): InteractionSpec {
  const spec: InteractionSpec = { id, label, cost, noise };
  if (extra.requires) spec.requires = extra.requires;
  if (extra.effects) spec.effects = extra.effects;
  return spec;
}

// ---------------------------------------------------------------- 效果

export const vital = (stat: keyof Vitals, delta: number): Effect => ({ op: 'vital', stat, delta });
export const san = (delta: number): Effect => vital('san', delta);
export const fear = (delta: number): Effect => vital('fear', delta);
export const trauma = (delta: number): Effect => vital('trauma', delta);
export const infect = (delta: number): Effect => vital('infection', delta);
export const oxy = (delta: number): Effect => vital('oxygen', delta);
export const warm = (delta: number): Effect => vital('coreTemp', delta);
export const item = (id: string, count = 1): Effect => ({ op: 'item', item: id, count });
export const flag = (key: string, value: FlagValue = true): Effect => ({ op: 'flag', key, value });
export const bump = (key: string, delta = 1): Effect => ({ op: 'flag-add', key, delta });
export const know = (node: string): Effect => ({ op: 'knowledge', node });
export const stigma = (kind: StigmaKind, delta = 1): Effect => ({ op: 'stigma', stigma: kind, delta });
export const noise = (amount: number): Effect => ({ op: 'noise', amount });
export const sfx = (cue: string): Effect => ({ op: 'sfx', cue });
export const status = (effect: string, duration?: Breaths): Effect =>
  duration === undefined ? { op: 'status', effect } : { op: 'status', effect, duration };
export const shake = (amount: number): Effect => ({ op: 'camera', shake: amount });
export const reweaveFx = (intensity: number): Effect => ({ op: 'reweave', intensity });
export const spawn = (entity: string, where?: string): Effect =>
  where === undefined ? { op: 'spawn', entity } : { op: 'spawn', entity, where };
export const unlock = (door: string): Effect => ({ op: 'unlock-door', door });

// ---------------------------------------------------------------- 条件

export const always: Condition = { op: 'always' };
export const hasItem = (id: string, count = 1): Condition => ({ op: 'has-item', item: id, count });
export const hasKnow = (node: string): Condition => ({ op: 'has-knowledge', node });
export const flagOn = (key: string): Condition => ({ op: 'flag', key, cmp: '==', value: true });
export const flagOff = (key: string): Condition => ({ op: 'not', of: flagOn(key) });
export const flagNum = (key: string, cmp: '>' | '<' | '>=' | '<=' | '==', value: number): Condition => ({
  op: 'flag',
  key,
  cmp,
  value,
});
export const sanBelow = (value: number): Condition => ({ op: 'vital', stat: 'san', cmp: '<', value });
export const sanAbove = (value: number): Condition => ({ op: 'vital', stat: 'san', cmp: '>=', value });
export const inArch = (archetype: RoomArchetype): Condition => ({ op: 'in-room', archetype });
export const deeperThan = (value: number): Condition => ({ op: 'depth', cmp: '>', value });
export const allOf = (...of: Condition[]): Condition => ({ op: 'all', of });
export const anyOf = (...of: Condition[]): Condition => ({ op: 'any', of });
export const not = (of: Condition): Condition => ({ op: 'not', of });
export const stigmaAt = (kind: StigmaKind, cmp: '>' | '>=' | '<' | '==', value: number): Condition => ({
  op: 'stigma',
  stigma: kind,
  cmp,
  value,
});

// ---------------------------------------------------------------- 定义构造

export interface PropSeed {
  id: string;
  kind: PropDef['kind'];
  name: string;
  falseName?: string;
  concealment?: number;
  tags?: readonly string[];
  fits?: readonly RoomArchetype[];
  ix: readonly InteractionSpec[];
  lucid: string;
  drift: string;
  resonant: string;
}

export function prop(seed: PropSeed): PropDef {
  const def: PropDef = {
    id: seed.id,
    kind: seed.kind,
    name: seed.name,
    concealment: seed.concealment ?? 0,
    tags: seed.tags ?? [],
    interactions: seed.ix,
    lucid: seed.lucid,
    drift: seed.drift,
    resonant: seed.resonant,
  };
  if (seed.falseName) def.falseName = seed.falseName;
  if (seed.fits) def.fits = seed.fits;
  return def;
}

export interface RoomSeed {
  id: string;
  archetype: RoomVariant['archetype'];
  name: string;
  decks: readonly number[];
  weight?: number;
  ambient?: RoomVariant['ambient'];
  noiseThreshold?: number;
  floodRate?: number;
  props?: readonly PropPick[];
  tags?: readonly string[];
  unique?: boolean;
  manualOnly?: boolean;
  onEnterNode?: ID;
  lucid: string;
  drift: string;
  resonant: string;
}

export function room(seed: RoomSeed): RoomVariant {
  const v: RoomVariant = {
    id: seed.id,
    archetype: seed.archetype,
    name: seed.name,
    decks: seed.decks,
    weight: seed.weight ?? 10,
    props: seed.props ?? [],
    lucid: seed.lucid,
    drift: seed.drift,
    resonant: seed.resonant,
  };
  if (seed.ambient) v.ambient = seed.ambient;
  if (seed.noiseThreshold !== undefined) v.noiseThreshold = seed.noiseThreshold;
  if (seed.floodRate !== undefined) v.floodRate = seed.floodRate;
  if (seed.tags) v.tags = seed.tags;
  if (seed.unique) v.unique = true;
  if (seed.manualOnly) v.manualOnly = true;
  if (seed.onEnterNode) v.onEnterNode = seed.onEnterNode;
  return v;
}

/** 常用甲板集合，省掉大量 [1,2,3] 字面量 */
export const D = {
  all: [1, 2, 3, 4, 5] as const,
  upper: [1, 2] as const,
  mid: [2, 3] as const,
  lower: [4, 5] as const,
  d1: [1] as const,
  d2: [2] as const,
  d3: [3] as const,
  d4: [4] as const,
  d5: [5] as const,
  d12: [1, 2] as const,
  d23: [2, 3] as const,
  d34: [3, 4] as const,
  d45: [4, 5] as const,
  d123: [1, 2, 3] as const,
  d234: [2, 3, 4] as const,
  d345: [3, 4, 5] as const,
  d1234: [1, 2, 3, 4] as const,
  d2345: [2, 3, 4, 5] as const,
};
