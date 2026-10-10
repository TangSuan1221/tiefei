import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {Batcher, rng, roundSeg, type V3} from './living-build';
import type {LivingMaterials} from './living-materials';

const UP = new T.Vector3(0, 1, 0);
const q = (r?: V3) => new T.Quaternion().setFromEuler(new T.Euler(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, 'YXZ'));

/** Local-space authoring into a Batcher: every primitive is transformed by the kit matrix. */
export class Kit {
  constructor(readonly b: Batcher, readonly m: T.Matrix4) {}
  static at(b: Batcher, p: V3, rotY = 0, extra?: V3, scale = 1) {
    return new Kit(b, new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(new T.Euler(extra?.[0] ?? 0, rotY, extra?.[2] ?? 0, 'YXZ')), new T.Vector3(scale, scale, scale)));
  }
  child(c: V3, r?: V3) { return new Kit(this.b, this.m.clone().multiply(new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(1, 1, 1)))); }
  /** World position of a local point. */
  point(c: V3): V3 { const v = new T.Vector3(...c).applyMatrix4(this.m); return [v.x, v.y, v.z]; }
  private place(g: T.BufferGeometry, mat: T.Material, local: T.Matrix4, uv: 'world' | 'keep' = 'world') {
    this.b.add(g, mat, this.m.clone().multiply(local), {uv});
  }
  /**
   * Hard-surface box. Prop-sized boxes (thicker than 1.5 cm, under 3 m) get a 4–12 mm chamfer so
   * edges catch the lamp; paper-thin sheets and long structural slabs stay plain boxes.
   */
  box(c: V3, s: V3, mat: T.Material, r?: V3) {
    const min = Math.min(...s), max = Math.max(...s);
    const bevel = Kit.bevel && min > .015 && max < 3 ? Math.min(.012, Math.max(.004, min * .12)) : 0;
    const g = bevel ? new RoundedBoxGeometry(s[0], s[1], s[2], 1, bevel) : new T.BoxGeometry(...s);
    this.place(g, mat, new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(1, 1, 1)));
  }
  /** Global switch for prop chamfers (kept on; exposed for perf A/B). */
  static bevel = true;
  rbox(c: V3, s: V3, mat: T.Material, radius = .04, r?: V3) {
    this.place(new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.min(radius, ...s.map(v => v * .45))), mat, new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(1, 1, 1)));
  }
  rod(a: V3, b: V3, r: number, mat: T.Material, seg = 8, r2?: number) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), len = d.length(); if (len < 1e-4) return;
    const g = new T.CylinderGeometry(r2 ?? r, r, len, roundSeg(Math.max(r, r2 ?? 0), seg));
    const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * len);
    this.place(g, mat, new T.Matrix4().compose(A.add(B).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(UP, d.normalize()), new T.Vector3(1, 1, 1)), 'keep');
  }
  sphere(c: V3, s: V3, mat: T.Material, seg = 12, r?: V3) {
    this.place(new T.SphereGeometry(1, seg, Math.max(4, seg * .6 | 0)), mat, new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(...s)));
  }
  cyl(c: V3, rTop: number, rBot: number, h: number, mat: T.Material, seg = 16, r?: V3) {
    const g = new T.CylinderGeometry(rTop, rBot, h, roundSeg(Math.max(rTop, rBot), seg));
    this.place(g, mat, new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(1, 1, 1)));
  }
  ring(c: V3, R: number, r: number, mat: T.Material, rot?: V3, seg = 24, arc = Math.PI * 2) {
    this.place(new T.TorusGeometry(R, r, r > .04 ? 10 : 6, Math.max(seg, roundSeg(R, seg)), arc), mat, new T.Matrix4().compose(new T.Vector3(...c), q(rot), new T.Vector3(1, 1, 1)), 'keep');
  }
  geo(g: T.BufferGeometry, mat: T.Material, c: V3 = [0, 0, 0], r?: V3, s: V3 = [1, 1, 1], uv: 'world' | 'keep' = 'world') {
    this.place(g, mat, new T.Matrix4().compose(new T.Vector3(...c), q(r), new T.Vector3(...s)), uv);
  }
  /** World AABB of a local box (registered as a pod collider). */
  solid(c: V3, s: V3) {
    const bb = new T.Box3().setFromCenterAndSize(new T.Vector3(...c), new T.Vector3(...s)).applyMatrix4(this.m);
    this.b.solids.push(bb); return bb;
  }
}

// ------------------------------------------------------------------ prefabs (human scale, metres)

export function chair(k: Kit, m: LivingMaterials, padded = true) {
  k.box([0, .45, 0], [.46, .05, .46], m.veneer);
  if (padded) k.rbox([0, .5, 0], [.44, .07, .44], m.padded, .03);
  k.box([0, .82, -.21], [.44, .5, .04], m.veneer);
  if (padded) k.rbox([0, .84, -.18], [.38, .38, .05], m.padded, .02);
  for (const [x, z] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) k.rod([x, 0, z], [x, .45, z], .018, m.chrome, 6);
}

