import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Box3, BufferGeometry, DataTexture, Material, Mesh, MeshStandardMaterial, Object3D,
  Texture, Vector3,
} from 'three';
import { createReferenceMaterials } from '../src/pod/view/deepsea/reference-materials';
import { createReferenceRoom } from '../src/pod/view/deepsea/reference-room';

// Run with: npx tsx --test tools/reference-scene.test.ts
// No renderer or DOM shim: these tests exercise actual Three CPU resources.
function texturesOf(materials: Iterable<Material>): Set<Texture> {
  const textures = new Set<Texture>();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
  return textures;
}

function watchDisposal(resources: Iterable<BufferGeometry | Material | Texture>) {
  const counts = new Map<BufferGeometry | Material | Texture, number>();
  for (const resource of new Set(resources)) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  }
  return counts;
}

function assertDisposed(counts: ReturnType<typeof watchDisposal>) {
  assert.ok(counts.size > 0, 'disposal check must observe resources');
  for (const [resource, count] of counts) {
    assert.equal(count, 1, `${resource.type} ${resource.name || resource.uuid}: dispose exactly once`);
  }
}

function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
  assert.ok(meshes.length > 0, 'room must contain meshes');
  return meshes;
}

function assertFiniteGeometry(meshes: Mesh[]) {
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const label = mesh.name || geometry.name || mesh.uuid;
    assert.ok(position && position.count > 0, `${label}: nonempty positions`);
    assert.equal(position.itemSize, 3, `${label}: XYZ positions`);
    for (const name of ['position', 'normal', 'uv']) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      for (let i = 0; i < attribute.count; i++) {
        for (let component = 0; component < attribute.itemSize; component++) {
          assert.ok(Number.isFinite(attribute.getComponent(i, component)), `${label}: ${name}[${i},${component}] must be finite`);
        }
      }
    }
    if (geometry.index) {
      for (const index of geometry.index.array) {
        assert.ok(Number.isInteger(index) && index >= 0 && index < position.count, `${label}: index ${index} out of bounds`);
      }
    }
    // Preserve authored padding: recomputing live bounds would mask culling regressions.
    const bounds = new Box3();
    const vertex = new Vector3();
    for (let i = 0; i < position.count; i++) bounds.expandByPoint(vertex.fromBufferAttribute(position, i));
    assert.ok(!bounds.isEmpty(), `${label}: valid bounds`);
    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), `${label}: finite bounds`);
    assert.ok(geometry.boundingBox?.containsBox(bounds), `${label}: authored box encloses vertices`);
    const sphere = geometry.boundingSphere;
    assert.ok(sphere && Number.isFinite(sphere.radius) && sphere.radius >= 0, `${label}: finite radius`);
    assert.ok(sphere.center.toArray().every(Number.isFinite), `${label}: finite sphere center`);
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      assert.ok(vertex.distanceTo(sphere.center) <= sphere.radius + 1e-6, `${label}: authored sphere encloses vertex ${i}`);
    }
    assert.ok(mesh.matrixWorld.elements.every(Number.isFinite), `${label}: finite world transform`);
  }
}

