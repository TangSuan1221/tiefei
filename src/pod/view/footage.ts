import {videoDuration,VIDEO_DURATION_REVISION} from '../content/video-duration';
import {useHarborLocalVideo} from '../content/harbor-local-videos';
import {HARBOR_CREATURE_REFERENCES,HARBOR_REFERENCE_REVISION} from '../content/harbor-video-references';
import { isVideoCall, commUi } from './comm-desk';
import { labDeskState } from './lab-desk';
import {isHarborOpening,harborOpeningOpened,finishHarborCall} from '../sim/harbor-opening';
import {abyssalVideoAuthorized} from '../net/abyssal-video-authorization';
/**
 * 冲出来的那卷片子。
 * ============================================================================
 * 两件事：
 *
 *   1. **缓存 + 冲洗**。把 sim 层扔出来的 FootageRequest 接住，查缓存，
 *      没有就去 net/video.ts 生成，拿到 mp4 之后装进一个 <video> 里。
 *   2. **监控信号**。普通与放大播放共用保色CCTV后处理：柔化、色度拖边、
 *      暗部噪声与微弱时序扰动；不修改原片，字幕在信号处理后绘制。
 *
 * 缓存是这个文件存在的一半理由：**每次生成计费 $0.345**。所以
 *   内存 Map   —— 同一段第二次看不花钱，也不花时间；
 *   sessionStorage —— 只存 job id，不存 blob（2 MB 塞不进去，而且取片免费）。
 *     刷新页面之后 blob 没了但 id 还在，于是 F5 也不会重新计费。
 */

import { PALETTE, rgba } from '@/render/palette';
import { cjk, mono } from '@/ui/typography';
import type { FootageRequest, PodRun, TapeRecord } from '../sim/run';
import { armOut } from '../sim/manipulator';
import { failureLine, fetchVideoContent, requestVideo, VIDEO_ENABLED } from '../net/video';
import { drawCctvSignal } from './cctv-signal';
import { isNoVideoMode, openPromptPanel, promptFor, storePrompt } from './gm';
import { isAudioMuted, onAudioMute } from '@/audio/mute';
import { timeSubtitles, type SubtitleLine } from '../content/video-subtitles';
import { harborTaskSubtitles, HARBOR_TASKS, type HarborTaskId } from '../content/harbor-task-videos';
import { livingTaskSubtitles, LIVING_TASKS, type LivingTaskId } from '../content/living-task-videos';
import { drawVideoSubtitle } from './video-subtitles';

/** sessionStorage 里那张「航段 → job id」的表 */
const STORE_KEY = 'ironlung.footage.v2';

interface StoredReel { videoId: string; creatureMissing: boolean }

interface Reel {
  creatureMissing: boolean;
  legId: string;
  url: string;
  video: HTMLVideoElement;
  /** 原声里有人声的起止秒数；分析完成前为 undefined，没有音轨或分析失败为 null */
  voice?: { start: number; end: number } | null;
}

/**
 * 找出原声里说话的大致起止，用来把字幕铺在真正有声音的区间里。
 * 不做逐字对齐：只取第一个和最后一个超过阈值的 50ms 窗口（阈值 -35 dBFS 或峰值的 12%）。
 */
async function voiceSpan(blob: Blob): Promise<{ start: number; end: number } | null> {
  try {
    const audio = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0), win = Math.max(1, Math.round(audio.sampleRate * 0.05));
    const rms: number[] = [];
    for (let i = 0; i < data.length; i += win) {
      let sum = 0;
      const end = Math.min(data.length, i + win);
      for (let j = i; j < end; j++) sum += data[j]! * data[j]!;
      rms.push(Math.sqrt(sum / (end - i)));
    }
    const threshold = Math.max(0.0178, Math.max(...rms) * 0.12);
    const first = rms.findIndex(v => v > threshold), last = rms.length - 1 - [...rms].reverse().findIndex(v => v > threshold);
    if (first < 0 || last <= first) return null;
    return { start: first * 0.05, end: Math.min(audio.duration, (last + 1) * 0.05) };
  } catch {
    return null; // 没有音轨或浏览器解不开音频：字幕退回按片长铺开
  }
}

