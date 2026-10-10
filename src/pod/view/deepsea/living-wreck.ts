import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {LIVING_DOORS, type LivingSpace} from '../../content/living-deck-layout';
import {Batcher, rng, type V3} from './living-build';
import {routeClear, spotClear, type DecalKind} from './living-decals';
import {wearVariant, withStaticLights, type LivingMaterials} from './living-materials';
import {Kit, chair, crate, deskToppled, drum, filingCabinet, gurney, mealTrolley, officeDesk, partition, upLight, wetFloorSign, wheelchair} from './living-props';
import {LIVING_WINDOWS, ribMids, spaceOf, type ShellBuild, type Side} from './living-shells';

const PI = Math.PI;
const FACE: Record<Side, number> = {W: PI / 2, E: -PI / 2, N: 0, S: PI};
const NORMAL: Record<Side, V3> = {W: [1, 0, 0], E: [-1, 0, 0], N: [0, 0, 1], S: [0, 0, -1]};

// ================================================================== hanging registry

/** What a hanging element is fixed to (checked by tools/living-dressing-check.ts). */
/** `line`: hangs from another registered hanger (e.g. a sheet pegged on a wall-to-wall clothes line). */
export type HangHost = 'ceiling' | 'wall' | 'balcony' | 'tray' | 'beam' | 'skylight' | 'line';
export interface LivingHanger { id: string; space: string; top: V3; bottom: V3; host: HangHost }
/** Every suspended dressing element (cables, banners, strands, dangling fixtures) and its support point. */
export const LIVING_HANGERS: LivingHanger[] = [];
export function hang(id: string, space: string, top: V3, bottom: V3, host: HangHost) { LIVING_HANGERS.push({id, space, top, bottom, host}); }

/** Fountain up-light fixtures (models only; the lighting pass decides emission). */
export interface LivingUplight { id: string; position: V3; aim: V3; state: 'intact' | 'cracked' | 'toppled' }
export const LIVING_UPLIGHTS: LivingUplight[] = [];
/** Inflow curtain column and the cold work light standing beside it (lens centre + aim), for the render accents. */
export const LIVING_CURTAIN = {x: 0, z: 0, top: 0, floor: 0, lamp: [0, 0, 0] as V3, aim: [0, 1, 0] as V3};

/** Build report for the dressing check / art review. */
export const LIVING_WRECK_REPORT = {
  /** Small "just left" props placed per space by this pass (instanced + kit pieces). */
  props: {} as Record<string, number>,
  modules: [] as {space: string; kind: string; at: V3}[],
  identifiers: {} as Record<string, string>,
  skipped: 0,
};

const PLASTIC = ['#c9b23a', '#c45a2a', '#3c6f9a', '#d8d4c8', '#3a3d3a', '#8a2a24', '#4a7a5a'];
const CLOTH = ['#3c4a52', '#6e5e44', '#7a2e28', '#9a9688', '#c9c0a8', '#2f4a3a', '#5a4a5e'];
const MUG = ['#e0ddd2', '#7a2e28', '#2c4f6a', '#c9b23a', '#d8d4c8'];

/**
 * Damage modules along the corridors, "just left" personal effects in every room, the R5 office
 * subdivision, the atrium's slime-covered clock-tower landmark with its up-light fixtures, and the
 * sediment inflow curtain under the cracked skylight. Visual only; everything in the pod's height
 * band is checked against the route volume before it is placed.
 */
