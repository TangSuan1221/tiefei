import './style.css';
import { level01 } from './level-01';
import { level02 } from './level-02';
import { level03 } from './level-03';
import { level04 } from './level-04';
import { level05 } from './level-05';
import {
  type Cond, type Echo, type FactDef, type InputWindow, type Pipeline, type Shot, type Stage, type Tag, type Value, type Write,
  factRefs, holderNames, initialState, laterShots, layerNames, simulate, tagKind, tagWrites, validate,
} from './model';

export const pipelines: Pipeline[] = [level01, level02, level03, level04, level05];

const root = document.querySelector<HTMLDivElement>('#app')!;
const ACTIVE_KEY = 'story-pipeline:active-level';
let p: Pipeline = pipelines.find(x => x.id === localStorage.getItem(ACTIVE_KEY)) ?? pipelines[0];

type Tab = 'story' | 'structure' | 'inputs' | 'facts' | 'sim' | 'check';
type Sel = { type: 'fact' | 'window' | 'shot' | 'echo' | 'stage' | 'optional'; id: string } | null;

let tab: Tab = 'story';
let sel: Sel = null;
let picks: Record<string, string[]> = {};
let toggles = new Set<string>();
let factFilter = '';
let facts = new Map<string, FactDef>();

function loadPipelineState(target: Pipeline) {
  p = target;
  localStorage.setItem(ACTIVE_KEY, p.id);
  facts = new Map(p.facts.map(f => [f.key, f]));
  const storeKey = 'story-pipeline:v3:' + p.id;
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(storeKey) ?? '{}') as { picks?: Record<string, string[]>; toggles?: string[]; tab?: Tab }; }
    catch { return {}; }
  })();
  tab = saved.tab ?? tab;
  sel = null;
  picks = saved.picks ?? structuredClone(p.presets[0]?.picks ?? {});
  toggles = new Set<string>(saved.toggles ?? p.presets[0]?.toggles ?? []);
}

loadPipelineState(p);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const kindNames = { none: '不写事实', fact: '写事实·不经视频', video: '写事实·本关视频呈现', xvideo: '写事实·后续关卡视频呈现' } as const;
const echoKindNames: Record<Echo['kind'], string> = { line: '台词', log: '日志', objective: '目标', video: '视频', report: '报告' };
const fmtValue = (v: Value) => typeof v === 'string' ? v : JSON.stringify(v);
const condText = (c: Cond) => `${c.fact} ${c.op} ${fmtValue(c.value)}`;
const writeText = (w: Write) => w.op === 'add' ? `${w.fact} ${Number(w.value) >= 0 ? '+' : ''}${w.value}` : `${w.fact} = ${fmtValue(w.value)}`;

function persist() {
  localStorage.setItem('story-pipeline:v3:' + p.id, JSON.stringify({ picks, toggles: [...toggles], tab }));
}

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
    if (r.where.startsWith('shot:') ? later.has(r.where) : r.where.startsWith('echo:') || r.where.startsWith('stage:') || r.where.startsWith('optional:') || r.where.startsWith('quota:')) out.add(r.label);
  }
  return [...out];
}

function header(issues: ReturnType<typeof validate>) {
  const errors = issues.filter(i => i.level === 'error').length, warns = issues.length - errors;
  const tabs: [Tab, string][] = [
    ['story', '📖 完整故事与收容剧本'],
    ['sim', '🎬 实时选择推演'],
    ['structure', '剧情结构图'],
    ['inputs', '玩家对话表'],
    ['facts', '底层事实表'],
    ['check', `自动检查 ${errors ? `<b class="err">${errors}</b>` : ''}${warns ? `<b class="warn">${warns}</b>` : ''}`],
  ];
  const levelBtns = pipelines.map((pl, idx) => `<button data-level="${esc(pl.id)}" class="${pl.id === p.id ? 'on' : ''}">第${idx + 1}关 (${idx === 0 ? '0层' : `-${idx}层`}) · 必拍${pl.quota?.required ?? 0}卷</button>`).join('');
  return `<header class="top"><div><h1>剧情管线 · ${esc(p.title)}</h1><small>${esc(p.status)} · 设计 <code>${esc(p.sourceDoc)}</code></small>
  <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${levelBtns}</div></div>
  <nav>${tabs.map(([id, label]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('')}<button data-export>导出 JSON</button></nav></header>`;
}

