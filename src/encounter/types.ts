/**
 * 遭遇系统内部类型。
 *
 * 为什么存在这一层：`core/contract.ts` 是跨 Agent 协议，它只定义了"运行时实体"
 * （Entity / BodyPart / EncounterState）。但一个敌人**作为内容**需要的东西远多于此：
 * 认知档位、感知灵敏度、部位被毁后的行为改变、诱饵可信度、telegraph 文本库。
 * 这些是本模块私有的内容格式，不属于跨模块协议，所以留在这里而不去改契约。
 */

import type {
  AmbientConditions,
  Breaths,
  CombatAction,
  Condition,
  Effect,
  Entity,
  EntityIntent,
  EncounterState,
  FlagStore,
  ID,
  Rng,
  StigmaKind,
  Vitals,
} from '../core/contract';

// ---------------------------------------------------------------------------
// 感知与部位
// ---------------------------------------------------------------------------

/** 与 contract 的 Entity.senses 同构，单独命名只为可读性 */
export type Sense = 'sound' | 'heat' | 'vibration' | 'faith' | 'light';

export const ALL_SENSES: readonly Sense[] = ['sound', 'heat', 'vibration', 'faith', 'light'];

/**
 * 部位的**功能分类**。这是"毁掉部位 ≠ 扣血"的实现基础：
 * 引擎按 fn 与 PartConsequence 改写实体行为，而不是只减 hp。
 */
export type PartFunction =
  | 'auditory'      // 耳器 / 侧线 / 鼓膜
  | 'thermal'       // 热窝 / 红外坑
  | 'ampullae'      // 振动感受器
  | 'ocular'        // 眼 / 光感斑
  | 'faith-organ'   // 祷响腔 —— 它"听见"信仰的器官
  | 'locomotion'    // 腱 / 足 / 蠕动环
  | 'grasp'         // 抓握肢
  | 'jaw'           // 口器
  | 'vocal'         // 发声器 —— 毁掉它就叫不来同类
  | 'armor'         // 甲壳 / 结壳
  | 'core'          // 要害
  | 'brood';        // 子体囊 / 分群

/** 部位被摧毁后对实体行为的**真实**改变 */
export interface PartConsequence {
  /** 从此对这些感知通道失效 */
  blindTo?: readonly Sense[];
  /** 接近速度倍率（< 1 变慢） */
  approachMul?: number;
  /** 输出倍率 */
  powerMul?: number;
  /** 闪避加值（部位被毁通常让它更笨拙，故常为负） */
  evasionAdd?: number;
  /** 从此不能采用的意图 */
  forbidIntents?: readonly EntityIntent['kind'][];
  /** 从此无法呼叫同类 */
  silenceCall?: boolean;
  /** 每回合自身流失（结构性失血） */
  bleed?: number;
  /** 觉察衰减加成（感知器被毁，它更容易丢失目标） */
  awarenessDecayAdd?: number;
  /** 摧毁即终结（要害） */
  lethal?: boolean;
  /** 摧毁后分裂出子体 */
  spawnBrood?: { def: ID; count: number };
  /** 播报文本 —— 必须写清"行为变了什么"，让玩家能学习 */
  note: string;
}

export interface PartDef {
  id: ID;
  name: string;
  /** 认知不足时玩家看到的错误部位名 */
  falseName: string;
  hp: number;
  evasion: number;
  armor: number;
  vital: boolean;
  fn: PartFunction;
  /** 认知档位 ≥ 此值才在部位图上显形 */
  revealAt: 0 | 1 | 2 | 3;
  consequence: PartConsequence;
  /** 摧毁时抛给宿主系统的叙事效果（Stigma / 知识 / 音效） */
  effects?: readonly Effect[];
  describe: string;
}

// ---------------------------------------------------------------------------
// 认知档位
// ---------------------------------------------------------------------------

export interface CognitionTier {
  /** 进入本档的 cognition 阈值 */
  min: number;
  /** 本档显示的名字。第 0 档按设计必须是 `???` 或明显错误的俗名 */
  name: string;
  /** 本档显示的描述。第 0 档**必须是错的** */
  description: string;
  /** 部位图保真度 0..1 —— 低则部位名被替换成 falseName 且 hp 不可见 */
  chartFidelity: number;
  /** 本档解锁的动作 id */
  unlocks: readonly ID[];
  /** 图鉴里给玩家的应对方针。越高档越具体 */
  counsel: string;
}

export type CognitionSource = 'observe' | 'autopsy' | 'archive' | 'survive' | 'wound' | 'listen';

