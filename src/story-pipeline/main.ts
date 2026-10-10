import './style.css';
import { level01 } from './level-01';
import {
  type Cond, type Echo, type FactDef, type InputWindow, type Pipeline, type Shot, type Stage, type Tag, type Value, type Write,
  factRefs, holderNames, initialState, laterShots, layerNames, simulate, tagKind, tagWrites, validate,
} from './model';

const pipelines: Pipeline[] = [level01];
const p = pipelines[0];
const root = document.querySelector<HTMLDivElement>('#app')!;
const STORE = 'story-pipeline:' + p.id;

type Tab = 'structure' | 'inputs' | 'facts' | 'sim' | 'check';
type Sel = { type: 'fact' | 'window' | 'shot' | 'echo' | 'stage' | 'optional'; id: string } | null;
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as { picks?: Record<string, string[]>; toggles?: string[]; tab?: Tab }; } catch { return {}; } })();
let tab: Tab = saved.tab ?? 'structure';
let sel: Sel = null;
let picks: Record<string, string[]> = saved.picks ?? structuredClone(p.presets[0].picks);
let toggles = new Set<string>(saved.toggles ?? p.presets[0].toggles);
let factFilter = '';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const facts = new Map(p.facts.map(f => [f.key, f]));
const kindNames = { none: '不写事实', fact: '写事实·不经视频', video: '写事实·本关视频呈现', xvideo: '写事实·后续关卡视频呈现' } as const;
const echoKindNames: Record<Echo['kind'], string> = { line: '台词', log: '日志', objective: '目标', video: '视频', report: '报告' };
const fmtValue = (v: Value) => typeof v === 'string' ? v : JSON.stringify(v);
const condText = (c: Cond) => `${c.fact} ${c.op} ${fmtValue(c.value)}`;
const writeText = (w: Write) => w.op === 'add' ? `${w.fact} ${Number(w.value) >= 0 ? '+' : ''}${w.value}` : `${w.fact} = ${fmtValue(w.value)}`;

function persist() { localStorage.setItem(STORE, JSON.stringify({ picks, toggles: [...toggles], tab })); }

/** 选中事实时，标出所有写入/读取它的元素 */
function touch(where: string): string {
  if (!sel || sel.type !== 'fact') return '';
  const r = factRefs(p, sel.id);
  const match = (x: { where: string }) => x.where === where || x.where.startsWith(where + ':');
  return r.writers.some(match) ? ' touch-w' : r.readers.some(match) ? ' touch-r' : '';
}
function chip(key: string, label?: string) {
  const def = facts.get(key);
  const on = sel?.type === 'fact' && sel.id === key ? ' on' : '';
  return `<button class="chip L-${def?.layer ?? 'X'}${on}" data-fact="${esc(key)}" title="${esc(def ? layerNames[def.layer] + ' · ' + def.source : '未登记')}">${esc(label ?? key)}</button>`;
}
const condChips = (cs: Cond[] | undefined) => (cs ?? []).length ? (cs ?? []).map(c => chip(c.fact, condText(c))).join('') : '<span class="dim">无条件</span>';
const writeChips = (ws: Write[]) => ws.length ? ws.map(w => chip(w.fact, writeText(w))).join('') : '<span class="dim">—</span>';
const badge = (k: keyof typeof kindNames) => `<span class="badge k-${k}">${kindNames[k]}</span>`;
const gap = (g?: string) => g ? `<span class="gap" title="${esc(g)}">GAP</span>` : '';

/** tag 写入的事实之后会被哪些录像/呼应/阶段读到；已经拍过的录像不算 */
function tagOutlets(window: InputWindow, tag: Tag): string[] {
  const later = new Set(laterShots(p, window).map(s => 'shot:' + s.id)), out = new Set<string>();
  for (const w of tagWrites(tag)) for (const r of factRefs(p, w.fact).readers) {
    if (r.where.startsWith('shot:') ? later.has(r.where) : r.where.startsWith('echo:') || r.where.startsWith('stage:') || r.where.startsWith('optional:')) out.add(r.label);
  }
  return [...out];
}