function quotaBanner() {
  if (!p.quota) return '';
  const specs = p.quota.specimens.map(s => `<div class="card" style="flex:1 1 300px;border-left:3px solid #c2b5f0;padding:8px 10px">
    <b style="color:#ecd2a4;font-size:14px">📸 ${esc(s.id)} · ${esc(s.name)}</b>
    <div style="margin-top:5px;color:#c9d1d6"><b>为什么关灯停船没用：</b>${esc(s.trait)}</div>
    <div style="margin-top:3px;color:#a6b2b9"><b>它堵住了哪里：</b>${esc(s.blocker)}</div>
    <div style="color:#89d0e8;margin-top:4px"><b>怎么靠拍视频破局：</b>${esc(s.countermeasure)}</div>
  </div>`).join('');
  return `<section style="margin-bottom:14px;padding:12px 14px;background:#10171c;border:1px solid #2b3a44;border-radius:6px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <b style="font-size:14px;color:#f2c98a">🎯 总部黑匣子硬性要求：本关必须用延迟摄影拍够 <code>${p.quota.required}</code> 卷收容物（怪物）视频</b>
      <span class="warn">硬门禁：如果没拍够 ${p.quota.required} 卷，就算你把这一章的剧情和对话全部走完，通往下一层的门也绝对不会开！</span>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">${specs}</div>
  </section>`;
}

