import * as T from 'three';
import {GLTFLoader, type GLTF} from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {HeroName} from './living-hero';
import {ATRIUM_BALCONY_TILES, HERO_GLB_PARTS, HERO_GLB_PLACEMENT, HERO_SPACE, heroAdopter} from './living-hero-glb';
import {withStaticLights} from './living-materials';

/** Actor loads (cocoon, diver) started before loadHeroGlbs; folded into its `ready` promise. */
const pendingActorLoads: Promise<unknown>[] = [];

/**
 * Loads an actor GLB from public/assets/deepsea/living/. Resolves null when the file is missing or
 * fails, so callers keep their procedural fallback.
 */
export function loadActorGlb(file: string): Promise<GLTF | null> {
  const url = `${BASE}${file}`;
  const p = exists(url, 'glb').then(ok => ok ? new GLTFLoader().loadAsync(url) : null).catch(e => { console.warn(`[living] actor GLB ${file} failed`, e); return null; });
  pendingActorLoads.push(p);
  return p;
}

/** Folds any other actor-side async work (textures, material setup) into the world's `ready`. */
export function trackLivingLoad<P extends Promise<unknown>>(p: P): P { pendingActorLoads.push(p); return p; }

/** Dispose every mesh geometry/material/texture under a loaded GLB scene. */
export function disposeGlbScene(s: T.Object3D) {
  s.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => { for (const v of Object.values(x)) if (v instanceof T.Texture) v.dispose(); x.dispose(); }); } });
}

/** Optional Blender hero export manifest (public/assets/deepsea/living/<name>.json). */
interface HeroManifest {
  /** Blender exporter format: root position / yaw in the living-deck world. */
  placement?: {position?: [number, number, number]; rotationYDeg?: number};
  position?: [number, number, number];
  rotation?: [number, number, number];
  yawDeg?: number;
  scale?: number | [number, number, number];
  /** Fallback child names to keep visible (e.g. interactables authored separately). */
  keep?: string[];
  /** Tileable modules: one instance per entry (atrium balcony). */
  suggestedInstances?: {position: [number, number, number]; rotationYDeg?: number}[];
}

const BASE = '/assets/deepsea/living/';
/** Hero anchors whose visual is built by an actor module (living-cocoon.ts); a hero GLB of the same name is not loaded. */
const ACTOR_OWNED = new Set<HeroName>(['cocoon-corpse']);
/**
 * Distance LOD: <name>.lod1.glb (tools/blender/make-living-lod.py, decimated, texture-less placeholder materials
 * rebound by name) replaces the full mesh beyond this distance (m) from the nearest point of the hero's
 * (or balcony tile's) bounding box.
 */
const HERO_LOD: Partial<Record<HeroName, number>> = {'atrium-balcony': 6, 'valve-manifold': 8};

/**
 * Two-level LOD measured to a local bounding box rather than the pivot (a 20 m balcony tile is 10 m from its own
 * centre at either end). The switch distance grows with the photo zoom: the site narrows camera.fov from 64°.
 */
class BoxLOD extends T.LOD {
  private far = false;
  private readonly eye = new T.Vector3();
  private readonly world = new T.Box3();
  constructor(private readonly box: T.Box3) { super(); }
  override update(camera: T.Camera) {
    const [near, far] = this.levels; if (!near || !far) return;
    const c = camera as T.PerspectiveCamera, zoom = c.isPerspectiveCamera ? Math.max(1, 64 / c.fov) : 1;
    const d = this.world.copy(this.box).applyMatrix4(this.matrixWorld).distanceToPoint(this.eye.setFromMatrixPosition(camera.matrixWorld)) / zoom;
    this.far = d > far.distance * (this.far ? .9 : 1.1);
    near.object.visible = !this.far; far.object.visible = this.far;
  }
}
function lodPair(hi: T.Object3D, lo: T.Object3D, distance: number, skip: (o: T.Object3D) => boolean = () => false) {
  const box = new T.Box3();
  hi.updateMatrixWorld(true);
  hi.traverse(o => { if ((o as T.Mesh).isMesh && !skip(o)) box.expandByObject(o); });
  const lod = new BoxLOD(box);
  lod.addLevel(hi, 0); lod.addLevel(lo, distance);
  return lod;
}
/**
 * Paper photo targets (code note, placard, form) are shot almost head-on with the headlamp at the lens: the
 * paper blows out and its bloom halo floods the ink. Same maps, no specular, paper albedo pulled down.
 */
