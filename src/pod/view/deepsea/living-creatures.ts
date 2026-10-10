import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {clone as cloneSkinned} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {LIVING_CREATURES, LIVING_DOORS, LIVING_SPACES, type CreatureType, type Vec3} from '../../content/living-deck-layout';
import {livingSpaceAt} from '../../sim/living-creatures';
import {rng} from './living-build';
import {addRim, fbm, field, normalTexture, pixelTexture, smooth, taperedTube} from './living-actor-tex';
import {disposeGlbScene, loadActorGlb} from './living-glb';

export interface CreatureVisualState {id: string; type: CreatureType; position: Vec3; heading: number; mode: string}

interface Motion {uTime: {value: number}; uPhase: {value: number}; uCurl: {value: number}; uSpeed: {value: number}; uAmp: {value: number}; uLen: {value: number}}
type BodyKind = 'lumen' | 'eel';

const PI = Math.PI;
const faceYaw = (deg: number) => { const h = deg * PI / 180; return Math.atan2(Math.sin(h), -Math.cos(h)); };

/**
 * Vertex motion shared by all creature materials. Lumen: body curtain / tendrils ripple below the ribs with
 * a travelling frill on the hem. Eel: lateral undulation along local z (head at 鈭抣en/2) and an optional coil.
 */
