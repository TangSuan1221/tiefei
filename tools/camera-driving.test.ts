/** 摄像台离散驾驶回归：npx tsx --test tools/camera-driving.test.ts */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { CAMERA_DRIVE_METERS, PodRun, traceDriveCabin } from '../src/pod/sim/run.ts';
import { ARM } from '../src/pod/sim/manipulator.ts';
import { doorsOf, lookDir, POD_R } from '../src/pod/gen/interior.ts';
import { HitMap } from '../src/pod/view/chrome.ts';
import type { Vec3 } from '../src/pod/gen/volume.ts';
import type * as StationModule from '../src/pod/view/stations.ts';
import type * as SessionModule from '../src/pod/view/session.ts';
import type { PodView } from '../src/pod/view/present.ts';

let ui: typeof StationModule;
let sessions: typeof SessionModule;
before(async () => {
  const server = await createServer({
    configFile: false, envFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, watch: null, hmr: false },
  });
  try {
    ui = await server.ssrLoadModule('/src/pod/view/stations.ts') as typeof StationModule;
    sessions = await server.ssrLoadModule('/src/pod/view/session.ts') as typeof SessionModule;
  } finally { await server.close(); }
});

function fixture(destination: Vec3 = { x: 0, y: 30, z: 0 }) {
  const run = new PodRun(42);
  const volume = run.volume!;
  const base = volume.nodes[0]!;
  volume.nodes = [
    { ...base, id: 'entry-test', role: 'entry', pos: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 20, z: 20 }, obstacles: [] },
    { ...base, id: 'next-test', role: 'exit', pos: destination, size: { x: 20, y: 20, z: 20 }, obstacles: [] },
  ];
  volume.edges = [{ id: 'door-test', from: 'entry-test', to: 'next-test', kind: 'lateral', length: 30 }];
  volume.hazards = []; volume.locks = []; volume.echoes = []; volume.fauna = [];
  volume.visited = ['entry-test']; volume.identified = false;
  run.phase = 'site'; run.at = 'camera'; run.lamp = true;
  run.volumeAt = 'entry-test';
  run.cabinPos = { x: 0, y: 0, z: 0 };
  run.heading = run.pitch = run.camPan = run.camTilt = 0;
  run.rng.next = () => 0.99;
  return { run, volume, node: volume.nodes[0]! };
}

function advance(run: PodRun, seconds: number) {
  for (let left = seconds; left > 1e-8; left -= 1 / 60) run.frame(Math.min(left, 1 / 60));
}

test('未分析可在摄像台驾驶，按一次走 0.75m，时间帧不会继续推进', () => {
  const { run, volume } = fixture();
  const before = run.power;
  assert.equal(ui.performControl(run, 'drive.forward'), true);
  assert.deepEqual(run.cabinPos, { x: 0, y: CAMERA_DRIVE_METERS, z: 0 });
  advance(run, 0.3);
  assert.equal(run.cabinPos.y, CAMERA_DRIVE_METERS);
  assert.equal(volume.identified, false);
  assert.equal(run.canDepart, false);
  assert.ok(run.power < before);
  ui.performControl(run, 'drive.back');
  assert.ok(Math.abs(run.cabinPos.y) < 1e-8);
});

test('推进严格沿船头，云台不偷转船，显式回中只改镜头', () => {
  const { run } = fixture();
  run.camPan = Math.PI / 2; run.camTilt = 0.3;
  ui.performControl(run, 'drive.forward');
  assert.equal(run.cabinPos.x, 0);
  assert.equal(run.cabinPos.y, 0.75);
  ui.performControl(run, 'drive.right');
  assert.equal(run.heading, 5);
  assert.equal(run.camPan, Math.PI / 2);
  ui.performControl(run, 'drive.up');
  assert.equal(run.pitch, -5);
  ui.performControl(run, 'drive.center');
  assert.equal(run.camPan, 0); assert.equal(run.camTilt, 0);
  assert.equal(run.cameraEye().yaw, 5); assert.equal(run.cameraEye().pitch, -5);
  run.pitch = 80; run.camTilt = 0.5;
  assert.equal(run.cameraEye().pitch, 86);
});

test('门前 5.1m 不吸门，偏航不自动朝门中心修正', () => {
  const { run } = fixture();
  run.cabinPos.y = 4.9;
  run.heading = 10;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.ok(Math.abs(run.cabinPos.x - Math.sin(Math.PI / 18) * 0.75) < 1e-8);
  assert.ok(run.cabinPos.y < 5.65);
  run.cabinPos = { x: 0, y: 4.9, z: 0 }; run.heading = 0; run.throttle = 1;
  run.thrust();
  assert.equal(run.volumeAt, 'entry-test', '旧领航入口也不能提前吸门');
  assert.equal(run.cabinPos.y, 9.4);
});

