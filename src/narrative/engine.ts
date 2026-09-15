/**
 * NarrativeEngine —— 分支叙事引擎。
 *
 * 职责边界：
 *  - 求值 Condition（11 种 op，含 all/any/not 递归）
 *  - 执行 Effect（contract 里的全部 17 种 op；对本模块之外的 op 通过 bridge 转发）
 *  - 渲染文本（{{插值}} + 按 SAN 选 corruptedText）
 *  - 选项三种门控：hide / disable / lie
 *  - 结局判定（按 priority，报告冲突）
 *  - 历史、回溯、once 持久化、跨轮回知识继承
 *  - serialize / hydrate 完整往返
 *
 * 它**不**知道地图、战斗、渲染怎么实现。所有外部动作经由 NarrativeHost 转发，
 * 缺失的 bridge 会退化成内部影子状态 —— 这让引擎可以在校验器里无头运行。
 */

import type {
  Breaths,
  Cmp,
  Condition,
  Effect,
  Ending,
  EventBus,
  FlagStore,
  FlagValue,
  ID,
  InventorySystem,
  NarrativeChoice,
  NarrativeNode,
  NarrativeSystem,
  Rng,
  RoomArchetype,
  StigmaKind,
  Vitals,
} from '../core/contract';
import { KnowledgeTree } from './knowledge';
import type { KnowledgeDef } from './knowledge';

// ---------------------------------------------------------------------------
// 宿主接口
// ---------------------------------------------------------------------------

export interface NarrativeWorldBridge {
  archetype(): RoomArchetype;
  depth(): number;
  addNoise(amount: number): void;
  unlockDoor(doorId: ID): void;
  reweave(intensity: number): void;
  spawn(entityId: ID, where?: ID): void;
}

export interface NarrativeVitalsBridge {
  read(): Readonly<Vitals>;
  modify(stat: keyof Vitals, delta: number): void;
  applyStatus(effectId: ID, duration?: Breaths): void;
  removeStatus(effectId: ID): void;
}

export interface NarrativeHost {
  flags: FlagStore;
  rng: Rng;
  bus?: EventBus | null;
  vitals?: NarrativeVitalsBridge | null;
  inventory?: InventorySystem | null;
  world?: NarrativeWorldBridge | null;
  /** 教团标记。若不提供则由引擎自持（存档在 narrative 区） */
  stigmata?: Record<StigmaKind, number> | null;
  cycle?: () => number;
  breaths?: () => number;
  onEncounter?: (id: ID) => void;
  onEnding?: (id: ID) => void;
  onBreath?: (amount: Breaths, reason: string) => void;
}

export interface StoryPack {
  nodes: readonly NarrativeNode[];
  endings: readonly Ending[];
  knowledge: readonly KnowledgeDef[];
  /** 可以从外部（世界/道具/导演）直接进入的节点 */
  entries: readonly ID[];
}

export type ChoiceState = 'open' | 'disabled' | 'lying' | 'spent';

export interface VisibleChoice {
  choice: NarrativeChoice;
  state: ChoiceState;
  /** 给 UI 的灰显理由；'lying' 状态下**必须**是 undefined，否则就泄底了 */
  reason?: string;
}

export interface HistoryEntry {
  node: ID;
  choice: ID | null;
  /** 当时的呼吸计数 */
  at: Breaths;
}

export interface EndingVerdict {
  chosen: Ending | null;
  /** 所有条件成立的结局，按 priority 降序。长度 > 1 = 发生了冲突 */
  candidates: readonly Ending[];
}

interface Snapshot {
  current: ID | null;
  history: HistoryEntry[];
  visits: [ID, number][];
  spent: string[];
  stigmata: Record<StigmaKind, number>;
  knowledge: unknown;
  bag: [ID, number][];
  lieCount: number;
  shadowSan: number;
  endingId: ID | null;
}

const ZERO_STIGMATA: Record<StigmaKind, number> = {
  silence: 0,
  listening: 0,
  drowned: 0,
  iron: 0,
  flesh: 0,
  apostasy: 0,
};

