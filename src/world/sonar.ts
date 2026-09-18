/**
 * world/sonar.ts — 声呐（GDD §4.4）
 *
 * 三种模式构成一个**风险—信息三角**：
 *   被动聆听  便宜、无声、几乎瞎    —— 你只知道隔壁有没有东西
 *   短脉冲    中等代价、中等噪音     —— 日常导航用的那一档
 *   全功率    昂贵、极响、几乎全知   —— 用一次就把自己交出去
 *
 * 三条不可动摇的设计承诺：
 *
 * 1. **保真度决定伪影**：pArtifact = (1 - fidelity) × (1 + corruption × 2)。
 *    伪影是被错误标记为存在的房间，它们会真的出现在玩家的地图上。
 * 2. **伪影必须可被识破**：幻觉房间的 echoFingerprint 每次脉冲都会抖动，
 *    所以"同一个地方扫两次，回波延迟不一致"是一条玩家能自己发现的规律。
 * 3. **声呐图可以和真实拓扑矛盾**，这不是 bug，是恐怖的来源。我们只保证
 *    矛盾是有规律的、可推理的（支柱 P3/P4）。
 */

import type { ID, Rng, SonarResult } from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { bearingPan } from './graph';
import type {
  EchoTap,
  ListenerState,
  SonarAnomaly,
  SonarMode,
  SonarModeSpec,
  SonarSweep,
  WorldDoor,
  WorldGraph,
  WorldRoom,
} from './types';

// ============================================================================
// 模式表（严格照 GDD §4.4）
// ============================================================================

export const SONAR_MODES: Readonly<Record<SonarMode, SonarModeSpec>> = {
  passive: {
    mode: 'passive',
    label: '被动聆听',
    cost: 2,
    noise: 0,
    radius: 1,
    fidelity: 0.35,
    discrimination: 0.25,
  },
  chirp: {
    mode: 'chirp',
    label: '短脉冲',
    cost: 4,
    noise: 9,
    radius: 3,
    fidelity: 0.8,
    discrimination: 0.6,
  },
  boom: {
    mode: 'boom',
    label: '全功率',
    cost: 7,
    noise: 28,
    radius: 7,
    fidelity: 0.98,
    discrimination: 0.92,
  },
};

/** 契约 `WorldSystem.ping(power, fidelity)` 里的 power 映射到模式 */
export function modeFromPower(power: number): SonarMode {
  if (power <= 1.5) return 'passive';
  if (power <= 4.5) return 'chirp';
  return 'boom';
}

// ============================================================================
// 传播
// ============================================================================

/** 门对声能的透过率。水封的门反而比焊死的门传声好 —— 水是好导体 */
const DOOR_TRANSMISSION: Readonly<Record<WorldDoor['state'], number>> = {
  open: 1,
  closed: 0.72,
  jammed: 0.66,
  sealed: 0.34,
  welded: 0.18,
  'flooded-shut': 0.56,
};

function doorTransmission(door: WorldDoor): number {
  let t = DOOR_TRANSMISSION[door.state] ?? 0.5;
  // 爬管截面小，高频被截断
  if (door.crawl) t *= 0.52;
  // 跨甲板要穿过一整层甲板钢
  if (door.deckDelta !== 0) t *= 0.62;
  return t;
}

function roomTransmission(room: WorldRoom): number {
  // 水传声比空气好；底噪高的房间把回波糊掉
  const water = 0.82 + room.ambient.flooding * 0.34;
  const mask = 1 - room.ambient.noiseFloor * 0.36;
  return clamp(water * mask, 0.2, 1.2);
}

export interface PropagationNode {
  room: WorldRoom;
  hops: number;
  energy: number;
}

