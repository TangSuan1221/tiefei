/**
 * 五个工位的近景。
 * ============================================================================
 * 坐下之后，那台设备占满你的视野。按钮是物理的（chrome.ts），屏是 CRT。
 * 每个工位只做一件事 —— 这是舱内空间存在的理由：你不能同时看雷达和开灯。
 */

import { clamp01 } from '@/core/util';
import { PALETTE, rgba } from '@/render/palette';
import { SonarScope } from '@/render/sonar';
import {drawSonarSweep} from './sonar-sweep';
import {sonarEchoAlpha} from '../sim/navigation-sonar';
import { cjk, layoutCJK, mono, tracked } from '@/ui/typography';
import { STATIONS, canonicalStation, stationRef, type StationId } from '../types';
import { drawLocker, lockerControls, performLockerControl } from './locker';
import { SUPPLIES, supplyBulk, type SupplyId } from '../content/supplies';
import { sealReadout } from '../content/containers';
import {
  ARM,
  ARM_PHASE_CN,
  armAlive,
  armOut,
  armPose,
  armGrabbed,
  wrenchChance,
} from '../sim/manipulator';
import { PodRun, TAPE_PURPOSE_CN, type CameraDriveAction } from '../sim/run';
import { drawCameraFeed } from './creature';
import { drawLabRecording } from './footage';
import { isNoVideoMode, revealPrompt } from './gm';
import { drawHoloMap } from './wire';
import {
  HitMap,
  drawBar,
  drawControls,
  drawCRT,
  drawFuseRing,
  drawGauge,
  drawLamp,
  drawLever,
  drawNameplate,
  drawPanel,
  screenTitle,
  type Control,
} from './chrome';

export interface StationView {
  sonar: SonarScope;
  hovered: string | null;
  time: number;
}

const TAU = Math.PI * 2;
const evidenceReadouts=new WeakMap<PodRun,{time:number;lines:string[]}>();
const localPlaybackStates=new WeakMap<PodRun,{id:string;time:number;last:number;paused:boolean}>();
function localPlaybackFor(run:PodRun){
  const id=run.selectedTape?.id??'';
  let state=localPlaybackStates.get(run);
  if(!state||state.id!==id){state={id,time:0,last:run.clock,paused:false};localPlaybackStates.set(run,state);}
  if(!state.paused)state.time+=Math.min(.25,Math.max(0,run.clock-state.last));
  state.last=run.clock;return state;
}

/** Transitional read-only contract: runtime owns objective and evidence semantics. */
export function stationObjective(run: PodRun): string {
  const site = run.authoredSite as (NonNullable<PodRun['authoredSite']> & { objective?: string }) | null;
  return site?.objective?.trim() || (site ? '接驳港调查 · 核对救生舱、撤离记录与下行通道' : run.openingGuide || run.campaign.objective);
}

function drawObjective(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  if(run.authoredSite?.diegeticGuidance)return;
  ctx.save();ctx.textAlign='left';ctx.fillStyle='#cbbb98';ctx.font=cjk(h*.023,500);
  const lines=layoutCJK(ctx, `调查任务 · ${stationObjective(run)}`, w*.86);
  lines.slice(0,2).forEach((line,i)=>ctx.fillText(line,w*.07,h*(.90+i*.035)));
  ctx.restore();
}

function drawVerifiedRecording(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): string {
  const tape=run.selectedTape;
  if(tape?.testDescription){ctx.save();ctx.fillStyle='#071113';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d9d4bf';ctx.textAlign='left';ctx.font=cjk(Math.max(12,h*.085),500);const text=tape.ready===false?'曝光已回收，正在显影……':tape.testDescription;layoutCJK(ctx,text,w*.88).forEach((line,i)=>ctx.fillText(line,w*.06,h*.14+i*h*.12));ctx.restore();return '无视频测试 · 曝光快照描述';}
  // Local exposure footage is independent of remote generation. The player owns
  // its loading/playback status and source label; never relabel it as a still.
  if ((tape?.sensorFrames?.length ?? 0) >= 3) return drawLabRecording(ctx,run,w,h,localPlaybackFor(run));
  const evidence=(tape as (typeof tape & {siteEvidence?: unknown}))?.siteEvidence;
  const unavailable=tape?.videoResult==='prompt' ? '提示词测试 · 未请求视频'
    : tape?.videoResult==='failed' ? '视频生成失败 · 无可播放视频' : '';
  if(unavailable){
    ctx.save();ctx.fillStyle='#04080b';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#c9b99b';ctx.textAlign='left';ctx.font=cjk(Math.max(12,h*.065),500);
    ctx.fillText(unavailable,w*.05,h*.45,w*.9);
    ctx.fillText(evidence?'确定性现场底片另行核验 · 非生成视频':'请查阅任务日志后重新曝光',w*.05,h*.60,w*.9);
    ctx.restore();return unavailable;
  }
  const status=drawLabRecording(ctx,run,w,h);
  return evidence && tape?.videoResult!=='video' ? '确定性现场底片 · 非生成视频' : status;
}

export function drawStationView(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  id: StationId,
  x: number,
  y: number,
  w: number,
  h: number,
  hits: HitMap,
  view: StationView,
): void {
  // 过道绘制会 clip/translate。分析后坐上领航台时，若那次 restore 没弹干净，
  // 近景会被画到屏幕外或 alpha 变成 0 —— 人已经坐下，屏上却还是过道。
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  try {
    drawStationViewInner(ctx, run, id, x, y, w, h, hits, view);
  } finally {
    ctx.restore();
  }
}

function drawStationViewInner(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  id: StationId,
  x: number,
  y: number,
  w: number,
  h: number,
  hits: HitMap,
  view: StationView,
): void {
  id = canonicalStation(id);
  const refH = h;
  drawPanel(ctx, x, y, w, h, refH);

  const pad = refH * 0.028;
  drawNameplate(ctx, x + pad, y + pad, w * 0.42, refH * 0.046, STATIONS[id].code, STATIONS[id].name);

  // 离开
  const bx = x + w - pad - refH * 0.16;
  const by = y + pad;
  const bw = refH * 0.16;
  const bh = refH * 0.046;
  hits.add({ id: 'back', x: bx, y: by, w: bw, h: bh });
  const backHot = view.hovered === 'back';
  ctx.fillStyle = backHot ? '#2a180e' : '#14191f';
  roundish(ctx, bx, by, bw, bh, bh * 0.18);
  ctx.fill();
  ctx.fillStyle = rgba(PALETTE.boneDim, backHot ? 0.95 : 0.7);
  ctx.font = mono(bh * 0.42, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ESC 离开', bx + bw / 2, by + bh / 2);

  if (id === 'camera') {
    drawCameraWorkbench(ctx, run, x + pad, y + pad + refH * 0.062, w - pad * 2, refH, hits, view);
    if (run.mode === 'alert' && run.threat) {
      drawFuseRing(ctx, x + w - pad - refH * 0.20, y + pad + refH * 0.023, refH * 0.021, run.threat.fuse / run.threat.fuseMax, view.time);
    }
    return;
  }

  const screenY = y + pad + refH * 0.062;
  const instrument=id==='nav'?run.authoredSite?.navigationConsole:undefined;
  const screenH = h * (instrument?(instrument.editing?.30:.57):.70);
  const ctrlY = instrument?screenY+screenH+pad:y + h - pad - refH * 0.11;
  const ctrlH = refH * 0.10;
  const screenX = x + pad;
  const screenW = w - pad * 2;

  const gain = run.powered || id === 'life' ? clamp01(run.blackout && id !== 'life' ? 0.04 : 0.15 + run.power * 0.9) : 0;
  const noise = run.corruption * 0.45 + (run.mode === 'alert' ? 0.12 : 0.04);

  drawCRT(ctx, screenX, screenY, screenW, screenH, view.time, { gain, noise, warp: run.corruption * 0.4 }, (c) => {
    c.save();
    // content 的坐标系已经被 translate 到屏左上
    drawStationScreen(c, run, id, screenW, screenH, view);
    c.restore();
  });

  const controls = stationControls(run, id);
  if(instrument){const columns=instrument.editing?4:3;for(let i=0;i<controls.length;i+=columns)drawControls(ctx,hits,x+pad,ctrlY+Math.floor(i/columns)*h*.115,w-pad*2,h*.102,controls.slice(i,i+columns),view.hovered,view.time);}
  else drawControls(ctx, hits, x + pad, ctrlY, w - pad * 2, ctrlH, controls, view.hovered, view.time);

  if (run.mode === 'alert' && run.threat) {
    drawFuseRing(ctx, x + w - pad - refH * 0.05, y + pad + refH * 0.09, refH * 0.028, run.threat.fuse / run.threat.fuseMax, view.time);
  }
}

export function drawStationScreen(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  id: StationId,
  w: number,
  h: number,
  view: StationView,
): void {
  switch (id) {
    case 'life':
      return drawLife(ctx, run, w, h, view.time);
    case 'salvage':
      return drawCamera(ctx, run, w, h, view);
    case 'radio':
      return drawRadio(ctx, run, w, h);
    case 'camera':
      return drawCamera(ctx, run, w, h, view);
    case 'lab':
      return drawLab(ctx, run, w, h);
    case 'nav':
      return drawNav(ctx, run, w, h, view);
  }
}

// ============================================================================
// 生命维持
// ============================================================================

function drawLife(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number, time: number): void {
  const v = run.vitals.vitals;
  screenTitle(ctx, w * 0.06, h * 0.08, w * 0.88, 'LS-1  LIFE SUPPORT', h);
  const gauges: [number, string, number][] = [
    [w * 0.18, 'O2', v.oxygen / v.oxygenMax],
    [w * 0.38, 'CO2', 1 - v.co2 / 100],
    [w * 0.58, 'PWR', run.power],
    [w * 0.78, 'HULL', run.hull],
  ];
  for (const [cx, label, val] of gauges) {
    drawGauge(ctx, cx, h * 0.38, h * 0.16, val, label, { danger: 0.22, time });
  }
  drawBar(ctx, w * 0.08, h * 0.64, w * 0.84, h * 0.045, run.flood, PALETTE.blood, 'BILGE', h);
  drawBar(ctx, w * 0.08, h * 0.76, w * 0.84, h * 0.045, run.scrubber, PALETTE.ember, 'SCRUBBER', h);

  ctx.fillStyle = rgba(run.blackout ? PALETTE.bloodHot : PALETTE.boneDim, 0.8);
  ctx.font = mono(h * 0.035, 500);
  ctx.textAlign = 'left';
  ctx.fillText(run.blackout ? 'BUS  OFF' : 'BUS  ON', w * 0.08, h * 0.92);
  ctx.fillText(`LEAK  ${(run.leak * 1000).toFixed(1)}`, w * 0.34, h * 0.92);
  ctx.fillText(`SAN  ${v.san.toFixed(0)}`, w * 0.58, h * 0.92);
  // 加热器和总闸是同一块电池上的东西。拉闸装死，代价就写在这个数字上。
  ctx.fillStyle = rgba(run.cabinTemp < 10 ? PALETTE.bloodHot : PALETTE.boneDim, 0.85);
  ctx.fillText(`舱温 ${run.cabinTemp.toFixed(0)}°C`, w * 0.78, h * 0.92);
}

// ============================================================================
// 打捞
// ============================================================================

function drawSalvage(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  screenTitle(ctx, w * 0.06, h * 0.08, w * 0.88, 'SLV  MANIPULATOR', h);
  const wreck = run.siteWreck();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (wreck) {
    const used = run.salvaged.get(wreck.id) ?? 0;
    ctx.fillStyle = rgba(PALETTE.bone, 0.88);
    ctx.font = cjk(h * 0.048, 500);
    ctx.fillText(wreck.name, w * 0.06, h * 0.20);

    ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
    ctx.font = cjk(h * 0.036, 400);
    paragraphLines(ctx, wreck.desc, w * 0.06, h * 0.28, w * 0.50, h * 0.05, 3);

    ctx.font = mono(h * 0.034, 600);
    ctx.fillStyle = rgba(PALETTE.ember, 0.95);
    ctx.fillText(
      `够得着  ·  第 ${used + 1}/${wreck.attempts} 爪  ·  ${wreck.cost}口气`,
      w * 0.06,
      h * 0.60,
    );

    // 噪音是这个台子唯一的赌注：伸出去就等于喊一嗓子
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.85);
    ctx.font = cjk(h * 0.03, 500);
    ctx.fillText(`机械臂噪音 ${wreck.noise.toFixed(2)} —— 这块废墟上的东西会听见。`, w * 0.06, h * 0.665);
    drawBar(ctx, w * 0.06, h * 0.69, w * 0.5, h * 0.022, wreck.noise, PALETTE.blood, '', h);
  } else if (run.phase === 'transit') {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.8);
    ctx.font = cjk(h * 0.042, 500);
    ctx.fillText('机械臂够到的只有流过去的水。', w * 0.06, h * 0.26);
    ctx.font = cjk(h * 0.032, 400);
    ctx.fillText(`还在航渡途中 —— 目标 ${run.leg.siteName}，还有 ${run.remaining.toFixed(0)} 米。`, w * 0.06, h * 0.34);
    ctx.fillText(`开船在${stationRef('nav')}。`, w * 0.06, h * 0.40);
  } else {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.8);
    ctx.font = cjk(h * 0.042, 500);
    ctx.fillText('这个站点已经被你掏空了。', w * 0.06, h * 0.26);
    ctx.font = cjk(h * 0.032, 400);
    ctx.fillText(`去${stationRef('nav')}。对准开口，推过去。`, w * 0.06, h * 0.34);
  }

  drawArmPanel(ctx, run, w, h);

  screenTitle(ctx, w * 0.06, h * 0.68, w * 0.88, 'LOCKER', h);
  drawBenchPanel(ctx, run, w, h);
  ctx.font = cjk(h * 0.032, 400);
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
  let x = w * 0.06;
  let n = 0;
  for (const [id, def] of Object.entries(SUPPLIES)) {
    const c = run.count(id as SupplyId);
    if (c <= 0) continue;
    ctx.fillText(`${def.code} ${def.name} ×${c}`, x, h * 0.78 + (n % 2) * h * 0.08);
    if (n % 2 === 1) x += w * 0.46;
    n++;
  }
  if (n === 0) ctx.fillText('储物格是空的。', w * 0.06, h * 0.78);
}

