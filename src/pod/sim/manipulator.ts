/**
 * 机械手 —— 摄像头视角下的翻箱作业。
 * ============================================================================
 * 这不是「按一下出货」。它是一条有五个相、每一相都在向外面广播你的位置的
 * 作业流程：
 *
 *   stowed → extending → aiming → gripping → （回到 aiming 再翻一爪）
 *                                          → hauling → stowed
 *
 * 三条硬规则撑起整个玩法：
 *
 *   1. 没有光就没有瞄准。液压臂前端没有传感器，玩家唯一的反馈是那块屏。
 *      这是「拍片 → 分析 → 在全息图上看见箱子 → 走回摄像头开探照灯」这条
 *      动线存在的机制理由，所以它必须硬执行，而不是给个提示。
 *   2. 泵一开就一直在响。伸出、保压、插进去、拉回来，每一秒都在加噪音 ——
 *      「再翻一爪」永远是一个赌注，而不是一次免费点击。
 *   3. 伸在外面的时候被撞，代价另算。警报响起来的那一刻，玩家手上就多了
 *      一个真实的取舍：再翻一爪，还是现在收。
 *
 * 纯数据 + 纯函数。这个文件不认识 PodRun ——
 * 相位推进只产出 ArmEvent，噪音、呼吸、物资、日志全部由调用方结算。
 */

import { clamp, clamp01 } from '@/core/util';
import type { LogTone } from '../types';
import type { ContainerState } from '../content/containers';
import { reachableTargets, type Eye, type ReachableTarget, type RoomGeometry } from '../view/roomview';

export type ArmPhase =
  | 'stowed'
  | 'extending'
  | 'aiming'
  | 'gripping'
  /** 爪子咬死在压条底下。拽出来，或者把整条臂扔掉 */
  | 'jammed'
  | 'hauling'
  /** 接头炸开了。这一趟再也没有机械手 —— 这是终态，没有回头路 */
  | 'gone';

export const ARM_PHASE_CN: Readonly<Record<ArmPhase, string>> = {
  stowed: '收在舱内',
  extending: '正在伸出',
  aiming: '已伸出 · 等待翻找',
  gripping: '爪子在里面',
  jammed: '咬死 · 拽不动',
  hauling: '正在收回',
  gone: '接头已断 · 无机械手',
};

/**
 * 全部可调参数。
 *
 * 秒数都不小 —— 液压是慢的，而这段慢就是代价：泵响的每一秒都记在噪音上。
 */
export const ARM = {
  /** 镜头到可操作表面的最大距离（米），不按箱心计算。 */
  reach: 6.5,
  /** 伸出 / 收回各要几秒 */
  extendSec: 3.4,
  haulSec: 2.6,
  /** 插进去到爪子闭合。这段时间里玩家只能看着 */
  gripSec: 1.8,
  /** 泵每秒往外辐射的噪音。伸出和收回时满开，悬停时保压，只有一半 */
  pumpNoise: 0.075,
  holdNoiseScale: 0.45,
  /** 伸出 / 收回 / 每一爪的呼吸代价。翻找那一爪的代价由箱子自己说 */
  extendCost: 3,
  haulCost: 2,
  /** 一次伸出最多翻几爪。再多，回路会发烫 */
  maxPasses: 4,
  /** 泵连续运转这么久之后，外面的东西一定听见了 */
  wakeSec: 5.5,
  /** 伸在外面这么久，液压回路开始抗议 */
  strainSec: 30,
  /** 过热那一下自己扯坏的舱体 */
  strainHull: 0.04,
  /** 插进去要求准星几乎压在箱子上（弧度）。云台偏一点就脱靶 */
  gripHalfFov: 0.17,
  /** 警报态里没收回就被撞，额外的舱体损伤（按伸出程度折算） */
  snapHull: 0.11,

  // ---- 卡爪 ----------------------------------------------------------------
  /** 每一爪的基础咬死概率。翻得规规矩矩也有这么多 */
  jamBase: 0.04,
  /** 准星越偏，爪子插进去的角度越歪。这一项权重最大 —— 它是玩家自己的手艺 */
  jamOffAxisWeight: 0.46,
  /** 同一次伸出翻得越多，肘节越松 */
  jamPassStep: 0.05,
  /** 箱子本身有多脏（压条锈死、内容物缠在一起） */
  jamRiskWeight: 0.18,
  /** 拽第一下的成功率。之后每拽一下涨这么多 —— 不是无底洞，但每一下都很响 */
  wrenchBase: 0.30,
  wrenchStep: 0.17,
  wrenchMax: 0.9,
  /** 拽被攥住的爪子失败一次，对面攥得更紧：从剩余时间里扣掉这么多秒 */
  grabPenaltySec: 1.6,
  /** 拽一下的呼吸代价、噪音、以及拽坏自己的那点舱体 */
  wrenchCost: 5,
  wrenchNoise: 0.52,
  wrenchHull: 0.012,
  /** 卡住之后液压还在憋着，噪音按这个倍数继续算 */
  jamNoiseScale: 0.8,

  // ---- 弃臂 ----------------------------------------------------------------
  /** 保险盖掀开之后，红手柄露在外面的秒数。过了它自己扣回去 */
  purgeWindowSec: 6,
  /**
   * 盖子弹开到手柄能按下去之间的秒数。
   *
   * 这一秒多是「不能一个键就没了」的物理形式：两次按键之间必须真的过掉
   * 这段时间，而警报态里这段时间是从引信上扣的。
   */
  purgeArmDelaySec: 1.2,
  /** 接头炸开那一下的噪音。它是全局最响的动作之一 */
  purgeNoise: 0.85,
  /** 那条臂砸下去以后，外面的东西会朝那个声音去。给玩家买回来的引信秒数 */
  purgeDecoySec: 18,
} as const;