test('到门口仍留在本房，中心抵达实际墙面才切房并登记访问', () => {
  const { run, volume } = fixture();
  run.cabinPos.y = 8.5;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.equal(run.cabinPos.y, 9.25);
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'next-test');
  assert.equal(volume.visited.filter(id => id === 'next-test').length, 1);
  assert.equal(volume.identified, false);
  const dest = volume.nodes[1]!;
  assert.ok(Math.abs(run.cabinPos.y) < dest.size.y / 2 - POD_R * 0.85);
  run.cameraDrive('forward');
  assert.equal(volume.visited.filter(id => id === 'next-test').length, 1);
});

test('洞外和门框都挡船，旧门洞外容差不能让艇穿墙', () => {
  for (const x of [0.8, 1.8, 3]) {
    const { run } = fixture();
    run.cabinPos = { x, y: 8.5, z: 0 };
    run.cameraDrive('forward');
    assert.equal(run.volumeAt, 'entry-test');
    assert.ok(run.cabinPos.y <= 10 - POD_R * 0.85);
    assert.ok(run.hull < 0.71, '碰撞沿用站内船壳损伤');
  }
});

test('对准门也不能穿箱，最大旧脉冲和极薄障碍都由扫掠拦截', () => {
  for (const thickness of [2, 0.001]) {
    const { run, node } = fixture();
    node.obstacles = [{ id: 'blocking-box', kind: 'crate', pos: { x: 0, y: 6, z: 0 }, size: { x: 2, y: thickness, z: 2 } }];
    run.throttle = 3;
    run.thrust();
    assert.equal(run.volumeAt, 'entry-test');
    assert.ok(run.cabinPos.y < 6 - thickness / 2 - POD_R * 0.75);
    assert.ok(run.hull < 0.71, '碰撞沿用站内船壳损伤');
    const before = run.cabinPos.y;
    run.cameraDrive('forward');
    assert.equal(run.cabinPos.y, before);
    run.cameraDrive('back');
    assert.ok(run.cabinPos.y < before);
  }
});

test('锁在艇体碰到门前阻挡，打开后才能通过', () => {
  const { run, volume } = fixture();
  volume.locks = [{ node: 'entry-test', kind: 'glyph', side: 'port', stripe: 'bone', uses: 1, solved: false }];
  run.cabinPos.y = 8.5;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.ok(run.cabinPos.y <= 10 - POD_R * 0.85);
  assert.equal(run.hull, 0.71, '锁门不会按普通撞壁重复扣船壳');
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.equal(volume.identified, false);
  volume.locks[0]!.solved = true;
  run.cameraDrive('forward'); run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'next-test');
});

test('未开锁仍可返回入口或进入补给分支，保留既有锁规则', () => {
  for (const role of ['entry', 'wreck', 'charge'] as const) {
    const { run, volume } = fixture();
    volume.nodes[1]!.role = role;
    volume.locks = [{ node: 'entry-test', kind: 'glyph', side: 'port', stripe: 'bone', uses: 1, solved: false }];
    run.cabinPos.y = 9.5;
    run.cameraDrive('forward');
    assert.equal(run.volumeAt, 'next-test', role);
  }
});

test('门后机关只在真正跨门时判断，关闭时不换房', () => {
  const { run, volume } = fixture();
  volume.hazards = [{ node: 'next-test', kind: 'photophobe', period: 0, phase: 0, openRatio: 0 }];
  volume.identified = true;
  run.clock = 1; volume.photoOpenUntil = 0;
  run.cabinPos.y = 4.9;
  const logs = run.log.length;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.ok(!run.log.slice(logs).some(l => l.text.includes('附着物')));
  run.cabinPos.y = 9.5;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'entry-test');
  assert.ok(run.cabinPos.y < 10);
  volume.photoOpenUntil = 100;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'next-test');
});

test('六面实际门洞含上下面均按轴向跨越，洞外均受阻', () => {
  for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
    const destination = { x: 0, y: 0, z: 0 }; destination[axis] = sign * 30;
    const { volume, node } = fixture(destination);
    const from = { x: 0, y: 0, z: 0 }; from[axis] = sign * 9.5;
    const dir = { x: 0, y: 0, z: 0 }; dir[axis] = sign;
    const hit = traceDriveCabin(volume, node, from, dir, 0.75);
    assert.equal(hit.kind, 'door', `${axis}/${sign}`);
    assert.ok(Math.abs(hit.t - 0.5) < 1e-8);
    const away = axis === 'x' ? 'y' : 'x';
    from[away] = 2; from[axis] = sign * 8.5;
    assert.equal(traceDriveCabin(volume, node, from, dir, 0.75).kind, 'wall');
  }
});

