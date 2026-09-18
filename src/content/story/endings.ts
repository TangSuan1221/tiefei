/**
 * 八个结局 —— 定义 + 落幕场景。
 *
 * GDD §7.3 的条件表在 ENDINGS 里逐条对应。两条需要说明（已写入 docs/narrative-bible.md）：
 *
 *  1. end.silence 的"stigma.silence 最高"无法在 Condition DSL 里表达"互相比较"，
 *     故拆成：silence ≥ 6 且 listening/drowned/iron 各 ≤ 2。语义等价于"沉默是主导圣痕"。
 *  2. 逃生舱的释放杆做了硬门控：只有当这一次的"笔画"已经收得完整（对应
 *     surface / silence / apostate 三种收笔方式）时才拉得动。拉不动的那次不是 bug，
 *     是主题 —— 差一笔的字不成字，所以船不放你走。拉不动就会死，死了就是下一轮。
 *
 * 落幕场景一律用 `finish()` 直接定音，不依赖 resolveEnding 的优先级；
 * resolveEnding 的优先级用于"死亡/超时"等非内容路径的兜底判定与冲突诊断。
 */

import type { Ending, NarrativeNode } from '../../core/contract';
import {
  addf,
  all,
  any,
  c,
  cor,
  fear,
  finish,
  go,
  item,
  K,
  learn,
  loud,
  mark,
  num,
  off,
  on,
  san,
  sanAbove,
  setf,
  sfx,
  silence,
  stig,
  take,
} from '../../narrative/dsl';

// ---------------------------------------------------------------------------
// 结局定义
// ---------------------------------------------------------------------------

