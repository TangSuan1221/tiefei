/**
 * world/generator.ts — 程序化潜艇生成器
 *
 * 明确不用 BSP。BSP 生成的是"房间"，而一艘潜艇在玩家脑中是**一条脊柱加一堆分支**：
 * 你沿着主通道往里走，两侧挂着机舱、铺位、医务室；偶尔有横向联络门形成环路；
 * 偶尔有一条爬管把两个很远的地方短接起来。所以算法是加权图生长：
 *
 *   1. 铺脊柱          — 每层一条主通道，长度随预算
 *   2. 挂锚点          — 必需舱段按"脊柱位置亲和度"加权放置（食堂靠前、压载靠尾）
 *   3. 长分支          — 按甲板原型权重表生长，宿主选择偏好低度数节点
 *   4. 闭环            — 加横向联络门，直到入口到下行口有 ≥2 条点不交路径
 *   5. 注入            — 淹水区连片、爬行管道短接、秘密舱
 *   6. 竖向连接        — 每层 ≥2 条通往下一层的通道，主通道必为 critical + 稳定
 *   7. 约束放置钥匙    — 钥匙一定放在"不需要这把钥匙就能到"的房间里
 *   8. 放置 setpiece   — 一律挂在 optional/secret 门上，永不进关键路径
 *   9. 验证 → 不合格重生成 → 仍不合格则兜底修复
 *
 * 第 7 步是"约束求解"的落点，也是这套生成器不会产出经典死锁
 * （钥匙锁在自己开的门后面）的原因。
 */

import type { ID, LockSpec, Rng, RoomArchetype, Seed, Vec2, WorldGenConfig } from '../core/contract';
import { Xoshiro, fbm2, hash2 } from '../core/rng';
import { clamp, clamp01 } from '../core/util';
import { DECKS, SPINE_AFFINITY, deckSpec } from './decks';
import {
  Occupancy,
  createRoom,
  degree,
  link,
  makeCounters,
  emptyGraph,
  roomsOfDeck,
  shortestPath,
  vertexDisjointPaths,
  canWalk,
} from './graph';
import type { Counters } from './graph';
import { instantiateProp, unconditionalSourcesOf } from './props';
import {
  ambientFor,
  decorateRoomName,
  floodRateFor,
  materializeProps,
  noiseThresholdFor,
  pickVariant,
  roomIdFor,
  roomVariant,
} from './rooms';
import { SETPIECES, setpiece } from './setpieces';
import { gradeLevel, repairForSolvability, roomsReachableWithoutKey, solve } from './solver';
import type { SolveReport, WorldDoor, WorldGraph, WorldRoom } from './types';

// ============================================================================
// 配置
// ============================================================================

export const DEFAULT_WORLD_CONFIG: WorldGenConfig = {
  decks: 5,
  roomsPerDeck: [11, 17],
  floodLevel: 0.4,
  instability: 0.35,
  phantomRate: 0,
  requiredArchetypes: ['bunks', 'galley', 'medbay', 'engine', 'reactor', 'ballast', 'bridge', 'sonar-room', 'archive', 'chapel', 'reliquary', 'moonpool', 'airlock'],
};

/**
 * 安全加权挑选。`Rng.weighted` 在空数组上会崩，而生成器里有一堆
 * "过滤后可能为空"的候选集（比如某层只剩一个房间时找不到配对对象）。
 * 一次崩溃就意味着整局生成失败，所以这里统一兜住。
 */
function pickW<T>(rng: Rng, entries: [T, number][]): T | null {
  if (!entries.length) return null;
  return rng.weighted(entries);
}

/** 每层通往下一层的主通道锁。这条链是"一定能通关"的那条链 */
interface DescentPlan {
  deck: number;
  primaryLock: LockSpec;
  secondaryLocks: LockSpec[];
}

const DESCENT_PLAN: readonly DescentPlan[] = [
  {
    deck: 1,
    primaryLock: {
      kind: 'valve',
      requires: 'sys.valve.trunk-a',
      hint: '主竖井要先配水才能下。A 路阀在这一层的某个机械空间里。',
    },
    secondaryLocks: [
      { kind: 'key', requires: 'item.key.crew-brass', hint: '船员的黄铜钥匙，多数人把它留在了口袋里。' },
    ],
  },
  {
    deck: 2,
    primaryLock: {
      kind: 'power',
      requires: 'sys.power.command',
      hint: '指挥总线没有电，闸在断位，挂着一张停电检修牌。',
    },
    secondaryLocks: [{ kind: 'valve', requires: 'sys.valve.bilge-c', hint: '舱底排水阀 C。转开它，下一层的水会少一点。' }],
  },
  {
    deck: 3,
    primaryLock: {
      kind: 'code',
      requires: 'know.world.code.sanctum',
      hint: '圣所门禁是一串数字，中间有一个字符不是数字。它在礼仪索引的附录里。',
    },
    secondaryLocks: [{ kind: 'knowledge', requires: 'know.world.truth.choir', hint: '铜版上有六个人。认出第七个是谁。' }],
  },
  {
    deck: 4,
    primaryLock: {
      kind: 'ritual',
      requires: 'ritual.threshold',
      hint: '门限石。仪轨只有四行，做完它才算被允许往下。',
    },
    secondaryLocks: [{ kind: 'key', requires: 'item.key.moonpool-wrench', hint: '一把大号管钳。它在某个巢里，按音高排在最中间。' }],
  },
];

