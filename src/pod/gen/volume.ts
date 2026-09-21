/**
 * 三维线框关卡。
 * ============================================================================
 * 声呐看见的不是房间，是节点和边：几何、距离、谁在动。
 * 颜色、周期、薄弱点、真身 —— 这些字段在 `identified === false` 时对玩家是空的。
 *
 * 每一关先生成内部空间（房间、廊、竖井），再往里面放回波和机关。
 * 第一关开局就生成，但全息屏要等第一卷送到分析台才亮。
 * 后六关在抵达该节点之后生成，同样要分析才进场。
 * 剧情职能约束见 `./story.ts`。
 */

import { Xoshiro } from '@/core/rng';
import { clamp, clamp01 } from '@/core/util';
import type { Rng } from '@/core/contract';
import { creature, sonarLabelOf, type CreatureId } from '../content/creatures';
import {
  ACTS,
  actAt,
  cloneLeg,
  type EchoKind,
  type HazardKind,
  type LockKind,
  type LockSide,
  type StripeId,
} from '../content/acts';
import type { Leg } from '../content/route';
import type { SupplyId } from '../content/supplies';
import { mixSanSeed, sanBand, type SanBand } from '../content/sanity';
import { spawnInto, type SpawnedLife } from './spawn';
import { identifyCache, identifyTrap, placeCaches, placeTrap, sonarHides } from './traps';
import { furnishVolume } from './interior';
import {
  collectMemory,
  emptyMemory,
  rulesFor,
  stencilFromSeed,
  type GenMemory,
  type HookNeed,
  type StoryFn,
} from './story';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type NodeRole =
  | 'entry'
  | 'chamber'
  | 'fork'
  | 'hazard'
  | 'interact'
  | 'charge'
  | 'wreck'
  | 'echo'
  | 'exit'
  | 'decoy'
  | 'trap'
  | 'cache';

export type EdgeKind = 'lateral' | 'rise' | 'dive' | 'shaft';

export interface VolumeNode {
  id: string;
  pos: Vec3;
  role: NodeRole;
  /** 警戒漆。未分析时玩家读到的永远是 none */
  stripe: StripeId;
  /** 给已分析线框用的短名。空字符串 = 只给全息体积用的填充舱室 */
  label: string;
  /** 房间外接盒（米）。全息屏按这个画这一间的内部 */
  size: Vec3;
  /** 这一间里面的障碍（管、箱、梁）。id 在这一间里唯一且稳定 */
  obstacles: { id: string; kind: string; pos: Vec3; size: Vec3 }[];
}

export interface VolumeEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  length: number;
}

export interface TimingHazard {
  node: string;
  kind: HazardKind;
  /** 秒。分析前是 0，表示「你不知道」 */
  period: number;
  /** 开口相位 0..1 */
  phase: number;
  /** 开口占周期的比例 */
  openRatio: number;
  /** 激光熄灭顺序 */
  sequence?: readonly ('port' | 'center' | 'starboard')[];
  /** 液压生门 / 暗流来向 / 透明膜裂隙 */
  side?: LockSide;
  /** 暗流需要的顶流航向偏移（度） */
  crab?: number;
  /** 真雷相对方位 */
  live?: readonly ('port' | 'center' | 'starboard')[];
  /** 厌光：闪光后开口秒数 */
  flashOpen?: number;
  /** 声呐波穿过去（透明膜） */
  sonarHidden?: boolean;
}

export type CacheTruth = 'live' | 'empty' | 'trap';

export interface AmbiguousCache {
  node: string;
  sonarLabel: string;
  /** 封条颜色。未分析时玩家读到的是 none */
  stripe: StripeId;
  truth: CacheTruth;
  loot: readonly (readonly [SupplyId, number])[];
}

export interface InteractLock {
  node: string;
  kind: LockKind;
  side: LockSide;
  stripe: StripeId;
  /** 切割器还剩几发。glyph / valve 不耗切割器 */
  uses: number;
  solved: boolean;
}

export interface AmbiguousEcho {
  node: string;
  kind: EchoKind;
  /** 声呐上的称呼 */
  sonarLabel: string;
  /** 两个候选。分析前两个都可能 */
  candidates: readonly [string, string];
  truth: string;
  /** 真身对应的造物。友好回波是 null */
  creature: CreatureId | null;
}

