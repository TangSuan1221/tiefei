/** npx tsx --test tools/deepsea-renderer.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Texture, Vector3 } from 'three';
import type { Vec3, Volume, VolumeNode } from '../src/pod/gen/volume';
import { basisOf, buildRoom, focalFor, projectPoint, type Eye } from '../src/pod/view/roomview';
import { configureCamera, toThree } from '../src/pod/view/deepsea/camera';
import { createRoomMesh, disposeRoomMesh, quadGeometry, roomSourceSignature } from '../src/pod/view/deepsea/geometry';
import { createMaterials } from '../src/pod/view/deepsea/materials';
import { drawDeepseaRoom, disposeDeepseaRenderer } from '../src/pod/view/deepsea';
import { markSignature } from '../src/pod/view/deepsea/marks';

function fixture() {
  const node: VolumeNode = {
    id: 'room', pos: { x: 0, y: 0, z: 0 }, role: 'entry', stripe: 'none', label: '测试舱',
    size: { x: 18, y: 20, z: 12 }, obstacles: [
      { id: 'box', kind: 'crate', pos: { x: 5, y: 3, z: 3 }, size: { x: 2, y: 2, z: 2 } },
      { id: 'overhead', kind: 'pipe', pos: { x: 2, y: -3, z: -4 }, size: { x: 5, y: 1, z: .5 } },
    ],
  };
  const nodes = [node];
  for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
    nodes.push({ ...node, id: `${axis}${sign}`, pos: { x: 0, y: 0, z: 0, [axis]: sign * 30 }, obstacles: [] });
  }
  const vol = {
    id: 'fixture', act: 1, nodes,
    edges: nodes.slice(1).map(n => ({ id: n.id, from: node.id, to: n.id, kind: 'lateral', length: 30 })),
  } as unknown as Volume;
  return { node, vol };
}

function approximately(a: number, b: number, message: string) {
  assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);
}

test('坐标映射 +X右、+Y前、+Z下，没有光心偏移', () => {
  assert.deepEqual(toThree({ x: 1, y: 2, z: 3 }).toArray(), [1, -3, -2]);
  const camera = new PerspectiveCamera();
  const eye = { pos: { x: 2, y: -3, z: 1 }, yaw: 0, pitch: 0 };
  configureCamera(camera, eye, 800, 600, 1);
  assert.deepEqual(camera.position.toArray(), [2, -1, 3]);
  const forward = camera.getWorldDirection(new Vector3());
  approximately(forward.x, 0, 'forward.x');
  approximately(forward.y, 0, 'forward.y');
  approximately(forward.z, -1, 'forward.z');
});

test('多航向俯仰、横竖屏、变焦：Three 与 focalFor/projectPoint 逐像素一致', () => {
  const camera = new PerspectiveCamera();
  for (const [w, h] of [[1280, 720], [720, 1280], [641, 479], [800, 800]]) {
    for (const zoom of [.5, 1, 1.7, 4]) for (const yaw of [0, 35, 90, 180, 271]) for (const pitch of [-86, -30, 0, 35, 86]) {
      const eye: Eye = { pos: { x: 2.5, y: -1.2, z: .8 }, yaw, pitch };
      configureCamera(camera, eye, w, h, zoom);
      const basis = basisOf(eye);
      const focal = focalFor(Math.min(w, h), .58 / zoom);
      for (const [right, up, depth] of [[0, 0, 2], [1, .5, 8], [-2, -1, 4], [.02, -.03, .17]]) {
        const p: Vec3 = { x: 0, y: 0, z: 0 };
        for (const axis of ['x', 'y', 'z'] as const) p[axis] = eye.pos[axis] + basis.fwd[axis] * depth + basis.right[axis] * right + basis.up[axis] * up;
        const expected = projectPoint(p, basis, { cx: w / 2, cy: h / 2, focal });
        assert.equal(expected.ok, true);
        const actual = toThree(p).project(camera);
        approximately((actual.x + 1) * w / 2, expected.x, 'screen.x');
        approximately((1 - actual.y) * h / 2, expected.y, 'screen.y');
      }
    }
  }
});

test('每个箱体的渲染顶点严格等于 buildRoom，不添加随机物体', () => {
  const { vol, node } = fixture();
  const geo = buildRoom(vol, node);
  for (const q of geo.quads) {
    const mesh = quadGeometry(q);
    const p = mesh.getAttribute('position');
    for (let i = 0; i < q.pts.length; i++) {
      const expected = toThree(q.pts[i]);
      assert.ok(new Vector3(p.getX(i), p.getY(i), p.getZ(i)).distanceTo(expected) < 1e-6);
    }
    mesh.dispose();
  }
  const materials = createMaterials();
  const root = createRoomMesh(geo, materials);
  assert.equal(root.children.filter(o => !o.name.startsWith('reveal.') && !o.name.startsWith('strap.')).length, geo.quads.filter(q => q.kind !== 'door').length);
  assert.equal(root.children.filter(o => o.name.startsWith('strap.')).length, geo.quads.filter(q => q.obstacle === 'crate' && q.pts.length === 4).length);
  assert.equal(root.children.filter(o => o.name.startsWith('reveal.')).length, geo.quads.filter(q => q.kind === 'door').length * 4);
  assert.equal(root.children.some(o => o.name.startsWith('door.')), false);
  disposeRoomMesh(root);
  materials.dispose();
});

test('六个方向的门都是真开口，门外墙体仍可被射线命中', () => {
  const { vol, node } = fixture();
  node.obstacles = [];
  const geo = buildRoom(vol, node);
  const materials = createMaterials();
  const root = createRoomMesh(geo, materials);
  root.updateMatrixWorld(true);
  for (const door of geo.doors) {
    const axis = (['x', 'y', 'z'] as const)[door.axis];
    const direction = toThree(door.pos).normalize();
    const ray = new Raycaster(new Vector3(), direction, .16, 100);
    assert.equal(ray.intersectObject(root, true).length, 0, `door ${axis}${door.sign}`);
    const wallPoint = { ...door.pos };
    const tangent = axis === 'x' ? 'y' : 'x';
    wallPoint[tangent] = door.halfW + .5;
    ray.set(new Vector3(), toThree(wallPoint).normalize());
    assert.ok(ray.intersectObject(root, true).length > 0, `wall around ${axis}${door.sign}`);
  }
  disposeRoomMesh(root);
  materials.dispose();
});

test('同一墙面多个门与驾驶碰撞一致：每个开口可见，中间墙仍实心', () => {
  const { vol, node } = fixture();
  node.obstacles = [];
  const a = { ...node, id: 'left-door', pos: { x: -20, y: 30, z: 0 } };
  const b = { ...node, id: 'right-door', pos: { x: 20, y: 30, z: 0 } };
  vol.nodes = [node, a, b];
  vol.edges = [a, b].map(n => ({ id: n.id, from: node.id, to: n.id, kind: 'lateral', length: 30 }));
  const geo = buildRoom(vol, node);
  assert.equal(geo.quads.filter(q => q.kind === 'door').length, 2);
  const materials = createMaterials();
  const root = createRoomMesh(geo, materials);
  root.updateMatrixWorld(true);
  for (const door of geo.doors) {
    const from = toThree({ ...door.pos, y: 0 });
    const ray = new Raycaster(from, new Vector3(0, 0, -1), .16, 20);
    assert.equal(ray.intersectObject(root, true).length, 0, door.to);
  }
  const center = new Raycaster(new Vector3(), new Vector3(0, 0, -1), .16, 20);
  assert.ok(center.intersectObject(root, true).length > 0);
  disposeRoomMesh(root); materials.dispose();
});

test('反射坐标变换后的三角形绕向与法线一致，舱壁朝内', () => {
  const { vol, node } = fixture();
  const geo = buildRoom(vol, node);
  for (const q of geo.quads.filter(q => q.kind !== 'door')) {
    const geometry = quadGeometry(q);
    const p = geometry.getAttribute('position');
    const n = geometry.getAttribute('normal');
    const indices = geometry.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(p, indices.getX(i));
      const b = new Vector3().fromBufferAttribute(p, indices.getX(i + 1));
      const c = new Vector3().fromBufferAttribute(p, indices.getX(i + 2));
      const normal = new Vector3().fromBufferAttribute(n, indices.getX(i));
      assert.ok(b.sub(a).cross(c.sub(a)).dot(normal) >= 0, q.id);
      if (q.kind !== 'obstacle') assert.ok(normal.dot(toThree(q.center)) <= 0, `${q.id} inward`);
    }
    geometry.dispose();
  }
});

test('同ID/同障碍数量的原地移动、尺寸、门方位变化仍使缓存失效', () => {
  const { vol, node } = fixture();
  let key = roomSourceSignature(vol, node);
  for (const mutate of [
    () => { node.obstacles[0].pos.x += .001; },
    () => { node.obstacles[0].size.y += .001; },
    () => { node.obstacles[0].kind = 'tank'; },
    () => { node.size.z += .001; },
    () => { vol.nodes[1].pos.y += .001; },
    () => { vol.edges.pop(); },
  ]) {
    mutate();
    const next = roomSourceSignature(vol, node);
    assert.notEqual(next, key);
    key = next;
  }
});

test('稳定铭牌缓存不会被每帧瞄准和翻找进度触发', () => {
  const original = [{ obstacleId: 'box', seal: 'bone', label: '物资', searched: 0, passes: 0, aimed: false }];
  assert.equal(markSignature(original), markSignature([{ ...original[0], searched: .45, passes: 3, aimed: true }]));
  assert.notEqual(markSignature(original), markSignature([{ ...original[0], seal: 'blood' }]));
});

test('材质、纹理、几何可逐一释放；重复销毁渲染器安全', () => {
  const { vol, node } = fixture();
  const materials = createMaterials();
  const root = createRoomMesh(buildRoom(vol, node), materials);
  let geometryDisposals = 0;
  const meshes = root.children as Mesh[];
  const expected = meshes.length;
  for (const mesh of meshes) mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  const uniqueMaterials = new Set(meshes.map(m => m.material));
  let materialDisposals = 0;
  const textures = new Set<Texture>();
  for (const material of uniqueMaterials) {
    assert.ok(material instanceof MeshStandardMaterial);
    material.addEventListener('dispose', () => materialDisposals++);
    for (const texture of [material.map, material.normalMap, material.roughnessMap]) if (texture) textures.add(texture);
  }
  let textureDisposals = 0;
  for (const texture of textures) texture.addEventListener('dispose', () => textureDisposals++);
  disposeRoomMesh(root);
  materials.dispose();
  assert.equal(geometryDisposals, expected);
  assert.equal(materialDisposals, uniqueMaterials.size);
  assert.equal(textureDisposals, textures.size);
  disposeDeepseaRenderer();
  disposeDeepseaRenderer();
});

test('无DOM/WebGL时同步返回false，不调用2D绘制、不污染游戏状态', () => {
  const { vol, node } = fixture();
  const snapshot = JSON.stringify(vol);
  let draws = 0;
  const ctx = { drawImage: () => draws++ } as unknown as CanvasRenderingContext2D;
  assert.equal(drawDeepseaRoom(ctx, 800, 600, {
    vol, nodeId: node.id, eye: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 },
    zoom: 1, light: 1, corruption: 0, time: 0,
  }), false);
  assert.equal(draws, 0);
  assert.equal(JSON.stringify(vol), snapshot);
});