function animate(mat: T.MeshStandardMaterial, u: Motion, kind: BodyKind) {
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uPhase; uniform float uCurl; uniform float uSpeed; uniform float uAmp; uniform float uLen;
vec3 cMove(vec3 p, inout vec3 n) {
${kind === 'lumen' ? `
  float w = smoothstep(-.1, -1.6, p.y);
  float ang = atan(p.x, p.z);
  float t = uTime * uSpeed + uPhase;
  p.x += (sin(t * 1.3 + p.y * 2.4 + ang * 2.) * .11 + sin(t * .7 + p.y * 1.3) * .07) * w * uAmp;
  p.z += (cos(t * 1.1 + p.y * 2.1 + ang * 3.) * .11) * w * uAmp;
  float frill = 1. + sin(ang * 9. - t * 2.2 + p.y * 4.) * .07 * w * w * uAmp;
  p.xz *= frill;
  p.y += sin(t * .9 + ang * 5.) * .05 * w * w;
  p.x += sin(t * .4) * .03; p.y += sin(t * .55 + 1.) * .05;
` : `
  float s = clamp(p.z / uLen + .5, 0., 1.);
  float t = uTime * uSpeed + uPhase;
  float env = (.05 + s * s * .3) * uAmp * (1. - uCurl);
  float ph = s * 9.4 - t * 2.6;
  p.x += sin(ph) * env;
  float slope = cos(ph) * 9.4 / uLen * env;
  n = normalize(vec3(n.x - n.z * slope, n.y, n.z + n.x * slope));
  p.y += sin(ph * .5 + 1.3) * env * .15;
  if (uCurl > .001) {
    float th = s * 6.9;
    float R = uLen / 6.9;
    float ct = cos(th), st = sin(th);
    vec3 curled = vec3(R * (1. - ct) - R, s * .55 - .275, R * st) + vec3(ct, 0., -st) * p.x + vec3(0., p.y, 0.);
    p = mix(p, curled, uCurl);
    n = normalize(mix(n, vec3(n.x * ct + n.z * st, n.y, -n.x * st + n.z * ct), uCurl));
  }
`}
  return p;
}`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(normal);
vec3 cMoved = cMove(position, objectNormal);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = cMoved;');
  };
  mat.customProgramCacheKey = () => `living-creature-${kind}-v2`;
}

/** Tube along local z from 鈭抣en/2 (head) to +len/2, radius profile r(s), elliptic section; uv: u around, v along. */
function bodyTube(len: number, prof: (s: number) => number, sx: number, sy: number | ((s: number) => number), radial = 24, rings = 90) {
  const g = new T.CylinderGeometry(1, 1, len, radial, rings, false);
  g.rotateX(PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), s = T.MathUtils.clamp(z / len + .5, 0, 1), r = prof(s);
    const y = p.getY(i), syv = typeof sy === 'number' ? sy : sy(s);
    // flatten the belly slightly (keel), keep the back round
    p.setXYZ(i, p.getX(i) * r * sx, y * r * syv * (y < 0 ? .88 : 1), z);
  }
  g.computeVertexNormals();
  return g;
}
type V = [number, number, number];
const at = (g: T.BufferGeometry, pos: V, rot: V = [0, 0, 0], scl: V = [1, 1, 1]) => g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(...scl)));
function rodGeo(a: V, b: V, r0: number, r1 = r0, seg = 8, len = 1) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new T.CylinderGeometry(r1, r0, L, seg, Math.max(1, Math.round(L * 6 * len)), false);
  g.translate(0, L / 2, 0);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
  g.translate(...a);
  return g;
}
/** Smooth 3D value noise in [0, 1]. */
function noise3(x: number, y: number, z: number, seed: number) {
  const h = (i: number, j: number, k: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453; return s - Math.floor(s); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t: number) => t * t * (3 - 2 * t), u = f(xf), v = f(yf), w = f(zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}
/** Push vertices along their normals by two octaves of position noise (lumpy, uneven flesh instead of lathe-smooth). */
function roughen(g: T.BufferGeometry, amp: number, freq: number, seed: number) {
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = ((noise3(x * freq, y * freq, z * freq, seed) - .5) + (noise3(x * freq * 2.7, y * freq * 2.7, z * freq * 2.7, seed + 5) - .5) * .45) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}
function merge(list: T.BufferGeometry[]) {
  const flat = list.map(g => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (!n.getAttribute('uv')) n.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    return n;
  });
  const out = mergeGeometries(flat, false)!;
  for (const g of new Set([...list, ...flat])) g.dispose();
  return out;
}
/** Fin membrane strip along z: base follows y0(s), free edge at y0(s) + h(s); uv.x along, uv.y base鈫抏dge. */
function finStrip(len: number, s0: number, s1: number, n: number, y0: (s: number) => number, h: (s: number) => number, x = 0) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n, z = (s - .5) * len;
    pos.push(x, y0(s), z, x, y0(s) + h(s), z); uv.push(i / n, 0, i / n, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export interface CreatureVisual {
  id: string; type: CreatureType; root: T.Group;
  update(s: CreatureVisualState | undefined, time: number, dt: number, recording: boolean, focus: T.Vector3, lampOn: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------- shared materials (procedural skin textures)
function creatureMaterials() {
  const textures: T.Texture[] = [];
  const keep = <X extends T.Texture>(t: X) => { textures.push(t); return t; };
  // lumen skin: pale, veined, subcutaneous photophore freckles (emissive map)
  const S = 256;
  const veinH = field(S, (u, v) => { const a = fbm(u, v, 6, 4, 2); return Math.pow(1 - Math.abs(a * 2 - 1), 8); });
  // waxy drowned-skin tones: yellow-grey base, livid purple pooling, green-black veins, darker creases
  const livid = field(S, (u, v) => fbm(u, v, 3, 4, 41)), crease = field(S, (u, v) => Math.pow(1 - Math.abs(fbm(u, v, 7, 3, 17) * 2 - 1), 5));
  const lumenMap = keep(pixelTexture(S, (_x, _y, i) => {
    const v = veinH[i], l = smooth(.5, .75, livid[i]), c = crease[i];
    const base = [104 - l * 26, 100 - l * 34, 86 - l * 6];
    return [base[0] - v * 52 - c * 26, base[1] - v * 40 - c * 24, base[2] - v * 34 - c * 20, 255];
  }));
  const lumenNrm = keep(normalTexture(field(S, (u, v) => fbm(u, v, 10, 4, 5) * .45 + veinH[Math.floor(v * S) * S + Math.floor(u * S)] * .35 + crease[Math.floor(v * S) * S + Math.floor(u * S)] * .4), S, 5));
  const r = rng(5);
  const dots = Array.from({length: 140}, () => [r(), r(), .004 + r() * .01]);
  const lumenEmit = keep(pixelTexture(S, (x, y) => { const u = x / S, v = y / S; let e = 0; for (const [a, b, rr] of dots) e = Math.max(e, 1 - smooth(rr * .4, rr, Math.hypot(u - a, v - b))); const g = e * 255; return [g * .55, g, g, 255]; }));
  const skinLumen = new T.MeshPhysicalMaterial({color: '#a49c8c', map: lumenMap, normalMap: lumenNrm, normalScale: new T.Vector2(1.2, 1.2), roughness: .55, sheen: .25, sheenColor: new T.Color('#5a4a50'), sheenRoughness: .6, emissiveMap: lumenEmit, emissive: '#5fe0f0', emissiveIntensity: .3, clearcoat: .45, clearcoatRoughness: .3});
  lumenMap.repeat.set(2, 2); lumenNrm.repeat.set(3, 3);
  // body curtain: translucent membrane with radial veins, ragged hem (alpha), faint vein glow
  const CW = 256, CH = 512;
  const curtH = field(CW, (u, v) => fbm(u, v, 5, 4, 8));
  const curtain = new T.MeshPhysicalMaterial({
    map: keep(pixelTexture(CW, (x, y) => { const u = x / CW, v = y / CH; const vein = Math.pow(1 - Math.abs(Math.sin(u * PI * 18 + fbm(u, v, 4, 3, 3) * 3)), 14); const c = 78 + vein * 40 - v * 30; return [c * .85, c, c * .98, 255]; }, true, true, CH)),
    alphaMap: keep(pixelTexture(CW, (x, y) => {
      const u = x / CW, v = y / CH; const n = curtH[(y % CW) * CW + x];
      let a = (1 - smooth(.86, .97, v + (n - .5) * .22)) * (.55 + .45 * n);           // ragged, thinning hem
      a *= 1 - smooth(.25, .1, Math.abs(fbm(u, v * 2, 9, 3, 13) - .5) * 4) * smooth(.5, .9, v) * .9;  // holes near the hem
      const g = Math.max(0, Math.min(1, a)) * 255; return [g, g, g, 255];
    }, false, true, CH)),
    emissiveMap: keep(pixelTexture(CW, (x, y) => { const u = x / CW, v = y / CH; const vein = Math.pow(1 - Math.abs(Math.sin(u * PI * 18 + fbm(u, v, 4, 3, 3) * 3)), 24) * smooth(.1, .5, v); const g = vein * 255; return [g * .5, g, g, 255]; }, false, true, CH)),
    emissive: '#4fd2e6', emissiveIntensity: .35, roughness: .35, transparent: true, opacity: .42, side: T.DoubleSide, depthWrite: false, sheen: .2, sheenColor: new T.Color('#3a6a70'),
  });
  const tendril = new T.MeshPhysicalMaterial({color: '#4a5a58', roughness: .35, sheen: .2, sheenColor: new T.Color('#3a7a80'), emissive: '#0c2428', emissiveIntensity: .4, transparent: true, opacity: .8});
  const photophore = new T.MeshStandardMaterial({color: '#03161a', emissive: '#7af0ff', emissiveIntensity: 2.6, roughness: .3});
  const lure = new T.MeshStandardMaterial({color: '#a8d8d8', emissive: '#b8fbff', emissiveIntensity: 4, roughness: .2});

  // shade: dark slate eel, mottled back, pale belly, lateral stripe; translucent fins with rays
  // body-tube uv: u around (0 = belly, .5 = back), v along the body 鈫?canvas x = around, y = along
  const EW = 128, EH = 512;
  const mot = field(EW, (u, v) => fbm(u, v, 6, 5, 21));
  const shadeMap = keep(pixelTexture(EW, (x, y) => {
    const m = mot[(y % EW) * EW + x];
    const around = -Math.cos(x / EW * PI * 2);   // +1 back, 鈭? belly
    const back = smooth(-.2, .8, around);
    const blot = smooth(.5, .6, m) * back, fleck = smooth(.66, .7, fbm(x / EW, y / EH * 4, 24, 2, 9)) * .6;
    const c = [16 + (1 - back) * 30 - blot * 9 + fleck * 14, 20 + (1 - back) * 30 - blot * 11 + fleck * 16, 24 + (1 - back) * 28 - blot * 12 + fleck * 16];
    const stripe = 1 - smooth(.0, .03, Math.abs(around));
    return [c[0] + stripe * 22, c[1] + stripe * 26, c[2] + stripe * 26, 255];
  }, true, true, EH));
  // muscle-segment chevrons (myomeres) and loose skin wrinkles; tiled along the body (repeat 2 around 脳 14 along)
  const shadeNrm = keep(normalTexture(field(S, (u, v) => {
    const around = Math.abs(u * 2 - 1);
    const chevron = Math.pow(Math.abs(Math.sin((v * 3 + around * .9 + fbm(u, v, 4, 2, 6) * .25) * PI)), .6);
    const wrinkle = Math.pow(1 - Math.abs(fbm(u, v, 12, 3, 11) * 2 - 1), 4);
    return chevron * .35 + wrinkle * .35 + fbm(u, v, 24, 3, 7) * .3;
  }), S, 6));
  shadeNrm.repeat.set(2, 14);
  const shadeSkin = new T.MeshPhysicalMaterial({color: '#7a7a74', map: shadeMap, normalMap: shadeNrm, normalScale: new T.Vector2(1.4, 1.4), roughness: .62, clearcoat: .22, clearcoatRoughness: .45});
  const fin = new T.MeshPhysicalMaterial({
    map: keep(pixelTexture(256, (x, y) => { const u = x / 256, v = 1 - y / 256; const ray = Math.pow(1 - Math.abs(Math.sin(u * PI * 60)), 10); const blot = fbm(u, v, 6, 3, 23); const c = 18 + ray * 22 + v * 10 - blot * 8; return [c * .85, c * .95, c, 255]; })),
    alphaMap: keep(pixelTexture(256, (x, y) => { const u = x / 256, v = 1 - y / 256; const ray = Math.pow(1 - Math.abs(Math.sin(u * PI * 60)), 6); const edge = 1 - smooth(.8, 1, v + Math.sin(u * PI * 60) * .04 + (fbm(u, v, 8, 2, 3) - .5) * .25); const torn = smooth(.62, .7, fbm(u, v, 10, 3, 29)) * smooth(.4, .8, v); const g = Math.min(1, (.72 + ray * .28) * edge * (1 - torn)) * 255; return [g, g, g, 255]; })),
    roughness: .5, transparent: true, alphaTest: .08, side: T.DoubleSide, depthWrite: false,
  });
  const gill = new T.MeshStandardMaterial({color: '#160c10', roughness: .8, emissive: '#2a0a0a', emissiveIntensity: .2});
  const eyeLens = new T.MeshPhysicalMaterial({color: '#0a0d0e', emissive: '#c9e88a', emissiveIntensity: 1.6, roughness: .02, clearcoat: 1});

  // blind: pale pink-grey, wrinkled, scarred, blotchy
  const BW = 128, BH = 512;
  const bl = field(BW, (u, v) => fbm(u, v, 5, 5, 31));
  const scars = Array.from({length: 22}, () => [r(), r(), r() * PI, .02 + r() * .06]);
  const blindMap = keep(pixelTexture(BW, (x, y) => {
    const u = x / BW, v = y / BH; const m = bl[(y % BW) * BW + x];
    const around = -Math.cos(u * PI * 2), back = smooth(-.3, .9, around);
    let c = [70 - back * 26 + m * 14, 56 - back * 22 + m * 10, 54 - back * 22 + m * 9];
    for (const [sx, sy, sa, sl] of scars) { const dx = (u - sx) * .25, dy = v - sy; const along = dx * Math.cos(sa) + dy * Math.sin(sa), across = -dx * Math.sin(sa) + dy * Math.cos(sa); if (Math.abs(along) < sl && Math.abs(across) < .0025) c = c.map(q => q + 12); }
    if (smooth(.6, .66, m) > .5) c = [c[0] * .78, c[1] * .7, c[2] * .7];
    return [c[0], c[1], c[2], 255];
  }, true, true, BH));
  const blindNrm = keep(normalTexture(field(S, (u, v) => { const w = fbm(u, v, 4, 3, 2); return Math.abs(Math.sin((v * 22 + w * 4) * PI)) * .5 + fbm(u, v, 20, 3, 9) * .5; }), S, 5));
  const blind = new T.MeshPhysicalMaterial({color: '#6a5c56', map: blindMap, normalMap: blindNrm, normalScale: new T.Vector2(1, 1), roughness: .62, clearcoat: .15, clearcoatRoughness: .5});
  const pore = new T.MeshStandardMaterial({color: '#120808', roughness: 1, emissive: '#3a0a06', emissiveIntensity: .15});
  const teeth = new T.MeshPhysicalMaterial({color: '#6e665a', roughness: .3, clearcoat: .5});
  const mouth = new T.MeshStandardMaterial({color: '#3a1216', roughness: .5, side: T.DoubleSide});

  const rims: [T.MeshStandardMaterial, string, number, number][] = [
    [skinLumen, '#5fb8c8', 3.5, .12], [curtain, '#5fc8d8', 2.4, .16], [tendril, '#5fb8c8', 2.5, .12],
    [shadeSkin, '#4a7088', 4, .08], [fin, '#4a7088', 3, .04], [blind, '#8a7470', 3.2, .16],
  ];
  const all: T.Material[] = [skinLumen, curtain, tendril, photophore, lure, shadeSkin, fin, gill, eyeLens, blind, pore, teeth, mouth];
  return {skinLumen, curtain, tendril, photophore, lure, shadeSkin, fin, gill, eyeLens, blind, pore, teeth, mouth, rims, textures, all};
}
type CM = ReturnType<typeof creatureMaterials>;

function motion(phase: number, len = 1): Motion {
  return {uTime: {value: 0}, uPhase: {value: phase}, uCurl: {value: 0}, uSpeed: {value: 1}, uAmp: {value: 1}, uLen: {value: len}};
}
function mesh(geo: T.BufferGeometry, src: T.MeshStandardMaterial, u: Motion, kind: BodyKind, owned: (T.Material | T.BufferGeometry)[], cm: CM) {
  const mat = src.clone(); animate(mat, u, kind);
  const rim = cm.rims.find(x => x[0] === src); if (rim) addRim(mat, rim[1], rim[2], rim[3]);
  owned.push(mat, geo);
  const m = new T.Mesh(geo, mat); m.frustumCulled = false; m.castShadow = true; return m;
}

// ---------------------------------------------------------------- sculpted GLB bodies (tools/blender/build-living-creature-*.py)
type GlbType = 'lumen' | 'shade' | 'blind';
interface CreatureAsset {scene: T.Object3D; clips: T.AnimationClip[]; lod: T.Object3D | null}
/**
 * Per-material look (everything else 鈥?albedo, roughness, normal, AO, metalness 鈥?comes from the GLB as authored):
 * wrap / thinWrap: light past the terminator, scaled up where the tissue is thin; back: transmission of lights
 * behind thin tissue; thin source: body colour-map alpha (`thinMap`), COLOR_0 alpha (teeth) or a constant (fins);
 * amb: share of the room's ambient/probe diffuse the hide receives (dark hides sink into the room's darkness);
 * rim: water-backscatter edge [colour, power, strength] that only shows where the surface is unlit.
 */
interface SkinLook {wrap: number; thinWrap: number; back: number; sss: T.ColorRepresentation; thinMap?: number; thin?: number; amb: number; env: number; rim?: [string, number, number]; emit?: number; opacity?: number;
  /** Specular scale on dry (rough) skin; slime-wet areas keep full specular. */
  drySpec?: number; spec?: number; wetSpec?: number;
  /** Hanging-tissue sway (vertex, bind space, grows towards the free end) and fresnel veil alpha (thin centre, dense fold edges). */
  sway?: number; veil?: number}
const SKIN_LOOK: Record<string, SkinLook> = {
  creature_lumen_skin: {wrap: .12, thinWrap: .6, back: .7, sss: '#3a5a60', thinMap: 1, amb: .45, env: .12, rim: ['#4a8a98', 3.5, .08]},
  creature_lumen_curtain: {wrap: .5, thinWrap: 0, back: .6, sss: '#2a4c52', thin: 1, amb: .55, env: .2, rim: ['#4a9aa8', 2.4, .06], emit: .3, opacity: .8, sway: .35, veil: 1},
  creature_lumen_frill: {wrap: .5, thinWrap: 0, back: .6, sss: '#3a5a5a', thin: 1, amb: .55, env: .2, sway: .25, veil: .6},
  creature_lumen_tendril: {wrap: .4, thinWrap: 0, back: .5, sss: '#2a5a60', thin: 1, amb: .5, env: .2, sway: 1},
  creature_lumen_tendril_stalk: {wrap: .4, thinWrap: 0, back: .5, sss: '#2a5a60', thin: 1, amb: .5, env: .2, sway: .6},
  creature_shade_skin: {wrap: .1, thinWrap: .7, back: .8, sss: '#3a3438', thinMap: 1, amb: .4, env: .12, rim: ['#3e5a62', 3, .06]},
  creature_shade_fin: {wrap: .3, thinWrap: 0, back: .9, sss: '#2a2a2e', thin: 1, amb: .45, env: .2, opacity: .85},
  creature_shade_teeth: {wrap: .2, thinWrap: .8, back: 1, sss: '#8a7a5a', amb: .5, env: .3, drySpec: .6, spec: .8},
  creature_blind_skin: {wrap: .1, thinWrap: .6, back: .7, sss: '#5a2320', thinMap: 1, amb: .4, env: .12, rim: ['#3d5a62', 3, .06], drySpec: .08, spec: .22, wetSpec: .3},
  creature_blind_fin: {wrap: .3, thinWrap: 0, back: .9, sss: '#4a2420', thin: 1, amb: .45, env: .2},
  creature_blind_teeth: {wrap: .2, thinWrap: .8, back: 1, sss: '#8a7a5a', amb: .5, env: .3, drySpec: .6, spec: .8},
};
const DIFFUSE_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
const IRRADIANCE_LINE = 'vec3 irradiance = dotNL * directLight.color;';

/**
 * Recording reveal, per creature type (materials are shared per type): light arriving along the lens axis (headlamp,
 * probe lamp) only reaches the part of the body nearest the lens (`near` m from the eye, + REVEAL_SPAN) and inside the
 * beam core; front faces get a fraction of it, silhouette edges all of it. Light from any other direction (practicals,
 * back light) is untouched, so a creature crossing a lit doorway still reads, but the lamp no longer flat-lights it.
 */
export interface CreatureReveal {near: {value: number}; on: {value: number}}
const REVEAL_SPAN = .9, REVEAL_K = 1.7;
const REVEAL_GLSL = `
	float cLampF = 1.;
	{ float coax = smoothstep( .86, .975, dot( directLight.direction, geometryViewDir ) );
	  float edge = pow( 1. - saturate( dot( geometryNormal, geometryViewDir ) ), 1.6 );
	  cLampF = mix( mix( 1., mix( .55, 1., edge ), uRevealOn ), cReveal * mix( .28, 1., edge ), coax * uRevealOn ); }
	vec3 irradiance = dotNL * directLight.color * cLampF;`;

function glbMaterial(src: T.MeshStandardMaterial, reveal: CreatureReveal): T.Material {
  const look = SKIN_LOOK[src.name];
  if (!look) return src;
  const m = new T.MeshPhysicalMaterial({
    name: src.name, color: src.color, map: src.map, normalMap: src.normalMap, normalScale: src.normalScale, aoMap: src.aoMap, aoMapIntensity: src.aoMapIntensity,
    roughness: src.roughness, roughnessMap: src.roughnessMap, metalness: src.metalness, metalnessMap: src.metalnessMap, vertexColors: src.vertexColors,
    emissive: src.emissive, emissiveMap: src.emissiveMap, emissiveIntensity: src.emissiveIntensity * (look.emit ?? 1),
    transparent: src.transparent, opacity: src.opacity * (look.opacity ?? 1), alphaMap: src.alphaMap, alphaTest: src.alphaTest, side: src.side,
    depthWrite: !src.transparent,
  });
  if (m.map) m.map.anisotropy = 8;
  m.envMapIntensity = look.env;
  // hide/mucus against sea water reflects far less than skin in air; full F0 turns the coaxial lamp into a grey sheen
  m.specularIntensity = look.spec ?? .45;
  const u = {
    uWrap: {value: look.wrap}, uThinWrap: {value: look.thinWrap}, uBack: {value: look.back}, uSss: {value: new T.Color(look.sss)},
    uThinMap: {value: look.thinMap ?? 0}, uThin: {value: look.thin ?? 0}, uAmb: {value: look.amb},
    uRimColor: {value: new T.Color(look.rim?.[0] ?? '#000')}, uRimPow: {value: look.rim?.[1] ?? 4}, uRim: {value: look.rim?.[2] ?? 0},
    uDrySpec: {value: look.drySpec ?? .15}, uWetSpec: {value: look.wetSpec ?? 1},
    uRevealNear: reveal.near, uRevealOn: reveal.on,
    uSway: {value: look.sway ?? 0}, uSwayY: {value: new T.Vector2(0, 1)}, uCT: CREATURE_TIME, uVeil: {value: look.veil ?? 0},
  };
  m.userData.swayY = u.uSwayY.value;
  if (look.veil) { m.transparent = true; m.depthWrite = false; }
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    if (look.sway) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSway; uniform vec2 uSwayY; uniform float uCT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{ // free end hangs below the attachment (bind space, y up): curl inwards and sway with a travelling wave
	  float dep = clamp( ( uSwayY.x - transformed.y ) / uSwayY.y, 0., 1. );
	  float ph = atan( transformed.z, transformed.x ) * 2.;
	  float w = dep * dep * uSway;
	  transformed.x += ( sin( uCT * 1.1 + transformed.y * 3.1 + ph ) * .11 + sin( uCT * .43 + ph * 1.7 ) * .05 ) * w;
	  transformed.z += cos( uCT * .9 + transformed.y * 2.7 + ph ) * .09 * w;
	  transformed.xz *= 1. - .22 * w; }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWrap; uniform float uThinWrap; uniform float uBack; uniform vec3 uSss; uniform float uThinMap; uniform float uThin; uniform float uAmb;
uniform vec3 uRimColor; uniform float uRimPow; uniform float uRim; uniform float uDrySpec; uniform float uWetSpec; uniform float uRevealNear; uniform float uRevealOn;
float cThin; float cReveal = 1.;`)
      .replace('#include <lights_physical_pars_fragment>', T.ShaderChunk.lights_physical_pars_fragment.replace(IRRADIANCE_LINE, REVEAL_GLSL).replace(DIFFUSE_LINE, `${DIFFUSE_LINE}
	{ float nl = dot( geometryNormal, directLight.direction );
	  float w = uWrap + uThinWrap * cThin;
	  float wrapped = max( 0., ( nl + w ) / ( 1. + w ) - saturate( nl ) );
	  float through = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3. ) * uBack * cThin;
	  reflectedLight.directDiffuse += directLight.color * cLampF * uSss * ( wrapped + through ) * BRDF_Lambert( material.diffuseContribution ); }`))
      .replace('#include <map_fragment>', `{ float vd = length( vViewPosition );
  cReveal = smoothstep( .8, .95, vViewPosition.z / vd ) * exp( - max( 0., vd - uRevealNear - ${REVEAL_SPAN.toFixed(2)} ) * ${REVEAL_K.toFixed(2)} ); }
cThin = uThin;
#ifdef USE_MAP
	cThin = max( cThin, texture2D( map, vMapUv ).a * uThinMap );
#endif
#include <map_fragment>
#ifdef USE_COLOR_ALPHA
	cThin = max( cThin, vColor.a );
#endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
	{ float wetSpec = mix( uDrySpec, uWetSpec, smoothstep( .55, .25, roughnessFactor ) );
	  material.specularColor *= wetSpec; material.specularColorBlended *= wetSpec; material.specularF90 *= wetSpec; }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= uAmb;')
      .replace('#include <opaque_fragment>', `{ float fr = pow( 1. - saturate( abs( dot( normalize( vViewPosition ), normal ) ) ), uRimPow );
	float lit = dot( reflectedLight.directDiffuse + reflectedLight.directSpecular, vec3( .299, .587, .114 ) );
	outgoingLight += uRimColor * fr * uRim * ( 1. - smoothstep( 0., .03, lit ) );
	diffuseColor.a *= mix( 1., mix( .22, 1., pow( 1. - saturate( abs( dot( normalize( vViewPosition ), normal ) ) ), 1.3 ) ), uVeil ); }
#include <opaque_fragment>`)
      .replace('uniform float uRevealOn;', 'uniform float uRevealOn; uniform float uVeil;');
  };
  m.customProgramCacheKey = () => `living-creature-glb-skin-v6${look.sway ? '-sway' : ''}`;
  src.dispose();
  return m;
}

