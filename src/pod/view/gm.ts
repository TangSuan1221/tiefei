/**
 * GM 指令台。
 * ============================================================================
 * 给测试用，不是给玩家用。可显式调整艇体资源；持续供电只在当前游戏实例生效。
 *
 * 入口：
 *   屏幕右下角按钮「GM F10」（仅 ?debug 或 ?gm 时显示）
 *   按 F10
 *   控制台  GM('无视频模式')  或  GM.无视频模式()
 *
 * 无视频模式：拍摄仍走曝光 → 冲洗 → 线框分析，但**不请求视频接口**。
 * 第三关使用明确标注的合成调试片推进；首次调试授证后本局不保存到正式槽。
 */

import type { PodRun } from '../sim/run';
import {isAudioMuted,setAudioMuted} from '../../audio/mute';
import {createExpedition} from '../content/expedition';

const FLAG_KEY = 'ironlung.gm.novideo';

type GmHook = {
  run: () => PodRun | null;
  reinstallSink: () => void;
};

let hook: GmHook | null = null;

export function isNoVideoMode(): boolean {
  try {
    return sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function bindGm(next: GmHook): void {
  hook = next;
  ensureGmApi();
  syncBadge();
}

export function installGmApi(): void {
  ensureGmApi();
  syncBadge();
}

function persistNoVideo(on: boolean): void {
  try {
    sessionStorage.setItem(FLAG_KEY, on ? '1' : '0');
    window.dispatchEvent(new Event('ironlung-no-video-change'));
  } catch {
    /* 隐私模式 */
  }
}

function setNoVideo(on: boolean): string {
  persistNoVideo(on);
  hook?.reinstallSink();
  const run = hook?.run();
  if (run) {
    run.pushLog(
      on
        ? 'GM · 无视频模式已开。第一、二关剧情任务视频以文字自动推进；怪物底片在分析台按 3“诊断底片”；第三关使用合成调试片。首次诊断授证后转为测试局，不覆盖正式存档。不再提交或下载视频；已提交任务的费用无法撤销。'
        : 'GM · 无视频模式已关。拍摄按原开关走视频接口。',
      'system',
    );
  }
  syncBadge();
  echo(on ? '无视频模式：开（隔离诊断，不走接口）' : '无视频模式：关');
  return on ? '无视频模式：开' : '无视频模式：关';
}

const HELP = [
  'GM 指令',
  '  静音 [开|关]         关闭全部音效与台词朗读，保留字幕；刷新后记住设置',
  '  进入关卡 1—7        直接进入指定关卡（测试会话，不覆盖正式存档）',
  '  无视频模式 [开|关]   首二关分析台诊断，第三关合成片；不请求视频',
  '  第三关首次合成/分析后成为测试局，不覆盖正式存档；关闭GM不能把合成证据当正式通关。',
  '  怪物入侵 [秒数]     立即进入撞击预警；默认120秒后真实攻击（15–300秒）',
  '                       航行中会进入当前关卡；手动曝光才提交视频生成',
  '  不断电 [开|关]       持续满电，屏蔽断电；默认切换',
  '  电量/艇壳/氧气/进水/滤芯 0—100   设置百分比',
  '  补满电量 / 修复艇壳 / 补充氧气 / 排水 / 全面整备',
  '  潜艇状态             查询资源与不断电开关',
  '  不断电仅本次游戏生效；新游戏默认关闭，不复活已失败任务。',
  '  help                 本表',
  '',
  '控制台也可以：GM.无视频模式()  /  GM.无视频模式(false)',
].join('\n');

export function executeGm(raw: string): string {
  const text = raw.trim().replace(/^\/+/, '');
  if (!text || /^help$|^帮助$|^？$|^\?$/i.test(text)) {
    echo(HELP);
    return HELP;
  }

  const parts = text.split(/\s+/);
  const name = parts[0] ?? '';
  const arg = (parts[1] ?? '').toLowerCase();
  if(name==='静音'||name.toLowerCase()==='mute'){
    if(arg&&!['开','关','on','off','1','0','true','false'].includes(arg)){const result='用法：静音 开 / 静音 关';echo(result);return result;}
    setAudioMuted(arg?['开','on','1','true'].includes(arg):!isAudioMuted());
    const result=isAudioMuted()?'静音：开（音效与台词朗读已关闭，字幕保留）':'静音：关（声音已恢复）';
    echo(result);syncBadge();return result;
  }
  const resourceNames=['不断电','电量','艇壳','氧气','进水','滤芯','补满电量','修复艇壳','补充氧气','排水','全面整备','潜艇状态'];
  if(resourceNames.includes(name)){
    const run=hook?.run();let result='请先开始游戏。';
    if(run){
      const status=()=>{const v=run.vitals.vitals;return 'GM · 不断电：'+(run.gmInfinitePower?'开':'关')+' | 电量 '+Math.round(run.power*100)+'% | 艇壳 '+Math.round(run.hull*100)+'% | 氧气 '+Math.round(v.oxygen/v.oxygenMax*100)+'% | 进水 '+Math.round(run.flood*100)+'% | 滤芯 '+Math.round(run.scrubber*100)+'%';};
      const oxygen=(percent:number)=>{const v=run.vitals.vitals;run.vitals.restore({oxygen:v.oxygenMax*percent/100-v.oxygen});};
      if(name==='潜艇状态')result=status();
      else if(run.outcome.kind!=='alive')result='当前游戏已结束，请先新游戏或读取检查点；资源指令不会复活失败任务。';
      else if(name==='不断电'){
        if(arg&&!['开','关','on','off','1','0','true','false'].includes(arg))result='用法：不断电 开 / 不断电 关';
        else{run.gmInfinitePower=arg?['开','on','1','true'].includes(arg):!run.gmInfinitePower;run.power=1;run.blackout=false;result=status();}
      }else if(['电量','艇壳','氧气','进水','滤芯'].includes(name)){
        const value=Number(arg);
        if(!arg||!Number.isFinite(value)||value<0||value>100)result='请输入0—100之间的百分比，例如：电量 80';
        else if(name==='电量'&&run.gmInfinitePower)result='不断电已开启，电量锁定100%。先输入：不断电 关';
        else{if(name==='电量'){run.power=value/100;run.blackout=value===0;}if(name==='艇壳')run.hull=value/100;if(name==='氧气')oxygen(value);if(name==='进水')run.flood=value/100;if(name==='滤芯')run.scrubber=value/100;result=status();}
      }else{
        if(name==='补满电量'||name==='全面整备'){run.power=1;run.blackout=false;}
        if(name==='修复艇壳'||name==='全面整备')run.hull=1;
        if(name==='补充氧气'||name==='全面整备')oxygen(100);
        if(name==='排水'||name==='全面整备')run.flood=0;
        if(name==='全面整备')run.scrubber=1;
        result=status();
      }
      run.pushLog(result,'system');
    }
    echo(result);syncBadge();return result;
  }
  if(name==='进入关卡'||name==='关卡'||name.toLowerCase()==='level'){
    const result=hook?.run()?.gmEnterLevel(Number(arg))??'请先开始游戏。';echo(result);syncBadge();
    if(result.startsWith('GM · 已进入'))closeGmConsole();return result;
  }
  if(name==='怪物入侵'||name.toLowerCase()==='invasion'){
    const seconds=arg?Number(arg):120;
    const run=hook?.run();
    const result=!Number.isFinite(seconds)?'秒数必须是数字（15–300）。':run?run.gmInvasion(seconds):'请先开始游戏。';
    echo(result+(isNoVideoMode()?'\n注意：无视频模式已开启。输入「无视频模式 关」才会请求真实视频。':''));
    // This command starts an urgent encounter. Do not leave its modal input
    // focused, blocking every gameplay control while the attack clock runs.
    if(result.startsWith('GM · 怪物入侵：'))closeGmConsole();
    return result;
  }

  if (name === '无视频模式' || /^no-?video$/i.test(name) || name === 'novideo' || name === 'prompt') {
    if (arg === '开' || arg === 'on' || arg === '1' || arg === 'true') return setNoVideo(true);
    if (arg === '关' || arg === 'off' || arg === '0' || arg === 'false') return setNoVideo(false);
    return setNoVideo(!isNoVideoMode());
  }

  const miss = `未知指令「${text}」。输入 help。`;
  echo(miss);
  return miss;
}

function ensureGmApi(): void {
  const fn = Object.assign(
    (cmd?: string) => executeGm(String(cmd ?? 'help')),
    {
      无视频模式: (on?: boolean) => setNoVideo(on ?? !isNoVideoMode()),
      noVideo: (on?: boolean) => setNoVideo(on ?? !isNoVideoMode()),
      help: () => executeGm('help'),
      静音: (on?:boolean)=>executeGm('静音'+(on===undefined?'':on?' 开':' 关')),
      不断电: (on?:boolean)=>executeGm('不断电'+(on===undefined?'':on?' 开':' 关')),
      潜艇状态: ()=>executeGm('潜艇状态'),
      怪物入侵: (seconds=120) => executeGm(`怪物入侵 ${seconds}`),
      进入关卡: (level:number) => executeGm(`进入关卡 ${level}`),
    },
  );
  (window as unknown as { GM: typeof fn }).GM = fn;
  installHotkey();
  ensureLauncher();
  syncBadge();
}

function installHotkey(): void {
  const w = window as unknown as { __gmHotkey?: boolean };
  if (w.__gmHotkey) return;
  w.__gmHotkey = true;
  window.addEventListener(
    'keydown',
    (e) => {
      // F10 最稳。` 在中文输入法下经常变成别的字，所以也认 Backquote 键位。
      const open =
        e.code === 'F10' ||
        e.key === 'F10' ||
        e.code === 'Backquote' ||
        e.key === '`' ||
        e.key === '~';
      if (open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleGmConsole();
        return;
      }
      if (e.key === 'Escape') {
        if (closePromptPanel() || closeGmConsole()) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    },
    true,
  );
}

/** The on-screen GM button is a test affordance: shown only with ?debug (or ?gm); F10 and window.GM always work. */
function debugUi(): boolean {
  try { const q = new URLSearchParams(location.search); return q.has('debug') || q.has('gm'); } catch { return false; }
}

function ensureLauncher(): void {
  if (!debugUi() || document.getElementById('gm-launch')) return;
  const btn = document.createElement('button');
  btn.id = 'gm-launch';
  btn.type = 'button';
  btn.textContent = 'GM  F10';
  btn.title = '打开 GM 指令台';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleGmConsole();
  });
  document.body.append(btn);
}

function syncBadge(): void {
  let el = document.getElementById('gm-badge');
  const testing=!!hook?.run()?.gmLevelSession;
  const infinite=!!hook?.run()?.gmInfinitePower;
  const toggle=document.querySelector<HTMLButtonElement>('[data-gm="不断电"]');if(toggle){toggle.textContent='不断电：'+(infinite?'开':'关');toggle.setAttribute('aria-pressed',String(infinite));}
  const muteToggle=document.querySelector<HTMLButtonElement>('[data-gm="静音"]');if(muteToggle){muteToggle.textContent='静音：'+(isAudioMuted()?'开':'关');muteToggle.setAttribute('aria-pressed',String(isAudioMuted()));}
  if (!isNoVideoMode()&&!testing&&!infinite&&!isAudioMuted()) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'gm-badge';
    document.body.append(el);
  }
  el.textContent=['GM',testing?'选关测试（不保存）':'',isNoVideoMode()?'无视频':'',infinite?'不断电 ON':'',isAudioMuted()?'静音':''].filter(Boolean).join(' · ');

}

