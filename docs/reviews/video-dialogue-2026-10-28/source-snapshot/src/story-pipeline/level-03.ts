import type { Pipeline, Tag, Write } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });

type Mood = 'care' | 'ask' | 'order' | 'warn' | 'comfort' | 'doubt' | 'other';

/**
 * 每个通话窗通用的语气分类：结果写入 said.last，下一卷录像开头的“回应你”段落据此表演。
 * reply 是他在录像里说的那句话，作为字幕显示。
 */
function talk(replies: Record<Mood, string>, extra: Partial<Record<Mood, Write[]>> = {}): Tag[] {
  const base: Record<Mood, { label: string; examples: string[]; keywords: string[]; writes: Write[] }> = {
    care: { label: '关心他', examples: ['你还好吗', '冷不冷'], keywords: ['还好吗', '冷不冷', '冷吗', '受伤', '没事吧', '怎么样', '累不累', '撑得住'], writes: [ADD('relation.elias.trust', 1)] },
    ask: { label: '问问题', examples: ['这是哪里', '那是什么'], keywords: ['什么', '哪里', '怎么', '为什么', '在哪', '下一步', '发生了'], writes: [] },
    order: { label: '让他做事', examples: ['你先往前走', '帮我看看'], keywords: ['你去', '帮我', '快去', '你先', '按我说', '往前走', '继续走'], writes: [] },
    warn: { label: '提醒他小心', examples: ['小心点', '注意身后'], keywords: ['小心', '注意', '身后', '后面', '背后', '别回头', '快跑'], writes: [] },
    comfort: { label: '安慰他', examples: ['别怕，我在', '会没事的'], keywords: ['别怕', '我在', '放心', '会没事', '相信我', '有我'], writes: [ADD('relation.elias.trust', 1)] },
    doubt: { label: '怀疑他', examples: ['你到底是谁', '你是不是在骗我'], keywords: ['你到底', '骗我', '你是谁', '不对劲', '可疑', '撒谎', '隐瞒'], writes: [ADD('relation.elias.trust', -1)] },
    other: { label: '其他', examples: ['嗯', '收到'], keywords: ['收到', '好的', '明白', '知道了', '嗯'], writes: [] },
  };
  return (Object.keys(base) as Mood[]).map(m => ({
    id: m, label: base[m].label, examples: base[m].examples, keywords: base[m].keywords,
    writes: [T('said.last', m), ...base[m].writes, ...(extra[m] ?? [])], reply: replies[m],
  }));
}

/**
 * 第三关：-2层深渊生物研究所《术前检查》。
 * 罗温（潜艇，外圈水道）打字，艾里亚斯（步行，内圈走廊）拍录像回复；两人互补信息过关。
 * 结尾护理员摘下艾里亚斯的头盔，他不需要呼吸。设计见 docs/level-03-abyssal-lab-design.md。
 */
