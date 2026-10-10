// Blender hero GLB checks for level two (run: npx tsx tools/living-hero-glb-check.ts [--boxes])
//  1. Manifest placement == HERO_GLB_PLACEMENT (the static mirror used by fallbacks/colliders).
//  2. Operable part origins (HERO_GLB_PARTS) sit on their LIVING_ITEMS point: error ≤ 0.1 m.
//  3. No GLB triangle enters the pod's swept route volume (routeClear from living-decals: 2.8 × 3 × 5 m hull,
//     turning circles, photo stations, parking approach), tested on ≤ 0.2 m triangle fragments.
//  4. Strict hull test at each item's closest legal parking pose (pod centre 3.0–3.4 m from the item):
//     GLB geometry inside the 2.8 × 3 × 5 m OBB is listed (the operable part itself excluded).
// GLB files are parsed directly (JSON + BIN chunks); textures are not decoded.
import {readFileSync} from 'node:fs';
import * as T from 'three';

const ctx = new Proxy({}, {get: (_t, k) => k === 'measureText' ? () => ({width: 10}) : k === 'canvas' ? {width: 4, height: 4} : () => ({addColorStop() {}}), set: () => true});
const element = () => ({width: 4, height: 4, style: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, setAttribute() {}});
(globalThis as unknown as {document: unknown}).document = {createElement: element, createElementNS: element};

const {LIVING_ITEMS, LIVING_SPACES} = await import('../src/pod/content/living-deck-layout');
const {routeClear} = await import('../src/pod/view/deepsea/living-decals');
const {HERO_GLB_PLACEMENT, HERO_GLB_PARTS, ATRIUM_BALCONY_TILES} = await import('../src/pod/view/deepsea/living-hero-glb');
const {harborHullClear} = await import('../src/pod/sim/harbor-navigation');
const {livingSolids, livingWalkable} = await import('../src/pod/content/living-deck-layout');

const DIR = 'public/assets/deepsea/living/';
const HEROES = ['glass-blast-door', 'valve-manifold', 'security-post', 'manager-office', 'laundry-row', 'ballast-rack', 'atrium-balcony', 'gate-f', 'cocoon-corpse'] as const;
type Hero = typeof HEROES[number];
let failures = 0;
const fail = (m: string) => { failures++; console.error('FAIL', m); };
const f2 = (v: number) => v.toFixed(2);
const vs = (v: T.Vector3 | number[]) => `[${(Array.isArray(v) ? v : v.toArray()).map(n => n.toFixed(2)).join(', ')}]`;

// ---------------------------------------------------------------- GLB parse
interface Gltf {nodes: {name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]}[];
  meshes: {primitives: {attributes: {POSITION: number}; indices?: number}[]}[]; accessors: {bufferView: number; byteOffset?: number; componentType: number; count: number; type: string}[];
  bufferViews: {byteOffset?: number; byteLength: number; byteStride?: number}[]; scenes: {nodes: number[]}[]; scene?: number; extensionsRequired?: string[]}
