import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExpedition, newExpeditionState, interactExpedition, canOpenDoor, openDoor, estimateExpeditionRoute, expeditionDoorPosition,
} from '../src/pod/content/expedition.ts';
import type { ExpeditionLevel, ExpeditionState } from '../src/pod/content/expedition.ts';
import { EXPEDITION_LAYOUTS } from '../src/pod/content/expedition-layouts';

function reachable(level: ExpeditionLevel, state: ExpeditionState): Set<string> {
  const seen = new Set([level.startRoom]);
  for (const at of seen) for (const edge of level.edges) {
    if (!canOpenDoor(level, state, edge.id)) continue;
    if (edge.from === at) seen.add(edge.to);
    if (edge.to === at) seen.add(edge.from);
  }
  return seen;
}
const overlap = (a: number[], b: number[]) => a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3];
const names = ['三号采矿区·破口处理大厅', '警戒漆分流站', '热泉计时廊', '四号伪补给站', '永不停机的散热井', '井壁伴行廊', 'D-9 无垢升降井'];

for (let index = 0; index < 7; index++) {
  test(`level ${index}: deterministic, distinct, valid axis-aligned physical geometry`, () => {
    const level = createExpedition(index);
    assert.deepEqual(level, createExpedition(index));
    assert.equal(level.name, names[index]);
    assert.equal(level.rooms.length, 28);
    const ids = [...level.rooms, ...level.edges, ...level.items].map(o => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(level.rooms.map(r => r.sector)).size, 4);
    const bounds = level.rooms.map(r => [r.x - r.width / 2, r.x + r.width / 2, r.z - r.depth / 2, r.z + r.depth / 2]);
    for (let a = 0; a < bounds.length; a++) for (let b = a + 1; b < bounds.length; b++) assert.equal(overlap(bounds[a], bounds[b]), false);
    const corridors: { endpoints: string[]; bounds: number[] }[] = [];
    for (const edge of level.edges) {
      const a = level.rooms.find(r => r.id === edge.from)!;
      const b = level.rooms.find(r => r.id === edge.to)!;
      assert.ok(a && b);
      assert.ok((a.x === b.x) !== (a.z === b.z));
      assert.ok(Number.isFinite(edge.width) && edge.width > .56, 'corridor admits the runtime body');
      const half = edge.width / 2;
      const corridor = a.x === b.x
        ? [a.x - half, a.x + half, Math.min(a.z, b.z), Math.max(a.z, b.z)]
        : [Math.min(a.x, b.x), Math.max(a.x, b.x), a.z - half, a.z + half];
      corridors.push({ endpoints: [a.id, b.id], bounds: corridor });
      level.rooms.forEach((r, n) => {
        if (r.id !== a.id && r.id !== b.id) assert.equal(overlap(corridor, bounds[n]), false, `${edge.id} crosses ${r.id}`);
      });
      // The centred door belongs to the corridor, not either room interior.
      const [dx, dz] = expeditionDoorPosition(a, b);
      for (const rect of bounds) assert.equal(dx > rect[0] && dx < rect[1] && dz > rect[2] && dz < rect[3], false);
      if (a.sector !== b.sector) assert.equal(edge.requires?.length, 1);
    }
    for (let a = 0; a < corridors.length; a++) for (let b = a + 1; b < corridors.length; b++) {
      if (!corridors[a].endpoints.some(id => corridors[b].endpoints.includes(id))) {
        assert.equal(overlap(corridors[a].bounds, corridors[b].bounds), false, 'unmodeled corridor crossing could bypass a gate');
      }
    }
    for (const item of level.items) {
      const room = level.rooms.find(r => r.id === item.room)!;
      assert.ok(room);
      assert.ok(Math.abs(item.x) + 1 < room.width / 2 && Math.abs(item.z) + 1 < room.depth / 2);
    }
    for (let sector = 0; sector < 4; sector++) {
      const rooms = level.rooms.filter(r => r.sector === sector);
      const localEdges = level.edges.filter(e => rooms.some(r => r.id === e.from) && rooms.some(r => r.id === e.to));
      // New plans intentionally include tree/serial sectors as well as loops.
      // Preserve the authored graph exactly rather than imposing the old ring everywhere.
      const expected = EXPEDITION_LAYOUTS[index].links.map(([a,b]) => [a,b].sort((x,y)=>x-y).join('-')).sort();
      const actual = localEdges.map(e => [e.from,e.to].map(id=>Number(id.split('.r').at(-1))).sort((a,b)=>a-b).join('-')).sort();
      assert.deepEqual(actual, expected, 'sector retains all authored connections');
    }
    assert.ok(level.items.some(i => i.kind === 'pickup' || i.kind === 'cache'), 'every level has a physical collectible');
    if (index === 5) assert.equal(level.items.filter(i => i.kind === 'cache').length, 0);
    if (index === 6) assert.ok(level.items.filter(i => i.kind === 'cache').every(i => level.rooms.find(r => r.id === i.room)!.sector === 1));
  });

  test(`level ${index}: all 16 objective orders complete without optional rewards or consumed keys`, () => {
    const level = createExpedition(index);
    for (let order = 0; order < 16; order++) {
      const state = newExpeditionState(level);
      const exit = level.items.find(i => i.kind === 'exit')!;
      for (let s = 0; s < 4; s++) {
        const stage = level.stages[s];
        const snapshot = JSON.stringify(state);
        assert.equal(interactExpedition(level, state, stage.terminal).ok, false);
        assert.equal(interactExpedition(level, state, exit.id).ok, false);
        assert.equal(JSON.stringify(state), snapshot, 'failed actions are nonmutating');
        const accessible = reachable(level, state);
        assert.deepEqual(accessible, new Set(level.rooms.filter(r=>r.sector<=s).map(r=>r.id)), 'no missing rooms or gate bypass');
        const objectiveIds = (order & (1 << s)) ? [...stage.objectives].reverse() : stage.objectives;
        for (const id of objectiveIds) {
          assert.ok(accessible.has(level.items.find(i => i.id === id)!.room));
          assert.equal(interactExpedition(level, state, id).ok, true);
        }
        const inventoryBefore = [...state.inventory];
        assert.equal(interactExpedition(level, state, stage.terminal).ok, true);
        assert.ok(inventoryBefore.every(t => state.inventory.includes(t)));
        const repeated = JSON.stringify(state);
        assert.equal(interactExpedition(level, state, stage.terminal).ok, false);
        assert.equal(JSON.stringify(state), repeated);
        if (s < 3) {
          const gate = level.edges.find(e => e.requires?.includes(stage.grants))!;
          assert.equal(canOpenDoor(level, state, gate.id), true);
          const inventory = [...state.inventory];
          assert.equal(openDoor(level, state, gate.id).ok, true);
          assert.equal(openDoor(level, state, gate.id).ok, true);
          assert.deepEqual(state.inventory, inventory);
          assert.equal(state.opened.filter(id => id === gate.id).length, 1);
        }
      }
      assert.equal(interactExpedition(level, state, exit.id).ok, true);
      assert.equal(state.completed, true);
      assert.equal(state.collected.filter(id => level.items.find(i => i.id === id)!.kind === 'cache').length, 0);
      assert.ok(state.recorded.every(id => state.collected.includes(id)));
    }
  });

  test(`level ${index}: route estimate is executable, auditable and contains 12 required objectives`, () => {
    const level = createExpedition(index);
    const estimate = estimateExpeditionRoute(level);
    const state = newExpeditionState(level);
    assert.equal(estimate.itemOrder.length, 13); // 8 evidence/tool + 4 terminals + exit
    for (const id of estimate.itemOrder) {
      assert.ok(reachable(level, state).has(level.items.find(i => i.id === id)!.room));
      assert.equal(interactExpedition(level, state, id).ok, true);
    }
    assert.equal(state.completed, true);
    assert.equal(estimate.speedMetersPerSecond, 1.6);
    assert.equal(estimate.travelSeconds, estimate.distanceMeters / 1.6);
    assert.equal(estimate.estimatedMinutes, (estimate.travelSeconds + estimate.actionSeconds + estimate.orientationSeconds) / 60);
    assert.ok(estimate.estimatedMinutes >= 20 && estimate.estimatedMinutes <= 30);
    assert.ok(estimateExpeditionRoute(level, { includeOptional: true }).actions > estimate.actions);
    const travelOnly = estimateExpeditionRoute(level, { secondsPerAction: 0, secondsPerRoom: 0 });
    assert.equal(travelOnly.estimatedMinutes, travelOnly.travelSeconds / 60, 'no artificial duration floor');
    assert.ok(travelOnly.estimatedMinutes < estimate.estimatedMinutes);
    for (let n = 1; n < estimate.roomRoute.length; n++) assert.ok(level.edges.some(e =>
      (e.from === estimate.roomRoute[n - 1] && e.to === estimate.roomRoute[n]) ||
      (e.to === estimate.roomRoute[n - 1] && e.from === estimate.roomRoute[n])));
  });
}

