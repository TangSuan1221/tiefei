/**
 * 全息几何台。领航台上单独的一块屏。
 * ============================================================================
 * 声呐是 PPI：回波、红点、开口。它不该长出一张立体地图。
 * 几何在这块全息台上：分析第一卷之后，画出**当前这一间**的内部。
 * 墙、障碍、开口。拧航向和潜深，对准开口再推。一次不画整关。
 *
 * 这块屏和摄像头实景（view/camera-room.ts）共用 view/roomview.ts 的几何与投影。
 * 一行自己的投影代码都不许有 —— 这里画的方位就是探照灯下会看见的方位，
 * 两套数学早晚会漂，一套不会。
 */

import { PALETTE, rgba } from '@/render/palette';
import { cjk, mono } from '@/ui/typography';
import type { PodRun } from '../sim/run';
import type { Volume } from '../gen/volume';
import { OBSTACLE_CN, type ObstacleKind } from '../gen/interior';
import { bearingOf, projectScene, quadPoly, roomGeometry } from './camera-room';
import {
  basisOf,
  doorFrame,
  focalFor,
  projectPoint,
  projectRoom,
  type Eye,
  type EyeBasis,
  type ProjPt,
  type ProjQuad,
  type RoomGeometry,
  type Viewport,
} from './roomview';

/**
 * 全息屏的半视场角。
 * 换算自旧实现的 focal = min(w,h) * 0.62，所以这次重写没有改变构图。
 */
const HOLO_HALF_FOV = 0.678;

export function drawHoloMap(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
): void {
  const live = run.powered && !run.blackout;
  roundWell(ctx, x, y, w, h);
  ctx.fillStyle = live ? '#070b12' : '#030508';
  ctx.fill();

  ctx.save();
  roundWell(ctx, x, y, w, h);
  ctx.clip();

  if (live) {
    const glow = ctx.createRadialGradient(x + w * 0.5, y + h * 0.42, w * 0.08, x + w * 0.5, y + h * 0.5, w * 0.72);
    glow.addColorStop(0, rgba(PALETTE.rustDeep, 0.22));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);

    const scanY = y + ((time * 28) % (h + 18)) - 8;
    const sg = ctx.createLinearGradient(x, scanY - 10, x, scanY + 14);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.45, rgba(PALETTE.ember, 0.07));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, scanY - 10, w, 24);
  }

  ctx.fillStyle = rgba(PALETTE.boneWhisper, live ? 0.72 : 0.35);
  ctx.font = mono(h * 0.045, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('HOLO', x + w * 0.06, y + h * 0.075);
  ctx.font = cjk(h * 0.042, 500);
  ctx.fillStyle = rgba(PALETTE.ember, live ? 0.85 : 0.3);
  ctx.fillText('近场几何', x + w * 0.28, y + h * 0.075);

  if (!live) {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.45);
    ctx.font = cjk(h * 0.05, 400);
    ctx.textAlign = 'center';
    ctx.fillText('无电', x + w * 0.5, y + h * 0.52);
    ctx.restore();
    strokeWell(ctx, x, y, w, h, time, false);
    return;
  }

  const vol = run.volume;
  const site = run.phase === 'site' && !!vol;
  const inner = { x: x + w * 0.06, y: y + h * 0.11, w: w * 0.88, h: h * 0.72 };

  if (!site || !vol) {
    ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
    ctx.font = cjk(h * 0.048, 400);
    ctx.textAlign = 'center';
    ctx.fillText('航渡中 · 无近场锁', x + w * 0.5, y + h * 0.48);
    ctx.font = cjk(h * 0.038, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.5);
    ctx.fillText('声呐上那团是未知废墟。', x + w * 0.5, y + h * 0.56);
  } else if (!vol.identified) {
    ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.3);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
    ctx.setLineDash([]);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.75);
    ctx.font = cjk(h * 0.044, 400);
    ctx.textAlign = 'center';
    ctx.fillText('内部未重建', x + w * 0.5, y + h * 0.44);
    ctx.font = cjk(h * 0.036, 400);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
    ctx.fillText('拍第一卷，送到分析台。', x + w * 0.5, y + h * 0.52);
    ctx.fillText('几何进场之前，这里是空的。', x + w * 0.5, y + h * 0.59);
  } else {
    drawVolume(ctx, run, vol, inner.x, inner.y, inner.w, inner.h, time);
  }

  ctx.fillStyle = rgba(PALETTE.boneDim, 0.7);
  ctx.font = cjk(h * 0.038, 400);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const foot =
    !site ? 'PPI 报废墟。几何在这里。'
    : !vol!.identified ? '未分析 · 内部还没长出来'
    : '这一间的内部 · 对准开口再推';
  ctx.fillText(foot, x + w * 0.06, y + h * 0.94);

  ctx.restore();
  strokeWell(ctx, x, y, w, h, time, true);
}