/** 已经冲好的片子。键是 leg.id */
const REELS = new Map<string, Reel>();
const REMOTE_PLAYLISTS = new Map<string,{reels:Reel[];index:number}>();
export function pauseHarborCallAway(run:PodRun){
  for(const tape of run.tapes.filter(isHarborOpening))if(run.at!=='lab'||!run.powered||run.selectedTape!==tape)REMOTE_PLAYLISTS.get(tape.cacheKey??'')?.reels.forEach(r=>r.video.pause());
}
export const hasRemotePlaylist=(key:string)=>REMOTE_PLAYLISTS.has(key);
function selectedReels(run:PodRun):Reel[]{
  const tape=run.selectedTape;if(!tape)return [];
  const playlist=REMOTE_PLAYLISTS.get(tape.cacheKey??''),reel=REELS.get(tape.cacheKey??tape.legId);
  return playlist?playlist.reels:reel?[reel]:[];
}
/** Whether the selected archive's video is audibly running; drives the comm tab's receive waveform. */
export function labPlaybackRunning(run:PodRun):boolean{return selectedReels(run).some(r=>r.video.readyState>=2&&!r.video.paused&&!r.video.ended);}
export function pauseLabPlayback(run:PodRun){selectedReels(run).forEach(r=>r.video.pause());}

/** Decode every authored segment before publishing a remote tape. No repeated stills. */
export async function installRemotePlaylist(key:string,legId:string,blobs:Blob[]):Promise<string[]> {
  const reels:Reel[]=[],frames:string[]=[];
  try {
    for(const blob of blobs){
      const reel=await decodeReel(legId,blob,false);
      if(!reel||!Number.isFinite(reel.video.duration)||reel.video.duration<=0)throw Error('远端录像无法解码');
      reels.push(reel);reel.video.pause();reel.video.loop=false;
      void voiceSpan(blob).then(span=>{reel.voice=span;});
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*reel.video.videoHeight/reel.video.videoWidth);
      const ctx=canvas.getContext('2d')!;
      for(const fraction of [.1,.5,.9]){
        await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('录像采样超时')),8000);reel.video.onseeked=()=>{clearTimeout(timer);reel.video.onseeked=null;resolve();};reel.video.currentTime=reel.video.duration*fraction;});
        ctx.drawImage(reel.video,0,0,canvas.width,canvas.height);frames.push(canvas.toDataURL('image/jpeg',.8));
      }
      reel.video.currentTime=0;
    }
    const old=REMOTE_PLAYLISTS.get(key);if(old)for(const r of old.reels){r.video.pause();URL.revokeObjectURL(r.url);}
    REMOTE_PLAYLISTS.set(key,{reels,index:0});return frames;
  }catch(error){for(const r of reels){r.video.pause();URL.revokeObjectURL(r.url);}throw error;}
}
// ============================================================================
// 原声播放（VR-116）
// ============================================================================
//
// 剧情视频带模型生成的原声（艾里亚斯的话），不再静音；只跟随全局静音开关。
// 只有当前画在屏上的那一卷出声：超过 SHOWN_GRACE 毫秒没被画到就暂停，
// 免得离开分析台后片子还在后台循环出声。

const SHOWN_GRACE = 300;
const shownAt = new Map<HTMLVideoElement, number>();
let sweeper = 0;

function allVideos(): HTMLVideoElement[] {
  return [...REELS.values(), ...[...REMOTE_PLAYLISTS.values()].flatMap(p => p.reels)].map(r => r.video);
}
onAudioMute(muted => { for (const v of allVideos()) v.muted = muted; });