/** 声能扩散。返回每个房间的跳数与剩余能量 */
export function propagate(graph: WorldGraph, from: ID, radius: number): Map<ID, PropagationNode> {
  const out = new Map<ID, PropagationNode>();
  const origin = graph.rooms.get(from);
  if (!origin) return out;
  out.set(from, { room: origin, hops: 0, energy: 1 });

  let frontier: PropagationNode[] = [out.get(from) as PropagationNode];
  for (let h = 0; h < radius && frontier.length; h++) {
    const next: PropagationNode[] = [];
    for (const node of frontier) {
      for (const door of node.room.doors) {
        const to = graph.rooms.get(door.to);
        if (!to || to.id === node.room.id) continue;
        const energy = node.energy * doorTransmission(door) * roomTransmission(to);
        if (energy < 0.02) continue;
        const prev = out.get(to.id);
        if (prev && prev.energy >= energy) continue;
        const entry: PropagationNode = { room: to, hops: node.hops + 1, energy };
        out.set(to.id, entry);
        next.push(entry);
      }
    }
    frontier = next;
  }
  return out;
}

// ============================================================================
// 异常回波的指纹库
// ============================================================================

/**
 * signature 是玩家唯一拿得到的线索，所以它必须**有质感但不给答案**。
 * 纪律：只描述声学特征（材质、运动、周期、包络），绝不写"怪物"「危险」。
 * 玩家永远分不清那是怪、是尸体、还是自己的回声 —— 这正是目的。
 */
const SIGNATURES: Readonly<Record<SonarAnomaly['truth'], readonly string[]>> = {
  entity: [
    '软组织·移动中',
    '软组织·大质量·缓慢',
    '含水体·体积变化中',
    '非刚体·贴壁滑动',
    '软组织·多点接触地面',
    '低频振动源·自持',
    '含气腔·周期性充放',
    '软组织·与舱壁同温',
  ],
  corpse: [
    '软组织·静止',
    '骨密度信号·分散排列',
    '软组织·悬浮·随水摆动',
    '刚体与软体混合·固定',
    '骨密度信号·六处·等间距',
    '软组织·静止·温度低于环境',
  ],
  'self-echo': [
    '与你同步的回波',
    '呼吸包络·延迟 0.4 秒',
    '自体回声·相位反转',
    '与你同步的回波·早半拍',
    '心律包络·来源距离为零',
    '你刚才那一步的重放',
  ],
  structure: [
    '金属·规则敲击',
    '金属·应力释放',
    '空腔·图纸上此处为实心',
    '水—气界面',
    '金属·三短两长一短',
    '铰链·缓慢开启中',
    '结构·回波长度超出舱段尺寸',
    '金属·被从外侧挤压',
    '空腔·内部有二次反射面',
  ],
  phantom: [
    '回波·两次脉冲延迟不一致',
    '回波·无对应结构',
    '包络过于干净·疑似镜像',
    '回波·时间戳早于本次脉冲',
    '回波·与上一次完全相同',
  ],
  listener: [
    '大质量·正在接近',
    '低频·频率随距离下降',
    '结构变形·持续进行中',
    '大质量·占据整个舱段剖面',
    '低频·你的牙在共振',
  ],
};

function pickSignature(rng: Rng, truth: SonarAnomaly['truth'], fingerprint: number): string {
  const pool = SIGNATURES[truth];
  // 同一个房间的同一类异常，signature 稳定 —— 否则玩家没法做笔记，
  // 而"做笔记"是本作的真正战场
  const idx = Math.floor(clamp01(fingerprint) * pool.length) % pool.length;
  return rng.bool(0.22) ? rng.pick(pool) : pool[idx];
}

// ============================================================================
// 主扫描
// ============================================================================

export interface EntityHint {
  at: ID;
  /** 'entity' | 'listener' —— 由 Agent D 传入 */
  kind: 'entity' | 'listener';
  /** 它有多"响"（体积 / 活动度），影响置信度 */
  loud: number;
}

