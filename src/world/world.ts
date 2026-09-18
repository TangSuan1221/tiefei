/**
 * world/world.ts — WorldSystem 实现
 *
 * 整合生成器、求解器、声呐、重织、setpiece，并实现三件世界自己的事：
 *
 *   噪音传播（§4.3）  —— 每呼吸衰减 0.8，相邻房间获得 40% 溢出，水中传得更远
 *   水位演化          —— 按房间 floodRate 上涨，并向更干的邻舱转移
 *   Listener 召唤      —— 噪音超阈值后它开始**朝你移动**，沿途留下可被声呐
 *                        探测到的扰动，玩家有 8–20 个呼吸的窗口
 *
 * 契约 `WorldSystem` 的方法签名里没有 ctx，所以运行时上下文（SAN、corruption、
 * 玩家持有的钥匙、敌人位置）通过 `configure()` 注入。这是为了不修改
 * `core/contract.ts`（铁律），同时又让世界能对玩家状态作出反应。
 */

import type {
  Breaths,
  Effect,
  ID,
  LogTone,
  MoveResult,
  Rng,
  Room,
  Seed,
  SonarResult,
  WorldEvent,
  WorldGenConfig,
  WorldSystem,
} from '../core/contract';
import { BREATH } from '../core/contract';
import { Xoshiro } from '../core/rng';
import { clamp, clamp01 } from '../core/util';
import { deckDepth, deckSpec } from './decks';
import { DEFAULT_WORLD_CONFIG, generateWorld, spawnPhantomRoom } from './generator';
import { canWalk, makeCounters, shortestPath } from './graph';
import type { Counters } from './graph';
import { rehydrateProp } from './props';
import { describeRoom } from './rooms';
import { checkDoorMark, insight, markDoor, reweave as runReweave } from './reweave';
import type { ReweaveInsight } from './reweave';
import { SONAR_MODES, modeFromPower, sweep as runSweep, toSonarResult } from './sonar';
import type { EntityHint } from './sonar';
import { setpiece } from './setpieces';
import { gradeLevel, solve } from './solver';
import type {
  DoorMarkVerdict,
  ListenerState,
  ReweaveRecord,
  ReweaveReport,
  SetpieceContext,
  SetpieceHookResult,
  SolveReport,
  SonarMode,
  SonarSweep,
  WorldDoor,
  WorldGraph,
  WorldRoom,
} from './types';

// ============================================================================
// 运行时上下文
// ============================================================================

export interface WorldRuntime {
  san: number;
  /** VeracitySystem.corruption */
  corruption: number;
  breaths: Breaths;
  cycle: number;
  /** 玩家持有的钥匙（道具 id / 知识节点 / 旗标），由 game 层同步 */
  keys: Set<string>;
  /** Agent D 提供的实体位置 */
  entities: EntityHint[];
  /** 玩家是否学会了"二次脉冲对比"识破伪影 */
  knowsSonarTell: boolean;
  /** 派生属性：声呐半径 / 保真度 / 噪音倍率 / 潜行 */
  sonarRangeMul: number;
  sonarFidelityMul: number;
  noiseMul: number;
  stealth: number;
  /** 累计 Stigma，驱动重织强度 */
  stigmaTotal: number;
}

function defaultRuntime(): WorldRuntime {
  return {
    san: 100,
    corruption: 0,
    breaths: 0,
    cycle: 1,
    keys: new Set<string>(),
    entities: [],
    knowsSonarTell: false,
    sonarRangeMul: 1,
    sonarFidelityMul: 1,
    noiseMul: 1,
    stealth: 1,
    stigmaTotal: 0,
  };
}

export interface WorldLogLine {
  text: string;
  tone: LogTone;
}

/** 世界对外派发的、超出契约 WorldEvent 的附加产出 */
export interface WorldTurnOutput {
  events: WorldEvent[];
  log: WorldLogLine[];
  effects: Effect[];
}

// ============================================================================
// World
// ============================================================================

export class World implements WorldSystem {
  private graph: WorldGraph;
  private counters: Counters;
  private cfg: WorldGenConfig;
  private seed: Seed;
  private rt: WorldRuntime = defaultRuntime();
  private current: ID = '';
  private lastRoom: ID = '';
  private lastDoor: ID = '';
  private report: SolveReport | null = null;
  private listenerState: ListenerState | null = null;
  private reweaveHistory: ReweaveRecord[] = [];
  private setpieceState: Record<string, Record<string, number | string | boolean>> = {};
  private pendingLog: WorldLogLine[] = [];
  private pendingEffects: Effect[] = [];
  private phantomRng: Rng;

