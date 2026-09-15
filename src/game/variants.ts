import type { Rng } from '@/core/contract';

/**
 * 机制变体注册表 —— 盲测基础设施。
 *
 * 设计意图：判断"哪套机制更好"不能靠设计者自述，因为提出者总会偏爱自己的方案。
 * 所以任何有争议的机制都必须以**两个可同时运行的实现**存在，
 * 由 tools/blind-ab.ts 跑出匿名化报告，再交给不知道哪个是哪个的评审判定。
 *
 * 一个变体不是"参数不同"，而是"玩家要做的决策不同"。
 * 只改数值的对比请用 tools/balance-sim.ts，不要占用这里。
 */

/** 评判一套机制好坏的量化维度。分数一律归一化到 0..1，越高越好。 */
export interface MechanicMetrics {
  /** 决策熵：玩家在同一局面下实际会选择的行动的多样性。过低=有统治性解法 */
  decisionEntropy: number;
  /** 技巧表达度：强策略与弱策略的结果差距。过低=玩得好没用 */
  skillExpression: number;
  /** 张力曲线质量：是否有起伏，而不是一条直线或一路暴涨 */
  tensionShape: number;
  /** 意外率：单位时间内发生玩家未预期事件的频率，过高会变噪音 */
  surprise: number;
  /** 可学习性：第 N 次游玩相比第 1 次的表现提升幅度 */
  learnability: number;
  /** 决策密度：单位时间里玩家需要做的有意义选择数 */
  decisionDensity: number;
  /** 失败可归因性：玩家死亡时能否说清"我哪步错了" */
  attributability: number;
  /** 恢复余地：陷入劣势后靠好的操作翻盘的可能性 */
  comeback: number;
}

export const METRIC_LABELS: Record<keyof MechanicMetrics, string> = {
  decisionEntropy: '决策熵',
  skillExpression: '技巧表达度',
  tensionShape: '张力曲线',
  surprise: '意外率',
  learnability: '可学习性',
  decisionDensity: '决策密度',
  attributability: '失败可归因',
  comeback: '恢复余地',
};

/**
 * 加权总分。权重本身就是设计立场的声明：
 * 本作把"技巧表达度"和"失败可归因"排在最前，因为一款靠运气杀你、
 * 且让你不明白为什么死的恐怖游戏，只会让玩家愤怒而不是恐惧。
 */
export const METRIC_WEIGHTS: Record<keyof MechanicMetrics, number> = {
  skillExpression: 1.35,
  attributability: 1.3,
  decisionEntropy: 1.2,
  tensionShape: 1.1,
  decisionDensity: 0.95,
  learnability: 0.9,
  comeback: 0.75,
  surprise: 0.7,
};

export function scoreMetrics(m: MechanicMetrics): number {
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(METRIC_WEIGHTS) as (keyof MechanicMetrics)[]) {
    sum += m[k] * METRIC_WEIGHTS[k];
    wsum += METRIC_WEIGHTS[k];
  }
  return sum / wsum;
}

/** 一次模拟产出的原始轨迹，指标由它推导而来 */
export interface TrialTrace {
  /** 每个决策点上，玩家（策略原型）实际可选的行动数与最终选择 */
  decisions: { options: number; chosen: string }[];
  /** 逐时间片的张力采样 0..1 */
  tension: number[];
  /** 玩家未预期事件发生的时间点 */
  surprises: number[];
  /** 本局是否存活 */
  survived: boolean;
  /** 存活时长（呼吸数） */
  duration: number;
  /** 死亡原因，'' 表示存活 */
  cause: string;
  /** 死亡前 5 个决策是否包含一个"明显的错误"（可归因性的来源） */
  hadIdentifiableMistake: boolean;
  /** 本局中曾陷入劣势（任一关键资源 < 20%）后又恢复到 > 50% */
  recovered: boolean;
  /** 曾陷入劣势（用于计算恢复率的分母） */
  wasBehind: boolean;
}

