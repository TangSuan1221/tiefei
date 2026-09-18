/**
 * tools/mapgen-preview.ts — 地图生成的命令行可视化与统计
 *
 *   npx tsx tools/mapgen-preview.ts                 单图 ASCII 预览 + 1000 次统计
 *   npx tsx tools/mapgen-preview.ts --seed 4242     指定种子
 *   npx tsx tools/mapgen-preview.ts --runs 3000     改统计样本数
 *   npx tsx tools/mapgen-preview.ts --map-only      只看图
 *   npx tsx tools/mapgen-preview.ts --stats-only    只看统计
 *   npx tsx tools/mapgen-preview.ts --content       房间/Prop/Setpiece 内容体量清点
 *
 * 这个工具不是"看看好不好看"，它是生成器的验收台：
 * 可通关率必须 100%，每层点不交下行路径必须 ≥2，否则这一版生成器不能提交。
 */

import { ARCHETYPE_GLYPH, ARCHETYPE_LABEL, DECKS, deckSpec } from '../src/world/decks';
import { DEFAULT_WORLD_CONFIG, generateWorld } from '../src/world/generator';
import { gradeLevel, solve } from '../src/world/solver';
import { SETPIECES, SETPIECE_COUNT } from '../src/world/setpieces';
import {
  ALL_ROOM_VARIANTS,
  PICKABLE_VARIANT_COUNT,
  ROOM_VARIANT_COUNT,
  VARIANTS_PER_ARCHETYPE,
  assertRoomCoverage,
} from '../src/world/rooms';
import { ALL_PROP_DEFS, PROP_COUNT, PROP_KIND_COVERAGE, assertPropCoverage } from '../src/world/props';
import type { WorldGraph, WorldRoom } from '../src/world/types';
import type { ID } from '../src/core/contract';

// ============================================================================
// 参数
// ============================================================================

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}
const has = (name: string) => process.argv.includes(`--${name}`);

const SEED = Number.parseInt(arg('seed', '20260915') as string, 10);
const RUNS = Number.parseInt(arg('runs', '1000') as string, 10);

// ============================================================================
// ASCII 地图
// ============================================================================

const RESET = '';

function renderDeck(graph: WorldGraph, deck: number, criticalPath: Set<ID>): string[] {
  const rooms = [...graph.rooms.values()].filter((r) => r.deck === deck);
  if (!rooms.length) return [];

  const minX = Math.min(...rooms.map((r) => r.pos.x));
  const minY = Math.min(...rooms.map((r) => r.pos.y));
  const maxX = Math.max(...rooms.map((r) => r.pos.x));
  const maxY = Math.max(...rooms.map((r) => r.pos.y));
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  const grid: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(' '));
  const at = new Map<string, WorldRoom>();
  for (const r of rooms) {
    const x = r.pos.x - minX;
    const y = r.pos.y - minY;
    at.set(`${x},${y}`, r);
    let g = ARCHETYPE_GLYPH[r.archetype] ?? '?';
    if (criticalPath.has(r.id)) g = g.toUpperCase();
    grid[y][x] = g;
  }

  // 同层门：正交相邻且距离 2 的，用中间那一格画连接线
  const virtual: string[] = [];
  for (const r of rooms) {
    for (const d of r.doors) {
      const to = graph.rooms.get(d.to);
      if (!to || to.deck !== deck || to.id === r.id) continue;
      if (r.id > to.id) continue; // 每条边只画一次
      const ax = r.pos.x - minX;
      const ay = r.pos.y - minY;
      const bx = to.pos.x - minX;
      const by = to.pos.y - minY;
      const glyph = d.crawl ? '·' : d.lock ? '#' : d.unstable ? '?' : d.state === 'open' ? '-' : '+';
      if (ay === by && Math.abs(ax - bx) === 2) {
        const mx = (ax + bx) / 2;
        if (grid[ay][mx] === ' ') grid[ay][mx] = d.crawl ? '·' : glyph === '-' ? '-' : glyph;
      } else if (ax === bx && Math.abs(ay - by) === 2) {
        const my = (ay + by) / 2;
        if (grid[my][ax] === ' ') grid[my][ax] = d.crawl ? ':' : glyph === '-' ? '|' : glyph;
      } else {
        virtual.push(`${r.id}${glyph}${to.id}`);
      }
    }
  }

  const spec = deckSpec(deck);
  const out: string[] = [];
  out.push('');
  out.push(`┌─ ${spec.code} ${spec.name}  ${-spec.depth} m  ${rooms.length} 舱 ${RESET}`);
  out.push(`│  ${spec.tone}`);
  out.push('│');
  for (const row of grid) out.push(`│  ${row.join('')}`);
  if (virtual.length) {
    out.push('│');
    out.push(`│  非相邻连接: ${virtual.slice(0, 10).join('  ')}${virtual.length > 10 ? ` …+${virtual.length - 10}` : ''}`);
  }

  // 竖向下行口
  const descents: string[] = [];
  for (const r of rooms) {
    for (const d of r.doors) {
      if (d.deckDelta <= 0) continue;
      const lock = d.lock ? `[${d.lock.kind}:${d.lock.requires}]` : '[无锁]';
      descents.push(`${r.id}→${d.to} ${d.role === 'critical' ? '主' : '备'}${lock}${d.crawl ? '(爬管)' : ''}`);
    }
  }
  if (descents.length) {
    out.push('│');
    out.push('│  下行:');
    for (const s of descents) out.push(`│    ▼ ${s}`);
  }
  return out;
}

