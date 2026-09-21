import * as THREE from 'three';
import type { ReferenceMaterials } from './deepsea/reference-materials';

type Point = [number, number, number];

/** Static, metre-scale dressing for CabinThree. Call once after the cabin is built.
 * All geometry stays outside x[-.42,.42], z[-.85,1.3], including overhead details.
 * No lights, interaction targets, shared-material mutations, or animation hooks.
 */
export function addCabinDressing(scene: THREE.Scene, materials: ReferenceMaterials): void {
  if (scene.getObjectByName('cabin-dressing')) return;
  const root = new THREE.Group();
  root.name = 'cabin-dressing';
  const m = materials;
  const oxidized = new THREE.MeshStandardMaterial({ color: 0x554638, roughness: .96, metalness: .35 });
  const repair = new THREE.MeshStandardMaterial({ color: 0x414b46, roughness: .91, metalness: .48 });
  const weld = new THREE.MeshStandardMaterial({ color: 0x777c70, roughness: .7, metalness: .75 });

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, at: Point) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...at);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent: THREE.Object3D, size: Point, at: Point, material: THREE.Material) {
    return mesh(parent, new THREE.BoxGeometry(...size), material, at);
  }
  function tube(parent: THREE.Object3D, points: Point[], radius: number, material: THREE.Material) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    return mesh(parent, new THREE.TubeGeometry(path, 28, radius, 7, false), material, [0, 0, 0]);
  }
  function group(name: string, at: Point, yaw = 0) {
    const object = new THREE.Group();
    object.name = name;
    object.position.set(...at);
    object.rotation.y = yaw;
    root.add(object);
    return object;
  }
  // Each authored wall assembly uses local +Z as its inward-facing normal.
  function bolt(parent: THREE.Object3D, x: number, y: number, z: number) {
    const head = mesh(parent, new THREE.CylinderGeometry(.009, .009, .008, 6), m.steel, [x, y, z]);
    head.rotation.x = Math.PI / 2;
  }

  // One small atlas: faded paint rather than emissive UI. Geometry UVs select cells.
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#aaa88c'; ctx.fillRect(0, 0, 512, 512);
    const labels = [ ['AUX / O2', 'ISOLATE BEFORE SERVICE'], ['PATCH 07', 'SEAL CHECK / 184 m'],
      ['RETURN AIR', 'KEEP GRILLE CLEAR'], ['DOGS LOCKED', 'EQUALIZE BEFORE OPEN'] ];
    labels.forEach(([title, subtitle], i) => {
      const x = (i % 2) * 256, y = Math.floor(i / 2) * 128;
      ctx.strokeStyle = '#444a40'; ctx.lineWidth = 3; ctx.strokeRect(x + 9, y + 12, 238, 104);
      ctx.fillStyle = '#343c35'; ctx.font = 'bold 26px monospace'; ctx.fillText(title, x + 19, y + 54);
      ctx.font = '12px monospace'; ctx.fillText(subtitle, x + 19, y + 83);
    });
    // Gauge cell occupies the lower-left quadrant, including its painted needle.
    ctx.fillStyle = '#c1bea2'; ctx.fillRect(0, 256, 256, 256);
    ctx.strokeStyle = '#303a34'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(128, 384, 108, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * .75 + i / 24 * Math.PI * 1.5;
      const r = i % 4 === 0 ? 79 : 91;
      ctx.beginPath(); ctx.moveTo(128 + Math.cos(a) * r, 384 + Math.sin(a) * r);
      ctx.lineTo(128 + Math.cos(a) * 100, 384 + Math.sin(a) * 100); ctx.stroke();
    }
    ctx.strokeStyle = '#884d36'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(128, 384, 94, -.65, .55); ctx.stroke();
    ctx.strokeStyle = '#333d36'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(116, 397); ctx.lineTo(179, 321); ctx.stroke();
    ctx.fillStyle = '#343c35'; ctx.font = 'bold 18px monospace'; ctx.fillText('bar', 111, 440);
    // Deterministic chips and grime; no random changes between cabin rebuilds.
    for (let i = 0; i < 680; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(44,40,31,.14)' : 'rgba(205,199,163,.42)';
      ctx.fillRect((i * 73 + 19) % 512, (i * 137 + 41) % 512, 1 + i % 5, 1 + i % 2);
    }
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  const printed = new THREE.MeshStandardMaterial({ map: atlas, roughness: .94, metalness: .05 });
  // CabinThree disposes mesh materials, but does not discover their textures.
  printed.addEventListener('dispose', () => atlas.dispose());
  function print(parent: THREE.Object3D, width: number, height: number, at: Point, cell: number, round = false) {
    const geometry = round ? new THREE.CircleGeometry(width / 2, 32) : new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute('uv');
    const left = round ? 0 : (cell % 2) * .5;
    const bottom = round ? 0 : 1 - (Math.floor(cell / 2) + 1) * .25;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, left + uv.getX(i) * .5, bottom + uv.getY(i) * (round ? .5 : .25));
    const face = mesh(parent, geometry, printed, at);
    face.castShadow = false;
    return face;
  }

  const manifold = group('auxiliary-pressure-manifold', [-1.077, 1.72, -.26], Math.PI / 2);
  box(manifold, [.66, .22, .035], [0, 0, 0], repair);
  for (const x of [-.19, .03]) {
    const body = mesh(manifold, new THREE.CylinderGeometry(.074, .074, .065, 24), m.steel, [x, .015, .05]);
    body.rotation.x = Math.PI / 2;
    const rim = mesh(manifold, new THREE.TorusGeometry(.063, .008, 6, 24), oxidized, [x, .015, .088]);
    rim.name = 'gauge-retaining-ring';
    print(manifold, .116, .116, [x, .015, .09], 0, true);
    tube(manifold, [[x, -.06, .045], [x, -.13, .05], [x + .07, -.16, .025]], .009, m.steel);
  }
  print(manifold, .16, .08, [.22, .015, .023], 0);
  for (const x of [-.30, .30]) for (const y of [-.08, .08]) bolt(manifold, x, y, .024);

  // Recessed return-air cassettes above the right console and below the front pair.
  for (const [name, at, yaw, width, height] of [
    ['starboard-return-air', [1.078, 1.72, .14], -Math.PI / 2, .54, .21],
    ['forward-return-air', [-.50, .43, -1.713], 0, .48, .27],
  ] as [string, Point, number, number, number][]) {
    const vent = group(name, at, yaw);
    box(vent, [width, height, .035], [0, 0, 0], oxidized);
    box(vent, [width - .03, height - .035, .012], [0, 0, .022], m.rubber);
    for (let i = 0; i < 6; i++) {
      const slat = box(vent, [width - .055, .014, .026], [0, -height * .34 + i * height * .135, .034], repair);
      slat.rotation.x = -.28;
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) bolt(vent, x * (width / 2 - .018), y * (height / 2 - .016), .025);
    print(vent, .19, .055, [0, height / 2 + .038, .02], 2);
  }

  const patch = group('port-leak-repair-07', [-1.083, .65, -.61], Math.PI / 2);
  box(patch, [.34, .22, .014], [0, 0, 0], oxidized);
  const plate = box(patch, [.30, .18, .018], [.007, .005, .015], repair);
  plate.rotation.z = -.045;
  for (const x of [-.125, .125]) for (const y of [-.069, .069]) bolt(patch, x, y, .03);
  print(patch, .15, .07, [.014, .003, .029], 1);
  for (let i = 0; i < 4; i++) {
    box(patch, [.006 + i * .002, .075 + i * .021, .002], [-.09 + i * .05, -.145 - i * .009, .009], oxidized);
  }

  // Low service hoses stay tucked behind the footwell edges and below screen trays.
  for (const side of [-1, 1]) {
    tube(root, [[side * 1.065, .61, -.95], [side * .94, .52, -.78], [side * .87, .17, -.38],
      [side * .90, .13, .49], [side * 1.035, .58, 1.24]], .021, m.rubber);
    for (const z of [-.36, .08, .48]) {
      box(root, [.055, .043, .022], [side * .90, .145, z], weld);
    }
    // Rail-end debris is deliberately contained beyond |x|=.59.
    const tray = group(side < 0 ? 'spent-filter-tray' : 'service-tool-tray', [side * .73, .06, .88]);
    box(tray, [.27, .025, .32], [0, 0, 0], repair);
    for (const x of [-.135, .135]) box(tray, [.012, .065, .32], [x, .023, 0], oxidized);
    for (let i = 0; i < 3; i++) {
      const item = mesh(tray, new THREE.CylinderGeometry(.019, .019, .17, 10), side < 0 ? m.cloth : m.steel,
        [-.072 + i * .065, .037, .018 - i * .025]);
      item.rotation.x = Math.PI / 2; item.rotation.z = .08 * (i - 1);
    }
  }
  const hose = group('spare-breathing-hose', [1.068, .73, 1.48], -Math.PI / 2);
  box(hose, [.065, .09, .045], [0, .13, 0], m.steel);
  tube(hose, [[-.035, .13, .047], [-.14, .045, .065], [-.13, -.20, .065], [0, -.26, .075],
    [.13, -.18, .065], [.12, .04, .065], [.025, .12, .065]], .023, m.rubber);
  box(hose, [.075, .032, .034], [.015, -.26, .079], m.yellow);

  // Hatch surround: irregular weld bead, heat stain, hinges and locking dogs.
  const hatch = group('hatch-weld-and-locks', [0, .91, 2.135], Math.PI);
  for (const x of [-.475, .475]) {
    box(hatch, [.029, 1.63, .007], [x, 0, .006], oxidized);
    for (let i = 0; i < 36; i++) {
      const bead = box(hatch, [.019, .032, .01], [x + Math.sin(i * 2.1) * .003, -.79 + i * .045, .015], weld);
      bead.rotation.z = (i % 3 - 1) * .12;
    }
    for (const y of [-.48, .48]) {
      box(hatch, [.095, .13, .095], [x, y, .14], m.steel);
      box(hatch, [.12, .03, .026], [x * .91, y, .20], repair);
      bolt(hatch, x, y, .219);
    }
  }
  for (const y of [-.81, .81]) tube(hatch, [[-.47, y, .013], [0, y + .004, .013], [.47, y, .013]], .007, weld);
  print(hatch, .29, .095, [0, .53, .212], 3);

  // Structural enclosure around the forward pair, clear of their active faces.
  const forward = group('forward-console-service-frame', [0, 0, -1.62]);
  box(forward, [1.94, .065, .15], [0, 1.69, 0], repair);
  box(forward, [1.94, .065, .16], [0, .735, 0], oxidized);
  for (const x of [-1.015, 1.015]) {
    box(forward, [.07, .98, .15], [x, 1.20, 0], repair);
    for (const y of [.78, 1.01, 1.47, 1.65]) bolt(forward, x, y, .079);
  }
  // A warm, dull brass return manifold gives the lower silhouette readable detail
  // under the existing light, without adding emissive surfaces or another lamp.
  const brass = new THREE.MeshStandardMaterial({ color: 0x87704d, roughness: .74, metalness: .58 });
  const returnLine = group('forward-return-manifold', [.56, .35, -1.57]);
  box(returnLine, [.40, .11, .065], [0, 0, 0], brass);
  for (const x of [-.13, 0, .13]) {
    tube(returnLine, [[x, .045, .015], [x, .15, .025], [x + .025, .21, -.025]], .016, m.steel);
    const collar = mesh(returnLine, new THREE.CylinderGeometry(.027, .027, .035, 6), brass, [x, .09, .025]);
    collar.name = 'compression-fitting';
    bolt(returnLine, x, 0, .039);
  }

  const fixture = group('manual-isolation-switch', [1.075, 1.30, 1.49], -Math.PI / 2);
  box(fixture, [.17, .25, .072], [0, 0, 0], repair);
  box(fixture, [.10, .14, .014], [0, .012, .044], m.rubber);
  const lever = box(fixture, [.024, .095, .038], [0, .01, .074], m.red);
  lever.rotation.z = -.32;
  for (const y of [-.10, .10]) bolt(fixture, .062, y, .043);
  tube(fixture, [[0, .125, 0], [0, .23, -.003], [.06, .36, -.004]], .012, m.steel);
  scene.add(root);
}