  constructor(seed: Seed = 1, cfg: WorldGenConfig = DEFAULT_WORLD_CONFIG) {
    this.seed = seed;
    this.cfg = cfg;
    this.counters = makeCounters();
    this.phantomRng = new Xoshiro(seed, 'phantom');
    const res = generateWorld(seed, cfg);
    this.graph = res.graph;
    this.counters = res.counters;
    this.report = res.report;
    this.current = res.graph.startRoomId;
    this.enterRoom(this.current, true);
  }

  // -------------------------------------------------------------- 契约接口

  get rooms(): ReadonlyMap<ID, Room> {
    return this.graph.rooms;
  }

  get currentRoomId(): ID {
    return this.current;
  }

  generate(seed: Seed, cfg: WorldGenConfig): void {
    this.seed = seed;
    this.cfg = cfg;
    this.phantomRng = new Xoshiro(seed, 'phantom');
    const res = generateWorld(seed, cfg);
    this.graph = res.graph;
    this.counters = res.counters;
    this.report = res.report;
    this.current = res.graph.startRoomId;
    this.lastRoom = '';
    this.lastDoor = '';
    this.listenerState = null;
    this.reweaveHistory = [];
    this.setpieceState = {};
    this.pendingLog = [];
    this.pendingEffects = [];
    this.enterRoom(this.current, true);
  }

  room(id: ID): Room {
    const r = this.graph.rooms.get(id);
    if (!r) throw new Error(`[world] 未知房间: ${id}`);
    return r;
  }

  /**
   * 移动。
   * 代价结构：走一步 + （门原本关着的话）开门。
   * 爬管走得慢（STEP × 2.2）但几乎不出声，代价在 SAN 上 —— 这是 GDD §6.2
   * 要求的"噪音最低但 SAN 消耗最高"那条有意义的权衡路径。
   */
  move(doorId: ID): MoveResult {
    const here = this.graph.rooms.get(this.current);
    const events: WorldEvent[] = [];
    if (!here) return { ok: false, cost: 0, noise: 0, events };

    const door = here.doors.find((d) => d.id === doorId);
    if (!door) return { ok: false, blockedBy: 'locked', cost: 0, noise: 0, events };

    if (!canWalk(door)) {
      return { ok: false, blockedBy: door.state, cost: BREATH.LOOK, noise: 1, events };
    }
    if (door.lock && !this.rt.keys.has(door.lock.requires)) {
      this.pendingLog.push({
        text: door.lock.hint ?? `门锁着。${door.lock.kind}。`,
        tone: 'system',
      });
      return { ok: false, blockedBy: 'locked', cost: BREATH.LOOK, noise: 1, events };
    }

    const target = this.graph.rooms.get(door.to);
    if (!target) return { ok: false, blockedBy: 'sealed', cost: BREATH.LOOK, noise: 1, events };

    // --- 代价
    const wading = Math.max(here.ambient.flooding, target.ambient.flooding);
    let cost = door.crawl ? BREATH.STEP * 2.2 : BREATH.STEP;
    cost += wading * 2.4;
    if (door.state === 'closed') cost += BREATH.OPEN_DOOR;
    if (door.state === 'jammed') cost += BREATH.FORCE_DOOR;
    cost = Math.round(cost);

    // --- 噪音（§4.3 的噪音源表：走路 1 / 开门 3 / 撬门 12）
    let noise = door.crawl ? 0.5 : 1;
    if (door.state === 'closed') noise += 3;
    if (door.state === 'jammed') noise += 12;
    noise += wading * 2;
    noise *= this.rt.noiseMul / Math.max(0.35, this.rt.stealth);
    noise = Math.round(noise * 10) / 10;

    // --- 爬管的 SAN 代价
    if (door.crawl) {
      this.pendingEffects.push({ op: 'vital', stat: 'san', delta: -4 });
      this.pendingEffects.push({ op: 'flag-add', key: 'count.crawled', delta: 1 });
      this.pendingLog.push({
        text: '你侧身挤进检修口。这里几乎不会有声音，但你会在里面待很久，而且你听得见自己的关节。',
        tone: 'eerie',
      });
    }

    // --- 离开当前房间：setpiece onExit
    const exitOut = this.runSetpieceHook(here, 'onExit');
    events.push(...(exitOut?.events ?? []));

    // --- 留下痕迹（镜像舱要把它们反过来）
    this.leaveTrace(here, door, wading);

    this.lastRoom = here.id;
    this.lastDoor = door.id;

    // --- 门打开后保持开启，这是玩家能读的地图信息
    if (door.state === 'closed' || door.state === 'jammed') {
      door.state = 'open';
      const twinRoom = this.graph.rooms.get(door.to);
      const twin = twinRoom?.doors.find((d) => d.id === door.twin);
      if (twin) twin.state = 'open';
    }

    this.current = target.id;
    const first = !target.visited;
    const enterEvents = this.enterRoom(target.id, first);
    events.push(...enterEvents);

    this.addNoise(target.id, noise);
    events.push(...this.drainNoiseEvents());

    return { ok: true, arrivedAt: target.id, cost, noise, events };
  }

