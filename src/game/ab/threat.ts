import { registerSlot, type MechanicVariant } from '../variants';
import {
  buildWorld,
  gradientThreat,
  reveal,
  runTrial,
  senseOption,
  thresholdThreat,
  type ActionSpec,
  type DecisionContext,
  type SenseOption,
  type SensingMechanic,
  type ThreatModel,
} from './model';

/**
 * 盲测 #2：外面的东西该如何逼近你？
 *
 * 第一轮盲测暴露出两个方案共同的低分项：**技巧表达度**与**失败可归因性**。
 * 那两项低，根因很可能不在声呐，而在威胁模型 —— 如果玩家读不到威胁在哪，
 * 那么再精妙的感知取舍也无处施展，死亡也永远说不清是谁的错。
 *
 * 所以这一轮固定声呐（用三档离散），只替换威胁模型。
 */

// 固定变量：两个变体使用完全相同的声呐机制
const FIXED_SONAR: SenseOption[] = [
  senseOption({ id: 'sonar:passive', breaths: 2, noise: 0, radius: 1, fidelity: 0.35 }),
  senseOption({ id: 'sonar:chirp', breaths: 4, noise: 9, radius: 3, fidelity: 0.8 }),
  senseOption({ id: 'sonar:boom', breaths: 7, noise: 28, radius: 7, fidelity: 0.98 }),
];

function senseUtility(o: SenseOption, ctx: DecisionContext): number {
  const { p, skill, rng, infoDeficit, oxyFrac, hunterNear } = ctx;
  const reach = Math.min(infoDeficit, o.radius * 2.1);
  const infoGain = reach * o.fidelity * (p.knowsExit ? 0.55 : 1.15);
  const noiseRisk =
    o.noise * (hunterNear ? 0.26 : Math.max(0, ctx.threatReadout) * 0.2 + 0.062) * (0.35 + skill * 1.55);
  const breathCost = o.breaths * (0.3 + (1 - oxyFrac) * 1.5) * (0.4 + skill * 1.05);
  const bias = (1 - skill) * o.radius * 0.38;
  return infoGain - noiseRisk - breathCost + bias + rng.float(0, 1.5 * (1 - skill) + 0.1);
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

const fixedMechanic: SensingMechanic = {
  options: () => FIXED_SONAR,
  apply(opt, ctx) {
    reveal(ctx.p, ctx.w, ctx.p.at, opt.radius, opt.fidelity, opt.confidence, ctx.rng);
  },
  utility: senseUtility,
  catalog: () => FIXED_SONAR.map(describe),
};

function makeVariant(id: string, name: string, thesis: string, threat: ThreatModel): MechanicVariant {
  return {
    id,
    name,
    thesis,
    run(rng, skill) {
      return runTrial(buildWorld(rng.fork('world')), fixedMechanic, rng.fork('play'), skill, threat);
    },
    catalog: () => fixedMechanic.catalog(),
  };
}

registerSlot({
  slot: 'threat',
  question: '威胁应当是「噪音过线后被召唤」，还是「一根始终在收紧、且始终可读的绳子」？',
  variants: [
    makeVariant(
      'threat-threshold',
      '阈值召唤',
      '噪音累计过线，它才出现。在那之前玩家得不到任何余量反馈 —— 安静与死亡之间是二值跳变。',
      thresholdThreat,
    ),
    makeVariant(
      'threat-gradient',
      '连续逼近',
      '没有召唤事件。噪音持续喂养它的存在感，而它与你的距离始终对玩家可读。',
      gradientThreat,
    ),
  ],
});
