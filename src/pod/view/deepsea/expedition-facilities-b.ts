import {
  Box3, BoxGeometry, BufferGeometry, CatmullRomCurve3, CurvePath, CylinderGeometry, LineCurve3,
  Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion,
  TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionRoom } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
type Rect = { x0: number; x1: number; z0: number; z1: number };
export interface FacilitiesB {
  root: Group;
  colliders: Box3[];
  views: Array<{ name: string; view: V3; yaw: number; pitch: number }>;
  update(time: number): void;
  dispose(): void;
}
const FLOOR = -2, CROSS = 2.15;
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Facilities for indices 4–6. Geometry/colliders/views are world-space: add root at identity.
 * No DOM, gameplay mutation, lights, external assets, or shared-material ownership.
 * Four room-scaled bays flank the central cross; connected ducts bridge it only above 3.15m.
 * Item exclusion pads the known item half-width by 2m. Subdivision reserves whole assemblies,
 * not individual parts, so exclusion cannot leave floating shelves or severed equipment.
 */
export function createFacilitiesB(level: ExpeditionLevel, m: ReferenceMaterials): FacilitiesB {
  const root = new Group(); root.name = `facilities-b.${level.id}`;
  const colliders: Box3[] = [], views: FacilitiesB['views'] = [];
  const geometries = new Set<BufferGeometry>(), owned: MeshStandardMaterial[] = [];
  const rotors: Group[] = [];
  const budgets: Array<{ room: string; coverage: number; bays: number }> = [];
  if (level.index < 4 || level.index > 6) return { root, colliders, views, update() {}, dispose() { root.removeFromParent(); } };
  function finish(color: string, roughness: number, metalness: number, emission?: string) {
    const mat = new MeshStandardMaterial({ color, roughness, metalness });
    if (emission) { mat.emissive.set(emission); mat.emissiveIntensity = .22; }
    owned.push(mat); return mat;
  }
  const paint = finish('#536664', .83, .22), clean = finish('#b7c3b6', .62, .18);
  const rough = finish('#574d3b', .95, .15), dark = finish('#050d13', .88, 0);
  const screen = finish('#305658', .75, .05, '#376d71');
  const mark = finish('#c2b378', .89, .06);
  const exclusion = level.items.map(item => {
    const room = level.rooms.find(r => r.id === item.room);
    if (!room) throw new Error(`Facilities: unknown item room ${item.id}`);
    return { x0: room.x + item.x - 3.2, x1: room.x + item.x + 3.2,
      z0: room.z + item.z - 3.2, z1: room.z + item.z + 3.2 };
  });
  let room: ExpeditionRoom, batch = new Map<MeshStandardMaterial, BufferGeometry[]>();
  let parent: Group, transform = new Matrix4(), bay: Rect | undefined;
  let ceiling = 4;
  const matrix = (p: V3, rotation: V3 = [0, 0, 0]) => new Matrix4().compose(new Vector3(...p),
    new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1));
  function add(g: BufferGeometry, mat: MeshStandardMaterial, p: V3, rotation: V3 = [0, 0, 0], solid = true) {
    g.applyMatrix4(transform.clone().multiply(matrix(p, rotation))); g.computeBoundingBox();
    const b = g.boundingBox!;
    const horizontal = { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z };
    const safe = b.min.y >= FLOOR - .001 && b.max.y <= ceiling + .001
      && b.min.x >= room.x - room.width / 2 && b.max.x <= room.x + room.width / 2
      && b.min.z >= room.z - room.depth / 2 && b.max.z <= room.z + room.depth / 2
      && !exclusion.some(r => overlaps(horizontal, r))
      && (b.min.y > 3.15 || (Math.min(Math.abs(b.min.x - room.x), Math.abs(b.max.x - room.x)) >= 2
        && !(b.min.x < room.x && b.max.x > room.x)
        && Math.min(Math.abs(b.min.z - room.z), Math.abs(b.max.z - room.z)) >= 2
        && !(b.min.z < room.z && b.max.z > room.z)));
    if (!safe) { g.dispose(); throw new Error(`Unsafe facilities geometry in ${room.id}: ${b.min.toArray()} to ${b.max.toArray()}`); }
    if (bay && (b.min.x < bay.x0 - .001 || b.max.x > bay.x1 + .001 || b.min.z < bay.z0 - .001 || b.max.z > bay.z1 + .001)) {
      g.dispose(); throw new Error(`Facilities escaped assembly reservation in ${room.id}: ${b.min.toArray()} to ${b.max.toArray()}, reservation ${JSON.stringify(bay)}`);
    }
    if (solid) colliders.push(b.clone());
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose(); flat.clearGroups();
    const bucket = batch.get(mat) ?? []; bucket.push(flat); batch.set(mat, bucket);
  }
  const box = (p: V3, s: V3, mat = paint, r: V3 = [0, 0, 0], solid = true) => add(new BoxGeometry(...s), mat, p, r, solid);
  const cylinder = (p: V3, radius: number, height: number, mat = m.steel, r: V3 = [0, 0, 0], solid = true) =>
    add(new CylinderGeometry(radius, radius, height, 16), mat, p, r, solid);
  const ring = (p: V3, radius: number, thickness: number, mat = m.steel, r: V3 = [0, 0, 0]) =>
    add(new TorusGeometry(radius, thickness, 6, 32), mat, p, r, false);
  function pipe(points: V3[], radius: number, mat = m.steel) {
    const vertices = points.map(p => new Vector3(...p));
    // Long room bridges use bounded straight segments: a spline can sag below the
    // 3.15m navigation clearance even when all of its control points are above it.
    const bounded = new CurvePath<Vector3>();
    for (let i = 1; i < vertices.length; i++) bounded.add(new LineCurve3(vertices[i - 1], vertices[i]));
    add(new TubeGeometry(bay ? new CatmullRomCurve3(vertices) : bounded, 24, radius, 6, false), mat, [0, 0, 0]);
  }
  function consoleAt(x: number, z: number, width: number, mat = paint) {
    box([x, -1.34, z], [width * .64, 1.3, .48], mat);
    box([x, -.62, z], [width, .16, .74], mat, [-.18, 0, 0]);
    box([x - width * .18, -.495, z - .10], [width * .46, .035, .36], screen, [-.18, 0, 0], false);
    for (let i = 0; i < 3; i++) cylinder([x + width * .29, -.43, z - .14 + i * .12], .035, .04,
      i === 2 ? m.red : mark, [0, 0, 0], false);
    pipe([[x, -1.92, z], [x, -1.79, z - .38], [x + width * .38, -1.8, z - .42]], .03, m.rubber);
  }
  function rail(x0: number, x1: number, z: number, y = -.40) {
    const count = Math.max(2, Math.ceil((x1 - x0) / 1.6));
    for (let i = 0; i <= count; i++) {
      const x = x0 + (x1 - x0) * i / count;
      cylinder([x, (y - 1.85) / 2, z], .04, y + 1.85, m.yellow);
      box([x, -1.92, z], [.20, .12, .20], m.steel);
    }
    for (const yy of [y, y - .52]) cylinder([(x0 + x1) / 2, yy, z], .035, x1 - x0, m.yellow, [0, 0, Math.PI / 2]);
  }
  function stationFan(x: number, y: number, z: number, radius: number) {
    ring([x, y, z], radius, .07, m.steel);
    for (const ratio of [.40, .70, .96]) ring([x, y, z + .045], radius * ratio, .018, m.steel);
    // Front guard is physical; moving blades cannot reach the player behind it.
    box([x, y, z], [radius * 2, radius * 2, .10], dark, [0, 0, 0], false);
    const rotor = new Group(); rotor.matrixAutoUpdate = false;
    const world = transform.clone().multiply(matrix([x, y, z + .08])); rotor.matrix.copy(world);
    const spinning = new Group(); rotor.add(spinning); parent.add(rotor); rotors.push(spinning);
    const pieces: BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new BoxGeometry(radius * .25, radius * .83, .05);
      g.translate(0, radius * .46, 0); g.rotateZ(i * Math.PI * 2 / 5); pieces.push(g);
    }
    const merged = mergeGeometries(pieces, false)!; pieces.forEach(g => g.dispose()); geometries.add(merged);
    const mesh = new Mesh(merged, rough); mesh.castShadow = true; spinning.add(mesh);
  }

  function power(w: number, d: number, compact: boolean, variant: number) {
    const radius = Math.min(compact ? 1.65 : 3.4, w * .28, (ceiling - 2) * .38), machineZ = -d * .06;
    const axisY = radius - 1.35;
    const length = d * .72;
    // A supported longitudinal generator, repeated along two sides of the room, not a wall medallion.
    box([0, -1.81, machineZ], [w * .70, .34, d * .76], m.steel);
    cylinder([0, axisY, machineZ], radius, length, paint, [Math.PI / 2, 0, 0]);
    for (const z of [machineZ - length * .36, machineZ + length * .36]) {
      box([0, -1.24, z], [radius * 1.8, .88, .38], rough);
      ring([0, axisY, z], radius + .08, .09, m.steel);
    }
    const front = machineZ + length / 2 + .02;
    cylinder([0, axisY, front], radius * .86, .11, dark, [Math.PI / 2, 0, 0]);
    stationFan(0, axisY, front + .08, radius * .83);
    for (let i = 0; i < 5; i++) {
      const z = machineZ - length * .4 + i * length * .2;
      ring([0, axisY, z], radius + .025, .025, m.steel);
    }
    // Raised service deck on the outside, supported down to the floor; the inside aisle remains open.
    const deckX = w * .37, deckW = w * .18;
    box([deckX, -1.64, 0], [deckW, .16, d * .74], m.floor);
    for (const z of [-d * .31, d * .31]) box([deckX, -1.84, z], [deckW * .8, .24, .24], m.steel);
    rail(deckX - deckW * .40, deckX + deckW * .40, -d * .35, -.42);
    for (let i = 0; i < 3; i++) box([deckX, -1.91 + i * .09, d * (.43 - i * .045)], [deckW, .14, d * .055], m.steel);
    consoleAt(-w * .34, d * .32, Math.min(.95, w * .22));
    const ductRadius = Math.min(.38, w * .055);
    pipe([[0, axisY + radius * .70, machineZ - length * .25], [0, axisY + radius + .35, machineZ - length * .25],
      [w * .29, Math.min(ceiling - 1, axisY + radius + .65), -d * .29], [w * .29, ceiling - .70, -d * .29]], ductRadius, paint);
    ring([w * .29, ceiling - .70, -d * .29], ductRadius + .025, .03, mark, [Math.PI / 2, 0, 0]);
    for (const x of [-w * .43, w * .43]) {
      box([x, (ceiling - 2.22) / 2, -d * .32], [.17, ceiling + 1.70, .20], m.steel);
      box([x, -1.89, -d * .32], [.46, .20, .46], rough);
    }
    box([0, ceiling - .34, -d * .32], [w * .88, .24, .32], paint);
    // Tall cooling banks occupy the upper volume and connect to the roof header.
    const bankHeight = Math.max(.6, ceiling - 4.15);
    box([-w * .26, 2.65 + bankHeight / 2, -d * .29], [w * .23, bankHeight, .48], paint);
    for (let i = 0; i < Math.ceil(bankHeight / .38); i++)
      box([-w * .26, 2.75 + i * .34, -d * .29 + .26], [w * .19, .05, .08], m.steel);
    box([-w * .33, .70, -d * .30], [w * .18, 2.6, .42], rough);
    for (let i = 0; i < (compact ? 3 : 6); i++) box([-w * .33, -.26 + i * .30, -d * .075 - .21],
      [w * .14, .055, .04], m.steel);
    pipe([[-w * .33, 2, -d * .30], [-w * .33, 2.66, -d * .24], [w * .29, 2.68, -d * .29]], .045, m.rubber);
    parent.userData.function = `双列动力设施 / 维护组 ${variant + 1}`;
  }

  function observation(w: number, d: number, compact: boolean) {
    // World owns the real hull aperture, glass and exterior structures. This bay is an
    // open instrument station: no backing, fake ocean, side cavity panels or glass collider.
    const front = d * .02;
    const deskZ = d * .32;
    consoleAt(-w * .22, deskZ, Math.min(1.5, w * .35));
    cylinder([-w * .22, -.22, deskZ - .14], .11, .48, m.steel);
    cylinder([-w * .22, .05, deskZ - .12], .17, .50, paint, [Math.PI / 2, 0, 0]);
    ring([-w * .22, .05, deskZ + .14], .16, .025, clean);
    if (!compact) {
      consoleAt(w * .24, deskZ, Math.min(1.2, w * .25));
      box([w * .24, -.18, deskZ - .20], [.58, .60, .16], paint, [-.20, 0, 0]);
      box([w * .24, -.18, deskZ - .102], [.45, .42, .018], screen, [-.20, 0, 0], false);
    }
    rail(-w * .39, w * .39, d * .16, -.55);
    // Side service duct and ceiling fixtures lead the eye along the observation passage.
    box([0, ceiling - .40, d * .05], [w * .84, .28, .40], paint);
    for (const x of [-w * .3, w * .3]) {
      box([x, ceiling - .60, d * .06], [.60, .10, .26], screen);
    }
    for (const x of [-w * .41, w * .41]) {
      box([x, (ceiling - 2.42) / 2, front], [.12, ceiling + 1.50, .18], m.steel);
      box([x, -1.89, front], [.30, .20, .32], clean);
    }
    parent.userData.function = '开放观察仪器台 / 护栏 / 真实舷窗视线';
  }

  function supportBay(w: number, d: number, variant: number, instruments: boolean) {
    // Different jobs occupy the opposite end: switchgear / cooling service, or observation logs.
    const count = instruments ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const x = -w * .32 + i * w * .64 / (count - 1);
      if (instruments || variant < 0) {
        const h = instruments ? 2.5 : Math.min(ceiling - 1, 5.8);
        box([x, -2 + h / 2, -d * .26], [w * .17, h, d * .19], paint);
        box([x, -.1, -d * .16], [w * .125, .70, .07], screen);
        for (let j = 0; j < 5; j++) box([x, -1.32 + j * .18, -d * .16], [w * .13, .045, .065], m.steel);
        box([x, -1.88, -d * .26], [w * .20, .22, d * .23], m.steel);
      } else {
        const radius = Math.min(.65, w * .075), h = Math.min(ceiling - 1.4, 5.5);
        cylinder([x, -1.7 + h / 2, -d * .25], radius, h, paint);
        box([x, -1.86, -d * .25], [radius * 2.4, .28, radius * 2.4], m.steel);
        for (let j = 0; j < 4; j++) ring([x, -1.1 + j * h * .22, -d * .25], radius + .035, .045, m.steel, [Math.PI / 2, 0, 0]);
      }
    }
    box([0, -1.42, d * .19], [w * .76, .12, d * .20], m.floor);
    for (const x of [-w * .32, w * .32]) for (const z of [d * .12, d * .26])
      box([x, -1.73, z], [.15, .49, .15], m.steel);
    rail(-w * .37, w * .37, d * .30, -.25);
    consoleAt(-w * .25, d * .40, Math.min(1.4, w * .23));
    if (instruments) consoleAt(w * .24, d * .40, Math.min(1.1, w * .21));
    // Continuous service uprights support the high manifold; this is not another loose prop.
    for (const x of [-w * .42, w * .42]) {
      box([x, (ceiling - 2.5) / 2, -d * .29], [.18, ceiling + 1.5, .20], m.steel);
      box([x, -1.88, -d * .29], [.45, .23, .45], rough);
    }
    box([0, ceiling - .70, -d * .29], [w * .87, .30, .40], paint);
    pipe([[w * .29, -.9, -d * .25], [w * .29, 1.3, -d * .25],
      [w * .29, ceiling - .70, -d * .29]], .16, instruments ? m.rubber : paint);
  }

  function pressure(w: number, d: number, compact: boolean, phase: number) {
    const mat = phase < 2 ? rough : clean;
    const aperture = w * .72, layers = compact ? 2 : (phase % 2 ? 3 : 2);
    const frameTop = compact ? Math.min(3.05, ceiling - .65) : ceiling - 1.15;
    const frameHeight = frameTop + 1.92, frameY = (frameTop - 1.92) / 2;
    // Offset nested rectangular pressure frames replace another circular wall trophy.
    for (let layer = 0; layer < layers; layer++) {
      const z = -d * .30 + layer * d * .27;
      const offset = (layer % 2 ? 1 : -1) * w * .075;
      const shrink = 1 - layer * .08, width = aperture * shrink;
      const frameMat = layer === layers - 1 ? clean : mat;
      for (const x of [offset - width / 2, offset + width / 2]) {
        box([x, frameY, z], [.38, frameHeight, .52], frameMat);
        box([x, -1.89, z], [Math.min(.63, w * .10), .20, .66], m.steel);
        for (let i = 0; i < 4; i++) {
          box([x + (x < offset ? .18 : -.18), -.95 + i * .85, z + .23], [.27, .14, .15], m.steel);
          cylinder([x, -.95 + i * .85, z + .20], .048, .08, mark, [Math.PI / 2, 0, 0], false);
        }
      }
      box([offset, frameTop, z], [width + .38, .32, .54], frameMat);
      box([offset, -1.91, z], [width + .3, .16, .38], frameMat);
      // Offset half-open leaf attached to its guide, not a floating plate or blocked centre cross.
      box([offset + width * .27, frameY, z - .12], [width * .38, frameHeight - .35, .22], frameMat);
      box([offset + width * .27, frameY, z + .002], [width * .27, frameHeight - .65, .035], layer ? paint : m.rubber);
      cylinder([offset - width * .22, frameTop + .20, z], .085, width * .62, m.steel, [0, 0, Math.PI / 2]);
    }
    for (const x of [-w * .37, w * .37]) {
      box([x, -1.87, 0], [.12, .23, d * .84], phase > 1 ? clean : m.steel);
      for (let i = 0; i < 6; i++) box([x, -1.96, -d * .35 + i * d * .14], [.36, .07, .24], mat);
      cylinder([x, ceiling - .40, 0], .12, d * .85, clean, [Math.PI / 2, 0, 0]);
      for (const z of [-d * .32, d * .32]) {
        box([x, (ceiling - 2.4) / 2, z], [.15, ceiling + 1.6, .20], m.steel);
        box([x, -1.90, z], [.40, .19, .42], mat);
      }
    }
    consoleAt(-w * .35, d * .37, Math.min(.76, w * .14), mat);
    parent.userData.function = phase < 2 ? '粗糙入口 / 偏轴承压框 / 导轨' : '洁净核心 / 层叠承压框 / 无泥导轨';
  }

  // Split a bay around item reservations, retaining the largest usable rectangle.
  function reserve(candidate: Rect, minimum = 2.8): Rect | undefined {
    let pieces = [candidate];
    for (const item of exclusion) {
      const next: Rect[] = [];
      for (const p of pieces) {
        if (!overlaps(p, item)) { next.push(p); continue; }
        for (const q of [
          { ...p, x1: Math.min(p.x1, item.x0 - .02) }, { ...p, x0: Math.max(p.x0, item.x1 + .02) },
          { ...p, z1: Math.min(p.z1, item.z0 - .02) }, { ...p, z0: Math.max(p.z0, item.z1 + .02) },
        ]) if (q.x1 - q.x0 >= minimum && q.z1 - q.z0 >= minimum) next.push(q);
      }
      pieces = next.sort((a, b) => area(b) - area(a)).slice(0, 16);
    }
    return pieces.sort((a, b) => area(b) - area(a))[0];
  }
  function flush() {
    for (const [material, pieces] of batch) {
      const g = mergeGeometries(pieces, false); pieces.forEach(p => p.dispose());
      if (!g) throw new Error('Facilities merge failed');
      geometries.add(g); g.computeBoundingBox(); g.computeBoundingSphere();
      const mesh = new Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = 'facility.static'; parent.add(mesh);
    }
    batch.clear();
  }
  try {
    for (const r of level.rooms) {
      const hall = r.role === 'hall';
      const entry = r.id === level.startRoom || r.role === 'entry' || /\.r0$/.test(r.id);
      if (!hall && !entry) continue;
      room = r; ceiling = r.ceiling ?? 4; parent = new Group(); parent.name = `facilities.${r.id}`; root.add(parent);
      const availableW = r.width / 2 - CROSS - .65, availableD = r.depth / 2 - CROSS - .65;
      const minimum = hall ? 2.8 : 1.8;
      if (availableW < minimum || availableD < minimum) { budgets.push({ room: r.id, coverage: 0, bays: 0 }); continue; }
      const width = availableW * (hall ? .90 : .94), depth = availableD * (hall ? .90 : .94);
      let covered = 0, count = 0;
      const chosen: Rect[] = [];
      const longX = level.index === 4 && r.width > r.depth;
      const ductNodes: Array<{ point: Vector3; bank: number; side: number }> = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (!hall && sz > 0) continue;
        const cx = r.x + sx * (CROSS + .25 + availableW / 2), cz = r.z + sz * (CROSS + .25 + availableD / 2);
        const selected = reserve({ x0: cx - width / 2, x1: cx + width / 2, z0: cz - depth / 2, z1: cz + depth / 2 }, minimum);
        if (!selected || selected.x1 - selected.x0 < minimum || selected.z1 - selected.z0 < minimum) continue;
        bay = selected;
        transform = matrix([(selected.x0 + selected.x1) / 2, 0, (selected.z0 + selected.z1) / 2],
          [0, longX ? (sx < 0 ? Math.PI / 2 : -Math.PI / 2) : (sz > 0 ? Math.PI : 0), 0]);
        const actualW = longX ? selected.z1 - selected.z0 : selected.x1 - selected.x0;
        const actualD = longX ? selected.x1 - selected.x0 : selected.z1 - selected.z0;
        // Fixed-size feet, instrument heads and flanges need a minimum authoring envelope.
        // Compress the complete assembly horizontally into small entrances, preserving all
        // joins/supports, real vertical height, and the original reservation/cross/item bounds.
        const w = Math.max(4.2, actualW), d = Math.max(4.2, actualD);
        transform.scale(new Vector3(actualW / w, 1, actualD / d));
        if (level.index === 4) {
          if (hall && (longX ? sx : sz) > 0) supportBay(w, d, longX ? sz : sx, false);
          else power(w, d, !hall, count);
        } else if (level.index === 5) {
          if (hall && sz > 0) supportBay(w, d, sx, true);
          else observation(w, d, !hall);
        } else pressure(w, d, !hall, entry ? 0 : r.sector + count);
        if (level.index === 4) ductNodes.push({ point: new Vector3(w * .29, ceiling - .70, -d * .29).applyMatrix4(transform),
          bank: longX ? sx : sz, side: longX ? sz : sx });
        covered += area(selected); count++; chosen.push(selected);
      }
      // Room-wide header makes the banks parts of a facility. Its full volume stays above 3.15.
      bay = undefined; transform.identity();
      if (hall && level.index === 5) {
        // Open service lintel connects the posts above the navigation crossing.
        // No recess backing: the real hull window and outside ocean remain visible.
        const windows = chosen.filter(b => (b.z0 + b.z1) / 2 < r.z);
        if (windows.length === 2) {
          const x0 = Math.min(...windows.map(b => b.x0)) + .12;
          const x1 = Math.max(...windows.map(b => b.x1)) - .12;
          const z = (windows[0].z0 + windows[0].z1) / 2 + (windows[0].z1 - windows[0].z0) * .02;
          const rect = { x0, x1, z0: z - .30, z1: z + .30 };
          if (!exclusion.some(e => overlaps(rect, e))) {
            box([(x0+x1)/2, 3.42, z], [x1-x0, .34, .56], clean);
            for (const b of windows) for (const x of [b.x0+.22,b.x1-.22])
              box([x, 1.88, z], [.14, 3.1, .18], paint);
          }
        }
      }
      if (level.index === 4 && chosen.length >= 2) {
        for (const axis of ['bank', 'side'] as const) for (const sign of [-1, 1]) {
          const row = ductNodes.filter(n => n[axis] === sign);
          if (row.length !== 2) continue;
          const a = row[0].point, b = row[1].point;
          const footprint = { x0: Math.min(a.x, b.x) - .30, x1: Math.max(a.x, b.x) + .30,
            z0: Math.min(a.z, b.z) - .30, z1: Math.max(a.z, b.z) + .30 };
          if (exclusion.some(e => overlaps(footprint, e))) continue;
          const middle: V3 = [(a.x + b.x) / 2, ceiling - .70, (a.z + b.z) / 2];
          pipe([a.toArray() as V3, middle, b.toArray() as V3], .28, paint);
          if (axis === 'bank' && hall) {
            // A lower cross-duct is visibly connected to the roof loop at both ends.
            const y = Math.max(3.60, ceiling * .58);
            pipe([a.toArray() as V3, [a.x, y, a.z], [b.x, y, b.z], b.toArray() as V3], .26, paint);
          }
        }
      }
      flush(); budgets.push({ room: r.id, coverage: covered / (r.width * r.depth), bays: count });
      if (chosen.length) {
        const target = chosen[0];
        const candidates: V3[] = level.index === 4 && hall
          ? [longX ? [r.x + r.width * .25, .55, r.z] : [r.x, .55, r.z + r.depth * .25], [r.x, .55, r.z]]
          : [[r.x, .25, r.z + Math.min(r.depth * .25, 5)], [r.x, .25, r.z],
          [r.x, .25, r.z - Math.min(r.depth * .25, 5)]];
        const view = candidates.find(p => !exclusion.some(e => p[0] > e.x0 - .4 && p[0] < e.x1 + .4
          && p[2] > e.z0 - .4 && p[2] < e.z1 + .4));
        if (!view) continue;
        const look = level.index === 4 && hall
          ? new Vector3(r.x - r.width * (longX ? .27 : .08), Math.min(2.8, ceiling * .25), r.z - r.depth * (longX ? .08 : .27))
          : new Vector3((target.x0 + target.x1) / 2, .4, (target.z0 + target.z1) / 2);
        const d = look.sub(new Vector3(...view));
        views.push({ name: `${r.name} · ${['双列动力设施', '黑水观察通道', '层叠承压气闸'][level.index - 4]}`,
          view, yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
        if (r.id === level.startRoom) {
          const edge = level.edges.find(e => e.from === r.id || e.to === r.id);
          const next = edge && level.rooms.find(other => other.id === (edge.from === r.id ? edge.to : edge.from));
          if (next) {
            const dx = Math.sign(next.x - r.x), dz = Math.sign(next.z - r.z);
            const opening = new Vector3(r.x + dx * r.width / 2, .4, r.z + dz * r.depth / 2);
            const start: V3 = [r.x - dx * r.width * .30, .35, r.z - dz * r.depth * .30];
            if (!exclusion.some(e => start[0] > e.x0 - .4 && start[0] < e.x1 + .4 && start[2] > e.z0 - .4 && start[2] < e.z1 + .4)) {
              const nearest = chosen.slice().sort((a,b) => Math.hypot((a.x0+a.x1)/2-opening.x,(a.z0+a.z1)/2-opening.z)
                - Math.hypot((b.x0+b.x1)/2-opening.x,(b.z0+b.z1)/2-opening.z))[0];
              opening.lerp(new Vector3((nearest.x0+nearest.x1)/2, 1.1, (nearest.z0+nearest.z1)/2), .26);
              const delta = opening.sub(new Vector3(...start));
              root.userData.entryView = { name: `${r.name} · 出口与主题设施`, view: start,
                yaw: Math.atan2(-delta.x, -delta.z), pitch: Math.atan2(delta.y, Math.hypot(delta.x,delta.z)) };
            }
          }
        }
      }
    }
  } catch (error) {
    for (const pieces of batch.values()) pieces.forEach(g => g.dispose());
    geometries.forEach(g => g.dispose()); owned.forEach(mat => mat.dispose()); root.clear(); throw error;
  }
  root.userData.facilityCoverage = budgets;
  let disposed = false;
  return { root, colliders, views,
    update(time) { if (!disposed && Number.isFinite(time)) rotors.forEach((r, i) => { r.rotation.z = time * (.45 + (i % 3) * .07); }); },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear(); rotors.length = 0;
      geometries.forEach(g => g.dispose()); geometries.clear(); owned.forEach(mat => mat.dispose());
    },
  };
}
