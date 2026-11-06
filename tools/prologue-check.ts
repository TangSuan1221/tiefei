import assert from 'node:assert/strict';
import {Prologue,type PrologueSample} from '../src/pod/sim/prologue';
import {Vector3} from 'three';
import {createExpedition} from '../src/pod/content/expedition';
import {createReferenceMaterials} from '../src/pod/view/deepsea/reference-materials';
import {createExpeditionWorld} from '../src/pod/view/deepsea/expedition-world';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
const p=new Prologue();
const s:PrologueSample={target:null,lamp:false,gear:0,speed:0,x:11,y:0,z:-36,pitch:0,pitchRate:0,verticalSpeed:0,doorReach:false,doorOpen:false,armStowed:true};
// User's screenshot: nearly level, stopped, but half a metre below target used to be rejected.
for(const pose of [{pitch:-.3,y:-.5,pitchRate:0,verticalSpeed:0},{pitch:3,y:1,pitchRate:.6,verticalSpeed:.12},{pitch:-3,y:-1,pitchRate:-.6,verticalSpeed:-.12}]){
 const teaching=new Prologue();teaching.step=9;
 const sample={...s,...pose},before={...sample};
 assert(teaching.tick(.05,sample),'roughly level and within one metre should pass');
 assert.equal(teaching.step,10);assert.deepEqual(sample,before,'teaching must not snap the physical pose');
}
for(const pose of [{pitch:3.1},{y:1.1},{y:-1.1},{pitchRate:1.1},{verticalSpeed:.21}]){
 const teaching=new Prologue();teaching.step=9;
 assert(!teaching.tick(.05,{...s,...pose}),'still reject wrong depth, tilt or active movement');
 assert.equal(teaching.step,9);
}
const tick=()=>p.tick(.05,s);
for(let i=0;i<1000;i++)tick();assert.equal(p.step,0,'waiting cannot complete input');
s.target=[11,16,1012];tick();assert.equal(p.step,0,'screen values are not world coordinates');
s.target=[11,0,16];tick();assert.equal(p.step,1);
s.lamp=true;tick();assert.equal(p.step,1);assert(!p.focusActive);
for(let i=0;i<80;i++)tick();assert.equal(p.step,1,'lamp observation cannot be skipped');
s.lamp=false;tick();assert.equal(p.lampObservation,0);s.lamp=true;
for(let i=0;i<121;i++)tick();assert.equal(p.step,2);
assert(p.focusActive);p.age=3;assert(!p.focusActive,'gear introduction releases camera');
for(const gear of [1,2,3]){s.gear=gear;tick();}s.gear=1;s.gearSettled=false;tick();assert.equal(p.step,2,'moving selector cannot complete');s.gearSettled=true;tick();assert.equal(p.step,3);
tick();s.speed=1;s.z+=1.1;tick();assert.equal(p.step,4);
tick();s.speed=-.3;s.z-=.6;tick();assert.equal(p.step,5);
tick();s.y+=.6;tick();assert.equal(p.step,6);
const saved=p.snapshot(),restored=new Prologue();assert(restored.restore(saved));assert.deepEqual(restored.snapshot(),saved);
tick();s.y-=.6;tick();assert.equal(p.step,7);
tick();s.pitch=-5;tick();assert.equal(p.step,8);
tick();s.pitch=0;tick();assert.equal(p.step,9);
tick();assert.equal(p.step,10);s.doorReach=true;s.speed=1;tick();assert.equal(p.step,10,'must stop');s.speed=0;tick();assert.equal(p.step,11);
s.doorOpen=true;s.armStowed=false;tick();assert(p.active);s.armStowed=true;tick();assert(!p.active);
assert(!Prologue.valid({...saved,step:99}));assert(!Prologue.valid({...saved,anchor:[NaN,0,0,0]}));
const materials=createReferenceMaterials(),world=createExpeditionWorld(createExpedition(0),materials);
try{
 for(let z=-39;z<=13;z+=.2)for(const y of [-.6,0,.6])assert(harborHullClear(new Vector3(11,y,z),180,world.walkable,world.colliders),`corridor blocked at ${z},${y}`);
 for(let heading=0;heading<360;heading+=2)assert(harborHullClear(new Vector3(11,0,-30),heading,world.walkable,world.colliders),`turn blocked ${heading}`);
 console.log('PASS progression, negative input, physical actions, restore validation, corridor hull sweep and full turning clearance');
}finally{world.dispose();materials.dispose();}