/** Visual hover of the shade rig above its sim point (m); the sim root is not moved. */
const SHADE_LIFT = .9;
/** Shared clock for GLB tissue sway. */
const CREATURE_TIME = {value: 0};
/** Root-to-nearest-end distance (m) used by the reveal depth. */
const HALF_LEN: Record<GlbType, number> = {lumen: .7, shade: 2.3, blind: 1.4};

/** LOD switch distance (m, camera to creature) for <type>.lod1.glb (decimated, same skeleton, LOD0 materials). */
const LOD_AT: Record<GlbType, number> = {lumen: 9, shade: 12, blind: 9};

/** One load + material conversion per creature type; instances clone the skinned scene and share materials/geometry. */
function creatureGlbKit() {
  const assets = new Map<GlbType, Promise<CreatureAsset | null>>();
  const loaded: T.Object3D[] = [];
  const reveal: Record<GlbType, CreatureReveal> = {
    lumen: {near: {value: 0}, on: {value: 1}}, shade: {near: {value: 0}, on: {value: 1}}, blind: {near: {value: 0}, on: {value: 1}},
  };
  const get = (type: GlbType) => {
    let p = assets.get(type);
    if (!p) {
      p = Promise.all([loadActorGlb(`living-creature-${type}.glb`), loadActorGlb(`living-creature-${type}.lod1.glb`)]).then(([g, l]) => {
        if (!g) return null;
        const conv = new Map<T.Material, T.Material>(), byName = new Map<string, T.Material>(), swaySeen = new Map<T.Material, [number, number]>();
        g.scene.traverse(o => {
          const m = o as T.Mesh; if (!m.isMesh) return;
          m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; m.userData.noCollide = true;
          m.material = [m.material].flat().map(x => conv.get(x) ?? conv.set(x, glbMaterial(x as T.MeshStandardMaterial, reveal[type])).get(x)!) as T.Material | T.Material[];
          if (Array.isArray(m.material) && m.material.length === 1) m.material = m.material[0];
          for (const x of [m.material].flat()) {
            byName.set(x.name, x);
            const sy = x.userData.swayY as T.Vector2 | undefined;
            if (sy) {
              if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
              const bb = m.geometry.boundingBox!, seen = swaySeen.get(x);
              const top = Math.max(bb.max.y, seen?.[0] ?? -Infinity), bot = Math.min(bb.min.y, seen?.[1] ?? Infinity);
              swaySeen.set(x, [top, bot]); sy.set(top, Math.max(.05, top - bot));
            }
          }
          if ((m.material as T.Material).transparent) m.renderOrder = 4;
        });
        loaded.push(g.scene);
        let lod: T.Object3D | null = null;
        if (l) {
          let ok = true;
          l.scene.traverse(o => {
            const m = o as T.Mesh; if (!m.isMesh) return;
            m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false; m.userData.noCollide = true;
            m.material = [m.material].flat().map(x => { const full = byName.get(x.name); if (!full) ok = false; x.dispose(); return full ?? x; }) as T.Material | T.Material[];
            if (Array.isArray(m.material) && m.material.length === 1) m.material = m.material[0];
            if ((m.material as T.Material).transparent) m.renderOrder = 4;
          });
          if (ok) { lod = l.scene; lods.push(l.scene); } else { console.warn(`[living] creature LOD ${type}: material names do not match, LOD0 only`); disposeGlbScene(l.scene); }
        }
        return {scene: g.scene, clips: g.animations, lod};
      });
      assets.set(type, p);
    }
    return p;
  };
  const lods: T.Object3D[] = [];
  return {get, reveal, dispose() {
    loaded.forEach(disposeGlbScene); loaded.length = 0;
    // LOD scenes share LOD0 materials: geometry only
    lods.forEach(s => s.traverse(o => (o as T.Mesh).geometry?.dispose())); lods.length = 0;
  }};
}
type GlbKit = ReturnType<typeof creatureGlbKit>;

