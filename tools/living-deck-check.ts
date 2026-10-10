import assert from 'node:assert/strict';
import {LIVING_EXIT_Y,LIVING_TRIM_FLOOR_Y,type Vec3} from '../src/pod/content/living-deck-layout';
import {LivingDeck,LIVING_TIMING,type LivingCaptureSeen,type LivingResult} from '../src/pod/sim/living-deck';

const at=(d:LivingDeck,pod:Vec3,dt=.1)=>d.step(dt,{pod,heading:0,lamp:false,pulse:false,speed:0});
const wait=(d:LivingDeck,seconds:number,pod?:Vec3)=>{const out:LivingResult={events:[],damage:0,tapes:[],cues:[]};for(let t=0;t<seconds-1e-9;t+=.5){const r=d.step(.5,{pod:pod??d.state.pod,heading:0,lamp:false,pulse:false,speed:0});out.events.push(...r.events);out.tapes.push(...r.tapes);out.cues.push(...r.cues);}return out;};
const ctx={lamp:false,powered:true,armStowed:true,pulse:false};
let shots=0;
const shoot=(d:LivingDeck,seen:Partial<LivingCaptureSeen>)=>{const e=d.capture(`shot-${++shots}`,{targets:[],creatures:[],lensBlocked:false,lamp:false,gateOpen:false,alexVisible:false,...seen});d.commitCapture(e);return e;};
const P={probe:[76,0,-58.5] as Vec3,ballast:[112.5,0,32.5] as Vec3,pipe:[137.5,0,17] as Vec3,valve:[138,0,-29] as Vec3,office:[162,0,96] as Vec3,gate:[188,-1.2,52] as Vec3,atrium:[150,-1,62] as Vec3,c7:[108,0,68] as Vec3,shaft:[98,0,68] as Vec3};

