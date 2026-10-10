import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

const UP = new T.Vector3(0, 1, 0);

/** Planar UVs in metres from the dominant world normal. Box faces stay unstretched. */
export function worldUV(g: T.BufferGeometry, offset = 0) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  let uv = g.getAttribute('uv') as T.BufferAttribute | undefined;
  if (!uv || uv.count !== p.count) { uv = new T.BufferAttribute(new Float32Array(p.count * 2), 2); g.setAttribute('uv', uv); }
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i) + offset, y = p.getY(i), z = p.getZ(i) + offset;
    if (ay >= ax && ay >= az) uv.setXY(i, x, z);
    else if (ax >= az) uv.setXY(i, z * Math.sign(n.getX(i) || 1), y);
    else uv.setXY(i, -x * Math.sign(n.getZ(i) || 1), y);
  }
  uv.needsUpdate = true;
}

function normalise(g: T.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.getAttribute('uv')) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.index) { const n = g.getAttribute('position').count, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new T.BufferAttribute(idx, 1)); }
  g.clearGroups();
  return g;
}

export interface AddOptions { uv?: 'world' | 'keep'; solid?: boolean; shadow?: boolean }

/** Segment count for a cylinder of radius r so silhouettes stay round at pod-camera distances. */
export function roundSeg(r: number, seg = 8) {
  return Math.max(seg, r < .03 ? 6 : r < .08 ? 10 : r < .2 ? 16 : r < .6 ? 24 : 36);
}

/**
 * Optional build-time observer (checks only): receives the world AABB of every primitive
 * added to any Batcher, tagged with the batch name.
 */
export const batchProbe: {fn: ((box: T.Box3, batch: string, mat: T.Material) => void) | null} = {fn: null};

/** Collects static geometry per material and merges it once. */
export class Batcher {
  private buckets = new Map<T.Material, T.BufferGeometry[]>();
  private detailBuckets = new Map<string, {mat: T.Material; dist: number; parts: T.BufferGeometry[]}>();
  private detailScope: {dist: number; cell: number} | null = null;
  private noShadow = new Set<T.Material>();
  readonly solids: T.Box3[] = [];
  readonly geometries: T.BufferGeometry[] = [];
  /** Non-merged objects (instanced meshes, decals) parented to the batch group on build. */
  readonly extras: T.Object3D[] = [];
  private seed = 1;
  constructor(readonly name: string) {}
  rand() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  reseed(n: number) { this.seed = n >>> 0 || 1; }

