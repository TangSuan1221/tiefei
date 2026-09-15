/**
 * 《铁肺迷城》IRONLUNG MAZE — 架构契约 (ARCHITECTURE CONTRACT)
 * =============================================================
 * 这是全项目唯一的类型真相源。所有并行开发的模块都只依赖本文件，
 * 不得互相直接 import 实现。修改本文件 = 修改跨模块协议，必须谨慎。
 *
 * 模块边界:
 *   sim/        生理与资源模拟   (Vitals, Clock, Status)
 *   world/      拓扑地图与感知   (Deck, Room, Door, Sonar)
 *   narrative/  分支叙事图       (Node, Choice, Flag, Ending)
 *   encounter/  回合制遭遇       (Combat, Entity, Action)
 *   render/     渲染与后处理
 *   audio/      程序化音频
 *   ui/         HUD 与交互层
 */

// ============================================================================
// 0. 基础
// ============================================================================

export type ID = string;
export type Seed = number;

/** 确定性随机源接口 — 所有随机必须经由此接口，禁止 Math.random() */
export interface Rng {
  /** [0,1) */
  next(): number;
  /** [min,max] 整数 */
  int(min: number, max: number): number;
  /** [min,max) 浮点 */
  float(min: number, max: number): number;
  bool(pTrue?: number): boolean;
  pick<T>(arr: readonly T[]): T;
  /** 带权重挑选 */
  weighted<T>(entries: readonly [T, number][]): T;
  shuffle<T>(arr: T[]): T[];
  /** 派生一个独立的命名子流，保证子系统之间互不干扰 */
  fork(label: string): Rng;
  /** 当前内部状态，用于存档 */
  serialize(): number[];
}

export interface Vec2 {
  x: number;
  y: number;
}

// ============================================================================
// 1. 时间 / 氧气 —— 本作的唯一货币
// ============================================================================

/**
 * 时间不是秒，是"呼吸 (BREATH)"。
 * 每个动作消耗若干呼吸，呼吸消耗氧气；恐惧会让同样的动作消耗更多呼吸。
 */
export type Breaths = number;

export const BREATH = {
  LOOK: 1,
  STEP: 2,
  OPEN_DOOR: 3,
  FORCE_DOOR: 8,
  SEARCH: 6,
  SONAR_PING: 4,
  INTERACT: 4,
  REST: 10,
  RITUAL: 20,
} as const;

// ============================================================================
// 2. 生理状态 (Agent A 领域)
// ============================================================================

export interface Vitals {
  /** 氧气储量，0 = 死亡。单位: 呼吸数 */
  oxygen: number;
  oxygenMax: number;
  /** 理智 0..100。低理智触发 Veracity Layer 欺骗 */
  san: number;
  sanMax: number;
  /** 体温 摄氏度。潜艇进水后急速下降 */
  coreTemp: number;
  /** 血液 CO2 浓度 0..100，高则视野收缩、行动失误 */
  co2: number;
  /** 外伤 0..100 */
  trauma: number;
  /** 感染 0..100 — 被"外面的东西"接触后累积 */
  infection: number;
  /** 疲劳 0..100 */
  fatigue: number;
  /** 恐惧 0..100 — 短期指标，直接放大呼吸消耗与噪音 */
  fear: number;
}

/** 所有可叠加的状态效果 */
export interface StatusEffect {
  id: ID;
  name: string;
  /** 剩余呼吸数; -1 = 永久 */
  duration: Breaths;
  stacks: number;
  tags: readonly StatusTag[];
  /** 每呼吸对 Vitals 的增量修改 */
  tick?: Partial<Record<keyof Vitals, number>>;
  /** 对派生属性的乘/加修正 */
  modifiers?: readonly Modifier[];
  /** 玩家可见描述; 若 hidden=true 则不在 UI 显示（用于欺骗层） */
  hidden?: boolean;
  description: string;
}

export type StatusTag =
  | 'physical' | 'mental' | 'infection' | 'ritual'
  | 'buff' | 'debuff' | 'hidden' | 'terminal';

