/**
 * 表现层演示沙盒
 * ============================================================================
 * 用假数据驱动**全部**渲染 / 音频 / UI，让 Agent E 的交付物在其他系统完成之前
 * 就能被独立验证与评审。
 *
 *   URL: http://localhost:5173/src/render/demo/index.html
 *
 * 面板上的每一根滑块都直连一个真实参数，没有装饰性控件。
 * `window.__demo` 暴露给自动化截图使用。
 */

import type { LogTone, RenderFrame, StatusEffect, Vitals } from '../../core/contract';
import { clamp, clamp01, damp, lerp } from '../../core/util';
import { valueNoise2 } from '../../core/rng';
import { AudioEngine } from '../../audio/engine';
import { BreathClock } from '../../audio/breath';
import { CUE_COUNT } from '../../audio/cues';
import { HudRenderer, type HudLogLine } from '../../ui/hud';
import { PanelRenderer, type PanelKind, type PanelState } from '../../ui/panels';
import { DEFAULT_EXTRAS, DEFAULT_POST, POST_CHANNELS, PostPipeline, derivePost, type PostExtras } from '../post';
import { SceneRenderer } from '../scene';
import { assertNoHorrorGreen } from '../palette';
import {
  DEMO_DIALOGUE, DEMO_INVENTORY, DEMO_LOG, DEMO_STATUSES,
  baseVitals, buildDemoWorld, fakeSonar,
} from './fixtures';

// ============================================================================
// 状态
// ============================================================================

const world = buildDemoWorld();
const vitals: Vitals = baseVitals();

const S = {
  depth: 412,
  flooding: 0.18,
  torch: 0.78,
  power: 0.86,
  noise: 0.24,
  /** 0 = 跟随 SAN 自动推导 */
  corruptionManual: -1,
  holding: false,
  renderScale: 1.0,
  masterGain: 0.8,
  manualPost: false,
  autoSan: false,
  panel: null as PanelKind,
  panelOpen: 0,
  panelTarget: 0,
  showHud: true,
  paused: false,
};

const post = { ...DEFAULT_POST, tint: [1, 1, 1] as [number, number, number] };
const extras: PostExtras = { ...DEFAULT_EXTRAS };

const statuses: StatusEffect[] = DEMO_STATUSES.slice();
const hudLog: HudLogLine[] = [];
let highlighted: string[] = [];

// ============================================================================
// 子系统
// ============================================================================

const outCanvas = document.getElementById('out') as HTMLCanvasElement;
const pipeline = new PostPipeline(outCanvas);
const scene = new SceneRenderer();
const hud = new HudRenderer();
const panels = new PanelRenderer();
const audio = new AudioEngine();
const breath = new BreathClock();
audio.attachBreath(breath);

const bad = assertNoHorrorGreen();
if (bad.length) console.error('[palette] 检测到恐怖游戏绿：', bad);

// ============================================================================
// 控制面板
// ============================================================================

type SliderSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  fmt?: (v: number) => string;
  postDriven?: boolean;
};

const panelEl = document.getElementById('panel') as HTMLElement;
const readoutEl = document.getElementById('readout') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;
const sliderRefs: { spec: SliderSpec; input: HTMLInputElement; out: HTMLOutputElement }[] = [];

function group(title: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'p-group';
  const h = document.createElement('h3');
  h.textContent = title;
  d.appendChild(h);
  panelEl.appendChild(d);
  return d;
}

function slider(parent: HTMLElement, spec: SliderSpec): void {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('label');
  label.textContent = spec.label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(spec.get());
  const out = document.createElement('output');
  const fmt = spec.fmt ?? ((v: number) => v.toFixed(2));
  out.textContent = fmt(spec.get());
  input.addEventListener('input', () => {
    spec.set(parseFloat(input.value));
    out.textContent = fmt(parseFloat(input.value));
  });
  row.append(label, input, out);
  parent.appendChild(row);
  sliderRefs.push({ spec, input, out });
}

function button(parent: HTMLElement, text: string, fn: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  if (cls) b.className = cls;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  parent.appendChild(b);
  return b;
}

function buttonGrid(parent: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = 'btns';
  parent.appendChild(d);
  return d;
}

