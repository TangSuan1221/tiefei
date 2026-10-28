/** 剧情管线数据模型：五关收容物取证配额、互斥习性封路、双人视频合作逃生、实时事实驱动剧情变化。纯数据与纯函数，不依赖游戏运行时。 */

export type Layer = 'W' | 'E' | 'K' | 'R' | 'S' | 'C' | 'T';
export type Value = string | number | boolean;
export type Holder = 'elias' | 'rowan' | 'hq' | 'vera' | 'keeper';

export interface FactDef {
  key: string;
  layer: Layer;
  type: 'bool' | 'enum' | 'int';
  values?: string[];
  min?: number;
  max?: number;
  initial: Value;
  life: 'level' | 'persist';
  holder?: Holder;
  /** 由什么产生：物理状态、感知、对白 tag、推导 */
  source: string;
  note?: string;
  gap?: string;
}

export interface Cond { fact: string; op: '==' | '!=' | '>=' | '<='; value: Value }
export interface Write { fact: string; op: 'set' | 'add'; value: Value }

export interface TagBranch { when: Cond[]; reply: string; writes?: Write[] }
export interface Tag {
  id: string;
  label: string;
  /** 玩家可能怎么说，用于分类器样例；第一条兼作快捷短语 */
  examples: string[];
  /** 本地分类器关键词，命中越长分越高 */
  keywords?: string[];
  requires?: Cond[];
  /** 前置不满足时的回应，不写事实 */
  fallback?: string;
  branches?: TagBranch[];
  writes: Write[];
  /** 可直接上屏的对白，多行用换行分隔；`@echo:id` 取呼应句，`@plan` 由宿主替换为当前计划句 */
  reply: string;
  /** 同一窗口再次说同类话时的回应 */
  again?: string;
  note?: string;
  gap?: string;
}

export interface InputWindow {
  id: string;
  title: string;
  speaker: Holder;
  stage: string;
  opens: string;
  closes: string;
  /** 可多次通话、选多个 tag */
  multi: boolean;
  /** 可以一句不说 */
  optional: boolean;
  /** 哪些 tag 让对话阶段前进；'*' 表示任何一句都前进 */
  advanceOn?: '*' | string[];
  /** 分类两次失败后采用的 tag */
  defaultTag?: string;
  tags: Tag[];
  gap?: string;
}

export interface SlotCase {
  when: Cond[];
  key: string;
  en: string;
  zh: string;
  /** 视频中的人物原声独白/对白（让艾里亚斯传回的视频有真正的戏剧台词与情感细节） */
  dialogue?: string;
  /** 这段视频揭示的核心剧情信息与人物弧光 */
  storyBeat?: string;
}
export interface SlotRule { slot: string; cases: SlotCase[]; gap?: string }
export interface Shot {
  id: string;
  title: string;
  stage: string;
  /** 视频路由：潜艇本机拍摄 / 玩家操作结果 / 艾里亚斯内侧或探头视频 */
  videoType?: 'player-capture' | 'player-action' | 'elias-story';
  /** 由物理状态决定的槽位读取 */
  reads: string[];
  /** 受玩家输入与实时游戏事实影响的槽位 */
  slots: SlotRule[];
  note: string;
  /** 当没有条件分支时，该视频承载的完整剧情画面与对白剧本 */
  script?: { visual: string; dialogue: string; reveal: string };
}

export interface Stage {
  id: string;
  title: string;
  dialogueStages: string[];
  /** 连贯的本阶段故事正文（交代人物在哪、看见/听见什么、为什么要做下一步） */
  narrative?: string;
  objective: string;
  advance: string;
  /** 推进到下一阶段要读取的事实（含收容物拍摄配额硬门禁） */
  gate: string[];
  sets: Write[];
}

export interface OptionalAction { id: string; label: string; stage: string; requires: Cond[]; sets: Write[]; gap?: string }

