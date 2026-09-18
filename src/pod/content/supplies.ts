/**
 * 舱内物资。
 * ============================================================================
 * 逃生舱里本来就该有的东西，加上从废墟里捞上来的。数量都很少 ——
 * 一支诱饵用掉就没有了，所以「什么时候用」永远比「用什么」难。
 *
 * 每件物资都绑死在一个工位上：诱饵得在雷达台投放，补漏胶得在生命维持台涂。
 * 这是舱内空间存在的理由 —— 你必须为了用一件东西走过去。
 *
 * 有两件东西（照片、没寄出的信）不回血也不修舱。它们占一个格子、要走一趟路，
 * 换来的只是知道多一点。这是故意的：如果所有捞上来的东西都能换成数值，
 * 玩家就只会翻能换成数值的箱子。
 */

import type { LogTone, StationId } from '../types';

export type SupplyId =
  | 'sup.lure'
  | 'sup.pulse'
  | 'sup.flare'
  | 'sup.cell'
  | 'sup.sealant'
  | 'sup.filter'
  | 'sup.stim'
  | 'sup.wax'
  | 'sup.tape'
  | 'sup.cutter'
  | 'sup.o2candle'
  | 'sup.pump'
  | 'sup.plate'
  | 'sup.fuse'
  | 'sup.ration'
  | 'sup.morphine'
  | 'sup.grease'
  | 'sup.bulb'
  | 'sup.photo'
  | 'sup.letter'
  | 'sup.idtag'
  | 'sup.ring'
  | 'sup.watch'
  | 'sup.drawing'
  | 'sup.hymnal'
  | 'sup.recording';

/**
 * 补给的效果语义。
 *
 * 前十种物资的效果是硬写在 run.ts 的 applySupply() switch 里的。再往里加分支
 * 会让两个文件必须同时改 —— 而内容是会一直长的，逻辑不该跟着长。
 * 所以新物资把「用下去会发生什么」当数据写在这里，run.ts 只需要一个默认分支
 * 读这个字段，以后再加多少种都不用碰模拟层。
 *
 * 所有数值都是增量：正值加、负值减。生理三项（fear / co2 / fatigue）用的是
 * vitals 的 0..100 刻度，其余是 0..1 的舱体标量。
 */
export interface SupplyEffect {
  /** 电池组 0..1 */
  power?: number;
  /** 舱体完整度 0..1 */
  hull?: number;
  /** 舱内水位 0..1 */
  flood?: number;
  /** 洗涤器余量 0..1 */
  scrubber?: number;
  /** 进水速率。负值是把漏点补上了 */
  leak?: number;
  /** 恐惧 0..100 */
  fear?: number;
  /** 二氧化碳 0..100 */
  co2?: number;
  /** 疲劳 0..100 */
  fatigue?: number;
  /** 使用瞬间额外辐射的噪音。负值表示这一下反而把噪音压了下去 */
  noiseBurst?: number;
  /**
   * 用完之后写进日志的那句话。
   *
   * 可能带 `{name}` `{role}` `{tag}` `{home}` `{keepsake}` `{last}` 占位符 ——
   * 它们指向这一局那个死者。调用方用 containers.ts 的 fillPersonText() 填，
   * 不填也不会露出花括号以外的毛病，但那个人就白死了。
   */
  log: string;
  tone: LogTone;
  /** 真实存在的 cue id，直接喂 onCue */
  cue?: string;
  cueGain?: number;
}

export interface Supply {
  id: SupplyId;
  name: string;
  /** 储物格上的漆号 */
  code: string;
  desc: string;
  /** 只有在这个工位才能使用；null = 任意工位 */
  station: StationId | null;
  /** 使用时向外辐射的噪音 0..1 */
  noise: number;
  /** 使用一次要几口呼吸（平静态）/ 几秒（警报态） */
  cost: number;
  /** 数据化的效果。前十种物资走 applySupply 的 switch，所以这里是空的 */
  effect?: SupplyEffect;
  /**
   * 占多少格。不写 = 1。
   *
   * 背包有上限，而一块铅酸电池和一张照片占的格子不该一样多 ——
   * 「要不要为了一张照片扔掉一支滤芯」必须是一个真的要回答的问题，
   * 否则叙事物件就只是免费的收集品。
   */
  bulk?: number;
  /**
   * 纯叙事物件：effect 里一个数值字段都没有，用它只会读到一句话。
   * 它照样占格子、照样要走到工位、照样花口气。这是故意的。
   */
  narrative?: boolean;
  /** 覆盖默认估值（口气）。只用于平衡分析，见 supplyWorth */
  worth?: number;
}

