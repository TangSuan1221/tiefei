import assert from 'node:assert/strict';
import test from 'node:test';
import { createExpedition, newExpeditionState, canOpenDoor, interactExpedition, estimateExpeditionRoute, expeditionDoorPosition, type ExpeditionLevel, type ExpeditionState } from '../src/pod/content/expedition';
import { expeditionPlan } from '../src/pod/content/expedition-layouts';

type Rect = [number, number, number, number];
const overlap = (a: Rect, b: Rect) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1e-6 && Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > 1e-6;
const contains = (a: Rect, b: Rect) => b[0] >= a[0] - 1e-6 && b[1] <= a[1] + 1e-6 && b[2] >= a[2] - 1e-6 && b[3] <= a[3] + 1e-6;
function accessible(level: ExpeditionLevel, state: ExpeditionState) {
  const seen = new Set([level.startRoom]);
  for (const at of seen) for (const edge of level.edges) if (canOpenDoor(level, state, edge.id)) {
    if (edge.from === at) seen.add(edge.to);
    if (edge.to === at) seen.add(edge.from);
  }
  return seen;
}

// Exact graph canonicalization on a seven-room sector: considers all relabelings,
// unlike an edge-ID string which can disguise an isomorphic graph as a new layout.
function topology(level: ExpeditionLevel) {
  const rooms = level.rooms.filter(room => room.sector === 0);
  assert.equal(rooms.length, 7, 'current authored sector contract');
  const adjacency = rooms.map(a => rooms.map(b => +level.edges.some(e =>
    (e.from === a.id && e.to === b.id) || (e.to === a.id && e.from === b.id))));
  let best = '';
  function visit(order: number[], remaining: number[]) {
    if (!remaining.length) {
      let key = '';
      for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) key += adjacency[order[i]][order[j]];
      if (!best || key < best) best = key;
      return;
    }
    for (const n of remaining) visit([...order, n], remaining.filter(v => v !== n));
  }
  visit([], rooms.map((_, i) => i));
  return best;
}
function normalizedGeometry(level: ExpeditionLevel) {
  const rooms = level.rooms.filter(room => room.sector === 0);
  const candidates: string[] = [];
  // Remove axis rotation, mirroring, translation and uniform scale.
  for (const swap of [false, true]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const points = rooms.map(r => ({ x: (swap ? r.z : r.x) * sx, z: (swap ? r.x : r.z) * sz,
      w: swap ? r.depth : r.width, d: swap ? r.width : r.depth }));
    const minX = Math.min(...points.map(p => p.x)), minZ = Math.min(...points.map(p => p.z));
    const scale = Math.max(...points.map(p => p.x - minX), ...points.map(p => p.z - minZ));
    assert.ok(scale > 0);
    candidates.push(points.map(p => [(p.x - minX) / scale, (p.z - minZ) / scale, p.w / scale, p.d / scale]
      .map(v => v.toFixed(6)).join(',')).sort().join('|'));
  }
  return candidates.sort()[0];
}

test('seven plans differ after spatial normalization and exact graph relabeling', () => {
  const levels = Array.from({ length: 7 }, (_, i) => createExpedition(i));
  assert.equal(new Set(levels.map(normalizedGeometry)).size, 7, 'not rotated/scaled copies');
  const keys = levels.map(topology);
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    assert.notEqual(keys[a], keys[b], `themes ${a + 1}/${b + 1}: isomorphic sector graphs`);
  }
});

