import {Box3,PerspectiveCamera,Ray,Vector3} from 'three';

export interface WindowTarget {id:string;bounds:Box3;reach:number;enabled:boolean;verifiedDistance?:number}
export interface WindowLock {rect:[number,number,number,number];kind:'obstacle'|'target';focused:boolean;id?:string;distance?:number}

// Scratch storage is private to this synchronous projection; only scalar rects
// escape. Reuse eight world corners and their camera-space depths per box.
const rectCorners=Array.from({length:8},()=>new Vector3());
const rectDepths=new Float64Array(8);
const rectPoints=Array.from({length:20},()=>new Vector3());
const rectCameraPoint=new Vector3();
/** Near-plane clipped bounds, in window NDC. No light/sonar dependency. */
export function windowRect(b:Box3,camera:PerspectiveCamera):WindowLock['rect']|null{
 const near=-camera.near;let count=0;
 for(let i=0;i<8;i++){
  const point=rectCorners[i].set(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z);
  rectDepths[i]=rectCameraPoint.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
 }
 for(let i=0;i<8;i++){
  const a=rectCorners[i],za=rectDepths[i];
  if(za<=near)rectPoints[count++].copy(a);
  for(const bit of [1,2,4])if(!(i&bit)){
   const zb=rectDepths[i|bit];
   if((za-near)*(zb-near)<0)rectPoints[count++].copy(a).lerp(rectCorners[i|bit],(near-za)/(zb-za));
  }
 }
 if(!count)return null;
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(let i=0;i<count;i++){const p=rectPoints[i].project(camera);x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 const r:WindowLock['rect']=[Math.max(-.98,x0),Math.max(-.98,y0),Math.min(.98,x1),Math.min(.98,y1)];
 return r[0]<r[2]&&r[1]<r[3]?r:null;
}
/** Optical target range is visible on approach; focus never extends interaction reach. */
export function collectWindowLocks(camera:PerspectiveCamera,solids:readonly Box3[],targets:readonly WindowTarget[]):WindowLock[]{
 const origin=camera.getWorldPosition(new Vector3()),direction=camera.getWorldDirection(new Vector3());
 const ray=new Ray(origin,direction),point=new Vector3();
 const near=targets.filter(t=>t.enabled&&t.bounds.distanceToPoint(origin)<=8);
 let selected:WindowTarget|undefined,closest=Infinity;
 for(const t of near){
  if(t.verifiedDistance===undefined&&!ray.intersectBox(t.bounds,point))continue;
  const distance=t.verifiedDistance??point.distanceTo(origin);
  if(distance>8||distance>=closest)continue;
  if(t.verifiedDistance===undefined&&solids.some(b=>b!==t.bounds&&!b.equals(t.bounds)&&ray.intersectBox(b,point)&&point.distanceTo(origin)<distance-.08))continue;
  selected=t;closest=distance;
 }
 if(!selected)return [];
 const rect=windowRect(selected.bounds,camera);return rect?[{id:selected.id,rect,kind:'target',focused:closest<=Math.min(selected.reach,3.4),distance:closest}]:[];
}

/** Visual acquisition only; never delays or authorizes the actual interaction. */
export class WindowFocus {
 private id:string|undefined;private since=0;
 update(id:string|undefined,now:number):number {
  if(id!==this.id||now<this.since){this.id=id;this.since=now;}
  return id?Math.min(1,Math.max(0,(now-this.since)/450)):0;
 }
}
export class WindowLocks {
 private focus=new WindowFocus();
 reset(){this.focus=new WindowFocus();}
 draw(ctx:CanvasRenderingContext2D,w:number,h:number,camera:PerspectiveCamera,solids:()=>readonly Box3[],targets:()=>readonly WindowTarget[]){
  const available=targets();
  // No collider traversal when there is no close interaction at all.
  const origin=camera.getWorldPosition(new Vector3());
  const close=available.filter(t=>t.enabled&&t.bounds.distanceToPoint(origin)<=8);
  const lock=close.length?collectWindowLocks(camera,solids(),close)[0]:undefined;
  const progress=this.focus.update(lock?.focused?lock.id:undefined,performance.now());if(!lock)return;
  ctx.save();
  // Compact camera-focus brackets, not a bounding box around a door or entire room.
  const eased=1-Math.pow(1-progress,3);
  const size=h*(.09+(1-eased)*.035),x=w/2-size/2,y=h/2-size/2,n=size*.15;
  ctx.strokeStyle=progress===1?'rgba(205,222,200,.82)':'rgba(192,206,204,.52)';
  ctx.lineWidth=Math.max(.8,h/720);ctx.lineCap='butt';ctx.lineJoin='miter';
  // A faint offset shadow separates the etched line from bright metal without an outline.
  ctx.shadowColor='rgba(5,14,16,.45)';ctx.shadowBlur=1;ctx.shadowOffsetY=1;
  ctx.beginPath();for(const [px,py,sx,sy]of [[x,y,1,1],[x+size,y,-1,1],[x,y+size,1,-1],[x+size,y+size,-1,-1]]){ctx.moveTo(px,py+sy*n);ctx.lineTo(px,py);ctx.lineTo(px+sx*n,py);}
  ctx.stroke();
  // Acquisition fills a small split index; settled geometry carries the state without text.
  ctx.globalAlpha=.35+.45*eased;ctx.beginPath();
  const indexY=y+size+h*.014,span=h*.013*eased;
  ctx.moveTo(w/2-2-span,indexY);ctx.lineTo(w/2-2,indexY);
  ctx.moveTo(w/2+2,indexY);ctx.lineTo(w/2+2+span,indexY);ctx.stroke();
  ctx.globalAlpha=1;ctx.font=`${h*.022}px "Consolas",monospace`;
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#c3d6b3';
  ctx.shadowColor='rgba(0,0,0,.95)';ctx.shadowBlur=2;ctx.shadowOffsetY=1;
  ctx.fillText(`${lock.distance!.toFixed(1)} m`,x+size+h*.018,h/2);ctx.restore();
 }
}