export interface MechanicVariant {
  id: string;
  /** 只在揭晓时使用，盲测过程中不得出现在报告里 */
  name: string;
  /** 这个变体让玩家做的决策是什么 —— 一句话 */
  thesis: string;
  /**
   * 跑一局。策略原型 skill 从 0（乱玩）到 1（最优解），
   * 用来测量技巧表达度；同一 skill 下多次运行测量方差。
   */
  run(rng: Rng, skill: number): TrialTrace;
}

/** 一组待比较的变体。同一 slot 下的变体互斥，只有一个会进入最终游戏。 */
export interface VariantSlot {
  slot: string;
  question: string;
  variants: MechanicVariant[];
}

const registry = new Map<string, VariantSlot>();

export function registerSlot(slot: VariantSlot): void {
  if (registry.has(slot.slot)) {
    throw new Error(`[variants] slot "${slot.slot}" 重复注册`);
  }
  if (slot.variants.length < 2) {
    throw new Error(`[variants] slot "${slot.slot}" 至少需要两个变体才能盲测`);
  }
  registry.set(slot.slot, slot);
}

export function allSlots(): VariantSlot[] {
  return [...registry.values()];
}

export function getSlot(id: string): VariantSlot | undefined {
  return registry.get(id);
}

// ============================================================================
// 由轨迹推导指标
// ============================================================================

export function deriveMetrics(traces: readonly TrialTrace[]): MechanicMetrics {
  if (traces.length === 0) throw new Error('[variants] 没有轨迹可供分析');

  return {
    decisionEntropy: computeDecisionEntropy(traces),
    skillExpression: computeSkillExpression(traces),
    tensionShape: computeTensionShape(traces),
    surprise: computeSurprise(traces),
    learnability: computeLearnability(traces),
    decisionDensity: computeDecisionDensity(traces),
    attributability: computeAttributability(traces),
    comeback: computeComeback(traces),
  };
}

/**
 * 香农熵，按选择的行动归一化到该局面下的最大可能熵。
 * 这是检测"统治性解法"最直接的手段：只要有一个行动被压倒性地选，熵就塌了。
 */
function computeDecisionEntropy(traces: readonly TrialTrace[]): number {
  const counts = new Map<string, number>();
  let total = 0;
  let optionSum = 0;
  for (const t of traces) {
    for (const d of t.decisions) {
      counts.set(d.chosen, (counts.get(d.chosen) ?? 0) + 1);
      optionSum += d.options;
      total++;
    }
  }
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  const avgOptions = Math.max(2, optionSum / total);
  return Math.min(1, h / Math.log2(avgOptions));
}

/** 高技巧组与低技巧组的存活率差。差距越大，说明玩得好越有回报。 */
function computeSkillExpression(traces: readonly TrialTrace[]): number {
  // 轨迹按 skill 分箱由调用方保证顺序：前 1/3 低技巧，后 1/3 高技巧
  const n = traces.length;
  const lo = traces.slice(0, Math.floor(n / 3));
  const hi = traces.slice(Math.ceil((n * 2) / 3));
  if (lo.length === 0 || hi.length === 0) return 0;
  const loRate = lo.filter((t) => t.survived).length / lo.length;
  const hiRate = hi.filter((t) => t.survived).length / hi.length;
  const loDur = lo.reduce((s, t) => s + t.duration, 0) / lo.length;
  const hiDur = hi.reduce((s, t) => s + t.duration, 0) / hi.length;
  const rateGap = Math.max(0, hiRate - loRate);
  const durGap = loDur > 0 ? Math.max(0, (hiDur - loDur) / loDur) : 0;
  // 存活率差 0.45 或时长提升 90% 即视为满分；两者取加权
  return Math.min(1, (rateGap / 0.45) * 0.65 + Math.min(1, durGap / 0.9) * 0.35);
}

/**
 * 好的张力曲线有起有伏。用一阶差分的符号变化次数衡量"有没有喘息"，
 * 再用整体方差惩罚"一条直线"。
 */
