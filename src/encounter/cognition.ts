/**
 * 认知系统（GDD §4.5）。
 *
 * 设计要点：cognition 不是"图鉴解锁百分比"，它是**玩家手上唯一的跨轮回资源**。
 * 它做三件互相咬合的事：
 *   1. 改名字与描述 —— 第 0 档的描述是**错的**，会主动把玩家推向错误的应对；
 *   2. 改部位图 —— 低认知时部位图里会混入**根本不存在的部位**，攻击它会落空并暴露自己；
 *   3. 改动作表 —— 针对性动作（刺耳器、切腱、砸共鸣腔）只在认知达标后出现。
 *
 * 为什么把"错误部位"做成机制而不是文案：只有当错误信息会让玩家付出呼吸与噪音的代价，
 * "了解怪物"才真的是一种进度。
 */

import type { ID } from '../core/contract';
import { clamp01 } from '../core/util';
import type { CognitionSource, CognitionTier, EnemyDef, PartDef } from './types';
import { enemyDef, hasEnemyDef } from '../content/bestiary/index';

/** 每种获取方式对 cognition 的贡献上限。逼玩家用多种手段，而不是刷同一个动作 */
const SOURCE_CAP: Record<CognitionSource, number> = {
  observe: 0.30,   // 黑暗里盯着看，能看出的有限
  listen: 0.14,    // 贴壁听它走路
  wound: 0.22,     // 打伤它才知道里面是什么结构
  survive: 0.26,   // 活着从它手里出来
  archive: 0.46,   // 船上的档案与解剖图谱
  autopsy: 0.58,   // 尸检 —— 最有效，但你得先弄死一个，而且很吵
};

/** 单次获取的基准增量 */
const SOURCE_STEP: Record<CognitionSource, number> = {
  observe: 0.055,
  listen: 0.040,
  wound: 0.045,
  survive: 0.130,
  archive: 0.230,
  autopsy: 0.290,
};

export interface PartChartEntry {
  /** 真实部位 id；phantom 条目的 id 以 `phantom.` 开头 */
  id: ID;
  /** 玩家看到的名字 */
  name: string;
  /** 这条是玩家的臆想，打上去会落空 */
  phantom: boolean;
  /** hp 是否可见 */
  hpVisible: boolean;
  /** 装甲是否可见 */
  armorVisible: boolean;
  /** 玩家读到的描述（低认知时是 falseName 对应的胡话） */
  describe: string;
}

export interface EntityView {
  defId: ID;
  cognition: number;
  tierIndex: 0 | 1 | 2 | 3;
  name: string;
  description: string;
  counsel: string;
  chartFidelity: number;
  chart: readonly PartChartEntry[];
  /** 本认知档位下解锁的动作（累积前面所有档） */
  unlocked: readonly ID[];
  /** 玩家是否知道它的感知通道。不知道就无法判断诱饵有不有用 */
  sensesKnown: boolean;
}

/** 低认知时臆想出的部位名。冷、解剖学的、但都是错的 */
const PHANTOM_PARTS: readonly { name: string; describe: string }[] = [
  { name: '第二颚', describe: '你确信在那个位置有第二排颌骨。回波是这么说的。' },
  { name: '腹面气孔', describe: '你听到吸气声从下方来，所以那里一定有开口。' },
  { name: '尾索', describe: '有什么拖在它后面。你把那当成了身体的一部分。' },
  { name: '外鳃', describe: '水在它侧面分流。你断定那是鳃。' },
  { name: '悬垂囊', describe: '一团悬着的、随呼吸起伏的东西。也许只是滴水。' },
  { name: '颈部关节', describe: '它转向你的时候有两段声音。所以那里该有个关节。' },
  { name: '背棘', describe: '手灯扫过时有一列反光点。也可能是舱壁的铆钉。' },
];