function parseGlb(file: string) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
  const binStart = 20 + jsonLen + 8, bin = buf.subarray(binStart);
  if (json.extensionsRequired?.length) throw new Error(`${file}: unsupported ${json.extensionsRequired}`);
  const read = (ai: number) => {
    const a = json.accessors[ai], bv = json.bufferViews[a.bufferView], comps = a.type === 'VEC3' ? 3 : 1;
    const size = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
    const stride = bv.byteStride ?? comps * size, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), out = new Float64Array(a.count * comps);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * size;
      out[i * comps + c] = a.componentType === 5126 ? bin.readFloatLE(o) : a.componentType === 5125 ? bin.readUInt32LE(o) : a.componentType === 5123 ? bin.readUInt16LE(o) : bin.readUInt8(o);
    }
    return out;
  };
  /** Per node: world-in-asset matrix, triangles (flat xyz ×3) and the top-level ancestor name. */
  const nodes: {name: string; top: string; matrix: T.Matrix4; tris: Float64Array | null}[] = [];
  const walk = (ni: number, parent: T.Matrix4, top: string | null) => {
    const n = json.nodes[ni], m = new T.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else m.compose(new T.Vector3(...(n.translation ?? [0, 0, 0]) as [number, number, number]), new T.Quaternion(...(n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number]), new T.Vector3(...(n.scale ?? [1, 1, 1]) as [number, number, number]));
    const w = parent.clone().multiply(m), name = n.name ?? `#${ni}`, tp = top ?? name;
    let tris: Float64Array | null = null;
    if (n.mesh !== undefined) {
      const parts: number[] = [];
      for (const p of json.meshes[n.mesh].primitives) {
        const pos = read(p.attributes.POSITION), idx = p.indices !== undefined ? read(p.indices) : Float64Array.from({length: pos.length / 3}, (_, i) => i);
        const v = new T.Vector3();
        for (const k of idx) { v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).applyMatrix4(w); parts.push(v.x, v.y, v.z); }
      }
      tris = Float64Array.from(parts);
    }
    nodes.push({name, top: tp, matrix: w, tris});
    for (const c of n.children ?? []) walk(c, w, tp);
  };
  for (const r of json.scenes[json.scene ?? 0].nodes) walk(r, new T.Matrix4(), null);
  return nodes;
}

// ---------------------------------------------------------------- 1. placement mirror + manifests
const manifests = new Map<Hero, {placement: {position: number[]; rotationYDeg: number}; anchors?: Record<string, {world: number[]}>; suggestedInstances?: {position: number[]; rotationYDeg: number}[]}>();
for (const h of HEROES) {
  const j = JSON.parse(readFileSync(`${DIR}${h}.json`, 'utf8'));
  manifests.set(h, j);
  const p = HERO_GLB_PLACEMENT[h], mp = j.placement.position as number[];
  const d = Math.hypot(mp[0] - p.position[0], mp[1] - p.position[1], mp[2] - p.position[2]);
  if (d > 1e-3 || Math.abs((j.placement.rotationYDeg ?? 0) - p.yawDeg) > 1e-3) fail(`${h}: manifest placement ${vs(mp)} ${j.placement.rotationYDeg}° ≠ HERO_GLB_PLACEMENT ${vs([...p.position])} ${p.yawDeg}°`);
}
const tiles = manifests.get('atrium-balcony')!.suggestedInstances ?? [];
if (tiles.length !== ATRIUM_BALCONY_TILES.length || tiles.some((t, i) => Math.hypot(t.position[0] - ATRIUM_BALCONY_TILES[i].position[0], t.position[1] - ATRIUM_BALCONY_TILES[i].position[1], t.position[2] - ATRIUM_BALCONY_TILES[i].position[2]) > 1e-3 || t.rotationYDeg !== ATRIUM_BALCONY_TILES[i].yawDeg)) fail('atrium-balcony: suggestedInstances ≠ ATRIUM_BALCONY_TILES');

const placements = (h: Hero) => h === 'atrium-balcony'
  ? ATRIUM_BALCONY_TILES.map(t => ({position: t.position, yawDeg: t.yawDeg}))
  : [HERO_GLB_PLACEMENT[h]];
const rootMatrix = (p: {position: readonly number[]; yawDeg: number}) => new T.Matrix4().compose(new T.Vector3(p.position[0], p.position[1], p.position[2]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.yawDeg * Math.PI / 180), new T.Vector3(1, 1, 1));

