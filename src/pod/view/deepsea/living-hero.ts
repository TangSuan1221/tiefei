import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ALEX_MARKS, LIVING_ITEMS, type Vec3} from '../../content/living-deck-layout';
import {Batcher, rng, type V3} from './living-build';
import type {LivingMaterials} from './living-materials';
import {Kit, chair, crtConsole, dormDoor, washer} from './living-props';
import {ATRIUM_BALCONY_DEPTH, ATRIUM_BALCONY_Y, type ShellBuild} from './living-shells';
import {documentMesh, paperWear} from './living-signage';
import {buildCocoon} from './living-cocoon';
import {disposeGlbScene} from './living-glb';
import {ATRIUM_BALCONY_MODULE, ATRIUM_BALCONY_TILES, HERO_GLB_PARTS, HERO_SPACE, registerHeroAdopter, type HeroPartKey} from './living-hero-glb';

const PI = Math.PI;
/** Code written on the manager's note (visual canon for the gate keypad). */
export const LIVING_GATE_CODE = '0917';

export type HeroName = 'glass-blast-door' | 'valve-manifold' | 'security-post' | 'manager-office' | 'laundry-row' | 'ballast-rack' | 'atrium-balcony' | 'gate-f' | 'cocoon-corpse';
/**
 * Frame of each procedural fallback (Kit origin, floor level). The Blender GLBs use their manifest
 * placement (HERO_GLB_PLACEMENT); fallbacks are laid out to the same footprints.
 */
export const LIVING_HERO_ANCHORS: Record<HeroName, {space: string; position: Vec3; yawDeg: number}> = {
  'glass-blast-door': {space: 'G', position: [142, -3, 6], yawDeg: -90},
  'valve-manifold': {space: 'V', position: [141.7, -3, -29], yawDeg: -90},
  'security-post': {space: 'R3', position: [76, -3, -62.6], yawDeg: 0},
  'manager-office': {space: 'R5', position: [167.2, -3, 104.4], yawDeg: 180},
  'laundry-row': {space: 'R1', position: [36, -3, -22], yawDeg: 0},
  'ballast-rack': {space: 'R4', position: [115.5, -3, 32.5], yawDeg: -90},
  'atrium-balcony': {space: 'A', position: [155, 0, 42.3], yawDeg: 0},
  'gate-f': {space: 'A', position: [188, -3, 42.3], yawDeg: 0},
  'cocoon-corpse': {space: 'M', position: [...ALEX_MARKS.cocoon] as Vec3, yawDeg: 0},
};
for (const n of Object.keys(LIVING_HERO_ANCHORS) as HeroName[]) if (LIVING_HERO_ANCHORS[n].space !== HERO_SPACE[n]) throw new Error(`living hero ${n}: space mismatch`);

export interface HeroBuild {
  fallbacks: Map<HeroName, T.Group>;
  interactables: Map<string, T.Group>;
  photoTargets: Map<string, T.Object3D>;
  solids: T.Box3[];
  gate: {mesh: T.Group; bounds: T.Box3};
  /** Procedural pieces that a Blender GLB may replace (hidden on GLB load). */
  pane: T.Mesh;
  gateInner: T.Group;
  valveWheels: Record<'heat' | 'feed' | 'cool', T.Group>;
  probeCase: T.Group;
  /** Floating security guard (animated drift). */
  guard: T.Group;
  cocoon: T.Group;
  /**
   * Movable parts for the site: always the procedural driver object (item group, valve group, gate leaf
   * group). A loaded GLB part is re-parented inside it, so moving / hiding the handle moves the GLB too.
   */
  parts: Record<HeroPartKey, T.Object3D>;
  /** GLB nodes adopted so far (by node name), for inspection. */
  glbParts: Map<string, T.Object3D>;
  dispose(): void;
}

const faceYaw = (deg: number) => { const h = deg * PI / 180; return Math.atan2(Math.sin(h), -Math.cos(h)); };

