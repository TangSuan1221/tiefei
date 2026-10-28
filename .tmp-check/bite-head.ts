import {LivingCreatures} from './head-creatures';
const i={pod:[107,-1,26] as [number,number,number],heading:90,lampOn:false,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0};
const c=new LivingCreatures(()=>.4,'survey');let d=0;const hits:number[]=[];
for(let t=0;t<20;t+=.05){const r=c.tick(.05,i);if(r.damage>0)hits.push(+t.toFixed(2));d+=r.damage;}
console.log('hits',hits,'total20s',d);
