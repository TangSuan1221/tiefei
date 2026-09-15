/**
 * 声学与拟态系 —— 拿"玩家的感知手段本身"当猎场的敌人。
 *
 *   - 声呐寄生体：**噪音是它的食物**。你越打它，它越强。它是全作唯一一种
 *     "正确解法是把武器收起来"的敌人（tag: noise-feeder，引擎每回合按噪音给它回血与增幅）。
 *   - 壳体拟态：它不会动，approach = 0。它不是追你的怪，它是一个**地形陷阱**。
 *     唯一失败方式是自己走过去。
 *   - 引光体：它反过来利用玩家对光的渴望 —— 它自己发光。玩家花了整局在找光，
 *     这里那个渴望会杀死他。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const SONAR_PARASITE: EnemyDef = {
  id: 'ent.sonar-parasite',
  trueName: '声呐寄生体',
  hpMax: 70,
  deathCause: 'trauma',
  senses: ['sound'],
  acuity: { sound: 2.6 },
  awarenessDecay: 0.14,
  contactThreshold: 0.7,
  approach: 0.46,
  evasion: 0.3,
  power: 10,
  decoyCredulity: { sound: 0.95, vibration: 0.1, heat: 0, light: 0, faith: 0 },
  lure: ['sound'],
  tags: ['parasite', 'noise-feeder', 'sound-hunter'],
  onSpawnLog: '你刚才那一下的回声没有衰减。它在回声里，一直在。',

  parts: [
    part(
      'pt.resonator',
      '共鸣膜',
      '外鳃',
      'auditory',
      { hp: 14, evasion: 0.28, armor: 1, revealAt: 1 },
      {
        blindTo: ['sound'],
        powerMul: 0.35,
        awarenessDecayAdd: 0.2,
        note: '膜破了。它同时失去了耳朵和饭碗 —— 它从此不再从噪音里长东西。',
      },
      '正面绷着一张直径约二十公分的膜，厚度不均匀，中央最薄。所有落在它身上的声音都被这张膜收进去。',
      knowledgeOf('ent.sonar-parasite'),
    ),
    part(
      'pt.attach-disc',
      '附着盘',
      '腹面气孔',
      'grasp',
      { hp: 18, evasion: 0.22, armor: 2, revealAt: 0 },
      { forbidIntents: ['grab'], approachMul: 0.75, note: '它从舱壁上掉下来了，在地上翻，翻不过来。' },
      '背面一整块吸附结构，边缘有一圈细齿。它这辈子大部分时间都贴在别的东西上。',
    ),
    part(
      'pt.gas-bladder',
      '充气囊',
      '悬垂囊',
      'armor',
      { hp: 22, evasion: 0.1, armor: 5, revealAt: 1 },
      { evasionAdd: -0.16, powerMul: 0.85, note: '囊放掉了，它瘪了一圈。声音进不去了那么多。' },
      '体侧两个可充放的气囊。充满时整只体积翻倍，也是它把声音放大的方式。',
    ),
    part(
      'pt.cinch-beak',
      '收束喙',
      '第二颚',
      'jaw',
      { hp: 12, evasion: 0.3, armor: 1, revealAt: 2 },
      { powerMul: 0.5, forbidIntents: ['strike'], note: '喙断了半边。它咬不住东西，只能顶。' },
      '两片可以合到完全闭死的角质喙，内缘有细密锯齿。它咬东西的方式更像剪。',
    ),
    part(
      'pt.ganglion',
      '神经结',
      '背棘',
      'core',
      { hp: 16, evasion: 0.26, armor: 2, vital: true, revealAt: 3 },
      { lethal: true, note: '它一次性放掉了所有的气，声音是一个很长的叹。然后它就是一团湿的东西了。' },
      '共鸣膜正后方的一个实心结，剖面呈放射状。它没有脑，只有这个。',
      knowledgeOf('ent.sonar-parasite'),
    ),
  ],

  intents: [
    { kind: 'listen', weight: 34, power: 0 },
    { kind: 'stalk', weight: 24, power: 0, minAwareness: 0.3, bands: ['far', 'near'], pull: 'near' },
    { kind: 'strike', weight: 30, power: 7, minAwareness: 0.55, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 18, power: 5, minAwareness: 0.6, bands: ['adjacent'], pull: 'contact' },
    { kind: 'call', weight: 10, power: 0, minAwareness: 0.45 },
  ],

  telegraphs: {
    listen: ['它把膜转向你。膜上有一圈同心的褶皱在收紧。', '你上一次的呼吸声被原样送回来了。'],
    stalk: ['吸附盘一寸一寸地挪，每挪一下都吸一次气。', '气囊在充。它的轮廓在变大。'],
    strike: ['喙张开到极限，两片之间拉出丝。', '膜紧到发亮。它在攒你刚才给它的那些声音。'],
    grab: ['吸附盘的一半离开了舱壁。', '它侧过来，把带齿的那圈边缘朝向你。'],
    call: ['它把收进去的声音一次放出来，音量是原来的三倍。', '整条走廊开始回响你十分钟前的脚步。'],
  },

  tiers: [
    tier(
      0,
      '舱壁上的鼓包',
      '舱壁上鼓起一块，像是内衬材料受潮膨胀了。船体老化的正常现象。你可以拿它当参照物记路。',
      0.18,
      ['act.observe', 'act.listen-hull'],
      '不用管，记住位置当路标。',
    ),
    tier(
      0.25,
      '会变大的鼓包',
      '它比你上次经过时大了。而且你每次用声呐之后它都会大一点。它在吃你发出的声音。',
      0.45,
      ['act.hold-breath', 'act.freeze', 'act.knife-thrust', 'act.silence-wrap'],
      '把嘴闭上，把声呐关掉。你越吵它越强 —— 这一只，打是最差的答案。',
    ),
    tier(
      0.52,
      '声呐寄生体',
      '正面一张二十公分的膜，中央最薄。体侧两个气囊，充满时体积翻倍。它把收进去的声音存起来，然后一次放出去 —— 放给别的东西听。',
      0.72,
      ['act.clicker-decoy', 'act.crush-resonator', 'act.crack-armor', 'act.pipe-bludgeon'],
      '用声饵把它引开，然后在安静里砸碎共鸣膜。用斧子劈它等于给它加餐。',
    ),
    tier(
      0.78,
      '声呐寄生体',
      '它没有脑，只有膜后面那个放射状的实心结。教团的声呐室里养了很多只 —— 记录上写着"用于校准"。校准的对象不是设备。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.spike-auditory'],
      '闷头铁管加消音包裹是最优解：伤害够、噪音低，它吃不到东西。砸膜之后神经结就在正后方两寸。',
    ),
  ],
};

export const HULL_MIMIC: EnemyDef = {
  id: 'ent.hull-mimic',
  trueName: '壳体拟态',
  hpMax: 140,
  deathCause: 'trauma',
  senses: ['light', 'vibration'],
  acuity: { light: 1.2, vibration: 1.5 },
  awarenessDecay: 0.03,
  contactThreshold: 0.8,
  // 它从不移动。它不是追猎者，它是地形
  approach: 0,
  evasion: 0.05,
  power: 21,
  decoyCredulity: { light: 0.2, vibration: 0.2, sound: 0.05, heat: 0, faith: 0 },
  lure: [],
  tags: ['ambush', 'stationary', 'trap', 'armored'],
  onSpawnLog: '这一段舱壁的铆钉间距是别处的两倍。你已经把手放上去了。',

  parts: [
    part(
      'pt.mimic-plate',
      '拟态层',
      '背棘',
      'armor',
      { hp: 46, evasion: 0.02, armor: 12, revealAt: 0 },
      { evasionAdd: -0.05, powerMul: 0.8, note: '外层裂开，底下是半透明的、分层的东西。它不再像舱壁了。' },
      '表面完全复制了 3 毫米钢板的颜色、锈斑、甚至铆钉。铆钉是实心的角质，间距比真舱壁宽一倍 —— 唯一的破绽。',
      knowledgeOf('ent.hull-mimic'),
    ),
    part(
      'pt.adhesive-rim',
      '吸附缘',
      '水的流向',
      'grasp',
      { hp: 26, evasion: 0.12, armor: 4, revealAt: 1 },
      { forbidIntents: ['grab'], powerMul: 0.6, note: '边缘松了。它抓不住你的手了 —— 但你的手已经在里面了。' },
      '四周一圈可以向内收拢的软边，宽约十公分。碰到它的东西会先被压住，然后被慢慢拉进去。',
    ),
    part(
      'pt.photo-row',
      '光斑列',
      '腹面气孔',
      'ocular',
      { hp: 14, evasion: 0.3, armor: 2, revealAt: 2 },
      { blindTo: ['light'], awarenessDecayAdd: 0.06, note: '它不再对手灯有反应了。它只剩脚步。' },
      '伪铆钉之间嵌着一排色素斑，只能分辨明暗与移动。你举灯照它，等于按了门铃。',
    ),
    part(
      'pt.basal-tendon',
      '基底腱',
      '尾索',
      'locomotion',
      { hp: 24, evasion: 0.14, armor: 3, revealAt: 2 },
      { approachMul: 0, evasionAdd: -0.1, note: '它彻底固定住了。它这辈子换过位置，但不会再换了。' },
      '背面与舱壁之间有十几条粗腱。它一年会挪一次位置，挪的时候整条走廊的图纸就不再准确。',
    ),
    part(
      'pt.central-stomach',
      '中央胃',
      '悬垂囊',
      'core',
      { hp: 30, evasion: 0.2, armor: 5, vital: true, revealAt: 3 },
      { lethal: true, note: '它松开了。掉出来的东西里有两件制服，一副眼镜，和一把还能用的钥匙。' },
      '拟态层正中偏下的一个腔，里面有未消化完的金属件。它消化不了钢，但它会一直留着。',
      knowledgeOf('ent.hull-mimic'),
    ),
  ],

  intents: [
    { kind: 'listen', weight: 40, power: 0 },
    { kind: 'grab', weight: 34, power: 8, minAwareness: 0.5, bands: ['adjacent', 'contact'], pull: 'contact' },
    { kind: 'strike', weight: 26, power: 11, minAwareness: 0.6, bands: ['contact'] },
  ],

  telegraphs: {
    listen: ['这一段舱壁比别处凉。凉得不均匀。', '铆钉的间距不对。你数了两遍。'],
    grab: ['你的手掌粘住了。皮肤下面有东西在收紧。', '舱壁的边缘往内卷了一寸。'],
    strike: ['整块"钢板"向内凹，然后弹回来。', '那些铆钉同时转了半圈。'],
  },

  tiers: [
    tier(
      0,
      '一段舱壁',
      '走廊左侧的一段舱壁。锈得很均匀，铆钉齐整。撑一下它可以省点力气。',
      0.1,
      ['act.observe'],
      '没什么可说的，那是墙。',
    ),
    tier(
      0.3,
      '不对的那面墙',
      '铆钉的间距是别处的两倍，而且它比周围凉。你上一次经过时，它在走廊另一侧。',
      0.4,
      ['act.back-away', 'act.break-grapple', 'act.pry-strike'],
      '别碰。它不会追你 —— 除了你自己送过去，它伤不到你。',
    ),
    tier(
      0.58,
      '壳体拟态',
      '伪铆钉之间嵌着一排色素斑，分辨明暗。它固定在舱壁上，靠十几条粗腱，一年挪一次位置 —— 这就是船的图纸永远不准的一部分原因。',
      0.75,
      ['act.crack-armor', 'act.acid-pour', 'act.harpoon-pin', 'act.sever-tendon'],
      '它是陷阱，不是猎手。要么绕开，要么用酸把拟态层化开 —— 十二点装甲值不适合用刀。',
    ),
    tier(
      0.82,
      '壳体拟态',
      '中央胃里有它消化不了的东西：两件制服、一副眼镜、一把钥匙。它不吃金属，但它会一直留着。船上有些门就是因为这个永远打不开。',
      1,
      ['act.pith-core', 'act.oil-ignite', 'act.live-autopsy'],
      '如果你缺一把钥匙，这可能是全船唯一还留着它的地方。剖开它要花很长时间，而这段时间里整条走廊都会知道你在。',
    ),
  ],
};

export const ANGLERLIGHT: EnemyDef = {
  id: 'ent.anglerlight',
  trueName: '引光体',
  hpMax: 88,
  deathCause: 'drowning',
  senses: ['light', 'vibration'],
  acuity: { light: 0.8, vibration: 1.7 },
  awarenessDecay: 0.05,
  contactThreshold: 0.62,
  approach: 0.22,
  evasion: 0.34,
  power: 19,
  decoyCredulity: { vibration: 0.6, light: 0.5, sound: 0.15, heat: 0.1, faith: 0 },
  lure: ['light'],
  tags: ['aquatic', 'lure', 'flooded', 'ambush'],
  onSpawnLog: '前面有灯。暖色的，稳定的，不闪。船上所有的灯都在闪。',

  parts: [
    part(
      'pt.lure-organ',
      '诱光器',
      '悬垂囊',
      'vocal',
      { hp: 14, evasion: 0.44, armor: 0, revealAt: 0 },
      {
        silenceCall: true,
        forbidIntents: ['call'],
        note: '灯灭了。整个舱室黑到你开始怀疑自己的眼睛还在不在。',
      },
      '一条从额部前伸的丝，末端有一枚发光体，色温接近白炽灯。它不闪 —— 这是它唯一不像灯的地方。',
      knowledgeOf('ent.anglerlight'),
    ),
    part(
      'pt.unfolding-jaw',
      '展开颌',
      '第二颚',
      'jaw',
      { hp: 20, evasion: 0.3, armor: 2, revealAt: 1 },
      { powerMul: 0.4, forbidIntents: ['strike'], note: '颌的一侧脱位了，垂在下面。它咬的时候只有一半的力。' },
      '闭合时宽约三十公分，张开时超过一米 —— 上下颌都能向外翻。它张嘴的动作比它咬合的动作慢得多。',
    ),
    part(
      'pt.pendant-hook',
      '悬垂钩',
      '尾索',
      'grasp',
      { hp: 16, evasion: 0.4, armor: 1, revealAt: 1 },
      { forbidIntents: ['grab'], note: '钩折了。它不能再把你从水面上拽下去。' },
      '腹面垂下的两条带钩的附肢，钩尖向后。被钩住以后越挣扎越深，这是构造决定的。',
    ),
    part(
      'pt.water-sac',
      '水囊',
      '外鳃',
      'armor',
      { hp: 28, evasion: 0.1, armor: 6, revealAt: 1 },
      { evasionAdd: -0.18, approachMul: 0.7, note: '囊破了，水喷出来，它整个塌了一半。' },
      '体侧充满水的囊，既是配重也是缓冲。刀扎进去只会扎进水里。',
    ),
    part(
      'pt.tail-whip',
      '尾鞭',
      '颈部关节',
      'locomotion',
      { hp: 18, evasion: 0.38, armor: 1, revealAt: 2 },
      { approachMul: 0.35, evasionAdd: -0.14, note: '它不能突进了。它只能靠鳍慢慢划。' },
      '后段一条侧扁的鞭状结构，末端有硬化的棘。它靠这个在两米内完成一次突进。',
    ),
    part(
      'pt.nerve-cluster',
      '神经团',
      '背棘',
      'core',
      { hp: 22, evasion: 0.28, armor: 3, vital: true, revealAt: 3 },
      { lethal: true, note: '灯先灭，然后它才沉下去。顺序总是这样。' },
      '诱光器的根部，两团对称的神经组织。它一生的全部计算都用在"什么时候亮"这一件事上。',
      knowledgeOf('ent.anglerlight'),
    ),
  ],

  intents: [
    { kind: 'call', weight: 32, power: 0 },
    { kind: 'listen', weight: 20, power: 0 },
    { kind: 'grab', weight: 28, power: 9, minAwareness: 0.5, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'strike', weight: 26, power: 10, minAwareness: 0.55, bands: ['adjacent', 'contact'] },
    { kind: 'flee', weight: 8, power: 0 },
  ],

  telegraphs: {
    call: ['灯亮了一点。像是有人在那边调高了旋钮。', '灯往旁边挪了半米，然后回到原位 —— 像在招手。'],
    listen: ['灯的亮度稳住了，一动不动。', '水面完全平了。连你的呼吸都没有让它起波。'],
    grab: ['灯下面的水里有两条东西垂着，末端弯向后。', '水面下有什么擦过你的小腿，然后停住。'],
    strike: ['灯突然退后了一米 —— 不是灯在退，是它在把嘴让开。', '水从两侧被推开。它在攒那一下。'],
    flee: ['灯灭了。整整三秒。然后在更远的地方亮起来。', '水面一阵乱流，之后什么都没有了。'],
  },

  tiers: [
    tier(
      0,
      '还亮着的灯',
      '前面有一盏应急灯还亮着！暖色的，稳定 —— 说明那一段电路还完好。往那边走，那里大概有出路。',
      0.12,
      ['act.observe', 'act.raise-lamp'],
      '朝亮的地方走。有光的地方就有电，有电的地方就有门。',
    ),
    tier(
      0.28,
      '不闪的灯',
      '船上所有的灯都在闪，因为发电机在喘。这一盏不闪。而且它刚才往旁边挪了半米，又回来了。',
      0.42,
      ['act.back-away', 'act.douse-lamp', 'act.speargun-shot'],
      '不要走向唯一稳定的那个光源。这是这条船教给你的最贵的一课。',
    ),
    tier(
      0.55,
      '引光体',
      '一条从额部前伸的丝，末端发光，色温接近白炽灯。腹面垂着两条带后向钩的附肢。它不追人 —— 它等人自己过去。',
      0.74,
      ['act.harpoon-pin', 'act.flare-burn', 'act.crack-armor', 'act.break-grapple'],
      '在远距离射掉诱光器，它就失去了全部手段。靠近以后先处理悬垂钩，被钩住之后越挣越深。',
    ),
    tier(
      0.8,
      '引光体',
      '它一生的全部计算都用在一件事上：什么时候亮。神经团就长在诱光器的根部 —— 它的诱饵和它的脑是同一套器官。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.oil-ignite'],
      '一发鱼枪打掉诱光器，顺着那条丝往根部走两寸就是神经团。射得准的话，它连一次机会都没有。',
    ),
  ],
};
