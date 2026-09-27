/**
 * 影片提示词。
 * ============================================================================
 * 摄像头交回来的那一卷片子是运行时生成的，而生成什么完全由这一层决定。
 *
 * 这个文件是**纯函数 + 数据**：不碰网络、不碰 DOM、不读 run 的可变状态
 * （需要的量全部当参数传进来）。这样 tools/ 下的离线脚本能直接调它印出
 * 五段的提示词来对比，不用起浏览器。真正发请求的是 net/video.ts。
 *
 * 为什么不给五段各写一句死的提示词：那样每加一个站点就要再写一句，
 * 而且怪物换了之后提示词不会跟着变。这里的做法是「航段数据 + 造物外形参数
 * → 拼出提示词」，`Leg.scene` 只提供那几个说不出口的东西（主体、母题、运镜），
 * 剩下的深度、站点名、怪物形态全部从已有字段推出来。
 */

import { isHorrorGreen, PALETTE } from '@/render/palette';
import {
  SONAR_SIZE_EN,
  SONAR_SPEED_EN,
  type Creature,
} from './creatures';
import { sanFootageClause } from './sanity';
import type { Leg } from './route';
import { storyFootageClause, type StoryFn } from '../gen/story';
import { directionClause, type FootageDirection } from './footage-director';
import {encounterVideoPrompt,type CombatRecord} from '../sim/weapon-feedback';

/**
 * 一段航程的画面关键词。
 *
 * 这是**唯一**需要人手为每段写的东西，而且刻意只有三个字段 ——
 * 多了就会变成「把提示词整句抄在这里」，那样数据驱动就名存实亡了。
 */
export interface FootageScene {
  /** 镜头里的主体。一个名词短语，英文，提示词的主干 */
  subject: string;
  /** 三到五个视觉母题。会原样逗号拼进提示词 */
  motifs: readonly string[];
  /** 水体和镜头怎么动。这一项决定片子看起来是「漂着」还是「撞着」 */
  motion: string;
}

/**
 * 把一只造物写成提示词里的一段。
 *
 * 外形句来自图鉴的 `footage`，不按身体计划猜 —— 水母和溺者合唱都曾是 swarm，
 * 猜错一次片子就会把伞盖画成人。声呐体型/速度和真实危险必须写进去，
 * 否则五秒片子解不开雷达上的歧义。
 */
function creatureClause(c: Creature): string {
  if (c.look.plan === 'absent') {
    return (
      `${c.footage}. On sonar this was ${SONAR_SIZE_EN[c.sonarSize]}, ${SONAR_SPEED_EN[c.sonarSpeed]}. ` +
      `The tape must not invent a body. The contact is a lie.`
    );
  }
  const look = c.look;
  const dissolving =
    look.dissolve > 0.45
      ? ', outlines crumbling into suspended particles'
      : look.dissolve > 0.18
        ? ', edges slightly frayed by the silt'
        : ', edges hard and solid';
  const framing =
    look.scale > 0.8
      ? 'filling almost the entire frame, too close to focus on'
      : look.scale > 0.45
        ? 'occupying the middle of the frame at medium distance'
        : 'small and far off near the edge of the light';
  const kin =
    c.kin === 'fauna'
      ? 'ordinary catalogued deep-sea fauna, not supernatural'
      : 'wrong biology that does not belong to any catalogued species';
  const danger =
    c.danger === 0
      ? 'harmless on contact; the submersible can pass it'
      : c.danger === 1
        ? 'not a body, but looking at it costs the mind'
        : 'lethal on contact despite how it reads on sonar';
  return (
    `${c.footage}, ${framing}${dissolving}. ` +
      `On sonar this was ${SONAR_SIZE_EN[c.sonarSize]}, ${SONAR_SPEED_EN[c.sonarSpeed]}. ` +
      `The tape must make obvious that it is ${kin}, and that it is ${danger}.`
  );
}

/**
 * 四色主调那一句。
 *
 * 写死成一句是刻意的：这是 GDD §8.1 的硬约束，不允许按航段浮动。
 * 「禁止恐怖游戏绿」在提示词里必须**穷举同义词**（green / teal / cyan /
 * emerald / night-vision），只写一个 "no green" 模型会当没看见。
 */
