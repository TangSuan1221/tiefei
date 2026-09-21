/**
 * 逃生舱流程验证器。
 * ============================================================================
 * 用一个「什么都做对」的理想玩家把整条航线跑一遍，回答三个问题：
 *
 *   1. 这一趟能不能走完？（能不能通关，而不是能不能死）
 *   2. 每一段的废墟，玩家有没有机会真的捞到？
 *   3. 每一次威胁，玩家有没有机会看清并正确应对？
 *
 * 任何一项答不出「是」，就是切片版本卡住玩家的地方。
 * 这个脚本只依赖模拟层，不碰任何渲染与 DOM。
 */

import { PodRun } from '../src/pod/sim/run.ts';
import { ACT_COUNT, ROUTE } from '../src/pod/content/route.ts';
import { ALL_SUPPLY_IDS, supply, type SupplyId } from '../src/pod/content/supplies.ts';
import { STATIONS, STATION_ORDER, type RunPhase } from '../src/pod/types.ts';
import { generateVolume, exitNode, bearingTo, collectMemory, type Volume } from '../src/pod/gen/volume.ts';
import { hookFor } from '../src/pod/gen/story.ts';
import { faunaOnTape } from '../src/pod/gen/spawn.ts';

/** 警报态是实时的，用固定步长把时间推给模拟层 */
const STEP = 1 / 30;

interface Report {
  profile: string;
  seed: number;
  arrivals: number;
  finished: boolean;
  outcome: string;
  breaths: number;
  legsCleared: number;
  wrecksSeen: number;
  wrecksLooted: number;
  lootTotal: number;
  threatsSeen: number;
  threatsIdentified: number;
  threatsRepelled: number;
  threatsStruck: number;
  /** 第一发脉冲扫回来多少个回波，按类型分 */
  firstPing: Record<string, number>;
  minTemp: number;
  minOxy: number;
  maxCo2: number;
  maxFear: number;
  notes: string[];
}

function advance(run: PodRun, seconds: number): void {
  let left = seconds;
  while (left > 0 && run.outcome.kind === 'alive') {
    run.frame(STEP);
    left -= STEP;
  }
}

/** 警报态下，理想玩家的应对：看清 → 用对的手段 */
function handleThreat(run: PodRun, rep: Report): void {
  const t = run.threat;
  if (!t) return;
  rep.threatsSeen++;

  // 1. 走到摄像头，开灯，把云台转到它的方位，盯到看清
  run.walkTo('camera');
  if (!run.lamp) run.toggleLamp();
  run.camPan = t.bearing;
  let guard = 0;
  while (run.outcome.kind === 'alive' && !t.known && t.phase === 'contact' && guard++ < 400) {
    run.camPan = t.bearing;
    run.frame(STEP);
  }
  if (t.known) rep.threatsIdentified++;
  else {
    rep.notes.push(`[看不清] ${t.creature.designation} 在摄像头前盯满 ${(guard * STEP).toFixed(1)}s 仍未 identify`);
  }

  // 看清本身就解决了幻觉
  if (t.phase === 'repelled') {
    rep.threatsRepelled++;
    advance(run, 3.5);
    if (run.lamp) run.toggleLamp();
    return;
  }

  // 2. 挑一个「现在真的做得到」的应对，而不是清单上的第一个
  const weakness =
    t.creature.weakness.find((c) => c.kind !== 'supply' || run.count(c.supply as SupplyId) > 0) ??
    t.creature.weakness[0];
  if (!weakness) {
    rep.notes.push(`[无解] ${t.creature.name} 没有任何 weakness，只能挨一下`);
    advance(run, t.fuse + 1);
    return;
  }

  switch (weakness.kind) {
    case 'supply': {
      const id = weakness.supply as SupplyId;
      const def = supply(id);
      if (run.count(id) <= 0) {
        rep.notes.push(
          `[缺物资] 驱离 ${t.creature.name} 需要「${def.name}」，但舱里一个都没有（来源：打捞）`,
        );
        advance(run, t.fuse + 1);
        return;
      }
      if (def.station) run.walkTo(def.station);
      run.useSupply(id);
      break;
    }
    case 'blackout':
      run.walkTo('life');
      if (!run.blackout) run.toggleBlackout();
      break;
    case 'lampoff':
      run.walkTo('camera');
      if (run.lamp) run.toggleLamp();
      break;
    case 'fullstop':
      run.walkTo('nav');
      run.setThrottle(0);
      break;
    case 'fullahead':
      run.walkTo('nav');
      run.setThrottle(3);
      run.thrust();
      break;
  }

  advance(run, 1);
  // 相位由模拟层在 frame() 里改，这里必须重新读，不能信闭包里narrow 过的旧值
  const phase = (): string => t.phase;
  if (phase() === 'repelled') rep.threatsRepelled++;
  else if (phase() === 'struck') rep.threatsStruck++;
  else {
    rep.notes.push(`[没打退] 对 ${t.creature.name} 用了正解，相位仍是 ${phase()}`);
    advance(run, t.fuse + 1);
    if (phase() === 'struck') rep.threatsStruck++;
  }

  // 收尾：把总闸合回来，灯关掉，免得污染下一段的判断
  if (run.blackout) {
    run.walkTo('life');
    run.toggleBlackout();
  }
  if (run.lamp) {
    run.walkTo('camera');
    run.toggleLamp();
  }
  advance(run, 3);
}

