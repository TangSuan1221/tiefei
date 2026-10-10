import assert from 'node:assert/strict';
import type { PodRun } from '../src/pod/sim/run';
import { HarborRescueNavigation, VOICE_CAPTURE_RANGE, type HarborRescueNavigationHost } from '../src/pod/view/deepsea/harbor-rescue-navigation';

let heard = 0;
const run = { heading: 0, activeSonarEnabled: true, sonarPulseEnabled: false, powered: true, storyCaption: '', storyCaptionLeft: 0 } as unknown as PodRun;
const monster = { position: { x: 200, y: 0, z: 200 }, hunting: false };
const signal: [number, number, number] = [57, -1.2, 11];
const host: HarborRescueNavigationHost = {
  run, position: { x: 30, y: 0, z: 27 }, signalAvailable: true, phase: 'harbor', serialDialogue: true,
  entryCoordinates: [11, 0, 16], photoCoordinates: [60, 0, 27], signalPosition: signal, monster,
  onHeard() { heard++; }, onReply() { return true; }, drawActive() {},
};
const nav = new HarborRescueNavigation(host);
const step = (seconds: number) => { for (let t = 0; t < seconds; t += .05) nav.tick(.05); };
const kinds = () => nav.passiveContacts.map(c => c.kind);

// Far from the fixed transmitter the carrier is scattered and cannot be locked even when tuned exactly.
assert.ok(Math.hypot(30 - signal[0], 27 - signal[2]) > VOICE_CAPTURE_RANGE);
nav.setFrequency(38.4);
step(3);
assert.ok(kinds().includes('scatter'), 'far carrier is scattered');
assert.equal(nav.passiveFocus.contact?.kind, 'scatter');
assert.equal(nav.passiveFocus.locked, false, 'scattered carrier never locks');
assert.equal(heard, 0, 'scattered carrier does not deliver the distress call');
assert.equal(nav.pendingRadioCount, 1);

// Inside range the same carrier condenses into a lockable voice band and plays.
host.position.x = 50; host.position.z = 20;
step(1);
assert.equal(heard, 1, 'clear carrier locks and plays');
assert.equal(nav.pendingRadioCount, 0);
assert.equal(nav.radioRecords.at(-1)?.kind, 'voice');
assert.ok(Number.isFinite(nav.radioRecords.at(-1)?.at), 'voice record is time-stamped');

// The unregistered source appears only when near, is identified as ???, and logs once per encounter.
assert.ok(!kinds().includes('unknown'), 'distant creature is inaudible');
monster.position = { x: 60, y: 0, z: 22 };
step(.4);
const unknown = nav.passiveContacts.find(c => c.kind === 'unknown');
assert.ok(unknown && unknown.label === '???', 'creature shows as ???');
assert.ok(!('distance' in unknown!), 'passive contact carries no range');
nav.setFrequency(unknown!.frequency);
step(1);
assert.equal(nav.passiveFocus.locked, true);
const logged = nav.radioRecords.filter(r => r.kind === 'unknown').length;
assert.equal(logged, 1, 'locked ??? is archived');
assert.ok(!/怪物|creature|爪|脊/.test(nav.radioRecords.at(-1)!.text), 'archive does not describe anatomy');
step(5);
assert.equal(nav.radioRecords.filter(r => r.kind === 'unknown').length, 1, 'no duplicate log while held');

// Own active pulse shows as a separate source only while pulsing.
(run as { sonarPulseEnabled: boolean }).sonarPulseEnabled = true;
step(.2);
assert.ok(kinds().includes('self'));
(run as { sonarPulseEnabled: boolean }).sonarPulseEnabled = false;
step(.2);
assert.ok(!kinds().includes('self'));

// Waterfall rows carry distinct bins and the snapshot round-trips records and clock.
assert.ok(nav.passiveRows.length > 0 && nav.passiveRows[0]!.length === 120);
const saved = structuredClone(nav.snapshot());
const restored = new HarborRescueNavigation(host);
assert.equal(restored.restore(saved), true);
assert.deepEqual(restored.radioRecords, nav.radioRecords);
assert.equal(HarborRescueNavigation.validateSnapshot({ ...saved, clock: -1 }), false);
const legacy = { ...saved } as Record<string, unknown>; delete legacy.clock;
assert.equal(HarborRescueNavigation.validateSnapshot(legacy), true, 'older saves without clock stay valid');

console.log('PASS passive sonar: scattered carrier gate, capture range, ??? contact/archive, own pulse, rows and snapshot');