function computeTensionShape(traces: readonly TrialTrace[]): number {
  let scoreSum = 0;
  let counted = 0;
  for (const t of traces) {
    if (t.tension.length < 8) continue;
    let flips = 0;
    let prevSign = 0;
    let mean = 0;
    for (const v of t.tension) mean += v;
    mean /= t.tension.length;
    let variance = 0;
    for (let i = 1; i < t.tension.length; i++) {
      const d = t.tension[i] - t.tension[i - 1];
      const sign = d > 0.012 ? 1 : d < -0.012 ? -1 : 0;
      if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips++;
      if (sign !== 0) prevSign = sign;
      variance += (t.tension[i] - mean) ** 2;
    }
    variance /= t.tension.length;
    // 每 12 个采样点有一次方向反转是理想节奏
    const idealFlips = t.tension.length / 12;
    const flipScore = 1 - Math.min(1, Math.abs(flips - idealFlips) / Math.max(1, idealFlips));
    const varScore = Math.min(1, variance / 0.045);
    scoreSum += flipScore * 0.6 + varScore * 0.4;
    counted++;
  }
  return counted > 0 ? scoreSum / counted : 0;
}

/** 意外率的理想区间是每 100 呼吸 1.5–4 次；太少无聊，太多变噪音。 */
function computeSurprise(traces: readonly TrialTrace[]): number {
  let rateSum = 0;
  let counted = 0;
  for (const t of traces) {
    if (t.duration <= 0) continue;
    rateSum += (t.surprises.length / t.duration) * 100;
    counted++;
  }
  if (counted === 0) return 0;
  const rate = rateSum / counted;
  if (rate >= 1.5 && rate <= 4) return 1;
  if (rate < 1.5) return Math.max(0, rate / 1.5);
  return Math.max(0, 1 - (rate - 4) / 6);
}

/** 用中等技巧到高技巧之间的提升斜率近似"可学习性" */
function computeLearnability(traces: readonly TrialTrace[]): number {
  const n = traces.length;
  const mid = traces.slice(Math.floor(n / 3), Math.ceil((n * 2) / 3));
  const hi = traces.slice(Math.ceil((n * 2) / 3));
  if (mid.length === 0 || hi.length === 0) return 0;
  const m = mid.reduce((s, t) => s + t.duration, 0) / mid.length;
  const h = hi.reduce((s, t) => s + t.duration, 0) / hi.length;
  if (m <= 0) return 0;
  return Math.min(1, Math.max(0, (h - m) / m / 0.55));
}

/**
 * 只统计**真正的岔路** —— 可选项 ≤ 2 的局面（走廊尽头只能前进）不算决策。
 * 把它们算进来会让任何线性关卡看起来都决策密集。
 */
function computeDecisionDensity(traces: readonly TrialTrace[]): number {
  let sum = 0;
  let counted = 0;
  for (const t of traces) {
    if (t.duration <= 0) continue;
    const meaningful = t.decisions.filter((d) => d.options > 2).length;
    sum += (meaningful / t.duration) * 100;
    counted++;
  }
  if (counted === 0) return 0;
  const per100 = sum / counted;
  // 每 100 呼吸 12–38 个有意义决策是舒适区（一次移动 2 呼吸，所以基线就不低）
  if (per100 >= 12 && per100 <= 38) return 1;
  if (per100 < 12) return per100 / 12;
  return Math.max(0, 1 - (per100 - 38) / 34);
}

function computeAttributability(traces: readonly TrialTrace[]): number {
  const deaths = traces.filter((t) => !t.survived);
  if (deaths.length === 0) return 0.5;
  return deaths.filter((t) => t.hadIdentifiableMistake).length / deaths.length;
}

function computeComeback(traces: readonly TrialTrace[]): number {
  const behind = traces.filter((t) => t.wasBehind);
  if (behind.length === 0) return 0;
  const rate = behind.filter((t) => t.recovered).length / behind.length;
  // 翻盘率的理想区间是 15%–40%：太低则劣势即死刑，太高则劣势没有分量
  if (rate >= 0.15 && rate <= 0.4) return 1;
  if (rate < 0.15) return rate / 0.15;
  return Math.max(0, 1 - (rate - 0.4) / 0.45);
}
