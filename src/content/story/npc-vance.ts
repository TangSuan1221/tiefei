/**
 * 万斯 VANCE —— 无线电里的声音，自称救援。
 *
 * 核心张力（GDD §7.2）：他给的坐标越来越准——因为他在船上。
 *
 * 剧作位置（Truby 步骤 8，假盟友对手）：他是全剧主要对手，但从不威胁玩家。
 * 他攻击玩家弱点的方式是**给答案**。玩家的弱点是想知道，他就一直喂。
 * 他要的回报只有一样：让你描述你看到的东西。他从不描述他看到的。
 *
 * 契诃夫技法：
 *  - 口头禅「按住按钮说话」，结尾反用（最后一次是他求你按住）。
 *  - S7 预告之事不发生：他一直在说"上浮窗口"，窗口永远差二十分钟。
 *  - D3 哲学后接生理需求：每次话谈到深处，他就切回"你的氧读数飘了"。
 *  - D5 长独白只谈职业强迫症：他谈的永远是通讯规程、记录格式、栏目。
 */

import type { NarrativeNode } from '../../core/contract';
import {
  addf,
  all,
  any,
  c,
  cor,
  fear,
  give,
  go,
  item,
  K,
  learn,
  loud,
  mark,
  noK,
  not,
  num,
  off,
  on,
  san,
  setf,
  sfx,
  silence,
} from '../../narrative/dsl';

