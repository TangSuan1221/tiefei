/**
 * world/graph.ts — 图的底层操作
 *
 * 单独成文件的原因很实际：生成器需要求解器，求解器的修复步骤需要建门建房，
 * 如果都写在 generator.ts 里就会和 solver.ts 形成循环依赖。
 * 这里只放不需要知道「内容」的纯拓扑操作。
 */

import type { Door, DoorState, ID, LockSpec, Prop, Rng, RoomArchetype, Vec2 } from '../core/contract';
import { deckDepth } from './decks';
import type { Counters, DoorRole, WorldDoor, WorldGraph, WorldRoom } from './types';

export type { Counters };

export function makeCounters(): Counters {
  return { door: 0, prop: 0 };
}

// ---------------------------------------------------------------- 房间

export interface RoomInit {
  id: ID;
  archetype: RoomArchetype;
  name: string;
  variantId: string;
  deck: number;
  pos: Vec2;
  ambient: WorldRoom['ambient'];
  noiseThreshold: number;
  floodRate: number;
  props: Prop[];
  tags: string[];
  echoFingerprint: number;
  veracity?: WorldRoom['veracity'];
  onBlueprint?: boolean;
  setpiece?: string;
  onEnterNode?: ID;
}

export function createRoom(init: RoomInit): WorldRoom {
  const r: WorldRoom = {
    id: init.id,
    archetype: init.archetype,
    name: init.name,
    pos: init.pos,
    deck: init.deck,
    ambient: init.ambient,
    doors: [],
    props: init.props,
    visited: false,
    mapped: false,
    veracity: init.veracity ?? 'real',
    noise: 0,
    noiseThreshold: init.noiseThreshold,
    tags: init.tags,
    variantId: init.variantId,
    onCriticalPath: false,
    echoFingerprint: init.echoFingerprint,
    floodRate: init.floodRate,
    traces: [],
    onBlueprint: init.onBlueprint ?? true,
    spent: [],
  };
  if (init.setpiece) r.setpiece = init.setpiece;
  if (init.onEnterNode) r.onEnterNode = init.onEnterNode;
  return r;
}

// ---------------------------------------------------------------- 门

export interface LinkOptions {
  role?: DoorRole;
  state?: DoorState;
  lock?: LockSpec;
  unstable?: boolean;
  crawl?: boolean;
  audioHint?: string;
  /** 只建单向门（莫比乌斯走廊要用） */
  oneWay?: boolean;
  /** 反向门的独立状态 */
  backState?: DoorState;
  pressureDelta?: number;
}

/**
 * 连接两个房间。默认建**成对**的双向门 —— 单向门在幽闭恐怖里很容易变成
 * 不可理解的 bug，所以只有 setpiece 会显式开启 oneWay。
 */
export function link(
  graph: WorldGraph,
  counters: Counters,
  a: WorldRoom,
  b: WorldRoom,
  opts: LinkOptions = {},
): { forward: WorldDoor; backward?: WorldDoor } {
  const role = opts.role ?? 'optional';
  const state = opts.state ?? 'closed';
  const pd =
    opts.pressureDelta ?? Math.abs(a.ambient.pressure - b.ambient.pressure) + Math.abs(a.ambient.flooding - b.ambient.flooding) * 12;

  const fid: ID = `d${counters.door++}`;
  const forward: WorldDoor = {
    id: fid,
    to: b.id,
    state,
    pressureDelta: pd,
    unstable: opts.unstable ?? false,
    from: a.id,
    role,
    crawl: opts.crawl ?? false,
    deckDelta: b.deck - a.deck,
    originalTo: b.id,
    reweaveCount: 0,
  };
  if (opts.lock) forward.lock = opts.lock;
  if (opts.audioHint) forward.audioHint = opts.audioHint;
  a.doors.push(forward);

  if (opts.oneWay) return { forward };

  const bid: ID = `d${counters.door++}`;
  const backward: WorldDoor = {
    id: bid,
    to: a.id,
    state: opts.backState ?? state,
    pressureDelta: pd,
    unstable: opts.unstable ?? false,
    from: b.id,
    role,
    crawl: opts.crawl ?? false,
    deckDelta: a.deck - b.deck,
    originalTo: a.id,
    reweaveCount: 0,
    twin: fid,
  };
  if (opts.lock) backward.lock = opts.lock;
  if (opts.audioHint) backward.audioHint = opts.audioHint;
  b.doors.push(backward);
  forward.twin = bid;

  return { forward, backward };
}

export function areLinked(a: WorldRoom, b: ID): boolean {
  return a.doors.some((d) => d.to === b);
}

export function findDoor(graph: WorldGraph, doorId: ID): WorldDoor | undefined {
  for (const r of graph.rooms.values()) {
    const d = r.doors.find((x) => x.id === doorId);
    if (d) return d;
  }
  return undefined;
}

export function doorsBetween(a: WorldRoom, bId: ID): WorldDoor[] {
  return a.doors.filter((d) => d.to === bId);
}

export function degree(room: WorldRoom): number {
  return new Set(room.doors.map((d) => d.to)).size;
}

