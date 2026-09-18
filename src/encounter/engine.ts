/**
 * 遭遇引擎 —— GDD §4.5 的三相结构。
 *
 * 三相不是"阶段名字"，是三套**完全不同的输入语法**：
 *
 *   STALK   你不知道它在哪，它不知道你在哪。你做的每件事都在往它的坐标系里填数。
 *           这一相的动作全部关于"减少自己的输出"：屏息、缓移、熄灯、涂油、卸下圣物。
 *   CONTACT 部位定向的攻防。摧毁部位会**真的改写它的行为表**（失去一条感知通道、
 *           被禁掉某种意图、接近速度减半），而不是只扣一个数。
 *   PANIC   fear ≥ 85 强制进入。动作表被打乱、一部分按键失灵、一部分按键执行成别的动作。
 *           这一相是机制，不是滤镜：`panicMap` 与 `lockedActions` 每回合重算。
 *
 * 另有一条贯穿全程的暗线：`listenerPressure`。任何噪音都在往里加，
 * 加满了 THE LISTENER 就开始朝这里来 —— 所以"打得快"和"打得安静"是两个互斥的目标。
 */

import type {
  Breaths,
  CombatAction,
  CombatContext,
  CombatOutcome,
  DeathCause,
  Effect,
  Entity,
  EntityIntent,
  EncounterState,
  FlagStore,
  ID,
  InventorySystem,
  LogTone,
  Rng,
  RoomArchetype,
  SimContext,
  StatusEffect,
  StigmaKind,
  EncounterSystem,
  VitalsSystem,
} from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { Xoshiro } from '../core/rng';
import { enemyDef, encounterPreset, hasEnemyDef } from '../content/bestiary/index';
import { itemDef, maybeItem } from '../content/items/index';
import { ALL_ACTIONS, actionDef, bandLabel, toCombatAction } from './actions';
import {
  activeSenses,
  bandAt,
  bandIndex,
  bandOf,
  behaviorOf,
  bumpAwareness,
  defOf,
  emitNoise,
  findEntity,
  freshBehavior,
  heatSignature,
  liveEntities,
  livingParts,
  mkOutcome,
  recomputeBehavior,
  setBand,
  shiftBand,
} from './combat-math';
import { CognitionLedger } from './cognition';
import { applyEffects, testCondition } from './conditions';
import type {
  ActionDef,
  Decoy,
  EnemyDef,
  EncounterRuntime,
  IntentWeight,
  Masking,
  Sense,
  VitalsPatchFn,
} from './types';

export interface EncounterEngineOptions {
  vitals: VitalsSystem;
  inventory: InventorySystem;
  flags: FlagStore;
  /**
   * 写 Vitals 的通道。契约把 `VitalsSystem.vitals` 标为 Readonly，
   * 但遭遇必须能写 trauma / fear / co2。宿主应当注入一个写入器；
   * 未注入时退化为直写（见 docs/encounter-spec.md 的 CONTRACT CHANGE REQUEST）。
   */
  patchVitals?: VitalsPatchFn;
  ledger?: CognitionLedger;
  stigma?: () => Record<StigmaKind, number>;
  statusLookup?: (id: ID) => StatusEffect | undefined;
  /** 本模块不负责的效果（Stigma / spawn / reweave / ending）转交宿主 */
  forward?: (effects: readonly Effect[]) => void;
  log?: (text: string, tone: LogTone) => void;
  roomArchetype?: () => RoomArchetype | undefined;
  /** 把 SimEvent 里的死亡转给宿主 */
  onDeath?: (cause: DeathCause) => void;
}

const EMPTY_MASK: Masking = { sound: 0, heat: 0, vibration: 0, faith: 0, light: 0 };

export class EncounterEngine implements EncounterSystem {
  private rtState: EncounterRuntime | null = null;
  private ctx: SimContext | null = null;
  private readonly o: EncounterEngineOptions;
  readonly ledger: CognitionLedger;
  /** 上一场遭遇的结果，供宿主在 end() 之后读取 */
  lastOutcome: 'escaped' | 'killed' | 'died' | 'spared' | null = null;

  constructor(opts: EncounterEngineOptions) {
    this.o = opts;
    this.ledger = opts.ledger ?? new CognitionLedger();
  }

  get state(): EncounterState | null {
    return this.rtState;
  }

  /** 引擎内部完整状态（模拟器与 UI 需要看掩蔽度、诱饵、恐慌映射） */
  get runtime(): EncounterRuntime | null {
    return this.rtState;
  }

  // =========================================================================
  // 开场
  // =========================================================================

