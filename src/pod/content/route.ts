/**
 * 海底航线。
 * ============================================================================
 * 逃生舱没有窗户，所以「路」这个东西对玩家来说只有三个来源：
 *   1. 指挥员在无线电里报的航向数字；
 *   2. 回声雷达扫出来的地形轮廓；
 *   3. 撞上去的那一下。
 *
 * 前两者在前半程是一致的。后半程不是。整部作品的赌注就压在这个分歧上 ——
 * 当雷达和指挥员打架时，你信谁。
 *
 * 七关。第一关手写；后六关的骨架在这里，拓扑在冲洗下一段影像时生成。
 */

import type { SupplyId } from './supplies';
import type { CreatureId } from './creatures';
import type { FootageScene } from './footage';
import { ACTS, ACT_COUNT, cloneLeg } from './acts';

export interface Wreck {
  id: string;
  name: string;
  /** 描述，打捞与物资台上会显示 */
  desc: string;
  /** 伸机械臂进去的噪音 0..1 */
  noise: number;
  /** 捞一次要几口呼吸 */
  cost: number;
  /** 最多能捞几次 */
  attempts: number;
  /** 每次捞出来的东西（按顺序发放） */
  loot: readonly (readonly (readonly [SupplyId, number])[])[];
}

export interface ThreatBeat {
  creature: CreatureId;
  /** 从出现到贴上舱体的秒数（警报态实时倒计时） */
  fuse: number;
}

/**
 * 站点全景的种类。
 *
 * 配了这个的站点，摄像头在**停稳之后**画的不再是一片水，而是一张烘好的
 * 等距柱状全景 —— 云台转到哪就取哪一块。视点固定是它成立的前提，
 * 所以只在 site 阶段生效。烘焙代码在 view/pano.ts。
 */
export type SitePano = 'medbay';

export interface Leg {
  id: string;
  /** 海图上的段名 */
  name: string;
  /** 航段全长，米 */
  length: number;
  /** 唯一不会撞上东西的航向（度，0=正北） */
  safeHeading: number;
  /** 容差（度）。超出就会刮到地形 */
  tolerance: number;
  /** 抵达本段末尾时的深度 */
  depth: number;
  /** 指挥员报出的航向。和 safeHeading 不同 = 他在骗你 */
  advisedHeading: number;
  /** 开始本段航渡时指挥员说的话 */
  brief: readonly string[];
  /** 离开本段站点、驶向下一段时指挥员说的话 */
  clear: readonly string[];
  /** 航渡终点的站点名。声呐在航渡阶段把它标成目标点 */
  siteName: string;
  /** 抵达站点那一刻的描述。这是「进入关卡」的那句话 */
  arrival: readonly string[];
  /** 站点上能捞的东西 */
  wrecks: readonly Wreck[];
  /** 停稳之后摄像头里的全景。不配就还是一片水 */
  pano?: SitePano;
  /**
   * 曝光一卷片子时，提示词的主体部分。
   *
   * 只有主体、母题、运镜三项 —— 深度、站点名、怪物形态都由
   * content/footage.ts 从别的字段推出来，不在这里重复。
   * 不配的话还是能拍，只是提示词会退回「站点名 + 一堆淤泥」。
   */
  scene?: FootageScene;
  /** 站点上潜伏的东西。伸机械臂的噪音会把它招出来 */
  threats: readonly ThreatBeat[];
}

/**
 * 七关的**模板**航线。第一关开局就用这份；后六关在冲洗下一段影像时
 * 由生成器按主题实例化，不会在开局把整张图摊开。
 *
 * 长度仍是 7，给离线脚本和提示词探针一个稳定的骨架。
 */
export const ROUTE: readonly Leg[] = ACTS.map((a) => cloneLeg(a.leg));

export { ACT_COUNT };

export function legAt(index: number): Leg {
  const l = ROUTE[Math.min(index, ROUTE.length - 1)];
  if (!l) throw new Error(`[pod] 航段越界 ${index}`);
  return l;
}

export const TOTAL_DISTANCE = ROUTE.reduce((s, l) => s + l.length, 0);
