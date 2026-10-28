// Level 3 layout: a 2.8×5×3 m hull (MET-002) must drive the whole spiral, reach
// every arm target and call window, and see every required photo subject.
// Only the pod's water is checked: Elias's side exists only in generated video.
// The containment pit must be explored top to bottom: the upper exit is blocked
// and the only way on leaves from the pit floor.
// The spiral is curved, so walls are implicit: anything outside abyssWater() is solid.
import {Vector3} from 'three';
import {
 ABYSS_SPACES,ABYSS_ITEMS,ABYSS_WINDOWS,ABYSS_PHOTO_STATIONS,ABYSS_TANKS,ABYSS_TABLE,ABYSS_GATES,ABYSS_SPAWN,ABYSS_EXIT_Y,
 ELIAS_ROUTE,CARETAKER_ROUTE,JELLY_TANKS,ABYSS_SOLIDS,ABYSS_SPACES as SPACES,PIT,CAGE_07,pitAt,pitDescent,abyssWater,abyssSpaceAt,podRoute,spiralPoint,spiralRadius,alarmBeacons,type Vec3,
} from '../src/pod/content/abyssal-lab-layout';

let failures=0;const fail=(m:string)=>{failures++;console.error('FAIL',m);};
const v=(p:Vec3)=>new Vector3(...p),fmt=(p:Vector3|Vec3)=>(Array.isArray(p)?p:(p as Vector3).toArray()).map(n=>(n as number).toFixed(1)).join(',');

/** Dense hull sampling (5×9×5) with an optional clearance margin on every side. */
function hullClear(p:Vector3,heading:number,margin=0):boolean{
 const h=heading*Math.PI/180,f=new Vector3(Math.sin(h),0,-Math.cos(h)),r=new Vector3(Math.cos(h),0,Math.sin(h));
 const hw=1.4+margin,hl=2.5+margin,hh=1.5+Math.min(margin,.5);
 for(let i=0;i<=4;i++)for(let j=0;j<=8;j++)for(let k=0;k<=4;k++){
  const q=p.clone().addScaledVector(r,-hw+hw*i/2).addScaledVector(f,-hl+hl*j/4).add(new Vector3(0,-hh+hh*k/2,0));
  if(!abyssWater([q.x,q.y,q.z]))return false;
  for(const t of [...ABYSS_TANKS,...ABYSS_SOLIDS])if(q.y>=t.floor&&q.y<=t.ceil&&Math.hypot(q.x-t.centre[0],q.z-t.centre[2])<=t.radius)return false;
  if(q.x>=ABYSS_TABLE.min[0]&&q.x<=ABYSS_TABLE.max[0]&&q.y>=ABYSS_TABLE.min[1]&&q.y<=ABYSS_TABLE.max[1]&&q.z>=ABYSS_TABLE.min[2]&&q.z<=ABYSS_TABLE.max[2])return false;
 }
 return true;
}
const lerpTop=(t:number)=>{const j=SPACES.find(x=>x.id==='J')!.shapes[0] as {top:readonly (readonly [number,number])[]};const [[a,ya],[b,yb]]=j.top;return ya+(yb-ya)*(t-a)/(b-a);};
const headingOf=(d:Vector3,prev:number)=>Math.hypot(d.x,d.z)>.3?(Math.atan2(d.x,-d.z)*180/Math.PI+360)%360:prev;

