import source from '../../../docs/video-prompts/level-03-abyssal-lab.md?raw';
import {lockVideoCamera,type VideoCameraMode} from './fixed-camera';
import {eliasTaskReference} from './elias-video-atoms';
import type {StoryRuntime} from '../../story-pipeline/runtime';

const sections=source.replace(/\r\n/g,'\n').split(/^## /m).slice(1);
const block=(part:string,name:string)=>part.match(new RegExp('```'+name+'\\n([\\s\\S]*?)\\n```'))?.[1]?.trim()??'';
const rules=sections.find(s=>s.startsWith('VR-301'))!;
const profiles=sections.find(s=>s.startsWith('VR-303'))!;
const profile:Record<string,string>={elias:block(profiles,'elias-profile'),caretaker:block(profiles,'caretaker-profile'),eels:block(profiles,'eel-profile'),jellies:block(profiles,'jelly-profile')};
export interface AbyssMediaPart {id:string;prompt:string;plate:string;duration:5|10;cameraMode:VideoCameraMode}
/** The checked production prompt document is the sole prompt source. */
export function composeAbyssMedia(story:StoryRuntime,shotId:string):AbyssMediaPart[]{
 const performance=new Map(story.performance(shotId).map(x=>[x.slot,x.hit?.key]));
 const probe=shotId.startsWith('L3-E');
 return sections.filter(s=>s.startsWith('VP-')&&s.match(/镜头：(L3-[EP]\d{2}[A-Z]?)/)?.[1]===shotId).map((s,index)=>{
   const id=s.split(' ')[0],slots:Record<string,Record<string,string>>=JSON.parse(block(s,'slots')||'{}');
   let body=block(s,'prompt');
   for(const [name,values] of Object.entries(slots)){const selected=performance.get(name);if(!selected||!values[selected])throw Error(`${shotId}: unresolved performance ${name}`);body=body.replaceAll('{'+name+'}',values[selected]);}
   for(const [name,value]of Object.entries(profile))body=body.replaceAll('{'+name+'}',value);
   if(/\{[a-z]+\}/.test(body))throw Error(`${shotId}: unresolved prompt slot`);
   const cameraMode:VideoCameraMode=probe&&!['VP-313','VP-314','VP-315'].includes(id)?'elias-selfie':'fixed';
   const prefix=block(rules,probe?(cameraMode==='fixed'?'fallen-probe-prefix':'probe-prefix'):'pod-prefix');
   const prompt=lockVideoCamera([prefix,body,block(rules,'suffix')].join('\n'),cameraMode);
   if(prompt.length>(probe?3600:2200))throw Error(`${id}: prompt exceeds approved limit`);
   return {id,prompt,plate:probe?eliasTaskReference(shotId,index):'',duration:probe?10:5,cameraMode};
 });
}
