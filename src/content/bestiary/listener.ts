/**
 * THE LISTENER —— 主威胁。
 *
 * 它在本作里的地位不靠数值，靠三条**机械约束**：
 *   1. `neverVisible` —— 引擎永不输出它的外观，只输出它留下的证据（水的倾斜、压力差、锚索的擦痕）。
 *   2. `unkillable` —— hp 归零不死。它的七个"部位"其实是它与舱室之间的**接口**，
 *      毁掉接口只能让它丢掉坐标、被迫重新三角测量；玩家永远拿不到"击杀"这个结算。
 *   3. `decoyCredulity.sound = 0.18` —— 它不搜索，它**三角测量**。单个假声源骗不动它，
 *      要骗就得同时有两个以上；这条让"扔石子"这个对所有其他敌人都有效的万金油在它面前失效。
 *
 * 所以对付它的唯一解法是**减法**：卸掉圣物压低信仰signature、缠上消音包裹、连续若干回合零噪音。
 * 它是全作唯一一种"你能做的最好的事就是什么都不做"的敌人。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const LISTENER: EnemyDef = {
  id: 'ent.listener',
  trueName: 'THE LISTENER',
  hpMax: 320,
  unkillable: true,
  neverVisible: true,
  deathCause: 'listener',
  senses: ['sound', 'faith'],
  acuity: { sound: 2.3, faith: 1.9 },
  awarenessDecay: 0.022,
  contactThreshold: 0.9,
  approach: 0.52,
  evasion: 0.34,
  power: 26,
  decoyCredulity: { sound: 0.18, faith: 0.05, vibration: 0, heat: 0, light: 0 },
  lure: ['sound', 'faith'],
  tags: ['boss', 'incorporeal', 'noise-summoned', 'unkillable'],
  onSpawnLog: '舱内的气压掉了一格。你的耳膜先知道，然后才是你。',

  evidence: [
    '积水在往一个方向倾斜。不是船在倾斜。',
    '你手背上的汗在冷。舱温没有变。',
    '管道接缝处的锈被擦掉了一条，宽度和一只手差不多。它不是手。',
    '你的呼吸在回来的时候慢了半拍。有东西在中间接了一下。',
    '远处有节拍。四下一停，四下一停。那不是泵，泵不会停顿。',
    '灯丝在抖。电压没变。',
    '地板上有一道拖痕，从你身后来，绕过你，到你前面去。',
    '你听见自己的名字被念了一个音节，然后收住了。',
    '天花板上的水滴停在半空，又落下去。中间空了一秒。',
    '有人在你身后屏住呼吸。你身后是舱壁。',
  ],

  parts: [
    part(
      'pt.drag-trace',
      '拖行痕',
      '水的流向',
      'locomotion',
      { hp: 34, evasion: 0.22, armor: 1, revealAt: 0 },
      { approachMul: 0.74, note: '它得从头找一遍路。接近变慢了。' },
      '它移动时不抬起任何东西，是把自己拖过去的。破坏这条痕会让它失去落脚的参照。',
    ),
    part(
      'pt.pressure-shell',
      '静压壳',
      '闷住的空气',
      'armor',
      { hp: 58, evasion: 0.08, armor: 7, revealAt: 1 },
      { evasionAdd: -0.16, awarenessDecayAdd: 0.01, note: '它周围那层"闷"破了。你第一次听清它在哪。' },
      '它身边一圈的气压比别处高。声音进得去，出不来 —— 这是它能听见一切而你听不见它的原因。',
    ),
    part(
      'pt.hanging-filament',
      '悬垂纤丝',
      '断掉的电缆',
      'grasp',
      { hp: 26, evasion: 0.34, armor: 0, revealAt: 1 },
      { forbidIntents: ['grab'], powerMul: 0.82, note: '它抓不住你了。它只能撞你。' },
      '从上方垂下来的一束，末端在离地十厘米处停住，不着地。它靠这个把东西提起来。',
    ),
    part(
      'pt.resonant-column',
      '共鸣柱',
      '背棘',
      'auditory',
      { hp: 46, evasion: 0.18, armor: 4, revealAt: 2 },
      {
        blindTo: ['sound'],
        awarenessDecayAdd: 0.05,
        note: '它听不见了。你能听到它在原地打转 —— 它在用余下的那半个感官找你。',
      },
      '一根从龙骨长出来的、有间隔的柱状物。船体的每一次应力都会让它报一次数。这是它的耳朵。',
      knowledgeOf('ent.listener'),
    ),
    part(
      'pt.orant-chamber',
      '祷响腔',
      '悬垂囊',
      'faith-organ',
      { hp: 52, evasion: 0.14, armor: 5, revealAt: 3 },
      {
        blindTo: ['faith'],
        awarenessDecayAdd: 0.04,
        note: '它不再知道你信什么了。你身上的圣物从此只是金属。',
      },
      '一个内壁被磨光的空腔，形状与礼拜堂的穹顶成比例。教团在这里对它说话，它在这里听。',
      knowledgeOf('ent.listener'),
    ),
    part(
      'pt.anchor-line',
      '锚索',
      '尾索',
      'core',
      { hp: 74, evasion: 0.1, armor: 9, revealAt: 2 },
      {
        approachMul: 0.5,
        powerMul: 0.6,
        note: '它被扯回去了一截。它还在，但它得先把自己拉回来。',
      },
      '它有一端始终连着船体外面。这不是尾巴，这是它留在海里的那部分。砍断它只是让它松手，不是让它死。',
    ),
    part(
      'pt.echo-remnant',
      '回声残影',
      '外鳃',
      'vocal',
      { hp: 22, evasion: 0.4, armor: 0, revealAt: 1 },
      { silenceCall: true, note: '它叫不来别的东西了。这一层从此只剩它和你。' },
      '你听到的"它的声音"其实是上一次它发出的声音的复写。它靠这个把同类叫过来。',
    ),
  ],

  intents: [
    { kind: 'listen', weight: 40, power: 0, bands: ['unknown', 'far', 'near'] },
    { kind: 'stalk', weight: 26, power: 0, minAwareness: 0.25, bands: ['far', 'near'], pull: 'near' },
    { kind: 'call', weight: 12, power: 0, minAwareness: 0.45 },
    { kind: 'ritual', weight: 10, power: 3, minAwareness: 0.6 },
    { kind: 'grab', weight: 20, power: 7, minAwareness: 0.78, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'strike', weight: 24, power: 10, minAwareness: 0.85, bands: ['adjacent', 'contact'] },
  ],

  telegraphs: {
    listen: ['节拍停了。它在等。', '所有的滴水声都对齐了。'],
    stalk: ['拖痕在你和门之间新添了一段。', '积水的倾斜换了方向。'],
    call: ['回声比它该有的多了一层。', '你听见自己的呼吸被别处学了一遍。'],
    ritual: ['舱壁在按四拍震。四下，一停。', '你的血在耳朵里跟上了那个节拍。'],
    grab: ['头顶十厘米处的那束东西不再垂着了。', '有什么在你上方停住，不着地。'],
    strike: ['气压一次性掉了两格。', '你面前的空气有了重量。'],
  },

  tiers: [
    tier(
      0,
      '???',
      // 第 0 档的描述必须是错的，而且要错得**合理**：玩家会自己选择相信它
      '一台还在运转的泵。声音从下层来，规律、机械、四拍一组。船上还有电，这是好消息。',
      0.12,
      ['act.observe', 'act.listen-hull', 'act.throw-pebble'],
      '不用管。先去找通往上层的路。',
    ),
    tier(
      0.28,
      '下面的东西',
      '不是泵。规律的东西不一定是机械 —— 泵不会停顿，它会。四下，一停。那是节拍，节拍意味着它在数。它在等一个回答。',
      0.38,
      ['act.hold-breath', 'act.drop-relics', 'act.freeze'],
      '它靠听。你发出的每一个声音都在给它一个坐标。安静不是策略，是唯一的状态。',
    ),
    tier(
      0.55,
      '聆听者（残缺记录）',
      '教团档案 KY-9/07：「它不搜索。它三角测量。两个声源足够，三个就是精确的。」记录到此中断，后面几页被撕掉了，撕口整齐。',
      0.66,
      ['act.silence-wrap', 'act.clicker-decoy', 'act.spike-auditory', 'act.crack-armor'],
      '单个假声源对它没用，它会把假源和你一起画进图里。要骗它，你得同时留下两个以上的声音，并且自己一个都不发。',
    ),
    tier(
      0.82,
      'THE LISTENER',
      '它没有形体可言，只有"被它占据的那部分体积"。你不会看到它 —— 不是因为太暗，是因为看不是它存在的方式。它同时听两样东西：声音，和你信什么。',
      1,
      ['act.crush-resonator', 'act.sever-tendon', 'act.pith-core'],
      '卸下所有圣物，停掉所有仪式，缠好一切金属，连续三个回合把噪音压到零 —— 它会丢掉坐标。它不能被杀。你能做到的最好结果是让它找不到你。',
    ),
  ],
};