  begin(encounterId: ID, ctx: SimContext): void {
    this.ctx = ctx;
    const preset = encounterPreset(encounterId);
    const defIds = preset ? preset.entities : hasEnemyDef(encounterId) ? [encounterId] : [];
    if (!defIds.length) throw new Error(`[encounter] 无法解析遭遇 id: ${encounterId}`);

    const rng = ctx.rng.fork(`encounter/${encounterId}`);
    const entities: Entity[] = [];
    const distance: Record<ID, ReturnType<typeof bandOf>> = {};
    const defs = new Map<ID, EnemyDef>();
    const cogTier: Record<ID, 0 | 1 | 2 | 3> = {};

    defIds.forEach((defId, i) => {
      const def = enemyDef(defId);
      defs.set(defId, def);
      const e = this.spawn(def, i, preset?.initialAwareness ?? 0.05);
      entities.push(e);
      distance[e.id] = preset?.initialBand ?? 'far';
      cogTier[defId] = this.ledger.tierIndex(defId);
    });

    const masking: Masking = { ...EMPTY_MASK };
    if (preset?.ambientMask) {
      for (const k of Object.keys(preset.ambientMask) as Sense[]) {
        masking[k] = preset.ambientMask[k] ?? 0;
      }
    }
    // 背包上的被动掩蔽（石棉布、软底鞋套）在开场就生效
    const passive = this.passiveMasking();
    for (const k of Object.keys(passive) as Sense[]) masking[k] = Math.max(masking[k], passive[k] ?? 0);

    const rt: EncounterRuntime = {
      __runtime: true,
      id: encounterId,
      entities,
      defs,
      rng,
      flags: this.o.flags,
      ambient: ctx.ambient,
      depth: ctx.depth,
      stigma: this.o.stigma?.() ?? this.readStigma(),
      distance,
      light: preset?.light ?? 0.3,
      noise: 0,
      round: 1,
      escapable: preset?.escapable ?? true,
      phase: preset?.startPhase ?? 'stalk',
      masking,
      holdingBreath: false,
      heldBreathRounds: 0,
      movement: 0,
      noiseDelta: 0,
      faithSignature: this.faithSignature(),
      heatSignature: 0,
      decoys: [],
      destroyed: new Set(),
      behaviors: new Map(),
      panicMap: {},
      lockedActions: new Set(),
      restrained: false,
      restrainedBy: null,
      listenerPressure: 0,
      reinforcements: 0,
      escapeProgress: 0,
      markedExit: this.o.flags.getBool('did.marked-door'),
      silentStreak: 0,
      negotiation: 0,
      adaptive: new Map(),
      cogTier,
      ledger: this.ledger,
      log: [],
      actionUse: {},
      lastCost: 0,
      pending: [],
      outcome: null,
    };
    rt.heatSignature = heatSignature(rt, this.o.vitals.vitals.coreTemp);
    for (const e of entities) rt.behaviors.set(e.id, freshBehavior());

    this.rtState = rt;
    this.lastOutcome = null;

    if (preset) this.emit(`—— ${preset.title} ——`, 'system');
    if (preset) this.emit(preset.intro, 'eerie');
    for (const e of entities) this.emit(defOf(e).onSpawnLog, 'eerie');
    // 开场就给每个敌人挑一个意图，这样第一回合玩家就有 telegraph 可读
    for (const e of entities) this.chooseIntent(rt, e);
  }

  private spawn(def: EnemyDef, index: number, awareness: number): Entity {
    const view = this.ledger.view(def.id);
    return {
      id: `${def.id}#${index}`,
      defId: def.id,
      name: view.name,
      cognition: this.ledger.value(def.id),
      hp: def.hpMax,
      hpMax: def.hpMax,
      parts: def.parts.map((p) => ({
        id: p.id,
        name: view.chartFidelity >= 0.5 ? p.name : p.falseName,
        hp: p.hp,
        hpMax: p.hp,
        evasion: p.evasion,
        armor: p.armor,
        vital: p.vital,
        onDestroy: p.effects,
      })),
      senses: def.senses,
      awareness,
      intent: null,
      statuses: [],
      tags: def.tags,
    };
  }

  // =========================================================================
  // 可用动作
  // =========================================================================

  availableActions(): readonly CombatAction[] {
    const rt = this.rtState;
    if (!rt || rt.phase === 'resolved') return [];
    const base = ALL_ACTIONS.filter((a) => this.isUsable(rt, a));
    if (rt.phase !== 'panic') return base.map(toCombatAction);
    return this.panicMenu(rt, base).map(toCombatAction);
  }

  /** 内容层形态的可用动作，模拟器要读 tags 与 phases */
  availableActionDefs(): readonly ActionDef[] {
    const rt = this.rtState;
    if (!rt || rt.phase === 'resolved') return [];
    const base = ALL_ACTIONS.filter((a) => this.isUsable(rt, a));
    return rt.phase === 'panic' ? this.panicMenu(rt, base) : base;
  }

  private isUsable(rt: EncounterRuntime, a: ActionDef): boolean {
    // 恐慌时按"接触相"的可用性算底表，再交给 panicMenu 做锁定与错位
    const effPhase: 'stalk' | 'contact' | 'panic' = rt.phase === 'resolved' ? 'contact' : rt.phase;
    const phaseOk =
      a.phases.includes('any') ||
      a.phases.includes(effPhase) ||
      (effPhase === 'panic' && a.phases.includes('contact'));
    if (!phaseOk) return false;
    // PANIC 相里 panic 专属动作总是在列；其余动作走 panicMenu 的替换与锁定
    if (a.phases.includes('panic') && rt.phase !== 'panic') return false;
    if (a.needsRestrained !== undefined && a.needsRestrained !== rt.restrained) return false;
    if (rt.restrained && !a.tags.includes('defense') && !a.tags.includes('panic') && !a.tags.includes('melee')) {
      // 被抓住的时候你做不了收纳、涂油、观察这类需要空手的事
      if (!a.tags.includes('escape')) return false;
    }
    if (a.item && this.o.inventory.count(a.item) <= 0) {
      // 允许同族替代品（消音铁管代替铁管之类）由各动作自己判断，这里只看主道具
      return false;
    }
    if (
      !testCondition(a.requires, {
        flags: this.o.flags,
        vitals: this.o.vitals.vitals,
        inventory: this.o.inventory,
        stigma: rt.stigma,
        roomArchetype: this.o.roomArchetype?.(),
        depth: rt.depth,
      })
    ) {
      return false;
    }
    const live = liveEntities(rt);
    if (a.needsCognition !== undefined) {
      if (!live.some((e) => (rt.cogTier[e.defId] ?? 0) >= (a.needsCognition ?? 0))) return false;
    }
    if (a.bands && live.length) {
      if (!live.some((e) => a.bands!.includes(bandOf(rt, e.id)))) return false;
    }
    return true;
  }

