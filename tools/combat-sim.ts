/**
 * 战斗平衡模拟器。
 *   npx tsx tools/combat-sim.ts [--runs 1300] [--seed 20260915] [--verbose]
 *
 * 它回答三个问题，其中后两个才是真正的验收项：
 *   1. 每种敌人的胜率 / 逃脱率 / 死亡率是否落在设计意图里；
 *   2. 有没有**统治性动作**（使用率 > 25%）—— 有就说明系统被一招压平了；
 *   3. 有没有**废动作**（使用率 < 0.5%）—— 有就说明那个设计没有在任何局面下成立。
 *
 * 为了让使用率有意义，这里不用随机策略。四个策略原型各有一套效用权重，
 * 模拟的是"四种真实打法的人"，而不是"四个乱点的人"。
 */

import type {
  AmbientConditions,
  DerivedStat,
  Effect,
  ID,
  SimContext,
  SimEvent,
  StatusEffect,
  Vitals,
  VitalsSystem,
} from '../src/core/contract';
import { Xoshiro } from '../src/core/rng';
import { Flags } from '../src/core/flags';
import { clamp, clamp01 } from '../src/core/util';
import { EncounterEngine } from '../src/encounter/engine';
import { Inventory } from '../src/encounter/inventory';
import { CognitionLedger } from '../src/encounter/cognition';
import { actionStats, ALL_ACTIONS } from '../src/encounter/actions';
import { bandIndex, bandOf, defOf, findEntity, liveEntities } from '../src/encounter/combat-math';
import type { ActionDef, EncounterRuntime } from '../src/encounter/types';
import { allEnemyDefs, bestiaryStats, ENCOUNTERS, enemyDef } from '../src/content/bestiary/index';
import { itemStats } from '../src/content/items/index';

// ===========================================================================
// 本地 VitalsSystem —— 按 GDD §4.1 实现，供模拟器独立运行
// ===========================================================================

class SimVitals implements VitalsSystem {
  private v: Vitals;
  private fx: StatusEffect[] = [];

  constructor(init?: Partial<Vitals>) {
    this.v = {
      oxygen: 900,
      oxygenMax: 900,
      san: 72,
      sanMax: 100,
      coreTemp: 36.2,
      co2: 8,
      trauma: 0,
      infection: 0,
      fatigue: 10,
      fear: 22,
      ...init,
    };
  }

  get vitals(): Readonly<Vitals> {
    return this.v;
  }

  get effects(): readonly StatusEffect[] {
    return this.fx;
  }

  advance(breaths: number, ctx: SimContext): SimEvent[] {
    const ev: SimEvent[] = [];
    if (breaths <= 0) {
      // 屏息：不耗氧，但 CO2 按 GDD 每呼吸 +4
      this.v.co2 = clamp(this.v.co2 + 4, 0, 100);
      return ev;
    }
    this.v.oxygen = Math.max(0, this.v.oxygen - breaths);
    this.v.co2 = clamp(this.v.co2 + breaths * 0.35 - 1.2, 0, 100);
    this.v.fatigue = clamp(this.v.fatigue + breaths * 0.12, 0, 100);
    // 恐惧自然回落，否则任何一场遭遇都会单调地走向 PANIC
    this.v.fear = clamp(this.v.fear - breaths * 0.35 + ctx.ambient.presence * 0.6, 0, 100);
    this.v.coreTemp = clamp(this.v.coreTemp - breaths * 0.006 * (1 + ctx.ambient.flooding), 15, 42);
    if (this.v.infection > 0) this.v.infection = clamp(this.v.infection + breaths * 0.02, 0, 100);
    if (this.v.oxygen <= 0) ev.push({ kind: 'death', cause: 'asphyxiation' });
    if (this.v.trauma >= 100) ev.push({ kind: 'death', cause: 'trauma' });
    if (this.v.coreTemp < 28) ev.push({ kind: 'death', cause: 'hypothermia' });
    return ev;
  }

  apply(effect: StatusEffect): void {
    const cur = this.fx.find((f) => f.id === effect.id);
    if (cur) cur.stacks += 1;
    else this.fx.push({ ...effect });
  }

  remove(id: ID): void {
    this.fx = this.fx.filter((f) => f.id !== id);
  }

  derived(stat: DerivedStat): number {
    const v = this.v;
    switch (stat) {
      case 'breathCost': {
        const cold = v.coreTemp < 35 ? (35 - v.coreTemp) * 0.08 : 0;
        return 1 + (v.fear / 100) * 1.2 + (v.co2 / 100) * 0.6 + v.trauma / 150 + cold;
      }
      case 'noiseEmission':
        return 1 + (v.fear / 100) * 0.35;
      case 'sonarRange':
        return 1;
      case 'sonarFidelity':
        return clamp01(0.5 + v.san / 200);
      case 'searchQuality':
        return 1;
      case 'meleePower':
        return 1 + (v.fear / 100) * 0.1 - v.fatigue / 400;
      case 'resolve':
        return clamp(1 - v.fear / 220 + v.san / 300, 0.2, 1.6);
      case 'stealth':
        return clamp(1.1 - v.fear / 250, 0.4, 1.4);
      case 'lucidity':
        return clamp(v.san / 60, 0.2, 2);
      default:
        return 1;
    }
  }

