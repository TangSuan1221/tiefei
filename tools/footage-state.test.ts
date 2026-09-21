import assert from 'node:assert/strict';
import test from 'node:test';
import { directFootage, footageCacheKey, type FootageState } from '../src/pod/content/footage-director.ts';
import { buildFootagePrompt } from '../src/pod/content/footage.ts';
import { actAt } from '../src/pod/content/acts.ts';
import { creature } from '../src/pod/content/creatures.ts';
import { PodRun, type FootageRequest } from '../src/pod/sim/run.ts';

function direction(state: FootageState, repeat = 1, act = 1, roll = 0.5) {
  return directFootage({ state, repeat, act, roll, target: 'cre.chorus', visible: false,
    episode: 'test', encounter: 1, capturedAt: 1, lamp: true, noise: 0.1, motion: 0, hull: 1, aim: 0 });
}
function runFixture() {
  const r = new PodRun(42);
  r.frame(0.01); r.huntRecoveryUntil = 9999;
  r.phase = 'site'; r.at = 'camera'; r.lamp = true;
  return r;
}
function expose(r: PodRun) { for (let i = 0; i < 101; i++) r.frame(0.05); }
function capture(r: PodRun): FootageRequest {
  let req: FootageRequest | undefined;
  r.footageSink = v => { req = v; };
  r.beginShoot(); expose(r);
  assert.ok(req);
  return req;
}

test('calm distribution favors fauna/environment and caps rare traces', () => {
  let traces = 0, life = 0;
  for (let i = 0; i < 1000; i++) {
    const d = direction('calm', 1, 6, i / 1000);
    traces += +d.evidence; life += +(d.fauna.length > 0);
    assert.equal(d.identified, null);
    assert.ok(d.fauna.every(id => creature(id).kin === 'fauna'));
  }
  assert.equal(traces, 80); assert.ok(life > 600);
  assert.equal(direction('calm', 1, 0, 0).evidence, false);
});

test('every unresolved state guarantees evidence without aim or illumination', () => {
  for (const state of ['anomaly', 'pursuit', 'attack'] as const) {
    const d = direction(state);
    assert.equal(d.evidence, true); assert.ok(d.trace); assert.equal(d.identified, state==='attack'?'cre.chorus':null);
    const p = buildFootagePrompt({ leg: actAt(1).leg, creature: null, depth: 1200, lamp: false, corruption: 0.8,
      direction: { ...d, lamp: false }, tracesOnly: true });
    assert.ok(p.includes(d.trace)); assert.ok(p.includes('No visible monster anatomy'));
  }
});

test('repeat intensity rises then caps; late acts increase dread', () => {
  const levels = Array.from({ length: 10 }, (_, i) => direction('anomaly', i + 1).intensity);
  assert.deepEqual(levels.slice(0, 6), [1, 2, 3, 4, 5, 6]);
  assert.equal(levels[9], 6);
  assert.ok(direction('anomaly', 1, 6).intensity > direction('anomaly', 1, 0).intensity);
});

test('calm prompt excludes dormant monsters and low-SAN invented faces', () => {
  const p = buildFootagePrompt({ leg: actAt(5).leg, creature: creature('cre.angler'),
    fauna: [creature('cre.chorus'), creature('cre.jelly')], depth: 1600, lamp: true, corruption: 1, san: 10,
    story: 'escort', direction: direction('calm', 1, 5, 0.5) });
  assert.ok(!p.includes(creature('cre.angler').footage));
  assert.ok(!p.includes(creature('cre.chorus').footage));
  assert.ok(!p.includes('a face that is not in the water'));
  assert.ok(!p.includes('pale shape keeping station'));
});

test('shutter snapshot survives a state change during exposure', () => {
  const r = runFixture();
  let req: FootageRequest | undefined; r.footageSink = v => { req = v; };
  r.beginShoot(); const shotState = r.shot.capture!.direction!.state;
  r.spawnThreat('cre.chorus', 90); r.lamp = false;
  expose(r); assert.ok(req);
  assert.equal(shotState, 'calm');
  assert.ok(req.prompt.includes('Template: calm'));
  assert.ok(req.prompt.includes('lamp on'));
  assert.equal(r.tapes.at(-1)!.caughtThreat, null);
});

