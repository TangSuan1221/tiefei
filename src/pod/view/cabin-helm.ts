import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Local XY is the horizontal deck; +Z points up into the seated operator's reach. */
export function buildIndustrialHelm(scene: THREE.Scene, stick: THREE.Group, keys: THREE.Mesh[], textures: THREE.Texture[]) {
  let seed = 731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const grain = document.createElement('canvas'); grain.width = grain.height = 512;
  const ctx = grain.getContext('2d')!;
  ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const v = 85 + Math.floor(random() * 90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(random() * 512, random() * 512, random() * 2 + .5, random() * 2 + .5);
  }
  for (let i = 0; i < 190; i++) {
    ctx.strokeStyle = i % 3 ? '#797979' : '#b1b1b1'; ctx.lineWidth = .4;
    const x = random() * 512, y = random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 30, y + random() * 3); ctx.stroke();
  }
  const noise = new THREE.CanvasTexture(grain); noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.repeat.set(3, 2); textures.push(noise);
  const painted = (color: number) => new THREE.MeshStandardMaterial({color, metalness: .48, roughness: .83, roughnessMap: noise, bumpMap: noise, bumpScale: .00065});
  const steel = painted(0x303b37), face = painted(0x45504a);
  const metal = new THREE.MeshStandardMaterial({color: 0x687578, metalness: .42, roughness: .72, roughnessMap: noise});
  const dark = new THREE.MeshStandardMaterial({color: 0x101512, roughness: .96, bumpMap: noise, bumpScale: .00035});
  const recess = new THREE.MeshStandardMaterial({color: 0x080c0b, roughness: .88});
  const ochre = painted(0x827044);
  const panel = new THREE.Group(); panel.position.set(0, .65, -1.04); panel.rotation.x = -Math.PI / 2; scene.add(panel);
  // Shielded task light makes engraving and paint readable below the window.
  const taskLight = new THREE.PointLight(0xb8c8c1, .48, 1.65, 2);
  taskLight.position.set(0, .20, .48); panel.add(taskLight);
  const auxiliaryLight = new THREE.PointLight(0xcbd0bc, .23, .95, 2);
  auxiliaryLight.position.set(.57, .07, .39); panel.add(auxiliaryLight);
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, radius = .003) =>
    mesh(p, new RoundedBoxGeometry(w, h, d, 2, radius), mat, x, y, z);
  const cylinder = (p: THREE.Object3D, r: number, bottom: number, depth: number, x: number, y: number, z: number, mat: THREE.Material, sides = 32) => {
    const o = mesh(p, new THREE.CylinderGeometry(r, bottom, depth, sides), mat, x, y, z); o.rotation.x = Math.PI / 2; return o;
  };
  const ring = (p: THREE.Object3D, r: number, tube: number, x: number, y: number, z: number, mat: THREE.Material) =>
    mesh(p, new THREE.TorusGeometry(r, tube, 8, 32), mat, x, y, z);
  const screw = (p: THREE.Object3D, x: number, y: number, z: number) => {
    cylinder(p, .0075, .0075, .003, x, y, z, metal, 16);
    const slot = box(p, .009, .0016, .0008, x, y, z + .0018, recess, .0002); slot.rotation.z = random() * Math.PI;
  };
  const plate = (p: THREE.Object3D, text: string, x: number, y: number, z: number, width: number, height = .025, primary = false) => {
    box(p, width + .003, height + .003, .002, x, y, z, primary ? dark : metal, .001);
    const c = document.createElement('canvas'); c.width = primary ? 512 : 768; c.height = primary ? 134 : 96;
    const g = c.getContext('2d')!; g.fillStyle = '#101813'; g.fillRect(0, 0, c.width, c.height);
    // Primary legends use the plate's physical aspect ratio and a large CJK face.
    // No nested rules or second English plate competing with the operating label.
    g.font = primary ? 'bold 86px "Microsoft YaHei", sans-serif' : '500 43px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#070b08'; g.fillText(text, c.width / 2 + 1, c.height / 2 + 2, c.width - 24);
    g.fillStyle = primary ? '#e3dec8' : '#b9b7a0'; g.fillText(text, c.width / 2, c.height / 2, c.width - 24);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.push(t);
    mesh(p, new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({map: t, roughness: .9, metalness: .05, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: primary ? .38 : .22}), x, y, z + .0012);
  };
  const cable = (p: THREE.Object3D, points: number[][], radius: number, mat: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(v[0], v[1], v[2])));
    mesh(p, new THREE.TubeGeometry(curve, 24, radius, 8, false), mat, 0, 0, 0);
  };

  box(panel, 1.72, .66, .12, 0, 0, 0, steel, .022);
  box(panel, 1.68, .62, .009, 0, 0, .063, recess, .012);
  box(panel, 1.655, .60, .008, 0, 0, .068, face, .008);
  for (const x of [-.75, .75]) box(scene, .12, .55, .50, x, .31, -1.04, steel, .02);
  // Folded front lip and worn hand rest, with a narrow exposed metal edge.
  box(panel, 1.66, .027, .035, 0, -.316, .056, metal, .008);
  box(panel, 1.60, .031, .022, 0, -.315, .074, dark, .009);
  for (const x of [-.812, .812]) for (const y of [-.27, .27]) screw(panel, x, y, .075);
  const subpanel = (x: number, y: number, w: number, h: number) => {
    box(panel, w + .012, h + .012, .004, x, y, .074, recess);
    box(panel, w, h, .006, x, y, .076, steel);
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) screw(panel, x + dx * (w / 2 - .014), y + dy * (h / 2 - .013), .081);
  };
  subpanel(-.565, .018, .405, .50);
  subpanel(-.065, .035, .51, .51);
  subpanel(.475, .035, .51, .51);
  plate(panel, 'OPTICS / 光学', -.065, .257, .082, .24, .019);
  plate(panel, 'AUXILIARY / 辅控', .475, .257, .082, .28, .019);
  plate(panel, 'KY-03 · HELM / 舵机', -.565, .24, .082, .32, .019);
  plate(panel, '推进 / 反推 · 左右转舵', -.565, -.205, .082, .34);
  plate(panel, '24 V DC   /   SEALED   /   No. 0831', .21, -.258, .075, .49, .017);
  for (let i = 0; i < 7; i++) box(panel, .073, .004, .002, -.68, -.095 + i * .011, .082, recess, .001);

  // Stationary mounting flange and boot. Only the shaft/grip pivot with input.
  cylinder(panel, .091, .091, .009, -.57, 0, .087, metal);
  cylinder(panel, .079, .079, .012, -.57, 0, .096, dark);
  for (const x of [-1, 1]) for (const y of [-1, 1]) screw(panel, -.57 + x * .063, y * .063, .094);
  for (let i = 0; i < 7; i++) {
    const r = .075 - i * .0067;
    cylinder(panel, r - .009, r, .012, -.57, 0, .109 + i * .010, dark);
    ring(panel, r - .005, .0045, -.57, 0, .107 + i * .010, dark);
  }
  stick.position.set(-.57, 0, .08); stick.userData.control = 'helm.stick'; panel.add(stick);
  mesh(stick, new THREE.SphereGeometry(.031, 20, 12), metal, 0, 0, .082);
  cylinder(stick, .015, .018, .13, 0, 0, .148, metal);
  ring(stick, .020, .005, 0, 0, .197, metal);
  box(stick, .075, .066, .119, 0, 0, .24, dark, .023);
  for (let i = 0; i < 5; i++) box(stick, .073, .068, .003, 0, 0, .204 + i * .014, recess, .001);
  cylinder(stick, .022, .024, .005, 0, 0, .302, steel);
  cable(panel, [[-.53, .05, .155], [-.43, .10, .12], [-.40, .17, .092], [-.43, .205, .085]], .006, dark);
  box(panel, .033, .016, .014, -.43, .195, .09, metal);
  // Flange is also a usable joystick target, without an invisible blocking hitbox.
  for (const o of panel.children) if (o.position.x === -.57) o.userData.control = 'helm.stick';

  const buttons = [
    ['camera.shoot', '曝光', 'EXPOSE'], ['camera.lamp', '照明', 'LAMP'],
    ['camera.view', '前往分析台', 'ANALYSIS'], ['site.interact', '操作 / 取回', 'RETRIEVE'],
    ['drive.center', '云台回中', 'CENTER'], ['helm.brake', '制动', 'BRAKE'],
    ['drive.depart', '离港', 'DEPART'], ['back', '离开座位', 'RELEASE'],
  ] as const;
  buttons.forEach(([id, title], i) => {
    const x = -.20 + (i % 4) * .27, y = i < 4 ? .18 : -.10;
    const control = new THREE.Group(); control.position.set(x, y, .081); control.userData.control = id; panel.add(control);
    cylinder(control, .044, .044, .002, 0, 0, .001, recess);
    cylinder(control, .039, .039, .004, 0, 0, .003, metal);
    cylinder(control, .0335, .0335, .003, 0, 0, .006, recess);
    const isBrake = id === 'helm.brake';
    const mat = new THREE.MeshStandardMaterial({color: isBrake ? 0x672d23 : i === 0 ? 0x736344 : 0x252e28, metalness: .16, roughness: .69, bumpMap: noise, bumpScale: .00025, emissive: isBrake ? 0x39120b : 0x554c2d, emissiveIntensity: .12});
    const key = cylinder(control, isBrake ? .036 : .029, .029, isBrake ? .019 : .006, 0, 0, isBrake ? .017 : .009, mat);
    key.userData.control = id; keys.push(key);
    ring(control, .036, .001, 0, 0, .006, metal);
    if (i === 0) {
      // Concentric shutter-release cap, with a knurled locking collar.
      for (let tooth = 0; tooth < 20; tooth++) {
        const a = tooth * Math.PI / 10;
        cylinder(control, .0014, .0014, .003, Math.cos(a) * .036, Math.sin(a) * .036, .007, dark, 6);
      }
      ring(control, .019, .0008, 0, 0, .0125, metal);
    } else if (i === 1 || i === 2 || i === 4 || i === 7) {
      // Raised paddle inserts: lamp, playback, centering and seat release.
      const paddle = box(control, i === 7 ? .036 : .012, .043, .008, 0, 0, .015, i === 7 ? metal : dark);
      paddle.rotation.z = i === 2 ? Math.PI / 2 : 0;
      box(control, .003, .015, .001, 0, .009, .0195, metal, .0004);
    }
    // Small pilot lens; restrained amber, not a luminous keycap.
    box(control, .027, .010, .004, 0, .061, .001, recess, .002);
    box(control, .017, .0035, .003, 0, .061, .004, new THREE.MeshStandardMaterial({color: 0x88713b, emissive: 0xad782a, emissiveIntensity: .35, roughness: .35}), .001);
    // Inboard offset keeps the seat-release legend inside the fixed camera frame.
    plate(control, title, id === 'back' ? -.04 : 0, -.079, .003, id === 'back' ? .19 : .21, .055, true);
    if (isBrake || id === 'drive.depart') {
      for (const side of [-1, 1]) {
        box(control, .015, .088, .012, side * .058, .003, .008, steel);
        cable(control, [[side * .058, -.025, .013], [side * .058, -.025, .041], [side * .058, .033, .041], [side * .058, .036, .013]], .005, isBrake ? metal : ochre);
        screw(control, side * .058, -.034, .016);
      }
    }
  });
}