export function diningTable(k: Kit, m: LivingMaterials, round = true) {
  if (round) { k.cyl([0, .74, 0], .62, .62, .04, m.veneer, 24); k.cyl([0, .37, 0], .06, .06, .7, m.chrome, 10); k.cyl([0, .02, 0], .32, .34, .04, m.chrome, 16); }
  else { k.box([0, .74, 0], [1.6, .04, .9], m.veneer); for (const [x, z] of [[-.72, -.38], [.72, -.38], [-.72, .38], [.72, .38]]) k.rod([x, 0, z], [x, .72, z], .025, m.chrome, 6); }
}

/** Planter with a dead broadleaf plant (drooping, blackened leaves). */
export function deadPlant(k: Kit, m: LivingMaterials, seed: number, size = 1, tree = false) {
  const r = rng(seed);
  k.rbox([0, .3 * size, 0], [.7 * size, .6 * size, .7 * size], m.veneer, .03);
  k.box([0, .58 * size, 0], [.62 * size, .04, .62 * size], m.soil);
  const stems = tree ? 1 : 3 + (r() * 3 | 0);
  for (let i = 0; i < stems; i++) {
    const a = r() * 6.28, lean = tree ? .05 : .15 + r() * .25, h = (tree ? 2.8 : .7 + r() * .7) * size;
    const top: V3 = [Math.cos(a) * lean * h, .6 * size + h, Math.sin(a) * lean * h];
    k.rod([0, .6 * size, 0], top, (tree ? .07 : .012) * size, m.plantDead, 5, (tree ? .03 : .008) * size);
    const branches = tree ? 7 : 1;
    for (let j = 0; j < branches; j++) {
      const from: V3 = tree ? [top[0] * (.5 + j * .07), .6 * size + h * (.45 + j * .075), top[2] * (.5 + j * .07)] : top;
      const ba = r() * 6.28, bl = tree ? (.5 + r() * .7) * size : 0;
      const tip: V3 = [from[0] + Math.cos(ba) * bl, from[1] + bl * (.2 + r() * .4), from[2] + Math.sin(ba) * bl];
      if (tree) k.rod(from, tip, .025 * size, m.plantDead, 4, .008 * size);
      const leaves = tree ? 3 : 4 + (r() * 4 | 0);
      for (let n = 0; n < leaves; n++) {
        const la = r() * 6.28, droop = .9 + r() * .9, ls = (.14 + r() * .12) * size * (tree ? 1.4 : 1);
        const at: V3 = tree ? tip : [top[0] * (.6 + r() * .4), top[1] - r() * h * .4, top[2] * (.6 + r() * .4)];
        k.sphere([at[0] + Math.cos(la) * ls * .7, at[1] - Math.sin(droop) * ls * .5, at[2] + Math.sin(la) * ls * .7], [ls, .012, ls * .45], m.plantDead, 6, [droop * .6, la, r() * .5]);
      }
    }
  }
  // fallen leaves around the pot
  for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = (.45 + r() * .5) * size; k.sphere([Math.cos(a) * d, .01, Math.sin(a) * d], [.13 * size, .008, .06 * size], m.plantDead, 6, [0, r() * 6, 0]); }
}

export function washer(k: Kit, m: LivingMaterials, open: number) {
  // Industrial front loader 1.4 × 1.6 × 1.3, door facing +Z.
  k.rbox([0, .8, 0], [1.4, 1.6, 1.3], m.porcelain, .06);
  k.box([0, .06, 0], [1.42, .12, 1.32], m.rubber);
  k.box([0, 1.48, .66], [1.3, .2, .04], m.trim);
  for (let i = 0; i < 4; i++) k.cyl([-.45 + i * .18, 1.48, .69], .035, .035, .03, i === 0 ? m.lampOff : m.chrome, 10, [Math.PI / 2, 0, 0]);
  k.ring([0, .8, .66], .4, .055, m.chrome, [0, 0, 0], 28);
  const door = k.child([-.45, .8, .69], [0, -open, 0]);
  door.ring([.45, 0, 0], .36, .05, m.chrome, [0, 0, 0], 24);
  door.cyl([.45, 0, 0], .33, .33, .04, m.darkGlass, 24, [Math.PI / 2, 0, 0]);
  k.cyl([0, .8, .6], .36, .36, .03, m.rubber, 24, [Math.PI / 2, 0, 0]);
}

export function shelving(k: Kit, m: LivingMaterials, w: number, d: number, h: number, shelves: number[], seed: number, crates = true, beam: T.Material = m.hazard, deck: T.Material = m.plate) {
  const r = rng(seed);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) k.box([x, h / 2, z], [.07, h, .07], beam === m.hazard ? m.frame : beam);
  for (const y of shelves) {
    k.box([0, y, 0], [w, .04, d], deck);
    for (const z of [-d / 2, d / 2]) k.box([0, y - .05, z], [w, .1, .05], beam);
    if (!crates) continue;
    for (let x = -w / 2 + .3; x < w / 2 - .3; x += .5 + r() * .4) {
      if (r() < .3) continue;
      const s: V3 = [.3 + r() * .25, .2 + r() * .3, Math.min(d * .8, .3 + r() * .3)];
      k.box([x, y + .02 + s[1] / 2, (r() - .5) * (d - s[2]) * .5], s, r() < .5 ? m.corpseCloth : m.veneer, [0, (r() - .5) * .3, 0]);
    }
  }
  for (let y = .4; y < h; y += .6) k.rod([-w / 2, y, -d / 2], [-w / 2, y + .55, d / 2], .01, m.frame, 4);
}

