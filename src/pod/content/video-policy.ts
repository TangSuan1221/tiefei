import {storyVideoDuration,VIDEO_DURATION_REVISION,type VideoKind} from './video-duration';
/** Authored optical facts, never inferred from dialogue or sonar colour. */
export interface VideoContext {
 videoKind?:VideoKind; duration?:number; speech?:string;
 generatedMonsters?:boolean; story:boolean; settled:boolean; stateKey:string; prefetchKey?:string; nearestMonster:number;
 scene:string; actors:string[]; monsters:string[]; outcome:string;
}
export const VIDEO_MONSTER_RADIUS=30;
export function videoPolicy(c:VideoContext){return {kind:c.videoKind??'observation',duration:c.videoKind==='story'?storyVideoDuration(c.speech,c.outcome,c.duration):5,allowed:c.story||c.nearestMonster<=VIDEO_MONSTER_RADIUS} as const;}
export function slotPrompt(c:VideoContext):string {
 return [
  'AUTHORITATIVE SHOT SLOTS. These slots replace all generic fauna and story suggestions.',
  'DURATION_SECONDS: '+videoPolicy(c).duration,
  'LOCATION: '+c.scene,
  'HUMAN_SUBJECTS: '+(c.actors.join('; ')||'none visible; do not add a person'),
  'MONSTER_SUBJECTS: '+(c.monsters.join('; ')||'none visible; do not invent a creature'),
  'CURRENT_RESULT: '+c.outcome,
  c.generatedMonsters?'ENVIRONMENT_ONLY_REFERENCE: The primary environment image deliberately contains no monster model. Additional anatomy reference images define creature appearance. Preserve the environment, people, camera and occlusion. Generate only the explicitly listed MONSTER_SUBJECTS inside that environment; an empty monster list means add none. The creature must be present naturally, never materialize or fade in. No unseen past action, new injury, rescue, death or door transition.':'Preserve the supplied first frame, anatomy, scale, clothing, subject count, camera and occlusion. Animate only this existing situation. No unseen past action, no new injury, rescue, death or door transition.',
  'Unless explicitly described as ordinary fauna, every MONSTER_SUBJECT is an abyssal Lovecraftian deep-sea organism shaped by crushing pressure and total darkness, with exactly the fins, membranes, gills, tissue and eyes its slot describes. It swims, glides, drifts or clings in the water; it never stands, walks, runs or crawls on legs. Never render a land animal, reptile, lizard, crocodile, dinosaur, amphibian, mammal, dog, insect, pet, cartoon animal, shark or dolphin, and never swap one specified subject for another species. No smiling faces or friendly mascot styling. No cuts, subtitles or written slot labels.'
 ].join(' ');
}
export function videoContextKey(c:VideoContext,pose:unknown):string {return JSON.stringify([VIDEO_DURATION_REVISION,videoPolicy(c),c.generatedMonsters??false,c.stateKey,c.story,c.scene,c.actors,c.monsters,c.outcome,pose]);}
