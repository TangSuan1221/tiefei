import {
  Box3, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry,
  DoubleSide, Euler, ExtrudeGeometry, Group, Matrix4, Mesh, MeshStandardMaterial,
  Path, PlaneGeometry, Quaternion, Shape, SphereGeometry, SRGBColorSpace,
  TubeGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];

/** Metres, Y up, rear toward -Z. Shared materials remain owned by the caller. */
export function createReferenceRoom(materials: ReferenceMaterials): {
  root: Group; update(time: number): void; dispose(): void; colliders: Box3[];
} {
  const root = new Group();
  root.name = 'reference-industrial-compartment';
  const colliders: Box3[] = [];
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const ownedGeometry: BufferGeometry[] = [];
  const ownedMaterials: MeshStandardMaterial[] = [];
  const textures: CanvasTexture[] = [];
  const transform = new Matrix4();
  const quaternion = new Quaternion();
  const unit = new Vector3(1, 1, 1);
  const m = materials;
  // Apply assembly changes before material batching, including their collision bounds.
  let assemblyTransform: Matrix4 | undefined;
  // Rotate about the visible right-front corner, sending the left corner deeper.
  const crateAssemblyTransform = new Matrix4().makeTranslation(-.18, 0, .72)
    .multiply(new Matrix4().makeRotationY(-.65))
    .multiply(new Matrix4().makeTranslation(.20, 0, -1.225));
  // Scale every crate part about its transformed center, then move left/back/down.
  // Keep the existing yaw so the left-front corner remains visible in the preview.
  const crateCenter = new Vector3(-1.35, -1.12, .6).applyMatrix4(crateAssemblyTransform);
  crateAssemblyTransform.premultiply(new Matrix4()
    .makeTranslation(crateCenter.x - .33, crateCenter.y - .17, crateCenter.z - .50)
    .multiply(new Matrix4().makeScale(.8, .8, .8))
    .multiply(new Matrix4().makeTranslation(-crateCenter.x, -crateCenter.y, -crateCenter.z)));
  const rackAssemblyTransform = new Matrix4().makeTranslation(0, -1.635, 0)
    .multiply(new Matrix4().makeScale(1, 1 - .7 / 3.17, 1))
    .multiply(new Matrix4().makeTranslation(0, 1.635, 0));
  const hatchAssemblyTransform = new Matrix4().makeTranslation(-.525, 0, 0)
    .multiply(new Matrix4().makeScale(1 + .4 / 2.35, 1, 1))
    .multiply(new Matrix4().makeTranslation(.525, 0, 0));

  function add(g: BufferGeometry, material: MeshStandardMaterial, p: V3, r: V3 = [0, 0, 0]) {
    quaternion.setFromEuler(new Euler(...r));
    transform.compose(new Vector3(...p), quaternion, unit);
    g.applyMatrix4(transform);
    if (assemblyTransform) g.applyMatrix4(assemblyTransform);
    // Normalize attributes/indexing so boxes, tubes, spheres and extrusions can share a draw.
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    for (const key of Object.keys(flat.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    }
    flat.clearGroups();
    const bucket = batches.get(material) ?? [];
    bucket.push(flat);
    batches.set(material, bucket);
  }
  function box(p: V3, s: V3, material: MeshStandardMaterial, radius = .025, r: V3 = [0, 0, 0]) {
    add(new RoundedBoxGeometry(...s, 2, Math.min(radius, ...s.map(v => v * .45))), material, p, r);
  }
  function obstacle(p: V3, s: V3) {
    const bounds = new Box3().setFromCenterAndSize(new Vector3(...p), new Vector3(...s));
    if (assemblyTransform) bounds.applyMatrix4(assemblyTransform);
    colliders.push(bounds);
  }
  function pipe(points: V3[], radius: number, material: MeshStandardMaterial, segments = 32) {
    add(new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), segments, radius, 8, false), material, [0, 0, 0]);
  }
  function bolt(x: number, y: number, z: number, radius = .024) {
    add(new CylinderGeometry(radius, radius, .017, 6), m.steel, [x, y, z], [Math.PI / 2, 0, 0]);
    box([x, y, z + .010], [radius * 1.1, .005, .004], m.rubber, .001);
  }
  function rounded<T extends Path>(path: T, w: number, h: number, radius: number): T {
    const x = -w / 2, y = -h / 2, r = radius;
    path.moveTo(x + r, y);
    path.lineTo(x + w - r, y);
    path.quadraticCurveTo(x + w, y, x + w, y + r);
    path.lineTo(x + w, y + h - r);
    path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    path.lineTo(x + r, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    return path;
  }
  function frame(w: number, h: number, thickness: number, radius: number, depth: number, z: number, material: MeshStandardMaterial) {
    const shape = rounded(new Shape(), w, h, radius);
    shape.holes.push(rounded(new Path(), w - thickness * 2, h - thickness * 2, Math.max(.05, radius - thickness)));
    add(new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .018, bevelThickness: .018, curveSegments: 12 }), material, [.65, 0, z]);
  }

  // Ivory pressure hull, with physical panel gaps and exposed corner ribs.
  box([0, -1.74, -.75], [7, .12, 7.5], m.floor);
  obstacle([0, -1.74, -.75], [7, .12, 7.5]);
  for (const side of [-1, 1]) {
    box([side * 3.44, .35, -.75], [.12, 4.3, 7.5], m.hull);
    obstacle([side * 3.44, .35, -.75], [.12, 4.3, 7.5]);
    for (let j = 0; j < 5; j++) {
      const z = -3.73 + j * 1.47;
      for (let row = 0; row < 2; row++) {
        box([side * 3.355, -.65 + row * 1.91, z], [.05, 1.86, 1.42], m.hull);
      }
      box([side * 3.28, .30, z - .72], [.13, 4, .075], m.steel);
    }
    pipe([[side * 3.23, -1.58, 2.8], [side * 3.23, -1.58, -3.6], [side * 3.05, -1.45, -4.18]], .055, m.steel);
  }
  box([0, 2.44, -.75], [7, .12, 7.5], m.hull);
  obstacle([0, 2.44, -.75], [7, .12, 7.5]);
  box([0, .35, -4.44], [7, 4.3, .12], m.hull);
  obstacle([0, .35, -4.44], [7, 4.3, .12]);
  for (let i = 0; i < 7; i++) {
    const x = -3 + i;
    box([x, .35, -4.335], [.975, 4.07, .07], m.hull);
    for (const y of [-1.52, .36, 2.22]) for (const dx of [-.4, .4]) bolt(x + dx, y, -4.28, .021);
  }
  for (const z of [-3.8, -1.9, .1, 2.1]) {
    box([0, 2.29, z], [6.65, .18, .13], m.hull);
    box([0, -1.661, z], [6.65, .024, .045], m.steel, .005);
  }
  for (let i = 0; i < 18; i++) {
    box([2.25, -1.661, -3.6 + i * .34], [1.25, .016, .022], m.rubber, .003);
  }

  // Hatch widened to 2.75 m, preserving its nominal left edge at X -.525.
  assemblyTransform = hatchAssemblyTransform;
  box([.65, 0, -4.10], [2.17, 2.94, .14], m.rubber, .25);
  // Recessed dark jamb joins the backing, behind the exposed tapered opening.
  box([1.47, -.05, -3.99], [.075, 2.30, .24], m.rubber, .025);
  frame(2.35, 3.1, .22, .53, .15, -3.85, m.yellow);
  frame(1.94, 2.68, .065, .34, .12, -3.89, m.steel);
  frame(1.82, 2.56, .035, .29, .08, -3.90, m.rubber);
  obstacle([.65, 0, -3.94], [2.4, 3.15, .42]);
  for (const x of [-.405, 1.705]) for (const y of [-1.02, -.64, -.26, .12, .5, .87]) bolt(x, y, -3.675);
  for (const x of [-.03, .31, .65, .99, 1.33]) for (const y of [-1.44, 1.44]) bolt(x, y, -3.675);
  for (const y of [-.87, .56]) {
    box([1.88, y, -3.76], [.22, .29, .16], m.steel);
    add(new CylinderGeometry(.065, .065, .34, 12), m.steel, [1.9, y, -3.65]);
    box([1.75, y, -3.65], [.23, .085, .065], m.yellow);
  }
  for (const y of [-.6, -.05]) box([-.60, y, -3.62], [.11, .08, .22], m.yellow);
  pipe([[-.60, -.6, -3.51], [-.67, -.53, -3.44], [-.67, -.12, -3.44], [-.60, -.05, -3.51]], .037, m.steel);
  box([.65, -1.55, -3.53], [2.35, .10, .44], m.yellow);
  for (let i = 0; i < 9; i++) box([-.32 + i * .24, -1.494, -3.53], [.11, .008, .36], m.rubber, .002, [0, -.35, 0]);

  // Independent curved folds fade across the sheet instead of repeating a chevron.
  const clothGeometry = new PlaneGeometry(1, 1, 80, 104);
  const positions = clothGeometry.attributes.position;
  const clothRest = new Float32Array(positions.count * 3);
  const clothFree = new Float32Array(positions.count);
  // Independent finite tension fields: origin U/V, slope, curvature, length,
  // width and signed displacement. No repeating wave or shared V-shaped apex.
  const tensionFields = [
    [.035, .02, .23, .35, .19, .012, .029],
    [.065, .04, .62, -.28, .24, .020, -.022],
    [.11, .015, 1.12, -.62, .14, .016, .021],
    [.96, .02, -.31, -.28, .22, .014, .026],
    [.925, .055, -.77, .45, .19, .019, -.020],
    [.85, .045, -1.23, .24, .13, .022, .017],
    [.12, .28, .45, .65, .16, .020, .037],
    [.065, .46, -.24, .75, .13, .017, -.028],
    [.17, .59, .67, -.35, .18, .030, .040],
    [.075, .76, -.36, .62, .15, .022, .032],
    [.40, .73, -.75, .45, .17, .057, .062],
    [.64, .84, -.43, -.38, .12, .045, -.045],
    [.24, .91, .26, .68, .10, .035, .039],
  ];
  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i) + .5;
    const v = .5 - positions.getY(i);
    const middle = Math.sin(Math.PI * u);
    const leftEdge = Math.exp(-u * 18), rightEdge = Math.exp(-(1 - u) * 20);
    const x = .65 + (u - .5) * (1.79 - .08 * v)
      - .13 * Math.sin(Math.PI * v) * middle
      + .035 * Math.sin(v * 8.1) * v * leftEdge
      - .044 * Math.sin(v * 5.3 + .6) * v * rightEdge
      // Leave the upper attachments fixed in X; draw the free right edge inward.
      // Widen the lower opening beyond the metal seal into the dark recess.
      - .055 * v - .34 * u ** 3 * Math.sin(v * Math.PI / 2)
      + .035 * Math.sin(u * 10 + .8) * v ** 6;
    const top = 1.25 - .22 * middle + .035 * u * middle;
    const y = top - v * (2.55 - .13 * middle)
      + (.048 * Math.exp(-(((u - .16) / .14) ** 2))
        - .065 * Math.exp(-(((u - .55) / .27) ** 2))
        + .065 * u * u - .025) * v ** 7;
    let folds = 0;
    // Curve, width, amplitude and lateral envelope differ for each tension ridge.
    for (const [curve, width, height, envelope] of [
      [.24 + .21 * u - .40 * u * u, .047, .080, Math.exp(-(((u - .58) / .47) ** 2))],
      [.59 - .43 * u + .055 * Math.sin(u * 3.7), .069, .155, Math.exp(-(((u - .70) / .45) ** 2))],
      [.77 - .17 * u - .25 * u * u, .083, .105, Math.exp(-(((u - .37) / .40) ** 2))],
      [.85 - .22 * u + .14 * u * u, .070, .083, Math.exp(-(((u - .29) / .26) ** 2))],
      [.98 - .23 * u - .10 * u * u, .090, .067, Math.exp(-(((u - .64) / .28) ** 2))],
    ]) {
      const d = v - curve;
      folds += envelope * height * (Math.exp(-((d / width) ** 2))
        - .26 * Math.exp(-(((d - width * 1.5) / (width * 1.6)) ** 2)));
    }
    let fineTension = 0;
    for (const [originU, originV, slope, bend, length, width, amplitude] of tensionFields) {
      const along = v - originV;
      const across = u - originU - slope * along - bend * along * along;
      const envelope = Math.exp(-((along / length) ** 2));
      fineTension += amplitude * envelope * (Math.exp(-((across / width) ** 2))
        - .36 * Math.exp(-(((across - width * 1.6) / (width * 1.5)) ** 2)));
    }
    const edgeTurn = (leftEdge * (.025 * Math.sin(v * 13 + .7) - .029)
      + rightEdge * (.018 * Math.sin(v * 9) - .035)) * Math.sin(v * Math.PI);
    const belly = .19 * Math.exp(-(((u - .34) / .39) ** 2) - ((v - .65) / .36) ** 2);
    const z = -3.68 + .07 * middle + belly
      + folds * (.35 + .65 * middle) * Math.min(1, v * 12)
      + fineTension * (1 - Math.exp(-v * 45))
      + edgeTurn + .008 * Math.sin(u * 8 + v * 5) * v
      + (.055 * Math.exp(-(((u - .19) / .16) ** 2))
        - .045 * Math.exp(-(((u - .53) / .22) ** 2)) + .055 * u * u) * v ** 9;
    const point = new Vector3(x, y, z).applyMatrix4(hatchAssemblyTransform);
    positions.setXYZ(i, point.x, point.y, point.z);
    clothRest.set(point.toArray(), i * 3);
    clothFree[i] = v * (.3 + .7 * middle);
  }
  clothGeometry.computeVertexNormals();
  const clothMaterial = m.cloth.clone();
  clothMaterial.side = DoubleSide;
  clothMaterial.normalScale.multiplyScalar(.70);
  clothMaterial.roughness = 1;
  ownedMaterials.push(clothMaterial);
  const clothMesh = new Mesh(clothGeometry, clothMaterial);
  clothMesh.name = 'slack-pressure-hatch-drape';
  clothMesh.castShadow = true;
  clothMesh.receiveShadow = true;
  // Animated displacement stays inside this fixed conservative bound.
  clothGeometry.computeBoundingBox();
  clothGeometry.boundingBox!.expandByScalar(.06);
  clothGeometry.computeBoundingSphere();
  clothGeometry.boundingSphere!.radius += .06;
  root.add(clothMesh);
  ownedGeometry.push(clothGeometry);
  for (const x of [-.245, 1.545]) {
    box([x, 1.26, -3.66], [.08, .09, .045], m.steel, .009);
    bolt(x, 1.27, -3.63, .018);
  }
  assemblyTransform = undefined;

  // Open left equipment rack, positioned behind the foreground cargo case.
  assemblyTransform = rackAssemblyTransform;
  const rackX = -2.32, rackZ = -2.39;
  for (const x of [-3.20, -1.44]) for (const z of [-2.94, -1.84]) {
    box([x, -.05, z], [.075, 3.17, .075], m.steel, .012);
    box([x, -1.61, z], [.19, .045, .19], m.steel);
  }
  obstacle([rackX, -.06, rackZ], [1.91, 3.22, 1.25]);
  for (const y of [-1.49, -.56, .37, 1.30]) {
    box([rackX, y, rackZ], [1.88, .065, 1.19], m.steel);
    box([rackX, y + .075, -1.80], [1.88, .12, .04], m.steel, .008);
    for (let j = 0; j < 12; j++) box([-3.14 + j * .15, y + .075, -1.775], [.068, .028, .007], m.rubber, .008);
  }
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    const index = row * 2 + col;
    const dimensions: V3[] = [[.40, .26, .43], [.35, .34, .38], [.43, .22, .46], [.34, .30, .42], [.36, .32, .40], [.43, .23, .38]];
    const [sx, sy, sz] = dimensions[index];
    const yaw = [-.28, .38, .15, -.42, -.18, .31][index];
    const tilt = [.09, -.16, -.07, .12, -.12, .06][index];
    const center = new Vector3(-2.79 + col * .87 + .035 * Math.sin(index * 3),
      -1.455 + row * .93 + sy + .025, -2.29 + .065 * Math.cos(index * 2));
    assemblyTransform = rackAssemblyTransform.clone().multiply(new Matrix4().compose(center,
      new Quaternion().setFromEuler(new Euler(.035 * Math.sin(index), yaw, tilt)), unit));
    const bag = new SphereGeometry(1, 20, 14);
    const vertices = bag.attributes.position;
    for (let j = 0; j < vertices.count; j++) {
      const vx = vertices.getX(j), vy = vertices.getY(j), vz = vertices.getZ(j);
      const wrinkle = 1 + .035 * Math.sin(vy * 15 + vx * 7 + index) * Math.sin(vz * 11 + index * .7);
      const slump = 1 - .12 * Math.max(0, vy) * (1 + vx);
      vertices.setXYZ(j, vx * sx * wrinkle * slump,
        vy * sy * wrinkle - .025 * vx * vx * Math.max(0, vy), vz * sz * wrinkle);
    }
    bag.computeVertexNormals();
    add(bag, m.rubber, [0, 0, 0]);
    pipe([[-sx * .65, sy * .45, sz * .70], [0, sy * .86, sz * .54], [sx * .65, sy * .45, sz * .70]], .007, m.steel, 14);
    pipe([[-.12, sy * .80, 0], [-.10, sy + .10, -.035], [.13, sy + .09, -.02], [.16, sy * .75, 0]], .023, m.rubber, 14);
    const tail = index % 2 ? .27 : .38;
    box([.13, -.11, sz * .92], [.068, tail, .027], m.rubber, .012, [0, 0, -.12 + index * .05]);
    box([.13, -.06, sz * .96], [.082, .075, .017], m.steel, .008);
    assemblyTransform = undefined;
  }

  // Rounded, ribbed ivory crate, with continuous red webbing around lid and body.
  // Named assembly transform moves all geometry and the collider before batching.
  assemblyTransform = crateAssemblyTransform;
  const cx = -1.35, cy = -1.12, cz = .6;
  box([cx, cy, cz], [2.3, .95, 1.25], m.hull, .11);
  obstacle([cx, cy, cz], [2.3, .95, 1.25]);
  box([cx, -.765, cz], [2.315, .027, 1.265], m.rubber, .045);
  box([cx, -.704, cz], [2.3, .12, 1.25], m.hull, .07);
  box([cx, -.631, cz], [1.91, .038, .91], m.hull, .028);
  for (const x of [cx - .98, cx + .98]) {
    box([x, -.625, cz], [.09, .068, 1.08], m.hull);
    for (const z of [cz - .58, cz + .58]) box([x, -1.13, z], [.14, .79, .12], m.hull, .04);
  }
  // Thin fabric ribbons lie on the lid, with slight slack and curled edges.
  function topStrap(x: number, z: number, length: number, width: number, across: boolean) {
    const geometry = new PlaneGeometry(1, 1, 48, 6);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const t = vertices.getX(i), edge = vertices.getY(i);
      const offset = edge * width + .004 * Math.sin((t + .5) * 7);
      const lift = .004 * Math.sin((t + .5) * Math.PI)
        + .003 * (edge * 2) ** 2 * Math.sin(t * 9 + .6);
      vertices.setXYZ(i, x + (across ? t * length : offset),
        (across ? -.588 : -.596) + lift, z + (across ? offset : t * length));
    }
    geometry.computeVertexNormals();
    add(geometry, m.red, [0, 0, 0]);
  }
  for (const x of [cx - .59, cx + .59]) {
    topStrap(x, cz, 1.16, .16, false);
    for (const z of [cz - .625, cz + .625]) {
      box([x, -1.115, z], [.16, .85, .008], m.red, .003);
      pipe([[x, -.606, z > cz ? 1.15 : .05], [x, -.65, z], [x, -.77, z]], .012, m.red, 10);
    }
    box([x, -1.596, cz], [.16, .02, 1.18], m.red, .007);
    box([x, -.91, 1.25], [.23, .20, .065], m.steel, .022);
    box([x, -.91, 1.289], [.135, .115, .02], m.rubber, .012);
    box([x, -.91, 1.307], [.11, .026, .015], m.red, .004);
  }
  topStrap(cx, cz, 1.32, .10, true);
  for (const x of [cx - .90, cx + .90]) {
    box([x, -.85, 1.255], [.16, .18, .055], m.steel);
    bolt(x, -.85, 1.29, .021);
  }
  box([cx, -1.13, 1.24], [.50, .20, .034], m.rubber, .04);
  pipe([[cx -.20, -1.12, 1.27], [cx -.18, -1.04, 1.32], [cx + .18, -1.04, 1.32], [cx + .20, -1.12, 1.27]], .032, m.steel, 14);
  assemblyTransform = undefined;

  // Overhead services: rigid pipes, couplings, cable loops and suspended enclosure.
  for (let i = 0; i < 4; i++) {
    const x = -2.60 + i * .34;
    pipe([[x, 2.39, 2.85], [x, 2.15, 2.67], [x, 2.12, -.5], [x, 2.12, -3.55], [x + .12, 1.97, -4.12], [x + .12, 1.97, -4.33]], i === 0 ? .10 : .049, i === 0 ? m.hull : m.steel);
    add(new CylinderGeometry(.13, .13, .045, 12), m.steel, [x + .12, 1.97, -4.29], [Math.PI / 2, 0, 0]);
    for (const z of [-3.1, -1.3, .6, 2.3]) {
      add(new CylinderGeometry(i === 0 ? .122 : .066, i === 0 ? .122 : .066, .095, 12), m.steel, [x, 2.12, z], [Math.PI / 2, 0, 0]);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = -.98 + i * .32;
    pipe([[x, 2.39, 2.8], [x, 2.26, 2.65], [x + .14, 2.12, .7], [x -.15, 1.97 - (i % 2) * .16, -1.4], [x + .18, 2.14, -2.7], [x + .36, 1.90, -4.12], [x + .36, 1.90, -4.33]], .016 + (i % 3) * .007, m.rubber, 48);
    box([x + .36, 1.9, -4.27], [.09, .09, .09], m.steel, .018);
  }
  box([.1, 2.11, -2.4], [1.24, .30, .85], m.hull, .055);
  box([.1, 1.95, -2.4], [.88, .025, .52], m.steel);
  for (let i = 0; i < 10; i++) box([-.24 + i * .075, 1.933, -2.4], [.028, .01, .40], m.rubber, .003);
  pipe([[2.65, 2.39, 2.7], [2.65, 2.12, 2.5], [2.65, 2.12, -2.7], [2.65, 1.89, -3.83], [2.65, .8, -4.12], [2.65, -1.3, -4.12], [2.65, -1.43, -4.33]], .084, m.steel, 48);
  pipe([[1.32, 2.39, -2.7], [1.32, 2.16, -2.8], [1.45, 1.65, -3.8], [1.73, 1.64, -4.08], [1.91, 2.15, -4.12], [1.91, 2.22, -4.33]], .064, m.rubber);
  for (const [x, y] of [[2.65, -1.43], [1.91, 2.22]]) {
    add(new CylinderGeometry(.12, .12, .065, 12), m.steel, [x, y, -4.28], [Math.PI / 2, 0, 0]);
  }

  // Rear control boxes and right-side service manifold.
  box([-1.12, .54, -4.10], [.51, .70, .29], m.steel);
  box([-1.12, .55, -3.94], [.42, .59, .035], m.hull);
  box([2.53, .13, -4.12], [.75, 1.15, .30], m.hull);
  box([2.53, .38, -3.953], [.49, .35, .044], m.rubber);
  box([2.53, .38, -3.925], [.40, .26, .013], m.glass, .018);
  for (let i = 0; i < 3; i++) {
    add(new CylinderGeometry(.046, .046, .045, 14), i === 2 ? m.red : m.steel, [2.31 + i * .22, -.09, -3.93], [Math.PI / 2, 0, 0]);
  }
  for (const x of [2.26, 2.8]) for (const y of [-.33, .6]) bolt(x, y, -3.94, .021);
  for (let i = 0; i < 4; i++) {
    const x = 2.10 + i * .23;
    pipe([[x, -.49, -4.1], [x, -.70, -4.04], [x + .06, -1.4, -4.03]], .033, m.steel, 16);
    box([x, -.86, -3.98], [.13, .11, .10], m.rubber);
    box([x, -.86, -3.89], [.17, .036, .04], m.red, .008, [0, 0, .3]);
  }

  // One shared label atlas: sharp readable decals without a material per sign.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const signs = [
        ['#e6bc28', '#1b2526', '⚠  CAUTION', 'PRESSURE DOOR • KEEP CLEAR'],
        ['#254858', '#e4ece9', 'COMPARTMENT 04', 'EQUALIZE BEFORE OPENING'],
        ['#dadbd0', '#273533', 'SURVIVAL EQUIPMENT', 'DRY STOWAGE / 026–B'],
        ['#812c24', '#efe5d5', 'DANGER', 'ISOLATE BEFORE SERVICING'],
      ];
      signs.forEach(([bg, fg, a, b], i) => {
        const y = i * 128;
        ctx.fillStyle = bg; ctx.fillRect(0, y, 1024, 128);
        ctx.strokeStyle = fg; ctx.lineWidth = 5; ctx.strokeRect(10, y + 9, 1004, 110);
        ctx.fillStyle = fg; ctx.textAlign = 'center';
        ctx.font = 'bold 43px sans-serif'; ctx.fillText(a, 512, y + 55);
        ctx.font = '24px monospace'; ctx.fillText(b, 512, y + 94);
      });
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      textures.push(texture);
      const material = m.label.clone();
      material.map = texture;
      material.color.set(0xffffff);
      material.roughness = .8;
      ownedMaterials.push(material);
      const sign = (row: number, p: V3, w: number, h: number) => {
        const g = new PlaneGeometry(w, h);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1) / 4 + uv.getY(i) / 4);
        add(g, material, p);
      };
      assemblyTransform = hatchAssemblyTransform;
      sign(1, [.65, 1.42, -3.671], .58, .115);
      assemblyTransform = undefined;
      sign(0, [-.83, 1.77, -4.277], .51, .23);
      assemblyTransform = crateAssemblyTransform;
      sign(2, [cx, -1.37, 1.236], .59, .16);
      assemblyTransform = undefined;
      sign(3, [2.53, -.32, -3.947], .40, .12);
      assemblyTransform = rackAssemblyTransform;
      sign(2, [-2.32, 1.378, -1.772], .58, .095);
      assemblyTransform = undefined;
    }
  }

  for (const [material, pieces] of batches) {
    const merged = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (!merged) throw new Error('Reference room geometry merge failed');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const mesh = new Mesh(merged, material);
    mesh.name = `room-static-${material.name || ownedGeometry.length}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    ownedGeometry.push(merged);
  }
  batches.clear();
  let disposed = false;
  return {
    root,
    colliders,
    update(time: number) {
      if (disposed || !Number.isFinite(time)) return;
      for (let i = 0; i < positions.count; i++) {
        const j = i * 3, free = clothFree[i];
        positions.setXYZ(i,
          clothRest[j] + .008 * free * Math.sin(time * .53 + clothRest[j + 1] * 2.3),
          clothRest[j + 1],
          clothRest[j + 2] + free * (.018 * Math.sin(time * .72 + clothRest[j] * 3.4 + clothRest[j + 1] * 2)
            + .006 * Math.sin(time * 1.1 + clothRest[j + 1] * 6)));
      }
      positions.needsUpdate = true;
      clothGeometry.computeVertexNormals();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      for (const geometry of ownedGeometry) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