export interface Volume {
  act: number;
  id: string;
  nodes: VolumeNode[];
  edges: VolumeEdge[];
  hazards: TimingHazard[];
  locks: InteractLock[];
  echoes: AmbiguousEcho[];
  caches: AmbiguousCache[];
  /** 这一关抽中的生物。声呐只给体型速度，名字在片子里 */
  fauna: SpawnedLife[];
  /** 五秒片子分析过没有。没分析过 = 全息屏只有线框，没有名字 */
  identified: boolean;
  /** 第二卷：环境变了（鱼没了，触手在） */
  shifted: boolean;
  /** 厌光附着物被闪光打缩的截止时刻（run.clock） */
  photoOpenUntil: number;
  /** 生成这一关时的 SAN 分档 */
  san: SanBand;
  /** 接到上一关的哪一个出口节点 */
  splicedFrom: string | null;
  visited: string[];
  /** 剧情职能。生成器按这个收束 */
  story: StoryFn;
  /** 灰港编号。后面的关会把同一个号写回来 */
  stencil: string;
  memory: GenMemory;
  /** 本关卡关钩钉住的节点。万斯催的就是这块 */
  hookNode: string;
}

export interface GeneratedAct {
  volume: Volume;
  leg: Leg;
}

const SIDES: readonly LockSide[] = ['port', 'starboard', 'dorsal', 'ventral'];

export function nodeById(vol: Volume, id: string): VolumeNode {
  const n = vol.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`[volume] 没有节点 ${id}`);
  return n;
}

export function entryNode(vol: Volume): VolumeNode {
  return vol.nodes.find((n) => n.role === 'entry') ?? vol.nodes[0]!;
}

export function exitNode(vol: Volume): VolumeNode {
  return vol.nodes.find((n) => n.role === 'exit') ?? vol.nodes[vol.nodes.length - 1]!;
}

export function neighbors(vol: Volume, id: string): VolumeEdge[] {
  return vol.edges.filter((e) => e.from === id || e.to === id);
}

export function otherEnd(e: VolumeEdge, id: string): string {
  return e.from === id ? e.to : e.from;
}

export function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** 从 from 看 to 的水平方位（度，0 = +Y 北）和俯仰（度，正 = 下潜） */
export function bearingTo(from: Vec3, to: Vec3): { heading: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dy);
  let heading = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (heading < 0) heading += 360;
  const pitch = horiz < 0.01 ? (dz >= 0 ? 90 : -90) : (Math.atan2(dz, horiz) * 180) / Math.PI;
  return { heading, pitch };
}

export function shortestPath(vol: Volume, from: string, to: string): string[] {
  if (from === to) return [from];
  const q: string[] = [from];
  const prev = new Map<string, string | null>([[from, null]]);
  while (q.length) {
    const cur = q.shift()!;
    for (const e of neighbors(vol, cur)) {
      const n = otherEnd(e, cur);
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let p: string | null = cur;
        while (p) {
          path.push(p);
          p = prev.get(p) ?? null;
        }
        path.reverse();
        return path;
      }
      q.push(n);
    }
  }
  return [from];
}

/**
 * 现在这条边能不能过。未分析时玩家不知道周期，于是开口是运气。
 * 分析之后按真实秒表走。
 */
export function hazardOpen(h: TimingHazard, clock: number, identified: boolean, rng: Rng): boolean {
  if (!identified) return rng.next() < h.openRatio;
  const t = (clock / Math.max(0.4, h.period) + h.phase) % 1;
  return t < h.openRatio || t > 1 - h.openRatio * 0.15;
}

export function markVisited(vol: Volume, id: string): void {
  if (!vol.visited.includes(id)) vol.visited.push(id);
}

export function explorationDone(vol: Volume): boolean {
  const exit = exitNode(vol);
  const must = vol.nodes.filter((n) => n.role === 'interact' || n.role === 'wreck').map((n) => n.id);
  const seenMust = must.every((id) => vol.visited.includes(id));
  return vol.identified && vol.visited.includes(exit.id) && (must.length === 0 || seenMust);
}

/** 等距投影。z 向下为正，所以屏幕 y 随深度增加 */
export function projectIso(p: Vec3, scale: number): { x: number; y: number } {
  return {
    x: (p.x - p.y) * 0.86 * scale,
    y: (p.x + p.y) * 0.42 * scale + p.z * 0.72 * scale,
  };
}

