import type { PodRun } from '../sim/run';
import { withPhosphorLayer } from './crt-hud';
import { drawPortholeReadouts } from './creature';

// The live porthole carries the heading tape with pitch, the left-edge X/Y/DEPTH
// readout (creature.ts), plus the centre focus reticle and the name plate of
// whatever it has locked (window-locks.ts).

/** Live window instruments only; never colour or modify the exterior feed. */
export function drawPortholeHud(ctx: CanvasRenderingContext2D, w: number, h: number, run: PodRun): void {
  if (run.shot.viewing) return;
  drawPortholeReadouts(ctx, w, h, run);
  // A faint, irregular phosphor shimmer rather than a strobing flicker.
  const flicker = .93 + Math.sin(run.clock * 41) * .035 + Math.sin(run.clock * 7.3) * .025;
  withPhosphorLayer(ctx, w, h, flicker, g => run.authoredSite?.drawWindowLocks?.(g, w, h));
}
