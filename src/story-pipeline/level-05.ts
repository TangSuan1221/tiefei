import type { Pipeline } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });

/**
 * 第五关：-4层油井底站 · 终局Boss“深海巨型章鱼”收容取证、父子团聚视频与双人逃生终局抉择。
 */
export const level05: Pipeline = {
  id: 'level-05',
  chapter: 5,
  title: '第五关（-4层）· 油井底站：父亲在上面',
  synopsis: '罗温终于潜入海底最深处的负四层旧油井底站。逃生电梯的接驳舱外门近在咫尺，却被那只长成庞然大物的苍白巨型章鱼死死盘踞——它正是老工人德尔罗伊在负三层喂养了多年、又因接触Panacea而在六周内疯长起来的那个“孩子”。在这里，关灯停船同样毫无用处：章鱼早就知道潜艇在这儿，它伸出巨型腕足从艇腹下方温柔地托起潜艇往上推，想把罗温“送回上面会修东西的父亲德尔罗伊那里”，而这种温柔的托举随时会把铁壳潜艇活活压碎！罗温退回掩体后拍下第1卷收容物视频，看清章鱼在井壁上敲击的“两下、一停”正是等待老人下班的节奏。随后，通过【艾里亚斯在维护支路观察窗与转运间传回的两段催泪终局剧情视频】，玩家将亲眼见证：当负三层德尔罗伊真实的现场敲击声传到底站水声出口时，巨型章鱼顺着声音爬回负三层取水口，将苍老异变的德尔罗伊重新轻轻拢进腕足怀里，老人像多年前一样拍着它的触腕说“下班了，我们回家”；而在最后的转运舱人员隔离门后，艾里亚斯将弟弟的半截合照留在门台上，隔着玻璃向罗温发出灵魂拷问：“上面还是会很吵。你还想回去吗？”',
  status: 'DESIGNED & PIPELINE IMPLEMENTED（3卷终局Boss收容物配额门禁 + 父子团聚剧情视频 + 艾里亚斯三结局剧情视频）',
  sourceDoc: 'docs/story-split-route-2026-09-30.md',
  quota: {
    required: 3,
    capturedFact: 'containment.captured',
    requiredFact: 'containment.required',
    gateFact: 'containment.quotaMet',
    specimens: [
      {
        id: 'SPEC-05A',
        name: '底站终局Boss·巨型共生章鱼（第1卷：封门与托艇送父态，破除关灯解）',
        trait: '彻底打破“关灯停船就能混过去”：它没有敌意，但一直盯着潜艇；只要潜艇靠近或停在原地，它就会伸出巨型腕足托住艇底往负三层能源水道推——它想把破损的潜艇送回上面给“父亲”德尔罗伊修理，稍不退避就会被它小心地压碎',
        blocker: '庞大的苍白身躯与腕足缠绕在底站井壁支撑柱上，把逃生电梯的接驳舱外门堵得水泄不通',
        countermeasure: '退回外侧掩体后，从两个角度曝光拍清它的巨眼、托艇腕足以及在井壁上敲击两下的寻父动作（达成配额1/3）',
      },
      {
        id: 'SPEC-05B',
        name: '循父亲敲击声攀行的巨型章鱼（第2卷：两阶段让路与父子重逢态）',
        trait: '听到上方水声出口传来的德尔罗伊敲击声后，第一反应只松开一条腕足，另一条腕足仍压在接驳口门框上；如果不拍第二卷确认就鲁莽冲过去，会被残留腕足直接拍碎',
        blocker: '横跨在接驳舱入口与上方维护支路交界处，必须等它整只爬进支路才能安全通过',
        countermeasure: '请维拉保持负三层德尔罗伊现场敲击声的转接，连拍两卷确认它滑出接驳口，并接收艾里亚斯从支路观察窗拍回的“章鱼与德尔罗伊父子团聚”剧情视频（达成配额2/3）',
      },
      {
        id: 'SPEC-05C',
        name: '支路隔断锁死与艾里亚斯终局归宿（第3卷：终局收容与人性抉择视频）',
        trait: '总部黑匣子要求必须同时拍下“章鱼被隔断门锁在维护支路内”与“同行者艾里亚斯在隔离门/隔离舱内的最终状态”，才会解开逃生电梯释放杆的机械锁',
        blocker: '逃生电梯主释放杆由黑匣子收容配额联锁控制，未拍满3/3绝对拉不动释放杆',
        countermeasure: '等维拉关上维护支路与接驳水道之间的隔断门（保留章鱼与德尔罗伊父子相通的水道），拍下隔断嵌合结果以及人员隔离门后/外侧隔离舱内艾里亚斯的最终剧情视频（达成配额3/3）',
      },
    ],
  },

  facts: [
    // 客观事实（W）
    { key: 'bottom.stage', layer: 'W', type: 'enum', values: ['octopus_block', 'father_signal', 'dock_seal', 'blackbox_ending'], initial: 'octopus_block', life: 'level', source: '-4层油井底站终局阶段' },
    { key: 'dock.drained', layer: 'W', type: 'bool', initial: false, life: 'level', source: '接驳舱外门关闭、排水并恢复常压' },

    // 言行与终局决策记录（S：由玩家决策写入，驱动Boss引导与三结局视频槽位）
    { key: 'octopus.state', layer: 'S', type: 'enum', values: ['blocking_and_lifting', 'one_arm_left', 'in_maintenance_branch', 'bypassed_at_dock'], initial: 'blocking_and_lifting', life: 'level', source: '引导策略后巨型章鱼Boss所在水道与腕足状态' },
    { key: 'boss.strategy', layer: 'S', type: 'enum', values: ['father_voice_reunion', 'outer_partition_bypass'], initial: 'father_voice_reunion', life: 'persist', source: '应对章鱼Boss的路线（转接父亲真实敲击声团聚 / 外侧隔断绕路）' },
    { key: 'ending.choice', layer: 'S', type: 'enum', values: ['pending', 'leave_elias_behind', 'isolate_elias_together', 'accept_panacea_stay'], initial: 'pending', life: 'persist', source: '终局对合作搭档艾里亚斯与自身归宿的最终决定' },

    // 证据与总部收容配额（E）
    { key: 'containment.required', layer: 'E', type: 'int', min: 1, max: 5, initial: 3, life: 'level', source: '总部黑匣子硬性指令：-4层底站须完成3卷终局收容物视频取证（3/3）' },
    { key: 'containment.captured', layer: 'E', type: 'int', min: 0, max: 5, initial: 0, life: 'persist', source: '分析台已核验的-4层收容物视频数' },
    { key: 'containment.quotaMet', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '推导：containment.captured >= containment.required（未满3卷锁死逃生电梯释放杆）' },
    { key: 'specimen.octopusBlock', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：两角度拍摄章鱼封门与腕足托艇视频（SPEC-05A，配额1/3）' },
    { key: 'specimen.octopusClimb', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：两阶段复拍章鱼攀入支路与父子团聚剧情视频（SPEC-05B，配额2/3）' },
    { key: 'specimen.finalContainment', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：支路隔断锁死与艾里亚斯终局剧情视频（SPEC-05C，配额3/3）' },
    { key: 'evidence.blackboxSealed', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '全五关收容物视频、临床授权链、申请单与公司VIP供能指令锁入上行黑匣子' },

    // 角色认知与证词（K / T）
    { key: 'rowan.knows.octopusIntent', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'persist', source: '比对两下敲击与托艇动作，明白章鱼不是攻击而是想把潜艇送回父亲德尔罗伊身边' },
    { key: 'testimony.vera.consentForm', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '维拉在转运间承认同意书上未写明“会不再把自己当作自己”' },
    { key: 'testimony.elias.finalQuestion', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯在隔离门后通过内线视频问：“上面还是会很吵。你还想回去吗？”' },
  ],

  stages: [
    {
      id: 'octopus_block',
      title: '01 被遮住的电梯门：巨型章鱼的“温柔托举”（配额1/3）',
      dialogueStages: ['octopus_block'],
      narrative: '沉入负四层底站的第一卷照片里，罗温根本没找到逃生电梯的门——原本空旷的水道井壁上贴着一大片苍白的表皮，几条粗大无比的腕足绕过支撑柱，把接驳舱外门遮得严严实实。罗温把视频倒回去，才在岩壁旁看见一只巨大的眼睛正平静地注视着镜头。当罗温试着关灯往外侧挪船时，一条腕足突然从潜艇肚子底下伸过来，没有砸舷窗，而是轻轻托住艇底往负三层的方向推！罗温退回掩体后拍下第1卷收容物视频（达成配额1/3），手心全是冷汗：在显影等待时，章鱼的腕足在井壁上敲了两下——和德尔罗伊等它下班时的敲击一模一样。它不是在攻击，它是要把潜艇送回上面给“父亲”德尔罗伊修理，可不用惹怒它，潜艇也会被它这么小心翼翼地挤扁！',
      objective: '接驳口被巨型章鱼占据，关灯停船会被腕足托往上层挤压 · 退回掩体从两角度拍清其巨眼、腕足托艇与两下敲击（配额1/3）',
      advance: '核验章鱼托艇视频（配额1/3），识破其寻父动机',
      gate: ['specimen.octopusBlock', 'rowan.knows.octopusIntent'],
      sets: [
        T('bottom.stage', 'octopus_block'),
        T('specimen.octopusBlock'),
        T('rowan.knows.octopusIntent'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'father_signal',
      title: '02 父亲在上面：转接敲击声与艾里亚斯传回的“父子重逢”剧情视频（配额2/3）',
      dialogueStages: ['father_signal'],
      narrative: '维拉在上方控制室问要不要干脆封死上层水道把章鱼困死在底站。罗温看着德尔罗伊喂养小章鱼的旧视频，摇头说：“那样它只会一直守在电梯口找他。先让它听见他现在在哪儿。”维拉把负三层德尔罗伊在操作台旁真实敲击管壁的声音（两下，停一下）转接到了底站上方的水声出口。听到父亲的敲击声，章鱼松开了一条挡门的腕足；罗温耐心留在掩体后连拍两卷确认它最后一条腕足也滑出接驳口、完全爬进维护支路。与此同时，正沿内侧人员楼梯下行的艾里亚斯经过维护支路高处观察窗，用探头给罗温拍回了催人泪下的【艾里亚斯探头剧情视频①（父子团聚）】：画面里，顺着声音爬回负三层取水口的巨型章鱼，用两条粗大的腕足像摇篮一样轻轻环抱住已经半身化为肉柱的老工人德尔罗伊，把巨大的头颅贴在老人胸口；老人不再敲击管壁，而是抬起布满老茧的手，像多年前喂养幼年小章鱼那样一下下抚摸着它的腕足，用沙哑的声音轻声说：“又跟着我？……好，我不去上班了，我们下班回家了。”',
      objective: '转接德尔罗伊真实敲击声 · 连拍两卷确认章鱼让出接驳口，并接收艾里亚斯从支路观察窗拍回的“德尔罗伊与章鱼父子团聚”剧情视频（配额2/3）',
      advance: '核验章鱼让路与父子团聚剧情视频（配额2/3），清空接驳水道',
      gate: ['specimen.octopusClimb'],
      sets: [
        T('bottom.stage', 'father_signal'),
        T('specimen.octopusClimb'),
        T('octopus.state', 'in_maintenance_branch'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'dock_seal',
      title: '03 支路落闸与转运间对质：那份没写明代价的同意书（配额3/3达成）',
      dialogueStages: ['dock_seal'],
      narrative: '等章鱼完全进入维护支路后，维拉从控制室落下了维护支路与接驳水道之间的厚重隔断门——这道门只把潜艇和章鱼隔开，却永远保留了维护支路通往负三层德尔罗伊的水道。罗温没有杀死它，而是成全了这对深海里的“父子”。随后维拉打开接驳舱外门，罗温先拍下隔断门锁死以及人员隔离门后艾里亚斯等待的画面（本关3/3收容物配额全部达成！），才把潜艇开进接驳舱。外门关闭、海水排空、气压恢复后，罗温走出潜艇，见到了从楼上走下来的维拉。面对罗温的质问，苍老消瘦的维拉辩解说贵宾客人都签过知情同意书；罗温隔着玻璃看向门外的艾里亚斯，冷冷反问：“那份同意书上，写了会不再把自己当作自己、写了会亲手把想活命的亲弟弟锁死在门外吗？”维拉垂下眼睛，再也说不出一句话。',
      objective: '维拉关闭维护支路隔断（保留父子连通水道）· 拍下三处通路与人员隔离门后艾里亚斯视频（配额3/3达成），进舱排水并与维拉当面对质',
      advance: '终局收容确认视频核验通过（配额3/3），接驳舱排水恢复常压',
      gate: ['specimen.finalContainment', 'containment.quotaMet', 'dock.drained'],
      sets: [
        T('bottom.stage', 'dock_seal'),
        T('specimen.finalContainment'),
        T('dock.drained'),
        T('testimony.vera.consentForm'),
        T('testimony.elias.finalQuestion'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'blackbox_ending',
      title: '04 黑匣子终局视频：半截合照与“上面还是会很吵”',
      dialogueStages: ['blackbox_ending'],
      narrative: '此时逃生电梯旁的舰载黑匣子自检完毕——由于罗温在五层基地里拍齐了全部16卷收容物视频铁证，又锁入了临床跳过随访批文、德尔罗伊申请单与公司VIP优先供能指令，逃生电梯的机械释放杆终于解除锁定！在罗温拉下释放杆前，人员隔离门后的艾里亚斯通过门边的探头与内线摄像头，向分析台传回了全游戏最后一段【艾里亚斯终局剧情视频】：镜头里，艾里亚斯从怀里取出那张一直揣着的半截兄弟合照，轻轻放在隔离门的窗台上，然后抬起那只露着灰白共生褶皱的手，隔着厚重的防爆玻璃，把掌心与玻璃内侧罗温的倒影重合在一起。他没有求饶，也没有砸门，只是眼神安静而悲伤地看着罗温，轻声问道：“罗温，你下水之前说，岸上的人太吵了，总得猜他们在想什么。……上面还是会很吵。你还想回去吗？”罗温站在隔离门开关前，作出最后的决定，并用相机录下了终局的最后一帧画面。',
      objective: '总部收容物配额全部达标（3/3）· 接收艾里亚斯隔离门前“放下兄弟合照”的终局剧情视频，作出最终抉择并拉动逃生电梯释放杆',
      advance: '总部配额3/3硬门禁 + 黑匣子封存 + 终局剧情视频确认 → 全章通关',
      gate: ['containment.quotaMet', 'evidence.blackboxSealed'],
      sets: [T('bottom.stage', 'blackbox_ending'), T('evidence.blackboxSealed')],
    },
  ],

  windows: [
    {
      id: 'l5-boss-strategy', title: '应对巨型章鱼Boss策略选择', speaker: 'vera', stage: 'father_signal', opens: '拍清章鱼敲击井壁两下且腕足托艇要把罗温送回上层后', closes: '章鱼让出接驳口或完成外侧隔断绕路', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'connect-father',
      tags: [
        { id: 'connect-father', label: '接通-3层德尔罗伊真实敲击声，引导章鱼回维护支路与父亲团聚（且不冲动抢过第一卷半开空隙）', examples: ['它在找德尔罗伊！别关上层支路，先把能源层他敲管壁的真实声音接到底站水声出口，等两卷片子确认腕足全退了再关隔断'], keywords: ['找德尔罗伊', '真实声音', '水声出口', '两卷', '维护支路', '父亲'], requires: [IS('rowan.knows.octopusIntent')], fallback: '罗温：得先看清那两卷腕足托艇的录像，弄明白它为什么要把我往上面推。', writes: [T('boss.strategy', 'father_voice_reunion'), T('octopus.state', 'in_maintenance_branch')], reply: '维拉：能源层固定通话线还开着，我把德尔罗伊现场敲击的声音接过去了——两下，停一下。\n（第一卷视频里挡门的腕足松开了，但另一条仍压在边缘；罗温耐心留在掩体后补拍第二卷，确认它顺着父亲的声音完全攀进维护支路，艾里亚斯也从高处观察窗传回了老人与章鱼相拥团聚的视频。）' },
        { id: 'outer-bypass', label: '不使用父亲声音，走油井背面隔断绕路并逐段拍摄封门', examples: ['给我油井背面的外侧绕路，每过一道隔断就关上一道'], keywords: ['外侧绕路', '油井背面', '不接声音', '绕过去'], writes: [T('boss.strategy', 'outer_partition_bypass'), T('octopus.state', 'bypassed_at_dock')], reply: '维拉：好，走背面隔离水道，耗电和氧气会多一些，每过一扇门我替你锁死。\n（罗温逐段拍摄确认腕足未越界，从另一端进入接驳舱；原接驳口的章鱼仍在下面孤独地敲击寻找。）' },
      ],
    },
    {
      id: 'l5-final-choice', title: '转运舱黑匣子封存与对艾里亚斯的终局抉择', speaker: 'elias', stage: 'blackbox_ending', opens: '收到艾里亚斯在隔离窗台放下兄弟合照的终局视频后', closes: '锁定逃生电梯终局', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'isolate-together',
      tags: [
        { id: 'leave-behind', label: '拒绝开门（留置底站）：指出他害死想走的弟弟，绝不让他替岸上的人做决定', examples: ['你弟弟想走，你没让他走。我不会让你替岸上的人决定，人员隔离门我不开'], keywords: ['弟弟想走', '没让他走', '不开门', '留在下面', '替岸上'], writes: [T('ending.choice', 'leave_elias_behind')], reply: '艾里亚斯：……上面还是会很吵。\n（罗温用延迟相机拍下人员隔离门完全锁死的最后一卷确认视频，连同全五关收容物档案锁入黑匣子，与维拉乘电梯上升。）' },
        { id: 'isolate-together', label: '双层隔离同行（合作隔离逃生）：兑现带他出去的承诺，但令其单独进入外侧隔离舱并拍片确认锁死', examples: ['我兑现承诺带你出去，但你已经变了，必须单独进外侧独立隔离舱，等我拍片确认隔断锁死后再一起上浮'], keywords: ['独立隔离舱', '单独进', '带你出去', '隔离同行', '兑现承诺'], writes: [T('ending.choice', 'isolate_elias_together')], reply: '艾里亚斯：……好。我一个人进外侧转运隔离间。\n（艾里亚斯收起窗台上的半截合照走入外侧隔离舱，内侧隔断落下锁死。罗温拍下他在独立隔离舱内安静坐下的确认视频存入黑匣子，三人分舱乘电梯升向海面无人隔离层。）' },
        { id: 'stay-in-abyss', label: '知情接受深海：将黑匣子与全部收容物视频交维拉带回岸上，自己留在底站接受Panacea适应', examples: ['把所有收容物视频和责任原件锁进黑匣子让维拉带上去，我看懂了代价，我选择留下来接受介质'], keywords: ['我留下来', '接受介质', '维拉先走', '留在底站', '不想回去'], writes: [T('ending.choice', 'accept_panacea_stay')], reply: '维拉：你真的看懂后面的记录了？……好，我把黑匣子带上去。\n艾里亚斯：这回是你自己选的。\n（罗温对着镜头录下本人知情同意的声明锁入电梯黑匣子，目送电梯上升后，在隔离底站接受了介质处理。）' },
      ],
    },
  ],

  shots: [
    {
      id: 'L5-SPEC-01', title: '巨型章鱼封门与托艇送父视频 SPEC-05A（配额1/3 · 破除关灯解）', stage: 'octopus_block', videoType: 'player-capture',
      reads: ['specimen.octopusBlock', 'octopus.state', 'containment.captured'],
      note: '苍白巨眼转向镜头，粗大腕足没有刺向舷窗，而是托住潜艇底部缓慢往上方能源水道推——它要把潜艇送给会修东西的父亲',
      slots: [{ slot: 'octopus_block_shot', cases: [
        {
          when: [],
          key: 'cradling_hull_upward',
          en: 'A colossal pale octopus wraps the well pillars; one huge eye turns to the lens while a tentacle cradles the hull from below, gently pushing it upward toward level -3.',
          zh: '【潜艇两角度延迟摄影】第一卷拍到井壁上苍白如雪山的巨型章鱼身躯与一只注视镜头的巨眼；第二卷拍到它的一条粗大腕足从潜艇底部温柔地托起艇腹往负三层水道推，另一条腕足在井壁上轻轻敲出“两下、一停”的节奏。',
          dialogue: '罗温（看着显影画面，倒吸凉气）：“这两下敲击……和第三关视频里小章鱼等德尔罗伊下班时的节奏一模一样。它不是在攻击我——它看我的船破了，想把我捧回负三层交给它那个‘会修东西的父亲’！”',
          storyBeat: '【剧情揭示】将最终Boss的威胁行为转化为令人鼻酸的“孩子找父亲”动机——它没有恶意，但它的温柔托举足以压碎潜艇。',
        },
      ] }],
    },
    {
      id: 'L5-SPEC-02', title: '【艾里亚斯剧情视频① + 配额2/3】父亲的声音：巨型章鱼让出通道与负三层父子相拥团聚', stage: 'father_signal', videoType: 'elias-story',
      reads: ['specimen.octopusClimb', 'boss.strategy', 'octopus.state', 'containment.captured'],
      note: '前半段潜艇连拍两卷确认最后一条腕足滑出接驳门框；后半段艾里亚斯从支路高处观察窗拍回巨型章鱼回到负三层取水口、将老工人德尔罗伊轻轻拥入怀中的催泪团聚画面',
      slots: [{ slot: 'octopus_climb_shot', cases: [
        {
          when: [IS('boss.strategy', 'outer_partition_bypass')],
          key: 'bypass_partitions',
          en: 'Seen from the outer bypass channel, heavy partitions drop one by one while the giant octopus keeps tapping at the main dock.',
          zh: '【潜艇外侧绕路视频】隔离门逐段落下，未听到父亲声音的巨型章鱼仍停在原接驳口孤独地敲击井壁寻找。',
          dialogue: '艾里亚斯（内线原声）：“你没把德尔罗伊的声音接下来……它还在电梯井外头一下、一下地敲着管子找他呢。”',
          storyBeat: '【实时事实影响视频】选择外侧绕路虽然也能通关，但留下的是一段章鱼在深海孤独寻父的凄凉影像。',
        },
        {
          when: [],
          key: 'climbing_to_father',
          en: 'The octopus draws its last tentacle into the maintenance branch; Elias\'s upper window camera captures it cradling old Delroy gently at the intake.',
          zh: '【潜艇让路确认+艾里亚斯支路观察窗剧情视频】前半段拍到章鱼顺着上方水声出口传来的两下敲击，将最后一条腕足滑出接驳口爬进维护支路；后半段切入艾里亚斯在支路高处观察窗用探头拍回的画面——巨型章鱼顺着水道游回负三层取水口，伸出巨大的白色腕足，像小时候缠住老人手指那样，把苍老异变的德尔罗伊轻轻环抱在怀里；老人用布满老茧的手抚摸着贴在脸侧的触腕，随后维拉落下了支路与接驳水道之间的隔断门。',
          dialogue: '德尔罗伊（艾里亚斯探头录下的支路原声，温和而平静）：“小八，你来接我啦？……好，不上班了。这回我们下班回家了。”\n艾里亚斯（探头画外音，声音微颤）：“罗温……我全拍下来了。隔断门只把你那边的接驳水道关上了，他们爷俩在支路里面……再也不用分开了。”',
          storyBeat: '【全剧情感收束点】不杀死最终Boss，而是通过艾里亚斯传回的这段团聚视频，让苦等了一辈子的老工人与他养大的章鱼在深海里安然下班。',
        },
      ] }],
    },
    {
      id: 'L5-SPEC-03', title: '【艾里亚斯终局剧情视频② + 配额3/3】窗台上的半截合照与三结局最终画面', stage: 'dock_seal', videoType: 'elias-story',
      reads: ['specimen.finalContainment', 'ending.choice', 'containment.captured', 'containment.quotaMet'],
      note: '全游戏最后一段剧情与收容确认视频：艾里亚斯在隔离门窗台放下弟弟的半截合照，并根据罗温的最终宣判呈现三种截然不同的结局演出',
      slots: [{ slot: 'final_ending_shot', cases: [
        {
          when: [IS('ending.choice', 'isolate_elias_together')],
          key: 'isolated_cabin_co_escape',
          en: 'Elias picks up his brother\'s half-photo and steps alone into the outer quarantine transfer chamber; the inner steel glass locks shut as the elevator rises.',
          zh: '【结局②：双层隔离舱合作逃生视频】艾里亚斯收起窗台上那半截弟弟的合照，遵照罗温的指令独自走入电梯外侧的全封闭独立隔离转运间，亲手示意罗温从主舱锁死内侧钢化隔断。视频最后，艾里亚斯安静地坐在隔离舱铁椅上，低头摩挲着手里的半截照片，主舱的罗温与维拉同外侧隔离舱的艾里亚斯隔着厚重钢板一同升向海面无人隔离层。',
          dialogue: '罗温（通过轿厢内线问）：“艾里亚斯，我们马上就到海面了。你还记得卢卡斯当时想回去吗？你能承认自己当初不该留下他吗？”\n艾里亚斯（隔离舱监控视频原声，低头看着手腕上的共生褶皱与弟弟的半截照片，眼角滑下一滴泪，久久沉默）：“……我记得他敲门的声音。……谢谢你没有把我一个人丢在水底下，罗温。”',
          storyBeat: '【合作隔离结局】罗温既兑现了第一关“一起逃出去”的搭档承诺，又用双层物理隔离守住了岸上人类的安全底线，并不替艾里亚斯美化他犯下的罪责。',
        },
        {
          when: [IS('ending.choice', 'accept_panacea_stay')],
          key: 'rowan_stays_recording',
          en: 'Rowan records his voluntary informed statement for the ascending blackbox while Elias opens the inner partition to welcome him into the quiet deep.',
          zh: '【结局③：知情接受深海视频】罗温将装满16卷收容物视频与公司罪证的黑匣子锁入电梯交由维拉带回陆地，随后自己坐在镜头前录下清醒的知情同意声明。电梯升走后，视频拍到人员隔离门缓缓打开，艾里亚斯站在门后向罗温伸出手，两人在归于永恒宁静的底站深水中并肩坐下。',
          dialogue: '罗温（对着黑匣子镜头留下的最后原声）：“我是调查员罗温。我看懂了全部记录，自愿留下来接受Panacea适应——但请听清楚：我的自愿，绝不代表卢卡斯·科尔和那些被锁在门里的工人也是自愿的。”\n艾里亚斯（隔离门打开时轻声说）：“这里没有人再吵架了。欢迎留下来，罗温。”',
          storyBeat: '【知情融入结局】呼应序章罗温对陆地喧嚣的厌倦，同时严守正典底线——哪怕主角自己选择留下，也绝不替无辜溺亡的死者签下“同意”。',
        },
        {
          when: [],
          key: 'left_behind_glass',
          en: 'Elias leaves his brother\'s half-photo on the sill and presses his palm against the locked partition glass, watching the elevator rise without him.',
          zh: '【结局①：留置底站（小说原结局）视频】艾里亚斯把那张半截兄弟合照留在窗台上，抬起露出灰白共生褶皱的手贴在防爆玻璃上；罗温没有按下人员隔离门的解锁键，只用延迟相机拍下隔离门完全锁死的最后一卷铁证存入黑匣子，与维拉转身走进逃生电梯。',
          dialogue: '罗温（隔窗原声）：“你弟弟当时想走，是你没让他走。我不会让你上去替岸上的人做决定。”\n艾里亚斯（站在锁死的玻璃门后，没有砸门也没有咒骂，只是温柔而安静地望着上升的电梯）：“……上面还是会很吵。保重，罗温。”',
          storyBeat: '【小说正典结局】首尾完美呼应序章“岸上太吵”的主题——罗温虽然渴望安静，但他最终选择回到吵闹却允许别人说“不”的人间。',
        },
      ] }],
    },
  ],

  optional: [],

  echoes: [
    { id: 'l5-quota-gate', title: '-4层终局总部收容物配额门禁', level: 5, kind: 'objective', perspective: 'world', reads: ['containment.captured', 'containment.required', 'containment.quotaMet', 'evidence.blackboxSealed'], cases: [
      { when: [IS('containment.quotaMet', true), IS('evidence.blackboxSealed', true)], text: '【全章通关】全五关收容物视频配额100%达标，黑匣子证据链与艾里亚斯终局视频已封存，逃生电梯释放杆解锁！' },
      { when: [IS('containment.quotaMet', false)], text: '【通关阻断】虽然已经进入接驳舱走完终局对话，但底站收容物视频未拍满3/3！逃生电梯释放杆仍被黑匣子机械锁死，必须补齐章鱼Boss与隔离门视频取证方可通关。' },
      { when: [], text: '进行中：须完成底站3卷终局收容物视频取证并封存黑匣子。' },
    ] },
    { id: 'l5-epilogue', title: '黑匣子终局档案总结', level: 5, kind: 'report', perspective: 'world', reads: ['boss.strategy', 'ending.choice', 'containment.quotaMet'], cases: [
      { when: [IS('boss.strategy', 'father_voice_reunion'), IS('ending.choice', 'isolate_elias_together')], text: '终局总结：你用真实父亲敲击声让章鱼与德尔罗伊在维护支路团聚，拍齐全部收容物样本，并以双层隔离舱带艾里亚斯共同逃离深海——既兑现了合作承诺，也守住了岸上的安全边界。' },
      { when: [IS('ending.choice', 'leave_elias_behind')], text: '终局总结：你拍齐全部收容物样本并将完整事故责任链带回海面；因为艾里亚斯曾剥夺弟弟离开的权利，你将他留在了底站隔离门后。' },
      { when: [IS('ending.choice', 'accept_panacea_stay')], text: '终局总结：你让维拉带着存满收容物视频与授权铁证的黑匣子返回陆地，自己在充分知情后选择留在安静的深海。' },
      { when: [], text: '终局待定。' },
    ] },
  ],

  presets: [
    { id: 'reunion-and-isolate', title: '父子团聚 + 艾里亚斯隔离舱合作逃生（配额3/3完美通关）', toggles: [], picks: {
      'l5-boss-strategy': ['connect-father'], 'l5-final-choice': ['isolate-together'],
    } },
    { id: 'reunion-and-leave', title: '父子团聚 + 留置艾里亚斯独自上浮（配额3/3小说原结局）', toggles: [], picks: {
      'l5-boss-strategy': ['connect-father'], 'l5-final-choice': ['leave-behind'],
    } },
    { id: 'bypass-and-stay', title: '外侧绕路 + 罗温知情留下接受深海（配额3/3通关）', toggles: [], picks: {
      'l5-boss-strategy': ['outer-bypass'], 'l5-final-choice': ['stay-in-abyss'],
    } },
    { id: 'quota-blocked', title: '走到电梯终局但漏拍收容物（触发释放杆硬门禁阻断）', toggles: ['skip-quota'], picks: {
      'l5-boss-strategy': ['connect-father'], 'l5-final-choice': ['isolate-together'],
    } },
  ],
};