test('reference materials work without DOM and release their observable resources', async t => {
  const palette = createReferenceMaterials();
  const materials = Object.values(palette).filter((value): value is MeshStandardMaterial => value instanceof MeshStandardMaterial);
  const textures = texturesOf(materials);
  const disposed = watchDisposal([...materials, ...textures]);
  try {
    await t.test('all named finishes have physically valid roughness and metalness', () => {
      for (const key of ['hull', 'steel', 'rubber', 'yellow', 'red', 'cloth', 'floor', 'label', 'glass'] as const) {
        const material = palette[key];
        assert.ok(material instanceof MeshStandardMaterial, `${key}: PBR material`);
        for (const property of ['roughness', 'metalness'] as const) {
          const value = material[property];
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${key}.${property}=${value}`);
        }
      }
    });
    await t.test('procedural texture buffers have complete finite pixel data', () => {
      assert.ok(textures.size > 0, 'must exercise generated textures');
      for (const texture of textures) {
        assert.ok(texture instanceof DataTexture, `${texture.name}: DOM-free DataTexture`);
        const image = texture.image;
        assert.ok(image && image.width > 0 && image.height > 0, texture.name);
        assert.ok(image.data, `${texture.name}: CPU pixel buffer`);
        assert.equal(image.data.length, image.width * image.height * 4, texture.name);
        assert.ok(image.data.every(Number.isFinite), `${texture.name}: finite pixel values`);
      }
    });
  } finally {
    palette.dispose();
  }
  await t.test('shared materials and textures each emit one disposal event', () => {
    assertDisposed(disposed);
    palette.dispose();
    assertDisposed(disposed);
  });
});

test('reference room runtime contracts', async t => {
  const palette = createReferenceMaterials();
  let room: { root: Object3D; colliders: Box3[]; update(time: number): void; dispose(): void } | undefined;
  let disposed: ReturnType<typeof watchDisposal> | undefined;
  try {
    room = createReferenceRoom(palette);
    assert.ok(room && room.root instanceof Object3D);
    const activeRoom = room;
    // Match reference-preview.ts: colliders are already in world coordinates after scaling.
    activeRoom.root.scale.x = 1.16;
    for (const collider of activeRoom.colliders) {
      collider.min.x *= 1.16;
      collider.max.x *= 1.16;
    }
    activeRoom.root.updateMatrixWorld(true);
    const meshes = meshesOf(activeRoom.root);
    const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    const geometries = new Set(meshes.map(mesh => mesh.geometry));
    const paletteMaterials = Object.values(palette).filter((value): value is MeshStandardMaterial => value instanceof MeshStandardMaterial);
    disposed = watchDisposal([...geometries, ...materials, ...paletteMaterials, ...texturesOf([...materials, ...paletteMaterials])]);

    await t.test('room contains structural hull, deck and steel mesh roles', () => {
      assert.equal(activeRoom.root.name, 'reference-industrial-compartment');
      for (const role of ['hull', 'floor', 'steel'] as const) {
        assert.ok(materials.has(palette[role]), `missing mesh using ${role} finish`);
      }
      assert.ok(meshes.some(mesh => mesh.name === 'slack-pressure-hatch-drape'), 'missing named hatch drape');
    });
    await t.test('all mesh vertices, attributes, indices and transforms are valid', () => {
      assertFiniteGeometry(meshes);
    });
    await t.test('default camera clears every collider including movement clearance', () => {
      assert.ok(Array.isArray(activeRoom.colliders) && activeRoom.colliders.length > 0, 'nonempty collision coverage');
      const camera = new Vector3(-.26, -.25, 2.16);
      assert.ok(new Box3(new Vector3(-3.15, -1.45, -3.2), new Vector3(3.15, 2.1, 3)).containsPoint(camera), 'spawn inside preview movement limits');
      for (const [index, box] of activeRoom.colliders.entries()) {
        assert.ok(box instanceof Box3 && !box.isEmpty(), `collider ${index}: valid box`);
        assert.ok([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite), `collider ${index}: finite bounds`);
        assert.ok(box.getSize(new Vector3()).toArray().every(size => size > 0), `collider ${index}: positive volume`);
        assert.equal(box.containsPoint(camera), false, `camera inside collider ${index}`);
        assert.equal(box.clone().expandByScalar(0.18).containsPoint(camera), false, `camera clearance intersects collider ${index}`);
      }
      t.diagnostic(`Checked ${activeRoom.colliders.length} world colliders at spawn ${camera.toArray()} with 0.18 clearance`);
    });
    await t.test('lower drape has asymmetric folds and an uneven free hem', () => {
      const cloth = meshes.find(mesh => mesh.name === 'slack-pressure-hatch-drape')!;
      assert.ok(cloth, 'named drape exists');
      const position = cloth.geometry.getAttribute('position');
      const uv = cloth.geometry.getAttribute('uv');
      assert.ok(uv && uv.count === position.count, 'UVs identify corresponding cloth locations');
      const samples = new Map<string, number>();
      const key = (u: number, v: number) => `${u.toFixed(5)},${v.toFixed(5)}`;
      for (let i = 0; i < uv.count; i++) samples.set(key(uv.getX(i), uv.getY(i)), i);
      let pairs = 0, depthDifference = 0, hemMin = Infinity, hemMax = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (v < 1e-6) {
          hemMin = Math.min(hemMin, position.getY(i));
          hemMax = Math.max(hemMax, position.getY(i));
        }
        if (v > .5 || u >= .5) continue;
        const reflected = samples.get(key(1 - u, v));
        assert.notEqual(reflected, undefined, 'mirrored UV sample exists');
        depthDifference += Math.abs(position.getZ(i) - position.getZ(reflected!));
        pairs++;
      }
      assert.ok(pairs > 0, 'sampled lower-half mirror pairs');
      // Broad centimetre-scale checks, independent of segment count or exact fold formula.
      assert.ok(depthDifference / pairs > .01, 'lower folds must not be mirror symmetric');
      assert.ok(Number.isFinite(hemMax - hemMin) && hemMax - hemMin > .02, 'free hem must not be straight');
      t.diagnostic(`Lower cloth mean mirrored depth difference ${(depthDifference / pairs).toFixed(4)}m; hem height range ${(hemMax - hemMin).toFixed(4)}m`);
    });
    await t.test('cloth updates animate vertices while preserving finite geometry', () => {
      // The authored drape owns a clone of the shared cloth material.
      const clothMeshes = meshes.filter(mesh => mesh.name === 'slack-pressure-hatch-drape');
      assert.ok(clothMeshes.length > 0, 'room must include cloth meshes');
      activeRoom.update(0);
      const before = clothMeshes.map(mesh => Array.from(mesh.geometry.getAttribute('position').array));
      let changed = false;
      for (const time of [1 / 60, 1, 3.8, 60, 3600]) {
        activeRoom.update(time);
        activeRoom.root.updateMatrixWorld(true);
        assertFiniteGeometry(meshes);
        clothMeshes.forEach((mesh, i) => {
          const positions = mesh.geometry.getAttribute('position').array;
          assert.equal(positions.length, before[i].length, 'cloth update preserves topology');
          changed ||= positions.some((value, j) => value !== before[i][j]);
        });
      }
      assert.ok(changed, 'cloth update must change at least one cloth vertex');
    });
  } finally {
    try { room?.dispose(); } finally { palette.dispose(); }
  }
  await t.test('room and palette teardown dispose each reachable resource once', () => {
    assert.ok(disposed);
    assertDisposed(disposed);
    room!.dispose();
    palette.dispose();
    assertDisposed(disposed);
    assert.equal(room!.root.children.length, 0, 'disposed room releases child references');
  });
});