/** 浏览器拦下有声自动播放时先静音播放，下一次点击或按键再恢复声音。 */
const waitingForGesture = new Set<HTMLVideoElement>();
function unmuteOnGesture(): void {
  for (const v of waitingForGesture) v.muted = isAudioMuted();
  waitingForGesture.clear();
}
function playAudible(video: HTMLVideoElement): void {
  if (!waitingForGesture.has(video)) video.muted = isAudioMuted();
  void video.play().catch((error: unknown) => {
    if ((error as { name?: string })?.name !== 'NotAllowedError' || video.muted) return;
    video.muted = true;
    if (!waitingForGesture.size) {
      window.addEventListener('pointerdown', unmuteOnGesture, { once: true, capture: true });
      window.addEventListener('keydown', unmuteOnGesture, { once: true, capture: true });
    }
    waitingForGesture.add(video);
    void video.play().catch(() => { /* 画面靠 drawImage 取帧，暂停着也能取到当前帧 */ });
  });
}
/** 这一帧把 video 画上屏了：需要时开始播放，并登记给暂停巡检。 */
function present(video: HTMLVideoElement, play = true): void {
  shownAt.set(video, performance.now());
  if (play && video.paused && !video.ended) playAudible(video);
  if (!sweeper) sweeper = window.setInterval(() => {
    const now = performance.now();
    for (const [v, at] of shownAt) if (now - at > SHOWN_GRACE) { v.pause(); shownAt.delete(v); }
    if (!shownAt.size) { clearInterval(sweeper); sweeper = 0; }
  }, 150);
}

/** 正在冲的航段，挡住重复请求 */
const INFLIGHT = new Map<string,Promise<void>>();

function loadIdMap(): Record<string, StoredReel> {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '{}') as Record<string, StoredReel>;
  } catch {
    return {};
  }
}

function saveId(key: string, videoId: string, creatureMissing: boolean): void {
  try {
    const m = loadIdMap();
    m[key] = { videoId, creatureMissing };
    for (const old of Object.keys(m).slice(0, -24)) delete m[old];
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
function decodeReel(legId: string, blob: Blob, creatureMissing: boolean): Promise<Reel | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = isAudioMuted(); // 剧情视频保留原声；真正开播放由 present() 在画上屏时决定
    video.loop = false;
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
      // 不在这里自动播放：有声片子只在画上屏时才放（present），解码完成即可取到第一帧。
      resolve({ legId, url, video, creatureMissing });
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
    run.videoStatus = 'GM 提示词模式 · 不生成视频';
    run.footageSink = (req: FootageRequest) => handlePrompt(run, req);
    return;
  }
  if (!VIDEO_ENABLED) {
    run.videoStatus = '本地底片 · 视频服务未启用';
    run.footageSink = null;
    return;
  }
  run.videoStatus = 'MiniMax 视频接口已启用';
  run.footageSink = (req: FootageRequest) => {
    if(!req.prefetch)run.videoStatus = '正在提交视频任务';
    void handle(run, req);
  };
}

/** GM 无视频：曝光和线框分析照常，接口一分钱不花。 */
function handlePrompt(run: PodRun, req: FootageRequest): void {
  storePrompt(req.cacheKey, req.prompt);
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
  return promptFor(s.cacheKey ?? s.legId) ?? null;
}

