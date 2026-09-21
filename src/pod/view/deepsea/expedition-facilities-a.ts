import {
  Box3, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Euler,
  ExtrudeGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry,
  Quaternion, Shape, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { expeditionDoorPosition, type ExpeditionLevel, type ExpeditionRoom } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
export interface FacilityView { name: string; view: V3; yaw: number; pitch: number }
export interface FacilitiesA {
  root: Group; colliders: Box3[]; views: FacilityView[];
  update(time: number): void; dispose(): void;
}
type Footprint = { room: string; name: string; min: V3; max: V3; colliderStart: number; colliderCount: number };
const TITLES = ['矿筛转运大厅', '泵罐汇流大厅', '热交换采样大厅', '生活配给大厅'];

/** Room-local distributed working spaces for expedition indices 0–3.
 * No lights, gameplay, topology edits, or shared-material disposal.
 * root.userData.facilities contains conservative work-area reservations and
 * collider ranges; root.userData.coverage records accepted floor-area ratios.
 */
export function createFacilitiesA(level: ExpeditionLevel, m: ReferenceMaterials): FacilitiesA {
  const root = new Group(); root.name = `facilities-a.${level.id}`;
  const colliders: Box3[] = [], views: FacilityView[] = [];
  const ownedGeometry = new Set<BufferGeometry>();
  const ownedMaterials: MeshStandardMaterial[] = [];
  const footprints: Footprint[] = [];
  const coverage: { room: string; fraction: number; workAreas: number }[] = [];
  root.userData.facilities = footprints; root.userData.coverage = coverage;
  let batch = new Map<MeshStandardMaterial, BufferGeometry[]>();
  let transform = new Matrix4(), room: ExpeditionRoom, parent = root;
  let disposed = false;
  const fabric = m.cloth.clone(); fabric.side = DoubleSide; fabric.roughness = 1; fabric.color.multiplyScalar(.72);
  ownedMaterials.push(fabric);
  const stone = m.floor.clone(); stone.color.set('#46504b'); stone.roughness = 1; ownedMaterials.push(stone);
  const reservations = level.items.map(item => {
    const r = level.rooms.find(r => r.id === item.room)!;
    return new Box3(new Vector3(r.x + item.x - 2, -2, r.z + item.z - 2), new Vector3(r.x + item.x + 2, 4, r.z + item.z + 2));
  });
  reservations.push(new Box3(new Vector3(level.spawn[0] - 2, -2, level.spawn[1] - 2), new Vector3(level.spawn[0] + 2, 4, level.spawn[1] + 2)));
  const doorBounds = level.edges.map(edge => {
    const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
    const alongX = Math.abs(a.x - b.x) > Math.abs(a.z - b.z);
    const [doorX, doorZ] = expeditionDoorPosition(a, b);
    return new Box3().setFromCenterAndSize(new Vector3(doorX, .6, doorZ),
      new Vector3(alongX ? .24 : edge.width, 5.2, alongX ? edge.width : .24)).expandByScalar(.40);
  });
  const compose = (p: V3, r: V3 = [0, 0, 0]) => new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), new Vector3(1, 1, 1));
  const ceiling = () => room.ceiling ?? 4;
  function storeCollider(b: Box3) {
    const eps = .015;
    if (b.min.y < -2 - eps || b.max.y > ceiling() + eps || b.min.x < room.x - room.width / 2 - eps || b.max.x > room.x + room.width / 2 + eps
      || b.min.z < room.z - room.depth / 2 - eps || b.max.z > room.z + room.depth / 2 + eps) throw new Error(`Facility outside room bounds: ${room.id}`);
    if (b.min.y < 3.15 && ((b.min.x < room.x + 2 && b.max.x > room.x - 2) || (b.min.z < room.z + 2 && b.max.z > room.z - 2))) {
      throw new Error(`Facility blocks centre cross: ${room.id}`);
    }
    if (reservations.some(r => r.intersectsBox(b))) throw new Error(`Facility blocks item approach: ${room.id}`);
    colliders.push(b);
  }
  function add(g: BufferGeometry, material: MeshStandardMaterial, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], solid = true) {
    g.applyMatrix4(transform.clone().multiply(compose(p, r)));
    if (solid) { g.computeBoundingBox(); storeCollider(g.boundingBox!.clone()); }
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose(); flat.clearGroups();
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    const parts = batch.get(material) ?? []; parts.push(flat); batch.set(material, parts);
  }
  function box(p: V3, size: V3, mat = m.steel, r: V3 = [0, 0, 0], solid = true) {
    add(new RoundedBoxGeometry(...size, 1, Math.min(.045, ...size.map(v => v * .35))), mat, p, r, solid);
  }
  function cyl(p: V3, radius: number, height: number, mat = m.steel, r: V3 = [0, 0, 0], solid = true, top = radius) {
    add(new CylinderGeometry(top, radius, height, 16), mat, p, r, solid);
  }
  function pipe(points: V3[], radius: number, mat = m.steel, solid = true) {
    const curve = new CatmullRomCurve3(points.map(p => new Vector3(...p)));
    const n = Math.min(120, Math.max(16, points.length * 5));
    if (solid) {
      const samples = curve.getPoints(n);
      // Bound short curved runs together, retaining every sampled point. Straight
      // services need one box; coiled exchangers retain twelve local arc bounds.
      const axis = samples[samples.length - 1].clone().sub(samples[0]).normalize();
      const straight = samples.every(p => p.clone().sub(samples[0]).cross(axis).length() < .001);
      const stride = straight ? n : Math.ceil(n / 12);
      for (let i = 0; i < n; i += stride) storeCollider(new Box3().setFromPoints(samples.slice(i, Math.min(n, i + stride) + 1)).expandByScalar(radius + .009).applyMatrix4(transform));
    }
    add(new TubeGeometry(curve, n, radius, 7, false), mat, [0, 0, 0], [0, 0, 0], false);
  }
  function ring(p: V3, radius: number, thickness: number, mat = m.steel, r: V3 = [0, 0, 0]) {
    // These rings are tank collars or small spoked handwheels, never a walk-through
    // portal: their centre is occupied by a tank/stem, so one tight AABB suffices.
    add(new TorusGeometry(radius, thickness, 6, 28), mat, p, r, true);
  }
  function fasteners(p: V3, w: number, h: number) {
    for (const dx of [-w / 2, w / 2]) for (const dy of [-h / 2, h / 2]) cyl([p[0] + dx, p[1] + dy, p[2]], .027, .04, m.steel, [Math.PI / 2, 0, 0], false);
  }
  function wheel(p: V3, radius: number) {
    ring(p, radius, .04, m.yellow);
    cyl([p[0], p[1], p[2] - .13], .08, .30, m.steel, [Math.PI / 2, 0, 0]);
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) box(p, [radius * 1.8, .035, .04], m.steel, [0, 0, a], false);
  }
  function panel(p: V3, width = .65) {
    box(p, [width, .48, .12], m.hull);
    box([p[0], p[1] + .035, p[2] + .07], [width * .78, .28, .025], m.rubber, [0, 0, 0], false);
    for (let i = 0; i < 3; i++) cyl([p[0] - width * .23 + i * width * .23, p[1] - .17, p[2] + .085], .026, .025, i === 0 ? m.red : m.yellow, [Math.PI / 2, 0, 0], false);
    fasteners([p[0], p[1], p[2] + .085], width * .88, .39);
  }
  function drape(p: V3, width: number, height: number, seed: number) {
    const g = new PlaneGeometry(width, height, 18, 24), v = g.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const u = v.getX(i) / width + .5, t = .5 - v.getY(i) / height;
      v.setXYZ(i, v.getX(i) + .025 * Math.sin(t * 6 + seed), v.getY(i) - .10 * Math.sin(u * Math.PI) + .035 * Math.sin(u * 8 + seed) * t ** 5,
        .04 * Math.sin(u * 17 + t * 4) * t + .07 * Math.sin(t * 8 - u * 5) * Math.sin(u * Math.PI));
    }
    g.computeVertexNormals(); add(g, fabric, p, [0, 0, 0], false);
  }
  function base(w: number, d: number) {
    box([0, -1.95, 0], [w - .1, .10, d - .1], m.floor);
    // Inset edge strips make platform/work-area dimensions visible at player height.
    for (const z of [-d / 2 + .15, d / 2 - .15]) box([0, -1.889, z], [w - .35, .02, .045], m.yellow, [0, 0, 0], false);
  }
  function rail(points: V3[]) {
    pipe(points, .037, m.yellow);
    for (const p of [points[0], points[points.length - 1]]) {
      cyl([p[0], -1.35, p[2]], .04, 1.10, m.steel);
      box([p[0], -1.87, p[2]], [.22, .06, .24], m.steel);
    }
  }
  function mine(w: number, d: number, variant: number) {
    base(w, d);
    const duty = variant % 4;
    if (duty === 2) {
      // Low, human-scale sample sorting area: two accessible work lines, not a crusher.
      bench(w * .84, 1.25, [0, 0, -d * .22], variant, true);
      bench(w * .55, 1.35, [-w * .13, 0, d * .26], variant);
      for (let i = 0; i < 5; i++) {
        const x = -w * .32 + i * w * .16;
        box([x, -.44, -d * .22], [.55, .08, .64], m.steel);
        const g = new SphereGeometry(.16 + .02 * (i % 3), 7, 5); g.scale(1.4, .7, 1);
        add(g, stone, [x, -.27, -d * .22]);
      }
      for (const x of [-w * .4, w * .4]) box([x, .05, -d * .38], [.12, 3.8, .15], m.steel);
      box([0, 1.91, -d * .38], [w * .84, .14, .18], m.hull);
      for (let i = 0; i < 6; i++) box([-w * .32 + i * w * .13, 1.59, -d * .36], [.24, .37, .055], m.label);
      return;
    }
    if (duty === 3) {
      // Open receiving skips of unequal height on two recessed storage tracks.
      const bw = Math.min(2.5, w * .25), bd = Math.min(2.4, d * .30);
      for (let i = 0; i < 3; i++) {
        const x = -w * .31 + i * w * .31, z = (i % 2 ? 1 : -1) * d * .19;
        const h = 1.65 + i * .39;
        box([x, -1.75, z], [bw, .23, bd], m.steel);
        for (const side of [-1, 1]) {
          box([x + side * (bw / 2 - .06), -1.65 + h / 2, z], [.12, h, bd], m.hull);
          box([x, -1.65 + h / 2, z + side * (bd / 2 - .06)], [bw, h, .12], m.hull);
          box([x, -1.65 + h, z + side * bd / 2], [bw, .12, .15], m.yellow);
          cyl([x + side * bw * .33, -1.84, z], .11, bd * .80, m.steel, [Math.PI / 2, 0, 0]);
        }
      }
      for (const z of [-d * .34, d * .34]) box([0, -1.86, z], [w * .90, .10, .10], m.steel);
      return;
    }
    const length = w - .65, conveyorZ = -d * .13;
    // Wide side-to-side screening conveyor, with individual rollers and chain guards.
    box([0, -.63, conveyorZ], [length, .34, d * .32], m.steel);
    box([0, -.44, conveyorZ], [length - .18, .045, d * .29], m.rubber);
    const rollers = Math.max(8, Math.floor(length / .43));
    for (let i = 0; i < rollers; i++) {
      const x = -length / 2 + .22 + i * (length - .44) / (rollers - 1);
      cyl([x, -.385, conveyorZ], .072, d * .30, m.steel, [Math.PI / 2, 0, 0]);
    }
    for (const x of [-length * .40, 0, length * .4]) {
      box([x, -1.31, conveyorZ], [.16, 1.15, d * .26], m.steel);
      for (const z of [conveyorZ - d * .17, conveyorZ + d * .17]) box([x, -.60, z], [.33, .26, .16], m.hull);
    }
    for (const z of [conveyorZ - d * .18, conveyorZ + d * .18]) box([0, -.23, z], [length, .19, .10], m.yellow);
    // Alternate full-height receiving hoppers and tilted screening banks; the
    // quadrants form different stages of a process rather than four copies.
    const hx = -w * .22, hz = conveyorZ;
    if (variant % 2 === 0) {
      const mouth = Math.min(2.45, w * .19), hopperTop = Math.min(5.8, ceiling() - 1.25);
      const throat = mouth * .40, bottom = .12;
      const shape = new Shape(); shape.moveTo(-mouth, hopperTop); shape.lineTo(mouth, hopperTop);
      shape.lineTo(throat, bottom); shape.lineTo(-throat, bottom); shape.closePath();
      for (const z of [hz - d * .17, hz + d * .17]) add(new ExtrudeGeometry(shape, { depth: .07, bevelEnabled: true, bevelSize: .025, bevelThickness: .02, bevelSegments: 1 }), m.hull, [hx, 0, z]);
      const slope = Math.atan2(mouth - throat, hopperTop - bottom);
      const sideLength = Math.hypot(mouth - throat, hopperTop - bottom);
      for (const side of [-1, 1]) {
        box([hx + side * (mouth + throat) / 2, (hopperTop + bottom) / 2, hz], [.075, sideLength, d * .34], m.hull, [0, 0, -side * slope]);
        box([hx + side * (mouth + .12), (hopperTop - 1.83) / 2, hz], [.13, hopperTop + 1.83, .15], m.steel);
      }
      for (const z of [hz - d * .17, hz + d * .17]) box([hx, hopperTop, z], [mouth * 2.1, .13, .15], m.yellow);
      box([hx, -.12, hz], [throat * 1.7, .46, d * .24], m.steel);
    } else {
      const sw = w * .53, tilt = -.22;
      box([-.10 * w, 1.35, hz], [sw, .30, d * .34], m.steel, [0, 0, tilt]);
      for (let i = 0; i < 16; i++) {
        const xx = -sw / 2 + .1 + (sw - .2) * i / 15;
        box([-.10 * w + xx * Math.cos(tilt), 1.57 + xx * Math.sin(tilt), hz], [.065, .12, d * .32], m.hull);
      }
      for (const x of [-w * .30, w * .10]) box([x, -.03, hz], [.22, 2.55, d * .30], m.steel);
      cyl([w * .18, 1.33, hz], .40, d * .33, m.steel, [Math.PI / 2, 0, 0]);
      for (const z of [hz - d * .20, hz + d * .20]) box([-w * .1, 1.90, z], [sw, .19, .09], m.yellow, [0, 0, tilt]);
    }
    for (let i = 0; i < 6; i++) {
      const g = new SphereGeometry(.17 + i % 2 * .05, 7, 5); g.scale(1.35, .75, 1);
      add(g, stone, [-w * .1 + i * .31, -.22, conveyorZ + .12 * Math.sin(i * 2 + variant)]);
    }
    const motorX = w * .32;
    cyl([motorX, -.8, d * .25], .34, 1.05, m.steel, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 6; i++) box([motorX - .44 + i * .17, -.80, d * .25], [.045, .65, .66], m.steel);
    box([motorX, -1.53, d * .25], [1.23, .65, .83], m.hull);
    panel([motorX, -.95, d * .25 + .46]);
    rail([[-w * .43, -.80, d * .40], [-w * .12, -.80, d * .40]]);
    // Gantry occupies the full work area, suspended independently of the conveyor.
    const gantryY = ceiling() - .85;
    for (const x of [-w * .43, w * .43]) box([x, (gantryY - 1.9) / 2, -d * .34], [.20, gantryY + 1.9, .24], m.steel);
    box([0, gantryY, -d * .34], [w - .30, .26, .28], m.yellow);
    box([w * .08, gantryY - .22, -d * .34], [.75, .18, .54], m.steel);
    pipe([[w * .08, gantryY - .30, -d * .34], [w * .12, (gantryY + 1.9) / 2, -d * .33], [w * .03, 1.9, -d * .31]], .036, m.steel);
    pipe([[-w * .4, gantryY - .20, -d * .30], [0, gantryY - .55, -d * .24], [w * .42, gantryY - .30, -d * .3]], .033, m.rubber);
  }
  function pumps(w: number, d: number, variant: number) {
    base(w, d);
    const count = Math.max(2, Math.floor(w / 2.4));
    for (let i = 0; i < count; i++) {
      const x = -w * .33 + (count === 1 ? 0 : i / (count - 1) * w * .66);
      const radius = Math.min(.70, w / count * .25), z = -d * .15;
      const height = Math.min(ceiling() - .55, 4.85) + ((i + variant) % 2) * .35;
      cyl([x, -1.75 + height / 2, z], radius, height, m.hull);
      for (const y of [-1.68, -.62, 1.40]) ring([x, y, z], radius + .03, .045, m.steel, [Math.PI / 2, 0, 0]);
      const dome = new SphereGeometry(radius, 16, 10); dome.scale(1, .48, 1);
      add(dome, m.hull, [x, -1.75 + height, z]);
      box([x, -1.83, z], [radius * 2.25, .22, radius * 2.25], m.steel);
      wheel([x, .28, z + radius + .17], .26);
      pipe([[x, -1.75 + height, z], [x, ceiling() - 1.0, z], [x, ceiling() - .55, -d * .34]], .15, m.steel);
      cyl([x, -1.22, d * .29], .27, .85, m.steel, [Math.PI / 2, 0, 0]);
      box([x, -1.73, d * .26], [.72, .25, 1.12], m.steel);
      pipe([[x, -1.18, d * .27], [x + .37, -.65, d * .20], [x, -.37, z + radius]], .095, m.hull);
    }
    pipe([[-w * .41, ceiling() - .55, -d * .34], [0, ceiling() - .55, -d * .34], [w * .41, ceiling() - .55, -d * .34]], .18, m.hull);
    box([w * .35, .60, d * .30], [.70, .68, .27], m.hull);
    box([w * .35, -.70, d * .30], [.12, 2.4, .15], m.steel);
    panel([w * .35, .61, d * .30 + .18], .58);
  }
  function thermal(w: number, d: number, variant: number) {
    base(w, d);
    const samples: V3[] = [[-w * .30, 3.70, -d * .26], [-w * .02, 4.4, -d * .09], [w * .26, 3.05, -d * .29]];
    for (let i = 0; i < samples.length; i++) {
      const [x, nominalHeight, z] = samples[i];
      const height = Math.min(ceiling() + .7, nominalHeight * (ceiling() + 1) / 5);
      const g = new CylinderGeometry(.23, .56, height, 9, 13, true);
      const v = g.attributes.position;
      for (let n = 0; n < v.count; n++) {
        const y = v.getY(n), q = 1 + .22 * Math.sin(y * 7 + i + v.getX(n) * 11);
        v.setXYZ(n, v.getX(n) * q + .07 * Math.sin(y * 2), y, v.getZ(n) * q);
      }
      g.computeVertexNormals(); add(g, stone, [x, -1.88 + height / 2, z]);
      const pts: V3[] = [];
      for (let n = 0; n <= 40; n++) { const t = n / 40, a = t * Math.PI * (4 + i * .6); pts.push([x + Math.cos(a) * .70, -1.55 + t * (height - .45), z + Math.sin(a) * .70]); }
      pipe(pts, .047, m.steel);
      pipe([[x, -1.65, z], [x + .3, -1.60, -d * .40], [w * .39, -1.60, -d * .40]], .075, m.hull);
    }
    // Side shields define an insulated working aisle, without a cross-lane wall.
    for (const x of [-w * .44, w * .44]) {
      box([x, -.4, -d * .14], [.08, 2.8, d * .47], m.hull);
      for (let i = 0; i < 4; i++) box([x, -.4, -d * .33 + i * d * .12], [.12, 2.8, .04], m.steel);
    }
    bench(w * .66, .95, [0, 0, d * .30], variant, true);
  }
  function bench(w: number, d: number, p: V3, variant: number, samples = false) {
    const [x, , z] = p;
    box([x, -.55, z], [w, .13, d], m.hull);
    for (const dx of [-w * .40, w * .40]) box([x + dx, -1.24, z], [.16, 1.25, d * .73], m.steel);
    box([x, -1.39, z], [w - .18, .08, d * .72], m.steel);
    if (samples) {
      for (let i = 0; i < 4; i++) { const xx = x - w * .33 + i * w * .22; cyl([xx, -.16, z], .095, .61, m.steel); cyl([xx, .17, z], .105, .05, m.yellow); }
    } else {
      box([x - w * .24, -.445, z], [.48, .07, d * .70], m.rubber);
      box([x + w * .23, -.35, z], [.38, .26, .31], m.hull);
      drape([x, -.91, z + d / 2 + .035], .60, .83, variant);
    }
    panel([x + w * .25, .1, z - d * .35], .62);
    box([x + w * .25, -.23, z - d * .35], [.08, .55, .10], m.steel);
  }
  function provisions(w: number, d: number, variant: number) {
    base(w, d);
    const duty = variant % 4;
    if (duty === 0) {
      // Shared long tables, with continuous benches and open sightlines above them.
      for (const z of [-d * .24, d * .23]) {
        bench(w * .88, 1.22, [0, 0, z], variant);
        for (const side of [-1, 1]) {
          const seatZ = z + side * .96;
          box([0, -1.13, seatZ], [w * .84, .12, .40], m.hull);
          for (const x of [-w * .35, w * .35]) box([x, -1.52, seatZ], [.12, .70, .30], m.steel);
        }
      }
      return;
    }
    if (duty === 2) {
      // L-shaped serving counter and tall backed kitchen units.
      box([0, -1.17, -d * .27], [w * .88, 1.45, 1.23], m.hull);
      box([0, -.40, -d * .27], [w * .91, .12, 1.38], m.steel);
      box([w * .34, -1.17, d * .06], [1.20, 1.45, d * .59], m.hull);
      for (let i = 0; i < 5; i++) {
        const x = -w * .34 + i * w * .17;
        box([x, -1.09, -d * .27 + .64], [w * .145, 1.20, .04], m.steel);
        box([x, -.85, -d * .27 + .68], [.24, .04, .045], m.rubber);
      }
      for (const x of [-w * .32, -w * .06]) {
        cyl([x, .04, -d * .28], .33, .78, m.hull);
        cyl([x, .45, -d * .28], .36, .05, m.steel);
        wheel([x, .0, -d * .28 + .38], .12);
      }
      box([0, 1.55, -d * .40], [w * .88, 2.1, .24], m.hull);
      panel([-w * .28, 1.12, -d * .40 + .17], .75);
      return;
    }
    if (duty === 3) {
      // Broken changing partitions in the foreground, with a visible interrupted line.
      for (const x of [-w * .31, 0, w * .31]) {
        const high = x === 0 ? .82 : 1.62;
        box([x, -1.88 + high / 2, 0], [.09, high, d * .69], m.hull);
        for (const z of [-d * .34, d * .34]) box([x, -.88, z], [.13, 2.0, .13], m.steel);
        box([x + w * .1, -1.18, -d * .23], [w * .16, .14, .58], m.hull);
        box([x + w * .1, -1.53, -d * .23], [.12, .64, .40], m.steel);
      }
      box([w * .15, -1.72, d * .24], [w * .21, .08, 1.05], m.hull, [.12, .31, .07]);
      drape([-w * .30, .08, -d * .26], .63, 1.24, variant);
      return;
    }
    const depth = Math.min(1.12, d * .23), rackZ = -d * .31;
    for (const x of [-w * .43, 0, w * .43]) for (const z of [rackZ - depth / 2, rackZ + depth / 2]) box([x, .38, z], [.065, 4.45, .065], m.steel);
    for (const y of [-1.76, -.55, .70, 2.20]) box([0, y, rackZ], [w * .9, .065, depth], m.hull);
    const bays = Math.max(3, Math.floor(w / 1.3));
    for (let i = 0; i < bays; i++) {
      const x = -w * .38 + i * w * .76 / (bays - 1);
      if ((i + variant) % 3 === 0) {
        box([x, .10, rackZ - depth * .3], [.75, 1.13, .035], m.rubber);
        box([x + .43, .10, rackZ + depth * .15], [.04, 1.10, depth * .8], m.hull, [0, .55, 0]);
      } else {
        box([x, -1.38, rackZ], [.68, .66, depth * .72], m.hull);
        box([x, -1.35, rackZ + depth * .38], [.08, .59, .025], m.red, [0, 0, 0], false);
      }
      box([x, 2.14, rackZ + depth * .51], [.26, .095, .02], m.label, [0, 0, 0], false);
    }
    for (const x of [-w * .28, w * .20]) {
      box([x, -.95, d * .20], [w * .25, 1.8, 1.10], m.hull);
      box([x, -.93, d * .20 + .57], [w * .21, 1.57, .045], m.rubber);
      box([x + w * .12, -.93, d * .20 + .72], [.065, 1.57, .70], m.hull, [0, .65, 0]);
    }
    if (variant % 2) drape([-w * .26, 1.2, rackZ + depth * .60], .66, 1.80, variant);
  }
  function flush() {
    for (const [mat, parts] of batch) {
      const g = mergeGeometries(parts, false); for (const part of parts) part.dispose();
      if (!g) throw new Error('Facilities material merge failed');
      g.computeBoundingBox(); g.computeBoundingSphere(); ownedGeometry.add(g);
      const mesh = new Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    }
    batch = new Map();
  }
  const builders = [mine, pumps, thermal, provisions];
  function allowedArea(x: number, z: number, w: number, d: number) {
    const b = new Box3(new Vector3(room.x + x - w / 2 - .08, -2, room.z + z - d / 2 - .08), new Vector3(room.x + x + w / 2 + .08, ceiling(), room.z + z + d / 2 + .08));
    return !reservations.some(r => r.intersectsBox(b)) && !doorBounds.some(r => r.intersectsBox(b));
  }
  function area(x: number, z: number, w: number, d: number, variant: number, entry: boolean) {
    const start = colliders.length;
    transform = compose([room.x + x, 0, room.z + z], [0, z > 0 ? Math.PI : 0, 0]);
    if (entry) {
      // Compact functional forecourt fixtures share the main hall's purpose.
      if (level.index === 0) mine(w, d, variant % 2);
      if (level.index === 1) { cyl([0, -.35, 0], Math.min(w, d) * .28, 3.1, m.hull); wheel([0, .15, d * .31], .22); }
      if (level.index === 2) { cyl([-w * .20, -.65, 0], .23, 2.4, stone, [0, 0, 0], true, .10); bench(w * .7, d * .50, [w * .1, 0, d * .18], variant, true); }
      if (level.index === 3) { bench(w * .83, d * .74, [0, 0, 0], variant); for (const xx of [-w * .36, w * .36]) box([xx, .15, -d * .27], [.06, 3.1, .06], m.steel); box([0, 1.65, -d * .27], [w * .8, .07, .40], m.hull); }
    } else builders[level.index](w, d, variant);
    const dutyName = level.index === 0 ? ['料斗破碎塔', '长矿筛输送线', '矿样分拣工位', '矿斗储存轨道'][variant % 4]
      : level.index === 3 ? ['公共长桌', '配给储物架', '厨房前台', '破损更衣隔间'][variant % 4] : `${TITLES[level.index]}-${variant}`;
    footprints.push({ room: room.id, name: entry ? `入口作业设施-${dutyName}` : dutyName, min: [room.x + x - w / 2, -2, room.z + z - d / 2], max: [room.x + x + w / 2, ceiling(), room.z + z + d / 2], colliderStart: start, colliderCount: colliders.length - start });
  }
  if (level.index >= 0 && level.index <= 3) {
    const selected = level.rooms.filter(r => r.role === 'hall' || r.id === level.startRoom);
    for (const r of selected) {
      room = r; parent = new Group(); parent.name = `facilities.${r.id}`; root.add(parent);
      const isEntry = r.role !== 'hall';
      const qw = r.width / 2 - 2.65, qd = r.depth / 2 - 2.65;
      if (qw < 1.65 || qd < 1.65) { coverage.push({ room: r.id, fraction: 0, workAreas: 0 }); continue; }
      const w = isEntry ? Math.min(level.index === 0 ? 4.8 : 3.6, qw * .85) : qw * .90;
      const d = isEntry ? Math.min(level.index === 0 ? 4.3 : 3.8, qd * .85) : qd * .90;
      let areaSum = 0, accepted = 0;
      for (let q = 0; q < 4; q++) {
        const sx = q % 2 ? 1 : -1, sz = q < 2 ? -1 : 1;
        const x = sx * (2.35 + qw / 2), z = sz * (2.35 + qd / 2);
        if (isEntry && accepted >= 2) break;
        if (allowedArea(x, z, w, d)) { area(x, z, w, d, q + r.sector, isEntry); areaSum += w * d; accepted++; }
        else {
          // Keep complete smaller workstations around a reserved pickup rather
          // than dropping individual supports and leaving floating equipment.
          const smallW = w * .47;
          for (const side of [-1, 1]) {
            const xx = x + side * w * .265;
            if (smallW >= 3.0 && d >= 3.4 && allowedArea(xx, z, smallW, d)) { area(xx, z, smallW, d, q + r.sector, false); areaSum += smallW * d; accepted++; }
          }
        }
      }
      // Cross-ceiling infrastructure connects separate work zones and real walls.
      transform = compose([r.x, 0, r.z]);
      if (!isEntry && (level.index === 0 || level.index === 1)) {
        // Mid-height transfer bridges tie the opposing process zones together,
        // below the roof services but safely above the entire centre cross.
        const bridgeY = Math.min(ceiling() - 1.0, Math.max(4.15, ceiling() * .57));
        for (const z of [-1, 1].map(sign => sign * (2.35 + qd / 2))) {
          const span = r.width * .72;
          const envelope = new Box3(new Vector3(r.x - span / 2 - .15, bridgeY - .30, r.z + z - .50), new Vector3(r.x + span / 2 + .15, bridgeY + .90, r.z + z + .50));
          if (reservations.some(b => b.intersectsBox(envelope))) continue;
          if (level.index === 0) {
            for (const zz of [z - .34, z + .34]) {
              box([0, bridgeY, zz], [span, .18, .12], m.steel);
              box([0, bridgeY + .72, zz], [span, .13, .10], m.yellow);
              const sections = Math.ceil(span / 2.3);
              for (let n = 0; n < sections; n++) {
                const a = -span / 2 + n * span / sections, b = a + span / sections;
                pipe([[a, bridgeY, zz], [b, bridgeY + .72, zz]], .037, m.steel);
              }
            }
            box([0, bridgeY + .04, z], [span, .10, .64], m.rubber);
            for (const x of [-span * .40, span * .40]) pipe([[x, bridgeY + .74, z], [x, ceiling() - .08, z]], .037, m.steel);
          } else {
            for (const zz of [z - .24, z + .24]) pipe([[-span / 2, bridgeY, zz], [0, bridgeY, zz], [span / 2, bridgeY, zz]], .19, m.hull);
            for (const x of [-span * .4, 0, span * .4]) box([x, bridgeY + .28, z], [.17, .16, .94], m.steel);
          }
        }
      }
      if (!isEntry) {
        // Two longitudinal process spines connect foreground, midground and rear
        // zones. Their low ends terminate inside equipment quadrants; all spans
        // over the transverse aisle stay above y=3.15.
        const spineY = Math.min(ceiling() - .72, Math.max(3.70, ceiling() * .59));
        const endZ = 2.35 + qd / 2;
        for (const x of [-1, 1].map(side => side * (2.35 + qw / 2))) {
          const envelope = new Box3(new Vector3(r.x + x - .70, spineY - .30, r.z - endZ - .15), new Vector3(r.x + x + .70, spineY + .40, r.z + endZ + .15));
          if (reservations.some(b => b.intersectsBox(envelope))) continue;
          if (level.index === 0) {
            for (const side of [-1, 1]) box([x + side * .35, spineY, 0], [.12, .22, endZ * 2], m.yellow);
            for (const z of [-endZ, -endZ * .45, endZ * .45, endZ]) box([x, spineY + .18, z], [.92, .13, .26], m.steel);
            pipe([[x, spineY + .22, -endZ], [x + .10, spineY + .1, 0], [x, spineY + .22, endZ]], .035, m.rubber);
          } else if (level.index === 1) {
            for (const side of [-1, 1]) pipe([[x + side * .25, spineY, -endZ], [x + side * .25, spineY, 0], [x + side * .25, spineY, endZ]], .17, m.hull);
            for (const z of [-endZ, endZ]) {
              const drop = new Box3(new Vector3(r.x + x - .24, 1.4, r.z + z - .28), new Vector3(r.x + x + .24, spineY + .24, r.z + z + .28));
              if (!reservations.some(b => b.intersectsBox(drop))) pipe([[x, spineY, z], [x, spineY - .45, z + Math.sign(z) * .05], [x, 1.6, z]], .15, m.steel);
            }
          } else if (level.index === 2) {
            box([x, spineY, 0], [.95, .42, endZ * 2], m.hull);
            const sections = Math.ceil(endZ * 2 / 1.7);
            for (let n = 0; n <= sections; n++) box([x, spineY, -endZ + n * endZ * 2 / sections], [1.02, .49, .055], m.steel);
            for (const z of [-endZ, endZ]) {
              const drop = new Box3(new Vector3(r.x + x - .25, 2.4, r.z + z - .30), new Vector3(r.x + x + .25, spineY + .25, r.z + z + .30));
              if (!reservations.some(b => b.intersectsBox(drop))) pipe([[x, spineY, z], [x, spineY - .38, z], [x, 2.65, z]], .20, m.steel);
            }
          } else {
            box([x, spineY, 0], [.18, .16, endZ * 2], m.steel);
            for (const z of [-endZ * .75, endZ * .75]) {
              box([x, spineY - .18, z], [.48, .18, .43], m.hull);
              pipe([[x, spineY + .08, z], [x, ceiling() - .08, z]], .027, m.steel);
            }
          }
          // Roof hangers make every spine visibly structural, not floating.
          for (const z of [-endZ * .62, endZ * .62]) pipe([[x, spineY + .28, z], [x, ceiling() - .08, z]], .03, m.steel);
        }
      }
      if (!isEntry && level.index !== 3) {
        const topY = ceiling() - .42, radius = level.index === 1 ? .18 : .09;
        const runs: V3[][] = [
          [[-r.width / 2 + .38, topY, -r.depth * .28], [0, topY, -r.depth * .28], [r.width / 2 - .38, topY, -r.depth * .28]],
          [[r.width * .28, topY, -r.depth / 2 + .38], [r.width * .28, topY, 0], [r.width * .28, topY, r.depth / 2 - .38]],
        ];
        for (const points of runs) {
          const b = new Box3().setFromPoints(points.map(p => new Vector3(...p))).expandByScalar(radius + .01).applyMatrix4(transform);
          if (!reservations.some(r => r.intersectsBox(b))) pipe(points, radius, level.index === 0 ? m.yellow : m.hull);
        }
      }
      if (!isEntry && level.index === 3) {
        // Suspended distribution rails above the communal work areas, at actual roof height.
        for (const z of [-r.depth * .28, r.depth * .28]) {
          const p: V3 = [0, ceiling() - .46, z], size: V3 = [r.width - .8, .12, .16];
          const b = new Box3().setFromCenterAndSize(new Vector3(...p), new Vector3(...size)).applyMatrix4(transform);
          if (!reservations.some(r => r.intersectsBox(b))) {
            box(p, size, m.steel);
            for (const x of [-r.width * .3, r.width * .3]) pipe([[x, ceiling() - .04, z], [x, ceiling() - .46, z]], .025, m.steel);
          }
        }
      }
      flush(); coverage.push({ room: r.id, fraction: areaSum / (r.width * r.depth), workAreas: accepted });
      if (!isEntry && accepted) {
        // End-of-long-axis view: near work-area edges frame both midground zones
        // and the far process stages, rather than looking into a single corner.
        const alongX = r.width >= r.depth;
        const candidates: V3[] = [.42, .36, .29].map(fraction => alongX
          ? [r.x - r.width * fraction, .40, r.z + .60] : [r.x + .60, .40, r.z - r.depth * fraction]);
        const eye = candidates.find(p => !doorBounds.some(b => b.containsPoint(new Vector3(...p)))) ?? [r.x, .4, r.z] as V3;
        const target: V3 = alongX ? [r.x + r.width * .13, 1.30, r.z] : [r.x, 1.30, r.z + r.depth * .13];
        views.push({ name: `${TITLES[level.index]} · ${r.name}`, view: eye,
          yaw: Math.atan2(-(target[0] - eye[0]), -(target[2] - eye[2])),
          pitch: Math.atan2(target[1] - eye[1], Math.hypot(target[0] - eye[0], target[2] - eye[2])) });
      }
      if (isEntry && accepted) {
        const edge = level.edges.find(e => e.from === r.id || e.to === r.id);
        const next = edge && level.rooms.find(n => n.id === (edge.from === r.id ? edge.to : edge.from));
        if (edge && next) {
          const direction = new Vector3(next.x - r.x, 0, next.z - r.z).normalize();
          const extent = Math.abs(direction.x) > .5 ? r.width : r.depth;
          const eye: V3 = [r.x - direction.x * extent * .36, .10, r.z - direction.z * extent * .36];
          const [doorX, doorZ] = expeditionDoorPosition(r, next);
          const exit: V3 = [doorX, .30, doorZ];
          const candidates = footprints.filter(f => f.room === r.id);
          const foreground = candidates.map(f => new Vector3((f.min[0] + f.max[0]) / 2, .7, (f.min[2] + f.max[2]) / 2))
            .sort((a, b) => a.distanceToSquared(new Vector3(...eye)) - b.distanceToSquared(new Vector3(...eye)))[0];
          const equipmentDirection = foreground.clone().sub(new Vector3(...eye)).normalize();
          const aim = direction.clone().multiplyScalar(.70).addScaledVector(equipmentDirection, .30).normalize();
          const entryView = { name: `${TITLES[level.index]} · 接驳开场`, view: eye,
            yaw: Math.atan2(-aim.x, -aim.z), pitch: .025,
            room: r.id, edge: edge.id, exitRoom: next.id, exit };
          root.userData.entryView = entryView;
          root.userData.entryViews = [entryView];
        }
      }
    }
  }
  return {
    root, colliders, views,
    update(_time: number) { /* Static working spaces: no added per-frame cost. */ },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); root.clear();
      for (const g of ownedGeometry) g.dispose(); ownedGeometry.clear();
      for (const mat of ownedMaterials) mat.dispose();
      colliders.length = 0; views.length = 0;
    },
  };
}
