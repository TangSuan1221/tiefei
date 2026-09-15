import type { Rng, Seed } from './contract';

/**
 * xoshiro128** — 快速、高质量、可序列化的确定性伪随机数生成器。
 * 全项目禁止使用 Math.random()；所有随机必须来自这里，
 * 否则录像回放、盲测 A/B 与 bug 复现都会失效。
 */
export class Xoshiro implements Rng {
  private s: Uint32Array;
  private readonly label: string;

  constructor(seed: Seed | number[], label = 'root') {
    this.label = label;
    this.s = new Uint32Array(4);
    if (Array.isArray(seed)) {
      this.s.set(seed.slice(0, 4));
    } else {
      // splitmix32 播种，避免相近种子产生相关序列
      let z = seed >>> 0;
      for (let i = 0; i < 4; i++) {
        z = (z + 0x9e3779b9) >>> 0;
        let t = z;
        t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
        t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
        this.s[i] = (t ^ (t >>> 15)) >>> 0;
      }
      if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) this.s[0] = 0x9e3779b9;
      // 预热，丢弃前若干个输出
      for (let i = 0; i < 16; i++) this.nextU32();
    }
  }

  private nextU32(): number {
    const s = this.s;
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7) >>> 0, 9) >>> 0) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11) >>> 0;
    return result;
  }

  next(): number {
    // 取高 24 位以避免低位质量问题
    return (this.nextU32() >>> 8) / 0x1000000;
  }

  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    const range = max - min + 1;
    if (range <= 0) return min;
    // 拒绝采样消除模偏差
    const limit = Math.floor(0x100000000 / range) * range;
    let r: number;
    do {
      r = this.nextU32();
    } while (r >= limit);
    return min + (r % range);
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error(`[rng:${this.label}] pick from empty array`);
    return arr[this.int(0, arr.length - 1)];
  }

  weighted<T>(entries: readonly [T, number][]): T {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) return entries[0][0];
    let roll = this.next() * total;
    for (const [v, w] of entries) {
      roll -= Math.max(0, w);
      if (roll <= 0) return v;
    }
    return entries[entries.length - 1][0];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 派生命名子流。同一 label 总是得到同一子流，
   * 这让"地图生成"与"战斗掷骰"彼此独立 —— 玩家重打一场战斗
   * 不会改变地图，这是 roguelite 手感的关键。
   */
  fork(label: string): Rng {
    let h = 0x811c9dc5;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    const derived = [
      (this.s[0] ^ h) >>> 0,
      (this.s[1] ^ rotl(h, 8)) >>> 0,
      (this.s[2] ^ rotl(h, 16)) >>> 0,
      (this.s[3] ^ rotl(h, 24)) >>> 0,
    ];
    if ((derived[0] | derived[1] | derived[2] | derived[3]) === 0) derived[0] = 0x9e3779b9;
    return new Xoshiro(derived, `${this.label}/${label}`);
  }

  serialize(): number[] {
    return Array.from(this.s);
  }

  /** 高斯分布，用于自然感的数值抖动 */
  gaussian(mean = 0, stdev = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + stdev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** 从字符串生成种子，便于玩家分享"种子词" */
export function seedFromString(s: string): Seed {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 把种子还原成可读的"深度坐标"，作为游戏内的仪式感文本 */
export function seedToCoords(seed: Seed): string {
  const a = (seed & 0xfff).toString(16).toUpperCase().padStart(3, '0');
  const b = ((seed >>> 12) & 0xfff).toString(16).toUpperCase().padStart(3, '0');
  const c = ((seed >>> 24) & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `${a}·${b}·${c}`;
}

/**
 * 值噪声 —— 程序化纹理、水波、噪音场都用它。
 * 确定性，不依赖 Rng 实例。
 */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
