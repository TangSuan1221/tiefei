/**
 * 冲出来的那卷片子。
 * ============================================================================
 * 两件事：
 *
 *   1. **缓存 + 冲洗**。把 sim 层扔出来的 FootageRequest 接住，查缓存，
 *      没有就去 net/video.ts 生成，拿到 mp4 之后装进一个 <video> 里。
 *   2. **降质**。生成出来的是一段干净的 768p 视频。直接画到摄像头屏上
 *      会和整部作品的美术彻底打架 —— 太干净、太亮、色域太宽，而且模型
 *      随时可能给你来一片海水绿。这里把它压成「舱外那台坏摄像机拍到的」。
 *
 * 缓存是这个文件存在的一半理由：**每次生成计费 $0.345**。所以
 *   内存 Map   —— 同一段第二次看不花钱，也不花时间；
 *   sessionStorage —— 只存 job id，不存 blob（2 MB 塞不进去，而且取片免费）。
 *     刷新页面之后 blob 没了但 id 还在，于是 F5 也不会重新计费。
 */

import { clamp01 } from '@/core/util';
import { valueNoise2 } from '@/core/rng';
import { PALETTE, rgba } from '@/render/palette';
import { cjk, mono } from '@/ui/typography';
import type { FootageRequest, PodRun } from '../sim/run';
import { armOut } from '../sim/manipulator';
import { failureLine, fetchVideoContent, requestVideo, VIDEO_ENABLED } from '../net/video';
import { remapFootagePixels } from './degrade';
import { isNoVideoMode, openPromptPanel, promptFor, storePrompt } from './gm';

/** sessionStorage 里那张「航段 → job id」的表 */
const STORE_KEY = 'ironlung.footage.v1';

interface Reel {
  legId: string;
  url: string;
  video: HTMLVideoElement;
}

/** 已经冲好的片子。键是 leg.id */
const REELS = new Map<string, Reel>();
/** 正在冲的航段，挡住重复请求 */
const INFLIGHT = new Set<string>();

function loadIdMap(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveId(legId: string, videoId: string): void {
  try {
    const m = loadIdMap();
    m[legId] = videoId;
    sessionStorage.setItem(STORE_KEY, JSON.stringify(m));
  } catch {
    /* 隐私模式下 sessionStorage 会抛。缓存是优化，不是功能 */
  }
}

/**
 * 把 blob 装进一个 <video>，并且**等到它真的能解码**再返回。
 *
 * 必须等 —— 「生成的视频加载失败」是要单独回落的一种情况（浏览器不认这个
 * 编码、blob 截断、mp4 头坏了）。如果不在这里等，sim 层会先切到 ready，
 * 然后玩家看到的是一块纯黑，而日志上写着「片子冲出来了」。
 */
function decodeReel(legId: string, blob: Blob): Promise<Reel | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;          // 本作的声音全是 WebAudio 合成的，片子不许出声
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const done = (ok: boolean): void => {
      video.onloadeddata = null;
      video.onerror = null;
      clearTimeout(timer);
      if (!ok) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      void video.play().catch(() => {
        /* 自动播放策略。画面靠 drawImage 取帧，暂停着也能取到第一帧 */
      });
      resolve({ legId, url, video });
    };

    const timer = setTimeout(() => done(false), 12000);
    video.onloadeddata = () => done(video.videoWidth > 0 && video.videoHeight > 0);
    video.onerror = () => done(false);
  });
}

/**
 * 装上冲洗回路。
 *
 * 默认只在配好视频开关时装。没装的话 run.footageSink 是 null，
 * sim 层每一卷都会走到 failed，而 failed 有完整的表现回落。
 *
 * GM「无视频模式」例外：仍然装 sink，但**绝不发请求**。冲出来的是提示词。
 */
export function installFootageSink(run: PodRun): void {
  if (isNoVideoMode()) {
    run.footageSink = (req: FootageRequest) => handlePrompt(run, req);
    return;
  }
  if (!VIDEO_ENABLED) {
    run.footageSink = null;
    return;
  }
  run.footageSink = (req: FootageRequest) => {
    void handle(run, req);
  };
}

/** GM 无视频：曝光和线框分析照常，接口一分钱不花。 */
function handlePrompt(run: PodRun, req: FootageRequest): void {
  storePrompt(req.legId, req.prompt);
  window.setTimeout(() => {
    req.settle(req.token, true, undefined, false, true);
    if (run.shot.token === req.token && run.shot.phase === 'ready'
      && run.shot.viewing && run.at === 'camera' && !armOut(run.arm)) {
      openPromptPanel(req.prompt, req.legId);
    }
  }, 280);
}

