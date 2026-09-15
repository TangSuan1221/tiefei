/**
 * AudioEngine —— contract.AudioSystem 的实现
 * ============================================================================
 * 全程序化 WebAudio。零外部素材。
 *
 * 信号流：
 *
 *   心跳 ──┐
 *   呼吸 ──┤
 *   音效 ──┼──> dryBus ──> globalLP ──> preMaster ──┬──> comp ──> master ──> 输出
 *   音床 ──┘                                        │
 *                                                   │
 *   reverbSend ──> convolver(程序化脉冲响应) ──> revGain ┘
 *
 *   耳鸣 ────────────────────────────────────────> master   （绕过低通：它在你脑子里，不在舱里）
 *
 * 动态混音（GDD §8.2 的「生理沉浸」）：
 *   屏息 → globalLP 砍到 ~400 Hz，心跳总线 +7 dB，音床 −9 dB。
 *   世界被闷住，只剩下你自己的身体。这是全作最重要的一个混音动作。
 */

import type { AudioSystem, Rng } from '../core/contract';
import { Xoshiro } from '../core/rng';
import { clamp, clamp01, lerp } from '../core/util';
import type { BreathClock } from './breath';
import { BEDS, CUES, CUE_COUNT, CUE_META } from './cues';
import {
  activeNodeCount, cleanup, filt, gainNode, hiss, hit, makeImpulse, makeNoise,
  noiseSource, osc, panner, ramp, type SynthCtx,
} from './dsp';

export interface AudioStats {
  cues: number;
  beds: number;
  voices: number;
  contextState: string;
  sampleRate: number;
}

interface BedNodes {
  gain: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  spec: (typeof BEDS)[string];
  sprinkleAt: number[];
}

export class AudioEngine implements AudioSystem {
  private ctx: AudioContext | null = null;
  private rng: Rng = new Xoshiro(0xa17b3, 'audio');

  private master!: GainNode;
  private comp!: DynamicsCompressorNode;
  private globalLP!: BiquadFilterNode;
  private dryBus!: GainNode;
  private sfxBus!: GainNode;
  private heartBus!: GainNode;
  private breathBus!: GainNode;
  private ambBus!: GainNode;
  private reverbSend!: GainNode;
  private convolver!: ConvolverNode;
  private revGain!: GainNode;
  private tinnitusBus!: GainNode;

  private noiseBuffers: Record<string, AudioBuffer> = {};

  // 生理
  private bpm = 62;
  private targetBpm = 62;
  private nextBeat = 0;
  private breath: BreathClock | null = null;
  private detachBreath: (() => void) | null = null;
  private holding = false;

  // 环境
  private depthN = 0;
  private corruption = 0;
  private nextStress = 6;
  private bed: BedNodes | null = null;
  private bedName = '';

  private schedTimer: number | null = null;
  private lastTick = 0;
  private cueCounter = 0;

  readonly available = typeof window !== 'undefined' && 'AudioContext' in window;

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = gainNode(ctx, 0.85);
    this.comp = ctx.createDynamicsCompressor();
    // 慢启动、慢释放：不要把心跳压扁，只拦住内爆那种峰值
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.012;
    this.comp.release.value = 0.35;

    this.globalLP = filt(ctx, 'lowpass', 16000, 0.7);
    this.dryBus = gainNode(ctx, 1);
    this.sfxBus = gainNode(ctx, 1);
    this.heartBus = gainNode(ctx, 0.55);
    this.breathBus = gainNode(ctx, 0.75);
    this.ambBus = gainNode(ctx, 0.7);
    this.reverbSend = gainNode(ctx, 0.5);
    this.revGain = gainNode(ctx, 0.62);
    this.tinnitusBus = gainNode(ctx, 0);

    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeImpulse(ctx, this.rng.fork('ir-hull'), 2.6, 3.4, 0.55);

    this.sfxBus.connect(this.dryBus);
    this.heartBus.connect(this.dryBus);
    this.breathBus.connect(this.dryBus);
    this.ambBus.connect(this.dryBus);
    this.dryBus.connect(this.globalLP).connect(this.comp);
    this.reverbSend.connect(this.convolver).connect(this.revGain).connect(this.comp);
    this.tinnitusBus.connect(this.master);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.noiseBuffers.white = makeNoise(ctx, this.rng.fork('nz-w'), 3, 'white');
    this.noiseBuffers.pink = makeNoise(ctx, this.rng.fork('nz-p'), 3, 'pink');
    this.noiseBuffers.brown = makeNoise(ctx, this.rng.fork('nz-b'), 4, 'brown');

