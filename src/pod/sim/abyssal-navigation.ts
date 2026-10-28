import {Vector3} from 'three';
import {ABYSS_TABLE,ABYSS_TANKS,ABYSS_SOLIDS,ABYSS_GATES,DRAIN,abyssWater,spiralPoint,spiralHeading,type Vec3} from '../content/abyssal-lab-layout';
/** Actual 2.8 × 5 × 3 metre hull, including edges and interior samples. Decor is excluded. */
export function abyssHullClear(p:Vec3,heading:number,sluiceOpen:boolean,drainOpen:boolean,pressClosed=false):boolean {
 const h=heading*Math.PI/180,s=Math.sin(h),c=Math.cos(h);
 for(let ix=0;ix<=4;ix++)for(let iz=0;iz<=8;iz++)for(let iy=0;iy<=4;iy++){
  const x=-1.4+ix*.7,z=-2.5+iz*.625,y=-1.5+iy*.75;
  const q:Vec3=[p[0]+x*c+z*s,p[1]+y,p[2]+x*s-z*c];
  if(!abyssWater(q))return false;
  for(const b of [...ABYSS_TANKS,...ABYSS_SOLIDS])if(q[1]>=b.floor&&q[1]<=b.ceil&&Math.hypot(q[0]-b.centre[0],q[2]-b.centre[2])<b.radius)return false;
  if(q.every((v,i)=>v>=ABYSS_TABLE.min[i]&&v<=ABYSS_TABLE.max[i]))return false;
  if(!drainOpen&&Math.abs(q[1]-DRAIN.top)<.35&&Math.hypot(q[0]-DRAIN.centre[0],q[2]-DRAIN.centre[2])<DRAIN.radius)return false;
  for(const g of ABYSS_GATES){if(g.id==='sluice'?sluiceOpen:!pressClosed)continue;const a=spiralPoint(g.t),gh=spiralHeading(g.t)*Math.PI/180,dx=q[0]-a[0],dz=q[2]-a[2];if(Math.abs(dx*Math.sin(gh)-dz*Math.cos(gh))<.5&&Math.abs(dx*Math.cos(gh)+dz*Math.sin(gh))<g.halfW&&q[1]>=g.floor&&q[1]<=g.ceil)return false;}
 }
 return true;
}
export function abyssSegmentClear(a:Vec3,b:Vec3,heading:number,sluice:boolean,drain:boolean,press=false){const from=new Vector3(...a),to=new Vector3(...b),n=Math.ceil(from.distanceTo(to)/.08);for(let i=1;i<=n;i++){const p=from.clone().lerp(to,i/n);if(!abyssHullClear([p.x,p.y,p.z],heading,sluice,drain,press))return false;}return true;}
