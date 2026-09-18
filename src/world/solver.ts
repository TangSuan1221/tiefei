/**
 * world/solver.ts — 可通关性求解器
 *
 * 这不是一个"看看图连不连通"的脚本，而是一个**锁-钥匙前向不动点求解器**：
 * 它从实际的 prop 定义里读出哪些交互能产出哪些钥匙，逐轮扩张可达集，
 * 直到没有新东西可拿、没有新门可开。
 *
 * 「悲观模式」是 GDD §6.2「所有可选门锁死仍能通关」的形式化：
 *   - 只允许 role === 'critical' 的门
 *   - 剔除所有 unstable 门（最坏情况下重织把它们连去了别处）
 *   - 不采信任何带 requires 的产出（因为那依赖玩家当时的状态）
 *   - 不采信依赖 vitals / stigma 的条件
 * 悲观模式通过 ⇒ 无论玩家运气多差、重织怎么改，这一局一定能走到月池。
 * 这就是「绝不允许玩家运气不好就卡死」的机械证明。
 */

import type { Condition, ID } from '../core/contract';
import { deckDepth } from './decks';
import { articulationPoints, canWalk, shortestPath, vertexDisjointPaths } from './graph';
import { keysGrantedByInteraction } from './props';
import type {
  BlockedDoor,
  KeyAcquisition,
  SolveReport,
  SolverOptions,
  WorldDoor,
  WorldGraph,
  WorldRoom,
} from './types';

// ---------------------------------------------------------------- 条件求值

interface EvalCtx {
  keys: Set<string>;
  room: WorldRoom;
  pessimistic: boolean;
}

/**
 * 求解器视角的条件求值。
 * 关键设计：**不确定即为假**。任何求解器无法静态保证的条件（生理数值、
 * 教团标记、否定判断）在悲观模式下都算不满足。宁可低估玩家能力，
 * 也不要给出一个"其实会卡死"的通关证明。
 */