function header(issues: ReturnType<typeof validate>) {
  const errors = issues.filter(i => i.level === 'error').length, warns = issues.length - errors;
  const tabs: [Tab, string][] = [['structure', '剧情结构'], ['inputs', '玩家输入'], ['facts', '事实表'], ['sim', '推演'], ['check', `检查 ${errors ? `<b class="err">${errors}</b>` : ''}${warns ? `<b class="warn">${warns}</b>` : ''}`]];
  return `<header class="top"><div><h1>剧情管线 · ${esc(p.title)}</h1><small>${esc(p.status)} · 数据 <code>src/story-pipeline/level-01.ts</code> · 设计 <code>${esc(p.sourceDoc)}</code></small></div>
  <nav>${tabs.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('')}<button data-export>导出 JSON</button></nav></header>`;
}

function windowCard(w: InputWindow) {
  const counts = { none: 0, fact: 0, video: 0, xvideo: 0 };
  for (const t of w.tags) counts[tagKind(p, w, t)]++;
  const on = sel?.type === 'window' && sel.id === w.id ? ' on' : '';
  return `<div class="card win sp-${w.speaker}${on}${touch('tag:' + w.id)}" data-sel="window:${w.id}"><b>🎙 ${esc(holderNames[w.speaker])} · ${esc(w.title)}</b>${gap(w.gap)}
  <div class="counts"><span class="k-none">● ${counts.none}</span><span class="k-fact">● ${counts.fact}</span><span class="k-video">● ${counts.video}</span>${counts.xvideo ? `<span class="k-xvideo">● ${counts.xvideo}</span>` : ''}${w.multi ? '<span class="dim">可多次</span>' : ''}</div></div>`;
}
function shotCard(s: Shot) {
  const live = s.slots.length > 0, on = sel?.type === 'shot' && sel.id === s.id ? ' on' : '';
  return `<div class="card shot${live ? ' live' : ''}${on}${touch('shot:' + s.id)}" data-sel="shot:${s.id}"><b>🎞 ${esc(s.id)} ${esc(s.title)}</b><small>${live ? '受输入影响：' + s.slots.map(r => r.slot).join('、') : '仅物理状态'}</small></div>`;
}

function structure() {
  const cols = p.stages.map((s, i) => {
    const on = sel?.type === 'stage' && sel.id === s.id ? ' on' : '';
    return `<section class="col"><header class="stage${on}${touch('stage:' + s.id)}" data-sel="stage:${s.id}"><em>${String(i + 1).padStart(2, '0')}</em> ${esc(s.title)}<small>${esc(s.dialogueStages.join(' / '))}</small></header>
    <p class="obj">${esc(s.objective)}</p>
    ${s.sets.length ? `<div class="sub">进入时写入</div><div class="chips">${writeChips(s.sets)}</div>` : ''}
    ${p.windows.filter(w => w.stage === s.id).map(windowCard).join('')}
    ${p.optional.filter(a => a.stage === s.id).map(a => `<div class="card opt${touch('optional:' + a.id)}" data-sel="optional:${a.id}"><b>◇ 可选：${esc(a.label)}</b>${gap(a.gap)}</div>`).join('')}
    ${p.shots.filter(x => x.stage === s.id).map(shotCard).join('')}
    <div class="sub">推进</div><p class="adv">${esc(s.advance)}</p><div class="chips">${s.gate.map(k => chip(k)).join('')}</div></section>`;
  }).join('<div class="arrow">→</div>');
  const levels = [1, 2, 4, 5] as const;
  const echoes = levels.map(l => {
    const list = p.echoes.filter(e => e.level === l);
    return list.length ? `<div class="echo-col"><h3>${l === 1 ? '本关内呼应' : `第${['', '一', '二', '三', '四', '五'][l]}关呼应`}</h3>${list.map(e => {
      const on = sel?.type === 'echo' && sel.id === e.id ? ' on' : '';
      return `<div class="card echo${on}${touch('echo:' + e.id)}" data-sel="echo:${e.id}"><b>${esc(e.title)}</b> <span class="badge">${echoKindNames[e.kind]}</span>${gap(e.gap)}<div class="chips">${e.reads.map(k => chip(k)).join('')}</div></div>`;
    }).join('')}</div>` : '';
  }).join('');
  return `<div class="legend"><span class="k-none">● 不写事实</span><span class="k-fact">● 写事实·不经视频</span><span class="k-video">● 写事实·本关视频呈现</span><span class="k-xvideo">● 写事实·后续关卡视频呈现</span><span class="touch-w-demo">写入者</span><span class="touch-r-demo">读取者</span><span class="dim">点任意事实标签，高亮所有写入和读取它的地方</span></div>
  <div class="lane">${cols}</div><h2 class="sec">呼应片段</h2><div class="echoes">${echoes}</div>`;
}

