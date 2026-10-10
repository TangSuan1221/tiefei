import {Box3,Vector3} from 'three';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
import {LIVING_MAIN_ROUTE,LIVING_ITEMS,LIVING_SPAWN,livingSolids,livingWalkable,type Aabb} from '../src/pod/content/living-deck-layout';

const toBox=(b:Aabb)=>new Box3(new Vector3(...b.min),new Vector3(...b.max));
const walkable=livingWalkable().map(toBox),solids=livingSolids().map(toBox);
let failures=0;
const fail=(m:string)=>{failures++;console.error('FAIL',m);};

const clearAny=(p:Vector3,heading:number)=>harborHullClear(p,heading,walkable,solids);
if(!clearAny(new Vector3(...LIVING_SPAWN.position),LIVING_SPAWN.heading))fail('spawn blocked');

// Walk the route with the hull pointed along each leg; vertical legs keep the previous heading.
let heading=LIVING_SPAWN.heading;
const route=[LIVING_SPAWN.position,...LIVING_MAIN_ROUTE];
for(let i=1;i<route.length;i++){
 const a=new Vector3(...route[i-1]),b=new Vector3(...route[i]),d=b.clone().sub(a);
 const flat=Math.hypot(d.x,d.z);
 const next=flat>.5?(Math.atan2(d.x,-d.z)*180/Math.PI+360)%360:heading;
 // Turn in place at the waypoint first.
 const delta=((next-heading+540)%360)-180,steps=Math.ceil(Math.abs(delta)/2);
 for(let s=1;s<=steps;s++){const h=heading+delta*s/steps;if(!clearAny(a,h)){fail(`turn at ${route[i-1]} ${heading.toFixed(0)}→${next.toFixed(0)} blocked at ${h.toFixed(0)}`);break;}}
 heading=next;
 const n=Math.ceil(d.length()/.25);
 for(let s=1;s<=n;s++){const p=a.clone().addScaledVector(d,s/n);if(!clearAny(p,heading)){fail(`leg ${i} ${route[i-1]}→${route[i]} blocked at ${p.toArray().map(v=>v.toFixed(1))}`);break;}}
}

// Every pod-side item needs a legal parking pose ≤3.0 m (box) / ≤3.2 m (terminal) facing it.
for(const item of LIVING_ITEMS){
 const f=item.face*Math.PI/180,dir=new Vector3(Math.sin(f),0,-Math.cos(f));
 let ok=false;
 // Interaction ray starts at the pod centre (camera) and reaches 3.4 m; boxes are 0.96 m deep.
 const face=item.kind==='box'?.48:.3;
 for(const standoff of [3.0,3.2,3.4,3.6]){
  const p=new Vector3(...item.position).addScaledVector(dir,standoff);p.y=0;
  if(item.kind==='uplink'||item.kind==='photo'){ok=true;break;}
  if(clearAny(p,(item.face+180)%360)){ok=standoff-face<=3.3;console.log(`${ok?'ok':'FAR'} ${item.id} park ${p.toArray().map(v=>v.toFixed(1))} centre→face ${(standoff-face).toFixed(2)}m`);break;}
 }
 if(!ok)fail(`no parking pose for ${item.id}`);
}
console.log(failures?`${failures} failures`:'PASS living layout: route + parking clear for 2.8×5×3 hull');
process.exit(failures?1:0);
