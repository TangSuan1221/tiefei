/**
 * 界面面板：对话 / 背包 / 地图 / 日志
 * ============================================================================
 * 四个面板共用同一套「投影板」语言，所以它们看起来是同一个系统的四个页签：
 *
 *   板       深蓝黑半透明，上下各一条铁锈橙细线，四角定位括号
 *   标题     中文大字 + 拉丁副标题，字距拉开到 0.28 em
 *   左轨     一列刻度点，每五格一个长刻度 —— 工业设备的签名
 *   选中态   左侧实心色条 + 提亮，绝不用「整行反白」这种网页做法
 *   代价     永远右对齐，永远用等宽，玩家扫一眼就能比较
 *
 * 中文排版：正文行高 1.75 em，段落之间空半行，标点避头尾由 typography 处理。
 */

import type { ID, Room } from '../core/contract';
import { clamp, clamp01, smoothstep } from '../core/util';
import { hash2, valueNoise2 } from '../core/rng';
import { PALETTE, rgba } from '../render/palette';
import { roundRect } from '../render/interior';
import {
  cjk, clearTracking, display, layoutCJK, mono, paragraph, setTracking, tracked,
} from './typography';

const TAU = Math.PI * 2;

export type PanelKind = 'dialogue' | 'inventory' | 'map' | 'log' | null;

export interface PanelChoice {
  id: ID;
  label: string;
  cost?: number;
  disabled?: boolean;
  irreversible?: boolean;
  tooltip?: string;
}

export interface DialogueModel {
  speaker?: string;
  /** 用于生成程序化剪影的种子 */
  portraitSeed?: number;
  text: string;
  choices: readonly PanelChoice[];
  selected: number;
}

export interface InventoryItem {
  id: ID;
  name: string;
  kind: 'tool' | 'weapon' | 'consumable' | 'key' | 'relic' | 'material' | 'document';
  count: number;
  weight: number;
  noise: number;
  description: string;
}

export interface InventoryModel {
  items: readonly InventoryItem[];
  selected: number;
  capacity: number;
}

export interface MapModel {
  rooms: readonly Room[];
  currentRoomId: ID;
  selected?: ID;
}

export interface LogEntry {
  id: ID;
  title: string;
  /** 形如 "呼吸 0412" */
  stamp: string;
  body: string;
  tone: 'neutral' | 'eerie' | 'system' | 'whisper' | 'bad';
  unread?: boolean;
}

export interface LogModel {
  entries: readonly LogEntry[];
  selected: number;
}

export interface PanelState {
  kind: PanelKind;
  /** 打开动画 0..1 */
  open: number;
  time: number;
  corruption: number;
  dialogue?: DialogueModel;
  inventory?: InventoryModel;
  map?: MapModel;
  log?: LogModel;
}

// ============================================================================
// 通用绘制件
// ============================================================================

/** 投影板：所有面板的底。开合有一个横向展开的动画。 */
function plate(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  open: number, time: number,
): void {
  const k = smoothstep(open);
  const hh = h * k;
  const yy = y + (h - hh) / 2;

  ctx.save();
  // 底
  const g = ctx.createLinearGradient(x, yy, x, yy + hh);
  g.addColorStop(0, 'rgba(6,10,16,0.90)');
  g.addColorStop(0.5, 'rgba(4,7,12,0.94)');
  g.addColorStop(1, 'rgba(6,10,16,0.90)');
  ctx.fillStyle = g;
  ctx.fillRect(x, yy, w, hh);

  // 内侧一层极淡的暖色，避免整块面板「死」
  const warm = ctx.createRadialGradient(x + w * 0.5, yy + hh * 0.35, 0, x + w * 0.5, yy + hh * 0.5, w * 0.6);
  warm.addColorStop(0, rgba(PALETTE.rustDeep, 0.10));
  warm.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(x, yy, w, hh);

  // 上下主线
  ctx.strokeStyle = rgba(PALETTE.rust, 0.72);
  ctx.lineWidth = Math.max(1.2, h * 0.0025);
  ctx.beginPath();
  ctx.moveTo(x, yy);
  ctx.lineTo(x + w, yy);
  ctx.moveTo(x, yy + hh);
  ctx.lineTo(x + w, yy + hh);
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, yy + 3);
  ctx.lineTo(x + w, yy + 3);
  ctx.moveTo(x, yy + hh - 3);
  ctx.lineTo(x + w, yy + hh - 3);
  ctx.stroke();

  // 四角括号
  const L = Math.min(w, h) * 0.035;
  ctx.strokeStyle = rgba(PALETTE.ember, 0.65);
  ctx.lineWidth = Math.max(1.4, h * 0.003);
  const corners: [number, number, number, number][] = [
    [x, yy, 1, 1], [x + w, yy, -1, 1], [x, yy + hh, 1, -1], [x + w, yy + hh, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * L, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * L);
    ctx.stroke();
  }

  // 扫描行：这块板也是投影出来的
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#000';
  for (let sy = yy; sy < yy + hh; sy += 3) ctx.fillRect(x, sy, w, 1.2);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/** 标题组：中文大字 + 拉丁副标题 + 一条贯穿的细线 */
