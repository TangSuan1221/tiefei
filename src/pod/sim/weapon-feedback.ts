export type WeaponId='decoy'|'pulse';
export interface CombatRecord {weapon:WeaponId;encounter:number;at:number;creature:string;appearance:string;hit:boolean;result:string;outcome?:'missed'|'interrupted'|'returned'|'repelled';}
export function combatOutcomeClause(record:CombatRecord):string{
 const outcome=record.outcome??(record.hit?'interrupted':'missed');
 if(outcome==='repelled')return 'Confirmed repelled, not killed: show the creature turning away and swimming farther from the camera through an EXISTING visible opening, shrinking in apparent size; finish on empty water where it was. No renewed approach, no teleport or death.';
 if(outcome==='returned')return 'NOT repelled: the brief interruption has ended. Show the same creature resuming directed approach toward the camera, growing in apparent size. It remains a threat; do not depict successful escape or a kill.';
 if(outcome==='missed')return 'NOT repelled: the device missed. Show the creature continuing its approach without injury. Do not replay a new launch or add an explosion.';
 return 'Temporarily interrupted, NOT repelled: the creature is still nearby, recoiling or reorienting but remaining visibly present. It does not leave the area. No kill or successful expulsion.';
}
export function encounterVideoPrompt(mode:'analysis'|'combat',appearance:string,interior:string,lamp:boolean,record?:CombatRecord){
 return [
  `Template: ${mode==='combat'?'combat-feedback':'monster-analysis'}. One continuous five-second underwater hull-camera video, not a still image. Preserve the supplied first-frame architecture and camera perspective. ${interior}`,
  `One specified creature only: ${appearance}. Keep its anatomy readable against dark water.`,
  mode==='combat'&&record?`Post-action verification, NOT a replay of firing. Device previously used=${record.weapon}; hit=${record.hit}. ${combatOutcomeClause(record)} Show a readable continuous change across seconds 1–5. Do not substitute falling debris, a static portrait or symbols for the creature response.`:'Observe the creature moving naturally and its response to the existing environment. Show body structure and locomotion. No weapon impact, explosion, invented injury or combat.',
  lamp?'The camera floodlight reveals readable midtones.':'Floodlight off; sensitive camera exposure retains readable silhouette and existing practical light, never a completely black image.',
  'Restrained analogue noise; rust orange, bone white and blue-black. No text, numbers, runes, UI, symbols or captions. No new doors or extra creatures. This is recorded evidence, not a cinematic cutscene.'
 ].join(' ');
}
