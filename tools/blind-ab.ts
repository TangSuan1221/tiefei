/**
 * 盲测执行器。
 *
 * 用法：
 *   npx tsx tools/blind-ab.ts                      跑全部 slot
 *   npx tsx tools/blind-ab.ts sonar3               只跑指定 slot
 *   npx tsx tools/blind-ab.ts sonar3 4000          指定每个变体的试验次数
 *   npx tsx tools/blind-ab.ts --ablate sonar3 <变体id> [次数]
 *                                                  消融测量：把实验台的每项改造
 *                                                  单独关掉再跑，量出它的指标位移
 *   npx tsx tools/blind-ab.ts --reveal sonar3      揭晓（评审写完结论之后才准跑）
 *
 * 产出两个文件：
 *   qa/ab/<slot>-report.md   匿名报告，只有"甲/乙"，交给评审
 *   qa/ab/<slot>-key.b64     答案，评审读完并给出判断之后才打开
 *
 * 为什么要真的分成两个文件：如果答案和报告在一起，评审即使被要求
 * "不要看名字"，也已经看到了。盲测的物理隔离比口头约定可靠。
 *
 * ── 盲测协议的一个漏洞（第一轮被判定书当场指了出来）─────────────────────
 * 上一轮的报告正文通过行动 ID 直接泄露了两个变体的**形态**
 *（`sonar:charge1..8` 对 `sonar:passive/chirp/boom` —— 一个是八级滑杆，
 * 一个是三件工具，不看 key 也能读出来）。
 * 现在报告只渲染匿名标签（`甲-A1 / 甲-A2 …`）加一张**纯数值属性表**：
 * 评审拿得到判断所需的全部参数，但拿不到任何语义化命名。
 * 跨变体共有的行动（移动 / 休息 / 屏息 / 大喘气）不匿名 —— 它们在所有方案里
 * 都一样，不构成身份线索，而且盖掉它们只会让报告变得读不懂。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Xoshiro } from '../src/core/rng';
import {
  allSlots,
  deriveMetrics,
  getSlot,
  METRIC_LABELS,
  METRIC_WEIGHTS,
  scoreMetrics,
  scoreWithoutSurprise,
  type MechanicMetrics,
  type MechanicVariant,
  type TrialTrace,
  type VariantSlot,
} from '../src/game/variants';
import { BENCH, reattribute, resetBench } from '../src/game/ab/model';

// 副作用导入：各 slot 在模块顶层自行注册
import '../src/game/ab/sonar';
import '../src/game/ab/threat';
import '../src/game/ab/sonar3';
import '../src/game/ab/sonar4';

const OUT_DIR = join(process.cwd(), 'qa', 'ab');

/** 跨变体共有的行动，不需要匿名 */
const SHARED_ACTIONS: Record<string, string> = {
  'move:known-forward': '移动·已知·朝出口',
  'move:known-lateral': '移动·已知·横向',
  'move:blind-forward': '移动·未照·朝出口',
  'move:blind-lateral': '移动·未照·横向',
  rest: '休息',
  hold: '屏息',
  gasp: '强制大喘气',
};

interface VariantResult {
  variant: MechanicVariant;
  metrics: MechanicMetrics;
  score: number;
  scoreNoSurprise: number;
  /** 把"机制诱导玩家浪费"那几类误判摘掉之后重算的可归因性 */
  cleanAttributability: number;
  traces: TrialTrace[];
  summary: TrialSummary;
}

/**
 * 「机制诱导型」误判：它们指认的不是玩家的一步错棋，而是机制让玩家做了无用功。
 * 判读要点第七条要求把这两种分开看，所以报告同时给出摘掉它们之后的归因率。
 */
const INDUCED_MISTAKES = ['empty-echo', 'redundant-ping', 'aborted-ping'];

interface TrialSummary {
  survivalRate: number;
  avgDuration: number;
  causes: Record<string, number>;
  /** 死因占**死亡**的比例 */
  causeShare: Record<string, number>;
  /**
   * 行动使用率，两把尺子同时给：
   * `pct` 按行动条数，`timePct` 按呼吸时间。
   *
   * 上一轮的判定书是被前者骗的：一次三拍承诺在台账里摊成八条，一次即时解算只有一条，
   * 于是同一件事在两个变体里被记不同次数，"移动占比 6.46%"这个假数字看起来
   * 和别的客观数据没有区别。两个数并排放着，读的人至少不会不知道自己在用哪一把尺子。
   */
  actionUsage: { action: string; pct: number; timePct: number }[];
  /** 使用率最高的行动占比（条数口径） —— 统治性解法的直接证据 */
  topActionShare: number;
  /** 使用率低于 0.5%（条数口径）的废行动数量 */
  deadActions: number;
  /** 移动行动占整局**呼吸时间**的比例 */
  moveTimeRate: number;
  /** 感知相关行动（起手 + 僵直附属拍）占全部行动的比例 */
  senseRate: number;
  /** 只算**起手档位**的占比。不含僵直拍，可与上一轮的口径直接对比 */
  modeRate: number;
  /**
   * 感知花掉的**呼吸**占整局时长的比例 —— 准入线用的是这一个。
   *
   * 另两个口径在跨形态比较时都会骗人：按行动条数算，一次感知拆成八拍的方案
   * 能拿到 72%；只算起手，同一个方案又掉到 12%，因为它的起手只占循环的一拍。
   * 两个数字描述的是同一个行为。时间是唯一在两种行动经济学之间守恒的单位。
   */
  senseTimeRate: number;
  /**
   * 在感知**起手档位内部**，使用率最高的那一档的占比。
   * 这才是判断被测机制是否存在统治性解法的正确口径 ——
   * 用全局占比会被"走路"淹没，任何机制看起来都很健康；
   * 把僵直附属拍算进来同样会淹没它。
   */
  topSenseShare: number;
  /** 从不被使用的感知档位数 */
  deadSenseModes: number;
  /** 感知档位的有效多样性（exp(香农熵)，可读成"实际在用几档"） */
  senseDiversity: number;
  /** 误判台账按类型汇总，单位：每百次死亡出现次数 */
  mistakeMix: { kind: string; per100Deaths: number }[];
  /** 行为事件，单位：每局平均次数 */
  eventMix: { key: string; perTrial: number }[];
  /** 技巧三分位的存活率，用来直读技巧表达度 */
  survivalByTier: [number, number, number];
}