/** D5 内部通往月池的最后一道关键锁 */
const FINAL_LOCK: LockSpec = {
  kind: 'valve',
  requires: 'sys.valve.moonpool-drain',
  hint: '月池泄压阀。开它之前，外侧压力表的读数是零 —— 而零在这个深度是不可能的。',
};

// ============================================================================
// 生成入口
// ============================================================================

export interface GenerateResult {
  graph: WorldGraph;
  report: SolveReport;
  counters: Counters;
  /** 第一次尝试就合格？统计用 */
  firstTryOk: boolean;
  repairActions: string[];
}

const MAX_ATTEMPTS = 12;

export function generateWorld(seed: Seed, cfg: WorldGenConfig = DEFAULT_WORLD_CONFIG): GenerateResult {
  const root = new Xoshiro(seed, 'world');
  let best: { graph: WorldGraph; report: SolveReport; counters: Counters; score: number } | null = null;
  let firstTryOk = false;
  /** 每次被闸门拒绝的原因，最后写进选中那张图的 log —— 调参时要看的就是它 */
  const rejects: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = root.fork(`gen/${attempt}`);
    const counters = makeCounters();
    const graph = buildTopology(rng, cfg, seed + attempt, counters);
    placeKeys(graph, rng.fork('keys'), counters);
    placeSetpieces(graph, rng.fork('setpieces'), counters);
    applyInstability(graph, rng.fork('unstable'), cfg.instability);
    graph.attempts = attempt + 1;

    const report = solve(graph, { pessimistic: true });
    const grade = gradeLevel(graph, report);
    if (grade.ok) {
      if (attempt === 0) firstTryOk = true;
      for (const r of rejects) graph.log.push(r);
      graph.log.push(`生成合格于第 ${attempt + 1} 次尝试`);
      return { graph, report, counters, firstTryOk, repairActions: [] };
    }
    rejects.push(`第 ${attempt + 1} 次尝试未过闸: ${grade.reasons.join('; ')}`);

    // 记录最好的一张，万一 12 次都不合格就修它
    const score =
      (report.solvable ? 1000 : 0) +
      report.deckReached * 40 +
      Math.min(report.criticalPathLength, 60) +
      grade.minDisjoint * 25 +
      report.optionalRatio * 30;
    if (!best || score > best.score) best = { graph, report, counters, score };
  }

  // 兜底：修复最好的那一张。这一步保证可通关率是 100%，而不是 99.9%
  const chosen = best as { graph: WorldGraph; report: SolveReport; counters: Counters; score: number };
  for (const r of rejects) chosen.graph.log.push(r);
  const repair = repairForSolvability(chosen.graph);
  chosen.graph.repaired = repair.repaired;
  if (repair.actions.length) chosen.graph.log.push(`兜底修复: ${repair.actions.join(' | ')}`);
  const report = solve(chosen.graph, { pessimistic: true });
  return { graph: chosen.graph, report, counters: chosen.counters, firstTryOk, repairActions: repair.actions };
}

// ============================================================================
// 1–6. 拓扑构造
// ============================================================================

