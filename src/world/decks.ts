/**
 * world/decks.ts — 五层甲板的规格表（GDD §6.1）
 *
 * 为什么把参数集中在这里：生成器不该内嵌任何「魔法数字」。
 * 调优 1000 次统计时我只改这张表，算法代码一行不动 —— 这是可调参性的前提。
 */

import type { AmbientConditions, RoomArchetype } from '../core/contract';
import { pressureAt } from '../core/util';
import type { DeckSpec } from './types';

/** 船体已断裂并卡在海沟壁上，所以「下层」是真的更深 */
export const DECK_DEPTH: readonly number[] = [0, 340, 720, 1120, 1600, 2100];

function amb(o: Partial<AmbientConditions> & { depth: number }): AmbientConditions {
  return {
    flooding: o.flooding ?? 0,
    pressure: o.pressure ?? pressureAt(o.depth),
    temperature: o.temperature ?? 4,
    airQuality: o.airQuality ?? 0.6,
    noiseFloor: o.noiseFloor ?? 0.15,
    presence: o.presence ?? 0.1,
  };
}

export const DECKS: readonly DeckSpec[] = [
  {
    deck: 1,
    code: 'D1',
    name: '生活层 HABITATION',
    theme: '铺位、食堂、医务室',
    tone: '人味残留。这一层最像「船」，也最像案发现场。它在教你规则。',
    depth: DECK_DEPTH[1],
    ambient: amb({
      depth: DECK_DEPTH[1],
      flooding: 0.05,
      temperature: 11,
      airQuality: 0.74,
      noiseFloor: 0.12,
      presence: 0.08,
    }),
    anchors: ['bunks', 'galley', 'medbay', 'airlock'],
    weights: [
      ['corridor', 30],
      ['bulkhead', 16],
      ['bunks', 12],
      ['galley', 7],
      ['medbay', 6],
      ['crawlspace', 6],
      ['flooded', 5],
      ['airlock', 3],
      ['archive', 3],
      ['observation', 2],
      ['void', 1],
    ],
    spineArchetypes: [
      ['corridor', 62],
      ['bulkhead', 30],
      ['flooded', 8],
    ],
    floodBias: 0.35,
    crawlways: [1, 2],
    secrets: [1, 2],
    descents: [2, 3],
    instabilityBias: 0.08,
  },
  {
    deck: 2,
    code: 'D2',
    name: '机械层 MACHINERY',
    theme: '引擎、配电、压载',
    tone: '解谜密度最高，噪音最大。这里的每一个决定都会被整条船听见。',
    depth: DECK_DEPTH[2],
    ambient: amb({
      depth: DECK_DEPTH[2],
      flooding: 0.18,
      temperature: 17,
      airQuality: 0.5,
      noiseFloor: 0.36,
      presence: 0.14,
    }),
    anchors: ['engine', 'reactor', 'ballast', 'torpedo'],
    weights: [
      ['corridor', 24],
      ['bulkhead', 18],
      ['engine', 12],
      ['ballast', 11],
      ['crawlspace', 10],
      ['flooded', 10],
      ['torpedo', 6],
      ['reactor', 5],
      ['medbay', 3],
      ['void', 2],
    ],
    spineArchetypes: [
      ['corridor', 46],
      ['bulkhead', 34],
      ['engine', 12],
      ['flooded', 10],
    ],
    floodBias: 0.62,
    crawlways: [2, 4],
    secrets: [1, 2],
    descents: [2, 3],
    instabilityBias: 0.14,
  },
  {
    deck: 3,
    code: 'D3',
    name: '指挥层 COMMAND',
    theme: '舰桥、声呐室、档案',
    tone: '信息层。真相在这里，但它是用别人的笔迹写的。',
    depth: DECK_DEPTH[3],
    ambient: amb({
      depth: DECK_DEPTH[3],
      flooding: 0.1,
      temperature: 8,
      airQuality: 0.62,
      noiseFloor: 0.16,
      presence: 0.3,
    }),
    anchors: ['bridge', 'sonar-room', 'archive', 'observation'],
    weights: [
      ['corridor', 26],
      ['bulkhead', 15],
      ['archive', 13],
      ['sonar-room', 9],
      ['observation', 9],
      ['bridge', 6],
      ['crawlspace', 8],
      ['flooded', 7],
      ['medbay', 4],
      ['chapel', 3],
      ['void', 3],
    ],
    spineArchetypes: [
      ['corridor', 58],
      ['bulkhead', 30],
      ['archive', 8],
    ],
    floodBias: 0.4,
    crawlways: [2, 3],
    secrets: [2, 3],
    descents: [2, 3],
    instabilityBias: 0.22,
  },
  {
    deck: 4,
    code: 'D4',
    name: '圣所层 SANCTUM',
    theme: '礼拜堂、圣物室、观测窗',
    tone: '教团层。仪式与抉择。这里没有人在逃 —— 他们是走下来的。',
    depth: DECK_DEPTH[4],
    ambient: amb({
      depth: DECK_DEPTH[4],
      flooding: 0.3,
      temperature: 5,
      airQuality: 0.46,
      noiseFloor: 0.09,
      presence: 0.6,
    }),
    anchors: ['chapel', 'reliquary', 'observation'],
    weights: [
      ['corridor', 20],
      ['chapel', 14],
      ['reliquary', 12],
      ['bulkhead', 11],
      ['flooded', 11],
      ['observation', 9],
      ['void', 8],
      ['crawlspace', 7],
      ['archive', 5],
      ['medbay', 3],
    ],
    spineArchetypes: [
      ['corridor', 48],
      ['bulkhead', 24],
      ['chapel', 16],
      ['flooded', 12],
    ],
    floodBias: 0.78,
    crawlways: [2, 3],
    secrets: [2, 3],
    descents: [2, 2],
    instabilityBias: 0.34,
  },
  {
    deck: 5,
    code: 'D5',
    name: '月池层 MOONPOOL',
    theme: '通往外面',
    tone: '终局。非欧最强。这一层的墙壁不承诺自己明天还在原处。',
    depth: DECK_DEPTH[5],
    ambient: amb({
      depth: DECK_DEPTH[5],
      flooding: 0.55,
      temperature: 2.5,
      airQuality: 0.34,
      noiseFloor: 0.22,
      presence: 0.82,
    }),
    anchors: ['moonpool', 'airlock', 'void'],
    weights: [
      ['flooded', 22],
      ['corridor', 16],
      ['void', 14],
      ['moonpool', 10],
      ['airlock', 9],
      ['bulkhead', 9],
      ['reliquary', 7],
      ['crawlspace', 6],
      ['observation', 5],
      ['chapel', 4],
    ],
    spineArchetypes: [
      ['flooded', 38],
      ['corridor', 30],
      ['bulkhead', 18],
      ['void', 14],
    ],
    floodBias: 0.95,
    crawlways: [1, 2],
    secrets: [1, 2],
    descents: [0, 0],
    instabilityBias: 0.46,
  },
];