/** 引擎内部影子生理值 —— 只在没有 VitalsSystem 的情况下（校验器、测试）使用 */
const SHADOW_VITALS: Vitals = {
  oxygen: 900,
  oxygenMax: 900,
  san: 100,
  sanMax: 100,
  coreTemp: 36.6,
  co2: 0,
  trauma: 0,
  infection: 0,
  fatigue: 0,
  fear: 0,
};

/** 自动跳转链的上限。超过就是内容写成了环，宁可早崩。 */
const MAX_AUTO_HOPS = 64;

export class NarrativeEngine implements NarrativeSystem {
  readonly nodes: ReadonlyMap<ID, NarrativeNode>;
  readonly endings: readonly Ending[];
  readonly entries: readonly ID[];
  readonly knowledge: KnowledgeTree;

  private host: NarrativeHost;
  private cur: NarrativeNode | null = null;
  private hist: HistoryEntry[] = [];
  private visits = new Map<ID, number>();
  /** `${nodeId}::${choiceId}` —— once 选项的持久化 */
  private spent = new Set<string>();
  private ownStigmata: Record<StigmaKind, number> = { ...ZERO_STIGMATA };
  /** 没有 InventorySystem 时的影子背包 */
  private bag = new Map<ID, number>();
  private shadow: Vitals = { ...SHADOW_VITALS };
  private lieCount = 0;
  private endingId: ID | null = null;
  /** onEnter 里的 goto 需要打断默认流转 */
  private redirect: ID | null = null;
  /** 校验器用的钩子：忽略 vital/in-room/depth 条件，一律视为可满足 */
  permissiveEnvironment = false;

  constructor(pack: StoryPack, host: NarrativeHost) {
    const m = new Map<ID, NarrativeNode>();
    for (const n of pack.nodes) {
      if (m.has(n.id)) throw new Error(`[narrative] 重复节点 id: ${n.id}`);
      m.set(n.id, n);
    }
    this.nodes = m;
    this.endings = [...pack.endings].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    this.entries = pack.entries;
    this.knowledge = new KnowledgeTree(pack.knowledge);
    this.host = host;
  }

  // -------------------------------------------------------------------------
  // 状态读取
  // -------------------------------------------------------------------------

  get currentNode(): NarrativeNode | null {
    return this.cur;
  }

  get history(): readonly HistoryEntry[] {
    return this.hist;
  }

  get stigmata(): Readonly<Record<StigmaKind, number>> {
    return this.host.stigmata ?? this.ownStigmata;
  }

  get resolvedEnding(): ID | null {
    return this.endingId;
  }

  /** 被吞下的谎言数 —— Veracity Layer 的记分板 */
  get liesSwallowed(): number {
    return this.lieCount;
  }

  visitCount(id: ID): number {
    return this.visits.get(id) ?? 0;
  }

  node(id: ID): NarrativeNode {
    const n = this.nodes.get(id);
    if (!n) throw new Error(`[narrative] 不存在的节点: ${id}`);
    return n;
  }

  private vitals(): Readonly<Vitals> {
    return this.host.vitals ? this.host.vitals.read() : this.shadow;
  }

  private cycle(): number {
    return this.host.cycle ? this.host.cycle() : this.host.flags.getNum('count.cycle', 0);
  }

  private breaths(): number {
    return this.host.breaths ? this.host.breaths() : 0;
  }

  private log(text: string, tone: 'neutral' | 'good' | 'bad' | 'eerie' | 'system' | 'whisper'): void {
    this.host.bus?.emit('log', { text, tone });
  }

  // -------------------------------------------------------------------------
  // 流转
  // -------------------------------------------------------------------------

  start(nodeId: ID): void {
    this.endingId = null;
    this.enter(nodeId);
  }

  /** 关闭对话（回到探索）。不清历史。 */
  close(): void {
    this.cur = null;
  }

