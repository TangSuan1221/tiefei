/**
 * 仪式 —— 三个。潮、名、息。
 *
 * GDD §7.3：end.congregation = 完成三个仪式 + stigma.listening ≥ 5。
 * 所以这三个仪式必须都能独立完成，而且每一个都要有一条"做到最后一步才反悔"的出口。
 *
 * 设计判据：仪式不是 QTE，是**契约**。每一个仪式都先让你付一点没所谓的东西，
 * 再让你付一点有所谓的东西，最后问你要不要签。
 *   潮 ritual.tide  —— 淹没的圣堂。付：呼吸。留下 drowned。
 *   名 ritual.name  —— 第二十行（主路径在 npc-choir）。付：名字。留下 listening。
 *   息 ritual.breath—— 把呼吸接给船。付：你自己的节拍。留下 iron。
 * 另有一条反向的：摧毁圣物「舌」，留下 apostasy。它不是仪式，是仪式的反面。
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
  openDoor,
  san,
  setf,
  sfx,
  silence,
  status,
  take,
} from '../../narrative/dsl';

export const RITUAL_NODES: readonly NarrativeNode[] = [
  {
    id: 'rit.altar',
    speaker: undefined,
    text: '祭坛是一张海图桌，玻璃面。玻璃下面压着一张手抄的表，三行。\n三行的开头分别是：潮、名、息。',
    corruptedText: cor(
      [50, '玻璃下面压着一张三行的表：潮、名、息。第四行的位置有压痕，没有字。'],
      [20, '玻璃下面是四行。第四行写着你今天走的路。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.found-altar'), sfx('ritual.bell')],
    choices: [
      c({
        id: 'rit.altar.read',
        label: '读那三行。',
        cost: 3,
        effects: [setf('did.read-rites'), setf('know.three-rites')],
        goto: 'rit.three',
      }),
      c({
        id: 'rit.altar.book',
        label: '祭坛下面有一本手册。',
        cost: 3,
        effects: [setf('did.found-manual')],
        goto: 'rit.manual',
      }),
      c({
        id: 'rit.altar.glass',
        label: '敲玻璃。',
        cost: 2,
        effects: [loud(9), setf('did.knocked-glass')],
        goto: 'rit.glass',
      }),
      c({
        id: 'rit.altar.leave',
        label: '离开祭坛。',
        cost: 2,
        effects: [setf('did.left-altar')],
      })
    ],
  },
  {
    id: 'rit.three',
    speaker: undefined,
    text: '潮：站在水里，等它到下巴，不要屏气。\n名：把自己的名字交给唱的人。\n息：把呼吸接到船上。',
    corruptedText: cor([45, '潮、名、息。三行下面各有一个勾的位置。有两个已经打了勾，墨是旧的。']),
    tags: ['key'],
    onEnter: [setf('know.three-rites')],
    choices: [
      c({
        id: 'rit.three.ticks',
        label: '看勾。',
        cost: 2,
        effects: [setf('did.saw-ticks'), san(-6)],
        goto: 'rit.ticks',
      }),
      c({
        id: 'rit.three.tide',
        label: '去淹没的圣堂。',
        cost: 2,
        requires: off('ritual.tide'),
        gateMode: 'hide',
        goto: 'rit.tide.edge',
      }),
      c({
        id: 'rit.three.breath',
        label: '去维生总管。',
        cost: 2,
        requires: off('ritual.breath'),
        gateMode: 'hide',
        goto: 'rit.breath.trunk',
      }),
      c({
        id: 'rit.three.name',
        label: '去礼拜堂。',
        cost: 2,
        requires: all(off('ritual.name'), on('met.choir')),
        gateMode: 'hide',
        goto: 'choir.pews',
      }),
      go('rit.three.back', '……', 'rit.altar')
    ],
  },
  {
    id: 'rit.ticks',
    speaker: undefined,
    text: '潮和息各有一个旧勾。名那一行是空的。\n勾是用同一支笔打的。',
    corruptedText: cor([40, '潮和息各有一个旧勾。名是空的。勾是同一支笔打的。笔在你口袋里。']),
    tags: ['key'],
    onEnter: [setf('know.two-rites-done-before'), san(-6)],
    choices: [
      c({
        id: 'rit.ticks.pen',
        label: '掏出那支笔比一下。',
        cost: 3,
        requires: on('did.kept-the-pen'),
        gateMode: 'hide',
        effects: [setf('did.matched-the-pen'), san(-10)],
        goto: 'rit.pen',
      }),
      go('rit.ticks.back', '……', 'rit.three')
    ],
  },
  {
    id: 'rit.pen',
    speaker: undefined,
    text: '同一支。\n勾是你打的，只是不是这一轮。',
    corruptedText: cor([40, '同一支。勾是你打的。上一轮你打了两个。这一轮你会打第三个。']),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-10)],
    choices: [go('rit.pen.ok', '……', 'rit.three')],
  },
  {
    id: 'rit.manual',
    speaker: undefined,
    text: '手册。第一部分是三个仪式的做法，写得很细，像操作规程。\n第二部分的标题是「回收」。',
    corruptedText: cor([45, '第一部分是三个仪式的做法。第二部分的标题是「回收」。第三部分没有标题。']),
    tags: ['key'],
    onEnter: [setf('did.found-manual')],
    choices: [
      c({
        id: 'rit.manual.two',
        label: '读第二部分。',
        cost: 4,
        effects: [setf('did.read-recovery')],
        goto: 'rit.recovery',
      }),
      c({
        id: 'rit.manual.three',
        label: '有没有第三部分。',
        cost: 3,
        requires: K('k.salvage-is-ritual'),
        gateMode: 'lie',
        effects: [setf('did.sought-part-three')],
        goto: 'rit.partThree',
      }),
      go('rit.manual.back', '合上。', 'rit.altar')
    ],
  },
  {
    id: 'rit.recovery',
    speaker: '手册',
    text: '「样本自最后所在位置回收。记录行进距离、选择序列、终止方式。」\n下一行：「复苏后不提示前次记录。」',
    corruptedText: cor([45, '「样本自最后所在位置回收。」「复苏后不提示前次记录。」（这一页被翻过很多次。）']),
    tags: ['key'],
    onEnter: [learn('k.salvage-is-ritual'), san(-10)],
    choices: [
      c({
        id: 'rit.recovery.words',
        label: '"复苏"和"回收"是同一件事。',
        cost: 2,
        effects: [setf('know.revival-is-recovery'), san(-6)],
        goto: 'rit.sameThing',
      }),
      go('rit.recovery.back', '合上。', 'rit.altar')
    ],
  },
  {
    id: 'rit.sameThing',
    speaker: undefined,
    text: '他们不是在救你。他们在把样本放回去，并记录这次走到哪。\n"仪式"这个词是给样本看的。',
    corruptedText: cor([40, '"仪式"这个词是给样本看的。规程这个词是给他们自己看的。']),
    tags: ['key'],
    onEnter: [learn('k.salvage-is-ritual')],
    choices: [go('rit.sameThing.ok', '……', 'rit.altar')],
  },
  {
    id: 'rit.partThree',
    speaker: '手册',
    text: '有。第三部分只有一句：\n「若样本拒绝终止，暂停回收，等待。」',
    corruptedText: cor([45, '「若样本拒绝终止，暂停回收，等待。」（下面有一行手写的：已等待十七次。）']),
    tags: ['key'],
    onEnter: [setf('know.refusal-clause'), learn('k.pen-can-stop'), san(-8)],
    choices: [
      c({
        id: 'rit.partThree.mean',
        label: '"拒绝终止"是可以的。',
        cost: 2,
        effects: [setf('did.learned-refusal-is-allowed'), san(6)],
        goto: 'rit.allowed',
      }),
      go('rit.partThree.back', '合上。', 'rit.altar')
    ],
  },
  {
    id: 'rit.allowed',
    speaker: undefined,
    text: '规程里写着这一条，说明有人试过。\n试过的人不在名单上，因为名单是给走完的人写的。',
    corruptedText: cor([40, '有人试过。试过的人不在名单上。管子里那个不在名单上。']),
    tags: ['key'],
    onEnter: [learn('k.pen-can-stop'), san(5)],
    choices: [go('rit.allowed.ok', '……', 'rit.altar')],
  },
  {
    id: 'rit.glass',
    speaker: undefined,
    text: '玻璃很厚，敲上去是闷的。\n第三下的时候，礼拜堂那边的合唱停了半秒。',
    corruptedText: cor([40, '第三下的时候合唱停了半秒。他们在听你敲。']),
    tags: ['key'],
    onEnter: [loud(6), fear(10), setf('know.glass-was-heard')],
    choices: [go('rit.glass.ok', '别敲了。', 'rit.altar')],
  },

  // ------------------------------------------------------------------ 潮 TIDE
  {
    id: 'rit.tide.edge',
    speaker: undefined,
    text: '淹没的圣堂。水面平得像玻璃，没有一丝波。\n水面上浮着一层很薄的油，油上有六个脚印的空缺。',
    corruptedText: cor(
      [50, '水面平得像玻璃。油上有六个脚印的空缺。第七个空缺在你脚下。'],
      [20, '水面上没有油。水面上是天花板的倒影，倒影里有人站着。'],
    ),
    tags: ['entry', 'key'],
    onEnter: [setf('did.reached-flooded-chapel'), sfx('water.rise'), fear(12)],
    choices: [
      c({
        id: 'rit.tide.edge.step',
        label: '下水。',
        cost: 4,
        effects: [setf('did.entered-water'), mark('drowned', 1), san(-6)],
        goto: 'rit.tide.knee',
      }),
      c({
        id: 'rit.tide.edge.prints',
        label: '看那六个空缺。',
        cost: 3,
        effects: [setf('did.examined-prints')],
        goto: 'rit.tide.prints',
      }),
      c({
        id: 'rit.tide.edge.back',
        label: '不下。',
        cost: 2,
        effects: [mark('silence', 1), setf('did.refused-water')],
      })
    ],
  },
  {
    id: 'rit.tide.prints',
    speaker: undefined,
    text: '六个空缺排成弧形，朝着同一个方向。\n和礼拜堂里那六个跪印的排法一样。',
    corruptedText: cor([40, '六个空缺排成弧形。和礼拜堂那六个跪印一样。他们先在这里站过。']),
    tags: ['key'],
    onEnter: [setf('know.prints-match-chapel')],
    choices: [
      c({
        id: 'rit.tide.prints.step',
        label: '站到第七个位置。',
        cost: 4,
        effects: [setf('did.took-seventh-place'), mark('drowned', 1), mark('listening', 1), san(-8)],
        goto: 'rit.tide.knee',
      }),
      go('rit.tide.prints.back', '退开。', 'rit.tide.edge')
    ],
  },
  {
    id: 'rit.tide.knee',
    speaker: undefined,
    text: '水到膝盖。温的。\n再往前两步就到腰。',
    corruptedText: cor([45, '水到膝盖，温的。你的膝盖本来就是湿的。']),
    tags: ['key'],
    onEnter: [sfx('water.rise')],
    choices: [
      c({
        id: 'rit.tide.knee.on',
        label: '往前两步。',
        cost: 4,
        effects: [setf('did.waded-deeper'), mark('drowned', 1), san(-6)],
        goto: 'rit.tide.chest',
      }),
      c({
        id: 'rit.tide.knee.back',
        label: '退出来。',
        cost: 4,
        effects: [setf('did.waded-back'), mark('silence', 1)],
      })
    ],
  },
  {
    id: 'rit.tide.chest',
    speaker: undefined,
    text: '水到胸口。面罩还在水面上。\n水里没有声音。这是整条船上唯一没有声音的地方。',
    corruptedText: cor(
      [45, '水到胸口。水里没有声音。这是唯一没有声音的地方。所以这里最危险。'],
      [20, '水到胸口。水里有一个人贴着你站着，和你一样高。'],
    ),
    tags: ['key'],
    onEnter: [san(-8), fear(16)],
    choices: [
      c({
        id: 'rit.tide.chest.chin',
        label: '再往前，让水到下巴。',
        cost: 6,
        irreversible: true,
        effects: [setf('did.water-to-chin'), mark('drowned', 2), san(-10)],
        goto: 'rit.tide.chin',
      }),
      c({
        id: 'rit.tide.chest.hold',
        label: '屏气，潜下去看。',
        cost: 8,
        requires: off('know.dont-count'),
        gateMode: 'lie',
        effects: [san(-6)],
        goto: 'rit.tide.under',
      }),
      c({
        id: 'rit.tide.chest.back',
        label: '退出来。',
        cost: 6,
        effects: [setf('did.waded-back'), mark('silence', 1)],
      })
    ],
  },
  {
    id: 'rit.tide.under',
    speaker: undefined,
    text: '水下是一间完整的礼拜堂，长凳朝上。\n凳子上坐着人，坐得很端正，都朝着你这个方向。',
    corruptedText: cor([40, '凳子上坐着人，都朝着你。你数了一下，十九个。']),
    tags: ['key'],
    onEnter: [san(-16), fear(24), setf('know.chapel-below')],
    choices: [
      c({
        id: 'rit.tide.under.up',
        label: '上去。',
        cost: 6,
        effects: [setf('did.surfaced'), fear(10)],
        goto: 'rit.tide.chest',
      }),
      c({
        id: 'rit.tide.under.sit',
        label: '找一个空位坐下。',
        cost: 10,
        irreversible: true,
        effects: [setf('did.sat-underwater'), mark('drowned', 3), mark('listening', 2), san(-14)],
        goto: 'rit.tide.seated',
      })
    ],
  },
  {
    id: 'rit.tide.seated',
    speaker: undefined,
    text: '空位只有一个，在最后一排靠边。\n坐下之后，所有人的方向变了，改朝前面。',
    corruptedText: cor([40, '空位只有一个。坐下之后所有人改朝前面。前面是讲坛。讲坛上没有人。']),
    tags: ['key'],
    onEnter: [san(-12), setf('know.they-turned-forward'), addf('count.futile-acts', 1)],
    choices: [
      c({
        id: 'rit.tide.seated.stand',
        label: '站起来，上去。',
        cost: 10,
        effects: [setf('did.left-the-pew'), san(4), mark('apostasy', 1)],
        goto: 'rit.tide.chest',
      }),
      c({
        id: 'rit.tide.seated.stay',
        label: '坐着。',
        cost: 20,
        irreversible: true,
        effects: [setf('did.stayed-underwater'), mark('drowned', 4), san(-16)],
        goto: 'rit.tide.drownChoice',
      })
    ],
  },
  {
    id: 'rit.tide.drownChoice',
    speaker: undefined,
    text: '面罩里的氧还够一会儿。够你站起来，也够你不站起来。\n这是这条船上最诚实的一个选择。',
    corruptedText: cor([40, '氧还够一会儿。够站起来，也够不站起来。诚实得让人不舒服。']),
    tags: ['key'],
    onEnter: [fear(20)],
    choices: [
      c({
        id: 'rit.tide.drownChoice.stand',
        label: '站起来。',
        cost: 12,
        effects: [setf('did.chose-to-stand'), san(8), mark('apostasy', 1)],
        goto: 'rit.tide.chest',
      }),
      c({
        id: 'rit.tide.drownChoice.open',
        label: '打开面罩。',
        cost: 4,
        irreversible: true,
        effects: [setf('did.opened-mask-underwater'), mark('drowned', 6), sfx('ritual.drown')],
        goto: 'rit.tide.drowned',
      })
    ],
  },
  {
    id: 'rit.tide.drowned',
    speaker: undefined,
    text: '水进来的时候是温的。\n第一口很难，第二口就不难了。',
    corruptedText: cor([40, '第一口很难，第二口就不难了。第三口你已经在唱了。']),
    tags: ['key', 'terminal'],
    onEnter: [setf('did.drowned-self'), sfx('ritual.drown')],
    choices: [
      c({
        id: 'rit.tide.drowned.end',
        label: '……',
        cost: 1,
        effects: [setf('did.drowned-self')],
        goto: 'end.scene.drowned',
      })
    ],
  },
  {
    id: 'rit.tide.chin',
    speaker: undefined,
    text: '水到下巴。手册上说：不要屏气。\n那就是要正常呼吸，而正常呼吸会吸到水。',
    corruptedText: cor([45, '水到下巴。手册上说不要屏气。正常呼吸会吸到水。这就是仪式。']),
    tags: ['key'],
    onEnter: [fear(22), san(-8)],
    choices: [
      c({
        id: 'rit.tide.chin.breathe',
        label: '正常呼吸。',
        cost: 10,
        irreversible: true,
        effects: [
          setf('ritual.tide'),
          addf('ritual.count', 1),
          mark('drowned', 3),
          mark('listening', 1),
          san(-14),
          status('status.communion', 400)
        ],
        goto: 'rit.tide.done',
      }),
      c({
        id: 'rit.tide.chin.hold',
        label: '屏气。',
        cost: 6,
        effects: [setf('did.held-breath-in-rite'), mark('silence', 2), san(4)],
        goto: 'rit.tide.failed',
      })
    ],
  },
  {
    id: 'rit.tide.done',
    speaker: undefined,
    text: '吸进去三口。咳不出来，但是不疼。\n从这里起，你能听见水那一边。',
    corruptedText: cor([40, '吸进去三口。不疼。从这里起你能听见水那一边。那一边一直在说话。']),
    tags: ['key'],
    onEnter: [setf('ritual.tide'), learn('k.signal-in-blood'), san(-10)],
    choices: [
      c({
        id: 'rit.tide.done.out',
        label: '上岸。',
        cost: 6,
        effects: [setf('did.left-the-water')],
      }),
      c({
        id: 'rit.tide.done.listen',
        label: '听。',
        cost: 8,
        effects: [setf('did.listened-underwater'), mark('listening', 2), san(-8)],
        goto: 'rit.tide.heard',
      })
    ],
  },
  {
    id: 'rit.tide.heard',
    speaker: undefined,
    text: '水那一边是十九个人在报数，报得很慢。\n报到第二十的时候留了半拍。',
    corruptedText: cor([40, '十九个人在报数。报到第二十留半拍。半拍里有你的呼吸。']),
    tags: ['key'],
    onEnter: [learn('k.signal-is-real'), san(-8)],
    choices: [
      c({
        id: 'rit.tide.heard.out',
        label: '上岸。',
        cost: 6,
        effects: [setf('did.left-the-water')],
      })
    ],
  },
  {
    id: 'rit.tide.failed',
    speaker: undefined,
    text: '屏气了。水面在你下巴那里停了很久，然后开始退。\n仪式没有成。你身上是干的那部分现在也湿了。',
    corruptedText: cor([40, '屏气了。水退了。仪式没成。它会再给你一次机会，它很有耐心。']),
    tags: ['key'],
    onEnter: [san(4), setf('know.rite-can-be-refused')],
    choices: [
      c({
        id: 'rit.tide.failed.again',
        label: '再来一次。',
        cost: 6,
        requires: off('ritual.tide'),
        gateMode: 'hide',
        goto: 'rit.tide.chin',
      }),
      c({
        id: 'rit.tide.failed.out',
        label: '上岸。',
        cost: 6,
        effects: [setf('did.left-the-water'), mark('silence', 1)],
      })
    ],
  },

  // ----------------------------------------------------------------- 息 BREATH
  {
    id: 'rit.breath.trunk',
    speaker: undefined,
    text: '维生总管。一排十九个接口，十八个堵着，一个开着。\n开着那个的螺纹是新的。',
    corruptedText: cor(
      [50, '十九个接口，十八个堵着，一个开着。开着那个的螺纹是新的，每次都是新的。'],
      [20, '十九个接口都开着。都在呼吸。'],
    ),
    tags: ['entry', 'key'],
    onEnter: [setf('did.found-trunk'), sfx('hull.groan')],
    choices: [
      c({
        id: 'rit.breath.trunk.count',
        label: '数接口。',
        cost: 3,
        effects: [addf('count.breaths-counted', 19), setf('did.counted-ports'), mark('listening', 1)],
        goto: 'rit.breath.ports',
      }),
      c({
        id: 'rit.breath.trunk.open',
        label: '看那个开着的。',
        cost: 3,
        effects: [setf('did.examined-open-port')],
        goto: 'rit.breath.port',
      }),
      c({
        id: 'rit.breath.trunk.leave',
        label: '走开。',
        cost: 2,      })
    ],
  },
  {
    id: 'rit.breath.ports',
    speaker: undefined,
    text: '十九个。和名单一样长。\n堵着的那些，堵头上都刻了一个名字。',
    corruptedText: cor([40, '十九个。堵头上都刻了名字。空着那个的堵头在地上，上面刻着你的名字。']),
    tags: ['key'],
    onEnter: [setf('know.ports-are-named')],
    choices: [
      c({
        id: 'rit.breath.ports.mine',
        label: '找地上的堵头。',
        cost: 3,
        effects: [setf('did.found-my-plug'), san(-10)],
        goto: 'rit.breath.plug',
      }),
      go('rit.breath.ports.back', '……', 'rit.breath.trunk')
    ],
  },
  {
    id: 'rit.breath.plug',
    speaker: undefined,
    text: '在地上，滚到管脚边了。上面刻着你的名字。\n刻痕的起笔在右上。',
    corruptedText: cor([40, '上面刻着你的名字，起笔在右上。有人把它拧下来的时候很急。']),
    tags: ['key'],
    onEnter: [learn('k.you-are-sample-n'), san(-8)],
    choices: [
      c({
        id: 'rit.breath.plug.screw',
        label: '把堵头拧回去。',
        cost: 6,
        effects: [setf('did.plugged-my-port'), mark('silence', 3), san(6), sfx('hull.tick')],
        goto: 'rit.breath.plugged',
      }),
      c({
        id: 'rit.breath.plug.pocket',
        label: '收起来。',
        cost: 2,
        effects: [setf('did.kept-my-plug')],
        goto: 'rit.breath.trunk',
      })
    ],
  },
  {
    id: 'rit.breath.plugged',
    speaker: undefined,
    text: '拧到底，还剩四分之一圈拧不动。\n四分之一圈的缝隙里，能感觉到很轻的吸力。',
    corruptedText: cor([40, '还剩四分之一圈。缝隙里有很轻的吸力。它在等那四分之一圈。']),
    tags: ['key'],
    onEnter: [setf('know.quarter-turn-left'), san(4)],
    choices: [
      c({
        id: 'rit.breath.plugged.force',
        label: '用管钳硬拧。',
        cost: 8,
        requires: item('wrench'),
        gateMode: 'disable',
        effects: [setf('did.forced-the-plug'), mark('silence', 2), loud(14), san(5)],
        goto: 'rit.breath.sealed',
      }),
      go('rit.breath.plugged.back', '算了。', 'rit.breath.trunk')
    ],
  },
  {
    id: 'rit.breath.sealed',
    speaker: undefined,
    text: '拧到底了。吸力没有了。\n十九个接口全堵。这条船现在不从任何人身上取气。',
    corruptedText: cor([40, '十九个接口全堵。它不从任何人身上取气了。它现在很安静，安静得在等。']),
    tags: ['key'],
    onEnter: [setf('did.sealed-all-ports'), mark('silence', 3), san(8)],
    choices: [
      c({
        id: 'rit.breath.sealed.ok',
        label: '走。',
        cost: 2,      })
    ],
  },
  {
    id: 'rit.breath.port',
    speaker: undefined,
    text: '开着的接口内径和面罩的进气口一样。\n旁边挂着一段软管，长度刚好够一个人站着接上。',
    corruptedText: cor([45, '内径和面罩进气口一样。软管长度刚好够一个人站着接。刚好，一点不多。']),
    tags: ['key'],
    onEnter: [setf('know.hose-fits')],
    choices: [
      c({
        id: 'rit.breath.port.connect',
        label: '把软管接到面罩上。',
        cost: 6,
        irreversible: true,
        effects: [setf('did.connected-hose'), mark('iron', 2), san(-8)],
        goto: 'rit.breath.connected',
      }),
      c({
        id: 'rit.breath.port.smell',
        label: '闻一下管口。',
        cost: 2,
        effects: [setf('did.smelled-the-port'), san(-4)],
        goto: 'rit.breath.smell',
      }),
      go('rit.breath.port.back', '不接。', 'rit.breath.trunk')
    ],
  },
  {
    id: 'rit.breath.smell',
    speaker: undefined,
    text: '里面出来的气是干的，没有铁味。\n有一点别的味道，像很久以前的食堂。',
    corruptedText: cor([40, '气是干的，没有铁味。有一点食堂的味道。很久以前的食堂。碗放着，她收。']),
    tags: ['key'],
    onEnter: [setf('know.galley-smell'), san(-4)],
    choices: [go('rit.breath.smell.back', '……', 'rit.breath.port')],
  },
  {
    id: 'rit.breath.connected',
    speaker: undefined,
    text: '接上了。氧气表的指针停住不动。\n呼吸变得不用力，但节拍不是你的了——是二、二、三。',
    corruptedText: cor(
      [45, '接上了。指针不动。呼吸不用力。节拍是二、二、三，不是你的。'],
      [20, '接上了。你不需要呼吸了。你只需要同意。'],
    ),
    tags: ['key'],
    onEnter: [status('status.iron-lung', -1), setf('did.connected-hose'), san(-8)],
    choices: [
      c({
        id: 'rit.breath.connected.accept',
        label: '跟着这个节拍呼吸。',
        cost: 8,
        irreversible: true,
        effects: [
          setf('ritual.breath'),
          addf('ritual.count', 1),
          mark('iron', 3),
          mark('listening', 1),
          san(-12)
        ],
        goto: 'rit.breath.done',
      }),
      c({
        id: 'rit.breath.connected.own',
        label: '按自己的节拍呼吸。',
        cost: 10,
        effects: [setf('did.kept-own-rhythm'), mark('silence', 2), san(6)],
        goto: 'rit.breath.resisted',
      }),
      c({
        id: 'rit.breath.connected.pull',
        label: '拔掉。',
        cost: 4,
        effects: [setf('did.pulled-the-hose'), mark('apostasy', 1), loud(10)],
        goto: 'rit.breath.trunk',
      })
    ],
  },
  {
    id: 'rit.breath.done',
    speaker: undefined,
    text: '跟上以后就不用想了。\n船的应力声和你的呼吸变成同一件事。',
    corruptedText: cor([40, '不用想了。船的应力声和你的呼吸是同一件事。这是今天最省力的时刻。']),
    tags: ['key'],
    onEnter: [setf('ritual.breath'), learn('k.listening-array'), san(-10)],
    choices: [
      c({
        id: 'rit.breath.done.stay',
        label: '就这样待着。',
        cost: 20,
        irreversible: true,
        effects: [setf('did.stayed-connected'), mark('iron', 4), san(-12)],
        goto: 'rit.breath.merged',
      }),
      c({
        id: 'rit.breath.done.leave',
        label: '拔掉，走。',
        cost: 6,
        effects: [setf('did.pulled-the-hose'), san(4)],
      })
    ],
  },
  {
    id: 'rit.breath.merged',
    speaker: undefined,
    text: '待到某个时候，你发现自己不需要数了。\n数是船在数。',
    corruptedText: cor([40, '你不需要数了。数是船在数。你终于遵守了补板上那三个字。']),
    tags: ['key'],
    onEnter: [san(-14), setf('know.ship-counts-for-me')],
    choices: [
      c({
        id: 'rit.breath.merged.commit',
        label: '把面罩的密封圈也焊上。',
        cost: 12,
        requires: item('welder'),
        gateMode: 'disable',
        irreversible: true,
        effects: [setf('did.welded-into-ship'), mark('iron', 6), sfx('weld.arc')],
        goto: 'rit.breath.iron',
      }),
      c({
        id: 'rit.breath.merged.pull',
        label: '拔掉。',
        cost: 8,
        effects: [setf('did.pulled-the-hose'), san(6), mark('apostasy', 1)],
      })
    ],
  },
  {
    id: 'rit.breath.iron',
    speaker: undefined,
    text: '焊完了。面罩现在是船的一部分。\n你能听见十九个接口，其中十八个是空的。',
    corruptedText: cor([40, '面罩是船的一部分。十九个接口，十八个空的。现在有一个不空了。']),
    tags: ['key', 'terminal'],
    onEnter: [setf('did.became-iron-lung'), mark('iron', 4)],
    choices: [
      c({
        id: 'rit.breath.iron.end',
        label: '……',
        cost: 1,
        effects: [setf('did.became-iron-lung')],
        goto: 'end.scene.iron',
      })
    ],
  },
  {
    id: 'rit.breath.resisted',
    speaker: undefined,
    text: '按自己的节拍呼吸要用力，比不接管子还费力。\n十个呼吸之后，管子里的节拍改成了你的。',
    corruptedText: cor([40, '十个呼吸之后，管子里的节拍改成了你的。它学得很快。它一直在学。']),
    tags: ['key'],
    onEnter: [san(-6), setf('know.it-copied-me'), fear(16)],
    choices: [
      c({
        id: 'rit.breath.resisted.pull',
        label: '拔掉。',
        cost: 4,
        effects: [setf('did.pulled-the-hose'), mark('apostasy', 1), san(4)],
        goto: 'rit.breath.trunk',
      }),
      c({
        id: 'rit.breath.resisted.keep',
        label: '继续按自己的节拍。',
        cost: 12,
        effects: [setf('did.kept-own-rhythm'), mark('silence', 3), san(-6)],
        goto: 'rit.breath.stubborn',
      })
    ],
  },
  {
    id: 'rit.breath.stubborn',
    speaker: undefined,
    text: '你坚持了很久。管子跟着你改了三次。\n第四次的时候它不改了，它开始等你累。',
    corruptedText: cor([40, '管子跟着你改了三次。第四次它不改了。它在等你累。它有很多时间。']),
    tags: ['key'],
    onEnter: [setf('know.it-waits-for-fatigue'), san(-4)],
    choices: [
      c({
        id: 'rit.breath.stubborn.pull',
        label: '拔掉。',
        cost: 4,
        effects: [setf('did.pulled-the-hose'), mark('silence', 1), san(5)],
        goto: 'rit.breath.trunk',
      })
    ],
  },

  // -------------------------------------------------------------- 舌 / 叛教
  {
    id: 'rit.relic.room',
    speaker: undefined,
    text: '圣物室。一个玻璃钟罩，罩里是一块肉，暗红，表面有细密的沟。\n罩子外面有一圈水汽，是从里面呼出来的。',
    corruptedText: cor(
      [50, '钟罩里是一块肉，表面有细密的沟。罩外一圈水汽，从里面呼出来的。它在呼吸。'],
      [20, '钟罩里是一条舌头。它在说话。说的是名单。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.found-relic'), fear(18), san(-8), sfx('ritual.bell')],
    choices: [
      c({
        id: 'rit.relic.room.look',
        label: '凑近看那些沟。',
        cost: 3,
        effects: [setf('did.examined-relic'), san(-6)],
        goto: 'rit.relic.grooves',
      }),
      c({
        id: 'rit.relic.room.listen',
        label: '把耳朵贴在钟罩上。',
        cost: 4,
        effects: [setf('did.listened-to-relic'), mark('listening', 2), san(-10)],
        goto: 'rit.relic.listen',
      }),
      c({
        id: 'rit.relic.room.lift',
        label: '掀开钟罩。',
        cost: 6,
        irreversible: true,
        effects: [setf('did.lifted-the-bell'), loud(12), fear(16)],
        goto: 'rit.relic.open',
      }),
      c({
        id: 'rit.relic.room.leave',
        label: '出去。',
        cost: 2,
        effects: [mark('silence', 1)],
      })
    ],
  },
  {
    id: 'rit.relic.grooves',
    speaker: undefined,
    text: '沟不是随机的。是五条主沟，每条上面有横的分叉。\n那是五线谱。',
    corruptedText: cor([40, '五条主沟，横的分叉。那是五线谱。谱上的调和礼拜堂那个一样。']),
    tags: ['key'],
    onEnter: [setf('know.relic-is-a-score'), san(-6)],
    choices: [
      c({
        id: 'rit.relic.grooves.read',
        label: '照着读。',
        cost: 4,
        requires: on('did.memorized-melody'),
        gateMode: 'disable',
        effects: [learn('k.signal-is-real'), setf('did.read-the-score'), san(-8)],
        goto: 'rit.relic.score',
      }),
      go('rit.relic.grooves.back', '……', 'rit.relic.room')
    ],
  },
  {
    id: 'rit.relic.score',
    speaker: undefined,
    text: '和唱诗班唱的是同一段。\n这块肉比那六个人早很多年。',
    corruptedText: cor([40, '同一段。这块肉比那六个人早很多年。它是原件。']),
    tags: ['key'],
    onEnter: [learn('k.signal-is-real'), setf('know.relic-is-original')],
    choices: [go('rit.relic.score.back', '……', 'rit.relic.room')],
  },
  {
    id: 'rit.relic.listen',
    speaker: undefined,
    text: '罩子里很安静。安静里有一个很低的东西，间隔二、二、三。\n和你的心跳错开半拍。',
    corruptedText: cor([40, '二、二、三，和你的心跳错开半拍。错开的半拍正在缩小。']),
    tags: ['key'],
    onEnter: [san(-10), fear(14), setf('know.relic-rhythm')],
    choices: [
      c({
        id: 'rit.relic.listen.match',
        label: '让心跳对上它。',
        cost: 8,
        irreversible: true,
        effects: [setf('did.synced-with-relic'), mark('listening', 3), san(-12)],
        goto: 'rit.relic.synced',
      }),
      c({
        id: 'rit.relic.listen.off',
        label: '把耳朵拿开。',
        cost: 2,
        effects: [mark('silence', 1), setf('did.pulled-away-from-relic'), san(3)],
        goto: 'rit.relic.room',
      })
    ],
  },
  {
    id: 'rit.relic.synced',
    speaker: undefined,
    text: '对上了。对上之后钟罩里的水汽散了。\n它不需要再呼吸，因为你在替它呼吸。',
    corruptedText: cor([40, '对上了。水汽散了。你在替它呼吸。这很省它的力。']),
    tags: ['key'],
    onEnter: [san(-12), mark('listening', 2), setf('know.i-breathe-for-it')],
    choices: [go('rit.relic.synced.back', '……', 'rit.relic.room')],
  },
  {
    id: 'rit.relic.open',
    speaker: undefined,
    text: '钟罩掀开了。那块肉在空气里缩了一下。\n缩的时候，整条船的应力声停了。',
    corruptedText: cor(
      [45, '钟罩掀开。肉缩了一下。整条船的应力声停了。所有的声音都在等。'],
      [20, '钟罩掀开。肉伸开了。'],
    ),
    tags: ['key'],
    onEnter: [sfx('silence.total'), fear(24), san(-12)],
    choices: [
      c({
        id: 'rit.relic.open.take',
        label: '拿走。',
        cost: 4,
        effects: [give('relic.tongue'), setf('did.took-relic'), mark('flesh', 2), mark('apostasy', 1)],
        goto: 'rit.relic.taken',
      }),
      c({
        id: 'rit.relic.open.destroy',
        label: '毁掉。',
        cost: 8,
        irreversible: true,
        effects: [setf('did.destroyed-relic'), mark('apostasy', 4), loud(28), san(-6)],
        goto: 'rit.relic.destroyed',
      }),
      c({
        id: 'rit.relic.open.eat',
        label: '吃掉。',
        cost: 10,
        requires: all(K('k.signal-in-blood'), on('ritual.tide')),
        gateMode: 'lie',
        irreversible: true,
        effects: [setf('did.ate-relic'), mark('flesh', 4), mark('listening', 3), san(-20)],
        goto: 'rit.relic.eaten',
      }),
      c({
        id: 'rit.relic.open.cover',
        label: '盖回去。',
        cost: 4,
        effects: [setf('did.covered-relic'), mark('silence', 2), san(4)],
        goto: 'rit.relic.room',
      })
    ],
  },
  {
    id: 'rit.relic.taken',
    speaker: undefined,
    text: '在手里很重，比看上去重。\n它在你手心里按二、二、三跳。隔着手套也能感觉到。',
    corruptedText: cor([40, '比看上去重。它在你手心里按二、二、三跳。你的手跟着跳。']),
    tags: ['key'],
    onEnter: [setf('did.took-relic'), fear(12)],
    choices: [
      c({
        id: 'rit.relic.taken.destroy',
        label: '毁掉。',
        cost: 8,
        irreversible: true,
        effects: [take('relic.tongue'), setf('did.destroyed-relic'), mark('apostasy', 4), loud(24)],
        goto: 'rit.relic.destroyed',
      }),
      c({
        id: 'rit.relic.taken.keep',
        label: '带着。',
        cost: 2,
        effects: [setf('did.carrying-relic')],
      })
    ],
  },
  {
    id: 'rit.relic.destroyed',
    speaker: undefined,
    text: '毁掉一块肉不难。难的是毁完以后那三秒。\n那三秒里没有任何声音，包括你自己的呼吸。',
    corruptedText: cor(
      [45, '毁完以后那三秒没有任何声音，包括你自己的呼吸。三秒之后有一样东西回来了，不是声音。'],
      [20, '毁掉了。它现在在你的手指缝里。'],
    ),
    tags: ['key'],
    onEnter: [
      setf('did.destroyed-relic'),
      mark('apostasy', 2),
      sfx('silence.total'),
      san(-8),
      fear(20)
    ],
    choices: [
      c({
        id: 'rit.relic.destroyed.listen',
        label: '听那三秒。',
        cost: 4,
        effects: [setf('did.heard-the-silence'), san(6)],
        goto: 'rit.relic.silence',
      }),
      c({
        id: 'rit.relic.destroyed.run',
        label: '跑。',
        cost: 6,
        effects: [loud(12), setf('did.ran-from-reliquary'), fear(10)],
      })
    ],
  },
  {
    id: 'rit.relic.silence',
    speaker: undefined,
    text: '三秒过去，回来的不是声音，是一个方向。\n你现在知道月池在哪，不用声呐。',
    corruptedText: cor([40, '回来的是一个方向。你知道月池在哪了。它希望你知道。']),
    tags: ['key'],
    onEnter: [setf('know.moonpool-direction'), openDoor('door.moonpool')],
    choices: [
      c({
        id: 'rit.relic.silence.go',
        label: '走。',
        cost: 2,      })
    ],
  },
  {
    id: 'rit.relic.eaten',
    speaker: undefined,
    text: '咽下去要四口。第三口的时候你的后颈那道缝合线热了一下。\n然后你听见的东西变多了：不是更响，是更多。',
    corruptedText: cor([40, '咽下去四口。后颈热了一下。你听见的东西变多了。多到分不出哪个是自己。']),
    tags: ['key'],
    onEnter: [
      setf('did.ate-relic'),
      learn('k.signal-in-blood'),
      status('status.communion', -1),
      san(-16)
    ],
    choices: [
      c({
        id: 'rit.relic.eaten.list',
        label: '听那些东西。',
        cost: 6,
        effects: [setf('did.listened-to-all'), mark('listening', 3), san(-10)],
        goto: 'rit.relic.chorus',
      }),
      c({
        id: 'rit.relic.eaten.go',
        label: '出去。',
        cost: 3,      })
    ],
  },
  {
    id: 'rit.relic.chorus',
    speaker: undefined,
    text: '十九个人在报数。一个小孩在数到八。一个人在报水位。\n一个女人在问有没有吃过东西。',
    corruptedText: cor([40, '十九个人报数。一个小孩数到八。一个人报水位。一个女人在问。还有一个在写。']),
    tags: ['key'],
    onEnter: [learn('k.signal-is-real'), san(-10), setf('know.heard-them-all')],
    choices: [
      c({
        id: 'rit.relic.chorus.writer',
        label: '还有一个在写。',
        cost: 3,
        requires: K('k.vance-is-the-recorder'),
        gateMode: 'disable',
        effects: [learn('k.author-is-not-it'), san(-10)],
        goto: 'rit.relic.writer',
      }),
      c({
        id: 'rit.relic.chorus.go',
        label: '出去。',
        cost: 3,      })
    ],
  },
  {
    id: 'rit.relic.writer',
    speaker: undefined,
    text: '那个在写的声音是笔尖划纸，不是说话。\n它不会写字。它只会听。写字的一直是我们。',
    corruptedText: cor([40, '它不会写字。它只会听。写字的一直是我们。这一点没有人告诉过它。']),
    tags: ['key'],
    onEnter: [learn('k.author-is-not-it'), san(-8)],
    choices: [
      c({
        id: 'rit.relic.writer.go',
        label: '出去。',
        cost: 3,      })
    ],
  }
];
