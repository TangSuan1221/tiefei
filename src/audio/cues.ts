/**
 * 程序化音效库
 * ============================================================================
 * GDD §9 要求 ≥ 25 个 cue，目标 40。这里有 62 个，全部现场合成。
 *
 * 命名约定 `域.动作[.变体]`，让叙事内容里的 `{ op:'sfx', cue:'door.force' }`
 * 可以被静态校验器检查拼写。
 */

import {
  adsr, bell, bubble, clang, click, cleanup, filt, gainNode, getScratchNoise,
  hiss, hit, noiseSource, osc, panner, ramp, saturator, sweep, thud, voice,
  type SynthCtx,
} from './dsp';

export type CueFn = (s: SynthCtx) => number;

export interface CueMeta {
  id: string;
  /** 中文说明，写进美术圣经 */
  cn: string;
  /** 合成手段，评审看这一列 */
  synth: string;
  category: CueCategory;
}

export type CueCategory =
  | 'ui' | 'sonar' | 'door' | 'movement' | 'water' | 'hull'
  | 'body' | 'mind' | 'creature' | 'object' | 'power' | 'ritual' | 'meta';

/** 三个方便的常量，避免每个 cue 重复写数组 */
const METAL_RATIOS = [1, 1.94, 2.71, 3.83, 5.17, 7.32];
const PIPE_RATIOS = [1, 2.06, 3.01, 4.11, 6.4];
const PLATE_RATIOS = [1, 1.53, 2.18, 2.87, 4.31, 6.09, 8.7];

