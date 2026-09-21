import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3,
  CylinderGeometry, DataTexture, DoubleSide, Euler, Group, Matrix4, Mesh,
  MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry,
  RGBAFormat, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionRoom } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
export interface ExpeditionStorytelling {
  root: Group;
  /** World-space conservative vignette solids; no centre-lane or item-approach overlap. */
  colliders: Box3[];
  /** Absolute seconds; only the caged fan moves. */
  update(time: number): void;
  dispose(): void;
  views: Array<{ name: string; view: V3; yaw: number; pitch: number }>;
}

/** Physical observations only: no dates, named personnel, causes, or new canonical events. */
export const EXPEDITION_PROP_NOTES = [
  ['断开的工作台', '矿样盘翻覆；筛网仍夹着碎屑。', 'MINERAL SORTING / TRAY 01'],
  ['重复的检验牌', '旧锈覆盖管壁；替换夹箍仍明亮。', 'INSPECTION / CHECK AGAIN'],
  ['破开的隔热层', '包覆层向外翻开；纸页压在沉积下。', 'INSULATION / SAMPLE NOTES'],
  ['空置的配给格', '封条已断；相邻格仍贴同一标签。', 'RATION / EMPTY / SEAL CHECK'],
  ['无人交班位', '时针不动；防护笼内叶片仍转。', 'SHIFT / CLOCK / VENTILATION'],
  ['空着的吊带', '衣袖塌下；观察面后只有黑水。', 'HARNESS / RETURN TO HOOK'],
  ['洁净的接触面', '白手套搁在导轨上；泥止于边缘。', 'GUIDE RAIL / KEEP CLEAR'],
] as const;

/** No lights, gameplay mutation, shared-material disposal, or positive-X hall occupation.
 * Static geometry is merged per room/material. All visible geometry, including overhead
 * debris, is confined to a validated negative-X corner envelope (floor -2, ceiling 3.8).
 * Attach root without an additional transform: colliders and views are world-space.
 */