function buildTopology(rng: Rng, cfg: WorldGenConfig, seed: number, counters: Counters): WorldGraph {
  const deckCount = clamp(Math.round(cfg.decks), 1, DECKS.length);
  const graph = emptyGraph(seed, deckCount);
  const usedVariants = new Set<string>();
  let roomIndex = 0;
  const serial = () => counters.prop++;

  for (let deck = 1; deck <= deckCount; deck++) {
    const spec = deckSpec(deck);
    const drng = rng.fork(`deck${deck}`);
    const occ = new Occupancy();
    const budget = drng.int(cfg.roomsPerDeck[0], cfg.roomsPerDeck[1]);
    const deckRooms: WorldRoom[] = [];

    const make = (archetype: RoomArchetype, pos: Vec2, tagExtra: string[] = []): WorldRoom => {
      const variant = pickVariant(drng, deck, archetype, usedVariants);
      usedVariants.add(variant.id);
      const idx = ++roomIndex;
      const ambient = ambientFor(variant, deck, pos, seed, cfg.floodLevel);
      const room = createRoom({
        id: roomIdFor(deck, idx),
        archetype: variant.archetype,
        name: decorateRoomName(variant, deck, idx),
        variantId: variant.id,
        deck,
        pos,
        ambient,
        noiseThreshold: noiseThresholdFor(variant, deck, drng),
        floodRate: floodRateFor(variant, deck, ambient.flooding),
        props: materializeProps(variant, drng, serial),
        tags: [...(variant.tags ?? []), ...tagExtra],
        echoFingerprint: hash2(idx * 31, deck * 17, seed),
        onEnterNode: variant.onEnterNode,
      });
      occ.take(pos.x, pos.y);
      graph.rooms.set(room.id, room);
      deckRooms.push(room);
      return room;
    };

    // ---- 1. 脊柱
    const spineLen = clamp(Math.round(budget * 0.42), 3, 9);
    const spine: WorldRoom[] = [];
    for (let i = 0; i < spineLen; i++) {
      const arch = drng.weighted(spec.spineArchetypes.map(([a, w]) => [a, w] as [RoomArchetype, number]));
      const pos = { x: 2 + i * 2, y: 8 };
      const room = make(arch, pos, ['spine']);
      if (i > 0) {
        link(graph, counters, spine[i - 1], room, {
          role: 'critical',
          state: drng.bool(0.18) ? 'jammed' : 'closed',
          audioHint: doorHint(drng, room),
        });
      }
      spine.push(room);
    }
    graph.deckEntry.set(deck, spine[0].id);

    // ---- 2. 锚点：按亲和度选宿主脊柱节点
    const anchors: WorldRoom[] = [];
    for (const arch of spec.anchors) {
      const affinity = SPINE_AFFINITY[arch] ?? 0.5;
      const host = drng.weighted(
        spine.map((r, i) => {
          const t = spineLen === 1 ? 0.5 : i / (spineLen - 1);
          // 高斯亲和 + fbm 有机扰动：同一原型在不同种子会落在不同位置
          const g = Math.exp(-((t - affinity) ** 2) / 0.09);
          const organic = 0.55 + fbm2(i * 1.7, deck * 3.1 + affinity * 9, 2, seed) * 0.9;
          return [r, Math.max(0.05, g * organic * (1 / (1 + degree(r) * 0.25)))] as [WorldRoom, number];
        }),
      );
      const pos = occ.nearest(host.pos, drng);
      const room = make(arch, pos, ['anchor']);
      link(graph, counters, host, room, {
        role: 'critical',
        state: 'closed',
        audioHint: doorHint(drng, room),
      });
      anchors.push(room);
    }

    // ---- 3. 分支生长
    const weights = spec.weights.filter(([, w]) => w > 0);
    let guard = 0;
    while (deckRooms.length < budget && guard++ < budget * 8) {
      const host = drng.weighted(
        deckRooms.map((r) => {
          const spineBonus = r.tags.includes('spine') ? 2.4 : 1;
          const crowd = 1 / (1 + Math.pow(degree(r), 1.7) * 0.3);
          return [r, spineBonus * crowd] as [WorldRoom, number];
        }),
      );
      const arch = drng.weighted(weights.map(([a, w]) => [a, w] as [RoomArchetype, number]));
      const pos = occ.nearest(host.pos, drng);
      const room = make(arch, pos);
      link(graph, counters, host, room, {
        role: 'optional',
        state: drng.weighted([
          ['closed', 60],
          ['open', 22],
          ['jammed', 12],
          ['sealed', 4],
        ] as [WorldRoom['doors'][number]['state'], number][]),
        audioHint: doorHint(drng, room),
      });
    }

    // ---- 4. 闭环：加横向联络门，直到"入口 → 下行口"有 ≥2 条点不交路径
    closeLoops(graph, counters, drng, deck, deckRooms, spine);

    // ---- 5. 注入
    injectFlooding(graph, drng, deckRooms, cfg.floodLevel, spec.floodBias);
    injectCrawlways(graph, counters, drng, deck, deckRooms, spec.crawlways);
    injectSecrets(graph, counters, drng, deck, deckRooms, spec.secrets);
  }

  // ---- 6. 竖向连接
  ensureRequiredArchetypes(graph, rng.fork('required'), counters, cfg, seed, usedVariants, () => ++roomIndex, serial);
  linkDecks(graph, counters, rng.fork('descent'), deckCount);

  // 起点：D1 的 bunks（玩家在密封舱里醒来）；没有就退回 D1 入口
  const d1 = roomsOfDeck(graph, 1);
  const start = d1.find((r) => r.archetype === 'bunks') ?? graph.rooms.get(graph.deckEntry.get(1) as ID) ?? d1[0];
  graph.startRoomId = start.id;

  // 终点：最深一层的 moonpool
  const deepest = roomsOfDeck(graph, deckCount);
  const exit =
    deepest.find((r) => r.archetype === 'moonpool' && r.tags.includes('exit')) ??
    deepest.find((r) => r.archetype === 'moonpool') ??
    deepest[deepest.length - 1];
  graph.exitRoomId = exit.id;
  exit.tags = [...new Set([...exit.tags, 'exit'])];

  // 起点未必就是 D1 的脊柱头，出口也未必挂在最深一层的脊柱上。
  // 这两段同样要铺成关键路径，否则悲观求解会在"看得见但过不去"的地方停下
  promoteCriticalRoute(graph, counters, graph.startRoomId, graph.deckEntry.get(1) as ID);
  promoteCriticalRoute(graph, counters, graph.deckEntry.get(deckCount), exit.id);

  // 最后一道关键锁放在月池门上，让终局有一个明确的机械动作
  placeFinalLock(graph, exit);

  return graph;
}

/**
 * 兜住 `WorldGenConfig.requiredArchetypes`。
 * 甲板锚点表在默认配置下已经覆盖了全部必需原型，但调用方可以传
 * `decks: 3` 之类的配置，那时 D4/D5 的锚点就不存在了。契约里写了这个字段，
 * 就必须真的保证它 —— 缺哪个原型，就在允许它出现的最深甲板上补一个。
 */
