/**
 * 内容静态校验器。
 *
 *   npx tsx tools/validate-content.ts          # 全量校验 + 统计
 *   npx tsx tools/validate-content.ts --stats  # 只看统计
 *   npx tsx tools/validate-content.ts --flags  # 打印旗标读写表
 *
 * 检查项（对应 GDD §9 与交付要求）：
 *   E01 重复节点 / 选项 id
 *   E02 悬空引用：goto / next / 条件里的 knowledge / item / 效果里的外部 ID
 *   E03 不可达节点（从 entry + lie 落点做图遍历）
 *   E04 死胡同（没有任何出口且没有结局效果的节点）
 *   E05 flag 命名违规（met. / know. / did. / count. / ritual. / sys.）
 *   E06 读了但从未被写入的 flag（必 bug）
 *   E07 写入了但从未被读取的 flag（死代码）
 *   E08 结局可达性：每个结局必须给出一条可执行路径 + 条件在该路径末端成立
 *   E09 日志倾倒：> 120 字的独白必须可被打断；硬上限 220 字
 *   E10 lie 门控缺少落点（既没有 lie.<id> 也没有 lie-generic 兜底）
 *   E11 知识树结构：依赖悬空 / 成环 / 层级倒挂 / 无人授予
 *
 * 退出码：有 error → 1，否则 0。warning 不影响退出码但会打印。
 */

import type {
  Condition,
  Effect,
  Ending,
  ID,
  NarrativeChoice,
  NarrativeNode,
  StigmaKind,
} from '../src/core/contract';
import { writeFileSync } from 'node:fs';
import { KnowledgeTree } from '../src/narrative/knowledge';
import { ENDINGS, KNOWLEDGE, STORY } from '../src/content/story/index';
import {
  DOOR_IDS,
  ENCOUNTER_IDS,
  ENTITY_IDS,
  EXTERNAL_FLAG_IDS,
  ITEM_IDS,
  META_IDS,
  SFX_IDS,
  STATUS_IDS,
} from '../src/content/story/refs';

// ---------------------------------------------------------------------------
// 诊断收集
// ---------------------------------------------------------------------------

type Level = 'error' | 'warn';
interface Diag {
  level: Level;
  code: string;
  where: string;
  msg: string;
}

const diags: Diag[] = [];
const err = (code: string, where: string, msg: string) =>
  diags.push({ level: 'error', code, where, msg });
const warn = (code: string, where: string, msg: string) =>
  diags.push({ level: 'warn', code, where, msg });

const nodes = new Map<ID, NarrativeNode>();
const KNOWN_KNOWLEDGE = new Set(KNOWLEDGE.map((k) => k.id));
const ENDING_IDS = new Set(ENDINGS.map((e) => e.id));
const FLAG_PREFIXES = ['met.', 'know.', 'did.', 'count.', 'ritual.', 'sys.'];

const flagReads = new Map<string, Set<string>>();
const flagWrites = new Map<string, Set<string>>();
const noteFlag = (map: Map<string, Set<string>>, key: string, where: string) => {
  const s = map.get(key) ?? new Set<string>();
  s.add(where);
  map.set(key, s);
};

// ---------------------------------------------------------------------------
// E01 id 唯一性
// ---------------------------------------------------------------------------

const choiceOwners = new Map<ID, string>();
for (const n of STORY.nodes) {
  if (nodes.has(n.id)) err('E01', n.id, '重复的节点 id');
  nodes.set(n.id, n);
  const seen = new Set<ID>();
  for (const ch of n.choices) {
    if (seen.has(ch.id)) err('E01', `${n.id}/${ch.id}`, '同一节点内重复的选项 id');
    seen.add(ch.id);
    const prev = choiceOwners.get(ch.id);
    if (prev && prev !== n.id) err('E01', `${n.id}/${ch.id}`, `选项 id 与 ${prev} 的选项重复`);
    choiceOwners.set(ch.id, n.id);
  }
}

// ---------------------------------------------------------------------------
// 条件 / 效果遍历
// ---------------------------------------------------------------------------