const ROLE_SIZE: Readonly<Record<NodeRole, Vec3>> = {
  entry: { x: 12, y: 10, z: 7 },
  chamber: { x: 20, y: 18, z: 9 },
  fork: { x: 16, y: 16, z: 8 },
  hazard: { x: 14, y: 22, z: 10 },
  interact: { x: 12, y: 10, z: 7 },
  charge: { x: 10, y: 10, z: 8 },
  wreck: { x: 16, y: 14, z: 9 },
  echo: { x: 11, y: 11, z: 7 },
  exit: { x: 12, y: 10, z: 7 },
  decoy: { x: 12, y: 10, z: 7 },
  trap: { x: 14, y: 18, z: 8 },
  cache: { x: 8, y: 8, z: 6 },
};

function addNode(
  vol: Volume,
  role: NodeRole,
  pos: Vec3,
  label: string,
  stripe: StripeId = 'none',
  size?: Vec3,
): VolumeNode {
  const base = ROLE_SIZE[role];
  const n: VolumeNode = {
    id: `${vol.id}.${role}.${vol.nodes.length}`,
    pos: { ...pos },
    role,
    stripe,
    label,
    size: size ? { ...size } : { ...base },
    obstacles: [],
  };
  vol.nodes.push(n);
  return n;
}


function addEdge(vol: Volume, a: VolumeNode, b: VolumeNode): VolumeEdge {
  const dz = b.pos.z - a.pos.z;
  const horiz = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  let kind: EdgeKind = 'lateral';
  if (Math.abs(dz) > horiz * 1.2) kind = dz > 0 ? 'dive' : 'rise';
  if (Math.abs(dz) > horiz * 2.4) kind = 'shaft';
  const e: VolumeEdge = {
    id: `${a.id}>${b.id}`,
    from: a.id,
    to: b.id,
    kind,
    length: Math.max(18, dist3(a.pos, b.pos)),
  };
  vol.edges.push(e);
  return e;
}

function emptyVolume(act: number, splicedFrom: string | null, seed = 0): Volume {
  const recipe = actAt(act);
  return {
    act,
    id: recipe.leg.id,
    nodes: [],
    edges: [],
    hazards: [],
    locks: [],
    echoes: [],
    caches: [],
    fauna: [],
    identified: false,
    shifted: false,
    photoOpenUntil: 0,
    san: 'lucid',
    splicedFrom,
    visited: [],
    story: recipe.story,
    stencil: stencilFromSeed(seed),
    memory: emptyMemory(seed),
    hookNode: '',
  };
}

function placeLock(vol: Volume, node: VolumeNode, kind: LockKind, rng: Rng): void {
  const stripe: StripeId = kind === 'color-valve' ? 'ember' : kind === 'glyph' ? 'bone' : 'none';
  vol.locks.push({
    node: node.id,
    kind,
    side: rng.pick(SIDES),
    stripe,
    uses: kind === 'weak-cut' ? 1 : 0,
    solved: false,
  });
}

function layoutScatter(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '气闸');
  const ante = addNode(vol, 'chamber', { x: rng.float(-4, 4), y: 22, z: 3 }, '前厅');
  const hall = addNode(vol, 'chamber', { x: rng.float(-6, 6), y: 48, z: 6 }, '处理大厅', 'none', {
    x: 28,
    y: 22,
    z: 11,
  });
  const wreck = addNode(vol, 'wreck', { x: rng.float(18, 26), y: 52, z: 8 }, '设备间');
  const echo = addNode(vol, 'echo', { x: rng.float(-28, -16), y: 50, z: 9 }, '观察廊');
  const store = addNode(vol, 'chamber', { x: rng.float(8, 16), y: 72, z: 10 }, '物料格');
  const exit = addNode(vol, 'exit', { x: rng.float(-6, 6), y: 98, z: 16 }, '远端气闸');
  addEdge(vol, entry, ante);
  addEdge(vol, ante, hall);
  addEdge(vol, hall, wreck);
  addEdge(vol, hall, echo);
  addEdge(vol, hall, store);
  addEdge(vol, store, exit);
}

function layoutFork(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '管廊气闸');
  const spine = addNode(vol, 'chamber', { x: 0, y: 20, z: 4 }, '主廊');
  const fork = addNode(vol, 'fork', { x: 0, y: 42, z: 6 }, '分叉厅');
  const grow = addNode(vol, 'trap', { x: -12, y: 62, z: 7 }, '管壁增生');
  const good = addNode(vol, 'interact', { x: -22, y: 84, z: 8 }, '警戒漆管道', 'ember');
  const bad = addNode(vol, 'decoy', { x: 22, y: 84, z: 14 }, '无漆管道', 'bone');
  const wreck = addNode(vol, 'wreck', { x: -8, y: 64, z: 10 }, '阀箱间');
  const bay = addNode(vol, 'chamber', { x: 14, y: 62, z: 8 }, '侧舱');
  const exit = addNode(vol, 'exit', { x: -22, y: 122, z: 16 }, '输送尽头');
  addEdge(vol, entry, spine);
  addEdge(vol, spine, fork);
  addEdge(vol, fork, grow);
  addEdge(vol, grow, good);
  addEdge(vol, fork, bad);
  addEdge(vol, fork, wreck);
  addEdge(vol, fork, bay);
  addEdge(vol, good, exit);
  const dead = addNode(vol, 'echo', { x: 28, y: 114, z: 22 }, '死路回波');
  addEdge(vol, bad, dead);
  void rng;
}

