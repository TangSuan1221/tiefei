import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Box3, BufferGeometry, DataTexture, Euler, Material, Mesh, Object3D, Raycaster, Texture, Triangle, Vector3 } from 'three';
import { createExpedition, newExpeditionState, interactExpedition, openDoor, canOpenDoor, expeditionDoorPosition, type ExpeditionState } from '../src/pod/content/expedition';
import { createReferenceMaterials } from '../src/pod/view/deepsea/reference-materials';
import { createFacilitiesA } from '../src/pod/view/deepsea/expedition-facilities-a';
import { createFacilitiesB } from '../src/pod/view/deepsea/expedition-facilities-b';
import { createExpeditionWayfinding } from '../src/pod/view/deepsea/expedition-wayfinding';
import { createExpeditionWorld } from '../src/pod/view/deepsea/expedition-world';
import { createExpeditionShells } from '../src/pod/view/deepsea/expedition-shells';

// CPU only: node --import tsx --test tools/expedition-art.test.ts
type Resource = BufferGeometry | Material | Texture;
function materialResources(materials: Material[]) {
  const resources = new Set<Resource>(materials);
  for (const material of materials) for (const value of Object.values(material)) {
    if (value instanceof Texture) resources.add(value);
  }
  return resources;
}
function resourcesOf(root: Object3D) {
  const result = new Set<Resource>();
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    result.add(node.geometry);
    for (const resource of materialResources(Array.isArray(node.material) ? node.material : [node.material])) result.add(resource);
  });
  return result;
}
function observe(resources: Iterable<Resource>) {
  const counts = new Map<Resource, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  }
  return counts;
}
function assertCounts(counts: Map<Resource, number>, expected: number) {
  assert.ok(counts.size, 'nonvacuous resource coverage');
  for (const [resource, count] of counts) assert.equal(count, expected, `${resource.name || resource.uuid}: disposal count`);
}
function visible(object: Object3D) {
  for (let at: Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}
function descendant(node: Object3D, root: Object3D) {
  for (let at: Object3D | null = node; at; at = at.parent) if (at === root) return true;
  return false;
}
function finiteGeometry(root: Object3D) {
  let meshes = 0;
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    meshes++;
    assert.ok(node.matrixWorld.elements.every(Number.isFinite));
    const geometry: BufferGeometry = node.geometry, position = geometry.getAttribute('position');
    assert.ok(position && position.count > 0, node.name);
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) {
        assert.ok(Number.isFinite(attribute.getComponent(i, c)), `${node.name}: ${name}[${i},${c}]`);
      }
    }
    if (geometry.index) for (const i of geometry.index.array) assert.ok(Number.isInteger(i) && i >= 0 && i < position.count);
  });
  assert.ok(meshes > 0);
}

/** Translation/scale-normalized projected triangle occupancy, independent of names,
 * materials, vertex ordering and tessellation density; plus a precise mesh digest. */
function shapeSignature(root: Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root), size = bounds.getSize(new Vector3());
  assert.ok(!bounds.isEmpty() && size.toArray().every(v => v > 0 && Number.isFinite(v)));
  const pixels = [new Uint8Array(32 * 32), new Uint8Array(32 * 32)];
  const hash = createHash('sha256');
  const point = new Vector3();
  root.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const g = node.geometry, p = g.getAttribute('position');
    const vertices: number[][] = [];
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(node.matrixWorld).sub(bounds.min).divide(size);
      vertices.push(point.toArray());
      hash.update(point.toArray().map(v => v.toFixed(4)).join(',') + ';');
    }
    const count = g.index?.count ?? p.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const triangle = [0, 1, 2].map(j => vertices[g.index ? g.index.getX(i + j) : i + j]);
      for (let plane = 0; plane < 2; plane++) {
        const axis = plane ? 2 : 0;
        const [a, b, c] = triangle.map(v => [v[axis] * 31, v[1] * 31]);
        const cross = (p: number[], q: number[], x: number, y: number) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
        if (Math.abs(cross(a, b, c[0], c[1])) < 1e-8) continue;
        for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))); y <= Math.min(31, Math.ceil(Math.max(a[1], b[1], c[1]))); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))); x <= Math.min(31, Math.ceil(Math.max(a[0], b[0], c[0]))); x++) {
            const signs = [cross(a, b, x, y), cross(b, c, x, y), cross(c, a, x, y)];
            if (signs.every(v => v >= -1e-6) || signs.every(v => v <= 1e-6)) pixels[plane][y * 32 + x] = 1;
          }
        }
      }
    }
  });
  return { mesh: hash.digest('hex'), silhouette: pixels.map(p => Buffer.from(p).toString('base64')).join('/') };
}

