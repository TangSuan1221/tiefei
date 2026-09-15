/**
 * 溺者系 —— 船员的遗留物。
 *
 * 这一系的设计角色是**教学**：它们是玩家最早遇到的敌人，必须用最少的词把
 * "感知通道决定套路"这条规则讲清楚。
 *   - 淹溺船员：眼睛没了，只剩振动与声音。它是"扔石子"这一招的正面教材，
 *     也是"站着别动比跑更安全"的第一堂课。
 *   - 唱诗班的喉：它本身几乎不伤人，它的威胁是**把别的东西叫来**。
 *     打它是错的（噪音更大），正确解法是让它闭嘴或者跟着它一起唱。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const DROWNED_CREW: EnemyDef = {
  id: 'ent.drowned-crew',
  trueName: '淹溺船员（第三班轮值）',
  hpMax: 84,
  deathCause: 'trauma',
  senses: ['vibration', 'sound'],
  acuity: { vibration: 1.5, sound: 1.0 },
  awarenessDecay: 0.085,
  contactThreshold: 0.6,
  approach: 0.4,
  evasion: 0.14,
  power: 11,
  decoyCredulity: { vibration: 0.9, sound: 0.75, heat: 0, light: 0, faith: 0.1 },
  lure: ['vibration'],
  tags: ['humanoid', 'blind', 'slow', 'grappler'],
  onSpawnLog: '有东西站在水里。水面到它的膝盖，它没有在动。',

  parts: [
    part(
      'pt.lateral-groove',
      '侧线沟',
      '颈部关节',
      'ampullae',
      { hp: 16, evasion: 0.26, armor: 1, revealAt: 1 },
      {
        blindTo: ['vibration'],
        awarenessDecayAdd: 0.07,
        note: '它对水的晃动没反应了。你可以在它面前走动，只要不出声。',
      },
      '从耳后到肋下的一道浅沟，泡开了，边缘外翻。水里的每一次晃动都从这里进去。',
      knowledgeOf('ent.drowned-crew'),
    ),
    part(
      'pt.swollen-tympanum',
      '胀开的鼓膜',
      '腹面气孔',
      'auditory',
      { hp: 12, evasion: 0.32, armor: 0, revealAt: 2 },
      { blindTo: ['sound'], awarenessDecayAdd: 0.05, note: '它聋了。现在它只知道水在动，不知道你在喘。' },
      '鼓膜没有破，是被水压从里面顶出来了，鼓成一个半球。它比活着的时候听得更清。',
    ),
    part(
      'pt.grip-phalanx',
      '抓握指骨',
      '第二颚',
      'grasp',
      { hp: 18, evasion: 0.2, armor: 1, revealAt: 0 },
      { forbidIntents: ['grab'], powerMul: 0.78, note: '它的手合不上了。它抓不住你。' },
      '十指全部向内弯到极限并且固定在那里。这不是抽搐留下的，这是它抓着什么东西死的。',
    ),
    part(
      'pt.achilles',
      '跟腱',
      '尾索',
      'locomotion',
      { hp: 14, evasion: 0.3, armor: 0, revealAt: 1 },
      { approachMul: 0.45, evasionAdd: -0.06, note: '它拖着一条腿。你有时间了 —— 不多，但有。' },
      '踝后那条绷紧的白线，隔着裤子都能看见轮廓。它靠这个把自己从水里提起来。',
    ),
    part(
      'pt.water-lung',
      '灌满的肺囊',
      '外鳃',
      'core',
      { hp: 30, evasion: 0.08, armor: 2, vital: true, revealAt: 2 },
      { lethal: true, note: '它松了下去，像一件湿衣服。水从口鼻出来，很久。' },
      '胸腔被水撑满，锁骨被顶得外翻。刺穿它的时候会喷出来 —— 那是它全部的重量。',
      knowledgeOf('ent.drowned-crew'),
    ),
    part(
      'pt.uniform-ribs',
      '制服下的肋',
      '背棘',
      'armor',
      { hp: 24, evasion: 0.06, armor: 4, revealAt: 0 },
      { evasionAdd: -0.1, note: '肋骨塌了一侧。它转身要多花一拍。' },
      '深蓝色的三班值勤服，肩章还在。布料吸饱了水，硬得像一层壳。',
    ),
  ],

  intents: [
    { kind: 'listen', weight: 22, power: 0, bands: ['unknown', 'far'] },
    { kind: 'stalk', weight: 30, power: 0, minAwareness: 0.2, bands: ['far', 'near'], pull: 'near' },
    { kind: 'grab', weight: 32, power: 6, minAwareness: 0.55, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'strike', weight: 28, power: 8, minAwareness: 0.5, bands: ['adjacent', 'contact'] },
    { kind: 'call', weight: 8, power: 0, minAwareness: 0.7 },
  ],

  telegraphs: {
    listen: ['它把头侧到一边，耳朵几乎贴到水面。', '它停了。水面平了下来。'],
    stalk: ['水被推开一道，朝你来。', '它趟着水走，每一步都等水静了再走下一步。'],
    grab: ['它的两只手同时向前伸出，合到一半就停住了。', '它的手指在水面上张开，等你经过。'],
    strike: ['它把整个上身向后压。那是要挥过来的姿势。', '它的肩膀转过来了，肋骨在制服底下响了一下。'],
    call: ['它张开嘴，没有声音。但水面起了一圈涟漪。', '它对着通风口低吼。那不是给你听的。'],
  },

  tiers: [
    tier(
      0,
      '溺死的人',
      '一个溺死的船员。他还站着，可能是被卡住了。绕过他就行 —— 死人不会追人。',
      0.15,
      ['act.observe', 'act.listen-hull', 'act.creep'],
      '别去碰它。绕过去。',
    ),
    tier(
      0.26,
      '还在值班的东西',
      '他不是被卡住的，他在等。眼球已经不在眼窝里了 —— 他不用眼睛。他等的是水面上的动静。',
      0.42,
      ['act.throw-pebble', 'act.freeze', 'act.shove', 'act.pipe-bludgeon'],
      '它靠水的晃动找你。站着不动比跑安全。扔个东西到别处去，它会过去。',
    ),
    tier(
      0.52,
      '淹溺船员',
      '侧线沟从耳后一直开到肋下，那是它的主感官；胀开的鼓膜是第二个。它慢，但它的手一旦合上就不会再松。',
      0.7,
      ['act.sever-tendon', 'act.break-grapple', 'act.crack-armor'],
      '先切跟腱让它跟不上，再处理手。不要让它抓到 —— 被抓住之后你的大部分动作都用不了。',
      ),
    tier(
      0.78,
      '淹溺船员（第三班轮值）',
      '肩章上是三班值勤。名单上这一班有十一个人。它胸腔里全是水，被撑到锁骨外翻 —— 那既是它的重量，也是它唯一的要害。',
      1,
      ['act.spike-auditory', 'act.pith-core', 'act.live-autopsy'],
      '刺穿灌满的肺囊是一击致命。但那一下很响 —— 先确认这一层没有别的东西在听。',
    ),
  ],
};

export const CHOIR_THROAT: EnemyDef = {
  id: 'ent.choir-throat',
  trueName: '唱诗班的喉（六具中的一具）',
  hpMax: 52,
  deathCause: 'ritual',
  senses: ['faith', 'sound'],
  acuity: { faith: 1.8, sound: 1.1 },
  awarenessDecay: 0.05,
  contactThreshold: 0.72,
  approach: 0.12,
  evasion: 0.1,
  power: 5,
  decoyCredulity: { sound: 0.45, faith: 0.02, vibration: 0.05, heat: 0, light: 0 },
  lure: ['faith'],
  tags: ['humanoid', 'stationary', 'summoner', 'ritual'],
  onSpawnLog: '有人在唱。音准是对的，气不够长，所以每一句都断在同一个地方。',

  parts: [
    part(
      'pt.vocal-bundle',
      '声带束',
      '外鳃',
      'vocal',
      { hp: 10, evasion: 0.18, armor: 0, revealAt: 0 },
      {
        silenceCall: true,
        forbidIntents: ['call', 'ritual'],
        note: '歌停了。你这一层的噪音从此只由你自己负责。',
      },
      '颈前皮肤薄到透光，底下那两条还在振。它没有肺了，气是从别处来的。',
      knowledgeOf('ent.choir-throat'),
    ),
    part(
      'pt.jaw-hinge',
      '下颌铰',
      '第二颚',
      'jaw',
      { hp: 14, evasion: 0.22, armor: 1, revealAt: 1 },
      { powerMul: 0.5, note: '它的嘴合不上了。唱出来的调子散了，招不动东西。' },
      '下颌被向下拉到超过生理极限并固定住，两侧的关节囊已经磨穿。它是为了长音这么做的。',
    ),
    part(
      'pt.orant-patch',
      '祷响斑',
      '悬垂囊',
      'faith-organ',
      { hp: 16, evasion: 0.14, armor: 2, revealAt: 2 },
      { blindTo: ['faith'], awarenessDecayAdd: 0.06, note: '它不再知道你身上带着什么。它开始唱给空气听。' },
      '前额正中一块颜色更深的皮，按下去是软的。教团的入会仪式在这里留下印记。',
      knowledgeOf('ent.choir-throat'),
    ),
    part(
      'pt.ear-bone',
      '耳骨',
      '颈部关节',
      'auditory',
      { hp: 8, evasion: 0.3, armor: 0, revealAt: 2 },
      { blindTo: ['sound'], awarenessDecayAdd: 0.04, note: '它听不见自己了。音准立刻开始漂。' },
      '耳廓被整齐地切掉了，切口愈合得很好。教团认为耳廓会干扰"正确的听"。',
    ),
    part(
      'pt.cervical-column',
      '颈柱',
      '背棘',
      'core',
      { hp: 20, evasion: 0.1, armor: 1, vital: true, revealAt: 3 },
      { lethal: true, note: '歌在半个音上断掉。另外五个也停了 —— 它们在等这一句。' },
      '它的头靠一根被削细的颈柱支着，其余的肌肉都已经不承重了。这是整具躯体唯一还在承力的地方。',
      knowledgeOf('ent.choir-throat'),
    ),
  ],

  intents: [
    { kind: 'ritual', weight: 34, power: 2 },
    { kind: 'call', weight: 30, power: 0, minAwareness: 0.3 },
    { kind: 'listen', weight: 20, power: 0 },
    { kind: 'strike', weight: 10, power: 4, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 8, power: 3, minAwareness: 0.8, bands: ['adjacent'], pull: 'contact' },
  ],

  telegraphs: {
    ritual: ['它把那一句又唱了一遍，这次慢了一倍。', '六个声音里有五个停下来听第六个。'],
    call: ['它换了调，往上走了一个四度。那不是给你的。', '歌里出现了一个你听得懂的音节。是你的名字。'],
    listen: ['歌停在吸气的地方。它没有吸气。', '它把脸转向你这边，慢，像在校准。'],
    strike: ['它抬起手，手背朝你。那是打人的方式。', '它的下颌向侧面滑了一寸。'],
    grab: ['它向你伸出两只手，掌心朝上。像在接什么。', '它的手指在空气里合了一次，试距离。'],
  },

  tiers: [
    tier(
      0,
      '还在唱歌的尸体',
      '几具尸体绑在一起，风从通风管过去的时候会带出声音。是气流的把戏，不是歌。别自己吓自己。',
      0.18,
      ['act.observe', 'act.listen-hull'],
      '它不会动。走过去，不用理。',
    ),
    tier(
      0.24,
      '六个声音',
      '是歌。六个声部，其中一个在领。它们不追你 —— 它们在**报告你的位置**。歌声本身就是一次呼叫。',
      0.44,
      ['act.mimic-hymn', 'act.smother-vocal', 'act.douse-lamp'],
      '打它是最坏的选择，打斗比歌声还响。让它闭嘴，或者跟着它唱。',
    ),
    tier(
      0.5,
      '唱诗班的喉',
      '发声不靠肺，气是从舱室的压差借来的。它靠额前那块祷响斑感知你带着什么圣物 —— 你身上的东西越"虔诚"，它唱得越准。',
      0.72,
      ['act.recite-creed', 'act.drop-relics', 'act.crush-resonator'],
      '卸下圣物它就唱不准。要彻底解决，切声带束；要保命，捂住它的口器一回合就够你走掉。',
    ),
    tier(
      0.76,
      '唱诗班的喉（六具中的一具）',
      '六具都还挂在原来的位置上，间距相等。它们唱的是入会礼的第四段 —— 那一段的歌词是新会员的名字。你听过自己的名字被唱出来。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.mercy-cut'],
      '颈柱是唯一承力的地方，一刀就够。但六具是一个整体：杀掉一具，剩下五具会为它空出一句，然后一起转向你。',
    ),
  ],
};
