import * as T from 'three';
import {LIVING_DOORS, LIVING_ITEMS, LIVING_SPACES, livingSolids, livingWalkable, type CreatureType, type Vec3} from '../../content/living-deck-layout';
import {createAlex} from './living-alex';
import {cullDetail} from './living-build';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createAtmosphere, livingFlicker, livingFogAt, type LivingFlicker, type LivingHaloSource, type LivingOptics} from './living-atmosphere';
import {LIVING_ANCHOR_LAMPS} from './living-clutter';
import {createCreatures} from './living-creatures';
import {buildDressing} from './living-dressing';
import {loadHeroGlbs} from './living-glb';
import {buildHeroes} from './living-hero';
import {createLivingMaterials, lensMaterial, withStaticLights} from './living-materials';
import {LIVING_CURTAIN, LIVING_UPLIGHTS} from './living-wreck';
import {buildShells} from './living-shells';
import {livingFontsReady} from './living-signage';
import {buildSlime} from './living-slime';

export {LIVING_GATE_CODE, LIVING_HERO_ANCHORS, type HeroName} from './living-hero';

export interface LivingCreatureVisual {id: string; type: CreatureType; position: Vec3; heading: number; mode: string}
export interface LivingWorldState {
  time: number; recording: boolean; lamp: boolean; collected: readonly string[];
  probe: 'none' | 'carried' | 'launched' | 'withAlex';
  valves: {heat: boolean; feed: boolean; cool: boolean}; valveTurn: {heat: number; feed: number; cool: number};
  slime: number; gateOpen: number;
  alex: {identity?:'elias'|'keeper';position: Vec3; heading: number; visible: boolean; pose: 'idle' | 'swim' | 'gesture' | 'type' | 'film'};
  creatures: readonly LivingCreatureVisual[];
}
export type LivingProbeShot = 'alex-glass' | 'pipe-bands' | 'slime-wall' | 'cocoon' | 'slime-floor' | 'gate-inner' | 'security-console';
export interface LivingWorld {
  root: T.Group;
  /** Hull channel: livingSolids() + hero/slime solids. Blender GLB meshes never add colliders. */
  colliders: T.Box3[];
  /** MET-042 decor channel: dressing and wreck props. Never used for hull movement, sonar or photo line-of-sight. */
  decorColliders: T.Box3[];
  walkable: T.Box3[];
  /** LIVING_ITEMS ids → operable objects (userData.interactionId set on every descendant). */
  interactables: Map<string, T.Object3D>;
  itemBounds: Map<string, T.Box3>;
  gate: {mesh: T.Object3D; bounds: T.Box3};
  practicalLights: {position: Vec3; color: string; intensity: number; range: number; space: string; dir: Vec3; flicker: LivingFlicker; seed: number}[];
  /** Visual-only mood lights (one warm shadowed key + cold status lamps per space, plus static-only accents). Not in LIVING_LIGHTS. */
  moodLights: {position: Vec3; color: string; intensity: number; range: number; space: string; dir: Vec3; flicker: LivingFlicker; seed: number; key: boolean; angle?: number; staticOnly?: boolean}[];
  /** Light state for the marine snow shader; written by living-render each frame. */
  optics: LivingOptics;
  probeShots: Record<LivingProbeShot, {position: Vec3; target: Vec3; fov: number}>;
  /** Photo ids + uplink + 'alex' + creature ids. */
  photoTargets: Map<string, T.Object3D>;
  fogAt(p: Vec3): {color: string; density: number};
  update(state: LivingWorldState, dt: number): void;
  /** Camera / pod position: drives space culling, marine snow wrap and lumen gaze. */
  setFocus(p: Vec3): void;
  ready: Promise<void>;
  dispose(): void;
}

const box3 = (b: {min: Vec3; max: Vec3}) => new T.Box3(new T.Vector3(...b.min), new T.Vector3(...b.max));
/** Gate F leaf travel at gateOpen = 1 (matches the Blender gate-f export). */
const GATE_LIFT = 3.6;
/** Atrium doorways (x, z): C5, C7, C6, gate F. */
const A_OPENINGS = [[128.5, 42], [110, 68], [162, 82], [188, 42]] as const;
const CARGO = ['living.box.battery', 'living.box.tools', 'living.box.probe', 'living.box.ballast'];