export function lockerRow(k: Kit, m: LivingMaterials, n: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * .5;
    k.box([x, 1.0, 0], [.48, 2.0, .5], m.indGreen);
    const open = r() < .25 ? .8 + r() * .8 : 0;
    const door = k.child([x - .23, 1.0, .26], [0, -open, 0]);
    door.box([.23, 0, 0], [.46, 1.94, .02], m.indGreen);
    for (let y = .7; y < .95; y += .06) door.box([.23, y, .012], [.3, .015, .01], m.rubber);
    door.box([.4, 0, .02], [.03, .14, .02], m.chrome);
  }
  k.box([0, 2.02, 0], [n * .5, .04, .52], m.frame);
}

export function crtConsole(k: Kit, m: LivingMaterials, w: number, screens: T.Material) {
  k.box([0, .38, 0], [w, .76, .8], m.indGreen);
  k.box([0, .78, .05], [w + .04, .04, .9], m.veneer);
  k.box([0, 1.05, -.28], [w, .5, .25], m.indGreen, [-.5, 0, 0]);
  for (let x = -w / 2 + .2; x < w / 2 - .1; x += .16) for (let j = 0; j < 3; j++) k.box([x, .96 + j * .09, -.18 - j * .05], [.08, .04, .05], j === 1 && x < 0 ? m.lampOff : m.rubber, [-.5, 0, 0]);
  const n = Math.max(1, Math.round(w / .62));
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (w / n);
    for (const y of [1.55, 2.08]) {
      // CRT: rounded bezel, tapered tube housing, recessed screen, vents and status lamp.
      k.rbox([x, y, -.02], [.54, .47, .1], m.trim, .035);
      k.rbox([x, y + .01, -.2], [.46, .4, .28], m.trim, .05);
      k.box([x, y + .02, -.39], [.3, .26, .14], m.trim);
      k.box([x, y + .015, .028], [.43, .34, .012], m.rubber);
      k.box([x, y + .015, .032], [.4, .31, .01], screens);
      for (let v = 0; v < 4; v++) k.box([x - .06 + v * .04, y + .22, -.2], [.02, .006, .2], m.rubber);
      k.cyl([x + .22, y - .2, .03], .012, .012, .01, m.lampOff, 8, [Math.PI / 2, 0, 0]);
      k.box([x - .15, y - .205, .03], [.12, .02, .01], m.chrome);
    }
  }
}

export function workbench(k: Kit, m: LivingMaterials, w: number, seed: number) {
  const r = rng(seed);
  k.box([0, .9, 0], [w, .06, .8], m.veneer);
  k.box([0, .3, 0], [w - .1, .04, .7], m.plate);
  for (const x of [-w / 2 + .05, w / 2 - .05]) for (const z of [-.35, .35]) k.box([x, .45, z], [.06, .9, .06], m.frame);
  // vise
  k.box([w / 2 - .3, 1.0, .3], [.2, .14, .16], m.bandBlue); k.rod([w / 2 - .3, 1.0, .38], [w / 2 - .3, 1.0, .55], .012, m.chrome, 6);
  // pegboard and hanging tools
  k.box([0, 1.7, -.42], [w, 1.1, .03], m.veneer);
  for (let i = 0; i < w * 4; i++) {
    const x = -w / 2 + .15 + r() * (w - .3), y = 1.3 + r() * .8, t = r();
    if (t < .4) k.rod([x, y + .12, -.39], [x, y - .1, -.39], .012, m.chrome, 5);
    else if (t < .7) { k.rod([x, y + .1, -.39], [x, y - .08, -.39], .012, m.trim, 5); k.box([x, y + .13, -.39], [.1, .04, .02], m.chrome); }
    else k.box([x, y, -.39], [.12, .2, .02], m.bandRed);
  }
  for (let i = 0; i < 4; i++) k.box([-w / 2 + .3 + r() * (w - .6), .95, (r() - .5) * .5], [.1 + r() * .2, .06, .06 + r() * .1], r() < .5 ? m.chrome : m.bandYellow, [0, r() * 3, 0]);
}

