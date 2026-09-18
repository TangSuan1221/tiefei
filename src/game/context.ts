/**
 * 运行上下文 —— 把五条产线交付的子系统接成一台机器。
 *
 * 领域模块之间有若干真实的接缝（docs/integration-api.md 的缺口清单）：叙事要求的
 * world 桥接与 World 的实际 API 不同形、Stigma 旗标在 vitals/narrative/director
 * 三处用了三套命名、契约里大半事件没有生产者。这些缝**全部在本文件里缝上**，
 * 领域模块一行不改 —— 这样各产线仍可独立演进。
 */

import type {
  Breaths,
  DeathCause,
  Effect,
  GamePhase,
  ID,
  LogTone,
  Rng,
  SimContext,
  SimEvent,
  StigmaKind,
  Vitals,
} from '@/core/contract';
import { Bus } from '@/core/events';
import { Flags } from '@/core/flags';
import { Xoshiro } from '@/core/rng';
import { clamp01 } from '@/core/util';

import { BASELINE, Director, VeracityEngine, VitalsEngine } from '@/sim';
import {
  assertWorldContent,
  createWorld,
  DEFAULT_WORLD_CONFIG,
  World,
  type EntityHint,
  type WorldRoom,
} from '@/world';
import { NarrativeEngine, type NarrativeHost } from '@/narrative/engine';
import { STORY } from '@/content/story/index';
import { EncounterEngine } from '@/encounter/engine';
import { Inventory } from '@/encounter/inventory';
import { CognitionLedger } from '@/encounter/cognition';
import { allEnemyDefs } from '@/content/bestiary/index';

export interface LogLine {
  text: string;
  tone: LogTone;
  at: Breaths;
}

const STIGMA_KINDS: readonly StigmaKind[] = [
  'silence',
  'listening',
  'drowned',
  'iron',
  'flesh',
  'apostasy',
];

export interface RunInit {
  seed: number;
  cycle: number;
  /** 上一轮继承的知识节点 */
  carryKnowledge?: readonly ID[];
  /** 上一轮带入的状态效果 */
  carryStatus?: readonly ID[];
  /** 跨轮回的永久清明，抵抗 Veracity 欺骗 */
  lucidity?: number;
  /** 跨轮回的实体认知 */
  bestiary?: Record<ID, number>;
}

/**
 * 一次轮回的全部运行时状态。
 *
 * 构造即装配：构造函数跑完之后，所有子系统都已互相接好，可以直接跑回合。
 * 构造顺序有依赖（veracity 要在 vitals 之前、叙事要在 world/inventory 之后），
 * 顺序写死在这里，外部不需要知道。
 */
export class RunContext {
  readonly bus = new Bus();
  readonly flags: Flags;
  readonly rng: Rng;
  readonly seed: number;

  readonly vitals: VitalsEngine;
  readonly veracity: VeracityEngine;
  readonly world: World;
  readonly inventory: Inventory;
  readonly ledger: CognitionLedger;
  readonly narrative: NarrativeEngine;
  readonly encounter: EncounterEngine;
  readonly director: Director;

  /** 全局唯一的教团标记账本。叙事、遭遇、导演读的都是这一个对象。 */
  readonly stigmata: Record<StigmaKind, number> = {
    silence: 0,
    listening: 0,
    drowned: 0,
    iron: 0,
    flesh: 0,
    apostasy: 0,
  };

  readonly log: LogLine[] = [];

  /** 已知的实体位置，喂给 world.configure 让声呐能扫到它们 */
  readonly entities: EntityHint[] = [];

  /** 叙事/道具解锁的钥匙集合 */
  readonly keys = new Set<string>();

  /**
   * 已经被翻过的舱室。
   *
   * 声呐照出的是拓扑，翻找摸出的是柜子深处 —— 藏得好的陈设两条路都能发现，
   * 一条响一条慢。没有这个集合的话，翻找就只是一段没有回报的开销。
   */
  readonly searched = new Set<ID>();

  cycle: number;
  breathsElapsed: Breaths = 0;
  phase: GamePhase = 'explore';
  deathCause: DeathCause | null = null;
  endingId: ID | null = null;

  /** 由表现层填，供音效效果使用；整合层不直接依赖 AudioEngine */
  onCue: ((cue: string) => void) | null = null;
  onShake: ((amount: number) => void) | null = null;

