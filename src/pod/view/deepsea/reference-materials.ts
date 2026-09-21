import {
  DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter,
  MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, Vector2,
} from 'three';

export interface ReferenceMaterials {
  hull: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  yellow: MeshStandardMaterial;
  red: MeshStandardMaterial;
  cloth: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  label: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  dispose(): void;
}

type Finish = 'paint' | 'steel' | 'neoprene' | 'weave' | 'deck';
type Maps = { map: DataTexture; roughnessMap: DataTexture; normalMap: DataTexture };
const SIZE = 512;
const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (v: number, size: number) => ((v % size) + size) % size;

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + 173, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Periodic value noise: both the surface and its normal derivatives tile. */
function noise(u: number, v: number, nx: number, ny: number, seed: number): number {
  const x = u * nx, y = v * ny;
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = smooth(0, 1, x - ix), ty = smooth(0, 1, y - iy);
  const at = (a: number, b: number) => hash(wrap(a, nx), wrap(b, ny), seed);
  return mix(mix(at(ix, iy), at(ix + 1, iy), tx),
    mix(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
}

function texture(data: Uint8Array, name: string, color = false): DataTexture {
  const result = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  result.name = `reference.${name}`;
  result.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  result.wrapS = result.wrapT = RepeatWrapping;
  result.magFilter = LinearFilter;
  result.minFilter = LinearMipmapLinearFilter;
  result.generateMipmaps = true;
  result.anisotropy = 4;
  result.flipY = false;
  result.needsUpdate = true;
  return result;
}

/** Neutral albedo modulation leaves the pigment in material.color (sRGB input).
 * No baked cyan illumination, AO, seams or bolts: those belong to lighting/geometry.
 * Five shared triplets cost 15 MiB CPU / ~20 MiB GPU including mipmaps.
 */
function bake(finish: Finish, seed: number): Maps {
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const roughness = new Uint8Array(albedo.length);
  const normals = new Uint8Array(albedo.length);
  const heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const grain = hash(x, y, seed) - 0.5;
    const macro = noise(u, v, 5, 5, seed);
    const meso = noise(u, v, 23, 23, seed + 31);
    const streak = noise(u, v, 47, 3, seed + 73);
    const damp = smooth(0.36, 0.78, macro * 0.72 + meso * 0.28);
    const dirt = smooth(0.57, 0.86, macro * 0.45 + streak * 0.55);
    let value = 1, rough = 0.5, height = 0;

    if (finish === 'paint') {
      // Pass 2: 70% less chip strength; clean panels read through broad wet sheen.
      const chip = 0.3 * smooth(0.76, 0.9, meso) * smooth(0.64, 0.83,
        noise(u, v, 113, 113, seed + 17));
      const wet = smooth(0.22, 0.82, noise(u, v, 3, 3, seed + 97));
      const peel = noise(u, v, 137, 137, seed + 19) - 0.5;
      value = 0.989 - dirt * 0.03 - chip * 0.57 + grain * 0.004;
      rough = 0.49 - wet * 0.29 + dirt * 0.045 + chip * 0.25 + grain * 0.008;
      height = peel * 0.045 + grain * 0.008 - chip * 0.48;
    } else if (finish === 'steel') {
      const brush = noise(u, v, 4, 211, seed + 19) - 0.5;
      value = 0.94 + brush * 0.055 - dirt * 0.08 + grain * 0.012;
      rough = 0.34 + brush * 0.08 - damp * 0.13 + dirt * 0.16;
      height = brush * 0.075 + grain * 0.015;
    } else if (finish === 'neoprene') {
      const pores = smooth(0.64, 0.91, hash(x, y, seed + 19));
      value = 0.93 + grain * 0.055 - damp * 0.065;
      rough = 0.81 - damp * 0.24 + grain * 0.045;
      height = grain * 0.09 - pores * 0.07;
    } else if (finish === 'weave') {
      // Four-pixel yarn period survives close inspection, mipmaps suppress distant moire.
      const warp = Math.cos(TAU * u * 128);
      const weft = Math.cos(TAU * v * 128);
      const crossing = Math.sin(TAU * u * 64) * Math.sin(TAU * v * 64);
      const yarn = (warp + weft) * 0.5;
      // Nearly uniform diffuse cloth: folds come from the drape geometry.
      // Keep the shared modulation near white; dyed-fiber reflectance lives in color.
      value = 0.997 + yarn * 0.002 + grain * 0.001 - dirt * 0.002;
      rough = 0.94 - damp * 0.025 + yarn * 0.006;
      height = yarn * 0.022 + crossing * 0.006 + grain * 0.003;
    } else {
      // Fine mineral-filled non-slip coating, not oversized checker-plate geometry.
      const grit = noise(u, v, 173, 173, seed + 19);
      const scuff = smooth(0.63, 0.88, noise(u, v, 3, 83, seed + 23));
      value = 0.90 + grain * 0.032 - dirt * 0.12 + scuff * 0.045;
      rough = 0.78 - damp * 0.38 - scuff * 0.12 + grain * 0.035;
      height = (grit - 0.5) * 0.23 + grain * 0.055;
    }
    const pixel = y * SIZE + x, i = pixel * 4;
    const c = Math.round(clamp(value) * 255);
    const r = Math.round(clamp(rough) * 255);
    albedo[i] = albedo[i + 1] = albedo[i + 2] = c;
    roughness[i] = roughness[i + 1] = roughness[i + 2] = r;
    albedo[i + 3] = roughness[i + 3] = 255;
    heights[pixel] = height;
  }
  const at = (x: number, y: number) => heights[wrap(y, SIZE) * SIZE + wrap(x, SIZE)];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    // DataTexture row order follows +V; encode OpenGL tangent-space +Y.
    const dx = (at(x - 1, y) - at(x + 1, y)) * 1.6;
    const dy = (at(x, y - 1) - at(x, y + 1)) * 1.6;
    const length = Math.hypot(dx, dy, 1), i = (y * SIZE + x) * 4;
    normals[i] = Math.round((dx / length * 0.5 + 0.5) * 255);
    normals[i + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
    normals[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    normals[i + 3] = 255;
  }
  return {
    map: texture(albedo, `${finish}.albedo`, true),
    roughnessMap: texture(roughness, `${finish}.roughness`),
    normalMap: texture(normals, `${finish}.normal`),
  };
}

/** Call once per scene; entirely CPU based and safe without document/window/WebGL.
 * UV convention: one tile per panel or ~0.5–1 m of fabric; set physical scale in
 * geometry UVs, since hull/yellow/label and red/cloth deliberately share textures.
 * Colors assume a broad-spectrum key/fill: no PBR pigment can recover wavelengths
 * absent from monochromatic blue light. Avoid compensating with emissive paint.
 */
export function createReferenceMaterials(): ReferenceMaterials {
  const paint = bake('paint', 101), steelMaps = bake('steel', 211);
  const neoprene = bake('neoprene', 307), weave = bake('weave', 401);
  const deck = bake('deck', 503);
  const hull = new MeshPhysicalMaterial({
    ...paint, color: '#e5e3d7', metalness: 0, roughness: 1,
    normalScale: new Vector2(0.32, 0.32),
    clearcoat: 0.28, clearcoatRoughness: 0.65, clearcoatRoughnessMap: paint.roughnessMap,
  });
  const yellow = new MeshPhysicalMaterial({
    ...paint, color: '#ffb52b', metalness: 0, roughness: 0.91,
    normalScale: new Vector2(0.3, 0.3),
    clearcoat: 0.24, clearcoatRoughness: 0.6, clearcoatRoughnessMap: paint.roughnessMap,
  });
  const steel = new MeshStandardMaterial({
    ...steelMaps, color: '#afb7b7', metalness: 0.94, roughness: 1,
    normalScale: new Vector2(0.26, 0.26), envMapIntensity: 1,
  });
  const rubber = new MeshStandardMaterial({
    ...neoprene, color: '#181b1c', metalness: 0, roughness: 1,
    normalScale: new Vector2(0.48, 0.48),
  });
  const red = new MeshPhysicalMaterial({
    // Warm scarlet nylon with a modest fiber lobe, not a dark velvet sheen.
    ...weave, color: '#ff2010', metalness: 0, roughness: 0.74,
    normalScale: new Vector2(0.35, 0.35), side: DoubleSide,
    sheen: 0.06, sheenColor: '#ff3820', sheenRoughness: 0.8,
  });
  const cloth = new MeshPhysicalMaterial({
    ...weave, color: '#cdd0ce', metalness: 0, roughness: 1,
    normalScale: new Vector2(0.1, 0.1), side: DoubleSide,
    sheen: 0.12, sheenColor: '#e2e3df', sheenRoughness: 1,
  });
  const floor = new MeshStandardMaterial({
    ...deck, color: '#555d5b', metalness: 0.05, roughness: 1,
    normalScale: new Vector2(0.62, 0.62),
  });
  // Neutral stock for geometry/decal lettering; no baked illegible pseudo-text.
  const label = new MeshStandardMaterial({
    ...paint, color: '#eeead9', metalness: 0, roughness: 1,
    normalScale: new Vector2(0.08, 0.08),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const glass = new MeshPhysicalMaterial({
    color: '#f5faf8', metalness: 0, roughness: 0.085,
    transmission: 0.94, thickness: 0.012, ior: 1.46,
    attenuationColor: '#c4ded5', attenuationDistance: 2.5,
    // Physical transmission keeps opaque depth handling; use closed pane geometry.
    transparent: false, opacity: 1,
  });
  const materials = { hull, steel, rubber, yellow, red, cloth, floor, label, glass };
  for (const [key, material] of Object.entries(materials)) material.name = `reference.${key}`;
  const textures = [paint, steelMaps, neoprene, weave, deck].flatMap(m => Object.values(m));
  let disposed = false;
  return {
    ...materials,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of Object.values(materials)) material.dispose();
      for (const map of textures) map.dispose();
    },
  };
}
