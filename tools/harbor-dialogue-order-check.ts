import assert from 'node:assert/strict';
import {HarborRescueDialogue} from '../src/pod/sim/harbor-rescue-dialogue';
import {HarborRescue,RESCUE_TIMING} from '../src/pod/sim/harbor-rescue';
import {HarborRescueNavigation,type HarborRescueNavigationHost} from '../src/pod/view/deepsea/harbor-rescue-navigation';
import type {PodRun} from '../src/pod/sim/run';

const state=()=>new HarborRescue().state;
function completeLine(d:HarborRescueDialogue,s=state(),emitting=false){return d.tick(d.currentSeconds+.001,s,emitting);}
function drain(d:HarborRescueDialogue,s=state(),emitting=false){const effects:string[]=[];let guard=100;while(d.busy&&guard--){const out=completeLine(d,s,emitting);effects.push(...out.effects);}assert.ok(guard>0);return effects;}
function idle(stage:ReturnType<HarborRescueDialogue['snapshot']>['stage']){const d=new HarborRescueDialogue();assert.equal(d.restore({version:1,stage,pending:[],active:null,remaining:0,choosing:false}),true);return d;}

// Task release waits for the final line, and rapid microphone clicks cannot skip.
const d=new HarborRescueDialogue();assert.equal(d.objective,'');assert.equal(d.reply(),true);assert.equal(d.stage,'intro');
for(let i=0;i<30;i++)assert.equal(d.reply(),false);
d.tick(0,state(),true);for(let i=0;i<3;i++){assert.equal(d.objective,'');completeLine(d,state(),true);}assert.equal(d.objective,'');assert.equal(d.stage,'intro');
completeLine(d,state(),true);assert.equal(d.stage,'stop');assert.match(d.objective,/关闭/);assert.equal(d.photoUnlocked,false);
const warning=d.tick(0,state(),false);assert.match(warning.line!,/它是什么/);assert.equal(d.stage,'warning');assert.equal(d.objective,'');
completeLine(d);const rumble=completeLine(d);assert.deepEqual(rumble.effects,['rumble']);assert.equal(d.stage,'warning');assert.equal(rumble.line,'');
completeLine(d);completeLine(d);assert.equal(d.objective,'');assert.equal(d.photoUnlocked,false);completeLine(d);assert.equal(d.stage,'photo');assert.equal(d.photoUnlocked,true);
const identified={...state(),identified:true};d.tick(0,identified,false);assert.equal(d.stage,'report');assert.match(d.objective,/麦克风/);d.tick(1000,identified,false);assert.equal(d.stage,'report');
assert.equal(d.reply(),true);assert.equal(d.objective,'');for(let i=0;i<20;i++)assert.equal(d.reply(),false);drain(d,identified);assert.equal(d.stage,'power');
let facts={...identified,powered:true};d.tick(0,facts,false);assert.equal(d.stage,'powerBrief');assert.equal(d.objective,'');drain(d,facts);assert.equal(d.stage,'open');
facts={...facts,gateOpen:true};d.tick(0,facts,false);assert.equal(d.stage,'lureBrief');drain(d,facts);assert.equal(d.stage,'lure');
d.tick(1000,facts,false);assert.equal(d.stage,'lure','unphotographed occupancy cannot publish close task');
facts={...facts,lureConfirmed:true};d.tick(0,facts,false);assert.equal(d.stage,'closeBrief');assert.equal(d.objective,'');drain(d,facts);assert.equal(d.stage,'close');
facts={...facts,isolated:true};d.tick(0,facts,false);assert.equal(d.stage,'confirmBrief');drain(d,facts);assert.equal(d.stage,'confirm');assert.deepEqual(d.dialogueChoices,[]);
assert.equal(d.reply(),true);assert.equal(d.dialogueChoices.length,3);const confirmed=d.snapshot();
for(let choice=0;choice<3;choice++){
 const variant=new HarborRescueDialogue();assert.equal(variant.restore(confirmed),true);assert.equal(variant.choose(choice),true);assert.equal(variant.choose(choice),false);assert.equal(variant.reply(),false);
 assert.equal(variant.objective,'');assert.deepEqual(drain(variant,facts),['escape']);assert.equal(variant.stage,'escape');assert.match(variant.objective,/撤离/);
 assert.deepEqual(variant.tick(20,facts,false).effects,[],'escape effect delivered once');
 variant.tick(0,{...facts,departed:true},false);drain(variant,{...facts,departed:true});assert.equal(variant.stage,'departure');variant.tick(0,{...facts,departed:true,departureConfirmed:true},false);assert.equal(variant.stage,'done');
}
// Interrupted active line retains both its end transition and one-shot effect.
for(const [stage,end,effect]of [['warning','photo','rumble'],['escapeBrief','escape','escape']] as const){
 const source=idle(stage);const snap=source.snapshot();snap.active={text:'保存中的对白',end,effect};snap.remaining=1.25;assert.equal(source.restore(snap),true);
 const restored=new HarborRescueDialogue();assert.equal(restored.restore(source.snapshot()),true);assert.equal(restored.currentLine,'保存中的对白');assert.deepEqual(restored.tick(1,state(),false).effects,[]);assert.deepEqual(restored.tick(.26,state(),false).effects,[effect]);assert.equal(restored.stage,end);assert.deepEqual(restored.tick(0,state(),false).effects,[]);
}
// Every legacy physical checkpoint has an explicit non-replayed conversation stage.
for(const [flag,expected]of [['replied','stop'],['identified','report'],['powered','open'],['gateOpen','lure'],['lureConfirmed','close'],['isolated','confirm'],['departing','escape'],['departed','departure'],['departureConfirmed','done']]as const){const legacy=new HarborRescueDialogue();legacy.migrate({...state(),[flag]:true});assert.equal(legacy.stage,expected);assert.equal(legacy.busy,false);}
// Use actual capture lifecycle: an expired entry film must not publish close.
const rescue=new HarborRescue();rescue.step(.1,{nearB:true,zone:'observe',activeSonar:false});rescue.listen();rescue.reply();const first=rescue.capture('first','threat',true);rescue.commitCapture(first);rescue.analyze(first);rescue.interact('power');rescue.interact('observe');rescue.step(RESCUE_TIMING.lure+.1,{nearB:true,zone:'lure',activeSonar:true});
const late=rescue.capture('late','lure',true);rescue.step(RESCUE_TIMING.hold+1,{nearB:true,zone:'lure',activeSonar:false});rescue.commitCapture(late);assert.equal(rescue.state.lureConfirmed,false);const stale=idle('lure');stale.tick(0,rescue.state,false);assert.equal(stale.stage,'lure');assert.doesNotMatch(stale.objective,/关闭货仓/);
const expiring=idle('closeBrief');const ex=expiring.snapshot();ex.active={text:'即将结束的旧指引',end:'close'};ex.remaining=.1;assert.equal(expiring.restore(ex),true);expiring.tick(.2,rescue.state,false);assert.equal(expiring.stage,'lure');assert.doesNotMatch(expiring.objective,/关闭货仓/);
// Receiver microphone is repeatable across phases, but not during a live beat.
const radioDialogue=new HarborRescueDialogue();
const host:HarborRescueNavigationHost={run:{heading:0}as PodRun,position:{x:60,y:0,z:27},signalAvailable:true,phase:'contact',entryCoordinates:[11,0,16],photoCoordinates:[60,0,27],serialDialogue:true,
 get canReply(){return radioDialogue.replyAvailable;},onHeard(){radioDialogue.enqueue('艾里亚斯：收到请回答。');},onReply(){return radioDialogue.reply();},drawActive(){}};
const receiver=new HarborRescueNavigation(host);assert.equal(receiver.reply(),false);receiver.setFrequency(38.4);receiver.tick(.5);assert.equal(receiver.heard,true);assert.equal(receiver.reply(),false,'distress line must finish before reply');drain(radioDialogue);assert.equal(receiver.reply(),true);assert.equal(receiver.reply(),false);
assert.equal(receiver.action('port.play'),false,'history playback cannot replay into serial conversation');
radioDialogue.restore(idle('report').snapshot());assert.equal(receiver.reply(),true,'second microphone phase works despite replied=true');assert.equal(receiver.reply(),false);
radioDialogue.restore(idle('confirm').snapshot());assert.equal(receiver.reply(),true);assert.equal(radioDialogue.dialogueChoices.length,3);
console.log('PASS dialogue order: end-gated tasks, stop/rumble/photo, report microphone, all three replies, active-line save, legacy stages, expired capture and close-brief rollback');
