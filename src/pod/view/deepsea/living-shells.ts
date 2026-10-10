import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {LIVING_DOORS, LIVING_LIGHTS, LIVING_SPACES, WALL_T, type LivingDoor, type LivingSpace} from '../../content/living-deck-layout';
import {Batcher, rng, type V3} from './living-build';
import type {LivingMaterials} from './living-materials';
import {wearVariant, withCeilingStains} from './living-materials';
import {LIVING_EN, LIVING_SIGN_CN, SignAtlas} from './living-signage';
import {DecalSet, Scatter} from './living-decals';

export type ShellStyle = 'res' | 'ind' | 'shaft' | 'hall' | 'office' | 'laundry' | 'security' | 'gallery' | 'alex';
export const SHELL_STYLE: Record<string, ShellStyle> = {
  S: 'shaft', C1: 'res', R1: 'laundry', R2: 'ind', J1: 'res', C2: 'res', R3: 'security', C3: 'res', R4: 'ind', G: 'gallery',
  C4: 'ind', V: 'ind', C5: 'res', A: 'hall', C6: 'res', R5: 'office', C7: 'ind', D: 'shaft', L: 'alex', M: 'alex', N: 'alex',
};

const H = WALL_T / 2;
export type Side = 'W' | 'E' | 'N' | 'S';
interface Cut {from: number; to: number; bottom: number; top: number; door?: LivingDoor; window?: boolean}

/** Windows cut only from the visual walls; collision keeps the solid layout wall. */
export const LIVING_WINDOWS: {space: string; side: Side; from: number; to: number; bottom: number; top: number}[] = [
  {space: 'C1', side: 'S', from: 21, to: 33, bottom: -1.7, top: 1.9},     // sanatorium solarium
];

/** Atrium balcony decks (tops) and their depth from each wall. */
export const ATRIUM_BALCONY_Y = [0, 6];
export const ATRIUM_BALCONY_DEPTH = 3.2;

export function spaceOf(id: string) { return LIVING_SPACES.find(s => s.id === id)!; }

function sideInfo(s: LivingSpace, side: Side) {
  switch (side) {
    case 'W': return {axis: 'x' as const, at: s.minX, from: s.minZ, to: s.maxZ, n: [1, 0, 0] as V3};
    case 'E': return {axis: 'x' as const, at: s.maxX, from: s.minZ, to: s.maxZ, n: [-1, 0, 0] as V3};
    case 'N': return {axis: 'z' as const, at: s.minZ, from: s.minX + H, to: s.maxX - H, n: [0, 0, 1] as V3};
    case 'S': return {axis: 'z' as const, at: s.maxZ, from: s.minX + H, to: s.maxX - H, n: [0, 0, -1] as V3};
  }
}

/**
 * Free wall positions midway between frame ribs (for posters, conduits, stencils) on one side of
 * a space, at floor storey. Mirrors the rib spacing used by the wall builders.
 */
export function ribMids(spaceId: string, side: Side): number[] {
  const s = spaceOf(spaceId), info = sideInfo(s, side), style = SHELL_STYLE[spaceId];
  const cuts = LIVING_DOORS.filter(d => d.axis === info.axis && Math.abs(d.at - info.at) < 1e-6 && (d.a === s.id || d.b === s.id)).map(d => ({from: d.from, to: d.to}));
  for (const w of LIVING_WINDOWS) if (w.space === s.id && w.side === side) cuts.push({from: w.from, to: w.to});
  cuts.sort((p, q) => p.from - q.from);
  const resLike = !(style === 'ind' || style === 'shaft' || style === 'laundry');
  const step = resLike ? (style === 'alex' ? 3.2 : 4.2) : style === 'shaft' ? 3.5 : style === 'laundry' ? 4 : 2.5;
  const out: number[] = [];
  let cursor = info.from;
  const seg = (a: number, b: number) => {
    if (b - a < 1) return;
    if (resLike) for (let x = a + step; x < b - .6; x += step) out.push(x);
    else for (let x = Math.ceil((a + .4) / step) * step + step / 2; x < b - .6; x += step) out.push(x);
  };
  for (const c of cuts) { if (c.to <= info.from || c.from >= info.to) continue; seg(cursor, Math.max(cursor, c.from)); cursor = Math.max(cursor, c.to); }
  seg(cursor, info.to);
  return out;
}

export interface ShellBuild {
  batches: Map<string, Batcher>;
  atlas: SignAtlas;
  decals: SignAtlas;
  signBatch: Batcher;
  /** Weathering / paper decal atlas (rust runs, leaks, tide lines, posters). */
  grime: DecalSet;
  /** Per-space instanced small parts; emitted into the space batch by the dressing pass. */
  scatter: Map<string, Scatter>;
  fixtures: {position: V3; color: string; intensity: number; range: number; space: string; mount: 'ceiling' | 'wall'; dir: V3}[];
  /** Point at the inner wall face, offset `o` into the room. */
  onWall(space: string, side: Side, along: number, y: number, o: number): V3;
  dispose(): void;
}

const PI2 = Math.PI / 2;

