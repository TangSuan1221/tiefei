import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, BufferGeometry, Material, Mesh, Raycaster, Texture, Vector3 } from 'three';
import { canOpenDoor, createExpedition, expeditionDoorPosition, interactExpedition, newExpeditionState } from '../src/pod/content/expedition';
import { createIncidentItems } from '../src/pod/content/expedition-incidents';
import { createIncidentSites } from '../src/pod/view/deepsea/expedition-incident-sites';
import { EXPEDITION_ENVELOPES, passageEnvelope } from '../src/pod/content/expedition-envelopes';
import { createReferenceMaterials } from '../src/pod/view/deepsea/reference-materials';
import { createExpeditionWorld } from '../src/pod/view/deepsea/expedition-world';

const FLOOR = -2, BODY = .28;
const describe = (b: Box3) => `${b.min.toArray()} -> ${b.max.toArray()}`;

for (let index = 0; index < 7; index++) test(`environment ${index + 1}: incident evidence is reachable, optional and survives state serialization`, () => {
  const level = createExpedition(index), incident = createIncidentItems(index, level.rooms);
  const mandatory = new Set(level.stages.flatMap(s => [...s.objectives, s.terminal]));
  assert.equal(incident.length, 8); assert.equal(new Set(incident.map(i => i.id)).size, 8);
  let state = newExpeditionState(level);
  for (const stage of level.stages) {
    const terminal = level.items.find(i => i.id === stage.terminal)!;
    const sector = level.rooms.find(r => r.id === terminal.room)!.sector;
    const reached = new Set([level.startRoom]);
    for (const at of reached) for (const e of level.edges) if (canOpenDoor(level, state, e.id)) {
      if (e.from === at) reached.add(e.to); if (e.to === at) reached.add(e.from);
    }
    const local = incident.filter(i => level.rooms.find(r => r.id === i.room)!.sector === sector);
    assert.deepEqual(local.map(i => i.kind).sort(), ['pickup', 'record']);
    for (const item of local) {
      assert.deepEqual(level.items.find(i => i.id === item.id), item, 'incident is real integrated content');
      assert.ok(reached.has(item.room), `${item.id}: reachable at own stage`);
      assert.ok(!mandatory.has(item.id));
      for (const token of item.grants ?? []) {
        assert.ok(level.edges.every(e => !e.requires?.includes(token)), 'optional evidence never locks doors');
        assert.ok(level.items.every(i => !mandatory.has(i.id) || !i.requires?.includes(token)), 'optional evidence never locks mandatory tasks');
      }
      assert.equal(interactExpedition(level, state, item.id).ok, true);
      state = JSON.parse(JSON.stringify(state));
      assert.ok(state.collected.includes(item.id));
      if (item.kind === 'record') assert.ok(state.recorded.includes(item.id));
      for (const token of item.grants ?? []) assert.equal(state.inventory.filter(t => t === token).length, 1);
      const before = JSON.stringify(state);
      assert.equal(interactExpedition(level, state, item.id).ok, false);
      assert.equal(JSON.stringify(state), before, 'reload never duplicates reward');
    }
    for (const id of [...stage.objectives, stage.terminal]) assert.equal(interactExpedition(level, state, id).ok, true);
  }
});

