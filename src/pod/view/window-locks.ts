import {Box3,PerspectiveCamera,Ray,Vector3} from 'three';
import {CRT_FONT,PHOSPHOR,fineStroke,phosphorText} from './crt-hud';

export interface WindowTarget {id:string;bounds:Box3;reach:number;enabled:boolean;verifiedDistance?:number;label?:string}
export interface WindowLock {rect:[number,number,number,number];kind:'obstacle'|'target';focused:boolean;id?:string;distance?:number;label?:string}

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
 const rect=windowRect(selected.bounds,camera);return rect?[{id:selected.id,rect,kind:'target',focused:closest<=Math.min(selected.reach,3.4),distance:closest,...(selected.label?{label:selected.label}:{})}]:[];
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
  const progress=this.focus.update(lock?.focused?lock.id:undefined,performance.now());
  const eased=1-Math.pow(1-progress,3),s=h/720,cx=w/2,cy=h/2;
  ctx.save();ctx.lineCap='butt';
  // The only standing instrument: paired side arcs and a split crosshair.
  // They settle inward and brighten as a reachable target is acquired.
  const scale=1.14-.14*eased,alpha=lock?.62+.3*eased:.45;
  const r1=88*s*scale,r2=104*s*scale;
  ctx.beginPath();
  for(const a of [0,Math.PI])for(const [r,spread] of [[r1,.62],[r2,.74]] as const){
   ctx.moveTo(cx+Math.cos(a-spread)*r,cy+Math.sin(a-spread)*r);ctx.arc(cx,cy,r,a-spread,a+spread);
  }
  for(const side of [-1,1]){ctx.moveTo(cx+side*12*s,cy);ctx.lineTo(cx+side*r2,cy);}
  fineStroke(ctx,alpha,s);
  if(!lock){ctx.restore();return;}
  // Name plate under the reticle: hazard-hatched strip, name, then a pale range bar.
  const name=lock.label??'',range=`${lock.distance!.toFixed(1)} m`;
  let nameSize=24*s;ctx.font=`${nameSize}px ${CRT_FONT.pixel}`;
  const maxW=w*.6;let nameW=ctx.measureText(name).width;
  if(nameW>maxW-24*s){nameSize*=(maxW-24*s)/nameW;ctx.font=`${nameSize}px ${CRT_FONT.pixel}`;nameW=ctx.measureText(name).width;}
  const tw=Math.min(maxW,Math.max(220*s,nameW+32*s)),x=cx-tw/2;
  let y=cy+r2+26*s;
  const hatch=7*s;
  ctx.save();ctx.beginPath();ctx.rect(x,y,tw,hatch);ctx.clip();
  ctx.fillStyle='rgba(0,6,3,.7)';ctx.fillRect(x,y,tw,hatch);
  ctx.strokeStyle=`rgba(226,236,229,${.45+.45*eased})`;ctx.lineWidth=1.6*s;ctx.beginPath();
  // The hatch fills left to right while focus settles.
  const fill=lock.focused?tw*eased:0;
  for(let hx=x-hatch;hx<x+Math.max(fill,tw*.18);hx+=5*s){ctx.moveTo(hx,y+hatch);ctx.lineTo(hx+hatch,y);}
  ctx.stroke();ctx.restore();
  y+=hatch;
  if(name){
   const nh=30*s;ctx.fillStyle='rgba(0,6,3,.72)';ctx.fillRect(x,y,tw,nh);
   ctx.textAlign='center';ctx.textBaseline='middle';
   phosphorText(ctx,name,cx,y+nh/2+s,PHOSPHOR.tagInk);y+=nh;
  }
  const bh=24*s;ctx.fillStyle='rgba(226,236,229,.9)';ctx.fillRect(x,y+2*s,tw,bh);
  ctx.font=`${21*s}px ${CRT_FONT.mono}`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#18231c';ctx.fillText(range,cx,y+2*s+bh/2+s);
  ctx.restore();
 }
}