// 1. Main route: turn in place, then sweep every 0.25 m. Record tightest side margin.
const start=v(ABYSS_SPAWN.position);
if(!hullClear(start,ABYSS_SPAWN.heading))fail('spawn blocked');
let heading=ABYSS_SPAWN.heading,at=start,metres=0,tight=Infinity;
const legs=podRoute();
for(const [i,leg] of legs.entries()){
 const b=v(leg.to),d=b.clone().sub(at);
 const want=leg.reverse?heading:headingOf(d,heading);
 const delta=((want-heading+540)%360)-180,steps=Math.ceil(Math.abs(delta)/2);
 for(let s=1;s<=steps;s++){const h=heading+delta*s/steps;if(!hullClear(at,h)){fail(`turn ${i} at ${fmt(at)} ${heading.toFixed(0)}→${want.toFixed(0)} blocked at ${h.toFixed(0)}`);break;}}
 heading=want;
 const n=Math.ceil(d.length()/.25);
 for(let s=1;s<=n;s++){
  const p=at.clone().addScaledVector(d,s/n);
  if(!hullClear(p,heading)){fail(`leg ${i} ${fmt(at)}→${fmt(b)} blocked at ${fmt(p)} (${abyssSpaceAt([p.x,p.y,p.z])})`);break;}
  let m=0;while(m<3&&hullClear(p,heading,m+.1))m+=.1;tight=Math.min(tight,m);
 }
 metres+=d.length();at=b;
}
if(at.y>ABYSS_EXIT_Y)fail('route does not reach the exit depth');
console.log(`route: ${legs.length} legs, ${metres.toFixed(0)} m, tightest hull clearance ${tight.toFixed(1)} m`);
if(tight<.5)fail(`route clearance ${tight.toFixed(2)} m < 0.5 m`);

// 2. The closed sluice must really cut the channel; the press sits on the route.
for(const g of ABYSS_GATES){
 const crossed=legs.some((l,i)=>{const a=i?v(legs[i-1].to):start,b=v(l.to);const ta=Math.atan2(a.z,a.x),tb=Math.atan2(b.z,b.x),tg=Math.atan2(spiralPoint(g.t)[2],spiralPoint(g.t)[0]);
  const between=(x:number,y:number,z:number)=>{const d1=((z-x+3*Math.PI)%(2*Math.PI))-Math.PI,d2=((y-z+3*Math.PI)%(2*Math.PI))-Math.PI;return d1>=0&&d2>=0&&d1+d2<Math.PI/2;};
  return between(ta,tb,tg)&&Math.abs(Math.hypot(a.x,a.z)-spiralRadius(g.t))<12;});
 if(!crossed)fail(`gate ${g.id} is not on the pod route`);
}

// 3. Arm targets: legal parking pose facing the item, centre→face ≤3.3 m (3.4 m ray).
for(const item of ABYSS_ITEMS){
 const f=item.face*Math.PI/180,dir=new Vector3(Math.sin(f),0,-Math.cos(f)),face=item.kind==='box'?.48:.3;
 let ok=false;
 for(const standoff of [3.0,3.2,3.4,3.6]){
  const p=v(item.position).addScaledVector(dir,standoff);p.y=0;
  if(hullClear(p,(item.face+180)%360)){ok=standoff-face<=3.3;console.log(`${ok?'ok ':'FAR'} ${item.id} park ${fmt(p)} centre→face ${(standoff-face).toFixed(2)} m`);break;}
 }
 if(!ok)fail(`no parking pose for ${item.id}`);
}

// 4. Call windows: the pod pose is legal water and within call radius of the glass.
for(const w of ABYSS_WINDOWS){
 if(!hullClear(v(w.pod),w.podHeading))fail(`${w.id} pod pose blocked`);
 const dist=v(w.pod).distanceTo(v(w.window));
 if(dist>w.radius)fail(`${w.id} window ${dist.toFixed(1)} m > call radius`);
 console.log(`ok  ${w.id} ${w.name} pod ${fmt(w.pod)} → window ${dist.toFixed(1)} m`);
}