  constructor(init: RunInit) {
    this.seed = init.seed;
    this.cycle = init.cycle;
    this.rng = new Xoshiro(init.seed, 'run');
    this.flags = new Flags(this.bus, () => this.breathsElapsed);

    // --- 生理 + 真实性 -----------------------------------------------------
    // 两者互相引用：veracity 要在识破谎言时奖励 SAN，vitals 要用 veracity 过滤感知。
    // 用惰性闭包打破构造期的循环依赖。
    this.veracity = new VeracityEngine({
      seed: init.seed ^ 0x5eed1e,
      bus: this.bus,
      vitals: { rewardDebunk: () => this.vitals.rewardDebunk() },
      lucidity: init.lucidity ?? 0,
    });
    this.vitals = new VitalsEngine({ bus: this.bus, carryOver: init.carryStatus });
    this.vitals.attachPerception(this.veracity);

    // --- 世界 --------------------------------------------------------------
    assertWorldContent();
    this.world = createWorld(init.seed, DEFAULT_WORLD_CONFIG);

    // --- 背包 + 认知 -------------------------------------------------------
    this.ledger = new CognitionLedger(init.bestiary);
    this.inventory = new Inventory({
      flags: this.flags,
      vitals: this.vitals,
      patchVitals: (stat, delta) => this.patchVital(stat, delta),
      station: () => this.world.room(this.world.currentRoomId).archetype,
      stigma: () => this.stigmata,
      forward: (fx) => this.applyEffects(fx),
      perceivedSan: () => this.vitals.perceived().san,
    });

    // --- 叙事 --------------------------------------------------------------
    this.narrative = new NarrativeEngine(STORY, this.buildNarrativeHost());
    for (const node of init.carryKnowledge ?? []) {
      this.narrative.run([{ op: 'knowledge', node }]);
    }

    // --- 遭遇 --------------------------------------------------------------
    this.encounter = new EncounterEngine({
      vitals: this.vitals,
      inventory: this.inventory,
      flags: this.flags,
      patchVitals: (stat, delta) => this.patchVital(stat, delta),
      ledger: this.ledger,
      stigma: () => this.stigmata,
      forward: (fx) => this.applyEffects(fx),
      log: (text, tone) => this.pushLog(text, tone),
      roomArchetype: () => this.world.room(this.world.currentRoomId).archetype,
      onDeath: (cause) => this.die(cause),
    });

    // --- 导演 --------------------------------------------------------------
    // 缺口 3：导演的默认兽栏 id 是占位值，与图鉴对不上，不覆盖就会下单生成不存在的敌人。
    // EnemyDef 本身不带投放参数（那是导演的事，不是图鉴的事），所以从标签推。
    this.director = new Director();
    this.director.configureBestiary(
      allEnemyDefs().map((d) => {
        const boss = d.tags.includes('boss');
        const ritual = d.tags.includes('ritual') || d.tags.includes('mirror');
        return {
          id: d.id,
          minDeck: boss ? 4 : ritual ? 2 : 0,
          weight: boss ? 0.25 : ritual ? 0.6 : 1,
          stealthy:
            (d.neverVisible ?? false) ||
            d.tags.includes('ambush') ||
            d.tags.includes('evasive') ||
            d.tags.includes('incorporeal'),
        };
      }),
    );

    this.wireBus();
    this.syncRuntime();
  }

  // ==========================================================================
  // 桥接：叙事 ↔ 世界 / 生理
  // ==========================================================================

  private buildNarrativeHost(): NarrativeHost {
    return {
      flags: this.flags,
      rng: this.rng,
      bus: this.bus,
      stigmata: this.stigmata,
      inventory: this.inventory,
      cycle: () => this.cycle,
      breaths: () => this.breathsElapsed,
      vitals: {
        read: () => this.vitals.vitals,
        modify: (stat, delta) => this.patchVital(stat, delta),
        applyStatus: (id, duration) => this.vitals.applyById(id, undefined, { duration }),
        removeStatus: (id) => this.vitals.remove(id),
      },
      // 缺口 1：叙事要的是 spawn / unlockDoor / 单参 addNoise / reweave(intensity)，
      // World 一个都没有原形提供。适配器在这里。
      world: {
        archetype: () => this.world.room(this.world.currentRoomId).archetype,
        depth: () => this.world.depth,
        addNoise: (amount) => this.makeNoise(amount, 'narrative'),
        unlockDoor: (doorId) => this.unlockDoor(doorId),
        reweave: (intensity) => this.world.reweave(this.rng, clamp01(intensity)),
        spawn: (entityId, where) => this.spawnEntity(entityId, where),
      },
      onEncounter: (id) => this.beginEncounter(id),
      onEnding: (id) => {
        this.endingId = id;
        this.setPhase('ending');
      },
      onBreath: (amount, reason) => this.spendBreaths(amount, reason),
    };
  }

