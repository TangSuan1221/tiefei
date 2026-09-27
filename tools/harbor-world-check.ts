import assert from 'node:assert/strict';
import {Vector3,Box3} from 'three';
import {createExpedition} from '../src/pod/content/expedition';
import {createReferenceMaterials} from '../src/pod/view/deepsea/reference-materials';
import {createExpeditionWorld} from '../src/pod/view/deepsea/expedition-world';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
const materials=createReferenceMaterials(),level=createExpedition(0),world=createExpeditionWorld(level,materials);
const failures:string[]=[];
try{
 for(const edge of level.edges){const path=edge.path!;for(let i=1;i<path.length;i++){
  const a=new Vector3(...path[i-1]),b=new Vector3(...path[i]),delta=b.clone().sub(a),heading=Math.atan2(delta.x,-delta.z)*180/Math.PI;
  const steps=Math.ceil(a.distanceTo(b)/.2);
  for(let j=0;j<=steps;j++){const p=a.clone().lerp(b,j/steps);if(!harborHullClear(p,heading,world.walkable,world.colliders)){failures.push(`${edge.id}: ${p.toArray()}`);break;}}
 }}
 world.root.updateMatrixWorld(true);
 const itemBounds=[...world.interactables.values()].map(o=>new Box3().setFromObject(o));
 for(const [id,o] of world.interactables){assert.equal(o.userData.interactionId,id);const p=new Vector3(...o.userData.approach);if(!harborHullClear(p,o.userData.approachYaw,world.walkable,[...world.colliders,...itemBounds]))failures.push('item approach '+id);}
 assert.deepEqual(failures,[]);
 console.log(`PASS ${level.edges.length} physical 3D paths, 2.8x5x3m swept hull, ${world.interactables.size} item approaches`);
}finally{world.dispose();materials.dispose();}
