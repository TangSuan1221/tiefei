/**
 * 舱外的东西。
 * ============================================================================
 * 雷达只会告诉你「那里有一个回波」。回波是红点，红点没有名字。
 * 要知道它是什么，你必须走到摄像头前，把探照灯打过去，然后看。
 *
 * 看清它是有代价的（SAN），但不看清就不知道该用哪件物资 —— 这是本作
 * 唯一的战斗系统：**识别，然后正确地害怕**。
 *
 * 声呐欺骗是这张表的第一原则：体型和速度故意不跟危险对齐。
 * 又大又快的东西常常没牙；针尖大、几乎不动的东西才可能把舱烂穿。
 *
 * 每种造物的外形参数都在这里，view/creature.ts 按这些参数在运行时
 * 程序化生成影像，不读任何外部素材。`footage` 是五秒片子提示词的外形句。
 */

import { PALETTE } from '@/render/palette';
import type { StationId } from '../types';
import { supply, type SupplyId } from './supplies';

export type CreatureId =
  | 'cre.chorus'
  | 'cre.angler'
  | 'cre.weave'
  | 'cre.hollow'
  | 'cre.jelly'
  | 'cre.acid'
  | 'cre.whale'
  | 'cre.siphon'
  | 'cre.school'
  | 'cre.crab'
  | 'cre.needle'
  | 'cre.mite'
  | 'cre.veil'
  | 'cre.runner';

/** 谱系。声呐看不见这一列，片子必须看见 */
export type CreatureKin = 'fauna' | 'mythos';

/** 声呐体型。跟 look.scale 独立 —— 雷达可以撒谎 */
export type SonarSize = 'tiny' | 'small' | 'medium' | 'huge';

/** 声呐位移。跟 look.tempo 独立 */
export type SonarSpeed = 'still' | 'slow' | 'fast';

/** 0 = 无害可穿；3 = 碰即灾难 */
export type Danger = 0 | 1 | 2 | 3;

/** 玩家可以做出的「应对」。威胁系统拿它和造物的弱点比对 */
export type CounterAction =
  | { kind: 'supply'; supply: SupplyId }
  /** 生命维持台：拉总闸，装死 */
  | { kind: 'blackout' }
  /** 摄像头台：关掉探照灯 */
  | { kind: 'lampoff' }
  /** 推进台：停机，一动不动 */
  | { kind: 'fullstop' }
  /** 推进台：全速，赌它追不上 */
  | { kind: 'fullahead' };

export function sameCounter(a: CounterAction, b: CounterAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'supply' && b.kind === 'supply') return a.supply === b.supply;
  return true;
}

/** 它被什么吸引。这决定了玩家平时的每一个操作有多贵 */
export type Attractor = 'noise' | 'light' | 'metal' | 'none';

export interface CreatureLook {
  /** 身体计划。渲染器按这个走完全不同的画法 */
  plan: 'swarm' | 'colossus' | 'crawler' | 'absent' | 'bloom' | 'school' | 'needle';
  /** 主体色，必须取自调色板 */
  tone: string;
  /** 自发光点的数量 */
  lights: number;
  /** 肢体/个体数 */
  limbs: number;
  /** 运动频率，Hz 量级 */
  tempo: number;
  /** 满画面时的体型占比 0..1 */
  scale: number;
  /** 边缘的溶解程度：越高越像一团悬浮物而不是一个实体 */
  dissolve: number;
}

export interface Creature {
  id: CreatureId;
  name: string;
  /** 雷达上只会显示这个 —— 一个编号，不是名字 */
  designation: string;
  kin: CreatureKin;
  danger: Danger;
  sonarSize: SonarSize;
  sonarSpeed: SonarSpeed;
  /** 五秒片子里的英文外形句。提示词只读这一句，不按 plan 猜身份 */
  footage: string;
  /** 摄像头里看清之后，日志里写下的那一句 */
  sighting: string;
  /** 看清它要付的理智 */
  sanCost: number;
  attractor: Attractor;
  /** 任意一条成立即可驱离 */
  weakness: readonly CounterAction[];
  /** 做了这些只会更糟 */
  provokes: readonly CounterAction[];
  /** 看清之后，指挥员（或你自己）给出的处置建议 */
  advice: string;
  /** 建议你去的工位，用于舱内箭头指引 */
  adviceStation: StationId;
  /** 接触到舱体时发生什么 */
  onStrike: { trauma: number; flood: number; hull: number; san: number; line: string };
  /** 无害接触：穿群、擦过。没有就当普通擦碰 */
  onPass?: { power: number; line: string };
  look: CreatureLook;
}

