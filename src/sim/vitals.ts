/**
 * 《铁肺迷城》— 生理模拟引擎 (Agent A)
 * ============================================================
 * 实现 GDD §4.1 / §4.2 的全部生理模型。本文件是全作的心跳。
 *
 * 三条不可动摇的设计原则：
 *   1. **氧气 = 呼吸 = 时间 = 货币**（支柱 P2）。oxygen 的单位就是"你还能呼吸几次"，
 *      1 呼吸扣 1 点。任何"让氧气条和呼吸数脱钩"的优化都会毁掉这个可读性契约。
 *   2. **一切演化都按 dt 线性积分**。动作成本是浮点（2 × 1.37 = 2.74 呼吸），
 *      所以 advance() 必须支持分数步，否则成本倍率会被整数截断偷偷吞掉。
 *   3. **HUD 永远不读真值**。UI 只能调 perceived()（支柱 P3）。
 */

import type {
  AmbientConditions, Breaths, DeathCause, DerivedStat, EventBus, ID,
  SimContext, SimEvent, StatusEffect, Vitals, VitalsSystem,
} from '../core/contract.ts';
import { clamp, clamp01, damp, lerp, pulse } from '../core/util.ts';
import {
  BASELINE, DEPTH_RANGE, DERIVED_BOUNDS, THRESHOLDS, THRESHOLD_IS_PERCENT,
  TRACKED_VITALS, TUNING, VITAL_BOUNDS, type TrackedVital,
} from './tuning.ts';
import { INFECTION_CHAIN, makeStatus, stackLimit, STATUS_BY_ID } from './status.ts';
import type { BreathHoldState, DeathRecord, ExhaleResult, PerceptionFilter } from './types.ts';

interface VitalsInit {
  oxygenMax?: number;
  sanMax?: number;
  bus?: EventBus;
  /** 跨轮回继承的初始状态（例如上一轮没治好的印记）。 */
  carryOver?: readonly ID[];
}

interface SerializedVitals {
  v: Vitals;
  fx: StatusEffect[];
  band: Record<string, number>;
  holding: boolean;
  heldFor: number;
  holdSaved: number;
  elapsed: number;
  death: DeathCause | null;
  drown: number;
  hullStress: number;
  hypoxicDwell: number;
  gasps: number;
  heldTotal: number;
}

/** 单步推进的上限。超过 1 呼吸的 advance 会被切成若干步，保证非线性项（阈值、死亡）不被跳过。 */
const MAX_SUBSTEP = 1;
/** advance 的迭代硬上限，防止有人传进来一个荒谬的大数把主线程锁死。 */
const MAX_ITERATIONS = 4096;

export class VitalsEngine implements VitalsSystem {
  private v: Vitals;
  private fx: StatusEffect[] = [];
  private band: Record<TrackedVital, number>;

  private holding = false;
  private heldFor: Breaths = 0;
  private holdSaved = 0;
  private heldTotal: Breaths = 0;
  private gasps = 0;

  private elapsed: Breaths = 0;
  private death: DeathCause | null = null;
  private deathRecord: DeathRecord | null = null;

  /** 溺水进度 0..1。脱离水面会回落，所以短暂没顶不致命。 */
  private drown = 0;
  /** 密封结构累积损伤，达到 TUNING.pressure.implosionAt 即内爆。 */
  private hullStress = 0;
  /** 连续处于缺氧阈值下的呼吸数，用于延迟触发不可逆脑损伤。 */
  private hypoxicDwell = 0;

  private lastAmbient: AmbientConditions = {
    flooding: 0, pressure: 1, temperature: 12, airQuality: 1, noiseFloor: 0, presence: 0,
  };
  private lastDepth = DEPTH_RANGE[0];

  private derivedCache = new Map<DerivedStat, number>();
  private dirty = true;

  private filter: PerceptionFilter | null = null;
  private bus: EventBus | null = null;
  private pending: SimEvent[] = [];
  /** 由 sim 内部自发产生、尚未被世界消费的噪音（目前只有强制大喘气）。 */
  private pendingNoise = 0;

  constructor(init: VitalsInit = {}) {
    const oxygenMax = init.oxygenMax ?? TUNING.oxygen.startMax;
    const sanMax = init.sanMax ?? TUNING.san.max;
    this.v = {
      oxygen: oxygenMax,
      oxygenMax,
      san: Math.min(TUNING.san.start, sanMax),
      sanMax,
      coreTemp: TUNING.temp.normal,
      co2: 6,          // 静息动脉血本底，不是 0：从 0 开始会让第一次屏息显得过于宽裕
      trauma: 0,
      infection: 0,
      fatigue: 0,
      fear: 8,         // 你已经在一艘沉船里醒来了，起始恐惧不可能是 0
    };
    this.band = {} as Record<TrackedVital, number>;
    for (const s of TRACKED_VITALS) this.band[s] = this.bandOf(s, this.v[s]);
    this.bus = init.bus ?? null;
    for (const id of init.carryOver ?? []) this.apply(makeStatus(id));
  }