/**
 * 会推进那个人的故事的东西。
 *
 * 比 narrative 多两件：照片和信有机制效果，所以它们不是「纯」叙事物件，
 * 但玩家从它们身上读到的东西一样多。跨箱记忆按这张表记「见过什么」。
 */
export const STORY_SUPPLY_IDS: readonly SupplyId[] = [
  'sup.photo',
  'sup.letter',
  'sup.idtag',
  'sup.ring',
  'sup.watch',
  'sup.drawing',
  'sup.hymnal',
  'sup.recording',
];

/** 没写 bulk 的物资占几格 */
export const SUPPLY_BULK_DEFAULT = 1;

/**
 * 每件东西值几口气。
 *
 * 只用于平衡分析（containers.ts 的 stopProfile 要拿它算「翻到第几爪最划算」），
 * 不参与任何运行时结算。刻度就是字面意思：一支滤芯值 26 口气，意思是
 * 一个理性的人愿意为它多憋 26 口气。
 *
 * 六种纯叙事物件是 0。这不是说它们没用 —— 是说**对一个只算数的玩家**它们没用。
 * 停手曲线因此会建议你放弃那些只装着故事的箱子，而玩家会不会听，是这套内容
 * 最想问的那个问题。
 */
const WORTH: Readonly<Record<SupplyId, number>> = {
  'sup.cell': 30,
  'sup.filter': 26,
  'sup.o2candle': 24,
  'sup.plate': 22,
  'sup.sealant': 20,
  'sup.pulse': 18,
  'sup.cutter': 16,
  'sup.pump': 14,
  'sup.morphine': 14,
  'sup.lure': 12,
  'sup.stim': 12,
  'sup.fuse': 10,
  'sup.bulb': 10,
  'sup.grease': 9,
  'sup.ration': 9,
  'sup.wax': 8,
  'sup.flare': 8,
  'sup.tape': 6,
  'sup.photo': 3,
  'sup.letter': 3,
  'sup.idtag': 0,
  'sup.ring': 0,
  'sup.watch': 0,
  'sup.drawing': 0,
  'sup.hymnal': 0,
  'sup.recording': 0,
};

export function supplyWorth(id: SupplyId): number {
  return SUPPLIES[id]?.worth ?? WORTH[id] ?? 0;
}

/**
 * 建议的背包容量。
 *
 * 一只箱子平均掏出三件东西，一处废墟大约五到八只箱子 —— 不设上限的话
 * 玩家会把每只箱子翻到底，风险计算就没了。14 格的意思是：
 * 一趟下来必须扔掉大约三分之一，而扔什么由玩家自己解释。
 */
export const RECOMMENDED_CAPACITY = 14;

export function supplyBulk(id: SupplyId): number {
  return SUPPLIES[id]?.bulk ?? SUPPLY_BULK_DEFAULT;
}