/** 守在摄像头前把五秒曝光走完，再送到分析台拆内部。 */
function shootAndWait(run: PodRun): void {
  run.walkTo('camera');
  run.beginShoot();
  if (run.shot.phase !== 'exposing') return;
  let guard = 0;
  while (run.outcome.kind === 'alive' && run.shot.phase === 'exposing' && guard++ < 400) {
    run.frame(STEP);
  }
  advance(run, 0.4);
}

function revealInterior(run: PodRun): void {
  if (run.volumeKnown) return;
  shootAndWait(run);
  if (!run.tapes.length) return;
  run.walkTo('lab');
  run.analyzeTape();
}

/** 到站之后：拍第一卷 → 分析台重建内部 → 在舱室里走 → 出发进入下一段航渡 */
function exploreSite(run: PodRun, rep: Report, verbose: boolean): boolean {
  if (!run.volumeKnown) revealInterior(run);

  let guard = 0;
  while (run.outcome.kind === 'alive' && run.phase === 'site' && guard++ < 220) {
    maintain(run, rep);
    if (run.power < 0.16) {
      const ch = run.volume?.nodes.find((n) => n.role === 'charge');
      if (ch && run.volumeAt !== ch.id) {
        run.walkTo('nav');
        run.stepToward(ch.id);
        continue;
      }
      if (ch && run.volumeAt === ch.id) {
        run.walkTo('nav');
        run.charge();
        continue;
      }
    }
    if (run.threat && run.threat.phase === 'contact') {
      handleThreat(run, rep);
      continue;
    }

    const wreck = run.siteWreck();
    if (wreck) {
      if ((run.salvaged.get(wreck.id) ?? 0) === 0) rep.wrecksSeen++;
      if (verbose) console.log(`   打捞 ${wreck.name}`);
      run.walkTo('salvage');
      const before = totalStock(run);
      run.salvage();
      const gained = totalStock(run) - before;
      if (gained > 0) {
        rep.wrecksLooted++;
        rep.lootTotal += gained;
      }
      advance(run, 0.3);
      continue;
    }

    const vol = run.volume;
    const lock = vol?.locks.find((l) => !l.solved && l.node === run.volumeAt);
    if (lock) {
      run.walkTo('salvage');
      run.operateLock();
      advance(run, 0.2);
      continue;
    }

    const cache = vol?.caches.find((c) => c.node === run.volumeAt);
    if (cache && run.volumeKnown && (run.salvaged.get(`cache.${cache.node}`) ?? 0) === 0) {
      if (verbose && cache.truth === 'live') console.log(`   打捞 活电箱`);
      run.walkTo('salvage');
      run.salvage();
      continue;
    }

    if (run.canSurvey) {
      shootAndWait(run);
      continue;
    }
    if (run.canDepart) break;
    const goal = guard > 50 && run.volume ? exitNode(run.volume).id : run.volumeGoal();
    if (!goal) break;
    run.walkTo('nav');
    if (goal !== run.volumeAt) {
      const before = run.volumeAt;
      run.stepToward(goal);
      if (run.volumeAt === before) {
        if (run.volume?.hazards.some((h) => h.kind === 'photophobe')) shootAndWait(run);
        else {
          advance(run, 5.6);
          run.stepToward(goal);
        }
      }
      continue;
    }
    break;
  }

  if (run.canSurvey) shootAndWait(run);
  run.walkTo('nav');
  const before = run.legIndex;
  if(run.legIndex===6 && run.canDepart) run.chooseTransmission('seal');
  run.depart();
  return run.legIndex !== before || run.outcome.kind === 'escaped';
}

/** 理想玩家的例行维护：洗涤器、电、水。这三件事没人替你做。 */
function maintain(run: PodRun, rep: Report): void {
  const at = (id: SupplyId): boolean => run.count(id) > 0;

  if (run.scrubber < 0.20) {
    if (at('sup.filter')) {
      run.walkTo('life');
      run.useSupply('sup.filter');
    } else if (run.vitals.vitals.co2 > 55) {
      rep.notes.push('[缺滤芯] 洗涤器耗尽且舱内没有备用滤芯，CO₂ 只能一路涨上去');
    }
  }
  if (run.power < 0.25 && at('sup.cell')) {
    run.walkTo('life');
    run.useSupply('sup.cell');
  }
  if (run.leak > 0.0035 && at('sup.sealant')) {
    run.walkTo('life');
    run.useSupply('sup.sealant');
  }
  if (run.flood > 0.5) {
    run.walkTo('life');
    run.bail();
  }
}