function walkCondition(cond: Condition | undefined, where: string): void {
  if (!cond) return;
  switch (cond.op) {
    case 'flag':
      checkFlagName(cond.key, where);
      noteFlag(flagReads, cond.key, where);
      return;
    case 'has-knowledge':
      if (!KNOWN_KNOWLEDGE.has(cond.node)) err('E02', where, `条件引用了不存在的知识节点 ${cond.node}`);
      return;
    case 'has-item':
      if (!ITEM_IDS.has(cond.item)) err('E02', where, `条件引用了未登记的道具 ${cond.item}`);
      return;
    case 'all':
    case 'any':
      for (const c of cond.of) walkCondition(c, where);
      return;
    case 'not':
      walkCondition(cond.of, where);
      return;
    default:
      return; // vital / stigma / in-room / depth / always —— 没有外部 id
  }
}

function walkEffect(e: Effect, where: string): void {
  switch (e.op) {
    case 'flag':
      checkFlagName(e.key, where);
      noteFlag(flagWrites, e.key, where);
      return;
    case 'flag-add':
      checkFlagName(e.key, where);
      noteFlag(flagWrites, e.key, where);
      return;
    case 'knowledge':
      if (!KNOWN_KNOWLEDGE.has(e.node)) err('E02', where, `效果授予了不存在的知识节点 ${e.node}`);
      return;
    case 'item':
      if (!ITEM_IDS.has(e.item)) err('E02', where, `效果引用了未登记的道具 ${e.item}`);
      return;
    case 'status':
      if (!STATUS_IDS.has(e.effect)) err('E02', where, `效果引用了未登记的状态 ${e.effect}`);
      return;
    case 'remove-status':
      if (!STATUS_IDS.has(e.effect)) err('E02', where, `效果引用了未登记的状态 ${e.effect}`);
      return;
    case 'unlock-door':
      if (!DOOR_IDS.has(e.door)) err('E02', where, `效果引用了未登记的门 ${e.door}`);
      return;
    case 'spawn':
      if (!ENTITY_IDS.has(e.entity)) err('E02', where, `效果引用了未登记的实体 ${e.entity}`);
      return;
    case 'encounter':
      if (!ENCOUNTER_IDS.has(e.encounter)) err('E02', where, `效果引用了未登记的遭遇 ${e.encounter}`);
      return;
    case 'sfx':
      if (!SFX_IDS.has(e.cue)) err('E02', where, `效果引用了未登记的音效 cue ${e.cue}`);
      return;
    case 'goto':
      if (!nodes.has(e.node)) err('E02', where, `goto 效果指向不存在的节点 ${e.node}`);
      return;
    case 'ending':
      if (!ENDING_IDS.has(e.ending)) err('E02', where, `结局效果指向不存在的结局 ${e.ending}`);
      return;
    default:
      return; // vital / stigma / noise / reweave / camera
  }
}