/** 一次伸出作业的全部状态 */
export interface ArmState {
  phase: ArmPhase;
  /** 伸出程度 0..1。extending 涨，hauling 落 */
  out: number;
  /** 爪子正插着的那只箱子。只在 gripping 期间有意义 */
  gripId: string | null;
  /**
   * 插进去那一刻准星偏了多少（弧度）。
   *
   * 记在这里而不是现场读云台：爪子已经插进去了，之后玩家怎么转云台都改不了
   * 插入角度。咬死概率算的是插进去那一下的手艺。
   */
  gripOff: number;
  /** 本次伸出已经翻了几爪 */
  passes: number;
  /** 当前相位的剩余秒数 */
  timer: number;
  /** 泵这一次伸出累计运转了多少秒。噪音、过热、招东西都按它算 */
  pump: number;
  /** 这一次伸出已经把东西叫起来过了。同一次只叫一次 */
  woke: boolean;
  /** 过热警告只报一次 */
  strained: boolean;
  /**
   * 断电了。
   *
   * 臂软在外面，泵不响了 —— 于是它也不再招东西，但它仍然伸在外面。
   * 这是拉总闸最贵的一次：你装死装得很好，代价是一条收不回来的手。
   */
  limp: boolean;
  /** 卡住之后已经拽了几下。每一下都在涨成功率，也在涨噪音 */
  jamPulls: number;
  /** 「咬着的时候灯灭了」只报一次 */
  darkNoted: boolean;
  /**
   * 液压接头保险盖掀开之后的剩余秒数。0 = 盖着。
   *
   * 这个数是弃臂唯一的确认步骤：掀盖是一次按键，断开是第二次按键，中间这几秒
   * 实时流走 —— 警报态里它照样流。既不是一键，也不弹框。
   */
  purgeLeft: number;
  /**
   * 咬死状态还剩多少秒会自己松开。0 = 不会自己松，只能拽。
   *
   * 内容层的 `arm.jam` tag 带一个 `tagDuration`：那种卡住是压条的弹性
   * 压住了爪齿，等金属自己回弹就松了。而玩家自己插歪插出来的那种卡死
   * 没有这个数 —— 没有人会来替他松手。
   */
  jamLeft: number;
  /**
   * 被抓住之后还剩多少秒。**归零就丢臂**。
   *
   * 和 jamLeft 相反：那边是等，这边是等不起。里面的东西攥着爪不放，
   * 每一秒它都在往里拽 —— 玩家要么拽出来，要么在归零之前自己断掉接头。
   */
  grabLeft: number;
  /**
   * 杆体当前的弯曲量 −1..1，以及它的速度。
   *
   * 这两个数是一个二阶弹簧阻尼的状态，不是从相位算出来的标量。
   * 区别在爪子插到底那一下：受力目标瞬间跳到满，而杆是钢的，它会**过冲**，
   * 然后晃两下才停。没有这个过冲，那一下看起来就是一张贴图切换；
   * 有了它，玩家会觉得自己刚才撞到了一个硬东西。
   */
  flex: number;
  flexV: number;
  /** 上一爪的结果，给面板读 */
  lastLine: string;
}

export function newArm(): ArmState {
  return {
    phase: 'stowed',
    out: 0,
    gripId: null,
    gripOff: 0,
    passes: 0,
    timer: 0,
    pump: 0,
    woke: false,
    strained: false,
    limp: false,
    jamPulls: 0,
    darkNoted: false,
    purgeLeft: 0,
    jamLeft: 0,
    grabLeft: 0,
    flex: 0,
    flexV: 0,
    lastLine: '',
  };
}