  private enter(nodeId: ID): void {
    let id: ID | null = nodeId;
    let hops = 0;
    while (id) {
      if (++hops > MAX_AUTO_HOPS) {
        throw new Error(`[narrative] 自动跳转超过 ${MAX_AUTO_HOPS} 跳，起点 ${nodeId}，疑似节点环`);
      }
      const n = this.node(id);
      this.cur = n;
      this.visits.set(n.id, (this.visits.get(n.id) ?? 0) + 1);
      this.hist.push({ node: n.id, choice: null, at: this.breaths() });
      this.host.bus?.emit('narrative:node', { nodeId: n.id });

      this.redirect = null;
      if (n.knowledge) this.grantKnowledge(n.id);
      this.run(n.onEnter);

      if (this.endingId) return;
      if (this.redirect) {
        id = this.redirect;
        this.redirect = null;
        continue;
      }
      if (n.choices.length === 0 && n.next) {
        id = n.next;
        continue;
      }
      return;
    }
  }

  /** 玩家可见的选项列表。UI 只应该读这个，不要直接读 node.choices。 */
  visibleChoices(): VisibleChoice[] {
    const n = this.cur;
    if (!n) return [];
    const out: VisibleChoice[] = [];
    for (const ch of n.choices) {
      const used = ch.once === true && this.spent.has(this.spentKey(n.id, ch.id));
      if (used) continue;
      const ok = this.test(ch.requires);
      if (ok) {
        out.push({ choice: ch, state: 'open' });
        continue;
      }
      const mode = ch.gateMode ?? 'hide';
      if (mode === 'hide') continue;
      if (mode === 'disable') {
        out.push({ choice: ch, state: 'disabled', reason: describeCondition(ch.requires) });
        continue;
      }
      // 'lie': 看上去和 open 一模一样。没有理由字段，没有纹理差异。
      out.push({ choice: ch, state: 'lying' });
    }
    return out;
  }

  choose(choiceId: ID): void {
    const n = this.cur;
    if (!n) {
      this.log('没有正在进行的对话。', 'system');
      return;
    }
    const ch = n.choices.find((x) => x.id === choiceId);
    if (!ch) {
      this.log(`选项不存在: ${choiceId}`, 'system');
      return;
    }
    if (ch.once === true && this.spent.has(this.spentKey(n.id, ch.id))) {
      this.log('这句话你已经说过了。', 'system');
      return;
    }

    const satisfied = this.test(ch.requires);
    const mode = ch.gateMode ?? 'hide';

    if (!satisfied && mode !== 'lie') {
      // hide/disable 被点到 = UI 状态过期。不惩罚，只拒绝。
      this.log('做不到。', 'system');
      return;
    }

    // 呼吸先付。说话也要呼吸，这是本作的第一条规则。
    if (ch.cost) this.spend(ch.cost, `dialogue:${n.id}/${ch.id}`);

    if (!satisfied && mode === 'lie') {
      this.swallowLie(n, ch);
      return;
    }

    if (ch.once === true) this.spent.add(this.spentKey(n.id, ch.id));
    this.hist.push({ node: n.id, choice: ch.id, at: this.breaths() });
    this.host.bus?.emit('narrative:choice', { nodeId: n.id, choiceId: ch.id });

    this.redirect = null;
    this.run(ch.effects);
    if (this.endingId) return;

    const dest = this.redirect ?? ch.goto ?? (n.choices.length ? null : n.next) ?? null;
    this.redirect = null;
    if (dest) this.enter(dest);
    else this.cur = null;
  }

  /**
   * lie 门控的核心：玩家点了一个他其实没有资格点的选项。
   * 系统**先假装执行**（UI 会短暂显示它成功了），然后揭穿。
   * 代价是真的：呼吸已经花了，噪音已经发出去了，SAN 掉了。
   */
  private swallowLie(n: NarrativeNode, ch: NarrativeChoice): void {
    this.lieCount++;
    this.host.flags.add('count.lies-swallowed', 1);
    this.modifyVital('san', -6);
    this.modifyVital('fear', 9);
    this.host.bus?.emit('narrative:choice', { nodeId: n.id, choiceId: ch.id });
    this.hist.push({ node: n.id, choice: ch.id, at: this.breaths() });
    const target = this.lieNodeFor(n.id, ch.id);
    if (target) this.enter(target);
    else {
      this.log('你的手做了那个动作。你的手没有做那个动作。', 'whisper');
      this.cur = n;
    }
  }