// ---------------------------------------------------------------- 2. anchors
console.log('\nanchor errors (part origin → LIVING_ITEMS point)');
const parsed = new Map<Hero, ReturnType<typeof parseGlb>>();
for (const h of HEROES) parsed.set(h, parseGlb(`${DIR}${h}.glb`));
for (const spec of HERO_GLB_PARTS) {
  const node = parsed.get(spec.hero)!.find(n => n.name === spec.node);
  if (!node) { fail(`${spec.hero}: node ${spec.node} missing`); continue; }
  const o = new T.Vector3().applyMatrix4(rootMatrix(HERO_GLB_PLACEMENT[spec.hero]).multiply(node.matrix));
  if (!spec.id) { console.log(`  ${spec.hero}/${spec.node} origin ${vs(o)} (movable, no item point)`); continue; }
  const it = LIVING_ITEMS.find(i => i.id === spec.id)!;
  const ref = spec.role === 'tag' ? new T.Vector3(...it.position) : new T.Vector3(...it.position);
  const err = o.distanceTo(ref);
  const line = `  ${spec.id.padEnd(22)} ${spec.hero}/${spec.node.padEnd(14)} origin ${vs(o)} item ${vs(ref)} err ${err.toFixed(3)} m`;
  // the port glass is a child of the leaf and is checked through the manifest viewport anchor instead
  if (spec.role === 'tag') { const a = manifests.get('gate-f')!.anchors?.['viewport-outer']?.world ?? [0, 0, 0]; const e2 = new T.Vector3(...a as [number, number, number]).distanceTo(ref); console.log(`${line} | viewport-outer anchor err ${e2.toFixed(3)} m`); if (e2 > .1) fail(`${spec.id} anchor err ${e2.toFixed(3)}`); continue; }
  console.log(line);
  if (err > .1) fail(`${spec.id} anchor error ${err.toFixed(3)} m > 0.1`);
}

// ---------------------------------------------------------------- 3. swept route volume
const MAX = .2;
function* fragments(t: Float64Array, i: number): Generator<T.Box3> {
  const a = new T.Vector3(t[i], t[i + 1], t[i + 2]), b = new T.Vector3(t[i + 3], t[i + 4], t[i + 5]), c = new T.Vector3(t[i + 6], t[i + 7], t[i + 8]);
  const stack: [T.Vector3, T.Vector3, T.Vector3][] = [[a, b, c]];
  while (stack.length) {
    const [p, q, r] = stack.pop()!;
    const box = new T.Box3().setFromPoints([p, q, r]), s = box.getSize(new T.Vector3());
    if (Math.max(s.x, s.y, s.z) <= MAX || stack.length > 4000) { yield box; continue; }
    const pq = p.clone().lerp(q, .5), qr = q.clone().lerp(r, .5), rp = r.clone().lerp(p, .5);
    stack.push([p, pq, rp], [pq, q, qr], [rp, qr, r], [pq, qr, rp]);
  }
}
// cheap prefilter: anything farther than 4.5 m (xz) from every pod space interior cannot touch the route
const podSpaces = LIVING_SPACES.filter(s => s.pod);
const nearPod = (b: T.Box3) => podSpaces.some(s => b.max.x > s.minX - .5 && b.min.x < s.maxX + .5 && b.max.z > s.minZ - .5 && b.min.z < s.maxZ + .5 && b.max.y > s.floorY && b.min.y < s.ceilY);
const walk = livingWalkable().map(b => new T.Box3(new T.Vector3(...b.min), new T.Vector3(...b.max)));
const solids = livingSolids().map(b => new T.Box3(new T.Vector3(...b.min), new T.Vector3(...b.max)));
console.log('\nroute volume intrusion (GLB triangles vs routeClear)');
const intrusion = new Map<string, {n: number; box: T.Box3}>();
const allTris = new Map<Hero, {top: string; name: string; tris: Float64Array}[]>();
const boxesArg = process.argv.includes('--boxes');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
for (const h of HEROES) {
  if (only && !only.includes(h)) continue;
  const list: {top: string; name: string; tris: Float64Array}[] = [];
  for (const pl of placements(h)) {
    const R = rootMatrix(pl);
    for (const n of parsed.get(h)!) {
      if (!n.tris) continue;
      const w = new Float64Array(n.tris.length), v = new T.Vector3();
      for (let i = 0; i < n.tris.length; i += 3) { v.set(n.tris[i], n.tris[i + 1], n.tris[i + 2]).applyMatrix4(R); w[i] = v.x; w[i + 1] = v.y; w[i + 2] = v.z; }
      list.push({top: n.top, name: n.name, tris: w});
    }
  }
  allTris.set(h, list);
  if (h === 'cocoon-corpse') continue;   // M corridor (Alex side), never on the pod route
  for (const {name, tris} of list) {
    const nb = new T.Box3();
    for (let i = 0; i < tris.length; i += 9) {
      const tb = new T.Box3().setFromArray(tris.subarray(i, i + 9));
      if (!nearPod(tb)) continue;
      for (const fb of fragments(tris, i)) {
        if (routeClear(fb)) continue;
        const key = `${h}/${name}`, e = intrusion.get(key) ?? {n: 0, box: new T.Box3()};
        e.n++; e.box.union(fb); intrusion.set(key, e);
      }
      nb.union(tb);
    }
    if (boxesArg && !nb.isEmpty()) console.log(`  box ${h}/${name} ${vs(nb.min)} → ${vs(nb.max)}`);
  }
}
if (intrusion.size) for (const [k, e] of intrusion) fail(`route intrusion ${k}: ${e.n} fragments within ${vs(e.box.min)} → ${vs(e.box.max)}`);
else console.log('  ok: no GLB fragment inside the swept route volume');

