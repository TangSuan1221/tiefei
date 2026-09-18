/**
 * 序章 —— 密封舱到第一道舱门。
 *
 * 戏剧任务（契诃夫 S5：正确答案在第一幕就说出来并被拒绝）：
 * 补板上刻着三个字「不要数」。而本作的全部玩法就是数——数呼吸、数回波、数脚步。
 * 玩家会拒绝这个答案，因为不数就没法玩。这个拒绝是全剧道德链的第一环。
 *
 * 不解释任何设定。玩家在序章里只能确认三件事：
 *   1. 床单是新换的。
 *   2. 有人在补板上刻过字，用的是你惯用的手。
 *   3. 无线电里有人，而他比你更清楚你在哪。
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
  sanBelow,
  setf,
  sfx,
  shake,
  silence,
  take,
} from '../../narrative/dsl';

export const PROLOGUE_NODES: readonly NarrativeNode[] = [
  {
    id: 'pro.wake',
    speaker: undefined,
    text: '你醒着。面罩内侧有雾，雾在你数到第三下的时候散开一点。\n膝盖是湿的。舱里只有一盏应急灯，照到你手边一尺。',
    corruptedText: cor(
      [55, '你醒着。面罩内侧有雾。雾散开的时候，你发现自己已经在数了。\n膝盖是湿的。水是温的。'],
      [25, '你醒着。有人替你把雾擦掉了。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.woke'), sfx('breath.own')],
    choices: [
      go('pro.wake.sit', '坐起来。', 'pro.seated'),
      c({
        id: 'pro.wake.listen',
        label: '先不动。听。',
        cost: 2,
        effects: [sfx('hull.tick'), san(2)],
        goto: 'pro.listen',
      }),
      c({
        id: 'pro.wake.remember',
        label: '想一想自己是怎么上船的。',
        requires: off('did.woke'),
        gateMode: 'lie',
        goto: 'pro.seated',
      })
    ],
  },
  {
    id: 'pro.listen',
    text: '金属在冷缩，一声一声，间隔不一样。\n远处有水在流，但不是往下。',
    corruptedText: cor([40, '金属在冷缩。间隔是二、二、三。二、二、三。\n有人在别的地方按同样的节拍。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.listen.count',
        label: '数间隔。',
        cost: 2,
        effects: [setf('did.count-breaths'), addf('count.breaths-counted', 8), mark('listening', 1)],
        goto: 'pro.counted',
      }),
      go('pro.listen.up', '够了。坐起来。', 'pro.seated')
    ],
  },
  {
    id: 'pro.counted',
    text: '二、二、三。二、二、三。你数到第四轮，它变成二、二、二。\n它改了。',
    corruptedText: cor([45, '二、二、三。你数到第四轮，它开始跟着你数。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.counted.again',
        label: '再数一轮。',
        cost: 2,
        effects: [addf('count.breaths-counted', 8), mark('listening', 1), fear(6)],
        goto: 'pro.seated',
      }),
      silence('pro.counted.stop', 'pro.seated', '停下。')
    ],
  },
  {
    id: 'pro.seated',
    onEnter: [setf('did.sat-up')],
    text: '你坐起来。头顶三十公分是舱顶。左手边是一块补板，新焊的，焊缝还粗。\n右手边是你的面罩支架，空的——面罩已经在你脸上。',
    tags: ['hub'],
    choices: [
      go('pro.seated.plate', '摸那块补板。', 'pro.plate'),
      go('pro.seated.mask', '检查面罩。', 'pro.mask'),
      go('pro.seated.bunk', '看铺位牌。', 'pro.bunk'),
      c({
        id: 'pro.seated.hatch',
        label: '去开舱门。',
        requires: all(on('did.checked-mask'), on('did.read-plate')),
        gateMode: 'disable',
        goto: 'pro.hatch',
      })
    ],
  },
  {
    id: 'pro.plate',
    text: '焊缝上有刻痕。不是撞的，是划的，一笔一笔加深过。\n三个字：不要数。',
    corruptedText: cor(
      [60, '焊缝上有刻痕。三个字：不要数。\n下面还有一行更浅的，被焊渣盖住了。'],
      [30, '焊缝上有刻痕。不要数。不要数。不要数。整块板都是。'],
    ),
    tags: ['key'],
    onEnter: [setf('did.read-plate'), setf('know.dont-count'), sfx('hull.tick')],
    choices: [
      c({
        id: 'pro.plate.trace',
        label: '用手指顺着刻痕走一遍。',
        cost: 1,
        effects: [san(-3), setf('did.touched-plate')],
        goto: 'pro.plate.hand',
      }),
      c({
        id: 'pro.plate.dig',
        label: '抠掉焊渣，看下面那行。',
        cost: 4,
        requires: item('scalpel'),
        gateMode: 'lie',
        effects: [loud(3)],
        goto: 'pro.plate.under',
      }),
      go('pro.plate.leave', '不看了。', 'pro.seated')
    ],
  },
  {
    id: 'pro.plate.hand',
    text: '刻痕的起笔在右上。你的起笔也在右上。\n刻这个的人和你用同一只手。',
    corruptedText: cor([50, '刻痕的起笔在右上。力道也一样。连中间那次停顿都一样。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.plate.hand.accept',
        label: '很多人都是右手。',
        goto: 'pro.seated',
      }),
      c({
        id: 'pro.plate.hand.count',
        label: '数一下有几道。',
        cost: 2,
        effects: [addf('count.breaths-counted', 3), mark('listening', 1), setf('did.count-breaths')],
        goto: 'pro.plate.tally',
      })
    ],
  },
  {
    id: 'pro.plate.tally',
    text: '十七道。每一道都刻了很多遍，所以很深。\n第十八道刚起了个头，很浅。',
    corruptedText: cor([45, '十七道。第十八道刚起了个头。你手上有铁屑。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.plate.tally.finish',
        label: '把第十八道刻完。',
        cost: 6,
        irreversible: true,
        effects: [setf('did.carved-eighteenth'), mark('listening', 1), san(-6), loud(4), sfx('pen.scratch')],
        goto: 'pro.plate.carved',
      }),
      silence('pro.plate.tally.stop', 'pro.seated')
    ],
  },
  {
    id: 'pro.plate.carved',
    text: '刻完了。第十八道和前十七道一样深。\n你不记得自己什么时候学会这个力道。',
    tags: ['key'],
    next: 'pro.seated',
    choices: [],
  },
  {
    id: 'pro.plate.under',
    text: '焊渣下面是另一只手的字，方正，像填表。\n「样本自述保留。不得替代。」',
    tags: ['key'],
    onEnter: [setf('know.sample-wording'), san(-4)],
    choices: [
      go('pro.plate.under.back', '把焊渣按回去。', 'pro.seated'),
      c({
        id: 'pro.plate.under.word',
        label: '"样本"。',
        goto: 'pro.plate.word',
      })
    ],
  },
  {
    id: 'pro.plate.word',
    text: '这个词你在别的地方见过，但想不起在哪。\n那种想不起来是干净的，像被裁掉的。',
    choices: [go('pro.plate.word.ok', '……', 'pro.seated')],
  },
  {
    id: 'pro.mask',
    text: '面罩密封良好。压力表指针在抖，但抖得很规律。\n内侧有一小片水汽，位置在你左眼下方。每次呼气都一样。',
    corruptedText: cor([40, '面罩密封良好。内侧的水汽不是你呼的——它在你吸气的时候变大。']),
    onEnter: [setf('did.checked-mask'), setf('did.wore-mask')],
    choices: [
      c({
        id: 'pro.mask.wipe',
        label: '擦掉水汽。',
        cost: 1,
        goto: 'pro.mask.wiped',
      }),
      c({
        id: 'pro.mask.gauge',
        label: '读压力表。',
        cost: 1,
        goto: 'pro.mask.gauge',
      }),
      go('pro.mask.back', '放下。', 'pro.seated')
    ],
  },
  {
    id: 'pro.mask.wiped',
    onEnter: [setf('did.wiped-visor')],
    text: '擦掉了。三次呼吸之后它回到同一个位置。\n形状也一样。',
    choices: [
      c({
        id: 'pro.mask.wiped.again',
        label: '再擦一次。',
        cost: 1,
        effects: [addf('count.futile-acts', 1)],
        goto: 'pro.mask.wiped2',
      }),
      go('pro.mask.wiped.stop', '算了。', 'pro.seated')
    ],
  },
  {
    id: 'pro.mask.wiped2',
    text: '同一个位置。\n你把手放下。',
    choices: [go('pro.mask.wiped2.ok', '……', 'pro.seated')],
  },
  {
    id: 'pro.mask.gauge',
    text: '九百。单位不是升，是"呼吸"。\n有人把原来的刻度磨了，用钢针重新刻了单位。',
    corruptedText: cor([50, '九百。你看第二眼的时候是八百九十七。你没有呼吸。']),
    tags: ['key'],
    onEnter: [setf('know.breath-unit'), setf('did.checked-gauge')],
    choices: [
      c({
        id: 'pro.mask.gauge.who',
        label: '谁会把氧气换算成呼吸？',
        effects: [addf('count.questions', 1)],
        goto: 'pro.mask.unit',
      }),
      go('pro.mask.gauge.back', '收好。', 'pro.seated')
    ],
  },
  {
    id: 'pro.mask.unit',
    text: '会这么换算的人，关心的不是你还能活多久。\n是你还能做多少次动作。',
    tags: ['key'],
    choices: [go('pro.mask.unit.ok', '……', 'pro.seated')],
  },
  {
    id: 'pro.bunk',
    text: '铺位牌是铝的，用两颗铆钉固定。牌上刻着你的名字。\n床单是新换的，折角压得很平。',
    corruptedText: cor(
      [55, '铺位牌是铝的。牌上刻着你的名字，刻得比别的牌深一点。\n床单是新换的。上面有一个人形的凹。'],
      [22, '床单是新换的。你刚才躺的地方是凉的，旁边那块是热的。'],
    ),
    tags: ['key'],
    onEnter: [learn('k.your-bunk')],
    choices: [
      c({
        id: 'pro.bunk.rivets',
        label: '看铆钉。',
        cost: 2,
        goto: 'pro.bunk.rivets',
      }),
      c({
        id: 'pro.bunk.pry',
        label: '把牌撬下来。',
        cost: 4,
        requires: any(item('scalpel'), item('wrench')),
        gateMode: 'disable',
        effects: [give('nameplate'), setf('did.took-nameplate'), loud(5)],
        goto: 'pro.bunk.pried',
      }),
      c({
        id: 'pro.bunk.sheets',
        label: '摸床单。',
        cost: 1,
        effects: [san(-2)],
        goto: 'pro.bunk.sheets',
      }),
      go('pro.bunk.back', '离开铺位。', 'pro.seated')
    ],
  },
  {
    id: 'pro.bunk.rivets',
    text: '铆钉是新的。铆钉孔周围的漆有一圈磨白，比铆钉大得多。\n这块牌换过。',
    tags: ['key'],
    choices: [
      c({
        id: 'pro.bunk.rivets.count',
        label: '数磨白的圈。',
        cost: 3,
        requires: on('did.count-breaths'),
        gateMode: 'disable',
        effects: [san(-5)],
        goto: 'pro.bunk.rings',
      }),
      go('pro.bunk.rivets.back', '……', 'pro.bunk')
    ],
  },
  {
    id: 'pro.bunk.rings',
    text: '不是一圈。是一排，沿着牌的长边。\n你数到十四就数不下去了，因为后面的叠在一起。',
    corruptedText: cor([40, '你数到十四就数不下去了。数到十四的时候，你想起了一个不属于你的房间。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.bunk.rings.conclude',
        label: '这块牌换了十几次。',
        requires: K('k.your-bunk'),
        effects: [setf('know.plate-replaced')],
        goto: 'pro.bunk.conclude',
      }),
      silence('pro.bunk.rings.silent', 'pro.bunk')
    ],
  },
  {
    id: 'pro.bunk.conclude',
    text: '换牌不是因为牌坏了。铝不坏。\n换牌是因为名字要改。',
    tags: ['key'],
    choices: [go('pro.bunk.conclude.ok', '……', 'pro.bunk')],
  },
  {
    id: 'pro.bunk.pried',
    text: '牌背面有钢印，一行小字：批次 K-9，位 04。\n"位"后面原来有别的数字，被磨掉了。',
    tags: ['key'],
    onEnter: [setf('know.batch-stamp'), setf('did.pried-bunk')],
    choices: [
      c({
        id: 'pro.bunk.pried.pocket',
        label: '揣进口袋。',
        goto: 'pro.bunk',
      }),
      c({
        id: 'pro.bunk.pried.drop',
        label: '放回床上。',
        effects: [take('nameplate')],
        goto: 'pro.bunk',
      })
    ],
  },
  {
    id: 'pro.bunk.sheets',
    onEnter: [setf('did.smelled-sheets')],
    text: '干的。\n你刚才躺的位置也是干的，但你的膝盖是湿的。',
    corruptedText: cor([35, '干的。你的膝盖是湿的。水不是从这里来的，是从你身上来的。']),
    choices: [
      c({
        id: 'pro.bunk.sheets.knee',
        label: '看膝盖。',
        cost: 1,
        effects: [fear(8)],
        goto: 'pro.knee',
      }),
      go('pro.bunk.sheets.back', '不看。', 'pro.bunk')
    ],
  },
  {
    id: 'pro.knee',
    text: '裤子湿到大腿。水线很整齐，像站在水里站了很久，然后水退了。\n不是躺着弄湿的。',
    corruptedText: cor([45, '水线很整齐。你站在水里站了很久。你不记得站在哪里。']),
    tags: ['key'],
    onEnter: [setf('know.water-line'), san(-4)],
    choices: [go('pro.knee.ok', '……', 'pro.bunk')],
  },
  {
    id: 'pro.hatch',
    text: '舱门有手轮，也有一台对讲机。对讲机的红灯亮着，一直亮着，不闪。\n有人开着通话。',
    corruptedText: cor([45, '对讲机的红灯亮着。你听见里面有呼吸。频率和你一样。']),
    tags: ['key', 'hub'],
    onEnter: [sfx('radio.carrier')],
    choices: [
      c({
        id: 'pro.hatch.talk',
        label: '按下通话键。',
        cost: 2,
        effects: [setf('met.vance'), mark('listening', 1), sfx('radio.squelch')],
        goto: 'vance.hail',
      }),
      c({
        id: 'pro.hatch.mute',
        label: '把对讲机关掉。',
        cost: 2,
        irreversible: true,
        effects: [setf('did.muted-radio'), mark('silence', 2), sfx('silence.total')],
        goto: 'pro.muted',
      }),
      c({
        id: 'pro.hatch.wheel',
        label: '直接转手轮。',
        cost: 3,
        effects: [loud(3), sfx('hull.groan')],
        goto: 'pro.threshold',
      }),
      c({
        id: 'pro.hatch.listen',
        label: '贴在门上听。',
        cost: 2,
        goto: 'pro.door.listen',
      })
    ],
  },
  {
    id: 'pro.door.listen',
    onEnter: [setf('did.listened-at-door')],
    text: '门后是水在动，很慢。还有一种声音，间隔二、二、三。\n和舱里的金属一样。',
    corruptedText: cor([40, '门后有人在贴着门听。他的耳朵在你耳朵的位置。']),
    tags: ['key'],
    choices: [
      c({
        id: 'pro.door.listen.knock',
        label: '敲两下。',
        cost: 1,
        effects: [loud(6), mark('listening', 1), sfx('pipe.knock')],
        goto: 'pro.door.knocked',
      }),
      go('pro.door.listen.back', '退开。', 'pro.hatch')
    ],
  },
  {
    id: 'pro.door.knocked',
    text: '门后回敲了三下。\n你敲了两下。',
    corruptedText: cor([50, '门后回敲了三下。第三下在你的面罩里。']),
    tags: ['key'],
    onEnter: [fear(12), shake(0.4), setf('did.knocked-hatch')],
    choices: [
      c({
        id: 'pro.door.knocked.reply',
        label: '再敲一下，凑成三。',
        cost: 1,
        irreversible: true,
        effects: [loud(6), mark('listening', 2), san(-5)],
        goto: 'pro.door.answered',
      }),
      silence('pro.door.knocked.quiet', 'pro.hatch', '把手放下。不凑。')
    ],
  },
  {
    id: 'pro.door.answered',
    text: '安静了。安静得很完整，连金属都不响了。\n然后手轮自己转了四分之一圈。',
    tags: ['key'],
    onEnter: [sfx('silence.total'), setf('did.answered-knock')],
    choices: [go('pro.door.answered.go', '推门。', 'pro.threshold')],
  },
  {
    id: 'pro.muted',
    text: '红灯灭了。舱里剩下你的呼吸。\n只有你的。这是今天第一件确定的事。',
    corruptedText: cor([35, '红灯灭了。舱里剩下你的呼吸。\n和另一份，稍微慢一点。']),
    tags: ['key'],
    onEnter: [san(4)],
    choices: [
      go('pro.muted.wheel', '转手轮。', 'pro.threshold'),
      c({
        id: 'pro.muted.unmute',
        label: '再打开。',
        cost: 2,
        requires: on('did.muted-radio'),
        effects: [setf('met.vance'), mark('silence', -1)],
        goto: 'vance.hail',
      })
    ],
  },
  {
    id: 'pro.threshold',
    text: '走廊往两边延伸，两边都黑。脚下有五公分水，是温的。\n你听见自己踩水的声音传出去，传了很远才停。',
    corruptedText: cor(
      [50, '走廊往两边延伸。你踩水的声音传出去，然后传回来，比原来响。'],
      [20, '走廊只有一边。另一边是你刚才走过来的。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.left-cabin'), sfx('water.drip')],
    choices: [
      c({
        id: 'pro.threshold.mark',
        label: '在门框上划一道记号。',
        cost: 2,
        effects: [setf('did.marked-door'), addf('count.marks', 1)],
        goto: 'pro.marked',
      }),
      c({
        id: 'pro.threshold.count',
        label: '数一下水滴的间隔。',
        cost: 2,
        requires: off('know.dont-count'),
        gateMode: 'lie',
        effects: [addf('count.breaths-counted', 4)],
        goto: 'pro.threshold.counted',
      }),
      c({
        id: 'pro.threshold.count2',
        label: '数一下水滴的间隔。',
        cost: 2,
        requires: on('know.dont-count'),
        effects: [addf('count.breaths-counted', 4), mark('listening', 1), setf('did.count-breaths')],
        goto: 'pro.threshold.counted',
      }),
      c({
        id: 'pro.threshold.go',
        label: '走。',
        cost: 2,
        goto: 'pro.out',
      })
    ],
  },
  {
    id: 'pro.marked',
    text: '一道竖线，指甲盖长。你记住了它的位置：手轮下方，第三颗铆钉左边。\n这是你在这条船上第一件属于你的东西。',
    tags: ['key'],
    choices: [
      go('pro.marked.go', '走。', 'pro.out'),
      c({
        id: 'pro.marked.more',
        label: '再划一道。',
        cost: 2,
        effects: [addf('count.marks', 1)],
        goto: 'pro.threshold',
      })
    ],
  },
  {
    id: 'pro.threshold.counted',
    text: '二、二、三。\n和舱里一样。和门后一样。整条船是一个拍子。',
    corruptedText: cor([40, '二、二、三。你数的和它数的已经分不开了。']),
    tags: ['key'],
    onEnter: [setf('know.ship-tempo')],
    choices: [
      c({
        id: 'pro.threshold.counted.go',
        label: '走。',
        cost: 2,
        goto: 'pro.out',
      })
    ],
  },
  {
    id: 'pro.out',
    text: '你选了一个方向。走了七步之后，身后的舱门关了。\n你没有听见手轮转的声音。',
    corruptedText: cor(
      [50, '你选了一个方向。你走了七步。第七步的水声是从前面传来的。'],
      [18, '你没有选方向。方向选了你，这句话你不会说，但它是准确的。'],
    ),
    tags: ['key'],
    onEnter: [sfx('hull.groan')],
    choices: [
      c({
        id: 'pro.out.back',
        label: '回头试门。',
        cost: 3,
        effects: [fear(6)],
        goto: 'pro.locked',
      }),
      c({
        id: 'pro.out.on',
        label: '不回头。',
        effects: [mark('silence', 1) ],
        goto: 'pro.done',
      })
    ],
  },
  {
    id: 'pro.locked',
    text: '门在。手轮在。你划的那道记号不在。\n铆钉也不是第三颗了。',
    corruptedText: cor([45, '门在。记号在，但在手轮上方。铆钉是第三颗，从另一边数。']),
    tags: ['key'],
    onEnter: [san(-6), fear(10)],
    choices: [
      c({
        id: 'pro.locked.mark-again',
        label: '再划一道，划深一点。',
        cost: 3,
        requires: on('did.marked-door'),
        effects: [addf('count.marks', 1) ],
        goto: 'pro.done',
      }),
      c({
        id: 'pro.locked.compare',
        label: '数记号。',
        cost: 3,
        requires: num('count.marks', '>=', 2),
        gateMode: 'disable',
        effects: [san(-8)],
        goto: 'pro.locked.rule',
      }),
      go('pro.locked.leave', '走。', 'pro.done')
    ],
  },
  {
    id: 'pro.locked.rule',
    text: '两道记号。划过的那两扇门都换了地方，没划过的没有动。\n换的方向一样：往下一层。',
    corruptedText: cor(
      [45, '划过的门都换了地方，没划过的没有动。方向一样：往下。它知道你划了哪几扇。'],
      [20, '划过的门都往下换。你划得越多，下去得越快。这是你自己算出来的。'],
    ),
    tags: ['key'],
    onEnter: [learn('k.reweave-has-rule'), fear(12)],
    choices: [
      c({
        id: 'pro.locked.rule.stop',
        label: '不再划了。',
        cost: 1,
        effects: [mark('apostasy', 1), setf('know.dont-write')],
        goto: 'pro.done',
      }),
      c({
        id: 'pro.locked.rule.more',
        label: '再划一道，看它把我往哪推。',
        cost: 3,
        effects: [addf('count.marks', 1), mark('listening', 1)],
        goto: 'pro.done',
      })
    ],
  },
  {
    id: 'pro.done',
    text: '前面二十米有一点橙色的光。那种光只有一种来源：还没坏的应急灯。\n你朝它走。',
    tags: ['key'],
    choices: [
      c({
        id: 'pro.done.go',
        label: '走过去。',
        cost: 2,
        goto: 'hub.recall',
      })
    ],
  },

  // -------------------------------------------------------------------------
  // 回忆中枢：跨轮回的"你知道的事"。也是本作读取旗标最密集的地方。
  // -------------------------------------------------------------------------
  {
    id: 'hub.recall',
    speaker: undefined,
    text: '你站住，做一件每次都做的事：把知道的东西过一遍。\n第 {{@ordinal}} 次。真相层 {{@layer}}。正典 {{@canon}}。',
    corruptedText: cor(
      [50, '你站住，把知道的东西过一遍。有几条不是你放进去的。'],
      [20, '你站住。清单是空的。清单一直是空的。你每次都这样告诉自己。'],
    ),
    tags: ['entry', 'hub', 'key'],
    choices: [
      c({
        id: 'hub.recall.layer1',
        label: '事故（表层）',
        requires: num('count.truth-layer', '>=', 1),
        gateMode: 'disable',
        goto: 'hub.layer1',
      }),
      c({
        id: 'hub.recall.layer2',
        label: '装置（中层）',
        requires: num('count.truth-layer', '>=', 2),
        gateMode: 'disable',
        goto: 'hub.layer2',
      }),
      c({
        id: 'hub.recall.layer3',
        label: '声音（深层）',
        requires: num('count.truth-layer', '>=', 3),
        gateMode: 'disable',
        goto: 'hub.layer3',
      }),
      c({
        id: 'hub.recall.layer4',
        label: '样本（真层）',
        requires: num('count.truth-layer', '>=', 4),
        gateMode: 'disable',
        goto: 'hub.layer4',
      }),
      c({
        id: 'hub.recall.layer5',
        label: '笔画（底层）',
        requires: num('count.truth-layer', '>=', 5),
        gateMode: 'lie',
        goto: 'hub.layer5',
      }),
      c({
        id: 'hub.recall.marks',
        label: '我做过的记号：{{count.marks|0}} 道',
        requires: num('count.marks', '>=', 1),
        goto: 'hub.marks',
      }),
      c({
        id: 'hub.recall.lies',
        label: '我被骗过 {{count.lies-swallowed|0}} 次',
        requires: num('count.lies-swallowed', '>=', 1),
        effects: [san(3)],
        goto: 'hub.lies',
      }),
      c({
        id: 'hub.recall.futile',
        label: '我做了 {{count.futile-acts|0}} 件没用的事',
        requires: num('count.futile-acts', '>=', 1),
        goto: 'hub.futile',
      }),
      c({ id: 'hub.recall.close', label: '够了。走。', cost: 1, goto: 'hub.exit' })
    ],
  },
  {
    id: 'hub.layer1',
    text: '船破了，人没了，你要出去。\n这个版本能让你活着离开。它的全部优点就是这一点。',
    tags: ['key'],
    choices: [go('hub.layer1.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.layer2',
    text: '这条船是一支麦克风。十九个人签了字，字都不抖。\n他们不是被带下来的。',
    tags: ['key'],
    choices: [
      go('hub.layer2.back', '……', 'hub.recall'),
      c({
        id: 'hub.layer2.sign',
        label: '如果给我一张同意书，我会不会签。',
        requires: K('k.all-volunteers'),
        effects: [addf('count.questions', 1)],
        goto: 'hub.layer2.sign',
      })
    ],
  },
  {
    id: 'hub.layer2.sign',
    text: '你已经签了。签在你自己看不见的地方。\n这一点上，你和他们没有区别；有区别的是你不记得。',
    tags: ['key'],
    choices: [go('hub.layer2.sign.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.layer3',
    text: '声音是真的。这件事最难的部分不是害怕。\n是承认那十九个人是对的。',
    corruptedText: cor([40, '声音是真的。它现在正在你的下颌骨里，靠近左边的智齿。']),
    tags: ['key'],
    choices: [go('hub.layer3.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.layer4',
    text: '你是第 {{@ordinal}} 个。船在重排，是为了把你已经会走的路关掉。\n它在教学。教得很好。',
    tags: ['key'],
    choices: [
      go('hub.layer4.back', '……', 'hub.recall'),
      c({
        id: 'hub.layer4.grade',
        label: '那我学得怎么样。',
        requires: K('k.ship-is-teaching'),
        effects: [addf('count.questions', 1)],
        goto: 'hub.layer4.grade',
      })
    ],
  },
  {
    id: 'hub.layer4.grade',
    text: '你这次比上次快。你这次没有回头。你这次记得数。\n很好。这是个很坏的消息。',
    tags: ['key'],
    choices: [go('hub.layer4.grade.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.layer5',
    text: '你走的路是一笔。八种走法是八笔。\n合起来是一个动词，祈使语气，对象不是你。',
    corruptedText: cor([40, '你走的路是一笔。你现在站的位置正好在笔锋上。']),
    tags: ['key'],
    choices: [
      go('hub.layer5.back', '……', 'hub.recall'),
      c({
        id: 'hub.layer5.stop',
        label: '差一笔的字不是字。',
        requires: K('k.pen-can-stop'),
        goto: 'hub.layer5.stop',
      })
    ],
  },
  {
    id: 'hub.layer5.stop',
    text: '这是你唯一能做的动作，而且只能做一次。\n在月池。',
    tags: ['key'],
    choices: [go('hub.layer5.stop.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.marks',
    text: '{{count.marks|0}} 道。你记得每一道的位置，这不是好记性，是别的东西。\n有几道已经不在原处了。',
    choices: [go('hub.marks.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.lies',
    text: '{{count.lies-swallowed|0}} 次。每一次你都以为自己能做那个动作。\n现在你知道那种"以为"是什么手感了。这就是进步。',
    tags: ['key'],
    choices: [go('hub.lies.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.futile',
    text: '擦掉又回来的水汽，按回去的焊渣，敲了没人应的管子。\n{{count.futile-acts|0}} 件。它们是你这条船上最像自由的部分。',
    choices: [go('hub.futile.back', '……', 'hub.recall')],
  },
  {
    id: 'hub.exit',
    text: '你往橙色的光走。走到第九步的时候，光暗了一下，又亮起来。\n灯丝没坏。是有东西在灯前面过去了。',
    corruptedText: cor([40, '你往橙色的光走。光暗了一下。那个形状是坐着的。']),
    tags: ['key'],
    onEnter: [sfx('lamp.filament'), fear(6) ],
    choices: [
      c({ id: 'hub.exit.go', label: '继续走。', cost: 2, goto: 'hub.open' }),
      c({
        id: 'hub.exit.stop',
        label: '站住，等它再过去一次。',
        cost: 6,
        effects: [san(-5), fear(10)],
        goto: 'hub.exit.wait',
      })
    ],
  },
  {
    id: 'hub.exit.wait',
    text: '等了很久。它没有再过去。\n灯一直亮着，亮得有点太稳了。',
    choices: [c({ id: 'hub.exit.wait.go', label: '走。', cost: 2, goto: 'hub.open' })],
  },
  {
    id: 'hub.open',
    text: '灯下是一个岔口。你现在可以自己决定去哪。\n这句话在这条船上只有一半是真的。',
    tags: ['key', 'hub'],
    onEnter: [setf('did.reached-junction')],
    choices: [
      c({ id: 'hub.open.explore', label: '去看看。', cost: 1, effects: [] }),
      c({
        id: 'hub.open.recall',
        label: '再过一遍清单。',
        requires: on('did.reached-junction'),
        goto: 'hub.recall',
      })
    ],
  }
];