function echo(text: string): void {
  const log = document.querySelector('.gm-console .gm-log');
  if (log) {
    const line = document.createElement('div');
    line.textContent = text;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }
  console.info('[GM]\n' + text);
}

export function isGmConsoleOpen(): boolean {
  return !!document.querySelector('.gm-console:not(.hidden)');
}

export function toggleGmConsole(): void {
  const box = ensureConsole();
  const open = !box.classList.contains('hidden');
  if (open) {
    box.classList.add('hidden');
    (box.querySelector('input') as HTMLInputElement | null)?.blur();
    return;
  }
  box.classList.remove('hidden');
  syncBadge();
  if(document.pointerLockElement)document.exitPointerLock();
  const input = box.querySelector('input') as HTMLInputElement;
  input.value = '';
  (box.querySelector('button') as HTMLButtonElement|null)?.focus();
}

export function closeGmConsole(): boolean {
  const box = document.querySelector('.gm-console');
  if (!box || box.classList.contains('hidden')) return false;
  box.classList.add('hidden');
  (box.querySelector('input') as HTMLInputElement | null)?.blur();
  return true;
}

function ensureConsole(): HTMLElement {
  let box = document.querySelector('.gm-console') as HTMLElement | null;
  if (box) return box;
  box = document.createElement('div');
  box.className = 'gm-console hidden';
  box.innerHTML = `
    <header>GM 测试菜单 · Esc / F10 收起</header>
    <div class="gm-actions"><button type="button" data-gm="静音" aria-pressed="false">静音：关</button></div>
    <div class="gm-actions"><button type="button" data-gm="怪物入侵">怪物入侵</button><button type="button" data-gm="无视频模式">切换无视频模式</button><button type="button" data-close>收起</button></div>
    <div class="gm-actions"><button type="button" data-gm="不断电">不断电：关</button><button type="button" data-gm="补满电量">补满电量</button><button type="button" data-gm="修复艇壳">修复艇壳</button><button type="button" data-gm="补充氧气">补充氧气</button><button type="button" data-gm="排水">排水</button><button type="button" data-gm="全面整备">全面整备</button><button type="button" data-gm="潜艇状态">潜艇状态</button><button type="button" data-gm="help">指令帮助</button></div>
    <div class="gm-levels">${Array.from({length:7},(_,i)=>`<button type="button" data-gm="进入关卡 ${i+1}">第${i+1}关 · ${createExpedition(i).name}</button>`).join('')}</div>
    <div class="gm-log"><div>选关会重置目标关卡机关，保留艇体资源；测试会话不覆盖正式存档。不会自动请求视频。</div></div>
    <div class="gm-row"><span>›</span><input type="text" spellcheck="false" autocomplete="off" placeholder="例如：不断电 开 / 电量 80 / help" /></div>
  `;
  document.body.append(box);
  box.querySelectorAll<HTMLButtonElement>('[data-gm]').forEach(btn=>btn.addEventListener('click',()=>executeGm(btn.dataset.gm!)));
  box.querySelector('[data-close]')?.addEventListener('click',()=>closeGmConsole());
  const input = box.querySelector('input') as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeGmConsole();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      if (v.trim()) executeGm(v);
    }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  return box;
}