/** 新增：像读小说/电影剧本一样按先后顺序通顺阅读每一关的前因后果、对话分支与返回视频 */
function storyWalkthrough() {
  const result = simulate(p, picks, toggles);
  const presetBar = `<div style="margin-bottom:14px;padding:10px 14px;background:#141c22;border:1px solid #24323b;border-radius:6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div><b>切换不同玩法路线看剧情怎么变：</b> ${p.presets.map(x => `<button data-preset="${x.id}" style="margin-right:6px;background:#2b2216;border:1px solid #a77b3e;color:#f2c98a;padding:4px 10px;border-radius:4px">${esc(x.title)}</button>`).join('')}</div>
    <label style="cursor:pointer;color:#e6b450"><input type="checkbox" data-toggle="skip-quota" ${toggles.has('skip-quota') ? 'checked' : ''}> 模拟“只走完剧情但漏拍了怪物视频”（查看卡关阻断效果）</label>
  </div>`;
  const synopsisBox = p.synopsis ? `<section style="margin-bottom:14px;padding:12px 16px;background:#121a21;border-left:4px solid #ecd2a4;border-radius:4px;font-size:14px;line-height:1.7">
    <b style="color:#ecd2a4;display:block;margin-bottom:4px">📖 本章故事梗概（前因后果）</b>
    <div>${esc(p.synopsis)}</div>
  </section>` : '';

  const steps = result.events.map((ev, idx) => {
    const s = ev.stage;
    const dialogues = ev.inputs.map(i => `<div style="margin:8px 0;padding:8px 12px;background:#0d1318;border-left:3px solid #69b7d8;border-radius:4px">
      <div class="dim">🎙 <b>玩家麦克风对话（${esc(i.window.title)}）</b> · 当前选择：<b style="color:#89d0e8">${esc(i.tag?.label ?? '未说话')}</b></div>
      ${i.tag?.examples[0] ? `<div style="color:#a6b2b9;margin-top:3px">罗温说：“${esc(i.tag.examples[0])}”</div>` : ''}
      <div style="color:#ecd2a4;margin-top:4px;white-space:pre-line">${esc(i.reply)}</div>
    </div>`).join('');

    const videos = ev.shots.map(sh => {
      const sc = sh.shot.script;
      const slotHtml = sh.slots.map(sl => {
        const h = sl.hit;
        if (!h || (!h.zh && !h.dialogue && !h.storyBeat)) return '';
        return `<div style="margin-top:6px;padding:6px 10px;background:#0a1410;border-radius:4px">
          <div style="color:#dfe6ea;line-height:1.6">${esc(h.zh)}</div>
          ${h.dialogue ? `<div style="margin-top:5px;padding-left:8px;border-left:2px solid #ecd2a4;color:#ecd2a4;white-space:pre-line;line-height:1.6">${esc(h.dialogue)}</div>` : ''}
          ${h.storyBeat ? `<div style="margin-top:5px;color:#89d0e8;font-size:12px">${esc(h.storyBeat)}</div>` : ''}
        </div>`;
      }).join('');
      const scriptHtml = sc ? `<div style="margin-top:6px;padding:6px 10px;background:#0a1410;border-radius:4px">
        <div style="color:#dfe6ea;line-height:1.6">${esc(sc.visual)}</div>
        <div style="margin-top:5px;padding-left:8px;border-left:2px solid #ecd2a4;color:#ecd2a4;white-space:pre-line;line-height:1.6">${esc(sc.dialogue)}</div>
        <div style="margin-top:5px;color:#89d0e8;font-size:12px">${esc(sc.reveal)}</div>
      </div>` : '';
      return `<div style="margin:8px 0;padding:10px 12px;background:#0d1814;border-left:3px solid ${sh.shot.videoType === 'elias-story' ? '#b49ae0' : '#6fd0a0'};border-radius:4px">
        <div>🎞 <b style="color:${sh.shot.videoType === 'elias-story' ? '#d4c2f5' : '#6fd0a0'}">${esc(sh.shot.title)}</b> ${sh.shot.videoType ? `<span class="badge">${esc(sh.shot.videoType === 'elias-story' ? '📹 艾里亚斯/监控传回的剧情视频' : sh.shot.videoType === 'player-action' ? '潜艇操作结果视频' : '潜艇延迟摄影视频')}</span>` : ''}</div>
        <div class="dim" style="margin-top:2px">${esc(sh.shot.note)}</div>
        ${scriptHtml}${slotHtml}
      </div>`;
    }).join('');

    return `<section style="margin-bottom:16px;padding:14px 16px;background:#10171c;border:1px solid #1f2a31;border-radius:6px">
      <h3 style="margin:0 0 6px;color:#ecd2a4;font-size:15px">${esc(s.title)}</h3>
      ${s.narrative ? `<p style="margin:6px 0 10px;font-size:14px;line-height:1.75;color:#dfe6ea">${esc(s.narrative)}</p>` : ''}
      <div style="padding:6px 10px;background:#161f25;border-radius:4px;color:#a6b2b9;font-size:12px"><b>当前游戏任务提示：</b>${esc(s.objective)}</div>
      ${dialogues}
      ${videos}
      ${idx === result.events.length - 1 ? (result.canClearChapter
        ? `<div style="margin-top:10px;padding:10px 12px;background:#11261d;border:1px solid #2e6b4e;color:#6fd0a0;border-radius:4px"><b>✅ 本章通关结算：</b>你已拍够总部要求的全部 ${result.state['containment.captured']}/${result.state['containment.required']} 卷收容物视频，且完成了与艾里亚斯的逃生配合，通往下一层的门锁正式解开！</div>`
        : `<div style="margin-top:10px;padding:10px 12px;background:#2a1616;border:1px solid #7a2e2e;color:#ff6b5e;border-radius:4px"><b>⛔ 本章通关被黑匣子拦截（禁止通关）：</b>虽然你已经把本章的剧情和对话全部走完了，但你只拍了 ${result.state['containment.captured']}/${result.state['containment.required']} 卷收容物视频！总部黑匣子死死锁住了出口，你必须回去把漏掉的怪物视频拍够才能过关！</div>`) : ''}
    </section>`;
  }).join('');

  return `${presetBar}${synopsisBox}${quotaBanner()}${steps}`;
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
  const vtype = s.videoType ? `<span class="badge">${esc(s.videoType)}</span> ` : '';
  return `<div class="card shot${live ? ' live' : ''}${on}${touch('shot:' + s.id)}" data-sel="shot:${s.id}"><b>🎞 ${esc(s.id)} ${esc(s.title)}</b><small>${vtype}${live ? '受实时事实影响：' + s.slots.map(r => r.slot).join('、') : '物理与收容取证'}</small></div>`;
}