export function createLivingWorld(): LivingWorld {
  const root = new T.Group(); root.name = 'living-deck-world';
  const materials = createLivingMaterials();
  const shells = buildShells(materials);
  const dressing = buildDressing(materials, shells, root);
  const spaceGroups = new Map<string, T.Group>();
  for (const [id, b] of shells.batches) { const g = b.build(root); g.name = `living-space:${id}`; spaceGroups.set(id, g); }
  const heroes = buildHeroes(materials, shells, spaceGroups);
  shells.signBatch.build(root, false);
  const detailTiles: T.Mesh[] = [];
  root.traverse(o => { if ((o as T.Mesh).isMesh && o.userData.cullDist) detailTiles.push(o as T.Mesh); });

  const slime = buildSlime(materials, spaceGroups.get('M')!);
  const creatures = createCreatures(); root.add(creatures.root);
  const alex = createAlex(materials); root.add(alex.root, alex.lights);
  root.add(slime.light);
  // Layout fixtures (gameplay light table) + visual-only emergency anchors from the clutter pass.
  // Render copies only: wall-hugging sources are moved off the bulkhead and colours saturated (see offWall/vivid).
  const practicalLights: LivingWorld['practicalLights'] = [
    ...shells.fixtures.map((f, i) => ({position: offWall(f.position, f.space), color: vivid(f.color), intensity: f.intensity, range: f.range, space: f.space, dir: [...f.dir] as Vec3, flicker: 'steady' as LivingFlicker, seed: i + .37})),
    ...LIVING_ANCHOR_LAMPS.map((a, i) => ({...a.light, position: offWall(a.light.position, a.space), color: vivid(a.light.color), dir: a.light.dir as Vec3, space: a.space, flicker: a.flicker, seed: 40 + i * 1.73})),
  ];
  const mood = buildMoodLights(spaceGroups, root);
  const accents = buildAccents(spaceGroups, spaceGroups.get('A') ?? root);
  mood.lights.push(...accents.lights);
  const haloSources = [
    ...shells.fixtures.map((f, i) => ({position: f.position, color: practicalLights[i].color, intensity: f.intensity, flicker: practicalLights[i].flicker, seed: practicalLights[i].seed})),
    ...LIVING_ANCHOR_LAMPS.map((a, i) => ({position: a.position, color: vivid(a.light.color), intensity: a.light.intensity, flicker: a.flicker, seed: 40 + i * 1.73, halo: a.color === 'red' ? 1.1 : 1.7})),
    ...mood.halos, ...accents.halos,
  ];
  const seaWindow = buildSeaWindow(spaceGroups.get('C1') ?? root);
  const flickerLenses = LIVING_ANCHOR_LAMPS.flatMap((a, i) => a.lens ? [{m: a.lens, base: a.lensBase, mode: a.flicker, seed: 40 + i * 1.73}] : []);
  const atmosphere = createAtmosphere(haloSources); root.add(atmosphere.root);
  accents.bind(atmosphere.optics);
  // Shadow casting off for parts too small to matter in a 1024² key map (lenses, paper, crockery, plants,
  // fixtures, signage): each of these merged meshes otherwise costs a draw in the lamp and both key passes.
  const NO_CAST = /^living\.(lamp|led|exit|mood|paper|porcelain|plant-dead|soil|column-cap|band-|darkGlass|screenDead|fabric|plastic|decals|fascia|shop-interior)/;
  root.traverse(o => { const mm = (o as T.Mesh).material as T.Material | undefined; if ((o as T.Mesh).isMesh && mm && !Array.isArray(mm) && NO_CAST.test(mm.name)) o.castShadow = false; });
  // Blender heroes replace procedural visuals; interaction ids are copied onto their operable parts.
  const glbWheels: Partial<Record<'heat' | 'feed' | 'cool', T.Object3D>> = {};
  const glbCargo = new Map<string, T.Object3D>();
  let glbLeaf: {o: T.Object3D; y0: number} | null = null;
  const tag = (o: T.Object3D | undefined, id: string) => { o?.traverse(c => { c.userData.interactionId = id; }); return o; };
  const hideVisuals = (g: T.Object3D | undefined) => { g?.children.forEach(c => { if (!c.name.endsWith(':hit') && !c.userData.keepOnGlb) c.visible = false; }); };
  const glbs = loadHeroGlbs(heroes.fallbacks, spaceGroups, (name, scene) => {
    scene.traverse(o => {
      const mm = (o as T.Mesh).material;
      for (const x of Array.isArray(mm) ? mm : mm ? [mm] : []) if (x instanceof T.MeshStandardMaterial) withStaticLights(x, 'glb');
    });
    if(name==='manager-office'){
      const oldNote=scene.getObjectByName('code-note');if(oldNote)oldNote.visible=false;
    }
    if (name === 'atrium-balcony') {
      // Six tiles × (hi + lo): the small dressing parts add shadow draws without a readable shadow at hall scale.
      scene.traverse(o => { if ((o as T.Mesh).isMesh && /^(stencils|tablecloth|pendant-lights|plants)/.test(o.name)) o.castShadow = false; });
    } else if (name === 'glass-blast-door') {
      heroes.pane.visible = false;
      if (tag(scene.getObjectByName('pipe-intake'), 'living.pipe.intake')) hideVisuals(heroes.interactables.get('living.pipe.intake'));
    } else if (name === 'valve-manifold') {
      for (const k of ['heat', 'feed', 'cool'] as const) {
        const w = tag(scene.getObjectByName(`wheel-${k}`), `living.valve.${k}`);
        if (w) { glbWheels[k] = w; hideVisuals(heroes.valveWheels[k]); }
      }
    } else if (name === 'ballast-rack') {
      const c = tag(scene.getObjectByName('ballast-crate'), 'living.box.ballast');
      if (c) { glbCargo.set('living.box.ballast', c); hideVisuals(heroes.interactables.get('living.box.ballast')); }
    } else if (name === 'gate-f') {
      const leaf = scene.getObjectByName('gate-leaf');
      if (leaf) {
        glbLeaf = {o: leaf, y0: leaf.position.y};
        tag(scene.getObjectByName('gate-port-glass'), 'living.uplink.gate');
        heroes.gate.mesh.children.forEach(c => { if (c.name !== 'living.uplink.gate') c.visible = false; });
        heroes.gateInner.visible = false;
      }
    }
  });

  const colliders = [...livingSolids().map(box3), ...heroes.solids, ...slime.solids];
  const decorColliders = [...dressing.solids];
  const walkable = livingWalkable().map(box3);
  const interactables = new Map<string, T.Object3D>(heroes.interactables);
  root.updateMatrixWorld(true);
  const itemBounds = new Map<string, T.Box3>();
  for (const it of LIVING_ITEMS) { const o = interactables.get(it.id); if (o) itemBounds.set(it.id, new T.Box3().setFromObject(o)); }
  const photoTargets = new Map<string, T.Object3D>(heroes.photoTargets);
  photoTargets.set('alex', alex.root);
  for (const [id, v] of creatures.visuals) photoTargets.set(id, v.root);
  // Render-side overrides (slime visuals belong to living-slime): the backflow medium is drawn by the
  // atmosphere snow + volumetric pass, so its additive glow sprites and purple point cloud are hidden;
  // strongly magenta emissive/glow is remapped to a pale green-cyan fluorescence of equal luminance.
  // Conditional, so a re-coloured slime palette passes through untouched.
  const FLUO = new T.Color('#5fd1a8');
  const demagenta = (c: T.Color) => {
    if (!(c.r > c.g * 1.5 && c.b > c.g * 1.2)) return false;
    const l = c.r * .2126 + c.g * .7152 + c.b * .0722;
    c.copy(FLUO).multiplyScalar(l / (FLUO.r * .2126 + FLUO.g * .7152 + FLUO.b * .0722)); return true;
  };
  slime.root.traverse(o => {
    if (o instanceof T.Sprite || o instanceof T.Points) { o.visible = false; o.userData.hiddenByRender = true; return; }
    const m = (o as T.Mesh).material as T.Material | undefined;
    if (m && 'emissive' in m && m.emissive instanceof T.Color && demagenta(m.emissive)) {
      const c = (m as T.MeshStandardMaterial).color, l = c.r * .2126 + c.g * .7152 + c.b * .0722;
      c.lerp(new T.Color(l * .8, l * 1.05, l), .75);
    }
  });
  // Interior glass reads as a frosted white wall under the coaxial headlamp (opacity .85, light albedo): thin it
  // so the room / sea behind shows and the pane carries reflections instead. Conditional, like demagenta above.
  root.traverse(o => {
    const m = (o as T.Mesh).material as T.MeshStandardMaterial | undefined;
    if (m && !Array.isArray(m) && m.name === 'living.glassSoft' && m.opacity > .5) { m.opacity = .32; m.envMapIntensity = 1.4; }
  });
  // The sediment inflow (living-wreck) read as a blue light column: it is silt-laden water, so it carries the
  // grey-green of the deck silt and only shows where a lamp crosses it.
  root.traverse(o => {
    const m = (o as T.Mesh).material as (T.Material & {color?: T.Color; opacity: number}) | undefined;
    if (!m || Array.isArray(m) || !/^living\.inflow-(curtain|motes|plume)/.test(m.name) || m.userData.silted) return;
    m.userData.silted = true;
    // the sheets bake the work-light band into vertex colour (up to ×1.5): keep it, at a silt grey and a third of the opacity
    if (m.color) { const l = m.color.r * .2126 + m.color.g * .7152 + m.color.b * .0722; m.color.setRGB(l * .95, l, l * .86).multiplyScalar(.38); }
    m.opacity *= /motes/.test(m.name) ? .35 : .4;
    if (m instanceof T.PointsMaterial) m.size *= .45;
  });
  const pendants = buildPendantHangers(shells.fixtures, materials.frame);
  (spaceGroups.get('A') ?? root).add(pendants.mesh);
  const slimeLightBase = slime.light.color.clone();
  if (demagenta(slimeLightBase)) slime.light.color.copy(slimeLightBase);

  const probeShots: LivingWorld['probeShots'] = {
    'alex-glass': {position: [147.6, -1.3, 5.2], target: [145.5, -1.5, 6.1], fov: 55},
    'pipe-bands': {position: [167, -1.5, -16], target: [175.5, -1.5, -20], fov: 58},
    'slime-wall': {position: [165.5, -1.2, -4], target: [170, -1.6, -20], fov: 60},
    'cocoon': {position: [167.5, -1.6, -11.5], target: [170, -2.2, -14], fov: 55},
    'slime-floor': {position: [165, -1, -6], target: [170, -2.9, -16], fov: 60},
    'gate-inner': {position: [188, -1.2, 34], target: [188, -1.2, 42], fov: 58},
    'security-console': {position: [74, -.5, -57], target: [76, -1.5, -64.5], fov: 55},
  };

  const focus = new T.Vector3(7, 0, 7);
  let lastSlime = 1;
  const inSpace = (id: string, p: Vec3, pad = 0) => { const s = LIVING_SPACES.find(q => q.id === id)!; return p[0] >= s.minX - pad && p[0] <= s.maxX + pad && p[2] >= s.minZ - pad && p[2] <= s.maxZ + pad; };
  const guardBase = heroes.guard.position.clone(), guardRot = heroes.guard.rotation.clone();

  const world: LivingWorld = {
    root, colliders, decorColliders, walkable, interactables, itemBounds,
    gate: heroes.gate, practicalLights, moodLights: mood.lights, probeShots, photoTargets, optics: atmosphere.optics,
    fogAt(p) { const f = livingFogAt(p, lastSlime); return {color: `#${f.color.getHexString()}`, density: f.density}; },
    update(s, dt) {
      const t = s.time;
      lastSlime = s.slime;
      // valve wheels: two full turns over valveTurn 0..1
      for (const k of ['heat', 'feed', 'cool'] as const) {
        heroes.valveWheels[k].rotation.z = -s.valveTurn[k] * Math.PI * 4;
        const w = glbWheels[k]; if (w) w.rotation.x = -s.valveTurn[k] * Math.PI * 4;
      }
      for (const id of CARGO) {
        const on = !s.collected.includes(id);
        const o = interactables.get(id); if (o) o.visible = on;
        const g = glbCargo.get(id); if (g) g.visible = on;
      }
      const lift = T.MathUtils.clamp(s.gateOpen, 0, 1) * GATE_LIFT;
      heroes.gate.mesh.position.y = -3 + lift;
      if (glbLeaf) glbLeaf.o.position.y = glbLeaf.y0 + lift;
      heroes.guard.position.set(guardBase.x + Math.sin(t * .21) * .03, guardBase.y + Math.sin(t * .33) * .04, guardBase.z);
      heroes.guard.rotation.set(guardRot.x + Math.sin(t * .27) * .03, guardRot.y + Math.sin(t * .17) * .05, guardRot.z);
      creatures.update(s.creatures, t, dt, s.recording, focus, s.lamp);
      alex.update(s.alex, t, dt);
      const nearSlime = focus.x > 140 && focus.x < 204 && focus.z < 44 && focus.z > -42 && (inSpace('L', [focus.x, 0, focus.z]) || inSpace('M', [focus.x, 0, focus.z]) || inSpace('N', [focus.x, 0, focus.z]));
      slime.update(s.slime, t, dt, nearSlime);
      slime.light.intensity *= .35;
      atmosphere.optics.uSlime.value = T.MathUtils.clamp(s.slime, 0, 1);
      dressing.update(t);
      for (const l of flickerLenses) l.m.emissiveIntensity = l.base * livingFlicker(l.mode, l.seed, t);
      mood.update(t); accents.update(t);
      seaWindow.uniforms.uTime.value = t;
      atmosphere.update(t, focus);
    },
    setFocus(p) {
      focus.set(...p);
      const inAlex = inSpace('L', p) || inSpace('M', p) || inSpace('N', p);
      const inG = inSpace('G', p, 2);
      const nearGate = Math.hypot(p[0] - 188, p[2] - 45) < 26;
      const hops = doorHops(p);
      for (const s of LIVING_SPACES) {
        const g = spaceGroups.get(s.id); if (!g) continue;
        if (s.kind === 'alex' || s.kind === 'slime') { g.visible = inAlex || (s.id === 'L' && inG) || (s.id === 'N' && nearGate); continue; }
        const dx = Math.max(s.minX - p[0], 0, p[0] - s.maxX), dz = Math.max(s.minZ - p[2], 0, p[2] - s.maxZ);
        g.visible = !inAlex ? Math.hypot(dx, dz) < 48 && (!hops || hops.has(s.id)) : (s.id === 'G' || s.id === 'A') && Math.hypot(dx, dz) < 30;
        // The atrium (heaviest group) is only reachable by sight through its four openings.
        if (s.id === 'A' && g.visible && !inSpace('A', p, 1)) g.visible = A_OPENINGS.some(([x, z]) => Math.hypot(p[0] - x, p[2] - z) < 34);
      }
      cullDetail(detailTiles, focus);
    },
    ready: Promise.all([materials.ready, glbs.ready, livingFontsReady]).then(() => undefined),
    dispose() {
      pendants.dispose(); glbs.dispose(); creatures.dispose(); alex.dispose(); slime.dispose(); atmosphere.dispose(); mood.dispose(); accents.dispose(); seaWindow.dispose();
      heroes.dispose(); dressing.dispose(); shells.dispose(); materials.dispose();
      root.removeFromParent();
    },
  };
  world.setFocus([7, 0, 7]);
  return world;
}