const prompts = new Map<string, string>();

export function storePrompt(legId: string, prompt: string): void {
  prompts.set(legId, prompt);
}

export function promptFor(legId: string): string | undefined {
  return prompts.get(legId);
}

export function openPromptPanel(prompt: string, title = '本卷提示词'): void {
  closePromptPanel();
  const panel = document.createElement('div');
  panel.className = 'gm-prompt';
  panel.innerHTML = `
    <header>
      <span>GM · 无视频模式 · ${title}</span>
      <span class="gm-prompt-actions">
        <button type="button" data-act="copy">复制</button>
        <button type="button" data-act="close">关闭</button>
      </span>
    </header>
    <pre></pre>
  `;
  const pre = panel.querySelector('pre')!;
  pre.textContent = prompt;
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('wheel', (e) => e.stopPropagation());
  panel.querySelector('[data-act="close"]')?.addEventListener('click', () => closePromptPanel());
  panel.querySelector('[data-act="copy"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      const btn = panel.querySelector('[data-act="copy"]') as HTMLButtonElement;
      btn.textContent = '已复制';
      window.setTimeout(() => {
        btn.textContent = '复制';
      }, 1200);
    } catch {
      echo('复制失败。提示词已打进控制台。');
    }
  });
  document.body.append(panel);
  console.info('[GM] 无视频模式 · 本卷提示词\n' + prompt);
}

export function closePromptPanel(): boolean {
  const el = document.querySelector('.gm-prompt');
  if (!el) return false;
  el.remove();
  return true;
}

export function revealPrompt(legId: string): void {
  const p = prompts.get(legId);
  if (p && isNoVideoMode()) openPromptPanel(p, legId);
}
