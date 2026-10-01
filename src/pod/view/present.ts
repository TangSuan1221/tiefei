/**
 * 逃生舱表现层。
 * ============================================================================
 * 场景画布：过道 + 工位近景。
 * HUD 画布：面罩内壁上的读数与日志（单独一层，好让后处理用更强的玻璃曲率去弯）。
 * 音频、呼吸、后处理全部复用原作管线 —— 美术气质不能换。
 */

import { AudioEngine } from '@/audio/engine';
import { BreathClock } from '@/audio/breath';
import { clamp, clamp01, damp } from '@/core/util';
import { PALETTE, rgba } from '@/render/palette';
import {
  DEFAULT_EXTRAS,
  DEFAULT_POST,
  PostPipeline,
  derivePost,
  type PostExtras,
} from '@/render/post';
import { SonarScope } from '@/render/sonar';
import { cjk, mono, tracked } from '@/ui/typography';
import { STATIONS, STATION_ORDER, STATION_KEYS, canonicalStation, type StationId } from '../types';
import { PodRun } from '../sim/run';
import { CabinThree } from './cabin-three';
import { HitMap } from './chrome';
import { installFootageSink } from './footage';
import { drawCameraFeed } from './creature';
import { PodExpedition } from './deepsea/pod-expedition';

/**
 * 现在最该去的工位。
 *
 * 优先级是按「不去会死得多快」排的：看清了的威胁 > 没接的无线电 > 够得着的废墟。
 * 威胁那一档读的是 `creature.adviceStation` —— 这个字段内容层一直填着，
 * 但在这之前从来没有人读过它，于是「停机，别动」这种建议永远没人知道
 * 该去舱的哪一头执行。
 */
function adviseStationFor(run: PodRun): StationId | null {
  const t = run.threat;
  if (t && (t.known || t.behavior === 'warning') && (t.phase === 'contact' || t.phase === 'identified')) {
    return canonicalStation(t.creature.adviceStation);
  }
  if(run.legIndex===6 && run.canDepart && !run.campaign.choice) return 'radio';
  if (run.radioWaiting) return 'radio';
  if (run.phase === 'site' && !run.volumeKnown) {
    return run.unanalyzedCount > 0 ? 'lab' : 'camera';
  }
  if (run.canSurvey) return 'camera';
  if (run.siteWreck()) return 'camera';
  if (run.phase === 'transit') return 'nav';
  if (run.phase === 'site') return 'nav';
  return null;
}

export class PodView {
  readonly scene = document.createElement('canvas');
  readonly hud = document.createElement('canvas');
  readonly audio = new AudioEngine();
  readonly breath = new BreathClock();
  readonly pipeline: PostPipeline;
  readonly sonar = new SonarScope();
  readonly cabin = new CabinThree();
  readonly hits = new HitMap();

  hovered: string | null = null;
  audioReady = false;

  private sctx: CanvasRenderingContext2D;
  private hctx: CanvasRenderingContext2D;
  private readonly out: HTMLCanvasElement;
  private readonly post = { ...DEFAULT_POST, tint: [1, 1, 1] as [number, number, number] };
  private readonly extras: PostExtras = { ...DEFAULT_EXTRAS };
  private clock = 0;
  private shake = 0;
  private lastW = 0;
  private lastH = 0;
  private lastSweep = 0;
  private zoomVisual = 0;
  private sceneOffset = { x: 0, y: 0 };

