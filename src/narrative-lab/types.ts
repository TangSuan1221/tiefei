export type Atom=string|number|boolean;
export type Condition={path:string;op:'eq'|'ne'|'gte'|'lte'|'has'|'notHas';value:Atom}|{all:Condition[]}|{any:Condition[]};
export interface Effect {path:string;op:'set'|'add';value:Atom}
export interface NpcLine {speaker:'vance'|'elias'|'niko'|'lena'|'player';text:string;requires?:Condition}
export interface Choice {
 id:string;label:string;condition?:Condition;instructions:Effect[];
 /** Facts visible in the stable result recording, granted only by analysis. */
 evidence:string[];resultText:string;npcLines:NpcLine[];consequence:string;
}
export interface Resolution {id:string;label:string;condition?:Condition;instructions:Effect[];text:string}
export interface StoryScene {
 id:string;chapter:number;title:string;location:string;entryText:string;
 scoutFootage:string;scoutFacts:string[];choices:Choice[];resolveText:string;
 resolutions:Resolution[];
 plannedSeconds:{travel:number;reading:number;action:number};
 /** Requirements deliberately not claimed as shipped 3D mechanics. */
 implementationNotes?:string[];
}
export interface StoryEnding {id:string;title:string;condition:Condition;summary:string;priority:number}
export interface Chapter {id:number;title:string;depth:number;dramaticQuestion:string}
export interface Campaign {
 id:string;version:number;title:string;chapters:Chapter[];scenes:StoryScene[];endings:StoryEnding[];
 initialWorld:Record<string,Atom>;
}
export type Phase='scout'|'decision'|'result'|'resolve'|'next'|'ended';
export interface Tape {
 id:string;sceneId:string;kind:'scout'|'result';epoch:number;capturedAt:number;
 facts:string[];text:string;ready:boolean;analyzed:boolean;
 /** Locks evidence content at exposure time; no generated video in this lab. */
 source:'authored-storyboard';
}
export interface StoryEvent {id:number;at:number;sceneId:string;type:string;detail:string;causedBy?:number}
export interface StoryState {
 schemaVersion:1;campaignId:string;campaignVersion:number;
 sceneIndex:number;phase:Phase;clock:number;epoch:number;selectedChoice:string|null;selectedResolution:string|null;
 player:{alive:boolean;stress:number};pod:{power:number;hull:number;oxygen:number;armStowed:boolean};
 relations:Record<'vance'|'elias'|'niko'|'lena',{trust:number;respect:number}>;
 world:Record<string,Atom>;
 knowledge:{player:string[];vance:string[];elias:string[];niko:string[];lena:string[]};
 tapes:Tape[];activeTapeId:string|null;captureRemaining:number;developRemaining:number;
 events:StoryEvent[];endingId:string|null;
}
export interface ActionResult {ok:boolean;message:string}
export interface Candidate {id:string;allowed:boolean;reason:string;choice:Choice}