function structure() {
  const cols = p.stages.map((s, i) => {
    const on = sel?.type === 'stage' && sel.id === s.id ? ' on' : '';
    return `<section class="col"><header class="stage${on}${touch('stage:' + s.id)}" data-sel="stage:${s.id}"><em>${String(i + 1).padStart(2, '0')}</em> ${esc(s.title)}<small>${esc(s.dialogueStages.join(' / '))}</small></header>
    ${s.narrative ? `<p class="obj" style="color:#d9cdb8">${esc(s.narrative)}</p>` : ''}
    <p class="obj">${esc(s.objective)}</p>
    ${s.sets.length ? `<div class="sub">进入时写入</div><div class="chips">${writeChips(s.sets)}</div>` : ''}
    ${p.windows.filter(w => w.stage === s.id).map(windowCard).join('')}
    ${p.optional.filter(a => a.stage === s.id).map(a => `<div class="card opt${touch('optional:' + a.id)}" data-sel="optional:${a.id}"><b>◇ 可选：${esc(a.label)}</b>${gap(a.gap)}</div>`).join('')}
    ${p.shots.filter(x => x.stage === s.id).map(shotCard).join('')}
    <div class="sub">推进与通关门禁</div><p class="adv">${esc(s.advance)}</p><div class="chips">${s.gate.map(k => chip(k)).join('')}</div></section>`;
  }).join('<div class="arrow">→</div>');
  const levels = [1, 2, 3, 4, 5] as const;
  const echoes = levels.map(l => {
    const list = p.echoes.filter(e => e.level === l);
    return list.length ? `<div class="echo-col"><h3>${l === p.chapter ? '本关内实时呼应与门禁' : `第${['', '一', '二', '三', '四', '五'][l]}关跨关呼应`}</h3>${list.map(e => {
      const on = sel?.type === 'echo' && sel.id === e.id ? ' on' : '';
      return `<div class="card echo${on}${touch('echo:' + e.id)}" data-sel="echo:${e.id}"><b>${esc(e.title)}</b> <span class="badge">${echoKindNames[e.kind]}</span>${gap(e.gap)}<div class="chips">${e.reads.map(k => chip(k)).join('')}</div></div>`;
    }).join('')}</div>` : '';
  }).join('');
  return `${quotaBanner()}<div class="legend"><span class="k-none">● 不写事实</span><span class="k-fact">● 写事实·不经视频</span><span class="k-video">● 写事实·本关视频呈现</span><span class="k-xvideo">● 写事实·后续关卡视频呈现</span><span class="touch-w-demo">写入者</span><span class="touch-r-demo">读取者</span><span class="dim">点任意事实标签，高亮所有写入和读取它的地方</span></div>
  <div class="lane">${cols}</div><h2 class="sec">呼应片段与收容门禁</h2><div class="echoes">${echoes}</div>`;
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
  const toggleList = [
    ...(p.quota ? [{ id: 'skip-quota', label: '⚠️ 模拟未拍够收容物配额（测试通关阻断门禁）' }] : []),
    ...(p.facts.some(f => f.key === 'corpse.present') ? [{ id: 'corpse', label: '假设尸体模型已就位（GAP）' }] : []),
    ...p.optional.map(a => ({ id: a.id, label: '执行可选行为：' + a.label })),
  ];
  const gateStatus = result.canClearChapter
    ? `<div class="line" style="border-left:3px solid #6fd0a0;color:#6fd0a0"><b>✅ 章节通关判定：允许通关</b> · 总部收容物视频配额已达标（${result.state['containment.captured']}/${result.state['containment.required']}），且合作逃生剧情条件已完成。</div>`
    : `<div class="line" style="border-left:3px solid #ff6b5e;color:#ff6b5e"><b>⛔ 章节通关判定：禁止通关（硬门禁阻断）</b> · 即使剧情已推至终段，但缺失通关硬门禁：<code>${esc(result.missingGates.join(', '))}</code>（收容物已拍 ${result.state['containment.captured']}/${result.state['containment.required']}）。</div>`;
  const timeline = result.events.map(ev => `<div class="ev"><h3>${esc(ev.stage.title)} <small>${esc(ev.stage.objective)}</small></h3>
    ${ev.stage.narrative ? `<p style="margin:4px 0 8px;color:#d9cdb8">${esc(ev.stage.narrative)}</p>` : ''}
    ${ev.physical.length ? `<div class="line phys">物理 / 感知 / 配额写入：${writeChips(ev.physical)}</div>` : ''}
    ${ev.inputs.map(i => `<div class="line in"><b>🎙 ${esc(i.window.title)}：</b>${i.tag ? esc(i.tag.label) : ''} ${i.blocked ? '<span class="warn">前置不满足</span>' : ''}<div class="reply">${esc(i.reply)}</div>${i.changed.length ? `<div>写入：${writeChips(i.changed)}</div>` : ''}</div>`).join('')}
    ${ev.optional.map(o => `<div class="line"><b>◇ ${esc(o.action.label)}：</b>${o.done ? writeChips(o.changed) : '<span class="dim">未执行</span>'}</div>`).join('')}
    ${ev.shots.map(s => `<div class="line shot-line"><b>🎞 ${esc(s.shot.id)} ${esc(s.shot.title)}</b> ${s.shot.videoType ? `<span class="badge">${esc(s.shot.videoType)}</span>` : ''}${s.slots.length ? s.slots.map(x => `<div class="beat"><code>${esc(x.slot)}=${esc(x.hit?.key ?? '—')}</code> ${esc(x.hit?.zh ?? '')}<div class="en">${esc(x.hit?.en ?? '')}</div></div>`).join('') : `<span class="dim"> 物理与收容取证：${esc(s.shot.note)}</span>`}</div>`).join('')}
    ${ev.gateBlocked.length ? `<div class="line" style="color:#ff6b5e">⛔ 当前阶段门禁未满足：${ev.gateBlocked.map(g => chip(g)).join('')}</div>` : ''}</div>`).join('');
  const echoes = result.echoes.map(e => `<div class="line"><b>L${e.echo.level} ${esc(e.echo.title)}</b> ${gap(e.echo.gap)}<div class="reply">${esc(e.text ?? '（无匹配）')}</div></div>`).join('');
  const diff = p.facts.filter(f => result.state[f.key] !== init[f.key] && f.layer !== 'W');
  return `<div class="sim"><aside class="controls"><div class="presets">${p.presets.map(x => `<button data-preset="${x.id}">${esc(x.title)}</button>`).join('')}<button data-preset="">清空</button></div>
    ${toggleList.map(t => `<label class="opt-row"><input type="checkbox" data-toggle="${t.id}" ${toggles.has(t.id) ? 'checked' : ''}> ${esc(t.label)}</label>`).join('')}${controls}</aside>
    <div class="results">${gateStatus}<h2 class="sec">推演时间线（实时事实驱动视频与对白）</h2>${timeline}<h2 class="sec">呼应与门禁结果</h2>${echoes}
    <h2 class="sec">离关时的证据与非物理事实变化</h2><table><tbody>${diff.map(f => `<tr><td>${chip(f.key)}</td><td>${esc(fmtValue(init[f.key]))} → <b>${esc(fmtValue(result.state[f.key]))}</b></td><td>${f.life === 'persist' ? '<b>跨关</b>' : '关内'}</td></tr>`).join('') || '<tr><td class="dim">没有变化</td></tr>'}</tbody></table></div></div>`;
}

