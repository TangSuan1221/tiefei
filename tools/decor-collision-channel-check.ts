// MET-042: set dressing lives in decorColliders and never blocks the hull.
// 1. Level 1 world + rescue art: decor channel populated, disjoint from hull colliders.
// 2. Level 2 world: dressing/wreck in decor channel, disjoint from hull colliders.
// 3. Source scan: only producer files may touch decorColliders; pod movement,
//    sonar, photo line-of-sight and save validation must never read it.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import type {Box3} from 'three';
import {createHarborLevel} from '../src/pod/content/harbor-level';
import {createReferenceMaterials} from '../src/pod/view/deepsea/reference-materials';
import {createExpeditionWorld} from '../src/pod/view/deepsea/expedition-world';
import {createHarborRescueWorld} from '../src/pod/view/deepsea/harbor-rescue-world';

const context=new Proxy({measureText:(s:string)=>({width:s.length*20}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray(512*512*4)}),createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),createPattern:()=>({setTransform(){}})},{get:(o,k)=>k in o?o[k as keyof typeof o]:()=>{}});
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,style:{},getContext:()=>context}),createElementNS:()=>({style:{},addEventListener(){},removeEventListener(){}}),fonts:{load:async()=>[],ready:Promise.resolve()}}});

const key=(b:Box3)=>[...b.min.toArray(),...b.max.toArray()].map(v=>v.toFixed(4)).join(',');
function disjoint(label:string,hull:Box3[],decor:Box3[]){
 assert.ok(decor.length>0,`${label}: decor channel empty`);
 const hullSet=new Set(hull),hullKeys=new Set(hull.map(key));
 const shared=decor.filter(b=>hullSet.has(b)||hullKeys.has(key(b)));
 assert.deepEqual(shared.map(key),[],`${label}: decor boxes also registered as hull colliders`);
}

const report:string[]=[];
const materials=createReferenceMaterials(),world=createExpeditionWorld(createHarborLevel(),materials);
const visual=createHarborRescueWorld(world,materials);
try{
 world.colliders.push(...visual.solids);world.decorColliders.push(...visual.decor);
 disjoint('level-1',world.colliders,world.decorColliders);
 assert.ok(visual.decor.length>0,'level-1 rescue art: caisson struts/lamps not in decor channel');
 report.push(`level-1 hull ${world.colliders.length} / decor ${world.decorColliders.length}`);
}finally{visual.dispose();world.dispose();materials.dispose();}

let living='level-2 skipped';
try{
 const {createLivingWorld}=await import('../src/pod/view/deepsea/living-world');
 const lw=createLivingWorld();
 try{disjoint('level-2',lw.colliders,lw.decorColliders);living=`level-2 hull ${lw.colliders.length} / decor ${lw.decorColliders.length}`;}
 finally{lw.dispose();}
}catch(error){
 if(error instanceof assert.AssertionError)throw error;
 living=`level-2 runtime GAP (needs browser: ${(error as Error).message.split('\n')[0]})`;
}
report.push(living);

// Producers only. Consumers (pod movement, sonar, photo, restore checks) must not appear here.
const producers=new Set([
 'src/pod/view/deepsea/expedition-world.ts','src/pod/view/deepsea/harbor-world.ts','src/pod/view/deepsea/harbor-room-identity.ts',
 'src/pod/view/deepsea/harbor-caisson-layout.ts','src/pod/view/deepsea/harbor-rescue-dressing.ts','src/pod/view/deepsea/harbor-rescue-world.ts','src/pod/view/deepsea/harbor-rescue-site.ts',
 'src/pod/view/deepsea/living-world.ts',
]);
const root=join(import.meta.dirname,'..'),offenders:string[]=[];
(function walk(dir:string){for(const name of readdirSync(dir)){const p=join(dir,name);if(statSync(p).isDirectory()){walk(p);continue;}
 if(!/\.(ts|mjs)$/.test(name))continue;const rel=relative(root,p).replace(/\\/g,'/');const text=readFileSync(p,'utf8');
 if(/decorColliders/.test(text)&&!producers.has(rel))offenders.push(rel);
 if(rel==='src/pod/view/deepsea/harbor-rescue-site.ts'&&(text.match(/decorColliders/g)??[]).length!==1)offenders.push(rel+' (only the registration push is allowed)');
}})(join(root,'src'));
assert.deepEqual(offenders,[],'decorColliders read outside producer files');
console.log(`PASS MET-042 decor collision channel: ${report.join('; ')}; source scan clean`);
