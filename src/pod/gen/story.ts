/**
 * 剧情职能 → 生成约束。
 * ============================================================================
 * 七关 runtime 长什么样，由这里收束，不由「这一关要像克苏鲁」收束。
 * 地形、生物、回波仍然是抽的；抽完必须还能回答：这一关的通话气温变了没有。
 *
 * 对照 docs/review-story-skeleton.md。`StoryFn` 定义在 acts.ts。
 * 每关一条卡关钩：`STORY_HOOKS` + `requireHook`。万斯要的实物必须生成出来。
 */

import type { StoryFn, StripeId } from '../content/acts';

export type { StoryFn };

/**
 * 卡关钩要兑现的实物。万斯开口要的那一块，生成器必须摆出来。
 * 钩子同时干两件事：推进剧情（他要一份描述/一份日志），以及点出本关通关动作。
 */
export type HookNeed =
  | 'echo-wreck'
  | 'paint-fork'
  | 'period-heading'
  | 'true-charge'
  | 'fan-and-cut'
  | 'watcher-face'
  | 'glyph-barge';

/** 玩家卡在哪一扇门上。万斯催的是这一扇，不是教程清单。 */
export type HookGate = 'identify' | 'visit-hook' | 'solve-lock' | 'survey';

export interface StoryHook {
  need: HookNeed;
  /** 这一关他要的那件东西（生成器锚） */
  object: string;
  /** 进关时种下的那一句。brief 里已经说过一遍的，idle 不再重复原文 */
  ask: string;
  /** 卡住时再催。比 ask 更指向动作，仍是万斯的嘴，不是 UI 提示 */
  nudge: Readonly<Partial<Record<HookGate, string>>>;
}

export interface HookSnapshot {
  story: StoryFn;
  identified: boolean;
  hookVisited: boolean;
  hasLock: boolean;
  lockOpen: boolean;
  atExit: boolean;
  surveyedNext: boolean;
  lastAct: boolean;
}

export interface ActGenRules {
  /** 开局必须像工事故：不许出现诡雷货箱 */
  forbidTrapCaches: boolean;
  /** 竖井 / 电梯周围不许撒货箱 */
  forbidExitCaches: boolean;
  /** 分叉两侧几何镜像，差别只在漆 */
  mirrorFork: boolean;
  /** 双块回波镜像，雷达上看成一张图纸 */
  mirrorBlocks: boolean;
  /** 把回波挪到万斯报过的航向上 */
  pinEchoToAdvised: boolean;
  /** 竖井里不许再长残骸节点 */
  cleanShaft: boolean;
  /** 舱门 / 废墟带跨关复用的灰港编号 */
  stencilReuse: boolean;
  /** 这一关背景生物只抽无害的（事故、伴行） */
  harmlessExtras: boolean;
  /** 拟态回波更常是嘴：他让你别看 */
  mimicBias: number;
  /** 本关卡关钩必须生成的实物 */
  requireHook: HookNeed;
}

