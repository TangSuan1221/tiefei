import assert from 'node:assert/strict';
import {LIVING_MAIN_ROUTE,LIVING_SPACES,livingSolids,type Vec3} from '../src/pod/content/living-deck-layout';
import {LivingCreatures,LIVING_CREATURE_TUNING as T,SHADE_RETREAT,livingLineOfSight,podHullGap,type CreatureInput,type CreatureResult} from '../src/pod/sim/living-creatures';

function rng(seed:number){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};}
const solids=livingSolids();
const inSolid=(p:Vec3)=>solids.some(b=>p.every((v,i)=>v>b.min[i]!+.02&&v<b.max[i]!-.02));
const inPodSpace=(p:Vec3)=>LIVING_SPACES.some(s=>s.pod&&p[0]>=s.minX&&p[0]<=s.maxX&&p[1]>=s.floorY&&p[1]<=s.ceilY&&p[2]>=s.minZ&&p[2]<=s.maxZ);
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const input=(pod:Vec3,heading:number,o:Partial<CreatureInput>={}):CreatureInput=>({pod,heading,lampOn:false,lampRange:26,lampHalfAngle:.72,pulse:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0,...o});
const view=(c:LivingCreatures,id:string)=>c.views.find(v=>v.id===id)!;
let wallSamples=0;
/** Steps in 0.05 s ticks and proves every creature move stays in pod space and never crosses a solid. */
function run(c:LivingCreatures,seconds:number,inp:CreatureInput|((t:number)=>CreatureInput),each?:(r:CreatureResult,t:number)=>void){
 let prev=new Map(c.views.map(v=>[v.id,v.position]));
 for(let t=0;t<seconds-1e-9;t+=.05){
  const r=c.tick(.05,typeof inp==='function'?inp(t):inp);
  for(const v of c.views){
   assert.ok(inPodSpace(v.position),`${v.id} left pod space at ${v.position.map(n=>n.toFixed(2))}`);
   assert.ok(!inSolid(v.position),`${v.id} inside a wall at ${v.position.map(n=>n.toFixed(2))}`);
   const p=prev.get(v.id);if(p&&v.mode!=='cling')assert.ok(livingLineOfSight(p,v.position),`${v.id} crossed a wall ${p.map(n=>n.toFixed(2))}→${v.position.map(n=>n.toFixed(2))}`);
   wallSamples++;
  }
  prev=new Map(c.views.map(v=>[v.id,v.position]));
  each?.(r,t);
 }
}
const faceTo=(from:Vec3,to:Vec3)=>(Math.atan2(to[0]-from[0],-(to[2]-from[2]))*180/Math.PI+360)%360;

// Close encounters: no instant hit on activation, bounded disengagement, and a usable relight window.
{
 const c=new LivingCreatures(rng(101)),p:Vec3=[120,-6,70];
 let damage=0;
 run(c,.05,input(p,0,{pulse:true}),r=>{damage+=r.damage;});
 run(c,2.75,input(p,0),r=>{damage+=r.damage;});
 assert.equal(damage,0,'even a nearby blind hunter must give 3 seconds of warning');
 run(c,12,input(p,0),r=>{damage+=r.damage;});
 assert.equal(damage,0,'silencing during the warning prevents the ram');
 assert.notEqual(view(c,'blind.a1').mode,'hunt','silence ends pursuit');
 const l=new LivingCreatures(rng(102)),lp:Vec3=[40,4,-10];
 run(l,2.8,input(lp,0,{lampOn:true}),r=>assert(!r.clinging.includes('lumen.r1'),'no immediate attachment on lamp activation'));
 run(l,4.2,input(lp,0));
 assert.equal(view(l,'lumen.r1').mode,'return','lamp off cancels approach within 4 seconds');
 run(l,12,input(lp,0,{lampOn:true}),r=>assert(!r.clinging.includes('lumen.r1'),'relighting leaves time to operate and expose film'));
}