// ------------------------------------------------------------------------------------------------ space culling
const DOOR_LINKS = (() => {
  const links = new Map<string, {to: string; at: [number, number]}[]>();
  for (const d of LIVING_DOORS) {
    if (d.kind === 'pipe') continue;
    const mid = (d.from + d.to) / 2, at: [number, number] = d.axis === 'x' ? [d.at, mid] : [mid, d.at];
    for (const [a, b] of [[d.a, d.b], [d.b, d.a]]) { const l = links.get(a) ?? []; l.push({to: b, at}); links.set(a, l); }
  }
  return links;
})();
/**
 * Spaces that can be in sight from p: the space(s) containing it, every space one doorway away, and a space two
 * doorways away only while its far doorway is within 36 m (a straight run through a short corridor). Rooms behind
 * a hall wall stop costing main, AO and shadow draws. null when p is outside every space (keep the distance rule).
 */
function doorHops(p: Vec3) {
  const home = LIVING_SPACES.filter(s => p[0] >= s.minX - 1 && p[0] <= s.maxX + 1 && p[2] >= s.minZ - 1 && p[2] <= s.maxZ + 1 && p[1] >= s.floorY - 1 && p[1] <= s.ceilY + 1);
  if (!home.length) return null;
  const seen = new Set(home.map(s => s.id));
  const first = [...seen].flatMap(id => DOOR_LINKS.get(id) ?? []).map(l => l.to).filter(id => !seen.has(id));
  first.forEach(id => seen.add(id));
  for (const id of first) for (const l of DOOR_LINKS.get(id) ?? []) if (Math.hypot(l.at[0] - p[0], l.at[1] - p[2]) < 36) seen.add(l.to);
  return seen;
}

