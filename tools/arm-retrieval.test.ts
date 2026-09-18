import assert from 'node:assert/strict';
import test from 'node:test';
import { ARM, beginHaul, blockRetract, newArm, stepArm } from '../src/pod/sim/manipulator.ts';

const conditions = { atCamera: true, atSalvage: false, powered: true, lit: true, onStation: true };

test('等待选择物资不会过热、损坏或强制收回', () => {
  const arm = newArm();
  arm.phase = 'aiming';
  arm.out = 1;
  for (let i = 0; i < 180; i++) {
    const events = stepArm(arm, 1, conditions);
    assert.ok(!events.some(e => e.kind === 'strain' || e.kind === 'torn'));
    assert.equal(arm.phase, 'aiming');
  }
  assert.equal(blockRetract(arm, conditions), 'ok');
});

test('旧卡爪状态也能在断电时应急收回，不需要拽或弃臂', () => {
  const arm = newArm();
  arm.phase = 'jammed';
  arm.out = 1;
  arm.grabLeft = 0.1;
  const blackout = { ...conditions, powered: false, lit: false };
  assert.equal(blockRetract(arm, blackout), 'ok');
  beginHaul(arm);
  const events = stepArm(arm, ARM.haulSec + 0.01, blackout);
  assert.equal(arm.phase, 'stowed');
  assert.ok(!events.some(e => e.kind === 'torn'));
});
