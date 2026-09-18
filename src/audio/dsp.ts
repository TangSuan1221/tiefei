/**
 * WebAudio 合成原语
 * ============================================================================
 * 本作**不使用任何外部音频素材**。每一个声音都是在这里用振荡器、噪声与滤波器
 * 现场搭出来的。这不是炫技 —— 是因为：
 *   - 音效必须跟着深度、恐惧、SAN 连续变形，采样做不到
 *   - 声呐回波的延迟必须由房间距离实时算出来，预录的回声是假的
 *   - 零素材意味着整个游戏可以塞进几百 KB
 */

import type { Rng } from '../core/contract';
import { clamp } from '../core/util';

export interface SynthCtx {
  ctx: AudioContext;
  /** 干声去处 */
  dest: AudioNode;
  /** 混响发送 */
  send: AudioNode;
  /** 起始时刻（AudioContext 时间轴） */
  t: number;
  rng: Rng;
  gain: number;
  pan: number;
  detune: number;
}

// ----------------------------------------------------------------------------
// 噪声缓冲
// ----------------------------------------------------------------------------

export type NoiseColor = 'white' | 'pink' | 'brown' | 'blue';

export function makeNoise(ctx: AudioContext, rng: Rng, seconds: number, color: NoiseColor): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (color === 'white') {
    for (let i = 0; i < n; i++) d[i] = rng.float(-1, 1);
  } else if (color === 'pink') {
    // Paul Kellet 的经济型粉噪滤波器
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rng.float(-1, 1);
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = rng.float(-1, 1);
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = rng.float(-1, 1);
      d[i] = w - last;
      last = w;
    }
  }
  return buf;
}

/**
 * 卷积混响的脉冲响应。
 * 钢制舱室：早期反射密而硬，尾巴短但有金属染色（在 2–4 kHz 有共振峰）。
 * 水淹舱室：尾巴长、高频被吃掉。
 */
export function makeImpulse(
  ctx: AudioContext,
  rng: Rng,
  seconds: number,
  decay: number,
  metallic: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const n = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // 金属共振：几个窄带谐振器叠在噪声上
    const modes = [1870, 2430, 3110, 4260, 5170].map((f) => ({
      w: (2 * Math.PI * f * (0.96 + rng.float(0, 0.08))) / rate,
      a: rng.float(0.4, 1),
      p: rng.float(0, Math.PI * 2),
    }));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const envelope = Math.pow(1 - t, decay);
      let v = rng.float(-1, 1) * envelope;
      if (metallic > 0) {
        let m = 0;
        for (const mode of modes) m += Math.sin(mode.w * i + mode.p) * mode.a;
        v += (m / modes.length) * envelope * envelope * metallic * 0.5;
      }
      // 早期反射：前 40 ms 打几个离散的硬反射
      if (i < rate * 0.04 && rng.next() < 0.004) v += rng.float(-1, 1) * 0.9;
      d[i] = v;
    }
  }
  return buf;
}

/**
 * 一间房的脉冲响应。
 *
 * 房间越大，尾巴越长、越暗、金属染色越少 —— 三米的检修间和三十米的货舱
 * 不该是同一条尾巴，而这是玩家判断「我这台摄像头伸进了多大一个空间」的
 * 唯一线索（全息屏的分辨率低到看不出体积）。
 *
 * 进水的房间：声速在水里快三倍但衰减慢，听感上是尾巴更长、高频几乎全没。
 */
export function makeRoomImpulse(
  ctx: AudioContext,
  rng: Rng,
  sizeMeters: number,
  flooded: boolean,
): AudioBuffer {
  const m = clamp(sizeMeters, 1.5, 60);
  // 尾长按尺度的立方根走（体积 ∝ size³，Sabine 的尾长 ∝ V / A ∝ size）
  const tail = clamp(0.22 + m * 0.085, 0.3, 4.2) * (flooded ? 1.45 : 1);
  // 小房间衰减指数高 = 尾巴掉得快
  const decay = clamp(7.2 - m * 0.16, 2.0, 7.2) * (flooded ? 0.82 : 1);
  const metallic = clamp((flooded ? 0.35 : 0.9) - m * 0.012, 0.12, 0.95);
  return makeImpulse(ctx, rng, tail, decay, metallic);
}