test('expedition art: geometry, navigation, world clearance and resource ownership', async t => {
  const palette = createReferenceMaterials();
  const shared = materialResources(Object.values(palette).filter((value): value is Material => value instanceof Material));
  const sharedDisposal = observe(shared);
  const signatures: ReturnType<typeof shapeSignature>[] = [];
  try {
    await t.test('standalone art modules dispose owned resources and preserve borrowed palette', () => {
      const level = createExpedition(0);
      for (const art of [createFacilitiesA(level, palette), createFacilitiesB(createExpedition(4), palette), createExpeditionWayfinding(level, palette),
        ...Array.from({ length: 7 }, (_, index) => createExpeditionShells(createExpedition(index), palette))]) {
        const owned = observe([...resourcesOf(art.root)].filter(resource => !shared.has(resource)));
        try {
          finiteGeometry(art.root);
          if (art.root.name.startsWith('expedition-shells.')) for (const resource of resourcesOf(art.root)) {
            if (resource instanceof Material || resource instanceof Texture) assert.ok(shared.has(resource), 'standalone shell only borrows supplied palette resources');
          }
        } finally { art.dispose(); }
        assertCounts(owned, 1); art.dispose(); assertCounts(owned, 1);
        assertCounts(sharedDisposal, 0);
      }
    });
    for (let index = 0; index < 7; index++) await t.test(`level ${index + 1}: all 28 rooms, progression states and art contracts`, async t => {
      const level = createExpedition(index), world = createExpeditionWorld(level, palette);
      const owned = observe([...resourcesOf(world.root)].filter(resource => !shared.has(resource)));
      try {
        const state = newExpeditionState(level);
        world.update(state, 0); world.root.updateMatrixWorld(true);
        await t.test('finite art geometry and a physical hall silhouette', () => {
          finiteGeometry(world.root);
          if (index < 6) {
            const architecture = world.root.getObjectByName('expedition-structural-layers');
            assert.ok(architecture, 'integrated architecture');
            const runoff = [...resourcesOf(architecture)].filter((resource): resource is DataTexture =>
              resource instanceof DataTexture && !shared.has(resource)
              && resource.image.width === 64 && resource.image.height === 128);
            assert.equal(runoff.length, 1, 'one shared factory-owned runoff texture per architecture');
            assert.ok(owned.has(runoff[0]), 'runoff dispose event is included in world teardown assertions');
            const pixels = runoff[0].image.data;
            assert.ok(pixels, 'runoff has a CPU pixel buffer');
            assert.equal(pixels.length, 64 * 128 * 4);
            assert.ok(pixels.some((value: number, i: number) => i % 4 === 3 && value > 0), 'runoff has visible alpha');
          }
          const hall = world.root.getObjectByName(`facilities.${level.rooms.find(r => r.role === 'hall')!.id}`);
          assert.ok(hall, 'integrated landmark hall');
          signatures.push(shapeSignature(hall));
        });
        await t.test('facilities fit their rooms and actual hall ceilings have rendered roof surfaces', () => {
          const facilities = world.root.getObjectByName(`facilities-${index < 4 ? 'a' : 'b'}.${level.id}`)!;
          assert.ok(facilities);
          for (const room of level.rooms.filter(r => r.role === 'hall')) {
            const group = facilities.getObjectByName(`facilities.${room.id}`);
            assert.ok(group, room.id);
            const bounds = new Box3().setFromObject(group);
            const envelope = new Box3(new Vector3(room.x-room.width/2,-2.01,room.z-room.depth/2),
              new Vector3(room.x+room.width/2,room.ceiling ?? 4,room.z+room.depth/2)).expandByScalar(.01);
            assert.ok(!bounds.isEmpty() && envelope.containsBox(bounds), `${room.id}: facility leaves room envelope`);
            // Upward centre ray must reach the real room ceiling, not the old 4m roof.
            // A tiny in-room offset avoids exact triangle seams in batched roofs.
            const origin = new Vector3(room.x + .013, 3.04, room.z + .013);
            const ray = new Raycaster(origin, new Vector3(0,1,0), .001, 20);
            const hits = ray.intersectObject(world.root, true).filter(hit => visible(hit.object)
              && hit.object.name.startsWith('static.'));
            assert.ok(hits.some(hit => Math.abs(hit.point.y-(room.ceiling ?? 4)) < .05), `${room.id}: missing tall roof geometry`);
          }
        });
        await t.test('shell reports match actual geometry, wall skin, lamp clearance and borrowed resources', () => {
          const shells = world.root.getObjectByName(`expedition-shells.${level.id}`);
          assert.ok(shells, 'integrated shells');
          type Bounds = { min: [number, number, number]; max: [number, number, number] };
          const reports = shells.userData.shells as Array<{ room: string; ceiling: number; parts: number; bounds: Bounds[]; lightReservations: Bounds[] }>;
          const expected = level.rooms.filter(r => r.role === 'hall' || /\.r0$/.test(r.id));
          assert.deepEqual(reports.map(r => r.room).sort(), expected.map(r => r.id).sort());
          const boxOf = (b: Bounds) => new Box3(new Vector3(...b.min), new Vector3(...b.max));
          for (const report of reports) {
            const room = level.rooms.find(r => r.id === report.room)!;
            const group = shells.getObjectByName(`shell.${room.id}`); assert.ok(group);
            assert.equal(report.ceiling, room.ceiling ?? 4);
            assert.ok(report.parts > 0); assert.equal(report.parts, report.bounds.length);
            const envelope = new Box3(new Vector3(room.x-room.width/2, -2, room.z-room.depth/2),
              new Vector3(room.x+room.width/2, room.ceiling ?? 4, room.z+room.depth/2));
            const flush = (b: Box3) => b.max.x <= envelope.min.x + .192 || b.min.x >= envelope.max.x - .192
              || b.max.z <= envelope.min.z + .192 || b.min.z >= envelope.max.z - .192;
            const lamps = world.practicalLights.filter(l => l.room === room.id);
            assert.equal(lamps.length, room.role === 'hall' ? 4 : 2);
            const reservations = report.lightReservations.map(boxOf);
            assert.equal(reservations.length, lamps.length);
            // Runtime light emitters sit .25m beneath their physical fixture centres.
            for (const lamp of lamps) {
              const centre = new Vector3(...lamp.position).add(new Vector3(0, .25, 0));
              assert.ok(reservations.some(b => b.getCenter(new Vector3()).distanceTo(centre) < 1e-5
                && b.getSize(new Vector3()).distanceTo(new Vector3(1.6, 1.6, 1.6)) < 1e-5));
            }
            const reportedUnion = new Box3();
            for (const bound of report.bounds) {
              const b = boxOf(bound); reportedUnion.union(b);
              assert.ok(!b.isEmpty() && [...b.min.toArray(), ...b.max.toArray()].every(Number.isFinite));
              assert.ok(envelope.clone().expandByScalar(.002).containsBox(b), `${room.id}: reported part outside room`);
              assert.ok(!reservations.some(l => l.intersectsBox(b)), `${room.id}: part intersects lamp reservation`);
              if (b.min.y < 3.15) {
                assert.ok(flush(b), `${room.id}: low part exceeds .19m wall skin`);
                assert.ok(world.colliders.some(c => c.min.distanceTo(b.min) < 1e-5 && c.max.distanceTo(b.max) < 1e-5), 'low shell collider integrated');
              }
            }
            const actual = new Box3().setFromObject(group);
            assert.ok(actual.min.distanceTo(reportedUnion.min) < .002 && actual.max.distanceTo(reportedUnion.max) < .002, 'reported and rendered bounds agree');
            group.traverse(node => {
              if (!(node instanceof Mesh)) return;
              assert.ok(owned.has(node.geometry), 'shell geometry included in world disposal events');
              for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                // World supplies a themed hull clone in addition to the original palette.
                // It must be reused outside shells, and its owner disposes it exactly once.
                let reusedOutsideShells = false;
                world.root.traverse(other => {
                  if (other instanceof Mesh && !descendant(other, shells)
                    && (Array.isArray(other.material) ? other.material : [other.material]).includes(material)) reusedOutsideShells = true;
                });
                assert.ok(shared.has(material) || (owned.has(material) && reusedOutsideShells), 'shell borrows shared or world-owned palette material');
              }
              const g = node.geometry, p = g.getAttribute('position'), count = g.index?.count ?? p.count;
              for (let i = 0; i < count; i += 3) {
                const points = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, g.index ? g.index.getX(i+j) : i+j).applyMatrix4(node.matrixWorld));
                const b = new Box3().setFromPoints(points);
                assert.ok(envelope.clone().expandByScalar(.002).containsBox(b), `${room.id}: actual triangle outside room`);
                if (b.min.y < 3.15 - .002) assert.ok(flush(b), `${room.id}: actual low triangle intrudes into room`);
                const triangle = new Triangle(points[0], points[1], points[2]);
                assert.ok(!reservations.some(l => l.intersectsTriangle(triangle)), `${room.id}: actual triangle blocks lamp`);
              }
            });
          }
        });
        const expanded = world.colliders.map((box, i) => {
          assert.ok(!box.isEmpty() && [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite), `collider ${i}`);
          return box.clone().expandByScalar(.28);
        });
        const itemBounds = [...world.interactables].map(([id, object]) => ({ id, object, box: new Box3().setFromObject(object).expandByScalar(.28) }));
        function clear(p: Vector3, label: string, includeDoors = false) {
          assert.ok(p.toArray().every(Number.isFinite) && p.y >= -1.25 && p.y <= 2.75, `${label}: valid camera pose`);
          const blocker = expanded.find(b => b.containsPoint(p));
          assert.ok(!blocker, `${label}: static collider at ${p.toArray()}, expanded bounds ${blocker?.min.toArray()} -> ${blocker?.max.toArray()}`);
          assert.ok(!itemBounds.some(item => visible(item.object) && item.box.containsPoint(p)), `${label}: item collider at ${p.toArray()}`);
          for (const [dx, dz] of [[0, 0], [.28, 0], [-.28, 0], [0, .28], [0, -.28]]) {
            assert.ok(world.walkable.some(b => b.containsPoint(p.clone().add(new Vector3(dx, 0, dz)))), `${label}: outside walkable union`);
          }
          if (includeDoors) for (const [id, door] of world.doors) if (!state.opened.includes(id)) {
            assert.ok(!door.bounds.clone().expandByScalar(.28).containsPoint(p), `${label}: closed door`);
          }
        }
        await t.test('centreline routes and item approaches stay clear through every stage', () => {
          const checkState = (label: string) => {
            const before = JSON.stringify(state);
            world.update(state, 10 + state.inventory.length); world.root.updateMatrixWorld(true);
            assert.equal(JSON.stringify(state), before, 'art must not mutate progression');
            const covered = new Set<string>();
            for (const edge of level.edges) {
              const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
              covered.add(a.id); covered.add(b.id);
              const steps = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .25);
              for (let n = 0; n <= steps; n++) clear(new Vector3(a.x + (b.x - a.x) * n / steps, 0, a.z + (b.z - a.z) * n / steps), `${label}/${edge.id}`);
              const [doorX, doorZ] = expeditionDoorPosition(a, b);
              if (!state.opened.includes(edge.id)) assert.ok(world.doors.get(edge.id)!.bounds.containsPoint(new Vector3(doorX, 0, doorZ)), 'closed door remains intentional blocker');
            }
            assert.equal(covered.size, level.rooms.length);
            for (const item of level.items) {
              const target = world.interactables.get(item.id)!.getWorldPosition(new Vector3());
              const approach = target.clone().add(new Vector3(0, 0, 2));
              approach.y = Math.max(-1.25, Math.min(2.75, approach.y));
              assert.ok(approach.distanceTo(target) <= 3.4, `${item.id}: actual target within interaction reach`);
              clear(approach, `${label}/${item.id}`, true);
            }
          };
          checkState('fresh');
          for (const stage of level.stages) {
            for (const id of [...stage.objectives, stage.terminal]) assert.equal(interactExpedition(level, state, id).ok, true, id);
            for (const edge of level.edges) if (canOpenDoor(level, state, edge.id)) assert.equal(openDoor(level, state, edge.id).ok, true);
            checkState(stage.id);
          }
          for (const item of level.items) if (!state.collected.includes(item.id)) {
            assert.equal(interactExpedition(level, state, item.id).ok, true, item.id);
            if (item.kind === 'cache') assert.equal(interactExpedition(level, state, item.id).ok, true);
          }
          checkState('all-collected');
        });
        await t.test('every hall anchor is clear and looks toward its landmark', () => {
          assert.equal(world.anchors.length, level.rooms.filter(r => r.role === 'hall').length);
          assert.equal(new Set(world.anchors.map(a => a.room)).size, world.anchors.length, 'one view per hall');
          for (const anchor of world.anchors) {
            const view = new Vector3(...anchor.view);
            clear(view, anchor.room, true);
            assert.ok([...anchor.position, anchor.yaw, anchor.pitch].every(Number.isFinite));
            const forward = new Vector3(0, 0, -1).applyEuler(new Euler(anchor.pitch, anchor.yaw, 0, 'YXZ'));
            // Facility views declare yaw/pitch directly; world.position is a room-centre label, not a look-at target.
            const hall = world.root.getObjectByName(`facilities.${anchor.room}`)!;
            assert.ok(hall);
            const ray = new Raycaster(view, forward, .01, 30);
            const hit = ray.intersectObject(world.root, true).find(hit => visible(hit.object));
            let seesLandmark = !!hit && descendant(hit.object, hall);
            // Open rings/racks may have empty centres. Test actual surface samples
            // inside the preview's 54-degree field of view, not just its centre ray.
            hall.traverse(node => {
              if (seesLandmark || !(node instanceof Mesh)) return;
              const positions = node.geometry.getAttribute('position');
              for (let i = 0; i < positions.count && !seesLandmark; i += Math.max(1, Math.floor(positions.count / 48))) {
                const surface = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
                const direction = surface.sub(view).normalize();
                if (direction.dot(forward) < Math.cos(27 * Math.PI / 180)) continue;
                ray.set(view, direction);
                const first = ray.intersectObject(world.root, true).find(hit => visible(hit.object));
                seesLandmark = !!first && descendant(first.object, hall);
              }
            });
            assert.ok(seesLandmark, `${anchor.room}: no visible landmark surface within anchor field of view`);
          }
        });
        await t.test('both directions have correct physical signs, connected routes and door statuses', () => {
          const navigation = world.root.getObjectByName(`expedition-wayfinding.${level.id}`)!;
          assert.ok(navigation);
          const signs = navigation.children.filter(node => Array.isArray(node.userData.routes));
          assert.equal(signs.length, level.edges.length * 2);
          for (const edge of level.edges) for (const [fromId, toId] of [[edge.from, edge.to], [edge.to, edge.from]]) {
            const matching = signs.filter(sign => sign.userData.edgeId === edge.id && sign.userData.from === fromId);
            assert.equal(matching.length, 1);
            const sign = matching[0], data = sign.userData;
            const from = level.rooms.find(r => r.id === fromId)!, to = level.rooms.find(r => r.id === toId)!;
            assert.equal(data.to, toId); assert.equal(data.destination, toId);
            assert.deepEqual(data.direction, [Math.sign(to.x - from.x), Math.sign(to.z - from.z)]);
            assert.ok(Math.abs(data.distanceMeters - Math.hypot(to.x - from.x, to.z - from.z)) < 1e-6);
            const normal = new Vector3(0, 0, 1).transformDirection(sign.matrixWorld);
            assert.ok(normal.dot(new Vector3(from.x, sign.position.y, from.z).sub(sign.getWorldPosition(new Vector3())).normalize()) > .99, 'printed face points into source room');
            const floor = navigation.children.find(node => node.name.startsWith('wayfinding.floor.') && node.userData.edgeId === edge.id && node.userData.from === fromId);
            assert.ok(floor && floor.userData.to === toId, 'matching floor direction');
            for (const route of data.routes) {
              let at = fromId, distance = 0;
              assert.equal(route.edgeIds[0], edge.id);
              for (const id of route.edgeIds) {
                const step = level.edges.find(e => e.id === id)!; assert.ok(step);
                const next = step.from === at ? step.to : step.to === at ? step.from : undefined;
                assert.ok(next, 'hint follows connected edges');
                const a = level.rooms.find(r => r.id === at)!, b = level.rooms.find(r => r.id === next)!;
                distance += Math.hypot(a.x - b.x, a.z - b.z); at = next;
              }
              assert.equal(at, route.room); assert.ok(Math.abs(route.distance - distance) < 1e-6);
            }
          }
          for (const phase of ['fresh', 'permit', 'open', 'stale'] as const) {
            const display: ExpeditionState = newExpeditionState(level);
            if (phase === 'permit' || phase === 'open') display.inventory = level.items.flatMap(item => item.grants ?? []);
            if (phase === 'open' || phase === 'stale') display.opened = level.edges.map(edge => edge.id);
            if (phase === 'stale') display.levelId = 'wrong-level';
            const before = JSON.stringify(display); world.update(display, 60);
            assert.equal(JSON.stringify(display), before);
            for (const sign of signs) {
              const edge = level.edges.find(e => e.id === sign.userData.edgeId)!;
              const expected = !canOpenDoor(level, display, edge.id) ? 'locked' : display.opened.includes(edge.id) ? 'open' : 'permit';
              assert.equal(sign.userData.status, expected, `${phase}/${edge.id}`);
            }
          }
          finiteGeometry(navigation);
        });
      } finally { world.dispose(); }
      await t.test('world teardown disposes reachable owned resources once, never palette', () => {
        assertCounts(owned, 1); world.dispose(); assertCounts(owned, 1);
        assert.equal(world.root.children.length, 0); assertCounts(sharedDisposal, 0);
      });
    });
    await t.test('seven themes have distinct normalized meshes AND projected silhouettes', () => {
      assert.equal(signatures.length, 7);
      assert.equal(new Set(signatures.map(s => s.mesh)).size, 7, 'mesh signatures must differ');
      assert.equal(new Set(signatures.map(s => s.silhouette)).size, 7, 'projected geometry must differ, not only names/translations');
    });
  } finally { palette.dispose(); }
  assertCounts(sharedDisposal, 1);
});