/**
 * 打捞台右栏的机械手状态。
 *
 * 这张台子叫「机械臂」，所以它必须知道那条臂现在在哪一相 ——
 * 玩家在这里换胶带的时候，如果臂还伸在外面，这一栏是他唯一的提醒。
 */
function drawArmPanel(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  const arm = run.arm;
  const x = w * 0.60;
  const bw = w * 0.34;
  screenTitle(ctx, x, h * 0.16, bw, 'ARM  STATE', h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const busy = armOut(arm);
  ctx.fillStyle = rgba(busy || !armAlive(arm) ? PALETTE.bloodHot : PALETTE.boneDim, 0.9);
  ctx.font = cjk(h * 0.040, 600);
  ctx.fillText(ARM_PHASE_CN[arm.phase], x, h * 0.245);

  ctx.font = cjk(h * 0.028, 400);
  // 弃掉之后这一栏是一块墓碑。它不写「不可用」，它写那条臂在哪
  if (!armAlive(arm)) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.85);
    const gone = layoutCJK(
      ctx,
      '液压接头的盖板上是一个还在渗油的孔。那条臂留在某个站点的地板上，' +
        '上面缠着你自己缠的七圈胶带。',
      bw,
    );
    for (let i = 0; i < Math.min(4, gone.length); i++) {
      ctx.fillText(gone[i]!, x, h * (0.30 + i * 0.042));
    }
    return;
  }
  if (!busy) {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.78);
    const lines = layoutCJK(
      ctx,
      `翻箱要看着屏。操纵杆在${stationRef('camera')}，开探照灯才瞄得上。`,
      bw,
    );
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      ctx.fillText(lines[i]!, x, h * (0.30 + i * 0.045));
    }
    return;
  }

  drawBar(ctx, x, h * 0.275, bw, h * 0.02, arm.out, PALETTE.rust, '', h);
  drawBar(ctx, x, h * 0.315, bw, h * 0.016, clamp01(arm.pump / ARM.strainSec), PALETTE.blood, '', h);
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.82);
  ctx.font = mono(h * 0.026, 500);
  ctx.fillText(`OUT ${(arm.out * 100).toFixed(0)}%   PUMP ${arm.pump.toFixed(0)}s`, x, h * 0.365);
  ctx.fillText(`爪 ${arm.passes}/${ARM.maxPasses}`, x, h * 0.40);

  ctx.fillStyle = rgba(PALETTE.bloodHot, 0.88);
  ctx.font = cjk(h * 0.028, 500);
  const warn = layoutCJK(
    ctx,
    armGrabbed(arm)
      ? `有东西攥着爪，还剩 ${arm.grabLeft.toFixed(1)}s。归零就没有这条臂了 ——` +
        `拽（G，${(wrenchChance(arm) * 100).toFixed(0)}%，失败会让它攥得更紧），或者断接头（X）。`
      : arm.phase === 'jammed' && arm.jamLeft > 0
        ? `爪齿卡住。钢会在 ${arm.jamLeft.toFixed(1)}s 之后自己回弹 —— 等，或者拽（G，${(wrenchChance(arm) * 100).toFixed(0)}%）。`
      : arm.phase === 'jammed'
        ? `爪子咬死。拽（G，成功率 ${(wrenchChance(arm) * 100).toFixed(0)}%），或者断接头（X）。`
      : arm.limp
        ? '失压。它挂在外面，泵咬不住它。'
        : run.mode === 'alert'
          ? '警报在响，而它还伸在外面。按 C 收。'
          : '泵在响。外面每一秒都在多知道一点。',
    bw,
  );
  for (let i = 0; i < Math.min(3, warn.length); i++) {
    ctx.fillText(warn[i]!, x, h * (0.45 + i * 0.04));
  }
  if (arm.purgeLeft > 0) {
    ctx.fillStyle = rgba(PALETTE.blood, 0.95);
    ctx.font = mono(h * 0.030, 700);
    ctx.fillText(`保险盖已掀开 ${arm.purgeLeft.toFixed(1)}s`, x, h * 0.585);
  }
  if (arm.lastLine) {
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.75);
    ctx.font = cjk(h * 0.026, 400);
    const last = layoutCJK(ctx, `上一爪：${arm.lastLine}`, bw);
    ctx.fillText(last[0] ?? '', x, h * 0.545);
  }
}

/**
 * 台面 + 格子占用。
 *
 * 储物格是有数的，所以这个数必须一直看得见 —— 玩家要在伸手之前就知道
 * 「捞上来还放得下吗」。台面上摊着东西的时候这一栏变成血色的取舍提示。
 */
function drawBenchPanel(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  const x = w * 0.06;
  const used = run.bulkUsed;
  const full = run.bulkFree <= 0;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = mono(h * 0.026, 600);
  ctx.fillStyle = rgba(full ? PALETTE.bloodHot : PALETTE.boneDim, 0.88);
  ctx.fillText(`${used}/${PodRun.BULK_CAP} 格`, w * 0.60, h * 0.705);
  drawBar(ctx, w * 0.72, h * 0.69, w * 0.22, h * 0.016, used / PodRun.BULK_CAP, full ? PALETTE.blood : PALETTE.rust, '', h);

  if (!run.bench.length) return;
  const slot = run.bench[0]!;
  const overLap = run.benchBulk > PodRun.LAP_BULK;
  ctx.fillStyle = rgba(PALETTE.bloodHot, 0.92);
  ctx.font = cjk(h * 0.030, 600);
  ctx.fillText(
    `台面上：${SUPPLIES[slot.id].name}×${slot.n}　` +
      (run.bulkFree >= supplyBulk(slot.id)
        ? 'Z 收进格子。'
        : `它要 ${supplyBulk(slot.id)} 格：扔掉格子里的一件（6–0），或者倒出泄压口（V）。`),
    x,
    h * 0.735,
  );
  ctx.font = cjk(h * 0.024, 500);
  ctx.fillStyle = rgba(overLap ? PALETTE.bloodHot : PALETTE.boneDim, 0.8);
  ctx.fillText(
    overLap
      ? `起步时膝盖上只压得下 ${PodRun.LAP_BULK} 格（${run.benchBulk} 格摊在这里）。多出来的会滚进舱底。`
      : `这 ${run.benchBulk} 格能压在膝盖上带走 —— 但一整段航程都得那么坐着。`,
    x,
    h * 0.765,
  );
}

// ============================================================================
// 无线电
// ============================================================================

function drawRadio(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  screenTitle(ctx, w * 0.06, h * 0.08, w * 0.55, 'VHF  121.5', h);
  ctx.fillStyle = rgba(run.radioWaiting ? PALETTE.bloodHot : PALETTE.boneWhisper, 0.85);
  ctx.font = mono(h * 0.028, 600);
  ctx.textAlign = 'right';
  ctx.fillText(run.radioWaiting ? 'CARRIER' : 'STANDBY', w * 0.94, h * 0.078);
  if (run.earsPlugged) {
    ctx.fillStyle = rgba(PALETTE.ember, 0.7);
    ctx.textAlign = 'left';
    ctx.fillText('耳塞在。你听不见它，它也听不见你。', w * 0.06, h * 0.16);
  }

  // Full narrative text belongs to the radio, not the camera window.
  if (run.storyCaptionLeft > 0 && run.storyCaption) {
    ctx.save();ctx.textAlign='left';ctx.fillStyle='#ddd3bd';ctx.font=cjk(h*.028,400);
    layoutCJK(ctx,run.storyCaption,w*.86).slice(0,4).forEach((line,i)=>ctx.fillText(line,w*.07,h*(.22+i*.06)));
    ctx.restore();drawObjective(ctx,run,w,h);return;
  }
  const lines = run.heard.slice(-3);
  let y = h * 0.20;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const m of lines) {
    const who = m.speaker === 'beacon' ? '万斯' : m.speaker === 'self' ? '？？？' : '……';
    const hex = m.speaker === 'beacon' ? PALETTE.ember : m.speaker === 'self' ? PALETTE.bloodHot : PALETTE.boneWhisper;
    ctx.fillStyle = rgba(hex, 0.9);
    ctx.font = cjk(h * 0.034, 500);
    const prefix = `【${who}】`;
    ctx.fillText(prefix, w * 0.06, y);
    ctx.fillStyle = rgba(PALETTE.bone, 0.88);
    ctx.font = cjk(h * 0.034, 400);
    const used = ctx.measureText(prefix).width;
    const wrapped = layoutCJK(ctx, m.text, w * 0.88 - used);
    ctx.fillText(wrapped[0] ?? '', w * 0.06 + used, y);
    y += h * 0.072;
    for (let i = 1; i < wrapped.length && i < 2; i++) {
      ctx.fillText(wrapped[i]!, w * 0.06, y);
      y += h * 0.062;
    }
    if (y > h * 0.70) break;
  }
  if (!lines.length) {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
    ctx.font = cjk(h * 0.036, 400);
    ctx.fillText('频道是空的。万斯还没有叫你。', w * 0.06, h * 0.36);
    ctx.fillText('指示灯亮的时候，接听。', w * 0.06, h * 0.44);
  }
  drawObjective(ctx,run,w,h);
}

// ============================================================================
// 分析台
// ============================================================================

/**
 * 读片机。摄像头负责把外面变成一卷胶片；这块台子负责把胶片变成知识。
 * 不上卷，习性不会自己长到日志里。
 */
