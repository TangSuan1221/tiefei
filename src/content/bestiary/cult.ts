/**
 * 教团残存者 —— 唯一**还是人**的敌人。
 *
 * 设计角色：给玩家一个"可以不打"的选项，并且让不打变成一个有代价的诱惑。
 *   - 两者都 `negotiable`，交涉类动作（恳求 / 背诵教义）对它们有效，但都会写 Stigma；
 *   - 杀死它们记 `stigma.apostasy` 与 `count.murdered`，这两个值直接进结局判定；
 *   - 它们的感知通道是**互补**的：执香人靠光与信仰，缄默执事靠热与振动。
 *     熄灯能躲开前者，对后者完全无效 —— 这一对是教玩家"没有万能招"的样本。
 */

import type { EnemyDef } from '../../encounter/types';
import { part, tier, knowledgeOf } from './helpers';

export const CENSER_BEARER: EnemyDef = {
  id: 'ent.censer-bearer',
  trueName: '执香人·二等侍役',
  hpMax: 66,
  deathCause: 'trauma',
  negotiable: true,
  senses: ['light', 'faith'],
  acuity: { light: 1.7, faith: 1.4 },
  awarenessDecay: 0.11,
  contactThreshold: 0.65,
  approach: 0.3,
  evasion: 0.2,
  power: 9,
  decoyCredulity: { light: 0.7, sound: 0.35, faith: 0.1, vibration: 0.15, heat: 0 },
  lure: ['light', 'faith'],
  tags: ['humanoid', 'cult', 'negotiable', 'light-hunter'],
  onSpawnLog: '先来的是味道 —— 烧过的树脂，甜，压不住底下那股。然后才是提炉的光。',
  killEffects: [
    { op: 'stigma', stigma: 'apostasy', delta: 1 },
    { op: 'flag-add', key: 'count.murdered', delta: 1 },
    { op: 'flag', key: 'did.killed-censer-bearer', value: true },
  ],

  parts: [
    part(
      'pt.censer-arm',
      '提炉臂',
      '尾索',
      'grasp',
      { hp: 16, evasion: 0.24, armor: 1, revealAt: 0 },
      {
        forbidIntents: ['grab'],
        note: '提炉掉进水里，灭了。这一舱暗了下来 —— 它现在和你一样看不见。',
      },
      '右臂始终抬到胸口高度，肘关节已经不能完全放下。提炉的链子嵌进了掌心的肉里。',
    ),
    part(
      'pt.blindfold-eye',
      '蒙眼布下的眼',
      '背棘',
      'ocular',
      { hp: 10, evasion: 0.34, armor: 0, revealAt: 1 },
      { blindTo: ['light'], awarenessDecayAdd: 0.08, note: '它开始朝着光的反方向走。它真的瞎了。' },
      '布是浸过油的，半透。教团让侍役蒙眼，但蒙的是为了让他们只看见光、看不见形状。',
      knowledgeOf('ent.censer-bearer'),
    ),
    part(
      'pt.litany-throat',
      '祷喉',
      '第二颚',
      'vocal',
      { hp: 12, evasion: 0.2, armor: 0, revealAt: 1 },
      { silenceCall: true, forbidIntents: ['call'], note: '祷词断了。它再也叫不来别人。' },
      '喉结上方有一圈旧疤，环形，深度一致。那是入会时勒出来的，为了让声音变薄。',
    ),
    part(
      'pt.knee-joint',
      '膝',
      '颈部关节',
      'locomotion',
      { hp: 14, evasion: 0.26, armor: 1, revealAt: 1 },
      { approachMul: 0.55, evasionAdd: -0.08, note: '它跪下来了，然后继续用膝盖前进。比走还慢。' },
      '长期跪拜让髌骨移位并重新钙化，形成一个偏心的硬块。它走路时上身会随每一步下沉。',
    ),
    part(
      'pt.chain-mantle',
      '链披',
      '腹面气孔',
      'armor',
      { hp: 22, evasion: 0.05, armor: 5, revealAt: 0 },
      { evasionAdd: -0.12, powerMul: 0.9, note: '链子散了一片，垂在身侧。它每动一下都自己响一次。' },
      '肩上披着一层小环编成的链，原本是圣物室的帘子。它挡刀，但它也一直在替你报位置。',
    ),
    part(
      'pt.heart',
      '心',
      '悬垂囊',
      'core',
      { hp: 18, evasion: 0.16, armor: 3, vital: true, revealAt: 3 },
      { lethal: true, note: '它坐了下去，很轻。提炉没有掉，它一直没松手。' },
      '第四第五肋之间有一处未愈合的切口，边缘外翻 —— 入会礼的最后一步是自己划开这里让它听。',
      knowledgeOf('ent.censer-bearer'),
    ),
  ],

  intents: [
    { kind: 'listen', weight: 18, power: 0, bands: ['unknown', 'far'] },
    { kind: 'stalk', weight: 26, power: 0, minAwareness: 0.2, bands: ['far', 'near'], pull: 'near' },
    { kind: 'ritual', weight: 16, power: 2, minAwareness: 0.4 },
    { kind: 'call', weight: 14, power: 0, minAwareness: 0.5 },
    { kind: 'strike', weight: 22, power: 7, minAwareness: 0.55, bands: ['adjacent', 'contact'] },
    { kind: 'grab', weight: 14, power: 4, minAwareness: 0.6, bands: ['near', 'adjacent'], pull: 'contact' },
    { kind: 'flee', weight: 10, power: 0 },
  ],

  telegraphs: {
    listen: ['它把提炉举高，绕了半圈。光扫过你脚边，停了一下。', '它不动了。香灰在落。'],
    stalk: ['光在舱壁上挪了三尺。它在往这边来，很慢。', '树脂的味道浓了。'],
    ritual: ['它开始念第二段。第二段很长。', '它用提炉在地上画了个半圆，然后等。'],
    call: ['它拉长了一个音，往通风口送。', '它敲了三下提炉。三下是"这里有人"。'],
    strike: ['它把提炉的链子在手上绕短了两圈。', '它的手腕翻了过来。链子绷直了。'],
    grab: ['它空出来的那只手向前探，五指张开。', '它伸手，掌心朝上 —— 它以为你会握住。'],
    flee: ['它开始后退，提炉举在身前挡着。', '它一边念一边往门口挪。'],
  },

  tiers: [
    tier(
      0,
      '举着灯的人',
      '一个活人！他举着灯，看起来是搜救队的。朝他喊一声 —— 你不用一个人待在这儿了。',
      0.16,
      ['act.observe', 'act.plead', 'act.raise-lamp'],
      '过去。他有灯，你需要灯。',
    ),
    tier(
      0.25,
      '蒙着眼的侍役',
      '他不是来救你的。布蒙在眼上，他没有在找你的脸，他在找光。你的手灯就是他的路标。',
      0.42,
      ['act.douse-lamp', 'act.throw-pebble', 'act.pry-strike', 'act.shove'],
      '灭掉你的灯。他靠光走，没有光他就只剩下"你信什么"这一条线索。',
    ),
    tier(
      0.5,
      '执香人',
      '提炉里烧的不是香，是用来盖住尸臭的树脂。他的膝盖已经不能正常行走 —— 跪太久了。他依然是个人，还能听懂话。',
      0.7,
      ['act.recite-creed', 'act.mercy-cut', 'act.sever-tendon', 'act.crack-armor'],
      '你可以谈。用教团的词能让他犹豫整整两回合。谈不成就打链披，把他砸慢 —— 但杀活人会留疤。',
    ),
    tier(
      0.76,
      '执香人·二等侍役',
      '二等侍役不参与仪式，只负责把味道压住，好让上面的人能专心听。第四第五肋之间那道口子是他自己划的，从来没缝。',
      1,
      ['act.pith-core', 'act.live-autopsy', 'act.spike-auditory'],
      '肋间那道口子是他自己留的门，一刺就到心。他到死都不会松开提炉 —— 所以杀他之后你能拿到光，也会拿到一道叛教的疤。',
    ),
  ],
};