  private lieNodeFor(nodeId: ID, choiceId: ID): ID | null {
    const specific = `lie.${nodeId}::${choiceId}`;
    if (this.nodes.has(specific)) return specific;
    const byChoice = `lie.${choiceId}`;
    if (this.nodes.has(byChoice)) return byChoice;
    const generics: ID[] = [];
    for (const [id, n] of this.nodes) if (n.tags?.includes('lie-generic')) generics.push(id);
    if (!generics.length) return null;
    generics.sort();
    return generics[this.host.rng.int(0, generics.length - 1)];
  }

  private spentKey(nodeId: ID, choiceId: ID): string {
    return `${nodeId}::${choiceId}`;
  }

  // -------------------------------------------------------------------------
  // 回溯
  // -------------------------------------------------------------------------

  /** 上一个"可回溯"的节点。只有 tags 含 'hub' 的节点允许退回。 */
  backTarget(): ID | null {
    for (let i = this.hist.length - 2; i >= 0; i--) {
      const h = this.hist[i];
      if (h.choice !== null) continue;
      const n = this.nodes.get(h.node);
      if (n?.tags?.includes('hub')) return n.id;
    }
    return null;
  }

  back(): boolean {
    const t = this.backTarget();
    if (!t) return false;
    this.enter(t);
    return true;
  }

  /** 已经读过的节点（用于"回忆"界面与不可达统计） */
  seenNodes(): ID[] {
    return [...this.visits.keys()];
  }

  // -------------------------------------------------------------------------
  // 条件求值
  // -------------------------------------------------------------------------

  test(cond: Condition | undefined): boolean {
    if (!cond) return true;
    switch (cond.op) {
      case 'always':
        return true;
      case 'flag':
        return compare(this.host.flags.get(cond.key), cond.cmp, cond.value);
      case 'vital':
        if (this.permissiveEnvironment) return true;
        return compare(this.vitals()[cond.stat], cond.cmp, cond.value);
      case 'has-item':
        return this.itemCount(cond.item) >= (cond.count ?? 1);
      case 'has-knowledge':
        return this.knowledge.has(cond.node);
      case 'stigma':
        return compare(this.stigmata[cond.stigma] ?? 0, cond.cmp, cond.value);
      case 'in-room':
        if (this.permissiveEnvironment) return true;
        return this.host.world ? this.host.world.archetype() === cond.archetype : false;
      case 'depth':
        if (this.permissiveEnvironment) return true;
        return compare(this.host.world ? this.host.world.depth() : 0, cond.cmp, cond.value);
      case 'all':
        return cond.of.every((c) => this.test(c));
      case 'any':
        return cond.of.some((c) => this.test(c));
      case 'not':
        return !this.test(cond.of);
    }
  }

  private itemCount(id: ID): number {
    if (this.host.inventory) return this.host.inventory.count(id);
    return this.bag.get(id) ?? 0;
  }

  // -------------------------------------------------------------------------
  // 效果执行
  // -------------------------------------------------------------------------

  run(effects: readonly Effect[] | undefined): void {
    if (!effects) return;
    for (const e of effects) {
      if (this.endingId) return; // 结局一旦落定，后续效果不再执行
      this.exec(e);
    }
  }

