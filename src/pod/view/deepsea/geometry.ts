import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import type { Volume, VolumeNode } from '../../gen/volume';
import type { RoomGeometry, RoomQuad } from '../roomview';
import { toThree } from './camera';
import type { DeepseaMaterials } from './materials';

/** 无量化、无只计数量的缓存键：原地移动箱子、门位置/相邻节点变化都使缓存失效。 */
export function roomSourceSignature(vol: Volume, node: VolumeNode): string {
  const edges = vol.edges.filter(e => e.from === node.id || e.to === node.id);
  return JSON.stringify([
    vol.id, vol.act, node.id, node.label, node.size,
    node.obstacles.map(o => [o.id, o.kind, o.pos.x, o.pos.y, o.pos.z, o.size.x, o.size.y, o.size.z]),
    node.pos, edges.map(e => [e.from, e.to, vol.nodes.find(n => n.id === (e.from === node.id ? e.to : e.from))?.pos]),
  ]);
}

/** 保留每个 buildRoom 顶点，修正手性和墙面法线；不另造门或障碍。 */
export function quadGeometry(q: RoomQuad): BufferGeometry {
  const points = q.pts.map(p => toThree(p));
  const normal = toThree(q.normal);
  if (q.kind !== 'obstacle' && normal.dot(toThree(q.center)) > 0) normal.negate();
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  // 世界米空间UV，不将梯形墙片拉伸成矩形，门洞四周纹理自然连续。
  const n = q.normal;
  const axis = Math.abs(n.x) > 0.8 ? 'x' : Math.abs(n.y) > 0.8 ? 'y' : 'z';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const g = q.pts[i];
    positions.push(p.x, p.y, p.z);
    normals.push(normal.x, normal.y, normal.z);
    uv.push((axis === 'x' ? g.y : g.x) / 2.4, (axis === 'z' ? g.y : -g.z) / 2.4);
  }
  const indices: number[] = [];
  for (let i = 1; i + 1 < points.length; i++) {
    const face = new Vector3().subVectors(points[i], points[0]).cross(new Vector3().subVectors(points[i + 1], points[0]));
    if (face.dot(normal) >= 0) indices.push(0, i, i + 1);
    else indices.push(0, i + 1, i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRoomMesh(geo: RoomGeometry, materials: DeepseaMaterials): Group {
  const root = new Group();
  root.name = `deepsea.room.${geo.nodeId}`;
  for (const q of geo.quads) {
    // buildRoom 的 door 面是开口标记，不是堵住通道的实体黑面。
    if (q.kind === 'door') continue;
    const mesh = new Mesh(quadGeometry(q), materials.forQuad(q));
    mesh.name = q.id;
    mesh.userData.obstacleId = q.obstacleId;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    // Tight surface strap: follows the real crate face and never changes its collision or hit target.
    if (q.obstacle === 'crate' && q.pts.length === 4 && materials.forDetail) {
      const lerpPoint = (a: typeof q.center, b: typeof q.center, t: number) => ({
        x: a.x + (b.x - a.x) * t + q.normal.x * .002,
        y: a.y + (b.y - a.y) * t + q.normal.y * .002,
        z: a.z + (b.z - a.z) * t + q.normal.z * .002,
      });
      const strap = { ...q, id: `strap.${q.id}`, pts: [lerpPoint(q.pts[0],q.pts[1],.43),lerpPoint(q.pts[0],q.pts[1],.57),lerpPoint(q.pts[3],q.pts[2],.57),lerpPoint(q.pts[3],q.pts[2],.43)] };
      const band = new Mesh(quadGeometry(strap), materials.forDetail('strap'));
      band.name = strap.id; band.receiveShadow = true; root.add(band);
    }
  }
  // 门洞是buildRoom已经挖出的四边形。只向房间外侧延伸门套，
  // 不缩小通行截面、不造门板，也不在可航行区域添碰撞外的物体。
  for (const opening of geo.quads.filter(q => q.kind === 'door')) {
    const door = geo.doors.find(d => d.to === opening.to);
    if (!door) continue;
    const axis = (['x', 'y', 'z'] as const)[door.axis];
    for (let i = 0; i < opening.pts.length; i++) {
      const a = opening.pts[i];
      const b = opening.pts[(i + 1) % opening.pts.length];
      const c = { ...b, [axis]: b[axis] + door.sign * 0.42 };
      const d = { ...a, [axis]: a[axis] + door.sign * 0.42 };
      const ab = new Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      const ac = new Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
      const n = ab.cross(ac).normalize();
      const center = { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4, z: (a.z + b.z + c.z + d.z) / 4 };
      const q: RoomQuad = {
        id: `reveal.${opening.id}.${i}`, kind: 'wall', pts: [a, b, c, d],
        normal: { x: n.x, y: n.y, z: n.z }, center, area: 0.42 * Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z),
      };
      const mesh = new Mesh(quadGeometry(q), materials.forQuad(q));
      mesh.name = q.id;
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
  return root;
}

/** 仅释放房间网格；共享材质和纹理由渲染器生命周期统一释放。 */
export function disposeRoomMesh(root: Group): void {
  root.traverse(object => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
  root.clear();
}