/** Skinned instance with cross-faded looping clips; `actor` stays null until (and unless) the GLB loads. */
class GlbActor {
  readonly holder = new T.Group();
  mixer: T.AnimationMixer | null = null;
  scene: T.Object3D | null = null;
  private readonly actions = new Map<string, T.AnimationAction>();
  private current: T.AnimationAction | null = null;
  private disposed = false;
  private readonly near: T.Object3D[] = [];
  private readonly far: T.Object3D[] = [];
  private farOn = false;
  constructor(kit: GlbKit, private readonly type: GlbType, parent: T.Object3D, fallback: T.Object3D, phase: number, onReady?: (a: GlbActor) => void) {
    this.holder.name = `${type}-glb`;
    parent.add(this.holder);
    kit.get(type).then(asset => {
      if (!asset || this.disposed) return;
      const scene = cloneSkinned(asset.scene);
      this.scene = scene; this.holder.add(scene);
      this.mixer = new T.AnimationMixer(scene);
      for (const c of asset.clips) { const a = this.mixer.clipAction(c); a.time = (phase * .37 % 1) * c.duration; this.actions.set(c.name, a); }
      if (asset.lod) this.attachLod(cloneSkinned(asset.lod), scene);
      fallback.visible = false;
      onReady?.(this);
    });
  }
  /** LOD1 skinned meshes deform with the LOD0 bones (same names, rest pose and bind matrices); one mixer drives both. */
  private attachLod(lod: T.Object3D, scene: T.Object3D) {
    const meshes: T.SkinnedMesh[] = [];
    lod.traverse(o => { if ((o as T.SkinnedMesh).isSkinnedMesh) meshes.push(o as T.SkinnedMesh); });
    for (const sm of meshes) {
      const bones = sm.skeleton.bones.map(b => scene.getObjectByName(b.name) as T.Bone | undefined);
      if (bones.some(b => !b)) { console.warn(`[living] creature LOD ${this.type}: bone mismatch, LOD0 only`); return; }
      sm.bind(new T.Skeleton(bones as T.Bone[], sm.skeleton.boneInverses), sm.bindMatrix);
    }
    scene.traverse(o => { if ((o as T.Mesh).isMesh) this.near.push(o); });
    this.far.push(...meshes);
    lod.name = `${this.type}-lod1`;
    this.holder.add(lod);
    for (const m of this.far) m.visible = false;
  }
  /** Distance switch with 10 % hysteresis. */
  lod(distance: number) {
    if (!this.far.length) return;
    const far = distance > LOD_AT[this.type] * (this.farOn ? .9 : 1.1);
    if (far === this.farOn) return;
    this.farOn = far;
    for (const m of this.near) m.visible = !far;
    for (const m of this.far) m.visible = far;
  }
  get lodLevel() { return this.farOn ? 1 : 0; }
  get ready() { return !!this.mixer; }
  bone(name: string) { return this.scene?.getObjectByName(name) ?? null; }
  play(name: string, timeScale = 1, fade = .45) {
    const next = this.actions.get(name); if (!next) return;
    next.timeScale += (timeScale - next.timeScale) * .1;
    if (next === this.current) return;
    next.enabled = true; next.setEffectiveWeight(1); next.play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
  }
  update(dt: number) { this.mixer?.update(dt); }
  dispose() { this.disposed = true; this.mixer?.stopAllAction(); this.holder.removeFromParent(); }
}

/** Smoothed ground speed (m/s) from successive sim positions; snaps on teleports. */
function speedometer() {
  const last = new T.Vector3(), cur = new T.Vector3(); let has = false, v = 0;
  return (p: Vec3, dt: number) => {
    cur.set(...p);
    const d = has ? last.distanceTo(cur) : 0;
    last.copy(cur); has = true;
    if (dt > 0 && d < 3) v += (d / dt - v) * (1 - Math.exp(-dt * 3));
    return v;
  };
}

