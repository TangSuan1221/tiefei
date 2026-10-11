import assert from 'node:assert/strict';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
import {freshNarrative,parseNarrative,hearSafety,plantSeeds,noteInjury,receiveSafetyEvidence,paySeed,validNarrative} from '../src/pod/sim/narrative-memory';
import {LivingDeck,LIVING_TIMING} from '../src/pod/sim/living-deck';
import {LivingDialogue} from '../src/pod/sim/living-dialogue';
import {livingStory} from '../src/pod/sim/living-story';

const context={at:10,hearsDanger:false,playerHadThreatEvidence:true,injured:false,secured:false};
for(const phrase of ['没有杀死它','怪物还活着，别出来','如果我杀死了它你就出来','它死了吗？','他说怪物死了','等杀死它再出来'])assert.notEqual(parseNarrative(phrase).order,'go',phrase);
assert.equal(parseNarrative('我已经把怪物杀死了，你出来吧').claim,'dead');
assert.equal(parseNarrative('已经隔离，出来吧').claim,'sealed');
const freshRescue=()=>{const r=new HarborRescue();r.step(1,{nearB:true,zone:'observe',activeSonar:false});r.listen();r.reply();const e=r.capture('first','threat',true);r.commitCapture(e);r.analyze(e);r.interact('power');return r;};
const film=(r:HarborRescue,id:string,kind:'lure'|'gate'|'departure')=>{const e=r.capture(id,kind,true);r.commitCapture(e);r.analyze(e);return e;};
const isolate=(r:HarborRescue)=>{r.interact('observe');r.step(10,{nearB:true,zone:'lure',activeSonar:true});film(r,'entry','lure');r.interact('observe');film(r,'gate','gate');};
{
 const m=freshNarrative(),r=freshRescue();
 assert.equal(hearSafety(m,parseNarrative('它死了，出来吧'),context).action,'go');assert(r.requestDeparture());
 assert(!r.state.verified,'belief does not grant verified');
 r.step(2,{nearB:true,zone:'observe',activeSonar:false,npcThreat:true});assert(r.state.injured);assert(!r.state.departed);noteInjury(m);
 assert.equal(m.elias,'injured');assert.equal(m.partner,'keeper');assert.equal(m.trust,-2);noteInjury(m);assert.equal(m.trust,-2,'idempotent injury');
 const copy=new HarborRescue();assert(copy.restore(r.snapshot()));assert(validNarrative(JSON.parse(JSON.stringify(m))));
 assert.equal(hearSafety(m,parseNarrative('它死了出来吧'),{...context,injured:true}).action,'hold');
 isolate(r);receiveSafetyEvidence(m,'gate','sealed',20);
 assert.equal(hearSafety(m,parseNarrative('出来吧'),{...context,injured:true,secured:true}).action,'go');
 assert(r.requestDeparture());r.step(21,{nearB:true,zone:'observe',activeSonar:false,npcThreat:true});assert(r.state.departed);assert(r.state.injured);
 film(r,'shelter','departure');r.interact('exit');assert(r.state.complete,'injury has a complete escape path');
}
{
 const r=freshRescue();r.requestDeparture();r.step(1,{nearB:true,zone:'observe',activeSonar:false,npcThreat:false});r.stopDeparture();r.step(12,{nearB:true,zone:'observe',activeSonar:false,npcThreat:true});assert(!r.state.injured&&!r.state.departed,'retraction prevents encounter');
}
{
 const r=freshRescue();isolate(r);r.requestDeparture();r.step(11,{nearB:true,zone:'observe',activeSonar:false,npcThreat:true});assert(r.state.departed&&!r.state.injured,'isolated threat cannot magically injure');
 const far=freshRescue();far.requestDeparture();far.step(11,{nearB:true,zone:'observe',activeSonar:false,npcThreat:false});assert(far.state.departed&&!far.state.injured,'unsafe belief can get lucky');assert(new HarborRescue().restore(far.snapshot()));
}
{
 const m=freshNarrative();assert.equal(hearSafety(m,parseNarrative('杀死了，出来吧'),{...context,hearsDanger:true}).action,'hold');
 assert.equal(m.trust,0,'heard contradiction is not proof of intentional deceit');
 receiveSafetyEvidence(m,'old','danger',1);assert.equal(m.claims[0].disproved,false,'old film cannot contradict a later kill claim');
 const reply=receiveSafetyEvidence(m,'new','danger',12);assert(reply.length);assert.equal(m.trust,-1);receiveSafetyEvidence(m,'new','danger',12);assert.equal(m.trust,-1);
}
{
 const m=freshNarrative();plantSeeds(m,parseNarrative('我不会丢下你，帮我找事故记录'),'elias','原话');
 plantSeeds(m,parseNarrative('我会如实报告'),'vance','原话');plantSeeds(m,parseNarrative('那具尸体是谁？'),'elias','原话');
 assert.equal(m.seeds.length,4);assert(!paySeed(m,'promise',1));assert(!paySeed(m,'body',2));
 const d=new LivingDeck();d.configureStory(livingStory(m));d.step(1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});
 d.step(1,{pod:[76,0,-58.5],heading:0,lamp:false,pulse:false,speed:0});d.armCollected('living.box.probe');d.step(1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});d.interact('living.pipe.intake',{lamp:false,powered:true,armStowed:true,pulse:false});
 const out=d.step(LIVING_TIMING.alexTape+1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});
 assert(out.tapes.some(t=>t.lines.some(l=>l.includes('不会丢下'))));assert(new LivingDeck().restore(d.snapshot()),'branch tapes survive canonical validation');
 assert(paySeed(m,'promise',2));assert(!paySeed(m,'promise',2));assert.equal(m.trust,1);
 assert(m.seeds.filter(f=>f.chapter>=4).every(f=>f.status==='pending'),'late hooks remain deferred');
}
{
 const m=freshNarrative();noteInjury(m);const d=new LivingDeck();d.configureStory(livingStory(m));const dialog=new LivingDialogue();dialog.story=d.state.story;
 const lines:string[]=[];for(let i=0;i<100;i++){const o=dialog.tick(1,d.state);if(o.line)lines.push(o.line);}
 assert(lines.some(l=>l.startsWith('周岑：')));assert(!lines.some(l=>l.startsWith('艾里亚斯：')),'no healthy ghost Elias');
 d.step(1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});d.step(1,{pod:[76,0,-58.5],heading:0,lamp:false,pulse:false,speed:0});d.armCollected('living.box.probe');d.step(1,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});d.interact('living.pipe.intake',{lamp:false,powered:true,armStowed:true,pulse:false});
 const out=d.step(46,{pod:[137.5,0,17],heading:0,lamp:false,pulse:false,speed:0});assert(out.tapes[0].lines[0].startsWith('周岑：'));assert(new LivingDeck().restore(d.snapshot()));
}
console.log('PASS narrative: negation/questions, perception, unsafe departure, interrupt, physical injury, recovery, lucky escape, isolated safety, evidence delivery, delayed seeds, companion replacement and saves');