/**
 * 机械手在不在舱外。收回途中也算 —— 它还挂在外面。
 *
 * 'gone' 返回 false：那条臂确实还在外面，但它已经不连着这条舱了。这正是
 * 弃臂换来的东西 —— 起步不再被它拖着。
 */
export function armOut(a: ArmState): boolean {
  return a.phase !== 'stowed' && a.phase !== 'gone';
}

/** 这条舱还有没有机械手。false 之后翻箱、salvage、切割锁全部跟着死 */
export function armAlive(a: ArmState): boolean {
  return a.phase !== 'gone';
}

/** 暴露程度 0..1。被撞时的额外代价按它折算 */
export function armExposure(a: ArmState): number {
  if (a.phase === 'stowed' || a.phase === 'gone') return 0;
  // 咬死的时候爪子整个埋在别人的箱子里，撇一下就是连根撇
  if (a.phase === 'jammed') return clamp01(a.out);
  return clamp01(a.out * (a.phase === 'gripping' ? 1 : 0.85));
}

// ============================================================================
// 前提条件
// ============================================================================

/** 调用方能提供的全部事实。机械手只认这些，不认 PodRun */
export interface ArmConditions {
  /** 坐在摄像头工位前 */
  atCamera: boolean;
  /** 坐在打捞工位前。收回可以从这里按 —— 那张台子本来就是这条臂的 */
  atSalvage: boolean;
  powered: boolean;
  /** 探照灯开着，或者信号管还在烧 */
  lit: boolean;
  /** 停在站点上 */
  onStation: boolean;
}

export type ArmBlock =
  | 'ok'
  | 'station'
  | 'power'
  | 'light'
  | 'seat'
  | 'busy'
  | 'stowed'
  | 'target'
  | 'offaxis'
  | 'exhausted'
  | 'overheat'
  /** 这条舱已经没有机械手了。所有分支的终点 */
  | 'lost'
  /** 爪子咬死。除了拽和弃，什么都做不了 */
  | 'jammed'
  /** 没卡住，没什么可拽的 */
  | 'nojam'
  /** 保险盖还扣着 */
  | 'cover'
  /** 盖子刚掀开，手柄还没弹到位 */
  | 'swing';

/** 失败分支的短因果。按钮上的 hint 和日志用的是同一套说法 */
export const ARM_BLOCK_CN: Readonly<Record<ArmBlock, string>> = {
  ok: '',
  station: '舱在动',
  power: '没有电',
  light: '先开探照灯',
  seat: '不在机位上',
  busy: '泵还在走',
  stowed: '手还收着',
  target: '够不着箱子',
  offaxis: '准星偏了',
  exhausted: '这只翻到底了',
  overheat: '回路发烫',
  lost: '已经没有机械手',
  jammed: '爪子咬死了',
  nojam: '爪子没卡住',
  cover: '保险盖扣着',
  swing: '手柄还没弹出来',
};

export function blockExtend(a: ArmState, c: ArmConditions, hasTarget: boolean): ArmBlock {
  if (a.phase === 'gone') return 'lost';
  if (!c.onStation) return 'station';
  if (!c.atCamera) return 'seat';
  if (!c.powered) return 'power';
  if (!c.lit) return 'light';
  if (a.phase === 'jammed') return 'jammed';
  if (a.phase !== 'stowed') return 'busy';
  if (!hasTarget) return 'target';
  return 'ok';
}

export function blockRummage(
  a: ArmState,
  c: ArmConditions,
  /** 只关心偏角 —— 调用方传 ReachableTarget 还是 run 的 ArmTarget 都行 */
  target: Pick<ReachableTarget, 'offAxis'> | null,
  container: ContainerState | null,
): ArmBlock {
  if (a.phase === 'gone') return 'lost';
  if (!c.onStation) return 'station';
  if (!c.atCamera) return 'seat';
  if (!c.powered) return 'power';
  if (!c.lit) return 'light';
  if (a.phase === 'jammed') return 'jammed';
  if (a.phase === 'stowed') return 'stowed';
  if (a.phase !== 'aiming') return 'busy';
  if (!target || !container) return 'target';
  if (target.offAxis > ARM.gripHalfFov) return 'offaxis';
  if (container.exhausted) return 'exhausted';
  return 'ok';
}

export function blockRetract(a: ArmState, c: ArmConditions): ArmBlock {
  if (a.phase === 'gone') return 'lost';
  if (a.phase === 'stowed') return 'stowed';
  if (!c.atCamera && !c.atSalvage) return 'seat';
  // 收回使用应急回路，断电或旧存档卡爪都不阻止收臂。
  if (a.phase === 'hauling') return 'busy';
  return 'ok';
}

