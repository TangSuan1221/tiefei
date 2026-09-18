/**
 * 声呐给骨架、片子给血肉的机关与货箱。
 * ============================================================================
 * 每一种都回答同一个问题：什么东西有物理体积，但不看颜色、光影、水流或纹理
 * 就绝对不知道怎么应付。
 */

import type { Rng } from '@/core/contract';
import type { SupplyId } from '../content/supplies';
import { sanBand } from '../content/sanity';
import type { HazardKind, LockSide, StripeId } from '../content/acts';
import { rulesFor, type ActGenRules } from './story';
import type { AmbiguousCache, CacheTruth, TimingHazard, Volume, VolumeNode } from './volume';

export type Lane = 'port' | 'center' | 'starboard';

const SIDES: readonly LockSide[] = ['port', 'starboard', 'dorsal', 'ventral'];
const LANES: readonly Lane[] = ['port', 'center', 'starboard'];

const SIDE_CN: Record<LockSide, string> = {
  port: '左舷',
  starboard: '右舷',
  dorsal: '上方',
  ventral: '下方',
};

const LANE_CN: Record<Lane, string> = {
  port: '左',
  center: '中',
  starboard: '右',
};

const LANE_EN: Record<Lane, string> = {
  port: 'port / left',
  center: 'centre',
  starboard: 'starboard / right',
};

export function placeTrap(vol: Volume, node: VolumeNode, kind: HazardKind, rng: Rng): void {
  const period = rng.float(3.6, 6.8);
  const phase = rng.next();
  const base = { node: node.id, kind, period, phase };
  switch (kind) {
    case 'fan':
      vol.hazards.push({ ...base, openRatio: 0.34 });
      return;
    case 'vent':
      vol.hazards.push({ ...base, openRatio: 0.48 });
      return;
    case 'current':
    case 'vortex':
      vol.hazards.push({
        ...base,
        openRatio: 1,
        side: rng.pick(['port', 'starboard'] as const),
        crab: rng.bool() ? -45 : 45,
      });
      return;
    case 'laser':
      vol.hazards.push({
        ...base,
        openRatio: 0.36,
        sequence: rng.shuffle([...LANES]) as Lane[],
      });
      return;
    case 'crusher':
      vol.hazards.push({
        ...base,
        openRatio: 0.28,
        side: rng.pick(['port', 'starboard'] as const),
      });
      return;
    case 'veil':
      vol.hazards.push({
        ...base,
        openRatio: 1,
        side: rng.pick(SIDES),
        sonarHidden: true,
      });
      return;
    case 'minefield':
      vol.hazards.push({
        ...base,
        openRatio: 1,
        live: rng.shuffle([...LANES]).slice(0, rng.int(1, 2)) as Lane[],
      });
      return;
    case 'photophobe':
      vol.hazards.push({
        ...base,
        openRatio: 1,
        flashOpen: rng.float(12, 18),
      });
      return;
  }
}

const CACHE_STRIPE: Record<CacheTruth, StripeId> = {
  live: 'ember',
  empty: 'bone',
  trap: 'blood',
};

const CACHE_LOOT: Record<CacheTruth, readonly (readonly [SupplyId, number])[]> = {
  live: [['sup.cell', 1]],
  empty: [],
  trap: [],
};

export function placeCaches(vol: Volume, rng: Rng, san: number, rules?: ActGenRules): void {
  const bound = rules ?? rulesFor(vol.story);
  if (bound.cleanShaft || (bound.forbidExitCaches && vol.story === 'escort')) return;
  const chamber =
    vol.nodes.find((n) => n.role === 'chamber') ??
    vol.nodes.find((n) => n.role === 'entry');
  if (!chamber) return;
  const band = sanBand(san);
  let truths: CacheTruth[] =
    band === 'broken' && !bound.forbidTrapCaches
      ? ['live', 'empty', 'trap']
      : ['live', 'empty'];
  if (bound.forbidTrapCaches) truths = truths.filter((t) => t !== 'trap');
  if (vol.story === 'accident') truths = ['live'];
  rng.shuffle(truths);
  truths.forEach((truth, i) => {
    const sign = i % 2 === 0 ? -1 : 1;
    const node: VolumeNode = {
      id: `${vol.id}.cache.${i}`,
      pos: {
        x: chamber.pos.x + sign * rng.float(14, 22),
        y: chamber.pos.y + rng.float(6, 14),
        z: chamber.pos.z + rng.float(-2, 6),
      },
      role: 'cache',
      stripe: 'none',
      label: '块状货箱',
      size: { x: 8, y: 8, z: 6 },
      obstacles: [],
    };
    vol.nodes.push(node);
    vol.edges.push({
      id: `${chamber.id}>${node.id}`,
      from: chamber.id,
      to: node.id,
      kind: 'lateral',
      length: Math.max(18, Math.hypot(node.pos.x - chamber.pos.x, node.pos.y - chamber.pos.y, node.pos.z - chamber.pos.z)),
    });
    vol.caches.push({
      node: node.id,
      sonarLabel: '块状货箱回波',
      stripe: CACHE_STRIPE[truth],
      truth,
      loot: CACHE_LOOT[truth],
    });
  });
}