function ensureRequiredArchetypes(
  graph: WorldGraph,
  rng: Rng,
  counters: Counters,
  cfg: WorldGenConfig,
  seed: number,
  usedVariants: Set<string>,
  nextIndex: () => number,
  serial: () => number,
): void {
  const present = new Set<RoomArchetype>();
  for (const r of graph.rooms.values()) present.add(r.archetype);

  for (const arch of cfg.requiredArchetypes) {
    if (present.has(arch)) continue;
    // 从最深的甲板往上找一个"权重表里允许它"的层
    let deck = -1;
    for (let d = graph.decks; d >= 1; d--) {
      const spec = deckSpec(d);
      if (spec.weights.some(([a, w]) => a === arch && w > 0) || spec.anchors.includes(arch)) {
        deck = d;
        break;
      }
    }
    if (deck < 0) deck = graph.decks;

    const hosts = roomsOfDeck(graph, deck);
    if (!hosts.length) continue;
    const host = rng.pick(hosts);
    const variant = pickVariant(rng, deck, arch, usedVariants);
    usedVariants.add(variant.id);
    const idx = nextIndex();
    const pos = { x: host.pos.x + (rng.bool() ? 2 : -2), y: host.pos.y + (rng.bool() ? 2 : -2) };
    const ambient = ambientFor(variant, deck, pos, seed, cfg.floodLevel);
    const room = createRoom({
      id: roomIdFor(deck, idx),
      archetype: variant.archetype,
      name: decorateRoomName(variant, deck, idx),
      variantId: variant.id,
      deck,
      pos,
      ambient,
      noiseThreshold: noiseThresholdFor(variant, deck, rng),
      floodRate: floodRateFor(variant, deck, ambient.flooding),
      props: materializeProps(variant, rng, serial),
      tags: [...(variant.tags ?? []), 'required-fill'],
      echoFingerprint: hash2(idx * 53, deck * 29, seed),
    });
    graph.rooms.set(room.id, room);
    link(graph, counters, host, room, { role: 'optional', state: 'closed', audioHint: doorHint(rng, room) });
    present.add(variant.archetype);
    graph.log.push(`补齐必需原型 ${arch} → ${room.id}`);
  }
}

function doorHint(rng: Rng, to: WorldRoom): string | undefined {
  if (!rng.bool(0.42)) return undefined;
  const pool: string[] = [];
  if (to.ambient.flooding > 0.55) pool.push('门后有水声，水位比你这一侧高。');
  if (to.ambient.flooding > 0.85) pool.push('门缝里在渗水，渗得很稳，说明那边是满的。');
  if (to.ambient.noiseFloor > 0.3) pool.push('门后有机器还在转。');
  if (to.ambient.presence > 0.55) pool.push('门后很安静。安静得像有人在屏着气。');
  if (to.archetype === 'crawlspace') pool.push('门后是很窄的空间，气流从缝里往外吹。');
  if (to.archetype === 'chapel' || to.archetype === 'reliquary') pool.push('门后有人在低声念一段很短的东西，循环。');
  if (to.archetype === 'void') pool.push('贴上去听不见任何东西。连底噪都没有。');
  pool.push('金属的应力声，隔一会儿一次。');
  pool.push('门后有滴水，间隔不规律。');
  return rng.pick(pool);
}

/**
 * 加环。树形拓扑只有一条路，玩家一旦走错就得原路返回，那是最无聊的迷宫。
 * 这一步把"分支末梢"两两接起来，直到点不交路径数达标。
 */
function closeLoops(
  graph: WorldGraph,
  counters: Counters,
  rng: Rng,
  deck: number,
  deckRooms: WorldRoom[],
  spine: WorldRoom[],
): void {
  const target = 2;
  const candidates = () =>
    deckRooms
      .filter((r) => degree(r) <= 2)
      .sort((a, b) => degree(a) - degree(b));

  const spineIds = new Set(spine.map((r) => r.id));
  let added = 0;
  for (let pass = 0; pass < 14; pass++) {
    const sinks = deckRooms.filter((r) => r.tags.includes('descent-host'));
    const entry = graph.deckEntry.get(deck);
    const flow =
      entry && sinks.length
        ? vertexDisjointPaths(graph, [entry], sinks.map((r) => r.id), deck, (d) => canWalk(d) && d.deckDelta === 0)
        : 0;
    // 竖向连接还没建时（sinks 为空），就按"脊柱两端之间的独立路径"当代理指标
    const proxy =
      entry && spine.length > 1
        ? vertexDisjointPaths(graph, [entry], [spine[spine.length - 1].id], deck, (d) => canWalk(d) && d.deckDelta === 0)
        : 0;
    if (Math.max(flow, proxy) >= target && added >= 2) break;

    const pool = candidates();
    if (pool.length < 2) break;
    const a = pool[0];
    // 找一个"不是邻居、且拓扑上离得远"的对象，这样新边才真的造出环
    const b = pickW(
      rng,
      pool
        .filter((r) => r.id !== a.id && !a.doors.some((d) => d.to === r.id))
        .map((r) => {
          const dist = Math.hypot(r.pos.x - a.pos.x, r.pos.y - a.pos.y);
          const bonus = spineIds.has(r.id) ? 1.6 : 1;
          return [r, Math.max(0.2, (14 - Math.abs(dist - 6)) * bonus)] as [WorldRoom, number];
        }),
    );
    if (!b) break;
    link(graph, counters, a, b, {
      role: 'optional',
      state: rng.weighted([
        ['closed', 62],
        ['open', 24],
        ['jammed', 14],
      ] as [WorldRoom['doors'][number]['state'], number][]),
      audioHint: doorHint(rng, b),
    });
    added++;
  }
}

