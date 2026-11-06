import type {PodRun} from '../sim/run';
import {requestVideo,VIDEO_ENABLED} from '../net/video';
import {isLocalNoVideoMode} from '../net/no-video-mode';
import {HARBOR_CREATURE_REFERENCES} from '../content/harbor-video-references';
import {videoCreatureSubject} from '../content/video-creatures';
import {slotPrompt} from '../content/video-policy';

let busy=false;
export function previewHarborCreature(run:PodRun):string{
 if(busy)return 'GM · 怪物试拍正在生成，请勿重复提交。';
 if(run.authoredSite?.index!==0)return 'GM · 请先进入第一关，再试拍第一章怪物。';
 if(isLocalNoVideoMode())return 'GM · 请先关闭无视频模式，再执行怪物试拍（真实生成）。';
 if(!VIDEO_ENABLED)return 'GM · 视频服务未启用，无法真实试拍。';
 let frame:string|undefined;
 try{frame=run.captureKeyframe?.()??undefined;}catch{/* report below */}
 if(!frame)return 'GM · 当前机位截图不可用，未提交生成。';
 const context=run.authoredSite.videoContext?.();
 if(!context)return 'GM · 当前场景没有摄影上下文，未提交生成。';
 const prompt=slotPrompt({...context,story:false,generatedMonsters:true,
  monsters:[videoCreatureSubject('harbor','Exactly one diagnostic harbor creature')],actors:[],
  outcome:'Diagnostic appearance preview only: place the specified creature in visible open water in this camera view, preserving structural occlusion. Slow floating motion only. No attack or story event.'});
 busy=true;
 const box=document.createElement('div');box.className='gm-creature-preview';
 Object.assign(box.style,{position:'fixed',inset:'4vh 4vw',zIndex:'10000',background:'#080d10',color:'#dce8e1',padding:'16px',display:'flex',flexDirection:'column',gap:'12px'});
 const title=document.createElement('div');title.textContent='GM · 第一章怪物试拍 · 真实生成 · 不计剧情证据';
 const status=document.createElement('div');status.textContent='准备当前机位截图与怪物参考图…';
 const close=document.createElement('button');close.textContent='关闭预览（已提交任务仍会完成）';
 const video=document.createElement('video');video.controls=true;video.playsInline=true;video.muted=true;
 Object.assign(video.style,{width:'100%',minHeight:'0',flex:'1',objectFit:'contain'});
 let url:string|undefined,closed=false;
 close.onclick=()=>{closed=true;video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);box.remove();};
 box.append(title,status,video,close);document.body.append(box);
 // Direct request: no normal reel cache, archive, analysis, or story settlement.
 void requestVideo(prompt,undefined,frame,text=>{status.textContent=text;},5,'fixed',undefined,HARBOR_CREATURE_REFERENCES).then(result=>{
  if(!result.ok){status.textContent='试拍失败：'+result.fail.kind+('detail' in result.fail?' · '+result.fail.detail:'');return;}
  if(closed)return;
  url=URL.createObjectURL(result.blob);video.src=url;
  status.textContent='新片已收到 · 检查多头融合、垂落组织与工业软管；可用控件重播。';
  void video.play().catch(()=>{status.textContent+=' 点击播放查看。';});
 }).catch(error=>{status.textContent='试拍失败：'+String(error);}).finally(()=>{busy=false;});
 return 'GM · 已开始第一章怪物试拍，每次生成新片，不复用旧缓存；完成后自动播放。';
}
