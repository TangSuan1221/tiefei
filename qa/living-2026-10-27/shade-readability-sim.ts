import {LivingCreatures,podHullGap} from '../../src/pod/sim/living-creatures';
import {PilotMotion} from '../../src/pod/sim/pilot';
const c=new LivingCreatures(()=>.5,'survey');
const input={pod:[105,-1,26] as [number,number,number],heading:0,lampOn:false,lampRange:26,lampHalfAngle:.72,pulse:false,activePowered:false,speed:0,noiseBursts:[],armOut:false,gateOpen:false,extraLumens:0};
const hits=[];for(let i=0;i<500;i++){const r=c.tick(.05,input);if(r.damage)hits.push({simTime:+((i+1)*.05).toFixed(2),damage:r.damage,events:r.events});}
const turns=[];for(const angle of [45,90,135,180]){const p=new PilotMotion();let heading=0,t=0;while(heading<angle-.72*180/Math.PI){heading+=p.step(.01,0,1,0).yaw;t+=.01;}turns.push({initialAngle:angle,timeToCone:+t.toFixed(2)});}
console.log(JSON.stringify({kind:'Pure simulation; fixed position intentionally ignores push, no browser, no media API',gap:podHullGap([110,-1,26],input.pod,0),hits,turns},null,2));