test('repeated unresolved shots generate distinct prompts/cache keys and preserve clues', () => {
  const r = runFixture(); r.spawnThreat('cre.chorus', 300); r.threat!.bearing = 2;
  const a = capture(r); a.settle(a.token, true);
  const first = r.tapes.at(-1)!.direction!;
  const b = capture(r); b.settle(b.token, true);
  const second = r.tapes.at(-1)!.direction!;
  assert.equal(first.repeat, 1); assert.equal(second.repeat, 2);
  assert.ok(second.intensity > first.intensity);
  assert.notEqual(a.cacheKey, b.cacheKey);
  assert.ok(b.prompt.includes(second.trace)); assert.ok(b.fallbackPrompt.includes(second.trace));
  assert.equal(r.tapes.length, 2);
});

test('fallback preserves evidence but does not grant monster identification', () => {
  const r = runFixture(); r.spawnThreat('cre.chorus', 300); r.threat!.bearing = 0;
  const req = capture(r); req.settle(req.token, true, undefined, true);
  const tape = r.tapes.at(-1)!;
  assert.equal(tape.caughtThreat, null); assert.equal(tape.direction!.evidence, true);
  assert.equal(r.threat!.known, false);
  r.analyzeTape(); assert.ok(tape.report.includes(tape.direction!.traceCN));
});

test('same species in a new encounter is not identified by an old callback', () => {
  const r = runFixture(); r.spawnThreat('cre.chorus', 300); r.threat!.bearing = 0;
  const req = capture(r);
  r.spawnThreat('cre.chorus', 300);
  req.settle(req.token, true);
  assert.equal(r.threat!.known, false);
  r.analyzeTape(); assert.equal(r.threat!.known, false);
});

test('resolution gives aftermath; a new encounter resets repetition', () => {
  const r = runFixture(); r.spawnThreat('cre.chorus', 300);
  const a = capture(r); a.settle(a.token, true);
  r.tryCounter({ kind: 'blackout' });
  const b = capture(r); b.settle(b.token, true);
  assert.equal(r.tapes.at(-1)!.direction!.state, 'aftermath');
  r.spawnThreat('cre.chorus', 300);
  const c = capture(r); c.settle(c.token, true);
  assert.equal(r.tapes.at(-1)!.direction!.repeat, 1);
});

test('cache identity uses both full prompts, stable for an exact replay', () => {
  assert.equal(footageCacheKey('a', 'b'), footageCacheKey('a', 'b'));
  assert.notEqual(footageCacheKey('a', 'b'), footageCacheKey('a', 'c'));
  assert.notEqual(footageCacheKey('a', 'b'), footageCacheKey('c', 'b'));
});

test('unprocessed tape cannot unlock knowledge before its fallback result', () => {
  const r = runFixture(); r.spawnThreat('cre.chorus', 300); r.threat!.bearing = 0;
  const req = capture(r);
  r.analyzeTape();
  assert.equal(r.threat!.known, false); assert.equal(r.tapes.at(-1)!.analyzed, false);
  req.settle(req.token, true, undefined, true);
  r.analyzeTape(); assert.equal(r.tapes.at(-1)!.analyzed, true);
  assert.equal(r.threat!.known, false);
});

test('calm repetitions do not create escalating horror; aftermath never escalates', () => {
  assert.equal(direction('calm', 99, 6, 0.5).intensity, 0);
  assert.equal(direction('aftermath', 99, 6).intensity, 1);
});

test('completed precursor recordings carry into the continuing encounter', () => {
  const r = runFixture(); r.suspicion = 15;
  const a = capture(r); a.settle(a.token, true);
  assert.equal(r.tapes.at(-1)!.direction!.state, 'anomaly');
  r.spawnThreat('cre.chorus', 300);
  const b = capture(r); b.settle(b.token, true);
  assert.equal(r.tapes.at(-1)!.direction!.repeat, 2);
});
