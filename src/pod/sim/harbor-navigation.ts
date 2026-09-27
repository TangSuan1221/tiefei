import { Box3, Vector3 } from 'three';

/** Conservative swept cabin envelope, not a camera-point collision test. Metres. */
export const HARBOR_HULL = { width: 2.8, length: 5, height: 3 } as const;
/** Sweep yaw as well as translation: a long hull must not rotate into a wall. */
export function sweepHarborHeading(heading:number,delta:number,clear:(heading:number)=>boolean):number {
  let safe=heading;
  if(!clear(safe)){
    // Repair legacy saves rotated into geometry without teleporting the boat.
    for(let d=1;d<=180;d++){
      if(clear(heading+d)){safe=heading+d;break;}
      if(clear(heading-d)){safe=heading-d;break;}
    }
    if(!clear(safe))return heading;
  }
  const steps=Math.max(1,Math.ceil(Math.abs(delta)/.5)),step=delta/steps;
  for(let i=0;i<steps;i++){if(!clear(safe+step))break;safe+=step;}
  return (safe%360+360)%360;
}
export function hullSamples(position:Vector3, heading:number):Vector3[] {
  const h=heading*Math.PI/180, forward=new Vector3(Math.sin(h),0,-Math.cos(h));
  const right=new Vector3(Math.cos(h),0,Math.sin(h));
  const points:Vector3[]=[];
  for(const z of [-2.5,0,2.5])for(const x of [-1.4,0,1.4])for(const y of [-1.5,0,1.5])
    points.push(position.clone().addScaledVector(forward,z).addScaledVector(right,x).add(new Vector3(0,y,0)));
  return points;
}
export function harborHullClear(position:Vector3,heading:number,walkable:Box3[],solids:Box3[]):boolean {
  const samples=hullSamples(position,heading);
  if(samples.some(p=>!walkable.some(b=>b.containsPoint(p))))return false;
  // Transform each nearby solid into the hull frame. SAT for yaw-only OBB vs AABB.
  const h=heading*Math.PI/180,c=Math.cos(h),s=Math.sin(h);
  for(const box of solids){
    if(box.max.y<position.y-1.5||box.min.y>position.y+1.5)continue;
    const x=(box.min.x+box.max.x)/2-position.x,z=(box.min.z+box.max.z)/2-position.z;
    const ex=(box.max.x-box.min.x)/2,ez=(box.max.z-box.min.z)/2;
    if(Math.abs(x)>ex+Math.abs(c)*1.4+Math.abs(s)*2.5)continue;
    if(Math.abs(z)>ez+Math.abs(s)*1.4+Math.abs(c)*2.5)continue;
    if(Math.abs(x*c+z*s)>1.4+ex*Math.abs(c)+ez*Math.abs(s))continue;
    if(Math.abs(x*s-z*c)>2.5+ex*Math.abs(s)+ez*Math.abs(c))continue;
    return false;
  }
  return true;
}
