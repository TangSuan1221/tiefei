import {HARBOR_TASK_REFERENCES,HARBOR_REFERENCE_REVISION} from '../../content/harbor-video-references';
import type {PodRun} from '../../sim/run';
import {HARBOR_TASK_REFERENCE,harborCaller,harborTaskPrompt,harborTaskSubtitles,harborSpeechParts,type HarborTaskId} from '../../content/harbor-task-videos';
import {requestVideo,fetchVideoContent,VIDEO_ENABLED} from '../../net/video';
import {installRemotePlaylist,hasRemotePlaylist,pauseHarborCallAway} from '../footage';
import {isNoVideoMode} from '../gm';
import {pendingCallName} from '../../sim/tape-channel';
import {HARBOR_LOCAL_VIDEOS as FIXED,harborLocalVideoKey,useHarborLocalVideo} from '../../content/harbor-local-videos';
const STORE='ironlung.harbor.task-v1';
const hash=(s:string)=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
const read=():Record<string,string|string[]>=>{try{return JSON.parse(localStorage.getItem(STORE)??'{}');}catch{return {};}};
/** Missing, failed or disabled media never advances the mission. */
export class HarborTaskPlayer {
 private mode=isNoVideoMode();private busy=false;private disposed=false;private failed=false;private abort=new AbortController();
 get waiting(){return this.busy||this.failed;}
 get retryable(){return this.failed&&!this.busy;}
 constructor(private run:PodRun){}
 retry(){if(this.busy)return '视频仍在处理中，请留意接收状态。';this.failed=false;return '已请求重新接收，请留意接收状态。';}
 tick(id:HarborTaskId|null,injured=false){
  if(this.disposed)return;
  pauseHarborCallAway(this.run);
  // Older saves named unwatched calls after their content.
  for(const t of this.run.tapes)if(t.id.startsWith('harbor.task.')&&!t.analyzed){const name=pendingCallName(harborCaller(t.id.slice(12) as HarborTaskId));if(t.siteName!==name)t.siteName=name;}
  const noVideo=isNoVideoMode();
  if(this.mode!==noVideo){this.mode=noVideo;this.abort.abort();this.failed=false;}
  if(this.busy)return;
  if(this.abort.signal.aborted)this.abort=new AbortController();
  if(this.busy||this.failed)return;
  const selected=this.run.selectedTape;
  if(selected&&useHarborLocalVideo(selected.id.slice('harbor.task.'.length),noVideo)&&(!selected.cacheKey?.startsWith('harbor-fixed:')||!hasRemotePlaylist(selected.cacheKey))){const fixedId=selected.id.slice('harbor.task.'.length) as HarborTaskId;if(FIXED[fixedId]){this.start(()=>this.deliverFixed(fixedId));return;}}
  if(noVideo){if(id&&useHarborLocalVideo(id,true)&&!this.run.tapes.some(t=>t.id==='harbor.task.'+id))this.start(()=>this.deliverFixed(id));return;}
  if(!VIDEO_ENABLED&&(!id||!useHarborLocalVideo(id,false))){this.run.videoStatus='后续任务需要视频服务 · 本地已收录像仍可播放';return;}
  if(selected?.cacheKey?.startsWith('harbor-task:')&&!hasRemotePlaylist(selected.cacheKey)){
   const videoId=read()[selected.cacheKey];if(videoId){this.start(async()=>{const blobs:Blob[]=[];for(const id of Array.isArray(videoId)?videoId:[videoId]){const r=await fetchVideoContent(id,this.abort.signal);if(!r.ok)throw Error('已保存录像下载失败');blobs.push(r.blob);}if(!this.disposed&&!isNoVideoMode())await installRemotePlaylist(selected.cacheKey!,selected.legId,blobs);});return;}
  }
  if(!id||this.run.tapes.some(t=>t.id==='harbor.task.'+id&&(!t.cacheKey?.startsWith('harbor-fixed:')||useHarborLocalVideo(id,noVideo))))return;
  this.start(()=>this.deliver(id,injured));
 }
 private start(work:()=>Promise<void>){this.busy=true;void work().catch(e=>{if(this.disposed||this.abort.signal.aborted)return;this.failed=true;this.run.videoStatus='任务录像未完成：'+String(e)+'；在通讯页点击“重新接收”';this.run.pushLog(this.run.videoStatus,'system');}).finally(()=>{this.busy=false;});}
 private async deliverFixed(id:HarborTaskId){
  if(!useHarborLocalVideo(id,isNoVideoMode()))return;
  const key=harborLocalVideoKey(id);
  this.run.videoStatus='接收视频通讯';
  const response=await fetch(FIXED[id]!,{signal:this.abort.signal});if(!response.ok)throw Error('本地任务录像读取失败');
  const frames=await installRemotePlaylist(key,this.run.leg.id,[await response.blob()]);if(this.disposed||!useHarborLocalVideo(id,isNoVideoMode()))return;
  const existing=this.run.tapes.find(t=>t.id==='harbor.task.'+id);if(existing){existing.cacheKey=key;existing.sensorFrames=frames;existing.subtitles=harborTaskSubtitles(id);existing.videoResult='video';existing.siteEvidence={harborTask:id,generated:false};}
  this.run.receiveRemoteTape({id:'harbor.task.'+id,siteName:pendingCallName(harborCaller(id)),frames,siteEvidence:{harborTask:id,generated:false},videoResult:'video',cacheKey:key,subtitles:harborTaskSubtitles(id),note:'收到视频呼叫 · 到分析台【通讯】接听'});
  this.run.videoStatus='视频通讯已收到 · 到分析台【通讯】接听';
 }
 private async deliver(id:HarborTaskId,injured:boolean){
  if(useHarborLocalVideo(id,isNoVideoMode()))return this.deliverFixed(id);
  if(isNoVideoMode())return;
  this.run.videoStatus='视频通讯 · 准备参考图';
  const response=await fetch(HARBOR_TASK_REFERENCE,{signal:this.abort.signal});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('缺少艾里亚斯任务参考图');
  const blob=await response.blob();const frame=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('参考图读取失败'));r.readAsDataURL(blob);});
  const prompt=harborTaskPrompt(id,injured),key='harbor-task:'+id+':'+hash(prompt+frame+HARBOR_REFERENCE_REVISION),saved=read(),videos:Blob[]=[],ids:string[]=[];
  const total=harborSpeechParts(id).length;
  for(let part=0;part<total;part++){
   const partKey=key+':part:'+part,jobKey=partKey+':job',cached=saved[partKey]??(part===0&&typeof saved[key]==='string'?saved[key]:undefined);
   if(typeof cached==='string'){const r=await fetchVideoContent(cached,this.abort.signal);if(!r.ok)throw Error('已有录像暂不可下载；稍后重试');videos.push(r.blob);ids.push(cached);}
   else{
    const pending=saved[jobKey];
    const r=await requestVideo(harborTaskPrompt(id,injured,part),this.abort.signal,frame,s=>{this.run.videoStatus=`本条通讯 · 第${part+1}段／共${total}段 · ${s}`;},10,'elias-selfie',{
     resumeId:typeof pending==='string'?pending:undefined,
     onSubmitted:job=>{saved[jobKey]=job;localStorage.setItem(STORE,JSON.stringify(saved));},
     onTerminalFailure:()=>{delete saved[jobKey];localStorage.setItem(STORE,JSON.stringify(saved));},
    },HARBOR_TASK_REFERENCES);
    if(!r.ok)throw Error(`第${part+1}/${total}段接收失败（${r.fail.kind}${'status' in r.fail?' / HTTP '+r.fail.status:''}）；${saved[jobKey]?'任务编号已保留，重新接收将续接':'未保留可续接任务，重新接收将重新请求'}`);
    saved[partKey]=r.videoId;delete saved[jobKey];localStorage.setItem(STORE,JSON.stringify(saved));videos.push(r.blob);ids.push(r.videoId);
   }
  }
  saved[key]=ids;localStorage.setItem(STORE,JSON.stringify(saved));
  if(this.disposed||isNoVideoMode())return;
  const frames=await installRemotePlaylist(key,this.run.leg.id,videos);if(this.disposed||isNoVideoMode())return;
  const existing=this.run.tapes.find(t=>t.id==='harbor.task.'+id);
  if(existing){existing.cacheKey=key;existing.sensorFrames=frames;existing.siteEvidence={harborTask:id,generated:true};existing.subtitles=harborTaskSubtitles(id);existing.videoResult='video';}
  if(this.run.receiveRemoteTape({id:'harbor.task.'+id,siteName:pendingCallName(harborCaller(id)),frames,siteEvidence:{harborTask:id,generated:true},videoResult:'video',cacheKey:key,subtitles:harborTaskSubtitles(id),note:'收到视频呼叫 · 到分析台【通讯】接听'}))this.run.videoStatus='视频通讯已收到 · 到分析台【通讯】接听';
 }
 dispose(){this.disposed=true;this.abort.abort();}
}
