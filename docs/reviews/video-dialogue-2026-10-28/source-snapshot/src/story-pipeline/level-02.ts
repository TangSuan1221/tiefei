import type { Pipeline } from './model';

const T = (fact: string, value: string | number | boolean = true) => ({ fact, op: 'set' as const, value });
const ADD = (fact: string, value: number) => ({ fact, op: 'add' as const, value });
const IS = (fact: string, value: string | number | boolean = true) => ({ fact, op: '==' as const, value });
const GE = (fact: string, value: number) => ({ fact, op: '>=' as const, value });

/**
 * 第二关：-1层生活区 · 互斥习性收容物取证与探头视频协作。
 */
export const level02: Pipeline = {
  id: 'level-02',
  chapter: 2,
  title: '第二关（-1层）· 生活区：隔着防爆玻璃的探头',
  synopsis: '罗温顺着下行井降入负一层生活区，艾里亚斯则走内侧楼梯赶往生活区前厅。刚说了两句话，这一层的固定通话器就彻底断电，只剩自动广播在空旷的水道里回荡：“欢迎入住，您已不必继续忍受疼痛。”要想和艾里亚斯重新取得联系，罗温只能先去安保室借走死者腰间的有缆摄像探头，在观察廊隔着厚重的防爆玻璃，把探头顺着传递管道塞给对面的艾里亚斯。与此同时，总部黑匣子要求罗温在本层拍齐三种习性完全相反的生物（趋光住客、畏光深海鳗、循声盲猎者）——在这里，“关灯停船”不再是万能解：压载库门口的畏光鳗一旦见你关灯靠近就会扑上来咬碎艇壳，必须开强光逼退它才能拿到下潜配重；而艾里亚斯拿着探头拍回来的视频里，更藏着解开污染走廊的真正线索。',
  status: 'IMPLEMENTED（主游戏 LivingDeckSite + 三种互斥收容物配额门禁 + 探头双向视频协作）',
  sourceDoc: 'docs/level-02-living-deck-design.md',
  quota: {
    required: 3,
    capturedFact: 'containment.captured',
    requiredFact: 'containment.required',
    gateFact: 'containment.quotaMet',
    specimens: [
      {
        id: 'SPEC-02A',
        name: '穿睡衣的趋光住客（第1种：见光靠拢）',
        trait: '接受过Panacea疗养的住客，没有恶意，但只要探照灯亮着3秒就会顺着光飘过来贴死舷窗，挡住镜头并锁死机械臂',
        blocker: '悬停在R1洗衣房的备用电池箱正上方，以及G观察廊的防爆玻璃外侧',
        countermeasure: '先拍下她下肢分化为柔软组织的特征（完成1/3配额），再用灯光把她引到房间远角，随后关灯摸黑绕回电池箱前取电',
      },
      {
        id: 'SPEC-02B',
        name: '压载库门口的畏光深海鳗（第2种：关灯即咬，破除关灯解）',
        trait: '彻底打破“关灯停船就能混过去”的惯性：它在黑暗中极其凶猛，一旦关灯靠近4米内就会一口咬住艇壳把潜艇甩出去；但它极度畏惧强光',
        blocker: '横在R4压载库大门口，挡住了获取“下潜配重块”的唯一去路',
        countermeasure: '在门外拍清它管状眼与畏光蜷缩的特征（完成2/3配额），顶着电量消耗持续开启探照灯照射3秒，把它逼退进角落通风管，再进库挂上配重',
      },
      {
        id: 'SPEC-02C',
        name: '阀门间的无眼盲猎者（第3种：循声冲撞）',
        trait: '完全看不见光，但体侧长满感知水波震动的侧线孔；拧动阀门必然发出金属巨响将它惊醒，若此时开声纳或全速逃跑必被猛烈撞击',
        blocker: '沉睡在V阀门间的三路阀门旁，另有两条在淹没中庭底层巡游',
        countermeasure: '先拍下它的无眼侧线孔特征（完成3/3配额），得知“只要2秒内不出声，它贴艇滑过也不会撞击”；拧完阀门后立刻关停推进器原地静默，等它摸空游走',
      },
    ],
  },

  facts: [
    // 客观事实（W）
    { key: 'deck.stage', layer: 'W', type: 'enum', values: ['descend', 'explore', 'glass', 'valve', 'atrium', 'code', 'uplink', 'met', 'exit'], initial: 'descend', life: 'level', source: 'LivingDeck.stage 实时阶段' },
    { key: 'pod.lamp', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'off', life: 'level', source: 'run.lit 探照灯状态（决定趋光者吸引与避光鳗逼退）' },
    { key: 'pod.pulse', layer: 'W', type: 'enum', values: ['on', 'off'], initial: 'off', life: 'level', source: 'run.sonarEmitting（决定盲猎者唤醒）' },
    { key: 'pod.ballast', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'LivingState.ballast：是否已在R4逼退避光鳗取得配重' },
    { key: 'probe.state', layer: 'W', type: 'enum', values: ['none', 'carried', 'launched', 'withAlex'], initial: 'none', life: 'level', source: 'LivingState.probe 摄像探头状态' },
    { key: 'valve.choice', layer: 'W', type: 'enum', values: ['none', 'heat_wrong', 'cool_wrong', 'feed_correct'], initial: 'none', life: 'level', source: 'LivingState.valves 玩家实际操作的阀门' },
    { key: 'slime.cleared', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'LivingState.slimeCleared：V-2营养液阀关闭后粘液萎缩沉底' },
    { key: 'gate.open', layer: 'W', type: 'bool', initial: false, life: 'level', source: 'LivingState.gateOpen：密码与步骤图推送后艾里亚斯从内侧开闸' },
    { key: 'creature.lumenState', layer: 'W', type: 'enum', values: ['blocking', 'lured_corner', 'clinging'], initial: 'blocking', life: 'level', source: 'LivingCreatures：趋光住客实时位置' },
    { key: 'creature.shadeState', layer: 'W', type: 'enum', values: ['blocking_door', 'recoiled_by_light', 'biting_in_dark'], initial: 'blocking_door', life: 'level', source: 'LivingCreatures：避光鳗实时状态（关灯靠近即咬击）' },
    { key: 'creature.blindState', layer: 'W', type: 'enum', values: ['sleeping', 'hunting_sound', 'brushing_silent'], initial: 'sleeping', life: 'level', source: 'LivingCreatures：盲猎者实时状态' },

    // 证据与总部收容配额（E）
    { key: 'containment.required', layer: 'E', type: 'int', min: 1, max: 5, initial: 3, life: 'level', source: '总部黑匣子硬性指令：-1层须拍摄全部3类互斥收容物（趋光/避光/盲猎）' },
    { key: 'containment.captured', layer: 'E', type: 'int', min: 0, max: 5, initial: 0, life: 'persist', source: '分析台已核验的-1层收容物种类数' },
    { key: 'containment.quotaMet', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '推导：containment.captured >= containment.required（未满3种锁死下行井D）' },
    { key: 'specimen.lumen', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：趋光住客（SPEC-02A）视频' },
    { key: 'specimen.shade', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：避光深海鳗（SPEC-02B）视频' },
    { key: 'specimen.blind', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '分析台核验：侧线盲猎者（SPEC-02C）视频' },
    { key: 'evidence.securityTape', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '安保员遗留探头录像：VIP优先供能驳回关阀申请' },
    { key: 'evidence.alexIntroTape', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯探头首卷视频：三色环管（黄环粘液最厚，红环干净）与琥珀茧' },
    { key: 'evidence.slimeResultTape', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '艾里亚斯探头结果视频：粘液变化核验' },
    { key: 'evidence.codeAndGuide', layer: 'E', type: 'bool', initial: false, life: 'level', source: '管理员密码卡0917读取 + 墙面开闸步骤图摄影核验' },
    { key: 'evidence.delroyForm', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '可选：拍摄德尔罗伊为孙子提交的治疗资格申请单' },
    { key: 'evidence.reunionGate', layer: 'E', type: 'bool', initial: false, life: 'persist', source: '密码闸门F开启且艾里亚斯现身的会合视频' },

    // 角色认知（K）
    { key: 'rowan.knows.contradiction', layer: 'K', holder: 'rowan', type: 'bool', initial: false, life: 'level', source: '核验艾里亚斯视频发现黄环营养液管才是污染源（反驳其供热管猜测）' },
    { key: 'rowan.valveStrategy', layer: 'K', holder: 'rowan', type: 'enum', values: ['trust_video_feed', 'trust_elias_heat', 'wrong_cool'], initial: 'trust_video_feed', life: 'persist', source: '玩家在阀门间的判断依据' },
    { key: 'elias.knows.keeperLock', layer: 'K', holder: 'elias', type: 'bool', initial: false, life: 'persist', source: '会合后得知管理员从外侧锁门的留言' },

    // 关系与承诺（R / C / S / T）
    { key: 'relation.elias.trust', layer: 'R', type: 'int', min: -2, max: 2, initial: 0, life: 'persist', source: '探头协作与会合对话加减' },
    { key: 'said.rowan.explainedPipe', layer: 'S', type: 'bool', initial: false, life: 'persist', source: '会合时向艾里亚斯指出视频里黄环管才是源头' },
    { key: 'commitment.elias.stairs', layer: 'C', type: 'enum', values: ['none', 'wait_shaft', 'swim_stairs'], initial: 'swim_stairs', life: 'persist', source: '会合后约定如何进入-2层临床区' },
    { key: 'testimony.keeper.note', layer: 'T', type: 'bool', initial: false, life: 'persist', source: '管理员卡片留言：“对不起，为了让里面的人安全”' },
  ],

  stages: [
    {
      id: 'descend',
      title: '01 竖井断联：自动广播与失声的走廊',
      dialogueStages: ['descend'],
      narrative: '潜艇顺着下行竖井沉入负一层生活区。墙上的固定水声通话器突然响起艾里亚斯断断续续的声音：“罗温？我到楼梯间了。这一层的通话器全在掉电……我去生活区前厅，你从外廊绕过去，观察廊见。”话音未落，通话器彻底断电，只剩冰冷的自动广播在空旷的水道里回荡：“欢迎入住。您已不必继续忍受疼痛。”与此同时，潜艇黑匣子弹出本层指令：必须拍齐本层3种习性互斥的收容物样本，否则通往负二层的下行井D不予解锁。',
      objective: '沿竖井下降至-1层 · 呼叫艾里亚斯后固定通话器掉电，总部下达3种互斥收容物拍摄配额（0/3）',
      advance: '进入宿舍外廊C1，水声通话断绝，后续仅能靠探头交换视频',
      gate: [],
      sets: [T('deck.stage', 'descend')],
    },
    {
      id: 'explore',
      title: '02 光与暗的博弈：趋光住客、畏光鳗与借走探头（配额2/3）',
      dialogueStages: ['explore'],
      narrative: '外廊铺着泡烂的地毯。罗温在北侧R1洗衣房发现备用电池箱，天花板上却悬着一个穿病号服的女人——她的双腿已分化成柔软的共生组织，只要开灯就会微笑着贴上舷窗。罗温先拍下她的影像（配额1/3），再用灯光把她引到角落、关灯摸黑取走电池。接着在R3安保室，罗温从一具殉职安保员遗体腰间取下了有缆摄像探头（探头里留着死者生前申请关闭营养管却被运营部以“VIP优先供能”驳回的录像）。最后在东侧R4压载库门口，一条半透明的畏光深海鳗堵死了大门——如果照搬“关灯停船”的老办法靠近，会被它在黑暗中一口咬飞！罗温拍下它的畏光特征（配额2/3）后，顶着电量消耗持续开启强光照射3秒，把畏光鳗逼退进角落通风管，成功进库挂上了下潜配重。',
      objective: '拍摄R1趋光住客（1/3）与R4门口避光鳗（2/3）· 关灯会被避光鳗咬击，必须开强光逼退取配重，并在R3取回摄像探头箱',
      advance: '核验趋光者与避光鳗视频（2/3），取回探头箱与配重',
      gate: ['specimen.lumen', 'specimen.shade', 'evidence.securityTape', 'pod.ballast'],
      sets: [
        T('deck.stage', 'explore'),
        T('specimen.lumen'),
        T('specimen.shade'),
        T('creature.lumenState', 'lured_corner'),
        T('creature.shadeState', 'recoiled_by_light'),
        T('pod.lamp', 'on'),
        T('pod.ballast'),
        T('probe.state', 'carried'),
        T('evidence.securityTape'),
        ADD('containment.captured', 2),
      ],
    },
    {
      id: 'glass',
      title: '03 隔窗重逢：递出探头与视频里的破绽',
      dialogueStages: ['glass', 'awaitAlexTape'],
      narrative: '罗温驶入G观察廊。厚达十厘米的防爆玻璃后面，艾里亚斯果然站在前厅里，正用手电筒照着玻璃向他招手。防爆玻璃完全隔音，两人近在咫尺却听不见彼此半个字。艾里亚斯指了指墙脚的传递管道口。罗温把潜艇对准管口，将有缆摄像探头送了进去。艾里亚斯接住探头，转身游进前厅后方被紫红色粘液封死的走廊。四十五秒后，线缆传回了艾里亚斯拍下的第一卷视频：他在镜头前说“粘液喜欢暖，我猜是红环热水管漏了，你去阀门间把供热关掉试试”；但罗温把视频倒回去仔细一看，镜头扫过管壁时，红环供热管干干净净，反倒是黄环营养液管的接缝被粘液裹得最厚，旁边还立着一具被粘液包成琥珀茧的尸体。',
      objective: '隔防爆玻璃见到艾里亚斯（无法通话）· 从传递管发射探头，接收并核验艾里亚斯拍回的污染走廊视频',
      advance: '核验艾里亚斯首卷探头视频（发现口头猜测与画面事实矛盾）',
      gate: ['evidence.alexIntroTape', 'rowan.knows.contradiction'],
      sets: [
        T('deck.stage', 'glass'),
        T('probe.state', 'withAlex'),
        T('evidence.alexIntroTape'),
        T('rowan.knows.contradiction'),
      ],
    },
    {
      id: 'valve',
      title: '04 阀门巨响：拍下盲猎者（配额3/3）与清除粘液',
      dialogueStages: ['valve', 'awaitResult'],
      narrative: '罗温来到V阀门间。墙上钉着“VIP疗养区优先供给·禁止关闭”的铜牌，并排立着红（供热）、黄（营养液）、蓝（冷却）三个大阀轮；而在阀门间角落里，正睡着一条没有眼睛、体侧排满侧线孔的盲猎者。罗温先对准盲猎者拍下第3卷收容物视频（本关3/3配额全部达成！），从分析台得知它只靠声音锁定目标，只要2秒内不出声就不会撞击。随后罗温没有听信艾里亚斯的口头猜测，而是相信自己从视频里看到的真相，伸臂拧死了黄环营养液阀！刺耳的金属撞击声瞬间惊醒了盲猎者，罗温立刻关掉推进器一动不动，任由盲猎者贴着安静的艇壳擦身滑过。两分钟后，艾里亚斯用探头传回结果视频：断绝营养后粘液迅速萎缩沉底，他已经顺利游过走廊，约罗温在中庭东侧的密码闸门见。',
      objective: '拍摄阀门间盲猎者（配额3/3达成）· 依据探头视频关闭V-2黄环营养液阀，关阀巨响后立即静默躲避盲猎者并核验艾里亚斯结果视频',
      advance: '盲猎者视频核验（配额3/3）+ 粘液萎缩结果视频核验',
      gate: ['specimen.blind', 'containment.quotaMet', 'evidence.slimeResultTape', 'slime.cleared'],
      sets: [
        T('deck.stage', 'valve'),
        T('specimen.blind'),
        T('creature.blindState', 'brushing_silent'),
        T('valve.choice', 'feed_correct'),
        T('slime.cleared'),
        T('evidence.slimeResultTape'),
        ADD('containment.captured', 1),
      ],
    },
    {
      id: 'code',
      title: '05 穿越中庭：管理员遗体与0917密码',
      dialogueStages: ['atrium', 'code'],
      narrative: '要去东侧闸门，必须穿过三层通高的淹没中庭——上层飘着两名见光就靠过来的趋光住客，底层游着两条听声就追的盲猎者。罗温关掉探照灯、停掉主动声纳，将航速压在每秒0.45米以下，从上下两层威胁之间悄声穿过，拐进南侧的R5住宿管理处。办公桌边趴着宿舍管理员的遗体，罗温用机械臂从她衣袋里取回证件夹，在分析台读出闸门密码“0917”与背面的一行字：“对不起，为了让里面的人安全”（旁边还放着老工人德尔罗伊为重病孙子排队申请治疗资格的旧表单）。罗温随后对准墙上的应急开闸步骤图拍下一卷清晰照片。',
      objective: '在上下两层趋光/盲猎夹击下静默穿过中庭 · 在R5取回管理员密码卡0917并拍摄墙上开闸步骤图',
      advance: '密码卡读取 + 开闸步骤图核验通过',
      gate: ['evidence.codeAndGuide'],
      sets: [T('deck.stage', 'code'), T('evidence.codeAndGuide'), T('testimony.keeper.note')],
    },
    {
      id: 'uplink',
      title: '06 闸门会合：推送开闸指南与恢复通话',
      dialogueStages: ['uplink', 'awaitGate', 'met'],
      narrative: '罗温驾驶潜艇来到中庭东侧的密码闸门F外侧，隔着观察窗，把核验好的“0917密码”和“先拉泄压杆、再输密码、最后转锁轮”的步骤图推送到艾里亚斯手里的探头屏幕上。二十五秒后，内侧锁轮缓缓转动，沉重的闸门升起。罗温按下快门拍下闸门开启、艾里亚斯站在内侧门槛边的会合视频。随着探头线缆接回潜艇水声机，耳机里终于重新传来了艾里亚斯真实的声音。',
      objective: '在F闸门观察窗将密码与步骤图推送至艾里亚斯探头屏幕 · 拍摄闸门开启与艾里亚斯现身会合视频',
      advance: '会合视频核验，有线水声通信恢复',
      gate: ['gate.open', 'evidence.reunionGate'],
      sets: [T('deck.stage', 'met'), T('gate.open'), T('evidence.reunionGate'), T('elias.knows.keeperLock')],
    },
    {
      id: 'exit',
      title: '07 配重下潜：向负二层临床区进发',
      dialogueStages: ['exit'],
      narrative: '两人隔着闸门门槛简短交谈。艾里亚斯看着管理员留下的“为了里面的人安全才从外面锁门”的纸条，苦笑着说自己在门里敲了很久。因为下潜配重挂在罗温的潜艇腹部，且罗温已经拍齐了本层全部3种互斥收容物的视频，黑匣子解开了西侧下行井D的配平锁。两人约定：罗温驾驶潜艇顺下行井先下到负二层，艾里亚斯带着探头从内侧人员楼梯井游下去，到负二层临床区的通话器再汇合。',
      objective: '总部收容物配额已满（3/3）且配重已挂载 · 与艾里亚斯约定-2层路线后沉入下行井D',
      advance: '配额3/3门禁 + 会合视频 + 配重 → 进入-2层临床区',
      gate: ['evidence.reunionGate', 'pod.ballast', 'containment.quotaMet'],
      sets: [T('deck.stage', 'exit')],
    },
  ],

  windows: [
    {
      id: 'l2-shaft-call', title: '竖井失联前最后通话', speaker: 'elias', stage: 'descend', opens: '进入-1层竖井', closes: '固定通话器断电', multi: false, optional: true,
      advanceOn: '*', defaultTag: 'ack',
      tags: [
        { id: 'ack', label: '告知总部收容物配额并约定观察廊见', examples: ['听到了，总部要求拍齐这三类收容物，我们在观察廊见', '观察廊见，小心'], keywords: ['观察廊', '收到', '听到', '收容物', '配额', '小心', '见'], writes: [ADD('relation.elias.trust', 1)], reply: '艾里亚斯：……罗温？是你吗？我到楼梯间了。\n艾里亚斯：这一层的通话器全在掉电……我去生活区前厅。你从外廊绕过去，把挡路的收容物拍清楚，观察廊见——\n（固定通话器彻底断电，自动广播响起：“欢迎入住。您已不必继续忍受疼痛。”）' },
        { id: 'warn-door', label: '提醒他小心内侧隔离门', examples: ['等一下，那边的门别乱开'], keywords: ['等一下', '门', '别乱', '停'], writes: [], reply: '艾里亚斯：……什么门？信号全断了……观察廊见——\n（通话器断电。）' },
      ],
    },
    {
      id: 'l2-valve-judgment', title: '探头视频核验与关阀判断（罗温内省/日志）', speaker: 'rowan', stage: 'glass', opens: '收到艾里亚斯首卷探头视频', closes: '前往阀门间操作', multi: false, optional: false,
      advanceOn: '*', defaultTag: 'verify-yellow',
      tags: [
        { id: 'verify-yellow', label: '核对视频细节：黄环营养液管才是源头', examples: ['视频里红环供热管是干净的，黄环营养液管接缝全是粘液，应该关黄环'], keywords: ['黄环', '营养', '干净', '接缝', '视频', '不对'], requires: [IS('rowan.knows.contradiction')], fallback: '罗温：得先把艾里亚斯传来的探头视频看清楚。', writes: [T('rowan.valveStrategy', 'trust_video_feed'), T('said.rowan.explainedPipe')], reply: '罗温：艾里亚斯在镜头里猜是热水管……可视频画面骗不了人，红环供热管干干净净，黄环营养液管的接缝全被粘液包住了。\n罗温：去阀门间关黄环V-2。角落里还有一条睡着的盲猎者，先拍下它的收容样本，关完阀立刻停推静默。' },
        { id: 'follow-heat', label: '盲信口头猜测：先关红环供热阀', examples: ['照艾里亚斯说的，去关红环供热阀'], keywords: ['红环', '供热', '热水', '照他说'], writes: [T('rowan.valveStrategy', 'trust_elias_heat')], reply: '罗温：先试着关供热阀看看……\n（探头稍后传回异常视频：粘液毫无退缩，反而把疗养区一名趋光住客引了出来；罗温不得不重开V-1并改关黄环V-2。）' },
        { id: 'wrong-cool', label: '误判：去关蓝环冷却阀', examples: ['试试关掉蓝环冷却水'], keywords: ['蓝环', '冷却'], writes: [T('rowan.valveStrategy', 'wrong_cool')], reply: '罗温：关掉冷却回水试试……\n（探头传回告警视频：水温升高导致粘液疯长！罗温紧急重开V-3并改关黄环V-2。）' },
      ],
    },
    {
      id: 'l2-reunion-talk', title: 'F闸门会合通话（探头有线水声恢复）', speaker: 'elias', stage: 'uplink', opens: '拍摄闸门开启与艾里亚斯现身视频后', closes: '前往下行井D', multi: true, optional: false,
      advanceOn: ['plan-descent', 'explain-pipe'],
      tags: [
        { id: 'explain-pipe', label: '告诉他探头视频帮了大忙并准备下潜', examples: ['多亏你的探头视频，黄环营养管关掉后路通了，我们去下一层'], keywords: ['探头', '视频', '黄环', '营养', '路通了', '下一层'], writes: [T('said.rowan.explainedPipe'), T('commitment.elias.stairs', 'swim_stairs'), ADD('relation.elias.trust', 1)], reply: '艾里亚斯：罗温？……听得见吗？探头的线接到你的水声机上了。\n艾里亚斯：冷。手一直在抖。刚才我猜是热水管，幸好你仔细看了我拍过去的画面。\n艾里亚斯：配重在你艇上，你顺西边下行井下去，我从淹没的人员楼梯井游到-2层临床区。探头我随身带着，到底下找通话器叫你。' },
        { id: 'ask-keeper', label: '质问管理员外侧锁门的事', examples: ['管理员从外面锁了门，说为了里面的人安全'], keywords: ['管理员', '锁门', '外面锁', '纸条', '安全'], writes: [T('elias.knows.keeperLock')], reply: '艾里亚斯：管理员的纸条我也看了。从外面把人锁在里面，叫安全？\n艾里亚斯：我只知道门打不开的时候，我在里面敲了很久。' },
        { id: 'plan-descent', label: '确认收容物配额已满，立即分路下潜', examples: ['这层的三类收容物我都拍齐了，下行井见'], keywords: ['拍齐', '收容物', '下行井', '下潜', '出发'], writes: [T('commitment.elias.stairs', 'swim_stairs')], reply: '艾里亚斯：好。你的黑匣子配额满了，下行锁也开了。我在闸门这边看着你的灯往下沉，-2层临床区见。' },
      ],
    },
  ],

  shots: [
    {
      id: 'L2-SPEC-01', title: '拍摄趋光住客 SPEC-02A（配额1/3）', stage: 'explore', videoType: 'player-capture',
      reads: ['pod.lamp', 'creature.lumenState', 'specimen.lumen', 'containment.captured'],
      note: '实时极暗看不清人形；视频揭示穿睡衣的女性住客下肢分化为柔软组织，面朝光源平静靠拢',
      slots: [{ slot: 'lumen_behavior', cases: [
        {
          when: [IS('creature.lumenState', 'lured_corner')],
          key: 'drawn_away',
          en: 'A pale figure in a hospital gown drifts toward the far corner beam, lower limbs split into soft fronds.',
          zh: '【画面】穿丝绸病号服的女性住客顺着潜艇先前打出的光斑慢慢漂向洗衣房西北远角，她膝盖以下已分化成半透明的柔软组织，胸前还别着一枚“VIP疗养贵宾”胸针；她脸上毫无痛苦，正温柔地伸手去抚摸墙壁上的光影，腾出了下方的备用电池箱。',
          storyBeat: '【剧情揭示】这些“怪物”其实是花重金入住基地的贵宾疗养客——Panacea治好了她们的病痛，却让她们失去了自我，只本能地追逐温暖与光亮。',
        },
        {
          when: [],
          key: 'hovering',
          en: 'Suspended below the ceiling, the calm resident turns her face toward the submarine floodlight.',
          zh: '【画面】趋光住客静静悬在天花板下，皮下泛着淡青色共生微光，平静的脸庞缓缓转向潜艇探照灯。',
        },
      ] }],
    },
    {
      id: 'L2-SPEC-02', title: '拍摄压载库避光鳗 SPEC-02B（配额2/3 · 破除关灯解）', stage: 'explore', videoType: 'player-action',
      reads: ['pod.lamp', 'creature.shadeState', 'specimen.shade', 'containment.captured'],
      note: '关灯停船会被咬击！视频记录强光照射下避光鳗蜷缩退入R4东北角通风口的过程',
      slots: [{ slot: 'shade_behavior', cases: [
        {
          when: [IS('pod.lamp', 'on')],
          key: 'recoiling',
          en: 'Caught in the harsh floodlight cone, the translucent tubular-eyed eel coils tight and retreats into the vent.',
          zh: '【画面】在潜艇探照灯的刺眼强光直射下，盘踞在压载库门口的半透明管状眼深海鳗痛苦地蜷缩成一团，松开缠在配重架上的长尾，倒退着钻进了东北角的通风管道深处。',
          storyBeat: '【玩法与叙事结合】直观印证“不同生物习性相反，关灯装死在这里等于找死”，只有靠视频看清习性并对症开强光才能拿到下潜配重。',
        },
        {
          when: [],
          key: 'guarding_dark',
          en: 'In the dim doorway the pale eel uncoils across the hatch, jaws parted toward the unlit hull.',
          zh: '【画面】黑暗中避光鳗横堵门洞，朝关灯的潜艇张口逼近。',
        },
      ] }],
    },
    {
      id: 'L2-SECURITY-LOG', title: '安保员遗留探头录像：被公司驳回的关阀请求', stage: 'explore', videoType: 'elias-story',
      reads: ['evidence.securityTape'],
      note: '从R3殉职安保员腰间取回探头箱时，存储卡里自带的生前最后一段视频',
      script: {
        visual: '【画面】剧烈晃动的手持探头画面。年轻的安保员站在疗养区营养管线检修口前，手电筒照着黄环管道接缝——那里正源源不断地往外渗出温热的果冻状生物粘液。安保员拼命按着墙上的内线电话，随后绝望地滑坐在监控台旁，成群的端足虫从阴影里爬上他的护腿。',
        dialogue: '安保员（视频原声）：“这里是负一层安保值班室！黄环营养管接缝长出活体菌丝了，再不关阀整条走廊都会被堵死！……什么？运营部说‘贵宾疗养区优先供给，严禁关闭阀门’？！外面的维修工还在撤离啊！……没人回话了。谁捡到这只探头，把这段录像带出去——不是天灾，是公司不准我们停泵！”',
        reveal: '【剧情揭示】揭露基地第一层人祸：事故发生时，公司为了维护天价VIP疗养客户的营养供给，严令禁止关闭阀门，直接导致污染失控与底层员工被困。',
      },
      slots: [],
    },
    {
      id: 'L2-ALEX-01', title: '艾里亚斯探头剧情视频①：撕掉名字的旧病床、老马丁的琥珀茧与三色管道', stage: 'glass', videoType: 'elias-story',
      reads: ['probe.state', 'evidence.alexIntroTape', 'relation.elias.trust'],
      note: '防爆玻璃隔音，艾里亚斯接过探头后传回的第一段长剧情视频：不仅拍下三色管道谜题，更拍下他路过自己曾住过的早期员工观察床，以及认出琥珀茧中死难同事老马丁的崩溃瞬间',
      slots: [{ slot: 'probe_intro', cases: [
        {
          when: [GE('relation.elias.trust', 1)],
          key: 'trust_intro',
          en: 'Elias faces the tethered probe lens, then pans past an old staff ward bed to the amber cocooned coworker and the three colour-coded pipes.',
          zh: '【画面】艾里亚斯在防爆玻璃后接住探头，先把镜头对准自己苍白的面孔点了点头；接着他举着探头游过前厅一间半开的“员工早期适应室”——镜头扫过一张旧病床，床头卡槽里插着半张被撕去姓名的住院卡，艾里亚斯戴手套的手在床栏上停顿了一秒。随后他游到紫红粘液翻涌的走廊口，探头照亮了一具被粘液厚厚包裹、如同琥珀茧般立在水里的遗体。他凑近看清遗体胸口的“泵站维修组·马丁”铭牌，手猛地一抖；最后才把镜头抬向头顶红、黄、蓝三根管道（红环供热管干干净净，黄环营养液管接缝裹满粘液）。',
          dialogue: '艾里亚斯（视频原声）：“罗温，能看到吗？探头指示灯亮着，你真的照约定绕过来找我了……前面这间空病房是几个月前给工伤员工试药住的，别多看。……等等，前面粘液里包着个人……（呼吸急促）是老马丁！三天前警报响的时候，他还把最后半罐氧气塞给我弟弟……他怎么会死在这层？！（强忍哽咽抬起镜头）走廊被这种紫红色的粘液封死了，一碰就会糊死呼吸阀。头顶有三根管子：红环供热、黄环营养液、蓝环冷却水。这东西摸着是温的……我猜是红环热水管在喂它，你在外侧找找阀门间，把供热关掉试试！”',
          storyBeat: '【剧情揭示】1. 艾里亚斯路过“员工早期适应室”时的停顿，暗藏他曾是Panacea早期受试者的伏笔；2. 认出琥珀茧中的老马丁并无意间提到“塞给我弟弟氧气”，自然带出兄弟线索；3. 他因悲痛与慌乱口头猜错“关红环热水管”，而真实镜头画面清楚拍到“黄环营养液管”才是源头。',
        },
        {
          when: [],
          key: 'standard_intro',
          en: 'The probe camera sweeps past an old staff bed through fluorescent mucus to an amber cocooned coworker and the three colour-coded pipes.',
          zh: '【画面】艾里亚斯举着探头游过前厅旧观察床，停在紫红粘液封死的走廊口。镜头先拍到被粘液裹成琥珀茧的同事老马丁遗体，艾里亚斯震惊后退了半步；随后镜头上移，拍向头顶红、黄、蓝三色管道——画面里红环供热管表面干净，黄环营养液管接缝被粘液裹得最厚。',
          dialogue: '艾里亚斯（视频原声）：“罗温，指示灯亮着，应该在录。这儿有具被粘液包住的尸体……是我们维修班的老马丁，他明明该在接驳港的，怎么会死在这儿？……粘液把路堵死了，头顶是红环供热、黄环营养液、蓝环冷却三根管子。这东西喜欢暖，我猜是热水管，你在外侧把供热阀关掉试试。”',
          storyBeat: '【剧情揭示】通过老马丁之死展现底层工人的绝境，并建立“口头猜测（红环）vs 画面铁证（黄环）”的视频推理。',
        },
      ] }],
    },
    {
      id: 'L2-SPEC-03', title: '拍摄侧线盲猎者 SPEC-02C（配额3/3）', stage: 'valve', videoType: 'player-capture',
      reads: ['creature.blindState', 'specimen.blind', 'containment.captured', 'containment.quotaMet'],
      note: '拍下无眼侧线孔结构，解锁“关阀巨响后2秒内停推静默可擦壳免伤”的关键应对机制',
      slots: [{ slot: 'blind_behavior', cases: [
        {
          when: [IS('rowan.valveStrategy', 'trust_video_feed')],
          key: 'brushing_past',
          en: 'An eyeless predator with lateral-line pores glides past the silent hull without striking.',
          zh: '【画面】无眼、体侧排布一排排感音侧线孔的盲猎者被阀轮巨响惊醒，顺着水波冲到潜艇旁；因为罗温提前拍清了它的感官结构并在2秒内彻底停推熄声，盲猎者紧贴着安静的艇壳滑了过去，没有发动撞击。',
          storyBeat: '【玩法与叙事结合】完成本关3/3收容物配额，同时用视频情报指导玩家在关阀巨响后靠“绝对静默”活下来。',
        },
        {
          when: [],
          key: 'waking_at_valve',
          en: 'Startled by the valve clank, the eyeless hunter turns its lateral-line pores toward the sound.',
          zh: '【画面】被阀轮撞击声惊醒的无眼盲猎者转动体侧侧线孔，朝声源扑来。',
        },
      ] }],
    },
    {
      id: 'L2-ALEX-02', title: '艾里亚斯探头剧情视频②：关阀后果与贵宾区的残酷真相', stage: 'valve', videoType: 'elias-story',
      reads: ['rowan.valveStrategy', 'slime.cleared', 'evidence.slimeResultTape'],
      note: '实时反映玩家关阀选择的艾里亚斯返回视频：关错阀会拍到贵宾住客游出或粘液暴涨的惊悚场面；关对黄环阀则拍到艾里亚斯安葬老马丁、痛斥公司只顾贵宾死活的剧情',
      slots: [{ slot: 'slime_outcome', cases: [
        {
          when: [IS('rowan.valveStrategy', 'trust_elias_heat')],
          key: 'heat_mistake_then_clear',
          en: 'First take shows a gown-clad VIP resident drawn out by cooling; second take shows the mucus collapsing after V-2 shuts.',
          zh: '【画面】第一段视频里，红环供热管变凉后，粘液丝毫未退，反倒是走廊深处一扇印着金字的VIP套房门开了——一名穿着昂贵丝绸睡袍、下半身已化作青色触须的老妇人为了寻找光热游了出来，脸几乎贴在艾里亚斯的探头镜头上！艾里亚斯死死捂住灯缩在墙角；第二段视频里，罗温重开供热、改关黄环营养液阀后，粘液终于成片枯萎脱落，老马丁的遗体落回地面。',
          dialogue: '艾里亚斯（视频原声）：“（第一段压低嗓子惊喘）别关供热！暖气一停，贵宾房里那些做过治疗的大人物全出来找热源了！是我猜错了，快把红环打开，换黄环营养液阀！……（第二段长舒一口气）黄环断流了，粘液全死透了。老马丁……对不住，我只能先把你放在墙边。罗温，我穿过走廊去东侧密码闸门等你。”',
          storyBeat: '【实时事实影响视频】玩家的误判真实改变了世界状态（引出一名新的贵宾趋光者进入中庭），并在艾里亚斯传回的惊险视频中直观呈现。',
        },
        {
          when: [IS('rowan.valveStrategy', 'wrong_cool')],
          key: 'cool_mistake_then_clear',
          en: 'First take shows mucus blooming in warm water; second take shows the corridor clearing after V-2 is closed.',
          zh: '【画面】第一段视频里，蓝环冷却水一断，廊道水温飙升，紫红粘液像沸腾一样疯狂膨胀，差点糊死探头镜头；第二段视频里，罗温重开冷却、改关黄环营养液阀后，粘液迅速萎缩沉底。',
          dialogue: '艾里亚斯（视频原声）：“你关的是冷却水！水一热这鬼东西长疯了，快打开！……好，换了黄环管之后它终于缩下去了。我过去密码闸门那边等你。”',
          storyBeat: '【实时事实影响视频】误关冷却水导致粘液暴涨的危机直接通过艾里亚斯的第一视角探头视频反馈给玩家。',
        },
        {
          when: [],
          key: 'clean_first_try',
          en: 'Starved of nutrients from the yellow line, the fluorescent mucus shrivels to the floor as Elias kneels by his dead coworker.',
          zh: '【画面】黄环营养管断流后，漫天飞舞的紫红粘液迅速枯萎、成片剥落沉入水底。包裹着老马丁的琥珀茧散开，艾里亚斯游过去，半跪在地上替老同事合上双眼，把老马丁胸口的铜工牌摘下来揣进怀里；随后他把探头对准墙上“VIP贵宾疗养区优先供给”的标牌，隔着面罩露出一抹悲凉的苦笑。',
          dialogue: '艾里亚斯（视频原声）：“幸好你没听我瞎猜，把黄环营养管关了。原来一直喂养这些杀人粘液的，就是公司死保不放的贵宾营养线……老马丁在这儿修了十年管道，到死连一格逃生通道的电都没分到，而那些富人却在病房里享受优先供能。……我把老马丁的工牌收好了。走廊清干净了，罗温，我们在中庭东侧的密码闸门F见。”',
          storyBeat: '【剧情揭示】通过艾里亚斯收敛老马丁遗体与摘工牌的细节，深化底层工人与公司特权阶层的尖锐矛盾，让艾里亚斯的人物形象有血有肉。',
        },
      ] }],
    },
    {
      id: 'L2-ALEX-03', title: '艾里亚斯探头剧情视频③：密码闸门内侧的抓痕与求救', stage: 'code', videoType: 'elias-story',
      reads: ['slime.cleared', 'evidence.codeAndGuide'],
      note: '艾里亚斯抵达中庭东侧密码闸门F内侧后，在等待罗温去R5管理处寻找密码期间传回的剧情视频',
      script: {
        visual: '【画面】探头灯光照亮了密码闸门F的内侧钢板。门板下半截布满了触目惊心的手指抓痕与撬棍砸印，甚至卡着半截崩断的金属工牌；内侧的手动泄压轮被一把电子机械锁死死卡住。艾里亚斯伸出戴手套的手，轻轻抚过门板上那些绝望的抓痕，随后把探头贴近闸门观察窗往外拍向黑漆漆的中庭。',
        dialogue: '艾里亚斯（视频原声）：“罗温，我到中庭东边的密码闸门里面了。这扇门从里面根本打不开，门板上全是指甲抓出来的印子……事故那天，宿舍管理员从外面把密码锁死的时候，至少有十几个没做过治疗的工友被关在门里面。他们在这儿敲门、喊救命，直到氧气耗尽……去南边的R5住宿管理处找找管理员的遗体，密码和开闸步骤图一定在她那儿。找到后到观察窗外推到我探头屏幕上。”',
        reveal: '【剧情揭示】与管理处纸条“为了让里面的人安全，对不起”形成残酷对照——管理员从外侧锁门，把健康的普通工人和变异者一起活活关死在了生活区内部。',
      },
      slots: [],
    },
    {
      id: 'L2-GATE-MEET', title: 'F密码闸门开启与双人会合视频', stage: 'uplink', videoType: 'player-action',
      reads: ['gate.open', 'evidence.reunionGate', 'containment.quotaMet'],
      note: '推送0917与步骤图后，拍下闸门升起、艾里亚斯站在内侧门槛并接回水声通信线缆',
      slots: [{ slot: 'reunion_beat', cases: [
        {
          when: [IS('said.rowan.explainedPipe')],
          key: 'grateful_nod',
          en: 'As the heavy gate rises, Elias stands at the threshold holding the probe cable and raises his lamp in thanks.',
          zh: '【画面】艾里亚斯对照探头屏幕上的步骤图拉下泄压杆、输入0917、拧动锁轮，沉重的密码闸门缓缓升起。他握着探头线缆站在门槛内侧，将有线水声插头重新接回潜艇外接口，朝舷窗里的罗温高高举起头灯致谢。',
          dialogue: '艾里亚斯（通话恢复原声）：“听得见吗，罗温？线接上了……终于又听见活人的声音了。刚才要不是你仔细看我拍过去的视频，我差点害我们俩困死在走廊里。”',
          storyBeat: '【剧情推进】两人首次隔门相见并恢复实时语音，信任进一步加深。',
        },
        {
          when: [],
          key: 'shivering_meet',
          en: 'Behind the rising gate Elias braces against the frame, shivering in the cold water.',
          zh: '【画面】闸门升起，艾里亚斯扶着门框站在内侧，在冷水中微微发抖，将探头通信线接回潜艇。',
        },
      ] }],
    },
  ],

  optional: [
    { id: 'photo-delroy-form', label: '在R5管理处拍摄德尔罗伊治疗资格申请单', stage: 'code', requires: [], sets: [T('evidence.delroyForm')] },
  ],

  echoes: [
    { id: 'l2-quota-gate', title: '-1层总部收容物配额门禁', level: 2, kind: 'objective', perspective: 'world', reads: ['containment.captured', 'containment.required', 'containment.quotaMet', 'evidence.reunionGate'], cases: [
      { when: [IS('containment.quotaMet', true), IS('evidence.reunionGate', true)], text: '总部收容物配额已达标（3/3：趋光者+避光鳗+盲猎者）且双人会合已确认：下行井D配平锁解开，可下潜至-2层。' },
      { when: [IS('containment.quotaMet', false), IS('evidence.reunionGate', true)], text: '【通关阻断】虽然已在密码闸门与艾里亚斯会合，但-1层收容物未拍够3种！黑匣子锁死下行井D，必须返回补拍缺失的收容物样本。' },
      { when: [], text: '进行中：须拍齐3种互斥习性收容物并与艾里亚斯完成探头协作会合。' },
    ] },
    { id: 'l2-valve-consequence', title: '阀门选择对中庭威胁的实时影响', level: 2, kind: 'log', perspective: 'world', reads: ['rowan.valveStrategy'], cases: [
      { when: [IS('rowan.valveStrategy', 'trust_elias_heat')], text: '实时世界后果：因曾误关V-1供热阀，中庭上层多出一名被灯光吸引的趋光住客（extraLumens=1），潜行难度上升。' },
      { when: [IS('rowan.valveStrategy', 'wrong_cool')], text: '实时世界后果：因曾误关V-3冷却阀，污染走廊粘液一度暴涨，耗费额外氧气与等待时间。' },
      { when: [], text: '实时世界后果：依靠视频证据一次关对V-2营养液阀，中庭保持标准威胁配置。' },
    ] },
    { id: 'l3-carryover', title: '向第三关传递的合作与伏笔状态', level: 3, kind: 'report', perspective: 'world', reads: ['evidence.delroyForm', 'commitment.elias.stairs', 'containment.quotaMet'], cases: [
      { when: [IS('evidence.delroyForm'), IS('containment.quotaMet')], text: '携带-1层完整3种收容物档案与德尔罗伊孙子排队申请单进入-2层，可在第三关直接向维拉质证。' },
      { when: [], text: '携带-1层3种收容物档案进入-2层；未拍德尔罗伊申请单，第三关只能口头询问。' },
    ] },
  ],

  presets: [
    { id: 'video-detective', title: '视频取证破局（配额3/3 + 一次关对黄环阀）', toggles: ['photo-delroy-form'], picks: {
      'l2-shaft-call': ['ack'], 'l2-valve-judgment': ['verify-yellow'], 'l2-reunion-talk': ['explain-pipe', 'ask-keeper'],
    } },
    { id: 'blind-trust', title: '轻信口头猜测（误关供热引出新怪 + 补救通关）', toggles: [], picks: {
      'l2-shaft-call': ['warn-door'], 'l2-valve-judgment': ['follow-heat'], 'l2-reunion-talk': ['plan-descent'],
    } },
    { id: 'quota-blocked', title: '剧情走完但漏拍收容物（触发配额硬门禁阻断）', toggles: ['skip-quota'], picks: {
      'l2-shaft-call': ['ack'], 'l2-valve-judgment': ['verify-yellow'], 'l2-reunion-talk': ['plan-descent'],
    } },
  ],
};
