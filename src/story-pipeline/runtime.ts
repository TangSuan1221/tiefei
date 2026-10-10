import { apply, initialState, test, type InputWindow, type Pipeline, type SlotCase, type State, type Tag, type Value, type Write } from './model';
/** 去掉标点和空白后做关键词匹配。 */
const normalize = (s: string) => s.toLowerCase().replace(/[\s，。！？、,.!?;；:：“”"'‘’（）()…—\-]/g, '');

/** 关键词按顺序出现在原句中，中间最多插入两个字（“你到底是谁”命中“你是谁”）。 */
function looseMatch(said: string, k: string): boolean {
  for (let start = said.indexOf(k[0]); start >= 0; start = said.indexOf(k[0], start + 1)) {
    let at = start, ok = true;
    for (let i = 1; i < k.length && ok; i++) { at = said.indexOf(k[i], at + 1); ok = at >= 0; }
    if (ok && at - start + 1 - k.length <= 2) return true;
  }
  return false;
}

export interface Classification { tag: Tag | null; score: number }

/** 本地规则分类：只能返回窗口内的合法 tag，按得分降序；玩家原文不进入任何事实或 prompt。 */
export function rank(window: InputWindow, text: string): Classification[] {
  const said = normalize(text);
  if (!said) return [];
  const out: Classification[] = [];
  for (const tag of window.tags) {
    let score = 0;
    for (const raw of [...(tag.keywords ?? []), ...tag.examples]) {
      const k = normalize(raw);
      if (!k) continue;
      if (said.includes(k)) score = Math.max(score, k.length + (k === said ? 4 : 0));
      else if (k.length >= 3 && looseMatch(said, k)) score = Math.max(score, k.length - 1.5);
    }
    if (score > 0) out.push({ tag, score });
  }
  // 同分时保留数据里的顺序（稳定排序）。
  return out.sort((a, b) => b.score - a.score);
}

export function classify(window: InputWindow, text: string): Classification {
  return rank(window, text)[0] ?? { tag: null, score: 0 };
}

const key = (w: Write) => `${w.fact}=${w.value}`;
const writesOf = (t: Tag) => [...t.writes, ...(t.branches ?? []).flatMap(b => b.writes ?? [])];

/** 一句话最多两个意图：第二个须得分≥2、不与第一个写同一事实的不同值；若一方写入完全包含另一方，只保留更具体的那个。 */
export function intents(window: InputWindow, text: string): Tag[] {
  const [first, ...rest] = rank(window, text);
  if (!first?.tag) return [];
  const a = first.tag, aw = writesOf(a);
  for (const { tag: b, score } of rest) {
    if (!b || score < 2) break;
    const bw = writesOf(b);
    if (bw.some(x => aw.some(y => y.fact === x.fact && y.value !== x.value && x.op === 'set' && y.op === 'set'))) continue;
    const aKeys = new Set(aw.map(key)), bKeys = new Set(bw.map(key));
    if (aw.length && aw.every(x => bKeys.has(key(x))) && bw.length > aw.length) return [b];
    if (bw.length && bw.every(x => aKeys.has(key(x)))) continue;
    return [a, b];
  }
  return [a];
}

export interface SayResult {
  window: InputWindow;
  tag: Tag | null;
  /** 第一次识别失败：信号断续，请玩家重说 */
  garbled: boolean;
  reply: string[];
  changed: Write[];
  advance: boolean;
}

export interface StorySnapshot { version: 1; state: State; used: Record<string, string[]>; misses: Record<string, number> }

/** 剧情事实与玩家输入窗口的运行时；物理事实由宿主同步，玩家输入只写非物理层。 */
export class StoryRuntime {
  state: State;
  private used: Record<string, string[]> = {};
  private misses: Record<string, number> = {};
  constructor(readonly pipeline: Pipeline) { this.state = initialState(pipeline); }

  /** 宿主把客观事实、证据与感知结果写进来；只接受 W/E 层与 K 层中的感知事实 */
  sync(values: Record<string, Value>) {
    for (const [key, value] of Object.entries(values)) if (this.pipeline.facts.some(f => f.key === key)) this.state[key] = value;
  }

  window(id: string | null): InputWindow | null { return id ? this.pipeline.windows.find(w => w.id === id) ?? null : null; }

  /** 快捷短语：当前窗口里前三个满足前置条件、尚未用过的 tag 的第一条样例 */
  suggestions(windowId: string | null, count = 3): { text: string; tag: string }[] {
    const w = this.window(windowId);
    if (!w) return [];
    const used = new Set(this.used[w.id] ?? []);
    return w.tags.filter(t => !used.has(t.id) && test(this.state, t.requires) && t.examples.length).slice(0, count).map(t => ({ text: t.examples[0], tag: t.id }));
  }

  say(windowId: string, text: string, forcedTag?: string): SayResult | null {
    const w = this.window(windowId);
    if (!w) return null;
    const found = forcedTag ? w.tags.filter(t => t.id === forcedTag) : intents(w, text);
    if (found.length > 1) {
      const parts = found.map(t => this.applyTag(w, t));
      return { window: w, tag: parts[0].tag, garbled: false, reply: parts.flatMap(p => p.reply), changed: parts.flatMap(p => p.changed), advance: parts.some(p => p.advance) };
    }
    let tag: Tag | undefined = found[0];
    if (!tag) {
      const misses = (this.misses[w.id] ?? 0) + 1;
      this.misses[w.id] = misses;
      // 推进型窗口不让玩家卡在“再说一遍”；其余窗口第一次失败按信号断续处理。
      if (!w.defaultTag || (misses === 1 && w.advanceOn !== '*')) return { window: w, tag: null, garbled: true, reply: [w.speaker === 'vance' ? '万斯：……你断了，罗温。再说一遍？' : '艾里亚斯：信号断了……再说一遍？'], changed: [], advance: false };
      tag = w.tags.find(t => t.id === w.defaultTag);
      if (!tag) return null;
    }
    this.misses[w.id] = 0;
    return this.applyTag(w, tag);
  }

  private applyTag(w: InputWindow, tag: Tag): SayResult {
    const used = this.used[w.id] ?? (this.used[w.id] = []);
    const repeated = used.includes(tag.id);
    if (!repeated) used.push(tag.id);
    const advance = w.advanceOn === '*' || (Array.isArray(w.advanceOn) && w.advanceOn.includes(tag.id));
    if (!test(this.state, tag.requires)) return { window: w, tag, garbled: false, reply: this.lines(tag.fallback), changed: [], advance: w.advanceOn === '*' };
    const branch = tag.branches?.find(b => test(this.state, b.when));
    let writes = branch?.writes ?? tag.writes;
    // 同一窗口内重复说同类话不重复加减关系，也不重写证词。
    if (repeated) writes = writes.filter(x => x.op !== 'add');
    // 证词已在别的窗口说过，就按“重复”回应，不把整段再讲一遍。
    const retold = writes.some(x => x.op === 'set' && this.pipeline.facts.find(f => f.key === x.fact)?.layer === 'T' && this.state[x.fact] === x.value);
    const changed = apply(this.pipeline, this.state, writes);
    const text = (repeated || retold) && tag.again ? tag.again : branch?.reply ?? tag.reply;
    return { window: w, tag, garbled: false, reply: this.lines(text), changed, advance };
  }

  private lines(text: string | undefined) {
    return lines(text).flatMap(line => line.startsWith('@echo:') ? lines(this.echo(line.slice(6)) ?? '') : [line]);
  }

  /** 某卷录像在当前事实下选中的人物表演 */
  performance(shotId: string): { slot: string; hit: SlotCase | null }[] {
    const shot = this.pipeline.shots.find(s => s.id === shotId);
    return shot ? shot.slots.map(r => ({ slot: r.slot, hit: r.cases.find(c => test(this.state, c.when)) ?? null })) : [];
  }

  echo(id: string): string | null {
    const e = this.pipeline.echoes.find(x => x.id === id);
    return e?.cases.find(c => test(this.state, c.when))?.text ?? null;
  }

  snapshot(): StorySnapshot { return { version: 1, state: structuredClone(this.state), used: structuredClone(this.used), misses: structuredClone(this.misses) }; }

  restore(value: unknown): boolean {
    const s = value as StorySnapshot;
    if (!s || s.version !== 1 || typeof s.state !== 'object' || !s.state || typeof s.used !== 'object' || !s.used) return false;
    for (const f of this.pipeline.facts) {
      const v = s.state[f.key];
      if (v === undefined) continue;
      if (f.type === 'bool' && typeof v !== 'boolean') return false;
      if (f.type === 'int' && (typeof v !== 'number' || !Number.isFinite(v))) return false;
      if (f.type === 'enum' && (typeof v !== 'string' || !f.values?.includes(v))) return false;
    }
    if (!Object.values(s.used).every(a => Array.isArray(a) && a.every(x => typeof x === 'string'))) return false;
    this.state = { ...initialState(this.pipeline), ...structuredClone(s.state) };
    this.used = structuredClone(s.used);
    this.misses = s.misses && typeof s.misses === 'object' ? structuredClone(s.misses) : {};
    return true;
  }
}

const lines = (text: string | undefined) => (text ?? '').split('\n').map(x => x.trim()).filter(Boolean);
