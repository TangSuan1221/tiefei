/**
 * 七关节奏表。
 * ============================================================================
 * 第一关开局生成内部，但全息要等第一卷送到分析台才亮。
 * 后六关在抵达该节点时生成，同样要分析才进场。
 * 拓扑是房间图：气闸、大厅、侧舱、竖井。提示词按内部空间写，不写沉在泥里的外壳。
 *
 * 声呐永远只给几何。颜色、周期、身份必须靠五秒片子。
 * 剧情职能见 `pod/gen/story.ts`，对照 docs/review-story-skeleton.md。
 * 每关一条卡关钩（万斯要的那件实物）写在 story.ts，生成器必须兑现。
 */

import type { CreatureId } from './creatures';
import type { FootageScene } from './footage';
import type { Leg } from './route';

export const ACT_COUNT = 7;

/** 心理拍。用来排难度曲线，不直接进文案 */
export type PsychBeat =
  | 'teach'
  | 'unease'
  | 'skill'
  | 'betray'
  | 'compress'
  | 'dread'
  | 'release';

/** 剧情职能。心理拍管难度，这个管「玩家该新知道哪一类事」 */
export type StoryFn =
  | 'accident'
  | 'too-ready'
  | 'path-remembers'
  | 'dont-look'
  | 'still-running'
  | 'escort'
  | 'too-clean';

export type LayoutKind =
  | 'scatter'
  | 'fork'
  | 'gauntlet'
  | 'mimic'
  | 'industrial'
  | 'stalk'
  | 'well';

/**
 * 警戒漆。美术只能落在四色里，所以「黄条纹」在本船是余烬色工业漆。
 * 雷达看不见它，片子里它是最亮的那一道。
 */
export type StripeId = 'ember' | 'bone' | 'blood' | 'none';

export const STRIPE_NAME: Readonly<Record<StripeId, string>> = {
  ember: '警戒漆',
  bone: '骨白编号',
  blood: '锈血标记',
  none: '没有漆',
};

export type EchoKind = 'ally-or-acid' | 'cache-or-mimic' | 'sleep-or-rage' | 'watcher';
export type HazardKind =
  | 'fan'
  | 'vent'
  | 'current'
  | 'laser'
  | 'crusher'
  | 'vortex'
  | 'veil'
  | 'minefield'
  | 'photophobe';
export type LockKind = 'color-valve' | 'glyph' | 'weak-cut';
export type LockSide = 'port' | 'starboard' | 'dorsal' | 'ventral';

export interface ActRecipe {
  index: number;
  psych: PsychBeat;
  layout: LayoutKind;
  /** 本关必须出现的歧义种类。空 = 这一关不靠回波吃饭 */
  echo: EchoKind | null;
  hazard: HazardKind | null;
  /** 第二套必须拍的机关。和 hazard 可以同时存在 */
  trap: HazardKind | null;
  lock: LockKind | null;
  /** 是否放一个会响的充电点 */
  charge: boolean;
  /** 默认威胁。生成器可以按 echo 的真身覆盖 */
  threat: CreatureId;
  /** 竖向落差预算（米）。正数 = 这一段整体在往下走 */
  drop: number;
  /** 剧情职能。生成器按这个收束，不按「这一关要像克苏鲁」 */
  story: StoryFn;
  leg: Leg;
}

const SCENE = (
  subject: string,
  motifs: readonly string[],
  motion: string,
): FootageScene => ({ subject, motifs, motion });

