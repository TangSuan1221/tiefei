import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {Pass, FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {createLivingOptics, livingFlicker, LIVING_PT_COUNT, SLIME_ZONE_GLSL, type LivingFlicker, type LivingOptics} from './living-atmosphere';
import {LIVING_LENS, LIVING_STATIC, LIVING_STATIC_MAX} from './living-materials';
import {LIVING_SPACES} from '../../content/living-deck-layout';

/**
 * Level two (-1 deck) render pipeline, shared by /living-preview.html and LivingDeckSite.
 *
 *   RenderPass (MSAA) → GTAO → volumetric single scattering (half res, shadowed lamp + 2 keys, analytic halos
 *   for 6 point practicals) with depth-aware upsample, absorption and exposure → soft bloom → grade
 *   (AgX, 3D LUT, grain, vignette, chromatic aberration) to screen.
 *
 * The rig owns every light the deck needs: headlamp (shadowed), probe lamp (shadowed, replaces the headlamp
 * in probe shots), two shadowed key spots and six unshadowed point practicals picked per frame from
 * world.practicalLights (flicker applied), plus a weak near fill. No ambient / hemisphere light: unlit surfaces stay dark.
 * Key shadow maps re-render when a key changes fixture, and otherwise every third frame.
 */

export type LivingOpticsMode = 'live' | 'recording';
export interface LivingRenderProfile {
  /** Linear exposure applied before bloom and tone mapping. */
  exposure: number;
  lampGain: number; practicalGain: number; envIntensity: number;
  /** Volumetric in-scatter multiplier. */
  scatter: number;
  grain: number; vignette: number; aberration: number; bloom: number;
  /** Lens halo strength for distant fixtures. */
  halo: number;
  /** Multiplier on the surface-fog medium colour (default 1). */
  fogTint?: number;
  /** Emissive multiplier on emergency lamp lenses (default 1). */
  lensGain?: number;
  /** Headlamp falloff exponent (default LIVING_LAMP.decay). */
  lampDecay?: number;
  /** Near-field reflector compensation distance; omitted preserves the established 2.2 m calibration. */
  lampNearFull?: number;
  /**
   * Film metering (0 = off, 1 = full): centre-weighted log-average of the exposed frame, measured on the GPU in the
   * same frame, pulls the exposure towards `meterKey` within `meterRange` (gain limits).
   */
  meter?: number; meterKey?: number; meterRange?: readonly [number, number];
  /** Exposed-HDR luminance where the highlight shoulder starts (lamp lenses, helmet lamps, a lamp on a wall at 0.3 m). */
  whiteKnee?: number;
  /** AgX look (power, saturation) in the encoded domain; default [1.1, 1.2]. */
  look?: readonly [number, number];
  /** Display tonal spread [pivot, gamma below, ease-out power above] (see GRADE_FS); omitted = off. */
  spread?: readonly [number, number, number];
}
/**
 * Live view is the pod's real-time camera: practicals and environment crushed, headlamp compensated
 * (same ratios as level one: lights ×.065, lamp ×6, exposure ×.13). Recording is the film exposure.
 */
export const LIVING_RENDER_PROFILES: Record<LivingOpticsMode, LivingRenderProfile> = {
  // Film: metered (preview art shots, pod film frames and probe footage all pass through the same meter and LUT).
  recording: {exposure: 2.95, lampGain: 1, practicalGain: 1.1, envIntensity: .9, scatter: 1, grain: .03, vignette: .6, aberration: .0022, bloom: .4, halo: 1,
    meter: 1, meterKey: .032, meterRange: [.08, 1.2], whiteKnee: 2.5, look: [1.15, 1.08], spread: [.2, 1.45, 1.9]},
  // Live: emergency lenses stay visible as dim navigation points (the atrium crossing is steered by them).
  // A trace of medium colour (fogTint) keeps silhouettes readable against the water on the crushed live exposure.
  // The live lamp falls off more slowly (pushed sensor, longer throw) so structure 15–30 m down the beam stays
  // legible in the hall; near-field level matches the old ×6 / decay 1.5 at ~4 m. Lenses are pushed ×2.2 so
  // the emergency fixtures read as navigation points on the crushed exposure.
  live: {exposure: 2.8 * .13 * 1.15, lampGain: 6, lampDecay: 1.05, practicalGain: .08, envIntensity: .5 * .035 / .13, scatter: .8, grain: .045, vignette: 0, aberration: .0032, bloom: .3, halo: 4.2, fogTint: 3, lensGain: 2.2},
};
/** Exposed-HDR luminance where bloom starts (soft knee 0.9 above it). */
const BLOOM_THRESHOLD = 1.3;
/** Candela per rated unit for a space mood key (layout fixtures use 6). */
const MOOD_KEY_GAIN = 11;
// Broad reflector covers the window's field of view. Darkness comes from world
// distance/occlusion, not a narrow circular pool projected onto the window.
export const LIVING_LAMP = {color: '#f2e2c4', intensity: 58, distance: 48, angle: 1.15, penumbra: .35, decay: 1.5};

export interface LivingPractical {
  position: readonly number[]; color: string; intensity: number; range: number; space?: string; dir?: readonly number[];
  flicker?: LivingFlicker; seed?: number;
  /** Space mood key: takes shadowed key slot 0 while the camera is in (or looking into) its space. */
  key?: boolean;
  /** Spot cone half-angle / penumbra when used as a shadowed key (default .95 / .7). */
  angle?: number; penumbra?: number;
  /**
   * Accent fixture (up-lights, indicator lamps): never takes a shadowed key or point slot, is lit only through
   * the space-clipped static term (ahead of ordinary fixtures), as a spot of half-angle `angle` when given.
   */
  staticOnly?: boolean;
}
export interface LivingRenderWorld {
  practicalLights: readonly LivingPractical[];
  /** Visual-only mood lights (warm shadowed key + cold status lamps per space); never part of the gameplay light table. */
  moodLights?: readonly LivingPractical[];
  fogAt(p: [number, number, number]): {color: string; density: number};
  optics?: LivingOptics;
  /** Solid boxes (LivingWorld.colliders): the headlamp dims when the lens is close to a surface. */
  colliders?: readonly T.Box3[];
}
export interface LivingRenderOptions {
  renderer: T.WebGLRenderer; scene: T.Scene; camera: T.PerspectiveCamera; world: LivingRenderWorld;
  width: number; height: number;
  /** 'high': MSAA 4×, ¾-res AO, 2048 lamp shadow. 'medium': no MSAA, half-res AO, 1024 shadows. */
  quality?: 'high' | 'medium';
  /** Per-world optical calibration; leaves the established level-two profiles untouched. */
  profiles?: Partial<Record<LivingOpticsMode, Partial<LivingRenderProfile>>>;
}
export interface LivingRenderFrame {
  mode: LivingOpticsMode;
  time: number;
  /** Headlamp on (ignored while probe is set). */
  lampOn: boolean;
  /** Probe-camera shot: the probe lamp lights the scene instead of the pod headlamp. */
  probe?: boolean;
  /** Defaults to the camera's world position / forward. */
  eye?: T.Vector3; dir?: T.Vector3;
}
export interface LivingRender {
  lamp: T.SpotLight; probeLamp: T.SpotLight; keys: T.SpotLight[]; points: T.PointLight[]; fill: T.PointLight;
  composer: EffectComposer;
  optics: LivingOptics;
  profile(mode: LivingOpticsMode): LivingRenderProfile;
  /** Call once per frame after the camera pose and world.update / setFocus, before render(). */
  frame(f: LivingRenderFrame): void;
  render(dt?: number): void;
  setSize(width: number, height: number): void;
  dispose(): void;
  /** Debug: metered geometric-mean luminance of the last rendered frame (GPU readback; not for per-frame use). */
  meterValue?(): number;
}

/** Headlamp near-field limit: full output beyond NEAR_FULL m to the nearest surface ahead, down to NEAR_MIN at the lens. */
const NEAR_FULL = 2.2, NEAR_MIN = .1;
const nearRay = new T.Ray(), nearHit = new T.Vector3(), nearDir = new T.Vector3();
/** Distance to the nearest collider along the lamp axis and a ring of rays 14° around it (Infinity when none). */
function nearSurface(colliders: readonly T.Box3[], eye: T.Vector3, dir: T.Vector3, right: T.Vector3, up: T.Vector3) {
  let best = Infinity;
  for (let k = 0; k < 5; k++) {
    nearDir.copy(dir);
    if (k) { const a = (k - 1) * Math.PI / 2; nearDir.addScaledVector(right, Math.cos(a) * .25).addScaledVector(up, Math.sin(a) * .25).normalize(); }
    nearRay.set(eye, nearDir);
    for (const b of colliders) {
      if (b.containsPoint(eye)) continue;
      if (nearRay.intersectBox(b, nearHit)) { const d = nearHit.distanceTo(eye); if (d < best) best = d; }
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ environment
const envCache = new WeakMap<T.WebGLRenderer, T.Texture>();
/** Black surroundings with a few small light strips: specular glints on wet steel/glass, almost no diffuse. */
function livingEnvironment(renderer: T.WebGLRenderer) {
  const hit = envCache.get(renderer); if (hit) return hit;
  const s = new T.Scene(); s.background = new T.Color('#000000');
  const strip = (color: string, power: number, p: [number, number, number], size: [number, number], ry = 0, rx = 0) => {
    const m = new T.Mesh(new T.PlaneGeometry(...size), new T.MeshBasicMaterial({color: new T.Color(color).multiplyScalar(power), side: T.DoubleSide}));
    m.position.set(...p); m.rotation.set(rx, ry, 0); s.add(m);
  };
  // Small hot strips only (glints on wet steel / glass); the big fill planes are near black so the map adds no ambient.
  strip('#9fd2d0', 5, [0, 4, -2], [6, .3], 0, Math.PI / 2);
  strip('#9fd2d0', 3, [-3, 4, 3], [.3, 5], 0, Math.PI / 2);
  strip('#ffa65a', 6, [5, 1.5, 1], [.5, 1.2], -Math.PI / 2);
  strip('#ff8a3a', 3, [-5, .6, -2], [.35, .8], Math.PI / 2);
  strip('#0d2226', .12, [0, -2, 0], [20, 20], 0, Math.PI / 2);
  strip('#0a1c20', .1, [0, 1, -8], [16, 6]);
  const pm = new T.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, .04).texture; pm.dispose();
  s.traverse(o => { if (o instanceof T.Mesh) { o.geometry.dispose(); (o.material as T.Material).dispose(); } });
  envCache.set(renderer, tex); return tex;
}

// ------------------------------------------------------------------------------------------------ 3D LUT
/**
 * Display-space grade baked to a 32³ LUT, on a cold grey-teal base: saturation rises with brightness, so a lamp's
 * colour holds in its own hot pool while the dim walls it washes fall back to grey-teal (orange only around
 * fixtures, green only where the slime fluoresces); magenta is suppressed; deep shadows are teal-black and
 * desaturated. Segmented contrast: crushed toe below 0.08, 1.22 slope through the mids, soft shoulder above 0.62.
 */
function buildLut(size = 32) {
  const data = new Uint8Array(size * size * size * 4);
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const curve = (v: number) => {
    v = Math.max(0, v);
    if (v < .08) return .08 * Math.pow(v / .08, 1.7);
    if (v < .62) return .08 + (v - .08) * 1.22;
    const t = Math.min(1, (v - .62) / .38);
    return .7388 + (1 - .7388) * (1 - Math.pow(1 - t, 1.78));
  };
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    let c = [r / (size - 1), g / (size - 1), b / (size - 1)];
    const lum = c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    // magenta / purple → neutral (story: only beam-lit particles and the slime body fluoresce)
    const mag = Math.max(0, Math.min(c[0], c[2]) - c[1]) * 2.2;
    let sat = .6 + .3 * ss(.03, .22, lum) + .14 * ss(.3, .7, lum) - .12 * ss(.78, 1, lum);
    sat *= 1 - Math.min(.85, mag);
    // orange/amber in the dim and mid range (washed walls, rust, wood) falls toward grey; hot lamp cores keep it
    const warm = c[0] >= c[1] ? Math.min(1, Math.max(0, c[0] - c[2]) * 2.5) : 0;
    sat *= 1 - .38 * warm * ss(.6, .12, lum);
    c = c.map(v => lum + (v - lum) * sat);
    // split tone: teal-black shadows, warm highlights
    const sh = ss(.25, 0, lum) * ss(0, .06, lum), hi = ss(.45, 1, lum);
    c[0] += -.014 * sh + .02 * hi;
    c[1] += .004 * sh + .006 * hi;
    c[2] += .012 * sh - .016 * hi;
    c = c.map(curve);
    const i = (b * size * size + g * size + r) * 4;
    data[i] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
    data[i + 1] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
    data[i + 2] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
    data[i + 3] = 255;
  }
  const t = new T.Data3DTexture(data, size, size, size);
  t.format = T.RGBAFormat; t.type = T.UnsignedByteType; t.minFilter = t.magFilter = T.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = T.ClampToEdgeWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ AO
/** GTAO that also ignores sprites and non-depth-writing transparents (slime sheets, glass haze) and can run at half res. */
class LivingAOPass extends GTAOPass {
  scale = 1;
  setSize(width: number, height: number) { super.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale))); }
  _overrideVisibility() {
    const cache = (this as unknown as {_visibilityCache: T.Object3D[]})._visibilityCache;
    this.scene.traverse(o => {
      if (!o.visible) return;
      const m = (o as T.Mesh).material as T.Material | T.Material[] | undefined;
      // Instanced litter / rivets and tagged accents are too small to occlude anything: skip their normal pass draws.
      const see = (o as T.Points).isPoints || (o as T.Line).isLine || (o as T.Sprite).isSprite || (o as T.InstancedMesh).isInstancedMesh || o.userData.noAO
        || (m && !Array.isArray(m) && m.transparent && !m.depthWrite);
      if (see) { o.visible = false; cache.push(o); }
    });
  }
}