// ---------------------------------------------------------------------------
// 敌人定义
// ---------------------------------------------------------------------------

export interface IntentWeight {
  kind: EntityIntent['kind'];
  /** 基础权重 */
  weight: number;
  /** 该意图需要的最小觉察度 */
  minAwareness?: number;
  /** 该意图需要的距离档 */
  bands?: readonly DistanceBandName[];
  /** 意图强度（0..10），最终伤害 = power × def.power / 10 */
  power: number;
  /** 执行后把玩家拉到哪个距离档 */
  pull?: DistanceBandName;
}

export type DistanceBandName = 'unknown' | 'far' | 'near' | 'adjacent' | 'contact';

export interface EnemyDef {
  id: ID;
  /** 真名 —— 只在最高认知档显示 */
  trueName: string;
  hpMax: number;
  parts: readonly PartDef[];
  senses: readonly Sense[];
  /** 每条感知通道的灵敏度倍率。没列出的通道即使在 senses 里也按 1.0 */
  acuity: Partial<Record<Sense, number>>;
  /** 每回合觉察度自然衰减 */
  awarenessDecay: number;
  /** 觉察度达到此值即从 STALK 转入 CONTACT */
  contactThreshold: number;
  /** 每回合接近倾向 0..1 */
  approach: number;
  evasion: number;
  /** 基础输出 */
  power: number;
  /** 对假声源/假热源的可信度：值越高越容易被骗 */
  decoyCredulity: Partial<Record<Sense, number>>;
  /** 4 个认知档位（契约要求至少 4） */
  tiers: readonly [CognitionTier, CognitionTier, CognitionTier, CognitionTier];
  telegraphs: Partial<Record<EntityIntent['kind'], readonly string[]>>;
  intents: readonly IntentWeight[];
  /** 永不可杀 —— 只能被误导、延迟、驱离 */
  unkillable?: boolean;
  /** 玩家永远看不到它的整体：所有描述走 evidence 而非外观 */
  neverVisible?: boolean;
  /** 人型：可交涉，杀它有道德代价 */
  negotiable?: boolean;
  /** 击杀时结算的效果（Stigma / flag） */
  killEffects?: readonly Effect[];
  /** 证据行：neverVisible 实体每回合从这里取一句代替 telegraph */
  evidence?: readonly string[];
  /** 它被什么吸引（用于诱饵判定与"喂食"类动作） */
  lure?: readonly Sense[];
  /** 出场播报 */
  onSpawnLog: string;
  /** 被这种敌人杀死时的死因 */
  deathCause: 'trauma' | 'listener' | 'drowning' | 'infection' | 'ritual';
  tags: readonly string[];
}

// ---------------------------------------------------------------------------
// 运行时（引擎私有扩展）
// ---------------------------------------------------------------------------

/** 诱饵：一个假的感知源。不同感知通道的敌人对它反应完全不同 */
export interface Decoy {
  id: ID;
  /** 它伪装成哪种感知源 */
  channel: Sense;
  strength: number;
  /** 剩余回合 */
  ttl: number;
  /** 敌人被引去以后距离拉开的档数 */
  pull: number;
  label: string;
}

/** 掩蔽度：0 = 完全暴露，1 = 该通道完全被掩盖 */
export type Masking = Record<Sense, number>;

export interface EntityBehavior {
  blind: Set<Sense>;
  approachMul: number;
  powerMul: number;
  evasionAdd: number;
  forbidden: Set<EntityIntent['kind']>;
  canCall: boolean;
  bleed: number;
  awarenessDecayAdd: number;
}

/**
 * 引擎实际操作的状态对象。
 *
 * 为什么用"扩展 + 同一对象"而不是"两个对象"：`CombatAction.resolve(ctx)`
 * 只收到 `CombatContext`，其中只有 `EncounterState`。动作必须能改写掩蔽度、
 * 投放诱饵、读认知档位 —— 而契约不能改。所以引擎构造的就是 EncounterRuntime，
 * 动作侧用 `rt()` 取回扩展字段。运行期永远是同一个对象，不存在同步问题。
 */
export interface EncounterRuntime extends EncounterState {
  readonly __runtime: true;
  entities: Entity[];
  defs: Map<ID, EnemyDef>;
  rng: Rng;
  flags: FlagStore;
  ambient: AmbientConditions;
  depth: number;
  stigma: Record<StigmaKind, number>;

