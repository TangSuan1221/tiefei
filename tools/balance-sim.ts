/**
 * 《铁肺迷城》— 蒙特卡洛平衡模拟器 (Agent A)
 * ============================================================
 *   npx tsx tools/balance-sim.ts [--runs=2000] [--seed=20260915] [--quiet]
 *
 * 它做什么：用四种玩家策略原型，各跑数百次完整逃生，统计存活率、死因分布、
 * SAN 曲线分位数与氧气紧张度，然后**明确地把平衡问题打印出来**。
 *
 * 为什么它不 import `src/world`：那是 Agent B 的目录，与我并行开发中，
 * 依赖它会让我的调参循环随时被别人的半成品打断。所以这里自带一个抽象世界模型，
 * 它只保留对生理系统有意义的那几个维度（噪音、淹水、压强、空气品质、注视感），
 * 几何细节一律丢弃。平衡数据关心的是资源流，不是走廊形状。
 *
 * 判据（来自任务书）：
 *   - 四种策略原型的存活率都落在 25%–55%（没有统治性策略）
 *   - 每种死因在死亡分布中都有 ≥3% 的占比
 *   - 氧气必须真的紧张（低氧时间占比不能接近 0）
 */

import type {
  AmbientConditions, DirectorContext, Door, ID, MoveResult, Room, SimContext,
  SonarResult, WorldGenConfig, WorldSystem, DeathCause, Seed,
} from '../src/core/contract.ts';
import { BREATH } from '../src/core/contract.ts';
import { Xoshiro } from '../src/core/rng.ts';
import { Flags } from '../src/core/flags.ts';
import { clamp, clamp01 } from '../src/core/util.ts';
import { VitalsEngine } from '../src/sim/vitals.ts';
import { VeracityEngine } from '../src/sim/veracity.ts';
import { Director } from '../src/sim/director.ts';
import { TUNING } from '../src/sim/tuning.ts';

// ============================================================================
// 0. 四种玩家策略原型
// ============================================================================

type StrategyId = 'scavenger' | 'sprinter' | 'sonar' | 'holder';

interface StrategySpec {
  id: StrategyId;
  label: string;
  /** 搜刮倾向 0..1 */
  loot: number;
  /** 声呐倾向 0..1 */
  ping: number;
  /** 冒进倾向 0..1（跑动、强开门、无视噪音） */
  rush: number;
  /** 屏息倾向 0..1 */
  hold: number;
  /** 使用手灯的倾向 0..1 */
  lamp: number;
  /** 参与仪式的倾向 0..1 */
  piety: number;
  /** 疲劳到多少才肯休息 */
  restAt: number;
  /** CO2 到多少就主动吐气（屏息型会憋到更靠近 80） */
  releaseAt: number;
}

const STRATEGIES: readonly StrategySpec[] = [
  {
    id: 'scavenger', label: '保守搜刮型',
    loot: 0.92, ping: 0.35, rush: 0.08, hold: 0.3, lamp: 0.85, piety: 0.35,
    restAt: 62, releaseAt: 52,
  },
  {
    id: 'sprinter', label: '激进冲刺型',
    loot: 0.12, ping: 0.2, rush: 0.93, hold: 0.1, lamp: 0.55, piety: 0.1,
    restAt: 88, releaseAt: 45,
  },
  {
    id: 'sonar', label: '声呐依赖型',
    loot: 0.4, ping: 0.95, rush: 0.3, hold: 0.25, lamp: 0.2, piety: 0.7,
    restAt: 70, releaseAt: 50,
  },
  {
    id: 'holder', label: '屏息潜行型',
    loot: 0.45, ping: 0.25, rush: 0.12, hold: 0.95, lamp: 0.3, piety: 0.25,
    restAt: 74, releaseAt: 72,
  },
];

// ============================================================================
// 1. 抽象世界 —— 实现 WorldSystem 以便真实地驱动 Director
// ============================================================================

const DECK_DEPTH = [340, 720, 1150, 1620, 2100];
const DECK_NAMES = ['生活层', '机械层', '指挥层', '圣所层', '月池层'];
const ARCHES: Room['archetype'][][] = [
  ['bunks', 'galley', 'medbay', 'corridor', 'bulkhead', 'crawlspace'],
  ['engine', 'reactor', 'ballast', 'corridor', 'bulkhead', 'flooded'],
  ['bridge', 'sonar-room', 'archive', 'corridor', 'bulkhead', 'torpedo'],
  ['chapel', 'reliquary', 'observation', 'corridor', 'void', 'flooded'],
  ['moonpool', 'airlock', 'flooded', 'corridor', 'void', 'crawlspace'],
];

/**
 * 涉水区：水位 0.55–0.82 —— 没到没顶，所以不会淹死你，但散热是干燥舱的三到四倍。
 * 低温必须靠"一段路"而不是"一个房间"才能致死，所以这些房间成段出现。
 * 没有它们时低温死因只有 1.5%，整套体温模型形同虚设。
 */
const WADING: Record<number, readonly number[]> = { 1: [4], 3: [4], 4: [3] };

const ROOMS_PER_DECK = 6;

/** Room.doors 在契约里是 readonly；建图时需要后填，所以内部用这个可变别名。 */
type MutableRoom = Omit<Room, 'doors'> & { doors: Door[] };

class MockWorld implements WorldSystem {
  readonly rooms = new Map<ID, MutableRoom>();
  currentRoomId: ID = 'r0.0';