// ----------------------------------------------------------------------------
// 节点工厂
// ----------------------------------------------------------------------------

export function gainNode(ctx: AudioContext, v = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

export function filt(
  ctx: AudioContext,
  type: BiquadFilterType,
  freq: number,
  q = 1,
  gainDb = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = clamp(freq, 10, ctx.sampleRate / 2 - 100);
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

export function panner(ctx: AudioContext, pan: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  return p;
}

export function noiseSource(ctx: AudioContext, buf: AudioBuffer, rate = 1, loop = false): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = loop;
  s.playbackRate.value = rate;
  return s;
}

export function osc(ctx: AudioContext, type: OscillatorType, freq: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = clamp(freq, 0.01, ctx.sampleRate / 2 - 100);
  return o;
}

/** 让波形不那么「电子」：给正弦加一点偶次谐波失真 */
export function saturator(ctx: AudioContext, drive: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  const k = clamp(drive, 0.01, 40);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

// ----------------------------------------------------------------------------
// 包络
// ----------------------------------------------------------------------------

/** 指数衰减不能到 0，统一用这个下限 */
const EPS = 0.0001;

export function adsr(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  sustain: number,
  hold: number,
  release: number,
): number {
  const p = Math.max(EPS, peak);
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.exponentialRampToValueAtTime(p, t + Math.max(0.001, attack));
  const susLevel = Math.max(EPS, p * sustain);
  param.exponentialRampToValueAtTime(susLevel, t + attack + Math.max(0.001, decay));
  param.setValueAtTime(susLevel, t + attack + decay + hold);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay + hold + Math.max(0.005, release));
  return attack + decay + hold + release;
}

/** 打击型包络：瞬间起，指数落 */
export function hit(param: AudioParam, t: number, peak: number, decay: number, attack = 0.002): number {
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(Math.max(EPS, peak), t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
  return attack + decay;
}

export function ramp(param: AudioParam, t: number, from: number, to: number, dur: number, exp = true): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(Math.max(EPS, from), t);
  if (exp) param.exponentialRampToValueAtTime(Math.max(EPS, to), t + Math.max(0.001, dur));
  else param.linearRampToValueAtTime(to, t + Math.max(0.001, dur));
}

// ----------------------------------------------------------------------------
// 常用「乐器」
// ----------------------------------------------------------------------------

/** 金属撞击：非谐分音是金属感的全部来源 */
export function clang(
  s: SynthCtx,
  base: number,
  ratios: readonly number[],
  decay: number,
  bright: number,
): number {
  const { ctx, t } = s;
  const out = gainNode(ctx, s.gain);
  const p = panner(ctx, s.pan);
  const sat = saturator(ctx, 2.5);
  out.connect(sat).connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  let dur = 0;
  for (let i = 0; i < ratios.length; i++) {
    const o = osc(ctx, 'sine', base * ratios[i] * Math.pow(2, s.detune / 1200));
    const g = gainNode(ctx, 0);
    const d = decay * (1 - i / (ratios.length + 1)) * (0.6 + bright * 0.8);
    hit(g.gain, t, (0.9 / (i + 1.4)) * (0.5 + bright * 0.7), d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.1);
    dur = Math.max(dur, d);
  }
  // 撞击瞬态
  const nz = noiseSource(ctx, getScratchNoise(ctx), 1 + bright);
  const nf = filt(ctx, 'bandpass', base * 6 * (0.5 + bright), 1.4);
  const ng = gainNode(ctx, 0);
  hit(ng.gain, t, 0.35 * bright, 0.05);
  nz.connect(nf).connect(ng).connect(out);
  nz.start(t);
  nz.stop(t + 0.2);
  cleanup(ctx, out, t + dur + 0.4);
  return dur;
}

/** 低频闷响：船体、脚步、关门 */
export function thud(s: SynthCtx, freq: number, decay: number, click = 0.3): number {
  const { ctx, t } = s;
  const p = panner(ctx, s.pan);
  const out = gainNode(ctx, s.gain);
  out.connect(p);
  p.connect(s.dest);
  p.connect(s.send);

  const o = osc(ctx, 'sine', freq * 2.2);
  ramp(o.frequency, t, freq * 2.2, freq * 0.8, decay * 0.5);
  const g = gainNode(ctx, 0);
  hit(g.gain, t, 0.9, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + decay + 0.1);

  const nz = noiseSource(ctx, getScratchNoise(ctx), 1);
  const nf = filt(ctx, 'lowpass', freq * 9, 0.9);
  const ng = gainNode(ctx, 0);
  hit(ng.gain, t, click, 0.04);
  nz.connect(nf).connect(ng).connect(out);
  nz.start(t);
  nz.stop(t + 0.2);

  cleanup(ctx, out, t + decay + 0.4);
  return decay;
}

/** 滤波噪声：水、气、布料、呼吸 */
export function hiss(
  s: SynthCtx,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  q: number,
  dur: number,
  peak = 0.5,
  attack = 0.02,
): number {
  const { ctx, t } = s;
  const nz = noiseSource(ctx, getScratchNoise(ctx), 1);
  const f = filt(ctx, type, f0, q);
  ramp(f.frequency, t, f0, f1, dur);
  const g = gainNode(ctx, 0);
  const p = panner(ctx, s.pan);
  adsr(g.gain, t, peak * s.gain, attack, dur * 0.35, 0.55, dur * 0.2, dur * 0.45);
  nz.connect(f).connect(g).connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  nz.start(t);
  nz.stop(t + dur + 0.6);
  cleanup(ctx, g, t + dur + 0.8);
  return dur;
}

/** 频率扫描：声呐啁啾、警报、电子音 */
export function sweep(
  s: SynthCtx,
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  peak = 0.4,
  attack = 0.004,
): number {
  const { ctx, t } = s;
  const o = osc(ctx, type, f0);
  ramp(o.frequency, t, f0, f1, dur);
  const g = gainNode(ctx, 0);
  const p = panner(ctx, s.pan);
  adsr(g.gain, t, peak * s.gain, attack, dur * 0.2, 0.7, dur * 0.35, dur * 0.4);
  o.connect(g).connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  o.start(t);
  o.stop(t + dur + 0.4);
  cleanup(ctx, g, t + dur + 0.6);
  return dur;
}

/** 气泡：正弦快速上滑 + 极短衰减。水下最有辨识度的声音。 */
export function bubble(s: SynthCtx, f0: number, dur = 0.09): number {
  const { ctx, t } = s;
  const o = osc(ctx, 'sine', f0);
  ramp(o.frequency, t, f0, f0 * 2.6, dur);
  const g = gainNode(ctx, 0);
  const p = panner(ctx, s.pan);
  hit(g.gain, t, 0.35 * s.gain, dur, 0.004);
  o.connect(g).connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  o.start(t);
  o.stop(t + dur + 0.05);
  cleanup(ctx, g, t + dur + 0.2);
  return dur;
}

/**
 * 共振峰人声。三个带通模拟元音 —— 不需要像真人，
 * 只需要让听者的大脑确信「那是有人在说话」，然后听不清内容。
 * 这正是本作要的效果（GDD §7.2 无线电里的声音）。
 */
export function voice(
  s: SynthCtx,
  f0: number,
  formants: readonly [number, number, number],
  dur: number,
  breathy = 0.3,
  vibrato = 4.5,
): number {
  const { ctx, t } = s;
  const out = gainNode(ctx, 0);
  const p = panner(ctx, s.pan);
  out.connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  adsr(out.gain, t, 0.5 * s.gain, 0.05, dur * 0.2, 0.8, dur * 0.5, dur * 0.35);

  // 声带：锯齿 + 微颤
  const o = osc(ctx, 'sawtooth', f0);
  const lfo = osc(ctx, 'sine', vibrato);
  const lfoG = gainNode(ctx, f0 * 0.012);
  lfo.connect(lfoG).connect(o.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.3);

  for (let i = 0; i < formants.length; i++) {
    const bp = filt(ctx, 'bandpass', formants[i], 7 + i * 3);
    const g = gainNode(ctx, [1, 0.55, 0.30][i]);
    o.connect(bp).connect(g).connect(out);
  }
  o.start(t);
  o.stop(t + dur + 0.3);

  if (breathy > 0) {
    const nz = noiseSource(ctx, getScratchNoise(ctx), 1);
    const nf = filt(ctx, 'bandpass', formants[2] * 1.4, 2);
    const ng = gainNode(ctx, breathy * 0.25);
    nz.connect(nf).connect(ng).connect(out);
    nz.start(t);
    nz.stop(t + dur + 0.2);
  }
  cleanup(ctx, out, t + dur + 0.6);
  return dur;
}

/** 钟 / 铃：几个高度非谐的分音 + 很长的尾巴 */
export function bell(s: SynthCtx, base: number, dur: number, inharmonic = 1): number {
  const { ctx, t } = s;
  const out = gainNode(ctx, s.gain);
  const p = panner(ctx, s.pan);
  out.connect(p);
  p.connect(s.dest);
  p.connect(s.send);
  const ratios = [1, 2.0, 2.76, 5.4, 8.93, 13.34];
  for (let i = 0; i < ratios.length; i++) {
    const r = 1 + (ratios[i] - 1) * inharmonic;
    const o = osc(ctx, 'sine', base * r);
    const g = gainNode(ctx, 0);
    hit(g.gain, t, 0.55 / (i + 1), dur * (1 - i * 0.12), 0.004);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.2);
  }
  cleanup(ctx, out, t + dur + 0.5);
  return dur;
}