function play(seed: number, verbose: boolean, reckless: boolean): Report {
  const run = new PodRun(seed);
  let arrivals = 0;
  const rep: Report = {
    profile: reckless ? '莽撞·永远三档' : '谨慎·挑档位',
    seed,
    arrivals: 0,
    finished: false,
    outcome: 'alive',
    breaths: 0,
    legsCleared: 0,
    wrecksSeen: 0,
    wrecksLooted: 0,
    lootTotal: 0,
    threatsSeen: 0,
    threatsIdentified: 0,
    threatsRepelled: 0,
    threatsStruck: 0,
    firstPing: {},
    minTemp: 99,
    minOxy: 1,
    maxCo2: 0,
    maxFear: 0,
    notes: [],
  };
  let sampled = false;

  const totalWrecks = ROUTE.reduce((s, l) => s + l.wrecks.length, 0);
  const lootedIds = new Set<string>();
  let lastLeg = -1;
  let guard = 0;

  while (run.outcome.kind === 'alive' && guard++ < 8000) {
    if (run.legIndex !== lastLeg) {
      lastLeg = run.legIndex;
      if (verbose) console.log(`\n── 航段 ${run.legIndex}：${run.leg.name}（${run.leg.length} m）`);
    }

    maintain(run, rep);

    // 收无线电
    run.walkTo('radio');
    let mail = 0;
    while (run.radioWaiting && mail++ < 12) run.receive();

    // 打一发脉冲，看清走廊
    run.walkTo('nav');
    run.ping(1);
    if (!sampled) {
      sampled = true;
      for (const c of run.contacts) rep.firstPing[c.kind] = (rep.firstPing[c.kind] ?? 0) + 1;
    }
    advance(run, 0.5);

    const vv = run.vitals.vitals;
    rep.minTemp = Math.min(rep.minTemp, vv.coreTemp);
    rep.minOxy = Math.min(rep.minOxy, vv.oxygen / vv.oxygenMax);
    rep.maxCo2 = Math.max(rep.maxCo2, vv.co2);
    rep.maxFear = Math.max(rep.maxFear, vv.fear);

    if (run.phase === 'transit') {
      // 航渡：雷达给的开口才是真的。指挥员后半程会撒谎。
      const want = run.leg.safeHeading;
      let turns = 0;
      while (Math.abs(run.headingError) > 2 && turns++ < 80) {
        run.nudgeHeading(run.headingError > 0 ? -5 : 5);
      }
      if (run.headingError !== 0 && Math.abs(run.headingError) > run.leg.tolerance) {
        rep.notes.push(`[拧不到位] 目标 ${want}°，拧了 ${turns} 下仍差 ${run.headingError.toFixed(0)}°`);
      }
      // 莽撞玩家永远挂三档，谨慎玩家按剩余距离挑
      run.setThrottle(reckless ? 3 : run.remaining >= 260 ? 3 : run.remaining >= 140 ? 2 : 1);
      run.thrust();
      if ((run.phase as RunPhase) === 'site') arrivals++;
      continue;
    }

    // 到站：拍清楚、在三维线框里走、再拍下一段。
    if (run.phase === 'site') {
      const wreck = run.siteWreck();
      if (wreck && !lootedIds.has(wreck.id)) {
        lootedIds.add(wreck.id);
        rep.wrecksSeen++;
      }
      const beforeLeg = run.legIndex;
      const moved = exploreSite(run, rep, verbose);
      if (run.legIndex > beforeLeg && run.outcome.kind === 'alive') arrivals++;
      if (!moved && run.outcome.kind === 'alive') {
        rep.notes.push(`[走不了] 站点 ${run.leg.siteName} 上 exploreSite 没有推进航段`);
        break;
      }
      continue;
    }
  }

  rep.breaths = run.breaths;
  rep.arrivals = arrivals;
  rep.legsCleared = run.legIndex;
  rep.outcome =
    run.outcome.kind === 'escaped' ? 'escaped'
    : run.outcome.kind === 'dead' ? `dead:${run.outcome.cause}`
    : 'stalled';
  rep.finished = run.outcome.kind === 'escaped';

  if (rep.wrecksSeen < totalWrecks) {
    rep.notes.push(`[错过废墟] 航线上共有 ${totalWrecks} 处废墟，这一趟只够到了 ${rep.wrecksSeen} 处`);
  }
  if (rep.finished && rep.arrivals < ROUTE.length) {
    rep.notes.push(`[漏站] 通关了，但只抵达过 ${rep.arrivals}/${ROUTE.length} 个站点`);
  }
  if (guard >= 8000) rep.notes.push('[死循环] 主循环没有收敛，航线可能推不动');

  return rep;
}

function totalStock(run: PodRun): number {
  let n = 0;
  // 走 ALL_SUPPLY_IDS 而不是手抄一份清单 —— 补给表还会继续长，
  // 手抄的那份每加一种物资就会把这个工具编译挂掉一次。
  for (const id of ALL_SUPPLY_IDS) n += run.count(id);
  return n;
}

// ============================================================================

const runs = Number(process.argv[2] ?? 6);
const verbose = runs === 1;
const reports: Report[] = [];
for (const reckless of [false, true]) {
  for (let i = 0; i < runs; i++) reports.push(play(0x51ce + i * 7919, verbose, reckless));
}