export interface SweepOptions {
  graph: WorldGraph;
  from: ID;
  mode: SonarMode;
  rng: Rng;
  /** VitalsSystem.derived('sonarRange') */
  rangeMul?: number;
  /** VitalsSystem.derived('sonarFidelity') */
  fidelityMul?: number;
  /** VeracitySystem.corruption */
  corruption?: number;
  san?: number;
  entities?: readonly EntityHint[];
  listener?: ListenerState | null;
  /** 玩家是否已学会"二次脉冲对比"这一招（know.sonar.tell） */
  knowsTell?: boolean;
  /** setpiece 钩子返回的屏蔽标志（淹没的圣堂） */
  blocked?: boolean;
  extraAnomalies?: readonly SonarAnomaly[];
  extraReveal?: readonly ID[];
  /** 条件可见房间的过滤器（零号舱：SAN < 20 才可见） */
  visible?: (room: WorldRoom) => boolean;
  /** 需要新建伪影房间时调用，返回新房间 id */
  spawnPhantom?: () => ID | null;
}

export function sweep(opts: SweepOptions): SonarSweep {
  const {
    graph,
    from,
    mode,
    rng,
    rangeMul = 1,
    fidelityMul = 1,
    corruption = 0,
    san = 100,
    entities = [],
    listener = null,
    knowsTell = false,
    blocked = false,
  } = opts;

  const spec = SONAR_MODES[mode];
  const fidelity = clamp01(spec.fidelity * fidelityMul);
  const radius = Math.max(1, Math.round(spec.radius * clamp(rangeMul, 0.3, 3)));

  const result: SonarSweep = {
    mode,
    revealed: [],
    noise: spec.noise,
    cost: spec.cost,
    anomalies: [],
    artifacts: [],
    echoes: [],
    fidelity,
    blinded: blocked,
    tells: [],
  };

  const origin = graph.rooms.get(from);
  if (!origin) return result;

  // ---- 被屏蔽：换能器在全淹舱里被压住。噪音照发，信息一点没有
  if (blocked) {
    result.revealed = [from];
    result.noise = spec.noise + 6;
    result.echoes = [{ delay: 0.008, gain: 0.9, pan: 0 }];
    result.tells.push('换能器没有回波。脉冲出去了，没有回来 —— 但它出去了。');
    result.anomalies = [...(opts.extraAnomalies ?? [])];
    return result;
  }

  const field = propagate(graph, from, radius);

  // ---- 揭示
  const revealed: ID[] = [];
  for (const node of field.values()) {
    const room = node.room;
    if (room.id === from) {
      revealed.push(room.id);
      continue;
    }
    // 条件可见（零号舱）：不满足条件的房间对声呐根本不存在
    if (opts.visible && !opts.visible(room)) continue;
    // 幻觉房间只在 corruption 够高时才"回波"
    if (room.veracity === 'phantom' && corruption < 0.28) continue;

    const concealment = room.tags.includes('secret') || !room.onBlueprint ? 0.35 : 0;
    const p = clamp01(fidelity * node.energy * (1 - concealment) * (1.25 - node.hops / (radius + 3)));
    if (room.mapped || rng.bool(p)) revealed.push(room.id);
  }
  for (const id of opts.extraReveal ?? []) if (!revealed.includes(id)) revealed.push(id);
  result.revealed = revealed;

  // ---- 伪影：保真度的直接后果
  const pArtifact = clamp01((1 - fidelity) * (1 + corruption * 2));
  const slots = 1 + Math.floor(radius / 3);
  for (let i = 0; i < slots; i++) {
    if (!rng.bool(pArtifact)) continue;
    // 优先把"已经存在的幻觉房间"报成真的，其次才新建一个
    const existing = [...field.values()].find(
      (n) => n.room.veracity === 'phantom' && !result.artifacts.includes(n.room.id),
    );
    if (existing) {
      result.artifacts.push(existing.room.id);
      if (!result.revealed.includes(existing.room.id)) result.revealed.push(existing.room.id);
      existing.room.echoFingerprint = rng.next(); // 抖动 = 破绽
      continue;
    }
    const spawned = opts.spawnPhantom?.();
    if (spawned) {
      result.artifacts.push(spawned);
      if (!result.revealed.includes(spawned)) result.revealed.push(spawned);
    }
  }

  // ---- 异常回波
  const anomalies: SonarAnomaly[] = [];
  const seen = new Set<ID>();
  const pushAnomaly = (a: SonarAnomaly) => {
    const key = `${a.at}/${a.truth}`;
    if (seen.has(key)) return;
    seen.add(key);
    anomalies.push(a);
  };

  // 实体（由 Agent D 提供位置）
  for (const e of entities) {
    const node = field.get(e.at);
    if (!node) continue;
    const truth: SonarAnomaly['truth'] = e.kind === 'listener' ? 'listener' : 'entity';
    // discrimination 低时置信度被拉向 0.5 —— 也就是"说不清"
    const raw = clamp01(node.energy * (0.4 + e.loud * 0.6));
    const conf = clamp01(0.5 + (raw - 0.5) * spec.discrimination);
    pushAnomaly({
      at: e.at,
      confidence: conf,
      signature: pickSignature(rng, truth, node.room.echoFingerprint),
      truth,
      hops: node.hops,
    });
  }

  // Listener 的扰动痕迹
  if (listener?.active) {
    for (const dist of listener.disturbances) {
      const node = field.get(dist.at);
      if (!node) continue;
      pushAnomaly({
        at: dist.at,
        confidence: clamp01(node.energy * dist.strength * spec.discrimination),
        signature: pickSignature(rng, 'listener', node.room.echoFingerprint),
        truth: 'listener',
        hops: node.hops,
      });
    }
  }

  // 房间自带的"东西"：尸体、巢、注视感、结构异常
  for (const node of field.values()) {
    const room = node.room;
    if (room.id === from) continue;
    if (!result.revealed.includes(room.id)) continue;

    if (room.veracity === 'phantom' || result.artifacts.includes(room.id)) {
      pushAnomaly({
        at: room.id,
        confidence: clamp01(0.3 + rng.float(0, 0.4)),
        signature: pickSignature(rng, 'phantom', room.echoFingerprint),
        truth: 'phantom',
        hops: node.hops,
      });
      continue;
    }
    const hasCorpse = room.props.some((p) => p.kind === 'corpse');
    const hasNest = room.props.some((p) => p.kind === 'nest');
    if (hasCorpse && rng.bool(0.55 * fidelity + 0.2)) {
      pushAnomaly({
        at: room.id,
        confidence: clamp01(0.4 + node.energy * 0.4 * spec.discrimination),
        signature: pickSignature(rng, 'corpse', room.echoFingerprint),
        truth: 'corpse',
        hops: node.hops,
      });
    }
    if (hasNest && rng.bool(0.4)) {
      pushAnomaly({
        at: room.id,
        confidence: clamp01(0.35 + node.energy * 0.35),
        signature: pickSignature(rng, 'entity', room.echoFingerprint + 0.13),
        truth: 'entity',
        hops: node.hops,
      });
    }
    if (room.ambient.presence > 0.6 && rng.bool(room.ambient.presence * 0.5)) {
      pushAnomaly({
        at: room.id,
        confidence: clamp01(room.ambient.presence * 0.6 * spec.discrimination),
        signature: pickSignature(rng, 'structure', room.echoFingerprint + 0.37),
        truth: 'structure',
        hops: node.hops,
      });
    }
  }

  // 自体回声：低 SAN 时你自己的回波会被报成"别的东西"
  const selfEchoChance = clamp01(0.06 + corruption * 0.5 + (san < 30 ? 0.2 : 0));
  if (rng.bool(selfEchoChance)) {
    const at = rng.pick(result.revealed.length ? result.revealed : [from]);
    pushAnomaly({
      at,
      confidence: clamp01(0.55 + rng.float(0, 0.35)),
      signature: pickSignature(rng, 'self-echo', rng.next()),
      truth: 'self-echo',
      hops: field.get(at)?.hops ?? 0,
    });
  }

  for (const extra of opts.extraAnomalies ?? []) pushAnomaly(extra);
  result.anomalies = anomalies;

  // ---- 多抽头回波（给 AudioSystem.sonarPing 做真实空间回响）
  result.echoes = buildEchoTaps(origin, field, result.revealed, fidelity, mode);

  // ---- 破绽提示
  result.tells = buildTells(result, knowsTell, corruption, graph);

  return result;
}

