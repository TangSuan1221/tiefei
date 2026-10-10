import * as T from 'three';
import {LIVING_SPACES, type Vec3} from '../../content/living-deck-layout';
import {rng} from './living-build';

export interface FogSample {color: T.Color; density: number}

/**
 * The deck has no natural light. The fog colour is the mid-distance medium tint of living-render's layered
 * fog (blue-green 15–40 m, sinking towards black beyond); density is the FogExp2-style per-space value that
 * living-render converts to a single-path surface extinction and the volumetric σ.
 * In-scattering (beams, halos) comes only from lights in the living-render volumetric pass.
 */
const BASE = new T.Color('#06171a');
const SILT = new T.Color('#0a1714');
const SHAFT = new T.Color('#051519');
const ALEX = new T.Color('#051213');
const SLIME = new T.Color('#0a1a13');

/** Slime body (M) bounds; the backflow medium thickens around it. Shared with the volumetric pass. */
export const LIVING_SLIME_BOX = {min: new T.Vector3(160.5, -3.2, -36), max: new T.Vector3(179.5, .8, 8)};

function spaceAt(p: Vec3) {
  let best: (typeof LIVING_SPACES)[number] | undefined;
  for (const s of LIVING_SPACES) {
    if (p[0] < s.minX || p[0] > s.maxX || p[2] < s.minZ || p[2] > s.maxZ || p[1] < s.floorY - .5 || p[1] > s.ceilY + .5) continue;
    if (!best || (s.maxX - s.minX) * (s.maxZ - s.minZ) < (best.maxX - best.minX) * (best.maxZ - best.minZ)) best = s;
  }
  return best;
}

/** Per-space underwater extinction. Slime makes M (and the L/N margins near it) murkier, not coloured. */
export function livingFogAt(p: Vec3, slime: number): FogSample {
  const s = spaceAt(p);
  const out = {color: BASE.clone(), density: .062};
  if (!s) return out;
  if (s.id === 'A') {
    // The 90 × 40 m hall needs ~40 m sight lines to read its balconies and anchor lamps; silt still thickens near the floor.
    const k = T.MathUtils.clamp((3 - p[1]) / 12, 0, 1);
    out.color.lerp(SILT, .35 + k * .4); out.density = .019 + k * .01;
  } else if (s.kind === 'shaft') { out.color.copy(SHAFT); out.density = .055; }
  else if (s.id === 'R1' || s.id === 'R4') { out.color.lerp(SILT, .3); out.density = .068; }
  else if (s.kind === 'alex' || s.kind === 'slime') {
    out.color.copy(ALEX); out.density = .07;
    const dx = s.id === 'M' ? 0 : Math.min(Math.abs(p[0] - 164), Math.abs(p[0] - 176));
    const k = T.MathUtils.clamp(slime, 0, 1) * T.MathUtils.clamp(1 - dx / 6, 0, 1) * T.MathUtils.clamp(1 - Math.max(0, Math.abs(p[2] + 14) - 18) / 14, 0, 1);
    out.color.lerp(SLIME, k); out.density = .07 + k * .085;
  }
  return out;
}

/**
 * Light state shared by the marine snow shader and living-render. living-render writes it every frame;
 * living-world writes uSlime. Values are in three.js physical light units (candela, as on the lights).
 */
export interface LivingOptics {
  uLampPos: {value: T.Vector3}; uLampDir: {value: T.Vector3}; uLampCone: {value: T.Vector2}; uLampColor: {value: T.Color}; uLampPower: {value: number};
  uKeyPos: {value: T.Vector3[]}; uKeyDir: {value: T.Vector3[]}; uKeyCone: {value: T.Vector2[]}; uKeyColor: {value: T.Color[]}; uKeyPower: {value: number[]};
  uPtPos: {value: T.Vector3[]}; uPtColor: {value: T.Color[]}; uPtPower: {value: number[]};
  uSlime: {value: number}; uSlimeMin: {value: T.Vector3}; uSlimeMax: {value: T.Vector3};
  uSigma: {value: number}; uFocalPx: {value: number};
  /** Lamp-lens halo strength (live view crushes practicals, recording does not). */
  uHaloGain: {value: number};
  /** Render-profile practical gain (recording 1.35, live .065): scales accent beams like the fixtures they belong to. */
  uPracticalGain: {value: number};
}

/** Unshadowed point practicals per frame (render rig, snow and volumetric halos share the count). */
export const LIVING_PT_COUNT = 6;