export function gasCylinders(k: Kit, m: LivingMaterials, n: number) {
  for (let i = 0; i < n; i++) {
    k.cyl([i * .32, .04, 0], .12, .12, .08, m.rubber, 16);
    k.cyl([i * .32, .79, 0], .13, .13, 1.42, i % 2 ? m.bandBlue : m.bandRed, 16);
    k.sphere([i * .32, 1.5, 0], [.13, .1, .13], i % 2 ? m.bandBlue : m.bandRed, 12);
    k.cyl([i * .32, 1.65, 0], .03, .03, .12, m.brass, 8);
  }
  k.box([(n - 1) * .16, 1.1, -.16], [n * .32 + .1, .04, .02], m.frame);
  k.rod([-.15, 1.15, .14], [(n - 1) * .32 + .15, 1.15, .14], .008, m.chrome, 4);
}

/** Human-scale dorm door set into a wall face (+Z normal); `ajar` shows a dark gap. */
export function dormDoor(k: Kit, m: LivingMaterials, ajar: boolean, scale = 1) {
  const s = scale;
  k.box([0, 1.15 * s, .03], [1.25 * s, 2.36 * s, .06], m.trim);
  k.box([0, 1.12 * s, .04], [1.1 * s, 2.24 * s, .05], m.rubber);
  if (ajar) k.box([.12 * s, 1.12 * s, .02 - .1], [.95 * s, 2.2 * s, .04], m.veneer, [0, .5, 0]);
  else k.box([0, 1.12 * s, .07], [1.02 * s, 2.2 * s, .05], m.veneer);
  k.box([.38 * s, 1.0 * s, .11], [.12 * s, .03 * s, .04], m.brass);
  k.box([0, 1.85 * s, .1], [.4 * s, .22 * s, .02], m.brass);
}

export function sofa(k: Kit, m: LivingMaterials, w: number, mat?: T.Material) {
  const f = mat ?? m.padded;
  for (const x of [-w / 2 + .12, w / 2 - .12]) for (const z of [-.36, .36]) k.cyl([x, .05, z], .035, .03, .1, m.chrome, 10);
  k.rbox([0, .25, 0], [w, .3, .9], f, .08); k.rbox([0, .5, .05], [w - .3, .18, .78], f, .07);
  k.rbox([0, .7, -.38], [w, .7, .22], f, .08);
  for (const x of [-w / 2 + .1, w / 2 - .1]) k.rbox([x, .5, 0], [.22, .55, .9], f, .07);
}

export function bench(k: Kit, m: LivingMaterials, w: number) {
  k.box([0, .45, 0], [w, .06, .45], m.veneer);
  for (let x = -w / 2 + .1; x <= w / 2 - .1; x += (w - .2) / 2) { k.box([x, .22, 0], [.05, .44, .4], m.chrome); }
  k.box([0, .75, -.24], [w, .3, .04], m.veneer);
}

export function bed(k: Kit, m: LivingMaterials, seed: number) {
  const r = rng(seed);
  k.box([0, .35, 0], [.95, .1, 2.0], m.chrome);
  for (const [x, z] of [[-.45, -.95], [.45, -.95], [-.45, .95], [.45, .95]]) k.rod([x, 0, z], [x, .35, z], .02, m.chrome, 6);
  k.rbox([0, .5, 0], [.9, .2, 1.95], m.padded, .05);
  k.rbox([0, .63, -.75], [.6, .1, .35], m.linen, .05);
  k.box([0, .62, .2], [.92, .04, 1.4], m.linen, [r() * .1, 0, (r() - .5) * .08]);
  k.box([0, .8, -.98], [.95, .9, .04], m.chrome);
}

// ------------------------------------------------------------------ environment kit (origin = floor centre, front = +Z)

/** Can/bottle vending machine 1.0 × 1.9 × 0.85: steel cabinet, glass front, product spirals, coin panel. */
export function vendingMachine(k: Kit, m: LivingMaterials, seed: number, body: T.Material = m.bandRed) {
  const r = rng(seed);
  for (const x of [-.42, .42]) for (const z of [-.34, .34]) k.cyl([x, .025, z], .035, .04, .05, m.rubber, 10);
  k.rbox([0, .05 + .925, 0], [1.0, 1.85, .85], body, .035);
  k.box([0, .12, .43], [.96, .14, .02], m.trim);                                     // kick plate
  k.rbox([0, 1.78, .4], [.94, .2, .08], m.trim, .02);                                   // header light box
  k.box([0, 1.78, .445], [.86, .13, .01], m.lampOff);
  // Glass window, inner cavity and five product rows.
  k.box([-.12, 1.08, .36], [.66, 1.1, .1], m.rubber);
  for (let i = 0; i < 5; i++) {
    const y = .62 + i * .21;
    k.box([-.12, y, .34], [.62, .015, .1], m.chrome);
    for (let j = 0; j < 5; j++) {
      if (r() < .18) continue;
      const x = -.38 + j * .13, tip = r() < .08;
      k.cyl([x, y + .065, .35], .032, .032, .12, [m.bandBlue, m.bandYellow, m.porcelain, m.bandRed][(r() * 4) | 0], 12, tip ? [Math.PI / 2, 0, 0] : undefined);
      k.ring([x, y + .02, .38], .035, .004, m.chrome, [Math.PI / 2, 0, 0], 12);
    }
  }
  k.box([-.12, 1.08, .425], [.68, 1.12, .012], m.darkGlass);
  k.box([-.12, 1.08, .43], [.7, 1.14, .01], m.trim);
  // Selection panel, coin slot, return cup, pickup flap.
  k.box([.36, 1.15, .43], [.2, .7, .02], m.trim);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.box([.31 + j * .1, 1.3 - i * .08, .445], [.06, .05, .015], m.chrome);
  k.box([.36, .92, .445], [.08, .02, .01], m.rubber); k.box([.36, .76, .44], [.1, .08, .03], m.rubber);
  k.box([-.12, .32, .43], [.6, .2, .03], m.rubber);
  k.box([-.12, .4, .445], [.62, .03, .02], m.chrome, [.4, 0, 0]);
}

