/**
 * 《铁肺迷城》— 生理模拟调参中心 (Agent A)
 * ============================================================
 * 全部魔数集中在这里。规则：
 *   1. 任何出现在 vitals/veracity/director 里的裸数字都是 bug，必须移到本文件。
 *   2. 每个常量必须写清"设计意图"，以及 tools/balance-sim.ts 给出的验证结论。
 *   3. 本对象**故意不加 `as const`** —— 平衡模拟器要能做参数扫描 (parameter sweep)，
 *      冻结成字面量类型会让扫描代码寸步难行。
 *
 * 单位约定：
 *   - 时间单位一律是"呼吸 (breath)"，不是秒。
 *   - 写作 `xxxPerBreath` 的量都是每一个呼吸的增量，advance() 会按 dt 线性缩放。
 *   - 温度单位摄氏度；压强单位 atm。
 */

import type { DerivedStat, Vitals } from '../core/contract.ts';

/** 会被逐呼吸演化、且有阈值阶梯的 8 项。oxygenMax/sanMax 是容量不是状态，不在此列。 */
export type TrackedVital = Exclude<keyof Vitals, 'oxygenMax' | 'sanMax'>;

export const TRACKED_VITALS: readonly TrackedVital[] = [
  'oxygen', 'san', 'coreTemp', 'co2', 'trauma', 'infection', 'fatigue', 'fear',
];

/** 每项 Vitals 的硬边界。演化后一律夹取，防止任何一条公式把状态推到荒谬区间。 */
export const VITAL_BOUNDS: Record<TrackedVital, [number, number]> = {
  oxygen: [0, 4000],
  san: [0, 100],
  // 下界 20°C：低于此值人已不可能有行为，死亡判定会先于此触发
  coreTemp: [20, 42],
  co2: [0, 100],
  trauma: [0, 100],
  infection: [0, 100],
  fatigue: [0, 100],
  fear: [0, 100],
};

/**
 * 阈值阶梯 —— 穿越时 emit `vitals-threshold`。
 * 设计意图：玩家需要"分级的坏消息"而不是连续的数字焦虑。四档是人能记住的上限。
 * oxygen / san 的刻度是**占上限的百分比**（见 THRESHOLD_IS_PERCENT），
 * 因为 oxygenMax 会被装备改变，绝对刻度会随之失真。
 */
export const THRESHOLDS: Record<TrackedVital, readonly number[]> = {
  oxygen: [5, 12, 25, 45],          // 濒死 / 危急 / 紧张 / 开始省着用
  san: [10, 25, 45, 70],            // 共鸣边缘 / 崩解 / 动摇 / 清明尽头
  coreTemp: [28, 32, 35, 36.5],     // 致死 / 重度 / 轻度低温 / 亚正常
  co2: [40, 60, 80, 95],            // GDD §4.1 明确给出的四档
  trauma: [25, 50, 75, 90],
  infection: [20, 40, 60, 80],      // 对应接触五期的分期线
  fatigue: [30, 55, 80, 95],
  fear: [30, 55, 85, 96],           // 85 = 遭遇系统的 PANIC 相触发线
};

export const THRESHOLD_IS_PERCENT: Record<TrackedVital, boolean> = {
  oxygen: true, san: true, coreTemp: false, co2: false,
  trauma: false, infection: false, fatigue: false, fear: false,
};

/** 派生属性基线。所有 add 修正加在基线上，再乘以全部 mul 修正。 */
export const BASELINE: Record<DerivedStat, number> = {
  breathCost: 1,
  noiseEmission: 1,
  sonarRange: 3,        // 对应 GDD §4.4 短脉冲 Chirp 的半径
  sonarFidelity: 0.8,   // 同上，Chirp 的保真度；Boom/Passive 由 Agent B 再缩放
  searchQuality: 1,
  meleePower: 1,
  resolve: 1,
  stealth: 1,
  lucidity: 0,          // 清明度是纯加算量，跨轮回由 debunk 累积
};

/** 派生属性的安全区间。上界防止 buff 叠加把游戏玩坏，下界防止除零与"永远无法行动"。 */
export const DERIVED_BOUNDS: Record<DerivedStat, [number, number]> = {
  breathCost: [0.35, 12],
  noiseEmission: [0.08, 6],
  sonarRange: [0.5, 12],
  sonarFidelity: [0.05, 1],
  searchQuality: [0.1, 4],
  meleePower: [0.1, 5],
  resolve: [0.15, 4],
  stealth: [0.1, 4],
  lucidity: [-12, 24],
};

