/**
 * world/types.ts — 世界模块的内部类型
 *
 * 为什么存在：`core/contract.ts` 定义的是**跨模块协议**，只暴露其他 Agent
 * 需要看见的最小面。生成器/求解器/重织器需要额外的结构信息（门的关卡角色、
 * 房间变体 id、回波指纹、玩家痕迹……），这些是世界模块的私事，不该污染契约。
 * 所以这里用接口继承的方式**加宽**契约类型：WorldDoor 仍然是一个合法的 Door，
 * WorldRoom 仍然是一个合法的 Room，外部拿到的永远是契约类型。
 */

import type {
  AmbientConditions,
  Breaths,
  Condition,
  Door,
  Effect,
  ID,
  InteractionSpec,
  LogTone,
  Prop,
  PropKind,
  Rng,
  Room,
  RoomArchetype,
  Vec2,
  WorldEvent,
} from '../core/contract';

/** 门与 prop 的实例序号。跟着图一起走，保证同一种子下 id 完全可复现 */
export interface Counters {
  door: number;
  prop: number;
}

// ============================================================================
// 门
// ============================================================================

/**
 * 门在关卡结构中的角色。这是**可通关性保证**的基石：
 * 悲观验证会剔除 optional / shortcut / secret 三类门，只留 critical 骨架，
 * 因此只要 critical 骨架自洽，玩家就绝不可能因为运气差而卡死。
 */
export type DoorRole = 'critical' | 'optional' | 'shortcut' | 'secret';

export interface WorldDoor extends Door {
  /** 所属房间。契约里的 Door 是单向记录，成对存在才构成双向通道 */
  from: ID;
  role: DoorRole;
  /** 反向门的 id */
  twin?: ID;
  /** 爬行管道：噪音最低但 SAN 消耗最高，是有意义的风险权衡路径 */
  crawl: boolean;
  /** to.deck - from.deck，重织的倾向性判定要用 */
  deckDelta: number;
  /** 生成时的原始目标。重织后二者不等，是玩家可推理的证据 */
  originalTo: ID;
  reweaveCount: number;
  /** 玩家亲手做的标记 —— §6.3 要求重织可被检测 */
  mark?: DoorMark;
}

export interface DoorMark {
  /** 玩家用什么留下的：划痕、血、蜡、胶带 */
  glyph: string;
  madeAt: Breaths;
  /** 做标记那一刻门后是哪个房间。重织后不一致 = 铁证 */
  witnessedTo: ID;
  /** 做标记那一刻门后房间的回波指纹 */
  witnessedEcho: number;
}

export type DoorMarkVerdict =
  /** 标记在，门后也没变 */
  | 'intact'
  /** 标记在，但门后换了房间 —— 重织发生过 */
  | 'rewoven'
  /** 标记不见了 —— 要么这不是同一扇门（假门），要么有东西擦掉了它 */
  | 'missing'
  /** 这扇门从来没被标记过 */
  | 'unmarked';

// ============================================================================
// 房间
// ============================================================================

export interface WorldRoom extends Room {
  doors: WorldDoor[];
  props: Prop[];
  ambient: AmbientConditions;
  /** 房间变体 id。存档只存这个，描述文本从内容库重建 */
  variantId: string;
  /** setpiece id（若这是一处名场面） */
  setpiece?: string;
  /** 求解器标注：是否在关键路径上 */
  onCriticalPath: boolean;
  /**
   * 回波指纹。同一房间每次被扫到都返回同一个值 —— 除了伪影房间，
   * 它的指纹每次都会抖动，这就是 §5 要求的「可观察的破绽 (tell)」。
   */
  echoFingerprint: number;
  /** 每呼吸的进水速率 */
  floodRate: number;
  /** 玩家在此留下的痕迹。镜像舱要把它们左右反过来 */
  traces: string[];
  /** 是否出现在船体图纸上。零号舱不在 */
  onBlueprint: boolean;
  /** 已被玩家读取过的 prop id，避免重复产出 */
  spent: string[];
}

