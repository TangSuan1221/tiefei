// Phosphor overlay kit for the live porthole: bundled CRT faces, colours and
// glow helpers. Only instruments are drawn with it; the optical feed stays untouched.

/** Live porthole typography, independent of the cabin terminal faces. */
export const PORTHOLE_FONT = '"IPix","CrtPixel","CrtMono",monospace';
export const portholeFont = (size:number) => `400 ${size.toFixed(1)}px ${PORTHOLE_FONT}`;

/** All porthole text uses the coordinate readout green selected by the user. */
export const PORTHOLE_INK = {text:'#b7f578', dark:'#091307', glow:'rgba(106,220,43,.22)', line:(alpha:number)=>`rgba(183,245,120,${alpha})`} as const;
export function portholeText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,color:string=PORTHOLE_INK.text):void {
  ctx.save();ctx.fillStyle=color;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
  // A crisp dark keyline survives pale, lamp-lit steel without blurring glyphs.
  ctx.shadowBlur=0;ctx.strokeStyle=PORTHOLE_INK.dark;
  ctx.lineJoin='round';ctx.lineWidth=Math.max(2.5,parseFloat(ctx.font.match(/[\d.]+(?=px)/)?.[0]??'20')*.12);
  ctx.strokeText(text,x,y);ctx.fillText(text,x,y);ctx.restore();
}

/** Canvas font stacks. VT323 carries digits and Latin; CJK falls through to the 12px pixel face. */
export const CRT_FONT = {
  mono: '"CrtMono","CrtPixel",monospace',
  pixel: '"CrtPixel","CrtMono",monospace',
};
/** Device typography: pixel phosphor with a full CJK fallback for unbundled glyphs. */
export const crtFont = (size:number, weight:number=400) => `${weight} ${size.toFixed(1)}px "CrtPixel","CrtMono","Microsoft YaHei",monospace`;
// SIL OFL subsets in public/assets/fonts; see README there before adding new characters.
const FONT_FILES: [string, string][] = [['IPix', 'IPix.ttf'], ['CrtMono', 'VT323-porthole.woff2'], ['CrtPixel', 'FusionPixel12-porthole.woff2']];
if (typeof FontFace !== 'undefined' && typeof document !== 'undefined' && document.fonts)
  for (const [family, file] of FONT_FILES)
    new FontFace(family, `url(/assets/fonts/${file})`, {display: 'block'}).load()
      .then(f => { document.fonts.add(f); }, () => console.warn(`[crt-hud] ${file} failed to load`));

/** Green P1-style phosphor: bright text, softer rule lines, a dark halo for legibility over lit walls. */
export const PHOSPHOR = {
  text: '#9dffbf',
  dim: 'rgba(130,236,172,.62)',
  line: (a: number) => `rgba(118,232,168,${a})`,
  glow: 'rgba(52,255,140,.55)',
  halo: 'rgba(0,10,5,.82)',
  tagInk: '#e9f4ec',
};

/** Text with a dark under-halo, then the glowing phosphor stroke on top. */
export function phosphorText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = PHOSPHOR.text): void {
  ctx.save();
  ctx.shadowColor = PHOSPHOR.halo; ctx.shadowBlur = 4; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 1;
  ctx.fillStyle = PHOSPHOR.halo; ctx.fillText(text, x, y + 1); ctx.fillText(text, x, y);
  ctx.shadowColor = PHOSPHOR.glow; ctx.shadowBlur = 6; ctx.shadowOffsetY = 0;
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}

/** Strokes the current path twice: a wider dark underlay, then the glowing line. */
export function phosphorStroke(ctx: CanvasRenderingContext2D, alpha: number, width = 1): void {
  ctx.save();
  ctx.lineWidth = width + 2; ctx.strokeStyle = `rgba(0,10,5,${alpha * .6})`; ctx.stroke();
  ctx.lineWidth = width; ctx.strokeStyle = PHOSPHOR.line(alpha);
  ctx.shadowColor = PHOSPHOR.glow; ctx.shadowBlur = 4; ctx.stroke();
  ctx.restore();
}

/** Hairline white stroke over a faint dark underlay; legible on pale steel without a glow. */
export function fineStroke(ctx: CanvasRenderingContext2D, alpha: number, width = 1): void {
  ctx.save();
  ctx.lineWidth = width + 1.5; ctx.strokeStyle = `rgba(0,6,4,${alpha * .4})`; ctx.stroke();
  ctx.lineWidth = width; ctx.strokeStyle = `rgba(236,242,238,${alpha})`; ctx.stroke();
  ctx.restore();
}

let layer: HTMLCanvasElement | undefined;
let scan: CanvasPattern | null = null;
/**
 * Draws instruments into a private layer, cuts CRT scanlines through that layer
 * only, then composites it. Scanlines never touch the optical image underneath.
 */
export function withPhosphorLayer(ctx: CanvasRenderingContext2D, w: number, h: number, flicker: number, draw: (layer: CanvasRenderingContext2D) => void): void {
  if (!layer) layer = document.createElement('canvas');
  if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; scan = null; }
  const g = layer.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.save(); draw(g); g.restore();
  if (!scan) {
    const tile = document.createElement('canvas'); tile.width = 1; tile.height = 3;
    const t = tile.getContext('2d')!; t.fillStyle = 'rgba(0,0,0,.04)'; t.fillRect(0, 2, 1, 1);
    scan = g.createPattern(tile, 'repeat');
  }
  if (scan) { g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = scan; g.fillRect(0, 0, w, h); g.restore(); }
  ctx.save(); ctx.globalAlpha = flicker; ctx.drawImage(layer, 0, 0); ctx.restore();
}

/** Shared cockpit text palette, sampled from the navigation display source. */
export const TERMINAL_INK = { text: "#dfc98d", bright: "#ffe4a0", dim: "#9e916b", accent: "#63fff1", warning: "#f0bf78" } as const;