console.log('\n════════ 逃生舱流程验证 ════════');
let profile = '';
for (const r of reports) {
  if (r.profile !== profile) {
    profile = r.profile;
    console.log(`\n── ${profile}`);
  }
  console.log(
    `  seed ${r.seed}  ${r.finished ? '通关' : '中断'}  ${r.outcome.padEnd(16)}` +
      `  航段 ${r.legsCleared}/${ROUTE.length}  呼吸 ${r.breaths}` +
      `  废墟 ${r.wrecksLooted}/${r.wrecksSeen}(+${r.lootTotal})  到站 ${r.arrivals}/${ROUTE.length}` +
      `  威胁 看清${r.threatsIdentified}/退${r.threatsRepelled}/中${r.threatsStruck} 共${r.threatsSeen}`,
  );
}

const s0 = reports[0]!;
console.log(
  `\n首发脉冲回波：${Object.entries(s0.firstPing).map(([k, v]) => `${k}×${v}`).join('  ') || '（空）'}`,
);
console.log(
  `生理极值：体温最低 ${s0.minTemp.toFixed(1)}°C   余氧最低 ${(s0.minOxy * 100).toFixed(0)}%` +
    `   CO₂ 峰值 ${s0.maxCo2.toFixed(0)}   恐惧峰值 ${s0.maxFear.toFixed(0)}`,
);

const finished = reports.filter((r) => r.finished).length;
console.log(`\n通关率 ${finished}/${reports.length}`);