export const ACTS: readonly ActRecipe[] = [
  {
    index: 0,
    psych: 'teach',
    layout: 'scatter',
    echo: 'ally-or-acid',
    hazard: null,
    trap: null,
    lock: null,
    charge: false,
    threat: 'cre.hollow',
    drop: 40,
    story: 'accident',
    leg: {
      id: 'act.debris',
      name: '作业区残骸 · 三号采矿区',
      length: 380,
      safeHeading: 72,
      tolerance: 18,
      depth: 1120,
      advisedHeading: 72,
      brief: [
        '三号舱，按住按钮说话。我是万斯，灰港海事夜班调度。先听我说完，别动杆。',
        '03:14，哈罗油田平台解体。你那个舱是自己弹出来的 —— 所以你还在名册上。',
        '浮力舱有裂缝，现在上浮等于自杀。活路是沿海底走到 D-9。早餐前能上去。',
        '电量撑不住探照灯。回声雷达看形状，看不清再拍。',
        '雷达上那个硬回波是一截被炸开的采矿模块。开到它旁边停下。',
        '那团没编号的回波，拍一卷给我。事故报告空着这一栏。',
      ],
      clear: ['作业区出来了。深度还在掉。这是正常的 —— 油井比采矿区更深。'],
      siteName: '采矿模块残骸',
      arrival: [
        '推进器停了。声呐上是一团没有编号的废墟。',
        '全息屏是空的。拍第一卷，送到分析台，内部才会长出来。',
      ],
      scene: SCENE(
        'Inside a flooded mineral-processing hall, looking from a torn airlock into connected rooms',
        [
          'grated steel decks, overhead pipe runs, and pressure doors between chambers',
          'a side equipment bay with collapsed racks still bolted to the bulkhead',
          'a corridor continuing forward into black water',
          'one large slow-moving mass visible through a far doorway, readable only as a silhouette',
        ],
        'The camera is inside the architecture, panning slowly from the airlock across the hall and holding on the far doorway.',
      ),
      wrecks: [
        {
          id: 'wr.module',
          name: '采矿模块残骸',
          desc: '半截矿物处理舱插在沉积物里。架子还立着，东西大概没被冲走。',
          noise: 0.3,
          cost: 6,
          attempts: 2,
          loot: [
            [
              ['sup.cell', 1],
              ['sup.lure', 1],
            ],
            [
              ['sup.tape', 2],
              ['sup.cutter', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.hollow', fuse: 95 }],
    },
  },

  {
    index: 1,
    psych: 'unease',
    layout: 'fork',
    echo: null,
    hazard: null,
    trap: 'photophobe',
    lock: 'color-valve',
    charge: false,
    threat: 'cre.chorus',
    drop: 80,
    story: 'too-ready',
    leg: {
      id: 'act.pipes',
      name: '条纹管廊 · 废弃输送线',
      length: 420,
      safeHeading: 128,
      tolerance: 14,
      depth: 1280,
      advisedHeading: 128,
      brief: [
        '前面是废弃输送线。主管道分叉，雷达上看每一根都一样。',
        '听好：顺着刷了警戒漆的那根走。探照灯下它会发亮。雷达看不见漆。',
        '旧场都这样。灰港的漆比平台还老。到了分叉口拍一卷。别省这一格电。',
      ],
      clear: ['管廊过去了。', '旧场。都这样。'],
      siteName: '输送分叉',
      arrival: [
        '声呐上是未知废墟。全息屏还是空的。',
        '拍分叉内部。警戒漆只有探照灯下看得见。',
      ],
      scene: SCENE(
        'Inside a flooded slurry-pipe junction, two identical corridors forking left and right from a small hall',
        [
          'interior bulkheads, pipe racks, and grated flooring in both mouths',
          'one corridor painted with a single stripe of warning ember industrial lacquer that only shows in the floodlight',
          'the other corridor bare rust with a bone-white stencil number on the inner wall',
          'silt hanging equally in both door frames',
        ],
        'The camera pans from the left interior mouth to the right interior mouth and holds on the painted stripe for two seconds.',
      ),
      wrecks: [
        {
          id: 'wr.valve',
          name: '分线阀箱',
          desc: '阀箱侧面有漆。雷达把它画成一块方的。',
          noise: 0.35,
          cost: 5,
          attempts: 1,
          loot: [
            [
              ['sup.filter', 1],
              ['sup.stim', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.chorus', fuse: 82 }],
    },
  },

  {
    index: 2,
    psych: 'skill',
    layout: 'gauntlet',
    echo: 'sleep-or-rage',
    hazard: 'vent',
    trap: 'laser',
    lock: null,
    charge: true,
    threat: 'cre.angler',
    drop: 110,
    story: 'path-remembers',
    leg: {
      id: 'act.vents',
      name: '热泉裂谷 · 地热带',
      length: 460,
      safeHeading: 15,
      tolerance: 12,
      depth: 1460,
      advisedHeading: 15,
      brief: [
        '地热带。热泉按自己的节奏喷。雷达只告诉你前面有一堵「墙」。',
        '拍五秒。数它的间隔。然后盲开。',
        '裂谷边上有地热桩。充得动，但泵很响。它们就爱待在泵边上 —— 潮汐把东西推回来。',
      ],
      clear: ['喷口过去了。舱壳还是烫的。你没把舱撞碎。这就算会了。'],
      siteName: '热泉廊',
      arrival: [
        '线框正中有一条周期性变厚的阴影。',
        '红点贴在廊壁上。它在呼吸，或者在猎。五秒片子才能告诉你是哪一种。',
      ],
      scene: SCENE(
        'Inside a flooded thermal corridor, a periodic superheated vent erupting across the only interior gap',
        [
          'the vent jet appearing and vanishing on a regular count between two bulkheads',
          'mineral crust on interior walls in rust-orange deposits',
          'a dim geothermal charging pylon bolted inside a side room, cables twitching',
          'a large silhouette in the next chamber, either barely moving or thrashing',
        ],
        'The camera holds on the interior vent for a full five seconds without cutting, so the interval between eruptions can be counted by eye.',
      ),
      wrecks: [
        {
          id: 'wr.pylon',
          name: '地热桩工具箱',
          desc: '充电桩底座的箱子还封着。泵一响，整条裂谷都知道。',
          noise: 0.5,
          cost: 7,
          attempts: 1,
          loot: [
            [
              ['sup.cell', 1],
              ['sup.sealant', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.angler', fuse: 74 }],
    },
  },

  {
    index: 3,
    psych: 'betray',
    layout: 'mimic',
    echo: 'cache-or-mimic',
    hazard: null,
    trap: 'minefield',
    lock: null,
    charge: true,
    threat: 'cre.angler',
    drop: 70,
    story: 'dont-look',
    leg: {
      id: 'act.mimic',
      name: '补给伪站 · 四号充电桩',
      length: 400,
      safeHeading: 244,
      tolerance: 14,
      depth: 1560,
      advisedHeading: 244,
      brief: [
        '四号充电桩就在前面。雷达上是标准补给站的轮廓，规整、对称、像图纸。',
        '三号舱，直接开进去。别浪费电去拍。',
        '……你不需要看片子。我这边的图比你的清楚。',
        '别拍那两座。中间那根桩可以拍。我要你活着交班。',
      ],
      clear: ['过去了。', '你不该拍的。'],
      siteName: '四号桩',
      arrival: [
        '线框中央是一个太规整的方块，旁边还有一个几乎一样的。',
        '万斯说左边那个是充电桩。雷达说它们是同一种回波。',
      ],
      scene: SCENE(
        'Inside a flooded supply deck, two nearly identical blocky rooms opening off a central corridor',
        [
          'the true cache room showing a stencil number and a cable gland in the floodlight',
          'the false room having no seams, a single pale lure-light hanging in front of a mouth',
          'interior lighting still running on one side only',
          'grated decks connecting both rooms to a charging pylon alcove',
        ],
        'The camera pans from the left room interior to the right room interior and holds on the stencil so it can be read.',
      ),
      wrecks: [
        {
          id: 'wr.cache',
          name: '四号电池组',
          desc: '真的那一座。封条还在。假的那一座没有封条，因为它没有门。',
          noise: 0.4,
          cost: 6,
          attempts: 2,
          loot: [
            [
              ['sup.cell', 1],
              ['sup.pulse', 1],
            ],
            [
              ['sup.flare', 1],
              ['sup.wax', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.angler', fuse: 68 }],
    },
  },

  {
    index: 4,
    psych: 'compress',
    layout: 'industrial',
    echo: null,
    hazard: 'fan',
    trap: 'crusher',
    lock: 'weak-cut',
    charge: false,
    threat: 'cre.weave',
    drop: 90,
    story: 'still-running',
    leg: {
      id: 'act.fans',
      name: '散热井 · 油井工业层',
      length: 440,
      safeHeading: 310,
      tolerance: 11,
      depth: 1680,
      advisedHeading: 210,
      brief: [
        '工业层。巨大的散热扇还在转。电源不知道从哪来 —— 笑话。然后不笑了。',
        '航向 210。从扇叶缺口穿过去。',
        '后面那扇门，切割器只能用一次。拍清楚薄弱点在左舷还是右舷，再伸机械臂。',
      ],
      clear: ['扇叶过去了。门开了。你手里的切割器已经空了。'],
      siteName: '散热扇廊',
      arrival: [
        '线框里有一圈在转的缺口。缺口的位置雷达给不出来，它只给你一个环。',
        '环后面是一扇门。门是对称的。弱点不是。',
      ],
      scene: SCENE(
        'Inside a flooded oil-well industrial deck, a colossal cooling fan still turning in a corridor, one blade notched',
        [
          'the missing section of blade passing an interior doorway on a regular count',
          'a locked steel hatch in the next room beyond the fan',
          'rust eaten through the hatch on one side only, the weak point visible as a darker patch on the inner face',
          'riveted well casing forming the walls of stacked rooms above and below',
        ],
        'The camera holds on the fan from inside the corridor for five seconds so the notch can be counted, then tilts to the hatch interior and lingers on the rusted side.',
      ),
      wrecks: [
        {
          id: 'wr.hatch',
          name: '锁死的检修门',
          desc: '门是对称的。生锈的那一侧只有片子能告诉你。切割器只有一发。',
          noise: 0.55,
          cost: 8,
          attempts: 1,
          loot: [
            [
              ['sup.cutter', 1],
              ['sup.cell', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.weave', fuse: 70 }],
    },
  },

  {
    index: 5,
    psych: 'dread',
    layout: 'stalk',
    echo: 'watcher',
    hazard: 'vortex',
    trap: null,
    lock: null,
    charge: false,
    threat: 'cre.hollow',
    drop: 40,
    story: 'escort',
    leg: {
      id: 'act.watcher',
      name: '静默贴行 · 井壁阴影',
      length: 360,
      safeHeading: 48,
      tolerance: 16,
      depth: 1710,
      advisedHeading: 48,
      brief: [
        '井壁这一段雷达很干净。干净得不对。',
        '如果有东西贴着你走、但不攻击 —— 不要开灯。拍一卷。看它的脸。跟我说你看见什么。',
        '拍过一次还想再拍的话，外面可能已经不是刚才那张脸了。',
      ],
      clear: ['它还在。它一直在。你只是不再看它。'],
      siteName: '井壁',
      arrival: [
        '线框右侧有一个贴着舱走的点。距离不变。',
        '它没有朝你来。这比朝你来更难办。',
      ],
      scene: SCENE(
        'Inside a vertical well-wall gallery, rooms opening off a long interior catwalk, and something keeping station outside a viewport',
        [
          'a pale shape matching the pod\'s speed visible through a viewport, without closing the distance',
          'a cluster of small fish around a closed interior hatch in the first take',
          'the same hatch later, the fish gone, a thick tendril lying across the opening',
          'no attack, only watching',
        ],
        'The camera tracks the accompanying shape through the viewport for five seconds, then drifts to the interior hatch and holds.',
      ),
      wrecks: [],
      threats: [{ creature: 'cre.hollow', fuse: 88 }],
    },
  },

  {
    index: 6,
    psych: 'release',
    layout: 'well',
    echo: 'ally-or-acid',
    hazard: null,
    trap: 'veil',
    lock: 'glyph',
    charge: true,
    threat: 'cre.weave',
    drop: -120,
    story: 'too-clean',
    leg: {
      id: 'act.lift',
      name: 'D-9 逃生电梯',
      length: 320,
      safeHeading: 0,
      tolerance: 20,
      depth: 1585,
      advisedHeading: 0,
      brief: [
        '到了。D-9 就在正上方。电梯井是竖的，雷达第一次让你抬头。',
        '井口有一扇图案锁。密码喷在旁边那艘沉船的舷侧上。拍它。',
        '三号舱，进井之前把无线电关掉。不要问为什么。',
      ],
      clear: ['——'],
      siteName: 'D-9 井口',
      arrival: [
        '线框是一根往上消失的竖管。太圆了。',
        '沉船舷侧有一组符号。雷达把它们画成三个一样的凸起。',
      ],
      scene: SCENE(
        'Inside the D-9 rescue collar: a perfectly circular vertical shaft opening overhead from a small interior chamber, glyphs readable on a barge hull seen through a viewport',
        [
          'a concrete and steel collar forming the room walls, unweathered',
          'a ladder of rungs running up the inside of the shaft from this chamber',
          'three painted symbols visible through a side viewport, matching the lock on the interior gate',
          'no wreckage in the shaft itself, which after kilometres of debris is the wrong thing to see',
        ],
        'The camera pans the interior glyphs slowly enough to read them, then tilts up the shaft from inside the chamber and holds until the beam dies.',
      ),
      wrecks: [
        {
          id: 'wr.barge',
          name: '补给驳船',
          desc: '舷侧的符号是开电梯的钥匙。机械臂捞不到漆，只能用镜头抄。',
          noise: 0.25,
          cost: 4,
          attempts: 1,
          loot: [
            [
              ['sup.stim', 1],
            ],
          ],
        },
      ],
      threats: [{ creature: 'cre.weave', fuse: 62 }],
    },
  },
];

export function actAt(index: number): ActRecipe {
  const a = ACTS[Math.min(Math.max(0, index), ACTS.length - 1)];
  if (!a) throw new Error(`[pod] 关卡越界 ${index}`);
  return a;
}

export function cloneLeg(leg: Leg): Leg {
  return {
    ...leg,
    brief: [...leg.brief],
    clear: [...leg.clear],
    arrival: [...leg.arrival],
    wrecks: leg.wrecks.map((w) => ({
      ...w,
      loot: w.loot.map((batch) => batch.map(([id, n]) => [id, n] as const)),
    })),
    threats: [...leg.threats],
    scene: leg.scene
      ? { subject: leg.scene.subject, motifs: [...leg.scene.motifs], motion: leg.scene.motion }
      : undefined,
  };
}