function satisfied(c: Condition | undefined, ctx: EvalCtx): boolean {
  if (!c) return true;
  switch (c.op) {
    case 'always':
      return true;
    case 'flag': {
      if (c.value === false) return ctx.pessimistic ? false : !ctx.keys.has(c.key);
      if (c.cmp === '!=' || c.cmp === '<' || c.cmp === '<=') return !ctx.pessimistic;
      return ctx.keys.has(c.key);
    }
    case 'has-item':
      return ctx.keys.has(c.item);
    case 'has-knowledge':
      return ctx.keys.has(c.node);
    case 'in-room':
      return ctx.room.archetype === c.archetype;
    case 'depth': {
      const d = deckDepth(ctx.room.deck);
      switch (c.cmp) {
        case '>':
          return d > c.value;
        case '>=':
          return d >= c.value;
        case '<':
          return d < c.value;
        case '<=':
          return d <= c.value;
        case '==':
          return d === c.value;
        default:
          return d !== c.value;
      }
    }
    case 'all':
      return c.of.every((x) => satisfied(x, ctx));
    case 'any':
      return c.of.some((x) => satisfied(x, ctx));
    case 'not':
      // 否定在前向不动点里不单调（拿到钥匙会让它变假），悲观模式一律拒绝
      return ctx.pessimistic ? false : !satisfied(c.of, ctx);
    case 'vital':
    case 'stigma':
      return !ctx.pessimistic;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- 门的可用性

export function doorAllowedForSolver(door: WorldDoor, pessimistic: boolean): boolean {
  if (!canWalk(door)) return false;
  if (!pessimistic) return true;
  if (door.unstable) return false;
  return door.role === 'critical';
}

/** 乐观遍历：玩家实际能走的门（含撬门） */
export function doorWalkable(door: WorldDoor): boolean {
  return canWalk(door);
}

// ---------------------------------------------------------------- 主求解

export function solve(graph: WorldGraph, opts: SolverOptions): SolveReport {
  const pessimistic = opts.pessimistic;
  const start = opts.from ?? graph.startRoomId;
  const goal = opts.to ?? graph.exitRoomId;

  const keys = new Set<string>(opts.granted ?? []);
  const reachable = new Set<ID>();
  const keyOrder: KeyAcquisition[] = [];
  const blocked = new Map<ID, BlockedDoor>();
  /** 钥匙 → 在哪个房间拿到的，算关键路径要用 */
  const keyRoom = new Map<string, ID>();
  /** 钥匙 → 本轮之前是否已有，避免重复记录 */
  const harvested = new Set<string>();

  if (graph.rooms.has(start)) reachable.add(start);

  let step = 0;
  for (;;) {
    step++;
    let changed = false;

    // --- 采集：可达房间里所有"能立刻做"的交互产出
    for (const id of reachable) {
      const room = graph.rooms.get(id);
      if (!room) continue;
      for (const prop of room.props) {
        for (const spec of prop.interactions) {
          const specId = `${prop.id}/${spec.id}`;
          if (harvested.has(specId)) continue;
          if (pessimistic && spec.requires) continue;
          if (!satisfied(spec.requires, { keys, room, pessimistic })) continue;
          harvested.add(specId);
          for (const key of keysGrantedByInteraction(spec)) {
            if (keys.has(key)) continue;
            keys.add(key);
            keyRoom.set(key, room.id);
            keyOrder.push({ key, at: room.id, propId: prop.id, step });
            changed = true;
          }
        }
      }
    }

    // --- 扩张：能过的门
    for (const id of [...reachable]) {
      const room = graph.rooms.get(id);
      if (!room) continue;
      for (const door of room.doors) {
        if (!graph.rooms.has(door.to)) continue;
        if (!doorAllowedForSolver(door, pessimistic)) {
          if (!reachable.has(door.to)) {
            blocked.set(door.id, {
              door: door.id,
              from: room.id,
              to: door.to,
              reason: canWalk(door) ? `role=${door.role}${door.unstable ? '+unstable' : ''}` : `state=${door.state}`,
            });
          }
          continue;
        }
        if (door.lock && !keys.has(door.lock.requires)) {
          if (!reachable.has(door.to)) {
            blocked.set(door.id, {
              door: door.id,
              from: room.id,
              to: door.to,
              reason: `lock:${door.lock.kind}=${door.lock.requires}`,
            });
          }
          continue;
        }
        blocked.delete(door.id);
        if (!reachable.has(door.to)) {
          reachable.add(door.to);
          changed = true;
        }
      }
    }

    if (!changed) break;
    if (step > 400) break;
  }

  const solvable = reachable.has(goal);

  // --- 关键路径：起点 → 必需钥匙所在房间（按获得顺序） → 终点
  const { path, rooms: pathRooms } = criticalRoute(graph, start, goal, keys, keyRoom, pessimistic);

  for (const r of graph.rooms.values()) r.onCriticalPath = false;
  for (const id of pathRooms) {
    const r = graph.rooms.get(id);
    if (r) r.onCriticalPath = true;
  }

  const total = graph.rooms.size || 1;
  const cut = articulationPoints(graph, (d) => doorAllowedForSolver(d, pessimistic));
  const bottlenecks = [...pathRooms].filter((id) => cut.has(id));

  let deckReached = 0;
  for (const id of reachable) {
    const r = graph.rooms.get(id);
    if (r && r.deck > deckReached) deckReached = r.deck;
  }

  const report: SolveReport = {
    solvable,
    criticalPath: path,
    criticalPathLength: path.length,
    reachable: [...reachable],
    optionalRatio: 1 - pathRooms.size / total,
    keyOrder,
    blockedDoors: [...blocked.values()],
    bottlenecks,
    deckReached,
    disjointDescents: descentIndependence(graph),
  };
  if (!solvable) {
    report.failure = describeFailure(graph, goal, reachable, [...blocked.values()]);
  }
  return report;
}

/**
 * 关键路径 = 玩家**必须**走过的房间。
 * 做法：把「取到每把必需钥匙的房间」按获得顺序串成航点，分段求最短路，
 * 再把各段拼起来。这比"起点到终点的最短路"诚实得多 ——
 * 后者会给出一个玩家其实走不了的长度（因为路上的门是锁着的）。
 */
function criticalRoute(
  graph: WorldGraph,
  start: ID,
  goal: ID,
  keys: Set<string>,
  keyRoom: Map<string, ID>,
  pessimistic: boolean,
): { path: ID[]; rooms: Set<ID> } {
  const filter = (d: WorldDoor) => doorAllowedForSolver(d, pessimistic) && (!d.lock || keys.has(d.lock.requires));

  // 哪些钥匙真的被某扇允许通行的门要求了
  const required = new Set<string>();
  for (const room of graph.rooms.values()) {
    for (const d of room.doors) {
      if (!doorAllowedForSolver(d, pessimistic)) continue;
      if (d.lock) required.add(d.lock.requires);
    }
  }

  const waypoints: ID[] = [start];
  for (const [key, at] of keyRoom) {
    if (!required.has(key)) continue;
    if (waypoints[waypoints.length - 1] !== at) waypoints.push(at);
  }
  waypoints.push(goal);

  const path: ID[] = [];
  const rooms = new Set<ID>();
  for (let i = 0; i < waypoints.length - 1; i++) {
    const seg = shortestPath(graph, waypoints[i], waypoints[i + 1], filter);
    if (!seg) continue;
    for (let j = 0; j < seg.length; j++) {
      if (i > 0 && j === 0) continue; // 段首与上一段段尾重复
      path.push(seg[j]);
      rooms.add(seg[j]);
    }
  }
  if (!path.length) {
    const direct = shortestPath(graph, start, goal, filter);
    if (direct) {
      for (const id of direct) {
        path.push(id);
        rooms.add(id);
      }
    } else {
      path.push(start);
      rooms.add(start);
    }
  }
  return { path, rooms };
}

/** 每层通往下一层的点不交路径条数 */
export function descentIndependence(graph: WorldGraph): Record<number, number> {
  const out: Record<number, number> = {};
  for (let deck = 1; deck < graph.decks; deck++) {
    const entry = graph.deckEntry.get(deck);
    if (!entry) {
      out[deck] = 0;
      continue;
    }
    const sinks = new Set<ID>();
    for (const r of graph.rooms.values()) {
      if (r.deck !== deck) continue;
      if (r.doors.some((d) => d.deckDelta > 0 && canWalk(d))) sinks.add(r.id);
    }
    out[deck] = vertexDisjointPaths(graph, [entry], [...sinks], deck, (d) => canWalk(d) && d.deckDelta === 0);
  }
  return out;
}

function describeFailure(
  graph: WorldGraph,
  goal: ID,
  reachable: Set<ID>,
  blocked: readonly BlockedDoor[],
): string {
  const goalRoom = graph.rooms.get(goal);
  if (!goalRoom) return `终点房间 ${goal} 不存在`;
  let deepest = 0;
  for (const id of reachable) {
    const r = graph.rooms.get(id);
    if (r && r.deck > deepest) deepest = r.deck;
  }
  const edge = blocked.filter((b) => reachable.has(b.from) && !reachable.has(b.to));
  const sample = edge.slice(0, 4).map((b) => `${b.from}→${b.to}(${b.reason})`);
  return `只到 D${deepest}（终点在 D${goalRoom.deck}），可达 ${reachable.size}/${graph.rooms.size}；卡在: ${sample.join(', ') || '无出边'}`;
}

// ---------------------------------------------------------------- 钥匙放置约束

/**
 * 求解「某把钥匙可以放在哪些房间」。
 * 约束：房间必须在**不需要这把钥匙**的情况下可达。
 * 这是生成器做约束求解时的核心查询，也是为什么这个生成器不会产出
 * "钥匙锁在自己开的门后面" 这种经典死锁。
 */
export function roomsReachableWithoutKey(graph: WorldGraph, key: string, from: ID): Set<ID> {
  const keys = new Set<string>();
  const reachable = new Set<ID>([from]);
  const harvested = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    let changed = false;
    for (const id of [...reachable]) {
      const room = graph.rooms.get(id);
      if (!room) continue;
      for (const prop of room.props) {
        for (const spec of prop.interactions) {
          const sid = `${prop.id}/${spec.id}`;
          if (harvested.has(sid) || spec.requires) continue;
          harvested.add(sid);
          for (const k of keysGrantedByInteraction(spec)) {
            if (k === key || keys.has(k)) continue;
            keys.add(k);
            changed = true;
          }
        }
      }
      for (const door of room.doors) {
        if (!doorAllowedForSolver(door, true)) continue;
        if (door.lock && !keys.has(door.lock.requires)) continue;
        if (!reachable.has(door.to) && graph.rooms.has(door.to)) {
          reachable.add(door.to);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return reachable;
}

// ---------------------------------------------------------------- 兜底修复

export interface RepairResult {
  repaired: boolean;
  actions: string[];
}

/**
 * 兜底修复。
 *
 * 生成器已经是"按构造正确"的（钥匙一定放在门之前的房间里），
 * 所以重生成几次通常就能过。但 1000 次统计要求**可通关率 100%**，
 * 不能留哪怕万分之一的尾部风险。所以最后一道闸是修复：
 * 把仍然堵住关键路径的锁直接降级为开启，并记录下来。
 * 修复次数是一个质量指标 —— 它常年为 0 才说明生成算法本身是对的。
 */
export function repairForSolvability(graph: WorldGraph): RepairResult {
  const actions: string[] = [];
  for (let pass = 0; pass < 48; pass++) {
    const report = solve(graph, { pessimistic: true });
    if (report.solvable) {
      return { repaired: actions.length > 0, actions };
    }
    const reachable = new Set(report.reachable);
    // 1) 优先解锁"站在可达区、门后不可达"的关键门
    const frontier = report.blockedDoors.filter((b) => reachable.has(b.from) && !reachable.has(b.to));
    let acted = false;
    for (const b of frontier) {
      const room = graph.rooms.get(b.from);
      const door = room?.doors.find((d) => d.id === b.door);
      if (!door) continue;
      if (door.lock) {
        actions.push(`unlock ${door.id} (${door.lock.kind}:${door.lock.requires})`);
        delete door.lock;
        acted = true;
      } else if (!canWalk(door)) {
        actions.push(`unjam ${door.id} (${door.state})`);
        door.state = 'closed';
        acted = true;
      } else if (door.role !== 'critical' || door.unstable) {
        actions.push(`promote ${door.id} → critical/stable`);
        door.role = 'critical';
        door.unstable = false;
        acted = true;
      }
    }
    if (acted) continue;

    // 2) 可达区没有任何能修的出边：直接架一座桥到下一层最近的房间
    let deepest: WorldRoom | null = null;
    for (const id of reachable) {
      const r = graph.rooms.get(id);
      if (r && (!deepest || r.deck > deepest.deck)) deepest = r;
    }
    const target = pickBridgeTarget(graph, reachable, deepest?.deck ?? 1);
    if (deepest && target) {
      const d: WorldDoor = {
        id: `dRepair${pass}`,
        to: target.id,
        state: 'closed',
        pressureDelta: 0,
        unstable: false,
        from: deepest.id,
        role: 'critical',
        crawl: false,
        deckDelta: target.deck - deepest.deck,
        originalTo: target.id,
        reweaveCount: 0,
        audioHint: '一段你不记得走过的通道。它的门框比别处新。',
      };
      deepest.doors.push(d);
      const back: WorldDoor = {
        id: `dRepair${pass}b`,
        to: deepest.id,
        state: 'closed',
        pressureDelta: 0,
        unstable: false,
        from: target.id,
        role: 'critical',
        crawl: false,
        deckDelta: deepest.deck - target.deck,
        originalTo: deepest.id,
        reweaveCount: 0,
        twin: d.id,
      };
      target.doors.push(back);
      d.twin = back.id;
      actions.push(`bridge ${deepest.id} → ${target.id}`);
      continue;
    }
    break;
  }

  // 最后一道保险：可达区里最深的房间直接开一扇无锁关键门到出口。
  // 这一步破坏关卡设计（凭空多一条捷径），但"能通关"是不可谈判的，
  // 关卡质量是可以谈判的。它触发一次就说明生成算法有漏洞，统计里会看得见。
  let stuck = solve(graph, { pessimistic: true });
  if (!stuck.solvable) {
    const reachable = new Set(stuck.reachable);
    let deepest: WorldRoom | null = null;
    for (const id of reachable) {
      const r = graph.rooms.get(id);
      if (r && (!deepest || r.deck > deepest.deck)) deepest = r;
    }
    const exit = graph.rooms.get(graph.exitRoomId);
    if (deepest && exit && deepest.id !== exit.id) {
      bridge(graph, deepest, exit, 'last-resort');
      actions.push(`last-resort bridge ${deepest.id} → ${exit.id}`);
      stuck = solve(graph, { pessimistic: true });
    }
  }
  return { repaired: actions.length > 0 && stuck.solvable, actions };
}

/** 在两个房间之间架一对无锁关键门。只有兜底修复会用它 */
function bridge(graph: WorldGraph, from: WorldRoom, to: WorldRoom, tag: string): void {
  const fid: ID = `dRepair-${tag}-${from.id}`;
  const bid: ID = `dRepair-${tag}-${to.id}`;
  const fwd: WorldDoor = {
    id: fid,
    to: to.id,
    state: 'closed',
    pressureDelta: 0,
    unstable: false,
    from: from.id,
    role: 'critical',
    crawl: false,
    deckDelta: to.deck - from.deck,
    originalTo: to.id,
    reweaveCount: 0,
    twin: bid,
    audioHint: '一段你不记得走过的通道。它的门框比别处新。',
  };
  const back: WorldDoor = {
    id: bid,
    to: from.id,
    state: 'closed',
    pressureDelta: 0,
    unstable: false,
    from: to.id,
    role: 'critical',
    crawl: false,
    deckDelta: from.deck - to.deck,
    originalTo: from.id,
    reweaveCount: 0,
    twin: fid,
  };
  from.doors.push(fwd);
  to.doors.push(back);
}

function pickBridgeTarget(graph: WorldGraph, reachable: Set<ID>, fromDeck: number): WorldRoom | null {
  let best: WorldRoom | null = null;
  for (const r of graph.rooms.values()) {
    if (reachable.has(r.id)) continue;
    if (r.veracity === 'phantom') continue;
    if (r.deck < fromDeck) continue;
    if (!best) {
      best = r;
      continue;
    }
    // 优先接到下一层的入口，其次是甲板最浅的未达房间
    const entry = graph.deckEntry.get(fromDeck + 1);
    if (entry && r.id === entry) return r;
    if (r.deck < best.deck) best = r;
  }
  return best;
}

// ---------------------------------------------------------------- 质量评估

export interface QualityGrade {
  ok: boolean;
  reasons: string[];
  criticalPathLength: number;
  optionalRatio: number;
  minDisjoint: number;
  bottleneckRatio: number;
}

/**
 * 关卡质量闸门。生成器用它决定"这一张图值不值得留下"。
 * 阈值全部来自 tools/mapgen-preview.ts 的 1000 次统计调参结果。
 */
export function gradeLevel(graph: WorldGraph, report: SolveReport): QualityGrade {
  const reasons: string[] = [];
  const minDisjoint = Object.entries(report.disjointDescents).reduce(
    (m, [, v]) => Math.min(m, v),
    Number.POSITIVE_INFINITY,
  );
  const disjoint = Number.isFinite(minDisjoint) ? minDisjoint : 0;
  const bottleneckRatio = report.criticalPathLength ? report.bottlenecks.length / report.criticalPathLength : 1;

  if (!report.solvable) reasons.push('悲观模式下不可通关');
  if (report.criticalPathLength < 16) reasons.push(`关键路径过短 (${report.criticalPathLength})`);
  if (report.optionalRatio < 0.3) reasons.push(`可选内容过少 (${report.optionalRatio.toFixed(2)})`);
  if (disjoint < 2) reasons.push(`存在单路径甲板 (min=${disjoint})`);
  if (report.deckReached < graph.decks) reasons.push(`最深只到 D${report.deckReached}`);

  return {
    ok: reasons.length === 0,
    reasons,
    criticalPathLength: report.criticalPathLength,
    optionalRatio: report.optionalRatio,
    minDisjoint: disjoint,
    bottleneckRatio,
  };
}