export function createExpeditionStorytelling(level: ExpeditionLevel, m: ReferenceMaterials): ExpeditionStorytelling {
  const root = new Group(); root.name = `expedition-storytelling.${level.id}`;
  const colliders: Box3[] = [], views: ExpeditionStorytelling['views'] = [];
  const geometry = new Set<BufferGeometry>(), owned: MeshStandardMaterial[] = [];
  const fans: Group[] = [];
  const notes = EXPEDITION_PROP_NOTES[level.index];
  if (!notes) throw new RangeError('Storytelling requires expedition index 0–6');
  const clone = (source: MeshStandardMaterial, color: string, roughness: number) => {
    const material = source.clone(); material.color.set(color); material.roughness = roughness;
    owned.push(material); return material;
  };
  const rust = clone(m.steel, '#694533', .98);
  const clean = clone(m.steel, '#b8cfcb', .36);
  const fabric = clone(m.cloth, '#475850', .95); fabric.side = DoubleSide;
  // Diffuse local finishes separate evidence from its dark backing without adding light
  // or increasing exposure. Shared steel maps otherwise multiply these small tools to black.
  const toolFinish = new MeshStandardMaterial({ color: '#a69b79', roughness: .79, metalness: .12 });
  const shelfFinish = new MeshStandardMaterial({ color: '#607371', roughness: .88, metalness: .10 });
  const edgeFinish = new MeshStandardMaterial({ color: '#9baaa0', roughness: .90, metalness: 0 });
  const garment = fabric.clone(); garment.color.set('#8b9689'); garment.map = null;
  garment.metalness = 0; garment.roughness = .96;
  owned.push(toolFinish, shelfFinish, edgeFinish, garment);
  const chalk = clone(m.hull, '#deddd0', .88);
  // Clean glove must not inherit the shared hull's corrosion maps.
  chalk.map = chalk.normalMap = chalk.roughnessMap = chalk.metalnessMap = null; chalk.metalness = 0;
  const black = new MeshStandardMaterial({ color: '#020709', roughness: .38, metalness: .08 });
  owned.push(black);

  // One 1024x512 atlas, eight inset tiles. Notes are also plain metadata for main/runtime.
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (canvas) { canvas.width = 1024; canvas.height = 512; }
  const ctx = canvas?.getContext('2d') ?? null;
  const labels = [
    [notes[0], notes[1], notes[2]],
    ['检验 / INSPECT', '复核后归位', 'CHECK / RETURN'],
    ['矿样 / SAMPLE', '筛盘 · 留样', 'TRAY / SAMPLE'],
    ['封条 / SEAL', '空置 · 待复核', 'EMPTY / CHECK'],
    ['交班 / SHIFT', '记录位 · 未填', 'LOG / CLOCK'],
    ['吊带 / HARNESS', '检查挂点', 'RETURN TO HOOK'],
    ['导轨 / GUIDE', '保持通道畅通', 'KEEP CLEAR'],
    ['隔热 / INSULATION', '沉积物 · 纸页', 'SAMPLE NOTES'],
  ];
  labels.forEach((lines, i) => {
    if (!ctx) return;
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 128;
    ctx.fillStyle = '#c1bea5'; ctx.fillRect(x, y, 512, 128);
    ctx.fillStyle = '#263b3c'; ctx.fillRect(x + 8, y + 8, 496, 7);
    ctx.font = 'bold 25px sans-serif'; ctx.fillText(lines[0], x + 20, y + 45);
    ctx.font = '19px sans-serif'; ctx.fillText(lines[1], x + 20, y + 78);
    ctx.font = '17px monospace'; ctx.fillText(lines[2], x + 20, y + 109);
  });
  // CPU geometry tests (and unavailable Canvas2D) retain the same material/UV contract.
  // Browser rendering still uses the full atlas; textual observations remain in metadata.
  const atlas = canvas && ctx ? new CanvasTexture(canvas)
    : new DataTexture(new Uint8Array([193, 190, 165, 255]), 1, 1, RGBAFormat);
  atlas.colorSpace = SRGBColorSpace; atlas.needsUpdate = true;
  const paper = new MeshStandardMaterial({ map: atlas, roughness: .95, metalness: 0, side: DoubleSide });
  owned.push(paper);

  // Existing item meshes fit inside a 1.2m horizontal half-extent. Reserve that bound
  // PLUS 2m clearance, not merely a 2m radius around the interaction point.
  const reserved = level.items.map(item => {
    const room = level.rooms.find(r => r.id === item.room);
    if (!room) throw new Error(`Story item has unknown room: ${item.id}`);
    return new Box3(new Vector3(room.x + item.x - 3.2, -2, room.z + item.z - 3.2),
      new Vector3(room.x + item.x + 3.2, 3.8, room.z + item.z + 3.2));
  });
  reserved.push(new Box3(new Vector3(level.spawn[0] - 2, -2, level.spawn[1] - 2),
    new Vector3(level.spawn[0] + 2, 3.8, level.spawn[1] + 2)));
  let batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  let origin = new Vector3(), current: Group, envelope: Box3;
  const pose = (p: V3, r: V3): Matrix4 => new Matrix4().compose(new Vector3(...p),
    new Quaternion().setFromEuler(new Euler(...r)), new Vector3(1, 1, 1));
  function add(g: BufferGeometry, mat: MeshStandardMaterial, p: V3, r: V3 = [0, 0, 0]) {
    g.applyMatrix4(pose(p, r)); g.computeBoundingBox();
    const world = g.boundingBox!.clone().translate(origin);
    if (!envelope.clone().expandByScalar(.001).containsBox(world)) {
      g.dispose(); throw new Error(`Story geometry exceeds reserved corner: ${current.name}`);
    }
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose(); flat.clearGroups();
    const pieces = batches.get(mat) ?? []; pieces.push(flat); batches.set(mat, pieces);
  }
  const box = (p: V3, s: V3, mat = m.steel, r: V3 = [0, 0, 0]) => add(new BoxGeometry(...s), mat, p, r);
  const cyl = (p: V3, radius: number, height: number, mat = m.steel, r: V3 = [0, 0, 0], top = radius) =>
    add(new CylinderGeometry(top, radius, height, 12), mat, p, r);
  const ring = (p: V3, radius: number, mat = m.steel, r: V3 = [0, 0, 0]) =>
    add(new TorusGeometry(radius, .023, 5, 20), mat, p, r);
  function cable(points: V3[], radius = .025, mat = m.rubber) {
    add(new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), 24, radius, 5, false), mat, [0, 0, 0]);
  }
  function card(p: V3, tile = 0, width = 1.12, r: V3 = [0, 0, 0]) {
    const g = new PlaneGeometry(width, width / 4), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i,
      ((tile % 2) * 512 + 4 + uv.getX(i) * 504) / 1024,
      1 - (Math.floor(tile / 2) * 128 + 4 + (1 - uv.getY(i)) * 120) / 512);
    add(g, paper, p, r);
  }
  function bottle(x: number, z: number, mat = m.hull) {
    cyl([x, -1.37, z], .14, .96, mat);
    add(new SphereGeometry(.14, 10, 6), mat, [x, -.89, z]);
    cyl([x, -.70, z], .045, .16, clean);
    box([x, -.65, z], [.16, .045, .045], m.red);
    for (const y of [-1.65, -1.06]) ring([x, y, z], .145, m.rubber, [Math.PI / 2, 0, 0]);
  }
  function chair(x = .75, z = .65) {
    box([x, -1.36, z], [.49, .07, .46], fabric);
    box([x, -.99, z - .2], [.48, .52, .055], fabric, [-.14, 0, 0]);
    for (const dx of [-.20, .20]) for (const dz of [-.18, .18])
      cyl([x + dx, -1.66, z + dz], .025, .57);
  }
  function bench(broken = false) {
    box([-.52, -.72, -.28], [.98, .09, .80], m.hull);
    box([.5, broken ? -.85 : -.72, -.28], [.98, .09, .80], m.hull, [0, 0, broken ? -.24 : 0]);
    for (const x of [-.91, .88]) for (const z of [-.59, .04]) {
      cyl([x, -1.33, z], .04, 1.22, rust, [0, 0, broken && x > 0 ? -.18 : 0]);
    }
    box([0, -1.63, -.37], [1.75, .06, .50], rust);
  }
  function tray(x: number, y: number, z: number, tipped = false) {
    box([x, y, z], [.56, .035, .38], rust, [tipped ? .48 : 0, .12, 0]);
    for (const dx of [-.27, .27]) box([x + dx, y + .055, z], [.025, .12, .38], m.steel);
    box([x, y + .055, z - .18], [.54, .12, .025], m.steel);
    for (let i = 0; i < 4; i++) {
      const g = new CylinderGeometry(.03, .065, .12 + i * .02, 5);
      add(g, rust, [x - .17 + i * .11, y + .1, z + (i % 2) * .06], [.2, i, .32]);
    }
  }
  function cloth(p: V3, w: number, h: number, phase = 0, material = fabric) {
    const g = new PlaneGeometry(w, h, 8, 12), v = g.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const t = .5 - v.getY(i) / h, u = v.getX(i) / w;
      v.setZ(i, .06 * Math.sin(u * 21 + t * 7 + phase) * t);
      v.setY(i, v.getY(i) - .035 * Math.sin((u + .5) * Math.PI));
    }
    g.computeVertexNormals(); add(g, material, p);
  }
  function common(sector: number) {
    // Upper fragments stay within 3.8m; no dangling geometry in the central cross.
    box([-.55, 3.55, -.25], [1.10, .055, .65], m.hull, [0, 0, -.16]);
    cable([[-1, 3.49, -.3], [-.85, 2.9, -.24], [-.35, 2.77, -.2], [.08, 3.46, -.28]]);
    box([.58, 3.47, -.4], [.71, .11, .24], m.steel);
    box([.58, 3.40, -.39], [.57, .025, .16], chalk);
    box([-.87, -1.94, .65], [.54, .045, .48], m.hull, [.03, .3, .05]);
    cable([[-1.12, -1.87, -.7], [-1.08, -1.84, .1], [-.72, -1.86, .52], [-.3, -1.88, .8]]);
    serviceStructure(sector);
    card([0, 2.48, -.82]);
    current.userData.propNotes = { title: notes[0], observation: notes[1], room: current.name, sector };
  }
  function serviceStructure(sector: number) {
    // Slim rear-wall services fill the vertical workplace envelope without widening it.
    // Keep the observation pane uncovered and the clean rail's surrounding services clean.
    const finish = level.index === 6 ? clean : rust;
    for (const x of [-1.17, 1.17]) {
      cyl([x, .68, -.99], .032, 4.8, finish);
      for (const y of [-1.40, .03, 1.61, 2.93]) {
        box([x, y, -1.035], [.17, .11, .08], m.steel);
        cyl([x, y, -.98], .023, .04, clean, [Math.PI / 2, 0, 0]);
      }
    }
    // Open cable ladder, with two independently sagging runs and visible cross supports.
    for (const z of [-1.04, -.76]) box([0, 3.05, z], [2.35, .045, .045], finish);
    for (let i = 0; i < 9; i++) box([-1.06 + i * .265, 3.04, -.9], [.035, .025, .28], m.steel);
    cable([[-1.12, 3.1, -.9], [-.65, 3.08, -.88], [.35, 3.09, -.89], [1.1, 2.87, -.93]], .032);
    cable([[-1.1, 3.12, -.81], [-.67, 2.64, -.67], [-.22, 2.72, -.62], [.19, 3.11, -.81]], .017);
    // Side-facing junction cabinet with a cracked-open lid, gland and downward conduit.
    box([1.10, 2.15, -.75], [.14, .57, .48], m.hull);
    box([1.015, 2.15, -.70], [.025, .48, .39], finish, [0, -.25, 0]);
    for (let i = 0; i < 4; i++) box([.99, 2.03 + i * .075, -.65], [.023, .016, .23], m.rubber);
    cable([[1.1, 1.87, -.75], [1.1, 1.62, -.68], [1.16, 1.42, -.93]], .022);
    // Distinct hanging cable lengths per sector, no per-frame or random allocation.
    cable([[-1.13, 2.75, -.96], [-1.12, 2.3 - sector * .09, -.72],
      [-1.04, 1.94 - sector * .09, -.59]], .018);
    cyl([-1.04, 1.91 - sector * .09, -.59], .038, .13, m.steel);
  }
  function mineralBench() {
    bench(true); tray(-.46, -.64, -.22); tray(.43, -1.81, .36, true);
    chair(.73, .68); bottle(-1.08, -.73);
    card([-.43, -.65, .03], 2, .43, [-Math.PI / 2, 0, .15]);
    // Back of the broken sorting bench: a full-height open sample rack, not solid crates.
    for (const x of [-1.02, 1.02]) {
      box([x, .64, -.86], [.065, 3.16, .07], rust);
      for (let i = 0; i < 12; i++) box([x, -.73 + i * .25, -.812], [.024, .06, .018], m.rubber);
    }
    for (const y of [.68, 1.56]) {
      box([0, y, -.60], [2.12, .045, .54], m.hull);
      box([0, y + .055, -.86], [2.12, .11, .025], rust);
      box([0, y + .035, -.325], [2.12, .07, .025], m.steel);
      for (const x of [-.98, .98]) {
        box([x, y - .16, -.60], [.035, .32, .40], rust, [.32, 0, 0]);
      }
    }
    tray(-.60, .74, -.58); tray(.16, 1.61, -.57);
    // A cage of cylindrical sample sleeves, several missing: readable negative spaces.
    for (let i = 0; i < 5; i++) {
      const x = .21 + i * .16;
      ring([x, .85, -.58], .060, m.steel, [Math.PI / 2, 0, 0]);
      if (i !== 2) {
        cyl([x, .94, -.58], .05, .40, i === 4 ? clean : m.hull);
        cyl([x, 1.15, -.58], .058, .035, rust);
      }
    }
    for (const x of [.10, .96]) box([x, .88, -.76], [.025, .29, .025], rust);
    box([.53, 1.01, -.76], [.88, .025, .025], m.steel);
    // Coil, loose sieve and lifted label on the upper tier.
    for (let i = 0; i < 4; i++) ring([-.68, 1.64 + i * .043, -.58], .17, m.rubber, [Math.PI / 2, 0, 0]);
    ring([.77, 1.88, -.70], .22, rust);
    for (let i = -2; i <= 2; i++) box([.77 + i * .066, 1.88, -.69], [.010, .32, .012], m.steel);
    // Perforated tool board between the desk and lowest shelf, with actual hanging tools.
    box([0, .01, -.87], [1.62, .76, .035], rust);
    for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++)
      box([-.70 + col * .17, -.25 + row * .16, -.846], [.026, .026, .012], m.rubber);
    for (const x of [-.55, -.10, .45]) {
      ring([x, .23, -.79], .054, clean);
      box([x, .02, -.78], [.070, .34, .045], toolFinish, [0, 0, x * .2]);
      box([x - .065, -.16, -.78], [.055, .13, .045], toolFinish);
      box([x + .025, -.16, -.78], [.055, .13, .045], toolFinish);
    }
    for (const [x, y] of [[-.62, .58], [.48, .58], [.12, 1.47]]) card([x, y, -.299], 2, .44);
    // Interrupted work continues onto the lower rack and floor: nested empty trays,
    // loose record sheets and a rag hanging over the broken edge, not random rubble.
    for (let i = 0; i < 3; i++) {
      box([-.37, -1.56 + i * .075, -.36], [.68, .025, .43], m.steel);
      box([-.37, -1.52 + i * .075, -.55], [.68, .07, .025], rust);
    }
    cloth([-.77, -1.10, .16], .34, .65, 2);
    for (let i = 0; i < 4; i++) card([-.56 + i * .20, -1.953 + i * .009, .45 + (i % 2) * .22],
      2, .35, [-Math.PI / 2, 0, -.3 + i * .38]);
    cable([[-.8, -.63, -.3], [-.72, -.58, -.1], [-.51, -.61, .02], [-.45, -.9, .13]], .016);
  }
  function inspection() {
    cyl([-.4, .12, -.45], .23, 3.35, rust);
    riserConnections(-.4, -.45, .23, 1.795, -1.555);
    for (const y of [-1.35, -.4, .55, 1.3]) {
      ring([-.4, y, -.45], .25, y === .55 ? clean : rust, [Math.PI / 2, 0, 0]);
      box([-.4, y, -.15], [.40, .10, .12], y === .55 ? clean : rust);
      cable([[-.22, y, -.20], [-.03, y - .12, -.08], [.07, y - .23, .02]], .009);
      card([.12, y - .26, .04], 1, .42);
    }
    // A side-mounted service shelf, not a tabletop intersecting the vertical pipe.
    box([.50, -.72, -.23], [.88, .07, .64], m.hull);
    for (const x of [.14, .86]) {
      box([x, -1.04, -.48], [.045, .64, .08], rust);
      box([x, -.88, -.28], [.045, .39, .045], m.steel, [-.65, 0, 0]);
    }
    tray(.45, -.64, -.18); bottle(.98, .59);
    box([-.38, .58, -.12], [.50, .06, .10], clean);
    card([.46, -.655, -.28], 1, .60, [-Math.PI / 2, 0, 0]);
  }
  function riserConnections(x: number, z: number, radius: number, top: number, bottom: number) {
    // Continuous pressure path: floor foot -> riser -> elbow -> rear service manifold.
    cyl([x, -1.94, z], radius + .15, .10, m.steel);
    cyl([x, (bottom - 1.90) / 2, z], radius * .83, bottom + 1.90, rust);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      cyl([x + Math.cos(a) * (radius + .10), -1.87, z + Math.sin(a) * (radius + .10)], .024, .05, clean);
    }
    cable([[x, top - .07, z], [x, 2.12, z], [x, 2.31, z - .20], [x, 2.31, -.91]], radius * .78, rust);
    ring([x, top - .015, z], radius + .045, m.steel, [Math.PI / 2, 0, 0]);
    // Rear manifold is supported by the same upright service rails used in common().
    cyl([0, 2.31, -.91], .14, 2.34, m.steel, [0, 0, Math.PI / 2]);
    for (const xx of [-1.10, 1.10]) box([xx, 2.31, -.96], [.12, .36, .18], rust);
    for (const y of [-1.18, .78, 1.58]) {
      box([x, y, -.96], [.49, .16, .10], rust);
      box([x, y, (z - .96) / 2], [.09, .09, .96 + z], m.steel);
      ring([x, y, z], radius + .025, m.steel, [Math.PI / 2, 0, 0]);
    }
  }
  function insulation() {
    cyl([-.48, .02, -.28], .29, 3.72, rust);
    riserConnections(-.48, -.28, .29, 1.88, -1.84);
    for (const [i, y] of [-1.28, -.42, .45, 1.26].entries()) {
      ring([-.48, y, -.28], .34, fabric, [Math.PI / 2, 0, 0]);
      // Partial cylindrical jacket leaves an exposed strip of core, rather than floating cards.
      add(new CylinderGeometry(.335, .335, [.62, .49, .72, .57][i], 14, 2, true, 1.76, 4.35),
        fabric, [-.48, y + .18, -.28]);
      const flap = new PlaneGeometry(.30, [.44, .35, .55, .40][i], 5, 5), vertices = flap.attributes.position;
      for (let n = 0; n < vertices.count; n++) {
        const u = vertices.getX(n) + .15;
        vertices.setXYZ(n, u, vertices.getY(n) - u * [.2, -.12, .38, -.08][i],
          u * .65 + u * u * (1.3 + i * .25));
      }
      flap.computeVertexNormals(); add(flap, fabric, [-.15, y + .18, -.28]);
      for (const dy of [-.09, .09]) cyl([-.145, y + .18 + dy, -.275], .017, .045, clean, [Math.PI / 2, 0, 0]);
    }
    for (let i = 0; i < 7; i++) {
      const x = .05 + (i % 3) * .29, z = -.6 + Math.floor(i / 3) * .47;
      card([x, -1.96 + i * .006, z], 7, .43, [-Math.PI / 2, 0, i * .7]);
      cyl([x + .12, -1.85, z], .065, .2, rust, [0, 0, .2], .015);
    }
    bottle(.98, -.65); chair(.67, .64);
  }
  function rations() {
    // Open shelving with empty cavities: no solid blocks pretending to be containers.
    for (const x of [-.95, .95]) box([x, -.08, -.5], [.07, 3.65, .6], shelfFinish);
    // Upper cross-member is essential: the final row's seal must have a real upper anchor.
    box([0, 1.54, -.48], [1.95, .055, .65], shelfFinish);
    for (let row = 0; row < 4; row++) {
      const y = -1.78 + row * .83;
      box([0, y, -.48], [1.95, .055, .65], shelfFinish);
      // Slim lighter shelf lips and rear stops describe empty depth without a glowing back.
      box([0, y + .018, -.142], [1.90, .065, .025], edgeFinish);
      box([0, y + .06, -.79], [1.90, .12, .025], shelfFinish);
      for (let col = 0; col < 3; col++) {
        const x = -.65 + col * .65;
        card([x, y - .10, -.13], 3, .46);
        // Two torn tails remain riveted to the lower lip and underside of the next shelf.
        box([x - .04, y + .18, -.145], [.055, .36, .018], m.red, [0, 0, -.22]);
        box([x - .04, y + .65, -.145], [.055, .36, .018], m.red, [0, 0, .22]);
        for (const yy of [y + .004, y + .826]) {
          box([x - .079, yy, -.15], [.16, .080, .06], toolFinish);
          cyl([x - .079, yy, -.11], .029, .035, edgeFinish, [Math.PI / 2, 0, 0]);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      cyl([-.6 + i * .46, -1.87, .47], .10, .14, m.steel, [Math.PI / 2, 0, i]);
      ring([-.6 + i * .46, -1.87, .55], .10, rust);
    }
  }
  function shift() {
    bench(); chair(.62, .65); card([-.3, -.65, -.15], 4, .65, [-Math.PI / 2, 0, .1]);
    cyl([-.57, 1.30, -.60], .35, .09, chalk, [Math.PI / 2, 0, 0]);
    ring([-.57, 1.30, -.54], .36);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      box([-.57 + Math.sin(a) * .29, 1.30 + Math.cos(a) * .29, -.54], [.022, .052, .014], m.rubber, [0, 0, -a]);
    }
    box([-.57, 1.39, -.52], [.025, .20, .015], m.rubber);
    box([-.49, 1.25, -.51], [.19, .024, .015], m.rubber, [0, 0, -.45]);
    for (const radius of [.19, .32, .47]) ring([.62, 1.35, -.34], radius);
    for (let i = 0; i < 4; i++) box([.62, 1.35, -.30], [.95, .017, .025], m.steel, [0, 0, i * Math.PI / 4]);
    const rotor = new Group(); rotor.position.set(.62, 1.35, -.44); current.add(rotor); fans.push(rotor);
    const pieces: BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new BoxGeometry(.15, .39, .025);
      g.translate(0, .22, 0); g.rotateZ(i * Math.PI / 2); pieces.push(g);
    }
    const merged = mergeGeometries(pieces, false)!; pieces.forEach(g => g.dispose()); geometry.add(merged);
    const mesh = new Mesh(merged, rust); mesh.castShadow = true; rotor.add(mesh);
    card([.52, .62, -.65], 4, .77);
  }
  function harness() {
    box([0, .4, -.84], [2.24, 2.8, .055], black);
    for (const x of [-1.12, 1.12]) box([x, .4, -.77], [.06, 2.85, .13], rust);
    for (const y of [-1, 1.8]) box([0, y, -.77], [2.25, .06, .13], m.steel);
    cable([[-.7, 1.65, -.40], [-.7, 1.94, -.4], [-.46, 1.94, -.4], [-.45, 1.62, -.4]], .035);
    // Collapsed open garment, no head, helmet, face, body volume or occupant.
    cloth([-.25, .35, -.34], .64, 1.85, 0, garment);
    cloth([-.69, .22, -.32], .19, 1.40, 1, garment);
    cloth([.19, .17, -.34], .19, 1.48, 2, garment);
    for (const x of [-.45, -.05]) box([x, .5, -.22], [.065, 1.25, .018], toolFinish, [0, 0, x < -.1 ? -.12 : .12]);
    box([-.24, -.04, -.20], [.58, .065, .035], toolFinish);
    // Sewn cuff/attachment edges, not a face or filled body. The window stays black.
    for (const [x, y] of [[-.69, -.43], [.19, -.51]]) box([x, y, -.29], [.18, .045, .018], edgeFinish);
    cable([[-.67, 1.64, -.38], [-.54, 1.39, -.32], [-.25, 1.29, -.30]], .021, edgeFinish);
    ring([-.24, -.04, -.17], .075, clean);
    bottle(.80, .40); card([.62, 1.31, -.72], 5, .7);
  }
  function cleanThreshold() {
    for (const z of [-.52, .16]) {
      cyl([0, -.45, z], .045, 2.16, clean, [0, 0, Math.PI / 2]);
      for (const x of [-.91, .91]) cyl([x, -1.20, z], .04, 1.48, clean);
    }
    box([0, -1.95, -.25], [2.2, .05, 1.15], chalk);
    for (let i = 0; i < 10; i++) {
      cyl([-.98 + i * .20, -1.94, .43 + (i % 2) * .09], .08, .06, rust, [0, i, 0], .045);
    }
    // Flat empty glove resting across the rail; individually tapered fingers, no hand inside.
    add(new SphereGeometry(1, 12, 6).scale(.14, .035, .19), chalk, [.24, -.37, .13]);
    for (let i = 0; i < 4; i++) {
      const x = .13 + i * .068;
      cable([[x, -.37, .02], [x, -.38, -.15], [x, -.44, -.23 + Math.abs(i - 1.5) * .025]], .025, chalk);
    }
    cable([[.12, -.37, .14], [.03, -.40, .07], [.02, -.44, .02]], .032, chalk);
    box([.24, -.37, .32], [.24, .04, .10], chalk);
    card([0, .1, -.76], 6, 1);
  }
  const builders = [mineralBench, inspection, insulation, rations, shift, harness, cleanThreshold];
  const skipped: string[] = [];
  try {
    for (const room of level.rooms) {
      // Entry rooms are fully authored by the facility modules. Incident evidence
      // belongs to investigation side rooms, not a duplicate prop in their forecourt.
      if (!(room.role === 'branch' || /\.r3$/.test(room.id))) continue;
      const placement = chooseCorner(room);
      if (!placement) { skipped.push(room.id); continue; }
      origin = placement.center; envelope = placement.bounds;
      current = new Group(); current.name = room.id; current.position.copy(origin);
      // Printed notes and work surfaces face the centre in either negative-X quadrant.
      current.rotation.y = origin.z > room.z ? Math.PI : 0; root.add(current);
      common(room.sector); builders[level.index]();
      for (const [material, pieces] of batches) {
        const merged = mergeGeometries(pieces, false);
        pieces.forEach(g => g.dispose());
        if (!merged) throw new Error(`Story merge failed: ${room.id}`);
        geometry.add(merged); merged.computeBoundingBox(); merged.computeBoundingSphere();
        const mesh = new Mesh(merged, material); mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = `story.${material.name || material.type}`; current.add(mesh);
      }
      batches.clear();
      // Solid reserved footprint avoids entering detailed thin props. The cross stays free.
      colliders.push(envelope.clone());
      const view = placement.view;
      const target = new Vector3(origin.x, .2, origin.z);
      const d = target.sub(new Vector3(...view));
      views.push({ name: `${room.name} · ${notes[0]}`, view,
        yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) });
    }
  } catch (error) {
    for (const pieces of batches.values()) pieces.forEach(g => g.dispose());
    geometry.forEach(g => g.dispose()); owned.forEach(mat => mat.dispose()); atlas.dispose(); root.clear();
    throw error;
  }
  function chooseCorner(room: ExpeditionRoom) {
    for (const sign of [-1, 1]) {
      const center = new Vector3(room.x - room.width / 2 + 1.65, 0, room.z + sign * (room.depth / 2 - 1.6));
      const bounds = new Box3(new Vector3(center.x - 1.3, -2, center.z - 1.2),
        new Vector3(center.x + 1.3, 3.8, center.z + 1.2));
      if (bounds.max.x >= room.x - 2.5 || !(bounds.max.z < room.z - 2.5 || bounds.min.z > room.z + 2.5)) continue;
      if (reserved.some(b => b.intersectsBox(bounds))) continue;
      // Camera occupies the clear cross; also exclude reserved interaction/spawn areas.
      const view: V3 = [room.x, .35, center.z - sign * 2];
      const cameraBounds = new Box3().setFromCenterAndSize(new Vector3(...view), new Vector3(.8, .8, .8));
      if (reserved.some(b => b.intersectsBox(cameraBounds))) continue;
      return { center, bounds, view };
    }
    return undefined;
  }
  root.userData.propNotes = { title: notes[0], observation: notes[1], skippedRooms: skipped };
  let disposed = false;
  return {
    root, colliders, views,
    update(time) { if (!disposed && Number.isFinite(time)) fans.forEach((fan, i) => { fan.rotation.z = time * .85 + i * .7; }); },
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear(); geometry.forEach(g => g.dispose()); geometry.clear();
      owned.forEach(mat => mat.dispose()); atlas.dispose(); fans.length = 0;
    },
  };
}
