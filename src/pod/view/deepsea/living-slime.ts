import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ALEX_MARKS} from '../../content/living-deck-layout';
import {Batcher, rng} from './living-build';
import type {LivingMaterials} from './living-materials';
import {addRim, fbm, field, normalTexture, pixelTexture, smooth, taperedTube} from './living-actor-tex';

/** Slime volume in M (x 164..176, floor −3, ceiling .6), centred on the cocoon. */
const X0 = 164.35, X1 = 175.65, Z0 = -32, Z1 = 4, FLOOR = -3, CEIL = .6;
const PI = Math.PI;
/** Inner wall faces of the M corridor (pipes sit just in front of the east face). */
const WALL_E = 175.69, WALL_W = 164.31;

export interface SlimeBuild {
  root: T.Group;
  /** Low-saturation sickly glow; lives outside the culled space group so the light count never changes. */
  light: T.PointLight;
  solids: T.Box3[];
  update(slime: number, time: number, dt: number, near: boolean): void;
  dispose(): void;
}

/** Gel palette: low-saturation yellow-green → amber. No magenta anywhere. */
const GEL_DEEP: [number, number, number] = [46, 44, 20], GEL_MID: [number, number, number] = [92, 88, 40], GEL_AMBER: [number, number, number] = [110, 82, 34];
/** Wall sheets: greyed olive where thin (wall reads through), dull amber-brown where thick. */
const SHEET_THIN: [number, number, number] = [104, 104, 76], SHEET_THICK: [number, number, number] = [70, 62, 36];
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface DecalSet {map: T.Texture; alpha: T.Texture; normal: T.Texture; emissive: T.Texture; height?: T.Texture}

/**
 * Floor puddle: domain-warped fBm thresholded into an irregular blob with satellite droplets, raised
 * meniscus at the edge (normal map), bubbles inside. Emissive only on the thin rim and the bubbles.
 */
function puddleSet(seed: number, S = 320): DecalSet {
  const h = field(S, (u, v) => fbm(u, v, 4, 5, seed));
  const warp = field(S, (u, v) => fbm(u, v, 3, 3, seed + 50));
  const r = rng(seed);
  const drops = Array.from({length: 26}, () => { const a = r() * PI * 2, d = .3 + r() * .17; return [.5 + Math.cos(a) * d, .5 + Math.sin(a) * d, .006 + r() * .02]; });
  const bubbles = Array.from({length: 40}, () => [.2 + r() * .6, .2 + r() * .6, .002 + r() * .006]);
  const A = new Float32Array(S * S), E = new Float32Array(S * S), H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, u = x / S, v = y / S;
    const d = Math.hypot(u - .5, v - .5) / .42 + (warp[i] - .5) * .9 + (h[i] - .5) * .35;
    let a = 1 - smooth(.78, .86, d);
    for (const [dx, dy, dr] of drops) a = Math.max(a, 1 - smooth(dr * .7, dr, Math.hypot(u - dx, v - dy)));
    let b = 0;
    for (const [bx, by, br] of bubbles) { const q = Math.hypot(u - bx, v - by); b = Math.max(b, smooth(br, br * .6, q) * (1 - smooth(br * .4, br * .1, q) * .7)); }
    // thin film in the middle (carpet shows through), thicker meniscus at the edge; rim glow only in broken patches
    const film = .5 + h[i] * .25 + (a * (1 - a) * 4) * .3;
    A[i] = a * Math.min(1, film); H[i] = a * (.55 + h[i] * .45) + b * .25;
    E[i] = (a * (1 - a) * 4) ** 3 * smooth(.45, .7, warp[i]) * .7 + b * a * .15;
  }
  const map = pixelTexture(S, (_x, _y, i) => { const c = mix3(mix3(GEL_DEEP, GEL_MID, h[i]), GEL_AMBER, smooth(.55, .9, warp[i]) * .6); return [c[0], c[1], c[2], 255]; }, true, false);
  const alpha = pixelTexture(S, (_x, _y, i) => { const g = A[i] * 255; return [g, g, g, 255]; }, false, false);
  const emissive = pixelTexture(S, (_x, _y, i) => { const g = Math.min(1, E[i]) * 255; return [g, g, g, 255]; }, false, false);
  // gel body height (vertex displacement): smoothed so the subdivided plane does not step
  const Hs = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let acc = 0, n = 0;
    for (let k = -4; k <= 4; k += 2) for (let l = -4; l <= 4; l += 2) { const xx = Math.min(S - 1, Math.max(0, x + k)), yy = Math.min(S - 1, Math.max(0, y + l)); acc += A[yy * S + xx] * (.6 + h[yy * S + xx] * .4); n++; }
    Hs[y * S + x] = acc / n;
  }
  const height = pixelTexture(S, (_x, _y, i) => { const g = Math.min(1, Hs[i]) * 255; return [g, g, g, 255]; }, false, false);
  return {map, alpha, normal: normalTexture(H, S, 5, false), emissive, height};
}

