import * as T from 'three';
import {createLivingWorld, type LivingWorldState, type LivingCreatureVisual} from './pod/view/deepsea/living-world';
import {createLivingRender, LIVING_RENDER_PROFILES} from './pod/view/deepsea/living-render';
import {LIVING_STATIC} from './pod/view/deepsea/living-materials';
import {LIVING_CREATURES, ALEX_MARKS, type Vec3} from './pod/content/living-deck-layout';

/**
 * Standalone visual preview for the level-two world, rendered through the shared living-render pipeline.
 * URL: /living-preview.html?cam=x,y,z&look=x,y,z&recording=1&lamp=1&slime=1&gate=0..1&probe=<shot>
 *      &alex=x,y,z&pose=film&creature=<id>@x,y,z:mode;...&valves=feed&fov=64&t=12&live=1
 *      &w=1280&h=720&quality=high|medium&perf=1 (GPU-synced frame timing)&stats=1 (luma histogram)
 *      &static=0 (disable the space-clipped static practicals)&tris=1 (visible triangles by owner)&programs=1
 *      &profile=bloom:.7,halo:1.6 (override render-profile fields for look development)
 */
const q = new URLSearchParams(location.search);
const vec = (key: string, d: Vec3): Vec3 => { const v = q.get(key)?.split(',').map(Number); return v && v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : d; };
const num = (key: string, d: number) => { const v = Number(q.get(key)); return q.has(key) && Number.isFinite(v) ? v : d; };
const W = num('w', 1024), H = num('h', 720);