test('摄像台可用船体俯仰穿越上下门，不要求超出 ±80° 的驾驶角', () => {
  for (const sign of [-1, 1]) {
    const { run } = fixture({ x: 0, y: 0, z: sign * 30 });
    run.cabinPos = { x: 0, y: 0, z: sign * 9.5 };
    run.pitch = sign * 80;
    run.cameraDrive('forward');
    assert.equal(run.volumeAt, 'next-test');
  }
});

test('跨门并返回不重置箱内物资，也不因切房自动入库', () => {
  const { run } = fixture();
  run.containerItems.set('saved-box', [{ id: 'sup.tape', n: 2 }]);
  run.searchedBox = 'saved-box'; run.selectedBoxItem = 'sup.tape';
  const before = run.count('sup.tape');
  run.cabinPos.y = 9.5;
  run.cameraDrive('forward');
  assert.equal(run.volumeAt, 'next-test');
  run.cameraDrive('back'); run.cameraDrive('back'); run.cameraDrive('back');
  assert.equal(run.volumeAt, 'entry-test');
  assert.deepEqual(run.containerItems.get('saved-box'), [{ id: 'sup.tape', n: 2 }]);
  assert.equal(run.count('sup.tape'), before);
});

test('同墙多门按实际洞口匹配，不强制选第一扇', () => {
  const { volume, node } = fixture({ x: -20, y: 30, z: 0 });
  volume.nodes.push({ ...volume.nodes[1]!, id: 'right-test', pos: { x: 20, y: 30, z: 0 } });
  volume.edges.push({ ...volume.edges[0]!, id: 'right-edge', to: 'right-test' });
  const right = doorsOf(volume, node).find(d => d.to === 'right-test')!;
  const hit = traceDriveCabin(volume, node, { ...right.pos, y: 9.5 }, lookDir(0, 0), 0.75);
  assert.equal(hit.to, 'right-test');
});

test('所有伸臂相位、回放、曝光、冲洗、充电及断电在模拟层封锁驾驶', () => {
  const blockers: ((run: PodRun) => void)[] = [
    ...(['extending', 'aiming', 'gripping', 'jammed', 'hauling'] as const).map(phase => (r: PodRun) => { r.arm.phase = phase; r.arm.out = 1; }),
    r => { r.shot.viewing = true; }, r => { r.shot.phase = 'exposing'; },
    r => { r.shot.phase = 'developing'; }, r => { r.charging = true; },
    r => { r.power = 0; }, r => { r.blackout = true; },
    r => { r.driveInputBlocked = true; }, r => { r.outcome = { kind: 'escaped' }; },
  ];
  for (const block of blockers) {
    const { run, volume } = fixture();
    volume.identified = true; run.volumeAt = 'next-test'; run.throttle = 3;
    run.camPan = 0.3;
    block(run);
    const before = { pos: { ...run.cabinPos }, power: run.power, heading: run.heading, pitch: run.pitch, leg: run.legIndex };
    run.cameraDrive('forward'); run.cameraDrive('back'); run.cameraDrive('center');
    run.nudgeHeading(5); run.nudgePitch(5); run.thrust(); run.depart();
    assert.deepEqual(run.cabinPos, before.pos);
    assert.equal(run.power, before.power);
    assert.equal(run.heading, before.heading); assert.equal(run.pitch, before.pitch);
    assert.equal(run.camPan, 0.3); assert.equal(run.legIndex, before.leg);
    assert.equal(ui.performControl(run, 'drive.forward'), false);
  }
});

test('航渡明确使用旧抽象一档进度且同样禁止回放中推进', () => {
  const { run } = fixture();
  run.phase = 'transit'; run.heading = run.leg.safeHeading;
  run.cameraDrive('forward');
  assert.equal(run.traveled, 60);
  assert.deepEqual(run.cabinPos, { x: 0, y: 0, z: 0 });
  run.shot.viewing = true;
  run.cameraDrive('forward'); run.thrust();
  assert.equal(run.traveled, 60);
});

test('驾驶后取物仍需选物、收臂完成才入库；作业中不能把货带往别房', () => {
  const { run, node } = fixture();
  node.obstacles = [{ id: 'cargo', kind: 'crate', pos: { x: 0, y: 4, z: 0 }, size: { x: 2, y: 2, z: 2 } }];
  run.containers.set('cargo', {
    obstacleId: 'cargo', nodeId: node.id, kind: 'supply', seal: 'bone',
    searched: 0, passes: 2, opened: false, exhausted: false,
    loot: [[['sup.tape', 1]], [['sup.flare', 1]]], noise: 0, cost: 0, risk: 0,
  });
  run.cameraDrive('forward');
  const pos = { ...run.cabinPos };
  run.extendArm(); advance(run, ARM.extendSec + 0.01);
  run.rummage(); advance(run, ARM.gripSec + 0.01);
  run.selectBoxItem('sup.flare');
  const before = run.count('sup.flare');
  run.retractArm(); run.cameraDrive('forward'); run.thrust();
  assert.equal(run.count('sup.flare'), before);
  assert.deepEqual(run.cabinPos, pos);
  assert.equal(run.containerItems.get('cargo')?.find(i => i.id === 'sup.flare')?.n, 1);
  advance(run, ARM.haulSec + 0.01);
  assert.equal(run.count('sup.flare'), before + 1);
  assert.ok(!run.boxItems.some(i => i.id === 'sup.flare'));
  run.cameraDrive('back');
  assert.ok(run.cabinPos.y < pos.y);
});