/** Normal map from a non-square height field (canvas space, v down). */
function normalFrom(H: Float32Array, W: number, Hh: number, k: number) {
  return pixelTexture(W, (x, y) => {
    const s = (a: number, b: number) => H[Math.min(Hh - 1, Math.max(0, b)) * W + Math.min(W - 1, Math.max(0, a))];
    const dx = (s(x + 1, y) - s(x - 1, y)) * k, dy = (s(x, y + 1) - s(x, y - 1)) * k;
    const nv = new T.Vector3(-dx, dy, 1).normalize();
    return [(nv.x * .5 + .5) * 255, (nv.y * .5 + .5) * 255, (nv.z * .5 + .5) * 255, 255];
  }, false, false, Hh);
}

/**
 * Wall sheet: a thick ragged band along the top that runs down under gravity in narrowing streaks ending in
 * teardrop bulbs. The alpha channel is gel thickness (0 bare wall → 1 thick core), so a rising cut-off
 * shrinks the sheet toward its cores. `sample(u, v)` returns the same thickness for vertex displacement.
 */
function sheetSet(seed: number, W = 256, Hh = 512): DecalSet & {sample(u: number, v: number): number} {
  const r = rng(seed);
  const streaks = Array.from({length: 13}, () => ({x: .05 + r() * .9, w: .018 + r() * .04, L: .35 + r() * .62, ph: r() * 9, f: 3 + r() * 6}));
  const bubbles = Array.from({length: 70}, () => [r(), r() * .6, .003 + r() * .007]);
  const E = new Float32Array(W * Hh), H = new Float32Array(W * Hh), N = new Float32Array(W * Hh);
  const band = .12 + r() * .1;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, u = x / W, v = y / Hh;                 // v: 0 top → 1 bottom (canvas space)
    const n = fbm(u, v * (Hh / W) * .5, 4, 5, seed), n2 = fbm(u * 3, v * 6, 4, 3, seed + 7);
    // top band: thick, lumpy, with a ragged lower edge; fades out at the sheet's side edges
    const side = smooth(0, .12, u) * smooth(1, .88, u);
    let h = (1 - smooth(band * .6, band + .05, v + (n - .5) * .2)) * (.55 + .45 * n2) * (.4 + .6 * side);
    for (const s of streaks) {
      if (v > s.L + s.w * 4) continue;
      const t = Math.min(1, v / s.L), cx = s.x + Math.sin(v * s.f + s.ph) * .015 + (n - .5) * .025;
      const w = s.w * (1 - .6 * t) * (.8 + n * .4), d = Math.abs(u - cx) / w;
      // rounded cross-section (thick ridge in the middle), fades just before the bulb
      const core = d < 1 ? Math.sqrt(1 - d * d) : 0;
      h = Math.max(h, core * (.65 + .35 * n2) * (1 - smooth(s.L - .015, s.L + .004, v)));
      const tw = s.w * .55, dy = (v - s.L) * (Hh / W);
      const bulb = Math.hypot((u - cx) / tw, dy > 0 ? dy / (tw * 1.15) : dy / (tw * 3.4));
      h = Math.max(h, (1 - smooth(.55, 1, bulb)) * .95);
    }
    // thin translucent film between streaks (wall still shows through it), broken by fbm
    const filmA = smooth(.5, .62, n) * (1 - smooth(.4, .95, v)) * .22 * side;
    h = Math.max(h, filmA);
    let b = 0;
    for (const [bx, by, br] of bubbles) { const q = Math.hypot((u - bx) * (W / Hh), v - by); if (q < br) b = Math.max(b, 1 - q / br); }
    // glow only on the thin rim of the streaks/band (not on the inter-streak film) and in bubbles
    const edge = h > .015 && h < .16 && h > filmA ? 1 - h / .16 : 0;
    H[i] = Math.min(1, h); N[i] = n2;
    E[i] = edge * edge * .8 + (b > 0 && h > .25 ? b * .6 : 0);
  }
  const map = pixelTexture(W, (_x, _y, i) => {
    const t = H[i], c = mix3(mix3(SHEET_THIN, SHEET_THICK, smooth(.15, .9, t)), GEL_AMBER, smooth(.5, .85, N[i]) * .4);
    return [c[0], c[1], c[2], 255];
  }, true, false, Hh);
  const alpha = pixelTexture(W, (_x, _y, i) => { const g = H[i] * 255; return [g, g, g, 255]; }, false, false, Hh);
  const emissive = pixelTexture(W, (_x, _y, i) => { const g = Math.min(1, E[i]) * 255; return [g, g, g, 255]; }, false, false, Hh);
  const sample = (u: number, v: number) => H[Math.min(Hh - 1, Math.max(0, Math.round(v * (Hh - 1)))) * W + Math.min(W - 1, Math.max(0, Math.round(u * (W - 1))))];
  return {map, alpha, normal: normalFrom(H, W, Hh, 6), emissive, sample};
}

