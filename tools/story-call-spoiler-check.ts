import assert from 'node:assert/strict';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
import {HarborSimpleFlow} from '../src/pod/sim/harbor-simple-flow';
import {HARBOR_TASKS} from '../src/pod/content/harbor-task-videos';
import {LivingSurvey,SURVEY_CALL_X} from '../src/pod/sim/living-survey';
import {LIVING_TASKS} from '../src/pod/content/living-task-videos';
import {freshNarrative} from '../src/pod/sim/narrative-memory';
// Video before task: while a call is pending, the objective never names or paraphrases it.
const r=new HarborRescue(),f=new HarborSimpleFlow(r),m=freshNarrative();
f.world.firstDoor=true;r.step(.1,{nearB:true,zone:'none',activeSonar:false});r.listen();
const leaks=(id:keyof typeof HARBOR_TASKS)=>[HARBOR_TASKS[id].title,'被困','声纳与未知生物','持续发声','停稳摄影','分路','受伤'].filter(w=>f.objective.includes(w)&&!f.accepted.some(a=>HARBOR_TASKS[a].line.includes(w)));
const seen:string[]=[];
const step=()=>{const id=f.pending;assert.ok(id);assert.deepEqual(leaks(id),[],id+': '+f.objective);if(!f.accepted.includes('L1-R28-V02'))assert.ok(!f.objective.includes('艾里亚斯'),id+' names Elias early');seen.push(id);assert.ok(f.accept(id));};
step();f.say('收到',m,true,0);step();f.requestCode();f.say('门的密码是多少',m,true,0);step();
assert.ok(!/被困/.test(f.objective),'no hint about V02A content');f.say('你怎么会在这里',m,true,0);step();
f.tick(.1);assert.equal(f.objective,'艇壳受到撞击','no sonar order before V03');f.tick(2);step();
assert.ok(!/持续发声/.test(f.objective),'V03A explanation not leaked');
f.world.active=false;step();f.kitStored=true;f.world.kit=true;f.finishRepair();r.interact('power');step();
r.interact('observe');r.step(.1,{nearB:true,zone:'lure',activeSonar:true,monsterInside:false});
assert.ok(!/摄影/.test(f.objective),'no photo order before V06: '+f.objective);
console.log('PASS chapter one: pending objectives never preview',seen.join(' '));
// Chapter two
const s=new LivingSurvey();s.operate('body');s.tick(1,SURVEY_CALL_X);
const check=()=>{const id=s.pending;assert.ok(id);for(const w of [LIVING_TASKS[id].title,'菌群','会合'])assert.ok(!s.objective.includes(w),id+': '+s.objective);assert.ok(s.acceptVideo(id));};
check();s.operate('transfer');check();
s.photos.push(0,1);check();s.helpReplied=true;s.manual=true;s.valve=true;s.closedAt=0;s.reported=true;check();
console.log('PASS chapter two: pending objectives never preview S01/S02/S03/S05');