// ------------------------------------------------------------------------------------------------ render-side lights
/** Minimum distance of a light source from a bulkhead / ceiling: closer, a point light burns a white blob into the panel. */
const WALL_CLEAR = 1.3, CEIL_CLEAR = .7;
function offWall(p: readonly number[], space: string): Vec3 {
  const s = LIVING_SPACES.find(q => q.id === space);
  if (!s) return [p[0], p[1], p[2]];
  const clamp = (v: number, a: number, b: number) => a > b ? (a + b) / 2 : Math.min(b, Math.max(a, v));
  return [clamp(p[0], s.minX + WALL_CLEAR, s.maxX - WALL_CLEAR), Math.min(p[1], s.ceilY - CEIL_CLEAR), clamp(p[2], s.minZ + WALL_CLEAR, s.maxZ - WALL_CLEAR)];
}
/** Render tint of a fixture colour: the layout palette is grey-green; emergency lenses read as coloured light. */
function vivid(hex: string) {
  const c = new T.Color(hex), hsl = {h: 0, s: 0, l: 0}; c.getHSL(hsl);
  return `#${c.setHSL(hsl.h, Math.min(1, hsl.s * 1.15 + .04), hsl.l).getHexString()}`;
}

/**
 * Atrium pendants hang 3–5 m below a ceiling the lamp never reaches, so their 25 mm drop rod vanished and the lit
 * bar floated. Two suspension chains from the bar ends to a ceiling rose each, plus a cable tray over the bar.
 */
function buildPendantHangers(fixtures: readonly {position: readonly number[]; space: string; mount: string; color: string}[], mat: T.Material) {
  const A = LIVING_SPACES.find(s => s.id === 'A');
  const geos: T.BufferGeometry[] = [], chains: T.BufferGeometry[] = [];
  const yAxis = new T.Vector3(0, 1, 0), col = new T.Color();
  // chains catch the spill of their own lens: unlit, brightness falling off over the first ~1.5 m above the bar
  const chain = (a: T.Vector3, b: T.Vector3, r: number, lens: T.Color) => {
    const d = b.clone().sub(a), len = d.length(), g = new T.CylinderGeometry(r, r, len, 5, 12, true);
    const p = g.getAttribute('position'), c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const up = p.getY(i) + len / 2, k = .1 * Math.exp(-up / 1.2) + .006; c.set([lens.r * k, lens.g * k, lens.b * k], i * 3); }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(yAxis, d.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    chains.push(g);
  };
  if (A) for (const f of fixtures) {
    const [x, y, z] = f.position;
    if (f.space !== 'A' || f.mount !== 'ceiling' || y > 6 || y < 1) continue;
    const yy = Math.min(y, A.ceilY - .25);
    col.set(f.color);
    for (const k of [-.55, .55]) {
      const lo = new T.Vector3(x + k, yy + .17, z), hi = new T.Vector3(x + k * .7, A.ceilY, z);
      chain(lo, hi, .016, col);
      const rose = new T.CylinderGeometry(.09, .12, .06, 10); rose.translate(hi.x, A.ceilY - .03, hi.z); geos.push(rose);
    }
    const tray = new T.BoxGeometry(1.24, .05, .16); tray.translate(x, yy + .2, z); geos.push(tray);
  }
  const merged = (list: T.BufferGeometry[]) => {
    const g = list.length ? mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)) ?? new T.BufferGeometry() : new T.BufferGeometry();
    list.forEach(x => x.dispose()); return g;
  };
  const geo = merged(geos), chainGeo = merged(chains);
  const chainMat = new T.MeshBasicMaterial({vertexColors: true, name: 'living.pendant-chain', fog: true});
  const mesh = new T.Mesh(geo, mat); mesh.name = 'living-pendant-hangers'; mesh.castShadow = false;
  const chainMesh = new T.Mesh(chainGeo, chainMat); chainMesh.name = 'living-pendant-chains'; chainMesh.castShadow = false; chainMesh.userData.noAO = true;
  mesh.add(chainMesh);
  return {mesh, dispose() { geo.dispose(); chainGeo.dispose(); chainMat.dispose(); }};
}

