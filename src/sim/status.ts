/**
 * 《铁肺迷城》— 状态效果库 (Agent A)
 * ============================================================
 * GDD §9 要求 45 个，最低门槛 30。本库 63 个。
 *
 * 书写规范（内容质量是硬要求，不是装饰）：
 *   - 名字要有文学性，禁止 "debuff_01"。
 *   - 描述写成**医疗记录体**：短、冷、具体、第三人称观察语气，不解释情绪。
 *     恐怖来自"临床地陈述一件不该发生的事"，不来自形容词。
 *   - 每个效果必须同时有机械后果与叙事后果。只改数字的效果不配进这个库。
 *
 * Modifier 语义（契约没写死，本模块的约定，文档见 docs/sim-spec.md）：
 *   - op:'add' → value 直接加到基线上，多层数时按 value × stacks 线性叠加。
 *   - op:'mul' → value **就是倍率本身**（1.15 表示 +15%），多层数时按 value^stacks 叠加。
 *
 * duration 单位是呼吸；-1 表示永久（只能被治疗/仪式移除）。
 */

import type { ID, StatusEffect, StigmaKind } from '../core/contract.ts';

// ============================================================================
// 1. 物理类 —— 船会把你拆开
// ============================================================================

const PHYSICAL: StatusEffect[] = [
  {
    id: 'fx.fracture.rib',
    name: '肋骨骨裂',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.18 },
      { stat: 'meleePower', op: 'mul', value: 0.85 },
      { stat: 'stealth', op: 'mul', value: 0.9 },
    ],
    description: '右侧第七、第八肋不完全骨折。吸气至三分之二处可闻骨摩擦音。患者自述"深呼吸像有人在里面翻页"。',
  },
  {
    id: 'fx.fracture.limb',
    name: '长骨骨折',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { trauma: 0.02 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.26 },
      { stat: 'stealth', op: 'mul', value: 0.72 },
      { stat: 'meleePower', op: 'mul', value: 0.7 },
    ],
    description: '左胫骨中段横断，轻度错位。承重时有捻发音。无固定材料，患者仍在行走。',
  },
  {
    id: 'fx.hemorrhage',
    name: '持续失血',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { trauma: 0.095, fatigue: 0.03 },
    modifiers: [{ stat: 'resolve', op: 'mul', value: 0.9 }],
    description: '创口未闭合，出血呈搏动性。每一次心跳都在把他往外倒一点。需加压包扎，不可等待。',
  },
  {
    id: 'fx.hypothermia.mild',
    name: '低温症·一度',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { fatigue: 0.045, coreTemp: -0.004 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.12 },
      { stat: 'searchQuality', op: 'mul', value: 0.85 },
      { stat: 'stealth', op: 'mul', value: 0.88 },
    ],
    description: '核心温度低于 35°C。持续寒战，手部精细动作丧失。牙齿相击的声音在舱内可被听见。',
  },
  {
    id: 'fx.hypothermia.severe',
    name: '低温症·三度',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff', 'terminal'],
    tick: { coreTemp: -0.012, san: -0.02 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.32 },
      { stat: 'meleePower', op: 'mul', value: 0.6 },
      { stat: 'resolve', op: 'mul', value: 0.7 },
      { stat: 'searchQuality', op: 'mul', value: 0.5 },
    ],
    description: '寒战已停止——这不是好转，是产热机制放弃了。瞳孔对光反应迟钝。患者开始觉得热，并试图解开领口。',
  },
  {
    id: 'fx.frostbite',
    name: '冻伤',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    modifiers: [
      { stat: 'searchQuality', op: 'mul', value: 0.68 },
      { stat: 'meleePower', op: 'mul', value: 0.8 },
    ],
    description: '双手指节Ⅱ度冻伤，远端触觉丧失。他能握住东西，但不知道握住的是什么。',
  },
  {
    id: 'fx.decompression',
    name: '减压病',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { trauma: 0.055, fatigue: 0.05 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.2 },
      { stat: 'resolve', op: 'mul', value: 0.85 },
    ],
    description: '关节腔内可见气泡形成。上升速率超限。屈肘时有声音，患者说那是"骨头里有人在开汽水"。',
  },
  {
    id: 'fx.eardrum',
    name: '耳膜穿孔',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    modifiers: [
      { stat: 'sonarFidelity', op: 'mul', value: 0.55 },
      { stat: 'resolve', op: 'mul', value: 0.92 },
    ],
    description: '右侧鼓膜破裂，有血性渗出。双耳时间差失效，回波在他脑中永远偏向一侧。',
  },
  {
    id: 'fx.pulmonary-edema',
    name: '肺水肿',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff', 'terminal'],
    tick: { oxygen: -0.16, co2: 0.12 },
    modifiers: [{ stat: 'breathCost', op: 'mul', value: 1.35 }],
    description: '双肺底可闻及湿啰音，痰呈粉红色泡沫状。每一口气只有一半进得去。',
  },
  {
    id: 'fx.hypoxic-brain',
    name: '缺氧性脑损伤',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'mental', 'debuff'],
    tick: { san: -0.018 },
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -2 },
      { stat: 'searchQuality', op: 'mul', value: 0.8 },
      { stat: 'resolve', op: 'mul', value: 0.85 },
    ],
    description: '皮层缺氧持续超过四分钟。海马区受累。有些东西不会长回来了。他会开始重复自己。他会开始重复自己。',
  },
  {
    id: 'fx.burn',
    name: '烧伤',
    duration: -1,
    stacks: 2,
    tags: ['physical', 'debuff'],
    tick: { trauma: 0.03 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.08 },
      { stat: 'meleePower', op: 'mul', value: 0.85 },
    ],
    description: '左前臂Ⅱ度烫伤，面积约 6%。渗液已与袖料粘连。撕开会带下真皮。',
  },
  {
    id: 'fx.laceration',
    name: '撕裂伤',
    duration: -1,
    stacks: 3,
    tags: ['physical', 'debuff'],
    tick: { trauma: 0.022 },
    modifiers: [{ stat: 'stealth', op: 'mul', value: 0.94 }],
    description: '锐器伤，创缘整齐，深达筋膜。滴落间隔约 4 秒。它沿着他走过的路线做了标记。',
  },
  {
    id: 'fx.crush',
    name: '挤压伤',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff', 'terminal'],
    tick: { trauma: 0.12 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.22 },
      { stat: 'meleePower', op: 'mul', value: 0.8 },
    ],
    description: '外部压强超过密封余量。胸廓正在被缓慢合拢，速率约每小时 1 毫米。这个过程是不痛的。',
  },
  {
    id: 'fx.aspiration',
    name: '呛水',
    duration: 20,
    stacks: 2,
    tags: ['physical', 'debuff'],
    tick: { co2: 1.1, oxygen: -0.6, trauma: 0.05 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.4 },
      { stat: 'noiseEmission', op: 'mul', value: 1.55 },
    ],
    description: '声门下有液体。咳嗽反射不可抑制。咳嗽是有声音的，而外面的东西靠听觉活着。',
  },
  {
    id: 'fx.co2-narcosis',
    name: '二氧化碳麻醉',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'mental', 'debuff'],
    tick: { san: -0.03 },
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -1 },
      { stat: 'resolve', op: 'mul', value: 0.8 },
      { stat: 'searchQuality', op: 'mul', value: 0.7 },
    ],
    description: '血 CO2 分压过高。视野自边缘向中心收缩成隧道。此刻他做出的任何判断都不应被采信，包括这一条。',
  },
  {
    id: 'fx.exhaustion',
    name: '力竭',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { fear: 0.02 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.15 },
      { stat: 'meleePower', op: 'mul', value: 0.7 },
      { stat: 'stealth', op: 'mul', value: 0.85 },
    ],
    description: '肌糖原耗尽，乳酸堆积。站立时躯干会自行前倾，由膝关节被动锁定维持姿势。',
  },
  {
    id: 'fx.dehydration',
    name: '脱水',
    duration: -1,
    stacks: 2,
    tags: ['physical', 'debuff'],
    tick: { fatigue: 0.04 },
    modifiers: [
      { stat: 'resolve', op: 'mul', value: 0.9 },
      { stat: 'searchQuality', op: 'mul', value: 0.9 },
    ],
    description: '尿量减少，口腔黏膜干裂，皮肤弹性下降。船上有一万四千吨水，没有一滴可以喝。',
  },
  {
    id: 'fx.tinnitus',
    name: '耳鸣',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'mental', 'debuff'],
    tick: { san: -0.012 },
    modifiers: [
      { stat: 'sonarFidelity', op: 'mul', value: 0.82 },
      { stat: 'resolve', op: 'mul', value: 0.92 },
    ],
    description: '持续性 6 kHz 纯音，双侧。捂住耳朵不减弱，这证明声源在颅内。他仍然每隔一会儿就捂一次。',
  },
  {
    id: 'fx.nitrogen-narcosis',
    name: '氮醉',
    duration: 120,
    stacks: 1,
    tags: ['physical', 'mental', 'debuff'],
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -2 },
      { stat: 'resolve', op: 'mul', value: 1.18 },
      { stat: 'searchQuality', op: 'mul', value: 0.7 },
      { stat: 'noiseEmission', op: 'mul', value: 1.2 },
    ],
    description: '深度麻醉效应。患者情绪高涨，判断力受损，主诉"一切都很有意思"。这正是最危险的部分。',
  },
  {
    id: 'fx.hypoglycemia',
    name: '低血糖',
    duration: -1,
    stacks: 1,
    tags: ['physical', 'debuff'],
    tick: { fatigue: 0.06, fear: 0.03 },
    modifiers: [
      { stat: 'meleePower', op: 'mul', value: 0.82 },
      { stat: 'searchQuality', op: 'mul', value: 0.85 },
    ],
    description: '最后一次进食在 31 小时前。冷汗，手抖，视物成双。饥饿已经越过了"饿"这个阶段。',
  },
];