/** Body parts of corpse figures (fabric and rubber): IBL is damped so dark cloth never reads as polished. */
const FIGURE_NODES = ['security-diver', 'manager-corpse'];
/**
 * Cloth and rubber under the coaxial headlamp: with F0 = 0.04 every camera-facing fold sits on the GGX
 * peak and the specular lobe outshines a 3% albedo several times over (grey satin, "mannequin"). Woven
 * and silted surfaces scatter that energy diffusely, so the dielectric specular is cut to ~20% (metal
 * fittings keep theirs). scene.environment ignores material.envMapIntensity, so IBL is damped here too.
 */
export function dampFigureIbl(m: T.MeshStandardMaterial, spec = .22) {
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n material.specularColorBlended *= mix(${spec.toFixed(3)}, 1., metalnessFactor);`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n radiance *= .4; iblIrradiance *= .7;');
  };
  m.customProgramCacheKey = () => `${prevKey}|figure-ibl-${spec}`;
  m.userData.figureIbl = true; m.needsUpdate = true;
}
function matteDocument(src: T.MeshStandardMaterial) {
  const m = new T.MeshPhysicalMaterial({
    name: src.name, color: src.color, map: src.map, normalMap: src.normalMap, normalScale: src.normalScale, aoMap: src.aoMap, aoMapIntensity: src.aoMapIntensity,
    roughness: 1, metalness: 0, specularIntensity: 0, side: src.side, transparent: src.transparent, alphaTest: src.alphaTest, alphaMap: src.alphaMap,
  });
  m.color.multiplyScalar(.3);
  return m;
}
async function loadLod(name: HeroName, hi: T.Object3D, loader: GLTFLoader): Promise<T.Object3D | null> {
  const url = `${BASE}${name}.lod1.glb`;
  if (!HERO_LOD[name] || !(await exists(url, 'glb'))) return null;
  try {
    const lo = (await loader.loadAsync(url)).scene;
    const mats = new Map<string, T.Material>();
    hi.traverse(o => { const m = o as T.Mesh; if (m.isMesh) for (const x of [m.material].flat()) mats.set(x.name, x); });
    lo.traverse(o => {
      const m = o as T.Mesh; if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true; m.userData.noCollide = true;
      m.material = [m.material].flat().map(x => { const full = mats.get(x.name); if (full) { x.dispose(); return full; } return x; }) as T.Material | T.Material[];
      if (Array.isArray(m.material) && m.material.length === 1) m.material = m.material[0];
    });
    return lo;
  } catch (e) { console.warn(`[living] hero LOD ${name} failed, full mesh only`, e); return null; }
}

async function exists(url: string, kind: 'json' | 'glb') {
  try {
    const r = await fetch(url, {method: 'HEAD'});
    if (!r.ok) return false;
    const type = r.headers.get('content-type') ?? '';
    // Vite's dev server answers unknown paths with index.html (200, text/html).
    return !type.includes('text/html') && (kind === 'glb' ? !type.includes('json') : true);
  } catch { return false; }
}

/**
 * Loads Blender hero GLBs when present and swaps out the procedural fallback.
 * GLB meshes are visual only: they never contribute colliders (HeroBuild.solids mirror their footprints).
 * Operable parts are handed to the HeroBuild (heroAdopter) before onLoaded, so they ride the procedural
 * driver objects. Missing or broken files are ignored and the fallback stays.
 */
export function loadHeroGlbs(fallbacks: Map<HeroName, T.Group>, groups: Map<string, T.Group>, onLoaded?: (name: HeroName, scene: T.Object3D) => void) {
  const loader = new GLTFLoader();
  const loaded = new Map<HeroName, T.Object3D>();
  const jobs = (Object.keys(HERO_GLB_PLACEMENT) as HeroName[]).filter(n => !ACTOR_OWNED.has(n)).map(async name => {
    const glbUrl = `${BASE}${name}.glb`;
    if (!(await exists(glbUrl, 'glb'))) return;
    let manifest: HeroManifest = {};
    if (await exists(`${BASE}${name}.json`, 'json')) {
      try { manifest = await (await fetch(`${BASE}${name}.json`)).json() as HeroManifest; } catch { manifest = {}; }
    }
    try {
      const gltf = await loader.loadAsync(glbUrl);
      const a = HERO_GLB_PLACEMENT[name];
      const paper = new Set<T.Object3D>();
      for (const p of HERO_GLB_PARTS) if (p.hero === name && p.role === 'photo') gltf.scene.getObjectByName(p.node)?.traverse(o => paper.add(o));
      const matte = new Map<string, T.MeshStandardMaterial>();
      const figure = new Set<T.Object3D>();
      for (const node of FIGURE_NODES) gltf.scene.getObjectByName(node)?.traverse(o => figure.add(o));
      gltf.scene.traverse(o => {
        const mesh = o as T.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.noCollide = true;
        if (paper.has(mesh)) mesh.material = [mesh.material].flat().map(x => matte.get(x.uuid) ?? matte.set(x.uuid, matteDocument(x as T.MeshStandardMaterial)).get(x.uuid)!) as T.Material | T.Material[];
        if (Array.isArray(mesh.material) && mesh.material.length === 1) mesh.material = mesh.material[0];
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mt of mats) {
          const s = mt as T.MeshStandardMaterial;
          if (s.map) s.map.anisotropy = 8;
          // Baked ORM: R is local AO (0.35..1). Without it the env term lights folds and armpits like open faces.
          if (s instanceof T.MeshStandardMaterial && s.roughnessMap && !s.aoMap) { s.aoMap = s.roughnessMap; s.aoMapIntensity = 1; s.needsUpdate = true; }
          if (figure.has(mesh) && s instanceof T.MeshStandardMaterial && !s.userData.figureIbl) dampFigureIbl(s);
          if (s instanceof T.MeshStandardMaterial) withStaticLights(s, 'glb');
        }
      });
      let scene: T.Object3D;
      const lo = await loadLod(name, gltf.scene, loader), lodAt = HERO_LOD[name] ?? 0;
      if (name === 'atrium-balcony') {
        // tile the 20 m module; instances share geometry and materials; each tile switches LOD on its own centre
        scene = new T.Group();
        const tiles = manifest.suggestedInstances ?? ATRIUM_BALCONY_TILES.map(t => ({position: [...t.position] as [number, number, number], rotationYDeg: t.yawDeg}));
        tiles.forEach((t, i) => {
          const hi = i === 0 ? gltf.scene : gltf.scene.clone(true);
          const inst = lo ? lodPair(hi, i === 0 ? lo : lo.clone(true), lodAt) : hi;
          inst.name = `living-hero-glb:atrium-balcony#${i}`;
          inst.position.set(...t.position); inst.rotation.y = (t.rotationYDeg ?? 0) * Math.PI / 180;
          scene.add(inst);
        });
      } else {
        let body: T.Object3D = gltf.scene;
        if (lo) {
          // operable parts leave the LOD tree when adopted, so they do not count toward its box
          const own = (o: T.Object3D) => HERO_GLB_PARTS.some(p => p.hero === name && (o.name === p.node || o.parent?.name === p.node));
          body = new T.Group(); body.add(lodPair(gltf.scene, lo, lodAt, own));
        }
        scene = body;
        scene.position.set(...(manifest.placement?.position ?? manifest.position ?? a.position));
        if (manifest.rotation) scene.rotation.set(...manifest.rotation);
        else scene.rotation.y = (manifest.placement?.rotationYDeg ?? manifest.yawDeg ?? a.yawDeg) * Math.PI / 180;
        if (manifest.scale !== undefined) typeof manifest.scale === 'number' ? scene.scale.setScalar(manifest.scale) : scene.scale.set(...manifest.scale);
      }
      scene.name = `living-hero-glb:${name}`;
      groups.get(HERO_SPACE[name])?.add(scene);
      heroAdopter(fallbacks)?.adopt(name, scene);
      const fb = fallbacks.get(name);
      if (fb) for (const c of fb.children) if (!manifest.keep?.includes(c.name)) c.visible = false;
      loaded.set(name, scene);
      onLoaded?.(name, scene);
    } catch (e) {
      console.warn(`[living] hero GLB ${name} failed, keeping fallback`, e);
    }
  });
  const ready = Promise.allSettled([...jobs, ...pendingActorLoads.splice(0)]).then(() => undefined);
  return {
    ready, loaded,
    dispose() {
      for (const s of loaded.values()) { s.removeFromParent(); disposeGlbScene(s); }
    },
  };
}
