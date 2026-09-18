/** 机械臂回归：npx tsx --test tools/manipulator.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ARM, armAimHint, beginExtend, beginGrip, beginHaul, newArm, stepArm } from '../src/pod/sim/manipulator.ts';
import { PodRun } from '../src/pod/sim/run.ts';
import type { ContainerState } from '../src/pod/content/containers.ts';
import type { RoomGeometry } from '../src/pod/view/roomview.ts';

const rad = (deg: number) => deg * Math.PI / 180;
const posAt = (yaw: number, pitch: number, dist = 2.3) => ({
  x: Math.sin(rad(yaw)) * Math.cos(rad(pitch)) * dist,
  y: Math.cos(rad(yaw)) * Math.cos(rad(pitch)) * dist,
  z: Math.sin(rad(pitch)) * dist,
});
const conditions = { atCamera: true, atSalvage: false, powered: true, lit: true, onStation: true };

function fixture() {
  const run = new PodRun(42);
  run.phase = 'site';
  run.at = 'camera';
  run.lamp = true;
  run.heading = 0;
  run.pitch = 0;
  run.camPan = 0;
  run.camTilt = 0;
  run.cabinPos = { x: 0, y: 0, z: 0 };
  // 小目标用于验证准星确实落在箱面外时的方向提示；贴近大箱面另有回归。
  // 水平约 8°，合成偏角约 14°，距离 2.3 米。
  const geo: RoomGeometry = {
    nodeId: 'arm-test', label: '测试货箱', half: { x: 10, y: 10, z: 10 },
    doors: [], quads: [],
    obstacles: [{ id: 'crate-test', kind: 'crate', pos: posAt(8, 12), size: { x: 0.4, y: 0.4, z: 0.4 } }],
  };
  run.roomGeo = () => geo;
  const container: ContainerState = {
    obstacleId: 'crate-test', nodeId: geo.nodeId, kind: 'supply', seal: 'bone',
    searched: 0, passes: 3, opened: false, exhausted: false,
    loot: [[['sup.tape', 1]], [], [['sup.tape', 1]]], noise: 0, cost: 0, risk: 0,
  };
  run.containers.set(container.obstacleId, container);
  // 用确定成功的随机数隔离卡爪机制；卡爪另测。
  run.rng.next = () => 0.99;
  return { run, container };
}

function advance(run: PodRun, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 1 / 60) run.frame(Math.min(left, 1 / 60));
}

function align(run: PodRun) {
  run.panCamera(rad(8));
  run.tiltCamera(rad(12));
}

test('方向提示与云台一致：左右、上下、跨 360° 航向', () => {
  const eye = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
  assert.equal(armAimHint(eye, { pos: posAt(8, 12) }), '→ 右转 8° · ↓ 下俯 12°');
  assert.equal(armAimHint(eye, { pos: posAt(-8, -12) }), '← 左转 8° · ↑ 上仰 12°');
  assert.equal(armAimHint({ ...eye, yaw: 358 }, { pos: posAt(2, 0) }), '→ 右转 4°');
  assert.equal(armAimHint({ ...eye, yaw: 2 }, { pos: posAt(358, 0) }), '← 左转 4°');
  assert.equal(armAimHint({ ...eye, yaw: 281, pitch: 27 }, { pos: posAt(289, 15) }), '→ 右转 8° · ↑ 上仰 12°');
});

test('只伸出不会抓取；伸出后必须显示翻找步骤', () => {
  const { run, container } = fixture();
  const before = run.count('sup.tape');
  run.extendArm();
  assert.equal(run.arm.phase, 'extending');
  assert.match(run.armInstruction, /还需按 F/);
  advance(run, ARM.extendSec + 0.05);
  assert.equal(run.arm.phase, 'aiming');
  assert.equal(container.searched, 0);
  assert.equal(run.count('sup.tape'), before);
  assert.equal(run.armBlock('rummage'), 'offaxis');
  assert.match(run.armInstruction, /右转 8°.*下俯 12°/);
  run.rummage();
  assert.equal(run.arm.phase, 'aiming');
  assert.equal(container.searched, 0);
});

test('水平转正仍需调整垂直云台；F 查看物资，C 收回后入库', () => {
  const { run, container } = fixture();
  const before = run.count('sup.tape');
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.panCamera(rad(8));
  assert.equal(run.armBlock('rummage'), 'offaxis');
  assert.match(run.armInstruction, /下俯 12°/);
  run.tiltCamera(rad(12));
  assert.equal(run.armBlock('rummage'), 'ok');
  assert.match(run.armInstruction, /尚未翻找.*按 F/);
  run.rummage();
  assert.equal(run.arm.phase, 'gripping');
  assert.match(run.armInstruction, /提前按 C 会中断/);
  advance(run, ARM.gripSec + 0.05);
  assert.equal(container.searched, 3);
  assert.equal(run.count('sup.tape'), before);
  assert.deepEqual(run.boxItems, [{ id: 'sup.tape', n: 2 }]);
  assert.match(run.arm.lastLine, /箱内物资/);
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.arm.phase, 'stowed');
  assert.equal(run.count('sup.tape'), before + 1, '收臂不应重复发物资');
  assert.match(run.arm.lastLine, /已取回/);
});

test('提前收臂会取消尚未完成的一爪，不应发物资', () => {
  const { run, container } = fixture();
  const before = run.count('sup.tape');
  align(run);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, 0.2);
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(container.searched, 0);
  assert.equal(run.count('sup.tape'), before);
  assert.equal(run.arm.phase, 'stowed');
});

test('空箱显示无物资，仍可安全收回', () => {
  const { run, container } = fixture();
  align(run);
  container.loot = [[], [], []];
  const before = run.count('sup.tape');
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.match(run.arm.lastLine, /箱内已无物资/);
  assert.equal(run.count('sup.tape'), before);
  assert.equal(run.armBlock('rummage'), 'exhausted');
  assert.equal(run.armBlock('retract'), 'ok');
});

test('满仓时取回物资保留在台面上，结果中说明位置', () => {
  const { run } = fixture();
  run.stock.clear();
  run.stock.set('sup.tape', PodRun.BULK_CAP * 10);
  assert.equal(run.bulkFree, 0);
  const before = run.count('sup.tape');
  align(run);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.count('sup.tape'), before + 1);
  assert.match(run.arm.lastLine, /已取回.*摊在台面上/);
});

test('随机数最差时也不卡爪，断电可收回，开工仍需照明', () => {
  const { run, container } = fixture();
  align(run);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rng.next = () => 0;
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.equal(run.arm.phase, 'aiming');
  assert.equal(container.searched, 3);
  assert.ok(run.boxItems.length);
  run.blackout = true;
  assert.equal(run.armBlock('retract'), 'ok');
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.arm.phase, 'stowed');
  run.blackout = false;
  run.arm = newArm();
  run.lamp = false;
  assert.match(run.armInstruction, /按 3 开探照灯/);
});

test('相位只在完成抓取时发 grip 事件；下一次伸出清除上一趟结果', () => {
  const arm = newArm();
  arm.lastLine = '已取回：旧物资';
  beginExtend(arm);
  assert.equal(arm.lastLine, '');
  assert.equal(stepArm(arm, ARM.extendSec + 0.01, conditions).some(e => e.kind === 'grip'), false);
  beginGrip(arm, 'crate-test');
  const events = stepArm(arm, ARM.gripSec + 0.01, conditions);
  assert.equal(events.filter(e => e.kind === 'grip').length, 1);
  beginHaul(arm);
  assert.equal(stepArm(arm, ARM.haulSec + 0.01, conditions).some(e => e.kind === 'grip'), false);
});