// ============================================================================
// 2. 精神类 —— 心灵恐怖的机械化，不是滤镜
// ============================================================================

const MENTAL: StatusEffect[] = [
  {
    id: 'fx.panic',
    name: '恐慌发作',
    duration: 40,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { fear: 0.6, co2: 0.35, oxygen: -0.2 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.25 },
      { stat: 'noiseEmission', op: 'mul', value: 1.6 },
      { stat: 'stealth', op: 'mul', value: 0.5 },
      { stat: 'searchQuality', op: 'mul', value: 0.6 },
    ],
    description: '交感神经全面接管。过度换气，手足搐搦。他的手正在替他做决定，而且做得不好。',
  },
  {
    id: 'fx.dissociation',
    name: '解离',
    duration: 80,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { san: -0.02 },
    modifiers: [
      { stat: 'resolve', op: 'mul', value: 1.42 },
      { stat: 'lucidity', op: 'add', value: -3 },
      { stat: 'searchQuality', op: 'mul', value: 0.8 },
    ],
    description: '人格解体状态。患者报告"从舱顶看着自己操作阀门"。他不再害怕了，也不再特别在乎结果。',
  },
  {
    id: 'fx.paranoia',
    name: '偏执',
    duration: 150,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { fear: 0.05, oxygen: -0.055 },
    modifiers: [
      { stat: 'stealth', op: 'mul', value: 1.16 },
      { stat: 'resolve', op: 'mul', value: 0.85 },
    ],
    description: '反复核查已核查过的舱门。每次核查消耗 4 秒与相应的氧气。他知道这一点，并且继续核查。',
  },
  {
    id: 'fx.deja-vu',
    name: '既视感',
    duration: 60,
    stacks: 1,
    tags: ['mental', 'debuff'],
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -1 },
      { stat: 'searchQuality', op: 'mul', value: 0.9 },
    ],
    description: '他确信走过这条走廊。图纸不支持这一判断。图纸此前已被证实不可靠两次。',
  },
  {
    id: 'fx.aphasia',
    name: '命名性失语',
    duration: 90,
    stacks: 1,
    tags: ['mental', 'debuff'],
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -2 },
      { stat: 'searchQuality', op: 'mul', value: 0.75 },
    ],
    description: '物体识别完好，词汇提取失败。他能拿起那个东西并正确使用它，但无法说出它叫什么。名单上他自己的那一行也一样。',
  },
  {
    id: 'fx.compulsive-listening',
    name: '强迫聆听',
    duration: -1,
    stacks: 1,
    tags: ['mental', 'infection', 'debuff'],
    tick: { san: -0.03, oxygen: -0.04 },
    modifiers: [
      { stat: 'sonarFidelity', op: 'mul', value: 1.16 },
      { stat: 'breathCost', op: 'mul', value: 1.1 },
    ],
    description: '一旦出现声源，患者必须停止一切动作直至声音结束。氧气在此期间继续消耗。他听得比任何人都清楚。',
  },
  {
    id: 'fx.claustrophobia',
    name: '幽闭恐惧发作',
    duration: 35,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { fear: 0.9, co2: 0.4 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 1.3 },
      { stat: 'stealth', op: 'mul', value: 0.7 },
    ],
    description: '主观舱壁内缩。经测量舱室尺寸无变化。认知层面知道这一点，自主神经系统拒绝接受这个说法。',
  },
  {
    id: 'fx.derealization',
    name: '现实解体',
    duration: 120,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { san: -0.022 },
    modifiers: [
      { stat: 'lucidity', op: 'add', value: -3 },
      { stat: 'resolve', op: 'mul', value: 1.12 },
    ],
    description: '所有材质呈现为道具质感。钢板看起来是纸做的，水看起来是画上去的。他伸手去摸，触觉证实了钢板，他不信。',
  },
  {
    id: 'fx.hypervigilance',
    name: '过度警觉',
    duration: 100,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { fatigue: 0.06 },
    modifiers: [
      { stat: 'sonarRange', op: 'add', value: 0.5 },
      { stat: 'stealth', op: 'mul', value: 1.1 },
      { stat: 'resolve', op: 'mul', value: 0.9 },
    ],
    description: '惊跳反射阈值显著下降。他能听见三个舱室外的滴水。他也能听见不存在的脚步，且二者听起来完全一样。',
  },
  {
    id: 'fx.survivor-guilt',
    name: '幸存者罪疚',
    duration: -1,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { san: -0.02 },
    modifiers: [{ stat: 'resolve', op: 'mul', value: 0.9 }],
    description: '他记得自己越过了谁。名单在他脑中是按他经过的顺序排列的，不是按字母。',
  },
  {
    id: 'fx.auditory-hallucination',
    name: '幻听',
    duration: 70,
    stacks: 2,
    tags: ['mental', 'debuff'],
    tick: { fear: 0.08 },
    modifiers: [{ stat: 'sonarFidelity', op: 'mul', value: 0.72 }],
    description: '颞叶自发放电。那个叫他名字的声音来自他自己的听觉皮层。大概。无法排除另一种可能。',
  },
  {
    id: 'fx.catatonia',
    name: '紧张性木僵',
    duration: 12,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { san: -0.05 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.5 },
      { stat: 'stealth', op: 'mul', value: 2.2 },
      { stat: 'noiseEmission', op: 'mul', value: 0.2 },
      { stat: 'meleePower', op: 'mul', value: 0.1 },
    ],
    description: '运动输出中断，肌张力呈蜡样屈曲。他没有决定停下来。他停下来了。在某些情况下这救了他的命。',
  },
  {
    id: 'fx.numbness',
    name: '情感麻木',
    duration: 200,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { san: -0.015 },
    modifiers: [
      { stat: 'resolve', op: 'mul', value: 1.3 },
      { stat: 'searchQuality', op: 'mul', value: 0.88 },
    ],
    description: '情感反应幅度全面下降。恐惧减轻了。其余一切也一并减轻了，包括求生意愿。',
  },
  {
    id: 'fx.intrusive-count',
    name: '强迫计数',
    duration: -1,
    stacks: 1,
    tags: ['mental', 'debuff'],
    tick: { oxygen: -0.04 },
    modifiers: [{ stat: 'lucidity', op: 'add', value: 1 }],
    description: '患者在数自己的呼吸。数到 400 之后重新从一开始，因为他不确信前面没数错。这个习惯正在成为他唯一的锚。',
  },
];

