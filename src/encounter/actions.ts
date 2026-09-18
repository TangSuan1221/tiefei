/**
 * 战斗动作库。
 *
 * 每个动作都必须在**四种核心资源**上做出取舍，否则它不该存在：
 *   呼吸(cost) / 噪音(noise) / 光(light) / 恐惧(fear)
 *
 * 读这个文件的正确方式是看每个动作"用什么换什么"：
 *   - 屏息：用 CO2 换觉察度衰减；
 *   - 举灯：用噪音无关的暴露换命中率；
 *   - 斧劈：用 26 点噪音换 16 点伤害（等于用"别的东西会来"换"这个东西快点死"）；
 *   - 尖叫：用 60 点噪音换 20 点恐惧 —— 它是 PANIC 相里唯一真的有用的动作。
 *
 * PANIC 相的动作不是惩罚性摆设：`act.panic-scream` 是唯一能把 fear 一次拉到
 * 阈值以下的手段，所以恐慌本身是一个有解的局面，只是解法很贵。
 */

import type {
  CombatAction,
  CombatContext,
  CombatOutcome,
  Effect,
  ID,
  InventorySystem,
} from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { itemDef, maybeItem } from '../content/items/index';
import type { GameItem } from '../content/items/index';
import {
  addDecoy,
  attackPart,
  bandIndex,
  bandOf,
  behaviorOf,
  bumpAwareness,
  defOf,
  emitNoise,
  escapeChance,
  findEntity,
  liveEntities,
  livingParts,
  mkOutcome,
  setBand,
  shiftBand,
} from './combat-math';
import { rt as asRuntime } from './types';
import type { ActionDef, EncounterRuntime, Sense } from './types';

// ---------------------------------------------------------------------------
// 背包适配层
// ---------------------------------------------------------------------------

interface InvExtras {
  movementNoise(soundMask?: number): number;
  passiveMasking(): Partial<Record<Sense, number>>;
  dropRelics(): { item: ID; count: number }[];
  bestWithTag(tag: string, metric?: 'power' | 'pierce' | 'light'): GameItem | undefined;
  wear(item: ID, amount: number): boolean;
  faithSignature(): number;
  hasTag(tag: string): boolean;
  totalLoudness(): number;
}

/**
 * 动作库只依赖契约里的 `InventorySystem`。
 * 本模块自带的 `Inventory` 实现了重量/响度/掩蔽等扩展；如果宿主换了别的实现，
 * 这里用 `all()` + 物品表现场算出同样的量，动作库因此永远不会因为换实现而崩。
 */
function ix(inv: InventorySystem): InventorySystem & InvExtras {
  const maybe = inv as Partial<InvExtras> & InventorySystem;
  if (
    typeof maybe.movementNoise === 'function' &&
    typeof maybe.passiveMasking === 'function' &&
    typeof maybe.dropRelics === 'function' &&
    typeof maybe.bestWithTag === 'function'
  ) {
    return inv as InventorySystem & InvExtras;
  }
  const defs = () =>
    inv
      .all()
      .map((s) => ({ def: maybeItem(s.id), count: s.count }))
      .filter((x): x is { def: GameItem; count: number } => !!x.def);
  const loud = () => defs().reduce((a, x) => a + x.def.loudness * Math.min(x.count, 4), 0);
  return Object.assign(Object.create(inv) as InventorySystem, {
    count: (i: ID) => inv.count(i),
    add: (i: ID, n: number) => inv.add(i, n),
    remove: (i: ID, n: number) => inv.remove(i, n),
    all: () => inv.all(),
    use: (i: ID) => inv.use(i),
    craft: (r: ID) => inv.craft(r),
    totalLoudness: loud,
    movementNoise: (mask = 0) => 1 + loud() * 0.22 * (1 - clamp01(mask)),
    passiveMasking: () => {
      const out: Partial<Record<Sense, number>> = {};
      for (const { def } of defs()) {
        if (!def.masks) continue;
        for (const k of Object.keys(def.masks) as Sense[]) out[k] = Math.max(out[k] ?? 0, def.masks[k] ?? 0);
      }
      return out;
    },
    dropRelics: () => {
      const dropped: { item: ID; count: number }[] = [];
      for (const { def, count } of defs()) {
        if (def.kind === 'relic' || def.tags.includes('faith')) {
          inv.remove(def.id, count);
          dropped.push({ item: def.id, count });
        }
      }
      return dropped;
    },
    bestWithTag: (tag: string, metric: 'power' | 'pierce' | 'light' = 'power') => {
      let best: GameItem | undefined;
      for (const { def } of defs()) {
        if (!def.tags.includes(tag)) continue;
        if (!best || (def[metric] ?? 0) > (best[metric] ?? 0)) best = def;
      }
      return best;
    },
    wear: () => false,
    faithSignature: () =>
      clamp01(
        defs().reduce(
          (a, x) =>
            a +
            (x.def.tags.includes('faith') ? 0.18 : x.def.tags.includes('ritual') ? 0.07 : x.def.kind === 'relic' ? 0.04 : 0) *
              Math.min(x.count, 3),
          0,
        ),
      ),
    hasTag: (tag: string) => defs().some((x) => x.def.tags.includes(tag)),
  }) as InventorySystem & InvExtras;
}

// ---------------------------------------------------------------------------
// 局部工具
// ---------------------------------------------------------------------------

function raiseMask(r: EncounterRuntime, ch: Sense, v: number): void {
  r.masking[ch] = Math.max(r.masking[ch], clamp01(v));
}

function vital(stat: 'fear' | 'san' | 'co2' | 'trauma' | 'oxygen' | 'coreTemp' | 'infection' | 'fatigue', delta: number): Effect {
  return { op: 'vital', stat, delta };
}

/** 消耗一件道具的耐久或数量。返回是否真的消耗掉了 */
function spend(ctx: CombatContext, id: ID, consume: boolean): boolean {
  const def = maybeItem(id);
  if (!def) return false;
  if (consume || def.kind === 'consumable') return ctx.inventory.remove(id, 1);
  const x = ix(ctx.inventory);
  return x.wear(id, 1);
}

function noHit(log: string[], noise = 0): CombatOutcome {
  return mkOutcome({ log, noise });
}

function def(a: ActionDef): ActionDef {
  return a;
}

// ===========================================================================
// STALK —— 潜行相
// ===========================================================================