export interface Modifier {
  stat: DerivedStat;
  op: 'add' | 'mul';
  value: number;
}

export type DerivedStat =
  | 'breathCost'      // 全局动作呼吸消耗倍率
  | 'noiseEmission'   // 噪音发出倍率
  | 'sonarRange'      // 声呐半径
  | 'sonarFidelity'   // 声呐保真度 (影响伪房间概率)
  | 'searchQuality'   // 搜索产出
  | 'meleePower'
  | 'resolve'         // 抵抗恐惧
  | 'stealth'
  | 'lucidity';       // 抵抗 Veracity 欺骗

/** Agent A 必须实现 */
export interface VitalsSystem {
  readonly vitals: Readonly<Vitals>;
  readonly effects: readonly StatusEffect[];
  /** 推进 n 个呼吸，返回本次推进产生的事件 */
  advance(breaths: Breaths, ctx: SimContext): SimEvent[];
  apply(effect: StatusEffect): void;
  remove(id: ID): void;
  /** 计算派生属性的最终值 */
  derived(stat: DerivedStat): number;
  /** 玩家感知到的 Vitals —— 可能被 Veracity Layer 污染 */
  perceived(): Vitals;
  serialize(): unknown;
  hydrate(data: unknown): void;
}

export interface SimContext {
  rng: Rng;
  depth: number;
  /** 当前房间的环境 */
  ambient: AmbientConditions;
  flags: FlagStore;
}

export interface AmbientConditions {
  /** 水位 0..1 */
  flooding: number;
  /** 气压 atm */
  pressure: number;
  temperature: number;
  /** 空气品质 0..1, 低则氧耗加剧 */
  airQuality: number;
  /** 本房间的背景噪音底噪 */
  noiseFloor: number;
  /** 此处是否有"注视感" */
  presence: number;
}

export type SimEvent =
  | { kind: 'vitals-threshold'; stat: keyof Vitals; crossed: 'up' | 'down'; value: number }
  | { kind: 'status-expired'; id: ID }
  | { kind: 'status-applied'; id: ID }
  | { kind: 'death'; cause: DeathCause }
  | { kind: 'hallucination'; severity: number };

export type DeathCause =
  | 'asphyxiation' | 'hypothermia' | 'trauma' | 'infection'
  | 'implosion' | 'listener' | 'ritual' | 'drowning' | 'self';

// ============================================================================
// 3. 世界拓扑 (Agent B 领域)
// ============================================================================

/**
 * 地图是**图**而非网格。门的连接可以在玩家不观察时重连（非欧拓扑）。
 * 这是"惊喜地图"的机械基础。
 */
export interface Room {
  id: ID;
  /** 舱段类型 */
  archetype: RoomArchetype;
  name: string;
  /** 在声呐图上的名义坐标（可能与实际拓扑矛盾——这是故意的） */
  pos: Vec2;
  deck: number;
  ambient: AmbientConditions;
  doors: readonly Door[];
  /** 房间内容：可交互物、拾取物、实体 */
  props: readonly Prop[];
  /** 首次进入触发的叙事节点 */
  onEnterNode?: ID;
  /** 是否已被玩家实际踏入 */
  visited: boolean;
  /** 是否已被声呐扫描到 */
  mapped: boolean;
  /** 真实性: 'real' | 'phantom'(幻觉房间, SAN低时生成) | 'unstable'(会重连) */
  veracity: 'real' | 'phantom' | 'unstable';
  /** 累计噪音，达阈值召唤 Listener */
  noise: number;
  noiseThreshold: number;
  tags: readonly string[];
}

export type RoomArchetype =
  | 'corridor' | 'bulkhead' | 'engine' | 'reactor' | 'galley'
  | 'bunks' | 'medbay' | 'sonar-room' | 'bridge' | 'torpedo'
  | 'ballast' | 'chapel' | 'archive' | 'moonpool' | 'flooded'
  | 'crawlspace' | 'airlock' | 'void' | 'reliquary' | 'observation';

