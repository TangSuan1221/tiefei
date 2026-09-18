/**
 * 行动清单的绘制。
 *
 * 分两层画，这是被后处理的合成方式逼出来的、但结果更好的做法：
 *
 *   钢板 → **场景画布**。HUD 层在 post.ts 里是按"玻璃上的投影"合成的
 *   （`col * (1 - hudA * 0.8) + hudRgb * hudA`），最多只能把身下的画面压到
 *   两成，永远盖不死。而场景层右侧正好是舱段剖面图和一排仪表，透出来就是一团
 *   糊。底板画在场景画布上才能真正遮挡。
 *
 *   文字 → **HUD 画布**。这样它和其它读数一样吃到面罩玻璃的曲率与色差，
 *   读起来是"投在面罩内壁上的字"，而不是贴在屏幕上的图片。
 *
 * 两层用同一份 layout() 算出的几何，不允许各算各的。
 *
 * 排版语法固定为三段：做什么 · 花几口气 · 会有多响。玩家只需要学会读这三栏。
 */

import { PALETTE, phosphor, rgba } from '@/render/palette';
import { cjk, clearTracking, mono, setTracking } from '@/ui/typography';
import { clamp01 } from '@/core/util';
import type { ActionGroup, GameAction } from './actions';

const GROUP_LABEL: Record<ActionGroup, string> = {
  move: '走',
  sense: '听',
  interact: '做',
  item: '带着的东西',
  body: '身体',
};

export interface ActionPanelState {
  actions: readonly GameAction[];
  selected: number;
  time: number;
  /** 0..1，低 SAN 下清单本身也会开始不可靠 */
  corruption: number;
  /** 剩余氧气折算的呼吸数，用来把"买不起"的选项标红 */
  breathsLeft: number;
}

export interface ActionHit {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 版面锚点，全部按画布高度取相对值（和 ui/hud.ts 一致）。
 * 清单钉死在右侧，**不随行数改变位置**：一个会跳来跳去的清单会让玩家
 * 每次都要重新找眼睛落点。
 */
const RIGHT = 0.972;
/** 顶边让开右上角的深度读数（它到 0.17h 才结束），底边让开主配电盘 */
const TOP = 0.193;
const BOTTOM = 0.852;
const WIDTH = 0.335;

type Line =
  | { kind: 'header'; group: ActionGroup }
  | { kind: 'row'; action: GameAction; index: number };

interface Layout {
  x: number;
  top: number;
  panelW: number;
  boxH: number;
  rowH: number;
  headerH: number;
  pad: number;
  padX: number;
  view: Line[];
  hiddenAbove: number;
  hiddenBelow: number;
}

export class ActionPanel {
  /** 上一次绘制的命中矩形，供鼠标拾取 */
  hits: ActionHit[] = [];

  private cached: Layout | null = null;

  /** 几何只算一次，钢板与文字共用 */
  layout(w: number, h: number, s: ActionPanelState): Layout | null {
    if (!s.actions.length) return null;

    const panelW = Math.max(h * 0.42, w * WIDTH);
    const x = w * RIGHT - panelW;
    const top = h * TOP;
    const maxH = h * (BOTTOM - TOP);
    const rowH = h * 0.0405;
    const headerH = h * 0.029;
    const pad = h * 0.022;
    const padX = h * 0.024;

    const groups = new Map<ActionGroup, { action: GameAction; index: number }[]>();
    s.actions.forEach((action, index) => {
      const arr = groups.get(action.group) ?? [];
      arr.push({ action, index });
      groups.set(action.group, arr);
    });

    // 组标题也当成一行，滚动窗口就不必区分两种行
    const lines: Line[] = [];
    for (const [group, rows] of groups) {
      lines.push({ kind: 'header', group });
      for (const r of rows) lines.push({ kind: 'row', action: r.action, index: r.index });
    }

    // 放不下就以选中项为中心开一扇窗，上下用计数提示
    const avg = rowH + headerH * 0.3;
    const capacity = Math.max(4, Math.floor((maxH - pad * 2) / avg));
    let from = 0;
    if (lines.length > capacity) {
      const sel = lines.findIndex((l) => l.kind === 'row' && l.index === s.selected);
      from = Math.max(0, Math.min(lines.length - capacity, sel - Math.floor(capacity / 2)));
    }
    const view = lines.slice(from, from + capacity);
    const hiddenAbove = from;
    const hiddenBelow = lines.length - (from + view.length);

    let boxH = pad * 2;
    for (const l of view) boxH += l.kind === 'header' ? headerH : rowH;
    if (hiddenAbove) boxH += headerH * 0.8;
    if (hiddenBelow) boxH += headerH * 0.8;

    const L: Layout = { x, top, panelW, boxH, rowH, headerH, pad, padX, view, hiddenAbove, hiddenBelow };
    this.cached = L;
    return L;
  }