  masking: Masking;
  /** 玩家是否正在屏息 */
  holdingBreath: boolean;
  /** 屏息累积的 CO2（超限强制大喘气） */
  heldBreathRounds: number;
  /** 本回合玩家制造的位移量（喂给 vibration 感知） */
  movement: number;
  /** 上一回合的噪音增量（喂给 sound 感知） */
  noiseDelta: number;
  /** 玩家的信仰signature：持有圣物、做过仪式、低 SAN 都会抬高它 */
  faithSignature: number;
  /** 玩家热signature：体温、剧烈动作抬高它，冷水与保温毯压低它 */
  heatSignature: number;

  decoys: Decoy[];
  /** `${entityId}:${partId}` */
  destroyed: Set<string>;
  behaviors: Map<ID, EntityBehavior>;

  /** PANIC：动作 id → 实际会执行的动作 id（错位） */
  panicMap: Record<ID, ID>;
  /** PANIC：本回合"按键失灵"的动作 */
  lockedActions: Set<ID>;
  /** 被抓住 —— 大部分动作不可用 */
  restrained: boolean;
  /** 抓住玩家的实体 */
  restrainedBy: ID | null;

  /** 噪音溢出累积 → 超过门槛召唤 THE LISTENER */
  listenerPressure: number;
  reinforcements: number;
  /** 逃脱进度 0..1，到 1 才真的跑掉 */
  escapeProgress: number;
  /** 是否在门上做过标记（逃脱时不会跑错方向） */
  markedExit: boolean;
  /** 连续静默回合数 —— 对付 THE LISTENER 的唯一硬指标 */
  silentStreak: number;

  log: string[];
  actionUse: Record<ID, number>;
  /** 上一次动作的实际呼吸成本，用于噪音衰减计算 */
  lastCost: Breaths;
  /** 待宿主系统执行的效果（Stigma / spawn / reweave 等非本模块职责的） */
  pending: Effect[];
  outcome: 'escaped' | 'killed' | 'died' | 'spared' | null;
}

export function isRuntime(s: EncounterState): s is EncounterRuntime {
  return (s as EncounterRuntime).__runtime === true;
}

/** 动作侧取回引擎扩展字段。运行期必定成立；不成立说明有人自己造了个 state */
export function rt(s: EncounterState): EncounterRuntime {
  if (!isRuntime(s)) {
    throw new Error('[encounter] EncounterState 不是由 EncounterEngine 构造的，缺少运行时扩展');
  }
  return s;
}

// ---------------------------------------------------------------------------
// 动作定义
// ---------------------------------------------------------------------------

export type ActionPhase = 'stalk' | 'contact' | 'panic' | 'any';

export type ActionTag =
  | 'melee' | 'ranged' | 'thrown' | 'stealth' | 'info' | 'light' | 'sound'
  | 'medical' | 'social' | 'ritual' | 'escape' | 'defense' | 'panic'
  | 'breath' | 'mask' | 'sacrifice' | 'precision' | 'loud' | 'silent';

/** 内容层写的动作。引擎把它包装成契约的 CombatAction */
export interface ActionDef {
  id: ID;
  label: string;
  /** 低认知/低 SAN 时显示的错误标签（PANIC 相的错位也用它） */
  shortDesc: string;
  cost: Breaths;
  noise: number;
  phases: readonly ActionPhase[];
  targeting: CombatAction['targeting'];
  item?: ID;
  /** 消耗道具（use 一次） */
  consumesItem?: boolean;
  requires?: Condition;
  /** 需要对目标的认知档位 ≥ 此值 */
  needsCognition?: 0 | 1 | 2 | 3;
  /** 需要玩家处于被抓状态 / 必须不被抓 */
  needsRestrained?: boolean;
  /** 需要的距离档 */
  bands?: readonly DistanceBandName[];
  tags: readonly ActionTag[];
  resolve(ctx: import('../core/contract').CombatContext): import('../core/contract').CombatOutcome;
}

// ---------------------------------------------------------------------------
// 物品内容格式
// ---------------------------------------------------------------------------

export interface ItemExtra {
  /** 响度：移动时它会响。金属高、布料 0。背包总响度抬高移动噪音 */
  loudness: number;
  /** 掩蔽贡献：装备/使用后压低某条感知通道 */
  masks?: Partial<Record<Sense, number>>;
  /** 作为诱饵时伪装成哪种源 */
  decoyChannel?: Sense;
  /** 近战/远程威力 */
  power?: number;
  /** 穿甲 */
  pierce?: number;
  /** 提供的光照 0..1 */
  light?: number;
}

export interface VitalsPatchFn {
  (stat: keyof Vitals, delta: number): void;
}
