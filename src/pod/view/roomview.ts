/**
 * 这一间房的几何与投影 —— 全息屏和摄像头共用的唯一真相源。
 * ============================================================================
 * 设计约束（这是这个文件存在的全部理由）：
 *
 *   玩家在全息屏上看见「右前方两米有一只货箱」，
 *   转到摄像头打开探照灯，就必须在同一个方位上看见那只货箱。
 *
 * 保证这件事的办法不是「两边都照着描一遍」——那样早晚会漂。办法是两边都调
 * 这个文件：`buildRoom()` 从 `VolumeNode.size / obstacles` 和 `doorsOf()` 生成
 * 面片，`projectRoom()` 把它们投到屏上。全息屏拿去描线框，摄像头拿去打光，
 * 几何是同一份，方位就不可能对不上。
 *
 * 坐标系沿用 gen/interior.ts：房间中心是原点，+Y 是航向 0 的方向，+Z 朝下。
 */

import { clamp, clamp01 } from '@/core/util';
import { doorsOf, type ObstacleKind, type RoomDoor } from '../gen/interior';
import type { Vec3, Volume, VolumeNode } from '../gen/volume';

// ============================================================================
// 几何
// ============================================================================

export type SurfaceKind = 'wall' | 'floor' | 'ceiling' | 'door' | 'obstacle';

/** 一块面片。全息屏描它的边，摄像头给它打光 */
export interface RoomQuad {
  /** 全局唯一，供拾取与调试 */
  id: string;
  kind: SurfaceKind;
  /** kind === 'obstacle' 时有效 */
  obstacle?: ObstacleKind;
  obstacleId?: string;
  /** kind === 'door' 时有效：通向哪个节点 */
  to?: string;
  pts: Vec3[];
  normal: Vec3;
  center: Vec3;
  /** 面积（平方米）。用来决定贴图密度和噪点强度 */
  area: number;
}

export interface RoomGeometry {
  nodeId: string;
  label: string;
  half: Vec3;
  doors: RoomDoor[];
  quads: RoomQuad[];
  /** 这一间里可被机械手够到的东西，按 id 索引 */
  obstacles: readonly { id: string; kind: ObstacleKind; pos: Vec3; size: Vec3 }[];
}

const AXIS_KEY: readonly (keyof Vec3)[] = ['x', 'y', 'z'];

export function half(node: VolumeNode): Vec3 {
  return { x: node.size.x * 0.5, y: node.size.y * 0.5, z: node.size.z * 0.5 };
}

/**
 * 六面墙 + 每个障碍五面（底面看不见，不生成）。
 * 有门的那面墙会被切成四块，中间留出洞 —— 洞就是玩家要对准的开口。
 */