function main(): void {
  const argv = process.argv.slice(2);

  if (argv[0] === '--reveal') {
    reveal(argv[1]);
    return;
  }
  if (argv[0] === '--ablate') {
    ablate(argv[1], argv[2], argv[3] ? Number(argv[3]) : 1800);
    return;
  }
  if (argv[0] === '--diag') {
    diagnose(argv[1], argv[2], argv[3] ? Number(argv[3]) : 900);
    return;
  }

  const [slotArg, trialsArg] = argv;
  const trials = trialsArg ? Number(trialsArg) : 2700;
  const slots = slotArg ? [requireSlot(slotArg)] : allSlots();

  if (slots.length === 0) {
    console.error('没有注册任何盲测 slot。');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  resetBench();

  for (const slot of slots) {
    console.log(`\n══ 盲测 slot: ${slot.slot} ══`);
    console.log(`问题：${slot.question}`);
    console.log(`每个变体 ${trials} 次试验，跨 ${SKILL_BINS} 个技巧档位\n`);

    const results = slot.variants.map((v) => evaluate(v, trials));

    // 匿名化：用固定种子打乱标签，保证可复现但顺序不可预测
    const labelRng = new Xoshiro(hash(slot.slot + trials), 'label');
    const order = labelRng.shuffle(results.map((_, i) => i));
    const labels = ['甲', '乙', '丙', '丁'];

    const report = renderReport(slot, order.map((i, k) => ({ label: labels[k], r: results[i] })));
    const key = {
      slot: slot.slot,
      question: slot.question,
      trials,
      generatedAt: new Date().toISOString(),
      mapping: order.map((i, k) => ({
        label: labels[k],
        variantId: results[i].variant.id,
        variantName: results[i].variant.name,
        thesis: results[i].variant.thesis,
        weightedScore: Number(results[i].score.toFixed(4)),
        // 行动 ID 的匿名映射也封进 key：揭晓时才对得上号
        actionMap: anonMap(results[i], labels[k]),
      })),
    };

    const reportPath = join(OUT_DIR, `${slot.slot}-report.md`);
    const keyPath = join(OUT_DIR, `${slot.slot}-key.b64`);
    writeFileSync(reportPath, report, 'utf8');
    // 答案做 base64 编码：口头约定"别看答案"挡不住顺手一瞥，
    // 但要主动解码就已经是明知故犯了。盲测的物理隔离比自律可靠。
    writeFileSync(
      keyPath,
      `# 盲测答案（base64）。评审给出结论之前不要解码。\n` +
        `# 揭晓： npx tsx tools/blind-ab.ts --reveal ${slot.slot}\n` +
        Buffer.from(JSON.stringify(key, null, 2), 'utf8').toString('base64'),
      'utf8',
    );

    console.log(report);
    console.log(`\n匿名报告 → ${reportPath}`);
    console.log(`封存答案 → ${keyPath}  （评审给出结论之前不要打开）`);
  }
}

const SKILL_BINS = 9;

function evaluate(variant: MechanicVariant, trials: number): VariantResult {
  const traces: TrialTrace[] = [];
  const perBin = Math.max(1, Math.floor(trials / SKILL_BINS));
  // 按技巧档位从低到高排列，deriveMetrics 依赖这个顺序来切分三分位
  for (let b = 0; b < SKILL_BINS; b++) {
    const skill = b / (SKILL_BINS - 1);
    for (let i = 0; i < perBin; i++) {
      // 种子只与 (bin, i) 有关，与变体无关 —— 两个变体面对完全相同的世界序列
      const rng = new Xoshiro(hash(`${b}:${i}`), 'trial');
      traces.push(variant.run(rng, skill));
    }
  }
  const metrics = deriveMetrics(traces);
  const deaths = traces.filter((t) => !t.survived);
  return {
    variant,
    metrics,
    score: scoreMetrics(metrics),
    scoreNoSurprise: scoreWithoutSurprise(metrics),
    cleanAttributability: deaths.length
      ? deaths.filter((t) => reattribute(t, INDUCED_MISTAKES)).length / deaths.length
      : 0.5,
    traces,
    summary: summarize(traces, variant),
  };
}

function summarize(traces: readonly TrialTrace[], variant: MechanicVariant): TrialSummary {
  const causes: Record<string, number> = {};
  const usage = new Map<string, number>();
  const usageTime = new Map<string, number>();
  const mistakes = new Map<string, number>();
  const events = new Map<string, number>();
  let totalDecisions = 0;
  let totalTime = 0;
  let survived = 0;
  let durSum = 0;
  let deaths = 0;

  for (const t of traces) {
    if (t.survived) survived++;
    else {
      causes[t.cause] = (causes[t.cause] ?? 0) + 1;
      deaths++;
    }
    durSum += t.duration;
    for (const d of t.decisions) {
      usage.set(d.chosen, (usage.get(d.chosen) ?? 0) + 1);
      const spent = d.spent ?? 1;
      usageTime.set(d.chosen, (usageTime.get(d.chosen) ?? 0) + spent);
      totalDecisions++;
      totalTime += spent;
    }
    for (const m of t.mistakes) mistakes.set(m.kind, (mistakes.get(m.kind) ?? 0) + 1);
    for (const [k, v] of Object.entries(t.events)) events.set(k, (events.get(k) ?? 0) + v);
  }

  const actionUsage = [...usage.entries()]
    .map(([action, n]) => ({
      action,
      pct: (n / totalDecisions) * 100,
      timePct: ((usageTime.get(action) ?? 0) / Math.max(1, totalTime)) * 100,
    }))
    .sort((a, b) => b.pct - a.pct);
  const moveTimeRate = actionUsage
    .filter((a) => a.action.startsWith('move:'))
    .reduce((s, a) => s + a.timePct, 0);

  // 起手档位与僵直附属拍必须分开统计，否则"一次感知拆成八拍"会凭空抬高占比
  const catalog = variant.catalog?.() ?? [];
  const modeIds = new Set(catalog.filter((c) => c.kind === 'mode').map((c) => c.id));
  const senseEntries = [...usage.entries()].filter(([a]) => a.startsWith('sonar:'));
  const modeEntries = senseEntries.filter(([a]) => (modeIds.size ? modeIds.has(a) : true));
  const senseTotal = senseEntries.reduce((s, [, n]) => s + n, 0);
  // 感知的**时间**占比。见 model.ts 里 `sense-breaths` 处的注释：
  // 行动条数这把尺子在"一次感知拆成八拍"和"一次感知一条"之间是坏的，时间才是公共单位
  const senseBreaths = traces.reduce((s, t) => s + (t.events['sense-breaths'] ?? 0), 0);
  const modeTotal = modeEntries.reduce((s, [, n]) => s + n, 0);

  let modeEntropy = 0;
  for (const [, n] of modeEntries) {
    const p = n / Math.max(1, modeTotal);
    if (p > 0) modeEntropy -= p * Math.log(p);
  }
  const topMode = modeEntries.reduce((m, e) => (e[1] > m[1] ? e : m), ['', 0] as [string, number]);
  const declaredModes = modeIds.size || modeEntries.length;

  const third = Math.floor(traces.length / 3);
  const tierRate = (from: number, to: number): number => {
    const slice = traces.slice(from, to);
    return slice.length ? slice.filter((t) => t.survived).length / slice.length : 0;
  };

  return {
    survivalRate: survived / traces.length,
    avgDuration: durSum / traces.length,
    causes,
    causeShare: Object.fromEntries(
      Object.entries(causes).map(([c, n]) => [c, n / Math.max(1, deaths)]),
    ),
    actionUsage,
    topActionShare: actionUsage[0]?.pct ?? 0,
    deadActions: actionUsage.filter((a) => a.pct < 0.5).length,
    moveTimeRate,
    senseRate: (senseTotal / totalDecisions) * 100,
    modeRate: (modeTotal / totalDecisions) * 100,
    senseTimeRate: (senseBreaths / Math.max(1, durSum)) * 100,
    topSenseShare: modeTotal > 0 ? (topMode[1] / modeTotal) * 100 : 0,
    deadSenseModes: declaredModes - modeEntries.filter(([, n]) => n / Math.max(1, modeTotal) >= 0.02).length,
    senseDiversity: modeTotal > 0 ? Math.exp(modeEntropy) : 0,
    mistakeMix: [...mistakes.entries()]
      .map(([kind, n]) => ({ kind, per100Deaths: (n / Math.max(1, deaths)) * 100 }))
      .sort((a, b) => b.per100Deaths - a.per100Deaths),
    eventMix: [...events.entries()]
      .map(([key, n]) => ({ key, perTrial: n / traces.length }))
      .sort((a, b) => b.perTrial - a.perTrial),
    survivalByTier: [tierRate(0, third), tierRate(third, third * 2), tierRate(third * 2, traces.length)],
  };
}

// ---------------------------------------------------------------------------
// 行动 ID 匿名化
// ---------------------------------------------------------------------------

/**
 * 给这个变体的每个**私有**行动分配一个匿名标签（`甲-A1` …），按使用率排序。
 * 共有行动（移动/休息/屏息/大喘气）保留可读名 —— 它们在所有方案里都一样。
 */
function anonMap(r: VariantResult, label: string): Record<string, string> {
  const map: Record<string, string> = {};
  let i = 0;
  for (const a of r.summary.actionUsage) {
    if (SHARED_ACTIONS[a.action]) continue;
    map[a.action] = `${label}-A${++i}`;
  }
  // 目录里声明了但一次都没被用的档位也要有标签 —— 废档本身就是关键证据
  for (const c of r.variant.catalog?.() ?? []) {
    if (!map[c.id] && !SHARED_ACTIONS[c.id]) map[c.id] = `${label}-A${++i}`;
  }
  return map;
}

// ---------------------------------------------------------------------------
// 报告渲染
// ---------------------------------------------------------------------------

interface Gate {
  name: string;
  need: string;
  show(r: VariantResult): string;
  pass(r: VariantResult): boolean;
}

const num = (v: number): string => v.toFixed(3);
const pctOf = (v: number): string => `${v.toFixed(1)}%`;
const emptyEcho = (r: VariantResult): number =>
  r.summary.mistakeMix.find((m) => m.kind === 'empty-echo')?.per100Deaths ?? 0;
/** 三分位存活率相邻两档之间最小的那一个落差（负数 = 出现了倒挂） */
const tierSlope = (r: VariantResult): number => {
  const [a, b, c] = r.summary.survivalByTier;
  return Math.min(b - a, c - b) * 100;
};

/** 轮次 2 判定书给的六项。感知时间占比按**时间**口径核对，理由见 `senseTimeRate` */
const GATE_BASE: Gate[] = [
  { name: '技巧表达度', need: '≥ 0.55', show: (r) => num(r.metrics.skillExpression), pass: (r) => r.metrics.skillExpression >= 0.55 },
  { name: '失败可归因', need: '≥ 0.50', show: (r) => num(r.metrics.attributability), pass: (r) => r.metrics.attributability >= 0.5 },
  { name: '张力曲线', need: '≥ 0.50', show: (r) => num(r.metrics.tensionShape), pass: (r) => r.metrics.tensionShape >= 0.5 },
  { name: '感知时间占比（呼吸口径）', need: '≥ 20%', show: (r) => pctOf(r.summary.senseTimeRate), pass: (r) => r.summary.senseTimeRate >= 20 },
  {
    name: '听者死因占比（占死亡数）',
    need: '≥ 35%',
    show: (r) => pctOf((r.summary.causeShare.listener ?? 0) * 100),
    pass: (r) => (r.summary.causeShare.listener ?? 0) * 100 >= 35,
  },
  { name: '加权总分（剔除意外率）', need: '≥ 0.62', show: (r) => r.scoreNoSurprise.toFixed(3), pass: (r) => r.scoreNoSurprise >= 0.62 },
];

/**
 * 轮次 3 判定书给第四轮定的十项。
 *
 * 前六项沿用（"感知时间占比"换成"三分位单调"），后四项针对上一轮暴露出来的两处真问题：
 * 恢复余地与机制诱导的无用功；最后两项是守成条款 —— 不许为了买恢复余地
 * 赔掉已经赢下来的档位多样性。
 */
const GATE_ROUND4: Gate[] = [
  GATE_BASE[0],
  {
    name: '三分位存活率单调不降',
    need: '相邻落差 ≥ 0',
    show: (r) => `${r.summary.survivalByTier.map((v) => (v * 100).toFixed(1)).join('→')}（最小落差 ${tierSlope(r).toFixed(1)}）`,
    pass: (r) => tierSlope(r) >= 0,
  },
  GATE_BASE[1],
  GATE_BASE[2],
  GATE_BASE[4],
  GATE_BASE[5],
  { name: '恢复余地', need: '≥ 0.50', show: (r) => num(r.metrics.comeback), pass: (r) => r.metrics.comeback >= 0.5 },
  { name: '`empty-echo`（次/百死）', need: '≤ 100', show: (r) => emptyEcho(r).toFixed(1), pass: (r) => emptyEcho(r) <= 100 },
  {
    name: '起手档位内部最高频（条数口径）',
    need: '≤ 55%',
    show: (r) => pctOf(r.summary.topSenseShare),
    pass: (r) => r.summary.topSenseShare <= 55,
  },
  { name: '废档位', need: '= 0', show: (r) => String(r.summary.deadSenseModes), pass: (r) => r.summary.deadSenseModes === 0 },
];

function gatesFor(slot: string): { title: string; list: Gate[] } {
  return slot === 'sonar4'
    ? { title: '这是上一轮判定书给第四轮定的进线条件，十项必须同时满足。', list: GATE_ROUND4 }
    : { title: '这是上一轮判定书给这个 slot 定的进线条件，六项必须同时满足。', list: GATE_BASE };
}

function renderReport(slot: VariantSlot, entries: { label: string; r: VariantResult }[]): string {
  const lines: string[] = [];

  lines.push(`# 盲测报告 · ${slot.slot}`);
  lines.push('');
  lines.push(`**设计问题**：${slot.question}`);
  lines.push('');
  lines.push(
    '> 以下 ' +
      entries.length +
      ' 套方案的身份已被隐去。请**只依据数据与行为分布**判断哪一套更好，' +
      '并写清判断依据。给出结论之前不要打开 key 文件。',
  );
  lines.push('');
  lines.push(
    '> **行动 ID 也已匿名**。上一轮的报告正文靠行动命名就泄露了两个变体的形态，' +
      '所以这一轮每个方案的私有行动只以 `甲-A1 / 乙-A1 …` 出现，' +
      '判断所需的全部参数改由第三节的纯数值属性表提供。' +
      '跨方案共有的行动（移动 / 休息 / 屏息 / 强制大喘气）不匿名。',
  );
  lines.push('');

  // ---- 指标对照表 ----
  lines.push('## 一、量化指标（0–1，越高越好）');
  lines.push('');
  lines.push(`| 指标 | 权重 | ${entries.map((e) => `方案${e.label}`).join(' | ')} | 差值 |`);
  lines.push(`|---|---|${entries.map(() => '---').join('|')}|---|`);
  for (const k of Object.keys(METRIC_LABELS) as (keyof MechanicMetrics)[]) {
    const vals = entries.map((e) => e.r.metrics[k]);
    const delta = Math.max(...vals) - Math.min(...vals);
    const mark = delta > 0.12 ? ' ⟵ 显著' : '';
    lines.push(
      `| ${METRIC_LABELS[k]} | ${METRIC_WEIGHTS[k].toFixed(2)} | ` +
        vals.map((v) => v.toFixed(3)).join(' | ') +
        ` | ${delta.toFixed(3)}${mark} |`,
    );
  }
  lines.push(
    `| **加权总分** | — | ${entries.map((e) => `**${e.r.score.toFixed(4)}**`).join(' | ')} | ` +
      `${(Math.max(...entries.map((e) => e.r.score)) - Math.min(...entries.map((e) => e.r.score))).toFixed(4)} |`,
  );
  lines.push(
    `| **加权总分（剔除意外率）** | — | ${entries.map((e) => `**${e.r.scoreNoSurprise.toFixed(4)}**`).join(' | ')} | ` +
      `${(
        Math.max(...entries.map((e) => e.r.scoreNoSurprise)) -
        Math.min(...entries.map((e) => e.r.scoreNoSurprise))
      ).toFixed(4)} |`,
  );
  lines.push('');
  lines.push(
    '意外率的评分带已从 1.5–4 次/百呼吸收窄到 2.0–3.0，' +
      '因为上一轮它对两个变体同时给满分、贡献 8.5% 权重却零区分度。' +
      '即便如此，总分仍同时给出剔除它之后的版本，供判断是否被单项饱和稀释。',
  );
  lines.push('');
  lines.push(
    '**口径**：决策熵、张力曲线、意外率按**呼吸时间**加权或采样；' +
      '决策密度是一个速率（分子为选择数、分母为呼吸数）；' +
      '技巧表达度、可学习性、失败可归因、恢复余地按**局**统计。' +
      '八项之中没有按行动条数算的占比 —— 那把尺子在两种形态之间不守恒。',
  );
  lines.push('');

  // ---- 准入线 ----
  const gate = gatesFor(slot.slot);
  lines.push('## 二、准入线核对');
  lines.push('');
  lines.push(gate.title);
  lines.push('');
  lines.push(`| 条件 | 要求 | ${entries.map((e) => `方案${e.label}`).join(' | ')} |`);
  lines.push(`|---|---|${entries.map(() => '---').join('|')}|`);
  for (const g of gate.list) {
    lines.push(
      `| ${g.name} | ${g.need} | ` +
        entries.map((e) => `${g.show(e.r)} ${g.pass(e.r) ? '✅' : '❌'}`).join(' | ') +
        ' |',
    );
  }
  lines.push(
    `| **全部通过** | — | ` +
      entries.map((e) => (gate.list.every((g) => g.pass(e.r)) ? '**是**' : '**否**')).join(' | ') +
      ' |',
  );
  lines.push('');

  // ---- 结果分布 ----
  lines.push('## 三、结果分布与行为');
  lines.push('');
  for (const e of entries) {
    const s = e.r.summary;
    const map = anonMap(e.r, e.label);
    const name = (id: string): string => SHARED_ACTIONS[id] ?? map[id] ?? id;

    lines.push(`### 方案${e.label}`);
    lines.push('');
    lines.push(
      `- 存活率 **${(s.survivalRate * 100).toFixed(1)}%**，平均存活 **${s.avgDuration.toFixed(0)}** 呼吸`,
    );
    lines.push(
      `- 技巧三分位存活率：低 **${(s.survivalByTier[0] * 100).toFixed(1)}%** → 中 **${(
        s.survivalByTier[1] * 100
      ).toFixed(1)}%** → 高 **${(s.survivalByTier[2] * 100).toFixed(1)}%**` +
        `（高低差 **${((s.survivalByTier[2] - s.survivalByTier[0]) * 100).toFixed(1)}** 个百分点）`,
    );
    lines.push(
      `- 死因分布（占死亡）：` +
        Object.entries(s.causeShare)
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => `${c} ${(v * 100).toFixed(1)}%`)
          .join(' · '),
    );
    lines.push(
      `- **【呼吸时间口径】**感知花掉的呼吸占整局 **${s.senseTimeRate.toFixed(1)}%**，` +
        `移动占 **${s.moveTimeRate.toFixed(1)}%** ⟵ 准入线用这个口径`,
    );
    lines.push(
      `- **【行动条数口径】**感知占 ${s.senseRate.toFixed(1)}%（其中起手档位 ${s.modeRate.toFixed(1)}%），` +
        `移动占 ${s.actionUsage
          .filter((a) => a.action.startsWith('move:'))
          .reduce((t, a) => t + a.pct, 0)
          .toFixed(1)}%` +
        ` ⟵ **这把尺子在两种形态之间不守恒**：一次"发声—僵直—回波"会摊成八条，` +
        `一次即时解算只有一条，同一件事被记的次数不同。判断占比请用上面一行`,
    );
    lines.push(
      `- **起手档位内部**最高频占比 **${s.topSenseShare.toFixed(1)}%**（条数口径；起手在两种形态里都是一条，这一项守恒。超过 55% 视为存在统治性档位）`,
    );
    lines.push(`- 起手档位有效多样性 **${s.senseDiversity.toFixed(2)}** 档（实际被用起来的档数）`);
    lines.push(`- 从不被使用的起手档位：**${s.deadSenseModes}**`);
    lines.push(
      `- 全局最高频行动占比 ${s.topActionShare.toFixed(1)}%（条数口径）、` +
        `${(s.actionUsage.reduce((m, a) => Math.max(m, a.timePct), 0)).toFixed(1)}%（时间口径），` +
        `全局废行动 ${s.deadActions} 个`,
    );
    lines.push(
      `- 死亡可归因 ${(e.r.metrics.attributability * 100).toFixed(1)}%；` +
        `剔除机制诱导型误判（\`empty-echo\` / \`redundant-ping\` / \`aborted-ping\`）后重算 ` +
        `**${(e.r.cleanAttributability * 100).toFixed(1)}%** ⟵ 两者差得越多，名义归因分里的水分越大`,
    );
    lines.push('');

    lines.push('**行动使用率**（两把尺子并排；时间口径守恒，条数口径不守恒）');
    lines.push('');
    lines.push('| 行动 | 占行动条数 | 占呼吸时间 |');
    lines.push('|---|---|---|');
    for (const a of s.actionUsage.slice(0, 16)) {
      lines.push(
        `| ${SHARED_ACTIONS[a.action] ? name(a.action) : `\`${name(a.action)}\``} ` +
          `| ${a.pct.toFixed(2)}% | ${a.timePct.toFixed(2)}% |`,
      );
    }
    lines.push('');

    const catalog = e.r.variant.catalog?.() ?? [];
    if (catalog.length > 0) {
      const keys = [...new Set(catalog.flatMap((c) => Object.keys(c.attrs)))];
      lines.push('**感知行动的数值属性**（语义化命名已剥离）');
      lines.push('');
      lines.push(`| 行动 | 类别 | ${keys.join(' | ')} |`);
      lines.push(`|---|---|${keys.map(() => '---').join('|')}|`);
      for (const c of catalog) {
        lines.push(
          `| \`${map[c.id] ?? c.id}\` | ${c.kind === 'mode' ? '起手档位' : '附属拍'} | ` +
            keys.map((k) => c.attrs[k] ?? '—').join(' | ') +
            ' |',
        );
      }
      lines.push('');
    }

    if (s.mistakeMix.length > 0) {
      lines.push('**可指认误判台账**（每 100 次死亡出现的次数；可归因性由它推导）');
      lines.push('');
      lines.push('| 误判类型 | 次/百死 |');
      lines.push('|---|---|');
      for (const m of s.mistakeMix) lines.push(`| \`${m.kind}\` | ${m.per100Deaths.toFixed(1)} |`);
      lines.push('');
    }

    if (s.eventMix.length > 0) {
      lines.push('**行为事件**（每局平均次数）');
      lines.push('');
      lines.push('| 事件 | 次/局 |');
      lines.push('|---|---|');
      for (const v of s.eventMix) lines.push(`| \`${v.key}\` | ${v.perTrial.toFixed(2)} |`);
      lines.push('');
    }
  }

  // ---- 判读提示 ----
  lines.push('## 四、判读要点');
  lines.push('');
  lines.push('0. **先看口径再看数字。** 凡是占比，本报告都标了它是按呼吸时间算的还是按行动条数算的。两种形态的一次感知在台账里的条数不同（发声一条 + 僵直若干拍 vs 只有一条），所以条数口径的占比在变体之间**不守恒**，只能用来看一个方案内部的相对结构，不能跨方案比较。上一轮的判定书就是被这一点误导的：按条数算出的"移动只占 6.46%"，按时间算是 24.2%。跨方案比较一律用时间口径。');
  lines.push('1. 请用**起手档位内部**的占比判断统治性，不要用全局占比 —— 移动永远是最高频动作，会淹没一切；也不要把起手之后的附属拍算进来，那会让"一次感知拆成八拍"的方案凭空显得更健康。');
  lines.push('2. **感知行动占比过低**（<8%）意味着被测机制在实战中可有可无，这比设计得不好更糟。');
  lines.push('3. **废档位**很严重：它们占据 UI、增加学习成本，却从不被使用。');
  lines.push('4. 存活率本身不是优劣标准，但存活率在不同技巧档位之间**没有差别**是致命的（见技巧表达度与三分位存活率）。');
  lines.push('5. 死因单一化说明只有一条失败路径，游戏的威胁维度不足。特别注意：如果"听者"占比远低于"窒息"，说明招牌威胁正在被玩家单方面取消。');
  lines.push('6. "张力曲线"分数低通常意味着一路高压或一路平淡，两者都不是好的恐怖节奏。');
  lines.push('7. **误判台账**是可归因性的原始证据。请检查它归因的是"一次可复盘的战术失误"，还是"机制诱导玩家浪费"——后者是自我否定的设计，不该计分。');
  lines.push('8. **行为事件**回答"那件工具到底有没有被用起来"。一件设计精巧但每局触发 0.01 次的工具等于不存在。');
  lines.push('9. 加权总分只是参考。如果你认为某个单项缺陷足以否决一套方案，请直接说明，不要迁就总分。');
  lines.push('');
  lines.push(`_生成于 ${new Date().toISOString()}_`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 消融测量
// ---------------------------------------------------------------------------

/**
 * 把实验台的每项改造单独关掉，量出它在指标上的位移。
 *
 * 判定书附录说"不修完这五条，下一轮盲测依然无效"。既然如此，
 * 就得有一个能证明"修了以后确实动了"的数字，而不是又一次自述。
 * 这个子命令不写报告文件 —— 它是给设计组看的工程输出，不进盲测流程。
 */
function ablate(slotId: string, variantId: string, trials: number): void {
  const slot = requireSlot(slotId);
  const variant = variantId
    ? slot.variants.find((v) => v.id === variantId)
    : slot.variants[0];
  if (!variant) {
    console.error(`slot "${slotId}" 里没有变体 "${variantId}"。已有：${slot.variants.map((v) => v.id).join(', ')}`);
    process.exit(1);
  }

  const flags = Object.keys(BENCH) as (keyof typeof BENCH)[];
  const rows: { label: string; r: VariantResult }[] = [];

  resetBench();
  console.log(`\n══ 消融测量 · ${slot.slot} / ${variant.id} · 每档 ${trials} 次试验 ══\n`);
  const base = evaluate(variant, trials);
  rows.push({ label: '全部改造开启', r: base });

  for (const f of flags) {
    resetBench();
    BENCH[f] = false;
    rows.push({ label: `关闭 ${f}`, r: evaluate(variant, trials) });
  }
  resetBench();

  const cols: { head: string; get(r: VariantResult): string }[] = [
    { head: '技巧', get: (r) => r.metrics.skillExpression.toFixed(3) },
    { head: '归因', get: (r) => r.metrics.attributability.toFixed(3) },
    { head: '决策熵', get: (r) => r.metrics.decisionEntropy.toFixed(3) },
    { head: '张力', get: (r) => r.metrics.tensionShape.toFixed(3) },
    { head: '意外', get: (r) => r.metrics.surprise.toFixed(3) },
    { head: '可学', get: (r) => r.metrics.learnability.toFixed(3) },
    { head: '密度', get: (r) => r.metrics.decisionDensity.toFixed(3) },
    { head: '翻盘', get: (r) => r.metrics.comeback.toFixed(3) },
    { head: '总分', get: (r) => r.score.toFixed(4) },
    { head: '总分-意外', get: (r) => r.scoreNoSurprise.toFixed(4) },
    { head: '听者%', get: (r) => ((r.summary.causeShare.listener ?? 0) * 100).toFixed(1) },
    { head: '窒息%', get: (r) => ((r.summary.causeShare.asphyxiation ?? 0) * 100).toFixed(1) },
    { head: '感知时间%', get: (r) => r.summary.senseTimeRate.toFixed(1) },
    { head: '统治%', get: (r) => r.summary.topSenseShare.toFixed(1) },
    { head: '存活%', get: (r) => (r.summary.survivalRate * 100).toFixed(1) },
  ];

  console.log(`| 配置 | ${cols.map((c) => c.head).join(' | ')} |`);
  console.log(`|---|${cols.map(() => '---').join('|')}|`);
  for (const row of rows) {
    console.log(`| ${row.label} | ${cols.map((c) => c.get(row.r)).join(' | ')} |`);
  }
  console.log('\n（"关闭 X" 一行与首行的差 = 改造 X 的实测位移。符号相反即为改造带来的收益。）');
}

/**
 * 诊断输出。
 *
 * 指标是 0..1 的合成数，调参时看不出"到底是哪一段不对"。
 * 这个子命令把指标背后的原始量（张力反转次数 vs 理想次数、方差、
 * 决策密度的分子分母、各技巧档位的时长与死因）摊开来给设计组看。
 * 它不写文件，也不进盲测流程。
 */
function diagnose(slotId: string, variantId: string, trials: number): void {
  const slot = requireSlot(slotId);
  const variants = variantId ? slot.variants.filter((v) => v.id === variantId) : slot.variants;
  resetBench();

  for (const variant of variants) {
    const r = evaluate(variant, trials);
    const t = r.traces;
    const avg = (f: (x: TrialTrace) => number): number => t.reduce((s, x) => s + f(x), 0) / t.length;

    let flipSum = 0;
    let idealSum = 0;
    let varSum = 0;
    let lenSum = 0;
    let counted = 0;
    for (const tr of t) {
      if (tr.tension.length < 8) continue;
      let flips = 0;
      let prevSign = 0;
      const mean = tr.tension.reduce((a, b) => a + b, 0) / tr.tension.length;
      let variance = 0;
      for (let i = 1; i < tr.tension.length; i++) {
        const d = tr.tension[i] - tr.tension[i - 1];
        const sign = d > 0.012 ? 1 : d < -0.012 ? -1 : 0;
        if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips++;
        if (sign !== 0) prevSign = sign;
        variance += (tr.tension[i] - mean) ** 2;
      }
      variance /= tr.tension.length;
      flipSum += flips;
      idealSum += tr.tension.length / 12;
      varSum += variance;
      lenSum += tr.tension.length;
      counted++;
    }

    const third = Math.floor(t.length / 3);
    const tierDur = [0, 1, 2].map((k) => {
      const s = t.slice(k * third, k === 2 ? t.length : (k + 1) * third);
      return s.reduce((a, x) => a + x.duration, 0) / Math.max(1, s.length);
    });

    console.log(`\n══ 诊断 · ${variant.id} · ${trials} 次 ══`);
    console.log(`存活 ${(r.summary.survivalRate * 100).toFixed(1)}%  平均 ${r.summary.avgDuration.toFixed(0)} 呼吸`);
    console.log(`三分位时长 ${tierDur.map((d) => d.toFixed(0)).join(' → ')}`);
    console.log(`三分位存活 ${r.summary.survivalByTier.map((v) => (v * 100).toFixed(1) + '%').join(' → ')}`);
    console.log(
      `死因 ` +
        Object.entries(r.summary.causeShare)
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => `${c} ${(v * 100).toFixed(1)}%`)
          .join('  '),
    );
    console.log(
      `张力：样本 ${(lenSum / counted).toFixed(0)}  实际反转 ${(flipSum / counted).toFixed(1)}  ` +
        `理想 ${(idealSum / counted).toFixed(1)}  方差 ${(varSum / counted).toFixed(4)}（满分线 0.045）` +
        `  得分 ${r.metrics.tensionShape.toFixed(3)}`,
    );
    console.log(
      `决策密度：有意义决策 ${avg((x) => x.decisions.filter((d) => d.options > 2).length).toFixed(1)} 个 / ` +
        `${avg((x) => x.duration).toFixed(0)} 呼吸 = ` +
        `${(
          (avg((x) => x.decisions.filter((d) => d.options > 2).length) / avg((x) => x.duration)) *
          100
        ).toFixed(1)} 个/百呼吸（舒适带 12–38）  得分 ${r.metrics.decisionDensity.toFixed(3)}`,
    );
    const behind = t.filter((x) => x.wasBehind);
    console.log(
      `翻盘：曾陷劣势 ${((behind.length / t.length) * 100).toFixed(1)}%  其中翻盘 ` +
        `${((behind.filter((x) => x.recovered).length / Math.max(1, behind.length)) * 100).toFixed(1)}%` +
        `（理想带 15–40%）  得分 ${r.metrics.comeback.toFixed(3)}`,
    );
    console.log(`意外率 ${(avg((x) => (x.surprises.length / x.duration) * 100)).toFixed(2)} 次/百呼吸（满分带 2.0–3.0）`);
    console.log(
      `行动占比 ` +
        r.summary.actionUsage
          .slice(0, 12)
          .map((a) => `${a.action} ${a.pct.toFixed(1)}%`)
          .join('  '),
    );
  }
  resetBench();
}

/** 揭晓。只有评审已经写下结论之后才该调用。 */
function reveal(slotId: string): void {
  if (!slotId) {
    console.error('用法：npx tsx tools/blind-ab.ts --reveal <slot>');
    process.exit(1);
  }
  const path = join(OUT_DIR, `${slotId}-key.b64`);
  const raw = readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('');
  const key = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  console.log(`\n══ 揭晓 · ${key.slot} ══`);
  console.log(`问题：${key.question}`);
  console.log(`试验次数：${key.trials}\n`);
  for (const m of key.mapping) {
    console.log(`  方案${m.label}  =  ${m.variantName}  (${m.variantId})   加权总分 ${m.weightedScore}`);
    console.log(`            论点：${m.thesis}`);
    if (m.actionMap) {
      for (const [id, anon] of Object.entries(m.actionMap as Record<string, string>)) {
        console.log(`              ${anon}  =  ${id}`);
      }
    }
    console.log('');
  }
}

function requireSlot(id: string): VariantSlot {
  const s = getSlot(id);
  if (!s) {
    console.error(`未知的 slot "${id}"。已注册：${allSlots().map((s) => s.slot).join(', ') || '（无）'}`);
    process.exit(1);
  }
  return s;
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

main();
