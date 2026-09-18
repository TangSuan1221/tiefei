import { registerSlot, type MechanicVariant } from '../variants';
import {
  BENCH,
  buildWorld,
  disturbanceThreat,
  hops,
  lobeDeficit,
  markSectorClear,
  parallaxGain,
  reveal,
  revealRing,
  revealRingTargets,
  runTrial,
  senseOption,
  HYPOXIA_LIMIT,
  MASK_FACTOR,
  SUMMON_THRESHOLD,
  emitNoise,
  type ActionSpec,
  type BeatResult,
  type DecisionContext,
  type PendingEcho,
  type SenseOption,
  type SensingMechanic,
  type SimPlayer,
  type SimWorld,
  type TrialRecorder,
} from './model';

/**
 * 盲测 #4：僵直期是一把单向的锁，还是一局可以反悔的赌？
 *
 * 上一轮判定：三拍承诺（发声—僵直—回波）胜，六项准入线全过，定为基线。
 * 它赢在五个档位全都在用、四条失败路径同时存在、玩家真的在操作声呐。
 * 剩下两处伤口是真的：
 *
 *   ① **恢复余地 0.220** —— 八项里唯一的低分。承诺结构天然如此：
 *      你在最需要机动的那一刻恰好把自己钉住了，于是一旦开始崩就没有回头路。
 *      实测只有 7.3% 的局曾跌到两成氧以下，而其中只有 4.5% 爬得回来。
 *   ② **空回波 558.8 次/百死** —— "什么都没有"是一个诱导玩家做无用功的返回值，
 *      它把名义上的可归因性垫高了。
 *
 * 这一轮比较的不是两种形态，而是同一个形态的两种**承诺语义**：
 *
 *   锁死承诺 = 上一轮的胜者原样。僵直期只有"继续听 / 屏息听 / 全盘作废"。
 *   可赎回承诺 = 僵直期每一拍都是一个真实的四选一加两个听法；
 *              空回波返回否定信息；风险在第三拍封顶而回波质量继续上涨。
 *
 * 两者共用同一个 `senseUtility`、同一张起手档位表、同一批世界、同一个威胁模型。
 * 起手那一层逐字相同 —— 这一轮唯一被改动的是**噪音付出去之后**发生的事。
 */

// ---------------------------------------------------------------------------
// 共用的效用函数 —— 两个变体用同一个玩家大脑
// ---------------------------------------------------------------------------

function senseUtility(o: SenseOption, ctx: DecisionContext): number {
  const { p, w, skill, rng, oxyFrac, hunterNear } = ctx;
  const readout = Math.max(0, ctx.threatReadout);

  /*
   * 信息价值按**主瓣内的信息赤字**算，而不是旧版那个 `min(unknownNearby, radius*2.1)`。
   * 旧代理量与形态无关，而且被局部拓扑钳死 —— 判定书第三节证明它让最优点变成常数。
   * 换成赤字之后，"复验一个宽区间"也是收益，定向脉冲也自带"背后仍然是黑的"这个代价。
   */
  const reach = lobeDeficit(p, w, p.at, o.radius, o.direction);
  const infoGain = reach * (o.fidelity - o.confidence * 0.6) * (p.knowsExit ? 0.55 : 1.15);

  // 提案 3：站在**别的位置**再打一发，旧区间才会收敛。这一项就是"规划观测点"的价值
  const triGain = parallaxGain(p, w, p.at, o.radius, o.direction) * (0.6 + skill * 1.5);

  // 噪音风险。窗口内 ×0.3；定向时噪音落在主瓣那一头，对自己的暴露小得多
  const effNoise = o.noise * (ctx.masked ? MASK_FACTOR : 1) * (o.direction >= 0 ? 0.4 : 1);
  const noiseRisk = effNoise * (hunterNear ? 0.26 : readout * 0.2 + 0.075) * (0.35 + skill * 1.55);

  /*
   * 召唤余量。
   *
   * 噪音的边际代价随"离召唤线还有多远"**急剧**上升，而不是线性的。
   * 这是高技巧玩家真正在算的东西：不是"这一记吵不吵"，
   * 而是"这一记会不会把这个房间推过线"。
   */
  const depot = o.direction >= 0 ? o.direction : p.at;
  const before = p.noiseField[depot] / SUMMON_THRESHOLD;
  const after = (p.noiseField[depot] + effNoise) / SUMMON_THRESHOLD;
  const overflow =
    (Math.pow(after, 3) - Math.pow(before, 3)) *
    (p.hunter >= 0 ? 7 : 19) *
    (0.3 + skill * 1.4);

  /*
   * 氧气代价 = 发声 + 僵直。僵直拍可以用屏息顶掉（不耗氧，只攒缺氧），
   * 所以懂行的玩家看到的承诺代价比新手低 —— 这是"敢站着听"的第一层回报。
   */
  const holdable = BENCH.holdBreath ? Math.min(o.commitTurns, HYPOXIA_LIMIT - p.hypoxia) : 0;
  const payBreaths = o.breaths + o.commitTurns - Math.max(0, holdable) * 0.3 * skill;
  const breathCost = payBreaths * (0.3 + (1 - oxyFrac) * 1.5) * (0.4 + skill * 1.05);

  // 僵直风险：站着不动的每一拍都乘上"我读到它有多近"。这是承诺结构的核心代价
  const commitRisk = o.commitTurns * (0.16 + readout * 1.7) * (0.4 + skill * 1.45);

  // 7.3 照射致聋：用未来的必然被追，换眼前 15 口气的绝对安全。绝境里才划算
  const canBlind =
    p.hunter >= 0 &&
    p.hunterDeaf <= 0 &&
    o.noise >= 20 &&
    hops(w, p.at, p.hunter) <= o.radius &&
    (o.direction < 0 || hops(w, o.direction, p.hunter) < hops(w, p.at, p.hunter));
  const blindValue = canBlind ? (readout * 4.2 + (1 - oxyFrac) * 3.4) * (0.3 + skill * 1.6) : 0;

  // 低技巧玩家的认知偏差：高估大功率的好处，低估噪音与僵直
  const bias = (1 - skill) * o.radius * 0.38;

  return (
    infoGain +
    triGain +
    blindValue -
    noiseRisk -
    overflow -
    breathCost -
    commitRisk +
    bias +
    rng.float(0, 1.5 * (1 - skill) + 0.1)
  );
}

