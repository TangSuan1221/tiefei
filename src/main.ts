import {hasAbyssalSave} from './pod/sim/abyssal-save';
import './game/boot.css';
import { SaveManager } from './game/save';
import { installGmApi } from './pod/view/gm';
import { hasHarborSave } from './pod/sim/harbor-save';
import { hasLivingSave } from './pod/sim/living-save';

installGmApi();

/**
 * 引导入口。职责只有三件：起背景、起标题画面、在玩家按下"下潜"时
 * 动态加载真正的游戏会话（代码分割，标题画面的首屏因此非常轻）。
 */


const save = new SaveManager();
const meta = save.loadMeta();
// Validate the harbor payload; legacy procedural runs are not resumable here.
const hasRun = hasHarborSave() || hasLivingSave() || hasAbyssalSave();
// Keep rejected checkpoints discoverable so Continue can explain incompatibility.
const hasCheckpointRecord = (()=>{try{return ['ironlung.harbor.v1','ironlung.living.v1','ironlung.abyssal.v1'].some(k=>localStorage.getItem(k)!==null);}catch{return false;}})();
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

// 每次启动生成一个新种子，但玩家可以在"深度坐标"里输入旧的
const livingEntry = new URLSearchParams(location.search).get('level') === '2';

function openingLayers(): string {
  return `<video class="opening-video" autoplay muted loop playsinline preload="auto" poster="/assets/title/opening-background-poster.jpg" aria-hidden="true"><source src="/assets/title/opening-background.mp4" type="video/mp4" /></video>
    <img class="opening-art opening-crt-cutout" src="/assets/title/opening.png" alt="IRON WHALE 深潜器操作终端" draggable="false" />`;
}
function playOpeningVideo(): void {
  const video = document.querySelector<HTMLVideoElement>('.opening-video');
  if (video) { video.muted = true; void video.play().catch(() => { /* Poster remains available if autoplay is blocked. */ }); }
}
document.addEventListener('visibilitychange', () => {
  const video = document.querySelector<HTMLVideoElement>('.opening-video');
  if (document.hidden) video?.pause(); else playOpeningVideo();
});
renderTitle();

function renderTitle(): void {
  uiRoot.innerHTML = `
    <div class="title-screen crt-opening">
      ${openingLayers()}
      <nav class="crt-menu" aria-label="主菜单">
        <button class="crt-hit crt-start selected" data-id="new" aria-label="开始事故调查"><span class="sr-only">START · 开始事故调查</span></button>
        <button class="crt-hit crt-load" data-id="continue" aria-label="继续下潜" ${hasRun || hasCheckpointRecord ? '' : 'disabled'}><span class="sr-only">LOAD · 继续下潜</span></button>
        <button class="crt-hit crt-settings" data-id="options" aria-label="设置"><span class="sr-only">SETTINGS · 设置</span></button>
      </nav>
      ${crtSignalLayers()}
      <p class="crt-help" aria-live="polite">${livingEntry ? '第二关 · 生活区' : '接驳港 · 事故调查'} / ↑ ↓ 选择 · ENTER 确认${hasRun || hasCheckpointRecord ? '' : ' / 暂无存档'}</p>
      <dialog class="crt-options" aria-label="终端设置">
        <h2>终端设置</h2>
        <label><input type="checkbox" id="crt-motion" checked /> CRT 信号干扰</label>
        <button data-action="seed">指定调查种子</button>
        <button data-action="expedition">设施探索预览</button>
        <button data-action="archive" ${meta.cyclesPlayed ? '' : 'disabled'}>查看档案</button>
        <button data-action="close">返回 / ESC</button>
      </dialog>
    </div>`;
  const screen = uiRoot.querySelector<HTMLElement>('.crt-opening')!;
  const buttons = [...screen.querySelectorAll<HTMLButtonElement>('.crt-hit:not(:disabled)')];
  const select = (button: HTMLButtonElement) => {
    buttons.forEach(b => b.classList.toggle('selected', b === button));
  };
  buttons.forEach(button => {
    button.addEventListener('mouseenter', () => select(button));
    button.addEventListener('focus', () => select(button));
    button.addEventListener('click', () => {
      if (button.dataset.id === 'options') screen.querySelector<HTMLDialogElement>('dialog')!.showModal();
      else void onMenu(button.dataset.id!);
    });
  });
  screen.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).closest('dialog')) return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = buttons.findIndex(b => b.classList.contains('selected'));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus({preventScroll:true});
  });
  const dialog = screen.querySelector<HTMLDialogElement>('dialog')!;
  dialog.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      dialog.close();
      if (button.dataset.action !== 'close') void onMenu(button.dataset.action!);
    });
  });
  screen.querySelector<HTMLInputElement>('#crt-motion')!.addEventListener('change', event => {
    screen.classList.toggle('crt-still', !(event.target as HTMLInputElement).checked);
  });
  buttons[0].focus({preventScroll:true});
  playOpeningVideo();
}

