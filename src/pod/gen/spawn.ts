/**
 * 生物生成。只问这一拍需要什么样的信息干扰，不写死「这一关是钩灯」。
 * ============================================================================
 * 声呐孪生组：同一组里的东西，雷达体型和速度完全一样，危险程度完全相反。
 * 所以那团又大又快的红点，可能是须鲸，也可能是冲行体。
 *
 * 关卡生成器调用 `spawnInto`。具体种类按心理拍从池里抽。
 * 抽出来的名单进 `Volume.fauna`，再由片子提示词逐条写进去。
 */

import type { Rng } from '@/core/contract';
import {
  creature,
  isHarmless,
  sonarLabelOf,
  type Creature,
  type CreatureId,
  type SonarSize,
  type SonarSpeed,
} from '../content/creatures';
import { actAt, type EchoKind, type PsychBeat } from '../content/acts';
import { sanBand } from '../content/sanity';
import { rulesFor } from './story';
import type { Volume } from './volume';

export type SpawnRole = 'echo' | 'background' | 'site-threat';

export interface SpawnedLife {
  id: string;
  creature: CreatureId;
  role: SpawnRole;
  node: string | null;
}

interface TwinGroup {
  id: string;
  size: SonarSize;
  speed: SonarSpeed;
  safe: readonly CreatureId[];
  kill: readonly CreatureId[];
}

/**
 * 四组声呐孪生。生成器只从这里抽敌/友歧义，
 * 保证雷达上看起来是同一种回波。
 */
const TWINS: readonly TwinGroup[] = [
  {
    id: 'huge-slow',
    size: 'huge',
    speed: 'slow',
    safe: ['cre.jelly', 'cre.siphon'],
    kill: ['cre.acid', 'cre.veil'],
  },
  {
    id: 'huge-fast',
    size: 'huge',
    speed: 'fast',
    safe: ['cre.whale'],
    kill: ['cre.runner'],
  },
  {
    id: 'tiny-still',
    size: 'tiny',
    speed: 'still',
    safe: ['cre.crab'],
    kill: ['cre.needle'],
  },
  {
    id: 'tiny-fast',
    size: 'tiny',
    speed: 'fast',
    safe: ['cre.school'],
    kill: ['cre.mite'],
  },
];

type TwinId = (typeof TWINS)[number]['id'];

/** 招牌克系。跟心理拍走，不进孪生抽签 */
const NAMED: Readonly<Record<PsychBeat, CreatureId>> = {
  teach: 'cre.hollow',
  unease: 'cre.chorus',
  skill: 'cre.angler',
  betray: 'cre.angler',
  compress: 'cre.weave',
  dread: 'cre.hollow',
  release: 'cre.weave',
};

/**
 * 每一拍要什么干扰。
 * twin = 敌/友回波用哪一组孪生；extra = 背景里再丢哪些组（只抽一只，方向见 pick）。
 */
const RHYTHM: Readonly<
  Record<
    PsychBeat,
    {
      twin: TwinId | null;
      extras: readonly { group: TwinId; pick: 'safe' | 'kill' }[];
    }
  >
> = {
  teach: { twin: 'huge-slow', extras: [{ group: 'tiny-fast', pick: 'safe' }] },
  unease: { twin: null, extras: [{ group: 'tiny-still', pick: 'kill' }, { group: 'huge-fast', pick: 'safe' }] },
  skill: { twin: null, extras: [{ group: 'huge-fast', pick: 'safe' }, { group: 'tiny-fast', pick: 'safe' }] },
  betray: { twin: null, extras: [{ group: 'tiny-still', pick: 'kill' }] },
  compress: { twin: null, extras: [{ group: 'huge-fast', pick: 'safe' }, { group: 'tiny-still', pick: 'kill' }] },
  dread: { twin: null, extras: [{ group: 'tiny-fast', pick: 'kill' }, { group: 'huge-slow', pick: 'safe' }] },
  release: { twin: 'huge-slow', extras: [{ group: 'tiny-fast', pick: 'safe' }] },
};

function twinById(id: TwinId): TwinGroup {
  const g = TWINS.find((t) => t.id === id);
  if (!g) throw new Error(`[spawn] 没有孪生组 ${id}`);
  return g;
}

function pickUnused(rng: Rng, pool: readonly CreatureId[], used: Set<CreatureId>): CreatureId {
  const open = pool.filter((id) => !used.has(id));
  const id = rng.pick(open.length ? open : pool);
  used.add(id);
  return id;
}

export interface EchoSpawn {
  sonarLabel: string;
  candidates: readonly [string, string];
  truth: string;
  creature: CreatureId | null;
}