const renderer = new T.WebGLRenderer({antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new T.Scene();
const world = createLivingWorld();
scene.add(world.root);

const camera = new T.PerspectiveCamera(num('fov', 64), W / H, .08, 160);
const probe = q.get('probe') as keyof typeof world.probeShots | null;
let cam = vec('cam', [24, 0, 7.5]), look = vec('look', [60, 0, 7.5]);
// cam/look/fov override the authored probe framing (living-deck-site replaces some probe shots with its own).
if (probe && world.probeShots[probe]) { const s = world.probeShots[probe]; cam = vec('cam', s.position); look = vec('look', s.target); camera.fov = num('fov', s.fov); }
camera.position.set(...cam); camera.lookAt(...look); camera.updateProjectionMatrix(); scene.add(camera);

// Debug: profile=bloom:.7,halo:1.6 overrides fields of the active render profile (recording, or live with live=1).
for (const kv of (q.get('profile') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':'); const p = LIVING_RENDER_PROFILES[q.get('live') === '1' ? 'live' : 'recording'] as unknown as Record<string, number>;
  if (k in p || k === 'fogTint') p[k] = Number(v);
}
const quality = q.get('quality') === 'medium' ? 'medium' : 'high';
const view = createLivingRender({renderer, scene, camera, world, width: W, height: H, quality});
const lampOn = q.get('lamp') !== '0';
(window as unknown as {__living: unknown}).__living = {T, scene, camera, world, view, renderer};
/** Debug: override=normal|lambert replaces every material to separate geometry/lighting from shading. */
if (q.get('override') === 'normal') scene.overrideMaterial = new T.MeshNormalMaterial();
else if (q.get('override') === 'lambert') scene.overrideMaterial = new T.MeshLambertMaterial({color: '#bbbbbb'});

const time = num('t', 8);
const creatures: LivingCreatureVisual[] = [];
const spec = q.get('creature');
if (spec) for (const part of spec.split(';')) {
  const [idPart, rest] = part.split('@'); const c = LIVING_CREATURES.find(v => v.id === idPart); if (!c) continue;
  const [pos, mode] = (rest ?? '').split(':'); const p = pos ? pos.split(',').map(Number) : null;
  creatures.push({id: c.id, type: c.type, position: p && p.length === 3 ? [p[0], p[1], p[2]] : c.home, heading: num('heading', 0), mode: mode ?? 'idle'});
} else if (q.get('creatures') === 'home') for (const c of LIVING_CREATURES) creatures.push({id: c.id, type: c.type, position: c.home, heading: 0, mode: 'idle'});
const valves = (q.get('valves') ?? '').split(',');
const live = q.get('live') === '1';
const state: LivingWorldState = {
  time, recording: q.get('recording') === '1', lamp: lampOn, collected: (q.get('collected') ?? '').split(',').filter(Boolean),
  probe: (q.get('probeState') as LivingWorldState['probe']) ?? 'none',
  valves: {heat: valves.includes('heat'), feed: valves.includes('feed'), cool: valves.includes('cool')},
  valveTurn: {heat: valves.includes('heat') ? 1 : 0, feed: valves.includes('feed') ? 1 : 0, cool: valves.includes('cool') ? 1 : 0},
  slime: num('slime', 1), gateOpen: num('gate', 0),
  alex: {position: vec('alex', ALEX_MARKS.glass), heading: num('alexHeading', 270), visible: q.get('alex') !== 'none', pose: (q.get('pose') as LivingWorldState['alex']['pose']) ?? 'idle'},
  creatures,
};

/** Debug: hide named world subtrees, e.g. hide=living-atmosphere,living-creatures */
const hidden = (q.get('hide') ?? '').split(',').filter(Boolean);
function frame(t: number) {
  state.time = t;
  world.setFocus(cam);
  world.update(state, 1 / 30);
  if (hidden.length) scene.traverse(o => { if (hidden.includes(o.name)) o.visible = false; });
  view.frame({mode: live ? 'live' : 'recording', time: t, lampOn, probe: !!probe});
  if (q.get('static') === '0') LIVING_STATIC.uSLCount.value = 0;
  if (q.get('vol') === '0') (view.composer.passes[2] as unknown as {compositeMat: T.ShaderMaterial}).compositeMat.uniforms.scatterGain.value = 0;
  if (q.get('ao') === '0') view.composer.passes[1].enabled = false;
  if (q.get('shadow') === '0') for (const l of [view.lamp, view.probeLamp]) l.castShadow = false;
  if (q.get('keyshadow') === '0') for (const l of view.keys) l.castShadow = false;
  if (q.get('fog') === '0' && scene.fog instanceof T.FogExp2) scene.fog.density = -1e-6;
  view.render(1 / 30);
}

/** Luma histogram of the final frame: mean, p50/p90/p99 and the share of pixels below 10%. */
function stats() {
  const gl = renderer.getContext(); const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const hist = new Uint32Array(256), outHist = new Uint32Array(256); let sum = 0, satSum = 0, magenta = 0, outN = 0, outSum = 0;
  // pixels whose view ray lies outside the headlamp cone (lamp sits at the lens, so parallax is ignored)
  const ty = Math.tan(T.MathUtils.degToRad(camera.fov) / 2), tx = ty * camera.aspect, cosOut = Math.cos(view.lamp.angle + .04);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]; const l = Math.round(r * .2126 + g * .7152 + b * .0722);
    const k = i / 4, x = ((k % W) + .5) / W * 2 - 1, y = (Math.floor(k / W) + .5) / H * 2 - 1;
    const dx = x * tx, dy = y * ty;
    if (1 / Math.sqrt(1 + dx * dx + dy * dy) < cosOut) { outHist[l]++; outN++; outSum += l; }
    hist[l]++; sum += l; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); satSum += mx ? (mx - mn) / mx : 0;
    if (mx > 40 && r > g * 1.3 && b > g * 1.15) magenta++;
  }
  const n = W * H; const pct = (p: number) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * p) return i; } return 255; };
  let dark = 0; for (let i = 0; i < 26; i++) dark += hist[i];
  let acc = 0, outP90 = 0; for (let i = 0; i < 256; i++) { acc += outHist[i]; if (acc >= outN * .9) { outP90 = i; break; } }
  return {mean: +(sum / n / 255).toFixed(3), p50: pct(.5), p90: pct(.9), p99: pct(.99), below10: +(dark / n).toFixed(3), sat: +(satSum / n).toFixed(3), magenta: +(magenta / n).toFixed(4),
    rig: [...view.keys, ...view.points].map(l => `${l.name.split(':')[1]}@${l.position.toArray().map(v => v.toFixed(0)).join(',')}=${l.intensity.toFixed(0)}`).join(' ') + ` static=${LIVING_STATIC.uSLCount.value}`,
    outsideLamp: outN ? {share: +(outN / n).toFixed(2), mean: +(outSum / outN / 255).toFixed(3), p90: +(outP90 / 255).toFixed(3)} : null};
}