/** Steel filing cabinet; `open` = metres each drawer is pulled out (top first). */
export function filingCabinet(k: Kit, m: LivingMaterials, drawers = 4, open: number[] = [], mat: T.Material = m.steel) {
  const h = drawers * .34 + .06;
  k.box([0, h / 2, 0], [.46, h, .62], mat);
  for (let i = 0; i < drawers; i++) {
    const y = .06 + i * .34 + .17, o = open[drawers - 1 - i] ?? 0;
    k.box([0, y, .315 + o], [.42, .31, .02], mat);
    k.box([0, y + .08, .33 + o], [.12, .025, .025], m.chrome);
    k.box([0, y + .12, .328 + o], [.08, .03, .005], m.paper);
    if (o > .05) {
      k.box([-.2, y - .02, .02 + o / 2], [.015, .26, .6], mat); k.box([.2, y - .02, .02 + o / 2], [.015, .26, .6], mat);
      k.box([0, y - .14, .02 + o / 2], [.4, .015, .6], mat);
      for (let f = 0; f < 6; f++) k.box([0, y - .03, -.2 + f * .08 + o / 2], [.36, .2, .01], f % 2 ? m.paper : m.bandYellow, [(f - 3) * .05, 0, 0]);
    }
  }
}

/** Wall-mounted CRT surveillance bank on a steel frame (back on the wall at local z = 0). */
export function monitorBank(k: Kit, m: LivingMaterials, cols: number, rows: number, screens: T.Material, seed: number) {
  const r = rng(seed), w = cols * .56 + .1, h = rows * .48 + .1;
  k.box([0, 1.45 + h / 2, .03], [w + .1, h + .1, .06], m.trim);
  for (const x of [-w / 2, w / 2]) k.box([x, 1.45 + h / 2, .2], [.05, h + .1, .34], m.frame);
  for (let j = 0; j <= rows; j++) k.box([0, 1.45 + .05 + j * .48 - .02, .2], [w, .04, .34], m.frame);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -w / 2 + .05 + .28 + i * .56, y = 1.45 + .05 + .24 + j * .48, dead = r() < .3;
    k.rbox([x, y, .2], [.5, .42, .3], m.trim, .03);
    k.box([x, y, .12], [.36, .3, .14], m.trim);
    k.box([x, y, .355], [.4, .32, .01], dead ? m.darkGlass : screens);
    k.box([x + .18, y - .17, .356], [.03, .015, .01], dead ? m.lampOff : m.lampRed);
  }
  // Cable loom falling from the bank to the floor.
  const cab = rng(seed + 9);
  for (let i = 0; i < 6; i++) {
    const x0 = -w / 2 + .2 + cab() * (w - .4), sag = .2 + cab() * .3;
    k.rod([x0, 1.45, .25], [x0 + (cab() - .5) * .2, .7, .25 + sag], .012, m.rubber, 6);
    k.rod([x0 + (cab() - .5) * .2, .7, .25 + sag], [x0 + (cab() - .5) * .5, .012, .35 + sag + cab() * .4], .012, m.rubber, 6);
  }
}

/** Wall clock (stopped). Faces +Z, centred at the origin. */
export function wallClock(k: Kit, m: LivingMaterials, hh: number, mm: number) {
  k.cyl([0, 0, .03], .2, .2, .05, m.trim, 32, [Math.PI / 2, 0, 0]);
  k.cyl([0, 0, .057], .18, .18, .005, m.porcelain, 32, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.box([Math.sin(a) * .15, Math.cos(a) * .15, .062], [.012, i % 3 ? .02 : .04, .004], m.rubber, [0, 0, -a]); }
  const ha = (hh % 12 + mm / 60) / 12 * Math.PI * 2, ma = mm / 60 * Math.PI * 2;
  k.box([Math.sin(ha) * .045, Math.cos(ha) * .045, .066], [.014, .1, .004], m.rubber, [0, 0, -ha]);
  k.box([Math.sin(ma) * .065, Math.cos(ma) * .065, .068], [.01, .14, .004], m.rubber, [0, 0, -ma]);
  k.cyl([0, 0, .06], .21, .21, .02, m.darkGlass, 32, [Math.PI / 2, 0, 0]);
}