async function handle(run: PodRun, req: FootageRequest): Promise<void> {
  if(isNoVideoMode()){handlePrompt(run,req);return;}
  // Level three requires its explicit local flag or per-tab approval, in addition to the global service switch.
  if (run.legIndex === 2 && !abyssalVideoAuthorized()) {
    run.videoStatus = '第三关录像生成未启用 · 未上传素材';
    req.settle(req.token, false);
    return;
  }
  const { legId, token, settle } = req;
  const cacheKey=req.cacheKey;
  // Preserve the playback key; version only the persisted remote lookup below.
  const remoteKey=cacheKey+':'+VIDEO_DURATION_REVISION+':'+videoDuration(req.kind??'observation',req.duration)+(req.harborCreatureReference?':'+HARBOR_REFERENCE_REVISION:'');
  if(req.allowed===false){settle(token,false,'附近没有怪物；保留机载录像，未提交视频生成。');return;}
  const status=(text:string)=>{if(!req.prefetch&&run.shot.token===token)run.videoStatus=text;};

  // 1. 内存缓存。同一段第二次拍：不花钱，不花时间。
  const cached = REELS.get(cacheKey);
  if (cached) {
    status('生成视频 · 缓存回放');
    settle(token, true, undefined, cached.creatureMissing);
    return;
  }

  if (INFLIGHT.has(cacheKey)) {
    await INFLIGHT.get(cacheKey);
    const ready=REELS.get(cacheKey);
    settle(token,!!ready,ready?undefined:'后台视频未能完成，保留机载录像。',ready?.creatureMissing);
    return;
  }
  let release!:()=>void;
  INFLIGHT.set(cacheKey,new Promise<void>(resolve=>{release=resolve;}));

  try {
    // 2. sessionStorage 里有 id：只取片，不生成。取片不计费。
    const known = loadIdMap()[remoteKey];
    let result = known?.videoId ? await fetchVideoContent(known.videoId) : null;
    let creatureMissing = result?.ok ? known?.creatureMissing ?? false : false;

    // 3. 真的得生成了。
    if (!result || !result.ok) {
      creatureMissing = false;
      if (!req.keyframe) {
        settle(token, false, '首帧遗失，无法冲洗这卷录像。请重新曝光。');
        return;
      }
      result = await requestVideo(req.prompt, undefined, req.keyframe, status => {
        if (!req.prefetch&&run.shot.token === token) run.videoStatus = status;
      }, req.duration??5,'fixed',undefined,req.harborCreatureReference?HARBOR_CREATURE_REFERENCES:[],req.kind);
    }

    // 3b. 被内容审核拦了：拿不含怪物的那一版再试一次。
    //     本作是恐怖游戏，怪物描述被驳回是常态而不是异常
    //     （实拍：溺者合唱那一段直接 "output new_sensitive"）。
    //     环境总比什么都没有好，而「那东西刚好没进这一卷」在世界观里成立。
    if (!result.ok && result.fail.kind === 'filtered' && req.fallbackPrompt !== req.prompt && !req.prompt.includes('Template: attack.')) {
      console.warn('[footage] 改用保留异常痕迹、不含身体的录像模板', result.fail.detail);
      const retry = await requestVideo(req.fallbackPrompt, undefined, req.keyframe, undefined, req.duration??5,'fixed',undefined,[],req.kind);
      if (retry.ok) {
        result = retry;
        creatureMissing = true;
      }
    }

    if (!result.ok) {
      // 技术细节只进 console，玩家看到的是世界观里的话。
      console.warn('[footage] 生成失败', result.fail);
      const detail='detail' in result.fail?result.fail.detail.slice(0,240):'';
      settle(token, false, `MiniMax ${result.fail.kind}${'status' in result.fail?' / HTTP '+result.fail.status:''}${detail?'：'+detail:'：'+failureLine(result.fail)}`);
      return;
    }

    if(isNoVideoMode()){handlePrompt(run,req);return;}
    // 4. 必须能解码才算成功。
    status('视频已下载 · 正在解码');
    const reel = await decodeReel(legId, result.blob, creatureMissing);
    if (!reel) {
      console.warn('[footage] 片子拿到了但浏览器解不开', result.videoId);
      settle(token, false, '片子在冲洗槽里卡住了，抽出来的时候已经烫得卷了边。');
      return;
    }

    // Billing duration is selected in the request; encoded playback length is not a delivery gate.
    if(!Number.isFinite(reel.video.duration)||reel.video.duration<=0){
      reel.video.pause();reel.video.removeAttribute('src');reel.video.load();URL.revokeObjectURL(reel.url);
      settle(token,false,'MiniMax 返回的视频没有有效播放时长，保留机载录像。');return;
    }
    if(req.prefetch)reel.video.pause();
    REELS.set(cacheKey, reel);
    saveId(remoteKey, result.videoId, creatureMissing);
    // State-dependent reels must not accumulate unbounded video/blob allocations.
    if (REELS.size > 12) {
      const oldest = REELS.keys().next().value!;
      const old = REELS.get(oldest)!;
      old.video.pause(); old.video.removeAttribute('src'); old.video.load();
      URL.revokeObjectURL(old.url);
      REELS.delete(oldest);
    }
    status('生成视频 · 远端回放');
    settle(token, true, undefined, creatureMissing);
  } catch (e) {
    if(isNoVideoMode()){settle(token,false,'已切换 GM 无视频模式，停止等待视频。请重新曝光，取得本地调试片；已提交任务费用无法撤销。');return;}
    console.warn('[footage] 冲洗回路异常', e);
    settle(token, false, '信号中断。冲洗槽那头没人接。');
  } finally {
    INFLIGHT.delete(cacheKey);release();
  }
}

