/**
 * 排版系统
 * ============================================================================
 * 3A 质感有一半来自字。这里定下全作的字体栈、级数、字距与中文断行规则，
 * 任何 UI 代码都不允许自己拼 font 字符串。
 *
 * 中文排版的三件事，缺一件就露怯：
 *   1. **避头尾**：标点不能出现在行首，开引号不能出现在行尾。
 *   2. **中西文混排间距**：汉字与拉丁字母/数字之间要有约 1/4 空。
 *   3. **字距（tracking）**：标题要拉开，正文不能拉。等宽字体尤其明显。
 */

// ----------------------------------------------------------------------------
// 字体栈
// ----------------------------------------------------------------------------

/** 工业等宽 —— 所有读数、代号、英文标签 */
export const MONO =
  '"Consolas","SF Mono","DejaVu Sans Mono","Liberation Mono",ui-monospace,monospace';

/** 中文正文 —— 黑体系，避免宋体在小字号下的横画消失 */
export const SANS_CJK =
  '"PingFang SC","Microsoft YaHei","Noto Sans SC","Source Han Sans SC","Hiragino Sans GB",sans-serif';

/** 中文标题 —— 更硬的字形，配合大字距 */
export const DISPLAY_CJK =
  '"Microsoft YaHei UI","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif';

export type Weight = 300 | 400 | 500 | 600 | 700;

export function mono(size: number, weight: Weight = 400): string {
  return `${weight} ${size.toFixed(1)}px ${MONO}`;
}
export function cjk(size: number, weight: Weight = 400): string {
  return `${weight} ${size.toFixed(1)}px ${SANS_CJK}`;
}
export function display(size: number, weight: Weight = 600): string {
  return `${weight} ${size.toFixed(1)}px ${DISPLAY_CJK}`;
}

// ----------------------------------------------------------------------------
// 字距
// ----------------------------------------------------------------------------

interface SpacedCtx extends CanvasRenderingContext2D {
  letterSpacing: string;
}

export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  if ('letterSpacing' in ctx) (ctx as SpacedCtx).letterSpacing = `${px.toFixed(2)}px`;
}

export function clearTracking(ctx: CanvasRenderingContext2D): void {
  if ('letterSpacing' in ctx) (ctx as SpacedCtx).letterSpacing = '0px';
}

/** 带字距的一次性绘制，用完自动复位 —— 忘记复位是最常见的 canvas 排版 bug */
export function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  px: number,
): void {
  setTracking(ctx, px);
  ctx.fillText(text, x, y);
  clearTracking(ctx);
}

// ----------------------------------------------------------------------------
// 中文断行
// ----------------------------------------------------------------------------

/** 不能出现在行首的字符 */
const NO_LINE_START = '、。，．；：？！）〕］｝〉》」』】"\'…·ー々〆～%‰℃»›,.;:?!)]}>';
/** 不能出现在行尾的字符 */
const NO_LINE_END = '（〔［｛〈《「『【"\'«‹([{<';

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
const LATIN_RE = /[0-9A-Za-z]/;

/**
 * 按像素宽度断行，遵守避头尾。
 * 不做完整的 UAX#14 —— 只解决中文游戏 UI 里 99% 会被看出来的那几种情况。
 */
export function layoutCJK(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }
    let line = '';
    let lineW = 0;
    const chars = Array.from(para);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const w = ctx.measureText(ch).width;
      // 中西文之间补 1/4 空
      const prev = line.length ? line[line.length - 1] : '';
      const needGap =
        prev !== '' &&
        ((CJK_RE.test(prev) && LATIN_RE.test(ch)) || (LATIN_RE.test(prev) && CJK_RE.test(ch)));
      const gap = needGap ? ctx.measureText(' ').width * 0.5 : 0;

      if (lineW + gap + w > maxWidth && line !== '') {
        // 避头尾：当前字不能在行首 → 把上一个字一起带下去
        if (NO_LINE_START.includes(ch) && line.length > 1) {
          out.push(line);
          line = ch;
          lineW = w;
          continue;
        }
        // 上一个字不能在行尾 → 把它挪到下一行
        if (NO_LINE_END.includes(prev) && line.length > 1) {
          line = line.slice(0, -1);
          out.push(line);
          line = prev + ch;
          lineW = ctx.measureText(line).width;
          continue;
        }
        out.push(line);
        line = ch;
        lineW = w;
      } else {
        if (needGap) line += '\u2009';
        line += ch;
        lineW += gap + w;
      }
    }
    out.push(line);
  }
  return out;
}

/** 画一段中文正文，返回占用高度 */
export function paragraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 999,
): number {
  const lines = layoutCJK(ctx, text, maxWidth);
  const n = Math.min(lines.length, maxLines);
  for (let i = 0; i < n; i++) {
    let s = lines[i];
    if (i === n - 1 && lines.length > maxLines) s = s.slice(0, -1) + '…';
    ctx.fillText(s, x, y + i * lineHeight);
  }
  return n * lineHeight;
}