// ============================================================================
// 3. 感染类 —— 教团接触后的五个递进阶段
//    设计意图：这是一条"越深越强，终点是你不再是你"的浮士德曲线。
//    末期必须是**真正有用的**，否则玩家不会有真实的挣扎。
// ============================================================================

const INFECTION: StatusEffect[] = [
  {
    id: 'fx.contact.i',
    name: '接触·一期「盐斑」',
    duration: -1,
    stacks: 1,
    tags: ['infection', 'debuff'],
    tick: { infection: 0.02 },
    modifiers: [{ stat: 'sonarFidelity', op: 'mul', value: 1.04 }],
    description: '接触部位出现结晶样白斑，直径 11 mm，无痛。刮除后二十分钟内原位复现。',
  },
  {
    id: 'fx.contact.ii',
    name: '接触·二期「共振」',
    duration: -1,
    stacks: 1,
    tags: ['infection', 'debuff'],
    tick: { infection: 0.03, san: -0.012 },
    modifiers: [
      { stat: 'sonarRange', op: 'add', value: 0.75 },
      { stat: 'resolve', op: 'mul', value: 0.95 },
    ],
    description: '颅骨骨传导出现异常谐波。患者能在不发射脉冲的情况下判断相邻舱室是否为空。他没有解释这是怎么做到的。',
  },
  {
    id: 'fx.contact.iii',
    name: '接触·三期「灰鳃」',
    duration: -1,
    stacks: 1,
    tags: ['infection', 'debuff'],
    tick: { infection: 0.04, oxygen: 0.26, co2: -0.32 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.88 },
      { stat: 'stealth', op: 'mul', value: 0.9 },
      { stat: 'resolve', op: 'mul', value: 1.08 },
    ],
    description: '颈侧出现六道平行裂隙，具备气体交换功能。氧耗下降 12%。建议患者暂勿照镜。',
  },
  {
    id: 'fx.contact.iv',
    name: '接触·四期「合唱」',
    duration: -1,
    stacks: 1,
    tags: ['infection', 'debuff'],
    tick: { infection: 0.05, san: -0.06 },
    modifiers: [
      { stat: 'resolve', op: 'mul', value: 1.5 },
      { stat: 'noiseEmission', op: 'mul', value: 1.4 },
      { stat: 'lucidity', op: 'add', value: -3 },
    ],
    description: '呼气相出现自发发声，基频 41 Hz，与舱外信号一致。外部个体不再表现出攻击行为。它们在等他唱完。',
  },
  {
    id: 'fx.contact.v',
    name: '接触·五期「圣化」',
    duration: -1,
    stacks: 1,
    tags: ['infection', 'terminal'],
    tick: { infection: 0.085, san: -0.1, oxygen: 0.62 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.55 },
      { stat: 'sonarRange', op: 'add', value: 2.5 },
      { stat: 'sonarFidelity', op: 'mul', value: 1.3 },
      { stat: 'meleePower', op: 'mul', value: 1.65 },
      { stat: 'lucidity', op: 'add', value: -6 },
    ],
    description: '代谢途径已大部分改换。他几乎不再需要携带的氧气，并且能听见整条船。感染度达 100 时躯体将并入船体——教团的文件里把这一栏记作"完成"，不是"死亡"。',
  },
];