export interface Door {
  id: ID;
  /** 目标房间；unstable 门在重连后会改变 */
  to: ID;
  state: DoorState;
  /** 压力差, 高则强开会爆水 */
  pressureDelta: number;
  /** 打开需要的东西 */
  lock?: LockSpec;
  /** 门后声音的提示（不开门也能听到） */
  audioHint?: string;
  /** 该门是否参与拓扑重连 */
  unstable: boolean;
}

export type DoorState = 'open' | 'closed' | 'jammed' | 'sealed' | 'welded' | 'flooded-shut';

export interface LockSpec {
  kind: 'key' | 'code' | 'power' | 'ritual' | 'valve' | 'knowledge';
  requires: ID;
  /** 玩家已掌握的提示文本 */
  hint?: string;
}

export interface Prop {
  id: ID;
  kind: PropKind;
  name: string;
  /** 需要声呐/光才能发现 */
  concealment: number;
  interactions: readonly InteractionSpec[];
  /** 描述在不同 SAN 下不同 */
  describe(san: number): string;
}

export type PropKind =
  | 'corpse' | 'terminal' | 'valve' | 'locker' | 'altar' | 'radio'
  | 'porthole' | 'pipe' | 'breaker' | 'logbook' | 'icon' | 'hatch'
  | 'specimen' | 'mirror' | 'nest';

export interface InteractionSpec {
  id: ID;
  label: string;
  cost: Breaths;
  noise: number;
  /** 条件不满足则灰显 */
  requires?: Condition;
  /** 触发的叙事节点或直接效果 */
  node?: ID;
  effects?: readonly Effect[];
}

/** Agent B 必须实现 */
export interface WorldSystem {
  readonly rooms: ReadonlyMap<ID, Room>;
  readonly currentRoomId: ID;
  generate(seed: Seed, cfg: WorldGenConfig): void;
  room(id: ID): Room;
  move(doorId: ID): MoveResult;
  /** 声呐脉冲: 返回被照亮的房间 id 与保真度 */
  ping(power: number, fidelity: number): SonarResult;
  /** 玩家不观察时的拓扑重连 */
  reweave(rng: Rng, pressure: number): void;
  addNoise(roomId: ID, amount: number): void;
  serialize(): unknown;
  hydrate(data: unknown): void;
}

export interface WorldGenConfig {
  decks: number;
  roomsPerDeck: [number, number];
  floodLevel: number;
  /** 非欧强度 0..1 */
  instability: number;
  /** 幻觉房间生成率，由 SAN 动态驱动 */
  phantomRate: number;
  requiredArchetypes: readonly RoomArchetype[];
}

export interface MoveResult {
  ok: boolean;
  blockedBy?: DoorState | 'locked';
  arrivedAt?: ID;
  cost: Breaths;
  noise: number;
  events: readonly WorldEvent[];
}

export interface SonarResult {
  revealed: readonly ID[];
  /** 声呐制造的噪音 */
  noise: number;
  /** 被扫描出的"回波异常"——可能是怪物，也可能是幻觉 */
  anomalies: readonly { at: ID; confidence: number; signature: string }[];
  /** 伪影：被错误标记为存在的房间 */
  artifacts: readonly ID[];
}

export type WorldEvent =
  | { kind: 'flood'; roomId: ID; rate: number }
  | { kind: 'hull-breach'; roomId: ID }
  | { kind: 'reweave'; changed: number }
  | { kind: 'listener-summoned'; roomId: ID }
  | { kind: 'room-discovered'; roomId: ID };

// ============================================================================
// 4. 叙事图 (Agent C 领域)
// ============================================================================

export type FlagValue = boolean | number | string;

export interface FlagStore {
  get(key: string): FlagValue | undefined;
  getNum(key: string, fallback?: number): number;
  getBool(key: string): boolean;
  set(key: string, value: FlagValue): void;
  add(key: string, delta: number): void;
  has(key: string): boolean;
  all(): Readonly<Record<string, FlagValue>>;
}

