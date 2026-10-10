// Environment-art checks for level two (run: npx tsx tools/living-dressing-check.ts)
//  1. Visual-only dressing (shells, dressing, clutter, signage) stays out of the pod's swept route
//     volume — 2.8 × 3 × 5 m hull along LIVING_MAIN_ROUTE, turning circles at waypoints and photo
//     stations, parking approach legs (see routeClear in living-decals.ts).
//  2. Every floor prefab authored at the origin rests on y = 0 (no floating or sunk furniture).
// Canvas/Image are stubbed: geometry is real, textures are not drawn.
import * as T from 'three';

const ctx = new Proxy({}, {
  get: (_t, k) => k === 'measureText' ? () => ({width: 10}) : k === 'canvas' ? {width: 4, height: 4} : () => ({addColorStop() {}}),
  set: () => true,
});
const element = () => ({width: 4, height: 4, style: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, setAttribute() {}});
(globalThis as unknown as {document: unknown}).document = {createElement: element, createElementNS: element};

const {batchProbe, Batcher} = await import('../src/pod/view/deepsea/living-build');
const {routeClear} = await import('../src/pod/view/deepsea/living-decals');
const {createLivingMaterials} = await import('../src/pod/view/deepsea/living-materials');
const {buildShells} = await import('../src/pod/view/deepsea/living-shells');
const {buildDressing} = await import('../src/pod/view/deepsea/living-dressing');
const P = await import('../src/pod/view/deepsea/living-props');
const W = await import('../src/pod/view/deepsea/living-wreck');
const {PERSONAL_PARTS, LOOSE_PARTS} = await import('../src/pod/view/deepsea/living-shells');
const {SignAtlas} = await import('../src/pod/view/deepsea/living-signage');
const {LIVING_SPACES} = await import('../src/pod/content/living-deck-layout');
const {checkLivingFonts} = await import('./living-font-check');

let failures = 0;
const viol = new Map<string, {n: number; sample: string}>();
batchProbe.fn = (box, batch, mat) => {
  if (routeClear(box)) return;
  const key = `${batch} · ${mat.name}`, v = viol.get(key) ?? {n: 0, sample: ''};
  v.n++; if (!v.sample) v.sample = `[${box.min.toArray().map((x: number) => x.toFixed(1))}]→[${box.max.toArray().map(x => x.toFixed(1))}]`;
  viol.set(key, v);
};
const m = createLivingMaterials();
const shells = buildShells(m);
const root = new T.Group();
// Scatter placements are cleared on emit: tally them at emit time.
const smallTally = new Map<string, Record<string, number>>();
for (const [id, s] of shells.scatter) {
  const emit = s.emit.bind(s);
  s.emit = (b: InstanceType<typeof Batcher>) => { smallTally.set(id, s.tally()); emit(b); };
}
const dressing = buildDressing(m, shells, root);
batchProbe.fn = null;
// Instanced scatter is emitted into batch extras: check each instance box too.
for (const [id, b] of shells.batches) for (const o of b.extras) {
  if (!(o instanceof T.InstancedMesh)) continue;
  o.geometry.computeBoundingBox();
  const mm = new T.Matrix4();
  for (let i = 0; i < o.count; i++) {
    o.getMatrixAt(i, mm);
    const box = o.geometry.boundingBox!.clone().applyMatrix4(mm);
    if (!routeClear(box)) { const key = `living-shell-${id} · inst:${o.name}`, v = viol.get(key) ?? {n: 0, sample: ''}; v.n++; v.sample ||= box.min.toArray().map((x: number) => x.toFixed(1)).join(','); viol.set(key, v); }
  }
}
let instances = 0;
for (const b of shells.batches.values()) for (const o of b.extras) if (o instanceof T.InstancedMesh) instances += o.count;
if (viol.size) { failures += viol.size; for (const [k, v] of viol) console.error(`FAIL route intrusion ${k} ×${v.n}  e.g. ${v.sample}`); }
else console.log(`ok route: no visual dressing primitive or instance inside the pod route volume (${instances} instances checked)`);