export function buildRoom(vol: Volume, node: VolumeNode): RoomGeometry {
  const h = half(node);
  const doors = doorsOf(vol, node);
  const quads: RoomQuad[] = [];

  const push = (
    id: string,
    kind: SurfaceKind,
    pts: Vec3[],
    extra?: Partial<RoomQuad>,
  ): void => {
    if (pts.length < 3) return;
    const center = centroid(pts);
    const n = quadNormal(pts);
    quads.push({ id, kind, pts, normal: n, center, area: quadArea(pts), ...extra });
  };

  const faces: [0 | 1 | 2, 1 | -1, SurfaceKind][] = [
    [0, 1, 'wall'],
    [0, -1, 'wall'],
    [1, 1, 'wall'],
    [1, -1, 'wall'],
    [2, 1, 'floor'],
    [2, -1, 'ceiling'],
  ];

  for (const [axis, sign, kind] of faces) {
    const full = wallCorners(h, axis, sign);
    const faceDoors = doors.filter((d) => d.axis === axis && d.sign === sign);
    const door = faceDoors[0];
    const tag = `${AXIS_KEY[axis]}${sign > 0 ? '+' : '-'}`;
    if (faceDoors.length > 1) {
      // Split the wall on every aperture edge. A single first-door ring leaves
      // the other simulation doors covered by a visible solid wall.
      const [u, v] = AXIS_KEY.filter((_, i) => i !== axis);
      const holes = faceDoors.map(d => ({ d, pts: doorFrame(d) }));
      const cuts = (key: keyof Vec3) => [...new Set([
        -h[key], h[key], ...holes.flatMap(hole => hole.pts.map(p => clamp(p[key], -h[key], h[key]))),
      ])].sort((a, b) => a - b);
      const us = cuts(u!); const vs = cuts(v!);
      for (let i = 1; i < us.length; i++) for (let j = 1; j < vs.length; j++) {
        const cu = (us[i - 1]! + us[i]!) / 2;
        const cv = (vs[j - 1]! + vs[j]!) / 2;
        if (holes.some(({ pts }) => cu > Math.min(...pts.map(p => p[u!])) && cu < Math.max(...pts.map(p => p[u!]))
          && cv > Math.min(...pts.map(p => p[v!])) && cv < Math.max(...pts.map(p => p[v!])))) continue;
        const point = (a: number, b: number): Vec3 => ({ ...full[0]!, [u!]: a, [v!]: b });
        push(`wall.${tag}.${i}.${j}`, kind, [point(us[i - 1]!, vs[j - 1]!), point(us[i]!, vs[j - 1]!),
          point(us[i]!, vs[j]!), point(us[i - 1]!, vs[j]!)]);
      }
      for (const { d, pts } of holes) push(`door.${d.to}`, 'door', pts, { to: d.to });
      continue;
    }
    if (!door) {
      push(`wall.${tag}`, kind, full);
      continue;
    }
    const hole = doorFrame(door);
    // 门洞四周的四块。顺序固定，方便调试时按 id 定位
    const ring = [
      [full[0]!, hole[0]!, hole[1]!, full[1]!],
      [full[1]!, hole[1]!, hole[2]!, full[2]!],
      [full[2]!, hole[2]!, hole[3]!, full[3]!],
      [full[3]!, hole[3]!, hole[0]!, full[0]!],
    ];
    ring.forEach((q, i) => push(`wall.${tag}.${i}`, kind, q));
    push(`door.${door.to}`, 'door', hole, { to: door.to });
  }

  for (const raw of node.obstacles) {
    const kind = (raw.kind as ObstacleKind) ?? 'crate';
    const o = { id: raw.id, kind, pos: raw.pos, size: raw.size };
    for (const [tag, pts] of boxFaces(o.pos, o.size)) {
      push(`obs.${o.id}.${tag}`, 'obstacle', pts, { obstacle: kind, obstacleId: o.id });
    }
  }

  return {
    nodeId: node.id,
    label: node.label,
    half: h,
    doors,
    quads,
    obstacles: node.obstacles.map((o) => ({
      id: o.id,
      kind: (o.kind as ObstacleKind) ?? 'crate',
      pos: o.pos,
      size: o.size,
    })),
  };
}

function wallCorners(h: Vec3, axis: 0 | 1 | 2, sign: 1 | -1): Vec3[] {
  if (axis === 0) {
    const x = sign * h.x;
    return [
      { x, y: -h.y, z: -h.z },
      { x, y: h.y, z: -h.z },
      { x, y: h.y, z: h.z },
      { x, y: -h.y, z: h.z },
    ];
  }
  if (axis === 1) {
    const y = sign * h.y;
    return [
      { x: -h.x, y, z: -h.z },
      { x: h.x, y, z: -h.z },
      { x: h.x, y, z: h.z },
      { x: -h.x, y, z: h.z },
    ];
  }
  const z = sign * h.z;
  return [
    { x: -h.x, y: -h.y, z },
    { x: h.x, y: -h.y, z },
    { x: h.x, y: h.y, z },
    { x: -h.x, y: h.y, z },
  ];
}