/** 拽卡住的爪子。只有咬死的时候能按 */
export function blockWrench(a: ArmState, c: ArmConditions): ArmBlock {
  if (a.phase === 'gone') return 'lost';
  if (a.phase !== 'jammed') return 'nojam';
  if (!c.atCamera && !c.atSalvage) return 'seat';
  if (!c.powered) return 'power';
  return 'ok';
}

/**
 * 掀开液压接头的保险盖。
 *
 * 只有臂在外面的时候才有意义 —— 收在护套里的臂没人会去扔。
 */
export function blockPurgeArm(a: ArmState, c: ArmConditions): ArmBlock {
  if (a.phase === 'gone') return 'lost';
  if (a.phase === 'stowed') return 'stowed';
  if (!c.atCamera && !c.atSalvage) return 'seat';
  return 'ok';
}

/** 真的按下红手柄。保险盖必须已经掀开、而且还没自己扣回去 */
export function blockPurgeFire(a: ArmState, c: ArmConditions): ArmBlock {
  const b = blockPurgeArm(a, c);
  if (b !== 'ok') return b;
  if (a.purgeLeft <= 0) return 'cover';
  if (a.purgeLeft > ARM.purgeWindowSec - ARM.purgeArmDelaySec) return 'swing';
  return 'ok';
}

// ============================================================================
// 瞄准
// ============================================================================

/** 云台该往哪转。使用真实目标方位，+Z / 正俯仰均朝下，航向跨零取短路。 */
export function armAimHint(eye: Eye, target: Pick<ReachableTarget, 'pos'>): string {
  const dx = target.pos.x - eye.pos.x;
  const dy = target.pos.y - eye.pos.y;
  const dz = target.pos.z - eye.pos.z;
  const yaw = Math.atan2(dx, dy) * 180 / Math.PI;
  const yawOffset = ((yaw - eye.yaw) % 360 + 540) % 360 - 180;
  const pitchOffset = Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI - eye.pitch;
  const parts: string[] = [];
  if (Math.abs(yawOffset) >= 1) {
    parts.push(`${yawOffset > 0 ? '→ 右转' : '← 左转'} ${Math.abs(yawOffset).toFixed(0)}°`);
  }
  if (Math.abs(pitchOffset) >= 1) {
    parts.push(`${pitchOffset > 0 ? '↓ 下俯' : '↑ 上仰'} ${Math.abs(pitchOffset).toFixed(0)}°`);
  }
  return parts.join(' · ') || '准星已对齐';
}

/**
 * 镜头现在压在哪只箱子上。
 *
 * 光轴已命中箱面的目标优先，重叠时取更近的；未命中时按箱心偏角给调整提示。
 * halfFov 由 camZoom 决定，但放大镜头不会丢掉光轴已经命中的箱面。
 */
export function acquireTarget(
  geo: RoomGeometry,
  eye: Eye,
  halfFov: number,
): ReachableTarget | null {
  const list = reachableTargets(geo, eye, {
    reach: ARM.reach,
    halfFov: clamp(halfFov, 0.06, 1.2),
    kinds: ['crate'],
  });
  return list[0] ?? null;
}

// ============================================================================
// 相位推进
// ============================================================================

export type ArmEvent =
  /** 这一帧泵辐射出去的噪音 */
  | { kind: 'noise'; amount: number }
  /** 咬死的爪自己松了 */
  | { kind: 'unjam'; line: string }
  /** 攥着爪的那个东西把它拽走了。调用方在这里丢臂 */
  | { kind: 'torn'; line: string }
  /** 相位变了。line 可能为空（不值得写进日志的变化） */
  | { kind: 'phase'; phase: ArmPhase; line: string; tone: LogTone }
  /** 泵响得太久了，把近场的东西叫起来 */
  | { kind: 'wake'; line: string }
  /** 液压过热，自己扯坏一点舱体，并强制收回 */
  | { kind: 'strain'; line: string; hull: number }
  /** 爪子闭合了。调用方在这里调 searchContainer 结算这一爪 */
  | { kind: 'grip'; obstacleId: string };

/**
 * 推一帧。
 *
 * 这里刻意不结算任何东西：噪音、呼吸、舱体、物资都由调用方拿着 ArmEvent 去做。
 * 于是这台机器在无头脚本里和在浏览器里走的是同一条路。
 */