// Lumen: follows the lamp, clings, releases 4 s after dark, then retreats home ignoring the lamp for `shy` s.
{
 const c=new LivingCreatures(rng(1)),pod:Vec3=[36,0,-6],home=view(c,'lumen.r1').position;
 run(c,5,input(pod,faceTo(pod,home)));
 assert.equal(view(c,'lumen.r1').mode,'idle','dark lamp does not attract');
 let clungAt=-1,damage=0;
 run(c,30,input(pod,faceTo(pod,home),{lampOn:true}),(r,t)=>{damage+=r.damage;if(clungAt<0&&r.clinging.includes('lumen.r1')){clungAt=t;assert.ok(r.lensBlocked&&r.armBlocked,'clinging blocks lens and arm');}});
 assert.ok(clungAt>0,'lumen reaches and clings to the lit pod');
 assert.ok(damage>=T.lumen.clingDamage-1e-9,'clinging slowly cracks the hull');
 let released=-1;
 run(c,6,input(pod,0),(r,t)=>{if(released<0&&!r.clinging.includes('lumen.r1'))released=t;});
 assert.ok(released>3.8&&released<4.3,`releases 4 s after lamp off (${released.toFixed(2)})`);
 assert.equal(view(c,'lumen.r1').mode,'return','after letting go it retreats home instead of lingering at the hull');
 let reclung=false;
 run(c,T.lumen.shy-2,input(pod,faceTo(pod,home),{lampOn:true}),r=>{if(r.clinging.includes('lumen.r1'))reclung=true;});
 assert.ok(!reclung,'shy window: relighting right after release does not re-smother the lens');
 run(c,80,input([30,0,7.5],90));assert.equal(view(c,'lumen.r1').mode,'idle','back on its haunt');
}
{
 const c=new LivingCreatures(rng(2)),pod:Vec3=[30,0,7.5],far=view(c,'lumen.r1').position;
 run(c,2,input([36,0,0],faceTo([36,0,0],far),{lampOn:true}));
 assert.equal(view(c,'lumen.r1').mode,'seek','lamp cone draws it from range');
 let left=-1;
 run(c,10,input(pod,90),(_,t)=>{if(left<0&&view(c,'lumen.r1').mode==='return')left=t;});
 assert.ok(Math.abs(left-T.lumen.linger)<.15,`light loss starts a bounded retreat timer (${left.toFixed(2)})`);
 const behind=new LivingCreatures(rng(3));run(behind,5,input([36,0,-6],(faceTo([36,0,-6],far)+180)%360,{lampOn:true}));
 assert.equal(view(behind,'lumen.r1').mode,'idle','lamp pointed away beyond 8 m does not attract');
 const wall=new LivingCreatures(rng(4));run(wall,5,input([40,0,7.5],180,{lampOn:true}));
 assert.equal(view(wall,'lumen.r1').mode,'idle','lamp light does not pass through walls');
}

// Shade: 3 s glare to recoil, stays hidden while lit, returns after 25 s dark, blocks the doorway and bites in the dark.
{
 const c=new LivingCreatures(rng(5)),pod:Vec3=[107,0,7.5];
 assert.equal(c.blockers().length,1,'shade blocks the C3-R4 doorway');
 const b=c.blockers()[0]!;assert.ok(b.min[0]<=103.6&&b.max[0]>=110.4,'blocker spans the 8 m doorway (pod 2.8 m cannot slip by)');
 let recoiledAt=-1;
 run(c,6,input(pod,180,{lampOn:true}),(r,t)=>{if(recoiledAt<0&&view(c,'shade.r4').mode==='recoil'){recoiledAt=t;assert.ok(r.cues.includes('creature.skitter'));}});
 assert.ok(recoiledAt>2.85&&recoiledAt<3.15,`recoils after 3 s glare (${recoiledAt.toFixed(2)})`);
 assert.equal(c.blockers().length,0,'retreated shade no longer blocks');
 run(c,20,input(pod,180,{lampOn:true}));
 assert.ok(dist(view(c,'shade.r4').position,SHADE_RETREAT)<.5,'hides in the north-east vent');
 const watch:Vec3=[110,0,20];
 run(c,60,input(watch,faceTo(watch,SHADE_RETREAT),{lampOn:true}),()=>assert.equal(view(c,'shade.r4').mode,'recoil','stays hidden while lit'));
 let returned=-1;
 run(c,30,input(pod,0),(_,t)=>{if(returned<0&&view(c,'shade.r4').mode!=='recoil')returned=t;});
 assert.ok(returned>24.8&&returned<25.3,`returns after 25 s dark (${returned.toFixed(2)})`);
 run(c,30,input([107,0,4],0));assert.equal(view(c,'shade.r4').mode,'idle');assert.equal(c.blockers().length,1,'back in the doorway');
 const bites:CreatureResult[]=[],biteTimes:number[]=[];
 run(c,7,input([107,0,8],0),(r,t)=>{if(r.damage>0){biteTimes.push(t);bites.push(r);}});
 const bite=bites[0];assert.ok(bite,'dark pod within 4 m is bitten');assert.equal(bite.damage,T.shade.biteDamage);assert.ok(bite.push[2]<0,'the bite shoves the pod away from the doorway');
 for(let i=1;i<biteTimes.length;i++)assert.ok(biteTimes[i]!-biteTimes[i-1]!>=T.shade.biteCooldown-.06,'bite cooldown');
 const lit=new LivingCreatures(rng(6));let litDamage=0;run(lit,2,input([107,0,8],180,{lampOn:true}),r=>{litDamage+=r.damage;});assert.equal(litDamage,0,'no bite while lit');
}

