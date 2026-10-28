import type {SupplyId} from './supplies';
/**
 * Level three (-2 deck, abyssal research facility, “术前检查”). Single source of
 * truth for every coordinate shared by the future simulation, world and checks.
 *
 * Metres. Three.js Y-up. +X east, +Z south, heading 0 faces -Z (north).
 * The pod's flooded channel is a clockwise inward spiral around the operating
 * dome at the origin. Only the pod's water is level geometry: Elias's corridor,
 * rooms and walk exist only in generated video (first frames come from authored
 * location plates), so nothing on his side is modelled or collision-checked.
 * Story: docs/level-03-abyssal-lab-design.md. Check: tools/abyssal-layout-check.ts.
 */

export type Vec3 = readonly [number, number, number];

/** Channel centreline: an Archimedean spiral, 26 m closer to the centre per turn. */
export const SPIRAL = { r0: 115, pitch: 26, phi0: Math.PI, end: 9.0 } as const;
export const spiralRadius = (t: number) => SPIRAL.r0 - SPIRAL.pitch * t / (2 * Math.PI);
/** World point on the spiral at parameter t (rad), shifted radially by `offset` (+ = outward). */
export function spiralPoint(t: number, offset = 0, y = 0): Vec3 {
  const r = spiralRadius(t) + offset, a = SPIRAL.phi0 + t;
  return [r * Math.cos(a), y, r * Math.sin(a)];
}
/** Heading (deg) of travel along the spiral at t: tangent of increasing t. */
export function spiralHeading(t: number): number {
  const a = SPIRAL.phi0 + t, r = spiralRadius(t), dr = -SPIRAL.pitch / (2 * Math.PI);
  const dx = dr * Math.cos(a) - r * Math.sin(a), dz = dr * Math.sin(a) + r * Math.cos(a);
  return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
}
/** Heading (deg) pointing from p toward q in the horizontal plane. */
export const headingTo = (p: Vec3, q: Vec3) => (Math.atan2(q[0] - p[0], -(q[2] - p[2])) * 180 / Math.PI + 360) % 360;

// ---------------------------------------------------------------- spaces

/** Segment of the spiral channel. Width = inner + outer (+ bump at its middle). Floor may slope. */
export interface Band { kind: 'band'; t0: number; t1: number; inner: number; outer: number; bump?: number; floor: readonly (readonly [number, number])[]; ceil: number; /** Sloping ceiling; overrides ceil. */ top?: readonly (readonly [number, number])[] }
/** Oriented box (side chambers, the throat into the dome). Heading = its long axis. */
export interface Obb { kind: 'obb'; centre: Vec3; heading: number; halfW: number; halfL: number; floor: number; ceil: number }
/** Vertical cylinder (shafts, the pit, the dome, turning bulbs). */
export interface Cyl { kind: 'cyl'; centre: Vec3; radius: number; floor: number; ceil: number }
export type Shape = Band | Obb | Cyl;

export interface AbyssSpace { id: string; name: string; shapes: Shape[] }

const flat = (y: number) => [[-1, y], [99, y]] as const;
const PIT_T = 4.82, LAB_T = [2.6, 2.8, 3.0, 3.2, 3.4] as const, THROAT_T = SPIRAL.end;
const throatPhi = SPIRAL.phi0 + THROAT_T, inward = (r: number, y = 0): Vec3 => [r * Math.cos(throatPhi), y, r * Math.sin(throatPhi)];
const chamber = (t: number): Obb => {
  const c = spiralPoint(t, 5 + 9 - 0.5);
  return { kind: 'obb', centre: c, heading: headingTo(spiralPoint(t), c), halfW: 5, halfL: 9.5, floor: -5, ceil: 5 };
};

export const PIT_CENTRE = spiralPoint(PIT_T);
/**
 * Containment pit: the level's showpiece. 68 m across, 70 m tall. The channel
 * enters at the rim (y 0); the way on is a drainage tunnel at the bottom, because
 * the upper exit across the pit is choked by a collapsed cell-handling crane.
 */
