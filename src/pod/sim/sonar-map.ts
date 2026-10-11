import {Box3,Vector3} from 'three';

/** Full local navigation slice, including structures behind the first wall.
 * Only pass structural colliders; creatures keep their separate detection layer. */
export function sonarMapContours(origin:Vector3,heading:number,solids:readonly Box3[],halfExtent:number){
 const a=heading*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return solids.filter(b=>b.max.y>=origin.y-1.5&&b.min.y<=origin.y+1.5).map(b=>
  [[b.min.x,b.min.z],[b.max.x,b.min.z],[b.max.x,b.max.z],[b.min.x,b.max.z]].map(([x,z])=>{
   const dx=x-origin.x,dz=z-origin.z;return {x:dx*c+dz*s,y:-dx*s+dz*c};
  })
 ).filter(p=>Math.min(...p.map(q=>q.x))<=halfExtent&&Math.max(...p.map(q=>q.x))>=-halfExtent&&Math.min(...p.map(q=>q.y))<=halfExtent&&Math.max(...p.map(q=>q.y))>=-halfExtent);
}
