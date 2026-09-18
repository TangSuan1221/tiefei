/** 独立模型预览使用导出布局碰撞；不替代正式游戏 PodRun 的状态。 */
import { Box3, Ray, Vector3 } from 'three';

export interface PreviewLayout {
  bounds: { min: number[]; max: number[] };
  corridor: { min: number[]; max: number[] };
  walls: { min: number[]; max: number[] }[];
  obstacles: { min: number[]; max: number[] }[];
}

export function createPreviewCollision(layout: PreviewLayout, radius = .85) {
  const box = (record: { min: number[]; max: number[] }) => {
    if (record.min.length !== 3 || record.max.length !== 3
      || [...record.min, ...record.max].some(value => !Number.isFinite(value))
      || record.min.some((value, i) => value >= record.max[i]!)) throw new Error('首关布局包含无效边界');
    return new Box3(new Vector3().fromArray(record.min), new Vector3().fromArray(record.max));
  };
  const hall = box(layout.bounds);
  const corridor = box(layout.corridor);
  // The rear entrance and far end of the preview corridor do not connect to a world.
  hall.max.z -= radius;
  corridor.min.z += radius;
  const solids = [...layout.walls, ...layout.obstacles].map(record => box(record).expandByScalar(radius));
  const direction = new Vector3();
  const hit = new Vector3();
  const ray = new Ray();
  return (from: Vector3, to: Vector3): boolean => {
    if (![...from.toArray(), ...to.toArray()].every(Number.isFinite)) return false;
    if (!hall.containsPoint(to) && !corridor.containsPoint(to)) return false;
    direction.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-8) return true;
    ray.set(from, direction.divideScalar(length));
    for (const solid of solids) {
      if (solid.containsPoint(from) || solid.containsPoint(to)) return false;
      if (ray.intersectBox(solid, hit) && hit.distanceTo(from) <= length + 1e-6) return false;
    }
    return true;
  };
}
