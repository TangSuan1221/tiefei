/** 合并工作台回归：npx tsx --test tools/camera-workbench.test.ts */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { PodRun, type FootageRequest } from '../src/pod/sim/run.ts';
import { ARM } from '../src/pod/sim/manipulator.ts';
import { STATION_ORDER, canonicalStation, stationForKey } from '../src/pod/types.ts';
import type * as StationModule from '../src/pod/view/stations.ts';
import type { RoomGeometry } from '../src/pod/view/roomview.ts';

let ui: typeof StationModule;
before(async () => {
  // 视图依赖 Vite 的 import.meta.env；走同一转换管线，不配置视频接口。
  const server = await createServer({
    configFile: false, envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, hmr: false },
  });
  try {
    ui = await server.ssrLoadModule('/src/pod/view/stations.ts') as typeof StationModule;
  } finally {
    await server.close();
  }
});

function fixture() {
  const run = new PodRun(42);
  run.phase = 'site';
  run.at = 'camera';
  run.lamp = true;
  run.heading = run.pitch = run.camPan = run.camTilt = 0;
  run.cabinPos = { x: 0, y: 0, z: 0 };
  const geo: RoomGeometry = {
    nodeId: 'workbench-test', label: '测试货箱', half: { x: 10, y: 10, z: 10 },
    doors: [], quads: [],
    obstacles: [{ id: 'crate-test', kind: 'crate', pos: { x: 0, y: 2.3, z: 0 }, size: { x: 1, y: 1, z: 1 } }],
  };
  run.roomGeo = () => geo;
  run.containers.set('crate-test', {
    obstacleId: 'crate-test', nodeId: geo.nodeId, kind: 'supply', seal: 'bone',
    searched: 0, passes: 3, opened: false, exhausted: false,
    loot: [[['sup.tape', 1]], [], []], noise: 0, cost: 0, risk: 0,
  });
  run.rng.next = () => 0.99;
  return run;
}

function advance(run: PodRun, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 1 / 60) run.frame(Math.min(left, 1 / 60));
}

function developing(run: PodRun): FootageRequest {
  let request: FootageRequest | null = null;
  run.footageSink = req => { request = req; };
  run.beginShoot();
  advance(run, run.shot.exposeMax + 0.05);
  assert.equal(run.shot.phase, 'developing');
  assert.ok(request);
  return request;
}

test('旧打捞入口和摄像机入口指向同一工位，过道只显示一台', () => {
  assert.equal(STATION_ORDER.length, 5);
  assert.equal(STATION_ORDER.includes('salvage'), false);
  assert.equal(canonicalStation('salvage'), 'camera');
  assert.equal(stationForKey('2'), 'camera');
  assert.equal(stationForKey('4'), 'camera');
  const run = fixture();
  run.at = null;
  run.walkTo('salvage');
  assert.equal(run.at, 'camera');
  assert.equal(run.walkTo('camera'), 0);
});

test('摄像、机械臂和物资操作同时可用，各阶段快捷键无重复', () => {
  const run = fixture();
  for (const phase of ['stowed', 'aiming', 'gripping', 'jammed', 'hauling'] as const) {
    run.arm.phase = phase;
    for (const shot of ['idle', 'exposing', 'developing', 'ready', 'failed'] as const) {
      run.shot.phase = shot;
      const controls = ui.stationControls(run, 'camera');
      const keys = controls.map(c => c.key.toLowerCase()).filter(Boolean);
      assert.equal(new Set(keys).size, keys.length, `${phase}/${shot}`);
      for (const id of ['camera.lamp', 'camera.panL', 'camera.tiltUp', 'arm.extend', 'arm.rummage', 'arm.retract', 'salvage.arm', 'box.retrieve']) {
        assert.ok(controls.some(c => c.id === id), id);
      }
      assert.deepEqual(ui.stationControls(run, 'salvage'), controls);
    }
  }
});

