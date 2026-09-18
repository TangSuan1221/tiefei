/**
 * GM 指令台。
 * ============================================================================
 * 给测试用，不是给玩家用。开着的时候游戏规则不变，只改「片子从哪来」。
 *
 * 入口：
 *   屏幕右下角按钮「GM F10」
 *   按 F10
 *   控制台  GM('无视频模式')  或  GM.无视频模式()
 *
 * 无视频模式：拍摄仍走曝光 → 冲洗 → 线框分析，但**不请求视频接口**。
 * 冲出来的是这一卷的描述提示词，额度不动。
 */

import type { PodRun } from '../sim/run';

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
        ? 'GM · 无视频模式已开。拍摄只出提示词，接口额度不动。'
        : 'GM · 无视频模式已关。拍摄按原开关走视频接口。',
      'system',
    );
  }
  syncBadge();
  echo(on ? '无视频模式：开（拍摄 → 提示词，不走接口）' : '无视频模式：关');
  return on ? '无视频模式：开' : '无视频模式：关';
}

const HELP = [
  'GM 指令',
  '  无视频模式 [开|关]   拍摄只生成描述提示词，不消耗视频额度',
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

function ensureLauncher(): void {
  if (document.getElementById('gm-launch')) return;
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
  if (!isNoVideoMode()) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'gm-badge';
    el.textContent = 'GM · 无视频模式';
    document.body.append(el);
  }
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
  const input = box.querySelector('input') as HTMLInputElement;
  input.value = '';
  input.focus();
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
    <header>GM 指令台 · 输入「无视频模式」回车 · Esc 关闭</header>
    <div class="gm-log"><div>可用：无视频模式 [开|关]</div></div>
    <div class="gm-row"><span>›</span><input type="text" spellcheck="false" autocomplete="off" placeholder="无视频模式" /></div>
  `;
  document.body.append(box);
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