export const PIT = { centre: PIT_CENTRE, radius: 34, floor: -60, ceil: 10, wall: 33.4 } as const;
/** Containment-cell tiers lining the shaft wall (24 sealed lab cells each) and the special cell 07 at the bottom. */
export const CAGE_TIERS = [0, -12, -24, -36, -48] as const;
/** Angle (rad, world) from the pit centre: 0 = +X. */
const pitDir = (p: Vec3) => Math.atan2(p[2] - PIT_CENTRE[2], p[0] - PIT_CENTRE[0]);
export const pitAt = (angle: number, r: number, y: number): Vec3 => [PIT_CENTRE[0] + r * Math.cos(angle), y, PIT_CENTRE[2] + r * Math.sin(angle)];
/** Where the channel enters the pit, where the bottom tunnel leaves, and the dome-facing side. */
export const PIT_ENTRY_ANGLE = pitDir(spiralPoint(4.4));
export const PIT_EXIT_ANGLE = pitDir(spiralPoint(5.3));
export const PIT_DOME_ANGLE = Math.atan2(-PIT_CENTRE[2], -PIT_CENTRE[0]);
/** Stitched eels circle here (only visible on photos). */
export const EEL_ORBIT = { radius: 16, yTop: -12, yBottom: -32 } as const;
export const DOME = { centre: [0, 0, 0] as Vec3, radius: 32, inner: 27, floor: -12, balcony: 7, apex: 14 };
export const DRAIN = { centre: [inward(-12)[0], 0, inward(-12)[2]] as Vec3, radius: 6, top: -12, bottom: -70 };

export const ABYSS_SPACES: readonly AbyssSpace[] = [
  { id: 'S', name: '沉降井底', shapes: [
    { kind: 'cyl', centre: spiralPoint(0), radius: 7, floor: -5, ceil: 34 },
    { kind: 'band', t0: -0.02, t1: 0.36, inner: 5, outer: 5, floor: flat(-5), ceil: 5 },
  ] },
  { id: 'Q', name: '检疫泊位', shapes: [{ kind: 'band', t0: 0.3, t1: 1.2, inner: 5, outer: 5, bump: 12, floor: flat(-5), ceil: 5 }] },
  { id: 'G', name: '标本长廊', shapes: [{ kind: 'band', t0: 1.15, t1: 2.45, inner: 5, outer: 5, floor: flat(-5), ceil: 5 }] },
  { id: 'L', name: '研究实验室', shapes: [
    { kind: 'band', t0: 2.4, t1: 3.65, inner: 5, outer: 5, floor: flat(-5), ceil: 5 },
    ...LAB_T.map(chamber),
  ] },
  { id: 'K', name: '水闸弯道', shapes: [{ kind: 'band', t0: 3.6, t1: 4.5, inner: 5, outer: 5, floor: flat(-5), ceil: 5 }] },
  { id: 'C', name: '收容环', shapes: [
    { kind: 'cyl', centre: PIT_CENTRE, radius: PIT.radius, floor: PIT.floor, ceil: PIT.ceil },
    // Upper exit across the pit: a dead end choked by the collapsed crane (ABYSS_SOLIDS).
    { kind: 'band', t0: 5.05, t1: 5.32, inner: 5, outer: 5, floor: flat(-5), ceil: 5 },
  ] },
  { id: 'J', name: '坑底排水通道', shapes: [{ kind: 'band', t0: 5.1, t1: 5.95, inner: 5, outer: 5, floor: [[5.1, -60], [5.95, -16]], ceil: 5, top: [[5.1, -50], [5.95, -4]] }] },
  { id: 'P', name: '生产车间', shapes: [{ kind: 'band', t0: 5.9, t1: 7.65, inner: 8, outer: 8, floor: [[5.9, -16], [7.3, -16], [7.65, -5]], ceil: 5 }] },
  { id: 'R', name: '术前准备室弯道', shapes: [
    { kind: 'band', t0: 7.6, t1: THROAT_T + 0.06, inner: 4, outer: 4, floor: flat(-4), ceil: 4 },
    { kind: 'cyl', centre: spiralPoint(THROAT_T), radius: 7, floor: -4, ceil: 4 },
    { kind: 'obb', centre: inward((spiralRadius(THROAT_T) + 29) / 2), heading: headingTo(spiralPoint(THROAT_T), [0, 0, 0]), halfW: 4, halfL: (spiralRadius(THROAT_T) - 29) / 2, floor: -4, ceil: 4 },
  ] },
  { id: 'O', name: '手术室', shapes: [
    { kind: 'cyl', centre: DOME.centre, radius: DOME.radius, floor: DOME.floor, ceil: DOME.balcony },
    { kind: 'cyl', centre: DOME.centre, radius: DOME.inner, floor: DOME.floor, ceil: DOME.apex },
  ] },
  { id: 'D', name: '排水竖井', shapes: [{ kind: 'cyl', centre: DRAIN.centre, radius: DRAIN.radius, floor: DRAIN.bottom, ceil: DRAIN.top + 0.5 }] },
];