// ── 航渡 / 到站 探针 ──────────────────────────────────────────────────────
// 主循环是「一路顺风」的跑法，测不出边界。这一节直接构造出每一个状态转换，
// 逐条断言：航渡时捞不到、到站时推不动、拍完下一段后沿线框滑入下一关。
console.log('\n──── 航渡 / 到站 探针 ────');
{
  const ok = (label: string, pass: boolean, detail = ''): void =>
    console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? '  —— ' + detail : ''}`);

  const run = new PodRun(0x51ce);
  ok('开局是航渡阶段', run.phase === 'transit', `phase=${run.phase}`);

  // 航渡途中不该有任何可捞的东西
  run.walkTo('salvage');
  const t0 = totalStock(run);
  run.salvage();
  ok('航渡途中打捞无效', run.siteWreck() === null && totalStock(run) === t0);

  // 航渡途中声呐要有目标点，且距离随推进收拢
  run.walkTo('nav');
  run.ping(1);
  const target0 = run.contacts.find((c) => c.id === 'target');
  ok('航渡声呐有目标点', !!target0, target0 ? `range=${target0.range.toFixed(2)}` : '缺失');
  ok('航渡声呐没有阴影图', run.siteShadow.length === 0);

  // 一路开到站
  let pulses = 0;
  run.setThrottle(3);
  while (run.phase === 'transit' && pulses++ < 40) {
    while (Math.abs(run.headingError) > 2) run.nudgeHeading(run.headingError > 0 ? -5 : 5);
    run.thrust();
  }
  ok('推进能抵达站点', run.phase === 'site', `用了 ${pulses} 发脉冲`);
  ok('到站后推进器归零', run.throttle === 0);

  // 到站之后：声呐只有未知废墟，没有近场几何
  ok('到站没有近场阴影图', run.siteShadow.length === 0, `${run.siteShadow.length} 个扇区`);
  run.ping(1);
  ok('到站声呐没有目标点了', !run.contacts.some((c) => c.id === 'target'));
  ok('到站声呐有未知废墟', run.contacts.some((c) => c.kind === 'wreck'), run.contacts.find((c) => c.kind === 'wreck')?.label ?? '');

  const before = run.traveled;
  run.thrust();
  ok('到站未分析时不能进内部', run.volumeAt === (run.volume ? run.volume.nodes.find((n) => n.role === 'entry')?.id : ''), '推力停在气闸');
  ok('到站后航渡行程不再增加', run.traveled === before, '推力改在内部里走');

  run.walkTo('camera');
  shootAndWait(run);
  ok('第一卷进了片盒但内部还没进场', run.tapes.length >= 1 && !run.volumeKnown);
  run.walkTo('lab');
  run.analyzeTape();
  ok('分析台之后内部进场', run.volumeKnown, `nodes=${run.volume?.nodes.length ?? 0}`);
  ok('分析后全息有体积', run.siteShadow.length > 0, `${run.siteShadow.length} 个扇区`);

  const wreckNode = run.volume?.nodes.find((n) => n.role === 'wreck');
  if (wreckNode) {
    run.walkTo('nav');
    let hops = 0;
    while (run.volumeAt !== wreckNode.id && hops++ < 8) run.stepToward(wreckNode.id);
  }
  run.walkTo('salvage');
  const t1 = totalStock(run);
  run.salvage();
  ok('到站可以打捞', totalStock(run) > t1 || !!run.threat, `stock ${totalStock(run) - t1}`);

  // 走到出口拍下一段再出发
  let hops = 0;
  while (!run.canDepart && hops++ < 80 && run.outcome.kind === 'alive') {
    if (run.threat && run.threat.phase === 'contact') {
      handleThreat(run, {
        profile: '', seed: 0, arrivals: 0, finished: false, outcome: '', breaths: 0,
        legsCleared: 0, wrecksSeen: 0, wrecksLooted: 0, lootTotal: 0,
        threatsSeen: 0, threatsIdentified: 0, threatsRepelled: 0, threatsStruck: 0,
        firstPing: {}, minTemp: 0, minOxy: 0, maxCo2: 0, maxFear: 0, notes: [],
      });
      continue;
    }
    const w = run.siteWreck();
    if (w) {
      run.walkTo('salvage');
      run.salvage();
      continue;
    }
    const cache = run.volume?.caches.find((c) => c.node === run.volumeAt);
    if (cache && run.volumeKnown && (run.salvaged.get(`cache.${cache.node}`) ?? 0) === 0) {
      run.walkTo('salvage');
      run.salvage();
      continue;
    }
    const lock = run.volume?.locks.find((l) => !l.solved && l.node === run.volumeAt);
    if (lock) {
      run.walkTo('salvage');
      run.operateLock();
      continue;
    }
    if (run.canSurvey) {
      shootAndWait(run);
      continue;
    }
    const goal = run.volumeGoal();
    run.walkTo('nav');
    const beforeHop = run.volumeAt;
    run.stepToward(goal);
    if (run.volumeAt === beforeHop) advance(run, 5.2);
  }
  run.walkTo('nav');
  ok('出发前不必预生成下一关', !run.nextVolume);
  const leg0 = run.legIndex;
  const exitId = run.volumeAt;
  run.depart();
  ok('出发后进入航渡', run.legIndex === leg0 + 1 && run.phase === 'transit', `leg ${leg0}→${run.legIndex} ${run.phase}`);
  ok('航渡全息没有近场', run.siteShadow.length === 0);
  ok('航渡声呐有未知废墟目标', run.contacts.some((c) => c.id === 'target'));
  void exitId;
}

// ── 摄影机状态机探针 ──────────────────────────────────────────────────────
// 「曝光一卷」是唯一一个牵涉外部网络的功能，所以这一节要证明的恰恰是
// **模拟层完全不碰网络**：不挂 footageSink 的时候，整条状态机照样走得完，
// 每一卷都干净地废掉，而游戏不受任何影响。这就是断网玩家走的那条路。
console.log('\n──── 摄影机状态机 ────');
{
  const ok = (label: string, pass: boolean, detail = ''): void =>
    console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? '  —— ' + detail : ''}`);
  const tick = (run: PodRun, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) run.frame(STEP);
  };
  /** 把舱开到本段站点上 */
  const toSite = (run: PodRun): void => {
    run.setThrottle(3);
    let g = 0;
    while (run.phase === 'transit' && g++ < 40) {
      while (Math.abs(run.headingError) > 2) run.nudgeHeading(run.headingError > 0 ? -5 : 5);
      run.thrust();
    }
  };
  const toWreck = (run: PodRun): void => {
    const wreckNode = run.volume?.nodes.find((n) => n.role === 'wreck');
    if (!wreckNode) return;
    run.walkTo('nav');
    let hops = 0;
    while (run.volumeAt !== wreckNode.id && hops++ < 8) run.stepToward(wreckNode.id);
  };

  {
    const run = new PodRun(0x51ce);
    ok('开局摄影机待机', run.shot.phase === 'idle', `phase=${run.shot.phase}`);

    // 航渡途中不许拍：舱在动，九秒曝光只会拉成一条糊线
    run.walkTo('camera');
    run.beginShoot();
    ok('航渡途中快门锁着', run.shot.phase === 'idle');

    toSite(run);
    run.walkTo('camera');
    const pwr = run.power;
    run.beginShoot();
    ok('到站可以曝光', run.shot.phase === 'exposing', `phase=${run.shot.phase}`);
    ok('曝光扣了电', run.power < pwr, `${pwr.toFixed(3)} → ${run.power.toFixed(3)}`);
  }

  {
    // 离开机位 = 云台失控 = 这一卷废了。这条规则是这个机制的核心取舍。
    const run = new PodRun(0x51ce);
    toSite(run);
    run.walkTo('camera');
    run.beginShoot();
    tick(run, 2);
    run.walkTo('nav');
    tick(run, 0.5);
    ok('曝光中离开机位就废卷', run.shot.phase === 'failed', run.shot.reason.slice(0, 24));
  }

  {
    // 没有 footageSink（无头、断网、没配 key）：曝光走完就干净地废掉。
    // 这一条是「完全离线也能通关」的那条代码路径。
    const run = new PodRun(0x51ce);
    toSite(run);
    run.walkTo('camera');
    run.beginShoot();
    tick(run, 10);
    ok('没有冲洗回路时整卷废掉', run.shot.phase === 'failed', run.shot.reason.slice(0, 20));
    ok('废卷后屏幕不放片子', run.shot.viewing === false);
    // 废了还能再拍 —— 否则一次失败就永久锁掉这个工位
    run.beginShoot();
    ok('废卷之后可以重拍', run.shot.phase === 'exposing');
  }

  {
    // 挂上一个同步的假 sink：状态机应该走到 ready。
    // 真实的 sink 在 view 层（src/pod/view/footage.ts），会发 fetch。
    const run = new PodRun(0x51ce);
    let seenPrompt = '';
    let seenFallback = '';
    run.footageSink = (req) => {
      seenPrompt = req.prompt;
      seenFallback = req.fallbackPrompt;
      req.settle(req.token, true);
    };
    toSite(run);
    run.walkTo('camera');
    run.beginShoot();
    tick(run, 10);
    ok('冲洗成功后可播放', run.shot.phase === 'ready', `phase=${run.shot.phase}`);
    ok('提示词非空且带站点信息', seenPrompt.length > 200, `${seenPrompt.length} 字符`);
    ok('回落提示词不含怪物描述', seenFallback.length > 100 && seenFallback.length < seenPrompt.length);
    ok('提示词的正面描述里没有绿', !/green|teal|cyan/i.test(seenPrompt.split('Absolutely no green')[0] ?? ''));
    const fauna = run.volume ? faunaOnTape(run.volume) : [];
    ok(
      '提示词写入了生成的生物',
      fauna.length > 0 && fauna.every((c) => seenPrompt.includes(c.footage.slice(0, 28))),
      fauna.map((c) => c.name).join('、') || '空',
    );
    ok(
      '提示词写出了声呐歧义',
      /huge sonar contact|pinpoint sonar contact|harmless on contact|lethal on contact/i.test(seenPrompt),
    );
    ok('提示词写入了当前 SAN', /Operator sanity is (stable|frayed|broken)/.test(seenPrompt));

    // 切监视回路 / 切回片子
    run.toggleFootageView();
    ok('可以切回监视回路', run.shot.viewing === false);
    run.replayFootage();
    ok('可以回放', run.shot.viewing === true);

    ok('冲好的片子进了片盒', run.tapes.length >= 1, `${run.tapes.length} 卷`);
    run.walkTo('lab');
    ok('分析台能选中这一卷', !!run.selectedTape && run.selectedTape.analyzed === false);
    run.analyzeTape();
    ok('上卷之后写出习性', !!run.selectedTape?.analyzed && (run.selectedTape?.report.length ?? 0) > 1);
    ok('造物进了档案', run.filed.size > 0, `${run.filed.size} 种`);
    run.analyzeTape();
    ok('同一卷再拆不扣第二次', run.selectedTape?.analyzed === true);

    // 换段就换一卷：上一段的片子留在屏上会骗人
    const before = run.legIndex;
    let hops = 0;
    while (!run.canDepart && hops++ < 80 && run.outcome.kind === 'alive') {
      const w = run.siteWreck();
      if (w) {
        run.walkTo('salvage');
        run.salvage();
        continue;
      }
      const cache = run.volume?.caches.find((c) => c.node === run.volumeAt);
      if (cache && run.volumeKnown && (run.salvaged.get(`cache.${cache.node}`) ?? 0) === 0) {
        run.walkTo('salvage');
        run.salvage();
        continue;
      }
      const lock = run.volume?.locks.find((l) => !l.solved && l.node === run.volumeAt);
      if (lock) {
        run.walkTo('salvage');
        run.operateLock();
        continue;
      }
      if (run.canSurvey) {
        shootAndWait(run);
        continue;
      }
      const goal = run.volumeGoal();
      run.walkTo('nav');
      const beforeHop = run.volumeAt;
      run.stepToward(goal);
      if (run.volumeAt === beforeHop) advance(run, 5.2);
    }
    run.walkTo('nav');
    run.depart();
    ok('出发后摄影机归零', run.shot.phase === 'idle' && run.shot.legId === '', `leg ${before}→${run.legIndex}`);
  }

  /**
   * 「拍到了」和「盯清了」是两条独立的路，而且阈值不同：
   *   胶片拍到  aim > 0.35
   *   监视回路盯清 aim > 0.55（而且要连续盯 1.6 秒）
   * 想单独测胶片那条路，就得把云台停在两个阈值**之间** ——
   * 否则曝光那九秒里监视回路自己就把东西认出来了，测出来的是旧机制。
   * fov = 0.55 / camZoom，所以偏 0.30 弧度对应 aim ≈ 0.45。
   */
  const AIM_GAP = 0.30;

  {
    // 拍到了那个东西 → 冲出来就等于看清了。这是摄影机在警报态里的用处。
    const run = new PodRun(0x51ce);
    run.footageSink = (req) => req.settle(req.token, true);
    toSite(run);
    revealInterior(run);
    toWreck(run);
    run.walkTo('salvage');
    run.salvage(); // 机械臂的噪音把站点上的东西招出来
    const t = run.threat;
    if (!t) {
      ok('打捞招来了威胁', false, '没有红点，后面几条测不了');
    } else {
      run.walkTo('camera');
      if (!run.lamp) run.toggleLamp();
      run.camPan = t.bearing + AIM_GAP;
      const aim = run.cameraOnTarget();
      ok('云台停在两个阈值之间', aim > 0.35 && aim < 0.55, `aim=${aim.toFixed(2)}`);
      run.beginShoot();
      for (let i = 0; i < Math.round(10 / STEP); i++) {
        run.camPan = t.bearing + AIM_GAP;
        run.frame(STEP);
      }
      ok('这个角度监视回路盯不清', t.lookedAt === 0, `lookedAt=${t.lookedAt.toFixed(2)}`);
      ok('但胶片拍到了', run.shot.caught === true);
      ok('冲出来就看清了 —— 只可能是胶片的功劳', t.known === true, `phase=${t.phase}`);
    }
  }

  {
    // 上游内容审核驳回 → 用不含怪物的那一版重试成功 → 不算看清。
    // 实拍见 docs/video-api-probe.md：溺者合唱那一段被 "output new_sensitive" 驳回。
    const run = new PodRun(0x51ce);
    run.footageSink = (req) => req.settle(req.token, true, undefined, true);
    toSite(run);
    revealInterior(run);
    toWreck(run);
    run.walkTo('salvage');
    run.salvage();
    const t = run.threat;
    run.walkTo('camera');
    if (!run.lamp) run.toggleLamp();
    if (t) run.camPan = t.bearing + AIM_GAP;
    run.beginShoot();
    for (let i = 0; i < Math.round(10 / STEP); i++) {
      if (t) run.camPan = t.bearing + AIM_GAP;
      run.frame(STEP);
    }
    ok('审核回落后仍能播放', run.shot.phase === 'ready');
    ok('但那一卷里没有它，所以不算看清', run.shot.caught === false && t?.known !== true);
  }

  {
    // 迟到的回调不许污染新的一卷。异步 + 玩家会离站 = 必须有 token 校验。
    const run = new PodRun(0x51ce);
    // 用数组存住回调而不是一个可空变量：后者在赋值发生在闭包里时会被 TS
    // 收窄成 never，调用处就编译不过了。
    const held: (() => void)[] = [];
    run.footageSink = (req) => {
      held.push(() => req.settle(req.token, true));
    };
    toSite(run);
    run.walkTo('camera');
    run.beginShoot();
    tick(run, 10);
    ok('冲洗中', run.shot.phase === 'developing');
    ok('冲洗请求已经发给表现层', held.length === 1);
    run.walkTo('nav');
    run.depart(); // 离站，这一卷作废 — 必须先把线框走完
    ok('离站后摄影机归零', run.shot.phase === 'idle' || run.shot.phase === 'failed' || run.phase === 'site');
    held[0]?.();
    ok('未出发时冲洗回调仍会完成', run.shot.phase === 'ready', `phase=${run.shot.phase}`);
  }
}