function describe(o: SenseOption): ActionSpec {
  return {
    id: o.id,
    kind: 'mode',
    attrs: {
      起手呼吸: o.breaths.toFixed(2),
      噪音: o.noise.toFixed(2),
      半径: String(o.radius),
      保真度: o.fidelity.toFixed(3),
      僵直拍: String(o.commitTurns),
      主瓣: o.direction >= 0 ? '定向' : '全向',
      附加区间宽度: o.confidence.toFixed(2),
    },
  };
}

// ---------------------------------------------------------------------------
// 起手档位：两个变体逐字共用
// ---------------------------------------------------------------------------

const COMMIT_BASE = [
  { key: 'low', radius: 1, noise: 2, fidelity: 0.42, confidence: 0.1 },
  { key: 'mid', radius: 3, noise: 9, fidelity: 0.82, confidence: 0.03 },
  { key: 'high', radius: 7, noise: 26, fidelity: 0.98, confidence: 0 },
];

/**
 * 主瓣只能朝**已知的相邻舱段**发（不允许朝未知方向发，
 * 否则在全黑的图上选方向会超出人的心智地图能力）。
 *
 * 两个候选方向对应双向声呐的两种用法：
 *   诱敌 —— 主瓣打向远离出口的那一头，噪音的表观来源落在那里，把它拉去船的另一头；
 *   照射 —— 主瓣打向听者所在的方向，能把它照聋，代价是此后它对你的置信度拉满。
 */
function directionCandidates(p: SimPlayer, w: SimWorld): { decoy: number; strike: number } {
  let decoy = -1;
  let decoyScore = -Infinity;
  let strike = -1;
  let strikeD = Infinity;
  for (const n of w.adj[p.at]) {
    if (!p.belief[n]) continue; // 只朝已知舱段发声
    const away = w.distToExit[n] - w.distToExit[p.at];
    if (away > decoyScore) {
      decoyScore = away;
      decoy = n;
    }
    if (p.hunter >= 0) {
      const d = hops(w, n, p.hunter);
      if (d < strikeD) {
        strikeD = d;
        strike = n;
      }
    }
  }
  return { decoy, strike };
}

function commitModes(ctx: DecisionContext): SenseOption[] {
  const { p, w } = ctx;
  const out: SenseOption[] = [];
  for (const b of COMMIT_BASE) {
    out.push(
      senseOption({
        id: `sonar:ping-${b.key}`,
        breaths: 1,
        noise: b.noise,
        radius: b.radius,
        fidelity: b.fidelity,
        commitTurns: b.radius,
        confidence: b.confidence,
      }),
    );
  }
  const { decoy, strike } = directionCandidates(p, w);
  // 能量集中在主瓣里：定向多一跳半径、保真度略高，代价是背后完全不照
  if (decoy >= 0) {
    out.push(
      senseOption({
        id: 'sonar:ping-decoy',
        breaths: 1,
        noise: 26,
        radius: 8,
        fidelity: 0.98,
        commitTurns: 6,
        direction: decoy,
      }),
    );
  }
  if (strike >= 0 && p.hunter >= 0) {
    out.push(
      senseOption({
        id: 'sonar:ping-strike',
        breaths: 1,
        noise: 26,
        radius: 8,
        fidelity: 0.98,
        commitTurns: 5,
        direction: strike,
      }),
    );
  }
  return out;
}