function tagRow(w: InputWindow, t: Tag) {
  const k = tagKind(p, w, t), outlets = tagOutlets(w, t);
  const branches = t.branches?.length ? t.branches.map(b => `<div class="branch"><span class="dim">若</span> ${condChips(b.when)} → ${esc(b.reply)} ${b.writes ? writeChips(b.writes) : ''}</div>`).join('') : '';
  return `<tr class="${touch(`tag:${w.id}:${t.id}`)}"><td><b>${esc(t.label)}</b>${gap(t.gap)}<div class="dim">“${t.examples.map(esc).join('” “')}”</div></td><td>${badge(k)}</td>
  <td>${condChips(t.requires)}${t.fallback ? `<div class="dim">否则：${esc(t.fallback)}</div>` : ''}</td><td>${writeChips(t.writes)}</td>
  <td>${esc(t.reply)}${branches}</td><td>${outlets.length ? outlets.map(o => `<div>${esc(o)}</div>`).join('') : '<span class="dim">—</span>'}</td></tr>`;
}
function inputs() {
  return p.windows.map(w => {
    const stage = p.stages.find(s => s.id === w.stage);
    return `<section class="window sp-${w.speaker}"><h2>🎙 ${esc(holderNames[w.speaker])} · ${esc(w.title)} ${gap(w.gap)}<small>阶段：${esc(stage?.title)} · 开启：${esc(w.opens)} · 结束：${esc(w.closes)} · ${w.multi ? '可多次通话' : '一句'}${w.optional ? ' · 可不说' : ' · 必须回复'}</small></h2>
    <table><thead><tr><th>Tag（玩家说法样例）</th><th>类别</th><th>前置条件</th><th>写入</th><th>回应</th><th>后续读到它的地方</th></tr></thead><tbody>${w.tags.map(t => tagRow(w, t)).join('')}</tbody></table></section>`;
  }).join('');
}

function factsView() {
  const q = factFilter.trim().toLowerCase();
  const groups = (Object.keys(layerNames) as FactDef['layer'][]).map(layer => {
    const list = p.facts.filter(f => f.layer === layer && (!q || f.key.toLowerCase().includes(q) || f.source.toLowerCase().includes(q)));
    if (!list.length) return '';
    return `<h2 class="sec L-${layer}-t">${layerNames[layer]} <small>${list.length}</small></h2><table><thead><tr><th>键</th><th>持有者</th><th>类型 / 取值</th><th>初始</th><th>寿命</th><th>来源</th><th>写入</th><th>读取</th><th>备注</th></tr></thead><tbody>${list.map(f => {
      const r = factRefs(p, f.key);
      const type = f.type === 'enum' ? f.values!.join(' | ') : f.type === 'int' ? `${f.min}..${f.max}` : 'bool';
      return `<tr><td>${chip(f.key)}</td><td>${f.holder ? holderNames[f.holder] : '—'}</td><td>${esc(type)}</td><td>${esc(fmtValue(f.initial))}</td><td>${f.life === 'persist' ? '<b>跨关</b>' : '关内'}</td><td>${esc(f.source)}</td>
      <td class="${r.writers.length ? '' : 'dim'}">${r.writers.length}</td><td class="${r.readers.length ? '' : 'warn'}">${r.readers.length}</td><td>${gap(f.gap)} <span class="dim">${esc(f.note ?? '')}</span></td></tr>`;
    }).join('')}</tbody></table>`;
  }).join('');
  return `<div class="filter"><input data-filter placeholder="筛选事实键或来源…" value="${esc(factFilter)}"> <span class="dim">共 ${p.facts.length} 个事实；跨关 ${p.facts.filter(f => f.life === 'persist').length} 个</span></div>${groups}`;
}