export function doorFrame(d: RoomDoor): Vec3[] {
  const p = d.pos;
  if (d.axis === 0) {
    return [
      { x: p.x, y: p.y - d.halfW, z: p.z - d.halfH },
      { x: p.x, y: p.y + d.halfW, z: p.z - d.halfH },
      { x: p.x, y: p.y + d.halfW, z: p.z + d.halfH },
      { x: p.x, y: p.y - d.halfW, z: p.z + d.halfH },
    ];
  }
  if (d.axis === 1) {
    return [
      { x: p.x - d.halfW, y: p.y, z: p.z - d.halfH },
      { x: p.x + d.halfW, y: p.y, z: p.z - d.halfH },
      { x: p.x + d.halfW, y: p.y, z: p.z + d.halfH },
      { x: p.x - d.halfW, y: p.y, z: p.z + d.halfH },
    ];
  }
  return [
    { x: p.x - d.halfW, y: p.y - d.halfH, z: p.z },
    { x: p.x + d.halfW, y: p.y - d.halfH, z: p.z },
    { x: p.x + d.halfW, y: p.y + d.halfH, z: p.z },
    { x: p.x - d.halfW, y: p.y + d.halfH, z: p.z },
  ];
}

/**
 * 盒子的六个面。
 *
 * 绕向必须让 `quadNormal()` 算出**朝盒外**的法线，否则 `projectRoom()` 的背面剔除
 * 会整个反过来：该挡住的面被丢掉，该丢掉的面留下。
 *
 * 底面不能省。吊在天花板下的管排和横梁，玩家从下面看要看的正是底面。
 */
function boxFaces(pos: Vec3, size: Vec3): [string, Vec3[]][] {
  const hx = size.x * 0.5;
  const hy = size.y * 0.5;
  const hz = size.z * 0.5;
  const P = (sx: number, sy: number, sz: number): Vec3 => ({
    x: pos.x + sx * hx,
    y: pos.y + sy * hy,
    z: pos.z + sz * hz,
  });
  return [
    ['top', [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)]],
    ['bottom', [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)]],
    ['x+', [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)]],
    ['x-', [P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1)]],
    ['y+', [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)]],
    ['y-', [P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), P(-1, -1, -1)]],
  ];
}

// ============================================================================
// 投影
// ============================================================================

/** 视点。yaw / pitch 用度，和 run.heading / run.pitch 同一套 */
export interface Eye {
  pos: Vec3;
  yaw: number;
  pitch: number;
}

export interface Viewport {
  cx: number;
  cy: number;
  /** 像素焦距。由 halfFov 换算：focal = (minEdge/2) / tan(halfFov) */
  focal: number;
}

export interface EyeBasis {
  pos: Vec3;
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
}

/** 世界上方是 -Z（房间坐标里 +Z 朝下），和 gen/interior.ts 一致 */
const WORLD_UP: Vec3 = { x: 0, y: 0, z: -1 };

export function basisOf(eye: Eye): EyeBasis {
  const h = (eye.yaw * Math.PI) / 180;
  const p = (eye.pitch * Math.PI) / 180;
  const c = Math.cos(p);
  const fwd: Vec3 = { x: Math.sin(h) * c, y: Math.cos(h) * c, z: Math.sin(p) };
  // 右手边必须是罗经的正方位：航向 000 时 +X 是 090，也就是屏幕右侧。
  // 声呐 PPI、faceBearing、panCamera 的正负全按这个约定，基向量反了整幅画面就镜像。
  let right = cross(WORLD_UP, fwd);
  if (Math.hypot(right.x, right.y, right.z) < 1e-4) right = { x: 1, y: 0, z: 0 };
  right = norm(right);
  const up = cross(fwd, right);
  return { pos: eye.pos, fwd, right, up };
}

/** 由竖直半视场角算像素焦距。zoom 越大视场越窄 */
export function focalFor(minEdge: number, halfFovRad: number): number {
  return (minEdge * 0.5) / Math.max(0.05, Math.tan(clamp(halfFovRad, 0.05, 1.4)));
}