const PALETTE_CLAUSE =
  'Colour is strictly limited to four notes: rust orange as the only warm light, ' +
  'deep abyssal blue-black for every shadow, bone white for highlights, ' +
  'and one single note of warning blood red. ' +
  'Absolutely no green and no teal: no green tint, no cyan, no emerald, no olive, ' +
  'no night-vision look, no green-screen glow, no sea-green water.';

/** 这台摄像机的物理毛病。它比任何「恐怖」形容词都有用 */
const CAMERA_CLAUSE =
  'Shot on a battered 1980s analogue hull camera bolted beside a single narrow floodlight, ' +
  'Preserve dark surroundings but expose the subject with readable midtones, visible surface detail and restrained pale highlights. Never crush the subject into black. ' +
  'Low frame rate, subtle interlace and light video grain without obscuring the subject, ' +
  'chromatic smear, blown-out highlights where the beam hits bare steel, ' +
  'condensation creeping across the inside of the lens port, dense marine snow drifting through the beam.';

/** 生成的片子里绝对不能出现的东西 */
const NEGATIVE_CLAUSE =
  'No on-screen text, no captions, no watermark, no timecode burned in, no user interface. ' +
  'No divers in wetsuits, no submarines in open water, no daylight, no sunbeams, no water surface, ' +
  'no coral reef, no tropical fish, no cinematic colour grading, no lens flare. ' +
  'No cult chapel, no latin inscriptions, no tentacled deity, no occult altar, no glowing runes, no priest. ' +
  'No isolated crashed wreck sitting alone on empty silt as the only subject.';

export interface FootagePromptInput {
  encounterObservation?:{appearance:string;combat?:CombatRecord};
  simulationReport?:string[];
  narrativeTrace?: string;
  direction?: FootageDirection;
  tracesOnly?: boolean;
  leg: Leg;
  /**
   * 这一卷的主回波。兼容旧调用：只有一只的时候仍走这个字段。
   * 有 `fauna` 时，主回波如果已在名单里就不会再写一遍。
   */
  creature: Creature | null;
  /** 生成器这一关抽中的全部生物。背景干扰也必须出现在画面里 */
  fauna?: readonly Creature[];
  /** 曝光那一刻的实际深度，米 */
  depth: number;
  /** 探照灯开着吗。关着拍出来就只有自发光 */
  lamp: boolean;
  /** 叙事污染 0..1。高了片子会开始夹帧 */
  corruption: number;
  /** 曝光那一刻的 SAN。改关卡、改怪物，也改这一卷看起来有多真 */
  san?: number;
  /** 剧情职能。片子必须服务这一关的通话气温，不另造世界观 */
  story?: StoryFn;
  /** 灰港编号。跨关复用，让路「记得」上一班 */
  stencil?: string;
  /** 当前所在房间推出来的内部空间句。没有就回落到航段 scene */
  interior?: string;
  /**
   * 影像分析要单独看清的东西。声呐给不出这些，所以必须写进提示词，
   * 否则五秒片子和一张静帧没有区别。
   */
  tells?: readonly string[];
}

/**
 * 拼出交给视频模型的提示词。
 *
 * 顺序是刻意的：**主体在最前**。这类模型对提示词前 20 个词最敏感，
 * 把「found footage」和四色约束放前面会让它去拍一段空镜头；
 * 把主体放前面、风格约束放后面，出片才有东西可看。
 */