function drawLab(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  const evidenceReport=evidenceReadouts.get(run);
  if(evidenceReport && !run.labVideoExpanded){
    screenTitle(ctx,w*.06,h*.08,w*.88,'LAB  EVIDENCE',h);
    ctx.textAlign='left';ctx.fillStyle='#cbbb98';ctx.font=cjk(h*.025,500);
    ctx.fillText(`来源：已持有实物记录 · 核验 T+${evidenceReport.time.toFixed(0)}s`,w*.06,h*.18,w*.88);
    ctx.fillStyle='#d8d5ca';ctx.font=cjk(h*.029,400);
    let row=0;
    for(const line of evidenceReport.lines){
      for(const wrapped of layoutCJK(ctx,line,w*.86)){
        if(row>=10)break;
        ctx.fillText(wrapped,w*.07,h*(.28+row++*.05));
      }
    }
    ctx.fillStyle='#a4aca9';ctx.font=cjk(h*.022,400);
    ctx.fillText('1 / 2 返回片盒 · 3 查看所选录像分析',w*.07,h*.90);
    return;
  }
  if(run.labVideoExpanded&&run.selectedTape){
    ctx.save();ctx.translate(w*.03,h*.12);
    const status=drawVerifiedRecording(ctx,run,w*.94,h*.72);
    ctx.restore();ctx.fillStyle='#accbc1';ctx.font=cjk(h*.025,500);
    ctx.fillText(`${status} · 按 4 返回分析布局`,w*.04,h*.90);return;
  }
  screenTitle(ctx, w * 0.06, h * 0.08, w * 0.88, 'LAB  FILM BENCH', h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const listX = w * 0.06;
  const listW = w * 0.34;
  const bodyX = w * 0.44;
  const bodyW = w * 0.50;

  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
  ctx.font = mono(h * 0.028, 500);
  ctx.fillText(`MAG  ${String(run.tapes.length).padStart(2, '0')}`, listX, h * 0.16);
  ctx.fillStyle = rgba(PALETTE.ember, run.unanalyzedCount ? 0.85 : 0.4);
  ctx.fillText(`UNREAD  ${run.unanalyzedCount}`, listX + listW * 0.55, h * 0.16);

  if (!run.tapes.length) {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.78);
    ctx.font = cjk(h * 0.036, 400);
    ctx.fillText('片盒是空的。', bodyX, h * 0.36);
    ctx.fillText(`先在${stationRef('camera')}拍一卷，等冲洗完。`, bodyX, h * 0.44);
    ctx.fillText('冲出来的片子会自动进盒。这里负责拆习性。', bodyX, h * 0.52);
    return;
  }

  const start = Math.max(0, run.tapeCursor - 4);
  const vis = run.tapes.slice(start, start + 8);
  vis.forEach((tape, i) => {
    const idx = start + i;
    const y = h * 0.23 + i * h * 0.075;
    const here = idx === run.tapeCursor;
    ctx.fillStyle = here ? rgba(PALETTE.rustDeep, 0.55) : 'rgba(0,0,0,0)';
    if (here) ctx.fillRect(listX - w * 0.01, y - h * 0.04, listW + w * 0.02, h * 0.07);
    ctx.fillStyle = rgba(here ? PALETTE.ember : PALETTE.boneDim, here ? 0.95 : 0.7);
    ctx.font = cjk(h * 0.028, here ? 600 : 400);
    ctx.fillText(`${tape.analyzed ? '●' : '○'} ${tape.siteName}`, listX, y);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.65);
    ctx.font = mono(h * 0.022, 500);
    ctx.fillText(TAPE_PURPOSE_CN[tape.purpose], listX, y + h * 0.028);
  });

  const tape = run.selectedTape;
  if (!tape) return;
  ctx.save();ctx.translate(bodyX,h*.30);
  ctx.fillStyle='#03080b';ctx.fillRect(0,0,bodyW,h*.34);
  const recordingStatus=drawVerifiedRecording(ctx,run,bodyW,h*.34);
  ctx.restore();
  ctx.strokeStyle='#6d9990';ctx.strokeRect(bodyX,h*.30,bodyW,h*.34);
  ctx.fillStyle='#accbc1';ctx.font=cjk(h*.023,500);ctx.fillText(recordingStatus,bodyX,h*.68);
  ctx.fillStyle = rgba(PALETTE.ember, 0.9);
  ctx.font = cjk(h * 0.036, 600);
  ctx.fillText(tape.siteName, bodyX, h * 0.22);
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
  ctx.font = cjk(h * 0.026, 400);
  ctx.fillText(
    tape.analyzed ? '读片完成。习性在下面。' : '未上卷。把这一卷送进读片机。',
    bodyX,
    h * 0.275,
  );

  const lines = tape.testDescription ? (tape.analyzed?tape.report:['3 核验本次拍摄描述']) : (tape.sensorFrames?.length ?? 0) < 3 && (tape.videoResult==='failed' || tape.videoResult==='prompt')
    ? ['未取得生成视频。不能据此判断怪物是否出现。', '现场证据与视频生成状态分开核验。']
    : tape.analyzed
    ? tape.report
    : [
        `${TAPE_PURPOSE_CN[tape.purpose]} · 第 ${run.tapeCursor + 1}/${run.tapes.length} 卷`,
        tape.fauna.length ? `画面里有 ${tape.fauna.length} 个未命名的东西。` : '这一卷看起来只有几何。',
        tape.creatureMissing ? '那个红点没进画。' : '',
        '上卷之后才会有名字、习性和驱离办法。',
      ].filter(Boolean);
  ctx.font = cjk(h * 0.026, 400);
  ctx.fillStyle = rgba(PALETTE.bone, 0.82);
  let y = h * 0.73;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) {
      y += h * 0.014;
      continue;
    }
    const head = i === 0 || (!line.endsWith('。') && line.length < 18);
    ctx.fillStyle = head ? rgba(PALETTE.ember, 0.9) : rgba(PALETTE.bone, 0.8);
    ctx.fillText(line, bodyX, y);
    y += h * 0.038;
    if (y > h * 0.94) break;
  }
}

/**
 * 领航台：声呐 PPI + 全息几何台 + 舵。
 *
 * 声呐只报回波（开口、硬回波、红点）。立体线框是旁边那块全息台的事 ——
 * 真设备不会在 PPI 上画出一张洞穴地图。
 */
function drawNav(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  view: StationView,
): void {
  if(run.authoredSite?.navigationConsole){run.authoredSite.navigationConsole.draw(ctx,w,h);return;}
  if(run.phase==='site' && run.authoredSite){
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h*.84);ctx.clip();
    run.authoredSite.drawMap(ctx,w,h*.84);ctx.restore();
    drawObjective(ctx,run,w,h);return;
  }
  const sonar = view.sonar;
  sonar.contacts = run.contacts;
  sonar.shadows = [];
  sonar.gain = run.powered ? clamp01(0.3 + run.power * 0.8) : 0;
  sonar.corruption = run.corruption;
  sonar.interference = clamp01(0.08 + run.noise * 0.5 + run.corruption * 0.35);

  const site = run.phase === 'site';
  const cx = w * 0.165;
  const cy = h * 0.50;
  const r = Math.min(w * 0.30, h * 0.82) * 0.48;
  sonar.draw(ctx, cx, cy, r, view.time);
  drawScopeCursors(ctx, run, cx, cy, r, view.time);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = cjk(h * 0.021, 600);
  ctx.fillStyle = rgba(PALETTE.phosphorMid, 0.92);
  ctx.fillText(`被动声纳 · 常开 · 仅方位${run.sweepPower===0?' · 当前':''}`,cx,h*.058);
  ctx.fillStyle=rgba(run.activeSonarEnabled?PALETTE.bloodHot:PALETTE.boneDim,.88);
  ctx.fillText(`主动声纳 · ${run.activeSonarEnabled?'已通电 · 噪声外泄':'已断电'}${run.sweepPower>0?' · 当前':''}`,cx,h*.092);
  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.65);
  ctx.font = mono(h * 0.028, 500);
  ctx.fillText('PPI  回波', cx, h * 0.96);

  drawHoloMap(ctx, run, w * 0.33, h * 0.06, w * 0.36, h * 0.90, view.time);

  const rx = w * 0.71;
  const rw = w * 0.27;
  screenTitle(ctx, rx, h * 0.08, rw, site ? 'NAV  ON STATION' : 'NAV  IN TRANSIT', h);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (site) {
    ctx.fillStyle = rgba(PALETTE.ember, 0.92);
    ctx.font = cjk(h * 0.036, 600);
    ctx.fillText(run.leg.siteName, rx, h * 0.175);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
    ctx.font = cjk(h * 0.024, 400);
    ctx.fillText(run.volumeKnown ? '声呐报点。几何是这一间的内部。' : '拍第一卷，送到分析台。', rx, h * 0.225);
  } else {
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.82);
    ctx.font = cjk(h * 0.026, 400);
    ctx.fillText(`目标 ${run.leg.siteName}`, rx, h * 0.17);
    ctx.fillStyle = rgba(PALETTE.ember, 0.92);
    ctx.font = mono(h * 0.044, 700);
    ctx.fillText(run.sweepPower===0?'距离未知':`${run.remaining.toFixed(0)} m`, rx, h * 0.23);
    drawBar(ctx, rx, h * 0.255, rw, h * 0.018, run.traveled / run.leg.length, PALETTE.ember, '', h);
  }

  drawHeadingTape(ctx, rx, h * 0.30, rw, h * 0.075, run, view.time);

  ctx.font = mono(h * 0.028, 600);
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
  ctx.fillText(`HDG ${run.heading.toFixed(0).padStart(3, '0')}`, rx, h * 0.43);
  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.85);
  ctx.fillText(`PITCH ${run.pitch >= 0 ? '+' : ''}${run.pitch.toFixed(0)}°`, rx + rw * 0.48, h * 0.43);

  drawLever(ctx, rx, h * 0.47, rw * 0.92, h * 0.13, ['停', 'I', 'II', 'III'], run.throttle);

  if (!site && !run.onCourse) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.16 + Math.sin(view.time * 4) * 0.05);
    ctx.fillRect(rx - w * 0.006, h * 0.465, rw * 0.96, h * 0.14);
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.95);
    ctx.font = cjk(h * 0.026, 700);
    ctx.fillText('偏航 · 推进会撞壁', rx, h * 0.53);
    ctx.fillStyle = rgba(PALETTE.bone, 0.78);
    ctx.font = cjk(h * 0.022, 400);
    ctx.fillText(`A / D 拧到 ${String(run.leg.safeHeading).padStart(3, '0')}`, rx, h * 0.57);
  }

  const t = run.threat;
  if (t) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.92);
    ctx.font = mono(h * 0.028, 600);
    ctx.fillText(t.known ? t.creature.name : t.creature.designation, rx, h * 0.66);
    ctx.font = cjk(h * 0.023, 400);
    ctx.fillStyle = rgba(PALETTE.bone, 0.8);
    ctx.fillText(t.behavior === 'warning' ? `舱外重撞 · 应对剩余 ${Math.ceil(t.warningLeft)} 秒`
      : t.known ? `威胁 ${t.hunter.rank} 级 · ${t.creature.advice}` : '实时镜头不可见。拍摄录像辨认异响。', rx, h * 0.705);
  }

  if (site && run.volumeKnown) {
    const here = run.volume ? run.volume.nodes.find((n) => n.id === run.volumeAt) : null;
    const y = t ? h * 0.76 : h * 0.66;
    ctx.fillStyle = rgba(PALETTE.ember, 0.9);
    ctx.font = cjk(h * 0.026, 600);
    ctx.fillText(here?.label || '气闸', rx, y);
    ctx.fillStyle = rgba(run.sighting.kind === 'door' ? PALETTE.ember : PALETTE.boneWhisper, 0.8);
    ctx.font = cjk(h * 0.022, 400);
    ctx.fillText(
      run.canDepart ? '远端气闸。5 出发。' : `准星：${run.sighting.line || '拧航向'}`,
      rx,
      y + h * 0.038,
    );
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.65);
    ctx.fillText('A/D 航向  W/S 潜深  4 推进', rx, y + h * 0.072);
  } else if (t) {
    /* 威胁文案已经写过 */
  } else if (site) {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.75);
    ctx.font = cjk(h * 0.023, 400);
    ctx.fillText('全息屏是空的。拍第一卷，送到分析台。', rx, h * 0.72);
    ctx.fillText('声呐上那团废墟还没有内部。', rx, h * 0.77);
  } else {
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.7);
    ctx.font = cjk(h * 0.023, 400);
    ctx.fillText('开口方向即航道。', rx, h * 0.72);
    ctx.fillText('路上没有红点 —— 红点在站点上。', rx, h * 0.77);
  }
}

/**
 * 航向带。
 *
 * 比罗盘圆盘省地方，而且「把亮标拖到正中」这个动作比「把指针转到某个角度」
 * 直观得多 —— 玩家不需要做减法。
 */
function drawHeadingTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  run: PodRun,
  time: number,
): void {
  const SPAN = 90; // 带子上一共看得见多少度
  const mid = x + w / 2;
  const px = (deg: number): number => {
    let d = deg - run.heading;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return mid + (d / SPAN) * w;
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);

  // 容差带：这一段宽度之内推进不会撞壁
  const tol = run.leg.tolerance;
  const l = px(run.leg.safeHeading - tol);
  const rr = px(run.leg.safeHeading + tol);
  ctx.fillStyle = rgba(PALETTE.rustDeep, 0.5);
  ctx.fillRect(Math.min(l, rr), y, Math.abs(rr - l), h);

  // 刻度
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const base = Math.round(run.heading / 10) * 10;
  for (let d = base - SPAN; d <= base + SPAN; d += 10) {
    const p = px(d);
    if (p < x - 20 || p > x + w + 20) continue;
    const major = ((d % 30) + 360) % 360 === 0 || d % 30 === 0;
    ctx.strokeStyle = rgba(PALETTE.boneWhisper, major ? 0.6 : 0.28);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p, y + h * (major ? 0.52 : 0.68));
    ctx.lineTo(p, y + h);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = rgba(PALETTE.boneDim, 0.6);
      ctx.font = mono(h * 0.26, 500);
      ctx.fillText(String(((d % 360) + 360) % 360).padStart(3, '0'), p, y + h * 0.34);
    }
  }

  // 安全航向标：雷达扫出来的那个缝
  const sp = px(run.leg.safeHeading);
  ctx.fillStyle = rgba(PALETTE.ember, 0.95);
  ctx.beginPath();
  ctx.moveTo(sp, y + h * 0.16);
  ctx.lineTo(sp + h * 0.18, y);
  ctx.lineTo(sp - h * 0.18, y);
  ctx.closePath();
  ctx.fill();

  // 指挥员报的航向。和上面那个分开时，你就得挑一个信
  if (run.leg.advisedHeading !== run.leg.safeHeading) {
    const ap = px(run.leg.advisedHeading);
    ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.55 + Math.sin(time * 3) * 0.25);
    ctx.lineWidth = Math.max(1, h * 0.05);
    ctx.setLineDash([h * 0.16, h * 0.14]);
    ctx.beginPath();
    ctx.moveTo(ap, y);
    ctx.lineTo(ap, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // 本舰索引：永远在正中
  ctx.fillStyle = rgba(PALETTE.bone, 0.95);
  ctx.beginPath();
  ctx.moveTo(mid, y + h);
  ctx.lineTo(mid + h * 0.2, y + h * 1.26);
  ctx.lineTo(mid - h * 0.2, y + h * 1.26);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ============================================================================
// 摄像头
// ============================================================================

/** 实时画面与物资侧栏并排，镜头按钮和机械臂按钮分成两排。 */
export function drawObservationWindow(ctx:CanvasRenderingContext2D,run:PodRun,hits:HitMap,view:StationView,active:boolean):void {
  ctx.fillStyle='#050c0e';ctx.fillRect(0,0,1024,720);
  ctx.save();ctx.beginPath();ctx.roundRect(18,18,988,684,60);ctx.clip();
  drawCamera(ctx,run,1024,720,view);
  const shade=ctx.createRadialGradient(512,300,170,512,330,610);
  shade.addColorStop(0,'rgba(0,8,11,0)');shade.addColorStop(1,'rgba(0,5,8,.85)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,1024,720);ctx.restore();
  ctx.strokeStyle='#7b9584';ctx.lineWidth=2;ctx.strokeRect(468,54,88,4);
  ctx.fillStyle='#b6bba0';ctx.font='18px monospace';ctx.textAlign='left';
  ctx.fillText(`CAM-01   ${run.depth.toFixed(0)} m   ${(run.pilot.speed*(run.phase==='transit'?10:1)).toFixed(2)} m/s   ${run.powered?'ONLINE':'无供电'}`,66,46);
}

function drawCameraWorkbench(
  ctx: CanvasRenderingContext2D, run: PodRun, x: number, y: number, w: number, refH: number,
  hits: HitMap, view: StationView,
): void {
  const feedW = w * 0.72;
  const gap = w * 0.014;
  const feedH = refH * 0.50;
  const gain = run.powered ? clamp01(0.15 + run.power * 0.9) : 0;
  drawCRT(ctx, x, y, feedW, feedH, view.time, {
    gain, noise: run.corruption * 0.45 + (run.mode === 'alert' ? 0.12 : 0.04), warp: run.corruption * 0.4,
  }, c => drawCamera(c, run, feedW, feedH, view));
  const controls = stationControls(run, 'camera');
  const camera = controls.filter(c => c.id.startsWith('camera.') || c.id === 'use:sup.flare');
  const arm = controls.filter(c => c.id.startsWith('arm.') || c.id === 'salvage.arm');
  const drive = controls.filter(c => c.id.startsWith('drive.'));
  const eye = run.cameraEye();
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = cjk(refH * 0.018, 600);
  ctx.fillStyle = rgba(PALETTE.ember, 0.95);
  ctx.fillText(`船头 ${run.heading.toFixed(0)}° / 俯仰 ${run.pitch.toFixed(0)}°　镜头 ${eye.yaw.toFixed(0)}° / ${eye.pitch.toFixed(0)}°　H 镜头回中`, x, y + feedH + refH * 0.018, feedW);
  ctx.fillStyle = rgba(run.driveBlock ? PALETTE.bloodHot : PALETTE.bone, 0.95);
  ctx.fillText(run.driveBlock ?? (run.phase === 'site'
    ? `航速 ${run.pilot.speed.toFixed(2)} m/s · 空格推进 / N 倒车 / Shift 制动`
    : `航渡 ${Math.abs(run.pilot.speed*10).toFixed(1)} m/s · 按住空格推进 · 剩余 ${run.remaining.toFixed(0)}m`), x, y + feedH + refH * 0.044, feedW);
  ctx.restore();
  drawControls(ctx, hits, x, y + feedH + refH * 0.070, feedW, refH * 0.090, drive, view.hovered, view.time);
  drawControls(ctx, hits, x, y + feedH + refH * 0.166, feedW, refH * 0.090, camera, view.hovered, view.time);
  drawControls(ctx, hits, x, y + feedH + refH * 0.262, feedW, refH * 0.090, arm, view.hovered, view.time);
  drawLocker(ctx, run, hits, x + feedW + gap, y, w - feedW - gap, feedH + refH * 0.352, view.hovered, view.time);
}

/**
 * 摄像头工位。
 *
 * 这块屏有两种片源，而它们的区别是这个工位的全部玩法：
 *
 *   监视回路 —— 实时，但几乎什么都看不清。它只够用来对准一个方位，
 *                所以「看清红点是什么」仍然可以用它慢慢盯出来。
 *   影片     —— 拍一卷、等冲洗，换来一段真的看得见外面的画面。
 *                贵（电、时间、警报态里的命），但它会直接告诉你那是什么。
 *
 * 状态机在 sim/run.ts 的 ShotRuntime。这里只负责把它画出来 ——
 * 而且必须画得很清楚：玩家在等一件要花九秒的事，如果屏上看不见进度，
 * 他会以为按钮没反应，然后再按一次。
 */
function drawCamera(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  view: StationView,
): void {
  const aim = run.cameraOnTarget();
  const t = run.threat;
  const reveal = t ? clamp01(t.lookedAt / 1.6) : 0;
  drawCameraFeed(ctx, w, h, { run, time: view.time, aim, reveal });
  if(run.phase==='site' && run.authoredSite){
    if(!run.shot.viewing)run.authoredSite.drawInteraction?.(ctx,w,h);
    const shot=run.shot;
    const status=shot.phase==='exposing'?`曝光中 · ${shot.exposeLeft.toFixed(1)}s`
      :shot.phase==='developing'?'冲洗中 · 可继续驾驶'
      :shot.phase==='failed'?'视频未生成 · 分析台查阅'
      :shot.phase==='ready'?'片盒有记录 · 分析台核验'
      :run.mode==='alert'?'舱外异响 · 留意声源与推进噪声':'LIVE · 实时监视';
    ctx.fillStyle='#c8d9d0';ctx.font=cjk(Math.max(12,h*.019),500);ctx.textAlign='left';
    ctx.fillText(status,w*.10,h*.92,w*.80);
    return;
  }
  // 臂画在实景之上、读数之下：它是镜头前的东西，不是屏幕上的东西
  drawArmBody(ctx, run, w, h, view.time);
  drawShotStatus(ctx, run, w, h, view.time);
  drawArmReadout(ctx, run, w, h, view.time);
  drawFieldFx(ctx, run, w, h, view.time);
}

/** Physical repeater texture only; never composited over the observation window. */
export function drawDrivingSonarInstrument(ctx:CanvasRenderingContext2D,run:PodRun,w:number,h:number,time:number){
  ctx.fillStyle='#030a0e';ctx.fillRect(0,0,w,h);
  if(run.authoredSite?.drawDrivingSonar){run.authoredSite.drawDrivingSonar(ctx,w,h,time,true);return;}
  {
    const radius=Math.min(w*.40,h*.36),cx=w*.5,cy=h*.46;
    ctx.save();ctx.fillStyle='rgba(3,10,14,.92)';ctx.beginPath();ctx.arc(cx,cy,radius+12,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#43575c';ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
    for(const contact of run.contacts){
      ctx.globalAlpha=sonarEchoAlpha(time,contact.bearing);
      ctx.strokeStyle=['anomaly','listener'].includes(contact.kind)?'#ff5367':'#edba73';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(cx,cy,Math.max(.04,contact.range)*radius,contact.bearing-Math.PI/2-contact.arc/2,contact.bearing-Math.PI/2+contact.arc/2);ctx.stroke();
    }
    ctx.globalAlpha=1;drawSonarSweep(ctx,cx,cy,radius,time);
    ctx.fillStyle='#e9f1ea';ctx.beginPath();ctx.moveTo(cx,cy-6);ctx.lineTo(cx-4,cy+4);ctx.lineTo(cx+4,cy+4);ctx.fill();
    ctx.font=cjk(Math.max(12,h*.02),500);ctx.textAlign='center';ctx.fillText('航渡声呐 · 艇首向上',cx,cy+radius+30);
    ctx.restore();
  }
}

/**
 * 还在走的那几条后果。
 *
 * 照明、泄漏、外泄噪音都是**有剩余秒数**的东西，而秒数是实时流走的。
 * 它们必须画在摄像头屏上而不是日志里 —— 日志会往上滚，而这三条的价值
 * 全在「还剩几秒」。画在画面左下角，因为右边整块都是读数。
 */
function drawFieldFx(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  time: number,
): void {
  const rows: { text: string; left: number; color: string }[] = [];
  if (run.fx.flash > 0) {
    rows.push({ text: '全房照亮', left: run.fx.flash, color: PALETTE.ember });
  }
  if (run.fx.spill > 0) {
    rows.push({ text: '泄漏物在吃钢', left: run.fx.spill, color: PALETTE.bloodHot });
  }
  if (run.fx.lure > 0) {
    rows.push({ text: '声音还在外泄', left: run.fx.lure, color: PALETTE.blood });
  }
  if (!rows.length) return;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const x = w * 0.06;
  // 机械臂操作区在左下，持续危险放在它上方，避免倒计时盖住取物提示。
  let y = h * (armAlive(run.arm) && run.phase === 'site' ? 0.50 : 0.78);
  for (const r of rows) {
    // 最后三秒开始闪。倒计时的最后一段必须自己来要玩家的注意
    const urgent = r.left <= 3;
    const a = urgent ? 0.55 + Math.abs(Math.sin(time * 7)) * 0.45 : 0.88;
    ctx.fillStyle = rgba(r.color, a);
    ctx.font = cjk(h * 0.028, 600);
    ctx.fillText(r.text, x, y);
    ctx.font = mono(h * 0.028, 700);
    ctx.fillText(`${r.left.toFixed(1)}s`, x + w * 0.17, y);
    y += h * 0.036;
  }
  ctx.restore();
}

/**
 * 镜头前景里的那根液压杆。
 *
 * 这是玩家在整部游戏里唯一看得见的、属于自己的实体。舱内是仪表和文字，
 * 舱外是一片黑水 —— 只有这根杆同时属于两边。所以它必须有东西可看：
 * 液压管、锈斑、玩家自己缠上去的七圈绝缘胶带（`sup.tape` 的那七圈）。
 *
 * 三条画法上的硬规则，都是为了让它像一根**在镜头前**的杆，而不是一张贴图：
 *
 *   1. 近处完全脱焦 —— 根部糊成一团，只有远端的爪子是清的
 *   2. 探照灯从舱首打出去，所以只有杆的上沿是亮的，下沿几乎是黑的
 *   3. 爪尖比箱子远的时候，它得被箱子吃掉一截（`armTarget.dist` 做深度比较）
 */
function drawArmBody(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  time: number,
): void {
  const target = run.armTarget;
  const pose = armPose(run.arm, {
    dist: target?.dist ?? ARM.reach,
    offAxis: target?.offAxis ?? 0,
    pan: run.camPan,
  });
  if (!pose.visible) return;

  const lit = run.lamp || run.flareLeft > 0;
  // 抖动的相位在这里摇 —— armPose 是纯函数，它只给幅度
  const jitter = pose.shake * h * 0.004;
  const sh = (k: number) => Math.sin(time * (17 + k * 6) + k) * jitter;

  // 根部：画面下缘偏右，云台转开时整根杆跟着横移
  const rootX = w * (0.70 + pose.sway * 0.22);
  const rootY = h * 1.06;
  // 爪尖：伸得越长越往画面中心与上方去
  const tipX = rootX + (w * 0.5 - rootX) * (0.32 + pose.extend * 0.62) + pose.flex * w * 0.05;
  const tipY = rootY - h * (0.22 + pose.extend * 0.44);
  // 肘：肘节角越大，中段往外鼓
  const elbowX = (rootX + tipX) * 0.5 + Math.sin(pose.elbow) * w * 0.10 + pose.flex * w * 0.03;
  const elbowY = (rootY + tipY) * 0.5 + Math.sin(pose.elbow) * h * 0.05;

  const rootW = w * 0.085;
  const tipW = rootW * 0.34;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ---- 被箱子遮住的那一截 ------------------------------------------------
  // 爪尖插进去以后，箱子的前板在它前面。在准星那一圈上挖一个洞，
  // 杆穿进去就没了 —— 深度关系只需要一次 tipDist ≥ dist 的比较，
  // 但没有它，这根杆看上去就是贴在屏幕上的一张图。
  if (pose.inside) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    // 反向绕的圆 = 挖洞（非零环绕规则）
    ctx.arc(cx, cy, h * 0.105, 0, Math.PI * 2, true);
    ctx.clip();
  }

  const segment = (
    x0: number, y0: number, x1: number, y1: number,
    wide: number, blur: number, k: number,
  ): void => {
    ctx.save();
    // 近处脱焦：根部糊得最厉害
    ctx.filter = blur > 0.2 ? `blur(${(blur * h * 0.012).toFixed(1)}px)` : 'none';
    // 杆身
    ctx.strokeStyle = rgba(PALETTE.steel, 0.94);
    ctx.lineWidth = wide;
    ctx.beginPath();
    ctx.moveTo(x0 + sh(k), y0);
    ctx.lineTo(x1 + sh(k + 1), y1);
    ctx.stroke();
    // 上沿的高光：探照灯在舱首，光从上面来
    ctx.strokeStyle = rgba(lit ? PALETTE.ember : PALETTE.steelLit, lit ? 0.52 : 0.22);
    ctx.lineWidth = wide * 0.22;
    ctx.beginPath();
    ctx.moveTo(x0 + sh(k) - wide * 0.30, y0 - wide * 0.24);
    ctx.lineTo(x1 + sh(k + 1) - wide * 0.30, y1 - wide * 0.24);
    ctx.stroke();
    // 下沿：几乎全黑
    ctx.strokeStyle = rgba(PALETTE.abyss, 0.55);
    ctx.lineWidth = wide * 0.18;
    ctx.beginPath();
    ctx.moveTo(x0 + sh(k) + wide * 0.34, y0 + wide * 0.2);
    ctx.lineTo(x1 + sh(k + 1) + wide * 0.34, y1 + wide * 0.2);
    ctx.stroke();
    ctx.restore();
  };

  // 前臂（近、粗、糊）与小臂（远、细、清）
  segment(rootX, rootY, elbowX, elbowY, rootW, 1, 0);
  segment(elbowX, elbowY, tipX, tipY, (rootW + tipW) * 0.5, 0.35, 2);

  // ---- 杆上的东西 --------------------------------------------------------
  ctx.save();
  ctx.filter = `blur(${(h * 0.004).toFixed(1)}px)`;

  // 两根液压软管：从根部一路吊到肘节，受力时绷紧
  for (const side of [-1, 1] as const) {
    const sag = h * (0.05 - Math.abs(pose.flex) * 0.03);
    ctx.strokeStyle = rgba(PALETTE.abyssLift, 0.9);
    ctx.lineWidth = rootW * 0.13;
    ctx.beginPath();
    ctx.moveTo(rootX + side * rootW * 0.3, rootY);
    ctx.quadraticCurveTo(
      (rootX + elbowX) * 0.5 + side * rootW * 0.5,
      (rootY + elbowY) * 0.5 + sag,
      elbowX + side * rootW * 0.2 + sh(1),
      elbowY,
    );
    ctx.stroke();
  }

  // 锈斑。位置由固定的伪随机给，所以每一帧是同一片锈
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + ((i * 97) % 70) / 100;
    const px = rootX + (elbowX - rootX) * t + Math.sin(i * 3.7) * rootW * 0.22;
    const py = rootY + (elbowY - rootY) * t;
    ctx.fillStyle = rgba(i % 3 === 0 ? PALETTE.rustDeep : PALETTE.rustDim, 0.38);
    ctx.beginPath();
    ctx.ellipse(px, py, rootW * (0.10 + (i % 4) * 0.05), rootW * 0.09, i * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // 玩家自己缠的七圈绝缘胶带。缠在根部往上一点 ——
  // 那是上一趟被撞的地方，胶带是那一次的收据
  const tapeAt = 0.30;
  const tx = rootX + (elbowX - rootX) * tapeAt;
  const ty = rootY + (elbowY - rootY) * tapeAt;
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = rgba(i % 2 === 0 ? PALETTE.steelDark : PALETTE.abyssHaze, 0.85);
    ctx.lineWidth = rootW * 0.11;
    ctx.beginPath();
    ctx.moveTo(tx - rootW * 0.52, ty + (i - 3) * rootW * 0.13 + rootW * 0.05);
    ctx.lineTo(tx + rootW * 0.52, ty + (i - 3) * rootW * 0.13 - rootW * 0.05);
    ctx.stroke();
  }
  ctx.restore();

  // ---- 爪子 --------------------------------------------------------------
  const dirX = tipX - elbowX;
  const dirY = tipY - elbowY;
  const len = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  const nx = -uy;
  const ny = ux;
  const fingerLen = h * 0.075;
  // 张合：0 = 咬死，1 = 张到最大
  const spread = 0.12 + pose.grip * 0.85;

  ctx.strokeStyle = rgba(lit ? PALETTE.steelLit : PALETTE.steel, 0.96);
  ctx.lineWidth = tipW * 0.5;
  for (const side of [-1, 1] as const) {
    const kx = tipX + sh(3);
    const ky = tipY;
    const jointX = kx + ux * fingerLen * 0.5 + nx * side * fingerLen * spread * 0.55;
    const jointY = ky + uy * fingerLen * 0.5 + ny * side * fingerLen * spread * 0.55;
    const endX = jointX + ux * fingerLen * 0.7 + nx * side * fingerLen * spread * 0.2;
    const endY = jointY + uy * fingerLen * 0.7 + ny * side * fingerLen * spread * 0.2;
    ctx.beginPath();
    ctx.moveTo(kx, ky);
    ctx.lineTo(jointX, jointY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    // 齿：爪尖内侧那三颗，咬死的时候它们是卡住的那一处
    ctx.fillStyle = rgba(pose.jammed ? PALETTE.bloodHot : PALETTE.ember, lit ? 0.6 : 0.25);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const px = jointX + (endX - jointX) * t - nx * side * tipW * 0.3;
      const py = jointY + (endY - jointY) * t - ny * side * tipW * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, tipW * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // ---- 受力与咬死的视觉代偿 ----------------------------------------------
  // 触觉反馈是零，所以「它正在被拉坏」必须看得见
  if (pose.jammed || Math.abs(pose.flex) > 0.45) {
    ctx.save();
    const heat = pose.jammed ? 0.45 + Math.sin(time * 9) * 0.18 : Math.abs(pose.flex) * 0.3;
    ctx.strokeStyle = rgba(PALETTE.bloodHot, heat);
    ctx.lineWidth = h * 0.006;
    ctx.beginPath();
    ctx.moveTo(elbowX + sh(5), elbowY);
    ctx.lineTo(tipX + sh(6), tipY);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 机械手的读数叠层。
 *
 * 实景画面不是这里画的 —— 这一层只回答四个问题，而且必须四个都回答，
 * 因为舱外没有窗户，玩家对那条臂的全部感知就是这几行字：
 *
 *   它现在在哪一相、伸出去多少
 *   准星压在哪一只箱子上、偏了多少
 *   那只箱子的封条是什么颜色（只有灯照到才读得出来）
 *   已经翻了几爪、还能翻几爪
 */
function drawArmReadout(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  time: number,
): void {
  if (run.phase !== 'site') return;
  const arm = run.arm;
  const target = run.armTarget;
  const lit = run.lamp || run.flareLeft > 0;
  // 臂弃掉了：不再占这块屏。空出来的地方本身就是那条臂的位置
  if (!armAlive(arm)) return;
  // 左下留出独立操作区，结果不依赖准星仍然压着原箱子，也不必切去打捞台。
  drawArmFeedback(ctx, run, w, h);
  // 手收着、又没有光时，只保留操作步骤和上一爪结果。
  if (!lit && !armOut(arm)) return;

  const x = w * 0.60;
  const bw = w * 0.36;
  const top = h * 0.60;
  plate(ctx, x - w * 0.02, top - h * 0.05, bw + w * 0.04, h * 0.42);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  screenTitle(ctx, x, top - h * 0.015, bw, 'ARM  HYDRAULIC', h);

  // 相 + 伸出程度。泵在走的时候这条会跳，那是唯一能证明它没卡住的东西
  const busy = armOut(arm);
  ctx.fillStyle = rgba(busy ? PALETTE.ember : PALETTE.boneDim, 0.92);
  ctx.font = cjk(h * 0.034, 600);
  ctx.fillText(ARM_PHASE_CN[arm.phase], x, top + h * 0.045);
  if (arm.limp) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.9);
    ctx.font = cjk(h * 0.026, 600);
    ctx.fillText('失压 · 挂在外面', x + bw * 0.52, top + h * 0.045);
  }
  drawBar(ctx, x, top + h * 0.06, bw, h * 0.018, arm.out, PALETTE.rust, '', h);

  // 泵的累计运转。这条涨满就等于向这间房广播了一遍你的位置
  const pump = clamp01(arm.pump / ARM.strainSec);
  drawBar(ctx, x, top + h * 0.09, bw, h * 0.014, pump, PALETTE.blood, '', h);
  ctx.fillStyle = rgba(pump > 0.6 ? PALETTE.bloodHot : PALETTE.boneWhisper, 0.8);
  ctx.font = mono(h * 0.022, 500);
  ctx.fillText(`PUMP ${arm.pump.toFixed(0)}s`, x, top + h * 0.125);
  if (arm.woke) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.85);
    ctx.fillText('已被听见', x + bw * 0.52, top + h * 0.125);
  }

  // 咬死的时候这一栏只说那两条路。别的读数现在都不重要了
  if (arm.phase === 'jammed') {
    const grabbed = armGrabbed(arm);
    // 被攥住的那一行要闪。卡住是一个状态，被攥住是一个正在走的倒计时
    const blink = grabbed ? 0.72 + Math.abs(Math.sin(time * 5.5)) * 0.28 : 0.95;
    ctx.fillStyle = rgba(PALETTE.bloodHot, blink);
    ctx.font = cjk(h * 0.032, 700);
    ctx.fillText(grabbed ? '有东西攥着爪' : '爪子咬死', x, top + h * 0.175);
    if (grabbed || arm.jamLeft > 0) {
      ctx.textAlign = 'right';
      ctx.font = mono(h * 0.034, 700);
      ctx.fillStyle = rgba(grabbed ? PALETTE.blood : PALETTE.ember, 0.95);
      ctx.fillText(`${(grabbed ? arm.grabLeft : arm.jamLeft).toFixed(1)}s`, x + bw, top + h * 0.175);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = rgba(PALETTE.bone, 0.85);
    ctx.font = cjk(h * 0.026, 500);
    const opts = layoutCJK(
      ctx,
      grabbed
        ? `它在往里拽。G 拽回来，下一下 ${(wrenchChance(arm) * 100).toFixed(0)}% —— 失败它会攥得更紧。` +
          `X 断开接头，把这条臂留给它。倒计时归零的话，两样都由不得你。`
        : arm.jamLeft > 0
          ? `钢会自己回弹，等就行 —— 代价是泵一直在响。G 花气拽，下一下 ${(wrenchChance(arm) * 100).toFixed(0)}%、极响。X 断接头。`
          : `G 花气拽，下一下 ${(wrenchChance(arm) * 100).toFixed(0)}%、极响。` +
            `X 断开液压接头 —— 立刻能走，但这一趟再没有机械手。`,
      bw,
    );
    for (let i = 0; i < Math.min(4, opts.length); i++) {
      ctx.fillText(opts[i]!, x, top + h * (0.215 + i * 0.034));
    }
    if (arm.purgeLeft > 0) {
      ctx.fillStyle = rgba(PALETTE.blood, 0.95);
      ctx.font = mono(h * 0.028, 700);
      ctx.fillText(`保险盖 ${arm.purgeLeft.toFixed(1)}s`, x, top + h * 0.355);
    }
    ctx.restore();
    return;
  }

  ctx.font = cjk(h * 0.028, 400);
  if (!lit) {
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.9);
    ctx.fillText('探照灯灭着。臂上没有眼睛。', x, top + h * 0.175);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.8);
    ctx.fillText('开灯才瞄得上 —— 否则只能收回来。', x, top + h * 0.215);
    ctx.restore();
    return;
  }

  if (!target) {
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.82);
    ctx.fillText('准星上没有箱子。', x, top + h * 0.175);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.75);
    ctx.font = cjk(h * 0.024, 400);
    ctx.fillText(`瞄准无遮挡的箱面，距离须在 ${ARM.reach.toFixed(1)} 米内。`, x, top + h * 0.212, bw);
    ctx.restore();
    return;
  }

  const c = target.container;
  const seal = sealReadout(c);
  const off = (target.offAxis * 180) / Math.PI;
  const onAxis = target.offAxis <= ARM.gripHalfFov;

  ctx.fillStyle = rgba(PALETTE.ember, 0.92);
  ctx.font = cjk(h * 0.032, 600);
  ctx.fillText(seal.title, x, top + h * 0.175);
  ctx.fillStyle = rgba(PALETTE.bone, 0.8);
  ctx.font = cjk(h * 0.024, 400);
  const hint = layoutCJK(ctx, seal.hint, bw);
  for (let i = 0; i < Math.min(2, hint.length); i++) {
    ctx.fillText(hint[i]!, x, top + h * (0.212 + i * 0.032));
  }

  ctx.font = mono(h * 0.024, 500);
  ctx.fillStyle = rgba(onAxis ? PALETTE.ember : PALETTE.bloodHot, 0.9);
  ctx.fillText(
    `距箱面 ${target.dist.toFixed(1)}m  偏 ${off.toFixed(0)}°  ${onAxis ? '可插入' : '脱靶'}`,
    x,
    top + h * 0.292,
  );
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
  ctx.fillText(
    c.exhausted ? '箱内已空' : run.containerItems.has(c.obstacleId) ? '箱内物资已查看' : '按 F 查看箱内物资',
    x,
    top + h * 0.325,
  );
  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.85);
  ctx.fillText('选中物资后按 C 收回', x, top + h * 0.355);
  if (arm.purgeLeft > 0) {
    ctx.fillStyle = rgba(PALETTE.blood, 0.95);
    ctx.font = mono(h * 0.026, 700);
    ctx.fillText(`保险盖已掀开 ${arm.purgeLeft.toFixed(1)}s`, x + bw * 0.42, top + h * 0.355);
  }
  ctx.restore();

  drawGripReticle(ctx, w, h, target.offAxis, onAxis, time);
}