/**
 * 房间变体 —— 内容库的原子单位。
 * 一个 RoomArchetype 是骨架，变体才是有名字、有气味、有具体残骸的那个房间。
 */
export interface RoomVariant {
  id: string;
  archetype: RoomArchetype;
  /** 有文学性的中文名 */
  name: string;
  /** 允许出现的甲板 */
  decks: readonly number[];
  weight: number;
  /** 覆盖甲板基线的绝对值（未列出的字段沿用基线） */
  ambient?: Partial<AmbientConditions>;
  noiseThreshold?: number;
  floodRate?: number;
  props: readonly PropPick[];
  tags?: readonly string[];
  /** 全局唯一：一艘船上只能有一个 */
  unique?: boolean;
  /** 只作为 setpiece 被显式放置，不参与常规抽取 */
  manualOnly?: boolean;
  onEnterNode?: ID;
  /** 三档描述：清明 / 漂移 / 共鸣 */
  lucid: string;
  drift: string;
  resonant: string;
}

/** [prop 定义 id, 出现概率, 最多几个] */
export type PropPick = readonly [string, number] | readonly [string, number, number];

// ============================================================================
// 可交互物
// ============================================================================

export interface PropDef {
  id: string;
  kind: PropKind;
  name: string;
  /** 低 SAN 时 UI 显示的错误名称 */
  falseName?: string;
  /** 需要多少光/声呐才能发现 0..1 */
  concealment: number;
  tags: readonly string[];
  interactions: readonly InteractionSpec[];
  /**
   * 钥匙源标记：求解器靠 interactions 的 effects 自动推断产出，
   * 这里额外声明它适合放在哪些舱段，供生成器做约束放置。
   */
  fits?: readonly RoomArchetype[];
  lucid: string;
  drift: string;
  resonant: string;
}

// ============================================================================
// 甲板
// ============================================================================

export interface DeckSpec {
  deck: number;
  code: string;
  name: string;
  theme: string;
  /** 基调：这一层想让玩家产生什么情绪 */
  tone: string;
  depth: number;
  ambient: AmbientConditions;
  /** 必需锚点舱段 —— 缺一个就重新生成 */
  anchors: readonly RoomArchetype[];
  /** 常规房间的原型权重 */
  weights: readonly (readonly [RoomArchetype, number])[];
  /** 脊柱用什么原型铺 */
  spineArchetypes: readonly (readonly [RoomArchetype, number])[];
  /** 淹水强度系数 */
  floodBias: number;
  /** 爬行管道注入条数 */
  crawlways: [number, number];
  /** 秘密舱条数 */
  secrets: [number, number];
  /** 通往下一层的通道数（最少 2） */
  descents: [number, number];
  /** 不稳定门的基础比例 */
  instabilityBias: number;
}

// ============================================================================
// 图
// ============================================================================

export interface WorldGraph {
  rooms: Map<ID, WorldRoom>;
  startRoomId: ID;
  exitRoomId: ID;
  /** 每层的入口房间 */
  deckEntry: Map<number, ID>;
  /** 每层通往下一层的门 */
  descents: Map<number, ID[]>;
  decks: number;
  seed: number;
  /** 生成过程的诊断记录，preview 工具会打印 */
  log: string[];
  /** 已放置的 setpiece id */
  setpieces: string[];
  /** 生成尝试次数 */
  attempts: number;
  /** 是否动用了兜底修复 */
  repaired: boolean;
}

// ============================================================================
// 求解器
// ============================================================================

export interface SolverOptions {
  /**
   * 悲观模式：剔除所有非 critical 的门、所有 unstable 的门，
   * 并且不采信任何依赖 vitals/stigma 的交互产出。
   * 这正是 GDD §6.2「所有可选门锁死仍能通关」的形式化。
   */
  pessimistic: boolean;
  /** 起点覆盖（重织验证时从玩家当前位置出发） */
  from?: ID;
  /** 终点覆盖 */
  to?: ID;
  /** 已持有的钥匙（跨轮回知识） */
  granted?: readonly string[];
}