// ---------------------------------------------------------------- A: lumen 鈥?robed, elongated humanoid with a glowing lure
function buildLumen(id: string, cm: CM, kit: GlbKit, phase: number): CreatureVisual {
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const u = motion(phase);
  const root = new T.Group(); root.name = id; root.userData.creatureId = id;
  const body = new T.Group(); root.add(body);
  const r = rng(phase * 1000 | 0);
  // Emaciated torso (lathe): pelvis-less, ribs taper into the curtain at y鈮?15.
  const tp: T.Vector2[] = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, y = .1 + t * .68; const rr = .07 + Math.sin(t * PI * .92) * .12 - (t > .85 ? (t - .85) * .7 : 0); tp.push(new T.Vector2(Math.max(.03, rr), y)); }
  const torso = new T.LatheGeometry(tp, 40);
  {
    // emaciated anatomy carved into the lathe: rib grooves, sternum ridge, sucked-in belly, spine with vertebrae
    const p = torso.getAttribute('position');
    const bell = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (w * w));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ph = Math.atan2(x, z), front = Math.max(0, Math.cos(ph)), side = Math.abs(Math.sin(ph));
      const back = Math.max(0, -Math.cos(ph)), dp = Math.abs(Math.abs(ph) - PI);
      let k = 1;
      if (y > .33 && y < .67) k -= .055 * (.5 - .5 * Math.cos((y - .62) / .07 * PI * 2)) * Math.max(front, side * .8);
      k -= .26 * front * bell(y, .22, .09);
      k += .07 * bell(ph, 0, .16) * (y > .42 && y < .74 ? 1 : 0);
      k -= .12 * bell(dp, 0, .18) * smooth(.12, .3, y);
      k += .05 * bell(dp, 0, .07) * Math.max(0, Math.sin(y / .036 * PI * 2)) * smooth(.12, .3, y);
      k -= .07 * side * front * bell(y, .7, .03);
      k -= .05 * back * side * bell(y, .58, .08);
      p.setXYZ(i, x * k, y, z * k);
    }
    torso.computeVertexNormals();
    torso.scale(1, 1, .7);
    roughen(torso, .014, 9, phase);
  }
  const skin: T.BufferGeometry[] = [torso];
  skin.push(at(new T.SphereGeometry(1, 16, 12), [0, .74, 0], [0, 0, 0], [.2, .06, .1]));      // shoulder girdle
  skin.push(rodGeo([0, .76, -.01], [0, .92, -.03], .04, .034, 10));                            // long neck
  for (const s of [-1, 1]) {
    // ribs showing through
    for (let k = 0; k < 5; k++) skin.push(at(new T.TorusGeometry(.13 - k * .008, .006, 4, 16, PI * .8), [0, .62 - k * .07, .01], [PI / 2, 0, s > 0 ? -.2 : PI + .2], [1, .7, 1]));
    // long arms reaching slightly forward, with long fingers
    skin.push(roughen(rodGeo([s * .19, .72, 0], [s * .27, .36, .1], .036, .026, 12, 5), .007, 18, phase + s));
    skin.push(roughen(rodGeo([s * .27, .36, .1], [s * .25, .02, .26], .03, .02, 12, 5), .006, 18, phase + s * 2));
    skin.push(roughen(at(new T.SphereGeometry(1, 12, 10), [s * .27, .36, .1], [0, 0, 0], [.042, .05, .04]), .005, 20, phase + 3));   // elbow
    skin.push(roughen(at(new T.SphereGeometry(1, 10, 8), [s * .25, .02, .26], [0, 0, 0], [.03, .028, .026]), .003, 25, phase + 4));    // wrist knob
    skin.push(roughen(at(new T.SphereGeometry(1, 12, 10), [s * .25, -.02, .28], [.5, 0, 0], [.03, .055, .016]), .003, 30, phase + 5));
    for (let f = 0; f < 4; f++) {
      const k0: V = [s * (.235 + f * .012), -.05, .29], k1: V = [s * (.228 + f * .017), -.12 - f * .005, .315], k2: V = [s * (.22 + f * .022), -.2 - f * .01, .34 + f * .005];
      skin.push(rodGeo(k0, k1, .008, .006, 6), rodGeo(k1, k2, .006, .003, 6), at(new T.SphereGeometry(.0085, 6, 5), k1));
    }
  }
  body.add(mesh(merge(skin), cm.skinLumen, u, 'lumen', owned, cm));
  // Body curtain: pleated bell from the ribs to a wide, frilled hem (uv.y 0 top 鈫?1 hem), open bottom.
  {
    const NY = 40, NA = 48, pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NY; i++) {
      const t = i / NY, y = .3 - t * 1.85;
      const base = .1 + Math.pow(t, 1.4) * .62;
      for (let j = 0; j <= NA; j++) {
        const a = j / NA * PI * 2, pleat = 1 + Math.sin(a * 10) * .07 * t + Math.sin(a * 3 + 1) * .05 * t;
        const rr = base * pleat * (a > PI * .35 && a < PI * .65 ? 1 : 1);
        pos.push(Math.sin(a) * rr, y + Math.sin(a * 7) * .04 * t * t, Math.cos(a) * rr * .85); uv.push(j / NA, 1 - t);
        if (i < NY && j < NA) { const k = i * (NA + 1) + j; idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2); }
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const cur = mesh(g, cm.curtain, u, 'lumen', owned, cm); cur.renderOrder = 4; cur.castShadow = false; body.add(cur);
  }
  // Soft lower-limb tissue (what the legs became) inside the curtain + trailing tendrils past the hem.
  const ten: T.BufferGeometry[] = [], dots: T.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * PI * 2 + r() * .3, d0 = .04 + r() * .05, len = 1.2 + r() * 1.1;
    const p0 = new T.Vector3(Math.sin(a) * d0, .05, Math.cos(a) * d0);
    const pts = [p0, p0.clone().add(new T.Vector3(Math.sin(a) * .08, -len * .35, Math.cos(a) * .08)), p0.clone().add(new T.Vector3(Math.sin(a) * (.15 + r() * .2), -len * .7, Math.cos(a) * (.15 + r() * .2))), p0.clone().add(new T.Vector3(Math.sin(a) * (.2 + r() * .3), -len, Math.cos(a) * (.2 + r() * .3)))];
    const c = new T.CatmullRomCurve3(pts);
    ten.push(taperedTube(c, 24, .022 + r() * .012, .002, 6, true));
    for (let k = 1; k < 7; k++) dots.push(at(new T.SphereGeometry(.009, 6, 4), c.getPointAt(k / 7).toArray() as V));
  }
  body.add(mesh(merge(ten), cm.tendril, u, 'lumen', owned, cm));
  // Photophores: collarbones, forearms, a line down the sternum.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) dots.push(at(new T.SphereGeometry(.009, 6, 4), [s * (.04 + i * .033), .755 - i * .006, .08]));
    for (let i = 0; i < 6; i++) { const t = i / 6; dots.push(at(new T.SphereGeometry(.008, 6, 4), [s * (.27 - t * .02 + .02), .34 - t * .3, .12 + t * .14])); }
  }
  for (let i = 0; i < 8; i++) dots.push(at(new T.SphereGeometry(.01, 6, 4), [Math.sin(i * 1.7) * .02, .7 - i * .07, .11]));
  body.add(mesh(merge(dots), cm.photophore, u, 'lumen', owned, cm));
  // Head (turns toward the light): long, smooth, featureless egg with sealed eye slits; lure rises from the crown.
  const head = new T.Group(); head.position.set(0, .94, -.03); body.add(head);
  const hg: T.BufferGeometry[] = [roughen(at(new T.SphereGeometry(1, 32, 24), [0, .1, .01], [-.15, 0, 0], [.085, .14, .1]), .006, 16, phase + 7)];
  hg.push(roughen(at(new T.SphereGeometry(1, 16, 12), [0, .02, .07], [0, 0, 0], [.055, .05, .045]), .004, 22, phase + 8));   // jaw mass
  for (const s of [-1, 1]) hg.push(at(new T.SphereGeometry(1, 12, 8), [s * .045, .145, .075], [0, 0, s * .3], [.035, .012, .02]));   // brow over the sealed slits
  const headMesh = mesh(merge(hg), cm.skinLumen, u, 'lumen', owned, cm); head.add(headMesh);
  const eyes = mesh(merge([at(new T.SphereGeometry(1, 8, 6), [-.034, .12, .095], [0, 0, 0], [.02, .004, .008]), at(new T.SphereGeometry(1, 8, 6), [.034, .12, .095], [0, 0, 0], [.02, .004, .008])]), cm.photophore, u, 'lumen', owned, cm);
  head.add(eyes);
  const lureG = new T.Group(); lureG.position.set(0, .22, -.01); head.add(lureG);
  const lc = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, .2, .06), new T.Vector3(0, .25, .3), new T.Vector3(0, .1, .46), new T.Vector3(0, -.06, .5)]);
  lureG.add(mesh(taperedTube(lc, 30, .012, .004, 6, true), cm.tendril, u, 'lumen', owned, cm));
  const bulb = mesh(merge([at(new T.SphereGeometry(1, 14, 10), [0, -.1, .5], [0, 0, 0], [.03, .04, .03])]), cm.lure, u, 'lumen', owned, cm); lureG.add(bulb);
  const halo = new T.Mesh(new T.SphereGeometry(.07, 12, 8), new T.MeshBasicMaterial({color: '#7fe8ff', transparent: true, opacity: .18, blending: T.AdditiveBlending, depthWrite: false}));
  halo.position.set(0, -.1, .5); owned.push(halo.geometry, halo.material as T.Material); lureG.add(halo);
  // Sculpted body: the head turn is layered onto the 'head' bone after the clip, the halo rides the lure tip bone.
  let headBone: T.Object3D | null = null;
  const glbHalo = new T.Mesh(halo.geometry, halo.material);
  const glb = new GlbActor(kit, 'lumen', root, body, phase, a => {
    headBone = a.bone('head');
    const tip = a.bone('lure3'), bulb = a.scene!.getObjectByName('lure') as T.Mesh | undefined;
    if (!tip) return;
    a.scene!.updateMatrixWorld(true);
    const c = new T.Vector3(0, 1.065, .48);
    if (bulb) { bulb.geometry.computeBoundingSphere(); c.copy(bulb.geometry.boundingSphere!.center); bulb.localToWorld(c); a.scene!.worldToLocal(c); }
    tip.add(glbHalo); glbHalo.position.copy(tip.worldToLocal(a.scene!.localToWorld(c)));
  });
  const speed = speedometer();
  root.visible = false;
  const tmp = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), look = new T.Quaternion(), qr = new T.Quaternion(), qp = new T.Quaternion(), qb = new T.Quaternion();
  const HEAD_PIVOT = new T.Vector3(0, .97, -.03);
  return {
    id, type: 'lumen', root,
    update(s, time, dt, recording, focus, lampOn) {
      root.visible = !!s && recording;
      if (!s || !root.visible) return;
      root.position.set(...s.position); root.rotation.y = faceYaw(s.heading);
      const cling = s.mode === 'cling' || s.mode === 'approach';
      const v = speed(s.position, dt);
      u.uTime.value = time; u.uSpeed.value = cling ? 1.6 : 1; u.uAmp.value = cling ? 1.3 : 1;
      root.updateMatrixWorld();
      tmp.copy(focus); root.worldToLocal(tmp); tmp.sub(glb.ready ? HEAD_PIVOT : head.position);
      const yaw = lampOn ? T.MathUtils.clamp(Math.atan2(tmp.x, tmp.z), -1.2, 1.2) : Math.sin(time * .3 + phase) * .2;
      const pitch = lampOn ? T.MathUtils.clamp(-Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -.7, .6) : .15;
      q.setFromEuler(e.set(pitch, yaw, 0, 'YXZ'));
      const k = 1 - Math.exp(-dt * 2.5);
      (halo.material as T.MeshBasicMaterial).opacity = .14 + Math.sin(time * 2.3 + phase) * .05;
      if (glb.ready) {
        glb.play(cling ? 'reach' : s.mode === 'seek' || v > .35 ? 'swim' : 'drift', cling ? 1.2 : s.mode === 'seek' ? 1 + v * .3 : 1);
        glb.update(dt);
        glb.lod(focus.distanceTo(root.position));
        look.slerp(q, k);
        if (headBone?.parent) {
          // world-space turn about the head pivot: rootQ 路 look 路 rootQ鈦宦? re-expressed in the neck's frame
          root.updateMatrixWorld(true);
          root.getWorldQuaternion(qr);
          headBone.getWorldQuaternion(qb);
          headBone.parent.getWorldQuaternion(qp);
          const turn = qr.clone().multiply(look).multiply(qr.invert());
          headBone.quaternion.copy(qp.invert().multiply(turn.multiply(qb)));
        }
        return;
      }
      head.quaternion.slerp(q, k);
      lureG.rotation.x = Math.sin(time * 1.1 + phase) * .08; lureG.rotation.z = Math.sin(time * .7 + phase) * .06;
    },
    dispose() { glb.dispose(); owned.forEach(o => o.dispose()); },
  };
}

// ---------------------------------------------------------------- B: shade 鈥?thick translucent-finned eel, 5 m, gill slits, tubular eyes
function buildShade(id: string, cm: CM, kit: GlbKit, phase: number): CreatureVisual {
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const L = 5, u = motion(phase, L);
  const root = new T.Group(); root.name = id; root.userData.creatureId = id;
  const body = new T.Group(); body.rotation.y = PI; root.add(body);
  const prof = (s: number) => (s < .07 ? .1 + Math.sqrt(s / .07) * .1 : .2 - (s < .1 ? (s - .07) * .6 : .018) + Math.sin(Math.min(1, s / .3) * PI / 2) * .04 - Math.pow(Math.max(0, s - .3) / .7, 1.3) * .21);
  const R = (s: number) => Math.max(.012, prof(s));
  const skinG = roughen(bodyTube(L, R, .7, s => 1.25 + Math.max(0, .25 - s) * .3, 32, 140), .012, 5, phase + 11);
  // flattened, pointed snout with an underbite
  const head = at(new T.SphereGeometry(1, 20, 14), [0, -.02, -L * .49], [.12, 0, 0], [.1, .1, .2]);
  body.add(mesh(merge([skinG, head]), cm.shadeSkin, u, 'eel', owned, cm));
  // dorsal + anal fin ribbons (continuous, frilled), pectorals behind the gills
  const top = (s: number) => R(s) * 1.18 * .92, bot = (s: number) => -R(s) * 1.04 * .92;
  const fins = [
    finStrip(L, .2, .995, 90, top, s => (.1 + Math.sin((s - .2) / .8 * PI) * .1) * (1 + Math.sin(s * 80) * .05)),
    finStrip(L, .5, .995, 60, bot, s => -(.06 + Math.sin((s - .5) / .5 * PI) * .08)),
  ];
  for (const sd of [-1, 1]) { const p = new T.PlaneGeometry(.32, .2, 4, 2); p.translate(.16, 0, 0); fins.push(at(p, [sd * .14, -.06, -L * .36], [-.35, sd > 0 ? -.5 : PI + .5, sd * .5])); }
  const finMesh = mesh(merge(fins), cm.fin, u, 'eel', owned, cm); finMesh.castShadow = false; finMesh.renderOrder = 4; body.add(finMesh);
  // five gill slits each side
  const gills: T.BufferGeometry[] = [];
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) {
    const s = .085 + i * .018, z = (s - .5) * L, rr = R(s);
    gills.push(at(new T.TorusGeometry(.065, .006, 4, 12, PI * .7), [sd * rr * .68, -.02, z], [0, PI / 2, PI * .65], [1, 1.2, 1]));
  }
  body.add(mesh(merge(gills), cm.gill, u, 'eel', owned, cm));
  // tubular eyes pointing up/forward, glowing tapetum
  const eyes: T.BufferGeometry[] = [], lens: T.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    eyes.push(rodGeo([s * .06, .12, -L * .46], [s * .075, .26, -L * .472], .032, .036, 12));
    lens.push(at(new T.SphereGeometry(.036, 12, 8), [s * .075, .265, -L * .472], [0, 0, 0], [1, .5, 1]));
  }
  body.add(mesh(merge(eyes), cm.shadeSkin, u, 'eel', owned, cm));
  body.add(mesh(merge(lens), cm.eyeLens, u, 'eel', owned, cm));
  // mouth line
  body.add(mesh(merge([at(new T.TorusGeometry(.095, .006, 4, 18, PI), [0, -.06, -L * .47], [PI / 2, 0, 0], [1, 1.6, 1])]), cm.gill, u, 'eel', owned, cm));
  // sculpted body is authored head at 鈭抸 like `body` before its half turn
  const glbFrame = new T.Group(); glbFrame.rotation.y = PI; root.add(glbFrame);
  const glb = new GlbActor(kit, 'shade', glbFrame, body, phase);
  const speed = speedometer();
  root.visible = false;
  let curl = 0;
  return {
    id, type: 'shade', root,
    update(s, time, dt, recording, focus, lampOn) {
      root.visible = !!s && recording;
      if (!s || !root.visible) return;
      root.position.set(...s.position); root.rotation.y = faceYaw(s.heading);
      const target = s.mode === 'recoil' || s.mode === 'curl' ? 1 : 0;
      const v = speed(s.position, dt);
      if (glb.ready) {
        // Visual-only hover above the sim point: off the deck, banked and nose-up, slow bob. The sim root (photo
        // target, collision semantics) is not moved.
        // (the rig's body hangs ~1.5 m under its root, so at the sim height it lay on the deck)
        glbFrame.position.y = SHADE_LIFT + Math.sin(time * .55 + phase) * .14;
        glbFrame.rotation.set(-.05 + Math.sin(time * .41 + phase) * .03, PI, .14 + Math.sin(time * .29 + phase * 1.3) * .08);
        // idle in a doorway: slow hover; a pod nosing in close in the dark gets a gape (threat display, no bite)
        const near = !lampOn && s.mode === 'idle' && focus.distanceTo(root.position) < 4.5;
        glb.play(target ? 'curl' : near ? 'attack' : v > .25 || s.mode === 'return' ? 'swim' : 'idle', target ? 1 : v > .25 ? .6 + v * .5 : 1);
        glb.update(dt);
        glb.lod(focus.distanceTo(root.position));
        return;
      }
      curl += (target - curl) * (1 - Math.exp(-dt * 2.2));
      u.uTime.value = time; u.uCurl.value = curl; u.uSpeed.value = s.mode === 'block' ? .45 : .8; u.uAmp.value = 1 - curl * .7;
    },
    dispose() { glb.dispose(); owned.forEach(o => o.dispose()); },
  };
}