// ----------------------------------------------------------------------------
// 七段数码管 —— 所有关键读数都用它，而不是字体
// ----------------------------------------------------------------------------
//
// 用画的而不是用字体，有三个理由：
//   1. 不依赖任何字体文件，在任何机器上完全一致
//   2. 可以让「灭掉的段」以极低亮度保留 —— 这是真数码管的标志性细节
//   3. 低 SAN 时可以单独点亮/熄灭某一段，造出「7 看起来像 1」这种恰到好处的谎言

//        a
//      ─────
//   f │     │ b
//     │  g  │
//      ─────
//   e │     │ c
//     │     │
//      ─────
//        d

const SEG_MAP: Record<string, number> = {
  '0': 0b0111111, '1': 0b0000110, '2': 0b1011011, '3': 0b1001111, '4': 0b1100110,
  '5': 0b1101101, '6': 0b1111101, '7': 0b0000111, '8': 0b1111111, '9': 0b1101111,
  A: 0b1110111, b: 0b1111100, C: 0b0111001, d: 0b1011110, E: 0b1111001, F: 0b1110001,
  H: 0b1110110, L: 0b0111000, P: 0b1110011, U: 0b0111110, n: 0b1010100, o: 0b1011100,
  r: 0b1010000, t: 0b1111000, '-': 0b1000000, ' ': 0, _: 0b0001000,
};

export interface SegStyle {
  on: string;
  off: string;
  /** 段的粗细，相对于字高 */
  thickness?: number;
  /** 斜体角度（真数码管都是斜的） */
  skew?: number;
  glow?: number;
}

/** 画一位七段数字，返回占用宽度 */
export function drawSegChar(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  h: number,
  style: SegStyle,
  mask = 0b1111111,
): number {
  const w = h * 0.58;
  const th = h * (style.thickness ?? 0.115);
  const skew = style.skew ?? 0.11;
  const bits = (SEG_MAP[ch] ?? SEG_MAP[ch.toUpperCase()] ?? 0) & mask;
  const g = th * 0.40;
  const hLen = w - th - g * 2;
  const vLen = (h - th * 3) / 2 - g * 2;

  ctx.save();
  ctx.transform(1, 0, -skew, 1, x + h * skew, y);

  const begin = (i: number): boolean => {
    const on = ((bits >> i) & 1) === 1;
    ctx.fillStyle = on ? style.on : style.off;
    if (on && style.glow) {
      ctx.shadowBlur = style.glow;
      ctx.shadowColor = style.on;
    } else {
      ctx.shadowBlur = 0;
    }
    return on;
  };

  const hseg = (i: number, px: number, py: number): void => {
    begin(i);
    ctx.beginPath();
    ctx.moveTo(px, py + th / 2);
    ctx.lineTo(px + th / 2, py);
    ctx.lineTo(px + hLen - th / 2, py);
    ctx.lineTo(px + hLen, py + th / 2);
    ctx.lineTo(px + hLen - th / 2, py + th);
    ctx.lineTo(px + th / 2, py + th);
    ctx.closePath();
    ctx.fill();
  };

  const vseg = (i: number, px: number, py: number): void => {
    begin(i);
    ctx.beginPath();
    ctx.moveTo(px + th / 2, py);
    ctx.lineTo(px + th, py + th / 2);
    ctx.lineTo(px + th, py + vLen - th / 2);
    ctx.lineTo(px + th / 2, py + vLen);
    ctx.lineTo(px, py + vLen - th / 2);
    ctx.lineTo(px, py + th / 2);
    ctx.closePath();
    ctx.fill();
  };

  const upperY = th + g;
  const lowerY = (h + th) / 2 + g;
  hseg(0, th / 2 + g, 0);             // a
  vseg(1, w - th, upperY);            // b
  vseg(2, w - th, lowerY);            // c
  hseg(3, th / 2 + g, h - th);        // d
  vseg(4, 0, lowerY);                 // e
  vseg(5, 0, upperY);                 // f
  hseg(6, th / 2 + g, (h - th) / 2);  // g

  ctx.shadowBlur = 0;
  ctx.restore();
  return w * 1.16;
}

/** 画一串七段读数（右对齐），返回总宽度 */
export function drawSegText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  h: number,
  style: SegStyle,
  /** 每一位的段掩码，用于低 SAN 时局部熄灭 */
  maskAt?: (i: number) => number,
): number {
  let cx = x;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '.') {
      ctx.fillStyle = style.on;
      ctx.beginPath();
      ctx.arc(cx + h * 0.06, y + h - h * 0.07, h * 0.065, 0, Math.PI * 2);
      ctx.fill();
      cx += h * 0.22;
      continue;
    }
    cx += drawSegChar(ctx, chars[i], cx, y, h, style, maskAt ? maskAt(i) : 0b1111111);
  }
  return cx - x;
}

export function segWidth(text: string, h: number): number {
  let w = 0;
  for (const c of text) w += c === '.' ? h * 0.22 : h * 0.58 * 1.16;
  return w;
}
