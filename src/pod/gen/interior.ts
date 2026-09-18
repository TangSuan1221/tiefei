/**
 * 当前房间的内部构造：墙、开口、障碍。
 * 全息屏一次只画这一间。玩家用航向 / 潜深 / 推进在里面走。
 */

import type { Rng } from '@/core/contract';
import { clamp } from '@/core/util';
import type { Vec3, Volume, VolumeNode } from './volume';

export const POD_R = 1.2;

export type ObstacleKind = 'pipe' | 'crate' | 'beam' | 'tank' | 'column' | 'grate';

export interface RoomObstacle {
  /** 这一间里稳定唯一。集装箱状态、机械手瞄准都按它索引 */
  id: string;
  kind: ObstacleKind;
  pos: Vec3;
  size: Vec3;
}

export interface RoomDoor {
  to: string;
  pos: Vec3;
  halfW: number;
  halfH: number;
  axis: 0 | 1 | 2;
  sign: 1 | -1;
}

export type CabinHitKind = 'free' | 'wall' | 'obstacle' | 'door';

export interface CabinHit {
  kind: CabinHitKind;
  pos: Vec3;
  t: number;
  to?: string;
  obstacle?: ObstacleKind;
}

export const OBSTACLE_CN: Readonly<Record<ObstacleKind, string>> = {
  pipe: '管排',
  crate: '货箱',
  beam: '横梁',
  tank: '罐',
  column: '支柱',
  grate: '格栅',
};

const AXIS: readonly (keyof Vec3)[] = ['x', 'y', 'z'];

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function neighbors(vol: Volume, id: string) {
  return vol.edges.filter((e) => e.from === id || e.to === id);
}

function otherEnd(e: { from: string; to: string }, id: string): string {
  return e.from === id ? e.to : e.from;
}

function nodeById(vol: Volume, id: string): VolumeNode {
  const n = vol.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`[interior] 没有节点 ${id}`);
  return n;
}