/** 起手档位的目录项。五档在两个变体里逐字相同，差异只在噪音付出去之后 */
const MODE_SPECS: ActionSpec[] = [
  ...COMMIT_BASE.map((b) =>
    describe(
      senseOption({
        id: `sonar:ping-${b.key}`,
        breaths: 1,
        noise: b.noise,
        radius: b.radius,
        fidelity: b.fidelity,
        commitTurns: b.radius,
        confidence: b.confidence,
      }),
    ),
  ),
  describe(
    senseOption({
      id: 'sonar:ping-decoy',
      breaths: 1,
      noise: 26,
      radius: 8,
      fidelity: 0.98,
      commitTurns: 6,
      direction: 0,
    }),
  ),
  describe(
    senseOption({
      id: 'sonar:ping-strike',
      breaths: 1,
      noise: 26,
      radius: 8,
      fidelity: 0.98,
      commitTurns: 5,
      direction: 0,
    }),
  ),
];

// ---------------------------------------------------------------------------
// 变体 1：锁死承诺（上一轮的胜者，原样）
// ---------------------------------------------------------------------------

/** 僵直期那三个附属拍的目录项。它们没有档位属性，只有代价 */
const LOCKED_BEAT_SPECS: ActionSpec[] = [
  {
    id: 'sonar:echo-listen',
    kind: 'beat',
    attrs: { 起手呼吸: '1.00', 噪音: '0.00', 半径: '—', 保真度: '±0', 僵直拍: '消耗 1 拍', 主瓣: '—', 附加区间宽度: '0.00' },
  },
  {
    id: 'sonar:echo-hold',
    kind: 'beat',
    attrs: { 起手呼吸: '0.00', 噪音: '0.00', 半径: '—', 保真度: '+0.20', 僵直拍: '消耗 1 拍', 主瓣: '—', 附加区间宽度: '-0.12' },
  },
  {
    id: 'sonar:echo-abort',
    kind: 'beat',
    attrs: { 起手呼吸: '1.00', 噪音: '0.00', 半径: '—', 保真度: '作废', 僵直拍: '清空', 主瓣: '—', 附加区间宽度: '—' },
  },
];

/**
 * 基线：噪音先全额付清且不返回信息，回波按距离逐圈返回、必须站着不动才听得清。
 * 僵直期只有三条路：继续听、屏息听、或者把整记脉冲作废。
 *
 * 这个变体不实现 `beat`，所以它走实验台的默认僵直分支 —— 与上一轮逐位相同。
 */
const lockedMechanic: SensingMechanic = {
  options: commitModes,
  // commitTurns 全部 > 0，所以这条即时解算路径不会被走到；留着是为了接口完整
  apply(opt, ctx) {
    reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng, opt.direction);
  },
  utility: senseUtility,
  catalog: () => [...MODE_SPECS, ...LOCKED_BEAT_SPECS],
};

// ---------------------------------------------------------------------------
// 变体 2：可赎回承诺
// ---------------------------------------------------------------------------

/**
 * 风险封顶的拍号。
 *
 * 一圈回波等多久跟那一圈有多远成正比，所以承诺越深，每一拍就越长，
 * 而"站着不动的一拍"正是听者逼近你的那一拍 —— 风险是随投入线性涨的。
 * 收益却不是：外圈的房间更远、更可能用不上，边际信息在递减。
 * 线性风险配递减收益，结果是深度承诺永远不划算，玩家学会只按最短的那一档。
 * 从第三拍起把拍长钉住，深度承诺才从"越来越可能直接死"变回"贵"。
 */
const RISK_CAP_RING = 3;

/**
 * 每多听一圈，补回多少保真度。
 *
 * `revealRing` 里外圈的保真度按 0.9^(ring-1) 衰减，于是承诺越深、拿到的东西越糊，
 * 这正是"投入换不到收益"的另一半。0.09 明显大于那条衰减曲线的斜率，
 * 所以在可赎回承诺里，**多站一拍确实换来更清楚的一圈**，而不只是更远的一圈。
 * 斜率必须够陡：它是"沉住气"这件事唯一的回报，回报不够陡就测不出技巧。
 */
const RING_GAIN = 0.09;

/** 「已确认为空」的有效期（呼吸）。船在动，排除过的扇区迟早重新变回未知 */
const CLEAR_TTL = 90;