/** Solid set pieces that stay in the structural channel (MET-042): photo subjects and the table. */
export interface SolidCyl { id: string; centre: Vec3; radius: number; floor: number; ceil: number }
export interface SolidBox { id: string; min: Vec3; max: Vec3 }
/** Culture tanks: one row of eight along the trench's outer wall, 5 m apart, numbered along the travel direction. */
export const TANK_T = Array.from({ length: 8 }, (_, i) => 6.38 + i * 5 / 89);
export const ABYSS_TANKS: readonly SolidCyl[] = TANK_T.map((t, i) => ({ id: `tank.${i + 1}`, centre: spiralPoint(t, 6.3, 0), radius: 1.5, floor: -16, ceil: -3 }));
/** Tanks the jellyfish crowd onto (tape 6 / photo P02). */
export const JELLY_TANKS = [2, 3, 6] as const;
export const ABYSS_TABLE: SolidBox = { id: 'table', min: [-1.3, DOME.floor, -3.2], max: [1.3, -8, 3.2] };
/** Structural set pieces in the pit (MET-042: they block the hull and are photo subjects). */
export const ABYSS_SOLIDS: readonly SolidCyl[] = [
  { id: 'crane', centre: spiralPoint(5.26), radius: 6, floor: -5, ceil: 5 },
  { id: 'trough', centre: [PIT_CENTRE[0], 0, PIT_CENTRE[2]], radius: 8, floor: PIT.floor, ceil: -57 },
];
/** Cell 07: the largest sealed lab cell, bottom tier, observation glass and hatch burst outward from inside. */
export const CAGE_07 = { angle: PIT_DOME_ANGLE + Math.PI * 0.55, y: -55, width: 8, height: 8 } as const;

/** Doors and machines with state. A closed one fills its rectangle; open ones are absent. */
export interface AbyssGate { id: string; name: string; t: number; halfW: number; floor: number; ceil: number; operatedBy: string; closedAtStart: boolean }
export const ABYSS_GATES: readonly AbyssGate[] = [
  { id: 'sluice', name: '实验室水闸', t: 3.75, halfW: 5, floor: -5, ceil: 5, operatedBy: '艾里亚斯（插入钥匙箱里的钥匙后从控制室开启）', closedAtStart: true },
  { id: 'press', name: '冲压机（两台交替，每10秒同时抬起3秒）', t: 7.25, halfW: 8, floor: -14, ceil: 5, operatedBy: '自动循环；按第6卷节奏通过', closedAtStart: false },
];
/** Drain grate over shaft D: opens when Elias turns the valve under the table (tape 10). */
export const ABYSS_DRAIN_GRATE = { centre: DRAIN.centre, radius: DRAIN.radius, y: DRAIN.top } as const;

// ---------------------------------------------------------------- spawn, route, exit