function layoutGauntlet(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '裂谷口');
  const haz = addNode(vol, 'hazard', { x: 2, y: 44, z: 16 }, '热泉墙');
  const grid = addNode(vol, 'trap', { x: 2, y: 62, z: 17 }, '发射器柱廊');
  const chamber = addNode(vol, 'chamber', { x: -4, y: 82, z: 18 }, '廊中');
  const charge = addNode(vol, 'charge', { x: 24, y: 80, z: 22 }, '地热桩');
  const echo = addNode(vol, 'echo', { x: -26, y: 86, z: 20 }, '贴壁光点');
  const wreck = addNode(vol, 'wreck', { x: 20, y: 96, z: 24 }, '工具箱');
  const exit = addNode(vol, 'exit', { x: 0, y: 128, z: 30 }, '裂谷尽头');
  addEdge(vol, entry, haz);
  addEdge(vol, haz, grid);
  addEdge(vol, grid, chamber);
  addEdge(vol, chamber, charge);
  addEdge(vol, chamber, echo);
  addEdge(vol, charge, wreck);
  addEdge(vol, chamber, exit);
  void rng;
}

function layoutMimic(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '桩区入口');
  const chamber = addNode(vol, 'chamber', { x: 0, y: 40, z: 6 }, '对称场');
  const field = addNode(vol, 'trap', { x: 0, y: 56, z: 6 }, '球体场');
  const left = addNode(vol, 'echo', { x: -20, y: 78, z: 8 }, '左块状回波');
  const right = addNode(vol, 'wreck', { x: 20, y: 78, z: 8 }, '右块状回波');
  const charge = addNode(vol, 'charge', { x: 0, y: 70, z: 18 }, '真充电桩');
  const exit = addNode(vol, 'exit', { x: 0, y: 120, z: 12 }, '桩区出口');
  addEdge(vol, entry, chamber);
  addEdge(vol, chamber, field);
  addEdge(vol, field, left);
  addEdge(vol, field, right);
  addEdge(vol, chamber, charge);
  addEdge(vol, right, exit);
  addEdge(vol, left, exit);
  void rng;
}

function layoutIndustrial(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '井廊口');
  const fan = addNode(vol, 'hazard', { x: 0, y: 42, z: 8 }, '散热扇');
  const crush = addNode(vol, 'trap', { x: 2, y: 60, z: 9 }, '液压闸');
  const hatch = addNode(vol, 'interact', { x: 4, y: 78, z: 10 }, '锁死的门');
  const wreck = addNode(vol, 'wreck', { x: 18, y: 76, z: 12 }, '门旁支架');
  const shaft = addNode(vol, 'chamber', { x: 0, y: 88, z: 48 }, '竖井');
  const exit = addNode(vol, 'exit', { x: -6, y: 126, z: 52 }, '工业层出口');
  addEdge(vol, entry, fan);
  addEdge(vol, fan, crush);
  addEdge(vol, crush, hatch);
  addEdge(vol, hatch, wreck);
  addEdge(vol, hatch, shaft);
  addEdge(vol, shaft, exit);
  void rng;
}

function layoutStalk(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 0 }, '井壁起点');
  const chamber = addNode(vol, 'chamber', { x: 6, y: 50, z: 10 }, '平整井壁');
  const echo = addNode(vol, 'echo', { x: 28, y: 52, z: 10 }, '伴行回波');
  const haz = addNode(vol, 'hazard', { x: 0, y: 90, z: 14 }, '空洞穴');
  const exit = addNode(vol, 'exit', { x: -4, y: 130, z: 16 }, '井壁尽头');
  addEdge(vol, entry, chamber);
  addEdge(vol, chamber, echo);
  addEdge(vol, chamber, haz);
  addEdge(vol, haz, exit);
  void rng;
}