  add(g: T.BufferGeometry, mat: T.Material, matrix?: T.Matrix4, o: AddOptions = {}) {
    if (matrix) g.applyMatrix4(matrix);
    if (batchProbe.fn) { g.computeBoundingBox(); batchProbe.fn(g.boundingBox!.clone(), this.name, mat); }
    if ((o.uv ?? 'world') === 'world') worldUV(g);
    normalise(g);
    const d = this.detailScope;
    if (d) {
      g.computeBoundingBox(); const c = g.boundingBox!.getCenter(new T.Vector3());
      const key = `${mat.uuid}|${d.dist}|${Math.floor(c.x / d.cell)}|${Math.floor(c.z / d.cell)}`;
      const e = this.detailBuckets.get(key) ?? {mat, dist: d.dist, parts: []}; e.parts.push(g); this.detailBuckets.set(key, e);
    } else { const list = this.buckets.get(mat) ?? []; list.push(g); this.buckets.set(mat, list); }
    if (o.shadow === false) this.noShadow.add(mat);
    if (o.solid) { g.computeBoundingBox(); this.solids.push(g.boundingBox!.clone()); }
    return g;
  }
  box(c: V3, s: V3, mat: T.Material, o: AddOptions & {rotY?: number; rotX?: number; rotZ?: number} = {}) {
    const g = new T.BoxGeometry(Math.max(s[0], 1e-3), Math.max(s[1], 1e-3), Math.max(s[2], 1e-3));
    const q = new T.Quaternion().setFromEuler(new T.Euler(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0, 'YXZ'));
    const m = new T.Matrix4().compose(new T.Vector3(...c), q, new T.Vector3(1, 1, 1));
    this.add(g, mat, m, {...o, solid: false});
    if (o.solid) this.solids.push(new T.Box3().setFromCenterAndSize(new T.Vector3(...c), new T.Vector3(...s)));
  }
  /** Axis-aligned box from min/max corners. */
  slab(min: V3, max: V3, mat: T.Material, o: AddOptions = {}) {
    this.box([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], [max[0] - min[0], max[1] - min[1], max[2] - min[2]], mat, o);
  }
  /** Cylinder between two points; UV u = circumference metres, v = length metres. */
  rod(a: V3, b: V3, r: number, mat: T.Material, seg = 12, o: AddOptions & {r2?: number; open?: boolean} = {}) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), len = d.length();
    if (len < 1e-4) return;
    const g = new T.CylinderGeometry(o.r2 ?? r, r, len, roundSeg(Math.max(r, o.r2 ?? 0), seg), 1, o.open ?? false);
    const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * len);
    const q = new T.Quaternion().setFromUnitVectors(UP, d.normalize());
    this.add(g, mat, new T.Matrix4().compose(A.add(B).multiplyScalar(.5), q, new T.Vector3(1, 1, 1)), {...o, uv: 'keep'});
  }
  /** Torus ring (flange, valve wheel rim) with its axis along `axis`. */
  ring(c: V3, axis: V3, R: number, r: number, mat: T.Material, seg = 24) {
    const g = new T.TorusGeometry(R, r, r > .05 ? 10 : 6, Math.max(seg, roundSeg(R, seg)));
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...axis).normalize());
    this.add(g, mat, new T.Matrix4().compose(new T.Vector3(...c), q, new T.Vector3(1, 1, 1)), {uv: 'keep'});
  }
  geo(g: T.BufferGeometry, mat: T.Material, p: V3, rot: T.Euler = new T.Euler(), scale: V3 = [1, 1, 1], o: AddOptions = {}) {
    this.add(g, mat, new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromEuler(rot), new T.Vector3(...scale)), o);
  }
  /**
   * Geometry added inside `fn` is merged per material per `cell`-metre XZ tile instead of per material,
   * and each tile mesh carries `userData.cullDist` (see {@link cullDetail}).
   */
  detail(dist: number, fn: () => void, cell = 40) {
    const prev = this.detailScope; this.detailScope = {dist, cell};
    try { fn(); } finally { this.detailScope = prev; }
  }
  get empty() { return this.buckets.size === 0 && this.detailBuckets.size === 0 && this.extras.length === 0; }
  build(parent: T.Object3D, cast = true) {
    const group = new T.Group(); group.name = this.name;
    for (const o of this.extras) group.add(o);
    this.extras.length = 0;
    const emit = (mat: T.Material, parts: T.BufferGeometry[], suffix = '') => {
      const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (parts.length > 1) parts.forEach(p => p.dispose());
      if (!g) return null;
      g.computeBoundingSphere(); g.computeBoundingBox();
      this.geometries.push(g);
      const mesh = new T.Mesh(g, mat);
      const transparent = (mat as T.MeshStandardMaterial).transparent;
      mesh.castShadow = cast && !transparent && !this.noShadow.has(mat); mesh.receiveShadow = !transparent;
      mesh.name = `${this.name}:${mat.name}${suffix}`;
      if (transparent) mesh.renderOrder = 3;
      group.add(mesh);
      return mesh;
    };
    for (const [mat, parts] of this.buckets) emit(mat, parts);
    for (const {mat, dist, parts} of this.detailBuckets.values()) {
      const mesh = emit(mat, parts, ':detail'); if (mesh) mesh.userData.cullDist = dist;
    }
    this.buckets.clear(); this.detailBuckets.clear();
    parent.add(group);
    return group;
  }
  dispose() { this.geometries.forEach(g => g.dispose()); }
}

const cullBox = new T.Box3(), cullP = new T.Vector3();
/** Shows `cullDist`-tagged detail tiles only within their distance of `focus` (nearest point of the tile box). */
export function cullDetail(meshes: readonly T.Mesh[], focus: T.Vector3) {
  for (const m of meshes) {
    cullBox.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    m.visible = cullBox.distanceToPoint(cullP.copy(focus)) < m.userData.cullDist;
  }
}

/** Seeded random helper independent of Batcher. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
