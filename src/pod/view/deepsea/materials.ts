import {
  DataTexture, DoubleSide, LinearMipmapLinearFilter, MeshStandardMaterial,
  RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2,
} from 'three';
import type { RoomQuad } from '../roomview';

export interface DeepseaMaterials {
  forQuad(quad: RoomQuad): MeshStandardMaterial;
  dispose(): void;
}

type Surface = 'hull' | 'floor' | 'cargo' | 'machinery';
const SIZE = 256;
const TAU = Math.PI * 2;
const saturate = (v: number) => Math.max(0, Math.min(1, v));
const noise = (x: number, y: number) => {
  let h = Math.imul(x + 319, 374761393) ^ Math.imul(y + 971, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const wrap = (n: number, size: number) => ((n % size) + size) % size;
function field(u: number, v: number, cells: number): number {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = x - ix, sy = y - iy;
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  const n = (a: number, b: number) => noise(wrap(a, cells), wrap(b, cells));
  const top = n(ix, iy) * (1 - tx) + n(ix + 1, iy) * tx;
  const bottom = n(ix, iy + 1) * (1 - tx) + n(ix + 1, iy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** 每个渲染器只烘一次。法线、粗糙度和颜色共享腐蚀分布，绝不每帧造纹理。 */
function bake(surface: Surface): { color: DataTexture; normal: DataTexture; rough: DataTexture } {
  const color = new Uint8Array(SIZE * SIZE * 4);
  const normal = new Uint8Array(color.length);
  const rough = new Uint8Array(color.length);
  const heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE;
    const v = y / SIZE;
    const grain = noise(x, y);
    const islands = field(u, v, 5) * 0.62 + field(u, v, 13) * 0.26 + field(u, v, 31) * 0.12;
    const rust = saturate((islands - 0.52) * 1.6);
    const seam = Math.min(x, SIZE - x, y, SIZE - y) < 2 ? 1 : 0;
    const weld = Math.min(x, SIZE - x, y, SIZE - y) < 4 ? 1 : 0;
    let detail = 0;
    if (surface === 'floor') {
      // 低对比、宽圆角防滑压纹。旧的高频双对角条纹在远处产生强烈摩尔纹。
      detail = Math.pow(Math.max(0, Math.cos(TAU * (u + v) * 5)), 4) * 0.065
        + Math.pow(Math.max(0, Math.cos(TAU * (u - v) * 5)), 4) * 0.035;
    } else if (surface === 'cargo') {
      // 冲压钢箱为平整板面，接缝由几何表达，避免看起来像木箱条纹。
      detail = field(u, v, 17) * 0.035;
    } else if (surface === 'machinery') {
      detail = Math.pow(Math.max(0, Math.cos(TAU * v * 4)), 18) * 0.5;
    }
    const boltX = Math.min(Math.abs(x - 11), Math.abs(x - (SIZE - 11)));
    const boltY = Math.min(Math.abs(y - 11), Math.abs(y - (SIZE - 11)));
    const bolt = Math.hypot(boltX, boltY) < 2.7 ? 0.5 : 0;
    heights[y * SIZE + x] = grain * 0.025 + rust * 0.08 + weld * 0.04 - seam * 0.1 + detail + bolt * .3;
    const base = surface === 'cargo' ? [73, 83, 81] : surface === 'floor' ? [63, 73, 72] : [82, 95, 96];
    const gain = (0.91 + grain * 0.1) * (1 - seam * 0.18) * (1 - rust * 0.12);
    const i = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) color[i + c] = (base[c] * (1 - rust * 0.5) + [85, 62, 43][c] * rust * 0.5) * gain;
    color[i + 3] = 255;
    const r = Math.round(255 * (0.64 + rust * 0.28 + grain * 0.05));
    rough[i] = rough[i + 1] = rough[i + 2] = r;
    rough[i + 3] = 255;
  }
  const heightAt = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * 2.3;
    const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * 2.3;
    const length = Math.hypot(dx, dy, 1);
    const i = (y * SIZE + x) * 4;
    normal[i] = (dx / length * 0.5 + 0.5) * 255;
    normal[i + 1] = (dy / length * 0.5 + 0.5) * 255;
    normal[i + 2] = (1 / length * 0.5 + 0.5) * 255;
    normal[i + 3] = 255;
  }
  const texture = (data: Uint8Array) => {
    const t = new DataTexture(data, SIZE, SIZE, RGBAFormat);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };
  const result = { color: texture(color), normal: texture(normal), rough: texture(rough) };
  result.color.colorSpace = SRGBColorSpace;
  return result;
}

export function createMaterials(): DeepseaMaterials {
  const textures: DataTexture[] = [];
  const materials = new Map<Surface, MeshStandardMaterial>();
  for (const surface of ['hull', 'floor', 'cargo', 'machinery'] as const) {
    const maps = bake(surface);
    textures.push(maps.color, maps.normal, maps.rough);
    const m = new MeshStandardMaterial({
      map: maps.color, normalMap: maps.normal, roughnessMap: maps.rough,
      roughness: 1, metalness: surface === 'cargo' ? 0.22 : 0.4,
      normalScale: new Vector2(surface === 'floor' ? .18 : .38, surface === 'floor' ? .18 : .38), side: DoubleSide,
    });
    m.name = `deepsea.${surface}`;
    // 大尺度腐蚀在世界坐标中连续取样，不随2.4米瓦片重复，也不跨门洞拉伸UV。
    m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 seaSurfaceWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nseaSurfaceWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 seaSurfaceWorld;
        float seaHash(vec3 p) {
          p = fract(p * .1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float seaNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3. - 2. * f);
          return mix(mix(mix(seaHash(i), seaHash(i+vec3(1,0,0)), f.x),
                         mix(seaHash(i+vec3(0,1,0)), seaHash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(seaHash(i+vec3(0,0,1)), seaHash(i+vec3(1,0,1)), f.x),
                         mix(seaHash(i+vec3(0,1,1)), seaHash(i+vec3(1,1,1)), f.x), f.y), f.z);
        }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float seaMacro = seaNoise(seaSurfaceWorld * .31 + 7.3) * .7
                         + seaNoise(seaSurfaceWorld * 1.17 + 31.7) * .3;
          float seaOxide = smoothstep(.44, .79, seaMacro);
          diffuseColor.rgb *= mix(vec3(.84,.93,.94), vec3(.74,.70,.60), seaOxide);
        `);
    };
    m.customProgramCacheKey = () => 'deepsea.world-corrosion.v1';
    materials.set(surface, m);
  }
  return {
    forQuad(q) {
      const surface: Surface = q.kind === 'floor' || q.obstacle === 'grate' ? 'floor'
        : q.obstacle === 'crate' ? 'cargo' : q.kind === 'obstacle' ? 'machinery' : 'hull';
      return materials.get(surface)!;
    },
    dispose() {
      for (const material of materials.values()) material.dispose();
      for (const texture of textures) texture.dispose();
      materials.clear();
    },
  };
}
