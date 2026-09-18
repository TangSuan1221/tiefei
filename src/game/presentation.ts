/**
 * 表现层装配 —— 把 RunContext 的模拟状态喂给场景 / HUD / 面板 / 后处理 / 音频。
 *
 * 这一层**只读**模拟状态，从不回写。任何"画面好看一点"的需求都不允许改模拟值；
 * 反过来，模拟里的每一个值都必须能在画面上找到对应物，否则它就不该存在。
 *
 * 渲染链：Canvas2D 场景 + Canvas2D HUD → WebGL2 后处理 → #post-canvas。
 * 后处理参数由 SAN / CO₂ / 深度 / 恐惧推导，不手调。
 */

import type { Room, StatusEffect } from '@/core/contract';
import { clamp, clamp01, damp } from '@/core/util';
import { AudioEngine } from '@/audio/engine';
import { BreathClock } from '@/audio/breath';
import { SceneRenderer } from '@/render/scene';
import {
  DEFAULT_EXTRAS,
  DEFAULT_POST,
  PostPipeline,
  derivePost,
  type PostExtras,
} from '@/render/post';
import { HudRenderer, type HudLogLine } from '@/ui/hud';
import { PanelRenderer, type PanelKind, type PanelState } from '@/ui/panels';
import { itemDef, maybeItem } from '@/content/items/index';
import { ActionPanel } from './actionpanel';
import type { GameAction, PingOutcome } from './actions';
import type { RunContext } from './context';

export interface FrameInput {
  actions: readonly GameAction[];
  selected: number;
  /** 打开的覆盖面板；null 表示只显示探索 HUD */
  panel: PanelKind;
  /** 叙事面板里当前高亮的选项 */
  dialogueSelected: number;
}

export class Presentation {
  readonly scene = new SceneRenderer();
  readonly hud = new HudRenderer();
  readonly panels = new PanelRenderer();
  readonly actionPanel = new ActionPanel();
  readonly audio = new AudioEngine();
  readonly breath = new BreathClock();
  readonly pipeline: PostPipeline;

  private sctx: CanvasRenderingContext2D | null = null;

  private readonly out: HTMLCanvasElement;
  private readonly ctx: RunContext;
  private readonly post = { ...DEFAULT_POST, tint: [1, 1, 1] as [number, number, number] };
  private readonly extras: PostExtras = { ...DEFAULT_EXTRAS };
  private readonly hudLog: HudLogLine[] = [];

  private clock = 0;
  private panelOpen = 0;
  private shake = 0;
  private highlighted: string[] = [];
  private lastLogCount = 0;
  private lastW = 0;
  private lastH = 0;
  audioReady = false;

  constructor(ctx: RunContext, out: HTMLCanvasElement) {
    this.ctx = ctx;
    this.out = out;
    this.pipeline = new PostPipeline(out);
    this.audio.attachBreath(this.breath);

    // 缺口 5 的另一半：效果里的 sfx / camera 在 context 里被截出来，接到这里
    ctx.onCue = (cue) => this.audio.cue(cue, { gain: 0.9 });
    ctx.onShake = (amount) => {
      this.shake = Math.max(this.shake, clamp01(amount));
    };

    this.resize();
  }

  /** 音频必须在用户手势里解锁，否则浏览器会静默拒绝 */
  async unlockAudio(): Promise<void> {
    if (this.audioReady) return;
    try {
      await this.audio.init();
      this.audio.setMasterGain(0.8);
      this.audio.ambience('hull', 0.5);
      this.audio.cue('terminal.boot', { gain: 0.7 });
      this.audioReady = true;
    } catch {
      this.ctx.pushLog('音频子系统未能启动（浏览器策略）。视觉不受影响。', 'bad');
    }
  }

