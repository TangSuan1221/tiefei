import * as T from 'three';

/**
 * Level-two surface library. Every architectural geometry carries UVs in metres
 * (see living-build.ts); each material's texture repeat converts metres to tiles,
 * so texel density stays constant across walls, floors and props.
 */
export interface WearOptions {
  /** World Y of the floor this surface stands on (grime band reference). */
  floorY?: number;
  /** Silt blanket on up-facing surfaces, 0..1. */
  silt?: number;
  /** Low-wall grime band and vertical runoff, 0..1. */
  grime?: number;
  /** Green-brown biofilm patches, 0..1. */
  bio?: number;
  /** Rust bloom tint on runoff, 0..1. */
  rust?: number;
  /** Rotated second-sample anti-tiling, 0..1 (0 for gridded textures: tiles, plates, grates). */
  antiTile?: number;
  /**
   * Standing film / pooled-water response, 0..1: glossy low-roughness pools on up-facing faces near
   * the floor (flattened normals, darker albedo) and slick runs down vertical faces.
   */
  wet?: number;
}

type Scan = {map: T.Texture; normalMap: T.Texture; roughnessMap: T.Texture};

const WEAR_UNIFORM_KEYS = ['uFloor', 'uSilt', 'uGrime', 'uBio', 'uRust', 'uAnti', 'uWet'] as const;
/** Rust albedo sampled world-space by every worn material (shared uniform object). */
const RUST_MAP: {value: T.Texture | null} = {value: null};

const WEAR_COMMON = /* glsl */`
varying vec3 vLWorld;varying vec3 vLNormal;
uniform float uFloor,uSilt,uGrime,uBio,uRust,uAnti,uWet;
uniform sampler2D uRustMap;
float lwHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float lwNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(lwHash(i),lwHash(i+vec3(1,0,0)),f.x),mix(lwHash(i+vec3(0,1,0)),lwHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(lwHash(i+vec3(0,0,1)),lwHash(i+vec3(1,0,1)),f.x),mix(lwHash(i+vec3(0,1,1)),lwHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float lwFbm(vec3 p){return lwNoise(p)*.52+lwNoise(p*2.07+11.3)*.28+lwNoise(p*4.31+3.7)*.14+lwNoise(p*9.2)*.06;}
const mat2 lwR=mat2(.8,-.6,.6,.8);
vec2 lwRot(vec2 uv){return lwR*uv*.731+vec2(.317,.571);}
vec2 lwBox(vec3 p,vec3 n){vec3 a=abs(n);return a.y>=a.x&&a.y>=a.z?p.xz:(a.x>=a.z?p.zy:p.xy);}
`;

/**
 * World-space weathering. Shared program (one cache key) with per-material uniforms.
 * - Anti-tiling: every map is sampled twice (second sample rotated/rescaled) and blended by a
 *   ~5 m world noise, so 1–2 m texture repeats never line up.
 * - Height: grime band and tide lines measured from `floorY`; silt only on up-facing faces.
 * - Curvature (screen-space dN/dP): bevels, pipes and rounded edges chip to bare steel or rust.
 * - Rust: streaks run down vertical faces from noise seeds and from edges; real rust albedo.
 */
