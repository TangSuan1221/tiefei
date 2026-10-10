import type { Pipeline } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });
const GE = (fact: string, value: number) => ({ fact, op: '>=' as const, value });
const LE = (fact: string, value: number) => ({ fact, op: '<=' as const, value });

const ACCIDENT = '艾里亚斯：警报，泄压门一道道落。我关在泵房里。\n艾里亚斯：出来的时候，闸门开着。谁开的——我没看见。';
const ACCIDENT_AGAIN = '艾里亚斯：我刚说了……我就知道这些。闸门谁开的，我真没看见。';

/** 第一关：接驳港断桥救援。设计依据 docs/level-01-input-pipeline.md；运行时由 HarborRescueSite 接入。 */
export const level01: Pipeline = {
  id: 'level-01',
  title: '第一关 · 接驳港断桥救援',
  status: 'IMPLEMENTED（文本对白、事实写入、录像表演槽位、存档）/ GAP（尸体模型、3D表演姿态待核、跨关呼应未接入后续关卡）',
  sourceDoc: 'docs/level-01-input-pipeline.md',

  facts: [
    // 客观事实：来自现有 HarborRescueState 等，只读
    { key: 'rescue.heard', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：调频收听求救' },
    { key: 'rescue.replied', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：首次回复' },
    { key: 'rescue.identified', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：首片核验' },
    { key: 'rescue.warned', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：首片核验后开始计算受击', note: '受击只在此后计算，玩家沉默不会造成艇体损伤' },
    { key: 'rescue.gateOpen', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：01开闸' },
    { key: 'rescue.isolated', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：关闸隔离' },
    { key: 'rescue.verified', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：隔离核验，撤离的物理前提' },
    { key: 'rescue.departing', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：内侧逃生门接通' },
    { key: 'rescue.departed', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：到达门后' },
    { key: 'pod.pulse', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'on', life: 'level', source: 'run.sonarEmitting' },
    { key: 'pod.lamp', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'off', life: 'level', source: 'run.lit' },
    { key: 'pod.hull', layer: 'W', type: 'enum', values: ['intact', 'damaged'], initial: 'intact', life: 'level', source: 'run.hull / noiseStrikes' },
    { key: 'creature.zone', layer: 'W', type: 'enum', values: ['near_elias', 'roaming', 'entering_cargo', 'inside_cargo', 'behind_gate'], initial: 'near_elias', life: 'level', source: 'HarborPursuit 实际位置' },
    { key: 'elias.location', layer: 'W', type: 'enum', values: ['wall', 'corridor', 'beyond_door'], initial: 'wall', life: 'level', source: 'departing / departed' },
    { key: 'corpse.present', layer: 'W', type: 'enum', values: ['none', 'background'], initial: 'none', life: 'level', source: '场景静态布置', gap: '尸体模型缺失（VR-003）；推演中可勾选“假设尸体模型已就位”' },

    // 证据
    { key: 'evidence.threat', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验 01 首片' },
    { key: 'evidence.lure', layer: 'E', type: 'bool', initial: false, life: 'level', source: '分析台核验 03 入仓片' },
    { key: 'evidence.gate', layer: 'E', type: 'bool', initial: false, life: 'level', source: '分析台核验 隔离片' },
    { key: 'evidence.departure', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验 撤离结果片' },
    { key: 'evidence.bodyPosition', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '可选：从01补拍尸体位置并核验', gap: '依赖尸体模型；用现有快门与分析台，不新增操作' },

    // 艾里亚斯认知
    { key: 'elias.hears.pulse', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'level', source: '感知：主动脉冲开启且已接通' },
    { key: 'elias.hears.scrape', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'level', source: '感知：怪物未被隔离时听得到刮擦' },
    { key: 'elias.believes.monster', layer: 'K', holder: 'elias', type: 'enum', values: ['unknown', 'near_me', 'told_nothing', 'sealed'], initial: 'unknown', life: 'level', source: '罗温的陈述；sealed 需放行' },
    { key: 'elias.knows.rowanRole', layer: 'K', holder: 'elias', type: 'enum', values: ['unknown', 'investigator', 'rescuer'], initial: 'unknown', life: 'persist', source: '罗温自报' },
    { key: 'elias.knows.rowanName', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'persist', source: '罗温自报姓名' },
    { key: 'elias.knows.rowanAskedBody', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'persist', source: '罗温问及尸体' },
    { key: 'elias.instruction.hold', layer: 'K', holder: 'elias', type: 'enum', values: ['none', 'freeze', 'signal'], initial: 'none', life: 'level', source: '罗温指示：别动 / 朝灯看' },
    { key: 'elias.instruction.route', layer: 'K', holder: 'elias', type: 'enum', values: ['none', 'rail'], initial: 'none', life: 'level', source: '罗温给路线指示' },

    // 罗温认知
    { key: 'rowan.knows.monster', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '= evidence.threat 核验' },
    { key: 'rowan.notedBody', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '已核验录像含尸体且罗温问及', gap: '依赖尸体模型' },
    { key: 'rowan.demeanor', layer: 'K', holder: 'rowan', type: 'enum', values: ['calm', 'afraid', 'hard'], initial: 'calm', life: 'persist', source: '语气 tag', note: '按最近一次语气' },

    // 万斯认知
    { key: 'vance.knows.rowanUneasy', layer: 'K', holder: 'vance', type: 'bool', initial: false, life: 'persist', source: '罗温表达不安' },
    { key: 'vance.lastHeard', layer: 'K', holder: 'vance', type: 'enum', values: ['none', 'steady', 'afraid', 'question', 'doubt'], initial: 'none', life: 'persist', source: '信号断开前最后一句' },

    // 关系
    { key: 'relation.elias.trust', layer: 'R', type: 'int', min: -2, max: 2, initial: 0, life: 'persist', source: '对白 tag 加减，每窗口同类一次' },
    { key: 'relation.vance.rapport', layer: 'R', type: 'int', min: -1, max: 1, initial: 0, life: 'persist', source: '对白 tag' },

    // 言行记录
    { key: 'said.rowan.promisedRescue', layer: 'S', type: 'bool', initial: false, life: 'persist', source: '首次接通时承诺来救' },
    { key: 'said.rowan.downplayed', layer: 'S', type: 'bool', initial: false, life: 'persist', source: '看片后淡化或隐瞒怪物' },
    { key: 'said.rowan.falseClear', layer: 'S', type: 'int', min: 0, max: 9, initial: 0, life: 'persist', source: '物理未隔离时叫他出来' },
    { key: 'said.rowan.release', layer: 'S', type: 'bool', initial: false, life: 'level', source: '确认阶段明确放行' },

    // 承诺
    { key: 'commitment.elias.records', layer: 'C', type: 'bool', initial: false, life: 'persist', source: '告别时请他保留值班记录' },
    { key: 'commitment.elias.meet', layer: 'C', type: 'enum', values: ['none', 'gate', 'keepChannel'], initial: 'none', life: 'persist', source: '告别时约定，衔接 MET-041 密码闸门会合' },

    // 证词
    { key: 'testimony.vance.official', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '万斯给出的公司口径' },
    { key: 'testimony.elias.accident', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯对事故的陈述' },
  ],

  stages: [
    { id: 'entry', title: '入港', dialogueStages: ['（艾里亚斯接通前）'], objective: '输入万斯坐标，经A气闸、C维修湾驶向主港', advance: '驶入C-B通道', gate: [], sets: [] },
    { id: 'cb', title: 'C-B通道', dialogueStages: ['（艾里亚斯接通前）'], objective: '沿通道驶向B主港', advance: '接近B主港，出现求救载波', gate: [], sets: [] },
    { id: 'contact', title: '首次接通', dialogueStages: ['contact', 'intro'], objective: '调谐被动接收机，长按麦克风回复', advance: '罗温回复（或沉默约40秒后艾里亚斯自己继续）', gate: ['rescue.heard'], sets: [T('rescue.heard'), T('elias.hears.pulse'), T('elias.hears.scrape')] },
    { id: 'stop', title: '停发脉冲', dialogueStages: ['stop', 'warning'], objective: '关闭主动声纳脉冲', advance: '实际停发', gate: ['rescue.replied', 'pod.pulse'], sets: [T('rescue.replied'), T('pod.pulse', 'off'), T('elias.hears.pulse', false)] },
    { id: 'photo', title: '01 首片', dialogueStages: ['photo'], objective: '在01拍摄艾里亚斯附近，显影后分析', advance: '首片核验', gate: ['rescue.identified', 'rescue.warned'], sets: [] },
    { id: 'report', title: '看片报告', dialogueStages: ['report', 'plan'], objective: '长按麦克风向艾里亚斯回复', advance: '回复后艾里亚斯交代计划', gate: [], sets: [T('rescue.identified'), T('rescue.warned'), T('evidence.threat'), T('rowan.knows.monster'), T('creature.zone', 'roaming')] },
    { id: 'power', title: '供电与开闸', dialogueStages: ['power', 'powerBrief', 'open'], objective: '02恢复应急电力，01打开货仓闸门', advance: '闸门打开', gate: ['rescue.gateOpen'], sets: [T('rescue.gateOpen')] },
    { id: 'lure', title: '货舱诱导', dialogueStages: ['lureBrief', 'lure'], objective: '驶入03货舱开启脉冲引怪，拍摄入仓确认', advance: '入仓片核验', gate: ['evidence.lure'], sets: [T('pod.pulse', 'on'), T('creature.zone', 'inside_cargo'), T('evidence.lure')] },
    { id: 'close', title: '关闸隔离', dialogueStages: ['closeBrief', 'close'], objective: '停发脉冲，回01关闸，拍隔离结果', advance: '隔离核验', gate: ['rescue.isolated', 'evidence.gate'], sets: [T('pod.pulse', 'off'), T('rescue.isolated'), T('creature.zone', 'behind_gate'), T('elias.hears.scrape', false), T('evidence.gate')] },
    { id: 'confirm', title: '放行', dialogueStages: ['confirmBrief', 'confirm'], objective: '长按麦克风回复艾里亚斯', advance: '物理已核验 且 罗温放行', gate: ['rescue.verified', 'said.rowan.release'], sets: [T('rescue.verified')] },
    { id: 'escape', title: '撤离途中', dialogueStages: ['escapeBrief', 'escape'], objective: '留在艇内，观察艾里亚斯沿内侧通道撤离', advance: '他到达门后', gate: ['rescue.departing'], sets: [T('rescue.departing'), T('elias.location', 'corridor')] },
    { id: 'departure', title: '撤离结果', dialogueStages: ['departure'], objective: '在01拍摄并分析撤离结果', advance: '撤离片核验', gate: ['rescue.departed', 'evidence.departure'], sets: [T('rescue.departed'), T('elias.location', 'beyond_door'), T('evidence.departure')] },
    { id: 'done', title: '告别与离港', dialogueStages: ['done'], objective: '返回01接驳面板确认离港', advance: '确认离港', gate: [], sets: [] },
  ],

  windows: [
    {
      id: 'vance-entry', title: '万斯·入港', speaker: 'vance', stage: 'entry', opens: '开局', closes: '打开C-B压力门', multi: true, optional: true,
      tags: [
        { id: 'ask-coords', label: '再问坐标 / 操作', examples: ['入口坐标再说一遍', '门怎么开'], keywords: ['坐标', '再说一遍', '怎么开', '开门', '怎么走', '入口', '在哪', '路线', '航点'], writes: [], reply: '万斯：坐标在你导航台上，我发过去了。到了门前，艇头正对着门，三米半以内刹住，按F。', again: '万斯：还是那组数。正对门，三米半，刹住，F。门不会跑。' },
        { id: 'ask-power', label: '问电量 / 补电', examples: ['电池快没了怎么办', '我该怎么恢复电力'], keywords: ['电池', '电量', '没电', '断电', '供电', '充电', '补电', '电力'], writes: [], reply: '万斯：先关主动声纳，它最吃电。\n万斯：门走港区液压，你没电也开得了。进去，维修湾里有个黄漆的02配电箱——对上去就能补满。', again: '万斯：关声纳，开门，02配电箱。就这三步。' },
        { id: 'unease', label: '表达不安', examples: ['这里让我不舒服', '我不太习惯听人说话'], keywords: ['不舒服', '不习惯', '不安', '紧张', '心慌', '难受', '压抑', '不喜欢'], writes: [T('vance.knows.rowanUneasy'), ADD('relation.vance.rapport', 1)], reply: '万斯：你一向讨厌人多。现在下面一个人都没有，你倒不舒服了。\n万斯：……说话，罗温。你说话我就知道你还在。', again: '万斯：我知道。我在。' },
        { id: 'question-mission', label: '质疑任务', examples: ['为什么只派我一个人', '你们到底瞒了什么'], keywords: ['为什么只', '为什么是我', '一个人', '瞒', '隐瞒', '骗', '真相', '凭什么'], writes: [ADD('relation.vance.rapport', -1)], reply: '万斯：因为那条缝。\n万斯：别的……我也想知道。', again: '万斯：我回答不了你，罗温。我真的不知道。' },
        { id: 'ask-accident', label: '询问事故', examples: ['下面出了什么事', '事故报告怎么说'], keywords: ['事故', '出了什么事', '发生了什么', '报告', 'panacea', '项目', '怎么回事'], writes: [T('testimony.vance.official')], reply: '万斯：两行。“Panacea项目区泄压事故，幸存者待确认。”\n万斯：……签字栏是空的。', again: '万斯：就那两行。签字栏还是空的。' },
        { id: 'ask-vance', label: '问万斯本人', examples: ['你现在在哪', '你那边怎么样'], keywords: ['你在哪', '你那边', '你现在', '水面', '你还好', '你呢'], writes: [ADD('relation.vance.rapport', 1)], reply: '万斯：水面船上，盯着你那颗小绿点。\n万斯：……绿点在动，我就当你在呼吸。', again: '万斯：还在船上。哪儿也不去。' },
        { id: 'smalltalk', label: '就绪 / 闲聊', examples: ['收到，准备好了', '明白'], keywords: ['收到', '明白', '准备好', '好的', '知道了', '出发', '了解'], writes: [], reply: '万斯：收到。我一直在这条频道上。', again: '万斯：嗯。' },
      ],
    },
    {
      id: 'vance-fade', title: '万斯·衰减', speaker: 'vance', stage: 'cb', opens: '打开C-B压力门，万斯声音开始断续', closes: '发出一句或接近B主港', multi: false, optional: true,
      defaultTag: 'question',
      tags: [
        { id: 'steady', label: '报平安', examples: ['我没事，继续前进', '一切正常'], keywords: ['没事', '正常', '还好', '继续', '放心', '安全', '一切'], writes: [T('vance.lastHeard', 'steady')], reply: '@echo:vance-fade-line' },
        { id: 'afraid', label: '害怕', examples: ['我有点怕', '这里太黑了'], keywords: ['怕', '黑', '恐怖', '吓', '不敢', '慌', '冷'], writes: [T('vance.lastHeard', 'afraid')], reply: '@echo:vance-fade-line' },
        { id: 'question', label: '提问', examples: ['你还能听到吗', '接下来怎么办'], keywords: ['听到', '听得见', '能听', '怎么办', '接下来', '信号', '喂', '还在'], writes: [T('vance.lastHeard', 'question')], reply: '@echo:vance-fade-line' },
        { id: 'doubt', label: '质疑', examples: ['你是不是早就知道', '这不对劲'], keywords: ['早就知道', '不对劲', '奇怪', '骗', '隐瞒', '知道什么', '为什么'], writes: [T('vance.lastHeard', 'doubt')], reply: '@echo:vance-fade-line' },
      ],
    },
    {
      id: 'elias-contact', title: '首次接通', speaker: 'elias', stage: 'contact', opens: '收听求救载波', closes: '发出一句或沉默约40秒', multi: false, optional: true,
      advanceOn: '*', defaultTag: 'other',
      tags: [
        { id: 'id-investigator', label: '自报调查员', examples: ['我是事故调查员罗温', '我来调查事故'], keywords: ['调查员', '调查', '事故调查', '查事故'], writes: [T('elias.knows.rowanRole', 'investigator')], reply: '艾里亚斯：调查员。……那你记一笔：泵站七，一个活的。\n艾里亚斯：泵房顶上有间干舱，一个大气压，舱壁没破。我在那儿熬了三天。听见你的声纳，才穿上壳子出来。\n艾里亚斯：现在在剩下那截桥上，背靠卷帘门旁边那扇检修门，左手钳着栏杆。' },
        { id: 'id-rescuer', label: '自报救援', examples: ['我是来救你的', '我是救援队的'], keywords: ['救援', '救你', '来救', '救人', '营救'], writes: [T('elias.knows.rowanRole', 'rescuer')], reply: '艾里亚斯：救援……廊桥被水压断了，你过不来。\n艾里亚斯：我在剩下那截桥上，背靠检修门，钳着栏杆。桥就一米宽，没地方挪。' },
        { id: 'ask-location', label: '问位置', examples: ['你在哪里', '给我坐标'], keywords: ['在哪', '哪里', '坐标', '位置', '方位'], writes: [], reply: '艾里亚斯：港池全灌了。泵房顶上有间干舱，一个大气压，舱壁没破。我在那儿熬了三天。听见你的声纳，才穿壳子出来。\n艾里亚斯：现在在剩下那截桥上，桥就剩一米宽。背后是检修门，前面是断口，左手钳着栏杆。没地方挪。' },
        { id: 'ask-injury', label: '问伤情', examples: ['你受伤了吗', '你还好吗'], keywords: ['受伤', '还好吗', '没事吧', '伤', '身体', '流血', '氧气'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：没……没受伤。谢谢你先问这个。\n艾里亚斯：廊桥断了，我出不去。' },
        { id: 'hold', label: '指示别动', examples: ['别动，贴着墙待着', '待在原地'], keywords: ['别动', '不要动', '待着', '原地', '贴着墙', '藏好', '躲好', '安静'], writes: [T('elias.instruction.hold', 'freeze')], reply: '艾里亚斯：……墙？你看得见我？\n艾里亚斯：猜的吧。猜对了。我一直贴着，不动。' },
        { id: 'promise', label: '承诺来救', examples: ['坚持住，我马上过来', '我会带你出去'], keywords: ['坚持', '马上', '我来了', '过来', '带你出去', '等我', '撑住'], writes: [T('said.rowan.promisedRescue'), T('elias.instruction.hold', 'signal')], reply: '艾里亚斯：过不来，桥断了——你别过来。\n艾里亚斯：……你在对面？我把夹钳抬一下。你看不见也没关系——拍下来，就知道我是真的。' },
        { id: 'doubt', label: '怀疑身份', examples: ['你是谁', '我怎么知道你是真的'], keywords: ['你是谁', '怎么知道', '真的假的', '证明', '是人吗', '凭什么信'], writes: [ADD('relation.elias.trust', -1)], reply: '艾里亚斯：刚说了，艾里亚斯，修泵的。你要看工牌，先把我弄出去。' },
        { id: 'other', label: '其他 / 听不清', examples: ['听得见，我听得见'], keywords: ['听得见', '听到了', '收到', '喂', '你好'], writes: [], reply: '艾里亚斯：小声。我听得见你。' },
      ],
    },
    {
      id: 'elias-warning', title: '警告', speaker: 'elias', stage: 'stop', opens: '艾里亚斯要求关闭主动声纳', closes: '进入01拍摄阶段', multi: true, optional: true,
      defaultTag: 'ask-what',
      tags: [
        { id: 'ask-what', label: '问它是什么', examples: ['它是什么', '为什么要关'], keywords: ['是什么', '什么东西', '为什么', '它是', '谁'], writes: [], reply: '艾里亚斯：别问。关。', again: '艾里亚斯：……关。' },
        { id: 'refuse', label: '拒绝关闭', examples: ['我需要声纳避障', '我不关'], keywords: ['不关', '需要声纳', '避障', '看不见路', '不行', '拒绝', '凭什么'], writes: [], reply: '', branches: [
          { when: [IS('elias.hears.pulse')], reply: '艾里亚斯：求你了。你每响一下，它就往这边靠一点。' },
          { when: [], reply: '艾里亚斯：你已经关了？……好。就这样，别再开。' },
        ] },
        { id: 'comply', label: '答应关闭', examples: ['好，我关了', '已经关掉了'], keywords: ['关了', '关掉了', '好的', '马上关', '停了', '照做'], writes: [], reply: '', branches: [
          { when: [IS('elias.hears.pulse')], reply: '艾里亚斯：还没有。我还听得见你在响。', writes: [] },
          { when: [], reply: '艾里亚斯：……安静了。谢谢。', writes: [ADD('relation.elias.trust', 1)] },
        ] },
      ],
    },
    {
      id: 'elias-wait', title: '等待显影', speaker: 'elias', stage: 'photo', opens: '前往01拍摄至首片核验', closes: '首片核验', multi: true, optional: true,
      defaultTag: 'ask-time',
      tags: [
        { id: 'premature', label: '未看片就下结论', examples: ['应该没什么', '我看什么都没有'], keywords: ['没什么', '没事', '没东西', '什么都没有', '安全了', '没看到'], writes: [], reply: '艾里亚斯：你还没看片吧？看完再说。' },
        { id: 'ask-time', label: '问还要多久', examples: ['再等等，片子在显影', '还要多久'], keywords: ['多久', '等等', '显影', '片子', '马上', '稍等', '快好了'], writes: [], reply: '艾里亚斯：……我在数呼吸。你那边好了就告诉我。反正我哪儿也去不了。', again: '艾里亚斯：……我还在。' },
        { id: 'ask-where', label: '问它在哪', examples: ['它现在在哪', '你还听得见它吗'], keywords: ['它在哪', '还在吗', '听得见它', '它在', '多远'], writes: [], reply: '艾里亚斯：门后面。它在刮。……一直在刮。' },
      ],
    },
    {
      id: 'elias-report', title: '看片报告', speaker: 'elias', stage: 'report', opens: '首片核验后', closes: '发出报告', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: [
        { id: 'truthful', label: '如实描述怪物', examples: ['门缝里伸出来一截，离你后颈一掌', '它就在你身后的门里', '有个东西伸手靠近你'], keywords: ['门缝', '后颈', '伸出来', '门里', '身后', '背后', '后面', '靠近你', '伸手', '怪物', '有东西', '有个东西', '就在你', '离你很近', '在你旁边'], requires: [IS('rowan.knows.monster')], fallback: '艾里亚斯：你看清了吗？看清了再告诉我。', writes: [T('elias.believes.monster', 'near_me')], reply: '', branches: [
          { when: [IS('elias.instruction.hold', 'freeze')], reply: '艾里亚斯：……从门缝里？\n艾里亚斯：……你让我贴着墙的。\n（水听器：极轻的一声金属响。刮擦停了。三秒。）\n（水听器：刮擦重新开始，节奏没变。）\n艾里亚斯：……我离开门了。它没听见。' },
          { when: [], reply: '艾里亚斯：……从门缝里？\n艾里亚斯：我一直靠在那扇门上。\n（水听器：极轻的一声金属响。刮擦停了。三秒。）\n（水听器：刮擦重新开始，节奏没变。）\n艾里亚斯：……我离开门了。它没听见。' },
        ] },
        { id: 'downplay', label: '淡化或隐瞒', examples: ['别怕，什么都没有', '没什么'], keywords: ['没什么', '什么都没有', '别怕', '没东西', '不用担心', '没事', '看错了', '安全'], writes: [T('said.rowan.downplayed'), T('elias.believes.monster', 'told_nothing'), ADD('relation.elias.trust', -1)], reply: '艾里亚斯：没什么？那门后面是什么在刮？\n艾里亚斯：……算了。' },
        { id: 'fear', label: '表达恐惧 / 想走', examples: ['我想退出去', '这太可怕了'], keywords: ['可怕', '害怕', '退出', '想走', '离开', '受不了', '恐怖', '撤退', '吓'], writes: [T('rowan.demeanor', 'afraid')], reply: '艾里亚斯：别走。求你。\n艾里亚斯：只要几步，我告诉你怎么做。' },
        { id: 'ask-accident', label: '问事故', examples: ['这里发生了什么', '其他人呢'], keywords: ['发生了什么', '事故', '其他人', '别的人', '怎么回事', '出了什么事'], writes: [], reply: '艾里亚斯：事故的事，出去再说。\n艾里亚斯：片子先说。上面有什么？', again: '艾里亚斯：……你不说。那就是很糟。\n艾里亚斯：事故的事，出去再说。现在我只想知道它在哪。' },
        { id: 'ask-body', label: '问水里的尸体', examples: ['水里那个人是谁', '桥下有具尸体'], keywords: ['尸体', '死人', '水里那个', '桥下', '漂着', '那个人'], requires: [IS('corpse.present', 'background')], fallback: '艾里亚斯：我这边看不见你说的地方。', writes: [T('elias.knows.rowanAskedBody'), T('rowan.notedBody')], reply: '艾里亚斯：……我不敢往水里看。现在别问这个。', gap: '尸体模型缺失；正典口径待用户确认' },
        { id: 'ask-what', label: '问是什么 / 惊叫', examples: ['那到底是什么东西', '天哪'], keywords: ['什么东西', '是什么', '天哪', '我的天', '那是'], writes: [], reply: '艾里亚斯：我不知道。我真的不知道。' },
        { id: 'other', label: '其他', examples: ['我看到了'], keywords: ['看到了', '看见了', '看清了'], writes: [], reply: '艾里亚斯：……你不说，我也听得出来。' },
      ],
    },
    {
      id: 'elias-action', title: '行动期', speaker: 'elias', stage: 'power', opens: '供电阶段开始', closes: '关闸隔离', multi: true, optional: true,
      defaultTag: 'ask-next',
      tags: [
        { id: 'ask-next', label: '问下一步', examples: ['接下来做什么', '下一步去哪'], keywords: ['接下来', '下一步', '去哪', '怎么做', '做什么', '然后呢', '坐标'], writes: [], reply: '@plan' },
        { id: 'ask-accident', label: '问事故', examples: ['之前这里发生了什么'], keywords: ['发生了什么', '事故', '其他人', '怎么回事'], writes: [T('testimony.elias.accident')], reply: ACCIDENT, again: ACCIDENT_AGAIN },
        { id: 'ask-self', label: '问他本人', examples: ['你在这里做什么工作', '说说你自己'], keywords: ['工作', '你自己', '你是做', '多久了', '家人', '你叫'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：……现在？\n艾里亚斯：七年，这层的泵。现在听它们转——一台都认不出来。去开门。', again: '艾里亚斯：七年。没听过这层这么响。' },
        { id: 'comfort', label: '安慰', examples: ['会没事的，我在', '别怕'], keywords: ['没事的', '我在', '别怕', '相信我', '放心', '会好的'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：……嗯。我还在。', again: '艾里亚斯：我知道。谢谢。' },
        { id: 'hurry', label: '催促', examples: ['快点', '别磨蹭'], keywords: ['快点', '磨蹭', '赶紧', '快', '抓紧'], writes: [], reply: '艾里亚斯：我比你急。它是下去了，可井盖就在我脚底下。' },
        { id: 'call-out', label: '叫他出来（未隔离）', examples: ['可以出来了', '现在安全了'], keywords: ['出来', '安全了', '走吧', '可以走'], writes: [], reply: '', branches: [
          { when: [IS('elias.hears.scrape')], reply: '艾里亚斯：我还听得见它。你确定？\n艾里亚斯：……我不出去。', writes: [ADD('said.rowan.falseClear', 1), ADD('relation.elias.trust', -1)] },
          { when: [], reply: '艾里亚斯：等你确认过录像再说。' },
        ] },
      ],
    },
    {
      id: 'elias-confirm', title: '放行', speaker: 'elias', stage: 'confirm', opens: '隔离后艾里亚斯问“搞定了吗”', closes: '放行', multi: true, optional: false,
      advanceOn: ['release', 'release-route'],
      tags: [
        { id: 'release', label: '放行', examples: ['门关上了，你可以出来了', '搞定了'], keywords: ['搞定', '关上了', '关进去', '可以出来', '出来吧', '安全了', '关好了', '它在里面', '走吧'], writes: [T('said.rowan.release'), T('elias.believes.monster', 'sealed')], reply: '', branches: [
          { when: [IS('said.rowan.downplayed')], reply: '艾里亚斯：……搞定了？你上回也说没什么。\n艾里亚斯：我自己听。\n（十秒。频道里只有他压着的呼吸。）\n艾里亚斯：……没有刮擦。我信耳朵，不信你。我出来。' },
          { when: [GE('said.rowan.falseClear', 1)], reply: '艾里亚斯：上回你也说安全。我自己听。\n（十秒。频道里只有他压着的呼吸。）\n艾里亚斯：……没有刮擦。我出来。' },
          { when: [], reply: '艾里亚斯：门关死了？\n（四秒。）\n艾里亚斯：你不答，我就当是。（他换了一口气，很长。）我出来。' },
        ] },
        { id: 'release-route', label: '放行并给路线', examples: ['出来吧，扶着栏杆走，别回头'], keywords: ['扶着', '栏杆', '别回头', '不要回头', '扶手', '贴着走'], writes: [T('said.rowan.release'), T('elias.believes.monster', 'sealed'), T('elias.instruction.route', 'rail')], reply: '艾里亚斯：扶着栏杆。……不回头。' },
        { id: 'unsure', label: '先让他等', examples: ['等一下，我再确认一次', '我不确定'], keywords: ['等一下', '不确定', '再看', '再确认', '稍等', '先别'], writes: [], reply: '（被动声纳：货仓方位，一个声源，不动。）\n艾里亚斯：我等你说。', again: '艾里亚斯：我还在等。' },
      ],
    },
    {
      id: 'elias-escape', title: '撤离途中', speaker: 'elias', stage: 'escape', opens: '他开始撤离', closes: '到达门后', multi: true, optional: true,
      defaultTag: 'chat',
      tags: [
        { id: 'route', label: '给路线指示', examples: ['左边扶手，别回头', '贴着墙走'], keywords: ['扶手', '别回头', '不要回头', '栏杆', '贴着', '左边', '右边'], writes: [T('elias.instruction.route', 'rail')], reply: '艾里亚斯：……栏杆。摸到了。' },
        { id: 'encourage', label: '鼓励', examples: ['快到了，你做得很好'], keywords: ['快到了', '做得好', '很好', '加油', '就快'], writes: [ADD('relation.elias.trust', 1)], reply: '（接收机：一声咔。很重，像拿拳头砸在键上。）\n（水听器：井里，两下，一停。比刚才近。）', again: '（……咔。）' },
        { id: 'chat', label: '其他', examples: ['你还好吗'], keywords: ['还好吗', '怎么样', '累'], writes: [], reply: '艾里亚斯：别说话。让我听着脚下。' },
      ],
    },
    {
      id: 'elias-farewell', title: '告别', speaker: 'elias', stage: 'done', opens: '撤离片核验后', closes: '确认离港', multi: true, optional: true,
      defaultTag: 'thanks',
      tags: [
        { id: 'records', label: '请他找值班记录', examples: ['路上看到值班记录，帮我留着', '帮我找找记录'], keywords: ['记录', '值班', '日志', '资料', '留着'], writes: [T('commitment.elias.records')], reply: '', branches: [
          { when: [IS('elias.knows.rowanRole', 'investigator')], reply: '艾里亚斯：……我刚说九个人。你要的是表。\n艾里亚斯：值班表在下一层。那天那一页，我也想看。' },
          { when: [], reply: '艾里亚斯：……我刚说九个人。你要的是记录。\n艾里亚斯：好。我留意。' },
        ] },
        { id: 'give-name', label: '报上名字', examples: ['我叫罗温'], keywords: ['罗温', '我叫', '名字'], writes: [T('elias.knows.rowanName')], reply: '艾里亚斯：罗温。……好。我记住了。', again: '艾里亚斯：记着呢，罗温。' },
        { id: 'meet-gate', label: '约定在下面会合', examples: ['我们下面见', '在下面碰头'], keywords: ['下面见', '碰头', '会合', '汇合', '见面', '下一层'], writes: [T('commitment.elias.meet', 'gate')], reply: '艾里亚斯：下面见。我从里面找路。' },
        { id: 'keep-channel', label: '约定保持频道', examples: ['别关频道，保持联系', '一直保持联系'], keywords: ['频道', '保持联系', '别关', '联系', '通话'], writes: [T('commitment.elias.meet', 'keepChannel')], reply: '艾里亚斯：……开着。我不说话，每半分钟按一下载波。哪天没有咔声了——别喊我。那是我在躲。' },
        { id: 'ask-accident', label: '问事故', examples: ['到底发生了什么'], keywords: ['发生了什么', '事故', '怎么回事', '其他人'], writes: [T('testimony.elias.accident')], reply: ACCIDENT, again: ACCIDENT_AGAIN },
        { id: 'thanks', label: '道谢 / 关心', examples: ['保重', '你也小心'], keywords: ['保重', '小心', '谢谢', '注意安全', '照顾好'], writes: [ADD('relation.elias.trust', 1)], reply: '@echo:farewell-line', again: '艾里亚斯：你也是。' },
        { id: 'cold', label: '冷淡 / 怀疑', examples: ['走吧', '我还不信你'], keywords: ['走吧', '不信', '怀疑', '随便', '快走'], writes: [ADD('relation.elias.trust', -1)], reply: '@echo:farewell-line', again: '艾里亚斯：……嗯。' },
      ],
    },
  ],

  shots: [
    { id: 'PT-001', title: '进港自由拍摄', stage: 'entry', reads: ['pod.lamp', 'pod.pulse', 'pod.hull'], slots: [], note: '只有物理内容，输入不影响画面' },
    { id: 'PT-002', title: '接通与停发', stage: 'stop', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone'], slots: [], note: '只允许间接痕迹，输入不影响画面' },
    {
      id: 'PT-003', title: '01 断桥威胁确认', stage: 'photo', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'elias.location', 'corpse.present'], note: '怪物伸手靠近他是物理事实，不变；变的是这5秒他在做什么',
      slots: [{ slot: 'elias_beat', cases: [
        { when: [IS('elias.instruction.hold', 'freeze')], key: 'frozen', en: 'He keeps perfectly still against the wall, one claw-like hard-suit gripper held over his helmet lamp, a thin line of light leaking past it.', zh: '艾里亚斯贴墙不动，夹钳挡住头灯，漏出一线光。' },
        { when: [IS('elias.instruction.hold', 'signal')], key: 'signals_pod', en: 'One hard-suit claw lifts a few centimetres off the rail toward the dark submarine, barely moving.', zh: '艾里亚斯的一只夹钳离开栏杆几厘米，朝黑暗中的潜艇极轻地示意。' },
        { when: [LE('relation.elias.trust', -1)], key: 'guarded', en: 'He keeps his back to the wall and his face turned away from the submarine.', zh: '艾里亚斯背贴墙，脸背向潜艇。' },
        { when: [], key: 'listening', en: 'He turns his helmet slightly toward the doorway, as if he heard something.', zh: '艾里亚斯微微转向门洞，像是听见了什么。' },
      ] }],
    },
    {
      id: 'PT-004', title: '计划与供电', stage: 'power', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'elias.location', 'corpse.present'], note: '他在对岸等待；由看片报告决定表演',
      slots: [
        { slot: 'elias_beat', cases: [
          { when: [IS('elias.believes.monster', 'near_me')], key: 'hidden', en: 'He has moved off the door and drawn back into the shadow, helmet lamp covered, without moving.', zh: '艾里亚斯已离开门，退进阴影，挡着头灯，一动不动。' },
          { when: [IS('elias.believes.monster', 'told_nothing')], key: 'peeking', en: 'He leans out half a step to look toward the doorway himself.', zh: '艾里亚斯探出半步，自己去看门洞。' },
          { when: [IS('rowan.demeanor', 'afraid')], key: 'palm_stay', en: 'He holds one flat palm toward the submarine, asking it to stay.', zh: '艾里亚斯朝潜艇竖起手掌，示意别走。' },
          { when: [], key: 'watching', en: 'The same diving-suited survivor waits beside the roller door and looks toward the submarine.', zh: '艾里亚斯在卷帘门旁等待。' },
        ] },
        { slot: 'corpse', gap: '尸体模型缺失', cases: [
          { when: [IS('corpse.present', 'background'), IS('rowan.notedBody')], key: 'noted', en: 'Below the platform, a body floats face down against the broken railing, clearly visible in the light.', zh: '平台下，一具脸朝下的尸体挂在断栏杆上，清晰可见。' },
          { when: [IS('corpse.present', 'background')], key: 'background', en: 'Below the platform, a body floats face down, caught against the broken railing, small in the background.', zh: '平台下远处漂着一具脸朝下的尸体。' },
          { when: [], key: 'none', en: '', zh: '' },
        ] },
      ],
    },
    { id: 'PT-005', title: '货舱诱导', stage: 'lure', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone'], slots: [], note: '艾里亚斯不在画面，输入不影响' },
    { id: 'PT-007', title: '隔离确认', stage: 'close', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone'], slots: [], note: '艾里亚斯不在画面，输入不影响' },
    {
      id: 'VP-012', title: '撤离途中', stage: 'escape', reads: ['pod.lamp', 'pod.hull', 'elias.location'], note: '证据无效的过程片',
      slots: [{ slot: 'elias_beat', cases: [
        { when: [IS('elias.instruction.route', 'rail')], key: 'rail', en: 'He keeps one hand on the rail and never looks back.', zh: '艾里亚斯扶着栏杆走，没有回头。' },
        { when: [LE('relation.elias.trust', -1)], key: 'glance_back', en: 'He stops once to look back toward the cargo gate.', zh: '艾里亚斯停下回望货仓闸门。' },
        { when: [], key: 'walking', en: 'The diving-suited survivor walks along an inner emergency corridor behind a glass partition.', zh: '艾里亚斯沿内侧走廊行走。' },
      ] }],
    },
    {
      id: 'VP-011', title: '撤离结果', stage: 'departure', reads: ['pod.lamp', 'pod.hull', 'elias.location', 'corpse.present'], note: '任务片；位置句只保留位置，举手动作移入表演槽位',
      slots: [
        { slot: 'elias_beat', cases: [
          { when: [GE('relation.elias.trust', 1)], key: 'trust_wave', en: 'Behind the observation window he turns back and lifts his helmet lamp toward the submarine, holding it there.', zh: '艾里亚斯在观察窗后回身，朝潜艇举起头灯，停住。' },
          { when: [LE('relation.elias.trust', -1)], key: 'wary', en: 'He checks behind him and does not look toward the submarine.', zh: '艾里亚斯确认身后，没有看潜艇。' },
          { when: [], key: 'still', en: 'He stands behind the door, breathing hard, looking at nothing.', zh: '艾里亚斯站在门后喘息。' },
        ] },
        { slot: 'corpse', gap: '尸体模型缺失', cases: [
          { when: [IS('corpse.present', 'background'), IS('rowan.notedBody')], key: 'noted', en: 'Below the platform, a body floats face down against the broken railing, clearly visible in the light.', zh: '平台下，一具脸朝下的尸体挂在断栏杆上，清晰可见。' },
          { when: [IS('corpse.present', 'background')], key: 'background', en: 'Below the platform, a body floats face down, caught against the broken railing, small in the background.', zh: '平台下远处漂着一具脸朝下的尸体。' },
          { when: [], key: 'none', en: '', zh: '' },
        ] },
      ],
    },
    { id: 'PT-009', title: '离港', stage: 'done', reads: ['pod.lamp', 'pod.hull'], slots: [], note: '艾里亚斯已离开画面' },
  ],

  optional: [
    { id: 'body-photo', label: '从01补拍尸体位置并核验', stage: 'report', requires: [IS('rowan.notedBody')], sets: [T('evidence.bodyPosition')], gap: '依赖尸体模型' },
  ],

  echoes: [
    { id: 'vance-fade-line', title: '万斯衰减句', level: 1, kind: 'line', perspective: 'vance', reads: ['vance.knows.rowanUneasy', 'vance.lastHeard'], cases: [
      { when: [IS('vance.knows.rowanUneasy'), IS('vance.lastHeard', 'afraid')], text: '万斯：……罗温，慢慢来，我在——' },
      { when: [IS('vance.lastHeard', 'afraid')], text: '万斯：怕就停一下，呼吸，我——' },
      { when: [IS('vance.lastHeard', 'doubt')], text: '万斯：知道什么？——签字栏空着不代表——罗温，报压差，报压差！' },
      { when: [IS('vance.lastHeard', 'question')], text: '万斯：听得到。沿通道继续，我会——' },
      { when: [IS('vance.lastHeard', 'steady')], text: '万斯：好。保持——' },
      { when: [], text: '万斯：罗温？你那边——' },
    ] },
    { id: 'farewell-line', title: '告别第一句', level: 1, kind: 'line', perspective: 'elias', reads: ['said.rowan.promisedRescue', 'relation.elias.trust'], cases: [
      { when: [IS('said.rowan.promisedRescue'), GE('relation.elias.trust', 0)], text: '艾里亚斯：你说你会来。桥是断的，可你还是来了。' },
      { when: [IS('said.rowan.downplayed')], text: '艾里亚斯：……你走吧。下一层要是再碰上，我先听，再听你。' },
      { when: [GE('relation.elias.trust', 1)], text: '艾里亚斯：谢谢。真的。\n艾里亚斯：值班室在下一层。我路过就翻翻，看那天谁在班上。……下面见。' },
      { when: [LE('relation.elias.trust', -1)], text: '艾里亚斯：……我先走了。\n艾里亚斯：你要查事故，下一层也有门。到时候再说。' },
      { when: [], text: '艾里亚斯：谢谢。\n艾里亚斯：我从里面找路下去。你走你的航道……下面见。' },
    ] },
    { id: 'farewell-open', title: '告别开场句', level: 1, kind: 'line', perspective: 'elias', reads: ['elias.instruction.route', 'relation.elias.trust', 'said.rowan.falseClear'], cases: [
      { when: [IS('elias.instruction.route', 'rail'), GE('relation.elias.trust', 1)], text: '艾里亚斯：看完了？片子上要是还有别的东西，现在就说。……我数三下。一。……二。……三。……好，只有我。\n艾里亚斯：那天我也这么等过。广播点名，从一叫到九，一个都没应。叫到我，我在泵房里喊到嗓子破——门外听不见。名单上，我也是没应。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
      { when: [GE('said.rowan.falseClear', 1)], text: '艾里亚斯：看完了？……这回你别急着说安全。片子上要是还有别的，现在就说。我数三下。一。……二。……三。\n艾里亚斯：那天我也这么等过。广播点名，从一叫到九，一个都没应。叫到我，我在泵房里喊到嗓子破——门外听不见。名单上，我也是没应。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
      { when: [], text: '艾里亚斯：看完了？片子上要是还有别的东西，现在就说。……我数三下。一。……二。……三。……好，只有我。\n艾里亚斯：那天我也这么等过。广播点名，从一叫到九，一个都没应。叫到我，我在泵房里喊到嗓子破——门外听不见。名单上，我也是没应。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
    ] },
    { id: 'lure-line', title: '入仓片回应', level: 1, kind: 'line', perspective: 'elias', reads: ['said.rowan.downplayed', 'said.rowan.falseClear', 'relation.elias.trust'], cases: [
      { when: [IS('said.rowan.downplayed')], text: '艾里亚斯：拍到了？……这回别骗我。\n艾里亚斯：关声纳。慢慢出来，回去关门。' },
      { when: [GE('said.rowan.falseClear', 1)], text: '艾里亚斯：拍到了？……上次你也说安全。这次我等你关上门再信。\n艾里亚斯：关声纳。慢慢回去。别出声。' },
      { when: [GE('relation.elias.trust', 1)], text: '艾里亚斯：拍到了？……别告诉我它长什么样。\n艾里亚斯：关声纳。慢慢出来，比你想的还要慢。回去关门。' },
      { when: [], text: '艾里亚斯：……拍到了？关声纳。慢慢出来，比你想的还要慢。回去关门。' },
    ] },
    { id: 'log', title: '日志证词', level: 1, kind: 'log', perspective: 'world', reads: ['testimony.vance.official', 'testimony.elias.accident'], cases: [
      { when: [IS('testimony.vance.official'), IS('testimony.elias.accident')], text: '日志含两条证词：公司口径（来源万斯）与“泄压门落下、闸门不知谁开”（来源艾里亚斯），均标为证词。' },
      { when: [IS('testimony.elias.accident')], text: '日志含艾里亚斯证词一条。' },
      { when: [IS('testimony.vance.official')], text: '日志含公司口径一条。' },
      { when: [], text: '日志无证词，只有现场录像。' },
    ] },
    { id: 'body-objective', title: '可选目标：拍尸体位置', level: 1, kind: 'objective', perspective: 'rowan', reads: ['rowan.notedBody'], gap: '依赖尸体模型', cases: [
      { when: [IS('rowan.notedBody')], text: '出现可选目标“从01换角度拍尸体位置”。' },
      { when: [], text: '不出现。' },
    ] },
    { id: 'l2-tape', title: '第二关远端录像', level: 2, kind: 'video', perspective: 'elias', reads: ['commitment.elias.records', 'relation.elias.trust'], gap: '第二关尚未读取；远端录像是否改用生成视频待定', cases: [
      { when: [IS('commitment.elias.records'), GE('relation.elias.trust', 0)], text: '多一卷：他把值班记录夹举到探头前，自己出镜。' },
      { when: [IS('commitment.elias.records')], text: '多一卷：只拍记录夹，他不出镜。' },
      { when: [LE('relation.elias.trust', -1)], text: '他只拍粘液，不拍自己。' },
      { when: [], text: '常规回传，他偶尔出镜。' },
    ] },
    { id: 'l2-meet', title: '第二关会合句', level: 2, kind: 'line', perspective: 'elias', reads: ['commitment.elias.meet'], gap: '第二关尚未读取', cases: [
      { when: [IS('commitment.elias.meet', 'gate')], text: '密码闸门开启时：“说好了下面见。”' },
      { when: [IS('commitment.elias.meet', 'keepChannel')], text: '固定通话失效前最后一句：“我一直开着……听不到了吗？”' },
      { when: [], text: '常规会合句。' },
    ] },
    { id: 'l4-confront', title: '第四关对质', level: 4, kind: 'line', perspective: 'elias', reads: ['elias.knows.rowanAskedBody', 'said.rowan.downplayed', 'said.rowan.falseClear', 'relation.elias.trust'], gap: '第四关尚未读取', cases: [
      { when: [IS('elias.knows.rowanAskedBody')], text: '他提起：“你在港口问过我。”（承认内容为正典固定，只改语气）' },
      { when: [IS('said.rowan.downplayed')], text: '他反问：“你在港口也说外面没什么。”' },
      { when: [GE('said.rowan.falseClear', 1)], text: '他反问：“你当时就想让我出去。”' },
      { when: [], text: '常规对质。' },
    ] },
    { id: 'l4-evidence', title: '第四关兄弟身份比对', level: 4, kind: 'report', perspective: 'world', reads: ['evidence.bodyPosition'], gap: '第四关尚未读取', cases: [
      { when: [IS('evidence.bodyPosition')], text: '首关尸体位置照片加入比对，证据更强。' },
      { when: [], text: '只能依靠港口旧片与他的陈述。' },
    ] },
    { id: 'l5-vance', title: '第五关万斯回应', level: 5, kind: 'line', perspective: 'vance', reads: ['vance.lastHeard', 'vance.knows.rowanUneasy', 'relation.vance.rapport'], gap: '第五关尚未读取', cases: [
      { when: [IS('vance.lastHeard', 'afraid')], text: '万斯：“你最后说你害怕。我一直记着。”' },
      { when: [IS('vance.lastHeard', 'doubt')], text: '万斯：“你最后问我是不是早就知道。现在我可以回答了。”' },
      { when: [LE('relation.vance.rapport', -1)], text: '万斯语气生硬，先核对身份。' },
      { when: [], text: '常规恢复通话。' },
    ] },
    { id: 'l5-report', title: '最终报告', level: 5, kind: 'report', perspective: 'world', reads: ['testimony.vance.official', 'testimony.elias.accident', 'evidence.threat', 'evidence.bodyPosition', 'commitment.elias.records'], gap: '第五关尚未读取', cases: [
      { when: [IS('evidence.bodyPosition'), IS('testimony.elias.accident')], text: '报告含首关尸体位置照片与艾里亚斯证词，分栏列出。' },
      { when: [IS('testimony.elias.accident')], text: '报告含艾里亚斯证词（标为证词）。' },
      { when: [], text: '报告首关部分只有现场录像。' },
    ] },
  ],

  presets: [
    { id: 'calm', title: '冷静指挥', toggles: [], picks: {
      'vance-entry': ['smalltalk'], 'vance-fade': ['steady'], 'elias-contact': ['hold'], 'elias-warning': ['comply'], 'elias-report': ['truthful'],
      'elias-action': ['ask-self', 'comfort'], 'elias-confirm': ['release-route'], 'elias-farewell': ['meet-gate', 'thanks'],
    } },
    { id: 'soothe', title: '安抚隐瞒', toggles: [], picks: {
      'vance-entry': ['unease'], 'vance-fade': ['afraid'], 'elias-contact': ['promise'], 'elias-report': ['downplay'],
      'elias-action': ['call-out', 'hurry'], 'elias-confirm': ['release'], 'elias-farewell': ['cold'],
    } },
    { id: 'investigate', title: '好奇调查（假设尸体就位）', toggles: ['corpse', 'body-photo'], picks: {
      'vance-entry': ['ask-accident', 'question-mission'], 'vance-fade': ['doubt'], 'elias-contact': ['id-investigator'], 'elias-report': ['ask-body'],
      'elias-action': ['ask-accident', 'ask-self'], 'elias-confirm': ['unsure', 'release'], 'elias-farewell': ['records', 'keep-channel'],
    } },
  ],
};
