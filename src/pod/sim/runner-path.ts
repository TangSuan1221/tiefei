import {Box3,Vector3} from 'three';
/** Local 3-D navigation, including vertical shafts; swept clearance prevents corner cutting. */
export function runnerNavigation(origin:Vector3,walkable:Box3[],solids:Box3[]){
 const radius=.55,probe=new Box3(),margin=new Vector3(radius,radius,radius);
 const clear=(p:Vector3)=>{
  for(const x of [-radius,radius])for(const y of [-radius,radius])for(const z of [-radius,radius])
   if(!walkable.some(b=>b.containsPoint(new Vector3(p.x+x,p.y+y,p.z+z))))return false;
  probe.set(p.clone().sub(margin),p.clone().add(margin));return !solids.some(b=>b.intersectsBox(probe));
 };
 const segment=(a:Vector3,b:Vector3)=>{const n=Math.ceil(a.distanceTo(b)/.25);for(let i=1;i<=n;i++)if(!clear(a.clone().lerp(b,i/n)))return false;return true;};
 const nodes=[{p:origin.clone(),parent:-1,d:0}],seen=new Set(['0,0,0']);
 for(let i=0;i<nodes.length&&nodes.length<4500;i++){
  const a=nodes[i];if(a.d>=24)continue;
  for(const v of [[1.5,0,0],[-1.5,0,0],[0,0,1.5],[0,0,-1.5],[0,1.5,0],[0,-1.5,0]]){
   const p=a.p.clone().add(new Vector3(...v)),k=p.clone().sub(origin).toArray().map(x=>Math.round(x/1.5)).join(',');
   if(seen.has(k))continue;seen.add(k);if(!segment(a.p,p))continue;nodes.push({p,parent:i,d:a.d+1.5});
  }
 }
 const path=(index:number)=>{const result:Vector3[]=[];while(index>=0){result.push(nodes[index].p.clone());index=nodes[index].parent;}return result;};
 return {nodes,path,segment};
}