export function stepArm(a: ArmState, dt: number, c: ArmConditions): ArmEvent[] {
  const out: ArmEvent[] = [];
  if (a.phase === 'gone') return out;

  // 杆体的弹簧每一帧都要走，包括断电软在外面那几帧 —— 尤其是那几帧：
  // 压力掉下去的时候，杆是先往下坠、再晃住的
  stepFlex(a, dt);

  // 保险盖是纯机械的弹簧盖：断电、没坐在机位上、正在被撞 —— 它一样往回扣。
  // 所以这几秒是真的几秒，玩家不能靠切工位把它冻住。
  if (a.purgeLeft > 0) {
    a.purgeLeft = Math.max(0, a.purgeLeft - dt);
    if (a.purgeLeft === 0) {
      out.push({
        kind: 'phase',
        phase: a.phase,
        line: '保险盖的弹簧把它自己扣回去了。红手柄又缩回罩子底下。',
        tone: 'system',
      });
    }
  }

  if (a.phase === 'stowed') {
    a.pump = 0;
    a.woke = false;
    a.strained = false;
    a.limp = false;
    a.jamPulls = 0;
    a.jamLeft = 0;
    a.grabLeft = 0;
    return out;
  }

  // 断电：臂软在外面。泵不响，所以它也不再招东西 —— 但它也收不回来。
  if (!c.powered && a.phase !== 'hauling') {
    if (!a.limp) {
      a.limp = true;
      out.push({
        kind: 'phase',
        phase: a.phase,
        line: '液压压力掉了。机械手软在外面，像一根挂着的绳子。',
        tone: 'bad',
      });
    }
    return out;
  }
  if (a.limp) {
    a.limp = false;
    out.push({ kind: 'phase', phase: a.phase, line: '泵重新咬住。机械手抬起来了。', tone: 'system' });
  }

  // 灯灭了 = 瞎了。臂自己往回缩 —— 这条规则不给玩家讨价还价的余地。
  // 咬死的爪子例外：它想缩也缩不动，于是黑着卡在那里。
  if (!c.lit && a.phase === 'jammed' && !a.darkNoted) {
    a.darkNoted = true;
    out.push({
      kind: 'phase',
      phase: 'jammed',
      line: '灯灭了，爪子还咬着。屏上只剩雪花，你只能靠声音知道它还在那儿。',
      tone: 'bad',
    });
  }
  if (!c.lit && (a.phase === 'extending' || a.phase === 'aiming')) {
    a.phase = 'hauling';
    a.timer = ARM.haulSec * Math.max(0.35, a.out);
    a.gripId = null;
    out.push({
      kind: 'phase',
      phase: 'hauling',
      line: '光没了。屏上只剩雪花，机械手在黑水里自己往回缩。',
      tone: 'bad',
    });
  }

  // 咬死的两种倒计时。一种在等，一种在等不起 —— 它们从来不同时存在
  if (a.phase === 'jammed') {
    if (a.jamLeft > 0) {
      a.jamLeft = Math.max(0, a.jamLeft - dt);
      if (a.jamLeft <= 0) {
        jamRelease(a);
        out.push({
          kind: 'unjam',
          line: '压条回弹了，爪齿自己滑出来。它松开的声音比咬住的时候轻得多。',
        });
      }
    } else if (a.grabLeft > 0) {
      a.grabLeft = Math.max(0, a.grabLeft - dt);
      if (a.grabLeft <= 0) {
        out.push({
          kind: 'torn',
          line: '它不再拽了 —— 它把手臂拿走了。接头那边先是一声脆的，然后什么声音都没有。',
        });
      }
    }
  }

  const rate =
    a.phase === 'aiming' ? ARM.holdNoiseScale : a.phase === 'jammed' ? ARM.jamNoiseScale : 1;
  a.pump += dt * rate;
  out.push({ kind: 'noise', amount: dt * rate * ARM.pumpNoise });

  if (!a.woke && a.pump >= ARM.wakeSec) {
    a.woke = true;
    out.push({ kind: 'wake', line: '液压泵的声音在这间房里来回撞。有东西听见了。' });
  }

  // 箱内选择不设倒计时，也不会因等待过热而强制收回。

  a.timer = Math.max(0, a.timer - dt);

  switch (a.phase) {
    case 'extending':
      a.out = clamp01(1 - a.timer / ARM.extendSec);
      if (a.timer <= 0) {
        a.phase = 'aiming';
        a.out = 1;
        out.push({
          kind: 'phase',
          phase: 'aiming',
          line: '机械手伸到位了，尚未翻找。用方向键把准星压到箱子上，显示可插入后按 F；按 C 收回。',
          tone: 'system',
        });
      }
      break;
    case 'gripping':
      if (a.timer <= 0) {
        const id = a.gripId;
        a.phase = 'aiming';
        a.passes++;
        a.gripId = null;
        if (id) out.push({ kind: 'grip', obstacleId: id });
      }
      break;
    case 'hauling':
      a.out = clamp01(a.timer / ARM.haulSec);
      if (a.timer <= 0) {
        a.phase = 'stowed';
        a.out = 0;
        a.passes = 0;
        a.pump = 0;
        a.woke = false;
        a.strained = false;
        a.jamPulls = 0;
        a.darkNoted = false;
        a.jamLeft = 0;
        a.grabLeft = 0;
        out.push({
          kind: 'phase',
          phase: 'stowed',
          line: '机械手收进护套。舱外又只剩水声。',
          tone: 'system',
        });
      }
      break;
    default:
      break;
  }

  return out;
}

