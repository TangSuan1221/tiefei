import { registerSlot, type MechanicVariant } from '../variants';
import {
  buildWorld,
  runTrial,
  reveal,
  type DecisionContext,
  type SenseOption,
  type SensingMechanic,
} from './model';

/**
 * 盲测 #1：声呐该怎么设计？
 *
 * 这是本作的招牌机制，也是唯一一个"做错了整个游戏就塌了"的地方，
 * 所以它必须被实验，而不是被论证。
 *
 * 两个变体的**决策纹理**完全不同：
 *   A = 在三个离散档位之间取舍（像选武器：可命名、可背诵、可形成肌肉记忆）
 *   B = 蓄力到任意功率再释放（像拉弓：最优点随局面移动，没有可背诵的答案）
 * 两者的"效率前沿"被刻意对齐，让差异只来自决策形态本身。
 */

// ---------------------------------------------------------------------------
// 变体 A：三档离散模式（GDD §4.4 的原始设计）
// ---------------------------------------------------------------------------

const DISCRETE_MODES: SenseOption[] = [
  { id: 'sonar:passive', breaths: 2, noise: 0, radius: 1, fidelity: 0.35 },
  { id: 'sonar:chirp', breaths: 4, noise: 9, radius: 3, fidelity: 0.8 },
  { id: 'sonar:boom', breaths: 7, noise: 28, radius: 7, fidelity: 0.98 },
];

// ---------------------------------------------------------------------------
// 变体 B：连续蓄力释放
// ---------------------------------------------------------------------------

/**
 * 蓄力在模拟里离散成 8 级来表示"玩家松手的时机"，但玩家面对的是一条连续曲线。
 * 关键：噪音随功率**超线性**增长而射程只是线性 —— 于是最优释放点取决于局面。
 */
const CHARGE_LEVELS: SenseOption[] = Array.from({ length: 8 }, (_, i) => {
  const t = (i + 1) / 8;
  return {
    id: `sonar:charge${i + 1}`,
    breaths: 1.5 + t * 6,
    noise: Math.pow(t, 1.75) * 31,
    radius: Math.max(1, Math.round(t * 7)),
    fidelity: 0.3 + t * 0.68,
  };
});

// ---------------------------------------------------------------------------
// 共用的效用函数 —— 两个变体用同一个玩家大脑
// ---------------------------------------------------------------------------

function senseUtility(o: SenseOption, ctx: DecisionContext): number {
  const { p, skill, rng, unknownNearby, oxyFrac, hunterNear } = ctx;

  // 信息价值：照到的未知房间越多越值，但周围已经摸清了就没用
  const reach = Math.min(unknownNearby, o.radius * 2.1);
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
    apply(opt, p, w, rng) {
      reveal(p, w, p.at, opt.radius, opt.fidelity, rng);
    },
    utility: senseUtility,
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