/** Spawn at the top of the settling shaft (continuation of level-2 shaft D), facing up-spiral. */
export const ABYSS_SPAWN = { position: [spiralPoint(0)[0], 30, spiralPoint(0)[2]] as Vec3, heading: spiralHeading(0) };
/** Leaving the level: below this y inside the drain shaft with the quota met. */
export const ABYSS_EXIT_Y = -40;

// ---------------------------------------------------------------- items, windows, photo stations

export type ItemKind = 'box' | 'hatch';
export interface AbyssItem { id: string; kind: ItemKind; space: string; name: string; position: Vec3; /** Face normal heading; the pod parks facing heading+180. */ face: number; required: boolean; supplies?: readonly (readonly [SupplyId,number])[] }

const qWall = (dt: number, y: number): Vec3 => spiralPoint(0.75 + dt, 5 + 12 - 0.6, y);
const outwardAt = (t: number) => headingTo(spiralPoint(t), spiralPoint(t, 10));
const chamber3End = (): Vec3 => { const c = chamber(3.0); const h = c.heading * Math.PI / 180; return [c.centre[0] + Math.sin(h) * (c.halfL - 0.6), -1.2, c.centre[2] - Math.cos(h) * (c.halfL - 0.6)]; };

export const ABYSS_ITEMS: readonly AbyssItem[] = [
  { id:'abyss.box.serviceQ',kind:'box',space:'Q',name:'维护补给箱 · 电池×2 / 滤芯 / 氧烛',position:qWall(-.07,-1.2),face:(outwardAt(.68)+180)%360,required:false,supplies:[['sup.cell',2],['sup.filter',1],['sup.o2candle',1]] },
  { id:'abyss.box.serviceL',kind:'box',space:'L',name:'维护补给箱 · 电池×2',position:spiralPoint(2.5,4.4,-1.2),face:(outwardAt(2.5)+180)%360,required:false,supplies:[['sup.cell',2]] },
  { id:'abyss.box.serviceC',kind:'box',space:'C',name:'维护补给箱 · 电池×2 / 滤芯 / 氧烛',position:pitAt(PIT_DOME_ANGLE-1.4,33,-24.6),face:headingTo(pitAt(PIT_DOME_ANGLE-1.4,33,0),[PIT_CENTRE[0],0,PIT_CENTRE[2]]),required:false,supplies:[['sup.cell',2],['sup.filter',1],['sup.o2candle',1]] },
  { id:'abyss.box.serviceP',kind:'box',space:'P',name:'维护补给箱 · 电池×2 / 滤芯',position:spiralPoint(7.36,7.4,-6.2),face:(outwardAt(7.36)+180)%360,required:false,supplies:[['sup.cell',2],['sup.filter',1]] },
  { id:'abyss.box.serviceR',kind:'box',space:'R',name:'维护补给箱 · 电池×1',position:spiralPoint(8.48,3.4,-1.2),face:(outwardAt(8.48)+180)%360,required:false,supplies:[['sup.cell',1]] },
  { id: 'abyss.box.med1', kind: 'box', space: 'Q', name: '医疗箱（宁神剂）· 北侧货架', position: qWall(-0.03, -1.2), face: (outwardAt(0.72) + 180) % 360, required: true },
  { id: 'abyss.box.med2', kind: 'box', space: 'Q', name: '医疗箱（宁神剂）· 北侧货架', position: qWall(0, -1.2), face: (outwardAt(0.75) + 180) % 360, required: false },
  { id: 'abyss.box.med3', kind: 'box', space: 'Q', name: '医疗箱（宁神剂）· 北侧货架', position: qWall(0.03, -1.2), face: (outwardAt(0.78) + 180) % 360, required: false },
  { id: 'abyss.box.key', kind: 'box', space: 'L', name: '红色应急钥匙箱 · 3号实验舱', position: chamber3End(), face: (chamber(3.0).heading + 180) % 360, required: true },
  { id: 'abyss.hatch.pass', kind: 'hatch', space: 'L', name: '传递口（T3通话窗下方）', position: spiralPoint(3.12, -5 + 0.3, -1), face: outwardAt(3.12), required: true },
  { id: 'abyss.box.med6', kind: 'box', space: 'C', name: '医疗箱（宁神剂）· 收容环第三层敞开的收容舱里', position: pitAt(PIT_DOME_ANGLE - 1.2, 33, -24.6), face: (headingTo(pitAt(PIT_DOME_ANGLE - 1.2, 33, 0), [PIT_CENTRE[0], 0, PIT_CENTRE[2]])) % 360, required: false },
  { id: 'abyss.box.med4', kind: 'box', space: 'P', name: '医疗箱（宁神剂）· 车间沟尽头', position: spiralPoint(7.45, 8 - 0.6, -6.2), face: (outwardAt(7.45) + 180) % 360, required: false },
  { id: 'abyss.box.med5', kind: 'box', space: 'R', name: '医疗箱（宁神剂）· 准备室弯道', position: spiralPoint(8.55, 4 - 0.6, -1.2), face: (outwardAt(8.55) + 180) % 360, required: false },
];