// ------------------------------------------------------------------------------------------------ volumetric
const QUAD_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

const SCATTER_FS = `
  #include <packing>
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDepth; uniform mat4 invProj, camWorld; uniform vec3 eye; uniform float time, sigma, density, frame;
  uniform vec3 lampPos, lampDir, lampColor; uniform vec2 lampCone; uniform float lampPower, lampRange, lampShadowOn; uniform highp sampler2DShadow lampShadow; uniform mat4 lampShadowMat;
  uniform vec3 keyPos[2], keyDir[2], keyColor[2]; uniform vec2 keyCone[2]; uniform float keyPower[2]; uniform vec2 keyShadowOn;
  uniform highp sampler2DShadow keyShadow0, keyShadow1; uniform mat4 keyShadowMat[2];
  uniform vec3 ptPos[${LIVING_PT_COUNT}], ptColor[${LIVING_PT_COUNT}]; uniform float ptPower[${LIVING_PT_COUNT}], ptRange[${LIVING_PT_COUNT}];
  uniform float uSlime; uniform vec3 uSlimeMin, uSlimeMax;
  ${SLIME_ZONE_GLSL}
  float hash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float shadowAt(highp sampler2DShadow map, mat4 m, vec3 p){
    vec4 q = m * vec4(p, 1.); vec3 uv = q.xyz / q.w;
    if (q.w <= 0. || uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || uv.z > 1.) return 1.;
    uv.z -= .0015; return texture(map, uv);
  }
  float hg(float c, float g){ float g2 = g * g; return (1. - g2) / (12.566 * pow(1. + g2 - 2. * g * c, 1.5)); }
  // Henyey-Greenstein blend: soft forward lobe + isotropic so a head-mounted lamp still shows its beam.
  float phase(float c){ return mix(.0796, hg(c, .55), .6); }
  float rho(vec3 p){
    float zone = slimeZone(p);
    vec3 q = p * .55 + vec3(.02, -.035, .015) * time;
    float n = vnoise(q) * .65 + vnoise(q * 3.1 + 7.) * .35;
    float fine = vnoise(p * (6.5 + 5. * zone) + vec3(0., -time * .06, 0.));
    fine = mix(fine, fine * fine * 2.2, zone);
    float silt = 1. + .6 * (1. - smoothstep(-3.2, -1.2, p.y));
    // The backflow zone is murkier, but its gain stays moderate: a head-mounted lamp sees mostly
    // back-scatter, and a ×10 medium turns the first 2 m into an opaque wall.
    return density * silt * (.35 + 1.1 * n) * (.7 + .6 * fine) * (1. + 2.4 * zone);
  }
  void main(){
    float depth = texture2D(tDepth, vUv).r;
    vec4 view = invProj * vec4(vUv * 2. - 1., depth * 2. - 1., 1.); view /= view.w;
    float sceneDist = length(view.xyz);
    vec3 ray = normalize(mat3(camWorld) * view.xyz);
    float dist = min(sceneDist, 34.);
    const int STEPS = 30;
    float stepLen = dist / float(STEPS);
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))) + frame * .618034);
    vec3 acc = vec3(0.); vec3 fluoAcc = vec3(0.);
    for (int i = 0; i < STEPS; i++) {
      float s = (float(i) + jitter) * stepLen;
      vec3 p = eye + ray * s;
      float r = rho(p);
      float tv = exp(-sigma * s);
      vec3 L = vec3(0.);
      if (lampPower > 0.) {
        vec3 l = p - lampPos; float d = length(l); vec3 ln = l / max(d, 1e-3);
        float cone = smoothstep(lampCone.x, lampCone.y, dot(ln, lampDir));
        if (cone > 0.) {
          float vis = lampShadowOn > .5 ? shadowAt(lampShadow, lampShadowMat, p) : 1.;
          float rangeFade = pow(clamp(1. - pow(d / lampRange, 4.), 0., 1.), 2.);
          L += lampColor * lampPower * cone * vis * rangeFade * pow(max(d, .35), -1.5) * exp(-sigma * d) * phase(dot(ln, -ray));
        }
      }
      for (int k = 0; k < 2; k++) {
        if (keyPower[k] <= 0.) continue;
        vec3 l = p - keyPos[k]; float d = length(l); vec3 ln = l / max(d, 1e-3);
        float cone = smoothstep(keyCone[k].x, keyCone[k].y, dot(ln, keyDir[k]));
        if (cone <= 0.) continue;
        float vis = (k == 0 ? keyShadowOn.x : keyShadowOn.y) > .5 ? (k == 0 ? shadowAt(keyShadow0, keyShadowMat[0], p) : shadowAt(keyShadow1, keyShadowMat[1], p)) : 1.;
        L += keyColor[k] * keyPower[k] * cone * vis * 2.5 * pow(max(d, .5), -1.6) * exp(-sigma * d) * phase(dot(ln, -ray));
      }
      float zone = slimeZone(p);
      vec3 inS = L * r * tv * stepLen;
      acc += inS * (1. - .7 * zone);
      // Backflow silt fluoresces yellow-green under any light, plus a faint self-glow so it never goes fully dead.
      fluoAcc += vec3(.62, 1., .3) * (dot(inS, vec3(.3, .5, .2)) * .55 + r * tv * stepLen * .015) * zone;
    }
    // analytic halos around unshadowed point practicals (closed-form ∫ ds / (h² + (s - s0)²))
    for (int k = 0; k < ${LIVING_PT_COUNT}; k++) {
      if (ptPower[k] <= 0.) continue;
      vec3 o = ptPos[k] - eye; float s0 = dot(o, ray);
      float h0 = length(o - ray * s0);
      float h = sqrt(h0 * h0 + .16);
      float I = (atan((dist - s0) / h) - atan(-s0 / h)) / h;
      float fade = exp(-sigma * max(s0, 0.) * 1.4) * (1. - smoothstep(ptRange[k] * .4, ptRange[k] * 1.1, h0));
      acc += ptColor[k] * ptPower[k] * I * fade * density * .3;
    }
    gl_FragColor = vec4(acc + fluoAcc, sceneDist);
  }`;

