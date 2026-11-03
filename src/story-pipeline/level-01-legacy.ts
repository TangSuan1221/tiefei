import type { Pipeline } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });
const GE = (fact: string, value: number) => ({ fact, op: '>=' as const, value });
const LE = (fact: string, value: number) => ({ fact, op: '<=' as const, value });

const ACCIDENT = '艾里亚斯：两天前警报突然响了，泄压门一道道往下落。我当时被关在泵房里。\n艾里亚斯：等我穿好潜水服出来的时候，外面的闸门已经大开了，海水灌满了港池。至于闸门是谁开的——我真没看见。';
const ACCIDENT_AGAIN = '艾里亚斯：我刚跟你说过了……当时我在泵房里，外面谁开的闸门我真没看见。';

/** 历史对白验证管线；新开局简化执行见 HarborSimpleFlow 与 harbor-task-videos，旧存档继续复现本管线。
 * 第一关：0层接驳港 · 断桥救援与收容物#01取证。无万斯角色，开局带总部收容物拍摄硬性配额，全程与艾里亚斯视频合作逃生。 */
export const level01: Pipeline = {
  id: 'level-01',
  chapter: 1,
  title: '第一关（0层）· 接驳港：断桥另一边的人',
  synopsis: '事故调查员罗温驾驶小型潜艇潜入失联的深海基地0层接驳港。总部在潜艇黑匣子上设定了硬性锁死程序：每一层必须用延迟摄影拍够指定数量的异变生物（收容物）影像，否则通往下一层的气闸绝不开启。在昏暗的港池里，罗温收到断桥对岸维修员艾里亚斯的求救——他的退路被一只趴在门梁上的长臂工装怪物堵死了。潜艇只是关灯停船救不了艾里亚斯，罗温必须先拍清怪物的位置，再去恢复岸电、打开货仓闸门，用主动声纳把怪物引诱进货仓锁死，并拍齐“盘踞—入仓—锁死”三卷收容物视频。救下艾里亚斯后，进港涵洞突然坍塌封死了回海面的退路，两人只能一个走潜艇水道、一个走人员通道，互相传回视频，一起向负四层底站的逃生电梯逃生。',
  status: '历史对白验证模型；新开局使用 harbor-simple-flow。IMPLEMENTED（首关简化接线）/ GAP（真实视频及完整实玩验收）',
  sourceDoc: 'docs/level-01-input-pipeline.md',
  quota: {
    required: 3,
    capturedFact: 'containment.captured',
    requiredFact: 'containment.required',
    gateFact: 'containment.quotaMet',
    specimens: [
      {
        id: 'SPEC-01A',
        name: '门梁上的长臂工装体（第1卷：威胁取证）',
        trait: '对8kHz主动声纳与推进水流声极度敏感；就算潜艇关灯停船，它也依然趴在艾里亚斯身后的门梁上不肯走',
        blocker: '死死堵住断桥对岸卷帘门内侧，长手已经伸到艾里亚斯肩膀上方，让他一步也不敢动',
        countermeasure: '把潜艇停在01桥头灯杆下，对准对岸门洞完成5秒延迟曝光，替无法转头的艾里亚斯看清身后的威胁',
      },
      {
        id: 'SPEC-01B',
        name: '被引诱进货仓的长臂工装体（第2卷：入仓取证）',
        trait: '听到主动声纳脉冲就会顺着声音追来；如果在它还没完全进仓时就盲目关门，它会逃回桥头咬死艾里亚斯',
        blocker: '在港池泄水井与货仓门口之间游荡，随时会顺着声音袭击潜艇或折返对岸',
        countermeasure: '先去02恢复岸电、回01打开货仓门，再开进03货仓最深处打开主动声纳引它进来，拍下它完全入仓的视频铁证',
      },
      {
        id: 'SPEC-01C',
        name: '锁死在格栅门后的长臂工装体（第3卷：收容取证）',
        trait: '被厚重的货仓格栅门困住后仍在内侧抓挠；黑匣子必须核验这卷收容确认视频，才会解开往下一层的下行门锁',
        blocker: '艾里亚斯不敢在未确认锁死前出来，且潜艇黑匣子缺这一卷就无法解锁-1层下行气闸',
        countermeasure: '关掉声纳悄悄倒出货仓，回01面板按下落闸，再拍下格栅门完全闭合、怪物被关在里面的确认视频（凑齐3/3配额）',
      },
    ],
  },

  facts: [
    // 客观事实：来自 HarborRescueState 与潜艇传感器，只读
    { key: 'rescue.heard', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：调频收听38.4kHz求救' },
    { key: 'rescue.replied', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：首次麦克风回复' },
    { key: 'rescue.identified', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：01门梁收容物首片核验' },
    { key: 'rescue.warned', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：首片核验后计算声纳受击', note: '受击只在此后计算，玩家沉默不会造成艇体损伤' },
    { key: 'rescue.gateOpen', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：01开货仓闸' },
    { key: 'rescue.isolated', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：01落闸收容' },
    { key: 'rescue.verified', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：收容结果片核验，撤离的物理前提' },
    { key: 'rescue.departing', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：内侧逃生门接通' },
    { key: 'rescue.departed', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'HarborRescueState：艾里亚斯到达观察窗后' },
    { key: 'pod.pulse', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'on', life: 'level', source: 'run.sonarEmitting' },
    { key: 'pod.lamp', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'off', life: 'level', source: 'run.lit' },
    { key: 'pod.hull', layer: 'W', type: 'enum', values: ['intact', 'damaged'], initial: 'intact', life: 'level', source: 'run.hull / noiseStrikes' },
    { key: 'creature.zone', layer: 'W', type: 'enum', values: ['near_elias', 'roaming', 'entering_cargo', 'inside_cargo', 'behind_gate'], initial: 'near_elias', life: 'level', source: 'HarborPursuit 实时位置' },
    { key: 'elias.location', layer: 'W', type: 'enum', values: ['wall', 'corridor', 'beyond_door'], initial: 'wall', life: 'level', source: 'departing / departed' },
    { key: 'corpse.present', layer: 'W', type: 'enum', values: ['none', 'background'], initial: 'none', life: 'level', source: '场景静态布置', gap: '尸体模型缺失（VR-003）；推演中可勾选“假设尸体模型已就位”' },

    // 证据与总部收容配额（硬门禁：未拍够数量即使剧情走完也不可通关）
    { key: 'containment.required', layer: 'E', type: 'int', min: 1, max: 5, initial: 3, life: 'level', source: '总部黑匣子硬性指令：本关须完成3卷收容物有效视频取证' },
    { key: 'containment.captured', layer: 'E', type: 'int', min: 0, max: 5, initial: 0, life: 'persist', source: '分析台已核验的本关收容物视频卷数（威胁态+诱导态+收容态）' },
    { key: 'containment.quotaMet', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '推导：containment.captured >= containment.required（未达标锁死章节出口）' },
    { key: 'evidence.threat', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验 01 首片（收容物#01A 门梁威胁态）' },
    { key: 'evidence.lure', layer: 'E', type: 'bool', initial: false, life: 'level', source: '分析台核验 03 入仓片（收容物#01B 货仓诱导态）' },
    { key: 'evidence.gate', layer: 'E', type: 'bool', initial: false, life: 'level', source: '分析台核验 隔离片（收容物#01C 格栅收容态）' },
    { key: 'evidence.departure', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验 艾里亚斯撤离与内侧路线回传视频' },
    { key: 'evidence.bodyPosition', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '可选：从01补拍断桥下尸体位置并核验', gap: '依赖尸体模型；用现有快门与分析台，不新增操作' },

    // 艾里亚斯认知
    { key: 'elias.hears.pulse', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'level', source: '感知：主动脉冲开启且已接通' },
    { key: 'elias.hears.scrape', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'level', source: '感知：收容物未被关入货仓时门后持续刮擦（关灯停船不会消失）' },
    { key: 'elias.believes.monster', layer: 'K', holder: 'elias', type: 'enum', values: ['unknown', 'near_me', 'told_nothing', 'sealed'], initial: 'unknown', life: 'level', source: '罗温的陈述；sealed 需放行' },
    { key: 'elias.knows.rowanRole', layer: 'K', holder: 'elias', type: 'enum', values: ['unknown', 'investigator', 'rescuer'], initial: 'unknown', life: 'persist', source: '罗温自报身份（总部收容取证调查员 / 救援队）' },
    { key: 'elias.knows.rowanName', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'persist', source: '罗温自报姓名' },
    { key: 'elias.knows.rowanAskedBody', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'persist', source: '罗温问及桥下尸体' },
    { key: 'elias.instruction.hold', layer: 'K', holder: 'elias', type: 'enum', values: ['none', 'freeze', 'signal'], initial: 'none', life: 'level', source: '罗温指示：别动捂灯 / 朝潜艇招手' },
    { key: 'elias.instruction.route', layer: 'K', holder: 'elias', type: 'enum', values: ['none', 'rail'], initial: 'none', life: 'level', source: '罗温给撤离路线指示' },

    // 罗温认知
    { key: 'rowan.knows.monster', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '= evidence.threat 核验' },
    { key: 'rowan.notedBody', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '已核验录像含尸体且罗温问及', gap: '依赖尸体模型' },
    { key: 'rowan.demeanor', layer: 'K', holder: 'rowan', type: 'enum', values: ['calm', 'afraid', 'hard'], initial: 'calm', life: 'persist', source: '语气 tag' },
    { key: 'rowan.missionFocus', layer: 'K', holder: 'rowan', type: 'enum', values: ['quota', 'coop', 'truth'], initial: 'coop', life: 'persist', source: '罗温对总部收容配额与救人合作的态度' },

    // 关系
    { key: 'relation.elias.trust', layer: 'R', type: 'int', min: -2, max: 2, initial: 0, life: 'persist', source: '对白 tag 加减，每窗口同类一次' },

    // 言行记录
    { key: 'said.rowan.promisedRescue', layer: 'S', type: 'bool', initial: false, life: 'persist', source: '首次接通时承诺合作带他出去' },
    { key: 'said.rowan.downplayed', layer: 'S', type: 'bool', initial: false, life: 'persist', source: '看片后淡化或隐瞒门梁上的收容物' },
    { key: 'said.rowan.falseClear', layer: 'S', type: 'int', min: 0, max: 9, initial: 0, life: 'persist', source: '物理未收容时谎称安全叫他出来' },
    { key: 'said.rowan.release', layer: 'S', type: 'bool', initial: false, life: 'level', source: '确认阶段明确放行' },

    // 承诺
    { key: 'commitment.elias.records', layer: 'C', type: 'bool', initial: false, life: 'persist', source: '告别时请他沿途留意收容物档案与值班记录' },
    { key: 'commitment.elias.meet', layer: 'C', type: 'enum', values: ['none', 'gate', 'keepChannel'], initial: 'none', life: 'persist', source: '告别时约定，衔接第二关末密码闸门会合' },

    // 证词
    { key: 'testimony.hq.mandate', layer: 'T', type: 'bool', initial: true, life: 'persist', source: '舰载离线简报：每层收容物必须完成延迟摄影取证，配额未满锁死下行气闸' },
    { key: 'testimony.elias.accident', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯对事故的陈述' },
  ],

  stages: [
    {
      id: 'entry',
      title: '01 下潜入港：黑匣子配额指令',
      dialogueStages: ['（离线简报载入）'],
      narrative: '舱门关上，海面港口的嘈杂彻底远去。罗温驾驶小型调查艇沉入海底1012米的0层接驳港。分析台屏幕亮起出发前写入的离线简报：这座推广“Panacea”再生疗法的深海基地在两天前失联，总部在潜艇黑匣子上加装了硬性锁死程序——每进入一层，调查员必须用延迟相机拍够指定数量的异变生物（收容物）影像，否则气闸锁死，绝不允许进入下一层。罗温把入口坐标（X11, Y16）输入声纳台，穿过A气闸与C维修湾驶入昏暗的主港池。',
      objective: '离线简报载入：本关须拍摄3卷收容物视频（当前0/3）· 驶过A气闸与C维修湾进入主港',
      advance: '驶入C-B通道并捕捉38.4kHz水声求救载波',
      gate: [],
      sets: [T('testimony.hq.mandate', true)],
    },
    {
      id: 'contact',
      title: '02 断桥求救：接通维修员艾里亚斯',
      dialogueStages: ['contact', 'intro'],
      narrative: '刚进主港池，被动声纳就在38.4千赫频段捕捉到一段每隔九十秒循环一次的微弱人声：“泵站七，艾里亚斯，修泵的。一个人，断桥对面……听见请回，小声。”罗温调准频率按下麦克风回应。对岸的艾里亚斯终于听到活人的声音——连接港池两岸的步行廊桥已经被水压折断，潜艇过不去，他也上不了艇。',
      objective: '调谐被动接收机收听求救 · 按住麦克风回应断桥对岸的艾里亚斯',
      advance: '罗温回应并建立双人合作语音',
      gate: ['rescue.heard'],
      sets: [T('rescue.heard'), T('elias.hears.pulse'), T('elias.hears.scrape')],
    },
    {
      id: 'stop',
      title: '03 紧急灭声：关灯停船也救不了他',
      dialogueStages: ['stop', 'warning'],
      narrative: '艾里亚斯惊恐地压低声音警告罗温：立刻关掉主动声纳！水听器里传来金属门板后的刮擦声——两下，一停。有东西被刚才的声纳脉冲引到了艾里亚斯身后的检修门里。罗温意识到，就算自己的潜艇现在关灯停船装死，那个东西依然趴在艾里亚斯背后的门梁上；而笨重的硬壳潜水服让艾里亚斯根本没法转头往后看。他恳求罗温把潜艇开到桥头01灯杆下，用潜艇的延迟相机帮他拍一张身后的照片。',
      objective: '关闭主动声纳脉冲 · 收容物仍堵在艾里亚斯门梁上，关灯停船不会让它离开',
      advance: '实际停发主动脉冲，解锁01观察位取景',
      gate: ['rescue.replied', 'pod.pulse'],
      sets: [T('rescue.replied'), T('pod.pulse', 'off'), T('elias.hears.pulse', false)],
    },
    {
      id: 'photo',
      title: '04 桥头曝光：拍下门梁上的长臂怪物（配额1/3）',
      dialogueStages: ['photo'],
      narrative: '罗温把潜艇停稳在01桥头灯杆下，对准断桥对岸的卷帘门按下快门。五秒曝光，十二秒显影。当视频在分析台屏幕上亮起时，罗温倒吸一口凉气：断桥对岸，艾里亚斯正死死贴着墙，平台下方的黑水里还漂着一具脸朝下的尸体；而在艾里亚斯头顶的门梁上方，一个工装嵌进苍白皮肉里的长臂人形正垂下头，一只长手已经越过门梁摸向艾里亚斯的肩膀，脸上却带着一种近乎安抚的平静神情。黑匣子记录下第1卷收容物影像（1/3）。',
      objective: '前往01观察位拍摄断桥对岸门梁上的收容物（配额1/3），显影后在分析台核验',
      advance: '首卷收容物视频核验通过（配额 1/3）',
      gate: ['rescue.identified', 'rescue.warned', 'evidence.threat'],
      sets: [],
    },
    {
      id: 'report',
      title: '05 告知险境：制定货仓声诱计划',
      dialogueStages: ['report', 'plan'],
      narrative: '“洗出来了？我头顶上到底有什么？告诉我！”艾里亚斯在耳机里焦急地追问。罗温按住麦克风把看到的画面告诉他。艾里亚斯强压着喘息说：他身后的门通往港池泄水井，而唯一能逃去值班室的走廊口就在井盖正上方，那个怪物不走，他一步也迈不出去。唯一的办法是利用怪物追逐声音的习性，把它引到东边的03重型货仓里关起来——但货仓门现在断电了，需要罗温先去西侧泵站外壁的02黄漆配电箱恢复应急电力。',
      objective: '按住麦克风向艾里亚斯报告视频中的收容物位置，制定货仓声诱计划',
      advance: '报告后艾里亚斯给出02岸电与03货仓声诱方案',
      gate: [],
      sets: [
        T('rescue.identified'),
        T('rescue.warned'),
        T('evidence.threat'),
        T('rowan.knows.monster'),
        T('creature.zone', 'roaming'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'power',
      title: '06 恢复岸电：开启01货仓闸门',
      dialogueStages: ['power', 'powerBrief', 'open'],
      narrative: '罗温驾驶潜艇来到02配电箱前，顶着暴露风险打开探照灯、伸出机械臂合上电闸。水听器里一排继电器咔哒作响，水泵重新转动，门梁上的怪物被水泵声吸引，顺着泄水井滑到了水下。罗温趁机赶回01桥头面板，用机械臂拉开了东侧03货仓的沉重格栅门。门轴发出一声长响。',
      objective: '前往02恢复岸电（开灯伸机械臂操作），再回01打开货仓闸门',
      advance: '货仓闸门开启',
      gate: ['rescue.gateOpen'],
      sets: [T('rescue.gateOpen')],
    },
    {
      id: 'lure',
      title: '07 以身作饵：货仓声诱与入仓取证（配额2/3）',
      dialogueStages: ['lureBrief', 'lure'],
      narrative: '“它听见门轴响了！”艾里亚斯叮嘱罗温：把潜艇直接开进03货仓最深处，到了里面再打开主动声纳脉冲把怪物引进去。罗温驶入漆黑的货仓内部，按下主动声纳开关。沉重的拖行声顺着8千赫的脉冲波纹追进货仓，刺耳的刮擦声从艇尾一路拖到艇首。当声纳红点完全越过货仓闸门时，罗温果断按下快门完成五秒曝光，拍下怪物钻进货仓货架间的视频铁证（黑匣子收容配额达成2/3）。',
      objective: '驶入03货仓内部开启主动脉冲引怪入仓，曝光拍下收容物入仓视频（配额2/3）',
      advance: '入仓视频核验通过（配额 2/3）',
      gate: ['evidence.lure'],
      sets: [T('pod.pulse', 'on'), T('creature.zone', 'inside_cargo'), T('evidence.lure'), ADD('containment.captured', 1)],
    },
    {
      id: 'close',
      title: '08 落闸关门：拍下格栅收容铁证（配额3/3达成）',
      dialogueStages: ['closeBrief', 'close'],
      narrative: '拍完入仓视频后，罗温立刻停掉主动声纳，把推进器压到最慢，屏住呼吸悄无声息地倒出货仓，返回01桥头面板按下落闸。水听器里传来门轴长叫，货仓里的怪物猛地扑向门口，紧接着是格栅门砸进底槽的巨响与一声闷撞！罗温将镜头对准关闭的货仓门补拍一卷：格栅门严丝合缝，那个长臂工装体正把三指长手贴在格栅内侧。分析台核验通过，本关总部要求的3/3收容物视频配额全部完成！',
      objective: '停发脉冲低速撤出货仓，回01落闸锁死，拍摄格栅后收容物视频（配额3/3）',
      advance: '收容确认视频核验通过，总部收容配额 3/3 达成',
      gate: ['rescue.isolated', 'evidence.gate', 'containment.quotaMet'],
      sets: [
        T('pod.pulse', 'off'),
        T('rescue.isolated'),
        T('creature.zone', 'behind_gate'),
        T('elias.hears.scrape', false),
        T('evidence.gate'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'confirm',
      title: '09 解除警报：通知艾里亚斯撤离',
      dialogueStages: ['confirmBrief', 'confirm'],
      narrative: '“那一下……是门关上了，还是它出来了？”艾里亚斯在门后紧张地问。罗温按住麦克风告诉他怪物已经被锁死在货仓里，可以出来了。艾里亚斯长舒一口气，拔掉头盔上的硬线脐带，背着只够支撑一小时的氧气包，准备沿着断桥内侧的应急走廊撤往尽头的值班室。',
      objective: '收容物已锁入货仓 · 按住麦克风通知艾里亚斯沿内侧走廊撤往值班室',
      advance: '物理收容已核验 且 罗温放行',
      gate: ['rescue.verified', 'said.rowan.release'],
      sets: [T('rescue.verified')],
    },
    {
      id: 'escape',
      title: '10 走廊护航：目送艾里亚斯进入值班室',
      dialogueStages: ['escapeBrief', 'escape'],
      narrative: '艾里亚斯扶着内侧走廊的栏杆一步步走向值班室。罗温留在潜艇里，透过镜头观察他的撤离过程，随时提防井道里是否还有其他动静。十秒后，通道尽头传来清脆的落锁声。',
      objective: '留在艇内，观察艾里亚斯沿内侧通道撤离',
      advance: '艾里亚斯到达观察窗后并锁门',
      gate: ['rescue.departing'],
      sets: [T('rescue.departing'), T('elias.location', 'corridor')],
    },
    {
      id: 'departure',
      title: '11 涵洞坍塌：退路断绝与内侧视频回传',
      dialogueStages: ['departure'],
      narrative: '罗温在桥头朝值班室观察窗拍下撤离确认视频：艾里亚斯已经安全站在防爆窗后，回身朝潜艇举起头灯。然而就在罗温调转船头准备从进港涵洞返回海面时，身后突然传来震耳欲聋的岩层断裂声——泥沙与折断的钢梁轰然坠落，彻底堵死了回海面的来路！两人同时被困在了海底。这时，艾里亚斯把值班室的监控与结构图切进水声链路，给罗温传回了一段内侧视频：他指着楼梯间的疏散图说，整座基地只有负四层底站还有逃生电梯。',
      objective: '在01拍摄艾里亚斯撤离结果片 · 进港涵洞坍塌封死退路，接收艾里亚斯内侧路线视频',
      advance: '撤离结果视频与内侧路线视频核验',
      gate: ['rescue.departed', 'evidence.departure'],
      sets: [T('rescue.departed'), T('elias.location', 'beyond_door'), T('evidence.departure')],
    },
    {
      id: 'done',
      title: '12 结成搭档：分路下潜前往负一层',
      dialogueStages: ['done'],
      narrative: '断桥阻隔之下，潜艇走不了人员楼梯，艾里亚斯也进不了深水航道。想活命出去，两人只能结为逃生搭档：罗温驾驶潜艇走外侧水道，用延迟相机替艾里亚斯看清前路与收容物；艾里亚斯走内侧人员通道，替潜艇打开锁死的闸门。由于罗温已拍齐本关3/3收容物视频，黑匣子正式解开01下行检修门的机械锁，两人约定在负一层生活区观察廊会合。',
      objective: '收容物配额已满（3/3）且合作路线已确立 · 返回01接驳面板按F下潜至-1层',
      advance: '总部配额门禁通过 + 撤离确认 → 解锁-1层下行井',
      gate: ['evidence.departure', 'containment.quotaMet'],
      sets: [],
    },
  ],

  windows: [
    {
      id: 'elias-contact', title: '首次接通', speaker: 'elias', stage: 'contact', opens: '收听求救载波', closes: '发出一句或沉默约40秒', multi: false, optional: true,
      advanceOn: '*', defaultTag: 'other',
      tags: [
        { id: 'id-investigator', label: '自报调查员与收容取证任务', examples: ['我是事故调查员罗温，奉命来拍收容物样本', '我是调查员罗温，我来调查事故'], keywords: ['调查员', '调查', '事故调查', '查事故', '收容物', '样本', '总部'], writes: [T('elias.knows.rowanRole', 'investigator'), T('rowan.missionFocus', 'quota')], reply: '艾里亚斯：调查员。……那你先把镜头准备好：泵站七，一个活人，还有门后面那件拿工装裹着的“收容物”。\n艾里亚斯：泵房顶上有间干舱，我在那儿熬了三天。听见你的声纳，才穿上壳子出来。\n艾里亚斯：现在在剩下那截桥上，背靠卷帘门旁边那扇检修门，左手钳着栏杆。' },
        { id: 'id-rescuer', label: '自报救援与合作逃生', examples: ['我是来救你的，我们一起出去', '我是救援队的'], keywords: ['救援', '救你', '来救', '救人', '营救', '一起出去'], writes: [T('elias.knows.rowanRole', 'rescuer'), T('rowan.missionFocus', 'coop')], reply: '艾里亚斯：救援……廊桥被水压断了，你过不来。\n艾里亚斯：我在剩下那截桥上，背靠检修门，钳着栏杆。桥就一米宽，没地方挪。' },
        { id: 'ask-location', label: '问位置', examples: ['你在哪里', '给我坐标'], keywords: ['在哪', '哪里', '坐标', '位置', '方位'], writes: [], reply: '艾里亚斯：港池全灌了。泵房顶上有间干舱，我在那儿熬了三天。听见你的声纳，才穿壳子出来。\n艾里亚斯：现在在剩下那截桥上，桥就剩一米宽。背后是检修门，前面是断口，左手钳着栏杆。没地方挪。' },
        { id: 'ask-injury', label: '问伤情', examples: ['你受伤了吗', '你还好吗'], keywords: ['受伤', '还好吗', '没事吧', '伤', '身体', '流血', '氧气'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：没……没受伤。谢谢你先问这个。\n艾里亚斯：廊桥断了，我出不去。' },
        { id: 'hold', label: '指示别动', examples: ['别动，贴着墙待着', '待在原地'], keywords: ['别动', '不要动', '待着', '原地', '贴着墙', '藏好', '躲好', '安静'], writes: [T('elias.instruction.hold', 'freeze')], reply: '艾里亚斯：……墙？你看得见我？\n艾里亚斯：猜的吧。猜对了。我一直贴着，不动。' },
        { id: 'promise', label: '承诺来救', examples: ['坚持住，我马上过来', '我会带你出去'], keywords: ['坚持', '马上', '我来了', '过来', '带你出去', '等我', '撑住'], writes: [T('said.rowan.promisedRescue'), T('elias.instruction.hold', 'signal')], reply: '艾里亚斯：过不来，桥断了——你别过来。\n艾里亚斯：……你在对面？我把夹钳抬一下。你看不见也没关系——拍下来，就知道我是真的。' },
        { id: 'doubt', label: '怀疑身份', examples: ['你是谁', '我怎么知道你是真的'], keywords: ['你是谁', '怎么知道', '真的假的', '证明', '是人吗', '凭什么信'], writes: [ADD('relation.elias.trust', -1)], reply: '艾里亚斯：刚说了，艾里亚斯，修泵的。你要看工牌，先把我弄出去。' },
        { id: 'other', label: '其他 / 听不清', examples: ['听得见，我听得见'], keywords: ['听得见', '听到了', '收到', '喂', '你好'], writes: [], reply: '艾里亚斯：小声。我听得见你。' },
      ],
    },
    {
      id: 'elias-warning', title: '警告与关灯无效说明', speaker: 'elias', stage: 'stop', opens: '艾里亚斯要求关闭主动声纳', closes: '进入01拍摄阶段', multi: true, optional: true,
      defaultTag: 'ask-what',
      tags: [
        { id: 'ask-what', label: '问它是什么 / 能不能关灯混过去', examples: ['它是什么？关灯停船能躲过去吗', '为什么要关'], keywords: ['是什么', '什么东西', '为什么', '它是', '谁', '关灯', '混过去', '躲过去'], writes: [], reply: '艾里亚斯：你关灯停船，它只是暂时摸不到你的铁壳，可它还趴在我头顶的门梁上！你不把它引走锁起来，我一步都动不了，你也别想拍够总部要的收容物录像。先关声纳！', again: '艾里亚斯：……先把主动声纳关了，再到01拍它。' },
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
        { id: 'premature', label: '未看片就下结论', examples: ['应该没什么', '我看什么都没有'], keywords: ['没什么', '没事', '没东西', '什么都没有', '安全了', '没看到'], writes: [], reply: '艾里亚斯：你还没看片吧？实时舷窗里什么都看不清，等视频显影出来再说。' },
        { id: 'ask-time', label: '问还要多久', examples: ['再等等，片子在显影', '还要多久'], keywords: ['多久', '等等', '显影', '片子', '马上', '稍等', '快好了'], writes: [], reply: '艾里亚斯：……我在数呼吸。你那边视频洗好了就告诉我。反正我哪儿也去不了。', again: '艾里亚斯：……我还在。' },
        { id: 'ask-where', label: '问它在哪', examples: ['它现在在哪', '你还听得见它吗'], keywords: ['它在哪', '还在吗', '听得见它', '它在', '多远'], writes: [], reply: '艾里亚斯：门后面。它在刮。……一直在刮。' },
      ],
    },
    {
      id: 'elias-report', title: '看片报告', speaker: 'elias', stage: 'report', opens: '首片核验后（配额1/3）', closes: '发出报告', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'other',
      tags: [
        { id: 'truthful', label: '如实描述收容物', examples: ['门缝里伸出来一截，离你后颈一掌', '它就在你身后的门里', '有个东西伸手靠近你'], keywords: ['门缝', '后颈', '伸出来', '门里', '身后', '背后', '后面', '靠近你', '伸手', '怪物', '有东西', '有个东西', '就在你', '离你很近', '在你旁边'], requires: [IS('rowan.knows.monster')], fallback: '艾里亚斯：你看清视频了吗？看清了再告诉我。', writes: [T('elias.believes.monster', 'near_me')], reply: '', branches: [
          { when: [IS('elias.instruction.hold', 'freeze')], reply: '艾里亚斯：……从门缝里？\n艾里亚斯：……你让我贴着墙的。\n（水听器：极轻的一声金属响。刮擦停了。三秒。）\n（水听器：刮擦重新开始，节奏没变。）\n艾里亚斯：……我离开门了。它没听见。' },
          { when: [], reply: '艾里亚斯：……从门缝里？\n艾里亚斯：我一直靠在那扇门上。\n（水听器：极轻的一声金属响。刮擦停了。三秒。）\n（水听器：刮擦重新开始，节奏没变。）\n艾里亚斯：……我离开门了。它没听见。' },
        ] },
        { id: 'downplay', label: '淡化或隐瞒', examples: ['别怕，什么都没有', '没什么'], keywords: ['没什么', '什么都没有', '别怕', '没东西', '不用担心', '没事', '看错了', '安全'], writes: [T('said.rowan.downplayed'), T('elias.believes.monster', 'told_nothing'), ADD('relation.elias.trust', -1)], reply: '艾里亚斯：没什么？那门后面是什么在刮？\n艾里亚斯：……算了。' },
        { id: 'fear', label: '表达恐惧 / 想走', examples: ['我想退出去', '这太可怕了'], keywords: ['可怕', '害怕', '退出', '想走', '离开', '受不了', '恐怖', '撤退', '吓'], writes: [T('rowan.demeanor', 'afraid')], reply: '艾里亚斯：别走。求你。\n艾里亚斯：你不拍够三卷收容物视频，你的黑匣子也解不开下潜锁。只要几步，我告诉你怎么关住它。' },
        { id: 'ask-accident', label: '问事故', examples: ['这里发生了什么', '其他人呢'], keywords: ['发生了什么', '事故', '其他人', '别的人', '怎么回事', '出了什么事'], writes: [T('rowan.missionFocus', 'truth')], reply: '艾里亚斯：事故的事，出去再说。\n艾里亚斯：片子先说。上面有什么？', again: '艾里亚斯：……你不说。那就是很糟。\n艾里亚斯：事故的事，出去再说。现在我只想知道它在哪。' },
        { id: 'ask-body', label: '问水里的尸体', examples: ['水里那个人是谁', '桥下有具尸体'], keywords: ['尸体', '死人', '水里那个', '桥下', '漂着', '那个人'], requires: [IS('corpse.present', 'background')], fallback: '艾里亚斯：我这边看不见你说的地方。', writes: [T('elias.knows.rowanAskedBody'), T('rowan.notedBody')], reply: '艾里亚斯：……我不敢往水里看。现在别问这个。', gap: '尸体模型缺失；正典第四关揭晓身份' },
        { id: 'ask-what', label: '问是什么 / 惊叫', examples: ['那到底是什么东西', '天哪'], keywords: ['什么东西', '是什么', '天哪', '我的天', '那是'], writes: [], reply: '艾里亚斯：我不知道。我真的不知道。' },
        { id: 'other', label: '其他', examples: ['我看到了'], keywords: ['看到了', '看见了', '看清了'], writes: [], reply: '艾里亚斯：……你不说，我也听得出来。' },
      ],
    },
    {
      id: 'elias-action', title: '行动期（供电与声诱）', speaker: 'elias', stage: 'power', opens: '供电阶段开始', closes: '关闸隔离', multi: true, optional: true,
      defaultTag: 'ask-next',
      tags: [
        { id: 'ask-next', label: '问下一步', examples: ['接下来做什么', '下一步去哪'], keywords: ['接下来', '下一步', '去哪', '怎么做', '做什么', '然后呢', '坐标'], writes: [], reply: '@plan' },
        { id: 'ask-accident', label: '问事故', examples: ['之前这里发生了什么'], keywords: ['发生了什么', '事故', '其他人', '怎么回事'], writes: [T('testimony.elias.accident')], reply: ACCIDENT, again: ACCIDENT_AGAIN },
        { id: 'ask-self', label: '问他本人', examples: ['你在这里做什么工作', '说说你自己'], keywords: ['工作', '你自己', '你是做', '多久了', '家人', '你叫'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：……现在？\n艾里亚斯：七年，这层的泵。现在听它们转——一台都认不出来。去开门。', again: '艾里亚斯：七年。没听过这层这么响。' },
        { id: 'comfort', label: '安慰', examples: ['会没事的，我在', '别怕'], keywords: ['没事的', '我在', '别怕', '相信我', '放心', '会好的'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：……嗯。我还在。', again: '艾里亚斯：我知道。谢谢。' },
        { id: 'hurry', label: '催促', examples: ['快点', '别磨蹭'], keywords: ['快点', '磨蹭', '赶紧', '快', '抓紧'], writes: [T('rowan.demeanor', 'hard')], reply: '艾里亚斯：我比你急。它是下去了，可井盖就在我脚底下。' },
        { id: 'call-out', label: '叫他出来（未隔离）', examples: ['可以出来了', '现在安全了'], keywords: ['出来', '安全了', '走吧', '可以走'], writes: [], reply: '', branches: [
          { when: [IS('elias.hears.scrape')], reply: '艾里亚斯：我还听得见它。你确定？\n艾里亚斯：……我不出去。', writes: [ADD('said.rowan.falseClear', 1), ADD('relation.elias.trust', -1)] },
          { when: [], reply: '艾里亚斯：等你拍完货仓隔离录像再说。' },
        ] },
      ],
    },
    {
      id: 'elias-confirm', title: '放行（配额3/3达成后）', speaker: 'elias', stage: 'confirm', opens: '隔离后艾里亚斯问“搞定了吗”', closes: '放行', multi: true, optional: false,
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
      id: 'elias-farewell', title: '涵洞坍塌 · 结成合作逃生搭档', speaker: 'elias', stage: 'done', opens: '撤离片核验且进港涵洞坍塌后', closes: '确认离港下潜', multi: true, optional: true,
      defaultTag: 'thanks',
      tags: [
        { id: 'records', label: '请他留意收容物档案与值班记录', examples: ['路上看到值班记录，帮我留着', '帮我找找记录'], keywords: ['记录', '值班', '日志', '资料', '留着', '档案'], writes: [T('commitment.elias.records')], reply: '', branches: [
          { when: [IS('elias.knows.rowanRole', 'investigator')], reply: '艾里亚斯：……我刚说九个人。你要的是表和收容记录。\n艾里亚斯：值班表在下一层。我拿内侧镜头拍给你，那天那一页，我也想看。' },
          { when: [], reply: '艾里亚斯：……我刚说九个人。你要的是记录。\n艾里亚斯：好。我留意。' },
        ] },
        { id: 'give-name', label: '报上名字', examples: ['我叫罗温'], keywords: ['罗温', '我叫', '名字'], writes: [T('elias.knows.rowanName')], reply: '艾里亚斯：罗温。……好。我记住了。', again: '艾里亚斯：记着呢，罗温。' },
        { id: 'meet-gate', label: '约定在下面会合合作逃生', examples: ['我们下面见', '在下面碰头'], keywords: ['下面见', '碰头', '会合', '汇合', '见面', '下一层', '合作'], writes: [T('commitment.elias.meet', 'gate')], reply: '艾里亚斯：下面见。进港涵洞塌了，我们只能一起往底站逃生电梯走。我从里面找路，你在外面的航道用相机替我看。' },
        { id: 'keep-channel', label: '约定保持频道与视频回传', examples: ['别关频道，保持联系', '一直保持联系'], keywords: ['频道', '保持联系', '别关', '联系', '通话'], writes: [T('commitment.elias.meet', 'keepChannel')], reply: '艾里亚斯：……开着。我不说话，每半分钟按一下载波。哪天没有咔声了——别喊我。那是我在躲。' },
        { id: 'ask-accident', label: '问事故', examples: ['到底发生了什么'], keywords: ['发生了什么', '事故', '怎么回事', '其他人'], writes: [T('testimony.elias.accident')], reply: ACCIDENT, again: ACCIDENT_AGAIN },
        { id: 'thanks', label: '道谢 / 关心', examples: ['保重', '你也小心'], keywords: ['保重', '小心', '谢谢', '注意安全', '照顾好'], writes: [ADD('relation.elias.trust', 1)], reply: '@echo:farewell-line', again: '艾里亚斯：你也是。' },
        { id: 'cold', label: '冷淡 / 怀疑', examples: ['走吧', '我还不信你'], keywords: ['走吧', '不信', '怀疑', '随便', '快走'], writes: [ADD('relation.elias.trust', -1)], reply: '@echo:farewell-line', again: '艾里亚斯：……嗯。' },
      ],
    },
  ],

  shots: [
    { id: 'PT-001', title: '进港自由拍摄', stage: 'entry', videoType: 'player-capture', reads: ['pod.lamp', 'pod.pulse', 'pod.hull'], slots: [], note: '只有物理内容，输入不影响画面' },
    { id: 'PT-002', title: '接通与停发', stage: 'stop', videoType: 'player-capture', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone'], slots: [], note: '只允许间接痕迹，输入不影响画面' },
    {
      id: 'PT-003', title: '01 断桥收容物#01A确认（配额1/3）', stage: 'photo', videoType: 'player-capture',
      reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'elias.location', 'corpse.present', 'containment.captured'],
      note: '收容物#01A伸手靠近他是物理事实；实时事实与玩家指令决定这5秒艾里亚斯的姿态',
      slots: [{ slot: 'elias_beat', cases: [
        { when: [IS('elias.instruction.hold', 'freeze')], key: 'frozen', en: 'He keeps perfectly still against the wall, one claw-like hard-suit gripper held over his helmet lamp, a thin line of light leaking past it.', zh: '艾里亚斯贴墙不动，夹钳挡住头灯，漏出一线光。' },
        { when: [IS('elias.instruction.hold', 'signal')], key: 'signals_pod', en: 'One hard-suit claw lifts a few centimetres off the rail toward the dark submarine, barely moving.', zh: '艾里亚斯的一只夹钳离开栏杆几厘米，朝黑暗中的潜艇极轻地示意。' },
        { when: [LE('relation.elias.trust', -1)], key: 'guarded', en: 'He keeps his back to the wall and his face turned away from the submarine.', zh: '艾里亚斯背贴墙，脸背向潜艇。' },
        { when: [], key: 'listening', en: 'He turns his helmet slightly toward the doorway, as if he heard something.', zh: '艾里亚斯微微转向门洞，像是听见了什么。' },
      ] }],
    },
    {
      id: 'PT-004', title: '计划与供电', stage: 'power', videoType: 'player-capture',
      reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'elias.location', 'corpse.present'],
      note: '他在对岸等待；由看片报告的实时认知决定表演',
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
    { id: 'PT-005', title: '03 货仓收容物#01B诱导确认（配额2/3）', stage: 'lure', videoType: 'player-action', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'containment.captured'], slots: [], note: '收容物#01B顺主动声纳进入货仓，核验后达成2/3配额' },
    { id: 'PT-007', title: '01 货仓收容物#01C格栅确认（配额3/3）', stage: 'close', videoType: 'player-action', reads: ['pod.lamp', 'pod.pulse', 'pod.hull', 'creature.zone', 'containment.captured', 'containment.quotaMet'], slots: [], note: '收容物#01C被锁在格栅后，核验后达成3/3配额，解锁章节出口' },
    {
      id: 'VP-012', title: '撤离途中', stage: 'escape', videoType: 'player-capture', reads: ['pod.lamp', 'pod.hull', 'elias.location'], note: '过程片',
      slots: [{ slot: 'elias_beat', cases: [
        { when: [IS('elias.instruction.route', 'rail')], key: 'rail', en: 'He keeps one hand on the rail and never looks back.', zh: '艾里亚斯扶着栏杆走，没有回头。' },
        { when: [LE('relation.elias.trust', -1)], key: 'glance_back', en: 'He stops once to look back toward the cargo gate.', zh: '艾里亚斯停下回望货仓闸门。' },
        { when: [], key: 'walking', en: 'The diving-suited survivor walks along an inner emergency corridor behind a glass partition.', zh: '艾里亚斯沿内侧走廊行走。' },
      ] }],
    },
    {
      id: 'VP-011', title: '01 撤离确认与艾里亚斯值班室自拍视频（九人点名牌与涵洞塌方）', stage: 'departure', videoType: 'elias-story',
      reads: ['pod.lamp', 'pod.hull', 'elias.location', 'corpse.present', 'said.rowan.downplayed', 'said.rowan.falseClear', 'relation.elias.trust'],
      note: '潜艇拍到艾里亚斯安全进入值班室后，艾里亚斯接通值班室内置镜头传回第一段剧情视频：展示墙上九人点名铜牌（空着他弟弟的挂钩）、讲述自己在干舱熬过的三天与同事入海的怪事，并在进港涵洞轰然坍塌时拍下通往-4层底站逃生电梯的剖面图',
      slots: [
        { slot: 'elias_beat', cases: [
          {
            when: [GE('relation.elias.trust', 1)],
            key: 'trust_wave',
            en: 'Behind the observation window he turns back and lifts his helmet lamp toward the submarine, holding it there.',
            zh: '【画面】艾里亚斯在观察窗后回身，朝潜艇举起头灯致意；随后切入值班室内置镜头——他卸下头盔面罩锁扣坐在铁椅上，镜头扫过墙上“接驳港维修班·九人点名牌”（七块已被摘走，只剩“艾里亚斯·科尔”和紧挨着它的一个空挂钩）。突然镜头剧烈震颤，窗外进港涵洞轰然塌方，泥沙吞没退路；他起身把镜头对准墙上的五层基地剖面图，手指重重按在最底下的“-4层·逃生电梯”上。',
            dialogue: '艾里亚斯（视频原声）：“三天前警报拉响的时候，广播从一号点名到九号，一个人都没应。我缩在泵房干舱里，听着外面那些老熟人顺着台阶一步步走进深水里，没人喊救命，安静得吓人……（巨响，镜头猛晃）……进港涵洞塌了！罗温，你回不去海面了。看墙上这张图——整座基地只剩负四层底站还有逃生电梯。刚才你没骗我，接下来这四层，你在外面的水道用相机替我看路，我在里面替你开锁，我们一起活着出去。”',
            storyBeat: '【剧情揭示】1. 交代接驳港九人班组全军覆没、同事诡异地安静入海；2. 墙上紧挨着艾里亚斯的空挂钩埋下“亲弟弟卢卡斯”的伏笔；3. 涵洞塌方断绝退路，正式确立两人一里一外、靠视频配合往-4层逃生的主线。',
          },
          {
            when: [LE('relation.elias.trust', -1)],
            key: 'wary',
            en: 'He checks behind him and does not look toward the submarine.',
            zh: '【画面】艾里亚斯锁死值班室门后警惕地检查门栓，没有看潜艇；切入值班室内置镜头后，他把摄像头压低，拍向自己左脚铁靴后跟——护板上赫然留着三道被门梁怪物爪尖刮出的深痕。随后镜头扫过墙上只剩他一块名牌的九人点名板，在进港涵洞轰然坍塌的震动中，冷冷地拍向墙上的“-4层·逃生电梯”路线图。',
            dialogue: '艾里亚斯（视频原声）：“看见我靴子后跟这三道印子了吗？就在刚才，它只差一寸就抓穿我的气密层——而你居然在频道里跟我说‘门边什么都没有’。（涵洞塌方巨响）……现在进港涵洞塌了，我们谁也别想原路上去。想活命去负四层坐逃生电梯，我们只能凑合搭伙。但从下一层起，我只信你用相机拍过来的视频，不再信你的嘴。”',
            storyBeat: '【剧情揭示】玩家此前的隐瞒/谎报直接体现在艾里亚斯靴跟的爪痕特写与冷淡台词中；他在视频中立下规矩——后续必须凭真实视频画面说话。',
          },
          {
            when: [],
            key: 'still',
            en: 'He stands behind the door, breathing hard, looking at nothing.',
            zh: '【画面】艾里亚斯站在值班室门后大口喘息；切入值班室内置镜头后，他拍向墙上九缺八的铜制工牌与空挂钩，讲述泵房被困三天的经历；紧接着进港涵洞坍塌封死退路，他把镜头拉向五层基地剖面图底部的逃生电梯。',
            dialogue: '艾里亚斯（视频原声）：“门锁死了……这间值班室本来有九个人，那天广播点名，一个都没应，我连那扇门是谁从里面打开的都不知道。（涵洞塌方巨响）……来路塌了。潜艇下不了人员楼梯，我也游不出深水航道。往下走吧，去负四层底站的逃生电梯——你在外面拍视频替我看路，我在里面替你开门。”',
            storyBeat: '【剧情揭示】交代接驳港九人失踪悬念与开门之谜，并在涵洞坍塌后确立双人视频合作逃生。',
          },
        ] },
        { slot: 'corpse', gap: '尸体模型缺失', cases: [
          { when: [IS('corpse.present', 'background'), IS('rowan.notedBody')], key: 'noted', en: 'Below the platform, a body floats face down against the broken railing, clearly visible in the light.', zh: '【画面补充】镜头掠过观察窗下方时，断桥栏杆下那具脸朝下的尸体在探照灯余光中清晰可见，艾里亚斯的目光在窗边猛地躲闪了一下。', dialogue: '艾里亚斯（视频原声，声音发紧）：“……别再拍桥底下那个人了。他已经死了，看再多也没用。”', storyBeat: '【伏笔】罗温对桥下尸体的追问让艾里亚斯在视频中明显失态，为第四关揭晓那是他亲弟弟埋下草蛇灰线。' },
          { when: [IS('corpse.present', 'background')], key: 'background', en: 'Below the platform, a body floats face down, caught against the broken railing, small in the background.', zh: '【画面补充】平台下远处漂着一具脸朝下的尸体。' },
          { when: [], key: 'none', en: '', zh: '' },
        ] },
      ],
    },
    { id: 'PT-009', title: '离港下潜', stage: 'done', videoType: 'player-capture', reads: ['pod.lamp', 'pod.hull', 'containment.quotaMet'], slots: [], note: '配额已满，开启下行门' },
  ],

  optional: [
    { id: 'body-photo', label: '从01补拍尸体位置并核验', stage: 'report', requires: [IS('rowan.notedBody')], sets: [T('evidence.bodyPosition')], gap: '依赖尸体模型' },
  ],

  echoes: [
    { id: 'quota-gate', title: '本关总部收容物配额门禁', level: 1, kind: 'objective', perspective: 'world', reads: ['containment.captured', 'containment.required', 'containment.quotaMet', 'evidence.departure'], cases: [
      { when: [IS('containment.quotaMet', true), IS('evidence.departure', true)], text: '总部收容物配额已达标（3/3）且搭档撤离视频已核验：01下行气闸解锁，可下潜至-1层。' },
      { when: [IS('containment.quotaMet', false), IS('evidence.departure', true)], text: '【通关阻断】虽然已经救下艾里亚斯并走完本章剧情，但本关收容物视频未拍够（未满3卷）！黑匣子拒绝解锁01下行气闸，必须补齐收容物拍摄方可通关。' },
      { when: [], text: '进行中：须完成3卷收容物视频取证与艾里亚斯撤离确认。' },
    ] },
    { id: 'farewell-line', title: '告别第一句', level: 1, kind: 'line', perspective: 'elias', reads: ['said.rowan.promisedRescue', 'relation.elias.trust', 'said.rowan.downplayed'], cases: [
      { when: [IS('said.rowan.promisedRescue'), GE('relation.elias.trust', 0)], text: '艾里亚斯：你说你会来。桥是断的，可你还是来了。' },
      { when: [IS('said.rowan.downplayed')], text: '艾里亚斯：……你走吧。下一层要是再碰上，我先看你传来的视频，再听你的话。' },
      { when: [GE('relation.elias.trust', 1)], text: '艾里亚斯：谢谢。真的。\n艾里亚斯：值班室在下一层。我路过就用内侧镜头拍给你，看那天谁在班上。……下面见。' },
      { when: [LE('relation.elias.trust', -1)], text: '艾里亚斯：……我先走了。\n艾里亚斯：你要拍收容物、查事故，下一层也有门。到时候再说。' },
      { when: [], text: '艾里亚斯：谢谢。\n艾里亚斯：进港的路塌了，我从里面下楼梯，你走潜艇水道……我们合作逃出去，下面见。' },
    ] },
    { id: 'farewell-open', title: '告别开场句（涵洞坍塌与内侧视频回传）', level: 1, kind: 'line', perspective: 'elias', reads: ['elias.instruction.route', 'relation.elias.trust', 'said.rowan.falseClear'], cases: [
      { when: [IS('elias.instruction.route', 'rail'), GE('relation.elias.trust', 1)], text: '艾里亚斯：看完了？片子上要是还有别的东西，现在就说。……我数三下。一。……二。……三。……好，只有我。\n艾里亚斯：进港涵洞刚塌了，你也回不去海面了。我把值班室拍到的疏散图切进视频传给你——只有负四层底站有逃生电梯。你在外面用相机替我看路，我在里面替你开锁。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
      { when: [GE('said.rowan.falseClear', 1)], text: '艾里亚斯：看完了？……这回你别急着说安全。片子上要是还有别的，现在就说。我数三下。一。……二。……三。\n艾里亚斯：进港涵洞塌了，我们都困在这儿了。我把内侧镜头拍到的路线传给你了，想活命只能一起往底站电梯走。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
      { when: [], text: '艾里亚斯：看完了？片子上要是还有别的东西，现在就说。……我数三下。一。……二。……三。……好，只有我。\n艾里亚斯：那天我也这么等过。广播点名，从一叫到九，一个都没应。现在涵洞塌了，我把内侧楼梯的视频传给你，我们一起往底站逃生电梯走。\n艾里亚斯：你还在线吗？……我连你叫什么都不知道。' },
    ] },
    { id: 'lure-line', title: '入仓片回应', level: 1, kind: 'line', perspective: 'elias', reads: ['said.rowan.downplayed', 'said.rowan.falseClear', 'relation.elias.trust'], cases: [
      { when: [IS('said.rowan.downplayed')], text: '艾里亚斯：拍到了？……这回别骗我。\n艾里亚斯：关声纳。慢慢出来，回去关门。' },
      { when: [GE('said.rowan.falseClear', 1)], text: '艾里亚斯：拍到了？……上次你也说安全。这次我等你关上门再信。\n艾里亚斯：关声纳。慢慢回去。别出声。' },
      { when: [GE('relation.elias.trust', 1)], text: '艾里亚斯：拍到了？……别告诉我它长什么样。\n艾里亚斯：关声纳。慢慢出来，比你想的还要慢。回去关门。' },
      { when: [], text: '艾里亚斯：……拍到了？关声纳。慢慢出来，比你想的还要慢。回去关门。' },
    ] },
    { id: 'log', title: '黑匣子日志证词', level: 1, kind: 'log', perspective: 'world', reads: ['testimony.hq.mandate', 'testimony.elias.accident', 'rowan.missionFocus'], cases: [
      { when: [IS('testimony.hq.mandate'), IS('testimony.elias.accident'), IS('rowan.missionFocus', 'quota')], text: '日志含总部收容物取证指令（优先配额）与艾里亚斯证词（“泄压门落下、闸门不知谁开”）。' },
      { when: [IS('testimony.hq.mandate'), IS('testimony.elias.accident')], text: '日志含总部收容物取证指令与艾里亚斯证词一条。' },
      { when: [IS('testimony.hq.mandate')], text: '日志含总部收容物取证指令，无人员口述证词。' },
      { when: [], text: '日志仅有现场录像。' },
    ] },
    { id: 'body-objective', title: '可选目标：拍尸体位置', level: 1, kind: 'objective', perspective: 'rowan', reads: ['rowan.notedBody'], gap: '依赖尸体模型', cases: [
      { when: [IS('rowan.notedBody')], text: '出现可选目标“从01换角度拍尸体位置”。' },
      { when: [], text: '不出现。' },
    ] },
    { id: 'l2-tape', title: '第二关艾里亚斯探头视频回传', level: 2, kind: 'video', perspective: 'elias', reads: ['commitment.elias.records', 'relation.elias.trust'], cases: [
      { when: [IS('commitment.elias.records'), GE('relation.elias.trust', 0)], text: '第二关探头视频多一卷：艾里亚斯把值班记录夹与管线标牌举到探头镜头前，本人出镜说明。' },
      { when: [IS('commitment.elias.records')], text: '第二关探头视频多一卷：只拍记录夹，他不出镜。' },
      { when: [LE('relation.elias.trust', -1)], text: '第二关探头视频：他只拍粘液与三色管，不拍自己。' },
      { when: [], text: '第二关常规探头视频回传，他隔着防爆玻璃与镜头配合。' },
    ] },
    { id: 'l2-meet', title: '第二关密码闸门会合句', level: 2, kind: 'line', perspective: 'elias', reads: ['commitment.elias.meet'], cases: [
      { when: [IS('commitment.elias.meet', 'gate')], text: '密码闸门开启视频中：“说好了下面见，我们继续往底站走。”' },
      { when: [IS('commitment.elias.meet', 'keepChannel')], text: '固定通话失效前最后一句：“我一直开着……到观察廊用探头传视频！”' },
      { when: [], text: '常规会合句。' },
    ] },
    { id: 'l4-confront', title: '第四关袖口与兄弟对质', level: 4, kind: 'line', perspective: 'elias', reads: ['elias.knows.rowanAskedBody', 'said.rowan.downplayed', 'said.rowan.falseClear', 'relation.elias.trust'], cases: [
      { when: [IS('elias.knows.rowanAskedBody')], text: '他隔着观察窗提起：“你在接驳港问过桥下那个人。”' },
      { when: [IS('said.rowan.downplayed')], text: '他反问：“你在接驳港也说门里没什么。”' },
      { when: [GE('said.rowan.falseClear', 1)], text: '他反问：“你当时明明听见它在刮，还想让我出去。”' },
      { when: [], text: '常规对质。' },
    ] },
    { id: 'l4-evidence', title: '第四关兄弟身份视频比对', level: 4, kind: 'report', perspective: 'world', reads: ['evidence.bodyPosition'], cases: [
      { when: [IS('evidence.bodyPosition')], text: '首关断桥下尸体位置照片与港口旧监控视频并列比对，锁定其弟弟溺亡点。' },
      { when: [], text: '只能依靠港口旧监控视频与艾里亚斯的当面供述。' },
    ] },
    { id: 'l5-report', title: '第五关底站黑匣子终局封存', level: 5, kind: 'report', perspective: 'world', reads: ['testimony.hq.mandate', 'testimony.elias.accident', 'evidence.threat', 'evidence.bodyPosition', 'commitment.elias.records', 'containment.quotaMet'], cases: [
      { when: [IS('containment.quotaMet'), IS('evidence.bodyPosition'), IS('testimony.elias.accident')], text: '底站黑匣子含0层3卷收容物完整视频链、断桥尸体位置比对与艾里亚斯证词，分栏封存。' },
      { when: [IS('containment.quotaMet'), IS('testimony.elias.accident')], text: '底站黑匣子含0层3卷收容物视频链与艾里亚斯证词。' },
      { when: [], text: '底站黑匣子仅含0层基础收容物视频。' },
    ] },
  ],

  presets: [
    { id: 'calm', title: '冷静取证与合作（配额3/3通关）', toggles: [], picks: {
      'elias-contact': ['hold'], 'elias-warning': ['comply'], 'elias-report': ['truthful'],
      'elias-action': ['ask-self', 'comfort'], 'elias-confirm': ['release-route'], 'elias-farewell': ['meet-gate', 'thanks'],
    } },
    { id: 'soothe', title: '安抚隐瞒（配额3/3但低信任）', toggles: [], picks: {
      'elias-contact': ['promise'], 'elias-report': ['downplay'],
      'elias-action': ['call-out', 'hurry'], 'elias-confirm': ['release'], 'elias-farewell': ['cold'],
    } },
    { id: 'investigate', title: '全收集调查（配额3/3+尸体比对）', toggles: ['corpse', 'body-photo'], picks: {
      'elias-contact': ['id-investigator'], 'elias-warning': ['ask-what'], 'elias-report': ['ask-body'],
      'elias-action': ['ask-accident', 'ask-self'], 'elias-confirm': ['unsure', 'release'], 'elias-farewell': ['records', 'keep-channel'],
    } },
  ],
};