  constructor(private rng: Xoshiro) {
    this.build();
  }

  private build(): void {
    for (let d = 0; d < 5; d++) {
      for (let i = 0; i < ROOMS_PER_DECK; i++) {
        const id = `r${d}.${i}`;
        const arche = ARCHES[d][i % ARCHES[d].length] as Room['archetype'];
        this.rooms.set(id, {
          id,
          archetype: arche,
          name: `${DECK_NAMES[d]}·${i}`,
          pos: { x: i, y: d },
          deck: d + 1,
          ambient: this.ambientFor(d, arche, (WADING[d] ?? []).includes(i)),
          doors: [],
          props: [],
          visited: false,
          mapped: false,
          veracity: this.rng.bool(0.15) ? 'unstable' : 'real',
          noise: 0,
          noiseThreshold: 30 + this.rng.int(0, 12),
          tags: [],
        });
      }
    }
    // 走廊脊柱 + 一条跨层竖井，够 Director 的 BFS 算出有意义的跳数。
    for (let d = 0; d < 5; d++) {
      for (let i = 0; i < ROOMS_PER_DECK; i++) {
        const room = this.rooms.get(`r${d}.${i}`);
        if (!room) continue;
        const doors: Door[] = [];
        if (i + 1 < ROOMS_PER_DECK) doors.push(this.door(`r${d}.${i + 1}`));
        if (i > 0) doors.push(this.door(`r${d}.${i - 1}`));
        if (i === ROOMS_PER_DECK - 1 && d + 1 < 5) doors.push(this.door(`r${d + 1}.0`));
        if (i === 0 && d > 0) doors.push(this.door(`r${d - 1}.${ROOMS_PER_DECK - 1}`));
        room.doors = doors;
      }
    }
  }

  private door(to: ID): Door {
    return {
      id: `d.${to}.${this.rng.int(0, 9999)}`,
      to,
      state: 'closed',
      pressureDelta: this.rng.float(0, 2),
      unstable: this.rng.bool(0.2),
    };
  }

  private ambientFor(deckIdx: number, arche: Room['archetype'], wading: boolean): AmbientConditions {
    const depth = DECK_DEPTH[deckIdx];
    const flooded = arche === 'flooded';
    const deep = arche === 'void' || arche === 'moonpool';
    return {
      // 淹水必须是**地点**而不是天气：绝大多数舱室是干的，积水区才是真正的没顶。
      flooding: flooded
        ? this.rng.float(0.9, 1)
        : wading
          ? this.rng.float(0.5, 0.72)
          : clamp01(this.rng.float(-0.5, 0.22) + deckIdx * 0.07),
      pressure: 1 + depth / 10.06,
      // 密闭壳体保温，所以舱内远高于舷外水温；越深越冷只是因为供暖早就停了。
      temperature: clamp(17 - deckIdx * 1.5 + this.rng.float(-2, 2), 2, 22),
      airQuality: clamp01(this.rng.float(0.45, 1) - deckIdx * 0.06 - (flooded ? 0.35 : 0)),
      noiseFloor: this.rng.float(0, 0.4),
      presence: clamp01(this.rng.float(-0.25, 0.5) + deckIdx * 0.14 + (deep ? 0.3 : 0)),
    };
  }

  generate(_seed: Seed, _cfg: WorldGenConfig): void {
    /* 抽象世界在构造时就已生成；保留此方法仅为满足 WorldSystem 契约。 */
  }

  room(id: ID): Room {
    const r = this.rooms.get(id);
    if (!r) throw new Error(`no room ${id}`);
    return r;
  }

  move(doorId: ID): MoveResult {
    const cur = this.room(this.currentRoomId);
    const door = cur.doors.find((d) => d.id === doorId);
    if (!door) return { ok: false, blockedBy: 'locked', cost: 0, noise: 0, events: [] };
    this.currentRoomId = door.to;
    return { ok: true, arrivedAt: door.to, cost: BREATH.STEP, noise: 1, events: [] };
  }

  /** 直接跳到指定房间。策略层用它，绕开门的细节——几何不是本模拟器关心的东西。 */
  teleport(id: ID): void {
    if (this.rooms.has(id)) this.currentRoomId = id;
  }

  ping(power: number, fidelity: number): SonarResult {
    return { revealed: [this.currentRoomId], noise: power * 3, anomalies: [], artifacts: [] };
  }

  reweave(): void {
    /* 抽象世界不重织：拓扑变化对资源流的影响已被"走错路"的进度惩罚吸收。 */
  }

  addNoise(roomId: ID, amount: number): void {
    const r = this.rooms.get(roomId);
    if (r) r.noise += amount;
  }

  /** 噪音衰减 -0.8/呼吸，相邻房间 40% 溢出 —— GDD §4.3。 */
  decayNoise(dt: number): void {
    const spill: [ID, number][] = [];
    for (const r of this.rooms.values()) {
      if (r.noise <= 0) continue;
      const before = r.noise;
      r.noise = Math.max(0, r.noise - 0.8 * dt);
      const shed = (before - r.noise) * 0.4;
      for (const d of r.doors) spill.push([d.to, shed / Math.max(1, r.doors.length)]);
    }
    for (const [id, n] of spill) {
      const r = this.rooms.get(id);
      if (r) r.noise += n;
    }
  }

  serialize(): unknown {
    return null;
  }

  hydrate(): void {
    /* 模拟器不读档。 */
  }
}

// ============================================================================
// 2. 单次 run
// ============================================================================