export interface Echo {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5;
  kind: 'line' | 'log' | 'objective' | 'video' | 'report';
  perspective: Holder | 'world';
  reads: string[];
  cases: { when: Cond[]; text: string }[];
  gap?: string;
}

export interface ContainmentQuota {
  required: number;
  capturedFact: string;
  requiredFact: string;
  gateFact: string;
  specimens: { id: string; name: string; trait: string; blocker: string; countermeasure: string }[];
}

export interface Pipeline {
  id: string;
  chapter?: number;
  title: string;
  /** 本章故事梗概（让读者一眼看懂本章前因后果） */
  synopsis?: string;
  status: string;
  sourceDoc: string;
  quota?: ContainmentQuota;
  facts: FactDef[];
  stages: Stage[];
  windows: InputWindow[];
  shots: Shot[];
  optional: OptionalAction[];
  echoes: Echo[];
  presets: { id: string; title: string; picks: Record<string, string[]>; toggles: string[] }[];
}

export const layerNames: Record<Layer, string> = {
  W: '客观事实', E: '证据与收容配额', K: '角色认知', R: '关系', S: '言行记录', C: '承诺', T: '证词',
};
export const holderNames: Record<Holder, string> = {
  elias: '艾里亚斯', rowan: '罗温', hq: '总部简报', vera: '维拉', keeper: '周岑',
};

export type TagKind = 'none' | 'fact' | 'video' | 'xvideo';

export function tagWrites(tag: Tag): Write[] {
  return [...tag.writes, ...(tag.branches ?? []).flatMap(b => b.writes ?? [])];
}

const slotFactsOf = (s: Shot) => s.slots.flatMap(r => r.cases.flatMap(c => c.when.map(w => w.fact)));

/** 本关录像中，写入之后才拍的那些卷（同阶段内窗口先于录像） */
export function laterShots(p: Pipeline, window: InputWindow): Shot[] {
  const at = p.stages.findIndex(s => s.id === window.stage);
  return p.shots.filter(s => p.stages.findIndex(x => x.id === s.stage) >= at);
}

/** video：本关之后的录像会读到；xvideo：只有后续关卡的视频呼应会读到；fact：只影响非视频内容 */
export function tagKind(p: Pipeline, window: InputWindow, tag: Tag): TagKind {
  const writes = tagWrites(tag);
  if (!writes.length) return 'none';
  const keys = new Set(writes.map(w => w.fact));
  if (laterShots(p, window).some(s => slotFactsOf(s).some(k => keys.has(k)))) return 'video';
  const videoEchoes = p.echoes.filter(e => e.kind === 'video');
  if (videoEchoes.some(e => e.reads.some(k => keys.has(k)) || e.cases.some(c => c.when.some(w => keys.has(w.fact))))) return 'xvideo';
  return 'fact';
}

export type State = Record<string, Value>;

export function initialState(p: Pipeline): State {
  return Object.fromEntries(p.facts.map(f => [f.key, f.initial]));
}

export function test(state: State, conds: Cond[] | undefined): boolean {
  return (conds ?? []).every(c => {
    const v = state[c.fact];
    switch (c.op) {
      case '==': return v === c.value;
      case '!=': return v !== c.value;
      case '>=': return typeof v === 'number' && v >= (c.value as number);
      case '<=': return typeof v === 'number' && v <= (c.value as number);
    }
  });
}

export function apply(p: Pipeline, state: State, writes: Write[]): Write[] {
  const changed: Write[] = [];
  for (const w of writes) {
    const def = p.facts.find(f => f.key === w.fact);
    let next: Value = w.op === 'add' ? Number(state[w.fact] ?? 0) + Number(w.value) : w.value;
    if (def?.type === 'int' && typeof next === 'number') next = Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, next));
    if (state[w.fact] !== next) { state[w.fact] = next; changed.push({ fact: w.fact, op: 'set', value: next }); }
  }
  if (p.quota) {
    const captured = Number(state[p.quota.capturedFact] ?? 0);
    const required = Number(state[p.quota.requiredFact] ?? p.quota.required);
    const met = captured >= required;
    if (p.facts.some(f => f.key === p.quota!.gateFact) && state[p.quota.gateFact] !== met) {
      state[p.quota.gateFact] = met;
      changed.push({ fact: p.quota.gateFact, op: 'set', value: met });
    }
  }
  return changed;
}