export interface ProjPt {
  x: number;
  y: number;
  /** 沿视线方向的深度（米）。< NEAR 表示在镜头后面 */
  z: number;
  ok: boolean;
}

const NEAR = 0.16;

export function projectPoint(p: Vec3, b: EyeBasis, vp: Viewport): ProjPt {
  const rx = p.x - b.pos.x;
  const ry = p.y - b.pos.y;
  const rz = p.z - b.pos.z;
  const z = rx * b.fwd.x + ry * b.fwd.y + rz * b.fwd.z;
  // 容差不能省：clipQuadNear 切出来的顶点按构造正好落在 NEAR 上，但插值的舍入
  // 会让它掉到 NEAR 之下一个尾数，于是刚裁好的面片又被当成在镜头后面整块丢掉。
  if (z < NEAR - 1e-6) return { x: vp.cx, y: vp.cy, z, ok: false };
  const px = rx * b.right.x + ry * b.right.y + rz * b.right.z;
  const py = rx * b.up.x + ry * b.up.y + rz * b.up.z;
  return { x: vp.cx + (px / z) * vp.focal, y: vp.cy - (py / z) * vp.focal, z, ok: true };
}

export interface ProjQuad {
  src: RoomQuad;
  pts: ProjPt[];
  /** 面心到视点的距离（米），排序用 */
  depth: number;
  /** 面法线与视线的点积，负值代表正对着镜头 */
  facing: number;
  /** 面心相对视线方向的夹角（弧度）。准星判定用 */
  offAxis: number;
}

/**
 * 把整间房投出来，远的在前。
 *
 * 背面剔除按「面心在视点的哪一侧」判，不按法线朝向 —— 房间是从内侧看的盒子，
 * 墙的法线朝里朝外没有统一约定，靠位置判更稳。
 */
export function projectRoom(geo: RoomGeometry, eye: Eye, vp: Viewport): ProjQuad[] {
  const b = basisOf(eye);
  const out: ProjQuad[] = [];
  for (const raw of geo.quads) {
    // 先在世界里沿近裁面切，再投影。直接丢掉「有顶点在镜头后面」的整块面片会让
    // 横跨镜头的长管和脚下的地板整块消失 —— 屏幕上表现为管子是透明的。
    const q = clipQuadNear(raw, b);
    if (!q) continue;
    const pts = q.pts.map((p) => projectPoint(p, b, vp));
    if (pts.filter((p) => p.ok).length < 3) continue;
    const d = sub(q.center, b.pos);
    const depth = len(d);
    if (depth < 0.02) continue;
    const dot = (d.x * q.normal.x + d.y * q.normal.y + d.z * q.normal.z) / depth;
    // 障碍是实心盒：背对镜头的面剔掉。墙是从里面看，全留
    if (q.kind === 'obstacle' && dot > 0.02) continue;
    const ax = (d.x * b.fwd.x + d.y * b.fwd.y + d.z * b.fwd.z) / depth;
    out.push({ src: q, pts, depth, facing: dot, offAxis: Math.acos(clamp(ax, -1, 1)) });
  }
  out.sort((a, z) => z.depth - a.depth);
  return out;
}

/**
 * 沿近裁面把一块面片切干净。全在镜头前就原样返回（不分配），全在后面返回 null。
 *
 * 切出来的面片沿用原来的 `normal` —— 裁剪不改变面的朝向，重算只会在退化成细条时
 * 抖出噪声，进而让背面剔除闪烁。
 */
