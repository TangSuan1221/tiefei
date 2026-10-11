import {Vector3} from 'three';

/** Look ahead along the authored passage, never point through its bend at the
 * final door. Only returns guidance; no input, hull or progression mutation. */
export function harborRouteLookAhead(position:Vector3,route:readonly Vector3[],lookAhead=2.4){
 if(route.length<2)return route[0]?.clone()??position.clone();
 let nearest=Infinity,segment=0,along=0;
 for(let i=0;i<route.length-1;i++){
  const d=route[i+1].clone().sub(route[i]);d.y=0;
  const offset=position.clone().sub(route[i]);offset.y=0;
  const t=Math.max(0,Math.min(1,offset.dot(d)/Math.max(d.lengthSq(),1e-6)));
  const q=route[i].clone().lerp(route[i+1],t);q.y=position.y;
  const distance=q.distanceToSquared(position);
  if(distance<nearest){nearest=distance;segment=i;along=t;}
 }
 // If off the safe centreline, return towards it before cutting the next bend.
 const target=route[segment].clone().lerp(route[segment+1],along);
 if(nearest>4)return target;
 let left=lookAhead;
 for(let i=segment;i<route.length-1;i++){
  const start=i===segment?target:route[i],distance=start.distanceTo(route[i+1]);
  if(distance>=left)return start.clone().lerp(route[i+1],left/distance);
  left-=distance;
 }
 return route[route.length-1].clone();
}