function sim() {
  const result = simulate(p, picks, toggles), init = initialState(p);
  const controls = p.windows.map(w => {
    const chosen = new Set(picks[w.id] ?? []);
    const opts = w.tags.map(t => `<label class="opt-row"><input type="${w.multi ? 'checkbox' : 'radio'}" name="pick-${w.id}" data-pick="${w.id}" value="${t.id}" ${chosen.has(t.id) ? 'checked' : ''}> ${esc(t.label)} <span class="k-${tagKind(p, w, t)}">●</span></label>`).join('');
    const none = !w.multi && w.optional ? `<label class="opt-row"><input type="radio" name="pick-${w.id}" data-pick="${w.id}" value="" ${chosen.size ? '' : 'checked'}> <span class="dim">（不说话）</span></label>` : '';
    return `<fieldset><legend>${esc(holderNames[w.speaker])} · ${esc(w.title)}</legend>${none}${opts}</fieldset>`;
  }).join('');
  const toggleList = [{ id: 'corpse', label: '假设尸体模型已就位（GAP）' }, ...p.optional.map(a => ({ id: a.id, label: '执行可选行为：' + a.label }))];
  const timeline = result.events.map(ev => `<div class="ev"><h3>${esc(ev.stage.title)} <small>${esc(ev.stage.objective)}</small></h3>
    ${ev.physical.length ? `<div class="line phys">物理 / 感知：${writeChips(ev.physical)}</div>` : ''}
    ${ev.inputs.map(i => `<div class="line in"><b>🎙 ${esc(i.window.title)}：</b>${i.tag ? esc(i.tag.label) : ''} ${i.blocked ? '<span class="warn">前置不满足</span>' : ''}<div class="reply">${esc(i.reply)}</div>${i.changed.length ? `<div>写入：${writeChips(i.changed)}</div>` : ''}</div>`).join('')}
    ${ev.optional.map(o => `<div class="line"><b>◇ ${esc(o.action.label)}：</b>${o.done ? writeChips(o.changed) : '<span class="dim">未执行</span>'}</div>`).join('')}
    ${ev.shots.map(s => `<div class="line shot-line"><b>🎞 ${esc(s.shot.id)} ${esc(s.shot.title)}</b>${s.slots.length ? s.slots.map(x => `<div class="beat"><code>${esc(x.slot)}=${esc(x.hit?.key ?? '—')}</code> ${esc(x.hit?.zh ?? '')}<div class="en">${esc(x.hit?.en ?? '')}</div></div>`).join('') : `<span class="dim"> 仅物理：${esc(s.shot.note)}</span>`}</div>`).join('')}</div>`).join('');
  const echoes = result.echoes.map(e => `<div class="line"><b>L${e.echo.level} ${esc(e.echo.title)}</b> ${gap(e.echo.gap)}<div class="reply">${esc(e.text ?? '（无匹配）')}</div></div>`).join('');
  const diff = p.facts.filter(f => result.state[f.key] !== init[f.key] && f.layer !== 'W' && f.layer !== 'E');
  return `<div class="sim"><aside class="controls"><div class="presets">${p.presets.map(x => `<button data-preset="${x.id}">${esc(x.title)}</button>`).join('')}<button data-preset="">清空</button></div>
    ${toggleList.map(t => `<label class="opt-row"><input type="checkbox" data-toggle="${t.id}" ${toggles.has(t.id) ? 'checked' : ''}> ${esc(t.label)}</label>`).join('')}${controls}</aside>
    <div class="results"><h2 class="sec">推演时间线</h2>${timeline}<h2 class="sec">呼应结果</h2>${echoes}
    <h2 class="sec">离关时的非物理事实（与初始不同）</h2><table><tbody>${diff.map(f => `<tr><td>${chip(f.key)}</td><td>${esc(fmtValue(init[f.key]))} → <b>${esc(fmtValue(result.state[f.key]))}</b></td><td>${f.life === 'persist' ? '<b>跨关</b>' : '关内'}</td></tr>`).join('') || '<tr><td class="dim">没有变化</td></tr>'}</tbody></table></div></div>`;
}

function check(issues: ReturnType<typeof validate>) {
  const tags = p.windows.flatMap(w => w.tags), kinds = { none: 0, fact: 0, video: 0, xvideo: 0 };
  p.windows.forEach(w => w.tags.forEach(t => kinds[tagKind(p, w, t)]++));
  const beatSlots = p.shots.flatMap(s => s.slots.filter(r => r.slot === 'elias_beat').map(r => ({ s, n: r.cases.length })));
  const combos = beatSlots.reduce((a, b) => a * b.n, 1);
  return `<div class="stats"><div><b>${p.facts.length}</b>事实</div><div><b>${p.windows.length}</b>输入窗口</div><div><b>${tags.length}</b>tag</div><div><b>${kinds.none}/${kinds.fact}/${kinds.video}/${kinds.xvideo}</b>不写 / 非视频 / 本关视频 / 后续关卡视频</div><div><b>${beatSlots.length}</b>卷受输入影响</div><div><b>${combos}</b>表演序列上限</div></div>
  <p class="dim">表演序列上限 = 各卷表演槽位候选数之积（${beatSlots.map(b => `${b.s.id}×${b.n}`).join('、')}），只是组合规模，不代表玩家体验已经千人千面。</p>
  <h2 class="sec">自动检查</h2>${issues.length ? `<table><tbody>${issues.map(i => `<tr><td class="${i.level === 'error' ? 'err' : 'warn'}">${i.level === 'error' ? '错误' : '警告'}</td><td>${facts.has(i.where) ? chip(i.where) : esc(i.where)}</td><td>${esc(i.text)}</td></tr>`).join('')}</tbody></table>` : '<p>没有发现问题。</p>'}
  <h2 class="sec">检查规则</h2><ul class="dim"><li>引用的事实必须已登记，枚举取值必须合法。</li><li>玩家输入不能直接写客观事实或证据。</li><li>NPC 视角的呼应不能读取其他 NPC 的认知；读取客观事实给出警告，需确认只用于可行性。</li><li>每个事实至少有一个读者；非物理事实至少有一个写入者。</li><li>每个表演槽位要有无条件默认值；表演句不超过25词。</li><li>有前置条件的 tag 要写前置不满足时的回应；每个 tag 至少一条说法样例。</li></ul>`;
}

