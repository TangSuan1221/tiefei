/**
 * 你自己 YOURSELF —— 第 N-1 个你。
 *
 * 核心张力（GDD §7.2）：他留下的日志在预言你的行动。
 *
 * 实现方式不是"写几句像预言的台词"，而是**机制化**：
 * 他的日志由 ledger.ts 里的 DEED_LEDGER 驱动——你这一轮做过的**每一件事**，
 * 都已经以你的字迹写在他的本子上。你做得越多，他的本子越厚。
 * 这是本作把"宿命"变成可验证数据的地方，也是校验器能证明的部分。
 *
 * 契诃夫技法：
 *  - S4 首尾同段文本：日志第一行与最后一页的空白处是同一句话。
 *  - D4 最痛的话最短：他对自己的全部评价是三个字。
 *  - C4 随身物：那支笔。笔是热的。结尾笔在你手里。
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
  num,
  off,
  on,
  san,
  setf,
  sfx,
  silence,
  take,
} from '../../narrative/dsl';

export const YOURSELF_NODES: readonly NarrativeNode[] = [
  {
    id: 'self.enter',
    speaker: undefined,
    text: '这个舱室的门牌上是你的名字。\n里面有一个人，坐在铺沿上，向前倾着。穿的衣服和你身上这件一样。',
    corruptedText: cor(
      [50, '门牌上是你的名字。里面的人坐在铺沿上向前倾。他的衣服和你的一样，连磨损的位置都一样。'],
      [20, '门牌上是你的名字。里面没有人。铺沿上有一个人形的凹，还热着。'],
    ),
    tags: ['entry', 'key'],
    onEnter: [setf('met.yourself'), fear(20), san(-10), sfx('hull.tick')],
    choices: [
      c({
        id: 'self.enter.look',
        label: '看他的脸。',
        cost: 3,
        effects: [san(-10)],
        goto: 'self.face',
      }),
      c({
        id: 'self.enter.log',
        label: '铺上有一本日志。先看日志。',
        cost: 2,        goto: 'self.log.first',
      }),
      c({
        id: 'self.enter.out',
        label: '退出去。',
        cost: 2,
        effects: [mark('silence', 1) ],
      })
    ],
  },
  {
    id: 'self.face',
    speaker: undefined,
    text: '面罩还在脸上。内侧有一小片水汽，在左眼下方。\n和你的位置一样。',
    corruptedText: cor(
      [45, '面罩还在脸上。水汽在左眼下方。形状也一样。你伸手擦了一下自己的。'],
      [20, '面罩还在脸上。里面在起雾。'],
    ),
    tags: ['key'],
    onEnter: [san(-12), setf('know.same-fog-position')],
    choices: [
      c({
        id: 'self.face.lift',
        label: '掀开面罩。',
        cost: 4,
        irreversible: true,
        effects: [san(-16), fear(24), mark('flesh', 1)],
        goto: 'self.under',
      }),
      c({
        id: 'self.face.hands',
        label: '看他的手。',
        cost: 3,        goto: 'self.hands',
      }),
      go('self.face.log', '不看了。看日志。', 'self.log.first')
    ],
  },
  {
    id: 'self.under',
    speaker: undefined,
    text: '是你。比你瘦一点，右边嘴角有一道你没有的疤。\n那道疤的位置，是你昨天咬到的位置。',
    corruptedText: cor(
      [45, '是你。右边嘴角有一道疤。那个位置你昨天咬到过。今天摸上去还疼。'],
      [20, '是你。你伸手摸自己的嘴角，摸到了那道疤。'],
    ),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-16)],
    choices: [
      c({
        id: 'self.under.touch',
        label: '摸自己的嘴角。',
        cost: 2,
        effects: [san(-10), fear(20)],
        goto: 'self.myLip',
      }),
      c({
        id: 'self.under.cover',
        label: '把面罩放回去。',
        cost: 2,
        effects: [mark('silence', 1), san(4)],
        goto: 'self.covered',
      })
    ],
  },
  {
    id: 'self.myLip',
    speaker: undefined,
    text: '有。\n很浅，但是有。',
    corruptedText: cor([40, '有。很浅，但是有。它会长成他那样，用不了多久。']),
    tags: ['key'],
    onEnter: [san(-10)],
    choices: [go('self.myLip.ok', '……', 'self.room')],
  },
  {
    id: 'self.covered',
    speaker: undefined,
    text: '放回去了。位置摆得比原来正。\n下一个人来的时候会注意到这一点。',
    corruptedText: cor([40, '放回去了。摆得比原来正。下一个人会注意到。他很仔细。']),
    tags: ['key'],
    onEnter: [setf('know.i-tidied-him')],
    choices: [go('self.covered.ok', '……', 'self.room')],
  },
  {
    id: 'self.hands',
    speaker: undefined,
    text: '右手食指侧面有一道压痕，是长期握笔压出来的。\n你的手上也有。你不记得自己写过那么多东西。',
    corruptedText: cor([40, '右手食指有握笔的压痕。你的也有。你写了很多东西，只是不是这一轮写的。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.pen-callus')],
    choices: [
      c({
        id: 'self.hands.nails',
        label: '看指甲。',
        cost: 2,        goto: 'self.nails',
      }),
      go('self.hands.log', '看日志。', 'self.log.first')
    ],
  },
  {
    id: 'self.nails',
    speaker: undefined,
    text: '指甲里有铁屑，很细。\n刻焊缝会留下这种铁屑。',
    corruptedText: cor([40, '指甲里有铁屑。刻焊缝会留下这种。你刚才刻过。']),
    tags: ['key'],
    onEnter: [setf('know.iron-filings')],
    choices: [
      c({
        id: 'self.nails.mine',
        label: '看自己的指甲。',
        cost: 2,
        requires: on('did.carved-eighteenth'),
        gateMode: 'disable',
        effects: [san(-10)],
        goto: 'self.myNails',
      }),
      go('self.nails.back', '……', 'self.room')
    ],
  },
  {
    id: 'self.myNails',
    speaker: undefined,
    text: '一样的铁屑。\n他刻的是第十七道。',
    corruptedText: cor([40, '一样的铁屑。他刻的是第十七道。你刻的是第十八道。这就是全部区别。']),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-10)],
    choices: [go('self.myNails.ok', '……', 'self.room')],
  },

  // -------------------------------------------------------------------------
  // 日志
  // -------------------------------------------------------------------------
  {
    id: 'self.log.first',
    speaker: '日志',
    text: '第一行：「不要数。」\n第二行是今天的日期。',
    corruptedText: cor(
      [45, '第一行：「不要数。」第二行是今天的日期。第三行是现在的时间。'],
      [20, '第一行：「不要数。」下面全是日期，一天一行，十七页。'],
    ),
    tags: ['key'],
    onEnter: [sfx('pen.scratch')],
    choices: [
      c({
        id: 'self.log.first.date',
        label: '看日期。',
        cost: 2,
        effects: [san(-6)],
        goto: 'self.log.date',
      }),
      c({
        id: 'self.log.first.hand',
        label: '看字迹。',
        cost: 2,        goto: 'self.log.hand',
      }),
      c({
        id: 'self.log.first.flip',
        label: '往后翻。',
        cost: 3,        goto: 'self.log.index',
      })
    ],
  },
  {
    id: 'self.log.date',
    speaker: undefined,
    text: '今天。\n后面还有三页写满了，日期也是今天。',
    corruptedText: cor([40, '今天。后面三页也是今天。最后一页的时间比现在晚十一分钟。']),
    tags: ['key'],
    onEnter: [learn('k.previous-log-predicts'), san(-10)],
    choices: [go('self.log.date.read', '读那三页。', 'self.log.index')],
  },
  {
    id: 'self.log.hand',
    speaker: undefined,
    text: '起笔在右上。中间那次停顿的位置也一样。\n这是你的字。',
    corruptedText: cor([40, '这是你的字。写的时候他的手比你现在稳。']),
    tags: ['key'],
    onEnter: [setf('know.his-hand-is-mine'), san(-8)],
    choices: [go('self.log.hand.read', '读。', 'self.log.index')],
  },
  {
    id: 'self.log.index',
    speaker: '日志',
    text: '三页写满的，一页空白的。\n写满的那三页，每一行都是你今天做过的事。',
    corruptedText: cor(
      [45, '三页写满，一页空白。写满的每一行都是你今天做过的事，包括你刚才翻这一页。'],
      [20, '四页都写满了。第四页是你还没做的事。'],
    ),
    tags: ['key', 'hub'],
    onEnter: [learn('k.previous-log-predicts')],
    choices: [
      c({ id: 'self.log.index.deeds', label: '读他记下的事。', cost: 2, goto: 'ledger.deeds.index' }),
      c({
        id: 'self.log.index.blank',
        label: '翻到空白那一页。',
        cost: 2,
        effects: [setf('did.found-blank-page')],
        goto: 'self.blank',
      }),
      c({
        id: 'self.log.index.margin',
        label: '看页边的批注。',
        cost: 2,
        requires: on('did.read-a-ledger-line'),
        gateMode: 'disable',        goto: 'self.margins',
      }),
      c({
        id: 'self.log.index.count',
        label: '数一共有多少行。',
        cost: 4,
        requires: off('know.dont-count'),
        gateMode: 'lie',
        effects: [addf('count.breaths-counted', 20)],
        goto: 'self.lineCount',
      }),
      c({
        id: 'self.log.index.count2',
        label: '数一共有多少行。',
        cost: 4,
        requires: on('know.dont-count'),
        effects: [addf('count.breaths-counted', 20), mark('listening', 1) ],
        goto: 'self.lineCount',
      }),
      c({ id: 'self.log.index.close', label: '合上。', cost: 1, goto: 'self.room' })
    ],
  },
  {
    id: 'self.lineCount',
    speaker: undefined,
    text: '行数和你今天做过的事的件数一样。\n一件一行。没有多，没有少。',
    corruptedText: cor([40, '一件一行。没有多，没有少。最后一行的墨还没干。']),
    tags: ['key'],
    onEnter: [learn('k.previous-log-predicts'), san(-10)],
    choices: [go('self.lineCount.ok', '……', 'self.log.index')],
  },
  {
    id: 'self.margins',
    speaker: '日志',
    text: '页边有很小的批注，不是给别人看的。\n有的只是一个点。',
    corruptedText: cor([40, '页边的批注不是给别人看的。有的只是一个点。点表示"又来了"。']),
    tags: ['key'],
    onEnter: [setf('know.margin-notes')],
    choices: [
      c({
        id: 'self.margins.dot',
        label: '"点"是什么意思。',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'self.dots',
      }),
      go('self.margins.back', '……', 'self.log.index')
    ],
  },
  {
    id: 'self.dots',
    speaker: undefined,
    text: '点出现在同一类行的旁边：擦水汽、敲管子、数东西。\n点的意思是：这一件我也做了。',
    corruptedText: cor([40, '点的意思是：这一件我也做了。点很多。点是这本子上最多的东西。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.dot-meaning')],
    choices: [go('self.dots.ok', '……', 'self.log.index')],
  },
  {
    id: 'self.blank',
    speaker: '日志',
    text: '空白页的中间夹着一支笔。\n笔是热的。',
    corruptedText: cor(
      [45, '空白页的中间夹着一支笔。笔是热的。页脚有一行很浅的铅笔字，被擦过。'],
      [20, '空白页上有一行字，是你的字，写着你下一步要做的事。'],
    ),
    tags: ['key'],
    onEnter: [fear(18), san(-8), setf('did.found-blank-page')],
    choices: [
      c({
        id: 'self.blank.take',
        label: '拿笔。',
        cost: 2,
        effects: [setf('did.took-the-pen'), give('nameplate', 0)],
        goto: 'self.pen',
      }),
      c({
        id: 'self.blank.foot',
        label: '看页脚那行浅字。',
        cost: 3,        goto: 'self.footer',
      }),
      c({
        id: 'self.blank.leave',
        label: '合上，不碰笔。',
        cost: 2,
        effects: [mark('silence', 2), san(5)],
        goto: 'self.room',
      })
    ],
  },
  {
    id: 'self.footer',
    speaker: undefined,
    text: '擦过的痕迹里能认出四个字：「这次别写」。\n擦的人用了很多次橡皮，纸都起毛了。',
    corruptedText: cor([40, '「这次别写」。擦的人用了很多次橡皮。他每次写，每次擦。']),
    tags: ['key'],
    onEnter: [setf('know.dont-write'), san(-6)],
    choices: [
      c({
        id: 'self.footer.why',
        label: '他写了，然后擦了。',
        cost: 2,
        effects: [learn('k.path-is-a-stroke')],
        goto: 'self.erasure',
      }),
      go('self.footer.back', '……', 'self.blank')
    ],
  },
  {
    id: 'self.erasure',
    speaker: undefined,
    text: '他每一轮都写下「这次别写」，然后擦掉。\n擦掉本身也是写。',
    corruptedText: cor([40, '擦掉本身也是写。这是这本子上唯一一句真话。']),
    tags: ['key'],
    onEnter: [learn('k.path-is-a-stroke'), san(-8)],
    choices: [go('self.erasure.ok', '……', 'self.blank')],
  },
  {
    id: 'self.pen',
    speaker: undefined,
    text: '笔在你手里。握的位置正好落在食指那道压痕上。\n空白页还是空白的。',
    corruptedText: cor(
      [45, '笔在你手里。握的位置正好。空白页还是空白的。笔尖已经落在纸上了。'],
      [20, '笔在你手里。你已经写了三行。你不记得写了什么。'],
    ),
    tags: ['key'],
    onEnter: [setf('did.took-the-pen'), fear(14)],
    choices: [
      c({
        id: 'self.pen.write-next',
        label: '写下你接下来要做的事。',
        cost: 5,
        irreversible: true,
        effects: [mark('listening', 2), san(-8), sfx('pen.scratch')],
        goto: 'self.wrote',
      }),
      c({
        id: 'self.pen.write-dont',
        label: '写「这次别写」。',
        cost: 4,
        irreversible: true,
        effects: [addf('count.futile-acts', 1), san(-4)],
        goto: 'self.wroteDont',
      }),
      c({
        id: 'self.pen.break',
        label: '把笔折断。',
        cost: 3,
        irreversible: true,
        effects: [mark('apostasy', 2), san(6), sfx('hull.tick')],
        goto: 'self.broke',
      }),
      c({
        id: 'self.pen.pocket',
        label: '揣进口袋。',
        cost: 2,
        effects: [setf('did.kept-the-pen'), mark('iron', 1)],
        goto: 'self.room',
      })
    ],
  },
  {
    id: 'self.wrote',
    speaker: undefined,
    text: '写完了。你写的是：去月池。\n下一行已经有了字，不是你写的：「他也写了这个。」',
    corruptedText: cor([40, '你写的是：去月池。下一行已经有字：「他也写了这个。」字迹和你的一样。']),
    tags: ['key'],
    onEnter: [san(-12), setf('know.prediction-confirmed'), learn('k.previous-log-predicts')],
    choices: [
      c({
        id: 'self.wrote.cross',
        label: '把自己写的那行划掉。',
        cost: 3,
        irreversible: true,
        effects: [mark('apostasy', 1), san(5)],
        goto: 'self.crossed',
      }),
      go('self.wrote.close', '合上。', 'self.room')
    ],
  },
  {
    id: 'self.crossed',
    speaker: undefined,
    text: '划掉了。划掉的那行下面又出现了一行：「划掉的也算。」\n这一行的墨是干的。',
    corruptedText: cor([40, '「划掉的也算。」墨是干的。所以这一行比你的早。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.crossing-counts')],
    choices: [
      c({
        id: 'self.crossed.tear',
        label: '把这一页撕下来。',
        cost: 4,
        irreversible: true,
        effects: [mark('apostasy', 2), san(6), loud(6)],
        goto: 'self.tore',
      }),
      go('self.crossed.close', '合上。', 'self.room')
    ],
  },
  {
    id: 'self.tore',
    speaker: undefined,
    text: '撕下来了。下面那一页上有同样的三行，压印透过去的。\n本子很厚。',
    corruptedText: cor([40, '下面那一页有同样的三行。本子很厚。撕到最后一页也是同样的三行。']),
    tags: ['key'],
    onEnter: [san(-8), learn('k.path-is-a-stroke')],
    choices: [
      c({
        id: 'self.tore.keep',
        label: '把撕下来的那页折好收起。',
        cost: 2,        goto: 'self.room',
      }),
      c({
        id: 'self.tore.eat',
        label: '把纸吃掉。',
        cost: 6,
        irreversible: true,
        effects: [mark('flesh', 2), san(-10)],
        goto: 'self.ate',
      })
    ],
  },
  {
    id: 'self.ate',
    speaker: undefined,
    text: '纸很涩，咽下去要三口。\n咽完你想起来自己以前咽过纸，而且不止一次。',
    corruptedText: cor([40, '咽完你想起来以前咽过。不止一次。每次都是这一页。']),
    tags: ['key'],
    onEnter: [san(-10), setf('know.ate-before')],
    choices: [go('self.ate.ok', '……', 'self.room')],
  },
  {
    id: 'self.wroteDont',
    speaker: undefined,
    text: '写完了。你看着它。\n然后你伸手去拿橡皮。橡皮就在铺沿上，位置正好。',
    corruptedText: cor([40, '写完了。你伸手去拿橡皮。橡皮在铺沿上。位置正好。每次都正好。']),
    tags: ['key'],
    onEnter: [setf('know.eraser-is-placed'), san(-6)],
    choices: [
      c({
        id: 'self.wroteDont.erase',
        label: '擦掉。',
        cost: 3,
        effects: [addf('count.futile-acts', 1), san(-4)],
        goto: 'self.erasure',
      }),
      c({
        id: 'self.wroteDont.keep',
        label: '不擦。合上本子。',
        cost: 2,
        irreversible: true,
        effects: [mark('silence', 2), san(6)],
        goto: 'self.leftWritten',
      })
    ],
  },
  {
    id: 'self.leftWritten',
    speaker: undefined,
    text: '本子合上了，那四个字留在里面。\n下一个人翻到这里的时候，页脚不会有擦痕。',
    corruptedText: cor([40, '那四个字留在里面。下一个人翻到这里时，页脚不会有擦痕。他会看得见。']),
    tags: ['key'],
    onEnter: [setf('know.left-a-message'), san(6)],
    choices: [go('self.leftWritten.ok', '……', 'self.room')],
  },
  {
    id: 'self.broke',
    speaker: undefined,
    text: '笔折断了。断口里没有墨。\n笔里面是空的，一直是空的。',
    corruptedText: cor([40, '断口里没有墨。笔一直是空的。那些字不是笔写的。']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.pen-was-empty'), learn('k.author-is-not-it')],
    choices: [
      c({
        id: 'self.broke.who',
        label: '那些字是谁写的。',
        cost: 2,
        effects: [addf('count.questions', 1)],
        goto: 'self.whoWrote',
      }),
      go('self.broke.ok', '……', 'self.room')
    ],
  },
  {
    id: 'self.whoWrote',
    speaker: undefined,
    text: '字迹是你的。笔是空的。\n所以写字的不是笔，也不是它——是那只手愿意动。',
    corruptedText: cor([40, '字迹是你的。笔是空的。写字的是那只愿意动的手。它只是在听。']),
    tags: ['key'],
    onEnter: [learn('k.author-is-not-it'), san(-8)],
    choices: [go('self.whoWrote.ok', '……', 'self.room')],
  },

  // -------------------------------------------------------------------------
  // 舱室中枢
  // -------------------------------------------------------------------------
  {
    id: 'self.room',
    speaker: undefined,
    text: '铺沿上的人还向前倾着。这个姿势维持得太久了，但他不会倒。\n舱里很干。只有这一个舱是干的。',
    corruptedText: cor(
      [50, '他还向前倾着。这个姿势维持得太久。舱里很干。只有这一个舱是干的，因为只有这一个舱不属于船。'],
      [20, '铺沿上没有人。姿势还在。'],
    ),
    tags: ['entry', 'hub', 'key'],
    onEnter: [addf('count.self-visits', 1)],
    choices: [
      c({ id: 'self.room.log', label: '再看日志。', cost: 2, goto: 'self.log.index' }),
      c({
        id: 'self.room.pockets',
        label: '摸他的口袋。',
        cost: 3,
        effects: [mark('flesh', 1)],
        goto: 'self.pockets',
      }),
      c({
        id: 'self.room.neck',
        label: '看他的后颈。',
        cost: 3,
        requires: on('know.neck-socket'),
        gateMode: 'hide',        goto: 'self.neck',
      }),
      c({
        id: 'self.room.gauge',
        label: '看他的压力表。',
        cost: 2,        goto: 'self.gauge',
      }),
      c({
        id: 'self.room.mirror',
        label: '拿镜子照他，再照自己。',
        cost: 4,
        requires: item('mirror'),
        gateMode: 'disable',
        effects: [san(-10)],
        goto: 'self.mirror',
      }),
      c({
        id: 'self.room.sit',
        label: '坐到他旁边。',
        cost: 6,
        effects: [san(-6)],
        goto: 'self.beside',
      }),
      c({
        id: 'self.room.talk',
        label: '跟他说话。',
        cost: 3,
        effects: [addf('count.futile-acts', 1)],
        goto: 'self.talk',
      }),
      c({
        id: 'self.room.move',
        label: '把他放平。',
        cost: 6,
        effects: [addf('count.selfless-acts', 1), san(4)],
        goto: 'self.laid',
      }),
      c({
        id: 'self.room.stroke',
        label: '"我走的路是一笔。"',
        cost: 3,
        requires: all(K('k.previous-log-predicts'), K('k.ship-is-teaching')),
        gateMode: 'disable',
        effects: [learn('k.path-is-a-stroke')],
        goto: 'self.stroke',
      }),
      c({
        id: 'self.room.leave',
        label: '出去。',
        cost: 2,        goto: 'self.leaving',
      })
    ],
  },
  {
    id: 'self.pockets',
    speaker: undefined,
    text: '左口袋：一枚铺位牌，上面是你的名字。\n右口袋：一颗牙。',
    corruptedText: cor([40, '左口袋：一枚铺位牌。右口袋：一颗牙。牙是下门牙，有一个缺口。']),
    tags: ['key'],
    onEnter: [setf('know.tooth-in-pocket')],
    choices: [
      c({
        id: 'self.pockets.tooth',
        label: '拿那颗牙。',
        cost: 2,
        effects: [give('tooth'), mark('flesh', 1)],
        goto: 'self.tooth',
      }),
      c({
        id: 'self.pockets.plate',
        label: '拿铺位牌。',
        cost: 2,
        effects: [give('nameplate') ],
        goto: 'self.hisPlate',
      }),
      go('self.pockets.back', '什么都不拿。', 'self.room')
    ],
  },
  {
    id: 'self.tooth',
    speaker: undefined,
    text: '下门牙，有一个缺口。\n你用舌头顶了一下自己的下门牙。',
    corruptedText: cor([40, '下门牙，有缺口。你顶了一下自己的。缺口在同一个位置。']),
    tags: ['key'],
    onEnter: [san(-10), sfx('teeth.count'), setf('know.tooth-matches')],
    choices: [go('self.tooth.ok', '……', 'self.room')],
  },
  {
    id: 'self.hisPlate',
    speaker: undefined,
    text: '背面钢印：批次 K-9，位 04。\n和你的那块一样，连"位"后面被磨掉的部分都一样。',
    corruptedText: cor([40, '批次 K-9，位 04。和你的一样。磨掉的部分也一样。磨的人是同一个。']),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-8)],
    choices: [go('self.hisPlate.ok', '……', 'self.room')],
  },
  {
    id: 'self.neck',
    speaker: undefined,
    text: '缝合线在。已经长平了。\n线头剪得很齐，剪的人手很稳。',
    corruptedText: cor([40, '缝合线在，长平了。线头剪得很齐。剪的人手很稳，是自己剪的。']),
    tags: ['key'],
    onEnter: [learn('k.signal-in-blood'), san(-8)],
    choices: [go('self.neck.ok', '……', 'self.room')],
  },
  {
    id: 'self.gauge',
    speaker: undefined,
    text: '他的表：零。\n指针压在最左边，压得有点变形。',
    corruptedText: cor([40, '他的表：零。指针压得变形。表面上有一层水汽，在里面。']),
    tags: ['key'],
    onEnter: [setf('know.his-gauge-zero')],
    choices: [
      c({
        id: 'self.gauge.mine',
        label: '看自己的表。',
        cost: 1,
        effects: [fear(10)],
        goto: 'self.myGauge',
      }),
      go('self.gauge.back', '……', 'self.room')
    ],
  },
  {
    id: 'self.myGauge',
    speaker: undefined,
    text: '{{@oxygen}}。\n差距就是你今天还剩的那些动作。',
    corruptedText: cor([40, '{{@oxygen}}。差距就是你今天还剩的动作。数字在你看它的时候跳了一下。']),
    tags: ['key'],
    choices: [go('self.myGauge.ok', '……', 'self.room')],
  },
  {
    id: 'self.mirror',
    speaker: undefined,
    text: '镜子里是两个人，都向前倾着。\n你没有向前倾。',
    corruptedText: cor(
      [40, '镜子里是两个人，都向前倾着。你没有向前倾。（你现在向前倾了。）'],
      [18, '镜子里是一个人。'],
    ),
    tags: ['key'],
    onEnter: [san(-12), fear(20), setf('know.mirror-shows-two')],
    choices: [
      c({
        id: 'self.mirror.debunk',
        label: '镜子里那个不是我，是他的反光。',
        cost: 3,
        requires: num('count.debunks', '>=', 2),
        gateMode: 'disable',
        effects: [addf('count.debunks', 1), san(10) ],
        goto: 'self.mirrorDebunk',
      }),
      c({
        id: 'self.mirror.straighten',
        label: '站直。',
        cost: 2,
        effects: [san(4)],
        goto: 'self.room',
      }),
      c({
        id: 'self.mirror.lean',
        label: '也向前倾。',
        cost: 3,
        irreversible: true,
        effects: [mark('listening', 2), san(-10)],
        goto: 'self.leaned',
      })
    ],
  },
  {
    id: 'self.mirrorDebunk',
    speaker: undefined,
    text: '镜面有一道细裂，把像分成两半，错开三度。\n所以是一个人，两个像。',
    tags: ['key'],
    onEnter: [san(8)],
    choices: [go('self.mirrorDebunk.ok', '……', 'self.room')],
  },
  {
    id: 'self.leaned',
    speaker: undefined,
    text: '倾到某个角度的时候，耳朵正好对着地板。\n地板下面有声音，很规律，二、二、三。',
    corruptedText: cor([40, '耳朵对着地板。地板下面二、二、三。他就是这么听的。这个姿势很舒服。']),
    tags: ['key'],
    onEnter: [san(-10), setf('know.the-posture-is-for-listening')],
    choices: [
      c({
        id: 'self.leaned.up',
        label: '直起来。',
        cost: 3,
        effects: [san(4), mark('silence', 1)],
        goto: 'self.room',
      }),
      c({
        id: 'self.leaned.stay',
        label: '保持这个姿势。',
        cost: 10,
        irreversible: true,
        effects: [mark('listening', 3), san(-14)],
        goto: 'self.held',
      })
    ],
  },
  {
    id: 'self.held',
    speaker: undefined,
    text: '保持了很久。久到你不需要用力就能保持。\n旁边那个人的姿势和你一模一样，这一点现在不吓人了。',
    corruptedText: cor([40, '久到不需要用力。旁边那个人和你一样。这一点现在不吓人了。这才是最坏的部分。']),
    tags: ['key'],
    onEnter: [san(-12), setf('know.posture-became-easy')],
    choices: [
      c({
        id: 'self.held.break',
        label: '起来。',
        cost: 8,
        effects: [san(6), mark('apostasy', 1)],
        goto: 'self.room',
      })
    ],
  },
  {
    id: 'self.beside',
    speaker: undefined,
    text: '铺沿很窄，两个人坐正好。\n他那一半是压下去的，你这一半是新的。',
    corruptedText: cor([40, '铺沿两个人坐正好。他那半是压下去的，你这半是新的。新的会变旧。']),
    tags: ['key'],
    onEnter: [san(-6)],
    choices: [
      c({
        id: 'self.beside.rest',
        label: '歇一会儿。',
        cost: 10,
        effects: [san(6)],
        goto: 'self.rested',
      }),
      go('self.beside.up', '起来。', 'self.room')
    ],
  },
  {
    id: 'self.rested',
    speaker: undefined,
    text: '歇了十个呼吸。这十个呼吸里没有任何事发生。\n这是今天最好的十个呼吸。',
    corruptedText: cor([40, '十个呼吸里没有任何事发生。这是今天最好的十个呼吸。他也有过这十个。']),
    tags: ['key'],
    onEnter: [san(6), setf('know.best-ten-breaths')],
    choices: [go('self.rested.ok', '起来。', 'self.room')],
  },
  {
    id: 'self.talk',
    speaker: undefined,
    text: '你说了一句。他没有反应。\n本子上多了一行。',
    corruptedText: cor([40, '你说了一句。他没有反应。本子上多了一行：「他跟我说话了。」']),
    tags: ['key'],
    onEnter: [san(-8), setf('know.log-writes-itself')],
    choices: [
      c({
        id: 'self.talk.read',
        label: '看那一行。',
        cost: 2,
        effects: [san(-6)],
        goto: 'self.newLine',
      }),
      go('self.talk.back', '不看。', 'self.room')
    ],
  },
  {
    id: 'self.newLine',
    speaker: '日志',
    text: '「他跟我说话了。我没有回答，因为回答要花一口气。」',
    corruptedText: cor([40, '「他跟我说话了。我没有回答，因为回答要花一口气。」（墨还没干。）']),
    tags: ['key'],
    onEnter: [learn('k.previous-log-predicts'), san(-8)],
    choices: [
      c({
        id: 'self.newLine.again',
        label: '再说一句。',
        cost: 3,
        effects: [addf('count.futile-acts', 1) ],
        goto: 'self.talk',
      }),
      go('self.newLine.stop', '不说了。', 'self.room')
    ],
  },
  {
    id: 'self.laid',
    speaker: undefined,
    text: '放平了。他的膝盖伸不直，只能屈着。\n被子拉到胸口。这是你今天做的第二件没有用的事。',
    corruptedText: cor([40, '放平了。膝盖伸不直。被子拉到胸口。这是今天第二件没有用的事。']),
    tags: ['key'],
    onEnter: [san(5), addf('count.futile-acts', 1), setf('know.laid-him-down')],
    choices: [
      c({
        id: 'self.laid.cover',
        label: '把他的脸也盖上。',
        cost: 3,
        effects: [addf('count.selfless-acts', 1), san(4), mark('silence', 1)],
        goto: 'self.room',
      }),
      go('self.laid.ok', '……', 'self.room')
    ],
  },
  {
    id: 'self.stroke',
    speaker: undefined,
    text: '他的本子上三页，你今天走过的路一条。\n本子记的不是事，是笔顺。',
    corruptedText: cor([40, '本子记的不是事，是笔顺。他记得很清楚，因为他也是这么走的。']),
    tags: ['key'],
    onEnter: [learn('k.path-is-a-stroke'), san(-10)],
    choices: [
      c({
        id: 'self.stroke.overlay',
        label: '把他的笔顺和你的比一下。',
        cost: 5,
        requires: K('k.eight-strokes'),
        gateMode: 'disable',
        effects: [san(-8)],
        goto: 'self.compared',
      }),
      go('self.stroke.back', '……', 'self.room')
    ],
  },
  {
    id: 'self.compared',
    speaker: undefined,
    text: '他走的是第七种。你走的是第八种。\n八种凑齐了就是一个字。',
    corruptedText: cor([40, '他走第七种。你走第八种。凑齐就是一个字。就差你这一笔。']),
    tags: ['key'],
    onEnter: [learn('k.eight-strokes'), san(-10)],
    choices: [go('self.compared.ok', '……', 'self.room')],
  },
  {
    id: 'self.leaving',
    speaker: undefined,
    text: '你出门，回头看了一眼。\n他的姿势没变。本子摊开在空白那一页。',
    corruptedText: cor([40, '他的姿势没变。本子摊开在空白那一页。空白页上有一行新的字。']),
    tags: ['key'],
    choices: [
      c({
        id: 'self.leaving.back',
        label: '再进去。',
        cost: 2,
        requires: num('count.self-visits', '>=', 2),
        gateMode: 'disable',
        goto: 'self.room',
      }),
      c({
        id: 'self.leaving.go',
        label: '走。',
        cost: 2,      })
    ],
  },

  // -------------------------------------------------------------------------
  // 日志页边批注 —— ledger.ts 生成的每一行都落到这六个反应里
  // -------------------------------------------------------------------------
  {
    id: 'self.margin.obey',
    speaker: '日志',
    text: '（这一行旁边有一个点。）\n点的意思是：这一件我也做了，而且做的时候没有犹豫。',
    corruptedText: cor([40, '（点。）这一件我也做了，没有犹豫。你也没有。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1)],
    choices: [go('self.margin.obey.back', '翻回去。', 'ledger.deeds.index')],
  },
  {
    id: 'self.margin.refuse',
    speaker: '日志',
    text: '（这一行旁边画了一个圈。）\n圈的意思是：这一件我没做。你做了。差别从这里开始。',
    corruptedText: cor([40, '（圈。）这一件我没做。你做了。差别从这里开始，然后就没有了。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1), san(2)],
    choices: [go('self.margin.refuse.back', '翻回去。', 'ledger.deeds.index')],
  },
  {
    id: 'self.margin.cruel',
    speaker: '日志',
    text: '（这一行被划掉又写了一遍。）\n写第二遍的时候字重了很多。',
    corruptedText: cor([40, '（划掉又写了一遍。）第二遍字重很多。他不想留，但是留了。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1), san(-3)],
    choices: [go('self.margin.cruel.back', '翻回去。', 'ledger.deeds.index')],
  },
  {
    id: 'self.margin.kind',
    speaker: '日志',
    text: '（这一行后面加了两个字：「记着」。）\n只有这一类行后面有这两个字。',
    corruptedText: cor([40, '（「记着」。）只有这一类行后面有。他记着的都是没有用的事。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1), san(3)],
    choices: [go('self.margin.kind.back', '翻回去。', 'ledger.deeds.index')],
  },
  {
    id: 'self.margin.curious',
    speaker: '日志',
    text: '（这一行旁边有一个问号，问号被涂黑了。）\n涂黑的力道很重，纸背都鼓起来了。',
    corruptedText: cor([40, '（问号被涂黑。）力道很重，纸背鼓起来了。问号是他唯一没擦掉的东西。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1)],
    choices: [go('self.margin.curious.back', '翻回去。', 'ledger.deeds.index')],
  },
  {
    id: 'self.margin.count',
    speaker: '日志',
    text: '（这一行旁边是一个数字。）\n数字比你数出来的大一点。',
    corruptedText: cor([40, '（一个数字。）比你数的大一点。他数得比你久。']),
    tags: ['key'],
    onEnter: [setf('did.read-a-ledger-line'), addf('count.ledger-read', 1), mark('listening', 1)],
    choices: [go('self.margin.count.back', '翻回去。', 'ledger.deeds.index')],
  }
];
