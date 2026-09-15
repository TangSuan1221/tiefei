/**
 * 《铁肺迷城》— 真实性层 (Agent A)
 * ============================================================
 * GDD §5。这是本作与普通恐怖游戏的分界线，也是评审最该往死里检验的地方。
 *
 * 四条自我约束（写在最前面，因为它们比代码更重要）：
 *
 *   1. **谎言必须可被识破**。每一个 Lie 都带一条具体的、玩家能主动去验证的破绽。
 *      没有 tell 的欺骗只是恶意，有 tell 的欺骗才是博弈。
 *   2. **谎言必须自洽**。同一帧内查询同一个数字，必须返回同一个结果；
 *      同一段文字在同一个呼吸内渲染两次，必须一模一样。做不到这点，玩家一眼看穿，
 *      整套机制立刻降级成"屏幕特效"。所以本模块的一切随机都由
 *      (内容哈希 × 纪元 × 种子) 决定性地导出，没有一次调用是自由掷骰。
 *   3. **禁止 Math.random()**。全部走 Xoshiro。
 *   4. **污染要有方向**。船不是在胡言乱语，它在劝你留下：氧气读数偏乐观，
 *      伤情读数偏轻，第二人称会慢慢变成第一人称。方向本身就是叙事。
 */

import type {
  EventBus, FabricationKind, ID, Lie, Rng, VeracitySystem,
} from '../core/contract.ts';
import { seedFromString, Xoshiro } from '../core/rng.ts';
import { clamp, clamp01, damp, lerp } from '../core/util.ts';
import { DEPTH_RANGE, TUNING } from './tuning.ts';
import {
  GLYPH_MAP, HEDGES, INTRUSIONS, NEGATION_SWAPS, PERSON_SWAPS,
  STUTTER_JOINERS, TELLS, WORD_SWAPS,
} from './lexicon.ts';
import type { VeracityDriveInput } from './types.ts';

type TextKind = 'ui' | 'dialogue' | 'log' | 'item';

interface VeracityInit {
  seed?: number;
  bus?: EventBus;
  /** 识破奖励要发到生理层去（SAN +8）。用窄接口避免与 VitalsEngine 硬耦合。 */
  vitals?: { rewardDebunk(): void };
  /** 跨轮回继承的永久清明度。 */
  lucidity?: number;
}

interface SerializedVeracity {
  corruption: number;
  lucidity: number;
  lies: Lie[];
  cooldowns: Record<string, number>;
  now: number;
  debunked: number;
  seed: number;
}

/** 单个污染算子。minLayer 决定它在哪一层解锁——污染是分层的，不是一锅端。 */
interface Mutator {
  id: string;
  minLayer: number;
  weight: number;
  apply(text: string, rng: Xoshiro): string;
}

const SENTENCE_END = /[。！？；\n]/;

export class VeracityEngine implements VeracitySystem {
  private _corruption = 0;
  private target = 0;
  private lucidityPermanent: number;
  private effectLucidity = 0;

  private lies: Lie[] = [];
  private cooldown = new Map<string, number>();
  /** 导演 AI 写入的个性化偏置：对某类伪造的额外倍率。 */
  private bias = new Map<string, number>();

  private now = 0;
  private epoch = -1;
  private debunkedCount = 0;

  private textCache = new Map<string, string>();
  private numberCache = new Map<string, number>();

  private readonly seed: number;
  private bus: EventBus | null;
  private vitals: { rewardDebunk(): void } | null;

