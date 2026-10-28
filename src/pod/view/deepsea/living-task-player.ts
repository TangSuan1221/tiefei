import type {PodRun} from '../../sim/run';
import {LIVING_TASKS,LIVING_TASK_REFERENCE,livingTaskPrompt,type LivingTaskId} from '../../content/living-task-videos';
import {requestVideo,fetchVideoContent,VIDEO_ENABLED,failureLine} from '../../net/video';
import {installRemotePlaylist,hasRemotePlaylist} from '../footage';
import {isNoVideoMode} from '../gm';
const STORE='ironlung.living.task-v1';
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
const memory:Record<string,string>={};
const read=():Record<string,string>=>{try{const v=JSON.parse(localStorage.getItem(STORE)??'{}');if(v&&typeof v==='object'&&!Array.isArray(v))for(const [k,id] of Object.entries(v))if(typeof id==='string')memory[k]=id;}catch{/* Memory cache still prevents duplicate submissions in this session. */}return memory;};
const remember=(key:string,id:string)=>{memory[key]=id;try{localStorage.setItem(STORE,JSON.stringify(memory));}catch{/* A quota error must not discard an already generated video. */}};
/** The source sheet contains spoiler portraits. Only its sealed, full-body front view may leave the client for chapter two. */
export async function livingSealedReference(blob:Blob):Promise<string>{
 const source=await createImageBitmap(blob);
 try{
  if(source.width!==3840||source.height!==2160)throw Error('角色参考图尺寸已变化，请更新密封人物裁切；本次不提交生成。');
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('角色参考图画布不可用');
  ctx.fillStyle='#dededb';ctx.fillRect(0,0,1280,720);
  // Fixed layout of elias-task-reference.png: first column, above the detail strip.
  const sw=source.width*.198,sh=source.height*.746,h=704,w=h*sw/sh;
  ctx.drawImage(source,0,0,sw,sh,(1280-w)/2,8,w,h);
  return canvas.toDataURL('image/png');
 }finally{source.close();}
}
/** Missing, failed or disabled media never advances the mission. */
export class LivingTaskPlayer {
 private busy=false;private disposed=false;private failed=false;private abort=new AbortController();
 /** Task the world state currently asks for, and the one being generated; a mismatch means the request went stale. */
 private wanted:LivingTaskId|null=null;private inflight:LivingTaskId|null=null;private superseded=false;
 constructor(private run:PodRun){}
 retry(){this.failed=false;return '已排队重试；已有生成任务优先下载，不重复提交。';}
 tick(id:LivingTaskId|null,code:string,injured=false){
  if(this.disposed)return;
  this.wanted=id;
  if(isNoVideoMode()){this.abort.abort();this.run.videoStatus='GM无视频诊断：剧情任务按文字自动推进，不授正式媒体证据、不保存正式进度';return;}
  // Player actions can overtake a request (camera handed over before S01 lands, valve reported before S04): drop it rather than deliver a stale order.
  if(this.busy&&this.inflight&&this.inflight!==id&&!this.superseded){this.superseded=true;this.abort.abort();this.run.videoStatus='现场进展已变化 · 作废旧任务录像，按当前状态重新请求';return;}
  if(this.abort.signal.aborted&&!this.busy)this.abort=new AbortController();
  if(!VIDEO_ENABLED){this.run.videoStatus='正式任务视频未启用，无备用影片；可显式开启GM无视频模式进行隔离诊断';return;}
  if(this.busy||this.failed)return;
  const selected=this.run.selectedTape;
  if(selected?.cacheKey?.startsWith('living-task:')&&!hasRemotePlaylist(selected.cacheKey)){
   const videoId=read()[selected.cacheKey];if(videoId){this.start(async()=>{const r=await fetchVideoContent(videoId,this.abort.signal);if(!r.ok)throw Error('已保存录像下载失败');if(!this.disposed&&!isNoVideoMode())await installRemotePlaylist(selected.cacheKey!,selected.legId,[r.blob]);});return;}
  }
  if(!id||this.run.tapes.some(t=>t.id==='living.task.'+id))return;
  this.inflight=id;this.start(()=>this.deliver(id,code,injured));
 }
 private start(work:()=>Promise<void>){this.busy=true;void work().catch(e=>{if(this.disposed||isNoVideoMode()||this.superseded)return;this.failed=true;this.run.videoStatus='任务录像未完成：'+String(e)+'；输入“重试录像”';this.run.pushLog(this.run.videoStatus,'system');}).finally(()=>{this.busy=false;this.inflight=null;this.superseded=false;});}
 private async deliver(id:LivingTaskId,code:string,injured:boolean){
  this.run.videoStatus='艾里亚斯 · 准备角色任务参考图';
  const response=await fetch(LIVING_TASK_REFERENCE,{signal:this.abort.signal});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('缺少艾里亚斯任务参考图');
  const blob=await response.blob();const frame=await livingSealedReference(blob);
  const prompt=livingTaskPrompt(id,code,injured),key='living-task:'+id+':'+hash(prompt+frame),saved=read();let video:Blob;
  if(saved[key]){const r=await fetchVideoContent(saved[key],this.abort.signal);if(!r.ok)throw Error('已有录像暂不可下载；稍后重试');video=r.blob;}
  else {const r=await requestVideo(prompt,this.abort.signal,frame,s=>{this.run.videoStatus=s;},10,'elias-selfie');if(!r.ok)throw Error(failureLine(r.fail));remember(key,r.videoId);video=r.blob;}
  if(this.disposed||isNoVideoMode()||this.wanted!==id)return;
  const frames=await installRemotePlaylist(key,this.run.leg.id,[video]);if(this.disposed||isNoVideoMode()||this.wanted!==id)return;
  if(this.run.receiveRemoteTape({id:'living.task.'+id,siteName:'艾里亚斯 · '+LIVING_TASKS[id].title,frames,siteEvidence:{livingTask:id,generated:true,...(id==='L2-S06'?{code}: {})},videoResult:'video',cacheKey:key,note:'收到艾里亚斯自拍视频 · 已自动登记，可到分析台播放'}))this.run.videoStatus='艾里亚斯任务录像已收到';
 }
 dispose(){this.disposed=true;this.abort.abort();}
}