const WARM = '#ffa860', CYAN = '#2ec8f0', TEAL = '#30f0b8', BLUE = '#4a8cff';
interface MoodSpec {space: string; p: Vec3; aim: Vec3; color: string; intensity: number; range: number; key?: boolean; angle?: number; flicker?: LivingFlicker}
/**
 * Per-space mood rig: one warm emergency flood (shadowed key, tight cone → a hard-edged pool) and one or two
 * cold status lamps (unshadowed, short range). Each has its own small fixture so no pool lacks a source.
 */
const MOOD: MoodSpec[] = [
  {space: 'S', p: [13.1, 21, 3], aim: [7, 13, 8], color: WARM, intensity: 16, range: 14, key: true, angle: .7},
  {space: 'S', p: [.9, 16.5, 12.5], aim: [5, 13, 9], color: CYAN, intensity: 3, range: 6},
  {space: 'C1', p: [25, 2.1, 11.1], aim: [28, -3, 6.5], color: WARM, intensity: 14, range: 11, key: true, angle: .75},
  {space: 'C1', p: [45, -1.4, 3.9], aim: [45, -3, 7], color: CYAN, intensity: 3, range: 5},
  {space: 'C1', p: [60.5, 1.4, 11.1], aim: [60, -3, 8], color: TEAL, intensity: 2.5, range: 5},
  {space: 'R1', p: [47.1, 3.6, -8], aim: [40, -3, -12], color: WARM, intensity: 15, range: 13, key: true, angle: .7},
  {space: 'R1', p: [24.9, -.8, -20], aim: [28, -3, -18], color: CYAN, intensity: 3, range: 6},
  {space: 'R2', p: [63.1, 3.6, 20], aim: [56, -3, 25], color: WARM, intensity: 15, range: 13, key: true, angle: .7},
  {space: 'R2', p: [44.9, -.5, 31], aim: [49, -3, 29], color: TEAL, intensity: 3, range: 6},
  {space: 'J1', p: [81.1, 3.6, .5], aim: [74, -3, 6], color: WARM, intensity: 14, range: 13, key: true, angle: .75},
  {space: 'C2', p: [76.1, 2.1, -22], aim: [72.5, -3, -26], color: WARM, intensity: 18, range: 10, key: true, angle: .5},
  {space: 'C2', p: [68.9, -1.2, -33], aim: [72, -3, -33], color: CYAN, intensity: 3, range: 5},
  {space: 'R3', p: [79, 3.8, -65.1], aim: [76, -2.2, -60.5], color: WARM, intensity: 15, range: 12, key: true, angle: .6},
  {space: 'R3', p: [58.9, .2, -55], aim: [63, -2, -55], color: BLUE, intensity: 3.5, range: 7},
  {space: 'C3', p: [101, 2.1, 3.9], aim: [99.5, -3, 7.5], color: WARM, intensity: 11, range: 8, key: true, angle: .5},
  {space: 'C3', p: [90, -1.3, 11.1], aim: [90, -3, 8], color: CYAN, intensity: 3, range: 5},
  {space: 'R4', p: [96.9, 3.6, 33], aim: [102, -3, 29.5], color: WARM, intensity: 15, range: 13, key: true, angle: .7},
  {space: 'R4', p: [119.1, -.5, 15], aim: [115, -3, 17], color: TEAL, intensity: 3, range: 6},
  {space: 'G', p: [121, 3.6, 20.1], aim: [128, -3, 14], color: WARM, intensity: 15, range: 13, key: true, angle: .7},
  {space: 'G', p: [140.9, -1, 19.5], aim: [138, -3, 17], color: TEAL, intensity: 3, range: 6},
  {space: 'C4', p: [134.1, 2.1, -13], aim: [130, -3, -13], color: WARM, intensity: 17, range: 9, key: true, angle: .5},
  {space: 'V', p: [115, 3.6, -19], aim: [124, -3, -27], color: WARM, intensity: 15, range: 14, key: true, angle: .7},
  {space: 'V', p: [141.1, 1.2, -25.5], aim: [138, -3, -25], color: TEAL, intensity: 3, range: 6},
  {space: 'C5', p: [124.9, 2.1, 30], aim: [129, -3, 32], color: WARM, intensity: 12, range: 10, key: true, angle: .7},
  // Hung from the roof truss beside the fountain statue (not inside it), raking across statue and floor.
  {space: 'A', p: [154, 8.2, 57], aim: [161, -9, 63], color: WARM, intensity: 40, range: 22, key: true, angle: .45},
  {space: 'A', p: [199.1, -6, 62], aim: [195, -9, 62], color: CYAN, intensity: 4, range: 8},
  {space: 'A', p: [110.9, -6, 50], aim: [115, -9, 50], color: TEAL, intensity: 4, range: 8},
  {space: 'R5', p: [169.2, .4, 106.6], aim: [167, -2.6, 103.6], color: WARM, intensity: 8, range: 7, key: true, angle: .6},
  {space: 'R5', p: [150.9, 0, 89], aim: [154, -2, 90], color: BLUE, intensity: 3, range: 6},
  {space: 'C7', p: [109.1, 2, 65], aim: [108, -3, 68], color: WARM, intensity: 10, range: 9, key: true, angle: .7},
  {space: 'D', p: [90.9, 0, 61], aim: [98, -14, 68], color: WARM, intensity: 20, range: 20, key: true, angle: .6},
  {space: 'L', p: [143, -.2, -1], aim: [146, -3, 5], color: WARM, intensity: 9, range: 9, key: true, angle: .7},
  // Kept off the cocoon (170, -2.2, -14): its clear-coat shell turns a direct pool into a blown highlight.
  {space: 'M', p: [175.1, -.2, -27], aim: [171, -3, -30], color: WARM, intensity: 5, range: 8, key: true, angle: .7, flicker: 'pulse'},
  {space: 'N', p: [189, -.1, 40], aim: [188, -3, 36], color: WARM, intensity: 8, range: 9, key: true, angle: .7},
];