/** Depth-aware 9-tap gaussian on the half-res scatter (alpha = view distance); run H then V. */
const BLUR_FS = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScatter; uniform vec2 dirTexel;
  void main(){
    vec4 c = texture2D(tScatter, vUv);
    vec3 sum = c.rgb * .2270; float w = .2270;
    float W[4]; W[0] = .1946; W[1] = .1216; W[2] = .0541; W[3] = .0162;
    for (int i = 1; i <= 4; i++) {
      for (int s = -1; s <= 1; s += 2) {
        vec4 t = texture2D(tScatter, vUv + dirTexel * float(i * s) * 1.5);
        float k = W[i - 1] * exp(-abs(t.a - c.a) / max(c.a * .08, .15));
        sum += t.rgb * k; w += k;
      }
    }
    gl_FragColor = vec4(sum / w, c.a);
  }`;

const COMPOSITE_FS = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse, tScatter, tDepth; uniform mat4 invProj; uniform vec2 halfTexel; uniform float scatterGain, exposure, absorb, knee;
  float distAt(vec2 uv){ float d = texture2D(tDepth, uv).r; vec4 v = invProj * vec4(uv * 2. - 1., d * 2. - 1., 1.); v /= v.w; return length(v.xyz); }
  void main(){
    float D = distAt(vUv);
    vec3 sum = vec3(0.); float w = 0.;
    for (int y = -1; y <= 1; y += 2) for (int x = -1; x <= 1; x += 2) {
      vec4 s = texture2D(tScatter, vUv + vec2(float(x), float(y)) * halfTexel);
      float k = 1. / (.02 + abs(s.a - D) / max(D, .5));
      sum += s.rgb * k; w += k;
    }
    vec3 scatter = sum / w;
    vec3 base = texture2D(tDiffuse, vUv).rgb;
    // wavelength-dependent absorption: red goes first, warm practicals turn teal with distance
    base *= exp(-min(D, 60.) * absorb * vec3(.032, .013, .01));
    vec3 c = (base + scatter * scatterGain) * exposure;
    // Highlight shoulder (asymptote 3 × knee): self-lit lenses and a lamp on a surface inches away stay below
    // white instead of burning a flat patch; everything under the knee is untouched.
    float l = dot(c, vec3(.2126, .7152, .0722));
    if (knee > 0. && l > knee) { float t = l - knee; c *= (knee + t / (1. + t / (2. * knee))) / l; }
    gl_FragColor = vec4(c, 1.);
  }`;

