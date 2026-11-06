import {storyVideoDuration} from './video-duration';
import source from '../../../docs/video-prompts/level-03-abyssal-lab.md?raw';
import {lockVideoCamera,type VideoCameraMode} from './fixed-camera';
import {eliasTaskReference} from './elias-video-atoms';
import type {StoryRuntime} from '../../story-pipeline/runtime';

const sections=source.replace(/\r\n/g,'\n').split(/^## /m).slice(1);
const block=(part:string,name:string)=>part.match(new RegExp('```'+name+'\\n([\\s\\S]*?)\\n```'))?.[1]?.trim()??'';
const rules=sections.find(s=>s.startsWith('VR-301'))!;
const profiles=sections.find(s=>s.startsWith('VR-303'))!;
const profile:Record<string,string>={elias:block(profiles,'elias-profile'),caretaker:block(profiles,'caretaker-profile'),eels:block(profiles,'eel-profile'),jellies:block(profiles,'jelly-profile')};
export interface AbyssMediaPart {id:string;prompt:string;plate:string;duration:number;cameraMode:VideoCameraMode}
/** The checked production prompt document is the sole prompt source. */
export function composeAbyssMedia(story:StoryRuntime,shotId:string):AbyssMediaPart[]{
 const performance=new Map(story.performance(shotId).map(x=>[x.slot,x.hit?.key]));
 const probe=shotId.startsWith('L3-E');
 const matched=sections.filter(s=>s.startsWith('VP-')&&s.match(/镜头：(L3-[EP]\d{2}[A-Z]?)/)?.[1]===shotId);
 if(!matched.length)return [];
 const bodies=matched.map(s=>{
   const slots:Record<string,Record<string,string>>=JSON.parse(block(s,'slots')||'{}');
   let body=block(s,'prompt');
   for(const [name,values] of Object.entries(slots)){const selected=performance.get(name);if(!selected||!values[selected])throw Error(`${shotId}: unresolved performance ${name}`);body=body.replaceAll('{'+name+'}',values[selected]);}
   return body;
 });
 // Historical document sections are ordered beats of ONE recording, never jobs.
 let body=bodies.map(b=>b.replace(/\b\d+-\d+ s\s*/g,'').replace(/^CAMERA:.*$/gm,'')).join('\nNEXT ACTION (same recording, no restart):\n');
 for(const [name,value]of Object.entries(profile)){
  let included=false;body=body.replaceAll('{'+name+'}',()=>{if(included)return '';included=true;return value;});
 }
 if(/\{[a-z]+\}/.test(body))throw Error(`${shotId}: unresolved prompt slot`);
 const cameraMode:VideoCameraMode=probe&&shotId!=='L3-E10'?'elias-selfie':'fixed';
 if(shotId==='L3-E10'){
  // One fixed view must show the incident and reveal without four camera restarts.
  body=body.replace(/the frame jolts as the probe is knocked loose\./g,'the fixed camera keeps recording.')
   .replace(/END: the probe tumbles; the image blurs\./g,'')
   .replace(/his head is off the bottom edge of the frame/g,'his head remains visible within the fixed frame')
   .replace(/close on his bare face in the water/g,'his bare face remains visible in the water');
  body+='\nCAMERA: One stationary floor-level view includes the diver, table, helmet rack and valve throughout. All ordered actions happen within this frame; never drop, move or reframe the camera.';
 }
 const speech=story.performance(shotId).map(x=>x.hit?.dialogue??'').join(' ');
 const duration=probe?storyVideoDuration(speech,bodies.join(' ')):5;
 const prefix=block(rules,probe?(cameraMode==='fixed'?'fallen-probe-prefix':'probe-prefix'):'pod-prefix').replace(/ten-second/g,'continuous');
 const prompt=lockVideoCamera([prefix,`DURATION_SECONDS: ${duration}. One complete recording; perform each ordered action once, without repetition.`,body,block(rules,'suffix')].join('\n'),cameraMode);
 if(prompt.length>7000)throw Error(`${shotId}: complete prompt exceeds 7000 characters; do not split the recording`);
 return [{id:shotId,prompt,plate:probe?eliasTaskReference(shotId,shotId==='L3-E10'?1:0):'',duration,cameraMode}];
}