  /**
   * 契约版声呐。`power` 决定模式（1/3/7 → 被动/短脉冲/全功率），
   * `fidelity` 是调用方期望的**绝对保真度**，内部换算成相对该模式的倍率。
   * 需要多抽头回波和破绽文本时用 `sonar()`。
   */
  ping(power: number, fidelity: number): SonarResult {
    return toSonarResult(this.sonar(modeFromPower(power), { absoluteFidelity: fidelity }));
  }

  /** 完整版声呐：额外给出回波抽头、破绽、屏蔽标志 */
  sonar(mode: SonarMode, opts: { absoluteFidelity?: number } = {}): SonarSweep {
    const here = this.graph.rooms.get(this.current);
    if (!here) {
      return {
        mode,
        revealed: [],
        noise: 0,
        cost: 0,
        anomalies: [],
        artifacts: [],
        echoes: [],
        fidelity: 0,
        blinded: true,
        tells: [],
      };
    }
    const rng = new Xoshiro(
      (this.seed ^ Math.imul(this.rt.breaths + 1, 0x9e3779b9)) >>> 0,
      `sonar/${this.current}`,
    );

    const base = SONAR_MODES[mode];
    const fidelityMul =
      opts.absoluteFidelity !== undefined
        ? clamp(opts.absoluteFidelity / base.fidelity, 0.1, 2)
        : this.rt.sonarFidelityMul;

    // setpiece 可以屏蔽声呐（淹没的圣堂）或追加内容（回声室、零号舱）
    const hook = this.runSetpieceHook(here, 'onPing', mode);

    const result = runSweep({
      graph: this.graph,
      from: this.current,
      mode,
      rng,
      rangeMul: this.rt.sonarRangeMul,
      fidelityMul,
      corruption: this.rt.corruption,
      san: this.rt.san,
      entities: this.rt.entities,
      listener: this.listenerState,
      knowsTell: this.rt.knowsSonarTell,
      blocked: hook?.result?.blockSonar === true,
      extraAnomalies: hook?.result?.extraAnomalies,
      extraReveal: hook?.result?.reveal,
      visible: (room) => this.sonarVisible(room),
      spawnPhantom: () => this.trySpawnPhantom(here),
    });

    for (const id of result.revealed) {
      const r = this.graph.rooms.get(id);
      if (r) r.mapped = true;
    }

    this.addNoise(this.current, result.noise * this.rt.noiseMul);

    return result;
  }

  /**
   * 重织。契约签名是 `reweave(rng, pressure)`，所以玩家位置等信息从
   * 运行时状态里取。所有规则与验证在 reweave.ts 里，这里只做派发与记账。
   */
  reweave(rng: Rng, pressure: number): void {
    this.reweaveDetailed(rng, pressure);
  }

  reweaveDetailed(rng: Rng, pressure: number): ReweaveReport {
    const report = runReweave({
      graph: this.graph,
      rng,
      pressure,
      playerAt: this.current,
      lastDoorId: this.lastDoor,
      stigma: this.rt.stigmaTotal,
    });
    this.reweaveHistory.push(...report.records);

    if (report.changed > 0) {
      this.pendingLog.push({
        text:
          report.changed === 1
            ? '船体某处发出一声很长的金属摩擦。不是应力，应力是脆的，这一声是滑的。'
            : `船在改。你听见 ${report.changed} 处舱壁在动，动的方向都一样 —— 往下。`,
        tone: 'eerie',
      });
    }
    for (const doorId of report.tripped) {
      const check = checkDoorMark(this.graph, doorId);
      this.pendingLog.push({ text: check.detail, tone: 'whisper' });
      if (check.verdict === 'rewoven') {
        // 抓到一次重织 = debunk 成功，这是 §5 的博弈循环
        this.pendingEffects.push({ op: 'vital', stat: 'san', delta: 8 });
        this.pendingEffects.push({ op: 'flag-add', key: 'count.reweave-caught', delta: 1 });
        this.pendingEffects.push({ op: 'knowledge', node: 'know.world.reweave.confirmed' });
      }
    }
    return report;
  }

