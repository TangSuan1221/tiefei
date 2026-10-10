import * as T from 'three';

/** Procedural texture helpers shared by the cocoon, slime, creatures and diver (no external files). */

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise on a `period` lattice. */
function vnoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a: number, b: number) => hash(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable fBm 0..1. (u, v) in 0..1, base frequency `f` (integer for tiling). */
export function fbm(u: number, v: number, f = 4, oct = 5, seed = 1) {
  let s = 0, a = .5, n = 0;
  for (let o = 0; o < oct; o++) { const p = f << o; s += vnoise(u * p, v * p, p, seed + o * 31) * a; n += a; a *= .5; }
  return s / n;
}

/** Fills a float height field (size²) from fn(u, v). */
export function field(size: number, fn: (u: number, v: number) => number) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

/** RGBA texture from a per-pixel function returning [r,g,b,a] 0..255. */
export function pixelTexture(size: number, fn: (x: number, y: number, i: number) => [number, number, number, number], srgb = true, repeat = true, h = size) {
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  const x = c.getContext('2d')!; const img = x.createImageData(size, h);
  for (let py = 0; py < h; py++) for (let px = 0; px < size; px++) {
    const i = py * size + px; const p = fn(px, py, i);
    img.data.set(p, i * 4);
  }
  x.putImageData(img, 0, 0);
  return tex(c, srgb, repeat);
}

/** Tangent-space normal map (OpenGL convention) from a height field. */
export function normalTexture(hgt: Float32Array, size: number, strength = 4, repeat = true) {
  return pixelTexture(size, (x, y) => {
    const s = (a: number, b: number) => hgt[(((b + size) % size) * size) + ((a + size) % size)];
    const dx = (s(x + 1, y) - s(x - 1, y)) * strength, dy = (s(x, y + 1) - s(x, y - 1)) * strength;
    const n = new T.Vector3(-dx, dy, 1).normalize();
    return [(n.x * .5 + .5) * 255, (n.y * .5 + .5) * 255, (n.z * .5 + .5) * 255, 255];
  }, false, repeat);
}

/** Greyscale (r=g=b) data texture from a field, mapped through fn. */
export function greyTexture(hgt: Float32Array, size: number, fn: (v: number) => number = v => v, repeat = true) {
  return pixelTexture(size, (_x, _y, i) => { const g = Math.max(0, Math.min(255, fn(hgt[i]) * 255)); return [g, g, g, 255]; }, false, repeat);
}

/** Tapered tube: radius runs r0 → r1 along the curve (TubeGeometry rings rescaled about the path). */
export function taperedTube(curve: T.Curve<T.Vector3>, segs: number, r0: number, r1: number, radial = 5, keepUv = false) {
  const g = new T.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.getAttribute('position'), c = new T.Vector3(), p = new T.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = r0 + (r1 - r0) * t * t * (3 - 2 * t) + Math.sin(t * 23 + r0 * 900) * r0 * .12;
    curve.getPointAt(t, c);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, p.x, p.y, p.z); }
  }
  if (!keepUv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Adds a view-dependent rim (fresnel) term to any MeshStandard/Physical material's emissive output, so
 * silhouettes separate from dark fog even when unlit. `uRim` is shared so callers can animate it.
 */
export function addRim(mat: T.MeshStandardMaterial, color: T.ColorRepresentation, power = 2.5, strength = .6) {
  const uRimColor = {value: new T.Color(color)}, uRim = {value: strength}, uRimPow = {value: power};
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    Object.assign(shader.uniforms, {uRimColor, uRim, uRimPow});
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRim; uniform float uRimPow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float fr = pow(1. - clamp(abs(dot(normalize(vViewPosition), normal)), 0., 1.), uRimPow); totalEmissiveRadiance += uRimColor * fr * uRim; }`);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|rim`;
  return {uRimColor, uRim, uRimPow};
}
