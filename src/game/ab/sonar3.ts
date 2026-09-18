import { registerSlot, type MechanicVariant } from '../variants';
import {
  BENCH,
  buildWorld,
  disturbanceThreat,
  hops,
  lobeDeficit,
  parallaxGain,
  reveal,
  runTrial,
  senseOption,
  HYPOXIA_LIMIT,
  MASK_FACTOR,
  SUMMON_THRESHOLD,
  type ActionSpec,
  type DecisionContext,
  type SenseOption,
  type SensingMechanic,
  type SimPlayer,
  type SimWorld,
} from './model';

/**
 * 盲测 #3：声呐该是一个动作，还是三拍？
 *
 * 第一轮（qa/ab/sonar-verdict.md）判定：三档离散胜，连续蓄力淘汰，
 * 但胜者只是一副能用的骨架 —— 两个变体在八项指标里有五项几乎相同，
 * 因为它们是"同一套机制的两种分辨率"：都是"花 N 口气 + M 点噪音，
 * 买一个半径 R、保真度 F 的信息包"。那是**采购决策**，不是战术决策。
 *
 * 这一轮比较的是两种**形态**，价格前沿被刻意对齐：
 *
 *   即时三档  = 判定书第五节改造后的乙。按下就拿到信息。
 *   三拍承诺  = 判定书第七节的方案丙。发声（噪音立即全额付清、不返回任何信息）
 *              → 僵直（回波按距离分批返回，必须站着不动，可中途放弃但已付噪音是沉没成本）
 *              → 解算。外加 7.3 的双向声呐：定向诱敌、照射致聋。
 *
 * 两者共用同一个 `senseUtility`、同一个玩家大脑、同一批世界、同一个威胁模型。
 * 唯一的差异是选项表的**形态参数**（commitTurns / direction / confidence），
 * 而这正是上一台实验机在结构上无法比较的那一维。
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
   * 没有这一项的时候，一记 28 噪音的脉冲的风险只被估成 2.4，
   * 于是玩家会连着放，噪音一路堆到召唤线 —— 实测九成的死亡都是听者。
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

  // 僵直风险：站着不动的每一拍都乘上"我读到它有多近"。这是方案丙的核心代价
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

/** 僵直期那三个附属拍的目录项。它们没有档位属性，只有代价 */
const BEAT_SPECS: ActionSpec[] = [
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

// ---------------------------------------------------------------------------
// 变体 1：即时三档（判定书第五节改造后的乙）
// ---------------------------------------------------------------------------

/**
 * 三档离散保持不变，但按提案 1 补上两条：
 *
 *  - **没有零噪音档**。被动聆听的噪音是 `2 × (1 + fear/100)`，
 *    恐惧越高越藏不住。旧版那个 noise = 0 的档位占了 82.7% 的感知行动，
 *    等于"看即是发声"这个核心命题有 83% 的时间不成立。
 *  - 保真度不再撒谎，而是返回一个宽度可见的区间（`confidence` 是附加宽度）。
 *
 * 形态上它仍然是"按下就拿到信息"：commitTurns 全为 0。这正是被测的那一维。
 */
function instantModes(ctx: DecisionContext): SenseOption[] {
  const fearMul = 1 + ctx.p.fear / 100;
  return [
    senseOption({
      id: 'sonar:passive',
      breaths: 2,
      noise: 2 * fearMul,
      radius: 1,
      fidelity: 0.35,
      confidence: 0.12,
    }),
    senseOption({ id: 'sonar:chirp', breaths: 4, noise: 9, radius: 3, fidelity: 0.8, confidence: 0.04 }),
    senseOption({ id: 'sonar:boom', breaths: 7, noise: 28, radius: 7, fidelity: 0.98 }),
  ];
}

const instantMechanic: SensingMechanic = {
  options: instantModes,
  apply(opt, ctx) {
    reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng, opt.direction);
  },
  utility: senseUtility,
  catalog: () =>
    instantModes({ p: { fear: 0 } as SimPlayer } as DecisionContext).map(describe),
};

// ---------------------------------------------------------------------------
// 变体 2：三拍承诺（判定书第七节的方案丙）
// ---------------------------------------------------------------------------

/**
 * 一次声呐不再是一个动作，而是三拍：
 *
 *   ① 发声  选功率与方向，按下。噪音**立即**全额产生，**不返回任何信息**。1 呼吸。
 *   ② 僵直  回波按距离分批返回：第 r 跳的回声在第 r 个呼吸到达。
 *          必须保持静止才听得清 —— 移动的噪音会盖掉那一圈，**永久丢失**。
 *          每一拍都可以改成屏息（不耗氧、保真度 +0.2）或者干脆打断。
 *   ③ 解算  收到的回波写成区间信念，可被后续不同位置的脉冲验证。
 *
 * 一记全功率 = 1 口气发声 + 7 口气站在原地不动，而那 26 点噪音在第一拍就已经出去了。
 * GDD §4.3 写的"玩家有 8–20 个呼吸的窗口逃离或隐藏"从一句演出说明变成了机制本身：
 * 那个窗口就是僵直期，而你是自愿站进去的。
 *
 * 价格前沿与即时三档对齐（总呼吸 + 噪音×0.25 大致相等），
 * 所以两者的差别只来自"什么时候付、付了能不能反悔、朝哪儿付"。
 */
const COMMIT_BASE = [
  { key: 'low', radius: 1, noise: 2, fidelity: 0.42, confidence: 0.1 },
  { key: 'mid', radius: 3, noise: 9, fidelity: 0.82, confidence: 0.03 },
  { key: 'high', radius: 7, noise: 26, fidelity: 0.98, confidence: 0 },
];

/**
 * 主瓣只能朝**已知的相邻舱段**发（7.5 缓解措施 ③：不允许朝未知方向发，
 * 否则在全黑的图上选方向会超出人的心智地图能力）。
 *
 * 两个候选方向对应 7.3 的两种用法：
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

const commitMechanic: SensingMechanic = {
  options: commitModes,
  // commitTurns 全部 > 0，所以这条即时解算路径不会被走到；留着是为了接口完整
  apply(opt, ctx) {
    reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng, opt.direction);
  },
  utility: senseUtility,
  catalog: () => [
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
    ...BEAT_SPECS,
  ],
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
  slot: 'sonar3',
  question:
    '声呐应当是"按下就拿到信息"的三档离散，还是"发声—僵直—回波"的三拍承诺（含定向诱敌与照射致聋）？',
  variants: [
    makeVariant(
      'sonar-instant3',
      '即时三档（改造后的乙）',
      '被动/短脉冲/全功率三个可命名的工具，按下立刻拿到一组宽度可见的区间读数。噪音与信息同时结算。',
      instantMechanic,
    ),
    makeVariant(
      'sonar-commit3',
      '三拍承诺（方案丙）',
      '噪音先全额付清且不返回信息，回波按距离逐圈返回、必须站着不动才听得清，可中途放弃。' +
        '主瓣可以朝一个已知舱段发，把声音扔到别处去，或者把听者照聋。',
      commitMechanic,
    ),
  ],
});