function check(issues: ReturnType<typeof validate>) {
  const tags = p.windows.flatMap(w => w.tags), kinds = { none: 0, fact: 0, video: 0, xvideo: 0 };
  p.windows.forEach(w => w.tags.forEach(t => kinds[tagKind(p, w, t)]++));
  const beatSlots = p.shots.flatMap(s => s.slots.map(r => ({ s, n: r.cases.length })));
  const combos = beatSlots.reduce((a, b) => a * b.n, 1);
  return `<div class="stats"><div><b>${p.facts.length}</b>事实</div><div><b>${p.quota?.required ?? 0}</b>收容物必拍配额</div><div><b>${p.windows.length}</b>输入窗口</div><div><b>${tags.length}</b>tag</div><div><b>${kinds.none}/${kinds.fact}/${kinds.video}/${kinds.xvideo}</b>不写 / 非视频 / 本关视频 / 后续关卡视频</div><div><b>${beatSlots.length}</b>卷动态视频槽位</div><div><b>${combos}</b>视频序列上限</div></div>
  <h2 class="sec">当前关卡自动检查</h2>${issues.length ? `<table><tbody>${issues.map(i => `<tr><td class="${i.level === 'error' ? 'err' : 'warn'}">${i.level === 'error' ? '错误' : '警告'}</td><td>${facts.has(i.where) ? chip(i.where) : esc(i.where)}</td><td>${esc(i.text)}</td></tr>`).join('')}</tbody></table>` : '<p>没有发现问题。</p>'}
  <h2 class="sec">全五关总览检查</h2><table><thead><tr><th>关卡</th><th>必拍收容物配额</th><th>事实数</th><th>窗口数</th><th>视频镜头数</th><th>错误 / 警告</th></tr></thead><tbody>${pipelines.map(pl => {
    const iss = validate(pl), err = iss.filter(x => x.level === 'error').length, warn = iss.length - err;
    return `<tr><td><b>${esc(pl.title)}</b></td><td><code>${pl.quota?.required ?? 0}</code> 卷 (${esc(pl.quota?.specimens.map(s => s.id).join(', ') ?? '')})</td><td>${pl.facts.length}</td><td>${pl.windows.length}</td><td>${pl.shots.length}</td><td>${err ? `<b class="err">${err} 错误</b>` : '<span style="color:#6fd0a0">0 错误</span>'} / ${warn} 警告</td></tr>`;
  }).join('')}</tbody></table>`;
}