export function applyWear(material: T.MeshStandardMaterial, o: WearOptions = {}) {
  const u = {
    uFloor: {value: o.floorY ?? -3}, uSilt: {value: o.silt ?? .6}, uGrime: {value: o.grime ?? .6},
    uBio: {value: o.bio ?? .35}, uRust: {value: o.rust ?? .3}, uAnti: {value: o.antiTile ?? 1}, uWet: {value: o.wet ?? 0},
  };
  material.userData.wear = u;
  material.onBeforeCompile = shader => {
    const w = material.userData.wear as typeof u;
    for (const k of WEAR_UNIFORM_KEYS) shader.uniforms[k] = w[k];
    shader.uniforms.uRustMap = RUST_MAP;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLWorld;varying vec3 vLNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
 vec4 lwP=vec4(transformed,1.);vec3 lwN=objectNormal;
 #ifdef USE_INSTANCING
 lwP=instanceMatrix*lwP;lwN=mat3(instanceMatrix)*lwN;
 #endif
 vLWorld=(modelMatrix*lwP).xyz;vLNormal=normalize(mat3(modelMatrix)*lwN);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + WEAR_COMMON)
      .replace('#include <map_fragment>', `
 vec3 lwN=normalize(vLNormal);float lwUp=clamp(lwN.y,0.,1.);float lwSide=1.-smoothstep(.55,.85,abs(lwN.y));
 float lwA=lwFbm(vLWorld*.33),lwB=lwFbm(vLWorld*1.9+4.1);
 float lwW=smoothstep(.36,.64,lwFbm(vLWorld*.19+7.3))*uAnti;
 #ifdef USE_MAP
 vec4 sampledDiffuseColor=mix(texture2D(map,vMapUv),texture2D(map,lwRot(vMapUv)),lwW);
 diffuseColor*=sampledDiffuseColor;
 #endif
 float lwH=vLWorld.y-uFloor;
 float lwCurv=clamp(length(fwidth(lwN))/max(length(fwidth(vLWorld)),1e-4)*.06,0.,1.);
 float lwLow=(1.-smoothstep(0.,1.6,lwH))*lwSide*(.55+.45*lwA);
 float lwStreak=smoothstep(.6,.93,lwNoise(vec3(vLWorld.x*3.7+vLWorld.z*3.7,vLWorld.y*.16,vLWorld.z*.31+vLWorld.x*.07)))*lwSide*(.35+.65*lwB);
 float lwTide=0.;
 for(int i=0;i<3;i++){float th=.62+float(i)*.83+.05*sin(vLWorld.x*1.3+vLWorld.z*.9)+.04*lwB;
  lwTide+=(1.-smoothstep(.0,.022+.02*lwA,abs(lwH-th)))*(.55-.15*float(i));}
 lwTide*=lwSide*step(.25,lwA);
 float lwBelow=lwSide*(1.-smoothstep(1.35,1.55,lwH+.1*lwB));
 float lwPud=uWet*smoothstep(.56,.64,lwFbm(vec3(vLWorld.x*.23,3.7,vLWorld.z*.23))+.05*lwB)*smoothstep(.82,.97,lwUp)*(1.-smoothstep(.06,.45,lwH))*smoothstep(-.35,-.12,lwH);
 float lwSiltMask=smoothstep(.45,.9,lwUp)*smoothstep(.46,.78,lwA*.7+lwB*.3+(uSilt-.5)*.45)*min(1.,uSilt*1.3)*(1.-lwPud);
 float lwBioMask=smoothstep(.56,.78,lwFbm(vLWorld*.55+17.))*uBio*(.6+.4*lwB);
 float lwChip=lwCurv*smoothstep(.42,.62,lwFbm(vLWorld*7.3+2.))*.9;
 float lwRustM=clamp(uRust*(lwStreak*.9+lwLow*.45+lwCurv*.8*lwB)*smoothstep(.3,.7,lwFbm(vLWorld*2.6+31.)+lwStreak*.4),0.,1.);
 vec3 lwRustC=texture2D(uRustMap,lwBox(vLWorld,lwN)*.37).rgb;
 vec3 lwBase=diffuseColor.rgb*mix(.84,1.1,lwA);
 lwBase*=1.-clamp(lwLow*uGrime*.6+lwStreak*uGrime*.26+lwBelow*uGrime*.12,0.,.8);
 lwBase=mix(lwBase,vec3(.36,.36,.34)*(.7+.6*lwB),lwChip*(1.-uRust*.6));
 lwBase=mix(lwBase,lwRustC*vec3(.95,.8,.7),lwRustM*.85);
 lwBase*=1.-lwTide*uGrime*.5;
 lwBase=mix(lwBase,vec3(.085,.10,.062),lwBioMask*.62);
 float lwLum=dot(lwBase,vec3(.3,.59,.11));
 lwBase=mix(lwBase,vec3(.12,.116,.098)*(.75+.5*lwB)+lwLum*.35,lwSiltMask*.5);
 lwBase*=1.-.38*lwPud;
 diffuseColor.rgb=lwBase;`)
      .replace('#include <roughnessmap_fragment>', `
 float roughnessFactor=roughness;
 #ifdef USE_ROUGHNESSMAP
 vec4 texelRoughness=mix(texture2D(roughnessMap,vRoughnessMapUv),texture2D(roughnessMap,lwRot(vRoughnessMapUv)),lwW);
 roughnessFactor*=texelRoughness.g;
 #endif
 roughnessFactor*=mix(.6,1.22,lwB*.7+lwA*.3);
 roughnessFactor=mix(roughnessFactor,.5,lwChip);roughnessFactor=mix(roughnessFactor,.95,lwRustM);
 roughnessFactor=mix(roughnessFactor,.97,lwSiltMask);roughnessFactor=mix(roughnessFactor,.2,lwBioMask*.7);
 roughnessFactor=mix(roughnessFactor,.45,uWet*lwStreak*(1.-lwRustM)*.75);
 roughnessFactor=mix(roughnessFactor,.42,lwPud);
 roughnessFactor=clamp(roughnessFactor,.04,1.);`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN=texture2D(normalMap,vNormalMapUv).xyz*2.-1.;
 vec3 lwN2=texture2D(normalMap,lwRot(vNormalMapUv)).xyz*2.-1.;lwN2.xy=transpose(lwR)*lwN2.xy;
 mapN=normalize(mix(mapN,lwN2,lwW));mapN.xy*=1.-max(lwSiltMask*.7,lwPud*.9);`);
    patchStatic(shader, null);
  };
  material.userData.livingStatic = true;
  material.customProgramCacheKey = () => 'living-wear-v5';
  return material;
}

/** Retune an existing worn material (e.g. different floor height) without changing the program. */
export function wearVariant<M extends T.MeshStandardMaterial>(source: M, o: WearOptions, owned: T.Material[]): M {
  const m = source.clone() as M;
  const base = source.userData.wear as Record<string, {value: number}> | undefined;
  applyWear(m, {
    floorY: o.floorY ?? base?.uFloor.value, silt: o.silt ?? base?.uSilt.value, grime: o.grime ?? base?.uGrime.value,
    bio: o.bio ?? base?.uBio.value, rust: o.rust ?? base?.uRust.value, antiTile: o.antiTile ?? base?.uAnti.value, wet: o.wet ?? base?.uWet.value,
  });
  owned.push(m);
  return m;
}

/**
 * Diffuse-only practicals beyond the shadowed/forward rig (living-render fills them each frame).
 * Each light is clipped to its own space box, so without shadow maps it still cannot leak through
 * a bulkhead into the next room. Wall lamps carry an aim (xyz) and a back-face cut (w).
 */
export const LIVING_STATIC_MAX = 16;
export const LIVING_STATIC = {
  uSLCount: {value: 0},
  uSLPos: {value: Array.from({length: LIVING_STATIC_MAX}, () => new T.Vector4())},
  uSLCol: {value: Array.from({length: LIVING_STATIC_MAX}, () => new T.Vector3())},
  uSLDir: {value: Array.from({length: LIVING_STATIC_MAX}, () => new T.Vector4())},
  uSLMin: {value: Array.from({length: LIVING_STATIC_MAX}, () => new T.Vector3())},
  uSLMax: {value: Array.from({length: LIVING_STATIC_MAX}, () => new T.Vector3())},
};
const STATIC_GLSL = /* glsl */`
uniform int uSLCount; uniform vec4 uSLPos[${LIVING_STATIC_MAX}], uSLDir[${LIVING_STATIC_MAX}]; uniform vec3 uSLCol[${LIVING_STATIC_MAX}], uSLMin[${LIVING_STATIC_MAX}], uSLMax[${LIVING_STATIC_MAX}];
vec3 livingStatic(vec3 p, vec3 n){
 vec3 acc = vec3(0.);
 for (int i = 0; i < ${LIVING_STATIC_MAX}; i++) {
  if (i >= uSLCount) break;
  vec3 inside = step(uSLMin[i], p) * step(p, uSLMax[i]);
  if (inside.x * inside.y * inside.z < .5) continue;
  vec3 l = uSLPos[i].xyz - p; float d = length(l); vec3 ln = l / max(d, 1e-3);
  float win = 1. - pow(min(d / uSLPos[i].w, 1.), 4.); win *= win;
  // w in (0, 2): wall lamp back-face cut; w >= 2: spot cone with cos(half-angle) = w - 2.
  float cw = dot(-ln, uSLDir[i].xyz);
  float aim = uSLDir[i].w >= 2. ? smoothstep(uSLDir[i].w - 2.1, uSLDir[i].w - 1.97, cw) : uSLDir[i].w > 0. ? smoothstep(-uSLDir[i].w, .6, cw) : 1.;
  acc += uSLCol[i] * (max(dot(n, ln), 0.) * win * aim / pow(max(d, .4), 1.8));
 }
 return acc;
}`;
const STATIC_APPLY = `
 { vec3 slN = normalize((vec4(normal, 0.) * viewMatrix).xyz);
   vec3 slIrr = livingStatic(vSLWorld, slN);
   reflectedLight.directDiffuse += slIrr * BRDF_Lambert(material.diffuseContribution);
   reflectedLight.directSpecular += slIrr * material.specularColorBlended * (.18 * (1. - material.roughness * .7)); }
 #include <lights_fragment_end>`;
function patchStatic(shader: T.WebGLProgramParametersWithUniforms, worldExpr: string | null) {
  Object.assign(shader.uniforms, LIVING_STATIC);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSLWorld;');
  shader.vertexShader = worldExpr ? shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vSLWorld = ${worldExpr};`)
    : shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
 { vec4 slP = vec4(transformed, 1.);
   #ifdef USE_INSTANCING
   slP = instanceMatrix * slP;
   #endif
   vSLWorld = (modelMatrix * slP).xyz; }`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSLWorld;\n' + STATIC_GLSL)
    .replace('#include <lights_fragment_end>', STATIC_APPLY);
}
/** Adds the static practical term to a standard/physical material (chains an existing onBeforeCompile). */
export function withStaticLights<M extends T.Material>(material: M, key = 'std'): M {
  if (material.userData.livingStatic) return material;
  const prev = material.onBeforeCompile.bind(material), prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = (sh, r) => { prev(sh, r); patchStatic(sh, null); };
  material.customProgramCacheKey = () => `${prevKey}|living-static-${key}`;
  material.userData.livingStatic = true; material.needsUpdate = true;
  return material;
}

/** Medium extinction for lamp lenses (written by living-render each frame). */
export const LIVING_LENS = {sigma: {value: .06}, gain: {value: 1}};

/**
 * Emergency lamp lens. Opts out of FogExp2 (whose squared falloff erases a lens beyond ~25 m) and is
 * attenuated by single-path extinction instead, so distant fixtures stay readable as anchors.
 */
export function lensMaterial(color: string, emissive: string, intensity: number) {
  const m = new T.MeshStandardMaterial({color, emissive, emissiveIntensity: intensity, roughness: .4, fog: false});
  m.onBeforeCompile = sh => {
    sh.uniforms.uLensSigma = LIVING_LENS.sigma; sh.uniforms.uLensGain = LIVING_LENS.gain;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLensSigma, uLensGain;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= uLensGain * exp(-uLensSigma * .55 * length(vViewPosition));');
  };
  m.customProgramCacheKey = () => 'living-lens-v2';
  return m;
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, color = true) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d')!);
  const t = new T.CanvasTexture(canvas); t.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t;
}

/**
 * Ceiling stain atlas: 4×4 cells (rgb = stain colour, alpha = coverage). Rows: tide-ring water
 * stains, leak blooms with a drip centre, mould speckle, edge-wicked rust / faint discolouration.
 */
let STAIN_ATLAS: T.CanvasTexture | null = null;
function stainAtlas() {
  if (STAIN_ATLAS) return STAIN_ATLAS;
  let seed = 4421; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const blob = (c: CanvasRenderingContext2D, x: number, y: number, rad: number, wob: number) => {
    const n = 48, ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      const k = 1 + wob * (.5 * Math.sin(a * 2 + ph[0]) + .3 * Math.sin(a * 5 + ph[1]) + .2 * Math.sin(a * 11 + ph[2]));
      const px = x + Math.cos(a) * rad * k, py = y + Math.sin(a) * rad * k * (.75 + r() * .02);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  };
  STAIN_ATLAS = canvasTexture(1024, 1024, c => {
    c.clearRect(0, 0, 1024, 1024);
    for (let cell = 0; cell < 16; cell++) {
      const x0 = (cell % 4) * 256, y0 = Math.floor(cell / 4) * 256, row = Math.floor(cell / 4);
      c.save(); c.beginPath(); c.rect(x0 + 3, y0 + 3, 250, 250); c.clip();
      const cx = x0 + 70 + r() * 116, cy = y0 + 70 + r() * 116;
      if (row === 0) {
        // Nested tide rings: pale wet body, dark mineral fringe at each dried edge.
        const rings = 2 + Math.floor(r() * 3);
        for (let k = 0; k < rings; k++) {
          const rad = (40 + r() * 70) * (1 - k * .22);
          blob(c, cx + (r() - .5) * 30, cy + (r() - .5) * 30, rad, .22 + r() * .2);
          c.fillStyle = `rgba(118,90,52,${.16 + r() * .08})`; c.fill();
          c.lineWidth = 2 + r() * 4; c.strokeStyle = `rgba(72,46,22,${.45 + r() * .25})`; c.stroke();
        }
      } else if (row === 1) {
        // Leak bloom: rust halo, darker wet core, a drip point stained near-black.
        const rad = 50 + r() * 60;
        const g = c.createRadialGradient(cx, cy, 2, cx, cy, rad);
        g.addColorStop(0, 'rgba(40,26,14,.85)'); g.addColorStop(.18, 'rgba(70,44,22,.6)'); g.addColorStop(.7, 'rgba(110,74,38,.35)'); g.addColorStop(1, 'rgba(110,74,38,0)');
        blob(c, cx, cy, rad, .3); c.fillStyle = g; c.fill();
        c.lineWidth = 2.5; c.strokeStyle = 'rgba(66,40,18,.55)'; c.stroke();
        for (let i = 0; i < 5; i++) { const a = r() * 6.28, l = rad * (.6 + r() * .8); c.lineWidth = 1 + r() * 3; c.strokeStyle = `rgba(80,52,26,${.2 + r() * .2})`; c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + Math.cos(a + .4) * l * .5, cy + Math.sin(a + .4) * l * .5, cx + Math.cos(a) * l, cy + Math.sin(a) * l); c.stroke(); }
        c.fillStyle = 'rgba(20,14,8,.9)'; c.beginPath(); c.arc(cx, cy, 4 + r() * 5, 0, 6.28); c.fill();
      } else if (row === 2) {
        // Mould colonies: clustered dark green-black dots with a faint halo.
        for (let k = 0; k < 3; k++) {
          const mx = cx + (r() - .5) * 120, my = cy + (r() - .5) * 120, spread = 20 + r() * 50;
          const g = c.createRadialGradient(mx, my, 0, mx, my, spread * 1.6);
          g.addColorStop(0, 'rgba(46,52,30,.4)'); g.addColorStop(1, 'rgba(46,52,30,0)');
          c.fillStyle = g; c.fillRect(mx - spread * 2, my - spread * 2, spread * 4, spread * 4);
          for (let i = 0; i < 260; i++) {
            const a = r() * 6.28, d = spread * Math.sqrt(-Math.log(1 - r() * .98)) * .6;
            c.fillStyle = `rgba(${18 + r() * 20 | 0},${24 + r() * 18 | 0},${12 + r() * 10 | 0},${.4 + r() * .5})`;
            c.beginPath(); c.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, .8 + r() * 2.6, 0, 6.28); c.fill();
          }
        }
      } else {
        // Wicked in from a T-bar edge (rust off the grid) or a broad faint yellowing.
        if (cell % 2 === 0) {
          const g = c.createLinearGradient(x0, 0, x0 + 90 + r() * 80, 0);
          g.addColorStop(0, 'rgba(92,54,24,.75)'); g.addColorStop(.5, 'rgba(110,72,36,.35)'); g.addColorStop(1, 'rgba(110,72,36,0)');
          blob(c, x0, cy, 80 + r() * 60, .35); c.fillStyle = g; c.fill();
          c.lineWidth = 2; c.strokeStyle = 'rgba(70,42,18,.35)'; c.stroke();
        } else {
          blob(c, cx, cy, 90 + r() * 30, .4); c.fillStyle = `rgba(128,108,64,${.22 + r() * .1})`; c.fill();
        }
      }
      c.restore();
    }
  });
  STAIN_ATLAS.wrapS = STAIN_ATLAS.wrapT = T.ClampToEdgeWrapping;
  return STAIN_ATLAS;
}

