import { GameLoop } from './loop';
import { InputManager } from './input';
import { SaveManager } from './save';
import { Bus } from '@/core/events';
import { Flags } from '@/core/flags';
import { Xoshiro, seedToCoords } from '@/core/rng';

/**
 * 游戏会话 —— 把各子系统接成一台机器。
 *
 * 各领域模块（sim / world / narrative / encounter / render / audio / ui）
 * 由独立的开发线并行推进，接入顺序不确定，所以这里用**能力探测**的方式装配：
 * 已到位的模块接进主循环，未到位的在诊断屏上标出缺口。
 * 这样整合期任何时刻都有一个可运行、可截图、可评审的构建。
 */

interface Subsystem {
  key: string;
  label: string;
  /** 模块路径。各领域并行开发中，未落地的路径在 glob 表里查不到。 */
  path: string;
  instance?: unknown;
  status: 'pending' | 'online' | 'missing';
  detail: string;
}

/**
 * 用 import.meta.glob 而不是写死的 import()：glob 只会匹配**实际存在**的文件，
 * 于是"模块尚未落地"是一次查表未命中，而不是一个编译错误。
 * 这让整合期的构建始终是绿的，各领域可以任意顺序接入。
 */
const MODULES = import.meta.glob('/src/{sim,world,narrative,encounter,render,audio,ui}/*.ts');

const SUBSYSTEMS: Omit<Subsystem, 'status' | 'detail'>[] = [
  { key: 'sim', label: '生命支持模拟', path: '/src/sim/vitals.ts' },
  { key: 'status', label: '状态效果库', path: '/src/sim/status.ts' },
  { key: 'veracity', label: '真实性层', path: '/src/sim/veracity.ts' },
  { key: 'director', label: '导演', path: '/src/sim/director.ts' },
  { key: 'world', label: '舱段拓扑', path: '/src/world/world.ts' },
  { key: 'sonar', label: '声呐阵列', path: '/src/world/sonar.ts' },
  { key: 'narrative', label: '叙事图', path: '/src/narrative/engine.ts' },
  { key: 'encounter', label: '遭遇解算', path: '/src/encounter/engine.ts' },
  { key: 'inventory', label: '载具清单', path: '/src/encounter/inventory.ts' },
  { key: 'render', label: '场景渲染', path: '/src/render/scene.ts' },
  { key: 'post', label: '后处理管线', path: '/src/render/post.ts' },
  { key: 'audio', label: '音频合成', path: '/src/audio/engine.ts' },
  { key: 'hud', label: '面罩投影', path: '/src/ui/hud.ts' },
];

export async function startSession(resume: boolean): Promise<void> {
  const bus = new Bus();
  const flags = new Flags(bus);
  const save = new SaveManager();
  const input = new InputManager();

  const override = sessionStorage.getItem('ironlung.seedOverride');
  const seed = override ? Number(override) >>> 0 : (Date.now() ^ 0x9e3779b9) >>> 0;
  sessionStorage.removeItem('ironlung.seedOverride');
  const rng = new Xoshiro(seed, 'run');

  const systems: Subsystem[] = SUBSYSTEMS.map((s) => ({ ...s, status: 'pending', detail: '' }));
  const ui = mountDiagnostics(seed, resume);

  await Promise.all(
    systems.map(async (s) => {
      const loader = MODULES[s.path];
      if (!loader) {
        s.status = 'missing';
        s.detail = '未接入';
      } else {
        try {
          const mod = (await loader()) as Record<string, unknown>;
          const exports = Object.keys(mod).filter((k) => k !== 'default');
          s.instance = mod;
          s.status = 'online';
          s.detail = exports.length ? `${exports.length} 个导出` : '空模块';
        } catch (err) {
          s.status = 'missing';
          s.detail = err instanceof Error ? err.message.slice(0, 40) : '加载失败';
        }
      }
      renderDiagnostics(ui, systems, seed);
    }),
  );

  const loop = new GameLoop({
    fixedUpdate: () => {
      // 各领域模块接入后，模拟步在这里驱动 VitalsSystem / WorldSystem / DirectorSystem
    },
    render: (dt) => {
      input.endFrame(dt * 1000);
      updateStats(ui, loop);
    },
  });
  loop.start();

  // 便于评审 Agent 与手工调试从控制台检视运行时
  Object.assign(window as unknown as Record<string, unknown>, {
    __ironlung: { bus, flags, save, input, rng, seed, systems, loop },
  });
}

