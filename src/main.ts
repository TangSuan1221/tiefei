import './game/boot.css';
import { TitleBackground } from './game/titlebg';
import { SaveManager } from './game/save';
import { seedToCoords } from './core/rng';
import { formatDepth } from './core/util';
import { installGmApi } from './pod/view/gm';
import { hasHarborSave } from './pod/sim/harbor-save';

installGmApi();

/**
 * 引导入口。职责只有三件：起背景、起标题画面、在玩家按下"下潜"时
 * 动态加载真正的游戏会话（代码分割，标题画面的首屏因此非常轻）。
 */

const bg = new TitleBackground(document.getElementById('bg-canvas') as HTMLCanvasElement);
bg.start();

const save = new SaveManager();
const meta = save.loadMeta();
// Validate the harbor payload; legacy procedural runs are not resumable here.
const hasRun = hasHarborSave();
const uiRoot = document.getElementById('ui-root') as HTMLDivElement;

// 每次启动生成一个新种子，但玩家可以在"深度坐标"里输入旧的
const bootSeed = (Date.now() ^ (performance.now() * 1000)) >>> 0;

renderTitle();

function renderTitle(): void {
  const cycles = meta.cyclesPlayed;
  const endings = meta.endingsSeen.length;

  uiRoot.innerHTML = `
    <div class="title-screen">
      <div>
        <div class="title-mark">公司事故调查组 · 深潜器 KYRIE-9</div>
        <h1 class="title-cn">铁肺迷城</h1>
        <div class="title-en">Ironlung&nbsp;Maze</div>
        <p class="title-tag">
          <span>你受公司委派，下潜调查接驳港事故。</span>
          <span>核对救生舱，找回撤离记录，确认下行通道。</span>
          <span>声纳引路。实体快门曝光。冲洗后的影像，在分析台核验。</span>
        </p>
      </div>
      <nav class="menu" id="menu"></nav>
    </div>
  `;

  const menu = document.getElementById('menu') as HTMLElement;
  const items: { id: string; label: string; sub: string; disabled?: boolean }[] = [
    hasRun
      ? { id: 'continue', label: '继续下潜', sub: '恢复上次的呼吸' }
      : { id: 'continue', label: '继续下潜', sub: '无记录', disabled: true },
    { id: 'new', label: '开始事故调查', sub: '正式游戏 · 接驳港' },
    { id: 'expedition', label: '设施探索预览', sub: '独立测试场景 · 非正式剧情入口' },
    { id: 'seed', label: '输入深度坐标', sub: '指定种子' },
    { id: 'archive', label: '档案', sub: `${endings}/8 结局 · ${meta.knowledgeUnlocked.length} 条知识`, disabled: cycles === 0 },
    { id: 'options', label: '设置', sub: '' },
  ];

  menu.innerHTML = items
    .map(
      (it, i) => `
      <button class="menu-item" data-id="${it.id}" data-idx="${String(i + 1).padStart(2, '0')}"
              ${it.disabled ? 'disabled' : ''}>
        <span>${it.label}</span>
        <span class="sub">${it.sub}</span>
      </button>`,
    )
    .join('');

  menu.querySelectorAll<HTMLButtonElement>('.menu-item').forEach((btn) => {
    btn.addEventListener('mouseenter', () => bg.pulse());
    btn.addEventListener('click', () => onMenu(btn.dataset.id!));
  });

  renderCorners();
}

function renderCorners(): void {
  document.querySelectorAll('.corner, .boot-log').forEach((n) => n.remove());

  const tl = el('div', 'corner corner-tl');
  tl.innerHTML = `
    <span class="corner-row">舷外压力 <span class="hot">341.2 bar</span></span>
    <span class="corner-row">舱内含氧 <span class="hot">17.4%</span></span>
    <span class="corner-row">船体完整度 <span class="warn">0.61</span></span>`;

  const tr = el('div', 'corner corner-tr');
  tr.innerHTML = `
    <span class="corner-row">坐标 ${seedToCoords(bootSeed)}</span>
    <span class="corner-row">当前深度 <span class="depth-readout" id="depth">—</span></span>
    <span class="corner-row">轮回 #${String(meta.cyclesPlayed + 1).padStart(3, '0')}</span>`;

  const bl = el('div', 'corner corner-bl');
  bl.innerHTML = `<span class="corner-row">公司事故调查组 · 现场证据须核验</span>`;

  const br = el('div', 'corner corner-br');
  br.innerHTML = `<span class="corner-row">v0.1.0 · 垂直切片</span>`;

  document.body.append(tl, tr, bl, br);

  // 深度读数持续下沉，让标题画面不是一张静止的图
  const depthEl = document.getElementById('depth')!;
  const tickDepth = () => {
    depthEl.textContent = formatDepth(bg.depth);
    requestAnimationFrame(tickDepth);
  };
  tickDepth();
}

async function onMenu(id: string): Promise<void> {
  bg.pulse();
  switch (id) {
    case 'expedition':
      location.href = '/expedition.html';
      break;
    case 'new':
    case 'continue':
      if (id === 'continue' && !hasHarborSave()) {
        showBootLog(['没有有效的接驳港存档，或存档版本不兼容。', '原存档未修改；请选择开始事故调查。']);
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

async function enterGame(resume: boolean): Promise<void> {
  const log = showBootLog([]);
  const steps: [string, () => Promise<unknown>][] = [
    ['加载生命支持模拟', () => import('./game/session')],
  ];
  document.querySelector('.title-screen')?.classList.add('fade-out');

  for (const [label, fn] of steps) {
    appendLog(log, `${label} …`, 'pending');
    try {
      const mod = (await fn()) as { startSession?: (resume: boolean) => Promise<void> };
      replaceLastLog(log, `${label} … 就绪`, 'ok');
      if (mod.startSession) {
        bg.stop();
        await mod.startSession(resume);
        return;
      }
    } catch (err) {
      // 内容自检（重复节点 id、悬空引用、房间/道具覆盖不全）会在这里抛出。
      // 这是有意的快速失败，但报错必须说清是什么坏了 —— 早先这里吞掉了真实
      // 原因，只留下一句"仍在整合中"，排查时完全没有指向性。
      const msg = err instanceof Error ? err.message : String(err);
      replaceLastLog(log, `${label} … 失败`, 'bad');
      appendLog(log, msg, 'bad');
      appendLog(log, '这是一个内容或装配错误，不是缺失模块。详情见浏览器控制台。', 'pending');
      console.error('[boot] 会话启动失败', err);
      document.querySelector('.title-screen')?.classList.remove('fade-out');
      return;
    }
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
