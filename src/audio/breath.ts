/**
 * 呼吸时钟 —— 表现层的心脏
 * ============================================================================
 * 渲染与音频**必须**共享同一个呼吸相位，否则画面的起伏与耳朵里的吸气会错开，
 * 玩家说不出哪里不对，但沉浸感会整个塌掉。所以它被抽成一个独立对象，
 * 由主循环持有，再分别喂给 post.ts 与 AudioEngine。
 *
 * 吸气与呼气**不对称**：吸气占一个周期的 38%，呼气占 62%。
 * 人在害怕时这个比例会变（吸气变急、呼气变短），`tension` 控制这一点。
 */

import { clamp, clamp01, smootherstep } from '../core/util';

export type BreathEventKind = 'inhale' | 'exhale' | 'hold-strain';

export class BreathClock {
  /** 每分钟呼吸次数。静息 12，恐慌 34 */
  rate = 13;
  /** 0..1，越高吸气越急 */
  tension = 0;
  /** 是否在屏息 */
  holding = false;
  /** 屏息累计秒数，用于驱动 CO2 与「憋不住」的抽搐 */
  holdTime = 0;

  /** 周期内位置 0..1 */
  private t = 0;
  /** 肺部充盈度 0..1 */
  private fill = 0;
  private listeners: ((k: BreathEventKind, at: number) => void)[] = [];
  private lastSection: 'in' | 'out' = 'out';
  private strainTimer = 0;

  /** 相位：+1 = 吸满，-1 = 呼尽。渲染与音频都用它。 */
  get phase(): number {
    return this.fill * 2 - 1;
  }

  /** 充盈度 0..1，给 HUD 的呼吸条用 */
  get fullness(): number {
    return this.fill;
  }

  get cyclePos(): number {
    return this.t;
  }

  /** 吸气段占比，随紧张度收紧 */
  private get inRatio(): number {
    return 0.38 - this.tension * 0.12;
  }

  on(fn: (k: BreathEventKind, at: number) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private emit(k: BreathEventKind, at: number): void {
    for (const fn of this.listeners) fn(k, at);
  }

  update(dt: number, now: number): void {
    const d = Math.min(dt, 0.1);
    if (this.holding) {
      this.holdTime += d;
      // 屏息时胸腔缓慢泄气，并开始抽搐
      this.fill = Math.max(0.55, this.fill - d * 0.06);
      this.strainTimer -= d;
      if (this.strainTimer <= 0) {
        // 憋得越久，抽搐越频繁
        this.strainTimer = clamp(3.4 - this.holdTime * 0.22, 0.45, 3.4);
        if (this.holdTime > 2.5) this.emit('hold-strain', now);
      }
      return;
    }
    this.holdTime = Math.max(0, this.holdTime - d * 2.5);

    const hz = (this.rate * (1 + this.tension * 1.05)) / 60;
    this.t += d * hz;
    while (this.t >= 1) this.t -= 1;

    const inR = this.inRatio;
    if (this.t < inR) {
      this.fill = smootherstep(this.t / inR);
      if (this.lastSection !== 'in') {
        this.lastSection = 'in';
        this.emit('inhale', now);
      }
    } else {
      this.fill = 1 - smootherstep((this.t - inR) / (1 - inR));
      if (this.lastSection !== 'out') {
        this.lastSection = 'out';
        this.emit('exhale', now);
      }
    }
  }

  /** 由 Vitals 驱动：恐惧与 CO2 都会让你喘 */
  driveFrom(fear: number, co2: number, fatigue: number): void {
    const f = clamp01(fear / 100);
    const c = clamp01(co2 / 100);
    this.rate = 12 + f * 16 + c * 10 + clamp01(fatigue / 100) * 4;
    this.tension = clamp01(f * 0.8 + c * 0.45);
  }

  /** 当前这一口气的时长，音频调度用 */
  get cycleSeconds(): number {
    return 60 / Math.max(1, this.rate * (1 + this.tension * 1.05));
  }
}