export function identifyTrap(h: TimingHazard): string {
  const side = h.side ? SIDE_CN[h.side] : '';
  switch (h.kind) {
    case 'fan':
      return `扇叶缺口周期 ${h.period.toFixed(1)} 秒。默数，然后盲开。`;
    case 'vent':
      return `热泉喷发周期 ${h.period.toFixed(1)} 秒。默数，然后盲开。`;
    case 'current':
    case 'vortex':
      return `洞穴是空的。颗粒全在往${side}飞。头向反方向偏 ${Math.abs(h.crab ?? 45).toFixed(0)}°，斜着滑过去。`;
    case 'laser': {
      const seq = (h.sequence ?? []).map((l) => LANE_CN[l]).join('、');
      return `柱子之间有切割激光。熄灭顺序 ${seq}，窗口 ${h.period.toFixed(1)} 秒。黑暗里按这个拍子走。`;
    }
    case 'crusher':
      return `那不是门，是故障液压闸。砸到底时${side}会留一条缝。起落 ${h.period.toFixed(1)} 秒一次。`;
    case 'veil':
      return `声呐穿过去了，因为那是一层透明的酸膜。裂隙在${side}。别信那条康庄大道。`;
    case 'minefield': {
      const live = (h.live ?? []).map((l) => LANE_CN[l]).join('、');
      return `球体里只有${live}侧那几颗在闪红光。其余是孢子。按片子里的红点走 S 线。`;
    }
    case 'photophobe':
      return `管壁上的东西怕光。闪光会让它们缩回去大约 ${Math.round(h.flashOpen ?? 14)} 秒。电换路。再胀回来就拍下一次。`;
  }
}

export function identifyCache(c: AmbiguousCache): string {
  if (c.truth === 'live') return `货箱封条是警戒漆。灯还亮着。那一格是活的电池。`;
  if (c.truth === 'empty') return `货箱封条是骨白。里面是水。不要把机械臂伸进去耗电。`;
  return `货箱封条是锈血。感应雷。声呐上看它和旁边那只一样。`;
}

export function trapFootageTell(h: TimingHazard): string {
  const side = h.side ?? 'port';
  switch (h.kind) {
    case 'fan':
      return `cooling-fan blade notch cycle ${h.period.toFixed(1)}s`;
    case 'vent':
      return `vent eruption cycle ${h.period.toFixed(1)}s`;
    case 'current':
    case 'vortex':
      return `cave looks empty but silt and bubbles race to the ${side}; crab the nose ${h.crab ?? -45} degrees against the flow`;
    case 'laser':
      return `cutting lasers between two rows of emitters, extinguishing in order ${(h.sequence ?? []).map((l) => LANE_EN[l]).join(' then ')}, period ${h.period.toFixed(1)}s`;
    case 'crusher':
      return `hydraulic blast door slamming, a jammed scrap leaves a gap on the ${side} at the bottom of each ${h.period.toFixed(1)}s stroke`;
    case 'veil':
      return `sonar-transparent acid membrane / industrial gel wall, crack on the ${side}, invisible to ping, lit only by floodlight reflection`;
    case 'minefield':
      return `field of identical spheres; only ${(h.live ?? []).map((l) => LANE_EN[l]).join(' and ')} flash a warning blood-red, the rest are harmless spores`;
    case 'photophobe':
      return `photophobic wall-growth shrinking from the floodlight for ${Math.round(h.flashOpen ?? 14)} seconds then swelling back`;
  }
}

export function cacheFootageTell(c: AmbiguousCache): string {
  const colour =
    c.stripe === 'ember' ? 'warning ember lacquer, lamp still lit, live battery' :
    c.stripe === 'blood' ? 'blood-rust seal, live mine' :
    'bone-white stencil, flooded empty shell';
  return `identical crate return resolving as ${colour}`;
}

export function sonarHides(h: TimingHazard | undefined, identified: boolean): boolean {
  return !!h?.sonarHidden && !identified;
}