  /**
   * 缺口 1b：World 没有公开的开锁 API。门是成对存在的（door 与 twin），
   * 只开单边会造成"从这头能过去、从那头过不来"的诡异状态，所以两边一起开。
   */
  private unlockDoor(doorId: ID): void {
    for (const room of this.world.topology.rooms.values()) {
      for (const door of room.doors) {
        if (door.id !== doorId) continue;
        door.state = 'open';
        delete door.lock;
        if (door.twin) {
          const other = this.world.topology.rooms.get(door.to);
          const twin = other?.doors.find((d) => d.id === door.twin);
          if (twin) {
            twin.state = 'open';
            delete twin.lock;
          }
        }
        this.pushLog('锁芯松了。门开着。', 'system');
        return;
      }
    }
  }

  /** 缺口 1c：World 不管实体。生成的实体登记在这里，由 configure 喂回给声呐。 */
  private spawnEntity(entityId: ID, where?: ID): void {
    const at = where ?? this.world.currentRoomId;
    this.entities.push({ at, kind: entityId === 'ent.listener' ? 'listener' : 'entity', loud: 0.6 });
    this.flags.set(`sys.spawned.${entityId}`, at);
  }

  /**
   * 缺口 6：契约里 VitalsSystem.vitals 是只读的，但遭遇与叙事都要改它。
   * 统一走 restore()，避免各处直接突变内部对象。
   */
  private patchVital(stat: keyof Vitals, delta: number): void {
    const cur = this.vitals.vitals[stat];
    if (typeof cur !== 'number') return;
    this.vitals.restore({ [stat]: cur + delta } as Partial<Record<never, number>>);
  }

  // ==========================================================================
  // 事件转发（缺口 4：契约里这些事件本来没有任何生产者）
  // ==========================================================================

  private wireBus(): void {
    this.bus.on('log', (p) => this.pushLog(p.text, p.tone));
    this.bus.on('shake', (p) => this.onShake?.(p.amount));
    this.bus.on('death', (p) => this.die(p.cause));
    this.bus.on('stigma:change', () => this.syncStigmaFlags());
  }

  pushLog(text: string, tone: LogTone = 'neutral'): void {
    this.log.push({ text, tone, at: this.breathsElapsed });
    if (this.log.length > 200) this.log.shift();
  }

  setPhase(to: GamePhase): void {
    if (this.phase === to) return;
    const from = this.phase;
    this.phase = to;
    this.bus.emit('phase:change', { from, to });
  }

  /**
   * 缺口 2：Stigma 在三个模块里有三套旗标命名 —— vitals 读 `stigma.listening`，
   * 叙事写 `sys.stigma.listening`，导演读 `stigma.listening`。
   * 真值只有 this.stigmata 一份，每次变动向两套命名同时镜像。
   */
  private syncStigmaFlags(): void {
    let total = 0;
    for (const kind of STIGMA_KINDS) {
      const v = this.stigmata[kind];
      total += v;
      this.flags.set(`stigma.${kind}`, v);
      this.flags.set(`sys.stigma.${kind}`, v);
    }
    this.flags.set('sys.stigma.total', total);
  }

  stigmaTotal(): number {
    let t = 0;
    for (const kind of STIGMA_KINDS) t += this.stigmata[kind];
    return t;
  }

  // ==========================================================================
  // 效果路由
  // ==========================================================================

  /**
   * 世界、遭遇、道具产出的 Effect 统一从这里下发。
   *
   * 绝大多数 op 交给 NarrativeEngine.run 执行 —— 它已经接好了我们提供的
   * vitals / world / inventory 桥，是唯一一份完整的效果解释器，重写一遍只会分叉。
   * 只有它消化不了的两个 op 在这里截胡（缺口 5：'sfx' 在叙事里只写了个旗标）。
   */
  applyEffects(effects: readonly Effect[]): void {
    if (!effects.length) return;
    const rest: Effect[] = [];
    for (const fx of effects) {
      if (fx.op === 'sfx') {
        this.onCue?.(fx.cue);
      } else if (fx.op === 'camera') {
        if (fx.shake) this.onShake?.(fx.shake);
      } else {
        rest.push(fx);
      }
    }
    if (rest.length) this.narrative.run(rest);
  }

  // ==========================================================================
  // 回合原语
  // ==========================================================================

  /**
   * 契约里的 Room 是删减版，行动层要读门的 role / crawl / mark 和房间的痕迹，
   * 这些只存在于拓扑图的 WorldRoom 上。
   */
  wroom(id: ID = this.world.currentRoomId): WorldRoom {
    const r = this.world.topology.rooms.get(id);
    if (!r) throw new Error(`[game] 未知房间 ${id}`);
    return r;
  }

  simCtx(): SimContext {
    return {
      rng: this.rng,
      depth: this.world.depth,
      ambient: this.world.room(this.world.currentRoomId).ambient,
      flags: this.flags,
    };
  }