  /**
   * 噪音传播（§4.3）。
   * 水下声音传得远，所以相邻房间获得 40% 溢出，而且溢出会继续往外传
   * （每跳再 ×0.4，低于 0.5 就停）。焊死的门几乎不传，水封的门反而传得好。
   */
  addNoise(roomId: ID, amount: number): void {
    const room = this.graph.rooms.get(roomId);
    if (!room || amount <= 0) return;
    room.noise += amount;

    let frontier: { room: WorldRoom; amount: number }[] = [{ room, amount: amount * 0.4 }];
    const seen = new Set<ID>([roomId]);
    for (let hop = 0; hop < 3 && frontier.length; hop++) {
      const next: { room: WorldRoom; amount: number }[] = [];
      for (const node of frontier) {
        if (node.amount < 0.5) continue;
        for (const door of node.room.doors) {
          const to = this.graph.rooms.get(door.to);
          if (!to || seen.has(to.id)) continue;
          let carried = node.amount;
          if (door.state === 'welded') carried *= 0.08;
          else if (door.state === 'sealed') carried *= 0.3;
          else if (door.state === 'flooded-shut') carried *= 0.7;
          // 水是好导体
          carried *= 0.85 + to.ambient.flooding * 0.5;
          if (carried < 0.5) continue;
          to.noise += carried;
          seen.add(to.id);
          next.push({ room: to, amount: carried * 0.4 });
        }
      }
      frontier = next;
    }
  }

  serialize(): unknown {
    return {
      version: 1,
      seed: this.seed,
      cfg: this.cfg,
      current: this.current,
      lastRoom: this.lastRoom,
      lastDoor: this.lastDoor,
      startRoomId: this.graph.startRoomId,
      exitRoomId: this.graph.exitRoomId,
      decks: this.graph.decks,
      graphSeed: this.graph.seed,
      counters: { ...this.counters },
      deckEntry: [...this.graph.deckEntry.entries()],
      descents: [...this.graph.descents.entries()],
      setpieces: [...this.graph.setpieces],
      log: [...this.graph.log],
      repaired: this.graph.repaired,
      attempts: this.graph.attempts,
      listener: this.listenerState,
      reweaveHistory: this.reweaveHistory,
      setpieceState: this.setpieceState,
      rooms: [...this.graph.rooms.values()].map((r) => ({
        id: r.id,
        archetype: r.archetype,
        name: r.name,
        variantId: r.variantId,
        deck: r.deck,
        pos: { ...r.pos },
        ambient: { ...r.ambient },
        noise: r.noise,
        noiseThreshold: r.noiseThreshold,
        visited: r.visited,
        mapped: r.mapped,
        veracity: r.veracity,
        tags: [...r.tags],
        traces: [...r.traces],
        spent: [...r.spent],
        onBlueprint: r.onBlueprint,
        onCriticalPath: r.onCriticalPath,
        echoFingerprint: r.echoFingerprint,
        floodRate: r.floodRate,
        setpiece: r.setpiece,
        onEnterNode: r.onEnterNode,
        // prop 只存 id，describe 从内容库重建
        props: r.props.map((p) => p.id),
        doors: r.doors.map((d) => ({ ...d })),
      })),
    };
  }

  hydrate(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const blob = data as {
      seed: Seed;
      cfg: WorldGenConfig;
      current: ID;
      lastRoom: ID;
      lastDoor: ID;
      startRoomId: ID;
      exitRoomId: ID;
      decks: number;
      graphSeed: number;
      counters: Counters;
      deckEntry: [number, ID][];
      descents: [number, ID[]][];
      setpieces: string[];
      log: string[];
      repaired: boolean;
      attempts: number;
      listener: ListenerState | null;
      reweaveHistory: ReweaveRecord[];
      setpieceState: Record<string, Record<string, number | string | boolean>>;
      rooms: {
        id: ID;
        archetype: WorldRoom['archetype'];
        name: string;
        variantId: string;
        deck: number;
        pos: { x: number; y: number };
        ambient: WorldRoom['ambient'];
        noise: number;
        noiseThreshold: number;
        visited: boolean;
        mapped: boolean;
        veracity: WorldRoom['veracity'];
        tags: string[];
        traces: string[];
        spent: string[];
        onBlueprint: boolean;
        onCriticalPath: boolean;
        echoFingerprint: number;
        floodRate: number;
        setpiece?: string;
        onEnterNode?: ID;
        props: string[];
        doors: WorldDoor[];
      }[];
    };

    this.seed = blob.seed;
    this.cfg = blob.cfg;
    this.counters = { ...blob.counters };
    this.phantomRng = new Xoshiro(blob.seed, 'phantom');
    this.graph = {
      rooms: new Map(),
      startRoomId: blob.startRoomId,
      exitRoomId: blob.exitRoomId,
      deckEntry: new Map(blob.deckEntry),
      descents: new Map(blob.descents),
      decks: blob.decks,
      seed: blob.graphSeed,
      log: [...blob.log],
      setpieces: [...blob.setpieces],
      attempts: blob.attempts,
      repaired: blob.repaired,
    };
    for (const r of blob.rooms) {
      const room: WorldRoom = {
        id: r.id,
        archetype: r.archetype,
        name: r.name,
        pos: { x: r.pos.x, y: r.pos.y },
        deck: r.deck,
        ambient: { ...r.ambient },
        doors: r.doors.map((x) => ({ ...x })),
        props: r.props.map((pid) => rehydrateProp(pid)).filter((p): p is NonNullable<typeof p> => !!p),
        visited: r.visited,
        mapped: r.mapped,
        veracity: r.veracity,
        noise: r.noise,
        noiseThreshold: r.noiseThreshold,
        tags: [...r.tags],
        variantId: r.variantId,
        onCriticalPath: r.onCriticalPath,
        echoFingerprint: r.echoFingerprint,
        floodRate: r.floodRate,
        traces: [...r.traces],
        onBlueprint: r.onBlueprint,
        spent: [...r.spent],
      };
      if (r.setpiece) room.setpiece = r.setpiece;
      if (r.onEnterNode) room.onEnterNode = r.onEnterNode;
      this.graph.rooms.set(room.id, room);
    }
    this.current = blob.current;
    this.lastRoom = blob.lastRoom;
    this.lastDoor = blob.lastDoor;
    this.listenerState = blob.listener;
    this.reweaveHistory = blob.reweaveHistory ?? [];
    this.setpieceState = blob.setpieceState ?? {};
    this.report = solve(this.graph, { pessimistic: true });
  }

