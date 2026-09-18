/**
 * 谎言节点 —— gateMode: 'lie' 的落点。
 *
 * 机制（见 engine.ts swallowLie）：玩家点了一个他其实没有资格点的选项。
 * 系统不拦他。呼吸照付，噪音照发，然后把手收回来。
 *
 * 写法纪律：
 *   1. 不解释"你做不到"。只描述身体实际做了什么，以及**谁看见了**。
 *   2. 每个谎言都要让玩家学到一点真东西 —— 谎言是本作最诚实的信息源。
 *   3. 一句到三句。超过三句就变成教训，教训不恐怖。
 *
 * 命名约定：lie.<choiceId>（engine 优先找 lie.<nodeId>::<choiceId>，其次 lie.<choiceId>，
 * 最后随机取一个带 'lie-generic' 标签的）。
 */

import type { NarrativeNode } from '../../core/contract';
import { addf, c, cor, fear, go, mark, san, setf, sfx, silence } from '../../narrative/dsl';

export const LIE_NODES: readonly NarrativeNode[] = [
  // ----------------------------------------------------------------- 序章三则
  {
    id: 'lie.pro.wake.remember',
    speaker: undefined,
    text: '你想起来了：码头、缆绳、有人递给你一个保温杯。\n［停顿］保温杯是蓝的。这条船上没有蓝色的东西。',
    corruptedText: cor([40, '你想起来了。保温杯是蓝的。这条船上没有蓝色。你刚才自己造了一段。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), setf('did.caught-own-memory'), san(-4)],
    choices: [
      c({
        id: 'lie.pro.wake.remember.own',
        label: '这是我自己编的。',
        cost: 2,
        effects: [setf('know.memory-is-fabricated'), mark('silence', 1)],
        goto: 'pro.wake',
      }),
      c({
        id: 'lie.pro.wake.remember.keep',
        label: '不管，就当真的。',
        cost: 2,
        effects: [setf('did.kept-false-memory'), san(4), mark('listening', 1)],
        goto: 'pro.wake',
      }),
    ],
  },
  {
    id: 'lie.choir.close.touch',
    speaker: undefined,
    text: '手指摸过喉结，往下一点，摸到一道横的。\n［停顿］那是面罩的密封圈压出来的印。还没有消。',
    corruptedText: cor(
      [40, '摸到一道横的。是密封圈压的。你今天还没戴过面罩。'],
      [18, '摸到一道横的。缝口朝外，和他们一样。你摸了第二遍，确认了朝向。'],
    ),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-6), fear(10)],
    choices: [
      c({
        id: 'lie.choir.close.touch.count',
        label: '数自己的呼吸，数到能确定为止。',
        cost: 3,
        effects: [addf('count.breaths-counted', 2), mark('listening', 1)],
        goto: 'choir.close',
      }),
      silence('lie.choir.close.touch.drop', 'choir.close', '把手放下。')
    ],
  },
  {
    id: 'lie.pro.plate.dig',
    speaker: undefined,
    text: '指甲抠进刻痕，抠出一点铝屑。\n刻痕下面还是铝。没有第二层。',
    corruptedText: cor([40, '抠出一点铝屑。下面还是铝。你抠的是自己的指甲。']),
    tags: ['lie'],
    onEnter: [addf('count.lies-caught', 1), fear(6), setf('did.dug-at-plate')],
    choices: [go('lie.pro.plate.dig.back', '收手。', 'pro.plate')],
  },
  {
    id: 'lie.pro.threshold.count',
    speaker: undefined,
    text: '一、二、三——\n［停顿］第四下你听见的是自己的心跳，不是船。从第一下起就是。',
    corruptedText: cor([40, '一、二、三。第四下是心跳。从第一下起就是。你数的一直是自己。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), addf('count.breaths-counted', 4), san(-6), fear(8)],
    choices: [
      c({
        id: 'lie.pro.threshold.count.stop',
        label: '停下。',
        cost: 2,
        effects: [mark('silence', 1), setf('did.stopped-counting-early')],
        goto: 'pro.threshold',
      }),
      c({
        id: 'lie.pro.threshold.count.on',
        label: '继续数。',
        cost: 4,
        effects: [addf('count.breaths-counted', 8), san(-8), mark('listening', 1)],
        goto: 'pro.threshold',
      }),
    ],
  },
  {
    id: 'lie.hub.recall.layer5',
    speaker: undefined,
    text: '你张嘴，准备把最下面那一层说出来。\n［停顿］你说出来的是上一层。最下面那一层你还没有资格知道，所以你的嘴替你改了口。',
    corruptedText: cor([40, '你说出来的是上一层。你的嘴替你改了口。它比你懂规矩。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-6), setf('did.overreached-recall')],
    choices: [go('lie.hub.recall.layer5.back', '重新过一遍。', 'hub.recall')],
  },

  // ------------------------------------------------------------------- 万斯三则
  {
    id: 'lie.vance.columns.ask8',
    speaker: '万斯',
    text: '［停顿］\n你刚才说的不是"哪八栏"。你说的是"第几栏是我"。\n［停顿］按住按钮。你松手了。',
    corruptedText: cor([40, '你说的是"第几栏是我"。按住按钮。你松手了。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-8), fear(10), sfx('radio.squelch')],
    choices: [
      c({
        id: 'lie.vance.columns.ask8.deny',
        label: '"我没那么说。"',
        cost: 2,
        effects: [addf('count.denied-self', 1), san(-4)],
        goto: 'vance.columns',
      }),
      silence('lie.vance.columns.ask8.silent', 'vance.columns'),
    ],
  },
  {
    id: 'lie.vance.channel.logbook',
    speaker: '万斯',
    text: '"值班簿？"\n［停顿］"我这边没有值班簿。"\n［停顿］翻纸的声音持续了两秒才停。',
    corruptedText: cor([40, '"我这边没有值班簿。"翻纸的声音持续了两秒才停。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), setf('know.vance-paper-sound'), fear(8), san(-4)],
    choices: [
      c({
        id: 'lie.vance.channel.logbook.paper',
        label: '"那刚才是什么声音。"',
        cost: 3,
        effects: [setf('did.called-out-paper'), addf('count.caught-vance', 1)],
        goto: 'vance.channel',
      }),
      silence('lie.vance.channel.logbook.silent', 'vance.channel'),
    ],
  },
  {
    id: 'lie.vance.logbook.read.eighth',
    speaker: '万斯',
    text: '"第八栏——"\n［停顿］"——我念不出来。表头那格是空的，空的念不出来。"\n［停顿］"你念给我听。"',
    corruptedText: cor([40, '"表头那格是空的，空的念不出来。你念给我听。"']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-8), fear(12)],
    choices: [
      c({
        id: 'lie.vance.logbook.read.eighth.no',
        label: '"我不念。"',
        cost: 3,
        effects: [mark('silence', 2), setf('did.refused-to-name-eighth')],
        goto: 'vance.logbook.read',
      }),
      c({
        id: 'lie.vance.logbook.read.eighth.try',
        label: '试着念。',
        cost: 5,
        effects: [mark('listening', 2), san(-10), setf('did.tried-to-name-eighth')],
        goto: 'vance.logbook.read',
      }),
    ],
  },

  // ------------------------------------------------------------------- 母亲一则
  {
    id: 'lie.mother.pa.door',
    speaker: '广播',
    text: '（咔）门我关了。\n［停顿］走廊那头的门还是开着的。你能看见它开着。',
    corruptedText: cor([40, '（咔）门我关了。走廊那头的门还是开着。这句话是她二十天前说的。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), setf('know.door-claim-false'), san(-6), sfx('mother.tone')],
    choices: [
      c({
        id: 'lie.mother.pa.door.ask',
        label: '"哪扇门。"',
        cost: 2,
        effects: [setf('did.asked-which-door'), addf('count.caught-mother', 1)],
        goto: 'mother.pa',
      }),
      silence('lie.mother.pa.door.silent', 'mother.pa'),
    ],
  },

  // ------------------------------------------------------------------- 多恩三则
  {
    id: 'lie.dorn.teeth.mine',
    speaker: '多恩',
    text: '你把自己的牙对上去。\n［停顿］"不是你的。"\n［停顿］"你的牙比这个整。你还年轻。这次。"',
    corruptedText: cor([40, '"不是你的。你的牙比这个整。你还年轻。这次。"']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-8), fear(10)],
    choices: [
      c({
        id: 'lie.dorn.teeth.mine.this',
        label: '"这次是什么意思。"',
        cost: 3,
        effects: [setf('did.asked-this-time'), san(-6)],
        goto: 'dorn.teeth',
      }),
      silence('lie.dorn.teeth.mine.silent', 'dorn.teeth'),
    ],
  },
  {
    id: 'lie.dorn.chair.kill',
    speaker: '多恩',
    text: '你的手伸到一半，停了。\n［停顿］"你下不了手，因为你还想让我说下去。"\n［停顿］"报水位。"',
    corruptedText: cor([40, '"你下不了手，因为你还想让我说下去。报水位。"']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-6), fear(8)],
    choices: [
      c({
        id: 'lie.dorn.chair.kill.report',
        label: '报水位。',
        cost: 2,
        effects: [addf('count.reported-water', 1), mark('silence', 1)],
        goto: 'dorn.chair',
      }),
      go('lie.dorn.chair.kill.back', '把手收回来。', 'dorn.chair'),
    ],
  },
  {
    id: 'lie.dorn.whichChair.name',
    speaker: '多恩',
    text: '你说了一个名字。\n［停顿］"那不是名字。那是编号。"\n［停顿］"编号我记得。名字我不记得了，对不起。"',
    corruptedText: cor([40, '"那不是名字，那是编号。编号我记得。名字我不记得了，对不起。"']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-8), setf('know.dorn-forgot-names')],
    choices: [go('lie.dorn.whichChair.name.back', '……', 'dorn.whichChair')],
  },

  // ----------------------------------------------------------------- 唱诗班一则
  {
    id: 'lie.choir.twenty.hers',
    speaker: '唱诗班',
    text: '你在那半拍里填了别人的名字。\n［停顿］六个人一起停了。停的时间比半拍长。\n然后他们从"第一"开始重唱。',
    corruptedText: cor([40, '你填了别人的名字。他们停了。然后从"第一"开始重唱。你欠了一整轮。']),
    tags: ['lie', 'key'],
    onEnter: [
      addf('count.lies-caught', 1),
      setf('did.gave-false-name'),
      mark('listening', 2),
      san(-12),
      fear(16),
      sfx('choir.break'),
    ],
    choices: [
      c({
        id: 'lie.choir.twenty.hers.wait',
        label: '等他们唱回第二十。',
        cost: 10,
        effects: [addf('count.choir-time', 2), san(-8), mark('listening', 1)],
        goto: 'choir.twenty',
      }),
      c({
        id: 'lie.choir.twenty.hers.leave',
        label: '走。',
        cost: 3,
        effects: [mark('silence', 1), setf('did.fled-choir')],
        goto: 'choir.twenty',
      }),
    ],
  },

  // ------------------------------------------------------------------- 佩勒二则
  {
    id: 'lie.pelle.blueprint.ask',
    speaker: '管道里',
    text: '［停顿］\n"图纸？"\n［停顿］"我没有说图纸。是你说的。"',
    corruptedText: cor([40, '"我没有说图纸。是你说的。"他没有说过图纸。这次没有。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), setf('know.pelle-never-said-blueprint'), san(-8), fear(10)],
    choices: [
      c({
        id: 'lie.pelle.blueprint.ask.before',
        label: '"你上次说过。"',
        cost: 3,
        effects: [setf('did.cited-last-time'), san(-6)],
        goto: 'pelle.blueprint',
      }),
      silence('lie.pelle.blueprint.ask.silent', 'pelle.blueprint'),
    ],
  },
  {
    id: 'lie.pelle.pipe.zero',
    speaker: '管道里',
    text: '［停顿］\n"零号我不去。"\n［停顿］"你也还不能去。你少一样东西，你自己知道少哪一样。"',
    corruptedText: cor([40, '"你少一样东西，你自己知道少哪一样。"']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-6), setf('know.zero-needs-something')],
    choices: [go('lie.pelle.pipe.zero.back', '……', 'pelle.pipe')],
  },

  // --------------------------------------------------------------- 你自己一则
  {
    id: 'lie.self.log.index.count',
    speaker: undefined,
    text: '你去数写满的行数。\n［停顿］数到第九行的时候，第九行写的是"数到第九行"。\n你的手停了。',
    corruptedText: cor([40, '第九行写的是"数到第九行"。你的手停了。停也写在第十行。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), fear(18), san(-12), setf('did.hit-the-recursion')],
    choices: [
      c({
        id: 'lie.self.log.index.count.tenth',
        label: '看第十行。',
        cost: 4,
        effects: [setf('did.read-tenth-line'), san(-10), fear(12)],
        goto: 'self.log.index',
      }),
      c({
        id: 'lie.self.log.index.count.close',
        label: '合上日志。',
        cost: 2,
        effects: [mark('silence', 1), setf('did.closed-the-log')],
        goto: 'self.log.index',
      }),
    ],
  },

  // --------------------------------------------------------------- 舱室与档案
  {
    id: 'lie.doc.archive.locked',
    speaker: undefined,
    text: '你去撬锁。手里没有东西可用，指甲翻了一片。\n锁没有动。锁上的漆连划痕都没多一道。',
    corruptedText: cor([40, '指甲翻了一片。锁上连划痕都没多一道。这一下你做过十七次。']),
    tags: ['lie'],
    onEnter: [addf('count.lies-caught', 1), addf('count.futile-acts', 1), fear(6), san(-4)],
    choices: [go('lie.doc.archive.locked.back', '算了。', 'doc.archive')],
  },
  {
    id: 'lie.room.moonpool.speak',
    speaker: undefined,
    text: '你张嘴，发出的是一个你不认识的音。\n［停顿］水面没有反应。你说的不是那个字。\n你还不知道那个字怎么念。',
    corruptedText: cor([40, '水面没有反应。你说的不是那个字。你还不知道它怎么念。但你差得不多了。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-6), fear(10), setf('know.mispronounced')],
    choices: [go('lie.room.moonpool.speak.back', '闭嘴。', 'room.moonpool')],
  },
  {
    id: 'lie.room.trunk.pieces.rebuild',
    speaker: undefined,
    text: '你把第一段梯子举到断口的高度，手里没有工具。\n举了很久，胳膊开始抖。然后你把它放回原位，摆正。',
    corruptedText: cor([40, '举了很久，胳膊抖了。你把它放回原位，摆正。摆正这件事你很熟。']),
    tags: ['lie'],
    onEnter: [addf('count.lies-caught', 1), addf('count.futile-acts', 1), san(-6)],
    choices: [go('lie.room.trunk.pieces.rebuild.back', '放下。', 'room.trunk.pieces')],
  },

  // ----------------------------------------------------------------- 仪式三则
  {
    id: 'lie.rit.manual.three',
    speaker: undefined,
    text: '你翻到第三部分。\n［停顿］第三部分是空白的。页码连着，纸没有被撕过。\n它本来就是空的，等着被填。',
    corruptedText: cor([40, '第三部分是空白的。纸没被撕过。它等着被填。笔在你身上。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), san(-8), fear(10), setf('know.part-three-blank')],
    choices: [go('lie.rit.manual.three.back', '合上手册。', 'rit.manual')],
  },
  {
    id: 'lie.rit.tide.chest.hold',
    speaker: undefined,
    text: '你屏住气。\n［停顿］手册第一行写着：不要屏气。\n你屏了十二秒，然后吸了一口，吸到的是水和空气的混合物。',
    corruptedText: cor([40, '你屏了十二秒。吸到的是水和空气的混合物。混合物的比例正好。']),
    tags: ['lie', 'key'],
    onEnter: [
      addf('count.lies-caught', 1),
      mark('drowned', 1),
      san(-10),
      fear(16),
      setf('did.failed-to-hold'),
    ],
    choices: [go('lie.rit.tide.chest.hold.back', '咳。', 'rit.tide.chest')],
  },
  {
    id: 'lie.rit.relic.open.eat',
    speaker: undefined,
    text: '你把它举到嘴边。\n［停顿］它是凉的，凉得让你的牙发酸。你的手自己停在了两指的距离上。\n［停顿］不是你停的。',
    corruptedText: cor([40, '你的手停在两指的距离上。不是你停的。你还缺一步。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), fear(20), san(-12), setf('know.hand-stopped-itself')],
    choices: [
      c({
        id: 'lie.rit.relic.open.eat.why',
        label: '谁停的。',
        cost: 3,
        effects: [setf('did.asked-who-stopped-hand'), san(-8)],
        goto: 'rit.relic.open',
      }),
      go('lie.rit.relic.open.eat.back', '把它放回去。', 'rit.relic.open'),
    ],
  },

  // -------------------------------------------------------- 通用兜底（三个）
  {
    id: 'lie.generic.hands',
    speaker: undefined,
    text: '你的手做了那个动作。\n［停顿］你的手没有做那个动作。',
    corruptedText: cor([40, '你的手做了那个动作。你的手没有做那个动作。两句都是真的。']),
    tags: ['lie-generic'],
    onEnter: [addf('count.lies-caught', 1), san(-4), fear(6)],
    choices: [c({ id: 'lie.generic.hands.ok', label: '……', cost: 1 })],
  },
  {
    id: 'lie.generic.breath',
    speaker: undefined,
    text: '那口气已经花掉了。\n［停顿］花掉的部分是真的，做到的部分不是。',
    corruptedText: cor([40, '那口气已经花掉了。花掉的部分是真的。']),
    tags: ['lie-generic'],
    onEnter: [addf('count.lies-caught', 1), san(-4)],
    choices: [c({ id: 'lie.generic.breath.ok', label: '……', cost: 1 })],
  },
  {
    id: 'lie.generic.witness',
    speaker: undefined,
    text: '什么都没发生。\n［停顿］但是走廊那头的点名停了半拍，然后接上了。',
    corruptedText: cor([40, '什么都没发生。点名停了半拍，然后接上了。它记下了这一次。']),
    tags: ['lie-generic'],
    onEnter: [addf('count.lies-caught', 1), fear(8), mark('listening', 1)],
    choices: [c({ id: 'lie.generic.witness.ok', label: '……', cost: 1 })],
  },
];