/**
 * Call windows: a lit pressure window in the pod's wall. Behind the glass is a static
 * backdrop of Elias's side (no walkable space). `elias` is where he appears in that
 * backdrop. Calls work while the pod is within `radius` of `pod` (no arm, no F).
 */
export interface CallWindow { id: string; name: string; space: string; window: Vec3; pod: Vec3; podHeading: number; elias: Vec3; radius: number; tapes: string }
const win = (id: string, name: string, space: string, t: number, inner: number, tapes: string, y = 0): CallWindow => {
  const w = spiralPoint(t, -inner, y + 0.5), p = spiralPoint(t, -inner + 5, y);
  return { id, name, space, window: w, pod: p, podHeading: headingTo(p, w), elias: spiralPoint(t, -inner - 2.75, y - 0.5), radius: 8, tapes };
};
const domeAt = (r: number, dPhi: number, y: number): Vec3 => [r * Math.cos(throatPhi + dPhi), y, r * Math.sin(throatPhi + dPhi)];

export const ABYSS_WINDOWS: readonly CallWindow[] = [
  win('T1', '检疫更衣室', 'Q', 0.75, 5, '第1、2卷'),
  win('T2', '标本库', 'G', 1.8, 5, '闲聊'),
  win('T3', '实验室走廊', 'L', 3.05, 5, '第3卷'),
  { id: 'T4', name: '收容环监控室（坑缘）', space: 'C', window: pitAt(PIT_DOME_ANGLE, PIT.radius, 4.5), pod: pitAt(PIT_DOME_ANGLE, 28, 4), podHeading: headingTo(pitAt(PIT_DOME_ANGLE, 28, 4), pitAt(PIT_DOME_ANGLE, PIT.radius, 4)), elias: pitAt(PIT_DOME_ANGLE, PIT.radius + 2.75, 4), radius: 8, tapes: '第4、5卷' },
  win('T5', '车间控制室', 'P', 6.12, 8, '第6、7卷', -2),
  win('T6', '术前准备室', 'R', 8.3, 4, '第8卷（主动）'),
  { id: 'T7', name: '手术室环形挑台', space: 'O', window: domeAt(29.5, 0.35, 8.5), pod: domeAt(24, 0.35, 5), podHeading: headingTo(domeAt(24, 0.35, 5), domeAt(29.5, 0.35, 5)), elias: domeAt(29.5, 0.35, 8.5), radius: 10, tapes: '第9、10卷' },
  { id: 'T8', name: '排水竖井检修平台', space: 'D', window: [DRAIN.centre[0], -18, DRAIN.centre[2] - DRAIN.radius + 0.3], pod: [DRAIN.centre[0], -20, DRAIN.centre[2]], podHeading: 0, elias: [DRAIN.centre[0], -17.5, DRAIN.centre[2] - DRAIN.radius + 0.6], radius: 8, tapes: '第11卷' },
];

