/**
 * 集装箱 —— 机械手翻找的对象。
 * ============================================================================
 * 这不是一个「按一下出货」的箱子。一只箱子要翻好几爪，每一爪都在噪音上加码，
 * 而里面到底有什么，只有在探照灯照着它、机械手插进去之后才知道。
 *
 * 设计前提：**封条颜色是唯一的先验**。玩家在全息屏上只看得见一个方块；
 * 探照灯照上去才读得到封条；封条给出概率，不给出答案。所以「值不值得翻」
 * 永远是一个带风险的判断，而不是一次查表。
 *
 * ---------------------------------------------------------------------------
 * 为什么封条必须会撒谎
 * ---------------------------------------------------------------------------
 * 如果锈橙一定是补给，玩家在第二局就不再看封条了 —— 他只是在执行一张表。
 * 如果锈橙完全随机，玩家在第一局就不再看封条了 —— 看了也没用。
 * 两种情况下这个机制都死了，只是死法不同。
 *
 * 所以谎言必须存在，而且必须是少数。谎言有两个来源，都是叙事上站得住的：
 *   1. 原型本身就辜负封条。锈橙压载格是真的锈橙标准格 —— 只是里面装的是
 *      水泥配重。没有人骗你，是这只箱子本来就不装货。
 *   2. 封条被换过。重封箱和诱饵会主动披上锈橙或骨白，因为披上以后会有人来开。
 *      deceit 越高的原型，越是「伪装」这件事本身的化身。
 *
 * ---------------------------------------------------------------------------
 * 为什么欺骗率随深度爬
 * ---------------------------------------------------------------------------
 * 第一关 8%，最后一关 30%。这条曲线不是难度旋钮，是一句叙事：
 * 越往下，「有人重新封过这只箱子」这件事越常见 —— 下面那些东西学会了布置。
 * 玩家在上面几关学会的那套读封条的直觉，正好在他最依赖它的时候开始失灵，
 * 而失灵的方式是可解释的：重封箱和诱饵的权重也在同步爬。
 * 他不是被随机数背叛，他是被人背叛。
 *
 * ---------------------------------------------------------------------------
 * 为什么箱子要记得玩家
 * ---------------------------------------------------------------------------
 * 「里面有人」这只箱子，第一次见是一个事件，第五次见如果还是同一句话，
 * 它就退回成一张贴图。ContainerMemory 让同一种原型第二次、第三次出现时
 * 换一套文案，并且让整局里所有照片、信、工牌指向同一个人 ——
 * 玩家会在第三四只箱子的时候自己把这件事拼出来。没有任何一句话会告诉他。
 *
 * ---------------------------------------------------------------------------
 * 导出签名是冻结的：sim/manipulator.ts 按这些类型写。可以加可选字段和可选参数，
 * 不要改名或删除。
 */

import type { Rng } from '@/core/contract';
import { clamp01, lerp } from '@/core/util';
import {
  NARRATIVE_SUPPLY_IDS,
  STORY_SUPPLY_IDS,
  SUPPLIES,
  supplyWorth,
  type SupplyId,
} from './supplies';

// ============================================================================
// 封条
// ============================================================================

/** 封条颜色。玩家在灯下读得到它，它是唯一的先验 */
export type SealColor = 'rust' | 'bone' | 'ash' | 'blood' | 'tar' | 'chalk';

export const SEAL_CN: Readonly<Record<SealColor, string>> = {
  rust: '锈橙封条',
  bone: '骨白封条',
  ash: '灰封条',
  blood: '暗红封条',
  tar: '沥青封条',
  chalk: '粉笔封条',
};

/**
 * 封条下面那句只有灯照到才读得出来的话。
 *
 * 每一句只写观察得到的东西 —— 漆号、压条的角度、写字的手稳不稳。
 * 不写「这里面有三份补给」。玩家该从字面推，推错了是他的事。
 */
export const SEAL_HINT: Readonly<Record<SealColor, string>> = {
  rust: '标准补给漆号还在。压条完好，锁扣是原厂的。',
  bone: '医疗白。漆在水里泡得发黄，十字还看得出轮廓。',
  ash: '灰底，没有漆号。压条是歪的 —— 有人比你先到。',
  blood: '红漆不是锈。它是后来刷上去的，刷得很急，边缘淌了。',
  tar: '沥青黑。工程件封条，边上压着一行烫印的危险品编号。',
  chalk: '没有漆。编号是粉笔写的，写字的人手很稳。',
};

export const ALL_SEALS: readonly SealColor[] = [
  'rust',
  'bone',
  'ash',
  'blood',
  'tar',
  'chalk',
];

// ============================================================================
// 音效
// ----------------------------------------------------------------------------
// 玩家大部分时间盯着一块低分辨率的全息屏，听觉承载的信息量比视觉大。
// 所以每一爪 —— 不只是出事的那一爪 —— 都有声音。
//
// 这张白名单里的每个 id 都在 audio/cues.ts 的 CUES 表里存在过。
// 类型系统会挡住拼错的，validateContainers 会再查一遍运行时的值。
// 不要往这里加没合成出来的 cue：AudioEngine 只会 console.warn 然后安静地什么都不放，
// 那种 bug 在一款靠听觉叙事的游戏里能藏几个月。
// ============================================================================

export const CONTAINER_CUES = [
  'hatch.wheel',
  'valve.turn',
  'door.jam',
  'door.close',
  'door.knock',
  'item.pickup',
  'item.metal-clatter',
  'paper.rustle',
  'glass.break',
  'match.strike',
  'cloth.rustle',
  'body.drag',
  'step.metal',
  'water.splash',
  'water.bubble',
  'water.submerge',
  'water.pressure-jet',
  'hull.pop',
  'hull.crack',
  'hull.rivet-pop',
  'hull.ping-return',
  'flesh.wet',
  'bone.snap',
  'electric.arc',
  'creature.skitter',
  'creature.breath-sync',
  'listener.near',
  'listener.call',
  'listener.scream',
  'sonar.array-spin',
] as const;

export type CueId = (typeof CONTAINER_CUES)[number];

/**
 * 想要的 cue → 现在顶着的 cue。
 *
 * 机械臂自己的声音一个都还没有。这在一款「玩家大部分时间盯着一块低分辨率屏」的
 * 游戏里是最大的一块空白 —— 伸爪、碰到、咬住、拔出来，这四下是整条玩法动线的
 * 主旋律，现在全靠别的域的音效顶。
 *
 * 音频那边补齐以后，只需要把 ARM 里对应的那一行换成真 id，时间轴的结构不用动。
 */
export const CUE_SUBSTITUTIONS: readonly { wanted: string; using: CueId; note: string }[] = [
  { wanted: 'arm.servo', using: 'sonar.array-spin', note: '机械臂伸出/收回的伺服底噪。现在顶着的是雷达阵列转动，包络像，但音色太干净' },
  { wanted: 'arm.grip', using: 'item.pickup', note: '爪合拢咬住东西的那一下。现在顶着的是通用拾取音，缺液压的闷' },
  { wanted: 'arm.retract', using: 'valve.turn', note: '爪收回来时的棘轮与泄压。现在顶着的是阀门' },
  { wanted: 'arm.stall', using: 'door.jam', note: '液压过载、臂卡死。现在顶着的是门卡住，太短' },
  { wanted: 'crate.seal-peel', using: 'door.jam', note: '撕封条。这是「封条会撒谎」机制的听觉标志，现在完全没有专属音' },
  { wanted: 'crate.lid-open', using: 'hatch.wheel', note: '箱盖翻开的空腔共鸣。和开门不是一回事' },
  { wanted: 'fabric.tear', using: 'cloth.rustle', note: '撕制服。重封箱第二爪的填充物是撕碎的制服' },
  { wanted: 'photo.slide', using: 'paper.rustle', note: '照片从口袋里抽出来。极轻，但它是遗物时刻的落点音' },
  { wanted: 'concrete.scrape', using: 'step.metal', note: '爪刮水泥配重。压载格现在借金属音，听起来不像水泥' },
];

/** 机械臂那四下。换真音效时只改这里 */
const ARM = {
  out: 'sonar.array-spin' as CueId,
  grip: 'item.pickup' as CueId,
  back: 'valve.turn' as CueId,
  stall: 'door.jam' as CueId,
};

// ============================================================================
// 后果标签
// ----------------------------------------------------------------------------
// 上一版所有 hazard 的结算一模一样：噪音 +0.45、扣一点舱体。文案分化了，
// 机制没有 —— 于是「电解液渗出来」和「他的下颌在动」在玩法上是同一件事。
// tag 让调用方能把它们分开。每一个 tag 对应一种真正不同的后果，
// 不对应任何后果的 tag 不该存在。
// ============================================================================

export type SearchTag =
  /** 爪被卡住/扎穿，机械手在 tagDuration 秒内不可用 */
  | 'arm.jam'
  /** 短暂照亮整间房。tagDuration 秒内房间可见，别的东西也被照出来 */
  | 'flash'
  /** 里面的东西反过来抓住了爪。要花代价挣脱，挣不脱就丢臂 */
  | 'grabbed'
  /** 液体泄漏，tagDuration 秒内持续腐蚀 */
  | 'spill'
  /** 结构破了，进水速率永久上升 */
  | 'breach'
  /** 噪音持续外泄 tagDuration 秒，把远处的东西叫过来 */
  | 'lure'
  /** 这一间里的东西醒了，直接推进遭遇 */
  | 'wake'
  /** 爪碰到的是人。认知冲击，不是物理伤害 */
  | 'contact'
  /** 这一爪出奇地安静，对外噪音按零算 */
  | 'quiet'
  /** 掏出来的是遗物，值得单独在屏上展示一次 */
  | 'keepsake';

// ============================================================================
// 那个人
// ----------------------------------------------------------------------------
// 一局一个。照片、信、工牌、戒指、录音全部指向他，「里面有人」那几只箱子里
// 躺着的也是他的同事。玩家不会被告知这件事 —— 他会在第三四只箱子的时候
// 注意到编号连着号、地址是同一个，然后自己把它拼出来。
// ============================================================================

export interface ContainerPerson {
  name: string;
  /** 制服领章上的职位 */
  role: string;
  /** 工牌钢印号。所有他的东西上都是这个号 */
  tagNo: string;
  /** 信封上的收件地址 */
  home: string;
  /** 他随身那件东西。一定是一个真实存在的纯叙事物件 */
  keepsake: SupplyId;
  /** 他写下的最后一句话 */
  lastLine: string;
}

const NAMES: readonly string[] = [
  'B·奥尔森',
  'M·哈韦尔',
  'J·雷斯',
  'A·东布罗夫斯基',
  'L·基廉',
  'R·瓦伊纳',
  'S·默奇',
  'T·阿卜迪',
];

const ROLES: readonly string[] = [
  '二级泵工',
  '声呐记录员',
  '平台电工',
  '压力舱护士',
  '缆绳长',
  '轮机二副',
  '仓储员',
  '潜水监督',
];

const HOMES: readonly string[] = [
  '一个没有海的城市',
  '内陆的一个矿镇',
  '沃尔顿，邮编只有四位',
  '她母亲的农场',
  '瑟兰的一间租屋',
  '一个叫科尔的镇子',
];

const LAST_LINES: readonly string[] = [
  '不必了。',
  '我数到第四百下就不数了。',
  '别开这只箱子。',
  '我听见你了。你不用再喊。',
  '告诉她我一直在写。',
  '它在外面数我们。数到今天是九。',
];

/**
 * 没传 memory 时用的那个人。
 *
 * 用一个固定的人而不是让占位符露出来 —— 文案在任何情况下都必须读得通顺。
 * 代价是不传 memory 的时候每一局都是同一个人，这正好等于上一版的行为。
 */
const DEFAULT_PERSON: ContainerPerson = {
  name: 'B·奥尔森',
  role: '二级泵工',
  tagNo: 'D9-2207',
  home: '一个没有海的城市',
  keepsake: 'sup.idtag',
  lastLine: '不必了。',
};

export interface ContainerMemory {
  person: ContainerPerson;
  /** 每种原型已经被翻过几只。键是 ArchetypeId */
  seen: Record<string, number>;
  /**
   * 玩家**见过**的遗物 —— 注意是见过，不是拿到。
   *
   * 爪把它掏出来、灯照到它、玩家读了那一行字，就算见过，哪怕背包塞不下、
   * 哪怕他当场决定不要。这是故意的：组合信息在「读到」的时候触发，不在
   * 「拥有」的时候触发。你可以知道，但你带不走 —— 这是这套内容里
   * 唯一一个不用任何数值就能制造的两难。
   */
  found: SupplyId[];
  /** 已经拼出来过的组合 id。每个组合只说一次 */
  noticed: string[];
}

// ----------------------------------------------------------------------------
// 组合
// ----------------------------------------------------------------------------
// 两件东西放在一起说出第三件事。规则只有一条：组合句必须是两件单独都说不出来的
// ——如果它只是把两句话拼起来，那它就不该存在。
//
// 每一条都要能被指着问「这是从哪推出来的」，并且答得上来。
// ----------------------------------------------------------------------------

export type CombinationId =
  | 'cmb.drawing-recording'
  | 'cmb.idtag-photo'
  | 'cmb.ring-letter'
  | 'cmb.hymnal-watch'
  | 'cmb.recording-letter'
  | 'cmb.scattered'
  | 'cmb2.swap'
  | 'cmb2.scheduled'
  | 'cmb2.audience';

export interface Combination {
  id: CombinationId;
  /**
   * 要同时满足的条件。每一项要么是一件见过的东西，要么是一条**已经拼出来过的
   * 结论** —— 后者让结论本身变成材料，于是故事有了第二层。
   */
  needs: readonly (SupplyId | CombinationId)[];
  /** 拼出来的那句话。支持占位符 */
  line: string;
}

function isComboRef(x: string): x is CombinationId {
  return x.startsWith('cmb.') || x.startsWith('cmb2.');
}

