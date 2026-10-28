import assert from 'node:assert/strict';
import {LivingCreatures,type CreatureInput,livingSpaceAt,livingLineOfSight} from '../src/pod/sim/living-creatures';
import type {Vec3} from '../src/pod/content/living-deck-layout';
const input=(pod:Vec3,more:Partial<CreatureInput>={}):CreatureInput=>({pod,heading:90,lampOn:false,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0,...more});
function run(c:LivingCreatures,seconds:number,i:CreatureInput){let damage=0;for(let t=0;t<seconds;t+=.05)damage+=c.tick(.05,i).damage;return damage;}
const fresh=()=>new LivingCreatures(()=>.4,'survey');
const c=fresh();
assert.equal(run(c,30,input([53,-1,24],{lampOn:true})),0,'stationary silent photography is safe');
assert(['sleep','idle'].includes(c.views.find(v=>v.id==='blind.r2')!.mode),'passive does not wake hunter (it naps, then patrols)');
assert.equal(run(c,2.8,input([53,-1,24],{activePowered:true})),0,'three-second warning');
assert.equal(run(c,20,input([53,-1,24])),0,'powering down during warning avoids damage');
const noisy=fresh();const damage=run(noisy,20,input([53,-1,24],{activePowered:true}));
assert(damage>=.18&&damage<=.54,`sustained active noise has bounded meaningful damage: ${damage}`);
assert.equal(run(noisy,60,input([128.5,0,17],{activePowered:true,lampOn:true})),0,'G workface remains safe without freezing simulation');
assert.equal(livingSpaceAt(noisy.views.find(v=>v.id==='blind.r2')!.position),'R2','hunter returns to habitat');
const eel=fresh();assert.equal(run(eel,4,input([104,-1,26],{lampOn:true})),0,'light protects and drives eel back');
assert.equal(eel.views.find(v=>v.id==='shade.r4')!.mode,'recoil');
assert.equal(run(eel,18,input([108,-1,26],{lampOn:true})),0,'lit photography remains safe');
const bite=fresh();assert.equal(run(bite,9,input([107,-1,26])),0,'first dark bite waits out the 10 s wind-up');
const biteDamage=run(bite,11,input([107,-1,26]));assert(Math.abs(biteDamage-.32)<1e-6,'two dark bites over twenty seconds (10 s wind-up, 8 s cooldown + 2 s), not rapid stun lock');
const late=fresh();assert.equal(run(late,30,input([166,2,60],{lampOn:true})),0,'third encounter quiet upper route remains safe');
assert.equal(run(late,50,input([7,0,7],{activePowered:true,lampOn:true})),0,'entry recovery safe');
const creep=fresh();assert.equal(run(creep,12,input([53,-1,24],{speed:.6})),0,'just over the wash threshold beside a napping hunter is too faint to wake it');
assert.equal(creep.views.find(v=>v.id==='blind.r2')!.mode,'sleep','faint wash never accumulates');
const engine=fresh();assert(run(engine,12,input([53,-1,24],{speed:1.6}))>=.18,'full-speed propulsion beside it wakes the blind hunter');
// Aggro clears: a hunter chasing active noise loses the trail once the pod goes dark and still, searches, then returns to its loop.
const calm=fresh();run(calm,4,input([53,-1,24],{activePowered:true}));assert.equal(calm.views.find(v=>v.id==='blind.r2')!.mode,'hunt','active power provokes a chase');
let cleared=-1;const quietDamage=(()=>{let d=0;for(let t=0;t<40;t+=.05){d+=calm.tick(.05,input([53,-1,24])).damage;if(cleared<0&&['return','idle','sleep'].includes(calm.views.find(v=>v.id==='blind.r2')!.mode))cleared=t;}return d;})();
assert.equal(quietDamage,0,'silence after the chase is never struck');assert(cleared>0&&cleared<25,`hunter gives up within 25 s of silence: ${cleared}`);
assert.equal(calm.snapshot().mobs.find(m=>m.id==='blind.r2')!.alert,0,'awareness cleared after giving up');
// Patrol: once its nap ends the hunter walks its loop around a silent pod without attacking.
const loop=fresh();const home=loop.views.find(v=>v.id==='blind.r2')!.position;let roamed=0;
assert.equal(run(loop,90,input([47,0,16])),0,'silent pod in the workshop is never struck by the patrol');
for(let t=0;t<60;t+=.05){loop.tick(.05,input([47,0,16]));const p=loop.views.find(v=>v.id==='blind.r2')!.position;roamed=Math.max(roamed,Math.hypot(p[0]-home[0],p[2]-home[2]));}
assert(roamed>4,`hunter patrols away from its nest: ${roamed}`);
for(const step of [.016,.05,.25]){const sim=fresh();for(let t=0;t<90;t+=step){sim.tick(step,input([128.5,0,17],{lampOn:true,activePowered:true,speed:1}));for(const v of sim.views)assert(livingSpaceAt(v.position),'creatures remain inside traversable volume at all frame rates');}}
for(const point of [[53,-1,24],[108,-1,26],[166,-1,60]] as Vec3[]){const sim=fresh();let previous=new Map(sim.views.map(v=>[v.id,v.position]));for(let t=0;t<90;t+=.05){sim.tick(.05,input(point,{activePowered:true,lampOn:t%12<6,speed:1}));for(const v of sim.views){assert(livingSpaceAt(v.position),'encounter stays in space');assert(livingLineOfSight(previous.get(v.id)!,v.position),v.id+' crossed a wall');}previous=new Map(sim.views.map(v=>[v.id,v.position]));}}
const snapshot=noisy.snapshot();const restored=fresh();assert(restored.restore(snapshot));assert.deepEqual(restored.snapshot(),snapshot);assert(!new LivingCreatures().restore(snapshot),'profile cannot silently cross-load');
console.log(JSON.stringify({pass:true,first20sNoiseDamage:damage,second20sDarkDamage:biteDamage,quietStrategies:'first silence; second lamp; third upper route; G/S recovery',profile:'survey'}));