export function buildWreck(m: LivingMaterials, shells: ShellBuild, solids: T.Box3[], owned: {dispose(): void}[], root: T.Group) {
  const B = (id: string) => shells.batches.get(id)!;
  const onWall = shells.onWall, grime = shells.grime;
  const wallKit = (space: string, side: Side, along: number, y: number, o = 0) => Kit.at(B(space), onWall(space, side, along, y, o), FACE[side]);
  const rep = LIVING_WRECK_REPORT; rep.props = {}; rep.modules = []; rep.identifiers = {}; rep.skipped = 0;
  LIVING_UPLIGHTS.length = 0; LIVING_CURTAIN.lamp = [0, 0, 0];
  const ownedM = owned as T.Material[];
  const box3 = (a: V3, b: V3) => new T.Box3(new T.Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])), new T.Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])));
  const clear = (a: V3, b: V3) => routeClear(box3(a, b));
  const count = (space: string, n = 1) => { rep.props[space] = (rep.props[space] ?? 0) + n; };
  /** Instanced small prop resting on a surface at p (p.y = surface height). */
  const put = (space: string, key: string, p: V3, yaw = 0, color?: string, tilt: V3 = [0, 0, 0], s: V3 = [1, 1, 1]) => {
    if (!clear([p[0] - .2, p[1], p[2] - .2], [p[0] + .2, p[1] + .3, p[2] + .2])) { rep.skipped++; return; }
    shells.scatter.get(space)!.put(key, p, [tilt[0], yaw, tilt[2]], s, color); count(space);
  };
  const pick = <X>(arr: readonly X[], r: () => number) => arr[(r() * arr.length) | 0];
  /** Floor kit at p only if the prop (radius r, height h) stays off the route. */
  const at = (space: string, p: V3, rotY: number, r: number, h: number, extra?: V3) => {
    if (!spotClear(p, r, h)) { rep.skipped++; return null; }
    return Kit.at(B(space), p, rotY, extra);
  };
  const tape = (b: Batcher, side: Side, space: string, along: number, y: number, w: number, h: number, o: number) => {
    const k = Kit.at(b, onWall(space, side, along, y, o + .001), FACE[side]);
    for (const s of [-1, 1]) k.box([s * w * .38, h / 2 - .01, .002], [.08, .03, .002], m.paper, [0, 0, s * .3]);
  };
  const poster = (space: string, side: Side, along: number, y: number, kind: DecalKind, w: number, h: number, roll = 0) => {
    const f = spaceOf(space).floorY, o = y - h / 2 - f < 1.4 ? .045 : .02;
    const c = onWall(space, side, along, y, o);
    if (!clear([c[0] - w / 2, c[1] - h / 2, c[2] - w / 2], [c[0] + w / 2, c[1] + h / 2, c[2] + w / 2])) { rep.skipped++; return; }
    grime.wall(B(space), kind, onWall(space, side, along, y, o), NORMAL[side], w, h, roll);
    tape(B(space), side, space, along, y, w, h, o);
  };

  // ---------------------------------------------------------------- blob / gel helpers
  const gelGeo = (seed: number, detail = 2) => {
    const g = new T.IcosahedronGeometry(1, detail), pos = g.getAttribute('position'), rr = rng(seed);
    const bumps = Array.from({length: 6}, () => [rr() * 2 - 1, rr() * 2 - 1, rr() * 2 - 1, .1 + rr() * .25]);
    const v = new T.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); let d = 1;
      for (const [bx, by, bz, a] of bumps) d += a * Math.max(0, v.x * bx + v.y * by + v.z * bz) ** 3;
      v.multiplyScalar(d); if (v.y < -.15) v.y = -.15 - (v.y + .15) * .1; pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const s = mergeVertices(g, 1e-4); g.dispose();
    s.computeVertexNormals();
    const sp = s.getAttribute('position'), uv = new Float32Array(sp.count * 2);
    for (let i = 0; i < sp.count; i++) { uv[i * 2] = sp.getX(i) * .5 + .5; uv[i * 2 + 1] = sp.getY(i) * .5 + .5; }
    s.setAttribute('uv', new T.BufferAttribute(uv, 2));
    return s.toNonIndexed();
  };
  /** Gel lump sitting on a surface (flat side down at p). */
  const gel = (b: Batcher, p: V3, s: V3, seed: number, yaw = 0, mat: T.Material = m.slime) => Kit.at(b, p, yaw).geo(gelGeo(seed), mat, [0, .15 * s[1], 0], undefined, s, 'keep');
  /** Gel mass stuck under a ceiling (flat side up at p). */
  const gelCeil = (b: Batcher, p: V3, s: V3, seed: number) => Kit.at(b, p, seed).geo(gelGeo(seed), m.slime, [0, -.15 * s[1], 0], [PI, 0, 0], s, 'keep');
  /** Gel strand from a ceiling point down to `low` with a bead at the end. */
  const strand = (b: Batcher, space: string, top: V3, low: number, r = .018, host: HangHost = 'ceiling') => {
    const bot: V3 = [top[0], low, top[2]];
    if (!clear([top[0] - r * 3, low - r * 3, top[2] - r * 3], [top[0] + r * 3, top[1], top[2] + r * 3])) { rep.skipped++; return; }
    b.rod(top, bot, r * .45, m.slime, 6, {r2: r});
    Kit.at(b, bot, 0).sphere([0, 0, 0], [r * 2.2, r * 3, r * 2.2], m.slime, 8);
    hang(`gel-strand-${space}-${top[0].toFixed(1)}-${top[2].toFixed(1)}`, space, top, bot, host);
  };

  // ================================================================ corridors: damage modules every 6–8 m
  type Corr = {id: string; along: 'x' | 'z'; l0: number; l1: number; lane: number; sides: [Side, Side]; tray: number | null; grid: boolean; stripe: string; ident: string};
  const CORR: Corr[] = [
    {id: 'C1', along: 'x', l0: 14, l1: 64, lane: 7.25, sides: ['N', 'S'], tray: 11.0, grid: true, stripe: '#2f6d68', ident: 'overturned sanatorium wheelchair under a resident blanket'},
    {id: 'C2', along: 'z', l0: -40, l1: -2, lane: 72.6, sides: ['W', 'E'], tray: 76.0, grid: true, stripe: '#8a2a24', ident: 'CCTV camera dangling by its cable'},
    {id: 'C3', along: 'x', l0: 82, l1: 120, lane: 7.25, sides: ['N', 'S'], tray: 11.0, grid: true, stripe: '#b07a26', ident: 'tipped meal trolley with spilled trays'},
    {id: 'C4', along: 'z', l0: -18, l1: -8, lane: 130.5, sides: ['W', 'E'], tray: 134.0, grid: false, stripe: 'hazard', ident: 'burst hazard-wrapped pipe spool fallen from its hangers'},
    {id: 'C5', along: 'z', l0: 22, l1: 42, lane: 128.8, sides: ['W', 'E'], tray: 132.0, grid: true, stripe: '#2f5a8a', ident: 'overturned restraint gurney'},
    {id: 'C6', along: 'z', l0: 82, l1: 86, lane: 162, sides: ['W', 'E'], tray: null, grid: true, stripe: '#4a7a4a', ident: 'cleaning cart, mop bucket and wet-floor sign'},
    {id: 'C7', along: 'x', l0: 106, l1: 110, lane: 68, sides: ['N', 'S'], tray: null, grid: false, stripe: '#c0602a', ident: 'cable ladder torn loose at one end'},
  ];
  const stripeMats = new Map<string, T.Material>();
  const stripeMat = (c: string) => {
    if (c === 'hazard') return m.hazard;
    let s = stripeMats.get(c); if (!s) { const v = wearVariant(m.paintCream, {grime: .8, rust: .5}, ownedM); v.color.set(c); s = v; stripeMats.set(c, s); }
    return s;
  };
  const sideAt = (s: LivingSpace, side: Side) => side === 'W' ? {axis: 'x', at: s.minX} : side === 'E' ? {axis: 'x', at: s.maxX} : side === 'N' ? {axis: 'z', at: s.minZ} : {axis: 'z', at: s.maxZ};
  /** Wall spans (along-axis) not cut by doors or windows below `y`..`y2`. */
  const wallSpans = (space: string, side: Side, from: number, to: number, y: number, y2: number) => {
    const s = spaceOf(space), info = sideAt(s, side);
    const cuts = LIVING_DOORS.filter(d => d.axis === info.axis && Math.abs(d.at - info.at) < 1e-6 && (d.a === space || d.b === space) && d.top > y && d.bottom < y2).map(d => [d.from, d.to]);
    for (const w of LIVING_WINDOWS) if (w.space === space && w.side === side && w.top > y && w.bottom < y2) cuts.push([w.from, w.to]);
    cuts.sort((p, q) => p[0] - q[0]);
    const out: [number, number][] = []; let c = from;
    for (const [a, b] of cuts) { if (a > c + .2) out.push([c, Math.min(a, to)]); c = Math.max(c, b); }
    if (to > c + .2) out.push([c, to]);
    return out;
  };

  for (const k of CORR) {
    const sp = spaceOf(k.id), b = B(k.id), f = sp.floorY, c = sp.ceilY, r = rng(k.id.charCodeAt(1) * 977);
    const cross0 = k.along === 'x' ? sp.minZ + .3 : sp.minX + .3, cross1 = k.along === 'x' ? sp.maxZ - .3 : sp.maxX - .3;
    const P = (l: number, x: number, y: number): V3 => k.along === 'x' ? [l, y, x] : [x, y, l];
    const yawAlong = k.along === 'x' ? 0 : -PI / 2;
    const wallCross = (side: Side) => side === k.sides[0] ? cross0 : cross1;
    const inward = (side: Side) => side === k.sides[0] ? 1 : -1;
    const n = (side: Side) => NORMAL[side];

    const slab = (p: V3, q: V3, mat: T.Material, o: {shadow?: boolean} = {}) => b.slab([Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2])], [Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2])], mat, o);
    // Identification stripe: painted band on both side walls, broken at door and window openings.
    for (const side of k.sides) {
      const lo = Math.max(k.l0, k.along === 'x' ? sp.minX : sp.minZ) + .35, hi = Math.min(k.l1, k.along === 'x' ? sp.maxX : sp.maxZ) - .35;
      for (const [a, z] of wallSpans(k.id, side, lo, hi, f + 3.45, f + 3.75)) {
        const w = wallCross(side), d = inward(side);
        slab(P(a, w + d * .004, f + 3.5), P(z, w + d * .016, f + 3.68), stripeMat(k.stripe), {shadow: false});
        slab(P(a, w + d * .004, f + 3.44), P(z, w + d * .014, f + 3.47), m.trim, {shadow: false});
      }
    }

    const ceilingDrop = (l: number) => {
      const x0 = k.lane - .6, x1 = k.lane + .6;
      if (k.grid) {
        // Missing grid bays (3.6 × 1.8 m): black plenum with the services showing, a bent T-bar, three tiles
        // hanging by one edge, a light troffer swinging from one corner and insulation sagging through.
        const x0w = k.lane - .9, x1w = k.lane + .9;
        slab(P(l - 1.8, x0w, c - .004), P(l + 1.8, x1w, c - .002), m.rubber, {shadow: false});
        for (const dx of [-.5, .35]) b.rod(P(l - 1.8, k.lane + dx, c + .22), P(l + 1.8, k.lane + dx, c + .22), .07, m.pipe, 10);
        const tb0 = P(l - 1.8, x1w, c - .03), tbLow = P(l + .1, k.lane + .1, 2.0), tb1 = P(l + 1.4, k.lane - .3, 2.35);
        b.rod(tb0, tbLow, .015, m.trim, 5); b.rod(tbLow, tb1, .015, m.trim, 5); hang(`${k.id}-tbar-${l}`, k.id, tb0, tbLow, 'ceiling');
        for (const [dl, sd, ang] of [[-1.2, -1, 1.2], [0, 1, .95], [1.2, -1, .7]] as const) {
          const hinge = P(l + dl, k.lane + sd * .9, c - .02);
          Kit.at(b, hinge, yawAlong, [sd * ang, 0, 0]).box([0, -.3, 0], [.58, .6, .018], m.ceiling);
          hang(`${k.id}-tile-${l}-${dl}`, k.id, hinge, [hinge[0], c - .6, hinge[2]], 'ceiling');
        }
        const tro = P(l + .9, k.lane + .6, c - .02), troLow = P(l + .9, k.lane + .45, c - .62);
        b.rod(tro, troLow, .006, m.chrome, 4);
        Kit.at(b, troLow, yawAlong + .4, [0, 0, 1.1]).box([0, -.45, 0], [.3, .9, .08], m.trim);
        hang(`${k.id}-troffer-${l}`, k.id, tro, [troLow[0], c - 1.05, troLow[2]], 'ceiling');
        // Flex duct dropped out of the plenum.
        const d0 = P(l - .9, k.lane - .35, c + .1), d1 = P(l + .7, k.lane + .25, 2.05);
        b.rod(d0, d1, .14, m.rubber, 10); hang(`${k.id}-duct-${l}`, k.id, d0, d1, 'ceiling');
        // Insulation batts sagging out of the hole.
        Kit.at(b, P(l - .2, k.lane + .3, c - .1), r() * 3, [.3, 0, .2]).box([0, 0, 0], [.9, .1, .55], m.fabric);
        Kit.at(b, P(l - 1.3, k.lane - .4, c - .12), r() * 3, [-.4, 0, .1]).box([0, 0, 0], [.6, .08, .5], m.fabric);
      } else {
        // Industrial run: a duct-hanger strap pair snapped, the hanger rods still dangling.
        for (const s of [-1, 1]) { const t = P(l + s * .8, k.lane + .4, c); const bt = P(l + s * .8 + .05, k.lane + .4, c - .7 - r() * .3); b.rod(t, bt, .01, m.chrome, 4); hang(`${k.id}-rod-${l}-${s}`, k.id, t, bt, 'ceiling'); }
        grime.ceiling(b, 'leak', P(l, k.lane, c), 2.2, 1.6, r() * 3);
      }
      // Floor: tiles, shards, plaster chunks and a dust fan where it landed.
      const fs = shells.scatter.get(k.id)!;
      for (let i = 0; i < 5; i++) fs.put('tile', P(l + (r() - .5) * 2.4, k.lane + (r() - .5) * 2.2, f + .012 + i * .004), [(r() - .5) * .2, r() * 6, (r() - .5) * .15]);
      for (let i = 0; i < 9; i++) fs.put('shard', P(l + (r() - .5) * 3, k.lane + (r() - .5) * 2.8, f + .007), [(r() - .5) * .2, r() * 6, 0]);
      for (let i = 0; i < 5; i++) fs.put('chunk', P(l + (r() - .5) * 1.6, k.lane + (r() - .5) * 1.4, f + .03), [r() * 3, r() * 6, r() * 3], [1 + r(), .5 + r() * .5, 1 + r()]);
      grime.floor(b, 'silt', P(l, k.lane, f + .02), 3, 2.4, r() * 6);
      rep.modules.push({space: k.id, kind: 'ceiling-collapse', at: P(l, k.lane, f)});
    };

    const cableFall = (l: number) => {
      if (k.tray === null) return ceilingDrop(l);
      const sideB = k.sides[1], w = wallCross(sideB);
      for (let i = 0; i < 5; i++) {
        const ll = l + (i - 2) * .14, tz = k.tray + (r() - .5) * .3;
        const pts: V3[] = [P(ll, tz, 1.9), P(ll + .1, w - .25 - i * .05, 1.2), P(ll + .2, w - .3 - i * .06, -1.6), P(ll + .3, w - .5, f + .03)];
        let end = w - .9 - r() * 1.2;
        for (let j = 0; j < 4; j++) { pts.push(P(ll + .3 + (r() - .5) * .8 + j * .25, end, f + .025)); end -= .7 + r() * .8; if (end < k.lane - 1.5) break; }
        const rad = .016 + (i % 3) * .008;
        let ok = true;
        for (let j = 0; j + 1 < pts.length; j++) if (!clear(pts[j], pts[j + 1])) ok = false;
        if (!ok) { rep.skipped++; continue; }
        for (let j = 0; j + 1 < pts.length; j++) b.rod(pts[j], pts[j + 1], rad, i % 3 ? m.rubber : m.pipe, 6);
        hang(`${k.id}-loom-${l}-${i}`, k.id, pts[0], pts[2], 'tray');
      }
      // A cable loop over the lane from two ceiling hangers (lowest point above the hull band).
      const a0 = P(l - 1.4, k.lane + .3, c), a1 = P(l + 1.6, k.lane - .2, c);
      let prev = a0;
      for (let t = 1; t <= 8; t++) {
        const u = t / 8, p = P(l - 1.4 + 3 * u, k.lane + .3 - .5 * u, c - Math.sin(u * PI) * .98);
        b.rod(prev, p, .02, m.rubber, 6); prev = p;
      }
      hang(`${k.id}-loop-${l}`, k.id, a0, P(l, k.lane, c - .98), 'ceiling'); hang(`${k.id}-loop-${l}-b`, k.id, a1, P(l, k.lane, c - .98), 'ceiling');
      grime.wall(b, 'scrape', onWall(k.id, sideB, l, f + 1.2, .02), n(sideB), 1.6, .6);
      rep.modules.push({space: k.id, kind: 'torn-cable-loom', at: P(l, k.lane, f)});
    };

    const wallCollapse = (l: number, side: Side) => {
      const w = wallCross(side), d = inward(side), L = 2.6, run = 1.25, th = Math.asin(run / L);
      // Cavity: dark backing, studs, a sagging wire out of the opening.
      slab(P(l - .65, w + d * .003, f + .02), P(l + .65, w + d * .012, f + 2.3), m.rubber, {shadow: false});
      for (const s of [-.55, 0, .55]) slab(P(l + s - .025, w + d * .01, f), P(l + s + .025, w + d * .09, f + 2.3), m.frame);
      slab(P(l - .65, w + d * .01, f + 2.25), P(l + .65, w + d * .1, f + 2.32), m.frame);
      const wire0 = P(l - .3, w + d * .06, f + 2.2), wire1 = P(l + .1, w + d * .45, f + .4);
      b.rod(wire0, wire1, .012, m.rubber, 5); hang(`${k.id}-wire-${l}`, k.id, wire0, wire1, 'wall');
      for (let i = 0; i < 4; i++) Kit.at(b, P(l + (r() - .5), w + d * (.25 + r() * .6), f + .1), r() * 6).sphere([0, 0, 0], [.22, .1, .16], m.soil, 7);
      // Panel leaning from the floor back onto the wall.
      const zw: V3 = k.along === 'x' ? [0, 0, 1] : [-1, 0, 0], nn = n(side);
      const sinPhi = -(nn[0] * zw[0] + nn[2] * zw[2]);
      const foot = P(l + .15, w + d * run, f);
      if (!clear(P(l - .6, w, f), P(l + .8, w + d * (run + .15), f + 2.3))) { rep.skipped++; return; }
      const kk = Kit.at(b, foot, yawAlong, [sinPhi * th, 0, 0]);
      kk.box([0, L / 2, 0], [1.2, L, .04], m.wallpaper);
      kk.box([0, L / 2, -.03], [1.15, L - .05, .02], m.frame);
      grime.wall(b, 'scratch', onWall(k.id, side, l - 1.6, f + 1.1, .02), n(side), 1.3, .5);
      grime.floor(b, 'grime', P(l, w + d * 1.6, f + .01), 2, .6, k.along === 'x' ? 0 : PI / 2);
      rep.modules.push({space: k.id, kind: 'wall-panel-collapse', at: foot});
    };

    const slimeFall = (l: number) => {
      const blobs: [number, number, number][] = [[0, 0, 1.3], [.9, .5, .8], [-.8, -.4, .7]];
      for (const [dl, dx, s] of blobs) gelCeil(b, P(l + dl, k.lane + dx, c - .02), [s, .32 * s, s * .8], (l * 7 + dl * 13) | 0);
      grime.ceiling(b, 'slime', P(l, k.lane, c - .01), 3.2, 2.4, r() * 6);
      for (let i = 0; i < 7; i++) strand(b, k.id, P(l + (r() - .5) * 2.4, k.lane + (r() - .5) * 1.8, c - .2), 1.95 + r() * .5);
      for (const side of k.sides) {
        grime.wall(b, 'slimeDrip', onWall(k.id, side, l + (r() - .5) * 1.5, f + 4.6, .015), n(side), .9, 2.8);
        strand(b, k.id, P(l + (r() - .5) * 1.2, wallCross(side) + inward(side) * .35, c - .1), f + .1, .022);
      }
      grime.floor(b, 'slime', P(l, k.lane, f + .02), 3.4, 2.6, r() * 6);
      gel(b, P(l + .4, wallCross(k.sides[0]) + .5, f), [.5, .12, .4], (l * 3) | 0);
      rep.modules.push({space: k.id, kind: 'slime-seep', at: P(l, k.lane, f)});
    };

    const overturned = (l: number) => {
      const side = r() < .5 ? k.sides[0] : k.sides[1], w = wallCross(side), d = inward(side);
      const p = P(l, w + d * 1.1, f);
      const kk = at(k.id, p, yawAlong + (r() - .5) * .8, .8, 1.1);
      if (kk) {
        if (r() < .5) { chair(kk.child([0, .22, 0], [PI / 2, 0, 0]), m); chair(kk.child([.9, 0, .3], [0, 2, 0]), m); }
        else { crate(kk.child([0, 0, 0], [0, .3, 0]), m, [.9, .6, .7]); crate(kk.child([.25, .2, .9], [PI / 2 - .2, .1, 0]), m, [.7, .5, .6], m.steel); }
      }
      grime.floor(b, 'grime', P(l - 1, k.lane, f + .01), 2.4, .7, k.along === 'x' ? .1 : PI / 2 + .1);
      rep.modules.push({space: k.id, kind: 'overturned-furniture', at: p});
    };

    // ---- per-corridor identifier
    const ident = (l: number) => {
      const s0 = k.sides[0], w0 = wallCross(s0), d0 = inward(s0);
      if (k.id === 'C1') {
        const kk = at(k.id, P(l, w0 + d0 * 1.4, f), .6, .8, .9);
        if (kk) {
          wheelchair(kk.child([0, .31, 0], [0, 0, PI / 2 - .05]), m);
          kk.child([.9, 0, .6], [0, .8, 0]).sphere([0, .05, 0], [.55, .07, .4], m.carpetRed, 9);
          put(k.id, 'slipper', P(l + 1.1, w0 + d0 * 2.3, f), 1.2, '#7a6a5a'); put(k.id, 'slipper', P(l + 1.35, w0 + d0 * 2.0, f), .4, '#7a6a5a', [0, 0, PI]);
        }
      } else if (k.id === 'C2') {
        const s1 = k.sides[1], w1 = wallCross(s1), d1 = inward(s1);
        const mount = P(l, w1 + d1 * .05, c - .2), cam = P(l + .2, w1 + d1 * .55, .6);
        const kk = Kit.at(b, onWall(k.id, s1, l, c - .2, .02), FACE[s1]);
        kk.box([0, 0, .06], [.2, .2, .12], m.frame); kk.rod([0, -.05, .12], [0, -.2, .4], .025, m.frame, 6);
        b.rod(P(l, w1 + d1 * .4, c - .45), cam, .012, m.rubber, 5);
        if (clear([cam[0] - .3, cam[1] - .3, cam[2] - .3], [cam[0] + .3, cam[1] + .3, cam[2] + .3])) {
          const ck = Kit.at(b, cam, yawAlong, [.4, 0, .9]);
          ck.rbox([0, 0, 0], [.16, .14, .34], m.paintCream, .03); ck.cyl([0, 0, .2], .05, .05, .06, m.darkGlass, 12, [PI / 2, 0, 0]); ck.box([0, .09, 0], [.2, .02, .4], m.paintCream);
          hang(`${k.id}-cctv`, k.id, mount, cam, 'wall');
        } else rep.skipped++;
        grime.floor(b, 'grime', P(l, k.lane, f + .01), 1.2, 1.2, .5);
      } else if (k.id === 'C3') {
        const s1 = k.sides[1], w1 = wallCross(s1), d1 = inward(s1);
        const kk = at(k.id, P(l, w1 + d1 * 1.0, f), .3, .9, .8);
        if (kk) {
          mealTrolley(kk.child([0, .25, 0], [0, 0, PI / 2]), m);
          for (let i = 0; i < 9; i++) {
            const p = P(l - 1.2 + r() * 2.8, w1 + d1 * (.6 + r() * 2.4), f);
            put(k.id, r() < .5 ? 'tray' : 'plate', p, r() * 6, r() < .5 ? '#9a9688' : undefined, [(r() - .5) * .2, 0, 0]);
          }
          for (let i = 0; i < 4; i++) put(k.id, 'mug', P(l - 1 + r() * 2.4, w1 + d1 * (1 + r() * 2), f + .042), r() * 6, pick(MUG, r), [PI / 2, 0, 0]);
          grime.floor(b, 'stain', P(l, w1 + d1 * 1.8, f + .01), 2.4, 1.8, r() * 3);
        }
      } else if (k.id === 'C4') {
        const kk = at(k.id, P(l, k.lane - 1.2, f), .25, 1.4, .5);
        if (kk) {
          kk.rod([-1.3, .18, 0], [1.3, .18, 0], .16, m.pipe, 14);
          for (const s of [-1, 1]) { kk.cyl([s * 1.3, .18, 0], .24, .24, .08, m.frame, 16, [0, 0, PI / 2]); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; kk.cyl([s * 1.34, .18 + Math.sin(a) * .2, Math.cos(a) * .2], .015, .015, .05, m.chrome, 6, [0, 0, PI / 2]); } }
          kk.cyl([.2, .18, 0], .165, .165, .7, m.hazard, 14, [0, 0, PI / 2]);
          kk.box([1.05, .3, .1], [.3, .06, .02], m.rubber, [0, .4, .5]);
        }
        for (const s of [-1, 1]) { const a = P(l + s * 1.4, k.lane - .6, c), bt = P(l + s * 1.4, k.lane - .5, c - .6); b.rod(a, bt, .012, m.chrome, 4); hang(`${k.id}-pipe-hanger-${s}`, k.id, a, bt, 'ceiling'); }
        grime.floor(b, 'puddle', P(l, k.lane - 1, f + .01), 3, 2, .3);
      } else if (k.id === 'C5') {
        const s1 = k.sides[0], w1 = wallCross(s1), d1 = inward(s1);
        const kk = at(k.id, P(l, w1 + d1 * 1.25, f), .15, 1.2, .9);
        if (kk) {
          gurney(kk.child([0, .32, 0], [0, 0, PI / 2 - .04]), m);
          put(k.id, 'jacket', P(l + .7, w1 + d1 * 2.3, f), 2.1, '#c9c0a8');
          put(k.id, 'mask', P(l - .8, w1 + d1 * 2.1, f), .5, '#3a3d3a');
          for (const s of [-1, 1]) kk.box([s * .3, .05, 1.4 + s * .2], [.06, .01, .6], m.rubber, [0, .6 * s, 0]);
        }
      } else if (k.id === 'C6') {
        const s1 = k.sides[0], w1 = wallCross(s1), d1 = inward(s1);
        const kk = at(k.id, P(l, w1 + d1 * .7, f), 0, .7, 1.2);
        if (kk) {
          kk.box([0, .5, 0], [.5, .9, .9], m.bandBlue); kk.box([0, 1.0, .1], [.52, .05, .7], m.trim);
          kk.cyl([0, .35, .62], .2, .18, .4, m.bandYellow, 14); kk.rod([0, .2, .62], [-.15, 1.12, .2], .015, m.veneer, 6);
          for (const z of [-.35, .35]) kk.cyl([0, .05, z], .05, .05, .04, m.rubber, 10, [0, 0, PI / 2]);
          wetFloorSign(Kit.at(b, P(l + .4, w1 + d1 * 1.6, f), 1.1), m);
        }
        grime.floor(b, 'puddle', P(l, k.lane - 1, f + .01), 2.4, 2, 0);
      } else if (k.id === 'C7') {
        // Cable ladder tray torn from its south brackets, hanging from the north bracket.
        const s1 = k.sides[0], w1 = wallCross(s1), d1 = inward(s1);
        const top = P(l - 1.6, w1 + d1 * .25, c - .3), low = P(l + 1.6, w1 + d1 * .33, f + .05);
        Kit.at(b, onWall(k.id, s1, l - 1.6, c - .3, .02), FACE[s1]).box([0, 0, .15], [.08, .08, .3], m.frame);
        const dir = new T.Vector3(...low).sub(new T.Vector3(...top));
        for (const s of [-.2, .2]) { const off = k.along === 'x' ? [0, 0, s] : [s, 0, 0]; b.rod([top[0] + off[0], top[1], top[2] + off[2]], [low[0] + off[0], low[1], low[2] + off[2]], .02, m.frame, 5); }
        for (let t = .05; t < 1; t += .08) { const p = new T.Vector3(...top).addScaledVector(dir, t); b.rod(k.along === 'x' ? [p.x, p.y, p.z - .2] : [p.x - .2, p.y, p.z], k.along === 'x' ? [p.x, p.y, p.z + .2] : [p.x + .2, p.y, p.z], .01, m.frame, 4); }
        for (let i = 0; i < 4; i++) b.rod(top, [low[0] + (r() - .5) * .3, low[1] + .02, low[2] - d1 * r() * .12], .02, i % 2 ? m.rubber : m.pipe, 5);
        hang(`${k.id}-ladder`, k.id, top, low, 'wall');
      }
      rep.identifiers[k.id] = k.ident;
      rep.modules.push({space: k.id, kind: 'identifier', at: P(l, k.lane, f)});
    };

    // ---- module rhythm: 6–8 m apart, identifier takes one slot, kinds rotate so neighbours differ.
    const len = k.l1 - k.l0;
    const slots: number[] = [];
    if (len < 6) slots.push((k.l0 + k.l1) / 2);
    else if (len < 13) slots.push(k.l0 + len * .3, k.l0 + len * .75);
    else { for (let l = k.l0 + 3 + r() * 1.5; l < k.l1 - 2; l += 6 + r() * 2) slots.push(l); }
    const identSlot = slots.length > 2 ? 1 : 0;
    const kinds = ['ceiling', 'slime', 'cables', 'wall', 'overturned'] as const;
    let kind = (k.id.charCodeAt(1) * 3) % kinds.length;
    slots.forEach((l, i) => {
      if (i === identSlot) { ident(l); if (slots.length > 1) return; }
      if (slots.length === 1) { ceilingDrop(l + 1.2); return; }
      const kd = kinds[kind % kinds.length]; kind++;
      if (kd === 'ceiling') ceilingDrop(l);
      else if (kd === 'slime') slimeFall(l);
      else if (kd === 'cables') cableFall(l);
      else if (kd === 'wall') {
        // Never against a dorm door frame: try both walls, step along until clear.
        const doorsOn = (side: Side) => DORM_DOORS.filter(d => d[0] === k.id && d[1] === side).map(d => d[2]);
        const side = r() < .5 ? k.sides[0] : k.sides[1];
        let ll = l, ok = false;
        for (const sd of [side, side === k.sides[0] ? k.sides[1] : k.sides[0]]) {
          for (const dl of [0, 1, -1, 2, -2]) { ll = l + dl; if (doorsOn(sd).every(x => Math.abs(x - ll) > 1.6) && wallSpans(k.id, sd, ll - 1, ll + 1, f, f + 2.4).length === 1 && wallSpans(k.id, sd, ll - 1, ll + 1, f, f + 2.4)[0][1] - wallSpans(k.id, sd, ll - 1, ll + 1, f, f + 2.4)[0][0] > 1.9) { ok = true; wallCollapse(ll, sd); break; } }
          if (ok) break;
        }
        if (!ok) overturned(l);
      } else overturned(l);
    });
    // Water/slime weathering between modules on both walls (a third decal layer: scratches).
    for (const side of k.sides) for (const a of ribMids(k.id, side)) {
      if (a < k.l0 + .5 || a > k.l1 - .5) continue;
      const q = r();
      if (q < .3) grime.wall(b, 'scratch', onWall(k.id, side, a, f + .9 + r() * .6, .02), n(side), 1 + r() * .6, .45, (r() - .5) * .2);
      else if (q < .4) grime.wall(b, 'mould', onWall(k.id, side, a, f + .5, .02), n(side), 1.2, 1);
    }
  }

  // ================================================================ rooms: "just left" personal effects
  const F = -3;
  // ---- R1 laundry: folding tables at (38, −10) and (38, −15.5), top y −2.09.
  {
    const S = 'R1', T1 = F + .91, r = rng(1101);
    put(S, 'mug', [37.7, T1, -8.8], .4, MUG[0]); put(S, 'jug', [38.35, T1, -9.1], .3, '#3c6f9a'); put(S, 'towel', [38.1, T1 + .07, -11.3], .2, '#c9c0a8');
    put(S, 'radio', [37.6, T1, -11.05], 1.4, '#3a3d3a'); put(S, 'clipboard', [38.3, T1, -10.35], .1); put(S, 'pen', [38.15, T1 + .008, -10.1], .8, '#3c6f9a');
    put(S, 'thermos', [37.7, T1, -14.1], 0); put(S, 'lunchbox', [38.2, T1, -17.0], .3, '#c45a2a'); put(S, 'mug', [37.8, T1 + .042, -16.6], 1, MUG[2], [PI / 2, 0, 0]);
    put(S, 'cigs', [38.4, T1, -14.4], .6, '#d8d4c8'); put(S, 'ashtray', [38.3, T1, -14.75], 0); put(S, 'notebook', [37.6, T1, -15.6], .2, '#4a7a5a');
    put(S, 'bucket', [35.5, F, -12.8], 0, '#c9b23a'); put(S, 'bucket', [40.2, F + .15, -18.0], 1.2, '#3c6f9a', [PI / 2, 0, 0]);
    put(S, 'slipper', [45.0, F, -12.3], .2, '#9a9688'); put(S, 'slipper', [45.3, F, -12.0], 2.6, '#9a9688', [0, 0, PI]);
    put(S, 'boot', [26.5, F, -3.5], .3); put(S, 'boot', [26.8, F + .06, -3.2], 1.9, undefined, [0, 0, PI / 2]);
    put(S, 'glove', [36.4, F, -11.6], .7, '#c9b23a'); put(S, 'glove', [36.6, F, -11.3], 2.2, '#c9b23a');
    for (let i = 0; i < 5; i++) put(S, 'towel', [30 + r() * 14, F + .002, -3 - r() * 19], r() * 6, pick(CLOTH, r), [(r() - .5) * .1, 0, (r() - .5) * .1]);
    put(S, 'jacket', [33.2, F, -19.5], 1.1, '#3c4a52'); put(S, 'jacket', [42.6, F, -5.4], 2.4, '#6e5e44');
    for (const [x, z] of [[27.6, -19.6], [28.1, -19.5], [30.9, -19.7]] as const) put(S, 'jug', [x, F, z], r() * 6, pick(['#3c6f9a', '#d8d4c8', '#c45a2a'], r));
    put(S, 'tray', [41.5, F, -9.5], .4, '#9a9688'); for (let i = 0; i < 4; i++) put(S, 'mug', [28 + r() * 16, F + .042, -2 - r() * 20], r() * 6, pick(MUG, r), [PI / 2, 0, 0]);
    put(S, 'frame', [37.95, T1, -12.6], -PI / 2, '#3a3d3a'); put(S, 'badge', [38.0, T1, -13.3], .5, '#d8d4c8');
    poster(S, 'W', -11, 1.0, 'posterSafety', .7, .7, .02); poster(S, 'N', 41.5, .8, 'posterSchedule', .6, .8, -.03);
  }
  // ---- R2 workshop: east bench x 62.85–63.65 / z 19.25–24.75, west bench x 44.35–45.15 / z 27–31 (tops y −2.07).
  {
    const S = 'R2', TB = F + .93, r = rng(1202);
    const ex = (o: number) => 63.65 - o;
    put(S, 'wrench', [ex(.35), TB, 19.9], .3); put(S, 'wrench', [ex(.5), TB, 20.4], 1.7); put(S, 'screwdriver', [ex(.3), TB, 21.0], .2, '#c45a2a');
    put(S, 'screwdriver', [ex(.45), TB, 21.15], .5, '#c9b23a'); put(S, 'screwdriver', [ex(.25), TB, 23.2], 2.8, '#8a2a24'); put(S, 'tape', [ex(.4), TB, 21.5], 0, '#3a3d3a');
    put(S, 'torch', [ex(.55), TB, 22.1], .9, '#c9b23a'); put(S, 'mug', [ex(.6), TB, 23.9], 0, MUG[1]); put(S, 'thermos', [ex(.3), TB, 24.4], 0);
    put(S, 'glove', [ex(.45), TB, 22.6], 1.2, '#6e5e44'); put(S, 'glove', [ex(.6), TB, 22.85], 2.9, '#6e5e44'); put(S, 'radio', [ex(.65), TB, 20.9], .2, '#c9b23a');
    put(S, 'clipboard', [ex(.4), TB, 23.4], .2); put(S, 'hardhat', [ex(.45), TB, 24.0], .5, '#c9b23a'); put(S, 'lunchbox', [ex(.4), TB, 19.6], .1, '#3c6f9a');
    put(S, 'towel', [ex(.55), TB, 21.8], .4, '#3a3d3a');
    const wx = (o: number) => 44.35 + o;
    put(S, 'wrench', [wx(.4), TB, 27.6], .6); put(S, 'screwdriver', [wx(.3), TB, 28.2], 1.1, '#3c6f9a'); put(S, 'screwdriver', [wx(.5), TB, 28.3], 1.3, '#c45a2a');
    put(S, 'tape', [wx(.35), TB, 29.0], 0, '#c9b23a'); put(S, 'can', [wx(.55), TB + .06, 29.6], 0); put(S, 'can', [wx(.45), TB + .06, 29.75], 0);
    put(S, 'towel', [wx(.4), TB, 30.4], 1.3, '#5a4a5e'); put(S, 'notebook', [wx(.5), TB, 27.2], .2, '#8a2a24'); put(S, 'pen', [wx(.45), TB + .014, 27.25], .9, '#3a3d3a'); put(S, 'mug', [wx(.6), TB, 30.8], 0, MUG[0]);
    put(S, 'hardhat', [52.8, F, 26.5], .8, '#d8d4c8'); put(S, 'boot', [45.4, F, 15.2], .2); put(S, 'boot', [45.7, F, 15.0], .5);
    put(S, 'jacket', [46.1, F, 17.5], 1.9, '#c45a2a'); put(S, 'bucket', [53.5, F, 21.9], 0, '#3a3d3a'); put(S, 'jug', [51.3, F, 22.1], .3, '#c9b23a'); put(S, 'jug', [51.6, F + .065, 22.4], 1.2, '#c9b23a', [0, 0, PI / 2]);
    put(S, 'towel', [52.6, F + .002, 20.4], 2.2, '#3a3d3a'); put(S, 'torch', [49.2, F, 27.3], 2.4, '#3a3d3a'); put(S, 'glove', [55.4, F, 25.8], .6, '#c9b23a');
    for (let i = 0; i < 4; i++) put(S, 'wrench', [47 + r() * 10, F, 18 + r() * 12], r() * 6);
    poster(S, 'W', 25, 1.2, 'posterSafety', .7, .7, -.02); poster(S, 'S', 50.5, .6, 'memo', .32, .42, .04);
  }
  // ---- R3 security: desks (62.5, −46) and (62.5, −54) top y −2.235, intake counter top y −1.84.
  {
    const S = 'R3', TD = F + .765, TC = F + 1.16, r = rng(1303);
    put(S, 'mug', [62.0, TD, -46.25], .3, MUG[2]); put(S, 'notebook', [63.1, TD, -45.9], .2, '#3c4a52'); put(S, 'radio', [61.7, TD, -45.85], .4, '#3a3d3a');
    put(S, 'frame', [63.3, TD, -46.3], .3, '#3a3d3a'); put(S, 'badge', [62.6, TD, -45.75], 1.1, '#d8d4c8'); put(S, 'pen', [63.0, TD + .014, -45.95], .5, '#3c6f9a');
    put(S, 'cigs', [61.9, TD, -45.7], .9, '#8a2a24'); put(S, 'ashtray', [61.6, TD, -46.2], 0);
    put(S, 'clipboard', [62.2, TD, -53.8], 2.9); put(S, 'thermos', [63.3, TD, -53.7], 0); put(S, 'lunchbox', [61.7, TD, -54.15], 3.0, '#4a7a5a'); put(S, 'torch', [62.9, TD, -54.2], 1.9, '#3a3d3a');
    put(S, 'mug', [61.5, TD + .042, -53.75], 1, MUG[0], [PI / 2, 0, 0]);
    put(S, 'mug', [60.8, TC, -43.0], 0, MUG[4]); put(S, 'radio', [61.6, TC, -43.1], .3, '#3a3d3a'); put(S, 'radio', [61.85, TC, -43.15], .6, '#3a3d3a');
    put(S, 'notebook', [64.2, TC, -43.1], .05, '#2c4f6a'); put(S, 'badge', [64.6, TC, -42.95], .6, '#d8d4c8'); put(S, 'badge', [64.75, TC, -43.2], 2.1, '#d8d4c8');
    put(S, 'tray', [66.2, TC, -43.05], .1, '#9a9688'); put(S, 'plate', [66.15, TC + .02, -43.05], 0); put(S, 'torch', [59.6, TC, -43.0], .2, '#c9b23a');
    put(S, 'mask', [66.5, F, -47.5], .8, '#3a3d3a'); put(S, 'jacket', [60.5, F, -48.5], .3, '#3c4a52'); put(S, 'boot', [59.4, F, -51.2], .1); put(S, 'boot', [59.7, F + .06, -51.0], 1.7, undefined, [0, 0, PI / 2]);
    put(S, 'torch', [68.1, F, -51.4], 2.0, '#3a3d3a'); put(S, 'lunchbox', [59.8, F + .03, -56.5], 2.2, '#4a7a5a', [0, 0, .2]); put(S, 'plate', [60.3, F, -56.9], 0);
    for (let i = 0; i < 4; i++) put(S, 'mug', [60 + r() * 8, F + .042, -60 + r() * 14], r() * 6, pick(MUG, r), [PI / 2, 0, 0]);
    put(S, 'clipboard', [77.2, F, -63.4], 1.2); put(S, 'radio', [76.3, F + .02, -64.6], .4, '#3a3d3a', [PI / 2, 0, 0]);
  }
  // ---- R4 ballast stores.
  {
    const S = 'R4', r = rng(1404);
    put(S, 'hardhat', [99.4, F + .55, 20.1], .5, '#c9b23a'); put(S, 'clipboard', [99.7, F + .55, 27.1], .3); put(S, 'pen', [99.75, F + .56, 27.3], .4, '#3a3d3a');
    put(S, 'thermos', [112.8, F + .89, 14.6], 0); put(S, 'lunchbox', [113.5, F + .89, 15.3], .7, '#c45a2a'); put(S, 'mug', [98.7, F + 1.04, 31.1], 0, MUG[3]);
    put(S, 'radio', [98.4, F + 1.04, 30.8], 2.6, '#c9b23a'); put(S, 'hardhat', [101.4, F, 30.2], 1.1, '#d8d4c8'); put(S, 'hardhat', [116.2, F, 26.9], .1, '#c45a2a');
    put(S, 'glove', [104.9, F + .12, 28.2], .7, '#6e5e44'); put(S, 'glove', [105.1, F, 27.4], 2.1, '#6e5e44'); put(S, 'jacket', [103.9, F + .12, 27.8], .9, '#c45a2a');
    put(S, 'boot', [97.6, F, 34.6], .3); put(S, 'boot', [97.9, F, 34.4], .6); put(S, 'tape', [102.6, F, 22.4], 0, '#c9b23a'); put(S, 'torch', [111.2, F, 18.3], .4, '#c9b23a');
    put(S, 'bucket', [118.6, F, 34.6], 0, '#c45a2a'); put(S, 'jug', [118.9, F, 34.1], .3, '#d8d4c8'); put(S, 'jug', [118.3, F, 33.8], 1.3, '#3c6f9a');
    put(S, 'clipboard', [97.2, F, 17.5], 2.6); put(S, 'notebook', [117.4, F + 2.4, 21.6], .3, '#8a2a24');
    for (let i = 0; i < 5; i++) put(S, 'wrench', [97 + r() * 22, F, 13 + r() * 22], r() * 6);
    for (let i = 0; i < 4; i++) put(S, 'mug', [97 + r() * 22, F + .042, 13 + r() * 22], r() * 6, pick(MUG, r), [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) put(S, 'glove', [97 + r() * 22, F, 13 + r() * 22], r() * 6, pick(['#c9b23a', '#6e5e44'], r));
    poster(S, 'S', 112, .5, 'posterSafety', .7, .7, .03); poster(S, 'W', 28, .4, 'memo', .32, .42, -.04);
  }
  // ---- V valve room: pump plinths (119 / 124.5, −37.2), top y −2.76.
  {
    // Plant-room kit in hi-vis and pale plastics: against the dark green pump skids they must still read at 8–12 m.
    const S = 'V', TP = F + .24, r = rng(1505);
    put(S, 'wrench', [118.2, TP, -36.7], .4); put(S, 'towel', [119.9, TP, -36.6], 1.1, '#b8b09a'); put(S, 'jug', [120.0, TP, -37.6], .2, '#e0b832');
    put(S, 'thermos', [123.6, TP, -36.7], 0); put(S, 'glove', [125.3, TP, -36.6], .5, '#e8c23a'); put(S, 'glove', [125.5, TP, -36.75], 2.4, '#e8c23a');
    put(S, 'clipboard', [115.6, F, -26.4], .2); put(S, 'hardhat', [116.2, F, -27.4], .9, '#ece8dc'); put(S, 'radio', [115.3, F + .02, -25.2], .8, '#e0b832', [PI / 2, 0, 0]);
    put(S, 'notebook', [116.7, F, -24.7], .3, '#c45a2a'); put(S, 'mug', [115.9, F, -24.2], 0, MUG[0]); put(S, 'lunchbox', [121.6, F, -34.4], .3, '#d8682a');
    put(S, 'torch', [126.2, F, -33.4], 1.4, '#e0b832'); put(S, 'tape', [117.9, F, -32.2], 0, '#d8682a'); put(S, 'bucket', [120.5, F, -33.0], 0, '#d8682a');
    put(S, 'boot', [114.9, F, -38.6], .2); put(S, 'boot', [115.2, F, -38.4], .4); put(S, 'jacket', [122.2, F, -30.8], 2.1, '#e0702c'); put(S, 'mask', [117.4, F, -29.9], 1.2, '#d8d4c8');
    put(S, 'cigs', [123.4, TP, -37.8], .7, '#d8d4c8'); put(S, 'screwdriver', [118.6, TP, -37.7], 2.2, '#c45a2a'); put(S, 'hardhat', [133.4, F, -38.7], 1.6, '#e8c23a');
    for (let i = 0; i < 4; i++) put(S, 'wrench', [115 + r() * 12, F, -39 + r() * 18], r() * 6);
    for (let i = 0; i < 4; i++) put(S, 'can', [115 + r() * 14, F + .033, -39 + r() * 18], r() * 6, undefined, [PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++) put(S, 'towel', [115 + r() * 14, F + .002, -39 + r() * 18], r() * 6, '#a49a82');
    put(S, 'clipboard', [139.2, F, -39.0], .3); put(S, 'pen', [139.0, F, -38.7], 1.3, '#3c6f9a');
    poster(S, 'N', 120.5, .9, 'posterSafety', .7, .7, -.02); poster(S, 'W', -30.5, .7, 'memo', .32, .42, .03);
  }
  // ---- G observation gallery: benches (130, −3.5) / (130, 15) seat y −2.55, sofa (122, 15.5).
  {
    const S = 'G', TS = F + .48, r = rng(1606);
    put(S, 'jacket', [130.0, TS, -4.3], .1, '#7a2e28'); put(S, 'lunchbox', [130.1, TS, -2.6], 1.5, '#5a4a5e'); put(S, 'cup', [129.9, TS + .045, -3.0], 0);
    put(S, 'paper', [130.05, TS + .002, -3.6], .4); put(S, 'paper', [130.0, TS + .004, -3.4], 1.2);
    put(S, 'thermos', [130.1, TS, 14.2], 0); put(S, 'book', [129.9, TS + .018, 15.7], .4); put(S, 'mug', [130.0, TS, 15.2], 0, MUG[3]); put(S, 'frame', [130.05, TS, 16.1], PI / 2, '#3a3d3a');
    put(S, 'jacket', [122.1, F + .55, 15.0], 1.4, '#c9c0a8'); put(S, 'book', [122.0, F + .57, 16.2], .2); put(S, 'slipper', [123.0, F, 14.4], .3, '#5a4a5e'); put(S, 'slipper', [123.2, F, 14.1], 2.9, '#5a4a5e', [0, 0, PI]);
    for (let i = 0; i < 5; i++) put(S, 'cup', [139 + r() * 1.6, F + .045, -6 + r() * 26], r() * 6, undefined, [r() < .6 ? PI / 2 : 0, 0, 0]);
    put(S, 'frame', [141.1, F, 4.2], -PI / 2, '#3a3d3a'); put(S, 'frame', [141.15, F, 9.6], -PI / 2 + .2, '#6e5e44'); put(S, 'paper', [140.8, F + .002, 6.8], .3); put(S, 'paper', [140.6, F + .002, 7.6], 2.4);
    put(S, 'badge', [134.2, F, 2.5], .5, '#d8d4c8'); put(S, 'badge', [127.3, F, 11.8], 2.3, '#d8d4c8'); put(S, 'tray', [125.6, F, 19.2], .4, '#9a9688'); put(S, 'plate', [125.65, F + .02, 19.2], 0);
    put(S, 'book', [133.4, F + .018, 18.6], 1.9); put(S, 'bookRed', [127.0, F + .018, -6.2], .7); put(S, 'bottle', [121.8, F + .035, 3.9], 1, undefined, [PI / 2, 0, 0]);
    put(S, 'notebook', [130.2, TS, 13.6], .3, '#c9b23a'); put(S, 'pen', [130.15, TS + .014, 13.7], 1.2, '#3a3d3a'); put(S, 'mug', [131.4, F + .042, -1.4], 2, MUG[0], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) put(S, 'paper', [124 + r() * 15, F + .002, -6 + r() * 26], r() * 6);
    poster(S, 'N', 123.6, .5, 'posterCalm', .8, .8, .02); poster(S, 'S', 133.5, .3, 'drawing', .45, .45, -.06);
    // Visitors' leavings along the window bench line and the sofa corner.
    put(S, 'cigs', [122.4, F + .57, 15.6], .8, '#d8d4c8'); put(S, 'glove', [130.3, TS, -4.0], 1.1, '#3a3d3a'); put(S, 'glove', [129.8, TS, 14.6], 2.4, '#7a6a5a');
    put(S, 'towel', [123.6, F + .002, 16.4], .9, '#c9c0a8'); put(S, 'radio', [121.4, F, 18.6], .4, '#3a3d3a'); put(S, 'tape', [138.6, F, 12.4], 0, '#c9b23a');
  }

  // ---- R5 office: subdivide the hall-sized room into reception, a workstation pod, a screened
  //      lounge and an archive bay (all outside the route lane and the three photo sight lines).
  {
    const S = 'R5', b = B(S), r = rng(1707), scr = m.screenDead;
    // Reception counter west of the entry lane (top y −1.92, below the pod band).
    const rc = Kit.at(b, [155.6, F, 90.2], 0);
    rc.box([0, .52, 0], [4.4, 1.04, .62], m.paintCream); rc.box([0, 1.06, -.04], [4.6, .05, .8], m.veneer);
    rc.box([0, .55, .315], [4.3, .9, .01], m.veneer); rc.box([0, .1, .32], [4.4, .2, .02], m.trim);
    rc.box([2.25, .52, -.7], [.62, 1.04, 1.4], m.paintCream); rc.box([2.25, 1.06, -.7], [.8, .05, 1.5], m.veneer);
    solids.push(rc.solid([0, .52, 0], [4.6, 1.1, .8]));
    const TR = F + 1.085;
    put(S, 'mug', [154.1, TR, 90.1], .2, MUG[0]); put(S, 'notebook', [155.0, TR, 90.0], .1, '#2c4f6a'); put(S, 'pen', [155.1, TR + .014, 90.05], .7, '#3a3d3a');
    put(S, 'badge', [155.6, TR, 90.3], .4, '#d8d4c8'); put(S, 'badge', [155.8, TR, 90.15], 2.2, '#d8d4c8'); put(S, 'tray', [156.6, TR, 90.1], .05, '#9a9688');
    put(S, 'radio', [153.6, TR, 89.95], .3, '#3a3d3a'); put(S, 'clipboard', [157.4, TR, 89.7], 1.3); put(S, 'binder', [154.6, TR + .03, 89.8], .2, undefined, [PI / 2, 0, 0]);
    put(S, 'cup', [156.9, TR + .045, 90.35], 0);
    // Workstation pod: two face-to-face pairs with a low screen between them.
    for (const [x, z, a] of [[152.9, 94.0, PI], [152.9, 94.72, 0], [154.35, 94.0, PI], [154.35, 94.72, 0]] as const) {
      const d = Kit.at(b, [x, F, z], a); officeDesk(d, m, scr); chair(d.child([(r() - .5) * .3, 0, .65], [0, PI + (r() - .5) * .8, 0]), m);
    }
    partition(Kit.at(b, [153.62, F, 94.36], 0), m, 2.9, 1.2);
    solids.push(new T.Box3(new T.Vector3(152.15, F, 93.6), new T.Vector3(155.1, F + 1.2, 95.1)));
    const TW = F + .76;
    for (const [x, z, a] of [[152.6, 93.85, PI], [152.6, 94.87, 0], [154.05, 93.85, PI], [154.05, 94.87, 0]] as const) {
      const s = a ? -1 : 1;
      put(S, 'mug', [x + .55, TW, z + s * .05], r() * 6, pick(MUG, r)); put(S, 'notebook', [x + .2, TW, z + s * .12], r() * .6, pick(PLASTIC, r));
      put(S, 'frame', [x - .45, TW, z - s * .12], a + (r() - .5) * .4, '#3a3d3a'); put(S, 'pen', [x + .3, TW + .014, z + s * .1], r() * 6, pick(PLASTIC, r));
      if (r() < .6) put(S, 'paper', [x + .05, TW + .002, z + s * .18], r() * 6);
    }
    put(S, 'ashtray', [153.1, TW, 94.2], 0); put(S, 'cigs', [153.3, TW, 94.25], .5, '#8a2a24'); put(S, 'jacket', [154.6, F + .5, 95.4], .6, '#3c4a52');
    // Screened lounge: three office screens on the line x 158.6 (one knocked flat).
    for (const [z, down] of [[100.8, false], [103.0, false], [105.3, true]] as const) {
      const pk = at(S, [158.6, F, z], PI / 2, 1.2, 1.5); if (!pk) continue;
      partition(down ? pk.child([0, .03, 0], [-PI / 2, 0, 0]) : pk, m, 2.2, 1.5, m.carpetRed);
    }
    // Archive bay: back-to-back filing cabinets along z 91, one drawer run spilling, one cabinet down.
    for (let i = 0; i < 12; i++) {
      const x = 166.85 + i * .5;
      if (i === 8) continue;
      for (const [z, a] of [[90.69, PI], [91.31, 0]] as const) {
        const fk = at(S, [x, F, z], a, .3, 1.45); if (!fk) continue;
        filingCabinet(fk, m, 4, (i * 7 + (a ? 3 : 0)) % 5 === 0 ? [0, .35] : (i * 3) % 7 === 0 ? [.25] : [], i % 3 ? m.steel : m.paintCream);
      }
    }
    const down = at(S, [170.85, F, 92.6], .25, .8, .5);
    if (down) filingCabinet(down.child([0, .31, 0], [-PI / 2, 0, 0]), m, 4, [.3]);
    solids.push(new T.Box3(new T.Vector3(166.6, F, 90.35), new T.Vector3(172.85, F + 1.42, 91.65)));
    for (const [x, s] of [[167.1, .9], [168.3, 1.1], [171.6, .8]] as const) put(S, 'binder', [x, F + 1.42, 91.0], s, undefined);
    for (let i = 0; i < 14; i++) put(S, r() < .5 ? 'binder' : 'paper', [169.6 + r() * 2.6, F + .03, 91.9 + r() * 1.6], r() * 6, undefined, [PI / 2 * (r() < .5 ? 1 : 0), 0, 0]);
    // Lounge / floor effects: coffee mugs, slippers, a dropped coat, an umbrella of papers.
    put(S, 'mug', [153.45, F + .44, 88.45], 0, MUG[2]); put(S, 'ashtray', [153.9, F + .44, 88.7], 0); put(S, 'book', [153.1, F + .458, 88.75], .4);
    put(S, 'mug', [153.6, F + .425, 100.6], .3, MUG[0]); put(S, 'book', [153.5, F + .443, 101.4], 1.1); put(S, 'cigs', [153.75, F + .425, 101.1], .3, '#d8d4c8');
    put(S, 'slipper', [152.0, F, 99.4], .3, '#7a6a5a'); put(S, 'slipper', [152.3, F, 99.2], 2.8, '#7a6a5a', [0, 0, PI]); put(S, 'jacket', [156.4, F, 99.6], 2.4, '#6e5e44');
    put(S, 'frame', [151.0, F, 105.4], 1.4, '#3a3d3a'); put(S, 'radio', [171.6, F + .02, 99.1], .9, '#3a3d3a', [PI / 2, 0, 0]); put(S, 'thermos', [172.9, F, 92.6], 0);
    poster(S, 'E', 91.5, .6, 'posterSchedule', .6, .8, -.02);
    // Open-plan floor under the pod's cruise height (everything here tops out below y −1.8, so it can
    // sit under the route): a second desk pair behind a low screen at the entry, a low two-drawer
    // cabinet run, a toppled desk and an archive spill. Nothing tall crosses the code-photo sight line.
    for (const [x, z, a] of [[162.6, 89.2, PI], [162.6, 89.92, 0], [164.05, 89.2, PI]] as const) {
      const d = at(S, [x, F, z], a, .8, 1.15); if (!d) continue;
      officeDesk(d, m, scr); count(S);
      if (r() < .7) chair(d.child([(r() - .5) * .4, 0, .7], [0, PI + (r() - .5) * 1.4, 0]), m); else chair(d.child([.3, .22, .95], [PI / 2, r() * 3, 0]), m);
    }
    { const pk = at(S, [163.32, F, 89.56], 0, 1.5, 1.1); if (pk) partition(pk, m, 2.9, 1.1); }
    for (const [x, z] of [[162.3, 89.05], [163.75, 89.05], [162.9, 90.05]] as const) { put(S, 'mug', [x + .5, TW, z], r() * 6, pick(MUG, r)); put(S, 'paper', [x, TW + .002, z + .05], r() * 6); put(S, 'notebook', [x - .3, TW, z], r(), pick(PLASTIC, r)); }
    for (let i = 0; i < 6; i++) {
      const x = 164.6 + i * .5; const fk = at(S, [x, F, 97.9], 0, .3, .75); if (!fk) continue;
      if (i === 4) filingCabinet(fk.child([0, .31, .5], [-PI / 2, 0, 0]), m, 2, [.2]); else filingCabinet(fk, m, 2, i === 1 ? [.25] : [], i % 2 ? m.steel : m.paintCream);
      count(S);
    }
    { const dt = at(S, [160.6, F, 95.8], 1.1, 1, .9); if (dt) { deskToppled(dt, m); count(S); } }
    for (const [x, z, a] of [[161.5, 93.4, .4], [165.2, 94.6, 2.1], [159.8, 98.3, 4.0]] as const) { const ck = at(S, [x, F, z], a, .5, .6, [PI / 2, 0, 0]); if (ck) { chair(ck.child([0, .25, 0]), m); count(S); } }
    for (let i = 0; i < 9; i++) {
      const x = 161 + r() * 5, z = 91.5 + r() * 6;
      const ck = at(S, [x, F, z], r() * 6, .3, .35); if (!ck) continue;
      crate(ck.child([0, 0, 0], r() < .3 ? [PI / 2, 0, 0] : undefined), m, [.45, .3, .35], m.paintCream); count(S);
    }
    for (let i = 0; i < 26; i++) {
      const p: V3 = [160 + r() * 7, F, 90.5 + r() * 8.5];
      if (r() < .7) put(S, 'paper', [p[0], F + .002, p[2]], r() * 6); else put(S, 'binder', [p[0], F + .03, p[2]], r() * 6, undefined, [PI / 2, 0, 0]);
    }
    grime.floor(b, 'stain', [163, F + .01, 94], 4, 3, .4); grime.floor(b, 'grime', [161.5, F + .01, 92.5], 3, .8, 1.2);
  }

  // ================================================================ room density: mid/far ground seen from the photo stops
  // Floor zones are the parts of each room that fill the frame behind the subject from its photo stop
  // (R5 code/guide stops and the wide establishing angle, R3 probe stop, R4/R1 entry views). Only low
  // things (< 1.2 m) and flat litter go on the floor, and every piece is route-checked, so the pod lane stays
  // open. The upper walls get wall cabinets, tall cupboards with boxes on top, service pipes and notices.
  {
    const SMALL = ['paper', 'paper', 'paper', 'binder', 'book', 'cup', 'can', 'mug', 'towel', 'glove', 'bottle', 'notebook', 'tray', 'plate', 'jug', 'bucket', 'slipper', 'tape'] as const;
    const FLAT = new Set(['paper', 'towel', 'glove', 'tray', 'plate', 'slipper', 'tape', 'notebook']);
    const ZONES: Record<string, {zones: [number, number, number, number][]; avoid?: [number, number, number, number][]; seed: number}> = {
      R5: {seed: 5101, zones: [[150.8, 98, 158, 107.3], [159, 99.6, 165.4, 107.3], [168.6, 98.4, 173.3, 107.3], [150.8, 86.6, 152.2, 92.6]], avoid: [[165.2, 102.4, 169.3, 106.6]]},
      R3: {seed: 5102, zones: [[58.7, -65.3, 66, -58], [78.4, -65.3, 85.3, -56], [80, -50, 85.3, -40.7], [62, -57.5, 72.5, -52], [58.7, -50, 66, -41]], avoid: [[73.5, -64, 78.8, -59.2]]},
      R4: {seed: 5103, zones: [[96.7, 12.7, 104, 20], [108, 28, 119.3, 35.3], [112, 12.7, 119.3, 20]]},
      R1: {seed: 5104, zones: [[24.7, -23.3, 30, -10], [42, -23.3, 47.3, -12], [40, -6, 47.3, 2.3]]},
    };
    for (const [S, cfg] of Object.entries(ZONES)) {
      const r = rng(cfg.seed), b = B(S), s = spaceOf(S), f = s.floorY;
      const blocked = (x: number, z: number) => cfg.avoid?.some(([a, c, e, g]) => x > a && x < e && z > c && z < g) ?? false;
      for (const [x0, z0, x1, z1] of cfg.zones) {
        const area = (x1 - x0) * (z1 - z0);
        // litter: ~2.4 small instanced items per m², clustered (things gather against furniture and walls)
        const clusters = Math.max(2, Math.round(area / 9));
        for (let c = 0; c < clusters; c++) {
          const cx = x0 + r() * (x1 - x0), cz = z0 + r() * (z1 - z0);
          for (let i = 0; i < area * 2.4 / clusters; i++) {
            const x = Math.min(x1, Math.max(x0, cx + (r() + r() - 1) * 2.2)), z = Math.min(z1, Math.max(z0, cz + (r() + r() - 1) * 2.2));
            if (blocked(x, z)) continue;
            const key = pick(SMALL, r), lie = !FLAT.has(key) && r() < .55;
            put(S, key, [x, f + (key === 'paper' ? .002 : lie ? .035 : 0), z], r() * 6, key === 'towel' || key === 'slipper' || key === 'glove' ? pick(CLOTH, r) : pick(PLASTIC, r), lie ? [PI / 2, 0, 0] : [0, 0, 0]);
          }
        }
        // flat floor marks: wet patches, silt fans, drag scrapes, paper drifts (~0.4 per m²)
        for (let i = 0; i < area * .4; i++) {
          const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
          if (blocked(x, z)) continue;
          const k = r(), kind: DecalKind = k < .3 ? 'puddle' : k < .6 ? 'silt' : k < .8 ? 'stain' : 'scrape';
          grime.floor(b, kind, [x, f + .004 + i * .0001, z], .5 + r() * 1.4, .4 + r() * 1.1, r() * 6.28);
        }
        // low furniture-scale pieces (~0.25 per m²): boxes, document stacks, drums, chairs on their side
        for (let i = 0; i < area * .25; i++) {
          const x = x0 + .4 + r() * (x1 - x0 - .8), z = z0 + .4 + r() * (z1 - z0 - .8);
          if (blocked(x, z)) continue;
          const k = r(), yaw = r() * 6.28;
          if (k < .45) {
            const sz: V3 = [.35 + r() * .3, .25 + r() * .25, .3 + r() * .25];
            const ck = at(S, [x, f, z], yaw, .45, sz[1] * 2.2); if (!ck) continue;
            crate(ck, m, sz, r() < .6 ? m.paintCream : m.veneer);
            if (r() < .5) crate(ck.child([(r() - .5) * .1, sz[1], (r() - .5) * .1], [0, (r() - .5) * .6, 0]), m, [sz[0] * .8, sz[1] * .9, sz[2] * .85], m.paintCream);
          } else if (k < .65) {
            const dk = at(S, [x, f, z], yaw, .4, .9); if (!dk) continue;
            drum(r() < .4 ? dk.child([0, .3, 0], [PI / 2, 0, 0]) : dk, m, pick([m.steel, m.indGreen, m.bandRed], r), r() < .7);
          } else if (k < .85) {
            const ck = at(S, [x, f, z], yaw, .5, .6, [PI / 2, 0, 0]); if (!ck) continue;
            chair(ck.child([0, .25, 0]), m);
          } else {
            const fk = at(S, [x, f, z], yaw, .35, .5); if (!fk) continue;
            for (let n = 0, h = 0; n < 3 + r() * 4; n++) { const t = .03 + r() * .05; fk.box([(r() - .5) * .05, h + t / 2, (r() - .5) * .05], [.24, t, .32], n % 3 ? m.paper as T.Material : m.paintCream, [0, (r() - .5) * .5, 0]); h += t; }
          }
          count(S);
        }
      }
      // upper walls: between frame ribs, wall cabinets at 1.6–2.3 m, tall cupboards with boxes on top, notices
      for (const side of ['N', 'S', 'W', 'E'] as Side[]) {
        const mids = ribMids(S, side);
        for (const a of mids) {
          const q = r();
          if (q < .32) {
            const c = onWall(S, side, a, f + 1.95, .2);
            if (!clear([c[0] - .5, c[1] - .4, c[2] - .5], [c[0] + .5, c[1] + .4, c[2] + .5])) continue;
            const k = wallKit(S, side, a, f + 1.6, 0);
            k.box([0, .35, .18], [.95, .7, .36], r() < .5 ? m.steel : m.paintCream); k.box([0, .35, .365], [.004, .66, .01], m.trim);
            for (const sx of [-.06, .06]) k.box([sx, .35, .375], [.015, .1, .02], m.chrome);
            if (r() < .5) for (let n = 0, x = -.35; n < 3 && x < .35; n++) { const w = .18 + r() * .14; crate(k.child([x + w / 2, .7, .17], [0, (r() - .5) * .3, 0]), m, [w, .16 + r() * .12, .26], m.paintCream); x += w + .04; }
            count(S);
          } else if (q < .52) {
            const p = onWall(S, side, a, f, .25);
            const ck = at(S, p, FACE[side], .55, 2.6); if (!ck) continue;
            ck.box([0, 1.0, 0], [.9, 2.0, .45], r() < .5 ? m.steel : m.paintCream); ck.box([0, 1.0, .228], [.004, 1.9, .01], m.trim);
            for (let n = 0, x = -.4; n < 3 && x < .35; n++) { const w = .2 + r() * .2; crate(ck.child([x + w / 2, 2.0, (r() - .5) * .08], [0, (r() - .5) * .4, 0]), m, [w, .18 + r() * .2, .32], r() < .7 ? m.paintCream : m.veneer); x += w + .03; }
            count(S);
          }
          if (r() < .35) poster(S, side, a + (r() - .5) * .8, f + 1.45 + r() * .5, pick(['memo', 'posterSchedule', 'map', 'posterSafety'] as const, r), .4 + r() * .3, .5 + r() * .3, (r() - .5) * .06);
        }
        // service pipes high on the wall, in 2 m runs that each pass the route check (brackets at the joints)
        const info = {N: [s.minX, s.maxX], S: [s.minX, s.maxX], W: [s.minZ, s.maxZ], E: [s.minZ, s.maxZ]}[side];
        for (const [yy, rad, off] of [[f + 3.7, .07, .16], [f + 3.95, .045, .3]] as const) {
          for (let a = info[0] + .6; a + 2 < info[1] - .6; a += 2) {
            const p0 = onWall(S, side, a, yy, off), p1 = onWall(S, side, a + 2, yy, off);
            if (!clear([Math.min(p0[0], p1[0]) - .1, yy - .1, Math.min(p0[2], p1[2]) - .1], [Math.max(p0[0], p1[0]) + .1, yy + .1, Math.max(p0[2], p1[2]) + .1])) continue;
            b.rod(p0, p1, rad, m.pipe, 10); b.rod(p0, onWall(S, side, a, yy, 0), .015, m.frame, 5);
          }
        }
      }
      // cardboard archive boxes on top of the R5 archive cabinets (top y −1.58)
      if (S === 'R5') for (let x = 166.9; x < 172.6; x += .38 + r() * .2) {
        if (r() < .35) continue;
        crate(Kit.at(b, [x, f + 1.42, 91 + (r() - .5) * .3], (r() - .5) * .4), m, [.32, .24 + r() * .08, .4], m.paintCream); count(S);
      }
    }
  }

  // ================================================================ wall decal layers in rooms (posters exist; add scratches + mould)
  for (const [space, seed] of [['R1', 21], ['R2', 22], ['R3', 23], ['R4', 24], ['R5', 25], ['V', 26], ['G', 27], ['J1', 28]] as const) {
    const s = spaceOf(space), r = rng(seed * 101), b = B(space);
    for (const side of ['N', 'S', 'W', 'E'] as Side[]) {
      const mids = ribMids(space, side);
      mids.forEach((a, i) => {
        const q = r();
        const p = onWall(space, side, a, s.floorY + 1.1, .02);
        if (!routeClear(box3([p[0] - .8, p[1] - .4, p[2] - .8], [p[0] + .8, p[1] + .4, p[2] + .8]))) return;
        if (q < .3) grime.wall(b, 'scratch', onWall(space, side, a, s.floorY + .8 + r() * .7, .02), NORMAL[side], 1 + r() * .7, .45 + r() * .2, (r() - .5) * .25);
        else if ((i === 0 || i === mids.length - 1) && q < .75) grime.wall(b, 'mould', onWall(space, side, a, s.floorY + (r() < .5 ? .5 : s.ceilY - s.floorY - .9), .02), NORMAL[side], 1.4, 1.2);
        else if (q < .42) grime.wall(b, 'stain', onWall(space, side, a, s.floorY + 2.6 + r(), .02), NORMAL[side], 1.4, 1.4);
      });
    }
  }

  // ================================================================ atrium: slime-covered clock tower on the dry fountain
  const curtain = buildAtriumLandmark();
  function buildAtriumLandmark() {
    const b = B('A'), C: V3 = [155, -9, 62], r = rng(4040);
    // Base materials except the stone: one variant (same program) measures its tide lines and silt from the
    // tower foot, so the shaft carries flood deposits, water marks and biofilm instead of clean concrete.
    const stone = wearVariant(m.concrete, {floorY: -8.5, silt: 1, grime: 1, bio: .8, rust: .2, wet: .75}, ownedM);
    stone.color.set('#77746a'); stone.name = 'living.tower-stone';
    const tile = m.wallTile, brass = m.brass, frame = m.frame;
    // Basin: lathed tiled wall with a rounded coping, a glossy gel pool sunk below the rim.
    const f = Kit.at(b, C, 0);
    const prof = [[5.5, 0], [5.45, .64], [5.4, .72], [5.2, .76], [4.95, .75], [4.84, .7], [4.78, .55], [4.74, .4]].map(([x, y]) => new T.Vector2(x, y));
    f.geo(new T.LatheGeometry(prof, 56), tile, [0, 0, 0], undefined, [1, 1, 1], 'keep');
    f.cyl([0, .48, 0], 4.76, 4.76, .04, m.slime, 48);
    solids.push(f.solid([0, .35, 0], [10.8, .7, 10.8]));
    // Tower stump: 2.4 m square stone shaft, three courses lost from the top, a corner pier still standing.
    const t = Kit.at(b, [C[0], -8.5, C[2]], .35, [.04, 0, -.03]);
    const courses = 9, ch = .62;
    for (let i = 0; i < courses; i++) {
      const w = 2.4 - (i % 2) * .04, y = i * ch + ch / 2;
      t.box([0, y, 0], [w, ch - .02, w], stone);
      t.box([0, y + ch / 2 - .02, 0], [w + .06, .04, w + .06], frame);
    }
    for (const [x, z, h] of [[-.9, -.9, 1.6], [.9, -.9, .9], [-.9, .9, .5]] as const) t.box([x, courses * ch + h / 2, z], [.62, h, .62], stone, [0, (r() - .5) * .2, (r() - .5) * .1]);
    // Water marks on every face: runoff stains under the gel cap, a silt tide band low down, mould at the foot.
    for (let f = 0; f < 4; f++) {
      const a = f * PI / 2, nl = new T.Vector3(Math.sin(a), 0, Math.cos(a)), nw = nl.clone().applyMatrix4(new T.Matrix4().extractRotation(t.m)).normalize();
      const fp = (u: number, y: number): V3 => t.point([nl.x * 1.235 + nl.z * u, y, nl.z * 1.235 - nl.x * u]);
      const fn: V3 = [nw.x, nw.y, nw.z];
      grime.wall(b, 'leak', fp((r() - .5) * .6, courses * ch - 1.3), fn, 1.1, 2.4);
      grime.wall(b, 'slimeDrip', fp((r() - .5) * 1.2, courses * ch - .8), fn, .7, 1.6);
      grime.wall(b, 'tide', fp(0, 1.2 + r() * .3), fn, 2.3, .7);
      grime.wall(b, 'mould', fp((r() - .5) * .8, .45), fn, 1.6, .9);
    }
    for (const [x, z] of [[-1.22, -1.22], [1.22, -1.22], [-1.22, 1.22], [1.22, 1.22]]) t.box([x, courses * ch / 2, z], [.12, courses * ch, .12], brass);
    // Fallen clock head lying on the floor south of the basin (stopped 4:12, the flood hour).
    const head = Kit.at(b, [154.3, -9, 70.8], .4);
    const hk = head.child([0, 1.52, 0], [0, 0, PI / 2 + .02]);
    hk.box([0, 0, 0], [3.0, 2.6, 2.6], stone);
    for (const s of [-1, 1]) hk.box([s * 1.5, 0, 0], [.1, 2.7, 2.7], frame);
    for (const [n, rot] of [[[0, 0, 1], [0, 0, 0]], [[0, 0, -1], [0, PI, 0]], [[0, 1, 0], [-PI / 2, 0, 0]]] as const) {
      const face = hk.child([n[0] * 1.31, n[1] * 1.31, n[2] * 1.31], rot as unknown as V3);
      face.cyl([0, 0, .02], .98, .98, .05, brass, 36, [PI / 2, 0, 0]);
      face.cyl([0, 0, .05], .9, .9, .02, m.porcelain, 36, [PI / 2, 0, 0]);
      for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; face.box([Math.sin(a) * .76, Math.cos(a) * .76, .065], [.04, i % 3 ? .1 : .18, .01], m.rubber, [0, 0, -a]); }
      const ha = (4 + 12 / 60) / 12 * PI * 2, ma = 12 / 60 * PI * 2;
      face.box([Math.sin(ha) * .22, Math.cos(ha) * .22, .075], [.05, .48, .01], m.rubber, [0, 0, -ha]);
      face.box([Math.sin(ma) * .32, Math.cos(ma) * .32, .08], [.035, .68, .01], m.rubber, [0, 0, -ma]);
      face.cyl([0, 0, .085], .05, .05, .02, brass, 12, [PI / 2, 0, 0]);
    }
    solids.push(head.solid([0, 1.3, 0], [2.8, 2.6, 3.1]));
    // Debris trail from the stump to the head; a cracked fourth dial face on the floor.
    const sc = shells.scatter.get('A')!;
    for (let i = 0; i < 40; i++) { const u = r(); sc.put('chunk', [155 + (154.3 - 155) * u + (r() - .5) * 2.4, -8.97, 62 + 5.6 + (70.8 - 67.6) * u * .8 + (r() - .5) * 2], [r() * 3, r() * 6, r() * 3], [1.5 + r() * 2, .8 + r(), 1.5 + r() * 2]); }
    for (let i = 0; i < 9; i++) Kit.at(b, [152 + r() * 5, -9, 67.6 + r() * 2], r() * 6).box([0, .2, 0], [.6, .4, .6], stone, [r() * .5, 0, r() * .5]);
    const dial = Kit.at(b, [158.2, -8.98, 69.2], .7);
    for (let i = 0; i < 5; i++) dial.box([(r() - .5) * 1.2, .01, (r() - .5) * 1.2], [.4 + r() * .3, .02, .3 + r() * .3], m.porcelain, [0, r() * 6, 0]);
    // Panacea gel: a mass over the broken top, sheets down each face, strands into the pool.
    const topY = -8.5 + courses * ch;
    gel(b, [C[0], topY - .1, C[2]], [1.55, .7, 1.45], 4041);
    gel(b, [C[0] - .5, topY + .5, C[2] - .6], [.6, .5, .5], 4042);
    for (let i = 0; i < 4; i++) {
      const a = .35 + i * PI / 2 + .2, px = C[0] + Math.sin(a) * 1.28, pz = C[2] + Math.cos(a) * 1.28;
      Kit.at(b, [px, -8.5 + 2.2 + i * .4, pz], a).geo(gelGeo(4050 + i), m.slime, [0, 0, 0], undefined, [.7, 2.2 + i * .3, .14], 'keep');
    }
    for (let i = 0; i < 8; i++) {
      const a = r() * PI * 2, d = 1.25 + r() * .2, top: V3 = [C[0] + Math.cos(a) * d, topY - .2 - r() * .6, C[2] + Math.sin(a) * d];
      b.rod(top, [top[0] + Math.cos(a) * .4, -8.5, top[2] + Math.sin(a) * .4], .02, m.slime, 6, {r2: .05});
    }
    for (let i = 0; i < 7; i++) { const a = r() * PI * 2, d = 2 + r() * 2.6; gel(b, [C[0] + Math.cos(a) * d, -8.52, C[2] + Math.sin(a) * d], [.5 + r() * .5, .12 + r() * .1, .4 + r() * .4], 4060 + i); }
    gel(b, [153.6, -9 + 2.55, 70.6], [1.1, .25, 1.4], 4070);
    for (let i = 0; i < 5; i++) gel(b, [154.3 + (r() - .5) * 3, -9, 70.8 + (r() - .5) * 3.4], [.4 + r() * .4, .1, .4 + r() * .3], 4080 + i);
    for (const [x, z, w, d] of [[149.4, 62.5, 2.4, 3.2], [160.6, 60.4, 2.2, 2.6], [155.6, 67.4, 3, 2]] as const) grime.floor(b, 'slime', [x, -9 + .005, z], w, d, r() * 6);
    // Up-light fixtures on the basin rim aimed at the tower (lighting is the lighting pass's call).
    const tiltDeg = 24, phi = tiltDeg * PI / 180;
    for (let i = 0; i < 6; i++) {
      const al = PI / 6 + i * PI / 3, p: V3 = [C[0] + Math.cos(al) * 4.95, -8.275, C[2] + Math.sin(al) * 4.95];
      const th = Math.atan2(-Math.cos(al), -Math.sin(al));
      const state: LivingUplight['state'] = i === 4 ? 'toppled' : i === 1 ? 'cracked' : 'intact';
      if (state === 'toppled') {
        const lp: V3 = [C[0] + Math.cos(al) * 4.3, -8.36 + .14, C[2] + Math.sin(al) * 4.3];
        upLight(Kit.at(b, lp, th + .6, [PI / 2, 0, 0]), m, m.lampOff);
        LIVING_UPLIGHTS.push({id: `A-uplight-${i + 1}`, position: lp.map(v => +v.toFixed(2)) as V3, aim: [Math.sin(th + .6), 0, Math.cos(th + .6)].map(v => +v.toFixed(3)) as V3, state});
        continue;
      }
      upLight(Kit.at(b, p, th, [phi, 0, 0]), m, m.lampOff);
      if (state === 'cracked') for (let j = 0; j < 4; j++) sc.put('shard', [p[0] + (r() - .5) * .6, -8.27, p[2] + (r() - .5) * .6], [0, r() * 6, 0], [.4, 1, .4]);
      const aim: V3 = [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)];
      LIVING_UPLIGHTS.push({id: `A-uplight-${i + 1}`, position: [p[0], -8.275 + .31, p[2]].map(v => +v.toFixed(2)) as V3, aim: aim.map(v => +v.toFixed(3)) as V3, state});
    }
    rep.identifiers.A = 'gel-covered clock-tower stump on the fountain; clock head fallen south, stopped at 4:12';
    // ---- Sediment inflow curtain from a cracked skylight pane: three crossed sheets + falling motes.
    // It falls the full hall height, so it goes at the first lantern edge spot whose column stays off the route.
    const spots: [number, number][] = [[160.6, 57.2], [148.4, 56.2], [161.8, 67.4], [148.2, 68.6], [163.2, 62]];
    const [cx, cz] = spots.find(([x, z]) => spotClear([x, -12, z], 1.1, 24)) ?? spots[0];
    if (!spotClear([cx, -12, cz], 1.1, 24)) rep.skipped++;
    return buildCurtain([cx, 9.45, cz], -9, 1.5);
  }

  function buildCurtain(top: V3, floor: number, width: number) {
    const h = top[1] - floor;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512;
    const cx = cv.getContext('2d');
    if (cx) {
      cx.fillStyle = '#000'; cx.fillRect(0, 0, 128, 512);
      const r = rng(77);
      for (let i = 0; i < 70; i++) {
        const x = 8 + r() * 112, w = 1 + r() * 5, a = .15 + r() * .5, y0 = r() * 512, l = 60 + r() * 300;
        const g = cx.createLinearGradient(0, y0, 0, y0 + l); g.addColorStop(0, `rgba(255,255,255,0)`); g.addColorStop(.3, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = g; cx.fillRect(x, y0, w, l); cx.fillRect(x, y0 - 512, w, l);
      }
      const edge = cx.createLinearGradient(0, 0, 128, 0); edge.addColorStop(0, 'rgba(0,0,0,1)'); edge.addColorStop(.25, 'rgba(0,0,0,0)'); edge.addColorStop(.75, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)');
      cx.globalCompositeOperation = 'source-atop'; cx.fillStyle = edge; cx.fillRect(0, 0, 128, 512); cx.globalCompositeOperation = 'source-over';
    }
    const tex = new T.CanvasTexture(cv); tex.wrapS = T.ClampToEdgeWrapping; tex.wrapT = T.RepeatWrapping; tex.repeat.set(1, h / 6);
    const tex2 = tex.clone(); tex2.repeat.set(1, h / 4.2); tex2.needsUpdate = true;
    // Unlit sheets, so the cold work light beside the column is baked in as vertex brightness: a lit band where its
    // beam crosses the falling water (y ≈ floor + 2..8 m), dim grey-green above and below.
    const mats = [tex, tex2].map((t, i) => {
      const mm = new T.MeshBasicMaterial({color: i ? '#a4d2dc' : '#8cbccc', vertexColors: true, alphaMap: t, transparent: true, opacity: i ? .3 : .42, depthWrite: false, side: T.DoubleSide});
      mm.name = `living.inflow-curtain-${i}`; ownedM.push(mm); return mm;
    });
    owned.push(tex, tex2);
    const geo = new T.PlaneGeometry(width, h, 1, 16);
    const pa = geo.getAttribute('position'), vc = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      const v = (pa.getY(i) + h / 2) / h; pa.setX(i, pa.getX(i) * (.55 + .45 * (1 - v) + .35 * (1 - v) * (1 - v)));
      const above = pa.getY(i) + h / 2, lit = .22 + 1.25 * Math.exp(-(((above - 4.6) / 2.6) ** 2));
      vc.set([lit * .85, lit * .95, lit], i * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(vc, 3));
    owned.push(geo);
    const group = new T.Group(); group.name = 'living-inflow-curtain'; group.position.set(top[0], floor + h / 2, top[2]);
    for (let i = 0; i < 3; i++) { const s = new T.Mesh(geo, mats[i % 2]); s.rotation.y = i * PI / 3; s.renderOrder = 4; group.add(s); }
    // Falling silt motes.
    const N = 380, pts = new Float32Array(N * 3), speed = new Float32Array(N), r = rng(78);
    for (let i = 0; i < N; i++) { const a = r() * PI * 2, d = r() * width * .55; pts[i * 3] = Math.cos(a) * d; pts[i * 3 + 1] = (r() - .5) * h; pts[i * 3 + 2] = Math.sin(a) * d; speed[i] = .9 + r() * 1.6; }
    const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pts, 3)); owned.push(pg);
    const pm = new T.PointsMaterial({color: '#b8d6dc', size: .05, transparent: true, opacity: .7, depthWrite: false}); pm.name = 'living.inflow-motes'; ownedM.push(pm);
    const motes = new T.Points(pg, pm); motes.frustumCulled = false; group.add(motes);
    // Plume where it meets the floor: a churned silt disc.
    const plumeGeo = new T.CircleGeometry(2.2, 32); owned.push(plumeGeo);
    const plume = new T.Mesh(plumeGeo, new T.MeshBasicMaterial({color: '#6d766b', alphaMap: radialTex(), transparent: true, opacity: .45, depthWrite: false}));
    (plume.material as T.Material).name = 'living.inflow-plume'; ownedM.push(plume.material as T.Material);
    plume.rotation.x = -PI / 2; plume.position.y = -h / 2 + .06; group.add(plume);
    grime.floor(B('A'), 'silt', [top[0], floor + .004, top[2]], 4.2, 3.6, .4);
    grime.floor(B('A'), 'puddle', [top[0] + .8, floor + .004, top[2] - .4], 3.2, 2.6, 1.2);
    // The crack: a bent glazing bar and a jagged dark gap at the lantern's lower edge.
    const k = Kit.at(B('A'), [top[0], top[1] + .05, top[2]], .3);
    k.rod([-.9, 0, 0], [.2, -.35, .1], .05, m.frame, 6); k.box([0, .02, 0], [1.6, .03, .6], m.rubber, [0, 0, .1]);
    hang('A-curtain-crack', 'A', [top[0], top[1] + .05, top[2]], [top[0] + .2, top[1] - .3, top[2] + .1], 'skylight');
    root.add(group);
    // Cold battery work light on a tripod beside the column, tilted up across the falling water (its light is a
    // render accent; the sheets carry the lit band).
    LIVING_CURTAIN.x = top[0]; LIVING_CURTAIN.z = top[2]; LIVING_CURTAIN.top = top[1]; LIVING_CURTAIN.floor = floor;
    const stand = ([[2.3, -2.4], [-2.4, -2.2], [2.6, 1.8], [-2.2, 2.4]] as const).map(([dx, dz]) => [top[0] + dx, floor, top[2] + dz] as V3).find(p => spotClear(p, .7, 2.2));
    if (stand) {
      const head: V3 = [stand[0], floor + 1.72, stand[2]], tgt: V3 = [top[0], floor + 4.6, top[2]];
      const dir = new T.Vector3(tgt[0] - head[0], tgt[1] - head[1], tgt[2] - head[2]).normalize();
      const tk = Kit.at(B('A'), stand, 0);
      for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + .4; tk.rod([Math.cos(a) * .55, 0, Math.sin(a) * .55], [0, 1.15, 0], .016, m.chrome, 6); }
      tk.rod([0, 1.1, 0], [0, 1.62, 0], .022, m.chrome, 8);
      tk.box([0, .6, 0], [.22, .14, .16], m.bandYellow, [0, .5, 0]);
      const hk = new Kit(B('A'), new T.Matrix4().compose(new T.Vector3(...head), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), dir), new T.Vector3(1, 1, 1)));
      hk.box([0, 0, -.08], [.34, .26, .16], m.bandYellow);
      hk.box([0, 0, .006], [.3, .22, .02], m.frame);
      for (let i = 0; i < 5; i++) hk.box([0, -.1 + i * .05, .02], [.3, .008, .012], m.frame);
      hk.rod([-.19, -.06, -.06], [.19, -.06, -.06], .012, m.chrome, 6);
      const lens = hk.point([0, 0, .03]);
      LIVING_CURTAIN.lamp = lens.map(v => +v.toFixed(3)) as V3; LIVING_CURTAIN.aim = [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) as V3;
      grime.floor(B('A'), 'scrape', [stand[0], floor + .004, stand[2]], 1.4, 1.4, .3);
    } else rep.skipped++;
    function radialTex() {
      const c2 = document.createElement('canvas'); c2.width = c2.height = 128; const x2 = c2.getContext('2d');
      if (x2) { const g = x2.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(.5, '#777'); g.addColorStop(1, '#000'); x2.fillStyle = g; x2.fillRect(0, 0, 128, 128); }
      const t = new T.CanvasTexture(c2); owned.push(t); return t;
    }
    return {
      update(time: number) {
        tex.offset.y = time * .22; tex2.offset.y = time * .37 + .3;
        for (let i = 0; i < N; i++) { let y = pts[i * 3 + 1] - speed[i] * .016; if (y < -h / 2) y += h; pts[i * 3 + 1] = y; }
        pg.getAttribute('position').needsUpdate = true;
        plume.rotation.z = time * .05; plume.scale.setScalar(1 + .06 * Math.sin(time * .7));
      },
    };
  }

  return {
    update(time: number) { curtain.update(time); },
  };
}