// ============================================================================
// 调用方要用的三个动作的「开始」部分
// ============================================================================

/** 把状态推进到 extending。前提条件由调用方先用 blockExtend 判 */
export function beginExtend(a: ArmState): void {
  a.lastLine = '';
  a.phase = 'extending';
  a.timer = ARM.extendSec;
  a.out = 0;
  a.passes = 0;
  a.pump = 0;
  a.woke = false;
  a.strained = false;
  a.limp = false;
  a.jamPulls = 0;
  a.darkNoted = false;
  a.jamLeft = 0;
  a.grabLeft = 0;
  a.gripId = null;
}

/** 把爪子插进去。前提条件由调用方先用 blockRummage 判 */
export function beginGrip(a: ArmState, obstacleId: string, offAxis = 0): void {
  a.phase = 'gripping';
  a.timer = ARM.gripSec;
  a.gripId = obstacleId;
  a.gripOff = offAxis;
}

/** 开始收。前提条件由调用方先用 blockRetract 判 */
export function beginHaul(a: ArmState): void {
  a.phase = 'hauling';
  a.timer = ARM.haulSec * Math.max(0.35, a.out);
  a.gripId = null;
}

/**
 * 伸在外面的时候被撞。
 *
 * 这是整条机制里唯一一个「你本来可以避免」的损伤：警报响起来到它撞上来
 * 之间，玩家有过一次机会按收回，而他选了再翻一爪。
 */
export function snapArm(a: ArmState): { hull: number; line: string } | null {
  const exp = armExposure(a);
  if (exp <= 0) return null;
  const jammed = a.phase === 'jammed';
  const hull = ARM.snapHull * exp * (jammed ? 1.5 : 1);
  const line = jammed
    ? '它撞上来的时候，爪子正咬死在压条底下 —— 整条舱被那一下拽着转了半圈。什么都没松。'
    : a.phase === 'gripping'
      ? '它撞上来的时候，爪子还插在箱子里。整条臂从根部被撇过去，舱壁跟着叫了一声。'
      : '它擦着伸在外面的那条臂过去。液压油在水里散开，像一团黑色的血。';
  if (!jammed) {
    // 咬死的爪子被撞也不会松开。那一下只是把损伤记在舱壁上
    a.phase = 'hauling';
    a.timer = ARM.haulSec;
    a.gripId = null;
    a.passes = 0;
  }
  return { hull, line };
}

// ============================================================================
// 卡爪
// ============================================================================

/**
 * 这一爪咬死的概率。
 *
 * 权重排序是故意的：偏角 > 爪数 > 箱子本身。玩家把准星压准、别贪第四爪，
 * 就能把它压到很低 —— 卡爪不是运气，是手艺的账单。
 */
export function jamChance(offAxis: number, passes: number, risk: number): number {
  const aim = clamp01(offAxis / ARM.gripHalfFov);
  return clamp01(
    ARM.jamBase + aim * aim * ARM.jamOffAxisWeight + passes * ARM.jamPassStep + clamp01(risk) * ARM.jamRiskWeight,
  );
}

/** 下一下拽出来的概率。拽得越多越有希望 —— 也越响 */
export function wrenchChance(a: ArmState): number {
  return Math.min(ARM.wrenchMax, ARM.wrenchBase + a.jamPulls * ARM.wrenchStep);
}

/**
 * 爪子咬死在这只箱子里。gripId 留着 —— 它是「卡在哪」的唯一证据。
 *
 * 两种卡法，由第三、第四个参数区分：
 *   · `frees` > 0 —— 会自己松（压条回弹）。玩家可以等，也可以拽。等是免费的，
 *     但那几秒里泵一直在响。
 *   · `grabs` > 0 —— **等不起**。里面的东西攥着爪，归零就丢臂。
 *
 * 两个都不传（玩家自己插歪导致的咬死）：不会自己松，也不会自己恶化。
 * 只能拽，或者断接头。
 */
export function beginJam(a: ArmState, obstacleId: string, frees = 0, grabs = 0): void {
  a.phase = 'jammed';
  a.timer = 0;
  a.gripId = obstacleId;
  a.jamPulls = 0;
  a.darkNoted = false;
  a.jamLeft = Math.max(0, frees);
  a.grabLeft = Math.max(0, grabs);
}

/** 被攥住了（而不是单纯卡住）。UI 要用完全不同的颜色说这件事 */
export function armGrabbed(a: ArmState): boolean {
  return a.phase === 'jammed' && a.grabLeft > 0;
}