/** Shared instanced part definitions (one geometry per key, all spaces). */
export function defineScatterParts(sc: Scatter, m: LivingMaterials, geos: Map<string, T.BufferGeometry>) {
  const g = (k: string, make: () => T.BufferGeometry) => { let x = geos.get(k); if (!x) { x = make(); geos.set(k, x); } return x; };
  sc.define('rivet', g('rivet', () => new T.CylinderGeometry(.014, .017, .012, 6)), m.frame);
  sc.define('bolt', g('bolt', () => new T.CylinderGeometry(.02, .02, .025, 6)), m.chrome);
  sc.define('clamp', g('clamp', () => new T.TorusGeometry(.06, .012, 4, 10)), m.frame);
  sc.define('paper', g('paper', () => new T.BoxGeometry(.21, .002, .297)), m.paper);
  sc.define('can', g('can', () => new T.CylinderGeometry(.033, .033, .12, 10)), m.chrome);
  sc.define('cup', g('cup', () => new T.CylinderGeometry(.045, .035, .1, 10, 1, true)), m.porcelain);
  sc.define('chunk', g('chunk', () => new T.DodecahedronGeometry(.08, 0)), m.concrete);
  sc.define('tile', g('tile', () => new T.BoxGeometry(.58, .018, .58)), m.ceiling);
  sc.define('shard', g('shard', () => new T.BoxGeometry(.25, .012, .18)), m.ceiling);
  sc.define('book', g('book', () => new T.BoxGeometry(.17, .035, .24)), m.paintDark);
  sc.define('bookRed', g('book', () => new T.BoxGeometry(.17, .035, .24)), m.bandRed);
  sc.define('binder', g('binder', () => new T.BoxGeometry(.06, .3, .27)), m.trim);
  sc.define('bottle', g('bottle', () => new T.CylinderGeometry(.02, .035, .24, 8)), m.glassSoft);
  sc.define('cableClip', g('cableClip', () => new T.BoxGeometry(.05, .03, .08)), m.trim);
  // Personal effects left mid-shift (origin at the resting face; per-instance colour = paint/dye).
  const base = (k: string, make: () => T.BufferGeometry) => g(k, () => { const x = make(); x.computeBoundingBox(); x.translate(0, -x.boundingBox!.min.y, 0); return x; });
  sc.define('mug', base('mug', () => {
    const body = new T.LatheGeometry([[0, 0], [.038, 0], [.042, .004], [.042, .095], [.037, .095], [.035, .008], [0, .008]].map(([x, y]) => new T.Vector2(x, y)), 12);
    const handle = new T.TorusGeometry(.026, .007, 5, 8, Math.PI); handle.rotateZ(-Math.PI / 2); handle.translate(.042, .048, 0);
    return mergeGeometries([body, handle], false)!;
  }), m.porcelain);
  sc.define('lunchbox', base('lunchbox', () => new T.BoxGeometry(.24, .085, .17)), m.plastic);
  sc.define('radio', base('radio', () => {
    const body = new T.BoxGeometry(.065, .17, .04), ant = new T.CylinderGeometry(.006, .008, .1, 5); ant.translate(.02, .135, 0);
    return mergeGeometries([body, ant], false)!;
  }), m.plastic);
  sc.define('hardhat', base('hardhat', () => new T.LatheGeometry([[0, 0], [.17, 0], [.17, .008], [.125, .012], [.125, .05], [.11, .1], [.07, .135], [0, .145]].map(([x, y]) => new T.Vector2(x, y)), 14)), m.plastic);
  sc.define('jacket', base('jacket', () => {
    const p = new T.SphereGeometry(1, 12, 6); const a = p.getAttribute('position');
    for (let i = 0; i < a.count; i++) { const x = a.getX(i), z = a.getZ(i); a.setY(i, Math.max(-.2, a.getY(i)) * (.6 + .4 * Math.sin(x * 5 + z * 3))); }
    p.scale(.32, .07, .26); p.computeVertexNormals(); return p;
  }), m.fabric);
  sc.define('towel', base('towel', () => new T.BoxGeometry(.62, .012, .34)), m.fabric);
  sc.define('glove', base('glove', () => new T.BoxGeometry(.1, .028, .23)), m.fabric);
  sc.define('notebook', base('notebook', () => new T.BoxGeometry(.15, .014, .21)), m.plastic);
  sc.define('clipboard', base('clipboard', () => {
    const board = new T.BoxGeometry(.23, .006, .32), clip = new T.BoxGeometry(.09, .014, .03); clip.translate(0, .006, -.14);
    return mergeGeometries([board, clip], false)!;
  }), m.veneer);
  sc.define('frame', base('frame', () => { const f = new T.BoxGeometry(.13, .18, .014); f.rotateX(-.25); return f; }), m.plastic);
  sc.define('thermos', base('thermos', () => new T.CylinderGeometry(.038, .04, .27, 10)), m.chrome);
  sc.define('boot', base('boot', () => {
    const sole = new T.BoxGeometry(.11, .035, .29), shaft = new T.BoxGeometry(.1, .2, .12); shaft.translate(0, .11, -.08);
    return mergeGeometries([sole, shaft], false)!;
  }), m.rubber);
  sc.define('wrench', base('wrench', () => new T.BoxGeometry(.035, .012, .26)), m.chrome);
  sc.define('screwdriver', base('screwdriver', () => { const x = new T.CylinderGeometry(.012, .012, .2, 6); x.rotateZ(Math.PI / 2); return x; }), m.plastic);
  sc.define('torch', base('torch', () => { const x = new T.CylinderGeometry(.024, .02, .2, 8); x.rotateZ(Math.PI / 2); return x; }), m.plastic);
  sc.define('tray', base('tray', () => new T.BoxGeometry(.45, .02, .33)), m.plastic);
  sc.define('plate', base('plate', () => new T.CylinderGeometry(.12, .09, .018, 14)), m.porcelain);
  sc.define('tape', base('tape', () => { const x = new T.TorusGeometry(.045, .018, 5, 12); x.rotateX(Math.PI / 2); return x; }), m.plastic);
  sc.define('pen', base('pen', () => { const x = new T.CylinderGeometry(.005, .005, .14, 5); x.rotateZ(Math.PI / 2); return x; }), m.plastic);
  sc.define('bucket', base('bucket', () => new T.CylinderGeometry(.15, .12, .3, 12, 1, true)), m.plastic);
  sc.define('jug', base('jug', () => new T.BoxGeometry(.13, .26, .13)), m.plastic);
  sc.define('ashtray', base('ashtray', () => new T.CylinderGeometry(.06, .055, .025, 10)), m.glassSoft);
  sc.define('badge', base('badge', () => new T.BoxGeometry(.055, .004, .085)), m.plastic);
  sc.define('mask', base('mask', () => { const x = new T.SphereGeometry(.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); x.scale(1, .7, 1.1); return x; }), m.rubber);
  sc.define('cigs', base('cigs', () => new T.BoxGeometry(.055, .022, .088)), m.plastic);
  sc.define('slipper', base('slipper', () => new T.BoxGeometry(.1, .035, .27)), m.fabric);
}

/** Small-prop keys counted as personal effects in dressing density reports. */
export const PERSONAL_PARTS = ['mug', 'lunchbox', 'radio', 'hardhat', 'jacket', 'towel', 'glove', 'notebook', 'clipboard', 'frame', 'thermos', 'boot', 'wrench', 'screwdriver', 'torch', 'tray', 'plate', 'tape', 'pen', 'bucket', 'jug', 'ashtray', 'badge', 'mask', 'cigs', 'slipper'] as const;
/** Older loose-item parts (also counted as small props; loose paper sheets are not). */
export const LOOSE_PARTS = ['cup', 'can', 'book', 'bookRed', 'binder', 'bottle'] as const;

