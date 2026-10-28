import {PodRun} from '../src/pod/sim/run';
import type {AuthoredSite} from '../src/pod/sim/authored-site';
import {ABYSS_ITEMS} from '../src/pod/content/abyssal-lab-layout';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
function sim(extra:boolean, initialPower=1, initialOxygen=1450){
 const r=new PodRun(3344);let metres=0;
 const site={index:2,complete:false,description:'资源预算诊断',hint:'',managesThreats:true,managesNarrative:true,move:(d:number)=>{metres+=Math.abs(d);return true;},turn:(d:number)=>(r.heading+d+360)%360,interact(){},draw(){},drawMap(){},snapshot(){return {};},dispose(){}} as AuthoredSite;
 r.createAuthoredSite=()=>site;r.beginAbyssalLab();r.at='camera';r.lamp=true;r.vitals.restore({oxygen:initialOxygen-1450});r.power=initialPower;r.stock.set('sup.cell',1);r.activeSonarEnabled=true;r.sonarPulseEnabled=false;
 let seconds=0,extraEnergy=0;const used:Record<string,number>={},collected:string[]=[];
 const use=(id:any)=>{r.at='life';if(r.useSupply(id))used[id]=(used[id]??0)+1;r.at='camera';};
 const service=()=>{if(r.power<.23&&r.count('sup.cell'))use('sup.cell');if(extra&&r.scrubber<.3&&r.count('sup.filter'))use('sup.filter');if(extra&&r.vitals.vitals.oxygen<800&&r.count('sup.o2candle'))use('sup.o2candle');};
 // Actual frame dt, actual stock/overflow and actual supply effects. Stops represent observed route regions.
 const pickups=[80,300,720,1050,1190],boxes=ABYSS_ITEMS.filter(i=>i.supplies);
 while(metres<1315&&seconds<2400&&r.outcome.kind==='alive'){
  if(extra)for(let i=0;i<boxes.length;i++)if(metres>=pickups[i]&&!collected.includes(boxes[i].id)){service();r.receiveAuthoredSupplies(boxes[i].supplies!);collected.push(boxes[i].id);service();r.bench.splice(0);}
  service();r.holdPilot(1,0,0);r.frame(1/60);seconds+=1/60;
  // All overflow is deliberately discarded above: no budget depends on bench persistence.
  // Conservatively distribute 174m vertical energy, 5 exposures incl one retake,
  // 16 analyses (11 remote + 5 local), 20 manual pings, 30 arm breaths over travel.
  {const delta=(.174+5*.06+16*.045+20*.014+30*.0007)/1047/60;extraEnergy+=delta;r.power=Math.max(0,r.power-delta);}
  if(r.power<=0)break;
 }
 // 10 min of local waiting/reading, still actual simulation time (no video claims).
 if(extra&&metres>=1315)for(let i=0;i<600*60&&r.outcome.kind==='alive';i++){service();r.holdPilot(0,0,0);r.frame(1/60);seconds+=1/60;}
 return {extra,initialPower,initialOxygen,seconds,metres,extraEnergy,used,collected,power:r.power,oxygen:r.vitals.vitals.oxygen,scrubber:r.scrubber,bench:r.bench,outcome:r.outcome};
}
const results=[sim(false),sim(true),sim(true,.25),sim(true,.25,500)];
assert(results[0].metres<1315,'baseline must expose original softlock');for(const r of results.slice(1)){assert(r.metres>=1315);assert(r.power>.1);assert(r.oxygen>300);assert(r.outcome.kind==='alive');}
writeFileSync('qa/level-03/runtime/resource-budget.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));




// Existing oxygen candles now genuinely refill oxygen in every deck; consumption and cap are invariant.
{const r=new PodRun(55);r.at='life';r.stock.set('sup.o2candle',1);r.vitals.restore({oxygen:-950});assert(r.useSupply('sup.o2candle'));assert(r.vitals.vitals.oxygen>1090&&r.vitals.vitals.oxygen<=1100);const oxygen=r.vitals.vitals.oxygen;assert.equal(r.useSupply('sup.o2candle'),false);assert.equal(r.vitals.vitals.oxygen,oxygen);r.stock.set('sup.o2candle',1);assert(r.useSupply('sup.o2candle'));assert.equal(r.vitals.vitals.oxygen,1450);}
