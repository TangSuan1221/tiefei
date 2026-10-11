/**
 * Level two (-1 deck, living quarters detour). Single source of truth for every
 * coordinate shared by the simulation, the Three.js world and the checks.
 *
 * Metres. Three.js Y-up. +X east, +Z south, heading 0 faces -Z (north).
 * Pod centre cruises at y≈0 in 6 m corridors (floor −3 / ceiling +3).
 * Walls straddle space boundaries (WALL_T thick); doors cut the shared boundary.
 */

export type Vec3 = readonly [number, number, number];
export interface Aabb { readonly min: Vec3; readonly max: Vec3 }

export type SpaceKind = 'shaft' | 'corridor' | 'room' | 'hall' | 'alex' | 'slime';
export interface LivingSpace {
  readonly id: string;
  readonly name: string;
  readonly kind: SpaceKind;
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
  readonly floorY: number; readonly ceilY: number;
  /** Pod may drive here. Alex-side spaces are human scale and only rendered for probe footage. */
  readonly pod: boolean;
}

export const WALL_T = 0.6;

export const LIVING_SPACES: readonly LivingSpace[] = [
  { id: 'S',  name: '下行竖井',       kind: 'shaft',    minX: 0,   maxX: 14,  minZ: 0,   maxZ: 14,  floorY: -3, ceilY: 40, pod: true },
  { id: 'C1', name: '宿舍外廊',       kind: 'corridor', minX: 14,  maxX: 64,  minZ: 3,   maxZ: 12,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'R1', name: '洗衣储物间',     kind: 'room',     minX: 24,  maxX: 48,  minZ: -24, maxZ: 3,   floorY: -3, ceilY: 5,  pod: true },
  { id: 'R2', name: '机修间',         kind: 'room',     minX: 44,  maxX: 64,  minZ: 12,  maxZ: 34,  floorY: -3, ceilY: 5,  pod: true },
  { id: 'J1', name: '转向厅',         kind: 'room',     minX: 64,  maxX: 82,  minZ: -2,  maxZ: 16,  floorY: -3, ceilY: 5,  pod: true },
  { id: 'C2', name: '北廊',           kind: 'corridor', minX: 68,  maxX: 77,  minZ: -40, maxZ: -2,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'R3', name: '安保值班室',     kind: 'room',     minX: 58,  maxX: 86,  minZ: -66, maxZ: -40, floorY: -3, ceilY: 5,  pod: true },
  { id: 'C3', name: '东廊',           kind: 'corridor', minX: 82,  maxX: 120, minZ: 3,   maxZ: 12,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'R4', name: '压载物资库',     kind: 'room',     minX: 96,  maxX: 120, minZ: 12,  maxZ: 36,  floorY: -3, ceilY: 5,  pod: true },
  { id: 'G',  name: '防爆玻璃观察廊', kind: 'room',     minX: 120, maxX: 142, minZ: -8,  maxZ: 22,  floorY: -3, ceilY: 5,  pod: true },
  { id: 'C4', name: '阀门间连廊',     kind: 'corridor', minX: 126, maxX: 135, minZ: -18, maxZ: -8,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'V',  name: '管线阀门间',     kind: 'room',     minX: 114, maxX: 142, minZ: -40, maxZ: -18, floorY: -3, ceilY: 5,  pod: true },
  { id: 'C5', name: '南廊',           kind: 'corridor', minX: 124, maxX: 133, minZ: 22,  maxZ: 42,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'A',  name: '生活区中庭',     kind: 'hall',     minX: 110, maxX: 200, minZ: 42,  maxZ: 82,  floorY: -9, ceilY: 9,  pod: true },
  { id: 'C6', name: '管理处连廊',     kind: 'corridor', minX: 158, maxX: 166, minZ: 82,  maxZ: 86,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'R5', name: '住宿管理处',     kind: 'room',     minX: 150, maxX: 174, minZ: 86,  maxZ: 108, floorY: -3, ceilY: 5,  pod: true },
  { id: 'C7', name: '下行井连廊',     kind: 'corridor', minX: 106, maxX: 110, minZ: 64,  maxZ: 72,  floorY: -3, ceilY: 3,  pod: true },
  { id: 'D',  name: '下行井',         kind: 'shaft',    minX: 90,  maxX: 106, minZ: 60,  maxZ: 76,  floorY: -60, ceilY: 3, pod: true },
  // Alex side: flooded human-scale quarters. Rendered for probe footage only.
  { id: 'L',  name: '生活区前厅',     kind: 'alex',     minX: 142, maxX: 164, minZ: -40, maxZ: 42,  floorY: -3, ceilY: 0.6, pod: false },
  { id: 'M',  name: '污染走廊',       kind: 'slime',    minX: 164, maxX: 176, minZ: -40, maxZ: 42,  floorY: -3, ceilY: 0.6, pod: false },
  { id: 'N',  name: '内侧宿舍区',     kind: 'alex',     minX: 176, maxX: 202, minZ: -40, maxZ: 42,  floorY: -3, ceilY: 0.6, pod: false },
];