/** 一记回波最多能被续压几次 */
const MAX_PRESS = 2;

/** 每记回波的私有状态。挂在回波对象上，不占实验台的字段 */
interface EchoState {
  presses: number;
  steers: number;
}
const echoState = new WeakMap<PendingEcho, EchoState>();

function stateOf(ec: PendingEcho): EchoState {
  let st = echoState.get(ec);
  if (!st) {
    st = { presses: 0, steers: 0 };
    echoState.set(ec, st);
  }
  return st;
}

/** 这一拍要等多久。第三拍之后不再变长 —— 风险封顶就封在这里 */
function beatLength(ec: PendingEcho): number {
  return 1 + Math.min(ec.ringsDone, RISK_CAP_RING) * 0.5;
}

/**
 * 取半取到的那一圈有多清楚。
 *
 * "取半"不是一个固定折扣：换能器还在发的时候收摊，回来的是一团几乎没有形状的混响；
 * 快听完了再收，手里已经有大半个相位可以对齐。所以折扣随已听到的比例滑动。
 * 这条斜率是这个选项的全部技巧含量 —— 没有它，"提前收"就是一个没有代价的万能键，
 * 新手随手按也不吃亏，技巧差会被直接抹平。
 */
function truncateFidelityScale(ec: PendingEcho): number {
  return 0.3 + 0.4 * (ec.ringsDone / Math.max(1, ec.rings));
}

/** 下一圈还能照出多少信息赤字。换了指向就按新指向算 */
function nextRingInfo(ctx: DecisionContext, ec: PendingEcho, direction: number, ahead = 0): number {
  const { p, w } = ctx;
  const r = ec.ringsDone + ahead;
  return Math.max(0, lobeDeficit(p, w, ec.origin, r + 1, direction) - lobeDeficit(p, w, ec.origin, r, direction));
}

/** 还没到手的那几圈一共值多少 */
function remainingInfo(ctx: DecisionContext, ec: PendingEcho, direction: number): number {
  const { p, w } = ctx;
  return Math.max(
    0,
    lobeDeficit(p, w, ec.origin, ec.rings, direction) -
      lobeDeficit(p, w, ec.origin, ec.ringsDone, direction),
  );
}

/** 手上还有没有一个"听到过、而且还没被搬空"的氧气罐 */
function hasReachableCache(p: SimPlayer, w: SimWorld): boolean {
  for (const n of p.heardCache) if (w.oxygenCache[n] > 0) return true;
  return false;
}

/** 转向的候选：另一个已知的相邻舱段，且不是现在照着的那一个 */
function steerTarget(ctx: DecisionContext, ec: PendingEcho): number {
  const { p, w } = ctx;
  let best = -1;
  let bestVal = 0;
  for (const n of w.adj[ec.origin]) {
    if (!p.belief[n] || n === ec.direction) continue;
    const val = lobeDeficit(p, w, ec.origin, ec.rings, n) - lobeDeficit(p, w, ec.origin, ec.ringsDone, n);
    if (val > bestVal) {
      bestVal = val;
      best = n;
    }
  }
  return best;
}

/**
 * 可赎回承诺的僵直拍。
 *
 * 判定书要买的是**恢复余地**：崩盘开始的时候，玩家手里得有一个能止损的按钮。
 * 锁死承诺的问题不是"选项少"，而是"选项的方向只有一个" ——
 * 继续站着，或者把已经付掉的噪音连同全部收益一起扔掉。
 * 这里给的四个新选项都是**部分止损**：用一部分收益换一部分自由。
 */