  // -------------------------------------------------------------- 扩展接口

  configure(patch: Partial<WorldRuntime>): void {
    this.rt = { ...this.rt, ...patch };
  }

  get runtime(): Readonly<WorldRuntime> {
    return this.rt;
  }

  get solveReport(): SolveReport | null {
    return this.report;
  }

  get topology(): WorldGraph {
    return this.graph;
  }

  get depth(): number {
    const r = this.graph.rooms.get(this.current);
    return r ? deckDepth(r.deck) : 0;
  }

  get listener(): Readonly<ListenerState> | null {
    return this.listenerState;
  }

  /** 房间描述：三档随 SAN 切换 */
  describe(roomId: ID = this.current, san: number = this.rt.san): string {
    const r = this.graph.rooms.get(roomId);
    if (!r) return '这里什么都没有。连墙都没有。';
    const base = describeRoom(r.variantId, san);
    if (!r.traces.length) return base;
    return `${base}\n\n你留下的痕迹：${r.traces.slice(-3).join('；')}`;
  }

  /**
   * 推进世界 n 个呼吸。
   * 噪音衰减 -0.8/呼吸（§4.3），水位按 floodRate 上涨并向干燥邻舱转移，
   * Listener 每 2 个呼吸走一步。
   */
  advance(breaths: Breaths, rng: Rng): WorldTurnOutput {
    const events: WorldEvent[] = [];
    this.rt.breaths += breaths;

    // --- 噪音衰减
    for (const room of this.graph.rooms.values()) {
      if (room.noise > 0) room.noise = Math.max(0, room.noise - 0.8 * breaths);
    }

    // --- 水位演化
    for (const room of this.graph.rooms.values()) {
      if (room.floodRate <= 0) continue;
      const before = room.ambient.flooding;
      const after = clamp01(before + room.floodRate * breaths);
      if (after === before) continue;
      room.ambient.flooding = after;
      room.ambient.airQuality = clamp01(room.ambient.airQuality - (after - before) * 0.35);
      if (before < 0.9 && after >= 0.9) {
        room.tags = [...new Set([...room.tags, 'breath-hold'])];
        events.push({ kind: 'flood', roomId: room.id, rate: room.floodRate });
        for (const d of room.doors) {
          if (d.role !== 'critical' && rng.bool(0.3)) d.state = 'flooded-shut';
        }
      }
      // 水往更干的邻舱流
      if (after > 0.55) {
        for (const d of room.doors) {
          const to = this.graph.rooms.get(d.to);
          if (!to || !canWalk(d)) continue;
          if (to.ambient.flooding >= room.ambient.flooding - 0.08) continue;
          const transfer = Math.min(0.004 * breaths, (room.ambient.flooding - to.ambient.flooding) * 0.25);
          to.ambient.flooding = clamp01(to.ambient.flooding + transfer);
          to.floodRate = Math.max(to.floodRate, 0.0008);
        }
      }
    }

    // --- 噪音阈值 → 召唤
    events.push(...this.checkThresholds(rng));

    // --- Listener 移动
    events.push(...this.advanceListener(breaths, rng));

    return { events, log: this.drainLog(), effects: this.drainEffects() };
  }