  private exec(e: Effect): void {
    switch (e.op) {
      case 'flag':
        this.host.flags.set(e.key, e.value);
        return;
      case 'flag-add':
        this.host.flags.add(e.key, e.delta);
        return;
      case 'vital':
        this.modifyVital(e.stat, e.delta);
        return;
      case 'status':
        this.host.vitals?.applyStatus(e.effect, e.duration);
        this.host.flags.set(`sys.status.${e.effect}`, true);
        return;
      case 'remove-status':
        this.host.vitals?.removeStatus(e.effect);
        this.host.flags.set(`sys.status.${e.effect}`, false);
        return;
      case 'item':
        this.giveItem(e.item, e.count);
        return;
      case 'knowledge':
        this.grantKnowledge(e.node);
        return;
      case 'stigma': {
        const store = this.host.stigmata ?? this.ownStigmata;
        store[e.stigma] = Math.max(0, (store[e.stigma] ?? 0) + e.delta);
        this.host.flags.set(`sys.stigma.${e.stigma}`, store[e.stigma]);
        this.host.bus?.emit('stigma:change', { kind: e.stigma, value: store[e.stigma] });
        return;
      }
      case 'noise':
        this.host.world?.addNoise(e.amount);
        this.host.bus?.emit('noise:made', {
          roomId: 'narrative',
          amount: e.amount,
          source: this.cur?.id ?? 'narrative',
        });
        return;
      case 'spawn':
        this.host.world?.spawn(e.entity, e.where);
        return;
      case 'unlock-door':
        this.host.world?.unlockDoor(e.door);
        this.host.flags.set(`sys.door.${e.door}`, 'open');
        return;
      case 'reweave':
        this.host.world?.reweave(e.intensity);
        return;
      case 'goto':
        this.redirect = e.node;
        return;
      case 'encounter':
        this.host.onEncounter?.(e.encounter);
        this.host.bus?.emit('encounter:begin', { id: e.encounter });
        return;
      case 'ending':
        this.endingId = e.ending;
        this.host.onEnding?.(e.ending);
        this.host.bus?.emit('ending', { id: e.ending });
        return;
      case 'sfx':
        this.host.bus?.emit('log', { text: '', tone: 'system' });
        this.host.flags.set('sys.last-cue', e.cue);
        return;
      case 'camera':
        if (typeof e.shake === 'number') this.host.bus?.emit('shake', { amount: e.shake });
        if (e.fade) this.host.flags.set('sys.fade', e.fade);
        return;
    }
  }

  private modifyVital(stat: keyof Vitals, delta: number): void {
    if (this.host.vitals) {
      this.host.vitals.modify(stat, delta);
      return;
    }
    const v = this.shadow;
    const next = (v[stat] as number) + delta;
    if (stat === 'san') v.san = clampNum(next, 0, v.sanMax);
    else if (stat === 'oxygen') v.oxygen = clampNum(next, 0, v.oxygenMax);
    else v[stat] = clampNum(next, 0, 100);
  }

  private giveItem(id: ID, count: number): void {
    if (this.host.inventory) {
      if (count >= 0) this.host.inventory.add(id, count);
      else this.host.inventory.remove(id, -count);
      return;
    }
    const cur = this.bag.get(id) ?? 0;
    const next = Math.max(0, cur + count);
    if (next === 0) this.bag.delete(id);
    else this.bag.set(id, next);
  }

  private grantKnowledge(id: ID): void {
    if (!this.knowledge.defs.has(id)) {
      this.log(`未注册的知识节点: ${id}`, 'system');
      return;
    }
    const fresh = this.knowledge.learn(id, this.cycle());
    this.syncKnowledgeFlags();
    if (!fresh) return;
    this.host.bus?.emit('knowledge:gain', { node: id });
    const def = this.knowledge.defs.get(id);
    if (def) this.log(def.revealText, 'eerie');
  }

  /**
   * 知识 → 旗标的单向投影。
   * 内容侧一律用 `has-knowledge` 条件，这些旗标只给结局条件与 UI 用，
   * 所以它们在 EXTERNAL_FLAGS 里被登记为"引擎所有"。
   */
  private syncKnowledgeFlags(): void {
    const f = this.host.flags;
    f.set('count.knowledge', this.knowledge.count());
    f.set('count.knowledge-canon', this.knowledge.canonCount());
    f.set('count.truth-layer', this.knowledge.deepestLayer());
    f.set('count.cycles-witnessed', this.knowledge.cyclesWitnessed());
  }

  private spend(amount: Breaths, reason: string): void {
    this.host.onBreath?.(amount, reason);
    this.host.bus?.emit('breath:spent', { amount, reason });
    if (!this.host.vitals) this.shadow.oxygen = Math.max(0, this.shadow.oxygen - amount);
  }

  // -------------------------------------------------------------------------
  // 结局
  // -------------------------------------------------------------------------