export function createLivingOptics(): LivingOptics {
  const v3 = (n: number) => Array.from({length: n}, () => new T.Vector3());
  const c3 = (n: number) => Array.from({length: n}, () => new T.Color());
  return {
    uLampPos: {value: new T.Vector3()}, uLampDir: {value: new T.Vector3(0, 0, -1)}, uLampCone: {value: new T.Vector2(.75, .93)}, uLampColor: {value: new T.Color('#c4dcd4')}, uLampPower: {value: 0},
    uKeyPos: {value: v3(2)}, uKeyDir: {value: v3(2).map(v => v.set(0, -1, 0))}, uKeyCone: {value: [new T.Vector2(.6, .9), new T.Vector2(.6, .9)]}, uKeyColor: {value: c3(2)}, uKeyPower: {value: [0, 0]},
    uPtPos: {value: v3(LIVING_PT_COUNT)}, uPtColor: {value: c3(LIVING_PT_COUNT)}, uPtPower: {value: new Array(LIVING_PT_COUNT).fill(0)},
    uSlime: {value: 1}, uSlimeMin: {value: LIVING_SLIME_BOX.min.clone()}, uSlimeMax: {value: LIVING_SLIME_BOX.max.clone()},
    uSigma: {value: .06}, uFocalPx: {value: 576}, uHaloGain: {value: 1}, uPracticalGain: {value: 1.35},
  };
}

export type LivingFlicker = 'steady' | 'pulse' | 'flicker' | 'dying';
/**
 * Emergency fixture output 0..1 at time t. pulse = battery beacon breathing; flicker = loose contact
 * (short dropouts, a longer blackout every ~7 s); dying = mostly dark with brief sputters.
 */
export function livingFlicker(mode: LivingFlicker | undefined, seed: number, t: number) {
  const h = (n: number) => { const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453; return x - Math.floor(x); };
  switch (mode) {
    case 'pulse': return .6 + .4 * (.5 + .5 * Math.sin(t * 2.4 + seed * 6.1));
    case 'flicker': {
      const k = Math.floor(t * 13);
      let g = h(k) < .17 ? .1 + .25 * h(k + .5) : .88 + .12 * h(k + .3);
      if ((t + seed * 9.7) % 7.3 < .5) g *= .05;
      return g;
    }
    case 'dying': {
      const burst = (t + seed * 5.3) % 4.1 < .8;
      return burst ? (h(Math.floor(t * 11)) < .55 ? .75 : .12) : .03;
    }
    default: return 1;
  }
}

export interface LivingHaloSource {position: readonly number[]; color: string; intensity: number; flicker?: LivingFlicker; seed?: number; halo?: number}

/**
 * Small additive glow at every fixture lens, attenuated by the medium along the view ray, so lamps
 * 30–60 m away still read as navigation points after FogExp2 has swallowed the geometry around them.
 * Sized ≤ 1 m: it is the lens bloom of a visible fixture, never a free-floating fog ball.
 */