function toGlass(){
 const d=new LivingDeck();assert.equal(d.state.stage,'descend');assert.ok(d.objective.length>0);
 at(d,[7,20,7]);assert.equal(d.state.stage,'descend');at(d,[7,0,7]);assert.equal(d.state.stage,'explore');
 assert.equal(d.armCollected('living.box.probe').events[0],'机械臂够不到。');
 at(d,P.probe);const r=d.armCollected('living.box.probe');
 assert.equal(d.state.probe,'carried');assert.equal(r.tapes[0]?.kind,'securityLog','the dead guard\'s recording comes with the probe');assert.ok(r.noise&&r.noise.loudness===LIVING_TIMING.armLoudness);
 assert.equal(d.armCollected('living.box.probe').events.length,0,'cannot collect twice');
 assert.equal(d.state.facts.length,0,'nothing known before analysis');d.analyzeTape(r.tapes[0]!.id);assert.ok(d.state.facts.includes('fact.vip-priority'));
 assert.equal(d.state.stage,'glass');
 at(d,P.ballast);d.armCollected('living.box.ballast');assert.equal(d.state.ballast,true);
 return d;
}
function toValve(){
 const d=toGlass();
 at(d,[120,0,7]);assert.ok(d.interact('living.pipe.intake',ctx).events[0]!.includes('太远'));
 at(d,P.pipe);const launch=d.interact('living.pipe.intake',ctx);assert.equal(d.state.probe,'launched');assert.ok(launch.cues.includes('probe.launch'));
 assert.equal(d.state.stage,'awaitAlexTape');
 assert.equal(wait(d,LIVING_TIMING.alexTape-1).tapes.length,0);const r=wait(d,1.5);
 assert.equal(r.tapes[0]?.kind,'alexIntro');assert.equal(d.state.probe,'withAlex');
 assert.deepEqual(r.tapes[0]!.shots,['alex-glass','pipe-bands','slime-wall','cocoon']);
 assert.equal(d.state.stage,'awaitAlexTape','tape must be watched first');
 assert.equal(d.state.facts.includes('fact.feed-line'),false);d.analyzeTape(r.tapes[0]!.id);assert.equal(d.state.stage,'valve');
 at(d,P.valve);return d;
}
function close(d:LivingDeck,valve:'heat'|'feed'|'cool'){at(d,[138,0,{heat:-36,feed:-29,cool:-22}[valve]]);const r=d.interact(`living.valve.${valve}`,ctx);assert.ok(r.cues.includes('valve.clank'));assert.equal(r.noise?.loudness,LIVING_TIMING.valveLoudness,'valve wheel is a loud noise burst');return r;}
function clear(d:LivingDeck){
 if(!d.state.valves.feed)close(d,'feed');assert.equal(d.state.stage,'awaitResult');
 assert.equal(wait(d,LIVING_TIMING.cleared-1).tapes.length,0);const r=wait(d,1.5);assert.equal(r.tapes[0]?.kind,'slimeCleared');assert.equal(d.state.slimeCleared,true);
 assert.equal(d.state.stage,'awaitResult');d.analyzeTape(r.tapes[0]!.id);assert.equal(d.state.stage,'atrium');
}
function finish(d:LivingDeck){
 at(d,P.atrium);assert.equal(d.state.stage,'atrium');
 at(d,P.gate);assert.equal(d.canUplink(P.gate),false,'nothing verified to push yet');
 at(d,P.office);assert.equal(d.state.stage,'code');
 const blocked=shoot(d,{targets:['living.photo.code'],lensBlocked:true});assert.equal(blocked.valid,false);assert.ok(d.analyze(blocked)[0]!.includes('遮挡'));assert.equal(d.state.codeVerified,false);
 const dark=shoot(d,{targets:['living.photo.delroy']});assert.equal(dark.valid,false,'the application form has no practical light');
 const code=shoot(d,{targets:['living.photo.code']});assert.equal(code.valid,true,'practical light over the desk');d.analyze(code);assert.equal(d.state.codeVerified,true);assert.equal(d.state.stage,'code');
 assert.equal(d.analyze(code)[0],'这份录像已经核验。');
 d.analyze(shoot(d,{targets:['living.photo.guide','living.photo.delroy'],lamp:true}));assert.equal(d.state.guideVerified,true);assert.equal(d.state.delroyVerified,true);assert.equal(d.state.stage,'uplink');
 assert.equal(d.uplink().events[0],'离闸门观察窗太远，水声链路接不上探头。');
 at(d,[188,-1.2,56]);assert.equal(d.canUplink([188,-1.2,56]),true);assert.equal(d.canUplink([188,-1.2,56.7]),false,'14 m uplink range');
 const early=shoot(d,{targets:['living.uplink.gate'],gateOpen:true,alexVisible:true});assert.equal(early.kinds.includes('gateOpen'),false,'a closed gate cannot be photographed open');
 d.uplink();assert.equal(d.state.stage,'awaitGate');assert.equal(d.uplink().events[0],'录像已经推送过去了。');
 assert.equal(wait(d,LIVING_TIMING.gate-1).cues.includes('gate.open'),false);assert.ok(wait(d,1.5).cues.includes('gate.open'));assert.equal(d.state.gateOpen,true);
 d.analyze(early);assert.equal(d.state.met,false,'pre-opening photo proves nothing');
 const noAlex=shoot(d,{targets:['living.uplink.gate'],gateOpen:true,alexVisible:false});d.analyze(noAlex);assert.equal(d.state.met,false,'Alex must be in frame');
 d.analyze(shoot(d,{targets:['living.uplink.gate'],gateOpen:true,alexVisible:true}));assert.equal(d.state.met,true);assert.equal(d.state.stage,'met');
 at(d,P.c7);assert.equal(d.state.stage,'exit');
 at(d,[98,-30,68]);assert.equal(d.complete,false);at(d,[98,LIVING_EXIT_Y-1,68]);assert.equal(d.complete,true);assert.equal(d.state.stage,'complete');assert.equal(d.objective,'');
}

// Happy path: probe → glass → feed valve → cleared → office photos → uplink → open gate photo → met → shaft.
{const d=toValve();clear(d);finish(d);
 assert.equal(d.exitAllowed(LIVING_TRIM_FLOOR_Y-5),true);
 const saved=d.snapshot(),copy=new LivingDeck();assert.equal(copy.restore(saved),true);assert.deepEqual(copy.snapshot(),saved);}