// ============================================================================
// 4. 仪式类 —— 六种 Stigma，每个都是不可撤销的交易 (GDD P5)
// ============================================================================

const RITUAL: StatusEffect[] = [
  {
    id: 'fx.stigma.silence',
    name: '缄默之印',
    duration: -1,
    stacks: 3,
    tags: ['ritual', 'debuff'],
    modifiers: [
      { stat: 'noiseEmission', op: 'mul', value: 0.7 },
      { stat: 'stealth', op: 'mul', value: 1.25 },
      { stat: 'sonarRange', op: 'add', value: -0.6 },
    ],
    description: '甲状软骨下方一道横行瘢痕，非自伤。它们听不见他了。他也听不见它们给的提示了。',
  },
  {
    id: 'fx.stigma.listening',
    name: '聆听之印',
    duration: -1,
    stacks: 6,
    tags: ['ritual', 'debuff'],
    tick: { san: -0.026 },
    modifiers: [
      { stat: 'sonarRange', op: 'add', value: 1.2 },
      { stat: 'sonarFidelity', op: 'mul', value: 1.1 },
      { stat: 'lucidity', op: 'add', value: -2 },
    ],
    description: '他回应了。此后每一次脉冲返回的信息量都超过他发出去的。多出来的那部分没有来源。',
  },
  {
    id: 'fx.stigma.drowned',
    name: '溺者之印',
    duration: -1,
    stacks: 3,
    tags: ['ritual', 'debuff'],
    tick: { coreTemp: -0.006, infection: 0.012 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.85 },
      { stat: 'resolve', op: 'mul', value: 1.1 },
    ],
    description: '左肺下叶残留约 200 mL 液体，未被吸收，也未引起感染反应。水下他更省气。干燥处他更冷。',
  },
  {
    id: 'fx.stigma.iron',
    name: '铁之印',
    duration: -1,
    stacks: 3,
    tags: ['ritual', 'debuff'],
    modifiers: [
      { stat: 'meleePower', op: 'mul', value: 1.32 },
      { stat: 'resolve', op: 'mul', value: 1.2 },
      { stat: 'noiseEmission', op: 'mul', value: 1.35 },
      { stat: 'stealth', op: 'mul', value: 0.8 },
    ],
    description: '三处皮下植入物，材质与 KYRIE-9 承压壳同批。船体应力变化时它们会一起响。别的东西也能听见这个响声。',
  },
  {
    id: 'fx.stigma.flesh',
    name: '肉之印',
    duration: -1,
    stacks: 3,
    tags: ['ritual', 'infection', 'debuff'],
    tick: { infection: 0.035, san: -0.02 },
    modifiers: [
      { stat: 'searchQuality', op: 'mul', value: 1.32 },
      { stat: 'meleePower', op: 'mul', value: 1.15 },
    ],
    description: '他使用了活体材料。创面愈合速率超出生理上限约四倍。组织学显示新生组织的核型与他本人不符。',
  },
  {
    id: 'fx.stigma.apostasy',
    name: '叛教之印',
    duration: -1,
    stacks: 3,
    tags: ['ritual', 'buff'],
    tick: { fear: 0.045 },
    modifiers: [
      { stat: 'lucidity', op: 'add', value: 4 },
      { stat: 'sonarFidelity', op: 'mul', value: 1.15 },
      { stat: 'resolve', op: 'mul', value: 0.8 },
    ],
    description: '他砸了它们的东西。谎言从此对他效力减弱，因为他已经确知它们会撒谎。它们也确知他知道了。',
  },
];