export type DoorKind = 'open' | 'glass' | 'gate' | 'pipe' | 'alex';
export interface LivingDoor {
  readonly id: string;
  readonly kind: DoorKind;
  readonly a: string; readonly b: string;
  /** Boundary axis: 'x' = wall at constant x, opening spans z0..z1; 'z' = wall at constant z, spans x0..x1. */
  readonly axis: 'x' | 'z';
  readonly at: number;
  readonly from: number; readonly to: number;
  readonly bottom: number; readonly top: number;
}

/** Pod doorways: ≥6 m wide (corridor-width where the corridor meets a room), 5.5 m clear height from the corridor floor. */
export const LIVING_DOORS: readonly LivingDoor[] = [
  { id: 'S-C1',  kind: 'open',  a: 'S',  b: 'C1', axis: 'x', at: 14,  from: 3.6,  to: 11.4, bottom: -3, top: 2.5 },
  { id: 'C1-R1', kind: 'open',  a: 'C1', b: 'R1', axis: 'z', at: 3,   from: 32,   to: 40,   bottom: -3, top: 2.5 },
  { id: 'C1-R2', kind: 'open',  a: 'C1', b: 'R2', axis: 'z', at: 12,  from: 49,   to: 57,   bottom: -3, top: 2.5 },
  { id: 'C1-J1', kind: 'open',  a: 'C1', b: 'J1', axis: 'x', at: 64,  from: 3.3,  to: 11.7, bottom: -3, top: 2.5 },
  { id: 'J1-C2', kind: 'open',  a: 'J1', b: 'C2', axis: 'z', at: -2,  from: 68.3, to: 76.7, bottom: -3, top: 2.5 },
  { id: 'C2-R3', kind: 'open',  a: 'C2', b: 'R3', axis: 'z', at: -40, from: 68.3, to: 76.7, bottom: -3, top: 2.5 },
  { id: 'J1-C3', kind: 'open',  a: 'J1', b: 'C3', axis: 'x', at: 82,  from: 3.3,  to: 11.7, bottom: -3, top: 2.5 },
  { id: 'C3-R4', kind: 'open',  a: 'C3', b: 'R4', axis: 'z', at: 12,  from: 103,  to: 111,  bottom: -3, top: 2.5 },
  { id: 'C3-G',  kind: 'open',  a: 'C3', b: 'G',  axis: 'x', at: 120, from: 3.3,  to: 11.7, bottom: -3, top: 2.5 },
  { id: 'G-C4',  kind: 'open',  a: 'G',  b: 'C4', axis: 'z', at: -8,  from: 126.3,to: 134.7,bottom: -3, top: 2.5 },
  { id: 'C4-V',  kind: 'open',  a: 'C4', b: 'V',  axis: 'z', at: -18, from: 126.3,to: 134.7,bottom: -3, top: 2.5 },
  { id: 'G-C5',  kind: 'open',  a: 'G',  b: 'C5', axis: 'z', at: 22,  from: 124.3,to: 132.7,bottom: -3, top: 2.5 },
  { id: 'C5-A',  kind: 'open',  a: 'C5', b: 'A',  axis: 'z', at: 42,  from: 124.3,to: 132.7,bottom: -3, top: 2.5 },
  { id: 'A-C6',  kind: 'open',  a: 'A',  b: 'C6', axis: 'z', at: 82,  from: 158.3,to: 165.7,bottom: -3, top: 2.5 },
  { id: 'C6-R5', kind: 'open',  a: 'C6', b: 'R5', axis: 'z', at: 86,  from: 158.3,to: 165.7,bottom: -3, top: 2.5 },
  { id: 'A-C7',  kind: 'open',  a: 'A',  b: 'C7', axis: 'x', at: 110, from: 64.3, to: 71.7, bottom: -3, top: 2.5 },
  { id: 'C7-D',  kind: 'open',  a: 'C7', b: 'D',  axis: 'x', at: 106, from: 64.3, to: 71.7, bottom: -3, top: 2.5 },
  // Barriers between the pod and Alex. Closed glass blocks pod; pipe is a 0.7 m transfer tube.
  { id: 'G-L-glass', kind: 'glass', a: 'G', b: 'L', axis: 'x', at: 142, from: 0,   to: 12,  bottom: -3, top: 2 },
  { id: 'G-L-pipe',  kind: 'pipe',  a: 'G', b: 'L', axis: 'x', at: 142, from: 16.6,to: 17.4,bottom: -0.4, top: 0.4 },
  { id: 'A-N-gate',  kind: 'gate',  a: 'A', b: 'N', axis: 'z', at: 42,  from: 184, to: 192, bottom: -3, top: 0.6 },
  // Alex-side human doors.
  { id: 'L-M', kind: 'alex', a: 'L', b: 'M', axis: 'x', at: 164, from: -10, to: -6, bottom: -3, top: 0.4 },
  { id: 'M-N', kind: 'alex', a: 'M', b: 'N', axis: 'x', at: 176, from: -10, to: -6, bottom: -3, top: 0.4 },
];