/** 淹水区连片。水不会一个房间一个房间地随机分布，它顺着低处铺开 */
function injectFlooding(
  graph: WorldGraph,
  rng: Rng,
  deckRooms: WorldRoom[],
  floodLevel: number,
  bias: number,
): void {
  const seeds = Math.round(clamp(deckRooms.length * floodLevel * bias * 0.34, 0, 5));
  for (let s = 0; s < seeds; s++) {
    let cur = rng.pick(deckRooms);
    const spread = rng.int(2, 4);
    for (let i = 0; i < spread; i++) {
      cur.ambient.flooding = clamp01(cur.ambient.flooding + rng.float(0.16, 0.34) * (1 - i * 0.18));
      cur.ambient.airQuality = clamp01(cur.ambient.airQuality - 0.06);
      cur.floodRate = Math.max(cur.floodRate, 0.0016 * bias);
      if (cur.ambient.flooding > 0.9) {
        cur.tags = [...new Set([...cur.tags, 'breath-hold'])];
        // 全淹的房间把门冻在"水封"状态，除非它在关键路径上
        for (const d of cur.doors) {
          if (d.role !== 'critical' && rng.bool(0.22)) d.state = 'flooded-shut';
        }
      }
      const next = cur.doors
        .map((d) => graph.rooms.get(d.to))
        .filter((r): r is WorldRoom => !!r && r.deck === cur.deck);
      if (!next.length) break;
      cur = rng.pick(next);
    }
  }
}

/**
 * 爬行管道：噪音最低但 SAN 消耗最高的路径（GDD §6.2）。
 * 它把两个拓扑距离很远的房间短接，所以是真的捷径，而不是装饰。
 */
function injectCrawlways(
  graph: WorldGraph,
  counters: Counters,
  rng: Rng,
  deck: number,
  deckRooms: WorldRoom[],
  range: [number, number],
): void {
  const n = rng.int(range[0], range[1]);
  for (let i = 0; i < n; i++) {
    const far = [...deckRooms].sort(
      (a, b) => Math.hypot(b.pos.x - deckRooms[0].pos.x, b.pos.y) - Math.hypot(a.pos.x - deckRooms[0].pos.x, a.pos.y),
    );
    const a = rng.pick(deckRooms);
    const b = pickW(
      rng,
      far
        .filter((r) => r.id !== a.id && !a.doors.some((d) => d.to === r.id))
        .map((r) => {
          const dist = Math.hypot(r.pos.x - a.pos.x, r.pos.y - a.pos.y);
          return [r, Math.max(0.1, dist - 3)] as [WorldRoom, number];
        }),
    );
    if (!b) continue;
    link(graph, counters, a, b, {
      role: 'shortcut',
      state: 'open',
      crawl: true,
      audioHint: '一个检修口，里面很窄。爬过去几乎不会有声音，但你会在里面待很久。',
    });
    a.tags = [...new Set([...a.tags, 'crawl-access'])];
    b.tags = [...new Set([...b.tags, 'crawl-access'])];
  }
}

/** 秘密舱：挂在 secret 门后，需要"知晓图纸"这条知识 */
function injectSecrets(
  graph: WorldGraph,
  counters: Counters,
  rng: Rng,
  deck: number,
  deckRooms: WorldRoom[],
  range: [number, number],
): void {
  const n = rng.int(range[0], range[1]);
  const pool = deckRooms.filter((r) => !r.tags.includes('anchor'));
  for (let i = 0; i < n && pool.length; i++) {
    const host = rng.pick(pool);
    const target = pickW(
      rng,
      deckRooms
        .filter((r) => r.id !== host.id && (r.archetype === 'void' || r.archetype === 'crawlspace' || r.tags.includes('secret')))
        .map((r) => [r, r.archetype === 'void' ? 3 : 1] as [WorldRoom, number]),
    );
    if (!target) continue;
    if (host.doors.some((d) => d.to === target.id)) continue;
    link(graph, counters, host, target, {
      role: 'secret',
      state: 'closed',
      lock: {
        kind: 'knowledge',
        requires: 'know.world.blueprint.hidden',
        hint: '总图之外还有一叠图纸，标着「非结构」。知道它们存在，才看得见这扇门。',
      },
      audioHint: '这一段舱壁的螺栓比别处少两颗，而且是从这一侧上的。',
    });
    target.onBlueprint = false;
    target.tags = [...new Set([...target.tags, 'secret'])];
  }
}

/**
 * 竖向连接。每层 ≥2 条通往下一层的通道：
 *   - 主通道 role='critical'、unstable=false、锁来自 DESCENT_PLAN
 *   - 备用通道 role='optional'，可以 unstable，用不同种类的锁
 * 主通道是那条"一定走得通"的路，备用通道是给玩家的省时间选项。
 */