function detail() {
  if (!sel) return `<h3>使用说明</h3><p>这是第一关的剧情管线视图，不需要运行游戏。</p><ul><li><b>剧情结构</b>：按游玩顺序排列阶段，每个阶段下挂玩家输入窗口、可选行为和录像。</li><li><b>玩家输入</b>：每个窗口的 tag、前置条件、写入的事实、回应和后续影响。</li><li><b>事实表</b>：全部事实及其写入、读取次数。</li><li><b>推演</b>：为每个窗口选一种说法，看事实、录像表演和呼应怎么变化。</li><li><b>检查</b>：自动找出未登记、无读者、越权读取等问题。</li></ul><p class="dim">点任意彩色事实标签或卡片查看详情。改剧情只需编辑数据文件。</p>`;
  if (sel.type === 'fact') {
    const f = facts.get(sel.id); if (!f) return '';
    const r = factRefs(p, f.key);
    const link = (x: { where: string; label: string }) => { const [type, a, b] = x.where.split(':'); const target = type === 'tag' ? `window:${a}` : `${type}:${a}`; void b; return `<li><button class="link" data-sel="${esc(target)}">${esc(x.label)}</button></li>`; };
    return `<h3>${chip(f.key)}</h3><p>${layerNames[f.layer]}${f.holder ? ' · ' + holderNames[f.holder] : ''} · ${f.life === 'persist' ? '跨关持久' : '关内'}</p><p>类型：${f.type === 'enum' ? esc(f.values!.join(' | ')) : f.type === 'int' ? `${f.min}..${f.max}` : 'bool'}，初始 ${esc(fmtValue(f.initial))}</p><p>来源：${esc(f.source)}</p>${f.note ? `<p class="dim">${esc(f.note)}</p>` : ''}${f.gap ? `<p class="gaptext">GAP：${esc(f.gap)}</p>` : ''}
    <h4 class="w">写入者 ${r.writers.length}</h4><ul>${r.writers.map(link).join('') || '<li class="dim">无</li>'}</ul><h4 class="r">读取者 ${r.readers.length}</h4><ul>${r.readers.map(link).join('') || '<li class="warn">无读者</li>'}</ul>`;
  }
  if (sel.type === 'window') {
    const w = p.windows.find(x => x.id === sel!.id); if (!w) return '';
    return `<h3>🎙 ${esc(holderNames[w.speaker])} · ${esc(w.title)}</h3><p>开启：${esc(w.opens)}<br>结束：${esc(w.closes)}</p>${w.gap ? `<p class="gaptext">GAP：${esc(w.gap)}</p>` : ''}${w.tags.map(t => `<div class="dt"><b>${esc(t.label)}</b> ${badge(tagKind(p, w, t))}<div>${writeChips(tagWrites(t))}</div><div class="reply">${esc(t.reply || t.branches?.map(b => b.reply).join(' / '))}</div></div>`).join('')}<p><button class="link" data-tab="inputs">在“玩家输入”中查看完整表格</button></p>`;
  }
  if (sel.type === 'shot') {
    const s = p.shots.find(x => x.id === sel!.id); if (!s) return '';
    return `<h3>🎞 ${esc(s.id)} ${esc(s.title)}</h3><p class="dim">${esc(s.note)}</p><h4>物理槽位读取</h4><div class="chips">${s.reads.map(k => chip(k)).join('')}</div>${s.slots.map(r => `<h4>槽位 ${esc(r.slot)} ${gap(r.gap)}</h4>${r.cases.map(c => `<div class="dt"><code>${esc(c.key)}</code> ${condChips(c.when)}<div>${esc(c.zh)}</div><div class="en">${esc(c.en)}</div></div>`).join('')}`).join('') || '<p class="dim">没有受输入影响的槽位。</p>'}`;
  }
  if (sel.type === 'echo') {
    const e = p.echoes.find(x => x.id === sel!.id); if (!e) return '';
    return `<h3>L${e.level} ${esc(e.title)}</h3><p>${echoKindNames[e.kind]} · 视角：${e.perspective === 'world' ? '世界' : holderNames[e.perspective]}</p>${e.gap ? `<p class="gaptext">GAP：${esc(e.gap)}</p>` : ''}<h4>读取</h4><div class="chips">${e.reads.map(k => chip(k)).join('')}</div><h4>分支（取第一条命中）</h4>${e.cases.map(c => `<div class="dt">${condChips(c.when)}<div class="reply">${esc(c.text)}</div></div>`).join('')}`;
  }
  if (sel.type === 'stage') {
    const s = p.stages.find(x => x.id === sel!.id) as Stage | undefined; if (!s) return '';
    return `<h3>${esc(s.title)}</h3><p>对话阶段：<code>${esc(s.dialogueStages.join(', '))}</code></p><p>目标：${esc(s.objective)}</p><h4>进入时写入</h4><div class="chips">${writeChips(s.sets)}</div><h4>推进条件</h4><p>${esc(s.advance)}</p><div class="chips">${s.gate.map(k => chip(k)).join('')}</div>`;
  }
  const a = p.optional.find(x => x.id === sel!.id); if (!a) return '';
  return `<h3>◇ ${esc(a.label)}</h3>${a.gap ? `<p class="gaptext">GAP：${esc(a.gap)}</p>` : ''}<h4>前置</h4><div class="chips">${condChips(a.requires)}</div><h4>写入</h4><div class="chips">${writeChips(a.sets)}</div>`;
}

