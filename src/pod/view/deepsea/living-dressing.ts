import * as T from 'three';
import {Batcher, rng, type V3} from './living-build';
import type {LivingMaterials} from './living-materials';
import {Kit, bed, bench, chair, crtConsole, deadPlant, diningTable, dormDoor, gasCylinders, lockerRow, shelving, sofa, wheelchair, workbench} from './living-props';
import {ribMids, type ShellBuild} from './living-shells';
import {buildClutter} from './living-clutter';
import {LIVING_HANGERS, buildWreck, hang} from './living-wreck';

const PI = Math.PI;
/** Rotation that turns local +Z toward a wall's inward normal. */
const FACE = {W: PI / 2, E: -PI / 2, N: 0, S: PI} as const;

export interface DressingBuild {
  /** Floating linen: animated in the world update. */
  sheets: T.Mesh[];
  /** Static dressing solids (pod colliders). */
  solids: T.Box3[];
  /** Screens that flicker (security monitors). */
  screens: T.MeshStandardMaterial;
  update(time: number): void;
  dispose(): void;
}

export function buildDressing(m: LivingMaterials, shells: ShellBuild, root: T.Group): DressingBuild {
  const B = (id: string) => shells.batches.get(id)!;
  const solids: T.Box3[] = [];
  const owned: {dispose(): void}[] = [];
  LIVING_HANGERS.length = 0;
  const atlas = shells.atlas, decals = shells.decals, onWall = shells.onWall;
  const screens = new T.MeshStandardMaterial({color: '#0e1714', emissive: '#4c8a74', emissiveIntensity: .55, roughness: .2, metalness: .1}); screens.name = 'living.screens'; owned.push(screens);
  const wallKit = (space: string, side: keyof typeof FACE, along: number, y: number, o = 0) => Kit.at(B(space), onWall(space, side, along, y, o), FACE[side]);

  // ================================================================ S: drop shaft
  {
    const b = B('S');
    // Caged ladder on the west wall from the floor to the hatch.
    const lad = wallKit('S', 'W', 7, -3, .02);
    for (const x of [-.25, .25]) { lad.rod([x, 0, .35], [x, 43, .35], .035, m.chrome, 8); for (let y = 1; y < 43; y += 3) lad.box([x, y, .17], [.05, .06, .36], m.frame); }
    for (let y = .3; y < 43; y += .35) lad.rod([-.25, y, .35], [.25, y, .35], .016, m.frame, 6);
    for (let y = 3; y < 43; y += 1.6) lad.ring([0, y, .55], .4, .018, m.frame, [PI / 2, 0, 0], 16, PI);
    for (let y = 3; y < 43; y += 1.6) for (const a of [-.35, 0, .35]) lad.rod([a, y - 1.6, .55 + Math.sqrt(Math.max(0, .16 - a * a))], [a, y, .55 + Math.sqrt(Math.max(0, .16 - a * a))], .012, m.frame, 4);
    // Risers in the north-east corner.
    for (const [x, z, r] of [[13.2, .8, .3], [12.4, .7, .18], [13.3, 1.7, .14]] as const) {
      b.rod([x, -3, z], [x, 40, z], r, m.pipe, 14);
      for (let y = -1; y < 40; y += 4) b.rod([x, y, z], [x, y + .14, z], r + .04, m.frame, 14);
    }
    // Welcome-broadcast horn speakers.
    for (const y of [6.5, 24]) {
      const k = wallKit('S', 'N', 10.5, y, .05);
      k.box([0, 0, .06], [.5, .4, .12], m.frame); k.rod([0, -.05, .1], [0, -.35, .75], .08, m.indGreen, 16, .32);
      k.ring([0, -.35, .75], .32, .02, m.trim, [PI / 2 - .44, 0, 0]); k.rod([0, .2, .06], [0, 3.5, .06], .02, m.rubber, 5);
      k.box([-.6, -.6, .02], [.35, .2, .03], m.brass);
    }
    decals.add('欢迎入住', 'WELCOME TO THE SANATORIUM', 'stencil', onWall('S', 'E', 7, 4.8, .06), [-1, 0, 0], 4.2);
    // Landing grating at the corridor entrance and a dangling severed cable.
    b.slab([8, -2.95, 3.6], [13.7, -2.85, 11.4], m.plate);
    for (let z = 3.9; z < 11.4; z += .5) b.slab([8, -2.85, z], [13.7, -2.8, z + .04], m.frame);
    const cab = rng(5); let p: V3 = [4, 40, 10];
    for (let i = 0; i < 18; i++) { const n: V3 = [p[0] + (cab() - .5) * .5, p[1] - 1.9, p[2] + (cab() - .5) * .5]; b.rod(p, n, .04, m.rubber, 6); p = n; }
    hang('S-severed-cable', 'S', [4, 40, 10], p, 'ceiling');
  }

  // ================================================================ C1: dormitory gallery
  {
    const b = B('C1');
    const doors: [keyof typeof FACE, number, string][] = [['N', 17, '1-02'], ['N', 21, '1-04'], ['N', 51.5, '1-12'], ['N', 55.5, '1-14'], ['N', 60, '1-16'], ['S', 17, '1-01'], ['S', 36.5, '1-07'], ['S', 40.5, '1-09']];
    doors.forEach(([side, x, no], i) => {
      dormDoor(wallKit('C1', side, x, -3), m, i === 2 || i === 6);
      atlas.add(no, '', 'room', onWall('C1', side, x, -.6, .13), side === 'N' ? [0, 0, 1] : [0, 0, -1], .44);
    });
    // Benches, fire point and noticeboard along the walls (inside the 1.2 m wall band).
    bench(wallKit('C1', 'S', 46.5, -3, .35), m, 2.2); bench(wallKit('C1', 'N', 44, -3, .35), m, 2.2);
    const fire = wallKit('C1', 'N', 26.5, -3, 0);
    fire.box([0, 1.4, .14], [.9, 1.2, .28], m.bandRed); fire.box([0, 1.4, .29], [.75, 1.0, .02], m.darkGlass); fire.ring([0, 1.4, .2], .3, .06, m.bandRed, [0, 0, 0], 18);
    fire.cyl([.7, .35, .18], .1, .1, .6, m.bandRed, 12);
    atlas.add('消防栓', 'FIRE HOSE', 'red', onWall('C1', 'N', 26.5, -.95, .04), [0, 0, 1], 1);
    const board = wallKit('C1', 'S', 59, -3, 0); board.box([0, 1.7, .03], [1.6, 1.0, .05], m.veneer); board.box([0, 1.7, .06], [1.45, .86, .01], m.soil);
    for (let i = 0; i < 5; i++) board.box([-.5 + i * .25, 1.7 + (i % 2) * .2 - .1, .07], [.21, .29, .004], m.paper, [0, 0, (i - 2) * .06]);
    atlas.add('住户公告', 'RESIDENT NOTICES', 'enamel', onWall('C1', 'S', 59, -.95, .04), [0, 0, -1], 1.2);
    // Wayfinding.
    const obsX = ribMids('C1', 'S').reduce((p, x) => Math.abs(x - 39) < Math.abs(p - 39) ? x : p, 39);
    decals.add('观察廊 →', 'OBSERVATION GALLERY', 'stencilYellow', onWall('C1', 'S', obsX, 1.2, .02), [0, 0, -1], 2.6);
    decals.add('← 洗衣房', 'LAUNDRY', 'stencilYellow', onWall('C1', 'N', 30.5, 1.2, .02), [0, 0, 1], 2.0);
    // On the north bulkhead between ribs (the west wall is the open shaft doorway).
    atlas.add('宿舍外廊 1-01 — 1-16', 'DORMITORY GALLERY  ·  DECK −1', 'cyan', onWall('C1', 'N', 18.9, 1.72, .03), [0, 0, 1], 2.2);
    // Solarium behind the window (visual room, x 21..33, z 12.3..16).
    const s0 = 21, s1 = 33, z0 = 12.3, z1 = 16.2;
    b.slab([s0 - .3, -3.5, z0], [s1 + .3, -3, z1 + .3], m.floorTile);
    b.slab([s0 - .3, 2.4, z0], [s1 + .3, 2.8, z1 + .3], m.ceiling);
    b.slab([s0 - .3, -3, z1], [s1 + .3, 2.4, z1 + .3], m.padTeal);
    b.slab([s0 - .3, -3, z0], [s0, 2.4, z1], m.padTeal); b.slab([s1, -3, z0], [s1 + .3, 2.4, z1], m.padTeal);
    b.slab([s0, 2.35, z0], [s1, 2.4, z1], m.lampOff);
    b.box([27, -1.15, 12.05], [12.2, 3.65, .04], m.glassSoft);
    const sol = Kit.at(b, [27, -3, 14.2], 0);
    // Planting arranged the way staff left it, not in a row: a raised bed in the west corner, a cluster
    // of pots by the loungers, a tree in a tub on its own, and one pot knocked over with its soil spilt.
    sol.box([-4.6, .25, 1.35], [2.4, .5, 1.0], m.veneer); sol.box([-4.6, .52, 1.35], [2.2, .05, .82], m.soil);
    deadPlant(sol.child([-5.3, .5, 1.4]), m, 400, .9); deadPlant(sol.child([-4.3, .5, 1.25]), m, 401, 1.25, true); deadPlant(sol.child([-3.8, .5, 1.55]), m, 402, .7);
    deadPlant(sol.child([1.6, 0, 1.45]), m, 403, 1.05); deadPlant(sol.child([2.25, 0, 1.2]), m, 404, .75); deadPlant(sol.child([1.9, 0, .75]), m, 405, .55);
    deadPlant(sol.child([5.0, 0, 1.0]), m, 406, 1.35, true);
    const fallen = sol.child([-1.1, 0, .9], [0, .7, 0]);
    fallen.cyl([0, .17, 0], .17, .13, .34, m.porcelain, 14, [0, 0, PI / 2 - .1]); fallen.box([.35, .015, .05], [.6, .03, .45], m.soil, [0, .3, 0]);
    // Two loungers and a wheelchair turned toward the view window, a side table with cups between them.
    for (const [x, z, a] of [[-2.4, .2, .15], [-.1, .35, -.1]] as const) {
      const l = sol.child([x, 0, z], [0, a, 0]);
      for (const sx of [-.3, .3]) l.rod([sx, .3, -.85], [sx, .3, .85], .018, m.chrome, 6);
      for (const [sx, sz] of [[-.3, -.8], [.3, -.8], [-.3, .8], [.3, .8]]) l.rod([sx, 0, sz], [sx, .3, sz], .016, m.chrome, 6);
      l.box([0, .34, -.2], [.62, .06, 1.2], m.padTeal); l.box([0, .62, .62], [.62, .06, .7], m.padTeal, [-.85, 0, 0]);
      l.box([.1, .38, -.3], [.5, .03, .8], m.linen, [0, .2, .04]);
    }
    const side = sol.child([-1.25, 0, .9]); side.cyl([0, .28, 0], .22, .22, .03, m.veneer, 16); side.rod([0, 0, 0], [0, .28, 0], .02, m.chrome, 6);
    side.cyl([.08, .33, .05], .035, .03, .08, m.porcelain, 10); side.cyl([-.07, .33, -.04], .035, .03, .08, m.porcelain, 10); side.box([0, .3, -.1], [.21, .01, .29], m.paper, [0, .4, 0]);
    wheelchair(sol.child([3.4, 0, -.1], [0, PI + .35, 0]), m);
    bench(sol.child([-3.6, 0, -1.0], [0, PI, 0]), m, 1.6); chair(sol.child([4.2, 0, -.9], [.2, 3.5, 1.5]), m);
    // Upper volume: hanging baskets on chains with trailing dead stems, a sun-lamp column, a notice frame.
    for (const [x, z, len] of [[-3.2, .6, .9], [.9, 1.2, .7], [3.6, .9, 1.05]] as const) {
      const top = 5.35, y = top - len;
      sol.rod([x, top, z], [x, y + .22, z], .006, m.chrome, 4);
      sol.cyl([x, y + .1, z], .2, .12, .2, m.plantDead, 12); sol.cyl([x, y + .2, z], .17, .17, .03, m.soil, 12);
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + x; sol.rod([x + Math.cos(a) * .17, y + .14, z + Math.sin(a) * .17], [x + Math.cos(a) * .24, y - .35 - (k % 3) * .2, z + Math.sin(a) * .24], .008, m.plantDead, 4); }
    }
    const lamp = sol.child([5.4, 0, -1.2]); lamp.cyl([0, .02, 0], .22, .25, .04, m.trim, 16); lamp.rod([0, 0, 0], [0, 1.9, 0], .025, m.chrome, 8);
    lamp.cyl([0, 1.95, .12], .18, .1, .25, m.trim, 16, [-.9, 0, 0]);
    const notice = sol.child([-5.95, 0, .2], [0, PI / 2, 0]); notice.box([0, 1.75, .02], [.9, .62, .04], m.veneer); notice.box([0, 1.75, .045], [.8, .52, .01], m.paper);
    b.box([24, 2.32, 14], [1.2, .05, .3], m.lampWarm, {shadow: false});
    atlas.add('阳光疗养室', 'SOLARIUM  ·  RESIDENTS ONLY', 'cyan', [27, .9, 16.17], [0, 0, -1], 2.8);
  }

  // ================================================================ R1: laundry
  {
    const b = B('R1');
    // Battery shelving (freestanding, front flush with the box face at z -20.1).
    const rack = Kit.at(b, [29, -3, -20.8], 0);
    shelving(rack, m, 5.2, 1.2, 4.2, [.8, 2.0, 3.4], 11);
    solids.push(rack.solid([0, 2.1, 0], [5.2, 4.2, 1.2]));
    atlas.add('应急物资 · 电池', 'EMERGENCY CELLS  ·  B-2', 'warn', [30.6, .9, -20.15], [0, 0, 1], 1.6);
    // Folding tables, trolleys and laundry bags in the middle.
    const r = rng(77);
    for (const [x, z] of [[38, -10], [38, -15.5]] as const) {
      const t = Kit.at(b, [x, -3, z], PI / 2);
      t.box([0, .88, 0], [3.2, .06, 1.2], m.porcelain); for (const [a, c] of [[-1.5, -.5], [1.5, -.5], [-1.5, .5], [1.5, .5]]) t.rod([a, 0, c], [a, .86, c], .03, m.chrome, 6);
      for (let i = 0; i < 4; i++) t.box([-1.1 + i * .7, .95, (r() - .5) * .4], [.5, .06 + r() * .08, .4], m.linen, [0, r(), 0]);
    }
    for (const [x, z, a] of [[31, -6, .3], [42, -21, -.6], [34.5, -13, 1.2]] as const) {
      const t = Kit.at(b, [x, -3, z], a);
      for (const [p, c] of [[-.45, -.3], [.45, -.3], [-.45, .3], [.45, .3]]) { t.rod([p, .08, c], [p, .9, c], .015, m.chrome, 5); t.sphere([p, .05, c], [.05, .05, .05], m.rubber, 6); }
      t.box([0, .5, 0], [.95, .02, .65], m.chrome); t.sphere([0, .85, 0], [.42, .28, .3], m.linen, 10);
    }
    for (let i = 0; i < 9; i++) Kit.at(b, [27 + r() * 18, -3, -2 - r() * 18], r() * 6).sphere([0, .22, 0], [.4 + r() * .2, .24, .32], m.linen, 9);
    // Clothes lines across the room at the top storey.
    for (const z of [-7, -12, -17]) { b.rod([24.4, 3.6, z], [47.6, 3.6, z], .012, m.chrome, 4); for (const x of [24.5, 47.5]) b.box([x, 3.6, z], [.12, .12, .12], m.frame); }
    atlas.add('洗衣储物间', 'LAUNDRY  ·  LINEN STORE', 'enamel', onWall('R1', 'S', 36, 3.6, .04), [0, 0, -1], 3.2);
    atlas.add('机内勿存私人物品', 'DO NOT LEAVE PERSONAL ITEMS', 'warn', onWall('R1', 'E', -9, .2, .1), [-1, 0, 0], 2.0);
    // Pipe drop to every washer (connects to the hero laundry row).
    for (let z = -22; z <= -6; z += 2.3) { b.rod([46.9, 1.0, z], [46.9, 5, z], .07, m.pipe, 8); b.rod([46.9, 1.0, z], [46.3, 1.0, z], .07, m.pipe, 8); }
  }

  // ================================================================ R2: maintenance shop
  {
    const b = B('R2');
    const rack = Kit.at(b, [59.6, -3, 30.7], PI);   // box at z 30.5, face north (−Z); rack front flush at 30.15
    shelving(rack, m, 6.4, 1.1, 4.2, [.8, 2.0, 3.4], 21);
    solids.push(rack.solid([0, 2.1, 0], [6.4, 4.2, 1.1]));
    atlas.add('液压维修工具', 'HYDRAULIC REPAIR KIT', 'warn', [57.2, .9, 30.1], [0, 0, -1], 1.5);
    workbench(wallKit('R2', 'E', 22, -3, .45), m, 5.5, 31);
    solids.push(Kit.at(b, onWall('R2', 'E', 22, -3, .45), FACE.E).solid([0, 1, 0], [5.5, 2, .9]));
    workbench(wallKit('R2', 'W', 29, -3, .45), m, 4, 32);
    gasCylinders(wallKit('R2', 'W', 21, -3, .3), m, 5);
    lockerRow(wallKit('R2', 'W', 16, -3, .3), m, 6, 33);
    // Drill press and a stripped pump on a pallet.
    const dp = Kit.at(b, [47.5, -3, 33], PI); dp.box([0, .05, 0], [.6, .1, .5], m.frame); dp.rod([0, 0, -.15], [0, 1.9, -.15], .06, m.chrome, 10); dp.box([0, 1.6, 0], [.35, .5, .5], m.bandBlue); dp.box([0, .9, .05], [.4, .04, .4], m.frame);
    const pump = Kit.at(b, [52, -3, 21], .4); pump.box([0, .07, 0], [1.4, .14, 1.1], m.veneer);
    pump.cyl([0, .55, 0], .4, .4, .8, m.bandBlue, 18, [0, 0, PI / 2]); pump.cyl([.55, .55, 0], .22, .22, .4, m.chrome, 14, [0, 0, PI / 2]);
    for (let i = 0; i < 6; i++) pump.cyl([-.3 + i * .12, .2, .4], .05, .05, .02, m.chrome, 8);
    // Chain hoist from the beam.
    const hz = 24; b.rod([54, 5, hz], [54, -.5, hz], .025, m.chrome, 5); b.box([54, -.7, hz], [.3, .4, .2], m.bandYellow);
    b.rod([54, -.9, hz], [54, -1.4, hz], .03, m.chrome, 6);
    hang('R2-hoist', 'R2', [54, 5, hz], [54, -1.4, hz], 'beam');
    atlas.add('机修间', 'MAINTENANCE SHOP', 'enamel', onWall('R2', 'N', 61, 3.6, .1), [0, 0, 1], 2.4);
    atlas.add('佩戴护目镜', 'EYE PROTECTION REQUIRED', 'warn', onWall('R2', 'E', 22, 0, .1), [-1, 0, 0], 1.8);
    // Floor markings.
    for (const z of [17, 29]) b.slab([45, -2.99, z], [62, -2.985, z + .12], m.bandYellow);
  }

  // ================================================================ J1: junction hall
  {
    const b = B('J1');
    const k = Kit.at(b, [79.2, -3, 13.2], PI);
    k.box([0, .55, 0], [3.2, 1.1, .8], m.veneer); k.box([0, 1.12, 0], [3.3, .05, .9], m.porcelain); k.box([1.55, .55, -1], [.8, 1.1, 2], m.veneer);
    chair(k.child([.4, 0, -.9], [0, 2.8, 0]), m); chair(k.child([-.8, 0, -1.3], [1.4, .8, 0]), m);
    solids.push(k.solid([0, .6, -.4], [3.4, 1.2, 2.4]));
    atlas.add('服务台', 'RESIDENT SERVICES', 'cyan', [79.2, -1.2, 12.75], [0, 0, -1], 1.6);
    // Floor plan directory.
    const dir = wallKit('J1', 'N', 79.5, -3, 0);
    dir.box([0, 2.0, .06], [2.6, 1.8, .1], m.trim);
    atlas.add('−1 层 生活区平面', 'DECK −1  RESIDENTIAL PLAN', 'enamel', onWall('J1', 'N', 79.5, 2.65, .12), [0, 0, 1], 2.4);
    deadPlant(Kit.at(b, [65.6, -3, 14.5], 0), m, 61, 1.3); deadPlant(Kit.at(b, [80.6, -3, -.6], 0), m, 62, 1.3);
    bench(wallKit('J1', 'S', 68.5, -3, .35), m, 2.4);
    decals.add('↑ 安保值班室', 'SECURITY', 'stencilYellow', onWall('J1', 'W', -.8 + 0, 1.3, .02), [1, 0, 0], 2.2);
  }

  // ================================================================ C2 / C3 / C5 / C6 corridors: dorm doors, benches
  const corridorDoors: [string, keyof typeof FACE, number, string, boolean][] = [
    ['C2', 'W', -10, '2-01', false], ['C2', 'W', -20, '2-03', true], ['C2', 'W', -30, '2-05', false], ['C2', 'E', -14, '2-02', false], ['C2', 'E', -26, '2-04', false], ['C2', 'E', -35, '2-06', true],
    ['C3', 'N', 88, '3-01', false], ['C3', 'N', 94, '3-03', false], ['C3', 'N', 100, '3-05', true], ['C3', 'N', 112, '3-07', false], ['C3', 'S', 87, '3-02', false], ['C3', 'S', 93, '3-04', true],
    ['C5', 'W', 27, '5-01', false], ['C5', 'W', 34, '5-03', true], ['C5', 'E', 30, '5-02', false], ['C5', 'E', 37, '5-04', false],
  ];
  for (const [sp, side, along, no, ajar] of corridorDoors) {
    dormDoor(wallKit(sp, side, along, -3), m, ajar);
    const n: V3 = side === 'W' ? [1, 0, 0] : side === 'E' ? [-1, 0, 0] : side === 'N' ? [0, 0, 1] : [0, 0, -1];
    atlas.add(no, '', 'room', onWall(sp, side, along, -.6, .13), n, .44);
  }
  {
    // The vending machines live in the clutter pass (detailed prefab, out of the R4 doorway).
    bench(wallKit('C3', 'N', 106, -3, .35), m, 2.2);
    decals.add('压载库 →', 'BALLAST STORES', 'stencilYellow', onWall('C3', 'N', 98, 1.3, .02), [0, 0, 1], 2.2);
    decals.add('观察廊 →', 'OBSERVATION GALLERY', 'stencilYellow', onWall('C3', 'S', 113, 1.3, .02), [0, 0, -1], 2.6);
    decals.add('← 中庭', 'ATRIUM', 'stencilYellow', onWall('C5', 'E', 26, 1.3, .02), [-1, 0, 0], 1.8);
  }

  // ================================================================ R3: security office (console & corpse are the hero asset)
  {
    const b = B('R3');
    lockerRow(wallKit('R3', 'W', -50, -3, .3), m, 8, 41);
    solids.push(Kit.at(b, onWall('R3', 'W', -50, -3, .3), FACE.W).solid([0, 1, 0], [4, 2.1, .55]));
    const fc = wallKit('R3', 'E', -44, -3, .3);
    for (let i = 0; i < 3; i++) { fc.box([i * .55 - .55, .7, 0], [.5, 1.4, .6], m.indGreen); for (let j = 0; j < 4; j++) fc.box([i * .55 - .55, .2 + j * .34, .31], [.2, .03, .03], m.chrome); }
    // Desk cluster in the middle-west, away from the parking line (x 70..74).
    for (const [x, z, a] of [[62.5, -46, 0], [62.5, -54, PI]] as const) {
      const d = Kit.at(b, [x, -3, z], a); d.box([0, .74, 0], [2.0, .05, .9], m.veneer); d.box([-.85, .36, 0], [.3, .72, .85], m.indGreen); d.box([.85, .36, 0], [.3, .72, .85], m.indGreen);
      d.rbox([0, 1.0, -.2], [.45, .4, .4], m.trim, .03); d.box([0, 1.0, .01], [.36, .28, .02], screens);
      chair(d.child([0, 0, .7], [0, PI, 0]), m);
      for (let i = 0; i < 6; i++) d.box([-.6 + i * .22, .78, .2], [.21, .005, .29], m.paper, [0, i * .4, 0]);
    }
    chair(Kit.at(b, [66, -3, -50], .4, [PI / 2, 0, 0]), m);
    // Patrol whiteboard and holding-cell bars on the east wall.
    const wb = wallKit('R3', 'S', 80, -3, 0); wb.box([0, 1.7, .03], [2.4, 1.2, .04], m.porcelain); wb.box([0, 1.08, .08], [2.4, .04, .1], m.chrome);
    const cell = wallKit('R3', 'E', -60, -3, .02);
    for (let a = -2; a <= 2; a += .2) cell.rod([a, 0, .9], [a, 2.4, .9], .025, m.chrome, 6);
    cell.box([0, 2.45, .9], [4.1, .1, .1], m.frame); cell.box([0, .05, .9], [4.1, .1, .1], m.frame);
    cell.box([0, .5, .4], [1.9, .1, .7], m.chrome); cell.box([0, .62, .4], [1.8, .12, .65], m.padded);
    atlas.add('安保值班室', 'SECURITY OFFICE  ·  AUTHORISED STAFF', 'red', onWall('R3', 'N', 64, 3.4, .1), [0, 0, 1], 3.2);
    atlas.add('监控 CCTV', 'SURVEILLANCE  ·  SANATORIUM FEED', 'enamel', onWall('R3', 'N', 76, 1.9, .55), [0, 0, 1], 2.4);
    atlas.add('拘留室', 'HOLDING', 'enamel', onWall('R3', 'E', -60, 0, .95), [-1, 0, 0], 1.2);
  }

  // ================================================================ R4: ballast stores (racks are the hero asset)
  {
    const b = B('R4');
    // North-east intake vent the eel retreats into.
    const v = wallKit('R4', 'E', 13.9, -3, .02);
    v.box([0, 1.0, .03], [2.4, 2.0, .06], m.rubber);
    for (let y = .15; y < 1.9; y += .16) v.box([0, y, .1], [2.2, .05, .06], m.frame, [.5, 0, 0]);
    v.box([0, 2.05, .1], [2.5, .12, .16], m.frame); v.box([0, -.02, .1], [2.5, .12, .16], m.frame);
    for (const a of [-1.2, 1.2]) v.box([a, 1, .1], [.1, 2.1, .16], m.frame);
    decals.add('进水口 INTAKE', '', 'stencilYellow', onWall('R4', 'E', 13.9, -.5, .03), [-1, 0, 0], 1.6);
    // Pallets of ingots and a pallet jack in the west half.
    const r = rng(9);
    for (const [x, z] of [[99.5, 20], [99.5, 27], [103, 33]] as const) {
      const p = Kit.at(b, [x, -3, z], r() * .3);
      p.box([0, .07, 0], [1.2, .14, 1.0], m.veneer);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let l = 0; l < 2; l++) p.box([-.35 + i * .35, .26 + l * .2, -.22 + j * .44], [.3, .18, .4], m.frame);
      solids.push(p.solid([0, .4, 0], [1.3, .8, 1.1]));
    }
    const jack = Kit.at(b, [104.5, -3, 28], .7); jack.box([0, .08, 0], [.55, .08, 1.2], m.bandRed); jack.rod([0, .1, -.6], [0, 1.2, -.75], .025, m.bandRed, 6); jack.box([0, 1.2, -.76], [.4, .05, .05], m.rubber);
    for (const x of [100, 112]) b.slab([x, -2.99, 13], [x + .15, -2.985, 35], m.bandYellow);
    atlas.add('压载物资库', 'BALLAST STORES  ·  MAX 4 T / BAY', 'enamel', onWall('R4', 'W', 24, 3.4, .1), [1, 0, 0], 3.2);
    atlas.add('重物 · 起吊区', 'HEAVY LIFT ZONE', 'warn', onWall('R4', 'S', 108, 1.5, .1), [0, 0, -1], 2);
  }

  // ================================================================ G: observation gallery (glass door is the hero asset)
  {
    const b = B('G');
    for (const z of [-3.5, 15]) bench(Kit.at(b, [130, -3, z], PI / 2), m, 3);
    sofa(Kit.at(b, [122, -3, 15.5], PI / 2), m, 2.4, m.padTeal);
    deadPlant(Kit.at(b, [121, -3, -7], 0), m, 71, 1.3); deadPlant(Kit.at(b, [121, -3, 21], 0), m, 72, 1.3, true);
    // Handrail along the glass and a visitor intercom.
    for (const z of [-7.4, 21.4]) b.rod([140.5, -1.9, z], [140.5, -1.9, z], .04, m.brass, 8);
    const ic = wallKit('G', 'E', 13.6, -3, .02); ic.box([0, 1.45, .06], [.5, .7, .12], m.frame); ic.box([0, 1.6, .13], [.3, .2, .02], m.screenDead);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ic.box([-.08 + j * .08, 1.32 - i * .07, .13], [.05, .05, .02], m.chrome);
    atlas.add('探视对讲', 'VISITOR INTERCOM', 'cyan', onWall('G', 'E', 13.6, -.75, .05), [-1, 0, 0], 1.0);
    atlas.add('防爆玻璃观察廊', 'OBSERVATION GALLERY  ·  NO TAPPING ON GLASS', 'enamel', onWall('G', 'W', 0, 3.6, .1), [1, 0, 0], 3.6);
    atlas.add('观察时间 08:00 — 20:00', 'VISITING HOURS', 'cyan', onWall('G', 'N', 124, 1.2, .1), [0, 0, 1], 2.2);
  }

  // ================================================================ C4 / V: valve room (manifold is the hero asset)
  {
    const b = B('V');
    // Pipe rack along the north wall and two circulation pumps.
    for (const [y, r, mm] of [[3.6, .32, m.pipe], [2.7, .22, m.pipe], [1.9, .16, m.chrome]] as const) {
      b.rod([114.4, y, -39.2], [140, y, -39.2], r, mm, 14);
      for (let x = 116; x < 140; x += 3) b.rod([x, y, -39.2], [x + .16, y, -39.2], r + .05, m.frame, 14);
    }
    for (let x = 116; x < 140; x += 3) b.slab([x - .05, 1.5, -39.7], [x + .05, 4.0, -38.8], m.frame);
    for (const x of [119, 124.5]) {
      const p = Kit.at(b, [x, -3, -37.2], 0);
      p.box([0, .12, 0], [2.2, .24, 1.4], m.concrete); p.cyl([-.3, .9, 0], .5, .5, 1.3, m.indGreen, 20, [0, 0, PI / 2]); p.cyl([.65, .9, 0], .32, .32, .7, m.chrome, 16, [0, 0, PI / 2]);
      p.rod([.65, .9, 0], [.65, 4, -1.6], .18, m.pipe, 12); p.box([-.3, 1.5, 0], [.4, .2, .3], m.trim);
      solids.push(p.solid([0, .8, 0], [2.4, 1.6, 1.6]));
    }
    const panel = wallKit('V', 'W', -26, -3, .02);
    panel.box([0, 1.3, .2], [1.6, 2.2, .4], m.indGreen); panel.box([0, 1.7, .41], [1.3, .6, .02], m.screenDead);
    for (let i = 0; i < 6; i++) panel.cyl([-.5 + i * .2, 1.0, .42], .04, .04, .03, i % 3 ? m.lampOff : m.lampRed, 10, [PI / 2, 0, 0]);
    atlas.add('管线阀门间', 'VALVE ROOM  ·  SANATORIUM SUPPLY', 'enamel', onWall('V', 'W', -29, 3.4, .1), [1, 0, 0], 3.2);
    atlas.add('阀门操作需两人确认', 'TWO-PERSON VALVE RULE', 'warn', onWall('V', 'N', 128, .2, .1), [0, 0, 1], 2.2);
    for (const z of [-36, -29, -22]) b.slab([134, -2.99, z - 1.5], [141.7, -2.985, z + 1.5], m.hazard);
    const c4 = B('C4');
    for (const x of [126.6, 134.4]) c4.rod([x, -3, -17.8], [x, 3, -17.8], .14, m.pipe, 10);
    atlas.add('阀门间', 'VALVE ROOM', 'enamel', onWall('C4', 'E', -13, .5, .05), [-1, 0, 0], 1.8);
  }

  // ================================================================ A: atrium ground floor (balconies are the hero asset)
  const sheets: T.Mesh[] = [];
  {
    const b = B('A');
    const r = rng(1234);
    // Dining terrace: round tables and toppled/floating chairs on the −9 floor.
    for (let i = 0; i < 16; i++) {
      const x = 118 + (i % 8) * 9.5 + (r() - .5) * 2, z = 50 + Math.floor(i / 8) * 22 + (r() - .5) * 3;
      if (Math.abs(x - 155) < 10 && Math.abs(z - 62) < 10) continue;
      const t = Kit.at(b, [x, -9, z], r() * 6);
      diningTable(t, m, true);
      for (let c = 0; c < 4; c++) {
        const a = c / 4 * PI * 2 + r() * .4, tipped = r() < .25;
        chair(Kit.at(b, [x + Math.cos(a) * 1.05, -9 + (tipped ? .25 : 0), z + Math.sin(a) * 1.05], -a + PI / 2, tipped ? [PI / 2, 0, 0] : [0, 0, 0]), m);
      }
      // Meals abandoned mid-sitting: plates, cups and a tray on the table top (y −8.22).
      const top = (kind: string, dx: number, dz: number, yaw = r() * 6) => shells.scatter.get('A')!.put(kind, [x + dx, -8.22, z + dz], [0, yaw, 0]);
      top('plate', .3, -.2); top('cup', -.25, .2); if (r() < .6) top('tray', -.1, -.3); if (r() < .5) top('plate', -.35, -.25);
      if (r() < .4) top('bottle', .05, .35); if (r() < .3) top('ashtray', .4, .3);
    }
    // Dead skylight lantern over the 18 m ceiling opening: hipped steel ribs, silted dark glass.
    {
      const k = Kit.at(b, [155, 9.5, 62], 0), h = 3.2, hw = 9;
      const apex: V3 = [0, h, 0];
      const corners: V3[] = [[-hw, 0, -hw], [hw, 0, -hw], [hw, 0, hw], [-hw, 0, hw]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], c = corners[(i + 1) % 4];
        k.rod(a, c, .14, m.frame, 6);
        k.rod(a, apex, .12, m.frame, 6);
        for (let j = 1; j < 6; j++) { const t = j / 6; k.rod([a[0] + (c[0] - a[0]) * t, 0, a[2] + (c[2] - a[2]) * t], apex, .05, m.frame, 5); }
        for (const t of [.33, .66]) {
          const p = (q: V3): V3 => [q[0] * (1 - t), h * t, q[2] * (1 - t)];
          k.rod(p(a), p(c), .045, m.frame, 5);
        }
      }
      const glassGeo = new T.ConeGeometry(hw * Math.SQRT2 - .05, h - .04, 4, 1, true); glassGeo.rotateY(PI / 4); owned.push(glassGeo);
      const glass = new T.MeshPhysicalMaterial({color: '#0a171a', roughness: .35, metalness: .1, transparent: true, opacity: .62, side: T.DoubleSide, depthWrite: false}); owned.push(glass);
      const pane = new T.Mesh(glassGeo, glass); pane.position.set(155, 9.5 + h / 2, 62); pane.renderOrder = 2; root.add(pane);
    }
    // Planters with dead trees between terrace bays.
    for (const [x, z] of [[124, 61], [186, 61], [140, 49], [170, 75], [140, 75], [170, 49]] as const) deadPlant(Kit.at(b, [x, -9, z], r() * 6), m, x * 3 + z, 1.8, true);
    // Serving counter along the west wall below the balcony.
    const counter = wallKit('A', 'W', 52, -9, 1.0);
    counter.box([0, .55, 0], [10, 1.1, .9], m.veneer); counter.box([0, 1.12, 0], [10.2, .06, 1.0], m.porcelain);
    for (let i = 0; i < 5; i++) counter.cyl([-4 + i * 2, 1.3, 0], .25, .3, .35, m.chrome, 16);
    atlas.add('餐厅 · 自助取餐', 'DINING  ·  SELF SERVICE', 'cyan', onWall('A', 'W', 52, -6.6, .2), [1, 0, 0], 3.4);
    atlas.add('生活区中庭', 'RESIDENTS\u2019 ATRIUM  ·  三层', 'enamel', onWall('A', 'S', 147, 8, .3), [0, 0, -1], 5);
    atlas.add('请保持安静 · 疗养中', 'QUIET PLEASE  ·  RESIDENTS RESTING', 'cyan', onWall('A', 'N', 150, 7.6, .3), [0, 0, 1], 4.4);
    // Gate F direction mark: painted on a bolted steel plate on the bulkhead panel between ribs
    // (x 194.1 / 198.3), below the balcony, so it never reads as text floating over a rib or rail.
    {
      const k = wallKit('A', 'N', 196.2, -9, .02);
      k.box([0, 4.6, .015], [3.2, 1.0, .03], m.paintDark);
      for (const [x, y] of [[-1.5, 4.18], [1.5, 4.18], [-1.5, 5.02], [1.5, 5.02]] as const) k.cyl([x, y, .035], .025, .025, .02, m.chrome, 8, [PI / 2, 0, 0]);
      decals.add('← 闸门 F', 'GATE F  ·  SANATORIUM', 'stencilYellow', onWall('A', 'N', 196.2, -4.4, .034), [0, 0, 1], 3);
    }
  }

  // ================================================================ R5: residence office (desk & corpse are the hero asset)
  {
    const b = B('R5');
    const fc = wallKit('R5', 'N', 154, -3, .3);
    for (let i = 0; i < 3; i++) { fc.box([i * .55, .7, 0], [.5, 1.4, .6], m.indGreen); for (let j = 0; j < 4; j++) fc.box([i * .55, .2 + j * .34, .31], [.2, .03, .03], m.chrome); }
    sofa(Kit.at(b, [152.2, -3, 101], PI / 2), m, 2.4, m.carpetRed);
    Kit.at(b, [153.6, -3, 101], 0).box([0, .4, 0], [.8, .05, 1.4], m.veneer);
    deadPlant(Kit.at(b, [151.2, -3, 106.8], 0), m, 91, 1.2); deadPlant(Kit.at(b, [173, -3, 87], 0), m, 92, 1.2);
    for (const [x, z, a] of [[157, 93, 1], [170, 92, 2.2]] as const) chair(Kit.at(b, [x, -3, z], a, a > 2 ? [PI / 2, 0, 0] : undefined), m);
    // Scattered paper fan from the desk.
    const r = rng(55);
    for (let i = 0; i < 24; i++) Kit.at(b, [163 + r() * 9, -2.985, 99 + r() * 7], r() * 6).box([0, 0, 0], [.21, .003, .29], m.paper);
    atlas.add('住宿管理处', 'RESIDENCE OFFICE  ·  RECEPTION', 'enamel', onWall('R5', 'N', 168, 3.4, .1), [0, 0, 1], 3.2);
  }

  // ================================================================ C7 / D: descent shaft
  {
    const b = B('D');
    // Guide rails for the descent cage, east and west walls, full height.
    for (const z of [64, 72]) for (const x of [90.8, 105.2]) {
      b.slab([x - .12, -60, z - .1], [x + .12, 3, z + .1], m.chrome);
      for (let y = -58; y < 3; y += 2.5) b.slab([x - .25, y, z - .25], [x + .25, y + .12, z + .25], m.frame);
    }
    // Landing grating with handrail at the C7 mouth.
    b.slab([101.5, -3.15, 63.7], [105.7, -3, 72.3], m.plate);
    for (let x = 101.7; x < 105.6; x += .45) b.slab([x, -3.05, 63.7], [x + .04, -3, 72.3], m.frame);
    for (const z of [63.9, 72.1]) { b.rod([101.6, -3, z], [101.6, -1.9, z], .04, m.bandYellow, 6); b.rod([101.6, -1.9, z], [105.7, -1.9, z], .04, m.bandYellow, 6); }
    atlas.add('下行井 → −2 层', 'DESCENT SHAFT  ·  DECK −2', 'warn', onWall('D', 'N', 98, 1.6, .1), [0, 0, 1], 3);
    for (let y = -6; y > -58; y -= 6) decals.add(`${y} M`, '', 'stencilYellow', onWall('D', 'W', 68, y, .05), [1, 0, 0], 2);
    const c7 = B('C7'); c7.rod([106.4, 2.4, 64.5], [109.6, 2.4, 64.5], .12, m.pipe, 10);
  }

  // ================================================================ Alex side: L lobby, M corridor, N dormitories (human scale)
  {
    const L = B('L'), r = rng(321);
    // Reception counter facing the blast glass, sofas and columns.
    const rc = Kit.at(L, [150.5, -3, 3], -PI / 2);
    rc.box([0, .55, 0], [4, 1.1, .7], m.veneer); rc.box([0, 1.12, 0], [4.1, .05, .8], m.porcelain); rc.rbox([.6, 1.3, -.1], [.45, .38, .38], m.trim, .03);
    atlas.add('前厅接待', 'LOBBY RECEPTION', 'cyan', [150.1, -1.4, 3], [-1, 0, 0], 1.6);
    sofa(Kit.at(L, [146.5, -3, 10.5], PI / 2), m, 2, m.padTeal); sofa(Kit.at(L, [149, -3, -2.5], 0), m, 2, m.padTeal);
    for (const z of [-30, -18, -6, 18, 30]) for (const x of [148, 158]) L.slab([x - .3, -3, z - .3], [x + .3, .6, z + .3], m.veneer);
    deadPlant(Kit.at(L, [143.4, -3, -1], 0), m, 501, .9); deadPlant(Kit.at(L, [143.4, -3, 13], 0), m, 502, .9);
    for (let i = 0; i < 8; i++) chair(Kit.at(L, [144 + r() * 18, -3, -35 + r() * 70], r() * 6, r() < .5 ? [PI / 2, 0, 0] : [0, 0, 0]), m);
    // Transfer tube exit flange on the lobby side.
    const out = Kit.at(L, [142.35, 0, 17], PI / 2);
    out.cyl([0, 0, .25], .5, .5, .5, m.indSteel, 20, [PI / 2, 0, 0]); out.ring([0, 0, .5], .48, .07, m.frame, [0, 0, 0], 24); out.cyl([0, 0, .52], .36, .36, .02, m.rubber, 20, [PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; out.cyl([Math.cos(a) * .48, Math.sin(a) * .48, .55], .03, .03, .06, m.chrome, 6, [PI / 2, 0, 0]); }
    atlas.add('传递管道出口', 'TRANSFER TUBE OUTLET', 'warn', [142.4, .35, 18.3], [1, 0, 0], .9);
    atlas.add('生活区前厅', 'LIVING QUARTERS LOBBY', 'enamel', [142.33, 1.3, 6], [-1, 0, 0], 3);
    // Doors in M and N.
    for (const z of [-34, -26, -2, 6, 14, 22, 30, 38]) for (const [sp, side] of [['M', 'W'], ['M', 'E'], ['N', 'W']] as const) {
      if (sp === 'M' && side === 'E' && z > -24 && z < 8) continue; // the colour-banded pipe run passes here
      dormDoor(wallKit(sp, side, z, -3), m, r() < .3, .95);
      atlas.add(`${sp === 'N' ? 'N' : 'S'}-${Math.abs(z)}`, '', 'room', onWall(sp, side, z, -.85, .12), side === 'W' ? [1, 0, 0] : [-1, 0, 0], .36);
    }
    atlas.add('疗养区走廊', 'SANATORIUM WING  ·  STAFF ESCORT', 'cyan', onWall('M', 'S', 170, -.1, .1), [0, 0, -1], 2.2);
    // N: open dorm cells with beds visible through the inner partition.
    const N = B('N');
    for (let z = -36; z < 40; z += 6) {
      N.slab([190, -3, z - .06], [201.7, .6, z + .06], m.wallpaper);
      bed(Kit.at(N, [198.5, -3, z + 3], PI / 2), m, z * 7);
      Kit.at(N, [194.5, -3, z + 4.6], 0).box([0, .45, 0], [.6, .9, .5], m.veneer);
    }
    N.slab([190 - .06, -3, -40], [190 + .06, -.4, 42], m.wallpaper);
    atlas.add('内侧宿舍 N1 — N12', 'INNER DORMITORIES', 'cyan', onWall('N', 'S', 180, -.05, .1), [0, 0, -1], 2.2);
  }

  // Merge sheets into the atrium/laundry animation set: laundry linen hangs from the lines.
  {
    const r = rng(808);
    const g = new T.PlaneGeometry(1.8, 2.6, 12, 18); owned.push(g);
    for (let i = 0; i < 6; i++) {
      const s = new T.Mesh(g, m.linen);
      const x = 27 + (i % 3) * 7 + r() * 2, z = [-7, -12, -17][i % 3];
      s.position.set(x, 2.3, z);
      s.rotation.set(0, r() * .4, 0);
      s.userData.phase = r() * 10; s.userData.hanging = true; s.castShadow = true; root.add(s); sheets.push(s);
      hang(`R1-sheet-${i}`, 'R1', [x, 3.6, z], [x, 1.0, z], 'line');
    }
    for (const z of [-7, -12, -17]) hang(`R1-line-${z}`, 'R1', [24.4, 3.6, z], [47.6, 3.6, z], 'wall');
  }
  // Cloth wave shader shared by all sheets.
  const clothTime = {value: 0};
  const cloth = (m.linen as T.MeshPhysicalMaterial).clone(); owned.push(cloth); cloth.name = 'living.linen-wave';
  cloth.onBeforeCompile = sh => {
    sh.uniforms.uTime = clothTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
 float k=(1.-uv.y);
 transformed.z+=sin(position.x*1.7+uTime*.6)*.18*k+sin(position.y*2.3+uTime*.45+position.x)*.12;
 transformed.x+=sin(position.y*1.3+uTime*.35)*.08*k;`);
  };
  for (const s of sheets) s.material = cloth;

  const clutter = buildClutter(m, shells, screens);
  owned.push(...clutter.owned);
  const wreck = buildWreck(m, shells, solids, owned, root);
  for (const [id, s] of shells.scatter) { const b = shells.batches.get(id); if (b) s.emit(b); }

  return {
    sheets, solids, screens,
    update(time) {
      clothTime.value = time;
      clutter.update(time);
      wreck.update(time);
      screens.emissiveIntensity = .45 + .15 * Math.sin(time * 9.7) * Math.sin(time * 2.3);
      for (const s of sheets) if (!s.userData.hanging) { s.rotation.x += .0008 * Math.sin(time * .2 + s.userData.phase); s.position.y += Math.sin(time * .3 + s.userData.phase) * .0012; }
    },
    dispose() { clutter.dispose(); owned.forEach(o => o.dispose()); sheets.forEach(s => s.removeFromParent()); },
  };
}