export const SUPPLIES: Readonly<Record<SupplyId, Supply>> = {
  'sup.lure': {
    id: 'sup.lure',
    name: '声呐诱饵',
    code: 'B-04',
    desc: '一枚会自己叫唤的小铁罐。从投放口打出去，它会在两百米外替你发出声音。',
    station: 'nav',
    noise: 0.25,
    cost: 3,
  },
  'sup.pulse': {
    id: 'sup.pulse',
    name: '驱离脉冲',
    code: 'B-07',
    desc: '把全部电力灌进换能器打一发。近处的东西会被震开。远处的东西会听见。',
    station: 'nav',
    noise: 1,
    cost: 4,
  },
  'sup.flare': {
    id: 'sup.flare',
    name: '冷焰信号管',
    code: 'C-01',
    desc: '从舷侧抛出去，在水里烧四十秒。摄像头能看清很远 —— 别的东西也能看清你。',
    station: 'camera',
    noise: 0.1,
    cost: 2,
  },
  'sup.cell': {
    id: 'sup.cell',
    name: '备用电池组',
    code: 'A-02',
    desc: '沉得要命的一块铅。插进配电盘能把电力补回去一大截。',
    station: 'life',
    noise: 0.2,
    cost: 6,
    bulk: 3,
  },
  'sup.sealant': {
    id: 'sup.sealant',
    name: '双组分补漏胶',
    code: 'A-05',
    desc: '挤在裂缝上会发热、会臭，但水会停下来。',
    station: 'life',
    noise: 0.15,
    cost: 5,
  },
  'sup.filter': {
    id: 'sup.filter',
    name: '洗涤器滤芯',
    code: 'A-01',
    desc: '氢氧化锂。换上它，你呼出去的东西才不会再吸回来。',
    station: 'life',
    noise: 0.1,
    cost: 4,
    bulk: 2,
  },
  'sup.stim': {
    id: 'sup.stim',
    name: '肾上腺素针',
    code: 'M-03',
    desc: '扎进大腿。恐惧会退下去一会儿，代价是你的心跳会响得整片海都听得见。',
    station: null,
    noise: 0.3,
    cost: 2,
  },
  'sup.wax': {
    id: 'sup.wax',
    name: '耳塞蜡',
    code: 'M-08',
    desc: '塞上就听不见那些不存在的声音了。也听不见无线电。',
    station: null,
    noise: 0,
    cost: 2,
  },
  'sup.tape': {
    id: 'sup.tape',
    name: '绝缘胶带',
    code: 'C-06',
    desc: '万能。修机械臂、粘线束、封住一张还在动的嘴。',
    station: 'camera',
    noise: 0.05,
    cost: 3,
  },
  'sup.cutter': {
    id: 'sup.cutter',
    name: '一次性切割器',
    code: 'C-11',
    desc: '机械臂前端的热刀。一发。切错边，门还在，刀没有了。',
    station: 'camera',
    noise: 0.55,
    cost: 5,
    bulk: 2,
  },

  // 以下是从废墟里捞上来的。它们的效果写在 effect 里，不在 run.ts 的 switch 里。
  'sup.o2candle': {
    id: 'sup.o2candle',
    name: '应急氧烛',
    code: 'A-09',
    desc: '氯酸盐。点着以后它会在铁筒里烧四十分钟，把一舱人的份额一次性烧出来。给一个人用太多了。',
    station: 'life',
    noise: 0.3,
    cost: 1,
    bulk: 2,
    effect: {
      co2: -34,
      scrubber: 0.12,
      noiseBurst: 0.22,
      log: '氧烛在铁筒里烧得通红，像有人在舱里生了一小堆火。这一口气是甜的，也是烫的。',
      tone: 'good',
      cue: 'match.strike',
      cueGain: 0.8,
    },
  },
  'sup.pump': {
    id: 'sup.pump',
    name: '手摇舱底泵',
    code: 'A-07',
    desc: '一根摇臂，一段软管。它比用头盔舀快得多，代价是整条沟都听得见你在摇。',
    station: 'life',
    noise: 0.5,
    cost: 8,
    bulk: 3,
    effect: {
      flood: -0.16,
      fatigue: 12,
      noiseBurst: 0.44,
      log: '摇到第四十下，排水口开始吐气。水位掉了半只靴子。泵的哐当声一路传出去，没有回来。',
      tone: 'neutral',
      cue: 'water.splash',
      cueGain: 0.8,
    },
  },
  'sup.plate': {
    id: 'sup.plate',
    name: '舱壁钢补板',
    code: 'A-11',
    desc: '一块带橡胶垫的钢板和八颗螺栓。上紧它要三分钟，每一锤都是敲给外面听的。',
    station: 'life',
    noise: 0.7,
    cost: 7,
    bulk: 3,
    effect: {
      hull: 0.18,
      leak: -0.0019,
      noiseBurst: 0.6,
      log: '钢板顶住裂缝，八颗螺栓一颗一颗上紧。水声停了。别的声音开始靠近。',
      tone: 'good',
      cue: 'hull.rivet-pop',
      cueGain: 0.85,
    },
  },
  'sup.fuse': {
    id: 'sup.fuse',
    name: '保险丝匣',
    code: 'A-13',
    desc: '三只铜芯保险丝，编号是手写的。换上去，配电盘会亮回来几盏 —— 不是全部。',
    station: 'life',
    noise: 0.05,
    cost: 2,
    effect: {
      power: 0.16,
      log: '换上新保险丝。配电盘那排灯亮回来三盏，剩下的还是黑的。',
      tone: 'good',
      cue: 'power.breaker',
      cueGain: 0.7,
    },
  },
  'sup.ration': {
    id: 'sup.ration',
    name: '压缩口粮块',
    code: 'M-11',
    desc: '在嘴里像湿纸板，咽下去以后手不抖了。包装上印着「12 份」，剩下一份。',
    station: null,
    noise: 0.02,
    cost: 2,
    effect: {
      fatigue: -20,
      fear: -4,
      log: '嚼了很久才咽下去。手稳了。你想起自己已经不知道现在是白天还是晚上。',
      tone: 'neutral',
      cue: 'cloth.rustle',
      cueGain: 0.4,
    },
  },
  'sup.morphine': {
    id: 'sup.morphine',
    name: '吗啡安瓿',
    code: 'M-14',
    desc: '折断颈口，推进去。它不会让你变勇敢，它让你不在乎 —— 包括不在乎正在发生的事。',
    station: null,
    noise: 0,
    cost: 2,
    effect: {
      fear: -58,
      fatigue: 18,
      log: '安瓿在拇指下折断。几秒钟以后，所有东西都退到玻璃后面去了，包括正在敲舱壁的那个。',
      tone: 'eerie',
      cue: 'glass.break',
      cueGain: 0.35,
    },
  },
  'sup.grease': {
    id: 'sup.grease',
    name: '机械臂润滑脂',
    code: 'C-14',
    desc: '深海级二硫化钼。抹进三个关节，机械手下一次伸出去的时候，你几乎听不见它。',
    station: 'camera',
    noise: 0.03,
    cost: 3,
    effect: {
      noiseBurst: -0.2,
      log: '脂抹进三个关节。机械臂收回来的时候没有出声 —— 你这才知道它以前一直在出声。',
      tone: 'good',
      cue: 'flesh.wet',
      cueGain: 0.3,
    },
  },
  'sup.bulb': {
    id: 'sup.bulb',
    name: '探照灯备用灯泡',
    code: 'C-17',
    desc: '一只石英灯泡，包在报纸里。报纸上的日期比你出发那天早十一年。',
    station: 'camera',
    noise: 0.08,
    cost: 3,
    effect: {
      power: -0.03,
      fear: -6,
      log: '旧灯泡拧下来的时候里面有水在响。新的一只亮起来，外面那二十米又回来了。',
      tone: 'good',
      cue: 'light.flicker',
      cueGain: 0.6,
    },
  },
  'sup.photo': {
    id: 'sup.photo',
    name: '别人的照片',
    code: '—',
    desc: '三个人在码头上，中间那个把手搭在另外两个肩上。它换不来氧气，但你会把它带着。',
    station: 'lab',
    noise: 0,
    cost: 1,
    effect: {
      fear: 9,
      fatigue: -12,
      log: '读片机的灯照在照片背面。背面写着日期，比你下潜那天晚了四天，签的是{name}。',
      tone: 'eerie',
      cue: 'paper.rustle',
      cueGain: 0.4,
    },
  },
  'sup.letter': {
    id: 'sup.letter',
    name: '没寄出的信',
    code: '—',
    desc: '三页纸，写到第三页字开始歪。收件地址是一个没有海的城市。',
    station: 'radio',
    noise: 0.12,
    cost: 3,
    effect: {
      fear: -14,
      fatigue: -6,
      noiseBurst: 0.1,
      log: '你对着话筒把{name}的信念完了。那头没有人回答。但你念到{home}的时候，底噪停了一下。',
      tone: 'eerie',
      cue: 'radio.squelch',
      cueGain: 0.5,
    },
  },

  // ---------------------------------------------------------------------------
  // 纯叙事物件。
  //
  // effect 里一个数值字段都没有 —— 用掉它们不回血、不修舱、不省电。
  // 它们要占格子、要走到工位、要花口气，换来的只是知道多一点。
  // 这是背包上限唯一真正咬人的地方：扔掉一支滤芯换一块铝牌，
  // 是一个玩家必须自己向自己解释的决定。
  // ---------------------------------------------------------------------------
  'sup.idtag': {
    id: 'sup.idtag',
    name: '铝制工牌',
    code: '—',
    desc: '一块打了编号的铝牌，边缘被磨圆了 —— 有人长期用拇指蹭它。',
    station: 'lab',
    noise: 0.02,
    cost: 1,
    narrative: true,
    effect: {
      log: '读片机的灯下能看清钢印：{tag}，{role}，{name}。牌子背面还有一道指甲划的横线。',
      tone: 'eerie',
      cue: 'item.pickup',
      cueGain: 0.35,
    },
  },
  'sup.ring': {
    id: 'sup.ring',
    name: '一枚婚戒',
    code: '—',
    desc: '它戴不进作业手套，所以一直挂在颈绳上。绳子是断的，断口很新。',
    station: null,
    noise: 0,
    cost: 1,
    narrative: true,
    effect: {
      log: '你把戒指转到有字的那一面。内圈刻着两个名字，其中一个是{name}。',
      tone: 'eerie',
      cue: 'item.pickup',
      cueGain: 0.3,
    },
  },
  'sup.watch': {
    id: 'sup.watch',
    name: '停了的怀表',
    code: '—',
    desc: '表壳压扁了，玻璃还在。指针停在四点十七分 —— 不知道是哪一天的四点十七分。',
    station: null,
    noise: 0.02,
    cost: 1,
    narrative: true,
    effect: {
      log: '你把怀表贴到耳边。它当然不走。你还是听了很久，直到确认那个声音是自己的脉搏。',
      tone: 'eerie',
      cue: 'terminal.beep',
      cueGain: 0.25,
    },
  },
  'sup.drawing': {
    id: 'sup.drawing',
    name: '一张孩子画的画',
    code: '—',
    desc: '蜡笔，画在配给表的背面。三个人，一条船，船底下有一个比船大的东西。',
    station: 'lab',
    noise: 0.02,
    cost: 1,
    narrative: true,
    effect: {
      log: '灯下看得更清楚了：船底那个东西是后来添上去的，蜡笔颜色不一样，笔压重得多。',
      tone: 'eerie',
      cue: 'paper.rustle',
      cueGain: 0.35,
    },
  },
  'sup.hymnal': {
    id: 'sup.hymnal',
    name: '手抄的祷词',
    code: '—',
    desc: '医疗格里抄在处方笺上的四行字。抄了十七遍，一遍比一遍工整。',
    station: 'radio',
    noise: 0.1,
    cost: 2,
    narrative: true,
    effect: {
      log: '你对着话筒念了第一行。念到第三行的时候，你发现自己压低了声音 —— 没有人要求你这么做。',
      tone: 'eerie',
      cue: 'san.whisper',
      cueGain: 0.4,
    },
  },
  'sup.recording': {
    id: 'sup.recording',
    name: '一卷私人录音',
    code: '—',
    desc: '磁带盒上没有编号，只用指甲刻了一个字。它不是工作记录。',
    station: 'lab',
    noise: 0.08,
    cost: 2,
    narrative: true,
    effect: {
      log: '磁带走完了。前面九分钟只有呼吸声和泵的响声。最后一句是：{last}',
      tone: 'eerie',
      cue: 'radio.voice',
      cueGain: 0.55,
    },
  },
};

/** 所有物资 id。内容自检和统计用 */
export const ALL_SUPPLY_IDS = Object.keys(SUPPLIES) as readonly SupplyId[];

/** 纯叙事物件。它们是「那个人」留下的东西，可以被 ContainerMemory 抽中当遗物 */
export const NARRATIVE_SUPPLY_IDS: readonly SupplyId[] = ALL_SUPPLY_IDS.filter(
  (id) => SUPPLIES[id].narrative === true,
);

export function hasSupply(id: string): id is SupplyId {
  return Object.prototype.hasOwnProperty.call(SUPPLIES, id);
}

export function supply(id: SupplyId): Supply {
  const s = SUPPLIES[id];
  if (!s) throw new Error(`[pod] 未知物资 ${id}`);
  return s;
}

/** 开局时舱里本来就有的东西。少得刚好让人不安 */
export const STARTING_STOCK: readonly (readonly [SupplyId, number])[] = [
  ['sup.filter', 1],
  ['sup.sealant', 1],
  ['sup.cell', 1],
  ['sup.wax', 1],
];