export interface SimEvent {
  stage: Stage;
  physical: Write[];
  inputs: { window: InputWindow; tag: Tag | null; reply: string; changed: Write[]; blocked: boolean }[];
  optional: { action: OptionalAction; done: boolean; changed: Write[] }[];
  shots: { shot: Shot; slots: { slot: string; hit: SlotCase | null }[] }[];
  gateBlocked: string[];
}

export interface SimResult {
  events: SimEvent[];
  state: State;
  echoes: { echo: Echo; text: string | null }[];
  canClearChapter: boolean;
  missingGates: string[];
}

export function simulate(p: Pipeline, picks: Record<string, string[]>, toggles: Set<string>): SimResult {
  const state = initialState(p), events: SimEvent[] = [];
  if (toggles.has('corpse') && p.facts.some(f => f.key === 'corpse.present')) state['corpse.present'] = 'background';
  for (const stage of p.stages) {
    const baseSets = toggles.has('skip-quota') && p.quota
      ? stage.sets.filter(w => w.fact !== p.quota!.capturedFact && w.fact !== p.quota!.gateFact)
      : stage.sets;
    const ev: SimEvent = { stage, physical: apply(p, state, baseSets), inputs: [], optional: [], shots: [], gateBlocked: [] };
    for (const window of p.windows.filter(w => w.stage === stage.id)) {
      const ids = picks[window.id] ?? [];
      if (!ids.length) { ev.inputs.push({ window, tag: null, reply: window.optional ? '（未开口）' : '（未选择）', changed: [], blocked: false }); continue; }
      for (const id of ids) {
        const tag = window.tags.find(t => t.id === id);
        if (!tag) continue;
        if (!test(state, tag.requires)) { ev.inputs.push({ window, tag, reply: tag.fallback ?? '（前置不满足）', changed: [], blocked: true }); continue; }
        const branch = tag.branches?.find(b => test(state, b.when));
        const changed = apply(p, state, branch?.writes ?? tag.writes);
        ev.inputs.push({ window, tag, reply: branch?.reply ?? tag.reply, changed, blocked: false });
      }
    }
    for (const action of p.optional.filter(a => a.stage === stage.id)) {
      const done = toggles.has(action.id) && test(state, action.requires);
      ev.optional.push({ action, done, changed: done ? apply(p, state, action.sets) : [] });
    }
    for (const shot of p.shots.filter(s => s.stage === stage.id))
      ev.shots.push({ shot, slots: shot.slots.map(r => ({ slot: r.slot, hit: r.cases.find(c => test(state, c.when)) ?? null })) });
    for (const g of stage.gate) {
      const v = state[g];
      if (v === false || v === 0 || v === 'none' || v === 'unknown') ev.gateBlocked.push(g);
    }
    events.push(ev);
  }
  const echoes = p.echoes.map(echo => ({ echo, text: echo.cases.find(c => test(state, c.when))?.text ?? null }));
  const lastStage = p.stages.at(-1);
  const missingGates = (lastStage?.gate ?? []).filter(g => !state[g]);
  return { events, state, echoes, canClearChapter: missingGates.length === 0, missingGates };
}

export interface FactRefs {
  writers: { where: string; label: string }[];
  readers: { where: string; label: string }[];
}

