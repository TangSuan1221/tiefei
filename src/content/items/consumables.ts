/**
 * 天然消耗品（非制作产物）。
 *
 * 医疗品在本作里几乎都有**副作用**：吗啡压住外伤但也压住恐惧的自然衰减，
 * 氯丙嗪把 fear 拉下来但同时削掉抵抗力。没有纯收益的药 ——
 * 这条规则服务于支柱 P2「每个选择都是机会成本」。
 */

import { mk, type GameItem } from './helpers';

export const CONSUMABLES: readonly GameItem[] = [
  mk('it.atropine', '阿托品', 'consumable', 0.06, 0.03, '预充式注射器，针头护帽是黄的。打进去以后心跳会慢下来，手也会稳。', {
    tags: ['medical', 'injection', 'fear'],
    noise: 2,
    onUse: [
      { op: 'vital', stat: 'fear', delta: -22 },
      { op: 'vital', stat: 'co2', delta: 4 },
      { op: 'status', effect: 'st.atropine', duration: 40 },
    ],
  }),
  mk('it.morphine', '吗啡', 'consumable', 0.06, 0.03, '十毫克安瓿。它让外伤不再是问题，也让你不再知道自己伤到哪一步。', {
    tags: ['medical', 'injection', 'trauma'],
    noise: 2,
    falseName: '圣水',
    onUse: [
      { op: 'vital', stat: 'trauma', delta: -18 },
      { op: 'vital', stat: 'fear', delta: -6 },
      { op: 'status', effect: 'st.opiate-veil', duration: 60 },
    ],
  }),
  mk('it.caffeine-tab', '咖啡因片', 'consumable', 0.02, 0.01, '一板十片，剩六片。它换来的清醒是从后面借的。', {
    tags: ['medical', 'fatigue'],
    onUse: [
      { op: 'vital', stat: 'fatigue', delta: -25 },
      { op: 'vital', stat: 'fear', delta: 5 },
    ],
  }),
  mk('it.ephedrine', '麻黄素', 'consumable', 0.04, 0.01, '支气管扩张。呼吸会变浅变快 —— 省氧，但更容易被听见。', {
    tags: ['medical', 'oxygen'],
    onUse: [
      { op: 'vital', stat: 'oxygen', delta: 45 },
      { op: 'status', effect: 'st.shallow-breath', duration: 50 },
    ],
  }),
  mk('it.chlorpromazine', '氯丙嗪', 'consumable', 0.05, 0.02, '抗精神病药，医务室锁柜里的。船员每人每周两次 —— 记录上写着"预防性"。', {
    tags: ['medical', 'injection', 'mental'],
    onUse: [
      { op: 'vital', stat: 'fear', delta: -35 },
      { op: 'vital', stat: 'san', delta: 6 },
      { op: 'status', effect: 'st.flattened', duration: 90 },
    ],
  }),
  mk('it.stimulant-amp', '苯丙胺安瓿', 'consumable', 0.05, 0.02, '军用提神剂。它让你在接下来的一段时间里不觉得累，也不觉得害怕该有的重量。', {
    tags: ['medical', 'injection'],
    onUse: [
      { op: 'vital', stat: 'fatigue', delta: -40 },
      { op: 'vital', stat: 'fear', delta: -10 },
      { op: 'vital', stat: 'san', delta: -5 },
    ],
  }),
  mk('it.antibiotic', '抗生素', 'consumable', 0.07, 0.02, '广谱，粉剂加注射用水。它对细菌有效。你身上的那个不是细菌。', {
    tags: ['medical', 'infection'],
    onUse: [{ op: 'vital', stat: 'infection', delta: -14 }],
  }),
  mk('it.iodine', '碘液', 'consumable', 0.2, 0.04, '棕色瓶装，倒出来会顺着伤口流进去。很痛，但很老实。', {
    tags: ['medical', 'infection'],
    onUse: [
      { op: 'vital', stat: 'infection', delta: -8 },
      { op: 'vital', stat: 'trauma', delta: -4 },
    ],
  }),
  mk('it.smelling-salts', '嗅盐', 'consumable', 0.05, 0.01, '一小管碳酸铵。它能把一个正在失控的人拽回来一回合 —— 只有一回合。', {
    tags: ['medical', 'panic'],
    onUse: [
      { op: 'vital', stat: 'fear', delta: -16 },
      { op: 'vital', stat: 'co2', delta: -6 },
    ],
  }),
  mk('it.tinned-meat', '罐头肉', 'consumable', 0.45, 0.35, '午餐肉，罐底鼓起。开罐的声音在钢舱里能传两个舱段。', {
    tags: ['food', 'metal'],
    noise: 9,
    onUse: [
      { op: 'vital', stat: 'fatigue', delta: -12 },
      { op: 'vital', stat: 'san', delta: 4 },
      { op: 'vital', stat: 'coreTemp', delta: 0.3 },
    ],
  }),
  mk('it.ration-biscuit', '压缩饼干', 'consumable', 0.2, 0.05, '硬得要含化才能吃。吃它不发出声音，这是它唯一的优点。', {
    tags: ['food'],
    onUse: [
      { op: 'vital', stat: 'fatigue', delta: -7 },
      { op: 'vital', stat: 'san', delta: 2 },
    ],
  }),
  mk('it.fresh-water', '淡水', 'consumable', 0.8, 0.1, '一升水壶，还有三分之二。舱外有一整个海，所以这三分之二很贵。', {
    tags: ['food'],
    onUse: [
      { op: 'vital', stat: 'fatigue', delta: -9 },
      { op: 'vital', stat: 'co2', delta: -5 },
    ],
  }),
  mk('it.communion-wine', '圣餐酒', 'consumable', 0.7, 0.3, '半瓶。教团用它来"让喉咙松开，好唱得更久"。它确实有效。', {
    tags: ['food', 'ritual', 'glass'],
    onUse: [
      { op: 'vital', stat: 'fear', delta: -14 },
      { op: 'vital', stat: 'san', delta: -3 },
      { op: 'stigma', stigma: 'listening', delta: 1 },
    ],
  }),
  mk('it.thermal-blanket', '保温毯', 'consumable', 0.25, 0.45, '镀铝薄膜，展开有两平方米。它保住你的体温 —— 同时把你的热反射给所有在找热的东西。', {
    tags: ['survival', 'crinkly'],
    onUse: [
      { op: 'vital', stat: 'coreTemp', delta: 1.4 },
      { op: 'status', effect: 'st.wrapped-warm', duration: 70 },
    ],
  }),
  mk('it.bait-flesh', '诱饵肉', 'consumable', 1.1, 0.1, '从什么东西上割下来的一块。装在袋子里还在渗。放下它，有些东西会先去处理它。', {
    tags: ['organic', 'decoy', 'flesh'],
    decoyChannel: 'heat',
  }),
  mk('it.chalk-stick', '粉笔', 'consumable', 0.03, 0.01, '一截白粉笔。在门上画记号，下一次你就知道这道门有没有被重接过。', {
    tags: ['marking'],
  }),
];