// ---------------------------------------------------------------- 遍历

export interface TraverseFilter {
  (door: WorldDoor, from: WorldRoom, to: WorldRoom): boolean;
}

/** 声音与探测用的遍历：门永远"可穿透"，只是衰减不同 */
export const PASSABLE_STATES: readonly DoorState[] = ['open', 'closed', 'jammed'];

export function canWalk(door: WorldDoor): boolean {
  return PASSABLE_STATES.includes(door.state);
}

/** 广度优先，返回每个房间的跳数 */
export function bfsHops(
  graph: WorldGraph,
  from: ID,
  maxHops: number,
  filter?: TraverseFilter,
): Map<ID, number> {
  const dist = new Map<ID, number>([[from, 0]]);
  let frontier: ID[] = [from];
  for (let h = 0; h < maxHops && frontier.length; h++) {
    const next: ID[] = [];
    for (const id of frontier) {
      const room = graph.rooms.get(id);
      if (!room) continue;
      for (const door of room.doors) {
        const to = graph.rooms.get(door.to);
        if (!to) continue;
        if (filter && !filter(door, room, to)) continue;
        if (dist.has(to.id)) continue;
        dist.set(to.id, h + 1);
        next.push(to.id);
      }
    }
    frontier = next;
  }
  return dist;
}