function mountDiagnostics(seed: number, resume: boolean): HTMLElement {
  const root = document.getElementById('ui-root') as HTMLDivElement;
  root.innerHTML = `
    <div class="diag">
      <div class="diag-head">
        <span class="diag-title">KYRIE-9 · 系统自检</span>
        <span class="diag-seed">坐标 ${seedToCoords(seed)} · ${resume ? '恢复' : '冷启动'}</span>
      </div>
      <div class="diag-list" id="diag-list"></div>
      <div class="diag-foot" id="diag-foot"></div>
    </div>`;
  injectDiagnosticStyles();
  return root;
}

function renderDiagnostics(root: HTMLElement, systems: Subsystem[], seed: number): void {
  const list = root.querySelector('#diag-list');
  if (!list) return;
  const online = systems.filter((s) => s.status === 'online').length;
  list.innerHTML = systems
    .map(
      (s) => `
      <div class="diag-row ${s.status}">
        <span class="diag-dot"></span>
        <span class="diag-label">${s.label}</span>
        <span class="diag-key">${s.key}</span>
        <span class="diag-detail">${s.detail || '检测中…'}</span>
      </div>`,
    )
    .join('');
  const foot = root.querySelector('#diag-foot');
  if (foot) {
    foot.innerHTML = `<span>子系统 ${online}/${systems.length} 在线</span><span id="diag-fps"></span>`;
  }
}

function updateStats(root: HTMLElement, loop: GameLoop): void {
  const el = root.querySelector('#diag-fps');
  if (el) {
    el.textContent = `${loop.stats.fps.toFixed(0)} fps · 模拟 ${loop.stats.simHz.toFixed(0)} Hz · 帧 ${loop.stats.frameMs.toFixed(1)} ms`;
  }
}

function injectDiagnosticStyles(): void {
  if (document.getElementById('diag-style')) return;
  const style = document.createElement('style');
  style.id = 'diag-style';
  style.textContent = `
    .diag { width: min(680px, 90vw); font-family: var(--mono); animation: title-in 1s cubic-bezier(.16,1,.3,1) both; }
    .diag-head { display:flex; justify-content:space-between; align-items:baseline;
      padding-bottom:.9rem; margin-bottom:.4rem; border-bottom:1px solid rgba(216,210,196,.12); }
    .diag-title { font-size:.78rem; letter-spacing:.34em; color:var(--rust); text-transform:uppercase; }
    .diag-seed { font-size:.62rem; letter-spacing:.16em; color:#4b525a; }
    .diag-row { display:grid; grid-template-columns:10px 1fr auto auto; gap:1rem; align-items:center;
      padding:.5rem 0; border-bottom:1px solid rgba(216,210,196,.045); font-size:.76rem; letter-spacing:.1em; }
    .diag-dot { width:6px; height:6px; border-radius:50%; background:#2a3138; }
    .diag-row.online .diag-dot { background:#5b7a5e; box-shadow:0 0 8px rgba(91,122,94,.8); }
    .diag-row.missing .diag-dot { background:var(--blood); }
    .diag-row.pending .diag-dot { background:var(--rust-dim); animation:diag-blink 1s steps(2) infinite; }
    @keyframes diag-blink { 50% { opacity:.25 } }
    .diag-label { color:var(--bone); }
    .diag-row.missing .diag-label { color:#4b525a; }
    .diag-key { font-size:.6rem; color:#39414a; letter-spacing:.12em; }
    .diag-detail { font-size:.62rem; color:#4b525a; min-width:6ch; text-align:right; }
    .diag-row.missing .diag-detail { color:var(--blood); }
    .diag-foot { display:flex; justify-content:space-between; margin-top:1.2rem;
      font-size:.62rem; letter-spacing:.16em; color:#4b525a; }
  `;
  document.head.append(style);
}
