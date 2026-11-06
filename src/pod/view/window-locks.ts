import {Box3,PerspectiveCamera,Ray,Vector3} from 'three';
import {portholeFont,portholeText,PORTHOLE_INK} from './crt-hud';

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
  ctx.strokeStyle=PORTHOLE_INK.text;ctx.globalAlpha=alpha;ctx.lineWidth=s;ctx.shadowColor=PORTHOLE_INK.glow;ctx.shadowBlur=5*s;ctx.stroke();ctx.globalAlpha=1;
  if(!lock){ctx.restore();return;}
  // Reverse-video name strip uses the same ink as the other window instruments.
  const name=lock.label??'',range=`${lock.distance!.toFixed(1)}m`;
  let nameSize=28*s;ctx.font=portholeFont(nameSize);
  const maxW=w*.6,nameW=ctx.measureText(name).width;
  if(nameW>maxW){nameSize*=maxW/nameW;ctx.font=portholeFont(nameSize);}
  const y=cy+r2+40*s;
  ctx.textAlign='center';ctx.textBaseline='middle';
  const fittedNameW=ctx.measureText(name).width;
  ctx.font=portholeFont(26*s);
  const plateW=Math.max(fittedNameW,ctx.measureText(range).width)+28*s;
  ctx.shadowBlur=0;
  if(name){
   ctx.fillStyle=PORTHOLE_INK.text;
   ctx.fillRect(cx-plateW/2,y-19*s,plateW,38*s);
   ctx.fillStyle=PORTHOLE_INK.dark;ctx.font=portholeFont(nameSize);ctx.fillText(name,cx,y);
  }
  ctx.font=portholeFont(26*s);portholeText(ctx,range,cx,y+(name?38*s:0));
  ctx.restore();
 }
}
