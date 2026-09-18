/** 明确加载本地 Blender 导出资产；不猜测在线资源，也不改变模拟状态。 */
import { Box3, Group, Mesh, Texture, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { setDeepseaAssetFactory } from './assets';
import type { RoomGeometry } from '../roomview';

export interface LoadedBlenderRoom {
  root: Group;
  bounds: Box3;
  objects: number;
  install(nodeId: string, validate: (geometry: RoomGeometry) => boolean): void;
  dispose(): void;
}

export async function loadBlenderRoom(url: string): Promise<LoadedBlenderRoom> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Blender 模型加载失败：HTTP ${response.status}`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL('.', new URL(url, location.href)).href);
  const root = gltf.scene;
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  let objects = 0;
  root.traverse(object => {
    objects++;
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (/^(col_|COL_|int_|spawn_|trigger_)/.test(object.name)) object.visible = false;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty() || ![bounds.min.x, bounds.max.x, bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z].every(Number.isFinite)) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    throw new Error('Blender 模型没有有效的空间边界。');
  }
  let disposed = false;
  return {
    root, bounds, objects,
    install(nodeId, validate) {
      if (disposed) throw new Error('模型已释放');
      setDeepseaAssetFactory(({ geometry }) => {
        if (disposed || geometry.nodeId !== nodeId || !validate(geometry)) return null;
        const instance = root.clone(true);
        return {
          root: instance, replaceRoom: true,
          dispose: () => { instance.clear(); },
        };
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      setDeepseaAssetFactory(null);
      root.clear();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