// ============================================================================
// 回波抽头
// ============================================================================

/**
 * 按拓扑距离计算延迟。
 * 用的是"游戏尺度"而非物理尺度：水中 1,500 m/s 会让相邻舱的回波在 0.03 秒内回来，
 * 人耳听不出空间感。所以每跳固定 55 ms 起，再按水位微调 ——
 * 水多的路径回波更早更亮，这一点和物理一致，玩家能从声音里听出"那边是水路"。
 */
export function buildEchoTaps(
  origin: WorldRoom,
  field: Map<ID, PropagationNode>,
  revealed: readonly ID[],
  fidelity: number,
  mode: SonarMode,
): EchoTap[] {
  const taps: EchoTap[] = [];
  const modeGain = mode === 'boom' ? 1 : mode === 'chirp' ? 0.72 : 0.42;

  // 直达抽头：换能器自己的近场反射。永远存在，是"你听见自己"的声学基础
  taps.push({ delay: 0.008 + origin.ambient.flooding * 0.004, gain: 0.85 * modeGain, pan: 0 });

  const revealedSet = new Set(revealed);
  for (const node of field.values()) {
    if (node.room.id === origin.id) continue;
    if (!revealedSet.has(node.room.id)) continue;
    const waterFactor = 1 - node.room.ambient.flooding * 0.28;
    const delay = node.hops * 0.055 * waterFactor + node.room.ambient.pressure * 0.00004;
    const gain = clamp01(node.energy * modeGain * (0.35 + fidelity * 0.65));
    if (gain < 0.015) continue;
    taps.push({ delay, gain, pan: bearingPan(origin, node.room) });
  }

  // 按延迟排序，并限制抽头数 —— WebAudio 的延迟线不是免费的
  taps.sort((a, b) => a.delay - b.delay);
  return taps.slice(0, 24);
}