// Complete both living routes using current password-card rules, not the obsolete photo-code path.
for(const partner of ['elias','keeper'] as const){
 const m=freshNarrative();m.partner=partner;if(partner==='keeper')m.elias='injured';
 const d=new LivingDeck();d.configureStory(livingStory(m));
 const at=(pod:[number,number,number],dt=1)=>d.step(dt,{pod,heading:0,lamp:false,pulse:false,speed:0});
 at([76,0,-58.5]);const probe=d.armCollected('living.box.probe');d.analyzeTape(probe.tapes[0].id);
 at([112.5,0,32.5]);d.armCollected('living.box.ballast');at([137.5,0,17]);
 d.interact('living.pipe.intake',{lamp:false,powered:true,armStowed:true,pulse:false});const intro=at([137.5,0,17],46);d.analyzeTape(intro.tapes[0].id);
 if(partner==='keeper'){assert(d.state.facts.includes('fact.keeper-alive'));assert(!d.state.facts.includes('fact.alex-alive'));}
 at([138,0,-29]);d.interact('living.valve.feed',{lamp:true,powered:true,armStowed:true,pulse:false});
 const cleared=at([138,0,-29],121);d.analyzeTape(cleared.tapes[0].id);
 at([167,-1,101]);d.armCollected('living.photo.code');d.readPasswordCard();
 const guide=d.capture('guide',{targets:['living.photo.guide'],creatures:[],lensBlocked:false,lamp:true,gateOpen:false,alexVisible:false});d.commitCapture(guide);d.analyze(guide);
 at([188,-1.2,52]);d.uplink();at([188,-1.2,52],26);assert(d.state.gateOpen);
 const gate=d.capture('met',{targets:['living.uplink.gate'],creatures:[],lensBlocked:false,lamp:true,gateOpen:true,alexVisible:true});d.commitCapture(gate);d.analyze(gate);
 assert(d.state.met);at([98,-35,68]);assert(d.complete);assert(new LivingDeck().restore(d.snapshot()));
}
{
 const r=new HarborRescue();r.interact('power');assert(r.state.powered,'power circuit does not read player evidence');
 assert(new HarborRescue().restore(r.snapshot()),'early physical power saves');
 r.step(1,{nearB:true,zone:'observe',activeSonar:false});r.listen();r.reply();assert(r.requestDeparture(),'verbal decision before first film');
}
console.log('PASS both living branches reach the next shaft; early physical power and verbal departure do not require photographed knowledge');
