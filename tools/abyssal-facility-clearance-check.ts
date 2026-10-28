/** QA only: decor is used here to reserve visual space, never in navigation. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from 'three';
import {createAbyssalFacilityDressing} from '../src/pod/view/deepsea/abyssal-facility-dressing';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
import {ABYSS_SPAWN,ABYSS_ITEMS,ABYSS_PHOTO_STATIONS,podRoute,headingTo,type Vec3} from '../src/pod/content/abyssal-lab-layout';
const material=new T.MeshStandardMaterial({side:T.DoubleSide});
const dressing=createAbyssalFacilityDressing({materials:{frame:material,paint:material,cream:material,pipe:material,rubber:material,glass:material,brass:material,damage:material,lens:material}});
dressing.root.updateMatrixWorld(true);
const broad=[new T.Box3(new T.Vector3(-1000,-1000,-1000),new T.Vector3(1000,1000,1000))];
const failures:string[]=[],boxOnlySightWarnings:string[]=[];let translations=0,turns=0;
const clear=(p:T.Vector3,h:number,label:string)=>{if(!harborHullClear(p,h,broad,dressing.decorColliders))failures.push(`${label}: visual hull overlaps decorative AABB at ${p.toArray().map(x=>x.toFixed(3))}, h${h.toFixed(2)}`);};
function sight(a:Vec3,b:Vec3,label:string){const p=new T.Vector3(...a),target=new T.Vector3(...b),d=target.clone().sub(p),length=d.length(),direction=d.normalize();const ray=new T.Ray(p,direction);const suspected=dressing.decorColliders.some(box=>{const q=ray.intersectBox(box,new T.Vector3());return !!q&&q.distanceTo(p)<length;});if(!suspected)return;
 const raycaster=new T.Raycaster(p,direction,.001,length-.001),hits=raycaster.intersectObject(dressing.root,true);
 if(hits.length)failures.push(`${label}: actual decorative mesh blocks target at ${hits[0].distance.toFixed(3)}m`);else boxOnlySightWarnings.push(`${label}: conservative AABB only; DoubleSide mesh Raycaster clear`);
}
let at=new T.Vector3(...ABYSS_SPAWN.position),heading=ABYSS_SPAWN.heading;clear(at,heading,'spawn');
for(const [i,leg] of podRoute().entries()){
 const end=new T.Vector3(...leg.to),delta=end.clone().sub(at);const wanted=leg.reverse||Math.hypot(delta.x,delta.z)<.3?heading:headingTo(at.toArray() as unknown as Vec3,leg.to);
 const yaw=((wanted-heading+540)%360)-180,nTurn=Math.ceil(Math.abs(yaw)/.5);
 for(let step=1;step<=nTurn;step++){clear(at,heading+yaw*step/nTurn,`turn ${i}`);turns++;}
 heading=wanted;const nMove=Math.max(1,Math.ceil(delta.length()/.25));for(let step=1;step<=nMove;step++){clear(at.clone().lerp(end,step/nMove),heading,`leg ${i}`);translations++;}at=end;
}
// Reuse the exact successful production parking poses from framing regression.
// Missing/stale evidence cannot silently drop any of the 13 objects.
const framing=JSON.parse(readFileSync('qa/level-03/runtime/framing.json','utf8'));
const parks=(framing.result??framing).items as {id:string;park:Vec3;clear:boolean;hit:string}[];
for(const item of ABYSS_ITEMS){const park=parks.find(p=>p.id===item.id);assert(park?.clear&&park.hit===item.id,`missing successful production parking pose for ${item.id}`);const h=headingTo(park.park,item.position);clear(new T.Vector3(...park.park),h,item.id);sight(park.park,item.position,`${item.id} arm ray`);}
for(const photo of ABYSS_PHOTO_STATIONS){clear(new T.Vector3(...photo.position),photo.heading,photo.id);sight(photo.position,photo.target,`${photo.id} camera ray`);}
const result={translations,turns,items:ABYSS_ITEMS.length,photos:ABYSS_PHOTO_STATIONS.length,decor:dressing.decorColliders.length,failures,boxOnlySightWarnings};
writeFileSync('qa/level-03/runtime/facility-clearance.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));dressing.dispose();material.dispose();assert.equal(failures.length,0,'facility visual clearance failed');