/** 操作步骤与上一爪结果常驻摄像头，不让伸出动画被误认为抓取成功。 */
function drawArmFeedback(ctx: CanvasRenderingContext2D, run: PodRun, w: number, h: number): void {
  const x = w * 0.06;
  const width = w * 0.46;
  const top = h * 0.69;
  plate(ctx, x - w * 0.015, top - h * 0.035, width + w * 0.03, h * 0.27);
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(PALETTE.ember, 0.98);
  ctx.font = cjk(h * 0.030, 600);
  const instruction = layoutCJK(ctx, run.armInstruction, width);
  for (let i = 0; i < Math.min(3, instruction.length); i++) {
    ctx.fillText(instruction[i]!, x, top + h * i * 0.036);
  }
  ctx.fillStyle = rgba(PALETTE.bone, 0.94);
  ctx.font = cjk(h * 0.026, 400);
  const result = run.arm.lastLine
    ? `上一爪：${run.arm.lastLine}`
    : run.arm.phase === 'gripping' ? '爪子仍在箱内，尚未完成取物。'
    : '尚未翻找。伸出或收回本身不会取得物资。';
  const lines = layoutCJK(ctx, result, width);
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    const line = i === 2 && lines.length > 3 ? `${lines[i]}…` : lines[i]!;
    ctx.fillText(line, x, top + h * (0.12 + i * 0.032));
  }
  ctx.restore();
}