function echoFromTwins(group: TwinGroup, rng: Rng, used: Set<CreatureId>, forceKill = false): EchoSpawn {
  const safeId = pickUnused(rng, group.safe, used);
  const killId = pickUnused(rng, group.kill, used);
  const safe = creature(safeId);
  const kill = creature(killId);
  const lethal = forceKill || rng.bool(0.5);
  const truthC = lethal ? kill : safe;
  return {
    sonarLabel: sonarLabelOf(safe),
    candidates: [safe.name, kill.name],
    truth: truthC.name,
    creature: truthC.id,
  };
}

function echoFromKind(
  kind: EchoKind,
  site: CreatureId,
  rng: Rng,
  used: Set<CreatureId>,
  twin: TwinId | null,
  mimicBias = 0.5,
): EchoSpawn {
  switch (kind) {
    case 'ally-or-acid':
      return echoFromTwins(twinById(twin ?? 'huge-slow'), rng, used);
    case 'cache-or-mimic': {
      const fake = creature('cre.angler');
      used.add('cre.angler');
      const lethal = rng.next() < mimicBias;
      return {
        sonarLabel: '规整块状回波',
        candidates: ['电池组补给站', fake.name],
        truth: lethal ? fake.name : '电池组补给站',
        creature: lethal ? fake.id : null,
      };
    }
    case 'sleep-or-rage': {
      const c = creature(site);
      used.add(site);
      const asleep = rng.bool(0.5);
      return {
        sonarLabel: sonarLabelOf(c),
        candidates: ['沉睡（呼吸缓慢）', '狂暴游动'],
        truth: asleep ? '沉睡（呼吸缓慢）' : '狂暴游动',
        creature: site,
      };
    }
    case 'watcher': {
      used.add('cre.hollow');
      const c = creature('cre.hollow');
      return {
        sonarLabel: sonarLabelOf(c),
        candidates: ['它在看你', '一堆死鱼'],
        truth: '它在看你',
        creature: 'cre.hollow',
      };
    }
  }
}

/**
 * 按关卡节奏把生物写进体积。
 * 布局已经摆好节点之后再调用：回波要挂在 echo 节点上。
 */
export function spawnInto(vol: Volume, rng: Rng, san = 100): void {
  const recipe = actAt(vol.act);
  const beat = RHYTHM[recipe.psych];
  const rules = rulesFor(recipe.story);
  const used = new Set<CreatureId>();
  const fauna: SpawnedLife[] = [];

  const siteThreat = recipe.threat || NAMED[recipe.psych];
  used.add(siteThreat);

  const echoNode = vol.nodes.find((n) => n.role === 'echo');
  if (recipe.echo && echoNode) {
    const echo = echoFromKind(
      recipe.echo,
      siteThreat,
      rng,
      used,
      beat.twin,
      rules.mimicBias,
    );
    vol.echoes.push({
      node: echoNode.id,
      kind: recipe.echo,
      sonarLabel: echo.sonarLabel,
      candidates: echo.candidates,
      truth: echo.truth,
      creature: echo.creature,
    });
    if (echo.creature) {
      fauna.push({
        id: `echo.${echoNode.id}`,
        creature: echo.creature,
        role: 'echo',
        node: echoNode.id,
      });
    }
  }

  for (const extra of beat.extras) {
    const g = twinById(extra.group);
    const pick = rules.harmlessExtras ? 'safe' : extra.pick;
    const pool = pick === 'safe' ? g.safe : g.kill;
    const id = pickUnused(rng, pool, used);
    fauna.push({
      id: `bg.${id}`,
      creature: id,
      role: 'background',
      node: null,
    });
  }

  fauna.push({
    id: `site.${siteThreat}`,
    creature: siteThreat,
    role: 'site-threat',
    node: null,
  });

  const band = sanBand(san);
  if (band !== 'lucid' && recipe.story !== 'accident') {
    const extraGroup = band === 'broken' ? 'tiny-still' : 'huge-fast';
    const g = twinById(extraGroup);
    const pool = band === 'broken' && !rules.harmlessExtras ? g.kill : g.safe;
    const id = pickUnused(rng, pool, used);
    fauna.push({
      id: `san.${id}`,
      creature: id,
      role: 'background',
      node: null,
    });
  }

  vol.fauna = fauna;
}

/** 这一卷片子里应该出现的造物，去重，空回声仍然算一个 */
export function faunaOnTape(vol: Volume): Creature[] {
  const seen = new Set<CreatureId>();
  const out: Creature[] = [];
  for (const f of vol.fauna) {
    if (seen.has(f.creature)) continue;
    seen.add(f.creature);
    out.push(creature(f.creature));
  }
  return out;
}

export function siteThreatOf(vol: Volume): CreatureId | null {
  return vol.fauna.find((f) => f.role === 'site-threat')?.creature ?? null;
}

export function echoCreature(vol: Volume, nodeId: string): Creature | null {
  const echo = vol.echoes.find((e) => e.node === nodeId);
  if (!echo?.creature) return null;
  return creature(echo.creature);
}

export function passThrough(c: Creature): boolean {
  return isHarmless(c);
}
