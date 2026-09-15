/**
 * world/rooms.ts — 房间内容库注册表
 *
 * 20 个 RoomArchetype 是骨架，这里的 RoomVariant 才是「那个房间」。
 * 注册表启动时做三件自检：id 不重复、引用的 prop 定义都存在、
 * 每个甲板的每个候选原型都至少有一个变体。内容错误宁可启动就崩，
 * 也不要在第 700 次生成时才暴露成一个空房间。
 */

import type { AmbientConditions, ID, Prop, Rng, RoomArchetype } from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { fbm2 } from '../core/rng';
import { DECKS, deckSpec } from './decks';
import { hasPropDef, instantiateProp } from './props';
import type { PropPick, RoomVariant } from './types';
import { sanTier } from './types';
import { HAB_ROOMS } from './content/rooms.hab';
import { MECH_ROOMS } from './content/rooms.mech';
import { CMD_ROOMS } from './content/rooms.cmd';
import { DEEP_ROOMS } from './content/rooms.deep';
import { EXTRA_ROOMS, SETPIECE_ROOMS } from './content/rooms.special';

export const ALL_ROOM_VARIANTS: readonly RoomVariant[] = [
  ...HAB_ROOMS,
  ...MECH_ROOMS,
  ...CMD_ROOMS,
  ...DEEP_ROOMS,
  ...SETPIECE_ROOMS,
  ...EXTRA_ROOMS,
];

const BY_ID = new Map<string, RoomVariant>();
/** key = `${deck}:${archetype}`，只含参与常规抽取的变体 */
const POOL = new Map<string, RoomVariant[]>();
const BY_ARCHETYPE = new Map<RoomArchetype, RoomVariant[]>();

const poolKey = (deck: number, archetype: RoomArchetype) => `${deck}:${archetype}`;

for (const v of ALL_ROOM_VARIANTS) {
  if (BY_ID.has(v.id)) throw new Error(`[world/rooms] 重复的房间变体 id: ${v.id}`);
  BY_ID.set(v.id, v);

  for (const pick of v.props) {
    if (!hasPropDef(pick[0])) {
      throw new Error(`[world/rooms] 变体 ${v.id} 引用了不存在的 prop 定义: ${pick[0]}`);
    }
  }

  const archList = BY_ARCHETYPE.get(v.archetype) ?? [];
  archList.push(v);
  BY_ARCHETYPE.set(v.archetype, archList);

  if (v.manualOnly) continue;
  for (const deck of v.decks) {
    const key = poolKey(deck, v.archetype);
    const list = POOL.get(key) ?? [];
    list.push(v);
    POOL.set(key, list);
  }
}

/** 启动自检：每个甲板权重表里的原型都必须有可用变体 */
export function assertRoomCoverage(): void {
  const gaps: string[] = [];
  for (const spec of DECKS) {
    const wanted = new Set<RoomArchetype>([
      ...spec.anchors,
      ...spec.weights.filter(([, w]) => w > 0).map(([a]) => a),
      ...spec.spineArchetypes.filter(([, w]) => w > 0).map(([a]) => a),
    ]);
    for (const arch of wanted) {
      if (!(POOL.get(poolKey(spec.deck, arch))?.length ?? 0)) gaps.push(`${spec.code}/${arch}`);
    }
  }
  if (gaps.length) throw new Error(`[world/rooms] 甲板缺少可用房间变体: ${gaps.join(', ')}`);
}

export function roomVariant(id: string): RoomVariant {
  const v = BY_ID.get(id);
  if (!v) throw new Error(`[world/rooms] 未知房间变体: ${id}`);
  return v;
}

export function hasRoomVariant(id: string): boolean {
  return BY_ID.has(id);
}

export function variantsOfArchetype(archetype: RoomArchetype): readonly RoomVariant[] {
  return BY_ARCHETYPE.get(archetype) ?? [];
}

export function poolFor(deck: number, archetype: RoomArchetype): readonly RoomVariant[] {
  return POOL.get(poolKey(deck, archetype)) ?? [];
}

/**
 * 抽一个变体。
 * `used` 是本次生成已用过的 unique 变体集合 —— 同一艘船不会出现两个同名房间。
 * 抽不到就回退到该甲板的 corridor，再回退到全局任意同原型变体。
 * 回退链必须存在，否则生成器会在罕见的权重组合下抛异常。
 */
export function pickVariant(
  rng: Rng,
  deck: number,
  archetype: RoomArchetype,
  used: Set<string>,
): RoomVariant {
  const primary = poolFor(deck, archetype).filter((v) => !(v.unique && used.has(v.id)));
  if (primary.length) {
    // 已用过的非 unique 变体降权，让同一层的房间读起来不重复
    const entries = primary.map(
      (v) => [v, used.has(v.id) ? Math.max(0.6, v.weight * 0.14) : v.weight] as [RoomVariant, number],
    );
    return rng.weighted(entries);
  }
  const corridor = poolFor(deck, 'corridor').filter((v) => !(v.unique && used.has(v.id)));
  if (corridor.length) return rng.pick(corridor);
  const any = variantsOfArchetype(archetype).filter((v) => !v.manualOnly);
  if (any.length) return rng.pick(any);
  return ALL_ROOM_VARIANTS[0];
}