for (let index = 0; index < 7; index++) {
  test(`layout ${index + 1}: room separation, real corridor doors and no unmodeled shortcuts`, () => {
    const level = createExpedition(index);
    const doorErrors: string[] = [];
    const rectangles = new Map(level.rooms.map(r => {
      assert.ok([r.x, r.z, r.width, r.depth, r.ceiling ?? 4].every(Number.isFinite));
      assert.ok(r.width > .56 && r.depth > .56 && (r.ceiling ?? 4) > 3.03);
      return [r.id, [r.x - r.width / 2, r.x + r.width / 2, r.z - r.depth / 2, r.z + r.depth / 2] as Rect];
    }));
    const entries = [...rectangles];
    for (let a = 0; a < entries.length; a++) for (let b = a + 1; b < entries.length; b++) {
      assert.ok(!overlap(entries[a][1], entries[b][1]), `${entries[a][0]} overlaps ${entries[b][0]}`);
    }
    const corridors = level.edges.map(edge => {
      const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
      assert.ok(a && b && a.id !== b.id);
      assert.ok((a.x === b.x) !== (a.z === b.z), `${edge.id}: straight orthogonal corridor`);
      assert.ok(Number.isFinite(edge.width) && edge.width > .56);
      const alongX = a.z === b.z, half = edge.width / 2;
      const rect: Rect = alongX ? [Math.min(a.x, b.x), Math.max(a.x, b.x), a.z - half, a.z + half]
        : [a.x - half, a.x + half, Math.min(a.z, b.z), Math.max(a.z, b.z)];
      for (const [id, room] of rectangles) if (id !== a.id && id !== b.id) assert.ok(!overlap(rect, room), `${edge.id} crosses unrelated ${id}`);
      const [x, z] = expeditionDoorPosition(a, b);
      // Matches the world door slab, including its thickness, not only centre point.
      const door: Rect = alongX ? [x - .12, x + .12, z - half, z + half] : [x - half, x + half, z - .12, z + .12];
      assert.ok(contains(rect, door), `${edge.id}: door slab outside corridor`);
      for (const [id, room] of rectangles) if (overlap(door, room)) doorErrors.push(`${edge.id}: door slab inside room ${id}`);
      return { edge, rect };
    });
    for (let a = 0; a < corridors.length; a++) for (let b = a + 1; b < corridors.length; b++) {
      const left = corridors[a], right = corridors[b];
      if (!overlap(left.rect, right.rect)) continue;
      const shared = [left.edge.from, left.edge.to].filter(id => [right.edge.from, right.edge.to].includes(id));
      const intersection: Rect = [Math.max(left.rect[0], right.rect[0]), Math.min(left.rect[1], right.rect[1]), Math.max(left.rect[2], right.rect[2]), Math.min(left.rect[3], right.rect[3])];
      assert.ok(shared.some(id => contains(rectangles.get(id)!, intersection)), `${left.edge.id}/${right.edge.id}: unmodeled corridor junction can bypass doors`);
    }
    const [x, z] = level.spawn;
    assert.ok(contains(rectangles.get(level.startRoom)!, [x - .28, x + .28, z - .28, z + .28]), 'spawn body inside start room');
    for (const item of level.items) {
      const room = level.rooms.find(room => room.id === item.room)!; assert.ok(room);
      const x = room.x + item.x, z = room.z + item.z;
      assert.ok(contains(rectangles.get(room.id)!, [x - .75, x + .75, z - .75, z + .75]), `${item.id}: item envelope`);
      assert.ok(contains(rectangles.get(room.id)!, [x - .28, x + .28, z + 2 - .28, z + 2 + .28]), `${item.id}: current front approach`);
    }
    for (const room of level.rooms.filter(room => room.role === 'hall' || /\.r0$/.test(room.id))) {
      const { plan, swap } = expeditionPlan(index, room.sector);
      const [width, depth, ceiling] = room.role === 'hall' ? plan.hall : plan.entry;
      assert.deepEqual([room.width, room.depth, room.ceiling], [swap ? depth : width, swap ? width : depth, ceiling],
        `${room.id}: actual dimensions match reviewed expeditionPlan override`);
    }
    assert.deepEqual(doorErrors, [], 'all misplaced door slabs');
  });

  test(`layout ${index + 1}: exact stage reachability and auditable 20–30 minute estimate`, t => {
    const level = createExpedition(index), state = newExpeditionState(level);
    for (const [stageIndex, stage] of level.stages.entries()) {
      const reached = accessible(level, state);
      const stageRoom = level.items.find(item => item.id === stage.terminal)!.room;
      const sector = level.rooms.find(room => room.id === stageRoom)!.sector;
      const expected = new Set(level.rooms.filter(room => room.sector <= sector).map(room => room.id));
      assert.deepEqual(reached, expected, `stage ${stageIndex}: no inaccessible tasks or gate bypass`);
      for (const id of [...stage.objectives, stage.terminal]) {
        assert.ok(reached.has(level.items.find(item => item.id === id)!.room), id);
        assert.equal(interactExpedition(level, state, id).ok, true, id);
      }
    }
    assert.equal(accessible(level, state).size, level.rooms.length);
    const estimate = estimateExpeditionRoute(level);
    const walked = estimate.roomRoute.slice(1).reduce((sum, id, i) => {
      const a = level.rooms.find(r => r.id === estimate.roomRoute[i])!, b = level.rooms.find(r => r.id === id)!;
      assert.ok(level.edges.some(e => (e.from === a.id && e.to === b.id) || (e.to === a.id && e.from === b.id)));
      return sum + Math.hypot(a.x - b.x, a.z - b.z);
    }, 0);
    const detours = estimate.itemOrder.reduce((sum, id) => { const item = level.items.find(item => item.id === id)!; return sum + 2 * Math.hypot(item.x, item.z); }, 0);
    assert.ok(Math.abs(estimate.distanceMeters - walked - detours) < 1e-6);
    assert.equal(estimate.travelSeconds, estimate.distanceMeters / estimate.speedMetersPerSecond);
    t.diagnostic(`Model only: ${estimate.estimatedMinutes.toFixed(2)} min, ${estimate.distanceMeters.toFixed(1)}m; not a human playtest`);
    assert.ok(estimate.estimatedMinutes >= 20 && estimate.estimatedMinutes <= 30, `model ${estimate.estimatedMinutes.toFixed(2)}min outside preserved target`);
  });
}