/** Hanging membrane: thin film with fibrous ribs along v, torn holes and a ragged free edge (v → 1). */
function membraneSet(seed: number, W = 256, Hh = 256) {
  const H = new Float32Array(W * Hh), A = new Float32Array(W * Hh), E = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, u = x / W, v = y / Hh;
    const n = fbm(u, v, 4, 5, seed), ribs = Math.pow(Math.abs(Math.sin((u + fbm(u, v, 2, 3, seed + 3) * .25) * 38)), 12);
    const torn = smooth(.6, .66, fbm(u, v, 6, 4, seed + 9));
    const free = 1 - smooth(.78, .95, v + (n - .5) * .35);          // ragged lower edge
    const side = smooth(0, .08, u) * smooth(1, .92, u);
    const a = (.26 + .22 * n + ribs * .4) * (1 - torn) * free * side;
    A[i] = Math.min(1, a); H[i] = ribs * .6 + n * .4;
    const rim = Math.max(torn * (1 - torn) * 4, free * (1 - free) * 4);
    E[i] = rim ** 2 * .7 * (a > .05 ? 1 : 0);
  }
  return {
    alpha: pixelTexture(W, (_x, _y, i) => { const g = A[i] * 255; return [g, g, g, 255]; }, false, false, Hh),
    emissive: pixelTexture(W, (_x, _y, i) => { const g = Math.min(1, E[i]) * 255; return [g, g, g, 255]; }, false, false, Hh),
    normal: normalFrom(H, W, Hh, 3),
  };
}

/** Alpha = alphaMap · smoothstep(cut, cut + .1, alphaMap): raising `cut` recedes the gel toward its thickest parts. */
function recedes<M extends T.MeshPhysicalMaterial>(mat: M, cut: {value: number}): M {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCut = cut;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCut;')
      .replace('#include <alphamap_fragment>', '#ifdef USE_ALPHAMAP\n  float amK = texture2D(alphaMap, vAlphaMapUv).g;\n  diffuseColor.a *= amK * smoothstep(uCut, uCut + .1, amK);\n#endif');
  };
  mat.customProgramCacheKey = () => 'living-slime-recedes';
  return mat;
}