/** 三档房间描述。SAN 分档来自 types.sanTier（60 / 30） */
export function describeRoom(variantId: string, san: number): string {
  const v = BY_ID.get(variantId);
  if (!v) return '一个你无法描述的空间。';
  switch (sanTier(san)) {
    case 'lucid':
      return v.lucid;
    case 'drift':
      return v.drift;
    default:
      return v.resonant;
  }
}

/**
 * 计算房间的实际环境。
 * 基线来自甲板，变体给的字段是绝对覆盖，最后叠一层 fbm2 噪声场 ——
 * 同一个变体在不同种子/不同位置会有细微差别，避免"两个一样的淹水舱"。
 */
export function ambientFor(
  variant: RoomVariant,
  deck: number,
  pos: { x: number; y: number },
  seed: number,
  floodLevel: number,
): AmbientConditions {
  const base = deckSpec(deck).ambient;
  const spec = deckSpec(deck);
  const jitter = fbm2(pos.x * 0.21, pos.y * 0.21 + deck * 7.3, 3, seed);
  const jitter2 = fbm2(pos.x * 0.37 + 11.1, pos.y * 0.37, 2, seed + 977);

  const o = variant.ambient ?? {};
  const flooding = clamp01(
    (o.flooding ?? base.flooding) + (floodLevel - 0.5) * spec.floodBias * 0.55 + (jitter - 0.5) * 0.12,
  );
  return {
    flooding,
    pressure: o.pressure ?? base.pressure,
    temperature: clamp((o.temperature ?? base.temperature) + (jitter2 - 0.5) * 1.6, -2, 44),
    airQuality: clamp01((o.airQuality ?? base.airQuality) - flooding * 0.22 + (jitter2 - 0.5) * 0.08),
    noiseFloor: clamp01((o.noiseFloor ?? base.noiseFloor) + (jitter - 0.5) * 0.06),
    presence: clamp01((o.presence ?? base.presence) + (jitter2 - 0.5) * 0.1),
  };
}

/** 噪音阈值：安静的房间更容易"超标"，这是爬管的真实代价之一 */
export function noiseThresholdFor(variant: RoomVariant, deck: number, rng: Rng): number {
  if (variant.noiseThreshold !== undefined) {
    return variant.noiseThreshold + rng.int(-3, 3);
  }
  const base = 54 - deck * 2.4;
  const floorBonus = (variant.ambient?.noiseFloor ?? deckSpec(deck).ambient.noiseFloor) * 46;
  return Math.round(clamp(base + floorBonus + rng.float(-4, 4), 28, 92));
}

export function floodRateFor(variant: RoomVariant, deck: number, flooding: number): number {
  if (variant.floodRate !== undefined) return variant.floodRate;
  const spec = deckSpec(deck);
  // 已经很满的房间涨得慢（水从别处来），干燥房间只有在邻居破了才涨
  return spec.floodBias * 0.0022 * (1 - flooding * 0.55);
}

/** 把变体的 prop 抽取表实例化成真正的 Prop 列表 */
export function materializeProps(
  variant: RoomVariant,
  rng: Rng,
  serial: () => number,
): Prop[] {
  const out: Prop[] = [];
  for (const pick of variant.props as readonly PropPick[]) {
    const defId = pick[0];
    const chance = pick[1];
    const maxCount = pick.length > 2 ? (pick[2] as number) : 1;
    let placed = 0;
    for (let i = 0; i < maxCount; i++) {
      if (!rng.bool(chance)) continue;
      out.push(instantiateProp(defId, serial()));
      placed++;
    }
    // 概率 ≥0.85 的 prop 视为"这个房间的定义性物件"，必须出现一个
    if (placed === 0 && chance >= 0.85) out.push(instantiateProp(defId, serial()));
  }
  return out;
}

export const ROOM_VARIANT_COUNT = ALL_ROOM_VARIANTS.length;
export const PICKABLE_VARIANT_COUNT = ALL_ROOM_VARIANTS.filter((v) => !v.manualOnly).length;

export const VARIANTS_PER_ARCHETYPE: Readonly<Record<RoomArchetype, number>> = (() => {
  const arche: RoomArchetype[] = [
    'corridor', 'bulkhead', 'engine', 'reactor', 'galley',
    'bunks', 'medbay', 'sonar-room', 'bridge', 'torpedo',
    'ballast', 'chapel', 'archive', 'moonpool', 'flooded',
    'crawlspace', 'airlock', 'void', 'reliquary', 'observation',
  ];
  const out = {} as Record<RoomArchetype, number>;
  for (const a of arche) out[a] = (BY_ARCHETYPE.get(a) ?? []).length;
  return out;
})();

/** 房间名带甲板前缀，声呐图与日志里读起来像船上的编号 */
export function decorateRoomName(variant: RoomVariant, deck: number, index: number): string {
  return `${deckSpec(deck).code}-${String(index).padStart(2, '0')} ${variant.name}`;
}

/** 供 UI 直接用的 id 工具 */
export function roomIdFor(deck: number, index: number): ID {
  return `r${deck}-${String(index).padStart(2, '0')}`;
}