test('从回放伸臂立即切回实时，云台调整、翻找和收臂不换台', () => {
  const run = fixture();
  run.shot.phase = 'ready';
  run.shot.legId = run.leg.id;
  run.shot.viewing = true;
  assert.equal(ui.performControl(run, 'arm.extend'), true);
  assert.equal(run.shot.viewing, false);
  advance(run, ARM.extendSec + 0.05);
  const pan = run.camPan;
  assert.equal(ui.performControl(run, 'camera.panR'), true);
  assert.ok(run.camPan > pan);
  run.panCamera(-run.camPan);
  const before = run.count('sup.tape');
  assert.equal(ui.performControl(run, 'arm.rummage'), true);
  advance(run, ARM.gripSec + 0.05);
  assert.equal(run.count('sup.tape'), before);
  assert.equal(run.at, 'camera');
  assert.equal(run.shot.viewing, false);
  assert.equal(ui.performControl(run, 'arm.retract'), true);
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.arm.phase, 'stowed');
  assert.equal(run.count('sup.tape'), before + 1);
});

test('冲洗成功不打断机械臂，收臂后才允许主动回放', () => {
  const run = fixture();
  const request = developing(run);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  request.settle(request.token, true);
  assert.equal(run.shot.phase, 'ready');
  assert.equal(run.shot.viewing, false);
  assert.equal(ui.performControl(run, 'camera.view'), false);
  run.replayFootage();
  run.toggleFootageView();
  run.beginShoot();
  assert.equal(run.shot.viewing, false);
  run.retractArm();
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.shot.viewing, false, '收臂也不突然替换画面');
  assert.equal(ui.performControl(run, 'camera.view'), true);
  assert.equal(run.shot.viewing, true);
});

test('未作业时冲洗成功保留原有回放行为，过期冲洗回调忽略', () => {
  const run = fixture();
  const request = developing(run);
  request.settle(request.token + 1, true);
  assert.equal(run.shot.phase, 'developing');
  request.settle(request.token, true);
  assert.equal(run.shot.phase, 'ready');
  assert.equal(run.shot.viewing, true);
});

test('满仓仍能从右侧收回，物资保留在艇内台面', () => {
  const run = fixture();
  run.stock.clear();
  run.stock.set('sup.tape', PodRun.BULK_CAP);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.equal(ui.performControl(run, 'box.retrieve'), true);
  assert.equal(ui.performControl(run, 'box.retrieve'), false);
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.benchCountOf('sup.tape'), 1);
  assert.equal(run.arm.phase, 'stowed');
});

test('右侧只显示箱内内容，选中哪件就收回哪件且不重复生成', () => {
  const run = fixture();
  const c = run.containers.get('crate-test')!;
  c.loot = [[['sup.tape', 2]], [['sup.flare', 1]], []];
  c.risk = 1;
  c.riskCurve = [1, 1, 1];
  run.rng.next = () => 0;
  assert.ok(!ui.stationControls(run, 'camera').some(c => c.id.startsWith('locker.select:')));
  const before = run.count('sup.flare');
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.deepEqual(run.boxItems, [{ id: 'sup.tape', n: 2 }, { id: 'sup.flare', n: 1 }]);
  assert.equal(run.count('sup.flare'), before);
  assert.equal(ui.performControl(run, 'locker.select:sup.flare'), true);
  assert.equal(ui.performControl(run, 'box.retrieve'), true);
  assert.equal(ui.performControl(run, 'locker.select:sup.tape'), false);
  advance(run, ARM.haulSec + 0.05);
  assert.equal(run.count('sup.flare'), before + 1);
  assert.deepEqual(run.boxItems, [{ id: 'sup.tape', n: 2 }]);
  run.extendArm();
  advance(run, ARM.extendSec + 0.05);
  run.rummage();
  advance(run, ARM.gripSec + 0.05);
  assert.deepEqual(run.boxItems, [{ id: 'sup.tape', n: 2 }]);
  assert.equal(c.searched, 3);
});

test('箱内选择状态不会跨会话共享，也不会显示艇内背包操作', () => {
  const run = fixture();
  run.containerItems.set('crate-test', [{ id: 'sup.flare', n: 1 }]);
  run.searchedBox = 'crate-test';
  run.selectBoxItem('sup.flare');
  const other = fixture();
  assert.equal(other.selectedBoxItem, null);
  assert.equal(other.boxItems.length, 0);
  for (const id of ['locker.use', 'locker.drop', 'bench.stow', 'bench.dump', 'arm.purge', 'arm.wrench']) {
    assert.ok(!ui.stationControls(run, 'camera').some(c => c.id === id), id);
  }
});