function clipQuadNear(q: RoomQuad, b: EyeBasis): RoomQuad | null {
  const d = q.pts.map(
    (p) => (p.x - b.pos.x) * b.fwd.x + (p.y - b.pos.y) * b.fwd.y + (p.z - b.pos.z) * b.fwd.z,
  );
  let front = 0;
  for (const v of d) if (v >= NEAR) front++;
  if (front === d.length) return q;
  if (front === 0) return null;

  const pts: Vec3[] = [];
  for (let i = 0; i < q.pts.length; i++) {
    const j = (i + 1) % q.pts.length;
    const a = d[i]!;
    const c = d[j]!;
    if (a >= NEAR) pts.push(q.pts[i]!);
    if (a >= NEAR !== c >= NEAR) {
      const t = (NEAR - a) / (c - a);
      const p = q.pts[i]!;
      const n = q.pts[j]!;
      pts.push({
        x: p.x + (n.x - p.x) * t,
        y: p.y + (n.y - p.y) * t,
        z: p.z + (n.z - p.z) * t,
      });
    }
  }
  if (pts.length < 3) return null;
  return { ...q, pts, center: centroid(pts), area: quadArea(pts) };
}

/** 屏上某点命中的最近一块面。机械手就靠它知道准星压在哪只箱子上 */
export function pickQuad(quads: readonly ProjQuad[], x: number, y: number): ProjQuad | null {
  let best: ProjQuad | null = null;
  for (const q of quads) {
    if (!pointInPoly(q.pts, x, y)) continue;
    if (!best || q.depth < best.depth) best = q;
  }
  return best;
}