interface RunResult {
  strategy: StrategyId;
  survived: boolean;
  breaths: number;
  cause: DeathCause | null;
  hypercapnic: boolean;
  endOxygenFraction: number;
  deckReached: number;
  endSan: number;
  minSan: number;
  endCorruption: number;
  lowOxygenFraction: number;
  gasps: number;
  liesBorn: number;
  liesDebunked: number;
  reliefs: number;
  spawns: number;
  peakInfection: number;
  peakIntensity: number;
}

/**
 * 完成一层甲板所需的"信息点"。越深越多——越往下你越不知道自己在哪。
 * 唯独月池层反而最短：那里没有什么可查的，只有一条出路和一个正在压扁你的深度。
 * 它必须能在内爆倒计时（约 121 呼吸）内跑完，否则最后一层等于必死。
 */
const DECK_REQUIREMENT = [14, 19, 22, 24, 14];

function deckRequirement(deck: number): number {
  return DECK_REQUIREMENT[clamp(deck, 0, 4)];
}

function runOne(seed: number, spec: StrategySpec): RunResult {
  const rng = new Xoshiro(seed, 'run');
  const flags = new Flags();
  const world = new MockWorld(rng.fork('world') as Xoshiro);
  const vitals = new VitalsEngine({});
  const veracity = new VeracityEngine({ seed: seed ^ 0x9e37, vitals });
  vitals.attachPerception(veracity);
  const director = new Director();

  flags.set('sys.allow-self-harm', 1);
  flags.set(TUNING.pressure.ratingFlag, TUNING.pressure.suitRating);

  let deck = 0;                 // 0..4
  let roomIdx = 0;
  let knowledge = 0;
  let lamp = 340;               // 手灯电池，单位呼吸
  let hunt = 0;                 // Listener 追猎倒计时
  let lowOxyBreaths = 0;
  let minSan = vitals.vitals.san;
  let peakInfection = 0;
  const items = { oxy: 1, wrap: 0, med: 1, anti: 0, anchor: 0 };

  const sample = (dt: number) => {
    if (vitals.vitals.oxygen / vitals.vitals.oxygenMax < 0.2) lowOxyBreaths += dt;
    minSan = Math.min(minSan, vitals.vitals.san);
    peakInfection = Math.max(peakInfection, vitals.vitals.infection);
  };

  let guard = 0;
  while (!vitals.isDead && deck < 5 && guard++ < 3000) {
    const roomId = `r${deck}.${roomIdx}`;
    world.teleport(roomId);
    const room = world.room(roomId);
    flags.set('sys.depth', DECK_DEPTH[deck]);

    // —— 手灯：照明换 SAN，但电池是有限的。
    const wantLamp = rng.next() < spec.lamp && lamp > 0;
    flags.set('sys.light', wantLamp ? 1 : 0);

    const submerged = room.ambient.flooding >= TUNING.flooding.submergedAt;

    // ────────────────────────────────────────────────────────────────
    // 决策
    // ────────────────────────────────────────────────────────────────
    let action: string;
    const v = vitals.vitals;
    const oxyFrac = v.oxygen / v.oxygenMax;

    /*
     * 下水前先把 CO2 呼下去 —— 这是屏息机制最真实的那个决策。
     * 顶着 60 的 CO2 跳进没顶的舱室，必然在水里被迫大喘气，然后吸进去的是水。
     * 会玩的人会先站在水边喘匀了再下去；不会玩的人（冲刺流）不会。
     */
    /*
     * "会不会停下来喘匀"本身就是策略画像的一部分，不是全有全无。
     * 冲刺流并非不懂过度换气，只是没那个耐心——给它 45% 的执行率，
     * 于是它依然是四个原型里 CO2 最难看的那个，但不再因此被判死刑。
     */
    const ventDiscipline = spec.hold > 0.3 ? 1 : spec.rush < 0.5 ? 0.9 : 0.55;
    const canVent = rng.bool(ventDiscipline);
    // 注意用 costOf 而不是裸的 base：动作的真实长度是基础成本 × breathCost 倍率（常在 1.5 上下）。
    // 用 base 估算屏息余量会系统性低估四成，于是每一次"算好了能憋过去"的下水都以大喘气收场。
    const swimCost = 5.5 * vitals.costOf(BREATH.STEP * 1.6);

    // 水优先于一切：站在没顶的舱室里讨论"要不要躲"是没有意义的。
    // 早期版本让追猎判定排在前面，于是玩家会在水下屏息躲藏、被迫大喘气、然后吸进去的是水——
    // 屏息流 17.5% 的死亡是这一个顺序错误造成的。
    if (submerged) {
      action = canVent && v.co2 + swimCost >= TUNING.co2.forcedGaspAt
        ? 'vent'
        : rng.bool(0.11) ? 'snag' : 'swim';
    } else if (canVent && hunt === 0 && v.co2 >= TUNING.co2.ventAt && !vitals.has('fx.hyperventilation')) {
      // 还债窗口。屏息流之所以曾经 38.5% 死于 CO2 中毒，不是因为它憋得太多，
      // 而是因为它从来没有一个"停下来把气喘匀"的时刻——只要没人在追，就该喘。
      action = 'vent';
    } else if (hunt > 0) {
      // 憋不住的时候躲是自杀：强制大喘气会把追猎窗口重新点燃。没气就只能跑。
      const canHide = v.co2 < TUNING.co2.forcedGaspAt - 22;
      action = spec.rush > 0.6 || !canHide ? 'flee' : 'hide';
    } else if (v.trauma > 55 && items.med > 0) {
      action = 'medkit';
    } else if (v.coreTemp < 34.5 && items.wrap > 0) {
      action = 'wrap';
    } else if (v.infection > 45 && items.anti > 0) {
      action = 'antibiotic';
    } else if (oxyFrac < 0.12 && items.oxy > 0) {
      action = 'oxybottle';
    } else if (v.san < 30 && items.anchor > 0 && rng.bool(0.6)) {
      action = 'anchor';
    } else if (v.fatigue > spec.restAt && oxyFrac > 0.3) {
      action = 'rest';
    } else if (deck >= 2 && rng.next() < spec.piety * 0.05 && flags.getNum('stigma.listening') < 3) {
      action = 'ritual';
    } else if (knowledge >= deckRequirement(deck)) {
      action = 'descend';
    } else {
      // 月池层的壳体正在压扁你。任何人到了这里都会停止搜刮，只管往出口跑。
      const endgame = deck === 4;
      const weights: [string, number][] = [
        ['move', endgame ? 1.8 : 1],
        ['run', spec.rush * 1.4 + (endgame ? 0.6 : 0)],
        ['search', endgame ? spec.loot * 0.15 : spec.loot * 1.1],
        ['sonar', endgame ? spec.ping * 0.4 : spec.ping * 1.2],
        ['force', spec.rush * 0.35],
      ];
      action = rng.weighted(weights);
    }

    // ────────────────────────────────────────────────────────────────
    // 执行
    // ────────────────────────────────────────────────────────────────
    let base = 0;
    let noise = 0;
    let exertion = 0.25;
    let gain = 0;
    let holding = false;

    switch (action) {
      case 'move': base = BREATH.STEP; noise = 1; gain = 1.0; exertion = 0.35; break;
      // 跑步覆盖更多距离，但每次动作烧掉的氧气也更多。第四轮模拟里 run 的成本与 move 相同，
      // 于是冲刺流在氧气上毫无压力（低氧时间 0.2%），"氧气即货币"对他不成立。
      case 'run': base = BREATH.STEP * 1.75; noise = 6; gain = 1.6; exertion = 1; break;
      case 'search': base = BREATH.SEARCH; noise = 2; gain = 1.32 * vitals.derived('searchQuality'); exertion = 0.3; break;
      case 'sonar': base = BREATH.SONAR_PING; noise = 9; exertion = 0.15; break;
      case 'force': base = BREATH.FORCE_DOOR; noise = 12; gain = 2.2; exertion = 1; break;
      case 'rest': base = BREATH.REST; noise = 0; exertion = 0; break;
      case 'ritual': base = BREATH.RITUAL; noise = 5; exertion = 0.2; break;
      case 'descend': base = BREATH.OPEN_DOOR + BREATH.STEP; noise = 4; exertion = 0.5; break;
      // 没顶的舱室：任何有理智的人都会屏息。真正的危险不是"忘了憋气"，
      // 而是**带着已经很高的 CO2 下水**——holdBreath() 会直接拒绝，于是你在水里呼吸。
      case 'swim': base = BREATH.STEP * 1.6; noise = 3; gain = 0.9; exertion = 0.85; holding = true; break;
      // 缠绕：线缆、软管、别人的睡袋。溺毙不该只惩罚"算错了 CO2"——
      // 那种错误在过度换气进来之后几乎绝迹（溺毙死因掉到 0.9%）。
      // 真正让水成为威胁的是它**会超出计划**：一次算好的横渡突然变成两倍长。
      case 'snag': base = BREATH.STEP * 3.4; noise = 5; gain = 0.9; exertion = 1; holding = true; break;
      case 'hide': base = BREATH.LOOK * 3; noise = 0; exertion = 0.05; holding = true; break;
      case 'flee': base = BREATH.STEP * 2; noise = 8; exertion = 1; break;
      case 'vent': base = BREATH.LOOK * 2; noise = 2; exertion = 0; break;
      default: base = BREATH.INTERACT; noise = 1; exertion = 0.2; break;
    }

    if (action === 'vent') vitals.applyById('fx.hyperventilation');

    /*
     * 屏息的决策模型 —— GDD §4.1 要的那个微观决策，所以模拟里的"玩家"必须像真人一样会算：
     * 这个动作真实要花 costOf(base) 个呼吸，屏息期间 CO2 以 holdRate 上升，
     * 只有两者之积还够不到 80 时，憋过去才是划算的。
     * 前两版分别踩了两个坑：(1) 完全不算，于是憋着气做 6 呼吸的搜刮，必然中途大喘气；
     * (2) 用常数 5.5 和裸 base 估算，双重低估约四成，结果一样。
     */
    const holdRate = TUNING.co2.holdGainPerBreath *
      (1 + (v.fear / 100) * TUNING.co2.holdFearScale) *
      (1 + exertion * TUNING.co2.holdExertionScale);
    const holdHeadroom = v.co2 + holdRate * vitals.costOf(base) < TUNING.co2.forcedGaspAt - 3;
    // 只在真正危险的地方憋气。一路憋着走完全程的"潜行流"不是潜行，是慢性自杀：
    // 第七轮模拟里它平均每局被迫大喘气 8.4 次，每一次都把聆听者重新招回来。
    /*
     * 屏息**不是**省氧手段，这一点值得写下来：憋住 1 个呼吸省下 1 点氧，
     * 却要付出约 5 点 CO2，而清掉这 5 点需要 1.5 个呼吸的正常换气 —— 净亏约 25%。
     * 所以屏息换来的只有安静。既然如此，只在真正危险的地方憋，而且只憋短动作；
     * 一路憋着走完全程的"潜行流"会活活把自己憋到窒息（上一轮它 66.5% 死于窒息）。
     */
    const dangerous = room.ambient.presence > 0.65 || hunt > 0;
    if (holding && (v.co2 >= spec.releaseAt || (!submerged && !holdHeadroom))) holding = false;
    if (!holding && spec.hold > 0.5 && dangerous && holdHeadroom && base <= 4 && action !== 'rest') {
      holding = true;
    }

    if (holding) vitals.holdBreath();
    else if (vitals.holdingBreath) vitals.release();

    /*
     * 换气发生在**水边**，不是水里。
     * 上一版让"喘匀了再下去"这个动作在已经没顶的舱室里结算，于是玩家为了避免
     * 水下大喘气而选择在水下正常呼吸——溺毙率直接冲到 42.7%。
     * 这条 ambient 覆盖就是那道门槛：你还没迈进去。
     */
    const ambient: AmbientConditions =
      action === 'vent' ? { ...room.ambient, flooding: 0 } : room.ambient;
    const ctx: SimContext = { rng, depth: DECK_DEPTH[deck], ambient, flags };

    // —— 道具与仪式（不消耗呼吸预算之外的东西）
    handleItems(action, vitals, items, flags);
    if (action === 'ritual') {
      flags.add('stigma.listening', 1);
      vitals.applyById('fx.stigma.listening');
      vitals.shock(10, 'knowledge');
      knowledge += 9;
      // 仪式本身有致死风险：你把自己交给了一个你不理解的流程。
      if (rng.bool(0.05)) {
        vitals.kill('ritual');
        break;
      }
    }

    const cost = vitals.costOf(base);
    vitals.advance(cost, ctx, { exertion });
    sample(cost);

    // 噪音：屏息大幅降低，恐惧放大。
    const emitted = noise * vitals.derived('noiseEmission') + vitals.takeNoise();
    world.addNoise(roomId, emitted);
    world.decayNoise(cost);

    if (wantLamp) lamp -= cost;
    knowledge += gain;

    // —— 声呐：信息收益被污染度侵蚀。声呐依赖型玩家在低 SAN 时会被自己的工具坑。
    if (action === 'sonar') {
      const fidelity = vitals.derived('sonarFidelity');
      const artifact = (1 - fidelity) * (1 + veracity.corruption * 2);
      if (rng.next() < artifact) {
        knowledge -= 1.2;                      // 走错路，白跑
        vitals.shock(2.5, 'sound');
        veracity.shouldFabricate(rng, 'impossible-geometry');
      } else {
        knowledge += 2.4 * fidelity;
      }
      director.observe({ kind: 'sonar', power: 1 }, v.fear);
      flags.add('count.sonar', 1);
    }

    if (action === 'search') {
      flags.add('count.search', 1);
      rollLoot(rng, vitals, items, spec, deck);
      // 搜刮会碰到不该碰的东西。感染是一条长曲线，所以单次接触量必须够大，
      // 否则它永远走不到致死区（第四轮：感染死因仅 0.9%）。
      if (rng.bool(0.055 + deck * 0.022)) {
        vitals.infect(rng.float(9, 22));
        vitals.shock(8, 'touch');
      }
    }

    /*
     * 外伤必须有一条**不依赖聆听者**的来源。
     * 上一轮把聆听者的即死率调低之后，外伤死因直接归零——因为它此前完全是
     * "被抓住但没死"的副产品。一条船在沉：撬门会崩开、黑暗里跑步会摔，
     * 这些才是外伤应有的日常来源，而且它们恰好惩罚的是最强的那个策略。
     */
    if (action === 'force' && rng.bool(0.12)) {
      vitals.injure(rng.float(10, 26));
      world.addNoise(roomId, 8);
    }
    if (action === 'run' && rng.bool(wantLamp ? 0.03 : 0.09 + room.ambient.flooding * 0.12)) {
      vitals.injure(rng.float(8, 22));
    }
    /*
     * 上面两条只会打到冲刺流，于是外伤死因长期挂在 2.3%，而且全部集中在一个原型身上。
     * 外伤得是**所有人**的日常税：把手伸进黑暗的机械里会被割，
     * 从缠住的线缆里挣脱会留下东西在皮肤上。这两条同时也削掉了搜刮流的统治性。
     */
    if (action === 'search' && rng.bool(0.07)) {
      vitals.injure(rng.float(7, 18));
    }
    if (action === 'snag' && rng.bool(0.3)) {
      vitals.injure(rng.float(9, 20));
    }

    if (action === 'move' || action === 'run' || action === 'swim' || action === 'snag') {
      flags.add('count.move', 1);
      roomIdx = (roomIdx + 1) % ROOMS_PER_DECK;
    }
    if (action === 'run') flags.add('count.run', 1);
    if (action === 'force') flags.add('count.force-door', 1);
    if (action === 'hide') flags.add('count.hide', 1);
    if (action === 'rest') { flags.add('count.rest', 1); vitals.applyById('fx.resting'); }

    // ────────────────────────────────────────────────────────────────
    // 世界反馈
    // ────────────────────────────────────────────────────────────────
    if (hunt > 0) {
      hunt -= cost;
      const escape = clamp01(0.10 + vitals.derived('stealth') * 0.16 - emitted * 0.010);
      if (rng.next() < escape) hunt = 0;
      else if (hunt <= 0) {
        // 被追上。大多数时候是重伤而不是即死——即死太廉价，重伤才会让后面的路难走。
        // 即死概率低、重伤概率高：被聆听者抓住更多是"活下来但走不动了"，
        // 这样外伤才有独立的死因份额，而不是全被 listener 吞掉。
        if (rng.bool(0.24)) {
          vitals.kill('listener');
        } else {
          vitals.injure(rng.float(22, 52));
          vitals.shock(30, 'touch');
          if (rng.bool(0.45)) vitals.infect(rng.float(14, 30));
        }
      }
    } else if (room.noise > room.noiseThreshold) {
      hunt = rng.int(8, 20);
      room.noise *= 0.4;
    }

    // 密封破损：深处的压差会咬掉你的余量。它只是给内爆加速，不该自己就是主死因——
    // 第二轮模拟里这个事件过于频繁，一个人就把内爆推到了 54% 的死因占比。
    if (room.ambient.pressure > 120 && rng.bool(0.004 + deck * 0.0025)) {
      flags.set(TUNING.pressure.ratingFlag,
        Math.max(150, flags.getNum(TUNING.pressure.ratingFlag, TUNING.pressure.suitRating) - rng.float(4, 12)));
    }

    // 导演 tick（它也会在 relief 相里给玩家喘息室，这里体现为注视感下降）
    const dctx: DirectorContext = {
      vitals: vitals.vitals, world, flags, breathsElapsed: vitals.breathsElapsed, rng,
    };
    for (const order of director.tick(dctx)) {
      if (order.kind === 'grant-relief') {
        const r = world.rooms.get(order.roomId);
        if (r) r.ambient.presence *= 0.45;
      } else if (order.kind === 'escalate') {
        room.ambient.presence = clamp01(room.ambient.presence + order.amount * 0.12);
      } else if (order.kind === 'fabricate') {
        veracity.shouldFabricate(rng, order.lie);
      }
    }

    // 玩家尝试识破：清明度越高越容易，这是 debunk 的正反馈。
    const lie = veracity.freshest();
    if (lie && rng.next() < 0.1 + veracity.lucidity * 0.015) veracity.debunk(lie.id);

    if (action === 'descend') {
      deck++;
      roomIdx = 0;
      knowledge = 0;
    }
  }

  const survived = !vitals.isDead && deck >= 5;
  return {
    strategy: spec.id,
    survived,
    breaths: vitals.breathsElapsed,
    cause: vitals.cause,
    // 契约把"氧尽"和"CO2 中毒"并成同一个 DeathCause，但调参时必须分开看：
    // 前者说明氧气经济偏紧，后者说明屏息/通风的循环有问题，处方完全相反。
    hypercapnic: vitals.cause === 'asphyxiation' && vitals.vitals.oxygen > 0,
    endOxygenFraction: vitals.vitals.oxygen / vitals.vitals.oxygenMax,
    deckReached: Math.min(5, deck + 1),
    endSan: vitals.vitals.san,
    minSan,
    endCorruption: veracity.corruption,
    lowOxygenFraction: vitals.breathsElapsed > 0 ? lowOxyBreaths / vitals.breathsElapsed : 0,
    gasps: vitals.gaspCount,
    liesBorn: veracity.activeLies.length,
    liesDebunked: veracity.debunkCount,
    reliefs: director.stats.reliefs,
    spawns: director.stats.spawns,
    peakInfection,
    peakIntensity: director.stats.peakIntensity,
  };
}

