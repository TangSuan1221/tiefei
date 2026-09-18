/**
 * 生成画面的四色约束。
 * ============================================================================
 * 这个文件**不碰 DOM、不碰网络**，只有一个逐像素的调色函数。单独拆出来是
 * 为了让 tools/footage-probe.ts 能在 node 里对抽出来的帧做同一次变换 ——
 * 看得见的东西才调得动，而这一步的效果不看图是判断不了的。
 *
 * ## 为什么这一步是约束而不是滤镜
 *
 * 实拍验证过：提示词里写满了 "no green, no teal, no cyan, no emerald,
 * no sea-green water"，模型照样交回来一段**整片泛青绿**的海水。
 * 提示词是请求，不是约束。GDD §8.1 明令禁止「恐怖游戏绿」
 * （hue ∈ [75°,165°] 且饱和度 > 0.18，见 render/palette.ts 的 isHorrorGreen），
 * 所以唯一可靠的执行点就是这里：把每个像素投影到本作的四色梯度上，
 * 绿色在物理上无处可去。
 */

import { hexToRgb, PALETTE } from '@/render/palette';

/**
 * 亮度梯度：深渊蓝黑 → 锈深 → 铁锈橙 → 余烬 → 骨白。
 *
 * 和声呐屏的磷光曲线同源（render/palette.ts 的 phosphor），所以摄像头屏和
 * 雷达屏看起来是同一套美术里的两块屏，而不是两个来源。
 */
const RAMP_STOPS: readonly (readonly [number, string])[] = [
  [0.0, PALETTE.abyss],
  [0.22, '#0d1620'],
  [0.42, PALETTE.rustDeep],
  [0.66, PALETTE.rust],
  [0.85, PALETTE.ember],
  [1.0, PALETTE.bone],
];

/** 256 级查找表。逐像素算插值太贵，而且这张表是常量 */
const LUT = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  const stops = RAMP_STOPS.map(([at, hex]) => ({ at, rgb: hexToRgb(hex) }));
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0]!;
    let b = stops[stops.length - 1]!;
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k]!.at && t <= stops[k + 1]!.at) {
        a = stops[k]!;
        b = stops[k + 1]!;
        break;
      }
    }
    const span = b.at - a.at || 1;
    const f = (t - a.at) / span;
    lut[i * 3] = (a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f) * 255;
    lut[i * 3 + 1] = (a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f) * 255;
    lut[i * 3 + 2] = (a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f) * 255;
  }
  return lut;
})();

const BLOOD = hexToRgb(PALETTE.bloodHot);

/**
 * 原地把一块 RGBA 缓冲压进四色梯度。
 *
 * gain 是屏幕增益：关掉探照灯时这块屏也该暗下来，但不能到零 ——
 * 片子是**已经拍好的**，不该因为现在关了灯就消失。
 */
export function remapFootagePixels(px: Uint8ClampedArray, gain: number): void {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    // 只按亮度取色。原图的色相**整个丢掉** —— 这正是青绿海水消失的地方。
    const luma = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
    const o = luma * 3;
    let nr = LUT[o]!;
    let ng = LUT[o + 1]!;
    let nb = LUT[o + 2]!;
    // 唯一的例外：原图里明显偏红的地方，允许透一点警示血红出来。
    // 这是四色里的第四色，全靠亮度梯度的话它永远不会出现。
    // 绿轴和蓝轴的偏移一律不给通道。
    const redBias = (r - Math.max(g, b)) / 255;
    if (redBias > 0.12) {
      const k = Math.min(0.45, (redBias - 0.12) * 1.6);
      nr += (BLOOD[0] * 255 - nr) * k;
      ng += (BLOOD[1] * 255 - ng) * k;
      nb += (BLOOD[2] * 255 - nb) * k;
    }
    px[i] = nr * gain;
    px[i + 1] = ng * gain;
    px[i + 2] = nb * gain;
  }
}
