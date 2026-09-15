/**
 * 肉体系 —— 被"外面的东西"改写过的生物。
 *
 * 这一系共同的设计约束是：**它们都不靠声音找人**。
 * 于是玩家手上最顺手的那一招（扔石子制造假声源）在这里集体失效，
 * 必须换成压低体温、封住振动、或者干脆用火。
 *
 * 共生体宿主额外承担一条"处理顺序"教学：不先烧掉子体囊就捅要害，
 * 它会在死的瞬间把舱底群放出来 —— 玩家会在这里学到"杀死不等于解决"。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const SYMBIOTE_HOST: EnemyDef = {
  id: 'ent.symbiote-host',
  trueName: '共生体宿主（原：轮机兵 K·奥尔森）',
  hpMax: 128,
  deathCause: 'infection',
  senses: ['heat', 'vibration'],
  acuity: { heat: 2.0, vibration: 1.3 },
  awarenessDecay: 0.055,
  contactThreshold: 0.58,
  approach: 0.44,
  evasion: 0.18,
  power: 15,
  decoyCredulity: { heat: 0.75, vibration: 0.5, sound: 0.08, light: 0, faith: 0 },
  lure: ['heat'],
  tags: ['humanoid', 'symbiote', 'heat-hunter', 'brood-carrier'],
  onSpawnLog: '舱温在往一个方向偏。偏高的那一侧有呼吸声，两组，不同频。',

  parts: [
    part(
      'pt.pit-array',
      '热窝阵',
      '第二颚',
      'thermal',
      { hp: 18, evasion: 0.32, armor: 2, revealAt: 2 },
      {
        blindTo: ['heat'],
        awarenessDecayAdd: 0.1,
        note: '它开始漫无目的地转。热窝没了，它剩下的只有地板上的震动。',
      },
      '原本是脸的位置现在是一片规则排列的凹坑，每个凹坑底部有一层薄膜。它用整张脸读温度。',
      knowledgeOf('ent.symbiote-host'),
    ),
    part(
      'pt.symbiote-ring',
      '共生环',
      '背棘',
      'armor',
      { hp: 34, evasion: 0.06, armor: 8, revealAt: 1 },
      { evasionAdd: -0.1, powerMul: 0.85, note: '环裂了一段。它每次发力都要先绕过那个缺口。' },
      '一圈套在胸腹之间的软骨质结构，接缝处能看到人类的肋骨从内侧顶出来。它把宿主箍在里面。',
    ),
    part(
      'pt.fused-thorax',
      '融合胸腔',
      '悬垂囊',
      'core',
      { hp: 30, evasion: 0.14, armor: 4, vital: true, revealAt: 3 },
      { lethal: true, note: '两组呼吸声在同一秒停下。这一点它们始终是一致的。' },
      '人的胸骨与另一套软骨长在一起，中间那条缝里有液体在流动。两套循环系统，一个腔。',
      knowledgeOf('ent.symbiote-host'),
    ),
    part(
      'pt.forked-tendon',
      '分叉腱',
      '颈部关节',
      'locomotion',
      { hp: 20, evasion: 0.26, armor: 1, revealAt: 1 },
      { approachMul: 0.48, evasionAdd: -0.08, note: '它的下半身不再同步。它走一步要停半步。' },
      '一条腱在膝上方分成两股，分别接到两套不同的肌群。它有两种走法，会在中途切换。',
    ),
    part(
      'pt.grasp-crown',
      '抓握冠',
      '外鳃',
      'grasp',
      { hp: 22, evasion: 0.24, armor: 2, revealAt: 1 },
      { forbidIntents: ['grab'], powerMul: 0.8, note: '它抓不住了。它开始用整个身体撞。' },
      '肩部以上环生一圈向内弯的硬棘，共十一根，长度从外向内递增。抓住东西以后它会收拢。',
    ),
    part(
      'pt.brood-sac',
      '子体囊',
      '腹面气孔',
      'brood',
      { hp: 16, evasion: 0.2, armor: 1, revealAt: 2 },
      {
        // 这是"处理顺序"的机械体现：先烧掉它，后面才敢捅要害
        note: '囊被烧透了，里面的东西没有出来。空气里有蛋白质焦掉的味道。',
      },
      '左侧腹壁外挂的半透明囊，里面有规律的蠕动，数目在十到十四之间。它在等一个信号。',
      knowledgeOf('ent.symbiote-host'),
    ),
    part(
      'pt.lateral-bulla',
      '侧突鼓室',
      '水的流向',
      'ampullae',
      { hp: 14, evasion: 0.3, armor: 0, revealAt: 2 },
      { blindTo: ['vibration'], awarenessDecayAdd: 0.05, note: '它对脚步没有反应了。你可以走了 —— 只要你还是凉的。' },
      '两侧腰际各有一个鼓起的骨室，贴地时会与地板共振。它靠这个知道你踩在哪块甲板上。',
    ),
  ],

  intents: [
    { kind: 'stalk', weight: 28, power: 0, minAwareness: 0.18, bands: ['far', 'near'], pull: 'near' },
    { kind: 'grab', weight: 30, power: 7, minAwareness: 0.5, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'strike', weight: 30, power: 9, minAwareness: 0.45, bands: ['adjacent', 'contact'] },
    { kind: 'listen', weight: 12, power: 0, bands: ['unknown', 'far'] },
    { kind: 'ritual', weight: 8, power: 4, minAwareness: 0.55 },
  ],

  telegraphs: {
    stalk: ['温度朝你偏了半度。', '两组呼吸声里有一组加快了。'],
    grab: ['肩上那圈棘向内收了一次，空收。', '它侧过身，把带棘的那一面朝向你。'],
    strike: ['共生环挤出一声，像皮革被折。', '它把重量全压到前脚，膝盖向内扣。'],
    listen: ['它把腰贴到舱壁上，一动不动。', '它蹲下，两侧的骨室紧贴甲板。'],
    ritual: ['它把手按在子体囊上，轻轻拍了三下。', '囊里的蠕动同时停了，然后一起开始。'],
  },

  tiers: [
    tier(
      0,
      '受伤的轮机兵',
      '一个船员，伤得很重，胸口有东西压着，也许是塌下来的管道。他还在呼吸 —— 呼吸声很重。去把他弄出来。',
      0.15,
      ['act.observe', 'act.plead', 'act.creep'],
      '他被压住了。找根撬棍。',
    ),
    tier(
      0.26,
      '两组呼吸',
      '呼吸是两组，频率不一样。压在他胸口的东西不是管道 —— 管道不会跟着他一起吸气。他没有被压住，他是那个东西的一部分。',
      0.42,
      ['act.chill-soak', 'act.back-away', 'act.wrench-swing', 'act.acid-pour'],
      '它靠热。声音诱饵在它身上完全没用，你得先让自己变凉。',
    ),
    tier(
      0.5,
      '共生体宿主',
      '整张脸被替换成一片热窝阵，规则排列。胸腹之间箍着一圈软骨环，人的肋骨从内侧顶出来 —— 宿主还在里面，而且还活着。',
      0.7,
      ['act.gouge-thermal', 'act.sever-tendon', 'act.crack-armor', 'act.asbestos-shroud'],
      '掏掉热窝阵它就基本瞎了。腱在膝上方分叉，切断那里它走不成路。别急着捅胸口。',
    ),
    tier(
      0.78,
      '共生体宿主（原：轮机兵 K·奥尔森）',
      '船员名单第七行。左侧腹壁外挂着一个半透明的囊，里面有十到十四个在动 —— 那是它的下一代，它们在等宿主死的那一刻。',
      1,
      ['act.cauterize-brood', 'act.pith-core', 'act.live-autopsy'],
      '先烧掉子体囊，再捅融合胸腔。顺序倒过来的话，你会在它尸体上得到十四个新问题。',
    ),
  ],
};

export const BILGE_BROOD: EnemyDef = {
  id: 'ent.bilge-brood',
  trueName: '舱底群',
  hpMax: 60,
  deathCause: 'trauma',
  senses: ['heat', 'vibration'],
  acuity: { heat: 1.4, vibration: 1.6 },
  awarenessDecay: 0.04,
  contactThreshold: 0.35,
  approach: 0.72,
  evasion: 0.46,
  power: 7,
  decoyCredulity: { heat: 0.85, vibration: 0.8, sound: 0.05, light: 0, faith: 0 },
  lure: ['heat', 'vibration'],
  tags: ['swarm', 'fast', 'fire-vulnerable'],
  onSpawnLog: '舱底的水在沸 —— 不是热，是密度。一层薄薄的东西铺满了水面，正在往你这边推。',

  parts: [
    part(
      'pt.van-swarm',
      '前锋群',
      '水的流向',
      'locomotion',
      { hp: 12, evasion: 0.5, armor: 0, revealAt: 0 },
      { approachMul: 0.6, note: '前面那一片散开了。整个群的推进慢了下来。' },
      '最前排的一层始终比后面快半步，被后面推着走。它们是探路的，也是被牺牲的。',
    ),
    part(
      'pt.flank-swarm',
      '侧翼群',
      '外鳃',
      'grasp',
      { hp: 14, evasion: 0.48, armor: 0, revealAt: 1 },
      { forbidIntents: ['grab'], evasionAdd: -0.1, note: '它们不再往你两侧绕了。现在只会正面来。' },
      '两侧各分出一股，速度比中路快，总是试图绕到你脚后。它们不咬，它们只负责把你围住。',
    ),
    part(
      'pt.huddle-core',
      '抱团核',
      '悬垂囊',
      'core',
      { hp: 20, evasion: 0.3, armor: 2, vital: true, revealAt: 2 },
      { lethal: true, note: '中间那一团散了。剩下的失去方向，往舱底的缝里钻，几秒钟就没了。' },
      '群的正中央有一团始终不动的，体积约拳头大，其余个体围着它排列。它是唯一在做决定的那个。',
      knowledgeOf('ent.bilge-brood'),
    ),
    part(
      'pt.tendril-mat',
      '触须垫',
      '尾索',
      'ampullae',
      { hp: 10, evasion: 0.44, armor: 0, revealAt: 2 },
      { blindTo: ['vibration'], awarenessDecayAdd: 0.08, note: '它们对脚步失去反应了，开始在原地打转。' },
      '贴着水面铺开的一层细丝，互相搭连成网。整个群靠这张网共享"哪里在震"。',
    ),
    part(
      'pt.thermotaxis-layer',
      '热趋层',
      '背棘',
      'thermal',
      { hp: 12, evasion: 0.42, armor: 1, revealAt: 2 },
      { blindTo: ['heat'], approachMul: 0.8, note: '它们不再朝暖的地方走了。它们开始朝任何方向走。' },
      '背面那层颜色更深的个体专门负责朝向温度梯度。它们从不咬人，只负责指方向。',
      knowledgeOf('ent.bilge-brood'),
    ),
  ],

  intents: [
    { kind: 'stalk', weight: 30, power: 0, bands: ['far', 'near'], pull: 'adjacent' },
    { kind: 'strike', weight: 40, power: 5, minAwareness: 0.25, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 22, power: 3, minAwareness: 0.4, bands: ['adjacent'], pull: 'contact' },
    { kind: 'call', weight: 8, power: 0, minAwareness: 0.5 },
  ],

  telegraphs: {
    stalk: ['水面的那层东西往前推了一尺，边缘整齐。', '它们分成三股，从三个方向同时来。'],
    strike: ['前锋群立起来了，离水面两寸，全部朝着你。', '水面塌下去一块 —— 它们在借力。'],
    grab: ['你脚踝周围的水凉了。它们已经在那儿了。', '两侧的水面合上了。'],
    call: ['整个群同时静了一秒，然后从舱底又涌上来一层。', '水面的纹路变成了同心圆。'],
  },

  tiers: [
    tier(
      0,
      '浮油',
      '舱底浮着一层油膜，被水推着晃。不用管 —— 水里有油是好事，说明燃料舱还没全空。',
      0.2,
      ['act.observe', 'act.creep'],
      '踩过去就行。',
    ),
    tier(
      0.25,
      '会推进的那层东西',
      '它不是被水推着走的，它在**逆着水流**往你这边来。边缘太整齐了，油不会有那样的边缘。',
      0.45,
      ['act.flare-burn', 'act.back-away', 'act.chill-soak'],
      '它们又快又多，打不完。火是唯一划算的手段。',
    ),
    tier(
      0.5,
      '舱底群',
      '整个群靠一张贴水的细丝网共享信息，背面有专门负责朝向热源的一层。它们不是很多只，它们是一只，只是分开长的。',
      0.72,
      ['act.oil-ignite', 'act.acid-pour', 'act.cauterize-brood'],
      '正中间有一团从不移动 —— 那是唯一在做决定的。烧不到它就永远烧不完。',
    ),
    tier(
      0.75,
      '舱底群',
      '每一次它们出现，抱团核的体积都比上一次大一点。它们不是从舱底来的，舱底只是它们上一次被冲散的地方。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.gouge-thermal'],
      '一发照明弹把水面烧开，趁群散开的那一瞬间打抱团核。核死了，剩下的会自己钻回缝里。',
    ),
  ],
};

export const PIPE_DWELLER: EnemyDef = {
  id: 'ent.pipe-dweller',
  trueName: '管道里的东西',
  hpMax: 74,
  deathCause: 'trauma',
  // 只靠振动。声音诱饵在它面前是**纯粹的自杀**：石子落地不会震动管壁，
  // 但你为了扔石子而做的动作会。
  senses: ['vibration'],
  acuity: { vibration: 2.2 },
  awarenessDecay: 0.075,
  contactThreshold: 0.66,
  approach: 0.36,
  evasion: 0.52,
  power: 12,
  decoyCredulity: { vibration: 0.55, sound: 0, heat: 0, light: 0, faith: 0 },
  lure: ['vibration'],
  tags: ['pipe', 'evasive', 'mimic-voice', 'child-voice'],
  onSpawnLog: '通风格栅后面有人说话。是个小孩。船员名单上没有小孩。',

  parts: [
    part(
      'pt.duct-sucker',
      '管壁吸盘',
      '第二颚',
      'grasp',
      { hp: 16, evasion: 0.46, armor: 1, revealAt: 1 },
      { forbidIntents: ['grab'], approachMul: 0.7, note: '它在管子里滑了一下。它抓不住内壁了。' },
      '身体两侧成对排列的浅碟状结构，边缘有环肌。它靠这个悬在竖管里不掉下来。',
    ),
    part(
      'pt.annular-muscle',
      '前段环肌',
      '颈部关节',
      'locomotion',
      { hp: 18, evasion: 0.4, armor: 1, revealAt: 1 },
      { approachMul: 0.42, evasionAdd: -0.12, note: '它在管道里的移动变成了拖。你能听出它走到哪一段。' },
      '前三分之一由一连串环形肌肉组成，收缩顺序从前往后。它在管子里像肠道推送食物那样推送自己。',
    ),
    part(
      'pt.child-sac',
      '童声囊',
      '悬垂囊',
      'vocal',
      { hp: 12, evasion: 0.36, armor: 0, revealAt: 2 },
      {
        silenceCall: true,
        forbidIntents: ['call'],
        note: '小孩的声音停在一个字的中间。你会希望自己没有做这件事。',
      },
      '颈段内侧一个有两层膜的腔，构造与人类儿童的声带高度相似，但不是长出来的 —— 是**照着做**的。',
      [
        { op: 'stigma', stigma: 'silence', delta: 1 },
        { op: 'vital', stat: 'san', delta: -6 },
        { op: 'flag', key: 'did.silenced-pelle', value: true },
      ],
    ),
    part(
      'pt.vibration-plume',
      '振动羽',
      '外鳃',
      'ampullae',
      { hp: 14, evasion: 0.42, armor: 0, revealAt: 2 },
      { blindTo: ['vibration'], awarenessDecayAdd: 0.12, note: '它彻底失聪了 —— 对它而言，世界刚刚消失。' },
      '沿背线生出的一排羽状细丝，贴着管壁。管道网是它的耳朵，这排羽是接口。',
      knowledgeOf('ent.pipe-dweller'),
    ),
    part(
      'pt.reverse-neck',
      '反关节颈',
      '背棘',
      'armor',
      { hp: 22, evasion: 0.3, armor: 5, revealAt: 1 },
      { evasionAdd: -0.2, powerMul: 0.8, note: '它的头不能再反折了。它从格栅后面探出来的时候会露出更多。' },
      '颈部关节可以向后反折超过一百八十度，所以它能在直径四十公分的管子里回头。',
    ),
    part(
      'pt.pharyngeal-ring',
      '咽环',
      '腹面气孔',
      'core',
      { hp: 20, evasion: 0.34, armor: 2, vital: true, revealAt: 3 },
      { lethal: true, note: '它在管子里向后滑走，一直滑，没有停的意思。声音在三层甲板之外消失。' },
      '咽部一圈厚壁软骨，同时承担吞咽与固定。它整条身体的力都汇到这里。',
      knowledgeOf('ent.pipe-dweller'),
    ),
  ],

  intents: [
    { kind: 'listen', weight: 26, power: 0 },
    { kind: 'call', weight: 24, power: 0 },
    { kind: 'stalk', weight: 22, power: 0, minAwareness: 0.25, bands: ['far', 'near'], pull: 'near' },
    { kind: 'strike', weight: 26, power: 8, minAwareness: 0.55, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 18, power: 6, minAwareness: 0.65, bands: ['adjacent'], pull: 'contact' },
    { kind: 'flee', weight: 14, power: 0 },
  ],

  telegraphs: {
    listen: ['格栅后面安静了。安静得能听见你自己的关节。', '它问了一句，然后等。它真的在等回答。'],
    call: ['它叫了一个名字。不是你的名字，但你认得那个名字。', '它开始数数。数到七的时候停了。'],
    stalk: ['管子里有东西在往这边推，一段一段，像肠子在动。', '头顶的管道依次响过来：三段、两段、一段。'],
    strike: ['格栅的螺丝在松。四颗，从对角开始。', '有什么从格栅缝里伸出来了一寸，又收回去。'],
    grab: ['格栅整块往外顶了一下。', '通风口里的黑比刚才浅了 —— 有东西堵在那儿。'],
    flee: ['它往管子深处退，一边退一边还在说话。', '声音开始从另一个方向来。它换了管路。'],
  },

  tiers: [
    tier(
      0,
      '通风管里的孩子',
      '有个孩子被困在通风管里。他会说话，他听得懂你。快点，他撑不了多久 —— 找工具把格栅拆开。',
      0.1,
      ['act.observe', 'act.plead', 'act.listen-hull'],
      '跟他说话，让他别怕。然后想办法把他弄出来。',
    ),
    tier(
      0.28,
      '会说话的东西',
      '孩子说的话开始重复，字与字之间的间隔完全一致 —— 一模一样的一致。船员名单上没有小孩。',
      0.4,
      ['act.freeze', 'act.creep', 'act.knife-thrust'],
      '它只认振动，听不见声音。站住别动它就丢了你 —— 但你一动它立刻知道。扔石子帮不了你。',
    ),
    tier(
      0.55,
      '管道里的东西',
      '沿背线一排羽状细丝贴着管壁，整个管道网就是它的耳朵。颈关节能向后反折两百度，所以四十公分的管子里它也能回头看你。',
      0.72,
      ['act.silence-wrap', 'act.harpoon-pin', 'act.sever-tendon', 'act.crack-armor'],
      '把自己包起来、放轻脚步，它会从你头顶过去。想杀它必须先钉住 —— 不钉住它就滑走，下一层再遇见。',
    ),
    tier(
      0.8,
      '管道里的东西',
      '颈段内侧那个双膜腔的构造与人类儿童声带高度一致。它不是长出来的，是**照着做**的。所以船上曾经有过一个小孩，而且它听过。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.spike-auditory', 'act.mercy-cut'],
      '毁掉童声囊它就叫不来东西，也再也不会说话。咽环是要害。两件事你都做得到，做完之后这条走廊会非常安静。',
    ),
  ],
};