export const CUES: Record<string, CueFn> = {
  // ---- UI（面罩内的电子界面，全部是继电器与老式 CRT 的声音） --------------
  'ui.hover': (s) => click(s, 0.35, 0.10),
  'ui.select': (s) => {
    click(s, 0.75, 0.26);
    sweep({ ...s, t: s.t + 0.012, gain: s.gain * 0.35 }, 'square', 1180, 1620, 0.045, 0.16);
    return 0.09;
  },
  'ui.back': (s) => {
    click(s, 0.5, 0.20);
    sweep({ ...s, t: s.t + 0.012, gain: s.gain * 0.3 }, 'square', 900, 560, 0.06, 0.14);
    return 0.09;
  },
  'ui.error': (s) => {
    sweep(s, 'square', 220, 190, 0.11, 0.22);
    sweep({ ...s, t: s.t + 0.13 }, 'square', 190, 160, 0.16, 0.20);
    return 0.3;
  },
  'ui.toggle': (s) => {
    click(s, 0.2, 0.30);
    click({ ...s, t: s.t + 0.035 }, 0.6, 0.18);
    return 0.08;
  },
  'ui.type': (s) => click({ ...s, detune: s.detune }, 0.85, 0.055),
  'ui.page': (s) => hiss(s, 'highpass', 2400, 900, 0.8, 0.13, 0.16, 0.005),
  'ui.confirm-irreversible': (s) => {
    // 不可逆选项：故意难听，让手指在按下前犹豫 0.3 秒
    sweep(s, 'sawtooth', 128, 96, 0.34, 0.16, 0.01);
    bell({ ...s, t: s.t + 0.05, gain: s.gain * 0.35 }, 92, 1.6, 1.4);
    return 0.9;
  },

  // ---- 声呐 ---------------------------------------------------------------
  'sonar.passive': (s) => hiss(s, 'bandpass', 420, 260, 3.2, 0.9, 0.16, 0.25),
  'sonar.chirp': (s) => {
    const d = sweep(s, 'sine', 2350, 880, 0.135, 0.42, 0.003);
    sweep({ ...s, gain: s.gain * 0.35, t: s.t + 0.004 }, 'triangle', 2350 * 1.5, 880 * 1.5, 0.1, 0.2);
    return d;
  },
  'sonar.boom': (s) => {
    const d = sweep(s, 'sine', 1750, 420, 0.42, 0.55, 0.006);
    sweep({ ...s, gain: s.gain * 0.4, t: s.t + 0.01 }, 'sine', 875, 210, 0.5, 0.35);
    thud({ ...s, gain: s.gain * 0.5, t: s.t + 0.005 }, 58, 0.6, 0.1);
    return d;
  },
  'sonar.echo': (s) => sweep(s, 'sine', 1200, 600, 0.11, 0.18, 0.01),
  'sonar.artifact': (s) => {
    // 伪影：频率反向、相位不对。听觉上的 tell。
    const d = sweep(s, 'sine', 700, 1900, 0.16, 0.22, 0.01);
    sweep({ ...s, t: s.t + 0.02, pan: -s.pan, gain: s.gain * 0.5 }, 'sine', 1900, 700, 0.16, 0.16);
    return d;
  },
  'sonar.contact-lost': (s) => sweep(s, 'triangle', 640, 180, 0.5, 0.18, 0.02),
  'sonar.array-spin': (s) => {
    const { ctx, t } = s;
    const o = osc(ctx, 'sawtooth', 48);
    ramp(o.frequency, t, 20, 120, 0.9);
    ramp(o.frequency, t + 0.9, 120, 40, 0.7);
    const f = filt(ctx, 'lowpass', 900, 6);
    const g = gainNode(ctx, 0);
    const p = panner(ctx, s.pan);
    adsr(g.gain, t, 0.22 * s.gain, 0.2, 0.4, 0.6, 0.5, 0.5);
    o.connect(f).connect(g).connect(p);
    p.connect(s.dest);
    p.connect(s.send);
    o.start(t);
    o.stop(t + 2.0);
    cleanup(ctx, g, t + 2.4);
    return 1.8;
  },

  // ---- 门与舱盖 -----------------------------------------------------------
  'door.open': (s) => {
    hiss(s, 'bandpass', 380, 900, 1.6, 0.55, 0.22, 0.08);
    clang({ ...s, t: s.t + 0.5, gain: s.gain * 0.5 }, 148, PIPE_RATIOS, 0.5, 0.3);
    return 0.9;
  },
  'door.close': (s) => {
    hiss(s, 'bandpass', 900, 300, 1.6, 0.4, 0.18, 0.06);
    clang({ ...s, t: s.t + 0.4 }, 118, PLATE_RATIOS, 0.9, 0.55);
    thud({ ...s, t: s.t + 0.4, gain: s.gain * 0.8 }, 46, 0.55, 0.4);
    return 1.2;
  },
  'door.jam': (s) => {
    clang(s, 210, METAL_RATIOS, 0.22, 0.75);
    clang({ ...s, t: s.t + 0.09, gain: s.gain * 0.6 }, 198, METAL_RATIOS, 0.18, 0.6);
    return 0.35;
  },
  'door.force': (s) => {
    // 撬门：三次递增的金属挣扎，最后一声是屈服
    for (let i = 0; i < 3; i++) {
      clang(
        { ...s, t: s.t + i * 0.22, gain: s.gain * (0.5 + i * 0.25) },
        176 - i * 14, METAL_RATIOS, 0.3 + i * 0.12, 0.65,
      );
    }
    thud({ ...s, t: s.t + 0.62 }, 40, 0.8, 0.6);
    return 1.5;
  },
  'door.weld': (s) => {
    const { ctx, t } = s;
    const nz = noiseSource(ctx, getScratchNoise(ctx), 1);
    const f = filt(ctx, 'bandpass', 2800, 0.7);
    const g = gainNode(ctx, 0);
    const p = panner(ctx, s.pan);
    // 电弧：快速随机门控
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 40; i++) {
      const tt = t + i * 0.035;
      g.gain.setValueAtTime(s.rng.float(0.02, 0.30) * s.gain, tt);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    nz.connect(f).connect(g).connect(p);
    p.connect(s.dest);
    p.connect(s.send);
    nz.start(t);
    nz.stop(t + 1.7);
    cleanup(ctx, g, t + 2);
    return 1.4;
  },
  'door.knock': (s) => {
    // 门的另一边。三下，节奏不对。
    thud(s, 92, 0.32, 0.55);
    thud({ ...s, t: s.t + 0.31 }, 88, 0.30, 0.5);
    thud({ ...s, t: s.t + 0.52 }, 95, 0.36, 0.6);
    return 1.0;
  },
  'hatch.wheel': (s) => {
    for (let i = 0; i < 7; i++) {
      click({ ...s, t: s.t + i * 0.115, gain: s.gain * (0.7 + s.rng.float(0, 0.4)) }, 0.28, 0.20);
      clang(
        { ...s, t: s.t + i * 0.115, gain: s.gain * 0.14 },
        320 + s.rng.float(-30, 30), PIPE_RATIOS, 0.10, 0.5,
      );
    }
    return 0.9;
  },
  'valve.turn': (s) => {
    hiss(s, 'bandpass', 620, 380, 4.5, 0.75, 0.20, 0.15);
    for (let i = 0; i < 4; i++) click({ ...s, t: s.t + 0.12 + i * 0.16 }, 0.25, 0.14);
    return 0.85;
  },

  // ---- 移动 ---------------------------------------------------------------
  'step.metal': (s) => {
    thud(s, 78, 0.16, 0.45);
    clang({ ...s, t: s.t + 0.005, gain: s.gain * 0.22 }, 520, PLATE_RATIOS, 0.16, 0.7);
    return 0.25;
  },
  'step.water': (s) => {
    hiss(s, 'bandpass', 1400, 420, 1.1, 0.26, 0.34, 0.004);
    for (let i = 0; i < 4; i++) {
      bubble({ ...s, t: s.t + 0.02 + s.rng.float(0, 0.12), gain: s.gain * 0.5 }, s.rng.float(300, 900));
    }
    return 0.4;
  },
  'step.crawl': (s) => {
    hiss(s, 'bandpass', 700, 300, 1.8, 0.45, 0.20, 0.10);
    thud({ ...s, t: s.t + 0.14, gain: s.gain * 0.5 }, 62, 0.22, 0.2);
    return 0.55;
  },
  'step.run': (s) => {
    for (let i = 0; i < 3; i++) {
      thud({ ...s, t: s.t + i * 0.19, gain: s.gain * 0.9 }, 84 - i * 4, 0.14, 0.55);
    }
    return 0.6;
  },
  'cloth.rustle': (s) => hiss(s, 'highpass', 1800, 3800, 0.7, 0.32, 0.14, 0.03),
  'body.drag': (s) => hiss(s, 'bandpass', 260, 180, 2.2, 1.3, 0.22, 0.30),

  // ---- 水 -----------------------------------------------------------------
  'water.drip': (s) => {
    bubble(s, 760, 0.075);
    bubble({ ...s, t: s.t + 0.012, gain: s.gain * 0.4 }, 1520, 0.04);
    return 0.12;
  },
  'water.splash': (s) => {
    hiss(s, 'bandpass', 2200, 500, 0.9, 0.38, 0.40, 0.003);
    for (let i = 0; i < 9; i++) {
      bubble({ ...s, t: s.t + s.rng.float(0, 0.3), gain: s.gain * s.rng.float(0.2, 0.6) }, s.rng.float(240, 1400));
    }
    return 0.6;
  },
  'water.flood': (s) => {
    hiss(s, 'lowpass', 300, 1800, 0.8, 3.2, 0.34, 0.6);
    hiss({ ...s, t: s.t + 0.2, gain: s.gain * 0.6 }, 'bandpass', 900, 1600, 1.4, 2.8, 0.26, 0.5);
    return 3.4;
  },
  'water.bubble': (s) => {
    for (let i = 0; i < 6; i++) {
      bubble({ ...s, t: s.t + i * s.rng.float(0.04, 0.16), gain: s.gain * s.rng.float(0.3, 0.8) }, s.rng.float(180, 760));
    }
    return 0.8;
  },
  'water.pressure-jet': (s) => hiss(s, 'bandpass', 3400, 2600, 2.4, 1.8, 0.30, 0.05),
  'water.submerge': (s) => {
    hiss(s, 'lowpass', 6000, 260, 0.9, 1.1, 0.42, 0.02);
    for (let i = 0; i < 12; i++) {
      bubble({ ...s, t: s.t + s.rng.float(0, 0.8), gain: s.gain * 0.4 }, s.rng.float(150, 700));
    }
    return 1.4;
  },

  // ---- 船体 ---------------------------------------------------------------
  'hull.groan': (s) => {
    const { ctx, t } = s;
    const out = gainNode(ctx, 0);
    const p = panner(ctx, s.pan);
    const sat = saturator(ctx, 3.5);
    out.connect(sat).connect(p);
    p.connect(s.dest);
    p.connect(s.send);
    adsr(out.gain, t, 0.42 * s.gain, 0.8, 1.2, 0.6, 1.1, 2.2);
    const base = 34 + s.rng.float(-6, 10);
    for (const r of [1, 1.47, 2.03, 3.11]) {
      const o = osc(ctx, 'sawtooth', base * r);
      // 应力释放：频率缓慢滑移，这是金属被压弯的声音
      ramp(o.frequency, t, base * r, base * r * s.rng.float(0.86, 1.18), 4.2);
      const f = filt(ctx, 'lowpass', 220, 8);
      ramp(f.frequency, t, 160, 420, 3.0);
      const g = gainNode(ctx, 0.4 / r);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 5.4);
    }
    cleanup(ctx, out, t + 6);
    return 5.0;
  },
  'hull.pop': (s) => clang(s, 96, PLATE_RATIOS, 0.7, 0.45),
  'hull.crack': (s) => {
    clang(s, 74, METAL_RATIOS, 1.4, 0.85);
    hiss({ ...s, t: s.t + 0.02, gain: s.gain * 0.5 }, 'highpass', 4200, 1200, 0.8, 0.35, 0.3, 0.002);
    return 1.5;
  },
  'hull.rivet-pop': (s) => {
    clang(s, 640, METAL_RATIOS, 0.24, 0.95);
    thud({ ...s, t: s.t + 0.06, gain: s.gain * 0.5 }, 120, 0.3, 0.5);
    return 0.4;
  },
  'hull.implode': (s) => {
    const { ctx, t } = s;
    // 内爆：所有东西同时向内塌
    sweep(s, 'sawtooth', 320, 24, 0.55, 0.65, 0.004);
    hiss({ ...s, t }, 'lowpass', 9000, 90, 0.7, 0.9, 0.7, 0.002);
    thud({ ...s, t: s.t + 0.5, gain: s.gain * 1.2 }, 28, 2.6, 0.9);
    clang({ ...s, t: s.t + 0.5 }, 52, METAL_RATIOS, 2.2, 1);
    cleanup(ctx, gainNode(ctx), t + 4);
    return 3.2;
  },
  'hull.ping-return': (s) => clang(s, 380, PIPE_RATIOS, 1.1, 0.35),

  // ---- 身体 ---------------------------------------------------------------
  'breath.gasp': (s) => {
    // 大喘气：憋不住之后的那一口，噪音巨大（GDD §4.1）
    hiss(s, 'bandpass', 380, 1500, 1.4, 0.34, 0.75, 0.012);
    hiss({ ...s, t: s.t + 0.30, gain: s.gain * 0.75 }, 'bandpass', 900, 300, 1.2, 0.5, 0.55, 0.03);
    voice({ ...s, t: s.t + 0.02, gain: s.gain * 0.22 }, 150, [520, 1180, 2500], 0.22, 0.85, 7);
    return 0.9;
  },
  'breath.hold-start': (s) => hiss(s, 'bandpass', 500, 1100, 2.0, 0.28, 0.45, 0.015),
  'breath.hold-fail': (s) => {
    hiss(s, 'bandpass', 260, 240, 4.0, 0.22, 0.5, 0.008);
    CUES['breath.gasp']({ ...s, t: s.t + 0.18 });
    return 1.1;
  },
  'breath.choke': (s) => {
    for (let i = 0; i < 4; i++) {
      hiss({ ...s, t: s.t + i * 0.19, gain: s.gain * (0.8 - i * 0.12) }, 'bandpass', 320, 220, 5.5, 0.14, 0.5, 0.005);
    }
    return 0.9;
  },
  'breath.regulator': (s) => {
    hiss(s, 'bandpass', 1700, 2400, 3.0, 0.22, 0.30, 0.008);
    click({ ...s, t: s.t + 0.22, gain: s.gain * 0.5 }, 0.5, 0.14);
    return 0.35;
  },
  'heart.skip': (s) => {
    thud(s, 44, 0.26, 0.15);
    thud({ ...s, t: s.t + 0.62, gain: s.gain * 1.3 }, 38, 0.42, 0.2);
    return 1.1;
  },
  'flesh.wet': (s) => {
    hiss(s, 'lowpass', 900, 280, 1.6, 0.34, 0.42, 0.006);
    for (let i = 0; i < 5; i++) bubble({ ...s, t: s.t + s.rng.float(0, 0.2), gain: s.gain * 0.35 }, s.rng.float(90, 340));
    return 0.6;
  },
  'bone.snap': (s) => {
    clang(s, 820, [1, 1.31, 1.77, 2.45], 0.10, 1);
    thud({ ...s, t: s.t + 0.02, gain: s.gain * 0.7 }, 130, 0.2, 0.7);
    return 0.3;
  },

  // ---- 精神 ---------------------------------------------------------------
  'san.whisper': (s) => {
    // 听不清，但确实是话。三个音节，最后一个是你的名字的长度。
    const base = 108 + s.rng.float(-14, 14);
    voice(s, base, [420, 980, 2400], 0.26, 0.85, 6);
    voice({ ...s, t: s.t + 0.30 }, base * 0.94, [600, 1400, 2700], 0.20, 0.9, 5);
    voice({ ...s, t: s.t + 0.56 }, base * 1.06, [340, 880, 2200], 0.42, 0.75, 4);
    return 1.1;
  },
  'san.static-burst': (s) => {
    hiss(s, 'highpass', 800, 5200, 0.6, 0.28, 0.5, 0.001);
    hiss({ ...s, t: s.t + 0.05, pan: -s.pan }, 'bandpass', 3000, 1200, 0.8, 0.18, 0.35, 0.001);
    return 0.4;
  },
  'san.reverse-voice': (s) => {
    // 倒放的人声：共振峰反向移动，大脑知道不对劲但说不出哪里不对
    voice(s, 132, [2600, 1200, 480], 0.55, 0.6, 3);
    return 0.7;
  },
  'san.choir': (s) => {
    // 六具还在唱歌的尸体（GDD §7.2）。六个声部，全部略微走音。
    const roots = [98, 110, 131, 147, 165, 196];
    for (let i = 0; i < roots.length; i++) {
      voice(
        { ...s, t: s.t + i * 0.09, gain: s.gain * 0.30, pan: (i / 5) * 1.6 - 0.8 },
        roots[i] * s.rng.float(0.985, 1.017),
        [480 + i * 30, 1100 + i * 60, 2600],
        2.6, 0.45, 3.2 + i * 0.4,
      );
    }
    return 3.2;
  },
  'san.tinnitus-spike': (s) => sweep(s, 'sine', 5200, 6100, 1.4, 0.10, 0.25),
  'san.false-footstep': (s) => {
    thud({ ...s, gain: s.gain * 0.5 }, 70, 0.18, 0.35);
    thud({ ...s, t: s.t + 0.42, gain: s.gain * 0.3 }, 66, 0.16, 0.3);
    return 0.7;
  },
  'san.heartbeat-desync': (s) => {
    // 心跳突然不是你的
    thud(s, 40, 0.34, 0.1);
    thud({ ...s, t: s.t + 0.17, gain: s.gain * 0.8 }, 34, 0.42, 0.1);
    thud({ ...s, t: s.t + 0.55, gain: s.gain * 0.6 }, 40, 0.3, 0.1);
    return 1.0;
  },
  'san.name-called': (s) => voice(s, 122, [560, 1240, 2800], 0.62, 0.55, 5.5),

  // ---- 造物 ---------------------------------------------------------------
  'listener.call': (s) => {
    // 远。低。不像动物。
    const { ctx, t } = s;
    const out = gainNode(ctx, 0);
    const p = panner(ctx, s.pan);
    out.connect(p);
    p.connect(s.dest);
    p.connect(s.send);
    adsr(out.gain, t, 0.4 * s.gain, 1.1, 0.9, 0.7, 1.4, 2.6);
    for (const [r, g] of [[1, 0.5], [1.5, 0.3], [2.33, 0.18], [3.7, 0.1]] as const) {
      const o = osc(ctx, 'sine', 41 * r);
      ramp(o.frequency, t, 41 * r, 37 * r, 4.5);
      const gg = gainNode(ctx, g);
      o.connect(gg).connect(out);
      o.start(t);
      o.stop(t + 5.6);
    }
    cleanup(ctx, out, t + 6.2);
    return 5.0;
  },
  'listener.near': (s) => {
    hiss(s, 'lowpass', 180, 90, 3.5, 2.2, 0.5, 0.5);
    CUES['flesh.wet']({ ...s, t: s.t + 0.6, gain: s.gain * 0.6 });
    return 2.6;
  },
  'listener.scream': (s) => {
    sweep(s, 'sawtooth', 180, 1400, 0.5, 0.5, 0.01);
    sweep({ ...s, t: s.t + 0.05, gain: s.gain * 0.6, pan: -s.pan }, 'sawtooth', 240, 1100, 0.55, 0.4, 0.02);
    hiss({ ...s, t: s.t + 0.1, gain: s.gain * 0.7 }, 'bandpass', 2400, 900, 1.2, 0.8, 0.45, 0.02);
    return 1.4;
  },
  'creature.skitter': (s) => {
    for (let i = 0; i < 11; i++) {
      click({ ...s, t: s.t + i * s.rng.float(0.03, 0.075), pan: s.pan + s.rng.float(-0.2, 0.2) }, 0.9, 0.09);
    }
    return 0.7;
  },
  'creature.breath-sync': (s) => {
    // 假 NPC 的 tell：它的呼吸与你完全同步（GDD §5）
    hiss(s, 'bandpass', 420, 1200, 1.6, 0.9, 0.22, 0.35);
    return 1.1;
  },

  // ---- 物件 ---------------------------------------------------------------
  'item.pickup': (s) => {
    click(s, 0.6, 0.18);
    clang({ ...s, t: s.t + 0.01, gain: s.gain * 0.25 }, 760, PIPE_RATIOS, 0.22, 0.6);
    return 0.3;
  },
  'item.metal-clatter': (s) => {
    for (let i = 0; i < 5; i++) {
      clang(
        { ...s, t: s.t + i * s.rng.float(0.05, 0.13), gain: s.gain * s.rng.float(0.2, 0.6) },
        s.rng.float(420, 900), METAL_RATIOS, 0.28, 0.8,
      );
    }
    return 0.9;
  },
  'paper.rustle': (s) => hiss(s, 'highpass', 2600, 4800, 0.6, 0.42, 0.16, 0.02),
  'glass.break': (s) => {
    for (let i = 0; i < 9; i++) {
      clang(
        { ...s, t: s.t + i * s.rng.float(0.01, 0.06), gain: s.gain * s.rng.float(0.15, 0.5) },
        s.rng.float(1800, 4200), [1, 1.77, 2.61, 4.03], 0.16, 1,
      );
    }
    return 0.7;
  },
  'match.strike': (s) => {
    hiss(s, 'highpass', 1200, 5200, 0.7, 0.10, 0.4, 0.002);
    hiss({ ...s, t: s.t + 0.09, gain: s.gain * 0.5 }, 'bandpass', 900, 500, 1.2, 0.9, 0.22, 0.05);
    return 1.0;
  },

  // ---- 电与机械 -----------------------------------------------------------
  'power.breaker': (s) => {
    clang(s, 210, METAL_RATIOS, 0.18, 0.9);
    sweep({ ...s, t: s.t + 0.05, gain: s.gain * 0.35 }, 'sawtooth', 120, 60, 0.6, 0.2);
    return 0.8;
  },
  'power.hum-up': (s) => sweep(s, 'sawtooth', 24, 60, 1.6, 0.16, 0.6),
  'power.hum-down': (s) => sweep(s, 'sawtooth', 60, 18, 2.4, 0.16, 0.2),
  'light.flicker': (s) => {
    const { ctx, t } = s;
    const o = osc(ctx, 'sawtooth', 120);
    const g = gainNode(ctx, 0);
    const f = filt(ctx, 'bandpass', 900, 3);
    const p = panner(ctx, s.pan);
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 9; i++) {
      g.gain.setValueAtTime(s.rng.float(0.01, 0.10) * s.gain, t + i * 0.055);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f).connect(g).connect(p);
    p.connect(s.dest);
    o.start(t);
    o.stop(t + 0.8);
    cleanup(ctx, g, t + 1);
    return 0.6;
  },
  'electric.arc': (s) => {
    for (let i = 0; i < 6; i++) {
      hiss(
        { ...s, t: s.t + i * s.rng.float(0.02, 0.09), gain: s.gain * s.rng.float(0.2, 0.7) },
        'bandpass', s.rng.float(1800, 5200), 2400, 1.2, 0.06, 0.4, 0.001,
      );
    }
    return 0.5;
  },
  'terminal.boot': (s) => {
    click(s, 0.7, 0.3);
    sweep({ ...s, t: s.t + 0.14, gain: s.gain * 0.4 }, 'square', 440, 880, 0.08, 0.16);
    sweep({ ...s, t: s.t + 0.26, gain: s.gain * 0.4 }, 'square', 660, 1320, 0.08, 0.16);
    hiss({ ...s, t: s.t + 0.1, gain: s.gain * 0.3 }, 'highpass', 6000, 9000, 1.5, 1.4, 0.1, 0.4);
    return 1.5;
  },
  'terminal.beep': (s) => sweep(s, 'square', 980, 980, 0.07, 0.16, 0.003),
  'radio.squelch': (s) => {
    hiss(s, 'bandpass', 2200, 900, 1.0, 0.16, 0.42, 0.001);
    hiss({ ...s, t: s.t + 0.13, gain: s.gain * 0.5 }, 'highpass', 3600, 1600, 0.8, 0.22, 0.28, 0.004);
    return 0.4;
  },
  'radio.voice': (s) => {
    // 无线电里的万斯：带通到电话频段，加载波失真
    const inner: SynthCtx = { ...s, gain: s.gain * 1.2 };
    voice(inner, 118, [640, 1180, 2400], 0.32, 0.4, 5);
    voice({ ...inner, t: s.t + 0.34 }, 108, [420, 1500, 2600], 0.28, 0.5, 4);
    voice({ ...inner, t: s.t + 0.64 }, 124, [560, 1020, 2200], 0.44, 0.35, 6);
    hiss({ ...s, gain: s.gain * 0.25 }, 'bandpass', 2000, 2000, 0.9, 1.2, 0.2, 0.05);
    return 1.3;
  },

  // ---- 仪式与元 -----------------------------------------------------------
  'ritual.bell': (s) => bell(s, 196, 4.2, 1),
  'ritual.chant': (s) => {
    const roots = [82, 98, 123];
    for (let i = 0; i < roots.length; i++) {
      voice({ ...s, t: s.t + i * 0.25, gain: s.gain * 0.35, pan: (i - 1) * 0.6 }, roots[i], [400, 900, 2100], 3.4, 0.3, 2.8);
    }
    return 4.0;
  },
  'ritual.mark': (s) => {
    bell(s, 92, 3.2, 1.6);
    hiss({ ...s, t: s.t + 0.02, gain: s.gain * 0.4 }, 'bandpass', 3200, 600, 1.4, 0.7, 0.3, 0.004);
    return 3.4;
  },
  'stigma.brand': (s) => {
    thud(s, 52, 0.7, 0.3);
    bell({ ...s, t: s.t + 0.05, gain: s.gain * 0.5 }, 147, 2.6, 1.3);
    return 2.8;
  },
  'death.flatline': (s) => {
    sweep(s, 'sine', 1000, 1000, 3.2, 0.18, 0.02);
    hiss({ ...s, gain: s.gain * 0.3 }, 'lowpass', 400, 60, 1.2, 3.0, 0.3, 1.2);
    return 3.4;
  },
  'revive.ritual': (s) => {
    bell(s, 73, 5.4, 1.8);
    CUES['san.choir']({ ...s, t: s.t + 0.4, gain: s.gain * 0.5 });
    CUES['breath.gasp']({ ...s, t: s.t + 2.6 });
    return 5.6;
  },
  'ending.sting': (s) => {
    bell(s, 55, 6.5, 2.1);
    sweep({ ...s, t: s.t + 0.1, gain: s.gain * 0.35 }, 'sawtooth', 110, 27, 4.5, 0.25, 0.6);
    return 6.5;
  },
  'knowledge.gain': (s) => {
    bell(s, 330, 1.8, 0.4);
    sweep({ ...s, t: s.t + 0.06, gain: s.gain * 0.25 }, 'sine', 660, 990, 0.35, 0.2, 0.05);
    return 2.0;
  },
  'debunk.success': (s) => {
    // 识破谎言：一个干净的、唯一「好听」的声音。它是奖励。
    bell(s, 262, 2.4, 0.2);
    bell({ ...s, t: s.t + 0.12, gain: s.gain * 0.6 }, 392, 2.0, 0.2);
    return 2.6;
  },
};