export interface KeyAcquisition {
  key: string;
  at: ID;
  propId: ID;
  /** 第几轮不动点迭代拿到的 —— 近似"进度序号" */
  step: number;
}

export interface BlockedDoor {
  door: ID;
  from: ID;
  to: ID;
  reason: string;
}

export interface SolveReport {
  solvable: boolean;
  /** 关键路径：起点 → (必需钥匙房间) → 终点 的房间序列 */
  criticalPath: readonly ID[];
  criticalPathLength: number;
  reachable: readonly ID[];
  /** 可选内容占比 = 1 - 关键路径房间数 / 总房间数 */
  optionalRatio: number;
  keyOrder: readonly KeyAcquisition[];
  blockedDoors: readonly BlockedDoor[];
  /** 关键路径上的关节点 —— 这些房间一旦不可用，跑不通 */
  bottlenecks: readonly ID[];
  /** 实际能到达的最深甲板 */
  deckReached: number;
  /** 每层通往下一层的点不交路径条数（必须 ≥2） */
  disjointDescents: Record<number, number>;
  failure?: string;
}

// ============================================================================
// 声呐
// ============================================================================

export type SonarMode = 'passive' | 'chirp' | 'boom';

export interface SonarModeSpec {
  mode: SonarMode;
  label: string;
  cost: Breaths;
  noise: number;
  radius: number;
  fidelity: number;
  /** 异常识别能力：越高越能给出可靠的 confidence */
  discrimination: number;
}

/** 多抽头回波，交给 AudioSystem.sonarPing 做真实空间回响 */
export interface EchoTap {
  delay: number;
  gain: number;
  pan: number;
}

/** 契约 SonarResult 的加宽版：多了音频抽头与破绽信息 */
export interface SonarSweep {
  mode: SonarMode;
  revealed: ID[];
  noise: number;
  cost: Breaths;
  anomalies: SonarAnomaly[];
  artifacts: ID[];
  echoes: EchoTap[];
  /** 本次脉冲的保真度实际值 */
  fidelity: number;
  /** 被声呐压制的区域（淹没的圣堂会屏蔽声呐） */
  blinded: boolean;
  /** 供 UI 提示玩家「这次回波不对劲」的线索文本 */
  tells: string[];
}

export interface SonarAnomaly {
  at: ID;
  confidence: number;
  signature: string;
  /** 内部真相，UI 绝不能读 */
  truth: 'entity' | 'corpse' | 'self-echo' | 'phantom' | 'structure' | 'listener';
  /** 拓扑距离 */
  hops: number;
}

// ============================================================================
// 重织
// ============================================================================

export interface ReweaveRecord {
  door: ID;
  from: ID;
  was: ID;
  now: ID;
  /** 触发这次重连的规则编号，让玩家能归纳 */
  rule: string;
  deckDeltaBefore: number;
  deckDeltaAfter: number;
}

export interface ReweaveReport {
  changed: number;
  records: ReweaveRecord[];
  /** 被验证否决而回滚的次数 —— 这是"不会困死玩家"的证据 */
  reverted: number;
  /** 本次重织把玩家往哪一层推 */
  pullTowardDeck: number;
  /** 玩家标记被触发的门 */
  tripped: ID[];
}

// ============================================================================
// Setpiece（惊喜地图）
// ============================================================================

export interface SetpieceContext {
  graph: WorldGraph;
  room: WorldRoom;
  /** 玩家进入此房间前所在的房间 */
  previousRoom?: WorldRoom;
  san: number;
  breaths: Breaths;
  cycle: number;
  /** setpiece 的持久状态，存在 World 里 */
  state: Record<string, number | string | boolean>;
}