(async () => {
  const hud = document.getElementById('hud')!;
  hud.textContent = 'loading…';
  for (let i = 0; i < 40; i++) world.update(state, 1 / 30);
  await Promise.race([world.ready, new Promise(r => setTimeout(r, 60000))]);
  for (let i = 0; i < 3; i++) { frame(time); await new Promise(r => requestAnimationFrame(r)); }
  const out = window as unknown as {__ready: boolean; __perf?: unknown; __stats?: unknown};
  if (q.get('perf') === '1') {
    const gl = renderer.getContext(); const ms: number[] = []; const px = new Uint8Array(4);
    renderer.info.autoReset = false;
    for (let i = 0; i < 40; i++) {
      renderer.info.reset();
      const t0 = performance.now(); frame(time + i / 30);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    out.__perf = {median: +ms[20].toFixed(2), p90: +ms[36].toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, size: `${W}x${H}`, quality};
    renderer.info.autoReset = true;
    frame(time);
  }
  if (q.get('stats') === '1') out.__stats = stats();
  if (q.get('meter') === '1') console.warn('[living-meter]', view.meterValue?.().toFixed(4));
  if (q.get('tris') === '1') {
    // Visible triangles by owner (first two named ancestors under the world root), largest first.
    const by = new Map<string, number>();
    world.root.traverseVisible(o => {
      const m = o as T.Mesh; if (!m.isMesh || !m.geometry) return;
      const idx = m.geometry.index, n = (idx ? idx.count : m.geometry.getAttribute('position').count) / 3 * ((m as T.InstancedMesh).isInstancedMesh ? (m as T.InstancedMesh).count : 1);
      const path: string[] = []; for (let p: T.Object3D | null = o; p && p !== world.root; p = p.parent) if (p.name) path.unshift(p.name);
      const key = path.slice(0, 2).join('/'); by.set(key, (by.get(key) ?? 0) + n);
    });
    console.warn('[living-tris]', [...by].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}=${(v / 1e3).toFixed(0)}k`).join(' '));
  }
  if (q.get('programs') === '1') console.warn('[programs]', (renderer.info.programs ?? []).map(p => `${p.name}:${p.cacheKey.includes('living-static') ? 'S' : '-'}`).join(' '));
  hud.textContent = q.get('hud') === '0' ? '' : `${probe ?? ''} cam ${cam.join(',')} → ${look.join(',')} ${renderer.info.render.calls} calls ${renderer.info.render.triangles} tris`;
  for (const uv of (q.get('pick') ?? '').split(';').filter(Boolean)) {
    const [u, v] = uv.split(',').map(Number);
    const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(u * 2 - 1, 1 - v * 2), camera);
    const hits = ray.intersectObject(world.root, true).slice(0, 4).map(h => {
      const path: string[] = []; for (let o: T.Object3D | null = h.object; o && o !== world.root; o = o.parent) path.push(o.name || o.type);
      const mat = (h.object as T.Mesh).material as T.Material | undefined;
      return `${h.distance.toFixed(2)}m ${path.join('<')} [${mat && 'name' in mat ? mat.name : ''}] @${h.point.toArray().map(n => n.toFixed(2)).join(',')}`;
    });
    console.warn(`[pick ${uv}]`, hits.join(' | '));
  }
  out.__ready = true;
  if (q.get('animate') === '1') { const t0 = performance.now(); const loop = () => { frame(time + (performance.now() - t0) / 1000); requestAnimationFrame(loop); }; loop(); }
})();
