/**
 * 制作产物。GDD §4.6 的四条关键制作链在这里各有一组终端产物：
 *
 *   制氧链  soda-lime / chlorate → 滤罐、氧烛、充压瓶、长效碱罐   —— 直接买呼吸
 *   照明链  magnesium / filament → 照明弹、长燃火炬、修复灯、发电灯 —— 买视野，付噪音
 *   静默链  tallow / canvas      → 消音包裹、软底鞋套、门缝填料    —— 买"不被听见"
 *   锚定链  mirror / photo / 血  → 现实锚、血锚、声音锚、蜡封记忆  —— 买 SAN，付 Stigma
 *
 * 四条链互相挤占同一批原料（布、油脂、电池），所以"做什么"是一个真实的取舍。
 */

import { mk, type GameItem } from './helpers';

export const CRAFTED: readonly GameItem[] = [
  // ---- 制氧链 -------------------------------------------------------------
  mk('it.scrubber-cartridge', '制氧滤罐', 'consumable', 1.6, 0.3, '碱石灰压进面罩滤罐，接口用胶带缠了三圈。它买回来的时间以呼吸计。', {
    tags: ['oxygen-chain', 'crafted', 'gear'],
    onUse: [
      { op: 'vital', stat: 'oxygen', delta: 180 },
      { op: 'vital', stat: 'co2', delta: -30 },
    ],
  }),
  mk('it.long-scrubber', '长效碱罐', 'consumable', 2.4, 0.3, '碱石灰混了鲸脂，吸收速度慢但总量大。它重，但它顶得久。', {
    tags: ['oxygen-chain', 'crafted'],
    onUse: [
      { op: 'vital', stat: 'oxygen', delta: 300 },
      { op: 'vital', stat: 'co2', delta: -45 },
      { op: 'status', effect: 'st.heavy-pack', duration: 120 },
    ],
  }),
  mk('it.oxygen-candle', '氧烛', 'consumable', 1.9, 0.2, '氯酸盐砖加铁粉，点燃后放氧十二分钟。它很亮、很热、很响 —— 它把整个舱变成一个信号。', {
    tags: ['oxygen-chain', 'crafted', 'light', 'loud'],
    noise: 24,
    light: 0.5,
    onUse: [
      { op: 'vital', stat: 'oxygen', delta: 240 },
      { op: 'vital', stat: 'coreTemp', delta: 1.1 },
      { op: 'noise', amount: 24 },
    ],
  }),
  mk('it.charged-bottle', '充压氧瓶', 'consumable', 5.8, 0.9, '滤罐接上气瓶，压到八十个大气压。它是你能带的最大一笔氧气存款，也是最重的。', {
    tags: ['oxygen-chain', 'crafted', 'metal', 'heavy'],
    onUse: [
      { op: 'vital', stat: 'oxygen', delta: 420 },
      { op: 'vital', stat: 'co2', delta: -20 },
    ],
  }),

  // ---- 照明链 -------------------------------------------------------------
  mk('it.magnesium-flare', '镁照明弹', 'consumable', 0.5, 0.2, '镁条绑引信。烧四秒，照亮一整片区域，并且把那片区域的位置广播给一切。', {
    tags: ['light-chain', 'crafted', 'light', 'loud', 'fire'],
    noise: 30,
    light: 1,
    onUse: [
      { op: 'noise', amount: 30 },
      { op: 'vital', stat: 'san', delta: 3 },
      { op: 'sfx', cue: 'flare-ignite' },
    ],
  }),
  mk('it.long-torch', '长燃火炬', 'consumable', 0.9, 0.25, '镁条缠钢丝、浸石蜡。烧九十次呼吸，亮度中等，不会瞬间瞎掉你自己。', {
    tags: ['light-chain', 'crafted', 'light', 'fire'],
    noise: 8,
    light: 0.6,
    onUse: [
      { op: 'status', effect: 'st.torchlit', duration: 90 },
      { op: 'noise', amount: 8 },
    ],
  }),
  mk('it.repaired-lamp', '修复手灯', 'tool', 1.2, 0.25, '换了灯丝和电池的手灯，光稳了。它现在是这条船上最可靠的东西，这句话说明了这条船的状况。', {
    tags: ['light-chain', 'crafted', 'light', 'gear'],
    durability: 200,
    light: 0.7,
    stackable: false,
  }),
  mk('it.dynamo-lamp', '无电池灯', 'tool', 3.4, 0.7, '手摇发电机直接驱动灯丝。永远有电，摇的时候永远有声音。', {
    tags: ['light-chain', 'crafted', 'light', 'loud', 'metal'],
    durability: 400,
    light: 0.5,
    noise: 16,
    stackable: false,
  }),

  // ---- 静默链 -------------------------------------------------------------
  mk('it.silence-wrap', '消音包裹', 'tool', 0.7, 0.02, '油脂浸透的布卷。把背包里所有金属缠一遍，你走路就不再自带伴奏。', {
    tags: ['silence-chain', 'crafted', 'mask'],
    durability: 6,
    masks: { sound: 0.45 },
    stackable: false,
  }),
  mk('it.soft-soles', '软底鞋套', 'tool', 0.5, 0.01, '橡胶垫剪成脚形，用布条绑在靴子上。钢板上的每一步从"当"变成"嗒"。', {
    tags: ['silence-chain', 'crafted', 'mask'],
    durability: 12,
    masks: { vibration: 0.4, sound: 0.2 },
    stackable: false,
  }),
  mk('it.door-packing', '门缝填料', 'consumable', 0.35, 0.01, '海绵混油脂塞进门缝。开门的那一声从三个舱段可闻变成一个舱段可闻。', {
    tags: ['silence-chain', 'crafted'],
    onUse: [{ op: 'status', effect: 'st.quiet-hinges', duration: 120 }],
  }),
  mk('it.corpse-grease', '尸油', 'consumable', 0.8, 0.02, '鲸脂与牛脂熬在一起，凉了以后是灰白的。抹在皮肤上，你的温度和味道都往后退一步。', {
    tags: ['silence-chain', 'crafted', 'mask', 'organic'],
    masks: { heat: 0.4 },
    falseName: '圣膏',
    onUse: [
      { op: 'status', effect: 'st.greased', duration: 80 },
      { op: 'vital', stat: 'san', delta: -3 },
    ],
  }),

  // ---- 锚定链 -------------------------------------------------------------
  mk('it.reality-anchor', '现实锚', 'relic', 0.6, 0.15, '镜片、照片、一点血，用蜡固定在一起。看着它，镜子里的脸和照片上的脸必须是同一个人。', {
    tags: ['anchor-chain', 'crafted', 'mental'],
    durability: 3,
    stackable: false,
    falseName: '别人的脸',
    onUse: [
      { op: 'vital', stat: 'san', delta: 20 },
      { op: 'vital', stat: 'fear', delta: -18 },
      { op: 'stigma', stigma: 'flesh', delta: 1 },
    ],
  }),
  mk('it.blood-anchor', '血锚', 'relic', 0.7, 0.15, '现实锚用礼刀重新划过一次，血是新的。它更有效，而且它开始像一件教团的东西。', {
    tags: ['anchor-chain', 'crafted', 'mental', 'ritual'],
    durability: 4,
    stackable: false,
    onUse: [
      { op: 'vital', stat: 'san', delta: 34 },
      { op: 'vital', stat: 'fear', delta: -26 },
      { op: 'stigma', stigma: 'flesh', delta: 2 },
      { op: 'stigma', stigma: 'listening', delta: 1 },
    ],
  }),
  mk('it.voice-anchor', '声音锚', 'relic', 0.9, 0.2, '母亲的录音带接上铜线和耳机。听的时候必须确认那个声音有换气 —— 录音里的人会换气。', {
    tags: ['anchor-chain', 'crafted', 'mental'],
    durability: 5,
    stackable: false,
    onUse: [
      { op: 'vital', stat: 'san', delta: 16 },
      { op: 'vital', stat: 'fear', delta: -20 },
      { op: 'flag-add', key: 'count.listened-to-mother', delta: 1 },
    ],
  }),
  mk('it.wax-memory', '蜡封记忆', 'relic', 0.3, 0.02, '照片封在石蜡里。它不会再被水泡坏，也不会再被改写 —— 后一条才是重点。', {
    tags: ['anchor-chain', 'crafted', 'mental'],
    stackable: false,
    onUse: [
      { op: 'vital', stat: 'san', delta: 11 },
      { op: 'status', effect: 'st.anchored-memory', duration: 200 },
    ],
  }),

  // ---- 战术产物 -----------------------------------------------------------
  mk('it.acid-flask', '酸瓶', 'consumable', 0.55, 0.15, '苯酚兑水装进空瓶。泼在甲壳上会冒白烟，泼在手上也会。', {
    tags: ['crafted', 'chemical', 'corrosive', 'glass'],
    noise: 6,
    power: 5,
    pierce: 12,
    onUse: [{ op: 'noise', amount: 6 }],
  }),
  mk('it.clicker-decoy', '声饵', 'tool', 0.6, 0.1, '石子袋接上电池与铜线，会每隔几秒自己响一下。它是你唯一能"留在别处"的声音。', {
    tags: ['crafted', 'decoy', 'sound'],
    durability: 4,
    decoyChannel: 'sound',
    noise: 14,
    stackable: false,
  }),
  mk('it.strong-bait', '浓味诱饵', 'consumable', 1.3, 0.08, '诱饵肉裹上尸油，热度和气味都被放大。靠热找人的东西会先去处理它。', {
    tags: ['crafted', 'decoy', 'organic'],
    decoyChannel: 'heat',
  }),
  mk('it.hemostat-pack', '止血包', 'consumable', 0.3, 0.03, '纱布与缝合线做成的压迫包。不好看，但能让你把剩下的路走完。', {
    tags: ['crafted', 'medical'],
    onUse: [
      { op: 'vital', stat: 'trauma', delta: -22 },
      { op: 'remove-status', effect: 'st.bleeding' },
    ],
  }),
  mk('it.anti-infective', '抗感染注射', 'consumable', 0.12, 0.02, '抗生素兑碘液，浓度是靠猜的。它对那个东西有效，但只是有效一点。', {
    tags: ['crafted', 'medical'],
    onUse: [
      { op: 'vital', stat: 'infection', delta: -26 },
      { op: 'vital', stat: 'trauma', delta: 4 },
    ],
  }),
  mk('it.seal-patch', '密封补片', 'tool', 0.8, 0.1, '树脂加橡胶垫，三分钟凝固。它能让一个正在进水的舱室多给你二十次呼吸。', {
    tags: ['crafted', 'repair'],
    durability: 2,
    stackable: false,
  }),
  mk('it.heat-pad', '加热贴', 'consumable', 0.2, 0.05, '保温毯剪碎混石蜡。贴在胸口，体温回来，靠热找人的东西也会回来。', {
    tags: ['crafted', 'survival'],
    onUse: [
      { op: 'vital', stat: 'coreTemp', delta: 2.2 },
      { op: 'status', effect: 'st.hot-signature', duration: 60 },
    ],
  }),
  mk('it.directional-sonar', '定向声呐', 'tool', 2.3, 0.4, '手持声呐加了波导管，只往一个方向发。信息少一点，暴露少很多。', {
    tags: ['crafted', 'sensor', 'metal'],
    durability: 30,
    noise: 11,
    stackable: false,
  }),
  mk('it.welded-bar', '封舱铁条', 'tool', 2.0, 0.6, '焊条与螺栓做成的横杠。它能把一道门变成一面墙 —— 对你也一样。', {
    tags: ['crafted', 'metal', 'irreversible'],
    durability: 1,
    stackable: false,
  }),
];