export function lookDir(heading: number, pitch: number): Vec3 {
  const h = (heading * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  const c = Math.cos(p);
  return { x: Math.sin(h) * c, y: Math.cos(h) * c, z: Math.sin(p) };
}

export function add3(a: Vec3, b: Vec3, s = 1): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function half(n: VolumeNode): Vec3 {
  return { x: n.size.x * 0.5, y: n.size.y * 0.5, z: n.size.z * 0.5 };
}

export function doorsOf(vol: Volume, node: VolumeNode): RoomDoor[] {
  const h = half(node);
  const out: RoomDoor[] = [];
  for (const e of neighbors(vol, node.id)) {
    const n = nodeById(vol, otherEnd(e, node.id));
    const d = { x: n.pos.x - node.pos.x, y: n.pos.y - node.pos.y, z: n.pos.z - node.pos.z };
    const ax = Math.abs(d.x);
    const ay = Math.abs(d.y);
    const az = Math.abs(d.z);
    let axis: 0 | 1 | 2 = 1;
    let sign: 1 | -1 = 1;
    if (ay >= ax && ay >= az) {
      axis = 1;
      sign = d.y >= 0 ? 1 : -1;
    } else if (ax >= az) {
      axis = 0;
      sign = d.x >= 0 ? 1 : -1;
    } else {
      axis = 2;
      sign = d.z >= 0 ? 1 : -1;
    }
    const pos: Vec3 = { x: 0, y: 0, z: 0 };
    pos[AXIS[axis]!] = sign * h[AXIS[axis]!];
    if (axis !== 0) pos.x = clamp(d.x * 0.12, -h.x * 0.28, h.x * 0.28);
    if (axis !== 1) pos.y = clamp(d.y * 0.12, -h.y * 0.28, h.y * 0.28);
    if (axis !== 2) pos.z = clamp(d.z * 0.12, -h.z * 0.22, h.z * 0.22);
    out.push({
      to: n.id,
      pos,
      halfW: axis === 2 ? 1.7 : 1.65,
      halfH: axis === 2 ? 1.7 : 1.55,
      axis,
      sign,
    });
  }
  return out;
}

function inKeepout(p: Vec3, doors: RoomDoor[]): boolean {
  if (Math.hypot(p.x, p.y, p.z) < 2.5) return true;
  for (const d of doors) {
    if (distPointSeg(p, { x: 0, y: 0, z: 0 }, d.pos) < 2.35) return true;
    if (dist3(p, d.pos) < 2.6) return true;
  }
  return false;
}

function distPointSeg(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  if (len2 < 0.0001) return dist3(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

function overlaps(a: { pos: Vec3; size: Vec3 }, b: { pos: Vec3; size: Vec3 }): boolean {
  return (
    Math.abs(a.pos.x - b.pos.x) < (a.size.x + b.size.x) * 0.5 + 0.4 &&
    Math.abs(a.pos.y - b.pos.y) < (a.size.y + b.size.y) * 0.5 + 0.4 &&
    Math.abs(a.pos.z - b.pos.z) < (a.size.z + b.size.z) * 0.5 + 0.4
  );
}

function obstacleHitsKeepout(o: { pos: Vec3; size: Vec3 }, doors: RoomDoor[]): boolean {
  const hx = o.size.x * 0.5;
  const hy = o.size.y * 0.5;
  const hz = o.size.z * 0.5;
  const samples: Vec3[] = [o.pos];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    samples.push({ x: o.pos.x + sx * hx, y: o.pos.y + sy * hy, z: o.pos.z + sz * hz });
  }
  return samples.some((p) => inKeepout(p, doors));
}

export function furnishVolume(vol: Volume, rng: Rng): void {
  for (const n of vol.nodes) furnishRoom(vol, n, rng);
}

function furnishRoom(vol: Volume, n: VolumeNode, rng: Rng): void {
  n.obstacles = [];
  if (!n.label) return;
  const h = half(n);
  const doors = doorsOf(vol, n);
  const kinds: ObstacleKind[] =
    n.role === 'wreck' ? ['crate', 'crate', 'beam', 'grate']
    : n.role === 'hazard' ? ['tank', 'pipe', 'beam', 'column']
    : n.role === 'charge' ? ['tank', 'pipe', 'column']
    : n.role === 'fork' ? ['column', 'beam', 'pipe', 'grate']
    : n.role === 'cache' ? ['crate']
    : ['pipe', 'crate', 'beam', 'column', 'grate'];

  const want = n.role === 'cache' ? 2 : n.role === 'entry' ? 5 : 6 + Math.floor(rng.next() * 3);
  let guard = 0;
  while (n.obstacles.length < want && guard++ < 48) {
    const kind = rng.pick(kinds);
    const o = makeObstacle(kind, h, rng);
    if (obstacleHitsKeepout(o, doors)) continue;
    if (n.obstacles.some((x) => overlaps(x, o))) continue;
    n.obstacles.push(o);
  }

  const ceilPipe: Omit<RoomObstacle, 'id'> = {
    kind: 'pipe',
    pos: { x: 0, y: h.y * 0.18, z: -h.z + 0.7 },
    size: { x: Math.max(4, n.size.x * 0.72), y: 0.7, z: 0.55 },
  };
  if (!obstacleHitsKeepout(ceilPipe, doors) && !n.obstacles.some((x) => overlaps(x, ceilPipe))) {
    n.obstacles.push({ id: '', ...ceilPipe });
  }

  // id 最后统一发：全息屏和摄像头实景按它认同一个箱子，所以顺序必须稳定
  n.obstacles.forEach((o, i) => {
    o.id = `${n.id}.o${i}`;
  });
}

function makeObstacle(kind: ObstacleKind, h: Vec3, rng: Rng): RoomObstacle {
  return { id: '', ...makeObstacleShape(kind, h, rng) };
}

function makeObstacleShape(kind: ObstacleKind, h: Vec3, rng: Rng): Omit<RoomObstacle, 'id'> {
  const wall = rng.pick([-1, 1] as const);
  switch (kind) {
    case 'pipe':
      return {
        kind,
        pos: { x: wall * (h.x - 0.9), y: rng.float(-h.y * 0.3, h.y * 0.3), z: -h.z + 1.1 },
        size: { x: 0.7, y: rng.float(3.5, 6), z: 0.6 },
      };
    case 'crate':
      return {
        kind,
        pos: {
          x: wall * (h.x - rng.float(1.4, 2.4)),
          y: rng.float(-h.y * 0.35, h.y * 0.35),
          z: h.z - rng.float(1.1, 1.8),
        },
        size: { x: rng.float(1.4, 2.2), y: rng.float(1.4, 2.2), z: rng.float(1.2, 2) },
      };
    case 'beam':
      return {
        kind,
        pos: { x: rng.float(-h.x * 0.2, h.x * 0.2), y: wall * (h.y * 0.22), z: -h.z + 0.85 },
        size: { x: rng.float(4, 7), y: 0.55, z: 0.5 },
      };
    case 'tank':
      return {
        kind,
        pos: {
          x: wall * (h.x - 1.8),
          y: rng.float(-h.y * 0.25, h.y * 0.25),
          z: h.z - 2.1,
        },
        size: { x: 1.8, y: 1.8, z: rng.float(2.4, 3.4) },
      };
    case 'column':
      return {
        kind,
        pos: {
          x: wall * (h.x - 1.5),
          y: rng.pick([-1, 1] as const) * (h.y - 1.5),
          z: 0,
        },
        size: { x: 1.1, y: 1.1, z: h.z * 1.7 },
      };
    case 'grate':
      return {
        kind,
        pos: { x: rng.float(-h.x * 0.25, h.x * 0.25), y: wall * (h.y * 0.28), z: h.z - 0.15 },
        size: { x: rng.float(3, 5.5), y: 2.4, z: 0.25 },
      };
  }
}

export function spawnInRoom(node: VolumeNode, from: RoomDoor | null): Vec3 {
  const h = half(node);
  if (!from) {
    return { x: 0, y: -h.y + POD_R + 0.8, z: 0 };
  }
  const p: Vec3 = { ...from.pos };
  const k = AXIS[from.axis]!;
  p[k] -= from.sign * (POD_R + 0.9);
  p.x = clamp(p.x, -h.x + POD_R + 0.2, h.x - POD_R - 0.2);
  p.y = clamp(p.y, -h.y + POD_R + 0.2, h.y - POD_R - 0.2);
  p.z = clamp(p.z, -h.z + POD_R + 0.2, h.z - POD_R - 0.2);
  return p;
}

function insideRoom(p: Vec3, node: VolumeNode, r: number): boolean {
  const h = half(node);
  return Math.abs(p.x) <= h.x - r && Math.abs(p.y) <= h.y - r && Math.abs(p.z) <= h.z - r;
}

function inObstacle(p: Vec3, o: { pos: Vec3; size: Vec3 }, r: number): boolean {
  return (
    Math.abs(p.x - o.pos.x) < o.size.x * 0.5 + r &&
    Math.abs(p.y - o.pos.y) < o.size.y * 0.5 + r &&
    Math.abs(p.z - o.pos.z) < o.size.z * 0.5 + r
  );
}

function inDoorOpening(p: Vec3, d: RoomDoor): boolean {
  const k = AXIS[d.axis]!;
  if (Math.abs(p[k] - d.pos[k]) > 1.35) return false;
  let u: number;
  let v: number;
  if (d.axis === 0) {
    u = p.y - d.pos.y;
    v = p.z - d.pos.z;
  } else if (d.axis === 1) {
    u = p.x - d.pos.x;
    v = p.z - d.pos.z;
  } else {
    u = p.x - d.pos.x;
    v = p.y - d.pos.y;
  }
  return Math.abs(u) <= d.halfW + 0.35 && Math.abs(v) <= d.halfH + 0.35;
}

export function traceCabin(
  vol: Volume,
  node: VolumeNode,
  from: Vec3,
  dir: Vec3,
  dist: number,
  ignoreObstacles = false,
): CabinHit {
  const doors = doorsOf(vol, node);
  const steps = Math.max(10, Math.ceil(dist / 0.22));
  let p = { ...from };
  for (let i = 1; i <= steps; i++) {
    const t = (dist * i) / steps;
    const q = add3(from, dir, t);
    if (!insideRoom(q, node, POD_R * 0.85)) {
      const door = doors.find((d) => inDoorOpening(q, d) || inDoorOpening(add3(q, dir, 0.4), d));
      if (door) return { kind: 'door', pos: q, t, to: door.to };
      return { kind: 'wall', pos: p, t: t - dist / steps };
    }
    if (!ignoreObstacles) {
      for (const o of node.obstacles) {
        if (inObstacle(q, o, POD_R * 0.75)) {
          return { kind: 'obstacle', pos: p, t: t - dist / steps, obstacle: o.kind as ObstacleKind };
        }
      }
    }
    p = q;
  }
  return { kind: 'free', pos: p, t: dist };
}

export function faceBearing(from: Vec3, to: Vec3): { heading: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dy);
  let heading = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (heading < 0) heading += 360;
  const pitch = horiz < 0.01 ? (dz >= 0 ? 90 : -90) : (Math.atan2(dz, horiz) * 180) / Math.PI;
  return { heading, pitch };
}