  /** 玩家在门上做标记，用来检测重织 */
  mark(doorId: ID, glyph = '一道划痕'): boolean {
    const m = markDoor({ graph: this.graph, doorId, glyph, breaths: this.rt.breaths });
    if (m) {
      this.pendingLog.push({
        text: `你在门框上留下${glyph}。位置你记住了：右侧合页上方三指。`,
        tone: 'system',
      });
    }
    return !!m;
  }

  /** 检查标记：intact / rewoven / missing / unmarked */
  checkMark(doorId: ID): { verdict: DoorMarkVerdict; detail: string } {
    const res = checkDoorMark(this.graph, doorId);
    return { verdict: res.verdict, detail: res.detail };
  }

  /** 玩家已归纳出的重织规律 */
  reweaveInsight(): ReweaveInsight {
    return insight(this.reweaveHistory, this.graph);
  }

  /**
   * 压力告解室的解法。
   * 这是一个**世界侧的公开 API**：sim 层知道玩家实际屏了几口气，把数字传进来。
   * 对上 → 门开；短了 → 门不动；长了 → 强制大喘气（§4.3：25 噪音）。
   */
  holdBreathInConfessional(heldBreaths: number): WorldTurnOutput {
    const here = this.graph.rooms.get(this.current);
    const out: WorldTurnOutput = { events: [], log: [], effects: [] };
    if (!here || here.setpiece !== 'pressure-confessional') {
      out.log.push({ text: '这里没有需要你计数的东西。', tone: 'system' });
      return out;
    }
    const state = this.stateFor('pressure-confessional');
    const target = typeof state.target === 'number' && state.target > 0 ? state.target : 9;

    if (heldBreaths === target) {
      state.matched = true;
      out.effects.push({ op: 'knowledge', node: 'know.world.confessional.matched' });
      out.effects.push({ op: 'vital', stat: 'san', delta: 6 });
      out.log.push({
        text: '两根指针重合了。门没有开的动作，它只是变成了开着的 —— 中间那一下你没看见。',
        tone: 'good',
      });
      for (const d of here.doors) if (d.role === 'secret' && d.state === 'sealed') d.state = 'open';
    } else if (heldBreaths < target) {
      out.log.push({
        text: `肺内压指针停在 ${heldBreaths}，腔内压在 ${target}。差得还多。门一动不动。`,
        tone: 'system',
      });
    } else {
      out.log.push({
        text: '你屏过了头。身体自己接管了 —— 一次很大的吸气，整条走廊都听见了。',
        tone: 'bad',
      });
      this.addNoise(here.id, 25 * this.rt.noiseMul);
      out.effects.push({ op: 'vital', stat: 'co2', delta: -30 });
      out.effects.push({ op: 'vital', stat: 'fear', delta: 16 });
      out.events.push(...this.drainNoiseEvents());
    }
    return out;
  }

  /** 把堆积的日志与效果交给上层。调用方每回合取一次 */
  drainLog(): WorldLogLine[] {
    const out = this.pendingLog;
    this.pendingLog = [];
    return out;
  }

  drainEffects(): Effect[] {
    const out = this.pendingEffects;
    this.pendingEffects = [];
    return out;
  }

  /** 关卡质量：preview 工具与导演 AI 都要看 */
  grade() {
    const report = this.report ?? solve(this.graph, { pessimistic: true });
    return gradeLevel(this.graph, report);
  }

  /** 玩家已知的地图（声呐图）。可能包含伪影与幻觉房间 —— 故意的 */
  knownRooms(): WorldRoom[] {
    return [...this.graph.rooms.values()].filter((r) => r.mapped || r.visited);
  }

  /** 到月池的提示方向：给"它在教你走迷宫"那条线用 */
  hintTowardExit(): ID | null {
    const path = shortestPath(this.graph, this.current, this.graph.exitRoomId, (d) => canWalk(d));
    return path && path.length > 1 ? path[1] : null;
  }

  // -------------------------------------------------------------- 内部

  private enterRoom(id: ID, first: boolean): WorldEvent[] {
    const events: WorldEvent[] = [];
    const room = this.graph.rooms.get(id);
    if (!room) return events;
    room.visited = true;
    if (!room.mapped) {
      room.mapped = true;
      events.push({ kind: 'room-discovered', roomId: id });
    }

    // 注视感与水位的即时代价
    if (room.ambient.presence > 0.6) {
      this.pendingEffects.push({ op: 'vital', stat: 'san', delta: -Math.round(room.ambient.presence * 5) });
    }
    if (room.ambient.flooding > 0.9) {
      this.pendingEffects.push({ op: 'vital', stat: 'co2', delta: 6 });
      this.pendingEffects.push({ op: 'vital', stat: 'coreTemp', delta: -1.2 });
    }

    const hook = this.runSetpieceHook(room, 'onEnter');
    if (hook) events.push(...hook.events);

    if (first && room.onEnterNode) {
      // 叙事节点的触发由 game 层读取 room.onEnterNode 完成，这里只记账
      this.pendingLog.push({ text: this.describe(room.id), tone: 'neutral' });
    }
    return events;
  }

