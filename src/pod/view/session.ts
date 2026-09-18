/**
 * 逃生舱会话 —— 从标题画面接手之后，这就是整场游戏。
 * ============================================================================
 * 玩家被封在九米长的铁罐子里。没有行动清单。没有地图。
 * 你在舱里走动，在五个工位之间坐下，按它们的键。
 *
 * 平静态：时间只在你动手时走。
 * 警报态：红点在靠近，秒表是真的。
 */

import { seedToCoords } from '@/core/rng';
import { stationForKey, type StationId } from '../types';
import { PodRun } from '../sim/run';
import { PodView } from './present';
import { performControl, stationControls } from './stations';
import { bindGm, closeGmConsole, closePromptPanel, isGmConsoleOpen } from './gm';
import { installFootageSink } from './footage';

const DEATH_TITLE: Record<string, string> = {
  asphyxiation: '氧气用完了',
  hypothermia: '你不再觉得冷了',
  trauma: '失血比你以为的快',
  infection: '它已经在你身体里了',
  implosion: '舱体让步了',
  listener: '它找到了你',
  ritual: '仪式完成了',
  drowning: '水先漫过面罩',
  self: '你自己做的决定',
};

export async function startPodSession(_resume: boolean): Promise<void> {
  const override = sessionStorage.getItem('ironlung.seedOverride');
  sessionStorage.removeItem('ironlung.seedOverride');
  const seed = override ? Number(override) >>> 0 : (Date.now() ^ 0x9e3779b9) >>> 0;

  const uiRoot = document.getElementById('ui-root') as HTMLDivElement;
  uiRoot.innerHTML = '';
  document.querySelectorAll('.corner, .boot-log').forEach((n) => n.remove());
  const bgCanvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
  bgCanvas.style.opacity = '0';
  const outCanvas = document.getElementById('post-canvas') as HTMLCanvasElement;
  outCanvas.style.transition = 'opacity 1.6s ease';
  outCanvas.style.opacity = '1';

  const run = new PodRun(seed);
  const view = new PodView(run, outCanvas);
  bindGm({
    run: () => run,
    reinstallSink: () => installFootageSink(run),
  });
  installFootageSink(run);

  // 开发期把 run 挂出去。航线是线性的，想看第四段的样子就得先老实开完前三段 ——
  // 调一个站点的画面不值得付那个代价。发布构建里这行会被摇掉。
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__pod = run;
  }

  run.pushLog(`三号逃生舱 · 坐标 ${seedToCoords(seed)}`, 'system');
  run.pushLog('舱外没有窗户。你的眼睛是雷达、全息屏，和那一台摄像头。', 'neutral');

  new PodSession(run, view).start();
}

export class PodSession {
  private blurred = false;
  private last = performance.now();
  private ended = false;
  private readonly keys = new Set<string>();
  private epilogueAt = 0;

  constructor(
    private readonly run: PodRun,
    private readonly view: PodView,
  ) {}

  start(): void {
    this.wireSpatialAudio();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    requestAnimationFrame(this.frame);
  }

  /**
   * 把「这个声音在外面哪儿」接到音频引擎上。
   *
   * 表现层原本装的那个回调只传 gain。舱内的一百多个 cue 应该继续走那条路 ——
   * 它们本来就在你脑袋旁边，加距离衰减只会让界面糊掉。这里在它外面包一层：
   * **只有带了位置的那几个** cue 会走空间化的链路，其余一个字节都不变。
   */
  private wireSpatialAudio(): void {
    const audio = this.view.audio;
    this.run.onCue = (cue, gain, space) => {
      if (!space) {
        audio.cue(cue, { gain: gain ?? 0.85 });
        return;
      }
      audio.cue(cue, {
        gain: gain ?? 0.85,
        pan: space.pan,
        space: { dist: space.dist, room: space.room, flooded: space.flooded },
      });
    };
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.applyHeld(dt);
    this.run.frame(dt);
    this.view.frame(dt, this.run);
    // 摄像头换了一间房，混响尾巴就该跟着换。引擎自己按档位去重，
    // 所以这里可以每帧无脑推
    const room = this.run.roomAcoustics;
    this.view.audio.setRoomAcoustics(room.size, room.flooded);

    if (!this.ended && this.run.outcome.kind !== 'alive') {
      this.ended = true;
      this.epilogueAt = now + 2200;
    }
    if (this.ended && this.epilogueAt && now >= this.epilogueAt) {
      this.epilogueAt = 0;
      this.showEpilogue();
    }
  };

  private syncInputBlock(): boolean {
    const active = document.activeElement as HTMLElement | null;
    const editing = !!active?.closest('input, textarea, select, [contenteditable="true"]');
    const blocked = this.blurred || document.hidden || editing || isGmConsoleOpen()
      || !!document.querySelector('.gm-prompt');
    this.run.driveInputBlocked = blocked;
    if (blocked || this.run.at !== 'camera' || this.run.outcome.kind !== 'alive') this.keys.clear();
    return blocked;
  }

