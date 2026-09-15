/**
 * 图鉴内容的构造助手。
 * 只为把"每个部位七个字段"的样板收紧，让敌人文件里留下的都是**设计决策**本身。
 */

import type { Effect, ID } from '../../core/contract';
import type { CognitionTier, PartConsequence, PartDef, PartFunction } from '../../encounter/types';

export function part(
  id: ID,
  name: string,
  falseName: string,
  fn: PartFunction,
  stats: { hp: number; evasion?: number; armor?: number; vital?: boolean; revealAt?: 0 | 1 | 2 | 3 },
  consequence: PartConsequence,
  describe: string,
  effects?: readonly Effect[],
): PartDef {
  return {
    id,
    name,
    falseName,
    fn,
    hp: stats.hp,
    evasion: stats.evasion ?? 0.1,
    armor: stats.armor ?? 0,
    vital: stats.vital ?? false,
    revealAt: stats.revealAt ?? 1,
    consequence,
    effects,
    describe,
  };
}

export function tier(
  min: number,
  name: string,
  description: string,
  chartFidelity: number,
  unlocks: readonly ID[],
  counsel: string,
): CognitionTier {
  return { min, name, description, chartFidelity, unlocks, counsel };
}

/** 认知跨档奖励：把"了解它"写进 flag，供叙事系统与结局条件读取 */
export function knowledgeOf(defId: ID): readonly Effect[] {
  return [
    { op: 'knowledge', node: `know.bestiary.${defId}` },
    { op: 'flag-add', key: `count.dissected.${defId}`, delta: 1 },
  ];
}
