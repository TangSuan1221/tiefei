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
  // Correlated worn enamel: broad oxidation, fine scratches and exposed edges,
  // rather than uniform high-contrast noise across every surface.
  const enamel=document.createElement('canvas');enamel.width=enamel.height=1024;
  const e=enamel.getContext('2d')!;e.fillStyle='#b8bbae';e.fillRect(0,0,1024,1024);
  for(let i=0;i<180;i++){
    const x=random()*1024,y=random()*1024,r=10+random()*65;
    const g=e.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(25,31,25,.15)');g.addColorStop(1,'rgba(25,31,25,0)');e.fillStyle=g;e.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<900;i++){
    const edge=i<650;const x=random()*1024,y=edge?(random()<.5?random()*34:1024-random()*34):random()*1024;
    e.fillStyle=i%3?'#65564a':'#8c8370';e.fillRect(x,y,1+random()*9,.5+random()*2.5);
    if(i%7===0){e.fillStyle='rgba(47,31,19,.35)';e.fillRect(x,y+2,1+random()*2,4+random()*16);}
  }
  const enamelMap=new THREE.CanvasTexture(enamel);enamelMap.colorSpace=THREE.SRGBColorSpace;enamelMap.anisotropy=8;textures.push(enamelMap);
  const painted = (color: number) => new THREE.MeshStandardMaterial({color,map:enamelMap,metalness:.48,roughness:.78,bumpMap:noise,bumpScale:.00035});
  const steel = painted(0x303b37), face = painted(0x45504a);
  const metal = new THREE.MeshStandardMaterial({color: 0x687578, metalness: .42, roughness: .72, roughnessMap: noise});
  const dark = new THREE.MeshStandardMaterial({color: 0x101512, roughness: .96, bumpMap: noise, bumpScale: .00035});
  const recess = new THREE.MeshStandardMaterial({color: 0x080c0b, roughness: .88});
  const panel = new THREE.Group(); panel.position.set(0, .88, -1.42); panel.rotation.x = -Math.PI * .31; panel.scale.set(.65, .58, .65); scene.add(panel);
  // Shielded task light makes engraving and paint readable below the window.
  const taskLight = new THREE.PointLight(0xc7dbd4, .38, 1.65, 2);
  taskLight.position.set(0, .20, .48); panel.add(taskLight);
  const auxiliaryLight = new THREE.PointLight(0xf0bb78, .20, .95, 2);
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
  // Rear service deck joins the optical bulkhead to the existing live helm.
  // It sits behind/below every control surface; no new gameplay hit targets.
  const rear=new THREE.Group();rear.position.set(0,.90,-1.69);rear.rotation.x=-.12;scene.add(rear);
  box(rear,1.25,.035,.22,0,0,0,steel,.008);
  for(let i=0;i<5;i++){
    const x=-.48+i*.24;box(rear,.215,.012,.16,x,.023,0,face,.003);
    for(let j=0;j<6;j++)box(rear,.095,.002,.004,x,.031,-.065+j*.017,recess,.0005);
    for(const dx of [-.089,.089])for(const dz of [-.075,.075]){
      const bolt=mesh(rear,new THREE.CylinderGeometry(.003,.003,.002,10),metal,x+dx,.032,dz);
    }
  }
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
    g.fillStyle = primary ? '#af9b76' : '#b9b7a0'; g.fillText(text, c.width / 2, c.height / 2, c.width - 24);
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
  for (const x of [-.75, .75]) box(scene, .10, .70, .28, x * .78, .35, -1.44, steel, .02);
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
  plate(panel, '推进滑杆 / 反推 · 左右转舵', -.565, -.205, .082, .34);
  plate(panel, '24 V DC   /   SEALED   /   No. 0831', .21, -.258, .075, .49, .017);
  for (let i = 0; i < 7; i++) box(panel, .073, .004, .002, -.68, -.095 + i * .011, .082, recess, .001);

  // Move the complete mechanism up/right; thrust animation remains local to its mount.
  const stickMount=new THREE.Group();stickMount.name='helm-stick-mount';stickMount.position.set(.09,.065,0);panel.add(stickMount);
  box(stickMount,.12,.37,.009,-.57,0,.085,recess);
  for(const x of [-.625,-.515])box(stickMount,.008,.35,.009,x,0,.092,metal);
  // Stationary mounting flange and boot. Only the shaft/grip pivot with input.
  cylinder(stickMount, .091, .091, .009, -.57, 0, .087, metal);
  cylinder(stickMount, .079, .079, .012, -.57, 0, .096, dark);
  for (const x of [-1, 1]) for (const y of [-1, 1]) screw(stickMount, -.57 + x * .063, y * .063, .094);
  for (let i = 0; i < 7; i++) {
    const r = .075 - i * .0067;
    cylinder(stickMount, r - .009, r, .012, -.57, 0, .109 + i * .010, dark);
    ring(stickMount, r - .005, .0045, -.57, 0, .107 + i * .010, dark);
  }
  stick.position.set(-.57, 0, .08); stick.userData.control = 'helm.stick'; stickMount.add(stick);
  mesh(stick, new THREE.SphereGeometry(.031, 20, 12), metal, 0, 0, .082);
  cylinder(stick, .015, .018, .13, 0, 0, .148, metal);
  ring(stick, .020, .005, 0, 0, .197, metal);
  box(stick, .075, .066, .119, 0, 0, .24, dark, .023);
  for (let i = 0; i < 5; i++) box(stick, .073, .068, .003, 0, 0, .204 + i * .014, recess, .001);
  cylinder(stick, .022, .024, .005, 0, 0, .302, steel);
  cable(stickMount, [[-.53, .05, .155], [-.43, .10, .12], [-.40, .17, .092], [-.43, .205, .085]], .006, dark);
  box(stickMount, .033, .016, .014, -.43, .195, .09, metal);
  // Flange is also a usable joystick target, without an invisible blocking hitbox.
  for (const o of stickMount.children) if (o.position.x === -.57) o.userData.control = 'helm.stick';

  const buttons = [
    ['camera.shoot', '曝光'], ['camera.lamp', '照明'],
    ['arm.extend', '机械臂操作'], ['helm.brake', '制动'],
  ] as const;
  buttons.forEach(([id, title], i) => {
    // Compact single row toward the window; labels and hit targets move together.
    const x = -.20 + i * .23, y = .13;
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
    } else if (id === 'camera.lamp') {
      // Raised lamp paddle insert.
      box(control, .012, .043, .008, 0, 0, .015, dark);
      box(control, .003, .015, .001, 0, .009, .0195, metal, .0004);
    }
    // Small pilot lens; restrained amber, not a luminous keycap.
    box(control, .027, .010, .004, 0, .061, .001, recess, .002);
    box(control, .017, .0035, .003, 0, .061, .004, new THREE.MeshStandardMaterial({color: 0x88713b, emissive: 0xad782a, emissiveIntensity: .35, roughness: .35}), .001);
    plate(control, title, 0, -.079, .003, .21, .055, true);
    if (isBrake) {
      for (const side of [-1, 1]) {
        box(control, .015, .088, .012, side * .058, .003, .008, steel);
        cable(control, [[side * .058, -.025, .013], [side * .058, -.025, .041], [side * .058, .033, .041], [side * .058, .036, .013]], .005, metal);
        screw(control, side * .058, -.034, .016);
      }
    }
  });
}