  /**
   * 推进 n 个呼吸。这是游戏里唯一的时间单位 —— 一切代价都折算成呼吸，
   * 所以所有动作最后都会经过这里。
   */
  spendBreaths(amount: Breaths, reason: string, exertion = 0.25): SimEvent[] {
    if (amount <= 0) return [];
    this.breathsElapsed += amount;
    const events = this.vitals.advance(amount, this.simCtx(), { exertion });
    this.bus.emit('breath:spent', { amount, reason });

    // 生理产生的噪音（喘气、呻吟、心跳）要进世界的噪音账
    const pending = this.vitals.takeNoise();
    if (pending > 0) this.makeNoise(pending, 'body');

    for (const e of events) {
      if (e.kind === 'death') this.die(e.cause);
      if (e.kind === 'hallucination') this.director.observe({ kind: 'rest' }, e.severity * 100);
    }
    return events;
  }

  makeNoise(amount: number, source: string): void {
    if (amount <= 0) return;
    const roomId = this.world.currentRoomId;
    this.world.addNoise(roomId, amount);
    this.bus.emit('noise:made', { roomId, amount, source });
  }

  /** 每回合把生理/真实性的当前值推给世界，声呐与重织都依赖它们 */
  syncRuntime(): void {
    const v = this.vitals.vitals;
    this.world.configure({
      san: v.san,
      corruption: this.veracity.corruption,
      breaths: this.breathsElapsed,
      cycle: this.cycle,
      keys: this.keys,
      entities: this.entities,
      knowsSonarTell: this.flags.getBool('know.sonar.tell'),
      sonarRangeMul: this.vitals.derived('sonarRange') / BASELINE.sonarRange,
      sonarFidelityMul: this.vitals.derived('sonarFidelity') / BASELINE.sonarFidelity,
      noiseMul: this.vitals.derived('noiseEmission'),
      stealth: this.vitals.derived('stealth'),
      stigmaTotal: this.stigmaTotal(),
    });
    // 缺口 10：导演从旗标读深度，不读 world
    this.flags.set('sys.depth', this.world.depth);
  }

  /** 世界演化一个回合：衰减、进水、Listener 移动 */
  advanceWorld(breaths: Breaths): void {
    const turn = this.world.advance(breaths, this.rng);
    for (const ev of turn.events) this.bus.emit('world:event', ev);
    for (const line of turn.log) this.pushLog(line.text, line.tone);
    this.applyEffects(turn.effects);
    this.refreshListenerHint();
  }

  /** Listener 的位置是声呐能扫到的信息，每回合同步一次 */
  private refreshListenerHint(): void {
    const idx = this.entities.findIndex((e) => e.kind === 'listener');
    const st = this.world.listener;
    if (!st || !st.active) {
      if (idx >= 0) this.entities.splice(idx, 1);
      return;
    }
    const hint: EntityHint = { at: st.at, kind: 'listener', loud: 0.95 };
    if (idx >= 0) this.entities[idx] = hint;
    else this.entities.push(hint);
  }

  /** 导演每回合出牌 */
  runDirector(): void {
    const orders = this.director.tick({
      vitals: this.vitals.vitals,
      world: this.world,
      flags: this.flags,
      breathsElapsed: this.breathsElapsed,
      rng: this.rng,
    });
    for (const o of orders) {
      this.bus.emit('director:order', o);
      switch (o.kind) {
        case 'spawn':
          this.spawnEntity(o.entity, o.roomId);
          break;
        case 'hint':
          this.entities.push({ at: o.towards, kind: 'entity', loud: o.confidence });
          break;
        case 'ambience':
          this.onCue?.(o.cue);
          break;
        case 'fabricate':
          // 真实性层自己决定谎言内容；导演只负责"该撒谎了"
          this.veracity.forge(o.lie, this.rng);
          break;
        case 'grant-relief':
        case 'escalate':
          break;
      }
    }
  }

  beginEncounter(id: ID): void {
    this.encounter.begin(id, this.simCtx());
    this.setPhase('encounter');
    this.bus.emit('encounter:begin', { id });
  }

  /**
   * 进入房间的收尾：发事件、跑首次进入的叙事节点。
   * 缺口 8：World 只把 onEnterNode 写进日志，不会真的开叙事。
   */
  enterRoom(roomId: ID, first: boolean): void {
    this.bus.emit('room:enter', { roomId, first });
    if (!first) return;
    const node = this.world.room(roomId).onEnterNode;
    if (node && STORY.entries.includes(node)) {
      this.narrative.start(node);
      this.setPhase('narrative');
    }
  }

  die(cause: DeathCause): void {
    if (this.phase === 'death' || this.phase === 'ending') return;
    this.deathCause = cause;
    this.setPhase('death');
  }
}