export function factRefs(p: Pipeline, key: string): FactRefs {
  const writers: FactRefs['writers'] = [], readers: FactRefs['readers'] = [];
  const reads = (conds: Cond[] | undefined) => (conds ?? []).some(c => c.fact === key);
  for (const s of p.stages) {
    if (s.sets.some(w => w.fact === key)) writers.push({ where: 'stage:' + s.id, label: `阶段「${s.title}」物理/感知写入` });
    if (s.gate.includes(key)) readers.push({ where: 'stage:' + s.id, label: `阶段「${s.title}」推进条件` });
  }
  for (const w of p.windows) for (const t of w.tags) {
    if (tagWrites(t).some(x => x.fact === key)) writers.push({ where: `tag:${w.id}:${t.id}`, label: `${w.title} → ${t.label}` });
    if (reads(t.requires) || (t.branches ?? []).some(b => reads(b.when))) readers.push({ where: `tag:${w.id}:${t.id}`, label: `${w.title} → ${t.label}（条件）` });
  }
  for (const a of p.optional) {
    if (a.sets.some(w => w.fact === key)) writers.push({ where: 'optional:' + a.id, label: `可选行为「${a.label}」` });
    if (reads(a.requires)) readers.push({ where: 'optional:' + a.id, label: `可选行为「${a.label}」（条件）` });
  }
  for (const s of p.shots) {
    if (s.reads.includes(key)) readers.push({ where: 'shot:' + s.id, label: `${s.id} 物理槽位` });
    for (const r of s.slots) if (r.cases.some(c => reads(c.when))) readers.push({ where: 'shot:' + s.id, label: `${s.id} 槽位 ${r.slot}` });
  }
  for (const e of p.echoes) if (e.reads.includes(key) || e.cases.some(c => reads(c.when))) readers.push({ where: 'echo:' + e.id, label: `L${e.level} ${e.title}` });
  if (p.quota && [p.quota.capturedFact, p.quota.requiredFact, p.quota.gateFact].includes(key)) {
    readers.push({ where: 'quota:' + p.id, label: '总部收容物配额门禁' });
  }
  return { writers, readers };
}

export interface Issue { level: 'error' | 'warn'; where: string; text: string }

