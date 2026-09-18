import type { Rng } from '@/core/contract';
import type { TrialTrace } from '../variants';
import { clamp, clamp01 } from '@/core/util';

/**
 * 盲测用的精简玩法模型 —— 一台对照实验台。
 *
 * 两个变体跑在完全相同的世界、威胁与资源曲线上，唯一差异是被测机制本身。
 * 被测变体不得改动这里的任何逻辑，否则结论不可比。
 *
 * 一个关键的结构决定：**一回合只做一个动作**。
 * 感知与移动竞争同一份氧气，这才是 GDD §P2"氧气即时间即货币"的真实形态；
 * 如果允许每回合先扫描再移动，感知就变成免费的，整个取舍就消失了。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 第二次重建（依据 qa/ab/sonar-verdict.md 附录的五条结构缺陷）
 * ───────────────────────────────────────────────────────────────────────────
 * 上一台实验机被它自己的数据证伪了：八项指标有五项在两个变体上几乎相同，
 * 因为它只能比较"价格" `(breaths, noise, radius, fidelity)`，不能比较"形态"。
 * 这一版做了六处结构性改造：
 *
 *   1. **噪音是空间量，不是标量**。噪音留在它被制造的那个房间里，40% 溢出到
 *      相邻房间（GDD §4.3 已写、旧模型未实现），衰减从 -0.8 降到 -0.35，
 *      并加上呼吸底噪。走路不再降噪，于是"看即是发声"这个命题第一次成立。
 *   2. **信念是区间，不是数字**。真值**永远**落在区间内，宽度由保真度决定
 *      且对玩家可见。系统不再给出与真值无法区分的假话 ——
 *      撒谎的职责交还给 src/sim/veracity.ts 的 Veracity Layer（GDD P3「且可被识破」）。
 *   3. **归因看具体误判，不看行动占比**。旧口径"声呐用得越多越可归因"在奖励坏设计。
 *      现在每一次可指认的误判都进 trace.mistakes 台账，超时死亡也能归因。
 *   4. **休息棘轮方向修正**。低氧不再让喘息变贵，反而让它变值 —— 稳定呼吸省氧。
 *   5. **感知选项有形态参数**：僵直拍数 / 主瓣方向 / 返回区间宽度；
 *      决策上下文有掩蔽窗口相位与在途回波。
 *   6. **噪音场之上长出三件工具**：定向诱敌、照射致聋、屏息听氧气嘶声。
 */

// ---------------------------------------------------------------------------
// 实验台改造开关
// ---------------------------------------------------------------------------

/**
 * 判定书附录列出的每条改造对应一个开关。
 *
 * 它们存在的唯一理由是**消融测量**：要回答"这一项改造在指标上位移了多少"，
 * 就必须能把它单独关掉再跑一遍。关掉时复现的是旧实验台的行为。
 * 正式盲测一律在全开状态下跑（见 tools/blind-ab.ts 的 --ablate）。
 */
export const BENCH = {
  /** 提案 1：噪音经济学（衰减 -0.35、呼吸底噪、40% 相邻溢出、噪音留在房间里） */
  noiseEconomy: true,
  /** 提案 2：区间信念取代"与真值无法区分的假数字" */
  intervalBelief: true,
  /** 提案 3：三角验证（两个不同位置的脉冲取交集才收敛） */
  triangulate: true,
  /** 提案 4：周期性掩蔽窗口 */
  maskWindow: true,
  /** 提案 5：屏息 / 强制大喘气 / 靠听觉找氧气 */
  holdBreath: true,
  /** 附录 2、3：归因按"可指认的具体误判"判定，超时死亡也可归因 */
  attribution: true,
  /** §5.3：休息棘轮方向修正 */
  restFix: true,
};

