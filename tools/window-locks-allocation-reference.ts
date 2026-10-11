import {Box3,Frustum,Matrix4,PerspectiveCamera,Ray,Vector3} from 'three';

export interface WindowTarget {id:string;bounds:Box3;reach:number;enabled:boolean}
export interface WindowLock {rect:[number,number,number,number];kind:'obstacle'|'target';focused:boolean}

type OcclusionNode={bounds:Box3;items?:Box3[];left?:OcclusionNode;right?:OcclusionNode};
const occlusionTrees=new WeakMap<PerspectiveCamera,{solids:Box3[];tree:OcclusionNode}>();
function buildOcclusionTree(boxes:Box3[]):OcclusionNode{
 const bounds=new Box3();for(const box of boxes)bounds.union(box);
 if(boxes.length<=8)return {bounds,items:boxes};
 const extent=bounds.getSize(new Vector3());
 const axis=extent.x>=extent.y&&extent.x>=extent.z?'x':extent.y>=extent.z?'y':'z';
 boxes.sort((a,b)=>(a.min[axis]+a.max[axis])-(b.min[axis]+b.max[axis]));
 const middle=boxes.length>>1;
 return {bounds,left:buildOcclusionTree(boxes.slice(0,middle)),right:buildOcclusionTree(boxes.slice(middle))};
}
function refitOcclusionTree(node:OcclusionNode):void{
 node.bounds.makeEmpty();
 if(node.items){for(const box of node.items)node.bounds.union(box);return;}
 refitOcclusionTree(node.left!);refitOcclusionTree(node.right!);
 node.bounds.union(node.left!.bounds).union(node.right!.bounds);
}

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
 const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const candidates=solids.filter(b=>b.distanceToPoint(origin)<camera.far&&frustum.intersectsBox(b)).map(bounds=>({bounds,rect:windowRect(bounds,camera)})).filter(v=>v.rect);
 // Keep the exact original candidate set. Refit every call so moving doors
 // remain correct; rebuild only when their membership or identity changes.
 const candidateBoxes=candidates.map(c=>c.bounds);
 let cached=occlusionTrees.get(camera);
 if(!cached||cached.solids.length!==candidateBoxes.length||cached.solids.some((b,i)=>b!==candidateBoxes[i])){
  cached={solids:candidateBoxes,tree:buildOcclusionTree([...candidateBoxes])};occlusionTrees.set(camera,cached);
 }else refitOcclusionTree(cached.tree);
 const tree=cached.tree;
 const nearerFirst=(node:OcclusionNode):void=>{
  if(node.items)return;
  if(node.left!.bounds.distanceToPoint(origin)>node.right!.bounds.distanceToPoint(origin)){
   const left=node.left;node.left=node.right;node.right=left;
  }
  nearerFirst(node.left!);nearerFirst(node.right!);
 };
 nearerFirst(tree);
 const broadHit=new Vector3();
 const occluded=(node:OcclusionNode,ray:Ray,own:Box3,limit:number):boolean=>{
  if(node.bounds.isEmpty())return false;
  // Ray.intersectBox returns the exit when the origin is inside. Such nodes
  // must not be discarded using that exit distance: a child can be nearer.
  if(!node.bounds.containsPoint(origin)){
   if(!ray.intersectBox(node.bounds,broadHit)||broadHit.distanceTo(origin)>=limit)return false;
  }
  if(node.items)return node.items.some(b=>b!==own&&ray.intersectBox(b,hit)&&hit.distanceTo(origin)<limit);
  return occluded(node.left!,ray,own,limit)||occluded(node.right!,ray,own,limit);
 };
 // Test rays across the projected surface, not just the world-box centre:
 // large walls may have their centre outside the window or behind the eye.
 const visible=(bounds:Box3,r:WindowLock['rect'])=>{
  for(const fx of [.5,.15,.85])for(const fy of [.5,.15,.85]){
   const p=new Vector3(r[0]+(r[2]-r[0])*fx,r[1]+(r[3]-r[1])*fy,.5).unproject(camera);
   const ray=new Ray(origin,p.sub(origin).normalize());
   if(!ray.intersectBox(bounds,hit))continue;
   const distance=hit.distanceTo(origin);
   if(distance>camera.far)continue;
   if(!occluded(tree,ray,bounds,distance-.08))return distance;
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

export class WindowLocks {
 private at=-Infinity;private locks:WindowLock[]=[];
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,camera:PerspectiveCamera,solids:()=>readonly Box3[],targets:()=>readonly WindowTarget[]){
  const now=performance.now();
  if(now-this.at>=100){this.locks=collectWindowLocks(camera,solids(),targets());this.at=now;}
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  for(const lock of this.locks){
   // Full-window walls put their corners under the octagonal steel flange.
   // Inset only the brackets at the optical edges so warnings remain visible.
   const r=lock.rect,x=Math.max(w*.1,(r[0]+1)*w/2),y=Math.max(h*.1,(1-r[3])*h/2);
   const rw=Math.max(4,Math.min(w*.9,(r[2]+1)*w/2)-x),rh=Math.max(4,Math.min(h*.9,(1-r[1])*h/2)-y);
   const n=Math.min(18,rw*.24,rh*.24);
   // Phosphor styling is restricted to existing UI strokes, never the live feed.
   ctx.strokeStyle=lock.kind==='target'?'#b6e889':'#d59b57';
   ctx.shadowColor=lock.kind==='target'?'#78b74e':'#895421';ctx.shadowBlur=lock.focused?4:1.5;
   ctx.globalAlpha=lock.focused?.95:.72;ctx.lineWidth=lock.focused?2:1;
   ctx.beginPath();for(const [px,py,sx,sy]of [[x,y,1,1],[x+rw,y,-1,1],[x,y+rh,1,-1],[x+rw,y+rh,-1,-1]]){ctx.moveTo(px,py+sy*n);ctx.lineTo(px,py);ctx.lineTo(px+sx*n,py);}ctx.stroke();
   if(lock.focused){ctx.strokeRect(x-4,y-4,rw+8,rh+8);const cx=x+rw/2,cy=y+rh/2;ctx.beginPath();ctx.moveTo(cx-5,cy);ctx.lineTo(cx+5,cy);ctx.moveTo(cx,cy-5);ctx.lineTo(cx,cy+5);ctx.stroke();}
  }
  ctx.restore();
 }
}