  resolveEnding(): Ending | null {
    return this.endingVerdict().chosen;
  }

  /**
   * 结局判定。endings 已按 priority 降序排好。
   * 条件冲突（多个成立）不是 bug，是设计：高 priority 赢，其余记录下来给
   * "你本来还可以……"界面用。这也是校验器检查优先级设计合理性的入口。
   */
  endingVerdict(): EndingVerdict {
    if (this.endingId) {
      const forced = this.endings.find((e) => e.id === this.endingId) ?? null;
      return { chosen: forced, candidates: forced ? [forced] : [] };
    }
    const candidates = this.endings.filter((e) => this.test(e.requires));
    if (candidates.length > 1) {
      this.host.flags.set('sys.ending.conflicts', candidates.map((e) => e.id).join(','));
    }
    return { chosen: candidates[0] ?? null, candidates };
  }

  /** 强制落定一个结局（月池最终抉择等由内容直接指定的情况） */
  forceEnding(id: ID): void {
    this.exec({ op: 'ending', ending: id });
  }

  // -------------------------------------------------------------------------
  // 文本
  // -------------------------------------------------------------------------

  renderText(node: NarrativeNode): string {
    return this.interpolate(this.variant(node));
  }

  /** 按 SAN 选文本变体：取所有已触发阈值中**最低**的那一条（最坏的版本） */
  variant(node: NarrativeNode): string {
    const vs = node.corruptedText;
    if (!vs || vs.length === 0) return node.text;
    const san = this.vitals().san;
    let best: { belowSan: number; text: string } | null = null;
    for (const v of vs) {
      if (san >= v.belowSan) continue;
      if (!best || v.belowSan < best.belowSan) best = v;
    }
    return best ? best.text : node.text;
  }

  /** 渲染一个选项的 label（同样支持插值） */
  renderLabel(choice: NarrativeChoice): string {
    return this.interpolate(choice.label);
  }