// ── 阴影地图形状探针 ──────────────────────────────────────────────────────
// 每个站点该长得不一样，而且同一个站点每次进去要一模一样。
// 如果所有站点的阴影都长一个样，这张「地图」就没有承载任何信息。
console.log('\n──── 三维线框 ────');
{
  const shapes: string[] = [];
  for (let act = 0; act < ACT_COUNT; act++) {
    const g = generateVolume(act, 0x51ce, null, null);
    const sig = g.volume.nodes.map((n) => `${n.role}:${n.pos.x.toFixed(0)},${n.pos.z.toFixed(0)}`).join('|');
    shapes.push(sig);
    const verts = g.volume.nodes.filter((n) => Math.abs(n.pos.z) > 8).length;
    const fauna = faunaOnTape(g.volume);
    const names = fauna.map((c) => c.name).join(' / ');
    const traps = g.volume.hazards.map((h) => h.kind).join('+') || '无';
    const trapsCaches = g.volume.caches.filter((c) => c.truth === 'trap').length;
    console.log(
      `  ${g.leg.siteName.padEnd(12)} 职能 ${g.volume.story.padEnd(16)} 节点 ${g.volume.nodes.length}` +
        `  边 ${g.volume.edges.length}  竖向 ${verts}  回波 ${g.volume.echoes.length}` +
        `  机关 ${traps}  锁 ${g.volume.locks.length}` +
        `  货箱 ${g.volume.caches.length}  诡雷 ${trapsCaches}  生物 ${fauna.length}  ${g.volume.stencil}`,
    );
    console.log(`             ${names}`);
  }
  const unique = new Set(shapes).size;
  console.log(`  ${unique === ACT_COUNT ? '✓' : '✗'} ${unique}/${ACT_COUNT} 个关卡的线框互不相同`);
}