// ---------------------------------------------------------------- C: blind hunter 鈥?eyeless, huge underslung jaw, lateral-line pores (3 m)
function buildBlind(id: string, cm: CM, kit: GlbKit, phase: number): CreatureVisual {
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const L = 3, u = motion(phase, L);
  const root = new T.Group(); root.name = id; root.userData.creatureId = id;
  const body = new T.Group(); body.rotation.y = PI; root.add(body);
  const prof = (s: number) => s < .22 ? .2 + Math.sqrt(s / .22) * .14 : .34 - Math.pow((s - .22) / .78, 1.2) * .31;
  const R = (s: number) => Math.max(.025, prof(s));
  const zH = -L * .5;
  const parts: T.BufferGeometry[] = [bodyTube(L, R, .9, 1.05, 26, 80)];
  // massive blunt skull (no eyes) with a brow shelf and skin folds where eyes would be
  parts.push(at(new T.SphereGeometry(1, 28, 20), [0, .06, zH + .3], [0, 0, 0], [.3, .22, .36]));
  parts.push(at(new T.SphereGeometry(1, 20, 12), [0, .17, zH + .3], [.1, 0, 0], [.27, .07, .3]));
  for (const sd of [-1, 1]) parts.push(at(new T.TorusGeometry(.05, .012, 6, 14), [sd * .26, .1, zH + .27], [0, PI / 2, 0], [1, .6, 1]));
  // pectoral fins, dorsal crest, caudal fin
  const flap = (sd: number) => { const g = new T.PlaneGeometry(.55, .3, 5, 2); g.translate(.27, 0, 0); return at(g, [sd * .3, -.12, -L * .2], [-.45, sd > 0 ? -.35 : PI + .35, sd * .45]); };
  parts.push(flap(1), flap(-1));
  for (let i = 0; i < 9; i++) { const s = .3 + i * .05, z = (s - .5) * L; parts.push(at(new T.ConeGeometry(.02, .1 - i * .006, 6), [0, R(s) * 1.05 + .03, z], [-.4, 0, 0])); }
  body.add(mesh(merge(parts), cm.blind, u, 'eel', owned, cm));
  const tail = mesh(merge([
    finStrip(L, .82, 1.0, 16, s => R(s) * .9, s => (s - .82) * 1.6 * (1 + Math.sin(s * 70) * .06)),
    finStrip(L, .86, 1.0, 14, s => -R(s) * .9, s => -(s - .86) * 1.5 * (1 + Math.sin(s * 64) * .06)),
  ]), cm.fin, u, 'eel', owned, cm);
  tail.castShadow = false; tail.renderOrder = 4; body.add(tail);
  // jaw: wide upper lip, deep underslung lower jaw hanging open, dark gullet
  const jaw: T.BufferGeometry[] = [];
  const lower = new T.SphereGeometry(1, 28, 14, 0, PI * 2, PI / 2, PI / 2);   // bottom hemisphere bowl
  jaw.push(at(lower, [0, -.06, zH + .2], [-.32, 0, 0], [.29, .2, .4]));
  body.add(mesh(merge(jaw), cm.blind, u, 'eel', owned, cm));
  body.add(mesh(merge([at(new T.SphereGeometry(1, 20, 12), [0, -.07, zH + .26], [-.15, 0, 0], [.24, .12, .3])]), cm.mouth, u, 'eel', owned, cm));
  const teeth: T.BufferGeometry[] = [];
  const tr = rng(77);
  for (let i = 0; i < 15; i++) {
    const a = (i / 14 - .5) * 2.4 + (tr() - .5) * .08, x = Math.sin(a) * .27, z = zH + .2 - Math.cos(a) * .36;
    const lu = (.05 + tr() * .07) * (.5 + Math.cos(a) * .6), ll = (.06 + tr() * .1) * (.5 + Math.cos(a) * .7);
    if (tr() > .15) teeth.push(at(new T.ConeGeometry(.011 + tr() * .006, lu, 5), [x, -.03, z], [PI + .25 * Math.cos(a) + (tr() - .5) * .3, 0, Math.sin(a) * .2 + (tr() - .5) * .3]));
    const zl = zH + .2 - Math.cos(a) * .38;
    if (tr() > .1) teeth.push(at(new T.ConeGeometry(.012 + tr() * .007, ll, 5), [x * 1.04, -.13 - Math.cos(a) * .1, zl], [-.5 * Math.cos(a) + (tr() - .5) * .4, 0, -Math.sin(a) * .2 + (tr() - .5) * .3]));
  }
  body.add(mesh(merge(teeth), cm.teeth, u, 'eel', owned, cm));
  // lateral-line pores: a raised row each side + ampullae field on the snout/where eyes would be
  const pores: T.BufferGeometry[] = [];
  for (const sd of [-1, 1]) for (let i = 0; i < 34; i++) {
    const s = .14 + i / 34 * .76, z = (s - .5) * L, rr = R(s);
    pores.push(at(new T.TorusGeometry(.012, .004, 4, 8), [sd * rr * .9, rr * .1, z], [0, PI / 2, 0]));
    pores.push(at(new T.SphereGeometry(.008, 6, 4), [sd * rr * .9, rr * .1, z]));
  }
  for (let i = 0; i < 40; i++) { const a = (i / 40 - .5) * PI * 1.1, k = i % 3; pores.push(at(new T.SphereGeometry(.011, 6, 4), [Math.sin(a) * (.22 + k * .03), .12 + k * .03 + Math.cos(a * 3) * .02, zH + .02 + (1 - Math.cos(a)) * .12 + k * .05])); }
  body.add(mesh(merge(pores), cm.pore, u, 'eel', owned, cm));
  const glbFrame = new T.Group(); glbFrame.rotation.y = PI; root.add(glbFrame);
  const glb = new GlbActor(kit, 'blind', glbFrame, body, phase);
  const speed = speedometer();
  root.visible = false;
  return {
    id, type: 'blind', root,
    update(s, time, dt, recording, focus) {
      root.visible = !!s && recording;
      if (!s || !root.visible) return;
      root.position.set(...s.position); root.rotation.y = faceYaw(s.heading);
      const fast = s.mode === 'hunt' || s.mode === 'charge' || s.mode === 'chase' || s.mode === 'investigate';
      const v = speed(s.position, dt);
      root.rotation.z = Math.sin(time * (fast ? 3 : 1.2) + phase) * (glb.ready ? .03 : .06);
      if (glb.ready) {
        const lunge = (s.mode === 'hunt' || s.mode === 'sniff') && focus.distanceTo(root.position) < 4;
        glb.play(s.mode === 'sleep' ? 'sleep' : lunge ? 'attack' : fast || v > .2 ? 'swim' : 'idle', s.mode === 'sleep' ? 1 : fast ? 1.5 + v * .25 : .7 + v * .5);
        glb.update(dt);
        glb.lod(focus.distanceTo(root.position));
        return;
      }
      u.uTime.value = time; u.uSpeed.value = fast ? 3.2 : 1.6; u.uAmp.value = fast ? 1.25 : .9;
    },
    dispose() { glb.dispose(); owned.forEach(o => o.dispose()); },
  };
}

// ---------------------------------------------------------------- D: swarm 鈥?mixed deep-sea school (+ amphipods)
const SWARM_DRAW = 40;
const NEIGHBOURS = new Set(LIVING_DOORS.filter(d => d.kind === 'open').flatMap(d => [`${d.a}|${d.b}`, `${d.b}|${d.a}`]));
const adjacent = (a: string, b: string) => NEIGHBOURS.has(`${a}|${b}`);
const SPACE_BOX = new Map(LIVING_SPACES.map(s => [s.id, s]));

/** Laterally compressed fish body, head at 鈭抸, tapering into a forked tail; ~100鈥?40 triangles. */
function fishGeometry(sx: number, sy: number, sz: number, o: {keel?: number; tailH: number; dorsal?: number}) {
  const b = new T.SphereGeometry(1, 16, 11); b.scale(sx, sy, sz);
  const pos = b.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i); let y = pos.getY(i);
    if (z > 0) y *= 1 - z / (sz * 1.35);
    if (y < 0 && o.keel) y *= 1 + o.keel * (1 - Math.abs(z) / sz);
    pos.setY(i, y);
  }
  const L = sz * 2, h = (s: number) => .004 + (s - .9) / .35 * o.tailH;
  const parts = [b, finStrip(L, .9, 1.25, 5, () => 0, h), finStrip(L, .9, 1.25, 5, () => 0, s => -h(s))];
  if (o.dorsal) parts.push(finStrip(L, .4, .62, 3, () => sy * .62, s => o.dorsal! * Math.sin((s - .4) / .22 * PI)));
  const out = merge(parts); out.computeVertexNormals(); return out;
}

/**
 * Fish skin: sooty dorsal stripe, silvered flanks and belly as rough metal broken into scale cells whose normals
 * are tilted per cell, so only some cells catch a light at a time. No emissive and almost no environment
 * reflection: off-lamp the school is a dark shape against the water; under the lamp the flanks glitter.
 * Beyond uFade.x m the school loses saturation and contrast and thins out to uFade.y m.
 */
