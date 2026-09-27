import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createExpedition} from '../src/pod/content/expedition';
import {createExpeditionWorld} from '../src/pod/view/deepsea/expedition-world';
import {createReferenceMaterials} from '../src/pod/view/deepsea/reference-materials';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
const materials=createReferenceMaterials(),level=createExpedition(0),world=createExpeditionWorld(level,materials);
try{
 let checks=0;
 for(const edge of level.edges.filter(e=>(e.path?.length??0)>6)){
  const p=edge.path!;
  for(let i=1;i<p.length-1;i++){
   const a=new Vector3(...p[i-1]),b=new Vector3(...p[i]),c=new Vector3(...p[i+1]);
   const h0=Math.atan2(b.x-a.x,-(b.z-a.z))*180/Math.PI,h1=Math.atan2(c.x-b.x,-(c.z-b.z))*180/Math.PI;
   const delta=((h1-h0+540)%360)-180;
   for(let j=0;j<=20;j++){assert.ok(harborHullClear(b,h0+delta*j/20,world.walkable,world.colliders),`${edge.id} turn ${i}/${j}`);checks++;}
  }
 }
 console.log(`PASS ${checks} intermediate hull headings across curved passages`);
}finally{world.dispose();materials.dispose();}