/** 恢复全开状态。消融测量跑完必须调用，否则后续试验跑在被阉割的台子上。 */
export function resetBench(): void {
  BENCH.noiseEconomy = true;
  BENCH.intervalBelief = true;
  BENCH.triangulate = true;
  BENCH.maskWindow = true;
  BENCH.holdBreath = true;
  BENCH.attribution = true;
  BENCH.restFix = true;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MOVE_BREATHS = 2;
const REST_BREATHS = 6;
/** 休息时的氧耗折扣：稳定呼吸本身就是省氧（§5.3 的修正之一） */
const REST_EFFICIENCY = 0.6;
const MOVE_NOISE = 1.2;

/** 噪音衰减。旧值 -0.8 把走路和被动感知的净噪音吃成负数（判定书 §5.5） */
const NOISE_DECAY = 0.35;
const NOISE_DECAY_LEGACY = 0.8;
/** 相邻房间噪音溢出比例。GDD §4.3「水中传播」 */
const NOISE_SPILL = 0.4;
/** 呼吸底噪（每呼吸）。玩家活着这件事本身就在发声 */
const BREATH_FLOOR = 0.3;
/** 掩蔽窗口内的噪音折扣（提案 4） */
export const MASK_FACTOR = 0.3;
/**
 * 召唤听者的**房间**噪音阈值。
 *
 * 旧模型的 22 是给一个挂在玩家身上的标量定的。改成噪音场之后，
 * 同一个房间会同时收到"自己制造的"与"邻室溢出的"两份，累积快得多，
 * 22 会让一记大喘气（25）当场召唤听者 —— 实测平均存活掉到 57 呼吸。
 * 55 对齐 GDD §4.3 的噪音表：尖叫（60）一次过线，大喘气（25）要连着两次。
 */
export const SUMMON_THRESHOLD = 55;

/** 屏息的缺氧上限，到顶强制大喘气 */
export const HYPOXIA_LIMIT = 6;
/** 大喘气的噪音。GDD §4.3 噪音表已有这一条 */
const GASP_NOISE = 25;
const GASP_BREATHS = 4;

/** 照射听者致聋的时长与最低功率（7.3） */
const DEAF_BREATHS = 15;
const BLIND_NOISE_MIN = 20;

/** 一局的时间上限（呼吸）。超时 = 'lost'，也是可归因的死亡 */
const TIME_LIMIT = 1100;

// ---------------------------------------------------------------------------
// 世界
// ---------------------------------------------------------------------------

export interface SimWorld {
  size: number;
  adj: number[][];
  exit: number;
  /** 每个房间的真实危险度 0..1 */
  danger: number[];
  /** 每个房间藏着的氧气量（呼吸数）。有了它，劣势才可能被翻盘 */
  oxygenCache: number[];
  /** 到出口的真实跳数，用于评估玩家决策质量（玩家本人看不到） */
  distToExit: number[];
  /**
   * 掩蔽窗口（提案 4）：压载泵启停 / 船体应力呻吟 / 教团的钟。
   * 周期对每个船体是**固定的**，所以它可以被被动聆听推断出来、可以跨轮回记忆 ——
   * 这是本模型里唯一一条"可以用一句话说出来"的玩家知识。
   */
  maskPeriod: number;
  /** 窗口持续的呼吸数 */
  maskDuration: number;
  /** 窗口的相位偏移 */
  maskOffset: number;
}

/**
 * 建一张船体图。
 *
 * 规模从 40 提到 56：判定书第三节指出旧模型的 `reach` 被"3 跳内未知房间数"钳死，
 * 半径超过 3–4 就没有收益。但反过来，在 40 个房间的图上一记半径 7 的脉冲
 * 能照到全船的四分之一，于是它又变成"一次买下整张地图"。
 * 56 个房间让半径这根轴第一次有了真实的量程，也让氧气重新成为稀缺资源
 *（实测存活率从 84% 回到 50% 上下）。
 */
export function buildWorld(rng: Rng, size = 68): SimWorld {
  const adj: number[][] = Array.from({ length: size }, () => []);
  // 脊柱保证连通，弦制造回路 —— 接近真实关卡拓扑
  for (let i = 1; i < size; i++) {
    const parent = rng.int(Math.max(0, i - 4), i - 1);
    adj[i].push(parent);
    adj[parent].push(i);
  }
  /*
   * 弦（回路）从 0.3×size 降到 0.13×size。
   *
   * 0.3 让 56 个房间的图退化成一张小世界网络：任意两点都在 6 跳之内，
   * 于是"半径"这根轴没有量程，而且玩家怎么走都很快撞上出口 ——
   * 实测存活率 86%，技巧表达在天花板上被压死。
   * 潜艇的真实拓扑是一条脊柱加少量回路，不是社交网络。
   */
  for (let i = 0; i < Math.floor(size * 0.13); i++) {
    const a = rng.int(0, size - 1);
    const b = rng.int(0, size - 1);
    if (a !== b && !adj[a].includes(b)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }
  const exit = size - 1;
  const danger = Array.from({ length: size }, (_, i) =>
    i === 0 ? 0 : clamp01(rng.float(0, 0.75) * (0.35 + (i / size) * 0.9)),
  );
  // 氧气与危险正相关：值钱的东西放在要命的地方，否则搜刮就没有决策可言
  const oxygenCache = Array.from({ length: size }, (_, i) =>
    i === 0 || !rng.bool(0.34) ? 0 : Math.round(40 + danger[i] * 190 * rng.float(0.6, 1.4)),
  );
  // 掩蔽窗口的抽取放在最后，这样拓扑、危险度、氧气分布与上一版逐个字节相同
  const maskPeriod = rng.int(22, 30);
  const maskDuration = rng.int(4, 6);
  const maskOffset = rng.int(0, maskPeriod - 1);
  return {
    size,
    adj,
    exit,
    danger,
    oxygenCache,
    distToExit: bfsDistances(adj, exit),
    maskPeriod,
    maskDuration,
    maskOffset,
  };
}

function bfsDistances(adj: number[][], from: number): number[] {
  const d = Array(adj.length).fill(Infinity);
  d[from] = 0;
  const q = [from];
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    for (const n of adj[cur]) {
      if (d[n] === Infinity) {
        d[n] = d[cur] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

/** 当前处于掩蔽周期内的第几个呼吸 */
export function maskPhaseOf(w: SimWorld, elapsed: number): number {
  const ph = (elapsed - w.maskOffset) % w.maskPeriod;
  return ph < 0 ? ph + w.maskPeriod : ph;
}

/** 掩蔽窗口此刻是否开着。开着时一切玩家噪音 ×0.3 */
export function maskOpen(w: SimWorld, elapsed: number): boolean {
  return BENCH.maskWindow && maskPhaseOf(w, elapsed) < w.maskDuration;
}

/** 距下一次窗口开启还有几个呼吸；正开着时返回 0 */
export function breathsToMaskOpen(w: SimWorld, elapsed: number): number {
  if (!BENCH.maskWindow) return -1;
  const ph = maskPhaseOf(w, elapsed);
  if (ph < w.maskDuration) return 0;
  return w.maskPeriod - ph;
}

// ---------------------------------------------------------------------------
// 信念：区间，不是数字（提案 2）
// ---------------------------------------------------------------------------

/**
 * 对一个房间危险度的信念。
 *
 * **真值永远落在 [lo, hi] 内**，区间宽度就是玩家看到的不确定度
 *（UI 上是回声的"硬 / 软 / 乱"三态加一圈光晕）。
 * 旧模型在保真度掷骰失败时写入一个与真值长得一模一样的假数字，
 * 于是玩家死了也无法回答"我哪步错了" —— 那是 0.155 可归因分的直接成因。
 */
export interface Belief {
  lo: number;
  hi: number;
  /** 照射过它的观测点。三角验证要求**视差**：同位置重复照射不产生收敛 */
  origins: number[];
  /** 已被两个不同位置的脉冲交集收敛到真值 */
  verified: boolean;
}

export const beliefMid = (b: Belief): number => (b.lo + b.hi) / 2;
export const beliefWidth = (b: Belief): number => b.hi - b.lo;

// ---------------------------------------------------------------------------
// 玩家
// ---------------------------------------------------------------------------

export interface SimPlayer {
  at: number;
  oxygen: number;
  oxygenMax: number;
  fear: number;
  /** 对每个房间危险度的区间信念，null = 从未感知过 */
  belief: (Belief | null)[];
  /** 已确认出口位置 */
  knowsExit: boolean;
  /**
   * 每个房间的噪音累计（GDD §4.3）。噪音是**空间量** ——
   * 它留在被制造的那个房间里，并向相邻房间溢出 40%。
   * 这一条是定向诱敌成为可能的前提：你可以把声音扔到别处去。
   */
  noiseField: number[];
  /** = noiseField[at]，供威胁模型与效用函数直接读取 */
  noise: number;
  /** 追击者位置，-1 = 尚未被召唤 */
  hunter: number;
  /** 追击者对玩家位置的置信度 0..1 */
  hunterAwareness: number;
  /** 追击者**以为**你在哪。定向 ping 就是在篡改这个数字 */
  hunterTarget: number;
  /** 追击者失聪剩余呼吸（7.3：照射致聋） */
  hunterDeaf: number;
  /** 失聪结束后要不要把置信度拉满 —— 致聋的代价 */
  hunterBacklash: boolean;
  /** 屏息累计的缺氧点数，到 HYPOXIA_LIMIT 强制大喘气 */
  hypoxia: number;
  /**
   * 外伤。GDD §4.1 的 `breathCost` 乘数里有 `1 + trauma/150` 这一项，旧模型没实现 ——
   * 于是灾害房间只是一次性扣氧，踩过就没事了。
   * 有了它，"走错一个房间"会在后面几百个呼吸里一直收租，
   * 而"知道哪里危险"这件事才真正值钱 —— 声呐的价值链因此才闭合。
   */
  trauma: number;
  /** 已听到嘶声的氧气缓存。没听到过的缓存走进去也拿不到（提案 5） */
  heardCache: Set<number>;
  /** 每个房间被踏进过几次。回头路是氧气的第一杀手，所以它必须在决策里可见 */
  visits: number[];
  /** 在途回波。非 null = 正处在僵直期，不能移动 */
  pending: PendingEcho | null;
  /**
   * 每个舱室「已确认为空」的有效期（按呼吸计）。0 = 从未被排除过。
   *
   * 否定信息也是信息：一记回波什么都没带回来，说的是"这一片眼下没有值得去的东西"。
   * 但它必须真的改写导航判断（见 frontierValue / moveUtility），否则"排除法"
   * 只是一句安慰话 —— 玩家照样为一个零收益的动作付了噪音。
   * 带时效是因为船在动：排除过的扇区过一阵子重新变回未知。
   */
  clearedUntil: number[];
  /** 威胁模型的私有状态。不同威胁模型往这里存自己的东西 */
  threatState: Record<string, number>;
}

/**
 * 在途回波（方案丙的第②拍）。
 *
 * 发声的瞬间噪音已经全额付掉，但信息一点没到手。回波按距离分批返回：
 * 第 r 跳的回声在第 r 个呼吸到达，而你必须站着不动才听得清。
 * 中途放弃是允许的 —— 已付的噪音是沉没成本，外圈的信息永久作废。
 */
export interface PendingEcho {
  /** 发声点。回波的圈是以它为中心的，不是以玩家当前位置 */
  origin: number;
  /** 总圈数 = 半径 */
  rings: number;
  /** 已解算的圈数 */
  ringsDone: number;
  fidelity: number;
  /** 返回区间的基础宽度 */
  confidence: number;
  /** 主瓣方向（相邻房间 id），-1 = 全向 */
  direction: number;
  /** 已付出的噪音，沉没成本 */
  paidNoise: number;
  /** 起手那一档的 id，用于统计 */
  optionId: string;
  /**
   * 上一拍时局面的"指纹"（威胁读数档 + 缺氧点数）。
   *
   * 僵直期每一拍都在问同一个问题："我还敢站多久。"
   * 只有当局面**确实变了**（扰动近了一档、缺氧又攒了一点、或者这是最后一圈），
   * 这一拍才是一个新的决策；否则它是同一个决策被重问一遍，
   * 不该计进决策密度 —— 那正是判定书 7.5 警告的"等读条"。
   */
  lastSignature: number;
}

export function newPlayer(world: SimWorld): SimPlayer {
  return {
    at: 0,
    oxygen: 900,
    oxygenMax: 900,
    fear: 0,
    belief: Array(world.size).fill(null),
    knowsExit: false,
    noiseField: Array(world.size).fill(0),
    noise: 0,
    hunter: -1,
    hunterAwareness: 0,
    hunterTarget: -1,
    hunterDeaf: 0,
    hunterBacklash: false,
    hypoxia: 0,
    trauma: 0,
    heardCache: new Set(),
    visits: Array(world.size).fill(0),
    pending: null,
    clearedUntil: Array(world.size).fill(0),
    threatState: {},
  };
}

// ---------------------------------------------------------------------------
// 噪音场
// ---------------------------------------------------------------------------

/**
 * 在 `at` 制造噪音。
 *
 * 掩蔽窗口内打 0.3 折；40% 溢出到相邻房间（水中传播）。
 * 注意噪音落在 `at`，而不是玩家身上 —— 定向 ping 正是靠这一条把听者引向别处。
 */
export function emitNoise(
  p: SimPlayer,
  w: SimWorld,
  at: number,
  amount: number,
  masked: boolean,
): number {
  if (amount <= 0) return 0;
  const eff = amount * (masked ? MASK_FACTOR : 1);
  p.noiseField[at] += eff;
  if (BENCH.noiseEconomy) {
    for (const n of w.adj[at]) p.noiseField[n] += eff * NOISE_SPILL;
  }
  p.noise = p.noiseField[p.at];
  return eff;
}

/** 全场衰减。旧值 0.8/呼吸 让 93% 的行动净降噪，招牌威胁因此变成自愿召唤的 */
export function decayNoise(p: SimPlayer, breaths: number): void {
  const k = (BENCH.noiseEconomy ? NOISE_DECAY : NOISE_DECAY_LEGACY) * breaths;
  for (let i = 0; i < p.noiseField.length; i++) {
    p.noiseField[i] = Math.max(0, p.noiseField[i] - k);
  }
  p.noise = p.noiseField[p.at];
}

/**
 * 信念老化 —— GDD §6.3「非欧重织」与核心循环里那句"地图重织"的机制形态。
 *
 * 船在动：水位在涨，舱壁在重排，东西会挪位置。一个 40 个呼吸之前的读数
 * 不该和刚拿到的读数一样硬。所以每个未亲眼确认的区间都会**慢慢变宽**，
 * 已验证的区间会失去"已验证"的标记。
 *
 * 这一条同时修掉一个纯粹的实验台毛病：没有老化的话，一记半径 7 的脉冲
 * 在 40 房间的图上等于一次性买下整张地图，声呐随后就再也没有用处 ——
 * 实测感知行动占比会掉到 3.9%，低于报告自己定的"机制可有可无"线。
 * 信息会过期，声呐才是一件反复使用的工具，而不是一次性消费品。
 */
function ageBeliefs(p: SimPlayer, breaths: number): void {
  const grow = 0.0011 * breaths;
  for (let i = 0; i < p.belief.length; i++) {
    const b = p.belief[i];
    if (!b || i === p.at) continue;
    b.lo = Math.max(0, b.lo - grow);
    b.hi = Math.min(1, b.hi + grow);
    if (b.verified && b.hi - b.lo > 0.1) b.verified = false;
  }
}

/** 全场最响的房间 —— 听者朝这里走，而不是朝玩家走 */
function loudestRoom(p: SimPlayer): { room: number; level: number } {
  let room = p.at;
  let level = -1;
  for (let i = 0; i < p.noiseField.length; i++) {
    if (p.noiseField[i] > level) {
      level = p.noiseField[i];
      room = i;
    }
  }
  return { room, level };
}

// ---------------------------------------------------------------------------
// 威胁模型
// ---------------------------------------------------------------------------

/**
 * 威胁模型 —— 第二个可被盲测替换的轴。
 * 它决定"外面的东西如何逼近你"，以及玩家能读到多少预兆。
 */
export interface ThreatModel {
  id: string;
  /** 推进一回合 */
  tick(p: SimPlayer, w: SimWorld, spent: number, skill: number, rng: Rng): ThreatTick;
  /**
   * 玩家此刻能读出的"它离我多近" 0..1。
   * 返回 -1 表示玩家完全无从判断 —— 这会直接摧毁失败可归因性。
   */
  readable(p: SimPlayer, w: SimWorld): number;
}

export interface ThreatTick {
  killed: boolean;
  /** 本回合是否产生了玩家可感知的预警（用于计意外率） */
  warned: boolean;
  /** 死亡是否可被玩家复盘归因 */
  attributable: boolean;
  /** 对张力的贡献 0..1 */
  pressure: number;
}

/** 追击者按累积的呼吸数迈步，速度与玩家相当。旧代码 floor(spent/4) 让它几乎从不移动 */
function advanceHunter(p: SimPlayer, w: SimWorld, spent: number, rng: Rng, chase: boolean): void {
  // 2.9 > 移动的 2 呼吸：它比你慢一点，所以"跑"是一条真实的活路
  const acc = (p.threatState.stepAcc ?? 0) + spent;
  let steps = Math.floor(acc / 2.9);
  p.threatState.stepAcc = acc - steps * 2.9;
  while (steps-- > 0) {
    const target = p.hunterTarget >= 0 ? p.hunterTarget : p.at;
    p.hunter =
      chase && rng.next() < p.hunterAwareness
        ? stepToward(w, p.hunter, target)
        : rng.pick(w.adj[p.hunter]);
  }
}

// ---------------------------------------------------------------------------
// 威胁模型 A：阈值召唤（GDD §4.3 的原始设计）
// ---------------------------------------------------------------------------

/**
 * 噪音累计过线 → 它被召唤 → 开始搜索你。
 * 在被召唤之前，玩家得不到任何关于"我还剩多少余量"的反馈，
 * 这是它的结构性弱点。
 */
export const thresholdThreat: ThreatModel = {
  id: 'threat-threshold',
  tick(p, w, spent, skill, rng) {
    let warned = false;
    if (p.hunter < 0) {
      const loud = loudestRoom(p);
      if (loud.level > SUMMON_THRESHOLD) {
        p.hunter = farthestFrom(w, loud.room);
        p.hunterTarget = loud.room;
        p.hunterAwareness = 0.4;
        warned = true;
      }
      return { killed: false, warned, attributable: false, pressure: 0 };
    }

    p.hunterAwareness = clamp01(p.hunterAwareness + p.noise * 0.012 - 0.03 * spent);
    p.hunterTarget = p.at;
    advanceHunter(p, w, spent, rng, true);

    if (p.hunter === p.at) {
      p.fear = Math.min(100, p.fear + 34);
      if (rng.next() > 0.55 + skill * 0.38) {
        // 是否可归因取决于玩家当时是否有理由知道自己在冒险
        return { killed: true, warned: true, attributable: p.noise > 18, pressure: 1 };
      }
      p.hunter = rng.pick(w.adj[p.at]);
      p.hunterAwareness *= 0.5;
      return { killed: false, warned: true, attributable: false, pressure: 1 };
    }
    return {
      killed: false,
      warned: false,
      attributable: false,
      pressure: 0.18 * p.hunterAwareness + 0.1,
    };
  },
  readable(p, w) {
    // 召唤之前完全读不到；召唤之后也只在它很近时才有感觉
    if (p.hunter < 0) return -1;
    const d = hops(w, p.hunter, p.at);
    return d <= 2 ? clamp01(1 - d / 3) : -1;
  },
};

// ---------------------------------------------------------------------------
// 威胁模型 B：连续逼近
// ---------------------------------------------------------------------------

/**
 * 没有"召唤"这个离散事件。噪音持续喂养一个 presence 值，
 * presence 决定它与你的距离，而这个距离**始终对玩家可读**
 *（船体传来的声音方位、管道里的震动强度）。
 *
 * 赌注：把威胁从"突然出现的开关"变成"一直在收紧的绳子"，
 * 应该同时提升失败可归因性（你一直看得见它在逼近）与张力曲线质量
 *（有连续的松紧，而不是平静与死亡的二值跳变）。
 */
export const gradientThreat: ThreatModel = {
  id: 'threat-gradient',
  tick(p, w, spent, skill, rng) {
    const prev = p.threatState.presence ?? 0;
    // 噪音喂养，静默偿还；偿还比喂养慢，所以噪音债是会累积的
    const presence = clamp01(prev + p.noise * 0.0042 * spent - 0.0065 * spent);
    p.threatState.presence = presence;

    // presence 直接映射成它与玩家的跳数距离
    const wantDist = Math.max(0, Math.round((1 - presence) * 7));
    if (p.hunter < 0) {
      p.hunter = farthestFrom(w, p.at);
    }
    const curDist = hops(w, p.hunter, p.at);
    if (curDist > wantDist) {
      for (let s = 0; s < Math.max(1, Math.floor(spent / 3)); s++) {
        p.hunter = stepToward(w, p.hunter, p.at);
        if (hops(w, p.hunter, p.at) <= wantDist) break;
      }
    } else if (curDist < wantDist && rng.bool(0.5)) {
      p.hunter = rng.pick(w.adj[p.hunter]);
    }
    p.hunterAwareness = presence;

    // 只有"它更近了"才值得报警。每次档位变动都响会把预警变成背景噪音，
    // 玩家很快就学会无视它 —— 那样可读性就名存实亡了。
    const warned = Math.floor(presence * 7) > Math.floor(prev * 7);

    if (hops(w, p.hunter, p.at) === 0) {
      p.fear = Math.min(100, p.fear + 34);
      if (rng.next() > 0.5 + skill * 0.42) {
        // presence 一路可读，所以走到这一步的死亡**总是**可归因
        return { killed: true, warned: true, attributable: true, pressure: 1 };
      }
      p.threatState.presence = presence * 0.55;
      p.hunter = rng.pick(w.adj[p.at]);
      return { killed: false, warned: true, attributable: false, pressure: 1 };
    }
    return { killed: false, warned, attributable: false, pressure: presence };
  },
  readable(p) {
    return p.threatState.presence ?? 0;
  },
};

// ---------------------------------------------------------------------------
// 威胁模型 C：阈值召唤 + 扰动痕迹（第三轮用）
// ---------------------------------------------------------------------------

/**
 * GDD §4.3 写的那一版，而不是旧模型里那个被砍掉一半的版本：
 *
 *  - 召唤由**房间**噪音过线触发，而不是玩家身上的一个标量 → 定向诱敌有意义。
 *  - 它朝"最响的房间"走，而不是朝玩家走 → 你可以把它引开。
 *  - 它沿途留下**可被声呐探测到的扰动**，所以玩家在被召唤之后一直有粗略读数，
 *    僵直期内（耳朵贴在回波上）读得更远。GDD 承诺的"8–20 个呼吸的窗口"因此成立。
 *
 * 旧模型的 `readable()` 在它 3 跳以外一律返回 -1，玩家读不到的威胁躲不开，
 * 死亡也永远说不清是谁的错 —— 这是低可归因与低技巧表达的共同来源之一。
 */
export const disturbanceThreat: ThreatModel = {
  id: 'threat-disturbance',
  tick(p, w, spent, skill, rng) {
    if (p.hunterDeaf > 0) {
      p.hunterDeaf = Math.max(0, p.hunterDeaf - spent);
      if (p.hunterDeaf === 0 && p.hunterBacklash) {
        // 照射致聋的代价：它聋过之后，对你位置的置信度直接拉满
        p.hunterBacklash = false;
        p.hunterAwareness = 1;
        p.hunterTarget = p.at;
      }
    }

    const loud = loudestRoom(p);
    let warned = false;

    if (p.hunter < 0) {
      if (loud.level > SUMMON_THRESHOLD) {
        p.hunter = farthestFrom(w, loud.room);
        p.hunterTarget = loud.room;
        p.hunterAwareness = 0.4;
        warned = true;
      } else {
        return { killed: false, warned: false, attributable: false, pressure: 0 };
      }
    }

    if (p.hunterDeaf > 0) {
      // 聋着的时候它只能乱走，这 15 口气是花钱买来的绝对安全
      advanceHunter(p, w, spent, rng, false);
    } else {
      // 它追的是**声音**，不是你。噪音在哪，它就往哪去
      if (loud.level > 3) p.hunterTarget = loud.room;
      else if (p.hunterTarget < 0) p.hunterTarget = p.at;
      const onTarget = p.hunterTarget === p.at;
      p.hunterAwareness = clamp01(
        p.hunterAwareness + (onTarget ? p.noise * 0.014 : -0.02 * spent) - 0.022 * spent,
      );
      advanceHunter(p, w, spent, rng, true);
    }

    if (p.hunter === p.at) {
      p.fear = Math.min(100, p.fear + 34);
      // 撞上不等于死。擦身而过之后它会失去线索 —— 否则被召唤一次就等于判死刑，
      // 恢复余地必然是 0（判定书 §5.4）
      if (rng.next() > 0.58 + skill * 0.38) {
        return { killed: true, warned: true, attributable: true, pressure: 1 };
      }
      p.hunter = rng.pick(w.adj[p.at]);
      p.hunterAwareness *= 0.45;
      p.hunterTarget = -1;
      return { killed: false, warned: true, attributable: false, pressure: 1 };
    }

    const d = hops(w, p.hunter, p.at);
    const closing = d < (p.threatState.lastDist ?? 99);
    p.threatState.lastDist = d;
    /*
     * 压迫感有惯性。
     *
     * `d` 是跳数 —— 一个每拍 ±1 随机游走的整数。直接把它喂给张力曲线，
     * 得到的是一条每呼吸抖一次的锯齿；而 `computeTensionShape` 的理想反转次数
     * 按采样点数算，于是"一拍一决策"的形态凭空被判成两倍的抖动。
     * 那是量纲错误：恐惧是连续量，而跳数是离散量。
     * 所以这里按**时间常数约 4.5 呼吸**做一次低通 ——
     * 它对一次真正的逼近（连续几拍都在缩短）几乎无损，只吃掉高频的来回。
     */
    const raw = clamp01(
      0.12 + (1 - Math.min(1, d / 6)) * 0.75 * (0.4 + p.hunterAwareness * 0.6),
    );
    const prev = p.threatState.dread ?? raw;
    const dread = prev + (raw - prev) * (1 - Math.exp(-0.22 * Math.max(1, spent)));
    p.threatState.dread = dread;
    return {
      killed: false,
      warned: warned || (closing && d <= 3),
      attributable: false,
      pressure: dread,
    };
  },
  readable(p, w) {
    if (p.hunter < 0) return 0;
    if (p.hunterDeaf > 0) return 0.05;
    const d = hops(w, p.hunter, p.at);
    // 僵直期把耳朵按在回波上，扰动读得更远 —— 这正是"敢听几拍"成为决策的原因
    const range = p.pending ? 5 : 3;
    return d <= range ? clamp01(1 - d / (range + 1)) : 0.12;
  },
};

// ---------------------------------------------------------------------------
// 感知选项：从"价格"扩展到"形态"（附录 1）
// ---------------------------------------------------------------------------

/**
 * 旧版只有 `(breaths, noise, radius, fidelity)` 四个参数，
 * 所以那台实验机在结构上**只能比价格、不能比形态** ——
 * 这就是上一轮八项指标有五项几乎相同的根因。
 */
export interface SenseOption {
  id: string;
  /** 起手（发声）本身要花的呼吸。三拍声呐这里是 1，僵直另算 */
  breaths: number;
  noise: number;
  radius: number;
  fidelity: number;
  /**
   * 僵直拍数：发声之后必须保持静止的呼吸数。
   * 0 = 即时返回（旧形态）；>0 = 噪音先付、信息后到，中途可弃。
   */
  commitTurns: number;
  /** 主瓣方向（相邻房间 id）。-1 = 全向。定向时噪音落在那一头，但背后仍然是黑的 */
  direction: number;
  /** 返回区间的附加宽度 0..1。0 = 只受保真度影响；越大越"软" */
  confidence: number;
}

/** 补全形态参数的默认值，让只关心价格的老变体不必逐个写 */
export function senseOption(o: Partial<SenseOption> & { id: string }): SenseOption {
  return {
    breaths: 2,
    noise: 0,
    radius: 1,
    fidelity: 0.35,
    commitTurns: 0,
    direction: -1,
    confidence: 0,
    ...o,
  };
}

/** 行动目录项。报告只渲染 attrs，不渲染 id —— 语义化命名本身就泄露形态 */
export interface ActionSpec {
  id: string;
  /** 'mode' = 一次感知的起手档位；'beat' = 起手之后的附属拍 */
  kind: 'mode' | 'beat';
  attrs: Record<string, string>;
}

/**
 * 一拍僵直的结算单。
 *
 * 实验台不知道这一拍的名字叫什么、玩家拿它换了什么 —— 那是被测机制的事。
 * 它只需要知道账怎么记：花了多少时间、耗不耗氧、屏没屏息、发不发底噪。
 * 回波本身（解算哪一圈、改不改指向、要不要提前收摊）由机制直接改 `p.pending`，
 * 这样实验台不必为任何一个具体方案长出专属字段。
 */
export interface BeatResult {
  /** 记进决策台账的行动 id。以 `sonar:` 开头才会被算进感知时间 */
  id: string;
  /** 这一拍真实互斥的选项数，进决策密度 */
  options: number;
  /** 这一拍花掉的时间（呼吸） */
  time: number;
  /** 这一拍的氧耗基数（未乘恐惧倍率） */
  oxyBreaths: number;
  /** 屏息：不排 CO2，按 time 攒缺氧 */
  held: boolean;
  /** 这一拍不产生呼吸底噪（贴住舱壁把呼吸压住） */
  quiet?: boolean;
  /** 这一拍分辨氧气嘶声的额外把握。仅在 held 时生效 */
  hearBonus?: number;
  /** 这一拍能听到多远的嘶声（跳）。仅在 held 时生效 */
  hearRange?: number;
}

/** 让被测机制往公共台账里记一笔。实验台的内部函数不对外开放，只开放这三个动作 */
export interface TrialRecorder {
  mistake(kind: string, note: string): void;
  event(key: string): void;
  surprise(): void;
}

/** 被测机制：它只决定"玩家如何获得信息"，其余一切共享 */
export interface SensingMechanic {
  options(ctx: DecisionContext): SenseOption[];
  /**
   * 即时解算一次感知（`commitTurns === 0` 时才会被调用）。
   * 噪音的产生、僵直期的挂载、致聋判定都由实验台统一处理 ——
   * 变体只负责"信息长什么样"，不许自己改收支。
   */
  apply(opt: SenseOption, ctx: DecisionContext): void;
  /** 该感知行动在当前局面下的主观效用，与移动行动的效用在同一标尺上竞争 */
  utility(opt: SenseOption, ctx: DecisionContext): number;
  /** 行动目录，供报告渲染匿名化的数值属性表 */
  catalog(): ActionSpec[];
  /**
   * 接管一拍僵直。返回 null 或不实现 = 走实验台默认的"继续听 / 屏息听 / 打断"。
   *
   * 承诺窗口是玩家被钉住的那几拍，也是全局张力最高的几拍。它到底是一段读条，
   * 还是全局决策最密的地方，取决于这里给不给玩家真实互斥的选项 ——
   * 这一维必须留给被测机制，实验台不预设答案。
   */
  beat?(ctx: DecisionContext, ec: PendingEcho, rec: TrialRecorder): BeatResult | null;
}

export interface DecisionContext {
  p: SimPlayer;
  w: SimWorld;
  skill: number;
  rng: Rng;
  /** 三跳内从未感知过的房间数 */
  unknownNearby: number;
  /** 三跳内的**信息赤字**：未知房间计 1，已知房间计区间宽度。三角验证的收益来自它 */
  infoDeficit: number;
  /** 氧气余量比例 */
  oxyFrac: number;
  hunterNear: boolean;
  /** 玩家读到的威胁逼近程度 0..1；-1 表示无从判断 */
  threatReadout: number;
  /** 已流逝的呼吸数 */
  elapsed: number;
  /** 掩蔽窗口相位：当前处于周期内的第几个呼吸（提案 4） */
  maskPhase: number;
  /** 窗口此刻是否开着 —— 开着时一切噪音 ×0.3 */
  masked: boolean;
  /**
   * 玩家**以为**还要等几个呼吸窗口才开。
   * 低技巧玩家这个数字几乎是噪音，高技巧玩家（= 记住了这条船的周期）几乎准确。
   * 这是"技巧"在模型里第一次有了玩家可触摸的对应物（判定书 §5.1）。
   */
  maskForecast: number;
  /** 对上面那个预报的自信度 0..1 */
  maskConfidence: number;
  /** 在途回波；null = 自由行动（附录 1 要求的第二个上下文扩展） */
  pendingEcho: PendingEcho | null;
  /** 当前所有邻室里"最没走过的那一扇门"被踏进过几次。回头路的相对基准 */
  minDoorVisits: number;
}

// ---------------------------------------------------------------------------
// 回波解算
// ---------------------------------------------------------------------------

/**
 * 判断房间 n 是否落在以 origin 为中心、朝 direction 的主瓣里。
 * 只允许朝**已知的相邻舱段**发声（7.5 的第三条缓解措施），
 * 所以"在主瓣里"就等于"离那个舱段比离你更近"。
 */
function inLobe(w: SimWorld, origin: number, direction: number, n: number): boolean {
  if (direction < 0) return true;
  if (n === direction) return true;
  return hops(w, direction, n) < hops(w, origin, n);
}

/** 写入一条区间信念，必要时与旧信念做三角验证。返回信息是否真的变新了 */
function writeBelief(
  p: SimPlayer,
  w: SimWorld,
  n: number,
  origin: number,
  width: number,
  rng: Rng,
): boolean {
  const truth = w.danger[n];
  let lo: number;
  let hi: number;

  if (!BENCH.intervalBelief) {
    // 旧行为（判定书 §5.2 判定为"这份设计里最贵的一个错误"）：
    // 保真度掷骰失败时写入一个与真值无法区分的假数字。
    const v = rng.next() < 1 - width ? truth : rng.float(0, 1);
    lo = v;
    hi = v;
  } else {
    // 提案 2：真值**永远**在区间里，宽度由保真度决定并且对玩家可见。
    // 不确定是"我知道这个读数有四成不准，我还是走了"；
    // 不可区分是"我不知道我知不知道"。前者产生恐惧，后者只产生怨恨。
    const half = width / 2;
    const center = truth + rng.float(-half * 0.8, half * 0.8);
    lo = Math.min(center - half, truth);
    hi = Math.max(center + half, truth);
    lo = clamp01(lo);
    hi = clamp01(hi);
  }

  const prev = p.belief[n];
  let verified = prev?.verified ?? false;
  const origins = prev ? prev.origins.slice(-2) : [];

  if (prev && !verified && BENCH.intervalBelief) {
    if (BENCH.triangulate && prev.origins.some((o) => hops(w, o, origin) >= 2)) {
      // 提案 3：两个**不同位置**的脉冲取交集。信息来自视差，不是重复照射。
      // 真值同时在两个区间里，所以交集一定非空。
      const iLo = Math.max(prev.lo, lo);
      const iHi = Math.min(prev.hi, hi);
      if (iLo <= iHi) {
        lo = iLo;
        hi = iHi;
      }
      if (hi - lo < 0.15) {
        lo = truth;
        hi = truth;
        verified = true;
      }
    } else if (hi - lo > prev.hi - prev.lo) {
      // 同一个位置再照一遍不会让区间变宽，但也不会变窄
      lo = prev.lo;
      hi = prev.hi;
    }
  }

  if (!origins.includes(origin)) origins.push(origin);
  const gained = !prev || prev.hi - prev.lo - (hi - lo) > 0.04;
  p.belief[n] = { lo, hi, origins, verified };
  return gained;
}

/**
 * 解算以 origin 为中心、距离**恰好** ring 跳的那一圈。
 * 返回真正获得了新信息的房间数 —— 用来识别"买了个空包"的冗余脉冲。
 */
export function revealRing(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  ring: number,
  fidelity: number,
  confidence: number,
  rng: Rng,
  direction = -1,
): number {
  const localFidelity = clamp01(fidelity * Math.pow(0.9, Math.max(0, ring - 1)));
  const width = clamp01((1 - localFidelity) * 0.8 + confidence);
  let gained = 0;
  for (let n = 0; n < w.size; n++) {
    if (n === origin) continue;
    if (hops(w, origin, n) !== ring) continue;
    if (!inLobe(w, origin, direction, n)) continue;
    if (writeBelief(p, w, n, origin, width, rng)) gained++;
    /*
     * 声呐告诉你的是危险度，不是"这是出口"。
     * 逃生舱口在回波里和任何一个舱段长得一样，认出它是低概率事件 ——
     * 系数 0.32 就是这件事的代价。没有它，一记全功率脉冲就等于送出一张地图：
     * 实测存活率会飙到 87%，平均存活掉到 85 呼吸，氧气从此不再是稀缺资源，
     * 于是窒息、翻盘、张力三项全部失去意义。
     */
    if (n === w.exit && rng.next() < localFidelity * 0.18) p.knowsExit = true;
  }
  return gained;
}

/**
 * 回波的**正面**返回值：主瓣里这一圈的硬目标被分辨出来。
 *
 * 氧气罐在声学上是这条船里最硬的东西之一。回得越清楚，越有可能从混响里把它挑出来。
 * 这一条和 `markSectorClear` 是一枚硬币的两面：只有当"有目标"是一个真实的返回值时，
 * "确认为空"才是一句有内容的话；否则所谓否定信息只是给空手而归换了个说法。
 */
export function revealRingTargets(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  ring: number,
  direction: number,
  chance: number,
  rng: Rng,
): number {
  if (chance <= 0) return 0;
  let heard = 0;
  for (let n = 0; n < w.size; n++) {
    if (n === origin || w.oxygenCache[n] <= 0 || p.heardCache.has(n)) continue;
    if (hops(w, origin, n) !== ring) continue;
    if (!inLobe(w, origin, direction, n)) continue;
    if (rng.next() < chance) {
      p.heardCache.add(n);
      heard++;
    }
  }
  return heard;
}

/**
 * 把一圈（含它外面那一圈）标成「已确认为空」，有效期到 `until`。
 *
 * 一记回波什么都没带回来，在物理上不是"失败"，而是一句真话：这个方向上没有东西。
 * 声音在空水里走得更远，所以否定信息顺带覆盖到还没成像的下一圈 ——
 * 这正是它比"新照出一个房间"更便宜也更宽的地方。
 * 效果落在导航上（frontierValue / moveUtility），不落在信念区间上：
 * 它说的是"那边没有值得去的东西"，不是"那边的危险度是多少"。
 */
export function markSectorClear(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  ring: number,
  direction: number,
  until: number,
): number {
  let marked = 0;
  for (let n = 0; n < w.size; n++) {
    if (n === origin) continue;
    if (hops(w, origin, n) !== ring) continue;
    if (!inLobe(w, origin, direction, n)) continue;
    if (p.clearedUntil[n] < until) {
      p.clearedUntil[n] = until;
      marked++;
    }
    for (const m of w.adj[n]) {
      if (m !== origin && p.clearedUntil[m] < until) {
        p.clearedUntil[m] = until;
        marked++;
      }
    }
  }
  return marked;
}

/** 一次性揭示 radius 跳内的全部圈（即时形态用） */
export function reveal(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  radius: number,
  fidelity: number,
  confidence: number,
  rng: Rng,
  direction = -1,
): number {
  let gained = 0;
  for (let r = 1; r <= radius; r++) {
    gained += revealRing(p, w, origin, r, fidelity, confidence, rng, direction);
  }
  return gained;
}

/**
 * 这一记脉冲能照到的信息赤字总量，**按距离折现**。定向脉冲只算主瓣。
 *
 * 折现系数 0.7/跳 是这台机器里最关键的一个数，因为它决定最优功率：
 *  - 旧版用 `min(unknownNearby, radius × 2.1)`，被 3 跳内的未知房间数钳死，
 *    于是半径超过 3–4 就白给，最优点被钉在最低档（判定书第三节的"废档"证据）。
 *  - 不折现则相反：半径 7 能照到 40 房间图的大半，最优点被钉在最高档
 *    （第一次试跑里 boom 占了起手档位的 96.9%）。
 * 折现才对应真实的信息价值：八跳之外那个房间的危险度，你很可能永远用不上。
 */
export function lobeDeficit(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  radius: number,
  direction: number,
): number {
  let sum = 0;
  for (let n = 0; n < w.size; n++) {
    if (n === origin) continue;
    const d = hops(w, origin, n);
    if (d > radius || d === Infinity) continue;
    if (!inLobe(w, origin, direction, n)) continue;
    const b = p.belief[n];
    const deficit = b ? (b.verified ? 0 : beliefWidth(b)) : 1;
    sum += deficit * Math.pow(0.7, d - 1);
  }
  return sum;
}

/**
 * 三角验证的潜在收益（提案 3）。
 *
 * 只有当旧观测点与这一次的发声点相距 ≥2 跳时，两个区间的交集才有意义 ——
 * 信息来自**视差**，不是重复照射。所以这个函数就是"规划观测点"这件事的数值形态：
 * 站在别的地方再打一发，值多少。
 */
export function parallaxGain(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  radius: number,
  direction: number,
): number {
  if (!BENCH.triangulate) return 0;
  let sum = 0;
  for (let n = 0; n < w.size; n++) {
    if (n === origin) continue;
    const d = hops(w, origin, n);
    if (d > radius || d === Infinity) continue;
    if (!inLobe(w, origin, direction, n)) continue;
    const b = p.belief[n];
    if (!b || b.verified) continue;
    if (!b.origins.some((o) => hops(w, o, origin) >= 2)) continue;
    sum += beliefWidth(b) * Math.pow(0.7, d - 1);
  }
  return sum;
}

/**
 * 7.3 照射听者：高功率 ping 直接命中它会让它短暂失聪，
 * 但此后它对你位置的置信度直接拉满。用未来的必然被追，换眼前 15 口气的绝对安全。
 */
function maybeBlind(
  p: SimPlayer,
  w: SimWorld,
  origin: number,
  radius: number,
  noise: number,
  direction: number,
): boolean {
  if (p.hunter < 0 || noise < BLIND_NOISE_MIN || p.hunterDeaf > 0) return false;
  const d = hops(w, origin, p.hunter);
  if (d > radius || d === Infinity) return false;
  if (!inLobe(w, origin, direction, p.hunter)) return false;
  p.hunterDeaf = DEAF_BREATHS;
  p.hunterBacklash = true;
  return true;
}

/**
 * 屏息时能分辨氧气缓存的低频嘶声（提案 5）。屏得越久越准。
 *
 * `bonus` / `range` 留给"耳朵贴在别的东西上听"的姿势：同样是屏息，
 * 贴着舱壁、且身边正有一圈回波洗过去的时候，嘶声分辨得更清也更远。
 * 默认值就是原来的写死值，不传参数时行为逐位不变。
 */
function listenForCache(
  p: SimPlayer,
  w: SimWorld,
  rng: Rng,
  skill: number,
  bonus = 0,
  range = 4,
): number {
  let best = -1;
  let bestD = 99;
  for (let n = 0; n < w.size; n++) {
    if (w.oxygenCache[n] <= 0 || p.heardCache.has(n)) continue;
    const d = hops(w, p.at, n);
    if (d <= range && d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best < 0) return -1;
  const pHear = clamp01(
    0.22 + p.hypoxia * 0.1 + skill * 0.24 - Math.max(0, bestD - 1) * 0.05 + bonus,
  );
  if (rng.next() >= pHear) return -1;
  p.heardCache.add(best);
  return best;
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

export function runTrial(
  world: SimWorld,
  mech: SensingMechanic,
  rng: Rng,
  skill: number,
  threat: ThreatModel = thresholdThreat,
): TrialTrace {
  const p = newPlayer(world);
  const trace: TrialTrace = {
    decisions: [],
    tension: [],
    surprises: [],
    mistakes: [],
    events: {},
    survived: false,
    duration: 0,
    cause: '',
    hadIdentifiableMistake: false,
    recovered: false,
    wasBehind: false,
  };

  let elapsed = 0;
  let everBehind = false;
  let turns = 0;
  let tension = 0;
  const visits = new Int32Array(world.size);
  let bestDistSeen = world.distToExit[0];
  let lastProgressAt = 0;

  while (p.oxygen > 0 && elapsed < TIME_LIMIT && turns < 900) {
    turns++;
    const masked = maskOpen(world, elapsed);
    const ctx = makeContext(p, world, skill, rng, threat, elapsed, masked);

    /** 本回合花掉的**时间**（呼吸），与氧耗分开 —— 屏息花时间不花氧气 */
    let time = 0;
    /** 本回合的氧耗基数（未乘恐惧倍率） */
    let oxyBreaths = 0;
    let held = false;
    /** 本回合不产生呼吸底噪，但照常耗氧 —— 与屏息是两件事 */
    let quiet = false;
    const rec: TrialRecorder = {
      mistake: (kind, note) => noteMistake(trace, elapsed, kind, note),
      event: (key) => bump(trace, key),
      surprise: () => noteSurprise(trace, elapsed),
    };

    if (p.hypoxia >= HYPOXIA_LIMIT) {
      // ---- 强制大喘气：屏息是玩家自己上弦的定时炸弹 ----
      trace.decisions.push({ options: 1, chosen: 'gasp' });
      bump(trace, 'gasp');
      emitNoise(p, world, p.at, GASP_NOISE, masked);
      p.hypoxia = 0;
      p.fear = clamp(p.fear + 8, 0, 100);
      time = GASP_BREATHS;
      oxyBreaths = GASP_BREATHS;
      noteSurprise(trace, elapsed);
      if (p.hunter >= 0 || p.noise > 10) {
        noteMistake(trace, elapsed, 'gasp-exposed', '屏息屏过了头，在它还在附近时被迫大喘气');
      }
    } else if (p.pending && mech.beat) {
      // ---- 僵直期由被测机制自己接管 ----
      const ec = p.pending;
      const r = mech.beat(ctx, ec, rec);
      if (!r) throw new Error('[model] beat() 必须给出这一拍的结算单');
      trace.decisions.push({ options: r.options, chosen: r.id });
      time = r.time;
      oxyBreaths = r.oxyBreaths;
      held = r.held;
      quiet = r.quiet ?? false;
      if (held) {
        // 缺氧与"屏着的时候能听见氧气嘶声"跟默认路径同样处理，
        // 否则两条路径上的屏息不是同一个动作，变体之间就不可比了
        p.hypoxia += r.time;
        if (listenForCache(p, world, rng, skill, r.hearBonus ?? 0, r.hearRange) >= 0) {
          bump(trace, 'cache-heard');
        }
      }
    } else if (p.pending) {
      // ---- 僵直期（方案丙第②拍）：只能继续听、屏息听、或打断 ----
      const ec = p.pending;
      /*
       * 一圈回波等多久，取决于那一圈有多远。
       *
       * 声音往返一趟的时间跟距离成正比 —— 第四圈的回声本来就该比第一圈晚到。
       * 之前每圈一律 1 呼吸，于是"发声—僵直—解算"整个循环只有 4-6 呼吸，
       * 比舒适带的 12 呼吸快一倍：张力曲线的反转次数因此是理想值的 1.8 倍，
       * 决策密度也被顶到 60/百呼吸。那不是节奏太碎，那是**这台声呐算得太快**。
       * 按距离拉开之后，越往外听越是一次真正的赌注：
       * 你得为一圈外缘信息在原地不动两三口气。
       */
      const beat = 1 + ec.ringsDone * 0.5;
      const canHold = BENCH.holdBreath && p.hypoxia + beat <= HYPOXIA_LIMIT;
      /*
       * 判定书 7.5 的第一条风险："僵直期可能在实际操作中变成等读条。"
       * 这里如实登记：一拍只有在局面确实变了、或者它是最后一圈时才算新决策，
       * 否则它是同一个问题被重问一遍。这样决策密度这一项就自动变成了
       * 对"僵直期到底空不空"的度量，而不是对"拍数多不多"的度量。
       */
      const sig = Math.floor(Math.max(0, ctx.threatReadout) * 4) * 16 + Math.floor(p.hypoxia);
      const live = sig !== ec.lastSignature || ec.ringsDone + 1 >= ec.rings;
      ec.lastSignature = sig;
      const opts = live ? (canHold ? 3 : 2) : 1;
      const uListen = commitListenUtility(ctx, ec, false);
      const uHold = canHold ? commitListenUtility(ctx, ec, true) : -Infinity;
      const uAbort = commitAbortUtility(ctx, ec);

      if (uAbort > uListen && uAbort > uHold) {
        // 中途放弃：已付的噪音是沉没成本，外圈信息永久作废
        trace.decisions.push({ options: opts, chosen: 'sonar:echo-abort' });
        bump(trace, 'echo-aborted');
        /*
         * 打断本身**不是**失误 —— 听到扰动逼近就该跑，那正是方案丙要的判断。
         * 算失误的是"付了大钱却几乎什么都没听到"：一半都没听完就跑，
         * 说明这一记根本不该在这个时候发。这句话玩家能指着说出来。
         */
        if (ec.paidNoise >= 8 && ec.ringsDone <= Math.floor(ec.rings / 2)) {
          noteMistake(
            trace,
            elapsed,
            'aborted-ping',
            `第 ${ec.ringsDone + 1} 拍就拔腿跑，${ec.paidNoise.toFixed(0)} 点噪音白付，外 ${ec.rings - ec.ringsDone} 圈作废`,
          );
        }
        p.pending = null;
        time = 1;
        oxyBreaths = 1;
      } else {
        held = uHold > uListen;
        trace.decisions.push({ options: opts, chosen: held ? 'sonar:echo-hold' : 'sonar:echo-listen' });
        ec.ringsDone++;
        const gained = revealRing(
          p,
          world,
          ec.origin,
          ec.ringsDone,
          ec.fidelity + (held ? 0.2 : 0),
          Math.max(0, ec.confidence - (held ? 0.12 : 0)),
          rng,
          ec.direction,
        );
        if (gained === 0 && ec.ringsDone === ec.rings) {
          noteMistake(trace, elapsed, 'empty-echo', '整趟僵直听完，外圈一个新房间都没照到');
        }
        time = beat;
        oxyBreaths = held ? 0 : beat;
        if (held) {
          p.hypoxia += beat;
          if (listenForCache(p, world, rng, skill) >= 0) bump(trace, 'cache-heard');
        }
        if (ec.ringsDone >= ec.rings) {
          bump(trace, 'echo-completed');
          p.pending = null;
        }
      }
    } else {
      // ---- 自由回合：感知 / 移动 / 休息 / 屏息 争夺同一份氧气 ----
      const senseOpts = mech.options(ctx);
      const neighbors = world.adj[p.at];
      const canHold = BENCH.holdBreath && p.hypoxia + 1 <= HYPOXIA_LIMIT;
      const totalOptions = senseOpts.length + neighbors.length + 1 + (canHold ? 1 : 0);

      let bestKind: 'sense' | 'move' | 'rest' | 'hold' = 'rest';
      let bestUtil = restUtility(ctx);
      let bestSense: SenseOption | null = null;
      let bestMove = p.at;

      if (canHold) {
        const u = holdUtility(ctx);
        if (u > bestUtil) {
          bestUtil = u;
          bestKind = 'hold';
        }
      }
      for (const o of senseOpts) {
        const u = mech.utility(o, ctx);
        if (u > bestUtil) {
          bestUtil = u;
          bestKind = 'sense';
          bestSense = o;
        }
      }
      for (const n of neighbors) {
        const u = moveUtility(n, ctx);
        if (u > bestUtil) {
          bestUtil = u;
          bestKind = 'move';
          bestMove = n;
        }
      }

      if (bestKind === 'sense' && bestSense) {
        const o = bestSense;
        trace.decisions.push({ options: totalOptions, chosen: o.id });
        // ① 发声：噪音**立即**全额产生，落点在主瓣那一头。先付钱，后拿货。
        const depot = o.direction >= 0 ? o.direction : p.at;
        const paid = emitNoise(p, world, depot, o.noise, masked);
        bump(trace, 'ping');
        if (o.noise >= 12) bump(trace, masked ? 'loud-in-window' : 'loud-outside-window');
        if (o.direction >= 0) bump(trace, 'directed-ping');
        if (maybeBlind(p, world, p.at, o.radius, o.noise, o.direction)) bump(trace, 'listener-blinded');
        if (o.commitTurns > 0) {
          p.pending = {
            origin: p.at,
            rings: o.commitTurns,
            ringsDone: 0,
            fidelity: o.fidelity,
            confidence: o.confidence,
            direction: o.direction,
            paidNoise: paid,
            optionId: o.id,
            lastSignature: -1,
          };
        } else {
          const gained = reveal(p, world, p.at, o.radius, o.fidelity, o.confidence, rng, o.direction);
          if (gained <= 1 && o.breaths >= 3) {
            noteMistake(trace, elapsed, 'redundant-ping', `花了 ${o.breaths} 口气照出不到两个新房间`);
          }
        }
        if (
          o.noise >= 12 &&
          !masked &&
          ctx.maskConfidence > 0.35 &&
          p.noiseField[depot] > SUMMON_THRESHOLD * 0.6
        ) {
          /*
           * 玩家本来知道这条船的周期，却没等窗口，而这一记把房间推到了召唤线附近。
           * 判据里那两个附加条件很重要：不是"每一次窗口外的响脉冲"都算失误，
           * 只有**确实把自己推到线上**的那一次才算。否则这条归因会退化成
           * "用得越多分越高"，也就是旧口径被判定书点名的那个毛病。
           */
          noteMistake(
            trace,
            elapsed,
            'missed-window',
            `没等掩蔽窗口就放了一记 ${o.noise.toFixed(0)} 噪音的脉冲，房间噪音推到 ${p.noiseField[depot].toFixed(0)}`,
          );
        }
        time = o.breaths;
        oxyBreaths = o.breaths;
      } else if (bestKind === 'move') {
        trace.decisions.push({
          options: totalOptions,
          chosen: `move:${classifyMove(p, world, bestMove)}`,
        });
        const b = p.belief[bestMove];
        const actual = world.danger[bestMove];
        // 区间信念之下，"踩雷"只有两种成因，两种都是玩家可以指认的下注：
        //   ① 我在一个宽到没意义的区间上赌了它的好一半；
        //   ② 我压根没照，直接走进黑暗。
        if (b && !b.verified && beliefWidth(b) > 0.28 && actual > 0.45) {
          noteMistake(
            trace,
            elapsed,
            'wide-interval-bet',
            `踩进一个区间 [${b.lo.toFixed(2)},${b.hi.toFixed(2)}] 宽 ${beliefWidth(b).toFixed(2)} 的房间`,
          );
          noteSurprise(trace, elapsed);
        } else if (!b && actual > 0.55) {
          noteMistake(trace, elapsed, 'blind-step', '没照就走进了黑暗，里面是危险房间');
          noteSurprise(trace, elapsed);
        }
        if (BENCH.noiseEconomy) {
          emitNoise(p, world, bestMove, MOVE_NOISE, masked);
        } else {
          // 旧行为：噪音是挂在玩家身上的标量，走到哪跟到哪
          const carried = p.noiseField[p.at];
          p.noiseField[p.at] = 0;
          p.noiseField[bestMove] += carried + MOVE_NOISE;
        }
        p.at = bestMove;
        p.noise = p.noiseField[p.at];
        // 亲身到场总是得到真值，而且它是"已验证"的
        p.belief[p.at] = { lo: actual, hi: actual, origins: [p.at], verified: true };
        p.visits[p.at]++;
        visits[p.at]++;
        if (p.at === world.exit) p.knowsExit = true;
        if (world.distToExit[p.at] < bestDistSeen) {
          bestDistSeen = world.distToExit[p.at];
          lastProgressAt = elapsed;
        }
        time = MOVE_BREATHS;
        oxyBreaths = MOVE_BREATHS;
        p.fear = clamp(p.fear + actual * 14 - 1, 0, 100);

        // 危险房间真的会伤人。没有这一条，"知道哪里危险"就不值钱，声呐也就没有意义
        if (rng.next() < actual * 0.16) {
          const hazard = 55 + actual * 120;
          p.oxygen -= hazard;
          p.trauma += 10 + actual * 26;
          p.fear = clamp(p.fear + 22, 0, 100);
          emitNoise(p, world, p.at, 7, masked);
          noteSurprise(trace, elapsed);
          if (rng.next() < actual * 0.09) {
            trace.cause = 'trauma';
            p.oxygen = -1;
          }
        }

        // 搜到氧气 —— 劣势翻盘的来源。提案 5：只有**听到过嘶声**的缓存才拿得到
        if (world.oxygenCache[p.at] > 0) {
          if (!BENCH.holdBreath || p.heardCache.has(p.at)) {
            p.oxygen = Math.min(p.oxygenMax, p.oxygen + world.oxygenCache[p.at]);
            world.oxygenCache[p.at] = 0;
            p.heardCache.delete(p.at);
            bump(trace, 'cache-taken');
          } else {
            bump(trace, 'cache-walked-past');
          }
        }
      } else if (bestKind === 'hold') {
        // 屏息：不耗氧、不产噪音，但每拍攒 1 点缺氧。等窗口、听嘶声、躲过去都靠它
        trace.decisions.push({ options: totalOptions, chosen: 'hold' });
        held = true;
        bump(trace, 'hold');
        if (ctx.masked) bump(trace, 'hold-in-window');
        p.hypoxia += 1;
        if (listenForCache(p, world, rng, skill) >= 0) bump(trace, 'cache-heard');
        time = 1;
        oxyBreaths = 0;
      } else {
        trace.decisions.push({ options: totalOptions, chosen: 'rest' });
        time = REST_BREATHS;
        // §5.3：稳定呼吸省氧。旧模型让最需要喘息的时刻喘息最贵，方向反了
        oxyBreaths = REST_BREATHS * (BENCH.restFix ? REST_EFFICIENCY : 1);
        p.fear = clamp(p.fear - 16, 0, 100);
        p.noiseField[p.at] = Math.max(0, p.noiseField[p.at] - 4);
      }
    }

    /*
     * 这一条行动花掉了多少呼吸。
     *
     * 这是上一轮那个量纲错误的根：一次三拍承诺在台账里摊成八条，一次即时解算只有一条，
     * 于是任何"按条数算的占比"在两种形态之间都不守恒 —— 它把"移动占了 24% 的时间"
     * 报成"移动占了 6% 的行动"，而这个数字看上去和其它客观数据一模一样。
     * 记下每一条的时间，报告才能在两把尺子上同时给数，读的人也才看得见自己在用哪一把。
     */
    const acted = trace.decisions[trace.decisions.length - 1];
    if (acted) acted.spent = time;

    if (trace.cause === 'trauma') {
      elapsed += time;
      break;
    }

    /*
     * 感知到底占了这一局多大份量 —— 按**呼吸**记，不按行动条数记。
     *
     * 行动条数这把尺子在两种形态之间是坏的：
     * 把一次感知拆成八拍的方案，感知占比会凭空变成 72%；
     * 只数"起手"又会把同一个方案压到 12%，因为它的起手只占整个循环的一拍。
     * 时间是唯一的公共单位 —— 玩家的一局就是一串呼吸，问的是其中几口花在了听上。
     */
    const chosen = trace.decisions[trace.decisions.length - 1]?.chosen ?? '';
    if (chosen.startsWith('sonar:')) {
      trace.events['sense-breaths'] = (trace.events['sense-breaths'] ?? 0) + time;
    }

    // ---- 世界反应 ----
    // GDD §4.1 的呼吸成本乘数：恐惧 ×1.2、CO2 ×0.6、外伤 /150。
    // 旧模型只实现了恐惧那一项，于是屏息没有后果、受伤没有后果
    p.oxygen -=
      oxyBreaths *
      (1 + (p.fear / 100) * 1.2 + (p.hypoxia / HYPOXIA_LIMIT) * 0.6 + p.trauma / 150);
    elapsed += time;
    decayNoise(p, time);
    if (!held && !quiet && BENCH.noiseEconomy) {
      // 呼吸底噪：玩家活着这件事本身就在发声
      emitNoise(p, world, p.at, BREATH_FLOOR * time * (1 + p.fear / 100), masked);
    }
    p.fear = clamp(p.fear - 0.25 * time, 0, 100);
    /*
     * CO2 排得比攒得慢得多：一口气的换气清不掉一整拍的屏息。
     * 这个数还有一层量纲上的意义 —— 0.34 会让"屏一拍、听一拍"的交替
     * 在张力曲线上留下一串幅度 0.017 的锯齿，刚好压过 0.012 的判定死区，
     * 于是一次屏息被算成七次"起伏"。那是采样假象，不是节奏。
     */
    if (!held) p.hypoxia = Math.max(0, p.hypoxia - 0.2 * time);
    ageBeliefs(p, time);

    const tick = threat.tick(p, world, time, skill, rng);
    if (tick.warned) noteSurprise(trace, elapsed);
    if (tick.killed) {
      trace.cause = 'listener';
      if (p.pending) {
        noteMistake(
          trace,
          elapsed,
          'commit-overstay',
          `僵直到第 ${p.pending.ringsDone} 拍还没跑，它走进了这个房间`,
        );
      }
      if (p.noise > 10) {
        noteMistake(trace, elapsed, 'noise-exposed', `在噪音 ${p.noise.toFixed(0)} 的房间里被抓到`);
      }
      break;
    }

    const oxyFrac = p.oxygen / p.oxygenMax;
    if (oxyFrac < 0.22) everBehind = true;
    if (everBehind && oxyFrac > 0.45) trace.recovered = true;

    // 兜圈子：同一片舱段来回踩，而出口方向的最好成绩长时间没有推进
    if (visits[p.at] >= 3 && elapsed - lastProgressAt > 70) {
      noteMistake(trace, elapsed, 'revisit-loop', `在同一片舱段绕了 ${(elapsed - lastProgressAt) | 0} 口气`);
      lastProgressAt = elapsed - 40;
    }

    /*
     * 张力。
     *
     * 旧公式里 `(1 - oxyFrac) * 0.3` 是一条只升不降的斜坡，它构成张力的地板，
     * 于是曲线是一条缓慢上坡的直线（判定书 §5.3）。现在把它压到 0.12，
     * 并加进三个**由玩家自己的行为驱动**、可以回落的来源：
     *   缺氧（屏息上弦 → 喘气释放）、僵直拍数（站着不动时持续攀升 → 解算或逃离时回落）、
     *   本房间的噪音（自己发的声，会衰减掉）。
     *
     * 平滑是**非对称**的：涨得快、落得慢。这不是为了刷分，而是生理事实 ——
     * 惊吓的上升沿在一两秒内完成，而皮质醇要几十秒才退。
     * 对称平滑会把每一拍的小抖动都算成一次"起伏"，那不是恐怖节奏，那是抖动。
     */
    const target = clamp01(
      (1 - oxyFrac) * 0.1 +
        (p.fear / 100) * 0.38 +
        (p.hypoxia / HYPOXIA_LIMIT) * 0.3 +
        (p.pending ? 0.1 + 0.06 * p.pending.ringsDone : 0) +
        Math.min(1, p.noise / SUMMON_THRESHOLD) * 0.26 +
        tick.pressure * 0.36,
    );
    // 涨落的时间常数按**呼吸**算，而不是按回合算 —— 一次 7 呼吸的僵直
    // 与一次 1 呼吸的屏息不该产生同样幅度的位移
    tension += (target - tension) * (1 - Math.exp(-(target > tension ? 0.75 : 0.1) * time));
    /*
     * 采样按**时间**，不按回合。
     *
     * 旧版一回合推一个采样点，于是"把一次感知拆成八拍"的方案凭空得到八倍的采样密度，
     * 而 `computeTensionShape` 的理想反转次数是 `采样点数 / 12` ——
     * 结果是：动作颗粒度越细，就越必然被判成"抖动"。那是量纲错误，不是设计缺陷。
     * 张力曲线是时间的函数，所以一个呼吸推一个点，两种形态才在同一把尺子上。
     */
    for (let i = Math.max(1, Math.round(time)); i > 0; i--) trace.tension.push(tension);

    if (p.at === world.exit) {
      trace.survived = true;
      break;
    }
  }

  // 三角验证真正收敛了多少个房间 —— 亲身到场也会写 verified，所以要排掉走过的
  let triangulated = 0;
  for (let n = 0; n < world.size; n++) {
    const b = p.belief[n];
    if (b && b.verified && visits[n] === 0 && n !== 0) triangulated++;
  }
  if (triangulated > 0) trace.events['triangulated'] = triangulated;

  if (!trace.survived && !trace.cause) {
    trace.cause = p.oxygen <= 0 ? 'asphyxiation' : 'lost';
  }
  trace.duration = Math.max(1, elapsed);
  trace.wasBehind = everBehind;
  trace.hadIdentifiableMistake = resolveAttribution(trace, elapsed);
  return trace;
}

// ---------------------------------------------------------------------------
// 意外与误判台账
// ---------------------------------------------------------------------------

function bump(trace: TrialTrace, key: string): void {
  trace.events[key] = (trace.events[key] ?? 0) + 1;
}

/** 同一个时间点只记一次意外，避免一个事件被三处代码各计一遍（附录 4） */
function noteSurprise(trace: TrialTrace, at: number): void {
  if (trace.surprises[trace.surprises.length - 1] === at) return;
  trace.surprises.push(at);
}

function noteMistake(trace: TrialTrace, at: number, kind: string, note: string): void {
  const last = trace.mistakes[trace.mistakes.length - 1];
  if (last && last.kind === kind && at - last.at < 6) return;
  trace.mistakes.push({ at, kind, note });
}

/**
 * 失败可归因性（附录 2、3）。
 *
 * 旧口径有两个硬伤：
 *   ① 窒息死亡按"声呐行动占比 > 28%"判定可归因 —— 这在**奖励坏设计**：
 *      一个主要教诲是"少用我"的招牌机制，越被滥用分越高。
 *   ② `cause === 'lost'`（超时）恒为不可归因，在定义上把上限压在 0.85。
 *
 * 现在的判据是：**死亡之前有没有一次可以指认的具体误判**，
 * 并且每一种死因都有它自己那句能说出口的话。
 */
/**
 * 剔除若干误判类型之后重算可归因性。
 *
 * 「机制诱导玩家浪费」和「玩家自己下错了注」在台账里长得一模一样，
 * 但只有后者算可归因。要证明一套方案的归因分不是靠前者堆出来的，
 * 唯一的办法是把嫌疑类型摘掉再算一遍，看它掉多少。
 */
export function reattribute(trace: TrialTrace, drop: readonly string[]): boolean {
  return resolveAttribution(trace, trace.duration, drop);
}

function resolveAttribution(
  trace: TrialTrace,
  elapsed: number,
  drop: readonly string[] = [],
): boolean {
  if (trace.survived) return false;
  if (!BENCH.attribution) {
    // 旧行为：只有窒息死亡、且靠行动占比判定
    if (trace.cause !== 'asphyxiation') {
      return trace.cause === 'listener' && trace.mistakes.some((m) => m.kind === 'noise-exposed');
    }
    const sense = trace.decisions.filter((d) => d.chosen.startsWith('sonar:')).length;
    return sense / Math.max(1, trace.decisions.length) > 0.28;
  }

  const ledger = drop.length ? trace.mistakes.filter((m) => !drop.includes(m.kind)) : trace.mistakes;
  const has = (...kinds: string[]): boolean => ledger.some((m) => kinds.includes(m.kind));
  const recent = (...kinds: string[]): boolean =>
    ledger.some((m) => kinds.includes(m.kind) && elapsed - m.at <= 90);

  /*
   * 僵直期给出真实选项之后，"我这一步错了"多了三种说法，都是玩家指得出来的下注：
   * 明知它在走近还在加压、一圈没听全就把回波打折收了、同一记回波来回改指向。
   * 它们与旧的几种并列而不是替换 —— 旧变体不会产生这几种记录，台账逐条不变。
   */
  switch (trace.cause) {
    case 'listener':
      // "我在第 5 拍还没跑" / "我在噪音 18 的房间里站着" / "我屏息屏爆了"
      return (
        has('commit-overstay', 'noise-exposed') ||
        recent(
          'gasp-exposed',
          'missed-window',
          'aborted-ping',
          'press-overcommit',
          'hug-on-ringing-hull',
        )
      );
    case 'trauma':
      // 区间信念之下，创伤死亡只能来自一次可指认的下注
      return has('wide-interval-bet', 'blind-step');
    case 'asphyxiation':
      // 只有存在**具体的浪费事件**才算我的账，而不是"你用得太多了"
      return (
        recent(
          'aborted-ping',
          'redundant-ping',
          'empty-echo',
          'revisit-loop',
          'gasp-exposed',
          'steer-churn',
          'truncate-waste',
        ) ||
        ledger.filter((m) =>
          [
            'aborted-ping',
            'redundant-ping',
            'empty-echo',
            'revisit-loop',
            'steer-churn',
            'truncate-waste',
          ].includes(m.kind),
        ).length >= 2
      );
    case 'lost':
      // 超时也能归因："你在同一片舱段绕了 80 口气"
      return has('revisit-loop', 'aborted-ping', 'empty-echo', 'steer-churn');
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 共享的玩家大脑
// ---------------------------------------------------------------------------

/** 标准正态。Rng 接口本身不带高斯，这里就地做一次 Box-Muller */
function gaussian(rng: Rng): number {
  const u = 1 - rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeContext(
  p: SimPlayer,
  w: SimWorld,
  skill: number,
  rng: Rng,
  threat: ThreatModel,
  elapsed: number,
  masked: boolean,
): DecisionContext {
  let readout = threat.readable(p, w);
  if (p.pending && p.hunter >= 0) {
    // 耳朵贴在回波上的时候，听者的扰动读得更远
    readout = Math.max(readout, clamp01(1 - hops(w, p.hunter, p.at) / 6));
  }
  const trueWait = breathsToMaskOpen(w, elapsed);
  // 掩蔽窗口的周期是**可以被记住的知识**，所以"记得多准"就是技巧本身
  const conf = clamp01(Math.pow(skill, 0.85) * 1.1);
  const forecast = trueWait < 0 ? -1 : Math.max(0, trueWait + gaussian(rng) * (1 - conf) * 9);
  const { unknown, deficit } = scanNearby(p, w, 3);
  let minDoorVisits = Infinity;
  for (const n of w.adj[p.at]) minDoorVisits = Math.min(minDoorVisits, p.visits[n]);
  return {
    p,
    w,
    skill,
    rng,
    unknownNearby: unknown,
    infoDeficit: deficit,
    oxyFrac: p.oxygen / p.oxygenMax,
    hunterNear: readout > 0.55,
    threatReadout: readout,
    elapsed,
    maskPhase: maskPhaseOf(w, elapsed),
    masked,
    maskForecast: forecast,
    maskConfidence: conf,
    pendingEcho: p.pending,
    minDoorVisits: Number.isFinite(minDoorVisits) ? minDoorVisits : 0,
  };
}

/**
 * 移动效用。所有变体共用**同一个**玩家大脑，
 * 否则比较的就是两个 AI，而不是两套机制。
 */
function moveUtility(to: number, ctx: DecisionContext): number {
  const { p, w, skill, rng } = ctx;
  const b = p.belief[to];

  /*
   * 未知房间是真正的未知：玩家看不见门后面，也数不出它通向几条路。
   * 之前让玩家能读到未探明房间的出度，等于偷偷给了他一张地图 ——
   * 那会让声呐变得可有可无，整个实验就失去意义了。
   */
  /*
   * 区间信念第一次让"要不要复验"成为一个有正确答案的判断。
   *
   * 低技巧玩家看区间**中点**（"读数说 0.35，还行"）；
   * 高技巧玩家看区间**上界**（"它最坏可能是 0.8，我不进"），
   * 并且对未验证的宽区间再收一道小溢价。
   * 这是技巧在移动决策上的正确形态 —— 校准，而不是一律恐惧。
   */
  /*
   * 「已确认为空」说的是"那边没有值得去的东西"，**不是**"那边安全"。
   *
   * 这两句话差一个字，代价是一条人命：一次没有回响的脉冲并没有量过那片舱段的危险度，
   * 把它折算成低风险等于让机制替玩家撒谎，而世界随后会如实收账
   *（试过一版：创伤死亡从 18.6% 涨到 31.0%）。
   * 所以否定信息只削探索价值（见下面的 progress 与 frontierValue），不碰风险估计。
   */
  const cleared = p.clearedUntil[to] > ctx.elapsed;
  const risk = b
    ? beliefMid(b) +
      (b.hi - beliefMid(b)) * (0.22 + skill * 0.72) +
      (b.verified ? 0 : beliefWidth(b) * 0.12)
    : 0.58 + skill * 0.1;

  /*
   * 知道出口在**哪边**不等于知道**怎么走过去**。
   *
   * 之前这里让 `knowsExit` 的玩家直接读真实的 `distToExit` 梯度，
   * 等于在他听到一次回波之后就把整张最短路径图塞进他脑子里 ——
   * 于是"出口已知"之后的后半程完全没有技巧可言，三档技巧走同一条路。
   * 现在只有**亲身验证过**（走过、或被三角验证收敛过）的门才给满额梯度；
   * 剩下的是一个模糊方向感，读得准不准是技巧。
   * 这条边把技巧直接接到了声呐机制上：想把方向感变成路线，就得再照一次。
   */
  const progress = b
    ? p.knowsExit
      ? (w.distToExit[p.at] - w.distToExit[to]) * (b.verified ? 0.95 : 0.3 + skill * 0.62)
      : frontierValue(p, w, to, ctx.elapsed) * (0.4 + skill * 0.42)
    : // 没有信息时，"走进黑暗"只有一个笼统的探索价值，而且是盲赌。
      // 但技巧高的玩家知道**不推进就是慢性死亡**，所以他对黑暗的估价更高
      (0.42 + skill * 0.45) * (cleared ? 0.45 : 1);

  /*
   * 回头路。
   *
   * 窒息与超时合起来占了一半的死亡，而决定氧气够不够的从来不是单步的效率，
   * 是"你有没有把同一段走廊走三遍"。高技巧玩家记得自己去过哪里、
   * 也用声呐把还没照过的方向记在心里；低技巧玩家在原地打转。
   * 这是技巧在这台机器上最大的一个出口 —— 也是判定书 §5.1 要的那种
   * "可以用一句话说出来的知识"：**别回头**。
   *
   * 关键是这一项必须**相对于当前最好的那扇门**来算。
   * 按绝对次数扣分会把"移动"整类行动一起压下去 ——
   * 实测那样会让玩家改成站在原地屏息（占到 33.7% 的行动），
   * 这不是谨慎，是决策模型的退化。
   */
  const backtrack = Math.max(0, p.visits[to] - ctx.minDoorVisits) * (0.22 + skill * 0.95);

  // 逃离只在玩家**读得到**威胁时才可能发生 —— 读不到的威胁无法被躲开
  const readout = ctx.threatReadout;
  const flee =
    readout > 0 && p.hunter >= 0
      ? (hops(w, p.hunter, to) - hops(w, p.hunter, p.at)) * readout * 1.5 * (0.45 + skill * 1.1)
      : 0;

  // 提案 5：听到过嘶声的氧气缓存产生引力，越缺氧越强。翻盘通道第一次接上了核心机制
  const pull = cacheGradient(p, w, to) * (0.35 + Math.pow(1 - ctx.oxyFrac, 2) * 4.2);

  /*
   * 技巧高的玩家更准确地折算风险，也更少乱走。
   *
   * 系数从 `0.5 + skill*1.7` 收到 `0.85 + skill*0.6`：原来的斜率太陡，
   * 高技巧玩家会把**一切**房间都当成致命的，结果是拒绝推进、在几个已验证的
   * 安全舱段之间来回踱步，然后死于氧气或超时 —— 实测高技巧组存活率比中技巧组低
   * 10 个百分点，时长却是它的 1.5 倍。那不是技巧，那是瘫痪。
   * 判定书 §5.1 说得对：技巧不该表现为"系数调得更狠"，而该表现为具体的知识与操作
   *（掩蔽窗口、僵直几拍、屏息到第几点）。风险折算只保留一条温和的斜率。
   */
  // 手抖：新手的偏好里有一大块是噪音。这不是"技巧"的全部，但它是其中一部分
  const noise = rng.float(0, 1.4 * (1 - skill) + 0.08);
  return progress + flee + pull - backtrack - risk * (1.05 + skill * 0.3) + noise + 0.35;
}

function restUtility(ctx: DecisionContext): number {
  const { p, skill, rng } = ctx;
  /*
   * §5.3：旧公式的 `-(1 - oxyFrac) * 1.8` 造出一个单向棘轮 ——
   * 恐惧↑ → 氧耗↑ → 氧气↓ → 休息更贵 → 恐惧下不来。
   * 最需要喘息的时刻喘息最贵，方向搞反了。现在低氧**提高**休息的价值，
   * 因为稳定呼吸真的省氧（见 REST_EFFICIENCY）。
   */
  const oxyTerm = BENCH.restFix ? (1 - ctx.oxyFrac) * 0.55 : -(1 - ctx.oxyFrac) * 1.8;
  /*
   * 时间也是资源：船在灌水，教团的仪式在推进。
   * 没有这一项，"喘息能省氧"会让理性玩家一路休息到超时 ——
   * 第一次试跑里休息占了 51% 的行动，一半的死亡是超时。
   * 喘息应该是压力阀，不是主循环。
   */
  const timePressure = (ctx.elapsed / TIME_LIMIT) * 3.4 + (p.knowsExit ? 0 : 0.7);
  const value =
    (p.fear / 100) * 2.4 - Math.max(0, ctx.threatReadout) * 3 + oxyTerm - timePressure;
  return value * (0.4 + skill * 1.2) + rng.float(0, 0.9 * (1 - skill));
}

/**
 * 屏息效用（提案 5）。
 *
 * 屏息是这台机器里唯一一个**零氧耗**的动作，代价是缺氧计时器。
 * 它同时是三件事的入口：等掩蔽窗口、听氧气缓存的嘶声、让噪音自己衰减掉。
 * 它也是"技巧"在数值上的主要出口 —— 知道窗口何时来的玩家会在这里等，
 * 不知道的玩家只会屏到爆，然后用一记 25 噪音的大喘气把听者请过来。
 */
function holdUtility(ctx: DecisionContext): number {
  const { p, skill, rng, oxyFrac } = ctx;
  const headroom = HYPOXIA_LIMIT - p.hypoxia;
  if (headroom <= 0) return -Infinity;

  /*
   * 起手是**负的**：站在原地不做事，时间照走。
   * 屏息必须有一个具体的理由才值得，否则它会退化成一个万能的免费动作 ——
   * 第一次试跑就是这样，屏息占了 61% 的行动，然后所有人死在被迫的大喘气上。
   */
  let v = -0.55;
  // ① 省氧。一拍只省一两口气，所以这一项必须很小
  v += (1 - oxyFrac) * 0.5;
  /*
   * ② 等窗口。
   *
   * 注意这里读的是 `maskForecast` —— 玩家**以为**窗口还有几拍才开。
   * 新手的这个数字几乎是噪音，所以他会在错误的时刻屏息、屏到缺氧见底、
   * 然后在窗口之外用一记 25 噪音的大喘气把听者请过来。
   * 老手记得这条船的周期，踩得准。
   *
   * 早先的写法把整项乘上 `maskConfidence`，等于让新手根本不去等 ——
   * 那样他就不会犯这个错，技巧差距也就无从产生。
   * 一条知识型技巧要产生差距，必须让不掌握它的人**照样出手**，只是出错。
   */
  const wait = ctx.maskForecast;
  if (wait > 0 && wait + 1 <= headroom && ctx.infoDeficit > 4) {
    v += (2.4 - wait * 0.2) * (0.6 + skill * 0.5);
  } else if (ctx.masked) {
    // 窗口正开着，屏息等于浪费窗口
    v -= 1.2 * ctx.maskConfidence;
  }
  // ③ 找氧：低氧且还有没听到的缓存时，屏息是唯一的定位手段
  if (oxyFrac < 0.45 && !hasHeardCache(p)) {
    v += (0.45 - oxyFrac) * 8 * (0.45 + skill * 0.8);
  }
  // ④ 逼近召唤线时屏息可以躺过去 —— 不产生新噪音，旧噪音继续衰减
  v += Math.max(0, p.noise - SUMMON_THRESHOLD * 0.62) * 0.055 * (0.4 + skill);
  // ⑤ 它就在隔壁时，不动是活路
  if (ctx.threatReadout > 0.45) v += ctx.threatReadout * 2.4 * (0.4 + skill);
  // 代价：缺氧逼近上限。高技巧玩家对这条线敬畏得多
  v -= Math.pow(p.hypoxia / HYPOXIA_LIMIT, 2) * 4 * (0.5 + skill * 1.5);
  return v + rng.float(0, 1.1 * (1 - skill) + 0.08);
}

function hasHeardCache(p: SimPlayer): boolean {
  return p.heardCache.size > 0;
}

/** 朝 to 走，离最近的"已听到"氧气缓存近了几跳 */
function cacheGradient(p: SimPlayer, w: SimWorld, to: number): number {
  if (p.heardCache.size === 0) return 0;
  let here = 99;
  let there = 99;
  for (const n of p.heardCache) {
    if (w.oxygenCache[n] <= 0) continue;
    here = Math.min(here, hops(w, p.at, n));
    there = Math.min(there, hops(w, to, n));
  }
  if (here > 20) return 0;
  return here - there;
}

/**
 * 僵直期的"再听一拍"效用。
 *
 * 这是方案丙的核心决策，也是整台机器里唯一一个**没有公式解**的判断：
 * 外圈的信息还没到手，而它正在靠近；每一拍都要重新问一次"我还敢站多久"。
 */
function commitListenUtility(ctx: DecisionContext, ec: PendingEcho, hold: boolean): number {
  const { p, w, skill, rng, oxyFrac } = ctx;
  const remaining = ec.rings - ec.ringsDone;
  const ringInfo = lobeDeficit(p, w, ec.origin, ec.ringsDone + 1, ec.direction) -
    lobeDeficit(p, w, ec.origin, ec.ringsDone, ec.direction);
  const info = Math.max(0, ringInfo) * (p.knowsExit ? 0.6 : 1.15) * (hold ? 1.25 : 1);
  // 站着不动的风险，随读到的逼近程度陡增
  const risk = (0.3 + Math.max(0, ctx.threatReadout) * 3.6) * (0.45 + skill * 1.3);
  const breath = hold ? 0 : (0.3 + (1 - oxyFrac) * 1.5) * (0.4 + skill * 1.05);
  const hypox = hold ? Math.pow((p.hypoxia + 1) / HYPOXIA_LIMIT, 2) * 2.6 * (0.5 + skill) : 0;
  // 沉没成本偏误：低技巧玩家舍不得已经付掉的噪音
  const sunk = (1 - skill) * ec.paidNoise * 0.06 * remaining;
  return info - risk - breath - hypox + sunk + rng.float(0, 1.2 * (1 - skill) + 0.08);
}

/** 打断效用。已付的噪音是沉没成本，理性玩家不该为它继续站着 */
function commitAbortUtility(ctx: DecisionContext, ec: PendingEcho): number {
  const { skill, rng } = ctx;
  const flee = Math.max(0, ctx.threatReadout) * 3.4 * (0.4 + skill * 1.5);
  // 放弃外圈是真实损失，所以打断本身要扣掉一点
  const loss = (ec.rings - ec.ringsDone) * 0.22;
  return flee - loss + rng.float(0, 0.9 * (1 - skill));
}

/**
 * 往这个方向走能打开多少未知。
 * 只在 `to` 已被感知过时才可调用 —— 否则玩家就凭空得到了门后的拓扑。
 *
 * 被排除过的门后面不算未知：回波已经说过那里没有东西，再走一趟只是重复劳动。
 * 兜圈子是这台机器上最贵的死法，而它的成因恰恰是"每个没照过的方向看起来都一样值钱"。
 */
function frontierValue(p: SimPlayer, w: SimWorld, to: number, elapsed: number): number {
  let unknown = 0;
  for (const n of w.adj[to]) if (!p.belief[n] && p.clearedUntil[n] <= elapsed) unknown++;
  return unknown;
}

function classifyMove(p: SimPlayer, w: SimWorld, to: number): string {
  const known = !!p.belief[to];
  const toward = w.distToExit[to] < w.distToExit[p.at];
  if (!known) return toward ? 'blind-forward' : 'blind-lateral';
  return toward ? 'known-forward' : 'known-lateral';
}

/** 三跳内的未知房间数与信息赤字。赤字口径让"复验一个宽区间"也算收益 */
export function scanNearby(
  p: SimPlayer,
  w: SimWorld,
  radius: number,
): { unknown: number; deficit: number } {
  const seen = new Set<number>([p.at]);
  let frontier = [p.at];
  let unknown = 0;
  let deficit = 0;
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (const n of w.adj[cur]) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
        const b = p.belief[n];
        if (!b) {
          unknown++;
          deficit += 1;
        } else if (!b.verified) {
          deficit += beliefWidth(b);
        }
      }
    }
    frontier = next;
  }
  return { unknown, deficit };
}

export function countUnknownWithin(p: SimPlayer, w: SimWorld, radius: number): number {
  return scanNearby(p, w, radius).unknown;
}

const hopCache = new WeakMap<SimWorld, Map<number, number[]>>();

export function hops(w: SimWorld, from: number, to: number): number {
  let cache = hopCache.get(w);
  if (!cache) {
    cache = new Map();
    hopCache.set(w, cache);
  }
  let d = cache.get(from);
  if (!d) {
    d = bfsDistances(w.adj, from);
    cache.set(from, d);
  }
  return d[to];
}

function stepToward(w: SimWorld, from: number, to: number): number {
  let best = from;
  let bestD = hops(w, from, to);
  for (const n of w.adj[from]) {
    const d = hops(w, n, to);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function farthestFrom(w: SimWorld, origin: number): number {
  let best = origin;
  let bestD = -1;
  for (let i = 0; i < w.size; i++) {
    const d = hops(w, origin, i);
    if (d !== Infinity && d > bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