export const COMBINATIONS: readonly Combination[] = [
  {
    // 画上「船底有个比船大的东西」+ 录音「它在外面数我们」
    // → 单独看画是小孩的想象，单独听录音是船员的谵妄。放一起，时间顺序把两者都推翻了
    id: 'cmb.drawing-recording',
    needs: ['sup.drawing', 'sup.recording'],
    line:
      '画是画在配给表背面的，那张表的签发日期在下潜之前。所以船底那个东西不是孩子想出来的 —— 是有人先看见了它，回家讲给孩子听，然后又回到这里来。',
  },
  {
    // 工牌钢印号 + 照片背面冲印编号
    // → 两个编号连着号，但照片上挂牌的人不是这块牌子的主人
    id: 'cmb.idtag-photo',
    needs: ['sup.idtag', 'sup.photo'],
    line:
      '工牌的钢印号和照片背面的冲印编号是连着的一批。照片上站中间那个人胸前也挂着牌，号码比你手里这块小一位。你捞上来的不是他的牌子，是站在他旁边那个人的。',
  },
  {
    // 戒指内圈两个名字 + 信封上的收件地址
    // → 他最后写信的对象，和他带在身上的那个人，不是同一个
    id: 'cmb.ring-letter',
    needs: ['sup.ring', 'sup.letter'],
    line:
      '戒指内圈刻着两个名字，一个是{name}。信封上的收件地址是{home}，而那一栏的收件人不是刻在戒指上的另一个。他最后几天写信的对象，和他一直挂在颈绳上的那个人，不是同一个人。',
  },
  {
    // 祷词抄十七遍 + 怀表停在四点十七分
    // → 十七不是虔诚，是计数；而且他知道自己会数到哪一格
    id: 'cmb.hymnal-watch',
    needs: ['sup.hymnal', 'sup.watch'],
    line:
      '祷词抄了十七遍。怀表停在四点十七分。第十七遍那几行的笔压比前面十六遍都轻 —— 他不是在祈祷，他在数，而且他提前知道自己会数到哪一格。',
  },
  {
    // 录音最后一句 == 信的最后一行
    // → 同一句话被说了两次，中间隔了多久没有任何东西能告诉你
    id: 'cmb.recording-letter',
    needs: ['sup.recording', 'sup.letter'],
    line:
      '磁带最后那句话和信的最后一行一个字不差：「{last}」他写了一遍，又对着机器念了一遍。两次之间隔了多久，这条沟里没有任何东西能告诉你。',
  },
  {
    // 三件随身物，分别在三只不同的箱子、三个不同的舱室
    // → 没有人会把自己的东西这么放
    id: 'cmb.scattered',
    needs: ['sup.idtag', 'sup.ring', 'sup.watch'],
    line:
      '牌子、戒指、表。三样贴身的东西在三只不同的箱子里，三只箱子不在同一间舱室。没有人会把自己的东西这么放 —— 是别人替{name}放的，而且放得很有耐心。',
  },

  // --------------------------------------------------------------------------
  // 二阶：材料是两条结论，不是两件东西
  //
  // 同一条规矩，只是提高了一层：拼出来的那句话必须是两条一阶结论单独都说不出来
  // 的。它们理应难得 —— 要先把四五件东西凑齐，还要先想明白两件事，才轮得到第三件。
  // --------------------------------------------------------------------------
  {
    // 「牌子不是他的」+「三样东西是别人替他放的」
    // → 单独看，第一条是一次错认，第二条是一次好心的收殓。
    //   合起来，两条都不是意外：有人在系统地换牌子
    id: 'cmb2.swap',
    needs: ['cmb.idtag-photo', 'cmb.scattered'],
    line:
      '牌子和照片对不上号，而三样贴身的东西是别人替他摆的。这两件事只有一个解释同时成立：牌子是被人从一个人身上取下来、系到另一个人脖子后面的。名单上划掉的名字和箱子里的人，从一开始就不是同一批 —— 有人在替这条沟重新编号。',
  },
  {
    // 「那东西在下潜之前就被看见过」+「十七遍是计数不是虔诚」
    // → 单独看，第一条说明有人早就知道，第二条说明有人在数。
    //   合起来：他们不是遇上了它，是算着日子来的
    id: 'cmb2.scheduled',
    needs: ['cmb.drawing-recording', 'cmb.hymnal-watch'],
    line:
      '有人在下潜之前就见过它，而船上有人一直在数。两件事扣在一起，这趟船就不是一次事故了 —— 他们是算着日子下来的。四点十七分不是它到的时间，是他们准备好的时间。',
  },
  {
    // 「写信的对象和身上带的人不是同一个」+「同一句话写了一遍又念了一遍」
    // → 单独看，第一条是一桩私事，第二条是一次重复。
    //   合起来：那句话根本不是说给人听的
    id: 'cmb2.audience',
    needs: ['cmb.ring-letter', 'cmb.recording-letter'],
    line:
      '信不是写给他一直带在身上的那个人的，而最后那句话他写了一遍、又对着机器念了一遍。念的时候，机器没有对着他自己。「{last}」—— 这句话不是留给任何一个人的，是说给还在外面的那个东西听的。他要它知道他已经听见了。',
  },
];

/** 这条结论需要先想明白几层。1 = 只靠东西就能拼出来 */
export function combinationTier(id: CombinationId): number {
  const c = COMBINATIONS.find((x) => x.id === id);
  if (!c) return 0;
  let tier = 1;
  for (const n of c.needs) {
    if (isComboRef(n)) tier = Math.max(tier, combinationTier(n) + 1);
  }
  return tier;
}

/**
 * 查一条刚刚拼出来的组合，并把它标记为已说过。
 *
 * 会改 memory.noticed —— 所以它不是纯函数，但这是故意的：调用方在每次
 * searchContainer 之后无脑调一次就行，同一条不会说第二遍。
 * 需要不改状态地看一眼，用 peekCombinations。
 */
export function noticeCombination(memory: ContainerMemory): string | null {
  const c = pendingCombination(memory);
  if (!c) return null;
  memory.noticed.push(c.id);
  return fillPersonText(c.line, memory);
}

/** 不改状态地看一眼下一条会拼出什么 */
export function pendingCombination(memory: ContainerMemory): Combination | null {
  for (const c of COMBINATIONS) {
    if (isReady(c, memory)) return c;
  }
  return null;
}

/** 不改状态地列出全部已经够条件、但还没说过的组合 */
export function peekCombinations(memory: ContainerMemory): readonly Combination[] {
  return COMBINATIONS.filter((c) => isReady(c, memory));
}

function isReady(c: Combination, memory: ContainerMemory): boolean {
  if (memory.noticed.includes(c.id)) return false;
  // 一件东西要「见过」，一条结论要「已经想明白过」
  return c.needs.every((n) =>
    isComboRef(n) ? memory.noticed.includes(n) : memory.found.includes(n),
  );
}

function pickFrom<T>(rng: Rng, arr: readonly T[], fallback: T): T {
  if (arr.length === 0) return fallback;
  const i = Math.min(arr.length - 1, Math.floor(rng.next() * arr.length));
  return arr[i] ?? fallback;
}

/** 开局抽一个人。整局的遗物都指向他 */
export function makeContainerMemory(rng: Rng): ContainerMemory {
  const keepsake = pickFrom(rng, NARRATIVE_SUPPLY_IDS, DEFAULT_PERSON.keepsake);
  return {
    person: {
      name: pickFrom(rng, NAMES, DEFAULT_PERSON.name),
      role: pickFrom(rng, ROLES, DEFAULT_PERSON.role),
      // 编号像真的：区号 + 四位。同一个人在所有东西上都是这个号
      tagNo: `D${9 - Math.floor(rng.next() * 3)}-${1000 + Math.floor(rng.next() * 8999)}`,
      home: pickFrom(rng, HOMES, DEFAULT_PERSON.home),
      keepsake,
      lastLine: pickFrom(rng, LAST_LINES, DEFAULT_PERSON.lastLine),
    },
    seen: {},
    found: [],
    noticed: [],
  };
}

/** 文案里允许出现的占位符。validateContainers 会拿它查有没有写错的 */
export const PERSON_TOKENS: readonly string[] = [
  '{name}',
  '{role}',
  '{tag}',
  '{home}',
  '{keepsake}',
  '{last}',
];

/**
 * 把文案里的占位符换成这一局那个人。
 *
 * supplies.ts 里的 effect.log 也用同一套占位符，run.ts 应该在打日志前过一遍这个函数。
 */
export function fillPersonText(text: string, memory?: ContainerMemory): string {
  const p = memory?.person ?? DEFAULT_PERSON;
  if (text.indexOf('{') < 0) return text;
  return text
    .replace(/\{name\}/g, p.name)
    .replace(/\{role\}/g, p.role)
    .replace(/\{tag\}/g, p.tagNo)
    .replace(/\{home\}/g, p.home)
    .replace(/\{keepsake\}/g, SUPPLIES[p.keepsake]?.name ?? '一件他随身的东西')
    .replace(/\{last\}/g, p.lastLine);
}

// ============================================================================
// 类型
// ============================================================================

export type ContainerKind = 'supply' | 'medical' | 'looted' | 'marked';

export type ArchetypeId =
  | 'sup.standard'
  | 'sup.deep'
  | 'sup.ballast'
  | 'med.locker'
  | 'med.spent'
  | 'eng.tools'
  | 'eng.oxygen'
  | 'eng.battery'
  | 'wrk.looted'
  | 'wrk.occupied'
  | 'psn.personal'
  | 'odd.resealed'
  | 'odd.overgrown'
  | 'odd.mimic';

/**
 * 风险曲线的形状。
 *
 * 上一版所有箱子都是「只在最后一爪出事」，于是最优解永远是同一个固定动作：
 * 翻到倒数第二爪就收手。一个玩家发现它之后，整套翻箱机制就退化成了执行。
 *
 * 现在有四种形状，而且**封条读不出形状** —— 每一条封条背后都至少站着两种
 * 不同曲线的箱子（validateContainers 会强制这一点）。玩家能学到的仍然只有概率：
 * 「沥青封条里有工具柜（均匀）、氧箱（后置）和电池架（中置）」，
 * 所以不存在一个对所有箱子都成立的停手时刻。
 */
export type RiskShape =
  /** 后置：越往里越危险。深处的东西最好，代价也最大 */
  | 'back'
  /** 前置：第一爪最危险，撞开了反而安全。停在第一爪是最亏的 */
  | 'front'
  /** 均匀：每一爪一样危险。翻多久是纯粹的贪心问题 */
  | 'flat'
  /** 中置：危险在中间那一爪。两头都安全，穿过去才拿得到底 */
  | 'mid';

/** 从曲线本身算形状，而不是手写标签 —— 标签和数据不可能对不上 */
export function riskShapeOf(curve: readonly number[]): RiskShape {
  if (curve.length === 0) return 'flat';
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  let maxAt = 0;
  for (let i = 1; i < curve.length; i++) if (curve[i]! > curve[maxAt]!) maxAt = i;
  if (maxAt > 0 && maxAt < curve.length - 1) return 'mid';
  if (first >= last * 1.5) return 'front';
  if (last >= first * 1.5) return 'back';
  return 'flat';
}

/** 一爪的全部内容：说什么、响什么、掏出什么、留下什么后果 */
export interface Beat {
  line: string;
  cue: CueId;
  /** 0..1，不写按 0.6 */
  gain?: number;
  loot?: readonly (readonly [SupplyId, number])[];
  tag?: SearchTag;
  /** 秒。只有 arm.jam / flash / grabbed / spill / lure 用得上 */
  dur?: number;
  /** 只有 hazard 用：这句话只能在这几爪上说。不写 = 哪一爪都行 */
  at?: readonly number[];
  /**
   * 这一爪自己的噪音 0..1。不写就用原型的。
   *
   * 把一块铅酸电池拖出来和掀起一张配给表，不该是同一个响度。
   * 这条一半是写实，一半是结构：那些「只有故事没有物资」的爪次几乎都是
   * 轻的动作，于是它们的代价基本不随噪音定价浮动 —— 玩家为一句话付的
   * 价钱是稳定的，不会因为上游把噪音调贵就突然变得不可承受。
   */
  noise?: number;
}

/** 第二次、第三次遇到同一种箱子时替换掉的部分。掏出什么不变 */
export interface VariantBeat {
  line: string;
  cue?: CueId;
  gain?: number;
  tag?: SearchTag;
  dur?: number;
}

/** 一只箱子从头翻到尾的全部文本。pass 的长度必须等于 passes */
export interface ArchetypeLines {
  /** 第 n 爪写进日志的那句话。下标 = 爪次 */
  pass: readonly string[];
  /** 出事时的描写，随机取一句 */
  hazard: readonly string[];
  /** 翻到底之后还伸爪 */
  done: string;
}

export interface ContainerArchetype {
  kind: ContainerKind;
  seal: SealColor;
  /** 一共可以翻几爪 */
  passes: number;
  /** 出货表。按爪次逐层取，靠后的更好也更险 */
  loot: readonly (readonly (readonly [SupplyId, number])[])[];
  /** 每一爪的噪音 0..1 */
  noise: number;
  /** 每一爪的呼吸代价 */
  cost: number;
  /** 翻到最后一爪触发坏事的概率 0..1 */
  risk: number;
}

/** 原型的完整定义。ARCHETYPES 用的是这个，它向上兼容 ContainerArchetype */
export interface ContainerArchetypeDef extends ContainerArchetype {
  id: ArchetypeId;
  /** 写在设计文档和统计里的名字，不给玩家看 */
  cn: string;
  /** 抽取权重。数越大越常见 */
  weight: number;
  /** 深度带来的权重变化率。+1 表示最后一关的权重是第一关的两倍 */
  depthWeight: number;
  /** 这只箱子挂着一条不属于它的封条的基准概率 0..1，实际值还要乘深度系数 */
  deceit: number;
  /** 撒谎时可能披的封条。不含它自己的 seal */
  masks: readonly SealColor[];
  /**
   * 逐爪的出事概率，下标 = 爪次。长度 === passes。
   *
   * 这才是真正生效的那一份。risk 和 earlyRisk 是从它推出来的旧字段，
   * 留着是为了不打断已经在读它们的调用方。
   */
  riskCurve: readonly number[];
  /** 逐爪噪音。长度 === passes。没单独写的爪次就是原型的 noise */
  noiseCurve: readonly number[];
  /** 非最后一爪也可能出事的概率 0..1。从 riskCurve 推出来的旧字段 */
  earlyRisk: number;
  /** 出事时舱体受的损伤 0..1 */
  hullDamage: number;
  /** 出事之后这只箱子就没了，不能再翻 */
  hazardEnds: boolean;
  /** 这一爪会额外掏出那个人的遗物。-1 = 这种箱子里没有他的东西 */
  keepsakeSlot: number;
  beats: readonly Beat[];
  /** 第 n+1 次遇到时的替换文案。variants[0] 是第二次 */
  variants: readonly (readonly VariantBeat[])[];
  hazards: readonly Beat[];
  doneBeat: Beat;
  lines: ArchetypeLines;
}

/** 一只箱子在这一局里的状态 */
export interface ContainerState {
  /** 对应 VolumeNode.obstacles 里那只箱子的 id */
  obstacleId: string;
  nodeId: string;
  kind: ContainerKind;
  seal: SealColor;
  /** 已经翻过几爪 */
  searched: number;
  passes: number;
  /** 撬开了没有。没撬开之前读不到里面 */
  opened: boolean;
  /** 已经被掏空 */
  exhausted: boolean;
  loot: readonly (readonly (readonly [SupplyId, number])[])[];
  noise: number;
  cost: number;
  risk: number;
  /** 掷出来的原型。没有它也能翻，只是文案会退回通用句 */
  archetype?: ArchetypeId;
  /** 这只箱子该有的封条。seal 与它不同，说明封条在撒谎 */
  honestSeal?: SealColor;
  /** 封条撒了谎。给复盘、成就和「你早该看出来」用 */
  deceived?: boolean;
  /** 这是玩家遇到的第几只同类箱子。0 = 第一只。第一爪时从 memory 定下来 */
  tier?: number;
  /** 掷它的时候那一关有多深 0..1 */
  depth01?: number;
  /** 逐爪出事概率。没有它就退回 last ? risk : earlyRisk 的老算法 */
  riskCurve?: readonly number[];
  /** 玩家已经驶离这只箱子。missedStory 只在它为真时开口 */
  left?: boolean;
}

/** 时间轴上的一下。at 是相对这一爪开始的秒数 */
export interface CueStep {
  at: number;
  cue: string;
  gain: number;
}

export type SearchOutcome = 'loot' | 'empty' | 'hazard' | 'done';

export interface SearchResult {
  outcome: SearchOutcome;
  /** 这一爪掏出来的东西 */
  gained: readonly (readonly [SupplyId, number])[];
  /** 写进日志的那句话。占位符已经替换过了 */
  line: string;
  /** 这一爪的噪音 */
  noise: number;
  /** 这一爪的呼吸代价 */
  cost: number;
  /** 出事时舱体受的损伤 0..1 */
  hull: number;
  /** 这一爪留下的后果。没有就是没有 */
  tag?: SearchTag;
  /** 秒。见 SearchTag 各成员的注释 */
  tagDuration?: number;
  /** 真实存在的 cue id，直接喂 onCue。cueTrack 放不了时的回退 */
  cue?: string;
  cueGain?: number;
  /**
   * 这一爪的声音时间轴。
   *
   * 一爪不是一个声音，是一段过程：伸出去、碰到、咬住、拔回来。
   * 时间轴的**长度和结尾方式本身就是信息** —— 调用方应当按 at 排期播放，
   * 并且**在时间轴走完之后**才把 line 推进日志。这样玩家会先用耳朵知道结果：
   *
   *   · 掏到东西 —— 四下走完，最后是干净的收回；
   *   · 空的     —— 没有「咬住」那一下，爪提前空着回来，轴比正常短一截；
   *   · 出事     —— 在本该咬住的时刻之前就被打断，而且没有收回那一下。
   *                  爪没有回来，这件事是听得出来的。
   */
  cueTrack?: readonly CueStep[];
}