/** 无视频模式下，这一卷该显示的提示词。没有就回落到监视回路 */
export function readyPrompt(run: PodRun): string | null {
  if (!isNoVideoMode()) return null;
  const s = run.shot;
  if (s.phase !== 'ready' || !s.viewing || armOut(run.arm)) return null;
  return promptFor(s.legId) ?? null;
}

async function handle(run: PodRun, req: FootageRequest): Promise<void> {
  const { legId, token, settle } = req;

  // 1. 内存缓存。同一段第二次拍：不花钱，不花时间。
  const cached = REELS.get(legId);
  if (cached) {
    settle(token, true);
    return;
  }

  if (INFLIGHT.has(legId)) {
    settle(token, false, '冲洗槽里已经有一卷了。等它出来。');
    return;
  }
  INFLIGHT.add(legId);

  try {
    // 2. sessionStorage 里有 id：只取片，不生成。取片不计费。
    const knownId = loadIdMap()[legId];
    let result = knownId ? await fetchVideoContent(knownId) : null;

    // 3. 真的得生成了。
    if (!result || !result.ok) {
      result = await requestVideo(req.prompt);
    }

    // 3b. 被内容审核拦了：拿不含怪物的那一版再试一次。
    //     本作是恐怖游戏，怪物描述被驳回是常态而不是异常
    //     （实拍：溺者合唱那一段直接 "output new_sensitive"）。
    //     环境总比什么都没有好，而「那东西刚好没进这一卷」在世界观里成立。
    let creatureMissing = false;
    if (!result.ok && result.fail.kind === 'filtered' && req.fallbackPrompt !== req.prompt) {
      console.warn('[footage] 怪物描述被内容审核拦了，改用环境版重试', result.fail.detail);
      const retry = await requestVideo(req.fallbackPrompt);
      if (retry.ok) {
        result = retry;
        creatureMissing = true;
      }
    }

    if (!result.ok) {
      // 技术细节只进 console，玩家看到的是世界观里的话。
      console.warn('[footage] 生成失败', result.fail);
      settle(token, false, failureLine(result.fail));
      return;
    }

    // 4. 必须能解码才算成功。
    const reel = await decodeReel(legId, result.blob);
    if (!reel) {
      console.warn('[footage] 片子拿到了但浏览器解不开', result.videoId);
      settle(token, false, '片子在冲洗槽里卡住了，抽出来的时候已经烫得卷了边。');
      return;
    }

    REELS.set(legId, reel);
    saveId(legId, result.videoId);
    settle(token, true, undefined, creatureMissing);
  } catch (e) {
    console.warn('[footage] 冲洗回路异常', e);
    settle(token, false, '信号中断。冲洗槽那头没人接。');
  } finally {
    INFLIGHT.delete(legId);
  }
}

/** 现在这一段有片子可放吗。没有就返回 null，调用方回落到程序化画面 */
export function readyReel(run: PodRun): HTMLVideoElement | null {
  const s = run.shot;
  if (s.phase !== 'ready' || !s.viewing || armOut(run.arm)) return null;
  const reel = REELS.get(s.legId);
  if (!reel) return null;
  // 视频还没解到第一帧的话画出来是全黑，不如先让程序化画面顶着。
  if (reel.video.readyState < 2) return null;
  return reel.video;
}

// ============================================================================
// 降质
// ============================================================================

/**
 * 摄像头屏上那卷片子的取景宽度。
 *
 * 和 pano.ts 用的是同一套理由：故意在一块很小的缓冲上取帧再放大。
 * 一来每帧要做的逐像素调色只有两万次而不是两百万次，二来这台摄像机
 * 本来就该是糊的 —— 欠采样在这里不是瑕疵，是画风。
 */
const BUF_MAX_W = 208;

let buf: HTMLCanvasElement | null = null;
let bufCtx: CanvasRenderingContext2D | null = null;
let bufW = 0;
let bufH = 0;

export interface FootageDrawOptions {
  time: number;
  /** 叙事污染 0..1。越高，磁带跑偏和丢帧越凶 */
  corruption: number;
  /** 探照灯总量 0..1。关灯看片子也该更暗 —— 那台监视器在同一块电池上 */
  light: number;
}