console.log('\n──── 剧情职能约束 ────');
{
  const seed = 0x51ce;
  const chart: Volume[] = [];
  const fails: string[] = [];
  for (let act = 0; act < ACT_COUNT; act++) {
    const prior = act === 0 ? null : collectMemory(chart, seed);
    const g = generateVolume(act, seed, null, null, 100, prior);
    chart.push(g.volume);
    const v = g.volume;
    const trapCaches = v.caches.filter((c) => c.truth === 'trap').length;
    if (v.story === 'accident' && trapCaches > 0) fails.push('第1关出现了诡雷货箱');
    if (v.story === 'too-ready') {
      const good = v.nodes.find((n) => n.role === 'interact');
      const bad = v.nodes.find((n) => n.role === 'decoy');
      if (good && bad && Math.abs(Math.abs(good.pos.x) - Math.abs(bad.pos.x)) > 1.5) {
        fails.push('第2关分叉没有镜像');
      }
    }
    if (v.story === 'path-remembers') {
      const echo = v.nodes.find((n) => n.role === 'echo');
      const entry = v.nodes.find((n) => n.role === 'entry');
      if (echo && entry) {
        const b = bearingTo(entry.pos, echo.pos);
        let d = Math.abs(b.heading - g.leg.advisedHeading);
        if (d > 180) d = 360 - d;
        if (d > 18) fails.push(`第3关回波不在万斯航向上 Δ${d.toFixed(1)}°`);
      }
    }
    if (v.story === 'dont-look') {
      const echo = v.nodes.find((n) => n.role === 'echo');
      const wreck = v.nodes.find((n) => n.role === 'wreck');
      if (echo && wreck && Math.abs(echo.pos.y - wreck.pos.y) > 2) fails.push('第4关双块不在同一深度线');
    }
    if (v.story === 'still-running' && !v.nodes.some((n) => n.label.includes(v.stencil))) {
      fails.push('第5关没有复用灰港编号');
    }
    if (v.story === 'escort' && !v.echoes.some((e) => e.kind === 'watcher')) {
      fails.push('第6关没有伴行回波');
    }
    if (v.story === 'too-clean' && v.caches.length > 0) fails.push('第7关竖井仍有货箱');
    if (act > 0 && v.stencil !== chart[0]!.stencil) fails.push(`第${act + 1}关编号漂移`);
    const hook = hookFor(v.story);
    if (!v.hookNode || !v.nodes.some((n) => n.id === v.hookNode)) {
      fails.push(`第${act + 1}关没有卡关钩节点（要的是${hook.object}）`);
    } else {
      const hooked = v.nodes.find((n) => n.id === v.hookNode)!;
      if (hook.need === 'echo-wreck' && hooked.role !== 'wreck' && hooked.role !== 'echo') {
        fails.push('第1关钩子不是残骸/回波');
      }
      if (hook.need === 'paint-fork' && (hooked.role !== 'interact' || hooked.stripe !== 'ember')) {
        fails.push('第2关钩子不是刷了警戒漆的管道');
      }
      if (hook.need === 'period-heading' && hooked.role !== 'hazard' && hooked.role !== 'echo') {
        fails.push('第3关钩子不在喷口/回波上');
      }
      if (hook.need === 'true-charge' && hooked.role !== 'charge') {
        fails.push('第4关钩子不是真充电桩');
      }
      if (hook.need === 'fan-and-cut' && (hooked.role !== 'interact' || v.locks.length === 0)) {
        fails.push('第5关钩子不是带锁的门');
      }
      if (hook.need === 'watcher-face' && !v.echoes.some((e) => e.kind === 'watcher' && e.node === v.hookNode)) {
        fails.push('第6关钩子不是伴行回波');
      }
      if (hook.need === 'glyph-barge' && hooked.role !== 'wreck') {
        fails.push('第7关钩子不是驳船舷侧');
      }
    }
  }
  if (fails.length) for (const f of fails) console.log(`  ✗ ${f}`);
  else console.log('  ✓ 七关剧情职能全部压进生成结果');
}