  perceived(): Vitals {
    return { ...this.v };
  }

  patch(stat: keyof Vitals, delta: number): void {
    const max = stat === 'san' ? this.v.sanMax : stat === 'oxygen' ? this.v.oxygenMax : 100;
    const lo = stat === 'coreTemp' ? 15 : 0;
    const hi = stat === 'coreTemp' ? 42 : max;
    const bag = this.v as unknown as Record<string, number>;
    bag[stat as string] = clamp(bag[stat as string] + delta, lo, hi);
  }

  serialize(): unknown {
    return this.v;
  }

  hydrate(d: unknown): void {
    if (d && typeof d === 'object') this.v = { ...this.v, ...(d as Partial<Vitals>) };
  }
}

// ===========================================================================
// 装备
// ===========================================================================

/**
 * 五套行囊。
 * 刻意**不给**万能背包：28 kg 的上限下，带了斧子就带不了消音包裹。
 * 装备差异是动作使用率差异的第一来源 —— 这也是背包管理有意义的证明。
 */
type Kit = readonly (readonly [ID, number])[];

const KITS: Record<string, Kit> = {
  // 潜行：全部押在"不被听见"上。武器只有一把闷管和一把刀
  stealth: [
    ['it.hand-lamp', 1],
    ['it.dive-knife', 1],
    ['it.muffled-pipe', 1],
    ['it.silence-wrap', 1],
    ['it.soft-soles', 1],
    ['it.corpse-grease', 2],
    ['it.asbestos-cloth', 1],
    ['it.pebble-pouch', 2],
    ['it.clicker-decoy', 1],
    ['it.stethoscope', 1],
    ['it.scrubber-cartridge', 1],
    ['it.hemostat-pack', 1],
    ['it.chalk-stick', 1],
  ],
  // 硬碰：斧子 + 火 + 枪。全是响的
  brawl: [
    ['it.hand-lamp', 1],
    ['it.fire-axe', 1],
    ['it.pry-bar', 1],
    ['it.service-revolver', 1],
    ['it.revolver-round', 4],
    ['it.magnesium-flare', 2],
    ['it.tallow', 2],
    ['it.storm-match', 3],
    ['it.oxygen-candle', 1],
    ['it.hemostat-pack', 2],
    ['it.smelling-salts', 1],
  ],
  // 研究：精密工具、酸、声呐、教义册。伤害低但每一下都打在对的位置
  scholar: [
    ['it.repaired-lamp', 1],
    ['it.honed-knife', 1],
    ['it.bone-file', 1],
    ['it.speargun', 1],
    ['it.spear-bolt', 3],
    ['it.hand-sonar', 1],
    ['it.acid-flask', 2],
    ['it.stethoscope', 1],
    ['it.catechism', 1],
    ['it.breaker-key', 1],
    ['it.reality-anchor', 1],
    ['it.asbestos-cloth', 1],
    ['it.storm-match', 2],
  ],
  // 新手：捡到什么带什么，而且带了一件圣物（它会替他报位置）
  novice: [
    ['it.hand-lamp', 1],
    ['it.iron-pipe', 1],
    ['it.pebble-pouch', 1],
    ['it.storm-match', 1],
    ['it.hemostat-pack', 1],
    ['it.drowned-icon', 1],
    ['it.tinned-meat', 1],
    ['it.ration-biscuit', 2],
  ],
  // 熟手：跨轮回之后的配置，什么都有一点，而且知道要带钥匙
  veteran: [
    ['it.repaired-lamp', 1],
    ['it.honed-knife', 1],
    ['it.tethered-harpoon', 1],
    ['it.mallet', 1],
    ['it.silence-wrap', 1],
    ['it.soft-soles', 1],
    ['it.acid-flask', 2],
    ['it.magnesium-flare', 1],
    ['it.clicker-decoy', 1],
    ['it.strong-bait', 1],
    ['it.scrubber-cartridge', 2],
    ['it.smelling-salts', 1],
    ['it.hemostat-pack', 1],
    ['it.valve-handwheel', 1],
    ['it.breaker-key', 1],
    ['it.catechism', 1],
    ['it.storm-match', 2],
  ],
  // 拆解者：把敌人当机械来拆。重、慢、响，但能卸掉任何一个部位
  butcher: [
    ['it.hand-lamp', 1],
    ['it.pipe-wrench', 1],
    ['it.cable-whip', 1],
    ['it.harpoon', 1],
    ['it.mallet', 1],
    ['it.bait-flesh', 2],
    ['it.hemostat-pack', 1],
    ['it.storm-match', 2],
  ],
  // 亵渎者：靠仪式器物活着，代价是身上一直有信号
  apostate: [
    ['it.hand-lamp', 1],
    ['it.ritual-knife', 1],
    ['it.catechism', 1],
    ['it.drowned-icon', 1],
    ['it.reality-anchor', 1],
    ['it.corpse-grease', 1],
    ['it.oxygen-candle', 1],
    ['it.smelling-salts', 1],
    ['it.hemostat-pack', 1],
    ['it.storm-match', 2],
  ],
  // 拾荒者：没有武器，只有一口袋能扔的东西
  scavenger: [
    ['it.hand-lamp', 1],
    ['it.iron-pipe', 1],
    ['it.hull-bolt', 3],
    ['it.pebble-pouch', 2],
    ['it.clicker-decoy', 1],
    ['it.bait-flesh', 1],
    ['it.tallow', 2],
    ['it.storm-match', 3],
    ['it.corpse-grease', 1],
    ['it.chalk-stick', 1],
    ['it.hemostat-pack', 1],
  ],
  // 濒死者：氧气见底、恐惧见顶的最后十分钟。带的全是"再撑一口"的东西。
  // 没有这个原型，急救类动作都测不出使用率 —— 但它们在真实的一轮末期
  // 恰恰是**最常按的键**。模拟器必须覆盖这个状态，否则平衡数据是假的。
  dying: [
    ['it.repaired-lamp', 1],
    ['it.dive-knife', 1],
    ['it.scrubber-cartridge', 2],
    ['it.oxygen-candle', 1],
    ['it.atropine', 1],
    ['it.smelling-salts', 2],
    ['it.reality-anchor', 1],
    ['it.hemostat-pack', 2],
    ['it.storm-match', 1],
  ],
};