// ============================================================================
// 5. 增益类 —— 每个增益都有生理代价 (GDD §2.1 "改造与植入")
// ============================================================================

const BUFF: StatusEffect[] = [
  {
    id: 'fx.adrenaline',
    name: '肾上腺素',
    duration: 55,
    stacks: 1,
    tags: ['buff'],
    tick: { fatigue: 0.12, co2: 0.1 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.8 },
      { stat: 'meleePower', op: 'mul', value: 1.45 },
      { stat: 'resolve', op: 'mul', value: 1.5 },
      { stat: 'noiseEmission', op: 'mul', value: 1.2 },
    ],
    description: '0.5 mg 静推。痛觉延迟，出血加快，心率 148。账单在五十五个呼吸之后结算。',
  },
  {
    id: 'fx.sedative',
    name: '镇静剂',
    duration: 120,
    stacks: 1,
    tags: ['buff'],
    tick: { fear: -0.95, san: 0.05 },
    modifiers: [
      { stat: 'resolve', op: 'mul', value: 1.35 },
      { stat: 'searchQuality', op: 'mul', value: 0.85 },
      { stat: 'sonarFidelity', op: 'mul', value: 0.9 },
    ],
    description: '苯二氮䓬类，肌注。心率降至 62。他依然完全知道舱外有什么，只是不再想跑了。',
  },
  {
    id: 'fx.pure-oxygen',
    name: '纯氧',
    duration: 45,
    stacks: 1,
    tags: ['buff'],
    tick: { oxygen: 0.58, co2: -1.2 },
    modifiers: [{ stat: 'breathCost', op: 'mul', value: 0.85 }],
    description: '应急瓶已接入面罩。高分压纯氧，四十五个呼吸。超时后中枢氧中毒，先兆是面部肌肉抽动。',
  },
  {
    id: 'fx.thermal-wrap',
    name: '保温层',
    duration: 200,
    stacks: 1,
    tags: ['buff'],
    tick: { coreTemp: 0.024 },
    modifiers: [
      { stat: 'noiseEmission', op: 'mul', value: 1.18 },
      { stat: 'stealth', op: 'mul', value: 0.88 },
    ],
    description: '铝箔应急毯。每一次移动都会发出窸窣声。他必须在体温和安静之间选一个。',
  },
  {
    id: 'fx.reality-anchor',
    name: '现实锚',
    duration: 90,
    stacks: 1,
    tags: ['buff', 'ritual'],
    tick: { san: 0.095 },
    modifiers: [
      { stat: 'lucidity', op: 'add', value: 5 },
      { stat: 'resolve', op: 'mul', value: 1.15 },
    ],
    description: '一面镜子，一张照片，一滴他自己的血。看三秒，确认三件事。它有效。它本身也是一个仪式。',
  },
  {
    id: 'fx.analgesic',
    name: '镇痛剂',
    duration: 140,
    stacks: 1,
    tags: ['buff'],
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.9 },
      { stat: 'resolve', op: 'mul', value: 1.1 },
      { stat: 'searchQuality', op: 'mul', value: 0.92 },
    ],
    description: '阿片类，口服。疼痛消失，损伤未消失。他将在骨折的腿上继续行走，直到它彻底断掉。',
  },
  {
    id: 'fx.stimulant',
    name: '提神剂',
    duration: 160,
    stacks: 1,
    tags: ['buff'],
    tick: { fatigue: -0.2, co2: 0.06, fear: 0.02 },
    modifiers: [
      { stat: 'searchQuality', op: 'mul', value: 1.2 },
      { stat: 'sonarFidelity', op: 'mul', value: 1.1 },
    ],
    description: '右旋安非他命 10 mg。疲劳被推迟，不是被偿还。到期时会连本带利一起到。',
  },
  {
    id: 'fx.grease-shroud',
    name: '尸油涂层',
    duration: 180,
    stacks: 1,
    tags: ['buff', 'ritual'],
    tick: { infection: 0.022, san: -0.016 },
    modifiers: [
      { stat: 'noiseEmission', op: 'mul', value: 0.6 },
      { stat: 'stealth', op: 'mul', value: 1.42 },
      { stat: 'searchQuality', op: 'mul', value: 0.9 },
    ],
    description: '从冷藏舱那批人身上刮下来的脂肪层。它盖住他的气味，也盖住他是谁这件事。',
  },
  {
    id: 'fx.antibiotic',
    name: '广谱抗生素',
    duration: 160,
    stacks: 1,
    tags: ['buff'],
    tick: { infection: -0.095, fatigue: 0.02 },
    description: '对革兰氏阴性菌有效。对"那个"的有效性，档案第 44 页的结论栏写着：部分。没有下文。',
  },
  {
    id: 'fx.rebreather',
    name: '碱石灰回路',
    duration: 240,
    stacks: 1,
    tags: ['buff'],
    tick: { co2: -0.85, oxygen: -0.05 },
    modifiers: [{ stat: 'breathCost', op: 'mul', value: 0.92 }],
    description: '氢氧化钙吸收罐已接入呼吸回路。它吃掉他的二氧化碳，然后开始发热。发热是正常的，直到不正常。',
  },
  {
    id: 'fx.resting',
    name: '静息',
    duration: 10,
    stacks: 1,
    tags: ['buff'],
    tick: { fatigue: -0.9, fear: -0.35, co2: -0.3 },
    modifiers: [
      { stat: 'breathCost', op: 'mul', value: 0.72 },
      { stat: 'noiseEmission', op: 'mul', value: 0.5 },
    ],
    description: '背靠舱壁，闭眼，不动。这是船上唯一一件不花钱的事，但它花时间，而时间就是氧气。',
  },
];