function linkDecks(graph: WorldGraph, counters: Counters, rng: Rng, deckCount: number): void {
  for (let deck = 1; deck < deckCount; deck++) {
    const spec = deckSpec(deck);
    const upper = roomsOfDeck(graph, deck);
    const lower = roomsOfDeck(graph, deck + 1);
    if (!upper.length || !lower.length) continue;
    const plan = DESCENT_PLAN.find((p) => p.deck === deck);
    const want = clamp(rng.int(spec.descents[0], spec.descents[1]), 2, 4);

    // 下行口偏好：隔舱、气闸、压载、鱼雷舱 —— 这些舱段现实里就有竖井
    const hostScore = (r: WorldRoom) => {
      let s = 1;
      if (r.archetype === 'bulkhead') s += 4;
      if (r.archetype === 'airlock') s += 3.4;
      if (r.archetype === 'ballast' || r.archetype === 'torpedo') s += 2.6;
      if (r.archetype === 'engine') s += 1.8;
      if (r.tags.includes('spine')) s += 1.4;
      if (r.tags.includes('crawl')) s -= 0.5;
      return s;
    };

    const entryLower = graph.rooms.get(graph.deckEntry.get(deck + 1) as ID) ?? lower[0];
    const chosenHosts: WorldRoom[] = [];
    const descentDoors: ID[] = [];

    for (let k = 0; k < want; k++) {
      const pool = upper.filter((r) => !chosenHosts.includes(r));
      if (!pool.length) break;
      const host = rng.weighted(
        pool.map((r) => {
          // 第二条之后，强烈偏好"离已有下行口远"的房间，这样两条路才真的独立
          const sep = chosenHosts.length
            ? Math.min(...chosenHosts.map((c) => Math.hypot(c.pos.x - r.pos.x, c.pos.y - r.pos.y)))
            : 8;
          return [r, Math.max(0.2, hostScore(r) * (1 + sep * 0.22))] as [WorldRoom, number];
        }),
      );
      chosenHosts.push(host);

      const isPrimary = k === 0;
      const target =
        (isPrimary
          ? entryLower
          : pickW(
              rng,
              lower
                .filter((r) => r.id !== entryLower.id)
                .map(
                  (r) =>
                    [r, r.archetype === 'bulkhead' || r.archetype === 'airlock' ? 3 : 1] as [WorldRoom, number],
                ),
            )) ?? entryLower;

      const lock = isPrimary
        ? plan?.primaryLock
        : plan?.secondaryLocks[(k - 1) % Math.max(1, plan.secondaryLocks.length)];

      const { forward } = link(graph, counters, host, target, {
        role: isPrimary ? 'critical' : 'optional',
        state: 'closed',
        lock,
        unstable: !isPrimary && rng.bool(spec.instabilityBias),
        crawl: !isPrimary && rng.bool(0.22),
        audioHint: isPrimary
          ? '竖井。往下看是黑的，灯照不到底。下面有水的回声。'
          : '一条不在主竖井上的下行通道。窄，而且往下的气流是往上的。',
      });
      host.tags = [...new Set([...host.tags, 'descent-host'])];
      descentDoors.push(forward.id);
      // 主竖井必须"走得到"，否则它是 critical 也没用
      if (isPrimary) promoteCriticalRoute(graph, counters, graph.deckEntry.get(deck), host.id);
    }
    graph.descents.set(deck, descentDoors);
  }
}

/**
 * 把 from→to 之间的一条层内通路提升为 critical。
 *
 * 为什么必须有这一步：悲观求解器只走 `role === 'critical'` 的门（所有可选门都当作锁死）。
 * 而下行口宿主是按"现实里哪种舱段会有竖井"加权挑的，很可能落在一根 optional 分支上 ——
 * 于是竖井本身是 critical，通往竖井的那段路却不是，悲观模式下就够不着。
 * 这里显式地把那段路铺成关键路径，而不是靠重掷种子碰运气。
 * 只走无锁、非秘密的层内门，避免把一把新锁塞进必经之路。
 */
function promoteCriticalRoute(graph: WorldGraph, counters: Counters, fromId: ID | undefined, toId: ID): void {
  if (!fromId || fromId === toId) return;
  const from = graph.rooms.get(fromId);
  const to = graph.rooms.get(toId);
  if (!from || !to) return;

  const deck = to.deck;
  const base = (d: WorldDoor) => canWalk(d) && d.deckDelta === 0 && d.role !== 'secret' && !d.lock;
  // 优先不经过爬管：关键路径应该是"能正常走过去"的那条，爬管是玩家主动选的风险捷径
  const path =
    shortestPath(graph, fromId, toId, (d, a, b) => base(d) && !d.crawl && a.deck === deck && b.deck === deck) ??
    shortestPath(graph, fromId, toId, (d, a, b) => base(d) && a.deck === deck && b.deck === deck);

  if (!path) {
    // 连一条无锁通路都没有：直接补一扇关键门。宁可多一扇门，也不要一张卡死的图
    link(graph, counters, from, to, {
      role: 'critical',
      state: 'closed',
      audioHint: '一段临时焊上去的连络通道，焊缝还是新的。',
    });
    graph.log.push(`补关键连络门 ${fromId} → ${toId}`);
    return;
  }

  for (let i = 0; i + 1 < path.length; i++) {
    const a = graph.rooms.get(path[i]) as WorldRoom;
    const b = path[i + 1];
    for (const d of a.doors) {
      if (d.to !== b || d.lock) continue;
      d.role = 'critical';
      d.unstable = false;
      if (d.twin) {
        const back = graph.rooms.get(b)?.doors.find((x) => x.id === d.twin);
        if (back) {
          back.role = 'critical';
          back.unstable = false;
        }
      }
      break;
    }
  }
}

function placeFinalLock(graph: WorldGraph, exit: WorldRoom): void {
  for (const room of graph.rooms.values()) {
    if (room.deck !== exit.deck) continue;
    for (const d of room.doors) {
      if (d.to !== exit.id) continue;
      if (d.role === 'critical' && !d.lock) {
        d.lock = FINAL_LOCK;
        d.unstable = false;
        return;
      }
    }
  }
  // 月池没有 critical 入边：把任意一条入边升级成关键门并上最后一把锁
  for (const room of graph.rooms.values()) {
    for (const d of room.doors) {
      if (d.to === exit.id) {
        d.role = 'critical';
        d.unstable = false;
        d.state = 'closed';
        d.lock = FINAL_LOCK;
        return;
      }
    }
  }
}

