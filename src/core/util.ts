/** 通用数学与工具。无副作用，任何模块都可以依赖。 */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : clamp01((v - a) / (b - a));

export const remap = (v: number, a1: number, b1: number, a2: number, b2: number): number =>
  lerp(a2, b2, invLerp(a1, b1, v));

export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** 帧率无关的指数趋近 —— 所有平滑跟随都该用它，而不是 a += (b-a)*0.1 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t: number): number => Math.pow(clamp01(t), 3);
export const easeInOutQuad = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};

/** 用于心跳、呼吸等生理节律的非正弦波形 —— 更有机 */
export const pulse = (t: number, sharpness = 6): number => {
  const p = t - Math.floor(t);
  return Math.exp(-sharpness * p) * Math.sin(Math.PI * p * 2) + Math.exp(-sharpness * 3 * p) * 0.4;
};

export function formatBreaths(b: number): string {
  if (b < 0) return '——';
  const m = Math.floor(b / 60);
  const s = Math.floor(b % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDepth(m: number): string {
  return `${m.toFixed(0)} m`;
}

/** 深度 → 压强(atm) */
export function pressureAt(depthMeters: number): number {
  return 1 + depthMeters / 10.06;
}

export function uid(prefix = 'id'): string {
  uidCounter = (uidCounter + 1) >>> 0;
  return `${prefix}_${uidCounter.toString(36)}`;
}
let uidCounter = 0;

/** 深拷贝纯数据。存档与 A/B 盲测的状态快照都要用。 */
export function deepClone<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 把任意文本按宽度断行，中文按字宽 2 计 */
export function wrapText(text: string, widthCols: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    let w = 0;
    for (const ch of para) {
      const cw = /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(ch) ? 2 : 1;
      if (w + cw > widthCols) {
        lines.push(cur);
        cur = '';
        w = 0;
      }
      cur += ch;
      w += cw;
    }
    lines.push(cur);
  }
  return lines;
}

/** 断言，构建期会被保留 —— 内容错误宁可早崩也不要静默 */
export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[assert] ${msg}`);
}