export const VANCE_NODES: readonly NarrativeNode[] = [
  {
    id: 'vance.hail',
    speaker: '万斯',
    text: '——按住按钮说话。你没按住，我只听见一半。\n再来一次。',
    corruptedText: cor([45, '——按住按钮说话。我听见两个人的一半。']),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('met.vance'), addf('count.vance-calls', 1), sfx('radio.squelch')],
    choices: [
      c({
        id: 'vance.hail.name',
        label: '报自己的名字。',
        cost: 2,
        effects: [mark('listening', 1)],
        goto: 'vance.hail.named',
      }),
      c({
        id: 'vance.hail.who',
        label: '"你是谁。"',
        cost: 2,
        effects: [setf('did.asked-vance-who')],
        goto: 'vance.who',
      }),
      silence('vance.hail.hold', 'vance.hail.silence', '按住按钮，不说话。')
    ],
  },
  {
    id: 'vance.hail.named',
    speaker: '万斯',
    text: '收到。名字对。\n［停顿］对什么对？对名单。',
    corruptedText: cor([40, '收到。名字对。这次对得很快。']),
    tags: ['key'],
    onEnter: [setf('know.vance-has-list')],
    choices: [
      c({
        id: 'vance.hail.named.list',
        label: '"什么名单。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.list',
      }),
      go('vance.hail.named.skip', '不接这句。', 'vance.channel')
    ],
  },
  {
    id: 'vance.hail.silence',
    speaker: '万斯',
    text: '好。你按住了。\n我能听见你那边的水声。五公分，温的，对吧。',
    corruptedText: cor([40, '好。你按住了。我能听见你的血。']),
    tags: ['key'],
    onEnter: [fear(8), setf('know.vance-hears-water')],
    choices: [
      c({
        id: 'vance.hail.silence.how',
        label: '"你怎么知道水是温的。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.water',
      }),
      silence('vance.hail.silence.keep', 'vance.channel')
    ],
  },
  {
    id: 'vance.water',
    speaker: '万斯',
    text: '声音。温水的声音钝一点。\n［停顿］这是基本功。你的氧读数在飘，把面罩往左边压一下。',
    tags: ['key'],
    choices: [
      c({
        id: 'vance.water.press',
        label: '照做。',
        cost: 1,
        effects: [addf('count.vance-obeyed', 1), san(2)],
        goto: 'vance.channel',
      }),
      c({
        id: 'vance.water.refuse',
        label: '不动。',
        effects: [mark('silence', 1)],
        goto: 'vance.refused',
      })
    ],
  },
  {
    id: 'vance.refused',
    speaker: '万斯',
    text: '随你。\n［停顿］飘的意思是表坏了，或者你在吸别的东西。两种都不要紧，但只有一种要紧。',
    corruptedText: cor([40, '随你。反正表是我在看。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.refused.which',
        label: '"哪一种要紧。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.which',
      }),
      go('vance.refused.drop', '不问。', 'vance.channel')
    ],
  },
  {
    id: 'vance.which',
    speaker: '万斯',
    text: '表坏了要紧。人吸错东西不要紧，人会适应。\n［停顿］这不是安慰。',
    tags: ['key'],
    choices: [go('vance.which.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.who',
    speaker: '万斯',
    text: '万斯。水面支援，第二班。\n［停顿］"支援"是编制名称，不是承诺。',
    corruptedText: cor([45, '万斯。第二班。第一班是谁，你以后会问的。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.who.surface',
        label: '"水面。你在水面上。"',
        cost: 2,        goto: 'vance.surface',
      }),
      c({
        id: 'vance.who.first',
        label: '"第一班呢。"',
        cost: 2,
        requires: on('did.asked-vance-who'),
        effects: [addf('count.questions', 1)],
        goto: 'vance.firstshift',
      }),
      go('vance.who.next', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.surface',
    speaker: '万斯',
    text: '我在我该在的地方。\n［停顿］你想问的是距离。距离在变小，这是好消息。',
    corruptedText: cor([40, '我在我该在的地方。距离在变小。我没有在移动。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.surface.smaller',
        label: '"谁在动。"',
        cost: 2,
        effects: [addf('count.questions', 1), fear(6)],
        goto: 'vance.whomoves',
      }),
      go('vance.surface.ok', '"好消息。"', 'vance.channel')
    ],
  },
  {
    id: 'vance.whomoves',
    speaker: '万斯',
    text: '［停顿］\n你的氧读数又飘了。',
    corruptedText: cor([35, '［停顿］你听见他挪了一下。椅子的声音。']),
    tags: ['key'],
    onEnter: [sfx('chair.creak'), fear(10)],
    choices: [
      c({
        id: 'vance.whomoves.chair',
        label: '"你那边有椅子。"',
        cost: 2,
        effects: [setf('did.heard-vance-chair'), setf('know.vance-chair')],
        goto: 'vance.chair',
      }),
      silence('vance.whomoves.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.chair',
    speaker: '万斯',
    text: '支援船上也有椅子。\n［停顿］按住按钮说话。',
    tags: ['key'],
    choices: [
      c({
        id: 'vance.chair.push',
        label: '"支援船上没有这种椅子。"',
        cost: 3,
        requires: on('met.dorn'),
        gateMode: 'hide',
        effects: [san(-4)],
        goto: 'vance.chair.same',
      }),
      go('vance.chair.drop', '按住按钮，不说话。', 'vance.channel')
    ],
  },
  {
    id: 'vance.chair.same',
    speaker: '万斯',
    text: '［停顿］\n［停顿］你见过多恩了。',
    corruptedText: cor([40, '［停顿］你见过多恩了。他还坐着吗。']),
    tags: ['key'],
    onEnter: [setf('know.vance-knows-dorn')],
    choices: [
      c({
        id: 'vance.chair.same.yes',
        label: '"他还坐着。"',
        cost: 2,
        effects: [addf('count.questions', 1), addf('count.described', 1)],
        goto: 'vance.chair.report',
      }),
      silence('vance.chair.same.no', 'vance.channel', '不回答。')
    ],
  },
  {
    id: 'vance.chair.report',
    speaker: '万斯',
    text: '记下了。\n［停顿］他有没有让你解开他。',
    tags: ['key'],
    choices: [
      c({
        id: 'vance.chair.report.no',
        label: '"他让我别解。"',
        cost: 2,
        effects: [addf('count.described', 1) ],
        goto: 'vance.chair.good',
      }),
      c({
        id: 'vance.chair.report.lie',
        label: '"他让我解。"',
        cost: 2,
        effects: [san(-2)],
        goto: 'vance.chair.wrong',
      })
    ],
  },
  {
    id: 'vance.chair.good',
    speaker: '万斯',
    text: '对。那是他。\n［停顿］别解。',
    tags: ['key'],
    choices: [go('vance.chair.good.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.chair.wrong',
    speaker: '万斯',
    text: '［停顿］不对。\n多恩不会那么说。你在试我。这没关系，试我比信我好。',
    corruptedText: cor([40, '［停顿］不对。多恩不会那么说。我在他旁边。']),
    tags: ['key'],
    onEnter: [setf('know.vance-caught-lie')],
    choices: [
      c({
        id: 'vance.chair.wrong.how',
        label: '"你怎么知道他不会那么说。"',
        cost: 2,
        effects: [addf('count.questions', 1), fear(8)],
        goto: 'vance.chair.knows',
      }),
      go('vance.chair.wrong.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.chair.knows',
    speaker: '万斯',
    text: '我们同期。\n［停顿］你的氧读数很好。继续保持。',
    tags: ['key'],
    onEnter: [learn('k.vance-onboard')],
    choices: [go('vance.chair.knows.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.firstshift',
    speaker: '万斯',
    text: '第一班交班了。\n［停顿］交班记录我念给你听：「样本行进正常，无需干预。」',
    corruptedText: cor([40, '第一班交班了。记录上是我的字。所有班都是我的字。']),
    tags: ['key'],
    onEnter: [setf('know.handover-wording')],
    choices: [
      c({
        id: 'vance.firstshift.sample',
        label: '"样本。"',
        cost: 2,        goto: 'vance.sample-word',
      }),
      go('vance.firstshift.drop', '不接。', 'vance.channel')
    ],
  },
  {
    id: 'vance.sample-word',
    speaker: '万斯',
    text: '表格上的栏目名。表格是三十年前印的，改一个字要走流程。\n［停顿］没人有空走流程。',
    corruptedText: cor([40, '表格上的栏目名。第四栏。你是第四栏。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.sample-word.column',
        label: '"表格有几栏。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.columns',
      }),
      go('vance.sample-word.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.columns',
    speaker: '万斯',
    text: '八栏。\n［停顿］这个问题很好，但现在不该问这个。',
    corruptedText: cor([40, '八栏。七个勾。']),
    tags: ['key'],
    onEnter: [setf('know.eight-columns')],
    choices: [
      c({
        id: 'vance.columns.ask8',
        label: '"八栏，哪八栏。"',
        cost: 3,
        requires: all(K('k.vance-is-the-recorder'), K('k.path-is-a-stroke')),
        gateMode: 'lie',
        effects: [learn('k.eight-strokes')],
        goto: 'vance.columns.eight',
      }),
      go('vance.columns.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.columns.eight',
    speaker: '万斯',
    text: '浮出。缄默。入会。溺者。铁肺。叛教。零号。\n［停顿］第八栏的表头是空的。我们没有见过第八种。',
    corruptedText: cor([40, '七个。第八栏表头是空的。空了十七次。']),
    tags: ['key'],
    onEnter: [learn('k.eight-strokes'), san(-8)],
    choices: [
      c({
        id: 'vance.columns.eight.ask',
        label: '"第八种是什么。"',
        cost: 2,
        effects: [setf('did.asked-eighth')],
        goto: 'vance.eighth',
      }),
      silence('vance.columns.eight.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.eighth',
    speaker: '万斯',
    text: '不知道。所以表头空着。\n［停顿］按住按钮说话。你刚才没按住。',
    tags: ['key'],
    choices: [go('vance.eighth.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.list',
    speaker: '万斯',
    text: '十九个名字，加一个位置。位置是空的，一直空着。\n［停顿］你在那个位置上。',
    corruptedText: cor([40, '十九个名字，加一个位置。你在那个位置上。你上次也在。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.list.twenty',
        label: '"第二十个。"',
        cost: 2,
        requires: K('k.manifest-nineteen'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'vance.twentieth',
      }),
      go('vance.list.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.twentieth',
    speaker: '万斯',
    text: '不是"第二十个"。是"位"。位不编号，位只登记谁在上面。\n［停顿］这两个说法差别很大，你以后会明白。',
    corruptedText: cor([40, '位不编号。位只登记。登记过十七次。']),
    tags: ['key'],
    choices: [go('vance.twentieth.ok', '……', 'vance.channel')],
  },

  // -------------------------------------------------------------------------
  // 通话中枢
  // -------------------------------------------------------------------------
  {
    id: 'vance.channel',
    speaker: '万斯',
    text: '载波开着。你要问就问，别按半下。',
    corruptedText: cor(
      [50, '载波开着。底噪里有另一层，规律的，像有人在等你说完。'],
      [22, '载波开着。他已经不在那头了，但载波还在。'],
    ),
    tags: ['entry', 'hub', 'key'],
    onEnter: [addf('count.vance-calls', 1), sfx('radio.carrier')],
    choices: [
      c({
        id: 'vance.channel.coords',
        label: '"给我坐标。"',
        cost: 2,
        effects: [addf('count.coords-given', 1), addf('count.questions', 1)],
        goto: 'vance.coords',
      }),
      c({
        id: 'vance.channel.window',
        label: '"上浮窗口什么时候。"',
        cost: 2,
        effects: [addf('count.window-asked', 1), setf('know.vance-window')],
        goto: 'vance.window',
      }),
      c({
        id: 'vance.channel.array',
        label: '"这条船是干什么的。"',
        cost: 3,
        requires: K('k.not-research'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'vance.array',
      }),
      c({
        id: 'vance.channel.where',
        label: '"你在哪。"',
        cost: 2,
        requires: num('count.coords-given', '>=', 3),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'vance.where',
      }),
      c({
        id: 'vance.channel.describe',
        label: '描述你眼前的东西。',
        cost: 3,
        effects: [addf('count.described', 1) ],
        goto: 'vance.describe',
      }),
      c({
        id: 'vance.channel.recorder',
        label: '"你不是来救我的。"',
        cost: 3,
        requires: all(K('k.vance-onboard'), K('k.salvage-is-ritual')),
        gateMode: 'disable',
        effects: [learn('k.vance-is-the-recorder'), addf('count.questions', 1)],
        goto: 'vance.recorder',
      }),
      c({
        id: 'vance.channel.mother',
        label: '"广播里的那个声音。"',
        cost: 2,
        requires: on('met.mother'),
        gateMode: 'hide',
        effects: [addf('count.questions', 1)],
        goto: 'vance.mother',
      }),
      c({
        id: 'vance.channel.pelle',
        label: '"管道里有个小孩。"',
        cost: 2,
        requires: on('met.pelle'),
        gateMode: 'hide',
        effects: [addf('count.questions', 1), addf('count.described', 1)],
        goto: 'vance.pelle',
      }),
      c({
        id: 'vance.channel.choir',
        label: '"礼拜堂里有人在唱。"',
        cost: 2,
        requires: on('met.choir'),
        gateMode: 'hide',
        effects: [addf('count.questions', 1), addf('count.described', 1)],
        goto: 'vance.choir',
      }),
      c({
        id: 'vance.channel.logbook',
        label: '出示他的值班簿。',
        cost: 3,
        requires: item('logbook.vance'),
        gateMode: 'lie',        goto: 'vance.logbook',
      }),
      c({
        id: 'vance.channel.sync',
        label: '屏住呼吸，听他的呼吸。',
        cost: 4,
        requires: num('count.vance-calls', '>=', 5),
        gateMode: 'disable',        goto: 'vance.sync',
      }),
      c({
        id: 'vance.channel.off',
        label: '关掉。',
        cost: 1,
        effects: [mark('silence', 1) ],
        goto: 'vance.off',
      })
    ],
  },
  {
    id: 'vance.coords',
    speaker: '万斯',
    text: '方位一一七，下两层，再往船尾三个舱。\n［停顿］比上次准，对吧。',
    corruptedText: cor(
      [50, '方位一一七，下两层，再往船尾三个舱。你现在就在那里。'],
      [22, '方位一一七。他报的是你脚下那块板的编号。'],
    ),
    tags: ['key'],    choices: [
      c({
        id: 'vance.coords.accurate',
        label: '"越来越准。"',
        cost: 2,
        requires: num('count.coords-given', '>=', 2),
        gateMode: 'disable',        goto: 'vance.accurate',
      }),
      c({
        id: 'vance.coords.verify',
        label: '对照自己的深度表。',
        cost: 3,
        requires: on('know.breath-unit'),
        gateMode: 'disable',
        effects: [addf('count.coords-verified', 1)],
        goto: 'vance.verify',
      }),
      go('vance.coords.thanks', '"收到。"', 'vance.channel')
    ],
  },
  {
    id: 'vance.accurate',
    speaker: '万斯',
    text: '数据积累。\n［停顿］积累的意思是，前面那些不准的也是我报的。',
    corruptedText: cor([40, '数据积累。你走过的每一步都在积累。']),
    tags: ['key'],
    choices: [go('vance.accurate.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.verify',
    speaker: undefined,
    text: '你的表：负八百四十。他报的：负八百四十一。\n水面到这里的传播延迟，够他差三米。他没有差。',
    corruptedText: cor([40, '你的表：负八百四十。他报的是你三十秒之后的深度。']),
    tags: ['key'],
    onEnter: [san(-5)],
    choices: [
      c({
        id: 'vance.verify.conclude',
        label: '他不在水面上。',
        requires: num('count.coords-verified', '>=', 2),
        gateMode: 'disable',
        effects: [learn('k.vance-onboard')],
        goto: 'vance.verify.conclude',
      }),
      go('vance.verify.again', '再要一次坐标。', 'vance.channel')
    ],
  },
  {
    id: 'vance.verify.conclude',
    speaker: undefined,
    text: '他不在水面上。他在这条船上，而且在一个能看见你的地方。\n你不知道那是哪，但他知道你不知道。',
    tags: ['key'],
    onEnter: [fear(14), setf('know.vance-lied')],
    choices: [go('vance.verify.conclude.back', '……', 'vance.channel')],
  },
  {
    id: 'vance.window',
    speaker: '万斯',
    text: '窗口在二十分钟后。\n［停顿］保持通话。',
    corruptedText: cor(
      [50, '窗口在二十分钟后。上次也是二十分钟后。'],
      [22, '窗口在二十分钟后。这句话你听过十七次，每次都是二十分钟。'],
    ),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.window.again',
        label: '"上次你也说二十分钟。"',
        cost: 2,
        requires: num('count.window-asked', '>=', 3),
        gateMode: 'disable',        goto: 'vance.window.again',
      }),
      c({
        id: 'vance.window.wait',
        label: '"我在这儿等。"',
        cost: 10,
        effects: [addf('count.futile-acts', 1), san(-4)],
        goto: 'vance.window.waited',
      }),
      go('vance.window.ok', '"收到。"', 'vance.channel')
    ],
  },
  {
    id: 'vance.window.again',
    speaker: '万斯',
    text: '窗口是滚动的。\n［停顿］你的氧读数很好。',
    corruptedText: cor([40, '窗口是滚动的。它滚了十七次。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.window.again.press',
        label: '"没有窗口。"',
        cost: 3,
        requires: K('k.vance-is-the-recorder'),
        gateMode: 'disable',
        effects: [setf('know.no-window'), san(-6)],
        goto: 'vance.nowindow',
      }),
      go('vance.window.again.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.nowindow',
    speaker: '万斯',
    text: '［停顿］\n没有窗口。有记录。',
    corruptedText: cor([35, '［停顿］没有窗口。从来没有。记录里这一栏叫"配合度"。']),
    tags: ['key'],
    onEnter: [setf('know.no-window'), san(-6), fear(12)],
    choices: [
      c({
        id: 'vance.nowindow.why',
        label: '"那你为什么要说有。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.whylie',
      }),
      silence('vance.nowindow.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.whylie',
    speaker: '万斯',
    text: '因为会走的样本走得更远。\n［停顿］这不是残忍。残忍是让你坐下来等。',
    corruptedText: cor([40, '因为会走的样本走得更远。你走得很远。你是最远的那个。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.whylie.thanks',
        label: '"谢谢。"',
        cost: 2,
        effects: [mark('listening', 1), san(-3)],
        goto: 'vance.thanked',
      }),
      c({
        id: 'vance.whylie.curse',
        label: '骂他。',
        cost: 2,
        effects: [loud(18), fear(-6)],
        goto: 'vance.cursed',
      }),
      silence('vance.whylie.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.thanked',
    speaker: '万斯',
    text: '［停顿］记下了。\n这一栏以前没人填过。',
    tags: ['key'],
    choices: [go('vance.thanked.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.cursed',
    speaker: '万斯',
    text: '声音太大了。\n［停顿］我这边的表在跳。不是我的表。',
    tags: ['key'],
    onEnter: [loud(12)],
    choices: [go('vance.cursed.ok', '压低声音。', 'vance.channel')],
  },
  {
    id: 'vance.window.waited',
    speaker: '万斯',
    text: '还有二十分钟。\n［停顿］你刚才那二十分钟，水位涨了两公分。',
    tags: ['key'],
    choices: [go('vance.window.waited.go', '不等了。', 'vance.channel')],
  },
  {
    id: 'vance.array',
    speaker: '万斯',
    text: '龙骨是振膜。舱壁是隔声层。所有舱室朝一个方向排，那个方向朝下。\n［停顿］这是一支麦克风，你站在里面。',
    corruptedText: cor([40, '这是一支麦克风。你站在里面。你的呼吸是它今天收到的最响的东西。']),
    tags: ['key'],
    onEnter: [learn('k.listening-array'), san(-4)],
    choices: [
      c({
        id: 'vance.array.who',
        label: '"听谁。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.listenwhom',
      }),
      c({
        id: 'vance.array.quiet',
        label: '"那我应该闭嘴。"',
        cost: 2,
        effects: [mark('silence', 2) ],
        goto: 'vance.beQuiet',
      })
    ],
  },
  {
    id: 'vance.listenwhom',
    speaker: '万斯',
    text: '不是听谁。是听。\n［停顿］这个动词在我们的文件里不带宾语。',
    corruptedText: cor([40, '不是听谁。是听。宾语那一栏是空的，和第八栏一样。']),
    tags: ['key'],
    choices: [go('vance.listenwhom.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.beQuiet',
    speaker: '万斯',
    text: '闭嘴对你好。\n［停顿］但记录会少一栏。你自己决定。',
    tags: ['key'],
    choices: [go('vance.beQuiet.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.where',
    speaker: '万斯',
    text: '［停顿］\n［停顿］按住按钮说话。',
    corruptedText: cor([40, '［停顿］［停顿］你听见他在很近的地方按下了同一个按钮。']),
    tags: ['key'],
    onEnter: [sfx('radio.squelch'), fear(10)],
    choices: [
      c({
        id: 'vance.where.press',
        label: '再问一次。',
        cost: 3,
        effects: [addf('count.pressed-vance', 1), addf('count.questions', 1)],
        goto: 'vance.where.again',
      }),
      silence('vance.where.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.where.again',
    speaker: '万斯',
    text: '声呐室。\n［停顿］三层，指挥层。门是从里面锁的。',
    corruptedText: cor([40, '声呐室。门是从里面锁的。我锁的。']),
    tags: ['key'],
    onEnter: [setf('know.vance-location'), learn('k.vance-onboard')],
    choices: [
      c({
        id: 'vance.where.again.come',
        label: '"我来找你。"',
        cost: 2,        goto: 'vance.come',
      }),
      silence('vance.where.again.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.come',
    speaker: '万斯',
    text: '不要来。\n［停顿］不是为我。记录不能有两个人在同一个位置。',
    corruptedText: cor([40, '不要来。位只登记一个人。']),
    tags: ['key'],
    choices: [go('vance.come.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.describe',
    speaker: '万斯',
    text: '说慢一点。颜色、数量、有没有在动。\n［停顿］对，就这样。继续。',
    corruptedText: cor([40, '说慢一点。他在写。你听见笔尖的声音。']),
    tags: ['key'],
    onEnter: [sfx('pen.scratch')],
    choices: [
      c({
        id: 'vance.describe.more',
        label: '继续描述。',
        cost: 4,
        effects: [addf('count.described', 1), mark('listening', 1)],
        goto: 'vance.describe.more',
      }),
      c({
        id: 'vance.describe.turn',
        label: '"换你说。你那边是什么样。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.turnabout',
      }),
      go('vance.describe.stop', '不说了。', 'vance.channel')
    ],
  },
  {
    id: 'vance.describe.more',
    speaker: '万斯',
    text: '好。\n［停顿］你描述得比上次清楚。上次你漏了水位。',
    corruptedText: cor([40, '你描述得比上次清楚。上次你在这个房间里哭了。']),
    tags: ['key'],    choices: [
      c({
        id: 'vance.describe.more.lasttime',
        label: '"上次。"',
        cost: 2,        goto: 'vance.lasttime',
      }),
      go('vance.describe.more.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.lasttime',
    speaker: '万斯',
    text: '上次演练。\n［停顿］你的氧读数在飘。',
    corruptedText: cor([40, '上次演练。演练了十七次。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.lasttime.push',
        label: '"我没有参加过演练。"',
        cost: 3,
        requires: K('k.you-are-sample-n'),
        gateMode: 'disable',
        effects: [san(-5)],
        goto: 'vance.drill',
      }),
      go('vance.lasttime.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.drill',
    speaker: '万斯',
    text: '［停顿］\n你参加过。你只是不用记得。这一条是设计，不是事故。',
    corruptedText: cor([40, '你参加过。不记得是设计的一部分。记得的那几个走不完。']),
    tags: ['key'],
    onEnter: [san(-8), fear(12)],
    choices: [
      c({
        id: 'vance.drill.who',
        label: '"谁设计的。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.designer',
      }),
      silence('vance.drill.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.designer',
    speaker: '万斯',
    text: '没有设计者。有一份会议记录，十九个人举手。\n［停顿］我是做记录的那个。',
    corruptedText: cor([40, '没有设计者。有十九只手。还有我的一只，我在记录，所以我的手在写。']),
    tags: ['key'],
    onEnter: [learn('k.vance-is-the-recorder')],
    choices: [go('vance.designer.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.turnabout',
    speaker: '万斯',
    text: '［停顿］\n［停顿］我这边是黑的。',
    corruptedText: cor([40, '［停顿］我这边是黑的。我看着你的那一面不是黑的。']),
    tags: ['key'],    choices: [
      c({
        id: 'vance.turnabout.press',
        label: '"具体一点。颜色、数量、有没有在动。"',
        cost: 3,
        effects: [san(-3)],
        goto: 'vance.turnabout.detail',
      }),
      go('vance.turnabout.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.turnabout.detail',
    speaker: '万斯',
    text: '一个人。坐着。没有在动。\n［停顿］按住按钮说话。',
    corruptedText: cor([40, '一个人。坐着。没有在动。面罩内侧有一小片水汽，在左眼下方。']),
    tags: ['key'],
    onEnter: [fear(16), san(-6), setf('know.vance-describes-you')],
    choices: [silence('vance.turnabout.detail.silent', 'vance.channel', '松开按钮。')],
  },
  {
    id: 'vance.mother',
    speaker: '万斯',
    text: '广播系统是船的。声音是档案里的。\n［停顿］两样都不是她的。',
    corruptedText: cor([40, '广播系统是船的。声音是档案里的。她本人在第三个位。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.mother.whose',
        label: '"那是谁的声音。"',
        cost: 2,
        requires: K('k.mother-is-spliced'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'vance.mother.whose',
      }),
      go('vance.mother.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.mother.whose',
    speaker: '万斯',
    text: '名单第三行。\n［停顿］她走完了。走完的样本会被留下来值班。这是待遇。',
    corruptedText: cor([40, '名单第三行。她走完了。她在等有人陪她值班。']),
    tags: ['key'],
    onEnter: [learn('k.mother-was-crew'), san(-6)],
    choices: [go('vance.mother.whose.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.pelle',
    speaker: '万斯',
    text: '名单上没有小孩。\n［停顿］别跟他说你叫什么。',
    corruptedText: cor([40, '名单上没有小孩。你已经告诉他了吗。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.pelle.why',
        label: '"为什么。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.pelle.why',
      }),
      c({
        id: 'vance.pelle.told',
        label: '"我已经说了。"',
        cost: 2,
        requires: on('did.told-pelle-name'),
        gateMode: 'hide',        goto: 'vance.pelle.late',
      })
    ],
  },
  {
    id: 'vance.pelle.why',
    speaker: '万斯',
    text: '他会记住。他记住的东西会进合唱。\n［停顿］进了合唱就取不出来。',
    tags: ['key'],
    choices: [go('vance.pelle.why.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.pelle.late',
    speaker: '万斯',
    text: '［停顿］那就算了。\n下次记得。',
    corruptedText: cor([40, '［停顿］那就算了。下次记得。你不会记得。']),
    tags: ['key'],
    onEnter: [setf('know.next-time-implied')],
    choices: [
      c({
        id: 'vance.pelle.late.next',
        label: '"下次。"',
        cost: 2,        goto: 'vance.nexttime',
      }),
      silence('vance.pelle.late.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.nexttime',
    speaker: '万斯',
    text: '口误。\n［停顿］你的氧读数在飘。',
    corruptedText: cor([40, '口误。他念了十七次这个口误。']),
    tags: ['key'],
    choices: [go('vance.nexttime.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.choir',
    speaker: '万斯',
    text: '别打断他们。\n［停顿］唱完一轮要四分钟。四分钟你等得起。',
    corruptedText: cor([40, '别打断他们。他们唱到第二十行会停半拍。那半拍不是给你的。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.choir.names',
        label: '"他们唱的是名单。"',
        cost: 2,
        requires: K('k.choir-sings-manifest'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'vance.choir.names',
      }),
      go('vance.choir.drop', '……', 'vance.channel')
    ],
  },
  {
    id: 'vance.choir.names',
    speaker: '万斯',
    text: '是。十九个，然后回到第一个。\n［停顿］你听到第二十行有停顿的时候，不要答应。',
    corruptedText: cor([40, '是。十九个。你上次答应了。所以你现在在这儿。']),
    tags: ['key'],
    onEnter: [setf('know.do-not-answer')],
    choices: [go('vance.choir.names.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.logbook',
    speaker: '万斯',
    text: '［停顿］那本簿子应该在声呐室。\n［停顿］你去过声呐室了。',
    corruptedText: cor([40, '［停顿］那本簿子应该在我手里。你手里那本是哪一本。']),
    tags: ['key'],    choices: [
      c({
        id: 'vance.logbook.read',
        label: '念最后一页给他听。',
        cost: 4,
        effects: [learn('k.eight-strokes')],
        goto: 'vance.logbook.read',
      }),
      go('vance.logbook.close', '合上。', 'vance.channel')
    ],
  },
  {
    id: 'vance.logbook.read',
    speaker: '万斯',
    text: '［停顿］第七栏是上一个。\n［停顿］不要念第八栏的表头。它是空的，但你念出来就不空了。',
    corruptedText: cor([40, '［停顿］不要念第八栏。你上次念了。']),
    tags: ['key'],
    onEnter: [san(-7), fear(14)],
    choices: [
      c({
        id: 'vance.logbook.read.eighth',
        label: '念。',
        cost: 3,
        irreversible: true,
        requires: K('k.the-word'),
        gateMode: 'lie',
        effects: [mark('listening', 2), san(-10), loud(30)],
        goto: 'vance.logbook.spoken',
      }),
      silence('vance.logbook.read.silent', 'vance.channel', '合上簿子。')
    ],
  },
  {
    id: 'vance.logbook.spoken',
    speaker: '万斯',
    text: '［停顿］\n你念了。第八栏现在有表头了。',
    corruptedText: cor([40, '［停顿］你念了。所有的表都翻到了那一页。']),
    tags: ['key'],
    onEnter: [setf('know.eighth-named'), sfx('silence.total')],
    choices: [go('vance.logbook.spoken.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.sync',
    speaker: undefined,
    text: '你屏住呼吸。载波里还有一份呼吸。\n它也停了。停在同一个位置。',
    corruptedText: cor([40, '你屏住呼吸。载波里还有一份呼吸。它比你晚停半拍，然后追上了。']),
    tags: ['key'],
    onEnter: [fear(18), san(-8), sfx('breath.other')],
    choices: [
      c({
        id: 'vance.sync.debunk',
        label: '这不是他的呼吸。这是我的回声。',
        cost: 2,
        requires: K('k.listening-array'),
        gateMode: 'disable',
        effects: [addf('count.debunks', 1), san(10)],
        goto: 'vance.sync.debunk',
      }),
      c({
        id: 'vance.sync.accept',
        label: '继续屏住，看谁先喘。',
        cost: 6,
        effects: [san(-6), loud(22)],
        goto: 'vance.sync.lost',
      })
    ],
  },
  {
    id: 'vance.sync.debunk',
    speaker: undefined,
    text: '整条船是振膜。你的呼吸沿龙骨传到声呐室，再从他的话筒回来。\n延迟正好是你听见的那半拍。',
    tags: ['key'],
    onEnter: [san(6)],
    choices: [go('vance.sync.debunk.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.sync.lost',
    speaker: '万斯',
    text: '你先喘的。\n［停顿］我这边不需要呼吸。',
    corruptedText: cor([40, '你先喘的。他没有喘。他一直没有喘。']),
    tags: ['key'],
    onEnter: [fear(20), san(-10)],
    choices: [
      c({
        id: 'vance.sync.lost.what',
        label: '"什么意思。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.nobreath',
      }),
      silence('vance.sync.lost.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.nobreath',
    speaker: '万斯',
    text: '意思是我的表不飘。\n［停顿］按住按钮说话。',
    corruptedText: cor([40, '意思是我的表不飘。我不用表。我用你的。']),
    tags: ['key'],
    choices: [go('vance.nobreath.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.recorder',
    speaker: '万斯',
    text: '［停顿］不是。\n［停顿］我是来记录你怎么救自己的。这两件事看上去很像。',
    corruptedText: cor([40, '［停顿］不是。我是来记录的。你救自己的样子每次都不一样，这一点很有价值。']),
    tags: ['key'],
    onEnter: [learn('k.vance-is-the-recorder'), san(-6)],
    choices: [
      c({
        id: 'vance.recorder.stop',
        label: '"停止记录。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'vance.recorder.stop',
      }),
      c({
        id: 'vance.recorder.join',
        label: '"让我看记录。"',
        cost: 3,
        requires: K('k.eight-strokes'),
        gateMode: 'disable',
        effects: [give('logbook.vance') ],
        goto: 'vance.recorder.give',
      }),
      silence('vance.recorder.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.recorder.stop',
    speaker: '万斯',
    text: '［停顿］可以。\n［停顿］停了以后，就没有人知道你走到哪了。你要这个吗。',
    corruptedText: cor([40, '［停顿］可以。停了以后你就不存在了。你要这个吗。']),
    tags: ['key'],
    choices: [
      c({
        id: 'vance.recorder.stop.yes',
        label: '"要。"',
        cost: 2,
        irreversible: true,
        effects: [mark('silence', 3), mark('apostasy', 1), san(4)],
        goto: 'vance.stopped',
      }),
      c({
        id: 'vance.recorder.stop.no',
        label: '"不要。"',
        cost: 2,
        effects: [mark('listening', 2)],
        goto: 'vance.kept',
      })
    ],
  },
  {
    id: 'vance.stopped',
    speaker: '万斯',
    text: '记录停止。\n［停顿］这一分钟是你的。用它做点什么。',
    corruptedText: cor([40, '记录停止。这一分钟没人在看。你不知道该做什么。']),
    tags: ['key'],
    onEnter: [setf('know.unrecorded-minute')],
    choices: [go('vance.stopped.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.kept',
    speaker: '万斯',
    text: '明智。\n［停顿］被记录的人比没被记录的人活得久。这是统计，不是安慰。',
    tags: ['key'],
    choices: [go('vance.kept.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.recorder.give',
    speaker: '万斯',
    text: '簿子在声呐室桌上，左边第二格。我不锁门。\n［停顿］我从来没锁过门。',
    corruptedText: cor([40, '簿子在桌上。门没锁。门一直没锁。你上次也没进去。']),
    tags: ['key'],
    onEnter: [setf('know.sonar-unlocked')],
    choices: [go('vance.recorder.give.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.off',
    speaker: undefined,
    text: '你关掉了。\n关掉之后，载波底噪还在。你的耳机是无源的。',
    corruptedText: cor([40, '你关掉了。底噪还在。你的耳机不需要电。']),
    tags: ['key'],
    onEnter: [sfx('radio.carrier'), fear(8)],
    choices: [
      c({
        id: 'vance.off.on',
        label: '再打开。',
        cost: 2,
        effects: [mark('silence', -1)],
        goto: 'vance.channel',
      }),
      c({
        id: 'vance.off.leave',
        label: '摘下耳机。',
        cost: 2,
        effects: [mark('silence', 2) ],
        goto: 'vance.removed',
      })
    ],
  },
  {
    id: 'vance.removed',
    speaker: undefined,
    text: '摘下来之后，声音小了，但没有停。\n它现在在下颌骨那边。',
    corruptedText: cor([40, '摘下来之后声音没有停。它换到了骨头里，音质更好。']),
    tags: ['key'],
    onEnter: [san(-6), setf('know.bone-conduction')],
    choices: [
      c({
        id: 'vance.removed.wear',
        label: '戴回去。',
        cost: 2,        goto: 'vance.channel',
      }),
      c({
        id: 'vance.removed.keep',
        label: '不戴了。',
        effects: [mark('silence', 1) ],
      })
    ],
  },
  {
    id: 'vance.final',
    speaker: '万斯',
    text: '窗口……过了。\n［停顿］按住按钮。求你按住。',
    corruptedText: cor([40, '窗口过了。［停顿］按住按钮。我需要有人听见我。']),
    tags: ['entry', 'key'],
    onEnter: [sfx('radio.squelch')],
    choices: [
      c({
        id: 'vance.final.hold',
        label: '按住。',
        cost: 4,
        effects: [mark('listening', 1), san(-4)],
        goto: 'vance.final.held',
      }),
      c({
        id: 'vance.final.release',
        label: '松手。',
        cost: 1,
        irreversible: true,
        effects: [mark('silence', 3)],
        goto: 'vance.final.released',
      })
    ],
  },
  {
    id: 'vance.final.held',
    speaker: '万斯',
    text: '［停顿］\n谢谢。第八栏的表头我填了。填的是你的名字。',
    corruptedText: cor([40, '［停顿］谢谢。表头填的是你的名字。名字是一个动词。']),
    tags: ['key'],
    onEnter: [setf('know.header-is-your-name'), san(-8)],
    choices: [
      c({
        id: 'vance.final.held.no',
        label: '"擦掉。"',
        cost: 3,
        requires: K('k.pen-can-stop'),
        gateMode: 'disable',
        effects: [mark('apostasy', 2)],
        goto: 'vance.final.erase',
      }),
      silence('vance.final.held.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.final.erase',
    speaker: '万斯',
    text: '［停顿］我擦不掉。我只有笔。\n［停顿］你有别的东西。',
    corruptedText: cor([40, '［停顿］我擦不掉。我只有笔。你有月池。']),
    tags: ['key'],
    onEnter: [setf('know.moonpool-is-eraser')],
    choices: [go('vance.final.erase.ok', '……', 'vance.channel')],
  },
  {
    id: 'vance.final.released',
    speaker: undefined,
    text: '你松了手。载波断在一个字的中间。\n那个字的前半是"别"。',
    corruptedText: cor([40, '你松了手。那个字的前半是"别"。后半你已经知道了。']),
    tags: ['key'],
    onEnter: [sfx('silence.total') ],
    choices: [
      c({
        id: 'vance.final.released.guess',
        label: '把后半补上。',
        cost: 2,
        requires: on('know.dont-count'),
        gateMode: 'disable',
        effects: [san(-4)],
        goto: 'vance.final.dont',
      }),
      silence('vance.final.released.silent', 'vance.channel')
    ],
  },
  {
    id: 'vance.final.dont',
    speaker: undefined,
    text: '别数。\n和补板上一样。所以那三个字不是他刻的——他只会说。',
    tags: ['key'],
    onEnter: [setf('know.plate-not-vance')],
    choices: [go('vance.final.dont.ok', '……', 'vance.channel')],
  }
];
