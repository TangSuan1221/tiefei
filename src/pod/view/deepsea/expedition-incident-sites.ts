import { Box3, BufferGeometry, CatmullRomCurve3, CylinderGeometry, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionRoom } from '../../content/expedition';
import { createIncidentItems } from '../../content/expedition-incidents';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
export interface IncidentView { name: string; view: V3; yaw: number; pitch: number }
export function createIncidentSites(level: ExpeditionLevel, m: ReferenceMaterials) {
  const root = new Group(); root.name = `incidents.${level.id}`;
  const colliders: Box3[] = [], views: IncidentView[] = [];
  const geometry = new Set<BufferGeometry>();
  const suit = m.cloth.clone(); suit.color.set('#414e50'); suit.roughness = .98;
  const scuff = m.rubber.clone(); scuff.color.set('#303b3b'); scuff.roughness = 1;
  const owned = [suit, scuff];
  const items = createIncidentItems(level.index, level.rooms);
  const metadata: { id: string; room: string; state: string; bodyCount: number; colliderStart: number; colliderCount: number; bounds: number[][] }[] = [];
  root.userData.incidents = metadata; root.userData.incidentIds = items.map(i => i.id);
  root.userData.incidentCount = items.length;
  root.userData.bodyCount = 2;
  let room: ExpeditionRoom, ox = 0, oz = 0, sign = 1;
  let batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  let ownId = '';
  let floorTrail = false;
  function add(g: BufferGeometry, p: V3, mat: MeshStandardMaterial, scale: V3 = [1, 1, 1], rotation: V3 = [0, 0, 0]) {
    g.applyMatrix4(new Matrix4().compose(new Vector3(ox + p[0] * sign, p[1], oz + p[2]), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale)));
    g.computeBoundingBox(); const b = g.boundingBox!;
    // Decorative debris obeys the same navigation bounds as solid equipment.
    const invalid = b.min.x < room.x - room.width / 2 + .08 || b.max.x > room.x + room.width / 2 - .08
      || b.min.z < room.z - room.depth / 2 + .08 || b.max.z > room.z + room.depth / 2 - .08
      || b.min.y < -2.015 || b.max.y > (room.ceiling ?? 4) - .08
      || (!(floorTrail && b.max.y < -1.7) && ((b.min.x < room.x + 1.6 && b.max.x > room.x - 1.6) || (b.min.z < room.z + 1.6 && b.max.z > room.z - 1.6)));
    const blocksItem = [...level.items, ...items].some(i => {
      if (i.room !== room.id || (i.id === ownId && b.max.y < -.5)) return false;
      const x = room.x + i.x, z = room.z + i.z;
      const dx = Math.max(b.min.x - x, 0, x - b.max.x), dz = Math.max(b.min.z - z, 0, z - b.max.z);
      return dx * dx + dz * dz < 1.2 ** 2;
    });
    if (invalid || blocksItem) { g.dispose(); return; }
    colliders.push(b.clone());
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose(); flat.clearGroups();
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    const list = batches.get(mat) ?? []; list.push(flat); batches.set(mat, list);
  }
  const box = (p: V3, size: V3, mat = m.steel, rotation: V3 = [0, 0, 0]) => add(new RoundedBoxGeometry(...size, 2, Math.min(.07, ...size.map(v => v * .22))), p, mat, [1, 1, 1], rotation);
  const oval = (p: V3, size: V3, mat = suit, rotation: V3 = [0, 0, 0]) => add(new SphereGeometry(1, 16, 12), p, mat, size, rotation);
  function hose(points: V3[], radius = .035, mat = m.rubber) {
    // Transform before add; collider bounds are short segments rather than one empty envelope.
    const curve = new CatmullRomCurve3(points.map(p => new Vector3(...p)));
    for (let i = 0; i < 12; i++) {
      const sub = new CatmullRomCurve3([curve.getPoint(i / 12), curve.getPoint((i + .5) / 12), curve.getPoint((i + 1) / 12)]);
      add(new TubeGeometry(sub, 4, radius, 6, false), [0, 0, 0], mat);
    }
  }
  function ring(p: V3, radius: number, mat = m.steel, rotation: V3 = [Math.PI / 2, 0, 0]) {
    add(new TorusGeometry(radius, .025, 6, 24), p, mat, [1, 1, 1], rotation);
  }
  function body(sector: number) {
    // Broad padded anatomical masses, bent limbs and sealed opaque helmet; no exposed skin.
    oval([0, -1.64, -.1], [.36, .26, .55]);
    oval([.02, -1.70, .43], [.31, .22, .28]);
    box([0, -1.45, -.12], [.46, .14, .62], scuff, [.06, .08, .08]);
    box([-.20, -1.33, -.12], [.065, .045, .58], m.yellow, [0, 0, -.1]);
    box([.20, -1.33, -.12], [.065, .045, .58], scuff);
    oval([.02, -1.57, -.88], [.29, .29, .30], m.steel);
    oval([.02, -1.43, -1.02], [.22, .16, .20], m.rubber, [-.3, 0, 0]);
    ring([.02, -1.56, -.65], .20, m.steel, [0, 0, 0]);
    for (const side of [-1, 1]) {
      const bend = side > 0 ? .12 + sector * .025 : -.07;
      oval([side * .43, -1.70, -.24], [.17, .18, .33], suit, [0, side * .38, 0]);
      oval([side * .51, -1.74, .16 + bend], [.14, .14, .28], suit, [0, -side * .5, 0]);
      oval([side * .39, -1.76, .37 + bend], [.115, .11, .17], m.rubber);
      oval([side * .20, -1.72, .75], [.18, .18, .34], suit, [0, side * .16, 0]);
      oval([side * .24, -1.74, 1.08], [.15, .15, .24], scuff);
      box([side * .24, -1.73, 1.20], [.27, .30, .31], m.rubber, [0, side * .16, 0]);
      // Irregular curved fold rolls at elbow, knee and waist, not flat stick limbs.
      for (let n = 0; n < 3; n++) {
        oval([side * (.19 + n * .015), -1.57 - n * .015, .60 + n * .14], [.16, .035, .055], suit, [0, side * (.17 + n * .09), .08]);
        oval([side * .44, -1.57, -.35 + n * .11], [.12, .025, .035], suit, [0, side * .3, 0]);
      }
    }
    hose([[.22, -1.53, -.85], [.65, -1.84, -.72], [.90, -1.91, -.1], [1.2, -1.90, .55]], .042);
  }
  function coveredBody() {
    // An asymmetric sagging insulation blanket; helmet and one boot remain exposed.
    const g = new SphereGeometry(1, 24, 16);
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
      const fold = .035 * Math.sin(z * 15 + x * 4) + .018 * Math.sin(z * 27 - x * 9);
      a.setXYZ(i, x * (.43 + .05 * z), -1.59 + y * .25 + fold * Math.max(y, 0), .29 + z * .87);
    }
    a.needsUpdate = true; g.computeVertexNormals(); add(g, [0, 0, 0], m.cloth);
    box([.13, -1.34, .47], [.065, .035, 1.05], scuff, [0, .16, 0]);
  }
  function abandonedGear(emptyHarness: boolean) {
    if (emptyHarness) {
      hose([[-.29, -1.91, -.48], [-.37, -1.88, .12], [-.2, -1.89, .50], [.19, -1.90, .44]], .055, suit);
      hose([[.29, -1.91, -.48], [.34, -1.88, .12], [.48, -1.91, .43]], .055, suit);
      box([-.02, -1.87, -.4], [.54, .045, .10], scuff);
      box([.22, -1.86, .43], [.12, .06, .14], m.steel);
      hose([[.37, -1.91, .4], [.75, -1.92, .66], [1.03, -1.91, .52]], .04, m.yellow);
      for (let k = 0; k < 4; k++) hose([[1.03, -1.91, .52], [1.10 + k * .018, -1.93, .46 + k * .035]], .008, suit);
    } else {
      box([0, -1.76, .37], [.7, .36, .58], suit, [0, -.13, 0]);
      box([0, -1.55, .37], [.52, .035, .41], m.rubber);
      box([-.45, -1.91, .43], [.22, .055, .60], suit, [0, -.2, 0]);
      for (const x of [-.24, .24]) add(new CylinderGeometry(.13, .13, .65, 16), [x, -1.79, -.48], m.steel, [1, 1, 1], [Math.PI / 2, 0, 0]);
      hose([[.25, -1.80, -.74], [.7, -1.91, -.9], [.65, -1.92, -.30]], .04);
      oval([.65, -1.85, .38], [.12, .10, .19], m.rubber);
    }
    // Supports the detached recorder at the same height as the casualty harness.
    box([0, -1.54, 0], [.28, .46, .24], scuff);
  }
  function cause(theme: number, sector: number) {
    const outer = Math.min(room.width / 2 - 3 - .3, 2.5);
    hose([[.35, -1.91, .45], [.85, -1.93, .75], [outer, -1.93, .20], [outer, -1.2, -.8]], .023, m.yellow);
    box([outer, -1.45, -.8], [.18, .92, .18], m.steel);
    ring([outer, -1.15, -.8], .16, m.yellow, [0, Math.PI / 2, 0]);
    // Open equipment bag, flap and scattered tools establish an interrupted operation.
    box([1.0, -1.86, -.83], [.50, .20, .52], scuff);
    box([1.0, -1.735, -.83], [.39, .035, .41], m.rubber);
    box([1.0, -1.82, -1.18], [.49, .05, .28], suit, [-.35, 0, .1]);
    for (let k = 0; k < 3; k++) box([1.12 + k * .18, -1.94, .02 + k * .16], [.065, .05, .32], m.steel, [0, k * .73 + sector * .2, 0]);
    switch (theme) {
      case 0: // bent sieve and broken drag sling
        for (let k = 0; k < 5; k++) box([outer - .25, -1.55 + k * .17, .7], [.62, .06, .62], m.steel, [.20, .13, -.23]);
        hose([[.1, -1.94, .9], [.65, -1.94, 1.10], [outer, -1.92, 1.8]], .04, suit); break;
      case 1:
        hose([[outer, -1.18, -.8], [outer, -.9, -1.4], [outer - .5, -.8, -1.6]], .11, m.steel);
        ring([outer - .3, -1.91, .9], .28); break;
      case 2:
        for (let k = 0; k < 3; k++) box([outer - .15, -1.60 + k * .15, .85], [.65, .07, .95], suit, [.14, .2, -.12]);
        for (let k = 0; k < 4; k++) oval([outer - .28 + k * .12, -1.89, -.25], [.1, .10 + k * .04, .15], scuff); break;
      case 3: // stretcher overturned onto its side, with a bowed fabric bed
        for (const z of [-.4, 1.5]) hose([[outer - .35, -1.86, z], [outer - .35, -.85, z], [outer + .12, -.85, z]], .04, m.steel);
        box([outer - .35, -1.37, .55], [.06, .88, 1.86], suit, [0, 0, .10]); break;
      case 4:
        box([outer - .1, -1.62, .65], [.7, .60, .08], m.yellow, [.4, .5, .3]);
        for (let k = 0; k < 4; k++) hose([[outer, -1.82, -.1], [outer - .2, -1.90, .4 + k * .12], [outer - .6, -1.92, .7 + k * .1]], .022); break;
      case 5:
        add(new CylinderGeometry(.34, .25, .24, 20), [outer - .1, -1.75, .7], m.rubber, [1, 1, 1], [.6, 0, .3]);
        ring([outer - .1, -1.59, .7], .27, m.steel); break;
      case 6:
        ring([outer - .2, -1.90, .6], .42, m.hull);
        box([outer - .2, -1.89, -.1], [.55, .12, .25], m.hull, [0, .3, 0]); break;
    }
  }
  for (const item of items) {
    room = level.rooms.find(r => r.id === item.room)!; ownId = item.id;
    ox = room.x + item.x; oz = room.z + item.z; sign = item.x > 0 ? 1 : -1;
    batches = new Map(); const start = colliders.length;
    if (item.kind === 'record') {
      if (room.sector === 0 || room.sector === 2) {
        body(room.sector); if (room.sector === 2) coveredBody();
        cause(level.index, room.sector);
      } else abandonedGear(room.sector === 3);
      // Top face exactly y=-1.20, centred beneath the main runtime target.
      box([0, -1.25, 0], [.18, .10, .22], m.steel);
      box([0, -1.195, -.035], [.10, .012, .07], m.rubber);
      floorTrail = true;
      hose([[-2.1, -1.94, 2.0], [-1.7, -1.94, 1.55], [-1.4, -1.94, 1.3], [-.95, -1.94, .85], [-.6, -1.94, .6]], .04, room.sector === 3 ? suit : m.yellow);
      floorTrail = false;
    }
    else {
      // Recoverable object stays directly under the runtime interaction target.
      box([0, -1.80, 0], [.46, .28, .55], scuff, [0, .16 * room.sector, 0]);
      ring([0, -1.61, 0], .16, level.index === 6 ? m.hull : m.yellow);
      box([.32, -1.94, -.25], [.24, .06, .40], suit, [0, -.5, 0]);
      hose([[.12, -1.90, .1], [.45, -1.92, .5], [.8, -1.93, .4]], .025);
    }
    const group = new Group(); group.name = item.id; root.add(group);
    for (const [material, parts] of batches) {
      const merged = mergeGeometries(parts, false); parts.forEach(g => g.dispose());
      if (!merged) throw new Error(`Incident batch failed: ${item.id}`);
      geometry.add(merged); const mesh = new Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    const bounds = new Box3().setFromObject(group);
    metadata.push({ id: item.id, room: room.id, state: item.kind !== 'record' ? 'recovery' : ['casualty', 'abandoned-rescue', 'covered-casualty', 'empty-harness'][room.sector],
      bodyCount: item.kind === 'record' && room.sector % 2 === 0 ? 1 : 0,
      colliderStart: start, colliderCount: colliders.length - start, bounds: [bounds.min.toArray(), bounds.max.toArray()] });
    if (item.kind === 'record' && room.sector < 2) {
      const view: V3 = [room.x + .4, .05, room.z - .5];
      const direction = new Vector3(ox, -1.45, oz).sub(new Vector3(...view));
      views.push({ name: `${item.name} · ${room.sector + 1}`, view, yaw: Math.atan2(-direction.x, -direction.z), pitch: Math.atan2(direction.y, Math.hypot(direction.x, direction.z)) });
    }
  }
  let disposed = false;
  return { root, colliders, views, update(_time: number) {}, dispose() {
    if (disposed) return; disposed = true;
    geometry.forEach(g => g.dispose()); geometry.clear(); owned.forEach(m => m.dispose()); root.clear();
  } };
}