  private leaveTrace(room: WorldRoom, door: WorldDoor, wading: number): void {
    const dirs = ['左', '右'];
    const side = dirs[(door.id.charCodeAt(door.id.length - 1) + room.traces.length) % 2];
    if (wading > 0.25) {
      room.traces.push(`一串往${side}去的湿脚印，间距是你的步幅`);
    } else if (door.crawl) {
      room.traces.push(`检修口边缘的灰被手肘擦掉了一块，擦向${side}`);
    } else if (room.traces.length < 4) {
      room.traces.push(`地面的灰上有一道往${side}的拖痕`);
    }
    if (room.traces.length > 6) room.traces.splice(0, room.traces.length - 6);
  }

  private stateFor(setpieceId: string): Record<string, number | string | boolean> {
    if (!this.setpieceState[setpieceId]) this.setpieceState[setpieceId] = {};
    return this.setpieceState[setpieceId];
  }

  private runSetpieceHook(
    room: WorldRoom,
    hook: 'onEnter' | 'onExit' | 'onPing',
    mode?: SonarMode,
  ): { events: WorldEvent[]; result: SetpieceHookResult | null } | null {
    if (!room.setpiece) return null;
    const def = setpiece(room.setpiece);
    if (!def) return null;
    const ctx: SetpieceContext = {
      graph: this.graph,
      room,
      previousRoom: this.graph.rooms.get(this.lastRoom),
      san: this.rt.san,
      breaths: this.rt.breaths,
      cycle: this.rt.cycle,
      state: this.stateFor(room.setpiece),
    };
    let res: SetpieceHookResult | null = null;
    if (hook === 'onEnter') res = def.onEnter?.(ctx) ?? null;
    else if (hook === 'onExit') res = def.onExit?.(ctx) ?? null;
    else res = def.onPing?.(ctx, mode ?? 'chirp') ?? null;

    const events: WorldEvent[] = [];
    if (!res) return { events, result: null };

    for (const line of res.log ?? []) this.pendingLog.push(line);
    for (const eff of res.effects ?? []) this.pendingEffects.push(eff);
    if (res.renameTo) room.name = res.renameTo;
    if (res.removeProps && room.props.length) {
      const n = Math.min(res.removeProps, room.props.length);
      room.props = room.props.slice(0, room.props.length - n);
    }
    for (const doorId of res.unlockDoors ?? []) {
      const door = room.doors.find((x) => x.id === doorId);
      if (door) {
        delete door.lock;
        door.state = 'open';
      }
    }
    if (res.floodDelta) {
      for (const r of this.graph.rooms.values()) {
        if (r.deck !== res.floodDelta.deck) continue;
        r.ambient.flooding = clamp01(r.ambient.flooding + res.floodDelta.amount);
        r.floodRate = Math.max(r.floodRate, 0.0012);
      }
      events.push({ kind: 'flood', roomId: room.id, rate: res.floodDelta.amount });
    }
    if (res.worldEvents) events.push(...res.worldEvents);
    if (res.teleportTo && this.graph.rooms.has(res.teleportTo)) {
      this.current = res.teleportTo;
    }
    return { events, result: res };
  }

  /** 条件可见：零号舱这类房间只在特定状态下对声呐存在 */
  private sonarVisible(room: WorldRoom): boolean {
    if (!room.setpiece) return true;
    const def = setpiece(room.setpiece);
    if (!def?.sonarVisible) return true;
    return def.sonarVisible({ san: this.rt.san, cycle: this.rt.cycle });
  }

  private trySpawnPhantom(host: WorldRoom): ID | null {
    // 幻觉房间数量要有上限，否则声呐图会彻底不可读，那就不是欺骗而是噪音了
    let phantoms = 0;
    for (const r of this.graph.rooms.values()) if (r.veracity === 'phantom') phantoms++;
    if (phantoms >= 6) return null;
    const room = spawnPhantomRoom(this.graph, this.counters, this.phantomRng, host);
    return room.id;
  }

  private checkThresholds(rng: Rng): WorldEvent[] {
    const events: WorldEvent[] = [];
    for (const room of this.graph.rooms.values()) {
      if (room.noise < room.noiseThreshold) continue;
      room.noise = room.noiseThreshold * 0.55; // 消耗掉，避免每帧重复触发
      events.push({ kind: 'listener-summoned', roomId: room.id });
      this.summonListener(room.id, rng);
    }
    return events;
  }