// Blind: sleeper ignores engine wash, wakes on a pulse, hunts through doors, sniffs 30 s at the last sound, returns to sleep.
{
 const c=new LivingCreatures(rng(7)),home=view(c,'blind.r2').position;
 run(c,5,input([53,0,20],0,{speed:1.5}));assert.equal(view(c,'blind.r2').mode,'sleep','sleepers ignore engine wash');
 run(c,.05,input([53,0,7.5],0,{pulse:true}));
 assert.equal(view(c,'blind.r2').mode,'hunt','pulse from C1 wakes it');
 let nearest=Infinity,sniffAt=-1;
 run(c,40,input([60,0,7.5],0),(_,t)=>{nearest=Math.min(nearest,dist(view(c,'blind.r2').position,[53,0,7.5]));if(sniffAt<0&&view(c,'blind.r2').mode==='sniff')sniffAt=t;});
 assert.ok(nearest<dist(home,[53,0,7.5]),'a pulse draws the sleeper toward the doorway');
 assert.notEqual(view(c,'blind.r2').mode,'hunt','one pulse cannot cause an unbounded chase');
 let returnAt=view(c,'blind.r2').mode==='return'?0:-1;run(c,40,input([60,0,7.5],0),(_,t)=>{if(returnAt<0&&view(c,'blind.r2').mode==='return')returnAt=t;});
 assert.ok(returnAt>=0||view(c,'blind.r2').mode==='sleep',`gives up and returns or has already reached home`);
 run(c,80,input([60,0,7.5],0));
 assert.equal(view(c,'blind.r2').mode,'sleep','asleep at home again');assert.ok(dist(view(c,'blind.r2').position,home)<.1);
 const quiet=new LivingCreatures(rng(8));run(quiet,.05,input([56,0,-14],0,{pulse:true}));assert.equal(view(quiet,'blind.r2').mode,'sleep','pulse beyond 40 m is not heard');
}
{
 const awake=(pod:Vec3,o:Partial<CreatureInput>)=>{const c=new LivingCreatures(rng(9));const b=view(c,'blind.a1').position;run(c,.05,input(pod,0,o));return {mode:view(c,'blind.a1').mode,b};};
 const b=new LivingCreatures(rng(9)).views.find(v=>v.id==='blind.a1')!.position;
 assert.equal(awake([b[0]+T.blind.wash-1.5,b[1]+3,b[2]],{speed:.5}).mode,'hunt',`engine wash >0.45 m/s within ${T.blind.wash} m`);
 assert.notEqual(awake([b[0]+T.blind.wash+1,b[1]+3,b[2]],{speed:.5}).mode,'hunt',`wash beyond ${T.blind.wash} m`);
 assert.notEqual(awake([b[0]+5,b[1]+6,b[2]],{speed:.4}).mode,'hunt','slow pod is silent');
 assert.equal(awake([170,0,60],{noiseBursts:[{position:[b[0]+28,b[1]+3,b[2]-5],loudness:1}]}).mode,'hunt','loud clank within 30 m');
 assert.notEqual(awake([170,0,60],{noiseBursts:[{position:[b[0]+30,b[1]+5,b[2]-5],loudness:1}]}).mode,'hunt','clank beyond loudness×30 m');
 assert.notEqual(awake([170,0,60],{noiseBursts:[{position:[b[0]+10,b[1]+3,b[2]],loudness:.3}]}).mode,'hunt','quiet arm noise carries 9 m only');
}
{
 const c=new LivingCreatures(rng(10)),pod:Vec3=[130,0,0];
 run(c,.05,input([140,0,-29],90,{noiseBursts:[{position:[141.4,0,-29],loudness:1}]}));
 assert.equal(view(c,'blind.v').mode,'hunt','valve clank wakes the valve-room sleeper');
 let damage=0,strikes:number[]=[],maxSpaceChanges=new Set<string>();
 run(c,90,input(pod,180,{pulse:true,noiseBursts:[{position:pod,loudness:2}]}),(r,t)=>{if(r.damage>=T.blind.strikeDamage-1e-9){strikes.push(t);damage+=r.damage;}maxSpaceChanges.add(LIVING_SPACES.find(s=>{const p=view(c,'blind.v').position;return s.pod&&p[0]>=s.minX&&p[0]<=s.maxX&&p[2]>=s.minZ&&p[2]<=s.maxZ;})?.id??'?');});
 assert.ok(['V','C4','G'].every(s=>maxSpaceChanges.has(s)),'chases V→C4→G through the doorways');
 assert.ok(strikes.length>=2,'pulsing pod is rammed repeatedly');
 for(let i=1;i<strikes.length;i++)assert.ok(strikes[i]!-strikes[i-1]!>=T.blind.recoil-.1,`backs off ${T.blind.recoil} s between strikes`);
 const hit=c.views.find(v=>v.id==='blind.v')!;assert.ok(podHullGap(hit.position,pod,180)>0,'never inside the hull');
}
// Balance (valve room V-2, pod parked 2.9 m from the wheel). Silent pod: searched for and brushed, never rammed.
const VALVE:Vec3=[141.4,0,-29],PARK:Vec3=[138.5,0,-29];
const clank=(c:LivingCreatures)=>{run(c,.05,input(PARK,90,{noiseBursts:[{position:VALVE,loudness:1}]}));assert.equal(view(c,'blind.v').mode,'hunt','valve clank wakes blind.v');};
const balance:Record<string,number>={};
{
 const c=new LivingCreatures(rng(14));clank(c);
 let damage=0,brushed=false,closest=Infinity;
 run(c,45,input(PARK,90),r=>{damage+=r.damage;brushed||=r.events.some(e=>e.includes('贴着艇壳'));closest=Math.min(closest,podHullGap(view(c,'blind.v').position,PARK,90));});
 assert.equal(damage,0,'a silent pod at the clank is searched for, never rammed');
 assert.ok(closest<20,'it investigates the valve sound before giving up');
 assert.ok(['return','sleep'].includes(view(c,'blind.v').mode),'a single valve clank cannot keep the hunter camping');
 assert.ok(closest>0,'the search never swims into the hull');
 // Then a cautious exit at 0.4 m/s through C4.
 const exit:Vec3[]=[PARK,[130,0,-29],[130.5,0,-13],[130.5,0,0]];let leg=0,u=0;
 run(c,80,()=>{const a=exit[leg]!,b=exit[Math.min(leg+1,exit.length-1)]!;u+=.05*.4/Math.max(dist(a,b),.01);if(u>=1&&leg<exit.length-2){leg++;u=0;}
  return input([a[0]+(b[0]-a[0])*Math.min(u,1),0,a[2]+(b[2]-a[2])*Math.min(u,1)],faceTo(a,b),{speed:.4});},r=>{damage+=r.damage;});
 assert.equal(damage,0,'waiting it out then creeping below 0.45 m/s costs nothing');balance.cautious=damage;
}
{
 // Careless: full throttle straight out the moment the wheel clanks (what the first flow run did).
 const c=new LivingCreatures(rng(15));clank(c);
 const exit:Vec3[]=[PARK,[130,0,-29],[130.5,0,-13],[130.5,0,0],[128,0,7]];let leg=0,u=0,damage=0,hits=0;
 run(c,60,()=>{const a=exit[leg]!,b=exit[Math.min(leg+1,exit.length-1)]!;u+=.05*1.6/Math.max(dist(a,b),.01);if(u>=1&&leg<exit.length-2){leg++;u=0;}
  return input([a[0]+(b[0]-a[0])*Math.min(u,1),0,a[2]+(b[2]-a[2])*Math.min(u,1)],faceTo(a,b),{speed:1.6});},r=>{damage+=r.damage;if(r.damage>0)hits++;});
 assert.ok(hits>=1,'speeding away past it still gets rammed (real threat)');
 assert.ok(damage<=2*T.blind.strikeDamage+1e-9,`one escape costs at most two rams (${damage.toFixed(2)})`);balance.careless=damage;
}
{
 // Deafness after a ram: engine wash is ignored for `deaf` s, a pulse is not.
 const c=new LivingCreatures(rng(16));clank(c);
 let rammed=false;for(let i=0;i<600&&!rammed;i++)run(c,.05,input(PARK,90,{speed:1,pulse:true}),r=>{rammed||=r.damage>0;});
 assert.ok(rammed,'a loud pod at the wheel is rammed');
 let again=0;run(c,T.blind.deaf-.5,input(PARK,90,{speed:1}),r=>{again+=r.damage;});
 assert.equal(again,0,`engine wash ignored for ${T.blind.deaf} s after a ram`);
 let pulsed=0;run(c,20,input(PARK,90,{pulse:true}),r=>{pulsed+=r.damage;});assert.ok(pulsed>0,'an active pulse is still heard while deaf to wash');
}