function layoutWell(vol: Volume, rng: Rng): void {
  const entry = addNode(vol, 'entry', { x: 0, y: 0, z: 40 }, '井口外');
  const barge = addNode(vol, 'wreck', { x: 24, y: 18, z: 42 }, '驳船舷侧');
  const lock = addNode(vol, 'interact', { x: 0, y: 36, z: 28 }, '图案锁');
  const membrane = addNode(vol, 'trap', { x: 0, y: 38, z: 10 }, '空走廊');
  const charge = addNode(vol, 'charge', { x: -22, y: 30, z: 36 }, '井口桩');
  const echo = addNode(vol, 'echo', { x: 16, y: 50, z: 20 }, '井内回波');
  const shaft = addNode(vol, 'chamber', { x: 0, y: 40, z: -8 }, '电梯井');
  const exit = addNode(vol, 'exit', { x: 0, y: 42, z: -46 }, '逃生电梯');
  addEdge(vol, entry, barge);
  addEdge(vol, entry, lock);
  addEdge(vol, entry, charge);
  addEdge(vol, lock, echo);
  addEdge(vol, lock, membrane);
  addEdge(vol, membrane, shaft);
  addEdge(vol, shaft, exit);
  void rng;
}

const LAYOUTS: Record<string, (vol: Volume, rng: Rng) => void> = {
  scatter: layoutScatter,
  fork: layoutFork,
  gauntlet: layoutGauntlet,
  mimic: layoutMimic,
  industrial: layoutIndustrial,
  stalk: layoutStalk,
  well: layoutWell,
};

function decorate(vol: Volume, rng: Rng, san: number): void {
  const recipe = actAt(vol.act);
  spawnInto(vol, rng, san);
  const hazNode = vol.nodes.find((n) => n.role === 'hazard');
  if (recipe.hazard && hazNode) placeTrap(vol, hazNode, recipe.hazard, rng);
  const trapNode = vol.nodes.find((n) => n.role === 'trap');
  if (recipe.trap && trapNode) placeTrap(vol, trapNode, recipe.trap, rng);
  const lockNode = vol.nodes.find((n) => n.role === 'interact');
  if (recipe.lock && lockNode) placeLock(vol, lockNode, recipe.lock, rng);
  placeCaches(vol, rng, san, rulesFor(recipe.story));
}

function headingOffset(from: Vec3, headingDeg: number, dist: number, z = from.z): Vec3 {
  const rad = (headingDeg * Math.PI) / 180;
  return {
    x: from.x + Math.sin(rad) * dist,
    y: from.y + Math.cos(rad) * dist,
    z,
  };
}

function mirrorPair(a: VolumeNode, b: VolumeNode, axis: 'x'): void {
  const mid = (a.pos[axis] + b.pos[axis]) / 2;
  const span = Math.abs(a.pos[axis] - b.pos[axis]) / 2 || 20;
  a.pos = { x: a.pos.x, y: (a.pos.y + b.pos.y) / 2, z: (a.pos.z + b.pos.z) / 2 };
  b.pos = { ...a.pos };
  if (axis === 'x') {
    a.pos.x = mid - span;
    b.pos.x = mid + span;
  }
}

/**
 * 布局抽完之后，按剧情职能收一刀。
 * 不改节点角色（装饰器还要找 echo / interact），只改位置、漆、编号、多余货箱。
 */