export function validate(p: Pipeline): Issue[] {
  const issues: Issue[] = [], keys = new Map(p.facts.map(f => [f.key, f]));
  const check = (where: string, key: string) => { if (!keys.has(key)) issues.push({ level: 'error', where, text: `引用了未登记的事实 ${key}` }); };
  const checkConds = (where: string, conds: Cond[] | undefined) => (conds ?? []).forEach(c => {
    check(where, c.fact);
    const def = keys.get(c.fact);
    if (def?.type === 'enum' && typeof c.value === 'string' && !def.values?.includes(c.value)) issues.push({ level: 'error', where, text: `${c.fact} 没有取值 ${c.value}` });
  });
  const checkWrites = (where: string, writes: Write[], fromInput: boolean) => writes.forEach(w => {
    check(where, w.fact);
    const def = keys.get(w.fact);
    if (!def) return;
    if (fromInput && (def.layer === 'W' || def.layer === 'E')) issues.push({ level: 'error', where, text: `玩家输入不能直接写客观事实或证据：${w.fact}` });
    if (def.type === 'enum' && typeof w.value === 'string' && !def.values?.includes(w.value)) issues.push({ level: 'error', where, text: `${w.fact} 没有取值 ${w.value}` });
    if (def.type === 'int' && w.op === 'set' && typeof w.value !== 'number') issues.push({ level: 'error', where, text: `${w.fact} 需要数值` });
  });
  if (p.quota) {
    check('配额定义', p.quota.capturedFact);
    check('配额定义', p.quota.requiredFact);
    check('配额定义', p.quota.gateFact);
    const lastStage = p.stages.at(-1);
    if (!lastStage?.gate.includes(p.quota.gateFact)) {
      issues.push({ level: 'error', where: p.title, text: `终段阶段必须以收容物配额 ${p.quota.gateFact} 作为通关硬门禁` });
    }
  }
  for (const s of p.stages) { checkWrites('阶段 ' + s.title, s.sets, false); s.gate.forEach(k => check('阶段 ' + s.title, k)); }
  const stageIds = new Set(p.stages.map(s => s.id));
  for (const w of p.windows) {
    if (!stageIds.has(w.stage)) issues.push({ level: 'error', where: w.title, text: `所属阶段 ${w.stage} 不存在` });
    const known = new Set(w.tags.map(t => t.id));
    if (w.defaultTag && !known.has(w.defaultTag)) issues.push({ level: 'error', where: w.title, text: `默认 tag ${w.defaultTag} 不存在` });
    if (Array.isArray(w.advanceOn)) w.advanceOn.filter(id => !known.has(id)).forEach(id => issues.push({ level: 'error', where: w.title, text: `推进 tag ${id} 不存在` }));
    for (const t of w.tags) if (!t.keywords?.length) issues.push({ level: 'warn', where: `${w.title} → ${t.label}`, text: '没有分类关键词，游戏内只能靠样例原句命中' });
    const ids = new Set<string>();
    for (const t of w.tags) {
      const where = `${w.title} → ${t.label}`;
      if (ids.has(t.id)) issues.push({ level: 'error', where, text: `tag id 重复：${t.id}` });
      ids.add(t.id);
      checkConds(where, t.requires);
      (t.branches ?? []).forEach(b => checkConds(where, b.when));
      checkWrites(where, tagWrites(t), true);
      if (t.requires?.length && !t.fallback) issues.push({ level: 'warn', where, text: '有前置条件但没有前置不满足时的回应' });
      if (!t.examples.length) issues.push({ level: 'warn', where, text: '没有玩家说法样例，分类器无从训练或核对' });
    }
  }
  for (const a of p.optional) { checkConds('可选 ' + a.label, a.requires); checkWrites('可选 ' + a.label, a.sets, false); }
  for (const s of p.shots) {
    if (!stageIds.has(s.stage)) issues.push({ level: 'error', where: s.id, text: `所属阶段 ${s.stage} 不存在` });
    s.reads.forEach(k => check(s.id, k));
    for (const r of s.slots) {
      r.cases.forEach(c => checkConds(`${s.id} ${r.slot}`, c.when));
      if (!r.cases.some(c => !c.when.length)) issues.push({ level: 'warn', where: `${s.id} ${r.slot}`, text: '没有无条件的默认表演，可能出现空槽位' });
      for (const c of r.cases) if (c.en.split(/\s+/).filter(Boolean).length > 25) issues.push({ level: 'warn', where: `${s.id} ${c.key}`, text: '表演句超过25词' });
    }
  }
  for (const e of p.echoes) {
    e.reads.forEach(k => check(e.id, k));
    e.cases.forEach(c => checkConds(e.id, c.when));
    if (e.perspective !== 'world') for (const k of new Set([...e.reads, ...e.cases.flatMap(c => c.when.map(w => w.fact))])) {
      const def = keys.get(k);
      if (def?.layer === 'K' && def.holder && def.holder !== e.perspective && def.holder !== 'rowan')
        issues.push({ level: 'error', where: e.title, text: `${holderNames[e.perspective]}视角读取了${holderNames[def.holder]}的认知 ${k}` });
      if (def?.layer === 'W') issues.push({ level: 'warn', where: e.title, text: `${holderNames[e.perspective]}视角读取客观事实 ${k}，需确认只用于可行性判断` });
    }
  }
  for (const f of p.facts) {
    const r = factRefs(p, f.key);
    if (!r.readers.length) issues.push({ level: 'warn', where: f.key, text: '没有读者：没有任何剧情、槽位或呼应读取它，应删除或补读者' });
    if (!r.writers.length && f.layer !== 'W' && f.layer !== 'E') issues.push({ level: 'warn', where: f.key, text: '没有写入者，值永远是初始值' });
  }
  return issues;
}