/** Dorm doors on corridor walls (kept in sync with living-dressing.ts) — wall wreck avoids them. */
export const DORM_DOORS: [string, Side, number][] = [
  ['C1', 'N', 17], ['C1', 'N', 21], ['C1', 'N', 51.5], ['C1', 'N', 55.5], ['C1', 'N', 60], ['C1', 'S', 17], ['C1', 'S', 36.5], ['C1', 'S', 40.5],
  ['C1', 'N', 26.5], ['C1', 'S', 59], ['C1', 'S', 46.5], ['C1', 'N', 44], ['C1', 'N', 47.4], ['C1', 'S', 34.4],
  ['C2', 'W', -10], ['C2', 'W', -20], ['C2', 'W', -30], ['C2', 'E', -14], ['C2', 'E', -26], ['C2', 'E', -35], ['C2', 'W', -24.6],
  ['C3', 'N', 88], ['C3', 'N', 94], ['C3', 'N', 100], ['C3', 'N', 112], ['C3', 'S', 87], ['C3', 'S', 93], ['C3', 'N', 106], ['C3', 'S', 90.2], ['C3', 'S', 98.6], ['C3', 'S', 84.5],
  ['C5', 'W', 27], ['C5', 'W', 34], ['C5', 'E', 30], ['C5', 'E', 37], ['C5', 'E', 33.5],
];
