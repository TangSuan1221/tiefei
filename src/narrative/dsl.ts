/**
 * 叙事内容的最小 DSL。
 * 目的只有一个：让 300+ 个节点的内容文件读起来像剧本，而不是像 JSON。
 * 这里不含任何逻辑，只是 contract.ts 中 Condition / Effect / Node 的构造函数。
 */

import type {
  Breaths,
  Cmp,
  Condition,
  Effect,
  Ending,
  FlagValue,
  ID,
  NarrativeChoice,
  NarrativeNode,
  RoomArchetype,
  StigmaKind,
  Vitals,
} from '../core/contract';

// ---------------------------------------------------------------------------
// 条件
// ---------------------------------------------------------------------------

export const ALWAYS: Condition = { op: 'always' };

/** 任意旗标比较 */
export const flag = (key: string, cmp: Cmp, value: FlagValue): Condition => ({
  op: 'flag',
  key,
  cmp,
  value,
});

/** 旗标为真 */
export const on = (key: string): Condition => ({ op: 'flag', key, cmp: '==', value: true });
/** 旗标为假或未设置 */
export const off = (key: string): Condition => ({ op: 'not', of: on(key) });
/** 计数比较 */
export const num = (key: string, cmp: Cmp, value: number): Condition => ({
  op: 'flag',
  key,
  cmp,
  value,
});

export const K = (node: ID): Condition => ({ op: 'has-knowledge', node });
export const noK = (node: ID): Condition => ({ op: 'not', of: { op: 'has-knowledge', node } });

export const vit = (stat: keyof Vitals, cmp: Cmp, value: number): Condition => ({
  op: 'vital',
  stat,
  cmp,
  value,
});
export const sanBelow = (v: number): Condition => vit('san', '<', v);
export const sanAbove = (v: number): Condition => vit('san', '>', v);

export const item = (id: ID, count = 1): Condition => ({ op: 'has-item', item: id, count });
export const stig = (stigma: StigmaKind, cmp: Cmp, value: number): Condition => ({
  op: 'stigma',
  stigma,
  cmp,
  value,
});
export const inRoom = (archetype: RoomArchetype): Condition => ({ op: 'in-room', archetype });
export const deeper = (cmp: Cmp, value: number): Condition => ({ op: 'depth', cmp, value });

export const all = (...of: readonly Condition[]): Condition => ({ op: 'all', of });
export const any = (...of: readonly Condition[]): Condition => ({ op: 'any', of });
export const not = (of: Condition): Condition => ({ op: 'not', of });

// ---------------------------------------------------------------------------
// 效果
// ---------------------------------------------------------------------------

export const setf = (key: string, value: FlagValue = true): Effect => ({ op: 'flag', key, value });
export const addf = (key: string, delta = 1): Effect => ({ op: 'flag-add', key, delta });
export const learn = (node: ID): Effect => ({ op: 'knowledge', node });
export const mark = (stigma: StigmaKind, delta: number): Effect => ({ op: 'stigma', stigma, delta });
export const vitalFx = (stat: keyof Vitals, delta: number): Effect => ({ op: 'vital', stat, delta });
export const san = (delta: number): Effect => vitalFx('san', delta);
export const fear = (delta: number): Effect => vitalFx('fear', delta);
export const oxy = (delta: number): Effect => vitalFx('oxygen', delta);
export const give = (id: ID, count = 1): Effect => ({ op: 'item', item: id, count });
export const take = (id: ID, count = 1): Effect => ({ op: 'item', item: id, count: -count });
export const loud = (amount: number): Effect => ({ op: 'noise', amount });
export const sfx = (cue: string): Effect => ({ op: 'sfx', cue });
export const shake = (amount: number): Effect => ({ op: 'camera', shake: amount });
export const fade = (to: string): Effect => ({ op: 'camera', fade: to });
export const jump = (node: ID): Effect => ({ op: 'goto', node });
export const finish = (id: ID): Effect => ({ op: 'ending', ending: id });
export const status = (effect: ID, duration?: Breaths): Effect => ({ op: 'status', effect, duration });
export const unstatus = (effect: ID): Effect => ({ op: 'remove-status', effect });
export const openDoor = (door: ID): Effect => ({ op: 'unlock-door', door });
export const rethread = (intensity: number): Effect => ({ op: 'reweave', intensity });
export const summon = (entity: ID, where?: ID): Effect => ({ op: 'spawn', entity, where });
export const fight = (encounter: ID): Effect => ({ op: 'encounter', encounter });

// ---------------------------------------------------------------------------
// 节点
// ---------------------------------------------------------------------------

/** 低 SAN 文本变体。参数按 belowSan 从高到低写。 */
export const cor = (
  ...pairs: readonly (readonly [number, string])[]
): { belowSan: number; text: string }[] => pairs.map(([belowSan, text]) => ({ belowSan, text }));

export function node(def: NarrativeNode): NarrativeNode {
  return def;
}

export function say(
  id: ID,
  speaker: string | undefined,
  text: string,
  choices: readonly NarrativeChoice[],
  extra: Omit<NarrativeNode, 'id' | 'speaker' | 'text' | 'choices'> = {},
): NarrativeNode {
  return { id, speaker, text, choices, ...extra };
}

export function c(def: NarrativeChoice): NarrativeChoice {
  return def;
}

/** 无条件、只跳转的选项 */
export const go = (id: ID, label: string, target: ID, extra: Partial<NarrativeChoice> = {}): NarrativeChoice => ({
  id,
  label,
  goto: target,
  ...extra,
});

/** 带门控的选项 */
export const gate = (
  id: ID,
  label: string,
  requires: Condition,
  target: ID,
  gateMode: 'hide' | 'disable' | 'lie' = 'hide',
  extra: Partial<NarrativeChoice> = {},
): NarrativeChoice => ({ id, label, requires, gateMode, goto: target, ...extra });

/** 沉默 —— 本作出现频率最高的选项，因为它几乎总是正确的 */
export const silence = (
  id: ID,
  target?: ID,
  label = '……（不出声）',
  extra: Partial<NarrativeChoice> = {},
): NarrativeChoice => ({
  id,
  label,
  goto: target,
  effects: [mark('silence', 1)],
  ...extra,
});

export function ending(def: Ending): Ending {
  return def;
}
