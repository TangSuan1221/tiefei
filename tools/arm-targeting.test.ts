/** 贴近货箱的瞄准回归：npx tsx --test tools/arm-targeting.test.ts */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ARM, acquireTarget } from '../src/pod/sim/manipulator.ts';
import { PodRun } from '../src/pod/sim/run.ts';
import { traceCabin } from '../src/pod/gen/interior.ts';
import { buildRoom, type Eye, type RoomGeometry } from '../src/pod/view/roomview.ts';

const eye: Eye = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
const box = (id: string, pos = { x: 0, y: 3, z: 0 }, size = { x: 2, y: 2, z: 2 }) => ({
  id, kind: 'crate' as const, pos, size,
});
const room = (...obstacles: RoomGeometry['obstacles']): RoomGeometry => ({
  nodeId: 'contact-test', label: '贴箱测试', half: { x: 10, y: 10, z: 10 },
  doors: [], quads: [], obstacles,
});
function advance(run: PodRun, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 1 / 60) run.frame(Math.min(left, 1 / 60));
}

function contactFixture() {
  const run = new PodRun(42);
  const volume = run.volume!;
  assert.ok(volume);
  const crate = box('contact-crate', { x: 0.9, y: 3, z: 0.8 });
  const node = { ...volume.nodes[0], size: { x: 20, y: 20, z: 20 }, obstacles: [crate] };
  volume.nodes = [node];
  volume.edges = [];
  volume.hazards = [];
  run.volumeAt = node.id;
  run.phase = 'site';
  run.at = 'camera';
  run.lamp = true;
  run.heading = run.pitch = run.camPan = run.camTilt = 0;
  run.rng.next = () => 0.99;
  const hit = traceCabin(volume, node, eye.pos, { x: 0, y: 1, z: 0 }, 6);
  assert.equal(hit.kind, 'obstacle');
  run.cabinPos = hit.pos;
  const blocked = traceCabin(volume, node, hit.pos, { x: 0, y: 1, z: 0 }, 0.5);
  assert.equal(blocked.kind, 'obstacle');
  assert.ok(blocked.t < 0.22, '已经到达碰撞边界，继续推进也无法再贴近');
  run.containers.set(crate.id, {
    obstacleId: crate.id, nodeId: node.id, kind: 'supply', seal: 'bone',
    searched: 0, passes: 2, opened: false, exhausted: false,
    loot: [[['sup.tape', 1]], []], noise: 0, cost: 0, risk: 0,
  });
  return { run, node, crate, geo: buildRoom(volume, node) };
}

test('贴住碰撞边界且准星命中箱面时，可以伸臂并完成翻找', () => {
  const { run, crate } = contactFixture();
  const center = Math.hypot(crate.pos.x - run.cabinPos.x, crate.pos.y - run.cabinPos.y, crate.pos.z - run.cabinPos.z);
  const centerAngle = Math.acos((crate.pos.y - run.cabinPos.y) / center);
  assert.ok(centerAngle > ARM.gripHalfFov, '复现旧判定：箱子中心偏角过大');
  const target = run.armTarget;
  assert.ok(target, '箱面就在准星下，不能因为中心偏角而丢失目标');
  assert.equal(target.offAxis, 0);
  assert.ok(target.dist < 1.2, '报告到箱面而不是箱心的距离');
  const mark = run.roomMarks().find(m => m.obstacleId === crate.id);
  assert.deepEqual(mark?.aimPoint, target.pos, '摄像机距离标注使用同一箱面操作点');
  const before = run.count('sup.tape');
  run.extendArm();
  assert.equal(run.arm.phase, 'extending');
  advance(run, ARM.extendSec + 0.05);
  assert.equal(run.armBlock('rummage'), 'ok');
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.equal(run.containers.get(crate.id)!.searched, 2);
  assert.equal(run.count('sup.tape'), before);
  assert.equal(run.boxItems[0]?.id, 'sup.tape');
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.count('sup.tape'), before + 1);
});

test('贴箱时放大镜头不会因为箱心移出视场而丢失箱面', () => {
  const { run, crate } = contactFixture();
  run.camZoom = 3.2;
  assert.equal(run.armTarget?.obstacleId, crate.id);
  assert.equal(run.armTarget?.offAxis, 0);
});

test('伸臂距离按命中的箱面计算，不要求箱心也在六米半以内', () => {
  const target = acquireTarget(room(box('large', { x: 0, y: 7.2, z: 0 })), eye, 0.55);
  assert.ok(target);
  assert.ok(Math.abs(target.dist - 6.2) < 1e-8);
  assert.deepEqual(target.pos, { x: 0, y: 6.2, z: 0 });
  assert.equal(acquireTarget(room(box('far', { x: 0, y: 8, z: 0 })), eye, 0.55), null);
});

test('左右侧和上下侧贴近的箱面，都可按实际光轴命中', () => {
  for (const [pos, yaw, pitch] of [
    [{ x: 0.9, y: 2, z: 0.8 }, 0, 0],
    [{ x: 2, y: 0.9, z: 0.8 }, 90, 0],
    [{ x: -2, y: 0.9, z: -0.8 }, 270, 0],
    [{ x: 0.8, y: 0.9, z: 2 }, 0, 90],
    [{ x: -0.8, y: 0.9, z: -2 }, 0, -90],
  ] as const) {
    const target = acquireTarget(room(box('face', pos)), { ...eye, yaw, pitch }, 0.55 / 3.2);
    assert.equal(target?.offAxis, 0, `${yaw}/${pitch}`);
    assert.ok(Math.abs(target!.dist - 1) < 1e-8);
  }
});

test('准星完全移出箱面仍需重新瞄准，身后箱子不会被选中', () => {
  const geo = room(box('small', { x: 1, y: 3, z: 0 }, { x: 0.2, y: 0.2, z: 0.2 }));
  const target = acquireTarget(geo, eye, 0.55);
  assert.ok(target && target.offAxis > ARM.gripHalfFov);
  assert.equal(acquireTarget(geo, { ...eye, yaw: 180 }, 0.55), null);
});

test('同一条视线上选择前面的箱子，不受障碍数组排列影响', () => {
  const near = box('near', { x: 0, y: 3, z: 0 });
  const far = box('far', { x: 0, y: 5.5, z: 0 });
  assert.equal(acquireTarget(room(far, near), eye, 0.55)?.obstacleId, 'near');
  assert.equal(acquireTarget(room(near, far), eye, 0.55)?.obstacleId, 'near');
});

test('实体挡在镜头与货箱之间时不能隔着障碍取物', () => {
  const crate = box('hidden', { x: 0, y: 5, z: 0 });
  const blocker = { ...box('tank', { x: 0, y: 2, z: 0 }), kind: 'tank' as const };
  assert.equal(acquireTarget(room(crate, blocker), eye, 0.55), null);
});