/** 现在这一段有片子可放吗。没有就返回 null，调用方回落到程序化画面 */
export function readyReel(run: PodRun): HTMLVideoElement | null {
  const s = run.shot;
  if (s.phase !== 'ready' || !s.viewing || armOut(run.arm)) return null;
  const reel = REELS.get(s.cacheKey ?? s.legId);
  if (!reel) return null;
  // 视频还没解到第一帧的话画出来是全黑，不如先让程序化画面顶着。
  if (reel.video.readyState < 2) return null;
  present(reel.video);
  return reel.video;
}

/** 录像的字幕原文。旧存档没有 subtitles 字段时，按任务ID从同一份台词表还原。 */
function tapeSubtitles(tape:TapeRecord):readonly SubtitleLine[] {
  if(tape.subtitles?.length)return tape.subtitles;
  const e=tape.siteEvidence as {harborTask?:string;livingTask?:string;code?:string}|undefined;
  if(e?.harborTask&&e.harborTask in HARBOR_TASKS)return harborTaskSubtitles(e.harborTask as HarborTaskId);
  if(e?.livingTask&&e.livingTask in LIVING_TASKS)return livingTaskSubtitles(e.livingTask as LivingTaskId,e.code??'');
  return [];
}

const reelOffset=(reels:readonly Reel[],reel:Reel)=>reels.slice(0,Math.max(0,reels.indexOf(reel))).reduce((sum,r)=>sum+r.video.duration,0);
/** 整卷（多段合计）时间轴上的字幕；有人声区间时只铺在人声里。 */
function subtitleCues(tape:TapeRecord,reels:readonly Reel[]){
  const lines=tapeSubtitles(tape);if(!lines.length)return [];
  const total=reels.reduce((sum,r)=>sum+r.video.duration,0);
  const spans=reels.flatMap(r=>r.voice?[{start:reelOffset(reels,r)+r.voice.start,end:reelOffset(reels,r)+r.voice.end}]:[]);
  return timeSubtitles(lines,total,spans.length?{start:spans[0]!.start,end:spans.at(-1)!.end}:undefined);
}