/**
 * 把 <video> 的当前帧画进摄像头屏。
 *
 * 只负责「画面本身」。海雪、深度雾、视频雪花、取景器（REC / 时间码 /
 * 方位刻度）那几层仍然由 view/creature.ts 叠在上面 —— 那几层是这台摄像机
 * 的身份证，换了片源也不能换。
 */
export function drawFootageFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  video: HTMLVideoElement,
  opts: FootageDrawOptions,
): void {
  const tw = Math.max(64, Math.min(BUF_MAX_W, Math.round(w / 2.6)));
  const th = Math.max(36, Math.round((tw * h) / Math.max(1, w)));
  if (!buf || !bufCtx || bufW !== tw || bufH !== th) {
    buf = document.createElement('canvas');
    buf.width = tw;
    buf.height = th;
    bufCtx = buf.getContext('2d', { willReadFrequently: true });
    bufW = tw;
    bufH = th;
  }
  if (!bufCtx) return;

  // 1. 把 768p 的帧压到两百来像素宽。生成的片子是 16:9，摄像头屏不是，
  //    所以按「盖满」裁切而不是拉伸 —— 拉伸会让人脸和管子都变胖。
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.max(tw / vw, th / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  bufCtx.drawImage(video, (tw - dw) / 2, (th - dh) / 2, dw, dh);

  // 2. 逐像素过调色表。这一步是四色约束的执行点，不是风格选项 ——
  //    实拍验证过模型会无视提示词里的 "no teal" 交回来一片青绿海水。
  //    变换本身在 ./degrade.ts，那个文件不碰 DOM，好让离线工具用同一份。
  const img = bufCtx.getImageData(0, 0, tw, th);
  const light = clamp01(opts.light);
  const corr = clamp01(opts.corruption);
  // 关灯的时候这块屏也暗下来，但不能到零 —— 片子是拍好的，不是实时的，
  // 所以它不该因为现在关了灯就消失。留一个底。
  remapFootagePixels(img.data, 0.42 + light * 0.58);
  bufCtx.putImageData(img, 0, 0);

  // 3. 放大回屏幕。逐行横向抖动 = 磁带跑偏，和 pano.ts 里同一个手法：
  //    整块贴上去太稳，稳就不像一台泡在 1300 米水里的机器。
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  const rows = 14;
  const rowH = th / rows;
  for (let i = 0; i < rows; i++) {
    const sy = i * rowH;
    const jitter =
      (valueNoise2(i * 1.7, opts.time * 2.3, 13) - 0.5) * w * (0.004 + corr * 0.05);
    const dy = (sy / th) * h;
    ctx.drawImage(buf, 0, sy, tw, rowH + 0.5, jitter, dy, w, (rowH / th) * h + 1);
  }
  ctx.restore();

  // 4. 丢帧：污染高的时候整屏偶尔黑一下。生成的片子帧率是稳的，
  //    而这台机器不该是稳的。
  if (corr > 0.35 && valueNoise2(opts.time * 9, 3, 29) > 0.93) {
    ctx.fillStyle = `rgba(3,5,9,${0.35 + corr * 0.4})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * 无视频模式的「片子」：把真正会发给接口的提示词画在摄像头屏上。
 * 全文另有一块可复制的面板。这里只让玩家看见「这一卷生成了什么」。
 */
export function drawPromptFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  prompt: string,
  time: number,
): void {
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(PALETTE.ember, 0.82);
  ctx.font = cjk(h * 0.042, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('GM · 无视频 · 本卷提示词', w * 0.05, h * 0.08);
  ctx.fillStyle = rgba(PALETTE.boneWhisper, 0.55);
  ctx.font = mono(h * 0.026, 400);
  ctx.fillText(`${prompt.length} chars · 不走接口`, w * 0.05, h * 0.125);

  ctx.font = mono(Math.max(9, h * 0.022), 400);
  ctx.fillStyle = rgba(PALETTE.bone, 0.78);
  const maxW = w * 0.9;
  const lineH = h * 0.032;
  let y = h * 0.175;
  const words = prompt.split(/\s+/);
  let line = '';
  let rows = 0;
  const maxRows = Math.floor((h * 0.78) / lineH);
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW) {
      ctx.fillText(line, w * 0.05, y);
      y += lineH;
      line = word;
      rows++;
      if (rows >= maxRows) break;
    } else {
      line = next;
    }
  }
  if (rows < maxRows && line) ctx.fillText(line, w * 0.05, y);

  const flicker = 0.04 + Math.sin(time * 7.2) * 0.02;
  ctx.fillStyle = `rgba(6,10,16,${flicker})`;
  ctx.fillRect(0, 0, w, h);
}