test('摄像驾驶按钮实际绘制且命中区不覆盖云台、机械臂、箱侧栏', () => {
  const { run } = fixture();
  run.power = 0; // 不创建 WebGL；这里只验控件布局而非渲染画质。
  const texts: string[] = [];
  const ctx = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (text: string) => ({ width: text.length * 7 }),
    fillText: (text: string) => { texts.push(text); },
  } as unknown as CanvasRenderingContext2D, {
    get(target, key) { return Reflect.get(target, key) ?? (() => {}); },
  });
  for (const [width, height] of [[1280, 720], [800, 600]]) {
    const hits = new HitMap();
    ui.drawStationView(ctx, run, 'camera', 0, 0, width!, height!, hits, { sonar: null!, hovered: null, time: 0 });
    const controls = ui.stationControls(run, 'camera');
    const keys = controls.map(c => c.key.toLowerCase());
    assert.equal(new Set(keys).size, keys.length);
    for (const control of controls.filter(c => c.id.startsWith('drive.'))) {
      const rect = hits.rectOf(control.id);
      assert.ok(rect, control.id);
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width! && rect.y + rect.h <= height!);
      assert.equal(hits.pick(rect.x + rect.w / 2, rect.y + rect.h / 2), control.id);
      for (const id of ['camera.panL', 'arm.extend', 'box.retrieve']) {
        const other = hits.rectOf(id);
        if (other) assert.ok(rect.x + rect.w <= other.x || other.x + other.w <= rect.x || rect.y + rect.h <= other.y || other.y + other.h <= rect.y);
      }
    }
  }
  assert.ok(texts.some(t => t.includes('船头') && t.includes('镜头')));
  assert.ok(texts.includes('向前一步'));
});

test('真实键盘路由：空格一次一步，重复键不连推；失焦/面板/编辑框/离台清掉持续输入', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let overlay = false;
  let editing = false;
  const doc = {
    hidden: false,
    activeElement: { closest: () => editing ? {} : null },
    querySelector: () => overlay ? {} : null,
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  try {
    const { run } = fixture();
    const view = { unlockAudio: async () => {}, audio: { cue() {} } } as unknown as PodView;
    const session = new sessions.PodSession(run, view) as unknown as {
      onKeyDown(e: KeyboardEvent): void; onKeyUp(e: KeyboardEvent): void;
      onBlur(): void; onFocus(): void; onVisibility(): void; applyHeld(dt: number): void;
    };
    const key = (value: string, repeat = false) => ({ key: value, repeat, preventDefault() {} }) as KeyboardEvent;
    session.onKeyDown(key(' '));
    assert.equal(run.cabinPos.y, 0.75);
    session.onKeyDown(key(' ', true)); session.applyHeld(0.1);
    assert.equal(run.cabinPos.y, 0.75);
    session.onKeyUp(key(' '));
    session.onKeyDown(key('l')); assert.equal(run.heading, 5);
    session.onKeyDown(key('ArrowRight')); session.applyHeld(0.1);
    const pan = run.camPan;
    session.onBlur(); session.applyHeld(0.1); session.onKeyDown(key(' '));
    assert.equal(run.camPan, pan); assert.equal(run.cabinPos.y, 0.75);
    assert.equal(run.driveInputBlocked, true);
    session.onFocus(); session.applyHeld(0.1); assert.equal(run.camPan, pan);
    for (const mode of ['overlay', 'editing', 'hidden']) {
      session.onKeyDown(key('ArrowRight'));
      overlay = mode === 'overlay'; editing = mode === 'editing'; doc.hidden = mode === 'hidden';
      session.applyHeld(0.1); session.onKeyDown(key(' '));
      assert.equal(run.camPan, pan); assert.equal(run.cabinPos.y, 0.75);
      overlay = editing = doc.hidden = false;
      session.onVisibility(); session.applyHeld(0.1);
      assert.equal(run.camPan, pan);
    }
    session.onKeyDown(key('ArrowRight')); session.onKeyDown(key('Escape'));
    run.at = 'camera'; session.applyHeld(0.1);
    assert.equal(run.camPan, pan);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