// Wrong valve V-1: nothing changes, a resident is drawn out (once); recover by reopening V-1 and closing V-2.
{const d=toValve();close(d,'heat');assert.equal(d.state.stage,'awaitResult');
 const r=wait(d,LIVING_TIMING.unchanged+.5);assert.equal(r.tapes[0]?.kind,'slimeUnchanged');assert.equal(d.state.extraLumens,1);assert.ok(r.events.some(e=>e.includes('中庭')));
 assert.equal(d.state.slimeCleared,false);d.analyzeTape(r.tapes[0]!.id);assert.equal(d.state.stage,'valve');assert.ok(d.state.facts.includes('fact.heat-not-source'));
 const again=wait(d,LIVING_TIMING.unchanged+1);assert.equal(again.tapes.length,0,'one result tape per configuration');
 close(d,'heat');assert.equal(d.state.valves.heat,false,'valve re-opens');assert.equal(d.state.pendingResult,null);close(d,'heat');
 assert.equal(d.state.stage,'awaitResult');const second=wait(d,LIVING_TIMING.unchanged+.5);assert.equal(second.tapes[0]?.id,'tape.slimeUnchanged.2');assert.equal(d.state.extraLumens,1,'extra resident only once');d.analyzeTape(second.tapes[0]!.id);
 close(d,'heat');clear(d);finish(d);}

// Wrong valve V-3: slime thickens; reopen and close V-2. Changing valves mid-wait restarts Alex's filming.
{const d=toValve();close(d,'cool');const s0=d.state.slime;const r=wait(d,LIVING_TIMING.worse+.5);assert.equal(r.tapes[0]?.kind,'slimeWorse');assert.ok(d.state.slime>s0,'warmer water feeds the slime');
 d.analyzeTape(r.tapes[0]!.id);assert.equal(d.state.stage,'valve');assert.ok(d.state.facts.includes('fact.cooling-not-source'));
 close(d,'feed');assert.equal(d.state.pendingResult,'slimeWorse','closed coolant still dominates');wait(d,30);close(d,'cool');assert.equal(d.state.pendingResult,'slimeCleared');
 assert.equal(d.state.timers.resultLeft,LIVING_TIMING.cleared,'reconfiguring restarts the result timer');clear(d);finish(d);}

// Valves closed before the probe reaches Alex: no film until he is at the slime edge, then the result is scheduled.
{const d=toGlass();at(d,P.valve);close(d,'feed');assert.equal(d.state.pendingResult,null,'nobody is filming yet');
 at(d,P.pipe);d.interact('living.pipe.intake',ctx);wait(d,LIVING_TIMING.alexTape+.5);assert.equal(d.state.pendingResult,'slimeCleared');
 const intro=d.state.tapes.find(t=>t.kind==='alexIntro')!;d.analyzeTape(intro.id);at(d,P.valve);clear(d);finish(d);}

// Ballast is always obtainable; without it the trim tank stops the pod in shaft D and the level cannot complete.
{const d=toValve();clear(d);
 const s=d.snapshot();s.collected=s.collected.filter(id=>id!=='living.box.ballast');s.ballast=false;s.stage='atrium';assert.equal(d.restore(s),true);
 assert.equal(d.exitAllowed(LIVING_TRIM_FLOOR_Y+1),true);assert.equal(d.exitAllowed(LIVING_TRIM_FLOOR_Y-.1),false);
 at(d,P.office);d.analyze(shoot(d,{targets:['living.photo.code','living.photo.guide'],lamp:true}));at(d,P.gate);d.uplink();wait(d,26);d.analyze(shoot(d,{gateOpen:true,alexVisible:true}));
 at(d,P.c7);assert.ok(d.objective.includes('配重'));at(d,[98,LIVING_EXIT_Y-1,68]);assert.equal(d.complete,false,'no ballast, no descent');
 at(d,P.ballast);assert.equal(d.armCollected('living.box.ballast').events.length,1,'ballast still on its rack late in the level');assert.equal(d.exitAllowed(-50),true);
 at(d,P.shaft);at(d,[98,LIVING_EXIT_Y-1,68]);assert.equal(d.complete,true);}