    this.startTinnitus();
    this.nextBeat = ctx.currentTime + 0.25;
    this.lastTick = ctx.currentTime;

    // 前瞻调度器：音频事件必须提前排好，靠 rAF 去 trigger 会抖
    this.schedTimer = setInterval(() => this.schedule(), 40) as unknown as number;

    if (ctx.state === 'suspended') await ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get stats(): AudioStats {
    return {
      cues: CUE_COUNT,
      beds: Object.keys(BEDS).length,
      voices: activeNodeCount(),
      contextState: this.ctx?.state ?? 'closed',
      sampleRate: this.ctx?.sampleRate ?? 0,
    };
  }

  dispose(): void {
    if (this.schedTimer !== null) clearInterval(this.schedTimer);
    this.schedTimer = null;
    this.detachBreath?.();
    this.ctx?.close();
    this.ctx = null;
  }

  // ==========================================================================
  // AudioSystem 接口
  // ==========================================================================

  cue(name: string, opts?: { gain?: number; pan?: number; detune?: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const fn = CUES[name];
    if (!fn) {
      console.warn(`[audio] 未知 cue "${name}"`);
      return;
    }
    this.cueCounter++;
    const s: SynthCtx = {
      ctx,
      dest: this.sfxBus,
      send: this.reverbSend,
      t: ctx.currentTime + 0.012,
      rng: this.rng.fork(`cue-${this.cueCounter}`),
      gain: opts?.gain ?? 1,
      pan: clamp(opts?.pan ?? 0, -1, 1),
      detune: opts?.detune ?? 0,
    };
    try {
      fn(s);
    } catch (err) {
      console.error(`[audio] cue "${name}" 合成失败`, err);
    }
  }

  ambience(name: string, intensity: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const spec = BEDS[name];
    if (!spec) {
      console.warn(`[audio] 未知音床 "${name}"`);
      return;
    }
    const inten = clamp01(intensity);
    if (this.bedName === name && this.bed) {
      ramp(this.bed.gain.gain, ctx.currentTime, this.bed.gain.gain.value, Math.max(0.0002, inten), 1.2, false);
      return;
    }
    // 交叉淡出旧床
    if (this.bed) {
      const old = this.bed;
      const t = ctx.currentTime;
      ramp(old.gain.gain, t, old.gain.gain.value, 0.0001, 1.8, false);
      setTimeout(() => {
        for (const s of old.sources) {
          try { s.stop(); } catch { /* 已停 */ }
        }
        try { old.gain.disconnect(); } catch { /* 已断 */ }
      }, 2200);
    }
    this.bedName = name;
    this.bed = this.buildBed(spec, inten);
    ramp(this.revGain.gain, ctx.currentTime, this.revGain.gain.value, 0.28 + spec.reverb * 0.6, 1.5, false);
  }

  setHeartRate(bpm: number): void {
    this.targetBpm = clamp(bpm, 34, 210);
  }

  /**
   * 声呐脉冲 + 多抽头延迟回波。
   * 每个 echo 的 delay 由 Agent B 按房间距离算出（2 × 距离 / 1500 m·s⁻¹），
   * 这里负责让它听起来像真的：延迟越长 → 越闷、越散、混响送得越多。
   * 空间感全靠这一段，不能用统一的回声代替。
   */
  sonarPing(power: number, echoes: readonly { delay: number; gain: number; pan: number }[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const p = clamp01(power);

    // 发射端：合成进一个汇总点，之后所有抽头都从这里取信号
    const tap = gainNode(ctx, 1);
    const s: SynthCtx = {
      ctx, dest: tap, send: this.reverbSend, t,
      rng: this.rng.fork(`ping-${this.cueCounter++}`),
      gain: 1, pan: 0, detune: 0,
    };
    (p > 0.6 ? CUES['sonar.boom'] : CUES['sonar.chirp'])(s);

    // 直达声（换能器就在你脑袋旁边，所以很干）
    const direct = gainNode(ctx, 0.85);
    tap.connect(direct).connect(this.sfxBus);

    let maxDelay = 0;
    for (const e of echoes) {
      const delay = clamp(e.delay, 0.004, 3.8);
      maxDelay = Math.max(maxDelay, delay);
      const far = clamp01(delay / 2.2);

      const d = ctx.createDelay(4);
      d.delayTime.value = delay;
      // 远的回波高频被水吃掉；顺便加一个高通把近场的轰隆感去掉
      const lp = filt(ctx, 'lowpass', lerp(5200, 420, far), 0.85);
      const hp = filt(ctx, 'highpass', lerp(120, 260, far), 0.7);
      const pn = panner(ctx, clamp(e.pan, -1, 1));
      const g = gainNode(ctx, clamp01(e.gain) * (1 - far * 0.35));
      // 每一跳都被舱壁抹掉一点方向性
      const spread = gainNode(ctx, far * 0.35);

      tap.connect(d).connect(lp).connect(hp).connect(pn).connect(g);
      g.connect(this.sfxBus);
      g.connect(spread).connect(this.reverbSend);
      cleanup(ctx, d, t + delay + 2.5);
      cleanup(ctx, g, t + delay + 2.5);
    }

    cleanup(ctx, tap, t + maxDelay + 3);
    cleanup(ctx, direct, t + maxDelay + 3);

    // 脉冲之后整条总线短暂闪避，让回波显出来
    const now = ctx.currentTime;
    this.ambBus.gain.cancelScheduledValues(now);
    this.ambBus.gain.setValueAtTime(this.ambBus.gain.value, now);
    this.ambBus.gain.linearRampToValueAtTime(0.22, now + 0.08);
    this.ambBus.gain.linearRampToValueAtTime(this.holding ? 0.18 : 0.7, now + 1.1 + maxDelay * 0.5);
  }

  setMasterGain(g: number): void {
    if (!this.ctx) return;
    ramp(this.master.gain, this.ctx.currentTime, this.master.gain.value, clamp01(g), 0.12, false);
  }

  /** 低理智：耳鸣抬起、混响变长、音床开始跑调 */
  setCorruption(level: number): void {
    this.corruption = clamp01(level);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const tin = Math.pow(this.corruption, 1.8) * 0.055;
    ramp(this.tinnitusBus.gain, t, Math.max(0.00001, this.tinnitusBus.gain.value), Math.max(0.00001, tin), 1.4, false);
    ramp(this.revGain.gain, t, this.revGain.gain.value, 0.35 + this.corruption * 0.55, 2.0, false);
  }

  // ==========================================================================
  // 扩展接口（不在 contract 里 —— 见报告的 CONTRACT CHANGE REQUEST）
  // ==========================================================================

  /** 把呼吸时钟接进来，音频会按它的相位安排吸/呼 */
  attachBreath(clock: BreathClock): void {
    this.detachBreath?.();
    this.breath = clock;
    this.detachBreath = clock.on((kind) => {
      if (!this.ctx) return;
      if (kind === 'inhale') this.playInhale();
      else if (kind === 'exhale') this.playExhale();
      else this.playStrain();
    });
  }

  /** 屏息：全局低通 + 心跳突出。这是「生理沉浸」的开关。 */
  setHoldBreath(on: boolean): void {
    if (this.holding === on) return;
    this.holding = on;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (on) {
      ramp(this.globalLP.frequency, t, this.globalLP.frequency.value, 400, 0.30);
      ramp(this.globalLP.Q, t, this.globalLP.Q.value, 2.2, 0.30, false);
      ramp(this.heartBus.gain, t, this.heartBus.gain.value, 1.35, 0.35, false);
      ramp(this.ambBus.gain, t, this.ambBus.gain.value, 0.18, 0.40, false);
      ramp(this.breathBus.gain, t, this.breathBus.gain.value, 0.20, 0.25, false);
      ramp(this.revGain.gain, t, this.revGain.gain.value, 0.18, 0.4, false);
      this.cue('breath.hold-start', { gain: 0.9 });
    } else {
      ramp(this.globalLP.frequency, t, this.globalLP.frequency.value, 16000, 0.55);
      ramp(this.globalLP.Q, t, this.globalLP.Q.value, 0.7, 0.55, false);
      ramp(this.heartBus.gain, t, this.heartBus.gain.value, 0.55, 0.8, false);
      ramp(this.ambBus.gain, t, this.ambBus.gain.value, 0.7, 0.9, false);
      ramp(this.breathBus.gain, t, this.breathBus.gain.value, 0.75, 0.5, false);
      ramp(this.revGain.gain, t, this.revGain.gain.value, 0.35 + this.corruption * 0.55, 0.9, false);
    }
  }

  /** 深度越深，船体应力越低沉、越频繁 */
  setDepth(meters: number): void {
    this.depthN = clamp01(meters / 2100);
  }

  /** 每帧调用，推进随机事件（不做音频调度，那是 schedule() 的事） */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.bpm = lerp(this.bpm, this.targetBpm, 1 - Math.exp(-2.2 * Math.min(dt, 0.1)));
  }

  // ==========================================================================
  // 内部：调度
  // ==========================================================================

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const dt = Math.min(0.5, now - this.lastTick);
    this.lastTick = now;
    const horizon = now + 0.25;

    // --- 心跳 ---
    const period = 60 / Math.max(30, this.bpm);
    if (this.nextBeat < now - 1) this.nextBeat = now + 0.05;
    while (this.nextBeat < horizon) {
      this.scheduleHeartbeat(this.nextBeat, period);
      this.nextBeat += period;
    }

    // --- 船体应力 ---
    this.nextStress -= dt;
    if (this.nextStress <= 0) {
      this.nextStress = lerp(27, 7.5, this.depthN) * this.rng.float(0.6, 1.45);
      this.hullStress(now + 0.05);
    }

    // --- 音床点缀 ---
    const bed = this.bed;
    if (bed) {
      for (let i = 0; i < bed.spec.sprinkle.length; i++) {
        bed.sprinkleAt[i] -= dt;
        if (bed.sprinkleAt[i] <= 0) {
          const [cueName, avg] = bed.spec.sprinkle[i];
          // 污染越高，幻听越密
          const scale = 1 / (1 + this.corruption * 1.6);
          bed.sprinkleAt[i] = avg * scale * this.rng.float(0.45, 1.65);
          this.cue(cueName, {
            gain: this.rng.float(0.16, 0.42) * (0.4 + bed.gain.gain.value),
            pan: this.rng.float(-0.85, 0.85),
          });
        }
      }
    }

    // --- 低理智幻听 ---
    if (this.corruption > 0.35 && this.rng.next() < this.corruption * 0.012) {
      this.cue(this.rng.pick(['san.whisper', 'san.false-footstep', 'san.static-burst', 'san.name-called']), {
        gain: this.rng.float(0.12, 0.34),
        pan: this.rng.float(-1, 1),
      });
    }
  }

