import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

/**
 * Draft: run only AFTER the runtime owner confirms readiness and the contract.
 * node tools/expedition-browser-check.mjs --ready [--base-url=http://127.0.0.1:5173]
 *
 * Required probe: snapshot(), setPose(x,y,z,yaw,pitch), interact(id), draw(),
 * loadLevel(index), resetLevel(). snapshot.position is [x,y,z] or {x,y,z};
 * snapshot.level is the level definition (including id/index).
 *
 * Requires canMove(x,y,z), target and yaw/pitch from the implemented QA probe.
 * Uses world-owner-confirmed poses from snapshot.stats.qa.
 * All interactions and movement use the real runtime validation paths.
 * This script never modifies storage directly or grants progression tokens.
 */
if (!process.argv.includes('--ready')) {
  console.error('Not executed: await runtime readiness/contract confirmation, then pass --ready.');
  process.exitCode = 2;
} else {
  await run();
}

async function run() {
  const base = process.argv.find(arg => arg.startsWith('--base-url='))?.slice('--base-url='.length)
    ?? 'http://127.0.0.1:5173';
  const url = new URL('/expedition.html?qa=1', base).href;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const checks = [], errors = [];
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    page.on('pageerror', error => errors.push({ kind: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') errors.push({ kind: 'console', message: message.text() });
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push({ kind: 'http', status: response.status(), url: response.url() });
    });
    page.on('requestfailed', request => errors.push({ kind: 'network', url: request.url(), message: request.failure()?.errorText }));

    const snapshot = () => page.evaluate(() => window.expeditionProbe.snapshot());
    const invoke = (method, ...args) => page.evaluate(async ({ method, args }) => {
      return await window.expeditionProbe[method](...args);
    }, { method, args });
    const ready = async () => {
      await page.waitForFunction(() => {
        const probe = window.expeditionProbe;
        return probe && ['snapshot', 'setPose', 'interact', 'draw', 'loadLevel', 'resetLevel', 'canMove']
          .every(key => typeof probe[key] === 'function');
      }, null, { timeout: 60_000 });
      await expect(page.locator('#loading')).toBeHidden({ timeout: 60_000 });
      await expect(page.locator('#error')).toBeHidden();
      await invoke('draw');
    };
    const pose = async value => {
      assert.ok(Array.isArray(value) && value.length === 5 && value.every(Number.isFinite), 'fixture pose must contain finite x,y,z,yaw,pitch');
      await invoke('setPose', ...value);
      await invoke('draw');
    };
    const holdW = async (milliseconds = 750) => {
      await page.keyboard.down('w');
      try { await page.waitForTimeout(milliseconds); }
      finally { await page.keyboard.up('w'); }
    };
    const aimItem = async id => {
      const current = await snapshot();
      const item = current.level.items.find(item => item.id === id);
      assert.ok(item, `item exists: ${id}`);
      const room = current.level.rooms.find(room => room.id === item.room);
      await pose([room.x + item.x, -.2, room.z + item.z + 2, 0, 0]);
      assert.equal((await snapshot()).target?.id, id, `physical target: ${id}`);
      return item;
    };
    const collectWithF = async id => {
      await aimItem(id);
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.collected.includes(id), { timeout: 30_000 }).toBe(true);
    };
    const check = async (name, body) => {
      try { await body(); checks.push({ name, status: 'passed' }); }
      catch (error) { checks.push({ name, status: 'failed', message: error.message }); throw error; }
    };

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'expedition document must load successfully');
    await ready();
    await invoke('loadLevel', 0);
    await invoke('resetLevel');
    await ready();
    await mkdir('qa/deepsea', { recursive: true });
    await page.waitForTimeout(1200); // Let automatic close-range lamp regulation settle.
    await page.screenshot({ path: 'qa/deepsea/expedition-entry.png' });
    const fixtures = (await snapshot()).stats.qa;
    assert.ok(fixtures?.movementPose && fixtures.pickup && fixtures.door, 'confirmed stats.qa fixtures available');
    console.log(JSON.stringify({ fixtures }));

    await check('incident recorder and evidence are physically targeted with F and persist after reload', async () => {
      for(const kind of ['record','pickup']){
        const current=await snapshot();
        const item=current.level.items.find(i=>i.id.endsWith(`.s0.incident-${kind}`));
        assert.ok(item,`incident ${kind} exists`);
        const room=current.level.rooms.find(r=>r.id===item.room);
        const eye=[room.x+Math.sign(item.x),0,room.z-1.2];
        const target=[room.x+item.x+(kind==='record'?.06:0),kind==='record'?-1.20:-1.42,room.z+item.z+(kind==='record'?-.02:0)];
        const delta=target.map((v,i)=>v-eye[i]);
        assert.equal(await invoke('canMove',...eye),true,'incident approach is physically clear');
        await pose([...eye,Math.atan2(-delta[0],-delta[2]),Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))]);
        assert.equal((await snapshot()).target?.id,item.id,'aim hits real incident object, not nearby dressing');
        await page.keyboard.press('f');
        await expect.poll(async()=>(await snapshot()).state.collected.includes(item.id)).toBe(true);
      }
      const saved=progression((await snapshot()).state);
      await page.reload({waitUntil:'domcontentloaded'});await ready();
      assert.deepEqual(progression((await snapshot()).state),saved,'incident state persists');
    });

    await check('real W input moves the camera', async () => {
      await pose(fixtures.movementPose);
      const before = xyz((await snapshot()).position);
      await holdW();
      const after = xyz((await snapshot()).position);
      assert.ok(distance(before, after) > .1, `W did not move: ${before} -> ${after}`);
    });

    await check('remote item and door probe interactions fail without progression changes', async () => {
      // An intentionally remote pose isolates the proximity check from prerequisites.
      await pose([fixtures.pickup.nearPose[0] + 1000, fixtures.pickup.nearPose[1], fixtures.pickup.nearPose[2] + 1000, 0, 0]);
      for (const id of [fixtures.pickup.id, fixtures.door.id]) {
        const before = progression((await snapshot()).state);
        const result = await invoke('interact', id);
        assert.equal(result?.ok, false, `remote interaction accepted: ${id}`);
        assert.deepEqual(progression((await snapshot()).state), before, `remote interaction mutated progression: ${id}`);
      }
    });

    await check('nearby occluded pickup rejects probe and F interaction', async () => {
      assert.ok(fixtures.pickup.blockedPose, 'No valid nearby occluded pickup pose discovered; LOS coverage is unverified');
      await pose(fixtures.pickup.blockedPose);
      // Deliberate outside-wall probe pose: tests LOS, not walking reachability.
      const before = progression((await snapshot()).state);
      const result = await invoke('interact', fixtures.pickup.id);
      assert.equal(result?.ok, false, 'occluded interaction accepted');
      await page.keyboard.press('f');
      await page.waitForTimeout(150);
      assert.deepEqual(progression((await snapshot()).state), before, 'occluded target changed progression');
    });

    await check('F collects a visible nearby pickup and survives page reload', async () => {
      await pose(fixtures.pickup.nearPose);
      assert.equal((await snapshot()).target?.id, fixtures.pickup.id, 'actual crosshair targets pickup');
      assert.ok(!(await snapshot()).state.collected.includes(fixtures.pickup.id), 'pickup must begin uncollected');
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.collected.includes(fixtures.pickup.id)).toBe(true);
      const saved = progression((await snapshot()).state);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.deepEqual(progression((await snapshot()).state), saved, 'progression did not survive reload');
    });

    await check('actual pickup disappears, releases collision, cannot reward twice, and persists', async () => {
      const current = await snapshot();
      const item = current.level.items.find(item => item.kind === 'pickup'
        && !current.state.collected.includes(item.id)
        && (item.requires ?? []).every(id => current.state.inventory.includes(id)));
      assert.ok(item, 'available kind:pickup required independently of record fixture');
      const room = current.level.rooms.find(room => room.id === item.room);
      assert.ok(room);
      const center = [room.x + item.x, -.2, room.z + item.z];
      const approach = [center[0], center[1], center[2] + 2, 0, 0];
      await pose(approach);
      assert.equal((await snapshot()).target?.id, item.id, 'real pickup targeted before F');
      assert.equal(await invoke('canMove', ...center), false, 'uncollected pickup occupies its centre');
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.collected.includes(item.id), { timeout: 30_000 }).toBe(true);
      await invoke('draw');
      await pose(approach);
      assert.notEqual((await snapshot()).target?.id, item.id, 'collected pickup no longer ray-targetable');
      assert.equal(await invoke('canMove', ...center), true, 'collected pickup leaves no collision ghost');
      const saved = progression((await snapshot()).state);
      for (const grant of item.grants ?? []) assert.equal(saved.inventory.filter(id => id === grant).length, 1, 'grant issued exactly once');
      assert.equal((await invoke('interact', item.id))?.ok, false, 'cannot interact with removed pickup');
      await page.keyboard.press('f');
      assert.deepEqual(progression((await snapshot()).state), saved, 'no repeated reward');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.deepEqual(progression((await snapshot()).state), saved, 'actual pickup save restored');
      await pose(approach);
      assert.notEqual((await snapshot()).target?.id, item.id, 'pickup stays absent after reload');
      assert.equal(await invoke('canMove', ...center), true, 'pickup collision stays absent after reload');
    });

    await check('closed door blocks W; opening that door permits crossing', async () => {
      const door = fixtures.door;
      assert.ok(['x', 'z'].includes(door.axis) && Number.isFinite(door.plane) && [1, -1].includes(door.sign), 'valid world door plane fixture');
      const axis = door.axis === 'x' ? 0 : 2;
      const side = position => (xyz(position)[axis] - door.plane) * door.sign;
      await pose(door.nearPose);
      assert.equal((await snapshot()).target?.id, door.id, 'actual crosshair targets closed door');
      assert.ok(!(await snapshot()).state.opened.includes(door.id), 'door begins closed');
      assert.ok(side((await snapshot()).position) < -.05, 'camera begins on approach side');
      await holdW(1800);
      assert.ok(side((await snapshot()).position) < 0, 'camera crossed closed door');
      await pose(door.nearPose);
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.opened.includes(door.id)).toBe(true);
      await page.keyboard.down('w');
      try {
        await page.waitForTimeout(3000);
        await expect.poll(async () => side((await snapshot()).position), { timeout: 30_000 }).toBeGreaterThan(.05);
      }
      finally { await page.keyboard.up('w'); }
      assert.ok(side((await snapshot()).position) > .05, 'open-door positive control failed to cross');
    });

    await check('map modal pauses movement and closes back to working controls', async () => {
      await pose(fixtures.movementPose);
      await page.locator('#map-button').click();
      const dialog = page.locator('#map-dialog');
      await expect(dialog).toBeVisible();
      const before = xyz((await snapshot()).position);
      await holdW();
      assert.ok(distance(before, xyz((await snapshot()).position)) < 1e-5, 'camera moved behind map modal');
      await page.screenshot({ path: 'qa/deepsea/expedition-map.png' });
      const exploredImage = await page.locator('#map').evaluate(canvas => canvas.toDataURL());
      const blueprint = page.locator('#map-blueprint');
      await expect(blueprint).not.toBeChecked();
      await blueprint.check();
      await expect(blueprint).toBeChecked();
      assert.notEqual(await page.locator('#map').evaluate(canvas => canvas.toDataURL()), exploredImage, 'blueprint redraws expanded structure');
      await page.screenshot({ path: 'qa/deepsea/expedition-blueprint.png' });
      assert.ok(distance(before, xyz((await snapshot()).position)) < 1e-5, 'blueprint keeps movement paused');
      await blueprint.uncheck();
      assert.equal(await page.locator('#map').evaluate(canvas => canvas.toDataURL()), exploredImage, 'unchecking restores explored map');
      await dialog.locator('[data-close]').click();
      await expect(dialog).toBeHidden();
      await holdW();
      assert.ok(distance(before, xyz((await snapshot()).position)) > .1, 'movement did not resume after map closed');
    });

    await check('cache opens on first F, collects on second F, persists without duplicate reward', async () => {
      const current = await snapshot();
      const cache = current.level.items.find(item => item.kind === 'cache'
        && (item.requires ?? []).every(id => current.state.inventory.includes(id)));
      assert.ok(cache, 'available cache');
      await aimItem(cache.id);
      const before = progression((await snapshot()).state);
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.opened.includes(cache.id), { timeout: 30_000 }).toBe(true);
      let state = (await snapshot()).state;
      assert.ok(!state.collected.includes(cache.id), 'first F only opens cache');
      assert.deepEqual(state.inventory, before.inventory, 'opening grants nothing');
      await expect(page.locator('#interaction')).toContainText('取出物资', { timeout: 30_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'qa/deepsea/expedition-cache-open.png' });
      await page.keyboard.press('f');
      await expect.poll(async () => (await snapshot()).state.collected.includes(cache.id), { timeout: 30_000 }).toBe(true);
      const saved = progression((await snapshot()).state);
      for (const grant of cache.grants ?? []) assert.equal(saved.inventory.filter(id => id === grant).length, 1);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ready();
      assert.deepEqual(progression((await snapshot()).state), saved, 'cache state survives reload');
      const room = current.level.rooms.find(room => room.id === cache.room);
      await pose([room.x + cache.x, -.2, room.z + cache.z + 2, 0, 0]);
      assert.notEqual((await snapshot()).target?.id, cache.id, 'collected cache disappears');
      assert.equal((await invoke('interact', cache.id))?.ok, false);
      await page.keyboard.press('f');
      assert.deepEqual(progression((await snapshot()).state), saved, 'cache cannot reward twice');
    });

    await check('whole mandatory level-0 chain completes via F and next-level button loads index 1', async () => {
      await invoke('resetLevel');
      const level = (await snapshot()).level;
      assert.equal(level.index, 0);
      const exit = level.items.find(item => item.kind === 'exit');
      await aimItem(exit.id);
      const initial = progression((await snapshot()).state);
      await page.keyboard.press('f');
      assert.deepEqual(progression((await snapshot()).state), initial, 'exit rejects missing stage permissions');
      for (const stage of level.stages) {
        await aimItem(stage.terminal);
        const before = progression((await snapshot()).state);
        await page.keyboard.press('f');
        assert.deepEqual(progression((await snapshot()).state), before, 'terminal rejects missing objectives');
        for (const id of stage.objectives) await collectWithF(id);
        await collectWithF(stage.terminal);
        assert.ok((await snapshot()).state.inventory.includes(stage.grants), `stage permission granted: ${stage.id}`);
      }
      await collectWithF(exit.id);
      assert.equal((await snapshot()).state.completed, true);
      const complete = page.locator('#complete-dialog');
      await expect(complete).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#completion')).toContainText(level.name);
      await page.locator('#next-level').click();
      await expect.poll(async () => (await snapshot()).level.index, { timeout: 120_000 }).toBe(1);
      await expect(complete).toBeHidden();
      assert.equal((await snapshot()).state.completed, false, 'next level starts incomplete');
      assert.equal(new URL(page.url()).searchParams.get('level'), '2');
      await invoke('loadLevel', 0);
      assert.equal((await snapshot()).state.completed, true, 'completion saved when advancing');
    });

    await check('all seven distinct levels load and draw without page errors', async () => {
      const ids = new Set();
      for (let index = 0; index < 7; index++) {
        await invoke('loadLevel', index);
        await invoke('draw');
        const current = await snapshot();
        assert.equal(current.level.index, index, 'requested level loaded');
        assert.equal(typeof current.level.id, 'string');
        ids.add(current.level.id);
        xyz(current.position);
        assert.ok(current.state && current.stats, `level ${index}: state and stats available`);
        await expect(page.locator('#level-title')).not.toHaveText('正在建立设施地图…');
        await expect(page.locator('#error')).toBeHidden();
      }
      assert.equal(ids.size, 7, 'seven distinct level IDs');
      assert.deepEqual(errors, [], 'browser errors during expedition checks');
    });
  } catch (error) {
    process.exitCode = 1;
    checks.push({ name: 'run', status: 'failed', message: error.stack ?? String(error) });
  } finally {
    console.log(JSON.stringify({ checks, errors, humanPlayDurationVerified: false }, null, 2));
    if (errors.length) process.exitCode = 1;
    await browser.close();
  }
}

function xyz(position) {
  const result = Array.isArray(position) ? position : [position?.x, position?.y, position?.z];
  assert.ok(result.length === 3 && result.every(Number.isFinite), 'finite camera XYZ');
  return result;
}
function distance(a, b) { return Math.hypot(...a.map((value, index) => value - b[index])); }
function progression(state) {
  // Visited/elapsed telemetry may legitimately advance between frames.
  return Object.fromEntries(['inventory', 'collected', 'opened', 'recorded', 'completed'].map(key => [key, state[key]]));
}