function checkbox(parent: HTMLElement, text: string, get: () => boolean, set: (v: boolean) => void): void {
  const l = document.createElement('label');
  l.className = 'chk';
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = get();
  i.addEventListener('change', () => set(i.checked));
  const s = document.createElement('span');
  s.textContent = text;
  l.append(i, s);
  parent.appendChild(l);
}

function buildPanel(): void {
  const title = document.createElement('p');
  title.className = 'p-title';
  title.textContent = 'IRONLUNG MAZE · AGENT E';
  const sub = document.createElement('p');
  sub.className = 'p-sub';
  sub.textContent = `表现层沙盒 — ${POST_CHANNELS.length} 个后处理通道 / ${CUE_COUNT} 个程序化音效`;
  panelEl.append(title, sub);

  // ---- 预设 ----
  const gp = group('取景预设');
  const gpb = buttonGrid(gp);
  button(gpb, '① 清明态', () => preset('lucid'));
  button(gpb, '② 共鸣态', () => preset('resonance'));
  button(gpb, '③ 声呐脉冲', () => preset('sonar'));
  button(gpb, '④ CO₂ 隧道', () => preset('tunnel'));
  button(gpb, '⑤ 淹没 · 断电', () => preset('flood'));
  button(gpb, '⑥ 对话面板', () => preset('dialogue'));

  // ---- 生理 ----
  const gv = group('生理 / VITALS');
  slider(gv, { key: 'san', label: '理智 SAN', min: 0, max: 100, step: 1, get: () => vitals.san, set: (v) => (vitals.san = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'fear', label: '恐惧', min: 0, max: 100, step: 1, get: () => vitals.fear, set: (v) => (vitals.fear = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'co2', label: 'CO₂', min: 0, max: 100, step: 1, get: () => vitals.co2, set: (v) => (vitals.co2 = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'oxy', label: '氧气', min: 0, max: 900, step: 1, get: () => vitals.oxygen, set: (v) => (vitals.oxygen = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'inf', label: '感染', min: 0, max: 100, step: 1, get: () => vitals.infection, set: (v) => (vitals.infection = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'tra', label: '外伤', min: 0, max: 100, step: 1, get: () => vitals.trauma, set: (v) => (vitals.trauma = v), fmt: (v) => v.toFixed(0) });
  slider(gv, { key: 'tmp', label: '体温', min: 28, max: 38, step: 0.1, get: () => vitals.coreTemp, set: (v) => (vitals.coreTemp = v), fmt: (v) => `${v.toFixed(1)}°` });
  const gvb = buttonGrid(gv);
  const holdBtn = button(gvb, '屏息 [SPACE]', () => setHold(!S.holding));
  button(gvb, '大喘气', () => {
    setHold(false);
    audio.cue('breath.gasp', { gain: 1 });
    pushLog('你憋不住了。整条走廊都听见了。', 'bad');
    S.noise = 1;
  });
  button(gvb, 'SAN 100→0', () => {
    S.autoSan = !S.autoSan;
    if (S.autoSan) vitals.san = 100;
  });
  button(gvb, '重置', () => {
    Object.assign(vitals, baseVitals());
    S.autoSan = false;
    syncSliders();
  });

  // ---- 环境 ----
  const ge = group('环境 / WORLD');
  slider(ge, { key: 'depth', label: '深度 m', min: 340, max: 2100, step: 1, get: () => S.depth, set: (v) => (S.depth = v), fmt: (v) => v.toFixed(0) });
  slider(ge, { key: 'flood', label: '水位', min: 0, max: 1, step: 0.01, get: () => S.flooding, set: (v) => (S.flooding = v) });
  slider(ge, { key: 'torch', label: '手电', min: 0, max: 1, step: 0.01, get: () => S.torch, set: (v) => (S.torch = v) });
  slider(ge, { key: 'power', label: '供电', min: 0, max: 1, step: 0.01, get: () => S.power, set: (v) => (S.power = v) });
  slider(ge, { key: 'noise', label: '房间噪音', min: 0, max: 1, step: 0.01, get: () => S.noise, set: (v) => (S.noise = v) });
  const geb = buttonGrid(ge);
  button(geb, '声呐 · 短脉冲', () => ping(0.45));
  button(geb, '声呐 · 全功率', () => ping(0.95));
  button(geb, '船体呻吟', () => audio.cue('hull.groan', { gain: 0.9, pan: -0.3 }));
  button(geb, '它的呼唤', () => {
    audio.cue('listener.call', { gain: 0.9 });
    pushLog('某个非常大的东西，在很远的地方，回应了。', 'eerie');
  });

  // ---- 界面 ----
  const gu = group('界面 / UI');
  const gub = buttonGrid(gu);
  button(gub, '对话 [1]', () => togglePanel('dialogue'));
  button(gub, '背包 [2]', () => togglePanel('inventory'));
  button(gub, '地图 [3]', () => togglePanel('map'));
  button(gub, '日志 [4]', () => togglePanel('log'));
  button(gub, 'HUD 开关', () => (S.showHud = !S.showHud), 'wide');
  checkbox(gu, '手动覆盖后处理参数', () => S.manualPost, (v) => { S.manualPost = v; syncPostSliders(); });

  // ---- 后处理 ----
  const gpo = group('后处理 / POST');
  type NumericPostKey = Exclude<keyof typeof post, 'tint'>;
  const P: [string, NumericPostKey, number, number][] = [
    ['曝光', 'exposure', 0, 2],
    ['泛光', 'bloom', 0, 2],
    ['颗粒', 'grain', 0, 1.5],
    ['扫描线', 'scanline', 0, 1],
    ['桶形畸变', 'barrel', 0, 0.6],
    ['色差', 'aberration', 0, 2],
    ['晕影', 'vignette', 0, 1],
    ['SAN 扭曲', 'warp', 0, 1.5],
    ['焦散', 'caustics', 0, 1.5],
    ['静电', 'static', 0, 1],
    ['呼吸起伏', 'breathe', 0, 2],
    ['CO₂ 隧道', 'tunnel', 0, 1],
  ];
  for (const [label, key, min, max] of P) {
    slider(gpo, {
      key: `post.${key}`, label, min, max, step: 0.01, postDriven: true,
      get: () => post[key],
      set: (v) => { post[key] = v; S.manualPost = true; },
    });
  }
  slider(gpo, { key: 'scale', label: '渲染倍率', min: 0.5, max: 1.6, step: 0.05, get: () => S.renderScale, set: (v) => (S.renderScale = v) });

  // ---- 音频 ----
  const ga = group('音频 / AUDIO');
  slider(ga, { key: 'vol', label: '主音量', min: 0, max: 1, step: 0.01, get: () => S.masterGain, set: (v) => { S.masterGain = v; audio.setMasterGain(v); } });
  const gab = buttonGrid(ga);
  for (const name of ['hull.crack', 'water.splash', 'door.force', 'san.choir', 'ritual.bell', 'listener.scream', 'radio.voice', 'debunk.success']) {
    button(gab, name.split('.')[1], () => audio.cue(name, { gain: 0.9, pan: (Math.sin(performance.now() * 0.001) * 0.6) }));
  }
  const gabb = buttonGrid(ga);
  for (const b of ['hull', 'machinery', 'flooded', 'chapel', 'void', 'bridge']) {
    button(gabb, `床 · ${b}`, () => { audio.ambience(b, 0.55); pushLog(`环境音床 → ${b}`, 'system'); });
  }

  // 让屏息按钮能反映状态
  setInterval(() => holdBtn.classList.toggle('on', S.holding), 120);
}

function syncSliders(): void {
  for (const r of sliderRefs) {
    if (r.spec.postDriven && !S.manualPost) continue;
    const v = r.spec.get();
    r.input.value = String(v);
    r.out.textContent = (r.spec.fmt ?? ((x: number) => x.toFixed(2)))(v);
  }
}

function syncPostSliders(): void {
  for (const r of sliderRefs) {
    if (!r.spec.postDriven) continue;
    r.input.disabled = !S.manualPost;
    const v = r.spec.get();
    r.input.value = String(v);
    r.out.textContent = (r.spec.fmt ?? ((x: number) => x.toFixed(2)))(v);
  }
}

// ============================================================================
// 交互
// ============================================================================

function setHold(on: boolean): void {
  if (S.holding === on) return;
  S.holding = on;
  breath.holding = on;
  audio.setHoldBreath(on);
  pushLog(on ? '你合上嘴。世界被闷住了。' : '你重新开始呼吸。', on ? 'system' : 'neutral');
}

function ping(power: number): void {
  const result = fakeSonar(world.rooms, world.currentRoomId, power);
  scene.applySonar(result, world.rooms, world.currentRoomId, power);
  highlighted = result.revealed.slice(0, 6);
  // 多抽头回波：延迟按「名义距离 ×2 / 1500 m·s⁻¹」算，声像按方位
  const me = world.rooms.find((r) => r.id === world.currentRoomId)!;
  const echoes = result.revealed.slice(0, 9).map((id) => {
    const r = world.rooms.find((x) => x.id === id)!;
    const dx = r.pos.x - me.pos.x;
    const dy = (r.deck - me.deck) * 1.8;
    const dist = Math.hypot(dx, dy) * 14 + 6;
    return {
      delay: clamp((dist * 2) / 1500 + 0.05, 0.02, 2.4) * 4,
      gain: clamp01(0.55 / (1 + dist * 0.06)),
      pan: clamp(dx / 4, -1, 1),
    };
  });
  audio.sonarPing(power, echoes);
  S.noise = Math.min(1, S.noise + (power > 0.6 ? 0.55 : 0.22));
  pushLog(
    power > 0.6
      ? `全功率脉冲。${result.revealed.length} 个回波返回，其中 ${result.artifacts.length} 个对不上。`
      : `短脉冲。${result.revealed.length} 个回波。`,
    result.anomalies.length > 0 ? 'eerie' : 'neutral',
  );
  if (result.anomalies.length) {
    const a = result.anomalies[0];
    pushLog(`方位不明的异常回波：${a.signature}`, 'bad');
  }
}

function togglePanel(kind: PanelKind): void {
  if (S.panel === kind && S.panelTarget > 0) {
    S.panelTarget = 0;
    audio.cue('ui.back', { gain: 0.5 });
  } else {
    S.panel = kind;
    S.panelTarget = 1;
    audio.cue('ui.page', { gain: 0.6 });
  }
}

function pushLog(text: string, tone: LogTone): void {
  hudLog.push({ text, tone, at: clock });
  if (hudLog.length > 40) hudLog.shift();
}

const PRESETS: Record<string, () => void> = {
  lucid() {
    Object.assign(vitals, baseVitals(), { san: 96, fear: 18, co2: 10, oxygen: 742 });
    Object.assign(S, { depth: 412, flooding: 0.16, torch: 0.82, power: 0.9, noise: 0.20, holding: false, manualPost: false });
    S.panelTarget = 0;
    setHold(false);
    pushLog('舱内一切正常。这句话你上一轮也写过。', 'neutral');
    ping(0.45);
  },
  resonance() {
    Object.assign(vitals, baseVitals(), { san: 6, fear: 88, co2: 34, oxygen: 190, infection: 42, trauma: 36, coreTemp: 33.4 });
    Object.assign(S, { depth: 1880, flooding: 0.42, torch: 0.42, power: 0.55, noise: 0.62, manualPost: false });
    S.panelTarget = 0;
    pushLog('唱诗班在唱你的名字。你听出了自己的声部。', 'whisper');
    pushLog('地图上多了一个舱。它一直在那儿。', 'eerie');
    ping(0.95);
  },
  sonar() {
    Object.assign(vitals, baseVitals(), { san: 58, fear: 52, co2: 22, oxygen: 480 });
    Object.assign(S, { depth: 1120, flooding: 0.28, torch: 0.6, power: 0.85, noise: 0.45, manualPost: false });
    S.panelTarget = 0;
    ping(0.95);
  },
  tunnel() {
    Object.assign(vitals, baseVitals(), { san: 40, fear: 92, co2: 94, oxygen: 96, trauma: 28 });
    Object.assign(S, { depth: 1460, flooding: 0.33, torch: 0.5, power: 0.7, noise: 0.5, manualPost: false });
    S.panelTarget = 0;
    setHold(true);
    breath.holdTime = 11.5;
    pushLog('视野在收。你能听见自己的血。', 'bad');
  },
  flood() {
    Object.assign(vitals, baseVitals(), { san: 32, fear: 74, co2: 48, oxygen: 260, coreTemp: 31.8 });
    Object.assign(S, { depth: 2020, flooding: 0.86, torch: 0.9, power: 0.12, noise: 0.35, manualPost: false });
    S.panelTarget = 0;
    audio.ambience('flooded', 0.7);
    pushLog('主配电掉了。只剩下手电。', 'bad');
  },
  dialogue() {
    Object.assign(vitals, baseVitals(), { san: 44, fear: 46, co2: 20, oxygen: 520 });
    Object.assign(S, { depth: 980, flooding: 0.22, torch: 0.7, power: 0.8, noise: 0.3, manualPost: false });
    S.panel = 'dialogue';
    S.panelTarget = 1;
    audio.cue('radio.squelch', { gain: 0.7 });
  },
};

function preset(name: string): void {
  PRESETS[name]?.();
  syncSliders();
}

// ============================================================================
// 主循环
// ============================================================================

let clock = 0;
let last = performance.now();
const fpsBuf: number[] = [];
let fps = 60;
let frames = 0;

function resize(): void {
  const cssW = outCanvas.clientWidth || window.innerWidth;
  const cssH = outCanvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.round(cssW * Math.min(dpr, 1.5) * S.renderScale);
  let h = Math.round(cssH * Math.min(dpr, 1.5) * S.renderScale);
  const MAXPX = 2_600_000; // ~1920×1350，超过就按比例缩
  const px = w * h;
  if (px > MAXPX) {
    const k = Math.sqrt(MAXPX / px);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  pipeline.resize(w, h);
  scene.resize(w, h);
  hud.resize(w, h);
}

let lastW = 0;
let lastH = 0;
let lastScale = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!S.paused) clock += dt;
  frames++;

  fpsBuf.push(dt);
  if (fpsBuf.length > 90) fpsBuf.shift();
  const avg = fpsBuf.reduce((a, b) => a + b, 0) / Math.max(1, fpsBuf.length);
  fps = 1 / Math.max(1e-6, avg);

  // 尺寸
  const cw = outCanvas.clientWidth;
  const ch = outCanvas.clientHeight;
  if (cw !== lastW || ch !== lastH || S.renderScale !== lastScale) {
    lastW = cw;
    lastH = ch;
    lastScale = S.renderScale;
    resize();
  }

  // --- SAN 自动扫描 ---
  if (S.autoSan) {
    vitals.san = Math.max(0, vitals.san - dt * 4.2);
    vitals.fear = clamp(20 + (100 - vitals.san) * 0.75, 0, 100);
    vitals.infection = clamp((100 - vitals.san) * 0.45, 0, 100);
    S.depth = lerp(420, 2050, 1 - vitals.san / 100);
    if (vitals.san <= 0) {
      S.autoSan = false;
      pushLog('完全共鸣。现在只有幻觉里的东西是真的。', 'whisper');
    }
    syncSliders();
  }

  // --- 呼吸 ---
  breath.driveFrom(vitals.fear, vitals.co2, vitals.fatigue);
  breath.update(dt, clock);
  if (S.holding) {
    vitals.co2 = Math.min(100, vitals.co2 + dt * 3.2);
  } else {
    vitals.co2 = Math.max(0, vitals.co2 - dt * 1.1);
  }

  // --- 噪音自然衰减 ---
  S.noise = Math.max(0, S.noise - dt * 0.14);

  // --- 污染度 ---
  const corruption = S.corruptionManual >= 0
    ? S.corruptionManual
    : clamp01(
        (1 - vitals.san / 100) * 0.82 +
        (vitals.infection / 100) * 0.16 +
        (S.depth / 2100) * 0.10,
      );

  // --- 后处理参数 ---
  if (!S.manualPost) {
    derivePost({
      san: vitals.san, sanMax: vitals.sanMax, fear: vitals.fear, co2: vitals.co2,
      oxygen: vitals.oxygen, oxygenMax: vitals.oxygenMax, infection: vitals.infection,
      trauma: vitals.trauma, depth: S.depth, flooding: S.flooding,
      corruption, holdingBreath: S.holding,
    }, post);
    syncPostSliders();
  }

  // --- 音频 ---
  audio.update(dt);
  audio.setHeartRate(58 + (vitals.fear / 100) * 78 + (S.holding ? 14 : 0));
  audio.setCorruption(corruption);
  audio.setDepth(S.depth);

  // 心跳冲击：从 BPM 推一个 0..1 的脉冲，供画面用
  const bpm = 58 + (vitals.fear / 100) * 78;
  const beatPhase = (clock * bpm) / 60;
  const heartPulse = Math.pow(Math.max(0, 1 - (beatPhase - Math.floor(beatPhase)) * 5.5), 2);

  // --- 面板开合 ---
  S.panelOpen = damp(S.panelOpen, S.panelTarget, 11, dt);
  if (S.panelOpen < 0.01 && S.panelTarget === 0) S.panel = S.panel;

  // --- 场景 ---
  scene.render({
    time: clock, dt,
    vitals, depth: S.depth, flooding: S.flooding,
    torch: S.torch, power: S.power, noise: S.noise,
    corruption, breathPhase: breath.phase, heartPulse,
    rooms: world.rooms, currentRoomId: world.currentRoomId,
    highlighted, holdingBreath: S.holding,
  });

  // --- HUD + 面板 ---
  if (S.showHud) {
    hud.render({
      vitals, corruption, depth: S.depth,
      bearing: Math.sin(clock * 0.11) * 1.7 + Math.PI * 0.25,
      noise: S.noise,
      breath: { fullness: breath.fullness, holding: S.holding, holdTime: breath.holdTime },
      statuses, log: hudLog, time: clock, dt, power: S.power,
    });
  } else {
    hud.context.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
  }
  const ps: PanelState = {
    kind: S.panel, open: S.panelOpen, time: clock, corruption,
    dialogue: DEMO_DIALOGUE,
    inventory: { items: DEMO_INVENTORY, selected: invSel, capacity: 12 },
    map: { rooms: world.rooms, currentRoomId: world.currentRoomId },
    log: { entries: DEMO_LOG, selected: logSel },
  };
  panels.render(hud.context, hud.canvas.width, hud.canvas.height, ps);

  // --- 后处理 ---
  extras.breathPhase = breath.phase;
  extras.heartPulse = heartPulse;
  extras.holdBreath = S.holding ? clamp01(0.4 + breath.holdTime / 18) : 0;
  extras.fog = clamp01(
    (S.holding ? breath.holdTime / 22 : Math.max(0, breath.phase) * 0.22) +
    clamp01((36.5 - vitals.coreTemp) / 6) * 0.45,
  );
  extras.corruption = corruption;
  extras.hudGain = S.showHud || S.panelOpen > 0.01 ? 1 : 0;
  extras.emergency = valueNoise2(clock * 3.1, 0, 11) * S.power;

  const rf: RenderFrame = { dt, time: clock, post };
  pipeline.upload(scene.canvas, hud.canvas);
  pipeline.render(rf, extras);

  if (frames % 12 === 0) updateReadout(corruption);
}

let invSel = 0;
let logSel = 1;

function updateReadout(corruption: number): void {
  const st = audio.stats;
  const warn = fps < 55 ? ' class="warn"' : '';
  readoutEl.innerHTML =
    `<span${warn}><b>${fps.toFixed(0)}</b> FPS</span> · ${pipeline.stats.drawCalls} draw · ` +
    `${outCanvas.width}×${outCanvas.height}${pipeline.stats.hdr ? ' · HDR16F' : ' · RGBA8'}<br>` +
    `SAN <b>${vitals.san.toFixed(0)}</b> · 污染 <b>${(corruption * 100).toFixed(0)}%</b> · ` +
    `CO₂ <b>${vitals.co2.toFixed(0)}</b> · 深度 <b>-${S.depth.toFixed(0)}m</b> · ` +
    `呼吸 <b>${breath.rate.toFixed(0)}</b>/min<br>` +
    `音频 ${st.contextState} · ${st.sampleRate / 1000}kHz · ${st.voices} 活动节点 · ${st.cues} cue`;
}

// ============================================================================
// 输入
// ============================================================================

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); setHold(true); break;
    case 'q': ping(0.45); break;
    case 'e': ping(0.95); break;
    case '1': togglePanel('dialogue'); break;
    case '2': togglePanel('inventory'); break;
    case '3': togglePanel('map'); break;
    case '4': togglePanel('log'); break;
    case 'h': panelEl.classList.toggle('hidden'); break;
    case 'escape': S.panelTarget = 0; break;
    case 'p': S.paused = !S.paused; break;
    case 'arrowdown':
      if (S.panel === 'inventory') invSel = (invSel + 1) % DEMO_INVENTORY.length;
      else if (S.panel === 'log') logSel = (logSel + 1) % DEMO_LOG.length;
      else if (S.panel === 'dialogue') DEMO_DIALOGUE.selected = (DEMO_DIALOGUE.selected + 1) % DEMO_DIALOGUE.choices.length;
      audio.cue('ui.hover', { gain: 0.5 });
      break;
    case 'arrowup':
      if (S.panel === 'inventory') invSel = (invSel + DEMO_INVENTORY.length - 1) % DEMO_INVENTORY.length;
      else if (S.panel === 'log') logSel = (logSel + DEMO_LOG.length - 1) % DEMO_LOG.length;
      else if (S.panel === 'dialogue') DEMO_DIALOGUE.selected = (DEMO_DIALOGUE.selected + DEMO_DIALOGUE.choices.length - 1) % DEMO_DIALOGUE.choices.length;
      audio.cue('ui.hover', { gain: 0.5 });
      break;
    default: break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') setHold(false);
});

document.getElementById('toggle')!.addEventListener('click', (e) => {
  e.stopPropagation();
  panelEl.classList.toggle('hidden');
});

let started = false;
async function start(): Promise<void> {
  if (started) return;
  started = true;
  hintEl.classList.add('gone');
  try {
    await audio.init();
    audio.setMasterGain(S.masterGain);
    audio.ambience('hull', 0.55);
    audio.cue('terminal.boot', { gain: 0.7 });
    pushLog('维生系统联机。', 'system');
  } catch (err) {
    console.error('[demo] 音频启动失败', err);
    pushLog('音频子系统未能启动（浏览器策略）。视觉不受影响。', 'bad');
  }
}
document.body.addEventListener('pointerdown', start, { once: false });
hintEl.addEventListener('click', start);

// ============================================================================
// 引导
// ============================================================================

buildPanel();
syncPostSliders();
resize();
pushLog('KYRIE-9 · 深度 412 m · 外部照明关闭。', 'system');
pushLog('你只听得见自己的呼吸。', 'neutral');
preset('lucid');
requestAnimationFrame(frame);

// 给自动化截图用的钩子
declare global {
  interface Window {
    __demo: {
      preset: (n: string) => void;
      ping: (p: number) => void;
      setHud: (v: boolean) => void;
      hidePanel: () => void;
      fps: () => number;
      /** 诊断用：取后处理之前的原始图层 */
      raw: (layer: 'scene' | 'hud') => string;
      /** 诊断用：主输出瞬时 RMS，验证「真的出声了」 */
      audioLevel: () => number;
      cue: (id: string) => void;
      state: typeof S;
      vitals: Vitals;
      channels: number;
      cues: number;
    };
  }
}

window.__demo = {
  preset,
  ping,
  setHud: (v: boolean) => (S.showHud = v),
  hidePanel: () => panelEl.classList.add('hidden'),
  fps: () => fps,
  raw: (layer) => (layer === 'hud' ? hud.canvas : scene.canvas).toDataURL('image/png'),
  audioLevel: () => audio.level(),
  cue: (id: string) => audio.cue(id, { gain: 0.9 }),
  state: S,
  vitals,
  channels: POST_CHANNELS.length,
  cues: CUE_COUNT,
};