/** Banded steel drum. */
export function drum(k: Kit, m: LivingMaterials, mat: T.Material, lid = true) {
  k.cyl([0, .44, 0], .29, .29, .88, mat, 28);
  for (const y of [.02, .3, .58, .86]) k.ring([0, y, 0], .29, .018, mat, [Math.PI / 2, 0, 0], 28);
  if (lid) k.cyl([.14, .885, .05], .03, .03, .015, m.brass, 10);
}

/** Wooden shipping crate with steel corner angles (size s, sits on the floor). */
export function crate(k: Kit, m: LivingMaterials, s: V3, mat: T.Material = m.veneer) {
  k.box([0, s[1] / 2, 0], [s[0] - .02, s[1] - .02, s[2] - .02], mat);
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.box([x * (s[0] / 2 - .02), s[1] / 2, z * (s[2] / 2 - .02)], [.05, s[1], .05], m.frame);
  for (const y of [.025, s[1] - .025]) for (const z of [-1, 1]) k.box([0, y, z * (s[2] / 2 - .02)], [s[0], .05, .05], m.frame);
  for (const y of [.025, s[1] - .025]) for (const x of [-1, 1]) k.box([x * (s[0] / 2 - .02), y, 0], [.05, .05, s[2]], m.frame);
}

/** Euro pallet 1.2 × 0.144 × 0.8. */
export function pallet(k: Kit, m: LivingMaterials) {
  for (const z of [-.35, 0, .35]) k.box([0, .02, z], [1.2, .04, .1], m.veneer);
  for (const x of [-.55, 0, .55]) for (const z of [-.35, 0, .35]) k.box([x, .065, z], [.14, .05, .1], m.veneer);
  for (let i = 0; i < 5; i++) k.box([-.5 + i * .25, .12, 0], [.14, .03, .8], m.veneer);
}

/** Cable drum on its side. */
export function cableSpool(k: Kit, m: LivingMaterials, R = .45, w = .5) {
  for (const z of [-w / 2, w / 2]) k.cyl([0, R, z], R, R, .04, m.veneer, 24, [Math.PI / 2, 0, 0]);
  k.cyl([0, R, 0], R * .7, R * .7, w - .04, m.rubber, 24, [Math.PI / 2, 0, 0]);
  k.cyl([0, R, 0], R * .18, R * .18, w + .06, m.frame, 12, [Math.PI / 2, 0, 0]);
}

/** Collapsed chandelier: a bent brass hoop with arms and broken glass chimneys lying on the floor. */
export function chandelierWreck(k: Kit, m: LivingMaterials, seed: number, R = 1.6) {
  const r = rng(seed);
  // Tilted 0.18 rad about X; lifted so the low side of the hoop (tube radius 0.05) rests on the floor.
  const tilt = k.child([0, R * Math.sin(.18) + .05 * Math.cos(.18), 0], [.18, 0, 0]);
  tilt.ring([0, 0, 0], R, .05, m.brass, [Math.PI / 2, 0, 0], 48);
  tilt.ring([0, .55, 0], R * .55, .035, m.brass, [Math.PI / 2, 0, 0], 36);
  tilt.rod([0, -.1, 0], [0, 1.6, 0], .06, m.brass, 12);
  tilt.sphere([0, .3, 0], [.22, .3, .22], m.brass, 16);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, bent = r() < .35 ? .4 * r() : 0;
    const p: V3 = [Math.cos(a) * R, 0, Math.sin(a) * R];
    tilt.rod([0, .3, 0], [p[0] * .96, bent, p[2] * .96], .022, m.brass, 6);
    tilt.cyl([p[0], .06, p[2]], .05, .04, .06, m.brass, 10);
    if (r() < .55) tilt.cyl([p[0], .18, p[2]], .045, .055, .2, m.glassSoft, 12);
  }
  tilt.rod([0, 1.6, 0], [.4, 2.4, -.8], .025, m.chrome, 6);
  for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = R * (.6 + r() * 1.1); k.box([Math.cos(a) * d, .008, Math.sin(a) * d], [.04 + r() * .08, .01, .03 + r() * .06], m.glassSoft, [0, r() * 6, 0]); }
}

/** Free-standing coat stand with a hanging coat. */
export function coatStand(k: Kit, m: LivingMaterials, coat?: T.Material) {
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; k.rod([0, .02, 0], [Math.cos(a) * .3, .02, Math.sin(a) * .3], .015, m.chrome, 6); }
  k.rod([0, 0, 0], [0, 1.8, 0], .022, m.chrome, 10);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; k.rod([0, 1.7, 0], [Math.cos(a) * .18, 1.78, Math.sin(a) * .18], .01, m.chrome, 6); }
  if (coat) { k.rbox([.12, 1.25, 0], [.42, .9, .16], coat, .06, [0, 0, .08]); k.rbox([.12, 1.68, 0], [.36, .1, .14], coat, .04); }
}