  /**
   * {{token}} 插值。支持：
   *   {{met.dorn}}          旗标值
   *   {{count.cycle|1}}     带默认值
   *   {{@cycle}} {{@ordinal}} {{@san}} {{@oxygen}} {{@depth}} {{@layer}} {{@knowledge}}
   *   {{#k.sample-n}}       知识标题；未获得时显示 '——'
   */
  private interpolate(raw: string): string {
    return raw.replace(/\{\{([^}]+)\}\}/g, (_m, body: string) => {
      const [tokenRaw, fallbackRaw] = body.split('|');
      const token = tokenRaw.trim();
      const fallback = fallbackRaw === undefined ? '' : fallbackRaw;
      if (token.startsWith('@')) return this.special(token.slice(1)) ?? fallback;
      if (token.startsWith('#')) {
        const id = token.slice(1);
        const def = this.knowledge.defs.get(id);
        if (!def) return fallback || '——';
        return this.knowledge.has(id) ? def.title : fallback || '——';
      }
      const v = this.host.flags.get(token);
      if (v === undefined || v === null) return fallback;
      if (typeof v === 'boolean') return v ? '是' : '否';
      return String(v);
    });
  }

  private special(key: string): string | null {
    const v = this.vitals();
    switch (key) {
      case 'cycle':
        return String(this.cycle());
      case 'ordinal':
        return chineseOrdinal(this.cycle() + 1);
      case 'san':
        return String(Math.round(v.san));
      case 'oxygen':
        return String(Math.round(v.oxygen));
      case 'depth':
        return String(Math.round(this.host.world ? this.host.world.depth() : 0));
      case 'layer':
        return String(this.knowledge.deepestLayer());
      case 'knowledge':
        return String(this.knowledge.count());
      case 'canon':
        return `${this.knowledge.canonCount()}/${this.knowledge.canonTotal()}`;
      case 'lies':
        return String(this.lieCount);
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // 轮回与存档
  // -------------------------------------------------------------------------

  /**
   * 轮回重置。知识**不**清；once 记录只保留标记为 permanent 的节点；
   * 历史清空但"读过"的计数保留给"这句话你听过"的判定。
   */
  resetForCycle(): void {
    this.cur = null;
    this.hist = [];
    this.endingId = null;
    this.lieCount = 0;
    this.bag.clear();
    this.shadow = { ...SHADOW_VITALS };
    const keep = new Set<string>();
    for (const key of this.spent) {
      const nodeId = key.split('::')[0];
      if (this.nodes.get(nodeId)?.tags?.includes('permanent')) keep.add(key);
    }
    this.spent = keep;
    if (!this.host.stigmata) this.ownStigmata = { ...ZERO_STIGMATA };
    this.syncKnowledgeFlags();
  }

  serialize(): unknown {
    const snap: Snapshot = {
      current: this.cur?.id ?? null,
      history: this.hist.map((h) => ({ ...h })),
      visits: [...this.visits],
      spent: [...this.spent],
      stigmata: { ...(this.host.stigmata ?? this.ownStigmata) },
      knowledge: this.knowledge.serialize(),
      bag: [...this.bag],
      lieCount: this.lieCount,
      shadowSan: this.shadow.san,
      endingId: this.endingId,
    };
    return snap;
  }

  hydrate(data: unknown): void {
    const d = (data ?? {}) as Partial<Snapshot>;
    this.hist = (d.history ?? []).map((h) => ({ ...h }));
    this.visits = new Map(d.visits ?? []);
    this.spent = new Set(d.spent ?? []);
    this.bag = new Map(d.bag ?? []);
    this.lieCount = d.lieCount ?? 0;
    this.endingId = d.endingId ?? null;
    this.shadow = { ...SHADOW_VITALS, san: d.shadowSan ?? SHADOW_VITALS.san };
    const st = { ...ZERO_STIGMATA, ...(d.stigmata ?? {}) };
    if (this.host.stigmata) Object.assign(this.host.stigmata, st);
    else this.ownStigmata = st;
    this.knowledge.hydrate(d.knowledge);
    this.syncKnowledgeFlags();
    this.cur = d.current ? (this.nodes.get(d.current) ?? null) : null;
  }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function compare(left: FlagValue | undefined, cmp: Cmp, right: FlagValue): boolean {
  // 未设置的旗标按类型取零值，这样 `count.x >= 1` 在从未计数时自然为 false
  const l = left === undefined ? defaultFor(right) : left;
  switch (cmp) {
    case '==':
      return l === right;
    case '!=':
      return l !== right;
    default:
      break;
  }
  const ln = toNum(l);
  const rn = toNum(right);
  switch (cmp) {
    case '>':
      return ln > rn;
    case '<':
      return ln < rn;
    case '>=':
      return ln >= rn;
    case '<=':
      return ln <= rn;
  }
}

function defaultFor(sample: FlagValue): FlagValue {
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  return '';
}

function toNum(v: FlagValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function chineseOrdinal(n: number): string {
  if (n < 0) return '负' + chineseOrdinal(-n);
  if (n < 10) return CN_DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
  if (n < 100) {
    const t = Math.floor(n / 10);
    return CN_DIGITS[t] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '');
  }
  return String(n);
}

/** 灰显选项的提示文本。刻意写得干，不解释机制。 */
export function describeCondition(cond: Condition | undefined): string {
  if (!cond) return '';
  switch (cond.op) {
    case 'always':
      return '';
    case 'flag':
      return '你还没有这么做过。';
    case 'vital':
      return cond.stat === 'san' ? '你现在太清醒了。' : '身体不允许。';
    case 'has-item':
      return '手里没有东西。';
    case 'has-knowledge':
      return '你不明白这句话的意思。';
    case 'stigma':
      return '你身上的标记不对。';
    case 'in-room':
      return '不在这里。';
    case 'depth':
      return '深度不够。';
    case 'all':
    case 'any':
      return cond.of.map(describeCondition).find((s) => s.length > 0) ?? '做不到。';
    case 'not':
      return describeCondition(cond.of);
  }
}

/** 给校验器与无头运行用的最小宿主 */
export function headlessHost(flags: FlagStore, rng: Rng): NarrativeHost {
  return { flags, rng };
}