  /**
   * PANIC 相的动作表。
   * 这不是"加个抖动"：约三分之一的动作会真的**从表里消失**（按键失灵），
   * 剩下的里面约四分之一被登记进 `panicMap` —— 玩家点它，执行的是另一个动作。
   * 映射每回合按 (轮次) 重算，所以恐慌不是稳定的、可背板的状态。
   */
  private panicMenu(rt: EncounterRuntime, base: readonly ActionDef[]): ActionDef[] {
    const seed = rt.rng.fork(`panic/${rt.round}`);
    const panicOnly = ALL_ACTIONS.filter((a) => a.phases.includes('panic') && this.itemOk(a));
    const normals = base.filter((a) => !a.phases.includes('panic'));
    const shuffled = seed.shuffle(normals.slice());

    rt.lockedActions = new Set();
    rt.panicMap = {};

    // 恐慌时能想起来的动作不超过 8 个，其余的"按下去没有反应"。
    // 这是相位的核心体验：不是数值变差，是**选项塌缩**。
    const keep = Math.min(8, Math.max(3, Math.floor(shuffled.length * 0.3)));
    for (let i = keep; i < shuffled.length; i++) rt.lockedActions.add(shuffled[i].id);
    const survivors = shuffled.slice(0, keep);

    const remapCount = Math.max(1, Math.floor(survivors.length * 0.35));
    for (let i = 0; i < remapCount && survivors.length > 1; i++) {
      const from = survivors[i];
      const to = seed.pick(survivors.concat(panicOnly));
      if (to.id !== from.id) rt.panicMap[from.id] = to.id;
    }
    // 恐慌里永远至少有这些出口，否则玩家会陷入无解
    const menu = survivors.concat(panicOnly);
    const seen = new Set<ID>();
    return menu.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }

  private itemOk(a: ActionDef): boolean {
    return !a.item || this.o.inventory.count(a.item) > 0;
  }

  // =========================================================================
  // 玩家回合
  // =========================================================================

  perform(actionId: ID, target?: { entity?: ID; part?: ID }): CombatOutcome {
    const rt = this.rtState;
    if (!rt) return mkOutcome({ log: ['没有正在进行的遭遇。'], noise: 0 });
    if (rt.phase === 'resolved') return mkOutcome({ log: ['这一场已经结束了。'], noise: 0 });

    // --- 按键失灵 ---------------------------------------------------------
    if (rt.lockedActions.has(actionId)) {
      const cost = this.spendBreath(rt, 1);
      rt.lastCost = cost;
      return this.postProcess(
        rt,
        mkOutcome({
          log: ['你做了那个动作。你的身体没有跟上。'],
          noise: emitNoise(rt, 3, '空动作'),
        }),
        actionId,
      );
    }

    // --- 动作错位 ---------------------------------------------------------
    let realId = actionId;
    const remapped = rt.panicMap[actionId];
    let prefix: string[] = [];
    if (remapped && remapped !== actionId) {
      realId = remapped;
      prefix = [`你想做的是「${actionDef(actionId)?.label ?? actionId}」。你做的是「${actionDef(realId)?.label ?? realId}」。`];
    }

    const a = actionDef(realId);
    if (!a) return mkOutcome({ log: [`没有这个动作: ${realId}`], noise: 0 });
    if (!this.isUsable(rt, a) && !rt.panicMap[actionId]) {
      return mkOutcome({ log: [`现在做不了「${a.label}」。`], noise: 0 });
    }

    if (realId !== 'act.hold-breath') {
      rt.holdingBreath = false;
      rt.heldBreathRounds = 0;
    }
    rt.movement = 0;
    rt.noiseDelta = 0;
    rt.log = [];

    const cost = this.spendBreath(rt, a.cost);
    rt.lastCost = cost;
    if (this.o.vitals.vitals.oxygen <= 0) {
      const out = this.finish(rt, 'died', ['你吸气的时候里面什么都没有了。']);
      for (const l of out.log) this.emit(l, 'bad');
      return out;
    }

    const cctx: CombatContext = {
      rng: rt.rng,
      vitals: this.o.vitals,
      encounter: rt,
      targetEntity: target?.entity,
      targetPart: target?.part,
      inventory: this.o.inventory,
    };

    let outcome: CombatOutcome;
    try {
      outcome = a.resolve(cctx);
    } catch (err) {
      outcome = mkOutcome({ log: [`动作解析失败: ${String(err)}`], noise: 0 });
    }

    rt.actionUse[realId] = (rt.actionUse[realId] ?? 0) + 1;
    const merged = mkOutcome({
      log: [...prefix, ...rt.log, ...outcome.log],
      damage: outcome.damage,
      effects: outcome.effects,
      noise: outcome.noise,
      resolved: outcome.resolved,
    });
    return this.postProcess(rt, merged, realId);
  }

  /**
   * 玩家动作之后的统一收尾：
   * 效果结算 → 实体死亡判定 → 相位迁移 → 结算判定。
   * 注意 `outcome.damage` **只作播报**，伤害在 combat-math 里已经落到部位上了；
   * 这样避免"引擎又扣一遍"的双重结算 bug。
   */
  private postProcess(rt: EncounterRuntime, outcome: CombatOutcome, actionId: ID): CombatOutcome {
    const extra: string[] = [];
    const forwarded = applyEffects(outcome.effects, {
      flags: this.o.flags,
      vitals: this.o.vitals,
      patchVitals: this.patch,
      inventory: this.o.inventory,
      statusLookup: this.o.statusLookup,
    });
    if (forwarded.length) {
      rt.pending.push(...forwarded);
      this.o.forward?.(forwarded);
    }

    // 实体死亡
    for (const e of rt.entities) {
      const def = defOf(e);
      if (e.hp > 0) continue;
      if (def.unkillable) {
        // 不可杀的东西被打到"零"只是松手：它退开，重新开始三角测量
        e.hp = Math.round(def.hpMax * 0.45);
        e.awareness = 0.3;
        e.intent = null;
        setBand(rt, e.id, 'far');
        extra.push('它松开了。它没有死 —— 它只是需要重新找一次你。');
      } else if (!this.o.flags.getBool(`sys.enc.dead.${e.id}`)) {
        this.o.flags.set(`sys.enc.dead.${e.id}`, true);
        extra.push(`${this.ledger.view(e.defId).name} 停了。`);
        const g = this.ledger.observe(e.defId, 'survive', 1);
        if (g.tierUp) extra.push(g.note);
        rt.cogTier[e.defId] = this.ledger.tierIndex(e.defId);
        const kill = def.killEffects;
        if (kill) {
          const fw = applyEffects(kill, {
            flags: this.o.flags,
            vitals: this.o.vitals,
            patchVitals: this.patch,
            inventory: this.o.inventory,
            statusLookup: this.o.statusLookup,
          });
          if (fw.length) {
            rt.pending.push(...fw);
            this.o.forward?.(fw);
          }
        }
        if (rt.restrainedBy === e.id) {
          rt.restrained = false;
          rt.restrainedBy = null;
        }
      }
    }

    const phaseNote = this.updatePhase(rt);
    if (phaseNote) extra.push(phaseNote);

    // 结算
    let resolved = outcome.resolved;
    if (!resolved) {
      if (this.o.vitals.vitals.oxygen <= 0 || this.o.vitals.vitals.trauma >= 100) resolved = 'died';
      else if (liveEntities(rt).length === 0) resolved = 'killed';
    }
    if (resolved) {
      rt.outcome = resolved;
      rt.phase = 'resolved';
      extra.push(this.resolutionLine(resolved));
    }

    for (const l of [...outcome.log, ...extra]) this.emit(l, 'neutral');
    return mkOutcome({
      log: [...outcome.log, ...extra],
      damage: outcome.damage,
      effects: outcome.effects,
      noise: outcome.noise,
      resolved,
    });
  }