const playbackControls=new WeakMap<PodRun,{paused:boolean}>();
const LAB_FRAMES=new Map<string,HTMLImageElement>();
/** Playback belongs to the analysis bench and follows the selected archive, not the current shot. */
const sensorReels=new WeakMap<TapeRecord,HTMLImageElement[]>();
export function drawLabRecording(ctx:CanvasRenderingContext2D,run:PodRun,w:number,h:number, localPlayback?:{time:number;paused:boolean}):string {
  if(localPlayback)playbackControls.set(run,localPlayback);
  const tape=run.selectedTape;
  const notice=(title:string,detail:string)=>{
    ctx.fillStyle='#03080b';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e4b981';ctx.font=cjk(Math.max(14,h*.065),500);
    ctx.fillText(title,w*.05,h*.42,w*.9);ctx.fillStyle='#b2c6c4';ctx.font=cjk(Math.max(12,h*.045),400);
    ctx.fillText(detail,w*.05,h*.55,w*.9);return title;
  };
  if(!tape||!tape.ready)return notice('视频生成中 · 尚未收到录像',run.videoStatus);
  if(tape.cacheKey?.startsWith('harbor-fixed:')&&!useHarborLocalVideo(tape.id.slice('harbor.task.'.length),isNoVideoMode())){const blocked=REMOTE_PLAYLISTS.get(tape.cacheKey);blocked?.reels.forEach(r=>r.video.pause());return notice('预制片仅供无视频模式使用','普通模式等待正常生成录像');}
  if(isVideoCall(tape)&&(run.at!=='lab'||labDeskState(run).tab!=='comm'||commUi(run).active!==tape.id))return notice('视频通讯','请在【通讯】页接听或回看');
  // Local evidence can be ready before the remote job. Do not present its frame loop as the requested movie.
  if(run.shot.phase==='developing' && tape.id===`tape.${run.shot.token}` && !run.shot.pendingResult && !isNoVideoMode() && VIDEO_ENABLED)
    return notice('MiniMax 视频生成中',run.videoStatus);
  const opening=isHarborOpening(tape)&&(!tape.analyzed||run.authoredSite?.evidenceStatus?.(tape.siteEvidence)?.accepted===false);
  if(opening&&(!harborOpeningOpened(tape)||run.at!=='lab'))return notice('视频通讯等待接听','到【通讯】页签接听后播放');
  const playlist=REMOTE_PLAYLISTS.get(tape.cacheKey??'');
  if(opening&&playlist&&playlist.index===playlist.reels.length-1&&playlist.reels[playlist.index]?.video.ended&&run.at==='lab'&&run.powered){
    // Chapter two registers a finished call on its own tick, without spending analysis power.
    finishHarborCall(tape);if(!tape.id.startsWith('living.task.'))run.analyzeTape();

  }

  if(playlist?.reels[playlist.index]?.video.ended&&playlist.index<playlist.reels.length-1){playlist.index++;playlist.reels[playlist.index].video.currentTime=0;}
  const reel=playlist?.reels[playlist.index]??REELS.get(tape.cacheKey??tape.legId);
  if(reel&&reel.video.readyState>=2){
    if(localPlayback?.paused)reel.video.pause();
    present(reel.video,!localPlayback?.paused&&!commUi(run).connecting);
    const cues=subtitleCues(tape,playlist?.reels??[reel]),offset=reelOffset(playlist?.reels??[reel],reel);
    const elapsed=offset+reel.video.currentTime;
    if(run.labVideoExpanded){
      const scale=Math.min(w/reel.video.videoWidth,h/reel.video.videoHeight);
      const vw=reel.video.videoWidth*scale,vh=reel.video.videoHeight*scale;
      ctx.fillStyle='#020406';ctx.fillRect(0,0,w,h);
      drawCctvSignal(ctx,w,h,reel.video,{time:performance.now()/1000,corruption:reel.video.ended||commUi(run).connecting?1:0});
      drawVideoSubtitle(ctx,cues,elapsed,(w-vw)/2,(h-vh)/2,vw,vh);
      return '监控录像 · 等比放大';
    }
    drawFootageFrame(ctx,w,h,reel.video,{time:performance.now()/1000,corruption:reel.video.ended||commUi(run).connecting?1:0,light:1});
    const subtitleScale=Math.min(w/reel.video.videoWidth,h/reel.video.videoHeight);
    const subtitleW=reel.video.videoWidth*subtitleScale,subtitleH=reel.video.videoHeight*subtitleScale;
    drawVideoSubtitle(ctx,cues,elapsed,(w-subtitleW)/2,(h-subtitleH)/2,subtitleW,subtitleH);
    return '录像回放 · 远端生成';
  }
  if(tape.sensorFrames&&tape.sensorFrames.length>=3){
    let frames=sensorReels.get(tape);
    if(!frames){frames=tape.sensorFrames.map(src=>{const frame=new Image();frame.src=src;return frame;});sensorReels.set(tape,frames);}
    const debugTape=(tape.siteEvidence as {debugNoVideo?:boolean})?.debugNoVideo===true;
    const debugSlides=debugTape&&tape.id.startsWith('abyss.debug.');
    const frameIndex=Math.floor((localPlayback?.time??run.clock)/(debugSlides?8:.5))%frames.length;
    const frame=frames[frameIndex];
    if(frame.complete&&frame.naturalWidth){
      const scale=Math.min(w/frame.naturalWidth,h/frame.naturalHeight),vw=frame.naturalWidth*scale,vh=frame.naturalHeight*scale;
      ctx.fillStyle='#020406';ctx.fillRect(0,0,w,h);ctx.drawImage(frame,(w-vw)/2,(h-vh)/2,vw,vh);
      if(debugTape)return `GM ${debugSlides?'合成文字调试片':'现场摄影调试'} · 非真实生成录像 · ${localPlayback?.paused?'已暂停':'播放中'}`;
      return `本地录像备份 · ${tape.videoError??'本卷未收到生成视频'} · ${localPlayback?.paused?'已暂停':'播放中'}`;
    }
    return debugTape?notice('读取 GM 调试片','合成剧情演算 · 非真实生成录像'):notice('读取机载感光录像','真实曝光帧序列 · 非AI生成');
  }
  return notice(tape.videoResult==='prompt'?'GM 提示词模式 · 未请求视频':'无可播放视频 · 不使用图片冒充录像',tape.videoError??'视频未生成、未加载或缓存已释放；请检查任务日志。');
}