// ============================================================================
// 原型表
// ----------------------------------------------------------------------------
// 每一种都要有一个玩家会记住的瞬间，而且那个瞬间只能发生在这一种箱子里。
// 语气规则：只写发生了什么，不写玩家感觉到什么。温度、角度、声音持续了多久，
// 这些是可以写的；「你感到恐惧」不行 —— 那是玩家自己的事。
// ============================================================================

interface ArchetypeSpec {
  id: ArchetypeId;
  cn: string;
  kind: ContainerKind;
  seal: SealColor;
  weight: number;
  depthWeight?: number;
  noise: number;
  cost: number;
  /** 逐爪出事概率。长度必须等于 beats 的长度 */
  riskCurve: readonly number[];
  deceit: number;
  masks: readonly SealColor[];
  hullDamage: number;
  hazardEnds?: boolean;
  keepsakeSlot?: number;
  beats: readonly Beat[];
  variants?: readonly (readonly VariantBeat[])[];
  hazards: readonly Beat[];
  done: Beat;
}

/**
 * 把 beats 摊成 ContainerArchetype 那几个老字段。
 *
 * passes / loot / lines 全部是从 beats 推出来的，不是手写的 ——
 * 手写的那一版上个版本就差点让某只箱子的出货表比文案多一层。
 */
function archetype(spec: ArchetypeSpec): ContainerArchetypeDef {
  const curve = spec.riskCurve;
  return {
    id: spec.id,
    cn: spec.cn,
    kind: spec.kind,
    seal: spec.seal,
    weight: spec.weight,
    depthWeight: spec.depthWeight ?? 0,
    passes: spec.beats.length,
    loot: spec.beats.map((b) => b.loot ?? []),
    noise: spec.noise,
    cost: spec.cost,
    // risk / earlyRisk 是从曲线推出来的旧字段，不手写 —— 手写的那一版
    // 迟早会和曲线对不上，而对不上的那一天没有人会发现
    risk: curve[curve.length - 1] ?? 0,
    riskCurve: curve,
    noiseCurve: spec.beats.map((b) => b.noise ?? spec.noise),
    deceit: spec.deceit,
    masks: spec.masks,
    earlyRisk: curve.length > 1 ? Math.max(...curve.slice(0, -1)) : 0,
    hullDamage: spec.hullDamage,
    hazardEnds: spec.hazardEnds ?? false,
    keepsakeSlot: spec.keepsakeSlot ?? -1,
    beats: spec.beats,
    variants: spec.variants ?? [],
    hazards: spec.hazards,
    doneBeat: spec.done,
    lines: {
      pass: spec.beats.map((b) => b.line),
      hazard: spec.hazards.map((b) => b.line),
      done: spec.done.line,
    },
  };
}

