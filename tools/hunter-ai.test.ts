import assert from 'node:assert/strict';
import test from 'node:test';
import { PodRun } from '../src/pod/sim/run.ts';
import { hunterProfile } from '../src/pod/content/hunters.ts';
import { creature } from '../src/pod/content/creatures.ts';

function setup(act = 1) {
  const r = new PodRun(42);
  r.legIndex = act;
  r.frame(0.01);
  r.huntRecoveryUntil = 0;
  r.phase = 'site';
  r.lamp = true;
  r.throttle = 2;
  return r;
}
function step(r: PodRun, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 20); i++) r.frame(0.05);
}

test('light and machinery attract a hunter; silent darkness loses suspicion', () => {
  const loud = setup(3);
  step(loud, 16);
  assert.ok(loud.threat);
  const quiet = setup(3);
  quiet.lamp = false; quiet.throttle = 0; quiet.suspicion = 2;
  step(quiet, 16);
  assert.equal(quiet.threat, null);
  assert.equal(quiet.suspicion, 0);
});

test('attack requires a full audible response window even after a noise burst', () => {
  const r = setup();
  const cues: string[] = [];
  r.onCue = c => cues.push(c);
  r.spawnThreat('cre.chorus', 0.01);
  const hull = r.hull;
  step(r, 0.1);
  assert.equal(r.threat?.behavior, 'warning');
  assert.ok(cues.includes('hull.crack'));
  r.addNoise(100);
  r.tryCounter({ kind: 'fullahead' });
  step(r, 5);
  assert.equal(r.hull, hull);
  step(r, 8);
  assert.ok(r.hull < hull);
});

test('correct response during warning repels, and recovery prevents immediate reattack', () => {
  const r = setup(3);
  r.spawnThreat('cre.angler', 0.01);
  step(r, 0.1);
  const hull = r.hull;
  r.toggleLamp();
  assert.equal(r.threat?.phase, 'repelled');
  step(r, 5);
  assert.equal(r.threat, null);
  assert.equal(r.hull, hull);
  assert.ok(r.huntRecoveryUntil > r.clock);
});

test('live camera cannot identify; offline returned tape can', () => {
  const r = setup();
  r.at = 'camera';
  r.spawnThreat('cre.chorus', 90);
  r.threat!.bearing = r.camPan;
  step(r, 3);
  assert.equal(r.threat!.known, false);
  r.beginShoot();
  step(r, 5.1);
  assert.equal(r.shot.phase, 'ready');
  assert.equal(r.threat!.known, true);
  assert.equal(r.tapes.at(-1)?.caughtThreat, 'cre.chorus');
});

test('late intrusion kills through damaged hull without showing a monster', () => {
  const r = setup(6);
  r.hull = 0.8;
  r.spawnThreat('cre.runner', 0.01);
  step(r, 9);
  assert.equal(r.outcome.kind, 'dead');
  if (r.outcome.kind === 'dead') assert.equal(r.outcome.cause, 'listener');
});

test('difficulty increases and the first act retains a longer response window', () => {
  const c = creature('cre.chorus');
  assert.ok(hunterProfile(c, 6).rank > hunterProfile(c, 0).rank);
  assert.ok(hunterProfile(c, 0).warning > hunterProfile(c, 6).warning);
});

test('a shattered hull ends in implosion before intrusion', () => {
  const r = setup(6);
  r.hull = 0.2;
  r.spawnThreat('cre.runner', 0.01);
  step(r, 9);
  assert.equal(r.outcome.kind, 'dead');
  if (r.outcome.kind === 'dead') assert.equal(r.outcome.cause, 'implosion');
});

test('eclipse drains power and corrosion leaves a persistent leak', () => {
  const eclipse = setup(3);
  const power = eclipse.power;
  eclipse.spawnThreat('cre.angler', 0.01);
  step(eclipse, 11);
  assert.ok(eclipse.power < power - 0.2);
  assert.equal(eclipse.lamp, false);
  const rust = setup(4);
  const leak = rust.leak;
  rust.spawnThreat('cre.acid', 0.01);
  step(rust, 11);
  assert.ok(rust.leak > leak + 0.004);
});