export function buildHeroes(m: LivingMaterials, shells: ShellBuild, spaceGroups: Map<string, T.Group>): HeroBuild {
  const fallbacks = new Map<HeroName, T.Group>();
  const interactables = new Map<string, T.Group>();
  const photoTargets = new Map<string, T.Object3D>();
  const solids: T.Box3[] = [];
  const disposers: (() => void)[] = [];
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const hidden = new T.MeshBasicMaterial({visible: false}); owned.push(hidden);
  const batchers: Batcher[] = [];
  const screenMat = new T.MeshStandardMaterial({color: '#0d1613', emissive: '#4f9a80', emissiveIntensity: .5, roughness: .2, metalness: .1});
  screenMat.name = 'living.security-screens'; owned.push(screenMat);

  function hero(name: HeroName, build: (b: Batcher, k: Kit) => void) {
    const a = LIVING_HERO_ANCHORS[name];
    const b = new Batcher(`living-hero-${name}`); batchers.push(b);
    build(b, Kit.at(b, [...a.position] as V3, a.yawDeg * PI / 180));
    const g = b.build(spaceGroups.get(a.space)!);
    g.name = `living-hero-fallback:${name}`;
    solids.push(...b.solids);
    fallbacks.set(name, g); return g;
  }
  /** Interactable group placed at an item position, local +Z = operable face direction. */
  function item(id: string, build: (b: Batcher, k: Kit) => void, proxy: V3, proxyAt: V3 = [0, 0, 0], at?: Vec3) {
    const it = LIVING_ITEMS.find(i => i.id === id)!;
    const g = new T.Group(); g.name = id; g.userData.interactionId = id;
    g.position.set(...(at ?? it.position)); g.rotation.y = faceYaw(it.face);
    const b = new Batcher(`living-item-${id}`); batchers.push(b);
    build(b, new Kit(b, new T.Matrix4()));
    const inner = b.build(g); inner.traverse(o => { o.userData.interactionId = id; });
    const p = new T.Mesh(new T.BoxGeometry(...proxy), hidden); p.position.set(...proxyAt); p.userData.interactionId = id; p.name = `${id}:hit`; owned.push(p.geometry);
    g.add(p);
    spaceGroups.get(it.space)!.add(g);
    interactables.set(id, g);
    if (it.kind === 'photo' || it.kind === 'uplink') photoTargets.set(id, g);
    return g;
  }
  /**
   * Fallback-only plate (own small canvas) for signage the Blender GLB already carries; it hides with the
   * batch it is pushed into instead of living in the permanent sign atlas.
   */
  const PLATE: Record<'warn' | 'red' | 'cyan' | 'room' | 'stencil', [string, string, string]> = {
    warn: ['#c9a033', '#141414', '#2b2618'], red: ['#8f2420', '#f3e6dc', '#f0c9bd'], cyan: ['#20434a', '#d8efe9', '#a4cdc8'],
    room: ['#2a2622', '#d9c79a', '#b9a77a'], stencil: ['#2c2f2c', '#d9c97a', '#b9a75a'],
  };
  function plate(b: Batcher, cn: string, en: string, style: keyof typeof PLATE, p: V3, normal: V3, width: number) {
    const [bg, fg, sub] = PLATE[style];
    const d = documentMesh(width, width / 4, 512, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = fg; c.globalAlpha = .5; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12); c.globalAlpha = 1;
      c.textBaseline = 'middle'; c.fillStyle = fg;
      const fit = (t: string, px: number, font: (s: number) => string) => { let s = px; c.font = font(s); while (s > 8 && c.measureText(t).width > w - 36) { s -= 2; c.font = font(s); } };
      fit(cn, en ? h * .42 : h * .55, s => `bold ${s}px "Microsoft YaHei",sans-serif`); c.fillText(cn, 18, en ? h * .38 : h * .52);
      if (en) { c.fillStyle = sub; fit(en, h * .2, s => `600 ${s}px "Bahnschrift","Arial Narrow",sans-serif`); c.fillText(en, 20, h * .76); }
      paperWear(c, w, h, cn.length * 7 + width * 13, .5);
    }, {name: 'living-hero-plate', emissive: style === 'red' || style === 'cyan' ? .4 : .04});
    disposers.push(d.dispose);
    d.mesh.position.set(...p); d.mesh.lookAt(p[0] + normal[0], p[1] + normal[1], p[2] + normal[2]);
    b.extras.push(d.mesh);
  }

  // ================================================================ cargo boxes
  item('living.box.battery', (b, k) => {
    // GLB battery case footprint: 0.6 × 0.42 × 0.49, standing on the laundry shelf (bottom y −0.77)
    k.rbox([0, .04, 0], [.6, .42, .49], m.bandRed, .03);
    k.box([0, .1, .25], [.5, .07, .01], m.hazard);
    for (const x of [-.27, .27]) k.box([x, .04, 0], [.04, .44, .51], m.rubber);
    k.rod([-.15, .28, 0], [.15, .28, 0], .02, m.chrome, 6);
    k.box([.12, -.06, .25], [.18, .1, .01], m.lampAmber);
    k.box([-.14, -.06, .25], [.14, .12, .01], m.paper);
  }, [.6, .44, .5]);
  item('living.box.tools', (b, k) => {
    k.rbox([0, 0, 0], [1.2, .75, .8], m.bandRed, .04);
    k.box([0, .2, .405], [1.1, .03, .01], m.chrome);
    for (const y of [-.2, 0, .2]) k.box([0, y, .405], [.3, .04, .02], m.chrome);
    k.rod([-.3, .42, 0], [.3, .42, 0], .03, m.rubber, 6);
    for (const x of [-.55, .55]) k.box([x, -.3, .3], [.08, .14, .12], m.chrome);
  }, [1.2, .75, .8]);
  const probeCase = item('living.box.probe', (b, k) => {
    k.rbox([0, 0, 0], [.9, .55, .38], m.bandYellow, .06);
    k.box([0, .02, 0], [.92, .03, .4], m.rubber);
    for (const x of [-.3, .3]) k.box([x, .02, .2], [.12, .1, .04], m.trim);
    k.rod([-.18, .32, 0], [.18, .32, 0], .025, m.rubber, 6);
    k.box([0, -.1, .195], [.5, .16, .005], m.paper);
    plate(b, '探头', 'TETHERED CAM', 'warn', [0, .16, .205], [0, 0, 1], .46);
  }, [.9, .55, .38]);
  item('living.box.ballast', (b, k) => {
    k.box([0, -.05, 0], [.7, .52, .9], m.frame);
    for (let i = 0; i < 3; i++) k.box([-.22 + i * .22, -.05, 0], [.18, .46, .86], m.rubber);
    for (const z of [-.45, .45]) k.box([0, .05, z], [.74, .6, .06], m.bandYellow);
    k.ring([0, .3, 0], .1, .025, m.chrome, [0, PI / 2, 0], 14);
    plate(b, '配平压载 400 kg', 'TRIM BALLAST · Pb', 'warn', [.36, -.05, 0], [1, 0, 0], .6);
  }, [.7, .56, .9]);

  // ================================================================ glass blast door + transfer intake (G east wall)
  hero('glass-blast-door', (b, k) => {
    // local: +Z points west into G, x runs along the wall (world −z), origin at floor/centre of opening
    const steel = m.indSteel, half = 6;
    k.box([half + .4, 2.9, .05], [.8, 5.8, 1.5], steel); k.box([-half - .4, 2.9, .05], [.8, 5.8, 1.5], steel);
    k.box([0, 5.4, .05], [13.6, .8, 1.5], steel);
    k.box([0, -.08, .3], [13.6, .16, 1.0], m.plate);
    for (const x of [-6.6, 6.6]) for (let y = .6; y < 5; y += 1.1) { k.cyl([x, y, .82], .11, .11, .12, m.chrome, 10, [PI / 2, 0, 0]); k.box([x * .97, y, .8], [.2, .34, .06], m.frame); }
    // Hydraulic rams on both posts.
    for (const x of [-7.1, 7.1]) { k.rod([x, .4, .55], [x, 4.6, .55], .14, m.frame, 12); k.rod([x, 2.5, .55], [x, 4.4, .55], .09, m.chrome, 10); }
    // Mullions and transom in front of the pane (pane itself is a separate transmissive mesh).
    for (const x of [-3, 0, 3]) k.box([x, 2.5, .2], [.22, 5, .14], m.frame);
    k.box([0, 2.4, .2], [12, .16, .14], m.frame);
    for (const x of [-half, half]) k.box([x, 2.5, .2], [.12, 5, .2], m.rubber);
    k.box([0, 5.0, .2], [12, .12, .2], m.rubber); k.box([0, .05, .2], [12, .12, .2], m.rubber);
    // Back bulkhead behind the glass above the lobby ceiling (visible through the pane).
    k.box([0, 4.3, -.42], [12, 1.4, .06], m.padTeal);
    // Hazard surround and handrail.
    k.box([0, 5.86, .82], [13.6, .14, .02], m.hazard);
    k.rod([-6, 1.1, 1.05], [6, 1.1, 1.05], .04, m.brass, 8);
    for (const x of [-6, -2, 2, 6]) k.rod([x, 0, 1.05], [x, 1.1, 1.05], .03, m.brass, 6);
    plate(b, '防爆观察窗', 'BLAST GLASS  ·  RATED 2.5 MPa  ·  DO NOT TAP', 'red', [141.18, 2.4, 6], [-1, 0, 0], 3.2);
    plate(b, '传递管道', 'TRANSFER PIPE  ·  PROBE LOAD Ø800', 'warn', [141.66, 1.5, 17], [-1, 0, 0], 1.14);
  });
  solids.push(new T.Box3(new T.Vector3(140.9, -3, -.8), new T.Vector3(142, 2.8, 0)), new T.Box3(new T.Vector3(140.9, -3, 12), new T.Vector3(142, 2.8, 12.8)));
  // The pane: transmissive physical glass, thick, closed geometry (never opaque).
  const pane = new T.Mesh(new T.BoxGeometry(.22, 5, 12), m.blastGlass); owned.push(pane.geometry);
  pane.position.set(142, -.5, 6); pane.name = 'living-blast-glass'; pane.renderOrder = 4;
  spaceGroups.get('G')!.add(pane);
  // Intake mouth.
  item('living.pipe.intake', (b, k) => {
    k.cyl([0, 0, -.15], .52, .52, .3, m.indSteel, 24, [PI / 2, 0, 0]);
    k.ring([0, 0, .02], .5, .08, m.frame, [0, 0, 0], 28);
    k.cyl([0, 0, .0], .36, .42, .1, m.rubber, 24, [PI / 2, 0, 0]);
    k.cyl([0, 0, .03], .34, .34, .02, m.darkGlass, 24, [PI / 2, 0, 0]);
    for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; k.cyl([Math.cos(a) * .5, Math.sin(a) * .5, .07], .035, .035, .07, m.chrome, 6, [PI / 2, 0, 0]); }
    k.ring([0, 0, .05], .6, .03, m.bandYellow, [0, 0, 0], 28);
    k.box([.75, .25, -.15], [.2, .5, .3], m.frame); k.box([.75, .35, .01], [.12, .12, .02], m.lampAmber);
  }, [1.1, 1.1, .4], [0, 0, -.15]);

  // ================================================================ valve manifold (V east wall)
  const valveWheels = {} as HeroBuild['valveWheels'];
  hero('valve-manifold', (b, k) => {
    // local +Z = west into V, x runs along the wall toward world −z (local x = −(z − anchorZ))
    // world z = −29 + local x; world x = 141.7 − local z. Heat (red) z −36, feed (yellow) −29, cool (blue) −22.
    const bands: [number, T.Material][] = [[-7, m.bandRed], [0, m.bandYellow], [7, m.bandBlue]];
    const pz = .14;
    for (const [x, band] of bands) {
      k.rod([x, 0, pz], [x, 7.5, pz], .18, m.pipe, 16);
      k.rod([x, 7.5, pz], [x, 7.9, -.3], .18, m.pipe, 16);
      for (const y of [.6, 2.0, 4.6, 6.8]) k.cyl([x, y, pz], .195, .195, .32, band, 18);
      for (const y of [1.3, 4.0]) { k.cyl([x, y, pz], .25, .25, .09, m.frame, 18); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.cyl([x + Math.cos(a) * .22, y + .055, pz + Math.sin(a) * .22], .018, .018, .04, m.chrome, 5); } }
      // valve body on the pipe; bonnet and stem toward the operator (wheel hub at local z .36 = world x 141.34)
      k.rbox([x, 3, .12], [.5, .62, .24], m.frame, .05);
      k.cyl([x, 3, .27], .1, .12, .06, m.frame, 12, [PI / 2, 0, 0]);
      k.rod([x, 3, .27], [x, 3, .36], .035, m.chrome, 8);
      // gauge
      k.rod([x + .5, 3.75, pz], [x + .5, 3.75, .36], .025, m.chrome, 6); k.cyl([x + .5, 3.75, .4], .13, .13, .06, m.trim, 16, [PI / 2, 0, 0]); k.cyl([x + .5, 3.75, .432], .11, .11, .01, m.porcelain, 16, [PI / 2, 0, 0]);
      for (const y of [.35, 6.4]) { k.box([x, y, .02], [.6, .1, .08], m.frame); k.ring([x, y, pz], .2, .025, m.frame, [PI / 2, 0, 0], 16); }
    }
    k.rod([-8, .45, pz], [8, .45, pz], .13, m.pipe, 14);
    k.box([0, 6.2, .05], [17, .16, .18], m.frame);
    plate(b, 'V-1  疗养区供热回路', 'SANATORIUM HEATING LOOP', 'red', [141.68, .55, -34.4], [-1, 0, 0], 2.0);
    plate(b, 'V-2  疗养区营养液管', 'SANATORIUM NUTRIENT FEED', 'warn', [141.68, .55, -27.4], [-1, 0, 0], 2.0);
    plate(b, 'V-3  冷却水回流', 'COOLING WATER RETURN', 'cyan', [141.68, .55, -20.4], [-1, 0, 0], 2.0);
    plate(b, '疗养区VIP优先供给 · 禁止关闭', '运营部  OPERATIONS — VIP SANATORIUM PRIORITY SUPPLY, DO NOT CLOSE', 'red', [141.68, 2.3, -32.5], [-1, 0, 0], 4.4);
  });
  // Wheels are interactables (rotate with valveTurn).
  for (const [key, id, band, z] of [['heat', 'living.valve.heat', m.bandRed, -36], ['feed', 'living.valve.feed', m.bandYellow, -29], ['cool', 'living.valve.cool', m.bandBlue, -22]] as const) {
    const g = item(id, (b, k) => {
      k.ring([0, 0, 0], .5, .05, band, [0, 0, 0], 32);
      for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; k.rod([0, 0, 0], [Math.cos(a) * .48, Math.sin(a) * .48, 0], .03, band, 6); }
      k.cyl([0, 0, 0], .1, .1, .14, m.chrome, 12, [PI / 2, 0, 0]);
      for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; k.sphere([Math.cos(a) * .5, Math.sin(a) * .5, 0], [.06, .06, .06], m.rubber, 6); }
    }, [1.1, 1.1, .25], [0, 0, 0], [141.34, 0, z]);
    valveWheels[key] = g;
  }

  // ================================================================ security post: console island, monitor wall, floating guard
  const securityPost = hero('security-post', (b, k) => {
    crtConsole(k, m, 4, shellsScreens());
    // locker bank behind the console (GLB lockers footprint)
    for (let i = 0; i < 4; i++) { k.box([.37 + i * .57, 1.0, -2.69], [.55, 2.0, .85], m.indGreen); k.box([.37 + i * .57, 1.6, -2.255], [.4, .03, .01], m.chrome); }
    chair(k.child([2.6, 0, 1.3], [0, 2.4, 0]), m);
    k.rbox([-2.6, .2, 1.4], [.5, .4, .5], m.trim, .03);   // dropped radio
    for (let i = 0; i < 9; i++) k.box([-1.4 + i * .35, .02, 1.2 + (i % 3) * .3], [.21, .004, .29], m.paper, [0, i, 0]);
  });
  // GLB footprints: console island with monitor bridge, locker bank
  solids.push(new T.Box3(new T.Vector3(74.4, -3, -64.25), new T.Vector3(77.92, -.1, -61.3)), new T.Box3(new T.Vector3(76.08, -3, -65.72), new T.Vector3(78.38, -1, -64.85)));
  function shellsScreens() { return screenMat; }
  const guard = new T.Group(); guard.name = 'living-security-guard';
  {
    const b = new Batcher('living-guard'); batchers.push(b);
    const k = new Kit(b, new T.Matrix4());
    human(k, m, {coat: m.corpseCloth, skin: m.corpseSkin, pose: 'float'});
    k.box([0, .02, .14], [.36, .06, .04], m.trim);   // belt
    k.box([.12, .1, .17], [.08, .08, .02], m.brass);  // badge
    b.build(guard);
    guard.position.set(76.15, -1.35, -61.95); guard.rotation.set(-.32, .1, .05);
    securityPost.add(guard);   // the GLB carries its own (seated) security diver
  }

  // ================================================================ manager office: desk, chair, slumped manager, note, placard, form
  const office = hero('manager-office', (b, k) => {
    // local +Z = north (toward the door); desk centre at origin; desk top y −2.30 like the GLB
    k.box([0, .67, 0], [2.2, .06, 1.0], m.veneer);
    k.box([-.85, .335, 0], [.45, .65, .95], m.veneer); k.box([.85, .335, 0], [.45, .65, .95], m.veneer);
    k.box([0, .41, -.45], [1.3, .5, .04], m.veneer);
    for (let i = 0; i < 3; i++) k.box([.85, .18 + i * .2, .48], [.38, .02, .02], m.brass);
    k.rbox([-.55, .93, -.25], [.48, .4, .42], m.trim, .03); k.box([-.55, .93, -.03], [.38, .28, .01], m.screenDead);
    // desk lantern (battery, still faintly lit)
    k.cyl([.7, .78, -.2], .07, .09, .12, m.frame, 12); k.cyl([.7, .93, -.2], .06, .06, .18, m.lampWarm, 12); k.cyl([.7, 1.05, -.2], .08, .07, .04, m.frame, 12);
    // chair behind the desk (south)
    chair(k.child([0, 0, -1.05], [0, 0, 0]), m);
    for (let i = 0; i < 5; i++) k.box([.1 + i * .17, .705, -.1 + (i % 2) * .15], [.21, .004, .29], m.paper, [0, i * .7, 0]);
    k.cyl([-.2, .75, .25], .045, .04, .1, m.porcelain, 10);
    plate(b, '员工公告栏', 'STAFF NOTICES', 'room', [150.4, 1.3, 92], [1, 0, 0], 1.2);
    // ledger stack the clipboard leans on (top front edge 0.12 m above the board centre)
    const yaw = Math.atan2(-5, -8);
    b.box([167.103, -2.14, 104.165], [.24, .32, .31], m.paper, {rotY: yaw});
    b.box([167.103, -1.972, 104.165], [.25, .016, .32], m.trim, {rotY: yaw + .05});
  });
  solids.push(new T.Box3(new T.Vector3(166.1, -3, 103.6), new T.Vector3(168.3, -2.27, 105.2)));
  {
    const b = new Batcher('living-manager'); batchers.push(b);
    const g = new T.Group(); g.name = 'living-manager-corpse';
    human(new Kit(b, new T.Matrix4()), m, {coat: m.carpetRed, skin: m.corpseSkin, pose: 'slump'});
    b.build(g); g.position.set(167.2, -2.62, 105.35); g.rotation.y = PI;
    office.add(g);   // the GLB carries its own manager figure
  }
  // Code note on a clipboard propped nearly upright against a ledger stack, facing the doorway photo station
  // (matches the GLB clipboard: centre (167, −2.083, 104), 0.34 × 0.44 m, normal raised 16°).
  const note = documentMesh(.32, .42, 1024, (c, w, h) => {
    c.fillStyle = '#ece6d0'; c.fillRect(0, 0, w, h);
    for (let y = h * .1; y < h; y += h * .075) { c.fillStyle = 'rgba(80,110,160,.3)'; c.fillRect(0, y, w, 2); }
    c.fillStyle = '#0a0e22'; c.textBaseline = 'middle';
    c.font = `bold ${h * .085}px "KaiTi","STKaiti","Microsoft YaHei",serif`; c.fillText('闸门 F', w * .1, h * .2);
    c.font = `bold ${h * .32}px "Segoe Print","Ink Free","Comic Sans MS",cursive`; c.textAlign = 'center'; c.fillText(LIVING_GATE_CODE, w * .5, h * .48, w * .94);
    c.strokeStyle = '#0a0e22'; c.lineWidth = h * .01; c.beginPath(); c.moveTo(w * .05, h * .68); c.lineTo(w * .95, h * .67); c.stroke();
    c.font = `bold ${h * .1}px "KaiTi","STKaiti","Microsoft YaHei",serif`; c.fillText('对不起', w * .5, h * .8);
    c.font = `${h * .05}px "KaiTi","STKaiti","Microsoft YaHei",serif`; c.fillText('为了让里面的人安全', w * .5, h * .92);
    paperWear(c, w, h, 31, 1.2);
  }, {name: 'living-code-note', emissive: 0});
  disposers.push(note.dispose);
  // damp, slightly yellowed sheet: darker than the shared paper tint so the desk lamp cannot blow it out
  (note.mesh.material as T.MeshStandardMaterial).color.set('#a39d8f');
  {
    const g = new T.Group(); g.name = 'living.photo.code';
    // Closed, opaque document holder: no password face is exposed outside the pod.
    note.mesh.visible=false;
    const board = new T.Mesh(new T.BoxGeometry(.34, .44, .012), m.trim); owned.push(board.geometry); g.add(board);
    g.scale.setScalar(.45);
    g.traverse(o => { o.userData.interactionId = 'living.photo.code'; });
    // At the slumped torso's coat pocket, not on the desk clipboard stand.
    const lean = 16 * PI / 180, c = new T.Vector3(167.15, -2.05, 104.6), hz = new T.Vector3(162 - c.x, 0, 96 - c.z).normalize();
    const face = hz.multiplyScalar(Math.cos(lean)).add(new T.Vector3(0, Math.sin(lean), 0));
    g.position.copy(c); g.lookAt(c.clone().add(face));
    spaceGroups.get('R5')!.add(g); interactables.set('living.photo.code', g);
  }
  // Emergency gate-release placard (east wall, facing west).
  const guide = documentMesh(2.8, 2.0, 1536, (c, w, h) => {
    c.fillStyle = '#d9d3bb'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9b2a22'; c.fillRect(0, 0, w, h * .17);
    c.fillStyle = '#f4ece0'; c.textBaseline = 'middle';
    c.font = `bold ${h * .085}px "Microsoft YaHei",sans-serif`; c.fillText('闸门 F  应急开闸步骤', w * .04, h * .07);
    c.font = `600 ${h * .045}px "Bahnschrift","Arial Narrow",sans-serif`; c.fillText('GATE F — EMERGENCY MANUAL RELEASE', w * .04, h * .135);
    const steps: [string, string, (x: number, y: number, s: number) => void][] = [
      ['拉下手动泄压杆', 'PULL PRESSURE LEVER', (x, y, s) => { c.fillStyle = '#333'; c.fillRect(x - s * .08, y - s * .45, s * .16, s * .9); c.fillStyle = '#c33'; c.beginPath(); c.arc(x, y + s * .45, s * .14, 0, PI * 2); c.fill(); c.strokeStyle = '#222'; c.lineWidth = s * .05; c.beginPath(); c.moveTo(x + s * .3, y - s * .3); c.lineTo(x + s * .3, y + s * .3); c.lineTo(x + s * .2, y + s * .18); c.moveTo(x + s * .3, y + s * .3); c.lineTo(x + s * .4, y + s * .18); c.stroke(); }],
      ['输入密码', 'ENTER CODE', (x, y, s) => { c.fillStyle = '#333'; c.fillRect(x - s * .35, y - s * .45, s * .7, s * .9); c.fillStyle = '#ddd'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) c.fillRect(x - s * .27 + j * s * .2, y - s * .3 + i * s * .19, s * .14, s * .13); }],
      ['转动锁轮', 'TURN LOCK WHEEL', (x, y, s) => { c.strokeStyle = '#333'; c.lineWidth = s * .08; c.beginPath(); c.arc(x, y, s * .38, 0, PI * 2); c.stroke(); for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * s * .38, y + Math.sin(a) * s * .38); c.stroke(); } c.beginPath(); c.arc(x, y, s * .55, -1.2, .4); c.stroke(); }],
    ];
    steps.forEach(([cn, en, icon], i) => {
      const x0 = w * (.04 + i * .32), y0 = h * .22, cw = w * .29, ch = h * .7;
      c.fillStyle = '#efe9d6'; c.fillRect(x0, y0, cw, ch); c.strokeStyle = '#555'; c.lineWidth = 4; c.strokeRect(x0, y0, cw, ch);
      c.fillStyle = '#9b2a22'; c.beginPath(); c.arc(x0 + cw * .14, y0 + ch * .1, ch * .07, 0, PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = `bold ${ch * .09}px "Bahnschrift",sans-serif`; c.textAlign = 'center'; c.fillText(String(i + 1), x0 + cw * .14, y0 + ch * .105); c.textAlign = 'left';
      icon(x0 + cw * .5, y0 + ch * .42, ch * .45);
      c.fillStyle = '#1a1a1a'; c.font = `bold ${ch * .085}px "Microsoft YaHei",sans-serif`; c.fillText(cn, x0 + cw * .06, y0 + ch * .78, cw * .9);
      c.fillStyle = '#444'; c.font = `600 ${ch * .052}px "Bahnschrift",sans-serif`; c.fillText(en, x0 + cw * .06, y0 + ch * .9, cw * .9);
      if (i < 2) { c.fillStyle = '#9b2a22'; c.beginPath(); c.moveTo(x0 + cw + w * .005, y0 + ch * .4); c.lineTo(x0 + cw + w * .028, y0 + ch * .45); c.lineTo(x0 + cw + w * .005, y0 + ch * .5); c.fill(); }
    });
    paperWear(c, w, h, 77, .8);
  }, {name: 'living-guide-placard', emissive: .03});
  disposers.push(guide.dispose);
  {
    const g = new T.Group(); g.name = 'living.photo.guide'; g.userData.interactionId = 'living.photo.guide';
    guide.mesh.userData.interactionId = 'living.photo.guide'; g.add(guide.mesh);
    const frame = new T.Mesh(new T.BoxGeometry(2.92, 2.12, .05), m.trim); frame.position.z = -.03; g.add(frame); owned.push(frame.geometry);
    for (const [sx, sy] of [[-1.3, .9], [1.3, .9], [-1.3, -.9], [1.3, -.9]]) { const bolt = new T.Mesh(new T.CylinderGeometry(.025, .025, .17, 6), m.chrome); bolt.rotation.x = PI / 2; bolt.position.set(sx, sy, -.1); g.add(bolt); owned.push(bolt.geometry); }
    g.position.set(173.45, 0, 96); g.rotation.y = -PI / 2;
    spaceGroups.get('R5')!.add(g); interactables.set('living.photo.guide', g); photoTargets.set('living.photo.guide', g);
  }
  // Delroy Campbell's treatment application on the cork board (west wall, facing east).
  const form = documentMesh(1.3, 1.75, 1300, (c, w, h) => {
    c.fillStyle = '#ece6d3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a3c46'; c.fillRect(0, 0, w, h * .1);
    c.fillStyle = '#f2efe6'; c.textBaseline = 'middle'; c.font = `bold ${h * .05}px "Microsoft YaHei",sans-serif`; c.fillText('员工治疗申请单', w * .05, h * .05);
    c.font = `600 ${h * .024}px "Bahnschrift",sans-serif`; c.fillText('STAFF TREATMENT APPLICATION', w * .55, h * .05);
    const rows: [string, string, number][] = [['申请人', '德尔罗伊·坎贝尔', .07], ['NAME', 'DELROY CAMPBELL', .045], ['部门', '能源维护', .055], ['申请对象', '孙子（17岁）', .065], ['提交日期', '03 / 14  · 疗养区开业前', .045]];
    let y = h * .17;
    for (const [k, v, s] of rows) {
      c.fillStyle = '#555'; c.font = `${h * .028}px "Microsoft YaHei",sans-serif`; c.fillText(k, w * .05, y);
      c.fillStyle = '#16202a'; c.font = `bold ${h * s}px "Microsoft YaHei","KaiTi",sans-serif`; c.fillText(v, w * .05, y + h * (s * .7 + .025), w * .9);
      y += h * (s + .07); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(w * .05, y - h * .03, w * .9, 2);
    }
    // Status stamp.
    c.save(); c.translate(w * .5, h * .78); c.rotate(-.12);
    c.strokeStyle = '#a22a20'; c.lineWidth = h * .01; c.strokeRect(-w * .42, -h * .07, w * .84, h * .14);
    c.fillStyle = '#a22a20'; c.font = `bold ${h * .062}px "Microsoft YaHei",sans-serif`; c.textAlign = 'center'; c.fillText('等待治疗资格', 0, -h * .012);
    c.font = `bold ${h * .026}px "Bahnschrift",sans-serif`; c.fillText('PENDING ELIGIBILITY', 0, h * .045); c.restore();
    c.fillStyle = '#2b4f8a'; c.font = `italic ${h * .03}px "KaiTi","Microsoft YaHei",serif`; c.fillText('批注：继续累计服务时数', w * .06, h * .93);
    paperWear(c, w, h, 52, 1);
  }, {name: 'living-delroy-form', emissive: .03});
  disposers.push(form.dispose);
  {
    const g = new T.Group(); g.name = 'living.photo.delroy'; g.userData.interactionId = 'living.photo.delroy';
    const cork = new T.Mesh(new T.BoxGeometry(2.6, 2.0, .06), m.soil); cork.position.z = -.05; g.add(cork); owned.push(cork.geometry);
    const rim = new T.Mesh(new T.BoxGeometry(2.72, 2.12, .04), m.veneer); rim.position.z = -.08; g.add(rim); owned.push(rim.geometry);
    form.mesh.position.set(-.5, -.05, 0); form.mesh.rotation.z = .025; form.mesh.userData.interactionId = 'living.photo.delroy'; g.add(form.mesh);
    const r = rng(17);
    for (let i = 0; i < 5; i++) { const s = new T.Mesh(new T.PlaneGeometry(.42, .58), m.paper); s.position.set(.45 + (i % 2) * .5, .6 - Math.floor(i / 2) * .62, .005 + i * .001); s.rotation.z = (r() - .5) * .2; g.add(s); owned.push(s.geometry); }
    for (const [sx, sy] of [[-1.2, .9], [1.2, .9], [-1.2, -.9], [1.2, -.9]]) { const bolt = new T.Mesh(new T.CylinderGeometry(.025, .025, .14, 6), m.chrome); bolt.rotation.x = PI / 2; bolt.position.set(sx, sy, -.17); g.add(bolt); owned.push(bolt.geometry); }
    g.traverse(o => { o.userData.interactionId = 'living.photo.delroy'; });
    g.position.set(150.62, 0, 92); g.rotation.y = PI / 2;
    spaceGroups.get('R5')!.add(g); interactables.set('living.photo.delroy', g); photoTargets.set('living.photo.delroy', g);
  }
  shells.atlas.add('员工公告栏', 'STAFF NOTICES', 'room', [150.4, 1.3, 92], [1, 0, 0], 1.2);

  // ================================================================ laundry row (8 washers with dryers above)
  hero('laundry-row', (b) => {
    // R1 north wall (face z −23.7), same footprint as the GLB: four machines x 31.8…35.7, battery shelf x 28–30
    const r = rng(3);
    [31.8, 33.1, 34.4, 35.7].forEach((x, i) => {
      const kk = new Kit(b, new T.Matrix4().compose(new T.Vector3(x, -3, -23.12), new T.Quaternion(), new T.Vector3(.85, .75, .85)));
      washer(kk, m, i === 1 ? 1.6 : 0);
      plate(b, `W-${String(i + 1).padStart(2, '0')}`, '', 'room', [x + .33, -1.89, -22.53], [0, 0, 1], .32);
      if (r() < .5) b.box([x + (r() - .5) * .5, -2.75, -22.1], [.6, .3, .45], m.linen);
    });
    for (const y of [-2.2, -1.5, -.79, .2]) b.box([29, y, -20.4], [1.8, .04, .6], m.frame);
    for (const x of [28.12, 29.88]) for (const z of [-20.68, -20.12]) b.box([x, -1.25, z], [.04, 3.5, .04], m.frame);
    plate(b, '员工洗衣房', 'STAFF LAUNDRY', 'room', [33.75, .1, -23.66], [0, 0, 1], 1.6);
  });
  // GLB footprints: machine row on the north wall, the battery shelf (its front stays 3 m from the parking nose)
  solids.push(new T.Box3(new T.Vector3(31.1, -3, -23.7), new T.Vector3(36.4, -1.75, -22.5)), new T.Box3(new T.Vector3(28.06, -3, -20.8), new T.Vector3(29.94, .5, -20.02)));

  // ================================================================ ballast rack (R4, east side)
  hero('ballast-rack', (b) => {
    // free-standing pallet rack set back behind the hanging crate, GLB footprint: uprights x 116.05 / 117.15,
    // z 30.1…34.9, beams y −2.72 / −0.92 / 0.92; hoist rail at x 115.5 (bottom y 1.6), crate on its chain
    const xf = 116.05, xb = 117.15, top = 1.6;
    b.box([115.5, 1.69, 32.5], [.1, .18, 5.6], m.bandRed);
    for (const z of [30.1, 34.9]) b.box([115.8, 1.64, z], [.6, .08, .08], m.bandBlue);
    b.box([115.5, 1.55, 32.5], [.28, .16, .3], m.bandRed);
    b.box([115.5, .65, 32.5], [.03, 1.0, .03], m.frame);
    for (const z of [30.1, 31.7, 33.3, 34.9]) for (const x of [xf, xb]) b.box([x, (top - 3) / 2, z], [.09, top + 3, .08], m.bandBlue);
    for (const y of [-2.72, -.92, .92]) {
      for (const x of [xf, xb]) b.box([x, y - .06, 32.5], [.06, .12, 4.8], m.bandRed);
      b.box([(xf + xb) / 2, y + .004, 32.5], [xb - xf - .06, .008, 4.7], m.plate);
    }
    const r = rng(19);
    for (const y of [-2.72, .92]) for (let z = 30.4; z < 34.7; z += .42) {
      if (r() < .3 || (y > 0 && Math.abs(z - 32.5) < .6)) continue;
      b.box([116.65 + (r() - .5) * .2, y + .05 + (r() < .5 ? 0 : .09), z], [.3, .09, .11], m.frame);
    }
    plate(b, '压载物资 B-04', 'BALLAST · LEAD · SUBMERSIBLE USE', 'stencil', [116.0, 1.1, 30.9], [-1, 0, 0], 1.5);
  });
  // rack body, the hoist rail above the hull band, and the hanging crate + chain column (kept after pickup: the chain stays)
  solids.push(new T.Box3(new T.Vector3(116.0, -3, 29.9), new T.Vector3(117.2, 1.6, 35.1)),
    new T.Box3(new T.Vector3(115.4, 1.55, 29.7), new T.Vector3(117.2, 1.8, 35.3)),
    new T.Box3(new T.Vector3(115.05, -.9, 32.05), new T.Vector3(115.95, 1.6, 32.95)));

  // ================================================================ atrium balconies (y 0 and 6), columns
  const cutsY0: {wall: 'N' | 'S' | 'W' | 'E'; from: number; to: number}[] = [
    {wall: 'N', from: 121.3, to: 135.7}, {wall: 'N', from: 181, to: 195}, {wall: 'S', from: 155.3, to: 168.7}, {wall: 'W', from: 61.3, to: 74.7},
  ];
  // Deck spans covered by the Blender module tiles (ATRIUM_BALCONY_TILES) go into the hideable fallback;
  // the rest of the ring (door-cut spans, W/E sides, S storey 0 above the C6 door), columns and dorm doors stay.
  const D = ATRIUM_BALCONY_DEPTH, x0 = 110.3, x1 = 199.7, z0 = 42.3, z1 = 81.7;
  const tileSpans = (wall: 'N' | 'S' | 'W' | 'E', y: number) => ATRIUM_BALCONY_TILES.filter(t => t.wall === wall && t.position[1] === y)
    .map(t => [t.position[0] - ATRIUM_BALCONY_MODULE.length / 2, t.position[0] + ATRIUM_BALCONY_MODULE.length / 2] as [number, number]).sort((p, q) => p[0] - q[0]);
  const strips = (wall: 'N' | 'S' | 'W' | 'E', y: number, covered: boolean) => {
    const along = wall === 'N' || wall === 'S' ? [x0 + D, x1 - D] : [z0, z1];
    const cuts = y === 0 ? cutsY0.filter(c => c.wall === wall).sort((p, q) => p.from - q.from) : [];
    const open: [number, number][] = []; let cur = along[0];
    for (const c of cuts) { if (c.from > cur) open.push([cur, c.from]); cur = Math.max(cur, c.to); }
    if (cur < along[1]) open.push([cur, along[1]]);
    const out: [number, number][] = [];
    for (const [a, e] of open) {
      let p = a;
      for (const [ta, te] of tileSpans(wall, y)) {
        const s = Math.max(a, ta), f = Math.min(e, te);
        if (f <= s) continue;
        if (!covered && s > p) out.push([p, s]);
        if (covered) out.push([s, f]);
        p = Math.max(p, f);
      }
      if (!covered && p < e) out.push([p, e]);
    }
    return out.filter(([a, e]) => e - a > .05);
  };
  for (const t of ATRIUM_BALCONY_TILES) {
    const [cx, y, z] = t.position, hl = ATRIUM_BALCONY_MODULE.length / 2, dz = t.wall === 'N' ? [z, z + 3.27] : [z - 3.27, z];
    solids.push(new T.Box3(new T.Vector3(cx - hl, y - .7, dz[0]), new T.Vector3(cx + hl, y + .05, dz[1])));
  }
  const balconyRing = new Batcher('living-atrium-ring'); batchers.push(balconyRing);
  const balconyDecks = (b: Batcher, covered: boolean) => {
    const deck = (wall: 'N' | 'S' | 'W' | 'E', y: number, a: number, e: number) => {
      const box = wall === 'N' ? [[a, y - .45, z0], [e, y, z0 + D]] : wall === 'S' ? [[a, y - .45, z1 - D], [e, y, z1]] : wall === 'W' ? [[x0, y - .45, a], [x0 + D, y, e]] : [[x1 - D, y - .45, a], [x1, y, e]];
      const [mn, mx] = box as [V3, V3];
      b.slab(mn, mx, m.frame, {solid: true});
      b.slab([mn[0], y - .01, mn[2]], [mx[0], y + .02, mx[2]], m.carpet);
      b.slab([mn[0], y - .47, mn[2]], [mx[0], y - .45, mx[2]], m.ceiling);
      // fascia + railing on the open edge
      const edge = wall === 'N' ? mx[2] : wall === 'S' ? mn[2] : wall === 'W' ? mx[0] : mn[0];
      const along = wall === 'N' || wall === 'S';
      if (along) {
        b.slab([a, y - .7, edge - .06], [e, y + .05, edge + .06], m.veneer);
        b.rod([a, y + 1.1, edge], [e, y + 1.1, edge], .045, m.brass, 8);
        for (const h of [.35, .7]) b.rod([a, y + h, edge], [e, y + h, edge], .015, m.chrome, 5);
        for (let p = a + .2; p < e; p += 1.5) b.rod([p, y, edge], [p, y + 1.1, edge], .03, m.chrome, 6);
      } else {
        b.slab([edge - .06, y - .7, a], [edge + .06, y + .05, e], m.veneer);
        b.rod([edge, y + 1.1, a], [edge, y + 1.1, e], .045, m.brass, 8);
        for (const h of [.35, .7]) b.rod([edge, y + h, a], [edge, y + h, e], .015, m.chrome, 5);
        for (let p = a + .2; p < e; p += 1.5) b.rod([edge, y, p], [edge, y + 1.1, p], .03, m.chrome, 6);
      }
    };
    for (const y of ATRIUM_BALCONY_Y) for (const wall of ['N', 'S', 'W', 'E'] as const) for (const [a, e] of strips(wall, y, covered)) deck(wall, y, a, e);
  };
  hero('atrium-balcony', b => balconyDecks(b, true));
  {
    const b = balconyRing;
    balconyDecks(b, false);
    // Columns at the deck edge (round, tiled base), skipping door cuts.
    const col = (x: number, z: number) => {
      b.rod([x, -9, z], [x, 9, z], .42, m.veneer, 18, {solid: false});
      b.rod([x, -9, z], [x, -7.6, z], .52, m.wallTile, 18);
      for (const y of [-.6, 5.4]) b.rod([x, y, z], [x, y + .5, z], .56, m.frame, 18);
      solids.push(new T.Box3(new T.Vector3(x - .45, -9, z - .45), new T.Vector3(x + .45, 9, z + .45)));
    };
    const blocked = (wall: 'N' | 'S' | 'W' | 'E', v: number) => cutsY0.some(c => c.wall === wall && v > c.from - 1.5 && v < c.to + 1.5);
    for (let x = 114; x <= 196; x += 9) { if (!blocked('N', x)) col(x, z0 + D + .1); if (!blocked('S', x)) col(x, z1 - D - .1); }
    for (const z of [51, 60, 69]) { if (!blocked('W', z)) col(x0 + D + .1, z); col(x1 - D - .1, z); }
    // Upper-storey dorm doors along the balconies.
    for (const y of ATRIUM_BALCONY_Y) for (let x = 118; x < 196; x += 7.5) {
      if (!(y === 0 && (blocked('N', x) || blocked('S', x)))) {
        dormDoor(Kit.at(b, [x, y, z0], 0), m, (x * 7 + y) % 5 < 1);
        dormDoor(Kit.at(b, [x + 3, y, z1], PI), m, (x * 3 + y) % 7 < 1);
      }
    }
    b.build(spaceGroups.get('A')!).name = 'living-atrium-ring';
    solids.push(...b.solids);
  }

  // ================================================================ gate F (frame is the hero; leaf is the animated gate mesh)
  hero('gate-f', (b, k) => {
    // local origin: floor at the A-side wall face, centre x 188; +Z south into the atrium
    // Posts and a tall pocket housing that hides the raised leaf.
    k.box([-4.6, 4.1, .35], [1.2, 8.2, .7], m.indSteel); k.box([4.6, 4.1, .35], [1.2, 8.2, .7], m.indSteel);
    k.box([0, 5.9, .35], [10.4, 4.6, .7], m.rustSheet);
    for (const x of [-3, -1, 1, 3]) k.box([x, 5.9, .72], [.16, 4.5, .06], m.frame);
    k.box([0, 3.66, .72], [10.4, .14, .03], m.hazard);
    for (const x of [-4.6, 4.6]) { k.box([x, 2.0, .72], [.5, 4.2, .04], m.hazard); k.rod([x * 1.1, .3, .9], [x * 1.1, 5.0, .9], .12, m.frame, 12); k.rod([x * 1.1, 3, .9], [x * 1.1, 4.9, .9], .08, m.chrome, 10); }
    // Amber gate beacons under the housing lip.
    for (const x of [-3.2, 3.2]) { k.box([x, 3.5, .78], [.42, .26, .16], m.frame); k.box([x, 3.42, .87], [.32, .16, .06], m.lampAmber); }
    k.box([0, -.04, .5], [8.4, .08, 1.0], m.plate);
    plate(b, 'F 闸门', 'GATE F  ·  LIVING QUARTERS', 'red', [188, 4.4, 43.08], [0, 0, 1], 4.2);
  });
  solids.push(
    new T.Box3(new T.Vector3(182.8, -3, 42.3), new T.Vector3(184.2, 5.2, 43.0)),
    new T.Box3(new T.Vector3(191.8, -3, 42.3), new T.Vector3(193.2, 5.2, 43.0)),
    new T.Box3(new T.Vector3(184.2, .6, 42.3), new T.Vector3(191.8, 5.2, 43.0)),
  );
  const gateMesh = new T.Group(); gateMesh.name = 'living-gate-f-leaf';
  {
    const b = new Batcher('living-gate-leaf'); batchers.push(b);
    const k = new Kit(b, new T.Matrix4());
    k.box([0, 1.9, 0], [8.2, 3.8, .3], m.rustSheet);
    for (const x of [-3, -1.5, 1.5, 3]) k.box([x, 1.9, .18], [.18, 3.7, .1], m.frame);
    for (const y of [.5, 3.3]) k.box([0, y, .18], [8.1, .2, .1], m.frame);
    k.box([0, .12, .17], [8.2, .2, .04], m.hazard);
    k.ring([0, 1.8, .2], .48, .09, m.frame, [0, 0, 0], 28);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.cyl([Math.cos(a) * .48, 1.8 + Math.sin(a) * .48, .29], .035, .035, .05, m.chrome, 6, [PI / 2, 0, 0]); }
    // inner (sanatorium) face: lock wheel stub and stiffeners
    k.ring([2.4, 1.4, -.2], .35, .04, m.bandRed, [0, 0, 0], 20);
    k.box([0, 1.9, -.17], [8.1, .16, .06], m.frame);
    b.build(gateMesh);
    gateMesh.position.set(188, -3, 42.13);
    spaceGroups.get('A')!.add(gateMesh);
  }
  const porthole = new T.Mesh(new T.CylinderGeometry(.42, .42, .32, 28), m.blastGlass); porthole.rotation.x = PI / 2; porthole.position.set(0, 1.8, 0); owned.push(porthole.geometry);
  gateMesh.add(porthole);
  // Uplink observation window: interactable rides with the leaf.
  {
    const it = LIVING_ITEMS.find(i => i.id === 'living.uplink.gate')!;
    const g = new T.Group(); g.name = it.id; g.userData.interactionId = it.id;
    const p = new T.Mesh(new T.CylinderGeometry(.55, .55, .3, 20), hidden); p.rotation.x = PI / 2; p.userData.interactionId = it.id; owned.push(p.geometry); g.add(p);
    porthole.userData.interactionId = it.id;
    g.position.set(0, 1.8, .47); gateMesh.add(g);   // item point z 42.6 (outer viewport face)
    interactables.set(it.id, g); photoTargets.set(it.id, g);
  }
  // Inner controls (sanatorium side): pressure lever, keypad, lock wheel — what Alex operates.
  let gateInner: T.Group;
  {
    const b = new Batcher('living-gate-inner'); batchers.push(b);
    const k = Kit.at(b, [182.6, -3, 41.68], PI);
    k.box([0, 1.3, .08], [.9, 1.6, .16], m.indGreen);
    k.rod([-.25, 1.6, .2], [-.25, 1.1, .45], .035, m.bandRed, 8); k.sphere([-.25, 1.1, .45], [.07, .07, .07], m.bandRed, 8);
    k.box([.2, 1.55, .17], [.3, .4, .02], m.trim); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.box([.11 + j * .09, 1.68 - i * .08, .185], [.06, .05, .01], m.chrome);
    k.box([.2, 1.8, .18], [.22, .06, .01], m.lampAmber);
    k.ring([0, .85, .22], .25, .03, m.bandRed, [0, 0, 0], 18);
    plate(b, '闸门 F 内侧控制', 'GATE F — INNER RELEASE', 'warn', [182.6, -.75, 41.67], [0, 0, -1], 1.2);
    gateInner = b.build(spaceGroups.get('N')!); gateInner.name = 'living-gate-inner-controls';
  }
  const gate = {mesh: gateMesh, bounds: new T.Box3(new T.Vector3(184, -3, 41.7), new T.Vector3(192, .6, 42.3))};

  // ================================================================ amber cocoon around a dead resident (M)
  hero('cocoon-corpse', () => {});
  const cocoonBuild = buildCocoon(); disposers.push(() => cocoonBuild.dispose());
  const cocoon = cocoonBuild.root;
  cocoon.position.set(...ALEX_MARKS.cocoon); cocoon.position.y = -2.97;
  fallbacks.get('cocoon-corpse')!.add(cocoon);

  // ================================================================ Blender GLB adoption
  const parts: HeroBuild['parts'] = {
    'pipe-intake': interactables.get('living.pipe.intake')!, 'wheel-heat': valveWheels.heat, 'wheel-feed': valveWheels.feed, 'wheel-cool': valveWheels.cool,
    'probe-case': probeCase, 'battery-case': interactables.get('living.box.battery')!, 'ballast-crate': interactables.get('living.box.ballast')!, 'gate-leaf': gateMesh,
  };
  for (const [k, o] of Object.entries(parts)) o.userData.heroPart = k;
  const glbParts = new Map<string, T.Object3D>();
  const hideProcedural = (g: T.Object3D, keep?: T.Object3D) => g.children.forEach(c => { if (c !== keep && !c.name.endsWith(':hit')) c.visible = false; });
  /** Re-parents `node` into `driver` at the driver's rest pose so the world transform is kept exactly. */
  const adoptInto = (driver: T.Object3D, node: T.Object3D, rest: () => void) => {
    const pos = driver.position.clone(), quat = driver.quaternion.clone();
    rest(); driver.updateWorldMatrix(true, false); node.updateWorldMatrix(true, false);
    driver.attach(node);
    driver.position.copy(pos); driver.quaternion.copy(quat);
  };
  registerHeroAdopter(fallbacks, {
    adopt(name, scene) {
      scene.updateMatrixWorld(true);
      for (const spec of HERO_GLB_PARTS) {
        if (spec.hero !== name) continue;
        // children of an already adopted part (port glass on the leaf) are no longer under `scene`
        const node = scene.getObjectByName(spec.node) ?? [...glbParts.values()].map(n => n.getObjectByName(spec.node)).find(Boolean);
        if (!node) { console.warn(`[living] hero GLB ${name}: part ${spec.node} missing, keeping procedural`); continue; }
        if (spec.id) node.traverse(o => { o.userData.interactionId = spec.id; });
        if (spec.role === 'tag') continue;
        if (spec.role === 'wheel') {
          const g = valveWheels[spec.node.slice(6) as 'heat' | 'feed' | 'cool'];
          hideProcedural(g);
          adoptInto(g, node, () => { g.rotation.z = 0; });
        } else if (spec.role === 'leaf') {
          const uplink = interactables.get('living.uplink.gate')!;
          hideProcedural(gateMesh, uplink);
          adoptInto(gateMesh, node, () => { gateMesh.position.y = -3; });
          gateInner.visible = false;   // keypad / relief lever / lock wheel come with the GLB
        } else {
          const g = interactables.get(spec.id!)!;
          hideProcedural(g);
          adoptInto(g, node, () => {});
        }
        glbParts.set(spec.node, node);
      }
      if (name === 'glass-blast-door') pane.visible = false;
    },
  });

  return {
    fallbacks, interactables, photoTargets, solids, gate, valveWheels, probeCase: probeCase, guard, cocoon, pane, gateInner, parts, glbParts,
    dispose() {
      for (const n of glbParts.values()) { n.removeFromParent(); disposeGlbScene(n); }
      disposers.forEach(d => d()); owned.forEach(o => o.dispose()); batchers.forEach(b => b.dispose());
    },
  };
}