export const SONAR_SIZE_CN: Readonly<Record<SonarSize, string>> = {
  tiny: '针尖回波',
  small: '小块回波',
  medium: '中块回波',
  huge: '巨大回波',
};

export const SONAR_SPEED_CN: Readonly<Record<SonarSpeed, string>> = {
  still: '几乎不动',
  slow: '缓慢位移',
  fast: '高速位移',
};

export const SONAR_SIZE_EN: Readonly<Record<SonarSize, string>> = {
  tiny: 'a pinpoint sonar contact',
  small: 'a small sonar contact',
  medium: 'a medium sonar contact',
  huge: 'a huge sonar contact',
};

export const SONAR_SPEED_EN: Readonly<Record<SonarSpeed, string>> = {
  still: 'almost stationary',
  slow: 'drifting slowly',
  fast: 'moving very fast',
};

export function sonarLabelOf(c: Creature): string {
  return `${SONAR_SIZE_CN[c.sonarSize]} · ${SONAR_SPEED_CN[c.sonarSpeed]}`;
}

export function isHarmless(c: Creature): boolean {
  return c.danger === 0;
}

export const KIN_CN: Readonly<Record<CreatureKin, string>> = {
  fauna: '普通海生',
  mythos: '不该在这里',
};

export const DANGER_CN: readonly string[] = ['无害可穿', '擦碰会伤人', '贴上会烂舱', '碰即灾难'];

export const ATTRACTOR_CN: Readonly<Record<Attractor, string>> = {
  noise: '跟着声音走',
  light: '追光',
  metal: '追金属',
  none: '没有明显诱饵',
};

export function counterLine(a: CounterAction): string {
  if (a.kind === 'supply') return supply(a.supply).name;
  if (a.kind === 'blackout') return '拉总闸装死';
  if (a.kind === 'lampoff') return '关掉探照灯';
  if (a.kind === 'fullstop') return '推进器停机';
  return '全速推开';
}