for (let index = 0; index < 7; index++) test(`environment ${index + 1}: incident bodies have real finite colliders and dispose only owned resources`, () => {
  const level = createExpedition(index), palette = createReferenceMaterials();
  const borrowed = new Set<Material | Texture>();
  for (const value of Object.values(palette)) if (value instanceof Material) {
    borrowed.add(value);
    for (const property of Object.values(value)) if (property instanceof Texture) borrowed.add(property);
  }
  const events = new Map<BufferGeometry | Material | Texture, number>();
  const watch = (r: BufferGeometry | Material | Texture) => {
    if (events.has(r)) return;
    events.set(r, 0); r.addEventListener('dispose', () => events.set(r, events.get(r)! + 1));
  };
  borrowed.forEach(watch);
  const site = createIncidentSites(level, palette);
  try {
    site.root.updateMatrixWorld(true);
    site.root.traverse(node => {
      if (!(node instanceof Mesh)) return;
      const geometry: BufferGeometry = node.geometry;
      watch(geometry);
      for (const attribute of Object.values(geometry.attributes)) for (let i = 0; i < attribute.count; i++) {
        for (let c = 0; c < attribute.itemSize; c++) assert.ok(Number.isFinite(attribute.getComponent(i,c)));
      }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        watch(material); for (const value of Object.values(material)) if (value instanceof Texture) watch(value);
      }
    });
    const metadata = site.root.userData.incidents as Array<{id:string;room:string;colliderStart:number;colliderCount:number;bounds:number[][]}>;
    assert.equal(metadata.length, 8);
    for (const data of metadata) {
      const group = site.root.getObjectByName(data.id)!; assert.ok(group);
      const actual = new Box3().setFromObject(group); assert.ok(!actual.isEmpty());
      assert.deepEqual([actual.min.toArray(), actual.max.toArray()], data.bounds);
      assert.ok(data.colliderCount > 0, `${data.id}: nonempty physical body/debris`);
      const room = level.rooms.find(r => r.id === data.room)!;
      const envelope = new Box3(new Vector3(room.x-room.width/2,-2.02,room.z-room.depth/2), new Vector3(room.x+room.width/2,room.ceiling ?? 4,room.z+room.depth/2));
      assert.ok(envelope.containsBox(actual), `${data.id}: actual geometry outside room`);
      for (const b of site.colliders.slice(data.colliderStart, data.colliderStart+data.colliderCount)) {
        assert.ok(!b.isEmpty() && [...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));
        assert.ok(envelope.containsBox(b), `${data.id}: collider ${describe(b)}`);
        const xAxis = new Box3(new Vector3(room.x-room.width/2,-BODY,room.z-BODY),new Vector3(room.x+room.width/2,BODY,room.z+BODY));
        const zAxis = new Box3(new Vector3(room.x-BODY,-BODY,room.z-room.depth/2),new Vector3(room.x+BODY,BODY,room.z+room.depth/2));
        assert.ok(!b.intersectsBox(xAxis) && !b.intersectsBox(zAxis), `${data.id}: body blocks centre path ${describe(b)}`);
      }
    }
    assert.ok([...events.keys()].some(r => r instanceof BufferGeometry));
  } finally { site.dispose(); }
  site.dispose();
  for (const [resource,count] of events) assert.equal(count, borrowed.has(resource as Material) ? 0 : 1, `${resource.uuid}: ownership disposal`);
  palette.dispose();
  for (const r of borrowed) assert.equal(events.get(r), 1);
});

test('seven authored passage profiles are distinct and vary within every actual level', () => {
  assert.equal(EXPEDITION_ENVELOPES.length, 7);
  const signatures: string[] = [];
  for (let index = 0; index < 7; index++) {
    const level = createExpedition(index), profile = EXPEDITION_ENVELOPES[index];
    const pairs = new Set<string>();
    for (const edge of level.edges) {
      const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
      const n = (id: string) => Number(id.match(/\.r(\d+)$/)![1]);
      const expected = passageEnvelope(index, b.sector, n(a.id), n(b.id));
      assert.deepEqual({ width: edge.width, ceiling: edge.ceiling }, expected, edge.id);
      assert.ok(Number.isFinite(edge.width) && edge.width >= 2.4 && edge.width <= 6.2, edge.id);
      assert.ok(Number.isFinite(edge.ceiling) && edge.ceiling! >= 1.1 && edge.ceiling! <= 5.8, edge.id);
      assert.ok(profile.widths.some(w => w === edge.width) && profile.ceilings.some(h => h === edge.ceiling));
      pairs.add(`${edge.width}/${edge.ceiling}`);
    }
    assert.ok(new Set(level.edges.map(e => e.width)).size > 1, 'actual widths vary');
    assert.ok(new Set(level.edges.map(e => e.ceiling)).size > 1, 'actual ceilings vary');
    signatures.push([...pairs].sort().join('|'));
  }
  assert.equal(new Set(signatures).size, 7, 'actual passage dimensions differ, independent of names');
});