// ============================================================================
// 7. 约束放置钥匙
// ============================================================================

/**
 * 钥匙放置 = 约束求解。
 *
 * 对每一把关键锁所需的钥匙：
 *   1. 找出"不需要这把钥匙就能到达"的房间集合（solver.roomsReachableWithoutKey）
 *   2. 在其中挑一个 archetype 合适的房间（prop 定义的 fits 字段）
 *   3. 把对应的 key-source prop 实例塞进去
 * 因为放置位置是从"无此钥匙的可达集"里挑的，所以
 * **钥匙永远不可能被锁在它自己开的门后面**。这是按构造正确，不是靠重试。
 */
function placeKeys(graph: WorldGraph, rng: Rng, counters: Counters): void {
  const needed = collectRequiredKeys(graph);

  for (const key of needed) {
    const sources = unconditionalSourcesOf(key);
    if (!sources.length) {
      graph.log.push(`警告: 钥匙 ${key} 没有任何无条件产出源`);
      continue;
    }
    const allowed = roomsReachableWithoutKey(graph, key, graph.startRoomId);

    // 关键的判断不是"这把钥匙在图上有没有"，而是"在**够得着的地方**有没有"。
    // 随机房间内容本来就可能刷出同一个产出源，但如果它落在一扇需要这把钥匙
    // 才能打开的门后面，那它等于不存在 —— 这正是经典死锁的样子。
    if (keyObtainableWithin(graph, key, allowed)) continue;

    const candidates: { room: WorldRoom; def: (typeof sources)[number]; score: number }[] = [];
    for (const id of allowed) {
      const room = graph.rooms.get(id);
      if (!room || room.veracity !== 'real') continue;
      for (const def of sources) {
        const fits = def.fits ?? [];
        const match = fits.includes(room.archetype);
        // 允许非精确匹配但降权 —— 宁可放在一个略微违和的房间，也不要卡关
        const score = (match ? 8 : 0.6) * (1 + room.deck * 0.15) * (room.tags.includes('anchor') ? 1.5 : 1);
        candidates.push({ room, def, score });
      }
    }
    if (!candidates.length) {
      graph.log.push(`警告: 钥匙 ${key} 找不到合法放置点`);
      continue;
    }
    const chosen = rng.weighted(candidates.map((c) => [c, c.score] as [(typeof candidates)[number], number]));
    chosen.room.props = [...chosen.room.props, instantiateProp(chosen.def.id, counters.prop++)];
    chosen.room.tags = [...new Set([...chosen.room.tags, 'key-site'])];
    graph.log.push(`钥匙 ${key} → ${chosen.room.id} (${chosen.def.id})`);
  }
}

function collectRequiredKeys(graph: WorldGraph): string[] {
  const out = new Set<string>();
  // 先关键门，再其他门 —— 关键门的钥匙优先占据好位置
  for (const room of graph.rooms.values()) {
    for (const d of room.doors) if (d.role === 'critical' && d.lock) out.add(d.lock.requires);
  }
  for (const room of graph.rooms.values()) {
    for (const d of room.doors) if (d.role !== 'critical' && d.lock) out.add(d.lock.requires);
  }
  return [...out];
}

function keyObtainableWithin(graph: WorldGraph, key: string, where: Set<ID>): boolean {
  for (const id of where) {
    const room = graph.rooms.get(id);
    if (!room || room.veracity === 'phantom') continue;
    for (const prop of room.props) {
      for (const spec of prop.interactions) {
        if (spec.requires) continue;
        for (const e of spec.effects ?? []) {
          if (e.op === 'flag' && e.key === key && e.value === true) return true;
          if (e.op === 'item' && e.item === key && e.count > 0) return true;
          if (e.op === 'knowledge' && e.node === key) return true;
          if (e.op === 'flag-add' && e.key === key && e.delta > 0) return true;
        }
      }
    }
  }
  return false;
}

// ============================================================================
// 8. Setpiece 放置
// ============================================================================

function placeSetpieces(graph: WorldGraph, rng: Rng, counters: Counters): void {
  const order = [
    ...SETPIECES.filter((s) => s.guaranteed),
    ...rng.shuffle(SETPIECES.filter((s) => !s.guaranteed).slice()),
  ];
  const optionalBudget = rng.int(2, 4);
  let optionalPlaced = 0;
  let serialBase = 70000;

  for (const sp of order) {
    if (!sp.guaranteed && optionalPlaced >= optionalBudget) continue;
    const decks = sp.decks.filter((d) => d <= graph.decks);
    if (!decks.length) continue;
    const deck = rng.pick(decks);
    if (sp.canPlace && !sp.canPlace(graph, deck)) continue;

    const host = pickSetpieceHost(graph, rng, deck);
    if (!host) continue;

    const variant = roomVariant(sp.variantId);
    const idx = graph.rooms.size + 1;
    const pos = { x: host.pos.x + rng.int(-1, 1), y: host.pos.y + (rng.bool() ? -3 : 3) };
    const ambient = ambientFor(variant, deck, pos, graph.seed, 0.5);
    const room = createRoom({
      id: `sp${deck}-${sp.id}`,
      archetype: variant.archetype,
      name: decorateRoomName(variant, deck, idx),
      variantId: variant.id,
      deck,
      pos,
      ambient,
      noiseThreshold: variant.noiseThreshold ?? 48,
      floodRate: variant.floodRate ?? 0,
      props: materializeProps(variant, rng, () => serialBase++),
      tags: [...(variant.tags ?? []), 'setpiece'],
      echoFingerprint: hash2(idx * 131, deck * 7, graph.seed),
      setpiece: sp.id,
    });
    graph.rooms.set(room.id, room);

    // 一律用 optional / secret 门挂接：惊喜永远不会变成卡关
    link(graph, counters, host, room, {
      role: sp.attachAs,
      state: sp.attachAs === 'secret' ? 'closed' : rng.bool(0.3) ? 'open' : 'closed',
      lock:
        sp.attachAs === 'secret'
          ? {
              kind: 'knowledge',
              requires: 'know.world.blueprint.hidden',
              hint: '这扇门不在图纸上。你得先知道有一批不在图纸上的舱段。',
            }
          : undefined,
      unstable: false,
      audioHint: setpieceHint(sp.id),
    });

    if (sp.build) sp.build({ graph, room, rng, counters });
    graph.setpieces.push(sp.id);
    if (!sp.guaranteed) optionalPlaced++;
  }
}