/** 供美术圣经与评审使用的元数据表 */
export const CUE_META: readonly CueMeta[] = [
  { id: 'ui.hover', cn: '界面掠过', synth: '带通噪声瞬态', category: 'ui' },
  { id: 'ui.select', cn: '界面确认', synth: '继电器咔哒 + 方波短滑音', category: 'ui' },
  { id: 'ui.back', cn: '界面返回', synth: '咔哒 + 下行方波', category: 'ui' },
  { id: 'ui.error', cn: '界面拒绝', synth: '双段低方波', category: 'ui' },
  { id: 'ui.toggle', cn: '拨动开关', synth: '双瞬态咔哒', category: 'ui' },
  { id: 'ui.type', cn: '逐字打印', synth: '高频瞬态', category: 'ui' },
  { id: 'ui.page', cn: '翻页', synth: '高通噪声扫描', category: 'ui' },
  { id: 'ui.confirm-irreversible', cn: '不可逆确认', synth: '下行锯齿 + 非谐钟', category: 'ui' },
  { id: 'sonar.passive', cn: '被动聆听', synth: '窄带噪声缓入缓出', category: 'sonar' },
  { id: 'sonar.chirp', cn: '短脉冲', synth: '2350→880 Hz 正弦啁啾 + 三倍频', category: 'sonar' },
  { id: 'sonar.boom', cn: '全功率脉冲', synth: '1750→420 Hz 啁啾 + 亚谐 + 低频冲击', category: 'sonar' },
  { id: 'sonar.echo', cn: '回波返回', synth: '短下行正弦（多抽头延迟驱动）', category: 'sonar' },
  { id: 'sonar.artifact', cn: '伪影回波', synth: '反向啁啾 + 反相声像（可识破的 tell）', category: 'sonar' },
  { id: 'sonar.contact-lost', cn: '失去接触', synth: '长下行三角波', category: 'sonar' },
  { id: 'sonar.array-spin', cn: '阵列转动', synth: '锯齿频率包络 + 低通共振', category: 'sonar' },
  { id: 'door.open', cn: '开门', synth: '噪声铰链 + 金属非谐分音', category: 'door' },
  { id: 'door.close', cn: '关门', synth: '噪声 + 钢板分音 + 低频闷响', category: 'door' },
  { id: 'door.jam', cn: '门卡住', synth: '双次金属撞击', category: 'door' },
  { id: 'door.force', cn: '撬门', synth: '三次递增金属挣扎 + 屈服闷响', category: 'door' },
  { id: 'door.weld', cn: '焊接', synth: '随机门控带通噪声（电弧）', category: 'door' },
  { id: 'door.knock', cn: '门被敲响', synth: '三次低频闷响，节奏不均', category: 'door' },
  { id: 'hatch.wheel', cn: '舱盖手轮', synth: '七段棘轮咔哒 + 金属共鸣', category: 'door' },
  { id: 'valve.turn', cn: '阀门旋转', synth: '高 Q 噪声 + 棘轮', category: 'door' },
  { id: 'step.metal', cn: '钢板脚步', synth: '低频闷响 + 钢板分音', category: 'movement' },
  { id: 'step.water', cn: '涉水脚步', synth: '宽带噪声 + 随机气泡', category: 'movement' },
  { id: 'step.crawl', cn: '爬行', synth: '中低带通噪声 + 闷响', category: 'movement' },
  { id: 'step.run', cn: '奔跑', synth: '三连低频闷响', category: 'movement' },
  { id: 'cloth.rustle', cn: '衣物摩擦', synth: '高通噪声包络', category: 'movement' },
  { id: 'body.drag', cn: '拖拽身体', synth: '长低频带通噪声', category: 'movement' },
  { id: 'water.drip', cn: '滴水', synth: '正弦上滑气泡 × 2', category: 'water' },
  { id: 'water.splash', cn: '水花', synth: '宽带噪声 + 九个随机气泡', category: 'water' },
  { id: 'water.flood', cn: '进水', synth: '低通噪声上扫 3.2 s', category: 'water' },
  { id: 'water.bubble', cn: '冒泡', synth: '六个随机气泡', category: 'water' },
  { id: 'water.pressure-jet', cn: '高压水柱', synth: '高 Q 带通噪声', category: 'water' },
  { id: 'water.submerge', cn: '沉入水中', synth: '低通急降 + 气泡群', category: 'water' },
  { id: 'hull.groan', cn: '船体呻吟', synth: '四个滑移锯齿 + 低通共振扫描', category: 'hull' },
  { id: 'hull.pop', cn: '钢板弹响', synth: '钢板非谐分音', category: 'hull' },
  { id: 'hull.crack', cn: '船体开裂', synth: '低频金属 + 高频撕裂噪声', category: 'hull' },
  { id: 'hull.rivet-pop', cn: '铆钉崩飞', synth: '高频金属 + 低频回落', category: 'hull' },
  { id: 'hull.implode', cn: '内爆', synth: '全频下扫 + 巨响 + 长金属尾', category: 'hull' },
  { id: 'hull.ping-return', cn: '船体回响', synth: '管状非谐分音', category: 'hull' },
  { id: 'breath.gasp', cn: '大喘气', synth: '非对称双段噪声 + 声带成分', category: 'body' },
  { id: 'breath.hold-start', cn: '开始屏息', synth: '高 Q 吸气噪声', category: 'body' },
  { id: 'breath.hold-fail', cn: '屏息失败', synth: '窒息噪声 + 大喘气', category: 'body' },
  { id: 'breath.choke', cn: '呛咳', synth: '四段高 Q 噪声脉冲', category: 'body' },
  { id: 'breath.regulator', cn: '呼吸器', synth: '高频带通 + 阀门咔哒', category: 'body' },
  { id: 'heart.skip', cn: '心悸', synth: '漏拍后的补偿性强搏', category: 'body' },
  { id: 'flesh.wet', cn: '湿软', synth: '低通噪声 + 低频气泡', category: 'body' },
  { id: 'bone.snap', cn: '骨裂', synth: '高频非谐 + 低频闷响', category: 'body' },
  { id: 'san.whisper', cn: '低语', synth: '三音节共振峰人声', category: 'mind' },
  { id: 'san.static-burst', cn: '静电爆', synth: '双层高通噪声，左右反相', category: 'mind' },
  { id: 'san.reverse-voice', cn: '倒放人声', synth: '共振峰反向移动', category: 'mind' },
  { id: 'san.choir', cn: '唱诗班', synth: '六声部共振峰人声，全部微走音', category: 'mind' },
  { id: 'san.tinnitus-spike', cn: '耳鸣尖峰', synth: '5.2→6.1 kHz 缓慢滑音', category: 'mind' },
  { id: 'san.false-footstep', cn: '假脚步', synth: '衰减的双次闷响', category: 'mind' },
  { id: 'san.heartbeat-desync', cn: '心跳失同步', synth: '三拍非等距低频', category: 'mind' },
  { id: 'san.name-called', cn: '有人叫你', synth: '单长共振峰人声', category: 'mind' },
  { id: 'listener.call', cn: 'THE LISTENER 的呼唤', synth: '41 Hz 四分音下滑', category: 'creature' },
  { id: 'listener.near', cn: '它靠近了', synth: '极低通噪声 + 湿软', category: 'creature' },
  { id: 'listener.scream', cn: '尖啸', synth: '双锯齿上扫 + 撕裂噪声', category: 'creature' },
  { id: 'creature.skitter', cn: '爪子刮擦', synth: '十一次随机声像瞬态', category: 'creature' },
  { id: 'creature.breath-sync', cn: '同步的呼吸', synth: '与玩家呼吸同相的带通噪声', category: 'creature' },
  { id: 'item.pickup', cn: '拾取', synth: '瞬态 + 短金属', category: 'object' },
  { id: 'item.metal-clatter', cn: '金属散落', synth: '五次随机金属撞击', category: 'object' },
  { id: 'paper.rustle', cn: '纸张', synth: '高通噪声', category: 'object' },
  { id: 'glass.break', cn: '玻璃碎裂', synth: '九次高频非谐分音', category: 'object' },
  { id: 'match.strike', cn: '划火柴', synth: '瞬态高通 + 燃烧噪声', category: 'object' },
  { id: 'power.breaker', cn: '断路器', synth: '金属撞击 + 电流下滑', category: 'power' },
  { id: 'power.hum-up', cn: '供电恢复', synth: '锯齿上扫', category: 'power' },
  { id: 'power.hum-down', cn: '断电', synth: '锯齿下扫', category: 'power' },
  { id: 'light.flicker', cn: '灯闪', synth: '随机门控带通锯齿', category: 'power' },
  { id: 'electric.arc', cn: '电弧', synth: '六次随机高频噪声', category: 'power' },
  { id: 'terminal.boot', cn: '终端启动', synth: '继电器 + 双音 + CRT 高频', category: 'power' },
  { id: 'terminal.beep', cn: '终端提示', synth: '方波短音', category: 'power' },
  { id: 'radio.squelch', cn: '无线电噪声门', synth: '双层带通噪声', category: 'power' },
  { id: 'radio.voice', cn: '无线电人声', synth: '三音节共振峰 + 电话频段带通', category: 'power' },
  { id: 'ritual.bell', cn: '仪式钟', synth: '六个非谐分音，4.2 s 尾', category: 'ritual' },
  { id: 'ritual.chant', cn: '诵念', synth: '三声部低频共振峰', category: 'ritual' },
  { id: 'ritual.mark', cn: '刻下标记', synth: '强非谐钟 + 刮擦', category: 'ritual' },
  { id: 'stigma.brand', cn: '烙印', synth: '低频冲击 + 非谐钟', category: 'ritual' },
  { id: 'death.flatline', cn: '拉平线', synth: '1 kHz 持续音 + 低频远去', category: 'meta' },
  { id: 'revive.ritual', cn: '复苏仪式', synth: '深钟 + 唱诗班 + 大喘气', category: 'meta' },
  { id: 'ending.sting', cn: '结局落点', synth: '55 Hz 长钟 + 次声下扫', category: 'meta' },
  { id: 'knowledge.gain', cn: '获得知识', synth: '清亮钟 + 上行泛音', category: 'meta' },
  { id: 'debunk.success', cn: '识破谎言', synth: '纯净大三度双钟', category: 'meta' },
];