/** @deprecated 线框已不叠在声呐上；保留给旧调用点 */
export function drawVolumeWire(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  cx: number,
  cy: number,
  r: number,
  time: number,
): void {
  drawHoloMap(ctx, run, cx - r, cy - r, r * 2, r * 2, time);
}

// ============================================================================
// 这一间的内部
// ============================================================================

/** 面片填充色。不用青绿：全息屏的冷调靠深渊蓝黑，暖调靠铁锈橙 */
function fillOf(q: ProjQuad): string {
  const s = q.src;
  if (s.kind === 'door') return rgba(PALETTE.abyss, 0.85);
  if (s.kind === 'floor') return rgba(PALETTE.ember, 0.07);
  if (s.kind === 'ceiling') return rgba(PALETTE.steelDark, 0.2);
  if (s.kind !== 'obstacle') return rgba(PALETTE.steel, 0.16);
  switch (s.obstacle) {
    case 'pipe':
    case 'beam':
      return rgba(PALETTE.rustDeep, 0.3);
    case 'tank':
      return rgba(PALETTE.rustHot, 0.26);
    case 'column':
      return rgba(PALETTE.boneWhisper, 0.2);
    case 'grate':
      return rgba(PALETTE.steelDark, 0.28);
    default:
      // 货箱。比别的障碍亮一档，因为它是玩家接下来要去翻的东西
      return rgba(PALETTE.rustDim, 0.42);
  }
}

function strokeOf(q: ProjQuad): [string, number] {
  const s = q.src;
  if (s.kind === 'door') return [rgba(PALETTE.ember, 0.9), 1.8];
  if (s.kind === 'obstacle') {
    if (s.obstacle === 'crate') return [rgba(PALETTE.phosphorHot, 0.8), 1.4];
    return [rgba(PALETTE.phosphorMid, 0.45), 0.85];
  }
  return [rgba(PALETTE.phosphorMid, 0.42), 0.8];
}