function renderRoomTable(graph: WorldGraph, criticalPath: Set<ID>): string[] {
  const out: string[] = [];
  out.push('');
  out.push('房间清单 (★=关键路径  ☆=setpiece  ○=不在图纸上)');
  const rooms = [...graph.rooms.values()].sort((a, b) => a.deck - b.deck || (a.id < b.id ? -1 : 1));
  for (const r of rooms) {
    const flags =
      (criticalPath.has(r.id) ? '★' : ' ') + (r.setpiece ? '☆' : ' ') + (r.onBlueprint ? ' ' : '○');
    const keys = r.props
      .flatMap((p) => p.interactions.filter((i) => !i.requires).flatMap((i) => i.effects ?? []))
      .filter((e) => e.op === 'flag' || e.op === 'item' || e.op === 'knowledge')
      .map((e) => (e.op === 'flag' ? e.key : e.op === 'item' ? e.item : e.op === 'knowledge' ? e.node : ''))
      .filter((k) => k.startsWith('sys.') || k.startsWith('item.key') || k.startsWith('ritual.') || k.includes('code.') || k.includes('blueprint'));
    const water = r.ambient.flooding > 0.9 ? '全淹' : r.ambient.flooding > 0.5 ? '深水' : r.ambient.flooding > 0.2 ? '浅水' : '干';
    out.push(
      `${flags} ${r.id.padEnd(9)} ${(ARCHETYPE_LABEL[r.archetype] ?? r.archetype).padEnd(4)} ${water.padEnd(3)} ` +
        `噪阈${String(r.noiseThreshold).padStart(3)} 门${String(new Set(r.doors.map((d) => d.to)).size).padStart(2)} ` +
        `物${String(r.props.length).padStart(2)}  ${r.name}` +
        (keys.length ? `\n${' '.repeat(12)}↳ 钥匙源: ${[...new Set(keys)].join(', ')}` : ''),
    );
  }
  return out;
}