// ===========================================================================
// 策略原型
// ===========================================================================

interface Policy {
  name: string;
  /** 按 tag 的偏好倍率 */
  tag: Record<string, number>;
  /** softmax 温度：越小越果断 */
  temp: number;
  /** 起始恐惧，用来覆盖不同的相位分布 */
  fear: number;
  /** 起始认知（0 = 第一次见，0.6 = 读过档案） */
  cognition: number;
  /** 行囊。策略与装备必须绑定，否则测不出背包决策的重量 */
  kit: keyof typeof KITS;
  /** 起始生命体征覆盖，用来模拟"一轮末期"这种真实状态 */
  vitals?: Partial<Vitals>;
}

const POLICIES: readonly Policy[] = [
  {
    name: '潜行者',
    tag: { stealth: 2.4, silent: 1.9, mask: 2.2, escape: 1.7, info: 1.5, loud: 0.25, melee: 0.6, breath: 1.6 },
    temp: 0.9,
    fear: 18,
    cognition: 0.3,
    kit: 'stealth',
  },
  {
    name: '硬碰者',
    tag: { melee: 2.2, loud: 1.4, ranged: 1.6, defense: 1.3, precision: 1.4, stealth: 0.5, mask: 0.4, info: 0.7 },
    temp: 0.9,
    fear: 26,
    cognition: 0.3,
    kit: 'brawl',
  },
  {
    name: '研究者',
    tag: { info: 2.6, precision: 2.2, silent: 1.5, medical: 1.2, social: 1.4, loud: 0.5, panic: 0.8, mask: 1.3 },
    temp: 1.0,
    fear: 20,
    cognition: 0.3,
    kit: 'scholar',
  },
  {
    name: '新手',
    tag: { light: 1.6, melee: 1.3, social: 1.5, info: 1.1, escape: 1.2, precision: 0.6, mask: 0.7 },
    temp: 1.8,
    fear: 38,
    cognition: 0.02,
    kit: 'novice',
  },
  {
    name: '熟手',
    tag: { precision: 1.8, silent: 1.6, info: 1.3, mask: 1.5, melee: 1.2, escape: 1.3, medical: 1.2, loud: 0.8 },
    temp: 0.8,
    fear: 22,
    cognition: 0.85,
    kit: 'veteran',
  },
  {
    name: '拆解者',
    tag: { melee: 2.6, precision: 1.7, loud: 1.2, ranged: 1.4, defense: 1.2, stealth: 0.5, mask: 0.5, escape: 0.6 },
    temp: 0.85,
    fear: 24,
    cognition: 0.45,
    kit: 'butcher',
  },
  {
    name: '亵渎者',
    tag: { ritual: 2.8, social: 2.4, sacrifice: 1.8, silent: 1.5, precision: 1.4, info: 1.2, loud: 0.5 },
    temp: 1.1,
    fear: 30,
    cognition: 0.35,
    kit: 'apostate',
  },
  {
    name: '拾荒者',
    tag: { thrown: 3.0, sound: 2.0, stealth: 1.8, mask: 1.6, escape: 1.5, info: 1.3, melee: 0.8, precision: 0.7 },
    temp: 1.0,
    fear: 26,
    cognition: 0.15,
    kit: 'scavenger',
  },
  {
    name: '濒死者',
    tag: { breath: 3.0, medical: 2.6, escape: 2.2, silent: 1.4, sacrifice: 1.6, melee: 0.7, loud: 0.6 },
    temp: 1.3,
    fear: 66,
    cognition: 0.6,
    kit: 'dying',
    vitals: { oxygen: 210, co2: 58, trauma: 52, san: 34, fatigue: 68, coreTemp: 34.1 },
  },
];