/** 继电器/按键的干脆咔哒 */
export function click(s: SynthCtx, bright: number, level = 0.3): number {
  const { ctx, t } = s;
  const nz = noiseSource(ctx, getScratchNoise(ctx), 1 + bright * 0.5);
  const f = filt(ctx, 'bandpass', 900 + bright * 4200, 1.1);
  const g = gainNode(ctx, 0);
  const p = panner(ctx, s.pan);
  hit(g.gain, t, level * s.gain, 0.02 + (1 - bright) * 0.04, 0.001);
  nz.connect(f).connect(g).connect(p);
  p.connect(s.dest);
  nz.start(t);
  nz.stop(t + 0.15);
  cleanup(ctx, g, t + 0.3);
  return 0.06;
}

// ----------------------------------------------------------------------------
// 资源管理
// ----------------------------------------------------------------------------

const scratchCache = new WeakMap<AudioContext, AudioBuffer>();

/** 短白噪缓冲，所有瞬态都从它来。只生成一次。 */
export function getScratchNoise(ctx: AudioContext): AudioBuffer {
  let b = scratchCache.get(ctx);
  if (!b) {
    const n = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    // 确定性：固定 LCG，不依赖 Rng 实例，也绝不用 Math.random
    let s = 0x2f6e2b1 >>> 0;
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 0x80000000) - 1;
    }
    scratchCache.set(ctx, b);
  }
  return b;
}

const pending: { node: AudioNode; at: number }[] = [];
let sweeper: number | null = null;

/** 到时间自动断开，防止节点泄漏 —— 一场 60 分钟的 run 会产生上万个节点 */
export function cleanup(ctx: AudioContext, node: AudioNode, at: number): void {
  pending.push({ node, at });
  if (sweeper === null) {
    sweeper = setInterval(() => {
      const now = ctx.currentTime;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].at <= now) {
          try {
            pending[i].node.disconnect();
          } catch {
            /* 已断开 */
          }
          pending.splice(i, 1);
        }
      }
      if (pending.length === 0 && sweeper !== null) {
        clearInterval(sweeper);
        sweeper = null;
      }
    }, 500) as unknown as number;
  }
}

export function activeNodeCount(): number {
  return pending.length;
}