// ============================================================================
// 破绽
// ============================================================================

/**
 * 玩家可观察的破绽（§5 要求每个谎言都带 tell）。
 * `knowsTell` 为假时只给出"感觉不对"级别的模糊描述；
 * 学会之后才给出可操作的验证方法。这让"学习"本身成为一种能力成长。
 */
function buildTells(sweep: SonarSweep, knowsTell: boolean, corruption: number, graph: WorldGraph): string[] {
  const out: string[] = [];
  if (sweep.artifacts.length) {
    if (knowsTell) {
      out.push(
        `有 ${sweep.artifacts.length} 处回波的延迟和上一次不一致。按记录册的判法，这些应判为不存在。`,
      );
    } else {
      out.push('这一次的回波图里有什么地方让你不舒服，但你说不出是哪里。');
    }
  }
  const selfEchoes = sweep.anomalies.filter((a) => a.truth === 'self-echo');
  if (selfEchoes.length && knowsTell) {
    out.push('有一处异常的呼吸包络和你完全同步。同步的东西不可能在三个舱以外。');
  }
  if (corruption >= 0.5 && sweep.mode !== 'passive') {
    out.push('示波管的余辉比应有的长。你数了两遍扫描线，两遍的条数不一样。');
  }
  const unstableRevealed = sweep.revealed.filter((id) => graph.rooms.get(id)?.veracity === 'unstable');
  if (unstableRevealed.length >= 3 && knowsTell) {
    out.push(`有 ${unstableRevealed.length} 个舱段的回波包络在单次脉冲内就发生了漂移。它们的门是活的。`);
  }
  return out;
}

// ============================================================================
// 契约转换
// ============================================================================

/** SonarSweep 是加宽版；契约要求的 SonarResult 是它的投影 */
export function toSonarResult(sweep: SonarSweep): SonarResult {
  return {
    revealed: sweep.revealed,
    noise: sweep.noise,
    anomalies: sweep.anomalies.map((a) => ({
      at: a.at,
      confidence: a.confidence,
      signature: a.signature,
    })),
    artifacts: sweep.artifacts,
  };
}

/** 给 UI 用的模式对比表 */
export function sonarModeTable(): readonly SonarModeSpec[] {
  return [SONAR_MODES.passive, SONAR_MODES.chirp, SONAR_MODES.boom];
}
