import {Vector3} from 'three';
import {HARBOR_HULL} from './harbor-navigation';

/** Clearance kept from the heard hull's collision outline, so it presses close without merging into the pod. */
export const PURSUIT_HULL_GAP=.5;
/** Engine wash and knocks only carry this far; an active pulse is heard across the whole harbor. */
export const PURSUIT_NOISE_RANGE=10;
const ROAM_SPEED=.8,HUNT_SPEED=2.2,PROWL_SPEED=.9,SNIFF_SPEED=.7,SNIFF_SECONDS=40,SNIFF_RADIUS=4;
/** North-bank haunts the creature patrols when nothing is calling it. */
const ROAM_POINTS:[number,number,number][]=[[46,-1.2,5],[44,-1.2,11],[52,-1.2,8],[58,-1.2,4],[64,-1.2,9],[66,-1.2,13],[56,-.8,19],[64,-.8,20]];
/** Cargo enclosure walls (outer faces) and the interior the creature may occupy. */
const WALLS={minX:69.4,maxX:85.3,minZ:1,maxZ:16.3};
const INTERIOR={minX:72.8,maxX:81.4,minZ:2,maxZ:15};
const GATE_FRONT=new Vector3(77,-.5,17.5);
const DETOURS=[new Vector3(68.8,-.8,17.4),new Vector3(86,-.8,17.4),new Vector3(68.8,-.8,.4),new Vector3(86,-.8,.4)];

const inCargo=(p:Vector3)=>p.x>72.5&&p.x<81.7&&p.z<15.3;
const clampInterior=(p:Vector3)=>{p.x=Math.min(INTERIOR.maxX,Math.max(INTERIOR.minX,p.x));p.z=Math.min(INTERIOR.maxZ,Math.max(INTERIOR.minZ,p.z));return p;};

/** Approximate horizontal distance from `p` to the outside of the hull box centred on `centre`. */
function hullGap(p:Vector3,centre:Vector3,heading:number){
 const h=heading*Math.PI/180,dx=p.x-centre.x,dz=p.z-centre.z;
 const forward=Math.abs(dx*Math.sin(h)-dz*Math.cos(h))-HARBOR_HULL.length/2,lateral=Math.abs(dx*Math.cos(h)+dz*Math.sin(h))-HARBOR_HULL.width/2;
 return Math.hypot(Math.max(0,forward),Math.max(0,lateral))+Math.min(0,Math.max(forward,lateral));
}

/** Whether the horizontal segment a→b passes through the cargo enclosure footprint. */
function crossesWalls(a:Vector3,b:Vector3){
 let t0=0,t1=1;
 for(const [p,d,lo,hi] of [[a.x,b.x-a.x,WALLS.minX,WALLS.maxX],[a.z,b.z-a.z,WALLS.minZ,WALLS.maxZ]] as const){
  if(Math.abs(d)<1e-9){if(p<lo||p>hi)return false;continue;}
  let u=(lo-p)/d,v=(hi-p)/d;if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)return false;
 }
 return true;
}

type Mode='roam'|'hunt'|'sniff';