function renderMap(seed: number): void {
  const res = generateWorld(seed, DEFAULT_WORLD_CONFIG);
  const { graph, report } = res;
  const grade = gradeLevel(graph, report);
  const criticalPath = new Set(report.criticalPath);

  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log(`  KYRIE-9 拓扑预览   seed=${seed}   ${graph.rooms.size} 个舱段   ${graph.decks} 层甲板`);
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('图例:  大写字母=关键路径上的房间   小写/符号=可选内容');
  console.log('       门:  - | 已开   + 关着   # 上锁   ? 不稳定(会重织)   · : 爬行管道');
  const glyphLegend = Object.entries(ARCHETYPE_GLYPH)
    .map(([a, g]) => `${g}=${ARCHETYPE_LABEL[a as keyof typeof ARCHETYPE_LABEL]}`)
    .join('  ');
  console.log(`       舱: ${glyphLegend}`);

  for (let deck = 1; deck <= graph.decks; deck++) {
    for (const line of renderDeck(graph, deck, criticalPath)) console.log(line);
  }

  console.log('');
  console.log('──────────────────────────────────────────────────────────────────────');
  console.log(`  悲观可通关     : ${report.solvable ? '是（所有可选门锁死、所有不稳定门失效）' : '否 ← 这是缺陷'}`);
  console.log(`  关键路径长度   : ${report.criticalPathLength} 个舱段`);
  console.log(`  关键路径       : ${report.criticalPath.join(' → ')}`);
  console.log(`  可选内容占比   : ${(report.optionalRatio * 100).toFixed(1)}%`);
  console.log(`  咽喉(关节点)   : ${report.bottlenecks.length} 处 ${report.bottlenecks.join(', ') || '（无）'}`);
  console.log(
    `  每层独立下行路: ${Object.entries(report.disjointDescents)
      .map(([d, n]) => `D${d}→D${Number(d) + 1}:${n}${n >= 2 ? '' : ' ← 不达标'}`)
      .join('  ')}`,
  );
  console.log(`  钥匙链         : ${report.keyOrder.map((k) => `${k.key}@${k.at}`).join(' → ') || '（无锁）'}`);
  console.log(`  setpiece       : ${graph.setpieces.join(', ')}`);
  console.log(`  生成尝试次数   : ${graph.attempts}${graph.repaired ? '（动用了兜底修复）' : ''}`);
  console.log(`  质量闸门       : ${grade.ok ? '通过' : `未过 — ${grade.reasons.join('; ')}`}`);
  if (graph.log.length) {
    console.log('');
    console.log('  生成日志:');
    for (const l of graph.log) console.log(`    · ${l}`);
  }

  for (const line of renderRoomTable(graph, criticalPath)) console.log(line);
}

// ============================================================================
// 统计
// ============================================================================

interface Stats {
  runs: number;
  solvable: number;
  firstTryOk: number;
  repaired: number;
  roomCounts: number[];
  pathLengths: number[];
  optionalRatios: number[];
  attempts: number[];
  minDisjoint: number[];
  disjointFail: number;
  bottleneckRatios: number[];
  setpieceHits: Map<string, number>;
  archetypeHits: Map<string, number>;
  variantHits: Map<string, number>;
  crawlways: number[];
  lockedDoors: number[];
  unstableDoors: number[];
  secretRooms: number[];
  deckReached: number[];
  failures: string[];
  /** 生成器内部被判不合格的原因分布 —— 用它定位是哪一条闸在拖低首过率 */
  rejectReasons: Map<string, number>;
}

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function pct(a: number[], p: number): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

function histogram(a: number[], buckets = 10, width = 44): string[] {
  if (!a.length) return [];
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  const span = Math.max(1, hi - lo);
  const counts = new Array<number>(buckets).fill(0);
  for (const v of a) counts[Math.min(buckets - 1, Math.floor(((v - lo) / span) * buckets))]++;
  const peak = Math.max(...counts);
  const out: string[] = [];
  for (let i = 0; i < buckets; i++) {
    const a0 = lo + (span * i) / buckets;
    const a1 = lo + (span * (i + 1)) / buckets;
    const bar = '█'.repeat(Math.round((counts[i] / peak) * width));
    out.push(`    ${a0.toFixed(0).padStart(4)}–${a1.toFixed(0).padEnd(4)} │${bar} ${counts[i]}`);
  }
  return out;
}