/** 条件表达式 —— 数据驱动，可被内容校验器静态检查 */
export type Condition =
  | { op: 'always' }
  | { op: 'flag'; key: string; cmp: Cmp; value: FlagValue }
  | { op: 'vital'; stat: keyof Vitals; cmp: Cmp; value: number }
  | { op: 'has-item'; item: ID; count?: number }
  | { op: 'has-knowledge'; node: ID }
  | { op: 'stigma'; stigma: StigmaKind; cmp: Cmp; value: number }
  | { op: 'in-room'; archetype: RoomArchetype }
  | { op: 'depth'; cmp: Cmp; value: number }
  | { op: 'all'; of: readonly Condition[] }
  | { op: 'any'; of: readonly Condition[] }
  | { op: 'not'; of: Condition };

export type Cmp = '==' | '!=' | '>' | '<' | '>=' | '<=';

export type Effect =
  | { op: 'flag'; key: string; value: FlagValue }
  | { op: 'flag-add'; key: string; delta: number }
  | { op: 'vital'; stat: keyof Vitals; delta: number }
  | { op: 'status'; effect: ID; duration?: Breaths }
  | { op: 'remove-status'; effect: ID }
  | { op: 'item'; item: ID; count: number }
  | { op: 'knowledge'; node: ID }
  | { op: 'stigma'; stigma: StigmaKind; delta: number }
  | { op: 'noise'; amount: number }
  | { op: 'spawn'; entity: ID; where?: ID }
  | { op: 'unlock-door'; door: ID }
  | { op: 'reweave'; intensity: number }
  | { op: 'goto'; node: ID }
  | { op: 'encounter'; encounter: ID }
  | { op: 'ending'; ending: ID }
  | { op: 'sfx'; cue: string }
  | { op: 'camera'; shake?: number; fade?: string };

/** 教团标记 —— 决定结局分支与怪物行为 */
export type StigmaKind =
  | 'silence'    // 缄默: 你选择不发声
  | 'listening'  // 聆听: 你回应了它
  | 'drowned'    // 溺者: 你拥抱了水
  | 'iron'       // 铁: 你信任机械
  | 'flesh'      // 肉: 你使用了活体
  | 'apostasy';  // 叛教: 你破坏了仪式

export interface NarrativeNode {
  id: ID;
  /** 说话者/场景标题 */
  speaker?: string;
  /** 正文。支持 {{flag}} 插值与 SAN 变体 */
  text: string;
  /** SAN 低于阈值时替换的文本 — 心灵恐怖核心 */
  corruptedText?: { belowSan: number; text: string }[];
  choices: readonly NarrativeChoice[];
  onEnter?: readonly Effect[];
  /** 自动跳转（无选项节点） */
  next?: ID;
  tags?: readonly string[];
  /** 是否为"知识节点"——死亡后可继承 */
  knowledge?: boolean;
  portrait?: string;
  ambience?: string;
}

export interface NarrativeChoice {
  id: ID;
  label: string;
  /** 不满足时: 'hide' 隐藏 | 'disable' 灰显 | 'lie' 显示但点击后揭穿 */
  requires?: Condition;
  gateMode?: 'hide' | 'disable' | 'lie';
  cost?: Breaths;
  effects?: readonly Effect[];
  goto?: ID;
  /** 该选项是否为"不可逆" —— UI 会给出警示纹理 */
  irreversible?: boolean;
  /** 只出现一次 */
  once?: boolean;
  tooltip?: string;
}

export interface Ending {
  id: ID;
  title: string;
  subtitle: string;
  body: string;
  /** 达成条件 —— 由 director 在结局判定时求值，优先级高者先匹配 */
  requires: Condition;
  priority: number;
  rank: 'true' | 'good' | 'bittersweet' | 'bad' | 'secret' | 'joke';
  /** 解锁的元进度 */
  unlocks?: readonly ID[];
}

