/**
 * 舱外摄像头的程序化影像。
 * ============================================================================
 * 逃生舱没有窗户。玩家看见「外面」的唯一方式是这块会掉帧、会起雾、
 * 会在探照灯关掉之后变成纯黑的屏。
 *
 * 造物不读任何外部素材：外形参数在 content/creatures.ts，这里按 `look.plan`
 * 现场把它们画出来。每一帧都是一段恐怖录像 —— 余晖、颗粒、对不准的焦点。
 */

import { hash2, valueNoise2 } from '@/core/rng';
import { clamp, clamp01, lerp, smoothstep } from '@/core/util';
import { PALETTE, rgba } from '@/render/palette';
import { shadeHex } from '@/render/interior';
import type { Creature, CreatureLook } from '../content/creatures';
import type { Wreck } from '../content/route';
import type { PodRun } from '../sim/run';
import { drawPanoWindow, sitePano } from './pano';
import { drawFootageFrame, drawPromptFrame, readyPrompt, readyReel } from './footage';
import { cameraEye, drawRoomCamera, type RoomCameraInput, type RoomMark } from './camera-room';
import { drawDeepseaRoom } from './deepsea';

const TAU = Math.PI * 2;

export interface CameraFeedInput {
  run: PodRun;
  time: number;
  /** 摄像头对准威胁的程度 0..1 */
  aim: number;
  /** 看清进度 0..1，identify 之前慢慢浮现 */
  reveal: number;
}

/**
 * 把摄像头画面画进已经 clip 好的矩形。原点是屏的左上角，尺寸是屏的 w/h。
 * 调用方负责 CRT 框、扫描线和玻璃；这里只负责「水里有什么」。
 */