  private onBlur = (): void => {
    this.blurred = true;
    this.keys.clear();
    this.run.driveInputBlocked = true;
  };
  private onFocus = (): void => { this.blurred = false; this.syncInputBlock(); };
  private onVisibility = (): void => { this.keys.clear(); this.syncInputBlock(); };

  private applyHeld(dt: number): void {
    if (this.syncInputBlock() || this.run.at !== 'camera' || this.run.outcome.kind !== 'alive') return;
    const k = this.keys;
    const speed = 0.85 * dt * this.run.camZoom;
    if (k.has('arrowleft')) this.run.panCamera(-speed);
    if (k.has('arrowright')) this.run.panCamera(speed);
    if (k.has('arrowup')) this.run.tiltCamera(-speed * 0.6);
    if (k.has('arrowdown')) this.run.tiltCamera(speed * 0.6);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.syncInputBlock() || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (this.run.at === 'camera' && e.key === ' ') e.preventDefault();
    if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      return;
    }
    void this.view.unlockAudio();
    const key = e.key.toLowerCase();
    if (isGmConsoleOpen()) return;
    this.keys.add(key);

    if (this.run.outcome.kind !== 'alive') return;

    if (key === 'escape') {
      e.preventDefault();
      if (closePromptPanel() || closeGmConsole()) return;
      this.keys.clear();
      if (this.run.at) this.run.leaveStation();
      return;
    }

    if (!this.run.at) {
      if (key === 'a' || key === 'arrowleft') {
        e.preventDefault();
        this.run.peekStation(-1);
        return;
      }
      if (key === 'd' || key === 'arrowright') {
        e.preventDefault();
        this.run.peekStation(1);
        return;
      }
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        this.run.walkTo(this.run.closestStation());
        return;
      }
      if (key >= '1' && key <= '6') {
        const id = stationForKey(key);
        if (id) this.run.walkTo(id);
        return;
      }
      return;
    }

    if (this.run.at === 'camera') {
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        // 按住方向键由 applyHeld 连续转云台，避免默认行为同时滚动页面。
        e.preventDefault();
        return;
      }
      if (key === '+' || key === '=') this.run.zoomCamera(0.25);
      if (key === '-' || key === '_') this.run.zoomCamera(-0.25);
    }

    const controls = stationControls(this.run, this.run.at);
    const hit = controls.find((c) => (c.key === '空格' ? ' ' : c.key.toLowerCase()) === key);
    if (hit) {
      e.preventDefault();
      if (hit.state !== 'disabled') performControl(this.run, hit.id);
      return;
    }
    // 坐下时 1–6 仍可换台：分析台占用 1–3，提示却写「按 6」去领航台。
    if (key >= '1' && key <= '6') {
      const id = stationForKey(key);
      if (id && id !== this.run.at) {
        e.preventDefault();
        this.run.walkTo(id);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onPointer = (e: PointerEvent): void => {
    if (this.syncInputBlock()) return;
    this.keys.clear();
    void this.view.unlockAudio();
    if (this.run.outcome.kind !== 'alive') return;
    const id = this.view.pick(e.clientX, e.clientY);
    if (!id) return;
    const ok = performControl(this.run, id);
    if (!ok) this.view.audio.cue('ui.error', { gain: 0.4 });
    else this.view.audio.cue('ui.select', { gain: 0.45 });
  };

  private onMove = (e: PointerEvent): void => {
    const id = this.view.pick(e.clientX, e.clientY);
    if (id !== this.view.hovered) {
      this.view.hovered = id;
      if (id) this.view.audio.cue('ui.hover', { gain: 0.28 });
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (this.syncInputBlock() || this.run.at !== 'camera' || this.run.outcome.kind !== 'alive') return;
    e.preventDefault();
    this.run.zoomCamera(e.deltaY > 0 ? -0.18 : 0.18);
  };

  private showEpilogue(): void {
    const run = this.run;
    const root = document.getElementById('ui-root') as HTMLDivElement;
    const out = run.outcome;
    const title =
      out.kind === 'escaped' ? '升降井就在上面'
      : out.kind === 'dead' ? (DEATH_TITLE[out.cause] ?? '你停止了呼吸')
      : '——';
    const body =
      out.kind === 'escaped'
        ? '铁盖打开的时候你没有立刻爬出去。你在听。频道里什么都没有了。'
        : out.kind === 'dead' ? out.line
        : '';
    root.innerHTML = `
      <div class="epilogue">
        <h2>${title}</h2>
        <p>${body}</p>
        <ul>
          <li>${run.breaths} 口气</li>
          <li>最深 ${run.depth.toFixed(0)} 米</li>
          <li>${run.leg.name}</li>
        </ul>
        <button id="again">再进一次舱</button>
      </div>`;
    document.getElementById('again')?.addEventListener('click', () => location.reload());
  }
}
