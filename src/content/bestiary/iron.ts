/**
 * 铁与镜 —— 两种"你自己可能变成的东西"。
 *
 *   - 铁肺：被接进船体维生系统的上一个样本。它不追你，它**控制你呼吸的空气**。
 *     它的威胁写在氧气条上而不是血条上：只要它的风箱还在运转，你每回合都在失去呼吸。
 *     这是全作唯一一场"计时器在敌人身上"的遭遇。
 *   - 第 N-1 个你：`adaptive` 标签。引擎会统计玩家泄露最多的感知通道并逐回合抬高它的灵敏度，
 *     同时把玩家**刚用过的那种诱饵**的可信度清零 —— 同一个花招对它只能用一次。
 *     毁掉它的记忆册（祷响器官位）才能关掉这套学习。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const IRON_LUNG: EnemyDef = {
  id: 'ent.iron-lung',
  trueName: '铁肺（样本 N-4）',
  hpMax: 190,
  deathCause: 'ritual',
  senses: ['sound', 'faith'],
  acuity: { sound: 1.6, faith: 2.1 },
  awarenessDecay: 0.025,
  contactThreshold: 0.75,
  approach: 0.08,
  evasion: 0.08,
  power: 13,
  decoyCredulity: { sound: 0.4, faith: 0.05, vibration: 0.1, heat: 0, light: 0 },
  lure: ['faith'],
  tags: ['machine-flesh', 'stationary', 'oxygen-drain', 'ritual'],
  onSpawnLog: '风箱在响。吸的时候是金属，呼的时候是人。',

  parts: [
    part(
      'pt.main-bellows',
      '主风箱',
      '腹面气孔',
      'locomotion',
      { hp: 34, evasion: 0.1, armor: 4, revealAt: 0 },
      {
        approachMul: 0,
        powerMul: 0.5,
        note: '风箱停了。舱里的空气不再被抽走 —— 你听见自己的呼吸第一次是完整的一整口。',
      },
      '两具人高的皮革风箱，接在原本是压载泵的位置。它吸的不是水，是这一层所有舱室的空气。',
      knowledgeOf('ent.iron-lung'),
    ),
    part(
      'pt.trachea-coupling',
      '气管接头',
      '第二颚',
      'jaw',
      { hp: 22, evasion: 0.16, armor: 5, revealAt: 1 },
      { powerMul: 0.6, forbidIntents: ['strike'], note: '接头崩开，喷出温的、带味道的气。它的力气散在空气里了。' },
      '一段直径十五公分的波纹管，一头是法兰螺栓，另一头缝在软组织上。缝线是外科用的，很新。',
    ),
    part(
      'pt.mic-array',
      '麦克风阵',
      '背棘',
      'auditory',
      { hp: 18, evasion: 0.24, armor: 2, revealAt: 2 },
      { blindTo: ['sound'], awarenessDecayAdd: 0.08, note: '它听不见你了。风箱的节奏立刻失去了跟随。' },
      '八只船用拾音器围成一圈，朝外。线全部收进同一根导管。这是教团给它装的耳朵，不是它自己长的。',
    ),
    part(
      'pt.prayer-tuner',
      '祷频调谐',
      '悬垂囊',
      'faith-organ',
      { hp: 26, evasion: 0.18, armor: 4, revealAt: 2 },
      { blindTo: ['faith'], awarenessDecayAdd: 0.06, note: '调谐盘停在一个刻度上。它不再知道谁是教徒，谁只是个路过的人。' },
      '一只黄铜刻度盘，指针在两个刻度之间来回。刻度上刻的不是频率，是人名。',
      knowledgeOf('ent.iron-lung'),
    ),
    part(
      'pt.cast-carapace',
      '铸铁胸壳',
      '外鳃',
      'armor',
      { hp: 48, evasion: 0.02, armor: 11, revealAt: 0 },
      { evasionAdd: -0.04, note: '胸壳裂开一道，边缘翻出来。里面有布，还有更里面的东西。' },
      '一整片铸出来的胸甲，正面有铸造时留下的编号 N-4。边缘与皮肉长在一起，没有接缝。',
    ),
    part(
      'pt.valve-bank',
      '阀组',
      '颈部关节',
      'grasp',
      { hp: 24, evasion: 0.2, armor: 6, revealAt: 1 },
      { forbidIntents: ['grab'], note: '阀全开了。它抓不住舱室的气压，也抓不住你。' },
      '六个手轮排成两列，全部没有手柄 —— 手柄被拆走了，免得有人去关。它自己能转。',
    ),
    part(
      'pt.still-living-part',
      '还活着的那部分',
      '水的流向',
      'core',
      { hp: 30, evasion: 0.22, armor: 3, vital: true, revealAt: 3 },
      { lethal: true, note: '风箱走完了最后一次完整的循环，然后停在吸气的位置。它一直在等那一口。' },
      '胸壳内侧，两具风箱之间，有一小块还在做自主呼吸动作的组织。它有指纹。指纹和你的一样。',
      [
        { op: 'stigma', stigma: 'iron', delta: 2 },
        { op: 'vital', stat: 'san', delta: -10 },
        { op: 'knowledge', node: 'know.bestiary.ent.iron-lung' },
        { op: 'flag', key: 'did.unplugged-iron-lung', value: true },
      ],
    ),
  ],

  intents: [
    { kind: 'ritual', weight: 38, power: 6 },
    { kind: 'listen', weight: 26, power: 0 },
    { kind: 'call', weight: 16, power: 0, minAwareness: 0.4 },
    { kind: 'strike', weight: 20, power: 8, minAwareness: 0.6, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 14, power: 5, minAwareness: 0.7, bands: ['adjacent'], pull: 'contact' },
  ],

  telegraphs: {
    ritual: [
      '风箱换了节奏，比你的呼吸快一点。它在等你跟上。',
      '舱内的气压开始规律地掉，四拍一次。你的每一口气都短了一点。',
    ],
    listen: ['八只拾音器同时转向你这边，没有一只出声。', '风箱在吸气的顶点停住了，不呼。'],
    call: ['它把你的呼吸声从拾音器里放了出来，放大，循环。', '黄铜盘上的指针走到了一个人名上，停住。'],
    strike: ['波纹管绷直了。缝线那里在渗。', '胸壳向外顶了一下，铸铁的编号在抖。'],
    grab: ['六个手轮同时转了四分之一圈。舱门那边有东西在合。', '阀组喷出一股气，正好在你手边的高度。'],
  },

  tiers: [
    tier(
      0,
      '压载泵',
      '压载泵还在工作！这说明这一层的动力没断。跟着管路走能找到配电间。风箱的声音有点像喘气，这是老泵的通病。',
      0.14,
      ['act.observe', 'act.listen-hull'],
      '这是好消息。跟着管路走。',
    ),
    tier(
      0.26,
      '会呼吸的泵',
      '它吸气是金属声，呼气不是。你的氧气在这个舱里掉得比别处快 —— 它抽的不是海水。',
      0.42,
      ['act.hold-breath', 'act.back-away', 'act.wrench-swing', 'act.pry-strike'],
      '它不会追你，但你在这个舱里每一秒都在亏。要么走，要么把风箱砸停。',
    ),
    tier(
      0.55,
      '铁肺',
      '八只拾音器是它的耳朵，一只黄铜刻度盘是它分辨教徒的方式 —— 刻度上刻的是人名。胸壳是整片铸出来的，正面有编号。',
      0.72,
      ['act.crack-armor', 'act.spike-auditory', 'act.acid-pour', 'act.sever-tendon'],
      '砸停主风箱，你就把计时器关掉了，剩下的事情可以慢慢做。十一点装甲不要用刀。',
    ),
    tier(
      0.84,
      '铁肺（样本 N-4）',
      '编号 N-4。胸壳内侧、两具风箱之间有一小块还在自主呼吸的组织，上面有指纹 —— 和你的一样。这不是比喻。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.mercy-cut', 'act.gouge-thermal'],
      '先砸风箱止血（你的血），再破胸壳，最后决定要不要碰那一小块还在呼吸的东西。碰了，你就知道自己是第几号。',
    ),
  ],
};

export const PREVIOUS_YOU: EnemyDef = {
  id: 'ent.previous-you',
  trueName: '第 N-1 个你',
  hpMax: 96,
  deathCause: 'trauma',
  negotiable: true,
  senses: ['faith', 'light', 'heat'],
  acuity: { faith: 1.5, light: 1.2, heat: 1.2 },
  awarenessDecay: 0.03,
  contactThreshold: 0.6,
  approach: 0.4,
  evasion: 0.3,
  power: 14,
  // 初始可信度不低，但引擎会在玩家用过一次之后把对应通道清零
  decoyCredulity: { sound: 0.55, vibration: 0.5, light: 0.45, heat: 0.4, faith: 0.1 },
  lure: ['light', 'faith'],
  tags: ['humanoid', 'adaptive', 'mirror', 'negotiable'],
  onSpawnLog: '对面那个人举灯的高度和你一样。换手的时机也一样。',
  killEffects: [
    { op: 'stigma', stigma: 'apostasy', delta: 1 },
    { op: 'stigma', stigma: 'silence', delta: 1 },
    { op: 'vital', stat: 'san', delta: -14 },
    { op: 'flag', key: 'did.killed-previous-self', value: true },
    { op: 'knowledge', node: 'know.truth.samples' },
  ],

  parts: [
    part(
      'pt.your-hands',
      '你的手',
      '第二颚',
      'grasp',
      { hp: 18, evasion: 0.32, armor: 1, revealAt: 0 },
      { forbidIntents: ['grab'], powerMul: 0.7, note: '它的手废了。你看着自己的手废掉，这件事你以后会想起来。' },
      '右手虎口有一道旧疤，形状是你十四岁那年留下的那一道。位置精确到毫米。',
    ),
    part(
      'pt.your-face',
      '你的脸',
      '悬垂囊',
      'ocular',
      { hp: 14, evasion: 0.38, armor: 1, revealAt: 1 },
      { blindTo: ['light'], awarenessDecayAdd: 0.05, note: '它看不见光了。它开始像你一样伸手摸墙。' },
      '面罩玻璃裂了一条，裂纹底下那张脸比你现在瘦。它的胡子长度说明它比你多待了大约九天。',
      knowledgeOf('ent.previous-you'),
    ),
    part(
      'pt.mask-rebreather',
      '面罩下的呼吸器',
      '外鳃',
      'auditory',
      { hp: 16, evasion: 0.28, armor: 2, revealAt: 2 },
      { blindTo: ['heat'], awarenessDecayAdd: 0.04, note: '呼吸器破了。它开始用嘴呼吸，很响 —— 它现在也会被听见了。' },
      '和你身上那具同型号，序列号差一位。滤罐的颜色说明它换过三次，你才换过一次。',
    ),
    part(
      'pt.the-logbook',
      '它的日志本',
      '背棘',
      'faith-organ',
      { hp: 12, evasion: 0.34, armor: 0, revealAt: 2 },
      {
        blindTo: ['faith'],
        awarenessDecayAdd: 0.1,
        note: '本子散了，纸在水上漂开。它不再知道你下一步要做什么 —— 它刚刚失去了那份记录。',
      },
      '绑在小臂上的一本湿了的本子。最后一页写着你十分钟之前做的事，字迹是你的。',
      [
        { op: 'knowledge', node: 'know.truth.cycle-count' },
        { op: 'flag-add', key: 'count.logbooks-destroyed', delta: 1 },
        { op: 'vital', stat: 'san', delta: -4 },
      ],
    ),
    part(
      'pt.your-suit',
      '你的潜水服',
      '尾索',
      'armor',
      { hp: 28, evasion: 0.08, armor: 6, revealAt: 0 },
      { evasionAdd: -0.12, note: '服装裂了，进水了。它开始发抖 —— 和你在同一个温度下发抖。' },
      '和你身上这件同一批。左肩的补片是同一块，补法也一样，因为那是你会用的补法。',
    ),
    part(
      'pt.your-heart',
      '你的心',
      '水的流向',
      'core',
      { hp: 22, evasion: 0.26, armor: 3, vital: true, revealAt: 3 },
      { lethal: true, note: '它坐下去的姿势和你累的时候一样。它最后看的方向是月池。' },
      '你不需要解剖图就知道它在哪。你一辈子都带着一张。',
      knowledgeOf('ent.previous-you'),
    ),
  ],

  intents: [
    { kind: 'stalk', weight: 26, power: 0, minAwareness: 0.2, bands: ['far', 'near'], pull: 'near' },
    { kind: 'listen', weight: 18, power: 0 },
    { kind: 'strike', weight: 28, power: 8, minAwareness: 0.5, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 20, power: 6, minAwareness: 0.55, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'ritual', weight: 12, power: 4, minAwareness: 0.45 },
    { kind: 'flee', weight: 10, power: 0 },
  ],

  telegraphs: {
    stalk: ['它走的路线是你三分钟前走过的那一条，反着走。', '它在你打算落脚的那块甲板前停了一下，避开了。'],
    listen: ['它屏住了呼吸。时机和你屏息的习惯一样。', '它把耳朵贴到舱壁上，位置和你刚才贴的是同一块。'],
    strike: ['它换手了 —— 它也是左手拿灯右手动手。', '它把重量压到后脚，那是你惯用的起手。'],
    grab: ['它张开手，五指的间距是你的间距。', '它朝你伸手，掌心朝上。你知道这个动作，你做过。'],
    ritual: ['它翻开小臂上那本子，低头看，然后合上。', '它照着本子上的一行字，重复了一遍你的名字。'],
    flee: ['它退开三步，退到你会选的那个掩体后面。', '它往你本来打算去的那个方向走了。'],
  },

  tiers: [
    tier(
      0,
      '另一个幸存者',
      '还有人活着！他穿着同款潜水服，拿着同款手灯 —— 也是这条船的船员。举灯示意，对上信号。',
      0.12,
      ['act.observe', 'act.plead', 'act.raise-lamp'],
      '打招呼。你需要一个同伴。',
    ),
    tier(
      0.28,
      '和你一样的那个',
      '他举灯的高度、换手的时机、屏息的节奏，全部和你一样。他避开了你打算避开的那块甲板 —— 他不是在模仿你，他是在**回忆**。',
      0.44,
      ['act.back-away', 'act.freeze', 'act.knife-thrust', 'act.hold-line'],
      '同一个花招在它身上只能用一次。你骗过它一次，它就再也不会上同样的钩。',
    ),
    tier(
      0.58,
      '第 N-1 个',
      '面罩玻璃裂了一条，底下那张脸比你瘦，胡子说明它比你多待了九天。滤罐换过三次，你才换过一次。它比你活得久，所以它比你懂。',
      0.75,
      ['act.sever-tendon', 'act.crack-armor', 'act.spike-auditory', 'act.silence-wrap'],
      '它小臂上绑着一本日志。那本子就是它预判你的来源 —— 毁掉它，它就只是个比你累的人。',
    ),
    tier(
      0.84,
      '第 N-1 个你',
      '本子最后一页写着你十分钟之前做的事，字迹是你的。它不是预言你，它是在核对。你们走的是同一条路，只是它先走了一遍。',
      1,
      ['act.pith-core', 'act.mercy-cut', 'act.live-autopsy', 'act.gouge-thermal'],
      '先毁本子，再谈；谈不成就走要害 —— 你不需要解剖图，你一辈子都带着一张。杀了它，你会知道自己是第几号。',
    ),
  ],
};
