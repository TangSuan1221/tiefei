/**
 * world/reweave.ts — 非欧重织（GDD §6.3）
 *
 * 支柱 P4 写得很死：「拓扑在玩家不观察时重连，但重连**有规律**、可被推理」。
 * 反例（明确禁止）：纯随机、无法学习。
 *
 * 所以这里的重连是一套**成文的规则**，玩家可以逐条验证：
 *
 *   R1 只有 unstable 门会重连。关键门永不参与 —— 主线路径是固定的。
 *   R2 新目标的甲板只能是「同层」或「更深一层」，永不往上。
 *   R3 权重偏向圣所层 D4。这是它的意志：它把你往圣所推。
 *   R4 不动玩家当前所在房间的门，也不动玩家上一步走过的门。
 *   R5 不会重连到玩家从未探明的房间 —— 重织是重排，不是凭空造。
 *   R6 重连后必须保持可通关性，否则回滚。它想教你走迷宫，不想弄死你。
 *
 * R3 是玩家能主动利用的：如果你想往下，就故意让它重织。
 * R4/R5 是玩家能验证的：在门上做标记，回来看标记还在不在、门后换没换。
 */

import type { ID, Rng } from '../core/contract';
import { clamp01 } from '../core/util';
import { canWalk } from './graph';
import { solve } from './solver';
import type {
  DoorMark,
  DoorMarkVerdict,
  ReweaveRecord,
  ReweaveReport,
  WorldDoor,
  WorldGraph,
  WorldRoom,
} from './types';

/** 它把你往哪一层推。圣所层 = 教团的中心，也是叙事要求玩家去的地方 */
export const PULL_TOWARD_DECK = 4;

export interface ReweaveOptions {
  graph: WorldGraph;
  rng: Rng;
  /** 深度压力 0..1，越深重织越频繁 */
  pressure: number;
  /** 玩家当前所在房间 —— 它的门绝不动（R4） */
  playerAt: ID;
  /** 玩家上一步经过的门 —— 也不动（R4） */
  lastDoorId?: ID;
  /** 累计 Stigma，触发条件之一 */
  stigma?: number;
  /** 上限，防止单次重织把整张图搅烂 */
  maxChanges?: number;
}

/** 规则文本。UI 的"你归纳出的规律"面板直接用它，玩家验证够次数才逐条解锁 */
export const REWEAVE_RULES: readonly { id: string; text: string; observations: number }[] = [
  { id: 'R1', text: '只有某些门会变。它们的门框旁边焊着一个圈里带横线的记号。', observations: 2 },
  { id: 'R2', text: '它从不把你往上送。门后的甲板永远是同一层，或者更深一层。', observations: 3 },
  { id: 'R3', text: '它在把你往圣所层推。重连之后，到 D4 的路总是变短。', observations: 4 },
  { id: 'R4', text: '你脚下这个房间的门不会变。你刚走过的那扇门也不会。', observations: 2 },
  { id: 'R5', text: '它只重排你已经知道的地方。没被扫到过的舱段不会突然接到你面前。', observations: 3 },
  { id: 'R6', text: '它从不把路堵死。你总还能走到月池 —— 它要你走完。', observations: 5 },
];

// ============================================================================
// 主过程
// ============================================================================

export function reweave(opts: ReweaveOptions): ReweaveReport {
  const { graph, rng, pressure, playerAt, lastDoorId, stigma = 0 } = opts;
  const report: ReweaveReport = {
    changed: 0,
    records: [],
    reverted: 0,
    pullTowardDeck: PULL_TOWARD_DECK,
    tripped: [],
  };

  // 触发强度：深度压力 + 累计 Stigma
  const intensity = clamp01(pressure * 0.7 + Math.min(stigma, 12) / 24);
  const maxChanges = opts.maxChanges ?? Math.max(1, Math.round(1 + intensity * 4));

  const candidates = collectCandidates(graph, playerAt, lastDoorId);
  if (!candidates.length) return report;

  rng.shuffle(candidates);
  for (const door of candidates) {
    if (report.changed >= maxChanges) break;
    if (!rng.bool(clamp01(0.25 + intensity * 0.6))) continue;

    const from = graph.rooms.get(door.from);
    if (!from) continue;
    const target = chooseTarget(graph, rng, from, door);
    if (!target || target.id === door.to) continue;

    const was = door.to;
    const deckDeltaBefore = door.deckDelta;

    // 试改
    door.to = target.id;
    door.deckDelta = target.deck - from.deck;
    door.reweaveCount++;

    // R6：改完必须还能通关，否则立刻回滚
    if (!stillSolvable(graph, playerAt)) {
      door.to = was;
      door.deckDelta = deckDeltaBefore;
      door.reweaveCount--;
      report.reverted++;
      continue;
    }

    // 双向门的另一半要跟着走，否则会出现"进去出不来"的单向陷阱
    retwin(graph, door, was, target);

    report.records.push({
      door: door.id,
      from: from.id,
      was,
      now: target.id,
      rule: describeRule(deckDeltaBefore, door.deckDelta, target.deck),
      deckDeltaBefore,
      deckDeltaAfter: door.deckDelta,
    });
    report.changed++;

    // 玩家做过标记的门被改了 —— 这就是玩家能"抓住"重织的时刻
    if (door.mark) report.tripped.push(door.id);
    from.veracity = from.veracity === 'phantom' ? 'phantom' : 'unstable';
  }

  return report;
}