function pickSetpieceHost(graph: WorldGraph, rng: Rng, deck: number): WorldRoom | null {
  const pool = roomsOfDeck(graph, deck).filter((r) => !r.setpiece && r.veracity === 'real' && !r.tags.includes('exit'));
  if (!pool.length) return null;
  return rng.weighted(
    pool.map((r) => {
      // 偏好非咽喉、非锚点的普通房间，setpiece 才有"拐进去发现的"感觉
      const s = (r.tags.includes('anchor') ? 0.5 : 1.6) * (1 / (1 + degree(r) * 0.2));
      return [r, Math.max(0.1, s)] as [WorldRoom, number];
    }),
  );
}

function setpieceHint(id: string): string | undefined {
  switch (id) {
    case 'mirror-cell':
      return '门后的回声和你刚才那个房间的回声一模一样，一模一样到不可能。';
    case 'mobius-passage':
      return '门后是一条直的走廊。你听见走廊尽头也有一扇门被推开的声音。';
    case 'room-zero':
      return '这里没有门。你手上的图纸说这里是实心的。';
    case 'drowned-chapel':
      return '门缝里在渗水，而且门后有人在唱。水传声比空气好得多。';
    case 'own-quarters':
      return '门后有人在呼吸，间隔和你一样长。';
    case 'inverted-ballast':
      return '门后有水声，但水声是从上方传来的。';
    case 'pressure-confessional':
      return '门是密封的。气流从门缝往里走，不往外。';
    case 'tally-corridor':
      return '门后有凿子敲石头的声音，很轻，一下，然后停很久。';
    case 'echo-chamber':
      return '你对这扇门说了一个字，它把整句话还给了你。';
    default:
      return undefined;
  }
}

// ============================================================================
// 不稳定门标记
// ============================================================================

/**
 * 标记哪些门参与重织（GDD §6.3：只有 unstable 门会重连）。
 * 规则：关键门永不 unstable。这是"重织不会困死玩家"的第一道保险，
 * 第二道是 reweave.ts 里的连通性验证。
 */
function applyInstability(graph: WorldGraph, rng: Rng, instability: number): void {
  for (const room of graph.rooms.values()) {
    const spec = deckSpec(room.deck);
    const p = clamp01(spec.instabilityBias * (0.4 + instability * 1.6));
    for (const d of room.doors) {
      if (d.role === 'critical') {
        d.unstable = false;
        continue;
      }
      if (d.role === 'secret' && rng.bool(0.6)) continue;
      if (rng.bool(p)) {
        d.unstable = true;
        room.veracity = room.veracity === 'phantom' ? 'phantom' : 'unstable';
      }
    }
  }
}

// ============================================================================
// 幻觉房间（由 SAN 动态驱动，生成期只按 cfg.phantomRate 预置）
// ============================================================================

/**
 * 生成一个幻觉房间并挂到 host 上。
 * 它的 echoFingerprint 每次被扫都会抖动 —— 这就是 §5 要求的
 * 「两次脉冲的回波延迟不一致」那条可观察破绽。
 */
export function spawnPhantomRoom(
  graph: WorldGraph,
  counters: Counters,
  rng: Rng,
  host: WorldRoom,
): WorldRoom {
  const usedVariants = new Set<string>();
  const variant = pickVariant(rng, host.deck, rng.bool(0.5) ? 'void' : host.archetype, usedVariants);
  const pos = { x: host.pos.x + rng.int(-2, 2), y: host.pos.y + rng.int(-2, 2) };
  const ambient = ambientFor(variant, host.deck, pos, graph.seed ^ 0x5f3d, 0.5);
  const room = createRoom({
    id: `ph${host.deck}-${counters.door}-${counters.prop}`,
    archetype: variant.archetype,
    name: decorateRoomName(variant, host.deck, graph.rooms.size + 1),
    variantId: variant.id,
    deck: host.deck,
    pos,
    ambient,
    noiseThreshold: 999,
    floodRate: 0,
    props: [],
    tags: ['phantom'],
    echoFingerprint: rng.next(),
    veracity: 'phantom',
    onBlueprint: false,
  });
  graph.rooms.set(room.id, room);
  link(graph, counters, host, room, {
    role: 'optional',
    state: 'closed',
    unstable: true,
    audioHint: '门后什么声音都没有。连底噪都没有，像一段被剪掉的磁带。',
  });
  return room;
}
