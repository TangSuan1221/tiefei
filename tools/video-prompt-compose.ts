import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {campaign} from '../src/narrative-lab/campaign';
import library from '../src/narrative-lab/prompt-library.json' with {type:'json'};
import {composeBranchPrompt,composeScoutPrompt} from '../src/narrative-lab/prompt-composer';
const args=process.argv.slice(2);
if(args[0]==='--check'){
 const keys=new Set<string>();
 for(const shot of library.shots){
  const key=shot.sceneId+'/'+shot.choiceId;assert(!keys.has(key),'duplicate '+key);keys.add(key);
  const scene=campaign.scenes.find(s=>s.id===shot.sceneId);assert(scene,'missing scene');
  const scout=shot.choiceId==='@scout';
  const choice=scene.choices.find(c=>c.id===shot.choiceId);assert(scout||choice,'missing choice');
  for(const field of ['subject','space','camera','light','audio','endState'] as const)assert(shot[field].trim(),field);
  assert.equal(shot.beats.length,3);assert(shot.sources.length);assert(shot.profiles.length);
  for(const source of shot.sources)assert(existsSync(source),source);
  assert(shot.storyboard.trim(),'missing readable storyboard');
  const result=scout?composeScoutPrompt(scene):composeBranchPrompt(scene,choice!);assert(result.prompt,result.note);
  assert.equal(scout?composeScoutPrompt({...scene,scoutFootage:scene.scoutFootage+'changed'}).prompt:composeBranchPrompt(scene,{...choice!,resultText:choice!.resultText+'changed'}).prompt,null);
 }
 for(const profile of Object.values(library.profiles))for(const source of profile.sources)assert(existsSync(source),source);
 const total=campaign.scenes.filter(s=>s.observation==='camera'||s.observation==='mobile-camera').reduce((n,s)=>n+s.choices.length,0);
 const scouts=library.shots.filter(s=>s.choiceId==='@scout').length;
 console.log(`PASS: ${keys.size-scouts}/${total} optical result shots and ${scouts} scout shots reviewed. No video API called.`);
}else{
 const scene=campaign.scenes.find(s=>s.id===args[0]);const choice=scene?.choices.find(c=>c.id===args[1]);
 if(!scene||(!choice&&args[1]!=='@scout'))throw new Error('Usage: compose-branch <sceneId> <choiceId|@scout> [--json]');
 const result=args[1]==='@scout'?composeScoutPrompt(scene):composeBranchPrompt(scene,choice!);if(!result.prompt)throw new Error(result.note);
 console.log(args.includes('--json')?JSON.stringify(result,null,2):result.prompt);
}