  // =========================================================================
  // 敌方回合
  // =========================================================================

  advance(): readonly string[] {
    const rt = this.rtState;
    if (!rt || rt.phase === 'resolved') return [];
    const log: string[] = [];

    // --- 环境衰减 ---------------------------------------------------------
    const decay = 0.8 * Math.max(1, rt.lastCost);
    rt.noise = Math.max(0, rt.noise - decay);
    if (rt.noiseDelta <= 0.5) {
      rt.silentStreak += 1;
      if (rt.silentStreak === 3) log.push('连续三个回合，你没有发出任何东西。舱里的声音只剩水。');
    }
    for (const d of rt.decoys) d.ttl -= 1;
    rt.decoys = rt.decoys.filter((d) => d.ttl > 0);
    // 掩蔽度自然衰减回被动基线 —— 涂的油会干，缠的布会松
    const passive = this.passiveMasking();
    for (const k of Object.keys(rt.masking) as Sense[]) {
      const floor = passive[k] ?? 0;
      rt.masking[k] = Math.max(floor, rt.masking[k] - 0.18);
    }
    rt.faithSignature = this.faithSignature() * (1 - rt.masking.faith);
    rt.heatSignature = heatSignature(rt, this.o.vitals.vitals.coreTemp);

    // --- 逐个实体 ---------------------------------------------------------
    for (const e of liveEntities(rt)) {
      const def = defOf(e);
      const b = behaviorOf(rt, e);

      // 已 telegraph 的意图在本回合兑现
      if (e.intent) log.push(...this.executeIntent(rt, e, def, e.intent));
      // executeIntent 可能把玩家打死并结算，TS 看不出这层可变性，所以显式比较
      if ((rt.phase as string) === 'resolved') break;

      this.updateAwareness(rt, e, def, b, log);
      this.updateDistance(rt, e, def, b);

      // 以噪音为食的东西会在你打它的时候变强
      if (def.tags.includes('noise-feeder') && rt.noiseDelta > 4) {
        const gain = Math.min(18, Math.round(rt.noiseDelta * 0.5));
        e.hp = Math.min(def.hpMax, e.hp + gain);
        log.push(`${this.ledger.view(e.defId).name}的气囊又鼓了一圈。它刚刚吃了你发出的声音。`);
      }
      // 会学习的东西：把玩家泄露最多的通道练得更敏，并对用过的诱饵免疫
      if (def.tags.includes('adaptive')) this.adapt(rt, e, log);
      if (b.bleed > 0) {
        e.hp = Math.max(0, e.hp - b.bleed);
        log.push(`${this.ledger.view(e.defId).name}在流失。它自己好像不在意。`);
      }

      this.chooseIntent(rt, e);
      const tel = this.telegraphFor(rt, e, def);
      if (tel) log.push(tel);
    }

    // --- THE LISTENER 的压力表 --------------------------------------------
    if (rt.noise > 40) rt.listenerPressure += (rt.noise - 40) * 0.004;
    const hasListener = rt.entities.some((e) => e.defId === 'ent.listener');
    if (!hasListener && rt.listenerPressure >= 1 && rt.reinforcements < 1) {
      rt.reinforcements += 1;
      log.push('远处有东西开始移动。它不急，它的路线是直的。');
      const eff: Effect[] = [{ op: 'spawn', entity: 'ent.listener' }, { op: 'sfx', cue: 'listener-approach' }];
      rt.pending.push(...eff);
      this.o.forward?.(eff);
    } else if (hasListener && rt.silentStreak >= 3) {
      const l = rt.entities.find((e) => e.defId === 'ent.listener');
      if (l) {
        l.awareness = clamp01(l.awareness - 0.3);
        setBand(rt, l.id, bandAt(bandIndex(bandOf(rt, l.id)) - 1));
        log.push('拖痕在离你更远的地方出现了。它把你算错了一次。');
      }
    }

    // --- 潜行脱离 ---------------------------------------------------------
    // 它们全都丢了你，而你一直在往外挪：这才是潜行流的**胜利条件**。
    // 没有这条，所有安静的打法都会退化成"僵持到氧气耗尽"，
    // 而那会让 STALK 相变成一个没有出口的房间。
    const live = liveEntities(rt);

    // 关门房间（escapable=false）不是死刑，只是**先决条件没满足**：
    // 把所有还活着的东西的运动部位卸掉，你就跑得比它快了。
    // 这条让"切腱"从一个减速 debuff 变成圣器室那场强制战的唯一出路。
    if (!rt.escapable && live.length > 0) {
      const allCrippled = live.every((e) => {
        const legs = defOf(e).parts.filter((p) => p.fn === 'locomotion');
        const legsGone =
          legs.length > 0 && legs.every((p) => (e.parts.find((q) => q.id === p.id)?.hp ?? 1) <= 0);
        // 没有运动部位的东西（固定物、群体）靠行为层的接近速度判定
        return legsGone || defOf(e).approach * behaviorOf(rt, e).approachMul <= 0.12;
      });
      if (allCrippled) {
        rt.escapable = true;
        log.push('它还在往前，但每一步都比上一步短。你这次可以先走。');
      }
    }

    // 门上刻过痕就不会跑错方向，所以可以在它还半清醒的时候就开始撤。
    // 这条是 act.mark-door 在潜行流里真正的回报。
    const ceiling = rt.markedExit ? 0.42 : 0.26;
    const allLost =
      live.length > 0 && live.every((e) => e.awareness < ceiling && bandIndex(bandOf(rt, e.id)) <= 2);
    if (allLost && rt.escapable) {
      rt.escapeProgress = clamp01(rt.escapeProgress + 0.14 + (rt.markedExit ? 0.06 : 0));
      if (rt.escapeProgress >= 1) {
        log.push('它在别的地方找你。你往反方向走，一直走到听不见为止。');
        log.push(...this.finish(rt, 'escaped', []).log);
        for (const l of log) this.emit(l, 'eerie');
        return log;
      }
    } else {
      rt.escapeProgress = Math.max(0, rt.escapeProgress - 0.1);
    }

    rt.round += 1;
    rt.noiseDelta = 0;
    this.o.flags.set('sys.encounter.guard', 0);
    const phaseNote = this.updatePhase(rt);
    if (phaseNote) log.push(phaseNote);

    if (this.o.vitals.vitals.oxygen <= 0) {
      log.push(...this.finish(rt, 'died', ['你吸气的时候里面什么都没有了。']).log);
    } else if (this.o.vitals.vitals.trauma >= 100) {
      log.push(...this.finish(rt, 'died', ['你坐下来。你打算休息一下。']).log);
    }

    for (const l of log) this.emit(l, 'eerie');
    return log;
  }