function heading(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  cn: string, en: string,
): void {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(PALETTE.bone, 0.92);
  ctx.font = display(h * 0.030, 600);
  setTracking(ctx, h * 0.0085);
  ctx.fillText(cn, x, y);
  const cw = ctx.measureText(cn).width;
  clearTracking(ctx);

  ctx.fillStyle = rgba(PALETTE.rustHot, 0.60);
  ctx.font = mono(h * 0.0165, 500);
  tracked(ctx, en, x + cw + h * 0.020, y - h * 0.0015, h * 0.0055);

  ctx.strokeStyle = rgba(PALETTE.rust, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.014);
  ctx.lineTo(x + w, y + h * 0.014);
  ctx.stroke();
  ctx.restore();
}

/** 左轨刻度 */
function rail(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, hgt: number, h: number, count: number,
): void {
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.rust, 0.22);
  ctx.lineWidth = 1;
  for (let i = 0; i <= count; i++) {
    const yy = y + (hgt / count) * i;
    const major = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + (major ? h * 0.010 : h * 0.005), yy);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba(PALETTE.rust, 0.16);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + hgt);
  ctx.stroke();
  ctx.restore();
}

/** 底部按键提示 */
function keyHints(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, h: number,
  hints: readonly [string, string][],
): void {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let cx = x;
  for (const [key, label] of hints) {
    ctx.font = mono(h * 0.0145, 600);
    const kw = ctx.measureText(key).width + h * 0.014;
    ctx.strokeStyle = rgba(PALETTE.rust, 0.5);
    ctx.lineWidth = 1;
    roundRect(ctx, cx, y - h * 0.0125, kw, h * 0.025, h * 0.004);
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.ember, 0.85);
    ctx.fillText(key, cx + h * 0.007, y);
    cx += kw + h * 0.008;
    ctx.font = cjk(h * 0.0155, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
    ctx.fillText(label, cx, y);
    cx += ctx.measureText(label).width + h * 0.026;
  }
  ctx.restore();
}

/** 一行可选项：选中时左侧长出一条实心条 */
function optionRow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, rowH: number, h: number,
  label: string, right: string,
  opts: { selected: boolean; disabled?: boolean; danger?: boolean; time: number; sub?: string },
): void {
  const { selected, disabled, danger } = opts;
  const col = disabled ? PALETTE.boneWhisper : danger ? PALETTE.bloodHot : selected ? PALETTE.ember : PALETTE.boneDim;
  const alpha = disabled ? 0.38 : selected ? 1 : 0.76;

  ctx.save();
  if (selected) {
    const pulse = 0.72 + 0.28 * Math.sin(opts.time * 4.2);
    const g = ctx.createLinearGradient(x, y, x + w * 0.65, y);
    g.addColorStop(0, rgba(danger ? PALETTE.bloodDim : PALETTE.rustDeep, 0.55 * pulse));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y - rowH * 0.38, w, rowH * 0.76);
    ctx.fillStyle = rgba(col, 0.95);
    ctx.fillRect(x, y - rowH * 0.38, h * 0.004, rowH * 0.76);
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(col, alpha);
  ctx.font = cjk(h * 0.0215, selected ? 500 : 400);
  ctx.fillText(label, x + h * 0.018, y - (opts.sub ? rowH * 0.11 : 0));

  if (opts.sub) {
    ctx.font = cjk(h * 0.0155, 300);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, alpha * 0.7);
    ctx.fillText(opts.sub, x + h * 0.018, y + rowH * 0.20);
  }

  if (danger && !disabled) {
    // 不可逆：在标签后面加一道划痕状的记号
    const tw = ctx.measureText(label).width;
    ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + h * 0.018 + tw + h * 0.010, y - rowH * 0.16);
    ctx.lineTo(x + h * 0.018 + tw + h * 0.024, y + rowH * 0.16);
    ctx.stroke();
  }

  if (right) {
    ctx.textAlign = 'right';
    ctx.font = mono(h * 0.0185, 600);
    ctx.fillStyle = rgba(disabled ? PALETTE.boneWhisper : PALETTE.rustHot, alpha * 0.9);
    ctx.fillText(right, x + w - h * 0.012, y);
  }
  ctx.restore();
}