function applyStoryShape(vol: Volume, rng: Rng, prior: GenMemory | null): void {
  const recipe = actAt(vol.act);
  const rules = rulesFor(recipe.story);
  const entry = entryNode(vol);
  vol.stencil = prior?.stencil ?? vol.stencil;
  vol.memory = {
    headings: [...(prior?.headings ?? []), recipe.leg.advisedHeading],
    stripes: [...(prior?.stripes ?? [])],
    stencil: vol.stencil,
    lastExitHeading: recipe.leg.safeHeading,
  };

  if (rules.mirrorFork) {
    const good = vol.nodes.find((n) => n.role === 'interact');
    const bad = vol.nodes.find((n) => n.role === 'decoy');
    if (good && bad) {
      mirrorPair(good, bad, 'x');
      good.pos.y = bad.pos.y;
      good.pos.z = bad.pos.z;
      good.stripe = 'ember';
      bad.stripe = 'bone';
    }
  }

  if (rules.mirrorBlocks) {
    const echo = vol.nodes.find((n) => n.role === 'echo');
    const wreck = vol.nodes.find((n) => n.role === 'wreck');
    if (echo && wreck) {
      mirrorPair(echo, wreck, 'x');
      echo.pos.y = wreck.pos.y;
      echo.pos.z = wreck.pos.z;
    }
  }

  if (rules.pinEchoToAdvised) {
    const echo = vol.nodes.find((n) => n.role === 'echo');
    if (echo) {
      const dist = Math.max(28, dist3(entry.pos, echo.pos));
      echo.pos = headingOffset(entry.pos, recipe.leg.advisedHeading, dist, echo.pos.z);
    }
    const haz = vol.nodes.find((n) => n.role === 'hazard');
    if (haz) {
      const dist = Math.max(22, dist3(entry.pos, haz.pos) * 0.72);
      haz.pos = headingOffset(entry.pos, recipe.leg.advisedHeading, dist, haz.pos.z);
    }
  }

  if (rules.stencilReuse) {
    for (const n of vol.nodes) {
      if (n.role === 'interact' || n.role === 'wreck' || n.role === 'charge') {
        if (!n.label.includes(vol.stencil)) n.label = `${n.label} · ${vol.stencil}`;
      }
      if (n.stripe !== 'none' && !vol.memory.stripes.includes(n.stripe)) vol.memory.stripes.push(n.stripe);
    }
    const reused = prior?.stripes.find((s) => s === 'ember');
    const wreck = vol.nodes.find((n) => n.role === 'wreck');
    if (reused && wreck && wreck.stripe === 'none') wreck.stripe = reused;
  }

  if (recipe.story === 'still-running') {
    const hatch = vol.nodes.find((n) => n.role === 'interact');
    if (hatch && !vol.nodes.some((n) => n.role === 'decoy')) {
      const locker = addNode(
        vol,
        'decoy',
        { x: hatch.pos.x - rng.float(10, 16), y: hatch.pos.y + 4, z: hatch.pos.z },
        `锁柜 · ${vol.stencil}`,
        'bone',
      );
      addEdge(vol, hatch, locker);
    }
  }

  if (rules.cleanShaft) {
    const shaft = vol.nodes.find((n) => n.label.includes('电梯井') || n.role === 'chamber');
    const exit = exitNode(vol);
    vol.caches = vol.caches.filter((c) => {
      const n = vol.nodes.find((x) => x.id === c.node);
      if (!n) return false;
      if (shaft && dist3(n.pos, shaft.pos) < 18) return false;
      if (dist3(n.pos, exit.pos) < 22) return false;
      return true;
    });
    const keep = new Set(vol.caches.map((c) => c.node));
    vol.nodes = vol.nodes.filter((n) => n.role !== 'cache' || keep.has(n.id));
    vol.edges = vol.edges.filter((e) => vol.nodes.some((n) => n.id === e.from) && vol.nodes.some((n) => n.id === e.to));
  }

  void rng;
}

function attachNear(
  vol: Volume,
  role: NodeRole,
  label: string,
  stripe: StripeId = 'none',
): VolumeNode {
  const host = vol.nodes.find((n) => n.role === 'chamber') ?? entryNode(vol);
  const n = addNode(
    vol,
    role,
    { x: host.pos.x + 12, y: host.pos.y + 10, z: host.pos.z + 3 },
    label,
    stripe,
  );
  addEdge(vol, host, n);
  return n;
}

function pickHookNode(vol: Volume): string {
  const need = rulesFor(vol.story).requireHook;
  const find = (role: NodeRole) => vol.nodes.find((n) => n.role === role);
  switch (need) {
    case 'echo-wreck':
      return find('wreck')?.id ?? find('echo')?.id ?? '';
    case 'paint-fork':
      return find('interact')?.id ?? '';
    case 'period-heading':
      return find('hazard')?.id ?? find('echo')?.id ?? '';
    case 'true-charge':
      return find('charge')?.id ?? '';
    case 'fan-and-cut':
      return find('interact')?.id ?? '';
    case 'watcher-face':
      return find('echo')?.id ?? '';
    case 'glyph-barge':
      return find('wreck')?.id ?? find('interact')?.id ?? '';
  }
}

/**
 * 万斯开口要的那块必须在线上。布局抽漏了就补，不许出现「他要警戒漆但没有漆」。
 */