  private drainNoiseEvents(): WorldEvent[] {
    const rng = new Xoshiro((this.seed ^ Math.imul(this.rt.breaths + 7, 0x85ebca6b)) >>> 0, 'noise');
    return this.checkThresholds(rng);
  }

  /**
   * 召唤 Listener。它**不会立刻出现**（§4.3）：
   * 它从最远的一个未被玩家看见的舱段出发，朝噪音源移动，
   * 沿途留下可被声呐探测到的扰动。玩家有 8–20 个呼吸的窗口逃离或隐藏。
   */
  private summonListener(towards: ID, rng: Rng): void {
    if (this.listenerState?.active) {
      // 已经在路上了：只更新它认为你在哪，并重置窗口
      this.listenerState.believesYouAt = towards;
      this.listenerState.confidence = clamp01(this.listenerState.confidence + 0.3);
      this.listenerState.since = 0;
      return;
    }
    const target = this.graph.rooms.get(towards);
    if (!target) return;
    // 出生点：同层、离玩家最远、且玩家没看见过的房间
    let spawn: WorldRoom | null = null;
    let bestDist = -1;
    for (const r of this.graph.rooms.values()) {
      if (r.id === towards || r.veracity === 'phantom') continue;
      if (Math.abs(r.deck - target.deck) > 1) continue;
      const path = shortestPath(this.graph, r.id, towards, (d) => canWalk(d));
      const dist = path ? path.length : 0;
      const unseen = r.visited ? 0.5 : 1.4;
      const score = dist * unseen;
      if (score > bestDist) {
        bestDist = score;
        spawn = r;
      }
    }
    if (!spawn) return;
    this.listenerState = {
      at: spawn.id,
      believesYouAt: towards,
      confidence: 0.7,
      since: 0,
      window: rng.int(8, 20),
      active: true,
      disturbances: [{ at: spawn.id, strength: 1 }],
    };
    this.pendingLog.push({
      text: '很远的地方有一段舱壁开始变形。不是塌，是被挤开。间隔很规律，而且间隔在变短。',
      tone: 'bad',
    });
    this.pendingEffects.push({ op: 'vital', stat: 'fear', delta: 18 });
    this.pendingEffects.push({ op: 'sfx', cue: 'hull-deform-distant' });
  }

  private advanceListener(breaths: Breaths, rng: Rng): WorldEvent[] {
    const events: WorldEvent[] = [];
    const st = this.listenerState;
    if (!st?.active) return events;
    st.since += breaths;

    const stepsDue = Math.floor(st.since / 2) - st.disturbances.length + 1;
    for (let i = 0; i < Math.max(0, Math.min(stepsDue, 4)); i++) {
      const path = shortestPath(this.graph, st.at, st.believesYouAt, (d) => canWalk(d));
      if (!path || path.length < 2) break;
      st.at = path[1];
      st.disturbances.push({ at: st.at, strength: clamp01(1 - st.disturbances.length * 0.12) });
      if (st.disturbances.length > 8) st.disturbances.shift();
      const room = this.graph.rooms.get(st.at);
      if (room) {
        // 它挤过的地方会留下永久证据
        room.tags = [...new Set([...room.tags, 'listener-passed'])];
        room.ambient.presence = clamp01(room.ambient.presence + 0.12);
      }
    }

    if (st.at === this.current) {
      this.pendingLog.push({
        text: '它到了。你和它现在在同一个舱里。它不知道你具体在哪 —— 只要你不出声。',
        tone: 'bad',
      });
      this.pendingEffects.push({ op: 'vital', stat: 'fear', delta: 30 });
      this.pendingEffects.push({ op: 'sfx', cue: 'listener-contact' });
      st.confidence = clamp01(st.confidence + 0.2);
    }

    // 窗口过了还没找到你：它失去兴趣，撤回去。玩家藏对了就该有回报
    if (st.since > st.window * 3 && st.at !== this.current) {
      st.active = false;
      this.pendingLog.push({
        text: '变形声停了，然后开始变远。它走错了方向，它的方向是你刚才发出声音的地方。',
        tone: 'good',
      });
      this.pendingEffects.push({ op: 'vital', stat: 'san', delta: 4 });
    }
    if (rng.bool(0.02)) st.confidence = clamp01(st.confidence - 0.05);
    return events;
  }
}

/** 便捷构造：给 tools 与测试用 */
export function createWorld(seed: Seed, cfg: WorldGenConfig = DEFAULT_WORLD_CONFIG): World {
  return new World(seed, cfg);
}