function buildMoodLights(groups: Map<string, T.Group>, root: T.Group) {
  const housing = new T.MeshStandardMaterial({color: '#2b2a27', roughness: .45, metalness: .85, name: 'living.mood-housing'});
  const lensMats = new Map<string, T.MeshStandardMaterial>();
  const lensOf = (c: string) => {
    let m = lensMats.get(c);
    if (!m) { m = new T.MeshStandardMaterial({color: '#000000', emissive: c, emissiveIntensity: 7, roughness: .2, name: `living.mood-lens-${c}`}); lensMats.set(c, m); }
    return m;
  };
  const geos = {
    flood: new T.BoxGeometry(.34, .22, .24), lens: new T.CircleGeometry(.085, 20), panel: new T.BoxGeometry(.2, .1, .04),
    rod: new T.CylinderGeometry(.018, .018, 1, 6),
  };
  const flickering: {m: T.MeshStandardMaterial; mode: LivingFlicker; seed: number}[] = [];
  const lights: LivingWorld['moodLights'] = [];
  const halos: {position: Vec3; color: string; intensity: number; flicker: LivingFlicker; seed: number; halo: number}[] = [];
  const up = new T.Vector3(0, 1, 0), tmp = new T.Vector3();
  MOOD.forEach((m, i) => {
    const s = LIVING_SPACES.find(q => q.id === m.space)!;
    const dir = new T.Vector3(...m.aim).sub(new T.Vector3(...m.p)).normalize();
    const seed = 90 + i * 2.31, flicker = m.flicker ?? 'steady';
    lights.push({position: m.p, color: m.color, intensity: m.intensity, range: m.range, space: m.space, dir: [dir.x, dir.y, dir.z], flicker, seed, key: !!m.key, angle: m.angle});
    halos.push({position: [m.p[0] + dir.x * .14, m.p[1] + dir.y * .14, m.p[2] + dir.z * .14], color: m.color, intensity: m.intensity, flicker, seed, halo: m.key ? .75 : .35});
    const g = new T.Group(); g.name = `living-mood:${m.space}${m.key ? ':key' : ''}`;
    g.position.set(...m.p);
    const lensMat = flicker === 'steady' ? lensOf(m.color) : lensOf(m.color).clone();
    if (flicker !== 'steady') flickering.push({m: lensMat, mode: flicker, seed});
    const head = new T.Group(); head.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), dir); g.add(head);
    if (m.key) {
      const body = new T.Mesh(geos.flood, housing); body.position.z = -.1; head.add(body);
      const lens = new T.Mesh(geos.lens, lensMat); lens.position.z = .021; head.add(lens);
    } else {
      const lens = new T.Mesh(geos.panel, lensMat); head.add(lens);
    }
    // Bracket: to the nearest bulkhead when close, else a drop rod to the ceiling.
    const walls: [number, T.Vector3][] = [[m.p[0] - s.minX, new T.Vector3(-1, 0, 0)], [s.maxX - m.p[0], new T.Vector3(1, 0, 0)], [m.p[2] - s.minZ, new T.Vector3(0, 0, -1)], [s.maxZ - m.p[2], new T.Vector3(0, 0, 1)]];
    walls.sort((a, b) => a[0] - b[0]);
    const [wd, wn] = walls[0];
    const ceil = s.ceilY - m.p[1];
    const [len, axis] = wd < 1.6 || ceil > 6 ? [wd, wn] : [ceil, up];
    if (len > .05) {
      const rod = new T.Mesh(geos.rod, housing);
      rod.scale.y = len; rod.position.copy(tmp.copy(axis).multiplyScalar(len / 2));
      rod.quaternion.setFromUnitVectors(up, axis); g.add(rod);
    }
    g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
    (groups.get(m.space) ?? root).add(g);
  });
  return {
    lights, halos,
    update(t: number) { for (const f of flickering) f.m.emissiveIntensity = 7 * livingFlicker(f.mode, f.seed, t); },
    dispose() {
      housing.dispose(); lensMats.forEach(m => m.dispose()); flickering.forEach(f => f.m.dispose());
      Object.values(geos).forEach(g => g.dispose());
    },
  };
}

/**
 * Atrium accents (visual only, not in LIVING_LIGHTS): the fountain up-lights still on battery and the cold work
 * light beside the sediment curtain. Each gets a lit lens, a faint additive beam through the silt (one merged
 * draw, scaled with the profile's practical gain so the live view keeps only a trace) and a static-only cone in
 * the material static term — they light the tower and the curtain without taking a shadowed key slot.
 */