export const ENDINGS: readonly Ending[] = [
  {
    id: 'end.author',
    title: '书写者',
    subtitle: '差一笔的字，不是字。',
    body:
      '你把笔留在了空白页上，没有合上。\n' +
      '月池的水面还是高两指。它等了半拍，又等了半拍，然后开始等别的东西。\n' +
      '海床上有十七条线。第十八条停在离收笔还有一寸的地方。\n' +
      '这个字永远不会成立。为此，你必须一直知道自己停在哪里。',
    requires: all(
      on('did.final-choice-at-pool'),
      num('count.truth-layer', '>=', 5),
      num('count.cycles-witnessed', '>=', 4),
    ),
    priority: 100,
    rank: 'true',
    unlocks: ['meta.pen', 'meta.eighth-column'],
  },
  {
    id: 'end.zero',
    title: '零号',
    subtitle: '你回到了架子上。',
    body:
      '零号舱不在图纸上，因为它不属于这条船。\n' +
      '架子上有二十个位置。十九个是空的，绒布立着。\n' +
      '你躺进第二十个，尺寸正好。躺下之后有人替你把床单拉平。\n' +
      '记录员在表格上写：行进完成。终止方式——留任。',
    requires: all(on('did.entered-zero'), num('count.truth-layer', '>=', 4)),
    priority: 90,
    rank: 'secret',
    unlocks: ['meta.zero-berth'],
  },
  {
    id: 'end.drowned',
    title: '溺者',
    subtitle: '正常呼吸。',
    body:
      '手册第一行写着：不要屏气。\n' +
      '你照做了。第一口最难，第二口不难。\n' +
      '水是温的，比这个深度应该有的温度高很多。\n' +
      '礼拜堂那边的点名到第二十的时候没有停顿。这一轮很完整。',
    requires: on('did.drowned-self'),
    priority: 80,
    rank: 'bad',
  },
  {
    id: 'end.iron',
    title: '铁肺',
    subtitle: '数是船在数。',
    body:
      '面罩的密封圈焊在总管上，焊缝很平。\n' +
      '你不再需要数呼吸，因为呼吸不再是你的事。\n' +
      '十九个接口，现在有两个不空：第三号，和你。\n' +
      '广播每隔一段时间问一次你吃过东西了吗。你回答不了，但你听得见。',
    requires: on('did.became-iron-lung'),
    priority: 78,
    rank: 'bittersweet',
    unlocks: ['meta.trunk-plug'],
  },
  {
    id: 'end.congregation',
    title: '入会',
    subtitle: '散会后各自回岗。',
    body:
      '三样都做完了：潮、名、息。\n' +
      '你跪进第七个位置，膝盖落在磨圆的钢板上，宽度正好。\n' +
      '点名开始。你在第二十的那半拍里出声，声音和另外六个人一样稳。\n' +
      '唱到第十九，又回到第一。这件事不需要结束，所以它不结束。',
    requires: all(num('ritual.count', '>=', 3), stig('listening', '>=', 5)),
    priority: 70,
    rank: 'bad',
    unlocks: ['meta.hymn'],
  },
  {
    id: 'end.apostate',
    title: '叛教者',
    subtitle: '你带走了一个空钟罩。',
    body:
      '玻璃碎在脚边，圣物在你的靴底下变成一小片深色的湿。\n' +
      '整条船安静了大约四秒。四秒之后，每一个你走过的舱室都开始找你。\n' +
      '逃生舱的释放杆很顺。上浮的时候你听见船体在下面收紧，像一个人咬住牙。\n' +
      '你出来了。它们的名单上少了一笔，这件事会被记录，然后被重新安排。',
    requires: all(on('did.escaped'), on('did.destroyed-relic')),
    priority: 60,
    rank: 'good',
    unlocks: ['meta.apostasy'],
  },
  {
    id: 'end.silence',
    title: '缄默',
    subtitle: '你把那个口子封上了。',
    body:
      '焊完月池，水面第一次低于两指。\n' +
      '你没有再对任何人说话：不对广播，不对椅子上的人，不对管道里那个孩子。\n' +
      '上浮用了很久。海面上有天光，你花了一段时间才想起要眨眼。\n' +
      '你永远不会告诉任何人下面有什么。这是你为它做的最后一件事。',
    requires: all(
      on('did.escaped'),
      on('did.welded-moonpool'),
      stig('silence', '>=', 6),
      stig('listening', '<=', 2),
      stig('drowned', '<=', 2),
      stig('iron', '<=', 2),
    ),
    priority: 50,
    rank: 'bittersweet',
    unlocks: ['meta.weld'],
  },
  {
    id: 'end.surface',
    title: '浮出水面',
    subtitle: '你什么都没做完。',
    body:
      '你没有跪，没有接管子，没有在那半拍里出声。\n' +
      '逃生舱的释放杆很紧，但拉得动。\n' +
      '上浮到一百二十米时，下面那个低频还在，八个一组，停半拍。\n' +
      '救援船上的人问你船上有多少人。你说十九。你没有说第二十行的事。',
    requires: all(on('did.escaped'), sanAbove(50), num('ritual.count', '==', 0)),
    priority: 20,
    rank: 'good',
    unlocks: ['meta.first-exit'],
  }
];

// ---------------------------------------------------------------------------
// 落幕场景
// ---------------------------------------------------------------------------