// Swarm: covers the probe box, lured by the lamp at 0.9 m/s, scatters in the dark and returns after 12 s.
{
 const c=new LivingCreatures(rng(11)),station:Vec3=[72,0,-52];
 assert.deepEqual(c.tick(0,input(station,160)).itemsBlocked,['living.box.probe'],'amphipods cover the corpse and probe box');
 let freed=-1,maxSpeed=0,prev=view(c,'swarm.r3').position;
 run(c,10,input(station,160,{lampOn:true}),(r,t)=>{const p=view(c,'swarm.r3').position;maxSpeed=Math.max(maxSpeed,dist(p,prev)/.05);prev=p;if(freed<0&&!r.itemsBlocked.includes('living.box.probe'))freed=t;});
 assert.ok(freed>=0&&freed<4,'lamp lures the swarm off the box');assert.ok(maxSpeed<=T.swarm.speed+1e-6,'swarm speed 0.9 m/s');
 let lens=false;run(c,10,input(station,160,{lampOn:true}),r=>{lens||=r.lensBlocked;});assert.ok(lens,'swarm crowds the lens');
 run(c,40,t=>input([72,0,Math.min(-30,-52+t*.6)],160,{lampOn:true}));
 assert.ok(view(c,'swarm.r3').position[2]>-44,'drawn after the pod toward C2');
 const spot=view(c,'swarm.r3').position;
 run(c,11.5,input([72.5,0,-20],0),()=>assert.ok(dist(view(c,'swarm.r3').position,spot)<.2,'scatters and holds in the dark'));
 run(c,1,input([72.5,0,-20],0));assert.equal(view(c,'swarm.r3').mode,'return','returns after 12 s darkness');
 let back=-1;run(c,90,input([72.5,0,-20],0),(r,t)=>{if(back<0&&r.itemsBlocked.includes('living.box.probe'))back=t;});
 assert.ok(back>0,'covers the probe box again');
 const relure=c.tick(0,input(station,160));void relure;
 let again=-1;run(c,10,input(station,160,{lampOn:true}),(r,t)=>{if(again<0&&!r.itemsBlocked.includes('living.box.probe'))again=t;});assert.ok(again>=0,'always lurable again (no softlock)');
}