/** Where the pod parks and looks for each required photo (MET-006/007). */
export interface PhotoStation { id: string; shot: string; name: string; position: Vec3; heading: number; pitch: number; target: Vec3; note: string }
const station = (id: string, shot: string, name: string, position: Vec3, target: Vec3, note: string): PhotoStation => {
  const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2];
  return { id, shot, name, position, target, heading: headingTo(position, target), pitch: Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI, note };
};
const domeApex: Vec3 = [0, 11.5, 0];
export const ABYSS_PHOTO_STATIONS: readonly PhotoStation[] = [
  station('P01', 'L3-P01', '收容环：缝合鳗', pitAt(PIT_DOME_ANGLE + 0.2, 26, 2), pitAt(PIT_DOME_ANGLE + 0.2, EEL_ORBIT.radius, EEL_ORBIT.yTop), '监控室窗旁的坑缘，俯拍下方绕圈的缝合鳗（绕圈半径16米，深度-12到-32）'),
  station('P02', 'L3-P02', '生产车间：培养槽', spiralPoint(TANK_T[3], -5.2, -7), spiralPoint(TANK_T[3], 6.3, -7), '靠沟内侧停船，横着看外侧一排培养槽，2到6号都在画面里，槽号要能读'),
  station('P03', 'L3-P03', '手术室：穹顶顶上', domeAt(18, 0.9, 0), domeApex, '仰拍穹顶最高处倒挂的护理员（腿展开约14m）'),
  station('P05', 'L3-P05', '收容环坑底：07号收容舱（可选）', pitAt(CAGE_07.angle, 22, -52), pitAt(CAGE_07.angle, PIT.wall, CAGE_07.y), '坑底最大的收容舱，观察窗从里面往外爆开，铭牌上大字“07”'),
  station('P06', 'L3-P06', '收容环坑底：回收槽（可选）', pitAt(PIT_EXIT_ANGLE + 1.6, 20, -50), [PIT_CENTRE[0], -58, PIT_CENTRE[2]], '坑底正中的圆形回收槽，里面是挂着“不合格”牌子的尸体'),
  station('P04', 'L3-P04', '手术室：追来的护理员', [DRAIN.centre[0], -8, DRAIN.centre[2]], domeAt(20, Math.PI + 0.45, -6), '竖井口，护理员沿穹顶墙爬下，最后停在约10m外'),
];

// ---------------------------------------------------------------- routes

export interface RouteNode { at: Vec3; stage: string; note: string }

const along = (t0: number, t1: number, y: (t: number) => number = () => 0, step = 0.05, offset = 0): Vec3[] => {
  const out: Vec3[] = [], n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / step));
  for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; out.push(spiralPoint(t, offset, y(t))); }
  return out;
};
const lerp = (pts: readonly (readonly [number, number])[], t: number) => {
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, ya] = pts[i - 1], [b, yb] = pts[i]; return ya + (yb - ya) * (t - a) / (b - a); }
  return pts.at(-1)![1];
};
const plantY = (t: number) => lerp([[5.95, -11], [6.1, -9], [7.3, -9], [7.65, 0]], t);
const tunnelY = (t: number) => lerp([[5.1, -55], [5.95, -11]], t);
/** Descent around the pit wall: from the entry, the long way round (~1.3 turns) to the bottom tunnel. */
export function pitDescent(radius = 24, yFrom = 0, yTo = -55): Vec3[] {
  let sweep = PIT_EXIT_ANGLE - PIT_ENTRY_ANGLE;
  while (sweep < 2 * Math.PI) sweep += 2 * Math.PI;
  sweep -= 2 * Math.PI * 0.7;
  const n = Math.ceil(Math.abs(sweep) / 0.08), out: Vec3[] = [];
  for (let i = 0; i <= n; i++) out.push(pitAt(PIT_ENTRY_ANGLE + sweep * i / n, radius, yFrom + (yTo - yFrom) * i / n));
  return out;
}

/**
 * Pod main route (hull centre). A `reverse` leg backs out without turning, as the
 * pod does after taking the key box. Vertical legs keep the previous heading.
 */