/** Agent C 必须实现 */
export interface NarrativeSystem {
  readonly currentNode: NarrativeNode | null;
  start(nodeId: ID): void;
  choose(choiceId: ID): void;
  /** 求值条件 */
  test(cond: Condition | undefined): boolean;
  /** 执行效果 */
  run(effects: readonly Effect[] | undefined): void;
  /** 结算结局 */
  resolveEnding(): Ending | null;
  /** 渲染层拿到的、已插值且已按 SAN 污染的文本 */
  renderText(node: NarrativeNode): string;
  serialize(): unknown;
  hydrate(data: unknown): void;
}

// ============================================================================
// 5. 遭遇 / 战斗 (Agent D 领域)
// ============================================================================

/**
 * 战斗不是 HP 对拼。是"你在黑暗里，不知道它在哪"。
 * 核心资源: 呼吸(行动点) / 噪音(暴露) / 光(视野) / 恐惧(失控)
 */
export interface Entity {
  id: ID;
  defId: ID;
  name: string;
  /** 玩家对它的认知程度 0..1 — 低认知时名字与外观都是错的 */
  cognition: number;
  hp: number;
  hpMax: number;
  parts: readonly BodyPart[];
  /** 它靠什么找到你 */
  senses: readonly ('sound' | 'heat' | 'vibration' | 'faith' | 'light')[];
  /** 当前对玩家位置的置信度 0..1 */
  awareness: number;
  intent: EntityIntent | null;
  statuses: readonly StatusEffect[];
  tags: readonly string[];
}

export interface BodyPart {
  id: ID;
  name: string;
  hp: number;
  hpMax: number;
  /** 命中难度 */
  evasion: number;
  /** 摧毁后的效果 */
  onDestroy?: readonly Effect[];
  armor: number;
  vital: boolean;
}

export interface EntityIntent {
  /** 玩家能否看穿意图取决于 cognition */
  kind: 'strike' | 'grab' | 'listen' | 'stalk' | 'flee' | 'call' | 'ritual' | 'unknown';
  target?: ID;
  power: number;
  telegraph: string;
}

export interface EncounterState {
  id: ID;
  entities: readonly Entity[];
  /** 玩家在遭遇中的"位置"是抽象的: 距离档位 */
  distance: Record<ID, DistanceBand>;
  /** 当前光照 0..1 */
  light: number;
  /** 本遭遇累积噪音 */
  noise: number;
  round: number;
  /** 是否可逃 */
  escapable: boolean;
  phase: 'stalk' | 'contact' | 'panic' | 'resolved';
}

export type DistanceBand = 'unknown' | 'far' | 'near' | 'adjacent' | 'contact';

export interface CombatAction {
  id: ID;
  label: string;
  cost: Breaths;
  noise: number;
  /** 需要的道具 */
  item?: ID;
  targeting: 'none' | 'entity' | 'part' | 'direction';
  requires?: Condition;
  resolve(ctx: CombatContext): CombatOutcome;
}

export interface CombatContext {
  rng: Rng;
  vitals: VitalsSystem;
  encounter: EncounterState;
  targetEntity?: ID;
  targetPart?: ID;
  inventory: InventorySystem;
}

export interface CombatOutcome {
  log: readonly string[];
  damage?: { entity: ID; part?: ID; amount: number }[];
  effects?: readonly Effect[];
  noise: number;
  /** 是否结束遭遇 */
  resolved?: 'escaped' | 'killed' | 'died' | 'spared';
}

/** Agent D 必须实现 */
export interface EncounterSystem {
  readonly state: EncounterState | null;
  begin(encounterId: ID, ctx: SimContext): void;
  availableActions(): readonly CombatAction[];
  perform(actionId: ID, target?: { entity?: ID; part?: ID }): CombatOutcome;
  /** 敌方回合 */
  advance(): readonly string[];
  end(): void;
  serialize(): unknown;
  hydrate(data: unknown): void;
}

// ============================================================================
// 6. 物品 / 制作
// ============================================================================

export interface ItemDef {
  id: ID;
  name: string;
  /** 低 SAN 下的错误名称 */
  falseName?: string;
  description: string;
  kind: 'tool' | 'weapon' | 'consumable' | 'key' | 'relic' | 'material' | 'document';
  weight: number;
  stackable: boolean;
  /** 噪音属性: 使用时的噪音 */
  noise?: number;
  durability?: number;
  onUse?: readonly Effect[];
  tags: readonly string[];
}