for (let index = 0; index < 7; index++) test(`environment ${index + 1}: physical corridor roofs, door heights and centre-path clearance`, () => {
  const level = createExpedition(index), palette = createReferenceMaterials();
  const world = createExpeditionWorld(level, palette);
  try {
    world.update(newExpeditionState(level), 0); world.root.updateMatrixWorld(true);
    const solids = world.colliders.map(b => b.clone().expandByScalar(BODY));
    for (const edge of level.edges) {
      const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
      const alongX = a.z === b.z, ceiling = edge.ceiling!;
      const [x, z] = expeditionDoorPosition(a, b), door = world.doors.get(edge.id)!;
      assert.ok(door, edge.id);
      assert.ok(door.bounds.min.y >= FLOOR - .02 && door.bounds.max.y <= ceiling + .02,
        `${edge.id}: door collider outside vertical envelope ${FLOOR}..${ceiling}: ${describe(door.bounds)}`);
      assert.ok(door.bounds.containsPoint(new Vector3(x, 0, z)), `${edge.id}: closed door blocks centre`);
      const actualDoor = new Box3().setFromObject(door.mesh);
      assert.ok(actualDoor.min.y >= FLOOR - .02 && actualDoor.max.y <= ceiling + .02,
        `${edge.id}: rendered door exceeds ceiling: ${describe(actualDoor)}`);
      const length = Math.hypot(a.x-b.x, a.z-b.z), steps = Math.ceil(length / .25);
      for (let n = 0; n <= steps; n++) {
        const p = new Vector3(a.x+(b.x-a.x)*n/steps, 0, a.z+(b.z-a.z)*n/steps);
        const blocker = solids.find(c => c.containsPoint(p));
        assert.ok(!blocker, `${edge.id}: static block at ${p.toArray()}, expanded bounds ${blocker && describe(blocker)}`);
        for (const [dx,dz] of [[0,0],[BODY,0],[-BODY,0],[0,BODY],[0,-BODY]]) {
          assert.ok(world.walkable.some(c => c.containsPoint(p.clone().add(new Vector3(dx,0,dz)))), `${edge.id}: missing walkable clearance at ${p.toArray()}`);
        }
      }
      // Probe the clear gap away from the leaf/header, never inside either room.
      const axis = alongX ? 'x' : 'z', size = alongX ? 'width' : 'depth';
      const lo = Math.min(a[axis],b[axis]);
      const lowRoom = a[axis] === lo ? a : b, highRoom = lowRoom === a ? b : a;
      const start = lowRoom[axis] + lowRoom[size]/2, end = highRoom[axis] - highRoom[size]/2;
      assert.ok(end-start > 1, `${edge.id}: nonempty physical gap`);
      const t = start + (end-start)*.25;
      // Avoid an exact coplanar triangle seam in the batched roof. Centreline
      // collision remains sampled above without this surface-probe offset.
      const origin = new Vector3(alongX ? t : x+.013, 0, alongX ? z+.013 : t);
      const ray = new Raycaster(origin, new Vector3(0,1,0), .001, ceiling+1);
      const hits = ray.intersectObject(world.root, true).filter(h => h.object instanceof Mesh && h.object.name.startsWith('static.'));
      assert.ok(hits.some(h => Math.abs(h.point.y-ceiling) < .02), `${edge.id}: no actual roof at y=${ceiling}, hits=${hits.map(h=>h.point.y)}`);
      assert.ok(!world.walkable.some(c => c.containsPoint(origin.clone().setY(ceiling+.05))), `${edge.id}: walkable extends above corridor ceiling`);
    }
  } finally { world.dispose(); palette.dispose(); }
});