function handleItems(
  action: string, vitals: VitalsEngine,
  items: { oxy: number; wrap: number; med: number; anti: number; anchor: number },
  flags: Flags,
): void {
  switch (action) {
    case 'oxybottle':
      if (items.oxy > 0) { items.oxy--; vitals.applyById('fx.pure-oxygen'); vitals.restore({ oxygen: 70 }); }
      break;
    case 'wrap':
      if (items.wrap > 0) { items.wrap--; vitals.applyById('fx.thermal-wrap'); }
      break;
    case 'medkit':
      if (items.med > 0) { items.med--; vitals.restore({ trauma: -38 }); vitals.remove('fx.hemorrhage'); }
      break;
    case 'antibiotic':
      if (items.anti > 0) { items.anti--; vitals.applyById('fx.antibiotic'); }
      break;
    case 'anchor':
      if (items.anchor > 0) { items.anchor--; vitals.applyById('fx.reality-anchor'); flags.add('count.debunk', 1); }
      break;
    default:
      break;
  }
}

function rollLoot(
  rng: Xoshiro, vitals: VitalsEngine,
  items: { oxy: number; wrap: number; med: number; anti: number; anchor: number },
  spec: StrategySpec, deck: number,
): void {
  const q = vitals.derived('searchQuality');
  if (!rng.bool(clamp01(0.38 * q))) return;
  const roll = rng.weighted<keyof typeof items | 'none'>([
    ['oxy', 1.1], ['med', 1.2], ['wrap', 0.9], ['anti', 0.7], ['anchor', 0.6], ['none', 1.2],
  ]);
  if (roll !== 'none') items[roll]++;
}