export interface InventorySystem {
  count(item: ID): number;
  add(item: ID, n: number): void;
  remove(item: ID, n: number): boolean;
  all(): readonly { id: ID; count: number; durability?: number }[];
  use(item: ID): readonly Effect[];
  craft(recipeId: ID): boolean;
}

export interface Recipe {
  id: ID;
  name: string;
  inputs: readonly { item: ID; count: number }[];
  output: { item: ID; count: number };
  requires?: Condition;
  cost: Breaths;
  noise: number;
  /** 需要在特定舱段 */
  station?: RoomArchetype;
}

// ============================================================================
// 7. 真实性层 (Veracity Layer) —— 心灵恐怖的机械化
// ============================================================================

/**
 * 这是本作与普通恐怖游戏的分界线。
 * 系统会在玩家 SAN 低时**主动欺骗玩家的 UI 与感知**，而不是只加滤镜。
 */
export interface VeracitySystem {
  /** 当前欺骗强度 0..1 */
  readonly corruption: number;
  /** 污染一段文本 */
  text(raw: string, kind: 'ui' | 'dialogue' | 'log' | 'item'): string;
  /** 污染一个数字（HUD 显示值可能与真值不同） */
  number(raw: number, stat: string): number;
  /** 是否应当生成一个幻觉房间 */
  shouldPhantom(rng: Rng): boolean;
  /** 是否应当伪造一次事件（假脚步声、假存档、假 NPC） */
  shouldFabricate(rng: Rng, kind: FabricationKind): boolean;
  /** 注册一个"玩家已识破"的欺骗，提升 lucidity */
  debunk(id: ID): void;
  readonly activeLies: readonly Lie[];
}

export type FabricationKind =
  | 'footstep' | 'voice' | 'save-prompt' | 'fake-npc'
  | 'fake-item' | 'fake-door' | 'hud-drift' | 'false-memory'
  | 'mirrored-room' | 'impossible-geometry';

export interface Lie {
  id: ID;
  kind: FabricationKind;
  /** 玩家可通过什么手段识破 */
  tell: string;
  bornAt: Breaths;
  debunked: boolean;
}

// ============================================================================
// 8. 导演 AI —— 动态难度与节奏
// ============================================================================

/**
 * 参考 Left4Dead AI Director + Alien:Isolation 的双 AI 结构。
 * 它知道玩家全局状态，但只通过"给怪物提示"来干预，从不作弊瞬移。
 */
export interface DirectorSystem {
  /** 当前张力估值 0..1 */
  readonly tension: number;
  /** 玩家的疲劳曲线，用于安排"喘息室" */
  readonly intensity: number;
  tick(ctx: DirectorContext): readonly DirectorOrder[];
  /** 记录玩家行为画像，用于个性化恐吓 */
  profile(): PlayerProfile;
}

export interface DirectorContext {
  vitals: Readonly<Vitals>;
  world: WorldSystem;
  flags: FlagStore;
  breathsElapsed: Breaths;
  rng: Rng;
}

export type DirectorOrder =
  | { kind: 'spawn'; entity: ID; roomId: ID; reason: string }
  | { kind: 'hint'; entityId: ID; towards: ID; confidence: number }
  | { kind: 'ambience'; cue: string; intensity: number }
  | { kind: 'grant-relief'; roomId: ID }
  | { kind: 'escalate'; amount: number }
  | { kind: 'fabricate'; lie: FabricationKind };

export interface PlayerProfile {
  /** 偏好: 潜行 vs 强攻 */
  aggression: number;
  /** 搜刮彻底度 */
  thoroughness: number;
  /** 使用声呐的频率 */
  sonarReliance: number;
  /** 对话中选择的倾向 */
  piety: number;
  /** 恐慌时的行为 */
  panicResponse: 'freeze' | 'flee' | 'fight' | 'unknown';
}

// ============================================================================
// 9. 渲染与音频 (Agent E 领域)
// ============================================================================