export const level03: Pipeline = {
  id: 'level-03',
  chapter: 3,
  title: '第三关（-2层）· 深渊生物研究所：术前检查',
  synopsis: '罗温沉到负二层的深海生物研究所，探头线缆到头，艾里亚斯拔线步行。从此罗温打字，艾里亚斯只能拍录像回他。去下一层的竖井在螺旋正中的手术室底下，罗温走外圈水道，艾里亚斯走内圈走廊。前半段只有尸体，头盔都被拧开了；收容环的红色警报里，一条细长的腿出现在他身后；生产车间停电时，门外有很多条腿走过。术前准备室里，他念出护理员的工作流程：摘头盔，查能不能在水里呼吸，挂合格或不合格。手术室里，罗温的照片说它在顶上睡着，可照片是二十秒前的。护理员摘下了艾里亚斯的头盔。他没有呼吸，也没有淹死。它给他挂上了“合格”。',
  status: 'DESIGNED（用户2026-10-23确认剧情）· 剧情状态机已写 / 3D关卡、生物、SAN干扰、录像回复链路 NOT_IMPLEMENTED',
  sourceDoc: 'docs/level-03-abyssal-lab-design.md',
  quota: {
    required: 3,
    capturedFact: 'containment.captured',
    requiredFact: 'containment.required',
    gateFact: 'containment.quotaMet',
    specimens: [
      {
        id: 'SPEC-03A',
        name: '缝合鳗（收容环）',
        trait: '几条鳗鱼缝成的实验体，对声音非常敏感，会冲向发出声音的东西',
        blocker: '在红色警报的收容环大坑里绕圈，挡住去车间的唯一水道',
        countermeasure: '警报响着时它们听不见潜艇，可以直接过但理智持续下降；关掉警报则要关主动声纳、低速贴坑边挪过去',
      },
      {
        id: 'SPEC-03B',
        name: '温床水母（生产车间）',
        trait: '成千上万只小水母追着热源走，培养槽变凉就会离开去找最近的热东西：潜艇发动机',
        blocker: '跳闸后培养槽在变凉，水母随时会离槽扑向潜艇',
        countermeasure: '拍培养槽看清水母挤在2、3、6号槽，告诉艾里亚斯用备用电重新加热这三个槽',
      },
      {
        id: 'SPEC-03C',
        name: '护理员（手术室）',
        trait: '巨型深海蜘蛛改造的护理机器，按流程摘下头盔、检查能否在水里呼吸、挂合格或不合格、放回原处',
        blocker: '倒挂在手术室穹顶，排水竖井阀门就在手术台下',
        countermeasure: '剧情杀后，它被抽水声引向潜艇；拍下它，关灯顺水流冲进竖井',
      },
    ],
  },

  facts: [
    // 客观事实（W）：由宿主游戏同步
    { key: 'lab.stage', layer: 'W', type: 'enum', values: ['descend', 'quarantine', 'lab', 'pit_arrive', 'pit_cross', 'plant_arrive', 'plant_power', 'prep', 'dome_look', 'dome_taken', 'shaft'], initial: 'descend', life: 'level', source: '第三关剧情阶段' },
    { key: 'pod.sedatives', layer: 'W', type: 'int', min: 0, max: 9, initial: 0, life: 'level', source: '已夹回入库的宁神剂数量（泊位3、车间1、准备室1）' },
    { key: 'keybox.delivered', layer: 'W', type: 'bool', initial: false, life: 'level', source: '红色应急钥匙箱已送进实验室传递口' },
    { key: 'sluice.open', layer: 'W', type: 'bool', initial: false, life: 'level', source: '实验室水闸已打开' },
    { key: 'alarm.state', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'on', life: 'level', source: '收容环警报实际状态' },
    { key: 'tanks.state', layer: 'W', type: 'enum', values: ['cooling', 'right_three', 'wrong_three'], initial: 'cooling', life: 'level', source: '培养槽加热实际状态：对上水母所在的2、3、6号即 right_three' },
    { key: 'pit.depth', layer: 'W', type: 'enum', values: ['rim', 'cages', 'floor'], initial: 'rim', life: 'level', source: '潜艇在收容环里下到哪一层：坑缘、井壁中段、坑底（坑底才有出口）' },
    { key: 'pit.sedative', layer: 'W', type: 'bool', initial: false, life: 'level', source: '在第三层敞开的收容舱里夹到宁神剂（可选）' },
    { key: 'san.fakeObeyed', layer: 'W', type: 'bool', initial: false, life: 'level', source: '理智过低时照着假“艾里亚斯”文字消息下沉进冲压沟' },
    { key: 'drain.open', layer: 'W', type: 'bool', initial: false, life: 'level', source: '手术台下的排水阀已被艾里亚斯转开' },
    { key: 'elias.helmet', layer: 'W', type: 'enum', values: ['on', 'removed_then_on'], initial: 'on', life: 'persist', source: '护理员摘下后他自己戴回去' },
    { key: 'elias.tag', layer: 'W', type: 'enum', values: ['none', 'passed'], initial: 'none', life: 'persist', source: '护理员挂在他手腕上的牌子' },

    // 证据与收容配额（E）：分析台核验后写入
    { key: 'containment.required', layer: 'E', type: 'int', min: 1, max: 5, initial: 3, life: 'level', source: '总部要求：-2层拍齐3种生物' },
    { key: 'containment.captured', layer: 'E', type: 'int', min: 0, max: 5, initial: 0, life: 'persist', source: '分析台已核验的-2层生物录像数' },
    { key: 'containment.quotaMet', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '推导：captured >= required；不满足则竖井锁不开' },
    { key: 'photo.pit', layer: 'E', type: 'bool', initial: false, life: 'level', source: '罗温拍到收容环里缝合鳗的位置（SPEC-03A）' },
    { key: 'photo.tanks', layer: 'E', type: 'bool', initial: false, life: 'level', source: '罗温拍到水母挤在2、3、6号培养槽（SPEC-03B）' },
    { key: 'photo.domeTop', layer: 'E', type: 'bool', initial: false, life: 'level', source: '罗温拍到护理员倒挂在穹顶最高处（二十秒前的画面）' },
    { key: 'photo.cage07', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '可选：坑底07号收容舱，观察窗从里往外爆开（P05）' },
    { key: 'photo.trough', layer: 'E', type: 'bool', initial: false, life: 'level', source: '可选：坑底回收槽里挂“不合格”牌子的尸体（P06）' },
    { key: 'photo.caretaker', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '逃离时拍到追向潜艇的护理员（SPEC-03C）' },
    { key: 'tape.helmetOff', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '第10卷：探头自动上传了摘头盔的全过程' },

    // 罗温知道的事（K）
    { key: 'rowan.knows.videoOnly', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'level', source: '开场线缆断开时艾里亚斯说“我只能拍录像回你，打不了字”，用来识破假文字消息' },
    { key: 'rowan.knows.helmetsUnscrewed', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'level', source: '第2卷：尸体头盔的卡扣是被拧开的' },
    { key: 'rowan.knows.protocol', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '第8卷：护理员摘头盔、查呼吸、挂合格或不合格' },
    { key: 'rowan.knows.eliasNoBreath', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '第10卷：头盔摘下后他没有呼吸，被挂上“合格”' },

    // 关系（R）
    { key: 'relation.elias.trust', layer: 'R', type: 'int', min: -3, max: 3, initial: 0, life: 'persist', source: '关心、安慰加一，怀疑减一；每个通话窗同类话只算一次' },

    // 罗温说过的话（S）：驱动录像回应
    { key: 'said.last', layer: 'S', type: 'enum', values: ['none', 'care', 'ask', 'order', 'warn', 'comfort', 'doubt', 'other'], initial: 'none', life: 'level', source: '罗温在当前通话窗最后一句话的语气，决定下一卷录像开头他怎么回应' },
    { key: 'order.alarm', layer: 'S', type: 'enum', values: ['none', 'keep', 'cut'], initial: 'none', life: 'level', source: '罗温让他保留还是关掉警报' },
    { key: 'asked.cages', layer: 'S', type: 'bool', initial: false, life: 'level', source: '罗温在坑里问他哪些收容舱还锁着' },
    { key: 'asked.cage07', layer: 'S', type: 'bool', initial: false, life: 'level', source: '罗温把07号收容舱的照片发给他、问那是什么' },
    { key: 'said.warnedBehind', layer: 'S', type: 'bool', initial: false, life: 'level', source: '看完第4卷后罗温有没有提醒他身后有东西' },
    { key: 'order.tanks', layer: 'S', type: 'enum', values: ['none', 'photo', 'guess'], initial: 'none', life: 'level', source: '罗温报的槽号是照片上的2、3、6，还是随口猜的' },
    { key: 'order.dome', layer: 'S', type: 'enum', values: ['none', 'descend', 'wait', 'hide', 'other'], initial: 'none', life: 'persist', source: '看完穹顶照片后罗温让他下去、等、躲，或说了别的' },
    { key: 'said.final', layer: 'S', type: 'enum', values: ['none', 'who', 'care', 'away', 'silent'], initial: 'none', life: 'persist', source: '竖井里罗温的最后一句话' },
  ],

  stages: [
    {
      id: 'descend', title: '00 线缆到头', dialogueStages: ['descend'],
      narrative: '潜艇挂着配重沉进下行井，线缆在四十米绷直。艾里亚斯拔掉了线：“下面是研究所，墙上有数据终端。你打字，我在屏幕上看；我这边只能拍录像回你，打不了字。”潜艇沉进岩洞，管线之间卡着两个没戴头盔的人，理智开始往下掉。',
      objective: '沉到井底，进入研究所外圈水道',
      advance: '线缆断开，抵达检疫泊位',
      gate: ['rowan.knows.videoOnly'],
      sets: [T('lab.stage', 'descend'), T('rowan.knows.videoOnly')],
    },
    {
      id: 'quarantine', title: '01 检疫泊位：分头走、拿宁神剂', dialogueStages: ['quarantine'],
      narrative: '第1卷：他说明怎么通话，拍墙上的地图（竖井在中心手术室底下，你走水道我走走廊），再拍告示：进收容区前必须服宁神剂，药在泊位北边架子上的白色红十字箱子里。罗温夹回3箱。罗温第一次打字后，第2卷：他回应罗温，然后拍地上的尸体，头盔卡扣是被拧开的，“谁会在水里把别人的头盔拧下来？”',
      objective: '看第1卷 · 夹回北边架子上的3个白色医疗箱 · 第一次打字给他',
      advance: '宁神剂入库，看完第2卷',
      gate: ['rowan.knows.helmetsUnscrewed'],
      sets: [T('lab.stage', 'quarantine'), T('pod.sedatives', 3), T('rowan.knows.helmetsUnscrewed')],
    },
    {
      id: 'lab', title: '02 研究实验室：钥匙在淹掉的3号舱', dialogueStages: ['lab'],
      narrative: '水闸挡住水道。第3卷：开闸要进实验室控制室，控制室的备用钥匙在3号实验舱的红色应急钥匙箱里；3号舱全淹了，他开门会把整条走廊淹掉，请罗温夹出来从传递口塞给他。罗温送进钥匙箱，他跑去开闸，水闸升起，后面透出红光。',
      objective: '看第3卷 · 去3号实验舱夹红色钥匙箱 · 送进通话窗旁的传递口',
      advance: '水闸打开',
      gate: ['keybox.delivered', 'sluice.open'],
      sets: [T('lab.stage', 'lab'), T('keybox.delivered'), T('sluice.open')],
    },
    {
      id: 'pit_arrive', title: '03 收容环：警报与身后的腿', dialogueStages: ['pit_arrive'],
      narrative: '水闸后的弯道一拐，眼前是一口直径68米、深70米的红色深坑，六层144盏警报灯在转，坑壁一圈圈都是收容舱。原来横越坑口的出口被一架塌下来的收容舱吊车堵死，唯一的出路是坑底的排水通道。第4卷：他在坑缘的监控室念档案，缝合鳗对声音非常敏感，现在警报盖住了潜艇的声音；他快被逼疯了，问关不关。他说话时，身后门口一条细长的腿伸下来停了三秒，又缩回去。罗温在窗旁的坑缘往下拍，看到缝合鳗在深处绕圈。',
      objective: '看第4卷 · 拍坑里找到缝合鳗（配额1/3）',
      advance: '缝合鳗录像核验',
      gate: ['photo.pit'],
      sets: [T('lab.stage', 'pit_arrive'), T('photo.pit'), ADD('containment.captured', 1)],
    },
    {
      id: 'pit_cross', title: '04 收容环：沿井壁下到坑底', dialogueStages: ['pit_cross'],
      narrative: '罗温告诉他保留还是关掉警报，可以顺便提醒身后有东西。第5卷：他照做；被提醒时他猛地回头，门口空着，只有门框顶上一道新的长刮痕。之后罗温自己沿着井壁一圈圈往下探：警报开着就能放心慢慢看，但理智一直在掉；关掉了就得关声纳、低速贴着收容舱挪。第三层一只敞开的收容舱里有一箱宁神剂。坑底正中是一个回收槽，里面堆着挂“不合格”牌子的尸体；坑底最大的07号收容舱，观察窗从里面往外爆开了。罗温随时可以回坑缘问他：哪些收容舱还锁着（第5b卷），或者把07号收容舱的照片发给他（第5c卷）。坑底的排水通道一路往上爬，通进生产车间。',
      objective: '告诉他关不关警报 · 沿井壁下到坑底 · （可选）夹第三层的宁神剂、拍07号收容舱和回收槽',
      advance: '从坑底排水通道进入生产车间',
      gate: [],
      sets: [T('lab.stage', 'pit_cross'), T('pit.depth', 'floor')],
    },
    {
      id: 'plant_arrive', title: '05 生产车间：水母追热', dialogueStages: ['plant_arrive'],
      narrative: '第6卷：他念警告牌，温床水母追热，培养槽断电后会离开；刚才跳闸，所有槽都在变凉，最近的热东西是潜艇发动机。备用电只够开三个槽，可他看不见槽里，请罗温拍。罗温拍培养槽，水母挤在槽身大字写着的2、3、6号上。',
      objective: '看第6卷 · 拍培养槽（配额2/3）',
      advance: '水母录像核验',
      gate: ['photo.tanks'],
      sets: [T('lab.stage', 'plant_arrive'), T('photo.tanks'), ADD('containment.captured', 1)],
    },
    {
      id: 'plant_power', title: '06 生产车间：停电', dialogueStages: ['plant_power'],
      narrative: '罗温报出槽号。第7卷：他一个一个推上开关，推上最后一个时整个控制室的灯灭了。黑暗里嗒、嗒、嗒，像很多根细棍子敲地，从门外经过又走远。灯亮后他压低声音：“刚才门外有东西走过去。很多条腿。”罗温开过车间，在沟尽头夹回一箱宁神剂。',
      objective: '告诉他开哪三个槽 · 开过车间 · 夹回宁神剂',
      advance: '到达术前准备室',
      gate: [],
      sets: [T('lab.stage', 'plant_power'), ADD('pod.sedatives', 1)],
    },
    {
      id: 'prep', title: '07 术前准备室：它是什么', dialogueStages: ['prep'],
      narrative: '第8卷（他主动发来）：墙上的护理员工作流程，一条一条大字出现：摘下头盔；检查能不能在水里呼吸；能呼吸的挂合格，不能的挂不合格；放回原处。“外面那些人，都是被它摘了头盔淹死的。”下一页是护理员的照片：巨型深海蜘蛛，腿上装着钳子和夹子。“它就在前面的手术室里。”',
      objective: '看第8卷 · 夹回弯道边的宁神剂',
      advance: '知道护理员是什么，进入手术室',
      gate: ['rowan.knows.protocol'],
      sets: [T('lab.stage', 'prep'), T('rowan.knows.protocol'), ADD('pod.sedatives', 1)],
    },
    {
      id: 'dome_look', title: '08 手术室：帮我看一眼', dialogueStages: ['dome_look'],
      narrative: '第9卷：他在手术室上方走廊，阀门在台子底下，可它往这边来了，他看不到顶上，请罗温拍。罗温拍到护理员倒挂在穹顶最高处，腿全缩着，一动不动。照片是二十秒前的。',
      objective: '看第9卷 · 拍穹顶顶部',
      advance: '拍到穹顶，回复他',
      gate: ['photo.domeTop'],
      sets: [T('lab.stage', 'dome_look'), T('photo.domeTop')],
    },
    {
      id: 'dome_taken', title: '09 手术室：合格', dialogueStages: ['dome_taken'],
      narrative: '不管罗温说什么，第10卷里他都被抓住了。探头掉在地上还连着终端。护理员把他放上手术台，拧开卡扣，摘下头盔挂到墙上。水淹过他的脸，没有一个气泡，他不需要呼吸。护理员给他挂上“合格”，走了。他从墙上取回头盔戴好，转开阀门，手掌捂住镜头。录像是探头自动上传的。',
      objective: '看第10卷',
      advance: '排水阀打开',
      gate: ['tape.helmetOff', 'drain.open'],
      sets: [T('lab.stage', 'dome_taken'), T('tape.helmetOff'), T('elias.helmet', 'removed_then_on'), T('elias.tag', 'passed'), T('rowan.knows.eliasNoBreath'), T('drain.open')],
    },
    {
      id: 'shaft', title: '10 排水竖井：到下面再说', dialogueStages: ['shaft'],
      narrative: '抽水声把护理员引向潜艇。罗温拍下它（配额3/3），关灯顺着水流冲进竖井。竖井旁有最后一个通话窗，罗温打出最后一句话。第11卷：他回应，然后戴着头盔站在抽水的竖井边：“到下面再说。”',
      objective: '拍下护理员（配额3/3）· 关灯冲进竖井 · 说最后一句话',
      advance: '配额3/3 → 竖井锁打开 → 进入-3层',
      gate: ['photo.caretaker', 'containment.quotaMet'],
      sets: [T('lab.stage', 'shaft'), T('photo.caretaker'), ADD('containment.captured', 1)],
    },
  ],

  windows: [
    {
      id: 'l3-quarantine', title: '检疫泊位通话窗（第一次打字）', speaker: 'elias', stage: 'quarantine', opens: '看完第1卷后', closes: '第2卷发出', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: talk({
        care: '艾里亚斯：冷。手一直在抖，头盔里全是雾。',
        ask: '艾里亚斯：这是检疫更衣室，进出都要在这里消毒。你看这个——',
        order: '艾里亚斯：好，我先往里走。等等，你看这个——',
        warn: '艾里亚斯：我知道，我贴着墙走。……你看这个。',
        comfort: '艾里亚斯：嗯。有你在外面就好。',
        doubt: '艾里亚斯：我是谁？我是那个你在断桥上救下来的人。……先看这个。',
        other: '艾里亚斯：收到。你看这个——',
      }),
    },
    {
      id: 'l3-lab', title: '实验室通话窗', speaker: 'elias', stage: 'lab', opens: '潜艇停在实验室通话窗外', closes: '第3卷发出', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: talk({
        care: '艾里亚斯：还行。就是这里太安静了。',
        ask: '艾里亚斯：前面那道水闸要从实验室控制室开。',
        order: '艾里亚斯：我想去开闸，可是门锁着。',
        warn: '艾里亚斯：这边没东西，就是锁着门。',
        comfort: '艾里亚斯：我不怕。我只是在找钥匙。',
        doubt: '艾里亚斯：你要是不信我，就自己看门上写的。',
        other: '艾里亚斯：你听我说，水闸要从控制室开。',
      }),
    },
    {
      id: 'l3-pit-arrive', title: '收容环通话窗（到达）', speaker: 'elias', stage: 'pit_arrive', opens: '潜艇停在收容环通话窗外', closes: '第4卷发出', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: talk({
        care: '艾里亚斯：不好！这灯和这声音快把我逼疯了！',
        ask: '艾里亚斯：这里是监控室！屏幕上说有五个收容舱开了！',
        order: '艾里亚斯：我在监控室！你先听我念！',
        warn: '艾里亚斯：我听不见！警报太响了！',
        comfort: '艾里亚斯：我没事！就是太吵了！',
        doubt: '艾里亚斯：你说什么？我听不清！',
        other: '艾里亚斯：你大点声！警报太响了！',
      }),
    },
    {
      id: 'l3-pit-order', title: '收容环：关不关警报', speaker: 'elias', stage: 'pit_cross', opens: '看完第4卷、拍到缝合鳗之后', closes: '第5卷发出', multi: true, optional: false,
      advanceOn: ['keep-alarm', 'cut-alarm'], defaultTag: 'keep-alarm',
      tags: [
        { id: 'keep-alarm', label: '别关警报，靠警报声盖住潜艇', examples: ['别关警报，警报声能盖住我的船', '警报留着'], keywords: ['别关警报', '不要关警报', '警报别关', '留着', '开着', '别关', '不要关'], writes: [T('order.alarm', 'keep')], reply: '艾里亚斯：好……不关。我再忍一会儿。' },
        { id: 'cut-alarm', label: '关掉警报，我关声纳慢慢挪过去', examples: ['关掉警报吧，我关声纳慢慢过', '关了吧'], keywords: ['关掉警报', '关掉', '关了吧', '关吧', '把警报关', '关警报'], writes: [T('order.alarm', 'cut')], reply: '艾里亚斯：关了。……终于安静了。你慢点开。' },
        { id: 'warn-behind', label: '提醒他身后有东西', examples: ['你身后有东西', '回头看门口'], keywords: ['身后', '后面', '背后', '回头', '门口有', '你后边'], writes: [T('said.warnedBehind')], reply: '艾里亚斯：……什么？' },
      ],
    },
    {
      id: 'l3-pit-explore', title: '收容环：探索时的追问', speaker: 'elias', stage: 'pit_cross', opens: '看完第5卷，潜艇在坑里回到T4附近', closes: '潜艇进入坑底排水通道', multi: true, optional: true,
      advanceOn: [], defaultTag: 'cages',
      tags: [
        { id: 'cages', label: '问哪些收容舱还锁着', examples: ['下面哪些收容舱还关着东西', '哪些收容舱是锁着的'], keywords: ['哪些收容舱', '收容舱还', '锁着', '关着东西', '还关着'], writes: [T('asked.cages'), T('said.last', 'ask')], reply: '艾里亚斯：开着的就那五个。其他的都显示锁着。……最下面那个大的，屏幕上是黑的。' },
        { id: 'cage07', label: '发07号收容舱的照片问他', examples: ['你看这个07号收容舱', '最下面那个收容舱是怎么回事'], keywords: ['07', '零七', '最下面', '大收容舱', '撞开', '观察窗', '爆开'], requires: [IS('photo.cage07')], fallback: '艾里亚斯：最下面？我这边屏幕上那格是黑的，你拍给我看看。', writes: [T('asked.cage07'), T('said.last', 'ask')], reply: '艾里亚斯：……07。那块布上也是07。' },
      ],
    },
    {
      id: 'l3-plant-arrive', title: '生产车间通话窗（到达）', speaker: 'elias', stage: 'plant_arrive', opens: '潜艇停在车间通话窗外', closes: '第6卷发出', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: talk({
        care: '艾里亚斯：耳朵还在响，没事。你听我说，出事了。',
        ask: '艾里亚斯：这里在灌药。培养槽里养的是水母。',
        order: '艾里亚斯：等一下，先听我说，刚才跳闸了。',
        warn: '艾里亚斯：我会小心。可要小心的是你。',
        comfort: '艾里亚斯：谢谢。……先听我说，刚才跳闸了。',
        doubt: '艾里亚斯：现在不是吵这个的时候，跳闸了。',
        other: '艾里亚斯：听我说，刚才跳闸了。',
      }),
    },
    {
      id: 'l3-plant-order', title: '生产车间：开哪三个槽', speaker: 'elias', stage: 'plant_power', opens: '看完第6卷、拍到培养槽之后', closes: '第7卷发出', multi: false, optional: false,
      advanceOn: ['tanks-photo', 'tanks-guess'], defaultTag: 'tanks-guess',
      tags: [
        { id: 'tanks-photo', label: '按照片报2、3、6号', examples: ['开2号、3号、6号', '二三六'], keywords: ['236', '2号3号6号', '二三六', '二号三号六号', '2号3号和6号'], requires: [IS('photo.tanks')], fallback: '艾里亚斯：你拍到槽里了吗？我这边看不见。', writes: [T('order.tanks', 'photo'), T('said.last', 'order')], reply: '艾里亚斯：2号。3号。6号。推上去了。' },
        { id: 'tanks-guess', label: '没看照片，随口报', examples: ['随便开三个', '全开'], keywords: ['随便', '都开', '全开', '前三个', '123', '你看着办', '一二三'], writes: [T('order.tanks', 'guess'), T('said.last', 'order')], reply: '艾里亚斯：……好，我照你说的开。' },
      ],
    },
    {
      id: 'l3-dome-look', title: '手术室：看完照片后的那句话', speaker: 'elias', stage: 'dome_taken', opens: '拍到穹顶顶部之后', closes: '第10卷发出', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: [
        { id: 'descend', label: '让他下去转阀门', examples: ['它在睡，快下去', '它没动，去转阀门'], keywords: ['下去', '快去', '它在睡', '睡着', '没动', '安全', '转阀门', '去吧'], writes: [T('order.dome', 'descend'), T('said.last', 'order')], reply: '艾里亚斯：好。' },
        { id: 'wait', label: '让他等，再拍一张', examples: ['等一下，我再看看', '先别动，我再拍一张'], keywords: ['等一下', '等等', '再看', '再拍', '先别动', '别急'], writes: [T('order.dome', 'wait'), T('said.last', 'order')], reply: '艾里亚斯：好，我等你。' },
        { id: 'hide', label: '让他关灯躲起来', examples: ['关灯，躲起来', '藏好'], keywords: ['躲', '关灯', '藏', '别出声'], writes: [T('order.dome', 'hide'), T('said.last', 'warn')], reply: '艾里亚斯：……关了。' },
        { id: 'other', label: '其他，或者不说话', examples: ['……'], keywords: ['不知道', '我不确定', '随你'], writes: [T('order.dome', 'other'), T('said.last', 'other')], reply: '艾里亚斯：你那边怎么不说话？' },
      ],
    },
    {
      id: 'l3-shaft', title: '竖井：最后一句话', speaker: 'elias', stage: 'shaft', opens: '冲进竖井后', closes: '第11卷发出', multi: false, optional: true,
      advanceOn: '*', defaultTag: 'silent',
      tags: [
        { id: 'who', label: '质问他是什么', examples: ['你到底是什么', '你不是人'], keywords: ['你到底是', '你是什么', '你是谁', '怪物', '不是人', '没有呼吸'], writes: [T('said.final', 'who'), ADD('relation.elias.trust', -1)], reply: '艾里亚斯：……我是艾里亚斯。' },
        { id: 'care', label: '问他还好吗', examples: ['你还好吗', '你没事吧'], keywords: ['还好吗', '没事吧', '怎么样', '疼不疼'], writes: [T('said.final', 'care'), ADD('relation.elias.trust', 1)], reply: '艾里亚斯：我一直都好。' },
        { id: 'away', label: '让他离远点', examples: ['离我远点', '别过来'], keywords: ['离我远', '别过来', '别靠近', '走开', '滚'], writes: [T('said.final', 'away'), ADD('relation.elias.trust', -1)], reply: '（他点点头，往后退了一步。）' },
        { id: 'silent', label: '什么都不说', examples: ['……'], keywords: ['算了', '没什么'], writes: [T('said.final', 'silent')], reply: '（他看着镜头，等了几秒。）' },
      ],
    },
  ],

  shots: [
    {
      id: 'L3-E01', title: '第1卷 分头走（主动）', stage: 'quarantine', videoType: 'elias-story',
      reads: ['lab.stage'], note: '两段。①探头卡在柜门上，他对镜说明通话方式；②拍墙上地图与宁神剂告示。提示词 VP-301、VP-302',
      slots: [{ slot: 'story', cases: [{ when: [], key: 'split_up', en: 'Helmeted diver in a dry locker room explains the plan to the lens, then a wall map and a medicine notice.', zh: '他对着卡在柜门上的探头说明怎么通话；拍墙上地图，竖井在中心手术室下；拍告示，宁神剂在泊位北边架子上。', dialogue: '艾里亚斯：能看到吗？我插上终端了。你打字，我这边屏幕能看到。我只能拍录像回你。\n艾里亚斯：你走外面的水道，我走里面的走廊，手术室碰头。药在泊位北边的架子上，白箱子，红十字。', storyBeat: '交代本关目标、通话方式和宁神剂位置。' }] }],
    },
    {
      id: 'L3-E02', title: '第2卷 头盔', stage: 'quarantine', videoType: 'elias-story',
      reads: ['said.last'], note: '一段。前3秒回应罗温的话，后7秒拍尸体脖子上打开的头盔卡扣。提示词 VP-303',
      slots: [
        { slot: 'reply', cases: [
          { when: [IS('said.last', 'care')], key: 'shivers', en: 'He lifts a trembling gloved hand to the lens; his faceplate is fogged.', zh: '他举起发抖的手套给镜头看，面罩上全是雾。' },
          { when: [IS('said.last', 'doubt')], key: 'stung', en: 'He stops, lowers his head for a beat, then turns away from the lens.', zh: '他停住，低头一秒，转开身。' },
          { when: [IS('said.last', 'comfort')], key: 'nods', en: 'He nods slowly at the lens.', zh: '他对着镜头慢慢点头。' },
          { when: [], key: 'plain', en: 'He nods once at the lens and picks up the probe.', zh: '他对镜头点一下头，拿起探头。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'unscrewed', en: 'Close view of a drowned worker whose helmet ring sits open, latch unscrewed.', zh: '地上一具尸体，头盔卡扣圈还在，卡扣是开的。', dialogue: '艾里亚斯：你看，头盔都没了。不是撞掉的，是有人把卡扣拧开了。\n艾里亚斯：谁会在水里，把别人的头盔拧下来？', storyBeat: '立下全章的问题，第8卷回答。' }] },
      ],
    },
    {
      id: 'L3-E03', title: '第3卷 钥匙', stage: 'lab', videoType: 'elias-story',
      reads: ['said.last'], note: '一段。回应后拍门上大字告示：备用钥匙在3号实验舱。提示词 VP-304',
      slots: [
        { slot: 'reply', cases: [
          { when: [IS('said.last', 'care')], key: 'fine', en: 'He gives a small thumbs-up to the lens.', zh: '他对镜头竖一下大拇指。' },
          { when: [IS('said.last', 'doubt')], key: 'points', en: 'He jabs a finger at the door notice, irritated.', zh: '他有点不耐烦，手指戳了戳门上的告示。' },
          { when: [], key: 'plain', en: 'He turns the lens toward the locked door.', zh: '他把镜头转向锁着的门。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'keybox', en: 'A locked control-room door with a large notice; a flooded hatch glints through a side window.', zh: '锁着的控制室门上，大字告示：备用钥匙在3号实验舱的应急钥匙箱；侧窗外3号舱完全淹没。', dialogue: '艾里亚斯：3号舱已经全淹了。我要是开门，水会灌满整条走廊。\n艾里亚斯：红色的箱子，挂在3号舱墙上。窗户旁边有个传递口，从那儿塞给我。', storyBeat: '他去不了、为什么要罗温去、怎么交接，全部说清。' }] },
      ],
    },
    {
      id: 'L3-E04', title: '第4卷 警报（身后的腿）', stage: 'pit_arrive', videoType: 'elias-story',
      reads: ['said.last', 'alarm.state'], note: '一段。红光扫过他的脸，他念缝合鳗档案并问关不关警报；身后门口一条细长的腿伸下三秒再缩回。提示词 VP-305',
      slots: [
        { slot: 'reply', cases: [
          { when: [IS('said.last', 'care')], key: 'covers_helmet', en: 'He presses both hands to the sides of his helmet in the red strobe.', zh: '他在红光里双手捂住头盔两侧。' },
          { when: [], key: 'shouting', en: 'He leans close to the lens, shouting over the alarm.', zh: '他凑近镜头，扯着嗓子喊。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'leg_in_door', en: 'Red strobe room; behind him a long thin backward-jointed leg lowers into the doorway, pauses, withdraws.', zh: '监控屏写着“收容舱开启：5，收容物：缝合鳗”。他念档案时，身后门口一条细长反折的腿从上方伸下，停三秒，缩回。他没发现。', dialogue: '艾里亚斯：缝合鳗。对声音非常敏感，会冲向发出声音的东西。\n艾里亚斯：现在警报这么响，它们应该听不出你的船。可这灯和这声音快把我逼疯了。我能把警报关掉。关吗？', storyBeat: '恐怖开始：护理员第一次出现，只在他身后，画面正中三秒。' }] },
      ],
    },
    {
      id: 'L3-E05', title: '第5卷 回头', stage: 'pit_cross', videoType: 'elias-story',
      reads: ['order.alarm', 'said.warnedBehind'], note: '一段。按罗温的话保留或关闭警报；被提醒时回头只看到门框顶上的新刮痕。提示词 VP-306',
      slots: [
        { slot: 'alarm', cases: [
          { when: [IS('order.alarm', 'cut')], key: 'alarm_off', en: 'He presses a panel button; the red strobe dies, leaving dim white emergency light.', zh: '他按下按钮，红光熄灭，只剩昏暗的白色应急灯。' },
          { when: [], key: 'alarm_kept', en: 'He leaves the alarm panel untouched; the red strobe keeps sweeping.', zh: '他没碰警报面板，红光继续一下下扫。' },
        ] },
        { slot: 'behind', cases: [
          { when: [IS('said.warnedBehind')], key: 'turns', en: 'He spins toward the empty doorway; a fresh long scratch marks the top of the frame.', zh: '他猛地回头，门口空着，门框顶上一道新的长刮痕。', dialogue: '艾里亚斯：……你看到什么了？', storyBeat: '提醒了他：他知道有东西，但不知道是什么。' },
          { when: [], key: 'walks_off', en: 'He picks up the probe and walks out past the empty doorway.', zh: '他拿起探头，从空着的门口走了出去。' },
        ] },
      ],
    },
    {
      id: 'L3-E05B', title: '第5b卷 锁着的收容舱（可选）', stage: 'pit_cross', videoType: 'elias-story',
      reads: ['asked.cages'], note: '一段。他把探头凑近监控屏，拍收容舱状态表；最底下的07号格子是黑的。提示词 VP-321',
      slots: [{ slot: 'story', cases: [{ when: [], key: 'cage_grid', en: 'He holds the probe close to a monitor grid of containment-cell states; the cell for the largest bottom unit is dead black.', zh: '他把探头凑近监控屏：收容舱状态一格一格排着，五格显示开启，最底下那格大收容舱是黑的。', dialogue: '艾里亚斯：开着的就那五个。其他的都显示锁着。……最下面那个大的，屏幕上是黑的。', storyBeat: '给探索的玩家一个方向：去坑底看看。' }] }],
    },
    {
      id: 'L3-E05C', title: '第5c卷 07（可选）', stage: 'pit_cross', videoType: 'elias-story',
      reads: ['asked.cage07', 'said.warnedBehind'], note: '一段。他看罗温发来的07号收容舱照片，再看那块无菌布上的07。提示词 VP-322',
      slots: [{ slot: 'cloth', cases: [
        { when: [IS('said.warnedBehind')], key: 'already_has', en: 'He holds up the torn drape he found at the door; its stencilled 07 matches the photo.', zh: '他举起门口捡到的那块无菌布，上面的“07”和照片上的铭牌一模一样。', dialogue: '艾里亚斯：……07。这块布上也是07。它是从那个收容舱里出来的。', storyBeat: '玩家自己把门口的东西和坑底的空收容舱连起来。' },
        { when: [], key: 'finds_it', en: 'He turns from the screen, notices a torn drape on the door frame, unhooks it and finds the same 07 stencil.', zh: '他从屏幕前转身，看见门框上挂着一块撕破的无菌布，取下来，上面也印着“07”。', dialogue: '艾里亚斯：……这块布上也是07。它是从那个收容舱里出来的。……它出来以后去哪了？', storyBeat: '没提醒过他的玩家，在这里才知道门口来过东西。' },
      ] }],
    },
    {
      id: 'L3-E06', title: '第6卷 水母', stage: 'plant_arrive', videoType: 'elias-story',
      reads: ['said.last'], note: '一段。回应后拍警告牌：水母追热、断电离槽；说明只能开三个槽，请罗温拍。提示词 VP-307',
      slots: [
        { slot: 'reply', cases: [
          { when: [IS('said.last', 'care')], key: 'rubs_ears', en: 'He taps the side of his helmet as if his ears still ring.', zh: '他敲敲头盔侧面，像耳朵还在响。' },
          { when: [], key: 'plain', en: 'He raises a hand to stop and turns to the wall.', zh: '他抬手示意先听他说，转向墙。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'warning_sign', en: 'Control room with dying gauges; he frames a large warning sign about heat-seeking jellyfish.', zh: '控制室仪表在掉温度；大字警告牌：温床水母会追随热源，培养槽断电后将离开培养槽。', dialogue: '艾里亚斯：所有培养槽都在变凉。离这些水母最近的热东西，就是你的发动机。\n艾里亚斯：备用电只够开三个槽。我看不到槽里。你拍给我看，哪几个槽里有水母？', storyBeat: '他有开关，罗温有眼睛。' }] },
      ],
    },
    {
      id: 'L3-E07', title: '第7卷 停电', stage: 'plant_power', videoType: 'elias-story',
      reads: ['order.tanks'], note: '一段。他推上开关，灯全灭，黑暗中细腿敲地声经过门外。提示词 VP-308',
      slots: [
        { slot: 'switches', cases: [
          { when: [IS('order.tanks', 'photo')], key: 'two_three_six', en: 'He pushes up three breakers marked 2, 3 and 6.', zh: '他推上标着2、3、6的三个开关。' },
          { when: [], key: 'guessed', en: 'He pushes up three breakers at the left end of the row.', zh: '他推上最左边的三个开关。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'blackout', en: 'All lights die; only his helmet lamp lights his hands while something many-legged passes the door.', zh: '灯全灭，只有头盔灯照着他的手；门外有很多条腿嗒嗒走过，又走远。灯亮，他抓起探头快步离开。', dialogue: '艾里亚斯：……刚才门外有东西走过去。很多条腿。', storyBeat: '护理员第二次出现，只有声音和门外掠过的影子。' }] },
      ],
    },
    {
      id: 'L3-E08', title: '第8卷 护理员（主动）', stage: 'prep', videoType: 'elias-story',
      reads: ['rowan.knows.protocol'], note: '两段。①墙上工作流程四行大字；②下一页护理员照片。提示词 VP-309、VP-310',
      slots: [{ slot: 'story', cases: [{ when: [], key: 'protocol', en: 'He reads a four-line procedure chart, then shows a photo of a giant deep-sea spider with surgical tools.', zh: '工作流程：摘下头盔；检查能不能在水里呼吸；能呼吸的挂合格，不能的挂不合格；放回原处。下一页：巨型深海蜘蛛，腿上装着钳子和夹子。', dialogue: '艾里亚斯：外面那些人……都是被它摘了头盔，淹死的。\n艾里亚斯：这就是护理员。它就在前面的手术室里。', storyBeat: '回答第2卷的问题，也让玩家知道结尾要发生什么，但不知道会发生在他身上。' }] }],
    },
    {
      id: 'L3-E09', title: '第9卷 帮我看一眼', stage: 'dome_look', videoType: 'elias-story',
      reads: ['lab.stage'], note: '一段。他趴在上方走廊栏杆，拍下方手术台和满墙头盔，请罗温拍顶上。提示词 VP-311',
      slots: [{ slot: 'story', cases: [{ when: [], key: 'look_for_me', en: 'From a gallery railing he films the operating table and a wall of hanging helmets below.', zh: '从上方栏杆往下拍：手术台，墙上挂满头盔。', dialogue: '艾里亚斯：阀门在台子底下，我得下去转。\n艾里亚斯：可它往这边来了。我从这儿看不到顶上。你帮我拍一下，它在不在上面。', storyBeat: '最后一次合作，信息对上了，但已经晚了二十秒。' }] }],
    },
    {
      id: 'L3-E10', title: '第10卷 合格（剧情杀）', stage: 'dome_taken', videoType: 'elias-story',
      reads: ['order.dome', 'tape.helmetOff', 'elias.tag'], note: '四段。①按罗温的话：下去/等/躲；②探头落地，被放上手术台、摘头盔；③没有气泡，挂上“合格”；④戴回头盔、转阀、手捂镜头。提示词 VP-312至VP-315',
      slots: [
        { slot: 'opening', cases: [
          { when: [IS('order.dome', 'descend')], key: 'at_valve', en: 'He kneels at the valve under the table; above him a long leg slowly lowers into frame.', zh: '他蹲在台下转阀门，画面上方一条腿慢慢垂下来。' },
          { when: [IS('order.dome', 'hide')], key: 'lamp_on', en: 'Total darkness and his breathing; then the surgical lamp above him snaps on.', zh: '一片黑，只有呼吸声；然后他头顶的手术大灯亮了。' },
          { when: [], key: 'waiting', en: 'He sits against the gallery wall facing the lens; a long leg reaches in past the railing behind him.', zh: '他靠墙坐着对着镜头，身后栏杆外一条腿慢慢伸进来。' },
        ] },
        { slot: 'reveal', cases: [{ when: [], key: 'passed', en: 'The helmet is removed underwater; his face stays still with no bubbles; a tag reading PASSED is hung on his wrist.', zh: '护理员把他放上手术台，拧开卡扣摘下头盔；水淹过他的脸，一个气泡都没有；它在他手腕挂上“合格”，走了。他取回头盔戴上，转开阀门，手掌捂住镜头。', dialogue: '（没有台词。只有水声和金属声。）', storyBeat: '揭露：艾里亚斯不需要呼吸。之前的录像没有任何暗示。' }] },
      ],
    },
    {
      id: 'L3-E11', title: '第11卷 到下面再说', stage: 'shaft', videoType: 'elias-story',
      reads: ['said.final'], note: '一段。回应罗温最后一句话，然后“到下面再说”。提示词 VP-316',
      slots: [
        { slot: 'reply', cases: [
          { when: [IS('said.final', 'who')], key: 'long_silence', en: 'He stands very still for a long moment, then answers.', zh: '他很久不动，然后回答。', dialogue: '艾里亚斯：……我是艾里亚斯。' },
          { when: [IS('said.final', 'care')], key: 'tears_tag', en: 'He looks at the tag on his wrist and tears it off.', zh: '他看着手腕上的牌子，把它扯下来。', dialogue: '艾里亚斯：我一直都好。' },
          { when: [IS('said.final', 'away')], key: 'steps_back', en: 'He nods and takes one step back, half out of frame.', zh: '他点点头，往后退一步，半个身子出了画面。' },
          { when: [], key: 'waits', en: 'He simply looks at the lens for a few seconds.', zh: '他看着镜头，等了几秒。' },
        ] },
        { slot: 'story', cases: [{ when: [], key: 'see_you_below', en: 'Helmeted again, he stands on a platform above the draining shaft.', zh: '他戴着头盔，站在正在抽水的竖井上方平台。', dialogue: '艾里亚斯：到下面再说。', storyBeat: '第三关结束，悬念留给第四关。' }] },
      ],
    },
    {
      id: 'L3-P01', title: '罗温的照片：收容环里的缝合鳗（配额1/3）', stage: 'pit_arrive', videoType: 'player-capture',
      reads: ['photo.pit', 'alarm.state'], note: '潜艇固定摄像头。提示词 VP-317',
      slots: [{ slot: 'eels', cases: [{ when: [], key: 'circling', en: 'Red alarm light sweeps a deep round pit where stitched eel-bodies circle the centre.', zh: '红光扫过圆坑，十几条缝合鳗绕着坑中央游。' }] }],
    },
    {
      id: 'L3-P05', title: '罗温的照片：坑底07号收容舱（可选）', stage: 'pit_cross', videoType: 'player-capture',
      reads: ['photo.cage07', 'alarm.state'], note: '潜艇固定摄像头。提示词 VP-323',
      slots: [{ slot: 'cage', cases: [{ when: [], key: 'bent_out', en: 'The largest containment cell at the pit bottom, ID plate 07, its observation glass burst outward from inside.', zh: '坑底最大的收容舱，铭牌上大字“07”，观察窗从里面往外爆开、舱门往外弯折，舱里空着。' }] }],
    },
    {
      id: 'L3-P06', title: '罗温的照片：坑底回收槽（可选）', stage: 'pit_cross', videoType: 'player-capture',
      reads: ['photo.trough'], note: '潜艇固定摄像头。提示词 VP-324',
      slots: [{ slot: 'trough', cases: [{ when: [], key: 'rejected', en: 'A round steel trough at the pit floor holding drowned workers without helmets, white tags on their wrists.', zh: '坑底正中的圆形回收槽里，堆着没戴头盔的工人尸体，手腕上都挂着白色牌子。' }] }],
    },
    {
      id: 'L3-P02', title: '罗温的照片：培养槽上的水母（配额2/3）', stage: 'plant_arrive', videoType: 'player-capture',
      reads: ['photo.tanks'], note: '潜艇固定摄像头，槽号大字可读。提示词 VP-318',
      slots: [{ slot: 'jellies', cases: [{ when: [], key: 'on_236', en: 'Thousands of small translucent jellyfish crowd three warm tanks stencilled 2, 3 and 6.', zh: '小水母挤在槽身写着2、3、6的三个培养槽上。' }] }],
    },
    {
      id: 'L3-P03', title: '罗温的照片：穹顶顶上的护理员', stage: 'dome_look', videoType: 'player-capture',
      reads: ['photo.domeTop'], note: '潜艇固定摄像头，二十秒前的画面。提示词 VP-319',
      slots: [{ slot: 'caretaker', cases: [{ when: [], key: 'asleep', en: 'At the top of the dome a giant thin-legged spider hangs upside down, legs folded, motionless.', zh: '护理员倒挂在穹顶最高处，腿全缩着，一动不动。' }] }],
    },
    {
      id: 'L3-P04', title: '罗温的照片：追来的护理员（配额3/3）', stage: 'shaft', videoType: 'player-action',
      reads: ['photo.caretaker', 'drain.open'], note: '潜艇固定摄像头，排水开始后。提示词 VP-320',
      slots: [{ slot: 'caretaker', cases: [{ when: [], key: 'approaching', en: 'The giant spider descends the dome wall toward the camera as water rushes into the drain.', zh: '护理员顺着穹顶墙壁朝潜艇爬下来，水正往竖井里涌。' }] }],
    },
  ],

  optional: [
    { id: 'explore-pit', label: '在收容环里夹第三层的宁神剂、拍坑底07号收容舱和回收槽', stage: 'pit_cross', requires: [], sets: [T('pit.sedative'), ADD('pod.sedatives', 1), T('photo.cage07'), T('photo.trough')] },
  ],

  echoes: [
    { id: 'l3-quota-gate', title: '-2层收容配额门禁', level: 3, kind: 'objective', perspective: 'world', reads: ['containment.captured', 'containment.required', 'containment.quotaMet'], cases: [
      { when: [IS('containment.quotaMet', true)], text: '三种生物已拍齐（缝合鳗、温床水母、护理员）：竖井锁打开，可以下潜到-3层。' },
      { when: [], text: '竖井锁未开：-2层还有生物没拍到。' },
    ] },
    { id: 'l3-pit-result', title: '收容环通过方式', level: 3, kind: 'log', perspective: 'world', reads: ['order.alarm', 'said.warnedBehind'], cases: [
      { when: [IS('order.alarm', 'cut')], text: '警报已关。缝合鳗能听见潜艇：关掉主动声纳，低速贴坑边通过，开快会被撞。' },
      { when: [IS('order.alarm', 'keep')], text: '警报保留。缝合鳗听不见潜艇，可以直接通过；红光和警报声让理智持续下降。' },
      { when: [], text: '尚未决定。' },
    ] },
    { id: 'l3-pit-explore', title: '收容环探索收获', level: 3, kind: 'log', perspective: 'world', reads: ['photo.cage07', 'photo.trough', 'pit.sedative', 'asked.cage07', 'asked.cages', 'pit.depth'], cases: [
      { when: [IS('asked.cage07', true)], text: '07号收容舱是从里面被打开的；门口那块布也是07。那个东西是从收容环出去的。' },
      { when: [IS('photo.cage07', true)], text: '拍到坑底07号收容舱：观察窗从里面往外爆开，收容舱是空的。' },
      { when: [IS('photo.trough', true)], text: '拍到坑底回收槽：没戴头盔的尸体，手腕上都挂着牌子。' },
      { when: [IS('pit.sedative', true)], text: '在收容环第三层的收容舱里拿到一箱宁神剂。' },
      { when: [IS('asked.cages', true)], text: '他说屏幕上最下面那个大收容舱是黑的。' },
      { when: [IS('pit.depth', 'floor')], text: '下到坑底，从排水通道离开了收容环。' },
      { when: [], text: '还在收容环里。' },
    ] },
    { id: 'l3-plant-result', title: '生产车间通过方式', level: 3, kind: 'log', perspective: 'world', reads: ['order.tanks', 'tanks.state'], cases: [
      { when: [IS('tanks.state', 'right_three')], text: '水母留在重新加热的2、3、6号槽里，潜艇安全通过。' },
      { when: [IS('tanks.state', 'wrong_three')], text: '加热的槽里没有水母。水母离开变凉的槽，糊满舷窗、堵住进水口，电量下降，只能全速冲出车间。' },
      { when: [IS('order.tanks', 'photo')], text: '水母留在重新加热的2、3、6号槽里，潜艇安全通过。' },
      { when: [IS('order.tanks', 'guess')], text: '水母离开变凉的槽，糊满舷窗、堵住进水口，电量下降，只能全速冲出车间。' },
      { when: [], text: '尚未决定。' },
    ] },
    { id: 'l3-fake-message', title: '假文字消息', level: 3, kind: 'log', perspective: 'world', reads: ['rowan.knows.videoOnly', 'san.fakeObeyed'], cases: [
      { when: [IS('san.fakeObeyed', true)], text: '罗温照着分析台上那条“往下沉”的文字消息做了。艾里亚斯说过，他打不了字。' },
      { when: [IS('rowan.knows.videoOnly', true)], text: '他只发录像，不会打字。文字消息不是他发的。' },
      { when: [], text: '—' },
    ] },
    { id: 'l4-carryover', title: '带到第四关', level: 4, kind: 'report', perspective: 'world', reads: ['rowan.knows.eliasNoBreath', 'elias.helmet', 'elias.tag', 'said.final', 'relation.elias.trust'], cases: [
      { when: [IS('said.final', 'away')], text: '罗温看过他摘下头盔后没有呼吸，最后让他离远点。第四关他会保持距离。' },
      { when: [IS('said.final', 'who')], text: '罗温看过他摘下头盔后没有呼吸，并质问他是什么。第四关从这个问题开始。' },
      { when: [IS('rowan.knows.eliasNoBreath', true)], text: '罗温看过他摘下头盔后没有呼吸。两人都没提，约好到下面再说。' },
      { when: [], text: '—' },
    ] },
    { id: 'l3-sedatives', title: '宁神剂存量', level: 3, kind: 'objective', perspective: 'world', reads: ['pod.sedatives'], cases: [
      { when: [{ fact: 'pod.sedatives', op: '>=', value: 3 }], text: '宁神剂够用。进收容环前可以先服一支。' },
      { when: [{ fact: 'pod.sedatives', op: '>=', value: 1 }], text: '宁神剂不多了，留着在理智很低时用。' },
      { when: [], text: '没有宁神剂。检疫泊位北边架子上有三箱。' },
    ] },
  ],

  presets: [
    { id: 'careful', title: '照片配合并探索收容环（保留警报、提醒身后、下坑拍07号收容舱并问他、按照片报槽号、让他等、问他还好吗）', toggles: ['explore-pit'], picks: {
      'l3-quarantine': ['care'], 'l3-lab': ['ask'], 'l3-pit-arrive': ['care'], 'l3-pit-order': ['keep-alarm', 'warn-behind'], 'l3-pit-explore': ['cages', 'cage07'],
      'l3-plant-arrive': ['ask'], 'l3-plant-order': ['tanks-photo'], 'l3-dome-look': ['wait'], 'l3-shaft': ['care'],
    } },
    { id: 'reckless', title: '图快（关警报、不提醒、随口报槽号、让他下去、质问他）', toggles: [], picks: {
      'l3-quarantine': ['doubt'], 'l3-lab': ['order'], 'l3-pit-arrive': ['other'], 'l3-pit-order': ['cut-alarm'],
      'l3-plant-arrive': ['other'], 'l3-plant-order': ['tanks-guess'], 'l3-dome-look': ['descend'], 'l3-shaft': ['who'],
    } },
    { id: 'quota-blocked', title: '剧情走完但生物没拍齐（竖井锁不开）', toggles: ['skip-quota'], picks: {
      'l3-quarantine': ['other'], 'l3-lab': ['other'], 'l3-pit-arrive': ['other'], 'l3-pit-order': ['keep-alarm'],
      'l3-plant-arrive': ['other'], 'l3-plant-order': ['tanks-photo'], 'l3-dome-look': ['hide'], 'l3-shaft': ['silent'],
    } },
  ],
};