function redeemableBeat(ctx: DecisionContext, ec: PendingEcho, rec: TrialRecorder): BeatResult {
  const { p, w, skill, rng, oxyFrac } = ctx;
  const st = stateOf(ec);
  const readout = Math.max(0, ctx.threatReadout);
  const len = beatLength(ec);
  const remaining = ec.rings - ec.ringsDone;
  const last = remaining <= 1;

  const canHold = BENCH.holdBreath && p.hypoxia + len <= HYPOXIA_LIMIT;
  const canHug = BENCH.holdBreath && p.hypoxia + 1 <= HYPOXIA_LIMIT;
  const canPress = st.presses < MAX_PRESS;
  const steerTo = last ? -1 : steerTarget(ctx, ec);
  /*
   * 一圈都还没回来的时候没有"半"可取 —— 取半的前提是手里已经有东西。
   *
   * 少了这一条，最优解会退化成"按下就截断"：付掉噪音、一口气拿走两圈糊读数、
   * 立刻自由。那等于花 26 点噪音买了一记即时脉冲，承诺结构被整个绕过去
   *（实测一局 44 记脉冲、其中 37 记在第一拍就被收走，技巧表达度掉到 0.342）。
   * 承诺的第一拍必须是不可赎回的，后面的每一拍才有"赎回"可言。
   */
  const canTruncate = ec.ringsDone >= 1;

  /*
   * 决策密度这一项在上一轮已经是 1.000，而它的口径是"局面确实变了才算一个新决策"。
   * 这里沿用**同一条**判据：不这么做的话，可赎回承诺会仅仅因为菜单更长
   * 就在密度上凭空多出一截 —— 那测的是菜单长度，不是决策。
   */
  const sig = Math.floor(readout * 4) * 16 + Math.floor(p.hypoxia);
  const live = sig !== ec.lastSignature || last;
  ec.lastSignature = sig;

  // ---- 各选项的代价：站着的风险、呼吸、缺氧 ----
  const standRisk = (beats: number): number =>
    beats * (0.2 + readout * 1.9) * (0.45 + skill * 1.3);
  const breathCost = (beats: number): number =>
    beats * (0.3 + (1 - oxyFrac) * 1.5) * (0.4 + skill * 1.05);
  const hypoxCost = (beats: number): number =>
    Math.pow((p.hypoxia + beats) / HYPOXIA_LIMIT, 2) * 2.6 * (0.5 + skill);
  /*
   * 低氧时"找到氧气"压倒一切 —— 翻盘通道的入口。
   *
   * 注意它只在**手上没有可去的氧气罐**时才涨起来：有线索的时候该做的是去拿，不是接着听。
   * 这条线是整个可赎回承诺里唯一一处让玩家为"下一局面"付钱的地方，
   * 也是恢复余地真正的来源 —— 它必须陡，否则崩盘时没人会去按那个按钮。
   */
  const oxygenHunger =
    oxyFrac < 0.6 && !hasReachableCache(p, w)
      ? (0.6 - oxyFrac) * 11 * (0.45 + skill * 0.8)
      : 0;
  /*
   * 沉没成本偏误：低技巧玩家舍不得已经付掉的噪音。
   *
   * 这一项是整个菜单的技巧轴。四个新选项全都是"用一部分收益换一部分自由"，
   * 而**已经花掉的噪音换不回来**这件事，恰恰是新手看不破的那一层：
   * 他会觉得"都吵成这样了，现在收手不就白吵了吗"，于是继续钉在原地，
   * 而听者正是冲着那声吵来的。老手知道噪音是已经烧掉的钱，只按当下的赔率下注。
   *
   * 没有这一项的时候，菜单对谁都是一张便宜的逃生券：实测新手层存活率被抬到 58%，
   * 技巧落差从对照组的 42 个百分点塌到 20 个。逃生券必须只对看得懂赔率的人便宜。
   */
  const sunk = (1 - skill) * ec.paidNoise * 0.075 * remaining;

  const info = nextRingInfo(ctx, ec, ec.direction) * (p.knowsExit ? 0.6 : 1.15);

  const uListen = info - standRisk(len) - breathCost(len) + sunk;
  const uHold = canHold ? info * 1.25 - standRisk(len) - hypoxCost(len) + sunk : -Infinity;

  /*
   * 续压：多等一拍，半径 +1、区间收窄。
   * 它是唯一一个**加码**的选项 —— 有了它，"我已经站在这里了"才第一次成为一种资源，
   * 而不只是一笔沉没成本。代价是再多站一拍，外加持续供能的那点噪音。
   */
  const uPress = canPress
    ? info +
      nextRingInfo(ctx, ec, ec.direction, 1) * 0.75 +
      remaining * 0.18 * (0.5 + skill) -
      standRisk(len + 1) -
      breathCost(len + 1) -
      readout * 1.4 * (0.3 + skill)
    : -Infinity;

  /*
   * 截断取半：立刻收摊，把**正洗过身边的那一圈**糊着收下，更远的永久作废。
   * 和作废的区别是本质的 —— 作废是惩罚，取半是决策：
   * 你把"清楚"换成了"现在就能走"，而这正是崩盘开始时唯一需要的那个按钮。
   */
  const uTruncate = canTruncate
    ? nextRingInfo(ctx, ec, ec.direction) * truncateFidelityScale(ec) +
      readout * 3 * (0.4 + skill * 1.5) +
      Math.pow(1 - oxyFrac, 2) * 2.6 * (0.4 + skill) -
      remainingInfo(ctx, ec, ec.direction) * 0.35 -
      remaining * 0.12 -
      sunk
    : -Infinity;

  /*
   * 转向主瓣：用已经花掉的噪音换一个新方向。
   * 代价是保真度下降，以及新方向上近处的那几圈已经错过了 —— 声音不会倒着走回来。
   */
  const uSteer =
    steerTo >= 0
      ? (lobeDeficit(p, w, ec.origin, ec.rings, steerTo) -
          lobeDeficit(p, w, ec.origin, ec.ringsDone, steerTo)) *
          0.8 -
        standRisk(1) -
        breathCost(1) -
        remaining * 0.12 -
        st.steers * 1.6 -
        sunk * 0.4
      : -Infinity;

  /*
   * 贴壁：本拍不收回波，换取本拍不被定位。
   *
   * 这是四个选项里最"亏"的一个 —— 它把一圈回波直接扔掉。
   * 但它同时是恢复余地真正的来源，因为它一次按住了崩盘螺旋的两头：
   *   氧耗乘数里有恐惧那一项，恐惧越高烧得越快、烧得越快就越慌；
   *   而耳朵贴在壳上、身边正好有一圈回波洗过去的时候，氧气罐的低频嘶声听得最清也最远。
   * 绝境里你放弃的那一圈，换回来的是一条命。
   *
   * 前提是这间舱室本身安静。刚在脚下放完一记全向脉冲还想贴壁藏起来，
   * 藏的是耳朵不是自己 —— 新手会照按，老手会先把噪音甩到别处去再贴。
   */
  const hidden = p.noiseField[p.at] < SUMMON_THRESHOLD * 0.35;
  const uHug = canHug
    ? readout * 3.2 * (0.4 + skill * 1.4) * (hidden ? 1 : 0.15) +
      oxygenHunger -
      info -
      hypoxCost(1) -
      sunk * 0.6
    : -Infinity;

  const menu: { u: number; kind: string }[] = [
    { u: uListen, kind: 'listen' },
    { u: uHold, kind: 'hold' },
    { u: uPress, kind: 'press' },
    { u: uTruncate, kind: 'truncate' },
    { u: uSteer, kind: 'steer' },
    { u: uHug, kind: 'hug' },
  ];
  /*
   * 手抖：新手的偏好里有一大块是噪音，而在僵直期它落在"再站一拍还是现在就收"这根轴上。
   * 沉不住气的人会把一记本来听得完的脉冲提前收掉，这正是这台机器要能测出来的技巧差。
   */
  let pick = menu[0];
  let best = -Infinity;
  for (const m of menu) {
    const u = m.u === -Infinity ? -Infinity : m.u + rng.float(0, 1.1 * (1 - skill) + 0.06);
    if (u > best) {
      best = u;
      pick = m;
    }
  }

  const options = live ? menu.filter((m) => m.u > -Infinity).length : 1;
  const depot = ec.direction >= 0 ? ec.direction : ec.origin;

  switch (pick.kind) {
    case 'press': {
      st.presses++;
      ec.rings += 1;
      // 续压买的是**整记回波**的清晰度，不只是多一圈。承诺越深，回波越硬
      ec.confidence -= 0.06;
      ec.fidelity += 0.08;
      /*
       * 加压不只是让声音走得更远，它还把已经回来的那几圈重新对了一次相位：
       * 手里多出来的能量落在整个回波上，先前糊的几圈跟着收窄。
       * 这是"收益随承诺增长"最硬的一处兑现 —— 也是为什么沉得住气的人地图更干净，
       * 而地图干净直接换成少踩几个灾害舱室。
       */
      for (let r = 1; r <= ec.ringsDone; r++) {
        revealRing(p, w, ec.origin, r, ec.fidelity + RING_GAIN * (r - 1), Math.max(0, ec.confidence), rng, ec.direction);
      }
      // 继续给换能器供能，声音也继续往外走。加码是要被听见的
      emitNoise(p, w, depot, 6, ctx.masked);
      rec.event('echo-pressed');
      if (readout >= 0.55) {
        rec.mistake(
          'press-overcommit',
          `已经读到它在 ${(readout * 100) | 0}% 的逼近度上，还在给第 ${ec.ringsDone + 1} 圈加压`,
        );
      }
      solveRing(ctx, ec, rec, false);
      return { id: 'sonar:echo-press', options, time: len, oxyBreaths: len + 1, held: false };
    }
    case 'truncate': {
      /*
       * 只有正在回来的那一圈收得到，而且是糊的；更远的圈声音还没走到，永久作废。
       * 这条边界很重要：没有它，"取半"会变成一个又快又全的万能键。
       */
      if (ec.ringsDone + 1 <= ec.rings) {
        revealRing(
          p,
          w,
          ec.origin,
          ec.ringsDone + 1,
          ec.fidelity * truncateFidelityScale(ec),
          ec.confidence + 0.18,
          rng,
          ec.direction,
        );
      }
      rec.event('echo-truncated');
      if (ec.ringsDone <= 1 && ec.paidNoise >= 8 && remaining >= 3) {
        rec.mistake(
          'truncate-waste',
          `${ec.paidNoise.toFixed(0)} 点噪音已经出去了，才听到第 ${ec.ringsDone} 圈就把剩下 ${remaining} 圈打折收了`,
        );
      }
      p.pending = null;
      return { id: 'sonar:echo-truncate', options, time: 1, oxyBreaths: 1, held: false };
    }
    case 'steer': {
      st.steers++;
      ec.direction = steerTo;
      ec.fidelity = Math.max(0.2, ec.fidelity - 0.1);
      rec.event('echo-steered');
      if (st.steers >= 2) {
        rec.mistake('steer-churn', '同一记回波来回改指向，前面几圈全落在最后没人要的扇区里');
      }
      return { id: 'sonar:echo-steer', options, time: 1, oxyBreaths: 1, held: false };
    }
    case 'hug': {
      // 这一圈从身边洗过去了，没人在听
      ec.ringsDone++;
      /*
       * 放弃的那一圈正从身边洗过去，而你的耳朵就贴在它经过的那块板上。
       * 氧气罐是这条船里最硬的东西之一，这是整局里分辨嘶声最好的一拍 ——
       * 也是唯一一条只有绝境里才值得走的补给通道：任何时候贴壁都要扔掉一圈回波。
       * 波前扫过的那一圈和它前面那一圈都算数：你听的是整个正在经过的波前。
       */
      let found = revealRingTargets(p, w, ec.origin, ec.ringsDone, ec.direction, 0.6, rng);
      found += revealRingTargets(p, w, ec.origin, ec.ringsDone + 1, ec.direction, 0.45, rng);
      if (found > 0) rec.event('cache-heard');
      if (hidden) {
        p.hunterAwareness = Math.max(0, p.hunterAwareness - 0.25);
      } else {
        /*
         * 贴着一面正在嗡响的壳藏起来，藏的是耳朵不是自己：
         * 壳板把你按在它身上的那点动静一并送了出去，而且送的是一个准确的位置。
         * 时机错了的贴壁不是白花一拍，是把自己递过去 —— 这是这个选项的错误一侧。
         */
        p.hunterAwareness = Math.min(1, p.hunterAwareness + 0.2);
        if (p.hunter >= 0) p.hunterTarget = p.at;
        rec.mistake('hug-on-ringing-hull', '在自己刚吵响的舱室里贴壁，壳板把动静连同位置一并送了出去');
      }
      rec.event('hull-hug');
      if (ec.ringsDone >= ec.rings) {
        rec.event('echo-completed');
        p.pending = null;
      }
      return {
        id: 'sonar:echo-hug',
        options,
        time: 1,
        oxyBreaths: 0,
        held: true,
        quiet: true,
        hearBonus: 0.45,
        hearRange: 7,
      };
    }
    case 'hold': {
      solveRing(ctx, ec, rec, true);
      return { id: 'sonar:echo-hold', options, time: len, oxyBreaths: 0, held: true };
    }
    default: {
      solveRing(ctx, ec, rec, false);
      return { id: 'sonar:echo-listen', options, time: len, oxyBreaths: len, held: false };
    }
  }
}