// Evidence: creatures need light and a clear lens; forged, cancelled and pending film grant nothing; photos can be retaken.
{const d=toGlass();
 const swarm=shoot(d,{creatures:['swarm'],lensBlocked:true});assert.ok(d.analyze(swarm)[0]!.includes('遮挡'));assert.deepEqual(d.state.identified,[]);
 at(d,[60,0,40]);const dark=shoot(d,{creatures:['blind']});assert.equal(dark.valid,false);
 const lit=shoot(d,{creatures:['blind','lumen'],lamp:true});d.analyze(lit);assert.deepEqual(d.state.identified.sort(),['blind','lumen']);
 const forged={...shoot(d,{targets:['living.photo.delroy']}),valid:true,kinds:['code' as const]};assert.equal(d.analyze(forged)[0],'没有这份录像的存档。');assert.equal(d.state.codeVerified,false);
 const pending=d.capture('pending',{targets:['living.photo.code'],creatures:[],lensBlocked:false,lamp:true,gateOpen:false,alexVisible:false});assert.equal(d.analyze(pending)[0],'没有这份录像的存档。','uncommitted exposure');
 d.cancelCapture('pending');d.commitCapture(pending);assert.equal(d.state.captures.some(e=>e.id==='pending'),false,'cancelled exposure stays out');
 assert.equal(d.capture(`shot-${shots}`,{targets:[],creatures:[],lensBlocked:false,lamp:true,gateOpen:false,alexVisible:false}).id,`shot-${shots}`,'same id returns the stored frame');
 at(d,[72,0,-52]);d.analyze(shoot(d,{targets:['living.box.probe']}));assert.ok(d.state.facts.includes('fact.guard-corpse'),'red practical light over the guard');
 assert.equal(d.analyzeTape('tape.fake.1')[0],'没有这卷录像。');
 assert.equal(d.interact('living.photo.code',ctx).events[0],'这需要拍下来，回分析台核验。');assert.equal(d.state.codeVerified,false,'report text never grants facts');}

// Stale gate evidence: an open-gate photo from an earlier epoch is rejected.
{const d=toValve();clear(d);at(d,P.office);d.analyze(shoot(d,{targets:['living.photo.code','living.photo.guide'],lamp:true}));at(d,P.gate);d.uplink();wait(d,26);
 const photo=shoot(d,{gateOpen:true,alexVisible:true});const s=d.snapshot();s.epoch++;assert.equal(d.restore(s),true);
 assert.ok(d.analyze(photo)[0]!.includes('现场已经改变'));assert.equal(d.state.met,false);d.analyze(shoot(d,{gateOpen:true,alexVisible:true}));assert.equal(d.state.met,true,'a retaken photo works');}

// Malformed snapshots are rejected atomically.
{const d=toValve();clear(d);const saved=d.snapshot();
 const bad=(mutate:(s:any)=>void,why:string)=>{const s=structuredClone(saved) as any;mutate(s);const before=d.snapshot();assert.equal(d.restore(s),false,why);assert.deepEqual(d.snapshot(),before,'atomic');};
 bad(s=>{s.version=2;},'version');bad(s=>{s.stage='met';},'stage disagrees with facts');bad(s=>{s.met=true;},'met without gate');
 bad(s=>{s.facts.push('fact.gate-code');s.codeVerified=true;},'verification without film');bad(s=>{s.tapes[0].lines[0]='假的';},'tampered tape');
 bad(s=>{s.tapesAnalyzed=s.tapesAnalyzed.filter((id:string)=>!id.startsWith('tape.slimeCleared'));},'fact without analyzed tape');
 bad(s=>{s.collected.push('living.box.nope');},'unknown item');bad(s=>{s.probe='carried';},'probe state vs tapes');bad(s=>{s.timers.gateLeft=5;},'gate timer without uplink');
 bad(s=>{s.slime=2;},'slime range');bad(s=>{s.pod=[0,NaN,0];},'pod');bad(s=>{s.captures.push({...s.captures[0],id:'x'});},'malformed capture');bad(s=>{s.extraLumens=1;},'extra lumen without the V-1 tape');
 assert.equal(d.restore(null),false);assert.equal(d.restore(42),false);
 const fresh=new LivingDeck();assert.equal(fresh.restore(fresh.snapshot()),true);}
console.log('PASS living deck: happy path, V-1/V-3 wrong-valve branches and recovery, valves before launch, ballast/exit gating, light/lens/forged/pending/stale evidence, re-shootable photos, atomic snapshot validation');