/** Simple articulated human (no hinges): standing origin at the hip line (y 0 = pelvis). */
export function human(k: Kit, m: LivingMaterials, o: {coat: T.Material; skin: T.Material; pose: 'float' | 'slump' | 'lie'}) {
  const {coat, skin} = o;
  if (o.pose === 'slump') {
    // seated in a chair, torso folded forward over the desk (+Z), head turned
    k.sphere([0, .05, 0], [.19, .14, .16], coat, 10);
    k.rod([0, .08, 0], [0, .38, .42], .17, coat, 10, .2);
    k.sphere([0, .42, .5], [.24, .16, .2], coat, 10);
    k.sphere([.05, .42, .78], [.11, .13, .1], skin, 12, [0, .4, 1.2]);
    k.sphere([.05, .48, .76], [.12, .08, .11], m.rubber, 10, [0, .4, 1.2]);
    for (const s of [-1, 1]) {
      k.rod([s * .1, 0, .05], [s * .12, 0, .5], .08, coat, 8); k.rod([s * .12, 0, .5], [s * .13, -.45, .52], .06, coat, 8);
      k.box([s * .13, -.5, .58], [.1, .08, .24], m.rubber);
      // left arm reaches over the desk edge (holding the note); right arm folded under the head
      if (s < 0) { k.rod([-.25, .4, .5], [-.3, .33, .95], .05, coat, 8); k.rod([-.3, .33, .95], [-.27, .31, 1.5], .04, skin, 6); }
      else { k.rod([.24, .42, .48], [.26, .34, .72], .05, coat, 8); k.rod([.26, .34, .72], [.1, .33, .82], .04, skin, 6); }
    }
    return;
  }
  if (o.pose === 'lie') {
    k.sphere([0, .55, 0], [.2, .3, .13], coat, 10); k.sphere([0, 1.02, 0], [.1, .12, .1], skin, 10);
    for (const s of [-1, 1]) { k.rod([s * .1, .25, 0], [s * .1, -.6, .02], .07, coat, 7); k.rod([s * .22, .75, 0], [s * .18, .3, .06], .045, coat, 6); }
    return;
  }
  // float: limp, arms drifting up, head tipped back
  k.sphere([0, .05, 0], [.19, .15, .14], coat, 10);
  k.rod([0, .1, 0], [0, .55, -.03], .17, coat, 10, .21);
  k.sphere([0, .58, -.03], [.24, .14, .15], coat, 10);
  k.rod([0, .68, -.04], [0, .78, -.07], .06, skin, 8);
  k.sphere([0, .9, -.1], [.1, .125, .11], skin, 12, [-.5, 0, 0]);
  k.sphere([0, .97, -.14], [.105, .07, .1], m.rubber, 10, [-.5, 0, 0]);
  for (const s of [-1, 1]) {
    k.rod([s * .1, -.02, 0], [s * .14, -.45, .12], .085, coat, 8); k.rod([s * .14, -.45, .12], [s * .12, -.85, .02], .065, coat, 8);
    k.box([s * .12, -.92, .06], [.11, .09, .26], m.rubber);
    k.rod([s * .23, .55, -.03], [s * .38, .78, .12], .055, coat, 8); k.rod([s * .38, .78, .12], [s * .42, 1.05, .25], .045, skin, 6);
    k.sphere([s * .43, 1.12, .27], [.05, .07, .03], skin, 8);
  }
}
