import type { Rng } from '@/core/contract';
import type { TrialTrace } from '../variants';
import { clamp, clamp01 } from '@/core/util';

/**
 * 盲测用的精简玩法模型 —— 一台对照实验台。
 *
 * 两个变体跑在完全相同的世界、威胁与资源曲线上，唯一差异是被测机制本身。
 * 被测变体不得改动这里的任何逻辑，否则结论不可比。
 *
 * 一个关键的结构决定：**一回合只做一个动作**。
 * 感知与移动竞争同一份氧气，这才是 GDD §P2"氧气即时间即货币"的真实形态；
 * 如果允许每回合先扫描再移动，感知就变成免费的，整个取舍就消失了。
 */

export interface SimWorld {
  size: number;
  adj: number[][];
  exit: number;
  /** 每个房间的真实危险度 0..1 */
  danger: number[];
  /** 每个房间藏着的氧气量（呼吸数）。有了它，劣势才可能被翻盘 */
  oxygenCache: number[];
  /** 到出口的真实跳数，用于评估玩家决策质量（玩家本人看不到） */
  distToExit: number[];
}

export function buildWorld(rng: Rng, size = 40): SimWorld {
  const adj: number[][] = Array.from({ length: size }, () => []);
  // 脊柱保证连通，弦制造回路 —— 接近真实关卡拓扑
  for (let i = 1; i < size; i++) {
    const parent = rng.int(Math.max(0, i - 4), i - 1);
    adj[i].push(parent);
    adj[parent].push(i);
  }
  for (let i = 0; i < Math.floor(size * 0.3); i++) {
    const a = rng.int(0, size - 1);
    const b = rng.int(0, size - 1);
    if (a !== b && !adj[a].includes(b)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }
  const exit = size - 1;
  const danger = Array.from({ length: size }, (_, i) =>
    i === 0 ? 0 : clamp01(rng.float(0, 0.75) * (0.35 + (i / size) * 0.9)),
  );
  // 氧气与危险正相关：值钱的东西放在要命的地方，否则搜刮就没有决策可言
  const oxygenCache = Array.from({ length: size }, (_, i) =>
    i === 0 || !rng.bool(0.34) ? 0 : Math.round(40 + danger[i] * 190 * rng.float(0.6, 1.4)),
  );
  return { size, adj, exit, danger, oxygenCache, distToExit: bfsDistances(adj, exit) };
}

function bfsDistances(adj: number[][], from: number): number[] {
  const d = Array(adj.length).fill(Infinity);
  d[from] = 0;
  const q = [from];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    for (const n of adj[cur]) {
      if (d[n] === Infinity) {
        d[n] = d[cur] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

export interface SimPlayer {
  at: number;
  oxygen: number;
  oxygenMax: number;
  fear: number;
  /** 对每个房间危险度的信念，-1 = 从未感知过 */
  belief: number[];
  /** 已确认出口位置 */
  knowsExit: boolean;
  noise: number;
  /** 追击者位置，-1 = 尚未被召唤 */
  hunter: number;
  /** 追击者对玩家位置的置信度 0..1 */
  hunterAwareness: number;
}

export function newPlayer(world: SimWorld): SimPlayer {
  return {
    at: 0,
    oxygen: 900,
    oxygenMax: 900,
    fear: 0,
    belief: Array(world.size).fill(-1),
    knowsExit: false,
    noise: 0,
    hunter: -1,
    hunterAwareness: 0,
  };
}

export interface SenseOption {
  id: string;
  breaths: number;
  noise: number;
  radius: number;
  fidelity: number;
}

/** 被测机制：它只决定"玩家如何获得信息"，其余一切共享 */
export interface SensingMechanic {
  options(p: SimPlayer, w: SimWorld): SenseOption[];
  apply(opt: SenseOption, p: SimPlayer, w: SimWorld, rng: Rng): void;
  /** 该感知行动在当前局面下的主观效用，与移动行动的效用在同一标尺上竞争 */
  utility(opt: SenseOption, ctx: DecisionContext): number;
}

export interface DecisionContext {
  p: SimPlayer;
  w: SimWorld;
  skill: number;
  rng: Rng;
  /** 三跳内未知房间数 */
  unknownNearby: number;
  /** 氧气余量比例 */
  oxyFrac: number;
  hunterNear: boolean;
}

const MOVE_BREATHS = 2;
const REST_BREATHS = 10;

export function runTrial(
  world: SimWorld,
  mech: SensingMechanic,
  rng: Rng,
  skill: number,
): TrialTrace {
  const p = newPlayer(world);
  const trace: TrialTrace = {
    decisions: [],
    tension: [],
    surprises: [],
    survived: false,
    duration: 0,
    cause: '',
    hadIdentifiableMistake: false,
    recovered: false,
    wasBehind: false,
  };

  let elapsed = 0;
  let lastMistakeAt = -999;
  let everBehind = false;
  let turns = 0;

  while (p.oxygen > 0 && turns < 400) {
    turns++;
    const ctx: DecisionContext = {
      p,
      w: world,
      skill,
      rng,
      unknownNearby: countUnknownWithin(p, world, 3),
      oxyFrac: p.oxygen / p.oxygenMax,
      hunterNear: p.hunter >= 0 && hops(world, p.hunter, p.at) <= 2,
    };

    // ---- 构造本回合的全部选项：感知与移动争夺同一份氧气 ----
    const senseOpts = mech.options(p, world);
    const neighbors = world.adj[p.at];
    const totalOptions = senseOpts.length + neighbors.length + 1;

    let bestKind: 'sense' | 'move' | 'rest' = 'rest';
    let bestUtil = restUtility(ctx);
    let bestSense: SenseOption | null = null;
    let bestMove = p.at;

    for (const o of senseOpts) {
      const u = mech.utility(o, ctx);
      if (u > bestUtil) {
        bestUtil = u;
        bestKind = 'sense';
        bestSense = o;
      }
    }
    for (const n of neighbors) {
      const u = moveUtility(n, ctx);
      if (u > bestUtil) {
        bestUtil = u;
        bestKind = 'move';
        bestMove = n;
      }
    }

    // ---- 执行 ----
    let spent = 0;
    if (bestKind === 'sense' && bestSense) {
      trace.decisions.push({ options: totalOptions, chosen: bestSense.id });
      mech.apply(bestSense, p, world, rng);
      spent = bestSense.breaths;
      p.noise += bestSense.noise;
    } else if (bestKind === 'move') {
      trace.decisions.push({ options: totalOptions, chosen: `move:${classifyMove(p, world, bestMove)}` });
      const believed = p.belief[bestMove];
      const actual = world.danger[bestMove];
      // 相信安全却踩进危险 —— 这是玩家可以复盘的错误，不是运气
      if (believed >= 0 && actual - believed > 0.35) {
        lastMistakeAt = elapsed;
        trace.surprises.push(elapsed);
      } else if (believed < 0 && actual > 0.72) {
        trace.surprises.push(elapsed);
      }
      p.at = bestMove;
      p.belief[p.at] = actual; // 亲身到场总是得到真值
      if (p.at === world.exit) p.knowsExit = true;
      spent = MOVE_BREATHS;
      p.noise += 1.2;
      p.fear = clamp(p.fear + actual * 14 - 1, 0, 100);

      // 危险房间真的会伤人。没有这一条，"知道哪里危险"就不值钱，声呐也就没有意义
      if (rng.next() < actual * 0.16) {
        const hazard = 55 + actual * 120;
        p.oxygen -= hazard;
        p.fear = clamp(p.fear + 22, 0, 100);
        p.noise += 7;
        trace.surprises.push(elapsed);
        if (believed >= 0 && believed < 0.3) lastMistakeAt = elapsed;
        if (rng.next() < actual * 0.09) {
          trace.cause = 'trauma';
          trace.hadIdentifiableMistake = believed >= 0 && actual - believed > 0.3;
          p.oxygen = -1;
        }
      }

      // 搜到氧气 —— 劣势翻盘的唯一来源
      if (world.oxygenCache[p.at] > 0) {
        p.oxygen = Math.min(p.oxygenMax, p.oxygen + world.oxygenCache[p.at]);
        world.oxygenCache[p.at] = 0;
      }
    } else {
      trace.decisions.push({ options: totalOptions, chosen: 'rest' });
      spent = REST_BREATHS;
      p.fear = clamp(p.fear - 16, 0, 100);
      p.noise = Math.max(0, p.noise - 4);
    }

    if (trace.cause === 'trauma') {
      elapsed += spent;
      break;
    }

    const cost = spent * (1 + (p.fear / 100) * 1.2);
    p.oxygen -= cost;
    elapsed += spent;

    // ---- 世界反应 ----
    p.noise = Math.max(0, p.noise - 0.8 * spent);
    p.fear = clamp(p.fear - 0.25 * spent, 0, 100);

    if (p.hunter < 0 && p.noise > 22) {
      // 从离玩家最远的房间出发 —— 它来了，但你还有时间
      p.hunter = farthestFrom(world, p.at);
      p.hunterAwareness = 0.4;
      trace.surprises.push(elapsed);
    }
    if (p.hunter >= 0) {
      p.hunterAwareness = clamp01(p.hunterAwareness + p.noise * 0.012 - 0.03 * spent);
      // 它比玩家慢，而且只有在有把握时才直奔 —— 否则乱走
      const stepsThisTurn = Math.floor(spent / 4);
      for (let s = 0; s < stepsThisTurn; s++) {
        p.hunter =
          rng.next() < p.hunterAwareness
            ? stepToward(world, p.hunter, p.at)
            : rng.pick(world.adj[p.hunter]);
      }
      if (p.hunter === p.at) {
        p.fear = Math.min(100, p.fear + 34);
        // 高技巧玩家更可能脱身；低技巧玩家在这里结束
        if (rng.next() > 0.55 + skill * 0.38) {
          trace.cause = 'listener';
          trace.hadIdentifiableMistake = elapsed - lastMistakeAt < 60 || p.noise > 18;
          break;
        }
        p.hunter = rng.pick(world.adj[p.at]);
        p.hunterAwareness *= 0.5;
      }
    }

    const oxyFrac = p.oxygen / p.oxygenMax;
    if (oxyFrac < 0.22) everBehind = true;
    if (everBehind && oxyFrac > 0.45) trace.recovered = true;

    trace.tension.push(
      clamp01((p.fear / 100) * 0.42 + (1 - oxyFrac) * 0.3 + (p.hunter >= 0 ? 0.18 * p.hunterAwareness + 0.1 : 0)),
    );

    if (p.at === world.exit) {
      trace.survived = true;
      break;
    }
  }

  if (!trace.survived && !trace.cause) {
    trace.cause = p.oxygen <= 0 ? 'asphyxiation' : 'lost';
    trace.hadIdentifiableMistake = trace.cause === 'asphyxiation' && wastedBreathsDetected(trace);
  }
  trace.duration = Math.max(1, elapsed);
  trace.wasBehind = everBehind;
  return trace;
}

/** 窒息而死是否"可归因"：如果玩家有大量低收益感知行动，那是他自己的账 */
function wastedBreathsDetected(trace: TrialTrace): boolean {
  const senseCount = trace.decisions.filter((d) => d.chosen.startsWith('sonar:')).length;
  return senseCount / Math.max(1, trace.decisions.length) > 0.28;
}

/**
 * 移动效用。两个变体共用**同一个**玩家大脑，
 * 否则比较的就是两个 AI，而不是两套机制。
 */
function moveUtility(to: number, ctx: DecisionContext): number {
  const { p, w, skill, rng } = ctx;
  const known = p.belief[to] >= 0;
  const risk = known ? p.belief[to] : 0.45;

  // 知道出口就朝出口走；不知道就朝"信息前沿"走
  const progress = p.knowsExit
    ? (w.distToExit[p.at] - w.distToExit[to]) * 0.9
    : frontierValue(p, w, to) * 0.55;

  // 被追时远离追击者的价值陡增
  const flee =
    p.hunter >= 0 ? (hops(w, p.hunter, to) - hops(w, p.hunter, p.at)) * p.hunterAwareness * 1.5 : 0;

  // 技巧高的玩家更准确地折算风险，也更少乱走
  const noise = rng.float(0, 1.3 * (1 - skill) + 0.08);
  return progress + flee - risk * (0.5 + skill * 1.7) + noise + 0.35;
}

function restUtility(ctx: DecisionContext): number {
  const { p, skill, rng } = ctx;
  // 休息只有在恐惧高且不被追时才划算 —— 这是一个真实的取舍，不是保底选项
  const value = (p.fear / 100) * 2.4 - (p.hunter >= 0 ? p.hunterAwareness * 3 : 0) - (1 - ctx.oxyFrac) * 1.8;
  return value * (0.4 + skill * 1.2) + rng.float(0, 0.9 * (1 - skill));
}

/** 往这个方向走能打开多少未知 */
function frontierValue(p: SimPlayer, w: SimWorld, to: number): number {
  let unknown = 0;
  for (const n of w.adj[to]) if (p.belief[n] < 0) unknown++;
  return unknown + (p.belief[to] < 0 ? 1.5 : 0);
}

function classifyMove(p: SimPlayer, w: SimWorld, to: number): string {
  const known = p.belief[to] >= 0;
  const toward = w.distToExit[to] < w.distToExit[p.at];
  if (!known) return toward ? 'blind-forward' : 'blind-lateral';
  return toward ? 'known-forward' : 'known-lateral';
}

export function countUnknownWithin(p: SimPlayer, w: SimWorld, radius: number): number {
  const seen = new Set<number>([p.at]);
  let frontier = [p.at];
  let count = 0;
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (const n of w.adj[cur]) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
        if (p.belief[n] < 0) count++;
      }
    }
    frontier = next;
  }
  return count;
}

const hopCache = new WeakMap<SimWorld, Map<number, number[]>>();

export function hops(w: SimWorld, from: number, to: number): number {
  let cache = hopCache.get(w);
  if (!cache) {
    cache = new Map();
    hopCache.set(w, cache);
  }
  let d = cache.get(from);
  if (!d) {
    d = bfsDistances(w.adj, from);
    cache.set(from, d);
  }
  return d[to];
}

function stepToward(w: SimWorld, from: number, to: number): number {
  let best = from;
  let bestD = hops(w, from, to);
  for (const n of w.adj[from]) {
    const d = hops(w, n, to);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function farthestFrom(w: SimWorld, origin: number): number {
  let best = origin;
  let bestD = -1;
  for (let i = 0; i < w.size; i++) {
    const d = hops(w, origin, i);
    if (d !== Infinity && d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 揭示以 origin 为中心、radius 跳内的房间，保真度随距离衰减 */
export function reveal(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  radius: number,
  fidelity: number,
  rng: Rng,
): void {
  const seen = new Set<number>([origin]);
  let frontier = [origin];
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (const n of w.adj[cur]) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
        const localFidelity = fidelity * Math.pow(0.87, r);
        // 保真度不足时写入的是**错误的信念**，而不是"没有信息" —— 这是恐怖的来源
        p.belief[n] = rng.next() < localFidelity ? w.danger[n] : rng.float(0, 1);
        if (n === w.exit && rng.next() < localFidelity) p.knowsExit = true;
      }
    }
    frontier = next;
  }
}