/**
 * Film meter: 64×36 log-luminance grid of the exposed frame (16 taps per cell), then one texel holding the
 * centre-weighted geometric mean, blended with the previous value (`blend` 1 = snap). No CPU readback.
 */
const METER_GRID_FS = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse; uniform vec2 cell;
  void main(){
    float s = 0.;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      vec3 c = texture2D(tDiffuse, vUv + (vec2(float(x), float(y)) - 1.5) * cell * .25).rgb;
      s += log2(clamp(dot(c, vec3(.2126, .7152, .0722)), 1e-4, 64.));
    }
    gl_FragColor = vec4(s / 16., 0., 0., 1.);
  }`;
const METER_REDUCE_FS = `
  precision highp float;
  uniform sampler2D tGrid, tPrev; uniform float blend;
  void main(){
    float s = 0., w = 0.;
    for (int y = 0; y < 36; y++) for (int x = 0; x < 64; x++) {
      vec2 uv = (vec2(float(x), float(y)) + .5) / vec2(64., 36.);
      vec2 d = (uv - .5) * vec2(1.6, 1.);
      float k = .25 + exp(-dot(d, d) * 5.);
      s += texture2D(tGrid, uv).r * k; w += k;
    }
    float m = exp2(s / w);
    float prev = texture2D(tPrev, vec2(.5)).r;
    gl_FragColor = vec4(mix(prev, m, blend), 0., 0., 1.);
  }`;

class LivingMeterPass extends Pass {
  private grid = new T.WebGLRenderTarget(64, 36, {type: T.HalfFloatType, depthBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter});
  private acc = [0, 1].map(() => new T.WebGLRenderTarget(1, 1, {type: T.HalfFloatType, depthBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter}));
  private cur = 0;
  private quad = new FullScreenQuad();
  private gridMat = new T.ShaderMaterial({vertexShader: QUAD_VS, fragmentShader: METER_GRID_FS, depthTest: false, depthWrite: false, uniforms: {tDiffuse: {value: null}, cell: {value: new T.Vector2(1 / 64, 1 / 36)}}});
  private reduceMat = new T.ShaderMaterial({vertexShader: QUAD_VS, fragmentShader: METER_REDUCE_FS, depthTest: false, depthWrite: false, uniforms: {tGrid: {value: this.grid.texture}, tPrev: {value: null}, blend: {value: 1}}});
  /** Blend weight for the next measurement (1 = snap); set by frame(). */
  blend = 1;
  /** Uniform slot holding the latest measurement (shared with the grade pass). */
  readonly out: {value: T.Texture} = {value: this.acc[0].texture};
  constructor() { super(); this.needsSwap = false; }
  render(renderer: T.WebGLRenderer, _w: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget) {
    this.gridMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.grid); this.quad.material = this.gridMat; this.quad.render(renderer);
    const next = 1 - this.cur;
    this.reduceMat.uniforms.tPrev.value = this.acc[this.cur].texture; this.reduceMat.uniforms.blend.value = this.blend;
    renderer.setRenderTarget(this.acc[next]); this.quad.material = this.reduceMat; this.quad.render(renderer);
    this.cur = next; this.out.value = this.acc[next].texture;
  }
  /** Debug readback of the metered geometric mean (exposed HDR luminance). */
  read(renderer: T.WebGLRenderer) {
    const px = new Uint16Array(4); renderer.readRenderTargetPixels(this.acc[this.cur], 0, 0, 1, 1, px);
    return T.DataUtils.fromHalfFloat(px[0]);
  }
  dispose() { this.grid.dispose(); this.acc.forEach(t => t.dispose()); this.gridMat.dispose(); this.reduceMat.dispose(); this.quad.dispose(); }
}

class LivingVolumetricPass extends Pass {
  readonly scatterTarget: T.WebGLRenderTarget;
  readonly scatterMat: T.ShaderMaterial; readonly compositeMat: T.ShaderMaterial; readonly blurMat: T.ShaderMaterial;
  private blurTarget: T.WebGLRenderTarget;
  private quad = new FullScreenQuad();
  constructor(private depth: () => T.Texture, shadowStub: T.DepthTexture) {
    super();
    this.scatterTarget = new T.WebGLRenderTarget(1, 1, {type: T.HalfFloatType, depthBuffer: false});
    this.blurTarget = new T.WebGLRenderTarget(1, 1, {type: T.HalfFloatType, depthBuffer: false});
    this.blurMat = new T.ShaderMaterial({vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, uniforms: {tScatter: {value: null}, dirTexel: {value: new T.Vector2()}}});
    const v3 = (n: number) => Array.from({length: n}, () => new T.Vector3());
    this.scatterMat = new T.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: SCATTER_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: {value: null}, invProj: {value: new T.Matrix4()}, camWorld: {value: new T.Matrix4()}, eye: {value: new T.Vector3()},
        time: {value: 0}, sigma: {value: .06}, density: {value: .05}, frame: {value: 0},
        lampPos: {value: new T.Vector3()}, lampDir: {value: new T.Vector3()}, lampColor: {value: new T.Color()}, lampCone: {value: new T.Vector2()}, lampPower: {value: 0}, lampRange: {value: 48},
        lampShadowOn: {value: 0}, lampShadow: {value: shadowStub}, lampShadowMat: {value: new T.Matrix4()},
        keyPos: {value: v3(2)}, keyDir: {value: v3(2)}, keyColor: {value: [new T.Color(), new T.Color()]}, keyCone: {value: [new T.Vector2(), new T.Vector2()]}, keyPower: {value: [0, 0]},
        keyShadowOn: {value: new T.Vector2()}, keyShadow0: {value: shadowStub}, keyShadow1: {value: shadowStub}, keyShadowMat: {value: [new T.Matrix4(), new T.Matrix4()]},
        ptPos: {value: v3(LIVING_PT_COUNT)}, ptColor: {value: Array.from({length: LIVING_PT_COUNT}, () => new T.Color())},
        ptPower: {value: new Array(LIVING_PT_COUNT).fill(0)}, ptRange: {value: new Array(LIVING_PT_COUNT).fill(1)},
        uSlime: {value: 0}, uSlimeMin: {value: new T.Vector3()}, uSlimeMax: {value: new T.Vector3()},
      },
    });
    this.compositeMat = new T.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false,
      uniforms: {tDiffuse: {value: null}, tScatter: {value: this.scatterTarget.texture}, tDepth: {value: null}, invProj: {value: new T.Matrix4()}, halfTexel: {value: new T.Vector2()}, scatterGain: {value: 1}, exposure: {value: 1}, absorb: {value: 1}, knee: {value: 0}},
    });
  }
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width / 2)), h = Math.max(1, Math.ceil(height / 2));
    this.scatterTarget.setSize(w, h); this.blurTarget.setSize(w, h); this.compositeMat.uniforms.halfTexel.value.set(.5 / w, .5 / h);
    this.size.set(w, h);
  }
  private size = new T.Vector2(1, 1);
  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget) {
    const depth = this.depth();
    this.scatterMat.uniforms.tDepth.value = depth; this.compositeMat.uniforms.tDepth.value = depth;
    this.scatterMat.uniforms.frame.value = (this.scatterMat.uniforms.frame.value + 1) % 64;
    renderer.setRenderTarget(this.scatterTarget); this.quad.material = this.scatterMat; this.quad.render(renderer);
    const b = this.blurMat.uniforms; this.quad.material = this.blurMat;
    b.tScatter.value = this.scatterTarget.texture; b.dirTexel.value.set(1 / this.size.x, 0);
    renderer.setRenderTarget(this.blurTarget); this.quad.render(renderer);
    b.tScatter.value = this.blurTarget.texture; b.dirTexel.value.set(0, 1 / this.size.y);
    renderer.setRenderTarget(this.scatterTarget); this.quad.render(renderer);
    this.compositeMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.material = this.compositeMat; this.quad.render(renderer);
  }
  dispose() { this.scatterTarget.dispose(); this.blurTarget.dispose(); this.scatterMat.dispose(); this.blurMat.dispose(); this.compositeMat.dispose(); this.quad.dispose(); }
}

// ------------------------------------------------------------------------------------------------ grade
const GRADE_FS = `
  precision highp float; precision highp sampler3D;
  varying vec2 vUv;
  uniform sampler2D tDiffuse, tMeter; uniform sampler3D tLut; uniform vec2 resolution, look; uniform float time, grain, vignette, aberration;
  uniform vec4 meter;   // strength, key, min gain, max gain
  uniform vec3 spread;  // pivot (display luma), gamma below, ease-out power above; pivot 0 = off
  vec3 agxContrast(vec3 x){ vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; }
  vec3 agx(vec3 c){
    const mat3 inset = mat3(.856627153315983, .137318972929847, .11189821299995, .0951212405381588, .761241990602591, .0767994186031903, .0482516061458583, .101439036467562, .811302368396859);
    const mat3 outset = mat3(1.1271005818144368, -.1413297634984383, -.14132976349843826, -.11060664309660323, 1.157823702216272, -.11060664309660294, -.016493938717834573, -.016493938717834257, 1.2519364065950405);
    c = inset * c; c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0., 1.);
    c = agxContrast(c);
    // AgX "punchy"-style look (power, saturation) in the encoded domain: base AgX alone greys every colour out.
    c = pow(max(c, 0.), vec3(look.x)); float y = dot(c, vec3(.2126, .7152, .0722)); c = y + (c - y) * look.y;
    c = outset * c; return clamp(pow(max(c, 0.), vec3(2.2)), 0., 1.);
  }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
  float h12(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main(){
    vec2 d = vUv - .5;
    vec2 off = d * dot(d, d) * 4. * aberration;
    vec3 hdr = vec3(texture2D(tDiffuse, vUv - off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + off).b);
    // Optical vignette on the HDR signal (before tone mapping): an off-centre ellipse that follows the frame, so
    // fixtures in the corners still bloom while dim walls sink. Strength is scaled with exposure by frame().
    vec2 e = (d - vec2(0., .025)) / vec2(.64, .6);
    float r = length(e) * (1. + .035 * sin(atan(e.y, e.x) * 3. + 1.3));
    hdr *= mix(1., 1. - smoothstep(.42, 1.22, r), vignette);
    if (meter.x > 0.) hdr *= mix(1., clamp(meter.y / max(texture2D(tMeter, vec2(.5)).r, 1e-4), meter.z, meter.w), meter.x);
    vec3 c = srgb(agx(hdr));
    c = texture(tLut, c * (31. / 32.) + .5 / 32.).rgb;
    // Display-domain tonal spread around a pivot (luma only, hue kept): below it a power toe sinks the room, above it an
    // ease-out lifts lit surfaces and lenses toward white without reaching it — a lit frame keeps a real top end while
    // its average stays low. 1.0 maps to 1.0, so nothing new clips.
    if (spread.x > 0.) {
      float y0 = max(dot(c, vec3(.2126, .7152, .0722)), 1e-5), p = spread.x;
      float y1 = y0 < p ? p * pow(y0 / p, spread.y) : p + (1. - p) * (1. - pow(1. - min((y0 - p) / (1. - p), 1.), spread.z));
      y1 = mix(y1, y0, smoothstep(.72, 1., y0));   // the top returns to identity: capped emissives stay below clip
      c *= y1 / y0;
    }
    vec2 g = vUv * resolution + fract(time * 13.7) * vec2(173.3, 91.7);
    float n = h12(g) + h12(g + 37.1) - 1.;
    vec3 nc = vec3(h12(g + 11.3), h12(g + 23.9), h12(g + 5.7)) - .5;
    float l = dot(c, vec3(.2126, .7152, .0722));
    float gw = grain * (.3 + .7 * smoothstep(.0, .2, l) * (1. - .6 * l));
    c += (n + nc * .35) * gw;
    gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
  }`;

class LivingGradePass extends Pass {
  readonly mat: T.ShaderMaterial; private quad = new FullScreenQuad();
  constructor(lut: T.Data3DTexture) {
    super();
    this.mat = new T.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: GRADE_FS, depthTest: false, depthWrite: false,
      uniforms: {tDiffuse: {value: null}, tLut: {value: lut}, resolution: {value: new T.Vector2(1, 1)}, look: {value: new T.Vector2(1.1, 1.2)}, time: {value: 0}, grain: {value: .03}, vignette: {value: .4}, aberration: {value: .002},
        tMeter: {value: null}, meter: {value: new T.Vector4(0, .16, 1, 1)}, spread: {value: new T.Vector3(0, 1, 1)}},
    });
    this.quad.material = this.mat;
  }
  setSize(w: number, h: number) { this.mat.uniforms.resolution.value.set(w, h); }
  render(renderer: T.WebGLRenderer, writeBuffer: T.WebGLRenderTarget, readBuffer: T.WebGLRenderTarget) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

// ------------------------------------------------------------------------------------------------ medium
/**
 * Layered water medium for the deck. A negative FogExp2 density selects it (any positive density keeps
 * three's stock exp² fog, so other scenes sharing the chunk are unchanged):
 *   transmittance exp(-σ·max(d − 2.5, 0)) — single-path, so lit surfaces 40–60 m away keep 25–45 % instead of
 *   the exp² cliff; the surface tint is 45 % of the fog colour close up, 10 % beyond ~40 m (lit in-scatter
 *   comes from the volumetric pass), so unlit distance reads black, not grey.
 */
const LIVING_FOG_FRAGMENT = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor;
		vec3 fogTint = fogColor;
		if ( fogDensity < 0.0 ) {
			fogFactor = 1.0 - exp( fogDensity * max( vFogDepth - 2.5, 0.0 ) );
			// Extinction, not a milky veil: the lit in-scatter is added by the volumetric pass, so the surface fog
			// only keeps a trace of the medium colour and sinks to near black with distance.
			fogTint *= mix( 0.45, 0.1, smoothstep( 4.0, 40.0, vFogDepth ) );
		} else fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		vec3 fogTint = fogColor;
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
#endif
`;
function installLivingFog() { if (T.ShaderChunk.fog_fragment !== LIVING_FOG_FRAGMENT) T.ShaderChunk.fog_fragment = LIVING_FOG_FRAGMENT; }
/** Surface extinction per metre for the layered medium, from the per-space FogExp2-style density. */
export const LIVING_SURFACE_SIGMA = .68;

// ------------------------------------------------------------------------------------------------ pipeline
const tmpV = new T.Vector3(), tmpR = new T.Vector3(), tmpU = new T.Vector3(), UP = new T.Vector3(0, 1, 0), tmpC = new T.Color();
/** Space boxes for static-light clipping: inner wall faces (0.3 m inside) pass, the neighbour's faces do not. */
const spaceOf = (p: T.Vector3) => {
  let best: (typeof LIVING_SPACES)[number] | undefined;
  for (const s of LIVING_SPACES) {
    if (p.x < s.minX || p.x > s.maxX || p.z < s.minZ || p.z > s.maxZ || p.y < s.floorY - .5 || p.y > s.ceilY + .5) continue;
    if (!best || (s.maxX - s.minX) * (s.maxZ - s.minZ) < (best.maxX - best.minX) * (best.maxZ - best.minZ)) best = s;
  }
  return best;
};
const spaceBox = new Map(LIVING_SPACES.map(s => [s.id, {min: new T.Vector3(s.minX - .2, s.floorY - .6, s.minZ - .2), max: new T.Vector3(s.maxX + .2, s.ceilY + .6, s.maxZ + .2)}]));

export function createLivingRender(o: LivingRenderOptions): LivingRender {
  const {renderer, scene, camera, world} = o;
  const profiles:Record<LivingOpticsMode,LivingRenderProfile>={live:{...LIVING_RENDER_PROFILES.live,...o.profiles?.live},recording:{...LIVING_RENDER_PROFILES.recording,...o.profiles?.recording}};
  const high = (o.quality ?? 'high') === 'high';
  const optics = world.optics ?? createLivingOptics();

  // --------------------------------------------------------------- lights
  const L = LIVING_LAMP;
  const lamp = new T.SpotLight(L.color, 0, L.distance, L.angle, L.penumbra, L.decay); lamp.name = 'living-render:lamp';
  lamp.castShadow = true; lamp.shadow.mapSize.setScalar(high ? 2048 : 1024); lamp.shadow.bias = -.0006; lamp.shadow.normalBias = .02; lamp.shadow.radius = 3; lamp.shadow.camera.near = .1;
  const probeLamp = new T.SpotLight('#e2ecdf', 0, 16, .62, .5, 1.4); probeLamp.name = 'living-render:probe-lamp';
  probeLamp.castShadow = true; probeLamp.shadow.mapSize.setScalar(1024); probeLamp.shadow.bias = -.0006; probeLamp.shadow.normalBias = .02; probeLamp.shadow.radius = 3; probeLamp.shadow.camera.near = .1;
  const keys = Array.from({length: 2}, (_, i) => {
    const k = new T.SpotLight('#ffffff', 0, 20, .95, .7, 1.6); k.name = `living-render:key${i}`;
    k.castShadow = true; k.shadow.mapSize.setScalar(1024); k.shadow.bias = -.0004; k.shadow.normalBias = .03; k.shadow.radius = 5; k.shadow.camera.near = .2;
    return k;
  });
  const points = Array.from({length: LIVING_PT_COUNT}, (_, i) => { const p = new T.PointLight('#ffffff', 0, 10, 1.8); p.name = `living-render:point${i}`; return p; });
  for (const k of keys) k.shadow.autoUpdate = false;
  const keySource: (LivingPractical | null)[] = [null, null];
  let frameNo = 0;
  const fill = new T.PointLight('#4f7f84', 0, 3.2, 2); fill.name = 'living-render:fill';
  const rig = new T.Group(); rig.name = 'living-render-rig';
  rig.add(lamp, lamp.target, probeLamp, probeLamp.target, ...keys, ...keys.map(k => k.target), ...points, fill);
  scene.add(rig);

  // --------------------------------------------------------------- scene setup
  installLivingFog();
  scene.background = new T.Color('#010405');
  if (!(scene.fog instanceof T.FogExp2)) scene.fog = new T.FogExp2('#050f11', .06);
  scene.environment = livingEnvironment(renderer);

  // --------------------------------------------------------------- composer
  const shadowStubTarget = new T.WebGLRenderTarget(1, 1, {depthTexture: new T.DepthTexture(1, 1)});
  shadowStubTarget.depthTexture!.compareFunction = T.LessEqualCompare;
  { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(shadowStubTarget); renderer.clear(); renderer.setRenderTarget(prev); }
  const composer = new EffectComposer(renderer, new T.WebGLRenderTarget(o.width, o.height, {type: T.HalfFloatType, samples: high ? 4 : 0}));
  const renderPass = new RenderPass(scene, camera);
  const ao = new LivingAOPass(scene, camera, o.width, o.height);
  ao.updateGtaoMaterial({radius: .45, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: high ? 12 : 10, distanceFallOff: 1, screenSpaceRadius: false});
  ao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: high ? 12 : 8});
  ao.scale = high ? .75 : .5; ao.blendIntensity = 1;
  const volume = new LivingVolumetricPass(() => (ao as unknown as {depthTexture: T.Texture}).depthTexture, shadowStubTarget.depthTexture!);
  // Thresholded on the exposed HDR signal: only lenses, beam cores and wet speculars bloom, never a lit wall.
  const bloom = new UnrealBloomPass(new T.Vector2(o.width, o.height), .3, .45, BLOOM_THRESHOLD);
  (bloom.highPassUniforms as {smoothWidth: {value: number}}).smoothWidth.value = .9;
  const lut = buildLut();
  const grade = new LivingGradePass(lut);
  const meter = new LivingMeterPass();
  grade.mat.uniforms.tMeter = meter.out;
  composer.addPass(renderPass); composer.addPass(ao); composer.addPass(volume); composer.addPass(meter); composer.addPass(bloom); composer.addPass(grade);

  let mode: LivingOpticsMode = 'recording';
  let lastMode: LivingOpticsMode | null = null;
  const lastEye = new T.Vector3(), lastDir = new T.Vector3();
  let lastTime = 0;
  const size = new T.Vector2(o.width, o.height);
  const setSize = (w: number, h: number) => { size.set(w, h); composer.setSize(w, h); };
  setSize(o.width, o.height);

  const v3 = (p: readonly number[]) => tmpV.set(p[0], p[1], p[2]);
  const coneOf = (l: T.SpotLight, out: T.Vector2) => out.set(Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra)));

  return {
    lamp, probeLamp, keys, points, fill, composer, optics,
    profile: m => profiles[m],
    frame(f) {
      mode = f.mode;
      const P = profiles[f.mode];
      camera.updateMatrixWorld();
      const eye = (f.eye ?? camera.getWorldPosition(new T.Vector3())).clone();
      const dir = (f.dir ?? camera.getWorldDirection(new T.Vector3())).clone().normalize();
      const right = tmpR.crossVectors(dir, UP).normalize();
      // Lamp mounted below-right of the lens: shadows read beside objects instead of hiding behind them.
      const on = f.lampOn && !f.probe;
      lamp.position.copy(eye).addScaledVector(UP, -.32).addScaledVector(right, .42);
      lamp.target.position.copy(eye).addScaledVector(dir, 12); lamp.target.updateMatrixWorld();
      // A point-source spot is ×(1/d^1.5) at the lens; a real reflector lamp is not. Dim it against a surface inches away.
      const upV = tmpU.crossVectors(right, dir);
      const dn = world.colliders?.length && (on || f.probe) ? nearSurface(world.colliders, eye, dir, right, upV) : Infinity;
      const nearFull = Math.max(.1, P.lampNearFull ?? NEAR_FULL);
      const nearGain = T.MathUtils.clamp(Math.pow(dn / nearFull, 1.6), NEAR_MIN, 1);
      lamp.intensity = on ? L.intensity * P.lampGain * nearGain : 0; lamp.decay = P.lampDecay ?? L.decay;
      fill.position.copy(eye); fill.intensity = on ? .35 * P.lampGain * nearGain : 0;
      probeLamp.position.copy(eye).addScaledVector(UP, .12).addScaledVector(right, -.1);
      probeLamp.target.position.copy(eye).addScaledVector(dir, 10); probeLamp.target.updateMatrixWorld();
      probeLamp.intensity = f.probe ? 32 * P.lampGain * nearGain : 0;
      // A dark caster still renders its depth pass; skip it instead of toggling castShadow (program recompiles).
      lamp.shadow.autoUpdate = on || !lamp.shadow.map; probeLamp.shadow.autoUpdate = !!f.probe || !probeLamp.shadow.map;
      const beam = f.probe ? probeLamp : lamp;

      // practicals: 2 shadowed keys + 4 halos/points, ranked by received intensity
      // Ranked by what the frame can see: intensity × reach, falloff, and whether the fixture is ahead of the lens.
      const home = spaceOf(eye);
      const lights = world.moodLights ? [...world.practicalLights, ...world.moodLights] : world.practicalLights;
      const ranked = lights.filter(s => !s.staticOnly)
        .map(s => {
          const to = v3(s.position).sub(eye); const d = to.length();
          const ahead = d < 3 ? 1 : .25 + .75 * Math.max(0, to.dot(dir) / d);
          return {s, d, ahead, w: s.intensity * Math.sqrt(s.range) / (4 + d * d) * ahead};
        })
        .filter(x => x.d < x.s.range + 18).sort((a, b) => b.w - a.w);
      // Slot 0 belongs to the mood key of the camera's space (else the strongest mood key in view), so every
      // room has one warm shadowed pool; slot 1 stays the strongest remaining fixture.
      const mood = ranked.filter(x => x.s.key && (x.s.space === home?.id || x.ahead > .55))
        .sort((a, b) => Number(b.s.space === home?.id) - Number(a.s.space === home?.id) || b.w - a.w)[0];
      if (mood) { ranked.splice(ranked.indexOf(mood), 1); ranked.unshift(mood); }
      // Ranking uses the rated output so a flickering fixture keeps its slot (and its cached shadow map).
      const out = (s: LivingPractical) => livingFlicker(s.flicker, s.seed ?? 0, f.time);
      frameNo++;
      let usedKeys = 0;
      keys.forEach((k, i) => {
        const x = ranked[i];
        // An idle shadowed spot still samples its shadow map; one that never rendered poisons every lit pixel.
        if (!x || x.d > 40) { k.intensity = 0; keySource[i] = null; if (!k.shadow.map) k.shadow.needsUpdate = true; return; }
        usedKeys++;
        const s = x.s; k.position.set(s.position[0], s.position[1], s.position[2]); k.color.set(s.color);
        // Mood keys are emergency floods: hot centre, hard edge (pool reads as a pool, not a wash).
        k.intensity = s.intensity * (s.key ? MOOD_KEY_GAIN : 6) * P.practicalGain * out(s); k.distance = s.range * 2;
        k.angle = s.angle ?? .95; k.penumbra = s.penumbra ?? (s.key ? .4 : .7);
        const d = s.dir ?? [0, -1, 0];
        k.target.position.set(s.position[0] + d[0] * 4, s.position[1] + d[1] * 4, s.position[2] + d[2] * 4); k.target.updateMatrixWorld();
        if (keySource[i] !== s || frameNo % 3 === i) k.shadow.needsUpdate = true;
        keySource[i] = s;
      });
      // Unshadowed points only for fixtures in (or at the doorway of) the camera's space; the rest go
      // to the space-clipped static term so nothing leaks through a bulkhead.
      const near = (s: LivingPractical) => !home || s.space === home.id || (s.position[0] > home.minX - 1.5 && s.position[0] < home.maxX + 1.5
        && s.position[2] > home.minZ - 1.5 && s.position[2] < home.maxZ + 1.5 && s.position[1] > home.floorY - 1 && s.position[1] < home.ceilY + 1);
      const pointSrc = ranked.slice(usedKeys).filter(x => near(x.s));
      points.forEach((p, i) => {
        const x = pointSrc[i];
        if (!x) { p.intensity = 0; return; }
        // A wall fixture's unshadowed point stands in front of its lens (along its aim), else it burns a blob into its own panel.
        const s = x.s, wd = s.dir && s.dir[1] > -.99 ? s.dir : null, o = wd ? .8 : 0;
        p.position.set(s.position[0] + (wd?.[0] ?? 0) * o, s.position[1] + (wd?.[1] ?? 0) * o, s.position[2] + (wd?.[2] ?? 0) * o); p.color.set(s.color);
        p.intensity = s.intensity * .9 * P.practicalGain * out(s); p.distance = s.range * 1.2;
      });
      // Everything else in reach: diffuse-only, clipped to its own space (living-materials STATIC_GLSL).
      const dyn = new Set([...ranked.slice(0, usedKeys), ...pointSrc.slice(0, points.length)].map(x => x.s));
      const far = lights
        .filter(s => !dyn.has(s))
        .map(s => { const d = v3(s.position).distanceTo(eye); return {s, d, w: s.intensity * Math.sqrt(s.range) / (4 + d * d) * (s.staticOnly ? 1e3 : 1)}; })
        .filter(x => x.d < x.s.range + (x.s.staticOnly ? 32 : 45)).sort((a, b) => b.w - a.w).slice(0, LIVING_STATIC_MAX);
      const S = LIVING_STATIC; let n = 0;
      for (const {s} of far) {
        const sp = s.space ? spaceBox.get(s.space) : undefined; if (!sp) continue;
        const g = s.intensity * .9 * P.practicalGain * out(s); if (g <= 0) continue;
        S.uSLPos.value[n].set(s.position[0], s.position[1], s.position[2], s.range * 1.2);
        tmpC.set(s.color); S.uSLCol.value[n].set(tmpC.r * g, tmpC.g * g, tmpC.b * g);
        const d = s.dir, wall = !!d && d[1] > -.99;
        S.uSLDir.value[n].set(d?.[0] ?? 0, d?.[1] ?? -1, d?.[2] ?? 0, s.staticOnly && s.angle ? 2 + Math.cos(s.angle) : wall ? .35 : 0);
        S.uSLMin.value[n].copy(sp.min); S.uSLMax.value[n].copy(sp.max);
        n++;
      }
      S.uSLCount.value = n;

      // medium
      const fog = world.fogAt([eye.x, eye.y, eye.z]);
      if (scene.fog instanceof T.FogExp2) { scene.fog.color.set(fog.color).multiplyScalar(P.fogTint ?? 1); scene.fog.density = -fog.density * LIVING_SURFACE_SIGMA; }
      scene.environmentIntensity = P.envIntensity;
      const sigma = fog.density * .9;

      // snow optics
      optics.uLampPos.value.copy(beam.position); optics.uLampDir.value.subVectors(beam.target.position, beam.position).normalize();
      coneOf(beam, optics.uLampCone.value); optics.uLampColor.value.copy(beam.color); optics.uLampPower.value = beam.intensity;
      keys.forEach((k, i) => {
        optics.uKeyPos.value[i].copy(k.position); optics.uKeyDir.value[i].subVectors(k.target.position, k.position).normalize();
        coneOf(k, optics.uKeyCone.value[i]); optics.uKeyColor.value[i].copy(k.color); optics.uKeyPower.value[i] = k.intensity;
      });
      points.forEach((p, i) => { optics.uPtPos.value[i].copy(p.position); optics.uPtColor.value[i].copy(p.color); optics.uPtPower.value[i] = p.intensity; });
      optics.uSigma.value = sigma; optics.uHaloGain.value = P.halo; optics.uPracticalGain.value = P.practicalGain; LIVING_LENS.sigma.value = sigma; LIVING_LENS.gain.value = P.lensGain ?? 1;
      optics.uFocalPx.value = .5 * size.y / Math.tan(T.MathUtils.degToRad(camera.fov) / 2);

      // volumetric
      const u = volume.scatterMat.uniforms;
      u.invProj.value.copy(camera.projectionMatrixInverse); u.camWorld.value.copy(camera.matrixWorld); u.eye.value.copy(eye);
      u.time.value = f.time; u.sigma.value = sigma; u.density.value = .0032 * P.scatter * T.MathUtils.clamp(fog.density / .062, .5, 1.2);
      u.lampPos.value.copy(beam.position); u.lampDir.value.copy(optics.uLampDir.value); u.lampColor.value.copy(beam.color); u.lampCone.value.copy(optics.uLampCone.value); u.lampPower.value = beam.intensity; u.lampRange.value = beam.distance > 0 ? beam.distance : 48;
      const lampDepth = beam.shadow.map?.depthTexture;
      u.lampShadowOn.value = lampDepth && beam.intensity > 0 ? 1 : 0; if (lampDepth) u.lampShadow.value = lampDepth;
      u.lampShadowMat.value.copy(beam.shadow.matrix);
      keys.forEach((k, i) => {
        u.keyPos.value[i].copy(k.position); u.keyDir.value[i].copy(optics.uKeyDir.value[i]); u.keyColor.value[i].copy(k.color);
        // A mood key's boost is for its surface pool; its beam in the medium stays at the fixture rating.
        u.keyCone.value[i].copy(optics.uKeyCone.value[i]); u.keyPower.value[i] = k.intensity * (keySource[i]?.key ? 6 / MOOD_KEY_GAIN : 1);
        const sd = k.shadow.map?.depthTexture; u.keyShadowOn.value.setComponent(i, sd && k.intensity > 0 ? 1 : 0);
        if (sd) u[i === 0 ? 'keyShadow0' : 'keyShadow1'].value = sd;
        u.keyShadowMat.value[i].copy(k.shadow.matrix);
      });
      points.forEach((p, i) => { u.ptPos.value[i].copy(p.position); u.ptColor.value[i].copy(p.color); u.ptPower.value[i] = p.intensity; u.ptRange.value[i] = p.distance || 8; });
      u.uSlime.value = optics.uSlime.value; u.uSlimeMin.value.copy(optics.uSlimeMin.value); u.uSlimeMax.value.copy(optics.uSlimeMax.value);
      const c = volume.compositeMat.uniforms;
      c.invProj.value.copy(camera.projectionMatrixInverse); c.exposure.value = P.exposure; c.scatterGain.value = 1; c.knee.value = P.whiteKnee ?? 0;
      bloom.strength = P.bloom;
      // Meter: snaps on a mode change or a cut (camera jump / swing), otherwise adapts at ~1.5 stops per second.
      const cut = lastMode !== f.mode || lastEye.distanceToSquared(eye) > 4 || lastDir.dot(dir) < .8 || f.time < lastTime;
      const dtm = T.MathUtils.clamp(f.time - lastTime, 0, .5);
      meter.blend = cut || dtm === 0 ? 1 : 1 - Math.exp(-dtm * 2.5);
      lastMode = f.mode; lastEye.copy(eye); lastDir.copy(dir); lastTime = f.time;
      const mr = P.meterRange ?? [1, 1];
      grade.mat.uniforms.meter.value.set(P.meter ?? 0, P.meterKey ?? .16, mr[0], mr[1]);
      // Lower exposure (live view) opens the lens up: stronger vignette and fringing, as on a pushed sensor.
      const push = T.MathUtils.clamp(1 + .28 * Math.log2(profiles.recording.exposure / P.exposure), .7, 1.7);
      const g = grade.mat.uniforms; g.time.value = f.time; g.grain.value = P.grain; g.look.value.set(...(P.look ?? [1.1, 1.2])); g.spread.value.set(...(P.spread ?? [0, 1, 1])); g.vignette.value = Math.min(.95, P.vignette * push); g.aberration.value = P.aberration * Math.sqrt(push);
    },
    render(dt) {
      const prevEnabled = renderer.shadowMap.enabled; renderer.shadowMap.enabled = true;
      composer.render(dt);
      renderer.shadowMap.enabled = prevEnabled;
      void mode;
    },
    setSize,
    meterValue: () => meter.read(renderer),
    dispose() {
      rig.removeFromParent();
      for (const l of [lamp, probeLamp, ...keys]) l.shadow.dispose();
      for (const p of points) p.dispose();
      composer.passes.forEach(p => p.dispose()); composer.dispose();
      lut.dispose(); shadowStubTarget.dispose();
    },
  };
}