  /**
   * 第一层：不透明钢板。画在**场景画布**上。
   * 做成一块铆在仪表舱上的钢板，遮挡因此看起来是有意的硬件，而不是穿帮的图层。
   */
  drawPlate(ctx: CanvasRenderingContext2D, h: number, L: Layout): void {
    const { x, top, panelW, boxH } = L;
    ctx.save();

    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = h * 0.035;
    ctx.shadowOffsetX = -h * 0.005;
    const grad = ctx.createLinearGradient(x, top, x + panelW, top + boxH);
    grad.addColorStop(0, PALETTE.steelDark);
    grad.addColorStop(0.42, PALETTE.abyssLift);
    grad.addColorStop(1, PALETTE.abyss);
    ctx.fillStyle = grad;
    roundRect(ctx, x, top, panelW, boxH, h * 0.004);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;

    // 拉丝：一层几乎看不见的竖纹，让钢板不是一块死色
    ctx.save();
    roundRect(ctx, x, top, panelW, boxH, h * 0.004);
    ctx.clip();
    ctx.strokeStyle = rgba(PALETTE.steel, 0.35);
    ctx.lineWidth = 1;
    for (let gx = x + 3; gx < x + panelW; gx += 3) {
      ctx.globalAlpha = 0.12 + ((gx * 7919) % 13) * 0.012;
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, top);
      ctx.lineTo(gx + 0.5, top + boxH);
      ctx.stroke();
    }
    ctx.restore();

    // 上缘高光 + 边框：让钢板有厚度
    ctx.strokeStyle = rgba(PALETTE.steelLit, 0.5);
    ctx.lineWidth = Math.max(1, h * 0.0013);
    roundRect(ctx, x + 0.5, top + 0.5, panelW - 1, boxH - 1, h * 0.004);
    ctx.stroke();
    ctx.strokeStyle = rgba(PALETTE.bone, 0.1);
    ctx.beginPath();
    ctx.moveTo(x + h * 0.007, top + 1.5);
    ctx.lineTo(x + panelW - h * 0.007, top + 1.5);
    ctx.stroke();