  /**
   * 觉察度更新 —— 全系统最重要的一段。
   * 每条感知通道各算一份贡献，被毁的器官对应的通道**直接不参与**，
   * 这就是"摧毁耳器让它失去听觉"在数值上的落点。
   */
  private updateAwareness(
    rt: EncounterRuntime,
    e: Entity,
    def: EnemyDef,
    b: ReturnType<typeof behaviorOf>,
    log: string[],
  ): void {
    const senses = activeSenses(rt, e);
    const learned = rt.adaptive.get(e.id)?.bonus ?? {};
    let gain = 0;
    for (const s of senses) {
      const acuity = (def.acuity[s] ?? 1) + (learned[s] ?? 0);
      const mask = 1 - clamp01(rt.masking[s]);
      switch (s) {
        case 'sound':
          gain += rt.noiseDelta * 0.017 * acuity * mask;
          break;
        case 'vibration':
          gain += rt.movement * 0.22 * acuity * mask;
          break;
        case 'heat':
          gain += rt.heatSignature * 0.1 * acuity;
          break;
        case 'light':
          gain += rt.light * 0.13 * acuity * mask;
          break;
        case 'faith':
          gain += (rt.faithSignature * 0.13 + (1 - this.o.vitals.vitals.san / 100) * 0.04) * acuity;
          break;
      }
    }

    // 诱饵：只有它**还在用的**通道上的假源才骗得动它
    let pulled = 0;
    for (const d of rt.decoys) {
      if (!senses.includes(d.channel)) continue;
      const adaptRec = rt.adaptive.get(e.id);
      if (adaptRec?.seenDecoys.has(d.channel)) continue;
      const credulity = def.decoyCredulity[d.channel] ?? 0;
      if (credulity <= 0) continue;
      pulled += (d.strength / 100) * credulity;
    }
    // 三角测量：两个以上的假声源才能骗动 sound 灵敏度极高的东西
    const soundDecoys = rt.decoys.filter((d) => d.channel === 'sound').length;
    if (def.acuity.sound !== undefined && def.acuity.sound >= 2 && soundDecoys < 2) pulled *= 0.35;
    if (pulled > 0.02) {
      e.awareness = clamp01(e.awareness - pulled);
      shiftBand(rt, e.id, -Math.max(1, Math.round(pulled * 3)));
      log.push(`${this.ledger.view(e.defId).name}朝那边去了。${rt.decoys[0]?.label ?? '假的声音'}替你站了一会儿。`);
      const rec = rt.adaptive.get(e.id);
      if (rec) for (const d of rt.decoys) rec.seenDecoys.add(d.channel);
    }

    const decayTotal = def.awarenessDecay + b.awarenessDecayAdd + (rt.holdingBreath ? 0.05 : 0) + (senses.length ? 0 : 0.2);
    e.awareness = clamp01(e.awareness + gain - decayTotal);
    e.cognition = this.ledger.value(e.defId);
    if (!senses.length && e.awareness < 0.1) {
      log.push(`${this.ledger.view(e.defId).name}已经没有任何找到你的手段了。它在原地转。`);
    }
  }

  private updateDistance(rt: EncounterRuntime, e: Entity, def: EnemyDef, b: ReturnType<typeof behaviorOf>): void {
    const band = bandOf(rt, e.id);
    if (band === 'unknown') {
      if (e.awareness > 0.3) setBand(rt, e.id, 'far');
      return;
    }
    const drive = def.approach * b.approachMul * (0.35 + e.awareness);
    if (drive > 0.42) shiftBand(rt, e.id, 1);
    else if (e.awareness < 0.16) shiftBand(rt, e.id, -1);
  }

  /** `adaptive` 的实现：它把你用得最多的那条通道练熟 */
  private adapt(rt: EncounterRuntime, e: Entity, log: string[]): void {
    let rec = rt.adaptive.get(e.id);
    if (!rec) {
      rec = { bonus: {}, seenDecoys: new Set() };
      rt.adaptive.set(e.id, rec);
    }
    const leaks: [Sense, number][] = [
      ['sound', rt.noiseDelta],
      ['vibration', rt.movement * 20],
      ['light', rt.light * 20],
      ['heat', rt.heatSignature * 20],
      ['faith', rt.faithSignature * 20],
    ];
    leaks.sort((x, y) => y[1] - x[1]);
    const [ch, amt] = leaks[0];
    if (amt <= 1) return;
    const before = rec.bonus[ch] ?? 0;
    rec.bonus[ch] = Math.min(1.2, before + 0.16);
    if (before < 0.5 && (rec.bonus[ch] ?? 0) >= 0.5) {
      log.push(`它调整了站位。它已经知道你主要靠什么暴露自己了。`);
    }
  }