/**
 * 解算一圈。
 *
 * 两件事跟锁死承诺不同：
 *  - 保真度按拍号补偿，所以多站一拍换到的是**更清楚**的一圈，不只是更远的一圈；
 *  - 这一圈什么都没照到的时候，返回的不是"什么都没有"，而是一句真话：这边是空的。
 */
function solveRing(ctx: DecisionContext, ec: PendingEcho, rec: TrialRecorder, held: boolean): void {
  const { p, w, rng, elapsed } = ctx;
  ec.ringsDone++;
  const fidelity = ec.fidelity + (held ? 0.2 : 0) + RING_GAIN * (ec.ringsDone - 1);
  const confidence = Math.max(0, ec.confidence - (held ? 0.12 : 0));
  const gained = revealRing(p, w, ec.origin, ec.ringsDone, fidelity, confidence, rng, ec.direction);
  /*
   * 先问"这一圈有没有硬目标"，再决定它是不是一圈空回波 ——
   * 没有"有目标"这个返回值，"确认为空"就只是给空手而归换了个说法。
   *
   * 概率压得很低（0.12 而不是 0.38）是有意的：试过把它开大，氧气变得随手可得，
   * 结果是所有人都活得更久、也更少跌进危局，**恢复余地反而从 0.372 掉到 0.088**。
   * 翻盘不是靠补给充裕买来的，是靠"稀缺 + 一条只有绝境里才值得走的路"买来的。
   * 那条路是贴壁，不是这里。
   */
  const heard = revealRingTargets(
    p,
    w,
    ec.origin,
    ec.ringsDone,
    ec.direction,
    fidelity * 0.12,
    rng,
  );
  if (heard > 0) rec.event('cache-heard');
  if (gained === 0 && heard === 0) {
    /*
     * 否定信息。
     *
     * 一圈回波什么都没带回来，在物理上不是失败：它说的是"这个方向上没有东西"。
     * 空回波之所以在上一轮变成每百死 558 次的无用功，不是因为它常发生，
     * 是因为它的返回值不落在任何一个玩家能用的地方。写进信念图之后，
     * 它改的是导航：排除过的扇区不再吸引探索，玩家的下一步自动转向还没排除的那一边。
     */
    const marked = markSectorClear(p, w, ec.origin, ec.ringsDone, ec.direction, elapsed + CLEAR_TTL);
    if (marked > 0) rec.event('sector-cleared');
  }
  if (ec.ringsDone >= ec.rings) {
    rec.event('echo-completed');
    p.pending = null;
  }
}