    // 四角铆钉
    const rv = Math.max(1.6, h * 0.0024);
    for (const [rx, ry] of [
      [x + h * 0.013, top + h * 0.013],
      [x + panelW - h * 0.013, top + h * 0.013],
      [x + h * 0.013, top + boxH - h * 0.013],
      [x + panelW - h * 0.013, top + boxH - h * 0.013],
    ]) {
      ctx.fillStyle = rgba(PALETTE.steelLit, 0.6);
      ctx.beginPath();
      ctx.arc(rx, ry, rv, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(rx - rv * 0.3, ry - rv * 0.3, rv * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // 右侧装订边
    ctx.fillStyle = rgba(PALETTE.rustDim, 0.65);
    ctx.fillRect(x + panelW - Math.max(1.5, h * 0.002), top, Math.max(1.5, h * 0.002), boxH);

    ctx.restore();
  }

  /** 第二层：文字与刻度。画在 **HUD 画布** 上。 */
  drawContents(ctx: CanvasRenderingContext2D, h: number, L: Layout, s: ActionPanelState): void {
    this.hits = [];
    const { x, top, panelW, rowH, headerH, pad, padX } = L;
    ctx.save();
    let cy = top + pad;

    if (L.hiddenAbove) {
      cy = this.drawMore(ctx, x, cy, panelW, headerH * 0.8, `▲ 上面还有 ${L.hiddenAbove} 项`, h);
    }

    for (const line of L.view) {
      if (line.kind === 'header') {
        ctx.font = cjk(h * 0.0132, 500);
        ctx.fillStyle = rgba(PALETTE.ember, 0.85);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        setTracking(ctx, h * 0.004);
        ctx.fillText(GROUP_LABEL[line.group], x + padX, cy + headerH * 0.5);
        clearTracking(ctx);

        ctx.strokeStyle = rgba(PALETTE.steelLit, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + padX + h * 0.045, cy + headerH * 0.5);
        ctx.lineTo(x + panelW - padX, cy + headerH * 0.5);
        ctx.stroke();
        cy += headerH;
      } else {
        this.drawRow(ctx, x, cy, panelW, rowH, line.action, line.index, s, h);
        this.hits.push({ index: line.index, x, y: cy, w: panelW, h: rowH });
        cy += rowH;
      }
    }

    if (L.hiddenBelow) {
      this.drawMore(ctx, x, cy, panelW, headerH * 0.8, `▼ 下面还有 ${L.hiddenBelow} 项`, h);
    }
    ctx.restore();
  }

  private drawMore(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    hh: number,
    text: string,
    h: number,
  ): number {
    ctx.font = mono(h * 0.0115, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w * 0.5, y + hh * 0.5);
    ctx.textAlign = 'left';
    return y + hh;
  }

  private drawRow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    a: GameAction,
    index: number,
    s: ActionPanelState,
    H: number,
  ): void {
    const active = index === s.selected;
    const unaffordable = a.cost > s.breathsLeft;
    const dead = a.blocked !== null;
    const padX = H * 0.024;

    if (active) {
      // 高光从右侧装订边扫进来、向左衰减 —— 不画整条亮带，那样太像网页
      const g = ctx.createLinearGradient(x + w, 0, x, 0);
      g.addColorStop(0, rgba(PALETTE.rust, 0.26));
      g.addColorStop(0.7, rgba(PALETTE.rust, 0.05));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PALETTE.rust;
      ctx.fillRect(x + w - Math.max(1.5, H * 0.002), y, Math.max(1.5, H * 0.002), h);
    }

    const mid = y + h * 0.38;
    const sub = y + h * 0.74;
    const fg = dead
      ? rgba(PALETTE.boneWhisper, 0.55)
      : unaffordable
        ? rgba(PALETTE.bloodHot, 0.88)
        : active
          ? PALETTE.bone
          : rgba(PALETTE.bone, 0.8);

    ctx.textBaseline = 'middle';

    // 编号：玩家按数字键就能选，所以它必须显眼
    ctx.font = mono(H * 0.0135, 500);
    ctx.fillStyle = active ? PALETTE.ember : rgba(PALETTE.boneWhisper, 0.7);
    ctx.textAlign = 'right';
    ctx.fillText(index < 9 ? String(index + 1) : '·', x + padX + H * 0.012, mid);
    ctx.textAlign = 'left';

    const labelX = x + padX + H * 0.026;
    const costX = x + w - padX;
    const costW = H * 0.08;

    ctx.font = cjk(H * 0.0178, active ? 500 : 400);
    ctx.fillStyle = fg;
    ctx.fillText(ellipsis(ctx, a.label, costX - labelX - costW), labelX, mid);

    // 副标题：代价之外玩家该知道的那一句
    ctx.font = cjk(H * 0.0126, 300);
    ctx.fillStyle = rgba(dead ? PALETTE.bloodDim : PALETTE.boneDim, dead ? 0.9 : 0.52);
    ctx.fillText(ellipsis(ctx, a.blocked ?? a.detail, costX - labelX - costW), labelX, sub);

    // 右栏：呼吸代价
    ctx.textAlign = 'right';
    ctx.font = mono(H * 0.0158, 400);
    ctx.fillStyle = unaffordable ? PALETTE.bloodHot : rgba(PALETTE.bone, dead ? 0.3 : 0.88);
    ctx.fillText(a.cost > 0 ? `${a.cost}口` : '—', costX, mid);
    ctx.textAlign = 'left';

    // 噪音用磷光刻度表示，长度而非数字 —— 玩家该形成的是直觉，不是算术
    const nw = H * 0.065;
    const nx = costX - nw;
    const t = clamp01(a.noise / 14);
    const bh = Math.max(1.5, H * 0.0022);
    ctx.fillStyle = rgba(PALETTE.steel, 0.55);
    ctx.fillRect(nx, sub - bh * 0.5, nw, bh);
    if (t > 0.001) {
      ctx.fillStyle = phosphor(0.25 + t * 0.75, dead ? 0.3 : 0.92);
      ctx.fillRect(nx, sub - bh * 0.5, nw * t, bh);
    }
  }

  /** 鼠标命中测试，返回行动下标 */
  pick(px: number, py: number): number {
    for (const hit of this.hits) {
      if (px >= hit.x && px <= hit.x + hit.w && py >= hit.y && py <= hit.y + hit.h) {
        return hit.index;
      }
    }
    return -1;
  }

  get lastLayout(): Layout | null {
    return this.cached;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}