function checkFlagName(key: string, where: string): void {
  if (!FLAG_PREFIXES.some((p) => key.startsWith(p))) {
    err('E05', where, `旗标 ${key} 不符合命名约定（met./know./did./count./ritual./sys.）`);
    return;
  }
  if (!/^[a-z]+\.[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(key)) {
    err('E05', where, `旗标 ${key} 含非法字符（只允许小写字母、数字、连字符、点）`);
  }
}

for (const n of nodes.values()) {
  const at = n.id;
  for (const e of n.onEnter ?? []) walkEffect(e, `${at}:onEnter`);
  if (n.next && !nodes.has(n.next)) err('E02', at, `next 指向不存在的节点 ${n.next}`);
  for (const ch of n.choices) {
    const cw = `${at}/${ch.id}`;
    walkCondition(ch.requires, cw);
    for (const e of ch.effects ?? []) walkEffect(e, cw);
    if (ch.goto && !nodes.has(ch.goto)) err('E02', cw, `goto 指向不存在的节点 ${ch.goto}`);
  }
}

for (const e of ENDINGS) {
  walkCondition(e.requires, `ending:${e.id}`);
  for (const u of e.unlocks ?? []) {
    if (!META_IDS.has(u)) err('E02', `ending:${e.id}`, `unlocks 引用了未登记的元进度 ${u}`);
  }
}

// ---------------------------------------------------------------------------
// E10 lie 门控落点
// ---------------------------------------------------------------------------

const hasGeneric = [...nodes.values()].some((n) => n.tags?.includes('lie-generic'));
for (const n of nodes.values()) {
  for (const ch of n.choices) {
    if (ch.gateMode !== 'lie') continue;
    if (!ch.requires) {
      err('E10', `${n.id}/${ch.id}`, 'lie 门控的选项没有 requires —— 永远不会被揭穿');
      continue;
    }
    const specific = nodes.has(`lie.${n.id}::${ch.id}`) || nodes.has(`lie.${ch.id}`);
    if (!specific && !hasGeneric) err('E10', `${n.id}/${ch.id}`, 'lie 门控没有落点节点');
    if (!specific) warn('E10', `${n.id}/${ch.id}`, 'lie 门控只有通用兜底，建议写专属揭穿节点');
  }
}

// ---------------------------------------------------------------------------
// E09 日志倾倒
// ---------------------------------------------------------------------------

const textLen = (s: string) => s.replace(/\s|［|］/g, '').length;
for (const n of nodes.values()) {
  const variants = [n.text, ...(n.corruptedText ?? []).map((v) => v.text)];
  for (const t of variants) {
    const len = textLen(t);
    if (len > 220) err('E09', n.id, `独白 ${len} 字，超过硬上限 220`);
    else if (len > 120 && n.choices.length === 0)
      err('E09', n.id, `独白 ${len} 字且不可被打断（无选项）`);
  }
}

// ---------------------------------------------------------------------------
// 状态模拟器（用于可达性与结局证明）
// ---------------------------------------------------------------------------

interface SimState {
  flags: Map<string, string | number | boolean>;
  knowledge: Set<ID>;
  items: Map<ID, number>;
  stigma: Record<StigmaKind, number>;
}

const freshState = (): SimState => ({
  flags: new Map(),
  knowledge: new Set(),
  items: new Map(),
  stigma: { silence: 0, listening: 0, drowned: 0, iron: 0, flesh: 0, apostasy: 0 },
});

function cmp(a: unknown, op: string, b: unknown): boolean {
  const na = typeof a === 'number' ? a : a === true ? 1 : 0;
  const nb = typeof b === 'number' ? b : b === true ? 1 : 0;
  switch (op) {
    case '==':
      return typeof a === typeof b ? a === b : na === nb;
    case '!=':
      return typeof a === typeof b ? a !== b : na !== nb;
    case '>':
      return na > nb;
    case '<':
      return na < nb;
    case '>=':
      return na >= nb;
    case '<=':
      return na <= nb;
    default:
      return false;
  }
}

/**
 * 乐观求值。边界划在"谁拥有这个状态"上：
 *  - 环境（vital / in-room / depth）：sim 与 world 层的账，静态校验不模拟，视为可满足。
 *  - 道具：摆放权在 world/items 层。剧情只负责引用一个已登记的道具 id（E02 查这个），
 *    "这条船上到底能不能捡到手术刀"不是剧情文件能回答的问题，故视为可满足。
 *  - 外部旗标（refs.ts 的 EXTERNAL_FLAGS，如 count.truth-layer / count.cycles-witnessed）：
 *    由引擎或 game 层跨轮回维护，单轮巡游里永远是 0，故视为可满足。
 * 剧情自己写的旗标、知识、烙印一律老实判 —— 那才是本校验器该管的部分。
 */
function holds(cond: Condition | undefined, s: SimState): boolean {
  if (!cond) return true;
  switch (cond.op) {
    case 'always':
      return true;
    case 'flag':
      if (EXTERNAL_FLAG_IDS.has(cond.key)) return true;
      return cmp(s.flags.get(cond.key) ?? (typeof cond.value === 'number' ? 0 : false), cond.cmp, cond.value);
    case 'has-knowledge':
      return s.knowledge.has(cond.node);
    case 'has-item':
      return ITEM_IDS.has(cond.item) || (s.items.get(cond.item) ?? 0) >= (cond.count ?? 1);
    case 'stigma':
      return cmp(s.stigma[cond.stigma] ?? 0, cond.cmp, cond.value);
    case 'all':
      return cond.of.every((c) => holds(c, s));
    case 'any':
      return cond.of.some((c) => holds(c, s));
    case 'not':
      return !holds(cond.of, s);
    case 'vital':
    case 'in-room':
    case 'depth':
      return true;
    default:
      return true;
  }
}

function apply(effects: readonly Effect[] | undefined, s: SimState): void {
  for (const e of effects ?? []) {
    switch (e.op) {
      case 'flag':
        s.flags.set(e.key, e.value);
        break;
      case 'flag-add': {
        const cur = s.flags.get(e.key);
        s.flags.set(e.key, (typeof cur === 'number' ? cur : 0) + e.delta);
        break;
      }
      case 'knowledge':
        s.knowledge.add(e.node);
        break;
      case 'item':
        s.items.set(e.item, Math.max(0, (s.items.get(e.item) ?? 0) + e.count));
        break;
      case 'stigma':
        s.stigma[e.stigma] = Math.max(0, (s.stigma[e.stigma] ?? 0) + e.delta);
        break;
      default:
        break;
    }
  }
}

const roots: ID[] = [
  ...STORY.entries,
  ...[...nodes.values()].filter((n) => n.tags?.includes('lie') || n.tags?.includes('lie-generic')).map((n) => n.id),
];

function endingOf(ch: NarrativeChoice): ID | null {
  for (const e of ch.effects ?? []) if (e.op === 'ending') return e.ending;
  return null;
}
function nodeEnding(n: NarrativeNode): ID | null {
  for (const e of n.onEnter ?? []) if (e.op === 'ending') return e.ending;
  for (const ch of n.choices) {
    const id = endingOf(ch);
    if (id) return id;
  }
  return null;
}

/**
 * 结局条件里的"负约束"：哪些旗标必须保持不动。
 *
 * 单调巡游把能点的都点了，所以 `ritual.count == 0`（"什么仪式都没做"）这类
 * 结局永远证不出来。把这些键抽出来，巡游时绕开写它们的边，等于替玩家做出
 * "这一轮我不碰仪式"的选择 —— 这正是 end.surface 的玩法。
 */
interface Constraints {
  /** 这些旗标必须保持不动 */
  keepOut: Set<string>;
  /** 这些烙印有上限，巡游期间一律不许加 */
  capped: Set<StigmaKind>;
}

const freshConstraints = (): Constraints => ({ keepOut: new Set(), capped: new Set() });

function negativeStigma(cond: Condition | undefined, out: Set<StigmaKind>, negated = false): void {
  if (!cond) return;
  switch (cond.op) {
    case 'stigma': {
      const capped =
        cond.cmp === '<' ||
        cond.cmp === '<=' ||
        (cond.cmp === '==' && cond.value === 0) ||
        (cond.cmp === '!=' && cond.value > 0);
      if (capped !== negated) out.add(cond.stigma);
      break;
    }
    case 'not':
      negativeStigma(cond.of, out, !negated);
      break;
    case 'all':
    case 'any':
      for (const c of cond.of) negativeStigma(c, out, negated);
      break;
    default:
      break;
  }
}

function negativeKeys(cond: Condition | undefined, out: Set<string>, negated = false): void {
  if (!cond) return;
  switch (cond.op) {
    case 'flag': {
      const zero =
        (cond.cmp === '==' && (cond.value === 0 || cond.value === false)) ||
        cond.cmp === '<' ||
        cond.cmp === '<=' ||
        (cond.cmp === '!=' && (cond.value === true || (typeof cond.value === 'number' && cond.value > 0)));
      if (zero === negated) break;
      out.add(cond.key);
      break;
    }
    case 'not':
      negativeKeys(cond.of, out, !negated);
      break;
    case 'all':
    case 'any':
      for (const c of cond.of) negativeKeys(c, out, negated);
      break;
    default:
      break;
  }
}

/**
 * 单调巡游：反复展开所有"当前状态下可行"的边，直到没有新东西。
 * 因为所有枢纽节点都是 entry（世界层随时可以 start），这条巡游序列是可执行的。
 * `avoidEnding` 用于结局证明：排除会落定**别的**结局的边和别的终局节点。
 * `keepOut` 里的旗标在这条巡游里不许被写 —— 见 negativeKeys。
 */
function violates(effects: readonly Effect[] | undefined, cons: Constraints): boolean {
  if (!cons.keepOut.size && !cons.capped.size) return false;
  for (const e of effects ?? []) {
    if ((e.op === 'flag' || e.op === 'flag-add') && cons.keepOut.has(e.key)) return true;
    if (e.op === 'stigma' && e.delta > 0 && cons.capped.has(e.stigma)) return true;
  }
  return false;
}

function tour(
  avoidEnding: ID | null,
  cons: Constraints = freshConstraints(),
): { visited: Set<ID>; state: SimState; edges: number } {
  const s = freshState();
  const visited = new Set<ID>();
  let edges = 0;
  let changed = true;
  const taken = new Set<string>();
  while (changed) {
    changed = false;
    const frontier: ID[] = [];
    for (const r of roots) if (nodes.has(r)) frontier.push(r);
    const seenThisPass = new Set<ID>();
    while (frontier.length) {
      const id = frontier.pop() as ID;
      if (seenThisPass.has(id)) continue;
      seenThisPass.add(id);
      const n = nodes.get(id);
      if (!n) continue;
      if (avoidEnding !== null) {
        const ne = nodeEnding(n);
        if (ne && ne !== avoidEnding) continue;
      }
      if (violates(n.onEnter, cons)) continue;
      if (!visited.has(id)) {
        visited.add(id);
        changed = true;
      }
      apply(n.onEnter, s);
      if (n.next) frontier.push(n.next);
      for (const ch of n.choices) {
        if (!holds(ch.requires, s) && ch.gateMode !== 'lie') continue;
        if (violates(ch.effects, cons)) continue;
        const che = endingOf(ch);
        if (avoidEnding !== null && che && che !== avoidEnding) continue;
        const key = `${id}::${ch.id}`;
        if (!taken.has(key)) {
          taken.add(key);
          edges++;
          changed = true;
        }
        if (holds(ch.requires, s)) apply(ch.effects, s);
        if (ch.goto) frontier.push(ch.goto);
      }
    }
  }
  return { visited, state: s, edges };
}

const full = tour(null);

// ---------------------------------------------------------------------------
// E03 不可达 / E04 死胡同
// ---------------------------------------------------------------------------

// 纯图可达性（不看条件）—— 用来区分"条件永不成立"和"根本没人指向它"
const graphReach = new Set<ID>();
{
  const stack = [...roots];
  while (stack.length) {
    const id = stack.pop() as ID;
    if (graphReach.has(id)) continue;
    graphReach.add(id);
    const n = nodes.get(id);
    if (!n) continue;
    if (n.next) stack.push(n.next);
    for (const ch of n.choices) {
      if (ch.goto) stack.push(ch.goto);
      for (const e of ch.effects ?? []) if (e.op === 'goto') stack.push(e.node);
    }
    for (const e of n.onEnter ?? []) if (e.op === 'goto') stack.push(e.node);
  }
}

for (const n of nodes.values()) {
  if (!graphReach.has(n.id)) err('E03', n.id, '不可达：没有任何 entry/lie 落点能走到这里');
  else if (!full.visited.has(n.id)) warn('E03', n.id, '图上可达但条件下不可达（门控可能永不成立）');
}

for (const n of nodes.values()) {
  const isTerminal = n.tags?.includes('terminal') || nodeEnding(n) !== null;
  if (isTerminal) continue;
  const hasExit =
    n.choices.length > 0 ||
    !!n.next ||
    (n.onEnter ?? []).some((e) => e.op === 'goto');
  if (!hasExit) err('E04', n.id, '死胡同：没有选项、没有 next、也不是结局节点');
}

// ---------------------------------------------------------------------------
// E06 / E07 旗标读写
// ---------------------------------------------------------------------------

const allFlags = new Set([...flagReads.keys(), ...flagWrites.keys()]);
for (const f of [...allFlags].sort()) {
  const read = flagReads.has(f);
  const written = flagWrites.has(f);
  if (read && !written && !EXTERNAL_FLAG_IDS.has(f) && !f.startsWith('sys.')) {
    const sample = [...(flagReads.get(f) ?? [])].slice(0, 3).join(', ');
    err('E06', f, `读了但从未被写入（读取处：${sample}）`);
  }
  if (written && !read && !EXTERNAL_FLAG_IDS.has(f)) {
    const sample = [...(flagWrites.get(f) ?? [])].slice(0, 3).join(', ');
    err('E07', f, `写入了但从未被读取（写入处：${sample}）`);
  }
}

// ---------------------------------------------------------------------------
// E11 知识树
// ---------------------------------------------------------------------------

for (const msg of new KnowledgeTree(KNOWLEDGE).validate()) err('E11', 'knowledge', msg);

const granted = new Set<ID>();
for (const n of nodes.values()) {
  for (const e of n.onEnter ?? []) if (e.op === 'knowledge') granted.add(e.node);
  for (const ch of n.choices) for (const e of ch.effects ?? []) if (e.op === 'knowledge') granted.add(e.node);
}
for (const k of KNOWLEDGE) {
  if (!granted.has(k.id)) err('E11', k.id, '知识节点没有任何内容授予它');
  if (!full.state.knowledge.has(k.id)) warn('E11', k.id, '巡游中未能取得（授予它的选项条件可能永不成立）');
}

// ---------------------------------------------------------------------------
// E08 结局可达性
// ---------------------------------------------------------------------------

interface Proof {
  ending: Ending;
  ok: boolean;
  path: ID[];
  note: string;
}

function shortestPath(
  target: ID,
  feasible: SimState,
  avoid: ID | null,
  cons: Constraints = freshConstraints(),
): ID[] | null {
  const prev = new Map<ID, ID | null>();
  const q: ID[] = [];
  for (const r of roots) {
    if (!nodes.has(r) || prev.has(r)) continue;
    prev.set(r, null);
    q.push(r);
  }
  while (q.length) {
    const id = q.shift() as ID;
    if (id === target) {
      const path: ID[] = [];
      let cur: ID | null = id;
      while (cur) {
        path.unshift(cur);
        cur = prev.get(cur) ?? null;
      }
      return path;
    }
    const n = nodes.get(id);
    if (!n) continue;
    const push = (to: ID) => {
      if (!nodes.has(to) || prev.has(to)) return;
      const tn = nodes.get(to) as NarrativeNode;
      if (violates(tn.onEnter, cons)) return;
      if (avoid !== null) {
        const ne = nodeEnding(tn);
        if (ne && ne !== avoid) return;
      }
      prev.set(to, id);
      q.push(to);
    };
    if (n.next) push(n.next);
    for (const ch of n.choices) {
      if (!holds(ch.requires, feasible)) continue;
      if (violates(ch.effects, cons)) continue;
      const che = endingOf(ch);
      if (avoid !== null && che && che !== avoid) continue;
      if (ch.goto) push(ch.goto);
    }
  }
  return null;
}

const proofs: Proof[] = [];
/**
 * 结局证明的约束收敛：
 *
 * 结局条件本身给出第一批负约束（"什么仪式都没做"）。但通往落幕节点的那条边
 * 往往还有自己的负约束（逃生舱的"上浮"选项要求你没砸过圣物），而单调巡游
 * 默认什么都做过。所以从落幕节点往回退，逐层把沿途边的负约束也收进来，
 * 重新巡游 —— 相当于替玩家做出"这一轮我不碰那些东西"的决定。
 */
function collectConstraints(e: Ending, closers: readonly NarrativeNode[], depth: number): Constraints {
  const cons = freshConstraints();
  negativeKeys(e.requires, cons.keepOut);
  negativeStigma(e.requires, cons.capped);
  let layer = new Set<ID>(closers.map((n) => n.id));
  for (let d = 0; d < depth; d++) {
    const nextLayer = new Set<ID>();
    for (const n of nodes.values()) {
      for (const ch of n.choices) {
        if (!ch.goto || !layer.has(ch.goto)) continue;
        negativeKeys(ch.requires, cons.keepOut);
        negativeStigma(ch.requires, cons.capped);
        nextLayer.add(n.id);
      }
      if (n.next && layer.has(n.next)) nextLayer.add(n.id);
    }
    layer = nextLayer;
    if (!layer.size) break;
  }
  return cons;
}

for (const e of ENDINGS) {
  const closers = [...nodes.values()].filter((n) => nodeEnding(n) === e.id);
  if (!closers.length) {
    err('E08', e.id, '没有任何节点用 ending 效果落定这个结局');
    proofs.push({ ending: e, ok: false, path: [], note: '无落幕节点' });
    continue;
  }
  let cons = freshConstraints();
  let t = tour(e.id, cons);
  let best: ID[] | null = null;
  for (let depth = 0; depth <= 3; depth++) {
    cons = collectConstraints(e, closers, depth);
    t = tour(e.id, cons);
    best = null;
    for (const c of closers) {
      const p = shortestPath(c.id, t.state, e.id, cons);
      if (p && (!best || p.length < best.length)) best = p;
    }
    if (best) break;
  }
  if (!best) {
    const why = cons.keepOut.size || cons.capped.size
      ? `（回避写入：${[...cons.keepOut].join('、')}${cons.capped.size ? ` / 封顶烙印：${[...cons.capped].join('、')}` : ''}）`
      : '';
    err('E08', e.id, `落幕节点 ${closers.map((c) => c.id).join('/')} 在条件下不可达${why}`);
    proofs.push({ ending: e, ok: false, path: [], note: `落幕节点不可达${why}` });
    continue;
  }
  // 沿路径重放：巡游状态 + 路径效果，然后验条件
  const s = t.state;
  for (let i = 0; i < best.length; i++) {
    const n = nodes.get(best[i]) as NarrativeNode;
    apply(n.onEnter, s);
    const nx = best[i + 1];
    if (!nx) continue;
    const ch = n.choices.find((c) => c.goto === nx && holds(c.requires, s));
    if (ch) apply(ch.effects, s);
  }
  const closer = nodes.get(best[best.length - 1]) as NarrativeNode;
  const fin = closer.choices.find((c) => endingOf(c) === e.id);
  if (fin) apply(fin.effects, s);
  const ok = holds(e.requires, s);
  if (!ok) err('E08', e.id, '落幕节点可达，但结局条件在该状态下不成立');
  proofs.push({
    ending: e,
    ok,
    path: best,
    note: ok ? '条件成立' : '条件不成立',
  });
}

// ---------------------------------------------------------------------------
// 统计
// ---------------------------------------------------------------------------

let choiceCount = 0;
let conditionalChoices = 0;
let gateHide = 0;
let gateDisable = 0;
let gateLie = 0;
let corruptedVariants = 0;
let nodesWithCorrupted = 0;
let keyNodes = 0;
let totalChars = 0;
const perFile = new Map<string, number>();

for (const n of nodes.values()) {
  choiceCount += n.choices.length;
  totalChars += textLen(n.text);
  if (n.corruptedText?.length) {
    nodesWithCorrupted++;
    corruptedVariants += n.corruptedText.length;
  }
  if (n.tags?.includes('key')) keyNodes++;
  for (const ch of n.choices) {
    if (ch.requires) {
      conditionalChoices++;
      if ((ch.gateMode ?? 'hide') === 'hide') gateHide++;
      else if (ch.gateMode === 'disable') gateDisable++;
      else gateLie++;
    }
  }
  const pre = n.id.split('.')[0];
  perFile.set(pre, (perFile.get(pre) ?? 0) + 1);
}

const branchFactor = choiceCount / nodes.size;
const pathLens = proofs.filter((p) => p.ok).map((p) => p.path.length);
const kt = new KnowledgeTree(KNOWLEDGE);
const canonTotal = KNOWLEDGE.filter((k) => !k.apocrypha).length;

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

const onlyStats = process.argv.includes('--stats');
const showFlags = process.argv.includes('--flags');

const errors = diags.filter((d) => d.level === 'error');
const warns = diags.filter((d) => d.level === 'warn');

const buffer: string[] = [];
const line = (s = '') => {
  buffer.push(s);
  console.log(s);
};
/** Windows 控制台常把 UTF-8 中文打成乱码，所以同时落一份 UTF-8 报告。 */
const flush = () => writeFileSync('.validate.md', buffer.join('\n') + '\n', 'utf8');
const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n);