// ── 指路文案体检 ──────────────────────────────────────────────────────────
// 提示里叫「推进台」，铭牌上写「推进控制」—— 玩家在舱里找了半天，
// 结论是「这游戏没有推进台」。这一节把一整趟跑出来的日志全捞出来，
// 检查里面提到的每一个工位名都真的存在、每一个键号都真的按得出来。
console.log('\n──── 指路文案体检 ────');
{
  const valid = new Set(Object.values(STATIONS).map((s) => s.name));
  const run = new PodRun(0x51ce);
  const seen: string[] = [];
  const bad: string[] = [];

  // 触发尽量多的提示：撞壁、到站、系统告警
  run.nudgeHeading(60);
  run.setThrottle(2);
  run.thrust(); // 偏航撞壁
  run.nudgeHeading(-60);
  run.setThrottle(3);
  for (let i = 0; i < 6 && run.phase === 'transit'; i++) run.thrust();
  run.walkTo('salvage');
  run.salvage();
  for (let i = 0; i < 900; i++) run.frame(1 / 30);
  run.scrubber = 0.01;
  run.power = 0.1;
  run.leak = 0.005;
  run.flood = 0.6;
  for (let i = 0; i < 300; i++) run.frame(1 / 30);

  for (const line of run.log) {
    seen.push(line.text);
    // 任何「……台」都必须是真工位名。
    // 注意匹配会把前面的字一起吞进来（「先在领航台」），所以判定是
    // 「有没有哪个真名是这一段的后缀」，而不是整段相等。
    for (const m of line.text.matchAll(/[\u4e00-\u9fa5]{2,6}台/g)) {
      const hit = [...valid].some((name) => m[0].endsWith(name));
      if (!hit) bad.push(`未知工位名「${m[0]}」：${line.text}`);
    }
    // 「（按 N）」的 N 必须真的能直达
    for (const m of line.text.matchAll(/（按 (\d)）/g)) {
      const n = Number(m[1]);
      if (n < 1 || n > STATION_ORDER.length) bad.push(`键号越界「按 ${n}」：${line.text}`);
    }
  }

  console.log(`  扫描 ${seen.length} 条日志`);
  if (bad.length) for (const b of bad) console.log(`  ✗ ${b}`);
  else console.log('  ✓ 提到的工位名和键号全部对得上');
}

const notes = new Map<string, number>();
for (const r of reports) {
  for (const n of r.notes) notes.set(n, (notes.get(n) ?? 0) + 1);
}
if (notes.size) {
  console.log('\n──── 卡点 ────');
  for (const [n, c] of [...notes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ×${c}  ${n}`);
  }
} else {
  console.log('\n没有发现卡点。');
}

void STATIONS;
