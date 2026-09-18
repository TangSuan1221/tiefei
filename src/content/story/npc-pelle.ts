/**
 * 佩勒 PELLE —— 管道里的小孩的声音。船员名单上没有小孩。
 *
 * 核心张力（GDD §7.2）：名单上没有小孩。
 * 真相（L4）：训练动物走迷宫时，会先放一只已经会走的进去。他是先放进去的那只。
 *
 * 剧作位置（契诃夫 C6 边缘人说主题）：全剧最重的一句话由他随口说出，
 * 而且是用一个小孩玩游戏的口气说的。玩家当时不会明白，后面才会。
 *
 * 口头禅：「这里有回声。」
 * 他知道所有舱室的名字，但顺序是反的——他是从图纸上学的，没有走过。
 * 他不说的话：他为什么从来不出来。
 */

import type { NarrativeNode } from '../../core/contract';
import {
  addf,
  all,
  any,
  c,
  cor,
  fear,
  fight,
  give,
  go,
  item,
  K,
  learn,
  loud,
  mark,
  noK,
  num,
  off,
  on,
  san,
  setf,
  sfx,
  silence,
  status,
  take,
} from '../../narrative/dsl';

export const PELLE_NODES: readonly NarrativeNode[] = [
  {
    id: 'pelle.first',
    speaker: '管道里',
    text: '这里有回声。\n你敲一下，我就知道你在哪一格。',
    corruptedText: cor(
      [50, '这里有回声。你敲一下我就知道你在哪一格。你不敲我也知道。'],
      [20, '这里有回声。回声是我。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('met.pelle'), sfx('pelle.hum'), addf('count.pelle-talks', 1)],
    choices: [
      c({
        id: 'pelle.first.knock',
        label: '敲一下。',
        cost: 1,
        effects: [loud(5), sfx('pipe.knock')],
        goto: 'pelle.knocked',
      }),
      c({
        id: 'pelle.first.who',
        label: '"你是谁。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.who',
      }),
      c({
        id: 'pelle.first.name',
        label: '报自己的名字。',
        cost: 2,
        irreversible: true,
        effects: [setf('did.told-pelle-name'), mark('listening', 1)],
        goto: 'pelle.named',
      }),
      silence('pelle.first.silent', 'pelle.silent')
    ],
  },
  {
    id: 'pelle.knocked',
    speaker: '管道里',
    text: '第三格。\n你比上一个快。上一个敲了四下才敲对。',
    corruptedText: cor([45, '第三格。你比上一个快。上一个也是你。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-compares')],
    choices: [
      c({
        id: 'pelle.knocked.previous',
        label: '"上一个是谁。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.previous',
      }),
      go('pelle.knocked.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.previous',
    speaker: '管道里',
    text: '穿一样的衣服。\n走路的声音也一样，右脚重一点。',
    corruptedText: cor([45, '穿一样的衣服。右脚重一点。你现在右脚也重一点。']),
    tags: ['key'],
    onEnter: [san(-6), setf('know.same-footfall')],
    choices: [
      c({
        id: 'pelle.previous.foot',
        label: '听自己的脚步。',
        cost: 2,
        effects: [san(-4)],
        goto: 'pelle.ownSteps',
      }),
      go('pelle.previous.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.ownSteps',
    speaker: undefined,
    text: '右脚重一点。\n你不记得自己有伤。',
    corruptedText: cor([40, '右脚重一点。你不记得有伤。伤在别人身上，脚步学过来了。']),
    tags: ['key'],
    choices: [go('pelle.ownSteps.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.who',
    speaker: '管道里',
    text: '佩勒。\n你数到十，我就告诉你下一个舱叫什么。',
    corruptedText: cor([45, '佩勒。你数到十。数到十我就告诉你。（他没说他是谁。）']),
    tags: ['key'],
    onEnter: [setf('know.pelle-name')],
    choices: [
      c({
        id: 'pelle.who.count',
        label: '数到十。',
        cost: 4,
        effects: [
          addf('count.pelle-games', 1),
          addf('count.breaths-counted', 10),
          mark('listening', 1)
        ],
        goto: 'pelle.counted',
      }),
      c({
        id: 'pelle.who.refuse',
        label: '"我不数。"',
        cost: 2,
        requires: on('know.dont-count'),
        gateMode: 'hide',
        effects: [mark('silence', 2), san(4)],
        goto: 'pelle.refusedCount',
      }),
      go('pelle.who.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.counted',
    speaker: '管道里',
    text: '下一个舱叫压载三。\n［停顿］不对，是配电。我说反了。',
    corruptedText: cor([45, '下一个舱叫压载三。不对，是配电。我总是说反。']),
    tags: ['key'],
    onEnter: [addf('count.rooms-named', 1), setf('know.pelle-mixes-order')],
    choices: [
      c({
        id: 'pelle.counted.again',
        label: '再来一次。',
        cost: 4,
        effects: [addf('count.pelle-games', 1), addf('count.rooms-named', 1), addf('count.breaths-counted', 10)],
        goto: 'pelle.counted2',
      }),
      c({
        id: 'pelle.counted.why',
        label: '"你为什么会说反。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.reversed',
      })
    ],
  },
  {
    id: 'pelle.counted2',
    speaker: '管道里',
    text: '再下一个是医务室。\n［停顿］不对。医务室在上面。我从上面往下数的。',
    corruptedText: cor([45, '医务室在上面。我从上面往下数。图上是这么排的。']),
    tags: ['key'],
    onEnter: [addf('count.rooms-named', 1)],
    choices: [
      c({
        id: 'pelle.counted2.map',
        label: '"你在看图。"',
        cost: 2,
        requires: num('count.rooms-named', '>=', 2),
        gateMode: 'disable',
        effects: [learn('k.pelle-not-on-list'), setf('know.pelle-has-blueprint')],
        goto: 'pelle.blueprint',
      }),
      go('pelle.counted2.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.reversed',
    speaker: '管道里',
    text: '因为我是从图上学的。\n［停顿］图上最上面是月池。真的船里月池在最下面。',
    corruptedText: cor([45, '因为我是从图上学的。图上月池在最上面。图是反着挂的。']),
    tags: ['key'],
    onEnter: [learn('k.pelle-not-on-list'), setf('know.pelle-has-blueprint')],
    choices: [
      c({
        id: 'pelle.reversed.walked',
        label: '"你没走过这条船。"',
        cost: 2,        goto: 'pelle.neverWalked',
      }),
      go('pelle.reversed.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.blueprint',
    speaker: '管道里',
    text: '图在我这儿。\n［停顿］图上有一个舱，你们的图上没有。',
    corruptedText: cor([45, '图在我这儿。图上多一个舱。多的那个我最熟。']),
    tags: ['key'],
    onEnter: [setf('know.extra-room-on-blueprint')],
    choices: [
      c({
        id: 'pelle.blueprint.which',
        label: '"哪一个。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.zeroRoom',
      }),
      c({
        id: 'pelle.blueprint.ask',
        label: '"给我。"',
        cost: 3,
        requires: on('did.gave-whistle'),
        gateMode: 'lie',
        effects: [give('chart.zero'), setf('did.got-chart')],
        goto: 'pelle.gaveChart',
      })
    ],
  },
  {
    id: 'pelle.zeroRoom',
    speaker: '管道里',
    text: '没有名字的那个。\n［停顿］我是从那儿出来的。',
    corruptedText: cor([45, '没有名字的那个。我是从那儿出来的。你也是。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-came-from-zero'), san(-6)],
    choices: [
      c({
        id: 'pelle.zeroRoom.how',
        label: '"你怎么出来的。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.gotOut',
      }),
      go('pelle.zeroRoom.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.gotOut',
    speaker: '管道里',
    text: '这里有回声。\n［停顿］你敲一下。',
    corruptedText: cor([40, '这里有回声。你敲一下。（他换了话题。他每次都在这里换话题。）']),
    tags: ['key'],
    onEnter: [setf('know.pelle-dodges-this')],
    choices: [
      c({
        id: 'pelle.gotOut.knock',
        label: '敲。',
        cost: 1,
        effects: [loud(5), addf('count.knocks', 1), sfx('pipe.knock')],
        goto: 'pelle.pipe',
      }),
      c({
        id: 'pelle.gotOut.press',
        label: '"我问你怎么出来的。"',
        cost: 3,
        effects: [addf('count.pressed-pelle', 1), addf('count.questions', 1)],
        goto: 'pelle.gotOut2',
      })
    ],
  },
  {
    id: 'pelle.gotOut2',
    speaker: '管道里',
    text: '［停顿］\n门是开着的。他们不锁门。',
    corruptedText: cor([45, '［停顿］门是开着的。他们不锁门。锁门的话就没意思了。']),
    tags: ['key'],
    onEnter: [setf('know.doors-unlocked')],
    choices: [
      c({
        id: 'pelle.gotOut2.why',
        label: '"那你为什么不出来。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.whyStay',
      }),
      silence('pelle.gotOut2.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.whyStay',
    speaker: '管道里',
    text: '管道里凉。\n［停顿］外面要走路。',
    corruptedText: cor([45, '管道里凉。外面要走路。走路会被记下来。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-avoids-walking')],
    choices: [go('pelle.whyStay.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.neverWalked',
    speaker: '管道里',
    text: '走过。\n［停顿］走过很多遍，可是每次的图都不一样，所以我记的还是图。',
    corruptedText: cor([45, '走过很多遍。每次图都不一样。所以我只记图，不记路。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-walked-many-times'), san(-5)],
    choices: [
      c({
        id: 'pelle.neverWalked.many',
        label: '"很多遍是几遍。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.howMany',
      }),
      go('pelle.neverWalked.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.howMany',
    speaker: '管道里',
    text: '我在管子上画道。\n［停顿］画到十七就画不下了，管子弯了。',
    corruptedText: cor([45, '我在管子上画道。画到十七管子就弯了。第十八道我画在外面。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-tally'), san(-6)],
    choices: [
      c({
        id: 'pelle.howMany.look',
        label: '在管道外面找那些道。',
        cost: 4,
        effects: [san(-6)],
        goto: 'pelle.tally',
      }),
      go('pelle.howMany.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.tally',
    speaker: undefined,
    text: '管道外壁上十七道横线，用什么硬东西划的。\n第十八道在管道内侧，你只能摸到。',
    corruptedText: cor([40, '十七道在外面，第十八道在里面。里面那道是热的。']),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-8)],
    choices: [
      c({
        id: 'pelle.tally.feel',
        label: '摸第十八道。',
        cost: 3,
        effects: [san(-8), fear(14)],
        goto: 'pelle.eighteenth',
      }),
      go('pelle.tally.hub', '不摸。', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.eighteenth',
    speaker: '管道里',
    text: '别摸那道。\n［停顿］还没画完。',
    corruptedText: cor([45, '别摸那道。还没画完。画完了你就得走了。']),
    tags: ['key'],
    onEnter: [setf('know.line-unfinished'), san(-6)],
    choices: [
      c({
        id: 'pelle.eighteenth.finish',
        label: '"画完会怎么样。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.ifFinished',
      }),
      silence('pelle.eighteenth.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.ifFinished',
    speaker: '管道里',
    text: '画完就没有人陪我玩了。\n［停顿］所以我数到八就停。',
    corruptedText: cor([45, '画完就没有人陪我玩了。所以我数到八就停。每次都停在八。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-stops-at-eight'), san(-8)],
    choices: [
      c({
        id: 'pelle.ifFinished.eight',
        label: '"为什么是八。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.eight',
      }),
      silence('pelle.ifFinished.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.eight',
    speaker: '管道里',
    text: '因为画到一半的画不算画。\n［停顿］你数到十，我数到八。这样就一直有人玩。',
    corruptedText: cor([45, '画到一半的画不算画。你数到十，我数到八。差两个，永远差两个。']),
    tags: ['key'],
    onEnter: [setf('know.half-drawing'), san(-6)],
    choices: [
      c({
        id: 'pelle.eight.understand',
        label: '差一笔的字不是字。',
        cost: 3,
        requires: all(K('k.author-is-not-it'), K('k.pelle-is-a-guide')),
        gateMode: 'disable',
        effects: [learn('k.pen-can-stop')],
        goto: 'pelle.penStops',
      }),
      go('pelle.eight.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.penStops',
    speaker: '管道里',
    text: '对。\n［停顿］可是你每次都画完。',
    corruptedText: cor([45, '对。可是你每次都画完。你画得很好看。这是坏事。']),
    tags: ['key'],
    onEnter: [learn('k.pen-can-stop'), san(-10)],
    choices: [
      c({
        id: 'pelle.penStops.promise',
        label: '"这次我不画完。"',
        cost: 3,
        irreversible: true,
        effects: [setf('know.promised-pelle'), mark('silence', 2)],
        goto: 'pelle.promised',
      }),
      silence('pelle.penStops.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.promised',
    speaker: '管道里',
    text: '［停顿］\n那你去月池的时候，数到七就停。',
    corruptedText: cor([45, '［停顿］数到七就停。七不好看。七最好。']),
    tags: ['key'],
    onEnter: [setf('know.stop-at-seven'), san(4)],
    choices: [go('pelle.promised.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.named',
    speaker: '管道里',
    text: '［停顿］\n我记住了。',
    corruptedText: cor([45, '［停顿］我记住了。我记东西很牢。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-remembers-name'), addf('count.names-given', 1)],
    choices: [
      c({
        id: 'pelle.named.forget',
        label: '"忘掉。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.cannotForget',
      }),
      go('pelle.named.hub', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.cannotForget',
    speaker: '管道里',
    text: '忘不掉。\n［停顿］我忘不掉的东西会跑到礼拜堂去。',
    corruptedText: cor([45, '忘不掉。忘不掉的东西会跑到礼拜堂去。你的已经跑了。']),
    tags: ['key'],
    onEnter: [setf('know.names-go-to-chapel'), san(-6)],
    choices: [
      c({
        id: 'pelle.cannotForget.chapel',
        label: '"礼拜堂里有六个人在唱名字。"',
        cost: 2,
        requires: on('met.choir'),
        gateMode: 'hide',        goto: 'pelle.chapelLink',
      }),
      silence('pelle.cannotForget.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.chapelLink',
    speaker: '管道里',
    text: '七个。\n［停顿］你听的时候是六个，因为第七个在管子里。',
    corruptedText: cor([45, '七个。第七个在管子里。第七个是我。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.pelle-is-seventh')],
    choices: [
      c({
        id: 'pelle.chapelLink.you',
        label: '"你在唱。"',
        cost: 2,        goto: 'pelle.sings',
      }),
      silence('pelle.chapelLink.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.sings',
    speaker: '管道里',
    text: '我只唱第二十行。\n［停顿］前面十九个我不认识。',
    corruptedText: cor([45, '我只唱第二十行。前面十九个我不认识。第二十个我很熟。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.pelle-sings-twentieth')],
    choices: [go('pelle.sings.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.silent',
    speaker: '管道里',
    text: '这里有回声。\n［停顿］不说话也有回声。',
    corruptedText: cor([45, '这里有回声。不说话也有回声。你的呼吸就够了。']),
    tags: ['key'],
    onEnter: [mark('silence', 1)],
    choices: [go('pelle.silent.hub', '……', 'pelle.pipe')],
  },

  // -------------------------------------------------------------------------
  // 管道口中枢
  // -------------------------------------------------------------------------
  {
    id: 'pelle.pipe',
    speaker: '管道里',
    text: '这里有回声。',
    corruptedText: cor(
      [50, '这里有回声。（他在管道里换了位置，声音从另一边来。）'],
      [20, '这里有回声。（管道是实心的。你昨天敲过。）'],
    ),
    tags: ['entry', 'hub', 'key'],
    onEnter: [addf('count.pelle-talks', 1), sfx('pipe.knock')],
    choices: [
      c({
        id: 'pelle.pipe.game',
        label: '"玩数数。"',
        cost: 4,
        effects: [addf('count.pelle-games', 1), addf('count.breaths-counted', 10), mark('listening', 1)],
        goto: 'pelle.game',
      }),
      c({
        id: 'pelle.pipe.age',
        label: '"你几岁。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.age',
      }),
      c({
        id: 'pelle.pipe.parents',
        label: '"你妈妈呢。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.mother',
      }),
      c({
        id: 'pelle.pipe.whistle',
        label: '把哨子递进管道。',
        cost: 3,
        requires: item('whistle.pelle'),
        gateMode: 'disable',
        irreversible: true,
        effects: [take('whistle.pelle'), setf('did.gave-whistle'), addf('count.selfless-acts', 1), san(5)],
        goto: 'pelle.whistleGiven',
      }),
      c({
        id: 'pelle.pipe.crawl',
        label: '爬进管道。',
        cost: 8,
        effects: [san(-8), mark('silence', 1)],
        goto: 'pelle.crawl',
      }),
      c({
        id: 'pelle.pipe.notlist',
        label: '"名单上没有小孩。"',
        cost: 3,
        requires: K('k.manifest-nineteen'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1)],
        goto: 'pelle.notOnList',
      }),
      c({
        id: 'pelle.pipe.guide',
        label: '"他们先放你进来的。"',
        cost: 3,
        requires: all(K('k.pelle-not-on-list'), K('k.ship-is-teaching')),
        gateMode: 'disable',
        effects: [learn('k.pelle-is-a-guide')],
        goto: 'pelle.guide',
      }),
      c({
        id: 'pelle.pipe.lead',
        label: '"带我去月池。"',
        cost: 3,
        requires: on('did.gave-whistle'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1), addf('count.pelle-led', 1)],
        goto: 'pelle.lead',
      }),
      c({
        id: 'pelle.pipe.zero',
        label: '"带我去零号舱。"',
        cost: 4,
        requires: all(on('did.got-chart'), K('k.zero-is-the-berth')),
        gateMode: 'lie',
        effects: [addf('count.questions', 1)],
        goto: 'pelle.zeroLead',
      }),
      c({
        id: 'pelle.pipe.tired',
        label: '"你累不累。"',
        cost: 2,
        requires: K('k.pelle-is-a-guide'),
        gateMode: 'hide',
        effects: [addf('count.questions', 1)],
        goto: 'pelle.tired',
      }),
      c({
        id: 'pelle.pipe.leave',
        label: '走开。',
        cost: 1,        goto: 'pelle.leaving',
      })
    ],
  },
  {
    id: 'pelle.game',
    speaker: '管道里',
    text: '一、二、三、四、五、六、七、八。\n［停顿］你接。',
    corruptedText: cor([45, '一二三四五六七八。［停顿］你接。（他每次都停在八。）']),
    tags: ['key'],
    onEnter: [addf('count.pelle-games', 1)],
    choices: [
      c({
        id: 'pelle.game.nine',
        label: '"九。"',
        cost: 1,
        effects: [mark('listening', 1), addf('count.breaths-counted', 1)],
        goto: 'pelle.nine',
      }),
      c({
        id: 'pelle.game.stop',
        label: '不接。',
        cost: 1,
        effects: [mark('silence', 2), san(3)],
        goto: 'pelle.notNine',
      })
    ],
  },
  {
    id: 'pelle.nine',
    speaker: '管道里',
    text: '十。\n［停顿］完了。再来一次。',
    corruptedText: cor([45, '十。完了。再来一次。（"完了"这两个字他说得很平。）']),
    tags: ['key'],
    onEnter: [setf('know.game-completes'), addf('count.games-finished', 1)],
    choices: [
      c({
        id: 'pelle.nine.again',
        label: '再来一次。',
        cost: 4,
        effects: [addf('count.pelle-games', 1), addf('count.breaths-counted', 10)],
        goto: 'pelle.game',
      }),
      go('pelle.nine.stop', '不玩了。', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.notNine',
    speaker: '管道里',
    text: '［停顿］\n那就停在八。',
    corruptedText: cor([45, '［停顿］那就停在八。停在八好。']),
    tags: ['key'],
    onEnter: [setf('know.stopped-at-eight'), san(4)],
    choices: [go('pelle.notNine.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.age',
    speaker: '管道里',
    text: '这里有回声。\n［停顿］你敲一下。',
    corruptedText: cor([45, '这里有回声。（他不回答年龄。他从来不回答。）']),
    tags: ['key'],    choices: [
      c({
        id: 'pelle.age.press',
        label: '"我问你几岁。"',
        cost: 3,
        effects: [addf('count.pressed-pelle', 1)],
        goto: 'pelle.age2',
      }),
      c({
        id: 'pelle.age.knock',
        label: '敲。',
        cost: 1,
        effects: [loud(5), addf('count.knocks', 1)],
        goto: 'pelle.pipe',
      })
    ],
  },
  {
    id: 'pelle.age2',
    speaker: '管道里',
    text: '［停顿］\n不知道。这里没有生日。',
    corruptedText: cor([45, '［停顿］不知道。这里没有生日。有轮回，没有生日。']),
    tags: ['key'],
    onEnter: [san(-5), setf('know.no-birthdays')],
    choices: [go('pelle.age2.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.mother',
    speaker: '管道里',
    text: '广播里那个。\n［停顿］她问我吃过东西了吗。我每次都说吃过了。',
    corruptedText: cor([45, '广播里那个。她问我吃过东西了吗。我每次都说吃过了。我没有吃过。']),
    tags: ['key'],
    onEnter: [setf('know.pelle-calls-her-mother'), san(-6)],
    choices: [
      c({
        id: 'pelle.mother.real',
        label: '"她不是你妈妈。"',
        cost: 2,
        requires: K('k.mother-was-crew'),
        gateMode: 'disable',
        effects: [addf('count.questions', 1), san(-4)],
        goto: 'pelle.notHisMother',
      }),
      silence('pelle.mother.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.notHisMother',
    speaker: '管道里',
    text: '知道。\n［停顿］可是她会问。',
    corruptedText: cor([45, '知道。可是她会问。没有别人问。']),
    tags: ['key'],
    onEnter: [san(-6), setf('know.she-is-the-only-one-who-asks')],
    choices: [go('pelle.notHisMother.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.whistleGiven',
    speaker: '管道里',
    text: '［停顿］\n这是我的。',
    corruptedText: cor([45, '［停顿］这是我的。我放在她手里的。']),
    tags: ['key'],
    onEnter: [setf('know.whistle-was-his'), san(4)],
    choices: [
      c({
        id: 'pelle.whistleGiven.how',
        label: '"它在礼拜堂第六具的手里。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.whistleWhere',
      }),
      go('pelle.whistleGiven.ok', '……', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.whistleWhere',
    speaker: '管道里',
    text: '嗯。\n［停顿］我放的。放的时候她还在唱。',
    corruptedText: cor([45, '嗯。我放的。放的时候她还在唱。她唱得比现在好。']),
    tags: ['key'],
    onEnter: [san(-6), setf('know.he-was-there')],
    choices: [go('pelle.whistleWhere.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.crawl',
    speaker: undefined,
    text: '管道内径不到六十公分。爬进去十米，声音就停了。\n地上有很多小的划痕，横的，一道一道。',
    corruptedText: cor(
      [45, '爬进去十米，声音就停了。地上的划痕是横的。一共十七道。'],
      [20, '爬进去十米。你的肩膀卡住了。前面有人在等你卡住。'],
    ),
    tags: ['key'],
    onEnter: [san(-8), fear(14) ],
    choices: [
      c({
        id: 'pelle.crawl.on',
        label: '继续爬。',
        cost: 8,
        effects: [san(-10), fear(16)],
        goto: 'pelle.deep',
      }),
      c({
        id: 'pelle.crawl.back',
        label: '退出来。',
        cost: 6,        goto: 'pelle.pipe',
      })
    ],
  },
  {
    id: 'pelle.deep',
    speaker: undefined,
    text: '管道在这里分成三支。三支都有回声。\n三支的回声延迟不一样，中间那支的延迟比管长允许的更长。',
    corruptedText: cor([40, '三支都有回声。中间那支的延迟太长了。中间那支不通向船内。']),
    tags: ['key'],
    onEnter: [setf('know.impossible-pipe')],
    choices: [
      c({
        id: 'pelle.deep.middle',
        label: '走中间那支。',
        cost: 10,
        irreversible: true,
        effects: [san(-12), fight('enc.crawler-pipe')],
        goto: 'pelle.middle',
      }),
      c({
        id: 'pelle.deep.debunk',
        label: '延迟不对。中间那支是幻觉。',
        cost: 3,
        requires: K('k.reweave-has-rule'),
        gateMode: 'disable',
        effects: [addf('count.debunks', 1), san(10) ],
        goto: 'pelle.debunkedPipe',
      }),
      c({
        id: 'pelle.deep.back',
        label: '退出来。',
        cost: 8,        goto: 'pelle.pipe',
      })
    ],
  },
  {
    id: 'pelle.middle',
    speaker: undefined,
    text: '中间那支通到一个很小的舱。舱里有一张床垫，儿童尺寸。\n墙上有一排横线，十七道，第十八道在画。',
    corruptedText: cor([40, '舱里有一张儿童床垫。墙上十七道横线。第十八道正在被画，你看得见它在长。']),
    tags: ['key'],
    onEnter: [san(-14), learn('k.pelle-is-a-guide'), setf('know.found-pelle-berth')],
    choices: [
      c({
        id: 'pelle.middle.mattress',
        label: '摸床垫。',
        cost: 2,
        effects: [san(-8)],
        goto: 'pelle.mattress',
      }),
      c({
        id: 'pelle.middle.back',
        label: '退出来。',
        cost: 10,        goto: 'pelle.pipe',
      })
    ],
  },
  {
    id: 'pelle.mattress',
    speaker: undefined,
    text: '凉的。上面没有凹，一点都没有。\n没有人在这上面睡过。',
    corruptedText: cor([40, '凉的。没有凹。没有人睡过。所以他一直没有躺下。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.he-never-slept')],
    choices: [go('pelle.mattress.ok', '退出来。', 'pelle.pipe')],
  },
  {
    id: 'pelle.debunkedPipe',
    speaker: undefined,
    text: '中间那支是声呐伪影，被你自己的呼吸撑起来的。\n你伸手过去，摸到的是焊死的封板。',
    tags: ['key'],
    onEnter: [san(8)],
    choices: [go('pelle.debunkedPipe.ok', '退出来。', 'pelle.pipe')],
  },
  {
    id: 'pelle.notOnList',
    speaker: '管道里',
    text: '我知道。\n［停顿］名单是给要走的人写的。',
    corruptedText: cor([45, '我知道。名单是给要走的人写的。我不走。']),
    tags: ['key'],
    onEnter: [learn('k.pelle-not-on-list'), setf('know.list-is-for-walkers')],
    choices: [go('pelle.notOnList.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.guide',
    speaker: '管道里',
    text: '［停顿］\n嗯。我先进来，你们跟着。',
    corruptedText: cor([45, '［停顿］嗯。我先进来，你们跟着。这样你们走得快。']),
    tags: ['key'],
    onEnter: [learn('k.pelle-is-a-guide'), san(-8)],
    choices: [
      c({
        id: 'pelle.guide.who',
        label: '"谁教你的。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.whoTaught',
      }),
      silence('pelle.guide.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.whoTaught',
    speaker: '管道里',
    text: '没有人教。\n［停顿］我第一次进来的时候也有一个人在管子里。',
    corruptedText: cor([45, '没有人教。我第一次进来的时候管子里也有一个人。他也叫佩勒。']),
    tags: ['key'],
    onEnter: [san(-10), setf('know.pelle-before-pelle')],
    choices: [go('pelle.whoTaught.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.lead',
    speaker: '管道里',
    text: '往下走，过配电，别进压载三。\n［停顿］压载三的门会自己开，你别进。',
    corruptedText: cor([45, '往下走，过配电，别进压载三。压载三的门会自己开。别进。']),
    tags: ['key'],
    onEnter: [setf('know.avoid-ballast-three') ],
    choices: [
      c({
        id: 'pelle.lead.why',
        label: '"压载三怎么了。"',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'pelle.ballast',
      }),
      go('pelle.lead.ok', '"记住了。"', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.ballast',
    speaker: '管道里',
    text: '里面有一个人在等有人进去。\n［停顿］他穿一样的衣服。',
    corruptedText: cor([45, '里面有人在等。他穿一样的衣服。右脚重一点。']),
    tags: ['key'],
    onEnter: [fear(16), san(-8), setf('know.someone-in-ballast')],
    choices: [go('pelle.ballast.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.zeroLead',
    speaker: '管道里',
    text: '零号舱要你自己找。\n［停顿］我带过一个，他就没出来。',
    corruptedText: cor([45, '零号舱要你自己找。我带过一个，他没出来。他现在在唱。']),
    tags: ['key'],
    onEnter: [setf('know.zero-must-self-find')],
    choices: [go('pelle.zeroLead.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.tired',
    speaker: '管道里',
    text: '这里有回声。',
    corruptedText: cor([45, '这里有回声。（这是他唯一一次用这句话挡一个不该问的问题。）']),
    tags: ['key'],    choices: [
      c({
        id: 'pelle.tired.press',
        label: '"我问你累不累。"',
        cost: 3,
        effects: [addf('count.pressed-pelle', 1), addf('count.questions', 1)],
        goto: 'pelle.tired2',
      }),
      silence('pelle.tired.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.tired2',
    speaker: '管道里',
    text: '［停顿］\n你数到十的时候，我就可以歇一下。',
    corruptedText: cor([45, '［停顿］你数到十的时候我可以歇一下。所以我希望你数。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.counting-lets-him-rest')],
    choices: [
      c({
        id: 'pelle.tired2.count',
        label: '数到十。',
        cost: 4,
        effects: [addf('count.breaths-counted', 10), mark('listening', 1) ],
        goto: 'pelle.rested',
      }),
      c({
        id: 'pelle.tired2.no',
        label: '"我不数。"',
        cost: 2,
        effects: [mark('silence', 2)],
        goto: 'pelle.notRested',
      })
    ],
  },
  {
    id: 'pelle.rested',
    speaker: '管道里',
    text: '［停顿］谢谢。\n［停顿］这里有回声。',
    corruptedText: cor([45, '［停顿］谢谢。（管道里安静了八个呼吸。）［停顿］这里有回声。']),
    tags: ['key'],
    onEnter: [san(3), setf('know.let-him-rest')],
    choices: [go('pelle.rested.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.notRested',
    speaker: '管道里',
    text: '［停顿］\n没关系。我不困。',
    corruptedText: cor([45, '［停顿］没关系。我不困。（床垫上没有凹。）']),
    tags: ['key'],
    onEnter: [setf('know.he-says-not-tired')],
    choices: [go('pelle.notRested.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.gaveChart',
    speaker: undefined,
    text: '一张折过很多次的图，从管道缝里推出来。折痕已经烂了。\n图上的舱比你见过的多一个，那一个没有名字，只有一个方框。',
    corruptedText: cor([40, '图上多一个舱，没有名字，只有一个方框。方框里有一个很小的叉。']),
    tags: ['key'],
    onEnter: [setf('know.zero-on-chart')],
    choices: [
      c({
        id: 'pelle.gaveChart.back',
        label: '看图纸背面。',
        cost: 3,
        effects: [san(-10)],
        goto: 'pelle.chartBack',
      }),
      go('pelle.gaveChart.fold', '折起来。', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.chartBack',
    speaker: undefined,
    text: '背面有十七条铅笔线，从月池那个点出发，形状都不一样。\n第十八条画了一半。',
    corruptedText: cor([40, '十七条线，形状都不一样。第十八条画了一半。半条也很好看。']),
    tags: ['key'],
    onEnter: [learn('k.path-is-a-stroke'), san(-10)],
    choices: [
      c({
        id: 'pelle.chartBack.overlay',
        label: '把十七条叠在一起看。',
        cost: 5,
        requires: K('k.eight-strokes'),
        gateMode: 'disable',
        effects: [learn('k.the-word'), san(-12)],
        goto: 'pelle.overlay',
      }),
      go('pelle.chartBack.fold', '折起来。', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.overlay',
    speaker: undefined,
    text: '十七条线里有重复的。去掉重复，剩下七种。\n七种笔画，一个方向，一个收笔。祈使语气。',
    corruptedText: cor([40, '剩下七种。七种笔画，一个方向。还差一笔。差的那笔是你今天在走的。']),
    tags: ['key'],
    onEnter: [learn('k.the-word'), san(-10)],
    choices: [go('pelle.overlay.ok', '折起来。', 'pelle.pipe')],
  },
  {
    id: 'pelle.refusedCount',
    speaker: '管道里',
    text: '［停顿］\n好。那我数。',
    corruptedText: cor([45, '［停顿］好。那我数。（他开始数。他数得很慢。）']),
    tags: ['key'],
    onEnter: [setf('know.he-counts-instead'), san(-4)],
    choices: [
      c({
        id: 'pelle.refusedCount.stop',
        label: '"别数。"',
        cost: 2,
        effects: [addf('count.questions', 1), mark('silence', 2), san(4)],
        goto: 'pelle.stoppedCounting',
      }),
      silence('pelle.refusedCount.silent', 'pelle.pipe')
    ],
  },
  {
    id: 'pelle.stoppedCounting',
    speaker: '管道里',
    text: '［停顿］\n没有人跟我这么说过。',
    corruptedText: cor([45, '［停顿］没有人跟我这么说过。（管道里很久没有声音。）']),
    tags: ['key'],
    onEnter: [san(6), setf('know.first-to-say-stop')],
    choices: [go('pelle.stoppedCounting.ok', '……', 'pelle.pipe')],
  },
  {
    id: 'pelle.leaving',
    speaker: '管道里',
    text: '这里有回声。\n［停顿］你走的时候别数步子。',
    corruptedText: cor([45, '这里有回声。你走的时候别数步子。（他在提醒你补板上那三个字。）']),
    tags: ['key'],
    onEnter: [setf('know.pelle-repeats-warning')],
    choices: [
      c({
        id: 'pelle.leaving.back',
        label: '再说两句。',
        cost: 2,
        requires: num('count.pelle-talks', '>=', 2),
        gateMode: 'disable',
        goto: 'pelle.pipe',
      }),
      c({
        id: 'pelle.leaving.go',
        label: '走。',
        cost: 1,      })
    ],
  }
];