test('escort connector is optional, collected once, and included only in the optional route', () => {
  const level = createExpedition(5), state = newExpeditionState(level);
  const pickup = level.items.find(i => i.kind === 'pickup')!;
  assert.equal(pickup.name, '脱落的传感器接头');
  assert.equal(pickup.room, `${level.id}.s0.r3`);
  assert.deepEqual([pickup.x, pickup.z], [-3, -3]);
  assert.ok(reachable(level, state).has(pickup.room));
  assert.equal(interactExpedition(level, state, pickup.id).ok, true);
  assert.deepEqual(state.inventory, pickup.grants);
  assert.deepEqual(state.collected, [pickup.id]);
  assert.deepEqual(state.opened, []);
  assert.deepEqual(state.recorded, []);
  const snapshot = JSON.stringify(state);
  assert.equal(interactExpedition(level, state, pickup.id).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(estimateExpeditionRoute(level).itemOrder.includes(pickup.id), false);
  assert.equal(estimateExpeditionRoute(level, { includeOptional: true }).itemOrder.filter(id => id === pickup.id).length, 1);
  assert.ok(level.items.every(i => !(i.requires ?? []).some(t => pickup.grants!.includes(t))));
  assert.ok(level.edges.every(e => !(e.requires ?? []).some(t => pickup.grants!.includes(t))));
});

test('cache opens first, rewards second, never duplicates; rejected IDs and wrong saves do not mutate', () => {
  const level = createExpedition(0), state = newExpeditionState(level);
  const cache = level.items.find(i => i.kind === 'cache')!;
  assert.equal(interactExpedition(level, state, cache.id).ok, true);
  assert.ok(state.opened.includes(cache.id));
  assert.equal(state.inventory.length, 0);
  assert.equal(state.collected.includes(cache.id), false);
  assert.equal(interactExpedition(level, state, cache.id).ok, true);
  assert.ok(state.collected.includes(cache.id));
  assert.deepEqual(state.inventory, cache.grants);
  const snapshot = JSON.stringify(state);
  assert.equal(interactExpedition(level, state, cache.id).ok, false);
  assert.equal(interactExpedition(level, state, 'missing').ok, false);
  assert.equal(openDoor(level, state, 'missing').ok, false);
  assert.equal(openDoor(level, state, level.edges.find(e => e.lock)!.id).ok, false);
  assert.equal(interactExpedition(createExpedition(1), state, createExpedition(1).items[0].id).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('index bounds, model bounds, fresh ownership and distinct geometry', () => {
  for (const index of [-1, 7, 0.5, NaN, Infinity]) assert.throws(() => createExpedition(index), RangeError);
  const level = createExpedition(0);
  for (const speed of [0, -1, NaN, Infinity]) assert.throws(() => estimateExpeditionRoute(level, { speedMetersPerSecond: speed }), RangeError);
  assert.throws(() => estimateExpeditionRoute(level, { secondsPerAction: -1 }), RangeError);
  assert.throws(() => estimateExpeditionRoute(level, { secondsPerRoom: NaN }), RangeError);
  const signatures = new Set(Array.from({ length: 7 }, (_, i) => JSON.stringify(createExpedition(i).rooms.map(r => [r.x, r.z, r.width, r.depth]))));
  assert.equal(signatures.size, 7);
  const topologySignatures = new Set(Array.from({ length: 7 }, (_, i) => createExpedition(i).edges
    .map(e => `${e.from.split('.').slice(-2).join('.')}>${e.to.split('.').slice(-2).join('.')}`).join('|')));
  assert.equal(topologySignatures.size, 7, 'seven different adjacency graphs, not only rescaled room centres');
  level.rooms[0].x = 9999;
  assert.equal(createExpedition(0).rooms[0].x, 0);
  const first = newExpeditionState(level), second = newExpeditionState(level);
  first.inventory.push('mutated');
  assert.deepEqual(second.inventory, []);
});