/** Wall fire extinguisher on its bracket (wall at local z = 0). */
export function extinguisher(k: Kit, m: LivingMaterials) {
  k.box([0, 1.1, .02], [.12, .3, .04], m.trim);
  k.cyl([0, .95, .12], .085, .085, .5, m.bandRed, 18); k.sphere([0, 1.2, .12], [.085, .05, .085], m.bandRed, 12);
  k.cyl([0, 1.27, .12], .025, .025, .08, m.chrome, 8); k.box([.05, 1.3, .12], [.1, .02, .03], m.rubber);
  k.rod([0, 1.25, .2], [.03, .85, .22], .012, m.rubber, 6);
}

/** Surface conduit run with junction box and clamps (wall at local z = 0, runs along local X). */
export function conduitRun(k: Kit, m: LivingMaterials, len: number, y: number, boxes: number[] = [], standoff = .24) {
  // Stand-off clears the 0.17 m frame-rib flanges; brackets reach back to the panel.
  const o = standoff;
  k.rod([-len / 2, y, o], [len / 2, y, o], .025, m.chrome, 10);
  k.rod([-len / 2, y + .09, o - .01], [len / 2, y + .09, o - .01], .016, m.trim, 8);
  for (let x = -len / 2 + .3; x < len / 2; x += .9) { k.box([x, y + .045, o / 2], [.04, .16, o], m.frame); }
  for (const x of boxes) { k.rbox([x, y, o + .01], [.26, .32, .12], m.steel, .015); k.box([x, y, o + .075], [.2, .26, .01], m.trim); k.rod([x, y - .16, o + .01], [x, y - .7, o + .01], .02, m.chrome, 8); }
}

/** Overturned office desk (lying on its back, top facing +Z). */
export function deskToppled(k: Kit, m: LivingMaterials, mat: T.Material = m.steel) {
  const t = k.child([0, .4, 0], [-Math.PI / 2, 0, 0]);
  t.box([0, .74 - .45, 0], [1.6, .04, .8], m.veneer);
  t.box([-.6, .36 - .45, 0], [.4, .72, .76], mat);
  t.box([.75, .36 - .45, 0], [.04, .72, .76], mat);
  for (let i = 0; i < 3; i++) t.box([-.6, .12 + i * .22 - .45, .39], [.36, .18, .02], mat);
}

/** Stack of bound files / books. */
export function fileStack(k: Kit, m: LivingMaterials, n: number, seed: number) {
  const r = rng(seed);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = .03 + r() * .04;
    k.box([(r() - .5) * .04, y + h / 2, (r() - .5) * .04], [.24 + r() * .06, h, .31 + r() * .03], [m.bandBlue, m.bandRed, m.paper, m.trim, m.bandYellow][(r() * 5) | 0], [0, (r() - .5) * .4, 0]);
    y += h;
  }
}

/** Sanatorium wheelchair (upright; tip it with a child transform). Seat faces +Z. */
export function wheelchair(k: Kit, m: LivingMaterials) {
  for (const s of [-1, 1]) {
    k.ring([s * .3, .312, -.05], .29, .018, m.rubber, [0, Math.PI / 2, 0], 28);
    k.ring([s * .3, .312, -.05], .25, .008, m.chrome, [0, Math.PI / 2, 0], 24);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI; k.rod([s * .3, .312 + Math.sin(a) * .25, -.05 + Math.cos(a) * .25], [s * .3, .312 - Math.sin(a) * .25, -.05 - Math.cos(a) * .25], .004, m.chrome, 4); }
    k.cyl([s * .3, .312, -.05], .04, .04, .06, m.chrome, 10, [0, 0, Math.PI / 2]);
    k.rod([s * .24, .5, .25], [s * .24, .5, -.25], .014, m.chrome, 6);
    k.rod([s * .24, .5, -.25], [s * .24, 1.0, -.3], .014, m.chrome, 6);
    k.rod([s * .24, 1.0, -.3], [s * .24, 1.0, -.42], .016, m.rubber, 6);
    k.rod([s * .24, .5, .25], [s * .2, .1, .38], .012, m.chrome, 6);
    k.cyl([s * .2, .05, .38], .05, .05, .03, m.rubber, 12, [0, 0, Math.PI / 2]);
    k.box([s * .18, .1, .46], [.12, .015, .1], m.chrome);
    k.rod([s * .24, .5, .2], [s * .24, .7, .15], .012, m.chrome, 6); k.box([s * .24, .7, .02], [.05, .03, .3], m.rubber);
  }
  k.box([0, .5, 0], [.46, .03, .44], m.corpseCloth);
  k.box([0, .76, -.29], [.46, .44, .02], m.corpseCloth, [-.1, 0, 0]);
}