// ===========================================================================
// 效用评分
// ===========================================================================

/**
 * 情境效用。这里编码的是"一个懂规则的玩家会怎么想"，
 * 所以它同时是策略也是**设计自检**：如果某个动作在任何情境下都算不出高分，
 * 那它就是废动作，应该改掉而不是留着。
 */
function utility(a: ActionDef, rt: EncounterRuntime, vit: SimVitals, inv: Inventory, pol: Policy): number {
  let u = 1;
  for (const t of a.tags) u *= pol.tag[t] ?? 1;

  const e = findEntity(rt);
  const def = e ? defOf(e) : undefined;
  const tier = e ? rt.cogTier[e.defId] ?? 0 : 0;
  const band = e ? bandIndex(bandOf(rt, e.id)) : 0;
  const aware = e?.awareness ?? 0;
  const hpFrac = e && def ? e.hp / def.hpMax : 1;
  const senses = def?.senses ?? [];

  // --- 相位基本盘 ------------------------------------------------------
  if (rt.phase === 'stalk') {
    if (a.tags.includes('info')) u *= 1.5 + (1 - tier) * 1.2;
    if (a.tags.includes('mask') || a.tags.includes('stealth')) u *= 1 + aware * 2.2;
    if (a.tags.includes('melee') && band < 3) u *= 0.25;
  } else if (rt.phase === 'contact') {
    if (a.tags.includes('melee') || a.tags.includes('ranged')) u *= 1.5;
    if (a.tags.includes('info')) u *= tier >= 2 ? 0.5 : 1.3;
    if (a.tags.includes('mask')) u *= 0.6;
  }

  // --- 资源压力 --------------------------------------------------------
  if (a.tags.includes('breath') && vit.vitals.oxygen < 380) u *= 3.2;
  if (a.id === 'act.hold-breath' && vit.vitals.co2 > 60) u *= 0.15;
  if (a.tags.includes('medical') && vit.vitals.trauma > 45) u *= 2.6;
  if (a.id === 'act.reality-anchor' && vit.vitals.san > 45) u *= 0.2;
  if (a.id === 'act.atropine' && vit.vitals.fear < 55) u *= 0.2;
  if (a.id === 'act.smelling-salts' && vit.vitals.fear < 70) u *= 0.2;
  // 噪音顾虑是**策略属性**，不是客观真理：硬碰流的定义就是"不在乎它听见"。
  // 之前把这条写成全局惩罚，结果是噪音一上来所有近战动作被一起压死，
  // 让模拟器测不出斧子存在的意义。
  const noiseAverse = (pol.tag.loud ?? 1) < 1;
  if (noiseAverse && a.tags.includes('loud')) {
    if (rt.noise > 60) u *= 0.35;
    if (rt.listenerPressure > 0.6) u *= 0.3;
  }

  // --- 感知通道匹配：这是"敌人不是换皮"的判据 ---------------------------
  if (a.id === 'act.throw-pebble' || a.id === 'act.throw-bolt' || a.id === 'act.clicker-decoy') {
    const cred = def?.decoyCredulity.sound ?? 0;
    u *= senses.includes('sound') ? 0.6 + cred * 2.4 : 0.12;
  }
  if (a.id === 'act.drop-bait' || a.id === 'act.feed-flesh') {
    u *= senses.includes('heat') || def?.tags.includes('swarm') ? 2.2 : 0.15;
  }
  if (a.id === 'act.douse-lamp' || a.id === 'act.cut-power' || a.id === 'act.blind-lantern') {
    u *= senses.includes('light') ? 2.6 : 0.18;
  }
  if (a.id === 'act.corpse-grease' || a.id === 'act.asbestos-shroud' || a.id === 'act.chill-soak') {
    u *= senses.includes('heat') ? 2.4 : 0.15;
  }
  if (a.id === 'act.silence-wrap' || a.id === 'act.soft-soles' || a.id === 'act.vent-steam') {
    u *= senses.includes('sound') || senses.includes('vibration') ? 2.0 : 0.2;
  }
  if (a.id === 'act.drop-relics' || a.id === 'act.mimic-hymn' || a.id === 'act.recite-creed') {
    u *= senses.includes('faith') ? 2.8 : 0.15;
  }
  if (a.id === 'act.raise-lamp') u *= senses.includes('light') ? 0.25 : rt.light < 0.3 ? 1.9 : 0.5;
  if (a.id === 'act.sonar-probe') u *= def?.tags.includes('noise-feeder') ? 0.05 : tier < 2 ? 1.5 : 0.4;
  if (a.tags.includes('loud') && def?.tags.includes('noise-feeder')) u *= 0.2;
  if (a.id === 'act.plead') u *= def?.negotiable ? 2.6 : 0.1;
  if (a.id === 'act.smother-vocal') u *= def?.intents.some((i) => i.kind === 'call') ? 2.2 : 0.3;

  // --- 部位定向动作 ----------------------------------------------------
  if (a.needsCognition) u *= tier >= a.needsCognition ? 1.6 : 0;
  if (a.id === 'act.cauterize-brood') u *= def?.parts.some((p) => p.fn === 'brood') ? 3.2 : 0;
  if (a.id === 'act.pith-core') u *= def?.unkillable ? 0 : hpFrac < 0.75 ? 2.8 : 1.2;
  if (a.id === 'act.mercy-cut' || a.id === 'act.live-autopsy') u *= hpFrac < 0.35 ? 2.4 : 0.05;
  if (a.id === 'act.crack-armor') {
    const armor = def?.parts.filter((p) => p.armor >= 5).length ?? 0;
    u *= armor > 0 ? 1.8 : 0.2;
  }
  // 关门房间里切腱是**出路**而不是减速：玩家一旦知道这条，优先级会顶到最高
  if (a.id === 'act.sever-tendon') {
    u *= (def?.approach ?? 0) > 0.3 ? 1.9 : 0.3;
    if (!rt.escapable) u *= 3.0;
  }
  if (a.id === 'act.spike-auditory') u *= senses.includes('sound') || senses.includes('vibration') ? 2.0 : 0.2;
  if (a.id === 'act.gouge-thermal') u *= senses.includes('heat') || senses.includes('light') ? 2.0 : 0.2;
  if (a.id === 'act.crush-resonator') u *= def?.tags.includes('noise-feeder') ? 3.0 : senses.includes('sound') ? 1.4 : 0.2;
  if (a.id === 'act.acid-pour') {
    const armor = Math.max(0, ...(def?.parts ?? []).map((p) => p.armor));
    u *= armor >= 6 ? 2.6 : 0.5;
  }
  if (a.id === 'act.flare-burn' || a.id === 'act.oil-ignite') u *= def?.tags.includes('swarm') ? 3.4 : 0.7;
  if (a.id === 'act.harpoon-pin') u *= (def?.evasion ?? 0) > 0.35 || def?.tags.includes('pipe') ? 2.2 : 0.5;

  // --- 逃与守 ----------------------------------------------------------
  if (a.tags.includes('escape')) {
    const hopeless = (def?.unkillable ?? false) || vit.vitals.trauma > 60 || vit.vitals.oxygen < 260;
    u *= hopeless ? 3.0 : rt.phase === 'stalk' ? 0.9 : 0.6;
  }
  if (a.id === 'act.withdraw' && !rt.escapable) u *= 0.05;
  if (a.id === 'act.break-grapple') u *= rt.restrained ? 6 : 0;
  if (a.id === 'act.hold-line') u *= band >= 3 && aware > 0.5 ? 1.7 : 0.4;
  if (a.id === 'act.shove') u *= rt.restrained ? 2.4 : band >= 4 ? 1.3 : 0.5;
  if (a.id === 'act.count-breaths') u *= rt.noise > 45 && band <= 2 ? 2.2 : 0.35;
  if (a.id === 'act.freeze') u *= aware > 0.35 && band <= 2 ? 2.4 : 0.4;
  if (a.id === 'act.creep') u *= band >= 2 ? 1.5 : 0.8;
  // 想打近战就必须先走过去。没有这条，进攻型策略会永远卡在 far 档上举灯
  if (a.id === 'act.close-in') u *= (pol.tag.melee ?? 1) >= 1.5 && band < 4 ? 3.4 : 0.25;
  // 安静近战是潜行流在贴身时**唯一**还敢做的输出：
  // 已经被贴上了，再退就是背对着它退。
  if (a.id === 'act.knife-thrust' || a.id === 'act.muffled-bludgeon' || a.id === 'act.ritual-cut') {
    u *= band >= 4 ? 3.2 : band === 3 ? 1.4 : 0.35;
  }
  if (a.id === 'act.mark-door') u *= rt.markedExit ? 0.05 : rt.phase === 'stalk' ? 1.4 : 0.3;
  if (a.id === 'act.slip-past') u *= band === 2 || band === 3 ? 1.9 : 0.2;
  if (a.id === 'act.read-spoor') u *= tier < 2 ? 1.8 : 0.2;
  if (a.id === 'act.observe') u *= tier < 3 ? 1.6 : 0.15;
  if (a.id === 'act.listen-hull') u *= bandOf(rt, e?.id ?? '') === 'unknown' || tier < 2 ? 1.7 : 0.4;

  // --- PANIC ------------------------------------------------------------
  if (rt.phase === 'panic') {
    if (a.id === 'act.panic-scream') u *= 2.6;
    if (a.id === 'act.bite-down') u *= 3.0;
    if (a.id === 'act.panic-rigid' || a.id === 'act.panic-fumble') u *= 0.5;
    if (a.id === 'act.panic-bolt') u *= rt.escapable ? 1.5 : 0.3;
  }

  // 呼吸成本：贵的动作在氧气紧的时候自然被压下去
  u *= 1 / (1 + a.cost * 0.06);
  return Math.max(0.0001, u);
}

