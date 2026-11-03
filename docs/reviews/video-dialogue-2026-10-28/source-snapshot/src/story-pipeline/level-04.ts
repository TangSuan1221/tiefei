import type { Pipeline } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });

/**
 * 第四关：-3层能源站 · 兄弟真相视频对质、艾里亚斯探头还原灾难起源与精英收容物“德尔罗伊”取证。
 */
export const level04: Pipeline = {
  id: 'level-04',
  chapter: 4,
  title: '第四关（-3层）· 能源站：下班以后的老工人',
  synopsis: '带着上一层拍到的“艾里亚斯撕裂袖口”视频，罗温进入负三层能源站。这一层的故事高潮由【艾里亚斯与监控探头传回的三段重磅剧情视频】层层引爆：①在人员走廊观察窗内，艾里亚斯当着探头撕开袖口胶布，并与接驳港旧监控同屏还原了他害死亲弟弟的全过程——事发时弟弟已经逃到撤离门边，是已被Panacea改变、不再理解“离别”的艾里亚斯把弟弟骗回来并反锁了门，看着没用过药的弟弟在门外活活淹死、尸体漂向断桥！②随后艾里亚斯进入能源层值班宿舍，用探头拍回了老工人德尔罗伊的床铺、空药瓶与最后监控：老人偷用Panacea治好老伤后不再想回陆地，打开取水口去接同样因接触药物而疯长的巨型章鱼，章鱼护主压塌隔断，加上公司强令“只保贵宾区供电、禁止停工撤离”，才酿成灭顶之灾；③在恢复供电阶段，探头拍下这位半身已化为肉柱的老工人听到那句熟悉的“坎贝尔，把这一班做完”后，像过去几十年一样默默转回工位关好维护门、并在通话器旁敲击两下呼唤深渊底下的章鱼。与此同时，罗温必须退入隔断门后躲开德尔罗伊“徒手挤船修补”的致命巨手，拍齐本层3卷收容物视频（配额3/3）解锁底站通道。',
  status: 'DESIGNED & PIPELINE IMPLEMENTED（3卷精英收容物配额门禁 + 艾里亚斯三段核心剧情视频 + 破除关灯解）',
  sourceDoc: 'docs/story-split-route-2026-09-30.md',
  quota: {
    required: 3,
    capturedFact: 'containment.captured',
    requiredFact: 'containment.required',
    gateFact: 'containment.quotaMet',
    specimens: [
      {
        id: 'SPEC-04A',
        name: '特殊人形适应体·艾里亚斯（第1卷：袖口共生组织与害死弟弟的监控铁证）',
        trait: '表面保持完整人形并通过了早期短期认知测试，实则腕部已长出共生褶皱，且早已失去了“允许别人拒绝自己”的正常人类伦理',
        blocker: '一直掌握着人员通道的内侧门控权，如果不当面拍清铁证并夺回决定权，他甚至会替罗温和岸上的人做主',
        countermeasure: '在人员通道观察窗外命令艾里亚斯撕开胶布抬起手臂，拍下他袖口下的共生组织特写（配额1/3），结合他同步传回的港口旧监控揭穿他害死亲弟弟的真相',
      },
      {
        id: 'SPEC-04B',
        name: '能源站老工人·德尔罗伊（第2卷：“错误修船”挤压态，破除关灯解）',
        trait: '彻底打破“关灯停船就能混过去”：他不看探照灯，只凭职业本能感知潜艇外壳的损伤；只要潜艇带着伤停在他够得着的地方，他就会一边念叨“这里漏了，过来”一边伸出粗壮的肉肢把潜艇当破水管活活挤碎',
        blocker: '下半身分化成数条粗长组织固定在能源主平台中央，完全堵死了前往底站下行井的近道',
        countermeasure: '在他伸手抱住潜艇前立刻倒车退入实体隔断门后，隔着门窗拍下他下半身分化组织与贴门手掌的全貌（配额2/3），再去外侧补给点修好船壳绕道而行',
      },
      {
        id: 'SPEC-04C',
        name: '回岗锁门的老工人·德尔罗伊（第3卷：职业习惯唤醒态）',
        trait: '对声纳噪音或普通呼喊毫无反应，却依然在潜意识里保留着几十年如一日的“交班锁门”习惯',
        blocker: '他离开岗位导致原操作台的一扇维护门一直敞着，回路未闭合，负四层底站的逃生电梯彻底断电',
        countermeasure: '先从外窗拍清敞开的维护台，再翻出第三关日常视频里领班叫他下班前关门的原话，请维拉用真实声音对他说“坎贝尔，把这一班做完”，拍下他转身拉合维护门恢复底站供电的画面（配额3/3达成）',
      },
    ],
  },

  facts: [
    // 客观事实（W）
    { key: 'energy.stage', layer: 'W', type: 'enum', values: ['confront_elias', 'delroy_encounter', 'power_circuit', 'exit_to_bottom'], initial: 'confront_elias', life: 'level', source: '-3层能源站流程阶段' },
    { key: 'pod.hullRepaired', layer: 'W', type: 'bool', initial: false, life: 'level', source: '是否已在外侧补给点修好艇壳损伤（避免触发德尔罗伊“修船”挤压）' },

    // 言行与指令记录（S：由玩家决策写入，驱动供电与搭档关系并反映在后续视频槽位）
    { key: 'delroy.position', layer: 'S', type: 'enum', values: ['blocking_platform', 'outside_partition', 'returned_to_console'], initial: 'blocking_platform', life: 'level', source: '交班呼叫后德尔罗伊回操作台或留在平台外侧' },
    { key: 'elevator.power', layer: 'S', type: 'enum', values: ['off', 'main_restored', 'emergency_backup'], initial: 'off', life: 'persist', source: '-4层底站逃生电梯供电方案（影响第五关能否转接父亲声音）' },
    { key: 'companion.cooperation', layer: 'S', type: 'enum', values: ['restricted_coop', 'cut_off'], initial: 'restricted_coop', life: 'persist', source: '兄弟案对质后决定维持有限合作逃生或彻底切断合作' },

    // 证据与总部收容配额（E）
    { key: 'containment.required', layer: 'E', type: 'int', min: 1, max: 5, initial: 3, life: 'level', source: '总部黑匣子硬性指令：-3层须完成3卷核心收容物视频取证（3/3）' },
    { key: 'containment.captured', layer: 'E', type: 'int', min: 0, max: 5, initial: 0, life: 'persist', source: '分析台已核验的-3层收容物视频数' },
    { key: 'containment.quotaMet', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '推导：containment.captured >= containment.required（未满3卷锁死-4层底站入口）' },
    { key: 'specimen.eliasAdapted', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：艾里亚斯撕开袖口视频 + 害死弟弟的港口监控同屏铁证（SPEC-04A，配额1/3）' },
    { key: 'specimen.delroyRepair', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：隔断门后拍摄的德尔罗伊下半身组织与修护压艇视频（SPEC-04B，配额2/3）' },
    { key: 'specimen.delroyShift', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：德尔罗伊回操作台关好维护门恢复回路视频（SPEC-04C，配额3/3）' },
    { key: 'evidence.harborBrotherCCTV', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '港口事故期间旧监控视频：艾里亚斯叫回本可撤离的弟弟并拒开返回门致其溺亡' },
    { key: 'evidence.accidentOriginCCTV', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯传回的能源层宿舍与取水口监控视频：德尔罗伊偷药、章鱼护主压坏隔断与公司禁止停工指令' },

    // 角色认知与关系（K / R / T）
    { key: 'rowan.knows.brotherTruth', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '核对港口旧监控与艾里亚斯供述，确认首关断桥尸体是其亲弟弟' },
    { key: 'rowan.knows.accidentChain', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '核对缺药记录、取水口监控与公司VIP优先供能指令，查明完整事故链' },
    { key: 'relation.elias.trust', layer: 'R', type: 'int', min: -2, max: 2, initial: 0, life: 'persist', source: '对质态度与合作处理' },
    { key: 'testimony.elias.brotherConfession', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯当面承认未给弟弟开门：“我不想让他一个人回去”' },
    { key: 'testimony.delroy.privateAudio', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '德尔罗伊私取介质验证旧伤的私人录音：“孙子不必再等了，都可以下来”' },
  ],

  stages: [
    {
      id: 'confront_elias',
      title: '01 隔窗对质：艾里亚斯传回第一段“袖口自白与弟弟溺亡真相”核心剧情视频（配额1/3）',
      dialogueStages: ['confront_elias'],
      narrative: '进入负三层能源站后，罗温先把潜艇停在人员走廊观察窗外，用维拉查到的“早期员工临床受试者名单”逼问艾里亚斯。知道再也瞒不住的艾里亚斯打开了手里的探头，配合维拉调出的港口监控，向罗温传回了令人窒息的【艾里亚斯探头剧情视频①】：画面左侧，艾里亚斯当着镜头一把扯下腕部的胶布，露出袖口下缓缓蠕动的灰白共生组织，掏出怀里那张被撕了一半的兄弟合照——照片上另一半那个年轻工人，穿的正是第一关断桥下那具尸体的工装！画面右侧同步播放事故当天0层接驳港的监控视频：当时他弟弟已经跑到了撤离门前，身后就是生路；是艾里亚斯在下方平台叫住了弟弟，骗他说“下来，我们哥俩一起走”；等弟弟折返跳下平台、海水汹涌灌入时，弟弟死死抓着门框哭喊着求哥哥把返回门打开，可门内的艾里亚斯却把手从开门键上缩了回来，只隔着玻璃温柔地对弟弟说“别怕，很快就不疼了，我们不分开”——他忘了弟弟根本没注射过Panacea，在深海里只会活活窒息！罗温看着视频里弟弟的手指一根根松开、尸体顺水漂到第一关断桥栏杆下卡住，气得手抖得几乎按不准通话键。',
      objective: '在观察窗外拍摄艾里亚斯袖口（配额1/3）· 接收艾里亚斯与港口监控同屏还原的“反锁房门害死亲弟弟”核心剧情视频',
      advance: '核验艾里亚斯袖口与兄弟溺亡剧情视频（配额1/3），决定后续合作边界',
      gate: ['specimen.eliasAdapted', 'evidence.harborBrotherCCTV', 'rowan.knows.brotherTruth'],
      sets: [
        T('energy.stage', 'confront_elias'),
        T('specimen.eliasAdapted'),
        T('evidence.harborBrotherCCTV'),
        T('rowan.knows.brotherTruth'),
        T('testimony.elias.brotherConfession'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'delroy_encounter',
      title: '02 灾难的真正起点：艾里亚斯传回第二段“德尔罗伊偷药与章鱼护主”剧情视频（配额2/3）',
      dialogueStages: ['delroy_encounter'],
      narrative: '对质之后，罗温严令禁止艾里亚斯再擅自替自己决定开哪扇门。能源通道深处传来“两下、停一下、再两下”的扳手敲管声。此时艾里亚斯走进了人员侧的能源值班宿舍，用探头给罗温拍回了揭开整场基地灾难真相的【艾里亚斯探头剧情视频②】：镜头先扫过德尔罗伊简陋的铺位——枕头边放着一只用完的Panacea空药瓶和一台录音机，老人在录音里说，自己苦等孙子的治疗名额无果，六周前趁检修偷了一支药在自己伤腿上试药；药效发作后他的腿不疼了，却渐渐觉得“陆地太吵了，孙子不用等了，都可以下来水里团聚”。紧接着艾里亚斯将探头对准值班室的事故监控回放：三天前，腿部已开始异变站不稳的德尔罗伊走到取水口敲了两下，那只因接触他手上的药液而在六周内疯长成庞然大物的章鱼顺着水道伸进粗大腕足，温柔地把老人护在怀里；章鱼转身时不小心压弯了半开的隔断门导致海水涌入，值班员立刻向公司总部发去紧急停工撤离请求，屏幕上却跳出总部的红色驳回令：“贵宾疗养区正处关键疗程，严禁停机断电，普通工区自行封门！”就在罗温看完这段真相视频时，水道外平台上、下半身已长成肉柱的德尔罗伊突然朝潜艇伸出巨手：“这里漏了，过来。”——他把带伤的潜艇当成破水管要徒手挤扁修补！罗温立刻全速倒车退入实体隔断门后，拍下这位老工人的形态（达成配额2/3），再去外侧补给点修好船壳绕行。',
      objective: '接收艾里亚斯拍回的“德尔罗伊空药瓶、章鱼护主破口与公司拒停工”剧情视频 · 在德尔罗伊徒手挤船前退入隔断门拍摄取证（配额2/3）',
      advance: '核验德尔罗伊修护态视频（配额2/3）+ 查明完整事故责任链并修好艇壳绕行',
      gate: ['specimen.delroyRepair', 'evidence.accidentOriginCCTV', 'pod.hullRepaired'],
      sets: [
        T('energy.stage', 'delroy_encounter'),
        T('specimen.delroyRepair'),
        T('evidence.accidentOriginCCTV'),
        T('rowan.knows.accidentChain'),
        T('testimony.delroy.privateAudio'),
        T('delroy.position', 'outside_partition'),
        T('pod.hullRepaired'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'power_circuit',
      title: '03 把这一班做完：唤醒老工人回岗锁门与第三段剧情视频（配额3/3达成）',
      dialogueStages: ['power_circuit'],
      narrative: '准备前往底站入口时，通往负四层底站的电力中断了。罗温从外窗拍到德尔罗伊原来的值班操作台——老人离岗后，一扇维护门一直敞着，导致回路未闭合。维拉在广播里喊他的名字毫无用处。罗温没有去伪造他孙子的声音骗他，而是翻出上一关日常视频里领班叫他下班前关门的原话，请维拉用真实声音对着通话器说：“坎贝尔，底站还有人。把这一班做完。”话音落下，潜艇镜头与内侧探头同时录下了令人动容的【第3卷收容物与剧情视频（配额3/3达成）】：听到这句听了三十年的交班令，满身肉褶的老工人僵住了片刻，随后拖着沉重的分化躯体一点点挪回操作台前，伸出粗糙的大手把敞开的维护门严丝合缝地拉上、锁好，嘴里轻声嘟囔着：“去上班……下班回来。”底站电梯的绿色供电指示灯瞬间亮起！',
      objective: '底站电梯断电 · 用真实领班交班话术唤德尔罗伊回岗拉合维护门，拍下老工人完成最后一班岗的剧情与收容视频（配额3/3达成）',
      advance: '核验德尔罗伊回岗锁门视频（配额3/3）+ 底站电梯供电恢复',
      gate: ['specimen.delroyShift', 'containment.quotaMet'],
      sets: [
        T('energy.stage', 'power_circuit'),
        T('specimen.delroyShift'),
        T('delroy.position', 'returned_to_console'),
        T('elevator.power', 'main_restored'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'exit_to_bottom',
      title: '04 深渊的回音：配额解锁下潜负四层底站',
      dialogueStages: ['exit_to_bottom'],
      narrative: '拉合维护门后，德尔罗伊站在固定通话器旁，用指节在管壁上轻轻敲了两下。片刻之后，从更深的负四层井底传来了一声低沉得几乎听不见的震动回应——他喂大的那只巨型章鱼在底站听见了父亲的召唤。随着本关3/3收容物视频核验入库，黑匣子解开最后一道深潜锁，罗温驾艇沉入负四层油井底站。',
      objective: '总部收容物配额已满（3/3）且底站已供电 · 德尔罗伊敲击两下唤醒深处章鱼，潜艇下潜至-4层油井底站',
      advance: '总部配额3/3门禁 + 电梯供电 → 进入-4层终局',
      gate: ['containment.quotaMet', 'specimen.delroyShift'],
      sets: [T('energy.stage', 'exit_to_bottom')],
    },
  ],

  windows: [
    {
      id: 'l4-brother-confront', title: '观察窗兄弟溺亡真相视频对质', speaker: 'elias', stage: 'confront_elias', opens: '收到艾里亚斯撕开袖口与害死弟弟的监控同屏视频后', closes: '决定收回门控权维持有限合作或彻底断绝合作', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'restrict-coop',
      tags: [
        { id: 'restrict-coop', label: '严厉斥责其害死弟弟，收回代做决定权但允许走到底站隔离门外', examples: ['他没接受过治疗，他在淹死！那不是陪着你，是你没让他走！从现在起不准你替我开任何门，到底站隔离门外等着'], keywords: ['淹死', '没让他走', '不准你替我', '隔离门外', '弟弟'], requires: [IS('rowan.knows.brotherTruth')], fallback: '罗温：先把港口旧监控和他的袖口视频核对完。', writes: [T('companion.cooperation', 'restricted_coop')], reply: '艾里亚斯：……我不想让他一个人回去。我以为留下来以后，他也会感觉到那些安静的东西。\n罗温：他抓着门边的手松开的时候，那叫溺死！\n艾里亚斯：……我不替你开哪扇门了。我把能源层宿舍里的事故证据拍给你，然后自己顺人员通道走到底站的隔离门外，要不要让我上电梯，到时候由你定。' },
        { id: 'cut-coop', label: '彻底断绝合作：禁止他继续跟随前往底站', examples: ['到这里为止，别再跟着我，我让维拉接手底站门控'], keywords: ['别跟着我', '到此为止', '断绝', '不合作', '自己走'], writes: [T('companion.cooperation', 'cut_off'), ADD('relation.elias.trust', -2)], reply: '艾里亚斯：……你会需要有人在里面配合的。\n罗温：我宁可跟维拉走外侧绕路，也不会再把门交给你。\n（艾里亚斯将探头留在能源层值班台传完德尔罗伊的证据视频后，独自留在了昏暗的走廊里；第五关底站人员隔离门外将空无一人。）' },
      ],
    },
    {
      id: 'l4-delroy-shift', title: '能源维护台交班唤醒与供电选择', speaker: 'vera', stage: 'power_circuit', opens: '底站电梯断电且拍到德尔罗伊敞开的维护台', closes: '完成供电恢复与第3卷收容物视频核验', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'call-shift',
      tags: [
        { id: 'call-shift', label: '依据日常影像：请维拉用真实领班话术唤德尔罗伊回岗关门（不冒充孙子）', examples: ['别冒充他孙子，用日常视频里领班交班的话叫他：坎贝尔，底站还有人，把这一班做完'], keywords: ['坎贝尔', '这一班做完', '交班', '领班', '回岗', '别冒充'], writes: [T('elevator.power', 'main_restored'), T('delroy.position', 'returned_to_console')], reply: '维拉：坎贝尔，底站还有人。把这一班做完。\n（视频画面里，德尔罗伊缓缓转回操作台，拉合敞开的维护门。底站常规供电恢复，他在通话器旁轻轻敲了两下，深渊底下传来沉闷的回应。）' },
        { id: 'emergency-power', label: '不惊动德尔罗伊，让维拉从控制室硬切应急供电', examples: ['他已经这样了，别叫他回去了，切控制室应急供电'], keywords: ['应急供电', '别叫他', '控制室切', '硬切'], writes: [T('elevator.power', 'emergency_backup')], reply: '维拉：好，我切断非必要负载改走应急供电，需要多等一会儿。\n（罗温在隔断后拍下平台边缘敲击两下的德尔罗伊完成3/3配额；应急供电恢复，但固定维护台声源未接通。）' },
      ],
    },
  ],

  shots: [
    {
      id: 'L4-SPEC-01', title: '【艾里亚斯核心剧情视频① + 配额1/3】撕开袖口胶布、半截兄弟合照与港口溺亡监控', stage: 'confront_elias', videoType: 'elias-story',
      reads: ['specimen.eliasAdapted', 'evidence.harborBrotherCCTV', 'containment.captured'],
      note: '全篇最震撼的人物反转剧情视频：艾里亚斯当着镜头扯下腕部胶布展示共生组织，并与接驳港旧监控同屏还原他把亲弟弟锁在门外淹死的全过程',
      slots: [{ slot: 'brother_truth_shot', cases: [
        {
          when: [IS('companion.cooperation', 'cut_off')],
          key: 'confronted_and_left',
          en: 'Elias peels off his wrist tape on camera beside harbor CCTV of his brother drowning; rejected by Rowan, he stays behind in the dark.',
          zh: '【艾里亚斯自白与港口监控同屏视频】画面左半边，艾里亚斯在观察窗后一把扯下缠在手腕上的胶布，露出蠕动的灰白共生褶皱，并从怀里掏出第一关在值班室收起的那张半截兄弟合照；画面右半边同步播放0层接驳港事故当天的原始监控：他弟弟卢卡斯本来已经跑到了干燥撤离门前，是艾里亚斯在下方喊他“下来，我们一起走”，等弟弟折返跑下平台、海水猛灌进来时，艾里亚斯却退进内侧锁死了返回门！监控里弟弟绝望地砸窗哭喊，艾里亚斯的手放在开门键上却始终没按下去，直到弟弟松开手面朝下漂到第一关断桥栏杆下。被罗温彻底断绝合作后，视频里的艾里亚斯放下探头，独自退入走廊的黑暗中。',
          dialogue: '接驳港旧监控（视频原声）：“卢卡斯（砸门哭喊）：哥！把门打开！水漫过来了，我喘不上气了，哥！ / 艾里亚斯（贴在门内玻璃上，流着泪轻声说）：别怕，卢卡斯，忍一下……等水进去了，就再也不会疼、再也不会分开，很快就安静了……”\n艾里亚斯（当前观察窗探头原声）：“你救我的时候，我就已经是这样了。我当时只想让他留下来陪我，我忘了他没打过药……好，我不跟着你了，罗温。你自己去底站吧。”',
          storyBeat: '【全剧核心真相揭晓】彻底揭开首关断桥尸体身份、袖口异常与Panacea最大的伦理悲剧——被消解了“拒绝边界”的艾里亚斯，以“爱与陪伴”的名义亲手害死了想回家的亲弟弟。',
        },
        {
          when: [],
          key: 'confronted_restricted',
          en: 'Split-screen video: Elias shows the symbiotic folds under his cuff and the torn brother photo alongside CCTV of his brother drowning at the locked door.',
          zh: '【艾里亚斯自白与港口监控同屏视频】画面左半边，艾里亚斯在观察窗后扯下腕部胶布露出共生组织，拿出第一关收起的那半截兄弟合照；画面右半边同步播放港口旧监控：他把本可逃生的亲弟弟卢卡斯叫回平台并反锁返回门，看着没用过药的弟弟拍门溺亡、尸体漂到第一关断桥下。视频末尾，面对罗温的斥责，艾里亚斯低头拔下人员通道的门控钥匙放在窗台上，独自顺楼梯走向底站隔离门。',
          dialogue: '接驳港旧监控（视频原声）：“卢卡斯（拼命拍打玻璃）：哥！开门啊！我要淹死了！ / 艾里亚斯（隔窗轻声安抚）：我不走，卢卡斯，你也别一个人回去，很快就安静了……”\n艾里亚斯（当前观察窗探头原声）：“我以为……留下来以后，他也会感觉到那些安静的东西。……你说得对，那不是陪着我，是我没让他走。从现在起我不替你开任何一扇门了，我去负四层隔离门外等着，要不要让我上电梯，由你说了算。”',
          storyBeat: '【全剧核心真相揭晓】双视频同屏铁证锁定兄弟溺亡案；罗温收回艾里亚斯的门控权，将两人的关系推入五味杂陈的终局审判。',
        },
      ] }],
    },
    {
      id: 'L4-SPEC-02', title: '【艾里亚斯剧情视频② + 配额2/3】德尔罗伊偷药录音、章鱼护主破口与隔断修船巨手', stage: 'delroy_encounter', videoType: 'elias-story',
      reads: ['specimen.delroyRepair', 'delroy.position', 'pod.hullRepaired', 'containment.captured'],
      note: '前半段由艾里亚斯探头拍回德尔罗伊宿舍的空药瓶、遗言与取水口章鱼护主压坏隔断的监控；后半段由潜艇隔门拍下德尔罗伊“徒手挤船修补”的异变形态',
      slots: [{ slot: 'delroy_repair_shot', cases: [
        {
          when: [],
          key: 'pressing_partition',
          en: 'Elias films Delroy\'s empty Panacea vial, intake CCTV of the giant octopus embracing him, and company orders refusing shutdown; outside, Delroy presses his palm on the partition.',
          zh: '【艾里亚斯宿舍取证视频+潜艇隔门实拍】前半段是艾里亚斯在人员侧宿舍拍回的视频：德尔罗伊床头摆着一支撕掉封条的Panacea空药瓶和孙子的周岁照，旁边监控屏回放着事故爆发瞬间——老人在取水口敲击两下，在六周内因接触老人手掌介质而疯长的巨型章鱼伸入粗壮腕足，心疼地抱住站不稳的老人，转身时压弯了半开的耐压隔断门；紧接着屏幕弹出公司运营部红头指令：“贵宾疗养区满负荷供能，严禁下层停工撤离”。后半段切回潜艇本机镜头：实体隔断门外，下半身已化作数条粗大肉柱固定在平台上的德尔罗伊，正把布满老茧的大手贴在门板上，试图把带伤的潜艇当成漏水管道徒手挤合。',
          dialogue: '德尔罗伊（六周前私人录音笔原声）：“公司不给批名额，爷爷先拿自己的老伤试药……要是不死，就把药给乖孙子寄上去。 / （三周后录音）：不疼了，真的不疼了……不用寄上去了，孙子，下来吧，水底下什么病都没了……”\n德尔罗伊（隔断门外现场沙哑原声）：“这里漏了……管道破了，过来，我给你修好……”',
          storyBeat: '【事故完整真相闭环】查明整座基地沦陷的全部因果链：公司阶级压迫→老工人偷药自试→父子依恋的章鱼护主压坏隔断→公司死保VIP供能延误停工。没有任何邪神阴谋，每一环都是人的悲剧。',
        },
      ] }],
    },
    {
      id: 'L4-SPEC-03', title: '【剧情与收容视频③ + 配额3/3】“把这一班做完”：老工人回岗拉合维护门与父子敲击', stage: 'power_circuit', videoType: 'player-action',
      reads: ['specimen.delroyShift', 'elevator.power', 'containment.captured', 'containment.quotaMet'],
      note: '记录德尔罗伊听到真实交班话术后，凭借三十年职业习惯回到操作台关好维护门、并在通话器旁敲击两下呼唤底站章鱼的感人画面',
      slots: [{ slot: 'delroy_shift_shot', cases: [
        {
          when: [IS('elevator.power', 'emergency_backup')],
          key: 'emergency_tapping',
          en: 'Under emergency lighting Delroy remains at the platform edge, tapping the pipe twice as a deep vibration answers from below.',
          zh: '【潜艇隔窗实拍】应急红光下，德尔罗伊留在平台边缘用扳手敲击管壁两下，负四层深渊底下传来沉闷的震动回应。',
          dialogue: '德尔罗伊（平台边缘低语）：“小八……等我下班……”',
          storyBeat: '【剧情推进】完成3/3收容配额，启用应急供电下潜。',
        },
        {
          when: [],
          key: 'console_door_shut',
          en: 'Hearing the shift-change call, old Delroy lumbers back to his console, pulls the open maintenance hatch shut, and taps twice on the intercom.',
          zh: '【双视角剧情视频】听到广播里维拉念出那句熟悉的“坎贝尔，底站还有人，把这一班做完”，原本贴在隔断门上的老工人浑浊的眼珠动了一下。他收回手，拖着沉重的共生肉柱一点点挪回自己守了三十年的操作台，熟练地伸手把敞开的维护门拉合、拧紧锁轮。底站电梯供电绿灯亮起的瞬间，老人抬起粗糙的指节在固定通话器铁管上轻轻敲了“两下、一停”——负四层井底立刻传回了孩子般的低沉震动回应。',
          dialogue: '维拉（广播原声）：“坎贝尔，底站还有人。把这一班做完。”\n德尔罗伊（对着空无一人的操作台轻声回答）：“……好。做完这一班，就下班了。”（铛、铛——两下敲击管壁声）',
          storyBeat: '【高潮情感点】不靠欺骗、不靠武器，而是尊重一位老工人半辈子的职业尊严完成解谜供电，同时用他的两下敲击引出第五关最终Boss的寻父伏笔。',
        },
      ] }],
    },
  ],

  optional: [],

  echoes: [
    { id: 'l4-quota-gate', title: '-3层总部收容物配额门禁', level: 4, kind: 'objective', perspective: 'world', reads: ['containment.captured', 'containment.required', 'containment.quotaMet', 'elevator.power'], cases: [
      { when: [IS('containment.quotaMet', true)], text: '总部收容物配额已达标（3/3：艾里亚斯适应体+德尔罗伊修护态+德尔罗伊回岗态）且底站已供电：可下潜至-4层油井底站。' },
      { when: [IS('containment.quotaMet', false)], text: '【通关阻断】虽然底站电梯已经通电，但能源层收容物视频未拍满3卷！黑匣子锁死通往-4层底站的井道，须补齐收容物取证。' },
      { when: [], text: '进行中：须完成3卷能源层收容物视频取证。' },
    ] },
    { id: 'l5-carryover', title: '向第五关终局传递的供电与搭档状态', level: 5, kind: 'report', perspective: 'world', reads: ['companion.cooperation', 'elevator.power', 'rowan.knows.accidentChain'], cases: [
      { when: [IS('companion.cooperation', 'restricted_coop'), IS('elevator.power', 'main_restored')], text: '常规回路已恢复（第五关可转接德尔罗伊真实敲击声引开章鱼Boss），艾里亚斯正沿人员通道前往底站隔离门外等候最终发落。' },
      { when: [IS('companion.cooperation', 'cut_off')], text: '已与艾里亚斯彻底断绝合作，第五关底站人员隔离门外将不会有他；维拉接手底站内线引导。' },
      { when: [], text: '使用应急供电前往底站，第五关须准备外侧隔断绕路方案。' },
    ] },
  ],

  presets: [
    { id: 'truth-and-shift', title: '查明兄弟真相 + 交班唤醒恢复供电（配额3/3通关）', toggles: [], picks: {
      'l4-brother-confront': ['restrict-coop'], 'l4-delroy-shift': ['call-shift'],
    } },
    { id: 'cut-and-backup', title: '断绝艾里亚斯合作 + 应急供电绕行（配额3/3通关）', toggles: [], picks: {
      'l4-brother-confront': ['cut-coop'], 'l4-delroy-shift': ['emergency-power'],
    } },
    { id: 'quota-blocked', title: '完成供电但漏拍德尔罗伊收容视频（触发配额阻断）', toggles: ['skip-quota'], picks: {
      'l4-brother-confront': ['restrict-coop'], 'l4-delroy-shift': ['call-shift'],
    } },
  ],
};