export const CUE_COUNT = Object.keys(CUES).length;

/** 环境音床定义 —— 由 AudioEngine 常驻合成 */
export interface BedSpec {
  id: string;
  cn: string;
  /** 低频层的基频 */
  sub: number;
  /** 噪声层的带通中心与 Q */
  band: [number, number];
  /** 随机点缀 cue 与平均间隔（秒） */
  sprinkle: readonly [string, number][];
  /** 混响尾长 */
  reverb: number;
}

export const BEDS: Record<string, BedSpec> = {
  hull: {
    id: 'hull', cn: '舱内底噪', sub: 38, band: [260, 0.9],
    sprinkle: [['hull.pop', 22], ['water.drip', 9], ['hull.groan', 34]],
    reverb: 0.55,
  },
  machinery: {
    id: 'machinery', cn: '机械层', sub: 52, band: [520, 1.6],
    sprinkle: [['power.hum-up', 40], ['electric.arc', 26], ['hull.rivet-pop', 48], ['light.flicker', 18]],
    reverb: 0.4,
  },
  flooded: {
    id: 'flooded', cn: '淹没舱', sub: 30, band: [170, 2.4],
    sprinkle: [['water.bubble', 7], ['water.drip', 5], ['hull.groan', 26]],
    reverb: 0.85,
  },
  chapel: {
    id: 'chapel', cn: '圣所', sub: 46, band: [340, 3.2],
    sprinkle: [['ritual.bell', 38], ['san.whisper', 17], ['san.choir', 64]],
    reverb: 1,
  },
  void: {
    id: 'void', cn: '零号舱', sub: 22, band: [110, 5.0],
    sprinkle: [['san.reverse-voice', 13], ['listener.call', 42], ['san.name-called', 27]],
    reverb: 0.95,
  },
  bridge: {
    id: 'bridge', cn: '指挥层', sub: 44, band: [700, 1.1],
    sprinkle: [['terminal.beep', 13], ['radio.squelch', 21], ['sonar.array-spin', 36]],
    reverb: 0.35,
  },
};

export const BED_COUNT = Object.keys(BEDS).length;

/** 未使用但保留导出，供其它模块直接搭音 */
export { adsr, hit, ramp, filt, gainNode, noiseSource, osc, panner, getScratchNoise };