/** Spawn at the top of the drop shaft, facing east toward the corridor. */
export const LIVING_SPAWN = { position: [7, 30, 7] as Vec3, heading: 90 };

export type ItemKind = 'box' | 'terminal' | 'photo' | 'pipe' | 'uplink';
export interface LivingItem {
  readonly id: string;
  readonly kind: ItemKind;
  readonly space: string;
  readonly name: string;
  readonly position: Vec3;
  /** Direction the operable face points, as a heading (deg). Pod parks facing heading+180. */
  readonly face: number;
  readonly required: boolean;
}

/**
 * Box items sit on racks at y≈-0.6 so the arm reaches them from a pod parked ≤3.0 m away at y≈0.
 * Terminals are wall faces; the pod must be ≤3.4 m and facing them.
 */
export const LIVING_ITEMS: readonly LivingItem[] = [
  { id: 'living.box.battery', kind: 'box',      space: 'R1', name: '应急电池箱',     position: [29, -0.6, -20.5], face: 180, required: false },
  { id: 'living.box.tools',   kind: 'box',      space: 'R2', name: '液压维修工具箱', position: [59.5, -0.6, 30.5], face: 0,   required: false },
  { id: 'living.box.probe',   kind: 'box',      space: 'R3', name: '有缆摄像探头箱', position: [76, -1.2, -61.5], face: 180, required: true },
  { id: 'living.box.ballast', kind: 'box',      space: 'R4', name: '压载配重块',     position: [115.5, -0.6, 32.5], face: 270, required: true },
  { id: 'living.pipe.intake', kind: 'pipe',     space: 'G',  name: '传递管道入口',   position: [141.4, 0, 17],    face: 270, required: true },
  { id: 'living.valve.heat',  kind: 'terminal', space: 'V',  name: '阀门 V-1 疗养区供热回路', position: [141.4, 0, -36], face: 270, required: false },
  { id: 'living.valve.feed',  kind: 'terminal', space: 'V',  name: '阀门 V-2 疗养区营养液管', position: [141.4, 0, -29], face: 270, required: true },
  { id: 'living.valve.cool',  kind: 'terminal', space: 'V',  name: '阀门 V-3 冷却水回流',     position: [141.4, 0, -22], face: 270, required: false },
  { id: 'living.photo.code',  kind: 'box',    space: 'R5', name: '管理员遗体 · 搜索衣袋证件夹',   position: [167.15, -2.05, 104.6], face: 0, required: true },
  { id: 'living.photo.guide', kind: 'photo',    space: 'R5', name: '墙面应急开闸步骤图',     position: [173.4, 0, 96],   face: 270, required: true },
  { id: 'living.photo.delroy',kind: 'photo',    space: 'R5', name: '员工治疗申请单 · 坎贝尔', position: [150.6, 0, 92],  face: 90,  required: false },
  { id: 'living.uplink.gate', kind: 'uplink',   space: 'A',  name: '闸门 F 外侧观察窗',     position: [188, -1.2, 42.6], face: 180, required: true },
];