/** 确定性字符串哈希 —— 幻想部位必须**每次都一样**，否则玩家学不到任何东西 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class CognitionLedger {
  /** defId → 各来源已获取的量 */
  private data = new Map<ID, Partial<Record<CognitionSource, number>>>();

  constructor(initial?: Record<ID, number>) {
    if (initial) this.hydrateFlat(initial);
  }

  // -- 查询 -----------------------------------------------------------------

  value(defId: ID): number {
    const rec = this.data.get(defId);
    if (!rec) return 0;
    let sum = 0;
    for (const k of Object.keys(rec) as CognitionSource[]) sum += rec[k] ?? 0;
    return clamp01(sum);
  }

  tierIndex(defId: ID): 0 | 1 | 2 | 3 {
    const def = enemyDef(defId);
    const v = this.value(defId);
    let idx: 0 | 1 | 2 | 3 = 0;
    for (let i = 3; i >= 0; i--) {
      if (v >= def.tiers[i].min) {
        idx = i as 0 | 1 | 2 | 3;
        break;
      }
    }
    return idx;
  }

  tier(defId: ID): CognitionTier {
    return enemyDef(defId).tiers[this.tierIndex(defId)];
  }

  /** 本档及以下解锁的全部动作 */
  unlockedActions(defId: ID): Set<ID> {
    if (!hasEnemyDef(defId)) return new Set();
    const def = enemyDef(defId);
    const idx = this.tierIndex(defId);
    const out = new Set<ID>();
    for (let i = 0; i <= idx; i++) for (const a of def.tiers[i].unlocks) out.add(a);
    return out;
  }

  /** 玩家对某敌人是否知道它靠什么感知。不知道就只能靠试错 */
  sensesKnown(defId: ID): boolean {
    return this.tierIndex(defId) >= 1;
  }

  // -- 获取 -----------------------------------------------------------------

  /**
   * 记录一次认知获取。
   * 返回实际增量与是否跨档 —— 引擎要靠 tierUp 播报"你突然明白了那是什么"。
   */
  observe(
    defId: ID,
    source: CognitionSource,
    multiplier = 1,
  ): { gained: number; tierUp: boolean; tierIndex: 0 | 1 | 2 | 3; note: string } {
    const before = this.tierIndex(defId);
    const rec = this.data.get(defId) ?? {};
    const had = rec[source] ?? 0;
    const room = Math.max(0, SOURCE_CAP[source] - had);
    const gained = Math.min(room, SOURCE_STEP[source] * multiplier);
    if (gained > 0) {
      rec[source] = had + gained;
      this.data.set(defId, rec);
    }
    const after = this.tierIndex(defId);
    const def = enemyDef(defId);
    let note: string;
    if (after > before) {
      note = `——你对它的理解变了。它不叫「${def.tiers[before].name}」。它叫「${def.tiers[after].name}」。`;
    } else if (gained <= 0.0001) {
      note = '这个角度你已经看尽了。换个办法。';
    } else {
      note = '你又记下了一点。还不够。';
    }
    return { gained, tierUp: after > before, tierIndex: after, note };
  }

  /** 直接注入（读档、或叙事系统给的档案奖励） */
  grant(defId: ID, source: CognitionSource, amount: number): void {
    const rec = this.data.get(defId) ?? {};
    rec[source] = Math.min(SOURCE_CAP[source], (rec[source] ?? 0) + amount);
    this.data.set(defId, rec);
  }

  // -- 视图 -----------------------------------------------------------------

  view(defId: ID): EntityView {
    const def = enemyDef(defId);
    const idx = this.tierIndex(defId);
    const tier = def.tiers[idx];
    return {
      defId,
      cognition: this.value(defId),
      tierIndex: idx,
      name: tier.name,
      description: tier.description,
      counsel: tier.counsel,
      chartFidelity: tier.chartFidelity,
      chart: this.chart(def, idx, tier.chartFidelity),
      unlocked: Array.from(this.unlockedActions(defId)),
      sensesKnown: idx >= 1,
    };
  }

  /**
   * 部位图。保真度低于 0.55 时，图上会缺真部位、并混入 phantom 条目。
   * phantom 条目的数量与内容由 defId 哈希决定 —— 同一只怪，玩家每轮回看到的是**同一个错觉**，
   * 所以错觉本身是可以被推翻的知识，而不是随机噪音。
   */
  private chart(def: EnemyDef, idx: number, fidelity: number): PartChartEntry[] {
    const out: PartChartEntry[] = [];
    for (const p of def.parts) {
      const known = idx >= p.revealAt;
      // 保真度不足时，高 revealAt 的部位干脆不出现在图上
      if (!known && p.revealAt >= 2 && fidelity < 0.5) continue;
      out.push({
        id: p.id,
        name: known ? p.name : p.falseName,
        phantom: false,
        hpVisible: fidelity >= 0.6,
        armorVisible: fidelity >= 0.8,
        describe: known ? p.describe : this.falseDescribe(def, p),
      });
    }
    const phantomCount = fidelity >= 0.55 ? 0 : fidelity >= 0.3 ? 1 : 2;
    const h = hash(def.id);
    for (let i = 0; i < phantomCount; i++) {
      const pick = PHANTOM_PARTS[(h + i * 2654435761) % PHANTOM_PARTS.length];
      out.push({
        id: `phantom.${def.id}.${i}`,
        name: pick.name,
        phantom: true,
        hpVisible: false,
        armorVisible: false,
        describe: pick.describe,
      });
    }
    return out;
  }

  private falseDescribe(def: EnemyDef, p: PartDef): string {
    const h = (hash(def.id + p.id) % 4) as 0 | 1 | 2 | 3;
    switch (h) {
      case 0:
        return `你只摸到轮廓。你猜那是${p.falseName}，因为它在那个位置应该是。`;
      case 1:
        return `回波在这里变钝。你把它记成了${p.falseName}。`;
      case 2:
        return `手灯照到它的时候，你先看到的是${p.falseName}。你没有看第二眼。`;
      default:
        return `这一块你判断不了。图上写着${p.falseName}，那是你自己写的。`;
    }
  }

  /** 某个 chart 条目 id 是否是玩家的臆想 */
  isPhantomPart(partId: ID): boolean {
    return partId.startsWith('phantom.');
  }

  // -- 存档 -----------------------------------------------------------------

  serialize(): Record<ID, Partial<Record<CognitionSource, number>>> {
    return Object.fromEntries(this.data);
  }

  hydrate(data: unknown): void {
    this.data.clear();
    if (!data || typeof data !== 'object') return;
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (typeof v === 'number') {
        // 兼容 MetaProgress.bestiary 的扁平格式
        this.data.set(k, { archive: Math.min(SOURCE_CAP.archive, v) });
      } else if (v && typeof v === 'object') {
        const rec: Partial<Record<CognitionSource, number>> = {};
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          if (typeof sv === 'number' && sk in SOURCE_CAP) rec[sk as CognitionSource] = sv;
        }
        this.data.set(k, rec);
      }
    }
  }

  private hydrateFlat(flat: Record<ID, number>): void {
    for (const [k, v] of Object.entries(flat)) {
      // 扁平值按"档案阅读"记入，保证跨版本读档不丢进度
      this.data.set(k, { archive: Math.min(SOURCE_CAP.archive, v) });
    }
  }

  /** 导出成 MetaProgress.bestiary 需要的扁平形状 */
  toBestiary(): Record<ID, number> {
    const out: Record<ID, number> = {};
    for (const k of this.data.keys()) out[k] = Number(this.value(k).toFixed(4));
    return out;
  }
}
