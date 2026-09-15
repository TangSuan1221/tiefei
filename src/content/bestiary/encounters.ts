/**
 * 遭遇预设。
 *
 * 一个预设不只是"放几只怪"，它同时规定了**这一场的初始资源局面**：
 * 起始光照、可否逃脱、噪音阈值、开局相位。
 * 同一只敌人放在"黑暗的淹水舱"和"亮着的礼拜堂"里是两场完全不同的遭遇，
 * 所以敌人数 × 场景条件才是真实的内容量。
 */

import type { ID } from '../../core/contract';

export interface EncounterPreset {
  id: ID;
  /** 场景名，进遭遇时播报 */
  title: string;
  entities: readonly ID[];
  /** 初始光照 0..1 */
  light: number;
  escapable: boolean;
  /** 本场噪音上限，越过则 THE LISTENER 开始接近 */
  noiseThreshold: number;
  startPhase: 'stalk' | 'contact';
  /** 敌人的初始觉察度 */
  initialAwareness: number;
  /** 初始距离档 */
  initialBand: 'unknown' | 'far' | 'near' | 'adjacent' | 'contact';
  /** 环境给玩家的天然掩蔽（淹水舱压低热signature，机舱底噪掩盖声音） */
  ambientMask?: Partial<Record<'sound' | 'heat' | 'vibration' | 'faith' | 'light', number>>;
  intro: string;
}