export interface Leg { to: Vec3; reverse?: boolean }
export function podRoute(): Leg[] {
  const legs: Leg[] = [];
  const go = (pts: Vec3[], reverse = false) => pts.forEach(to => legs.push({ to, reverse }));
  const start = spiralPoint(0);
  go([[start[0], 0, start[2]]]);
  go(along(0, 0.75));
  // Medicine shelf on the outer crescent wall, then back to the centreline.
  const shelf = spiralPoint(0.75, 5 + 12 - 0.6 - 0.48 - 3.0);
  go([shelf]); go([spiralPoint(0.75)], true);
  go(along(0.75, 3.0).slice(1));
  // Into flooded chamber 3 for the key box, reverse out.
  const key = chamber3End(), c3 = chamber(3.0), h = c3.heading * Math.PI / 180;
  const park: Vec3 = [key[0] - Math.sin(h) * (0.48 + 2.9), 0, key[2] + Math.cos(h) * (0.48 + 2.9)];
  go([park]); go([spiralPoint(3.0)], true);
  // Pass hatch below T3: nose to the inner wall.
  go(along(3.0, 3.12).slice(1));
  const hatch = spiralPoint(3.12, -5 + 3.6);
  go([hatch]); go([spiralPoint(3.12)], true);
  go(along(3.12, 4.42).slice(1));
  // Containment pit: call at T4, photograph the eels, then descend the cell wall to the bottom tunnel.
  const t4 = ABYSS_WINDOWS[3], p01 = ABYSS_PHOTO_STATIONS[0];
  go([pitAt(PIT_ENTRY_ANGLE, 26, 0), pitAt((PIT_ENTRY_ANGLE + PIT_DOME_ANGLE) / 2, 24, 2), t4.pod, p01.position]);
  go([pitAt(PIT_ENTRY_ANGLE, 24, 0)]);
  go(pitDescent().slice(1));
  go(along(5.1, 5.95, tunnelY));
  go(along(5.95, 7.65, plantY).slice(1));
  go(along(7.65, THROAT_T).slice(1));
  go([inward(26, 0), [DRAIN.centre[0], 0, DRAIN.centre[2] + 0.01], [DRAIN.centre[0], ABYSS_EXIT_Y - 5, DRAIN.centre[2] + 0.01]]);
  return legs;
}

/**
 * Elias's walk, as story locations only. None of this is modelled: each location
 * is a first-frame plate for his videos (docs/level-03-reference-image-prompts.md).
 */
export const ELIAS_ROUTE: readonly RouteNode[] = [
  { at: spiralPoint(0.12, -7.75, -0.5), stage: 'descend', note: '楼梯底，拔掉线缆' },
  { at: ABYSS_WINDOWS[0].elias, stage: 'quarantine', note: 'T1 检疫更衣室（第1、2卷）' },
  { at: ABYSS_WINDOWS[1].elias, stage: 'quarantine', note: 'T2 标本库' },
  { at: ABYSS_WINDOWS[2].elias, stage: 'lab', note: 'T3 实验室走廊，接钥匙箱' },
  { at: spiralPoint(3.6, -7.75, -0.5), stage: 'lab', note: '实验室控制室，开水闸' },
  { at: pitAt(PIT_DOME_ANGLE, PIT.radius + 6, 4), stage: 'pit_arrive', note: '沿坑缘外侧走廊到监控室' },
  { at: ABYSS_WINDOWS[3].elias, stage: 'pit_arrive', note: 'T4 监控室（第4、5卷，身后门口出现腿）' },
  { at: spiralPoint(5.6, -12, -0.5), stage: 'pit_cross', note: '离开监控室，走人员楼梯下到车间' },
  { at: ABYSS_WINDOWS[4].elias, stage: 'plant_arrive', note: 'T5 车间控制室（第6、7卷，停电）' },
  { at: ABYSS_WINDOWS[5].elias, stage: 'prep', note: 'T6 术前准备室（第8卷）' },
  { at: ABYSS_WINDOWS[6].elias, stage: 'dome_look', note: 'T7 手术室观摩廊（第9卷）' },
  { at: [0, -8, 0], stage: 'dome_taken', note: '下到手术台（第10卷，从这里起他在水里）' },
  { at: ABYSS_WINDOWS[7].elias, stage: 'shaft', note: 'T8 竖井检修平台（第11卷）' },
];

