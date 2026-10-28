import {LivingCreatures} from '../src/pod/sim/living-creatures';
import {writeFileSync,mkdirSync} from 'node:fs';
const rows=[];
for(const dt of [1/120,1/60,1/30,.05,.25])for(const [x,z,heading]of [[109.5,27.1,131],[112.5,29.4,94]]){
 const c=new LivingCreatures(()=>.5,'survey');const hits=[];let hull=.64;
 for(let t=0;t<65-dt/2;t+=dt){const r=c.tick(dt,{pod:[x!,0,z!],heading:heading!,lampOn:true,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0});if(r.damage){hull-=r.damage;hits.push({at:+(t+dt).toFixed(3),damage:r.damage,hull:+hull.toFixed(3),events:r.events,push:r.push});}}
 rows.push({dt,x,z,heading,hits});
}
mkdirSync('qa/living-survey/r4-damage',{recursive:true});writeFileSync('qa/living-survey/r4-damage/pure.json',JSON.stringify({method:'Independent stationary fresh survey creatures, no browser scene or old mob snapshot; isolates timestep dependence, NOT exact blind replay',rows},null,2));console.log(JSON.stringify(rows));