/** Photo stations: where a parked pod sees each key target at 6–12 m (MET-007). */
export const LIVING_PHOTO_STATIONS = {
  probeCorpse: { position: [72, 0, -52] as Vec3, heading: 23, target: [76, -1.2, -61.5] as Vec3 },
  valves:      { position: [130, 0, -29] as Vec3, heading: 90,  target: [141.4, 0, -29] as Vec3 },
  code:        { position: [162, 0, 96] as Vec3,  heading: 150, target: [167, -2.2, 104] as Vec3 },
  guide:       { position: [164, 0, 96] as Vec3,  heading: 90,  target: [173.4, 0, 96] as Vec3 },
  gate:        { position: [188, -1.2, 52] as Vec3, heading: 0, target: [188, -1.2, 42.6] as Vec3 },
};

/** Glass blast door: where Alex stands on the far side, visible through glass. */
export const ALEX_MARKS = {
  glass: [145.5, -2.1, 6] as Vec3,
  pipeOut: [143.2, -2.1, 17] as Vec3,
  slimeEdge: [162.5, -2.1, -8] as Vec3,
  cocoon: [170, -2.4, -14] as Vec3,
  gateInner: [188, -2.1, 39.5] as Vec3,
  /** Where Alex swims out to meet the pod once the gate opens. */
  meet: [188, -1.2, 47] as Vec3,
};

export type CreatureType = 'lumen' | 'shade' | 'blind' | 'swarm';
/**
 * lumen  = A, light-seeking: Panacea-changed resident. Drifts toward the pod lamp; clings (well-meant "rescue").
 * shade  = B, light-averse native eel. Blocks doorways, recoils from sustained lamp, returns in darkness.
 * blind  = C, eyeless native hunter. Hears pulses, fast engine wash, valve clanks.
 * swarm  = D, ordinary fauna (glass fish / amphipods). Harmless; crowds the lamp and the lens.
 */
export interface CreatureSpawn {
  readonly id: string;
  readonly type: CreatureType;
  readonly space: string;
  readonly home: Vec3;
  /** Patrol loop / haunt points, all inside pod-walkable volume or the creature's own space. */
  readonly patrol: readonly Vec3[];
}