line('┌─ IRONLUNG MAZE 内容校验 ────────────────────────────────────');
line(`│ 节点            ${nodes.size}`);
line(`│ 选项            ${choiceCount}`);
line(`│ 带条件的选项    ${conditionalChoices}  (hide ${gateHide} / disable ${gateDisable} / lie ${gateLie})`);
line(`│ 平均分支因子    ${branchFactor.toFixed(2)}`);
line(`│ 关键节点        ${keyNodes}`);
line(`│ 低 SAN 变体      ${corruptedVariants} 条，覆盖 ${nodesWithCorrupted} 个节点（${((nodesWithCorrupted / nodes.size) * 100).toFixed(0)}%）`);
line(`│ 正文字数        ${totalChars}`);
line(`│ 结局            ${ENDINGS.length}`);
line(`│ 知识节点        ${KNOWLEDGE.length}（正典 ${canonTotal} / 非正典 ${KNOWLEDGE.length - canonTotal}）`);
line(`│ 入口节点        ${STORY.entries.length}`);
line(`│ 巡游覆盖        ${full.visited.size}/${nodes.size} 节点，${full.edges} 条边`);
line(`│ 旗标            ${allFlags.size}（读 ${flagReads.size} / 写 ${flagWrites.size}）`);
if (pathLens.length) {
  line(`│ 通关路径长度    最短 ${Math.min(...pathLens)} / 最长 ${Math.max(...pathLens)} 个节点`);
}
line('└─────────────────────────────────────────────────────────────');
line();