// ============================================================================
// 降质
// ============================================================================

/** Playback monitor options; recorded exposure is independent of the current lamp. */
export interface FootageDrawOptions { time:number; corruption:number; light:number }
/** Shared colour-preserving signal for normal and expanded playback. */
export function drawFootageFrame(ctx:CanvasRenderingContext2D,w:number,h:number,video:HTMLVideoElement,opts:FootageDrawOptions):void {
 drawCctvSignal(ctx,w,h,video,{time:opts.time,corruption:opts.corruption});
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

/** Only an explicit player action rewinds a completed archive. */
export function replayLabRecording(run:PodRun){
 run.labPlaybackPauseRequested=false;const controls=playbackControls.get(run);if(controls)controls.paused=false;
 const tape=run.selectedTape;if(!tape||!run.powered)return;
 if(isVideoCall(tape)&&(run.at!=='lab'||labDeskState(run).tab!=='comm'||commUi(run).active!==tape.id))return;
 const playlist=REMOTE_PLAYLISTS.get(tape.cacheKey??'');
 for(const reel of selectedReels(run)){reel.video.pause();reel.video.currentTime=0;}
 if(playlist)playlist.index=0;
 const first=selectedReels(run)[0];if(first)playAudible(first.video);
}
/** Keep queued calls from replacing a playing or still-decoding call. */
export function labCallInProgress(run:PodRun):boolean {
 if(!commUi(run).active||run.at!=='lab')return false;
 const reels=selectedReels(run);
 return !reels.length||reels.some(reel=>!reel.video.ended);
}
/** Expand within the physical analysis CRT; never create a viewport overlay. */
export function expandLabRecording(run:PodRun){
 if(document.getElementById('harbor-door-panel')||!run.selectedTape?.ready||!run.powered||run.at!=='lab')return;
 if(isVideoCall(run.selectedTape)&&commUi(run).active!==run.selectedTape.id)return;
 run.labVideoExpanded=true;
}