export const LIVING_CREATURES: readonly CreatureSpawn[] = [
  { id: 'swarm.c1',    type: 'swarm', space: 'C1', home: [42, 0, 7.5],   patrol: [[38, 0.5, 7], [46, -0.5, 8]] },
  { id: 'lumen.r1',    type: 'lumen', space: 'R1', home: [40, 4, -14],   patrol: [[40, 4, -14], [32, 4, -8], [44, 4, -20]] },
  { id: 'blind.r2',    type: 'blind', space: 'R2', home: [56, -2, 27],   patrol: [[56, -2, 27], [50, -2, 30], [60, -2, 20]] },
  { id: 'swarm.r3',    type: 'swarm', space: 'R3', home: [76, -1, -60],  patrol: [[76, -1, -60], [74, -0.5, -58]] },
  { id: 'shade.r4',    type: 'shade', space: 'R4', home: [107, -1, 14.5],patrol: [[107, -1, 14.5], [117, -2, 18]] },
  { id: 'lumen.g',     type: 'lumen', space: 'G',  home: [124, 3.5, -4], patrol: [[124, 3.5, -4], [136, 3.5, 4], [126, 3.5, 16]] },
  { id: 'blind.v',     type: 'blind', space: 'V',  home: [118, -2, -36], patrol: [[118, -2, -36], [124, -2, -22], [138, -2, -38]] },
  { id: 'lumen.a1',    type: 'lumen', space: 'A',  home: [140, 6, 52],   patrol: [[140, 6, 52], [160, 6, 60], [150, 6, 72]] },
  { id: 'lumen.a2',    type: 'lumen', space: 'A',  home: [178, 5, 56],   patrol: [[178, 5, 56], [192, 5, 70], [170, 5, 74]] },
  { id: 'blind.a1',    type: 'blind', space: 'A',  home: [120, -6, 74],  patrol: [[120, -6, 74], [140, -6, 78], [170, -6, 76], [196, -6, 70], [170, -6, 66], [140, -6, 70]] },
  { id: 'blind.a2',    type: 'blind', space: 'A',  home: [186, -6, 70],  patrol: [[186, -6, 70], [196, -6, 50], [160, -6, 48], [130, -6, 56]] },
];

/** Practical emergency fixtures (independent of the pod lamp). */
export const LIVING_LIGHTS: readonly { position: Vec3; color: string; intensity: number; range: number }[] = [
  { position: [7, 20, 1], color: '#7fb6b0', intensity: 30, range: 16 },
  { position: [30, 2.5, 3.4], color: '#d8954d', intensity: 10, range: 9 },
  { position: [58, 2.5, 11.6], color: '#d8954d', intensity: 10, range: 9 },
  { position: [73, 4.5, 15.4], color: '#7fb6b0', intensity: 18, range: 14 },
  { position: [84, 4.5, -64], color: '#b0413b', intensity: 12, range: 12 },
  { position: [119, 4.5, 34], color: '#d8954d', intensity: 12, range: 12 },
  { position: [141, 4.5, -7], color: '#6aa4c4', intensity: 22, range: 16 },
  { position: [141, 4.5, -38], color: '#b0413b', intensity: 14, range: 14 },
  { position: [128.5, 2.5, 41], color: '#7fb6b0', intensity: 10, range: 10 },
  { position: [188, 0.4, 42.8], color: '#d07a2b', intensity: 16, range: 12 },
  { position: [155, 8, 62], color: '#596f80', intensity: 26, range: 30 },
  { position: [172, 4.5, 107], color: '#b0413b', intensity: 12, range: 12 },
  { position: [98, 2.5, 68], color: '#7fb6b0', intensity: 14, range: 14 },
];

/** Leaving the level: descend in shaft D below this y with ballast fitted and Alex met. */
export const LIVING_EXIT_Y = -34;
/** Without ballast the damaged trim tank cannot take the pod below this y in shaft D. */
export const LIVING_TRIM_FLOOR_Y = -8;

// ---------------------------------------------------------------- geometry

const box = (min: Vec3, max: Vec3): Aabb => ({ min, max });

export function livingSpace(id: string): LivingSpace {
  const s = LIVING_SPACES.find(v => v.id === id);
  if (!s) throw new Error(`unknown living space ${id}`);
  return s;
}