// ============================================================================
// R1 / R4 / R5：候选门
// ============================================================================

function collectCandidates(graph: WorldGraph, playerAt: ID, lastDoorId?: ID): WorldDoor[] {
  const out: WorldDoor[] = [];
  for (const room of graph.rooms.values()) {
    // R4：玩家脚下的房间不动
    if (room.id === playerAt) continue;
    for (const door of room.doors) {
      if (!door.unstable) continue; // R1
      if (door.role === 'critical') continue; // R1（关键门永不 unstable，双保险）
      if (door.id === lastDoorId || door.twin === lastDoorId) continue; // R4
      if (door.to === playerAt) continue; // 不切断玩家的退路
      if (!canWalk(door)) continue;
      out.push(door);
    }
  }
  return out;
}

// ============================================================================
// R2 / R3：目标选择
// ============================================================================

function chooseTarget(graph: WorldGraph, rng: Rng, from: WorldRoom, door: WorldDoor): WorldRoom | null {
  const pool: [WorldRoom, number][] = [];
  for (const room of graph.rooms.values()) {
    if (room.id === from.id) continue;
    if (room.id === door.to) continue;
    // R2：只能同层或更深一层
    const delta = room.deck - from.deck;
    if (delta < 0 || delta > 1) continue;
    // R5：只重排玩家已经知道的地方
    if (!room.mapped && !room.visited) continue;
    if (room.veracity === 'phantom') continue;
    if (room.tags.includes('exit')) continue;
    // 已经有门直达的目标就没意思了
    if (from.doors.some((d) => d.id !== door.id && d.to === room.id)) continue;

    // R3：往圣所层推。距离 D4 越近，权重越高
    const pull = 1 / (1 + Math.abs(room.deck - PULL_TOWARD_DECK));
    const deeper = delta === 1 ? 1.8 : 1;
    // 圣所系原型额外加权 —— 它推的不只是层，是那个方向的内容
    const kin =
      room.archetype === 'chapel' || room.archetype === 'reliquary' || room.archetype === 'void'
        ? 1.7
        : room.archetype === 'observation'
          ? 1.3
          : 1;
    // 拓扑上离得远的目标更"非欧"，也更值得重连
    const spatial = 1 + Math.min(Math.hypot(room.pos.x - from.pos.x, room.pos.y - from.pos.y), 24) * 0.05;

    pool.push([room, pull * 4 * deeper * kin * spatial]);
  }
  if (!pool.length) return null;
  return rng.weighted(pool);
}

function describeRule(before: number, after: number, targetDeck: number): string {
  if (after > before) return `R3 往深处推（Δ甲板 ${before}→${after}）`;
  if (targetDeck === PULL_TOWARD_DECK) return 'R3 指向圣所层 D4';
  if (after === 0) return 'R2 同层重排';
  return `R2 同层或更深（Δ甲板 ${after}）`;
}

/** 双向门的另一半：让它指回新来源，保持"进得去也出得来" */
function retwin(graph: WorldGraph, door: WorldDoor, was: ID, target: WorldRoom): void {
  if (!door.twin) return;
  const oldRoom = graph.rooms.get(was);
  if (oldRoom) {
    const idx = oldRoom.doors.findIndex((d) => d.id === door.twin);
    if (idx >= 0) {
      const twin = oldRoom.doors[idx];
      oldRoom.doors.splice(idx, 1);
      twin.from = target.id;
      twin.to = door.from;
      twin.deckDelta = -door.deckDelta;
      twin.reweaveCount++;
      target.doors.push(twin);
      return;
    }
  }
  // 原来的那一半找不到了（可能已被别的重织搬走）：新建一条回路
  target.doors.push({
    id: `${door.id}~r${door.reweaveCount}`,
    to: door.from,
    state: door.state,
    pressureDelta: door.pressureDelta,
    unstable: true,
    from: target.id,
    role: door.role,
    crawl: door.crawl,
    deckDelta: -door.deckDelta,
    originalTo: door.from,
    reweaveCount: 1,
    twin: door.id,
    audioHint: '门框的漆比这一段别处新。你不记得来的时候有这扇门。',
  });
}

// ============================================================================
// R6：连通性验证
// ============================================================================

/**
 * 重织后的安全检查。两个条件都得满足：
 *   1. 从起点出发在悲观模式下仍能到月池（关卡本身没坏）
 *   2. 从**玩家当前位置**出发也能到月池（玩家没被关进笼子）
 * 第 2 条是关键 —— 只查第 1 条会允许"把玩家所在的一小片区域从主体切下来"。
 */
export function stillSolvable(graph: WorldGraph, playerAt: ID): boolean {
  const fromStart = solve(graph, { pessimistic: true });
  if (!fromStart.solvable) return false;
  if (playerAt === graph.startRoomId) return true;
  const fromPlayer = solve(graph, { pessimistic: false, from: playerAt });
  return fromPlayer.solvable;
}