// ---------------------------------------------------------------- prefab grounding
type Prefab = [string, (k: InstanceType<typeof P.Kit>) => void];
const prefabs: Prefab[] = [
  ['chair', k => P.chair(k, m)], ['diningTable', k => P.diningTable(k, m)], ['deadPlant', k => P.deadPlant(k, m, 3, 1.2)],
  ['deadTree', k => P.deadPlant(k, m, 4, 1.8, true)], ['washer', k => P.washer(k, m, .5)], ['shelving', k => P.shelving(k, m, 2, .5, 2.1, [.4, 1.2], 5)],
  ['lockerRow', k => P.lockerRow(k, m, 4, 6)], ['crtConsole', k => P.crtConsole(k, m, 2.4, m.screenDead)], ['workbench', k => P.workbench(k, m, 3, 7)],
  ['gasCylinders', k => P.gasCylinders(k, m, 4)], ['sofa', k => P.sofa(k, m, 2.2)], ['bench', k => P.bench(k, m, 2)], ['bed', k => P.bed(k, m, 9)],
  ['vendingMachine', k => P.vendingMachine(k, m, 1)], ['vendingToppled', k => P.vendingMachine(k.child([0, .425, .95], [-Math.PI / 2, 0, 0]), m, 2)],
  ['filingCabinet', k => P.filingCabinet(k, m, 4, [.3])], ['filingFallen', k => P.filingCabinet(k.child([0, .31, 0], [-Math.PI / 2, 0, 0]), m, 4)],
  ['drum', k => P.drum(k, m, m.bandRed)], ['crate', k => P.crate(k, m, [1, .8, .9])], ['pallet', k => P.pallet(k, m)], ['cableSpool', k => P.cableSpool(k, m)],
  ['chandelierWreck', k => P.chandelierWreck(k, m, 3, 2)], ['coatStand', k => P.coatStand(k, m, m.corpseCloth)], ['deskToppled', k => P.deskToppled(k, m)],
  ['fileStack', k => P.fileStack(k, m, 4, 2)],
  ['wheelchair', k => P.wheelchair(k, m)], ['gurney', k => P.gurney(k, m)], ['mealTrolley', k => P.mealTrolley(k, m)], ['wetFloorSign', k => P.wetFloorSign(k, m)],
  ['officeDesk', k => P.officeDesk(k, m, m.screenDead)], ['partition', k => P.partition(k, m, 1.6, 1.4)], ['upLight', k => P.upLight(k, m, m.lampOff)],
];
for (const [name, make] of prefabs) {
  const b = new Batcher(`ground-${name}`); let minY = Infinity;
  batchProbe.fn = box => { minY = Math.min(minY, box.min.y); };
  make(P.Kit.at(b, [0, 0, 0], 0));
  batchProbe.fn = null;
  const ok = minY > -.006 && minY < .012;
  if (!ok) { failures++; console.error(`FAIL ground ${name}: lowest point y=${minY.toFixed(3)} m`); }
  else console.log(`ok ground ${name}: lowest point y=${minY.toFixed(3)} m`);
}
// ---------------------------------------------------------------- hanging elements have a support
// Every registered suspended element (cables, banners, strands, lamp battens, dangling fixtures) must
// start at the surface it claims to hang from: ceiling / wall / balcony soffit / cable tray / beam / skylight.
{
  const {LIVING_HANGERS} = W;
  const segDist = (p: number[], a: number[], b: number[]) => {
    const P = new T.Vector3(...p), A = new T.Vector3(...a), B = new T.Vector3(...b);
    return new T.Line3(A, B).closestPointToPoint(P, true, new T.Vector3()).distanceTo(P);
  };
  const bad: string[] = [];
  for (const h of LIVING_HANGERS) {
    const s = LIVING_SPACES.find(x => x.id === h.space);
    const [x, y, z] = h.top;
    const wallDist = s ? Math.min(Math.abs(x - s.minX), Math.abs(x - s.maxX), Math.abs(z - s.minZ), Math.abs(z - s.maxZ)) : Infinity;
    let ok = !!s && h.top[1] >= h.bottom[1] - .01;
    if (ok && s) switch (h.host) {
      case 'ceiling': ok = y >= s.ceilY - .75 && y <= s.ceilY + .3; break;
      case 'beam': ok = y >= s.ceilY - 1.0 && y <= s.ceilY + .05; break;
      case 'wall': ok = wallDist <= .6; break;
      case 'tray': ok = wallDist <= 1.3 && y >= s.floorY + 4.5 && y <= s.ceilY; break;
      case 'line': ok = LIVING_HANGERS.some(o => o !== h && o.host !== 'line' && segDist(h.top, o.top, o.bottom) <= .15); break;
      case 'skylight': ok = s.id === 'A' && y >= s.ceilY && Math.abs(x - 155) <= 9.6 && Math.abs(z - 62) <= 9.6; break;
      case 'balcony': ok = s.id === 'A' && ((y >= -.8 && y <= .45) || (y >= 5.2 && y <= 6.3)) && (z <= 46.6 || z >= 77.4 || x <= 114.6 || x >= 195.4); break;
    }
    if (!ok) bad.push(`${h.id} [${h.space}/${h.host}] top ${h.top.map(v => v.toFixed(2)).join(',')}`);
  }
  for (const s of dressing.sheets) if (!s.userData.hanging) bad.push(`free-floating sheet @ ${s.position.toArray().map(v => v.toFixed(1)).join(',')}`);
  if (bad.length) { failures += bad.length; for (const b of bad.slice(0, 30)) console.error(`FAIL hanging support ${b}`); }
  else console.log(`ok hanging: ${LIVING_HANGERS.length} suspended elements all start on a ceiling, wall, soffit, tray, beam or skylight`);
}