  resize(): void {
    const cssW = this.out.clientWidth || window.innerWidth;
    const cssH = this.out.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = Math.round(cssW * dpr);
    let h = Math.round(cssH * dpr);
    const MAXPX = 2_600_000;
    const px = w * h;
    if (px > MAXPX) {
      const k = Math.sqrt(MAXPX / px);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    this.pipeline.resize(w, h);
    this.scene.resize(w, h);
    this.hud.resize(w, h);
  }

  /**
   * 场景画布的 2D 上下文。getContext 返回的是已存在的那一个，所以不必
   * 让 SceneRenderer 把私有字段暴露出来。
   */
  private sceneCtx(): CanvasRenderingContext2D | null {
    if (!this.sctx) this.sctx = this.scene.canvas.getContext('2d');
    return this.sctx;
  }

  /** 声呐脉冲的视听反馈。回波抽头由 world 算好，这里只负责播 */
  onPing(p: PingOutcome): void {
    this.scene.applySonar(
      p.result,
      [...this.ctx.world.rooms.values()],
      this.ctx.world.currentRoomId,
      p.power / 7,
    );
    this.highlighted = p.result.revealed.slice(0, 8);
    this.audio.sonarPing(p.power / 7, p.sweep.echoes);
  }

  frame(dt: number, input: FrameInput): void {
    this.clock += dt;
    const ctx = this.ctx;
    const v = ctx.vitals.vitals;
    const perceived = ctx.vitals.perceived();
    const corruption = ctx.veracity.corruption;
    const room = ctx.world.room(ctx.world.currentRoomId);

    const cw = this.out.clientWidth;
    const ch = this.out.clientHeight;
    if (cw !== this.lastW || ch !== this.lastH) {
      this.lastW = cw;
      this.lastH = ch;
      this.resize();
    }

    this.drainLog();

    // --- 呼吸 ---------------------------------------------------------------
    // 屏息状态以模拟为唯一真值，表现层只跟随（否则会出现"画面在憋气、身体没在憋"）
    const hold = ctx.vitals.holdState();
    this.breath.holding = hold.holding;
    this.breath.driveFrom(v.fear, v.co2, v.fatigue);
    this.breath.update(dt, this.clock);
    this.audio.setHoldBreath(hold.holding);

    // --- 音频 ---------------------------------------------------------------
    this.audio.update(dt);
    this.audio.setHeartRate(ctx.vitals.heartRateBpm());
    this.audio.setCorruption(corruption);
    this.audio.setDepth(ctx.world.depth);

    const bpm = ctx.vitals.heartRateBpm();
    const beat = (this.clock * bpm) / 60;
    const heartPulse = Math.pow(Math.max(0, 1 - (beat - Math.floor(beat)) * 5.5), 2);

    // --- 场景 ---------------------------------------------------------------
    const noise01 = clamp01(room.noise / Math.max(1, room.noiseThreshold));
    const power = clamp01(1 - ctx.world.depth / 2400) * 0.55 + 0.4;
    this.scene.render({
      time: this.clock,
      dt,
      vitals: v,
      depth: ctx.world.depth,
      flooding: room.ambient.flooding,
      torch: clamp(0.45 + ctx.vitals.derived('searchQuality') * 0.3, 0.2, 1),
      power,
      noise: noise01,
      corruption,
      breathPhase: this.breath.phase,
      heartPulse,
      rooms: [...ctx.world.rooms.values()] as Room[],
      currentRoomId: ctx.world.currentRoomId,
      highlighted: this.highlighted,
      holdingBreath: hold.holding,
    });

    // --- 行动清单的钢板 -------------------------------------------------------
    // 底板必须画在场景层：HUD 层是按玻璃投影合成的，压不死身下的舱段剖面图。
    // 文字则留到后面画进 HUD 层，好让它吃到面罩曲率。
    const showActions = !input.panel && input.actions.length > 0;
    const panelState = {
      actions: input.actions,
      selected: input.selected,
      time: this.clock,
      corruption,
      breathsLeft: Math.floor(perceived.oxygen / 2),
    };
    const alayout = showActions
      ? this.actionPanel.layout(this.scene.canvas.width, this.scene.canvas.height, panelState)
      : null;
    if (alayout) {
      const sctx = this.sceneCtx();
      if (sctx) this.actionPanel.drawPlate(sctx, this.scene.canvas.height, alayout);
    }

    // --- HUD ----------------------------------------------------------------
    this.hud.render({
      vitals: v,
      perceived,
      corruption,
      depth: ctx.world.depth,
      bearing: bearingOf(ctx),
      noise: noise01,
      breath: {
        fullness: this.breath.fullness,
        holding: hold.holding,
        holdTime: this.breath.holdTime,
      },
      statuses: ctx.vitals.visibleEffects() as StatusEffect[],
      log: this.hudLog,
      time: this.clock,
      dt,
      power,
    });

    // --- 行动清单 / 覆盖面板 --------------------------------------------------
    const target = input.panel ? 1 : 0;
    this.panelOpen = damp(this.panelOpen, target, 11, dt);

    if (alayout) {
      this.actionPanel.drawContents(this.hud.context, this.hud.canvas.height, alayout, panelState);
    } else {
      this.actionPanel.hits = [];
    }

    if (this.panelOpen > 0.01) {
      this.panels.render(this.hud.context, this.hud.canvas.width, this.hud.canvas.height, {
        kind: input.panel,
        open: this.panelOpen,
        time: this.clock,
        corruption,
        dialogue: this.dialogueModel(input.dialogueSelected),
        inventory: this.inventoryModel(),
        map: { rooms: [...ctx.world.rooms.values()] as Room[], currentRoomId: ctx.world.currentRoomId },
        log: this.logModel(),
      } satisfies PanelState);
    }

    // --- 后处理 --------------------------------------------------------------
    derivePost(
      {
        san: v.san,
        sanMax: v.sanMax,
        fear: v.fear,
        co2: v.co2,
        oxygen: v.oxygen,
        oxygenMax: v.oxygenMax,
        infection: v.infection,
        trauma: v.trauma,
        depth: ctx.world.depth,
        flooding: room.ambient.flooding,
        corruption,
        holdingBreath: hold.holding,
      },
      this.post,
    );

    this.shake = damp(this.shake, 0, 6, dt);
    this.extras.breathPhase = this.breath.phase;
    this.extras.heartPulse = Math.max(heartPulse, this.shake);
    this.extras.holdBreath = hold.holding ? clamp01(0.4 + this.breath.holdTime / 18) : 0;
    this.extras.fog = clamp01(
      (hold.holding ? this.breath.holdTime / 22 : Math.max(0, this.breath.phase) * 0.22) +
        clamp01((36.5 - v.coreTemp) / 6) * 0.45,
    );
    this.extras.corruption = corruption;
    this.extras.hudGain = 1;
    this.extras.emergency = clamp01(noise01 * 0.8 + this.shake);

    this.pipeline.upload(this.scene.canvas, this.hud.canvas);
    this.pipeline.render({ dt, time: this.clock, post: this.post }, this.extras);
  }

  // ==========================================================================
  // 模型转换
  // ==========================================================================

  private drainLog(): void {
    const src = this.ctx.log;
    for (let i = this.lastLogCount; i < src.length; i++) {
      this.hudLog.push({ text: src[i].text, tone: src[i].tone, at: this.clock });
    }
    this.lastLogCount = src.length;
    while (this.hudLog.length > 40) this.hudLog.shift();
  }

  private dialogueModel(selected: number) {
    const node = this.ctx.narrative.currentNode;
    if (!node) return undefined;
    return {
      speaker: node.speaker,
      portraitSeed: hash(node.speaker ?? node.id),
      text: this.ctx.narrative.renderText(node),
      choices: this.ctx.narrative.visibleChoices().map((vc) => ({
        id: vc.choice.id,
        label: vc.choice.label,
        cost: vc.choice.cost,
        disabled: vc.state === 'disabled' || vc.state === 'spent',
        irreversible: vc.choice.irreversible,
        tooltip: vc.reason ?? vc.choice.tooltip,
      })),
      selected,
    };
  }

  private inventoryModel() {
    const items = this.ctx.inventory.all().map((slot) => {
      const def = maybeItem(slot.id) ?? itemDef('item.scrap');
      return {
        id: slot.id,
        name: this.ctx.inventory.displayName(slot.id),
        kind: def.kind,
        count: slot.count,
        weight: def.weight,
        noise: def.noise ?? 0,
        description: def.description,
      };
    });
    return { items, selected: 0, capacity: this.ctx.inventory.capacity };
  }

  private logModel() {
    const entries = this.ctx.log.slice(-40).map((l, i) => ({
      id: `log.${i}`,
      title: l.text.slice(0, 18),
      stamp: `呼吸 ${String(l.at).padStart(4, '0')}`,
      body: l.text,
      tone: l.tone === 'good' || l.tone === 'neutral' ? ('neutral' as const) : l.tone,
      unread: false,
    }));
    return { entries, selected: Math.max(0, entries.length - 1) };
  }
}

/** 面朝方位：没有真实朝向系统，用当前房间在图纸上的位置推一个稳定值 */
function bearingOf(ctx: RunContext): number {
  const r = ctx.world.room(ctx.world.currentRoomId);
  return Math.atan2(r.pos.y, r.pos.x);
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