// ============================================================================
// 门上做标记 —— 玩家检测重织的手段
// ============================================================================

export interface MarkOptions {
  graph: FetchGraph;
  doorId: ID;
  /** 用什么留下的：划痕 / 血 / 蜡 / 胶带 */
  glyph: string;
  breaths: number;
}

type FetchGraph = Pick<WorldGraph, 'rooms'>;

function locateDoor(graph: FetchGraph, doorId: ID): { door: WorldDoor; room: WorldRoom } | null {
  for (const room of graph.rooms.values()) {
    const door = room.doors.find((d) => d.id === doorId);
    if (door) return { door, room };
  }
  return null;
}

/**
 * 在门上做标记。
 * 标记记下三样东西：图形、当时门后是哪个房间、当时门后房间的回波指纹。
 * 后两样是玩家自己没法记住的，所以这个 API 是在把"仔细的玩家"
 * 变成"能识破系统的玩家"（§5 的 debunk 循环）。
 */
export function markDoor(opts: MarkOptions): DoorMark | null {
  const found = locateDoor(opts.graph, opts.doorId);
  if (!found) return null;
  const behind = opts.graph.rooms.get(found.door.to);
  const mark: DoorMark = {
    glyph: opts.glyph,
    madeAt: opts.breaths,
    witnessedTo: found.door.to,
    witnessedEcho: behind?.echoFingerprint ?? 0,
  };
  found.door.mark = mark;
  return mark;
}

/**
 * 检查标记。四种判定：
 *   intact   标记在，门后也没变 —— 这一段是稳的，可以背下来
 *   rewoven  标记在，门后换了房间 —— 抓到一次重织
 *   missing  标记不见了 —— 要么这不是同一扇门（假门），要么有东西擦掉了它
 *   unmarked 这扇门从来没被标记过
 */
export function checkDoorMark(
  graph: FetchGraph,
  doorId: ID,
): { verdict: DoorMarkVerdict; detail: string; mark?: DoorMark } {
  const found = locateDoor(graph, doorId);
  if (!found) {
    return {
      verdict: 'missing',
      detail: '这扇门不在这里了。门框还在，门框里是舱壁。',
    };
  }
  const mark = found.door.mark;
  if (!mark) {
    return { verdict: 'unmarked', detail: '门上没有你的标记。你不记得标过这一扇。' };
  }
  if (mark.witnessedTo !== found.door.to) {
    const now = graph.rooms.get(found.door.to);
    return {
      verdict: 'rewoven',
      detail: `${mark.glyph}还在原来的位置，一点没动。但门后现在是「${now?.name ?? '不明舱段'}」，不是你标记时的那一个。`,
      mark,
    };
  }
  const behind = graph.rooms.get(found.door.to);
  if (behind && Math.abs(behind.echoFingerprint - mark.witnessedEcho) > 1e-6) {
    return {
      verdict: 'rewoven',
      detail: `${mark.glyph}还在。门后还是同一个房间，但它的回波指纹变了 —— 房间被换过，又换回来了。`,
      mark,
    };
  }
  return {
    verdict: 'intact',
    detail: `${mark.glyph}还在，门后也还是「${behind?.name ?? '同一处'}」。这一段是稳的。`,
    mark,
  };
}

export function markedDoors(graph: FetchGraph): { doorId: ID; roomId: ID; mark: DoorMark }[] {
  const out: { doorId: ID; roomId: ID; mark: DoorMark }[] = [];
  for (const room of graph.rooms.values()) {
    for (const d of room.doors) if (d.mark) out.push({ doorId: d.id, roomId: room.id, mark: d.mark });
  }
  return out;
}

// ============================================================================
// 可学习性：给 UI 的推理素材
// ============================================================================

export interface ReweaveInsight {
  /** 观察到的重连次数 */
  observed: number;
  /** 其中往更深处去的比例 —— 收敛到 R3 的证据 */
  deeperRatio: number;
  /** 平均目标甲板 */
  meanTargetDeck: number;
  /** 已解锁的规则 */
  learned: readonly string[];
}

/**
 * 从历史重织记录里归纳规律。
 * 这不是把答案直接告诉玩家，而是把**统计**交给玩家 ——
 * 玩家自己会得出"它在往 D4 推"的结论，而自己得出的结论才有分量。
 */
export function insight(history: readonly ReweaveRecord[], graph: FetchGraph): ReweaveInsight {
  const observed = history.length;
  let deeper = 0;
  let deckSum = 0;
  for (const r of history) {
    if (r.deckDeltaAfter > r.deckDeltaBefore) deeper++;
    const room = graph.rooms.get(r.now);
    deckSum += room?.deck ?? PULL_TOWARD_DECK;
  }
  const learned = REWEAVE_RULES.filter((r) => observed >= r.observations).map((r) => r.text);
  return {
    observed,
    deeperRatio: observed ? deeper / observed : 0,
    meanTargetDeck: observed ? deckSum / observed : 0,
    learned,
  };
}