function fishMaterial(uT: {value: number}, glass: boolean, len: number) {
  const m = new T.MeshPhysicalMaterial({
    color: glass ? '#101416' : '#181d20', roughness: glass ? .36 : .5, metalness: glass ? .25 : .45, side: T.DoubleSide,
    // hashed alpha: no back-to-front sort across 90 instances (sorted transparency streaked the school into bands)
    alphaHash: glass, opacity: glass ? .4 : 1,
  });
  m.specularIntensity = .5;
  m.envMapIntensity = .04;
  const uFade = {value: new T.Vector2(6, 20)}, uLen = {value: len};
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {uT, uFade, uLen});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT; uniform float uLen; varying vec3 vFishPos; varying float vFishRnd;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
vFishPos = position;
#ifdef USE_INSTANCING
float wph = instanceMatrix[3].x * 7. + instanceMatrix[3].z * 5. + instanceMatrix[3].y * 3.;
#else
float wph = 0.;
#endif
vFishRnd = fract(sin(wph * 12.9898) * 43758.5453);
float zt = position.z / uLen;
transformed.x += sin(uT * (11. + vFishRnd * 6.) + wph + zt * 6.) * smoothstep(-.1, .6, zt) * uLen * .14;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec2 uFade; uniform float uLen; varying vec3 vFishPos; varying float vFishRnd;
float fishH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cDorsal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  cDorsal = smoothstep(.15, .5, vFishPos.y / (uLen * .35));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.003, .0035, .0035), cDorsal);
  ${glass ? 'diffuseColor.a = mix(diffuseColor.a, .95, cDorsal);' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, .7, cDorsal);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor *= 1. - cDorsal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 cell = floor(vFishPos / (uLen * vec3(1., .16, .2))) + vFishRnd * 17.;
    vec3 tilt = vec3(fishH(cell), fishH(cell + 3.1), fishH(cell + 7.7)) - .5;
    normal = normalize(normal + tilt * .22 * (1. - cDorsal)); }`)
      .replace('#include <opaque_fragment>', `if (fishH(floor(gl_FragCoord.xyx)) > smoothstep(.3, .7, length(vViewPosition))) discard;
{ // coaxial lamp flat-lights a compressed flank face-on (paper card): darken face-on, keep the rolled-off edges
  outgoingLight *= mix(1., .45, smoothstep(.55, .95, abs(dot(normalize(vViewPosition), normal))));
  // a fish 1–2 m from the lens sits in the lamp's 1/d² hot zone (×10 the wall behind): clamp its near-field gain
  outgoingLight *= clamp(pow(length(vViewPosition) / 3.5, 1.6), .08, 1.);
  float fd = smoothstep(uFade.x, uFade.y, length(vViewPosition));
  float lum = dot(outgoingLight, vec3(.299, .587, .114));
  outgoingLight = mix(outgoingLight, vec3(lum), fd * .85) * (1. - fd * .7);
  diffuseColor.a *= 1. - fd * .6; }
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `living-fish-${glass ? 'glass' : 'scale'}-v6`;
  return m;
}