/** 最短路径（房间序列）。找不到返回 null */
export function shortestPath(
  graph: WorldGraph,
  from: ID,
  to: ID,
  filter?: TraverseFilter,
): ID[] | null {
  if (from === to) return [from];
  const prev = new Map<ID, ID>();
  const seen = new Set<ID>([from]);
  let frontier: ID[] = [from];
  while (frontier.length) {
    const next: ID[] = [];
    for (const id of frontier) {
      const room = graph.rooms.get(id);
      if (!room) continue;
      for (const door of room.doors) {
        const dst = graph.rooms.get(door.to);
        if (!dst || seen.has(dst.id)) continue;
        if (filter && !filter(door, room, dst)) continue;
        seen.add(dst.id);
        prev.set(dst.id, id);
        if (dst.id === to) {
          const path: ID[] = [to];
          let cur = to;
          while (prev.has(cur)) {
            cur = prev.get(cur) as ID;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(dst.id);
      }
    }
    frontier = next;
  }
  return null;
}

export function roomsOfDeck(graph: WorldGraph, deck: number): WorldRoom[] {
  const out: WorldRoom[] = [];
  for (const r of graph.rooms.values()) if (r.deck === deck) out.push(r);
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

/**
 * 无向图的关节点（Tarjan）。关键路径上的关节点就是关卡的咽喉，
 * preview 工具会把它们打印出来 —— 咽喉太多说明关卡太线性。
 */
export function articulationPoints(graph: WorldGraph, filter?: TraverseFilter): Set<ID> {
  const adj = new Map<ID, ID[]>();
  for (const r of graph.rooms.values()) {
    const list: ID[] = [];
    for (const d of r.doors) {
      const to = graph.rooms.get(d.to);
      if (!to) continue;
      if (filter && !filter(d, r, to)) continue;
      list.push(to.id);
    }
    adj.set(r.id, list);
  }
  const disc = new Map<ID, number>();
  const low = new Map<ID, number>();
  const parent = new Map<ID, ID | null>();
  const cut = new Set<ID>();
  let timer = 0;

  // 迭代式 DFS：五层甲板上百个房间，递归在极端种子下有栈溢出风险
  for (const start of adj.keys()) {
    if (disc.has(start)) continue;
    parent.set(start, null);
    let rootChildren = 0;
    const stack: { node: ID; idx: number }[] = [{ node: start, idx: 0 }];
    disc.set(start, timer);
    low.set(start, timer);
    timer++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      const neighbors = adj.get(top.node) ?? [];
      if (top.idx < neighbors.length) {
        const nb = neighbors[top.idx++];
        if (!disc.has(nb)) {
          parent.set(nb, top.node);
          if (top.node === start) rootChildren++;
          disc.set(nb, timer);
          low.set(nb, timer);
          timer++;
          stack.push({ node: nb, idx: 0 });
        } else if (nb !== parent.get(top.node)) {
          low.set(top.node, Math.min(low.get(top.node) as number, disc.get(nb) as number));
        }
      } else {
        stack.pop();
        const p = parent.get(top.node);
        if (p != null) {
          low.set(p, Math.min(low.get(p) as number, low.get(top.node) as number));
          if (p !== start && (low.get(top.node) as number) >= (disc.get(p) as number)) cut.add(p);
        }
      }
    }
    if (rootChildren > 1) cut.add(start);
  }
  return cut;
}

/**
 * 从 sources 到 sinks 的**点不交**路径条数（最大流 + 点拆分）。
 * GDD §6.2 要求「每层至少两条通往下一层的独立路径」，
 * 「独立」的严格含义就是点不交 —— 这个函数是那条要求的形式化验收。
 */
export function vertexDisjointPaths(
  graph: WorldGraph,
  sources: readonly ID[],
  sinks: readonly ID[],
  restrictDeck: number | null,
  filter?: TraverseFilter,
): number {
  const sinkSet = new Set(sinks);
  const srcSet = new Set(sources);
  if (!sources.length || !sinks.length) return 0;
  // 起点自己就是终点时，算一条（同一个房间里有下行门）
  const trivial = sources.filter((s) => sinkSet.has(s)).length;

  const nodes: ID[] = [];
  for (const r of graph.rooms.values()) {
    if (restrictDeck !== null && r.deck !== restrictDeck) continue;
    nodes.push(r.id);
  }
  const idx = new Map<ID, number>();
  nodes.forEach((id, i) => idx.set(id, i));

  const S = nodes.length * 2;
  const T = S + 1;
  const N = T + 1;
  const cap: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const INF = 1e9;

  const inN = (id: ID) => (idx.get(id) as number) * 2;
  const outN = (id: ID) => (idx.get(id) as number) * 2 + 1;

  for (const id of nodes) {
    // 点容量 1 => 路径不能共用中间房间
    cap[inN(id)][outN(id)] = srcSet.has(id) ? INF : 1;
  }
  for (const id of nodes) {
    const room = graph.rooms.get(id);
    if (!room) continue;
    for (const d of room.doors) {
      const to = graph.rooms.get(d.to);
      if (!to || !idx.has(to.id)) continue;
      if (filter && !filter(d, room, to)) continue;
      cap[outN(id)][inN(to.id)] = 1;
    }
  }
  for (const s of sources) if (idx.has(s)) cap[S][inN(s)] = INF;
  for (const t of sinks) if (idx.has(t)) cap[outN(t)][T] = 1;

  let flow = 0;
  for (;;) {
    const prev = new Array<number>(N).fill(-1);
    prev[S] = S;
    const queue = [S];
    while (queue.length && prev[T] < 0) {
      const u = queue.shift() as number;
      for (let v = 0; v < N; v++) {
        if (prev[v] < 0 && cap[u][v] > 0) {
          prev[v] = u;
          queue.push(v);
        }
      }
    }
    if (prev[T] < 0) break;
    let bottleneck = INF;
    for (let v = T; v !== S; v = prev[v]) bottleneck = Math.min(bottleneck, cap[prev[v]][v]);
    for (let v = T; v !== S; v = prev[v]) {
      cap[prev[v]][v] -= bottleneck;
      cap[v][prev[v]] += bottleneck;
    }
    flow += bottleneck;
    if (flow > 64) break;
  }
  return Math.max(flow, trivial);
}

// ---------------------------------------------------------------- 坐标布局

/**
 * 占位表。房间坐标要**整数且互不重叠**，否则 ASCII 预览没法画，
 * 声呐的方位角也会在同点上退化成 NaN。
 */
export class Occupancy {
  private taken = new Set<string>();
  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
  has(x: number, y: number): boolean {
    return this.taken.has(this.key(x, y));
  }
  take(x: number, y: number): void {
    this.taken.add(this.key(x, y));
  }
  /** 在 anchor 附近找一个空位。步距 2，中间留一格给 ASCII 连接线 */
  nearest(anchor: Vec2, rng: Rng, prefer?: readonly Vec2[]): Vec2 {
    const dirs: Vec2[] = prefer
      ? [...prefer]
      : rng.shuffle([
          { x: 0, y: -2 },
          { x: 0, y: 2 },
          { x: 2, y: 0 },
          { x: -2, y: 0 },
        ]);
    for (const d of dirs) {
      const p = { x: anchor.x + d.x, y: anchor.y + d.y };
      if (!this.has(p.x, p.y)) return p;
    }
    for (let ring = 2; ring <= 12; ring += 2) {
      for (let dx = -ring; dx <= ring; dx += 2) {
        for (let dy = -ring; dy <= ring; dy += 2) {
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
          const p = { x: anchor.x + dx, y: anchor.y + dy };
          if (p.y < 0 || p.x < 0) continue;
          if (!this.has(p.x, p.y)) return p;
        }
      }
    }
    return { x: anchor.x + rng.int(14, 40), y: anchor.y };
  }
}

export function depthOfRoom(room: WorldRoom): number {
  return deckDepth(room.deck);
}

/** 两个房间在声呐图上的方位角 → 音频 pan */
export function bearingPan(from: WorldRoom, to: WorldRoom): number {
  const dx = to.pos.x - from.pos.x;
  const dy = to.pos.y - from.pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  return Math.max(-1, Math.min(1, dx / len));
}

export function emptyGraph(seed: number, decks: number): WorldGraph {
  return {
    rooms: new Map<ID, WorldRoom>(),
    startRoomId: '',
    exitRoomId: '',
    deckEntry: new Map<number, ID>(),
    descents: new Map<number, ID[]>(),
    decks,
    seed,
    log: [],
    setpieces: [],
    attempts: 0,
    repaired: false,
  };
}

export function asDoor(d: WorldDoor): Door {
  return d;
}