  /** 选择意图。被摧毁部位禁掉的意图**真的不会再出现** */
  private chooseIntent(rt: EncounterRuntime, e: Entity): void {
    const def = defOf(e);
    const b = behaviorOf(rt, e);
    const band = bandOf(rt, e.id);
    const pool: [IntentWeight, number][] = [];
    for (const it of def.intents) {
      if (b.forbidden.has(it.kind)) continue;
      if (it.kind === 'call' && !b.canCall) continue;
      if (it.minAwareness !== undefined && e.awareness < it.minAwareness) continue;
      if (it.bands && !it.bands.includes(band)) continue;
      pool.push([it, it.weight]);
    }
    if (!pool.length) {
      e.intent = { kind: 'listen', power: 0, telegraph: '它在等。等什么不清楚。' };
      return;
    }
    const chosen = rt.rng.weighted(pool);
    const lines = def.telegraphs[chosen.kind];
    const telegraph = lines && lines.length ? rt.rng.pick(lines) : def.evidence ? rt.rng.pick(def.evidence) : '——';
    e.intent = { kind: chosen.kind, power: chosen.power, telegraph };
  }

  /**
   * telegraph 的输出保真度由认知决定：
   * 0 档只给一句没用的环境描写，2 档以上才给准确的预读。
   * 永不可见的实体（THE LISTENER）任何档位都只给证据，不给外观。
   */
  private telegraphFor(rt: EncounterRuntime, e: Entity, def: EnemyDef): string | null {
    if (!e.intent) return null;
    const tier = rt.cogTier[e.defId] ?? 0;
    if (def.neverVisible) {
      return `${rt.rng.pick(def.evidence ?? ['——'])}${tier >= 2 ? `（它要${intentWord(e.intent.kind)}）` : ''}`;
    }
    if (tier === 0) return rt.rng.pick(def.evidence ?? [e.intent.telegraph]);
    if (tier === 1) return `${this.ledger.view(e.defId).name}在动。你读不准它要干什么。`;
    return `${this.ledger.view(e.defId).name}｜${bandLabel(bandOf(rt, e.id))}｜${e.intent.telegraph}`;
  }

  /** 兑现意图：这是玩家会挨打的地方 */
  private executeIntent(rt: EncounterRuntime, e: Entity, def: EnemyDef, intent: EntityIntent): string[] {
    const log: string[] = [];
    const b = behaviorOf(rt, e);
    const band = bandOf(rt, e.id);
    const guard = this.o.flags.getNum('sys.encounter.guard') > 0;

    switch (intent.kind) {
      case 'listen':
        bumpAwareness(rt, e, rt.noiseDelta > 3 ? 0.12 : -0.02);
        return log;
      case 'stalk': {
        shiftBand(rt, e.id, 1);
        return log;
      }
      case 'flee': {
        shiftBand(rt, e.id, -2);
        e.awareness = clamp01(e.awareness - 0.2);
        log.push(`${this.ledger.view(e.defId).name}退开了。它没有走远。`);
        return log;
      }
      case 'call': {
        if (!b.canCall) {
          log.push('它张开发声的地方，什么都没有出来。');
          return log;
        }
        emitNoise(rt, 22, '它在叫');
        rt.listenerPressure += 0.18;
        log.push('它叫了一声。那一声不是给你听的。');
        return log;
      }
      case 'ritual': {
        // 仪式类意图打的是资源，不是血
        this.patch('fear', 6 + intent.power);
        this.patch('san', -(2 + intent.power * 0.4));
        if (def.tags.includes('oxygen-drain')) {
          this.patch('oxygen', -(12 + intent.power * 3));
          log.push('舱里的空气往它那边走。你的下一口比上一口短。');
        } else {
          log.push('它在做一件有顺序的事。顺序本身让你难受。');
        }
        return log;
      }
      case 'grab': {
        if (bandIndex(band) < 3) {
          shiftBand(rt, e.id, 1);
          log.push('它伸手，没有够到。它又近了一档。');
          return log;
        }
        const p = clamp(0.35 + e.awareness * 0.4 - (guard ? 0.25 : 0), 0.08, 0.88);
        if (rt.rng.bool(p)) {
          rt.restrained = true;
          rt.restrainedBy = e.id;
          setBand(rt, e.id, 'contact');
          const dmg = Math.round(def.power * b.powerMul * (intent.power / 10) * 0.5);
          this.patch('trauma', dmg);
          this.patch('fear', 18);
          log.push(`它抓住了你。${dmg} 点。你的大部分动作从这一刻起不可用。`);
        } else {
          log.push('它的手合上了，里面是你刚才站的地方。');
        }
        return log;
      }
      case 'strike': {
        if (bandIndex(band) < 3) {
          shiftBand(rt, e.id, 1);
          log.push('它扑空了，因为它扑的是你刚才的位置。');
          return log;
        }
        const dark = rt.light < 0.15;
        const p = clamp(0.4 + e.awareness * 0.42 - (guard ? 0.22 : 0) - (dark ? 0.08 : 0), 0.08, 0.92);
        if (rt.rng.bool(p)) {
          const raw = def.power * b.powerMul * (intent.power / 10) * rt.rng.float(0.85, 1.2);
          const dmg = Math.max(1, Math.round(raw * (guard ? 0.55 : 1)));
          this.patch('trauma', dmg);
          this.patch('fear', 10 + intent.power);
          if (def.tags.includes('symbiote') || def.tags.includes('parasite')) this.patch('infection', 4);
          log.push(`它打中了你。${dmg} 点。${guard ? '格挡吃掉了大半。' : ''}`);
        } else {
          log.push('它打到了舱壁。钢板上多了一个凹。');
          emitNoise(rt, 10, '它打在舱壁上');
        }
        return log;
      }
      default:
        return log;
    }
  }

