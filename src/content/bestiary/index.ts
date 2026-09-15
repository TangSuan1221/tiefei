/**
 * 图鉴注册表。全项目查敌人定义的唯一入口。
 *
 * 这里额外做一件事：模块加载时对内容做**结构断言**（部位数、认知档位数、
 * 要害唯一性、telegraph 覆盖率）。内容错误宁可在启动时崩掉，
 * 也不要变成运行时"敌人没有意图所以站着不动"这种难查的 bug。
 */

import type { ID } from '../../core/contract';
import { assert } from '../../core/util';
import type { EnemyDef } from '../../encounter/types';
import { LISTENER } from './listener';
import { DROWNED_CREW, CHOIR_THROAT } from './drowned';
import { CENSER_BEARER, SILENT_DEACON } from './cult';
import { SYMBIOTE_HOST, BILGE_BROOD, PIPE_DWELLER } from './flesh';
import { SONAR_PARASITE, HULL_MIMIC, ANGLERLIGHT } from './acoustic';
import { IRON_LUNG, PREVIOUS_YOU } from './iron';

export const BESTIARY: readonly EnemyDef[] = [
  LISTENER,
  DROWNED_CREW,
  CHOIR_THROAT,
  CENSER_BEARER,
  SILENT_DEACON,
  SYMBIOTE_HOST,
  BILGE_BROOD,
  PIPE_DWELLER,
  SONAR_PARASITE,
  HULL_MIMIC,
  ANGLERLIGHT,
  IRON_LUNG,
  PREVIOUS_YOU,
];

const BY_ID = new Map<ID, EnemyDef>();
for (const def of BESTIARY) {
  assert(!BY_ID.has(def.id), `重复的敌人 id: ${def.id}`);
  assert(def.parts.length >= 4, `${def.id} 部位数 ${def.parts.length} < 4（GDD §9 最低门槛）`);
  assert(def.parts.length <= 8, `${def.id} 部位数过多，部位图会失去可读性`);
  assert(def.tiers.length === 4, `${def.id} 认知档位必须是 4 个`);
  assert(def.tiers[0].min === 0, `${def.id} 第 0 档阈值必须是 0`);
  assert(def.senses.length >= 1, `${def.id} 至少要有一条感知通道`);
  assert(def.intents.length >= 3, `${def.id} 意图太少，AI 会退化成只会平砍`);
  // 不可杀的敌人不允许有要害，否则玩家会认为自己做错了
  const vitals = def.parts.filter((p) => p.vital);
  if (def.unkillable) {
    assert(vitals.length === 0, `${def.id} 标记为 unkillable 却有要害部位`);
  } else {
    assert(vitals.length >= 1, `${def.id} 没有要害，玩家无法终结它`);
  }
  for (let i = 1; i < 4; i++) {
    assert(def.tiers[i].min > def.tiers[i - 1].min, `${def.id} 认知档位阈值必须递增`);
  }
  for (const it of def.intents) {
    // 每个会被选中的意图都必须有 telegraph，否则玩家无法预读
    assert(
      (def.telegraphs[it.kind]?.length ?? 0) >= 1 || def.neverVisible === true,
      `${def.id} 的意图 ${it.kind} 缺少 telegraph 文本`,
    );
  }
  const partIds = new Set(def.parts.map((p) => p.id));
  assert(partIds.size === def.parts.length, `${def.id} 部位 id 重复`);
  BY_ID.set(def.id, def);
}

export function hasEnemyDef(id: ID): boolean {
  return BY_ID.has(id);
}

export function enemyDef(id: ID): EnemyDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`[bestiary] 未注册的敌人 id: ${id}`);
  return d;
}

export function allEnemyDefs(): readonly EnemyDef[] {
  return BESTIARY;
}

/** 内容统计，供 docs 与模拟器输出 */
export function bestiaryStats(): {
  enemies: number;
  parts: number;
  tiers: number;
  telegraphLines: number;
  evidenceLines: number;
} {
  let parts = 0;
  let telegraphLines = 0;
  let evidenceLines = 0;
  for (const d of BESTIARY) {
    parts += d.parts.length;
    for (const k of Object.keys(d.telegraphs)) {
      telegraphLines += d.telegraphs[k as keyof typeof d.telegraphs]?.length ?? 0;
    }
    evidenceLines += d.evidence?.length ?? 0;
  }
  return { enemies: BESTIARY.length, parts, tiers: BESTIARY.length * 4, telegraphLines, evidenceLines };
}

export { ENCOUNTERS, encounterPreset } from './encounters';
export type { EncounterPreset } from './encounters';