function ensureHook(vol: Volume, rng: Rng): void {
  const recipe = actAt(vol.act);
  const need: HookNeed = rulesFor(recipe.story).requireHook;
  const find = (role: NodeRole) => vol.nodes.find((n) => n.role === role);

  switch (need) {
    case 'echo-wreck':
      if (!find('wreck')) attachNear(vol, 'wreck', '采矿模块');
      if (!find('echo')) attachNear(vol, 'echo', '移动回波');
      break;
    case 'paint-fork': {
      const good = find('interact') ?? attachNear(vol, 'interact', '警戒漆管道', 'ember');
      const bad = find('decoy') ?? attachNear(vol, 'decoy', '无漆管道', 'bone');
      good.stripe = 'ember';
      bad.stripe = 'bone';
      if (!vol.locks.length) placeLock(vol, good, 'color-valve', rng);
      break;
    }
    case 'period-heading': {
      const haz = find('hazard') ?? attachNear(vol, 'hazard', '热泉墙');
      if (!find('echo')) attachNear(vol, 'echo', '贴壁光点');
      if (recipe.hazard && !vol.hazards.some((h) => h.node === haz.id)) {
        placeTrap(vol, haz, recipe.hazard, rng);
      }
      break;
    }
    case 'true-charge':
      if (!find('charge')) attachNear(vol, 'charge', '真充电桩');
      if (!find('echo')) attachNear(vol, 'echo', '左块状回波');
      if (!find('wreck')) attachNear(vol, 'wreck', '右块状回波');
      break;
    case 'fan-and-cut': {
      const fan = find('hazard') ?? attachNear(vol, 'hazard', '散热扇');
      const hatch = find('interact') ?? attachNear(vol, 'interact', '锁死的门');
      if (recipe.hazard && !vol.hazards.some((h) => h.node === fan.id)) {
        placeTrap(vol, fan, recipe.hazard, rng);
      }
      if (!vol.locks.length) placeLock(vol, hatch, recipe.lock ?? 'weak-cut', rng);
      break;
    }
    case 'watcher-face': {
      const echo = find('echo') ?? attachNear(vol, 'echo', '伴行回波');
      if (!vol.echoes.some((e) => e.kind === 'watcher')) {
        vol.echoes.push({
          node: echo.id,
          kind: 'watcher',
          sonarLabel: '贴行回波',
          candidates: ['它在看你', '一堆死鱼'],
          truth: '它在看你',
          creature: 'cre.hollow',
        });
      }
      break;
    }
    case 'glyph-barge': {
      if (!find('wreck')) attachNear(vol, 'wreck', '驳船舷侧');
      const lockN = find('interact') ?? attachNear(vol, 'interact', '图案锁');
      if (!vol.locks.length) placeLock(vol, lockN, 'glyph', rng);
      break;
    }
  }

  vol.hookNode = pickHookNode(vol);
}

function shiftOnto(vol: Volume, anchor: Vec3): void {
  const entry = entryNode(vol);
  const dx = anchor.x - entry.pos.x;
  const dy = anchor.y - entry.pos.y;
  const dz = anchor.z - entry.pos.z;
  for (const n of vol.nodes) {
    n.pos.x += dx;
    n.pos.y += dy;
    n.pos.z += dz;
  }
}

export function generateVolume(
  act: number,
  seed: number,
  spliceAt: Vec3 | null,
  splicedFrom: string | null,
  san = 100,
  prior: GenMemory | null = null,
): GeneratedAct {
  const recipe = actAt(act);
  const rng = new Xoshiro(mixSanSeed(seed, act, san), `vol.${act}`);
  const vol = emptyVolume(act, splicedFrom, seed);
  vol.san = sanBand(san);
  const layout = LAYOUTS[recipe.layout] ?? layoutScatter;
  layout(vol, rng);
  decorate(vol, rng, san);
  ensureHook(vol, rng);
  applyStoryShape(vol, rng, prior);
  vol.hookNode = pickHookNode(vol);
  furnishVolume(vol, rng);
  if (spliceAt) shiftOnto(vol, spliceAt);
  return { volume: vol, leg: cloneLeg(recipe.leg) };
}

export function authorFirstVolume(seed: number, san = 100): GeneratedAct {
  return generateVolume(0, seed, null, null, san, emptyMemory(seed));
}

/** 把下一关的入口接到本关出口上，共用出口坐标 */
export function spliceVolume(prev: Volume, next: Volume): void {
  const from = exitNode(prev);
  const into = entryNode(next);
  next.splicedFrom = from.id;
  shiftOnto(next, from.pos);
  // 入口不再是一个悬空点：它就是上一关的出口
  into.pos = { ...from.pos };
}