  // =========================================================================
  // 相位
  // =========================================================================

  private updatePhase(rt: EncounterRuntime): string | null {
    if (rt.phase === 'resolved') return null;
    const fear = this.o.vitals.vitals.fear;
    if (fear >= 85 && rt.phase !== 'panic') {
      rt.phase = 'panic';
      // 进入恐慌立刻重算一次动作表，玩家会当场看到选项变了
      this.panicMenu(rt, ALL_ACTIONS.filter((a) => this.isUsable(rt, a)));
      return '【失控】你的手开始做别的事。一部分动作你按不下去了。';
    }
    if (rt.phase === 'panic') {
      if (fear < 62) {
        rt.phase = liveEntities(rt).some((e) => bandIndex(bandOf(rt, e.id)) >= 3) ? 'contact' : 'stalk';
        rt.panicMap = {};
        rt.lockedActions = new Set();
        return '【回来了】你的手重新听你的话。';
      }
      // 恐慌持续期间每回合重掷映射
      this.panicMenu(rt, ALL_ACTIONS.filter((a) => this.isUsable(rt, a)));
      return null;
    }
    const contactNow = liveEntities(rt).some((e) => {
      const def = defOf(e);
      return e.awareness >= def.contactThreshold && bandIndex(bandOf(rt, e.id)) >= 3;
    });
    if (contactNow && rt.phase === 'stalk') {
      rt.phase = 'contact';
      return '【接触】它知道你在哪了。现在是部位的问题。';
    }
    const allLost = liveEntities(rt).every((e) => e.awareness < 0.2 && bandIndex(bandOf(rt, e.id)) <= 2);
    if (allLost && rt.phase === 'contact') {
      rt.phase = 'stalk';
      return '【脱离接触】它丢了你。它还在找。';
    }
    return null;
  }

  private resolutionLine(r: 'escaped' | 'killed' | 'died' | 'spared'): string {
    switch (r) {
      case 'escaped':
        return '你出来了。你的呼吸比它的脚步快。';
      case 'killed':
        return '它不动了。现在舱里只有你的声音，而你的声音很大。';
      case 'died':
        return '……';
      default:
        return '你放它走了。它走的时候没有回头。';
    }
  }

  private finish(rt: EncounterRuntime, r: 'escaped' | 'killed' | 'died' | 'spared', log: string[]): CombatOutcome {
    rt.outcome = r;
    rt.phase = 'resolved';
    this.lastOutcome = r;
    // 不在这里 emit —— 由调用方统一播报，避免同一行被记两次
    return mkOutcome({ log: [...log, this.resolutionLine(r)], noise: 0, resolved: r });
  }

  // =========================================================================
  // 收尾
  // =========================================================================

  end(): void {
    const rt = this.rtState;
    if (!rt) return;
    this.lastOutcome = rt.outcome;
    // 活着离开一场遭遇本身就是认知：你知道它做过什么、没做什么
    if (rt.outcome === 'escaped' || rt.outcome === 'killed') {
      for (const defId of rt.defs.keys()) {
        this.ledger.observe(defId, 'survive', rt.outcome === 'killed' ? 1 : 0.6);
        this.o.flags.set(`meta.bestiary.${defId}`, Number(this.ledger.value(defId).toFixed(4)));
      }
    }
    // 尸检：手上有刃、且这一场确实杀死了东西，才有资格做
    if (rt.outcome === 'killed' && this.o.inventory.count('it.dive-knife') + this.o.inventory.count('it.honed-knife') > 0) {
      for (const e of rt.entities) {
        if (e.hp > 0 || defOf(e).unkillable) continue;
        const g = this.ledger.observe(e.defId, 'autopsy', 0.7);
        if (g.tierUp) this.emit(g.note, 'whisper');
      }
    }
    // FlagStore 契约没有 delete；用 set(false) 表达"这条记录已经作废"
    for (const e of rt.entities) this.o.flags.set(`sys.enc.dead.${e.id}`, false);
    this.o.flags.set('sys.encounter.guard', 0);
    this.rtState = null;
    this.ctx = null;
  }

  // =========================================================================
  // 工具
  // =========================================================================

  /** 呼吸消耗 = 基础 × derived('breathCost')，按 GDD §4.1 */
  private spendBreath(rt: EncounterRuntime, base: Breaths): Breaths {
    const mul = this.o.vitals.derived('breathCost');
    const eff = Math.max(1, Math.round(base * (Number.isFinite(mul) && mul > 0 ? mul : 1)));
    if (this.ctx) {
      const events = this.o.vitals.advance(rt.holdingBreath ? 0 : eff, this.ctx);
      for (const ev of events) {
        if (ev.kind === 'death') this.o.onDeath?.(ev.cause);
      }
    }
    return eff;
  }

  private readonly patch: VitalsPatchFn = (stat, delta) => {
    if (this.o.patchVitals) {
      this.o.patchVitals(stat, delta);
      return;
    }
    // 契约里 Vitals 是 Readonly。宿主没给写入器时只能直写，
    // 否则"它打中了你"就只是一行文字 —— 那才是真正的占位符。
    const v = this.o.vitals.vitals as Record<string, number>;
    if (typeof v[stat as string] === 'number') {
      const max = stat === 'san' ? this.o.vitals.vitals.sanMax : stat === 'oxygen' ? this.o.vitals.vitals.oxygenMax : 100;
      const lo = stat === 'coreTemp' ? 15 : 0;
      const hi = stat === 'coreTemp' ? 42 : max;
      v[stat as string] = clamp(v[stat as string] + delta, lo, hi);
    }
  };

  private passiveMasking(): Partial<Record<Sense, number>> {
    const out: Partial<Record<Sense, number>> = {};
    for (const s of this.o.inventory.all()) {
      const def = maybeItem(s.id);
      if (!def?.masks) continue;
      for (const k of Object.keys(def.masks) as Sense[]) out[k] = Math.max(out[k] ?? 0, def.masks[k] ?? 0);
    }
    return out;
  }