// ============================================================================
// 6. 隐藏类 —— 玩家看不到但确实在生效 (支柱 P3 的机械实体)
//    设计意图：HUD 撒谎只是表层；真正的"系统在骗你"是**状态栏里没有的东西也在结算**。
//    这九个必须能被间接推断（玩家发现"我今天特别容易被听见"），否则就是纯恶意。
// ============================================================================

const HIDDEN: StatusEffect[] = [
  {
    id: 'fx.hidden.marked',
    name: '被标记',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff', 'ritual'],
    modifiers: [{ stat: 'noiseEmission', op: 'mul', value: 1.45 }],
    description: '某种物质被涂在他背部他够不到的位置。他发出的每一个声音都被放大了四成。',
  },
  {
    id: 'fx.hidden.followed',
    name: '尾随',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'mental', 'debuff'],
    tick: { san: -0.035, fear: 0.06 },
    description: '有东西维持在三个舱室的距离上。它从不拉近，也从不放弃。他的恐惧值在没有刺激源时仍在上升。',
  },
  {
    id: 'fx.hidden.gauge-lie',
    name: '表盘偏差',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    description: '氧气压力表被重新校准过，读数高于真值约 14%。校准记录上的签名是他自己的笔迹。',
  },
  {
    id: 'fx.hidden.echo-debt',
    name: '回声负债',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    modifiers: [{ stat: 'sonarFidelity', op: 'mul', value: 0.75 }],
    description: '发射的脉冲有一部分没有回来。能量守恒要求它们去了某处。声呐室的日志把这一栏叫作"存款"。',
  },
  {
    id: 'fx.hidden.substitution',
    name: '替换',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'mental', 'infection'],
    tick: { san: -0.02, infection: 0.01 },
    modifiers: [{ stat: 'lucidity', op: 'add', value: -2 }],
    description: '自第 3 舱那次断电起，返回的个体与进入的个体在若干指标上不完全一致。差异在误差范围内。仅在误差范围内。',
  },
  {
    id: 'fx.hidden.countdown',
    name: '倒数',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    tick: { fear: 0.03 },
    description: '某个计数已经开始，节拍与他的呼吸同步。计数的终点不在他这一侧。',
  },
  {
    id: 'fx.hidden.remembered',
    name: '它记得你',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    modifiers: [{ stat: 'stealth', op: 'mul', value: 0.8 }],
    description: '上一轮回他藏身的三个位置，这一次会被优先搜查。这条信息不在任何存档文件里。',
  },
  {
    id: 'fx.hidden.lungful',
    name: '借来的一口气',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    tick: { oxygen: -0.085 },
    description: '储量以表盘之外的速率减少。差额每小时约 5 升。没有可见泄漏点。',
  },
  {
    id: 'fx.hidden.tuned',
    name: '已调谐',
    duration: -1,
    stacks: 1,
    hidden: true,
    tags: ['hidden', 'debuff'],
    modifiers: [
      { stat: 'sonarFidelity', op: 'mul', value: 1.22 },
      { stat: 'lucidity', op: 'add', value: -3 },
    ],
    description: '声呐阵列被重新标定。它现在回报的图像更清晰、更连贯、更容易相信。这是它被标定的目的。',
  },
];