export function interiorFootageClause(vol: Volume, atId: string): string {
  const here = vol.nodes.find((n) => n.id === atId) ?? entryNode(vol);
  const clutter = here.obstacles
    .slice(0, 5)
    .map((o) => o.kind)
    .join(', ');
  const from = here.label || 'an airlock';
  return (
    `The camera is INSIDE one flooded room of an industrial facility, not looking at a wreck on open silt. ` +
    `Viewpoint is the interior of ${from} only: bulkheads, grated deck, pressure-door openings in the walls, ` +
    `${clutter || 'overhead pipe runs and stanchions'}. ` +
    `Do not show the rest of the facility as a map. One room, walls and obstacles readable. ` +
    `Like a Dead Space medical bay interior, not a hive schematic of every chamber. ` +
    `No isolated crashed hull sitting alone on a featureless seabed.`
  );
}

export function identifyVolume(vol: Volume, recordedCreatures?: readonly CreatureId[]): string[] {
  vol.identified = true;
  const lines: string[] = [];
  for (const e of vol.echoes) {
    if (recordedCreatures && (!e.creature || !recordedCreatures.includes(e.creature))) continue;
    lines.push(`${e.sonarLabel}：片子第三秒看清了。是${e.truth}。`);
  }
  for (const f of vol.fauna) {
    if (recordedCreatures && !recordedCreatures.includes(f.creature)) continue;
    if (f.role !== 'background') continue;
    const c = creature(f.creature);
    lines.push(
      `画面边上也有：${c.name}。声呐是「${sonarLabelOf(c)}」，${c.danger === 0 ? '没有牙' : '很小，但是会烂舱'}。`,
    );
  }
  for (const h of vol.hazards) {
    lines.push(identifyTrap(h));
  }
  for (const c of vol.caches) {
    lines.push(identifyCache(c));
    const n = vol.nodes.find((x) => x.id === c.node);
    if (n) {
      n.stripe = c.stripe;
      n.label = c.truth === 'live' ? '活电箱' : c.truth === 'empty' ? '空壳' : '诡雷箱';
    }
  }
  for (const l of vol.locks) {
    const side =
      l.side === 'port' ? '左舷' : l.side === 'starboard' ? '右舷' : l.side === 'dorsal' ? '上方' : '下方';
    if (l.kind === 'color-valve') lines.push(`警戒漆在${side}那一根。另一根不要进。`);
    if (l.kind === 'weak-cut') lines.push(`门锁薄弱点在${side}。切割器只有一次。`);
    if (l.kind === 'glyph') lines.push(`舷侧符号从左到右可读。图案锁认这一组。`);
  }
  if (!lines.length) lines.push('线框上没有活动回波。形状就是形状。');
  return lines;
}

export function shiftVolume(vol: Volume): string[] {
  if (vol.shifted) return ['片子和上一卷一样。外面没有再变。'];
  vol.shifted = true;
  if (vol.echoes.some((e) => e.kind === 'watcher')) {
    return ['同一扇门。鱼全没了。开口上躺着一条够粗的触手。它还保持着距离。然后距离没有了。'];
  }
  return ['同一张几何。细节反了：刚才亮的地方现在是空的。'];
}

/** 把体积投影成近场阴影扇区，供旧 PPI 余辉使用 */
export function volumeShadows(vol: Volume, atId: string, headingDeg: number): { bearing: number; arc: number; near: number; far: number; density: number }[] {
  const at = nodeById(vol, atId);
  const out: { bearing: number; arc: number; near: number; far: number; density: number }[] = [];
  const heading = (headingDeg * Math.PI) / 180;
  let max = 1;
  for (const n of vol.nodes) max = Math.max(max, dist3(at.pos, n.pos));
  for (let i = 0; i < 28; i++) {
    const bearing = (i / 28) * Math.PI * 2 - Math.PI;
    let near = 1;
    let far = 1;
    let density = 0.08;
    for (const n of vol.nodes) {
      if (n.id === atId) continue;
      const hid = vol.hazards.find((h) => h.node === n.id);
      if (sonarHides(hid, vol.identified)) continue;
      const b = bearingTo(at.pos, n.pos);
      let delta = ((b.heading * Math.PI) / 180) - heading - bearing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > 0.28) continue;
      const r = dist3(at.pos, n.pos) / (max * 1.15);
      near = Math.min(near, clamp(r * 0.72, 0.12, 0.9));
      far = Math.min(1, Math.max(far, r));
      density = Math.max(density, n.role === 'echo' ? 0.85 : 0.45);
    }
    out.push({
      bearing,
      arc: (Math.PI * 2) / 28,
      near: clamp01(near),
      far: clamp01(Math.max(near + 0.08, far)),
      density: clamp01(density),
    });
  }
  return out;
}

export const ALL_LAYOUTS = ACTS.map((a) => a.layout);

export { collectMemory, hookFor, type GenMemory, type StoryFn } from './story';
