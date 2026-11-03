import {abyssalVideoAuthorized} from '../../net/abyssal-video-authorization';
import type {AbyssalLabSite} from './abyssal-lab-site';
import {composeAbyssMedia} from '../../content/abyssal-media';
import {dialogueSubtitles} from '../../content/video-subtitles';
import {requestVideo,fetchVideoContent,VIDEO_ENABLED,failureLine} from '../../net/video';
import {installRemotePlaylist,hasRemotePlaylist} from '../footage';
import {isNoVideoMode} from '../gm';
import {StoryRuntime} from '../../../story-pipeline/runtime';

const STORE='ironlung.abyssal.media.v1';
const read=():Record<string,string[]>=>{try{return JSON.parse(localStorage.getItem(STORE)??'{}');}catch{return {};}};
const hash=(text:string)=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(16);};
async function plate(url:string):Promise<string>{
 const response=await fetch(url);if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('缺少地点首帧：'+url);
 const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
}
/** Serial, cached NPC delivery; failures remain pending and are never evidence. */
export class AbyssalMediaPlayer {
 private busy=false;private disposed=false;private failed=new Map<string,string>();private activeShot:string|null=null;private progress=new Map<string,string>();private abort=new AbortController();
 constructor(private site:AbyssalLabSite){}
 status(shotId:string){
  if(this.site.deliveredMedia.has(shotId))return {phase:'received',message:this.site.deliveredMedia.get(shotId)?.startsWith('gm-debug:')?'GM 合成调试片已收到（非真实录像）':'录像已收到'} as const;
  if(isNoVideoMode())return {phase:'queued',message:'GM 合成调试片等待本地制作（不调用视频服务）'} as const;
  if(!abyssalVideoAuthorized())return {phase:'disabled',message:'录像生成未启用，未提交任务'} as const;
  if(!VIDEO_ENABLED)return {phase:'disabled',message:'视频服务未启用，未提交任务'} as const;

  const failure=this.failed.get(shotId);if(failure)return {phase:'failed',message:failure} as const;
  if(this.activeShot===shotId)return {phase:'generating',message:this.progress.get(shotId)??'正在准备录像'} as const;
  return {phase:'queued',message:'录像等待提交'} as const;
 }
 private report(shotId:string,message:string){this.progress.set(shotId,message);this.site.run.videoStatus=message;}