async function onMenu(id: string): Promise<void> {
  switch (id) {
    case 'expedition':
      location.href = '/expedition.html';
      break;
    case 'new':
    case 'continue':
      if (id === 'continue' && !hasCheckpointRecord && !hasHarborSave() && !hasLivingSave() && !hasAbyssalSave()) {
        showBootLog(['没有有效的接驳港或第二关存档，或存档版本不兼容。', '原存档未修改；请选择开始事故调查。']);
        return;
      }
      await enterGame(id === 'continue');
      break;
    case 'seed': {
      const input = window.prompt('输入深度坐标（任意文本都会被转换为种子）：', '');
      if (input) {
        const { seedFromString } = await import('./core/rng');
        sessionStorage.setItem('ironlung.seedOverride', String(seedFromString(input)));
        await enterGame(false);
      }
      break;
    }
    case 'archive':
      showBootLog(['档案室尚未接通。', '请先完成至少一次轮回。']);
      break;
    case 'options':
      showBootLog(['设置面板由表现层模块提供，正在接入。']);
      break;
  }
}

let enteringGame = false;
function crtSignalLayers(): string {
  return '<div class="crt-signal" aria-hidden="true"><div class="crt-tear"></div><div class="crt-tear crt-echo"></div><div class="crt-interference"></div></div>';
}
async function enterGame(resume: boolean): Promise<void> {
  if (enteringGame) return;
  enteringGame = true;
  document.querySelector('.boot-log')?.remove();
  const currentVideo = document.querySelector<HTMLVideoElement>('.opening-video');
  const loading = document.createElement('div');
  loading.className = 'crt-loading-overlay';
  loading.innerHTML = `<div class="crt-loading-stage">
    ${openingLayers()}
    <section class="crt-loading-panel" aria-label="正在加载游戏" aria-busy="true">
      <div class="crt-loading-title">LOADING<span class="loading-dots">...</span></div>
      <div class="pixel-ocean" aria-hidden="true"><div class="pixel-sub-travel">
        <svg class="pixel-sub" viewBox="0 0 64 28" shape-rendering="crispEdges">
          <g fill="currentColor"><path d="M28 2h12v3h-8v5h-4zM24 8h14v5H24zM12 12h36v3h6v3h4v5h-7v3H16v-3h-6V12zM7 14h4v10H7zM3 11h4v6H3zM3 22h4v6H3z"/></g>
          <path fill="#06351b" d="M21 16h5v5h-5zM32 16h5v5h-5zM43 16h5v5h-5z"/>
        </svg><span class="pixel-bubbles">· · ·</span></div></div>
      <div class="crt-loading-track" role="progressbar" aria-label="启动阶段" aria-valuemin="0" aria-valuemax="100" aria-valuenow="8"><div class="crt-loading-fill"></div></div>
      <p class="crt-loading-status" role="status">连接生命支持系统</p>
    </section>${crtSignalLayers()}</div>`;
  if (document.querySelector('.crt-opening.crt-still')) loading.classList.add('crt-still');
  if (currentVideo) loading.querySelector('.opening-video')!.replaceWith(currentVideo);
  document.body.append(loading);
  playOpeningVideo();
  const loadingStarted = performance.now();
  const status = loading.querySelector<HTMLElement>('.crt-loading-status')!;
  const progress = (value: number, label: string) => {
    loading.style.setProperty('--load-progress', `${value}%`);
    loading.querySelector('[role="progressbar"]')!.setAttribute('aria-valuenow', String(value));
    status.textContent = label;
  };
  // Yield a painted frame before module parsing / scene construction.
  const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  try {
    progress(8, '连接生命支持系统');
    await paint();
    const mod = await import('./game/session');
    progress(30, '加载驾驶舱与下潜系统');
    await paint();
    await import('./pod/view/session');
    progress(72, resume ? '恢复航行记录' : '初始化调查航程');
    // Keep the boot animation readable on a warm cache, before simulation starts.
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (performance.now() - loadingStarted))));
    await paint();
    await mod.startSession(resume);
    progress(100, '系统就绪');
    await paint();
    currentVideo?.pause();
    loading.remove();
  } catch (err) {
    console.error('[boot] 会话启动失败', err);
    loading.querySelector('section')!.setAttribute('aria-busy', 'false');
    loading.classList.add('loading-failed');
    status.textContent = `加载失败：${err instanceof Error ? err.message : String(err)}。原存档保留。`;
    const back = document.createElement('button');
    back.className = 'crt-loading-back';
    back.textContent = '返回开局界面';
    back.onclick = () => location.reload();
    loading.querySelector('section')!.append(back);
    back.focus();
    enteringGame = false;
  }
}

function showBootLog(lines: string[]): HTMLElement {
  document.querySelector('.boot-log')?.remove();
  const box = el('div', 'boot-log');
  box.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  document.body.append(box);
  return box;
}

function appendLog(box: HTMLElement, text: string, cls: string): void {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  box.append(d);
}

function replaceLastLog(box: HTMLElement, text: string, cls: string): void {
  const last = box.lastElementChild as HTMLElement | null;
  if (!last) return appendLog(box, text, cls);
  last.className = cls;
  last.textContent = text;
}

function el(tag: string, cls: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
}