  constructor(run: PodRun, out: HTMLCanvasElement) {
    this.out = out;
    this.pipeline = new PostPipeline(out);
    this.audio.attachBreath(this.breath);

    const s = this.scene.getContext('2d', { alpha: false });
    const h = this.hud.getContext('2d', { alpha: true });
    if (!s || !h) throw new Error('[pod] 无法创建 2D 上下文');
    this.sctx = s;
    this.hctx = h;
    run.createAuthoredSite=index=>new PodExpedition(run,index);
    run.captureSensorFrame = () => {
      const frame=document.createElement('canvas');frame.width=512;frame.height=360;
      const ctx=frame.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Sensor canvas unavailable');
      drawCameraFeed(ctx,512,360,{run,time:this.clock,aim:run.cameraOnTarget(),reveal:0,keyframe:true});
      const pixels=ctx.getImageData(0,0,512,360);
      for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=255*Math.pow(pixels.data[i+c]/255,.7);
      ctx.putImageData(pixels,0,0);
      return frame.toDataURL('image/jpeg',.72);
    };
    run.captureKeyframe = () => {
      const frame = document.createElement('canvas');
      frame.width = 1024; frame.height = 720;
      const ctx = frame.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Shutter canvas unavailable');
      drawCameraFeed(ctx, frame.width, frame.height, {
        run, time: this.clock, aim: run.cameraOnTarget(), reveal: 0, keyframe: true,
      });
      // Sensor exposure compensation preserves framing, not extra scene content.
      const pixels=ctx.getImageData(0,0,frame.width,frame.height);
      for(let i=0;i<pixels.data.length;i+=4){
        for(let c=0;c<3;c++)pixels.data[i+c]=255*Math.pow(pixels.data[i+c]/255,.7);
      }
      ctx.putImageData(pixels,0,0);
      return frame.toDataURL('image/png');
    };

    run.onCue = (cue, gain) => this.audio.cue(cue, { gain: gain ?? 0.85 });
    run.onShake = (amount) => {
      this.shake = Math.max(this.shake, clamp01(amount));
      this.cabin.impact(amount);
    };
    // 冲洗回路是这里装上的 —— 表现层是唯一允许碰网络的一层。
    // GM 无视频模式会装一个不发请求的 sink，只交出提示词。
    installFootageSink(run);

    this.resize();
  }

  async unlockAudio(): Promise<void> {
    if (this.audioReady) return;
    try {
      await this.audio.init();
      this.audio.setMasterGain(0.82);
      this.audio.ambience('hull', 0.55);
      this.audio.cue('terminal.boot', { gain: 0.7 });
      this.audioReady = true;
    } catch {
      /* 浏览器策略。视觉不受影响。 */
    }
  }

  resize(): void {
    const cssW = this.out.clientWidth || window.innerWidth;
    const cssH = this.out.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = Math.round(cssW * dpr);
    let h = Math.round(cssH * dpr);
    const MAXPX = 2_600_000;
    if (w * h > MAXPX) {
      const k = Math.sqrt(MAXPX / (w * h));
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    this.pipeline.resize(w, h);
    this.scene.width = w;
    this.scene.height = h;
    this.hud.width = w;
    this.hud.height = h;
    this.cabin.ensure(w, h);
  }

  pick(clientX: number, clientY: number): string | null {
    const rect = this.out.getBoundingClientRect();
    // Match the post shader's output-to-source lookup before ray casting.
    let u = (clientX - rect.left) / rect.width;
    let v = 1 - (clientY - rect.top) / rect.height;
    const bp = this.extras.breathPhase;
    const asym = bp < 0 ? bp * 1.35 : bp * .85;
    const scale = 1 - this.post.breathe * .006 * asym;
    u = .5 + (u - .5) * scale;
    v = .5 + (v - .5) * scale + this.post.breathe * .0016 * asym;
    u = .5 + (u - .5) * (1 - this.extras.heartPulse * .0022);
    v = .5 + (v - .5) * (1 - this.extras.heartPulse * .0022);
    const r2 = (u - .5) ** 2 + (v - .5) ** 2;
    const k = 1 + this.post.barrel * r2 + this.post.barrel ** 2 * .72 * r2 ** 2;
    const x = (.5 + (u - .5) * k) * this.scene.width - this.sceneOffset.x;
    const y = (.5 - (v - .5) * k) * this.scene.height - this.sceneOffset.y;
    return this.cabin.pick(x, y, this.scene.width, this.scene.height);
  }

  frame(dt: number, run: PodRun): void {
    this.clock += dt;
    const cssW = this.out.clientWidth;
    const cssH = this.out.clientHeight;
    if (cssW !== this.lastW || cssH !== this.lastH) {
      this.lastW = cssW;
      this.lastH = cssH;
      this.resize();
    }

    const v = run.vitals.vitals;
    this.breath.driveFrom(v.fear, v.co2, v.fatigue);
    this.breath.update(dt, this.clock);
    this.audio.update(dt);
    this.audio.setHeartRate(run.vitals.heartRateBpm());
    this.audio.setCorruption(run.corruption);
    this.audio.setDepth(run.depth);

    if (run.flood > 0.35) this.audio.ambience('flooded', 0.4 + run.flood * 0.4);
    else this.audio.ambience('hull', 0.5 + run.noise * 0.3);

    this.sonar.update(dt);
    if (run.sweepId !== this.lastSweep) {
      this.lastSweep = run.sweepId;
      this.sonar.ping([0.25, 0.65, 1][run.sweepPower] ?? 0.4);
    }
    this.sonar.contacts = run.contacts;

    this.zoomVisual = damp(this.zoomVisual, run.zoom, 8, dt);
    this.shake = damp(this.shake, 0, 6, dt);

    this.drawScene(run, dt);
    this.drawHud(run);

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
        depth: run.depth,
        flooding: run.flood,
        corruption: run.corruption,
        holdingBreath: false,
      },
      this.post,
    );