function buildAccents(groups: Map<string, T.Group>, parent: T.Object3D) {
  const UP = '#ffb070', COLD = '#d2dcd6';
  const lights: LivingWorld['moodLights'] = [];
  const halos: LivingHaloSource[] = [];
  const owned: {dispose(): void}[] = [];
  const flick: {m: T.MeshStandardMaterial; base: number; mode: LivingFlicker; seed: number}[] = [];
  const g = new T.Group(); g.name = 'living-accents:A'; parent.add(g);
  const uniforms = {uGain: {value: 1.35}, uFlick: {value: 1}};
  const beamGeos: T.BufferGeometry[] = [];
  const z = new T.Vector3(0, 0, 1), yAxis = new T.Vector3(0, 1, 0);
  const lens = (color: string, intensity: number, geo: T.BufferGeometry, p: V3w, dir: T.Vector3, mode: LivingFlicker, seed: number) => {
    const m = lensMaterial('#1a1612', color, intensity); m.name = 'living.lamp-accent'; owned.push(m, geo);
    const mesh = new T.Mesh(geo, m); mesh.position.set(...p); mesh.quaternion.setFromUnitVectors(z, dir);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.noAO = true; g.add(mesh);
    if (mode !== 'steady') flick.push({m, base: intensity, mode, seed});
  };
  // Open cone along +Y (0..len), radius r0 → r1; vertex attributes carry strength and the flicker flag.
  const beam = (p: V3w, dir: T.Vector3, len: number, r0: number, r1: number, color: string, strength: number, flicker: number) => {
    const geo = new T.CylinderGeometry(r1, r0, len, 20, 6, true); geo.translate(0, len / 2, 0);
    geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(yAxis, dir)); geo.translate(...p);
    const n = geo.attributes.position.count, c = new T.Color(color), along = new Float32Array(n), col = new Float32Array(n * 3), fl = new Float32Array(n);
    const uv = geo.attributes.uv;
    for (let i = 0; i < n; i++) { along[i] = uv.getY(i); col.set([c.r * strength, c.g * strength, c.b * strength], i * 3); fl[i] = flicker; }
    geo.setAttribute('aAlong', new T.BufferAttribute(along, 1)); geo.setAttribute('aCol', new T.BufferAttribute(col, 3)); geo.setAttribute('aFl', new T.BufferAttribute(fl, 1));
    geo.deleteAttribute('uv'); beamGeos.push(geo);
  };
  LIVING_UPLIGHTS.forEach((u, i) => {
    if (u.state === 'toppled') return;
    const dir = new T.Vector3(...u.aim).normalize();
    const weak = u.state === 'cracked', mode: LivingFlicker = weak ? 'flicker' : 'steady', seed = 140 + i * 1.91;
    const p: V3w = [u.position[0] + dir.x * .006, u.position[1] + dir.y * .006, u.position[2] + dir.z * .006];
    lens(UP, weak ? 5 : 9, new T.CircleGeometry(.112, 20), p, dir, mode, seed);
    beam(p, dir, weak ? 4.5 : 6.5, .11, weak ? 1.7 : 2.6, UP, weak ? .45 : 1, weak ? 1 : 0);
    lights.push({position: [p[0] + dir.x * .1, p[1] + dir.y * .1, p[2] + dir.z * .1], color: UP, intensity: weak ? 5 : 16, range: weak ? 6 : 9, space: 'A', dir: [dir.x, dir.y, dir.z], flicker: mode, seed, key: false, angle: .5, staticOnly: true});
    halos.push({position: p, color: UP, intensity: weak ? 2 : 4, flicker: mode, seed, halo: .5});
  });
  if (LIVING_CURTAIN.lamp.some(v => v !== 0)) {
    const dir = new T.Vector3(...LIVING_CURTAIN.aim).normalize(), p = LIVING_CURTAIN.lamp as V3w;
    lens(COLD, 10, new T.PlaneGeometry(.28, .2), [p[0] - dir.x * .012, p[1] - dir.y * .012, p[2] - dir.z * .012], dir, 'steady', 0);
    const d = Math.hypot(LIVING_CURTAIN.x - p[0], LIVING_CURTAIN.z - p[2]);
    beam(p, dir, d + 1.6, .14, (d + 1.6) * .42, COLD, .8, 0);
    lights.push({position: [p[0] + dir.x * .1, p[1] + dir.y * .1, p[2] + dir.z * .1], color: COLD, intensity: 7, range: d + 5, space: 'A', dir: [dir.x, dir.y, dir.z], flicker: 'steady', seed: 0, key: false, angle: .5, staticOnly: true});
    halos.push({position: p, color: COLD, intensity: 5, flicker: 'steady', seed: 0, halo: .6});
  }
  // Corridor eye-lines (C2 south run, C4 → V): one surviving fixture each, hung loose from the ceiling, so the far
  // half of the run has a bright point to read depth against. Unshadowed practicals (specular on the wet floor).
  const housing = new T.MeshStandardMaterial({color: '#2a2b28', roughness: .5, metalness: .7, name: 'living.lamp-accent-housing'}); owned.push(housing);
  const hung: {space: string; top: V3w; low: V3w; len: number; color: string; mode: LivingFlicker; intensity: number; range: number}[] = [
    // fluorescent tube dropped at one end, still lit, buzzing
    {space: 'C2', top: [74.2, 2.95, -27.4], low: [73.6, 1.85, -26.2], len: 1.2, color: '#d8f4ec', mode: 'flicker', intensity: 6, range: 9},
    // caged sodium work lamp on its cable at the far side of the valve hall
    {space: 'V', top: [129, 4.95, -33], low: [129, 2.4, -33], len: .3, color: '#ff9a40', mode: 'pulse', intensity: 7, range: 11},
  ];
  hung.forEach((h, i) => {
    const sp = groups.get(h.space) ?? parent, seed = 170 + i * 2.7;
    const cable = new T.Mesh(new T.CylinderGeometry(.006, .006, 1, 4), housing);
    const a = new T.Vector3(...h.top), b = new T.Vector3(...h.low), d = b.clone().sub(a);
    cable.scale.y = d.length(); cable.position.copy(a).addScaledVector(d, .5); cable.quaternion.setFromUnitVectors(yAxis, d.clone().normalize());
    owned.push(cable.geometry); sp.add(cable);
    const m = lensMaterial('#202020', h.color, 14); m.name = 'living.lamp-accent'; owned.push(m);
    if (h.mode !== 'steady') flick.push({m, base: 14, mode: h.mode, seed});
    const tube = h.len > .5;
    const lensGeo = tube ? new T.CylinderGeometry(.022, .022, h.len, 8) : new T.SphereGeometry(.09, 12, 8); owned.push(lensGeo);
    const body = new T.Group(); body.position.copy(b);
    if (tube) body.quaternion.setFromUnitVectors(yAxis, new T.Vector3(.35, -.5, .8).normalize());
    const lm = new T.Mesh(lensGeo, m); if (tube) lm.position.y = -h.len / 2; body.add(lm);
    const hg = tube ? new T.BoxGeometry(.09, h.len * .5, .05) : new T.CylinderGeometry(.11, .14, .1, 10); owned.push(hg);
    const hm = new T.Mesh(hg, housing); hm.position.set(tube ? .05 : 0, tube ? -h.len * .25 : .08, 0); body.add(hm);
    if (!tube) for (let k = 0; k < 4; k++) { const r = new T.Mesh(new T.TorusGeometry(.11, .006, 4, 12, PI), housing); owned.push(r.geometry); r.rotation.y = k * PI / 4; body.add(r); }
    body.traverse(o => { o.castShadow = false; o.userData.noAO = true; }); sp.add(body);
    const c = new T.Vector3(0, tube ? -h.len / 2 : 0, 0).applyQuaternion(body.quaternion).add(b);
    lights.push({position: [c.x, c.y - .12, c.z], color: h.color, intensity: h.intensity, range: h.range, space: h.space, dir: [0, -1, 0], flicker: h.mode, seed, key: false});
    halos.push({position: [c.x, c.y, c.z], color: h.color, intensity: h.intensity, flicker: h.mode, seed, halo: tube ? 1.4 : 1.1});
  });
  if (beamGeos.length) {
    const geo = mergeGeometries(beamGeos)!; beamGeos.forEach(b => b.dispose());
    const mat = new T.ShaderMaterial({
      name: 'living.beam-accent', uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
      vertexShader: `
        attribute float aAlong, aFl; attribute vec3 aCol; varying float vAlong; varying vec3 vCol, vN, vV;
        uniform float uFlick;
        void main(){
          vAlong = aAlong; vCol = aCol * mix(1., uFlick, aFl);
          vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying float vAlong; varying vec3 vCol, vN, vV; uniform float uGain;
        void main(){
          // Thick through the middle of the cone, nothing at its silhouette; strongest just above the lens.
          float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
          float fall = (1. - vAlong) * (1. - vAlong) * smoothstep(0., .06, vAlong);
          gl_FragColor = vec4(vCol * core * fall * .07 * uGain / 1.35, 1.);
        }`,
    });
    const mesh = new T.Mesh(geo, mat); mesh.name = 'living-accents:beams'; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.noAO = true; mesh.renderOrder = 2; mesh.frustumCulled = false; g.add(mesh);
    owned.push(geo, mat);
  }
  return {
    lights, halos,
    bind(optics: LivingOptics) { uniforms.uGain = optics.uPracticalGain; },
    update(t: number) {
      for (const f of flick) f.m.emissiveIntensity = f.base * livingFlicker(f.mode, f.seed, t);
      uniforms.uFlick.value = flick.length ? livingFlicker(flick[0].mode, flick[0].seed, t) : 1;
    },
    dispose() { owned.forEach(o => o.dispose()); },
  };
}
type V3w = [number, number, number];
const PI = Math.PI;