export function deckSpec(deck: number): DeckSpec {
  const d = DECKS[Math.max(1, Math.min(DECKS.length, Math.round(deck))) - 1];
  return d;
}

export function deckDepth(deck: number): number {
  return DECK_DEPTH[Math.max(1, Math.min(5, Math.round(deck)))] ?? DECK_DEPTH[5];
}

/**
 * 各原型在脊柱上的「理想位置」0..1（0 = 入口端，1 = 下潜端）。
 * 生成器用它做加权放置：食堂靠入口、压载靠尾、圣物室靠尽头。
 * 这就是「加权图生长」里的权重来源之一，也是为什么生成的船读起来像船
 * 而不是像随机散点。
 */
export const SPINE_AFFINITY: Readonly<Record<RoomArchetype, number>> = {
  airlock: 0.02,
  bunks: 0.16,
  galley: 0.24,
  medbay: 0.34,
  corridor: 0.5,
  bulkhead: 0.5,
  crawlspace: 0.55,
  'sonar-room': 0.42,
  bridge: 0.2,
  archive: 0.6,
  observation: 0.74,
  engine: 0.7,
  reactor: 0.82,
  ballast: 0.86,
  torpedo: 0.3,
  flooded: 0.78,
  chapel: 0.62,
  reliquary: 0.9,
  moonpool: 0.96,
  void: 0.88,
};

/** 原型在 ASCII 预览里的字形。单字符，便于终端对齐 */
export const ARCHETYPE_GLYPH: Readonly<Record<RoomArchetype, string>> = {
  corridor: '=',
  bulkhead: 'H',
  engine: 'E',
  reactor: 'R',
  galley: 'G',
  bunks: 'b',
  medbay: '+',
  'sonar-room': 'S',
  bridge: 'B',
  torpedo: 'T',
  ballast: 'L',
  chapel: 'C',
  archive: 'A',
  moonpool: 'O',
  flooded: '~',
  crawlspace: ':',
  airlock: 'K',
  void: '.',
  reliquary: 'Y',
  observation: 'W',
};

export const ARCHETYPE_LABEL: Readonly<Record<RoomArchetype, string>> = {
  corridor: '通道',
  bulkhead: '隔舱',
  engine: '引擎',
  reactor: '反应堆',
  galley: '食堂',
  bunks: '铺位',
  medbay: '医务室',
  'sonar-room': '声呐室',
  bridge: '舰桥',
  torpedo: '鱼雷',
  ballast: '压载',
  chapel: '礼拜堂',
  archive: '档案',
  moonpool: '月池',
  flooded: '淹水区',
  crawlspace: '爬管',
  airlock: '气闸',
  void: '虚舱',
  reliquary: '圣物室',
  observation: '观测',
};