    const bpm = run.vitals.heartRateBpm();
    // A dry cabin has no underwater refraction. Keep deterministic optical
    // distortion (inverted by pick), grading and grain, not stochastic UV tears.
    this.post.caustics = 0;
    this.post.warp = 0;
    this.post.static = 0;
    // The physical CRT already has its own texture. Avoid a second strong
    // full-screen scan/grain layer obscuring the environment and instrument labels.
    const harborCabin = run.legIndex === 0;
    this.extras.glassWear = harborCabin ? 0.025 : 1;
    if (harborCabin) {
      this.post.scanline = 0.035;
      this.post.grain = Math.min(this.post.grain, 0.07);
      this.post.aberration = Math.min(this.post.aberration, 0.045);
    }
    const beat = (this.clock * bpm) / 60;
    const heartPulse = Math.pow(Math.max(0, 1 - (beat - Math.floor(beat)) * 5.5), 2);
    this.extras.breathPhase = this.breath.phase;
    this.extras.heartPulse = Math.max(heartPulse, this.shake);
    this.extras.holdBreath = 0;
    this.extras.fog = clamp01(Math.max(0, this.breath.phase) * 0.035 + run.flood * 0.10);
    this.extras.corruption = run.corruption;
    this.extras.hudGain = 1;
    this.extras.emergency = clamp01((run.mode === 'alert' ? 0.7 : 0) + this.shake + run.noise * 0.4);