function detail() {
  if (!sel) return `<h3>五关收容物取证与双人视频合作管线</h3><p>默认打开<b>「📖 完整故事与收容剧本」</b>页签，您可以按第一关到第五关的顺序，通顺阅读每一幕的前因后果、玩家对话与返回的视频内容。</p><ul><li><b>总部必拍配额硬门禁</b>：每关必须用延迟摄影拍够指定数量的收容物（怪物），没拍够就算走完剧情也绝不给过关。</li><li><b>为什么关灯停船没用</b>：每只怪物都堵在关键位置或有相反习性（比如第2关压载库门口的畏光鳗，你一关灯靠近它就扑上来咬，必须开强光逼退）。</li><li><b>双人视频逃生</b>：罗温开潜艇在外侧拍视频探路，艾里亚斯在内部人员通道开锁并回传视频。</li></ul>`;
  if (sel.type === 'fact') {
    const f = facts.get(sel.id); if (!f) return '';
    const r = factRefs(p, f.key);
    const link = (x: { where: string; label: string }) => { const [type, a, b] = x.where.split(':'); const target = type === 'tag' ? `window:${a}` : `${type}:${a}`; void b; return `<li><button class="link" data-sel="${esc(target)}">${esc(x.label)}</button></li>`; };
    return `<h3>${chip(f.key)}</h3><p>${layerNames[f.layer]}${f.holder ? ' · ' + holderNames[f.holder] : ''} · ${f.life === 'persist' ? '跨关持久' : '关内'}</p><p>类型：${f.type === 'enum' ? esc(f.values!.join(' | ')) : f.type === 'int' ? `${f.min}..${f.max}` : 'bool'}，初始 ${esc(fmtValue(f.initial))}</p><p>来源：${esc(f.source)}</p>${f.note ? `<p class="dim">${esc(f.note)}</p>` : ''}${f.gap ? `<p class="gaptext">GAP：${esc(f.gap)}</p>` : ''}
    <h4 class="w">写入者 ${r.writers.length}</h4><ul>${r.writers.map(link).join('') || '<li class="dim">无</li>'}</ul><h4 class="r">读取者 ${r.readers.length}</h4><ul>${r.readers.map(link).join('') || '<li class="warn">无读者</li>'}</ul>`;
  }
  if (sel.type === 'window') {
    const w = p.windows.find(x => x.id === sel!.id); if (!w) return '';
    return `<h3>🎙 ${esc(holderNames[w.speaker])} · ${esc(w.title)}</h3><p>开启：${esc(w.opens)}<br>结束：${esc(w.closes)}</p>${w.gap ? `<p class="gaptext">GAP：${esc(w.gap)}</p>` : ''}${w.tags.map(t => `<div class="dt"><b>${esc(t.label)}</b> ${badge(tagKind(p, w, t))}<div>${writeChips(tagWrites(t))}</div><div class="reply">${esc(t.reply || t.branches?.map(b => b.reply).join(' / '))}</div></div>`).join('')}<p><button class="link" data-tab="inputs">在“玩家对话表”中查看完整表格</button></p>`;
  }
  if (sel.type === 'shot') {
    const s = p.shots.find(x => x.id === sel!.id); if (!s) return '';
    const sc = s.script ? `<div class="dt"><div>${esc(s.script.visual)}</div><div class="reply" style="white-space:pre-line;margin-top:4px">${esc(s.script.dialogue)}</div><div style="color:#89d0e8;margin-top:4px">${esc(s.script.reveal)}</div></div>` : '';
    return `<h3>🎞 ${esc(s.id)} ${esc(s.title)}</h3><p class="dim">${esc(s.note)}</p><h4>物理槽位读取</h4><div class="chips">${s.reads.map(k => chip(k)).join('')}</div>${sc}${s.slots.map(r => `<h4>槽位 ${esc(r.slot)} ${gap(r.gap)}</h4>${r.cases.map(c => `<div class="dt"><code>${esc(c.key)}</code> ${condChips(c.when)}<div>${esc(c.zh)}</div>${c.dialogue ? `<div class="reply" style="white-space:pre-line;margin-top:4px">${esc(c.dialogue)}</div>` : ''}${c.storyBeat ? `<div style="color:#89d0e8;margin-top:4px">${esc(c.storyBeat)}</div>` : ''}<div class="en">${esc(c.en)}</div></div>`).join('')}`).join('') || (!sc ? '<p class="dim">物理与收容配额镜头。</p>' : '')}`;
  }
  if (sel.type === 'echo') {
    const e = p.echoes.find(x => x.id === sel!.id); if (!e) return '';
    return `<h3>L${e.level} ${esc(e.title)}</h3><p>${echoKindNames[e.kind]} · 视角：${e.perspective === 'world' ? '世界' : holderNames[e.perspective]}</p>${e.gap ? `<p class="gaptext">GAP：${esc(e.gap)}</p>` : ''}<h4>读取</h4><div class="chips">${e.reads.map(k => chip(k)).join('')}</div><h4>分支（取第一条命中）</h4>${e.cases.map(c => `<div class="dt">${condChips(c.when)}<div class="reply">${esc(c.text)}</div></div>`).join('')}`;
  }
  if (sel.type === 'stage') {
    const s = p.stages.find(x => x.id === sel!.id) as Stage | undefined; if (!s) return '';
    return `<h3>${esc(s.title)}</h3><p>对话阶段：<code>${esc(s.dialogueStages.join(', '))}</code></p>${s.narrative ? `<p style="color:#d9cdb8">${esc(s.narrative)}</p>` : ''}<p>目标：${esc(s.objective)}</p><h4>进入时写入</h4><div class="chips">${writeChips(s.sets)}</div><h4>推进与门禁条件</h4><p>${esc(s.advance)}</p><div class="chips">${s.gate.map(k => chip(k)).join('')}</div>`;
  }
  const a = p.optional.find(x => x.id === sel!.id); if (!a) return '';
  return `<h3>◇ ${esc(a.label)}</h3>${a.gap ? `<p class="gaptext">GAP：${esc(a.gap)}</p>` : ''}<h4>前置</h4><div class="chips">${condChips(a.requires)}</div><h4>写入</h4><div class="chips">${writeChips(a.sets)}</div>`;
}

