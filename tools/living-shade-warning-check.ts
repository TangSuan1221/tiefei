import assert from 'node:assert/strict';
import {LivingCreatures,type CreatureInput} from '../src/pod/sim/living-creatures';
const input:CreatureInput={pod:[105,-1,26],heading:0,lampOn:false,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0};
const fresh=()=>new LivingCreatures(()=>.5,'survey');
function step(c:LivingCreatures,seconds:number,i=input){let damage=0,warnings=0;for(let n=0;n<Math.round(seconds/.05);n++){const r=c.tick(.05,i);damage+=r.damage;warnings+=r.events.filter(e=>e.startsWith('被动声纳：')).length;}return {damage,warnings};}
const c=fresh();assert.deepEqual(step(c,9.95),{damage:0,warnings:0},'wind-up is silent');
assert.equal(step(c,.05).damage,.16);
assert.deepEqual(step(c,7.95),{damage:0,warnings:0});
assert.equal(step(c,1.95).damage,0);assert.equal(step(c,.2).damage,.16);
for(const cancel of [{...input,lampOn:true,heading:90},{...input,pod:[100,-1,26] as [number,number,number]},{...input,pod:[50,-1,26] as [number,number,number]}]){
 const a=fresh();step(a,5);step(a,.05,cancel);assert.deepEqual(step(a,9.95),{damage:0,warnings:0});assert.equal(step(a,.05).damage,.16);
}
const a=fresh();step(a,5);const snap=a.snapshot(),b=fresh();assert.ok(b.restore(snap));assert.deepEqual(step(a,5),step(b,5));
const invalid=structuredClone(snap);invalid.mobs[invalid.mobs.length-1]!.cooldown=NaN;const before=b.snapshot();assert.equal(b.restore(invalid),false);assert.deepEqual(b.snapshot(),before);
// Legacy keeps the original immediate bite, damage and three-second cooldown.
const legacy=new LivingCreatures(()=>.5,'legacy');const eel=legacy.views.find(v=>v.id==='shade.r4')!;
const legacyInput={...input,pod:[eel.position[0]-5,eel.position[1],eel.position[2]] as [number,number,number]};
assert.equal(step(legacy,.05,legacyInput).damage,.06);assert.equal(step(legacy,2.95,legacyInput).damage,0);assert.equal(step(legacy,.15,legacyInput).damage,.06);
console.log('PASS shade survey silent wind-up/cancel/10s bite/8s cooldown+2s wind-up/save atomicity; legacy immediate 6%/3s unchanged');