    this.pipeline.upload(this.scene, this.hud);
    this.pipeline.render({ dt, time: this.clock, post: this.post }, this.extras);
  }

  private drawScene(run: PodRun, dt: number): void {
    const ctx = this.sctx;
    const w = this.scene.width;
    const h = this.scene.height;
    this.hits.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.abyss;
    ctx.fillRect(0, 0, w, h);

    const shakeX = (Math.random() - 0.5) * this.shake * h * 0.012;
    const shakeY = (Math.random() - 0.5) * this.shake * h * 0.012;
    this.sceneOffset = { x: shakeX, y: shakeY };
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.cabin.draw(ctx, w, h, run, this.hits, { time: this.clock, dt, hovered: this.hovered, sonar: this.sonar });
    ctx.restore();

  }

  private drawHud(run: PodRun): void {
    const ctx = this.hctx;
    const w = this.hud.width;
    const h = this.hud.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if(run.authoredSite?.diegeticGuidance&&run.outcome.kind==='alive'){
      if(run.storyCaptionLeft>0&&run.storyCaption){
        ctx.font=cjk(Math.max(16,h*.023),500);ctx.textAlign='left';ctx.fillStyle='#e5e7da';
        const lines:string[]=[];let line='';for(const ch of run.storyCaption){if(ctx.measureText(line+ch).width>w*.72){lines.push(line);line='';}line+=ch;}if(line)lines.push(line);
        const fs=Math.max(16,h*.023);ctx.shadowColor='#000';ctx.shadowBlur=5;
        lines.forEach((s,i)=>ctx.fillText(s,w*.14,h*.91-(lines.length-1-i)*fs*1.45));ctx.shadowBlur=0;
      }
      return;
    }

    const v = run.vitals.perceived();
    const zoomed = this.zoomVisual > 0.55;
    // Full objectives and transcripts live on instruments, never across the window.
    if (!run.at && (run.radioWaiting || run.storyCaptionLeft > 0)) {
      ctx.textAlign = 'left'; ctx.fillStyle = '#d2ac68'; ctx.font = cjk(h * .016, 500);
      ctx.fillText('VHF · 新通信，按 3 接听／查阅', w * .04, h * .13);
    }

    // 顶栏
    ctx.fillStyle = rgba(PALETTE.rust, 0.75);
    ctx.font = mono(h * 0.016, 600);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    tracked(ctx, 'KYRIE-9  ·  ESCAPE POD 03', w * 0.03, h * 0.038, h * 0.003);

    ctx.textAlign = 'right';
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
    ctx.fillText(
      `${run.depth.toFixed(0)} m   HDG ${run.heading.toFixed(0).padStart(3, '0')}   ${run.mode === 'alert' ? 'ALERT' : 'CALM'}`,
      w * 0.97,
      h * 0.038,
    );

    if (!zoomed && !run.at) {
      this.gauge(ctx, w * 0.07, h * 0.93, h * 0.055, v.oxygen / v.oxygenMax, 'O2', v.oxygen / v.oxygenMax < 0.22);
      this.gauge(ctx, w * 0.16, h * 0.93, h * 0.055, run.power, 'PWR', run.power < 0.18);
      this.gauge(ctx, w * 0.25, h * 0.93, h * 0.055, run.hull, 'HULL', run.hull < 0.28);
      this.gauge(ctx, w * 0.34, h * 0.93, h * 0.055, 1 - run.flood, 'DRY', run.flood > 0.45);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#d6dfc8';
      ctx.font = cjk(h * 0.018, 400);
      ctx.fillText('WASD 移动 · 点击或右键拖动环视 · E 操作', w * 0.39, h * 0.91);
      ctx.strokeStyle=this.hovered?.startsWith('station:')?'#efbd70':'#a6b7b0';
      ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(w/2,h/2,3,0,Math.PI*2);ctx.stroke();
      if(this.hovered?.startsWith('station:')) {
        ctx.textAlign='center';ctx.fillStyle='#efbd70';
        ctx.fillText('E · 操作设备',w/2,h*.56);
      }

      if (run.radioWaiting) {
        ctx.fillStyle = rgba(PALETTE.bloodHot, 0.55 + Math.sin(this.clock * 7) * 0.3);
        ctx.font = cjk(h * 0.02, 500);
        ctx.textAlign = 'center';
        ctx.fillText('无线电在叫你', w * 0.5, h * 0.11);
      }

      // 现在最该去的那个工位。舱有九米长，屏幕一次只装得下三四个台子，
      // 剩下的在视野外面 —— 不指一下，玩家会以为这艘艇根本没有那个台子。
      const advised = adviseStationFor(run);

      // 工位条。
      // 舱比屏幕宽，六个工位里同时能看见的只有三四个 —— 剩下的在视野外面。
      // 所以这条必须报中文名：只印「6 HLM」的话，玩家照着提示去找「推进控制」
      // 会以为这艘艇根本没有这个台子。
      STATION_ORDER.forEach((id, i) => {
        const x = w * (0.13 + i * 0.145);
        const y = h * 0.066;
        const here = run.at === id || (!run.at && run.closestStation() === id);
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(here ? PALETTE.ember : PALETTE.boneWhisper, here ? 0.9 : 0.45);
        ctx.font = mono(h * 0.014, 600);
        ctx.fillText(`${STATION_KEYS[id]} ${STATIONS[id].code}`, x, y);
        ctx.fillStyle = rgba(here ? PALETTE.ember : PALETTE.boneWhisper, here ? 0.85 : 0.38);
        ctx.font = cjk(h * 0.0155, here ? 600 : 400);
        ctx.fillText(STATIONS[id].name, x, y + h * 0.022);
        if (here) {
          ctx.strokeStyle = rgba(PALETTE.ember, 0.5);
          ctx.lineWidth = Math.max(1, h * 0.0015);
          ctx.beginPath();
          ctx.moveTo(x - w * 0.036, y + h * 0.031);
          ctx.lineTo(x + w * 0.036, y + h * 0.031);
          ctx.stroke();
        }
        if (id === advised && run.at !== id) {
          const p = 0.45 + Math.sin(this.clock * 5) * 0.3;
          ctx.strokeStyle = rgba(PALETTE.bloodHot, p);
          ctx.lineWidth = Math.max(1, h * 0.002);
          ctx.strokeRect(x - w * 0.042, y - h * 0.020, w * 0.084, h * 0.056);
        }
        if (id === 'radio' && run.radioWaiting) {
          ctx.fillStyle = rgba(PALETTE.bloodHot, 0.6 + Math.sin(this.clock * 8) * 0.35);
          ctx.beginPath();
          ctx.arc(x + h * 0.030, y - h * 0.008, h * 0.005, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 一句话把「该去哪」说死，连按哪个键一起说。
      if (advised && run.at !== advised) {
        const i = STATION_ORDER.indexOf(advised);
        const here = STATION_ORDER.indexOf(run.closestStation());
        const arrow = i === here ? '↑' : i > here ? '→' : '←';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#dfb078';
        ctx.font = cjk(h * 0.021, 600);
        ctx.fillText(
          `${arrow} 去 ${STATIONS[advised].name}（按 ${STATION_KEYS[advised]}）`,
          w * 0.5,
          h * 0.145,
        );
      }
    }

    // 日志
    // At the helm, physical labels must not sit behind the scrolling journal.
    const logs = run.at ? [] : run.log.slice(-1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    logs.forEach((line, i) => {
      const age = this.clock - line.stamp;
      const a = clamp01(1.2 - age / 14);
      if (a < 0.04) return;
      const hex =
        line.tone === 'bad' ? PALETTE.bloodHot
        : line.tone === 'good' ? PALETTE.ember
        : line.tone === 'eerie' ? PALETTE.boneDim
        : line.tone === 'radio' ? PALETTE.rustHot
        : PALETTE.bone;
      ctx.fillStyle = rgba(hex, 0.35 + a * 0.55);
      ctx.font = cjk(h * 0.017, 400);
      const y = h * (zoomed ? 0.88 : 0.78) + i * h * 0.022;
      ctx.fillText(line.text.slice(0, 42), w * 0.42, y);
    });

    if (run.mode === 'alert' && run.threat && run.at !== 'camera') {
      ctx.fillStyle = rgba(PALETTE.bloodHot, 0.55 + Math.sin(this.clock * 9) * 0.3);
      ctx.font = mono(h * 0.022, 700);
      ctx.textAlign = 'center';
      ctx.fillText('CONTACT', w * 0.5, h * 0.12);
      ctx.font = cjk(h * 0.018, 500);
      ctx.fillText(
        run.threat.behavior === 'warning'
          ? `舱外重撞 · ${Math.ceil(run.threat.warningLeft)} 秒内应对：${run.threat.creature.advice}`
          : run.threat.known ? run.threat.creature.advice : '异响正在靠近。实时镜头不可见，拍摄录像辨认。',
        w * 0.5,
        h * 0.148,
      );
    }

    if (run.outcome.kind !== 'alive') {
      ctx.fillStyle = 'rgba(4,6,10,0.55)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  private gauge(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    v: number,
    label: string,
    danger: boolean,
  ): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = r * 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.strokeStyle = rgba(danger ? PALETTE.bloodHot : PALETTE.ember, 0.85);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * clamp01(v));
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.75);
    ctx.font = mono(r * 0.32, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + r * 0.12);
    ctx.restore();
  }
}

export type { StationId };
