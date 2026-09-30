/**
 * 一次逃生的全部运行时状态。
 * ============================================================================
 * 这个文件回答「这游戏到底怎么玩」。
 *
 * ## 混合时钟
 *
 * 平静态（calm）沿用原作的设计：时间只在你动手时流逝。你可以在雷达前站一小时
 * 推敲那团回波，氧气一口不少。这让「思考」是免费的，而「行动」很贵。
 *
 * 警报态（alert）不一样。红点出现的那一刻 `mode` 切成 alert，秒表开始真的走。
 * 那东西在靠近，而你在舱的另一头。舱内走动第一次有了代价 ——
 * **你不能同时待在两个工位上**，这是整部作品唯一的恐惧引擎。
 *
 * ## 三条互相咬合的资源
 *
 *   氧气   —— 唯一的硬时钟，一切行动折算成呼吸
 *   电力   —— 雷达、摄像头、推进、洗涤器共用一块电池，你必须挑
 *   噪音   —— 你每做一件事都在向外面广播你的位置
 *
 * 噪音是三者里最狠的：它不消耗任何东西，但它决定了 alert 什么时候开始。
 */

import { Bus } from '@/core/events';
import { Flags } from '@/core/flags';
import { Xoshiro } from '@/core/rng';
import { clamp, clamp01, damp, lerp } from '@/core/util';
import { VitalsEngine } from '@/sim';
import type { DeathCause, Rng, SimContext } from '@/core/contract';
import type { SonarContact } from '@/render/sonar';

import {
  STATION_ORDER,
  canonicalStation,
  STATIONS,
  stationRef,
  type ClockMode,
  type LogTone,
  type PodLogLine,
  type RunPhase,
  type StationId,
} from '../types';
import {
  RECOMMENDED_CAPACITY,
  STARTING_STOCK,
  STORY_SUPPLY_IDS,
  supply,
  supplyBulk,
  type SupplyId,
} from '../content/supplies';
import { creature, isHarmless, sameCounter, sonarLabelOf, KIN_CN, DANGER_CN, ATTRACTOR_CN, counterLine, type CounterAction, type Creature, type CreatureId } from '../content/creatures';
import { ACT_COUNT, actAt } from '../content/acts';
import { hunterProfile, huntAct, type HunterProfile } from '../content/hunters';
import { legAt, ROUTE, TOTAL_DISTANCE, type Leg, type Wreck } from '../content/route';
import { buildFootagePrompt, type FootagePromptInput } from '../content/footage';
import type {WeaponId,CombatRecord} from './weapon-feedback';
import { directFootage, footageCacheKey, FOOTAGE_STATE_CN, type FootageDirection, type FootageState } from '../content/footage-director';
import { san01 } from '../content/sanity';
import { cacheFootageTell, sonarHides, trapFootageTell } from '../gen/traps';
import {
  authorFirstVolume,
  bearingTo,
  dist3,
  entryNode,
  exitNode,
  generateVolume,
  hazardOpen,
  identifyVolume,
  interiorFootageClause,
  markVisited,
  neighbors,
  nodeById,
  otherEnd,
  shiftVolume,
  shortestPath,
  volumeShadows,
  type Volume,
  type Vec3,
} from '../gen/volume';
import {
  doorsOf,
  faceBearing,
  lookDir,
  OBSTACLE_CN,
  spawnInRoom,
  POD_R,
  type CabinHit,
  type RoomDoor,
  type CabinHitKind,
} from '../gen/interior';
import { faunaOnTape, siteThreatOf } from '../gen/spawn';
import { collectMemory, currentHookGate, hookLine, type HookGate, type HookSnapshot } from '../gen/story';
import { Campaign, type CampaignChoice } from './campaign';
import { PilotMotion } from './pilot';
import { CAMPAIGN_STORY, OPENING_CALL } from '../content/campaign-story';
import type { AuthoredSite } from './authored-site';
import { buildRoom, type Eye, type RoomGeometry } from '../view/roomview';
import {
  fillPersonText,
  makeContainerMemory,
  noticeCombination,
  rollContainer,
  searchContainer,
  sealReadout,
  type ContainerMemory,
  type ContainerState,
  type CueStep,
  type SearchResult,
  type SearchTag,
} from '../content/containers';
import {
  ARM,
  acquireTarget,
  armAimHint,
  armAlive,
  armGrabbed,
  armOut,
  armPurgeCover,
  beginExtend,
  beginGrip,
  beginHaul,
  beginJam,
  blockExtend,
  blockPurgeArm,
  blockPurgeFire,
  blockRetract,
  blockRummage,
  blockWrench,
  gripCue,
  jettisonArm,
  newArm,
  snapArm,
  stepArm,
  wrenchChance,
  wrenchPull,
  type ArmBlock,
  type ArmConditions,
  type ArmState,
} from './manipulator';
import {
  corrupt,
  GHOST_CALLS,
  HALLUCINATIONS,
  RADIO_TOPICS,
  replyTier,
  type RadioSpeaker,
  type RadioTopic,
} from '../content/radio';

/** 一口气的真实秒数。警报态用它把秒换算成呼吸 */
const SECONDS_PER_BREATH = 4.2;

/** 站点上，东西在你头顶待多久就会自己找上来（呼吸数） */
const SITE_PATIENCE = 16;
/** 站点上闲着几口气，万斯会就本关钩子再催一次。要比威胁醒来早 */
const HOOK_BREATHS = 10;
/** 盯着雷达不动几秒，也催。思考免费，但不能无限期没有下一句 */
const HOOK_IDLE_SEC = 22;

/**
 * 起步那一下，你只腾出一只手 —— 另一只在推进杆上。这是那只手抓东西的顺序。
 *
 * 不在表里的（照片、婚戒、录音带）排在最后。它们值钱，也许比命值钱，
 * 但那是坐下来之后才想得起来的事。手比人快。
 */
/**
 * 起步时膝盖上能压多少格。
 *
 * 这不是仁慈，是物理：一只手在推进杆上，另一只手能抱住的就这么多。
 * 它也是容量上限的安全阀 —— 没有它，「翻到满」会直接变成「下一段窒息」，
 * 而取舍就不再是取舍，是惩罚。2 格：够一支滤芯加一卷胶带，不够一块钢板。
 */
const LAP_BULK = 2;

const HUG_RANK: readonly SupplyId[] = [
  'sup.filter',
  'sup.o2candle',
  'sup.sealant',
  'sup.plate',
  'sup.pump',
  'sup.cell',
  'sup.fuse',
  'sup.cutter',
  'sup.ration',
  'sup.stim',
];

/** 越靠前越先被抓住。同名次里小件优先 —— 一只手能合上才算抓住 */
function hugRank(id: SupplyId): number {
  const s = HUG_RANK.indexOf(id);
  return (s < 0 ? -HUG_RANK.length : -s) - supplyBulk(id) * 0.01;
}

/**
 * 声音时间轴走完之后，再等这么久才把那句话放出去。
 *
 * 不是零：最后一下的尾音得先落下去。也不能太长 —— 超过一秒玩家会以为卡了。
 * 0.35 秒刚好是「听完了，然后才反应过来」的那个间隔。
 */
const TRACK_TAIL = 0.35;

/** breach tag：进水速率永久上调的那一档 */
const BREACH_LEAK = 0.05;
/** spill tag：每秒吃掉的舱体、每秒抬高的进水，以及每秒把回路烤老多少 */
const SPILL_HULL_PER_SEC = 0.006;
const SPILL_LEAK_PER_SEC = 0.0015;
const SPILL_ARM_WEAR = 1.1;
/** lure tag：每秒往外漏多少噪音。持续声源，不是脉冲 */
const LURE_NOISE_PER_SEC = 0.055;

/**
 * 一个声音在舱外的位置。
 *
 * 模拟层只说事实（多远、偏哪边、这间房多大），怎么把它变成滤波器和混响
 * 是音频层的事。这一层不认识 WebAudio。
 */
export interface CuePlacement {
  /** 声源到舱的距离（米） */
  dist: number;
  /** 声像 −1（左）..1（右） */
  pan: number;
  /** 这一间房的声学尺度（米） */
  room: number;
  flooded: boolean;
}

/** 一爪的声音时间轴需要知道的上下文。只用来把顶替的 cue 换成真的 */
interface TrackContext {
  /** 轴走完之后要说的那句话 */
  line: string;
  tone: LogTone;
  /** 这是本次伸出的第几爪（0 起）。决定电机音有多疲 */
  claw: number;
  /** 这一爪是这只箱子的第一爪 —— 也就是撕封条的那一爪 */
  firstPass: boolean;
  /** 这一爪掏出了纸质遗物（照片、信） */
  paper: boolean;
  /** 这只箱子是水泥压载格 */
  concrete: boolean;
}

/** 推进器三档的单次脉冲位移（米）与噪音 */
const THROTTLE = [
  { m: 0, noise: 0, cost: 0, label: '停机' },
  { m: 60, noise: 0.22, cost: 3, label: '一档 · 蠕动' },
  { m: 140, noise: 0.5, cost: 4, label: '二档 · 巡航' },
  { m: 260, noise: 0.92, cost: 6, label: '三档 · 全速' },
] as const;

/** 近场一脉冲走多远。房间只有十几米，不能用航渡那一档六十米 */
const SITE_PULSE = [0, 4.5, 7, 11] as const;

export const CAMERA_DRIVE_METERS = 0.75;
export type CameraDriveAction = 'left' | 'right' | 'up' | 'down' | 'center' | 'forward' | 'back';
const DRIVE_AXES = ['x', 'y', 'z'] as const;

/** 驾驶采用保守艇体盒；门洞扣除艇体半径，不使用旧 trace 的门外容差。 */
function fitsDriveDoor(p: Vec3, door: RoomDoor): boolean {
  const axes = DRIVE_AXES.filter((_, i) => i !== door.axis);
  const radius = POD_R * 0.85;
  return Math.abs(p[axes[0]!] - door.pos[axes[0]!]) <= door.halfW - radius
    && Math.abs(p[axes[1]!] - door.pos[axes[1]!]) <= door.halfH - radius;
}