/**
 * 拽一下。
 *
 * 成功了整条臂会弹回来，直接进 hauling —— 不给「拽出来顺手再翻一爪」这条路：
 * 肘节已经歪了，这一趟的翻找到此为止。
 */
export function wrenchPull(a: ArmState, success: boolean): void {
  if (a.phase !== 'jammed') return;
  if (success) {
    a.phase = 'hauling';
    a.timer = ARM.haulSec;
    a.gripId = null;
    a.passes = ARM.maxPasses;
    a.jamPulls = 0;
    a.darkNoted = false;
    a.jamLeft = 0;
    a.grabLeft = 0;
  } else {
    a.jamPulls++;
    // 挣了一下没挣开，对面反而攥得更紧。拽被抓住的爪子是在赌，不是在等
    if (a.grabLeft > 0) a.grabLeft = Math.max(0.6, a.grabLeft - ARM.grabPenaltySec);
  }
}

/**
 * 压条自己回弹，爪松了。
 *
 * 回到 aiming（臂还在外面、爪空着），但 passes 顶满 —— 松开不等于可以接着翻。
 * 卡过一次的肘节这一趟就到这儿了，玩家只剩「收回」这一个动作。
 */
export function jamRelease(a: ArmState): void {
  if (a.phase !== 'jammed') return;
  a.phase = 'aiming';
  a.timer = 0;
  a.passes = ARM.maxPasses;
  a.jamPulls = 0;
  a.jamLeft = 0;
  a.grabLeft = 0;
  a.gripId = null;
}

// ============================================================================
// 弃臂
// ============================================================================

/** 掀开保险盖。红手柄露出来 ARM.purgeWindowSec 秒，然后弹簧把它扣回去 */
export function armPurgeCover(a: ArmState): void {
  a.purgeLeft = ARM.purgeWindowSec;
}

/**
 * 按下红手柄。爆炸螺栓炸开液压接头 —— 这条臂从此不属于这条舱。
 *
 * 这是整个游戏里唯一一个真正不可逆的操作：它不是冷却、不是损坏、不能修。
 * 所以它的确认步骤被拆成了两次按键 + 中间那几秒实时流走的窗口。
 */
export function jettisonArm(a: ArmState): void {
  a.phase = 'gone';
  a.out = 0;
  a.timer = 0;
  a.gripId = null;
  a.passes = 0;
  a.pump = 0;
  a.woke = false;
  a.strained = false;
  a.limp = false;
  a.jamPulls = 0;
  a.darkNoted = false;
  a.jamLeft = 0;
  a.grabLeft = 0;
  a.purgeLeft = 0;
  a.lastLine = '';
}

// ============================================================================
// 姿态 —— 给摄像头屏画前景用
// ============================================================================

/** 画臂需要知道的瞄准信息。run 的 ArmTarget 直接能喂进来 */
export interface ArmAim {
  /** 目标到镜头的距离（米） */
  dist: number;
  /** 目标偏离准星的角度（弧度） */
  offAxis: number;
  /** 云台相对舱首的方位（弧度）。臂焊在舱上，云台一转它就横过画面 */
  pan?: number;
}

/**
 * 机械手在镜头里的姿态。
 *
 * 全部是归一化量，`stations.ts` 拿它去摆那根杆，不需要再算一次几何。
 */
export interface ArmPose {
  /** 画不画。收在护套里、或者已经弃掉，都是 false */
  visible: boolean;
  /** 伸出程度 0..1，等于 ArmState.out */
  extend: number;
  /** 肘节角（弧度）。收着的时候折到 1.05，伸直是 0.12 */
  elbow: number;
  /** 爪子开合 0 = 完全咬合，1 = 张到最大 */
  grip: number;
  /** 杆体受力弯曲 −1..1，正 = 往画面右侧弯。卡爪和过热时最大 */
  flex: number;
  /** 高频抖动幅度 0..1。泵在走就有，拽的时候满 */
  shake: number;
  /** 爪尖到镜头的距离（米）。和 ArmAim.dist 比就知道爪子在箱子前面还是里面 */
  tipDist: number;
  /** 爪尖是不是已经插进目标里面了 —— 画的时候要让箱子遮住爪子 */
  inside: boolean;
  /** 杆体横向偏移 −1..1。云台转开了，杆就滑向画面一侧 */
  sway: number;
  /** 咬死了。画的时候要把杆画成绷着的，抖也要抖得不一样 */
  jammed: boolean;
}

const POSE_HIDDEN: ArmPose = {
  visible: false,
  extend: 0,
  elbow: 1.05,
  grip: 0,
  flex: 0,
  shake: 0,
  tipDist: 0,
  inside: false,
  sway: 0,
  jammed: false,
};