/** Acoustic predator: patrols, hunts a heard source around the cargo walls, prowls the hull, then searches where the sound died. */
export class HarborPursuit {
 readonly position:Vector3;
 private heard:Vector3|null=null;
 private heardHeading=0;
 private mode:Mode='roam';
 private goal:Vector3|null=null;
 private pause=0;
 private sniffLeft=0;
 private orbit=0;
 private orbitDir=1;
 constructor(private readonly random:()=>number=Math.random){
  this.position=new Vector3(...ROAM_POINTS[Math.floor(random()*ROAM_POINTS.length)]!);
  this.pause=1+random()*3;
 }
 get inside(){return inCargo(this.position);}
 get hunting(){return this.mode==='hunt';}
 /**
  * Whether it would react to the pod. Once lured into the cargo it fixates on the enclosure,
  * so only another active pulse can draw it back out; engine wash and knocks are ignored there.
  */
 hears(player:Vector3,pulse:boolean,noise:boolean){
  if(pulse)return true;
  return noise&&!this.inside&&Math.hypot(player.x-this.position.x,player.z-this.position.z)<=PURSUIT_NOISE_RANGE;
 }
 /** `pulse` is an active sonar emission; `noise` is engine wash or a knock, audible only nearby. */
 tick(dt:number,player:Vector3,pulse:boolean,noise:boolean,gateOpen:boolean,isolated:boolean,heading=0){
  if(isolated)return;
  const audible=this.hears(player,pulse,noise);
  if(audible){
   if(this.mode!=='hunt')this.orbitDir=this.random()<.5?-1:1;
   this.heard=player.clone().setY(-.5);this.heardHeading=heading;this.mode='hunt';
  }else if(this.mode==='hunt'){this.mode='sniff';this.sniffLeft=SNIFF_SECONDS;this.goal=null;this.pause=.5+this.random();}
  let left=Math.min(dt,1);
  while(left>0){const step=Math.min(left,.025);left-=step;this.step(step,gateOpen);}
 }
 private step(dt:number,gateOpen:boolean){
  if(this.mode==='hunt'&&this.heard){
   const target=this.heard;
   if(hullGap(this.position,target,this.heardHeading)<=PURSUIT_HULL_GAP+.35&&(inCargo(target)===this.inside)){this.prowl(dt,target);return;}
   this.advance(target,HUNT_SPEED*dt,gateOpen,true);return;
  }
  if(this.pause>0){this.pause-=dt;return;}
  if(this.mode==='sniff'){
   // Searching inside the enclosure keeps it there until something else calls it out.
   if(!this.inside){this.sniffLeft-=dt;if(this.sniffLeft<=0){this.mode='roam';this.goal=null;}}
   if(this.mode==='sniff'){
    if(!this.goal){const c=this.heard??this.position,a=this.random()*Math.PI*2,r=1+this.random()*SNIFF_RADIUS;this.goal=new Vector3(c.x+Math.sin(a)*r,this.position.y,c.z+Math.cos(a)*r);if(this.inside)clampInterior(this.goal);}
    if(this.advance(this.goal,SNIFF_SPEED*dt,gateOpen,false)){this.goal=null;this.pause=1.5+this.random()*1.5;}
    return;
   }
  }
  if(!this.goal)this.goal=new Vector3(...ROAM_POINTS[Math.floor(this.random()*ROAM_POINTS.length)]!);
  if(this.advance(this.goal,ROAM_SPEED*dt,gateOpen,false)){this.goal=null;this.pause=2+this.random()*4;}
 }
 /** Circles the heard hull at arm's length instead of freezing against it. */
 private prowl(dt:number,target:Vector3){
  const h=this.heardHeading*Math.PI/180,a=HARBOR_HULL.width/2+PURSUIT_HULL_GAP+.3,b=HARBOR_HULL.length/2+PURSUIT_HULL_GAP+.3;
  const dx=this.position.x-target.x,dz=this.position.z-target.z;
  const lateral=dx*Math.cos(h)+dz*Math.sin(h),forward=dx*Math.sin(h)-dz*Math.cos(h);
  this.orbit=Math.atan2(forward/b,lateral/a)+this.orbitDir*PROWL_SPEED*dt/((a+b)/2);
  if(this.random()<dt*.08)this.orbitDir*=-1;
  const l=Math.cos(this.orbit)*a,f=Math.sin(this.orbit)*b;
  const next=new Vector3(target.x+l*Math.cos(h)+f*Math.sin(h),target.y,target.z+l*Math.sin(h)-f*Math.cos(h));
  if(this.inside)clampInterior(next);
  const delta=next.sub(this.position),distance=delta.length();
  if(distance>1e-4)this.position.addScaledVector(delta,Math.min(distance,PROWL_SPEED*2*dt)/distance);
 }
 /** Moves along the walled route toward `goal`; returns true on arrival. */
 private advance(goal:Vector3,travel:number,gateOpen:boolean,toHull:boolean){
  const next=this.route(goal,gateOpen);
  if(!next)return true;
  if(toHull&&next===goal&&hullGap(this.position,goal,this.heardHeading)<=PURSUIT_HULL_GAP)return true;
  const delta=next.clone().sub(this.position),distance=delta.length();
  if(distance<=.02)return next===goal;
  this.position.addScaledVector(delta,Math.min(distance,travel)/distance);
  return false;
 }
 /** Next waypoint toward `goal` that respects the enclosure walls and the gate; null when it cannot move. */
 private route(goal:Vector3,gateOpen:boolean):Vector3|null{
  const from=this.position,fromInside=this.inside,goalInside=inCargo(goal);
  if(fromInside&&goalInside)return goal;
  if(fromInside){
   if(!gateOpen)return null;
   return from.z<GATE_FRONT.z-.3?GATE_FRONT:goal;
  }
  if(goalInside){
   const inGateway=from.z>INTERIOR.maxZ-.5&&from.z<=WALLS.maxZ+.2&&Math.abs(from.x-GATE_FRONT.x)<4.2;
   const inCorridor=inGateway||(from.z>WALLS.maxZ&&Math.abs(from.x-GATE_FRONT.x)<.4);
   if(!inCorridor)return this.around(GATE_FRONT);
   return gateOpen?goal:(from.distanceTo(GATE_FRONT)>.05?GATE_FRONT:null);
  }
  return this.around(goal);
 }
 private around(goal:Vector3){
  if(!crossesWalls(this.position,goal))return goal;
  let best:Vector3|null=null,cost=Infinity;
  for(const c of DETOURS){if(crossesWalls(this.position,c)||crossesWalls(c,goal))continue;const d=this.position.distanceTo(c)+c.distanceTo(goal);if(d<cost){cost=d;best=c;}}
  return best??GATE_FRONT;
 }
 snapshot(){return {position:this.position.toArray(),heard:this.heard?.toArray()??null,heardHeading:this.heardHeading,mode:this.mode,goal:this.goal?.toArray()??null,pause:this.pause,sniffLeft:this.sniffLeft,orbitDir:this.orbitDir};}
 restore(s:Partial<ReturnType<HarborPursuit['snapshot']>>&{position:number[]}){
  const valid=(a:unknown):a is number[]=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  if(!s||!valid(s.position)||(s.heard!=null&&!valid(s.heard)))return false;
  this.position.fromArray(s.position);this.heard=s.heard?new Vector3().fromArray(s.heard):null;
  this.heardHeading=Number.isFinite(s.heardHeading)?s.heardHeading!:0;
  this.mode=s.mode==='hunt'||s.mode==='sniff'||s.mode==='roam'?s.mode:(this.heard?'sniff':'roam');
  this.goal=valid(s.goal)?new Vector3().fromArray(s.goal):null;
  this.pause=Number.isFinite(s.pause)?s.pause!:0;this.sniffLeft=Number.isFinite(s.sniffLeft)?s.sniffLeft!:SNIFF_SECONDS;
  this.orbitDir=s.orbitDir===-1?-1:1;return true;
 }
}