/**
 * Deep-sea view behind the C1 solarium (its back wall, x 21..33, z 16.2): a near-black water column with
 * parallax — a distant habitat module silhouette and a few far lamps on virtual planes 35 / 70 m out — and
 * dirty glass with a faint view-angle sheen. Opaque, unlit, fog-free (the volumetric pass adds the medium).
 */
function buildSeaWindow(parent: T.Object3D) {
  const uniforms = {uTime: {value: 0}};
  const mat = new T.ShaderMaterial({
    uniforms, fog: false, name: 'living.sea-window',
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW; varying vec2 vUv; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
      vec2 plane(vec3 v, float d){ return vW.xy + v.xy * (d / max(v.z, .08)); }
      void main(){
        vec3 v = normalize(vW - cameraPosition);
        // water column: black below, the faintest blue-green above
        vec2 far = plane(v, 70.);
        vec3 col = mix(vec3(.0004, .0016, .002), vec3(.0016, .0065, .008), smoothstep(-30., 40., far.y));
        // habitat module silhouette (35 m), rim-lit by its own lamps
        vec2 m = plane(v, 35.) - vec2(6., -4.);
        float hull = box(m, vec2(16., 3.2), 3.);
        float legs = min(box(m - vec2(-9., -8.), vec2(.5, 6.), .2), box(m - vec2(9., -8.), vec2(.5, 6.), .2));
        float mast = box(m - vec2(-3., 6.), vec2(.35, 4.), .1);
        float sil = min(min(hull, legs), mast);
        col = mix(col, vec3(.0002, .0006, .0008), smoothstep(.25, -.25, sil));
        col += vec3(.008, .02, .022) * smoothstep(.6, 0., abs(sil)) * smoothstep(-4., 3., m.y);
        // far lamps (module ports and two on the sea floor), slow breathing; small hot cores for bloom
        vec3 L = vec3(0.);
        vec4 lamps[6];
        lamps[0] = vec4(-6., -2.4, 35., 0.); lamps[1] = vec4(2., -2.4, 35., 1.); lamps[2] = vec4(14., -2.4, 35., 0.);
        lamps[3] = vec4(3., 10.2, 35., 2.); lamps[4] = vec4(-40., -14., 70., 1.); lamps[5] = vec4(48., -20., 70., 0.);
        for (int i = 0; i < 6; i++) {
          vec2 q = plane(v, lamps[i].z) - lamps[i].xy - vec2(lamps[i].z < 50. ? 6. : 0., lamps[i].z < 50. ? -4. : 0.);
          float r = length(q) / (lamps[i].z / 35.);
          vec3 c = lamps[i].w < .5 ? vec3(1., .55, .2) : lamps[i].w < 1.5 ? vec3(.25, .75, 1.) : vec3(1., .2, .12);
          float breath = lamps[i].w > 1.5 ? step(.5, fract(uTime * .45)) : .75 + .25 * sin(uTime * .7 + float(i) * 2.1);
          L += c * breath * (exp(-r * r * 90.) * 3.5 + exp(-r * 2.2) * .02) * (lamps[i].z > 50. ? .45 : 1.);
        }
        col += L;
        // suspended silt drifting past outside (unlit flecks, barely there)
        vec2 sp = plane(v, 8.) * 6. + vec2(0., uTime * .35);
        col += vec3(.002, .004, .004) * step(.99, h(floor(sp))) * smoothstep(.5, .1, length(fract(sp) - .5));
        // dirty glass: streaks + smudges with a view-angle sheen
        float streak = n2(vec2(vUv.x * 60., vUv.y * 3.)) * n2(vUv * 9.);
        float fres = pow(1. - abs(v.z), 3.);
        col += vec3(.012, .018, .017) * streak * (.25 + 2.5 * fres);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const geo = new T.PlaneGeometry(11.6, 3.4);
  const pane = new T.Mesh(geo, mat); pane.name = 'living-sea-window';
  pane.position.set(27, .05, 16.16); pane.rotation.y = Math.PI;
  const frameMat = new T.MeshStandardMaterial({color: '#1d211f', roughness: .5, metalness: .8, name: 'living.sea-window-frame'});
  const bar = new T.BoxGeometry(1, 1, 1);
  const frame = new T.Group(); frame.name = 'living-sea-window-frame';
  const add = (x: number, y: number, w: number, hgt: number) => { const b = new T.Mesh(bar, frameMat); b.position.set(x, y, 16.1); b.scale.set(w, hgt, .12); frame.add(b); };
  add(27, 1.8, 12, .16); add(27, -1.7, 12, .2);
  for (const x of [21.1, 25, 29, 32.9]) add(x, .05, .14, 3.6);
  parent.add(pane, frame);
  return {uniforms, dispose() { geo.dispose(); mat.dispose(); bar.dispose(); frameMat.dispose(); }};
}