const STALK_ACTIONS: readonly ActionDef[] = [
  def({
    id: 'act.hold-breath',
    label: '屏息',
    shortDesc: '停止呼吸。氧气不再流失，二氧化碳开始堆。',
    cost: 1,
    noise: 0,
    phases: ['stalk', 'contact', 'any'],
    targeting: 'none',
    tags: ['breath', 'stealth', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.holdingBreath = true;
      r.heldBreathRounds += 1;
      raiseMask(r, 'sound', 0.7);
      const log = ['你把气停在吸满的位置。心跳变成了房间里最大的声音。'];
      const effects: Effect[] = [vital('co2', 4)];
      if (r.heldBreathRounds >= 5) {
        // 屏息不能无限叠：CO2 顶到头会强制大喘气，那一下比走路响二十倍
        r.holdingBreath = false;
        r.heldBreathRounds = 0;
        const n = emitNoise(r, 25, '大喘气');
        log.push('你撑不住了。那一口气吸得整条走廊都听见。');
        effects.push(vital('co2', -30), vital('fear', 9));
        return mkOutcome({ log, effects, noise: n });
      }
      return mkOutcome({ log, effects, noise: 0 });
    },
  }),
  def({
    id: 'act.freeze',
    label: '僵止',
    shortDesc: '完全不动。它会更快地丢掉你，但你也什么都不会知道。',
    cost: 1,
    noise: 0,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['stealth', 'silent', 'defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.movement = 0;
      raiseMask(r, 'vibration', 0.85);
      raiseMask(r, 'sound', 0.5);
      for (const e of liveEntities(r)) e.awareness = clamp01(e.awareness - 0.06);
      return mkOutcome({
        log: ['你停在原地，连眼睛都不转。时间以你的脉搏计数。'],
        effects: [vital('fear', 4)],
        noise: 0,
      });
    },
  }),
  def({
    id: 'act.creep',
    label: '缓移',
    shortDesc: '一步一停地拉开距离。慢，但几乎不响。',
    cost: 3,
    noise: 2,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['stealth', 'escape', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      r.movement = 0.35;
      const n = emitNoise(r, 2 * x.movementNoise(r.masking.sound), '缓移');
      const target = findEntity(r, ctx.targetEntity);
      if (target) shiftBand(r, target.id, -1);
      r.escapeProgress = clamp01(r.escapeProgress + 0.18);
      return mkOutcome({
        log: ['你把重量放到脚外侧，一次挪半步。钢板只回了一声很轻的应答。'],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.close-in',
    label: '逼近',
    shortDesc: '主动缩短距离。你必须这么做才能打到它 —— 也等于放弃了不被发现。',
    cost: 4,
    noise: 9,
    phases: ['stalk'],
    targeting: 'entity',
    tags: ['approach', 'melee'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你往黑里走了两步，然后停下来。']);
      const x = ix(ctx.inventory);
      r.movement = 0.8;
      const n = emitNoise(r, 9 * x.movementNoise(r.masking.sound), '逼近');
      const band = shiftBand(r, e.id, 1);
      bumpAwareness(r, e, 0.12);
      r.escapeProgress = Math.max(0, r.escapeProgress - 0.3);
      return mkOutcome({
        log: [
          band === 'contact'
            ? '你已经能碰到它了。这是你自己选的。'
            : `你往它那边走。现在是【${bandLabel(band)}】。`,
        ],
        effects: [vital('fear', 6)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.back-away',
    label: '后撤',
    shortDesc: '快速拉开两档距离，代价是脚步声。',
    cost: 5,
    noise: 7,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['escape'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      r.movement = 1;
      const n = emitNoise(r, 7 * x.movementNoise(r.masking.sound), '后撤');
      for (const e of liveEntities(r)) shiftBand(r, e.id, -2);
      r.escapeProgress = clamp01(r.escapeProgress + 0.3);
      r.restrained = false;
      return mkOutcome({ log: ['你往后退，退到背贴上冷的东西为止。'], noise: n });
    },
  }),
  def({
    id: 'act.listen-hull',
    label: '贴壁聆听',
    shortDesc: '把耳朵（或听诊器）贴上舱壁，读它的位置与意图。',
    cost: 2,
    noise: 0,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['info', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      const bonus = x.count('it.stethoscope') > 0 ? 1.6 : 1;
      const log: string[] = [];
      for (const e of liveEntities(r)) {
        const d = defOf(e);
        const band = bandOf(r, e.id);
        if (band === 'unknown') setBand(r, e.id, 'far');
        const gain = r.ledger.observe(e.defId, 'listen', bonus);
        if (gain.tierUp) log.push(gain.note);
        r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
        log.push(
          d.neverVisible
            ? `${r.ledger.view(e.defId).name}：${rngPick(r, d.evidence ?? ['——'])}`
            : `${r.ledger.view(e.defId).name} 在【${bandLabel(bandOf(r, e.id))}】，${intentHint(r, e)}`,
        );
      }
      if (!log.length) log.push('舱壁里只有水在走。');
      return mkOutcome({ log, noise: 0 });
    },
  }),
  def({
    id: 'act.read-spoor',
    label: '判读痕迹',
    shortDesc: '看它留下的东西而不是看它。黑暗中依然有效。',
    cost: 3,
    noise: 1,
    phases: ['stalk'],
    targeting: 'entity',
    tags: ['info', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有新的痕迹。']);
      const g = r.ledger.observe(e.defId, 'listen', 1.4);
      r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
      const v = r.ledger.view(e.defId);
      const log = [`痕迹：${v.description}`];
      if (g.tierUp) log.push(g.note);
      else log.push(g.note);
      return mkOutcome({ log, noise: emitNoise(r, 1, '蹲下查看') });
    },
  }),
  def({
    id: 'act.throw-pebble',
    label: '抛石子',
    shortDesc: '在别处造一个假声源。对靠声音的东西极有效，对别的一文不值。',
    cost: 2,
    noise: 3,
    item: 'it.pebble-pouch',
    phases: ['stalk', 'contact'],
    targeting: 'direction',
    tags: ['thrown', 'sound', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.pebble-pouch', false);
      addDecoy(r, { id: `decoy.pebble.${r.round}`, channel: 'sound', strength: 14, ttl: 2, pull: 2, label: '落在远处的石子' });
      const n = emitNoise(r, 3, '抛掷动作本身');
      return mkOutcome({
        log: ['石子在两个舱段外的钢板上弹了三下。第三下最响。'],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.throw-bolt',
    label: '掷螺栓',
    shortDesc: '比石子重得多的假声源，骗得更狠，但你自己也更暴露。',
    cost: 3,
    noise: 6,
    item: 'it.hull-bolt',
    phases: ['stalk', 'contact'],
    targeting: 'direction',
    tags: ['thrown', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.hull-bolt', true);
      addDecoy(r, { id: `decoy.bolt.${r.round}`, channel: 'sound', strength: 26, ttl: 3, pull: 3, label: '砸在远处的螺栓' });
      return mkOutcome({ log: ['螺栓砸进黑里，很久才停。'], noise: emitNoise(r, 6, '掷螺栓') });
    },
  }),
  def({
    id: 'act.clicker-decoy',
    label: '放置声饵',
    shortDesc: '一个会持续自己响的假声源。你可以离开，它继续替你说话。',
    cost: 4,
    noise: 8,
    item: 'it.clicker-decoy',
    phases: ['stalk'],
    targeting: 'direction',
    tags: ['thrown', 'sound', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.clicker-decoy', false);
      addDecoy(r, { id: `decoy.clicker.${r.round}`, channel: 'sound', strength: 20, ttl: 6, pull: 3, label: '还在响的声饵' });
      // 两个以上同时存在的假声源才骗得动会三角测量的东西
      addDecoy(r, { id: `decoy.clicker.echo.${r.round}`, channel: 'sound', strength: 11, ttl: 6, pull: 2, label: '声饵的回声' });
      return mkOutcome({
        log: ['你把它塞进管道拐角，按下开关。它每四秒响一次，比你规律。'],
        noise: emitNoise(r, 8, '安放声饵'),
      });
    },
  }),
  def({
    id: 'act.drop-bait',
    label: '放下诱饵',
    shortDesc: '一块还渗着的肉。靠热找人的东西会先去处理它。',
    cost: 3,
    noise: 2,
    item: 'it.bait-flesh',
    phases: ['stalk', 'contact'],
    targeting: 'direction',
    tags: ['thrown', 'stealth', 'sacrifice'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const strong = ctx.inventory.count('it.strong-bait') > 0;
      spend(ctx, strong ? 'it.strong-bait' : 'it.bait-flesh', true);
      addDecoy(r, {
        id: `decoy.bait.${r.round}`,
        channel: 'heat',
        strength: strong ? 30 : 18,
        ttl: strong ? 5 : 3,
        pull: 3,
        label: strong ? '浓味诱饵' : '诱饵肉',
      });
      return mkOutcome({ log: ['你把它放在两米外的甲板上。它还热。'], noise: emitNoise(r, 2, '放下诱饵') });
    },
  }),
  def({
    id: 'act.douse-lamp',
    label: '熄灯',
    shortDesc: '把光关掉。命中率会掉，但靠光找人的东西会失去线索。',
    cost: 1,
    noise: 1,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['light', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const before = r.light;
      r.light = 0.02;
      raiseMask(r, 'light', 0.95);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('light')) e.awareness = clamp01(e.awareness - 0.22);
      }
      return mkOutcome({
        log: [
          before > 0.2
            ? '你按下开关。黑不是慢慢来的，是一次到位的。'
            : '你把已经很暗的东西彻底关掉。',
        ],
        effects: [vital('fear', 8), vital('san', -2)],
        noise: emitNoise(r, 1, '开关'),
      });
    },
  }),
  def({
    id: 'act.raise-lamp',
    label: '举灯',
    shortDesc: '把光调到最大。命中率显著提升，同时把自己变成一个坐标。',
    cost: 1,
    noise: 1,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['light', 'info'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      const lamp = x.bestWithTag('light', 'light');
      if (!lamp) return noHit(['你手上没有能发光的东西。你举起了空手。']);
      r.light = Math.max(r.light, lamp.light ?? 0.4);
      r.masking.light = 0;
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('light')) bumpAwareness(r, e, 0.2);
      }
      return mkOutcome({
        log: [`${lamp.name}举到头顶。你看清了三米，也照亮了自己。`],
        effects: [vital('san', 3), vital('fear', -5)],
        noise: emitNoise(r, 1, '举灯'),
      });
    },
  }),
  def({
    id: 'act.cut-power',
    label: '拉闸',
    shortDesc: '切断这一段的照明。整片区域变黑，包括它那边。',
    cost: 4,
    noise: 9,
    phases: ['stalk'],
    targeting: 'none',
    requires: { op: 'has-item', item: 'it.breaker-key' },
    tags: ['light', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.light = 0;
      raiseMask(r, 'light', 1);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('light')) e.awareness = clamp01(e.awareness - 0.35);
      }
      return mkOutcome({
        log: ['闸刀落下的声音很大，然后是一片安静的黑。这两者之间有半秒的间隔。'],
        effects: [vital('fear', 12), vital('san', -4)],
        noise: emitNoise(r, 9, '拉闸'),
      });
    },
  }),
  def({
    id: 'act.corpse-grease',
    label: '涂尸油',
    shortDesc: '把温度和味道往后压一层。对靠热找人的东西是唯一的软解。',
    cost: 5,
    noise: 1,
    item: 'it.corpse-grease',
    consumesItem: true,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['mask', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.corpse-grease', true);
      raiseMask(r, 'heat', 0.55);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('heat')) e.awareness = clamp01(e.awareness - 0.18);
      }
      return mkOutcome({
        log: ['灰白的，凉的，抹开以后皮肤不再是你的皮肤。'],
        effects: [vital('san', -4), vital('coreTemp', -0.4)],
        noise: emitNoise(r, 1, '涂抹'),
      });
    },
  }),
  def({
    id: 'act.asbestos-shroud',
    label: '裹石棉布',
    shortDesc: '把热挡在里面。它有效，而且不脏你的手。',
    cost: 4,
    noise: 2,
    item: 'it.asbestos-cloth',
    phases: ['stalk'],
    targeting: 'none',
    tags: ['mask', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      raiseMask(r, 'heat', 0.62);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('heat')) e.awareness = clamp01(e.awareness - 0.2);
      }
      return mkOutcome({
        log: ['纤维在手上散开，呼吸里多了一点粉。你把自己包成一个没有温度的形状。'],
        effects: [vital('infection', 1)],
        noise: emitNoise(r, 2, '整理布料'),
      });
    },
  }),
  def({
    id: 'act.chill-soak',
    label: '沉入积水',
    shortDesc: '让海水把体温带走。最彻底的热掩蔽，代价是体温和 CO2。',
    cost: 6,
    noise: 3,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['mask', 'stealth', 'sacrifice'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      raiseMask(r, 'heat', 0.85);
      raiseMask(r, 'vibration', 0.3);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('heat')) e.awareness = clamp01(e.awareness - 0.3);
      }
      return mkOutcome({
        log: ['水到胸口的时候你不再觉得冷，那不是好消息。'],
        effects: [vital('coreTemp', -1.6), vital('co2', 6), vital('fear', 5)],
        noise: emitNoise(r, 3, '入水'),
      });
    },
  }),
  def({
    id: 'act.silence-wrap',
    label: '缠消音包裹',
    shortDesc: '把背包里的金属全缠一遍。从此走路不带伴奏。',
    cost: 6,
    noise: 2,
    item: 'it.silence-wrap',
    phases: ['stalk'],
    targeting: 'none',
    tags: ['mask', 'stealth', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.silence-wrap', false);
      raiseMask(r, 'sound', 0.6);
      raiseMask(r, 'vibration', 0.25);
      return mkOutcome({
        log: ['油布一圈圈绕上去。最后一件金属闭嘴的时候，你才发现刚才一直有声音。'],
        noise: emitNoise(r, 2, '缠布'),
      });
    },
  }),
  def({
    id: 'act.soft-soles',
    label: '套软底',
    shortDesc: '钢板上的每一步从"当"变成"嗒"。压振动，兼压声音。',
    cost: 5,
    noise: 1,
    item: 'it.soft-soles',
    phases: ['stalk'],
    targeting: 'none',
    tags: ['mask', 'stealth', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.soft-soles', false);
      raiseMask(r, 'vibration', 0.6);
      raiseMask(r, 'sound', 0.3);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('vibration')) e.awareness = clamp01(e.awareness - 0.16);
      }
      return mkOutcome({ log: ['橡胶压在钢上，只剩一点闷响。'], noise: emitNoise(r, 1, '绑鞋套') });
    },
  }),
  def({
    id: 'act.vent-steam',
    label: '开阀放气',
    shortDesc: '用一片持续的白噪音盖住你自己。但它也盖住了你的耳朵。',
    cost: 4,
    noise: 16,
    phases: ['stalk'],
    targeting: 'none',
    requires: { op: 'has-item', item: 'it.valve-handwheel' },
    tags: ['mask', 'sound', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      raiseMask(r, 'sound', 0.75);
      // 底噪同时抬高，所以后面几回合玩家自己也读不到 telegraph
      r.ambient = { ...r.ambient, noiseFloor: r.ambient.noiseFloor + 6 };
      return mkOutcome({
        log: ['蒸汽从接头里出来，声音是一整片的。你听不见它了，它也听不见你。'],
        effects: [vital('coreTemp', 0.5), vital('fear', 4)],
        noise: emitNoise(r, 16, '放气'),
      });
    },
  }),
  def({
    id: 'act.mark-door',
    label: '门上刻痕',
    shortDesc: '给退路做个记号。逃脱判定会好很多 —— 前提是你有时间刻。',
    cost: 3,
    noise: 4,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['info', 'escape'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.markedExit = true;
      return mkOutcome({
        log: ['你在门把手上方刻了三道。下次看到它你就知道这道门还是这道门。'],
        effects: [{ op: 'flag', key: 'did.marked-door', value: true }, vital('san', 2)],
        noise: emitNoise(r, 4, '刻划'),
      });
    },
  }),
  def({
    id: 'act.drop-relics',
    label: '卸下圣物',
    shortDesc: '把身上一切"虔诚"的东西丢在地上。靠信仰找人的东西会失去你。',
    cost: 3,
    noise: 6,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['stealth', 'sacrifice', 'ritual'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      const dropped = x.dropRelics();
      if (!dropped.length) return noHit(['你身上已经没有它要找的东西了。']);
      raiseMask(r, 'faith', 0.9);
      r.faithSignature = clamp01(r.faithSignature * 0.15);
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('faith')) e.awareness = clamp01(e.awareness - 0.32);
      }
      return mkOutcome({
        log: [
          `你把 ${dropped.length} 件东西放在地上，一件一件，没有丢。`,
          '它们在那边，你在这边。它现在得重新决定要跟哪一个。',
        ],
        effects: [vital('san', -6), { op: 'flag', key: 'did.dropped-relics', value: true }],
        noise: emitNoise(r, 6, '放下金属'),
      });
    },
  }),
  def({
    id: 'act.mimic-hymn',
    label: '学唱圣咏',
    shortDesc: '跟着它一起唱。靠信仰找人的东西会把你算成自己人。',
    cost: 5,
    noise: 18,
    phases: ['stalk', 'contact'],
    targeting: 'entity',
    tags: ['social', 'ritual', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const log: string[] = ['你跟上了那个调。第四段的词你不该记得，但你记得。'];
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('faith')) {
          e.awareness = clamp01(e.awareness - 0.4);
          e.intent = null;
          log.push(`${r.ledger.view(e.defId).name}把你算成了同一个声部。`);
        } else {
          bumpAwareness(r, e, 0.15);
        }
      }
      return mkOutcome({
        log,
        effects: [{ op: 'stigma', stigma: 'listening', delta: 1 }, vital('san', -5), vital('fear', -8)],
        noise: emitNoise(r, 18, '唱'),
      });
    },
  }),
  def({
    id: 'act.slip-past',
    label: '贴身绕过',
    shortDesc: '从它身边过去。成功就直接脱离，失败就是接触相。',
    cost: 6,
    noise: 5,
    phases: ['stalk'],
    targeting: 'entity',
    bands: ['near', 'adjacent'],
    tags: ['escape', 'stealth'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有需要绕过的东西。']);
      const x = ix(ctx.inventory);
      const p = clamp(
        0.62 - e.awareness * 0.5 - Math.min(x.totalLoudness(), 5) * 0.06 + (1 - r.light) * 0.12 + r.masking.sound * 0.2,
        0.05,
        0.9,
      );
      const n = emitNoise(r, 5 * x.movementNoise(r.masking.sound), '贴身通过');
      if (r.rng.bool(p)) {
        return mkOutcome({
          log: ['你从它和舱壁之间过去了。中间那段距离不到一个肩宽。'],
          noise: n,
          resolved: 'escaped',
        });
      }
      bumpAwareness(r, e, 0.45);
      setBand(r, e.id, 'adjacent');
      return mkOutcome({
        log: ['你的背包擦到了什么。它转过来了。'],
        effects: [vital('fear', 16)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.sonar-probe',
    label: '战术声呐',
    shortDesc: '一次脉冲换一张完整的部位图与意图。噪音是全作最贵的信息之一。',
    cost: 5,
    noise: 26,
    item: 'it.hand-sonar',
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['info', 'loud', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const directional = ctx.inventory.count('it.directional-sonar') > 0;
      const id = directional ? 'it.directional-sonar' : 'it.hand-sonar';
      spend(ctx, id, false);
      const log: string[] = [directional ? '波导管把脉冲压成一束。' : '脉冲往四面八方去，一视同仁。'];
      for (const e of liveEntities(r)) {
        const g = r.ledger.observe(e.defId, 'observe', 1.5);
        r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
        if (g.tierUp) log.push(g.note);
        setBand(r, e.id, bandOf(r, e.id) === 'unknown' ? 'far' : bandOf(r, e.id));
        log.push(
          `${r.ledger.view(e.defId).name}：${bandLabel(bandOf(r, e.id))}｜${intentHint(r, e)}｜可辨部位 ${
            r.ledger.view(e.defId).chart.filter((c) => !c.phantom).length
          } 处`,
        );
        // 声呐寄生体会把这次脉冲吃下去，所以对它来说这是最糟的动作
        if (defOf(e).tags.includes('noise-feeder')) {
          e.hp = Math.min(defOf(e).hpMax, e.hp + 12);
          log.push('其中一个鼓包变大了。它刚刚吃了你的脉冲。');
        }
      }
      return mkOutcome({ log, noise: emitNoise(r, directional ? 11 : 26, '声呐') });
    },
  }),
];

// ===========================================================================
// CONTACT —— 接触相
// ===========================================================================

/** 近战动作的共同构造：伤害来自道具，命中来自光与认知 */
function melee(
  id: ID,
  label: string,
  shortDesc: string,
  item: ID,
  o: { cost: number; base: number; precision?: number; pierce?: number; tags: ActionDef['tags']; lightIndependent?: boolean },
): ActionDef {
  return def({
    id,
    label,
    shortDesc,
    cost: o.cost,
    noise: maybeItem(item)?.noise ?? 8,
    item,
    phases: ['contact'],
    targeting: 'part',
    bands: ['adjacent', 'contact'],
    tags: o.tags,
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你挥向黑暗。黑暗没有回应。'], emitNoise(r, 6, '挥空'));
      const w = itemDef(item);
      const res = attackPart(r, e, ctx.targetPart, {
        base: o.base,
        power: w.power ?? 6,
        pierce: (o.pierce ?? 0) + (w.pierce ?? 0),
        precision: o.precision,
        lightIndependent: o.lightIndependent,
      });
      spend(ctx, item, false);
      const n = emitNoise(r, w.noise ?? 8, `${w.name}`);
      return mkOutcome({
        log: res.log,
        damage: res.hit ? [{ entity: e.id, part: ctx.targetPart, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: n,
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  });
}

const CONTACT_ACTIONS: readonly ActionDef[] = [
  melee('act.pry-strike', '撬棍挥击', '钝器，稳定，很响。船上到处都有撬棍。', 'it.pry-bar', {
    cost: 4,
    base: 0.62,
    tags: ['melee', 'loud'],
  }),
  melee('act.wrench-swing', '扳手横扫', '管钳横扫，适合砸装甲与关节。', 'it.pipe-wrench', {
    cost: 4,
    base: 0.58,
    pierce: 1,
    tags: ['melee', 'loud'],
  }),
  melee('act.axe-chop', '斧劈', '全船最高的伤害，和全船最高的噪音。', 'it.fire-axe', {
    cost: 6,
    base: 0.54,
    tags: ['melee', 'loud'],
  }),
  melee('act.pipe-bludgeon', '铁管闷击', '铁管。响，但它不会卡在骨头里。', 'it.iron-pipe', {
    cost: 4,
    base: 0.6,
    tags: ['melee', 'loud'],
  }),
  melee('act.muffled-bludgeon', '消音闷击', '缠布的铁管。伤害略低，噪音只有四分之一。', 'it.muffled-pipe', {
    cost: 4,
    base: 0.6,
    tags: ['melee', 'silent'],
  }),
  melee('act.knife-thrust', '刀刺', '短、准、几乎无声。对装甲无能为力。', 'it.dive-knife', {
    cost: 3,
    base: 0.7,
    precision: 0.2,
    tags: ['melee', 'silent', 'precision'],
    lightIndependent: true,
  }),
  melee('act.honed-thrust', '精刃穿刺', '重新开过刃的刀。能切进腱里而不带走别的。', 'it.honed-knife', {
    cost: 3,
    base: 0.74,
    precision: 0.35,
    tags: ['melee', 'silent', 'precision'],
    lightIndependent: true,
  }),
  melee('act.mallet-crush', '铅锤砸击', '铅头不打火花，也不反弹。适合封闭空间。', 'it.mallet', {
    cost: 5,
    base: 0.6,
    tags: ['melee', 'loud'],
  }),
  melee('act.whip-lash', '缆索抽击', '散股钢索。抽中就带走一层。', 'it.cable-whip', {
    cost: 4,
    base: 0.52,
    pierce: 1,
    tags: ['melee'],
  }),
  melee('act.ritual-cut', '礼刀划割', '握法是反的，所以它更适合划自己。但它也能划别人。', 'it.ritual-knife', {
    cost: 3,
    base: 0.68,
    precision: 0.25,
    tags: ['melee', 'silent', 'ritual'],
    lightIndependent: true,
  }),
  def({
    id: 'act.speargun-shot',
    label: '鱼枪射击',
    shortDesc: '远距离、低噪音、高穿透。箭要捡回来。',
    cost: 4,
    noise: 7,
    item: 'it.speargun',
    phases: ['contact', 'stalk'],
    targeting: 'part',
    bands: ['far', 'near', 'adjacent'],
    tags: ['ranged', 'silent', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你没有可以瞄的东西。'], 0);
      const heavy = ctx.inventory.count('it.heavy-bolt') > 0;
      const ammo = heavy ? 'it.heavy-bolt' : 'it.spear-bolt';
      if (ctx.inventory.count(ammo) <= 0) return noHit(['枪是空的。你听到扳机空响的那一声。'], emitNoise(r, 4, '空枪'));
      ctx.inventory.remove(ammo, 1);
      const res = attackPart(r, e, ctx.targetPart, {
        base: 0.6,
        power: 13,
        pierce: heavy ? 9 : 5,
        precision: 0.15,
      });
      spend(ctx, 'it.speargun', false);
      return mkOutcome({
        log: [heavy ? '重弩箭飞得不直，但它进去了。' : '橡筋放开的声音比命中还响。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: ctx.targetPart, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 7, '鱼枪'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.harpoon-pin',
    label: '鱼叉钉住',
    shortDesc: '不求伤害，求它别动。钉住的东西跑不掉也逃不走。',
    cost: 5,
    noise: 12,
    item: 'it.harpoon',
    phases: ['contact'],
    targeting: 'part',
    bands: ['near', 'adjacent', 'contact'],
    tags: ['melee', 'defense', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你把叉扎进了水里。'], emitNoise(r, 8, '扎空'));
      const tethered = ctx.inventory.count('it.tethered-harpoon') > 0;
      const res = attackPart(r, e, ctx.targetPart, { base: 0.66, power: 11, pierce: tethered ? 5 : 4 });
      spend(ctx, tethered ? 'it.tethered-harpoon' : 'it.harpoon', false);
      const log = [...res.log];
      if (res.hit) {
        const b = behaviorOf(r, e);
        b.approachMul *= 0.25;
        b.forbidden.add('flee');
        log.push('叉在它身上，柄在你手上。它现在只能在这个半径里活动。');
        setBand(r, e.id, 'adjacent');
      }
      return mkOutcome({
        log,
        damage: res.hit ? [{ entity: e.id, part: ctx.targetPart, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 12, '鱼叉'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.revolver-shot',
    label: '左轮射击',
    shortDesc: '24 点伤害，44 点噪音。它解决眼前的问题，制造这一层所有的问题。',
    cost: 3,
    noise: 44,
    item: 'it.service-revolver',
    phases: ['contact', 'panic'],
    targeting: 'part',
    bands: ['near', 'adjacent', 'contact'],
    tags: ['ranged', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (ctx.inventory.count('it.revolver-round') <= 0) {
        return noHit(['击锤落下，什么都没发生。你数错了。'], emitNoise(r, 5, '空击'));
      }
      ctx.inventory.remove('it.revolver-round', 1);
      if (!e) return mkOutcome({ log: ['你朝黑里开了一枪。'], noise: emitNoise(r, 44, '枪声') });
      const res = attackPart(r, e, ctx.targetPart, { base: 0.58, power: 24, pierce: 6 });
      const n = emitNoise(r, 44, '枪声');
      // 枪声一定会引来别的东西，这是设计而不是惩罚
      r.listenerPressure += 0.25;
      return mkOutcome({
        log: [...res.log, '枪声在钢舱里没有衰减的余地。整条船都记住了你的位置。'],
        damage: res.hit ? [{ entity: e.id, part: ctx.targetPart, amount: res.damage }] : undefined,
        effects: [...res.effects, vital('fear', -6)],
        noise: n,
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.flare-burn',
    label: '照明弹灼烧',
    shortDesc: '把整片区域照成白的。对群体与畏火的东西是最优解。',
    cost: 4,
    noise: 30,
    item: 'it.magnesium-flare',
    consumesItem: true,
    phases: ['contact', 'stalk'],
    targeting: 'entity',
    tags: ['light', 'loud', 'ranged'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.magnesium-flare', true);
      r.light = 1;
      r.masking.light = 0;
      const log = ['引信烧完的瞬间，舱里没有影子。'];
      const damage: { entity: ID; part?: ID; amount: number }[] = [];
      for (const e of liveEntities(r)) {
        const d = defOf(e);
        const swarm = d.tags.includes('swarm');
        const amount = Math.round((swarm ? 22 : 9) * r.rng.float(0.8, 1.2));
        e.hp = Math.max(0, e.hp - amount);
        damage.push({ entity: e.id, amount });
        if (d.senses.includes('light')) {
          bumpAwareness(r, e, -0.3);
          behaviorOf(r, e).blind.add('light');
          log.push(`${r.ledger.view(e.defId).name}的光感器被烧穿了一段时间。`);
        }
        if (swarm) log.push('水面烧开了一圈。中间那一团第一次露出来。');
      }
      return mkOutcome({
        log,
        damage,
        effects: [vital('san', 4), vital('coreTemp', 0.4)],
        noise: emitNoise(r, 30, '照明弹'),
      });
    },
  }),
  def({
    id: 'act.blind-lantern',
    label: '强光直射',
    shortDesc: '把灯直接怼向它的光感器。不掉血，但它这一回合什么都做不了。',
    cost: 2,
    noise: 2,
    phases: ['contact'],
    targeting: 'entity',
    bands: ['near', 'adjacent', 'contact'],
    tags: ['light', 'defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      const lamp = x.bestWithTag('light', 'light');
      const e = findEntity(r, ctx.targetEntity);
      if (!lamp || !e) return noHit(['你手上没有足够亮的东西。']);
      r.light = Math.max(r.light, lamp.light ?? 0.5);
      if (!defOf(e).senses.includes('light') || behaviorOf(r, e).blind.has('light')) {
        bumpAwareness(r, e, 0.12);
        return mkOutcome({
          log: ['光落在它身上，什么都没发生。它不是靠眼睛活的。'],
          noise: emitNoise(r, 2, '举灯'),
        });
      }
      e.intent = null;
      bumpAwareness(r, e, -0.2);
      spend(ctx, lamp.id, false);
      return mkOutcome({
        log: ['光直接进去。它的动作停在一半，像被按了暂停。'],
        noise: emitNoise(r, 2, '举灯'),
      });
    },
  }),
  def({
    id: 'act.acid-pour',
    label: '泼酸',
    shortDesc: '不打伤害，打装甲。十二点穿透对铸铁与甲壳都有效。',
    cost: 3,
    noise: 6,
    item: 'it.acid-flask',
    consumesItem: true,
    phases: ['contact'],
    targeting: 'part',
    bands: ['adjacent', 'contact'],
    tags: ['ranged', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      spend(ctx, 'it.acid-flask', true);
      if (!e) return noHit(['酸泼在甲板上，冒了一阵白烟。'], emitNoise(r, 6, '泼酸'));
      const armored = livingParts(r, e).filter((p) => p.armor >= 4);
      const targetId = ctx.targetPart ?? (armored.length ? armored[0].id : undefined);
      const res = attackPart(r, e, targetId, { base: 0.78, power: 5, pierce: 12, lightIndependent: true });
      return mkOutcome({
        log: ['白烟从它表面升起来，很细，很直。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: targetId, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 6, '泼酸'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.oil-ignite',
    label: '泼油点燃',
    shortDesc: '持续伤害 + 全场照亮。对群体最有效，对你自己的肺最不友好。',
    cost: 6,
    noise: 22,
    item: 'it.tallow',
    consumesItem: true,
    phases: ['contact'],
    targeting: 'entity',
    requires: { op: 'has-item', item: 'it.storm-match' },
    tags: ['light', 'loud', 'sacrifice'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      spend(ctx, 'it.tallow', true);
      spend(ctx, 'it.storm-match', true);
      r.light = Math.max(r.light, 0.85);
      const damage: { entity: ID; part?: ID; amount: number }[] = [];
      const log = ['油铺开，火跟着铺开。火在水面上比在地面上跑得快。'];
      for (const e of liveEntities(r)) {
        const swarm = defOf(e).tags.includes('swarm');
        const amount = Math.round((swarm ? 26 : 12) * r.rng.float(0.85, 1.2));
        e.hp = Math.max(0, e.hp - amount);
        damage.push({ entity: e.id, amount });
        const b = behaviorOf(r, e);
        b.approachMul *= 0.7;
        if (swarm) log.push('群被烧散了。剩下的绕着火走。');
      }
      return mkOutcome({
        log,
        damage,
        effects: [vital('co2', 10), vital('coreTemp', 0.8), vital('fear', -4)],
        noise: emitNoise(r, 22, '燃烧'),
      });
    },
  }),
  def({
    id: 'act.shove',
    label: '推挡',
    shortDesc: '不求伤害，只求它退一步。能解除被抓。',
    cost: 2,
    noise: 5,
    phases: ['contact', 'panic'],
    targeting: 'entity',
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你推了一把空气。']);
      const ok = r.rng.bool(clamp(0.72 - defOf(e).evasion * 0.5, 0.2, 0.92));
      const log: string[] = [];
      if (ok) {
        shiftBand(r, e.id, -1);
        if (r.restrainedBy === e.id) {
          r.restrained = false;
          r.restrainedBy = null;
          log.push('它的手松开了。');
        }
        log.push('你把整个上身撞进去。它退了半步 —— 半步就是一回合。');
      } else {
        log.push('你撞上去，它没有动。你退了半步。');
      }
      return mkOutcome({ log, noise: emitNoise(r, 5, '推挡'), effects: [vital('fatigue', 2)] });
    },
  }),
  def({
    id: 'act.hold-line',
    label: '格挡待机',
    shortDesc: '把武器横在身前。这一回合减伤，并且恐惧会掉一点。',
    cost: 3,
    noise: 2,
    phases: ['contact'],
    targeting: 'none',
    tags: ['defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.flags.set('sys.encounter.guard', 1);
      return mkOutcome({
        log: ['你把手上的东西横过来，两只手都握上去。呼吸从胸口降到腹部。'],
        effects: [vital('fear', -7), vital('co2', -3)],
        noise: emitNoise(r, 2, '调整站位'),
      });
    },
  }),
  def({
    id: 'act.break-grapple',
    label: '挣脱',
    shortDesc: '被抓住以后唯一还能做的事。成功率取决于它的抓握部位还在不在。',
    cost: 4,
    noise: 12,
    phases: ['contact', 'panic'],
    targeting: 'none',
    needsRestrained: true,
    tags: ['defense', 'escape'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = r.restrainedBy ? findEntity(r, r.restrainedBy) : undefined;
      if (!e || !r.restrained) return noHit(['没有东西抓着你。']);
      const b = behaviorOf(r, e);
      const graspGone = b.forbidden.has('grab');
      const p = clamp(0.45 + (graspGone ? 0.35 : 0) - defOf(e).power * 0.012, 0.12, 0.92);
      const n = emitNoise(r, 12, '挣扎');
      if (r.rng.bool(p)) {
        r.restrained = false;
        r.restrainedBy = null;
        shiftBand(r, e.id, -1);
        return mkOutcome({ log: ['你把手臂从里面拧出来。皮留下了一点。'], effects: [vital('trauma', 3)], noise: n });
      }
      return mkOutcome({
        log: ['它收得更紧了。你听到自己肩关节的声音。'],
        effects: [vital('trauma', 6), vital('fear', 12)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.smother-vocal',
    label: '捂住发声器',
    shortDesc: '不杀它，只让它闭嘴一回合。对会呼叫同类的东西是最划算的动作。',
    cost: 3,
    noise: 4,
    phases: ['contact'],
    targeting: 'entity',
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'silent', 'defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你的手合在空气上。']);
      const vocal = livingParts(r, e).find((p) => p.fn === 'vocal');
      const log: string[] = [];
      if (!vocal) {
        log.push('它没有你能捂住的地方。');
        bumpAwareness(r, e, 0.1);
      } else {
        behaviorOf(r, e).canCall = false;
        e.intent = null;
        log.push('你的手压上去。底下那两片还在振，但声音出不来了。');
      }
      return mkOutcome({ log, noise: emitNoise(r, 4, '压制'), effects: [vital('infection', 2)] });
    },
  }),
  def({
    id: 'act.sever-tendon',
    label: '切腱',
    shortDesc: '专打移动部位。它会变慢，慢到你可以选择走还是留。',
    cost: 4,
    noise: 6,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'precision', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const blade = x.bestWithTag('blade', 'pierce') ?? x.bestWithTag('precision', 'pierce');
      if (!blade) return noHit(['切腱要刃，不是要力气。你手上没有刃。']);
      const loco = livingParts(r, e).find((p) => p.fn === 'locomotion');
      const pid = ctx.targetPart ?? loco?.id;
      const res = attackPart(r, e, pid, {
        base: 0.72,
        power: (blade.power ?? 6) + 3,
        pierce: (blade.pierce ?? 2) + 2,
        precision: 0.45,
        lightIndependent: true,
      });
      spend(ctx, blade.id, false);
      return mkOutcome({
        log: ['你找那条绷得最紧的线。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 6, '切割'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.spike-auditory',
    label: '刺穿耳器',
    shortDesc: '精确摧毁听觉部位。做成了，它就再也听不见你。',
    cost: 4,
    noise: 7,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'precision', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const tool = x.bestWithTag('precision', 'pierce') ?? x.bestWithTag('blade', 'pierce');
      if (!tool) return noHit(['你需要一件细的东西。骨针、螺丝刀、分规，随便哪样。']);
      const ear = livingParts(r, e).find((p) => p.fn === 'auditory' || p.fn === 'ampullae');
      const pid = ctx.targetPart ?? ear?.id;
      if (!pid) return noHit(['它身上已经没有听觉器了。']);
      const res = attackPart(r, e, pid, {
        base: 0.66,
        power: (tool.power ?? 4) + 6,
        pierce: (tool.pierce ?? 2) + 4,
        precision: 0.5,
        lightIndependent: true,
      });
      spend(ctx, tool.id, false);
      return mkOutcome({
        log: ['你把它按住，找那个位置。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 7, '穿刺'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.crush-resonator',
    label: '砸碎共鸣腔',
    shortDesc: '钝器专打共鸣结构。对以声音为食的东西，这一下同时断了它的耳朵和饭。',
    cost: 5,
    noise: 10,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const blunt = x.bestWithTag('blunt', 'power') ?? x.bestWithTag('melee', 'power');
      if (!blunt) return noHit(['砸东西要重量。你手上都是轻的。']);
      const res0 = livingParts(r, e).find((p) => p.fn === 'auditory' && p.armor >= 1);
      const pid = ctx.targetPart ?? res0?.id ?? livingParts(r, e).find((p) => p.fn === 'auditory')?.id;
      if (!pid) return noHit(['它身上没有共鸣结构。']);
      const res = attackPart(r, e, pid, {
        base: 0.62,
        power: (blunt.power ?? 8) + 4,
        pierce: 2,
        precision: 0.3,
      });
      spend(ctx, blunt.id, false);
      return mkOutcome({
        log: ['你抬高，然后整个人的重量压下去。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 10, '砸击'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.gouge-thermal',
    label: '掏热窝',
    shortDesc: '毁掉红外感受器。靠热找人的东西会瞬间变成瞎的。',
    cost: 4,
    noise: 8,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const tool = x.bestWithTag('blade', 'pierce') ?? x.bestWithTag('precision', 'pierce');
      if (!tool) return noHit(['你需要一件能伸进去的东西。']);
      const pit = livingParts(r, e).find((p) => p.fn === 'thermal' || p.fn === 'ocular');
      const pid = ctx.targetPart ?? pit?.id;
      if (!pid) return noHit(['它身上没有你要找的那种器官。']);
      const res = attackPart(r, e, pid, {
        base: 0.6,
        power: (tool.power ?? 6) + 5,
        pierce: (tool.pierce ?? 2) + 3,
        precision: 0.4,
      });
      spend(ctx, tool.id, false);
      return mkOutcome({
        log: ['那些凹坑是湿的，边缘很软。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 8, '掏挖'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.crack-armor',
    label: '破甲',
    shortDesc: '专打装甲部位。装甲破了，后面所有动作的伤害都会变高。',
    cost: 5,
    noise: 14,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 1,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const tool = x.bestWithTag('armor-break', 'pierce') ?? x.bestWithTag('melee', 'power');
      if (!tool) return noHit(['破甲要工具。']);
      const armor = livingParts(r, e).find((p) => p.fn === 'armor');
      const pid = ctx.targetPart ?? armor?.id;
      if (!pid) return noHit(['它的甲已经没了。']);
      const res = attackPart(r, e, pid, {
        base: 0.74,
        power: (tool.power ?? 8) + 2,
        pierce: (tool.pierce ?? 0) + 4,
        precision: 0.2,
      });
      spend(ctx, tool.id, false);
      return mkOutcome({
        log: ['你找接缝，不找平面。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, tool.noise ?? 14, '破甲'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.cauterize-brood',
    label: '烧灼子体囊',
    shortDesc: '在杀死它之前先处理它的下一代。顺序错了，你会得到十四个新问题。',
    cost: 5,
    noise: 16,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    requires: { op: 'has-item', item: 'it.storm-match' },
    tags: ['melee', 'light', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const brood = livingParts(r, e).find((p) => p.fn === 'brood');
      if (!brood) return noHit(['它身上没有需要烧掉的东西。']);
      spend(ctx, 'it.storm-match', true);
      r.light = Math.max(r.light, 0.45);
      const res = attackPart(r, e, brood.id, { base: 0.82, power: 14, pierce: 3 });
      return mkOutcome({
        log: ['火先烧掉外面那层膜，然后里面就静了。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: brood.id, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 16, '灼烧'),
      });
    },
  }),
  def({
    id: 'act.pith-core',
    label: '穿刺要害',
    shortDesc: '一击终结。要害只在最高认知档位上才显形。',
    cost: 5,
    noise: 9,
    phases: ['contact'],
    targeting: 'part',
    needsCognition: 3,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'precision'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const x = ix(ctx.inventory);
      const tool = x.bestWithTag('blade', 'pierce') ?? x.bestWithTag('melee', 'power');
      if (!tool) return noHit(['你需要一件能进到里面去的东西。']);
      const core = livingParts(r, e).find((p) => p.vital);
      if (!core) {
        return noHit([
          defOf(e).unkillable
            ? '你找不到要害。它没有要害 —— 这不是你的认知不够，这是它的构造。'
            : '要害已经被破坏了。',
        ]);
      }
      const pid = ctx.targetPart && ctx.targetPart === core.id ? core.id : core.id;
      const res = attackPart(r, e, pid, {
        base: 0.58,
        power: (tool.power ?? 8) + 8,
        pierce: (tool.pierce ?? 2) + 3,
        precision: 0.3,
      });
      spend(ctx, tool.id, false);
      return mkOutcome({
        log: ['你知道它在哪。这句话本身就是这一局的全部收获。', ...res.log],
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects: res.effects,
        noise: emitNoise(r, 9, '穿刺'),
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.feed-flesh',
    label: '投喂血肉',
    shortDesc: '给它一块。它会先处理那一块，你会带走一道 Stigma。',
    cost: 3,
    noise: 4,
    item: 'it.bait-flesh',
    consumesItem: true,
    phases: ['contact', 'stalk'],
    targeting: 'entity',
    tags: ['social', 'sacrifice'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      spend(ctx, 'it.bait-flesh', true);
      if (!e) return noHit(['你把肉放在地上。没有东西来。']);
      const d = defOf(e);
      if (!(d.lure ?? []).includes('heat') && !d.tags.includes('swarm') && !d.negotiable) {
        bumpAwareness(r, e, 0.1);
        return mkOutcome({ log: ['它看了一眼那块肉，然后继续看你。'], noise: emitNoise(r, 4, '投喂') });
      }
      e.awareness = clamp01(e.awareness - 0.35);
      e.intent = null;
      shiftBand(r, e.id, -1);
      return mkOutcome({
        log: ['它低下去处理那块肉。它吃东西的方式让你很难继续看。'],
        effects: [{ op: 'stigma', stigma: 'flesh', delta: 1 }, vital('san', -5)],
        noise: emitNoise(r, 4, '投喂'),
      });
    },
  }),
  def({
    id: 'act.plead',
    label: '恳求',
    shortDesc: '对还是人的东西说话。成功就不用打了 —— 这是全作最省资源的解。',
    cost: 4,
    noise: 14,
    phases: ['contact', 'stalk'],
    targeting: 'entity',
    tags: ['social', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['你对着黑暗说话。它没有回答，但它听见了。'], emitNoise(r, 14, '说话'));
      const d = defOf(e);
      const n = emitNoise(r, 14, '说话');
      if (!d.negotiable) {
        bumpAwareness(r, e, 0.3);
        return mkOutcome({
          log: ['你说话了。它朝声音过来了。它不懂你说的任何一个词，但它懂你在哪。'],
          effects: [vital('fear', 8)],
          noise: n,
        });
      }
      const tier = r.cogTier[e.defId] ?? 0;
      const p = clamp(0.3 + tier * 0.1 + (r.flags.getNum('stigma.apostasy') > 2 ? -0.15 : 0.05), 0.1, 0.8);
      if (r.rng.bool(p)) {
        e.awareness = clamp01(e.awareness - 0.45);
        e.intent = null;
        behaviorOf(r, e).forbidden.add('strike');
        r.negotiation += 1;
        // 第二次说成才算放行。一次只是让它放下手 ——
        // 少了这个台阶，"可对话"会退化成一键解除遭遇
        if (r.negotiation >= 2) {
          return mkOutcome({
            log: [
              '它抬起右手，掌心朝下，向舷侧压了一下。',
              '那是让路的意思。你从它面前走过去，它没有转头。',
            ],
            effects: [
              vital('fear', -14),
              { op: 'flag-add', key: 'count.pleaded', delta: 1 },
              { op: 'flag', key: 'did.spared-cultist', value: true },
            ],
            noise: n,
            resolved: 'spared',
          });
        }
        return mkOutcome({
          log: ['它停下来了。它在听。你有两个回合，用来走或者用来说更多。'],
          effects: [vital('fear', -10), { op: 'flag-add', key: 'count.pleaded', delta: 1 }],
          noise: n,
        });
      }
      bumpAwareness(r, e, 0.2);
      return mkOutcome({
        log: ['它听完了。然后它做了它本来就要做的事。'],
        effects: [vital('fear', 6)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.recite-creed',
    label: '背诵教义',
    shortDesc: '用它自己的词。对教团与靠信仰找人的东西极有效，代价是聆听 Stigma。',
    cost: 4,
    noise: 12,
    phases: ['contact', 'stalk'],
    targeting: 'entity',
    requires: {
      op: 'any',
      of: [
        { op: 'has-item', item: 'it.catechism' },
        { op: 'has-knowledge', node: 'know.cult.catechism' },
        { op: 'has-item', item: 'it.hymn-page' },
      ],
    },
    tags: ['social', 'ritual', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      const n = emitNoise(r, 12, '背诵');
      if (!e) return noHit(['第四十九问没有人回答。'], n);
      const d = defOf(e);
      const receptive = d.negotiable || d.senses.includes('faith');
      if (!receptive) {
        bumpAwareness(r, e, 0.25);
        return mkOutcome({ log: ['你念完了。它不关心。'], noise: n });
      }
      e.awareness = clamp01(e.awareness - 0.5);
      e.intent = null;
      behaviorOf(r, e).forbidden.add('strike');
      behaviorOf(r, e).forbidden.add('grab');
      return mkOutcome({
        log: ['你念到第四问的时候它跟上了。你们一起念完了剩下的四十五问。'],
        effects: [
          { op: 'stigma', stigma: 'listening', delta: 1 },
          vital('fear', -12),
          vital('san', -4),
        ],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.mercy-cut',
    label: '仁慈处置',
    shortDesc: '对已经不能反抗的东西。一刀结束，一道疤留下。',
    cost: 4,
    noise: 5,
    phases: ['contact'],
    targeting: 'entity',
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'social', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const d = defOf(e);
      if (d.unkillable) return noHit(['它不会结束。它只会离开一会儿。']);
      if (e.hp > d.hpMax * 0.35) {
        bumpAwareness(r, e, 0.2);
        return mkOutcome({
          log: ['它还有力气。这一下变成了普通的一刀，而且你把自己送到了它手边。'],
          noise: emitNoise(r, 5, '靠近'),
        });
      }
      e.hp = 0;
      const effects: Effect[] = [...(d.killEffects ?? []), vital('san', d.negotiable ? -8 : -2)];
      return mkOutcome({
        log: [
          d.negotiable
            ? '它没有躲。它看着你，直到看不见为止。'
            : '你按住它，然后做完。做完以后舱里非常安静。',
        ],
        effects,
        noise: emitNoise(r, 5, '处置'),
        resolved: 'killed',
      });
    },
  }),
  def({
    id: 'act.live-autopsy',
    label: '活体解剖',
    shortDesc: '在它还活着的时候剖开看。认知收益最大，代价是噪音、时间与你自己。',
    cost: 12,
    noise: 20,
    phases: ['contact'],
    targeting: 'entity',
    needsCognition: 2,
    bands: ['adjacent', 'contact'],
    tags: ['melee', 'info', 'sacrifice', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有目标。']);
      const d = defOf(e);
      if (e.hp > d.hpMax * 0.4) {
        bumpAwareness(r, e, 0.4);
        return mkOutcome({
          log: ['它还在动。你只是在它身上划了一道，然后它转过来了。'],
          effects: [vital('trauma', 8), vital('fear', 14)],
          noise: emitNoise(r, 20, '挣扎'),
        });
      }
      const g = r.ledger.observe(e.defId, 'autopsy', 1);
      r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
      const log = ['你按住它，然后一层一层打开。你记下了每一层的顺序。', g.note];
      e.hp = 0;
      return mkOutcome({
        log,
        effects: [
          ...(d.killEffects ?? []),
          { op: 'stigma', stigma: 'flesh', delta: 2 },
          vital('san', -12),
          { op: 'knowledge', node: `know.bestiary.${d.id}` },
        ],
        noise: emitNoise(r, 20, '解剖'),
        resolved: 'killed',
      });
    },
  }),
];

// ===========================================================================
// PANIC —— 失控相
// ===========================================================================

const PANIC_ACTIONS: readonly ActionDef[] = [
  def({
    id: 'act.panic-scream',
    label: '尖叫',
    shortDesc: '把恐惧一次性放出去。60 点噪音，但它是唯一能把你拉出失控的动作。',
    cost: 2,
    noise: 60,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic', 'loud', 'sound'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const n = emitNoise(r, 60, '尖叫');
      r.listenerPressure += 0.4;
      for (const e of liveEntities(r)) {
        if (defOf(e).senses.includes('sound')) bumpAwareness(r, e, 0.5);
      }
      return mkOutcome({
        log: ['你听见那个声音，过了一会儿才认出那是你自己。', '胸腔空了。恐惧跟着一起出去了。'],
        effects: [vital('fear', -30), vital('co2', -12), vital('oxygen', -10)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.panic-flail',
    label: '乱挥',
    shortDesc: '随便打，随便打到什么。有时候真能打中。',
    cost: 4,
    noise: 18,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic', 'melee', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const x = ix(ctx.inventory);
      const w = x.bestWithTag('melee', 'power');
      const e = findEntity(r);
      const n = emitNoise(r, 18, '乱挥');
      if (!e) return mkOutcome({ log: ['你打空了四次。'], effects: [vital('fatigue', 6)], noise: n });
      const parts = livingParts(r, e);
      const pid = parts.length ? r.rng.pick(parts).id : undefined;
      const res = attackPart(r, e, pid, { base: 0.34, power: (w?.power ?? 4) + 1 });
      const effects: Effect[] = [vital('fatigue', 6), ...res.effects];
      const log = ['你不知道自己在打哪里。', ...res.log];
      if (!res.hit && r.rng.bool(0.3)) {
        log.push('你的手背撞在舱壁上。你没有感觉到痛，这更糟。');
        effects.push(vital('trauma', 5));
      }
      return mkOutcome({
        log,
        damage: res.hit ? [{ entity: e.id, part: pid, amount: res.damage }] : undefined,
        effects,
        noise: n,
        resolved: res.lethal ? 'killed' : undefined,
      });
    },
  }),
  def({
    id: 'act.panic-bolt',
    label: '盲跑',
    shortDesc: '往一个方向跑，不看。可能跑出去，也可能跑进墙里。',
    cost: 7,
    noise: 26,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic', 'escape', 'loud'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const n = emitNoise(r, 26, '奔跑');
      for (const e of liveEntities(r)) bumpAwareness(r, e, 0.3);
      const p = clamp(escapeChance(r) * 0.6 + (r.markedExit ? 0.15 : 0), 0.05, 0.7);
      if (r.rng.bool(p)) {
        return mkOutcome({
          log: ['你跑了。你不记得中间那几秒。'],
          effects: [vital('fatigue', 12), vital('co2', 10)],
          noise: n,
          resolved: 'escaped',
        });
      }
      return mkOutcome({
        log: ['你撞在一道关着的门上。门没有开。'],
        effects: [vital('trauma', 10), vital('fear', 8), vital('fatigue', 12)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.panic-rigid',
    label: '僵直',
    shortDesc: '身体不听指令。这一回合过去了，什么都没发生。',
    cost: 3,
    noise: 0,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.movement = 0;
      raiseMask(r, 'vibration', 0.8);
      for (const e of liveEntities(r)) e.awareness = clamp01(e.awareness - 0.04);
      return mkOutcome({
        log: ['你知道该做什么。你的手不知道。'],
        effects: [vital('fear', 3), vital('co2', 3)],
        noise: 0,
      });
    },
  }),
  def({
    id: 'act.panic-fumble',
    label: '手不听话',
    shortDesc: '你按下去的东西没有发生。呼吸照扣。',
    cost: 2,
    noise: 6,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const n = emitNoise(r, 6, '东西掉在地上');
      return mkOutcome({
        log: ['你伸手去拿，第一次没拿住，第二次也没有。它掉在钢板上，响了一声。'],
        effects: [vital('fear', 5)],
        noise: n,
      });
    },
  }),
  def({
    id: 'act.bite-down',
    label: '咬住牙关',
    shortDesc: '用意志把自己拉回来。成功率取决于抵抗力与清明度。',
    cost: 4,
    noise: 2,
    phases: ['panic'],
    targeting: 'none',
    tags: ['panic', 'defense'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const resolve = ctx.vitals.derived('resolve');
      const lucid = ctx.vitals.derived('lucidity');
      const p = clamp(0.3 + resolve * 0.22 + lucid * 0.08, 0.1, 0.85);
      if (r.rng.bool(p)) {
        return mkOutcome({
          log: ['你数到四，吸气；数到六，呼气。第三次的时候手回来了。'],
          effects: [vital('fear', -26), vital('co2', 4)],
          noise: emitNoise(r, 2, '深呼吸'),
        });
      }
      return mkOutcome({
        log: ['你数到三就数不下去了。'],
        effects: [vital('fear', 4)],
        noise: emitNoise(r, 2, '喘'),
      });
    },
  }),
];

// ===========================================================================
// ANY —— 任意相
// ===========================================================================

const ANY_ACTIONS: readonly ActionDef[] = [
  def({
    id: 'act.observe',
    label: '观察',
    shortDesc: '看它。需要光。看得越多，部位图越准，错的部位会一个个消失。',
    cost: 2,
    noise: 1,
    phases: ['stalk', 'contact'],
    targeting: 'entity',
    tags: ['info', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const e = findEntity(r, ctx.targetEntity);
      if (!e) return noHit(['没有可看的东西。']);
      const d = defOf(e);
      if (d.neverVisible) {
        const g = r.ledger.observe(e.defId, 'observe', 0.4);
        r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
        return mkOutcome({
          log: ['你看不到它。你只能看它留下的东西。', rngPick(r, d.evidence ?? ['——']), g.note],
          noise: emitNoise(r, 1, '挪动视线'),
        });
      }
      if (r.light < 0.15) {
        return mkOutcome({
          log: ['太暗了。你能确认它在那里，仅此而已。'],
          effects: [vital('fear', 4)],
          noise: emitNoise(r, 1, '摸索'),
        });
      }
      const g = r.ledger.observe(e.defId, 'observe', 0.7 + r.light);
      r.cogTier[e.defId] = r.ledger.tierIndex(e.defId);
      const v = r.ledger.view(e.defId);
      const log = [`${v.name}：${v.description}`, `【应对】${v.counsel}`, g.note];
      const phantoms = v.chart.filter((c) => c.phantom);
      if (phantoms.length) log.push(`部位图上有 ${phantoms.length} 处你还没验证过：${phantoms.map((p) => p.name).join('、')}`);
      bumpAwareness(r, e, 0.04);
      return mkOutcome({ log, effects: [vital('fear', 2)], noise: emitNoise(r, 1, '观察') });
    },
  }),
  def({
    id: 'act.inhale-candle',
    label: '点氧烛',
    shortDesc: '买一大口氧气。它亮、它热、它响 —— 三种暴露一次买齐。',
    cost: 4,
    noise: 24,
    item: 'it.oxygen-candle',
    consumesItem: true,
    phases: ['stalk', 'contact', 'panic'],
    targeting: 'none',
    tags: ['breath', 'loud', 'light'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const forwarded = ctx.inventory.use('it.oxygen-candle');
      r.light = Math.max(r.light, 0.5);
      r.masking.heat = 0;
      return mkOutcome({
        log: ['烛芯点着以后有一股铁的味道。氧气回来了，代价是你现在是这个舱里最亮最热的东西。'],
        effects: forwarded.length ? forwarded : [vital('oxygen', 240), vital('coreTemp', 1.1)],
        noise: emitNoise(r, 24, '氧烛'),
      });
    },
  }),
  def({
    id: 'act.use-scrubber',
    label: '换制氧滤罐',
    shortDesc: '安静地买氧气。比氧烛少，但不会告诉任何人。',
    cost: 5,
    noise: 4,
    item: 'it.scrubber-cartridge',
    consumesItem: true,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['breath', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const forwarded = ctx.inventory.use('it.scrubber-cartridge');
      return mkOutcome({
        log: ['旧罐拧下来的时候很沉。新罐里的空气有一点碱味。'],
        effects: forwarded.length ? forwarded : [vital('oxygen', 180), vital('co2', -30)],
        noise: emitNoise(r, 4, '换罐'),
      });
    },
  }),
  def({
    id: 'act.atropine',
    label: '注射阿托品',
    shortDesc: '让手稳下来。恐惧下降，二氧化碳上升。',
    cost: 3,
    noise: 2,
    item: 'it.atropine',
    consumesItem: true,
    phases: ['stalk', 'contact', 'panic'],
    targeting: 'none',
    tags: ['medical'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const forwarded = ctx.inventory.use('it.atropine');
      return mkOutcome({
        log: ['针进去的时候你没感觉。几秒以后心跳慢下来，手也是。'],
        effects: forwarded.length ? forwarded : [vital('fear', -22), vital('co2', 4)],
        noise: emitNoise(r, 2, '注射'),
      });
    },
  }),
  def({
    id: 'act.smelling-salts',
    label: '嗅盐',
    shortDesc: '把一个正在失控的人拽回来一回合。只有一回合。',
    cost: 2,
    noise: 2,
    item: 'it.smelling-salts',
    consumesItem: true,
    phases: ['panic', 'contact'],
    targeting: 'none',
    tags: ['medical', 'panic'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const forwarded = ctx.inventory.use('it.smelling-salts');
      return mkOutcome({
        log: ['刺鼻的一下。世界重新有了边。'],
        effects: forwarded.length ? forwarded : [vital('fear', -16), vital('co2', -6)],
        noise: emitNoise(r, 2, '掰开安瓿'),
      });
    },
  }),
  def({
    id: 'act.reality-anchor',
    label: '使用现实锚',
    shortDesc: '确认镜子里的人和照片上的人是同一个。理智回来，Stigma 留下。',
    cost: 6,
    noise: 3,
    item: 'it.reality-anchor',
    phases: ['stalk', 'contact', 'panic'],
    targeting: 'none',
    tags: ['medical', 'ritual'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const which = ctx.inventory.count('it.blood-anchor') > 0 ? 'it.blood-anchor' : 'it.reality-anchor';
      const forwarded = ctx.inventory.use(which);
      ix(ctx.inventory).wear(which, 1);
      return mkOutcome({
        log: ['你把镜片举到照片旁边。两张脸对上了。你花了比预期更久才确认这件事。'],
        effects: forwarded.length ? forwarded : [vital('san', 20), vital('fear', -18)],
        noise: emitNoise(r, 3, '翻找'),
      });
    },
  }),
  def({
    id: 'act.suture',
    label: '止血',
    shortDesc: '把伤口按住。外伤下降，但你要空出两只手。',
    cost: 8,
    noise: 3,
    item: 'it.hemostat-pack',
    consumesItem: true,
    phases: ['stalk'],
    targeting: 'none',
    tags: ['medical'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      const forwarded = ctx.inventory.use('it.hemostat-pack');
      for (const e of liveEntities(r)) bumpAwareness(r, e, 0.05);
      return mkOutcome({
        log: ['你把纱布按上去，用牙咬住另一头。血先透过来，然后停了。'],
        effects: forwarded.length ? forwarded : [vital('trauma', -22)],
        noise: emitNoise(r, 3, '包扎'),
      });
    },
  }),
  def({
    id: 'act.count-breaths',
    label: '数呼吸',
    shortDesc: '什么都不做，让噪音衰减一轮。有时候这就是最优解。',
    cost: 2,
    noise: 0,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['breath', 'silent'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      r.movement = 0;
      r.noise = Math.max(0, r.noise - 6);
      return mkOutcome({
        log: ['你数到十二。第十二下的时候舱里比第一下安静。'],
        effects: [vital('fear', -4), vital('co2', -2)],
        noise: 0,
      });
    },
  }),
  def({
    id: 'act.withdraw',
    label: '脱离遭遇',
    shortDesc: '正式尝试离开。成功率由距离、觉察度、噪音与门标记决定。',
    cost: 6,
    noise: 8,
    phases: ['stalk', 'contact'],
    targeting: 'none',
    tags: ['escape'],
    resolve(ctx) {
      const r = asRuntime(ctx.encounter);
      if (!r.escapable) {
        return mkOutcome({
          log: ['门是关着的，而且不是你关的。'],
          effects: [vital('fear', 10)],
          noise: emitNoise(r, 8, '拉门'),
        });
      }
      const x = ix(ctx.inventory);
      const p = clamp(escapeChance(r) - Math.min(x.totalLoudness(), 5) * 0.04, 0.05, 0.95);
      const n = emitNoise(r, 8 * x.movementNoise(r.masking.sound), '撤离');
      if (r.rng.bool(p)) {
        return mkOutcome({ log: ['你出去了。门在你身后合上，比你希望的响。'], noise: n, resolved: 'escaped' });
      }
      for (const e of liveEntities(r)) {
        bumpAwareness(r, e, 0.25);
        shiftBand(r, e.id, 1);
      }
      return mkOutcome({
        log: ['你走到一半，它已经在你和门之间了。'],
        effects: [vital('fear', 14)],
        noise: n,
      });
    },
  }),
];

// ===========================================================================
// 汇总与查询
// ===========================================================================

export const ALL_ACTIONS: readonly ActionDef[] = [
  ...STALK_ACTIONS,
  ...CONTACT_ACTIONS,
  ...PANIC_ACTIONS,
  ...ANY_ACTIONS,
];

const ACTION_BY_ID = new Map<ID, ActionDef>();
for (const a of ALL_ACTIONS) {
  if (ACTION_BY_ID.has(a.id)) throw new Error(`[actions] 重复的动作 id: ${a.id}`);
  ACTION_BY_ID.set(a.id, a);
}

export function actionDef(id: ID): ActionDef | undefined {
  return ACTION_BY_ID.get(id);
}

export function actionStats(): { total: number; byPhase: Record<string, number>; byTag: Record<string, number> } {
  const byPhase: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  for (const a of ALL_ACTIONS) {
    for (const p of a.phases) byPhase[p] = (byPhase[p] ?? 0) + 1;
    for (const t of a.tags) byTag[t] = (byTag[t] ?? 0) + 1;
  }
  return { total: ALL_ACTIONS.length, byPhase, byTag };
}

/** 把内容层的 ActionDef 包成契约要求的 CombatAction */
export function toCombatAction(a: ActionDef): CombatAction {
  return {
    id: a.id,
    label: a.label,
    cost: a.cost,
    noise: a.noise,
    item: a.item,
    targeting: a.targeting,
    requires: a.requires,
    resolve: (ctx) => a.resolve(ctx),
  };
}

// ---------------------------------------------------------------------------
// 文本助手
// ---------------------------------------------------------------------------

function rngPick(r: EncounterRuntime, arr: readonly string[]): string {
  return arr.length ? r.rng.pick(arr) : '——';
}

export function bandLabel(b: ReturnType<typeof bandOf>): string {
  switch (b) {
    case 'unknown':
      return '位置不明';
    case 'far':
      return '远';
    case 'near':
      return '近';
    case 'adjacent':
      return '贴身';
    default:
      return '接触';
  }
}

/** 意图提示：认知不足时只给模糊描述，认知够了才给准确的 telegraph */
export function intentHint(r: EncounterRuntime, e: Parameters<typeof defOf>[0]): string {
  const tier = r.cogTier[e.defId] ?? 0;
  if (!e.intent) return '还没有决定';
  if (tier === 0) return '你读不出它要做什么';
  if (tier === 1) return e.intent.kind === 'strike' || e.intent.kind === 'grab' ? '它准备动手' : '它在做别的事';
  return e.intent.telegraph;
}

export { bandIndex } from './combat-math';