// ============================================================================
// 装配与查询 API
// ============================================================================

export const STATUS_DEFS: readonly StatusEffect[] = [
  ...PHYSICAL, ...MENTAL, ...INFECTION, ...RITUAL, ...BUFF, ...HIDDEN,
];

const BY_ID = new Map<ID, StatusEffect>(STATUS_DEFS.map((e) => [e.id, e]));

export const STATUS_BY_ID: ReadonlyMap<ID, StatusEffect> = BY_ID;

/** 分类统计，docs/sim-spec.md 与内容校验器都会读它。 */
export const STATUS_COUNTS = {
  physical: PHYSICAL.length,
  mental: MENTAL.length,
  infection: INFECTION.length,
  ritual: RITUAL.length,
  buff: BUFF.length,
  hidden: HIDDEN.length,
  total: STATUS_DEFS.length,
};

/**
 * 实例化一个状态。**必须深拷贝**：定义表是共享的只读数据，
 * 直接把定义塞进玩家身上会导致一名玩家的 duration 递减污染整个库。
 */
export function makeStatus(
  id: ID,
  override?: { duration?: number; stacks?: number },
): StatusEffect {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`[status] 未知状态效果 "${id}"`);
  return {
    ...def,
    duration: override?.duration ?? def.duration,
    stacks: override?.stacks ?? 1,
    tags: [...def.tags],
    modifiers: def.modifiers ? def.modifiers.map((m) => ({ ...m })) : undefined,
    tick: def.tick ? { ...def.tick } : undefined,
  };
}

