import assert from 'node:assert/strict';
import type { PodRun } from '../src/pod/sim/run';
import { HarborRescueNavigation, type HarborRescueNavigationHost } from '../src/pod/view/deepsea/harbor-rescue-navigation';

let available = false, heard = 0, replies = 0, acceptReply = false;
const spoken: string[] = [];
const run = { heading: 0, activeSonarEnabled: false, powered: true, storyCaption: '', storyCaptionLeft: 0 } as unknown as PodRun;
const host: HarborRescueNavigationHost = {
  run, position: { x: 11, y: 0, z: 16 },
  get signalAvailable() { return available; }, phase: 'approach',
  entryCoordinates: [11, 0, 16], photoCoordinates: [60, 0, 27], signalPosition: [57, -1.8, 11],
  onHeard() { heard++; }, onReply() { replies++; return acceptReply; },
  drawActive() {}, speak(text) { spoken.push(text); },
};
const nav = new HarborRescueNavigation(host);
nav.setFrequency(38.4);
assert.equal(nav.analyzeSignal(), null, 'A approach has no rescue carrier');
assert.equal(nav.action('port.play'), false, 'unrecorded audio cannot play');
assert.equal(nav.reply(), false, 'reply requires heard recording');
nav.tick(.5);
available = true;
nav.setFrequency(35);
assert.equal(nav.analyzeSignal(), null, 'wrong frequency cannot capture');
nav.setFrequency(38.4);
assert.ok(nav.analyzeSignal(), 'passive analysis works while active sonar is off');
assert.equal(nav.reply(), false, 'analysis alone is not listening');
available = false;
assert.equal(nav.action('port.play'), true, 'saved recording remains playable after leaving range');
assert.equal(heard, 1);
assert.equal(nav.reply(), false, 'host can defer reply');
assert.equal(nav.replied, false);
acceptReply = true;
assert.equal(nav.reply(), true);
assert.equal(nav.reply(), false, 'accepted reply cannot advance twice');
assert.equal(replies, 2, 'only initial rejected and accepted replies invoke host');
assert.equal(nav.action('port.play'), true);
assert.equal(heard, 1, 'replay cannot trigger discovery twice');
assert.equal(spoken.length, 1);
assert.ok(nav.receivedCoordinates.includes('X60 Y27 DEPTH 1012m'));
const before = { ...host.position };
assert.equal(nav.setWaypoint([60, 0, 27]), true);
assert.deepEqual(host.position, before, 'writing waypoint never moves submarine');
assert.equal(nav.setWaypoint([NaN, 0, 27]), false);
assert.equal(nav.setWaypoint([60, 27]), false);
assert.equal(nav.setWaypoint([10001, 0, 0]), false);
const snapshot = nav.snapshot();
const restored = new HarborRescueNavigation(host);
assert.equal(restored.restore(snapshot), true);
assert.deepEqual(restored.snapshot(), snapshot);
snapshot.target![0] = -7;
assert.equal(restored.target![0], 60, 'restore copies saved target');
assert.equal(restored.restore({ ...restored.snapshot(), frequency: NaN }), false);
assert.equal(restored.restore({ ...restored.snapshot(), target: [0, Infinity, 0] }), false);
assert.equal(restored.target![0], 60, 'rejected restore leaves prior state intact');
nav.setFrequency(99);assert.equal(nav.frequency, 45);
nav.setFrequency(-1);assert.equal(nav.frequency, 35);
nav.setFrequency(NaN);assert.equal(nav.frequency, 35);
console.log('PASS formal rescue navigation: signal gate, tuning, recording/reply order, inert XYZ, snapshot isolation and invalid inputs');