/** Hospital gurney 1.95 × 0.85 × 0.65 on four casters, head end at −Z. */
export function gurney(k: Kit, m: LivingMaterials) {
  for (const x of [-.27, .27]) for (const z of [-.85, .85]) { k.rod([x, .1, z], [x, .78, z], .02, m.chrome, 6); k.cyl([x, .05, z], .05, .05, .035, m.rubber, 12, [0, 0, Math.PI / 2]); }
  for (const x of [-.29, .29]) k.rod([x, .8, -.95], [x, .8, .95], .02, m.chrome, 6);
  for (const z of [-.95, .95]) k.rod([-.29, .8, z], [.29, .8, z], .02, m.chrome, 6);
  k.box([0, .8, 0], [.56, .03, 1.86], m.steel);
  k.rbox([0, .86, 0], [.6, .09, 1.9], m.padded, .04);
  for (const x of [-.33, .33]) { k.rod([x, .82, -.6], [x, 1.05, -.6], .012, m.chrome, 6); k.rod([x, .82, .4], [x, 1.05, .4], .012, m.chrome, 6); k.rod([x, 1.05, -.6], [x, 1.05, .4], .014, m.chrome, 6); }
  for (const z of [-.3, .35]) k.box([0, .915, z], [.64, .012, .08], m.rubber);
}

/** Meal trolley cabinet .5 × 1.35 × .9 with tray runners (front faces +Z). */
export function mealTrolley(k: Kit, m: LivingMaterials) {
  for (const x of [-.2, .2]) for (const z of [-.38, .38]) k.cyl([x, .05, z], .05, .05, .04, m.rubber, 12, [0, 0, Math.PI / 2]);
  k.box([0, .1, 0], [.48, .04, .86], m.chrome);
  for (const x of [-.24, .24]) k.box([x, .74, 0], [.02, 1.28, .88], m.steel);
  k.box([0, 1.38, 0], [.5, .04, .9], m.steel); k.box([0, .74, -.44], [.48, 1.28, .02], m.steel);
  for (let y = .25; y < 1.3; y += .12) for (const x of [-.22, .22]) k.box([x, y, 0], [.02, .015, .84], m.chrome);
  k.rod([-.2, 1.25, .48], [.2, 1.25, .48], .015, m.chrome, 6);
}

/** Yellow folding wet-floor A-frame (unlabelled), feet on y = 0. */
export function wetFloorSign(k: Kit, m: LivingMaterials) {
  for (const s of [-1, 1]) k.box([0, .307, s * .1], [.3, .62, .012], m.bandYellow, [s * .17, 0, 0]);
  k.box([0, .62, 0], [.08, .03, .05], m.bandYellow);
  for (const s of [-1, 1]) k.box([0, .3, s * .108], [.2, .22, .002], m.rubber, [s * .17, 0, 0]);
}

/** Office workstation desk 1.4 × .7 with pedestal, modesty panel, CRT, keyboard and phone (user side +Z). */
export function officeDesk(k: Kit, m: LivingMaterials, screen: T.Material) {
  k.box([0, .74, 0], [1.4, .04, .7], m.veneer);
  k.box([.48, .36, 0], [.4, .72, .66], m.steel); for (let i = 0; i < 3; i++) k.box([.48, .14 + i * .22, .335], [.36, .19, .015], m.steel);
  k.box([-.68, .36, 0], [.03, .72, .66], m.steel); k.box([0, .45, -.32], [1.34, .5, .02], m.steel);
  k.rbox([-.2, .97, -.12], [.42, .38, .4], m.trim, .04); k.box([-.2, .98, .085], [.34, .26, .01], screen);
  k.box([-.2, .765, .14], [.44, .022, .15], m.trim);
  k.rbox([.42, .79, -.1], [.2, .08, .22], m.trim, .02); k.rbox([.42, .845, -.1], [.18, .04, .06], m.rubber, .015);
  k.rod([-.2, .76, -.3], [-.4, .02, -.4], .008, m.rubber, 4);
}

/** Free-standing office screen panel w × h (feet on y = 0), fabric face. */
export function partition(k: Kit, m: LivingMaterials, w: number, h: number, face: T.Material = m.padTeal) {
  k.box([0, h / 2 + .03, 0], [w - .06, h - .06, .05], face);
  for (const s of [-1, 1]) k.box([s * (w / 2 - .02), h / 2, 0], [.04, h, .06], m.trim);
  k.box([0, h - .01, 0], [w, .03, .07], m.trim);
  for (const s of [-1, 1]) k.box([s * (w / 2 - .1), .015, 0], [.06, .03, .45], m.trim);
}

/** Recessed fountain up-light: drum housing on a yoke, lens facing local +Y (tilt with the kit). */
export function upLight(k: Kit, m: LivingMaterials, lens: T.Material) {
  k.cyl([0, .03, 0], .2, .22, .06, m.frame, 16);
  for (const s of [-1, 1]) k.box([s * .17, .14, 0], [.03, .2, .06], m.frame);
  const head = k.child([0, .2, 0], [.0, 0, 0]);
  head.cyl([0, 0, 0], .14, .12, .2, m.brass, 18);
  head.cyl([0, .105, 0], .12, .12, .01, lens, 18);
  head.ring([0, .11, 0], .125, .012, m.brass, [Math.PI / 2, 0, 0], 18);
  for (let i = 0; i < 4; i++) head.box([0, .14, -.09 + i * .06], [.24, .008, .01], m.frame);
}