export const STORY_RULES: Readonly<Record<StoryFn, ActGenRules>> = {
  accident: {
    forbidTrapCaches: true,
    forbidExitCaches: false,
    mirrorFork: false,
    mirrorBlocks: false,
    pinEchoToAdvised: false,
    cleanShaft: false,
    stencilReuse: false,
    harmlessExtras: true,
    mimicBias: 0.45,
    requireHook: 'echo-wreck',
  },
  'too-ready': {
    forbidTrapCaches: true,
    forbidExitCaches: false,
    mirrorFork: true,
    mirrorBlocks: false,
    pinEchoToAdvised: false,
    cleanShaft: false,
    stencilReuse: false,
    harmlessExtras: false,
    mimicBias: 0.45,
    requireHook: 'paint-fork',
  },
  'path-remembers': {
    forbidTrapCaches: false,
    forbidExitCaches: false,
    mirrorFork: false,
    mirrorBlocks: false,
    pinEchoToAdvised: true,
    cleanShaft: false,
    stencilReuse: true,
    harmlessExtras: false,
    mimicBias: 0.45,
    requireHook: 'period-heading',
  },
  'dont-look': {
    forbidTrapCaches: false,
    forbidExitCaches: false,
    mirrorFork: false,
    mirrorBlocks: true,
    pinEchoToAdvised: false,
    cleanShaft: false,
    stencilReuse: true,
    harmlessExtras: false,
    mimicBias: 0.72,
    requireHook: 'true-charge',
  },
  'still-running': {
    forbidTrapCaches: false,
    forbidExitCaches: false,
    mirrorFork: false,
    mirrorBlocks: false,
    pinEchoToAdvised: false,
    cleanShaft: false,
    stencilReuse: true,
    harmlessExtras: false,
    mimicBias: 0.45,
    requireHook: 'fan-and-cut',
  },
  escort: {
    forbidTrapCaches: true,
    forbidExitCaches: true,
    mirrorFork: false,
    mirrorBlocks: false,
    pinEchoToAdvised: false,
    cleanShaft: false,
    stencilReuse: true,
    harmlessExtras: true,
    mimicBias: 0.45,
    requireHook: 'watcher-face',
  },
  'too-clean': {
    forbidTrapCaches: true,
    forbidExitCaches: true,
    mirrorFork: false,
    mirrorBlocks: false,
    pinEchoToAdvised: false,
    cleanShaft: true,
    stencilReuse: true,
    harmlessExtras: true,
    mimicBias: 0.45,
    requireHook: 'glyph-barge',
  },
};

/**
 * 七关各一条钩。契诃夫：进关时万斯要一件东西；卡住时他还要同一件。
 * 史蒂芬·金：催的是程序和日志，不是「按摄像头」。
 */
export const STORY_HOOKS: Readonly<Record<StoryFn, StoryHook>> = {
  accident: {
    need: 'echo-wreck',
    object: '没有编号的回波，和那截采矿模块',
    ask: '那团没编号的，拍一卷送到分析台。事故报告空着这一栏。',
    nudge: {
      identify: '三号，拍一卷送到分析台。全息屏还是空的。事故报告空着这一栏。',
      'visit-hook': '开到采矿模块旁边停下。雷达上最大那块硬回波。',
      survey: '出口前面那团黑。再拍一卷。我好把下一段画上。',
    },
  },
  'too-ready': {
    need: 'paint-fork',
    object: '分叉上那道雷达看不见的警戒漆',
    ask: '雷达看不见漆。拍分叉。我要看哪根刷过。',
    nudge: {
      identify: '雷达看不见漆。拍分叉。我要看哪根刷过。',
      'visit-hook': '顺着刷了警戒漆的那根。探照灯下它会发亮。',
      'solve-lock': '阀。片子里有漆的那根。打捞台拧一次。',
      survey: '出口。再拍一卷。下一段我这边还是黑的。',
    },
  },
  'path-remembers': {
    need: 'period-heading',
    object: '坐在他刚报的航向上的喷口',
    ask: '数喷口。它们就爱待在我报的那个航向上。',
    nudge: {
      identify: '数喷口。五秒。它们就爱待在我报的那个航向上。',
      'visit-hook': '热泉墙。先过去。贴壁那团等你拍完再决定。',
      survey: '裂谷尽头。拍。我把下一张图画上。',
    },
  },
  'dont-look': {
    need: 'true-charge',
    object: '双块中间那根真充电桩',
    ask: '别拍那两座。中间那根桩可以拍。',
    nudge: {
      identify: '别拍那两座。中间那根桩可以拍。线框要有名字，我才能把下一段接上。',
      'visit-hook': '中间那根。真充电桩。别碰两边。',
      survey: '出口。拍。别回头看那两座。',
    },
  },
  'still-running': {
    need: 'fan-and-cut',
    object: '还在转的扇叶缺口，和门锁生锈的那一侧',
    ask: '扇叶还在转。拍缺口，再拍门锁生锈的那一侧。',
    nudge: {
      identify: '扇叶还在转。拍缺口。门锁生锈的那一侧也拍。',
      'visit-hook': '门。切割器一次。薄弱点片子里有。',
      'solve-lock': '打捞台。切割器。生锈那一侧。别切错。',
      survey: '工业层出口。再拍一卷。班还没交。',
    },
  },
  escort: {
    need: 'watcher-face',
    object: '贴着走、不攻击的那张脸',
    ask: '跟我说它的脸。不要开灯。',
    nudge: {
      identify: '跟我说它的脸。不要开灯。拍。',
      'visit-hook': '贴着你走的那一团。保持距离。拍完就走。',
      survey: '拍出口。走。别跟它耗。',
    },
  },
  'too-clean': {
    need: 'glyph-barge',
    object: '驳船舷侧那组开锁符号',
    ask: '舷侧那组符号是钥匙。拍它。进井前把无线电关掉。',
    nudge: {
      identify: '舷侧那组符号是钥匙。拍它。',
      'visit-hook': '驳船舷侧。机械臂捞不到漆，镜头抄。',
      'solve-lock': '图案锁。打捞台。从左到右，跟片子里那组对上。',
    },
  },
};