  // ──────────────────────────────────────────────────────────────────────
  // 契约要求的只读视图
  // ──────────────────────────────────────────────────────────────────────

  get vitals(): Readonly<Vitals> {
    return this.v;
  }

  get effects(): readonly StatusEffect[] {
    return this.fx;
  }

  get isDead(): boolean {
    return this.death !== null;
  }

  get cause(): DeathCause | null {
    return this.death;
  }

  get record(): DeathRecord | null {
    return this.deathRecord;
  }

  get breathsElapsed(): Breaths {
    return this.elapsed;
  }

  /** 附加感知过滤器（Veracity Layer）。不附加时 perceived() 说真话，便于做无污染对照测试。 */
  attachPerception(filter: PerceptionFilter | null): void {
    this.filter = filter;
  }

  attachBus(bus: EventBus | null): void {
    this.bus = bus;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 主推进
  // ──────────────────────────────────────────────────────────────────────

  /**
   * 推进 n 个呼吸。
   * @param opts.exertion 0..1，本次推进的体力强度。屏息时它决定 CO2 累积得多快——
   *        "边屏息边跑"必须比"屏息蹲着"贵，否则潜行就没有取舍。
   */
  advance(breaths: Breaths, ctx: SimContext, opts?: { exertion?: number }): SimEvent[] {
    const out: SimEvent[] = [];
    this.drainPending(out);
    if (this.death !== null || breaths <= 0) return out;

    this.lastAmbient = ctx.ambient;
    this.lastDepth = ctx.depth;
    const exertion = clamp01(opts?.exertion ?? 0.25);

    let remaining = breaths;
    let iterations = 0;
    while (remaining > 1e-6 && this.death === null && iterations++ < MAX_ITERATIONS) {
      const dt = Math.min(MAX_SUBSTEP, remaining);
      remaining -= dt;
      this.step(dt, ctx, exertion, out);
    }

    this.bus?.emit('vitals:change', { vitals: this.v });
    return out;
  }

  private step(dt: number, ctx: SimContext, exertion: number, out: SimEvent[]): void {
    const amb = ctx.ambient;
    const depthN = clamp01((ctx.depth - DEPTH_RANGE[0]) / (DEPTH_RANGE[1] - DEPTH_RANGE[0]));
    this.elapsed += dt;

    this.tickEffects(dt, out);
    this.tickRespiration(dt, amb, exertion);
    this.forceGaspIfNeeded(out);
    this.tickThermal(dt, amb);
    this.tickBody(dt, depthN);
    this.tickMind(dt, amb, ctx, depthN);
    this.tickHazards(dt, amb, ctx, out);

    this.clampAll();
    this.dirty = true;

    this.autoStatus(out);
    this.detectThresholds(out);
    this.rollHallucination(dt, ctx, out);
    this.checkDeath(ctx, dt, out);

    this.filter?.update({
      vitals: this.v,
      depth: ctx.depth,
      stigmaListening: ctx.flags.getNum('stigma.listening', 0),
      effectLucidity: this.derived('lucidity'),
      breathsElapsed: this.elapsed,
      dt,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // 分项演化
  // ──────────────────────────────────────────────────────────────────────

  private tickEffects(dt: number, out: SimEvent[]): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      if (e.tick) {
        for (const [k, delta] of Object.entries(e.tick) as [keyof Vitals, number][]) {
          this.v[k] += delta * e.stacks * dt;
        }
      }
      if (e.duration > 0) {
        e.duration -= dt;
        if (e.duration <= 0) {
          this.fx.splice(i, 1);
          this.dirty = true;
          out.push({ kind: 'status-expired', id: e.id });
        }
      }
    }
  }

  private tickRespiration(dt: number, amb: AmbientConditions, exertion: number): void {
    const O = TUNING.oxygen;
    const C = TUNING.co2;
    const airPenalty = 1 + O.badAirPenalty * (1 - clamp01(amb.airQuality));

    if (this.holding) {
      // 屏息的全部意义：氧气冻结，代价改由 CO2 承担。
      const saved = O.drainPerBreath * airPenalty * dt;
      this.holdSaved += saved;
      this.heldFor += dt;
      this.heldTotal += dt;
      const fearScale = 1 + (this.v.fear / 100) * C.holdFearScale;
      const exertScale = 1 + exertion * C.holdExertionScale;
      this.v.co2 += C.holdGainPerBreath * fearScale * exertScale * dt;
    } else {
      this.v.oxygen -= O.drainPerBreath * airPenalty * dt;
      // 换气效率随空气品质下降；坏空气里你越呼吸越憋。
      const clear = C.clearPerBreath * (0.35 + 0.65 * clamp01(amb.airQuality));
      const load = C.ambientLoad * (1 - clamp01(amb.airQuality));
      this.v.co2 += (load - clear) * dt;
    }
  }

  /**
   * CO2 ≥ 80 时身体自作主张 —— GDD §4.1 明文的强制大喘气。
   * 噪音进入 pendingNoise，由主循环用 takeNoise() 取走注入当前房间的噪音预算；
   * SimEvent 联合类型里没有"噪音"这一项，而我不能改契约，所以走这条侧信道。
   */
  private forceGaspIfNeeded(out: SimEvent[]): void {
    if (!this.holding || this.v.co2 < TUNING.co2.forcedGaspAt) return;
    const r = this.gasp();
    this.pendingNoise += r.noise;
    out.push(...r.events);
  }

  private tickThermal(dt: number, amb: AmbientConditions): void {
    const T = TUNING.temp;
    // 只有真正浸到身体的水才带走热量，所以水位要先过一个指数曲线（见 tuning 里的说明）。
    const wet = Math.pow(clamp01(amb.flooding), T.floodExponent);
    const envT = lerp(amb.temperature, T.waterTemp, wet);
    const cool = T.coolInAir * (1 + wet * (T.floodMultiplier - 1));
    // 产热受疲劳压制；而且体温已高于正常时不再产热，避免在温暖舱室里烧到 40°C。
    const warm = this.v.coreTemp < T.normal
      ? T.metabolicWarm * (1 - (this.v.fatigue / 100) * T.fatigueWarmPenalty)
      : 0;
    this.v.coreTemp += ((envT - this.v.coreTemp) * cool + warm) * dt;
  }

  private tickBody(dt: number, depthN: number): void {
    const TR = TUNING.trauma;
    if (this.v.trauma > 0 && this.v.trauma < TR.healCeiling) {
      this.v.trauma -= TR.healPerBreath * dt;
    }
    if (this.v.infection > 0) {
      const I = TUNING.infection;
      this.v.infection += I.growthPerBreath * (1 + depthN * I.depthScale) * dt;
    }
    const F = TUNING.fatigue;
    this.v.fatigue += F.gainPerBreath * (1 + (this.v.fear / 100) * F.fearScale) * dt;
  }

  private tickMind(dt: number, amb: AmbientConditions, ctx: SimContext, depthN: number): void {
    const S = TUNING.san;
    const FE = TUNING.fear;
    const resolve = this.derived('resolve');
    const light = clamp01(ctx.flags.getNum('sys.light', 0));
    const dark = 1 - light;
    const corruption = this.filter?.corruption ?? 0;

    // —— 恐惧：趋近一个由环境决定的目标值，而不是自由衰减。
    // 这样"离开那个房间"才是降低恐惧的正确手段，而不是"原地等"。
    let fearTarget =
      clamp01(amb.presence) * FE.presenceWeight +
      dark * FE.darknessWeight +
      depthN * FE.depthWeight +
      clamp01(amb.noiseFloor) * FE.noiseFloorWeight;
    if (this.v.co2 > FE.co2Onset) {
      fearTarget += ((this.v.co2 - FE.co2Onset) / (100 - FE.co2Onset)) * FE.co2Weight;
    }
    fearTarget /= clamp(resolve, 1 / FE.resolveDivisorCap, FE.resolveDivisorCap);
    this.v.fear = damp(this.v.fear, clamp(fearTarget, 0, 100), FE.lambda, dt);

    // —— 理智：多源流失 ÷ 意志，再叠加光照回复。
    let drain =
      S.baseDriftPerBreath +
      clamp01(amb.presence) * S.presenceScale +
      dark * S.darknessScale +
      depthN * S.depthScale +
      (this.v.infection / 100) * S.infectionScale +
      corruption * S.corruptionFeedback;
    if (this.v.co2 > 60) drain += ((this.v.co2 - 60) / 40) * S.co2Scale;
    drain /= clamp(resolve, 0.4, 3);
    this.v.san -= drain * dt;
    this.v.san += light * S.lightRegain * dt;

    // SAN 归零不死，转入"完全共鸣"—— GDD §4.2 的反套路设计，这里只落旗标。
    if (this.v.san <= 0 && !ctx.flags.getBool(S.resonanceFlag)) {
      ctx.flags.set(S.resonanceFlag, true);
      this.bus?.emit('log', { text: '你停止了抵抗。世界终于安静下来，并且开始说话。', tone: 'whisper' });
    }
  }

  private tickHazards(dt: number, amb: AmbientConditions, ctx: SimContext, out: SimEvent[]): void {
    const FL = TUNING.flooding;
    const P = TUNING.pressure;

    if (amb.flooding >= FL.submergedAt && !this.holding) {
      this.drown += FL.drownPerBreath * dt;
      if (!this.has('fx.aspiration')) this.applyById('fx.aspiration', out);
    } else {
      this.drown = Math.max(0, this.drown - FL.drownRecover * dt);
    }

    const rating = ctx.flags.getNum(P.ratingFlag, P.suitRating);
    if (amb.pressure > rating) {
      this.hullStress += (amb.pressure - rating) * P.crushPerAtm * dt;
      if (!this.has('fx.crush')) this.applyById('fx.crush', out);
    } else if (this.hullStress > 0) {
      // 上浮可以缓解，但不能完全抹掉——金属已经变形了。
      this.hullStress = Math.max(this.hullStress * 0.85, this.hullStress - 0.004 * dt);
    }

    const O = TUNING.oxygen;
    if (this.v.oxygen / this.v.oxygenMax < O.hypoxicBrainFraction) {
      this.hypoxicDwell += dt;
      if (this.hypoxicDwell >= O.hypoxicBrainDwell && !this.has('fx.hypoxic-brain')) {
        this.applyById('fx.hypoxic-brain', out);
      }
    } else {
      this.hypoxicDwell = 0;
    }
  }

  /** 由生理读数自动挂载/卸载的状态。玩家不需要手动"确认"自己失温了。 */
  private autoStatus(out: SimEvent[]): void {
    const T = TUNING.temp;
    const severe = this.v.coreTemp <= T.severeHypothermiaAt;
    const mild = this.v.coreTemp <= T.mildHypothermiaAt;

    if (severe) {
      this.removeSilently('fx.hypothermia.mild');
      if (!this.has('fx.hypothermia.severe')) this.applyById('fx.hypothermia.severe', out);
    } else if (mild) {
      this.removeSilently('fx.hypothermia.severe');
      if (!this.has('fx.hypothermia.mild')) this.applyById('fx.hypothermia.mild', out);
    } else if (this.v.coreTemp >= T.recoverAt) {
      this.removeSilently('fx.hypothermia.mild');
      this.removeSilently('fx.hypothermia.severe');
    }

    if (this.v.co2 >= TUNING.co2.narcosisAt) {
      if (!this.has('fx.co2-narcosis')) this.applyById('fx.co2-narcosis', out);
    } else if (this.v.co2 < TUNING.co2.narcosisAt - 12) {
      this.removeSilently('fx.co2-narcosis');
    }

    if (this.v.fatigue >= TUNING.fatigue.exhaustionAt) {
      if (!this.has('fx.exhaustion')) this.applyById('fx.exhaustion', out);
    } else if (this.v.fatigue < TUNING.fatigue.exhaustionAt - 15) {
      this.removeSilently('fx.exhaustion');
    }

    if (this.v.fear >= TUNING.fear.panicAt && !this.has('fx.panic')) {
      this.applyById('fx.panic', out);
    }

    // 感染分期：跨过阈值就升期，且**不回退**——这是一条单向的浮士德曲线。
    const stages = TUNING.infection.stageThresholds;
    for (let i = stages.length - 1; i >= 0; i--) {
      if (this.v.infection >= stages[i]) {
        const id = INFECTION_CHAIN[i];
        if (!this.has(id)) {
          for (let j = 0; j < i; j++) this.removeSilently(INFECTION_CHAIN[j]);
          this.applyById(id, out);
        }
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // 屏息 —— GDD §4.1 指定的"本作最重要的微观决策"
  // ──────────────────────────────────────────────────────────────────────

  /**
   * 开始屏息。氧气冻结，CO2 开始堆积，同时获得潜行加成（见 derived()）。
   * @returns false 表示当前 CO2 已经太高，生理上不可能再憋住。
   */
  holdBreath(): boolean {
    if (this.death !== null) return false;
    if (this.holding) return true;
    // 已经在窒息边缘时不允许再屏息：否则玩家可以用屏息规避 CO2 死亡，把机制玩成无敌。
    if (this.v.co2 >= TUNING.co2.forcedGaspAt - 2) return false;
    this.holding = true;
    this.heldFor = 0;
    this.holdSaved = 0;
    this.dirty = true;
    this.bus?.emit('log', { text: '你把空气锁在胸腔里。世界的声音变闷了。', tone: 'system' });
    return true;
  }

  /**
   * 主动结束屏息。与被迫的大喘气相比，主动吐气的噪音只有 1/6，
   * 并且立刻清掉一部分 CO2 —— 这是对"见好就收"的直接奖励，
   * 也是整个机制的博弈点：多憋一口气可能救命，也可能把 Listener 叫来。
   */
  release(): ExhaleResult {
    if (!this.holding) return { kind: 'none', events: [], noise: 0, oxygenSaved: 0, heldFor: 0 };
    const events: SimEvent[] = [];
    const heldFor = this.heldFor;
    const saved = this.holdSaved;
    this.holding = false;
    this.heldFor = 0;
    this.holdSaved = 0;
    this.v.co2 = Math.max(0, this.v.co2 - TUNING.co2.releaseClear);
    this.dirty = true;
    this.detectThresholds(events);
    const noise = TUNING.co2.releaseNoise * this.derived('noiseEmission');
    return { kind: 'release', events, noise, oxygenSaved: saved, heldFor };
  }

  /**
   * 大喘气。CO2 ≥ 80 时由 advance() 强制调用，玩家也可以主动触发（战术性制造声源）。
   * 噪音 25（GDD §4.3 明文），足以点燃大多数房间的噪音预算。
   */
  gasp(): ExhaleResult {
    const C = TUNING.co2;
    const events: SimEvent[] = [];
    const heldFor = this.heldFor;
    const saved = this.holdSaved;
    this.holding = false;
    this.heldFor = 0;
    this.holdSaved = 0;
    this.gasps++;

    this.v.co2 = Math.max(0, this.v.co2 - C.gaspClear);
    this.v.oxygen -= C.gaspOxygenCost;
    this.v.fear = Math.min(100, this.v.fear + C.gaspFear);
    this.clampAll();
    this.dirty = true;
    this.detectThresholds(events);

    const noise = C.gaspNoise * this.derived('noiseEmission');
    this.bus?.emit('log', { text: '你的身体替你做了决定。那一口气的声音填满了整个舱室。', tone: 'bad' });
    return { kind: 'gasp', events, noise, oxygenSaved: saved, heldFor };
  }

  /** 屏息状态快照。HUD 的"憋气计时环"和音频层的低通滤波都读它。 */
  holdState(): BreathHoldState {
    return {
      holding: this.holding,
      heldFor: this.heldFor,
      untilForcedGasp: this.breathsUntilForcedGasp(),
      oxygenSaved: this.holdSaved,
    };
  }

  /** 还能再憋几口气。这是玩家做决策时最需要的那个数字，所以它必须精确。 */
  breathsUntilForcedGasp(): Breaths {
    if (!this.holding) return Infinity;
    const C = TUNING.co2;
    const rate = C.holdGainPerBreath * (1 + (this.v.fear / 100) * C.holdFearScale);
    if (rate <= 0) return Infinity;
    return Math.max(0, (C.forcedGaspAt - this.v.co2) / rate);
  }

  get holdingBreath(): boolean {
    return this.holding;
  }

  get gaspCount(): number {
    return this.gasps;
  }

  get totalHeldBreaths(): Breaths {
    return this.heldTotal;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 状态效果
  // ──────────────────────────────────────────────────────────────────────

  apply(effect: StatusEffect): void {
    const existing = this.fx.find((e) => e.id === effect.id);
    if (existing) {
      const limit = stackLimit(effect.id);
      existing.stacks = Math.min(limit, existing.stacks + Math.max(1, effect.stacks));
      // 永久优先：任何一方是 -1 就永久；否则刷新到更长的那个。
      existing.duration =
        existing.duration < 0 || effect.duration < 0
          ? -1
          : Math.max(existing.duration, effect.duration);
    } else {
      this.fx.push({ ...effect, tags: [...effect.tags] });
    }
    this.dirty = true;
    this.pending.push({ kind: 'status-applied', id: effect.id });
  }

  /** 按 id 施加库里的状态。out 存在时直接写入本次 advance 的事件流，避免事件迟到一帧。 */
  applyById(id: ID, out?: SimEvent[], override?: { duration?: number; stacks?: number }): void {
    this.apply(makeStatus(id, override));
    if (out) this.drainPending(out);
  }

  remove(id: ID): void {
    const i = this.fx.findIndex((e) => e.id === id);
    if (i < 0) return;
    this.fx.splice(i, 1);
    this.dirty = true;
    this.pending.push({ kind: 'status-expired', id });
  }

  /** 自动状态的卸载不该产生"状态到期"事件——玩家没做任何事，不值得一条日志。 */
  private removeSilently(id: ID): void {
    const i = this.fx.findIndex((e) => e.id === id);
    if (i < 0) return;
    this.fx.splice(i, 1);
    this.dirty = true;
  }

  has(id: ID): boolean {
    return this.fx.some((e) => e.id === id);
  }

  stacksOf(id: ID): number {
    return this.fx.find((e) => e.id === id)?.stacks ?? 0;
  }

  /** 玩家可见的状态列表 —— hidden 的那些确实在结算，但不出现在这里（支柱 P3）。 */
  visibleEffects(): readonly StatusEffect[] {
    return this.fx.filter((e) => !e.hidden);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 派生属性
  // ──────────────────────────────────────────────────────────────────────

  /**
   * 聚合顺序：**先 add 后 mul**，再乘以生理内禀项，最后夹取到安全区间。
   *   value = clamp( (baseline + Σadd·stacks) × Π(mul^stacks) × intrinsic )
   * add 与 mul 不能混算：两个 +20% 的 mul 应该是 ×1.44 而不是 ×1.40，
   * 而两个 +0.5 的 sonarRange add 必须是 +1.0。混算会让装备数值完全不可预测。
   */
  derived(stat: DerivedStat): number {
    if (!this.dirty) {
      const hit = this.derivedCache.get(stat);
      if (hit !== undefined) return hit;
    } else {
      this.derivedCache.clear();
      this.dirty = false;
    }

    let add = 0;
    let mul = 1;
    for (const e of this.fx) {
      if (!e.modifiers) continue;
      for (const m of e.modifiers) {
        if (m.stat !== stat) continue;
        if (m.op === 'add') add += m.value * e.stacks;
        else mul *= Math.pow(m.value, e.stacks);
      }
    }

    let value = (BASELINE[stat] + add) * mul;
    value *= this.intrinsic(stat);

    const [lo, hi] = DERIVED_BOUNDS[stat];
    value = clamp(value, lo, hi);
    this.derivedCache.set(stat, value);
    return value;
  }

  /**
   * 生理内禀修正 —— 不来自任何状态效果，而是 Vitals 本身的直接后果。
   * breathCost 的四项严格照抄 GDD §4.1，不得增删。
   */
  private intrinsic(stat: DerivedStat): number {
    switch (stat) {
      case 'breathCost': {
        const fear = 1 + (this.v.fear / 100) * TUNING.fear.breathCostScale;
        const co2 = 1 + (this.v.co2 / 100) * 0.6;
        const trauma = 1 + this.v.trauma / TUNING.trauma.breathCostDivisor;
        const T = TUNING.temp;
        const cold = this.v.coreTemp < T.coldPenaltyBelow
          ? 1 + (T.coldPenaltyBelow - this.v.coreTemp) * T.coldPenaltyPerDegree
          : 1;
        return fear * co2 * trauma * cold;
      }
      case 'noiseEmission': {
        const fear = 1 + (this.v.fear / 100) * TUNING.fear.noiseScale;
        // 屏息时你几乎不发出声音——这是屏息的正收益，必须做成内禀项而非状态，
        // 否则存档往返时可能残留一个"永久静音"的幽灵状态。
        return fear * (this.holding ? 0.35 : 1);
      }
      case 'stealth':
        return this.holding ? 1.6 : 1;
      case 'resolve':
        return 1 - (this.v.fatigue / 100) * 0.3;
      case 'searchQuality':
        return 1 - (this.v.fatigue / 100) * 0.25;
      case 'sonarFidelity':
        // 高 CO2 会让你听错回波。这是"生理污染感知"的另一条通路，独立于 Veracity。
        return this.v.co2 > 50 ? 1 - ((this.v.co2 - 50) / 50) * 0.22 : 1;
      default:
        return 1;
    }
  }

  /** 动作的实际呼吸成本 —— GDD §4.1：实际 = 基础 × derived('breathCost')。 */
  costOf(baseBreaths: Breaths): Breaths {
    return baseBreaths * this.derived('breathCost');
  }

  /** 心率，供音频层驱动心跳 cue。 */
  heartRateBpm(): number {
    const oxyLack = 1 - clamp01(this.v.oxygen / this.v.oxygenMax);
    return clamp(
      54 + this.v.fear * 0.82 + oxyLack * 26 + this.v.co2 * 0.18 - (this.v.coreTemp < 33 ? 14 : 0),
      38, 190,
    );
  }

  /** 呼吸波形 0..1，供渲染层做 ±0.6% 的画面起伏（GDD §8.1）。屏息时波形冻结。 */
  breathWave(time: number): number {
    if (this.holding) return 0.12 + 0.02 * Math.sin(time * 0.7);
    const rate = this.heartRateBpm() / 4 / 60;
    return clamp01(pulse(time * rate, 5) * 0.5 + 0.35);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 外部冲击入口
  // ──────────────────────────────────────────────────────────────────────

  /** 目击异常 / 被注视 / 认知冲击。fear 与 san 同时被推动，但 resolve 能抵挡一部分。 */
  shock(amount: number, kind: 'sight' | 'sound' | 'touch' | 'knowledge' = 'sight'): SimEvent[] {
    const out: SimEvent[] = [];
    if (this.death !== null) return out;
    const resist = clamp(this.derived('resolve'), 0.4, 3);
    const scale = kind === 'knowledge' ? 1.4 : kind === 'touch' ? 1.2 : 1;
    this.v.fear = Math.min(100, this.v.fear + (amount * scale) / resist);
    this.v.san -= (amount * scale * 0.55) / resist;
    // 惊吓会让人倒抽一口气：屏息中被吓到，CO2 反而更快见顶。
    if (this.holding) this.v.co2 += amount * 0.25;
    this.clampAll();
    this.dirty = true;
    this.detectThresholds(out);
    return out;
  }

  /** 受伤。severity 直接加到 trauma 上；超过 18 的单次伤害会附带出血。 */
  injure(severity: number, out?: SimEvent[]): SimEvent[] {
    const events = out ?? [];
    this.v.trauma += severity;
    this.v.fear = Math.min(100, this.v.fear + severity * 0.6);
    if (severity >= 18 && !this.has('fx.hemorrhage')) this.applyById('fx.hemorrhage', events);
    if (severity >= 26 && !this.has('fx.fracture.rib')) this.applyById('fx.fracture.rib', events);
    this.clampAll();
    this.dirty = true;
    this.detectThresholds(events);
    return events;
  }

  /** 被"外面的东西"接触。 */
  infect(amount: number, out?: SimEvent[]): SimEvent[] {
    const events = out ?? [];
    this.v.infection += amount;
    this.clampAll();
    this.dirty = true;
    this.autoStatus(events);
    this.detectThresholds(events);
    return events;
  }

  /** 恢复类道具的统一入口，避免各系统直接写 this.v。 */
  restore(patch: Partial<Record<TrackedVital, number>>): void {
    for (const [k, delta] of Object.entries(patch) as [TrackedVital, number][]) {
      this.v[k] += delta;
    }
    this.clampAll();
    this.dirty = true;
  }

  /** 识破谎言的 SAN 奖励 —— GDD §5 明文 +8。 */
  rewardDebunk(): void {
    this.v.san = Math.min(this.v.sanMax, this.v.san + TUNING.san.debunkReward);
    this.dirty = true;
  }

  /**
   * 外部致死（Listener / 仪式 / 自戕 / 主动淹没）。
   * 这些死因不可能由生理公式自行推导出来，必须由遭遇与叙事系统显式宣告。
   */
  kill(cause: DeathCause): SimEvent[] {
    if (this.death !== null) return [];
    return this.die(cause);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 阈值 / 死亡 / 幻觉
  // ──────────────────────────────────────────────────────────────────────

  private bandOf(stat: TrackedVital, value: number): number {
    const marks = THRESHOLDS[stat];
    let v = value;
    if (THRESHOLD_IS_PERCENT[stat]) {
      const max = stat === 'oxygen' ? this.v.oxygenMax : this.v.sanMax;
      v = max > 0 ? (value / max) * 100 : 0;
    }
    let b = 0;
    for (const m of marks) if (v >= m) b++;
    return b;
  }

  private detectThresholds(out: SimEvent[]): void {
    for (const stat of TRACKED_VITALS) {
      const nb = this.bandOf(stat, this.v[stat]);
      const ob = this.band[stat];
      if (nb === ob) continue;
      this.band[stat] = nb;
      out.push({
        kind: 'vitals-threshold',
        stat,
        crossed: nb > ob ? 'up' : 'down',
        value: this.v[stat],
      });
    }
  }

  private rollHallucination(dt: number, ctx: SimContext, out: SimEvent[]): void {
    const c = this.filter?.corruption ?? 0;
    if (c < TUNING.veracity.layers[0]) return;
    // 频率与污染度的平方成正比：低污染时是罕见的惊鸿一瞥，高污染时才变成持续折磨。
    if (ctx.rng.next() < c * c * 0.05 * dt) {
      out.push({ kind: 'hallucination', severity: c });
    }
  }

  private checkDeath(ctx: SimContext, dt: number, out: SimEvent[]): void {
    if (this.death !== null) return;

    // 顺序即优先级：结构性灾难 > 急性窒息 > 慢性衰竭 > 自戕。
    if (this.hullStress >= TUNING.pressure.implosionAt) {
      out.push(...this.die('implosion'));
      return;
    }
    if (this.drown >= 1) {
      out.push(...this.die('drowning'));
      return;
    }
    if (this.v.oxygen <= 0 || this.v.co2 >= TUNING.co2.lethal) {
      out.push(...this.die('asphyxiation'));
      return;
    }
    if (this.v.coreTemp <= TUNING.temp.lethal) {
      out.push(...this.die('hypothermia'));
      return;
    }
    if (this.v.trauma >= TUNING.trauma.lethal) {
      out.push(...this.die('trauma'));
      return;
    }
    if (this.v.infection >= TUNING.infection.lethal) {
      out.push(...this.die('infection'));
      return;
    }

    const D = TUNING.death;
    if (
      ctx.flags.getNum(D.allowSelfHarmFlag, 1) !== 0 &&
      this.v.fear >= D.selfHarmFearAt &&
      this.v.san <= D.selfHarmSanAt &&
      this.v.co2 >= D.selfHarmCo2At &&
      ctx.rng.next() < D.selfHarmChancePerBreath * dt
    ) {
      out.push(...this.die('self'));
    }
  }

  private die(cause: DeathCause): SimEvent[] {
    this.death = cause;
    this.holding = false;
    this.deathRecord = {
      cause,
      atBreath: this.elapsed,
      depth: this.lastDepth,
      finalVitals: { ...this.v },
    };
    this.bus?.emit('death', { cause });
    return [{ kind: 'death', cause }];
  }

  // ──────────────────────────────────────────────────────────────────────
  // 感知（被污染的真相）
  // ──────────────────────────────────────────────────────────────────────

  /**
   * HUD 唯一允许读取的接口。返回值可能与真值不同，且**不会有任何提示**（GDD §8.3）。
   * 两个隐藏状态在这里额外动手脚：表盘偏差把氧气读高，借来的一口气则让真值偷偷流失
   * 而读数毫无反应——玩家只能通过"我明明还有 200 却突然黑屏"来事后推断。
   */
  perceived(): Vitals {
    const p: Vitals = { ...this.v };
    if (this.filter) {
      for (const stat of TRACKED_VITALS) {
        p[stat] = this.filter.number(this.v[stat], stat);
      }
    }
    if (this.has('fx.hidden.gauge-lie')) {
      p.oxygen = Math.min(p.oxygenMax, p.oxygen * 1.14 + 6);
    }
    // 屏息时表盘不动：这是真实的（氧气确实没在掉），也让玩家更愿意相信它。
    return p;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 存档
  // ──────────────────────────────────────────────────────────────────────

  serialize(): unknown {
    const blob: SerializedVitals = {
      v: { ...this.v },
      fx: this.fx.map((e) => ({
        ...e,
        tags: [...e.tags],
        modifiers: e.modifiers ? e.modifiers.map((m) => ({ ...m })) : undefined,
        tick: e.tick ? { ...e.tick } : undefined,
      })),
      band: { ...this.band },
      holding: this.holding,
      heldFor: this.heldFor,
      holdSaved: this.holdSaved,
      elapsed: this.elapsed,
      death: this.death,
      drown: this.drown,
      hullStress: this.hullStress,
      hypoxicDwell: this.hypoxicDwell,
      gasps: this.gasps,
      heldTotal: this.heldTotal,
    };
    return blob;
  }

  hydrate(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as Partial<SerializedVitals>;
    if (d.v) this.v = { ...this.v, ...d.v };
    if (d.fx) {
      // 状态定义可能在版本更新中被删除；静默丢弃未知 id 好过让存档整个报废。
      this.fx = d.fx
        .filter((e) => STATUS_BY_ID.has(e.id))
        .map((e) => ({
          ...e,
          tags: [...e.tags],
          modifiers: e.modifiers ? e.modifiers.map((m) => ({ ...m })) : undefined,
          tick: e.tick ? { ...e.tick } : undefined,
        }));
    }
    this.holding = d.holding ?? false;
    this.heldFor = d.heldFor ?? 0;
    this.holdSaved = d.holdSaved ?? 0;
    this.elapsed = d.elapsed ?? 0;
    this.death = d.death ?? null;
    this.drown = d.drown ?? 0;
    this.hullStress = d.hullStress ?? 0;
    this.hypoxicDwell = d.hypoxicDwell ?? 0;
    this.gasps = d.gasps ?? 0;
    this.heldTotal = d.heldTotal ?? 0;
    // band 总是重算而不是信任存档：阈值表可能在补丁里改过，重算保证不会漏报或误报一次穿越。
    this.band = {} as Record<TrackedVital, number>;
    for (const s of TRACKED_VITALS) this.band[s] = this.bandOf(s, this.v[s]);
    this.dirty = true;
    this.pending.length = 0;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 内务
  // ──────────────────────────────────────────────────────────────────────

  private clampAll(): void {
    for (const s of TRACKED_VITALS) {
      const [lo, hi] = VITAL_BOUNDS[s];
      const cap = s === 'oxygen' ? Math.min(hi, this.v.oxygenMax) : s === 'san' ? Math.min(hi, this.v.sanMax) : hi;
      this.v[s] = clamp(this.v[s], lo, cap);
    }
  }

  /** 取走并清空 sim 自发产生的噪音。主循环每次 advance 之后必须调一次。 */
  takeNoise(): number {
    const n = this.pendingNoise;
    this.pendingNoise = 0;
    return n;
  }

  private drainPending(out: SimEvent[]): void {
    if (this.pending.length === 0) return;
    out.push(...this.pending);
    this.pending.length = 0;
  }
}