function createHalos(sources: readonly LivingHaloSource[], optics: LivingOptics) {
  const n = sources.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), gain = new Float32Array(n).fill(1);
  const c = new T.Color();
  sources.forEach((s, i) => {
    pos.set([s.position[0], s.position[1], s.position[2]], i * 3);
    c.set(s.color); col.set([c.r, c.g, c.b], i * 3);
    size[i] = s.halo ?? T.MathUtils.clamp(.35 + s.intensity * .025, .4, 1.1);
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
  const gainAttr = new T.BufferAttribute(gain, 1); gainAttr.setUsage(T.DynamicDrawUsage); geo.setAttribute('aGain', gainAttr);
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: T.AdditiveBlending, vertexColors: true,
    uniforms: {uFocalPx: optics.uFocalPx, uSigma: optics.uSigma, uHaloGain: optics.uHaloGain},
    vertexShader: `
      attribute float aSize, aGain; uniform float uFocalPx, uSigma, uHaloGain; varying vec3 vCol;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float z = max(-mv.z, .1);
        gl_PointSize = clamp(aSize * uFocalPx / z, 3., 220.);
        // Medium attenuation is weaker than the surface fog: the lens is far brighter than anything it lights.
        vCol = color * aGain * uHaloGain * exp(-uSigma * z * .42) * smoothstep(.6, 2.5, z);
      }`,
    fragmentShader: `
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - .5; float r2 = dot(d, d) * 4.; if (r2 > 1.) discard;
        float core = exp(-r2 * 60.), glow = exp(-r2 * 6.) * (1. - r2);
        gl_FragColor = vec4(vCol * (core * 3.2 + glow * .6), 1.);
      }`,
  });
  const points = new T.Points(geo, mat); points.name = 'living-lamp-halos'; points.frustumCulled = false; points.renderOrder = 8;
  return {
    points,
    update(t: number) {
      sources.forEach((s, i) => { gain[i] = livingFlicker(s.flicker, s.seed ?? i, t); });
      gainAttr.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/** GLSL: slime-zone weight (0..1) for a world position. Needs uSlime/uSlimeMin/uSlimeMax. */
export const SLIME_ZONE_GLSL = `
  float slimeZone(vec3 p) {
    vec3 q = max(uSlimeMin - p, p - uSlimeMax);
    float outside = length(max(q, 0.));
    return uSlime * (1. - smoothstep(0., 5., outside));
  }`;

export interface Atmosphere {
  root: T.Group;
  optics: LivingOptics;
  update(time: number, camera: T.Vector3): void;
  dispose(): void;
}

/**
 * Camera-wrapped marine snow, lit per particle by the lamp, two key spots and four point practicals.
 * Outside every light the flakes fall to ≈3% (unlit) — they read as suspended matter, not a starfield.
 * Inside the slime zone the density rises ~3× and flakes in a beam fluoresce pale green-cyan.
 * `fixtures` get a lens halo each (see createHalos).
 */
export function createAtmosphere(fixtures: readonly LivingHaloSource[] = []): Atmosphere {
  const owned: {dispose(): void}[] = [];
  const root = new T.Group(); root.name = 'living-atmosphere';
  const optics = createLivingOptics();
  const halos = createHalos(fixtures, optics); root.add(halos.points); owned.push(halos);
  const time = {value: 0}, cam = {value: new T.Vector3()};
  const snow = SNOW_LAYERS.map((L, li) => {
    const r = rng(101 + li * 17);
    const pos = new Float32Array(L.count * 3), seed = new Float32Array(L.count * 4);
    for (let i = 0; i < L.count; i++) { pos.set([r() * L.box, r() * L.box, r() * L.box], i * 3); seed.set([r(), r(), r(), r()], i * 4); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('seed', new T.BufferAttribute(seed, 4));
    const mat = snowMaterial(L, time, cam, optics);
    owned.push(geo, mat);
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 9; pts.name = `living-snow-${L.name}`;
    return pts;
  });
  root.add(...snow);
  return {
    root, optics,
    update(t, camera) { time.value = t; cam.value.copy(camera); halos.update(t); },
    dispose() { owned.forEach(o => o.dispose()); },
  };
}

/**
 * Three marine-snow layers wrapped around the camera. near: few large defocused flakes inside 2.5 m (bokeh
 * discs that sell the lens); mid: the dense fine silt; far: sparse flakes out to ~17 m that only show as
 * glints inside a beam. Beyond the far box the volumetric pass's noise density carries the medium.
 */
const SNOW_LAYERS = [
  // three particle sizes: fine silt (sub-mm haze grain), flakes (1.5–4 mm), aggregates (5–12 mm clumps, defocused near the lens)
  {name: 'aggregate', count: 3200, box: 7, sizeMin: .005, sizeMax: .012, aggregate: 0, coc: 14, keepClear: .4, gain: .5},
  {name: 'silt', count: 90000, box: 12, sizeMin: .0003, sizeMax: .0011, aggregate: 0, coc: 2, keepClear: .3, gain: .75},
  {name: 'flake', count: 26000, box: 16, sizeMin: .0015, sizeMax: .004, aggregate: .03, coc: 6, keepClear: .3, gain: 1},
  {name: 'far', count: 14000, box: 34, sizeMin: .0012, sizeMax: .003, aggregate: .02, coc: 0, keepClear: .25, gain: 1.2},
] as const;

function snowMaterial(L: (typeof SNOW_LAYERS)[number], time: {value: number}, cam: {value: T.Vector3}, optics: LivingOptics) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {uTime: time, uCam: cam, uSize: {value: L.box}, ...optics},
    defines: {SIZE_MIN: L.sizeMin.toFixed(5), SIZE_MAX: L.sizeMax.toFixed(5), AGG: L.aggregate.toFixed(3), COC: L.coc.toFixed(1), KEEP: L.keepClear.toFixed(2), GAIN: L.gain.toFixed(2)},
    vertexShader: `
      attribute vec4 seed;
      uniform float uTime; uniform vec3 uCam; uniform float uSize; uniform float uFocalPx; uniform float uSigma;
      uniform vec3 uLampPos, uLampDir, uLampColor; uniform vec2 uLampCone; uniform float uLampPower;
      uniform vec3 uKeyPos[2], uKeyDir[2], uKeyColor[2]; uniform vec2 uKeyCone[2]; uniform float uKeyPower[2];
      uniform vec3 uPtPos[${LIVING_PT_COUNT}], uPtColor[${LIVING_PT_COUNT}]; uniform float uPtPower[${LIVING_PT_COUNT}];
      uniform float uSlime; uniform vec3 uSlimeMin, uSlimeMax;
      varying vec3 vCol; varying float vA;
      ${SLIME_ZONE_GLSL}
      vec3 spot(vec3 p, vec3 lp, vec3 ld, vec2 cone, vec3 col, float power) {
        vec3 l = p - lp; float d = length(l);
        float c = smoothstep(cone.x, cone.y, dot(l / max(d, 1e-3), ld));
        return col * power * c * pow(max(d, .25), -1.5) * exp(-uSigma * d);
      }
      void main() {
        vec3 drift = vec3(sin(uTime * .05 + seed.x * 6.) * .35, -uTime * (.008 + seed.y * .02), cos(uTime * .04 + seed.z * 6.) * .3);
        vec3 p = mod(position + drift - uCam + uSize * .5, uSize) - uSize * .5 + uCam;
        p.x += sin(uTime * (.3 + seed.w) + seed.y * 20.) * .02;
        float zone = slimeZone(p);
        vec3 E = spot(p, uLampPos, uLampDir, uLampCone, uLampColor, uLampPower);
        // Clear water keeps a share of the flakes; inside the lamp cone (where suspended matter is actually seen)
        // and in the backflow zone all of them stay — the backflow beam is a dense, murky fluorescent column.
        vec3 lq = p - uLampPos; float inBeam = smoothstep(uLampCone.x, uLampCone.y, dot(normalize(lq), uLampDir)) * step(.001, uLampPower);
        float keep = step(seed.w, KEEP + (1. - KEEP) * max(zone, inBeam * .75));
        // Fixtures light the silt at a third: their pools should read as tinted haze, not a field of embers.
        vec3 Ep = vec3(0.);
        for (int i = 0; i < 2; i++) Ep += spot(p, uKeyPos[i], uKeyDir[i], uKeyCone[i], uKeyColor[i], uKeyPower[i]);
        for (int i = 0; i < ${LIVING_PT_COUNT}; i++) { float d = distance(p, uPtPos[i]); Ep += uPtColor[i] * uPtPower[i] / (1. + d * d) * exp(-uSigma * d); }
        E += Ep * .33;
        vec4 mv = viewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        float z = max(-mv.z, .05);
        float big = step(1. - AGG, seed.z);
        float size = mix(SIZE_MIN + seed.x * (SIZE_MAX - SIZE_MIN), .004 + seed.x * .008, big);
        float px = size * uFocalPx / z;
        // Close flakes defocus into soft discs; sub-pixel flakes keep their coverage as alpha.
        float coc = clamp(.9 / z, 0., 1.) * COC;
        float drawn = clamp(max(px, 1.6) + coc * (COC > 10. ? 1. : step(.45, seed.y)), 1.6, 48.);
        gl_PointSize = drawn;
        float coverage = clamp(px * px / (drawn * drawn) * 2.2, 0., 1.);
        float lum = dot(E, vec3(.3, .5, .2));
        // Fluorescence: inside the backflow zone, light re-emits yellow-green instead of the lamp tint; a faint
        // self-glow keeps the murk visible (dimly) outside every beam.
        vec3 fluo = vec3(.62, 1., .3);
        vec3 lit = mix(E, fluo * lum * 1.15, .8 * zone) * .4;
        // Soft cap: a flake next to the lens is a dim defocused disc, never a bloom-hot star.
        float ll = dot(lit, vec3(.3, .5, .2));
        lit *= .7 / (.7 + ll);
        vec3 unlit = vec3(.05, .09, .085) * .02 + fluo * .004 * zone;
        vCol = (lit + unlit) * (1. - .55 * big) * GAIN;
        vA = keep * coverage * exp(-uSigma * z) * smoothstep(.06, .3, z) * (.5 + seed.y * .8) * (1. + 2.6 * zone);
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
        float soft = 1. - r; soft *= soft;
        gl_FragColor = vec4(vCol * soft * vA, 1.);
      }`,
  });
}