export interface RenderFrame {
  dt: number;
  time: number;
  /** 后处理参数，由 SAN/恐惧/深度驱动 */
  post: PostParams;
}

export interface PostParams {
  /** 晕影 */
  vignette: number;
  /** 色差 */
  aberration: number;
  /** 胶片颗粒 */
  grain: number;
  /** 扫描线 */
  scanline: number;
  /** 桶形畸变 */
  barrel: number;
  /** 呼吸导致的画面起伏 */
  breathe: number;
  /** SAN 导致的几何扭曲 */
  warp: number;
  /** 泛光 */
  bloom: number;
  /** 水下折射 */
  caustics: number;
  /** 整体曝光 */
  exposure: number;
  /** 色调 [r,g,b] 乘子 */
  tint: [number, number, number];
  /** 静电噪声 */
  static: number;
  /** 边缘收缩(CO2 过高) */
  tunnel: number;
}

export interface AudioSystem {
  init(): Promise<void>;
  /** 播放一个程序化音效 cue */
  cue(name: string, opts?: { gain?: number; pan?: number; detune?: number }): void;
  /** 设置环境音床 */
  ambience(name: string, intensity: number): void;
  /** 心跳速率跟随恐惧 */
  setHeartRate(bpm: number): void;
  /** 声呐脉冲 + 回波 */
  sonarPing(power: number, echoes: readonly { delay: number; gain: number; pan: number }[]): void;
  setMasterGain(g: number): void;
  /** 低理智时的耳鸣与假声 */
  setCorruption(level: number): void;
}

// ============================================================================
// 10. 游戏总状态 & 存档
// ============================================================================

export type GamePhase =
  | 'boot' | 'title' | 'intro' | 'explore' | 'narrative'
  | 'encounter' | 'inventory' | 'map' | 'death' | 'ending' | 'meta';

export interface GameState {
  seed: Seed;
  /** 第几次轮回 */
  cycle: number;
  phase: GamePhase;
  breathsElapsed: Breaths;
  depth: number;
  /** 继承的知识节点 */
  knowledge: readonly ID[];
  stigmata: Record<StigmaKind, number>;
  flags: Record<string, FlagValue>;
}

export interface SaveBlob {
  version: number;
  savedAt: number;
  state: GameState;
  vitals: unknown;
  world: unknown;
  narrative: unknown;
  encounter: unknown;
  inventory: unknown;
  meta: MetaProgress;
}

/** 跨轮回的元进度 */
export interface MetaProgress {
  cyclesPlayed: number;
  endingsSeen: readonly ID[];
  knowledgeUnlocked: readonly ID[];
  deepestDepth: number;
  totalBreaths: number;
  /** 图鉴: 已认知的实体 */
  bestiary: Record<ID, number>;
}

// ============================================================================
// 11. 事件总线
// ============================================================================

export interface GameEvents {
  'phase:change': { from: GamePhase; to: GamePhase };
  'breath:spent': { amount: Breaths; reason: string };
  'vitals:change': { vitals: Readonly<Vitals> };
  'room:enter': { roomId: ID; first: boolean };
  'sonar:ping': SonarResult;
  'noise:made': { roomId: ID; amount: number; source: string };
  'narrative:node': { nodeId: ID };
  'narrative:choice': { nodeId: ID; choiceId: ID };
  'encounter:begin': { id: ID };
  'encounter:end': { outcome: string };
  'item:gain': { item: ID; count: number };
  'knowledge:gain': { node: ID };
  'stigma:change': { kind: StigmaKind; value: number };
  'director:order': DirectorOrder;
  'lie:born': Lie;
  'lie:debunked': Lie;
  'death': { cause: DeathCause };
  'ending': { id: ID };
  'log': { text: string; tone: LogTone };
  'shake': { amount: number };
  'world:event': WorldEvent;
}

export type LogTone = 'neutral' | 'good' | 'bad' | 'eerie' | 'system' | 'whisper';

export interface EventBus {
  on<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): () => void;
  once<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): () => void;
  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void;
  off<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): void;
}