  private faithSignature(): number {
    let sig = 0;
    for (const s of this.o.inventory.all()) {
      const def = maybeItem(s.id);
      if (!def) continue;
      if (def.tags.includes('faith')) sig += 0.18 * Math.min(s.count, 3);
      else if (def.tags.includes('ritual')) sig += 0.07 * Math.min(s.count, 3);
      else if (def.kind === 'relic') sig += 0.04 * Math.min(s.count, 3);
    }
    sig += this.o.flags.getNum('stigma.listening') * 0.05;
    return clamp01(sig);
  }

  private readStigma(): Record<StigmaKind, number> {
    const keys: StigmaKind[] = ['silence', 'listening', 'drowned', 'iron', 'flesh', 'apostasy'];
    const out = {} as Record<StigmaKind, number>;
    for (const k of keys) out[k] = this.o.flags.getNum(`stigma.${k}`);
    return out;
  }

  private emit(text: string, tone: LogTone): void {
    if (text) this.o.log?.(text, tone);
  }

  // =========================================================================
  // 存档
  // =========================================================================

  serialize(): unknown {
    const rt = this.rtState;
    if (!rt) return { active: false, ledger: this.ledger.serialize() };
    return {
      active: true,
      id: rt.id,
      round: rt.round,
      phase: rt.phase,
      light: rt.light,
      noise: rt.noise,
      escapable: rt.escapable,
      masking: rt.masking,
      distance: rt.distance,
      destroyed: Array.from(rt.destroyed),
      decoys: rt.decoys,
      listenerPressure: rt.listenerPressure,
      silentStreak: rt.silentStreak,
      negotiation: rt.negotiation,
      markedExit: rt.markedExit,
      restrained: rt.restrained,
      restrainedBy: rt.restrainedBy,
      actionUse: rt.actionUse,
      rng: rt.rng.serialize(),
      entities: rt.entities.map((e) => ({
        id: e.id,
        defId: e.defId,
        hp: e.hp,
        awareness: e.awareness,
        intent: e.intent,
        parts: e.parts.map((p) => ({ id: p.id, hp: p.hp })),
      })),
      ledger: this.ledger.serialize(),
    };
  }

  hydrate(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as Record<string, unknown>;
    if (d.ledger) this.ledger.hydrate(d.ledger);
    if (!d.active) {
      this.rtState = null;
      return;
    }
    const encId = String(d.id);
    const preset = encounterPreset(encId);
    const savedEntities = (d.entities as { id: ID; defId: ID; hp: number; awareness: number; intent: EntityIntent | null; parts: { id: ID; hp: number }[] }[]) ?? [];
    const defs = new Map<ID, EnemyDef>();
    const entities: Entity[] = savedEntities.map((se, i) => {
      const def = enemyDef(se.defId);
      defs.set(se.defId, def);
      const e = this.spawn(def, i, se.awareness);
      e.id = se.id;
      e.hp = se.hp;
      e.intent = se.intent;
      for (const sp of se.parts) {
        const p = e.parts.find((x) => x.id === sp.id);
        if (p) p.hp = sp.hp;
      }
      return e;
    });
    const cogTier: Record<ID, 0 | 1 | 2 | 3> = {};
    for (const k of defs.keys()) cogTier[k] = this.ledger.tierIndex(k);
    const rt: EncounterRuntime = {
      __runtime: true,
      id: encId,
      entities,
      defs,
      rng: new Xoshiro((d.rng as number[]) ?? [1, 2, 3, 4], `encounter/${encId}`),
      flags: this.o.flags,
      ambient: this.ctx?.ambient ?? {
        flooding: 0,
        pressure: 1,
        temperature: 8,
        airQuality: 0.8,
        noiseFloor: 2,
        presence: 0,
      },
      depth: this.ctx?.depth ?? 0,
      stigma: this.readStigma(),
      distance: (d.distance as Record<ID, ReturnType<typeof bandOf>>) ?? {},
      light: Number(d.light ?? 0.3),
      noise: Number(d.noise ?? 0),
      round: Number(d.round ?? 1),
      escapable: Boolean(d.escapable ?? true),
      phase: (d.phase as EncounterState['phase']) ?? 'stalk',
      masking: (d.masking as Masking) ?? { ...EMPTY_MASK },
      holdingBreath: false,
      heldBreathRounds: 0,
      movement: 0,
      noiseDelta: 0,
      faithSignature: this.faithSignature(),
      heatSignature: 0,
      decoys: (d.decoys as Decoy[]) ?? [],
      destroyed: new Set((d.destroyed as string[]) ?? []),
      behaviors: new Map(),
      panicMap: {},
      lockedActions: new Set(),
      restrained: Boolean(d.restrained),
      restrainedBy: (d.restrainedBy as ID | null) ?? null,
      listenerPressure: Number(d.listenerPressure ?? 0),
      reinforcements: 0,
      escapeProgress: 0,
      markedExit: Boolean(d.markedExit),
      silentStreak: Number(d.silentStreak ?? 0),
      negotiation: Number(d.negotiation ?? 0),
      adaptive: new Map(),
      cogTier,
      ledger: this.ledger,
      log: [],
      actionUse: (d.actionUse as Record<ID, number>) ?? {},
      lastCost: 0,
      pending: [],
      outcome: null,
    };
    for (const e of entities) recomputeBehavior(rt, e);
    rt.heatSignature = heatSignature(rt, this.o.vitals.vitals.coreTemp);
    if (preset) rt.escapable = preset.escapable;
    this.rtState = rt;
  }
}

function intentWord(k: EntityIntent['kind']): string {
  switch (k) {
    case 'strike':
      return '动手';
    case 'grab':
      return '抓你';
    case 'listen':
      return '听';
    case 'stalk':
      return '靠近';
    case 'flee':
      return '退开';
    case 'call':
      return '叫别的东西';
    case 'ritual':
      return '做那件有顺序的事';
    default:
      return '做什么不清楚';
  }
}
