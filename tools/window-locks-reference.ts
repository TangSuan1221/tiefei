// Golden pre-optimization AABB visibility algorithm, retained only for exact parity checks.
import {Box3,PerspectiveCamera,Ray,Vector3} from 'three';

export interface WindowTarget {id:string;bounds:Box3;reach:number;enabled:boolean}
export interface WindowLock {rect:[number,number,number,number];kind:'obstacle'|'target';focused:boolean}

/** Near-plane clipped bounds, in window NDC. No light/sonar dependency. */
export function windowRect(b:Box3,camera:PerspectiveCamera):WindowLock['rect']|null{
 const near=-camera.near,points:Vector3[]=[];
 const corner=(i:number)=>new Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z);
 for(let i=0;i<8;i++){
  const a=corner(i),za=a.clone().applyMatrix4(camera.matrixWorldInverse).z;
  if(za<=near)points.push(a);
  for(const bit of [1,2,4])if(!(i&bit)){
   const b=corner(i|bit),zb=b.clone().applyMatrix4(camera.matrixWorldInverse).z;
   if((za-near)*(zb-near)<0)points.push(a.clone().lerp(b,(near-za)/(zb-za)));
  }
 }
 if(!points.length)return null;
 const p=points.map(p=>p.project(camera));
 const r:WindowLock['rect']=[Math.max(-.98,Math.min(...p.map(p=>p.x))),Math.max(-.98,Math.min(...p.map(p=>p.y))),Math.min(.98,Math.max(...p.map(p=>p.x))),Math.min(.98,Math.max(...p.map(p=>p.y)))];
 return r[0]<r[2]&&r[1]<r[3]?r:null;
}

export function collectWindowLocks(camera:PerspectiveCamera,solids:readonly Box3[],targets:readonly WindowTarget[]):WindowLock[]{
 const origin=camera.position,hit=new Vector3();
 const candidates=solids.filter(b=>b.distanceToPoint(origin)<camera.far).map(bounds=>({bounds,rect:windowRect(bounds,camera)})).filter(v=>v.rect);
 // Test rays across the projected surface, not just the world-box centre:
 // large walls may have their centre outside the window or behind the eye.
 const visible=(bounds:Box3,r:WindowLock['rect'])=>{
  for(const fx of [.5,.15,.85])for(const fy of [.5,.15,.85]){
   const p=new Vector3(r[0]+(r[2]-r[0])*fx,r[1]+(r[3]-r[1])*fy,.5).unproject(camera);
   const ray=new Ray(origin,p.sub(origin).normalize());
   if(!ray.intersectBox(bounds,hit))continue;
   const distance=hit.distanceTo(origin);
   if(distance>camera.far)continue;
   if(!candidates.some(c=>c.bounds!==bounds&&ray.intersectBox(c.bounds,hit)&&hit.distanceTo(origin)<distance-.08))return distance;
  }
  return null;
 };
 const blue:WindowLock[]=[];const shown:Box3[]=[];
 for(const t of targets){
  const rect=windowRect(t.bounds,camera);if(!rect)continue;
  const distance=visible(t.bounds,rect);if(distance===null)continue;
  shown.push(t.bounds);blue.push({rect,kind:'target',focused:t.enabled&&distance<=t.reach});
 }
 const red:WindowLock[]=[];
 for(const c of candidates){
  if(shown.some(b=>b.containsBox(c.bounds)||c.bounds.equals(b)))continue;
  if(visible(c.bounds,c.rect!)!==null)red.push({rect:c.rect!,kind:'obstacle',focused:false});
 }
 return [...red,...blue];
}


