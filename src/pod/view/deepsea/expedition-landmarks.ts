import {
  Box3, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Euler,
  ExtrudeGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry,
  Quaternion, Shape, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionRoom } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
export interface ExpeditionLandmarkAnchor {
  room: string; name: string;
  /** World-space look-at target. */
  position: V3;
  /** Clear player/camera position, in world space. */
  view: V3;
  yaw: number; pitch: number;
}
export interface ExpeditionLandmarks {
  root: Group; colliders: Box3[]; anchors: ExpeditionLandmarkAnchor[];
  update(time: number): void; dispose(): void;
}
type Batch = Map<MeshStandardMaterial, BufferGeometry[]>;
const NAMES = ['断轴采矿悬架', '三向汇流阀树', '矿物烟囱换热器', '空置补给转盘', '倾斜防护叶轮', '黑水观察肋窗', '象牙承压升降环'];

/** Decorative, deterministic scene geometry; never owns shared materials or gameplay state.
 * Hall envelopes live wholly in the +X/-Z quadrant, outside the centre cross.
 * Anchors are explicit world coordinates, unaffected by root parent transforms.
 */
export function createExpeditionLandmarks(level: ExpeditionLevel, m: ReferenceMaterials): ExpeditionLandmarks {
  const root = new Group(); root.name = `expedition-landmarks.${level.id}`;
  const colliders: Box3[] = [], anchors: ExpeditionLandmarkAnchor[] = [];
  const geometries = new Set<BufferGeometry>();
  const ownedMaterials: MeshStandardMaterial[] = [];
  const rotors: { group: Group; phase: number }[] = [];
  const metadata: { room: string; kind: 'hall' | 'entry' | 'entry-frame'; name: string; bounds: { min: V3; max: V3 }; colliderStart: number; colliderCount: number }[] = [];
  root.userData.landmarks = metadata;
  const blackGlass = m.glass.clone();
  blackGlass.color.set('#071216'); blackGlass.roughness = .19;
  // Opaque backed observation glass: no scene, creature, or emissive shape behind it.
  if ('transmission' in blackGlass) (blackGlass as MeshStandardMaterial & { transmission: number }).transmission = 0;
  blackGlass.transparent = true; blackGlass.opacity = .24; blackGlass.depthWrite = false;
  blackGlass.roughness = .28;
  ownedMaterials.push(blackGlass);
  const fabric = m.cloth.clone(); fabric.side = DoubleSide;
  fabric.color.multiplyScalar(.68); fabric.roughness = 1;
  fabric.normalScale.multiplyScalar(.65);
  if ('sheen' in fabric) (fabric as MeshStandardMaterial & { sheen: number }).sheen = .06;
  ownedMaterials.push(fabric);
  const mineral = m.floor.clone(); mineral.color.set('#45504d'); mineral.roughness = 1;
  ownedMaterials.push(mineral);
  let batches: Batch = new Map();
  let placement = new Matrix4();
  let roomGroup = root;
  let currentRoom: ExpeditionRoom;
  const unit = new Vector3(1, 1, 1);
  const reserved = level.items.map(item => {
    const r = level.rooms.find(r => r.id === item.room)!;
    return new Box3().setFromCenterAndSize(new Vector3(r.x + item.x, .9, r.z + item.z), new Vector3(4, 6, 4));
  });
  reserved.push(new Box3().setFromCenterAndSize(new Vector3(level.spawn[0], .9, level.spawn[1]), new Vector3(4, 6, 4)));

  function matrix(p: V3, r: V3 = [0, 0, 0]) {
    return new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...r)), unit);
  }
  function solid(bounds: Box3) {
    // Every solid is checked against approaches and BOTH arms of the room cross.
    const r = currentRoom;
    if (bounds.min.y >= 3.15) return; // overhead, above the player envelope
    const crossesX = bounds.min.x < r.x + 2.5 && bounds.max.x > r.x - 2.5;
    const crossesZ = bounds.min.z < r.z + 2.5 && bounds.max.z > r.z - 2.5;
    if (crossesX || crossesZ || reserved.some(b => b.intersectsBox(bounds))) {
      throw new Error(`Landmark intrudes on reserved approach: ${r.id}`);
    }
    colliders.push(bounds);
  }
  function add(g: BufferGeometry, material: MeshStandardMaterial, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], collide = false) {
    g.applyMatrix4(placement.clone().multiply(matrix(p, r)));
    if (collide) { g.computeBoundingBox(); solid(g.boundingBox!.clone()); }
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.clearGroups();
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    const parts = batches.get(material) ?? []; parts.push(flat); batches.set(material, parts);
  }
  function box(p: V3, size: V3, material = m.steel, collide = true, r: V3 = [0, 0, 0]) {
    add(new RoundedBoxGeometry(...size, 2, Math.min(.055, ...size.map(v => v * .35))), material, p, r, collide);
  }
  function cylinder(p: V3, radius: number, length: number, material = m.steel, r: V3 = [0, 0, 0], collide = true, top = radius) {
    add(new CylinderGeometry(top, radius, length, 20), material, p, r, collide);
  }
  function tube(points: V3[], radius: number, material = m.steel, collide = false) {
    const curve = new CatmullRomCurve3(points.map(p => new Vector3(...p)));
    add(new TubeGeometry(curve, Math.max(20, points.length * 6), radius, 8, false), material);
    if (collide) {
      const samples = curve.getPoints(18);
      for (let i = 1; i < samples.length; i++) {
        const b = new Box3().setFromPoints([samples[i - 1], samples[i]]).expandByScalar(radius);
        solid(b.applyMatrix4(placement));
      }
    }
  }
  function ring(p: V3, radius: number, thickness: number, material = m.steel, r: V3 = [0, 0, 0], collide = false) {
    add(new TorusGeometry(radius, thickness, 8, 48), material, p, r);
    if (collide) {
      const mat = placement.clone().multiply(matrix(p, r));
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
        solid(new Box3().setFromPoints([new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0), new Vector3(Math.cos(b) * radius, Math.sin(b) * radius, 0)])
          .expandByScalar(thickness + .012).applyMatrix4(mat));
      }
    }
  }
  function bolts(p: V3, radius: number, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      cylinder([p[0] + Math.cos(a) * radius, p[1] + Math.sin(a) * radius, p[2]], .045, .06, m.steel, [Math.PI / 2, 0, 0], false);
    }
  }
  function valve(p: V3, radius = .48) {
    ring(p, radius, .055, m.yellow);
    cylinder([p[0], p[1], p[2] - .16], .095, .38, m.steel, [Math.PI / 2, 0, 0], false);
    for (let i = 0; i < 3; i++) box(p, [radius * 1.85, .055, .055], m.steel, false, [0, 0, i * Math.PI / 3]);
  }
  function gauge(p: V3, radius = .18, angle = -.6) {
    cylinder(p, radius, .10, m.steel, [Math.PI / 2, 0, 0], false);
    cylinder([p[0], p[1], p[2] + .06], radius * .83, .015, m.label, [Math.PI / 2, 0, 0], false);
    box([p[0], p[1], p[2] + .077], [radius * 1.15, .017, .012], m.rubber, false, [0, 0, angle]);
  }
  function plate(points: [number, number][], p: V3, depth: number, material = m.steel, rotation: V3 = [0, 0, 0]) {
    const s = new Shape(); s.moveTo(...points[0]);
    for (const point of points.slice(1)) s.lineTo(...point);
    s.closePath();
    add(new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2 }), material, p, rotation, true);
  }
  function cloth(p: V3, width: number, height: number, seed: number) {
    const g = new PlaneGeometry(width, height, 30, 36), v = g.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const u = v.getX(i) / width + .5, t = .5 - v.getY(i) / height;
      const sag = Math.sin(u * Math.PI);
      v.setXYZ(i, v.getX(i) - .10 * t * t,
        v.getY(i) - .13 * sag + .045 * Math.sin(u * 7 + seed) * t ** 7,
        .10 * Math.sin(t * 8 + u * 4 + seed) * sag + .032 * Math.sin(u * 27 + t * 5) * t);
    }
    g.computeVertexNormals(); add(g, fabric, p);
  }
  function flush(parent: Group) {
    for (const [material, parts] of batches) {
      const g = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!g) throw new Error('Landmark material merge failed');
      g.computeBoundingBox(); g.computeBoundingSphere(); geometries.add(g);
      const mesh = new Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `landmark.${material.name || 'surface'}`; parent.add(mesh);
    }
    batches = new Map();
  }

  function drill(sector: number) {
    for (const x of [-2.65, 2.65]) {
      box([x, .42, -.45], [.30, 4.75, .42], m.hull);
      box([x, -1.84, -.35], [.94, .26, 1.6], m.steel);
      for (let y = -1.3; y < 2.3; y += .48) box([x, y, -.18], [.37, .09, .12], m.yellow);
    }
    box([0, 2.82, -.45], [6.35, .36, .52], m.yellow);
    box([-.5, 2.49, -.40], [1.1, .28, .8], m.steel);
    tube([[-.85, 2.5, -.3], [-.8, 1.8, -.2], [-.45, 1.5, -.1]], .055, m.steel);
    tube([[.15, 2.5, -.3], [.45, 1.8, -.2], [.78, 1.1, -.1]], .04, m.rubber);
    // Sheared cutter yoke: exposed drive shaft and two unequal hinged jaws.
    cylinder([.05, 1.25, -.15], .26, 1.8, m.steel, [0, 0, -.30], true);
    box([.02, .95, -.1], [1.42, .55, .85], m.hull, true, [0, 0, -.24]);
    for (const x of [-.60, .62]) {
      cylinder([x, .85, .43], .24, .26, m.steel, [Math.PI / 2, 0, 0]);
      bolts([x, .85, .60], .18, 6);
    }
    plate([[0, .1], [-.30, -.12], [-.77, -1.10], [-.40, -1.62], [.16, -1.80], [.03, -1.29], [-.15, -.91], [.30, -.20]], [-.60, .84, -.04], .38, m.steel, [0, 0, -.20]);
    plate([[0, .1], [.35, -.12], [.85, -.85], [.60, -1.45], [.10, -1.58], [.24, -1.04], [.13, -.75], [-.26, -.15]], [.62, .84, .02], .35, m.hull, [0, -.12, .40]);
    for (let i = 0; i < 4; i++) {
      box([-.91 + i * .16, -.60 - i * .10, .45], [.14, .25, .27], m.yellow, true, [0, 0, -.42]);
      if (i !== 2) box([1.30 - i * .12, -.23 - i * .17, .43], [.16, .23, .24], m.steel, true, [0, 0, .38]);
    }
    cylinder([-1.03, 1.08, -.2], .17, 1.27, m.hull, [0, 0, -.52]);
    cylinder([1.02, .87, -.3], .12, 1.45, m.steel, [0, 0, .67]);
    for (let i = 0; i < 4; i++) tube([[.2 + i * .13, 2.35, -.1], [1.5 + i * .10, 1.75, -.65], [1.6, .25 - i * .14, -.4], [.9, .52 - i * .15, .02]], .025 + i * .003, m.rubber);
    box([-1.75, -.85, -.60], [1.03, 1.9, 1.05], m.steel);
    box([-1.75, -.64, -.03], [.88, 1.24, .06], m.rubber);
    for (let i = 0; i < 5; i++) cylinder([-2.07 + i * .15, -.60, .10], .044, .95, m.steel);
    plate([[-.48, -.55], [.48, -.55], [.48, .55], [-.48, .55]], [-1.26, -.60, .02], .045, m.hull, [0, -.85, -.12]);
    gauge([-1.75, .32, .03]);
    tube([[-2.65, 2.65, -.3], [-1.3, 2.24, -.1], [1.4, 2.45, -.15], [2.65, 1.6, -.3]], .052, m.rubber);
    box([1.95, -1.66, .35], [1.30, .28, .80], m.steel, true, [0, .22 + sector * .08, .08]);
  }
  function manifold(sector: number) {
    tube([[-2.85, -1.6, 0], [-2.85, .65, 0], [-1.5, 1.1, 0], [0, .45, 0], [1.55, 1.05, 0], [2.75, .6, 0], [2.75, -1.7, 0]], .36, m.hull, true);
    cylinder([0, 1.60, 0], .42, 2.7, m.hull);
    cylinder([0, .45, .18], .68, .65, m.steel, [Math.PI / 2, 0, 0]);
    for (const [x, y] of [[-2.6, .52], [0, 1.70], [2.5, .58]]) {
      ring([x, y, .39], .53, .10, m.steel); bolts([x, y, .50], .52);
      valve([x, y, .72], x === 0 ? .66 : .48);
      box([x, -1.66, -.05], [.95, .45, 1.15], m.steel);
    }
    for (let i = 0; i < 4; i++) tube([[-1.6 + i * .26, -1.6, -.55], [-1.6 + i * .26, 2.5 - i * .15, -.55], [.65, 2.65 - i * .15, -.55]], .045, m.steel);
    valve([-.75 + sector * .1, -.45, .7], .24);
    for (const x of [-1.05, .62, 1.43]) {
      tube([[x, .85, .0], [x, 1.7, .40], [x, 1.8, .58]], .040, m.steel);
      gauge([x, 1.8, .65], .19, x * .5);
    }
    tube([[-2.5, -.45, .28], [-1.8, -1.18, .75], [.9, -1.15, .80], [2.6, -.48, .25]], .13, m.rubber, true);
    for (const x of [-2.48, 2.58]) ring([x, -.42, .25], .39, .065, m.steel, [Math.PI / 2, 0, 0]);
  }
  function chimneys(sector: number) {
    for (let i = 0; i < 5; i++) {
      const x = -2.5 + i * 1.13, h = [3.55, 4.3, 3.0, 4.7, 3.8][(i + sector) % 5];
      const g = new CylinderGeometry(.23, .57, h, 11, 10, true);
      const v = g.attributes.position;
      for (let j = 0; j < v.count; j++) {
        const y = v.getY(j), q = 1 + .24 * Math.sin(y * 5.1 + i * 2 + v.getX(j) * 8) + .10 * Math.cos(y * 11 + v.getZ(j) * 13);
        v.setXYZ(j, v.getX(j) * q + .085 * Math.sin(y * 2 + i), y, v.getZ(j) * q);
      }
      g.computeVertexNormals(); add(g, mineral, [x, -1.95 + h / 2, 0], [0, 0, (i - 2) * .025], true);
      cylinder([x, -2 + h - .08, 0], .21, .04, m.rubber, [0, 0, 0], false);
      const pts: V3[] = [];
      for (let n = 0; n <= 90; n++) { const t = n / 90, a = t * Math.PI * (4.4 + i * .31); pts.push([x + Math.cos(a) * .65, -1.6 + t * (h - .65), Math.sin(a) * .65]); }
      tube(pts, .045, m.steel);
      tube([[x, -1.5, -.68], [x, .3 + i * .15, -.75], [x + .32, .65 + i * .15, -.20]], .07, m.hull);
      for (let k = 0; k < 3; k++) cylinder([x + .22 * Math.sin(k + i), -.80 + k * .63, .30], .15 + k * .025, .65, mineral, [0, 0, .4 - i * .12], true, .055);
      box([x, -1.86, 0], [1.0, .24, 1.45], m.steel);
    }
    tube([[-2.9, -1.55, -.8], [0, -1.55, -.8], [2.9, -1.55, -.8], [2.9, .7, -.8]], .13, m.hull, true);
  }
  function carousel(sector: number) {
    cylinder([-.5, .40, -.05], .20, 4.65, m.steel);
    for (const y of [-1.6, -.22, 1.15, 2.5]) {
      ring([-.5, y, -.05], 1.65, .095, m.hull, [Math.PI / 2, 0, 0], true);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + .15;
        tube([[-.5, y, -.05], [-.5 + Math.cos(a) * 1.65, y, -.05 + Math.sin(a) * 1.65]], .038, m.steel);
      }
    }
    for (const x of [1.85, 3.0]) {
      box([x, .2, -.1], [.08, 4.3, 1.6], m.steel);
      for (const y of [-1.35, -.05, 1.25, 2.25]) box([2.43, y, -.1], [1.15, .055, 1.6], m.hull);
    }
    // Separate inspection sheet beside the carousel, never threaded through rings.
    cloth([-2.85, .55, 1.30], .65, 3.65, sector * .6);
    tube([[-1.5, 2.5, .5], [-2.40, 2.52, 1.2], [-3.15, 2.48, 1.30]], .032, m.steel);
    cloth([2.36, 1.5, .78], .56, 1.3, sector + 1.5);
    for (const x of [-1.7, -.9, .1]) ring([x, 2.42, 1.0], .09, .024, m.steel);
    for (const y of [-.12, 1.25, 2.45]) for (const x of [-1.90, -.45, .75]) {
      tube([[x, y, .82], [x, y - .25, 1.00], [x + .14, y - .27, .95]], .025, m.steel);
      box([x + .12, y - .34, 1.02], [.16, .13, .025], m.label, false, [0, 0, .16]);
    }
    for (const x of [2.06, 2.67]) box([x, .62, .77], [.065, .90, .025], m.red, false, [0, 0, x > 2.3 ? -.16 : .12]);
  }
  function turbine(sector: number) {
    const center: V3 = [0, .48, 0], tilt: V3 = [0, -.12, -.14];
    const basePlacement = placement.clone();
    placement.multiply(matrix(center, tilt));
    ring([0, 0, 0], 2.05, .21, m.hull, [0, 0, 0], true);
    ring([0, 0, .22], 1.92, .065, m.yellow, [0, 0, 0], true);
    bolts([0, 0, .28], 2.04, 24);
    for (const r of [.58, 1.12, 1.66]) ring([0, 0, .40], r, .025, m.steel);
    for (let i = 0; i < 12; i++) box([0, 0, .43], [3.85, .025, .028], m.steel, false, [0, 0, i * Math.PI / 12]);
    // Guard collision is a thin physical disk. It also encloses the moving rotor.
    cylinder([0, 0, .39], 1.88, .09, m.steel, [Math.PI / 2, 0, 0], true);
    // Replace the opaque disk's rendering with the open wire guard above.
    const guardParts = batches.get(m.steel)!; guardParts.pop()!.dispose();
    const rotorPlacement = placement.clone();
    placement = basePlacement;
    for (const x of [-2.05, 2.05]) box([x, -1.1, -.20], [.4, 1.7, 1.2], m.steel);
    box([2.7, -.3, -.2], [.85, 2.6, 1.35], m.hull);
    cylinder([-2.65, -.12, .05], .48, 2.95, m.steel);
    for (let i = 0; i < 9; i++) box([-2.65 + Math.cos(i * Math.PI * 2 / 9) * .46, -.12, .05 + Math.sin(i * Math.PI * 2 / 9) * .46], [.055, 2.1, .07], m.steel);
    ring([-2.65, 1.40, .05], .51, .07, m.hull, [Math.PI / 2, 0, 0]);
    tube([[-2.65, 1.35, -.1], [-2.3, 1.90, -.60], [-.8, .9, -.65]], .095, m.rubber, true);
    plate([[0, 0], [.8, .05], [1.1, .30], [.28, .58]], [1.1, -1.72, .8], .07, m.steel, [-Math.PI / 2, .08, -.2]);
    const staticBatches = batches;
    batches = new Map();
    const mount = new Group(); mount.matrixAutoUpdate = false; mount.matrix.copy(rotorPlacement); roomGroup.add(mount);
    const rotor = new Group(); rotor.name = 'guarded-slow-rotor'; mount.add(rotor);
    placement = new Matrix4();
    cylinder([0, 0, -.10], .38, .46, m.steel, [Math.PI / 2, 0, 0], false);
    for (let i = 0; i < 7; i++) {
      if (i === (sector + 2) % 7) continue; // a visible missing blade, no hazard logic
      const shape = new Shape(); shape.moveTo(.25, -.10); shape.bezierCurveTo(.8, -.40, 1.50, -.55, 1.77, -.20);
      shape.lineTo(1.50, .26); shape.quadraticCurveTo(.85, .05, .29, .18); shape.closePath();
      add(new ExtrudeGeometry(shape, { depth: .065, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 2, curveSegments: 10 }), m.steel, [0, 0, -.17], [0, 0, i * Math.PI * 2 / 7]);
    }
    flush(rotor); batches = staticBatches;
    rotors.push({ group: rotor, phase: sector * .7 }); placement = basePlacement;
  }
  function observation(sector: number) {
    // A metre-deep blind observation recess: black backing, inset steel frame,
    // near glass and forward ribs. All distant silhouettes are fixed structure.
    box([0, .45, -1.45], [6.7, 4.75, .24], m.rubber);
    for (const x of [-3.21, 3.21]) box([x, .45, -.82], [.18, 4.55, 1.16], m.steel);
    for (const y of [-1.73, 2.63]) box([0, y, -.82], [6.4, .14, 1.16], m.steel);
    for (const x of [-2.25, .55, 2.40]) box([x, .40, -1.15], [.075, 3.8, .10], m.steel);
    tube([[-2.9, -1.35, -1.12], [-1.1, -.75, -1.12], [1.8, .05, -1.12], [2.9, .35, -1.12]], .045, m.steel);
    box([0, .45, -.28], [6.3, 4.36, .095], blackGlass);
    for (const x of [-3.25, -1.65, 1.48, 3.25]) {
      tube([[x, -1.88, .0], [x * 1.02, -.6, .18], [x * .98, 1.8, .14], [x, 2.8, -.1]], .12, m.hull, true);
      for (const y of [-1.65, 2.5]) box([x, y, .10], [.36, .34, .20], m.steel);
    }
    for (const y of [-1.78, 2.7]) box([0, y, -.03], [6.65, .15, .30], m.hull);
    tube([[-3.2, -.8, .72], [0, -.8, .72], [3.2, -.8, .72]], .058, m.yellow, true);
    for (const x of [-3.0, 3.0]) tube([[x, -1.9, .72], [x, -.8, .72]], .065, m.steel, true);
    box([-2.50 + sector * .12, -1.20, .79], [.50, .18, .12], m.steel);
    for (const x of [-3.0, -1.4, 1.24, 3.0]) for (const y of [-1.45, .10, 1.65, 2.42]) {
      box([x, y, -.07], [.25, .18, .22], m.steel);
      cylinder([x, y, .08], .035, .04, m.steel, [Math.PI / 2, 0, 0], false);
    }
    box([2.66, .12, .17], [.63, .86, .31], m.hull);
    gauge([2.66, .25, .36], .19, -.85);
    tube([[2.65, -.34, .10], [2.75, -1.24, .15], [1.2, -1.56, .10], [-2.85, -1.52, .10]], .028, m.rubber);
  }
  function elevator(sector: number) {
    for (let i = 0; i < 3; i++) {
      const z = -.55 + i * .48;
      ring([0, .35, z], 2.08 - i * .12, .14, m.hull, [0, 0, 0], true);
      ring([0, .35, z + .12], 1.91 - i * .12, .035, m.steel);
    }
    box([0, .35, -.82], [3.3, 3.9, .14], m.hull);
    for (const x of [-2.8, 2.8]) {
      box([x, .35, -.2], [.25, 4.6, .6], m.hull);
      tube([[x, -1.8, -.0], [x, 2.65, -.0]], .055, m.steel);
    }
    box([0, -1.80, .12], [5.85, .24, 1.8], m.hull);
    // Architectural glyphs: ring, crossing bars and triple lines, physically inlaid.
    ring([-.76, .55, -.72], .26, .043, m.steel);
    for (const a of [-.70, .70]) box([.04, .55, -.72], [.58, .06, .07], m.steel, false, [0, 0, a]);
    for (const y of [.35, .55, .75]) box([.83, y, -.72], [.48, .045, .07], m.steel, false);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + sector * .025;
      box([Math.cos(a) * 2.10, .35 + Math.sin(a) * 2.10, -.35], [.13, .25, .12], i % 4 === 0 ? m.yellow : m.steel, false, [0, 0, a]);
    }
    for (const x of [-2.8, 2.8]) {
      for (const y of [-1.25, .05, 1.35]) {
        box([x, y, .20], [.54, .35, .35], m.steel);
        cylinder([x, y, .43], .12, .14, m.hull, [Math.PI / 2, 0, 0]);
      }
      tube([[x, -1.6, -.42], [x, 2.5, -.42], [x * .65, 2.7, -.48]], .055, m.rubber);
    }
    for (const x of [-1.3, 1.3]) cylinder([x, -1.5, .45], .13, .45, m.steel, [0, 0, 0]);
  }
  function serviceLayers(sector: number) {
    // Different working spaces, not a repeated plinth/console around every hero.
    // Architectural ceilings are provided by the main world integration.
    if (level.index === 5) {
      // Window instruments mount on the frame; leave its view unobstructed.
      box([-2.45, -1.50, .26], [1.00, .18, .50], m.hull);
      cylinder([-2.45, -1.22, .32], .12, .40, m.steel);
      cylinder([-2.45, -.99, .44], .16, .36, m.rubber, [Math.PI / 2, 0, 0]);
      return;
    }
    if (level.index === 6) {
      for (const x of [-1.15, 1.15]) {
        box([x, -1.91, 1.40], [.12, .12, 1.65], m.steel);
        for (const z of [.78, 1.34, 1.98]) box([x, -1.82, z], [.34, .05, .13], m.hull);
      }
      box([2.7, .60, .18], [.46, .88, .22], m.hull);
      for (const y of [.38, .6, .82]) box([2.7, y, .31], [.22, .045, .035], m.steel, false);
      return;
    }
    if (level.index === 1) {
      for (let i = 0; i < 5; i++) {
        const z = .9 + i * .22;
        tube([[-2.7, -1.62, z], [-1.4, -1.60, z], [1.6, -1.62, z], [2.5, -.84, z]], .075, i === 2 ? m.rubber : m.steel, true);
      }
      for (const x of [-2.2, .9]) box([x, -1.80, 1.32], [.22, .24, 1.30], m.hull);
      box([1.8, -1.64, .85], [.86, .28, .60], m.hull, true, [.05, .2, -.08]);
      return;
    }
    if (level.index === 2) {
      box([1.65, -1.63, 1.15], [1.55, .32, .74], m.steel);
      for (let i = 0; i < 3; i++) {
        const x = 1.15 + i * .45;
        cylinder([x, -.98, 1.15], .16, 1.05, m.hull);
        valve([x, -.43, 1.30], .12);
        tube([[x, -.45, 1.1], [x + .10, .04, .50], [x, .8, -.2]], .025, m.rubber);
      }
      return;
    }
    if (level.index === 3) {
      for (const x of [-2.5, -1.2, .25]) box([x, -1.82, 2.05], [1.10, .17, .85], m.steel, true, [.05, 0, x > 0 ? -.11 : 0]);
      tube([[-2.85, -1.72, 2.23], [-2.85, -.35, 2.23], [-1.5, -.34, 2.23], [-.65, -.70, 2.0]], .035, m.yellow, true);
      for (const x of [-2.4, -1.75]) cloth([x, -.59, 2.25], .24, .45, sector + x);
      return;
    }
    if (level.index === 4) {
      box([2.0, -1.67, 1.13], [1.70, .36, 1.22], m.steel);
      for (let i = 0; i < 7; i++) box([1.28 + i * .23, -1.475, 1.13], [.045, .035, 1.13], m.rubber, false);
      tube([[2.88, -1.49, 1.65], [2.88, -.19, 1.65], [2.88, -.19, .36]], .04, m.yellow, true);
      box([2.73, .30, .45], [.30, .62, .10], m.rubber);
      for (const y of [.1, .3, .5]) cylinder([2.73, y, .52], .047, .025, m.red, [Math.PI / 2, 0, 0], false);
      return;
    }
    const railZ = 2.12;
    for (const x of [-2.8, -.7, 2.9]) {
      cylinder([x, -1.16, railZ], .048, 1.55, m.steel);
      box([x, -1.92, railZ], [.26, .10, .28], m.steel);
    }
    tube([[-2.8, -.42, railZ], [-.7, -.42, railZ], [.15, -.42, railZ]], .042, m.yellow, true);
    tube([[1.35, -.42, railZ], [2.9, -.42, railZ], [2.9, -.42, .85]], .042, m.yellow, true);
    tube([[-2.8, -1.10, railZ], [-.7, -1.10, railZ]], .032, m.steel);
    const consoleX = 2.1 + sector * .08;
    box([consoleX, -1.06, 1.48], [.62, 1.7, .56], m.hull);
    box([consoleX, -.18, 1.45], [.86, .12, .69], m.steel, true, [.22, 0, 0]);
    box([consoleX, -.105, 1.52], [.56, .045, .38], m.rubber, false, [.22, 0, 0]);
    for (const dx of [-.23, -.08, .08]) cylinder([consoleX + dx, -.075, 1.71], .032, .022, dx < -.1 ? m.red : m.yellow, [0, 0, 0], false);
    tube([[consoleX, -1.55, 1.3], [consoleX + .5, -1.80, .8], [consoleX + .8, -1.45, -.8]], .032, m.rubber);
    if (level.index < 5) {
      box([1.9, -1.88, 1.25], [.95, .085, .56], m.hull, true, [.055, -.28 + sector * .10, .02]);
      for (const x of [1.60, 1.86, 2.12]) box([x, -1.81, 1.26], [.08, .026, .32], m.steel, false, [0, -.28, 0]);
    }
  }
  function captureMetadata(room: ExpeditionRoom, kind: 'hall' | 'entry' | 'entry-frame', colliderStart: number) {
    roomGroup.updateMatrixWorld(true);
    const b = new Box3().setFromObject(roomGroup);
    roomGroup.userData.landmarkBounds = b;
    metadata.push({ room: room.id, kind, name: NAMES[level.index],
      bounds: { min: b.min.toArray() as V3, max: b.max.toArray() as V3 },
      colliderStart, colliderCount: colliders.length - colliderStart });
  }
  const builders = [drill, manifold, chimneys, carousel, turbine, observation, elevator];
  const halls = level.rooms.filter(r => r.role === 'hall').sort((a, b) => a.sector - b.sector);
  if (halls.length !== 4) throw new Error('Expedition landmarks require exactly four sector halls');
  for (const room of halls) {
    currentRoom = room;
    const colliderStart = colliders.length;
    roomGroup = new Group(); roomGroup.name = `landmark-hall.${room.id}`; root.add(roomGroup);
    // Fixed placement keeps a margin from generic back-wall props and all cross lanes.
    const p: V3 = [room.x + 6.55, 0, room.z - 6.0];
    placement = matrix(p);
    builders[level.index](room.sector);
    serviceLayers(room.sector);
    flush(roomGroup);
    captureMetadata(room, 'hall', colliderStart);
    const position: V3 = [p[0], .45, p[2]];
    const view: V3 = [room.x + 1.05, .0, room.z - 1.1];
    const d = new Vector3(...position).sub(new Vector3(...view));
    anchors.push({ room: room.id, name: `${NAMES[level.index]} · ${room.sector + 1}`, position, view,
      yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
  }

  // A compact entry-room recognition specimen, not another generic cargo crate.
  const entry = level.rooms.find(r => r.id === level.startRoom)!;
  const entryColliderStart = colliders.length;
  currentRoom = entry; roomGroup = new Group(); roomGroup.name = `landmark-entry.${entry.id}`; root.add(roomGroup);
  placement = matrix([entry.x + 4.25, 0, entry.z - 4.25]);
  switch (level.index) {
    case 0:
      cylinder([0, -1.08, 0], .58, 1.45, m.steel, [0, 0, .17]);
      for (let i = 0; i < 6; i++) box([Math.cos(i) * .52, -.55, Math.sin(i) * .52], [.22, .35, .20], m.yellow);
      break;
    case 1:
      tube([[-.55, -1.8, 0], [-.55, -.2, 0], [.55, -.2, 0], [.55, -1.8, 0]], .16, m.hull, true); valve([0, -.25, .2], .42); break;
    case 2:
      cylinder([0, -.92, 0], .42, 1.8, mineral, [0, 0, .1], true, .15);
      for (const y of [-1.5, -1.1, -.7, -.3]) ring([0, y, 0], .49, .045, m.steel, [Math.PI / 2, 0, 0]); break;
    case 3:
      for (const x of [-.6, .6]) box([x, -.65, 0], [.06, 2.6, .06], m.steel);
      box([0, .65, 0], [1.3, .08, .10], m.hull); cloth([0, -.4, .06], .94, 1.8, 1.2); break;
    case 4:
      ring([0, -.55, 0], .90, .12, m.hull, [0, .18, -.1], true);
      for (let i = 0; i < 4; i++) box([0, -.55, .12], [1.6, .035, .04], m.steel, false, [0, 0, i * Math.PI / 4]); break;
    case 5:
      box([0, -.40, -.1], [1.6, 2.55, .12], m.rubber);
      box([0, -.40, -.02], [1.4, 2.3, .06], blackGlass);
      for (const x of [-.78, .78]) box([x, -.4, .02], [.085, 2.6, .12], m.hull); break;
    case 6:
      for (const z of [-.15, .16]) ring([0, -.45, z], .94, .08, m.hull, [0, 0, 0], true);
      for (const y of [-.65, -.45, -.25]) box([0, y, .19], [.65, .04, .05], m.steel, false); break;
  }
  flush(roomGroup);
  captureMetadata(entry, 'entry', entryColliderStart);

  // Entrance architecture follows the SAME first connected edge used by runtime
  // to aim the spawn camera. No invented portal, change to topology, or door leaf.
  const entryEdge = level.edges.find(e => e.from === entry.id || e.to === entry.id);
  if (entryEdge) {
    const destination = level.rooms.find(r => r.id === (entryEdge.from === entry.id ? entryEdge.to : entryEdge.from))!;
    const dx = destination.x - entry.x, dz = destination.z - entry.z;
    const distance = Math.hypot(dx, dz), alongX = Math.abs(dx) > Math.abs(dz);
    const threshold = (alongX ? entry.width : entry.depth) / 2;
    const doorDistance = distance / 2;
    const start = threshold - .50, finish = doorDistance - 3.4;
    const half = entryEdge.width / 2;
    const frameColliderStart = colliders.length;
    roomGroup = new Group(); roomGroup.name = `entry-frames.${entryEdge.id}`; root.add(roomGroup);
    const routeTransform = matrix([entry.x, 0, entry.z], [0, Math.atan2(dx, dz), 0]);
    placement = routeTransform;
    const frameNames = ['断焊黄吊轨', '圆弧汇流管框', '破损隔热夹层', '配给悬轨', '重型风道框', '弧形承压肋', '洁净气闸框'];
    // Dedicated corridor collision checks: the hall ±2.5 cross rule does not apply
    // inside a 4m corridor. A central 3.10m × 5.10m volume stays entirely open.
    const clear = new Box3(new Vector3(-1.55, -2, start - .8), new Vector3(1.55, 3.10, finish + .8));
    function frameSolid(b: Box3) {
      if (b.min.x < -half || b.max.x > half || b.min.y < -2.001 || b.max.y > 3.80
        || b.min.z < start - .8 || b.max.z > finish + .8 || b.intersectsBox(clear)) {
        throw new Error(`Entry frame violates route clearance: ${entryEdge!.id} ${b.min.toArray()} / ${b.max.toArray()}`);
      }
      const worldBounds = b.clone().applyMatrix4(routeTransform);
      if (reserved.some(r => r.intersectsBox(worldBounds))) throw new Error('Entry frame violates spawn/item approach');
      colliders.push(worldBounds);
    }
    function frameBox(p: V3, size: V3, material: MeshStandardMaterial, rotation: V3 = [0, 0, 0]) {
      const g = new RoundedBoxGeometry(...size, 2, Math.min(.035, ...size.map(v => v * .30)));
      const local = matrix(p, rotation); g.applyMatrix4(local); g.computeBoundingBox();
      frameSolid(g.boundingBox!.clone()); add(g, material);
    }
    function frameTube(points: V3[], radius: number, material: MeshStandardMaterial) {
      const curve = new CatmullRomCurve3(points.map(p => new Vector3(...p)));
      const count = Math.max(36, points.length * 8);
      const samples = curve.getPoints(count);
      for (let i = 1; i < samples.length; i++) frameSolid(new Box3().setFromPoints([samples[i - 1], samples[i]]).expandByScalar(radius + .008));
      add(new TubeGeometry(curve, count, radius, 8, false), material);
    }
    function upright(x: number, z: number, material = m.steel, height = 4.9) {
      frameBox([x, -1.95 + height / 2, z], [.16, height, .25], material);
      frameBox([x, -1.91, z], [.27, .16, .43], m.steel);
    }
    function arch(z: number, material: MeshStandardMaterial, radius: number) {
      const x = half - .18;
      frameTube([[-x, -1.85, z], [-x, 1.8, z], [-x + .025, 3.24, z], [-1.22, 3.53, z],
        [0, 3.57, z], [1.22, 3.53, z], [x - .025, 3.24, z], [x, 1.8, z], [x, -1.85, z]], radius, material);
    }
    for (let i = 0; i < 3; i++) {
      const z = start + (finish - start) * i / 2;
      const x = half - .19;
      switch (level.index) {
        case 0:
          for (const side of [-1, 1]) {
            upright(side * x, z, m.steel);
            frameBox([side * x, 2.93, z], [.27, .21, .44], m.steel);
          }
          // Two cut rail ends expose a gap rather than an implausible floating beam.
          frameBox([-.98, 3.28, z], [1.63, .22, .27], m.yellow, [0, 0, i === 1 ? -.075 : 0]);
          frameBox([1.05, 3.36, z], [1.46, .22, .27], m.yellow);
          frameTube([[-1.66, 3.60, z], [-.7, 3.42, z + .18], [.2, 3.27, z + .25], [1.6, 3.59, z]], .028, m.rubber);
          break;
        case 1:
          arch(z, m.hull, .095);
          arch(z + .30, m.steel, .045);
          for (const side of [-1, 1]) {
            frameBox([side * x, .75, z + .10], [.26, .32, .48], m.steel);
            frameBox([side * x, 2.46, z + .08], [.23, .15, .39], m.yellow);
          }
          break;
        case 2:
          for (const side of [-1, 1]) {
            upright(side * x, z, m.steel);
            for (let n = 0; n < 3; n++) frameBox([side * (half - .20), -.92 + n * 1.20, z], [.23, 1.04, .58], n === 1 && i === 1 ? m.rubber : m.hull, [0, side * .08, 0]);
          }
          frameBox([-.91, 3.44, z], [1.65, .30, .65], m.hull, [.10, 0, -.07]);
          frameBox([1.02, 3.52, z], [1.34, .20, .51], m.steel, [-.11, 0, .09]);
          break;
        case 3:
          for (const side of [-1, 1]) upright(side * x, z, m.hull);
          frameBox([0, 3.48, z], [3.70, .14, .25], m.steel);
          for (const side of [-1, 1]) {
            frameBox([side * .76, 3.29, z], [.30, .18, .38], m.steel);
            frameBox([side * 1.75, 1.91 - i * .11, z + .15], [.16, .52, .055], m.label);
          }
          break;
        case 4:
          for (const side of [-1, 1]) {
            frameBox([side * x, .65, z], [.23, 5.1, .70], m.steel);
            for (const y of [-1.55, -.5, .55, 1.6, 2.6]) frameBox([side * x, y, z + .37], [.25, .09, .08], m.hull);
          }
          frameBox([0, 3.45, z], [3.72, .40, .83], m.steel);
          for (let n = 0; n < 9; n++) frameBox([-1.48 + n * .37, 3.217, z], [.06, .035, .68], m.hull);
          break;
        case 5:
          arch(z, m.hull, .075);
          arch(z + .40, m.steel, .028);
          for (const side of [-1, 1]) for (const y of [-1.35, .2, 1.7]) frameBox([side * x, y, z + .12], [.24, .14, .48], m.steel);
          break;
        case 6:
          for (const side of [-1, 1]) {
            frameBox([side * x, .68, z], [.25, 5.25, .42], m.hull);
            frameBox([side * x, .68, z + .23], [.055, 4.9, .035], m.steel);
            frameBox([side * 1.76, 1.83, z + .23], [.13, .26, .06], m.yellow);
          }
          frameBox([0, 3.48, z], [3.72, .29, .42], m.hull);
          frameBox([0, 3.30, z + .15], [3.38, .045, .09], m.steel);
          break;
      }
    }
    // Longitudinal services make successive frames a connected structure.
    if (level.index === 0 || level.index === 3) {
      for (const x of level.index === 3 ? [-.76, .76] : [-1.70]) {
        frameBox([x, 3.63, (start + finish) / 2], [.10, .12, finish - start + .55], level.index === 0 ? m.yellow : m.steel);
      }
    } else if (level.index === 1 || level.index === 5) {
      for (const side of [-1, 1]) frameTube([[side * (half - .17), 2.25, start - .2], [side * (half - .17), 2.25, finish + .25]], .048, m.steel);
    }
    flush(roomGroup);
    captureMetadata(entry, 'entry-frame', frameColliderStart);
    metadata[metadata.length - 1].name = frameNames[level.index];
    roomGroup.userData.edge = entryEdge.id;
    roomGroup.userData.destination = destination.id;
    roomGroup.userData.clearance = { width: 3.10, floor: -2, ceiling: 3.10, doorClearance: 2.60 };
  }
  let disposed = false;
  return {
    root, colliders, anchors,
    update(time) {
      if (disposed || !Number.isFinite(time)) return;
      for (const rotor of rotors) rotor.group.rotation.z = rotor.phase + time * .075;
    },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const g of geometries) g.dispose(); geometries.clear();
      for (const material of ownedMaterials) material.dispose();
      rotors.length = 0; colliders.length = 0; anchors.length = 0;
    },
  };
}