export const ENCOUNTERS: readonly EncounterPreset[] = [
  {
    id: 'enc.d1.watch-standing',
    title: 'D1 · 三班的铺位',
    entities: ['ent.drowned-crew'],
    light: 0.35,
    escapable: true,
    noiseThreshold: 110,
    startPhase: 'stalk',
    initialAwareness: 0.05,
    initialBand: 'far',
    intro: '水到小腿。上铺的帘子都拉着，只有一张没拉。',
  },
  {
    id: 'enc.d1.galley-hymn',
    title: 'D1 · 食堂',
    entities: ['ent.choir-throat'],
    light: 0.5,
    escapable: true,
    noiseThreshold: 95,
    startPhase: 'stalk',
    initialAwareness: 0.12,
    initialBand: 'near',
    intro: '长桌摆好了十一份餐具，全部朝同一个方向。歌声从厨房那边来。',
  },
  {
    id: 'enc.d1.crawlspace-voice',
    title: 'D1 · 爬行管道',
    entities: ['ent.pipe-dweller'],
    light: 0.08,
    escapable: true,
    noiseThreshold: 70,
    startPhase: 'stalk',
    initialAwareness: 0.2,
    initialBand: 'near',
    ambientMask: { light: 0.9 },
    intro: '管道内径六十公分，你只能爬。它在你前面还是后面，取决于你相信哪一侧的声音。',
  },
  {
    id: 'enc.d2.engine-host',
    title: 'D2 · 主机舱',
    entities: ['ent.symbiote-host'],
    light: 0.25,
    escapable: true,
    noiseThreshold: 150,
    startPhase: 'stalk',
    initialAwareness: 0.08,
    initialBand: 'far',
    // 机舱底噪很大，这是全船最适合发出声音的地方
    ambientMask: { sound: 0.45 },
    intro: '主机还在低速转，整个舱在共振。这里可以放心出声 —— 但热的东西藏不住。',
  },
  {
    id: 'enc.d2.bilge-tide',
    title: 'D2 · 舱底走道',
    entities: ['ent.bilge-brood'],
    light: 0.15,
    escapable: true,
    noiseThreshold: 130,
    startPhase: 'contact',
    initialAwareness: 0.5,
    initialBand: 'near',
    intro: '水面的那层东西已经铺到你脚背。它是从两个方向同时来的。',
  },
  {
    id: 'enc.d2.ballast-lung',
    title: 'D2 · 压载舱',
    entities: ['ent.iron-lung'],
    light: 0.4,
    escapable: true,
    noiseThreshold: 160,
    startPhase: 'stalk',
    initialAwareness: 0.3,
    initialBand: 'near',
    intro: '风箱在响。舱内的空气一直在往一个方向走，而那个方向不是通风口。',
  },
  {
    id: 'enc.d2.deacon-and-brood',
    title: 'D2 · 配电间',
    entities: ['ent.silent-deacon', 'ent.bilge-brood'],
    light: 0.2,
    escapable: true,
    noiseThreshold: 120,
    startPhase: 'stalk',
    initialAwareness: 0.15,
    initialBand: 'far',
    intro: '斧痕从配电柜一直划到地板。柜门后面的水在动，不是因为船在晃。',
  },
  {
    id: 'enc.d3.sonar-room',
    title: 'D3 · 声呐室',
    entities: ['ent.sonar-parasite', 'ent.sonar-parasite'],
    light: 0.45,
    escapable: true,
    noiseThreshold: 85,
    startPhase: 'stalk',
    initialAwareness: 0.1,
    initialBand: 'near',
    intro: '十四个舱壁鼓包，编号从 01 到 14。有两个编号被划掉了 —— 划掉的那两个不在墙上。',
  },
  {
    id: 'enc.d3.corridor-plate',
    title: 'D3 · 舰桥通道',
    entities: ['ent.hull-mimic'],
    light: 0.3,
    escapable: true,
    noiseThreshold: 140,
    startPhase: 'stalk',
    initialAwareness: 0,
    initialBand: 'adjacent',
    intro: '通道两侧都是舱壁。图纸上这条通道是直的，你走的这条不是。',
  },
  {
    id: 'enc.d3.archive-mirror',
    title: 'D3 · 档案室',
    entities: ['ent.previous-you'],
    light: 0.55,
    escapable: true,
    noiseThreshold: 100,
    startPhase: 'stalk',
    initialAwareness: 0.25,
    initialBand: 'near',
    intro: '档案柜被拉开了一半，抽的顺序和你会用的顺序一样。有人先来过，而且没走远。',
  },
  {
    id: 'enc.d4.chapel-censer',
    title: 'D4 · 礼拜堂',
    entities: ['ent.censer-bearer', 'ent.choir-throat'],
    light: 0.7,
    escapable: true,
    noiseThreshold: 90,
    startPhase: 'stalk',
    initialAwareness: 0.2,
    initialBand: 'near',
    intro: '烛台全部点着，蜡烧到同一个高度。有人一直在换蜡。',
  },
  {
    id: 'enc.d4.reliquary-deacon',
    title: 'D4 · 圣物室',
    entities: ['ent.silent-deacon'],
    light: 0.12,
    escapable: false,
    noiseThreshold: 100,
    startPhase: 'contact',
    initialAwareness: 0.7,
    initialBand: 'adjacent',
    intro: '门在你身后合上了，是他关的。圣物室只有一道门。',
  },
  {
    id: 'enc.d4.six-throats',
    title: 'D4 · 唱诗席',
    entities: ['ent.choir-throat', 'ent.choir-throat', 'ent.choir-throat'],
    light: 0.6,
    escapable: true,
    noiseThreshold: 80,
    startPhase: 'stalk',
    initialAwareness: 0.3,
    initialBand: 'near',
    intro: '六个位置，间距相等。你只能同时看清三个，剩下三个在你背后的席位上。',
  },
  {
    id: 'enc.d5.moonpool-light',
    title: 'D5 · 月池',
    entities: ['ent.anglerlight'],
    light: 0.1,
    escapable: true,
    noiseThreshold: 120,
    startPhase: 'stalk',
    initialAwareness: 0.15,
    initialBand: 'far',
    ambientMask: { heat: 0.35, vibration: 0.2 },
    intro: '月池是黑的，除了水面下三米那一点暖光。那是这条船上唯一不闪的光。',
  },
  {
    id: 'enc.d5.flooded-sanctum',
    title: 'D5 · 淹没的圣堂',
    entities: ['ent.anglerlight', 'ent.drowned-crew'],
    light: 0.05,
    escapable: true,
    noiseThreshold: 110,
    startPhase: 'stalk',
    initialAwareness: 0.2,
    initialBand: 'near',
    ambientMask: { heat: 0.5, light: 0.8 },
    intro: '全淹。你得屏着气过去，而且不能开声呐 —— 水里的声呐等于举着火把。',
  },
  {
    id: 'enc.listener.approach',
    title: '· 它来了 ·',
    entities: ['ent.listener'],
    light: 0.2,
    escapable: true,
    noiseThreshold: 40,
    startPhase: 'stalk',
    initialAwareness: 0.45,
    initialBand: 'unknown',
    intro: '噪音越过了线。现在开始，你做的每一件事都在给它一个坐标。',
  },
  {
    id: 'enc.listener.sanctum',
    title: '· 它一直在这里 ·',
    entities: ['ent.listener', 'ent.choir-throat'],
    light: 0.0,
    escapable: true,
    noiseThreshold: 30,
    startPhase: 'stalk',
    initialAwareness: 0.6,
    initialBand: 'near',
    intro: '歌声是坐标。只要有人在唱，它就不需要你出声。',
  },
];

const BY_ID = new Map<ID, EncounterPreset>(ENCOUNTERS.map((e) => [e.id, e]));

export function encounterPreset(id: ID): EncounterPreset | undefined {
  return BY_ID.get(id);
}