// Main-route sweep: lamp/pulse/speed along the whole route for several seeds never pushes anything through a wall.
for(let seed=20;seed<26;seed++){
 const c=new LivingCreatures(rng(seed)),route=LIVING_MAIN_ROUTE;let leg=0,u=0,provoked=false;
 run(c,600,t=>{
  provoked||=c.views.some(v=>v.mode!=='idle'&&v.mode!=='sleep');
  const a=route[leg]!,b=route[Math.min(leg+1,route.length-1)]!,len=Math.max(dist(a,b),.01);u+=.05*1.6/len;if(u>=1&&leg<route.length-2){leg++;u=0;}
  const p:Vec3=[a[0]+(b[0]-a[0])*Math.min(u,1),a[1]+(b[1]-a[1])*Math.min(u,1),a[2]+(b[2]-a[2])*Math.min(u,1)];
  return input(p,faceTo(a,b),{lampOn:Math.floor(t/7+seed)%3!==0,pulse:Math.floor(t/5+seed)%6===0,speed:1.6,noiseBursts:Math.floor(t*20)%400===0?[{position:p,loudness:1}]:[]});
 });
 assert.ok(provoked,'the sweep provoked creatures');
}

// Passive contacts, identification and extra residents.
{
 const c=new LivingCreatures(rng(12)),pod:Vec3=[128.5,0,50];
 const contacts=c.passiveContacts(pod,0);
 assert.ok(contacts.length>0&&contacts.every(k=>!k.identified&&k.intensity>0&&k.intensity<=1&&k.bearing>-180&&k.bearing<=180));
 const bands={lumen:[35,37.5],shade:[37.5,40],blind:[40,43],swarm:[43,45]} as const;
 for(const k of c.passiveContacts([100,0,20],0))assert.ok(k.frequency>=bands[k.type][0]&&k.frequency<=bands[k.type][1],`${k.id} frequency in its band`);
 const a1=contacts.find(k=>k.id==='lumen.a1')!;assert.ok(Math.abs(a1.bearing-(faceTo(pod,[140,6,52])>180?faceTo(pod,[140,6,52])-360:faceTo(pod,[140,6,52])))<1,'bearing relative to bow');
 c.markIdentified('lumen');assert.ok(c.passiveContacts(pod,0).filter(k=>k.type==='lumen').every(k=>k.identified));assert.ok(c.views.filter(v=>v.type==='lumen').every(v=>v.identified));
 c.tick(.05,input(pod,0,{extraLumens:1}));assert.ok(c.views.some(v=>v.id==='lumen.a3'),'V-1 consequence adds a resident');c.tick(.05,input(pod,0,{extraLumens:1}));assert.equal(c.views.filter(v=>v.type==='lumen').length,5,'added once');
}