// ---------------------------------------------------------------- 4. strict hull at the closest parking pose
console.log('\nstrict hull at closest legal parking pose (centre 3.0–3.4 m, facing the item)');
const ownPart = new Map(HERO_GLB_PARTS.filter(p => p.id).map(p => [p.id!, p.node]));
const heroOf = (id: string) => HERO_GLB_PARTS.find(p => p.id === id)?.hero;
for (const it of LIVING_ITEMS) {
  if (it.kind !== 'box' && it.kind !== 'terminal' && it.kind !== 'pipe') continue;
  const f = it.face * Math.PI / 180, dir = new T.Vector3(Math.sin(f), 0, -Math.cos(f)), heading = (it.face + 180) % 360;
  let park: T.Vector3 | null = null;
  for (const d of [3.0, 3.2, 3.4]) { const p = new T.Vector3(...it.position).addScaledVector(dir, d); p.y = 0; if (harborHullClear(p, heading, walk, solids)) { park = p; break; } }
  if (!park) { console.log(`  ${it.id}: no wall-clear parking pose (layout)`); continue; }
  const h = heading * Math.PI / 180, fwd = new T.Vector3(Math.sin(h), 0, -Math.cos(h)), side = new T.Vector3(Math.cos(h), 0, Math.sin(h));
  const hits = new Map<string, {n: number; depth: number; box: T.Box3}>();
  const v = new T.Vector3();
  const itemAt = new T.Vector3(...it.position);
  let gap = Infinity, gapBy = '', colGap = Infinity;
  for (const [hero, list] of allTris) for (const {top, name, tris} of list) {
    // the operated part may meet the nose only inside its 0.6 m contact zone around the item point
    const own = heroOf(it.id) === hero && (name === ownPart.get(it.id) || top === ownPart.get(it.id));
    for (let i = 0; i < tris.length; i += 3) {
      if (own && itemAt.distanceToSquared(v.set(tris[i], tris[i + 1], tris[i + 2])) < .36) continue;
      v.set(tris[i] - park.x, tris[i + 1] - park.y, tris[i + 2] - park.z);
      if (Math.abs(v.y) > 1.5) continue;
      const l = v.dot(fwd), s = v.dot(side);
      if (!own && l >= 2.5 && Math.abs(s) < 1.4) {
        const column = Math.hypot(tris[i] - itemAt.x, tris[i + 2] - itemAt.z) < .5;
        if (column) colGap = Math.min(colGap, l - 2.5);
        else if (l - 2.5 < gap) { gap = l - 2.5; gapBy = `${hero}/${name}`; }
      }
      if (Math.abs(l) < 2.5 && Math.abs(s) < 1.4) { const k = `${hero}/${name}`, e = hits.get(k) ?? {n: 0, depth: 0, box: new T.Box3()}; e.n++; e.depth = Math.max(e.depth, 2.5 - l); e.box.expandByPoint(v.clone().add(park)); hits.set(k, e); }
    }
  }
  const centreToItem = park.distanceTo(new T.Vector3(it.position[0], 0, it.position[2]));
  if (!hits.size) console.log(`  ok   ${it.id.padEnd(22)} park ${vs(park)} (${f2(centreToItem)} m), nose gap to non-operated GLB ${gap === Infinity ? 'none' : `${f2(gap)} m (${gapBy})`}${colGap === Infinity ? '' : `, rigging in the item's 0.5 m column ${f2(colGap)} m`}`);
  else for (const [k, e] of hits) console.log(`  NOTE ${it.id.padEnd(22)} park ${vs(park)} (${f2(centreToItem)} m): ${k} has ${e.n} verts inside the hull, deepest ${f2(e.depth)} m behind the nose, ${vs(e.box.min)} → ${vs(e.box.max)}`);
}
// ---------------------------------------------------------------- 5. sculpted creature GLBs (living-creatures.ts)
// Loaded per type with a procedural fallback; sizes must match the procedural bodies the sim was tuned on.
console.log('\ncreature GLBs (living-creature-<type>.glb)');
const CREATURES: Record<string, {clips: string[]; bones: string[]; size: [number, number][]}> = {
  lumen: {clips: ['drift', 'swim', 'reach'], bones: ['head', 'lure3'], size: [[1.1, 1.8], [3.3, 4.0], [.9, 1.6]]},
  shade: {clips: ['swim', 'idle', 'curl', 'attack'], bones: ['head', 'root'], size: [[.5, 1.0], [.4, .9], [4.7, 5.4]]},
  blind: {clips: ['swim', 'idle', 'sleep', 'attack'], bones: ['head', 'jaw'], size: [[1.0, 1.8], [.6, 1.1], [2.8, 3.4]]},
};
for (const [type, want] of Object.entries(CREATURES)) {
  const file = `${DIR}living-creature-${type}.glb`;
  let buf: Buffer;
  try { buf = readFileSync(file); } catch { fail(`${file} missing (procedural fallback only)`); continue; }
  const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as Gltf & {skins?: unknown[]; animations?: {name: string}[]; images?: unknown[]};
  const bad = (j.extensionsRequired ?? []).filter(e => e !== 'EXT_texture_webp');
  if (bad.length) fail(`${type}: extensionsRequired ${bad} not supported by GLTFLoader without plugins`);
  let tris = 0; const lo = new T.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate();
  for (const m of j.meshes) for (const p of m.primitives) {
    const pa = j.accessors[p.attributes.POSITION] as {min?: number[]; max?: number[]; count: number};
    tris += (p.indices !== undefined ? j.accessors[p.indices].count : pa.count) / 3;
    if (pa.min && pa.max) { lo.min(new T.Vector3(...pa.min as [number, number, number])); hi.max(new T.Vector3(...pa.max as [number, number, number])); }
  }
  const size = hi.clone().sub(lo), names = new Set(j.nodes.map(n => n.name)), clips = (j.animations ?? []).map(a => a.name);
  console.log(`  ${type.padEnd(6)} ${tris} tris, ${(buf.length / 1048576).toFixed(2)} MB, size ${vs(size)} m, skins ${j.skins?.length ?? 0}, clips ${clips.join('/')}`);
  if (tris > 40000) fail(`${type}: ${tris} triangles > 40000`);
  if (!j.skins?.length) fail(`${type}: no skin`);
  for (const c of want.clips) if (!clips.includes(c)) fail(`${type}: clip ${c} missing`);
  for (const b of want.bones) if (!names.has(b)) fail(`${type}: bone ${b} missing`);
  size.toArray().forEach((v, i) => { const [a, b] = want.size[i]; if (v < a || v > b) fail(`${type}: size ${'xyz'[i]} ${v.toFixed(2)} m outside procedural range ${a}–${b} m`); });
}

console.log(failures ? `\n${failures} failures` : '\nPASS living hero GLBs: placement mirror, anchors ≤ 0.1 m, route volume clear; creature GLBs within budget');
process.exit(failures ? 1 : 0);
