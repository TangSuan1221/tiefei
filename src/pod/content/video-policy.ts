/** Authored optical facts, never inferred from dialogue or sonar colour. */
export interface VideoContext {
 generatedMonsters?:boolean; story:boolean; settled:boolean; stateKey:string; prefetchKey?:string; nearestMonster:number;
 scene:string; actors:string[]; monsters:string[]; outcome:string;
}
export const VIDEO_MONSTER_RADIUS=30;
export function videoPolicy(c:VideoContext){return {duration:c.story?10:5,allowed:c.story||c.nearestMonster<=VIDEO_MONSTER_RADIUS} as const;}
export function slotPrompt(c:VideoContext):string {
 return [
  'AUTHORITATIVE SHOT SLOTS. These slots replace all generic fauna and story suggestions.',
  'DURATION_SECONDS: '+videoPolicy(c).duration,
  'LOCATION: '+c.scene,
  'HUMAN_SUBJECTS: '+(c.actors.join('; ')||'none visible; do not add a person'),
  'MONSTER_SUBJECTS: '+(c.monsters.join('; ')||'none visible; do not invent a creature'),
  'CURRENT_RESULT: '+c.outcome,
  c.generatedMonsters?'ENVIRONMENT_ONLY_REFERENCE: The reference deliberately contains no monster model. Preserve the environment, people, camera and occlusion. Generate only the explicitly listed MONSTER_SUBJECTS inside that environment; an empty monster list means add none. The creature must be present naturally, never materialize or fade in. No unseen past action, new injury, rescue, death or door transition.':'Preserve the supplied first frame, anatomy, scale, clothing, subject count, camera and occlusion. Animate only this existing situation. No unseen past action, no new injury, rescue, death or door transition.',
  'Never substitute sharks, dolphins, cute fish, pets, cartoon animals or generic sea fauna for a specified monster. No smiling faces, friendly mascot styling or new species. No cuts, subtitles or written slot labels.'
 ].join(' ');
}
export function videoContextKey(c:VideoContext,pose:unknown):string {return JSON.stringify([c.generatedMonsters??false,c.stateKey,c.story,c.scene,c.actors,c.monsters,c.outcome,pose]);}