// ---------------------------------------------------------------- dressing density / corridor modules / report
{
  const {LIVING_WRECK_REPORT: R, LIVING_UPLIGHTS} = W;
  const small = new Set<string>([...PERSONAL_PARTS, ...LOOSE_PARTS]);
  const rooms = ['R1', 'R2', 'R3', 'R4', 'R5', 'V', 'G'];
  for (const id of rooms) {
    const t = smallTally.get(id) ?? {};
    const inst = Object.entries(t).filter(([k]) => small.has(k)).reduce((a, [, n]) => a + n, 0);
    const kit = R.props[id] ?? 0;
    const ok = inst >= 30;
    if (!ok) failures++;
    console[ok ? 'log' : 'error'](`${ok ? 'ok' : 'FAIL'} props ${id}: ${inst} instanced small props (personal/loose), ${kit} placed by the wreck pass`);
  }
  const corr = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];
  for (const id of corr) {
    const mods = R.modules.filter(x => x.space === id);
    const ident = R.identifiers[id];
    const sp = LIVING_SPACES.find(x => x.id === id)!;
    const len = Math.max(sp.maxX - sp.minX, sp.maxZ - sp.minZ);
    const need = Math.max(1, Math.floor(len / 8));
    const ok = mods.length >= need && !!ident;
    if (!ok) failures++;
    console[ok ? 'log' : 'error'](`${ok ? 'ok' : 'FAIL'} corridor ${id} (${len} m): ${mods.length} damage modules [${mods.map(x => x.kind).join(', ')}], identifier: ${ident ?? 'MISSING'}`);
  }
  console.log(`info wreck: ${R.skipped} placements skipped for route clearance`);
  if (SignAtlas.suppressed.length) console.log(`info signs: generated titles suppressed in favour of GLB copy: ${SignAtlas.suppressed.join(', ')}`);
  if (process.argv.includes('--uplights')) for (const u of LIVING_UPLIGHTS) console.log(`uplight ${u.id} ${u.state} @ ${u.position.join(', ')} aim ${u.aim.join(', ')}`);
}

// ---------------------------------------------------------------- sign glyph coverage
{
  const {chars, missing} = checkLivingFonts();
  const miss = Object.entries(missing);
  if (miss.length) { failures++; console.error(`FAIL fonts: ${miss.map(([f, c]) => `${f}: ${c}`).join(' · ')}  (re-subset: see tools/living-font-check.ts)`); }
  else console.log(`ok fonts: ${chars.size} non-ASCII sign characters covered by the subset fonts`);
}

if (process.argv.includes('--lamps')) {
  const {LIVING_ANCHOR_LAMPS} = await import('../src/pod/view/deepsea/living-clutter');
  for (const l of LIVING_ANCHOR_LAMPS) console.log(`lamp ${l.id} [${l.space}] ${l.color} @ ${l.position.map(v => v.toFixed(2)).join(', ')} facing ${l.facing.join(',')} ${l.flicker} I=${l.light.intensity.toFixed(1)} r=${l.light.range.toFixed(1)}`);
}
console.log(failures ? `${failures} failures` : 'PASS living dressing: route volume clear, prefabs grounded');
process.exit(failures ? 1 : 0);