const REDEEMABLE_BEAT_SPECS: ActionSpec[] = [
  {
    id: 'sonar:echo-listen',
    kind: 'beat',
    attrs: { 起手呼吸: '1.00', 噪音: '0.00', 半径: '—', 保真度: '按拍号 +0.055/圈', 僵直拍: '消耗 1 拍', 主瓣: '—', 附加区间宽度: '0.00' },
  },
  {
    id: 'sonar:echo-hold',
    kind: 'beat',
    attrs: { 起手呼吸: '0.00', 噪音: '0.00', 半径: '—', 保真度: '+0.20', 僵直拍: '消耗 1 拍', 主瓣: '—', 附加区间宽度: '-0.12' },
  },
  {
    id: 'sonar:echo-press',
    kind: 'beat',
    attrs: { 起手呼吸: '2.00', 噪音: '4.00', 半径: '+1', 保真度: '按拍号 +0.055/圈', 僵直拍: '+1 拍', 主瓣: '—', 附加区间宽度: '-0.04' },
  },
  {
    id: 'sonar:echo-truncate',
    kind: 'beat',
    attrs: { 起手呼吸: '1.00', 噪音: '0.00', 半径: '剩余 2 圈', 保真度: '×0.50', 僵直拍: '清空', 主瓣: '—', 附加区间宽度: '+0.18' },
  },
  {
    id: 'sonar:echo-steer',
    kind: 'beat',
    attrs: { 起手呼吸: '1.00', 噪音: '0.00', 半径: '—', 保真度: '-0.10', 僵直拍: '消耗 1 拍', 主瓣: '改向', 附加区间宽度: '0.00' },
  },
  {
    id: 'sonar:echo-hug',
    kind: 'beat',
    attrs: { 起手呼吸: '0.00', 噪音: '不计底噪', 半径: '丢 1 圈', 保真度: '—', 僵直拍: '消耗 1 拍', 主瓣: '—', 附加区间宽度: '—' },
  },
];