export function buildShells(m: LivingMaterials): ShellBuild {
  const batches = new Map<string, Batcher>();
  const owned: T.Material[] = [];
  const signBatch = new Batcher('living-signage');
  SignAtlas.housing = {plate: m.trim, box: m.frame, bolt: m.chrome};
  const grime = new DecalSet();
  const scatter = new Map<string, Scatter>(), scatterGeos = new Map<string, T.BufferGeometry>();
  const scat = (id: string) => { let s = scatter.get(id); if (!s) { s = new Scatter(); defineScatterParts(s, m, scatterGeos); scatter.set(id, s); } return s; };
  for (const s of LIVING_SPACES) scat(s.id);
  const atlas = new SignAtlas(signBatch, false), decals = new SignAtlas(signBatch, true);
  const silt = wearVariant(m.concrete, {silt: 1, grime: 0, bio: .2}, owned); silt.color.set('#6e675a');
  const ceilStain = wearVariant(m.ceiling, {grime: .9, bio: .4}, owned); ceilStain.color.set('#86704e');
  const ceilRot = wearVariant(m.ceiling, {grime: 1, bio: .9}, owned); ceilRot.color.set('#4d4a38');
  const hallMats = {
    wallTile: wearVariant(m.wallTile, {floorY: -9}, owned), veneer: wearVariant(m.veneer, {floorY: -9}, owned),
    wallpaper: wearVariant(m.wallpaper, {floorY: -9}, owned), floorTile: wearVariant(m.floorTile, {floorY: -9}, owned),
    frame: wearVariant(m.frame, {floorY: -9}, owned), paintDark: wearVariant(m.paintDark, {floorY: -9}, owned),
  };
  const shaftD = {rust: wearVariant(m.rustSheet, {floorY: -60}, owned), ind: wearVariant(m.indSteel, {floorY: -60}, owned), frame: wearVariant(m.frame, {floorY: -60}, owned)};
  withCeilingStains(ceilStain, .95); withCeilingStains(ceilRot, .95);
  // Corridor repaint campaigns: every corridor has its own scheme, and part-way along a later, patchier
  // campaign (or a tiled section) takes over, so C1/C2/C3/C5 never read as one template.
  const paintCache = new Map<string, T.Material>();
  const repaint = (src: T.MeshStandardMaterial, col: string) => {
    const k = src.name + col; let p = paintCache.get(k);
    if (!p) { const v = wearVariant(src, {}, owned); v.color.set(col); p = v; paintCache.set(k, p); }
    return p;
  };
  const CORRIDOR_PAINT: Record<string, {split: number[]; zones: {up: string; low: string}[]}> = {
    C1: {split: [.58], zones: [{up: '#8e9a93', low: '#3c5853'}, {up: '#9a9480', low: '#4c4a42'}]},
    C2: {split: [.4, .75], zones: [{up: '#8d8a83', low: '#5b302b'}, {up: '#7e6a58', low: '#5b302b'}, {up: '#8d8a83', low: 'tile'}]},
    C3: {split: [.33], zones: [{up: '#9a8f76', low: '#55462c'}, {up: '#6f8079', low: '#3b4440'}]},
    C5: {split: [.5], zones: [{up: '#7d8a96', low: '#2f3f52'}, {up: '#7d8a96', low: 'tile'}]},
  };
  /** Paint zone of a wall point in a corridor (null outside the scheme). */
  const zoneOf = (s: LivingSpace, side: Side, a: number) => {
    const scheme = CORRIDOR_PAINT[s.id]; if (!scheme) return null;
    const info = sideInfo(s, side), longX = s.maxX - s.minX > s.maxZ - s.minZ;
    const pos = longX ? (info.axis === 'x' ? info.at : a) : (info.axis === 'z' ? info.at : a);
    const t = longX ? (pos - s.minX) / (s.maxX - s.minX) : (pos - s.minZ) / (s.maxZ - s.minZ);
    let i = 0; while (i < scheme.split.length && t > scheme.split[i]) i++;
    return scheme.zones[i];
  };
  const zoneCuts = (s: LivingSpace, side: Side, a: number, b: number) => {
    const scheme = CORRIDOR_PAINT[s.id]; if (!scheme) return [[a, b]];
    const longX = s.maxX - s.minX > s.maxZ - s.minZ, info = sideInfo(s, side);
    if ((info.axis === 'x') === longX) return [[a, b]];
    const lo = longX ? s.minX : s.minZ, len = longX ? s.maxX - s.minX : s.maxZ - s.minZ;
    const out: number[][] = []; let cur = a;
    for (const t of scheme.split) { const p = lo + t * len; if (p > cur + .05 && p < b - .05) { out.push([cur, p]); cur = p; } }
    out.push([cur, b]); return out;
  };
  const fixtures: ShellBuild['fixtures'] = [];

  const cutsFor = (s: LivingSpace, side: Side): Cut[] => {
    const info = sideInfo(s, side);
    const out: Cut[] = LIVING_DOORS.filter(d => d.axis === info.axis && Math.abs(d.at - info.at) < 1e-6 && (d.a === s.id || d.b === s.id))
      .map(d => ({from: d.from, to: d.to, bottom: d.bottom, top: d.top, door: d}));
    for (const w of LIVING_WINDOWS) if (w.space === s.id && w.side === side) out.push({...w, window: true});
    return out;
  };

  function onWall(space: string, side: Side, along: number, y: number, o: number): V3 {
    const s = spaceOf(space), info = sideInfo(s, side);
    const inner = info.at + (side === 'W' || side === 'N' ? H : -H) + (side === 'W' || side === 'N' ? o : -o);
    return info.axis === 'x' ? [inner, y, along] : [along, y, inner];
  }

  /** Box mounted on a wall: along a..b, y0..y1, from depth o to o+d into the room. */
  function wallBox(b: Batcher, s: LivingSpace, side: Side, a: number, bb: number, y0: number, y1: number, o: number, d: number, mat: T.Material, solid = false) {
    if (bb - a < 1e-3 || y1 - y0 < 1e-3 || d < 1e-4) return;
    const info = sideInfo(s, side), sign = side === 'W' || side === 'N' ? 1 : -1;
    const f0 = info.at + sign * (H + o), f1 = info.at + sign * (H + o + d);
    const lo = Math.min(f0, f1), hi = Math.max(f0, f1);
    if (info.axis === 'x') b.slab([lo, y0, a], [hi, y1, bb], mat, {solid});
    else b.slab([a, y0, lo], [bb, y1, hi], mat, {solid});
  }

  function segments(from: number, to: number, bottom: number, top: number, cuts: Cut[]) {
    const out: {a: number; b: number; y0: number; y1: number; full: boolean}[] = [];
    const sorted = cuts.filter(c => c.to > from && c.from < to).sort((p, q) => p.from - q.from);
    let cursor = from;
    for (const c of sorted) {
      const a = Math.max(from, c.from), b = Math.min(to, c.to);
      if (a - cursor > 1e-3) out.push({a: cursor, b: a, y0: bottom, y1: top, full: true});
      if (c.bottom - bottom > 1e-3) out.push({a, b, y0: bottom, y1: Math.min(top, c.bottom), full: false});
      if (top - c.top > 1e-3) out.push({a, b, y0: Math.max(bottom, c.top), y1: top, full: false});
      cursor = Math.max(cursor, b);
    }
    if (to - cursor > 1e-3) out.push({a: cursor, b: to, y0: bottom, y1: top, full: true});
    return out;
  }

  for (const s of LIVING_SPACES) {
    const b = new Batcher(`living-shell-${s.id}`); batches.set(s.id, b);
    b.reseed(s.id.charCodeAt(0) * 131 + (s.id.charCodeAt(1) || 7) * 17);
    const style = SHELL_STYLE[s.id];
    const f = s.floorY, c = s.ceilY, W = s.maxX - s.minX, D = s.maxZ - s.minZ;
    const hall = s.id === 'A', deep = s.id === 'D';
    const mat = {
      wallTile: hall ? hallMats.wallTile : m.wallTile, veneer: hall ? hallMats.veneer : m.veneer, wallpaper: hall ? hallMats.wallpaper : m.wallpaper,
      floorTile: hall ? hallMats.floorTile : m.floorTile, frame: hall ? hallMats.frame : deep ? shaftD.frame : m.frame,
      rust: deep ? shaftD.rust : m.rustSheet, ind: deep ? shaftD.ind : m.indSteel, paintDark: hall ? hallMats.paintDark : m.paintDark,
    };
    const baseWall: T.Material = style === 'ind' ? mat.ind : style === 'shaft' ? mat.rust : style === 'laundry' ? m.indGreen
      : style === 'security' ? m.paintSecurity : style === 'office' ? m.paintCream : style === 'gallery' ? m.paintDark : mat.wallpaper;

    // ---------------------------------------------------------------- floor & ceiling slabs
    const floorMat: T.Material = ({res: m.carpet, ind: m.plate, shaft: m.concrete, hall: mat.floorTile, office: m.carpetRed, laundry: m.floorTile, security: m.linoleum, gallery: m.floorTile, alex: m.carpet} as Record<ShellStyle, T.Material>)[style];
    b.slab([s.minX, f - .5, s.minZ], [s.maxX, f, s.maxZ], style === 'res' || style === 'alex' ? m.linoleum : floorMat);
    const skylight = hall ? {x0: 146, x1: 164, z0: 53, z1: 71} : null;
    const ceilMat: T.Material = style === 'ind' || style === 'shaft' || style === 'laundry' ? m.plate : style === 'security' ? m.ceiling : m.ceiling;
    if (skylight) {
      for (const [x0, x1, z0, z1] of [[s.minX, skylight.x0, s.minZ, s.maxZ], [skylight.x1, s.maxX, s.minZ, s.maxZ], [skylight.x0, skylight.x1, s.minZ, skylight.z0], [skylight.x0, skylight.x1, skylight.z1, s.maxZ]])
        b.slab([x0, c, z0], [x1, c + .5, z1], ceilMat);
    } else b.slab([s.minX, c, s.minZ], [s.maxX, c + .5, s.maxZ], ceilMat);

    // Carpet runner over linoleum in residential corridors; the runner edge bead gives scale.
    if (style === 'res' || style === 'alex') {
      const along = W > D ? 'x' : 'z', inset = Math.min(1.4, (Math.min(W, D) - 2) * .2);
      // Corridors: tread-plate walkway with rubber edge seals; J1 and the Alex side keep carpet.
      const runner: T.Material = s.kind === 'corridor' ? m.tread : s.id === 'J1' ? m.carpetRed : m.carpet;
      if (along === 'x') {
        b.slab([s.minX + .3, f, s.minZ + H + inset], [s.maxX - .3, f + .025, s.maxZ - H - inset], runner);
        if (s.kind === 'corridor') for (const z of [s.minZ + H + inset, s.maxZ - H - inset]) b.slab([s.minX + .3, f, z - .04], [s.maxX - .3, f + .03, z + .04], m.seal);
      } else {
        b.slab([s.minX + H + inset, f, s.minZ + .3], [s.maxX - H - inset, f + .025, s.maxZ - .3], runner);
        if (s.kind === 'corridor') for (const x of [s.minX + H + inset, s.maxX - H - inset]) b.slab([x - .04, f, s.minZ + .3], [x + .04, f + .03, s.maxZ - .3], m.seal);
      }
    }
    if (style === 'office') b.slab([s.minX + H + .4, f, s.minZ + H + .4], [s.maxX - H - .4, f + .02, s.maxZ - H - .4], m.carpetRed);

    // ---------------------------------------------------------------- walls
    const storeys = hall ? [f, ...ATRIUM_BALCONY_Y] : [f];
    for (const side of ['W', 'E', 'N', 'S'] as Side[]) {
      const info = sideInfo(s, side), cuts = cutsFor(s, side);
      const segs = segments(info.from, info.to, f, c, cuts);
      for (const g of segs) {
        // Half of the shared wall belongs to each space: no coplanar duplicates.
        for (const [za, zb] of zoneCuts(s, side, g.a, g.b)) {
          const z = zoneOf(s, side, (za + zb) / 2);
          wallBox(b, s, side, za, zb, g.y0, g.y1, -H, H, z ? repaint(mat.wallpaper as T.MeshStandardMaterial, z.up) : baseWall);
        }
        if (style === 'ind' || style === 'shaft') {
          const stepY = style === 'shaft' ? 4 : 2.6;
          for (let y = f + 1.2; y < c - .3; y += stepY) if (y > g.y0 && y + .16 < g.y1) wallBox(b, s, side, g.a, g.b, y, y + .16, 0, .09, mat.frame);
          if (g.y0 <= f + .01) wallBox(b, s, side, g.a, g.b, f, f + .55, 0, .04, m.plate);
          const ribStep = style === 'shaft' ? 3.5 : 2.5;
          for (let a = Math.ceil((g.a + .4) / ribStep) * ribStep; a < g.b - .4; a += ribStep) {
            wallBox(b, s, side, a - .06, a + .06, g.y0, g.y1, 0, .32, mat.frame);       // web
            wallBox(b, s, side, a - .22, a + .22, g.y0, g.y1, .32, .05, mat.frame);     // flange
          }
          continue;
        }
        if (style === 'laundry') {
          if (g.y0 <= f + .01) { wallBox(b, s, side, g.a, g.b, f, f + 2.4, 0, .025, m.wallTile); wallBox(b, s, side, g.a, g.b, f + 2.4, f + 2.5, 0, .05, m.trim); wallBox(b, s, side, g.a, g.b, f, f + .15, 0, .04, m.rubber); }
          for (let a = Math.ceil((g.a + .5) / 4) * 4; a < g.b - .5; a += 4) wallBox(b, s, side, a - .1, a + .1, Math.max(g.y0, f + 2.5), g.y1, 0, .22, mat.frame);
          continue;
        }
        // Pressure-hull bulkhead per storey: rubber kick seal, dark lower panels with seams, rubber
        // bumper rail, welded upper panels with gasket strips, steel frame ribs, cable-tray cornice.
        // The office keeps its wood wainscot (waterlogged, blackened).
        const human = style === 'alex';
        for (const base of storeys) {
          const top = hall ? (storeys[storeys.indexOf(base) + 1] ?? c) : c;
          const y0 = Math.max(g.y0, base), y1 = Math.min(g.y1, top);
          if (y1 - y0 < .05) continue;
          const wain = human ? 1.0 : style === 'office' ? 2.3 : 1.25;
          const band = (lo: number, hi: number, o: number, d: number, mm: T.Material) => { const a = Math.max(y0, base + lo), z = Math.min(y1, base + hi); if (z > a) wallBox(b, s, side, g.a, g.b, a, z, o, d, mm); };
          band(0, .2, 0, .05, m.seal);
          const lowerPanel: T.Material = style === 'office' ? mat.veneer : mat.paintDark;
          if (style === 'gallery') {
            // Quilted vinyl panels between steel frames (visitor side of the glass).
            band(.2, wain, 0, .03, mat.paintDark);
            const pz0 = base + wain + .15, pz1 = Math.min(top - 1.1, base + wain + 2.6);
            for (let a = g.a + .1; a + .9 < g.b; a += 1.25) for (let y = pz0; y + .6 < pz1; y += .82) if (y >= y0 && y + .78 <= y1) {
              const e = Math.min(a + 1.15, g.b - .1); wallBox(b, s, side, a, e, y, y + .78, 0, .09, m.padTeal);
            }
          } else {
            band(.2, wain, 0, .012, m.seal);
            for (let a = g.a + .03; a < g.b - .1; a += 1.22) {
              const e = Math.min(a + 1.18, g.b - .03); const lo = Math.max(y0, base + .23), hi = Math.min(y1, base + wain - .03);
              const z = zoneOf(s, side, (a + e) / 2);
              const lp = !z ? lowerPanel : z.low === 'tile' ? m.wallTile : repaint(mat.paintDark as T.MeshStandardMaterial, z.low);
              if (hi > lo && e > a) wallBox(b, s, side, a, e, lo, hi, 0, .035, lp);
            }
            // Gasket strips on the upper bulkhead (every second panel joint) and one horizontal seam.
            for (let a = g.a + 2.44; a < g.b - .3; a += 2.44) {
              const lo = Math.max(y0, base + wain + .12), hi = Math.min(y1, top - (human ? .3 : .95));
              if (hi > lo) wallBox(b, s, side, a - .025, a + .025, lo, hi, 0, .014, m.seal);
            }
            band(wain + 1.5, wain + 1.54, 0, .014, m.seal);
          }
          band(wain, wain + .12, 0, .075, style === 'office' ? mat.veneer : m.rubber);
          band(wain + .035, wain + .065, .075, .012, m.chrome);
          const cornice = human ? .25 : hall ? .6 : .9;
          // Cornice: cable tray with conduits instead of moulding.
          band(top - base - cornice, top - base - cornice + .05, 0, human ? .14 : .34, mat.frame);
          band(top - base - cornice + .05, top - base - cornice + .14, human ? .12 : .3, .02, mat.frame);
          band(top - base - cornice + .07, top - base - cornice + .11, .06, .05, m.rubber);
          band(top - base - cornice + .07, top - base - cornice + .11, .15, .05, m.trim);
          band(top - base - .06, top - base, 0, .06, m.trim);
          const pil = human ? 3.2 : 4.2;
          if (g.full) for (let a = g.a + pil * .5; a < g.b - .6; a += pil) {
            const lo = Math.max(y0, base), hi = Math.min(y1, top);
            if (hi <= lo) continue;
            // Frame rib: web, face flange, foot gusset; rivet rows on the flange (instanced).
            wallBox(b, s, side, a - .05, a + .05, lo, hi, 0, .14, mat.frame);
            wallBox(b, s, side, a - .17, a + .17, lo, hi, .14, .03, mat.frame);
            wallBox(b, s, side, a - .24, a + .24, lo, Math.min(hi, lo + .22), 0, .2, mat.frame);
            if (s.pod) for (let y = lo + .35; y < Math.min(hi, lo + 3.2); y += .22) for (const da of [-.12, .12]) {
              const p = onWall(s.id, side, a + da, y, .175);
              scat(s.id).put('rivet', p, side === 'W' ? [0, 0, -PI2] : side === 'E' ? [0, 0, PI2] : side === 'N' ? [PI2, 0, 0] : [-PI2, 0, 0]);
            }
          }
        }
      }
      // ---------------------------------------------------------------- openings
      for (const cut of cuts) {
        if (cut.window) {
          const lo = cut.bottom, hi = cut.top;
          wallBox(b, s, side, cut.from - .18, cut.from, lo - .1, hi + .1, -H, H + .1, mat.frame);
          wallBox(b, s, side, cut.to, cut.to + .18, lo - .1, hi + .1, -H, H + .1, mat.frame);
          wallBox(b, s, side, cut.from - .18, cut.to + .18, hi, hi + .18, -H, H + .1, mat.frame);
          wallBox(b, s, side, cut.from - .25, cut.to + .25, lo - .18, lo, -H, H + .22, mat.veneer);
          for (let a = cut.from + 2.4; a < cut.to - .5; a += 2.4) wallBox(b, s, side, a - .05, a + .05, lo, hi, -H + .2, .1, mat.frame);
          continue;
        }
        const d = cut.door!;
        if (d.kind !== 'open') continue;
        const human = style === 'alex';
        // Pressure-door jambs straddle both wall halves; each space builds only its half.
        const post = .42, proud = .14;
        wallBox(b, s, side, cut.from - post, cut.from, cut.bottom, cut.top + .5, -H, H + proud, m.indSteel);
        wallBox(b, s, side, cut.to, cut.to + post, cut.bottom, cut.top + .5, -H, H + proud, m.indSteel);
        wallBox(b, s, side, cut.from - post, cut.to + post, cut.top, cut.top + .5, -H, H + proud, m.indSteel);
        // Hazard chevrons on the inner reveal.
        wallBox(b, s, side, cut.from - .02, cut.from, cut.bottom + .3, cut.top - .1, -H, H + proud - .02, m.hazard);
        wallBox(b, s, side, cut.to, cut.to + .02, cut.bottom + .3, cut.top - .1, -H, H + proud - .02, m.hazard);
        // Retracted leaf edge and rubber seal visible in the header.
        wallBox(b, s, side, cut.from, cut.to, cut.top - .2, cut.top, -H, H * .6, m.frame);
        wallBox(b, s, side, cut.from, cut.to, cut.top - .26, cut.top - .2, -H, H * .5, m.rubber);
        // Floor sill plate across the throat (this space's half only).
        const info2 = sideInfo(s, side), sign = side === 'W' || side === 'N' ? 1 : -1;
        const z0 = info2.at, z1 = info2.at + sign * (H + .35);
        if (info2.axis === 'x') b.slab([Math.min(z0, z1), cut.bottom, cut.from], [Math.max(z0, z1), cut.bottom + .04, cut.to], m.plate);
        else b.slab([cut.from, cut.bottom, Math.min(z0, z1)], [cut.to, cut.bottom + .04, Math.max(z0, z1)], m.plate);
        // Dog-bolt housings on the posts.
        for (const a of [cut.from - post / 2, cut.to + post / 2]) for (const yy of [cut.bottom + 1, (cut.bottom + cut.top) / 2, cut.top - .8])
          wallBox(b, s, side, a - .12, a + .12, yy - .12, yy + .12, H + proud - H, .08, m.chrome);
        // Signage: name of the space on the other side of this opening.
        if (!human) {
          const other = d.a === s.id ? d.b : d.a;
          const cn = LIVING_SIGN_CN[other] ?? spaceOf(other).name;
          const w = Math.min(3.4, cut.to - cut.from - .4);
          const p = onWall(s.id, side, (cut.from + cut.to) / 2, cut.top + 1.05, H + proud + .02);
          if (p[1] + w / 8 < c - .15) atlas.add(cn, LIVING_EN[other] ?? '', 'enamel', p, info.n, w);
          else if (c - cut.top > .25) {
            // Low corridor: mount the plate on the door header itself (never beside the opening, off the wall).
            const hw = Math.min(w, 4 * (Math.min(c, cut.top + .5) - cut.top - .1));
            atlas.add(cn, LIVING_EN[other] ?? '', 'enamel', onWall(s.id, side, (cut.from + cut.to) / 2, (cut.top + Math.min(c, cut.top + .5)) / 2, H + proud + .02), info.n, hw);
          } else atlas.add(cn, LIVING_EN[other] ?? '', 'enamel', onWall(s.id, side, cut.to + post + w / 2 + .3, cut.top - .2, .03), info.n, w);
        }
      }
    }

    // ---------------------------------------------------------------- ceilings
    const services = style === 'res' || style === 'alex' || style === 'gallery' || style === 'office' || style === 'security';
    if (services && s.id !== 'A') {
      const human = style === 'alex';
      const tbar = 1.2;
      const gx0 = Math.ceil((s.minX + H) / tbar) * tbar, gz0 = Math.ceil((s.minZ + H) / tbar) * tbar;
      for (let x = gx0; x < s.maxX - H; x += tbar) b.slab([x - .02, c - .035, s.minZ + H], [x + .02, c, s.maxZ - H], m.trim, {shadow: false});
      for (let z = gz0; z < s.maxZ - H; z += tbar) b.slab([s.minX + H, c - .035, z - .02], [s.maxX - H, c, z + .02], m.trim, {shadow: false});
      // Missing and hanging tiles: the plenum shows black ducting. Losses cluster (one failed
      // hanger drops its neighbours), so a seed cell grows 1–4 adjacent gaps.
      const r = rng(s.minX * 31 + s.minZ * 7 + 99);
      const nx = Math.max(1, Math.floor((s.maxX - H - gx0) / tbar) - 1), nz = Math.max(1, Math.floor((s.maxZ - H - gz0) / tbar) - 1);
      const taken = new Set<number>();
      const count = Math.round(W * D / (human ? 22 : s.kind === 'corridor' ? 30 : 40));
      for (let i = 0; i < count; i++) {
        let ix = Math.floor(r() * nx), iz = Math.floor(r() * nz);
        const run = 1 + Math.floor(r() * r() * 4);
        for (let k = 0; k < run; k++) {
          if (k) { if (r() < .5) ix = Math.min(nx - 1, Math.max(0, ix + (r() < .5 ? -1 : 1))); else iz = Math.min(nz - 1, Math.max(0, iz + (r() < .5 ? -1 : 1))); }
          if (taken.has(ix * 1000 + iz)) continue; taken.add(ix * 1000 + iz);
          const x = gx0 + ix * tbar, z = gz0 + iz * tbar;
          b.slab([x + .02, c + .01, z + .02], [x + tbar - .02, c + .012, z + tbar - .02], m.rubber, {shadow: false});
          if (r() < .45) {
            const ang = .5 + r() * .8, hinge = r() < .5 ? -1 : 1;
            b.box([x + tbar / 2 + hinge * Math.cos(ang) * tbar * .25, c - Math.sin(ang) * tbar * .5, z + tbar / 2], [tbar * .96, .025, tbar * .96], m.ceiling, {rotZ: hinge * ang});
          }
        }
      }
      // Water-stained, mouldy and sagging tiles laid just under the grid face.
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        if (taken.has(ix * 1000 + iz)) continue;
        const k = r(), x = gx0 + ix * tbar + tbar / 2, z = gz0 + iz * tbar + tbar / 2;
        let leak = false, low = c - .012;
        if (k < .09) { b.box([x, c - .012, z], [tbar * .95, .02, tbar * .95], r() < .6 ? ceilStain : ceilRot, {shadow: false}); leak = r() < .45; }
        else if (k < .15) {
          // Waterlogged tile bellied out of its frame: two halves folded down at the centre line.
          const sag = .05 + r() * .09, a = Math.atan2(sag, tbar / 2), mt = r() < .6 ? ceilStain : m.ceiling;
          const alongX = r() < .5;
          for (const sd of [-1, 1]) {
            if (alongX) b.box([x + sd * tbar / 4, c - .015 - sag / 2, z], [tbar * .49, .02, tbar * .95], mt, {rotZ: sd * a, shadow: false});
            else b.box([x, c - .015 - sag / 2, z + sd * tbar / 4], [tbar * .95, .02, tbar * .49], mt, {rotX: -sd * a, shadow: false});
          }
          leak = r() < .6; low = c - .02 - sag;
        } else if (k < .19) {
          // Tile slipped off one rail: hangs a few centimetres low and skewed in its bay.
          b.box([x + (r() - .5) * .06, c - .03 - r() * .04, z + (r() - .5) * .06], [tbar * .95, .02, tbar * .95], m.ceiling, {rotX: (r() - .5) * .12, rotZ: (r() - .5) * .12, rotY: (r() - .5) * .05, shadow: false});
        }
        if (leak && s.pod) {
          // Active drip: mineral beads strung under the low point, and the wet mark it keeps on the deck.
          const lx = x + (r() - .5) * .3, lz = z + (r() - .5) * .3;
          for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
            const dx = lx + (r() - .5) * .12, dz = lz + (r() - .5) * .12, len = .025 + r() * .07;
            b.rod([dx, low, dz], [dx, low - len, dz], .0035 + r() * .002, ceilRot, 5);
          }
          grime.floor(b, 'puddle', [lx, f + (s.kind === 'corridor' ? .031 : .003), lz], .5 + r() * .5, .4 + r() * .5, r() * 6.28);
        }
      }
    }
    if (style === 'ind' || style === 'shaft' || style === 'laundry' || s.id === 'A') {
      const span = W < D ? 'x' : 'z', step = style === 'shaft' ? 3.5 : 2.5;
      if (!skylight && style !== 'shaft') {
        if (span === 'x') for (let z = s.minZ + 1.5; z < s.maxZ - 1; z += step) { b.slab([s.minX + H, c - .42, z - .07], [s.maxX - H, c, z + .07], mat.frame); b.slab([s.minX + H, c - .46, z - .2], [s.maxX - H, c - .42, z + .2], mat.frame); }
        else for (let x = s.minX + 1.5; x < s.maxX - 1; x += step) { b.slab([x - .07, c - .42, s.minZ + H], [x + .07, c, s.maxZ - H], mat.frame); b.slab([x - .2, c - .46, s.minZ + H], [x + .2, c - .42, s.maxZ - H], mat.frame); }
      }
    }
    // Corridor services: pipe run, cable tray and hangers along the long axis.
    if (s.kind === 'corridor' || style === 'alex') {
      const along = W > D ? 'x' : 'z', human = style === 'alex', drop = human ? .22 : .5;
      const len0 = along === 'x' ? s.minX + .4 : s.minZ + .4, len1 = along === 'x' ? s.maxX - .4 : s.maxZ - .4;
      const cross0 = along === 'x' ? s.minZ + H : s.minX + H, cross1 = along === 'x' ? s.maxZ - H : s.maxX - H;
      const P = (l: number, x: number, y: number): V3 => along === 'x' ? [l, y, x] : [x, y, l];
      if (style !== 'alex') {
        const pipes: [number, number, T.Material][] = [[cross0 + .35, .16, m.pipe], [cross0 + .78, .1, m.pipe], [cross0 + 1.1, .07, m.chrome]];
        for (const [x, r, mm] of pipes) {
          b.rod(P(len0, x, c - drop), P(len1, x, c - drop), r, mm, 12);
          for (let l = len0 + 1; l < len1; l += 6) b.rod(P(l, x, c - drop), P(l + .12, x, c - drop), r + .025, m.frame, 12);
        }
        const tx = cross1 - .7;
        b.slab(P(len0, tx - .45, c - drop - .62), P(len1, tx + .45, c - drop - .58), m.frame);
        b.slab(P(len0, tx - .47, c - drop - .62), P(len1, tx - .43, c - drop - .45), m.frame);
        b.slab(P(len0, tx + .43, c - drop - .62), P(len1, tx + .47, c - drop - .45), m.frame);
        for (const dx of [-.25, -.1, .05, .2]) b.rod(P(len0, tx + dx, c - drop - .54), P(len1, tx + dx, c - drop - .54), .035, m.rubber, 6);
        for (let l = len0 + .5; l < len1; l += 2) {
          for (const x of [tx - .45, tx + .45]) b.rod(P(l, x, c), P(l, x, c - drop - .62), .015, m.frame, 5);
          b.slab(P(l - .03, cross0 + .1, c - drop - .22), P(l + .03, cross0 + 1.3, c - drop - .18), m.frame);
          for (const x of [cross0 + .2, cross0 + 1.25]) b.rod(P(l, x, c), P(l, x, c - drop - .2), .015, m.frame, 5);
        }
        // Return-air grilles.
        for (let l = len0 + 4; l < len1 - 2; l += 9) {
          const mid = (cross0 + cross1) / 2;
          b.slab(P(l - .6, mid - .45, c - .06), P(l + .6, mid + .45, c - .01), m.frame);
          for (let k = -0.5; k <= .5; k += .1) b.slab(P(l + k - .015, mid - .4, c - .1), P(l + k + .015, mid + .4, c - .05), m.chrome);
        }
      }
    }

    // ---------------------------------------------------------------- silt drifts & floor debris
    if (s.pod || s.kind === 'alex' || s.kind === 'slime') {
      const r = rng(s.minX * 13 + s.minZ * 17 + 5);
      const perim = 2 * (W + D), human = s.kind === 'alex' || s.kind === 'slime';
      const drift = new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      {
        const dp = drift.getAttribute('position'), e3 = Math.exp(-3);
        for (let i = 0; i < dp.count; i++) {
          const x = dp.getX(i), z = dp.getZ(i), rr = Math.min(1, Math.hypot(x, z));
          const n = 1 + .18 * Math.sin(x * 9.1 + z * 3.7) * Math.cos(z * 7.3);
          dp.setY(i, Math.max(0, (Math.exp(-3 * rr * rr) - e3) / (1 - e3)) * n);
        }
        drift.computeVertexNormals();
      }
      for (let i = 0; i < perim / (human ? 1.2 : 2.4); i++) {
        const t = r() * perim; let x: number, z: number;
        if (t < W) { x = s.minX + t; z = s.minZ + H + .2; } else if (t < 2 * W) { x = s.minX + t - W; z = s.maxZ - H - .2; }
        else if (t < 2 * W + D) { x = s.minX + H + .2; z = s.minZ + t - 2 * W; } else { x = s.maxX - H - .2; z = s.minZ + t - 2 * W - D; }
        const along = t < 2 * W, len = (human ? .8 : 1.6) + r() * (human ? 1.5 : 3), wid = (human ? .4 : .7) + r() * .6;
        b.geo(drift.clone(), silt, [x, f - .02, z], new T.Euler(0, along ? 0 : Math.PI / 2, 0), [len, (human ? .07 : .13) + r() * .12, wid]);
      }
      // Scattered fallen ceiling tiles / paper / cups in residential spaces.
      if (style !== 'ind' && style !== 'shaft') for (let i = 0; i < W * D / 30; i++) {
        const x = s.minX + 1 + r() * (W - 2), z = s.minZ + 1 + r() * (D - 2), k = r();
        if (k < .5) b.box([x, f + .03, z], [.58, .02, .58], m.ceiling, {rotY: r() * 3, rotX: (r() - .5) * .15});
        else if (k < .8) b.box([x, f + .012, z], [.21, .002, .29], m.paper as T.Material, {rotY: r() * 3});
        else b.rod([x, f + .04, z], [x + .02, f + .04, z + .11], .04, m.porcelain, 8);
      }
      drift.dispose();
    }

    // ---------------------------------------------------------------- weathering decals
    // Placed between frame ribs (never across them) so nothing reads as a floating sheet.
    if (s.pod || s.kind === 'alex') {
      const r = rng(s.minX * 7 + s.minZ * 11 + 17), human = s.kind === 'alex';
      const resLike = !(style === 'ind' || style === 'shaft' || style === 'laundry');
      const wain = human ? 1.0 : style === 'office' ? 2.3 : 1.25;
      const step = resLike ? (human ? 3.2 : 4.2) : style === 'shaft' ? 3.5 : style === 'laundry' ? 4 : 2.5;
      for (const side of ['W', 'E', 'N', 'S'] as Side[]) {
        const info = sideInfo(s, side), cuts = cutsFor(s, side);
        for (const g of segments(info.from, info.to, f, c, cuts)) {
          if (!g.full || g.b - g.a < 2) continue;
          // Rib positions for each style (see the wall builders above); decals sit midway between.
          const mids: number[] = [];
          if (resLike) for (let a = g.a + step; a < g.b - .6; a += step) mids.push(a);
          else for (let a = Math.ceil((g.a + .4) / step) * step + step / 2; a < g.b - .6; a += step) mids.push(a);
          if (!mids.length) mids.push((g.a + g.b) / 2);
          const span = Math.min(step - (resLike ? .5 : .45), 2.4);
          for (const a of mids) {
            const k = r(), topY = resLike ? c - (human ? .3 : hall ? .6 : .9) - .05 : c - .2;
            if (k < .24) {
              const h = Math.min(topY - f - .4, 1.2 + r() * 1.8), w = span * (.25 + r() * .3);
              grime.wall(b, 'rust', onWall(s.id, side, a + (r() - .5) * (span - w) * .5, topY - h / 2, .016), info.n, w, h, 0, r() < .5);
            } else if (k < .4) {
              const h = Math.min(topY - f - .3, 1.6 + r() * 1.8), w = span * (.18 + r() * .22);
              grime.wall(b, 'leak', onWall(s.id, side, a, topY - h / 2, .017), info.n, w, h);
            }
            if (r() < .55) {
              const w = span * (.6 + r() * .35), h = .5 + r() * .5;
              grime.wall(b, 'grime', onWall(s.id, side, a, f + .25 + h / 2, resLike ? .04 : .012), info.n, w, h, (r() - .5) * .1);
            }
            if (resLike && r() < .3) {
              const w = span * (.5 + r() * .3), h = .6 + r() * .6;
              grime.wall(b, 'stain', onWall(s.id, side, a, Math.min(topY - h / 2 - .1, f + wain + .3 + h / 2 + r() * .8), .018), info.n, w, h, r() * 6);
            }
          }
          // Flood tide line across the whole segment (passes behind ribs and bands).
          const tideY = f + (human ? 1.5 : hall ? 1.9 + r() * .3 : 2.05 + r() * .2);
          if (tideY < c - .5 && r() < .85) grime.wall(b, 'tide', onWall(s.id, side, (g.a + g.b) / 2, tideY, .015), info.n, g.b - g.a - .1, .16);
        }
      }
      // Floor: dark wet patches, silt fans and drag scrapes (flat, below the hull).
      const top = s.kind === 'corridor' ? .03 : style === 'office' ? .022 : 0;
      for (let i = 0; i < W * D / (human ? 25 : 60); i++) {
        const x = s.minX + 1 + r() * (W - 2), z = s.minZ + 1 + r() * (D - 2), k = r();
        const kind = k < .4 ? 'puddle' : k < .75 ? 'silt' : 'scrape';
        const sz = kind === 'scrape' ? [1.4 + r() * 2, .5] : [1.2 + r() * 2.4, 1 + r() * 2];
        grime.floor(b, kind, [x, f + top, z], sz[0], sz[1], r() * 6.28);
      }
    }

    // Shaft depth markings and ladder anchors are in the dressing module; stencil deck ID here.
    if (style === 'shaft') {
      for (let y = f + 4; y < c - 1; y += 5) {
        const tag = s.id === 'S' ? `+${Math.round(y - f)} M` : `${Math.round(y - c)} M`;
        decals.add(tag, '', 'stencil', onWall(s.id, 'S', s.minX + 3, y, .06), [0, 0, -1], 2.4);
        b.slab(onWall(s.id, 'S', s.minX + .6, y - .5, 0), onWall(s.id, 'S', s.minX + 1.6, y - .46, .07), m.hazard);
      }
      decals.add(s.id === 'S' ? '−1 层' : '−2 层 ↓', s.id === 'S' ? 'DECK −1  LIVING QUARTERS' : 'TO DECK −2', 'stencilYellow', onWall(s.id, 'N', (s.minX + s.maxX) / 2, s.id === 'S' ? 2 : -8, .06), [0, 0, 1], 5);
    }
  }

  // ---------------------------------------------------------------- practical fixtures
  for (const L of LIVING_LIGHTS) {
    const s = LIVING_SPACES.find(q => L.position[0] >= q.minX - .01 && L.position[0] <= q.maxX + .01 && L.position[2] >= q.minZ - .01 && L.position[2] <= q.maxZ + .01 && L.position[1] >= q.floorY && L.position[1] <= q.ceilY + .01)!;
    const b = batches.get(s.id)!;
    const dists: [Side, number][] = [['W', L.position[0] - s.minX - H], ['E', s.maxX - H - L.position[0]], ['N', L.position[2] - s.minZ - H], ['S', s.maxZ - H - L.position[2]]];
    dists.sort((p, q) => p[1] - q[1]);
    const ceilGap = s.ceilY - L.position[1];
    const col = L.color.toLowerCase();
    const lamp = col === '#b0413b' ? m.lampRed : col === '#d8954d' || col === '#d07a2b' ? m.lampAmber : col === '#6aa4c4' || col === '#596f80' ? m.lampBlue : m.lampCyan;
    let mount: 'ceiling' | 'wall' = 'ceiling', dir: V3 = [0, -1, 0];
    const [x, , z] = L.position;
    // The gate beacons are part of the gate-F hero; the atrium key light hangs from the skylight lantern (dressing).
    const y = L.position[1];
    if (s.id === 'A' && (L.position[1] > 6 || L.position[1] < 1)) { if (L.position[1] < 1) dir = [0, -.4, .9]; fixtures.push({position: [...L.position] as V3, color: L.color, intensity: L.intensity, range: L.range, space: s.id, mount, dir}); continue; }
    if (dists[0][1] < 1.2 && ceilGap > .3) {
      mount = 'wall'; const side = dists[0][0], n = sideInfo(s, side).n; dir = [n[0] * .5, -.85, n[2] * .5];
      const p = onWall(s.id, side, side === 'W' || side === 'E' ? z : x, y, 0);
      const t: V3 = [n[0], 0, n[2]];
      // Caged bulkhead: back plate, lens, four cage bars, conduit up to the ceiling.
      const along: V3 = [Math.abs(n[2]), 0, Math.abs(n[0])];
      b.box([p[0] + t[0] * .05, y, p[2] + t[2] * .05], [.5 * along[0] + .1 * Math.abs(t[0]), .36, .5 * along[2] + .1 * Math.abs(t[2])], m.frame);
      b.box([p[0] + t[0] * .16, y, p[2] + t[2] * .16], [.38 * along[0] + .12 * Math.abs(t[0]), .22, .38 * along[2] + .12 * Math.abs(t[2])], lamp, {shadow: false});
      for (const k of [-.17, -.06, .06, .17]) b.rod([p[0] + t[0] * .24 + along[0] * k, y - .14, p[2] + t[2] * .24 + along[2] * k], [p[0] + t[0] * .24 + along[0] * k, y + .14, p[2] + t[2] * .24 + along[2] * k], .012, m.chrome, 5);
      b.rod([p[0] + t[0] * .05, y + .18, p[2] + t[2] * .05], [p[0] + t[0] * .05, s.ceilY, p[2] + t[2] * .05], .03, m.frame, 6);
    } else {
      // Pendant/ceiling emergency fixture with a short drop.
      const top = s.ceilY, yy = Math.min(y, top - .25);
      b.rod([x, top, z], [x, yy + .15, z], .025, m.frame, 6);
      b.box([x, yy + .12, z], [1.3, .1, .42], m.frame);
      b.box([x, yy + .04, z], [1.16, .06, .3], lamp, {shadow: false});
      for (const k of [-.45, 0, .45]) b.box([x + k, yy + .02, z], [.02, .08, .44], m.chrome);
    }
    fixtures.push({position: [...L.position] as V3, color: L.color, intensity: L.intensity, range: L.range, space: s.id, mount, dir});
  }

  return {
    batches, atlas, decals, signBatch, fixtures, onWall, grime, scatter,
    dispose() {
      atlas.dispose(); decals.dispose(); grime.dispose(); scatterGeos.forEach(g => g.dispose());
      owned.forEach(o => o.dispose()); batches.forEach(b => b.dispose()); signBatch.dispose();
    },
  };
}