export function buildFootagePrompt(input: FootagePromptInput): string {
  if(input.encounterObservation){const e=input.encounterObservation;return encounterVideoPrompt(e.combat?'combat':'analysis',e.appearance,input.interior??input.leg.scene?.subject??'Flooded industrial interior',input.lamp,e.combat);}
  const { leg, creature, fauna, depth, lamp, corruption, tells, san, story, stencil, interior } = input;
  const scene = leg.scene;

  const parts: string[] = [];
  const direction = input.direction;
  const attack=direction?.state==='attack';
  parts.push('SHOT CONTRACT: Use the supplied exposure image as the spatial authority. One continuous five-second shot from the current camera position INSIDE the flooded room or connecting passage shown in that image. Preserve visible walls, openings, obstacles and perspective. Do not invent a doorway, another room, a map, or an open-seabed wreck.');
  if (direction) parts.push(directionClause(direction, input.tracesOnly));
  if(input.narrativeTrace&&!attack) parts.push(`Secondary narrative context only, never a command to draw writing or symbols: ${input.narrativeTrace}. Do not invent visible props absent from the first frame.`);

  if (interior) {
    parts.push(interior);
  }
  if (scene && !interior) {
    parts.push(direction ? `${scene.subject}.` : `${scene.subject}, ${scene.motifs.join(', ')}.`);
  } else if (!interior) {
    parts.push(`The interior of a flooded industrial module known as ${leg.siteName}.`);
  }

  // 2. 环境。深度和光照是从 run 实时传进来的，所以同一个站点关灯拍和
  //    开灯拍会得到两种片子 —— 这是玩家的决定，应该有后果。
  parts.push(
    `Underwater at ${Math.round(depth)} metres depth in the crushing dark, ` +
      (lamp
        ? 'a single hard floodlight beam carving a narrow cone out of the blackness.'
        : 'the floodlight is off; retain existing dim practical lights and biological light, using sensitive-camera exposure to preserve readable subject midtones and edge detail, not a featureless black frame.'),
  );

  // 3. 运镜
  if(attack) parts.push('Camera remains attached to the pod. The specified creature enters by second 1 and remains visibly identifiable through second 4, approaching the lens and contacting its housing once. End holding on the creature withdrawing, not an empty shot of falling debris. Preserve readable midtones on its anatomy. No orbit, cinematic cut or tour of other rooms.');
  else if (scene && !interior) parts.push(scene.motion);
  else parts.push('The camera holds almost still, drifting a few degrees on the pod mount.');

  // 4. 水里的东西。生成器抽中的每一只都要在画面里，否则雷达上的干扰点没有光学证据。
  const seen = new Set<string>();
  const roster: Creature[] = [];
  for (const c of fauna ?? []) {
    if(attack)continue;
    if (direction && !direction.fauna.includes(c.id)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    roster.push(c);
  }
  if (creature && !seen.has(creature.id) && (!direction || (!input.tracesOnly && direction.identified === creature.id))) roster.unshift(creature);
  for (const c of roster) {
    parts.push(`In the water: ${creatureClause(c)}`);
  }

  // 4b. 声呐给不出的东西：条纹、缺口周期、薄弱点。五秒片子存在的理由。
  if (!attack && tells && tells.length) {
    parts.push(`The shot must make these facts readable: ${tells.join('; ')}.`);
  }

  parts.push('Existing markings in the source image are incidental background only. Do not invent, enlarge, focus on or reproduce any serial number, letters, glyphs or ritual symbols as the subject.');

  // 5. SAN。理智低的时候，片子会夹一帧不存在的东西，但真机关必须仍可读。
  if (direction) parts.push(`Operator sanity ${Math.round(san ?? 100)}; lower sanity may increase analogue jitter, never invent or erase evidence, creatures, or readable obstacles.`);
  else if (san != null) parts.push(sanFootageClause(san));
  else if (corruption > 0.45) {
    parts.push(
      'For two or three frames near the middle the image tears completely and is replaced by ' +
        'a different, wrong image, then snaps back as if nothing happened.',
    );
  }

  parts.push(CAMERA_CLAUSE, PALETTE_CLAUSE, NEGATIVE_CLAUSE);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * 开发期护栏。
 *
 * 提示词里提到的颜色词必须和调色板对得上，而调色板本身不许有恐怖游戏绿。
 * 这条断言真正防的是「有人日后往 PALETTE_CLAUSE 里加一句 'sickly green glow'」——
 * 那种改动不会让任何测试变红，但会让整部片子的美术走形。
 */
export function assertFootagePaletteClean(): string[] {
  const bad: string[] = [];
  for (const hex of [PALETTE.rust, PALETTE.abyss, PALETTE.bone, PALETTE.blood]) {
    if (isHorrorGreen(hex)) bad.push(`调色板出现恐怖游戏绿：${hex}`);
  }
  for (const word of ['green', 'teal', 'cyan', 'emerald', 'olive', 'lime']) {
    // 只允许出现在否定从句里。出现在别处就是有人写反了。
    const inPalette = PALETTE_CLAUSE.toLowerCase().split('absolutely no green')[0] ?? '';
    if (inPalette.includes(word)) bad.push(`提示词的正面描述里出现了「${word}」`);
  }
  return bad;
}