/**
 * 插入窗口。
 *
 * 四个角标随偏角收拢：压上去了才合拢成一个方框。这是玩家唯一看得见的
 * 「爪子会不会插空」——把它画在画面正中，因为那就是云台指着的地方。
 */
function drawGripReticle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  offAxis: number,
  onAxis: boolean,
  time: number,
): void {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const slack = clamp01(offAxis / Math.max(0.001, ARM.gripHalfFov * 3));
  const r = h * (0.05 + slack * 0.06);
  const arm = h * 0.022;
  ctx.save();
  ctx.strokeStyle = rgba(
    onAxis ? PALETTE.ember : PALETTE.boneWhisper,
    onAxis ? 0.6 + Math.sin(time * 5) * 0.2 : 0.4,
  );
  ctx.lineWidth = Math.max(1, h * 0.004);
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * r, cy + sy * r - sy * arm);
    ctx.lineTo(cx + sx * r, cy + sy * r);
    ctx.lineTo(cx + sx * r - sx * arm, cy + sy * r);
    ctx.stroke();
  }
  ctx.restore();
}

/** 摄影机相位的屏上读数。曝光条本身画在取景器层里（view/creature.ts） */
function drawShotStatus(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  w: number,
  h: number,
  time: number,
): void {
  const s = run.shot;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // 冲洗和失败提示不能遮住正在操作的货箱、准星和爪子。
  if (armOut(run.arm) || (run.phase === 'site' && !s.viewing && (s.phase === 'failed' || s.phase === 'developing'))) {
    const status = s.phase === 'developing'
      ? `${run.videoStatus} · 已等 ${s.developed.toFixed(0)}s`
      : s.phase === 'exposing' ? `曝光中 · 剩余 ${s.exposeLeft.toFixed(1)}s`
      : s.phase === 'failed' ? `冲洗失败 · ${s.reason}`
      : s.phase === 'ready' ? '影片已入盒 · 收臂后可回放'
      : '实时镜头 · 机械臂作业中';
    plate(ctx, w * 0.06, h * 0.18, w * 0.88, h * 0.065);
    ctx.fillStyle = rgba(s.phase === 'failed' ? PALETTE.bloodHot : PALETTE.ember, 0.9);
    ctx.font = cjk(h * 0.028, 500);
    ctx.fillText(status, w * 0.08, h * 0.224, w * 0.84);
    ctx.restore();
    return;
  }

  if (s.phase === 'idle') {
    const ok = run.phase === 'site' && run.powered;
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.72);
    ctx.font = cjk(h * 0.03, 400);
    ctx.fillText(
      ok ? '实时镜头 · 驾驶键在屏下；曝光并分析解锁知识。' : '监视回路。',
      w * 0.06,
      h * 0.955,
    );
    if (!ok && run.phase !== 'site') {
      ctx.fillStyle = rgba(PALETTE.rustHot, 0.7);
      ctx.fillText('舱在动，快门锁着。', w * 0.06, h * 0.915);
    }
  }

  if (s.phase === 'developing') {
    // 冲洗是唯一一个「你可以走开」的等待。这件事必须写在屏上，
    // 否则玩家会站在这里干等二十秒 —— 而警报态里那二十秒是要命的。
    const p = clamp01(s.developed / Math.max(0.001, s.developMax));
    plate(ctx, w * 0.16, h * 0.34, w * 0.68, h * 0.30);
    ctx.fillStyle = rgba(PALETTE.rustHot, 0.92);
    ctx.font = cjk(h * 0.055, 600);
    ctx.textAlign = 'center';
    ctx.fillText('冲　洗　中', w * 0.5, h * 0.44);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
    ctx.font = cjk(h * 0.032, 400);
    ctx.fillText('可以离开机位 —— 这一段不需要你站在这里。', w * 0.5, h * 0.50);

    const bx = w * 0.24;
    const bw = w * 0.52;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, h * 0.535, bw, h * 0.02);
    // 上游耗时抖动很大，所以这条进度条报的是「已经等了多久」，
    // 不假装知道还剩多久。假的剩余时间比没有剩余时间更糟。
    ctx.fillStyle = rgba(PALETTE.rust, 0.8);
    ctx.fillRect(bx, h * 0.535, bw * p, h * 0.02);
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.8);
    ctx.font = mono(h * 0.028, 500);
    ctx.fillText(`已等 ${s.developed.toFixed(0)}s  /  最多 ${s.developMax.toFixed(0)}s`, w * 0.5, h * 0.59);

    // 转着的显影槽。一个会动的东西，证明它没卡死。
    ctx.strokeStyle = rgba(PALETTE.ember, 0.55);
    ctx.lineWidth = Math.max(1.5, h * 0.006);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.385, h * 0.026, time * 3.2, time * 3.2 + Math.PI * 1.3);
    ctx.stroke();
  }

  if (s.phase === 'failed') {
    plate(ctx, w * 0.14, h * 0.36, w * 0.72, h * 0.26);
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.9);
    ctx.font = cjk(h * 0.05, 600);
    ctx.fillText('这一卷废了', w * 0.5, h * 0.45);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.85);
    ctx.font = cjk(h * 0.03, 400);
    const lines = layoutCJK(ctx, s.reason, w * 0.64);
    for (let i = 0; i < Math.min(2, lines.length); i++) {
      ctx.fillText(lines[i]!, w * 0.5, h * (0.51 + i * 0.045));
    }
  }

  if (s.phase === 'ready') {
    ctx.fillStyle = rgba(PALETTE.ember, 0.8);
    ctx.font = mono(h * 0.028, 600);
    ctx.fillText(
      s.viewing
        ? isNoVideoMode()
          ? `PROMPT  ${run.leg.siteName}`
          : `REEL-A  ${run.leg.siteName}`
        : isNoVideoMode()
          ? 'PROMPT 在片盒里'
          : 'REEL-A 在片盒里',
      w * 0.06,
      h * 0.955,
    );
  }

  ctx.restore();
}