/** 叠加上限。契约里没有这个字段，所以放在本模块维护（见 sim-spec 的 CONTRACT CHANGE REQUEST）。 */
export function stackLimit(id: ID): number {
  return BY_ID.get(id)?.stacks ?? 1;
}

/** 感染五期链，按顺序对应 TUNING.infection.stageThresholds。 */
export const INFECTION_CHAIN: readonly ID[] = [
  'fx.contact.i', 'fx.contact.ii', 'fx.contact.iii', 'fx.contact.iv', 'fx.contact.v',
];

const STIGMA_STATUS: Record<StigmaKind, ID> = {
  silence: 'fx.stigma.silence',
  listening: 'fx.stigma.listening',
  drowned: 'fx.stigma.drowned',
  iron: 'fx.stigma.iron',
  flesh: 'fx.stigma.flesh',
  apostasy: 'fx.stigma.apostasy',
};

export function stigmaStatusFor(kind: StigmaKind): ID {
  return STIGMA_STATUS[kind];
}

/** 隐藏状态池 —— 导演 AI 会从这里挑一个悄悄挂在玩家身上。 */
export const HIDDEN_POOL: readonly ID[] = HIDDEN.map((e) => e.id);

/** 可被医疗手段移除的状态（治疗系统查询用）。 */
export function isTreatable(id: ID): boolean {
  const def = BY_ID.get(id);
  if (!def) return false;
  if (def.tags.includes('ritual')) return false;   // 印记不可治，只能被另一个仪式覆盖
  if (def.tags.includes('hidden')) return false;   // 看不见的东西治不了
  return def.tags.includes('physical') || def.tags.includes('infection');
}