export const ENDING_NODES: readonly NarrativeNode[] = [
  // ------------------------------------------------------------------- 逃生舱
  {
    id: 'end.scene.exit',
    speaker: undefined,
    text: '艏部逃生舱。一个球形的舱，十九个座位，安全带都扣着。\n扣着的安全带里没有人。',
    corruptedText: cor(
      [50, '十九个座位，安全带都扣着，里面没有人。第二十个座位是折叠的，放下来过。'],
      [20, '安全带都扣着。扣的时候他们坐过。坐完又出去了。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.found-escape-pod'), sfx('hull.tick')],
    choices: [
      c({
        id: 'end.scene.exit.seats',
        label: '看座位。',
        cost: 3,
        effects: [setf('did.examined-pod-seats')],
        goto: 'end.scene.exit.seats',
      }),
      c({
        id: 'end.scene.exit.sit',
        label: '坐进去。',
        cost: 4,
        effects: [setf('did.sat-in-pod')],
        goto: 'end.scene.exit.pod',
      }),
      c({
        id: 'end.scene.exit.hull',
        label: '检查舱壁有没有被动过。',
        cost: 4,
        effects: [setf('did.checked-pod-hull')],
        goto: 'end.scene.exit.hull',
      }),
      c({ id: 'end.scene.exit.leave', label: '出去。', cost: 2, effects: [] })
    ],
  },
  {
    id: 'end.scene.exit.seats',
    speaker: undefined,
    text: '安全带的卡扣都扣着，带子的松紧各不相同。\n最松的那条是第十四个座位，能塞进两个拳头。',
    corruptedText: cor([45, '最松的是第十四个座位，能塞进两个拳头。那是给小孩留的。']),
    tags: ['key'],
    onEnter: [setf('know.fourteenth-belt-loose'), san(-6)],
    choices: [
      c({
        id: 'end.scene.exit.seats.child',
        label: '第十四个是谁。',
        cost: 3,
        requires: K('k.dorn-daughter'),
        gateMode: 'disable',
        effects: [setf('did.understood-the-belt'), san(-8)],
        goto: 'end.scene.exit.belt',
      }),
      go('end.scene.exit.seats.back', '……', 'end.scene.exit')
    ],
  },
  {
    id: 'end.scene.exit.belt',
    speaker: undefined,
    text: '第十四行姓多恩。\n带子放到最松，是有人替她调好的，调完以后她没有来坐。',
    corruptedText: cor([40, '第十四行姓多恩。带子调好了，她没有来坐。调带子的人在椅子上。']),
    tags: ['key'],
    onEnter: [learn('k.dorn-daughter'), san(-10)],
    choices: [go('end.scene.exit.belt.ok', '……', 'end.scene.exit')],
  },
  {
    id: 'end.scene.exit.hull',
    speaker: undefined,
    text: '舱壁完好。释放机构上有新的润滑油，油是这几天上的。\n有人一直在保养这条出路，但没有人用。',
    corruptedText: cor([40, '释放机构上有新油。有人一直在保养这条出路，没有人用。油是你上的。']),
    tags: ['key'],
    onEnter: [setf('know.pod-maintained'), san(-6)],
    choices: [go('end.scene.exit.hull.ok', '……', 'end.scene.exit')],
  },
  {
    id: 'end.scene.exit.pod',
    speaker: undefined,
    text: '坐进去，扣上带子。释放杆在右手边，红的。\n手放上去的位置有一层磨亮的漆。',
    corruptedText: cor(
      [50, '释放杆在右手边。握把上有一层磨亮的漆，磨的形状是你的手。'],
      [20, '握把磨得很亮。你握过十七次。'],
    ),
    tags: ['key', 'hub'],
    onEnter: [setf('did.sat-in-pod'), fear(8)],
    choices: [
      c({
        id: 'end.scene.exit.go.surface',
        label: '拉杆。（你什么都没做完。）',
        cost: 6,
        requires: all(sanAbove(50), num('ritual.count', '==', 0), off('did.destroyed-relic')),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.escaped'), loud(30), sfx('pod.release')],
        goto: 'end.scene.surface',
      }),
      c({
        id: 'end.scene.exit.go.silence',
        label: '拉杆。（月池封了，你也不再说话。）',
        cost: 6,
        requires: all(on('did.welded-moonpool'), stig('silence', '>=', 6)),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.escaped'), loud(30), sfx('pod.release')],
        goto: 'end.scene.silence',
      }),
      c({
        id: 'end.scene.exit.go.apostate',
        label: '拉杆。（圣物碎在你靴底下。）',
        cost: 6,
        requires: on('did.destroyed-relic'),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.escaped'), loud(30), sfx('pod.release')],
        goto: 'end.scene.apostate',
      }),
      c({
        id: 'end.scene.exit.force',
        label: '硬拉。',
        cost: 10,
        requires: any(
          all(sanAbove(50), num('ritual.count', '==', 0)),
          on('did.welded-moonpool'),
          on('did.destroyed-relic'),
        ),
        gateMode: 'lie',
        effects: [loud(20)],
        goto: 'end.scene.exit.pod',
      }),
      c({
        id: 'end.scene.exit.unbuckle',
        label: '解开带子，出去。',
        cost: 3,
        effects: [setf('did.left-the-pod'), mark('silence', 1)],
        goto: 'end.scene.exit',
      })
    ],
  },
  {
    id: 'lie.end.scene.exit.force',
    speaker: undefined,
    text: '杆动了两指，停住。\n［停顿］不是机构卡住。是它下面还连着一根线，线的另一头在你身上。\n你还有一件事没做完。你知道是哪件。',
    corruptedText: cor([40, '杆动了两指。线的另一头在你身上。差一笔的字不是字。']),
    tags: ['lie', 'key'],
    onEnter: [addf('count.lies-caught', 1), fear(14), san(-8), setf('know.lever-needs-closure')],
    choices: [
      c({
        id: 'lie.end.scene.exit.force.which',
        label: '哪件。',
        cost: 3,
        requires: K('k.pen-can-stop'),
        gateMode: 'disable',
        effects: [learn('k.pen-can-stop'), setf('did.asked-which-stroke')],
        goto: 'end.scene.exit.which',
      }),
      go('lie.end.scene.exit.force.out', '解开带子。', 'end.scene.exit')
    ],
  },
  {
    id: 'end.scene.exit.which',
    speaker: undefined,
    text: '收笔只有三种：什么都不做完、把口子封上、把它砸了。\n第四种是不收笔。不收笔的人不从这里走。',
    corruptedText: cor([40, '收笔三种。第四种是不收笔。不收笔的人不从这里走，从月池走。']),
    tags: ['key'],
    onEnter: [learn('k.pen-can-stop'), san(-8)],
    choices: [
      c({
        id: 'end.scene.exit.which.pool',
        label: '那就去月池。',
        cost: 4,
        requires: num('count.truth-layer', '>=', 5),
        gateMode: 'hide',
        effects: [setf('did.chose-the-pool')],
        goto: 'end.scene.pool',
      }),
      go('end.scene.exit.which.back', '……', 'end.scene.exit')
    ],
  },
  {
    id: 'end.scene.surface',
    speaker: undefined,
    text: '弹出的一瞬间很轻。舱体转了半圈才稳住。\n下面那个低频还在。八个一组，停半拍。',
    corruptedText: cor([40, '下面那个低频还在。八个一组，停半拍。半拍在等你答。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.escaped'), sfx('pod.ascend')],
    choices: [
      c({
        id: 'end.scene.surface.up',
        label: '看着深度计往上走。',
        cost: 2,
        effects: [finish('end.surface')],
      })
    ],
  },
  {
    id: 'end.scene.silence',
    speaker: undefined,
    text: '上浮的时候你把无线电关了。\n关之前没有说话，关之后也没有。',
    corruptedText: cor([40, '你把无线电关了。关之前没说话，关之后也没有。你再也不会说。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.escaped'), mark('silence', 2), sfx('pod.ascend')],
    choices: [
      c({
        id: 'end.scene.silence.up',
        label: '不出声。',
        cost: 2,
        effects: [mark('silence', 1), finish('end.silence')],
      })
    ],
  },
  {
    id: 'end.scene.apostate',
    speaker: undefined,
    text: '弹出的时候船体在下面收紧了一下，像有人咬住牙。\n你靴底下那片湿已经干了。',
    corruptedText: cor([40, '船体收紧了一下，像咬住牙。你靴底下那片湿已经干了。它记住了你的号。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.escaped'), mark('apostasy', 2), sfx('pod.ascend')],
    choices: [
      c({
        id: 'end.scene.apostate.up',
        label: '上浮。',
        cost: 2,
        effects: [finish('end.apostate')],
      })
    ],
  },

  // --------------------------------------------------------------- 焊死月池
  {
    id: 'end.scene.weld',
    speaker: undefined,
    text: '月池的方口有一圈法兰，螺栓孔十九个。\n补板靠在墙边，尺寸正好，边缘已经打磨过。',
    corruptedText: cor(
      [50, '补板靠在墙边，尺寸正好，边缘打磨过。是给这个口子准备的。'],
      [20, '补板上有三个字，被漆盖住了一半：不要数。'],
    ),
    tags: ['entry', 'key'],
    onEnter: [setf('did.found-cover-plate'), sfx('metal.drag')],
    choices: [
      c({
        id: 'end.scene.weld.plate',
        label: '看补板。',
        cost: 3,
        effects: [setf('did.examined-cover-plate')],
        goto: 'end.scene.weld.plate',
      }),
      c({
        id: 'end.scene.weld.do',
        label: '焊上。',
        cost: 20,
        requires: item('welder'),
        gateMode: 'disable',
        irreversible: true,
        effects: [
          setf('did.welded-moonpool'),
          mark('silence', 5),
          mark('apostasy', 1),
          loud(34),
          sfx('weld.arc')
        ],
        goto: 'end.scene.weld.done',
      }),
      c({
        id: 'end.scene.weld.listen',
        label: '焊之前先听一次。',
        cost: 6,
        effects: [mark('listening', 1), setf('did.listened-before-welding'), san(-8)],
        goto: 'end.scene.weld.listen',
      }),
      c({ id: 'end.scene.weld.leave', label: '不焊。', cost: 2, effects: [setf('did.declined-welding')] })
    ],
  },
  {
    id: 'end.scene.weld.plate',
    speaker: undefined,
    text: '补板的漆下面有三个字，笔画很浅：不要数。\n漆是后刷的，刷的人不想让下一个人看见这句话。',
    corruptedText: cor([40, '补板下面三个字：不要数。漆是后刷的。他不想让你看见。']),
    tags: ['key'],
    onEnter: [setf('know.plate-says-dont-count'), setf('know.dont-count'), san(-8)],
    choices: [go('end.scene.weld.plate.ok', '……', 'end.scene.weld')],
  },
  {
    id: 'end.scene.weld.listen',
    speaker: undefined,
    text: '水面高两指，平得像玻璃。\n你听了十个呼吸，它什么都没做。它一直什么都没做。',
    corruptedText: cor([40, '你听了十个呼吸，它什么都没做。它从来什么都没做。是我们在做。']),
    tags: ['key'],
    onEnter: [learn('k.author-is-not-it'), san(-6)],
    choices: [go('end.scene.weld.listen.ok', '……', 'end.scene.weld')],
  },
  {
    id: 'end.scene.weld.done',
    speaker: undefined,
    text: '十九个螺栓，一圈焊缝。焊完之后水面第一次低于两指。\n低了半指，然后不再动。',
    corruptedText: cor([40, '焊完之后水面低了半指，不再动。你封住了一个开着的嘴。']),
    tags: ['key'],
    onEnter: [setf('did.welded-moonpool'), mark('silence', 2), san(6)],
    choices: [
      c({
        id: 'end.scene.weld.done.go',
        label: '去逃生舱。',
        cost: 4,
        effects: [setf('did.heading-to-pod')],
        goto: 'end.scene.exit',
      }),
      silence('end.scene.weld.done.stand', 'end.scene.weld')
    ],
  },

  // ----------------------------------------------------------------- 入会落幕
  {
    id: 'end.scene.congregation',
    speaker: undefined,
    text: '礼拜堂。三样都做完了，所以第七个位置现在是空的，朝着你。\n六个人没有回头。',
    corruptedText: cor(
      [50, '第七个位置是空的，朝着你。六个人没有回头。他们不需要回头。'],
      [20, '第七个位置有你的膝印。'],
    ),
    tags: ['entry', 'key'],
    onEnter: [setf('did.offered-seventh-seat'), fear(16), sfx('choir.unison')],
    choices: [
      c({
        id: 'end.scene.congregation.kneel',
        label: '跪进去。',
        cost: 8,
        requires: all(num('ritual.count', '>=', 3), stig('listening', '>=', 5)),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.took-the-seventh-seat'), mark('listening', 3), san(-14)],
        goto: 'end.scene.congregation.seat',
      }),
      c({
        id: 'end.scene.congregation.stand',
        label: '站着听完一轮。',
        cost: 10,
        effects: [addf('count.choir-time', 2), mark('listening', 1), san(-8)],
        goto: 'end.scene.congregation.stood',
      }),
      c({
        id: 'end.scene.congregation.out',
        label: '退出去。',
        cost: 3,
        effects: [mark('silence', 1), setf('did.refused-seventh-seat')],
      })
    ],
  },
  {
    id: 'end.scene.congregation.stood',
    speaker: '唱诗班',
    text: '……第十九，哈尔瓦。\n第二十，——',
    corruptedText: cor([40, '第二十，——（这半拍比以前长。他们在等，但不着急。）']),
    tags: ['key'],
    onEnter: [sfx('choir.break'), fear(18), san(-8)],
    choices: [
      c({
        id: 'end.scene.congregation.stood.answer',
        label: '在半拍里说出自己的名字。',
        cost: 6,
        requires: all(num('ritual.count', '>=', 3), stig('listening', '>=', 5)),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.answered-the-roll'), mark('listening', 3), setf('ritual.name')],
        goto: 'end.scene.congregation.seat',
      }),
      c({
        id: 'end.scene.congregation.stood.silent',
        label: '让那半拍空着。',
        cost: 4,
        effects: [mark('silence', 3), setf('did.left-the-half-beat-empty'), san(6)],
      })
    ],
  },
  {
    id: 'end.scene.congregation.seat',
    speaker: undefined,
    text: '跪下去以后膝盖落在磨圆的钢板上，宽度正好。\n点名唱到第十九，回到第一。',
    corruptedText: cor([40, '膝盖落在磨圆的钢板上。唱到第十九，回到第一。不需要结束。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.joined-the-choir'), mark('listening', 2), san(-10)],
    choices: [
      c({
        id: 'end.scene.congregation.seat.sing',
        label: '接上去。',
        cost: 2,
        effects: [finish('end.congregation')],
      })
    ],
  },

  // ----------------------------------------------------- 溺者 / 铁肺（仪式引入）
  {
    id: 'end.scene.drowned',
    speaker: undefined,
    text: '第一口最难。第二口不难。\n水是温的。',
    corruptedText: cor([40, '第一口最难，第二口不难。水是温的。点名没有停顿。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.drowned-self'), mark('drowned', 4), sfx('water.swallow')],
    choices: [
      c({
        id: 'end.scene.drowned.done',
        label: '正常呼吸。',
        cost: 2,
        effects: [finish('end.drowned')],
      })
    ],
  },
  {
    id: 'end.scene.iron',
    speaker: undefined,
    text: '焊缝很平。你不再需要数。\n十九个接口，现在有两个不空。',
    corruptedText: cor([40, '你不再需要数。十九个接口，两个不空。第三号在另一头。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.became-iron-lung'), mark('iron', 4), sfx('trunk.hiss')],
    choices: [
      c({
        id: 'end.scene.iron.done',
        label: '让它数。',
        cost: 2,
        effects: [finish('end.iron')],
      })
    ],
  },

  // ------------------------------------------------------------- 月池最终抉择
  {
    id: 'end.scene.pool',
    speaker: undefined,
    text: '月池。水面高两指。\n池底的钢板上刻着十七条线，每一条从同一个点出发，收笔的位置不一样。',
    corruptedText: cor(
      [50, '池底十七条线，同一个起点，收笔位置各不相同。第十八条已经画到一寸以内。'],
      [20, '十七条线。八种收笔。七种已经用过。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.reached-final-pool'), learn('k.path-is-a-stroke'), fear(12)],
    choices: [
      c({
        id: 'end.scene.pool.lines',
        label: '看那十七条线。',
        cost: 4,
        effects: [setf('did.studied-the-strokes'), learn('k.eight-strokes')],
        goto: 'end.scene.pool.lines',
      }),
      c({
        id: 'end.scene.pool.stop',
        label: '停笔。',
        cost: 8,
        requires: all(num('count.truth-layer', '>=', 5), num('count.cycles-witnessed', '>=', 4)),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.final-choice-at-pool'), setf('did.stopped-the-pen'), mark('apostasy', 2)],
        goto: 'end.scene.pool.stopped',
      }),
      c({
        id: 'end.scene.pool.answer',
        label: '答应那半拍。',
        cost: 8,
        requires: num('count.truth-layer', '>=', 4),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.answered-at-the-pool'), mark('listening', 3), san(-12)],
        goto: 'end.scene.zero',
      }),
      c({
        id: 'end.scene.pool.in',
        label: '走进水里。',
        cost: 10,
        irreversible: true,
        effects: [setf('did.walked-into-the-pool'), mark('drowned', 3), fear(20)],
        goto: 'end.scene.drowned',
      }),
      c({
        id: 'end.scene.pool.leave',
        label: '退开。',
        cost: 2,
        effects: [setf('did.stepped-back-from-pool'), mark('silence', 1)],
      })
    ],
  },
  {
    id: 'end.scene.pool.lines',
    speaker: undefined,
    text: '十七条线里有七种收笔的方式，其中一种重复了十一次。\n重复十一次的那种收得最快。',
    corruptedText: cor([40, '七种收笔，一种重复十一次。重复最多的那种收得最快。那种是溺。']),
    tags: ['key'],
    onEnter: [learn('k.eight-strokes'), san(-8)],
    choices: [
      c({
        id: 'end.scene.pool.lines.eighth',
        label: '第八种呢。',
        cost: 3,
        requires: K('k.pen-can-stop'),
        gateMode: 'disable',
        effects: [learn('k.pen-can-stop'), setf('did.found-the-eighth')],
        goto: 'end.scene.pool.eighth',
      }),
      go('end.scene.pool.lines.back', '……', 'end.scene.pool')
    ],
  },
  {
    id: 'end.scene.pool.eighth',
    speaker: undefined,
    text: '第八种不在池底，因为它不留痕。\n不留痕的意思是：笔停在纸上，不抬，也不动。',
    corruptedText: cor([40, '第八种不留痕。笔停在纸上，不抬，也不动。这是唯一一种它没有见过的。']),
    tags: ['key'],
    onEnter: [learn('k.pen-can-stop'), learn('k.the-word'), san(-10)],
    choices: [go('end.scene.pool.eighth.ok', '……', 'end.scene.pool')],
  },
  {
    id: 'end.scene.pool.stopped',
    speaker: undefined,
    text: '你把笔放在空白页上，不收，也不合。\n水面等了半拍。又等了半拍。',
    corruptedText: cor([40, '笔放在空白页上，不收也不合。水面等了半拍，又等了半拍。然后去等别的。']),
    tags: ['terminal', 'key'],
    onEnter: [
      setf('did.final-choice-at-pool'),
      learn('k.your-name'),
      mark('apostasy', 2),
      mark('silence', 2),
      sfx('silence.total')
    ],
    choices: [
      c({
        id: 'end.scene.pool.stopped.hold',
        label: '就这样停住。',
        cost: 2,
        effects: [finish('end.author')],
      })
    ],
  },

  // ----------------------------------------------------------------- 零号舱
  {
    id: 'end.scene.zero',
    speaker: undefined,
    text: '零号舱不在图纸上。舱门是从外面装的，铰链在走廊那一侧。\n里面很干，是全船唯一干的地方。',
    corruptedText: cor(
      [50, '铰链在走廊那一侧。里面很干，是全船唯一干的地方。'],
      [20, '里面很干。干是因为这里从来没有进过水。这里不属于这条船。'],
    ),
    tags: ['entry', 'key', 'hub'],
    onEnter: [setf('did.entered-zero'), learn('k.zero-is-the-berth'), fear(18), san(-10)],
    choices: [
      c({
        id: 'end.scene.zero.rack',
        label: '看架子。',
        cost: 4,
        effects: [setf('did.examined-the-rack')],
        goto: 'end.scene.zero.rack',
      }),
      c({
        id: 'end.scene.zero.table',
        label: '看记录台。',
        cost: 4,
        effects: [setf('did.found-recorder-desk')],
        goto: 'end.scene.zero.desk',
      }),
      c({
        id: 'end.scene.zero.lie',
        label: '躺进第二十个位置。',
        cost: 10,
        requires: num('count.truth-layer', '>=', 4),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.lay-in-the-berth'), mark('listening', 2), san(-12)],
        goto: 'end.scene.zero.berth',
      }),
      c({
        id: 'end.scene.zero.out',
        label: '出去。',
        cost: 3,
        effects: [setf('did.left-zero'), mark('silence', 1)],
      })
    ],
  },
  {
    id: 'end.scene.zero.rack',
    speaker: undefined,
    text: '一排二十个凹槽，绒布衬里。十九个的绒布压平了，一个还立着。\n立着那个的尺寸和你一样。',
    corruptedText: cor([40, '二十个凹槽。十九个压平了，一个立着。尺寸和你一样。']),
    tags: ['key'],
    onEnter: [learn('k.zero-is-the-berth'), fear(16), san(-8)],
    choices: [go('end.scene.zero.rack.ok', '……', 'end.scene.zero')],
  },
  {
    id: 'end.scene.zero.desk',
    speaker: undefined,
    text: '记录台上一张表，八栏。七栏打了勾，第八栏的表头是空的。\n钢笔搁在第八栏上，笔尖朝着你。',
    corruptedText: cor([40, '八栏，七个勾。钢笔搁在第八栏上，笔尖朝着你。笔是热的。']),
    tags: ['key'],
    onEnter: [learn('k.eight-strokes'), learn('k.vance-is-the-recorder'), fear(14), san(-10)],
    choices: [
      c({
        id: 'end.scene.zero.desk.pen',
        label: '拿起笔。',
        cost: 5,
        effects: [setf('did.took-the-recorder-pen'), fear(12)],
        goto: 'end.scene.zero.pen',
      }),
      c({
        id: 'end.scene.zero.desk.tick',
        label: '在第八栏打勾。',
        cost: 6,
        requires: on('did.took-the-recorder-pen'),
        gateMode: 'hide',
        irreversible: true,
        effects: [setf('did.ticked-the-eighth'), mark('listening', 2), san(-14)],
        goto: 'end.scene.zero.ticked',
      }),
      go('end.scene.zero.desk.back', '不碰。', 'end.scene.zero')
    ],
  },
  {
    id: 'end.scene.zero.pen',
    speaker: undefined,
    text: '笔是热的。握的位置正好落在你食指那道压痕上。\n记录员的椅子是转椅，椅面还有温度。',
    corruptedText: cor([40, '笔是热的。椅面还有温度。记录员刚起来，没走远。']),
    tags: ['key'],
    onEnter: [learn('k.vance-is-the-recorder'), fear(18), san(-10)],
    choices: [go('end.scene.zero.pen.ok', '……', 'end.scene.zero')],
  },
  {
    id: 'end.scene.zero.ticked',
    speaker: undefined,
    text: '你在第八栏打了一个勾。表头还是空的。\n勾是自己填的，所以这一栏的名字也该由你填。你没有填。',
    corruptedText: cor([40, '你打了勾，表头还是空的。你没有填名字。这一栏因此只是一个勾。']),
    tags: ['key'],
    onEnter: [setf('did.ticked-the-eighth'), san(-8)],
    choices: [
      c({
        id: 'end.scene.zero.ticked.lie',
        label: '躺进那个位置。',
        cost: 8,
        irreversible: true,
        effects: [setf('did.lay-in-the-berth')],
        goto: 'end.scene.zero.berth',
      }),
      go('end.scene.zero.ticked.back', '把笔放回去。', 'end.scene.zero')
    ],
  },
  {
    id: 'end.scene.zero.berth',
    speaker: undefined,
    text: '躺进去，尺寸正好。躺下之后有人替你把衬布拉平。\n你没有看见那只手。',
    corruptedText: cor([40, '尺寸正好。有人替你把衬布拉平。你没有看见那只手。手很轻。']),
    tags: ['terminal', 'key'],
    onEnter: [setf('did.lay-in-the-berth'), fear(20), san(-12), sfx('rack.close')],
    choices: [
      c({
        id: 'end.scene.zero.berth.close',
        label: '闭眼。',
        cost: 2,
        effects: [finish('end.zero')],
      })
    ],
  }
];