line('按前缀分布：');
for (const [k, v] of [...perFile.entries()].sort((a, b) => b[1] - a[1])) {
  line(`  ${pad(k, 12)} ${v}`);
}
line();

line('真相层进度（巡游全开时）：');
for (const l of [1, 2, 3, 4, 5] as const) {
  const p = kt.layerProgress(l);
  const got = KNOWLEDGE.filter((k) => k.layer === l && !k.apocrypha && full.state.knowledge.has(k.id)).length;
  line(`  L${l}  ${got}/${p.total}`);
}
line();

line('结局可达性证明：');
for (const p of proofs) {
  const head = `  ${p.ok ? '✓' : '✗'} ${pad(p.ending.id, 18)} ${pad(p.ending.rank, 12)}`;
  line(`${head} ${p.path.length ? `${p.path.length} 跳` : '—'}  ${p.note}`);
  if (p.path.length) line(`      ${p.path.join(' → ')}`);
}
line();

if (showFlags) {
  line('旗标读写表：');
  for (const f of [...allFlags].sort()) {
    line(`  ${pad(f, 38)} 读 ${String((flagReads.get(f) ?? new Set()).size).padStart(3)}  写 ${String((flagWrites.get(f) ?? new Set()).size).padStart(3)}`);
  }
  line();
}

if (!onlyStats) {
  if (warns.length) {
    line(`警告 ${warns.length} 条：`);
    for (const d of warns) line(`  [${d.code}] ${d.where}: ${d.msg}`);
    line();
  }
  if (errors.length) {
    line(`错误 ${errors.length} 条：`);
    for (const d of errors) line(`  [${d.code}] ${d.where}: ${d.msg}`);
    line();
    line('校验失败。');
    flush();
    process.exit(1);
  }
  line('零错误。');
}
flush();