function runStats(runs: number, baseSeed: number): Stats {
  const st: Stats = {
    runs,
    solvable: 0,
    firstTryOk: 0,
    repaired: 0,
    roomCounts: [],
    pathLengths: [],
    optionalRatios: [],
    attempts: [],
    minDisjoint: [],
    disjointFail: 0,
    bottleneckRatios: [],
    setpieceHits: new Map(),
    archetypeHits: new Map(),
    variantHits: new Map(),
    crawlways: [],
    lockedDoors: [],
    unstableDoors: [],
    secretRooms: [],
    deckReached: [],
    failures: [],
    rejectReasons: new Map(),
  };

  for (let i = 0; i < runs; i++) {
    const seed = (baseSeed + i * 2654435761) >>> 0;
    let graph: WorldGraph;
    let report: ReturnType<typeof solve>;
    let firstTryOk = false;
    try {
      const res = generateWorld(seed, DEFAULT_WORLD_CONFIG);
      graph = res.graph;
      report = res.report;
      firstTryOk = res.firstTryOk;
    } catch (e) {
      st.failures.push(`seed=${seed} 抛异常: ${(e as Error).message}`);
      continue;
    }

    if (report.solvable) st.solvable++;
    else st.failures.push(`seed=${seed} 不可通关: ${report.failure ?? '未知'}`);
    if (firstTryOk) st.firstTryOk++;
    if (graph.repaired) st.repaired++;

    st.roomCounts.push(graph.rooms.size);
    st.pathLengths.push(report.criticalPathLength);
    st.optionalRatios.push(report.optionalRatio);
    st.attempts.push(graph.attempts);
    st.deckReached.push(report.deckReached);

    const dj = Object.values(report.disjointDescents);
    const minDj = dj.length ? Math.min(...dj) : 0;
    st.minDisjoint.push(minDj);
    if (minDj < 2) st.disjointFail++;

    st.bottleneckRatios.push(report.criticalPathLength ? report.bottlenecks.length / report.criticalPathLength : 0);

    for (const sp of graph.setpieces) st.setpieceHits.set(sp, (st.setpieceHits.get(sp) ?? 0) + 1);

    for (const entry of graph.log) {
      const m = /未过闸: (.+)$/.exec(entry);
      if (!m) continue;
      for (const raw of m[1].split('; ')) {
        const key = raw.replace(/\s*\(.*\)$/, '').replace(/D\d$/, 'D?');
        st.rejectReasons.set(key, (st.rejectReasons.get(key) ?? 0) + 1);
      }
    }

    let crawl = 0;
    let locked = 0;
    let unstable = 0;
    let secret = 0;
    for (const r of graph.rooms.values()) {
      st.archetypeHits.set(r.archetype, (st.archetypeHits.get(r.archetype) ?? 0) + 1);
      st.variantHits.set(r.variantId, (st.variantHits.get(r.variantId) ?? 0) + 1);
      if (!r.onBlueprint) secret++;
      for (const d of r.doors) {
        if (d.crawl) crawl++;
        if (d.lock) locked++;
        if (d.unstable) unstable++;
      }
    }
    st.crawlways.push(crawl / 2);
    st.lockedDoors.push(locked / 2);
    st.unstableDoors.push(unstable / 2);
    st.secretRooms.push(secret);
  }
  return st;
}

