import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';
import { createPreviewCollision } from '../src/pod/view/deepsea/preview-collision';

// Artifact contract test: run after tools/blender/build-l01.py has exported the asset.
const bytes = readFileSync(new URL('../public/assets/deepsea/l01-processing.glb', import.meta.url));
const layout = JSON.parse(readFileSync(new URL('../public/assets/deepsea/l01-layout.json', import.meta.url), 'utf8'));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
type Node = { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] };
const nodes: Node[] = gltf.nodes;
const world = new Map<number, Matrix4>();
const nodeBounds = new Map<number, Box3>();
const sceneBounds = new Box3();
function visit(index: number, parent: Matrix4) {
  const node = nodes[index]!;
  const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
  const matrix = parent.clone().multiply(local);
  world.set(index, matrix);
  if (node.mesh !== undefined) {
    const box = new Box3();
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      box.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(matrix));
    }
    nodeBounds.set(index, box);
    sceneBounds.union(box);
  }
  for (const child of node.children ?? []) visit(child, matrix);
}
for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, new Matrix4());
function named(name: string) {
  const index = nodes.findIndex(node => node.name === name);
  assert.ok(index >= 0, `Missing node ${name}`);
  assert.ok(world.has(index), `Node is not in the default scene: ${name}`);
  return index;
}
function close(actual: number[], expected: number[], tolerance = .002) {
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]!) <= tolerance, `${actual} differs from ${expected}`));
}

test('GLB default scene contains only the authored hall, never the original Cube', () => {
  assert.equal(gltf.scenes.length, 1);
  assert.equal(gltf.scenes[0].name, 'DS_L01');
  assert.ok(nodes.every(node => !['Cube', 'Camera', 'Light'].includes(node.name ?? '')));
  assert.ok(!gltf.cameras?.length);
  assert.ok(!gltf.extensions?.KHR_lights_punctual);
  assert.equal(layout.buildStage, 'detailed');
});

test('GLB uses Three Y-up without an extra importer rotation', () => {
  close(new Vector3().setFromMatrixPosition(world.get(named('spawn_player'))!).toArray(), layout.spawn.position);
  close(sceneBounds.min.toArray(), layout.meshBounds.min);
  close(sceneBounds.max.toArray(), layout.meshBounds.max);
  assert.ok(sceneBounds.min.y < -4 && sceneBounds.max.y > 4);
  assert.ok(sceneBounds.min.z < -14 && sceneBounds.max.z > 11);
});

test('both containers keep independent hinges and actual item children', () => {
  for (const crate of layout.crates) {
    const rootIndex = named(crate.anchor);
    const lidIndex = named(crate.lidNode);
    close(new Vector3().setFromMatrixPosition(world.get(rootIndex)!).toArray(), crate.position);
    close(new Vector3().setFromMatrixPosition(world.get(lidIndex)!).toArray(), crate.hinge);
    assert.ok(nodes[rootIndex]!.children?.includes(lidIndex));
    for (const item of crate.itemNodes) assert.ok(nodes[rootIndex]!.children?.includes(named(item)), item);
  }
});

test('PBR textures are packed into the GLB, not missing external files', () => {
  assert.ok(gltf.images.length >= 6);
  for (const image of gltf.images) {
    assert.equal(image.uri, undefined);
    assert.equal(typeof image.bufferView, 'number');
    assert.ok(['image/png', 'image/jpeg'].includes(image.mimeType));
  }
  assert.ok(gltf.materials.some((material: any) => material.pbrMetallicRoughness?.metallicRoughnessTexture));
  assert.ok(gltf.materials.some((material: any) => material.normalTexture));
});

test('major solid props fit their declared conservative collision bounds', () => {
  for (const [mesh, collision] of [['batch_separator', 'geo_separator'], ['batch_diver', 'geo_diver']] as const) {
    const bounds = nodeBounds.get(named(mesh))!;
    const record = layout.obstacles.find((obstacle: any) => obstacle.name === collision);
    assert.ok(record);
    const declared = new Box3(new Vector3().fromArray(record.min), new Vector3().fromArray(record.max)).expandByScalar(.015);
    assert.ok(declared.containsBox(bounds), `${mesh}: mesh ${JSON.stringify(bounds)} exceeds ${JSON.stringify(declared)}`);
  }
});

test('preview can cross the real doorway and return, without an invisible hall-end wall', () => {
  const canMove = createPreviewCollision(layout);
  assert.equal(canMove(new Vector3(0, 0, -9), new Vector3(0, 0, -13)), true);
  assert.equal(canMove(new Vector3(0, 0, -13), new Vector3(0, 0, -9)), true);
  assert.equal(canMove(new Vector3(0, 0, -13), new Vector3(0, 0, -15)), false);
});

test('preview swept hull cannot tunnel through a prop, doorway edge or side wall', () => {
  const canMove = createPreviewCollision(layout);
  assert.equal(canMove(new Vector3(0, 0, 8), new Vector3(0, 0, -8)), false);
  assert.equal(canMove(new Vector3(0, 0, -9), new Vector3(2, 0, -12)), false);
  assert.equal(canMove(new Vector3(7, 0, 7), new Vector3(10, 0, 7)), false);
});

test('authored safe route keeps a 0.85m radius clear of declared obstacles', () => {
  for (let segment = 1; segment < layout.safeRoute.length; segment++) {
    const from = new Vector3().fromArray(layout.safeRoute[segment - 1]);
    const to = new Vector3().fromArray(layout.safeRoute[segment]);
    for (let i = 0; i <= 100; i++) {
      const point = from.clone().lerp(to, i / 100);
      for (const obstacle of [...layout.obstacles, ...layout.walls]) {
        const bounds = new Box3(new Vector3().fromArray(obstacle.min), new Vector3().fromArray(obstacle.max)).expandByScalar(.85);
        assert.ok(!bounds.containsPoint(point), `Route ${segment} intersects ${obstacle.name}`);
      }
    }
  }
});
