/**
 * 盲测执行器。
 *
 * 用法：
 *   npx tsx tools/blind-ab.ts               跑全部 slot
 *   npx tsx tools/blind-ab.ts sonar         只跑指定 slot
 *   npx tsx tools/blind-ab.ts sonar 4000    指定每个变体的试验次数
 *
 * 产出两个文件：
 *   qa/ab/<slot>-report.md   匿名报告，只有"甲/乙"，交给评审
 *   qa/ab/<slot>-key.json    答案，评审读完并给出判断之后才打开
 *
 * 为什么要真的分成两个文件：如果答案和报告在一起，评审即使被要求
 * "不要看名字"，也已经看到了。盲测的物理隔离比口头约定可靠。
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
  type MechanicMetrics,
  type MechanicVariant,
  type TrialTrace,
  type VariantSlot,
} from '../src/game/variants';

// 副作用导入：各 slot 在模块顶层自行注册
import '../src/game/ab/sonar';

const OUT_DIR = join(process.cwd(), 'qa', 'ab');

interface VariantResult {
  variant: MechanicVariant;
  metrics: MechanicMetrics;
  score: number;
  traces: TrialTrace[];
  summary: TrialSummary;
}

interface TrialSummary {
  survivalRate: number;
  avgDuration: number;
  causes: Record<string, number>;
  actionUsage: { action: string; pct: number }[];
  /** 使用率最高的行动占比 —— 统治性解法的直接证据 */
  topActionShare: number;
  /** 使用率低于 0.5% 的废行动数量 */
  deadActions: number;
  /** 感知行动占全部行动的比例。太低说明被测机制在实战中根本不重要 */
  senseRate: number;
  /**
   * 在感知行动**内部**，使用率最高的那一档的占比。
   * 这才是判断被测机制是否存在统治性解法的正确口径 ——
   * 用全局占比会被"走路"淹没，任何机制看起来都很健康。
   */
  topSenseShare: number;
  /** 从不被使用的感知档位数 */
  deadSenseModes: number;
  /** 感知档位的有效多样性（exp(香农熵)，可读成"实际在用几档"） */
  senseDiversity: number;
}

function main(): void {
  const argv = process.argv.slice(2);

  if (argv[0] === '--reveal') {
    reveal(argv[1]);
    return;
  }

  const [slotArg, trialsArg] = argv;
  const trials = trialsArg ? Number(trialsArg) : 3000;
  const slots = slotArg ? [requireSlot(slotArg)] : allSlots();

  if (slots.length === 0) {
    console.error('没有注册任何盲测 slot。');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

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
  return {
    variant,
    metrics,
    score: scoreMetrics(metrics),
    traces,
    summary: summarize(traces),
  };
}

function summarize(traces: readonly TrialTrace[]): TrialSummary {
  const causes: Record<string, number> = {};
  const usage = new Map<string, number>();
  let totalDecisions = 0;
  let survived = 0;
  let durSum = 0;

  for (const t of traces) {
    if (t.survived) survived++;
    else causes[t.cause] = (causes[t.cause] ?? 0) + 1;
    durSum += t.duration;
    for (const d of t.decisions) {
      usage.set(d.chosen, (usage.get(d.chosen) ?? 0) + 1);
      totalDecisions++;
    }
  }

  const actionUsage = [...usage.entries()]
    .map(([action, n]) => ({ action, pct: (n / totalDecisions) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const senseEntries = [...usage.entries()].filter(([a]) => a.startsWith('sonar:'));
  const senseTotal = senseEntries.reduce((s, [, n]) => s + n, 0);
  let senseEntropy = 0;
  for (const [, n] of senseEntries) {
    const p = n / Math.max(1, senseTotal);
    if (p > 0) senseEntropy -= p * Math.log(p);
  }
  const topSense = senseEntries.reduce((m, e) => (e[1] > m[1] ? e : m), ['', 0] as [string, number]);

  return {
    survivalRate: survived / traces.length,
    avgDuration: durSum / traces.length,
    causes,
    actionUsage,
    topActionShare: actionUsage[0]?.pct ?? 0,
    deadActions: actionUsage.filter((a) => a.pct < 0.5).length,
    senseRate: (senseTotal / totalDecisions) * 100,
    topSenseShare: senseTotal > 0 ? (topSense[1] / senseTotal) * 100 : 0,
    deadSenseModes: senseEntries.filter(([, n]) => n / Math.max(1, senseTotal) < 0.02).length,
    senseDiversity: senseTotal > 0 ? Math.exp(senseEntropy) : 0,
  };
}

function renderReport(slot: VariantSlot, entries: { label: string; r: VariantResult }[]): string {
  const L = (s: string) => s.padEnd(14, ' ');
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
  lines.push('');

  // ---- 结果分布 ----
  lines.push('## 二、结果分布');
  lines.push('');
  for (const e of entries) {
    const s = e.r.summary;
    lines.push(`### 方案${e.label}`);
    lines.push('');
    lines.push(`- 存活率 **${(s.survivalRate * 100).toFixed(1)}%**，平均存活 **${s.avgDuration.toFixed(0)}** 呼吸`);
    const total = Object.values(s.causes).reduce((a, b) => a + b, 0) || 1;
    lines.push(
      `- 死因分布：` +
        Object.entries(s.causes)
          .sort((a, b) => b[1] - a[1])
          .map(([c, n]) => `${c} ${((n / total) * 100).toFixed(1)}%`)
          .join(' · '),
    );
    lines.push(`- 感知行动占全部行动 **${s.senseRate.toFixed(1)}%**（低于 8% 说明被测机制在实战中不重要）`);
    lines.push(
      `- **感知档位内部**最高频占比 **${s.topSenseShare.toFixed(1)}%**（超过 55% 视为存在统治性档位）`,
    );
    lines.push(`- 感知档位有效多样性 **${s.senseDiversity.toFixed(2)}** 档（实际被用起来的档数）`);
    lines.push(`- 从不被使用的感知档位：**${s.deadSenseModes}**`);
    lines.push(`- 全局最高频行动占比 ${s.topActionShare.toFixed(1)}%，全局废行动 ${s.deadActions} 个`);
    lines.push('');
    lines.push('| 行动 | 使用率 |');
    lines.push('|---|---|');
    for (const a of e.r.summary.actionUsage.slice(0, 14)) {
      lines.push(`| \`${a.action}\` | ${a.pct.toFixed(2)}% |`);
    }
    lines.push('');
  }

  // ---- 判读提示 ----
  lines.push('## 三、判读要点');
  lines.push('');
  lines.push('1. 请用**感知档位内部**的占比判断统治性，不要用全局占比 —— 移动永远是最高频动作，会淹没一切。');
  lines.push('2. **感知行动占比过低**（<8%）意味着被测机制在实战中可有可无，这比设计得不好更糟。');
  lines.push('3. **废档位**很严重：它们占据 UI、增加学习成本，却从不被使用。');
  lines.push('4. 存活率本身不是优劣标准，但存活率在不同技巧档位之间**没有差别**是致命的（见技巧表达度）。');
  lines.push('5. 死因单一化说明只有一条失败路径，游戏的威胁维度不足。');
  lines.push('6. "张力曲线"分数低通常意味着一路高压或一路平淡，两者都不是好的恐怖节奏。');
  lines.push('7. 加权总分只是参考。如果你认为某个单项缺陷足以否决一套方案，请直接说明，不要迁就总分。');
  lines.push('');
  lines.push(`_生成于 ${new Date().toISOString()}_`);

  return lines.join('\n');
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
    console.log(`            论点：${m.thesis}\n`);
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