const redeemableMechanic: SensingMechanic = {
  options: commitModes,
  apply(opt, ctx) {
    reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng, opt.direction);
  },
  utility: senseUtility,
  beat: redeemableBeat,
  catalog: () => [...MODE_SPECS, ...REDEEMABLE_BEAT_SPECS],
};

// ---------------------------------------------------------------------------
// 注册
// ---------------------------------------------------------------------------

function makeVariant(
  id: string,
  name: string,
  thesis: string,
  mech: SensingMechanic,
): MechanicVariant {
  return {
    id,
    name,
    thesis,
    run(rng, skill) {
      // 世界用独立子流生成：两个变体面对的是**同一批**世界与同一个威胁模型
      return runTrial(
        buildWorld(rng.fork('world')),
        mech,
        rng.fork('play'),
        skill,
        disturbanceThreat,
      );
    },
    catalog: () => mech.catalog(),
  };
}

registerSlot({
  slot: 'sonar4',
  question:
    '噪音已经付出去、人已经钉在原地之后，这几拍应当是一把只能等到底或者全盘作废的锁，还是一局每拍都可以部分赎回的赌？',
  variants: [
    makeVariant(
      'sonar4-locked',
      '锁死承诺（上一轮基线，原样）',
      '僵直期只有继续听、屏息听、全盘作废三条路。空回波返回"什么都没有"。',
      lockedMechanic,
    ),
    makeVariant(
      'sonar4-redeemable',
      '可赎回承诺',
      '僵直期每一拍是六选一：继续听 / 屏息听 / 续压 / 截断取半 / 转向主瓣 / 贴壁。' +
        '空回波返回带时效的"该扇区确认为空"并改写导航；风险在第三拍封顶，回波质量继续随拍数上升。',
      redeemableMechanic,
    ),
  ],
});