  /**
   * 心跳：两个带包络的低频正弦 + 噪声瞬态（GDD §8.2）。
   * 第二声（dub）比第一声弱、更低、离得近 —— 这个时间差是「像心跳」的关键。
   */
  private scheduleHeartbeat(t: number, period: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const fearBoost = clamp01((this.bpm - 60) / 110);
    const lvl = 0.55 + fearBoost * 0.55;
    const gap = clamp(period * 0.30, 0.13, 0.26);

    const beat = (at: number, f1: number, f2: number, amp: number, dec: number) => {
      const out = gainNode(ctx, 1);
      out.connect(this.heartBus);
      const o1 = osc(ctx, 'sine', f1);
      ramp(o1.frequency, at, f1 * 1.35, f1, dec * 0.6);
      const g1 = gainNode(ctx, 0);
      hit(g1.gain, at, amp, dec, 0.006);
      o1.connect(g1).connect(out);
      o1.start(at);
      o1.stop(at + dec + 0.1);

      const o2 = osc(ctx, 'sine', f2);
      const g2 = gainNode(ctx, 0);
      hit(g2.gain, at, amp * 0.6, dec * 0.75, 0.004);
      o2.connect(g2).connect(out);
      o2.start(at);
      o2.stop(at + dec + 0.1);

      // 噪声瞬态：瓣膜闭合的那一下，没有它就只是「低音」不是「心跳」
      const nz = noiseSource(ctx, this.noiseBuffers.brown, 1);
      const nf = filt(ctx, 'lowpass', 190 + fearBoost * 140, 1.6);
      const ng = gainNode(ctx, 0);
      hit(ng.gain, at, amp * 0.42, 0.055, 0.002);
      nz.connect(nf).connect(ng).connect(out);
      nz.start(at);
      nz.stop(at + 0.2);

      cleanup(ctx, out, at + dec + 0.35);
    };

    beat(t, 44, 62, lvl, 0.26);
    beat(t + gap, 37, 53, lvl * 0.68, 0.20);
  }