export const CREATURES: Readonly<Record<CreatureId, Creature>> = {
  'cre.chorus': {
    id: 'cre.chorus',
    name: '溺者合唱',
    designation: 'C-1 群回波',
    kin: 'mythos',
    danger: 2,
    sonarSize: 'medium',
    sonarSpeed: 'slow',
    footage:
      'seven pale bone-white human shapes hanging upright in a single row, hands linked, long hair fanned upward, every mouth open and aimed at the lens',
    sighting: '不是一个。是七个，手挽着手，头发缠在一起。他们的嘴都开着，朝向你。',
    sanCost: 12,
    attractor: 'noise',
    weakness: [{ kind: 'supply', supply: 'sup.lure' }, { kind: 'blackout' }],
    provokes: [{ kind: 'supply', supply: 'sup.pulse' }, { kind: 'fullahead' }],
    advice: '他们跟着声音走。给他们一个别的声音，或者让整条舱安静下来。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 14,
      flood: 0.12,
      hull: 0.08,
      san: 18,
      line: '有东西贴在舱壁上唱歌。隔着四十毫米的钢，你听得清每一个字。',
    },
    look: {
      plan: 'swarm',
      tone: PALETTE.boneDim,
      lights: 0,
      limbs: 7,
      tempo: 0.35,
      scale: 0.52,
      dissolve: 0.55,
    },
  },

  'cre.angler': {
    id: 'cre.angler',
    name: '钩灯',
    designation: 'A-3 单体强回波',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'huge',
    sonarSpeed: 'slow',
    footage:
      'one enormous mass darker than the seawater itself, readable only as an absence of light, three slow tendrils hanging from its underside, a single pale lure-light drifting in front of a mouth that has no seams',
    sighting: '先看见那盏灯。灯在动。然后你意识到灯后面那片"没有回波的地方"就是它的身体。',
    sanCost: 16,
    attractor: 'light',
    weakness: [{ kind: 'lampoff' }, { kind: 'supply', supply: 'sup.pulse' }],
    provokes: [{ kind: 'supply', supply: 'sup.flare' }, { kind: 'supply', supply: 'sup.lure' }],
    advice: '它在追光。把探照灯关掉，或者用一发脉冲把它的侧线震聋。',
    adviceStation: 'camera',
    onStrike: {
      trauma: 22,
      flood: 0.20,
      hull: 0.16,
      san: 14,
      line: '它咬住了浮力舱。舱体被提起来又放下，像被一只手掂了掂重量。',
    },
    look: {
      plan: 'colossus',
      tone: PALETTE.steelDark,
      lights: 1,
      limbs: 3,
      tempo: 0.18,
      scale: 0.95,
      dissolve: 0.22,
    },
  },

  'cre.weave': {
    id: 'cre.weave',
    name: '铁织',
    designation: 'W-2 金属质回波',
    kin: 'mythos',
    danger: 2,
    sonarSize: 'medium',
    sonarSpeed: 'slow',
    footage:
      'a thing assembled out of riveted rust-orange steel hull plating with a stencilled number on one patch, nine jointed limbs pushing it across the debris, two dim indicator lights buried in the plating',
    sighting: '它是用 KYRIE-9 的外板做的。你认得那块编号 44 的补丁 —— 上个月是你监工焊的。',
    sanCost: 20,
    attractor: 'metal',
    weakness: [{ kind: 'fullstop' }, { kind: 'blackout' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.pulse' }],
    advice: '它听的是螺旋桨。停机，别动，等它爬过去。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 10,
      flood: 0.26,
      hull: 0.22,
      san: 16,
      line: '外板上传来铆接的声音。它在往你的舱上加东西。',
    },
    look: {
      plan: 'crawler',
      tone: PALETTE.rustDeep,
      lights: 2,
      limbs: 9,
      tempo: 0.55,
      scale: 0.7,
      dissolve: 0.1,
    },
  },

  'cre.hollow': {
    id: 'cre.hollow',
    name: '空回声',
    designation: '？ 未分类回波',
    kin: 'mythos',
    danger: 1,
    sonarSize: 'medium',
    sonarSpeed: 'still',
    footage:
      'no creature and no figure anywhere in the water, nothing alive at all, only the wreckage and the empty water around it, yet the camera keeps hunting for focus on one empty spot at the centre of the frame and never finds it',
    sighting: '探照灯照过去。水里什么都没有。雷达上那个点还在，亮得发白。',
    sanCost: 6,
    attractor: 'none',
    weakness: [],
    provokes: [],
    advice: '把摄像头对准它。看清那里什么都没有，红点就会消失 —— 每次都是这样。',
    adviceStation: 'camera',
    onStrike: {
      trauma: 0,
      flood: 0,
      hull: 0,
      san: 22,
      line: '红点走进了舱里。它现在显示的距离是 0 米。你一个人待在这。',
    },
    look: {
      plan: 'absent',
      tone: PALETTE.abyssHaze,
      lights: 0,
      limbs: 0,
      tempo: 0.1,
      scale: 0.3,
      dissolve: 1,
    },
  },

  'cre.jelly': {
    id: 'cre.jelly',
    name: '磷光水母',
    designation: 'J-0 弥散回波',
    kin: 'fauna',
    danger: 0,
    sonarSize: 'huge',
    sonarSpeed: 'slow',
    footage:
      'a drifting field of large gelatinous bells, each pulsing slowly, trailing long pale filaments, their bodies catching the floodlight in dull ember highlights, clearly ordinary deep-sea jellies',
    sighting: '一群缓慢搏动的伞盖。探照灯一照，它们自己也在亮。可以直接穿过去。',
    sanCost: 4,
    attractor: 'none',
    weakness: [{ kind: 'fullahead' }],
    provokes: [{ kind: 'supply', supply: 'sup.pulse' }],
    advice: '它们不咬船。穿过去，伞盖擦舱壁的时候甚至会回你一点电。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 0,
      flood: 0,
      hull: 0,
      san: 2,
      line: '伞盖贴上来又滑开。舱内灯闪了一下，配电盘的指针往上跳了半格。',
    },
    onPass: { power: 0.08, line: '伞盖擦过舱壁。配电盘的指针跳了一下。' },
    look: {
      plan: 'bloom',
      tone: PALETTE.ember,
      lights: 9,
      limbs: 11,
      tempo: 0.22,
      scale: 0.62,
      dissolve: 0.7,
    },
  },

  'cre.acid': {
    id: 'cre.acid',
    name: '腐蚀巨兽',
    designation: 'X-4 大块移动回波',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'huge',
    sonarSpeed: 'slow',
    footage:
      'the same huge slow silhouette resolving as a slab of dripping tissue, not bells, the water around it fizzing and pitting where it passes, rust-dark meat with no eyes',
    sighting: '同一团回波。片子里它不是伞盖，是一块在往下滴的肉，经过的水在冒泡。',
    sanCost: 18,
    attractor: 'metal',
    weakness: [{ kind: 'fullstop' }, { kind: 'lampoff' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.lure' }],
    advice: '关掉引擎。让它自己游过去。碰上就会烂舱。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 16,
      flood: 0.22,
      hull: 0.28,
      san: 12,
      line: '外板发出一声很细的嘶声。那不是撞击，是材料在溶解。',
    },
    look: {
      plan: 'colossus',
      tone: PALETTE.rustDeep,
      lights: 0,
      limbs: 5,
      tempo: 0.14,
      scale: 0.88,
      dissolve: 0.4,
    },
  },

  'cre.whale': {
    id: 'cre.whale',
    name: '深渊须鲸',
    designation: 'B-7 高速巨影',
    kin: 'fauna',
    danger: 0,
    sonarSize: 'huge',
    sonarSpeed: 'fast',
    footage:
      'an enormous living whale-shape crossing the beam at speed, ventral grooves and a pale baleen fringe readable in the floodlight, ordinary cetacean anatomy, no lure and no mouth-light, it is gone almost as soon as it fills the frame',
    sighting: '一头还活着的须鲸。它比舱大二十倍，擦着你过去，连看都没看你。',
    sanCost: 5,
    attractor: 'none',
    weakness: [{ kind: 'fullahead' }],
    provokes: [{ kind: 'supply', supply: 'sup.pulse' }],
    advice: '它不是来咬你的。别停，别让开，它会自己过去。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 2,
      flood: 0,
      hull: 0.02,
      san: 3,
      line: '侧推器被那层皮带了一下。船体响了一声，指针没动。',
    },
    onPass: { power: 0, line: '巨大的影子过去了。舱体晃了一下，什么都没坏。' },
    look: {
      plan: 'colossus',
      tone: PALETTE.steel,
      lights: 0,
      limbs: 0,
      tempo: 0.62,
      scale: 0.98,
      dissolve: 0.18,
    },
  },

  'cre.siphon': {
    id: 'cre.siphon',
    name: '管水母链',
    designation: 'S-2 长条回波',
    kin: 'fauna',
    danger: 0,
    sonarSize: 'huge',
    sonarSpeed: 'slow',
    footage:
      'a colony of siphonophores strung into one long chain of pulsing bells and trailing threads, each segment an ordinary gelatinous animal, the whole thing looking huge only because it is many animals in a line',
    sighting: '一条很长的管水母。雷达把它画成一头兽。它是一串伞盖。',
    sanCost: 3,
    attractor: 'none',
    weakness: [{ kind: 'fullahead' }],
    provokes: [{ kind: 'supply', supply: 'sup.pulse' }],
    advice: '链子会缠螺旋桨，但不会咬。减速穿过去。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 0,
      flood: 0,
      hull: 0,
      san: 1,
      line: '胶质贴上观察窗又被水流撕开。什么都没留下。',
    },
    onPass: { power: 0.04, line: '链子从舱顶滑过去。有一格电自己跳回来了。' },
    look: {
      plan: 'bloom',
      tone: PALETTE.boneDim,
      lights: 6,
      limbs: 9,
      tempo: 0.12,
      scale: 0.84,
      dissolve: 0.65,
    },
  },

  'cre.school': {
    id: 'cre.school',
    name: '灯笼鱼群',
    designation: 'F-0 碎点回波',
    kin: 'fauna',
    danger: 0,
    sonarSize: 'tiny',
    sonarSpeed: 'fast',
    footage:
      'a tight school of small lanternfish darting through the beam, each fish ordinary and catalogued, tiny photophores blinking bone-white, no larger animal hiding inside the school',
    sighting: '灯笼鱼。密，快，针尖大。雷达把它们画成一层雪。',
    sanCost: 1,
    attractor: 'light',
    weakness: [{ kind: 'fullahead' }, { kind: 'lampoff' }],
    provokes: [{ kind: 'supply', supply: 'sup.flare' }],
    advice: '开灯它们会聚过来，关灯它们就散。都不咬。',
    adviceStation: 'camera',
    onStrike: {
      trauma: 0,
      flood: 0,
      hull: 0,
      san: 0,
      line: '鱼拍在观察窗上，像一阵硬雨。',
    },
    onPass: { power: 0, line: '鱼群散开。雷达上那层碎点没了。' },
    look: {
      plan: 'school',
      tone: PALETTE.bone,
      lights: 14,
      limbs: 18,
      tempo: 1.6,
      scale: 0.28,
      dissolve: 0.35,
    },
  },

  'cre.crab': {
    id: 'cre.crab',
    name: '矿壳蟹',
    designation: 'K-1 贴壁静点',
    kin: 'fauna',
    danger: 0,
    sonarSize: 'tiny',
    sonarSpeed: 'still',
    footage:
      'a cluster of small crabs clinging to a rusted pipe, shells crusted with mineral, claws idle, ordinary benthic crabs that have not moved in the five seconds of the shot',
    sighting: '几只矿壳蟹。趴在管子上，当自己是铆钉。',
    sanCost: 1,
    attractor: 'none',
    weakness: [{ kind: 'fullahead' }],
    provokes: [],
    advice: '机械臂可以拨开。它们不会跟你走。',
    adviceStation: 'camera',
    onStrike: {
      trauma: 0,
      flood: 0,
      hull: 0,
      san: 0,
      line: '壳在外板上刮了一下。像有人用指甲敲钢管。',
    },
    onPass: { power: 0, line: '蟹还在原来的位置。你从它们旁边过去了。' },
    look: {
      plan: 'crawler',
      tone: PALETTE.rustDim,
      lights: 0,
      limbs: 6,
      tempo: 0.08,
      scale: 0.16,
      dissolve: 0.05,
    },
  },

  'cre.needle': {
    id: 'cre.needle',
    name: '针口',
    designation: 'N-9 贴壁静点',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'tiny',
    sonarSpeed: 'still',
    footage:
      'a single needle-thin organism no longer than a hand, anchored to the steel like a barnacle, a mouth at one end that is a perfect circle of inward teeth, far too many teeth for something this small, the metal around the attachment pitted as if by acid',
    sighting: '一根针。比拇指短。一端吸着钢，另一端全是牙。雷达把它画成一粒锈。',
    sanCost: 14,
    attractor: 'metal',
    weakness: [{ kind: 'supply', supply: 'sup.pulse' }, { kind: 'lampoff' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.flare' }],
    advice: '别开过去。它比你的外壳硬。一发脉冲，或者把灯关掉让它松口。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 18,
      flood: 0.18,
      hull: 0.24,
      san: 10,
      line: '一声很细的刺入声。压力表在掉。你找不到那个孔，因为它比螺栓还小。',
    },
    look: {
      plan: 'needle',
      tone: PALETTE.boneWhisper,
      lights: 0,
      limbs: 1,
      tempo: 0.06,
      scale: 0.11,
      dissolve: 0.08,
    },
  },

  'cre.mite': {
    id: 'cre.mite',
    name: '锈螨',
    designation: 'M-0 碎点回波',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'tiny',
    sonarSpeed: 'fast',
    footage:
      'a cloud of rust-coloured mites the size of rice grains swarming the hull camera port, each mite a jointed speck with a dark feeding slit, moving as one sheet across the glass, ordinary fish would scatter, these do not',
    sighting: '不是鱼群。是一层会动的锈。它们在吃观察窗的密封圈。',
    sanCost: 11,
    attractor: 'light',
    weakness: [{ kind: 'blackout' }, { kind: 'supply', supply: 'sup.pulse' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.flare' }],
    advice: '拉总闸。没有电流它们会掉下去。别用螺旋桨去甩，那是给它们喂钢。',
    adviceStation: 'life',
    onStrike: {
      trauma: 8,
      flood: 0.14,
      hull: 0.18,
      san: 9,
      line: '密封圈在响。像有人用砂纸打观察窗。水位开始有意义。',
    },
    look: {
      plan: 'school',
      tone: PALETTE.rustDim,
      lights: 0,
      limbs: 22,
      tempo: 2.1,
      scale: 0.14,
      dissolve: 0.2,
    },
  },

  'cre.veil': {
    id: 'cre.veil',
    name: '幕皮',
    designation: 'V-5 弥散回波',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'huge',
    sonarSpeed: 'slow',
    footage:
      'a vast slow curtain of living skin hanging in the water like a sail, no bells, no fish, a single sheet with veins and a pale underside, the edges dissolving into silt, it turns to face the lens as if it has a front',
    sighting: '一张皮。没有头。它把整条廊挡住了，雷达画出来像一群水母。',
    sanCost: 17,
    attractor: 'light',
    weakness: [{ kind: 'lampoff' }, { kind: 'fullstop' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.flare' }],
    advice: '关灯，停机。它靠影子捕东西。你动，它就合上。',
    adviceStation: 'camera',
    onStrike: {
      trauma: 12,
      flood: 0.16,
      hull: 0.2,
      san: 15,
      line: '舱被一张湿的东西包住了。推进器还在转，外面没有水的声音。',
    },
    look: {
      plan: 'colossus',
      tone: PALETTE.boneDim,
      lights: 0,
      limbs: 8,
      tempo: 0.09,
      scale: 0.93,
      dissolve: 0.78,
    },
  },

  'cre.runner': {
    id: 'cre.runner',
    name: '冲行体',
    designation: 'R-7 高速巨影',
    kin: 'mythos',
    danger: 3,
    sonarSize: 'huge',
    sonarSpeed: 'fast',
    footage:
      'a huge fast mass the size of a whale but with no flukes and no eye, the front is a vertical slit of stacked plates, it crosses the frame in under a second leaving a helical wake of silt, the anatomy is wrong for any catalogued whale',
    sighting: '同一团高速巨影。片子第三帧才看清：没有鳍，前面是一条竖直的缝。',
    sanCost: 15,
    attractor: 'noise',
    weakness: [{ kind: 'fullstop' }, { kind: 'blackout' }],
    provokes: [{ kind: 'fullahead' }, { kind: 'supply', supply: 'sup.pulse' }],
    advice: '别跟它比速度。停机。它追螺旋桨的尾流，不追一动不动的铁。',
    adviceStation: 'nav',
    onStrike: {
      trauma: 24,
      flood: 0.12,
      hull: 0.3,
      san: 11,
      line: '撞击来自正前方。比鲸快，比鲸硬。肋骨区的灯灭了一排。',
    },
    look: {
      plan: 'colossus',
      tone: PALETTE.steelDark,
      lights: 0,
      limbs: 4,
      tempo: 0.7,
      scale: 0.9,
      dissolve: 0.16,
    },
  },
};

export function creature(id: CreatureId): Creature {
  const c = CREATURES[id];
  if (!c) throw new Error(`[pod] 未知造物 ${id}`);
  return c;
}

export function allCreatures(): readonly Creature[] {
  return Object.values(CREATURES);
}