export function buildSlime(m: LivingMaterials, parent: T.Group): SlimeBuild {
  const owned: {dispose(): void}[] = [];
  const root = new T.Group(); root.name = 'living-slime'; parent.add(root);
  const [cx, , cz] = ALEX_MARKS.cocoon;
  const r = rng(77);

  // ---------------------------------------------------------------- colour-banded service pipes along the M east wall
  const pipes = new Batcher('living-m-pipes');
  const ys = [.25, -.15, -.55], bandMats = [m.bandRed, m.bandYellow, m.bandBlue], px = 175.45;
  ys.forEach((y, i) => {
    pipes.rod([px, y, -39.5], [px, y, 41.5], .14, m.pipe, 14);
    for (let z = -39; z < 41.5; z += 3) pipes.rod([px, y, z], [px, y, z + .45], .152, bandMats[i], 14);
  });
  for (let z = -38; z < 41; z += 2.4) { pipes.box([px + .12, -.15, z], [.08, 1.1, .1], m.frame); for (const y of ys) pipes.ring([px, y, z], [0, 0, 1], .16, .02, m.frame, 12); }
  pipes.build(root);
  const solids = [new T.Box3(new T.Vector3(px - .17, -.75, -40), new T.Vector3(175.7, .45, 42))];

  // ---------------------------------------------------------------- materials
  const gel = new T.MeshPhysicalMaterial({
    name: 'living.slime.gel', color: '#4f4c22', roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .06,
    transmission: .35, thickness: .06, ior: 1.36, attenuationColor: new T.Color('#3a3612'), attenuationDistance: .12,
    emissive: '#000000', specularIntensity: 1,
  });
  const gelRim = addRim(gel, '#9aa548', 3.2, .28);
  owned.push(gel);
  const decalMat = (d: DecalSet, order: number, extra: Partial<T.MeshPhysicalMaterialParameters> = {}) => {
    const mat = new T.MeshPhysicalMaterial({
      map: d.map, alphaMap: d.alpha, normalMap: d.normal, normalScale: new T.Vector2(.9, .9), emissiveMap: d.emissive, emissive: '#a7b04e', emissiveIntensity: .25,
      roughness: .07, metalness: 0, clearcoat: 1, clearcoatRoughness: .04, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -2 - order, ...extra,
    });
    owned.push(mat); return mat;
  };

  // ---------------------------------------------------------------- floor puddles (decals with noise alpha + wet highlight)
  const puddles = [puddleSet(3), puddleSet(8), puddleSet(13)];
  puddles.forEach(p => owned.push(p.map, p.alpha, p.normal, p.emissive, p.height!));
  // Raised gel pools (displaced, 1–4 cm proud of the deck) rather than flat discs; satin, not mirror.
  const floorMats = puddles.map((p, i) => decalMat(p, i % 3, {
    displacementMap: p.height, displacementScale: .04, roughness: .2, clearcoatRoughness: .14, normalScale: new T.Vector2(.7, .7),
  }));
  const floorGeo = new T.PlaneGeometry(1, 1, 72, 72); floorGeo.rotateX(-PI / 2); owned.push(floorGeo);
  const floorDecals: {o: T.Mesh; sx: number; sz: number}[] = [];
  const addPuddle = (x: number, z: number, s: number, k: number) => {
    const o = new T.Mesh(floorGeo, floorMats[k % 3]);
    o.position.set(T.MathUtils.clamp(x, X0 + s * .3, X1 - s * .3), FLOOR + .006 + k * .0015, z);
    o.rotation.y = r() * PI * 2; o.scale.set(s * (.8 + r() * .5), 1, s * (.8 + r() * .5)); o.renderOrder = 2 + (k % 3); o.receiveShadow = true;
    root.add(o); floorDecals.push({o, sx: o.scale.x, sz: o.scale.z});
  };
  for (let i = 0; i < 9; i++) { const a = r() * PI * 2, d = .8 + r() * 3.5; addPuddle(cx + Math.cos(a) * d * .7, cz + Math.sin(a) * d * 1.4, 1.2 + r() * 2.2, i); }
  for (let z = cz - 13; z < cz + 13; z += 1.7 + r() * 1.5) addPuddle(X1 - .4 - r() * .4, z, .9 + r() * 1.3, Math.floor(r() * 3));   // where wall flows pool
  for (let i = 0; i < 5; i++) addPuddle(X0 + 1 + r() * 9, Z0 + r() * (Z1 - Z0), .8 + r() * 1.4, i + 1);

  // ---------------------------------------------------------------- wall gel: raised sheets running down under gravity
  // Each sheet is a displaced plane (the gel stands 1–3 cm proud of the wall so the headlamp catches its
  // edges) with a thickness map as alpha. As the feed shuts (slime → 0) the cut-off on that thickness rises:
  // thin edges and streak tips go first and the sheet sinks toward its thick core, then drops away.
  const sheets = [sheetSet(5), sheetSet(17), sheetSet(29)];
  sheets.forEach(p => owned.push(p.map, p.alpha, p.normal, p.emissive));
  const uCut = {value: .04};
  const sheetMats = sheets.map((p, i) => recedes(decalMat(p, 4 + (i % 2), {
    // continuous wet film: soft broad sheen; high-frequency normal detail + mirror clearcoat read as vertical glitter
    color: '#ffffff', roughness: .24, clearcoat: .7, clearcoatRoughness: .2, specularIntensity: .7, normalScale: new T.Vector2(.55, .55),
    emissive: '#8a9460', emissiveIntensity: .12, transmission: 0, side: T.FrontSide, polygonOffset: false,
  }), uCut));
  const sheetGeos = sheets.map(p => {
    const g = new T.PlaneGeometry(1, 1, 36, 72); g.translate(0, -.5, 0);   // origin at the top edge
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, .004 + p.sample(uv.getX(i), 1 - uv.getY(i)) * .028);
    g.computeVertexNormals(); owned.push(g); return g;
  });
  const wallFlows: {o: T.Mesh; h: number; top: number; face: number}[] = [];
  /** face: +1 = sheet faces +x (west wall inner face / east wall outer face), −1 faces −x. */
  const addSheet = (x: number, face: 1 | -1, z: number, top: number, w: number, h: number) => {
    const k = wallFlows.length % 3, o = new T.Mesh(sheetGeos[k], sheetMats[k]);
    o.position.set(x, top, z); o.rotation.y = face > 0 ? PI / 2 : -PI / 2;
    o.scale.set(w, h, 1); o.renderOrder = 6; o.receiveShadow = true; root.add(o); wallFlows.push({o, h, top, face});
  };
  const DOOR_Z0 = -10.3, DOOR_Z1 = -5.7, PIPE_BOTTOM = -.74;
  const clearOfDoor = (z: number, w: number) => z + w / 2 < DOOR_Z0 || z - w / 2 > DOOR_Z1;
  // M east wall (N side): heavy below the pipe bundle (the gel grows out of the warm yellow-band joints and
  // runs to the floor), thinner above it
  for (let z = cz - 13; z < cz + 13; z += .7 + r() * 1.1) {
    const t = 1 - Math.abs(z - cz) / 14, w = .9 + r() * 1.3;
    if (!clearOfDoor(z, w)) continue;
    addSheet(WALL_E - .002, -1, z, PIPE_BOTTOM + .05 - r() * .1, w, Math.min(2.25, 1.2 + t * 1.2 + r() * .4));
    if (r() < .6) addSheet(WALL_E - .002, -1, z + (r() - .5) * .6, CEIL - .02, .6 + r() * .9, .5 + r() * .6);
  }
  // M west wall (L side): sheets from the ceiling line, longest near the cocoon
  for (let z = cz - 11; z < cz + 11; z += .9 + r() * 1.5) {
    const t = 1 - Math.abs(z - cz) / 12, w = .8 + r() * 1.2;
    if (!clearOfDoor(z, w)) continue;
    addSheet(WALL_W + .002, 1, z, CEIL - .03 - r() * .15, w, 1.3 + t * 1.8 + r() * .5);
  }
  // spilling through the two doorways onto the L and N faces of the same walls
  for (const z of [DOOR_Z0 - .7, DOOR_Z0 - 1.9, DOOR_Z1 + .6, DOOR_Z1 + 1.6]) {
    addSheet(WALL_W - .62, -1, z + (r() - .5) * .3, .3 - r() * .3, .7 + r() * .6, 1.4 + r() * 1.2);
    addSheet(WALL_E + .62, 1, z + (r() - .5) * .3, .3 - r() * .3, .7 + r() * .6, 1.4 + r() * 1.2);
  }

  // ---------------------------------------------------------------- translucent gel membranes (corner webs + veils under the pipes)
  const film = membraneSet(41);
  owned.push(film.alpha, film.normal, film.emissive);
  const filmMat = recedes(new T.MeshPhysicalMaterial({
    name: 'living.slime.film', color: '#6c6e52', roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, specularIntensity: 1,
    transmission: .85, thickness: .006, ior: 1.36, attenuationColor: new T.Color('#5a5832'), attenuationDistance: .1,
    alphaMap: film.alpha, normalMap: film.normal, normalScale: new T.Vector2(.8, .8), emissiveMap: film.emissive, emissive: '#a3a764', emissiveIntensity: .3,
    transparent: true, depthWrite: false, side: T.DoubleSide,
  }), uCut);
  owned.push(filmMat);
  const membranes: {o: T.Mesh; base: T.Vector3}[] = [];
  /** Sheet spanning edge A(u)→edge B(u) (u along z), sagging by `sag` at mid-span; ragged free edge comes from the alpha. */
  const membrane = (a: (u: number) => T.Vector3, b: (u: number) => T.Vector3, sag: number, free = false, nu = 28, nv = 18) => {
    const vMax = free ? 1 : .72;   // only veils use the ragged free-edge band of the texture
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = a(u).lerp(b(u), v);
      p.y -= Math.sin(v * PI) * sag * (.6 + .4 * Math.sin(u * PI)) + fbm(u, v, 3, 2, 17) * .05;
      pos.push(p.x, p.y, p.z); uvs.push(u, 1 - v * vMax);
      if (i < nu && j < nv) { const k = j * (nu + 1) + i; idx.push(k, k + nu + 1, k + 1, k + 1, k + nu + 1, k + nu + 2); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals(); owned.push(g);
    const o = new T.Mesh(g, filmMat); o.renderOrder = 7; root.add(o); membranes.push({o, base: o.position.clone()});
  };
  // wall/ceiling corner webs on both walls
  // west: wall face → ceiling; east: top of the pipe bundle → ceiling (the pipes fill the wall below)
  for (const east of [false, true]) {
    for (let z = cz - 9; z < cz + 9; z += 2.2 + r() * 2.2) {
      const L = 1 + r() * 1.4; if (!clearOfDoor(z + L / 2, L)) continue;
      const down = .5 + r() * .6, out = .5 + r() * .5, sag = .1 + r() * .12;
      if (east) membrane(u => new T.Vector3(px - .06, .43, z + u * L), u => new T.Vector3(px - .06 - out, CEIL - .01, z + u * L), sag * .6);
      else membrane(u => new T.Vector3(WALL_W + .01, CEIL - down * (.7 + .3 * Math.sin(u * PI)), z + u * L), u => new T.Vector3(WALL_W + .01 + out, CEIL - .01, z + u * L), sag);
    }
  }
  // veils hanging from the underside of the pipe bundle, free bottom edge
  for (let z = cz - 7; z < cz + 7; z += 1.6 + r() * 1.8) {
    const L = .8 + r() * 1.1; if (!clearOfDoor(z + L / 2, L)) continue;
    const drop = .5 + r() * .7, ph = r() * 6;
    membrane(u => new T.Vector3(px - .02, PIPE_BOTTOM + .02, z + u * L), u => new T.Vector3(px - .13, PIPE_BOTTOM - drop * (.8 + .2 * Math.sin(u * 7 + ph)), z + u * L), -.04, true);
  }

  // ---------------------------------------------------------------- gel sleeve on the yellow (nutrient) pipe: patchy, sagging lobes underneath
  let coat: T.Mesh;
  {
    const y0 = -.15, zA = cz - 12, zB = cz + 12, NZ = 360, NA = 28;
    const lobes = Array.from({length: 26}, () => ({z: zA + r() * (zB - zA), w: .12 + r() * .25, h: .06 + r() * .16}));
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NZ; i++) {
      const z = zA + (zB - zA) * i / NZ, t = 1 - Math.abs(z - cz) / 12;
      const patch = smooth(.32, .55, fbm(i / NZ, .5, 9, 3, 4) * .6 + t * .55);
      for (let j = 0; j <= NA; j++) {
        const a = j / NA * PI * 2, cy = Math.cos(a), sy = Math.sin(a);   // a=0 → +y up; π → down
        let rad = .143 + patch * (.03 + .045 * fbm(i / NZ, j / NA, 12, 3, 9));
        const down = smooth(.4, 1, -cy);
        for (const l of lobes) rad += down * l.h * patch * Math.exp(-(((z - l.z) / l.w) ** 2) * 2) * (1 - Math.abs(sy) * .6);
        pos.push(-sy * rad * .92, cy * rad, z);                              // local: pipe axis at origin, +x toward the room
        if (i < NZ && j < NA) { const k = i * (NA + 1) + j; idx.push(k, k + NA + 1, k + 1, k + 1, k + NA + 1, k + NA + 2); }
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); owned.push(g);
    coat = new T.Mesh(g, gel); coat.position.set(px, y0, 0); coat.renderOrder = 3; coat.castShadow = true; root.add(coat);
  }

  // ---------------------------------------------------------------- hanging gel strands from the ceiling, and drips (teardrops) under pipe & flows
  const strands: T.Mesh[] = [];
  {
    const groups: T.BufferGeometry[][] = [[], [], []];
    for (let i = 0; i < 36; i++) {
      const near = r() < .7;
      const x = near ? T.MathUtils.clamp(cx + (r() - .2) * 6, X0 + .3, X1 - .3) : X0 + .5 + r() * (X1 - X0 - 1);
      const z = near ? cz + (r() - .5) * 16 : Z0 + r() * (Z1 - Z0);
      const L = .25 + Math.pow(r(), 1.5) * 1.6;
      const pts = [0, .3, .65, 1].map(t => new T.Vector3((r() - .5) * .04 * t, -L * t, (r() - .5) * .04 * t));
      const g = taperedTube(new T.CatmullRomCurve3(pts), 14, .006 + r() * .012, .0025, 6);
      const tip = new T.SphereGeometry(1, 10, 8); tip.scale(.012, .022, .012); tip.translate(pts[3].x, -L - .012, pts[3].z);
      const one = mergeGeometries([g, tip.deleteAttribute('uv')])!; g.dispose(); tip.dispose();
      one.translate(x, 0, z); groups[i % 3].push(one);
    }
    for (const gs of groups) {
      const g = mergeGeometries(gs)!; gs.forEach(x => x.dispose()); owned.push(g);
      const o = new T.Mesh(g, gel); o.position.y = CEIL - .01; o.renderOrder = 3; root.add(o); strands.push(o);
    }
  }
  const dropGeo = (() => {
    const pts: T.Vector2[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; const y = -t; const rr = Math.sin(Math.pow(t, .75) * PI) * (.18 + .82 * t * t) * .5; pts.push(new T.Vector2(Math.max(.0001, rr), y)); }
    const g = new T.LatheGeometry(pts, 12); g.computeVertexNormals(); return g;
  })();
  owned.push(dropGeo);
  const dropSpots: {p: T.Vector3; s: number; ph: number}[] = [];
  for (let z = cz - 10; z < cz + 10; z += .35 + r() * .8) dropSpots.push({p: new T.Vector3(px - .02 - r() * .06, -.15 - .2 - r() * .08, z), s: .03 + r() * .05, ph: r() * 10});
  // pendant drips under the sheets' streak ends (only where the sheet stops above the floor)
  const sheetDrops: {i: number; f: typeof wallFlows[number]; frac: number}[] = [];
  for (const f of wallFlows) {
    if (f.top - f.h < FLOOR + .15) continue;
    for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) {
      const frac = .62 + r() * .36;
      sheetDrops.push({i: dropSpots.length, f, frac});
      dropSpots.push({p: new T.Vector3(f.o.position.x + f.face * .025, f.top - f.h * frac, f.o.position.z + (r() - .5) * f.o.scale.x * .8), s: .025 + r() * .035, ph: r() * 10});
    }
  }
  const drops = new T.InstancedMesh(dropGeo, gel, dropSpots.length); drops.renderOrder = 3; root.add(drops);
  const mtx = new T.Matrix4(), q0 = new T.Quaternion(), sv = new T.Vector3();

  // ---------------------------------------------------------------- suspended slime motes (dim, low-saturation; settle to the floor as slime → 0)
  const N = 9000;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const near = r() < .65;
    const x = near ? cx + (r() - .5) * 11 : X0 + r() * (X1 - X0);
    const z = near ? cz + (r() + r() - 1) * 14 : Z0 + r() * (Z1 - Z0);
    pos.set([T.MathUtils.clamp(x, X0, X1), FLOOR + r() * (CEIL - FLOOR), z], i * 3);
    seed.set([r(), r(), r(), r()], i * 4);
  }
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute('position', new T.BufferAttribute(pos, 3)); pGeo.setAttribute('seed', new T.BufferAttribute(seed, 4));
  pGeo.boundingSphere = new T.Sphere(new T.Vector3(cx, -1, cz), 40);
  const pMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: {uTime: {value: 0}, uSlime: {value: 1}, uFloor: {value: FLOOR}, uPx: {value: 720}},
    vertexShader: `
      attribute vec4 seed; uniform float uTime; uniform float uSlime; uniform float uFloor; uniform float uPx;
      varying vec3 vCol; varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (.08 + seed.x * .12) + seed.y * 40.;
        p.x += sin(t) * .2 + sin(t * .37) * .3;
        p.z += cos(t * .8) * .2;
        p.y += sin(t * .6 + seed.z * 6.) * .12 - fract(uTime * .004 * (1. + seed.w)) * .2;
        float settled = uFloor + .02 + seed.w * .06;
        p.y = mix(settled, p.y, smoothstep(0., 1., uSlime));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        float sz = .006 + seed.z * .014;
        gl_PointSize = clamp(sz * uPx / -mv.z, 1., 5.);
        vCol = mix(vec3(.30, .32, .14), vec3(.36, .27, .11), seed.x);
        vA = (.04 + .5 * uSlime * uSlime) * smoothstep(14., 2., -mv.z) * (.25 + seed.y * .5);
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main() { vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard; gl_FragColor = vec4(vCol * (1. - r) * vA, 1.); }`,
  });
  owned.push(pGeo, pMat);
  const points = new T.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 7; points.raycast = () => {}; root.add(points);

  const light = new T.PointLight('#94a04c', 0, 12, 1.8); light.position.set(cx, -1.6, cz);

  let shown = -1;
  return {
    root, light, solids,
    update(slime, time, _dt, near) {
      const s = T.MathUtils.clamp(slime, 0, 1);
      pMat.uniforms.uTime.value = time; pMat.uniforms.uSlime.value = s;
      if (shown !== s) {
        // cleared: pools drain to thin stained rings; full: thick standing gel
        for (const fm of floorMats) { fm.opacity = .22 + .74 * s; fm.emissiveIntensity = .01 + .11 * s; fm.displacementScale = .004 + .04 * s; }
        for (const f of floorDecals) f.o.scale.set(f.sx * (.6 + .4 * s), 1, f.sz * (.6 + .4 * s));
        // feed shut: wall gel thins from its edges inward, shortens and slides down the wall; films sag and fade
        uCut.value = .04 + .88 * (1 - s);
        // at 0 only sunken dregs of the thickest cores remain low on the walls
        for (const fm of sheetMats) { fm.opacity = .25 + .65 * s; fm.emissiveIntensity = .01 + .11 * s; }
        for (const f of wallFlows) {
          f.o.scale.y = f.h * (.5 + .5 * s);
          f.o.position.y = Math.max(FLOOR + f.o.scale.y * .3, f.top - (1 - s) * .45);
        }
        filmMat.opacity = .2 + .8 * s; filmMat.emissiveIntensity = .03 + .27 * s;
        for (const mb of membranes) { mb.o.position.y = mb.base.y - (1 - s) * .3; mb.o.scale.y = .7 + .3 * s; mb.o.visible = s > .08; }
        for (const d of sheetDrops) dropSpots[d.i].p.y = d.f.o.position.y - d.f.o.scale.y * d.frac;
        for (const st of strands) { st.scale.y = .15 + .85 * s; st.visible = s > .03; }
        coat.scale.set(.96 + .04 * s, .96 + .04 * s, 1); coat.visible = s > .02;
        gelRim.uRim.value = .06 + .24 * s; gel.opacity = 1;
        shown = s;
      }
      // drips: slow stretch → snap back (gravity), never fall onto anything
      drops.visible = s > .05;
      for (let i = 0; i < dropSpots.length; i++) {
        const d = dropSpots[i], c = (time * .12 + d.ph) % 1, k = d.s * (.6 + .4 * s);
        mtx.compose(d.p, q0, sv.set(k * .7, k * (1 + c * 1.6), k * .7)); drops.setMatrixAt(i, mtx);
      }
      drops.instanceMatrix.needsUpdate = true;
      light.intensity = near ? (.6 + 2.2 * s) * (1 + Math.sin(time * .9) * .05) : 0;
    },
    dispose() { owned.forEach(o => o.dispose()); pipes.dispose(); },
  };
}