function choose(acts: readonly ActionDef[], rt: EncounterRuntime, vit: SimVitals, inv: Inventory, pol: Policy, rng: Xoshiro): ActionDef {
  const scored = acts.map((a) => [a, Math.pow(utility(a, rt, vit, inv, pol), 1 / pol.temp)] as [ActionDef, number]);
  return rng.weighted(scored);
}

/** 部位选择。有一定概率去打认知图上那个不存在的部位 —— 这是玩家会犯的真实错误 */
function pickTarget(
  a: ActionDef,
  rt: EncounterRuntime,
  ledger: CognitionLedger,
  rng: Xoshiro,
): { entity?: ID; part?: ID } {
  const e = findEntity(rt);
  if (!e) return {};
  if (a.targeting !== 'part') return { entity: e.id };
  const view = ledger.view(e.defId);
  const phantoms = view.chart.filter((c) => c.phantom);
  if (phantoms.length && rng.bool(0.22)) return { entity: e.id, part: rng.pick(phantoms).id };
  const real = view.chart.filter((c) => !c.phantom);
  if (!real.length) return { entity: e.id };
  // 让动作自己挑最合适的部位（传 undefined），只有研究型打法才手动指定
  if (rng.bool(0.45)) return { entity: e.id };
  return { entity: e.id, part: rng.pick(real).id };
}

