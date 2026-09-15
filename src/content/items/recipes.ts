/**
 * 配方。
 *
 * 每条配方都要付三种代价：原料、呼吸、噪音。
 * 噪音这一列是本作特有的：在被追的时候你**做不了东西** ——
 * 焊一根封舱铁条要 34 点噪音，那等于主动把 THE LISTENER 叫过来。
 * `station` 把一部分配方钉死在特定舱段，让"回头去机舱做东西"成为一个真实的路线决策。
 */

import type { Recipe } from '../../core/contract';

export const RECIPES: readonly Recipe[] = [
  // ---- 制氧链 -------------------------------------------------------------
  {
    id: 'rec.oxy.scrubber',
    name: '压制制氧滤罐',
    inputs: [
      { item: 'it.soda-lime', count: 2 },
      { item: 'it.rebreather-mask', count: 1 },
    ],
    output: { item: 'it.scrubber-cartridge', count: 1 },
    cost: 14,
    noise: 6,
  },
  {
    id: 'rec.oxy.long-scrubber',
    name: '熬长效碱罐',
    inputs: [
      { item: 'it.soda-lime', count: 3 },
      { item: 'it.whale-fat', count: 1 },
      { item: 'it.canvas-strip', count: 1 },
    ],
    output: { item: 'it.long-scrubber', count: 1 },
    cost: 22,
    noise: 9,
    station: 'galley',
  },
  {
    id: 'rec.oxy.candle',
    name: '浇氧烛',
    inputs: [
      { item: 'it.chlorate-salt', count: 1 },
      { item: 'it.iron-filings', count: 1 },
      { item: 'it.rock-salt', count: 1 },
    ],
    output: { item: 'it.oxygen-candle', count: 1 },
    cost: 18,
    noise: 12,
    station: 'engine',
  },
  {
    id: 'rec.oxy.charge-bottle',
    name: '给气瓶充压',
    inputs: [
      { item: 'it.scrubber-cartridge', count: 1 },
      { item: 'it.pressure-bottle', count: 1 },
    ],
    output: { item: 'it.charged-bottle', count: 1 },
    cost: 26,
    noise: 20,
    station: 'ballast',
  },

  // ---- 照明链 -------------------------------------------------------------
  {
    id: 'rec.light.flare',
    name: '绑镁照明弹',
    inputs: [
      { item: 'it.magnesium-ribbon', count: 1 },
      { item: 'it.fuse-cord', count: 1 },
    ],
    output: { item: 'it.magnesium-flare', count: 1 },
    cost: 8,
    noise: 3,
  },
  {
    id: 'rec.light.torch',
    name: '做长燃火炬',
    inputs: [
      { item: 'it.magnesium-ribbon', count: 1 },
      { item: 'it.steel-wire', count: 1 },
      { item: 'it.paraffin', count: 1 },
    ],
    output: { item: 'it.long-torch', count: 1 },
    cost: 16,
    noise: 5,
  },
  {
    id: 'rec.light.repair-lamp',
    name: '修手灯',
    inputs: [
      { item: 'it.hand-lamp', count: 1 },
      { item: 'it.dry-cell', count: 1 },
      { item: 'it.filament', count: 1 },
    ],
    output: { item: 'it.repaired-lamp', count: 1 },
    cost: 12,
    noise: 4,
  },
  {
    id: 'rec.light.dynamo-lamp',
    name: '接无电池灯',
    inputs: [
      { item: 'it.crank-dynamo', count: 1 },
      { item: 'it.copper-wire', count: 2 },
      { item: 'it.filament', count: 1 },
    ],
    output: { item: 'it.dynamo-lamp', count: 1 },
    cost: 20,
    noise: 14,
    station: 'engine',
  },
  {
    id: 'rec.light.candle-lantern',
    name: '蜡烛提灯',
    inputs: [
      { item: 'it.candle-stub', count: 2 },
      { item: 'it.mirror-shard', count: 1 },
      { item: 'it.copper-wire', count: 1 },
    ],
    output: { item: 'it.long-torch', count: 1 },
    cost: 10,
    noise: 2,
  },

  // ---- 静默链 -------------------------------------------------------------
  {
    id: 'rec.silence.wrap',
    name: '缠消音包裹',
    inputs: [
      { item: 'it.tallow', count: 1 },
      { item: 'it.canvas-strip', count: 2 },
    ],
    output: { item: 'it.silence-wrap', count: 1 },
    cost: 10,
    noise: 1,
  },
  {
    id: 'rec.silence.muffled-pipe',
    name: '改消音铁管',
    inputs: [
      { item: 'it.iron-pipe', count: 1 },
      { item: 'it.silence-wrap', count: 1 },
    ],
    output: { item: 'it.muffled-pipe', count: 1 },
    cost: 12,
    noise: 2,
  },
  {
    id: 'rec.silence.soles',
    name: '剪软底鞋套',
    inputs: [
      { item: 'it.rubber-gasket', count: 2 },
      { item: 'it.canvas-strip', count: 1 },
    ],
    output: { item: 'it.soft-soles', count: 1 },
    cost: 9,
    noise: 1,
  },
  {
    id: 'rec.silence.door-packing',
    name: '塞门缝填料',
    inputs: [
      { item: 'it.sponge-block', count: 1 },
      { item: 'it.tallow', count: 1 },
    ],
    output: { item: 'it.door-packing', count: 2 },
    cost: 7,
    noise: 1,
  },
  {
    id: 'rec.silence.grease',
    name: '熬尸油',
    inputs: [
      { item: 'it.whale-fat', count: 1 },
      { item: 'it.tallow', count: 1 },
    ],
    output: { item: 'it.corpse-grease', count: 2 },
    cost: 16,
    noise: 4,
    station: 'galley',
  },
  {
    id: 'rec.silence.hinge-grease',
    name: '给铰链上油',
    inputs: [
      { item: 'it.grease-gun', count: 1 },
      { item: 'it.tallow', count: 1 },
    ],
    output: { item: 'it.door-packing', count: 3 },
    cost: 6,
    noise: 2,
  },

  // ---- 锚定链 -------------------------------------------------------------
  {
    id: 'rec.anchor.reality',
    name: '做现实锚',
    inputs: [
      { item: 'it.mirror-shard', count: 1 },
      { item: 'it.photograph', count: 1 },
      { item: 'it.blood-bag', count: 1 },
    ],
    output: { item: 'it.reality-anchor', count: 1 },
    cost: 20,
    noise: 2,
  },
  {
    id: 'rec.anchor.blood',
    name: '重划血锚',
    inputs: [
      { item: 'it.reality-anchor', count: 1 },
      { item: 'it.ritual-knife', count: 1 },
    ],
    output: { item: 'it.blood-anchor', count: 1 },
    cost: 24,
    noise: 3,
    requires: { op: 'vital', stat: 'san', cmp: '<', value: 60 },
    station: 'chapel',
  },
  {
    id: 'rec.anchor.voice',
    name: '接声音锚',
    inputs: [
      { item: 'it.mother-tape', count: 1 },
      { item: 'it.copper-wire', count: 1 },
      { item: 'it.dry-cell', count: 1 },
    ],
    output: { item: 'it.voice-anchor', count: 1 },
    cost: 18,
    noise: 5,
  },
  {
    id: 'rec.anchor.wax',
    name: '蜡封照片',
    inputs: [
      { item: 'it.photograph', count: 1 },
      { item: 'it.paraffin', count: 1 },
    ],
    output: { item: 'it.wax-memory', count: 1 },
    cost: 11,
    noise: 1,
  },

  // ---- 战术与武器 ---------------------------------------------------------
  {
    id: 'rec.tac.acid',
    name: '兑酸',
    inputs: [
      { item: 'it.phenol', count: 1 },
      { item: 'it.fresh-water', count: 1 },
    ],
    output: { item: 'it.acid-flask', count: 2 },
    cost: 9,
    noise: 3,
    station: 'medbay',
  },
  {
    id: 'rec.tac.clicker',
    name: '装声饵',
    inputs: [
      { item: 'it.pebble-pouch', count: 1 },
      { item: 'it.copper-wire', count: 1 },
      { item: 'it.dry-cell', count: 1 },
    ],
    output: { item: 'it.clicker-decoy', count: 1 },
    cost: 14,
    noise: 6,
  },
  {
    id: 'rec.tac.strong-bait',
    name: '裹浓味诱饵',
    inputs: [
      { item: 'it.bait-flesh', count: 1 },
      { item: 'it.corpse-grease', count: 1 },
    ],
    output: { item: 'it.strong-bait', count: 1 },
    cost: 8,
    noise: 2,
  },
  {
    id: 'rec.tac.heat-pad',
    name: '做加热贴',
    inputs: [
      { item: 'it.thermal-blanket', count: 1 },
      { item: 'it.paraffin', count: 1 },
    ],
    output: { item: 'it.heat-pad', count: 2 },
    cost: 10,
    noise: 2,
  },
  {
    id: 'rec.tac.directional-sonar',
    name: '加波导管',
    inputs: [
      { item: 'it.hand-sonar', count: 1 },
      { item: 'it.iron-pipe', count: 1 },
      { item: 'it.epoxy-resin', count: 1 },
    ],
    output: { item: 'it.directional-sonar', count: 1 },
    cost: 22,
    noise: 10,
    station: 'sonar-room',
  },
  {
    id: 'rec.wep.hone-knife',
    name: '磨刀',
    inputs: [
      { item: 'it.dive-knife', count: 1 },
      { item: 'it.whetstone', count: 1 },
    ],
    output: { item: 'it.honed-knife', count: 1 },
    cost: 15,
    noise: 2,
  },
  {
    id: 'rec.wep.heavy-bolt',
    name: '焊重弩箭',
    inputs: [
      { item: 'it.spear-bolt', count: 1 },
      { item: 'it.hull-bolt', count: 1 },
      { item: 'it.solder-stick', count: 1 },
    ],
    output: { item: 'it.heavy-bolt', count: 2 },
    cost: 18,
    noise: 16,
    station: 'engine',
  },
  {
    id: 'rec.wep.tethered-harpoon',
    name: '系索鱼叉',
    inputs: [
      { item: 'it.harpoon', count: 1 },
      { item: 'it.rope-coil', count: 1 },
    ],
    output: { item: 'it.tethered-harpoon', count: 1 },
    cost: 11,
    noise: 3,
  },
  {
    id: 'rec.wep.cable-whip',
    name: '散股缆索鞭',
    inputs: [
      { item: 'it.steel-wire', count: 2 },
      { item: 'it.canvas-strip', count: 1 },
    ],
    output: { item: 'it.cable-whip', count: 1 },
    cost: 13,
    noise: 7,
  },

  // ---- 医疗与修补 ---------------------------------------------------------
  {
    id: 'rec.med.hemostat',
    name: '做止血包',
    inputs: [
      { item: 'it.gauze-roll', count: 1 },
      { item: 'it.suture-kit', count: 1 },
    ],
    output: { item: 'it.hemostat-pack', count: 2 },
    cost: 10,
    noise: 1,
  },
  {
    id: 'rec.med.anti-infective',
    name: '配抗感染注射',
    inputs: [
      { item: 'it.antibiotic', count: 1 },
      { item: 'it.iodine', count: 1 },
    ],
    output: { item: 'it.anti-infective', count: 1 },
    cost: 12,
    noise: 1,
    station: 'medbay',
  },
  {
    id: 'rec.rep.seal-patch',
    name: '压密封补片',
    inputs: [
      { item: 'it.epoxy-resin', count: 1 },
      { item: 'it.rubber-gasket', count: 1 },
    ],
    output: { item: 'it.seal-patch', count: 1 },
    cost: 13,
    noise: 4,
  },
  {
    id: 'rec.rep.weld-bar',
    name: '焊封舱铁条',
    inputs: [
      { item: 'it.welding-rods', count: 1 },
      { item: 'it.hull-bolt', count: 2 },
      { item: 'it.iron-pipe', count: 1 },
    ],
    output: { item: 'it.welded-bar', count: 1 },
    cost: 28,
    noise: 34,
    station: 'engine',
  },
];
