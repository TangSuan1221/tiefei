import {composeBranchPrompt} from './prompt-composer';
import type {Campaign,StoryState} from './types';
export interface BranchVideoPrompt {id:string;sceneId:string;title:string;choice:string;at:number;prompt:string|null;note:string}
/** Derive only committed actions, never the editor's unselected candidates or hidden world map. */
export function branchVideoPrompts(campaign:Campaign,state:StoryState):BranchVideoPrompt[]{
 return state.events.filter(e=>e.type.startsWith('action:')).flatMap(event=>{
  const scene=campaign.scenes.find(s=>s.id===event.sceneId),choice=scene?.choices.find(c=>c.id===event.type.slice(7));
  if(!scene||!choice)return [];
  return [{id:'branch-prompt-'+event.id,sceneId:scene.id,title:scene.title,choice:choice.label,at:event.at,...composeBranchPrompt(scene,choice)}];
 });
}