// ===========================================================================
// 单场模拟
// ===========================================================================

interface RunResult {
  enemy: ID;
  policy: string;
  outcome: 'killed' | 'escaped' | 'died' | 'spared' | 'stalemate';
  rounds: number;
  peakNoise: number;
  panicRounds: number;
  enteredPanic: boolean;
  finalCognition: number;
  actions: Record<ID, number>;
  listenerSummoned: boolean;
  phantomHits: number;
}

const AMBIENT: AmbientConditions = {
  flooding: 0.25,
  pressure: 21,
  temperature: 7,
  airQuality: 0.72,
  noiseFloor: 3,
  presence: 0.3,
};

function runOne(encId: ID, enemyId: ID, pol: Policy, seed: number): RunResult {
  const rng = new Xoshiro(seed, 'sim');
  const flags = new Flags();
  const vitals = new SimVitals({ fear: pol.fear, ...pol.vitals });
  const ledger = new CognitionLedger();
  if (pol.cognition > 0) ledger.grant(enemyId, 'archive', pol.cognition);

  const inv = new Inventory({
    capacity: 30,
    flags,
    vitals,
    patchVitals: (s, d) => vitals.patch(s, d),
    perceivedSan: () => vitals.vitals.san,
  });
  inv.loadout(KITS[pol.kit]);

  const forwarded: Effect[] = [];
  const engine = new EncounterEngine({
    vitals,
    inventory: inv,
    flags,
    ledger,
    patchVitals: (s, d) => vitals.patch(s, d),
    forward: (e) => forwarded.push(...e),
  });

  const ctx: SimContext = { rng, depth: 900, ambient: AMBIENT, flags };
  engine.begin(encId, ctx);

  const actions: Record<ID, number> = {};
  let peakNoise = 0;
  let panicRounds = 0;
  let enteredPanic = false;
  let phantomHits = 0;
  let outcome: RunResult['outcome'] = 'stalemate';
  const MAX_ROUNDS = 40;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const rt = engine.runtime;
    if (!rt || rt.phase === 'resolved') break;
    if (rt.phase === 'panic') {
      panicRounds++;
      enteredPanic = true;
    }
    const acts = engine.availableActionDefs();
    if (!acts.length) break;
    const a = choose(acts, rt, vitals, inv, pol, rng);
    const tgt = pickTarget(a, rt, ledger, rng);
    const res = engine.perform(a.id, tgt);
    actions[a.id] = (actions[a.id] ?? 0) + 1;
    if (res.log.some((l) => l.includes('那里什么都没有'))) phantomHits++;
    peakNoise = Math.max(peakNoise, engine.runtime?.noise ?? 0);
    if (res.resolved) {
      outcome = res.resolved;
      break;
    }
    engine.advance();
    const rt2 = engine.runtime;
    if (!rt2) break;
    peakNoise = Math.max(peakNoise, rt2.noise);
    if (rt2.outcome) {
      outcome = rt2.outcome;
      break;
    }
    if (rt2.phase === 'resolved') {
      outcome = rt2.outcome ?? 'stalemate';
      break;
    }
  }

  const rounds = engine.runtime?.round ?? MAX_ROUNDS;
  const listenerSummoned = forwarded.some((e) => e.op === 'spawn' && e.entity === 'ent.listener');
  engine.end();
  return {
    enemy: enemyId,
    policy: pol.name,
    outcome,
    rounds,
    peakNoise,
    panicRounds,
    enteredPanic,
    finalCognition: ledger.value(enemyId),
    actions,
    listenerSummoned,
    phantomHits,
  };
}