/**
 * Per-tile ceiling variation on top of applyWear: each 1.2 m world cell (aligned with the T-bar
 * grid) gets its own tone and, often, one or two stains from the atlas with a random 90° turn,
 * mirror, scale and offset, so neighbouring tiles never repeat the same mark.
 */
export function withCeilingStains<M extends T.MeshStandardMaterial>(material: M, density = .5): M {
  const prev = material.onBeforeCompile.bind(material), prevKey = material.customProgramCacheKey();
  const atlas = stainAtlas();
  material.onBeforeCompile = (sh, rr) => {
    prev(sh, rr);
    sh.uniforms.uStainAtlas = {value: atlas}; sh.uniforms.uStainDensity = {value: density};
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uStainAtlas; uniform float uStainDensity;
vec4 lcHash(vec2 p){vec4 q=fract(vec4(p.xyxy)*vec4(.1031,.1030,.0973,.1099));q+=dot(q,q.wzxy+33.33);return fract((q.xxyz+q.yzzw)*q.zywx);}
vec4 lcStain(vec2 uv,vec4 h,float v){
 uv-=.5;float rot=floor(h.z*4.);
 uv=rot<1.?uv:rot<2.?vec2(-uv.y,uv.x):rot<3.?-uv:vec2(uv.y,-uv.x);
 if(h.w>.5)uv.x=-uv.x;
 float s=mix(.62,1.15,fract(h.w*7.3));uv=uv/s+.5+(vec2(fract(h.z*13.1),fract(h.w*5.7))-.5)*.35;
 if(any(lessThan(uv,vec2(.006)))||any(greaterThan(uv,vec2(.994))))return vec4(0.);
 vec2 cell=vec2(mod(v,4.),floor(v/4.));
 return texture2D(uStainAtlas,(cell+uv)*.25);
}`)
      .replace('diffuseColor.rgb=lwBase;', `diffuseColor.rgb=lwBase;
 if(lwN.y<-.5){
  vec2 lcC=floor(vLWorld.xz/1.2),lcUv=fract(vLWorld.xz/1.2);
  vec4 h1=lcHash(lcC),h2=lcHash(lcC+17.31);
  diffuseColor.rgb*=mix(vec3(.84,.82,.78),vec3(1.07,1.05,1.),h1.x)*(h2.y<.12?vec3(.93,.9,.74):vec3(1.));
  if(h1.y<uStainDensity){vec4 st=lcStain(lcUv,h1,floor(fract(h1.y*97.)*16.));diffuseColor.rgb=mix(diffuseColor.rgb,st.rgb*1.05,st.a);}
  if(h2.x<uStainDensity*.35){vec4 st=lcStain(lcUv,h2,floor(fract(h2.z*61.)*16.));diffuseColor.rgb=mix(diffuseColor.rgb,st.rgb,st.a*.8);}
 }`);
  };
  material.customProgramCacheKey = () => `${prevKey}|ceil-stain-v1`;
  material.needsUpdate = true;
  return material;
}

export function createLivingMaterials() {
  const owned: T.Material[] = [], textures: T.Texture[] = [], loads: Promise<void>[] = [];
  const loader = new T.TextureLoader();
  const scanCache = new Map<string, Scan>();
  const placeholder = (rgb: string) => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d')!; x.fillStyle = rgb; x.fillRect(0, 0, 4, 4); return c; };
  const flat = {diff: placeholder('#808080'), nor_gl: placeholder('#8080ff'), rough: placeholder('#d0d0d0')} as Record<string, HTMLCanvasElement>;
  function scan(id: string, url = (ch: string) => `/assets/deepsea/living/pbr/${id}_${ch}_1k.jpg`): Scan {
    const hit = scanCache.get(id); if (hit) return hit;
    const one = (channel: string) => {
      const t = new T.Texture(flat[channel]);
      t.name = `living.${id}.${channel}`; t.colorSpace = channel === 'diff' ? T.SRGBColorSpace : T.NoColorSpace;
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.userData.dependents = [] as T.Texture[];
      loads.push(loader.loadAsync(url(channel)).then(img => {
        (t as {image: unknown}).image = img.image; t.needsUpdate = true;
        for (const d of t.userData.dependents as T.Texture[]) d.needsUpdate = true;
        img.dispose();
      }).catch(e => console.warn('living scan failed', id, channel, e)));
      textures.push(t); return t;
    };
    const s = {map: one('diff'), normalMap: one('nor_gl'), roughnessMap: one('rough')};
    scanCache.set(id, s); return s;
  }
  /** Scan textures at a given physical tile size in metres (clones share the GPU source). */
  function scaled(s: Scan, metres: number): Scan {
    const c = (t: T.Texture) => { const k = t.clone(); k.repeat.set(1 / metres, 1 / metres); (t.userData.dependents as T.Texture[] | undefined)?.push(k); textures.push(k); return k; };
    return {map: c(s.map), normalMap: c(s.normalMap), roughnessMap: c(s.roughnessMap)};
  }
  function std(name: string, s: Scan | null, metres: number, p: T.MeshStandardMaterialParameters & {normal?: number}, wear?: WearOptions) {
    const maps = s ? scaled(s, metres) : null;
    const {normal, ...rest} = p;
    const m = new T.MeshStandardMaterial({...(maps ?? {}), ...rest});
    if (maps) m.normalScale.set(normal ?? 1, normal ?? 1);
    m.name = `living.${name}`;
    if (wear) applyWear(m, wear); else withStaticLights(m);
    owned.push(m); return m;
  }

  const harborPaint = scan('rusty_metal_sheet', ch => `/assets/deepsea/pbr/rusty_metal_sheet_${ch}_2k.jpg`);
  const harborDeck = scan('metal_plate', ch => `/assets/deepsea/pbr/metal_plate_${ch}_2k.jpg`);

  // Acoustic ceiling tiles (1.2 m), 4×4 per texture so stains never repeat tile to tile.
  const ceilingMap = canvasTexture(1024, 1024, c => {
    let seed = 913; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const v = 158 + Math.round(r() * 10), x0 = tx * 256, y0 = ty * 256;
      c.fillStyle = `rgb(${v},${v - 4},${v - 16})`; c.fillRect(x0, y0, 256, 256);
      for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(50,48,40,${.2 + r() * .35})`; c.fillRect(x0 + r() * 256, y0 + r() * 256, 1.4, 1.4); }
      c.strokeStyle = 'rgba(30,30,26,.9)'; c.lineWidth = 5; c.strokeRect(x0 + 2, y0 + 2, 252, 252);
    }
  });
  ceilingMap.repeat.set(1 / 4.8, 1 / 4.8); textures.push(ceilingMap);

  // Bed linen / gown stains: tide lines and biofilm blotches.
  const linenMap = canvasTexture(512, 512, c => {
    c.fillStyle = '#d9d4c4'; c.fillRect(0, 0, 512, 512);
    let seed = 71; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 26; i++) {
      const x = r() * 512, y = r() * 512, rad = 20 + r() * 120;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() > .5 ? '120,104,70' : '86,96,70';
      g.addColorStop(0, `rgba(${tone},.28)`); g.addColorStop(.75, `rgba(${tone},.18)`); g.addColorStop(.86, `rgba(${tone},.45)`); g.addColorStop(1, `rgba(${tone},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
    }
    for (let y = 0; y < 512; y += 3) { c.fillStyle = `rgba(0,0,0,${.02 + (y % 6 ? 0 : .02)})`; c.fillRect(0, y, 512, 1); }
  });
  textures.push(linenMap);

  // Printed forms and memos: header bar, ruled text lines, water rings (≈1 sheet per 0.25 m of world UV).
  const paperMap = canvasTexture(512, 512, c => {
    let seed = 517; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * 256, y0 = ty * 256;
      c.fillStyle = `rgb(${226 - r() * 18 | 0},${220 - r() * 18 | 0},${200 - r() * 20 | 0})`; c.fillRect(x0, y0, 256, 256);
      c.fillStyle = r() < .5 ? 'rgba(40,60,80,.75)' : 'rgba(120,40,30,.6)'; c.fillRect(x0 + 18, y0 + 16, 120 + r() * 80, 14);
      for (let y = y0 + 44; y < y0 + 240; y += 9) {
        if (r() < .12) continue;
        c.fillStyle = `rgba(30,30,40,${.35 + r() * .3})`; c.fillRect(x0 + 18, y, 60 + r() * 160, 3);
      }
      if (r() < .6) { c.strokeStyle = 'rgba(110,80,40,.35)'; c.lineWidth = 6; c.beginPath(); c.arc(x0 + 60 + r() * 140, y0 + 60 + r() * 140, 20 + r() * 30, 0, 6.28); c.stroke(); }
    }
  });
  paperMap.repeat.set(2.4, 2.4); paperMap.anisotropy = 16; textures.push(paperMap);

  // Interior glazing (6 m tile): faint tint, clustered water spots, drip streaks and one crack star.
  // Alpha = film coverage; the paired roughness map keeps clean glass glossy and the film matte.
  const glassGrime = (() => {
    let seed = 2207; const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const S = 1024, film: [number, number, number, number, number][] = [], drips: [number, number, number, number][] = [];
    for (let c = 0; c < 14; c++) {
      const cx = r() * S, cy = r() * S, spread = 40 + r() * 120;
      for (let i = 0; i < 30; i++) film.push([cx + (r() - .5) * spread * 2, cy + (r() - .5) * spread * 1.4, 3 + r() * r() * 34, .05 + r() * .14, r()]);
    }
    for (let i = 0; i < 60; i++) drips.push([r() * S, r() * S * .7, 40 + r() * 300, 1 + r() * 3]);
    const cracks: [number, number][][] = [];
    for (const [cx, cy] of [[330, 610]] as const) for (let k = 0; k < 7; k++) {
      let x = cx, y = cy, a = k / 7 * 6.28 + r() * .6; const line: [number, number][] = [[x, y]];
      for (let s = 0; s < 4 + r() * 6; s++) { a += (r() - .5) * .7; const l = 8 + r() * 26; x += Math.cos(a) * l; y += Math.sin(a) * l; line.push([x, y]); }
      cracks.push(line);
    }
    const paint = (c: CanvasRenderingContext2D, rough: boolean) => {
      c.fillStyle = rough ? 'rgb(84,84,84)' : 'rgba(22,32,30,.12)'; c.fillRect(0, 0, S, S);
      for (const [x, y, rad, a, tone] of film) {
        const g = c.createRadialGradient(x, y, rad * .15, x, y, rad);
        const col = rough ? '190,190,190' : tone > .5 ? '78,74,56' : '58,70,60';
        g.addColorStop(0, `rgba(${col},${a * .6})`); g.addColorStop(.85, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      }
      for (const [x, y, len, w] of drips) {
        const g = c.createLinearGradient(x, y, x, y + len);
        const col = rough ? '170,170,170' : '70,66,50';
        g.addColorStop(0, `rgba(${col},.35)`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(x, y, w, len);
      }
      c.lineCap = 'round';
      for (const line of cracks) {
        c.strokeStyle = rough ? 'rgb(80,80,80)' : 'rgba(150,166,160,.3)'; c.lineWidth = 1.1;
        c.beginPath(); line.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
      }
    };
    const map = canvasTexture(S, S, c => paint(c, false)), rough = canvasTexture(S, S, c => paint(c, true), false);
    for (const t of [map, rough]) { t.repeat.set(1 / 6, 1 / 6); textures.push(t); }
    return {map, rough};
  })();

  const carpetScan = scan('dirty_carpet'), veneerScan = scan('smoked_walnut_veneer');
  const wallTileScan = scan('dirty_tiles'), floorTileScan = scan('worn_tile_floor');
  const concreteScan = scan('concrete_floor_worn_001'), leatherScan = scan('leather_white'), indScan = scan('rusty_painted_metal');
  // Environment set (env-pbr/SOURCES.md): greyscale albedos so material.color is the paint colour.
  const env = (id: string, diff = id) => scan(`env.${id}`, ch => `/assets/deepsea/env-pbr/${ch === 'diff' ? diff : id}_${ch}_1k.jpg`);
  const panelScan = env('blue_metal_plate', 'panel_gray'), paintScan = env('green_metal_rust', 'paint_gray');
  const deckScan = env('metal_plate_02'), treadScan = env('metal_grate_rusty'), rubberScan = env('rubber_tiles'), rustScan = env('rusty_metal_02');
  RUST_MAP.value = rustScan.map;

  const m = {
    carpet: std('carpet', carpetScan, 1.4, {color: '#5f574c', roughness: 1, metalness: 0, normal: .9}, {silt: .8, grime: .5, bio: .35}),
    carpetRed: std('carpet-red', carpetScan, 1.4, {color: '#5e3a31', roughness: 1, metalness: 0, normal: .9}, {silt: .8, grime: .5, bio: .35}),
    /** Residential bulkhead: welded painted steel panels (key kept for compatibility; no more wallpaper). */
    wallpaper: std('bulkhead', panelScan, 2.6, {color: '#8e9a93', roughness: .78, metalness: .42, normal: 1.1}, {silt: .4, grime: .75, bio: .35, rust: .45, antiTile: 0, wet: 0.55}),
    /** Remaining wood trim, waterlogged and blackened. */
    veneer: std('veneer-soaked', veneerScan, 1.3, {color: '#3e342d', roughness: .62, metalness: 0, normal: 1.2}, {silt: .6, grime: .7, bio: .5, wet: 0.3}),
    wallTile: std('wall-tile', wallTileScan, 1.5, {color: '#b1ab9e', roughness: .8, metalness: 0, normal: .9}, {silt: .45, grime: .75, bio: .55, rust: .35, antiTile: 0, wet: 0.6}),
    floorTile: std('floor-tile', floorTileScan, 1.6, {color: '#8f8a7e', roughness: .95, metalness: 0, normal: 1}, {silt: .7, grime: .35, bio: .35, antiTile: 0, wet: 0.95}),
    /** Rubber deck tiles (key kept: corridors and security floor). */
    linoleum: std('rubber-deck', rubberScan, 1.8, {color: '#5b5f5b', roughness: .92, metalness: 0, normal: 1}, {silt: .7, grime: .35, bio: .3, antiTile: 0, wet: 0.8}),
    concrete: std('concrete', concreteScan, 2.6, {color: '#85837a', roughness: 1, metalness: 0, normal: 1}, {silt: .8, grime: .5, bio: .4, wet: 0.6}),
    padded: std('padded', leatherScan, .9, {color: '#7d7563', roughness: .7, metalness: 0, normal: .8}, {silt: .35, grime: .7, bio: .5}),
    padTeal: std('padded-teal', leatherScan, .9, {color: '#4b625d', roughness: .7, metalness: 0, normal: .8}, {silt: .35, grime: .7, bio: .5}),
    indSteel: std('ind-steel', indScan, 2.2, {color: '#8e968e', roughness: 1, metalness: .4, normal: 1}, {silt: .6, grime: .65, bio: .3, rust: .65, wet: 0.6}),
    indGreen: std('ind-green', paintScan, 1.6, {color: '#6c8476', roughness: .85, metalness: .4, normal: 1}, {silt: .6, grime: .6, bio: .3, rust: .55, wet: 0.5}),
    rustSheet: std('rust-sheet', harborPaint, 2, {color: '#8b9187', roughness: 1, metalness: .4, normal: .8}, {silt: .6, grime: .5, bio: .25, rust: .6, wet: 0.4}),
    plate: std('plate', deckScan, 1.6, {color: '#8f928c', roughness: .9, metalness: .6, normal: 1}, {silt: .75, grime: .4, bio: .25, rust: .35, antiTile: 0, wet: 0.95}),
    frame: std('frame', deckScan, 1.5, {color: '#525a57', roughness: .85, metalness: .6, normal: .8}, {silt: .55, grime: .45, bio: .25, rust: .6, antiTile: 0, wet: 0.45}),
    ceiling: withCeilingStains(std('ceiling', null, 1, {map: ceilingMap, color: '#9d9a90', roughness: .97, metalness: 0}, {silt: .2, grime: .25, bio: .55, antiTile: 0})),
    /** Dark painted steel (rails, seams, bezels). */
    trim: std('trim', paintScan, .9, {color: '#3f4542', roughness: .7, metalness: .5, normal: .8}, {silt: .6, grime: .35, bio: .3, rust: .5, wet: 0.4}),
    brass: std('brass', null, 1, {color: '#7a5e36', roughness: .5, metalness: 1}, {silt: .55, grime: .3, bio: .5, rust: .25, wet: 0.3}),
    chrome: std('chrome', paintScan, .6, {color: '#9a9d9b', roughness: .45, metalness: 1, normal: .4}, {silt: .5, grime: .3, bio: .4, rust: .3, wet: 0.3}),
    rubber: std('rubber', rubberScan, .8, {color: '#1e201f', roughness: .88, metalness: 0, normal: .5}, {silt: .6, grime: .1, bio: .2, antiTile: 0, wet: 0.5}),
    porcelain: std('porcelain', null, 1, {color: '#bdbab0', roughness: .32, metalness: 0}, {silt: .7, grime: .6, bio: .6, wet: 0.4}),
    /** Painted bulkhead variants (same panel scan, different paint). */
    paintDark: std('paint-dark', panelScan, 2.6, {color: '#46524d', roughness: .8, metalness: .45, normal: 1.1}, {silt: .45, grime: .7, bio: .35, rust: .5, antiTile: 0, wet: 0.55}),
    // Matte emulsion over steel: the coaxial headlamp burns a white disc into anything glossier or lighter.
    paintCream: std('paint-cream', panelScan, 2.6, {color: '#7f7a6a', roughness: 1, metalness: .08, normal: 1.1}, {silt: .4, grime: .85, bio: .4, rust: .45, antiTile: 0, wet: 0.12}),
    paintSecurity: std('paint-security', panelScan, 2.6, {color: '#5f6d63', roughness: .8, metalness: .42, normal: 1.1}, {silt: .4, grime: .75, bio: .35, rust: .5, antiTile: 0, wet: 0.55}),
    /** Chipped painted steel for furniture, cabinets, lockers. */
    steel: std('steel-paint', paintScan, 1.2, {color: '#76807a', roughness: .78, metalness: .45, normal: 1}, {silt: .6, grime: .5, bio: .3, rust: .45, wet: 0.4}),
    tread: std('tread', treadScan, 1.2, {color: '#7d7a72', roughness: .85, metalness: .6, normal: 1}, {silt: .6, grime: .4, bio: .25, rust: .55, antiTile: 0, wet: 0.85}),
    seal: std('seal', rubberScan, .5, {color: '#171918', roughness: .7, metalness: 0, normal: .4}, {silt: .4, grime: .1, bio: .3, antiTile: 0, wet: 0.5}),
    hazard: std('hazard', null, 1, {map: canvasTexture(256, 64, c => {
      for (let i = -2; i < 10; i++) { c.fillStyle = i % 2 ? '#141414' : '#c49a2c'; c.beginPath(); c.moveTo(i * 32, 64); c.lineTo(i * 32 + 32, 64); c.lineTo(i * 32 + 64, 0); c.lineTo(i * 32 + 32, 0); c.fill(); }
    }), roughness: .8, metalness: .2}, {silt: .5, grime: .6, bio: .3, rust: .5, antiTile: 0}),
    linen: new T.MeshPhysicalMaterial({map: linenMap, color: '#d2cbb8', roughness: .95, metalness: 0, side: T.DoubleSide, sheen: .5, sheenColor: new T.Color('#e8e2d0'), sheenRoughness: .8}),
    plantDead: std('plant-dead', null, 1, {color: '#3a3020', roughness: .9, metalness: 0, side: T.DoubleSide}),
    soil: std('soil', concreteScan, 1, {color: '#2e261c', roughness: 1, metalness: 0}, {silt: .9, grime: 0, bio: .5, wet: 0.3}),
    darkGlass: new T.MeshPhysicalMaterial({color: '#0d1414', roughness: .08, metalness: .1, clearcoat: 1, clearcoatRoughness: .05}),
    screenDead: new T.MeshStandardMaterial({color: '#0b1210', roughness: .18, metalness: .2, emissive: '#0c2a26', emissiveIntensity: .25}),
    blastGlass: new T.MeshPhysicalMaterial({
      color: '#d8ece8', metalness: 0, roughness: .04, transmission: 1, thickness: .35, ior: 1.52,
      attenuationColor: new T.Color('#7fb0a6'), attenuationDistance: 3.2, specularIntensity: 1, clearcoat: .6, clearcoatRoughness: .08,
      side: T.FrontSide,
    }),
    /** Interior glass: low-albedo tint, film/spots/cracks only catch the lamp where they are (FrontSide: one veil, not two). */
    glassSoft: new T.MeshStandardMaterial({
      map: glassGrime.map, roughnessMap: glassGrime.rough, color: '#c8d4d0', metalness: 0, roughness: 1,
      transparent: true, opacity: .85, depthWrite: false, side: T.FrontSide, envMapIntensity: .6,
    }),
    lampWarm: lensMaterial('#ffe0b0', '#ffbf73', 3.2),
    lampCyan: lensMaterial('#cdeeea', '#86d2c8', 3.2),
    lampRed: lensMaterial('#ffb0a0', '#ff3a26', 3.6),
    lampAmber: lensMaterial('#ffd29a', '#ff9628', 3.4),
    lampBlue: lensMaterial('#cfe4f2', '#7ab6dc', 3.2),
    lampOff: new T.MeshStandardMaterial({color: '#5a5c58', roughness: .35, metalness: .2}),
    bandRed: std('band-red', null, 1, {color: '#8e2a20', roughness: .7, metalness: .1}, {silt: .4, grime: .3, bio: .3}),
    bandYellow: std('band-yellow', null, 1, {color: '#b38a22', roughness: .7, metalness: .1}, {silt: .4, grime: .3, bio: .3}),
    bandBlue: std('band-blue', null, 1, {color: '#245a86', roughness: .7, metalness: .1}, {silt: .4, grime: .3, bio: .3}),
    pipe: std('pipe', harborPaint, 1.2, {color: '#6f766f', roughness: 1, metalness: .5, normal: .6}, {silt: .7, grime: .4, bio: .35, rust: .6, wet: 0.5}),
    corpseCloth: std('corpse-cloth', null, 1, {color: '#3c4a52', roughness: .95, metalness: 0}, {silt: .6, grime: .2, bio: .4}),
    corpseSkin: new T.MeshPhysicalMaterial({color: '#8d8f82', roughness: .7, metalness: 0, sheen: .4, sheenColor: new T.Color('#c4c8b4'), sheenRoughness: .6}),
    paper: new T.MeshStandardMaterial({map: paperMap, color: '#c2bba6', roughness: .95, metalness: 0}),
    /** Personal effects (jackets, towels, gloves): neutral cloth, per-instance colour supplies the dye. */
    fabric: std('fabric', null, 1, {map: linenMap, color: '#a49f94', roughness: .96, metalness: 0}, {silt: .55, grime: .55, bio: .45}),
    /** Moulded plastic (hard hats, lunch boxes, radios, jugs): per-instance colour. */
    plastic: std('plastic', null, 1, {color: '#a9a397', roughness: .42, metalness: 0}, {silt: .55, grime: .45, bio: .35, wet: .35}),
    /** Contaminant gel: low-chroma olive / yellow-green body (stays olive under amber light), wet clear-coat glints. */
    slime: new T.MeshPhysicalMaterial({color: '#11160f', roughness: .42, metalness: 0, clearcoat: .4, clearcoatRoughness: .14, sheen: .2, sheenColor: new T.Color('#3e4c3a'), sheenRoughness: .6, emissive: '#0a120b', emissiveIntensity: .3}),
  };
  for (const k of ['linen', 'darkGlass', 'screenDead', 'blastGlass', 'glassSoft', 'lampWarm', 'lampCyan', 'lampRed', 'lampAmber', 'lampBlue', 'lampOff', 'corpseSkin', 'paper', 'slime'] as const) { m[k].name = `living.${k}`; owned.push(m[k]); }
  m.blastGlass.toneMapped = true;
  for (const k of ['linen', 'darkGlass', 'screenDead', 'glassSoft', 'lampOff', 'corpseSkin', 'paper', 'slime'] as const) withStaticLights(m[k]);
  m.hazard.map!.wrapS = T.RepeatWrapping;

  const ready = Promise.all(loads).then(() => undefined);
  let disposed = false;
  return {
    ...m, ready, owned,
    dispose() {
      if (disposed) return; disposed = true;
      owned.forEach(x => x.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
export type LivingMaterials = ReturnType<typeof createLivingMaterials>;