export interface SetpieceHookResult {
  /** 追加到玩家日志的文本 */
  log?: { text: string; tone: LogTone }[];
  effects?: readonly Effect[];
  /** 强制把玩家送到某个房间（莫比乌斯走廊要用） */
  teleportTo?: ID;
  /** 本次声呐是否被屏蔽 */
  blockSonar?: boolean;
  /** 额外揭示的房间 */
  reveal?: readonly ID[];
  extraAnomalies?: SonarAnomaly[];
  /** 直接派发的世界事件 */
  worldEvents?: WorldEvent[];
  /** 改变某一层的水位（倒悬压载舱：抽干这里 = 灌满下面） */
  floodDelta?: { deck: number; amount: number };
  /** 解锁指定门（回声室扫三次会"听出"一扇门） */
  unlockDoors?: readonly ID[];
  /** 从房间里拿掉 n 件东西（莫比乌斯走廊每圈少一件） */
  removeProps?: number;
  /** 覆写房间名（镜像舱会变成上一个房间的名字） */
  renameTo?: string;
}

export interface SetpieceBuildContext {
  graph: WorldGraph;
  room: WorldRoom;
  rng: Rng;
  counters: Counters;
}

export interface SetpieceDef {
  id: string;
  name: string;
  /** 评审看的就是这一句：这处名场面到底在玩什么 */
  premise: string;
  /** 允许放置的甲板 */
  decks: readonly number[];
  weight: number;
  /** 是否必放 —— GDD §6.4 列出的五个是硬要求 */
  guaranteed: boolean;
  /** 房间变体 id（manualOnly） */
  variantId: string;
  /** 挂接这处房间用的门角色。setpiece 永不出现在关键路径上 */
  attachAs: DoorRole;
  /** 放置前置条件 */
  canPlace?(graph: WorldGraph, deck: number): boolean;
  /** 放置后对房间与图做定制改造 */
  build?(ctx: SetpieceBuildContext): void;
  onEnter?(ctx: SetpieceContext): SetpieceHookResult | void;
  onExit?(ctx: SetpieceContext): SetpieceHookResult | void;
  onPing?(ctx: SetpieceContext, mode: SonarMode): SetpieceHookResult | void;
  /** 仅当条件满足才对声呐可见（零号舱：SAN < 20） */
  sonarVisible?(ctx: { san: number; cycle: number }): boolean;
}

// ============================================================================
// Listener 与噪音
// ============================================================================

export interface ListenerState {
  /** 它现在在哪 */
  at: ID;
  /** 它认为你在哪 */
  believesYouAt: ID;
  /** 置信度 */
  confidence: number;
  /** 被召唤后累计的呼吸数 */
  since: Breaths;
  /** 玩家的逃离窗口（8..20 呼吸） */
  window: Breaths;
  active: boolean;
  /** 它路过留下的扰动，可被声呐探测 */
  disturbances: { at: ID; strength: number }[];
}

// ============================================================================
// 工具
// ============================================================================

/** prop 实例 id 形如 `defId@序号`，反解出定义 id 以便存档重建 */
export function propDefIdOf(propId: string): string {
  const at = propId.lastIndexOf('@');
  return at < 0 ? propId : propId.slice(0, at);
}

export function isCrawl(door: Door): boolean {
  return (door as WorldDoor).crawl === true;
}

export function doorRole(door: Door): DoorRole {
  return (door as WorldDoor).role ?? 'optional';
}

/** 静态可判定的条件种类 —— 求解器只信这些 */
export function isStaticCondition(c: Condition): boolean {
  switch (c.op) {
    case 'always':
    case 'flag':
    case 'has-item':
    case 'has-knowledge':
    case 'in-room':
    case 'depth':
      return true;
    case 'all':
    case 'any':
      return c.of.every(isStaticCondition);
    case 'not':
      return isStaticCondition(c.of);
    default:
      return false;
  }
}

export const SAN_TIER = { lucid: 60, drift: 30 } as const;

export type SanTier = 'lucid' | 'drift' | 'resonant';

export function sanTier(san: number): SanTier {
  if (san >= SAN_TIER.lucid) return 'lucid';
  if (san >= SAN_TIER.drift) return 'drift';
  return 'resonant';
}

export type { AmbientConditions, Prop, PropKind, RoomArchetype, Vec2, ID, Breaths };