export const SILENT_DEACON: EnemyDef = {
  id: 'ent.silent-deacon',
  trueName: '缄默执事',
  hpMax: 102,
  deathCause: 'trauma',
  negotiable: true,
  senses: ['heat', 'vibration'],
  acuity: { heat: 1.9, vibration: 1.2 },
  awarenessDecay: 0.06,
  contactThreshold: 0.55,
  approach: 0.58,
  evasion: 0.26,
  power: 17,
  // 靠热找人 —— 声音诱饵对它几乎无效，这是它与执香人的对照点
  decoyCredulity: { heat: 0.6, sound: 0.12, vibration: 0.45, light: 0, faith: 0 },
  lure: ['heat'],
  tags: ['humanoid', 'cult', 'negotiable', 'heat-hunter', 'aggressive'],
  onSpawnLog: '斧头在地上拖，刃朝下。他不看你，他把脸抬着，像在闻空气的温度。',
  killEffects: [
    { op: 'stigma', stigma: 'apostasy', delta: 2 },
    { op: 'flag-add', key: 'count.murdered', delta: 1 },
    { op: 'flag', key: 'did.killed-deacon', value: true },
  ],

  parts: [
    part(
      'pt.thermal-pit',
      '面部热窝',
      '外鳃',
      'thermal',
      { hp: 14, evasion: 0.36, armor: 1, revealAt: 2 },
      {
        blindTo: ['heat'],
        awarenessDecayAdd: 0.09,
        note: '它开始把脸贴到舱壁上找温度。它丢了主感官，只剩脚底那一路。',
      },
      '两侧鼻翼上方各有一个凹陷，内壁布满毛细血管，湿的。这不是人该有的结构 —— 这是后来长出来的。',
      knowledgeOf('ent.silent-deacon'),
    ),
    part(
      'pt.sutured-mouth',
      '缝合的口',
      '第二颚',
      'jaw',
      { hp: 12, evasion: 0.22, armor: 0, revealAt: 0 },
      { silenceCall: true, forbidIntents: ['call'], note: '线断了，嘴开了。它没有发出声音 —— 它已经不会了。' },
      '上下唇被粗线缝在一起，十四针，间距均匀。缄默不是誓言，是手术。',
    ),
    part(
      'pt.plantar-arch',
      '足弓',
      '尾索',
      'ampullae',
      { hp: 16, evasion: 0.28, armor: 1, revealAt: 2 },
      { blindTo: ['vibration'], approachMul: 0.8, note: '它踩不准了。它开始用斧柄探地。' },
      '光脚。脚底的皮厚到失去弹性，但足弓内侧有一片异常柔软 —— 它用那里读地板。',
    ),
    // 圣器室那场是关门的，没有门可以退。这条腱就是那扇门 ——
    // 卸掉它，它走不过你，"逃"才重新成为一个选项。
    part(
      'pt.hamstring',
      '腿后腱',
      '绑腿',
      'locomotion',
      { hp: 22, evasion: 0.34, armor: 1, revealAt: 2 },
      {
        approachMul: 0.25,
        forbidIntents: ['grab'],
        note: '它还在往前，但每一步都要先把重心交给另一条腿。',
      },
      '膝窝上方两指，皮下有一根绷起的索。它站着的时候那根索是直的。',
    ),
    part(
      'pt.axe-wrist',
      '持斧的腕',
      '颈部关节',
      'grasp',
      { hp: 20, evasion: 0.3, armor: 2, revealAt: 1 },
      { powerMul: 0.45, forbidIntents: ['grab'], note: '斧头换到左手了。它劈得歪，但它还在劈。' },
      '右腕比左腕粗一圈，桡骨表面有连续的应力性骨化。他劈过很多次，而且从不失手。',
    ),
    part(
      'pt.leather-apron',
      '皮革围裙',
      '背棘',
      'armor',
      { hp: 30, evasion: 0.04, armor: 7, revealAt: 0 },
      { evasionAdd: -0.14, note: '围裙裂开一道。底下的皮肤是白的，从来没见过光。' },
      '及膝的鞣制皮围裙，正面有大量深色浸渍，层层叠叠，最旧的那一层已经发黑。',
    ),
    part(
      'pt.carotid',
      '颈动脉',
      '悬垂囊',
      'core',
      { hp: 16, evasion: 0.4, armor: 2, vital: true, revealAt: 3 },
      { lethal: true, bleed: 6, note: '它捂住了脖子，跪下去，用另一只手继续摸索斧头。然后停了。' },
      '缝口正下方，皮肤薄得能看到搏动。缄默的手术留下的唯一破绽在于：他们必须留一条呼吸的路。',
      knowledgeOf('ent.silent-deacon'),
    ),
  ],

  intents: [
    { kind: 'stalk', weight: 22, power: 0, minAwareness: 0.15, bands: ['far', 'near'], pull: 'near' },
    { kind: 'strike', weight: 44, power: 9, minAwareness: 0.4, bands: ['near', 'adjacent', 'contact'] },
    { kind: 'grab', weight: 16, power: 5, minAwareness: 0.6, bands: ['adjacent'], pull: 'contact' },
    { kind: 'listen', weight: 10, power: 0, bands: ['unknown'] },
    { kind: 'ritual', weight: 8, power: 3, minAwareness: 0.5 },
  ],

  telegraphs: {
    stalk: ['斧刃在地板上划出一道，笔直，朝你。', '它抬着脸，像在追一缕暖气。'],
    strike: ['它把斧头抬到肩后。围裙的皮吱了一声。', '它两脚同时踩实。那是准备发力。'],
    grab: ['它松开斧头一只手，向前伸。', '它的左手张开，虎口对着你的喉咙的高度。'],
    listen: ['它把脚底在地板上碾了一下，停住。', '它蹲下来，手掌平贴地板。'],
    ritual: ['它用斧刃在自己手臂上划了一道，没有流血。', '它把斧头竖在身前，额头靠上去。'],
  },

  tiers: [
    tier(
      0,
      '拖着斧子的人',
      '一个受了伤的船员，拿着消防斧。他嘴上有血，说不出话。他需要帮助 —— 也许他知道出路。',
      0.14,
      ['act.observe', 'act.plead'],
      '举高灯让他看见你。受伤的人不会攻击求助的人。',
    ),
    tier(
      0.25,
      '不说话的那个',
      '嘴上不是血，是线。十四针。他不是说不出话，他是被缝上的。熄灯没有用 —— 他刚才在暗处走得比你快。',
      0.4,
      ['act.chill-soak', 'act.back-away', 'act.axe-chop', 'act.hold-line'],
      '灯灭了他还是能找到你。他追的不是光也不是声，是温度。躲不掉就得挡。',
    ),
    tier(
      0.52,
      '缄默执事',
      '鼻翼上方两个凹陷，湿的，里面是毛细血管网 —— 那是后天长出来的热感受器。他光脚，因为脚底也在读你。',
      0.72,
      ['act.asbestos-shroud', 'act.sever-tendon', 'act.crack-armor', 'act.mercy-cut'],
      '泡进冷水或者裹上石棉，把体温藏起来，他会从你身边走过去。硬打的话先废掉持斧的腕。',
    ),
    tier(
      0.78,
      '缄默执事',
      '缄默是一台手术，不是一个誓言。手术必须留一条呼吸的路 —— 缝口正下方那段皮肤薄到能看见搏动。这是整套教义唯一的设计缺陷。',
      1,
      ['act.gouge-thermal', 'act.pith-core', 'act.live-autopsy'],
      '掏掉面部热窝，他就只剩下脚底；或者直接走缝口下方那一寸。他的斧头是全船最好的武器，但拿走它要背两道叛教的疤。',
    ),
  ],
};