// ===========================================================================
// 汇总与输出
// ===========================================================================

function pct(n: number, d: number): string {
  return d === 0 ? '  —  ' : `${((n / d) * 100).toFixed(1)}%`.padStart(6);
}

function pad(s: string, n: number): string {
  let w = 0;
  for (const ch of s) w += /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: number): number => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
  };
  const targetRuns = arg('runs', 1300);
  const baseSeed = arg('seed', 20260915);

  // 每种敌人挑一个代表性遭遇（优先它单独出场的那个）
  const enemies = allEnemyDefs();
  const encFor = new Map<ID, ID>();
  for (const d of enemies) {
    const solo = ENCOUNTERS.find((p) => p.entities.length === 1 && p.entities[0] === d.id);
    const any = ENCOUNTERS.find((p) => p.entities.includes(d.id));
    encFor.set(d.id, solo?.id ?? any?.id ?? d.id);
  }

  const perCombo = Math.max(1, Math.ceil(targetRuns / (enemies.length * POLICIES.length)));
  const results: RunResult[] = [];
  let seed = baseSeed;
  for (const d of enemies) {
    for (const pol of POLICIES) {
      for (let i = 0; i < perCombo; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        results.push(runOne(encFor.get(d.id)!, d.id, pol, seed));
      }
    }
  }

  // ---- 内容统计 --------------------------------------------------------
  const bs = bestiaryStats();
  const is = itemStats();
  const as = actionStats();
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log('  铁肺迷城 · 遭遇系统平衡报告');
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log(`  模拟场次 ${results.length}（${enemies.length} 种敌人 × ${POLICIES.length} 策略 × ${perCombo}）  种子 ${baseSeed}`);
  console.log('');
  console.log('── 内容体量 ──────────────────────────────────────────────────────────────');
  console.log(`  敌人 ${bs.enemies} 种｜部位 ${bs.parts} 个｜认知档位 ${bs.tiers} 个｜telegraph ${bs.telegraphLines} 句｜证据 ${bs.evidenceLines} 句`);
  console.log(`  战斗动作 ${as.total} 个（潜行 ${as.byPhase.stalk ?? 0}／接触 ${as.byPhase.contact ?? 0}／失控 ${as.byPhase.panic ?? 0}）`);
  console.log(`  物品 ${is.items} 件（带 falseName ${is.withFalseName} 件）｜配方 ${is.recipes} 条｜遭遇预设 ${ENCOUNTERS.length} 个`);
  console.log('');

  // ---- 每敌人结果 ------------------------------------------------------
  console.log('── 每种敌人的结果分布 ────────────────────────────────────────────────────');
  console.log(
    `  ${pad('敌人', 26)}${pad('击杀', 8)}${pad('逃脱', 8)}${pad('死亡', 8)}${pad('僵持', 8)}${pad('均回合', 9)}${pad('峰值噪音', 10)}${pad('恐慌率', 8)}${pad('终认知', 8)}`,
  );
  for (const d of enemies) {
    const rs = results.filter((r) => r.enemy === d.id);
    const n = rs.length;
    const k = rs.filter((r) => r.outcome === 'killed').length;
    const esc = rs.filter((r) => r.outcome === 'escaped').length;
    const died = rs.filter((r) => r.outcome === 'died').length;
    const stale = rs.filter((r) => r.outcome === 'stalemate' || r.outcome === 'spared').length;
    const rounds = rs.reduce((a, r) => a + r.rounds, 0) / n;
    const noise = rs.reduce((a, r) => a + r.peakNoise, 0) / n;
    const panic = rs.filter((r) => r.enteredPanic).length;
    const cog = rs.reduce((a, r) => a + r.finalCognition, 0) / n;
    console.log(
      `  ${pad(d.tiers[3].name, 26)}${pad(pct(k, n), 8)}${pad(pct(esc, n), 8)}${pad(pct(died, n), 8)}${pad(pct(stale, n), 8)}${pad(rounds.toFixed(1), 9)}${pad(noise.toFixed(0), 10)}${pad(pct(panic, n), 8)}${pad(cog.toFixed(2), 8)}`,
    );
  }
  console.log('');

  // ---- 策略对比 --------------------------------------------------------
  console.log('── 策略原型对比 ──────────────────────────────────────────────────────────');
  console.log(`  ${pad('策略', 12)}${pad('击杀', 8)}${pad('逃脱', 8)}${pad('死亡', 8)}${pad('僵持', 8)}${pad('均回合', 9)}${pad('召来Listener', 14)}${pad('打空臆想部位', 14)}`);
  for (const pol of POLICIES) {
    const rs = results.filter((r) => r.policy === pol.name);
    const n = rs.length;
    console.log(
      `  ${pad(pol.name, 12)}${pad(pct(rs.filter((r) => r.outcome === 'killed').length, n), 8)}${pad(
        pct(rs.filter((r) => r.outcome === 'escaped').length, n),
        8,
      )}${pad(pct(rs.filter((r) => r.outcome === 'died').length, n), 8)}${pad(
        pct(rs.filter((r) => r.outcome === 'stalemate').length, n),
        8,
      )}${pad((rs.reduce((a, r) => a + r.rounds, 0) / n).toFixed(1), 9)}${pad(
        pct(rs.filter((r) => r.listenerSummoned).length, n),
        14,
      )}${pad((rs.reduce((a, r) => a + r.phantomHits, 0) / n).toFixed(2), 14)}`,
    );
  }
  console.log('');

  // ---- 动作使用率 ------------------------------------------------------
  const use: Record<ID, number> = {};
  let totalActs = 0;
  for (const r of results) {
    for (const [k, v] of Object.entries(r.actions)) {
      use[k] = (use[k] ?? 0) + v;
      totalActs += v;
    }
  }
  const rows = ALL_ACTIONS.map((a) => ({ id: a.id, label: a.label, n: use[a.id] ?? 0 })).sort((x, y) => y.n - x.n);
  console.log('── 动作使用率（总动作数 ' + totalActs + '）─────────────────────────────────');
  const dominant: string[] = [];
  const dead: string[] = [];
  const thin: string[] = [];
  for (const row of rows) {
    const share = totalActs ? row.n / totalActs : 0;
    let mark = '  ';
    if (share > 0.25) {
      mark = '!!';
      dominant.push(`${row.label}(${(share * 100).toFixed(1)}%)`);
    } else if (row.n === 0) {
      mark = 'XX';
      dead.push(row.label);
    } else if (share < 0.005) {
      mark = '??';
      thin.push(`${row.label}(${(share * 100).toFixed(2)}%)`);
    }
    const bar = '█'.repeat(Math.round(share * 300));
    console.log(`  ${mark} ${pad(row.label, 16)}${pad(row.id, 26)}${pad(String(row.n), 7)}${pad((share * 100).toFixed(2) + '%', 8)} ${bar}`);
  }
  console.log('');
  console.log('── 诊断 ──────────────────────────────────────────────────────────────────');
  console.log(`  统治性动作（>25%）：${dominant.length ? dominant.join('、') : '无 ✔'}`);
  console.log(`  死动作（0 次使用，硬性失败）：${dead.length ? dead.join('、') : '无 ✔'}`);
  console.log(`  情境动作（<0.5%，需逐个复核是否"设计上就该罕见"）：${thin.length ? thin.join('、') : '无 ✔'}`);
  // 均匀分布下每个动作 1/73 ≈ 1.37%，所以用基尼系数看整体是否被少数动作吃掉
  const shares = rows.map((r) => (totalActs ? r.n / totalActs : 0)).sort((a, b) => a - b);
  let gini = 0;
  for (let i = 0; i < shares.length; i++) gini += (2 * (i + 1) - shares.length - 1) * shares[i];
  gini /= shares.length;
  console.log(`  使用率基尼系数 ${gini.toFixed(3)}（0 = 完全均匀，1 = 全被一个动作吃掉）`);
  const maxShare = rows.length && totalActs ? rows[0].n / totalActs : 0;
  console.log(`  最高单动作占比 ${(maxShare * 100).toFixed(2)}%｜被使用过的动作 ${rows.filter((r) => r.n > 0).length}/${rows.length}`);
  const deadRate = results.filter((r) => r.outcome === 'died').length / results.length;
  console.log(`  总体死亡率 ${(deadRate * 100).toFixed(1)}%｜总体逃脱率 ${((results.filter((r) => r.outcome === 'escaped').length / results.length) * 100).toFixed(1)}%`);
  console.log('══════════════════════════════════════════════════════════════════════════');
  console.log('');
}

main();