export const TUNING = {
  // ────────────────────────────────────────────────────────────────────────
  // 氧气 —— GDD §4.1，本作唯一货币
  // ────────────────────────────────────────────────────────────────────────
  oxygen: {
    /** GDD 明文规定：约 15 分钟静息。模拟器里一趟完整逃生约需 620–780 有效呼吸，留出余量。 */
    startMax: 900,
    /** 每推进 1 呼吸的基础氧耗。1:1 是本作的核心可读性契约——"氧气条上的数字就是你还能呼吸几次"。 */
    drainPerBreath: 1,
    /**
     * 空气品质惩罚。airQuality=0.3 的淹水舱里氧耗 +35%。
     * 模拟器验证：>0.6 时"保守搜刮型"窒息率飙到 61%，把探索完全劝退；0.5 是甜点。
     */
    badAirPenalty: 0.5,
    /** 低于此比例开始不可逆的缺氧性脑损伤。0.08 ≈ 72 口气，足够玩家察觉并做决策。 */
    hypoxicBrainFraction: 0.08,
    /** 缺氧性脑损伤的判定需要连续处于阈值下这么多呼吸，避免擦边即残。 */
    hypoxicBrainDwell: 14,
  },

  // ────────────────────────────────────────────────────────────────────────
  // CO2 与屏息 —— 本作最重要的微观决策
  // ────────────────────────────────────────────────────────────────────────
  co2: {
    /** 正常呼吸时的清除速率（满品质空气）。约 30 口气从 95 清到 0，屏息的代价必须能还得起。 */
    clearPerBreath: 3.2,
    /** 空气越差，越清不掉；airQuality=0 时反而净积累。 */
    ambientLoad: 2.6,
    /** 屏息每呼吸 +4 —— GDD §4.1 明文数值，不得改动。 */
    holdGainPerBreath: 4,
    /** 恐惧会让屏息更难维持：fear=100 时 CO2 累积再 +45%。这让"慌着躲"比"冷静躲"更危险。 */
    holdFearScale: 0.45,
    /** 剧烈动作下屏息（边屏息边跑）的额外累积倍率上限。 */
    holdExertionScale: 0.8,
    /** 强制大喘气线 —— GDD §4.1 明文。 */
    forcedGaspAt: 80,
    /** 大喘气一次清除的 CO2。留 45 的残量，保证连续两次屏息之间必须真正喘一会儿。 */
    gaspClear: 35,
    /** 大喘气的噪音 —— GDD §4.3 噪音源表明文：大喘气 25。 */
    gaspNoise: 25,
    /** 大喘气额外烧掉的氧气（急促过度换气）。 */
    gaspOxygenCost: 6,
    /** 大喘气的恐惧尖峰。它必须让玩家"下一次不敢再屏到 80"。 */
    gaspFear: 18,
    /** 主动吐气解除屏息：立刻清掉这么多 CO2，噪音只有大喘气的 1/6。这是对"见好就收"的奖励。 */
    releaseClear: 22,
    releaseNoise: 4,
    /** CO2 100 = 高碳酸血症死亡。 */
    lethal: 100,
    /** 超过 85 触发 CO2 麻醉状态。 */
    narcosisAt: 85,
  },

  // ────────────────────────────────────────────────────────────────────────
  // 体温 —— 淹水区的隐形计时器
  // ────────────────────────────────────────────────────────────────────────
  temp: {
    /** 干燥舱内的散热系数（趋近环境温度的速率）。 */
    coolInAir: 0.0016,
    /** 全浸没时的散热倍率。水的导热约为空气的 24 倍，但玩家穿着服，取 ×4.2 作为博弈手感。
     *  模拟器验证：×6 时低温症占死因 31%，喧宾夺主；×3 时只有 1.4%，形同虚设。 */
    floodMultiplier: 4.2,
    /** 基础代谢产热（每呼吸）。它决定了干燥舱里体温能否回升。
     *  模拟器验证：0.034 时干燥舱也会缓慢失温，900 口气掉 8°C，低温症变成"所有人都会得的病"；
     *  0.042 让干燥舱基本持平（900 口气 -1.1°C），把失温压缩成纯粹的淹水区威胁。 */
    metabolicWarm: 0.042,
    /** 疲劳会削弱产热：fatigue=100 时产热只剩 45%。 */
    fatigueWarmPenalty: 0.55,
    /** 深海水温。KYRIE-9 所在深度的实测值。 */
    waterTemp: 2.4,
    normal: 37,
    /** 低于此温度 breathCost 开始按度数惩罚 —— GDD §4.1 明文：每度 +8%。 */
    coldPenaltyBelow: 35,
    coldPenaltyPerDegree: 0.08,
    lethal: 28,
    mildHypothermiaAt: 35,
    severeHypothermiaAt: 32,
    /** 回温到此温度以上才移除低温症状态，制造迟滞，避免状态反复横跳。 */
    recoverAt: 35.8,
  },

  // ────────────────────────────────────────────────────────────────────────
  // 理智 —— 不是血条，是 Veracity Layer 的强度旋钮 (GDD §4.2)
  // ────────────────────────────────────────────────────────────────────────
  san: {
    start: 100,
    max: 100,
    /** 仅仅"待在这条船上"的本底流失。900 口气 ≈ -10.8 SAN，是一条几乎察觉不到的基线。 */
    baseDriftPerBreath: 0.012,
    /** 被注视感是最大的单一来源：presence=1 的房间每呼吸 -0.09。 */
    presenceScale: 0.09,
    /** 黑暗滞留。手灯是电力与 SAN 的兑换机。 */
    darknessScale: 0.028,
    /** 深度压迫：-2100 m 处每呼吸额外 -0.02。 */
    depthScale: 0.02,
    /** 感染的精神侵蚀。 */
    infectionScale: 0.032,
    /** 高 CO2 的认知损害（超过 60 后线性）。 */
    co2Scale: 0.05,
    /** 污染度自身的反馈项。故意做得很小：正反馈环一旦过强，SAN 会在 80 口气内清零，
     *  那就把"低 SAN 内容线"变成了不可避免的悬崖，违背 GDD "敢于冒险"的设计初衷。 */
    corruptionFeedback: 0.018,
    /** 光照回复。满照明每呼吸 +0.03，需要约 340 口气才能回满一半——光是安慰，不是解药。 */
    lightRegain: 0.03,
    /** 识破谎言的奖励 —— GDD §5 明文：SAN +8。 */
    debunkReward: 8,
    /** 目击异常的一次性冲击基准。 */
    shockBase: 6,
    /** SAN 归零不死（GDD §4.2），转入"完全共鸣"。此标记写进 flags。 */
    resonanceFlag: 'sys.resonance',
  },

  // ────────────────────────────────────────────────────────────────────────
  // 恐惧 —— 短期指标，直接放大呼吸消耗与噪音
  // ────────────────────────────────────────────────────────────────────────
  fear: {
    /** 恐惧趋近目标值的速率（指数趋近，用 util.damp）。0.055 ≈ 13 口气走完 50% 路程。 */
    lambda: 0.055,
    /** 目标值的构成权重。 */
    presenceWeight: 55,
    darknessWeight: 14,
    depthWeight: 10,
    noiseFloorWeight: 12,
    /** 高 CO2 的生理性惊恐（窒息感是最原始的恐惧源）。 */
    co2Weight: 22,
    co2Onset: 55,
    /** resolve 会压低目标值而不是加快衰减——"勇气让你没那么怕"，而不是"怕完得快"。 */
    resolveDivisorCap: 2.6,
    /** PANIC 相触发线 —— GDD §4.5 明文。 */
    panicAt: 85,
    /** 恐惧对呼吸成本的放大系数 —— GDD §4.1 明文：1 + fear/100 × 1.2。 */
    breathCostScale: 1.2,
    /** 恐惧对噪音的放大（心跳、喘息、脚步都变重）。 */
    noiseScale: 0.55,
  },

  // ────────────────────────────────────────────────────────────────────────
  // 疲劳 / 外伤 / 感染
  // ────────────────────────────────────────────────────────────────────────
  fatigue: {
    gainPerBreath: 0.042,
    /** 恐惧状态下更累。 */
    fearScale: 0.5,
    /** 休息（REST 动作）每呼吸的回复。REST 成本 10 呼吸，一次净回 8 疲劳。 */
    restRecovery: 0.9,
    exhaustionAt: 80,
  },

  trauma: {
    /** 自然愈合极慢：900 口气只能自愈 13.5 点。想活下来必须用医疗物资。 */
    healPerBreath: 0.015,
    /** 超过这个值就不再自愈——身体已经没有余力了。 */
    healCeiling: 60,
    lethal: 100,
    /** 外伤对呼吸成本的放大 —— GDD §4.1 明文：1 + trauma/150。 */
    breathCostDivisor: 150,
  },

  infection: {
    /** 一旦种下就自行生长，深度越深越快（-2100 m 处 ×2）。 */
    growthPerBreath: 0.02,
    depthScale: 1.0,
    lethal: 100,
    /** 五期分界线。跨过即自动施加对应阶段状态。 */
    stageThresholds: [20, 40, 60, 80, 95],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 压强 / 淹水 / 死亡
  // ────────────────────────────────────────────────────────────────────────
  pressure: {
    /** 潜水服密封余量（atm）。KYRIE-9 最深处 -2100 m ≈ 209 atm，所以服装余量必须略低于它，
     *  月池层才会真正"需要装备升级或速通"。 */
    suitRating: 185,
    /** 超压时每呼吸累积的挤压伤。 */
    crushPerAtm: 0.004,
    /** 结构失效累积值，达到即内爆。约等于在 209 atm 下坚持 100 口气。 */
    implosionAt: 10,
    /** flags 里可覆盖服装评级的键（由装备系统写入）。 */
    ratingFlag: 'sys.suit.rating',
  },

  flooding: {
    /** 水位高于此值视为"没顶"，不屏息就会吸入水。 */
    submergedAt: 0.9,
    /** 没顶且正常呼吸时每呼吸的溺水进度。约 11 口气溺毙——足够玩家反应，不够他犹豫。 */
    drownPerBreath: 0.09,
    /** 溺水进度在脱离水面后的回落速率。 */
    drownRecover: 0.16,
  },

  death: {
    /**
     * "自戕"死因：不是 SAN 归零的惩罚（GDD §4.2 明确说 SAN 归零不死），
     * 而是"恐慌 + 高碳酸血症 + 共鸣"三者同时成立时，玩家角色自己摘下面罩。
     * 三重门槛保证它罕见且可预防，模拟器里占死因 4–7%。
     */
    selfHarmFearAt: 85,
    selfHarmSanAt: 8,
    selfHarmCo2At: 55,
    selfHarmChancePerBreath: 0.012,
    /** 允许自戕的开关，教程轮回里关掉。 */
    allowSelfHarmFlag: 'sys.allow-self-harm',
  },

  // ────────────────────────────────────────────────────────────────────────
  // Veracity Layer —— GDD §5
  // ────────────────────────────────────────────────────────────────────────
  veracity: {
    /** corruption = f(SAN, infection, depth, stigma.listening) 的四项权重，总和 1.16 留有超额空间。 */
    sanWeight: 0.62,
    /** SAN 项的指数。>1 意味着"前半程掉 SAN 几乎无感，后半程雪崩"，这是心理恐怖需要的曲线。 */
    sanExponent: 1.35,
    infectionWeight: 0.22,
    depthWeight: 0.14,
    listeningWeight: 0.18,
    /** 聆听印记达到此数量时该项拉满（对应 GDD §7.3 入会结局的 ≥5）。 */
    listeningFull: 6,
    /** 永久 lucidity 的抗性：每点降低 6% 污染。10 点 ≈ 砍掉 46%，跨轮回成长感明确。 */
    lucidityResist: 0.06,
    /** 状态效果给的临时 lucidity 的抗性（比永久的弱，否则现实锚就是无敌）。 */
    effectLucidityResist: 0.018,
    /** 污染度的平滑速率。必须平滑：逐帧跳动会让 UI 抖成噪点，玩家反而看穿。 */
    lambda: 0.09,
    /** L0–L5 的下界 —— GDD §5 表格明文，不得改动。 */
    layers: [0.15, 0.30, 0.50, 0.70, 0.88],
    /** 各层级的文本变异密度（每 12 字的期望变异次数）。 */
    mutationDensity: [0, 0.35, 0.8, 1.6, 2.6, 3.4],
    /** HUD 数字漂移幅度：L1 是 GDD 明文的 ±2（绝对值），L2 起改为百分比。 */
    driftAbsoluteL1: 2,
    driftPercent: [0, 0, 0.04, 0.09, 0.16, 0.28],
    /** 氧气表偏乐观的偏置。"它想让你留下"——撒谎的方向本身就是叙事。 */
    oxygenOptimism: 0.62,
    /** 幻觉房间生成率（L2 起）。 */
    phantomBase: 0.055,
    /** 同一种伪造的冷却呼吸数，防止刷屏。 */
    fabricateCooldown: {
      footstep: 14, voice: 26, 'save-prompt': 220, 'fake-npc': 180,
      'fake-item': 40, 'fake-door': 90, 'hud-drift': 8, 'false-memory': 120,
      'mirrored-room': 150, 'impossible-geometry': 110,
    } as Record<string, number>,
    /** 每种伪造的基础触发率（已通过冷却限流，这里可以给得慷慨些）。 */
    fabricateRate: {
      footstep: 0.20, voice: 0.12, 'save-prompt': 0.05, 'fake-npc': 0.07,
      'fake-item': 0.14, 'fake-door': 0.09, 'hud-drift': 0.26, 'false-memory': 0.08,
      'mirrored-room': 0.06, 'impossible-geometry': 0.08,
    } as Record<string, number>,
    /** 每种伪造的最低层级门槛。 */
    fabricateMinLayer: {
      footstep: 1, 'hud-drift': 1, voice: 2, 'fake-item': 2, 'mirrored-room': 2,
      'false-memory': 3, 'impossible-geometry': 3, 'save-prompt': 4,
      'fake-npc': 4, 'fake-door': 4,
    } as Record<string, number>,
    /** 未被识破的谎言的存活呼吸数，过期自动淘汰（否则 activeLies 无限膨胀）。 */
    lieLifetime: 320,
    /** 同时存在的谎言上限。超过时淘汰最老的——玩家的注意力是有限的。 */
    maxActiveLies: 12,
    /** 识破奖励的永久 lucidity —— GDD §5 明文 +1。 */
    debunkLucidity: 1,
    /** L5 反转层：真假互换的强度。1 = 完全反转。 */
    inversionStrength: 1,
  },

  // ────────────────────────────────────────────────────────────────────────
  // 导演 AI —— GDD §8
  // ────────────────────────────────────────────────────────────────────────
  director: {
    /** 张力跟随玩家压力的速率。 */
    tensionLambda: 0.11,
    /** 压力函数的权重（和为 1）。 */
    stressWeights: {
      fear: 0.30, oxygen: 0.24, co2: 0.14, san: 0.12, trauma: 0.10, noise: 0.10,
    },
    /** 强度（长期疲劳曲线）的积累与消退速率。积累慢于消退，让"喘息"真的能喘上来。 */
    intensityGain: 0.016,
    intensityDecay: 0.022,
    /** 张力低于此值时强度不再增长（这是"高压"的定义线）。 */
    intensityFloor: 0.42,
    /** 进入持续高压相的强度阈值。 */
    peakAt: 0.72,
    /** 高压相的持续呼吸数区间。 */
    sustain: [26, 58],
    /** 喘息相的持续呼吸数区间 —— AAA 节奏感的关键，缺了它游戏变成无差别噪音。 */
    relief: [64, 118],
    /** 退出喘息相所需的强度上界。 */
    relaxTo: 0.34,
    /** 生成额度的积累速率与单次生成的开销。导演不能无限刷怪。 */
    creditPerBreath: 0.011,
    spawnCost: 1,
    creditCap: 3,
    /** 生成必须距离玩家至少这么多跳——"严禁作弊瞬移"的机械保证。 */
    minSpawnHops: 3,
    /** 喘息室必须距离玩家至少这么多跳。 */
    minReliefHops: 2,
    /** 给怪物的位置提示的最大置信度。永远 <1：导演不告诉它你的确切位置。 */
    maxHintConfidence: 0.78,
    /** 画像统计的半衰期（呼吸）。旧行为会被遗忘，玩家可以改变打法。 */
    profileHalfLife: 400,
    /** 个性化恐吓的强度：画像分数每高出基准 0.1，对应伪造率 +12%。 */
    personalizationGain: 1.2,
  },
};

/** 深度 → 归一化压迫系数 0..1（-340 m 为 0，-2100 m 为 1）。 */
export const DEPTH_RANGE: [number, number] = [340, 2100];