function buildSwarm(id: string, home: Vec3, phase: number): CreatureVisual {
  const owned: (T.Material | T.BufferGeometry)[] = [];
  const root = new T.Group(); root.name = id; root.userData.creatureId = id;
  const uT = {value: 0};
  // three body plans: deep glass fish (9 cm), hatchetfish (6 cm, tall keel), slender bristlemouth (13 cm)
  const kinds = [
    {name: 'glass', n: 90, geo: fishGeometry(.009, .022, .045, {tailH: .03, dorsal: .012}), glass: true, len: .045, scale: [.6, 1.4]},
    {name: 'hatchet', n: 55, geo: fishGeometry(.006, .02, .028, {keel: 1.1, tailH: .02, dorsal: .006}), glass: false, len: .028, scale: [.7, 1.3]},
    {name: 'slender', n: 45, geo: fishGeometry(.0055, .009, .062, {tailH: .028}), glass: false, len: .062, scale: [.6, 1.4]},
  ];
  const innerGeo = (() => {
    const spine = new T.CylinderGeometry(.0012, .0008, .07, 3, 1, true); spine.rotateX(PI / 2); spine.translate(0, .002, .008);
    const gut = new T.SphereGeometry(1, 5, 4); gut.scale(.005, .008, .012); gut.translate(0, -.006, -.012);
    const eyes = new T.BoxGeometry(.016, .005, .005); eyes.translate(0, .004, -.035);
    return merge([spine, gut, eyes]);
  })();
  const ampGeo = (() => {
    const parts: T.BufferGeometry[] = [at(new T.SphereGeometry(1, 6, 4), [0, 0, 0], [0, 0, 0], [.008, .011, .022])];
    for (let i = 0; i < 6; i++) parts.push(rodGeo([0, -.006, -.015 + i * .006], [(i % 2 ? 1 : -1) * .014, -.016, -.015 + i * .006], .0015, .001, 3));
    return merge(parts);
  })();
  const innerMat = new T.MeshStandardMaterial({color: '#141819', roughness: .5, metalness: .3});
  const ampMat = new T.MeshStandardMaterial({color: '#16110d', roughness: .55});
  // same lamp near-field clamp as the fish skin (fishMaterial)
  const NEAR_CLAMP = ['#include <opaque_fragment>', 'outgoingLight *= clamp(pow(length(vViewPosition) / 3.5, 1.6), .08, 1.);\n#include <opaque_fragment>'] as const;
  ampMat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace(...NEAR_CLAMP); };
  ampMat.customProgramCacheKey = () => 'living-amphipod-v1';
  owned.push(innerGeo, ampGeo, innerMat, ampMat);
  const bounds = new T.Sphere();
  const meshes = kinds.map(k => {
    const mat = fishMaterial(uT, k.glass, k.len); owned.push(k.geo, mat);
    const im = new T.InstancedMesh(k.geo, mat, k.n); im.boundingSphere = bounds; im.renderOrder = k.glass ? 5 : 0; im.name = `${id}:${k.name}`;
    root.add(im); return im;
  });
  const inner = new T.InstancedMesh(innerGeo, innerMat, kinds[0].n), amp = new T.InstancedMesh(ampGeo, ampMat, 50);
  for (const im of [inner, amp]) { im.boundingSphere = bounds; root.add(im); }
  {
    // the organs ride the glass-fish wag
    innerMat.onBeforeCompile = shader => {
      shader.uniforms.uT = uT;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
float wph = instanceMatrix[3].x * 7. + instanceMatrix[3].z * 5. + instanceMatrix[3].y * 3.;
float rnd = fract(sin(wph * 12.9898) * 43758.5453);
float zt = position.z / .045;
transformed.x += sin(uT * (11. + rnd * 6.) + wph + zt * 6.) * smoothstep(-.1, .6, zt) * .0063;`);
      shader.fragmentShader = shader.fragmentShader.replace(...NEAR_CLAMP);
    };
    innerMat.customProgramCacheKey = () => 'living-fish-inner-v4';
  }

  // ---- simulation state: boids around SUB sub-school centres that slide along the room walls
  const r = rng((phase * 977) | 0);
  const N = kinds.reduce((a, k) => a + k.n, 0), SUB = 4;
  const P = new Float32Array(N * 3), Vel = new Float32Array(N * 3), off = new Float32Array(N * 3);
  const kindOf = new Uint8Array(N), slot = new Uint16Array(N), grp = new Uint8Array(N), scl = new Float32Array(N), pace = new Float32Array(N);
  {
    let i = 0;
    kinds.forEach((k, ki) => { for (let j = 0; j < k.n; j++, i++) {
      kindOf[i] = ki; slot[i] = j;
      // species keep loosely together: each kind favours two of the four sub-schools
      grp[i] = (ki + (r() < .65 ? 0 : 1 + Math.floor(r() * 3))) % SUB;
      scl[i] = k.scale[0] + r() * (k.scale[1] - k.scale[0]); pace[i] = .8 + r() * .4;
      const o = new T.Vector3(r() - .5, (r() - .5) * .5, r() - .5).normalize().multiplyScalar(Math.cbrt(r()));
      off[i * 3] = o.x; off[i * 3 + 1] = o.y; off[i * 3 + 2] = o.z;
    } });
  }
  const sub = Array.from({length: SUB}, (_, g) => ({c: new T.Vector3(), ph: r() * PI * 2, w: (.18 + r() * .2) * (g % 2 ? 1 : -1), rad: 1 + r() * 1.4, breathe: r() * PI * 2}));
  const centre = new T.Vector3(...home), want = new T.Vector3(...home);
  let placed = false, space: string | null = null, eyeSpace: string | null = null;
  const tgt = new T.Vector3(), tmp = new T.Vector3(), des = new T.Vector3(), ali = new T.Vector3(), sep = new T.Vector3(), cur = new T.Vector3();
  const box = {x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0};
  const setBox = () => {
    const s = space ? SPACE_BOX.get(space) : undefined;
    if (s) Object.assign(box, {x0: s.minX + .35, x1: s.maxX - .35, y0: s.floorY + .25, y1: Math.min(s.ceilY - .25, centre.y + 2.5), z0: s.minZ + .35, z1: s.maxZ - .35});
    else Object.assign(box, {x0: centre.x - 4, x1: centre.x + 4, y0: centre.y - 1.5, y1: centre.y + 1.5, z0: centre.z - 4, z1: centre.z + 4});
  };
  const clampBox = (v: T.Vector3) => v.set(T.MathUtils.clamp(v.x, box.x0, box.x1), T.MathUtils.clamp(v.y, box.y0, box.y1), T.MathUtils.clamp(v.z, box.z0, box.z1));
  const scatter = () => {
    setBox();
    for (const s of sub) s.c.copy(centre);
    for (let i = 0; i < N; i++) {
      tmp.set(off[i * 3], off[i * 3 + 1], off[i * 3 + 2]).multiplyScalar(1.6).add(centre); clampBox(tmp);
      P[i * 3] = tmp.x; P[i * 3 + 1] = tmp.y; P[i * 3 + 2] = tmp.z;
      Vel[i * 3] = (r() - .5) * .4; Vel[i * 3 + 1] = 0; Vel[i * 3 + 2] = (r() - .5) * .4;
    }
  };
  // spatial hash for neighbour queries (cell 0.3 m)
  const CELL = .3, grid = new Map<number, number[]>();
  const key = (x: number, y: number, z: number) => ((Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791)) | 0;
  const step = (t: number, dt: number, swarming: boolean) => {
    // sub-school targets: orbit the sim position; when idle each is pulled onto the nearest wall and slides along it
    for (let g = 0; g < SUB; g++) {
      const s = sub[g], a = s.ph + t * s.w, R = swarming ? .5 : s.rad;
      tgt.set(centre.x + Math.cos(a) * R * 1.6, centre.y + Math.sin(a * 1.7) * .35, centre.z + Math.sin(a) * R * 1.6);
      if (!swarming) {
        const d = [tgt.x - box.x0, box.x1 - tgt.x, tgt.z - box.z0, box.z1 - tgt.z], k = d.indexOf(Math.min(...d));
        const gap = .45 + .25 * Math.sin(a * 2.3);
        if (d[k] < 3.5) { if (k === 0) tgt.x = box.x0 + gap; else if (k === 1) tgt.x = box.x1 - gap; else if (k === 2) tgt.z = box.z0 + gap; else tgt.z = box.z1 - gap; }
        tgt.y = T.MathUtils.lerp(tgt.y, box.y0 + .4 + (g % 2) * .9, .5);
      }
      clampBox(tgt);
      s.c.lerp(tgt, 1 - Math.exp(-dt * (swarming ? 2.2 : .7)));
    }
    grid.clear();
    for (let i = 0; i < N; i++) { const k = key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i); }
    const vmax = swarming ? 1.9 : 1.1, cruise = swarming ? 1.3 : .55;
    for (let i = 0; i < N; i++) {
      const g = grp[i], s = sub[g], i3 = i * 3;
      const breathe = swarming ? .3 : .35 + .5 * (.5 + .5 * Math.sin(t * .35 + s.breathe));   // tight 鈫?loose
      cur.set(P[i3], P[i3 + 1], P[i3 + 2]);
      tgt.set(off[i3], off[i3 + 1], off[i3 + 2]).multiplyScalar(breathe * (1 + scl[i] * .2)).add(s.c);
      des.subVectors(tgt, cur); const dist = des.length();
      des.multiplyScalar(cruise * pace[i] * Math.min(1.6, .35 + dist) / (dist + 1e-4));
      // flow field: smooth swirl so the school streams instead of orbiting a point
      des.x += Math.sin(cur.z * 1.3 + t * .45 + g) * .22; des.z += Math.cos(cur.x * 1.1 - t * .4 + g * 2) * .22; des.y += Math.sin(cur.x * .9 + cur.z * .7 + t * .3) * .05;
      ali.set(0, 0, 0); sep.set(0, 0, 0); let nb = 0;
      const cx = Math.floor(cur.x / CELL), cy = Math.floor(cur.y / CELL), cz = Math.floor(cur.z / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const c = grid.get(((cx + dx) * 73856093 ^ (cy + dy) * 19349663 ^ (cz + dz) * 83492791) | 0); if (!c) continue;
        for (const j of c) {
          if (j === i) continue;
          const ex = cur.x - P[j * 3], ey = cur.y - P[j * 3 + 1], ez = cur.z - P[j * 3 + 2], d2 = ex * ex + ey * ey + ez * ez;
          if (d2 > CELL * CELL) continue;
          ali.x += Vel[j * 3]; ali.y += Vel[j * 3 + 1]; ali.z += Vel[j * 3 + 2]; nb++;
          const near = .11 * scl[i];
          if (d2 < near * near) { const k = (near - Math.sqrt(d2)) / near / (Math.sqrt(d2) + 1e-3); sep.x += ex * k; sep.y += ey * k; sep.z += ez * k; }
        }
      }
      if (nb) des.addScaledVector(ali.multiplyScalar(1 / nb).sub(tmp.set(Vel[i3], Vel[i3 + 1], Vel[i3 + 2])), .45);
      des.addScaledVector(sep, .5);
      // walls: steer off, keep the along-wall component
      const wx = cur.x - box.x0 < .3 ? 1 : box.x1 - cur.x < .3 ? -1 : 0, wz = cur.z - box.z0 < .3 ? 1 : box.z1 - cur.z < .3 ? -1 : 0, wy = cur.y - box.y0 < .2 ? 1 : box.y1 - cur.y < .2 ? -1 : 0;
      des.x += wx * .8; des.z += wz * .8; des.y += wy * .5;
      const k = 1 - Math.exp(-dt * (swarming ? 3.5 : 2.2));
      let vx = Vel[i3] + (des.x - Vel[i3]) * k, vy = Vel[i3 + 1] + (des.y - Vel[i3 + 1]) * k * .6, vz = Vel[i3 + 2] + (des.z - Vel[i3 + 2]) * k;
      const sp = Math.hypot(vx, vy, vz), lim = vmax * pace[i];
      if (sp > lim) { vx *= lim / sp; vy *= lim / sp; vz *= lim / sp; }
      Vel[i3] = vx; Vel[i3 + 1] = vy; Vel[i3 + 2] = vz;
      cur.set(P[i3] + vx * dt, P[i3 + 1] + vy * dt, P[i3 + 2] + vz * dt); clampBox(cur);
      P[i3] = cur.x; P[i3 + 1] = cur.y; P[i3 + 2] = cur.z;
    }
  };
  const mtx = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(), fwd = new T.Vector3(), zAxis = new T.Vector3(0, 0, 1);
  const lo = new T.Vector3(), hi = new T.Vector3();
  const draw = (withInner: boolean) => {
    lo.set(Infinity, Infinity, Infinity); hi.set(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      cur.set(P[i3], P[i3 + 1], P[i3 + 2]); lo.min(cur); hi.max(cur);
      fwd.set(Vel[i3], Vel[i3 + 1], Vel[i3 + 2]);
      if (fwd.lengthSq() > 1e-8) q.setFromUnitVectors(zAxis, fwd.normalize().negate());
      mtx.compose(cur, q, one.setScalar(scl[i]));
      meshes[kindOf[i]].setMatrixAt(slot[i], mtx);
      if (withInner && kindOf[i] === 0) inner.setMatrixAt(slot[i], mtx);
    }
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    if (withInner) inner.instanceMatrix.needsUpdate = true;
    bounds.center.addVectors(lo, hi).multiplyScalar(.5); bounds.radius = lo.distanceTo(hi) * .5 + .3;
  };
  // amphipods: tiny darting crustaceans clinging around the sim position (corpses, crates)
  type A = {o: T.Vector3; spd: number; ph: number; rad: number};
  const pa: A[] = Array.from({length: 50}, () => ({o: new T.Vector3(r() - .5, r() - .5, r() - .5).normalize().multiplyScalar(.3 + r() * .7), spd: .4 + r() * .9, ph: r() * PI * 2, rad: .5 + r()}));
  const placeAmp = (t: number, spread: number) => {
    for (let i = 0; i < pa.length; i++) {
      const p = pa[i], a = t * p.spd + p.ph;
      cur.set(p.o.x * spread * p.rad * .8 + Math.sin(a) * spread * .45, p.o.y * spread * .35 * p.rad + Math.sin(a * 1.7 + p.ph) * .08, p.o.z * spread * p.rad * .8 + Math.cos(a) * spread * .45).add(centre);
      q.setFromAxisAngle(zAxis, a * 3);
      mtx.compose(cur, q, one.setScalar(.65 * (.62 + (i % 9) * .055)));
      amp.setMatrixAt(i, mtx);
    }
    amp.instanceMatrix.needsUpdate = true;
  };
  let spread = 2;
  return {
    id, type: 'swarm', root,
    update(s, time, dt, _recording, focus) {
      // Ordinary fauna is visible live, but only where the simulation puts it: no state means no school.
      if (!s) { root.visible = false; placed = false; return; }
      want.set(...s.position);
      const jump = !placed || centre.distanceToSquared(want) > 36;
      if (jump) centre.copy(want);
      space = livingSpaceAt([centre.x, centre.y, centre.z], space);
      eyeSpace = livingSpaceAt([focus.x, focus.y, focus.z], eyeSpace);
      if (jump) { scatter(); placed = true; }
      const d = focus.distanceTo(centre);
      root.visible = d < SWARM_DRAW && (space && eyeSpace ? space === eyeSpace || adjacent(space, eyeSpace) : d < 12);
      if (!root.visible) return;
      uT.value = time;
      const swarming = s.mode === 'swarm';
      centre.lerp(want, 1 - Math.exp(-dt * (swarming ? 2.5 : .8)));
      setBox();
      const h = Math.min(.05, Math.max(0, dt));
      step(time, h, swarming);
      // beyond ~14 m the 4 mm spine/gut/eye pass is sub-pixel; drop it
      inner.visible = d < 14;
      draw(inner.visible);
      spread += ((swarming ? 1.0 : 2.0) - spread) * (1 - Math.exp(-dt * 1.5));
      placeAmp(time * (swarming ? 1.6 : .7) + 10, spread * .65);
    },
    dispose() { owned.forEach(o => o.dispose()); },
  };
}

export interface CreatureSet {
  root: T.Group;
  visuals: Map<string, CreatureVisual>;
  update(list: readonly CreatureVisualState[], time: number, dt: number, recording: boolean, focus: T.Vector3, lampOn: boolean): void;
  dispose(): void;
}

export function createCreatures(): CreatureSet {
  const cm = creatureMaterials(), kit = creatureGlbKit();
  const root = new T.Group(); root.name = 'living-creatures';
  const visuals = new Map<string, CreatureVisual>();
  let seed = 1;
  const make = (id: string, type: CreatureType, home: Vec3) => {
    const ph = (seed++ * .6180339) % 1 * 10;
    const v = type === 'lumen' ? buildLumen(id, cm, kit, ph) : type === 'shade' ? buildShade(id, cm, kit, ph) : type === 'blind' ? buildBlind(id, cm, kit, ph) : buildSwarm(id, home, ph);
    root.add(v.root); visuals.set(id, v); return v;
  };
  for (const c of LIVING_CREATURES) make(c.id, c.type, c.home);
  const seen = new Map<string, CreatureVisualState>();
  return {
    root, visuals,
    update(list, time, dt, recording, focus, lampOn) {
      seen.clear(); CREATURE_TIME.value = time;
      for (const c of list) { seen.set(c.id, c); if (!visuals.has(c.id)) make(c.id, c.type, c.position); }
      for (const [id, v] of visuals) v.update(seen.get(id), time, dt, recording, focus, lampOn);
      // reveal depth: the lamp reaches the nearest body end of the nearest visible instance of each type
      for (const type of ['lumen', 'shade', 'blind'] as const) {
        let near = Infinity;
        for (const v of visuals.values()) if (v.type === type && v.root.visible) near = Math.min(near, focus.distanceTo(v.root.position) - HALF_LEN[type]);
        kit.reveal[type].near.value = Number.isFinite(near) ? Math.max(0, near) : 0;
      }
    },
    dispose() { visuals.forEach(v => v.dispose()); kit.dispose(); cm.all.forEach(x => x.dispose()); cm.textures.forEach(t => t.dispose()); },
  };
}
