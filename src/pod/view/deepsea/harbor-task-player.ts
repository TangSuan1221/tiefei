import type {PodRun} from '../../sim/run';
import {HARBOR_TASKS,HARBOR_TASK_REFERENCE,harborTaskPrompt,type HarborTaskId} from '../../content/harbor-task-videos';
import {requestVideo,fetchVideoContent,VIDEO_ENABLED,failureLine} from '../../net/video';
import {installRemotePlaylist,hasRemotePlaylist,pauseHarborCallAway} from '../footage';
import {isNoVideoMode} from '../gm';
const STORE='ironlung.harbor.task-v1';
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
const read=():Record<string,string>=>{try{return JSON.parse(localStorage.getItem(STORE)??'{}');}catch{return {};}};
/** Missing, failed or disabled media never advances the mission. */
export class HarborTaskPlayer {
 private busy=false;private disposed=false;private failed=false;private abort=new AbortController();
 constructor(private run:PodRun){}
 retry(){this.failed=false;return '已排队重试；已有生成任务优先下载，不重复提交。';}
 tick(id:HarborTaskId|null,injured=false){
  if(this.disposed)return;
  pauseHarborCallAway(this.run);
  if(isNoVideoMode()){this.abort.abort();this.run.videoStatus='GM无视频诊断：剧情任务按文字自动推进，不授正式媒体证据、不保存正式进度';return;}
  if(this.abort.signal.aborted)this.abort=new AbortController();
  if(!VIDEO_ENABLED){this.run.videoStatus='正式任务视频未启用，无备用影片；可显式开启GM无视频模式进行隔离诊断';return;}
  if(this.busy||this.failed)return;
  const selected=this.run.selectedTape;
  if(selected?.cacheKey?.startsWith('harbor-task:')&&!hasRemotePlaylist(selected.cacheKey)){
   const videoId=read()[selected.cacheKey];if(videoId){this.start(async()=>{const r=await fetchVideoContent(videoId,this.abort.signal);if(!r.ok)throw Error('已保存录像下载失败');if(!this.disposed&&!isNoVideoMode())await installRemotePlaylist(selected.cacheKey!,selected.legId,[r.blob]);});return;}
  }
  if(!id||this.run.tapes.some(t=>t.id==='harbor.task.'+id))return;
  this.start(()=>this.deliver(id,injured));
 }
 private start(work:()=>Promise<void>){this.busy=true;void work().catch(e=>{if(this.disposed||isNoVideoMode())return;this.failed=true;this.run.videoStatus='任务录像未完成：'+String(e)+'；输入“重试录像”';this.run.pushLog(this.run.videoStatus,'system');}).finally(()=>{this.busy=false;});}
 private async deliver(id:HarborTaskId,injured:boolean){
  this.run.videoStatus='艾里亚斯 · 准备角色任务参考图';
  const response=await fetch(HARBOR_TASK_REFERENCE,{signal:this.abort.signal});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('缺少艾里亚斯任务参考图');
  const blob=await response.blob();const frame=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('参考图读取失败'));r.readAsDataURL(blob);});
  const prompt=harborTaskPrompt(id,injured),key='harbor-task:'+id+':'+hash(prompt+frame),saved=read();let video:Blob;
  if(saved[key]){const r=await fetchVideoContent(saved[key],this.abort.signal);if(!r.ok)throw Error('已有录像暂不可下载；稍后重试');video=r.blob;}
  else {const r=await requestVideo(prompt,this.abort.signal,frame,s=>{this.run.videoStatus=s;},10,'elias-selfie');if(!r.ok)throw Error(failureLine(r.fail));saved[key]=r.videoId;localStorage.setItem(STORE,JSON.stringify(saved));video=r.blob;}
  if(this.disposed||isNoVideoMode())return;
  const frames=await installRemotePlaylist(key,this.run.leg.id,[video]);if(this.disposed||isNoVideoMode())return;
  if(this.run.receiveRemoteTape({id:'harbor.task.'+id,siteName:'艾里亚斯 · '+HARBOR_TASKS[id].title,frames,siteEvidence:{harborTask:id,generated:true},videoResult:'video',cacheKey:key,note:id==='L1-E01'?'接驳岗有视频呼叫 · 到分析台接听':'收到艾里亚斯自拍视频 · 已自动登记，可到分析台播放'}))this.run.videoStatus='艾里亚斯任务录像已收到';
 }
 dispose(){this.disposed=true;this.abort.abort();}
}