 get retryable(){return this.failed.size>0&&!this.busy;}
 retry(){
  if(!abyssalVideoAuthorized()||!VIDEO_ENABLED||isNoVideoMode())return {ok:false,message:'录像生成未启用，未提交重试任务。'};
  if(this.busy)return {ok:false,message:'当前录像仍在处理，请查看分析台状态；没有重复提交。'};
  this.failed.clear();this.tick();return {ok:true,message:'已重试未返回录像；请查看分析台的生成状态。'};
 }
 tick(){
  if(this.disposed)return;
  if(isNoVideoMode()){
   this.abort.abort();
   const request=this.site.pendingMedia.find(r=>r.kind==='elias');
   if(request)this.deliverDebug(request.shotId);
   return;
  }
  if(this.abort.signal.aborted)this.abort=new AbortController();
  const tape=this.site.run.selectedTape,key=tape?.cacheKey;
  if(tape&&!this.busy&&!this.disposed&&VIDEO_ENABLED&&abyssalVideoAuthorized()&&key?.startsWith('abyss:')&&!hasRemotePlaylist(key)&&!this.failed.has(key)){
   const ids=read()[key];
   if(ids?.length){this.busy=true;void Promise.all(ids.map(async id=>{const r=await fetchVideoContent(id,this.abort.signal);if(!r.ok)throw Error('已保存录像暂不可下载');return r.blob;})).then(blobs=>this.disposed||isNoVideoMode()?undefined:installRemotePlaylist(key,tape.legId,blobs)).catch(error=>{if(isNoVideoMode()||this.disposed)return;this.failed.set(key,String(error));this.site.run.videoStatus='已保存录像下载失败；在分析台【通讯】点击“重新接收”再试';}).finally(()=>{this.busy=false;});return;}
  }
  if(this.busy||this.disposed||!VIDEO_ENABLED||isNoVideoMode()||!abyssalVideoAuthorized())return;
  const request=this.site.pendingMedia.find(r=>r.kind==='elias'&&!this.failed.has(r.shotId));if(!request)return;
  this.busy=true;this.activeShot=request.shotId;this.report(request.shotId,`${request.shotId} · 正在准备地点首帧`);void this.deliver(request.shotId).catch(error=>{if(isNoVideoMode()||this.disposed)return;this.failed.set(request.shotId,String(error));this.site.run.videoStatus=String(error);this.site.run.pushLog(`录像 ${request.shotId} 未完成：${String(error)}。在分析台【通讯】点击“重新接收”可继续，已完成的片段会优先复用。`,'system');}).finally(()=>{this.busy=false;this.activeShot=null;});
 }
 private deliverDebug(shotId:string){
  const request=this.site.pendingMedia.find(r=>r.shotId===shotId),frozen=new StoryRuntime(this.site.story.pipeline);
  if(!request?.snapshot||!frozen.restore(request.snapshot))return;
  const words=frozen.performance(shotId).flatMap(p=>[p.hit?.zh,p.hit?.dialogue].filter(Boolean)).join('\n');
  const lines=words.split('\n').flatMap(line=>line.match(/.{1,42}/gu)??['']);
  const frames:string[]=[],pages=Math.max(3,Math.ceil(lines.length/13)),perPage=Math.max(1,Math.ceil(lines.length/pages));
  for(let page=0;page<pages;page++){
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
   const c=canvas.getContext('2d')!;c.fillStyle='#08191b';c.fillRect(0,0,960,540);
   c.fillStyle='#e3c476';c.font='23px sans-serif';c.fillText('GM 合成调试片 · 非真实生成录像 · '+shotId,28,42);
   c.fillStyle='#d1ded7';c.font='20px sans-serif';
   lines.slice(page*perPage,page*perPage+perPage).forEach((line,i)=>c.fillText(line,28,86+i*30));
   c.fillStyle='#9aada7';c.fillText('本地剧情演算 / 不调用视频接口 / 第 '+(page+1)+' 页',28,516);
   frames.push(canvas.toDataURL('image/png'));
  }
  const accepted=this.site.run.receiveRemoteTape({id:'abyss.debug.'+shotId,siteName:'GM 合成调试片 · '+(frozen.pipeline.shots.find(s=>s.id===shotId)?.title??shotId),frames,videoResult:'prompt',siteEvidence:{shotId,generated:false,debugNoVideo:true},note:'GM 合成文字调试片，非真实录像。到分析台核验；物理操作仍须实际完成。'});
  if(accepted){this.site.deliverDebugMedia(shotId);this.site.run.videoStatus='GM 合成调试片已收到 · 未调用视频接口';}
 }
 private async deliver(shotId:string){
  const site=this.site,request=site.pendingMedia.find(r=>r.shotId===shotId),frozen=new StoryRuntime(site.story.pipeline);
  if(!request?.snapshot||!frozen.restore(request.snapshot))throw Error('录像缺少有效拍摄快照，请重新发送');
  const parts=composeAbyssMedia(frozen,shotId);if(!parts.length)throw Error('缺少录像提示词 '+shotId);
  // Freeze both performance and all first frames before starting a billable request.
  const frames=await Promise.all(parts.map(p=>plate(p.plate)));
  const key='abyss:'+shotId+':'+hash(JSON.stringify(parts.map((p,i)=>[p.prompt,p.cameraMode,p.plate,frames[i]])));
  const saved=read(),ids=saved[key]??[],blobs:Blob[]=[];
  for(let i=0;i<parts.length;i++){
   if(this.disposed||isNoVideoMode())return;
   if(ids[i]){this.report(shotId,`${shotId} ${i+1}/${parts.length} · 正在下载已生成片段`);const existing=await fetchVideoContent(ids[i],this.abort.signal);if(existing.ok){blobs.push(existing.blob);continue;}throw Error('已生成录像暂时无法下载；稍后重试，不重新计费');}
   const p=parts[i];this.report(shotId,`${shotId} ${i+1}/${parts.length} · 生成中`);
   const result=await requestVideo(p.prompt,this.abort.signal,frames[i],s=>this.report(shotId,`${shotId} ${i+1}/${parts.length} · ${s}`),p.duration,p.cameraMode);
   if(!result.ok)throw Error(failureLine(result.fail));
   ids[i]=result.videoId;saved[key]=ids;localStorage.setItem(STORE,JSON.stringify(saved));blobs.push(result.blob);
  }
  if(this.disposed||isNoVideoMode())return;
  this.report(shotId,`${shotId} · 正在解码并校验录像`);
  const samples=await installRemotePlaylist(key,site.run.leg.id,blobs);
  if(this.disposed||isNoVideoMode())return;
  site.run.receiveRemoteTape({id:'abyss.remote.'+shotId,siteName:site.story.pipeline.shots.find(s=>s.id===shotId)?.title??shotId,frames:samples,siteEvidence:{shotId,generated:true},videoResult:'video',cacheKey:key,subtitles:frozen.performance(shotId).flatMap(p=>p.hit?.dialogue?dialogueSubtitles(p.hit.dialogue):[]),note:`艾里亚斯传回${parts.length}段录像。到分析台播放并核验。`});
  site.deliverMedia(shotId,key);site.run.videoStatus='艾里亚斯录像已收到';
 }
 dispose(){this.disposed=true;this.abort.abort();}
}