  constructor(init: VeracityInit = {}) {
    this.seed = (init.seed ?? 0x5eed1e) >>> 0;
    this.bus = init.bus ?? null;
    this.vitals = init.vitals ?? null;
    this.lucidityPermanent = init.lucidity ?? 0;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 污染度模型 —— GDD §5: corruption = f(SAN, infection, depth, stigma.listening)
  // ──────────────────────────────────────────────────────────────────────

  get corruption(): number {
    return this._corruption;
  }

  /** 当前所处层级 0..5，对应 GDD §5 的 L0 清明 … L5 共鸣。 */
  get layer(): number {
    const marks = TUNING.veracity.layers;
    let l = 0;
    for (const m of marks) if (this._corruption >= m) l++;
    return l;
  }

  /** L5 共鸣层：真假反转生效。 */
  get resonant(): boolean {
    return this.layer >= 5;
  }

  get lucidity(): number {
    return this.lucidityPermanent;
  }

  get debunkCount(): number {
    return this.debunkedCount;
  }

  /**
   * 每个呼吸被 VitalsEngine 驱动一次。
   * 污染度**必须平滑**：逐步跳变会让 HUD 抖成噪点，玩家反而立刻发现"游戏在搞鬼"。
   * 缓慢的漂移才会被误认为是自己的问题。
   */
  update(input: VeracityDriveInput): void {
    const V = TUNING.veracity;
    const v = input.vitals;

    const sanLack = 1 - clamp01(v.san / Math.max(1, v.sanMax));
    const sanTerm = Math.pow(sanLack, V.sanExponent) * V.sanWeight;
    const infTerm = clamp01(v.infection / 100) * V.infectionWeight;
    const depthTerm =
      clamp01((input.depth - DEPTH_RANGE[0]) / (DEPTH_RANGE[1] - DEPTH_RANGE[0])) * V.depthWeight;
    const listenTerm = clamp01(input.stigmaListening / V.listeningFull) * V.listeningWeight;

    this.effectLucidity = input.effectLucidity;
    // 两种清明度的抗性分开算：永久的（debunk 攒的）强，临时的（现实锚给的）弱。
    // 否则一个道具就能把招牌机制关掉。
    const resist =
      1 / (1 + Math.max(0, this.lucidityPermanent) * V.lucidityResist) *
      1 / (1 + Math.max(0, this.effectLucidity) * V.effectLucidityResist);

    this.target = clamp01((sanTerm + infTerm + depthTerm + listenTerm) * resist);
    this._corruption = damp(this._corruption, this.target, V.lambda, input.dt);

    this.now = input.breathsElapsed;
    this.advanceEpoch();
    this.prune();
  }

  /**
   * 纪元推进。一个纪元 = 一个呼吸。
   * 所有缓存按纪元清空，于是"同一帧内多次查询"必然命中缓存拿到同一个值，
   * 而"过了一口气再看"才会变。这正是我们要让玩家观察到的破绽节奏。
   */
  private advanceEpoch(): void {
    const e = Math.floor(this.now);
    if (e === this.epoch) return;
    this.epoch = e;
    this.textCache.clear();
    this.numberCache.clear();
  }

  /** 强制开新纪元。存档读取、场景切换后调用，避免旧缓存跨越不连续的时间。 */
  invalidate(): void {
    this.epoch = -1;
    this.textCache.clear();
    this.numberCache.clear();
  }

  private stream(key: string): Xoshiro {
    return new Xoshiro((seedFromString(key) ^ this.seed ^ (this.epoch * 0x9e3779b9)) >>> 0, 'ver');
  }

  // ──────────────────────────────────────────────────────────────────────
  // 文本污染
  // ──────────────────────────────────────────────────────────────────────

  private readonly mutators: readonly Mutator[] = [
    {
      // L1：形近字。一笔之差，读得通，但你会在第二遍时停住。
      id: 'glyph', minLayer: 1, weight: 3.0,
      apply: (t, r) => {
        const idx: number[] = [];
        for (let i = 0; i < t.length; i++) if (GLYPH_MAP.has(t[i])) idx.push(i);
        if (idx.length === 0) return t;
        const i = r.pick(idx);
        return t.slice(0, i) + GLYPH_MAP.get(t[i]) + t.slice(i + 1);
      },
    },
    {
      // L2：错义近义词。句子完全通顺，只是世界观换了一个。最恶毒的一层。
      id: 'word', minLayer: 2, weight: 2.4,
      apply: (t, r) => {
        const hits = WORD_SWAPS.filter(([from]) => t.includes(from));
        if (hits.length === 0) return t;
        const [from, to] = r.pick(hits);
        const at = t.indexOf(from);
        return t.slice(0, at) + to + t.slice(at + from.length);
      },
    },
    {
      // L2：句子重复。复制的那一份会被再污染一次，所以两遍读起来不完全一样——
      // 这比单纯复读可怕得多，因为它证明"复读的不是同一个来源"。
      id: 'stutter', minLayer: 2, weight: 1.3,
      apply: (t, r) => {
        const parts = splitClauses(t);
        if (parts.length === 0) return t;
        const i = r.int(0, parts.length - 1);
        const joiner = r.pick(STUTTER_JOINERS);
        const echo = glyphOnce(parts[i], r);
        parts.splice(i + 1, 0, joiner + echo);
        return parts.join('');
      },
    },
    {
      // L3：侵入句。一句不属于这里的话掉进来，语气平静，内容具体。
      id: 'intrusion', minLayer: 3, weight: 1.6,
      apply: (t, r) => {
        const parts = splitClauses(t);
        const line = r.pick(INTRUSIONS);
        if (parts.length === 0) return line;
        const i = r.int(0, parts.length - 1);
        parts.splice(i + 1, 0, line);
        return parts.join('');
      },
    },
    {
      // L3：否定反转。改动最小，后果最大——"不要打开那扇门"变成"要打开那扇门"。
      id: 'negation', minLayer: 3, weight: 1.8,
      apply: (t, r) => {
        const hits = NEGATION_SWAPS.filter(([from]) => t.includes(from));
        if (hits.length === 0) return t;
        const [from, to] = r.pick(hits);
        const at = t.indexOf(from);
        return t.slice(0, at) + to + t.slice(at + from.length);
      },
    },
    {
      // L3：人称替换。叙述者开始站在你的位置上说话。这是"共鸣"的语法先兆。
      id: 'person', minLayer: 3, weight: 1.5,
      apply: (t, r) => {
        const hits = PERSON_SWAPS.filter(([from]) => t.includes(from));
        if (hits.length === 0) return t;
        const [from, to] = r.pick(hits);
        // 人称一旦换就换到底：只换一处会显得像错别字，全换才像另一个人在说话。
        return t.split(from).join(to);
      },
    },
    {
      // L4：字形拉长。生理性的——你的眼睛在缺氧，字符在视网膜上拖尾。
      id: 'elongate', minLayer: 4, weight: 1.1,
      apply: (t, r) => {
        if (t.length < 3) return t;
        const i = r.int(0, t.length - 1);
        const ch = t[i];
        if (SENTENCE_END.test(ch) || ch === ' ') return t;
        return t.slice(0, i) + ch.repeat(r.int(2, 4)) + t.slice(i + 1);
      },
    },
    {
      // L4：截断嫁接。原文在中途被切掉，接上别处的一句。日志"自己改写"就是这个算子。
      id: 'graft', minLayer: 4, weight: 1.4,
      apply: (t, r) => {
        const parts = splitClauses(t);
        if (parts.length < 2) return t + r.pick(INTRUSIONS);
        const cut = r.int(1, parts.length - 1);
        return parts.slice(0, cut).join('') + r.pick(INTRUSIONS);
      },
    },
  ];

  /** 不同文本用途允许的算子集合。UI 标签里塞一整句侵入语只会显得像 bug，不像谎言。 */
  private allowed(kind: TextKind, id: string): number {
    switch (kind) {
      case 'ui':
        return id === 'glyph' ? 1 : id === 'word' ? 0.6 : id === 'elongate' ? 0.5 : 0;
      case 'item':
        return id === 'glyph' ? 1 : id === 'word' ? 1.2 : 0;
      case 'log':
        return id === 'graft' || id === 'intrusion' ? 1.8 : 1;
      case 'dialogue':
        return id === 'person' || id === 'negation' ? 1.4 : 1;
      default:
        return 1;
    }
  }

  text(raw: string, kind: TextKind): string {
    if (!raw) return raw;
    const layer = this.layer;
    if (layer === 0) return raw;

    const key = `${kind}|${raw}`;
    const cached = this.textCache.get(key);
    if (cached !== undefined) return cached;

    const rng = this.stream(key);
    const V = TUNING.veracity;
    // 变异次数与文本长度成正比：长段落被改一个字几乎无感，短提示被改一个字就是灾难。
    const expected = V.mutationDensity[layer] * (raw.length / 12);
    let count = Math.floor(expected);
    if (rng.next() < expected - count) count++;
    count = Math.min(count, 6);

    const pool = this.mutators
      .filter((m) => m.minLayer <= layer && this.allowed(kind, m.id) > 0)
      .map((m) => [m, m.weight * this.allowed(kind, m.id)] as [Mutator, number]);

    let out = raw;
    if (pool.length > 0) {
      for (let i = 0; i < count; i++) out = rng.weighted(pool).apply(out, rng);
    }

    // L5 共鸣层：真假反转。幻觉的声音在这里反而变得清晰、笃定、没有余地，
    // 而真话继续含糊。玩家必须学会"说得越肯定的越可能是它"。
    if (layer >= 5) out = clarify(out, rng);

    this.textCache.set(key, out);
    return out;
  }

  /**
   * 反转判定 —— L5 的核心规则："只有幻觉房间里的东西是真的"。
   * 世界层与叙事层在渲染任何带来源标记的内容前都该问一次这个函数。
   */
  trustworthy(source: 'real' | 'phantom'): boolean {
    if (!this.resonant) return source === 'real';
    return TUNING.veracity.inversionStrength >= 1 ? source === 'phantom' : source === 'real';
  }

  // ──────────────────────────────────────────────────────────────────────
  // 数值污染
  // ──────────────────────────────────────────────────────────────────────

  /**
   * HUD 数字漂移。
   * 一致性是这里的生命线：玩家会盯着氧气表看好几秒，如果数字每帧乱跳，
   * 他一秒钟就知道这是特效。所以按纪元（= 一个呼吸）缓存，一口气之内绝不改变。
   */
  number(raw: number, stat: string): number {
    const layer = this.layer;
    if (layer === 0) return raw;

    const key = `${stat}|${raw.toFixed(3)}`;
    const cached = this.numberCache.get(key);
    if (cached !== undefined) return cached;

    const rng = this.stream(`num:${key}`);
    const V = TUNING.veracity;
    let out: number;

    if (layer === 1) {
      // GDD §5 明文：L1 是 ±2 的轻微跳动。
      out = raw + rng.int(-V.driftAbsoluteL1, V.driftAbsoluteL1);
    } else {
      let d = rng.float(-1, 1);
      // 污染有方向：船在劝你留下。好消息被放大，坏消息被压低。
      if (stat === 'oxygen' || stat === 'san') d = lerp(d, Math.abs(d), V.oxygenOptimism);
      else if (stat === 'co2' || stat === 'trauma' || stat === 'infection' || stat === 'fear') {
        d = lerp(d, -Math.abs(d), V.oxygenOptimism);
      }
      out = raw * (1 + d * V.driftPercent[layer]);
    }

    if (layer >= 5 && rng.bool(0.3)) {
      // 共鸣层的数字有一种不属于仪表的规整感——它们是被"唱"出来的，不是被测出来的。
      out = Math.round(out / 7) * 7;
    }

    // 整数量（氧气以呼吸计）保持整数，否则一眼就看出被乘过小数。
    out = Number.isInteger(raw) || stat === 'oxygen' ? Math.round(out) : Math.round(out * 10) / 10;
    out = Math.max(0, out);
    this.numberCache.set(key, out);
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // 伪造
  // ──────────────────────────────────────────────────────────────────────

  shouldPhantom(rng: Rng): boolean {
    if (this.layer < 2) return false;
    return rng.next() < TUNING.veracity.phantomBase * this._corruption * (this.layer - 1);
  }

  /**
   * 是否伪造一次事件。返回 true 的同时**必定**登记一条带破绽的 Lie ——
   * 不存在"没有 tell 的谎言"，这是 GDD §5 立下的契约。
   */
  shouldFabricate(rng: Rng, kind: FabricationKind): boolean {
    const V = TUNING.veracity;
    const minLayer = V.fabricateMinLayer[kind] ?? 3;
    if (this.layer < minLayer) return false;

    const until = this.cooldown.get(kind) ?? -Infinity;
    if (this.now < until) return false;

    const base = V.fabricateRate[kind] ?? 0.05;
    const personal = this.bias.get(kind) ?? 1;
    // 层级越深越频繁，但用超出门槛的层数而不是绝对层数，避免低层伪造在高层泛滥成噪音。
    const depthBonus = 1 + (this.layer - minLayer) * 0.35;
    const p = clamp01(base * this._corruption * depthBonus * personal);
    if (rng.next() >= p) return false;

    this.cooldown.set(kind, this.now + (V.fabricateCooldown[kind] ?? 30));
    this.birth(kind, rng);
    return true;
  }

  /** 登记一条谎言。tell 从语料库里按种类抽，每种至少三条，避免玩家背答案。 */
  private birth(kind: FabricationKind, rng: Rng): Lie {
    const tells = TELLS[kind] ?? ['它在某个细节上与你记得的不一致。'];
    const lie: Lie = {
      id: `lie.${kind}.${Math.round(this.now * 100)}.${rng.int(100, 999)}`,
      kind,
      tell: rng.pick(tells),
      bornAt: this.now,
      debunked: false,
    };
    this.lies.push(lie);
    if (this.lies.length > TUNING.veracity.maxActiveLies) {
      // 淘汰最老的未识破谎言：玩家的注意力是有限资源，堆太多等于没有。
      const i = this.lies.findIndex((l) => !l.debunked);
      this.lies.splice(i >= 0 ? i : 0, 1);
    }
    this.bus?.emit('lie:born', lie);
    return lie;
  }

  /** 供叙事/世界层直接下单的伪造（例如"这个房间必须是镜像舱"）。 */
  forge(kind: FabricationKind, rng: Rng): Lie {
    return this.birth(kind, rng);
  }

  get activeLies(): readonly Lie[] {
    return this.lies;
  }

  /** 玩家当前可能识破的谎言中，最"新鲜"的一条。UI 的检查动作用它来给反馈。 */
  freshest(): Lie | null {
    let best: Lie | null = null;
    for (const l of this.lies) if (!l.debunked && (!best || l.bornAt > best.bornAt)) best = l;
    return best;
  }

  /**
   * 识破。GDD §5 明文奖励：SAN +8，lucidity 永久 +1。
   * lucidity 是跨轮回的，所以它是这套机制真正的元进度——
   * 玩家不是变强了，是变得更难被骗了。
   */
  debunk(id: ID): void {
    const lie = this.lies.find((l) => l.id === id);
    if (!lie || lie.debunked) return;
    lie.debunked = true;
    this.debunkedCount++;
    this.lucidityPermanent += TUNING.veracity.debunkLucidity;
    this.vitals?.rewardDebunk();
    // 识破会立刻拉低感知污染，玩家能马上"看见世界变清楚了一点"——正反馈必须即时。
    this._corruption = Math.max(0, this._corruption - 0.04);
    this.invalidate();
    this.bus?.emit('lie:debunked', lie);
  }

  /** 导演 AI 的个性化恐吓接口：把某一类伪造的频率乘上一个系数。 */
  setBias(kind: FabricationKind, multiplier: number): void {
    this.bias.set(kind, clamp(multiplier, 0, 4));
  }

  clearBias(): void {
    this.bias.clear();
  }

  private prune(): void {
    const life = TUNING.veracity.lieLifetime;
    // 已识破的谎言留在列表里（UI 要显示"已识破"的划线），但过期的未识破谎言必须清掉，
    // 否则玩家在第 900 个呼吸还能去"识破"一个他早就走过的房间。
    this.lies = this.lies.filter((l) => l.debunked || this.now - l.bornAt < life);
  }

  // ──────────────────────────────────────────────────────────────────────
  // 存档
  // ──────────────────────────────────────────────────────────────────────

  serialize(): unknown {
    const blob: SerializedVeracity = {
      corruption: this._corruption,
      lucidity: this.lucidityPermanent,
      lies: this.lies.map((l) => ({ ...l })),
      cooldowns: Object.fromEntries(this.cooldown),
      now: this.now,
      debunked: this.debunkedCount,
      seed: this.seed,
    };
    return blob;
  }

  hydrate(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as Partial<SerializedVeracity>;
    this._corruption = d.corruption ?? 0;
    this.target = this._corruption;
    this.lucidityPermanent = d.lucidity ?? 0;
    this.lies = (d.lies ?? []).map((l) => ({ ...l }));
    this.cooldown = new Map(Object.entries(d.cooldowns ?? {}));
    this.now = d.now ?? 0;
    this.debunkedCount = d.debunked ?? 0;
    this.invalidate();
  }
}

// ============================================================================
// 文本工具
// ============================================================================

/** 按句读切分并**保留标点**。丢标点会让重排后的文本一眼看出是被程序处理过的。 */
function splitClauses(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    cur += ch;
    if (/[。！？；，\n]/.test(ch)) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 对一小段文本做一次形近字替换，用于让"复读"的第二遍与第一遍不同。 */
function glyphOnce(text: string, rng: Xoshiro): string {
  const idx: number[] = [];
  for (let i = 0; i < text.length; i++) if (GLYPH_MAP.has(text[i])) idx.push(i);
  if (idx.length === 0) return text;
  const i = rng.pick(idx);
  return text.slice(0, i) + GLYPH_MAP.get(text[i]) + text.slice(i + 1);
}

/**
 * L5 的"清洗"：删掉一切模糊限定词，把逗号改成句号。
 * 效果是文本突然变得斩钉截铁。共鸣层的规则是真假互换，
 * 所以这里要让**假的听起来像唯一的事实**——含糊是活人的说话方式。
 */
function clarify(text: string, rng: Xoshiro): string {
  let out = text;
  for (const h of HEDGES) out = out.split(h).join('');
  const parts = splitClauses(out);
  const cut = Math.min(parts.length, rng.int(2, 4));
  return parts
    .slice(0, cut)
    .map((p) => p.replace(/，$/, '。'))
    .join('');
}