// ============================================================================
// 面板渲染器
// ============================================================================

export class PanelRenderer {
  render(ctx: CanvasRenderingContext2D, w: number, h: number, s: PanelState): void {
    if (!s.kind || s.open <= 0.001) return;
    ctx.save();
    // 面板出现时，背后的世界会被压暗 —— 注意力管理
    ctx.fillStyle = `rgba(2,4,8,${(0.70 * smoothstep(s.open)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    switch (s.kind) {
      case 'dialogue': this.dialogue(ctx, w, h, s); break;
      case 'inventory': this.inventory(ctx, w, h, s); break;
      case 'map': this.map(ctx, w, h, s); break;
      case 'log': this.log(ctx, w, h, s); break;
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------------

  private dialogue(ctx: CanvasRenderingContext2D, w: number, h: number, s: PanelState): void {
    const m = s.dialogue;
    if (!m) return;
    // 版面自适应内容高度、底边对齐。
    // 固定高度会让「正文占满 + 选项条数多」时最后一条选项压到按键提示上，
    // 所以这里先把每一段要占的地方算清楚，再决定面板多高。
    const rowH = h * 0.0470;
    const bodyLines = 5;
    const bodyLineH = h * 0.0380;
    const headerH = m.speaker ? h * 0.052 : h * 0.020;
    const padTop = h * 0.052;
    const hintsBand = h * 0.052;

    const x = w * 0.115;
    const pw = w * 0.770;
    const ph = padTop + headerH + bodyLines * bodyLineH + h * 0.022
      + rowH * m.choices.length + hintsBand;
    const y = h * 0.955 - ph;

    plate(ctx, x, y, pw, ph, s.open, s.time);
    if (smoothstep(s.open) < 0.6) return;

    const ix = x + h * 0.038;
    const iy = y + padTop;
    const iw = pw - h * 0.076;

    // 说话人牌
    const hasPortrait = m.portraitSeed !== undefined;
    const portW = hasPortrait ? h * 0.150 : 0;
    if (hasPortrait) this.portrait(ctx, ix, iy - h * 0.004, portW, h * 0.190, m.portraitSeed!, s.time, s.corruption);

    const tx = ix + (hasPortrait ? portW + h * 0.032 : 0);
    const tw = iw - (hasPortrait ? portW + h * 0.032 : 0);

    if (m.speaker) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(PALETTE.ember, 0.92);
      ctx.font = display(h * 0.0245, 600);
      setTracking(ctx, h * 0.0070);
      ctx.fillText(m.speaker, tx, iy + h * 0.008);
      clearTracking(ctx);
      ctx.strokeStyle = rgba(PALETTE.rust, 0.42);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, iy + h * 0.019);
      ctx.lineTo(tx + tw, iy + h * 0.019);
      ctx.stroke();
    }

    // 正文
    ctx.fillStyle = rgba(PALETTE.bone, 0.90);
    ctx.font = cjk(h * 0.0235, 400);
    ctx.textBaseline = 'alphabetic';
    const bodyY = iy + headerH;
    const used = paragraph(ctx, m.text, tx, bodyY, tw, bodyLineH, bodyLines);

    // 选项：贴着按键提示带的上沿排，正文短的时候整块往下靠
    let cy = y + ph - hintsBand - rowH * m.choices.length;
    cy = Math.max(cy, bodyY + used + h * 0.018);
    for (let i = 0; i < m.choices.length; i++) {
      const c = m.choices[i];
      optionRow(ctx, ix, cy, iw, rowH, h, `${i + 1}. ${c.label}`, c.cost ? `${c.cost} 呼吸` : '', {
        selected: i === m.selected,
        disabled: c.disabled,
        danger: c.irreversible,
        time: s.time,
        sub: i === m.selected ? c.tooltip : undefined,
      });
      cy += rowH;
    }

    ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ix, y + ph - hintsBand + h * 0.006);
    ctx.lineTo(ix + iw, y + ph - hintsBand + h * 0.006);
    ctx.stroke();
    keyHints(ctx, ix, y + ph - h * 0.024, h, [['↑↓', '选择'], ['ENTER', '确定'], ['ESC', '离开']]);
  }

  /** 程序化人像剪影。不画脸 —— 本作里没有一张脸值得信任。 */
  private portrait(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h2: number,
    seed: number, time: number, corruption: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h2);
    ctx.clip();

    const g = ctx.createLinearGradient(x, y, x, y + h2);
    g.addColorStop(0, 'rgba(12,18,26,0.9)');
    g.addColorStop(1, 'rgba(4,6,10,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h2);

    const cx = x + w * 0.5;
    const cy = y + h2 * 0.62;
    const sc = h2 * 0.46;
    // 剪影
    const wob = Math.sin(time * 0.7 + seed) * corruption * w * 0.012;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx + wob, cy - sc * 0.78, sc * 0.30, sc * 0.37, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - sc * 0.62 + wob, cy + sc * 0.9);
    ctx.quadraticCurveTo(cx - sc * 0.50 + wob, cy - sc * 0.40, cx + wob, cy - sc * 0.46);
    ctx.quadraticCurveTo(cx + sc * 0.50 + wob, cy - sc * 0.40, cx + sc * 0.62 + wob, cy + sc * 0.9);
    ctx.closePath();
    ctx.fill();

    // 轮廓光：只有一侧
    ctx.strokeStyle = rgba(PALETTE.rustHot, 0.42);
    ctx.lineWidth = Math.max(1.2, h2 * 0.012);
    ctx.beginPath();
    ctx.arc(cx + wob, cy - sc * 0.78, sc * 0.335, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // 扫描噪声
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 26; i++) {
      const yy = y + hash2(i, seed | 0) * h2;
      ctx.fillStyle = i % 3 === 0 ? rgba(PALETTE.rust, 0.5) : 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, yy, w, 1 + hash2(i, 77) * 1.5);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = rgba(PALETTE.rust, 0.5);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h2 - 1);
    ctx.restore();
  }

  // --------------------------------------------------------------------------

  private inventory(ctx: CanvasRenderingContext2D, w: number, h: number, s: PanelState): void {
    const m = s.inventory;
    if (!m) return;
    const x = w * 0.140;
    const y = h * 0.120;
    const pw = w * 0.720;
    const ph = h * 0.760;
    plate(ctx, x, y, pw, ph, s.open, s.time);
    if (smoothstep(s.open) < 0.6) return;

    const ix = x + h * 0.042;
    const iy = y + h * 0.060;
    const iw = pw - h * 0.084;
    heading(ctx, ix, iy, iw, h, '随身', 'PAYLOAD');

    const listW = iw * 0.52;
    const listY = iy + h * 0.046;
    const listH = ph - h * 0.150;
    rail(ctx, ix - h * 0.018, listY, listH, h, 20);

    // 负重
    const load = m.items.reduce((a, it) => a + it.weight * it.count, 0);
    const loadN = clamp01(load / Math.max(1, m.capacity));
    const noiseSum = clamp01(m.items.reduce((a, it) => a + it.noise * it.count, 0) / 60);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = mono(h * 0.0165, 500);
    ctx.fillStyle = rgba(loadN > 0.85 ? PALETTE.bloodHot : PALETTE.boneDim, 0.85);
    ctx.fillText(`${load.toFixed(1)} / ${m.capacity.toFixed(0)} kg`, ix + iw, iy);
    // 负重与响度两条小条
    const barW = iw * 0.20;
    const barX = ix + iw - barW;
    for (const [i, [v, col, label]] of ([[loadN, PALETTE.rustHot, '负重'], [noiseSum, PALETTE.bloodHot, '响度']] as const).entries()) {
      const by = iy + h * 0.014 + i * h * 0.016;
      ctx.fillStyle = rgba(PALETTE.rust, 0.18);
      ctx.fillRect(barX, by, barW, h * 0.0055);
      ctx.fillStyle = rgba(col, 0.8);
      ctx.fillRect(barX, by, barW * v, h * 0.0055);
      ctx.textAlign = 'right';
      ctx.font = cjk(h * 0.0135, 400);
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.6);
      ctx.fillText(label, barX - h * 0.008, by + h * 0.006);
    }

    // 列表
    const rowH = h * 0.0455;
    const maxRows = Math.floor(listH / rowH);
    const start = clamp(m.selected - Math.floor(maxRows / 2), 0, Math.max(0, m.items.length - maxRows));
    for (let i = 0; i < Math.min(maxRows, m.items.length); i++) {
      const idx = start + i;
      const it = m.items[idx];
      if (!it) break;
      const ry = listY + rowH * i + rowH * 0.5;
      // 图标
      this.itemIcon(ctx, ix + h * 0.004, ry, h * 0.017, it.kind, idx === m.selected);
      optionRow(
        ctx, ix + h * 0.022, ry, listW - h * 0.022, rowH, h,
        it.name, it.count > 1 ? `×${it.count}` : '',
        { selected: idx === m.selected, danger: it.kind === 'relic', time: s.time },
      );
    }

    // 细节栏
    const dx = ix + listW + h * 0.036;
    const dw = iw - listW - h * 0.036;
    ctx.strokeStyle = rgba(PALETTE.rust, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx - h * 0.018, listY);
    ctx.lineTo(dx - h * 0.018, listY + listH);
    ctx.stroke();

    const sel = m.items[m.selected];
    if (sel) {
      ctx.textAlign = 'left';
      ctx.fillStyle = rgba(PALETTE.bone, 0.94);
      ctx.font = display(h * 0.0265, 600);
      setTracking(ctx, h * 0.005);
      ctx.fillText(sel.name, dx, listY + h * 0.024);
      clearTracking(ctx);

      ctx.font = mono(h * 0.0155, 500);
      ctx.fillStyle = rgba(PALETTE.rustHot, 0.65);
      tracked(ctx, KIND_EN[sel.kind], dx, listY + h * 0.046, h * 0.005);

      ctx.strokeStyle = rgba(PALETTE.rust, 0.3);
      ctx.beginPath();
      ctx.moveTo(dx, listY + h * 0.058);
      ctx.lineTo(dx + dw, listY + h * 0.058);
      ctx.stroke();

      ctx.fillStyle = rgba(PALETTE.boneDim, 0.82);
      ctx.font = cjk(h * 0.0205, 400);
      paragraph(ctx, sel.description, dx, listY + h * 0.090, dw, h * 0.0355, 7);

      // 属性
      const props: [string, string][] = [
        ['重量', `${sel.weight.toFixed(1)} kg`],
        ['响度', `${sel.noise.toFixed(0)} dB`],
        ['数量', `${sel.count}`],
      ];
      let py = listY + listH - h * 0.090;
      for (const [k, v] of props) {
        ctx.textAlign = 'left';
        ctx.font = cjk(h * 0.0165, 400);
        ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.65);
        ctx.fillText(k, dx, py);
        ctx.textAlign = 'right';
        ctx.font = mono(h * 0.0175, 600);
        ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
        ctx.fillText(v, dx + dw * 0.55, py);
        py += h * 0.028;
      }
    }

    keyHints(ctx, ix, y + ph - h * 0.028, h, [['↑↓', '浏览'], ['E', '使用'], ['D', '丢弃'], ['ESC', '关闭']]);
  }

  private itemIcon(
    ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
    kind: InventoryItem['kind'], selected: boolean,
  ): void {
    ctx.save();
    ctx.translate(x + r, y);
    ctx.strokeStyle = rgba(selected ? PALETTE.ember : PALETTE.boneWhisper, selected ? 0.95 : 0.55);
    ctx.lineWidth = Math.max(1.1, r * 0.13);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (kind) {
      case 'tool':
        ctx.moveTo(-r * 0.7, r * 0.6); ctx.lineTo(r * 0.3, -r * 0.4);
        ctx.moveTo(r * 0.1, -r * 0.6); ctx.lineTo(r * 0.7, 0); ctx.lineTo(r * 0.3, r * 0.2);
        break;
      case 'weapon':
        ctx.moveTo(-r * 0.6, r * 0.7); ctx.lineTo(r * 0.5, -r * 0.7);
        ctx.moveTo(-r * 0.2, r * 0.3); ctx.lineTo(-r * 0.7, r * 0.2);
        break;
      case 'consumable':
        ctx.moveTo(-r * 0.4, -r * 0.7); ctx.lineTo(r * 0.4, -r * 0.7);
        ctx.lineTo(r * 0.4, r * 0.4); ctx.arc(0, r * 0.4, r * 0.4, 0, Math.PI);
        ctx.lineTo(-r * 0.4, -r * 0.7);
        break;
      case 'key':
        ctx.arc(-r * 0.3, 0, r * 0.35, 0, TAU);
        ctx.moveTo(r * 0.05, 0); ctx.lineTo(r * 0.75, 0);
        ctx.moveTo(r * 0.55, 0); ctx.lineTo(r * 0.55, r * 0.35);
        break;
      case 'relic':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU - Math.PI / 2;
          const px = Math.cos(a) * r * 0.7;
          const py = Math.sin(a) * r * 0.7;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7);
        break;
      case 'document':
        ctx.rect(-r * 0.5, -r * 0.7, r, r * 1.4);
        ctx.moveTo(-r * 0.25, -r * 0.3); ctx.lineTo(r * 0.25, -r * 0.3);
        ctx.moveTo(-r * 0.25, 0); ctx.lineTo(r * 0.25, 0);
        ctx.moveTo(-r * 0.25, r * 0.3); ctx.lineTo(r * 0.1, r * 0.3);
        break;
      default:
        ctx.rect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
        ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------------------

  private map(ctx: CanvasRenderingContext2D, w: number, h: number, s: PanelState): void {
    const m = s.map;
    if (!m) return;
    const x = w * 0.105;
    const y = h * 0.100;
    const pw = w * 0.790;
    const ph = h * 0.800;
    plate(ctx, x, y, pw, ph, s.open, s.time);
    if (smoothstep(s.open) < 0.6) return;

    const ix = x + h * 0.042;
    const iy = y + h * 0.060;
    const iw = pw - h * 0.084;
    heading(ctx, ix, iy, iw, h, '心智地图', 'MENTAL CHART');

    ctx.textAlign = 'right';
    ctx.font = mono(h * 0.0155, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.6);
    ctx.fillText('这张图由你自己画。它可能是错的。', ix + iw, iy);

    const gx = ix;
    const gy = iy + h * 0.055;
    const gw = iw;
    const gh = ph - h * 0.165;

    // 网格
    ctx.strokeStyle = rgba(PALETTE.rust, 0.07);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      const px = gx + (gw / 16) * i;
      ctx.beginPath(); ctx.moveTo(px, gy); ctx.lineTo(px, gy + gh); ctx.stroke();
    }
    for (let i = 0; i <= 9; i++) {
      const py = gy + (gh / 9) * i;
      ctx.beginPath(); ctx.moveTo(gx, py); ctx.lineTo(gx + gw, py); ctx.stroke();
    }

    const rooms = m.rooms.filter((r) => r.mapped || r.visited);
    if (rooms.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.5);
      ctx.font = cjk(h * 0.024, 400);
      ctx.fillText('没有任何东西被测绘。发一次声呐。', gx + gw / 2, gy + gh / 2);
      keyHints(ctx, ix, y + ph - h * 0.028, h, [['M', '关闭']]);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const r of rooms) {
      minX = Math.min(minX, r.pos.x); maxX = Math.max(maxX, r.pos.x);
      minY = Math.min(minY, r.pos.y); maxY = Math.max(maxY, r.pos.y);
    }
    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const pad = h * 0.060;
    const px = (v: number) => gx + pad + ((v - minX) / spanX) * (gw - pad * 2);
    const py = (v: number) => gy + pad + ((v - minY) / spanY) * (gh - pad * 2);

    // 门
    const byId = new Map<ID, Room>();
    for (const r of m.rooms) byId.set(r.id, r);
    for (const r of rooms) {
      for (const d of r.doors) {
        const o = byId.get(d.to);
        if (!o || (!o.mapped && !o.visited)) continue;
        ctx.strokeStyle = rgba(d.unstable ? PALETTE.blood : PALETTE.rustDim, d.unstable ? 0.55 : 0.40);
        ctx.lineWidth = d.unstable ? 1.6 : 1.3;
        ctx.setLineDash(d.unstable ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(px(r.pos.x), py(r.pos.y));
        ctx.lineTo(px(o.pos.x), py(o.pos.y));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 房间
    const nr = Math.min(gw, gh) * 0.026;
    for (const r of rooms) {
      const cx = px(r.pos.x);
      const cy = py(r.pos.y);
      const cur = r.id === m.currentRoomId;
      const phantom = r.veracity === 'phantom';
      const breath = phantom ? 0.55 + 0.45 * Math.sin(s.time * TAU * 0.7 + r.pos.x) : 1;
      const col = cur ? PALETTE.bone : r.visited ? PALETTE.rustHot : PALETTE.rustDeep;

      ctx.save();
      if (cur) {
        ctx.shadowBlur = nr * 2.2;
        ctx.shadowColor = rgba(PALETTE.ember, 0.8);
      }
      ctx.fillStyle = rgba(col, 0.16 * breath);
      ctx.strokeStyle = rgba(col, (r.visited ? 0.9 : 0.5) * breath);
      ctx.lineWidth = cur ? 2 : 1.3;
      roundRect(ctx, cx - nr * 1.5, cy - nr, nr * 3, nr * 2, nr * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = cjk(h * 0.0155, cur ? 500 : 400);
      ctx.fillStyle = rgba(cur ? PALETTE.bone : PALETTE.boneWhisper, (cur ? 0.95 : 0.62) * breath);
      ctx.fillText(r.name, cx, cy + nr * 2.1);
      ctx.font = mono(h * 0.0125, 500);
      ctx.fillStyle = rgba(PALETTE.rust, 0.55 * breath);
      ctx.fillText(`D${r.deck}`, cx, cy);

      if (cur) {
        const p = 0.4 + 0.6 * Math.abs(Math.sin(s.time * 2.6));
        ctx.strokeStyle = rgba(PALETTE.ember, p * 0.8);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, nr * (2.4 + 0.5 * Math.sin(s.time * 2.6)), 0, TAU);
        ctx.stroke();
      }
    }

    // 图例
    const lx = gx + gw - h * 0.230;
    let ly = gy + gh - h * 0.110;
    const legend: [string, string][] = [
      ['已踏入', PALETTE.rustHot],
      ['仅测绘', PALETTE.rustDeep],
      ['不稳定门', PALETTE.blood],
      ['当前位置', PALETTE.bone],
    ];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const [label, col] of legend) {
      ctx.fillStyle = rgba(col, 0.85);
      ctx.fillRect(lx, ly - h * 0.004, h * 0.016, h * 0.008);
      ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
      ctx.font = cjk(h * 0.0155, 400);
      ctx.fillText(label, lx + h * 0.024, ly);
      ly += h * 0.026;
    }

    keyHints(ctx, ix, y + ph - h * 0.028, h, [['方向键', '平移'], ['SPACE', '做标记'], ['M', '关闭']]);
  }

  // --------------------------------------------------------------------------

  private log(ctx: CanvasRenderingContext2D, w: number, h: number, s: PanelState): void {
    const m = s.log;
    if (!m) return;
    const x = w * 0.140;
    const y = h * 0.120;
    const pw = w * 0.720;
    const ph = h * 0.760;
    plate(ctx, x, y, pw, ph, s.open, s.time);
    if (smoothstep(s.open) < 0.6) return;

    const ix = x + h * 0.042;
    const iy = y + h * 0.060;
    const iw = pw - h * 0.084;
    heading(ctx, ix, iy, iw, h, '航海日志', 'SHIP LOG');

    const listW = iw * 0.40;
    const listY = iy + h * 0.050;
    const listH = ph - h * 0.150;
    rail(ctx, ix - h * 0.018, listY, listH, h, 20);

    const rowH = h * 0.0520;
    const maxRows = Math.floor(listH / rowH);
    const start = clamp(m.selected - Math.floor(maxRows / 2), 0, Math.max(0, m.entries.length - maxRows));
    for (let i = 0; i < Math.min(maxRows, m.entries.length); i++) {
      const idx = start + i;
      const e = m.entries[idx];
      if (!e) break;
      const ry = listY + rowH * i + rowH * 0.5;
      optionRow(ctx, ix, ry, listW, rowH, h, e.title, e.unread ? '新' : '', {
        selected: idx === m.selected,
        danger: e.tone === 'bad',
        time: s.time,
        sub: e.stamp,
      });
    }

    // 正文
    const dx = ix + listW + h * 0.040;
    const dw = iw - listW - h * 0.040;
    ctx.strokeStyle = rgba(PALETTE.rust, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx - h * 0.020, listY);
    ctx.lineTo(dx - h * 0.020, listY + listH);
    ctx.stroke();

    const sel = m.entries[m.selected];
    if (sel) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = rgba(PALETTE.bone, 0.94);
      ctx.font = display(h * 0.0270, 600);
      setTracking(ctx, h * 0.0055);
      ctx.fillText(sel.title, dx, listY + h * 0.026);
      clearTracking(ctx);

      ctx.font = mono(h * 0.0155, 400);
      ctx.fillStyle = rgba(PALETTE.rustHot, 0.62);
      tracked(ctx, sel.stamp, dx, listY + h * 0.050, h * 0.005);

      ctx.strokeStyle = rgba(PALETTE.rust, 0.28);
      ctx.beginPath();
      ctx.moveTo(dx, listY + h * 0.062);
      ctx.lineTo(dx + dw, listY + h * 0.062);
      ctx.stroke();

      // 低理智时日志会自己改写：随机字符被替换
      let body = sel.body;
      if (s.corruption > 0.5) body = corruptText(body, s.corruption, s.time);

      ctx.fillStyle = rgba(sel.tone === 'whisper' ? PALETTE.boneWhisper : PALETTE.boneDim, 0.86);
      ctx.font = cjk(h * 0.0215, sel.tone === 'whisper' ? 300 : 400);
      paragraph(ctx, body, dx, listY + h * 0.098, dw, h * 0.0375, 13);
    }

    keyHints(ctx, ix, y + ph - h * 0.028, h, [['↑↓', '翻阅'], ['TAB', '按时间/按主题'], ['ESC', '关闭']]);
  }
}

const KIND_EN: Record<InventoryItem['kind'], string> = {
  tool: 'TOOL', weapon: 'WEAPON', consumable: 'CONSUMABLE',
  key: 'KEY', relic: 'RELIC', material: 'MATERIAL', document: 'DOCUMENT',
};

/** 日志自我改写：换掉少量字符，但保持长度与标点，让人怀疑是自己记错了 */
function corruptText(src: string, level: number, time: number): string {
  const pool = '它在听你我们下面回来了永远不要回答';
  const chars = Array.from(src);
  const n = Math.floor(chars.length * clamp01((level - 0.5) / 0.5) * 0.06);
  const slot = Math.floor(time * 0.5);
  for (let i = 0; i < n; i++) {
    const at = Math.floor(hash2(i, slot) * chars.length);
    if (/[\s，。、！？\n]/.test(chars[at])) continue;
    chars[at] = pool[Math.floor(hash2(i, slot + 31) * pool.length) % pool.length];
  }
  return chars.join('');
}