function printStats(st: Stats): void {
  const line = (l: string) => console.log(l);
  line('');
  line('══════════════════════════════════════════════════════════════════════');
  line(`  ${st.runs} 次生成统计`);
  line('══════════════════════════════════════════════════════════════════════');
  line('');
  line('【硬性验收】');
  line(`  可通关率（悲观模式）    : ${((st.solvable / st.runs) * 100).toFixed(2)}%  ${st.solvable}/${st.runs}` +
    `  ${st.solvable === st.runs ? '✔ 达标' : '✘ 不达标'}`);
  line(`  每层独立下行路径 ≥2     : ${(((st.runs - st.disjointFail) / st.runs) * 100).toFixed(2)}%` +
    `  ${st.disjointFail === 0 ? '✔ 达标' : `✘ ${st.disjointFail} 次不达标`}`);
  line(`  最深抵达 D5             : ${((st.deckReached.filter((d) => d >= 5).length / st.runs) * 100).toFixed(2)}%`);
  line(`  首次尝试即过质量闸       : ${((st.firstTryOk / st.runs) * 100).toFixed(1)}%`);
  line(`  动用兜底修复             : ${st.repaired} 次 (${((st.repaired / st.runs) * 100).toFixed(2)}%)`);
  line('');
  line('【规模】');
  line(`  平均房间数   : ${mean(st.roomCounts).toFixed(1)}  (σ=${stdev(st.roomCounts).toFixed(1)}, ` +
    `p5=${pct(st.roomCounts, 5)}, p50=${pct(st.roomCounts, 50)}, p95=${pct(st.roomCounts, 95)})`);
  line(`  平均生成尝试 : ${mean(st.attempts).toFixed(2)} 次`);
  line(`  平均上锁门   : ${mean(st.lockedDoors).toFixed(1)}`);
  line(`  平均不稳定门 : ${mean(st.unstableDoors).toFixed(1)}  ← 参与重织的门`);
  line(`  平均爬行管道 : ${mean(st.crawlways).toFixed(1)} 条`);
  line(`  平均秘密舱   : ${mean(st.secretRooms).toFixed(1)} 个（不在图纸上）`);
  line('');
  line('【关键路径长度分布】');
  line(`  均值 ${mean(st.pathLengths).toFixed(1)}  σ=${stdev(st.pathLengths).toFixed(1)}  ` +
    `p5=${pct(st.pathLengths, 5)}  p50=${pct(st.pathLengths, 50)}  p95=${pct(st.pathLengths, 95)}  ` +
    `min=${Math.min(...st.pathLengths)}  max=${Math.max(...st.pathLengths)}`);
  for (const l of histogram(st.pathLengths)) line(l);
  line('');
  line('【可选内容占比】');
  line(`  均值 ${(mean(st.optionalRatios) * 100).toFixed(1)}%  p5=${(pct(st.optionalRatios, 5) * 100).toFixed(1)}%  ` +
    `p95=${(pct(st.optionalRatios, 95) * 100).toFixed(1)}%`);
  line(`  咽喉占关键路径比例: ${(mean(st.bottleneckRatios) * 100).toFixed(1)}%（越低越不线性）`);
  line('');
  line('【setpiece 出现率】');
  for (const sp of SETPIECES) {
    const n = st.setpieceHits.get(sp.id) ?? 0;
    const p = (n / st.runs) * 100;
    const flag = sp.guaranteed ? (p >= 99.5 ? '✔' : '✘ 必放但未达 100%') : '';
    line(`  ${sp.guaranteed ? '[必放]' : '[可选]'} ${sp.name.padEnd(8)} ${p.toFixed(1).padStart(6)}%  ${flag}`);
  }
  line('');
  line('【拓扑多样性】');
  const variantsSeen = st.variantHits.size;
  const archHits = [...st.archetypeHits.entries()].sort((a, b) => b[1] - a[1]);
  const totalRooms = st.roomCounts.reduce((s, x) => s + x, 0);
  // 用归一化香农熵衡量原型分布的均匀度：1 = 完全均匀，0 = 只有一种
  let entropy = 0;
  for (const [, n] of archHits) {
    const p = n / totalRooms;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(archHits.length || 1);
  line(`  被用到的房间变体: ${variantsSeen}/${ROOM_VARIANT_COUNT} (${((variantsSeen / ROOM_VARIANT_COUNT) * 100).toFixed(1)}%)`);
  line(`  原型分布归一化熵: ${(maxEntropy ? entropy / maxEntropy : 0).toFixed(3)}  (1.0 = 完全均匀)`);
  line(`  原型使用频次 TOP10: ${archHits.slice(0, 10).map(([a, n]) => `${ARCHETYPE_LABEL[a as keyof typeof ARCHETYPE_LABEL] ?? a}:${(n / totalRooms * 100).toFixed(1)}%`).join('  ')}`);
  const unused = ALL_ROOM_VARIANTS.filter((v) => !st.variantHits.has(v.id) && !v.manualOnly);
  if (unused.length) {
    line(`  从未被抽到的可抽变体: ${unused.length} 个 — ${unused.slice(0, 6).map((v) => v.id).join(', ')}${unused.length > 6 ? ' …' : ''}`);
  }

  if (st.rejectReasons.size) {
    line('');
    line('【被闸门拒绝的原因分布】（同一次生成可能多次被拒，这里统计的是拒绝事件）');
    for (const [r, n] of [...st.rejectReasons.entries()].sort((a, b) => b[1] - a[1])) {
      line(`  ${r.padEnd(22)} ${String(n).padStart(5)}`);
    }
  }

  if (st.failures.length) {
    line('');
    line(`【失败样本】共 ${st.failures.length} 条，前 10 条:`);
    for (const f of st.failures.slice(0, 10)) line(`  · ${f}`);
  }
}

// ============================================================================
// 内容体量清点
// ============================================================================

function printContent(): void {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  内容体量清点（对照 GDD §9）');
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  房间原型          : ${Object.keys(VARIANTS_PER_ARCHETYPE).length} / 门槛 20`);
  console.log(`  房间变体（总）    : ${ROOM_VARIANT_COUNT} / 门槛 60 / 目标 100+`);
  console.log(`  房间变体（可抽取）: ${PICKABLE_VARIANT_COUNT}`);
  console.log(`  Prop 定义         : ${PROP_COUNT} / 自定门槛 60`);
  console.log(`  Setpiece          : ${SETPIECE_COUNT}（GDD 要求 5 必放 + ≥3 原创）`);
  console.log('');
  console.log('  每原型变体数:');
  for (const [a, n] of Object.entries(VARIANTS_PER_ARCHETYPE).sort((x, y) => y[1] - x[1])) {
    const label = ARCHETYPE_LABEL[a as keyof typeof ARCHETYPE_LABEL] ?? a;
    console.log(`    ${label.padEnd(5)} ${a.padEnd(12)} ${String(n).padStart(3)} ${'▇'.repeat(n)}`);
  }
  console.log('');
  console.log('  每 PropKind 定义数（15 种必须全覆盖）:');
  for (const [k, n] of Object.entries(PROP_KIND_COVERAGE).sort((x, y) => y[1] - x[1])) {
    console.log(`    ${k.padEnd(10)} ${String(n).padStart(3)} ${'▇'.repeat(n)}${n === 0 ? '  ✘ 未覆盖' : ''}`);
  }
  const ixCount = ALL_PROP_DEFS.reduce((s, d) => s + d.interactions.length, 0);
  console.log('');
  console.log(`  交互定义总数      : ${ixCount}`);
  console.log(`  平均每 Prop 交互数: ${(ixCount / PROP_COUNT).toFixed(2)}`);
  const withCondition = ALL_PROP_DEFS.reduce(
    (s, d) => s + d.interactions.filter((i) => i.requires).length,
    0,
  );
  console.log(`  带条件门控的交互  : ${withCondition} (${((withCondition / ixCount) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`  甲板              : ${DECKS.length}  ${DECKS.map((d) => `${d.code}(${-d.depth}m)`).join(' ')}`);
}

// ============================================================================
// main
// ============================================================================

function main(): void {
  assertPropCoverage();
  assertRoomCoverage();

  if (has('content')) {
    printContent();
    return;
  }
  if (!has('stats-only')) renderMap(SEED);
  if (!has('map-only')) {
    const t0 = Date.now();
    const st = runStats(RUNS, SEED);
    printStats(st);
    console.log('');
    console.log(`  用时 ${((Date.now() - t0) / 1000).toFixed(1)} s  (${((Date.now() - t0) / RUNS).toFixed(1)} ms/次)`);
  }
  console.log('');
}

main();