export function drawCameraFeed(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  input: CameraFeedInput,
): void {
  const { run, time } = input;
  const lit = run.lamp || run.flareLeft > 0;
  const flare = run.flareLeft > 0 ? clamp01(run.flareLeft / 8) : 0;
  const lamp = run.lamp ? 1 : 0;
  const light = clamp01(lamp * 0.85 + flare * 1.1);
  const powered = run.powered ? 1 : 0;
  if (powered < 0.02) {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const depthN = clamp01(run.depth / 1800);
  const zoom = run.camZoom;
  const pan = run.camPan;
  const tilt = run.camTilt;

  // 1. 底层。五种可能，优先级从高到低：
  //
  //    a0) GM 无视频模式：屏上是这一卷会发给接口的提示词，不是片子。
  //    a) 这一段的片子冲出来了，而且玩家正在放它 —— 屏上是那卷片子。
  //       它已经过了降质管线（view/footage.ts），但下面 7/8/9 三层
  //       还得照样叠上去：那三层是这台摄像机的身份证，不是片源的滤镜。
  //    b) 内部已经重建过 —— 屏上是**这一间房**的实景，和全息屏同一份几何。
  //    c) 停在配了全景的站点上 —— 屏上是一张烘好的通用房间。
  //    d) 其余 —— 一片水。没有光的时候也不是纯黑，深海是一种很脏的深蓝。
  //
  // 任何一种失败（没配 key、断网、生成失败、浏览器解不开这个编码）都会让
  // readyReel 返回 null，于是画面自己退回 c/d。游戏不需要知道发生了什么。
  const prompt = readyPrompt(run);
  if (prompt) {
    drawPromptFrame(ctx, w, h, prompt, time);
    drawFeedTail(ctx, w, h, run, time, input.aim, depthN, light, 0.5);
    return;
  }

  const reel = readyReel(run);
  if (reel) {
    drawFootageFrame(ctx, w, h, reel, { time, corruption: run.corruption, light });
    // 片子是拍好的，海雪/地形/怪物那几层不能再叠 —— 它们已经在画面里了。
    // 直接跳到深度雾开始的公共尾段。
    drawFeedTail(ctx, w, h, run, time, input.aim, depthN, light, 0.5);
    return;
  }

  const room = roomFeed(run, time, light, zoom);
  const pano = room ? null : sitePano(run);
  if (room) {
    if (!drawDeepseaRoom(ctx, w, h, room)) drawRoomCamera(ctx, w, h, room);
  } else if (pano) {
    drawPanoWindow(ctx, w, h, pano, {
      pan, tilt, zoom, light, time, corruption: run.corruption,
    });
  } else {
    const abyss = ctx.createLinearGradient(0, 0, 0, h);
    abyss.addColorStop(0, shadeHex('#0a121c', 0.55 + light * 0.35));
    abyss.addColorStop(0.45, shadeHex('#070d14', 0.7));
    abyss.addColorStop(1, '#030508');
    ctx.fillStyle = abyss;
    ctx.fillRect(0, 0, w, h);
  }

  // 2. 探照灯锥。从镜头下方偏左打出去，像焊在舱外的那盏。
  //    全景里的光已经烘进去了，这里只补一层很淡的锥雾，免得把房间洗白。
  //    实景房间的光是逐面算的（litness），再叠一层锥雾会把它洗白，所以跳过。
  if (light > 0.04 && !pano && !room) {
    const apexX = w * (0.50 + pan * 0.04);
    const apexY = h * (0.92 - tilt * 0.08);
    const cone = ctx.createRadialGradient(apexX, apexY, h * 0.02, apexX, apexY - h * 0.55, h * (1.1 / zoom));
    cone.addColorStop(0, `rgba(232,196,140,${0.22 * light})`);
    cone.addColorStop(0.25, `rgba(196,99,42,${0.10 * light})`);
    cone.addColorStop(0.7, `rgba(80,50,22,${0.03 * light})`);
    cone.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cone;
    ctx.fillRect(0, 0, w, h);
  }

  // 3. 海雪。悬浮物是深海镜头里最便宜也最有效的「这是水」。
  //    房间里也一样有 —— 那艘艇早就灌满了。
  drawMarineSnow(ctx, w, h, time, light, zoom, pan, depthN);

  // 4/5. 远景地形和近处废墟。全景和实景房间都已经把「外面长什么样」定死了，
  //      再叠这两层只会互相打架 —— 舱在房间里，不该看见海床。
  if (!pano && !room) {
    drawTerrainGhosts(ctx, w, h, run, light, time);
    const wreck = run.siteWreck();
    if (wreck && Math.abs(pan) < 0.7) {
      drawWreckSilhouette(ctx, w, h, wreck, light, time, pan, tilt, zoom);
    }
  }

  // 6. 那个东西。
  const t = run.threat;
  if (t && t.phase !== 'repelled' && t.phase !== 'struck') {
    const canSee = run.cameraCanSee();
    const aim = input.aim;
    if (t.creature.look.plan === 'absent') {
      drawAbsent(ctx, w, h, t.creature.look, time, aim, run.corruption);
    } else if (canSee && aim > 0.12) {
      const appear = clamp01((aim - 0.12) / 0.55) * (0.35 + input.reveal * 0.65);
      drawCreature(ctx, w, h, t.creature, time, appear, light, zoom);
    } else if (!canSee && t.creature.look.lights > 0 && aim > 0.25) {
      // 没打灯，但它自己在发光。先看见灯，再看见它。
      drawLureOnly(ctx, w, h, t.creature.look, time, aim);
    }
  }

  drawFeedTail(ctx, w, h, run, time, input.aim, depthN, light, room ? 0.3 : pano ? 0.35 : 1);
}

/**
 * 这一刻摄像头该看见真实房间吗。
 *
 * 房间在抵达时已生成，分析只解锁知识，不决定眼前墙壁和箱子是否存在。
 * 实时摄像机始终读取与碰撞和机械臂相同的房间数据。
 */
function roomFeed(
  run: PodRun,
  time: number,
  light: number,
  zoom: number,
): RoomCameraInput | null {
  if (run.phase !== 'site') return null;
  const vol = run.volume;
  if (!vol || !run.volumeAt) return null;
  return {
    vol,
    nodeId: run.volumeAt,
    eye: cameraEye(run.cabinPos, run.heading, run.pitch, run.camPan, run.camTilt),
    zoom,
    light,
    time,
    corruption: run.corruption,
    marks: readMarks(run),
  };
}

/** 集装箱状态由 sim 侧挂上来。还没挂就是没有标记，不该让画面报错 */
function readMarks(run: PodRun): readonly RoomMark[] {
  const hook = (run as unknown as { roomMarks?: () => readonly RoomMark[] }).roomMarks;
  return typeof hook === 'function' ? hook.call(run) ?? [] : [];
}

/**
 * 摄像头屏的公共尾段：深度雾 + 视频雪花 + 取景器。
 *
 * 抽出来是因为它对三种片源（程序化水体、烘好的全景、生成的片子）都必须
 * 一模一样地叠一遍。这三层是「这是舱外那台坏摄像机」的全部证据 ——
 * 少了它们，再好的画面也只是一张贴图。
 */
function drawFeedTail(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  run: PodRun,
  time: number,
  aim: number,
  depthN: number,
  light: number,
  fogK: number,
): void {
  // 深度雾：越深，画面越被一层灰蓝糊住。全景和片子只隔着几米水，
  // 雾要薄得多，不然刚烘出来的房间又被糊没了。
  const fog = ctx.createLinearGradient(0, 0, 0, h);
  fog.addColorStop(0, `rgba(8,14,22,${(0.08 + depthN * 0.18) * fogK})`);
  fog.addColorStop(1, `rgba(2,4,8,${(0.22 + depthN * 0.35) * fogK})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, 0, w, h);

  // 没电 / 信号差时的雪花。污染高的时候雪花会组成一张脸，一帧。
  drawVideoNoise(ctx, w, h, time, run.corruption, 1 - light);

  // 取景器：方位刻度、REC、时间码。这层让它「是一台摄像机」而不是一张图。
  drawViewfinder(ctx, w, h, run, time, aim);
}

// ============================================================================
// 水
// ============================================================================

function drawMarineSnow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  light: number,
  zoom: number,
  pan: number,
  depthN: number,
): void {
  const n = Math.round(70 + light * 90);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const seed = i * 17.13;
    const z = 0.15 + hash2(i, 9) * 0.85;
    const drift = time * (4 + z * 10) * (0.6 + depthN);
    const x = ((hash2(i, 3) + pan * 0.04 * z + time * 0.012 * (hash2(i, 5) - 0.5)) % 1) * w;
    const y = ((hash2(i, 7) + drift * 0.015) % 1) * h;
    const s = (0.4 + z * 1.8) * zoom * (0.7 + light * 0.6);
    const a = (0.04 + z * 0.18) * (0.25 + light * 0.9) * (0.5 + Math.sin(time * 0.7 + seed) * 0.5);
    ctx.fillStyle = `rgba(210,200,180,${a.toFixed(3)})`;
    ctx.fillRect(x, y, s, s * (0.6 + hash2(i, 11) * 0.8));
  }
  ctx.restore();
}

function drawTerrainGhosts(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  run: PodRun,
  light: number,
  time: number,
): void {
  if (light < 0.08) return;
  const err = clamp(Math.abs(run.headingError) / 50, 0, 1);
  // 偏航越大，正前方的「墙」越近、越高
  const wallH = h * (0.18 + err * 0.55);
  const jitter = (valueNoise2(time * 0.4, 2, 4) - 0.5) * w * 0.02;
  ctx.save();
  ctx.globalAlpha = (0.12 + err * 0.35) * light;
  ctx.fillStyle = '#05080c';
  ctx.beginPath();
  ctx.moveTo(0, h);
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const n = valueNoise2(u * 8 + run.traveled * 0.004, run.legIndex * 3, 11);
    const y = h - wallH * (0.45 + n * 0.7) - Math.sin(u * Math.PI) * wallH * err * 0.4;
    ctx.lineTo(u * w + jitter, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWreckSilhouette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  wreck: Wreck,
  light: number,
  time: number,
  pan: number,
  tilt: number,
  zoom: number,
): void {
  const cx = w * (0.5 - pan * 0.35);
  const cy = h * (0.58 - tilt * 0.3);
  const s = h * 0.38 * zoom;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha = 0.18 + light * 0.45;
  ctx.fillStyle = '#0a0e14';
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.18 * light);
  ctx.lineWidth = Math.max(1, h * 0.004);
  // 一截歪掉的舱段：两个圆筒 + 断口
  ctx.save();
  ctx.rotate(-0.18 + Math.sin(time * 0.15) * 0.02);
  roundish(ctx, -s * 0.7, -s * 0.22, s * 1.1, s * 0.44, s * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#05070b';
  ctx.fillRect(-s * 0.15, -s * 0.18, s * 0.22, s * 0.36);
  // 天线 / 管子
  ctx.strokeStyle = rgba(PALETTE.steel, 0.5);
  ctx.lineWidth = Math.max(1, s * 0.018);
  ctx.beginPath();
  ctx.moveTo(s * 0.2, -s * 0.22);
  ctx.lineTo(s * 0.28, -s * 0.55);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  void wreck;
}

function roundish(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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

// ============================================================================
// 造物
// ============================================================================

function drawCreature(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Creature,
  time: number,
  appear: number,
  light: number,
  zoom: number,
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(appear);
  const look = c.look;
  const cx = w * 0.5;
  const cy = h * 0.52;
  switch (look.plan) {
    case 'swarm':
      drawSwarm(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    case 'colossus':
      drawColossus(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    case 'crawler':
      drawCrawler(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    case 'bloom':
      drawBloom(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    case 'school':
      drawSchool(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    case 'needle':
      drawNeedle(ctx, w, h, cx, cy, look, time, light, zoom);
      break;
    default:
      break;
  }
  ctx.restore();
}

/** 溺者合唱：七个手挽着手的人影，头发在水里散开，嘴都开着 */
function drawSwarm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const n = look.limbs;
  const span = w * 0.72 * look.scale * zoom;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const px = cx + (u - 0.5) * span;
    const bob = Math.sin(time * look.tempo * TAU + i * 0.9) * h * 0.018;
    const py = cy + bob + (u - 0.5) * (u - 0.5) * h * 0.08;
    const scale = h * 0.22 * look.scale * (0.85 + hash2(i, 4) * 0.3) * zoom;
    drawDrownedBody(ctx, px, py, scale, i, time, look, light);
  }
  // 手挽手的那条暗线
  ctx.strokeStyle = rgba(look.tone, 0.35 * light);
  ctx.lineWidth = Math.max(1.2, h * 0.004);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const px = cx + (u - 0.5) * span;
    const py = cy + Math.sin(time * look.tempo * TAU + i * 0.9) * h * 0.018 + h * 0.02;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function drawDrownedBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  idx: number,
  time: number,
  look: CreatureLook,
  light: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 0.4 + idx) * 0.08);
  const body = ctx.createLinearGradient(0, -s, 0, s);
  body.addColorStop(0, rgba(look.tone, 0.15 + light * 0.35));
  body.addColorStop(0.4, rgba('#1a222c', 0.7));
  body.addColorStop(1, rgba('#070a0e', 0.85));
  ctx.fillStyle = body;
  // 躯干
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.15);
  ctx.quadraticCurveTo(s * 0.22, s * 0.05, s * 0.12, s * 0.7);
  ctx.lineTo(-s * 0.12, s * 0.7);
  ctx.quadraticCurveTo(-s * 0.22, s * 0.05, 0, -s * 0.15);
  ctx.fill();
  // 头
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.32, s * 0.16, s * 0.2, 0, 0, TAU);
  ctx.fill();
  // 嘴：一直开着
  ctx.fillStyle = 'rgba(4,2,2,0.9)';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.26, s * 0.07, s * 0.09, 0, 0, TAU);
  ctx.fill();
  // 眼窝
  ctx.fillStyle = rgba(PALETTE.bloodDim, 0.55);
  ctx.beginPath();
  ctx.ellipse(-s * 0.06, -s * 0.36, s * 0.03, s * 0.025, 0, 0, TAU);
  ctx.ellipse(s * 0.06, -s * 0.36, s * 0.03, s * 0.025, 0, 0, TAU);
  ctx.fill();
  // 头发：向上漂的丝
  ctx.strokeStyle = rgba(look.tone, 0.45);
  ctx.lineWidth = Math.max(0.8, s * 0.02);
  ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = -0.9 + k * 0.28 + Math.sin(time * 0.8 + idx + k) * 0.15;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * s * 0.08, -s * 0.48);
    ctx.quadraticCurveTo(
      Math.sin(a) * s * 0.35,
      -s * 0.75 + Math.sin(time * 1.1 + k) * s * 0.08,
      Math.sin(a) * s * 0.5,
      -s * 0.95,
    );
    ctx.stroke();
  }
  // 溶解：边缘碎成颗粒
  if (look.dissolve > 0.2) {
    ctx.fillStyle = rgba(look.tone, 0.35 * light);
    for (let p = 0; p < 14; p++) {
      const px = (hash2(idx * 13 + p, 2) - 0.5) * s * 0.8;
      const py = (hash2(idx * 13 + p, 8) - 0.2) * s * 1.1;
      ctx.globalAlpha = 0.15 + hash2(p, idx) * 0.3;
      ctx.fillRect(px, py, s * 0.03, s * 0.05);
    }
  }
  ctx.restore();
}

/** 钩灯：先看见那盏灯，灯后面是「没有回波的地方」 */
function drawColossus(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const sway = Math.sin(time * look.tempo * TAU) * w * 0.03;
  const bodyW = w * look.scale * 0.85 * zoom;
  const bodyH = h * look.scale * 0.95 * zoom;

  // 身体是一块比水更黑的东西。它吞光。
  const g = ctx.createRadialGradient(cx + sway, cy, h * 0.05, cx + sway, cy, bodyW * 0.55);
  g.addColorStop(0, 'rgba(4,6,10,0.95)');
  g.addColorStop(0.45, rgba(look.tone, 0.55));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx + sway, cy + h * 0.05, bodyW * 0.5, bodyH * 0.42, -0.2, 0, TAU);
  ctx.fill();

  // 触须从身体边缘垂下来
  ctx.strokeStyle = rgba(look.tone, 0.4 + light * 0.2);
  ctx.lineWidth = Math.max(1.5, h * 0.007);
  ctx.lineCap = 'round';
  for (let i = 0; i < look.limbs; i++) {
    const u = (i + 0.5) / look.limbs;
    const x0 = cx + sway + (u - 0.5) * bodyW * 0.7;
    const y0 = cy + bodyH * 0.12;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    const amp = Math.sin(time * 0.7 + i * 1.3) * h * 0.08;
    ctx.bezierCurveTo(x0 + amp, y0 + h * 0.18, x0 - amp * 0.6, y0 + h * 0.32, x0 + amp * 0.3, y0 + h * 0.48);
    ctx.stroke();
  }

  // 那盏灯。它在身体前方，稍微独立。
  const lx = cx + sway * 0.4 - bodyW * 0.08;
  const ly = cy - bodyH * 0.18 + Math.sin(time * 2.1) * h * 0.012;
  drawLure(ctx, lx, ly, h * 0.045, time);
}

function drawLure(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number): void {
  const pulse = 0.65 + Math.sin(time * 5.5) * 0.35;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
  g.addColorStop(0, `rgba(255,230,180,${0.95 * pulse})`);
  g.addColorStop(0.12, `rgba(224,138,73,${0.7 * pulse})`);
  g.addColorStop(0.4, `rgba(196,99,42,${0.18 * pulse})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 7, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,244,210,${0.9 * pulse})`;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawLureOnly(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: CreatureLook,
  time: number,
  aim: number,
): void {
  ctx.save();
  ctx.globalAlpha = clamp01(aim);
  const x = w * (0.46 + Math.sin(time * look.tempo) * 0.04);
  const y = h * (0.42 + Math.cos(time * look.tempo * 0.7) * 0.03);
  drawLure(ctx, x, y, h * 0.03, time);
  ctx.restore();
}

/** 铁织：用船体外板做的爬行物，能认出那块编号补丁 */
function drawCrawler(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const s = h * 0.42 * look.scale * zoom;
  const crawl = (time * look.tempo) % 1;
  ctx.save();
  ctx.translate(cx, cy + Math.sin(time * 1.1) * h * 0.015);
  ctx.rotate(-0.15 + crawl * 0.05);

  // 主体甲板
  const g = ctx.createLinearGradient(-s, -s * 0.3, s, s * 0.4);
  g.addColorStop(0, shadeHex(look.tone, 0.55));
  g.addColorStop(0.4, shadeHex(look.tone, 1.05));
  g.addColorStop(1, '#1a100c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.15);
  ctx.lineTo(s * 0.55, -s * 0.25);
  ctx.lineTo(s * 0.75, s * 0.1);
  ctx.lineTo(-s * 0.5, s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.35 * light);
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();

  // 铆钉行
  ctx.fillStyle = rgba(PALETTE.steelLit, 0.55);
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    ctx.beginPath();
    ctx.arc(lerp(-s * 0.55, s * 0.5, u), -s * 0.08, s * 0.025, 0, TAU);
    ctx.fill();
  }

  // 编号 44 的补丁
  ctx.fillStyle = rgba(PALETTE.rust, 0.55);
  ctx.fillRect(s * 0.05, -s * 0.18, s * 0.22, s * 0.16);
  ctx.fillStyle = rgba(PALETTE.ember, 0.7);
  ctx.font = `${(s * 0.11).toFixed(1)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('44', s * 0.16, -s * 0.10);

  // 肢：节肢，交替蹬
  ctx.strokeStyle = shadeHex(look.tone, 1.2);
  ctx.lineWidth = Math.max(1.6, s * 0.04);
  ctx.lineCap = 'round';
  for (let i = 0; i < look.limbs; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const u = Math.floor(i / 2) / 4;
    const phase = Math.sin(time * 6 + i * 0.9);
    const x0 = lerp(-s * 0.4, s * 0.45, u);
    const y0 = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + side * s * 0.18, y0 + s * 0.22 + phase * s * 0.06);
    ctx.lineTo(x0 + side * s * 0.38, y0 + s * 0.48 + phase * s * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

/** 水母 / 管水母：伞盖和丝，不是人 */
function drawBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const n = Math.max(3, look.limbs);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const px = cx + (u - 0.5) * w * 0.7 * look.scale * zoom;
    const py = cy + Math.sin(time * look.tempo * TAU + i * 0.8) * h * 0.04;
    const s = h * 0.08 * look.scale * (0.7 + hash2(i, 3) * 0.5) * zoom;
    const pulse = 0.85 + Math.sin(time * look.tempo * TAU + i) * 0.15;
    const g = ctx.createRadialGradient(px, py - s * 0.2, 0, px, py, s * 1.4);
    g.addColorStop(0, rgba(PALETTE.ember, 0.35 * light * pulse));
    g.addColorStop(0.45, rgba(look.tone, 0.4 * light));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, s * 0.9 * pulse, s * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(look.tone, 0.35 * light);
    ctx.lineWidth = Math.max(0.8, h * 0.002);
    for (let k = 0; k < 5; k++) {
      const a = -0.6 + k * 0.3;
      ctx.beginPath();
      ctx.moveTo(px, py + s * 0.2);
      ctx.quadraticCurveTo(
        px + Math.sin(a + time) * s * 0.4,
        py + s * 1.1,
        px + Math.sin(a) * s * 0.6,
        py + s * 2.1 + Math.sin(time * 0.7 + k) * s * 0.2,
      );
      ctx.stroke();
    }
  }
}

/** 鱼群或锈螨：碎点，体型故意画得很小 */
function drawSchool(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const n = Math.max(8, look.limbs);
  ctx.fillStyle = rgba(look.tone, 0.55 + light * 0.35);
  for (let i = 0; i < n; i++) {
    const seed = hash2(i, 9);
    const orbit = time * look.tempo * TAU + seed * TAU;
    const px = cx + Math.cos(orbit) * w * 0.22 * look.scale * zoom + (seed - 0.5) * w * 0.2;
    const py = cy + Math.sin(orbit * 1.3) * h * 0.14 * look.scale * zoom + (hash2(i, 2) - 0.5) * h * 0.18;
    const s = Math.max(1.2, h * 0.012 * look.scale * zoom * (0.6 + seed));
    ctx.globalAlpha = 0.4 + seed * 0.5;
    ctx.beginPath();
    ctx.ellipse(px, py, s * 1.6, s * 0.6, orbit, 0, TAU);
    ctx.fill();
    if (look.lights > 0 && i % 3 === 0) {
      ctx.fillStyle = rgba(PALETTE.ember, 0.7);
      ctx.beginPath();
      ctx.arc(px + s, py, s * 0.35, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(look.tone, 0.55 + light * 0.35);
    }
  }
  ctx.globalAlpha = 1;
}

/** 针口：几乎看不见的一根刺，贴在画面边缘 */
function drawNeedle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  look: CreatureLook,
  time: number,
  light: number,
  zoom: number,
): void {
  const x = cx + w * 0.18 * look.scale * zoom;
  const y = cy + Math.sin(time * look.tempo * TAU) * h * 0.01;
  const s = h * 0.16 * look.scale * zoom;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);
  ctx.strokeStyle = rgba(look.tone, 0.75 + light * 0.2);
  ctx.lineWidth = Math.max(1, h * 0.004);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(0, s * 0.4);
  ctx.stroke();
  ctx.fillStyle = rgba(PALETTE.bloodDim, 0.7);
  ctx.beginPath();
  ctx.arc(0, -s, s * 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 空回声：水里什么都没有。镜头在那个方位会自己对不上焦。 */
function drawAbsent(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  look: CreatureLook,
  time: number,
  aim: number,
  corruption: number,
): void {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = h * 0.22 * (0.8 + aim * 0.5);
  ctx.save();
  // 颗粒避开一块圆形区域，形成「洞」
  ctx.globalCompositeOperation = 'destination-out';
  const hole = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  hole.addColorStop(0, `rgba(0,0,0,${0.55 * aim})`);
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 一圈对不上焦的环
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.boneWhisper, 0.12 + aim * 0.2);
  ctx.lineWidth = Math.max(1, h * 0.006);
  ctx.beginPath();
  ctx.arc(cx, cy, r * (0.9 + Math.sin(time * 1.4) * 0.05), 0, TAU);
  ctx.stroke();
  ctx.restore();

  if (corruption > 0.5 && aim > 0.6) {
    // 污染高的时候，空洞里会闪一帧很像你自己的轮廓
    const flash = Math.sin(time * 0.7) > 0.92;
    if (flash) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = rgba(look.tone, 0.8);
      ctx.beginPath();
      ctx.ellipse(cx, cy - h * 0.04, h * 0.05, h * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawVideoNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  corruption: number,
  dark: number,
): void {
  const n = Math.round(40 + dark * 80 + corruption * 60);
  ctx.save();
  ctx.globalAlpha = 0.08 + dark * 0.12 + corruption * 0.1;
  for (let i = 0; i < n; i++) {
    const x = hash2(i, Math.floor(time * 18)) * w;
    const y = hash2(i + 3, Math.floor(time * 18) + 1) * h;
    ctx.fillStyle = hash2(i, 4) > 0.5 ? 'rgba(255,230,200,0.9)' : 'rgba(0,0,0,0.9)';
    ctx.fillRect(x, y, 1 + hash2(i, 8) * 2, 1 + hash2(i, 9) * 3);
  }
  ctx.restore();
}

function drawViewfinder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  run: PodRun,
  time: number,
  aim: number,
): void {
  ctx.save();
  const pad = h * 0.04;
  // 四角括号
  ctx.strokeStyle = rgba(PALETTE.ember, 0.55);
  ctx.lineWidth = Math.max(1.2, h * 0.005);
  const arm = h * 0.06;
  const corners: [number, number, number, number][] = [
    [pad, pad, 1, 1],
    [w - pad, pad, -1, 1],
    [pad, h - pad, 1, -1],
    [w - pad, h - pad, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * arm);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * arm, y);
    ctx.stroke();
  }

  // 左上角那盏灯。它现在报的是摄影机的相位，因为这块屏有三种可能的片源，
  // 而玩家必须一眼分清「这是实时的雪花」还是「这是刚冲出来的片子」——
  // 把后者当成前者会让人以为外面真的有东西正在动。
  const s = run.shot;
  const mark =
    s.phase === 'exposing' ? { dot: PALETTE.bloodHot, text: 'REC  CAM-A', blink: 8 }
    : s.phase === 'developing' ? { dot: PALETTE.rustHot, text: 'DEV  CAM-A', blink: 2.4 }
    : s.phase === 'ready' && s.viewing ? { dot: PALETTE.ember, text: 'PLAY  REEL-A', blink: 0 }
    : { dot: PALETTE.boneWhisper, text: 'MON  CAM-A', blink: 0 };

  ctx.fillStyle = rgba(mark.dot, mark.blink ? 0.4 + Math.sin(time * mark.blink) * 0.45 : 0.8);
  ctx.beginPath();
  if (mark.text.startsWith('PLAY')) {
    // 放片子的时候是一个三角，不是圆点。形状比颜色好认。
    const cx = pad + h * 0.026;
    const cy = pad + h * 0.07;
    ctx.moveTo(cx - h * 0.010, cy - h * 0.013);
    ctx.lineTo(cx + h * 0.014, cy);
    ctx.lineTo(cx - h * 0.010, cy + h * 0.013);
    ctx.closePath();
  } else {
    ctx.arc(pad + h * 0.03, pad + h * 0.07, h * 0.012, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = rgba(PALETTE.bone, 0.7);
  ctx.font = `${(h * 0.032).toFixed(1)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(mark.text, pad + h * 0.055, pad + h * 0.07);

  // 时间码
  const t = Math.floor(run.clock);
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:${String(Math.floor((run.clock % 1) * 24)).padStart(2, '0')}`;
  ctx.textAlign = 'right';
  ctx.fillText(tc, w - pad, pad + h * 0.07);

  // 方位刻度
  const mid = w / 2;
  ctx.strokeStyle = rgba(PALETTE.ember, 0.4);
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.12);
  ctx.lineTo(w * 0.82, h * 0.12);
  ctx.stroke();
  const deg = ((run.camPan * 180) / Math.PI + 360) % 360;
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(PALETTE.ember, 0.8);
  ctx.fillText(`${deg.toFixed(0).padStart(3, '0')}°`, mid, h * 0.09);

  // 曝光进度条。九秒里玩家必须留在这台机子前面，所以这条必须画在屏上 ——
  // 画在按钮上没用，玩家盯的是画面。
  if (s.phase === 'exposing') {
    const p = 1 - s.exposeLeft / Math.max(0.001, s.exposeMax);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w * 0.18, h * 0.93, w * 0.64, h * 0.018);
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.85);
    ctx.fillRect(w * 0.18, h * 0.93, w * 0.64 * p, h * 0.018);
    ctx.fillStyle = rgba(PALETTE.bone, 0.9);
    ctx.font = `${(h * 0.03).toFixed(1)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`曝光 ${s.exposeLeft.toFixed(1)}s  ·  别离开机位`, mid, h * 0.90);
  }

  // 对准框：瞄到东西时收紧、变红
  if (run.threat && aim > 0.2) {
    const locked = aim > 0.55 && run.cameraCanSee();
    const size = h * (0.28 - aim * 0.08);
    ctx.strokeStyle = rgba(locked ? PALETTE.bloodHot : PALETTE.ember, 0.45 + aim * 0.4);
    ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.strokeRect(mid - size * 0.55, h * 0.5 - size * 0.4, size * 1.1, size * 0.8);
    if (locked) {
      ctx.fillStyle = rgba(PALETTE.bloodHot, 0.7);
      ctx.font = `${(h * 0.028).toFixed(1)}px "JetBrains Mono", monospace`;
      ctx.fillText(run.threat.known ? run.threat.creature.name : 'CONTACT', mid, h * 0.5 + size * 0.52);
    }
  }

  // 没打灯时的提示。放片子的时候不报 —— 那卷片子是打着灯拍的，
  // 现在灯关着不影响它已经拍到的东西。
  if (!run.lamp && run.flareLeft <= 0 && run.threat && !(s.phase === 'ready' && s.viewing)) {
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.45 + Math.sin(time * 3) * 0.15);
    ctx.font = `${(h * 0.03).toFixed(1)}px "PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('无照明 · 画面不可用', mid, h * 0.88);
  }
  ctx.restore();
}
