/**
 * 《铁肺迷城》调色板 — GDD §8.1 的唯一真相源。
 *
 * 四色主调，任何渲染代码都必须从这里取色，不允许在别处硬编码十六进制。
 * 明令禁止「恐怖游戏绿」：任何 hue 落在 [75°, 165°] 且饱和度 > 0.18 的颜色
 * 都不得进入最终画面。`assertNoHorrorGreen` 在 demo 页开发模式下会检查这一点。
 */

/** 铁锈橙 — 唯一的暖色光源色，磷光屏、应急灯、锈迹 */
export const RUST = '#c4632a';
/** 深渊蓝黑 — 一切阴影与背景的落点 */
export const ABYSS = '#060a10';
/** 骨白 — 高光、读数、真正重要的字 */
export const BONE = '#d8d2c4';
/** 警示血红 — 只用于危险与异常，出现即意味着代价 */
export const BLOOD = '#8e1620';

export type RGB = readonly [number, number, number];

export const RUST_RGB: RGB = [0.769, 0.388, 0.165];
export const ABYSS_RGB: RGB = [0.024, 0.039, 0.063];
export const BONE_RGB: RGB = [0.847, 0.824, 0.769];
export const BLOOD_RGB: RGB = [0.557, 0.086, 0.125];

/**
 * 扩展梯度。全部由四主色插值/调暗得到，保证整块画面在同一个色域里，
 * 这是「看起来是一套美术」而不是「拼凑」的关键。
 */
export const PALETTE = {
  abyss: ABYSS,
  abyssLift: '#0b121b',
  abyssHaze: '#101a25',
  steelDark: '#161d26',
  steel: '#242c36',
  steelLit: '#39424c',
  rustDeep: '#5d2c13',
  rustDim: '#8a431d',
  rust: RUST,
  rustHot: '#e08a49',
  ember: '#f4b878',
  bone: BONE,
  boneDim: '#9d9789',
  boneWhisper: '#5e5b54',
  blood: BLOOD,
  bloodDim: '#4d0c12',
  bloodHot: '#c8323c',
  /** 磷光屏专用：从余辉到刚被扫过的亮点 */
  phosphorCold: '#3a2410',
  phosphorMid: '#d2793a',
  phosphorHot: '#ffd9a8',
} as const;

export const PHOSPHOR_MID = PALETTE.phosphorMid;

/** 把 '#rrggbb' 解析成 0..1 的三元组 */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

/** rgba() 字符串，Canvas2D 用 */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha.toFixed(4)})`;
}

/** 在两个 hex 之间做线性插值，返回 rgb() 字符串 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round((ca[0] + (cb[0] - ca[0]) * t) * 255);
  const g = Math.round((ca[1] + (cb[1] - ca[1]) * t) * 255);
  const bl = Math.round((ca[2] + (cb[2] - ca[2]) * t) * 255);
  return `rgb(${r},${g},${bl})`;
}

/**
 * 磷光色：t=0 是即将消失的余辉，t=1 是扫描线刚刚点亮的核心。
 * 中间刻意经过铁锈橙，尖端冲向骨白 —— 这条曲线决定了声呐屏的「贵气」。
 */
export function phosphor(t: number, alpha = 1): string {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const stop =
    x < 0.55
      ? mixHex(PALETTE.phosphorCold, PHOSPHOR_MID, x / 0.55)
      : mixHex(PHOSPHOR_MID, PALETTE.phosphorHot, (x - 0.55) / 0.45);
  if (alpha >= 1) return stop;
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(stop);
  if (!m) return stop;
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha.toFixed(4)})`;
}

/**
 * 开发期护栏：检查一个 hex 是否落入「恐怖游戏绿」。
 * 见 GDD §8.1 —— 这是本作在视觉上与同类作品拉开距离的硬性约束。
 */
export function isHorrorGreen(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.18) return false;
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue >= 75 && hue <= 165;
}

/** 在 demo 里跑一次，任何违规颜色都会在控制台炸出来 */
export function assertNoHorrorGreen(): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(PALETTE)) {
    if (typeof v === 'string' && v.startsWith('#') && isHorrorGreen(v)) bad.push(`${k}=${v}`);
  }
  for (const [k, v] of Object.entries({ RUST, ABYSS, BONE, BLOOD, PHOSPHOR_MID })) {
    if (isHorrorGreen(v)) bad.push(`${k}=${v}`);
  }
  return bad;
}