/** 屏内的一块半透明底板，给需要盖住画面的读数用 */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(4,7,11,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(PALETTE.steelLit, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}


// ============================================================================
// 控件与动作
// ============================================================================

/**
 * 机械手那三个键。
 *
 * hint 里写的永远是**现在缺什么**，不是这个键干什么 —— 没开灯的时候
 * 它就写「先开探照灯」。因果写在按钮上，玩家不需要猜，也不需要读日志。
 *
 * 键位用字母：坐下时 1–6 还留给换台，机械手挤进去会和换台抢键。
 */
function armControls(run: PodRun): Control[] {
  const arm = run.arm;
  // 臂已经弃掉了：这一组键连着一个渗油的孔。一个键都不摆 ——
  // 摆一个灰的按钮等于说「以后还会亮」，而它不会
  if (!armAlive(arm)) return [];

  if(run.authoredSite){
    const busy=['extending','gripping','hauling','jammed'].includes(arm.phase);
    return filterControls([
      {id:'arm.extend',key:'R',label:'伸出臂',hint:'对准箱体 · 开启照明',state:arm.phase==='stowed'?'normal':'disabled'},
      {id:'arm.rummage',key:'F',label:arm.phase==='stowed'?'伸出 / 操作':'翻找 / 取回',hint:busy?ARM_PHASE_CN[arm.phase]:'对准箱体 · 分步操作',state:busy?'disabled':'active'},
      {id:'arm.retract',key:'C',label:'收回',hint:'收妥后物资入库',state:run.armBlock('retract')==='ok'?'normal':'disabled'},
    ]);
  }

  const target = run.armTarget;
  const bExt = run.armBlock('extend');
  const bRum = run.armBlock('rummage');
  const bRet = run.armBlock('retract');
  const alert = run.mode === 'alert';
  const jammed = arm.phase === 'jammed';
  const c = target?.container ?? null;

  const extHint =
    bExt === 'ok' ? `${ARM.extendCost}口气·泵很响`
    : bExt === 'light' ? '先开探照灯'
    : bExt === 'target' ? '够不着箱子'
    : bExt === 'power' ? '没有电'
    : bExt === 'station' ? '舱在动'
    : bExt === 'jammed' ? '爪子咬死了'
    : bExt === 'busy' ? '手已经在外面'
    : '不在机位上';

  const rumHint =
    bRum === 'ok' && c ? '查看整箱物资'
    : bRum === 'stowed' ? '先伸出机械手'
    : bRum === 'light' ? '先开探照灯'
    : bRum === 'jammed' ? '咬死了·先拽'
    : bRum === 'offaxis' && target ? target.aimHint
    : bRum === 'exhausted' ? '这只见底了'
    : bRum === 'overheat' ? '肘节发烫'
    : bRum === 'busy' ? arm.phase === 'extending' ? '正在伸出·稍候' : arm.phase === 'hauling' ? '正在收回' : '正在翻找'
    : bRum === 'target' ? '准星上没箱子'
    : bRum === 'power' ? '没有电'
    : '舱在动';

  const retHint =
    bRet === 'ok' ? `${ARM.haulCost}口气·${ARM.haulSec.toFixed(1)}秒`
    : bRet === 'stowed' ? '已在护套里'
    : bRet === 'jammed' ? '拉不回来·咬死了'
    : bRet === 'busy' ? '正在收'
    : bRet === 'power' ? '泵没有电'
    : '回摄像打捞台';

  // 最后一爪才有炸的可能。这一格漆成血色，是为了让玩家在按之前多想一秒
  const lastPass = !!c && c.searched + 1 >= c.passes && c.risk > 0.15;

  return filterControls([
    {
      id: 'arm.extend',
      key: 'R',
      label: '伸出臂',
      hint: extHint,
      state: bExt !== 'ok' ? 'disabled' : alert ? 'danger' : 'normal',
    },
    {
      id: 'arm.rummage',
      key: 'F',
      label: '翻找',
      hint: rumHint,
      state: bRum !== 'ok' ? 'disabled' : alert || lastPass ? 'danger' : 'active',
    },
    {
      id: 'arm.retract',
      key: 'C',
      label: '收回',
      hint: retHint,
      state: bRet !== 'ok' ? 'disabled' : armOut(arm) && alert ? 'active' : 'normal',
    },
    // 取物只需伸出、翻找、收回，不提供卡爪赌博或弃臂操作。
  ]);
}

/** 拽卡住的爪子。成功率写在按钮上 —— 这是一次明码的赌 */
function wrenchControl(run: PodRun): Control {
  const b = run.armBlock('wrench');
  const p = wrenchChance(run.arm);
  const grabbed = armGrabbed(run.arm);
  return {
    id: 'arm.wrench',
    key: 'G',
    label: grabbed
      ? run.arm.jamPulls > 0 ? `再抢（第${run.arm.jamPulls + 1}下）` : '抢回来'
      : run.arm.jamPulls > 0 ? `再拽（第${run.arm.jamPulls + 1}下）` : '花气拽',
    hint:
      b !== 'ok'
        ? b === 'power' ? '泵没有电' : '回摄像打捞台'
        : grabbed
          // 被攥住的时候要把「失败的代价」写在按钮上。这不是拽，这是赌
          ? `${(p * 100).toFixed(0)}%·失败扣 ${ARM.grabPenaltySec.toFixed(1)}s`
          : `${(p * 100).toFixed(0)}%·${ARM.wrenchCost}口气·极响`,
    state: b !== 'ok' ? 'disabled' : 'danger',
  };
}

/**
 * 弃臂。两段式，一个键。
 *
 * 第一次按掀开保险盖，按钮当场换成「拉下手柄」并开始倒计时；
 * 第二次按才真的炸开接头。中间那几秒是实时的 —— 警报态里它从引信上扣，
 * 所以这个确认既有分量，又没有停下游戏。
 */
function purgeControl(run: PodRun): Control | null {
  const arm = run.arm;
  const b = run.armBlock('purge');
  if (b === 'stowed' || b === 'lost' || b === 'seat') return null;

  const armed = arm.purgeLeft > 0;
  if (!armed) {
    return {
      id: 'arm.purge',
      key: 'X',
      label: '掀保险盖',
      hint: '液压接头·不可复位',
      state: 'normal',
    };
  }
  const ready = run.armBlock('purge-fire') === 'ok';
  return {
    id: 'arm.purge',
    key: 'X',
    label: '拉下红手柄',
    hint: ready
      ? `丢掉整条臂·剩 ${arm.purgeLeft.toFixed(1)}s`
      : `盖子在弹开·${(arm.purgeLeft - (ARM.purgeWindowSec - ARM.purgeArmDelaySec)).toFixed(1)}s`,
    state: ready ? 'danger' : 'disabled',
  };
}

/**
 * 格子满了之后的取舍。
 *
 * 台面上摊着东西的时候这两个键才出现，而且它们是**唯一**能让台面清空的
 * 办法 —— 系统不会替玩家丢任何东西。
 */
function benchControls(run: PodRun): Control[] {
  if (!run.bench.length) return [];
  const slot = run.bench[0]!;
  const def = SUPPLIES[slot.id];
  const per = supplyBulk(slot.id);
  const room = run.bulkFree >= per;
  const out: Control[] = [
    {
      id: 'bench.stow',
      key: 'Z',
      label: `收 ${def.name}`,
      hint: room ? `×${slot.n}·占${per}格` : `没格子·它要${per}格`,
      state: room ? 'active' : 'disabled',
    },
    {
      id: 'bench.dump',
      key: 'V',
      label: `倒掉 ${def.name}`,
      hint: `×${slot.n}·扔进泄压口`,
      state: 'danger',
    },
  ];
  // 腾格子的那一面：格子里每一种东西都能被扔出去。
  // 这就是那个取舍的另一半 —— 不是「要不要这件」，是「拿它换掉哪一件」
  const keys = ['6', '7', '8', '9', '0'];
  let i = 0;
  for (const id of Object.keys(SUPPLIES) as SupplyId[]) {
    if (i >= keys.length) break;
    // 只有格子里的才扔得掉 —— 台面上那些本来就不占格子，扔了不腾出任何东西
    const n = run.stowedCount(id);
    if (n <= 0) continue;
    out.push({
      id: `bench.drop:${id}`,
      key: keys[i]!,
      label: `扔 ${SUPPLIES[id].name}`,
      hint: `×${n}·腾${supplyBulk(id)}格`,
      state: 'normal',
    });
    i++;
  }
  return out;
}

/** 独立驾驶排：不复用云台、机械臂或箱内选择快捷键。空格的显示名由输入路由转换。 */
function cameraDriveControls(run: PodRun): Control[] {
  const block = run.driveBlock;
  const state = block ? 'disabled' : 'normal';
  return [
    { id: 'drive.left', key: 'J', label: '左舵', hint: '按住 · 惯性转向', state },
    { id: 'drive.right', key: 'L', label: '右舵', hint: '按住 · 惯性转向', state },
    { id: 'drive.up', key: 'I', label: '抬头', hint: '按住 · 调整纵倾', state },
    { id: 'drive.down', key: 'K', label: '低头', hint: '按住 · 调整纵倾', state },
    { id: 'drive.center', key: 'H', label: '镜头回中', hint: '对齐船头', state },
    { id: 'drive.forward', key: '空格', label: '推进', hint: block ?? '按住加速 · 松开滑行', state },
    { id: 'drive.back', key: 'N', label: '倒车', hint: block ?? '反推减速 / 倒航', state },
    { id: 'drive.depart', key: 'B', label: '离开本站', hint: block ?? run.departHint, state: !block && run.canDepart ? 'active' : 'disabled' },
  ];
}

export function stationControls(run: PodRun, id: StationId): Control[] {
  if(id==='nav'&&run.authoredSite?.navigationConsole)return run.authoredSite.navigationConsole.controls();
  const use = (sid: SupplyId, key: string): Control | null => {
    const n = run.count(sid);
    if (n <= 0) return null;
    const def = SUPPLIES[sid];
    return {
      id: `use:${sid}`,
      key,
      label: def.name,
      hint: `×${n} · ${def.cost}口气`,
      state: def.station && run.at !== def.station ? 'disabled' : 'normal',
    };
  };

  switch (id) {
    case 'life':
      return filterControls([
        {
          id: 'life.blackout',
          key: '1',
          label: run.blackout ? '合闸' : '拉总闸',
          hint: run.blackout ? '灯会回来' : '装死',
          state: run.blackout ? 'danger' : 'normal',
        },
        { id: 'life.bail', key: '2', label: '舀水', hint: '7口气' },
        { id: 'life.rest', key: '3', label: '靠一会儿', hint: '10口气', state: run.mode === 'alert' ? 'disabled' : 'normal' },
        use('sup.filter', '4'),
        use('sup.sealant', '5'),
        use('sup.cell', '6'),
      ]);
    case 'salvage':
      return stationControls(run, 'camera');
    case 'radio': {
      if(run.legIndex===6 && run.canDepart && !run.campaign.choice) return [
        {id:'radio.recv',key:'1',label:run.radioWaiting?'接听':'静默',hint:'先听完再决定',state:run.radioWaiting&&!run.earsPlugged?'active':'disabled'},
        {id:'story.relay',key:'7',label:'转发载波',hint:'保留信号，上行风险未知'},
        {id:'story.seal',key:'8',label:'切断载波',hint:'停止转发，放弃远程接应'},
        {id:'story.archive',key:'9',label:'封存证据',hint:'至少四关读片记录',state:run.campaign.journal.filter(e=>e.beat==='film').length>=4?'normal':'disabled'},
      ];
      const out: Control[] = [
        {
          id: 'radio.recv',
          key: '1',
          label: run.radioWaiting ? '接听' : '静默',
          hint: run.radioWaiting ? '2口气' : '无载波',
          state: run.radioWaiting && !run.earsPlugged ? 'active' : 'disabled',
        },
      ];
      const topics = run.topics().slice(0, 5);
      topics.forEach((t, i) => {
        out.push({ id: `radio.ask:${t.id}`, key: String(i + 2), label: t.label, hint: '3口气' });
      });
      return out;
    }
    // 摄像头台的第一个键是快门，因为这是这个工位现在的主要动作。
    // 云台挪到后面 —— 它只是用来对准的，不再是「看外面」的方式。
    case 'camera': {
      const s = run.shot;
      const rolling = s.phase === 'exposing' || s.phase === 'developing';
      const purpose = run.shotPurpose();
      const shoot: Control = {
              id: 'camera.shoot',
              key: '1',
              label: rolling
                ? (s.phase === 'exposing' ? `曝光 ${s.exposeLeft.toFixed(1)}s` : '冲洗中')
                : purpose === 'survey' ? '拍下一段'
                : purpose === 'reshoot' || s.phase === 'ready' ? '再拍一卷'
                : '曝光一卷',
              hint:
                armOut(run.arm) ? '先收回机械臂'
                : rolling ? '机子在走'
                : run.phase !== 'site' ? '舱在动 · 会糊'
                : !run.powered ? '没有电'
                : isNoVideoMode() ? '提示词 · 不走接口'
                : run.mode === 'alert' ? '5秒 · 它在靠近'
                : purpose === 'survey' ? '5秒 · 生成下一段'
                : '5秒 · 5口气 · 6%电',
              state:
                armOut(run.arm) || rolling || run.phase !== 'site' || !run.powered ? 'disabled'
                : run.mode === 'alert' || purpose === 'survey' ? 'danger'
                : 'normal',
            };
      return filterControls([
        ...cameraDriveControls(run),
        shoot,
        s.phase === 'ready'
          ? {
              id: 'camera.view',
              key: '2',
              label: '前往分析台',
              hint: armOut(run.arm) ? '先收臂·保持实时' : '录像只能在分析台查看',
              state: armOut(run.arm) ? 'disabled' : 'normal',
            }
          : null,
        {
          id: 'camera.lamp',
          key: '3',
          label: run.lamp ? '关探照灯' : '开探照灯',
          hint: run.lamp ? '它在追光' : '否则什么都看不见',
          state: run.lamp ? 'active' : 'normal',
        },
        use('sup.flare', '4'),
        ...armControls(run),
        {
          id: 'salvage.arm', key: 'Y',
          label: run.volume?.locks.some(l => l.node === run.volumeAt) ? '操作机关' : '搜索残骸',
          hint: run.salvageBlock ?? (run.siteWreck() ? `${run.siteWreck()!.cost}口气 · 会招来东西` : '按分析结果作业'),
          state: run.salvageBlock ? 'disabled' : 'danger',
        },
        { id: 'camera.panL', key: 'Q', label: '云台左', hint: '← 按住微调' },
        { id: 'camera.panR', key: 'E', label: '云台右', hint: '→ 按住微调' },
        { id: 'camera.tiltUp', key: 'W', label: '云台上', hint: '↑ 按住微调' },
        { id: 'camera.tiltDown', key: 'S', label: '云台下', hint: '↓ 按住微调' },
        ...lockerControls(run),
      ]);
    }
    case 'lab': {
      const tape = run.selectedTape;
      return filterControls([
        { id: 'lab.prev', key: '1', label: '上一卷', hint: '', state: run.tapes.length > 1 || evidenceReadouts.has(run) ? 'normal' : 'disabled' },
        { id: 'lab.next', key: '2', label: '下一卷', hint: '', state: run.tapes.length > 1 || evidenceReadouts.has(run) ? 'normal' : 'disabled' },
        { id: 'lab.evidence', key: '7', label: '核验实物', hint: '已持有记录 · 交叉核验', state: run.powered && run.authoredSite?.analyzeEvidence ? 'normal' : 'disabled' },
        { id: 'lab.localPlayback', key: '5', label: localPlaybackStates.get(run)?.paused?'继续播放':'暂停播放', hint:'本地感光序列 · 非AI', state: tape?.ready && (tape.sensorFrames?.length??0)>=3 && tape.videoResult!=='video'?'normal':'disabled' },
        { id: 'lab.expand', key: '4', label: run.labVideoExpanded?'缩回录像':'放大录像', hint:'分析台全屏查看', state:tape?.ready?'active':'disabled' },
        {
          id: 'lab.analyze',
          key: '3',
          label: tape?.analyzed ? '已拆过' : '上卷分析',
          hint: tape ? (tape.ready === false ? '等待显影完成' : tape.analyzed ? '报告在屏上' : '6口气 · 扣电') : '片盒空',
          state:
            !tape || tape.ready === false ? 'disabled'
            : tape.analyzed ? 'active'
            : run.powered ? 'normal'
            : 'disabled',
        },
        run.volumeKnown
          ? {
              id: 'station:camera',
              key: '6',
              label: '去摄像驾驶台',
              hint: 'JLIK 转船头 · 空格前进',
              state: 'active',
            }
          : null,
      ]);
    }
    // 领航台把舵和声呐并在一块面板上，所以控件也并在一排：
    // 左边三个是耳朵（脉冲强度），右边四个是手（航向、推力、推进）。
    case 'nav': {
      const site = run.phase === 'site';
      const atCharge = site && run.volume?.nodes.find((n) => n.id === run.volumeAt)?.role === 'charge';
      return filterControls([
        { id: 'nav.ping0', key: '1', label: '被动聆听', hint: '只报方位 · 无距离' },
        { id: 'nav.active', key: '2', label: run.activeSonarEnabled?'关闭主动声纳':'开启主动声纳', hint: run.activeSonarEnabled?'换能器正在低鸣':'启动会产生噪声', state: run.activeSonarEnabled?'danger':undefined },
        { id: 'nav.ping1', key: '3', label: '常规脉冲', hint: run.activeSonarEnabled?'测距 · 有噪声':'先开启主动声纳', state: run.activeSonarEnabled?undefined:'disabled' },
        { id: 'nav.ping2', key: 'Q', label: '全功率', hint: run.activeSonarEnabled?'整条沟都听见':'先开启主动声纳', state: run.activeSonarEnabled?'danger':'disabled' },
        { id: 'nav.left', key: 'A', label: '航向 −5°', hint: '' },
        { id: 'nav.right', key: 'D', label: '航向 +5°', hint: '' },
        { id: 'nav.pitchUp', key: 'W', label: '上浮', hint: '潜深 −' },
        { id: 'nav.pitchDown', key: 'S', label: '下潜', hint: '潜深 +' },
        {
          id: 'nav.thrDown',
          key: 'Z',
          label: '推力 −',
          hint: run.throttleLabel(),
          state: run.driveBlock ? 'disabled' : 'normal',
        },
        {
          id: 'nav.thrUp',
          key: 'X',
          label: '推力 +',
          hint: '',
          state: run.driveBlock ? 'disabled' : 'normal',
        },
        site
          ? {
              id: 'nav.thrust',
              key: '4',
              label: run.navDriveEngaged ? '停推 · 已接通' : '接通推进',
              hint:
                run.driveBlock ?? (run.navDriveEngaged ? '再次点击停推 / Shift 制动' : run.throttle === 0 ? '单击 / 4 · 接通电机'
                : run.sighting.kind === 'door' ? '开口'
                : run.sighting.kind === 'wall' ? '会撞壁'
                : run.sighting.kind === 'obstacle' ? run.sighting.line
                : `${run.throttleLabel()}`),
              state:
                run.driveBlock ? 'disabled'
                : run.sighting.kind === 'wall' || run.sighting.kind === 'obstacle' ? 'danger'
                : 'normal',
            }
          : {
              id: 'nav.thrust',
              key: '4',
              label: run.navDriveEngaged ? '停推 · 已接通' : '接通推进',
              hint:
                run.navDriveEngaged ? '再次点击停推 / Shift 制动' : run.throttle === 0 ? '单击 / 4 · 接通电机'
                : !run.onCourse ? '偏航·会撞壁'
                : '单击接通 · 再点停推',
              state:
                run.driveBlock ? 'disabled'
                : run.onCourse ? 'normal'
                : 'danger',
            },
        site
          ? {
              id: 'nav.depart',
              key: '5',
              label: '出发',
              hint: run.departHint,
              state: run.canDepart ? 'active' : 'disabled',
            }
          : null,
        atCharge
          ? { id: 'nav.charge', key: '6', label: '充电', hint: '很响', state: 'danger' }
          : use('sup.lure', '6'),
        use('sup.pulse', '7'),
      ]);
    }
  }
}

function filterControls(list: (Control | null)[]): Control[] {
  return list.filter((c): c is Control => c !== null);
}

/** 处理一次点击/按键。返回是否消耗了这次输入。 */
export function performControl(run: PodRun, actionId: string): boolean {
  if(actionId==='nav.thrust'&&run.at==='nav'&&run.authoredSite?.navigationConsole){run.navDriveEngaged=!run.navDriveEngaged;if(!run.navDriveEngaged)run.pilot.stop();return true;}
  if(actionId.startsWith('port.')&&run.at==='nav')return run.authoredSite?.navigationConsole?.action(actionId)??false;
  if(actionId==='weapon.decoy'||actionId==='weapon.pulse')return run.fireWeapon(actionId==='weapon.decoy'?'decoy':'pulse');
  if(actionId.startsWith('story.')) {
    const choice=actionId.slice(6);
    return run.at==='radio' && (choice==='relay'||choice==='seal'||choice==='archive') && run.chooseTransmission(choice);
  }
  if (actionId === 'back') {
    run.leaveStation();
    return true;
  }
  if (run.at) {
    const control = stationControls(run, run.at).find(c => c.id === actionId);
    if (control?.state === 'disabled') return false;
  }
  if (actionId.startsWith('drive.')) {
    if (!run.at || canonicalStation(run.at) !== 'camera' || run.driveBlock) return false;
    const action = actionId.slice(6);
    if (action === 'depart') { run.depart(); return true; }
    if (['left', 'right', 'up', 'down', 'center', 'forward', 'back'].includes(action)) {
      run.cameraDrive(action as CameraDriveAction);
      return true;
    }
    return false;
  }
  if (actionId.startsWith('locker.') || actionId === 'box.retrieve') {
    return performLockerControl(run, actionId);
  }
  if (actionId.startsWith('use:')) {
    return run.useSupply(actionId.slice(4) as SupplyId);
  }
  if (actionId.startsWith('bench.drop:')) {
    return run.dropSupply(actionId.slice(11) as SupplyId);
  }
  if (actionId.startsWith('station:')) {
    run.walkTo(actionId.slice(8) as StationId);
    return true;
  }
  if (actionId.startsWith('radio.ask:')) {
    run.ask(actionId.slice(10));
    return true;
  }
  switch (actionId) {
    case 'life.blackout':
      run.toggleBlackout();
      return true;
    case 'life.bail':
      run.bail();
      return true;
    case 'life.rest':
      run.rest();
      return true;
    case 'salvage.arm':
      run.salvage();
      return true;
    case 'arm.extend':
      run.extendArm();
      return true;
    case 'arm.rummage':
      run.rummage();
      return true;
    case 'arm.retract':
      run.retractArm();
      return true;
    case 'arm.wrench':
      run.wrenchArm();
      return true;
    case 'arm.purge':
      // 一个键两段：第一次掀盖，第二次才真的断。run 里判它到了哪一段
      run.armPurge();
      return true;
    case 'bench.stow':
      return run.stowBench();
    case 'bench.dump':
      return run.dumpBench();
    case 'radio.recv':
      run.receive();
      return true;
    case 'nav.ping0':
      run.ping(0);
      return true;
    case 'nav.active':
      run.toggleActiveSonar();
      return true;
    case 'nav.ping1':
      run.ping(1);
      return true;
    case 'nav.ping2':
      run.ping(2);
      return true;
    case 'camera.panL':
      run.panCamera(-0.18);
      return true;
    case 'camera.panR':
      run.panCamera(0.18);
      return true;
    case 'camera.tiltUp':
      run.tiltCamera(-0.08);
      return true;
    case 'camera.tiltDown':
      run.tiltCamera(0.08);
      return true;
    case 'camera.lamp':
      run.toggleLamp();
      return true;
    case 'camera.shoot':
      run.beginShoot();
      return true;
    case 'camera.replay':
      run.replayFootage();
      if (isNoVideoMode()) revealPrompt(run.shot.cacheKey ?? run.shot.legId);
      return true;
    case 'camera.view':
      run.toggleFootageView();
      if (isNoVideoMode() && run.shot.viewing) revealPrompt(run.shot.cacheKey ?? run.shot.legId);
      return true;
    case 'nav.left':
      run.nudgeHeading(-5);
      return true;
    case 'nav.right':
      run.nudgeHeading(5);
      return true;
    case 'nav.pitchUp':
      run.holdHeave(1);
      return true;
    case 'nav.pitchDown':
      run.holdHeave(-1);
      return true;
    case 'nav.charge':
      run.charge();
      return true;
    case 'nav.thrDown':
      run.setThrottle(run.throttle - 1);
      return true;
    case 'nav.thrUp':
      run.setThrottle(run.throttle + 1);
      return true;
    case 'nav.thrust':
      run.thrust();
      return true;
    case 'nav.depart':
      run.depart();
      return true;
    case 'lab.prev':
      evidenceReadouts.delete(run);
      run.cycleTape(-1);
      return true;
    case 'lab.next':
      evidenceReadouts.delete(run);
      run.cycleTape(1);
      return true;
    case 'lab.analyze':
      evidenceReadouts.delete(run);
      run.analyzeTape();
      return true;
    case 'lab.evidence': {
      const lines=run.authoredSite?.analyzeEvidence?.(undefined);
      if(lines){
        run.labVideoExpanded=false;
        evidenceReadouts.set(run,{time:run.clock,lines:lines.length?lines:['没有新增可交叉核验的实物记录。']});
        run.pushLog(`分析台 · 来源：已持有实物记录 · 核验时间 T+${run.clock.toFixed(0)}s`,'system');
        for(const line of lines)run.pushLog(line,'system');
      }
      return true;
    }
    case 'lab.expand':
      if(run.selectedTape?.ready)run.labVideoExpanded=!run.labVideoExpanded;
      return true;
    case 'lab.localPlayback': {
      const playback=localPlaybackFor(run);playback.paused=!playback.paused;
      return true;
    }
    default:
      return false;
  }
}

/**
 * 声呐上的游标层。两个阶段读的是两张完全不同的图，所以标注也分两套：
 *
 *   航渡 —— 墙上的口子在哪，目标点还有多远。除此之外什么都不标。
 *   到站 —— PPI 只标红点和硬回波。洞穴几何在旁边的全息台上。
 */
function drawScopeCursors(
  ctx: CanvasRenderingContext2D,
  run: PodRun,
  cx: number,
  cy: number,
  r: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (run.phase === 'transit') {
    // 开口：相对舱首的方位。屏幕正上方 = 舱首。
    const openRad = ((run.leg.safeHeading - run.heading) * Math.PI) / 180;
    const half = (run.leg.tolerance * Math.PI) / 180;
    const a = openRad - Math.PI / 2;
    ctx.strokeStyle = rgba(run.onCourse ? PALETTE.ember : PALETTE.rustHot, 0.32);
    ctx.lineWidth = Math.max(1, r * 0.008);
    ctx.setLineDash([r * 0.03, r * 0.05]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97);
    ctx.stroke();
    ctx.setLineDash([]);

    // 容差扇：走廊有多宽
    ctx.fillStyle = rgba(PALETTE.ember, 0.055);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.97, a - half, a + half);
    ctx.closePath();
    ctx.fill();

    // 目标点：开口方向上，随推进往里收的那个标记
    const tr = clamp01(0.08 + (run.remaining / run.leg.length) * 0.88) * r;
    const tx = Math.cos(a) * tr;
    const ty = Math.sin(a) * tr;
    const pulse = 0.55 + Math.sin(time * 2.6) * 0.3;
    ctx.strokeStyle = rgba(PALETTE.ember, 0.55 + pulse * 0.4);
    ctx.lineWidth = Math.max(1, r * 0.009);
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.07, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.1, ty);
    ctx.lineTo(tx - r * 0.045, ty);
    ctx.moveTo(tx + r * 0.045, ty);
    ctx.lineTo(tx + r * 0.1, ty);
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.ember, 0.9);
    ctx.font = mono(r * 0.07, 600);
    ctx.fillText(`${run.remaining.toFixed(0)}m`, tx, ty - r * 0.13);
    ctx.font = cjk(r * 0.062, 500);
    ctx.fillStyle = rgba(PALETTE.boneDim, 0.75);
    ctx.fillText(run.leg.siteName, tx, ty + r * 0.14);
  } else {
    // 到站：舱体周围一圈近场刻度，告诉你阴影有多远
    ctx.strokeStyle = rgba(PALETTE.boneWhisper, 0.16);
    ctx.lineWidth = 1;
    for (const f of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * f, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.45);
    ctx.font = mono(r * 0.055, 500);
    ctx.fillText('近场 · 回波', 0, -r * 0.9);

    const w = run.siteWreck();
    if (w) {
      const wa = run.contacts.find((c) => c.id.startsWith('wreck.'))?.bearing ?? 0;
      const ang = wa - Math.PI / 2;
      const wx = Math.cos(ang) * r * 0.3;
      const wy = Math.sin(ang) * r * 0.3;
      ctx.strokeStyle = rgba(PALETTE.bone, 0.7);
      ctx.lineWidth = Math.max(1, r * 0.007);
      ctx.strokeRect(wx - r * 0.05, wy - r * 0.05, r * 0.1, r * 0.1);
      ctx.fillStyle = rgba(PALETTE.bone, 0.85);
      ctx.font = cjk(r * 0.06, 500);
      ctx.fillText(w.name, wx, wy - r * 0.11);
    }
  }

  // 红点：两个阶段都要标，因为它是屏上唯一会杀死你的东西
  const t = run.threat;
  if (t && (t.phase === 'contact' || t.phase === 'identified')) {
    const ang = t.bearing - Math.PI / 2;
    const tx = Math.cos(ang) * t.range * r;
    const ty = Math.sin(ang) * t.range * r;
    const beat = 0.5 + Math.sin(time * 6) * 0.45;
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.55 + beat * 0.45);
    ctx.beginPath();
    ctx.arc(tx, ty, r * 0.028, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.3 + beat * 0.4);
    ctx.lineWidth = Math.max(1, r * 0.006);
    ctx.beginPath();
    ctx.arc(tx, ty, r * (0.055 + beat * 0.03), 0, TAU);
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.bloodHot, 0.9);
    ctx.font = mono(r * 0.058, 600);
    ctx.fillText(t.known ? t.creature.name : '?', tx, ty + r * 0.1);
  }

  ctx.restore();
}

function paragraphLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  max: number,
): void {
  const lines = layoutCJK(ctx, text, maxW);
  const n = Math.min(lines.length, max);
  for (let i = 0; i < n; i++) ctx.fillText(lines[i]!, x, y + i * lh);
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