/** 连续线段扫障碍，门边界细分。只有中心实际抵达门平面才返回 door。 */
export function traceDriveCabin(vol: Volume, node: Volume['nodes'][number], from: Vec3, dir: Vec3, distance: number, closedDoors: ReadonlySet<string> = new Set()): CabinHit {
  const point = (t: number): Vec3 => ({ x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t });
  let obstacleT = Infinity;
  let obstacle: CabinHit['obstacle'];
  for (const o of node.obstacles) {
    let enter = -Infinity;
    let exit = Infinity;
    for (const axis of DRIVE_AXES) {
      const radius = o.size[axis] / 2 + POD_R * 0.75;
      const lo = o.pos[axis] - radius;
      const hi = o.pos[axis] + radius;
      if (Math.abs(dir[axis]) < 1e-10) {
        if (from[axis] <= lo || from[axis] >= hi) { exit = -Infinity; break; }
      } else {
        const a = (lo - from[axis]) / dir[axis];
        const b = (hi - from[axis]) / dir[axis];
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (exit > Math.max(0, enter) && enter <= distance && Math.max(0, enter) < obstacleT) {
      obstacleT = Math.max(0, enter);
      obstacle = o.kind as CabinHit['obstacle'];
    }
  }
  const doors = doorsOf(vol, node);
  const steps = Math.max(1, Math.ceil(distance / 0.08));
  let previous = 0;
  for (let i = 1; i <= steps; i++) {
    const t = distance * i / steps;
    const q = point(t);
    let crossed: RoomDoor | undefined;
    let crossingT = Infinity;
    let wall = false;
    let closedTo: string | undefined;
    for (const [index, axis] of DRIVE_AXES.entries()) {
      const half = node.size[axis] / 2;
      if (Math.abs(q[axis]) <= half - POD_R * 0.85) continue;
      const sign = q[axis] >= 0 ? 1 : -1;
      const door = doors.find(d => d.axis === index && d.sign === sign && fitsDriveDoor(q, d));
      if (!door) { wall = true; break; }
      if (closedDoors.has(door.to)) { wall = true; closedTo = door.to; break; }
      if (q[axis] * sign >= half && dir[axis] * sign > 0) {
        const planeT = (door.pos[axis] - from[axis]) / dir[axis];
        if (planeT >= 0 && planeT < crossingT && fitsDriveDoor(point(planeT), door)) {
          crossed = door;
          crossingT = planeT;
        }
      }
    }
    if (obstacleT <= Math.min(t, crossingT)) {
      const safe = Math.max(0, obstacleT - 0.001);
      return { kind: 'obstacle', pos: point(safe), t: safe, obstacle };
    }
    if (wall) return { kind: 'wall', pos: point(previous), t: previous, to: closedTo };
    if (crossed) return { kind: 'door', pos: point(Math.max(0, crossingT - 0.001)), t: crossingT, to: crossed.to };
    previous = t;
  }
  return { kind: 'free', pos: point(distance), t: distance };
}

/**
 * 近场阴影地图里的一个扇区。
 *
 * 它描述的是「这个方位上，从 near 到 far 这一段被东西占着」。
 * 二十八个扇区连起来就是一张粗糙的平面图 —— 没有细节，只有明暗，
 * 正好是一台坏了一半的回声雷达在近距离上能给出的东西。
 */
export interface SiteShadow {
  id: number;
  bearing: number;
  arc: number;
  /** 阴影的内缘，0 = 贴着舱体，1 = 屏幕边缘 */
  near: number;
  far: number;
  density: number;
}

/** 全息准星打在什么上 */
export interface Sighting {
  kind: CabinHitKind;
  line: string;
}

/**
 * 摄像头实景上要贴的一条标注。
 *
 * 实景画面由 view 层的房间渲染器画，它只按 obstacleId 认这些标注 ——
 * 于是「玩家在全息图上看见的那只箱子」和「探照灯照出来的那只箱子」
 * 是同一只，不需要两边各描一遍。
 *
 * seal 只在有光的时候有值：封条读数是灯的功劳，不是雷达的。
 */
export interface RoomMark {
  obstacleId: string;
  seal?: string;
  label?: string;
  searched?: number;
  passes?: number;
  aimed?: boolean;
  aimPoint?: Vec3;
}

/** 机械手现在瞄着的那一只 */
export interface ArmTarget {
  obstacleId: string;
  /** 本次操作瞄准的箱面位置。 */
  pos: Vec3;
  dist: number;
  offAxis: number;
  /** 当前云台到操作点的有方向修正提示 */
  aimHint: string;
  container: ContainerState;
}

export type ThreatPhase = 'contact' | 'identified' | 'repelled' | 'struck';

export interface ThreatRuntime {
  encounter: number;
  hunter: HunterProfile;
  behavior: 'investigate' | 'stalk' | 'warning';
  warningLeft: number;
  cueLeft: number;
  quietFor: number;
  creature: Creature;
  /** 相对舱首的方位，弧度。0 = 正前 */
  bearing: number;
  /** 归一化距离 1 = 雷达边缘，0 = 贴上舱体 */
  range: number;
  phase: ThreatPhase;
  /** 剩余秒数 */
  fuse: number;
  fuseMax: number;
  /** 摄像头里看清了没有 */
  known: boolean;
  /** 摄像头对准它的累计时长，用于「看清」判定 */
  lookedAt: number;
  /** 用错了几次应对 */
  mistakes: number;
  /** 这一次是不是幻觉 */
  phantom: boolean;
  /** 驱离/命中之后，红点在这个时刻从雷达上消失。null = 还在路上 */
  clearAt: number | null;
}

export interface RadioMessage {
  speaker: RadioSpeaker;
  text: string;
  at: number;
}

export type RunOutcome =
  | { kind: 'alive' }
  | { kind: 'dead'; cause: DeathCause; line: string }
  | { kind: 'escaped' };

// ============================================================================
// 摄影机
// ============================================================================

/**
 * 那台摄像机的状态。
 *
 * 舱外的镜头**不是实时的**。它是一台胶片机：你按下快门，它曝光一段，
 * 然后你得等冲洗。中间这两段等待就是这个机制的全部玩法 ——
 * 曝光必须守在机位前（走开就拉成一条糊线），冲洗不用。
 *
 *   idle       待机。屏上只有监视回路那点雪花
 *   exposing   曝光中。扣电扣气，实时走秒，人不能离开摄像头
 *   developing 冲洗中。等外面那台机器，实时走秒，人可以去干别的
 *   ready      冲出来了，可以放
 *   failed     这一卷废了。屏幕回落到监视回路
 */
export type ShotPhase = 'idle' | 'exposing' | 'developing' | 'ready' | 'failed';
export type ShotPurpose = 'identify' | 'survey' | 'reshoot';

export interface ShotRuntime {
  sensorFrames?:string[];
  sensorSampleLeft?:number;
  siteEvidence?:unknown;
  pendingResult?:{ok:boolean;reason?:string;creatureMissing?:boolean;promptOnly?:boolean};
  capture?: FootagePromptInput;
  keyframe?: string;
  cacheKey?: string;
  phase: ShotPhase;
  /** 航段标识；内容缓存键另存于 cacheKey。 */
  legId: string;
  /** 曝光剩余秒数 */
  exposeLeft: number;
  exposeMax: number;
  /** 冲洗已经等了多少秒 */
  developed: number;
  /** 冲洗超时的秒数 */
  developMax: number;
  /** 废了的原因，直接是游戏内的话 */
  reason: string;
  /** 曝光期间那个东西进过取景框吗。进过的话冲出来就等于看清了 */
  caught: boolean;
  /** 屏幕现在放的是片子还是监视回路 */
  viewing: boolean;
  /**
   * 每次开拍 +1。
   *
   * 冲洗是异步的，而玩家可能在等的过程中离站、又拍了一卷、或者死了。
   * 回调回来的时候必须能判断「这个结果还是我要的那一卷吗」，
   * 所以用一个单调递增的号，而不是相信闭包。
   */
  token: number;
  purpose: ShotPurpose;
}

/**
 * 交给表现层去跑的一次冲洗。
 *
 * 模拟层只负责把这个东西扔出去，**永远不碰网络**。无头验证器不挂 sink，
 * 于是 `beginShoot()` 在那里会立刻走到 failed —— 这正是「完全离线也能通关」
 * 的那条代码路径，顺带让 tools/pod-playthrough.ts 不依赖任何网络。
 */
export interface FootageRequest {
  keyframe?: string;
  cacheKey: string;
  /** 缓存键。同一段不该重复生成 —— 每次调用都是真金白银 */
  legId: string;
  /** content/footage.ts 拼好的提示词 */
  prompt: string;
  /**
   * 不含怪物的那一版提示词。
   *
   * 上游的内容审核会驳回一部分怪物描述（实拍见 net/video.ts 的 'filtered'）。
   * 被驳回时表现层会拿这一版重试一次：**环境总比什么都没有好**，
   * 而「那个东西刚好没拍进这一卷」在世界观里毫无破绽。
   */
  fallbackPrompt: string;
  /** 开拍序号，回调时要带回来 */
  token: number;
  /**
   * 冲洗完了叫这个。ok=false 时 reason 必须是一句游戏内的话。
   *
   * creatureMissing = 用 fallbackPrompt 重试成功了，所以这一卷里没有那个东西。
   * sim 会据此取消「看清」——拍到了才算看清，这条不能含糊。
   */
  settle: (token: number, ok: boolean, reason?: string, creatureMissing?: boolean, promptOnly?: boolean) => void;
}

/** 冲好、进了片盒的一卷。分析台读的是这个，不是摄像头上正在放的那一帧 */
export interface TapeRecord {
  simulationReport?:string[];
  /** Actual successive camera frames; UI plays these as a labelled local backup. */
  sensorFrames?:string[];
  siteEvidence?:unknown;
  /** Local five-second sensor exposure; never an AI video success flag. */
  sensorEvidence?:boolean;
  videoResult?: 'video' | 'failed' | 'prompt';
  videoError?: string;
  keyframe?: string;
  ready?: boolean;
  direction?: FootageDirection;
  cacheKey?: string;
  prompt?: string;
  fallbackPrompt?: string;
  id: string;
  legId: string;
  siteName: string;
  purpose: ShotPurpose;
  atBreath: number;
  fauna: CreatureId[];
  caughtThreat: CreatureId | null;
  creatureMissing: boolean;
  analyzed: boolean;
  report: string[];
}

export const TAPE_PURPOSE_CN: Readonly<Record<ShotPurpose, string>> = {
  identify: '近场',
  survey: '出口外',
  reshoot: '复拍',
};

/** 曝光多少秒。片子本身大约五秒；多出来的是快门和伺服 */
const EXPOSE_SECONDS = 5;
/** 冲洗最多等多久。探到的端到端是 ~20 秒，留三倍余量 */
const DEVELOP_TIMEOUT = 100;
/** 曝光一次扣多少电。快门、伺服和一整段探照灯 */
const SHOT_POWER = 0.06;
/** 曝光一次折算几口气 */
const SHOT_BREATHS = 5;
/** 分析台上卷一卷：读片机灯 + 几口气的守机 */
const ANALYZE_BREATHS = 6;
const ANALYZE_POWER = 0.045;

export class PodRun {
  gmLevelSession=false;
  readonly pilot=new PilotMotion();
  authoredSite:AuthoredSite|null=null;
  createAuthoredSite:((index:number)=>AuthoredSite)|null=null;
  authoredSiteError='';
  ensureAuthoredSite():void {
    if(this.phase!=='site'||!this.createAuthoredSite||this.authoredSiteError)return;
    if(this.authoredSite?.index===this.legIndex)return;
    this.authoredSite?.dispose();this.authoredSite=null;
    try {this.authoredSite=this.createAuthoredSite(this.legIndex);}
    catch(error){
      this.authoredSiteError=`设施 ${this.legIndex+1} 加载失败，请刷新重试。`;
      console.error('[authored-site]',error);this.pushLog(this.authoredSiteError,'bad');
    }
  }
  navDriveEngaged=false;
  private heaveInput=0;
  private heaveUntil=0;
  private transitElevation=0;
  holdHeave(value:number):void {this.heaveInput=clamp(value,-1,1);this.heaveUntil=this.clock+.12;}
  private pilotInput={thrust:0,yaw:0,pitch:0,brake:false};
  private pilotInputUntil=0;
  private pilotSoundAt=0;
  private pilotImpactUntil=0;
  private continuousStep=false;
  holdPilot(thrust:number,yaw:number,pitch:number,brake=false):void {
    this.pilotInput={thrust:clamp(thrust,-1,1),yaw:clamp(yaw,-1,1),pitch:clamp(pitch,-1,1),brake};
    this.pilotInputUntil=this.clock+.12;
  }
  private tickPilot(dt:number):void {
    if(this.driveBlock || (this.at!=='camera' && this.at!=='nav')) {this.pilot.stop();return;}
    const input=this.clock<this.pilotInputUntil?this.pilotInput:{thrust:0,yaw:0,pitch:0,brake:false};
    if(!this.authoredSite&&this.clock<this.pilotImpactUntil){this.pilot.stop();return;}
    const motion=this.pilot.step(dt,input.thrust,input.yaw,input.pitch,input.brake,this.clock<this.heaveUntil?this.heaveInput:0);
    if(Math.abs(motion.vertical)>.00001){
      if(this.phase==='site'){
        if(!this.authoredSite?.moveVertical?.(motion.vertical))this.pilot.verticalSpeed=0;
      }else this.transitElevation=clamp(this.transitElevation+motion.vertical,-40,40);
      this.power=clamp01(this.power-Math.abs(motion.vertical)*.001);
    }
    this.heading=this.authoredSite?.turn?.(motion.yaw)??(this.heading+motion.yaw+360)%360;
    this.pitch=clamp(this.pitch+motion.pitch,-65,65);
    if(Math.abs(motion.distance)<.00001)return;
    if(this.clock>=this.pilotSoundAt){this.onCue?.('hull.groan',.10+Math.abs(this.pilot.speed)*.12);this.pilotSoundAt=this.clock+2.5;}
    if(this.phase==='site') {
      this.continuousStep=true;
      try{this.moveInVolume(Math.abs(motion.distance),Math.sign(motion.distance));}
      finally{this.continuousStep=false;}
    } else {
      const distance=motion.distance*10;
      if(!this.onCourse && Math.abs(distance)>.001){this.collide(Math.abs(distance));this.pilot.stop();this.pilotImpactUntil=this.clock+1.2;return;}
      this.traveled=clamp(this.traveled+distance,0,this.leg.length);
      const cost=Math.abs(distance)/60;
      this.power=clamp01(this.power-cost*.006);this.addNoise(cost*.12);
      if(this.mode==='calm')this.spend(cost*3,.3);
      if(this.traveled>=this.leg.length){this.pilot.stop();this.arrive();}
    }
  }
  readonly campaign = new Campaign();
  openingReceived=false;
  openingScanned=false;
  storyCaption='';
  storyCaptionLeft=0;
  get openingGuide():string|null {
    if(this.legIndex!==0 || this.campaign.has(0,'film')) return null;
    if(!this.openingReceived) return this.at==='radio'?'按 1 接听万斯的呼叫。':'左侧无线电正在呼叫。按 3 前往，再按 1 接听。';
    if(this.phase==='site') return this.shot.phase==='exposing'?'保持机位，等待曝光完成。'
      :this.shot.phase==='developing'?'正在显影。完成后按 5 前往分析台读片。'
      :this.unanalyzedCount>0?'录像已回收。按 5 前往分析台，分析本关胶片。'
      :this.authoredSite?.objective ?? '已到坠落接驳港。沿岸电缆找到维修湾，恢复港内控制电源。';
    if(!this.openingScanned) return this.at==='nav'?'按 2 开启主动声纳，再按 3 发出常规脉冲。':'摄像台左侧是声纳仪表。按 6 前往，再按 2 开机、按 3 扫描。';
    return this.at==='nav'?`将船头对准声呐目标，点击「接通推进」。距设施 ${this.remaining.toFixed(0)} 米。`
      :'按 6 返回领航台，沿目标回波航行；到站后拍摄事故现场。';
  }

  chooseTransmission(choice:CampaignChoice):boolean {
    const ready=this.outcome.kind==='alive' && this.legIndex===6 && this.canDepart;
    if(!this.campaign.choose(choice,ready)) return false;
    this.pushLog(`最后的指令已锁定：${this.campaign.ending!.title}。回到推进台离站。`,'good');
    this.onCue?.('knowledge.gain',.7);
    return true;
  }
  readonly bus = new Bus();
  readonly flags: Flags;
  readonly rng: Rng;
  readonly vitals: VitalsEngine;
  readonly seed: number;

  // --- 时钟 ---------------------------------------------------------------
  mode: ClockMode = 'calm';
  breaths = 0;
  /** 真实时间，只用于动画与警报 */
  clock = 0;
  private breathAcc = 0;

  // --- 舱内空间 ------------------------------------------------------------
  /** 视角在舱内的位置 0..1（0 = 舱尾生命维持，1 = 舱首推进台） */
  camX = 0.34;
  camTargetX = 0.34;
  /** 正在使用的工位。null = 站在过道上 */
  at: StationId | null = null;
  /** 推近/拉远动画 0..1 */
  zoom = 0;

  // --- 舱体 ---------------------------------------------------------------
  power = 0.88;
  hull = 0.71;
  /** 水位 0..1，到 1 淹死 */
  flood = 0.06;
  /** 每呼吸的进水量 */
  leak = 0.0015;
  /** 洗涤器剩余寿命 0..1 */
  scrubber = 0.52;
  /** 拉了总闸 */
  blackout = false;
  /**
   * 舱内空气温度（°C）。
   *
   * 这不是海水温度 —— 你在一个密封的铁罐子里，罐子里有一台电加热器。
   * 舱外 1300 米处是 5°C，但只要还有电，舱内维持在十九度上下。
   *
   * 于是「冷」不再是一条谁都躲不掉的隐形计时器，而是两个具体决定的后果：
   *   拉总闸装死 —— 加热器跟着停，铁壳保不住多久的热；
   *   舱里进水   —— 冷水直接贴着你的腿，加热器烧不过它。
   * 两件事都是玩家自己选的，这才配当死因。
   */
  cabinTemp = 18.5;

  // --- 噪音 ---------------------------------------------------------------
  noise = 0.05;
  /** 主动声纳换能器总电源。被动阵列不依赖它。 */
  activeSonarEnabled = false;

  // --- 航行 ---------------------------------------------------------------
  legIndex = 0;
  traveled = 0;
  /** 航渡中还是已经停在站点上。见 types.ts 的 RunPhase */
  phase: RunPhase = 'transit';
  /** 到站之后过了几口气。站点上的东西不会无限期等你 */
  siteBreaths = 0;
  /** 到站后没有推进钩子的真实秒数。思考免费，万斯不免费 */
  private siteIdleSec = 0;
  /** 本关已经催过的门，同一扇只说一次 */
  private hookNudged = new Set<string>();
  /** 玩家设定的航向，度 */
  heading = 72;
  /** 潜深角，度。正 = 下潜。线框是三维的，竖直缝只看航向对不上 */
  pitch = 0;
  throttle = 0;
  /** 撞了几次 */
  collisions = 0;

  // --- 舱外设备 ------------------------------------------------------------
  lamp = false;
  /** 摄像头云台，相对舱首的弧度 */
  camPan = 0;
  camTilt = 0;
  camZoom = 1;
  /** 冷焰照明剩余秒数 */
  flareLeft = 0;

  /**
   * 翻箱留下的、还在走的后果。单位全是真实秒。
   *
   * 这三条是 SearchTag 里唯一需要「持续」的：照明、泄漏、外泄噪音。
   * 其余七条要么是瞬间结算（breach / wake / contact / keepsake / quiet），
   * 要么活在 ArmState 里（arm.jam / grabbed）—— 后两条是机械手的事，
   * 不该由舱体记着。
   */
  readonly fx = {
    /** 整间房被照亮的剩余秒数。这段时间里不用探照灯也看得见 */
    flash: 0,
    /** 泄漏物还在流的剩余秒数。持续掉 hull，并且在腐蚀那条臂 */
    spill: 0,
    /** 噪音还在往外漏的剩余秒数。威胁系统当持续声源处理 */
    lure: 0,
  };

  /** 摄影机。见文件上方 ShotRuntime 的说明 */
  readonly shot: ShotRuntime = {
    phase: 'idle',
    legId: '',
    exposeLeft: 0,
    exposeMax: EXPOSE_SECONDS,
    developed: 0,
    developMax: DEVELOP_TIMEOUT,
    reason: '',
    caught: false,
    viewing: false,
    token: 0,
    purpose: 'identify',
  };

  /** 冲好的片子。离开摄像头也不会丢 —— 分析台读片盒 */
  readonly tapes: TapeRecord[] = [];
  tapeCursor = 0;
  labVideoExpanded = false;
  /** 分析台上拆过的造物。再碰到同一张脸，报告会写「档案里有过」 */
  readonly filed = new Set<CreatureId>();

  // --- 雷达 ---------------------------------------------------------------
  contacts: SonarContact[] = [];
  /** 到站之后的近场阴影地图。航渡阶段是空的 */
  siteShadow: SiteShadow[] = [];
  /** 站点上废墟在近场图里的方位。开局随机一次，之后不动 */
  private siteWreckBearing = 0;
  /** 上一次脉冲时的行程，用来判断「这张图是不是过期了」 */
  sweepAtDistance = -1e9;
  sweepPower = 0;
  /** 每次脉冲 +1，表现层拿它判断「要不要放扫描动画」 */
  sweepId = 0;

  /**
   * 已经拼上的三维线框。下标对齐 `legIndex`。
   * 开局只有第一关；后六关在冲洗「下一段」时推进来。
   */
  readonly chart: Volume[] = [];
  /** 当前关里舱停在哪个节点 */
  volumeAt = '';
  /** 当前房间内部的舱位（相对房间中心，米） */
  cabinPos = { x: 0, y: 0, z: 0 };
  /** 正在充电。充电时噪音很大，而且你不能同时推进 */
  charging = false;

  // --- 物资 ---------------------------------------------------------------
  readonly stock = new Map<SupplyId, number>();
  /** 已经捞过的次数 */
  readonly salvaged = new Map<string, number>();
  /**
   * 捞上来但没地方放的东西。
   *
   * 逃生舱的储物格是有数的（BULK_CAP）。格子满了之后爪子照样能捞，
   * 但捞上来的东西只能摊在打捞台的台面上 —— 它既不能用，也不算在库里。
   * 玩家必须当场回答那个问题：扔掉格子里的哪一件，还是把这件倒出泄压口。
   *
   * 这里刻意不做自动丢弃。静默丢弃会让「捞到了什么」变成一句空话。
   */
  readonly bench: { id: SupplyId; n: number }[] = [];

  // --- 机械手与集装箱 --------------------------------------------------------
  /**
   * 这一关里所有货箱的状态，按障碍 id 索引。
   *
   * 懒加载：玩家走进一间房、摄像头第一次够到某只箱子的时候才掷。
   * 掷用的是一条只跟种子和 id 有关的子流，所以同一个种子里同一只箱子
   * 永远是同一只箱子 —— 不管玩家是第几个走进这间房的。
   */
  readonly containers = new Map<string, ContainerState>();
  /** 已翻开的箱内物资，收臂完成前不属于艇内库存。 */
  readonly containerItems = new Map<string, { id: SupplyId; n: number }[]>();
  searchedBox: string | null = null;
  selectedBoxItem: SupplyId | null = null;
  private armCargo: { box: string; id: SupplyId } | null = null;

  get boxItems(): readonly { id: SupplyId; n: number }[] {
    return this.searchedBox ? this.containerItems.get(this.searchedBox) ?? [] : [];
  }

  selectBoxItem(id: SupplyId): void {
    if (this.arm.phase !== 'hauling' && this.boxItems.some(item => item.id === id && item.n > 0)) this.selectedBoxItem = id;
  }
  arm: ArmState = newArm();
  /** 只跟种子有关的箱子子流。fork 不动自身状态，所以按 id 取永远可重现 */
  private readonly containerRng: Rng;
  /**
   * 跨箱记忆。一局一个人 —— 照片、信、工牌、戒指全部指向他。
   *
   * 开局掷一次就不再变。纯 JSON，可以直接进存档。
   * 它同时是所有 `{name}` 占位符的解答：pushLog 会拿它替换。
   */
  readonly memory: ContainerMemory;
  /** 这一爪还没播完的声音时间轴。播完了才说话 —— 耳朵先知道，眼睛后确认 */
  private cueQueue: { at: number; cue: string; gain: number; space: boolean }[] = [];
  private cueClock = 0;
  /** 时间轴走完之后要说的那一句。它在 cueQueue 清空的那一帧才进日志 */
  private pendingLine: { text: string; tone: LogTone; after: number } | null = null;
  /** 那句话之后还要说的事（遗物、组合结论、下一步）。顺序就是意识到的顺序 */
  private afterLine: (() => void) | null = null;
  /** 这一爪掏出来的是遗物。真正的展示排在那句话之后 */
  private keepsakePending = false;
  /** 这一间的几何。障碍不会变，所以按房间缓存，不用每帧重建 */
  private geoCache: { key: string; geo: RoomGeometry } | null = null;

  // --- 威胁 ---------------------------------------------------------------
  threat: ThreatRuntime | null = null;
  /** Recent disturbance accumulates independently of the visible noise gauge. */
  suspicion = 0;
  huntRecoveryUntil = 0;
  private huntActIndex = -1;
  private encounterSerial = 0;
  private readonly footageRepeats = new Map<string, number>();
  /** 本段已经触发过的威胁拍子 */
  private firedBeats = new Set<string>();

  // --- 叙事 ---------------------------------------------------------------
  corruption = 0;
  /** 待接听的通讯 */
  readonly pending: RadioMessage[] = [];
  readonly heard: RadioMessage[] = [];
  readonly askedOnce = new Set<string>();
  /** 耳塞塞着的时候听不见无线电，但也听不见幻听 */
  earsPlugged = false;
  private hallucTimer = 22;
  private ghostTimer = 65;

  readonly log: PodLogLine[] = [];
  outcome: RunOutcome = { kind: 'alive' };

  /** 表现层挂钩 */
  /**
   * 放一个音。
   *
   * 第三个参数是可选的空间信息，**不传就和以前完全一样**。舱内那一百多处
   * 调用（继电器、呼吸、面板、船体）一个都不该带位置：它们本来就在你脑袋旁边，
   * 给它们加距离衰减只会让界面糊掉。带位置的只有摄像头画面那一侧发生的事。
   */
  onCue: ((cue: string, gain?: number, space?: CuePlacement) => void) | null = null;
  onShake: ((amount: number) => void) | null = null;
  /**
   * 冲洗挂钩。表现层装上它才会真的去生成视频。
   *
   * 留 null 的环境（无头验证器、平衡脚本、断网的浏览器）拍出来的每一卷
   * 都会废掉，而废掉是有完整回落的 —— 游戏照样通关。
   */
  footageSink: ((req: FootageRequest) => void) | null = null;
  videoStatus = '本地底片 · 未连接视频服务';
  /** View-owned synchronous shutter snapshot; no DOM dependency in simulation. */
  captureKeyframe: (() => string) | null = null;
  /** Local recording sampler (512x360 JPEG supplied by presentation). Independent of API keyframe. */
  captureSensorFrame: (() => string) | null = null;
  /** First authored harbor save barrier. Null allows headless callers to depart. */
  onBeforeDepart: (() => boolean) | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.rng = new Xoshiro(this.seed, 'pod');
    this.containerRng = this.rng.fork('container');
    // 那个人在开局就定下来了，在玩家见到第一只箱子之前。他已经死了很久
    this.memory = makeContainerMemory(this.containerRng.fork('person'));
    this.flags = new Flags(this.bus, () => this.breaths);
    this.vitals = new VitalsEngine({ bus: this.bus, oxygenMax: 1450 });
    // restore() 是加算。独自接近失联基地，恐惧从基线略微抬高。
    this.vitals.restore({ fear: 10 });

    for (const [id, n] of STARTING_STOCK) this.stock.set(id, n);
    this.heading = ROUTE[0]!.safeHeading;
    const first = authorFirstVolume(this.seed, this.vitals.vitals.san);
    this.chart.push(first.volume);
    this.volumeAt = entryNode(first.volume).id;

    this.pushLog('公司调查艇三号 · 正在接近坠落接驳港。内部电池供电，调度员万斯正在呼叫。', 'system');
    this.pushLog('事故区域结构不稳。碰撞、失电和艇体破损都可能致命；低速进港，优先恢复岸电。', 'bad');
    this.pushLog('接听万斯，沿声呐回波抵港，再跟随岸电缆寻找维修湾。现场底片须完成曝光、显影后送到分析台核验。', 'system');
    this.beginLeg(0);
  }

  // ==========================================================================
  // 查询
  // ==========================================================================

  get leg(): Leg {
    return legAt(this.legIndex);
  }

  get volume(): Volume | null {
    return this.chart[this.legIndex] ?? null;
  }

  get san(): number {
    return this.vitals.vitals.san;
  }

  /** 这一关的片子有没有被分析过。没分析过，线框上没有名字 */
  get volumeKnown(): boolean {
    return this.volume?.identified === true;
  }

  get atExit(): boolean {
    if(this.authoredSite)return this.authoredSite.complete;
    const v = this.volume;
    return !!v && this.volumeAt === exitNode(v).id;
  }

  /** 冲洗「下一段」之后拼上、但还没走进去的那一卷 */
  get nextVolume(): Volume | null {
    if (this.legIndex >= ACT_COUNT - 1) return null;
    return this.chart[this.legIndex + 1] ?? null;
  }

  get selectedTape(): TapeRecord | null {
    if (!this.tapes.length) return null;
    return this.tapes[this.tapeCursor] ?? this.tapes[this.tapes.length - 1]!;
  }

  get unanalyzedCount(): number {
    return this.tapes.filter((t) => !t.analyzed).length;
  }

  get canSurvey(): boolean {
    return false;
  }

  get canDepart(): boolean {
    if (this.phase !== 'site' || !this.powered) return false;
    if(this.authoredSite) return this.authoredSite.complete && this.campaign.has(this.legIndex,'film');
    const v = this.volume;
    if (!v || !v.identified || !this.atExit) return false;
    if(v.hookNode && !v.visited.includes(v.hookNode)) return false;
    const lock = v.locks[0];
    if (lock && !lock.solved) return false;
    return true;
  }

  /** 出发键上的短提示。万斯的完整催促走无线电，不写在按钮上 */
  get departHint(): string {
    if (this.canDepart) return this.legIndex >= ACT_COUNT - 1 ? '进入电梯' : '驶向下一段';
    if(this.authoredSite) return this.campaign.has(this.legIndex,'film')?'完成设施任务并操作出口':'先拍摄并分析本关录像';
    if (!this.volumeKnown) return '先分析第一卷';
    const gate = this.hookGate;
    if (gate === 'identify') return '先拍、再分析';
    if (gate === 'visit-hook') return '万斯要的那块';
    if (gate === 'solve-lock') return '门还锁着';
    if (!this.atExit) return '未到出口';
    return '未完成';
  }

  /** 准星打在墙上、障碍上，还是开口上 */
  get sighting(): Sighting {
    if(this.authoredSite)return {kind:'free',line:this.authoredSite.hint};
    const v = this.volume;
    if (!v || !this.volumeAt) return { kind: 'free', line: '' };
    const here = nodeById(v, this.volumeAt);
    const hit = traceDriveCabin(v, here, this.cabinPos, lookDir(this.heading, this.pitch), 36);
    if (hit.kind === 'obstacle') {
      const name = hit.obstacle ? OBSTACLE_CN[hit.obstacle] : '障碍';
      return { kind: 'obstacle', line: name };
    }
    if (hit.kind === 'wall') return { kind: 'wall', line: '舱壁' };
    if (hit.kind === 'door') return { kind: 'door', line: '开口对准' };
    return { kind: 'free', line: '空水' };
  }

  private settleCabin(fromId: string | null): void {
    const v = this.volume;
    if (!v || !this.volumeAt) return;
    const here = nodeById(v, this.volumeAt);
    const back = fromId ? doorsOf(v, here).find((d) => d.to === fromId) ?? null : null;
    this.cabinPos = spawnInRoom(here, back);
    if (back) {
      const b = faceBearing(this.cabinPos, { x: 0, y: 0, z: 0 });
      this.heading = Math.round(b.heading);
      this.pitch = Math.round(b.pitch);
    } else {
      this.heading = 0;
      this.pitch = 0;
    }
  }

  get hookGate(): HookGate | null {
    const snap = this.hookSnapshot();
    return snap ? currentHookGate(snap) : null;
  }

  private hookSnapshot(): HookSnapshot | null {
    const v = this.volume;
    if (!v || this.phase !== 'site') return null;
    return {
      story: v.story,
      identified: v.identified,
      hookVisited: !v.hookNode || v.visited.includes(v.hookNode),
      hasLock: v.locks.length > 0,
      lockOpen: v.locks.every((l) => l.solved),
      atExit: this.atExit,
      surveyedNext: true,
      lastAct: this.legIndex >= ACT_COUNT - 1,
    };
  }

  /**
   * 卡住时万斯再要一次他进关时要过的那件东西。
   * 同一扇门只催一次。无线电台上还有未接的，先让他把上一句听完。
   */
  private maybeNudgeHook(): void {
    if(this.authoredSite)return;
    if (this.phase !== 'site' || this.outcome.kind !== 'alive') return;
    if (this.pending.length > 0) return;
    if (this.at === 'radio') return;
    if (this.shot.phase === 'exposing') return;
    const snap = this.hookSnapshot();
    if (!snap) return;
    const gate = currentHookGate(snap);
    if (!gate) return;
    const key = `${this.legIndex}:${gate}`;
    if (this.hookNudged.has(key)) return;
    const idle = this.siteIdleSec >= HOOK_IDLE_SEC;
    const wasted = this.siteBreaths >= HOOK_BREATHS;
    if (!idle && !wasted) return;
    const line = hookLine(snap.story, gate);
    if (!line) return;
    this.hookNudged.add(key);
    this.siteIdleSec = 0;
    this.queueRadio('beacon', line);
  }

  private tickHookIdle(dt: number): void {
    if(this.authoredSite) return;
    if (this.phase !== 'site' || this.outcome.kind !== 'alive') {
      this.siteIdleSec = 0;
      return;
    }
    if (this.pending.length > 0 || this.shot.phase === 'exposing' || this.mode === 'alert') return;
    this.siteIdleSec += dt;
    if (this.siteIdleSec >= HOOK_IDLE_SEC) this.maybeNudgeHook();
  }

  /** 舷外海水温度。越深越冷。 */
  get seaTemp(): number {
    return lerp(11, 3.2, clamp01(this.depth / 2000));
  }

  /** 加热器在不在工作 */
  get heaterOn(): boolean {
    return !this.blackout && this.power > 0.02;
  }

  get depth(): number {
    const l = this.leg;
    const prev = this.legIndex > 0 ? legAt(this.legIndex - 1).depth : 900;
    const along = lerp(prev, l.depth, clamp01(this.traveled / l.length));
    if(this.phase==='site'&&this.authoredSite)return along-(this.authoredSite.elevation??0);
    if(this.phase!=='site')return along-this.transitElevation;
    const v = this.volume;
    if (this.phase === 'site' && v) {
      try {
        return along + nodeById(v, this.volumeAt).pos.z;
      } catch {
        return along;
      }
    }
    return along;
  }

  /**
   * 这一关有多深 0..1。0 = 第一关，1 = 最后一关。
   *
   * 内容层拿它爬两条曲线：封条的欺骗率（8% → 30%）和怪箱的权重。
   * 用航段序号而不是真实深度 —— 「越往下越有人重新封过箱子」说的是
   * 行程走了多远，不是压力表上的数字。
   */
  get depth01(): number {
    return ACT_COUNT <= 1 ? 0 : clamp01(this.legIndex / (ACT_COUNT - 1));
  }

  /**
   * 现在这一间房的声学尺度。表现层每帧推给音频引擎，混响尾巴跟着它变。
   *
   * 没进站（还在航渡）时给舱自己的九米 —— 那时候摄像头画面里什么都没有。
   */
  get roomAcoustics(): { size: number; flooded: boolean } {
    const v = this.volume;
    if (this.phase !== 'site' || !v) return { size: 9, flooded: false };
    const node = v.nodes.find((n) => n.id === this.volumeAt);
    if (!node) return { size: 9, flooded: false };
    // 三维取最大边：一条二十米的廊道听起来是二十米，不是它的宽度
    const s = node.size;
    return { size: Math.max(s.x, s.y, s.z), flooded: true };
  }

  /**
   * 现在看得见东西吗。
   *
   * 三个光源：探照灯（要电、招光趋性的东西）、冷焰（烧完就没）、
   * 以及箱子里炸开的那一下（`flash` tag，完全免费，但不由你决定什么时候来）。
   * 这个 getter 是唯一的口子 —— 瞄准、屏幕、造物可见性全部读它。
   */
  get lit(): boolean {
    return this.lamp || this.flareLeft > 0 || this.fx.flash > 0;
  }

  /** 全程进度 0..1 */
  get progress(): number {
    let done = 0;
    for (let i = 0; i < this.legIndex; i++) done += ROUTE[i].length;
    return clamp01((done + this.traveled) / TOTAL_DISTANCE);
  }

  /** 航向偏差（度，带符号），正 = 偏右 */
  get headingError(): number {
    let d = this.heading - this.leg.safeHeading;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  get onCourse(): boolean {
    return Math.abs(this.headingError) <= this.leg.tolerance;
  }

  /** 舱外是否有电可用 */
  get powered(): boolean {
    return !this.blackout && this.power > 0.02;
  }

  /**
   * 舱里现在有几件这东西 —— 格子里的加台面上的。
   *
   * 台面上那些**是能用的**：它们就摊在打捞台上，伸手就拿得到。
   * 格子的意义不是「能不能用」，是「带不带得走」—— 起步那一下，
   * 没塞进格子的东西会滚进舱底的水里。于是容量上限管的是跨段的取舍，
   * 而不是当场把一支滤芯变成废物。
   */
  count(id: SupplyId): number {
    return this.stowedCount(id) + this.benchCountOf(id);
  }

  /** 只数格子里的。带得走的就是这些 */
  stowedCount(id: SupplyId): number {
    return this.stock.get(id) ?? 0;
  }

  /** 只数台面上的 */
  benchCountOf(id: SupplyId): number {
    let n = 0;
    for (const b of this.bench) if (b.id === id) n += b.n;
    return n;
  }

  /**
   * 拿走一件。**先拿台面上的** —— 它就在手边，而且它是带不走的那一件。
   * 这让「先用松散货」成为默认行为，不需要玩家去操心先后。
   */
  private consume(id: SupplyId): boolean {
    for (let i = 0; i < this.bench.length; i++) {
      const b = this.bench[i]!;
      if (b.id !== id) continue;
      b.n--;
      if (b.n <= 0) this.bench.splice(i, 1);
      return true;
    }
    const n = this.stowedCount(id);
    if (n <= 0) return false;
    this.stock.set(id, n - 1);
    return true;
  }

  /**
   * 储物格总数。
   *
   * 数字取自 content 层的 RECOMMENDED_CAPACITY —— 那边算过一处废墟平均掏得出
   * 多少东西，结论是一趟下来必须扔掉大约三分之一。容量该由内容说，不该由
   * 模拟层拍。开局就占掉一半（电池一个人占三格），所以第一只箱子翻完就得开始想。
   */
  static readonly BULK_CAP = RECOMMENDED_CAPACITY;

  /** 起步时膝盖上还能压几格。UI 拿它写「带不走」的确切边界 */
  static readonly LAP_BULK = LAP_BULK;

  get bulkUsed(): number {
    let n = 0;
    for (const [id, c] of this.stock) if (c > 0) n += supplyBulk(id) * c;
    return n;
  }

  get bulkFree(): number {
    return Math.max(0, PodRun.BULK_CAP - this.bulkUsed);
  }

  /** 台面上一共摊着几格。超过 LAP_BULK 的部分起步时就没了 */
  get benchBulk(): number {
    let n = 0;
    for (const b of this.bench) n += supplyBulk(b.id) * b.n;
    return n;
  }

  /** 台面上一共摊着几件。UI 拿它决定要不要把取舍的按钮摆出来 */
  get benchCount(): number {
    let n = 0;
    for (const b of this.bench) n += b.n;
    return n;
  }

  /**
   * 收一批东西进格子。返回真的塞进去了几件。
   *
   * 塞不下的不会消失 —— 它们进 bench，等玩家腾格子或者倒掉。
   */
  private gainSupply(id: SupplyId, n: number): number {
    const per = supplyBulk(id);
    let took = 0;
    while (took < n && this.bulkFree >= per) {
      this.stock.set(id, this.stowedCount(id) + 1);
      took++;
    }
    const left = n - took;
    if (left > 0) {
      const slot = this.bench.find((b) => b.id === id);
      if (slot) slot.n += left;
      else this.bench.push({ id, n: left });
    }
    return took;
  }

  /**
   * 把一批战利品记进账，顺手把「有几件没地方放」这件事说清楚。
   * 返回写进日志的那一段清单。
   */
  private takeLoot(batch: readonly (readonly [SupplyId, number])[]): string {
    const names: string[] = [];
    let spilled = 0;
    for (const [id, n] of batch) {
      const took = this.gainSupply(id, n);
      if (took > 0) names.push(`${supply(id).name}×${took}`);
      if (took < n) {
        spilled += n - took;
        names.push(`${supply(id).name}×${n - took}（摊在台面上）`);
      }
    }
    if (spilled > 0) this.warnBench();
    return names.join('、');
  }

  private warnBench(): void {
    this.onCue?.('ui.error', 0.5);
    this.pushLog(
      `储物格满了（${PodRun.BULK_CAP} 格）。捞上来的东西摊在${stationRef('salvage')}的台面上 ——` +
        '这一趟还用得上，但起步那一下只有两格压得进膝盖，剩下的滚进舱底的水里。',
      'bad',
    );
    this.pushLog('在起步之前得决定：从格子里扔掉哪一件，把它换进去。', 'system');
  }

  /**
   * 从格子里扔掉一件。这是腾格子的唯一办法。
   *
   * 扔掉的东西是真的没了 —— 泄压口外面是三千米深的水。
   */
  dropSupply(id: SupplyId): boolean {
    const n = this.stowedCount(id);
    if (n <= 0) {
      this.pushLog('格子里没有这个。', 'system');
      return false;
    }
    this.stock.set(id, n - 1);
    this.addNoise(0.04);
    this.onCue?.('water.splash', 0.4);
    this.pushLog(`${supply(id).name}塞进泄压口。水把它吞下去的时候没有声音。`, 'bad');
    this.drainBench();
    return true;
  }

  /**
   * 格子一腾出来，台面上的东西自己滑进去。
   *
   * 这不是在替玩家做决定 —— 台面上的东西从来没有被丢掉过，它只是放不进去。
   * 用掉一支滤芯、扔掉一卷胶带、腾出那一格的那一刻，它就该进去。
   * 于是「取舍」发生在真正需要取舍的时候：格子一直满着，而你就要起步了。
   */
  private drainBench(): void {
    if (!this.bench.length) return;
    const got: string[] = [];
    while (this.bench.length) {
      const slot = this.bench[0]!;
      if (this.bulkFree < supplyBulk(slot.id)) break;
      this.stock.set(slot.id, this.stowedCount(slot.id) + 1);
      got.push(supply(slot.id).name);
      slot.n--;
      if (slot.n <= 0) this.bench.shift();
    }
    if (!got.length) return;
    this.onCue?.('item.pickup', 0.5);
    this.pushLog(`腾出来的格子马上被填上了：${got.join('、')}。`, 'good');
    if (this.bench.length) {
      const left = this.bench.map((b) => `${supply(b.id).name}×${b.n}`).join('、');
      this.pushLog(`台面上还剩${left}。起步之前得解决它。`, 'system');
    }
  }

  /**
   * 起步那一下，台面上没收拾的东西就没了。
   *
   * 留一件例外：最小的那一件你可以抱在怀里。这不是仁慈 —— 舱里没有别的地方，
   * 你就是把它压在膝盖上，一整段航程都得那么坐着。剩下的滚进舱底的水。
   */
  private lashDown(): void {
    if (!this.bench.length) return;
    const order = this.bench
      .map((b, i) => ({ i, rank: hugRank(b.id) }))
      .sort((a, b) => b.rank - a.rank);
    const keep = new Map<SupplyId, number>();
    let lap = LAP_BULK;
    for (const { i } of order) {
      const b = this.bench[i]!;
      for (let k = 0; k < b.n; k++) {
        const cost = supplyBulk(b.id);
        if (cost > lap) break;
        lap -= cost;
        keep.set(b.id, (keep.get(b.id) ?? 0) + 1);
      }
    }
    const lost: string[] = [];
    for (const b of this.bench) {
      const n = b.n - (keep.get(b.id) ?? 0);
      if (n > 0) lost.push(`${supply(b.id).name}×${n}`);
    }
    this.bench.length = 0;
    for (const [id, n] of keep) this.bench.push({ id, n });
    this.drainBench();
    const held = [...keep].map(([id, n]) => (n > 1 ? `${supply(id).name}×${n}` : supply(id).name));
    if (!lost.length) {
      this.pushLog(`${held.join('、')}压在膝盖上。一整段航程都得这么坐着。`, 'system');
      return;
    }
    this.onCue?.('item.metal-clatter', 0.7);
    this.pushLog(
      `起步那一下，台面上的${lost.join('、')}滚进了舱底的水里。` +
        (held.length
          ? `另一只手在推进杆上 —— 你腾出的那只抓住了${held.join('、')}。`
          : '你腾不出手。'),
      'bad',
    );
  }

  /** 把台面上最上面那件收进格子。腾出格子之后才按得动 */
  stowBench(): boolean {
    const slot = this.bench[0];
    if (!slot) {
      this.pushLog('台面上没有东西。', 'system');
      return false;
    }
    const per = supplyBulk(slot.id);
    if (this.bulkFree < per) {
      this.onCue?.('ui.error', 0.5);
      this.pushLog(`还是没有格子。先扔掉一件，${supply(slot.id).name}才进得去。`, 'bad');
      return false;
    }
    this.stock.set(slot.id, this.stowedCount(slot.id) + 1);
    slot.n--;
    if (slot.n <= 0) this.bench.shift();
    this.onCue?.('item.pickup', 0.6);
    this.pushLog(`${supply(slot.id).name}进格子了。`, 'good');
    return true;
  }

  /** 把台面上最上面那件倒出泄压口 */
  dumpBench(): boolean {
    const slot = this.bench[0];
    if (!slot) {
      this.pushLog('台面上没有东西。', 'system');
      return false;
    }
    slot.n--;
    if (slot.n <= 0) this.bench.shift();
    this.addNoise(0.04);
    this.onCue?.('water.splash', 0.4);
    this.pushLog(`${supply(slot.id).name}倒出泄压口。你捞了它上来，又把它送了回去。`, 'bad');
    return true;
  }

  /**
   * 站点上还能捞的东西。
   *
   * 以前废墟钉在「本段第 280 米」，玩家要用一个 ±95 米的窗口贴过去 ——
   * 而舱是一档一档跳着走的，看不见外面，也没有窗户。那个靠近小游戏
   * 从来没有成立过。现在废墟就在站点上：开到了，就够得着。
   */
  siteWreck(): Wreck | null {
    if(this.authoredSite)return null;
    if (this.phase !== 'site') return null;
    const v = this.volume;
    if (v) {
      const here = v.nodes.find((n) => n.id === this.volumeAt);
      if (!here || here.role !== 'wreck') return null;
    }
    for (const w of this.leg.wrecks) {
      if ((this.salvaged.get(w.id) ?? 0) >= w.attempts) continue;
      return w;
    }
    return null;
  }

  /** 航渡还剩多少米。到站后是 0 */
  get remaining(): number {
    return Math.max(0, this.leg.length - this.traveled);
  }

  /** 无线电指示灯该不该闪 */
  get radioWaiting(): boolean {
    return this.pending.length > 0 && !this.earsPlugged;
  }

  // ==========================================================================
  // 时间
  // ==========================================================================

  private simCtx(): SimContext {
    return {
      rng: this.rng,
      depth: this.depth,
      ambient: {
        flooding: this.flood,
        pressure: 1 + this.depth / 10,
        // 舱内空气，不是舷外海水。进水带走的热由 vitals 按 flooding 单独算，
        // 这里再减一次就会重复计数。
        temperature: this.cabinTemp,
        airQuality: clamp01(0.25 + this.scrubber * 0.75),
        noiseFloor: this.noise,
        presence: this.threat ? 0.6 : 0.12,
      },
      flags: this.flags,
    };
  }

  /**
   * 花掉若干口呼吸。平静态下这是时间流动的唯一方式。
   * exertion 高的动作（撬、爬、全速）会额外烧氧并制造身体噪音。
   */
  spend(breaths: number, exertion = 0.25): void {
    if (breaths <= 0 || this.outcome.kind !== 'alive') return;
    this.breaths += breaths;
    if (this.phase === 'site') this.siteBreaths += breaths;
    const events = this.vitals.advance(breaths, this.simCtx(), { exertion });

    // 舱体本身也在走时间：进水、耗电、洗涤器老化、掉温
    this.flood = clamp01(this.flood + this.leak * breaths);
    this.power = clamp01(this.power - breaths * (this.blackout ? 0.00015 : 0.0007));
    this.scrubber = clamp01(this.scrubber - breaths * 0.0016);
    this.tickThermal(breaths);
    this.checkSystems();
    if (this.scrubber < 0.02) this.vitals.restore({ co2: breaths * 0.28 });

    const bodyNoise = this.vitals.takeNoise();
    if (bodyNoise > 0) this.addNoise(bodyNoise * 0.04);

    for (const e of events) {
      if (e.kind === 'death') return this.die(e.cause);
      if (e.kind === 'hallucination') this.hallucTimer = Math.min(this.hallucTimer, 2);
    }
    this.checkSurvival();
    this.maybeNudgeHook();
  }

  /**
   * 舱内温度。加热器开着就往十九度走；停了就往舷外海水走，但很慢 ——
   * 四十毫米的钢和一舱空气是有热惯性的，这段惯性就是玩家能装死多久的预算。
   */
  private tickThermal(breaths: number): void {
    const target = this.heaterOn ? 19.5 : this.seaTemp;
    // 加热比放热快得多：电热丝是主动的，失温是被动的
    const rate = this.heaterOn ? 0.035 : 0.004;
    this.cabinTemp += (target - this.cabinTemp) * clamp01(rate * breaths);

    if (this.cabinTemp < 8 && !this.flags.has('warned.cold')) {
      this.flags.set('warned.cold', true);
      this.pushLog('你呼出的气开始在面前结成白雾。舱壁在结霜。', 'bad');
    }
  }

  /**
   * 舱体自检。
   *
   * 舱里没有窗户，玩家唯一能察觉「有东西正在耗尽」的方式就是有人告诉他。
   * 每条只报一次，报的是**该去做什么**，不是一个百分比 ——
   * 百分比在仪表上已经有了，玩家缺的是「现在该起身了」这个判断。
   */
  private checkSystems(): void {
    const warn = (key: string, text: string, tone: LogTone = 'bad'): void => {
      if (this.flags.has(key)) return;
      this.flags.set(key, true);
      this.onCue?.('terminal.beep', 0.7);
      this.pushLog(text, tone);
    };

    if (this.scrubber < 0.20) {
      warn('warned.scrubber', `洗涤器指示灯转黄。滤芯快饱和了 —— 去${stationRef('life')}换一支，不然你会在自己呼出的气里睡过去。`);
    }
    if (this.scrubber < 0.02) {
      warn('warned.scrubber.dead', '洗涤器停了。你现在每一口吸进去的，都是刚刚呼出来的。', 'bad');
    }
    if (this.vitals.vitals.co2 > 60) {
      warn('warned.co2', '你开始头疼，手指发麻。这是二氧化碳，不是恐惧。');
    }
    if (this.power < 0.22) {
      warn('warned.power', '电池组剩下不到四分之一。雷达、摄像头、加热器共用它。');
    }
    if (this.flood > 0.45) {
      warn('warned.flood', '水漫过脚踝了。舀出去，或者补上漏点 —— 冷水比缺氧快。');
    }
    if (this.leak > 0.0038) {
      warn('warned.leak', `进水速度在涨。哪里被撞裂了，补漏胶在${stationRef('life')}。`);
    }
  }

  /** 每帧都跑。动画、噪音衰减、警报倒计时、幻听 */
  frame(dt: number): void {
    this.ensureAuthoredSite();
    if (this.outcome.kind !== 'alive') return;
    this.clock += dt;

    this.camX = damp(this.camX, this.camTargetX, 7.5, dt);
    this.zoom = damp(this.zoom, this.at ? 1 : 0, 9, dt);

    // 噪音总是往底噪掉。底噪取决于你有没有在动
    if(this.phase==='site')this.authoredSite?.tick?.(dt);
    const sonarHum = this.activeSonarEnabled && this.powered ? 0.035 : 0;
    const floor = Math.max(this.blackout ? 0.012 + sonarHum : 0.045 + this.throttle * 0.02 + sonarHum,this.authoredSite?.noiseFloor??0);
    this.noise = Math.max(floor, this.noise - dt * 0.09);

    if (this.flareLeft > 0) this.flareLeft = Math.max(0, this.flareLeft - dt);

    // 声音的时间轴排在最前面：那句话什么时候说，取决于它
    this.tickCueTrack(dt);
    this.tickFx(dt);
    this.tickThreat(dt);
    this.tickShot(dt);
    this.tickArm(dt);
    // 格子是会空出来的（用掉、扔掉、被吃掉），台面上排队的东西要跟着进去
    if (this.bench.length) this.drainBench();
    this.tickVoices(dt);
    this.tickHookIdle(dt);
    this.tickPilot(dt);
    if(this.mode!=='alert') this.storyCaptionLeft=Math.max(0,this.storyCaptionLeft-dt);
    const storyBeat=this.campaign.tick(dt,this.mode==='alert'||this.storyCaptionLeft>0);
    if(storyBeat) {
      if(storyBeat.id!=='0.hook') {this.storyCaption=storyBeat.text;this.storyCaptionLeft=22;}
      this.pushLog(`【航行记录 ${storyBeat.chapter+1}】${storyBeat.text}`,'eerie');
      this.onCue?.(storyBeat.beat==='arrival'?'door.knock':storyBeat.beat==='film'?'knowledge.gain':'radio.squelch',.45);
    }
    this.syncCorruption();

    // 警报态：真实时间会烧氧
    if (this.mode === 'alert') {
      this.breathAcc += dt / SECONDS_PER_BREATH;
      while (this.breathAcc >= 1) {
        this.breathAcc -= 1;
        this.spend(1, 0.45);
      }
    }
  }

  // ==========================================================================
  // 噪音
  // ==========================================================================

  addNoise(amount: number): void {
    if (amount <= 0) return;
    this.noise = clamp01(this.noise + amount);
    if (this.phase === 'site' && this.clock >= this.huntRecoveryUntil) this.suspicion += amount * 4;
    // 已经在警报里的时候，噪音直接缩短引信
    const t = this.threat;
    if (t && (t.phase === 'contact' || t.phase === 'identified') && t.creature.attractor === 'noise') {
      t.fuse = Math.max(2, t.fuse - amount * 14);
    }
  }

  // ==========================================================================
  // 工位与走动
  // ==========================================================================

  /** 工位在舱内的 x 位置 0..1 */
  static readonly STATION_X: Readonly<Record<StationId, number>> = {
    life: 0.05,
    salvage: 0.56, // 旧入口和摄像打捞台是同一个位置
    radio: 0.39,
    camera: 0.56,
    lab: 0.73,
    nav: 0.92,
  };

  /** 离视角最近的工位 */
  closestStation(): StationId {
    let best: StationId = 'radio';
    let bestD = 99;
    for (const id of STATION_ORDER) {
      const d = Math.abs(PodRun.STATION_X[id] - this.camX);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  /** 站到某个工位前面。返回花掉的时间（呼吸） */
  walkTo(id: StationId): number {
    id = canonicalStation(id);
    const from = this.camTargetX;
    const to = PodRun.STATION_X[id];
    const dist = Math.abs(to - from);
    if (this.at === id && dist < 0.02) return 0;
    this.camTargetX = to;
    this.at = id;
    this.onCue?.('step.metal', 0.45 + dist * 0.4);
    this.addNoise(dist * 0.18);
    // 舱只有九米长，走过去不值几口气 —— 但警报态里这几秒是要命的
    const cost = dist < 0.03 ? 0 : Math.max(1, Math.round(dist * 5.5));
    if (cost <= 0) return 0;
    if (this.mode === 'calm') this.spend(cost, 0.3);
    else this.breathAcc += dist * 2.2;
    return cost;
  }

  /** 沿舱体走到相邻工位前面，但不坐下 */
  peekStation(dir: -1 | 1): StationId {
    const order = STATION_ORDER;
    const cur = this.closestStation();
    const i = clamp(order.indexOf(cur) + dir, 0, order.length - 1);
    const next = order[i]!;
    const to = PodRun.STATION_X[next];
    const dist = Math.abs(to - this.camTargetX);
    this.camTargetX = to;
    this.at = null;
    if (dist > 0.01) {
      this.onCue?.('step.metal', 0.4 + dist * 0.35);
      this.addNoise(dist * 0.18);
      const cost = Math.max(1, Math.round(dist * 4));
      if (this.mode === 'calm') this.spend(cost, 0.25);
      else this.breathAcc += dist * 1.8;
    }
    return next;
  }

  leaveStation(): void {
    this.at = null;
    this.onCue?.('ui.back', 0.5);
    // 起身不会把手收回来。泵会在你背后继续响，这一条必须说出来
    if (armOut(this.arm)) {
      this.pushLog('你起身的时候，机械手还伸在外面。泵在你背后继续响。', 'bad');
    }
  }

  // ==========================================================================
  // 回声雷达
  // ==========================================================================

  /**
   * 打一发脉冲。
   *
   * power: 0 = 被动聆听（安静，但只看得见很近的东西）
   *        1 = 常规脉冲
   *        2 = 全功率（看得远，整片海都知道你在这）
   */
  ping(power: 0 | 1 | 2): void {
    if (!this.powered) {
      this.pushLog('没有电。换能器一声不吭。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    if (power > 0 && !this.activeSonarEnabled) {
      this.pushLog('主动声纳尚未通电。先打开换能器电源。', 'system');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    const cost = [2, 4, 6][power];
    if(this.legIndex===0 && power>0) this.openingScanned=true;
    const noise = [0.04, 0.42, 0.95][power];
    this.sweepPower = power;
    this.sweepAtDistance = this.traveled;
    this.sweepId++;
    this.power = clamp01(this.power - [0.004, 0.014, 0.034][power]);
    this.contacts = this.buildContacts(power);
    this.addNoise(noise);
    this.onCue?.(['sonar.passive', 'sonar.chirp', 'sonar.boom'][power], 0.8);
    this.bus.emit('log', { text: '', tone: 'neutral' });
    if (this.mode === 'calm') this.spend(cost, 0.15);
    else this.breathAcc += cost * 0.35;

    if (power === 2) {
      this.pushLog('全功率脉冲。整条沟都听见了。', 'bad');
    }
  }

  toggleActiveSonar(): void {
    if (!this.powered) {
      this.pushLog('没有电。主动声纳换能器无法启动。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    this.activeSonarEnabled = !this.activeSonarEnabled;
    this.onCue?.('ui.toggle', 0.65);
    if (this.activeSonarEnabled) {
      this.power = clamp01(this.power - 0.006);
      this.addNoise(0.08);
      this.pushLog('主动声纳已通电。换能器的低鸣会抬高舱外噪声；发射脉冲会进一步暴露位置。', 'bad');
    } else {
      this.pushLog('主动声纳已断电。被动阵列仍在监听。', 'system');
    }
  }

  /**
   * 站点的阴影地图。
   *
   * 这不是一圈回波，而是「舱周围这块地方长什么样」—— 哪边贴着壁、
   * 哪边是空的、哪边有一大团说不清的东西。玩家到站之后第一眼看的就是它：
   * 一张粗糙的、只有明暗没有细节的近场平面图。
   *
   * 形状由航段 id 决定，所以塌陷沟永远是两侧夹紧、立管林永远是一排竖条 ——
   * 同一个地方每次进去都长一个样，这样它才算一个地方。
   */
  private buildShadow(): SiteShadow[] {
    const vol = this.volume;
    if (vol && this.volumeAt) {
      return volumeShadows(vol, this.volumeAt, this.heading).map((s, i) => ({ id: i, ...s }));
    }
    const rng = new Xoshiro(this.seed ^ (this.legIndex * 104729), 'site');
    const out: SiteShadow[] = [];
    const sectors = 28;
    for (let i = 0; i < sectors; i++) {
      const bearing = (i / sectors) * Math.PI * 2 - Math.PI;
      const near = 0.24 + rng.float(0, 0.38);
      const thick = 0.10 + rng.float(0, 0.22);
      out.push({
        id: i,
        bearing,
        arc: (Math.PI * 2) / sectors,
        near: clamp01(near),
        far: clamp01(near + thick),
        density: clamp01(0.35 + thick * 1.1 + rng.float(-0.12, 0.12)),
      });
    }
    return out;
  }

  /**
   * 生成这一发脉冲看到的东西。
   *
   * 地形是围着舱体的一圈回波，**只有安全航向那个方向留着一道口子**。
   * 这就是雷达的全部用处：它不会告诉你该往哪走，它只告诉你哪里走不通。
   */
  private buildContacts(power: 0 | 1 | 2): SonarContact[] {
    const out: SonarContact[] = [];
    const reach = [0.42, 0.78, 1][power];
    const fidelity = [0.45, 0.85, 1][power];
    const rng = new Xoshiro(this.seed ^ Math.round(this.traveled) ^ (this.legIndex * 7919), 'sweep');

    // 安全走廊：相对舱首的开口方向
    const openRad = ((this.leg.safeHeading - this.heading) * Math.PI) / 180;
    const half = (this.leg.tolerance * Math.PI) / 180;

    // 被动阵列只听得到正在发声的目标。它能给出宽泛方位，
    // 但没有往返时间，因此绝不提供距离或墙体轮廓。
    if (power === 0) {
      if (this.phase === 'transit') {
        out.push({
          id: 'passive.target', bearing: openRad, range: 0.82,
          strength: 0.62, arc: Math.max(0.34, half * 1.7), kind: 'door',
          label: `${this.leg.siteName} · 距离未知`,
        });
      }
      const t = this.threat;
      if (t && (t.phase === 'contact' || t.phase === 'identified')) {
        out.push({
          id: 'passive.threat', bearing: t.bearing, range: 0.82,
          strength: 0.9, arc: 0.30,
          kind: t.phantom && this.corruption > 0.4 ? 'artifact' : 'anomaly',
          label: `${t.known ? t.creature.name : t.creature.designation} · 距离未知`,
        });
      }
      return out;
    }

    if (this.phase === 'transit') {
      // ── 远场：一圈墙，一道缝，一个目标点 ──────────────────────────────
      const count = 34;
      for (let i = 0; i < count; i++) {
        const bearing = (i / count) * Math.PI * 2 - Math.PI;
        let delta = bearing - openRad;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) < half * 1.15) continue;

        // 走廊外面才有壁。越靠近走廊边缘，壁越近 —— 这是「缝」的形状
        const edge = clamp01((Math.abs(delta) - half) / 1.1);
        const range = clamp(0.20 + edge * 0.45 + rng.float(-0.06, 0.10), 0.08, reach);
        out.push({
          id: `terr.${i}`,
          bearing,
          range,
          strength: clamp01((0.35 + (1 - range) * 0.5) * fidelity),
          arc: 0.16 + rng.float(0, 0.12),
          kind: 'hull',
        });
      }

      // 目标点。它永远在走廊开口的方向上，距离随着你推进往里收 ——
      // 这就是航渡阶段唯一需要读的东西：方位对不对，还有多远。
      out.push({
        id: 'target',
        bearing: openRad,
        range: clamp(0.08 + (this.remaining / this.leg.length) * 0.88, 0.06, 0.98),
        strength: 0.95 * fidelity,
        arc: 0.11,
        kind: 'door',
        label: this.leg.siteName,
      });
    } else {
      // ── 近场：未分析时 PPI 只报未知废墟。内部几何在分析台之后才进全息屏 ──
      const vol = this.volume;
      if (vol && !vol.identified) {
        const w = this.leg.wrecks[0];
        if (w) {
          out.push({
            id: `wreck.${w.id}`,
            bearing: this.siteWreckBearing,
            range: 0.32,
            strength: 0.95 * fidelity,
            arc: 0.16,
            kind: 'wreck',
            label: '未知废墟',
          });
        }
      } else if (vol) {
        const here = nodeById(vol, this.volumeAt);
        let max = 1;
        for (const n of vol.nodes) max = Math.max(max, dist3(here.pos, n.pos));
        for (const n of vol.nodes) {
          if (n.id === this.volumeAt) continue;
          const b = bearingTo(here.pos, n.pos);
          let br = ((b.heading - this.heading) * Math.PI) / 180;
          while (br > Math.PI) br -= Math.PI * 2;
          while (br < -Math.PI) br += Math.PI * 2;
          const range = clamp(dist3(here.pos, n.pos) / (max * 1.15), 0.08, 0.96);
          const echo = vol.echoes.find((e) => e.node === n.id);
          const hid = vol.hazards.find((h) => h.node === n.id);
          if (sonarHides(hid, vol.identified)) continue;
          const wreck = n.role === 'wreck' ? this.leg.wrecks[0] : undefined;
          const cache = vol.caches.find((c) => c.node === n.id);
          if (!echo && !wreck && !cache) continue;
          out.push({
            id: wreck ? `wreck.${wreck.id}` : cache ? `cache.${n.id}` : echo ? `echo.${n.id}` : `node.${n.id}`,
            bearing: br,
            range,
            strength: echo ? 1 : wreck || cache ? 0.95 * fidelity : 0.4 * fidelity,
            arc: echo ? 0.08 : cache ? 0.1 : 0.12,
            kind: echo ? 'anomaly' : wreck || cache ? 'wreck' : 'hull',
            label: vol.identified
              ? echo?.truth ?? (cache ? n.label : wreck?.name ?? n.label)
              : echo?.sonarLabel ?? (cache ? cache.sonarLabel : wreck ? '硬回波' : undefined),
          });
        }
        let fi = 0;
        for (const f of vol.fauna) {
          if (f.role !== 'background') continue;
          const c = creature(f.creature);
          const spin =
            c.sonarSpeed === 'fast' ? 1.4 : c.sonarSpeed === 'slow' ? 0.22 : 0.02;
          const bearing = ((fi * 1.7 + this.clock * spin) % (Math.PI * 2)) - Math.PI;
          const arc = c.sonarSize === 'huge' ? 0.15 : c.sonarSize === 'tiny' ? 0.03 : 0.08;
          const strength = c.sonarSize === 'huge' ? 1 : c.sonarSize === 'tiny' ? 0.4 : 0.7;
          out.push({
            id: `fauna.${f.id}`,
            bearing,
            range: 0.42 + (fi % 3) * 0.08,
            strength: strength * fidelity,
            arc,
            kind: 'anomaly',
            label: vol.identified ? c.name : sonarLabelOf(c),
          });
          fi++;
        }
      } else {
        const w = this.siteWreck();
        if (w) {
          out.push({
            id: `wreck.${w.id}`,
            bearing: this.siteWreckBearing,
            range: 0.30,
            strength: 0.95 * fidelity,
            arc: 0.14,
            kind: 'wreck',
            label: w.name,
          });
        }
      }
    }

    // 威胁：红点。被动聆听也能听见它 —— 它自己在发声
    const t = this.threat;
    if (t && (t.phase === 'contact' || t.phase === 'identified')) {
      out.push({
        id: 'threat',
        bearing: t.bearing,
        range: t.range,
        strength: 1,
        arc: 0.07,
        kind: t.phantom && this.corruption > 0.4 ? 'artifact' : 'anomaly',
        label: t.known ? t.creature.name : t.creature.designation,
      });
    }

    // 污染伪影：理智低的时候，雷达开始自己发明回波
    const fakes = Math.round(this.corruption * 4);
    for (let i = 0; i < fakes; i++) {
      out.push({
        id: `ghost.${i}`,
        bearing: rng.float(-Math.PI, Math.PI),
        range: rng.float(0.15, 0.9),
        strength: rng.float(0.35, 0.85),
        arc: 0.06,
        kind: 'artifact',
      });
    }

    return out;
  }

  // ==========================================================================
  // 推进
  // ==========================================================================

  setThrottle(n: number): void {
    this.throttle = clamp(Math.round(n), 0, 3);
    this.onCue?.('ui.toggle', 0.5);
    if (this.throttle === 0) this.tryCounter({ kind: 'fullstop' });
  }

  /** 会话在输入框、提示词面板或失焦时锁驾驶；模拟入口也遵守。 */
  driveInputBlocked = false;

  get driveBlock(): string | null {
    if(this.phase==='site'&&this.createAuthoredSite&&!this.authoredSite)return this.authoredSiteError||'设施场景载入中';
    if (this.outcome.kind !== 'alive') return '航行已结束';
    if (this.driveInputBlocked) return '关闭面板并返回游戏';
    if (armOut(this.arm)) return '先收回机械臂';
    if (this.shot.viewing) return '切回实时镜头';
    if (this.shot.phase === 'exposing') return '曝光中 · 保持停船';
    // The shutter frame is frozen already; remote generation must not lock escape controls.
    if (this.charging) return '先断开充电';
    if (!this.powered) return '推进器没有电';
    return null;
  }

  /** 无惯性的离散操作：站内每按一次走 0.75m；航渡仍是抽象的一档脉冲。 */
  cameraDrive(action: CameraDriveAction): void {
    if (canonicalStation(this.at ?? 'nav') !== 'camera') return;
    if (this.driveBlock) { this.pushLog(this.driveBlock, 'system'); return; }
    switch (action) {
      case 'left': this.nudgeHeading(-5); return;
      case 'right': this.nudgeHeading(5); return;
      case 'up': this.nudgePitch(-5); return;
      case 'down': this.nudgePitch(5); return;
      case 'center': this.camPan = this.camTilt = 0; return;
      case 'forward':
      case 'back':
        if (this.phase === 'site') this.moveInVolume(CAMERA_DRIVE_METERS, action === 'back' ? -1 : 1);
        else if (action === 'forward') { this.setThrottle(1); this.thrust(); }
    }
  }

  nudgeHeading(deg: number): void {
    if (this.driveBlock) return;
    this.heading = this.authoredSite?.turn?.(deg) ?? (this.heading + deg + 360) % 360;
    this.onCue?.('ui.hover', 0.3);
  }

  nudgePitch(deg: number): void {
    if (this.driveBlock) return;
    this.pitch = clamp(this.pitch + deg, -80, 80);
    this.onCue?.('ui.hover', 0.25);
  }

  /**
   * 到站之后，推力在当前这一间里走。航向对准开口，潜深躲开横梁，对不上就刮壁。
   */
  private moveInVolume(pulseDistance?: number, direction = 1): void {
    if(this.authoredSite){
      if(this.driveBlock)return;
      const distance=(pulseDistance??SITE_PULSE[this.throttle]??0)*direction;
      if(!distance)return;
      if(!this.authoredSite.move(distance)){
        // Contact stops forward motion, not the rudder or reverse controls.
        this.pilot.speed=0;this.navDriveEngaged=false;
        if(this.clock>=this.pilotImpactUntil){
          this.pilotImpactUntil=this.clock+.6;
          this.pushLog('艇体接近设施或关闭的门。可倒退、转舵脱离，或操作门锁。','system');
          this.onCue?.('hull.groan',.3);
        }
      }
      const cost=Math.abs(distance)/SITE_PULSE[1];
      this.power=clamp01(this.power-.004*cost);this.addNoise(.30*cost);
      if(this.mode==='calm')this.spend(cost,.35);else this.breathAcc+=cost*.4;
      return;
    }
    if (this.driveBlock) {
      this.pushLog(this.driveBlock, 'system');
      return;
    }
    const v = this.volume;
    if (!v) return;
    if (pulseDistance === undefined && this.throttle === 0) {
      this.pushLog('推进器在停机位。什么都不会发生。', 'system');
      return;
    }
    const here = nodeById(v, this.volumeAt);
    const dist = pulseDistance ?? SITE_PULSE[this.throttle] ?? 0;
    const siteCost = pulseDistance === undefined ? 1 : dist / SITE_PULSE[1];
    const look = lookDir(this.heading, this.pitch);
    const dir = { x: look.x * direction, y: look.y * direction, z: look.z * direction };
    const locked = v.locks.some(l => l.node === this.volumeAt && !l.solved);
    const closedDoors = new Set(locked ? doorsOf(v, here).filter(d =>
      !['wreck', 'charge', 'entry'].includes(nodeById(v, d.to).role)).map(d => d.to) : []);
    const hit = traceDriveCabin(v, here, this.cabinPos, dir, dist, closedDoors);

    this.power = clamp01(this.power - 0.004 * siteCost);
    this.addNoise((0.22 + (pulseDistance === undefined ? this.throttle : 1) * 0.08) * siteCost);
    if (this.mode === 'calm') this.spend(siteCost, 0.35);
    else this.breathAcc += siteCost * 0.4;
    if(!this.continuousStep)this.onCue?.('hull.groan', 0.35 + this.throttle * 0.12);
    if (this.outcome.kind !== 'alive') return;
    if (hit.kind === 'wall' && hit.to) {
      if(this.continuousStep){this.pilot.stop();this.pilotImpactUntil=this.clock+1.2;}
      this.cabinPos = hit.pos;
      this.pushLog('锁还没开。先拍摄分析，再在摄像打捞台操作机关。', 'bad');
      return;
    }

    if (hit.kind === 'door' && hit.to) {
      const dest = nodeById(v, hit.to);
      const hazard = v.hazards.find((h) => h.node === dest.id);
      if (hazard && !this.resolveTrap(v, hazard, dest.id)) {
        if(this.continuousStep){this.pilot.stop();this.pilotImpactUntil=this.clock+1.2;}
        this.cabinPos = hit.pos;
        return;
      }
      const from = this.volumeAt;
      this.volumeAt = dest.id;
      markVisited(v, dest.id);
      if(v.hookNode===dest.id) this.campaign.record(this.legIndex,'evidence');
      this.settleCabin(from);
      this.siteShadow = this.buildShadow();
      this.pushLog(
        dest.role === 'exit'
          ? '到了这一关的远端气闸。出发进入下一段航渡。'
          : `穿过开口。这里是${dest.label || '下一间'}。`,
        dest.role === 'exit' ? 'good' : 'neutral',
      );
      if (dest.role === 'decoy') {
        this.addNoise(0.4);
        this.vitals.restore({ fear: 8 });
        this.pushLog('这根管子里面没有警戒漆。走错了。', 'bad');
        this.wakeSite('死路里有东西被螺旋桨吵醒了。');
      }
      this.resolveEcho(dest.id);
      this.contacts = this.buildContacts(this.sweepPower as 0 | 1 | 2);
      return;
    }

    this.cabinPos = hit.pos;
    if (hit.kind === 'wall' || hit.kind === 'obstacle') {
      if(this.continuousStep){this.pilot.stop();this.pilotImpactUntil=this.clock+1.2;}
      const what = hit.kind === 'obstacle' && hit.obstacle ? OBSTACLE_CN[hit.obstacle] : '舱壁';
      this.pushLog(`撞上${what}。把航向或潜深拧开，再推。`, 'bad');
      this.collide(dist);
      return;
    }
    if(!this.continuousStep)this.pushLog(`滑了 ${hit.t.toFixed(1)} 米。`, 'neutral');
  }

  /** false = 这一步被挡住或砸了，不要挪 volumeAt */
  private resolveTrap(
    v: Volume,
    hazard: NonNullable<Volume['hazards'][number]>,
    destId: string,
    fromPos?: { x: number; y: number; z: number },
  ): boolean {
    if (hazard.kind === 'photophobe') {
      if (this.clock > v.photoOpenUntil) {
        if (v.identified) {
          this.pushLog('附着物胀回来了。再花一格电拍一次，闪光会让它们缩回去。', 'system');
          return false;
        }
        this.collide(40);
        this.pushLog('通道被一层会动的肉堵住了。雷达把它画成凹凸的管壁。拍一卷。', 'bad');
        return false;
      }
      return true;
    }
    if (hazard.kind === 'veil') {
      if (!v.identified) {
        this.collide(40);
        this.hull = clamp01(this.hull - 0.08);
        this.pushLog('声呐说前面是空的。舱头撞进一层透明的酸。片子才能看见裂隙。', 'bad');
        return false;
      }
      return true;
    }
    if (hazard.kind === 'vortex' || hazard.kind === 'current') {
      const from = fromPos ?? nodeById(v, this.volumeAt).pos;
      const to = nodeById(v, destId).pos;
      const b = bearingTo(from, to);
      const need = b.heading + (hazard.crab ?? -45);
      let dh = this.heading - need;
      while (dh > 180) dh -= 360;
      while (dh < -180) dh += 360;
      if (Math.abs(dh) > 22) {
        this.collide(40);
        this.pushLog(
          v.identified
            ? `暗流把舱往${hazard.side === 'starboard' ? '右' : '左'}扯。片子里颗粒的方向 —— 头要偏 ${hazard.crab ?? -45}°。`
            : '洞穴是空的。你全速开进去，被没有回波的水拍到岩壁上。',
          'bad',
        );
        return false;
      }
      return true;
    }
    if (hazard.kind === 'minefield') {
      if (!v.identified) {
        this.collide(40);
        this.pushLog('球体场里撞到一颗。雷达上看每一颗都一样。拍一卷，记红光。', 'bad');
        return false;
      }
      return true;
    }
    if (!hazardOpen(hazard, this.clock, v.identified, this.rng)) {
      if (v.identified) {
        this.pushLog('开口还没到。片子里数过周期 —— 再等。', 'system');
        return false;
      }
      this.collide(40);
      this.pushLog('雷达只告诉你这里有一堵墙。墙刚才动了一下。拍一卷才能数清它的节奏。', 'bad');
      return false;
    }
    return true;
  }

  private resolveEcho(nodeId: string): void {
    const v = this.volume;
    if (!v) return;
    const echo = v.echoes.find((e) => e.node === nodeId);
    if (!echo) return;
    if (!v.identified) {
      this.pushLog(`声呐：${echo.sonarLabel}。它可能是${echo.candidates[0]}，也可能是${echo.candidates[1]}。`, 'eerie');
      this.vitals.restore({ fear: 6 });
    }
    const occupant = echo.creature ? creature(echo.creature) : null;
    if (occupant && isHarmless(occupant)) {
      const pass = occupant.onPass;
      if (pass) {
        this.power = clamp01(this.power + pass.power);
        this.pushLog(pass.line, 'good');
      } else {
        this.pushLog(`${occupant.name}从舷侧过去了。什么都没坏。`, 'good');
      }
      return;
    }
    if (echo.kind === 'cache-or-mimic' && echo.creature === null) {
      this.pushLog('封条还在。这是真的充电桩轮廓。', 'good');
      return;
    }
    if (occupant && !this.threat) {
      this.wakeSite(
        v.identified ? `片子里的那个东西就在这。${echo.truth}。` : '你开进了一个形状像补给站的嘴。',
        occupant.id,
      );
    }
  }

  /** 地热桩 / 废弃充电桩。慢，响，会把东西招来。 */
  charge(): void {
    const v = this.volume;
    if (this.phase !== 'site' || !v) {
      this.pushLog('充电桩不在航道上。到站以后线框里那根会亮的柱子才是。', 'system');
      return;
    }
    const here = nodeById(v, this.volumeAt);
    if (here.role !== 'charge') {
      this.pushLog('这个节点没有充电口。', 'system');
      return;
    }
    this.power = clamp01(this.power + 0.11);
    this.addNoise(0.72);
    if (this.mode === 'calm') this.spend(8, 0.35);
    else this.breathAcc += 4;
    this.onCue?.('power.breaker', 0.8);
    this.pushLog('泵响了。电在回来。整条沟都听得见这台泵。', 'bad');
    this.wakeSite('充电的噪音把近场的东西叫起来了。');
  }

  /** 开锁 / 切割。方位和颜色必须已经从片子里读过。 */
  operateLock(side?: string, alreadySpent = false): void {
    const v = this.volume;
    if (!v) return;
    const lock = v.locks.find((l) => l.node === this.volumeAt);
    if (!lock) {
      this.pushLog('这里没有可操作的锁。', 'system');
      return;
    }
    // 扳符号轮、拧阀门、举切割器 —— 三件事都是那条臂在做的
    if (!armAlive(this.arm)) {
      this.pushLog('符号轮在舱外。没有机械手，你连碰它一下都做不到。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    if (!v.identified) {
      this.pushLog('你不知道切哪一边、扳哪一根。拍一卷。', 'system');
      return;
    }
    if (lock.solved) {
      this.pushLog('已经开了。', 'system');
      return;
    }
    if (lock.kind === 'weak-cut') {
      if (!alreadySpent) {
        if (!this.consume('sup.cutter')) {
          this.pushLog('切割器是空的。', 'bad');
          return;
        }
      }
      this.addNoise(0.55);
      if (this.mode === 'calm') this.spend(alreadySpent ? 0 : 5, 0.5);
      const guess = (side as typeof lock.side | undefined) ?? lock.side;
      if (guess !== lock.side) {
        this.hull = clamp01(this.hull - 0.08);
        this.pushLog('切错边。刀断了，门还在。', 'bad');
        return;
      }
    }
    lock.solved = true;
    this.onCue?.('knowledge.gain', 0.6);
    this.pushLog(
      lock.kind === 'glyph'
        ? '符号对上了。井口的闸在退。'
        : lock.kind === 'color-valve'
          ? '警戒漆那一根通了。'
          : '薄弱点切开了。门歪开一条缝。',
      'good',
    );
  }

  /** 推进一脉冲。这是唯一能让舱体前进的动作 */
  thrust(): void {
    if (this.driveBlock) { this.pushLog(this.driveBlock, 'system'); return; }
    const spec = THROTTLE[this.throttle];
    if (this.phase === 'site') {
      this.moveInVolume();
      return;
    }
    if (this.throttle === 0) {
      this.pushLog('推进器在停机位。什么都不会发生。', 'system');
      return;
    }
    if (!this.powered) {
      this.pushLog('总闸拉着。推进器不转。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }

    this.power = clamp01(this.power - 0.006 * this.throttle);
    this.addNoise(spec.noise);
    this.onCue?.('hull.groan', 0.35 + this.throttle * 0.15);
    if (this.mode === 'calm') this.spend(spec.cost, 0.35);
    else this.breathAcc += spec.cost * 0.4;

    if (!this.onCourse) {
      this.collide(spec.m);
      return;
    }

    this.traveled += spec.m;
    // 金属质的东西听的是螺旋桨
    const t = this.threat;
    if (t && t.creature.attractor === 'metal') t.fuse = Math.max(2, t.fuse - spec.noise * 16);
    if (this.throttle === 3) this.tryCounter({ kind: 'fullahead' });

    if (this.traveled >= this.leg.length) this.arrive();
  }

  /**
   * 抵达站点。这是「进入关卡」的那一刻。
   *
   * 舱停下来，声呐从远场切到近场，废墟在够得着的地方，而站点上的东西
   * 开始计时。航渡阶段只有一件事要做（把船开对），到站之后才有选择。
   */
  private arrive(): void {
    this.navDriveEngaged=false;
    this.phase = 'site';
    this.traveled = this.leg.length;
    this.throttle = 0;
    this.siteBreaths = 0;
    this.siteIdleSec = 0;
    this.hookNudged.clear();
    this.ensureVolume();
    this.resetArm();
    this.siteShadow = [];
    this.siteWreckBearing = this.rng.float(-Math.PI, Math.PI);
    const vol = this.volume;
    if (vol) {
      this.volumeAt = entryNode(vol).id;
      vol.visited = [this.volumeAt];
      this.settleCabin(null);
    }
    this.contacts = this.buildContacts(this.sweepPower as 0 | 1 | 2);
    this.onCue?.('knowledge.gain', 0.7);
    this.pushLog(`抵达：${this.leg.siteName}。推进器停机。声呐上是一团未知废墟。`, 'good');
    this.pushLog(`内部要拍第一卷，送到${stationRef('lab')}才会长出来。`, 'system');
    for (const line of this.leg.arrival) this.pushLog(line, 'neutral');
    this.campaign.record(this.legIndex,'arrival');
    this.ensureAuthoredSite();
    if(!this.authoredSite && this.volume?.hookNode===this.volumeAt) this.campaign.record(this.legIndex,'evidence');

    // 没有东西可捞的站点，玩家就没有「发出噪音」这个选项 ——
    // 于是它也没有任何理由醒过来。这种站点上的东西在你停稳的那一刻就动了。
    if (!this.leg.wrecks.length) {
      this.wakeSite('这里没有东西可捞。但有东西在等。');
    }
  }

  /** 离站，进入下一段航渡。下一关的内部要到站再拍、再分析才会进场。 */
  depart(): void {
    if (this.driveBlock) { this.pushLog(this.driveBlock, 'system'); return; }
    if (this.phase !== 'site') return;
    if (!this.powered) {
      this.pushLog('总闸拉着。推进器不转。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    // 带着一条伸出去的臂起步 = 把它挂在第一根横梁上撇断
    if (armOut(this.arm)) {
      this.pushLog(`机械手还在外面。先回${stationRef('camera')}收回来，再起步。`, 'bad');
      this.onCue?.('ui.error', 0.5);
      return;
    }
    if (!this.canDepart) {
      if(this.authoredSite){this.pushLog(this.departHint,'system');return;}
      const v = this.volume;
      if (v && !v.identified) {
        this.pushLog(`全息屏还是空的。拍一卷，送到${stationRef('lab')}。`, 'system');
      } else if (!this.atExit) {
        this.pushLog('你不在这一关的出口上。全息屏上远端那道气闸才是出路。', 'system');
      } else if(v?.hookNode && !v.visited.includes(v.hookNode)) {
        this.pushLog('还有一处关键记录未核对。按 J 查看本关线索，再沿全息图前往标记节点。','system');
      } else if (v?.locks[0] && !v.locks[0].solved) {
        this.pushLog('门还锁着。片子里看过的符号 / 薄弱点，得在打捞台操作一次。', 'system');
      }
      this.onCue?.('ui.error', 0.5);
      return;
    }
    if (this.threat && this.threat.phase === 'contact') {
      this.pushLog('红点还在近场。现在起步，螺旋桨会把它直接引过来。', 'bad');
      this.onShake?.(0.3);
    }
    // 台面上还摊着东西就起步：它们会在第一次推进里滚进舱底的水。
    // 这一条必须说出来 —— 玩家是在被告知之后才失去它们的。
    if(this.legIndex===6 && !this.campaign.choice) {
      this.pushLog('井口已就绪。先去无线电台选择：转发载波、切断载波，或封存证据。','system');
      return;
    }
    if(this.legIndex===0 && this.authoredSite?.index===0 && this.onBeforeDepart){
      let allowed=false;
      try {allowed=this.onBeforeDepart();}catch{/* A failed save must never unload the harbor. */}
      if(!allowed){
        this.pushLog('离关保存检查未通过。接驳港仍保留，请完成保存后重试下潜。','bad');
        return;
      }
    }
    if (this.bench.length) this.lashDown();
    this.campaign.record(this.legIndex,'departure');
    this.authoredSite?.dispose();this.authoredSite=null;
    if (this.legIndex >= ACT_COUNT - 1) {
      for (const line of this.leg.clear) this.queueRadio('beacon', line);
      this.legIndex++;
      this.firedBeats.clear();
      this.charging = false;
      this.resetShot();
      this.escape();
      return;
    }
    for (const line of this.leg.clear) this.queueRadio('beacon', line);
    this.legIndex++;
    this.firedBeats.clear();
    this.phase = 'transit';
    this.traveled = 0;
    this.throttle = 0;
    this.pitch = 0;
    this.heading = this.leg.safeHeading;
    this.siteBreaths = 0;
    this.siteIdleSec = 0;
    this.hookNudged.clear();
    this.charging = false;
    this.resetShot();
    this.resetArm();
    this.threat = null;
    this.volumeAt = '';
    this.siteShadow = [];
    this.contacts = this.buildContacts(this.sweepPower as 0 | 1 | 2);
    this.beginLeg(this.legIndex);
    this.onCue?.('knowledge.gain', 0.55);
    this.pushLog(`离开近场。声呐上只有下一处未知废墟。`, 'good');
  }

  /** 这一关的内部若还没生成（后六关到站时），现在生成。 */
  private ensureVolume(): void {
    if (this.chart[this.legIndex]) return;
    const next = generateVolume(
      this.legIndex,
      this.seed,
      null,
      null,
      this.vitals.vitals.san,
      collectMemory(this.chart, this.seed),
    );
    this.chart.push(next.volume);
  }

  /**
   * 出口外那卷已经拼上：人还在近场，线框不断开，舱滑进下一关入口。
   * 节点关卡不再走这条路。保留给验证器旧路径，避免空引用。
   */
  private enterSplicedSite(destId?: string): void {
    if(!this.canDepart || this.legIndex>=6 || this.driveBlock || armOut(this.arm) || this.outcome.kind!=='alive') return;
    const prev = this.volume;
    const next = this.nextVolume;
    if (!prev || !next) return;
    const dest = destId ?? entryNode(next).id;
    const hazard = next.hazards.find((h) => h.node === dest);
    if (hazard && !this.resolveTrap(next, hazard, dest, exitNode(prev).pos)) return;

    this.campaign.record(this.legIndex,'departure');
    for (const line of this.leg.clear) this.queueRadio('beacon', line);
    this.legIndex++;
    this.firedBeats.clear();
    this.traveled = this.leg.length;
    this.siteBreaths = 0;
    this.siteIdleSec = 0;
    this.hookNudged.clear();
    this.phase = 'site';
    this.charging = false;
    this.resetShot();
    this.resetArm();
    this.threat = null;
    this.volumeAt = dest;
    markVisited(next, dest);
    this.settleCabin(null);
    this.siteShadow = this.buildShadow();
    this.contacts = this.buildContacts(this.sweepPower as 0 | 1 | 2);
    this.power = clamp01(this.power - 0.008);
    this.addNoise(0.22);
    this.beginLeg(this.legIndex);
    this.onCue?.('knowledge.gain', 0.55);
    this.pushLog(`沿线框滑入：${this.leg.siteName}。下一段还在屏上。`, 'good');
    this.campaign.record(this.legIndex,'arrival');
    if(next.hookNode===dest) this.campaign.record(this.legIndex,'evidence');
    for (const line of this.leg.arrival) this.pushLog(line, 'neutral');
    this.resolveEcho(dest);
  }

  private collide(intended: number): void {
    if (this.phase === 'site') {
      this.hull = clamp01(this.hull - 0.05);
      this.leak += 0.0008;
      this.vitals.injure(7);
      this.addNoise(0.4);
      this.onCue?.('hull.crack', 0.7);
      this.onShake?.(0.35);
      this.checkSurvival();
      return;
    }
    const over = Math.abs(this.headingError) - this.leg.tolerance;
    const severity = clamp01(over / 40) * (0.4 + this.throttle * 0.25);
    this.traveled += intended * 0.25;
    this.hull = clamp01(this.hull - severity * 0.16);
    this.leak += severity * 0.0022;
    this.flood = clamp01(this.flood + severity * 0.05);
    this.collisions++;
    this.addNoise(0.5 + severity * 0.5);
    this.vitals.injure(severity * 26);
    this.onCue?.('hull.crack', 0.9);
    this.onShake?.(0.5 + severity * 0.5);
    this.pushLog(
      severity > 0.5
        ? '整条舱撞在硬东西上。灯全灭了一秒，回来的时候你的耳朵在响，脚下有水。'
        : '左舷刮到了什么。钢板发出一声很长的、不像金属的声音。',
      'bad',
    );
    // 撞墙的原因必须说出来。玩家看不见外面，「刮到了什么」这句话
    // 不会让任何人想到「我该去改航向」—— 他只会以为舱体推不动。
    this.pushLog(
      `偏航 ${Math.abs(this.headingError).toFixed(0)}°，这一段的容差是 ${this.leg.tolerance}°。` +
        `先在${stationRef('nav')}把航向拧回 ${this.leg.safeHeading}°，再推。`,
      'system',
    );
    this.checkSurvival();
  }

  // ==========================================================================
  // 摄像头
  // ==========================================================================

  toggleLamp(): void {
    if (!this.powered) {
      this.pushLog('探照灯没有电。', 'bad');
      return;
    }
    this.lamp = !this.lamp;
    this.power = clamp01(this.power - 0.004);
    this.onCue?.('power.breaker', 0.55);
    this.pushLog(this.lamp ? '探照灯点亮。二十米内的水变成了悬浮的灰。' : '探照灯熄灭。', 'system');
    const t = this.threat;
    if (t && t.creature.attractor === 'light' && this.lamp) {
      t.fuse = Math.max(2, t.fuse - 10);
      this.pushLog('雷达上那个点，加速了。', 'bad');
    }
    if (!this.lamp) this.tryCounter({ kind: 'lampoff' });
  }

  panCamera(d: number): void {
    this.camPan = clamp(this.camPan + d, -Math.PI * 0.95, Math.PI * 0.95);
  }

  tiltCamera(d: number): void {
    this.camTilt = clamp(this.camTilt + d, -0.5, 0.5);
  }

  zoomCamera(d: number): void {
    this.camZoom = clamp(this.camZoom + d, 1, 3.2);
  }

  /** 摄像头画面里现在有没有那个东西、有多正 */
  cameraOnTarget(): number {
    const t = this.threat;
    if (!t || t.phase === 'repelled') return 0;
    let delta = this.camPan - t.bearing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const fov = 0.55 / this.camZoom;
    return clamp01(1 - Math.abs(delta) / fov);
  }

  /** 看得见它吗 —— 要么它自己发光，要么你给它打光 */
  cameraCanSee(): boolean {
    const t = this.threat;
    if (!t) return false;
    if (t.creature.look.plan === 'absent') return true;
    return this.lit || t.creature.look.lights > 0;
  }

  // --- 拍片 -----------------------------------------------------------------

  /**
   * 按下快门。
   *
   * 只有停稳了才拍得到东西：舱在航渡途中是在动的，五秒曝光会把整卷
   * 拉成一条糊线。到站之后这一卷有三种用途：
   *   identify  —— 给当前线框起名字（颜色、周期、真身）
   *   survey    —— 对着出口的黑暗拍，冲洗的同时生成下一段并拼上
   *   reshoot   —— 同一张几何再看一次，外面可能已经变了
   */
  beginShoot(): void {
    const s = this.shot;
    if (armOut(this.arm)) {
      this.pushLog('先收回机械臂。作业时需要保持实时监视回路。', 'system');
      return;
    }
    if (s.phase === 'exposing' || s.phase === 'developing') {
      this.pushLog('机子已经在走了。', 'system');
      return;
    }
    if (!this.powered) {
      this.pushLog('快门是电磁的。没有电，它连响一声都不会。', 'bad');
      this.onCue?.('ui.error', 0.6);
      return;
    }
    if (this.phase !== 'site') {
      this.pushLog('舱在动。五秒曝光只会拍出一条糊线 —— 停稳了再拍。', 'system');
      this.onCue?.('ui.error', 0.5);
      return;
    }
    const purpose = this.nextShotPurpose();
    let keyframe: string | undefined;
    try { keyframe = this.captureKeyframe?.(); }
    catch {
      this.pushLog('摄像机首帧读取失败，请重新曝光。', 'bad');
      return;
    }
    s.keyframe = keyframe;
    s.sensorFrames=[];
    try {const frame=this.captureSensorFrame?.();if(frame)s.sensorFrames.push(frame);}catch{/* A missing sensor frame is not replaced with the API PNG. */}
    s.sensorSampleLeft=.5;
    s.siteEvidence=this.authoredSite?.captureEvidence ? structuredClone(this.authoredSite.captureEvidence()) : undefined;
    s.pendingResult=undefined;
    s.token++;
    s.phase = 'exposing';
    s.legId = purpose === 'survey' ? actAt(this.legIndex + 1).leg.id : this.leg.id;
    s.purpose = purpose;
    s.exposeLeft = EXPOSE_SECONDS;
    s.exposeMax = EXPOSE_SECONDS;
    s.developed = 0;
    s.reason = '';
    s.caught = false;
    s.viewing = false;
    s.cacheKey = undefined;
    s.capture = this.captureFootage(purpose);

    this.power = clamp01(this.power - SHOT_POWER);
    this.addNoise(0.12);
    this.onCue?.('terminal.beep', 0.6);
    if (this.mode === 'calm') this.spend(SHOT_BREATHS, 0.2);
    else this.breathAcc += SHOT_BREATHS * 0.4;

    const wait =
      this.mode === 'alert'
        ? '快门开了。五秒。你现在必须站在这台机子前面，而那个东西正在靠近。'
        : purpose === 'reshoot'
            ? '快门开了。同一扇气闸。你怀疑里面已经不是刚才那张脸。'
            : this.legIndex===0
              ? '快门开了。保持机位五秒；显影期间可以继续调查。完成后到分析台核验现场记录。'
              : '快门开了。五秒。镜头对着设施内部。冲出来之后送到分析台，全息屏才会长出房间。';
    this.pushLog(wait, this.mode === 'alert' ? 'bad' : 'system');
  }

  shotPurpose(): ShotPurpose {
    return this.nextShotPurpose();
  }

  private nextShotPurpose(): ShotPurpose {
    if(this.authoredSite?.captureEvidence)return 'identify';
    const v = this.volume;
    if (!v || !v.identified) return 'identify';
    if (this.canSurvey) return 'survey';
    return 'reshoot';
  }

  /** Snapshot before the shutter's own noise, resource cost or world mutation. */
  private captureFootage(purpose: ShotPurpose): FootagePromptInput {
    const t = this.threat;
    const active = t && t.phase !== 'repelled' && t.phase !== 'struck';
    const state: FootageState = active
      ? t.behavior === 'warning' ? 'attack' : t.behavior === 'stalk' ? 'pursuit' : 'anomaly'
      : t || (this.encounterSerial > 0 && this.clock < this.huntRecoveryUntil) ? 'aftermath'
      : this.suspicion >= huntAct(this.legIndex).threshold * 0.5 ? 'anomaly' : 'calm';
    const episode = active ? `encounter.${t.encounter}` : `${this.legIndex}.${state}.${this.encounterSerial}`;
    // A survey looks outward from the CURRENT location, not a future room.
    const act = this.legIndex;
    const vol = this.chart[act] ?? this.volume;
    const leg = actAt(act).leg;
    const repeat = (this.footageRepeats.get(episode) ?? 0) + 1;
    const direction = directFootage({
      state, act, repeat, episode, capturedAt: this.clock,
      encounter: active ? t.encounter : null,
      roll: this.rng.fork(`footage.${this.shot.token}.${episode}`).next(),
      target: active ? t.creature.id : null,
      visible: !!active && this.cameraCanSee(), aim: active ? this.cameraOnTarget() : 0,
      lamp: this.lit, noise: this.noise, motion: this.throttle, hull: this.hull,
    });
    const node = vol?.nodes.find(n => n.id === this.volumeAt) ?? (vol ? entryNode(vol) : null);
    return {
      simulationReport: active ? [
        `曝光快照：${t.creature.name}；${FOOTAGE_STATE_CN[state]}。`,
        `习性：${ATTRACTOR_CN[t.creature.attractor]}。`,
        `行为前兆：${t.hunter.tell}`,
        ...(this.spatialRunnerReport(t.creature.id)),
        ...(this.lastCombat?.encounter===t.encounter?[`战斗验证：${({missed:'未命中，未驱逐',interrupted:'暂时打断，未驱逐',returned:'已恢复追击，未驱逐',repelled:'已确认驱逐'})[this.lastCombat.outcome??'interrupted']}。`]:[]),
      ] : this.lastCombat?.encounter===this.encounterSerial ? [`战斗验证：${this.lastCombat.outcome==='repelled'?'已确认驱逐；不是击杀':'当前无活动接触；不能据此确认击杀或驱逐'}。`] : ['本次曝光没有记录到活动怪物。'],
      encounterObservation: this.lastCombat&&this.lastCombat.encounter===this.encounterSerial&&(!active||t.encounter===this.lastCombat.encounter)?{appearance:this.lastCombat.appearance,combat:{...this.lastCombat}}:active?{appearance:t.creature.footage}:undefined,
      leg, direction, depth: this.depth, lamp: this.lit,
      narrativeTrace: CAMPAIGN_STORY[act]?.film,
      corruption: clamp01(this.corruption + san01(this.vitals.vitals.san) * 0.5),
      san: this.vitals.vitals.san, story: vol?.story, stencil: vol?.stencil,
      interior: this.authoredSite?.description ?? (vol && node ? interiorFootageClause(vol, node.id) : undefined),
      creature: direction.identified ? creature(direction.identified) : null,
      fauna: direction.fauna.map(id => creature(id)),
      // Geometry evidence is essential; do not enumerate dormant creatures or hidden echoes.
      tells: !this.authoredSite && vol ? [...vol.hazards.map(trapFootageTell), ...vol.caches.map(cacheFootageTell),
        ...vol.locks.map(l => `${l.kind} weak side ${l.side}, stripe ${l.stripe}`)] : [],
    };
  }

  /** 给验证器用：这一关接下来该去的节点 */
  volumeGoal(): string {
    const v = this.volume;
    if (!v) return '';
    if (v.hookNode && !v.visited.includes(v.hookNode)) return v.hookNode;
    const wreckNode = v.nodes.find((n) => n.role === 'wreck');
    const wreck = this.leg.wrecks[0];
    if (wreckNode && wreck && (this.salvaged.get(wreck.id) ?? 0) < wreck.attempts) return wreckNode.id;
    const live = v.identified
      ? v.caches.find((c) => c.truth === 'live' && (this.salvaged.get(`cache.${c.node}`) ?? 0) === 0)
      : undefined;
    if (live) return live.node;
    const lock = v.locks.find((l) => !l.solved);
    if (lock) return lock.node;
    const charge = v.nodes.find((n) => n.role === 'charge');
    if (charge && this.power < 0.12) return charge.id;
    return exitNode(v).id;
  }

  private locOf(id: string): { vol: Volume; node: ReturnType<typeof nodeById> } | null {
    const v = this.volume;
    if (v?.nodes.some((n) => n.id === id)) return { vol: v, node: nodeById(v, id) };
    const n = this.nextVolume;
    if (n?.nodes.some((x) => x.id === id)) return { vol: n, node: nodeById(n, id) };
    return null;
  }

  /** 把航向拧到通往该节点的开口上 */
  faceNode(id: string): void {
    const v = this.volume;
    if (!v || !this.volumeAt) return;
    const here = nodeById(v, this.volumeAt);
    const door = doorsOf(v, here).find((d) => d.to === id);
    if (door) {
      const b = faceBearing(this.cabinPos, door.pos);
      this.heading = Math.round(b.heading);
      this.pitch = Math.round(b.pitch);
    } else {
      const dest = this.locOf(id);
      if (!dest) return;
      const b = bearingTo(here.pos, dest.node.pos);
      this.heading = Math.round(b.heading);
      this.pitch = Math.round(b.pitch);
    }
    const h = v.hazards.find((x) => x.node === id);
    if (v.identified && h && (h.kind === 'vortex' || h.kind === 'current') && h.crab) {
      let hd = this.heading + h.crab;
      while (hd < 0) hd += 360;
      while (hd >= 360) hd -= 360;
      this.heading = Math.round(hd);
    }
  }

  /** 对准通往目标的开口，连推直到穿过。先到房间中央，再穿开口，避免对角刮壁 */
  stepToward(goal: string): boolean {
    const v = this.volume;
    if (!v) return false;
    if (v.nodes.some((n) => n.id === goal)) {
      const path = shortestPath(v, this.volumeAt, goal);
      const hop = path[1];
      if (!hop) return false;
      this.setThrottle(3);
      const before = this.volumeAt;
      for (let i = 0; i < 12; i++) {
        const here = nodeById(v, this.volumeAt);
        const door = doorsOf(v, here).find((d) => d.to === hop);
        const atDoor = door ? dist3(this.cabinPos, door.pos) < 5.0 : false;
        const nearOther = doorsOf(v, here).some((d) => d.to !== hop && dist3(this.cabinPos, d.pos) < 4.2);
        if (door && !atDoor && nearOther) {
          const b = faceBearing(this.cabinPos, { x: 0, y: 0, z: 0 });
          this.heading = Math.round(b.heading);
          this.pitch = Math.round(b.pitch);
        } else {
          this.faceNode(hop);
        }
        const p0 = { ...this.cabinPos };
        this.moveInVolume();
        if (this.volumeAt !== before) return true;
        if (dist3(this.cabinPos, p0) < 0.08) break;
      }
      return this.volumeAt !== before;
    }
    const nv = this.nextVolume;
    if (!nv || !this.atExit || !nv.nodes.some((n) => n.id === goal)) return false;
    const entry = entryNode(nv);
    if (goal === entry.id) {
      const before = this.volumeAt;
      this.enterSplicedSite();
      return this.volumeAt !== before || this.volume === nv;
    }
    const hop = shortestPath(nv, entry.id, goal)[1];
    if (!hop) return false;
    this.faceNode(hop);
    const before = this.volumeAt;
    this.moveInVolume();
    return this.volumeAt !== before;
  }

  /**
   * 曝光结束：闪光类机关当场生效。内部几何要等分析台才进场。
   */
  private commitAnalysis(purpose: ShotPurpose): void {
    const v = this.volume;
    if (v) {
      const ph = v.hazards.find((h) => h.kind === 'photophobe');
      if (ph) {
        v.photoOpenUntil = this.clock + (ph.flashOpen ?? 14);
        this.pushLog('闪光打过去。管壁上怕光的东西缩回去了。电换路，路不会一直开着。', 'good');
      }
    }
    if (purpose === 'reshoot' && v) {
      for (const line of shiftVolume(v)) this.pushLog(line, 'eerie');
      this.vitals.shock(8, 'sight');
    }
  }

  private footageTells(purpose: ShotPurpose): string[] {
    const idx = purpose === 'survey' ? this.legIndex + 1 : this.legIndex;
    const v = this.chart[idx] ?? this.volume;
    if (!v) return [];
    const out: string[] = [];
    for (const e of v.echoes) out.push(`${e.sonarLabel} resolving as ${e.truth}`);
    for (const c of faunaOnTape(v)) {
      out.push(
        `${sonarLabelOf(c)} is ${c.name}: ${c.kin === 'fauna' ? 'ordinary fauna' : 'mythos'}, ` +
          `${c.danger === 0 ? 'harmless' : 'lethal'}`,
      );
    }
    for (const h of v.hazards) out.push(trapFootageTell(h));
    for (const c of v.caches) out.push(cacheFootageTell(c));
    out.push(`operator sanity ${Math.round(this.vitals.vitals.san)} (${v.san})`);
    for (const l of v.locks) out.push(`${l.kind} weak side ${l.side}, stripe ${l.stripe}`);
    return out;
  }

  /** 把已经冲好的片子重新放一遍。不要钱，因为它已经在舱里了 */
  replayFootage(): void {
    const s = this.shot;
    if (s.phase !== 'ready' || armOut(this.arm)) return;
    s.viewing = false;
    this.walkTo('lab');
    this.onCue?.('ui.select', 0.5);
    this.pushLog('倒回片头。再看一遍。', 'system');
  }

  /** 在「片子」和「监视回路」之间切。看清红点要用监视回路的取景框 */
  toggleFootageView(): void {
    const s = this.shot;
    if (s.phase !== 'ready' || armOut(this.arm)) return;
    s.viewing = false;
    this.walkTo('lab');
    this.onCue?.('ui.toggle', 0.45);
  }

  /**
   * 摄影机的两段计时。
   *
   * 曝光和冲洗都走**实时**秒，平静态也一样 —— 这是本作里唯一一个
   * 「时间不因为你不动手就停下」的东西。理由是它本来就是一台机器在自己走，
   * 而且这让警报态按快门变成一个真的赌注：那九秒你必须待在原地。
   */
  private tickShot(dt: number): void {
    const s = this.shot;
    // 合并台共用一块屏；机械臂在外面时，取物反馈必须来自实时镜头。
    if (armOut(this.arm)) s.viewing = false;

    if (s.phase === 'exposing') {
      // 曝光期间必须守在机位前。走开 = 云台失控 = 这一卷废了。
      // 这条规则是「拍片」和「按一个按钮然后等」的全部区别。
      if (this.at !== 'camera') {
        this.failShot('你离开了机位。云台自己转过去了，这一卷从头到尾是一面舱壁。');
        return;
      }
      // 那个东西有没有进过取景框。进过一次就算拍到了。
      s.caught = !!s.capture?.direction?.identified;
      if(s.siteEvidence!==undefined){
        s.sensorSampleLeft=(s.sensorSampleLeft??.5)-dt;
        if(s.sensorSampleLeft<=0 && (s.sensorFrames?.length??0)<10){
          s.sensorSampleLeft+=.5;
          // One actual render per sample, never duplicate a frame to fill a time jump.
          try {const frame=this.captureSensorFrame?.();if(frame)s.sensorFrames?.push(frame);}catch{/* Missing samples cannot count as footage. */}
        }
      }
      s.exposeLeft = Math.max(0, s.exposeLeft - dt);
      if (s.exposeLeft > 0) return;

      // 曝光完了，送去冲洗。线框分析是本地的，不等网络。
      s.phase = 'developing';
      s.developed = 0;
      this.onCue?.('cloth.rustle', 0.5);
      this.pushLog('快门合上。磁头在走，雪花屏还亮着 —— 这段时间你可以去干别的。', 'system');
      const shape = s.capture ?? this.captureFootage(s.purpose);
      const direction = shape.direction!;
      this.footageRepeats.set(direction.episode, direction.repeat);
      const prompt = buildFootagePrompt(shape);
      // Retry can remove anatomy, never the guaranteed physical evidence.
      const fallbackPrompt = buildFootagePrompt({ ...shape, creature: null, tracesOnly: true });
      let frameHash=2166136261,frameHash2=5381;
      for(const char of s.keyframe??'') {
        frameHash=Math.imul(frameHash^char.charCodeAt(0),16777619);
        frameHash2=Math.imul(frameHash2,33)^char.charCodeAt(0);
      }
      s.cacheKey = footageCacheKey(prompt, fallbackPrompt) + `:frame:${s.keyframe?.length??0}:${frameHash>>>0}:${frameHash2>>>0}`;
      if(s.siteEvidence===undefined)this.commitAnalysis(s.purpose);
      this.archiveTape(false);
      const tape = this.tapes.at(-1)!;
      tape.prompt = prompt;
      tape.fallbackPrompt = fallbackPrompt;

      const sink = this.footageSink;
      if (!sink) {
        this.settleShot(s.token, false, '视频服务未启用；本卷仅保存本地底片，未提交生成任务。');
        return;
      }
      sink({
        keyframe: s.keyframe,
        cacheKey: s.cacheKey,
        legId: s.legId,
        prompt,
        fallbackPrompt,
        token: s.token,
        settle: (token, ok, reason, creatureMissing, promptOnly) =>
          this.settleShot(token, ok, reason, creatureMissing, promptOnly),
      });
      return;
    }

    if (s.phase === 'developing') {
      s.developed += dt;
      if(s.siteEvidence!==undefined && s.developed>=12){
        const local=this.tapes.find(t=>t.id===`tape.${s.token}`);
        if(local && !local.ready){
          local.ready=true;
          this.pushLog('机载调查底片显影完成，可在分析台读取。远端视频状态单独显示。','system');
        }
      }
      if(s.siteEvidence!==undefined && s.developed>=12 && s.pendingResult){
        const r=s.pendingResult;s.pendingResult=undefined;
        this.settleShot(s.token,r.ok,r.reason,r.creatureMissing,r.promptOnly);return;
      }
      if (s.developed >= s.developMax) {
        this.settleShot(s.token, false, '显影超时，读取机载磁带。');
      }
    }
  }

  /**
   * 冲洗有结果了。
   *
   * token 不对就直接丢掉 —— 玩家可能已经离站、重拍、或者死了，
   * 而那卷片子拍的是另一个地方。
   */
  private settleShot(token: number, ok: boolean, reason?: string, creatureMissing?: boolean, promptOnly?: boolean): void {
    const s = this.shot;
    if (token !== s.token || s.phase !== 'developing') return;
    if(s.siteEvidence!==undefined && s.developed<12){
      s.pendingResult={ok,reason,creatureMissing,promptOnly};return;
    }
    s.reason = reason ?? '';
    if (!ok) {
      this.videoStatus = '本地底片 · 非生成视频';
      this.pushLog(reason ?? '视频生成失败，切换本地底片。', 'system');
    }
    s.phase = 'ready';
    s.viewing = false;
    this.pushLog(ok&&!promptOnly?'录像已送达分析台，请前往分析台查看。':'未收到生成视频，请到分析台查看任务状态。','system');
    if (creatureMissing) s.caught = false;
    const tape = this.tapes.find(t => t.id === `tape.${s.token}`);
    if (tape) tape.ready = true;
    if(tape){tape.videoResult=promptOnly?'prompt':ok?'video':'failed';tape.videoError=reason;}
    if (tape && creatureMissing) {
      tape.creatureMissing = true;
      tape.caughtThreat = null;
    }
    if (tape?.direction) {
      this.pushLog(`回收录像 · ${FOOTAGE_STATE_CN[tape.direction.state]} · 记录 ${tape.direction.repeat}`, 'system');
      if (tape.direction.evidence) this.pushLog(tape.direction.traceCN, 'eerie');
    }
    this.onCue?.('knowledge.gain', 0.7);
    this.pushLog(
      promptOnly
        ? 'GM · 无视频模式。接口没动。屏幕上是这一卷的描述提示词。'
        : !ok ? '机载底片已保存。这不是远端生成的视频。' : '视频已接收并解码，录像可以回放。',
      promptOnly || !ok ? 'system' : 'good',
    );

    // 拍到了那个东西 —— 冲出来就等于看清了。这是摄影机在警报态里
    // 真正的用处：你花九秒和一格电，换一个「它到底是什么」。
    if (s.siteEvidence===undefined && ok && !promptOnly && s.caught && this.threat && tape?.direction?.encounter === this.threat.encounter && tape?.caughtThreat === this.threat.creature.id && !this.threat.known
      && this.threat.phase !== 'struck' && this.threat.phase !== 'repelled') {
      this.pushLog('片子的第三秒，它在画面里。', 'eerie');
      this.identify();
    } else if (creatureMissing && this.threat && !this.threat.known) {
      // 重试那一卷里没有它。这句话必须说出来，否则玩家会以为
      // 「拍了但没看清」是个 bug，而不是一次运气不好。
      this.pushLog('没有恢复出它的身体。但异常留下的痕迹仍在这一卷里。', 'eerie');
    }
  }

  private archiveTape(creatureMissing: boolean): void {
    const s = this.shot;
    const idx = s.purpose === 'survey' ? Math.min(this.legIndex + 1, ACT_COUNT - 1) : this.legIndex;
    const vol = this.chart[idx] ?? this.volume;
    const fauna = s.capture?.direction?.fauna ?? [];
    const siteName =
      s.purpose === 'survey' ? actAt(Math.min(this.legIndex + 1, ACT_COUNT - 1)).leg.siteName : this.leg.siteName;
    this.tapes.push({
      simulationReport:s.capture?.simulationReport?.slice(),
      sensorFrames:s.sensorFrames?.slice(),
      siteEvidence:s.siteEvidence,
      sensorEvidence:s.siteEvidence!==undefined,
      keyframe: s.keyframe,
      ready: false,
      direction: s.capture?.direction,
      cacheKey: s.cacheKey,
      id: `tape.${s.token}`,
      legId: s.legId,
      siteName,
      purpose: s.purpose,
      atBreath: this.breaths,
      fauna,
      caughtThreat: s.capture?.direction?.identified ?? null,
      creatureMissing,
      analyzed: false,
      report: [],
    });
    this.tapeCursor = this.tapes.length - 1;
    this.pushLog(`片盒里多了一卷。习性要送到${stationRef('lab')}才能拆出来。`, 'system');
  }

  cycleTape(dir: -1 | 1): void {
    if (!this.tapes.length) {
      this.pushLog('片盒是空的。先去摄像头拍一卷。', 'system');
      this.onCue?.('ui.error', 0.4);
      return;
    }
    this.tapeCursor = (this.tapeCursor + dir + this.tapes.length) % this.tapes.length;
    this.onCue?.('ui.select', 0.4);
    const t = this.selectedTape;
    if (t) this.pushLog(`读片机咬住：${t.siteName} · ${TAPE_PURPOSE_CN[t.purpose]}。`, 'system');
  }

  /**
   * 把当前这卷送进读片机。几何分析在冲洗时已经本地做完了；
   * 这里拆的是画面里那些东西的名字和习性。
   */
  analyzeTape(): void {
    const tape = this.selectedTape;
    if (!tape) {
      this.pushLog(`片盒是空的。先在${stationRef('camera')}拍一卷，等它冲出来。`, 'system');
      this.onCue?.('ui.error', 0.5);
      return;
    }
    if(tape.videoResult==='prompt'&&tape.ready!==false&&this.at==='lab'&&this.powered){
      tape.report=['GM 模拟分析 · 非AI视频识别 · 仅读取曝光时的系统快照',...(tape.simulationReport??['旧录像未保存模拟分析快照，请在无视频模式下重新曝光。']),'该报告不授予正式剧情证据，也不能验证生成视频质量。'];
      tape.analyzed=true;this.onCue?.('knowledge.gain',.6);
      for(const line of tape.report)this.pushLog(line,'system');return;
    }
    if (tape.analyzed) {
      this.pushLog('这一卷已经拆过。报告还在屏上。', 'system');
      return;
    }
    if (tape.ready === false) {
      this.pushLog('这一卷还在显影。等回收完成后再分析。', 'system');
      return;
    }
    if (!this.powered) {
      this.pushLog('读片机是电的。总闸拉着，灯丝是冷的。', 'bad');
      this.onCue?.('ui.error', 0.55);
      return;
    }
    if(tape.siteEvidence!==undefined){
      if(this.at!=='lab'){this.pushLog('请在分析台读取调查底片。','system');return;}
      if(tape.legId!==this.leg.id || !this.authoredSite?.analyzeEvidence){
        this.pushLog('本卷调查底片不属于当前设施。','system');return;
      }
      const generated=tape.videoResult==='video';
      const playable=generated || (tape.sensorFrames?.length??0)>=3;
      if(!playable){this.pushLog('无可播放录像：本地感光帧不足，请重新曝光。','system');return;}
      const lines=this.authoredSite.analyzeEvidence({capture:structuredClone(tape.siteEvidence),media:{
        playable,mediaId:tape.id,source:generated?'generated-video':'controlled-video'
      }});
      this.power = clamp01(this.power - ANALYZE_POWER);
      tape.report=[generated?'远端生成录像 · 调查核验':'本地感光录像备份 · 非AI，逐帧传感记录',...lines];
      tape.analyzed=true;
      const evidenceReady=this.authoredSite.evidenceReady;
      if(evidenceReady===true || (this.legIndex!==0 && evidenceReady===undefined && lines.length>0))
        this.campaign.record(this.legIndex,'film');
      this.onCue?.('knowledge.gain',.75);
      for(const line of tape.report)this.pushLog(line,'system');
      return;
    }
    if(tape.videoResult!=='video'){
      this.pushLog('未收到有效视频，不能据此确认生物或取得录像证据。','system');return;
    }
    this.power = clamp01(this.power - ANALYZE_POWER);
    this.addNoise(0.08);
    if (this.mode === 'calm') this.spend(ANALYZE_BREATHS, 0.2);
    else this.breathAcc += ANALYZE_BREATHS * 0.45;
    this.onCue?.('knowledge.gain', 0.75);

    const ids = [...tape.fauna];
    if (tape.caughtThreat && !ids.includes(tape.caughtThreat)) ids.push(tape.caughtThreat);
    const report: string[] = [];
    if (tape.direction) {
      report.push(`拍摄状态：${FOOTAGE_STATE_CN[tape.direction.state]}；记录序号 ${tape.direction.repeat}；异常强度 ${tape.direction.intensity}/6。`);
      if (tape.direction.evidence) report.push(tape.direction.traceCN);
    }
    if (tape.creatureMissing) report.push('未恢复怪物身体；保留环境与异常痕迹。');
    if (!ids.length) {
      report.push(tape.direction?.evidence ? '未确认生物身份；异常痕迹不能当成安全证明。' : '没有异常活物。只有几何和悬浮物。');
    }
    for (const id of ids) {
      const c = creature(id);
      const first = !this.filed.has(id);
      this.filed.add(id);
      if (this.threat && tape.direction?.encounter === this.threat.encounter && this.threat.creature.id === id && !this.threat.known
        && this.threat.phase !== 'repelled' && this.threat.phase !== 'struck') {
        this.identify();
      } else if (first) {
        this.vitals.shock(Math.ceil(c.sanCost * 0.35), 'sight');
      }
      const drive = c.weakness.map(counterLine).join('，或') || '没有已知办法';
      const avoid = c.provokes.length ? `  别做：${c.provokes.map(counterLine).join('、')}` : '';
      report.push(first ? c.name : `${c.name}（档案里有过）`);
      const profile = hunterProfile(c, tape.direction?.act ?? this.legIndex);
      report.push(c.danger === 0 ? '普通深海生物 · 无攻击威胁' : `威胁等级 ${profile.rank}/5 · 异常前兆：${profile.tell}`);
      report.push(`${KIN_CN[c.kin]} · ${DANGER_CN[c.danger] ?? ''} · ${ATTRACTOR_CN[c.attractor]} · ${sonarLabelOf(c)}`);
      report.push(`驱离：${drive}。${avoid}`);
      report.push(c.advice);
      if (c.onPass) report.push(c.onPass.line);
      this.pushLog(
        first
          ? `读片机：${c.name}。${ATTRACTOR_CN[c.attractor]}。${c.advice}`
          : `读片机：${c.name}，档案里有过。`,
        first ? 'eerie' : 'system',
      );
    }
    tape.analyzed = true;
    const sourceChapter=ROUTE.findIndex(leg=>leg.id===tape.legId);
    if(sourceChapter>=0 && this.campaign.has(sourceChapter,'arrival')) {
      this.campaign.record(sourceChapter,'film');
      report.push(CAMPAIGN_STORY[sourceChapter]!.film);
    }
    tape.report = report;

    const v = this.volume;
    if (v && !v.identified && tape.legId === this.leg.id) {
      for (const line of identifyVolume(v, ids)) this.pushLog(line, 'eerie');
      this.siteShadow = this.buildShadow();
      this.contacts = this.buildContacts(this.sweepPower as 0 | 1 | 2);
      this.pushLog(`读片机把这一间的内部写进全息屏了。去${stationRef('nav')}。对准开口，推过去。`, 'good');
    }
  }

  /**
   * 换段：机械手归位，上一关的箱子清账。箱子 id 是按关生成的，留着没有意义。
   *
   * **弃掉的臂不会在换段时长回来。** 这是它之所以算一个决定的全部理由：
   * 不是冷却，不是损坏，是没有了。
   */
  private resetArm(): void {
    if (armAlive(this.arm)) this.arm = newArm();
    this.containers.clear();
    this.containerItems.clear();
    this.searchedBox = null;
    this.selectedBoxItem = null;
    this.armCargo = null;
    this.geoCache = null;
    // 后果是那一间房的事。离开那间房，泄漏和外泄的声音就留在那儿了 ——
    // 唯一跟着走的是 breach 抬上去的那一档进水，因为破的是舱，不是房
    this.fx.flash = 0;
    this.fx.spill = 0;
    this.fx.lure = 0;
    // 那句话还是要说的（它是刚才那一爪的结果），但「接下来还能翻几爪」
    // 已经没有意义了 —— 房间在身后关上了
    this.cueQueue = [];
    this.afterLine = null;
    const p = this.pendingLine;
    this.pendingLine = null;
    if (p) this.pushLog(p.text, p.tone);
  }

  /** 把摄影机退回待机。token++ 让还在路上的冲洗结果失效 */
  private resetShot(): void {
    const s = this.shot;
    s.token++;
    s.phase = 'idle';
    s.legId = '';
    s.exposeLeft = 0;
    s.developed = 0;
    s.reason = '';
    s.caught = false;
    s.viewing = false;
    s.purpose = 'identify';
  }

  private failShot(reason: string): void {
    const s = this.shot;
    s.phase = 'failed';
    s.reason = reason;
    s.viewing = false;
    s.exposeLeft = 0;
    this.onCue?.('ui.error', 0.55);
    this.pushLog(reason, 'bad');
    this.pushLog('屏幕切回监视回路 —— 那点雪花至少是实时的。', 'system');
  }

  // ==========================================================================
  // 机械手
  // ==========================================================================

  /** 镜头的竖直半视场（弧度）。和 cameraOnTarget 用同一条换算 */
  get camHalfFov(): number {
    return 0.55 / this.camZoom;
  }

  /**
   * 镜头在房间坐标里的位姿。
   *
   * 云台是**叠在舱首上**的：camPan / camTilt 是相对舱首的弧度，
   * heading / pitch 是舱首相对房间的度。两套单位在这里合成一次，
   * 全息屏和摄像头从此读的是同一个方位。
   */
  cameraEye(): Eye {
    return {
      pos: { ...this.cabinPos },
      yaw: ((this.heading + (this.camPan * 180) / Math.PI) % 360 + 360) % 360,
      pitch: clamp(this.pitch + (this.camTilt * 180) / Math.PI, -86, 86),
    };
  }

  /** 当前这一间的面片与障碍。不在站点上、或者还没进房间时是 null */
  roomGeo(): RoomGeometry | null {
    const v = this.volume;
    if (!v || this.phase !== 'site' || !this.volumeAt) return null;
    const node = v.nodes.find((n) => n.id === this.volumeAt);
    if (!node) return null;
    const key = `${v.id}:${node.id}:${node.obstacles.length}`;
    if (this.geoCache?.key === key) return this.geoCache.geo;
    const geo = buildRoom(v, node);
    this.geoCache = { key, geo };
    return geo;
  }

  private ensureContainers(): void {
    const geo = this.roomGeo();
    if (!geo) return;
    const role = this.volume?.nodes.find((n) => n.id === geo.nodeId)?.role ?? 'chamber';
    for (const o of geo.obstacles) {
      if (o.kind !== 'crate') continue;
      if (this.containers.has(o.id)) continue;
      this.containers.set(
        o.id,
        rollContainer(this.containerRng.fork(o.id), o.id, geo.nodeId, role, {
          memory: this.memory,
          depth01: this.depth01,
          // 尾声那两段的箱子更容易是他的东西。线索该往结局收拢，不该一直摊着
          storyBeat: this.legIndex >= ACT_COUNT - 2 ? 'end' : 'trail',
        }),
      );
    }
  }

  /** 机械手认得的全部事实。工位、电、光、有没有停稳 */
  armConditions(): ArmConditions {
    return {
      atCamera: this.at !== null && canonicalStation(this.at) === 'camera',
      atSalvage: this.at === 'salvage',
      powered: this.powered,
      lit: this.lit,
      onStation: this.phase === 'site',
    };
  }

  /**
   * 现在瞄着哪一只。
   *
   * **没有光就返回 null** —— 臂的前端没有传感器，那块屏是唯一的反馈。
   * 这一条是硬的：它就是「为什么要走回摄像头开探照灯」的全部理由。
   */
  get armTarget(): ArmTarget | null {
    if (this.phase !== 'site' || !this.powered) return null;
    if (!this.lit) return null;
    const geo = this.roomGeo();
    if (!geo) return null;
    this.ensureContainers();
    const eye = this.cameraEye();
    const t = acquireTarget(geo, eye, this.camHalfFov);
    if (!t) return null;
    const container = this.containers.get(t.obstacleId);
    if (!container) return null;
    return { obstacleId: t.obstacleId, pos: t.pos, dist: t.dist, offAxis: t.offAxis, aimHint: armAimHint(eye, t), container };
  }

  /** 摄像头始终显示下一步；伸出只是准备，不等于已经取物。 */
  get armInstruction(): string {
    const a = this.arm;
    if (!armAlive(a)) return '机械臂已丢失，无法翻找。';
    if (a.phase === 'hauling') return `正在收回 · ${a.timer.toFixed(1)} 秒，到位后取得所选物资。`;
    if (a.phase === 'jammed') return '按 C 使用应急回路收回机械臂。';
    if (!this.powered) return armOut(a) ? '供电中断，仍可按 C 应急收回。' : '先恢复供电。';
    if (a.phase === 'aiming' && this.searchedBox) return this.boxItems.length
      ? '在右侧选择箱内物资，按 C 收回一件；其余留在箱内。'
      : '箱内已无物资，按 C 收回。';
    if (a.phase === 'gripping') return `正在翻找 · ${a.timer.toFixed(1)} 秒后结算，提前按 C 会中断。`;
    if (!this.lit) return '按 3 开探照灯，再瞄准货箱。';
    if (a.phase === 'extending') return `正在伸出 · ${a.timer.toFixed(1)} 秒。到位后还需按 F 翻找。`;
    const t = this.armTarget;
    const block = blockRummage(a, this.armConditions(), t, t?.container ?? null);
    if (block === 'overheat') return '本次翻找次数已满，按 C 收回机械臂。';
    if (!t) return `用方向键把准星移到可见箱面；距箱面须在 ${ARM.reach} 米内，有遮挡需绕开。`;
    if (t.container.exhausted) return '这只箱子已翻空，换一个目标或按 C 收臂。';
    if (a.phase === 'stowed') return 'R 伸出 → 方向键瞄准 → F 翻找 → C 收臂。';
    if (block === 'offaxis') return `尚未对准，用方向键 ${t.aimHint}。准星合拢后按 F。`;
    if (block === 'ok') return a.passes === 0
      ? '已对准，尚未翻找：按 F 查看箱内物资；按 C 空臂收回。'
      : '按 F 查看箱内物资，选中后按 C 收回。';
    return ARM_FAIL[block] ?? ARM_FAIL.target;
  }

  /** 每个动作现在能不能按。按钮上的因果和日志里的因果读的是同一份 */
  armBlock(kind: 'extend' | 'rummage' | 'retract' | 'wrench' | 'purge' | 'purge-fire'): ArmBlock {
    const c = this.armConditions();
    if (kind === 'retract') return blockRetract(this.arm, c);
    if (kind === 'wrench') return blockWrench(this.arm, c);
    if (kind === 'purge') return blockPurgeArm(this.arm, c);
    if (kind === 'purge-fire') return blockPurgeFire(this.arm, c);
    const t = this.armTarget;
    if (kind === 'extend') return blockExtend(this.arm, c, !!t);
    return blockRummage(this.arm, c, t, t?.container ?? null);
  }

  /** 这一间里货箱的标注。摄像头实景渲染器按 obstacleId 认它们 */
  roomMarks(): RoomMark[] {
    const geo = this.roomGeo();
    if (!geo) return [];
    this.ensureContainers();
    const lit = this.lit;
    const target = this.armTarget;
    const aimedId = this.arm.gripId ?? target?.obstacleId ?? null;
    const out: RoomMark[] = [];
    for (const o of geo.obstacles) {
      const c = this.containers.get(o.id);
      if (!c) continue;
      const mark: RoomMark = {
        obstacleId: o.id,
        label: c.exhausted ? '空壳' : OBSTACLE_CN.crate,
        aimed: o.id === aimedId,
        aimPoint: target?.obstacleId === o.id ? target.pos : undefined,
      };
      // 封条是灯照出来的。黑着的时候屏上只有一个方块，这才是「去开灯」的理由
      if (lit) {
        mark.seal = sealReadout(c).title;
        mark.searched = c.searched;
        mark.passes = c.passes;
      }
      out.push(mark);
    }
    return out;
  }

  /**
   * 伸出去。
   *
   * 这是整段作业里最贵的一下：泵一咬住就不会停，噪音从这一秒开始往上爬，
   * 而机械手在外面的每一秒都是一个可以被撞断的东西。
   */
  extendArm(): void {
    if(this.authoredSite){this.authoredSite.interact();return;}
    const target = this.armTarget;
    const block = blockExtend(this.arm, this.armConditions(), !!target);
    if (block !== 'ok' || !target) {
      this.onCue?.('ui.error', 0.55);
      this.pushLog(ARM_FAIL[block] ?? ARM_FAIL.target, block === 'busy' ? 'system' : 'bad');
      return;
    }
    this.shot.viewing = false;
    this.searchedBox = this.containerItems.has(target.obstacleId) ? target.obstacleId : null;
    this.selectedBoxItem = this.boxItems[0]?.id ?? null;
    beginExtend(this.arm);
    this.power = clamp01(this.power - 0.01);
    this.addNoise(0.2);
    this.emitOutside('arm.pump-start', 0.85);
    if (this.mode === 'calm') this.spend(ARM.extendCost, 0.45);
    else this.breathAcc += ARM.extendCost * 0.45;
    this.pushLog('机械手出护套。液压泵咬住了 —— 这个声音在水里传得比你以为的远。', 'bad');
    const r = sealReadout(target.container);
    this.pushLog(`探照灯扫到封条：${r.title}。${r.hint}`, 'eerie');
  }

  /**
   * 翻一爪。
   *
   * 准星必须几乎压在箱子上 —— 云台偏一点就插空。一次伸出翻不了太多爪，
   * 所以每一爪之后玩家都要重新回答那个问题：再翻一爪，还是现在收。
   */
  rummage(): void {
    if(this.authoredSite){this.authoredSite.interact();return;}
    const t = this.armTarget;
    const block = blockRummage(this.arm, this.armConditions(), t, t?.container ?? null);
    if (block !== 'ok' || !t) {
      this.onCue?.('ui.error', 0.5);
      if (block === 'offaxis' && t) {
        const off = ((t.offAxis * 180) / Math.PI).toFixed(0);
        this.pushLog(`准星偏箱子 ${off}°，尚未取物。${t.aimHint}；显示可插入后按 F。`, 'system');
      } else {
        this.pushLog(ARM_FAIL[block] ?? ARM_FAIL.target, block === 'ok' ? 'system' : 'bad');
      }
      return;
    }
    // 偏角记在状态上：咬死概率算的是插进去那一下，之后转云台改不了它
    this.searchedBox = null;
    this.selectedBoxItem = null;
    beginGrip(this.arm, t.obstacleId, t.offAxis);
    this.addNoise(0.1);
    this.emitOutside('arm.claw-wet', 0.8);
    this.pushLog('爪子插进去了。屏上看得见它在里面摸。', 'system');
  }

  /** 收回来。收回的过程本身也要两秒多，而那两秒它还挂在外面 */
  retractArm(): void {
    const block = blockRetract(this.arm, this.armConditions());
    if (block !== 'ok') {
      this.onCue?.('ui.error', 0.45);
      this.pushLog(ARM_FAIL[block] ?? ARM_FAIL.stowed, 'system');
      return;
    }
    const chosen = this.boxItems.find(item => item.id === this.selectedBoxItem && item.n > 0);
    this.armCargo = chosen && this.searchedBox ? { box: this.searchedBox, id: chosen.id } : null;
    beginHaul(this.arm);
    this.emitOutside('arm.pump-stop', 0.6);
    if (this.mode === 'calm') this.spend(ARM.haulCost, 0.35);
    else this.breathAcc += ARM.haulCost * 0.4;
    this.pushLog('开始收。液压的声音在往回走，但它还没有进护套。', 'system');
  }

  /**
   * 拽。
   *
   * 卡爪唯一的「用力」解法：花气、很响、不保证成功，但每拽一下下一次的
   * 概率都会涨。平静态里它只是贵；警报态里它是一次真正的赌 ——
   * 红点在靠近，而你在用两只手跟一条卡在别人箱子里的钢管较劲。
   */
  wrenchArm(): void {
    const block = blockWrench(this.arm, this.armConditions());
    if (block !== 'ok') {
      this.onCue?.('ui.error', 0.45);
      this.pushLog(ARM_FAIL[block] ?? ARM_FAIL.nojam, 'system');
      return;
    }
    const p = wrenchChance(this.arm);
    this.power = clamp01(this.power - 0.015);
    this.addNoise(ARM.wrenchNoise);
    this.emitOutside('arm.wrench', 1);
    this.onShake?.(0.45);
    if (this.mode === 'calm') this.spend(ARM.wrenchCost, 0.6);
    else this.breathAcc += ARM.wrenchCost * 0.5;

    const grabbed = armGrabbed(this.arm);
    const ok = this.rng.next() < p;
    wrenchPull(this.arm, ok);
    if (ok) {
      this.hull = clamp01(this.hull - ARM.wrenchHull);
      this.pushLog(
        grabbed
          ? '它松手了 —— 或者是被拽断了。臂弹回来的时候，爪齿之间夹着一小片不是金属的东西。'
          : '齿缝里那块铁皮撕开了。整条臂弹回来，带着一片别人箱子上的漆。',
        'good',
      );
      this.pushLog('肘节已经歪了，这一趟翻不动了。它正在往回收。', 'system');
    } else {
      this.hull = clamp01(this.hull - ARM.wrenchHull * 2);
      this.leak += ARM.wrenchHull * 0.006;
      if (grabbed) {
        // 抢失败会缩短剩余时间。这条必须在日志里说清楚，否则玩家会觉得自己被坑了
        this.pushLog('你拽，它也拽。臂往回来了半米，然后被拖回去了一米。', 'bad');
        this.pushLog(
          `还剩 ${this.arm.grabLeft.toFixed(1)}s。下一下 ${(wrenchChance(this.arm) * 100).toFixed(0)}% ——` +
            '每一次没抢回来，它就往里多攥一点。',
          'system',
        );
      } else {
        this.pushLog('什么都没动。舱体被自己的液压拽得歪了一下，根部在响。', 'bad');
        this.pushLog(`下一下会好一点 —— 大概 ${(wrenchChance(this.arm) * 100).toFixed(0)}%。而刚才那一下整片海都听见了。`, 'system');
      }
    }
    this.wakeSite('拽的声音不像任何一种水声。有东西听见了。');
    this.checkSurvival();
  }

  /**
   * 掀开液压接头的保险盖。
   *
   * 弃臂的第一段。这一下什么都不会坏 —— 它只是让那根红手柄露出来，
   * 露 ARM.purgeWindowSec 秒。这几秒是实时的，警报态里照样从引信上扣。
   */
  armPurge(): void {
    const block = blockPurgeArm(this.arm, this.armConditions());
    if (block !== 'ok') {
      this.onCue?.('ui.error', 0.45);
      this.pushLog(ARM_FAIL[block] ?? ARM_FAIL.stowed, 'system');
      return;
    }
    if (this.arm.purgeLeft > 0) {
      // 盖已经掀开了 —— 这一次按的是手柄
      this.armPurgeFire();
      return;
    }
    armPurgeCover(this.arm);
    this.onCue?.('ui.confirm-irreversible', 0.9);
    this.pushLog(
      '你掀开了液压接头上那块黄黑条纹的保险盖。底下是一根红色手柄，' +
        '手柄旁边压着一行厂里压出来的字：拉下后不可复位。',
      'bad',
    );
    this.pushLog(
      `盖子的弹簧在往回推。${ARM.purgeWindowSec.toFixed(0)} 秒之内再按一次，这条臂就不再属于这条舱。`,
      'system',
    );
  }

  /**
   * 按下红手柄。爆炸螺栓炸开接头 —— 这一趟再也没有机械手。
   *
   * 换来的是：不必再收臂，现在就能全速起步；那条臂砸在下面某个东西上的声音
   * 会把外面的注意力拉到另一个方位去。
   */
  private armPurgeFire(): void {
    const block = blockPurgeFire(this.arm, this.armConditions());
    if (block !== 'ok') {
      this.onCue?.('ui.error', 0.5);
      this.pushLog(
        block === 'swing'
          ? '盖子还在往上弹，手柄还没露到够得着的位置。'
          : (ARM_FAIL[block] ?? ARM_FAIL.cover),
        'system',
      );
      return;
    }
    const wasJammed = this.arm.phase === 'jammed';
    jettisonArm(this.arm);
    this.addNoise(ARM.purgeNoise);
    this.emitOutside('arm.coupler-blow', 1);
    this.onShake?.(0.9);
    this.vitals.restore({ fear: 12 });
    if (this.mode === 'calm') this.spend(2, 0.5);

    this.pushLog(
      '爆炸螺栓在舱壁里响了一声，那一声是从骨头里传过来的。液压油喷了半秒，' +
        '屏幕上是一团黑。然后那条臂从画面里落了下去。',
      'bad',
    );
    this.pushLog(
      wasJammed
        ? '它还咬着那只箱子，一起掉下去。你在屏上最后看见的是自己缠的那七圈胶带。'
        : '它一路撞着下面的东西，响了很久。你缠的那七圈胶带在最后一帧里还在。',
      'eerie',
    );
    this.pushLog('接头盖板上现在是一个还在渗油的孔。这一趟不会再有机械手了 —— 翻箱、打捞、切割锁，全部到此为止。', 'bad');

    // 换来的第一样东西：不必再等收臂，推进器现在就能上满
    this.throttle = 3;
    this.pushLog('推进器解锁到三档。没有东西挂在外面了。', 'good');

    // 换来的第二样东西：那条臂落下去的声音不在你这一侧
    const t = this.threat;
    if (t && t.phase === 'contact') {
      t.fuse = Math.min(t.fuseMax, t.fuse + ARM.purgeDecoySec);
      this.pushLog('红点朝那个方位偏过去了。它去看那条臂了 —— 你有一点时间。', 'good');
    }
    this.checkSurvival();
  }

  // ==========================================================================
  // 一爪的声音时间轴
  // --------------------------------------------------------------------------
  // 内容层给的 cueTrack 不是一堆音效，是一段**可以被打断的过程**：
  // 伸出去、碰到、咬住、拔回来。少了「咬住」那一下就是空的；在该咬住之前
  // 就断掉、而且没有拔回来那一下，就是出事了。
  //
  // 所以这里做两件事：按 at 排期，以及**等轴走完才说话**。那半秒到一秒的
  // 差值是这套机制的全部价值 —— 玩家先用耳朵知道结果，再用眼睛确认。
  // 反过来（先弹日志再放声音）的话，声音就退化成了装饰。
  // ==========================================================================

  /**
   * 把一爪的声音排进队列，并把那句话压到轴的后面。
   *
   * `upgrade` 负责把内容层顶着用的 cue 换成真的 —— 见 upgradeTrackCue。
   */
  private scheduleTrack(res: SearchResult, ctx: TrackContext): void {
    const track = res.cueTrack;
    if (!track || track.length === 0) {
      // 没有轴就退回单音，话也就不用等了
      if (res.cue) this.emitOutside(res.cue, res.cueGain ?? 0.6);
      this.pushLog(ctx.line, ctx.tone);
      this.afterLine?.();
      this.afterLine = null;
      return;
    }
    this.cueQueue = [];
    this.cueClock = 0;
    let end = 0;
    for (let i = 0; i < track.length; i++) {
      const step = track[i]!;
      const cue = this.upgradeTrackCue(step, i, track, ctx);
      // 第一爪要先听见封条。内容层说它「缺得最可惜」—— 封条是这套机制里
      // 唯一的先验，撕开它是玩家每次验证自己判断的那一刻，它必须有声音。
      // 插在碰到材质之前：先撕开，才摸得到里面是什么
      if (i === 1 && ctx.firstPass && cue !== 'crate.seal-peel') {
        this.cueQueue.push({
          at: Math.max(0.12, step.at - 0.3),
          cue: 'crate.seal-peel',
          gain: Math.min(0.62, step.gain * 0.85),
          space: true,
        });
      }
      this.cueQueue.push({ at: step.at, cue, gain: step.gain, space: true });
      end = Math.max(end, step.at);
    }
    this.cueQueue.sort((a, b) => a.at - b.at);
    // 尾音要留出来。最后一下响完之前不要弹字
    this.pendingLine = { text: ctx.line, tone: ctx.tone, after: end + TRACK_TAIL };
  }

  /**
   * 时间轴上的一下该用哪个真 cue。
   *
   * containers.ts 的 CUE_SUBSTITUTIONS 里列着九条「想要 → 顶着」。它顶着用的
   * id 都是别的域的真音效（雷达阵列转动顶伺服、阀门顶棘轮），所以不能按 id
   * 一刀切地换 —— 那会把货真价实的 `item.pickup` 也一起换掉。
   *
   * 能无歧义换的有两类：
   *   · **按位置**：轴的结构是固定的（index 0 永远是伺服，index ≥ 2 永远是
   *     咬住/收回/失速这三下之一），所以这四条可以放心换成真的机械臂音。
   *   · **按上下文**：index 1 是箱子自己的材质音。刮水泥只发生在压载格里、
   *     抽照片只发生在这一爪掏出了遗物的时候 —— 这些条件这一层都知道。
   */
  private upgradeTrackCue(
    step: CueStep,
    i: number,
    track: readonly CueStep[],
    ctx: TrackContext,
  ): string {
    // --- 机械臂的四下：按位置 ---
    if (i === 0) return 'arm.servo';
    if (i >= 2) {
      if (step.cue === 'item.pickup') return gripCue(ctx.claw); // 咬住：按爪次疲
      if (step.cue === 'valve.turn') return 'arm.retract';
      if (step.cue === 'door.jam') return 'arm.motor-stall';
    }
    if (i !== 1) return step.cue;

    // --- 箱子的材质：按上下文 ---
    // 第一爪碰到的是封条。这是玩家唯一一次验证先验的时刻，它必须有自己的声音
    if (ctx.firstPass && (step.cue === 'door.jam' || step.cue === 'hatch.wheel')) {
      return 'crate.seal-peel';
    }
    // 箱盖不是门。门后面是走廊，箱盖下面是一个空腔
    if (step.cue === 'hatch.wheel') return 'crate.lid-open';
    // 翻箱时的布料只有一种：泡烂的制服填充物
    if (step.cue === 'cloth.rustle') return 'fabric.tear';
    // 这一爪掏出来的是照片或信 —— 那就是相纸从口袋里抽出来的声音
    if (step.cue === 'paper.rustle' && ctx.paper) return 'photo.slide';
    // 压载格里没有货，只有让它压秤的水泥
    if (step.cue === 'step.metal' && ctx.concrete) return 'concrete.scrape';
    return step.cue;
  }

  /** 排在队列里的声音。走完最后一下才把那句话放出去 */
  private tickCueTrack(dt: number): void {
    if (!this.cueQueue.length && !this.pendingLine) return;
    this.cueClock += dt;
    while (this.cueQueue.length && this.cueQueue[0]!.at <= this.cueClock) {
      const step = this.cueQueue.shift()!;
      if (step.space) this.emitOutside(step.cue, step.gain);
      else this.onCue?.(step.cue, step.gain);
    }
    const p = this.pendingLine;
    if (p && this.cueClock >= p.after) {
      this.pendingLine = null;
      this.pushLog(p.text, p.tone);
      this.afterLine?.();
      this.afterLine = null;
    }
  }

  /**
   * 不等了，立刻说。
   *
   * 两种情况用它：又来了一爪（上一句还压着），以及玩家离站/起步（这条轴
   * 不会再有机会走完）。队列里剩下的声音直接丢掉 —— 那几下声音的意义是
   * 「过程还在走」，过程已经被打断了，补放只会听着像回声。
   */
  private flushTrack(): void {
    this.cueQueue = [];
    const p = this.pendingLine;
    this.pendingLine = null;
    if (p) this.pushLog(p.text, p.tone);
    const after = this.afterLine;
    this.afterLine = null;
    after?.();
  }

  /**
   * 放一个「在外面」的声音。
   *
   * 舱内那一百多个 cue 一个都不走这条路 —— 它们本来就在你脑袋旁边。
   * 只有摄像头画面里那一侧发生的事才带位置：爪子在右前方三米，
   * 声音就该偏右、闷一点、带这间房的尾巴。
   */
  emitOutside(cue: string, gain: number): void {
    const room = this.roomAcoustics;
    this.onCue?.(cue, gain, {
      // 爪子够不到的时候（还没瞄上）就按满臂长算 —— 声音来自臂的前端，
      // 而臂的前端总是在那儿
      dist: this.armTarget?.dist ?? ARM.reach,
      // 臂焊死在舱首，云台是转的：镜头转向右边，那条臂就滑到画面左侧，
      // 声音也该跟着偏左。这和 armPose.sway 用的是同一条换算
      pan: clamp(-this.camPan / 1.2, -1, 1),
      room: room.size,
      flooded: room.flooded,
    });
  }

  // ==========================================================================
  // 后果标签
  // --------------------------------------------------------------------------
  // 上一版这十种 tag 只有文案的区别：噪音 +0.45、扣一点舱体，然后散场。
  // 于是「电解液渗出来」和「他的下颌在动」在玩法上是同一件事。
  //
  // 下面每一条都必须**改变玩家接下来能做什么**。做不到这一点的分支不该存在。
  // ==========================================================================

  /** 结算一个 tag。返回 true = 这一爪的常规结算要跳过（后果已经接管了） */
  private applyTag(tag: SearchTag, dur: number, obstacleId: string): void {
    switch (tag) {
      // --- 机械手被制住的两种：一种能等，一种等不起 ---
      case 'arm.jam': {
        const sec = dur > 0 ? dur : 8;
        beginJam(this.arm, obstacleId, sec, 0);
        this.addNoise(0.3);
        this.emitOutside('arm.jam', 0.95);
        this.onShake?.(0.28);
        this.arm.lastLine = '爪齿卡在压条底下';
        this.pushLog(
          `压条翻起来的铁皮咬住了爪齿。电机在失速 —— 大约 ${sec.toFixed(0)} 秒之后钢会自己回弹，` +
            '也可以现在就花气去拽。泵一直响着，这笔账你自己算。',
          'bad',
        );
        break;
      }
      case 'grabbed': {
        const sec = dur > 0 ? dur : 10;
        beginJam(this.arm, obstacleId, 0, sec);
        this.addNoise(0.42);
        this.emitOutside('arm.jam', 1);
        this.onShake?.(0.5);
        this.vitals.restore({ fear: 14 });
        this.arm.lastLine = '有东西攥住了爪';
        this.pushLog(
          '不是卡住 —— 有东西从里面攥住了爪，而且在往里拽。液压表的针在往回走。',
          'bad',
        );
        this.pushLog(
          `${sec.toFixed(0)} 秒。要么把它拽出来（每一下都可能让它攥得更紧），` +
            '要么断开接头，把这条臂留给它。',
          'system',
        );
        break;
      }

      // --- 持续三秒到十几秒的三条 ---
      case 'flash': {
        const sec = dur > 0 ? dur : 4;
        this.fx.flash = Math.max(this.fx.flash, sec);
        this.emitOutside('electric.arc', 0.9);
        this.pushLog(
          `整间房被照亮了 ${sec.toFixed(0)} 秒 —— 不用探照灯，什么都看得见。趁现在看。`,
          'eerie',
        );
        // 光趋性的东西会朝这一下过来。免费的光从来不是免费的
        const t = this.threat;
        if (t && t.creature.attractor === 'light') {
          t.fuse = Math.max(2, t.fuse - sec * 0.8);
          this.pushLog('它喜欢光。这一下等于替它点了路。', 'bad');
        }
        break;
      }
      case 'spill': {
        const sec = dur > 0 ? dur : 10;
        this.fx.spill = Math.max(this.fx.spill, sec);
        this.emitOutside('water.pressure-jet', 0.8);
        this.pushLog(
          `液体顺着爪一路淌到舱体上，还在流。它在吃钢，也在吃那条臂的胶管 ——` +
            `大约 ${sec.toFixed(0)} 秒。`,
          'bad',
        );
        break;
      }
      case 'lure': {
        const sec = dur > 0 ? dur : 12;
        this.fx.lure = Math.max(this.fx.lure, sec);
        this.emitOutside('item.metal-clatter', 0.9);
        this.pushLog(
          `散开的东西还在往下掉，一件接一件。这不是一声 —— 是一段 ${sec.toFixed(0)} 秒的声音，` +
            '而且它一直在往外传。',
          'bad',
        );
        break;
      }

      // --- 一次性的四条 ---
      case 'breach': {
        this.leak += BREACH_LEAK;
        this.onCue?.('hull.rivet-pop', 0.9);
        this.onShake?.(0.35);
        this.pushLog('结构让开了一道。进水速率永久上了一档 —— 这一趟剩下的时间里它不会再降回来。', 'bad');
        break;
      }
      case 'wake': {
        // 「直接推进遭遇，不等噪音阈值」。已经有东西在路上就把引信砍掉一半 ——
        // 醒过来的不是远处那个，是这间房里的这个
        const t = this.threat;
        if (t && t.phase === 'contact') {
          t.fuse = Math.max(2, Math.min(t.fuse, t.fuse * 0.45));
          this.emitOutside('creature.breath-sync', 0.8);
          this.pushLog('它不在靠近了 —— 它已经在这间房里。刚才那一爪把它叫醒的。', 'eerie');
        } else {
          this.emitOutside('creature.skitter', 0.75);
          this.pushLog('那一爪之后，这间房里的东西醒了。它不需要先听见噪音。', 'eerie');
          this.wakeSite('黑水里有什么改变了姿势。');
        }
        this.vitals.restore({ fear: 8 });
        break;
      }
      case 'contact': {
        // 认知冲击，不是物理伤害。hull 一点都不掉 —— 这是这条 tag 存在的理由
        this.vitals.restore({ fear: 22 });
        this.corruption = clamp01(this.corruption + 0.05);
        this.emitOutside('flesh.wet', 0.75);
        this.pushLog('爪子碰到的不是货。你把手柄松开了，但那已经传上来了。', 'eerie');
        break;
      }
      case 'quiet': {
        // result.noise 已经是 0 了。这里只负责让玩家**知道**他刚才很安静
        this.arm.lastLine += ' · 这一爪没有声音';
        this.pushLog('这一爪出奇地安静。外面什么都没听见 —— 这种运气一趟不会有第二次。', 'good');
        break;
      }
      case 'keepsake':
        // 先给一个「有东西在爪心里」的提示，真正的展示排在那句话之后 ——
        // 遗物值得单独一行，而单独一行只有在它不和别的字挤在一起时才成立
        this.onCue?.('photo.slide', 0.4);
        this.pushLog('爪合上的时候手感不对。里面有一件不该在货箱里的东西。', 'eerie');
        this.keepsakePending = true;
        break;
    }
  }

  /** 三条持续后果的每帧结算 */
  private tickFx(dt: number): void {
    const f = this.fx;
    if (f.flash > 0) {
      f.flash = Math.max(0, f.flash - dt);
      if (f.flash === 0) this.pushLog('那点光烧完了。屏上又只剩探照灯照得到的那一小块。', 'system');
    }
    if (f.spill > 0) {
      f.spill = Math.max(0, f.spill - dt);
      this.hull = clamp01(this.hull - dt * SPILL_HULL_PER_SEC);
      this.leak += dt * SPILL_LEAK_PER_SEC;
      // 也在吃那条臂：胶管被泡过之后，回路撑不了那么久
      if (armOut(this.arm)) this.arm.pump += dt * SPILL_ARM_WEAR;
      if (f.spill === 0) {
        this.pushLog('淌下来的东西停了。它经过的地方留下一道亮的、发白的痕。', 'system');
        this.checkSurvival();
      }
    }
    if (f.lure > 0) {
      f.lure = Math.max(0, f.lure - dt);
      // 持续声源：不是一次脉冲，所以它每一帧都在往噪音里加，也每一帧都在缩引信
      this.addNoise(dt * LURE_NOISE_PER_SEC);
      if (f.lure === 0) this.pushLog('最后一件东西落到底了。这间房重新安静下来。', 'system');
    }
  }

  /** 一爪的结算。箱子说出代价，这里付账 */
  private resolveGrip(obstacleId: string): void {
    const c = this.containers.get(obstacleId);
    if (!c) return;
    // 上一爪的轴还没走完就又来了一爪：把上一句话立刻放出去，绝不让它被顶掉。
    // 日志少一行是那种没有人会报告、但玩家会觉得「这游戏有点不对」的 bug
    this.flushTrack();
    const pass = c.searched;

    const claw = Math.max(0, this.arm.passes - 1);
    this.searchedBox = obstacleId;
    const existing = this.containerItems.get(obstacleId);
    if (existing) {
      this.selectedBoxItem = existing[0]?.id ?? null;
      this.arm.lastLine = '已显示箱内物资，选择一件后收回。';
      return;
    }
    // 一次翻找展示整箱内容；不触发随机损失、卡爪或抓臂事件。
    const res = searchContainer(c, this.containerRng.fork(`${obstacleId}#${pass}`), this.memory, true);
    const items: { id: SupplyId; n: number }[] = [];
    const add = (batch: readonly (readonly [SupplyId, number])[]) => {
      for (const [id, n] of batch) {
        if (n <= 0) continue;
        const item = items.find(item => item.id === id);
        if (item) item.n += n;
        else items.push({ id, n });
      }
    };
    add(res.gained);
    while (c.searched < c.passes) {
      add(searchContainer(c, this.containerRng.fork(`${obstacleId}#${c.searched}`), this.memory, true).gained);
    }
    this.containerItems.set(obstacleId, items);
    c.exhausted = items.length === 0;
    this.selectedBoxItem = items[0]?.id ?? null;

    this.addNoise(res.noise);
    if (res.hull > 0) {
      this.hull = clamp01(this.hull - res.hull);
      this.leak += res.hull * 0.004;
      this.onShake?.(0.4);
      this.vitals.injure(6);
    }
    if (this.mode === 'calm') this.spend(res.cost, 0.5);
    else this.breathAcc += res.cost * 0.45;

    // 掏出来的东西先结算 —— 那句话要等声音走完才说，但物资不能等
    const keepsakeIds = res.gained.filter(([id]) => STORY_SUPPLY_IDS.includes(id)).map(([id]) => id);
    let line = res.line;
    let tone: LogTone = res.outcome === 'hazard' ? 'bad' : 'system';
    if (items.length) {
      this.arm.lastLine = '箱内物资已显示。选择一件，再按 C 收回。';
      line = this.arm.lastLine;
      tone = 'good';
    } else {
      this.arm.lastLine = '箱内已无物资。可以收回机械臂。';
    }

    // 轴走完之后还要说的事：遗物、组合结论、下一步。它们排在那句话后面，
    // 顺序就是玩家意识到它们的顺序
    const after = () => {
      if (this.keepsakePending || keepsakeIds.length) {
        this.keepsakePending = false;
        this.showKeepsake(keepsakeIds);
      }
      const said = noticeCombination(this.memory);
      if (said) {
        this.onCue?.('knowledge.gain', 0.55);
        this.pushLog(said, 'eerie');
      }
      this.sayNextGrip(c);
    };

    // 声音排期。**话压在轴后面** —— 玩家先听见爪没回来，才读到那一行字
    this.afterLine = after;
    this.scheduleTrack(res, {
      line,
      tone,
      claw,
      firstPass: pass === 0,
      paper: keepsakeIds.length > 0,
      concrete: c.archetype === 'sup.ballast',
    });

    // 箱内列表模式不施加会阻止玩家取回物资的翻找后果。
    if (res.outcome === 'hazard' && res.tag !== 'quiet' && res.tag !== 'wake') {
      this.wakeSite('爆开的声音在这间房里荡了三下。有东西听见了。');
    }
    this.checkSurvival();
  }

  /**
   * 遗物时刻。
   *
   * 内容层要求这些东西「值得单独展示一次，不要混进物资滚动条」。所以它自己
   * 一行、自己一个声音、而且**不写它值多少钱** —— 这是这套内容里唯一一批
   * 没有数值的东西，把它们摆到物资清单里就等于告诉玩家它们是耗材。
   */
  private showKeepsake(ids: readonly SupplyId[]): void {
    const list = ids.length ? ids : [];
    for (const id of list) {
      const def = supply(id);
      this.onCue?.('photo.slide', 0.5);
      this.pushLog(`——${def.name}。${def.desc}`, 'eerie');
    }
    if (!list.length) {
      this.onCue?.('photo.slide', 0.45);
      this.pushLog('爪心里躺着的不是补给。你把它放到台面上，没有记进清单。', 'eerie');
    }
  }

  /** 每一爪之后把下一个决定摆回玩家面前。这是这套机制的节奏所在 */
  private sayNextGrip(c: ContainerState): void {
    if (!armAlive(this.arm) || this.arm.phase === 'jammed') return;
    if (this.containerItems.has(c.obstacleId)) {
      this.pushLog(c.exhausted ? '箱内已空，按 C 收回。' : '箱内物资已列在右侧。选中一件，按 C 收回。', 'system');
      return;
    }
    const left = Math.min(c.passes - c.searched, ARM.maxPasses - this.arm.passes);
    if (c.exhausted) {
      this.pushLog('这只箱子见底了。收回来，或者把云台扫到下一只。', 'system');
    } else if (left <= 0) {
      this.pushLog('肘节烫得厉害。这一次伸出翻不了更多了 —— 收回来让它凉。', 'system');
    } else {
      this.pushLog(`还能再翻 ${left} 爪。泵每多响一秒，外面就多知道一点。`, 'system');
    }
  }

  private tickArm(dt: number): void {
    if (this.arm.phase === 'stowed' || this.arm.phase === 'gone') {
      // 手收回去了，保险盖也就没有意义了
      this.arm.purgeLeft = 0;
      return;
    }
    for (const ev of stepArm(this.arm, dt, this.armConditions())) {
      switch (ev.kind) {
        case 'noise':
          this.addNoise(ev.amount);
          break;
        case 'phase':
          if (ev.phase === 'stowed') {
            this.authoredSite?.armEvent?.('stowed');
            this.emitOutside('arm.stow', 0.7);
            const cargo = this.armCargo;
            this.armCargo = null;
            if (cargo) {
              const items = this.containerItems.get(cargo.box) ?? [];
              const item = items.find(item => item.id === cargo.id && item.n > 0);
              if (item) {
                item.n--;
                this.containerItems.set(cargo.box, items.filter(item => item.n > 0));
                const c = this.containers.get(cargo.box);
                if (c) c.exhausted = !items.some(item => item.n > 0);
                this.arm.lastLine = `已取回：${this.takeLoot([[cargo.id, 1]])}`;
                this.pushLog(this.arm.lastLine, 'good');
                this.selectedBoxItem = this.boxItems[0]?.id ?? null;
              }
            }
          }
          else if (this.arm.limp) this.emitOutside('arm.pump-stop', 0.55);
          this.pushLog(ev.line, ev.tone);
          break;
        case 'wake':
          this.wakeSite(ev.line);
          break;
        case 'strain':
          this.hull = clamp01(this.hull - ev.hull);
          this.onCue?.('hull.crack', 0.5);
          this.pushLog(ev.line, 'bad');
          this.checkSurvival();
          break;
        case 'unjam':
          // 松开的声音比咬住的时候轻 —— 这条规则也写进了增益里
          this.emitOutside('arm.retract', 0.5);
          this.pushLog(ev.line, 'good');
          this.pushLog('爪空着，臂还在外面。这一趟的翻找到此为止 —— 收回来。', 'system');
          break;
        case 'torn':
          this.tearArm(ev.line);
          break;
        case 'grip':
          if(this.authoredSite?.armEvent?.('grip',ev.obstacleId))break;
          this.resolveGrip(ev.obstacleId);
          break;
      }
    }
  }

  /**
   * 被攥住的倒计时走完了。
   *
   * 和弃臂的区别：这一次不是玩家断的接头，是外面的东西替他断的。所以他
   * 拿不到弃臂换来的那两样东西 —— 没有「立刻全速」的补偿，也没有那条臂
   * 落在别处当诱饵。同一个结局，两种代价。
   */
  private tearArm(line: string): void {
    jettisonArm(this.arm);
    this.emitOutside('arm.coupler-blow', 1);
    this.onShake?.(0.8);
    this.addNoise(0.5);
    this.vitals.restore({ fear: 26 });
    this.hull = clamp01(this.hull - 0.06);
    this.leak += 0.03;
    this.pushLog(line, 'bad');
    this.pushLog(
      '接头盖板上现在是一个还在渗油的孔，边缘是往外翻的 —— 它是从外面被拽开的。' +
        '这一趟不会再有机械手了。',
      'bad',
    );
    this.pushLog('推进器解锁到三档。没有东西挂在外面了 —— 这不是补偿，这只是事实。', 'system');
    this.throttle = 3;
    this.checkSurvival();
  }

  // ==========================================================================
  // 打捞
  // ==========================================================================

  private salvageCache(cache: Volume['caches'][number]): void {
    const v = this.volume;
    if (!v) return;
    if (!v.identified) {
      this.pushLog('三只箱子在雷达上是同一个方块。封条颜色要拍了才知道。', 'system');
      return;
    }
    const key = `cache.${cache.node}`;
    if ((this.salvaged.get(key) ?? 0) > 0) {
      this.pushLog('这只箱子你捞过了。', 'system');
      return;
    }
    this.salvaged.set(key, 1);
    this.power = clamp01(this.power - 0.012);
    this.addNoise(cache.truth === 'trap' ? 0.72 : 0.32);
    this.emitOutside('arm.pump-start', 0.7);
    if (this.mode === 'calm') this.spend(5, 0.5);
    else this.breathAcc += 2.2;
    if (cache.truth === 'empty') {
      this.emitOutside('arm.claw-wet', 0.7);
      this.pushLog('封条是骨白的。里面是水。机械臂空抓了一把。', 'system');
      return;
    }
    if (cache.truth === 'trap') {
      this.collide(40);
      this.pushLog('封条是锈血。感应雷。声呐上看它和旁边那只活电箱一模一样。', 'bad');
      this.wakeSite('爆炸声在近场荡开。有东西听见了。');
      return;
    }
    this.emitOutside('arm.claw-metal', 0.8);
    this.onCue?.('item.pickup', 0.85);
    const got = this.takeLoot(cache.loot);
    this.arm.lastLine = `已取回：${got}`;
    this.pushLog(`活电箱。机械臂缩回来：${got}。`, 'good');
  }

  /** 站点残骸/机关作业与精细翻箱共用一条臂，不能同时操作。 */
  get salvageBlock(): string | null {
    if (this.at !== 'camera') return `先到${stationRef('camera')}。`;
    if (this.phase !== 'site') return '尚未到站';
    if (!this.powered) return '液压泵没有电';
    if (!armAlive(this.arm)) return '机械臂已丢失';
    if (armOut(this.arm)) return '先按 C 收回正在翻箱的机械臂';
    const v = this.volume;
    const lock = v?.locks.find(l => l.node === this.volumeAt);
    if (lock) {
      if (!v?.identified) return '先拍摄并分析机关';
      if (lock.solved) return '机关已经打开';
      if (lock.kind === 'weak-cut' && this.count('sup.cutter') <= 0) return '缺少切割器';
      return null;
    }
    const cache = v?.caches.find(c => c.node === this.volumeAt);
    if (cache) {
      if (!v?.identified) return '先拍摄并分析箱体';
      return (this.salvaged.get(`cache.${cache.node}`) ?? 0) > 0 ? '这只箱子已捞过' : null;
    }
    return this.siteWreck() ? null : '此处没有可搜索的残骸';
  }

  salvage(): void {
    const block = this.salvageBlock;
    if (block) {
      this.pushLog(block, 'system');
      this.onCue?.('ui.error', 0.5);
      return;
    }
    this.shot.viewing = false;
    // 打捞台上的那根操纵杆现在连着一个渗油的孔
    if (!armAlive(this.arm)) {
      this.pushLog('操纵杆推到底也没有任何反应。接头那边什么都没有连着了。', 'bad');
      this.onCue?.('ui.error', 0.55);
      return;
    }
    const v = this.volume;
    if (v && v.locks.some((l) => l.node === this.volumeAt)) {
      this.operateLock();
      return;
    }
    const cache = v?.caches.find((c) => c.node === this.volumeAt);
    if (cache) {
      this.salvageCache(cache);
      return;
    }
    const w = this.siteWreck();
    if (!w) {
      this.pushLog(
        this.phase === 'transit'
          ? '机械臂伸出去，够到的只有流过去的水。得先开到站点上。'
          : '这个站点已经被你掏空了。',
        'system',
      );
      return;
    }
    if (!this.powered) {
      this.pushLog('机械臂是电动的。总闸拉着。', 'bad');
      return;
    }
    const n = this.salvaged.get(w.id) ?? 0;
    this.salvaged.set(w.id, n + 1);
    this.power = clamp01(this.power - 0.012);
    this.addNoise(w.noise);
    this.emitOutside('arm.pump-start', 0.8);
    if (this.mode === 'calm') this.spend(w.cost, 0.5);
    else this.breathAcc += w.cost * 0.45;

    // 机械臂是整个站点上最吵的东西。伸出去 = 告诉附近的一切你在这。
    // 这让「捞不捞」变成一个真的决定，而不是一个免费按钮。
    this.wakeSite('机械臂的液压声在这片废墟里荡开。有东西听见了。');

    const batch = w.loot[Math.min(n, w.loot.length - 1)] ?? [];
    if (!batch.length) {
      this.emitOutside('arm.claw-wet', 0.7);
      this.arm.lastLine = `${w.name}：未取得物资。`;
      this.pushLog(`${w.name}：这一爪什么都没夹到。`, 'system');
      return;
    }
    this.emitOutside('arm.claw-metal', 0.8);
    this.onCue?.('item.pickup', 0.85);
    const got = this.takeLoot(batch);
    this.arm.lastLine = `已取回：${got}`;
    this.pushLog(`机械臂缩回来：${got}。`, 'good');
  }

  // ==========================================================================
  // 物资
  // ==========================================================================

  /** 在当前工位使用一件物资。返回是否真的用掉了 */
  useSupply(id: SupplyId): boolean {
    const def = supply(id);
    if (this.count(id) <= 0) return false;
    if (def.station && (!this.at || canonicalStation(this.at) !== canonicalStation(def.station))) {
      this.pushLog(`${def.name}得在${STATIONS[def.station].name}用。`, 'system');
      this.onCue?.('ui.error', 0.5);
      return false;
    }
    this.consume(id);
    this.addNoise(def.noise);
    if (this.mode === 'calm') this.spend(def.cost, 0.3);
    else this.breathAcc += def.cost * 0.4;

    this.applySupply(id);
    // 用掉一件就空出一格，台面上排队的东西该进来了
    this.drainBench();
    this.tryCounter({ kind: 'supply', supply: id });
    return true;
  }

  /**
   * 用下去之后发生了什么。
   *
   * 最初十种物资的效果硬写在下面的 switch 里。后来捞上来的那些把效果写成了
   * 数据（`Supply.effect`），所以这里先看数据 —— 于是 content 层再长多少种
   * 物资，模拟层都不用再加一个 case。
   *
   * 两条路互斥：有 `effect` 的不进 switch，switch 里的十种没有 `effect`，
   * 所以不会双重结算。
   */
  private applySupply(id: SupplyId): void {
    const eff = supply(id).effect;
    if (eff) {
      if (eff.power) this.power = clamp01(this.power + eff.power);
      if (eff.hull) this.hull = clamp01(this.hull + eff.hull);
      if (eff.flood) this.flood = clamp01(this.flood + eff.flood);
      if (eff.scrubber) this.scrubber = clamp01(this.scrubber + eff.scrubber);
      if (eff.leak) this.leak = Math.max(0, this.leak + eff.leak);
      // 生理三项走 vitals 的 0..100 刻度。restore 是加算，负值就是往下压
      if (eff.fear || eff.co2 || eff.fatigue) {
        this.vitals.restore({ fear: eff.fear ?? 0, co2: eff.co2 ?? 0, fatigue: eff.fatigue ?? 0 });
      }
      // 负的 noiseBurst 是「这一下反而把噪音压下去了」（润滑脂）
      if (eff.noiseBurst) {
        if (eff.noiseBurst > 0) this.addNoise(eff.noiseBurst);
        else this.noise = clamp01(this.noise + eff.noiseBurst);
      }
      this.pushLog(eff.log, eff.tone);
      this.checkSurvival();
      return;
    }

    const v = this.vitals.vitals;
    switch (id) {
      case 'sup.cell':
        this.power = clamp01(this.power + 0.42);
        this.onCue?.('power.breaker', 0.9);
        this.pushLog('配电盘的指针弹了一下，然后稳住了。电力回来了。', 'good');
        break;
      case 'sup.sealant':
        this.leak = Math.max(0, this.leak - 0.0026);
        this.onCue?.('flesh.wet', 0.5);
        this.pushLog('胶在裂缝里发热，味道像烧头发。水声小下去了。', 'good');
        break;
      case 'sup.filter':
        this.scrubber = clamp01(this.scrubber + 0.55);
        this.vitals.restore({ co2: -Math.min(26, v.co2) });
        this.onCue?.('breath.regulator', 0.8);
        this.pushLog('换上新滤芯。第一口气是甜的。', 'good');
        break;
      case 'sup.stim':
        this.vitals.restore({ fear: -Math.min(42, v.fear), fatigue: -Math.min(30, v.fatigue) });
        this.onCue?.('heart.skip', 0.9);
        this.pushLog('针扎进大腿。恐惧退潮了。你的心跳现在大得整个舱都听得见。', 'neutral');
        break;
      case 'sup.wax':
        this.earsPlugged = true;
        this.onCue?.('cloth.rustle', 0.6);
        this.pushLog('蜡塞进耳朵。世界一下子只剩下你自己的血流声。', 'eerie');
        break;
      case 'sup.tape':
        this.hull = clamp01(this.hull + 0.06);
        this.pushLog('胶带缠了七圈。它不结实，但它在。', 'system');
        break;
      case 'sup.cutter':
        this.operateLock(undefined, true);
        break;
      case 'sup.flare':
        this.flareLeft = 40;
        this.onCue?.('match.strike', 0.9);
        this.pushLog('信号管抛出去，在水里烧起来。你第一次看清了外面有多空。', 'neutral');
        break;
      case 'sup.lure':
        this.onCue?.('sonar.chirp', 0.7);
        this.pushLog('诱饵打出去了。两百米外，有个铁罐开始替你叫唤。', 'neutral');
        break;
      case 'sup.pulse':
        this.power = clamp01(this.power - 0.22);
        this.onCue?.('sonar.boom', 1);
        this.onShake?.(0.45);
        this.pushLog('全部电力灌进换能器。舱里的每一颗铆钉都跟着响了一声。', 'bad');
        break;
    }
  }

  // ==========================================================================
  // 生命维持
  // ==========================================================================

  toggleBlackout(): void {
    this.blackout = !this.blackout;
    this.onCue?.('power.breaker', 1);
    if (this.blackout) {
      this.lamp = false;
      this.pushLog('总闸拉下。舱里只剩下你的呼吸，和外面。', 'eerie');
      this.tryCounter({ kind: 'blackout' });
    } else {
      this.pushLog('合闸。灯一盏一盏回来。', 'system');
    }
  }

  bail(): void {
    this.flood = clamp01(this.flood - 0.055);
    this.onCue?.('water.splash', 0.8);
    this.addNoise(0.18);
    if (this.mode === 'calm') this.spend(7, 0.8);
    else this.breathAcc += 3;
    this.pushLog('用头盔往排水口舀。水位下去一点点。你的手已经没有知觉了。', 'neutral');
  }

  rest(): void {
    if (this.mode === 'alert') {
      this.pushLog('现在不是喘气的时候。', 'bad');
      return;
    }
    const v = this.vitals.vitals;
    this.vitals.restore({ fear: -Math.min(14, v.fear), fatigue: -Math.min(22, v.fatigue) });
    this.spend(10, 0.05);
    this.pushLog('你靠在冰凉的舱壁上数了十口气。什么都没发生。这本身很可疑。', 'neutral');
  }

  // ==========================================================================
  // 威胁
  // ==========================================================================

  private tickThreat(dt: number): void {
    if (this.huntActIndex !== this.legIndex) {
      this.huntActIndex = this.legIndex;
      this.suspicion = 0;
      this.huntRecoveryUntil = this.clock + (this.legIndex === 0 ? 35 : 12);
    }
    const t = this.threat;
    if (!t) {
      if (this.phase === 'site' && !this.authoredSite?.managesThreats && this.clock >= this.huntRecoveryUntil) {
        const ecology = hunterProfile(creature(huntAct(this.legIndex).creature), this.legIndex);
        const stimulus = this.noise * ecology.sound + (this.powered && this.lit ? ecology.light : 0)
          + (this.blackout ? 0 : this.throttle / 3 * ecology.motion);
        this.suspicion = Math.max(0, this.suspicion + dt * (stimulus - 0.28));
        if (this.suspicion === 0) this.footageRepeats.delete(`${this.legIndex}.anomaly.${this.encounterSerial}`);
        if (this.suspicion >= huntAct(this.legIndex).threshold) {
          this.spawnThreat(huntAct(this.legIndex).creature, 45 + (6 - this.legIndex) * 4);
          this.suspicion = 0;
          return;
        }
      }
      this.checkThreatBeats();
      return;
    }
    // 已经结束的遭遇：等余韵走完，然后把红点从雷达上抹掉。
    // 这里用 clock 而不是 setTimeout —— 模拟层不许碰浏览器 API，
    // 否则平衡脚本就没法在无头环境里跑完一整条航线。
    if (t.phase === 'repelled' || t.phase === 'struck') {
      if (t.clearAt !== null && this.clock >= t.clearAt) {
        this.threat = null;
        this.contacts = this.contacts.filter((c) => c.id !== 'threat');
      }
      return;
    }

    // Warning is a separate clock: noise and wrong counters cannot erase the response window.
    if(this.authoredSite?.spatialThreat)return;
    if (t.behavior === 'warning') {
      t.warningLeft = Math.max(0, t.warningLeft - dt);
      t.cueLeft -= dt;
      if (t.cueLeft <= 0) {
        t.cueLeft = 2.4;
        this.onCue?.('hull.crack', 0.85);
        this.onCue?.(t.hunter.cue, 0.7);
        this.onShake?.(0.75);
        // Repeated physical impacts fatigue the hull before the final strike.
        // Preserve the response window: warning impacts alone cannot sink the pod.
        const beforeHull=this.hull;
        this.hull=Math.min(this.hull,Math.max(.30,this.hull-.035));
        if(beforeHull>.5&&this.hull<=.5){
          this.onCue?.('terminal.beep',1);
          this.pushLog('艇体完整度低于 50%：正常舱灯降功率，红色应急照明接管。','bad');
        }
      }
      if (t.warningLeft <= 0) this.strike();
      return;
    }
    // A sustained safe state also works when it was set before the warning started.
    const passive = t.creature.weakness.find(w =>
      (w.kind === 'blackout' && this.blackout) ||
      (w.kind === 'lampoff' && !this.lit) ||
      (w.kind === 'fullstop' && this.throttle === 0 && this.noise < 0.15));
    t.quietFor = passive ? t.quietFor + dt : 0;
    if (passive && t.quietFor >= 3) {
      this.tryCounter(passive);
      return;
    }
    // Noise, light and propulsion have different weights for each ecology.
    const watching = !!this.volume?.echoes.some((e) => e.kind === 'watcher') && !this.volume?.shifted;
    const speed = 0.55 + this.noise * t.hunter.sound
      + (this.powered && this.lit ? t.hunter.light : 0)
      + (this.blackout ? 0 : this.throttle / 3 * t.hunter.motion);
    if (watching) {
      const hold = t.fuseMax * 0.42;
      t.fuse = Math.max(hold, t.fuse - dt * speed * 0.22);
    } else {
      t.fuse = Math.max(0, t.fuse - dt * speed);
    }
    t.range = clamp(t.fuse / t.fuseMax, 0.04, 1);
    t.bearing += Math.sin(this.clock * 0.31 + t.fuseMax) * dt * 0.09;

    if (t.behavior === 'investigate' && t.range < 0.55) {
      t.behavior = 'stalk';
      this.onCue?.(t.hunter.cue, 0.6);
      this.pushLog('异响绕到了舱后。实时镜头仍然只有空水；拍摄回收录像才能辨认它。', 'eerie');
    }

    if (t.fuse <= 0) {
      t.behavior = 'warning';
      t.warningLeft = t.hunter.warning;
      t.cueLeft = 2.4;
      this.onCue?.('hull.crack', 1);
      this.onCue?.(t.hunter.cue, 0.85);
      this.onShake?.(0.55);
      this.pushLog(t.hunter.tell, 'bad');
      this.pushLog(`舱体承压异常。应对窗口约 ${Math.ceil(t.warningLeft)} 秒。${t.creature.advice}`, 'system');
    }

    // 雷达上的红点跟着它走。不重新打脉冲也能看见它在靠近 ——
    // 余辉会留下一条朝你弯过来的弧，这是警报态里最有用的信息。
    const existing = this.contacts.find((c) => c.id === 'threat');
    if (existing && (t.phase === 'contact' || t.phase === 'identified')) {
      existing.bearing = t.bearing;
      existing.range = t.range;
      existing.label = t.known ? t.creature.name : t.creature.designation;
    }
  }

  /**
   * 站点上的东西什么时候出来。
   *
   * 两条路：你伸机械臂把它吵醒（wakeSite），或者你在这儿待够久，
   * 它自己找过来。航渡途中不会有红点 —— 路上只有墙，站点上才有东西。
   * 这让「到站」这件事本身带着分量。
   */
  private checkThreatBeats(): void {
    if(this.authoredSite?.managesThreats)return;
    if (this.phase !== 'site') return;
    if (this.clock < this.huntRecoveryUntil) return;
    if (this.siteBreaths < SITE_PATIENCE) return;
    this.wakeSite('你在这块废墟上待得太久了。近场回波里多了一个不属于地形的东西。');
  }

  /** 把站点上还没出来的那个东西叫出来 */
  private wakeSite(line: string, forced?: CreatureId): void {
    if(this.authoredSite?.managesThreats)return;
    if (this.phase !== 'site' || this.threat) return;
    if (this.clock < this.huntRecoveryUntil) return;
    const leg = this.leg;
    const id =
      forced ??
      (this.volume ? siteThreatOf(this.volume) : null) ??
      leg.threats[0]?.creature;
    if (!id) return;
    const key = `${leg.id}@${id}`;
    if (this.firedBeats.has(key)) return;
    this.firedBeats.add(key);
    this.pushLog(line, 'eerie');
    const fuse = leg.threats[0]?.fuse ?? 70;
    this.spawnThreat(id, fuse);
  }

  /** Explicit GM fixture: real attack state, without submitting video requests. */
  gmEnterLevel(level:number):string {
    if(!Number.isInteger(level)||level<1||level>ACT_COUNT)return '关卡编号必须是1—7的整数。';
    if(this.outcome.kind!=='alive')return '请先开始一局存活中的游戏。';
    if(['exposing','developing'].includes(this.shot.phase))return '请等待当前曝光／显影结束后再切换关卡。';
    if(!this.createAuthoredSite)return '场景加载器尚未就绪。';
    this.gmLevelSession=true;this.pilot.stop();this.navDriveEngaged=false;
    this.pilotInput={thrust:0,yaw:0,pitch:0,brake:false};this.pilotInputUntil=0;this.heaveUntil=0;
    this.authoredSite?.dispose();this.authoredSite=null;this.authoredSiteError='';
    this.legIndex=level-1;this.phase='transit';this.threat=null;this.mode='calm';
    this.pending.length=0;this.storyCaption='';this.storyCaptionLeft=0;
    this.campaign.resetForGm(this.legIndex);this.firedBeats.clear();this.resetShot();
    this.arm=newArm();this.charging=false;this.camPan=this.camTilt=0;this.camZoom=1;
    this.openingReceived=true;this.beginLeg(this.legIndex);this.arrive();
    this.walkTo('camera');
    const message=this.authoredSiteError||`GM · 已进入第${level}关：${this.leg.siteName}。本次为测试会话，不覆盖正式存档；关卡机关重新开始。`;
    this.pushLog(message,'system');return message;
  }
  gmInvasion(seconds=120):string {
    if(this.outcome.kind!=='alive')return '请先开始一局存活中的游戏。';
    if(this.shot.phase==='exposing'||this.shot.phase==='developing')return '当前曝光或生成尚未结束，请等待后再触发。';
    if(this.phase!=='site')this.arrive();
    this.ensureAuthoredSite();
    this.pilot.stop();this.navDriveEngaged=false;
    this.shot.viewing=false;
    // GM invasion tests a physical attacker, not chapter one's bodiless false echo.
    this.spawnThreat('cre.veil',1);
    const t=this.threat!;
    t.behavior='warning';t.fuse=0;t.warningLeft=clamp(seconds,15,300);t.cueLeft=0;
    this.onCue?.('hull.crack',1);this.onShake?.(.55);
    const message=`GM · 怪物入侵：撞击已开始，${t.warningLeft} 秒后执行真实攻击，可造成损伤或死亡。按 Esc 关闭指令台，前往摄像机曝光。此指令不自动生成视频。`;
    this.pushLog(message,'bad');return message;
  }

  spawnThreat(id: CreatureId, fuse: number): void {
    const c = creature(id);
    const precursor = `${this.legIndex}.anomaly.${this.encounterSerial}`;
    const priorRecordings = this.footageRepeats.get(precursor) ?? 0;
    this.threat = {
      encounter: ++this.encounterSerial,
      hunter: hunterProfile(c, this.legIndex),
      behavior: 'investigate',
      warningLeft: 0,
      cueLeft: 0,
      quietFor: 0,
      creature: c,
      bearing: this.rng.float(-Math.PI, Math.PI),
      range: 1,
      phase: 'contact',
      fuse,
      fuseMax: fuse,
      known: false,
      lookedAt: 0,
      mistakes: 0,
      phantom: c.look.plan === 'absent',
      clearAt: null,
    };
    if (priorRecordings) {
      this.footageRepeats.set(`encounter.${this.threat.encounter}`, priorRecordings);
      this.footageRepeats.delete(precursor);
    }
    this.mode = 'alert';
    this.breathAcc = 0;
    this.onCue?.('terminal.beep', 1);
    this.onCue?.('listener.call', 0.6);
    this.pushLog('回声雷达报警。一个红点。它没有编号，因为编号是给已知的东西用的。', 'bad');
    this.bus.emit('shake', { amount: 0.3 });
  }

  weaponAmmo:Record<WeaponId,number>={decoy:4,pulse:3};
  private spatialRunnerReport(id:CreatureId):string[]{
    if(id==='cre.runner'&&this.authoredSite?.spatialThreat)return ['空间突进者：短暂预警后快速绕障接近，蓄势后冲撞，冲撞后有恢复窗口。','应对：冲击弹需瞄准，命中暂时打断；声诱饵暂时干扰。关闭压力门可阻挡，武器命中不等于驱逐。'];
    const c=creature(id);return [`驱离条件：${c.weakness.map(counterLine).join('，或')}。`,c.advice];
  }
  weaponReadyAt=-Infinity;
  lastCombat:CombatRecord|null=null;
  fireWeapon(weapon:WeaponId):boolean {
    const t=this.threat;
    if(this.at!=='camera'||this.outcome.kind!=='alive'||!t||['repelled','struck'].includes(t.phase))return false;
    if(this.clock<this.weaponReadyAt||this.weaponAmmo[weapon]<=0){this.pushLog('发射器冷却中或弹药耗尽。','system');return false;}
    this.weaponAmmo[weapon]--;this.weaponReadyAt=this.clock+5;
    const hit=weapon==='decoy'||this.cameraOnTarget()>.55;
    let result='Projectile misses; creature continues its previous movement.';
    if(hit){
      if(weapon==='decoy'){t.bearing+=.8;t.range=Math.min(1,t.range+.25);t.fuse+=12;result='Acoustic decoy draws the creature sideways away from the camera; it remains alive and dangerous.';}
      else {t.range=Math.min(1,t.range+.35);t.fuse+=18;result='Pressure pulse strikes the creature; it recoils away from the camera, alive, not killed.';}
      if(t.behavior==='warning'){t.behavior='investigate';t.warningLeft=0;}
    }
    this.lastCombat={weapon,encounter:t.encounter,at:this.clock,creature:t.creature.id,appearance:t.creature.footage,hit,result,outcome:hit?'interrupted':'missed'};
    if(hit)this.authoredSite?.weaponResponse?.(weapon);
    this.onCue?.('hull.crack',.65);this.onShake?.(.3);
    this.pushLog(`${weapon==='decoy'?'声诱饵':'冲击弹'}已发射 · 余量 ${this.weaponAmmo[weapon]} · ${hit?'回波发生位移':'未命中'}。可再次曝光，去分析台验证反应。`,'system');
    return true;
  }

  /** 摄像头看清了 */
  private identify(): void {
    const t = this.threat;
    if (!t || t.known) return;
    t.known = true;
    t.phase = 'identified';
    this.vitals.shock(t.creature.sanCost, 'sight');
    this.onCue?.('san.whisper', 0.8);
    this.pushLog(t.creature.sighting, 'eerie');
    this.pushLog(`处置建议：${t.creature.advice}`, 'system');

    if (t.phantom) {
      // 幻觉：看清了就没有了 —— 摄像头本身就是它的解法。
      // 代价已经付过（sanCost），留下的是「那到底是什么」这个问题。
      t.phase = 'repelled';
      this.huntRecoveryUntil = this.clock + huntAct(this.legIndex).recovery;
      this.mode = 'calm';
      t.clearAt = this.clock + 3;
      this.pushLog('你再看一眼雷达。红点不在了。它没有走远，它只是不在了。', 'eerie');
    }
  }

  /** 玩家做出了一个可能是应对的动作 */
  tryCounter(action: CounterAction): void {
    if(this.authoredSite?.canCounter?.(action)===false)return;
    if((this.authoredSite?.noiseFloor??0)>=.15 && ['fullstop','lampoff','blackout'].includes(action.kind))return;
    const t = this.threat;
    if (!t || t.phase === 'repelled' || t.phase === 'struck') return;

    if (t.creature.weakness.some((w) => sameCounter(w, action))) {
      if(this.lastCombat?.encounter===t.encounter)this.lastCombat.outcome='repelled';
      t.phase = 'repelled';
      this.suspicion = 0;
      this.huntRecoveryUntil = this.clock + huntAct(this.legIndex).recovery;
      this.mode = 'calm';
      this.onCue?.('debunk.success', 0.9);
      this.pushLog(`红点转向了。它在走远。${t.known ? '' : '你甚至不知道刚才躲开的是什么。'}`, 'good');
      this.vitals.restore({ fear: -Math.min(18, this.vitals.vitals.fear) });
      t.clearAt = this.clock + 2.6;
      return;
    }

    if (t.creature.provokes.some((p) => sameCounter(p, action))) {
      t.mistakes++;
      t.fuse = Math.max(3, t.fuse * 0.5);
      this.onCue?.('listener.near', 0.9);
      this.onShake?.(0.4);
      this.pushLog(t.behavior === 'warning' ? '异响更近了。这种做法无效，立刻换一种应对。' : '你做错了。它正在加速靠近。', 'bad');
      return;
    }

    // 不对也不错的动作：只是浪费了时间
    if (action.kind === 'supply') {
      t.mistakes++;
      this.pushLog('没有反应。红点还在原来的路上。', 'system');
    }
  }

  private strike(): void {
    const t = this.threat;
    if (!t) return;
    t.phase = 'struck';
    this.huntRecoveryUntil = this.clock + huntAct(this.legIndex).recovery;
    this.suspicion = 0;
    this.mode = 'calm';
    // 伸在外面的那条臂先挨。玩家有过一次按收回的机会，他选了再翻一爪
    const snap = snapArm(this.arm);
    if (snap) {
      this.hull = clamp01(this.hull - snap.hull);
      this.leak += snap.hull * 0.01;
      this.onCue?.('arm.motor-stall', 0.9);
      this.pushLog(snap.line, 'bad');
    }
    const s = t.creature.onStrike;
    const severity = this.legIndex === 0 ? 0.5 : 1 + (t.hunter.rank - 1) * 0.12;
    this.hull = clamp01(this.hull - s.hull * severity);
    this.flood = clamp01(this.flood + s.flood);
    this.leak += s.flood * 0.004;
    if (s.trauma > 0) this.vitals.injure(s.trauma);
    this.vitals.shock(s.san, 'touch');
    this.onCue?.('listener.scream', 1);
    this.onCue?.('hull.crack', 1);
    this.onCue?.('hull.rivet-pop', .8);
    this.onShake?.(1);
    this.pushLog(s.line, 'bad');
    this.checkSurvival();
    if (this.outcome.kind === 'alive' && t.creature.kin === 'mythos' && this.legIndex > 0) {
      if (t.hunter.skill === 'echo') {
        this.vitals.shock(6 + t.hunter.rank * 2, 'sound');
        this.pushLog('合唱替你呼吸。你忘了刚才听到的哪一个声音属于自己。', 'eerie');
      } else if (t.hunter.skill === 'eclipse') {
        this.power = clamp01(this.power - 0.06 * t.hunter.rank);
        this.lamp = false;
        this.pushLog('光被吞进了电缆。电池骤降，探照灯熄灭。', 'bad');
      } else if (t.hunter.skill === 'corrosion') {
        this.leak += 0.001 * t.hunter.rank;
        this.pushLog('锈从钢板背面生长出来。裂缝持续进水，需要补漏。', 'bad');
      } else if (t.hunter.rank >= 4 && this.hull < 0.45) {
        this.pushLog('舱门没有打开。脚步声却停在了你身后。', 'bad');
        this.die('listener');
      } else {
        this.vitals.shock(12, 'touch');
        this.pushLog('门封里多出一道湿痕。它还没有进来；下次未必。', 'bad');
      }
    }
    t.clearAt = this.clock + 3.2;
    this.checkSurvival();
  }

  // ==========================================================================
  // 无线电
  // ==========================================================================

  private beginLeg(index: number): void {
    if(index===0) this.queueRadio('beacon',OPENING_CALL);
    this.campaign.record(index,'hook');
    const leg = legAt(index);
    for (const line of leg.brief) this.queueRadio('beacon', line);
    this.pushLog(`航段：${leg.name} · ${leg.length} 米`, 'system');
  }

  private queueRadio(speaker: RadioSpeaker, text: string): void {
    this.pending.push({ speaker, text:this.fill(text), at: this.breaths });
    this.onCue?.('radio.squelch', 0.5);
  }

  /** 接听一条。这是无线电台的主要动作 */
  receive(): RadioMessage | null {
    const msg = this.pending.shift();
    if (!msg) return null;
    if(msg.text===OPENING_CALL) {
      this.openingReceived=true;this.storyCaption=OPENING_CALL;this.storyCaptionLeft=38;
    }
    const level = msg.speaker === 'nobody' ? Math.max(0.5, this.corruption) : this.corruption;
    const text = corrupt(this.fill(msg.text), level, this.rng);
    const out: RadioMessage = { ...msg, text };
    this.heard.push(out);
    if (this.heard.length > 40) this.heard.shift();
    this.onCue?.('radio.voice', 0.8);
    if (this.mode === 'calm') this.spend(2, 0.1);
    this.pushLog(`【${speakerName(out.speaker)}】${text}`, 'radio');
    return out;
  }

  /** 可以问的问题 */
  topics(): RadioTopic[] {
    return RADIO_TOPICS.filter(
      (t) => (t.minCorruption ?? 0) <= this.corruption && !(t.once && this.askedOnce.has(t.id)),
    );
  }

  ask(topicId: string): void {
    const topic = RADIO_TOPICS.find((t) => t.id === topicId);
    if (!topic) return;
    if (topic.once) this.askedOnce.add(topic.id);
    const tier = replyTier(this.corruption);
    const raw = this.fill(topic.reply[tier]);
    const text = corrupt(raw, this.corruption, this.rng);
    const speaker: RadioSpeaker = this.corruption > 0.75 && this.rng.next() < 0.35 ? 'self' : 'beacon';
    this.heard.push({ speaker, text, at: this.breaths });
    this.onCue?.('radio.voice', 0.75);
    if (this.mode === 'calm') this.spend(3, 0.1);
    this.pushLog(`【${speakerName(speaker)}】${text}`, 'radio');
  }

  private fill(text: string): string {
    return text.replace('{HEADING}', String(this.leg.advisedHeading).padStart(3, '0'));
  }

  /** 幻听与鬼呼叫。这两样是本作让人不敢摘耳机的原因 */
  private tickVoices(dt: number): void {
    if (this.earsPlugged) return;
    const v = this.vitals.vitals;
    const pressure = clamp01(this.corruption * 0.7 + (1 - v.san / 100) * 0.6 + v.fear / 240);

    this.hallucTimer -= dt * (0.4 + pressure * 1.8);
    if (this.hallucTimer <= 0) {
      this.hallucTimer = lerp(48, 14, pressure) + this.rng.float(-6, 8);
      const line = HALLUCINATIONS[Math.floor(this.rng.next() * HALLUCINATIONS.length)];
      this.pushLog(line, 'eerie');
      this.onCue?.('san.whisper', 0.4 + pressure * 0.4);
      this.vitals.restore({ fear: 4 });
    }

    if (this.corruption < 0.25) return;
    this.ghostTimer -= dt * (0.5 + pressure);
    if (this.ghostTimer <= 0) {
      this.ghostTimer = lerp(120, 45, pressure);
      const line = GHOST_CALLS[Math.floor(this.rng.next() * GHOST_CALLS.length)];
      this.queueRadio('nobody', line);
      this.pushLog('（无线电的指示灯亮了。你没有按任何按钮。）', 'eerie');
    }
  }

  private syncCorruption(): void {
    const v = this.vitals.vitals;
    const base = this.progress * 0.62;
    const madness = (1 - clamp01(v.san / 100)) * 0.5;
    const hurt = clamp01((1 - this.hull) * 0.2 + this.collisions * 0.02);
    this.corruption = clamp01(base + madness + hurt);
  }

  // ==========================================================================
  // 收场
  // ==========================================================================

  private checkSurvival(): void {
    if (this.outcome.kind !== 'alive') return;
    if (this.flood >= 0.995) return this.die('drowning');
    if (this.hull <= 0.02) return this.die('implosion');
  }

  private die(cause: DeathCause): void {
    if (this.outcome.kind !== 'alive') return;
    this.outcome = { kind: 'dead', cause, line: DEATH_WORDS[cause] };
    this.mode = 'calm';
    this.onCue?.('death.flatline', 1);
    this.bus.emit('death', { cause });
  }

  private escape(): void {
    this.outcome = { kind: 'escaped' };
    this.mode = 'calm';
    this.onCue?.('ending.sting', 1);
    this.bus.emit('ending', { id: 'end.shaft' });
  }

  // ==========================================================================
  // 日志
  // ==========================================================================

  /**
   * 写一行日志。
   *
   * 占位符在**这里**统一替换，而不是在每个调用点。
   *
   * 内容层有三套文案带 `{name}` / `{home}` / `{last}`：箱子的 line、组合结论、
   * 以及 supplies 的 effect.log。指望一百多个 pushLog 调用点各自记得过一遍
   * fillPersonText 是不现实的 —— 漏一个，玩家就会在屏幕上读到一对花括号，
   * 而那种 bug 只要发生一次就把整个叙事的可信度打穿。所以关口只有一个，
   * 而且它在最下游：从这里往后，不存在「忘了替换」这条路径。
   */
  pushLog(text: string, tone: LogTone = 'neutral'): void {
    if (!text) return;
    const filled = text.indexOf('{') < 0 ? text : fillPersonText(text, this.memory);
    this.log.push({ text: filled, tone, at: this.breaths, stamp: this.clock });
    if (this.log.length > 120) this.log.shift();
  }

  throttleLabel(): string {
    return THROTTLE[this.throttle].label;
  }

  throttleSpec(): (typeof THROTTLE)[number] {
    return THROTTLE[this.throttle];
  }
}

function speakerName(s: RadioSpeaker): string {
  return s === 'beacon' ? '万斯' : s === 'self' ? '？？？' : '……';
}

/**
 * 机械手按不动的时候，屏上和日志里说的是同一句话。
 *
 * 每一句都只说「现在缺什么」，不解释规则 —— 玩家缺的是下一个动作，
 * 不是一段说明书。
 */
const ARM_FAIL: Readonly<Record<ArmBlock, string>> = {
  ok: '',
  station: '舱还在动。机械手锁在护套里。',
  power: '机械手是液压的，泵是电的。现在没有电。',
  light: '外面是全黑的。臂上没有眼睛 —— 先开探照灯，屏是你唯一的眼睛。',
  seat: `机械手的操纵杆在${stationRef('camera')}。你得看着屏才动得了它。`,
  busy: '泵还在走。等它到位。',
  stowed: '机械手还收在护套里。',
  target: '镜头前没有可触及的货箱。用方向键把准星移到箱面；有障碍挡住时先绕开。',
  offaxis: '准星不在箱子上。爪子会插进空水里。',
  exhausted: '这只箱子已经翻到底了。',
  overheat: '肘节烫得厉害。收回来让它凉，再伸第二次。',
  lost: '接头盖板上只有一个渗油的孔。那条臂在上一个站点的地板上。',
  jammed: '爪子咬死在压条底下。拽，或者把接头断开 —— 没有第三条路。',
  nojam: '爪子没有卡住。',
  cover: '保险盖是扣着的。要断接头，先把它掀开。',
  swing: '盖子还在往上弹。手柄还没露到够得着的位置。',
};

const DEATH_WORDS: Record<DeathCause, string> = {
  asphyxiation: '氧气用完了。最后几口是纯二氧化碳，你没有察觉。',
  hypothermia: '你不再觉得冷了。这不是好消息。',
  trauma: '失血比你以为的快。',
  infection: '它已经在你身体里长了一会儿了。',
  implosion: '舱体让步了。过程比一个念头还短。',
  listener: '它找到了你。它一直知道你在哪，只是在等你出声。',
  ritual: '仪式完成了。只是主祭不是你。',
  drowning: '水先漫过面罩，然后是眼睛。',
  self: '你自己做的决定。',
};