/** The caretaker: video/photo-only until the dome. It never enters the pod's live view before tape 8. */
export const CARETAKER_ROUTE: readonly RouteNode[] = [
  { at: [ABYSS_WINDOWS[3].elias[0], 7, ABYSS_WINDOWS[3].elias[2]], stage: 'pit_arrive', note: '监控室门口上方，一条腿伸下来（只在第4卷里）' },
  { at: spiralPoint(5.6, -12, 3.5), stage: 'pit_cross', note: '沿人员区顶上的检修管廊往车间方向' },
  { at: [ABYSS_WINDOWS[4].elias[0], 2, ABYSS_WINDOWS[4].elias[2]], stage: 'plant_power', note: '车间控制室门外经过（第7卷，只有影子和声音）' },
  { at: spiralPoint(8.2, 0, 3.6), stage: 'prep', note: '从准备室弯道顶上爬过（罗温第一次拍到全貌）' },
  { at: domeApex, stage: 'dome_look', note: '倒挂在穹顶最高处（P03，照片晚了二十秒）' },
  { at: ABYSS_WINDOWS[6].elias, stage: 'dome_taken', note: '已经到了挑台/台边（按罗温的话不同）' },
  { at: [0, -6, 0], stage: 'dome_taken', note: '手术台：摘头盔、挂“合格”' },
  { at: domeAt(20, Math.PI + 0.45, -6), stage: 'shaft', note: '被抽水声引向潜艇，停在竖井口约10m外（P04）' },
];

/** Red rotating alarm beacons ringing the containment pit (emissive meshes; only a few real lights). */
export function alarmBeacons(): Vec3[] {
  const out: Vec3[] = [];
  for (const y of [6, -6, -18, -30, -42, -54]) for (let i = 0; i < 24; i++) {
    const a = (i + (y / 12) * 0.5) / 24 * 2 * Math.PI;
    out.push(pitAt(a, PIT.wall, y));
  }
  return out;
}

// ---------------------------------------------------------------- queries

function inShape(s: Shape, p: Vec3): boolean {
  const [x, y, z] = p;
  if (s.kind === 'cyl') return y >= s.floor && y <= s.ceil && Math.hypot(x - s.centre[0], z - s.centre[2]) <= s.radius;
  if (s.kind === 'obb') {
    if (y < s.floor || y > s.ceil) return false;
    const h = s.heading * Math.PI / 180, dx = x - s.centre[0], dz = z - s.centre[2];
    const along = dx * Math.sin(h) - dz * Math.cos(h), across = dx * Math.cos(h) + dz * Math.sin(h);
    return Math.abs(along) <= s.halfL && Math.abs(across) <= s.halfW;
  }
  const r = Math.hypot(x, z), base = Math.atan2(z, x) - SPIRAL.phi0;
  for (let k = -2; k <= 3; k++) {
    const t = base + 2 * Math.PI * k;
    if (t < s.t0 || t > s.t1) continue;
    const span = (t - s.t0) / (s.t1 - s.t0), outer = s.outer + (s.bump ?? 0) * Math.sin(Math.PI * span);
    const d = r - spiralRadius(t);
    if (d >= -s.inner && d <= outer && y >= lerp(s.floor, t) && y <= (s.top ? lerp(s.top, t) : s.ceil)) return true;
  }
  return false;
}

/** Pod-walkable water (structural channel only; MET-042 decor never enters this test). */
export function abyssWater(p: Vec3): boolean {
  return ABYSS_SPACES.some(s => s.shapes.some(sh => inShape(sh, p)));
}

/** Space id at a point, for triggers and the plan view. */
export function abyssSpaceAt(p: Vec3): string | null {
  return ABYSS_SPACES.find(s => s.shapes.some(sh => inShape(sh, p)))?.id ?? null;
}