export interface GenMemory {
  headings: number[];
  stripes: StripeId[];
  /** 灰港编号，整趟不变。后面的门和箱子会把它写回来 */
  stencil: string;
  lastExitHeading: number;
}

export function stencilFromSeed(seed: number): string {
  return `GH-${((seed >>> 0) % 80) + 11}`;
}

export function emptyMemory(seed: number): GenMemory {
  return { headings: [], stripes: [], stencil: stencilFromSeed(seed), lastExitHeading: 0 };
}

export interface MemoryHost {
  stencil: string;
  memory: GenMemory;
}

export function collectMemory(vols: readonly MemoryHost[], seed: number): GenMemory {
  const mem = emptyMemory(seed);
  for (const v of vols) {
    if (v.stencil) mem.stencil = v.stencil;
    for (const h of v.memory.headings) if (!mem.headings.includes(h)) mem.headings.push(h);
    for (const s of v.memory.stripes) if (!mem.stripes.includes(s)) mem.stripes.push(s);
    mem.lastExitHeading = v.memory.lastExitHeading || mem.lastExitHeading;
  }
  return mem;
}

export function storyFootageClause(fn: StoryFn, stencil: string): string {
  switch (fn) {
    case 'accident':
      return 'Interior of a recent industrial accident: flooded processing rooms, not a hull on open silt. One unexplained silhouette in a doorway is allowed; do not add names, lockers, or ritual marks.';
    case 'too-ready':
      return 'Abandoned American slurry-pipe interiors, identical forks. The only readable difference is a stripe of warning industrial lacquer on an inner wall. It should look maintained too recently for a dead field.';
    case 'path-remembers':
      return `A used interior rift corridor. A stencil ${stencil} repeats on a pylon or crate inside a side room. Something waits on the heading a dispatcher would already know.`;
    case 'dont-look':
      return `Two nearly identical interior rooms as regular as a blueprint, Grayhaven stencil ${stencil} on one door frame. The site looks surveyed, not stumbled upon.`;
    case 'still-running':
      return `Flooded oil-well industrial interior that still has power. Nameplates, lockers, and the stencil ${stencil} belong to a shift that should have gone home. Do not add a monster god.`;
    case 'escort':
      return 'A vertical well-wall gallery interior and a pale shape keeping station outside a viewport. It is on duty, not hunting. No attack pose.';
    case 'too-clean':
      return `Interior of a perfectly circular rescue shaft chamber with no debris inside after kilometres of wreckage. Glyphs readable from a viewport. Stencil ${stencil}. The cleanliness is the wrong thing.`;
  }
}

export function rulesFor(fn: StoryFn): ActGenRules {
  return STORY_RULES[fn];
}

export function hookFor(fn: StoryFn): StoryHook {
  return STORY_HOOKS[fn];
}

/**
 * 这一关现在卡在哪。顺序跟着通关条件：先有名字，再去他要的那块，再开锁，再拍出口。
 * 返回 null 表示钩子已经兑现，剩下的是走到出口、拔桩、出发。
 */
export function currentHookGate(s: HookSnapshot): HookGate | null {
  if (!s.identified) return 'identify';
  if (!s.hookVisited && !s.atExit) return 'visit-hook';
  if (s.hasLock && !s.lockOpen) return 'solve-lock';
  if (!s.hookVisited) return 'visit-hook';
  return null;
}

export function hookLine(fn: StoryFn, gate: HookGate): string | undefined {
  return STORY_HOOKS[fn].nudge[gate];
}
