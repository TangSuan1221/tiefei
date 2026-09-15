/**
 * 工具。
 *
 * 注意重量与响度的相关性：船上所有好用的工具都是钢的，所以都很响。
 * "带着撬棍走路" 是一个要付噪音的决定，而不是免费的。
 */

import { mk, type GameItem } from './helpers';

export const TOOLS: readonly GameItem[] = [
  mk('it.pry-bar', '撬棍', 'tool', 3.2, 0.85, '七十公分的钢撬棍，一头扁一头弯。它能开门、能砸、能在你需要的时候变成唯一的答案。', {
    tags: ['metal', 'melee', 'pry'],
    durability: 40,
    power: 9,
    noise: 12,
    stackable: false,
  }),
  mk('it.pipe-wrench', '管钳', 'tool', 2.8, 0.8, '十四寸管钳，齿还很利。拧螺纹用，砸东西也用，砸完还能拧。', {
    tags: ['metal', 'melee'],
    durability: 44,
    power: 8,
    noise: 14,
    stackable: false,
  }),
  mk('it.hand-lamp', '手灯', 'tool', 1.1, 0.25, '防爆手灯，灯罩有裂纹。它的电量以呼吸计，不是以小时计。', {
    tags: ['light', 'gear'],
    durability: 120,
    light: 0.55,
    noise: 1,
    stackable: false,
    falseName: '提炉',
  }),
  mk('it.storm-match', '防风火柴', 'tool', 0.08, 0.02, '一盒十七根。潮了三根，剩下十四根。你会数很多次。', {
    tags: ['fire'],
    noise: 2,
  }),
  mk('it.screwdriver', '螺丝刀', 'tool', 0.4, 0.3, '一字，刃口卷了。拆格栅、挑锁、当锥子用 —— 它什么都做，什么都做不好。', {
    tags: ['metal', 'precision'],
    durability: 30,
    power: 4,
    noise: 5,
    stackable: false,
  }),
  mk('it.bolt-cutter', '断线钳', 'tool', 4.1, 1.0, '八百毫米手柄，能剪十毫米钢索。它也是全船最重的手持工具。', {
    tags: ['metal', 'heavy'],
    durability: 36,
    power: 7,
    noise: 16,
    stackable: false,
  }),
  mk('it.stethoscope', '听诊器', 'tool', 0.3, 0.06, '医务室的。贴在舱壁上能听见三层甲板以外的东西 —— 包括你不想听见的。', {
    tags: ['medical', 'sensor'],
    durability: 60,
    stackable: false,
    falseName: '听骨',
  }),
  mk('it.hand-sonar', '手持声呐', 'tool', 2.0, 0.45, '教团自制的便携发射器，握把上缠着布。它给你一张图，也给别人一个坐标。', {
    tags: ['sensor', 'loud'],
    durability: 25,
    noise: 26,
    stackable: false,
  }),
  mk('it.suture-kit', '缝合包', 'tool', 0.5, 0.12, '持针器、三根缝针、两包线。缝自己的时候手会抖，所以线要留长。', {
    tags: ['medical'],
    durability: 8,
    stackable: false,
  }),
  mk('it.crank-dynamo', '手摇发电机', 'tool', 2.6, 0.7, '摇一分钟能点灯三分钟。摇的时候它响得像在报警，因为它本来就是报警器的一部分。', {
    tags: ['power', 'metal', 'loud'],
    durability: 80,
    noise: 18,
    stackable: false,
  }),
  mk('it.pressure-gauge', '气压表', 'tool', 0.35, 0.2, '拆下来的舱压表，还准。它是你判断"门后面是不是水"的唯一办法。', {
    tags: ['sensor', 'metal'],
    stackable: false,
  }),
  mk('it.whetstone', '磨石', 'tool', 0.5, 0.05, '两面粗细不同。磨刀的声音很轻，但要磨很久。', {
    tags: ['craft'],
    durability: 20,
    stackable: false,
  }),
  mk('it.rope-coil', '缆绳', 'tool', 2.4, 0.15, '十五米，三股麻绳，中段有一处磨损。你会在心里给那处磨损留余量。', {
    tags: ['fabric', 'utility'],
    durability: 30,
    stackable: false,
  }),
  mk('it.hydraulic-jack', '液压千斤顶', 'tool', 6.2, 1.1, '两吨位，行程很短。它能把变形的舱门顶开一条缝，代价是全船都知道你在顶。', {
    tags: ['metal', 'heavy', 'loud'],
    durability: 12,
    noise: 22,
    stackable: false,
  }),
  mk('it.dry-bag', '防水袋', 'tool', 0.4, 0.08, '卷口式防水袋，二十升。装纸的东西全靠它 —— 这条船上纸比钢值钱。', {
    tags: ['utility', 'fabric'],
    stackable: false,
  }),
  mk('it.valve-handwheel', '阀门手轮', 'tool', 1.8, 0.6, '拆下来的手轮，直径三十公分。船上的阀门手轮都被拆走了，你手上这个是谁留下的？', {
    tags: ['metal', 'key-like'],
    stackable: false,
  }),
  mk('it.welding-rods', '焊条与火钳', 'tool', 2.2, 0.75, '一把焊条加一把火钳。没有焊机，但有火就能把门封死 —— 封死以后你也过不去。', {
    tags: ['metal', 'repair', 'irreversible'],
    durability: 6,
    noise: 20,
    stackable: false,
  }),
  mk('it.chart-dividers', '海图分规', 'tool', 0.12, 0.09, '黄铜分规，两脚都很尖。它量过的坐标里有一个在海图上是空白。', {
    tags: ['metal', 'precision', 'navigation'],
    power: 3,
    stackable: false,
  }),
  mk('it.grease-gun', '黄油枪', 'tool', 1.3, 0.4, '手动黄油枪，还剩半管。给铰链上油，门就不会在你身后喊一声。', {
    tags: ['metal', 'silence-chain'],
    durability: 10,
    stackable: false,
  }),
];
