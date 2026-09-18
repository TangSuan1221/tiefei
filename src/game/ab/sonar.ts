import { registerSlot, type MechanicVariant } from '../variants';
import {
  buildWorld,
  runTrial,
  reveal,
  senseOption,
  type ActionSpec,
  type DecisionContext,
  type SenseOption,
  type SensingMechanic,
} from './model';

/**
 * 盲测 #1：声呐该怎么设计？—— **已判定，见 qa/ab/sonar-verdict.md**
 *
 * 结论：选乙（三档离散），淘汰甲（连续蓄力），且甲不必保留任何部分。
 * 这个 slot 保留在这里只作为历史记录与回归基线；改造后的乙在 sonar3.ts 里
 * 与方案丙并排重测。
 *
 * 判定书同时证伪了当时的实验台本身（附录五条），所以**这两个变体现在的数字
 * 与 qa/ab/sonar-report.md 不可比** —— 它们跑在重建后的噪音场、区间信念与
 * 归因台账上。要做"改造前 vs 改造后"的比较，请用 model.ts 的 BENCH 开关做消融，
 * 而不是拿这里的新数字对旧报告。
 */

// ---------------------------------------------------------------------------
// 变体 A：三档离散模式（GDD §4.4 的原始设计）
// ---------------------------------------------------------------------------

const DISCRETE_MODES: SenseOption[] = [
  senseOption({ id: 'sonar:passive', breaths: 2, noise: 0, radius: 1, fidelity: 0.35 }),
  senseOption({ id: 'sonar:chirp', breaths: 4, noise: 9, radius: 3, fidelity: 0.8 }),
  senseOption({ id: 'sonar:boom', breaths: 7, noise: 28, radius: 7, fidelity: 0.98 }),
];

// ---------------------------------------------------------------------------
// 变体 B：连续蓄力释放
// ---------------------------------------------------------------------------

/**
 * 蓄力在模拟里离散成 8 级来表示"玩家松手的时机"，但玩家面对的是一条连续曲线。
 * 当时的赌注是：噪音随功率**超线性**增长而射程只是线性 —— 于是最优释放点取决于局面。
 * 判定书第三节证明这个赌注输了：`reach` 被局部拓扑钳死，收益封顶而成本发散，
 * 最优点被钉在低端，是一个几乎与局面无关的常数。
 */
const CHARGE_LEVELS: SenseOption[] = Array.from({ length: 8 }, (_, i) => {
  const t = (i + 1) / 8;
  return senseOption({
    id: `sonar:charge${i + 1}`,
    breaths: 1.5 + t * 6,
    noise: Math.pow(t, 1.75) * 31,
    radius: Math.max(1, Math.round(t * 7)),
    fidelity: 0.3 + t * 0.68,
  });
});

// ---------------------------------------------------------------------------
// 共用的效用函数 —— 两个变体用同一个玩家大脑
// ---------------------------------------------------------------------------

function senseUtility(o: SenseOption, ctx: DecisionContext): number {
  const { p, skill, rng, infoDeficit, oxyFrac, hunterNear } = ctx;

  // 信息价值：照到的信息赤字越多越值，但周围已经摸清了就没用
  const reach = Math.min(infoDeficit, o.radius * 2.1);
  const infoGain = reach * o.fidelity * (p.knowsExit ? 0.55 : 1.15);

  // 噪音风险：被追击时噪音的边际代价陡增
  const noiseRisk =
    o.noise * (hunterNear ? 0.26 : p.hunter >= 0 ? 0.15 : 0.062) * (0.35 + skill * 1.55);

  // 氧气代价：越少越贵
  const breathCost = o.breaths * (0.3 + (1 - oxyFrac) * 1.5) * (0.4 + skill * 1.05);

  // 低技巧玩家的认知偏差：高估大功率的好处，低估噪音
  const bias = (1 - skill) * o.radius * 0.38;

  return infoGain - noiseRisk - breathCost + bias + rng.float(0, 1.5 * (1 - skill) + 0.1);
}

function makeMechanic(modes: SenseOption[]): SensingMechanic {
  return {
    options: () => modes,
    apply(opt, ctx) {
      reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng);
    },
    utility: senseUtility,
    catalog: () => modes.map(describe),
  };
}

function describe(o: SenseOption): ActionSpec {
  return {
    id: o.id,
    kind: 'mode',
    attrs: {
      呼吸: o.breaths.toFixed(2),
      噪音: o.noise.toFixed(2),
      半径: String(o.radius),
      保真度: o.fidelity.toFixed(3),
      僵直拍: String(o.commitTurns),
      主瓣: o.direction >= 0 ? '定向' : '全向',
      附加区间宽度: o.confidence.toFixed(2),
    },
  };
}

function makeVariant(id: string, name: string, thesis: string, modes: SenseOption[]): MechanicVariant {
  const mech = makeMechanic(modes);
  return {
    id,
    name,
    thesis,
    run(rng, skill) {
      // 世界用独立子流生成：两个变体面对的是**同一批**世界
      return runTrial(buildWorld(rng.fork('world')), mech, rng.fork('play'), skill);
    },
    catalog: () => mech.catalog(),
  };
}

registerSlot({
  slot: 'sonar',
  question: '声呐应当是三档离散模式，还是连续蓄力释放？',
  variants: [
    makeVariant(
      'sonar-discrete',
      '三档离散模式',
      '玩家在被动/短脉冲/全功率之间取舍，每一档是一个可以被命名、被记住的工具。',
      DISCRETE_MODES,
    ),
    makeVariant(
      'sonar-charge',
      '连续蓄力释放',
      '玩家自行决定何时松手，最优功率随局面移动，没有可背诵的答案。',
      CHARGE_LEVELS,
    ),
  ],
});