/** Walkable volumes for the pod hull samples (pod spaces + door throats). */
export function livingWalkable(): Aabb[] {
  const out: Aabb[] = [];
  for (const s of LIVING_SPACES) if (s.pod) out.push(box([s.minX, s.floorY, s.minZ], [s.maxX, s.ceilY, s.maxZ]));
  for (const d of LIVING_DOORS) {
    if (d.kind !== 'open') continue;
    const h = WALL_T / 2 + 0.05;
    out.push(d.axis === 'x'
      ? box([d.at - h, d.bottom, d.from], [d.at + h, d.top, d.to])
      : box([d.from, d.bottom, d.at - h], [d.to, d.top, d.at + h]));
  }
  return out;
}

interface Cut { from: number; to: number; bottom: number; top: number }

/** Split one wall strip around door cuts into solid boxes. */
function wallStrip(axis: 'x' | 'z', at: number, from: number, to: number, bottom: number, top: number, cuts: Cut[], out: Aabb[]) {
  const h = WALL_T / 2;
  const emit = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    out.push(axis === 'x' ? box([at - h, y0, a], [at + h, y1, b]) : box([a, y0, at - h], [b, y1, at + h]));
  };
  const sorted = cuts.filter(c => c.to > from && c.from < to).sort((p, q) => p.from - q.from);
  let cursor = from;
  for (const c of sorted) {
    const a = Math.max(from, c.from), b = Math.min(to, c.to);
    emit(cursor, a, bottom, top);
    emit(a, b, bottom, Math.min(top, c.bottom));
    emit(a, b, Math.max(bottom, c.top), top);
    cursor = Math.max(cursor, b);
  }
  emit(cursor, to, bottom, top);
}

/**
 * Solid wall, floor and ceiling slabs for every space. Glass, pipe and gate
 * openings stay solid for the pod; open doors are cut.
 */
export function livingSolids(): Aabb[] {
  const out: Aabb[] = [];
  const open = LIVING_DOORS.filter(d => d.kind === 'open');
  for (const s of LIVING_SPACES) {
    const cuts = (axis: 'x' | 'z', at: number) => open
      .filter(d => d.axis === axis && Math.abs(d.at - at) < 1e-6 && (d.a === s.id || d.b === s.id))
      .map(d => ({ from: d.from, to: d.to, bottom: d.bottom, top: d.top }));
    wallStrip('x', s.minX, s.minZ, s.maxZ, s.floorY, s.ceilY, cuts('x', s.minX), out);
    wallStrip('x', s.maxX, s.minZ, s.maxZ, s.floorY, s.ceilY, cuts('x', s.maxX), out);
    wallStrip('z', s.minZ, s.minX, s.maxX, s.floorY, s.ceilY, cuts('z', s.minZ), out);
    wallStrip('z', s.maxZ, s.minX, s.maxX, s.floorY, s.ceilY, cuts('z', s.maxZ), out);
    out.push(box([s.minX, s.floorY - 0.5, s.minZ], [s.maxX, s.floorY, s.maxZ]));
    out.push(box([s.minX, s.ceilY, s.minZ], [s.maxX, s.ceilY + 0.5, s.maxZ]));
  }
  return out;
}

/** Ordered main route for checks and the blind-play brief (pod centre waypoints). */
export const LIVING_MAIN_ROUTE: readonly Vec3[] = [
  [7, 0, 7], [24, 0, 7.5], [60, 0, 7.5], [73, 0, 7], [72.5, 0, -20], [72, 0, -52],
  [72.5, 0, -20], [73, 0, 7], [100, 0, 7.5], [107, 0, 7.5], [107, 0, 24], [107, 0, 7.5],
  [128, 0, 7], [137.5, 0, 17], [130.5, 0, 0], [130.5, 0, -13], [130, 0, -29], [130.5, 0, -13],
  [130.5, 0, 7], [128.5, 0, 30], [128.5, 0, 50], [145, -1, 62], [162, -1, 70], [162, 0, 84],
  [162, 0, 96], [162, 0, 84], [162, -1, 70], [176, -1, 60], [188, -1.2, 52], [170, -1, 66],
  [130, -1, 68], [108, 0, 68], [98, 0, 68], [98, -40, 68],
];