function render() {
  const issues = validate(p);
  const body = tab === 'story' ? storyWalkthrough() : tab === 'structure' ? structure() : tab === 'inputs' ? inputs() : tab === 'facts' ? factsView() : tab === 'sim' ? sim() : check(issues);
  const scroll = root.querySelector('.main')?.scrollTop ?? 0, scrollX = root.querySelector('.lane')?.scrollLeft ?? 0;
  root.innerHTML = `${header(issues)}<div class="body"><main class="main">${body}</main><aside class="detail">${detail()}</aside></div>`;
  const main = root.querySelector('.main'); if (main) main.scrollTop = scroll;
  const lane = root.querySelector('.lane'); if (lane) lane.scrollLeft = scrollX;
}

root.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const levelBtn = t.closest<HTMLElement>('[data-level]');
  if (levelBtn) {
    const target = pipelines.find(x => x.id === levelBtn.dataset.level);
    if (target) { loadPipelineState(target); render(); }
    return;
  }
  const fact = t.closest<HTMLElement>('[data-fact]');
  if (fact) { const id = fact.dataset.fact!; sel = sel?.type === 'fact' && sel.id === id ? null : { type: 'fact', id }; render(); return; }
  const tabBtn = t.closest<HTMLElement>('[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab as Tab; persist(); render(); return; }
  if (t.closest('[data-export]')) {
    const blob = new Blob([JSON.stringify(pipelines, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'story-pipelines-all-5-levels.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
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