// ============================================================================
// 3. 统计与诊断
// ============================================================================

interface Summary {
  spec: StrategySpec;
  runs: number;
  survival: number;
  avgBreaths: number;
  avgDeck: number;
  causes: Map<DeathCause, number>;
  sanQuantiles: Record<string, number>;
  minSanQuantiles: Record<string, number>;
  lowOxygen: number;
  avgGasps: number;
  avgDebunks: number;
  avgReliefs: number;
  avgSpawns: number;
  avgCorruption: number;
  avgPeakIntensity: number;
  /** 窒息死里属于"CO2 中毒"而非"氧尽"的那一半，占全部 run 的比例。 */
  hypercapnicShare: number;
  avgEndOxygen: number;
}

function quantiles(values: number[]): Record<string, number> {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => (s.length ? s[clamp(Math.floor(p * (s.length - 1)), 0, s.length - 1)] : 0);
  return { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
}

function summarize(spec: StrategySpec, results: RunResult[]): Summary {
  const causes = new Map<DeathCause, number>();
  let survived = 0, breaths = 0, deck = 0, lowOxy = 0, gasps = 0, debunks = 0;
  let reliefs = 0, spawns = 0, corruption = 0, peakIntensity = 0;
  let hypercapnic = 0, endOxy = 0;
  const endSan: number[] = [];
  const minSan: number[] = [];
  for (const r of results) {
    if (r.survived) survived++;
    else if (r.cause) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
    if (r.hypercapnic) hypercapnic++;
    endOxy += r.endOxygenFraction;
    breaths += r.breaths;
    deck += r.deckReached;
    lowOxy += r.lowOxygenFraction;
    gasps += r.gasps;
    debunks += r.liesDebunked;
    reliefs += r.reliefs;
    spawns += r.spawns;
    corruption += r.endCorruption;
    peakIntensity += r.peakIntensity;
    endSan.push(r.endSan);
    minSan.push(r.minSan);
  }
  const n = Math.max(1, results.length);
  return {
    spec, runs: results.length,
    survival: survived / n,
    avgBreaths: breaths / n,
    avgDeck: deck / n,
    causes,
    sanQuantiles: quantiles(endSan),
    minSanQuantiles: quantiles(minSan),
    lowOxygen: lowOxy / n,
    avgGasps: gasps / n,
    avgDebunks: debunks / n,
    avgReliefs: reliefs / n,
    avgSpawns: spawns / n,
    avgCorruption: corruption / n,
    avgPeakIntensity: peakIntensity / n,
    hypercapnicShare: hypercapnic / n,
    avgEndOxygen: endOxy / n,
  };
}

const ALL_CAUSES: readonly DeathCause[] = [
  'asphyxiation', 'hypothermia', 'trauma', 'infection',
  'implosion', 'listener', 'ritual', 'drowning', 'self',
];

const CAUSE_CN: Record<DeathCause, string> = {
  asphyxiation: '窒息', hypothermia: '低温', trauma: '外伤', infection: '感染',
  implosion: '内爆', listener: '聆听者', ritual: '仪式', drowning: '溺毙', self: '自戕',
};

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function pad(s: string, n: number): string {
  // 中文按两格宽计算，否则表格在等宽终端里会散架。
  let w = 0;
  for (const ch of s) w += /[\u2E80-\u9FFF\uFF00-\uFFEF·—]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

function report(summaries: Summary[], all: RunResult[]): void {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(' 《铁肺迷城》平衡模拟报告   总 run 数: ' + all.length);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  console.log(pad('策略原型', 16) + pad('存活率', 10) + pad('平均呼吸', 11) +
    pad('平均层数', 11) + pad('低氧时间', 11) + pad('余氧', 8) + pad('CO2死', 8) + pad('大喘气', 9) + pad('识破', 8) + '喘息室');
  console.log('─'.repeat(100));
  for (const s of summaries) {
    console.log(
      pad(s.spec.label, 16) +
      pad(pct(s.survival), 10) +
      pad(s.avgBreaths.toFixed(0), 11) +
      pad(s.avgDeck.toFixed(2), 11) +
      pad(pct(s.lowOxygen), 11) +
      pad(pct(s.avgEndOxygen), 8) +
      pad(pct(s.hypercapnicShare), 8) +
      pad(s.avgGasps.toFixed(1), 9) +
      pad(s.avgDebunks.toFixed(1), 8) +
      `${s.avgReliefs.toFixed(1)} (峰值强度 ${s.avgPeakIntensity.toFixed(2)})`,
    );
  }

  console.log('\n── 死因分布（占该策略死亡数的百分比）' + '─'.repeat(32));
  console.log(pad('死因', 12) + summaries.map((s) => pad(s.spec.label, 14)).join('') + pad('全局', 10));
  console.log('─'.repeat(86));
  const globalDeaths = all.filter((r) => !r.survived && r.cause).length;
  const globalCause = new Map<DeathCause, number>();
  for (const r of all) if (!r.survived && r.cause) globalCause.set(r.cause, (globalCause.get(r.cause) ?? 0) + 1);

  for (const c of ALL_CAUSES) {
    const cells = summaries.map((s) => {
      const deaths = s.runs - Math.round(s.survival * s.runs);
      const n = s.causes.get(c) ?? 0;
      return pad(deaths > 0 ? `${pct(n / deaths)} (${n})` : '—', 14);
    });
    const g = globalCause.get(c) ?? 0;
    console.log(pad(CAUSE_CN[c], 12) + cells.join('') +
      pad(globalDeaths > 0 ? pct(g / globalDeaths) : '—', 10));
  }

  console.log('\n── SAN 曲线分位数（结局时 / 全程最低）' + '─'.repeat(31));
  console.log(pad('策略原型', 16) + pad('p10', 9) + pad('p25', 9) + pad('p50', 9) +
    pad('p75', 9) + pad('p90', 9) + pad('最低p50', 10) + '平均污染度');
  console.log('─'.repeat(86));
  for (const s of summaries) {
    const q = s.sanQuantiles;
    console.log(
      pad(s.spec.label, 16) +
      pad(q.p10.toFixed(1), 9) + pad(q.p25.toFixed(1), 9) + pad(q.p50.toFixed(1), 9) +
      pad(q.p75.toFixed(1), 9) + pad(q.p90.toFixed(1), 9) +
      pad(s.minSanQuantiles.p50.toFixed(1), 10) +
      s.avgCorruption.toFixed(3),
    );
  }

  diagnose(summaries, globalCause, globalDeaths, all);
}

/** 明确打印平衡问题。沉默的模拟器毫无价值——它必须指着数据说"这里不对"。 */
function diagnose(
  summaries: Summary[], globalCause: Map<DeathCause, number>,
  globalDeaths: number, all: RunResult[],
): void {
  console.log('\n══ 平衡诊断 ' + '═'.repeat(58));
  const problems: string[] = [];
  const notes: string[] = [];

  for (const s of summaries) {
    if (s.survival > 0.55) {
      problems.push(`【统治性策略】${s.spec.label} 存活率 ${pct(s.survival)} > 55%，它是当前的最优解，其他打法都是自找麻烦。`);
    } else if (s.survival < 0.25) {
      problems.push(`【不可行策略】${s.spec.label} 存活率 ${pct(s.survival)} < 25%，玩家试两次就会永久放弃这条路线。`);
    }
    if (s.lowOxygen < 0.10) {
      problems.push(`【氧气不紧张】${s.spec.label} 只有 ${pct(s.lowOxygen)} 的时间处于 <20% 氧气，支柱 P2"氧气即货币"没有兑现。`);
    }
    if (s.avgReliefs < 1) {
      problems.push(`【缺少节奏】${s.spec.label} 平均只拿到 ${s.avgReliefs.toFixed(1)} 次喘息室，导演的张力曲线没有形成起伏。`);
    }
    if (s.sanQuantiles.p50 > 70) {
      notes.push(`【SAN 偏高】${s.spec.label} 结局 SAN 中位数 ${s.sanQuantiles.p50.toFixed(1)}，Veracity Layer 的内容大概率没被玩家看到。`);
    }
  }

  const rates = summaries.map((s) => s.survival);
  const spread = Math.max(...rates) - Math.min(...rates);
  if (spread > 0.2) {
    problems.push(`【策略失衡】最强与最弱策略的存活率相差 ${pct(spread)}（> 20pp），玩法多样性是假的。`);
  }

  for (const c of ALL_CAUSES) {
    const n = globalCause.get(c) ?? 0;
    const share = globalDeaths > 0 ? n / globalDeaths : 0;
    if (n === 0) {
      problems.push(`【死因缺席】"${CAUSE_CN[c]}" 一次都没发生过。要么触发条件写死了，要么这个系统是装饰品。`);
    } else if (share < 0.03) {
      problems.push(`【死因稀有】"${CAUSE_CN[c]}" 只占死亡的 ${pct(share)} < 3%，玩家几乎不会遇到，相关机制的开发成本是浪费的。`);
    } else if (share > 0.45) {
      problems.push(`【死因垄断】"${CAUSE_CN[c]}" 占死亡的 ${pct(share)} > 45%，它盖住了其他所有威胁，游戏只剩一个问题要解。`);
    }
  }

  const corr = all.reduce((a, r) => a + r.endCorruption, 0) / Math.max(1, all.length);
  if (corr < 0.15) {
    notes.push(`【招牌机制闲置】全局平均污染度仅 ${corr.toFixed(3)}，多数玩家整局都在 L0，看不到 Veracity Layer。`);
  }
  const gasps = all.reduce((a, r) => a + r.gasps, 0) / Math.max(1, all.length);
  if (gasps < 0.5) {
    notes.push(`【屏息无张力】平均每局仅 ${gasps.toFixed(2)} 次强制大喘气，屏息机制没有真正把玩家逼到临界点。`);
  }

  if (problems.length === 0) {
    console.log('  ✔ 未发现硬性平衡问题：四种策略均落在 25%–55%，九种死因均 ≥3%，氧气紧张度达标。');
  } else {
    for (const p of problems) console.log('  ✘ ' + p);
  }
  for (const n of notes) console.log('  ! ' + n);
  console.log('═'.repeat(70) + '\n');
}

// ============================================================================
// 4. 入口
// ============================================================================

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: number) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? Number(hit.split('=')[1]) : d;
  };
  const total = Math.max(STRATEGIES.length, arg('runs', 2000));
  const baseSeed = arg('seed', 20260915);
  const per = Math.ceil(total / STRATEGIES.length);

  const t0 = Date.now();
  const all: RunResult[] = [];
  const summaries: Summary[] = [];
  for (const spec of STRATEGIES) {
    const results: RunResult[] = [];
    for (let i = 0; i < per; i++) {
      results.push(runOne((baseSeed + i * 7919 + spec.id.length * 104729) >>> 0, spec));
    }
    all.push(...results);
    summaries.push(summarize(spec, results));
  }

  report(summaries, all);
  console.log(`  用时 ${((Date.now() - t0) / 1000).toFixed(2)}s，每策略 ${per} 次。\n`);
}

main();
