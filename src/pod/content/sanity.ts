/**
 * 理智分档。
 * ============================================================================
 * SAN 不是一条掉光就死的槽。它改三件事：下一关怎么长、片子里看见什么、
 * 声呐上多出来的那些不该存在的点。
 *
 *   lucid  ≥ 68  线框诚实，片子稳定
 *   frayed  36–67  多一个长得一样的空箱，片子夹两帧错的
 *   broken  < 36  多一只致命背景生物、多一个诡雷货箱，片子会画一个不在水里的东西
 *
 * 分析日志仍然说真话。撒谎的是感官，不是规则。
 */

export type SanBand = 'lucid' | 'frayed' | 'broken';

export function sanBand(san: number): SanBand {
  if (san >= 68) return 'lucid';
  if (san >= 36) return 'frayed';
  return 'broken';
}

export function san01(san: number): number {
  return Math.max(0, Math.min(1, 1 - san / 100));
}

/** 把分档混进关卡种子：同一趟里 SAN 掉了，下一段不会长出同一张图 */
export function mixSanSeed(seed: number, act: number, san: number): number {
  const n = sanBand(san) === 'lucid' ? 0 : sanBand(san) === 'frayed' ? 1 : 2;
  return (seed ^ ((act + 1) * 104729) ^ (n * 99991) ^ (Math.floor(san) * 13)) >>> 0;
}

export function sanFootageClause(san: number): string {
  const band = sanBand(san);
  if (band === 'lucid') {
    return (
      `Operator sanity is stable (${Math.round(san)}). ` +
      `The image is mechanically noisy but geometrically honest. Do not invent extra figures.`
    );
  }
  if (band === 'frayed') {
    return (
      `Operator sanity is frayed (${Math.round(san)}). ` +
      `Two or three frames near the middle tear and show a face that is not in the water, then snap back. ` +
      `The real geometry must remain readable through the tear.`
    );
  }
  return (
    `Operator sanity is broken (${Math.round(san)}). ` +
    `A second wrong geometry overlays the real one for a beat: a figure standing in empty water, ` +
    `or a crate that is not there. The overlay must look like a fault in the tape, not a real body. ` +
    `Keep the true obstacles and true creatures readable underneath.`
  );
}