// 5. Photo stations: pod legal, distance band, line of sight through water.
const subjectLimit:Record<string,[number,number]>={P01:[6,22],P02:[6,14],P03:[6,24],P04:[6,14],P05:[6,14],P06:[6,24]};
for(const s of ABYSS_PHOTO_STATIONS){
 const p=v(s.position),t=v(s.target),dist=p.distanceTo(t);
 if(!hullClear(p,s.heading))fail(`${s.id} pod pose blocked`);
 const [lo,hi]=subjectLimit[s.id];if(dist<lo||dist>hi)fail(`${s.id} distance ${dist.toFixed(1)} m outside ${lo}–${hi}`);
 const n=Math.ceil(dist/.5);let blocked=false;
 for(let i=1;i<n;i++){const q=p.clone().lerp(t,i/n);if(q.distanceTo(t)<1.8)break;if(!abyssWater([q.x,q.y,q.z])){blocked=true;break;}}
 if(blocked)fail(`${s.id} line of sight blocked`);
 console.log(`ok  ${s.id} ${s.name} ${dist.toFixed(1)} m, heading ${s.heading.toFixed(0)}°, pitch ${s.pitch.toFixed(0)}°`);
}
// P02 must show the jellyfish tanks inside a 64° vertical / ~100° horizontal view.
{const s=ABYSS_PHOTO_STATIONS.find(x=>x.id==='P02')!,h=s.heading*Math.PI/180;
 for(const n of JELLY_TANKS){const c=ABYSS_TANKS[n-1].centre,dx=c[0]-s.position[0],dz=c[2]-s.position[2];
  const ang=Math.abs(((Math.atan2(dx,-dz)-h)*180/Math.PI+540)%360-180);if(ang>50)fail(`P02 misses tank ${n} (${ang.toFixed(0)}°)`);}}

// 6. Exploration: the pit is the showpiece, so it must be big, deep and only passable top to bottom.
if(PIT.radius*2<60||PIT.ceil-PIT.floor<60)fail(`pit only ${PIT.radius*2} m wide, ${PIT.ceil-PIT.floor} m tall`);
const levels=legs.map(l=>l.to[1]),deepest=Math.min(...levels);
if(deepest>PIT.floor+8)fail('route never reaches the pit floor');
// The old rim exit is a dead end: beyond the stub there is no water at rim height,
// so the only way to the plant is the tunnel leaving the pit floor.
{let leak=0;for(let t=5.33;t<=5.7;t+=.01)for(const y of [-5,0,5])if(abyssWater(spiralPoint(t,0,y)))leak++;
 if(leak)fail(`${leak} rim-height water samples beyond the collapsed exit`);
 const mouth=lerpTop(5.1);if(mouth>PIT.floor+12)fail(`bottom tunnel mouth at y ${mouth} is not at the pit floor`);}
// The collapsed crane fills the stub: the hull cannot drive into the old exit.
{const p=v(spiralPoint(5.26,0,0));if(hullClear(p,headingOf(v(spiralPoint(5.3)).sub(v(spiralPoint(5.2))),0)))fail('old rim exit is not blocked by the crane');}
// The spiral descent stays clear of the cage wall (exploring it should feel generous).
{let m=9;for(const p of pitDescent()){const d=Math.hypot(p[0]-PIT.centre[0],p[2]-PIT.centre[2]);m=Math.min(m,PIT.radius-d);}if(m<6)fail(`descent only ${m.toFixed(1)} m from the cage wall`);}
// Cage 07 and the trough are on the floor, under the descent.
if(CAGE_07.y>PIT.floor+10)fail('cage 07 is not on the bottom tier');
if(CARETAKER_ROUTE.length<6)fail('caretaker route too short');
console.log(`pit: ${PIT.radius*2} m across, ${PIT.ceil-PIT.floor} m tall, route reaches y ${deepest.toFixed(0)}`);
const beacons=alarmBeacons();if(beacons.length<100)fail(`only ${beacons.length} alarm beacons`);

// 7. Space sizes (plan-view report).
for(const s of ABYSS_SPACES)console.log(`space ${s.id} ${s.name}: ${s.shapes.length} shape(s)`);
console.log(failures?`${failures} failures`:`PASS abyssal layout: ${legs.length}-leg route (pit explored top to bottom), ${ABYSS_ITEMS.length} arm targets, ${ABYSS_WINDOWS.length} call windows, ${ABYSS_PHOTO_STATIONS.length} photo stations clear for 2.8×5×3 hull; ${beacons.length} alarm beacons`);
process.exit(failures?1:0);