// Snapshot/restore: round trip, determinism and atomic rejection of malformed saves.
{
 const a=new LivingCreatures(rng(13));run(a,20,input([36,0,-6],0,{lampOn:true,pulse:true}));a.markIdentified('blind');a.addLumen();
 const saved=a.snapshot(),b=new LivingCreatures(rng(99));assert.equal(b.restore(saved),true);assert.deepEqual(b.snapshot(),saved);
 const x=new LivingCreatures(rng(5)),y=new LivingCreatures(rng(5));x.restore(saved);y.restore(saved);
 for(let i=0;i<200;i++){const inp=input([60,0,7.5],90,{lampOn:i%50<20,pulse:i===10});x.tick(.1,inp);y.tick(.1,inp);}
 assert.deepEqual(x.snapshot(),y.snapshot(),'deterministic with injected random');
 const bad=(mutate:(s:any)=>void,why:string)=>{const s=structuredClone(saved) as any;mutate(s);const before=b.snapshot();assert.equal(b.restore(s),false,why);assert.deepEqual(b.snapshot(),before,'rejected restore is atomic');};
 bad(s=>{s.version=2;},'version');bad(s=>{s.mobs[0].pos=[1e9,0,0];},'outside space');bad(s=>{s.mobs[0].pos=[NaN,0,0];},'NaN');
 bad(s=>{s.mobs[2].mode='cling';},'mode not valid for type');bad(s=>{s.mobs.pop();},'missing creature');bad(s=>{s.mobs[1].id='lumen.zz';},'unknown id');
 bad(s=>{s.extra=7;},'extra out of range');bad(s=>{s.identified=['ghost'];},'unknown type');bad(s=>{s.mobs[0].leg=[[0,0,0]];s.mobs[0].legSpace=null;},'leg without space');
 assert.equal(b.restore(null),false);assert.equal(b.restore('x'),false);
}
console.log(`PASS living creatures: lumen seek/cling/release/linger/return, shade glare/hide/return/block/bite, blind sleep/wake/hunt-through-doors/strike/sniff/return with pulse ${T.blind.pulse} m, wash ${T.blind.wash} m, noise loudness×${T.blind.noise} m, valve balance cautious −${balance.cautious!.toFixed(2)} / careless −${balance.careless!.toFixed(2)}, swarm cover/lure/scatter/return, ${wallSamples} wall samples clear, contacts/bands/identify, deterministic snapshot + atomic rejection`);