  /** 船体应力：深度越深，基频越低、泛音越密 */
  private hullStress(at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = lerp(48, 23, this.depthN);
    const out = gainNode(ctx, 0);
    const pn = panner(ctx, this.rng.float(-0.7, 0.7));
    out.connect(pn);
    pn.connect(this.sfxBus);
    pn.connect(this.reverbSend);

    const dur = lerp(3.4, 6.8, this.depthN);
    const peak = 0.20 + this.depthN * 0.30;
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(peak, at + dur * 0.28);
    out.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    // 分音数量随深度增加 —— 「越深越密」
    const partials = 3 + Math.round(this.depthN * 4);
    for (let i = 0; i < partials; i++) {
      const r = 1 + i * (0.47 + this.rng.float(-0.05, 0.08));
      const o = osc(ctx, i === 0 ? 'sine' : 'sawtooth', base * r);
      ramp(o.frequency, at, base * r, base * r * this.rng.float(0.84, 1.16), dur);
      const f = filt(ctx, 'lowpass', 150 + i * 90, 6 + i);
      ramp(f.frequency, at, 120, 340 + i * 60, dur * 0.7);
      const g = gainNode(ctx, 0.5 / (i + 1));
      o.connect(f).connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.3);
    }
    cleanup(ctx, out, at + dur + 0.6);
  }

  // ==========================================================================
  // 内部：呼吸
  // ==========================================================================

  /**
   * 吸气：滤波白噪 + 两个共振峰，带通由低往高扫。
   * 呼气：更慢、更低、更有「身体」，并且末尾带一点声门摩擦。
   * 二者的不对称是 GDD §8.2 点名要的。
   */
  private playInhale(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const b = this.breath;
    const cyc = b?.cycleSeconds ?? 4.6;
    const tension = b?.tension ?? 0;
    const dur = cyc * (0.38 - tension * 0.12) * 0.92;
    const t = ctx.currentTime + 0.01;

    const nz = noiseSource(ctx, this.noiseBuffers.white, 1);
    const bp = filt(ctx, 'bandpass', 380, 1.1 + tension * 1.4);
    ramp(bp.frequency, t, 340, 1150 + tension * 700, dur);
    const f1 = filt(ctx, 'peaking', 620, 4, 9);
    const f2 = filt(ctx, 'peaking', 1480, 5, 7);
    const g = gainNode(ctx, 0);
    const pn = panner(ctx, -0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30 + tension * 0.35, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    nz.connect(bp).connect(f1).connect(f2).connect(g).connect(pn);
    pn.connect(this.breathBus);
    pn.connect(this.reverbSend);
    nz.start(t);
    nz.stop(t + dur + 0.4);
    cleanup(ctx, g, t + dur + 0.6);
  }

  private playExhale(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const b = this.breath;
    const cyc = b?.cycleSeconds ?? 4.6;
    const tension = b?.tension ?? 0;
    const dur = cyc * (0.62 + tension * 0.12) * 0.88;
    const t = ctx.currentTime + 0.01;

    const nz = noiseSource(ctx, this.noiseBuffers.pink, 1);
    const bp = filt(ctx, 'bandpass', 900, 0.9 + tension);
    ramp(bp.frequency, t, 780 + tension * 400, 230, dur);
    const f1 = filt(ctx, 'peaking', 420, 3.5, 8);
    const f2 = filt(ctx, 'peaking', 980, 4, 5);
    const g = gainNode(ctx, 0);
    const pn = panner(ctx, 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 + tension * 0.30, t + dur * 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.1);
    nz.connect(bp).connect(f1).connect(f2).connect(g).connect(pn);
    pn.connect(this.breathBus);
    pn.connect(this.reverbSend);
    nz.start(t);
    nz.stop(t + dur + 0.4);
    cleanup(ctx, g, t + dur + 0.6);

    // 紧张时呼气末尾会有一声轻微的声门颤抖
    if (tension > 0.55 && this.rng.bool(0.35)) {
      const s: SynthCtx = {
        ctx, dest: this.breathBus, send: this.reverbSend,
        t: t + dur * 0.8, rng: this.rng.fork('glottal'),
        gain: 0.22 * tension, pan: 0, detune: 0,
      };
      hiss(s, 'bandpass', 260, 200, 6, 0.10, 0.5, 0.004);
    }
  }

  /** 屏息抽搐：横膈膜不听话了 */
  private playStrain(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s: SynthCtx = {
      ctx, dest: this.breathBus, send: this.reverbSend,
      t: ctx.currentTime + 0.01, rng: this.rng.fork('strain'),
      gain: 0.55, pan: 0, detune: 0,
    };
    hiss(s, 'bandpass', 220, 180, 7.5, 0.09, 0.6, 0.003);
    // 屏息时心跳会撞一下
    this.cue('heart.skip', { gain: 0.35 });
  }

  // ==========================================================================
  // 内部：耳鸣与音床
  // ==========================================================================

  /** 耳鸣：4–8 kHz 纯音，带极慢的滑音。低 SAN 时它才会被听见。 */
  private startTinnitus(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const tones: [number, number][] = [[5240, 1], [6880, 0.55], [4120, 0.35]];
    for (const [f, amp] of tones) {
      const o = osc(ctx, 'sine', f);
      const g = gainNode(ctx, amp);
      // 滑音 LFO：周期 17–29 秒，幅度 ±18 Hz。慢到你意识不到它在动。
      const lfo = osc(ctx, 'sine', 1 / this.rng.float(17, 29));
      const lfoG = gainNode(ctx, 18);
      lfo.connect(lfoG).connect(o.frequency);
      lfo.start(t);
      o.connect(g).connect(this.tinnitusBus);
      o.start(t);
    }
  }

  private buildBed(spec: (typeof BEDS)[string], intensity: number): BedNodes {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const gain = gainNode(ctx, 0.0001);
    gain.connect(this.ambBus);
    ramp(gain.gain, t, 0.0001, Math.max(0.0002, intensity), 2.4, false);

    const nodes: AudioNode[] = [gain];
    const sources: AudioScheduledSourceNode[] = [];

    // 次低频层：两个略微失谐的正弦，产生 0.3 Hz 的拍频 —— 让「静」也在动
    for (const mult of [1, 1.006]) {
      const o = osc(ctx, 'sine', spec.sub * mult);
      const g = gainNode(ctx, 0.28);
      o.connect(g).connect(gain);
      o.start(t);
      sources.push(o);
      nodes.push(g);
    }

    // 噪声层：棕噪 → 带通，Q 由 spec 决定；滤波中心被超慢 LFO 推着走
    const nz = noiseSource(ctx, this.noiseBuffers.brown, 0.85, true);
    const bp = filt(ctx, 'bandpass', spec.band[0], spec.band[1]);
    const ng = gainNode(ctx, 0.5);
    const lfo = osc(ctx, 'sine', 0.037);
    const lfoG = gainNode(ctx, spec.band[0] * 0.35);
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start(t);
    nz.connect(bp).connect(ng).connect(gain);
    nz.start(t);
    sources.push(nz, lfo);
    nodes.push(bp, ng, lfoG);

    // 高层空气声：让音床不闷
    const air = noiseSource(ctx, this.noiseBuffers.pink, 1, true);
    const ahp = filt(ctx, 'highpass', 2600, 0.6);
    const ag = gainNode(ctx, 0.045);
    air.connect(ahp).connect(ag).connect(gain);
    air.start(t);
    sources.push(air);
    nodes.push(ahp, ag);

    return {
      gain,
      nodes,
      sources,
      spec,
      sprinkleAt: spec.sprinkle.map(([, avg]) => avg * this.rng.float(0.2, 0.9)),
    };
  }
}

/** 给 UI / 文档用的 cue 清单 */
export { CUE_META, CUE_COUNT };