function pointInPoly(pts: readonly ProjPt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const c = pts[j]!;
    if (!a.ok || !c.ok) return false;
    if (a.y > y !== c.y > y && x < ((c.x - a.x) * (y - a.y)) / (c.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// ============================================================================
// 打光
// ============================================================================

export interface LampSpec {
  /** 灯在世界里的位置。舱外探照灯 = 视点稍前下方 */
  pos: Vec3;
  dir: Vec3;
  /** 光锥半角（弧度） */
  cone: number;
  /** 强度 0..1 */
  power: number;
  /** 有效距离（米）。深海里灯打不远，这是这台设备的性格 */
  reach: number;
}

/**
 * 一块面收到多少光 0..1。
 *
 * 三项相乘：光锥内外、距离衰减、入射角。没有环境光 —— 这是一千米以下，
 * 灯照不到的地方就是真的黑，那是这个游戏的恐怖来源之一。
 */
export function litness(q: RoomQuad, lamp: LampSpec): number {
  return litnessAt(q, q.center, lamp);
}

/**
 * 逐顶点照明。一整块 16×14 米的地板只取面心采一次，光斑就不是斑了 ——
 * 低头看时面心可能整个落在光锥外，于是整块地板亮度为零，格栅和锈层一笔都不画。
 * 探照灯是这个游戏的核心动作，它照出来的必须是一个有形状的斑。
 */
export function litnessCorners(q: RoomQuad, lamp: LampSpec): number[] {
  return q.pts.map((p) => litnessAt(q, p, lamp));
}

/** 面 `q` 上任意一点收到多少光。法线取整块面的，只有位置项逐点算 */
export function litnessAt(q: RoomQuad, point: Vec3, lamp: LampSpec): number {
  const d = sub(point, lamp.pos);
  const dist = len(d);
  if (dist < 0.01) return lamp.power;
  const dir = { x: d.x / dist, y: d.y / dist, z: d.z / dist };

  const axis = dir.x * lamp.dir.x + dir.y * lamp.dir.y + dir.z * lamp.dir.z;
  const ang = Math.acos(clamp(axis, -1, 1));
  const cone = clamp01(1 - Math.max(0, ang - lamp.cone * 0.45) / Math.max(0.05, lamp.cone * 0.75));

  const fall = clamp01(1 - dist / lamp.reach);
  const atten = fall * fall;

  const inc = Math.abs(dir.x * q.normal.x + dir.y * q.normal.y + dir.z * q.normal.z);
  const lambert = 0.25 + 0.75 * inc;

  return clamp01(lamp.power * cone * atten * lambert);
}

// ============================================================================
// 机械手够得着的东西
// ============================================================================

export interface ReachableTarget {
  obstacleId: string;
  kind: ObstacleKind;
  /** 镜头射线命中的表面点，不是障碍中心。 */
  pos: Vec3;
  /** 视点到命中表面的距离（米） */
  dist: number;
  /** 到操作点的偏角；准星已落在箱面上时为 0（弧度）。 */
  offAxis: number;
}

/** 单位射线与实体外接盒的首次交点距离；碰撞、渲染共用同一份 pos/size。 */
function rayBoxDistance(origin: Vec3, dir: Vec3, box: { pos: Vec3; size: Vec3 }): number | null {
  let near = 0;
  let far = Infinity;
  for (const k of AXIS_KEY) {
    const lo = box.pos[k] - box.size[k] * 0.5;
    const hi = box.pos[k] + box.size[k] * 0.5;
    if (Math.abs(dir[k]) < 1e-9) {
      if (origin[k] < lo || origin[k] > hi) return null;
      continue;
    }
    const a = (lo - origin[k]) / dir[k];
    const z = (hi - origin[k]) / dir[k];
    near = Math.max(near, Math.min(a, z));
    far = Math.min(far, Math.max(a, z));
    if (near > far) return null;
  }
  return near;
}

/**
 * 机械手能够到、而且镜头看得见的目标。
 *
 * 先测光轴是否直接落在实体表面：贴箱时中心可能在视场外，但屏上仍是箱面。
 * 光轴没有命中时才沿箱心方向给出调整提示，并保留原有小角度翻找容差。
 * 两条路径都用表面距离、检查遮挡，不能隔着前排障碍抓后排货箱。
 */
export function reachableTargets(
  geo: RoomGeometry,
  eye: Eye,
  opts: { reach: number; halfFov: number; kinds?: readonly ObstacleKind[] },
): ReachableTarget[] {
  const b = basisOf(eye);
  const out: ReachableTarget[] = [];
  for (const o of geo.obstacles) {
    if (opts.kinds && !opts.kinds.includes(o.kind)) continue;
    let dir = b.fwd;
    let offAxis = 0;
    let dist = rayBoxDistance(b.pos, dir, o);
    if (dist === null) {
      const d = sub(o.pos, b.pos);
      const centerDist = len(d);
      if (centerDist < 1e-6) continue;
      dir = { x: d.x / centerDist, y: d.y / centerDist, z: d.z / centerDist };
      const ax = dir.x * b.fwd.x + dir.y * b.fwd.y + dir.z * b.fwd.z;
      offAxis = Math.acos(clamp(ax, -1, 1));
      if (offAxis > opts.halfFov) continue;
      dist = rayBoxDistance(b.pos, dir, o);
    }
    if (dist === null || dist < 1e-6 || dist > opts.reach) continue;
    const surfaceDist = dist;
    const blocked = geo.obstacles.some(other => {
      if (other.id === o.id) return false;
      const hit = rayBoxDistance(b.pos, dir, other);
      return hit !== null && hit < surfaceDist - 1e-6;
    });
    if (blocked) continue;
    const pos = {
      x: b.pos.x + dir.x * dist,
      y: b.pos.y + dir.y * dist,
      z: b.pos.z + dir.z * dist,
    };
    out.push({ obstacleId: o.id, kind: o.kind, pos, dist, offAxis });
  }
  out.sort((a, z) => a.offAxis - z.offAxis || a.dist - z.dist);
  return out;
}

// ============================================================================
// 小工具
// ============================================================================

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function len(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function norm(v: Vec3): Vec3 {
  const n = len(v) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

function centroid(pts: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = pts.length || 1;
  return { x: x / n, y: y / n, z: z / n };
}

function quadNormal(pts: readonly Vec3[]): Vec3 {
  const a = pts[0]!;
  const b = pts[1]!;
  const c = pts[2]!;
  return norm(cross(sub(b, a), sub(c, a)));
}

function quadArea(pts: readonly Vec3[]): number {
  if (pts.length < 3) return 0;
  const a = pts[0]!;
  let acc = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const t = cross(sub(pts[i]!, a), sub(pts[i + 1]!, a));
    acc += len(t) * 0.5;
  }
  return acc;
}