function drawVolume(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  vol: Volume,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
): void {
  const geo = roomGeometry(vol, run.volumeAt);
  if (!geo) return;

  // 全息屏是从舱自己的位置画的。摄像头的云台会再叠一层 pan/tilt，但光心是同一点
  const eye: Eye = { pos: run.cabinPos, yaw: run.heading, pitch: run.pitch };
  const b = basisOf(eye);
  const cx = x + w * 0.5;
  const cy = y + h * 0.48;
  const vp: Viewport = { cx, cy, focal: focalFor(Math.min(w, h), HOLO_HALF_FOV) };

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // 裁剪、投影、排序全走摄像头那一个入口。只在一边修，两块屏的可见面片就不一致了，
  // 那比穿插更糟：全息屏会给出和实景矛盾的遮挡关系
  const quads = projectScene(geo, eye, vp);

  // projectScene 出来就是远的在前，直接照着画就是画家算法
  for (const q of quads) {
    // 轮廓也走摄像头那一份 quadPoly：连近裁面怎么裁都得一样，不然两块屏上
    // 同一面墙的边会差出一截
    const pts = quadPoly(q);
    if (pts.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fillOf(q);
    ctx.fill();
    const [col, lw] = strokeOf(q);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  drawRoomEdges(ctx, geo, b, vp);
  drawCrateCallouts(ctx, geo, eye, b, vp, x, y, w, h, time);
  drawReticle(ctx, run, cx, cy, w, h, time);

  ctx.fillStyle = rgba(PALETTE.ember, 0.9);
  ctx.font = cjk(h * 0.042, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(geo.label || '舱室', x + w / 2, y + h * 0.06);
  const sight = run.sighting;
  ctx.fillStyle = rgba(sight.kind === 'door' ? PALETTE.ember : PALETTE.boneWhisper, 0.8);
  ctx.font = cjk(h * 0.032, 400);
  ctx.fillText(sight.line, x + w / 2, y + h - 6);

  ctx.restore();
}

/** 房间的十二条棱、地面网格、门框。这三样是「读得出这是一个盒子」的全部 */
function drawRoomEdges(
  ctx: CanvasRenderingContext2D,
  geo: RoomGeometry,
  b: EyeBasis,
  vp: Viewport,
): void {
  const hx = geo.half.x;
  const hy = geo.half.y;
  const hz = geo.half.z;
  const edges: [ProjPt, ProjPt, string, number][] = [];
  const add = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    col: string, lw: number,
  ): void => {
    const pa = projectPoint({ x: ax, y: ay, z: az }, b, vp);
    const pb = projectPoint({ x: bx, y: by, z: bz }, b, vp);
    if (!pa.ok || !pb.ok) return;
    edges.push([pa, pb, col, lw]);
  };

  const corner = rgba(PALETTE.phosphorHot, 0.55);
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) add(-hx, sy * hy, sz * hz, hx, sy * hy, sz * hz, corner, 1.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * hx, -hy, sz * hz, sx * hx, hy, sz * hz, corner, 1.1);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(sx * hx, sy * hy, -hz, sx * hx, sy * hy, hz, corner, 1.1);

  // 地面网格。它给距离一个刻度 —— 没有它，玩家读不出「四米」是多远
  const grid = rgba(PALETTE.phosphorMid, 0.14);
  for (let i = 1; i < 4; i++) {
    const t = -1 + (2 * i) / 4;
    add(t * hx, -hy, hz, t * hx, hy, hz, grid, 0.6);
    add(-hx, t * hy, hz, hx, t * hy, hz, grid, 0.6);
  }

  for (const d of geo.doors) {
    const frame = doorFrame(d);
    for (let i = 0; i < frame.length; i++) {
      const a = frame[i];
      const c = frame[(i + 1) % frame.length];
      add(a.x, a.y, a.z, c.x, c.y, c.z, rgba(PALETTE.ember, 0.9), 1.8);
    }
  }

  edges.sort((p, q) => (q[0].z + q[1].z) / 2 - (p[0].z + p[1].z) / 2);
  for (const [a, c, col, lw] of edges) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** 一屏上最多标三只箱子。再多就成了一张表格，而这里要的是一眼 */
const MAX_CALLOUTS = 3;

/**
 * 货箱的标记与读数。
 *
 * 这是「玩家通过近场地图发现此处有集装箱」这一步的唯一信息源，所以方位和距离
 * 必须和摄像头用同一个基（`bearingOf`）算：玩家把云台拧到这里写的角度，
 * 那只箱子就会压在准星上。
 */
function drawCrateCallouts(
  ctx: CanvasRenderingContext2D,
  geo: RoomGeometry,
  eye: Eye,
  b: EyeBasis,
  vp: Viewport,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
): void {
  const crates = geo.obstacles
    .filter((o) => o.kind === 'crate')
    .map((o) => ({ o, p: projectPoint(o.pos, b, vp), read: bearingOf(o.pos, eye) }))
    .filter((c) => c.p.ok)
    .sort((a, c) => a.read.dist - c.read.dist);

  const fs = h * 0.036;
  ctx.font = cjk(fs, 500);
  ctx.textBaseline = 'middle';
  let labelled = 0;

  for (const c of crates) {
    const onScreen = c.p.x > x - w * 0.2 && c.p.x < x + w * 1.2 && c.p.y > y - h * 0.2 && c.p.y < y + h * 1.2;
    const r = Math.max(4, (Math.max(c.o.size.x, c.o.size.y, c.o.size.z) * 0.5 / c.p.z) * vp.focal);

    // 标记：一个小菱形，压在箱心上。它比方框好认，因为房间里到处都是方的
    ctx.save();
    ctx.translate(c.p.x, c.p.y);
    ctx.rotate(Math.PI * 0.25);
    ctx.strokeStyle = rgba(PALETTE.phosphorHot, 0.9);
    ctx.lineWidth = 1.3;
    const m = Math.min(r * 0.5, h * 0.028);
    ctx.strokeRect(-m, -m, m * 2, m * 2);
    ctx.restore();

    if (!onScreen || labelled >= MAX_CALLOUTS) continue;

    const text = `${OBSTACLE_CN[c.o.kind as ObstacleKind]} · ${c.read.side} ${c.read.deg.toFixed(0)}° · ${c.read.dist.toFixed(1)}m`;
    const tw = ctx.measureText(text).width;
    // 读数挂在标记右边；贴近右沿时翻到左边，免得被屏框切掉
    const flip = c.p.x + r + tw + fs > x + w;
    const tx = flip ? c.p.x - r - tw - fs * 0.5 : c.p.x + r + fs * 0.5;
    const ty = c.p.y - r - fs * 0.5 - labelled * fs * 1.5;

    ctx.strokeStyle = rgba(PALETTE.phosphorHot, 0.5);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(c.p.x + (flip ? -r * 0.7 : r * 0.7), c.p.y - r * 0.7);
    ctx.lineTo(tx + (flip ? tw : 0), ty + fs * 0.5);
    ctx.stroke();

    ctx.fillStyle = rgba(PALETTE.abyss, 0.72);
    ctx.fillRect(tx - fs * 0.25, ty - fs * 0.7, tw + fs * 0.5, fs * 1.4);
    ctx.fillStyle = rgba(PALETTE.ember, 0.55 + Math.sin(time * 2.4 + labelled) * 0.12);
    ctx.fillRect(tx - fs * 0.25, ty + fs * 0.66, tw + fs * 0.5, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(PALETTE.phosphorHot, 0.95);
    ctx.fillText(text, tx, ty);
    labelled++;
  }
}

/** 中心准星。对上开口时它会呼吸并转成余炬色 */
function drawReticle(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  cx: number,
  cy: number,
  w: number,
  h: number,
  time: number,
): void {
  const sight = run.sighting;
  const door = sight.kind === 'door';
  ctx.strokeStyle = rgba(door ? PALETTE.ember : PALETTE.boneDim, door ? 0.95 : 0.55);
  ctx.lineWidth = 1.1;
  const rr = Math.min(w, h) * 0.028 + (door ? Math.sin(time * 5) * 1.2 : 0);
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rr * 2.2, cy);
  ctx.lineTo(cx - rr * 0.7, cy);
  ctx.moveTo(cx + rr * 0.7, cy);
  ctx.lineTo(cx + rr * 2.2, cy);
  ctx.moveTo(cx, cy - rr * 2.2);
  ctx.lineTo(cx, cy - rr * 0.7);
  ctx.moveTo(cx, cy + rr * 0.7);
  ctx.lineTo(cx, cy + rr * 2.2);
  ctx.stroke();
}

// ============================================================================
// 屏框
// ============================================================================

function roundWell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(w, h) * 0.04;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function strokeWell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  live: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.steelLit, live ? 0.55 : 0.25);
  ctx.lineWidth = 1.2;
  roundWell(ctx, x, y, w, h);
  ctx.stroke();

  const pulse = live ? 0.35 + Math.sin(time * 2.1) * 0.12 : 0.12;
  ctx.strokeStyle = rgba(PALETTE.ember, pulse);
  ctx.lineWidth = 1;
  const m = Math.min(w, h) * 0.045;
  const tick = m * 1.6;
  ctx.beginPath();
  ctx.moveTo(x + m, y + m + tick);
  ctx.lineTo(x + m, y + m);
  ctx.lineTo(x + m + tick, y + m);
  ctx.moveTo(x + w - m - tick, y + m);
  ctx.lineTo(x + w - m, y + m);
  ctx.lineTo(x + w - m, y + m + tick);
  ctx.moveTo(x + m, y + h - m - tick);
  ctx.lineTo(x + m, y + h - m);
  ctx.lineTo(x + m + tick, y + h - m);
  ctx.moveTo(x + w - m - tick, y + h - m);
  ctx.lineTo(x + w - m, y + h - m);
  ctx.lineTo(x + w - m, y + h - m - tick);
  ctx.stroke();
  ctx.restore();
}