/**
 * 从状态算姿态。纯函数，不读时间 —— 抖动的相位由画的那一层按自己的帧时间摇。
 */
export function armPose(a: ArmState, target: ArmAim | null): ArmPose {
  if (a.phase === 'stowed' || a.phase === 'gone') return POSE_HIDDEN;

  const ext = clamp01(a.out);
  // 插进去的深度：gripping 期间从 0 走到 1，卡住就一直是 1
  const bite =
    a.phase === 'gripping'
      ? clamp01(1 - a.timer / ARM.gripSec)
      : a.phase === 'jammed'
        ? 1
        : 0;

  // 爪子张合：伸出途中张开，插进去的过程里闭合，咬死就是咬死
  let grip: number;
  if (a.phase === 'extending') grip = ext * 0.9;
  else if (a.phase === 'aiming') grip = 0.9;
  else if (a.phase === 'gripping') grip = 0.9 * (1 - bite);
  else if (a.phase === 'jammed') grip = 0;
  else grip = 0.25; // hauling：半握着，像攥了什么东西回来

  const shake = a.limp
    ? 0
    : a.phase === 'jammed'
      ? 0.75 + Math.min(0.25, a.jamPulls * 0.08)
      : a.phase === 'aiming'
        ? 0.22
        : 0.45;

  const reachNow = ARM.reach * ext;
  const dist = target?.dist ?? ARM.reach;
  return {
    visible: true,
    extend: ext,
    elbow: 1.05 - ext * 0.93,
    grip,
    // 弹簧的实时值，不是目标值。它会过冲、会回弹，也会比受力慢半拍
    flex: clamp(a.flex, -1, 1),
    shake: clamp01(shake),
    tipDist: reachNow,
    inside: bite > 0.45 && reachNow >= dist - 0.6,
    // 云台方位 ±1.2 rad 之间映射到整个画面宽度；臂在舱首正前方，所以取反
    sway: clamp(-(target?.pan ?? 0) / 1.2, -1, 1),
    jammed: a.phase === 'jammed',
  };
}

// ----------------------------------------------------------------------------
// 杆体的弹簧
// ----------------------------------------------------------------------------
// 上一版的 flex 是从相位直接算出来的标量：插进去的那一帧它从 0 变成 0.35，
// 看起来是两张贴图在切换。真实的钢杆有质量：受力先到，形变后到，而且它会
// 冲过去再晃回来。二阶弹簧阻尼就够了，不需要真物理。
//
// zeta < 1 是关键。临界阻尼（zeta = 1）没有回弹，而回弹正是「我撞到了硬东西」
// 这个感觉的全部来源。
// ----------------------------------------------------------------------------

/** 刚度。14 rad/s ≈ 2.2 Hz，和一根三米的液压杆差不多 */
const FLEX_OMEGA = 14;
/** 阻尼比。0.34 会过冲约 33%，晃两下停 */
const FLEX_ZETA = 0.34;
/** 显式积分的最大步长。再大就会发散 */
const FLEX_STEP = 1 / 90;

/**
 * 受力的**目标**值。杆最终会弯到这里，但不会立刻弯到这里。
 */
function flexTarget(a: ArmState): number {
  if (a.phase === 'stowed' || a.phase === 'gone') return 0;
  if (a.limp) return -0.55; // 没压力了，杆自己往下垂
  if (a.phase === 'jammed') return 0.85 + Math.min(0.15, a.jamPulls * 0.05);
  const bite = a.phase === 'gripping' ? clamp01(1 - a.timer / ARM.gripSec) : 0;
  const base = bite * 0.35;
  return a.strained ? Math.max(base, 0.5) : base;
}

function stepFlex(a: ArmState, dt: number): void {
  const target = flexTarget(a);
  let left = Math.min(dt, 0.25);
  while (left > 0) {
    const h = Math.min(FLEX_STEP, left);
    left -= h;
    const acc = FLEX_OMEGA * FLEX_OMEGA * (target - a.flex) - 2 * FLEX_ZETA * FLEX_OMEGA * a.flexV;
    a.flexV += acc * h;
    a.flex += a.flexV * h;
  }
  // 收进护套之后不要留着一根还在抖的杆
  if (a.phase === 'stowed' && Math.abs(a.flex) < 0.002 && Math.abs(a.flexV) < 0.01) {
    a.flex = 0;
    a.flexV = 0;
  }
}

/**
 * 这一爪该用哪个电机音。
 *
 * 三个采样点不是为了好听 —— 它们是一个读数：玩家听见 grip.3 就知道
 * 这一次伸出已经翻到第三爪了，不需要去看面板上的数字。
 */
export function gripCue(passes: number): string {
  if (passes <= 0) return 'arm.grip.1';
  if (passes === 1) return 'arm.grip.2';
  return 'arm.grip.3';
}
