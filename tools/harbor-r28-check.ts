import assert from 'node:assert/strict';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
import {HarborSimpleFlow} from '../src/pod/sim/harbor-simple-flow';
import {freshNarrative} from '../src/pod/sim/narrative-memory';
import {HARBOR_R28_TASKS} from '../src/pod/content/harbor-r28-videos';
import {harborSpeechParts} from '../src/pod/content/harbor-task-videos';
import {level01} from '../src/story-pipeline/level-01';
import {validate} from '../src/story-pipeline/model';
const r=new HarborRescue(),f=new HarborSimpleFlow(r),m=freshNarrative();
assert.equal(f.pending,null);f.world.firstDoor=true;r.step(.1,{nearB:true,zone:'none',activeSonar:false});r.listen();
const accept=()=>{const id=f.pending;assert.ok(id);assert.ok(f.accept(id));return id;};
assert.equal(accept(),'L1-R28-V01');f.say('收到，是总部让我来的',m,true,0);assert.equal(accept(),'L1-R28-V02');
assert.match(f.objective,/前往第二道压力门/);
f.say('能告诉我通行码吗',m,true,0);assert.equal(f.codeAsked,false);assert.equal(f.pending,null);
f.requestCode();assert.equal(f.objective,'向艾里亚斯询问密码');assert.equal(f.pending,null,'door interaction must not send code before asking');
const beforeAsk=new HarborSimpleFlow(r);assert.ok(beforeAsk.restore(f.snapshot()));beforeAsk.sync(f.world);assert.equal(beforeAsk.objective,'向艾里亚斯询问密码');
f.say('能告诉我通行码吗',m,true,0);assert.ok(f.codeAsked);
const afterAsk=new HarborSimpleFlow(r);assert.ok(afterAsk.restore(f.snapshot()));assert.ok(afterAsk.codeAsked);
assert.equal(accept(),'L1-R28-V02-AUTH');assert.ok(f.credential);
f.say('为什么出不来',m,true,0);assert.equal(accept(),'L1-R28-V02A');assert.equal(f.tick(.1),1);assert.equal(f.tick(.1),0);
const restored=new HarborSimpleFlow(r);assert.ok(restored.restore(f.snapshot()));assert.equal(restored.tick(.1),0);
assert.equal(f.tick(2),1);assert.equal(f.tick(2),0);assert.equal(accept(),'L1-R28-V03');assert.equal(f.pending,null);
f.world.active=false;assert.equal(accept(),'L1-R28-V04');f.tick(90);assert.equal(accept(),'L1-R28-V04R');assert.equal(f.finishRepair(),false);
f.kitStored=true;f.world.kit=true;assert.ok(f.finishRepair());r.interact('power');assert.equal(accept(),'L1-R28-V05');
r.interact('observe');r.step(.1,{nearB:true,zone:'lure',activeSonar:true,monsterInside:true});assert.equal(accept(),'L1-R28-V06');
const film=(id:string,kind:'lure'|'gate')=>{const e=r.capture(id,kind,true,undefined,0,true);r.commitCapture(e);return e;};
const entry=film('entry','lure');assert.ok(f.entryCaptured);assert.equal(f.entryAnalyzed,false);f.world.atExit=true;assert.equal(accept(),'L1-R28-V07');
r.interact('observe',false,true);assert.ok(r.state.isolated);r.analyze(entry);assert.ok(f.entryAnalyzed,'entry may be analyzed after safe exit and closure');r.analyze(film('gate','gate'));
for(const t of ['还没关好，你先等','等会儿再走','你觉得关住了吗？','门开着，别出来']){f.say(t,m,false,1);assert.equal(r.state.departing,false,t);}
for(const t of ['不安全','没有关住','没成功','不能走','not safe','unsafe','not closed',"don't leave"]){
 assert.ok(f.reportEvidence());assert.equal(r.state.departing,true);
 f.say(t,m,false,1);assert.equal(r.state.departing,false,'negative report cancels departure: '+t);assert.equal(f.reportAnswered,false);
}
{
 const safeRescue=new HarborRescue();assert.ok(safeRescue.restore(r.snapshot()));
 const safeFlow=new HarborSimpleFlow(safeRescue);assert.ok(safeFlow.restore(f.snapshot()));safeFlow.world={...f.world};
 assert.ok(safeFlow.reportEvidence());safeRescue.step(11,{nearB:true,zone:'observe',activeSonar:false,monsterInside:true,chapterOne:true,revised:true});
 assert.equal(safeFlow.pending,'L1-R28-V08');assert.ok(safeFlow.accept('L1-R28-V08'));
 safeRescue.interact('exit',false,true);assert.ok(safeRescue.state.complete);assert.equal(safeRescue.state.injured,false);
}
assert.ok(f.reportEvidence());assert.ok(r.reopenCargo());assert.equal(r.state.isolated,false);r.step(3,{nearB:true,zone:'observe',activeSonar:false,monsterInside:false,npcThreat:true,chapterOne:true,revised:true});assert.ok(r.state.injured);assert.equal(r.state.departing,false);assert.equal(accept(),'L1-R28-V07R');
r.step(30,{nearB:true,zone:'observe',activeSonar:false,chapterOne:true,revised:true});assert.equal(r.state.departed,false,'injury must not bypass re-isolation');
r.step(.1,{nearB:true,zone:'lure',activeSonar:false,monsterInside:true});r.analyze(film('entry2','lure'));r.interact('observe',false,true);r.analyze(film('gate2','gate'));assert.ok(f.reportEvidence());r.step(21,{nearB:true,zone:'observe',activeSonar:false,monsterInside:true,chapterOne:true,revised:true});assert.equal(accept(),'L1-R28-V08-INJURED');r.interact('exit',false,true);assert.ok(r.state.complete);
assert.ok(new HarborRescue().restore(r.snapshot()));assert.ok(new HarborSimpleFlow(r).restore(f.snapshot()));
for(const [id,t] of Object.entries(HARBOR_R28_TASKS)){assert.equal(t.line,t.speech);assert.equal(harborSpeechParts(id as keyof typeof HARBOR_R28_TASKS).join(''),t.speech);assert.ok(!/【|XXX|八个小时|安保室/.test(t.speech));}
const issues=validate(level01);assert.equal(issues.filter(i=>i.level==='error').length,0,JSON.stringify(issues));
{
 const rescue=new HarborRescue(),flow=new HarborSimpleFlow(rescue);
 flow.world.firstDoor=true;flow.accept('L1-R28-V01');flow.identify();flow.accept('L1-R28-V02');flow.requestCode();flow.say('门怎么开',m,true,0);flow.accept('L1-R28-V02-AUTH');flow.backgroundRequested=true;flow.accept('L1-R28-V02A');flow.tick(3);flow.tick(3);
 assert.equal(flow.pending,'L1-R28-V03');flow.world.active=false;
 assert.equal(flow.pending,'L1-R28-V03','power changes cannot replace an in-flight warning clip');
 const loaded=new HarborSimpleFlow(rescue);assert.ok(loaded.restore(flow.snapshot()));loaded.world={...flow.world};
 assert.equal(loaded.pending,'L1-R28-V03','pending variant survives reload');assert.ok(loaded.accept('L1-R28-V03'));
}
console.log('PASS R28: ordered videos, door credential, two saved impacts, sonar gate, kit/repair, exit-before-analysis, unsafe reopening injury, required retry, split-route save, exact speeches and pipeline. Pure logic only.');