function render() {
  const issues = validate(p);
  const body = tab === 'structure' ? structure() : tab === 'inputs' ? inputs() : tab === 'facts' ? factsView() : tab === 'sim' ? sim() : check(issues);
  const scroll = root.querySelector('.main')?.scrollTop ?? 0, scrollX = root.querySelector('.lane')?.scrollLeft ?? 0;
  root.innerHTML = `${header(issues)}<div class="body"><main class="main">${body}</main><aside class="detail">${detail()}</aside></div>`;
  const main = root.querySelector('.main'); if (main) main.scrollTop = scroll;
  const lane = root.querySelector('.lane'); if (lane) lane.scrollLeft = scrollX;
}

root.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const fact = t.closest<HTMLElement>('[data-fact]');
  if (fact) { const id = fact.dataset.fact!; sel = sel?.type === 'fact' && sel.id === id ? null : { type: 'fact', id }; render(); return; }
  const tabBtn = t.closest<HTMLElement>('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab as Tab; persist(); render(); return; }
  if (t.closest('[data-export]')) {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = p.id + '-pipeline.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  const preset = t.closest<HTMLElement>('[data-preset]');
  if (preset) {
    const x = p.presets.find(v => v.id === preset.dataset.preset);
    picks = x ? structuredClone(x.picks) : {}; toggles = new Set(x?.toggles ?? []); persist(); render(); return;
  }
  const s = t.closest<HTMLElement>('[data-sel]');
  if (s) { const [type, id] = s.dataset.sel!.split(':'); sel = { type: type as NonNullable<Sel>['type'], id }; render(); }
});
root.addEventListener('change', e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.pick !== undefined) {
    const w = p.windows.find(x => x.id === t.dataset.pick)!;
    if (w.multi) { const set = new Set(picks[w.id] ?? []); t.checked ? set.add(t.value) : set.delete(t.value); picks[w.id] = w.tags.map(x => x.id).filter(id => set.has(id)); }
    else picks[w.id] = t.value ? [t.value] : [];
    persist(); render();
  } else if (t.dataset.toggle) { t.checked ? toggles.add(t.dataset.toggle) : toggles.delete(t.dataset.toggle); persist(); render(); }
});
root.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.filter !== undefined) { factFilter = t.value; render(); const input = root.querySelector<HTMLInputElement>('[data-filter]'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }
});

render();