export const ARCHETYPES: readonly ContainerArchetypeDef[] = [
  archetype({
    id: 'sup.standard',
    cn: '标准补给格',
    kind: 'supply',
    seal: 'rust',
    weight: 18,
    // 越往下，还没被人动过的标准格越少
    depthWeight: -0.4,
    noise: 0.24,
    cost: 4,
    // 后置，但整条都很轻。一只标准补给格的箱底伤不了人 ——
    // 第三爪的代价是时间和噪音，不是血。这让「为了一张纸多伸一爪」
    // 的价格**不随危险定价而变**，无论上游把出事算得多贵，这笔账都成立
    riskCurve: [0.02, 0.03, 0.08],
    deceit: 0.08,
    masks: ['ash', 'bone'],
    hullDamage: 0.08,
    beats: [
      // 装箱的人把最重的东西最后放进去，所以它在最上面。这只箱子的物资是
      // 前重后轻的，而风险是后重前轻的 —— 只算账的话，第一爪就该收手。
      // 而第三爪压着的是那张配给表。整条沟最常见的一只箱子，用它问一个问题：
      // 你为了一句话愿意多付多少。
      {
        line: '压条一崩就开了。防潮纸下面压着一块铅酸电池，装箱的人把最重的放在了最后。',
        cue: 'hatch.wheel',
        gain: 0.5,
        loot: [
          ['sup.cell', 1],
          ['sup.tape', 1],
        ],
      },
      {
        line: '第二层是滤芯盒。封口塑料还有弹性 —— 这只箱子在水里没待多久。',
        cue: 'item.pickup',
        gain: 0.55,
        loot: [['sup.filter', 1]],
      },
      // 整条沟最常见那只箱子的最底层，物资价值是零。只有一张纸。
      // 停手曲线会算出「第三爪不该伸」，而伸不伸，是玩家自己的事。
      {
        line: '箱底压着一张配给表。十一个名字，前十个被划掉了，第十一个后面写着「不必了」。',
        cue: 'paper.rustle',
        gain: 0.6,
        // 掀一张纸。这一爪几乎不发出声音
        noise: 0.05,
      },
    ],
    variants: [
      [
        { line: '又是一只锈橙格。压条崩开的声音和上一只一模一样，电池的位置也一样。' },
        { line: '第二层照例是滤芯。你已经知道第三层压着什么了。' },
        { line: '箱底又是一张配给表。这张上面十四个名字，最后一个是{name}。' },
      ],
      [
        { line: '第三只。你现在能从压条崩开的声音里听出它装没装满。' },
        { line: '滤芯盒。你不再看它，直接往下一层伸。' },
        {
          line: '配给表的格式一模一样，签发人也一模一样。整条沟按同一张表配给，然后同时停了。',
        },
      ],
    ],
    hazards: [
      {
        line: '最底下那层不是货，是把货压平的东西。机械手一抬，它散开了。',
        cue: 'item.metal-clatter',
        gain: 0.85,
        tag: 'lure',
        dur: 12,
        at: [2],
      },
      {
        line: '箱底的托盘是锈穿的。整层货顺着裂口掉进下面的黑水里，一件没剩。',
        cue: 'water.splash',
        gain: 0.7,
      },
    ],
    done: { line: '空格子里只剩防潮纸在飘。爪刮过铁皮，回声一路传下去。', cue: 'hull.ping-return', gain: 0.4 },
  }),

  archetype({
    id: 'sup.deep',
    cn: '深舱补给整格',
    kind: 'supply',
    seal: 'rust',
    weight: 6,
    // 完整的深舱整格越往下越少见 —— 「撑过第一爪就有回报」这条出路
    // 在深处会慢慢关掉
    depthWeight: -0.7,
    noise: 0.3,
    cost: 5,
    // 前置：整格货是悬着的，第一次把半条臂伸进去的时候梁最容易断。
    // 撑过第一爪，剩下三层几乎是白给 —— 而最好的东西在第四层。
    // 这只箱子就是专门用来惩罚「翻一爪就跑」的。
    riskCurve: [0.22, 0.05, 0.03, 0.02],
    deceit: 0.1,
    masks: ['tar', 'ash'],
    hullDamage: 0.1,
    beats: [
      {
        line: '这只比别的深。机械手伸进去半条臂才碰到第一层。',
        cue: 'body.drag',
        gain: 0.5,
        loot: [['sup.tape', 1]],
      },
      {
        line: '第二层是电工格。保险丝匣用铜丝捆着，捆法很讲究，解开花了四十秒。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [
          ['sup.filter', 1],
          ['sup.fuse', 1],
        ],
      },
      {
        line: '第三层压着一块铅酸电池和一台手摇泵。它们重得让整条臂往下沉了两厘米。',
        cue: 'item.metal-clatter',
        gain: 0.6,
        loot: [
          ['sup.cell', 1],
          ['sup.pump', 1],
        ],
      },
      {
        // 整张表里最肥的一层，压在唯一一只「危险全在第一爪」的箱子的最底下。
        // 撑过第一爪的人拿走它，第一爪就跑的人永远不知道它在
        line: '最底下是双组分胶、一支氧烛和一枚驱离脉冲。有人把它们留到最后，然后没能回来拿。',
        cue: 'item.pickup',
        gain: 0.6,
        loot: [
          ['sup.sealant', 1],
          ['sup.o2candle', 1],
          ['sup.pulse', 1],
        ],
      },
    ],
    hazards: [
      {
        line: '第四层底下是空的 —— 不是掏空的那种空。箱底被从外面顶穿了，边缘朝里卷。',
        cue: 'hull.crack',
        gain: 0.8,
        tag: 'breach',
        at: [3],
      },
      {
        line: '整格货是悬着的。支撑它的那根梁在爪下断了，箱子朝舱外的黑里掉。',
        cue: 'water.submerge',
        gain: 0.7,
        tag: 'lure',
        dur: 10,
      },
    ],
    done: { line: '四层全空。爪在里面转了一圈，什么都没勾到。', cue: 'hull.ping-return', gain: 0.4 },
  }),

  archetype({
    id: 'sup.ballast',
    cn: '压载格',
    kind: 'supply',
    seal: 'rust',
    weight: 7,
    noise: 0.22,
    cost: 3,
    // 均匀：一格水泥，每一块都一样可能松
    riskCurve: [0.05, 0.05],
    deceit: 0.1,
    masks: ['bone'],
    hullDamage: 0.06,
    beats: [
      { line: '里面是水泥块，整整齐齐，一块挨一块。这是配重，不是货。', cue: 'step.metal', gain: 0.45 },
      {
        line: '第二爪确认了：底下还是水泥。水泥缝里卡着一块怀表，表面朝下。',
        cue: 'hull.pop',
        gain: 0.4,
        loot: [['sup.watch', 1]],
        tag: 'keepsake',
        // 从两块水泥的缝里夹出一块表。动作很小，所以代价很小
        noise: 0.07,
      },
    ],
    variants: [
      [
        { line: '又是水泥。锈橙漆，标准压条，标准锁扣，水泥。' },
        { line: '这只的缝里也卡着东西。有人把它塞进去的时候，水泥还没干。' },
      ],
      [
        { line: '你已经认得这个重量了 —— 爪一碰就知道，底下是实心的。' },
        {
          line: '第三只配重格，第三样卡在缝里的东西。封条从来没骗你，是你自己愿意相信它。',
        },
      ],
    ],
    hazards: [
      {
        line: '一块配重松了，砸在爪上。铁皮响了很久才停。',
        cue: 'item.metal-clatter',
        gain: 0.85,
        tag: 'lure',
        dur: 14,
      },
    ],
    done: { line: '配重格。翻第三次也不会长出东西来。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'med.locker',
    cn: '医疗格',
    kind: 'medical',
    seal: 'bone',
    weight: 10,
    noise: 0.18,
    cost: 4,
    // 后置：玻璃安瓿全在最里面那一格
    riskCurve: [0.02, 0.04, 0.1],
    deceit: 0.1,
    masks: ['rust', 'chalk'],
    hullDamage: 0.06,
    beats: [
      {
        line: '白漆下面是一排橡胶卡扣。第一支针还在它的槽里，槽是照着针的形状压出来的。',
        cue: 'cloth.rustle',
        gain: 0.5,
        loot: [['sup.stim', 1]],
      },
      {
        line: '第二格是管制柜。锁被人用钥匙开过又扣上了 —— 钥匙不在这只箱子里。柜底压着一张处方笺，正面抄满了字。',
        cue: 'door.jam',
        gain: 0.5,
        loot: [
          ['sup.wax', 1],
          ['sup.morphine', 1],
          ['sup.hymnal', 1],
        ],
      },
      {
        line: '最里面塞着两样不该放在一起的东西：一支针，和一块口粮。有人在这儿等过很久。',
        cue: 'item.pickup',
        gain: 0.55,
        loot: [
          ['sup.stim', 1],
          ['sup.ration', 1],
        ],
      },
    ],
    hazards: [
      {
        line: '玻璃在爪里碎了。安瓿里的东西进了水，水在灯下变成很淡的粉色，然后散开。',
        cue: 'glass.break',
        gain: 0.75,
        tag: 'spill',
        dur: 8,
      },
      {
        line: '卡扣底下垫着的不是泡沫。爪一压，那层东西往回压了一下。',
        cue: 'flesh.wet',
        gain: 0.6,
        tag: 'contact',
      },
    ],
    done: { line: '医疗格见底。卡扣一个不少，槽全是空的。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'med.spent',
    cn: '取用过的医疗格',
    kind: 'medical',
    seal: 'bone',
    weight: 6,
    noise: 0.2,
    cost: 4,
    // 前置：上一个人把针留在了最上面那一格，针尖朝上。
    // 骨白封条背后同时站着后置的医疗格和前置的这只 —— 封条读不出形状
    riskCurve: [0.2, 0.03],
    deceit: 0.15,
    masks: ['rust'],
    hullDamage: 0.08,
    beats: [
      {
        line: '橡胶卡扣一个不少，槽全是空的。有人从头到尾取过一遍，取得很有条理。',
        cue: 'cloth.rustle',
        gain: 0.35,
        tag: 'quiet',
      },
      {
        line: '最下面一格漏了一盒耳塞蜡。它卡在缝里，所以留下了。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [['sup.wax', 1]],
      },
    ],
    variants: [
      [
        { line: '又一只被取空的医疗格。取的顺序和上一只一样：从左到右，从上到下。' },
        { line: '缝里又卡着一盒耳塞蜡。取东西的那个人不要耳塞蜡。' },
      ],
      [
        { line: '第三只。他一路取过去，每一只都只取药，不取别的。' },
        { line: '又是耳塞蜡。他不需要听不见 —— 他需要听得见。' },
      ],
    ],
    hazards: [
      {
        line: '最上面那一格里立着一支没用过的针，针尖朝上。它扎穿了液压管的外皮，油顺着臂往上爬。',
        cue: 'hull.rivet-pop',
        gain: 0.6,
        tag: 'arm.jam',
        dur: 20,
      },
    ],
    done: { line: '这只医疗格被两个人翻过了。你是第二个。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'eng.tools',
    cn: '工具柜',
    kind: 'supply',
    seal: 'tar',
    weight: 9,
    noise: 0.32,
    cost: 5,
    // 均匀：整排挂钩随时可能一起塌，第几爪碰的没区别
    riskCurve: [0.08, 0.08, 0.08],
    deceit: 0.12,
    masks: ['rust', 'ash'],
    hullDamage: 0.1,
    beats: [
      {
        line: '黑封条一撕，里面是挂着的工具，按长短排。少了三把，挂钩上还留着对应的影子。',
        cue: 'item.metal-clatter',
        gain: 0.5,
        loot: [
          ['sup.tape', 1],
          ['sup.grease', 1],
        ],
      },
      {
        line: '一次性切割器还在原包装里。包装上印着「一发」，印了两次。',
        cue: 'item.pickup',
        gain: 0.55,
        loot: [['sup.cutter', 1]],
      },
      {
        line: '底层是备件：一只灯泡，一块钢补板。板上用记号笔画了个箭头，指着它自己的一个角。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [
          ['sup.bulb', 1],
          ['sup.plate', 1],
        ],
      },
    ],
    hazards: [
      {
        line: '工具架整排塌下来。金属在铁皮箱里滚了十几秒才停。停下来之后，远处有回应。',
        cue: 'item.metal-clatter',
        gain: 0.95,
        tag: 'lure',
        dur: 18,
      },
      {
        line: '切割器的储气瓶被爪夹裂了。它在水里放完了全部的气，声音像有人在很近的地方吸气。',
        cue: 'water.pressure-jet',
        gain: 0.8,
        tag: 'lure',
        dur: 8,
      },
    ],
    done: { line: '挂钩空了。柜底剩下一层金属屑，在灯下是亮的。', cue: 'hull.ping-return', gain: 0.4 },
  }),

  archetype({
    id: 'eng.oxygen',
    cn: '应急氧箱',
    kind: 'supply',
    seal: 'tar',
    weight: 6,
    noise: 0.3,
    cost: 4,
    // 后置：最里面那支挤得变了形，引信皮也是它最先蹭掉
    riskCurve: [0.04, 0.09, 0.16],
    // 红漆的字面意思是「有人认为这里有问题」，而一箱氧烛确实有问题。
    // 让危险品也能挂上暗红，暗红才不会退化成一个百分之百准的怪物警报。
    deceit: 0.2,
    masks: ['bone', 'rust', 'blood'],
    hullDamage: 0.13,
    beats: [
      {
        line: '氧烛的铁筒上印着使用次序。第一支拿出来是温的 —— 是爪的温度传上去了。旁边塞着一盒滤芯。',
        cue: 'item.metal-clatter',
        gain: 0.45,
        loot: [
          ['sup.o2candle', 1],
          ['sup.filter', 1],
        ],
      },
      {
        line: '第二支的筒身鼓了一块。它在水里受过压，但没有破。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [['sup.o2candle', 1]],
      },
      {
        line: '最里面那一支挤得变了形。这只箱子被人塞过太多次，而最后塞进去的人没能再打开它。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [['sup.o2candle', 1]],
      },
    ],
    hazards: [
      {
        line: '爪蹭掉了一支氧烛的引信皮。它在水里自己烧起来，箱子里冒出一串白泡，然后那只箱子不在了。',
        cue: 'match.strike',
        gain: 0.9,
        tag: 'flash',
        dur: 6,
      },
      {
        line: '铁筒在爪里裂开。一千米的水压把火摁灭了，但灭之前它亮得整间舱室都白了一下。',
        cue: 'water.pressure-jet',
        gain: 0.85,
        tag: 'flash',
        dur: 2,
      },
    ],
    done: { line: '氧箱空了。泡沫托上还留着三个铁筒的印痕。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'eng.battery',
    cn: '电池架',
    kind: 'supply',
    seal: 'tar',
    weight: 7,
    noise: 0.34,
    cost: 6,
    // 中置：搬第二块的时候两根极柱最容易在水里搭上。
    // 搬开了它，最底下那块反而是干的 —— 但你得先穿过中间那一爪
    riskCurve: [0.05, 0.24, 0.07],
    deceit: 0.2,
    masks: ['rust', 'blood'],
    hullDamage: 0.12,
    beats: [
      {
        line: '架子最上一层是保险丝匣。每只匣子上的编号都是手写的，十二只，同一个人的字。',
        cue: 'item.pickup',
        gain: 0.5,
        loot: [['sup.fuse', 1]],
      },
      {
        line: '第二块电池搬出来的时候，极柱上的绿色结晶一路往下掉。',
        cue: 'item.metal-clatter',
        gain: 0.6,
        loot: [['sup.cell', 1]],
      },
      {
        line: '最底下那块比上面两块新。它的生产日期比这条沟里所有东西都晚。',
        cue: 'item.pickup',
        gain: 0.55,
        loot: [
          ['sup.cell', 1],
          ['sup.bulb', 1],
        ],
      },
    ],
    hazards: [
      {
        line: '电解液从一块裂壳的电池里渗出来。水在爪周围变成牛奶色，液压管的橡胶开始起泡。',
        cue: 'flesh.wet',
        gain: 0.7,
        tag: 'spill',
        dur: 14,
      },
      {
        line: '两根极柱在水里搭上了。蓝白色的光把这一间照了半秒，之后灯丝全黑。',
        cue: 'electric.arc',
        gain: 0.9,
        tag: 'flash',
        dur: 1,
      },
    ],
    done: { line: '电池架空了。托盘上留着三个方形的、干净的印子。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'wrk.looted',
    cn: '被先撬开过的',
    kind: 'looted',
    seal: 'ash',
    weight: 12,
    depthWeight: 0.3,
    noise: 0.28,
    cost: 3,
    // 前置：支架早就断了，你一动它就滑。灰封条背后同时站着前置的这只
    // 和后置的「里面有人」—— 又一条读不出形状的封条
    riskCurve: [0.2, 0.04],
    deceit: 0.18,
    masks: ['rust', 'bone'],
    hullDamage: 0.1,
    beats: [
      // 先到的那个人把能拿的都拿了，剩下的全在他够得着的那一层 —— 也就是最上面。
      // 前置的物资撞上前置的风险：这只箱子第一爪最值也最险，而第二爪什么都没有。
      // 它和标准格的形状正好相反，可是灰封条和锈橙封条都不会说这件事。
      {
        line: '压条是从里面顶开的。角落里剩着一卷胶带、一匣保险丝和一枚没打出去的诱饵 —— 胶带断口是用牙咬的。',
        cue: 'item.pickup',
        gain: 0.55,
        loot: [
          ['sup.tape', 1],
          ['sup.fuse', 1],
          ['sup.lure', 1],
        ],
      },
      {
        line: '第二爪只捞上来一把泡烂的填充物。底下再没有别的了。',
        cue: 'water.bubble',
        gain: 0.45,
        noise: 0.1,
      },
    ],
    variants: [
      [
        { line: '又一只被顶开的。剩下的还是胶带和诱饵，拿走别的东西的人当时一定听见了什么。' },
        { line: '填充物泡得比上一只还烂。底下照例是空的。' },
      ],
      [
        { line: '第三只。顶开的方向都一样 —— 从里面往外，剩的也都一样。' },
        { line: '有人沿着这条路一只一只地开，开到一半就不开了。' },
      ],
    ],
    hazards: [
      {
        line: '箱子后面的支架早就断了。你一动，整只箱连着一段舱壁往下滑。',
        cue: 'hull.crack',
        gain: 0.8,
        tag: 'breach',
      },
      {
        line: '有人在箱底放了一样立着的东西，尖朝上。放它的人知道会有第二个人来翻。',
        cue: 'bone.snap',
        gain: 0.7,
        tag: 'arm.jam',
        dur: 16,
      },
    ],
    done: { line: '别人比你先到，也比你翻得干净。', cue: 'hull.ping-return', gain: 0.35 },
  }),

  archetype({
    id: 'wrk.occupied',
    cn: '里面有人',
    kind: 'looted',
    seal: 'ash',
    weight: 6,
    depthWeight: 0.8,
    noise: 0.3,
    cost: 5,
    // 后置，而且第四爪是整张表里最贵的一爪 —— 要拿到最后那样东西，得把他翻过来。
    // 那一爪的物资价值是零，账面上绝不该伸。它是这套内容里最想让玩家违背账面的地方。
    // 它同时也是深度曲线的另一端：这种箱子越往下越多，于是「翻到底」这条策略
    // 会随着下潜自己失效
    riskCurve: [0.04, 0.09, 0.12, 0.4],
    deceit: 0.3,
    masks: ['rust', 'bone', 'tar'],
    // 一具身体和一只握住爪的手。壳没事
    hullDamage: 0.04,
    // 他随身那件东西在第二爪，跟照片一起出来
    keepsakeSlot: 1,
    beats: [
      {
        line: '灯照进去，里面有一双靴子，靴尖朝上。他是从里面把箱盖扣上的。',
        cue: 'water.submerge',
        gain: 0.5,
        tag: 'contact',
        loot: [
          ['sup.wax', 1],
          ['sup.ring', 1],
        ],
      },
      {
        line: '爪从他胸前的口袋里勾出一张照片。手套里的手指还是暖的 —— 探照灯在他身上照了两分钟。',
        cue: 'cloth.rustle',
        gain: 0.5,
        tag: 'keepsake',
        loot: [['sup.photo', 1]],
      },
      {
        line: '他把一封信压在身下。信封没封口，收件地址是{home}。',
        cue: 'paper.rustle',
        gain: 0.55,
        tag: 'keepsake',
        loot: [
          ['sup.letter', 1],
          ['sup.ration', 1],
        ],
      },
      {
        // 零物资。纯亏的一爪，而它是整条线唯一一处能对上号的地方
        line: '要拿到最后那样东西，得把他翻过来。牌子在他脖子后面，绳子是从后面系的 —— 不是他自己系的。',
        cue: 'body.drag',
        gain: 0.6,
        tag: 'keepsake',
        loot: [['sup.idtag', 1]],
      },
    ],
    variants: [
      [
        { line: '又一个。这个也是从里面把箱盖扣上的。' },
        { line: '胸口的口袋里又是一张照片，和上一张是同一张。冲印的编号连着号。' },
        { line: '信也写给同一个地址。这一封的字比上一封稳。' },
        { line: '这一个的牌子也在脖子后面。系法一模一样，是同一双手系的。' },
      ],
      [
        { line: '第三只。靴尖朝上。他们是各自进去的，谁也没帮谁扣上盖子。' },
        { line: '这一张照片背面写着{tag}。你在第一具身上见过同一个编号。' },
        { line: '信上只写了一行：{last}' },
        { line: '牌子翻过来，钢印号和前两块连着。有人按顺序给他们每人系了一块。' },
      ],
    ],
    hazards: [
      {
        line: '你动了他的手臂。整个人朝爪这边翻过来，脸正对着镜头。他的下颌在动。',
        cue: 'bone.snap',
        gain: 0.7,
        tag: 'wake',
      },
      {
        line: '他的手扣住了爪。握力计上的数字往上走，走了三秒才停。',
        cue: 'creature.breath-sync',
        gain: 0.7,
        tag: 'grabbed',
        dur: 10,
      },
    ],
    done: { line: '你把箱盖带上了。这是你能做的全部。', cue: 'door.close', gain: 0.4 },
  }),

  archetype({
    id: 'psn.personal',
    cn: '个人箱',
    kind: 'looted',
    seal: 'chalk',
    weight: 8,
    noise: 0.2,
    cost: 3,
    // 均匀且极低：一箱叠好的衣服伤不了人。它的代价从来不是风险，是格子。
    //
    // 这只箱子在稳健性上起的作用比它看起来大：因为它的风险和舱损都接近零，
    // 它的最优停手点**几乎不随危险定价浮动**。上游把出事算得再贵，翻穿一只
    // 个人箱仍然是对的。整张表里需要有这样一个不会塌的锚点
    riskCurve: [0.04, 0.04, 0.05, 0.06],
    deceit: 0.25,
    masks: ['bone', 'ash'],
    hullDamage: 0.04,
    beats: [
      {
        line: '粉笔编号下面是一件叠好的制服。口袋里有半块口粮，包装上压着指印。',
        cue: 'cloth.rustle',
        gain: 0.35,
        tag: 'quiet',
        loot: [['sup.ration', 1]],
      },
      {
        line: '制服底下是一张照片：三个人在码头上，中间那个把手搭在另外两个肩上。',
        cue: 'paper.rustle',
        gain: 0.45,
        tag: 'keepsake',
        loot: [['sup.photo', 1]],
      },
      {
        line: '最底下是一封写完没寄的信，和一块铝牌。信写到第三页字开始歪，最后一行只有一个字，笔尖戳穿了纸。',
        cue: 'paper.rustle',
        gain: 0.5,
        tag: 'keepsake',
        loot: [
          ['sup.letter', 1],
          ['sup.idtag', 1],
        ],
      },
      {
        // 真东西，而且是这张表里最便宜的真东西：几乎零风险、几乎零舱损。
        // 「翻穿个人箱」这条结论因此不依赖任何一组权重
        line: '箱底还垫着一层。掀开是一盒滤芯，他没有上交，藏在自己箱底 —— 生产日期是停航前三天，那时候还没有人说要省着用。',
        cue: 'item.pickup',
        gain: 0.45,
        noise: 0.1,
        loot: [['sup.filter', 1]],
      },
    ],
    variants: [
      [
        { line: '这件制服的领章是{role}。粉笔编号和上一只是连着的。' },
        { line: '同一张照片。这一张边角被人反复摸过，已经发白。' },
        { line: '这一封信写给同一个地址，落款是{name}。' },
        { line: '这只箱底也藏着一盒滤芯，日期一样。不是一个人这么做。' },
      ],
      [
        { line: '第三只个人箱。制服全叠成同一个形状 —— 有人教过他们怎么叠。' },
        { line: '照片背面这次写了日期。三张照片，三个日期，一天比一天晚。' },
        { line: '{name}最后写的是：{last}' },
        { line: '第三盒滤芯。全船的人都在箱底藏了一盒，而没有一个人用掉它。' },
      ],
    ],
    hazards: [
      {
        line: '箱底还有一层。爪一碰，下层的盖自己顶开了。',
        cue: 'hatch.wheel',
        gain: 0.6,
        tag: 'wake',
      },
      {
        line: '制服的袖子里还有手臂的形状。你把它抖开的时候，形状没有散。',
        cue: 'cloth.rustle',
        gain: 0.65,
        tag: 'contact',
      },
    ],
    done: { line: '一个人的全部东西，三爪就翻完了。', cue: 'door.close', gain: 0.35 },
  }),

  archetype({
    id: 'odd.resealed',
    cn: '被重新封过的',
    kind: 'marked',
    seal: 'chalk',
    weight: 5,
    // 越往下，「有人重新封过这只箱子」越常见。这是整条深度曲线的主语
    depthWeight: 2.5,
    noise: 0.38,
    cost: 5,
    // 中置：填充物那一层底下压着的东西是折着的。穿过它，最里面那只小箱子
    // 反而是这一局最肥的一层 —— 但没有人会告诉你中间那一爪是最危险的
    riskCurve: [0.14, 0.4, 0.18],
    deceit: 0.6,
    masks: ['rust', 'bone', 'tar'],
    // 有东西从箱子里展开来抓你的臂 —— 那是对人和对臂的伤害，不是对壳的。
    // hullDamage 只记结构伤，别的后果归 tag 管。这条区分让重封箱的代价
    // 落在固定的 TAG_COST 上，而不是随上游怎么给舱损定价而漂移
    hullDamage: 0.05,
    beats: [
      // 重新封箱的人把原来的东西照原样码回了最上面 —— 要骗过检查，
      // 外面一层就得像真的。所以这只箱子最值钱的一层在最外面，
      // 而最里面那层是他真正想放进去的东西：不值钱，也不打算被人拿走。
      {
        line: '封条是新的，箱子是旧的。最上面照原样码着电池和胶带，码得像从没被打开过。',
        cue: 'door.jam',
        gain: 0.55,
        loot: [
          ['sup.cell', 1],
          ['sup.tape', 1],
        ],
      },
      {
        line: '第二层塞满了不属于这只箱子的填充物：撕碎的制服、纸、头发。纸里夹着一张蜡笔画。',
        cue: 'cloth.rustle',
        gain: 0.6,
        loot: [['sup.drawing', 1]],
        tag: 'keepsake',
      },
      {
        line: '最底下是一只更小的箱子，挂着锈橙封条。里面的东西被整理过，整理得很仔细 —— 一支吗啡，和一块叠成方块的布。',
        cue: 'hatch.wheel',
        gain: 0.6,
        loot: [['sup.morphine', 1]],
        noise: 0.16,
      },
    ],
    variants: [
      [
        { line: '又一只重封的。这一只的胶已经干了 —— 封它的时间比上一只早。' },
        { line: '填充物里这次有整片的制服，编号是{tag}。' },
        { line: '里面那只小箱子的封条也是新的。封了两层，两层的刷法一样。' },
      ],
      [
        { line: '第三只。封条的刷法一模一样：从左到右，收笔往上挑。' },
        { line: '填充物被压成了一个形状。那个形状有肩膀。' },
        {
          line: '最里面那只箱子的内壁被擦干净了。有人整理它，是为了等着往里装东西。',
        },
      ],
    ],
    hazards: [
      {
        line: '填充物底下的东西展开了。它比这只箱子大，所以它之前一直是折着的。',
        cue: 'listener.near',
        gain: 0.85,
        tag: 'wake',
        at: [1, 2],
      },
      {
        line: '新封条底下压着旧封条，旧封条底下还压着一条。数到第四条的时候，箱子从里面推了一下。',
        cue: 'door.knock',
        gain: 0.8,
        tag: 'grabbed',
        dur: 8,
      },
    ],
    done: { line: '重封的箱子翻到底了。封它的人没有在任何一层留下名字。', cue: 'hull.ping-return', gain: 0.4 },
  }),

  archetype({
    id: 'odd.overgrown',
    cn: '长满东西的',
    kind: 'marked',
    seal: 'blood',
    weight: 5,
    depthWeight: 1.2,
    noise: 0.42,
    cost: 6,
    // 中置：膜那一层是活的，硬东西被裹在正中间的更深处
    riskCurve: [0.1, 0.3, 0.2],
    deceit: 0.35,
    masks: ['bone', 'ash', 'rust'],
    // 软的东西收紧。伤的是臂，不是壳
    hullDamage: 0.06,
    beats: [
      {
        line: '箱子外面那层不是锈。爪碰上去，它缩了一下，然后慢慢回来。',
        cue: 'flesh.wet',
        gain: 0.55,
        tag: 'contact',
      },
      {
        // 硬东西被裹在正中间那一层 —— 也就是最危险的那一爪。
        // 要拿，就得在膜收紧的时候把手停在里面
        // 硬东西全部裹在正中间那一层 —— 也就是最危险的那一爪。
        // 这只箱子的全部价值都压在它的风险峰值上：要拿，就得在膜收紧的时候把手停在里面
        line: '里面的硬东西全裹在一层膜里：一管润滑脂、一块电池、一块钢板。标签都还认得出字。',
        cue: 'flesh.wet',
        gain: 0.6,
        loot: [
          ['sup.grease', 1],
          ['sup.cell', 1],
          ['sup.plate', 1],
        ],
      },
      {
        // 物资价值为零的一爪，装着整条故事线里最关键的一件东西。
        // 停手曲线会算出「这一爪不该伸」，而这一爪里是那卷磁带
        line: '最深处只有一卷磁带。膜在它周围合拢，合拢的形状是一个人蜷着的形状 —— 形状里面除了磁带什么都没有。',
        cue: 'flesh.wet',
        gain: 0.5,
        tag: 'contact',
        loot: [['sup.recording', 1]],
        // 从软的东西里取一卷磁带，比撬开这只箱子安静得多
        noise: 0.12,
      },
    ],
    hazards: [
      {
        line: '爪拔出来的时候带着一截还连着的东西。箱子那一边收紧了。',
        cue: 'flesh.wet',
        gain: 0.9,
        tag: 'grabbed',
        dur: 12,
      },
      {
        line: '膜下面的东西在灯照到的时候全部转了个方向。整只箱子往前挪了半米。',
        cue: 'creature.skitter',
        gain: 0.85,
        tag: 'wake',
      },
    ],
    done: { line: '剩下的部分不再松开了。', cue: 'flesh.wet', gain: 0.4 },
  }),

  archetype({
    id: 'odd.mimic',
    cn: '诱饵',
    kind: 'marked',
    seal: 'blood',
    weight: 4,
    depthWeight: 1.5,
    noise: 0.5,
    cost: 5,
    // 极端前置：它在你按下去的那一刻就咬。「翻一爪看看」对它完全没有意义
    riskCurve: [0.52, 0.3],
    deceit: 0.7,
    masks: ['rust', 'bone', 'tar', 'ash'],
    // 它咬的是爪
    hullDamage: 0.08,
    hazardEnds: true,
    beats: [
      { line: '爪按在箱盖上。箱盖是软的。', cue: 'flesh.wet', gain: 0.5, tag: 'contact' },
      {
        line: '第二爪下去，箱子的四条边同时松开了。里面是一个腔，腔壁上贴着别人的装备。',
        cue: 'listener.near',
        gain: 0.8,
        tag: 'wake',
        loot: [
          ['sup.flare', 1],
          ['sup.recording', 1],
        ],
      },
    ],
    variants: [
      [
        { line: '箱盖又是软的。你这次在按下去之前就知道了。' },
        { line: '腔壁上这次贴着一盘磁带和一支信号管。它们被摆成了容易拿的角度。' },
      ],
      [
        { line: '你隔着二十米就认出来了 —— 它的边角太圆。你还是伸了爪。' },
        { line: '腔壁上贴着的东西里有一件你认识：{keepsake}。它被摆在最外面。' },
      ],
    ],
    hazards: [
      {
        line: '它不是箱子。你已经知道了，因为爪还在往里陷。',
        cue: 'listener.near',
        gain: 0.95,
        tag: 'grabbed',
        dur: 18,
      },
      {
        line: '封条是长在上面的。它从压条的位置裂开，一直裂到箱子不该有接缝的地方。',
        cue: 'listener.scream',
        gain: 0.9,
        tag: 'wake',
      },
    ],
    done: { line: '它松开了爪。它没有走。', cue: 'listener.call', gain: 0.5 },
  }),
];

const DEF_BY_ID = new Map<ArchetypeId, ContainerArchetypeDef>(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeDef(id: ArchetypeId): ContainerArchetypeDef | undefined {
  return DEF_BY_ID.get(id);
}

/** 这几种原型必须写满三层递进，否则玩家第三次见到它们时它们就成贴图了 */
export const MUST_PROGRESS: readonly ArchetypeId[] = [
  'sup.standard',
  'sup.ballast',
  'med.spent',
  'wrk.looted',
  'wrk.occupied',
  'psn.personal',
  'odd.resealed',
  'odd.mimic',
];

/**
 * 没有原型信息时的退路。
 *
 * 存档升级或者别处手搓出来的 ContainerState 可能没有 archetype 字段，
 * 这时候文案不该退化成空字符串 —— 空日志比平庸日志更像 bug。
 */
const FALLBACK: Readonly<Record<ContainerKind, { pass: readonly Beat[]; hazard: Beat; done: Beat }>> = {
  supply: {
    pass: [
      { line: '压条崩开。里面的东西码得很整齐，码它们的人以为还会回来。', cue: 'hatch.wheel', gain: 0.5 },
      { line: '第二层泡在水里，纸盒已经软了，里面的金属还是硬的。', cue: 'water.bubble', gain: 0.5 },
      { line: '箱底有一层沉淀。爪搅开它，底下的东西露出一个角。', cue: 'item.pickup', gain: 0.5 },
      { line: '最后一层贴着舱壁，冷得爪上结了一圈白。', cue: 'hull.pop', gain: 0.45 },
    ],
    hazard: {
      line: '箱子在爪下变了形。里面有什么东西跟着变了形。',
      cue: 'item.metal-clatter',
      gain: 0.8,
      tag: 'lure',
      dur: 10,
    },
    done: { line: '空的。爪刮过铁皮，回声一路传下去。', cue: 'hull.ping-return', gain: 0.4 },
  },
  medical: {
    pass: [
      { line: '白漆下是一排卡扣。第一个槽里还有东西。', cue: 'cloth.rustle', gain: 0.45 },
      { line: '第二格的锁被人开过又扣上了。', cue: 'door.jam', gain: 0.5 },
      { line: '最里面一格垫着纱布。纱布是干的 —— 在一千米深的地方。', cue: 'cloth.rustle', gain: 0.4 },
      { line: '底板下面还有一层，那一层是用胶带封住的。', cue: 'valve.turn', gain: 0.5 },
    ],
    hazard: {
      line: '玻璃在爪里碎了。水在灯下变成很淡的粉色，然后散开。',
      cue: 'glass.break',
      gain: 0.75,
      tag: 'spill',
      dur: 8,
    },
    done: { line: '卡扣一个不少，槽全是空的。', cue: 'hull.ping-return', gain: 0.35 },
  },
  looted: {
    pass: [
      { line: '压条是从里面顶开的。第一爪只捞上来一把泡烂的填充物。', cue: 'water.bubble', gain: 0.45 },
      { line: '角落里剩着别人没拿走的东西。他当时一定很急。', cue: 'item.pickup', gain: 0.5 },
      { line: '箱底写着一个名字，写了三遍，一遍比一遍浅。', cue: 'paper.rustle', gain: 0.45 },
      { line: '最下面压着一只手套。手套是空的。', cue: 'cloth.rustle', gain: 0.5 },
    ],
    hazard: {
      line: '支架断了。整只箱连着一段舱壁往下滑。',
      cue: 'hull.crack',
      gain: 0.8,
      tag: 'breach',
    },
    done: { line: '别人比你先到，也比你翻得干净。', cue: 'hull.ping-return', gain: 0.35 },
  },
  marked: {
    pass: [
      { line: '红漆在爪上蹭下来一层。它还没干透。', cue: 'door.jam', gain: 0.55 },
      { line: '第二层的东西被摆成了一个形状。摆的人有时间，也有耐心。', cue: 'cloth.rustle', gain: 0.6 },
      { line: '最深处是热的。一千米深的地方不该有热的东西。', cue: 'flesh.wet', gain: 0.6 },
      { line: '最后一层什么都没有，但爪拔不出来。', cue: 'listener.near', gain: 0.7 },
    ],
    hazard: {
      line: '底下压着的东西展开了。它比这只箱子大，所以它之前一直是折着的。',
      cue: 'listener.near',
      gain: 0.85,
      tag: 'wake',
    },
    done: { line: '它已经没有可以给你的东西了。', cue: 'hull.ping-return', gain: 0.4 },
  },
};

// ============================================================================
// 深度曲线
// ============================================================================

/** 第一关的封条欺骗率 */
export const DECEIT_AT_TOP = 0.08;
/** 最后一关的封条欺骗率 */
export const DECEIT_AT_BOTTOM = 0.3;

/**
 * 各类房间在同一深度上的欺骗率偏置。
 *
 * 基准曲线（8% → 30%）描述的是废墟和藏匿点这类「主池」。安全房要更诚实一点、
 * 陷阱房要更会骗一点 —— 否则整条沟里每一间房读封条的手感都一样，
 * 房间职能这个维度就白设了。玩家应该能感觉到「这一间不对劲」。
 */
const POOL_BIAS: Readonly<Record<string, number>> = {
  full: 1,
  safe: 0.72,
  trap: 1.45,
};

export function deceitTarget(depth01: number, poolKind = 'full'): number {
  const base = lerp(DECEIT_AT_TOP, DECEIT_AT_BOTTOM, clamp01(depth01));
  return clamp01(base * (POOL_BIAS[poolKind] ?? 1));
}

function weightAt(a: ContainerArchetypeDef, depth01: number): number {
  return Math.max(0.01, a.weight * (1 + a.depthWeight * clamp01(depth01)));
}

/**
 * 求一个系数 k，使得整池的加权欺骗率正好等于目标值。
 *
 * 不能简单地 target/base 然后乘上去：诱饵的 deceit 是 0.7，乘 1.5 会越界，
 * 一 clamp 整池就够不到目标。所以二分一个真正能达标的 k。
 * 结果按 role 与深度分档缓存 —— 掷箱是每只箱子一次的高频调用。
 */
const FACTOR_CACHE = new Map<string, number>();

function deceitFactor(pool: readonly ContainerArchetypeDef[], depth01: number, key: string): number {
  const cacheKey = `${key}:${Math.round(clamp01(depth01) * 50)}`;
  const hit = FACTOR_CACHE.get(cacheKey);
  if (hit !== undefined) return hit;

  const target = deceitTarget(depth01, key);
  const rate = (k: number): number => {
    let total = 0;
    let lying = 0;
    for (const a of pool) {
      const w = weightAt(a, depth01);
      total += w;
      lying += w * (a.masks.length > 0 ? clamp01(a.deceit * k) : 0);
    }
    return total > 0 ? lying / total : 0;
  };

  let lo = 0;
  let hi = 8;
  if (rate(hi) < target) {
    FACTOR_CACHE.set(cacheKey, hi);
    return hi;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (rate(mid) < target) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  FACTOR_CACHE.set(cacheKey, k);
  return k;
}

// ============================================================================
// 掷箱
// ============================================================================

/**
 * 这一间在那个人的故事里是什么位置。
 *
 * 'trail' = 他经过这里，留下了东西；'end' = 他没有再走出去。
 * 不传时完全不影响掷箱 —— 上游愿意标就标，不标这套内容照样自洽。
 */
export type StoryBeat = 'trail' | 'end';

/** 故事位置对各原型权重的乘数。没列到的原型保持原样 */
const STORY_BIAS: Readonly<Record<StoryBeat, Partial<Record<ArchetypeId, number>>>> = {
  // 痕迹：他翻过的医疗格、他撬开过的货箱、他自己的个人箱
  trail: {
    'psn.personal': 4,
    'med.spent': 3,
    'wrk.looted': 2,
    'wrk.occupied': 0.2,
  },
  // 终点：这一间里有他。同时把重封箱抬起来 —— 有人在他之后把箱子封了回去
  end: {
    'wrk.occupied': 8,
    'odd.resealed': 2.5,
    'psn.personal': 1.5,
    'sup.standard': 0.3,
    'sup.ballast': 0.2,
  },
};

export interface RollOptions {
  /** 这一局的跨箱记忆。不传就退回固定的那个人，行为与上一版一致 */
  memory?: ContainerMemory;
  /** 这一关有多深。0 = 第一关，1 = 最后一关。不传按 0.5 的固定基准走 */
  depth01?: number;
  /** 这一间在那个人的故事里的位置。不传时行为不变 */
  storyBeat?: StoryBeat;
}

/**
 * 按房间职能挑池子。
 *
 * 安全房里不会掉「marked」那一档 —— 不是为了照顾玩家，是为了让红漆和粉笔
 * 在玩家心里绑定「这里出过事」。如果哪儿都可能有诱饵，诱饵就不再是这间房的事。
 */
function poolFor(role: string): readonly ContainerArchetypeDef[] {
  if (role === 'trap' || role === 'decoy' || role === 'hazard') {
    // 陷阱房把怪箱的权重顶上来，正常补给仍然存在 —— 否则玩家一进门就不伸爪了
    return ARCHETYPES.filter(
      (a) => a.kind === 'marked' || a.id === 'wrk.occupied' || a.id === 'wrk.looted',
    );
  }
  if (role === 'wreck' || role === 'cache') return ARCHETYPES;
  return ARCHETYPES.filter((a) => a.kind !== 'marked');
}

function poolKey(role: string): string {
  if (role === 'trap' || role === 'decoy' || role === 'hazard') return 'trap';
  if (role === 'wreck' || role === 'cache') return 'full';
  return 'safe';
}

/** 从池子内容反推它是哪一类。给 sealProfile / sealDeceitRate 这些分析函数用 */
function poolKindOf(pool: readonly ContainerArchetypeDef[]): string {
  if (pool.length === ARCHETYPES.length) return 'full';
  return pool.some((a) => a.kind === 'marked') ? 'trap' : 'safe';
}

function storyWeight(a: ContainerArchetypeDef, depth01: number, beat?: StoryBeat): number {
  const w = weightAt(a, depth01);
  if (!beat) return w;
  return Math.max(0.01, w * (STORY_BIAS[beat][a.id] ?? 1));
}

function pickWeighted(
  rng: Rng,
  pool: readonly ContainerArchetypeDef[],
  depth01: number,
  beat?: StoryBeat,
): ContainerArchetypeDef {
  let total = 0;
  for (const a of pool) total += storyWeight(a, depth01, beat);
  let roll = rng.next() * total;
  for (const a of pool) {
    roll -= storyWeight(a, depth01, beat);
    if (roll <= 0) return a;
  }
  return pool[pool.length - 1] ?? ARCHETYPES[0]!;
}

/** 决定这只箱子外面挂的是哪条封条。多数时候是它自己那条 */
function rollSeal(rng: Rng, a: ContainerArchetypeDef, factor: number): SealColor {
  if (a.masks.length === 0) return a.seal;
  if (rng.next() >= clamp01(a.deceit * factor)) return a.seal;
  const i = Math.min(a.masks.length - 1, Math.floor(rng.next() * a.masks.length));
  return a.masks[i] ?? a.seal;
}

/**
 * 按房间职能掷一只箱子。wreck / cache 房里的箱子更值钱，也更险。
 *
 * 第五个参数是后加的，不传时行为与上一版完全一致。
 */
export function rollContainer(
  rng: Rng,
  obstacleId: string,
  nodeId: string,
  role: string,
  opts?: RollOptions,
): ContainerState {
  // 不传深度时用 0.5 —— 那正好对应上一版那条固定的 20% 曲线中点
  const depth01 = clamp01(opts?.depth01 ?? 0.5);
  const pool = poolFor(role);
  const a = pickWeighted(rng, pool, depth01, opts?.storyBeat);
  const factor = deceitFactor(pool, depth01, poolKey(role));
  const seal = rollSeal(rng, a, factor);
  return {
    obstacleId,
    nodeId,
    kind: a.kind,
    seal,
    searched: 0,
    passes: a.passes,
    opened: false,
    exhausted: false,
    loot: a.loot,
    noise: a.noise,
    cost: a.cost,
    risk: a.risk,
    archetype: a.id,
    honestSeal: a.seal,
    deceived: seal !== a.seal,
    depth01,
    riskCurve: a.riskCurve,
  };
}

// ============================================================================
// 翻找
// ============================================================================

const DEFAULT_GAIN = 0.6;

function fallbackFor(kind: ContainerKind): { pass: readonly Beat[]; hazard: Beat; done: Beat } {
  return FALLBACK[kind] ?? FALLBACK.supply;
}

/** 取第 idx 爪的内容，按 tier 叠加递进文案 */
function beatAt(def: ContainerArchetypeDef | undefined, kind: ContainerKind, tier: number, idx: number): Beat {
  if (!def) {
    const fb = fallbackFor(kind).pass;
    return fb[Math.min(idx, fb.length - 1)] ?? fb[0]!;
  }
  const base = def.beats[Math.min(idx, def.beats.length - 1)] ?? def.beats[0]!;
  if (tier <= 0 || def.variants.length === 0) return base;
  // 超出写好的层数就停在最后一层：第五只和第三只说一样的话，
  // 总好过突然退回第一只那句「第一次见到」
  const v = def.variants[Math.min(tier, def.variants.length) - 1]?.[idx];
  if (!v) return base;
  return {
    line: v.line,
    cue: v.cue ?? base.cue,
    gain: v.gain ?? base.gain,
    loot: base.loot,
    tag: v.tag ?? base.tag,
    dur: v.dur ?? base.dur,
  };
}

function hazardBeat(
  def: ContainerArchetypeDef | undefined,
  kind: ContainerKind,
  idx: number,
  rng: Rng,
): Beat {
  if (!def || def.hazards.length === 0) return fallbackFor(kind).hazard;
  // 有些出事描写只在某一爪成立（「第四层底下是空的」不能在第一爪说）。
  // 风险曲线现在会让危险出现在任何一爪，所以这层过滤是必须的。
  const usable = def.hazards.filter((h) => !h.at || h.at.includes(idx));
  const pool = usable.length > 0 ? usable : def.hazards;
  const i = Math.min(pool.length - 1, Math.floor(rng.next() * pool.length));
  return pool[i] ?? pool[0]!;
}

// ----------------------------------------------------------------------------
// 声音时间轴
// ----------------------------------------------------------------------------
// 一爪是一段过程，不是一个音。四下：伸出去、碰到、咬住、拔回来。
//
// 真正起作用的是**这段过程可以被打断**，而打断的位置和方式就是结果本身：
// 少了「咬住」那一下 = 空的；在该咬住之前就断掉而且没有拔回来 = 出事了。
// 玩家会先用耳朵知道，再用眼睛确认 —— 这一秒的差值就是恐怖片的全部技术。
// ----------------------------------------------------------------------------

const T_OUT = 0;
const T_CONTACT = 0.75;
const T_GRIP = 1.45;
const T_BACK_FULL = 2.15;
const T_BACK_EMPTY = 1.35;
/** 出事的那一下故意比「该咬住」早：听感上是被抢拍，不是被延后 */
const T_HAZARD = 1.05;

function buildCueTrack(outcome: SearchOutcome, beat: Beat): readonly CueStep[] {
  const gain = beat.gain ?? DEFAULT_GAIN;
  const out: CueStep[] = [{ at: T_OUT, cue: ARM.out, gain: 0.32 }];

  if (outcome === 'done') {
    // 空壳。爪伸进去，立刻就回来了 —— 短得不像一次翻找
    out.push({ at: 0.45, cue: beat.cue, gain: gain * 0.7 });
    out.push({ at: 0.95, cue: ARM.back, gain: 0.26 });
    return out;
  }

  out.push({ at: T_CONTACT, cue: beat.cue, gain });

  if (outcome === 'hazard') {
    // 被抢拍：该咬住的时刻之前就被打断，而且没有第四下。爪没有回来
    out.push({ at: T_HAZARD, cue: ARM.stall, gain: 0.7 });
    return out;
  }
  if (outcome === 'empty') {
    // 缺了「咬住」。爪空着提前回来，整条轴比正常短 0.8 秒
    out.push({ at: T_BACK_EMPTY, cue: ARM.back, gain: 0.3 });
    return out;
  }
  out.push({ at: T_GRIP, cue: ARM.grip, gain: 0.55 });
  out.push({ at: T_BACK_FULL, cue: ARM.back, gain: 0.3 });
  return out;
}

function result(
  outcome: SearchOutcome,
  beat: Beat,
  gained: readonly (readonly [SupplyId, number])[],
  noise: number,
  cost: number,
  hull: number,
  memory?: ContainerMemory,
): SearchResult {
  const out: SearchResult = {
    outcome,
    gained,
    line: fillPersonText(beat.line, memory),
    noise,
    cost,
    hull,
    cue: beat.cue,
    cueGain: beat.gain ?? DEFAULT_GAIN,
    cueTrack: buildCueTrack(outcome, beat),
  };
  if (beat.tag) out.tag = beat.tag;
  if (beat.dur !== undefined) out.tagDuration = beat.dur;
  return out;
}

/**
 * 翻一爪。
 *
 * 状态是就地改的 —— 调用方拿到 SearchResult 之后负责结算噪音、呼吸和物资。
 * 第三个参数是后加的，不传时行为与上一版完全一致。
 */
export function searchContainer(
  state: ContainerState,
  rng: Rng,
  memory?: ContainerMemory,
  safe = false,
): SearchResult {
  const def = state.archetype ? DEF_BY_ID.get(state.archetype) : undefined;

  if (state.exhausted || state.searched >= state.passes) {
    state.exhausted = true;
    const beat = def?.doneBeat ?? fallbackFor(state.kind).done;
    return result('done', beat, [], 0.05, 1, 0, memory);
  }

  // 第一爪的时候才把「这是第几只同类」定下来：箱子可能在进房间前就全掷好了，
  // 但玩家真正「遇到」它是在他伸爪的那一刻。
  if (state.searched === 0 && state.tier === undefined) {
    if (memory && state.archetype) {
      const n = memory.seen[state.archetype] ?? 0;
      state.tier = n;
      memory.seen[state.archetype] = n + 1;
    } else {
      state.tier = 0;
    }
  }
  const tier = state.tier ?? 0;

  const idx = state.searched;
  state.searched++;
  state.opened = true;
  const last = state.searched >= state.passes;
  if (last) state.exhausted = true;

  // 每一爪有自己的出事概率，形状由原型决定（后置 / 前置 / 均匀 / 中置）。
  // 没有曲线的老状态退回上一版的算法：只在最后一爪出事。
  const curve = state.riskCurve ?? def?.riskCurve;
  const p = curve ? curve[idx] ?? 0 : last ? state.risk : def?.earlyRisk ?? 0;
  if (!safe && p > 0 && rng.next() < p) {
    if (def?.hazardEnds) state.exhausted = true;
    const beat = hazardBeat(def, state.kind, idx, rng);
    return result(
      'hazard',
      beat,
      [],
      clamp01(state.noise + 0.45),
      state.cost,
      def?.hullDamage ?? 0.1,
      memory,
    );
  }

  const beat = beatAt(def, state.kind, tier, idx);
  let batch: readonly (readonly [SupplyId, number])[] = state.loot[idx] ?? beat.loot ?? [];

  // 他随身那件东西跟着尸体一起出来。同一局里永远是同一件 ——
  // 玩家在第二具身上又掏出同一样东西的时候，才会开始怀疑这不是巧合。
  if (memory && def && def.keepsakeSlot === idx) {
    const k = memory.person.keepsake;
    if (!batch.some(([id]) => id === k)) batch = [...batch, [k, 1] as const];
  }

  // 「见过」就记下来，不管背包塞不塞得下 —— 组合信息按见过触发，不按拥有触发
  if (memory) {
    for (const [id] of batch) {
      if (STORY_SUPPLY_IDS.includes(id) && !memory.found.includes(id)) memory.found.push(id);
    }
  }

  const noise = beat.tag === 'quiet' ? 0 : beat.noise ?? state.noise;
  return result(batch.length ? 'loot' : 'empty', beat, batch, noise, state.cost, 0, memory);
}

/** 灯照到封条时屏上那两行字。没开灯就读不到 */
export function sealReadout(state: ContainerState): { title: string; hint: string } {
  return { title: SEAL_CN[state.seal], hint: SEAL_HINT[state.seal] };
}

// ============================================================================
// 封条的真实赔率
// ----------------------------------------------------------------------------
// 这几个函数不参与运行时逻辑，是给调优和图鉴用的：一条封条挂在外面的时候，
// 它背后到底是哪些箱子、各占多少。设计上的「八成对」必须能算出来，
// 而不是拍出来的。
// ============================================================================

export interface SealOdds {
  id: ArchetypeId;
  cn: string;
  kind: ContainerKind;
  /** 读到这条封条时，它是这个原型的概率 */
  p: number;
}

/** 某条封条出现时，背后各原型的概率分布。按概率从高到低 */
export function sealProfile(
  seal: SealColor,
  pool: readonly ContainerArchetypeDef[] = ARCHETYPES,
  depth01 = 0.5,
): readonly SealOdds[] {
  const factor = deceitFactor(pool, depth01, poolKindOf(pool));
  const raw: { a: ContainerArchetypeDef; w: number }[] = [];
  let total = 0;
  for (const a of pool) {
    const base = weightAt(a, depth01);
    const d = a.masks.length > 0 ? clamp01(a.deceit * factor) : 0;
    let w = 0;
    if (a.seal === seal) w += base * (1 - d);
    if (a.masks.includes(seal)) w += (base * d) / a.masks.length;
    if (w > 0) {
      raw.push({ a, w });
      total += w;
    }
  }
  if (total <= 0) return [];
  return raw
    .map(({ a, w }) => ({ id: a.id, cn: a.cn, kind: a.kind, p: w / total }))
    .sort((x, y) => y.p - x.p);
}

/** 整个池子里，封条与内容不符的箱子占比 */
export function sealDeceitRate(
  pool: readonly ContainerArchetypeDef[] = ARCHETYPES,
  depth01 = 0.5,
): number {
  const factor = deceitFactor(pool, depth01, poolKindOf(pool));
  let total = 0;
  let lying = 0;
  for (const a of pool) {
    const w = weightAt(a, depth01);
    total += w;
    lying += w * (a.masks.length > 0 ? clamp01(a.deceit * factor) : 0);
  }
  return total > 0 ? lying / total : 0;
}

/** 某个房间职能、某个深度下的欺骗率 */
export function sealDeceitRateForRole(role: string, depth01 = 0.5): number {
  return sealDeceitRate(poolFor(role), depth01);
}

// ============================================================================
// 停手曲线
// ----------------------------------------------------------------------------
// 「翻到第几爪收手」这个问题必须**没有**一个通用答案。这几个函数把答案算出来，
// 这样「没有统治策略」是一条可以验证的断言，而不是一句设计宣言。
//
// 单位全部折算成口气。噪音和舱损的折算权重写在下面两个常数里 ——
// 它们是这套分析唯一的主观输入，改它们会改变结论，所以它们必须是公开的。
// ============================================================================

/** 一点噪音值几口气。噪音会把东西引过来，而东西会花掉的远不止这些 */
export const NOISE_WEIGHT = 6;
/** 一点舱损值几口气。舱体是唯一不可逆的资源 */
export const HULL_WEIGHT = 100;

/**
 * 每种后果值几口气。
 *
 * 上一版的分析只算舱损和噪音，于是「爪被咬住二十秒」和「整间房的东西醒了」
 * 在账面上一样便宜 —— 结果是「一路翻到底」在任何深度下都胜出。
 * 后果分化只有被计价，才真的分化了。
 */
export const TAG_COST: Readonly<Record<SearchTag, number>> = {
  // 直接推进遭遇。这是这套系统里最贵的一件事，没有之一
  wake: 58,
  // 要花代价挣脱，挣不脱就丢臂 —— 丢了臂这一关就不用翻了
  grabbed: 46,
  // 永久抬高进水率，后面每一口气都在为它付账
  breach: 38,
  // 噪音持续外泄十几秒，等于把位置一直播出去
  lure: 26,
  // 机械手停摆十几二十秒
  'arm.jam': 30,
  // 持续腐蚀
  spill: 24,
  // 照亮有代价也有收益（能看见别的东西），净额不大
  flash: 10,
  // 认知冲击。便宜，但不是零
  contact: 4,
  quiet: 0,
  keepsake: 0,
};

export interface StopRow {
  /** 停手时刻：翻满这么多爪就收手 */
  passes: number;
  /** 期望产出（口气） */
  gain: number;
  /** 期望代价：呼吸 + 噪音折算 + 舱损折算（口气） */
  loss: number;
  /** 净收益 */
  net: number;
  /** 这么翻，至少出一次事的概率 */
  hazardChance: number;
  /** 有这么多爪可翻的箱子占比。低于 1 说明有些箱子提前就到底了 */
  reach: number;
}

export interface StopOptions {
  /** 覆盖噪音折算权重。robustness 扫参数空间时用 */
  noiseWeight?: number;
  /** 覆盖舱损折算权重 */
  hullWeight?: number;
  role?: string;
  /** 只统计挂着这条封条的箱子。用来看「同一条封条下最优停手点是不是唯一」 */
  seal?: SealColor;
  storyBeat?: StoryBeat;
}

/** 掷箱时每个原型的真实出现概率。stopProfile 和图鉴共用 */
function rollOdds(
  depth01: number,
  opts?: StopOptions,
): readonly { a: ContainerArchetypeDef; p: number }[] {
  const role = opts?.role ?? 'wreck';
  const pool = poolFor(role);
  const factor = deceitFactor(pool, depth01, poolKey(role));
  const raw: { a: ContainerArchetypeDef; p: number }[] = [];
  let total = 0;
  for (const a of pool) {
    let w = storyWeight(a, depth01, opts?.storyBeat);
    if (opts?.seal) {
      // 只看挂着这条封条的那部分：诚实地挂 + 伪装成它
      const d = a.masks.length > 0 ? clamp01(a.deceit * factor) : 0;
      let share = 0;
      if (a.seal === opts.seal) share += 1 - d;
      if (a.masks.includes(opts.seal)) share += d / a.masks.length;
      w *= share;
    }
    if (w > 0) {
      raw.push({ a, p: w });
      total += w;
    }
  }
  if (total <= 0) return [];
  return raw.map((r) => ({ a: r.a, p: r.p / total }));
}

function layerWorth(layer: readonly (readonly [SupplyId, number])[]): number {
  let n = 0;
  for (const [id, q] of layer) n += supplyWorth(id) * q;
  return n;
}

/** 在第 idx 爪出事，平均要付多少 —— 取该爪所有可能的出事描写的均值 */
function hazardCost(a: ContainerArchetypeDef, idx: number, nw: number, hw: number): number {
  const usable = a.hazards.filter((h) => !h.at || h.at.includes(idx));
  const pool = usable.length > 0 ? usable : a.hazards;
  let tag = 0;
  for (const h of pool) tag += h.tag ? TAG_COST[h.tag] : 0;
  if (pool.length > 0) tag /= pool.length;
  return a.hullDamage * hw + 0.45 * nw + tag;
}

/**
 * 算出「翻满 k 爪就收手」的期望账。
 *
 * 模型：第 i 爪以 riskCurve[i] 的概率出事。出事那一爪没有产出，只有代价；
 * 如果这种箱子 hazardEnds，出事之后就再也翻不动了。
 */
export function stopProfile(depth01 = 0.5, opts?: StopOptions): readonly StopRow[] {
  const nw = opts?.noiseWeight ?? NOISE_WEIGHT;
  const hw = opts?.hullWeight ?? HULL_WEIGHT;
  const odds = rollOdds(clamp01(depth01), opts);
  const maxPasses = ARCHETYPES.reduce((m, a) => Math.max(m, a.passes), 0);
  const rows: StopRow[] = [];

  for (let k = 1; k <= maxPasses; k++) {
    let gain = 0;
    let loss = 0;
    let safe = 0;
    let reach = 0;
    for (const { a, p } of odds) {
      if (a.passes >= k) reach += p;
      // active = 这只箱子还能继续翻的概率；noHazard = 一次都没出事的概率
      let active = 1;
      let noHazard = 1;
      const n = Math.min(k, a.passes);
      for (let i = 0; i < n; i++) {
        const r = a.riskCurve[i] ?? 0;
        gain += p * active * (1 - r) * layerWorth(a.loot[i] ?? []);
        loss += p * active * (a.cost + (a.noiseCurve[i] ?? a.noise) * nw);
        loss += p * active * r * hazardCost(a, i, nw, hw);
        noHazard *= 1 - active * r;
        if (a.hazardEnds) active *= 1 - r;
      }
      safe += p * noHazard;
    }
    rows.push({
      passes: k,
      gain,
      loss,
      net: gain - loss,
      hazardChance: 1 - safe,
      reach,
    });
  }
  return rows;
}

/**
 * 净收益最高的那个停手点，恒为 1 及以上。
 *
 * 这里回答的是「**已经把箱子开了**，翻到第几爪收手」—— 也就是「翻到倒数第二爪
 * 就停」那个问题本身。它刻意不含「干脆别碰」这个选项：不碰这一只箱子的真正
 * 替代方案不是「零收益零代价」，而是去开另一只，或者没气。把一个免费的退出
 * 选项塞进来，会让高代价参数下的答案全部塌成「别碰」，那既不是玩家的处境，
 * 也掩盖了停手点本身的结构。
 *
 * 「值不值得开」是另一个问题，用 worthOpening 问。
 */
export function bestStop(depth01 = 0.5, opts?: StopOptions): number {
  const rows = stopProfile(depth01, opts);
  let best = 1;
  let bestNet = -Infinity;
  for (const r of rows) {
    if (r.net > bestNet) {
      bestNet = r.net;
      best = r.passes;
    }
  }
  return best;
}

/** 这一类箱子按最优打法翻，期望上是不是正的 */
export function worthOpening(depth01 = 0.5, opts?: StopOptions): boolean {
  const rows = stopProfile(depth01, opts);
  return rows.some((r) => r.net > 0);
}

// ============================================================================
// 稳健性
// ----------------------------------------------------------------------------
// NOISE_WEIGHT 和 HULL_WEIGHT 是这套分析仅有的两个主观输入，而整张停手表建在
// 它们上面。也就是说「不存在统治策略」这句话，在没有扫过参数空间之前，只是
// **某一组参数下的巧合**。
//
// 下面这个函数把两个权重在一大片网格上扫一遍，看结论在多大比例的参数空间里
// 仍然成立。这个比例才是这套设计的真实强度 —— 如果它很低，要改的是内容，
// 不是权重。
// ============================================================================

export interface RobustnessGrid {
  noise?: readonly number[];
  hull?: readonly number[];
  depths?: readonly number[];
  role?: string;
}

export interface RobustnessCell {
  noiseWeight: number;
  hullWeight: number;
  /** 各深度的最优停手点 */
  stops: readonly number[];
  /** 各深度下六种封条给出了几种不同答案 */
  sealAnswers: readonly number[];
  /** 三个深度的最优解不全相同 */
  depthOk: boolean;
  /** 每个深度下封条都给出三种以上答案 */
  sealOk: boolean;
}

export interface RobustnessReport {
  cells: number;
  /** 深度维：最优停手点不全相同的格子占比 0..1 */
  depthVaried: number;
  /** 封条维（严格）：每个深度下六种封条都给出 >=3 种答案的格子占比 */
  sealVaried: number;
  /** 封条维（宽松）：至少有一个深度做到 >=3 种答案 */
  sealVariedLoose: number;
  /** 两维同时成立 */
  bothVaried: number;
  /** 出现过的停手点组合及其占比，按常见程度排 */
  patterns: readonly { stops: readonly number[]; share: number }[];
  /** 不成立的格子集中在哪一带 —— 用来判断该改内容还是该改权重 */
  failures: readonly RobustnessCell[];
  grid: { noise: readonly number[]; hull: readonly number[]; depths: readonly number[] };
}

const DEFAULT_NOISE_AXIS = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const DEFAULT_HULL_AXIS = [20, 40, 60, 80, 100, 130, 160, 200, 240, 280, 320, 360, 400];
const DEFAULT_DEPTHS = [0, 0.5, 1];

/**
 * 在权重网格上扫一遍，报出结论的存活率。
 *
 * 默认网格是 14 × 13 = 182 格，noise 从 1 到 24、hull 从 20 到 400 ——
 * 比任何人会认真提议的范围都宽。改完内容重跑一次就知道有没有把结论跑丢。
 */
export function robustness(grid?: RobustnessGrid): RobustnessReport {
  const noiseAxis = grid?.noise ?? DEFAULT_NOISE_AXIS;
  const hullAxis = grid?.hull ?? DEFAULT_HULL_AXIS;
  const depths = grid?.depths ?? DEFAULT_DEPTHS;
  const role = grid?.role ?? 'wreck';

  const cells: RobustnessCell[] = [];
  for (const nw of noiseAxis) {
    for (const hw of hullAxis) {
      const stops = depths.map((d) => bestStop(d, { role, noiseWeight: nw, hullWeight: hw }));
      const sealAnswers = depths.map(
        (d) =>
          new Set(
            ALL_SEALS.map((seal) => bestStop(d, { role, seal, noiseWeight: nw, hullWeight: hw })),
          ).size,
      );
      cells.push({
        noiseWeight: nw,
        hullWeight: hw,
        stops,
        sealAnswers,
        depthOk: new Set(stops).size > 1,
        sealOk: sealAnswers.every((n) => n >= 3),
      });
    }
  }

  const n = cells.length;
  const tally = new Map<string, number>();
  for (const c of cells) {
    const key = c.stops.join(',');
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const patterns = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ stops: key.split(',').map(Number), share: count / n }));

  return {
    cells: n,
    depthVaried: cells.filter((c) => c.depthOk).length / n,
    sealVaried: cells.filter((c) => c.sealOk).length / n,
    sealVariedLoose: cells.filter((c) => c.sealAnswers.some((x) => x >= 3)).length / n,
    bothVaried: cells.filter((c) => c.depthOk && c.sealOk).length / n,
    patterns,
    failures: cells.filter((c) => !c.depthOk || !c.sealOk),
    grid: { noise: noiseAxis, hull: hullAxis, depths },
  };
}

// ============================================================================
// 只有故事没有物资的那些爪
// ----------------------------------------------------------------------------
// 停手曲线会算出这些爪次不该伸：物资价值是零，而呼吸、噪音和风险照付。
// 它们是这套内容的主张 —— 账面永远建议你在故事开始之前收手。
//
// 数量是有讲究的：少了玩家形不成「最后一爪往往只有故事」的直觉，多了它就变成
// 一件不用想的例行公事，代价也就不再是代价。下面这些函数把这个数字变成可查的，
// 而不是凭感觉的。
// ============================================================================

export interface StoryClaw {
  archetype: ArchetypeId;
  cn: string;
  /** 第几爪，0 起 */
  index: number;
  passes: number;
  /** 这一爪掉的推进故事的东西。可能为空 —— 有些爪只有一句话 */
  items: readonly SupplyId[];
  /** 这一爪的呼吸代价 */
  cost: number;
  /** 这一爪的噪音 */
  noise: number;
  /** 出事概率 */
  risk: number;
  line: string;
}

/**
 * 列出所有「物资价值为零、但装着故事」的爪次。
 *
 * 物资价值为零就意味着边际净值必然为负 —— 产出是 0，而代价恒为正 ——
 * 所以「停手曲线说不该伸」这个条件是自动成立的，不必另外判。
 */
export function storyOnlyClaws(): readonly StoryClaw[] {
  const out: StoryClaw[] = [];
  for (const a of ARCHETYPES) {
    for (let i = 0; i < a.passes; i++) {
      const layer = a.loot[i] ?? [];
      if (layerWorth(layer) > 0) continue;
      const items = layer.map(([id]) => id).filter((id) => STORY_SUPPLY_IDS.includes(id));
      const beat = a.beats[i];
      const carriesStory =
        items.length > 0 || beat?.tag === 'keepsake' || beat?.tag === 'contact';
      if (!carriesStory) continue;
      out.push({
        archetype: a.id,
        cn: a.cn,
        index: i,
        passes: a.passes,
        items,
        cost: a.cost,
        noise: a.noiseCurve[i] ?? a.noise,
        risk: a.riskCurve[i] ?? 0,
        line: beat?.line ?? '',
      });
    }
  }
  return out;
}

/** 只有故事没有物资的爪，占全部爪次的比例 */
export function storyClawShare(): { total: number; story: number; share: number } {
  const total = ARCHETYPES.reduce((n, a) => n + a.passes, 0);
  const story = storyOnlyClaws().length;
  return { total, story, share: total > 0 ? story / total : 0 };
}

export interface MissedStory {
  /** 还剩几爪没翻 */
  claws: number;
  /** 其中有几爪装着故事 */
  storyClaws: number;
  /** 错过的、会推进那个人的故事的东西 */
  items: readonly SupplyId[];
  /** 给玩家看的那一行。刻意不说是什么 */
  line: string;
}

/**
 * 他离开这只箱子之后，告诉他错过了什么。
 *
 * **只在离开之后**。还站在箱子前面时问，一律返回 null —— 否则这就成了一个
 * 提示系统，而提示会把选择变成操作。代价必须先付掉，才轮到知道代价是什么。
 *
 * 调用方在玩家驶离那只箱子时调 leaveContainer，然后才问得到。
 * 返回的 line 只说「有」，不说「是什么」；items 留给愿意做图鉴的调用方。
 */
export function missedStory(state: ContainerState, memory?: ContainerMemory): MissedStory | null {
  if (!state.left || !state.archetype) return null;
  const def = archetypeDef(state.archetype);
  if (!def) return null;
  const claws = def.passes - state.searched;
  if (claws <= 0) return null;

  const items: SupplyId[] = [];
  let storyClaws = 0;
  for (let i = state.searched; i < def.passes; i++) {
    const layer = def.loot[i] ?? [];
    const story = layer.map(([id]) => id).filter((id) => STORY_SUPPLY_IDS.includes(id));
    const beat = def.beats[i];
    const carries =
      story.length > 0 || beat?.tag === 'keepsake' || beat?.tag === 'contact';
    if (!carries) continue;
    storyClaws++;
    for (const id of story) if (!items.includes(id)) items.push(id);
  }
  if (storyClaws === 0) return null;

  const line =
    storyClaws === 1
      ? fillPersonText('那只箱子你没有翻到底。剩下的那一层里有东西，而它不是补给。', memory)
      : fillPersonText(
          `那只箱子你没有翻到底。剩下的${storyClaws}层里都有东西，没有一样是补给。`,
          memory,
        );
  return { claws, storyClaws, items, line };
}

/** 玩家驶离这只箱子。调过之后 missedStory 才会开口 */
export function leaveContainer(state: ContainerState): void {
  state.left = true;
}

/** 内容统计，供 docs 与模拟器输出 */
export function containerStats(): {
  archetypes: number;
  seals: number;
  passes: number;
  passLines: number;
  variantLines: number;
  hazardLines: number;
  lootEntries: number;
  cues: number;
  tagged: number;
} {
  let passes = 0;
  let passLines = 0;
  let variantLines = 0;
  let hazardLines = 0;
  let lootEntries = 0;
  let tagged = 0;
  const cues = new Set<string>();
  for (const a of ARCHETYPES) {
    passes += a.passes;
    passLines += a.beats.length;
    hazardLines += a.hazards.length;
    for (const v of a.variants) variantLines += v.length;
    for (const layer of a.loot) lootEntries += layer.length;
    for (const b of [...a.beats, ...a.hazards, a.doneBeat]) {
      cues.add(b.cue);
      if (b.tag) tagged++;
    }
    for (const v of a.variants) for (const b of v) if (b.tag) tagged++;
  }
  return {
    archetypes: ARCHETYPES.length,
    seals: ALL_SEALS.length,
    passes,
    passLines,
    variantLines,
    hazardLines,
    lootEntries,
    cues: cues.size,
    tagged,
  };
}

// ============================================================================
// 内容自检
// ============================================================================

const CUE_SET = new Set<string>(CONTAINER_CUES);
const TOKEN_RE = /\{[a-z]+\}/g;
const TOKEN_SET = new Set<string>(PERSON_TOKENS);
/** 这些 tag 不带时长就没有意义 —— 调用方不知道该锁多久 */
const NEEDS_DURATION: readonly SearchTag[] = ['arm.jam', 'flash', 'grabbed', 'spill', 'lure'];

/**
 * 内容断言。返回空数组表示一切正常。
 *
 * 这里不像 bestiary 那样在模块加载时直接崩 —— 集装箱是纯数据，
 * 崩在启动会把整个舱一起带走。交给调用方决定是打日志还是抛。
 */
export function validateContainers(): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  const lineSeen = new Map<string, ArchetypeId>();

  const checkBeat = (owner: string, b: Beat | VariantBeat, isFull: boolean): void => {
    if (!b.line || b.line.trim().length === 0) errs.push(`${owner} 有一句空文案`);
    const cue = b.cue;
    if (isFull || cue !== undefined) {
      if (!cue) errs.push(`${owner} 缺 cue`);
      else if (!CUE_SET.has(cue)) errs.push(`${owner} 用了白名单外的 cue「${cue}」`);
    }
    if (b.gain !== undefined && (b.gain < 0 || b.gain > 1)) {
      errs.push(`${owner} 的 cueGain 越界: ${b.gain}`);
    }
    if (b.tag && NEEDS_DURATION.includes(b.tag) && (b.dur === undefined || b.dur <= 0)) {
      errs.push(`${owner} 的 tag「${b.tag}」需要 tagDuration，却没有`);
    }
    if (b.dur !== undefined && !b.tag) errs.push(`${owner} 写了 tagDuration 却没有 tag`);
    const track = buildCueTrack('loot', { line: b.line, cue: cue ?? ARM.out, gain: b.gain });
    let prev = -1;
    for (const s of track) {
      if (s.at < 0) errs.push(`${owner} 的时间轴有负的 at: ${s.at}`);
      if (s.at <= prev) errs.push(`${owner} 的时间轴 at 没有递增: ${s.at}`);
      prev = s.at;
      if (!CUE_SET.has(s.cue)) errs.push(`${owner} 的时间轴用了白名单外的 cue「${s.cue}」`);
      if (s.gain < 0 || s.gain > 1) errs.push(`${owner} 的时间轴 gain 越界: ${s.gain}`);
    }
    for (const m of b.line.match(TOKEN_RE) ?? []) {
      if (!TOKEN_SET.has(m)) errs.push(`${owner} 用了未知占位符「${m}」`);
    }
  };

  for (const seal of ALL_SEALS) {
    if (!SEAL_CN[seal]) errs.push(`封条 ${seal} 缺 SEAL_CN`);
    if (!SEAL_HINT[seal]) errs.push(`封条 ${seal} 缺 SEAL_HINT`);
  }
  for (const key of Object.keys(SEAL_CN)) {
    if (!ALL_SEALS.includes(key as SealColor)) errs.push(`SEAL_CN 里的 ${key} 不在 ALL_SEALS 中`);
  }
  for (const key of Object.keys(SEAL_HINT)) {
    if (!ALL_SEALS.includes(key as SealColor)) errs.push(`SEAL_HINT 里的 ${key} 不在 ALL_SEALS 中`);
  }

  for (const a of ARCHETYPES) {
    if (seen.has(a.id)) errs.push(`重复的原型 id: ${a.id}`);
    seen.add(a.id);

    if (a.passes < 1) errs.push(`${a.id} passes 必须 >= 1`);
    if (a.loot.length !== a.passes) {
      errs.push(`${a.id} 出货表 ${a.loot.length} 层，但可以翻 ${a.passes} 爪`);
    }
    if (a.lines.pass.length !== a.passes) {
      errs.push(`${a.id} 只有 ${a.lines.pass.length} 句爪文案，但可以翻 ${a.passes} 爪`);
    }
    if (a.hazards.length < 1) errs.push(`${a.id} 没有 hazard 文案`);
    if (!a.doneBeat.line) errs.push(`${a.id} 没有 done 文案`);

    for (let i = 0; i < a.beats.length; i++) checkBeat(`${a.id}#${i}`, a.beats[i]!, true);
    for (let i = 0; i < a.hazards.length; i++) checkBeat(`${a.id}!hazard${i}`, a.hazards[i]!, true);
    checkBeat(`${a.id}!done`, a.doneBeat, true);

    // 递进层数：写了就得写够，该写的必须写
    if (MUST_PROGRESS.includes(a.id) && a.variants.length < 2) {
      errs.push(`${a.id} 需要三层递进，但只写了 ${a.variants.length + 1} 层`);
    }
    for (let t = 0; t < a.variants.length; t++) {
      const v = a.variants[t]!;
      if (v.length !== a.passes) {
        errs.push(`${a.id} 第 ${t + 2} 层递进有 ${v.length} 句，但这种箱子要翻 ${a.passes} 爪`);
      }
      for (let i = 0; i < v.length; i++) checkBeat(`${a.id}@t${t + 2}#${i}`, v[i]!, false);
    }

    for (const layer of a.loot) {
      for (const [id, n] of layer) {
        if (!SUPPLIES[id]) errs.push(`${a.id} 引用了不存在的物资 ${id}`);
        if (n < 1) errs.push(`${a.id} 的 ${id} 数量 ${n} 无效`);
      }
    }
    if (a.keepsakeSlot >= 0 && a.keepsakeSlot >= a.passes) {
      errs.push(`${a.id} 的 keepsakeSlot ${a.keepsakeSlot} 超出了 ${a.passes} 爪`);
    }

    if (a.weight <= 0) errs.push(`${a.id} 权重必须为正，否则它永远不会出现`);
    if (weightAt(a, 0) <= 0 || weightAt(a, 1) <= 0) errs.push(`${a.id} 的深度权重会把它压到零`);
    if (a.deceit < 0 || a.deceit > 1) errs.push(`${a.id} deceit 越界: ${a.deceit}`);
    if (a.deceit > 0 && a.masks.length === 0) {
      errs.push(`${a.id} deceit > 0 却没有可披的封条`);
    }
    if (a.masks.includes(a.seal)) errs.push(`${a.id} 的伪装封条里混进了它自己的 ${a.seal}`);
    if (new Set(a.masks).size !== a.masks.length) errs.push(`${a.id} 的伪装封条有重复`);
    for (const m of a.masks) {
      if (!ALL_SEALS.includes(m)) errs.push(`${a.id} 披了未知封条 ${m}`);
    }
    if (!ALL_SEALS.includes(a.seal)) errs.push(`${a.id} 的封条 ${a.seal} 未定义`);

    for (const [label, v] of [
      ['noise', a.noise],
      ['risk', a.risk],
      ['earlyRisk', a.earlyRisk],
      ['hullDamage', a.hullDamage],
    ] as const) {
      if (v < 0 || v > 1) errs.push(`${a.id} ${label} 越界: ${v}`);
    }
    if (a.cost < 0) errs.push(`${a.id} cost 为负: ${a.cost}`);

    // 风险曲线
    if (a.riskCurve.length !== a.passes) {
      errs.push(`${a.id} 风险曲线有 ${a.riskCurve.length} 档，但可以翻 ${a.passes} 爪`);
    }
    for (let i = 0; i < a.riskCurve.length; i++) {
      const v = a.riskCurve[i]!;
      if (!(v >= 0 && v <= 1)) errs.push(`${a.id} 第 ${i} 爪的风险越界: ${v}`);
    }
    // 只在某几爪成立的出事描写，那几爪必须真的存在且真的会出事
    for (const h of a.hazards) {
      for (const at of h.at ?? []) {
        if (at < 0 || at >= a.passes) errs.push(`${a.id} 的出事描写限定在第 ${at} 爪，但没有这一爪`);
        else if ((a.riskCurve[at] ?? 0) <= 0) {
          errs.push(`${a.id} 的出事描写限定在第 ${at} 爪，但那一爪的风险是 0，这句话永远说不出来`);
        }
      }
    }
    // 每一爪都得有话可说：风险大于零的爪次必须能找到一句适用的出事描写
    for (let i = 0; i < a.passes; i++) {
      if ((a.riskCurve[i] ?? 0) <= 0) continue;
      if (!a.hazards.some((h) => !h.at || h.at.includes(i))) {
        errs.push(`${a.id} 第 ${i} 爪会出事，却没有一句适用的出事描写`);
      }
    }

    // 重复的句子会立刻毁掉「每一爪都不一样」这件事，所以全表查重
    const all = [
      ...a.beats.map((b) => b.line),
      ...a.variants.flatMap((v) => v.map((b) => b.line)),
      ...a.hazards.map((b) => b.line),
      a.doneBeat.line,
    ];
    for (const line of all) {
      const owner = lineSeen.get(line);
      if (owner) errs.push(`${a.id} 与 ${owner} 用了同一句文案: ${line.slice(0, 16)}…`);
      else lineSeen.set(line, a.id);
    }
  }

  // 每条封条都得真的会出现，否则 SEAL_HINT 里那句话是写给空气的
  for (const seal of ALL_SEALS) {
    if (sealProfile(seal).length === 0) errs.push(`封条 ${seal} 不会被任何原型挂出来`);
  }

  // 退路文案必须够长，否则深箱子翻到后面会复读
  const maxPasses = ARCHETYPES.reduce((m, a) => Math.max(m, a.passes), 0);
  for (const kind of Object.keys(FALLBACK) as ContainerKind[]) {
    const fb = FALLBACK[kind];
    if (fb.pass.length < maxPasses) {
      errs.push(`${kind} 的退路文案只有 ${fb.pass.length} 句，不够 ${maxPasses} 爪`);
    }
    for (let i = 0; i < fb.pass.length; i++) checkBeat(`fallback.${kind}#${i}`, fb.pass[i]!, true);
    checkBeat(`fallback.${kind}!hazard`, fb.hazard, true);
    checkBeat(`fallback.${kind}!done`, fb.done, true);
  }

  // 每个 kind 至少要有一个原型，否则 FALLBACK 和 kind 过滤会得到空池
  for (const kind of ['supply', 'medical', 'looted', 'marked'] as const) {
    if (!ARCHETYPES.some((a) => a.kind === kind)) errs.push(`没有任何 ${kind} 原型`);
  }

  // 那个人身上的东西必须真的存在，否则遗物会掏出一个 undefined
  if (NARRATIVE_SUPPLY_IDS.length === 0) errs.push('一件纯叙事物件都没有，那个人无处安放');
  for (const id of NARRATIVE_SUPPLY_IDS) {
    const s = SUPPLIES[id];
    if (!s) errs.push(`纯叙事物件 ${id} 不存在`);
    else if (!s.effect) errs.push(`纯叙事物件 ${id} 没有 effect，用它会什么都不发生`);
    else {
      for (const k of ['power', 'hull', 'flood', 'scrubber', 'leak', 'fear', 'co2', 'fatigue'] as const) {
        if (s.effect[k] !== undefined) errs.push(`纯叙事物件 ${id} 带了机制效果 ${k}，它就不纯了`);
      }
      if (s.effect.cue && !CUE_SET.has(s.effect.cue)) {
        // 物资的 cue 不受集装箱白名单约束，只提醒一句
        void 0;
      }
    }
  }
  for (const id of DEFAULT_PERSON.keepsake ? [DEFAULT_PERSON.keepsake] : []) {
    if (!SUPPLIES[id]) errs.push(`默认那个人的遗物 ${id} 不存在`);
  }
  // 遗物必须真的有箱子会掉，否则那个人的故事永远拼不完整
  const dropped = new Set<SupplyId>();
  for (const a of ARCHETYPES) for (const layer of a.loot) for (const [id] of layer) dropped.add(id);
  for (const id of NARRATIVE_SUPPLY_IDS) {
    if (!dropped.has(id)) errs.push(`纯叙事物件 ${id} 没有任何箱子会掉它`);
  }
  if (!ARCHETYPES.some((a) => a.keepsakeSlot >= 0)) {
    errs.push('没有任何原型会掏出那个人的遗物，跨箱记忆白做了');
  }

  // 占位符必须能填满 —— 文案里出现 {last} 就意味着 ContainerPerson 得有 lastLine
  for (const token of PERSON_TOKENS) {
    if (fillPersonText(token).indexOf('{') >= 0) errs.push(`占位符 ${token} 填不出东西`);
  }

  // --------------------------------------------------------------------------
  // 风险曲线的形状必须够杂，而且封条不能把形状读出来
  // --------------------------------------------------------------------------
  const shapes = new Set(ARCHETYPES.map((a) => riskShapeOf(a.riskCurve)));
  if (shapes.size < 3) {
    errs.push(`风险曲线只有 ${shapes.size} 种形状，不足以打掉「翻到倒数第二爪就停」`);
  }
  for (const seal of ALL_SEALS) {
    // 挂着这条封条、且占比不可忽略的箱子，必须横跨至少两种曲线形状 ——
    // 否则玩家只要读一眼封条就知道该什么时候停手，等于把一个统治策略换成六个
    const sealShapes = new Set(
      sealProfile(seal)
        .filter((o) => o.p >= 0.05)
        .map((o) => riskShapeOf(archetypeDef(o.id)?.riskCurve ?? [])),
    );
    if (sealShapes.size < 2) {
      errs.push(`${SEAL_CN[seal]}背后只有一种风险曲线形状，封条把停手时机泄露了`);
    }
  }

  // --------------------------------------------------------------------------
  // 组合
  // --------------------------------------------------------------------------
  const comboIds = new Set<string>();
  const comboLines = new Set<string>();
  const comboById = new Map<CombinationId, Combination>(COMBINATIONS.map((c) => [c.id, c]));
  for (const c of COMBINATIONS) {
    if (comboIds.has(c.id)) errs.push(`重复的组合 id: ${c.id}`);
    comboIds.add(c.id);
    if (c.needs.length < 2) errs.push(`${c.id} 只需要一件东西，那它不是组合`);
    if (new Set(c.needs).size !== c.needs.length) errs.push(`${c.id} 的条件里有重复的物件`);
    if (!c.line || c.line.trim().length === 0) errs.push(`${c.id} 没有文案`);
    if (comboLines.has(c.line)) errs.push(`${c.id} 和别的组合用了同一句话`);
    comboLines.add(c.line);
    for (const m of c.line.match(TOKEN_RE) ?? []) {
      if (!TOKEN_SET.has(m)) errs.push(`${c.id} 用了未知占位符「${m}」`);
    }
    for (const id of c.needs) {
      if (isComboRef(id)) {
        if (id === c.id) errs.push(`${c.id} 依赖它自己`);
        else if (!comboById.has(id)) errs.push(`${c.id} 依赖不存在的结论 ${id}`);
        continue;
      }
      if (!SUPPLIES[id]) errs.push(`${c.id} 依赖不存在的物件 ${id}`);
      if (!STORY_SUPPLY_IDS.includes(id)) {
        errs.push(`${c.id} 依赖的 ${id} 不在 STORY_SUPPLY_IDS 里，memory.found 永远不会记住它`);
      }
      if (!dropped.has(id)) errs.push(`${c.id} 依赖的 ${id} 没有任何箱子会掉它，这条组合永远拼不出来`);
    }
  }

  // 依赖图不许成环 —— 环上的每一条都永远拼不出来，而且 combinationTier 会栈溢出
  const mark = new Map<CombinationId, 'doing' | 'done'>();
  const walk = (id: CombinationId, trail: CombinationId[]): void => {
    if (mark.get(id) === 'done') return;
    if (mark.get(id) === 'doing') {
      errs.push(`结论依赖成环: ${[...trail, id].join(' → ')}`);
      return;
    }
    mark.set(id, 'doing');
    for (const n of comboById.get(id)?.needs ?? []) {
      if (isComboRef(n)) walk(n, [...trail, id]);
    }
    mark.set(id, 'done');
  };
  for (const c of COMBINATIONS) walk(c.id, []);

  // 二阶结论必须排在它依赖的一阶后面，否则 pendingCombination 会先挑到它
  for (let i = 0; i < COMBINATIONS.length; i++) {
    for (const n of COMBINATIONS[i]!.needs) {
      if (!isComboRef(n)) continue;
      const j = COMBINATIONS.findIndex((x) => x.id === n);
      if (j > i) errs.push(`${COMBINATIONS[i]!.id} 排在它依赖的 ${n} 前面`);
    }
  }

  // 每一爪都有话可说的同理：只有故事没有物资的爪次，数量要够玩家形成直觉
  const share = storyClawShare();
  if (share.story < 4) errs.push(`只有故事没有物资的爪次只有 ${share.story} 处，玩家形不成直觉`);
  if (share.share > 0.4) {
    errs.push(`只有故事没有物资的爪次占到 ${(share.share * 100).toFixed(0)}%，已经成了例行公事`);
  }
  // 每件会推进故事的东西至少要参与一条组合，否则它只是一句孤立的台词
  for (const id of STORY_SUPPLY_IDS) {
    if (!COMBINATIONS.some((c) => c.needs.includes(id))) {
      errs.push(`${id} 不参与任何组合，它读完就到头了`);
    }
  }

  return errs;
}
