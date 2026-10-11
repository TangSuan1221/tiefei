import {LIVING_CREATURES,LIVING_DOORS,LIVING_ITEMS,LIVING_SPACES,livingSolids,type Aabb,type CreatureType,type LivingDoor,type LivingSpace,type Vec3} from '../content/living-deck-layout';

/** Deck-two fauna. Pure simulation: positions stay inside pod-walkable spaces and cross only through open doorways. */
export type CreatureMode='idle'|'drift'|'seek'|'cling'|'recoil'|'hunt'|'sniff'|'sleep'|'swarm'|'return';
export interface CreatureView {id:string;type:CreatureType;position:Vec3;heading:number;mode:CreatureMode;identified:boolean}
export interface CreatureInput {pod:Vec3;heading:number;lampOn:boolean;lampRange:number;lampHalfAngle:number;pulse:boolean;speed:number;noiseBursts:{position:Vec3;loudness:number}[];armOut:boolean;gateOpen:boolean;extraLumens:number}
export interface CreatureResult {damage:number;events:string[];lensBlocked:boolean;armBlocked:boolean;itemsBlocked:string[];clinging:string[];shake:number;cues:string[];
 /** Displacement the adapter should apply to the pod (shade bite shove), metres. */
 push:Vec3}
export interface PassiveContact {id:string;type:CreatureType;bearing:number;intensity:number;identified:boolean;frequency:number}

export const LIVING_CREATURE_TUNING=Object.freeze({
 lumen:{cone:26,near:4,speed:1.1,returnSpeed:1.1,patrol:.35,linger:4,notice:3,cling:1,clingTick:5,clingDamage:.02,release:4,above:1.9,
  /** After letting go it ignores the lamp this long (s) while it swims home, so the player gets a lit window. */
  shy:25},
 shade:{range:14,glare:3,dark:25,bite:4,biteDamage:.06,biteCooldown:3,push:1.5,speed:1.6,returnSpeed:1},
 /**
  * lock: it only rams a pod it heard within the last `lock` s (pulse, wash, or a burst within `podBurst` m of the hull);
  * reaching a silent pod it only brushes past (`brush` m, once per `brushCooldown` s). After a ram it backs off `recoil` s
  * and ignores engine wash for `deaf` s (pulses and clanks still carry).
  */
 blind:{pulse:24,wash:10,washSpeed:.45,noise:30,speed:1.7,patrol:.8,sniff:6,memory:8,notice:3,rest:12,sniffRadius:4,sniffSpeed:.7,strike:1,strikeDamage:.05,recoil:8,recoilSpeed:1.2,deaf:14,lock:2,podBurst:5,brush:1.6,brushCooldown:10},
 swarm:{range:10,speed:.9,dark:12,hover:1.2,lens:2.5,cover:2.5},
 hearing:90,
});
export const SHADE_RETREAT:Vec3=[119,-2,13];
const SLEEPERS=new Set(['blind.r2','blind.v']);
const EXTRA_LUMENS:{id:string;home:Vec3;patrol:Vec3[]}[]=[
 {id:'lumen.a3',home:[192,6,78],patrol:[[192,6,78],[176,6,64],[196,6,52]]},
 {id:'lumen.a4',home:[134,6,78],patrol:[[134,6,78],[150,6,66],[124,6,58]]},
 {id:'lumen.a5',home:[166,7,46],patrol:[[166,7,46],[182,7,60],[150,7,50]]},
];
const BAND:Record<CreatureType,[number,number]>={lumen:[35.2,37.2],shade:[37.8,39.6],blind:[40.4,42.6],swarm:[43.2,45]};
const ACTIVITY:Record<CreatureMode,number>={hunt:1,recoil:.9,cling:.8,sniff:.7,seek:.6,swarm:.5,return:.5,drift:.4,idle:.4,sleep:.15};
const MODES:Record<CreatureType,readonly CreatureMode[]>={lumen:['idle','seek','cling','drift','return'],shade:['idle','recoil','return'],blind:['sleep','idle','hunt','recoil','sniff','return'],swarm:['idle','swarm','drift','return']};
const HULL={halfLength:2.5,halfWidth:1.4,halfHeight:1.5};

type V=[number,number,number];
const SPACES=new Map<string,LivingSpace>(LIVING_SPACES.filter(s=>s.pod).map(s=>[s.id,s]));
const DOORS=LIVING_DOORS.filter(d=>d.kind==='open');
const SOLIDS:Aabb[]=livingSolids();
const MARGIN=.8,VMARGIN=.6,APPROACH=1.5;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const dist=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const vec=(v:unknown):v is V=>Array.isArray(v)&&v.length===3&&v.every(finite);
const inset=(s:LivingSpace,p:Vec3):V=>[clamp(p[0],s.minX+MARGIN,s.maxX-MARGIN),clamp(p[1],s.floorY+VMARGIN,s.ceilY-VMARGIN),clamp(p[2],s.minZ+MARGIN,s.maxZ-MARGIN)];
const within=(s:LivingSpace,p:Vec3,m=0,vm=0)=>p[0]>=s.minX+m&&p[0]<=s.maxX-m&&p[1]>=s.floorY+vm&&p[1]<=s.ceilY-vm&&p[2]>=s.minZ+m&&p[2]<=s.maxZ-m;

/** Pod space containing `p`, preferring `prefer` on shared boundaries. */
export function livingSpaceAt(p:Vec3,prefer?:string|null):string|null{
 const own=prefer?SPACES.get(prefer):undefined;if(own&&within(own,p))return own.id;
 for(const s of SPACES.values())if(within(s,p))return s.id;
 return null;
}
const routes=new Map<string,LivingDoor[]|null>();
/** Doors crossed from one pod space to another (breadth-first over open doorways). */
export function livingDoorRoute(from:string,to:string):LivingDoor[]|null{
 const key=from+'>'+to;if(routes.has(key))return routes.get(key)!;
 let found:LivingDoor[]|null=from===to?[]:null;
 if(!found&&SPACES.has(from)&&SPACES.has(to)){
  const prev=new Map<string,LivingDoor>(),seen=new Set([from]),queue=[from];
  while(queue.length&&!found){const s=queue.shift()!;for(const d of DOORS){if(d.a!==s&&d.b!==s)continue;const n=d.a===s?d.b:d.a;if(seen.has(n))continue;seen.add(n);prev.set(n,d);
   if(n===to){const path:LivingDoor[]=[];let c=to;while(c!==from){const step=prev.get(c)!;path.unshift(step);c=step.a===c?step.b:step.a;}found=path;break;}queue.push(n);}}
 }
 routes.set(key,found);return found;
}
/** Approach, throat and exit points for crossing `d` out of `from`; the segment between them is perpendicular to the wall. */
function portal(d:LivingDoor,from:string,y:number):{points:V[];to:string}{
 const to=d.a===from?d.b:d.a,t=SPACES.get(to)!,lateral=(d.from+d.to)/2,yy=clamp(y,d.bottom+VMARGIN,d.top-VMARGIN);
 const centre=d.axis==='x'?(t.minX+t.maxX)/2:(t.minZ+t.maxZ)/2,dir=Math.sign(centre-d.at)||1;
 const at=(o:number):V=>d.axis==='x'?[d.at+o,yy,lateral]:[lateral,yy,d.at+o];
 return {points:[at(-dir*APPROACH),at(0),at(dir*APPROACH)],to};
}
function segmentHits(a:Vec3,b:Vec3,box:Aabb){
 let t0=1e-3,t1=1-1e-3;
 for(let i=0;i<3;i++){const p=a[i]!,d=b[i]!-p,lo=box.min[i]!+.01,hi=box.max[i]!-.01;
  if(Math.abs(d)<1e-9){if(p<=lo||p>=hi)return false;continue;}
  let u=(lo-p)/d,v=(hi-p)/d;if(u>v)[u,v]=[v,u];t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)return false;}
 return true;
}
export const livingLineOfSight=(a:Vec3,b:Vec3)=>!SOLIDS.some(s=>segmentHits(a,b,s));
/** Distance from `p` to the outside of the 2.8×5×3 m pod hull. */
export function podHullGap(p:Vec3,pod:Vec3,heading:number){
 const h=heading*Math.PI/180,dx=p[0]-pod[0],dz=p[2]-pod[2];
 const f=Math.abs(dx*Math.sin(h)-dz*Math.cos(h))-HULL.halfLength,l=Math.abs(dx*Math.cos(h)+dz*Math.sin(h))-HULL.halfWidth,y=Math.abs(p[1]-pod[1])-HULL.halfHeight;
 return Math.hypot(Math.max(0,f),Math.max(0,l),Math.max(0,y))+Math.min(0,Math.max(f,l,y));
}
const bearingTo=(from:Vec3,to:Vec3)=>(Math.atan2(to[0]-from[0],-(to[2]-from[2]))*180/Math.PI+360)%360;
const relative=(deg:number)=>{const r=((deg%360)+540)%360-180;return r===-180?180:r;};
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/2**32;};

interface Spawn {id:string;type:CreatureType;space:string;home:V;patrol:V[];sleeper:boolean;covers:string[]}
interface Mob {spawn:Spawn;space:string;pos:V;heading:number;mode:CreatureMode;next:number;leg:V[];legSpace:string|null;goal:V|null;goalSpace:string|null;last:V|null;lastSpace:string|null;timer:number;glare:number;dark:number;clock:number;cooldown:number;pause:number}
type Dynamic=Omit<Mob,'spawn'>&{id:string};
export interface LivingCreaturesSnapshot {version:1;identified:CreatureType[];extra:number;mobs:Dynamic[]}

const spawnOf=(id:string,type:CreatureType,space:string,home:Vec3,patrol:readonly Vec3[]):Spawn=>{
 const s=SPACES.get(space)!;
 return {id,type,space,home:inset(s,home),patrol:patrol.map(p=>inset(s,p)),sleeper:SLEEPERS.has(id),covers:type==='swarm'?LIVING_ITEMS.filter(i=>i.kind==='box'&&dist(i.position,home)<=3).map(i=>i.id):[]};
};
const BASE=LIVING_CREATURES.map(c=>spawnOf(c.id,c.type,c.space,c.home,c.patrol));
const EXTRA=EXTRA_LUMENS.map(c=>spawnOf(c.id,'lumen','A',c.home,c.patrol));
const fresh=(spawn:Spawn):Mob=>({spawn,space:spawn.space,pos:[...spawn.home],heading:0,mode:spawn.sleeper?'sleep':'idle',next:0,leg:[],legSpace:null,goal:null,goalSpace:null,last:null,lastSpace:null,timer:0,glare:0,dark:0,clock:0,cooldown:0,pause:0});
const ITEM_POS=new Map(LIVING_ITEMS.map(i=>[i.id,i.position]));

export class LivingCreatures {
 private mobs:Mob[]=BASE.map(fresh);
 private identified=new Set<CreatureType>();
 private extra=0;
 constructor(private readonly random:()=>number=Math.random){}
 get views():readonly CreatureView[]{return this.mobs.map(m=>({id:m.spawn.id,type:m.spawn.type,position:[...m.pos] as Vec3,heading:m.heading,mode:m.mode,identified:this.identified.has(m.spawn.type)}));}
 get extraLumens(){return this.extra;}
 markIdentified(type:CreatureType){if(type in MODES)this.identified.add(type);}
 addLumen(){if(this.extra>=EXTRA.length)return;this.mobs.push(fresh(EXTRA[this.extra]!));this.extra++;}
 blockers():{min:Vec3;max:Vec3}[]{
  return this.mobs.filter(m=>m.spawn.type==='shade'&&m.mode==='idle').map(m=>({min:[m.pos[0]-3.6,m.pos[1]-2.4,m.pos[2]-1.8] as Vec3,max:[m.pos[0]+3.6,m.pos[1]+2.4,m.pos[2]+1.8] as Vec3}));
 }
 passiveContacts(pod:Vec3,heading:number):PassiveContact[]{
  const out:PassiveContact[]=[];
  for(const m of this.mobs){const d=dist(pod,m.pos);if(d>LIVING_CREATURE_TUNING.hearing)continue;
   const intensity=ACTIVITY[m.mode]*(1-d/LIVING_CREATURE_TUNING.hearing);if(intensity<.02)continue;
   const [lo,hi]=BAND[m.spawn.type];
   out.push({id:m.spawn.id,type:m.spawn.type,bearing:relative(bearingTo(pod,m.pos)-heading),intensity,identified:this.identified.has(m.spawn.type),frequency:Math.round((lo+(hi-lo)*hash(m.spawn.id))*100)/100});}
  return out.sort((a,b)=>b.intensity-a.intensity);
 }
 tick(dt:number,input:CreatureInput):CreatureResult{
  const out:CreatureResult={damage:0,events:[],lensBlocked:false,armBlocked:false,itemsBlocked:[],clinging:[],shake:0,cues:[],push:[0,0,0]};
  if(!vec(input?.pod)||!finite(input.heading))return out;
  while(this.extra<Math.min(EXTRA.length,Math.floor(finite(input.extraLumens)?input.extraLumens:0)))this.addLumen();
  let left=finite(dt)?clamp(dt,0,1):0,first=true;
  while(left>1e-9){const h=Math.min(.05,left);left-=h;for(const m of this.mobs)this.stepMob(m,h,input,first,out);first=false;}
  for(const m of this.mobs){
   if(m.spawn.type==='lumen'&&m.mode==='cling'){out.lensBlocked=true;out.armBlocked=true;out.clinging.push(m.spawn.id);}
   if(m.spawn.type==='swarm'){
    if(m.mode==='swarm'&&podHullGap(m.pos,input.pod,input.heading)<=LIVING_CREATURE_TUNING.swarm.lens)out.lensBlocked=true;
    if(m.mode!=='swarm')for(const id of m.spawn.covers)if(dist(m.pos,ITEM_POS.get(id)!)<=LIVING_CREATURE_TUNING.swarm.cover&&!out.itemsBlocked.includes(id))out.itemsBlocked.push(id);
   }
  }
  out.events=[...new Set(out.events)];out.cues=[...new Set(out.cues)];
  return out;
 }
 private say(out:CreatureResult,text:string,cue?:string){out.events.push(text);if(cue)out.cues.push(cue);}
 private lit(m:Mob,input:CreatureInput,range:number,near:number){
  if(!input.lampOn)return false;const d=dist(m.pos,input.pod);if(d>Math.max(range,near))return false;
  if(d>near){const h=input.heading*Math.PI/180,f=[Math.sin(h),0,-Math.cos(h)],cos=((m.pos[0]-input.pod[0])*f[0]!+(m.pos[2]-input.pod[2])*f[2]!)/Math.max(d,1e-6);
   if(d>range||Math.acos(clamp(cos,-1,1))>input.lampHalfAngle)return false;}
  return livingLineOfSight(input.pod,m.pos);
 }
 private moveTo(m:Mob,target:Vec3,speed:number,dt:number){
  const dx=target[0]-m.pos[0],dy=target[1]-m.pos[1],dz=target[2]-m.pos[2],d=Math.hypot(dx,dy,dz);
  if(d<=1e-3)return true;
  const s=Math.min(d,speed*dt);m.pos=[m.pos[0]+dx*s/d,m.pos[1]+dy*s/d,m.pos[2]+dz*s/d];
  if(Math.hypot(dx,dz)>1e-3)m.heading=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
  return s>=d-1e-9;
 }
 /** Walks toward `goal`; returns true once it stands at the goal (clamped into the goal space). */
 private go(m:Mob,goal:Vec3,goalSpace:string|null,speed:number,dt:number){
  if(m.leg.length){if(this.moveTo(m,m.leg[0]!,speed,dt)){m.leg.shift();if(!m.leg.length&&m.legSpace){m.space=m.legSpace;m.legSpace=null;}}return false;}
  const target=goalSpace&&SPACES.has(goalSpace)?goalSpace:m.space;
  if(target!==m.space){const path=livingDoorRoute(m.space,target);if(path&&path.length){const p=portal(path[0]!,m.space,m.pos[1]);m.leg=p.points;m.legSpace=p.to;return false;}}
  return this.moveTo(m,inset(SPACES.get(m.space)!,goal),speed,dt);
 }
 private patrol(m:Mob,speed:number,dt:number){
  if(m.pause>0){m.pause-=dt;return;}
  const p=m.spawn.patrol;if(!p.length)return;
  if(this.go(m,p[m.next%p.length]!,m.spawn.space,speed,dt)){m.next=(m.next+1)%p.length;m.pause=1+this.random()*3;}
 }
 private face(m:Mob,p:Vec3){if(Math.hypot(p[0]-m.pos[0],p[2]-m.pos[2])>1e-3)m.heading=bearingTo(m.pos,p);}
 private stepMob(m:Mob,dt:number,input:CreatureInput,first:boolean,out:CreatureResult){
  m.cooldown=Math.max(0,m.cooldown-dt);
  if(m.spawn.type==='lumen')this.lumen(m,dt,input,out);
  else if(m.spawn.type==='shade')this.shade(m,dt,input,out);
  else if(m.spawn.type==='blind')this.blind(m,dt,input,first,out);
  else this.swarm(m,dt,input,out);
 }
 private lumen(m:Mob,dt:number,input:CreatureInput,out:CreatureResult){
  const T=LIVING_CREATURE_TUNING.lumen,pod=input.pod;
  if(m.mode==='cling'){
   m.dark=input.lampOn?0:m.dark+dt;m.clock+=dt;
   while(m.clock>=T.clingTick){m.clock-=T.clingTick;out.damage+=T.clingDamage;out.shake=Math.max(out.shake,.25);this.say(out,'贴在舷窗上的东西收紧了，艇壳发出细密的裂响。','creature.breath-sync');}
   const space=livingSpaceAt(pod,m.space)??m.space;m.space=space;m.leg=[];m.legSpace=null;
   m.pos=inset(SPACES.get(space)!,[pod[0],pod[1]+T.above,pod[2]]);m.heading=(input.heading+180)%360;
   if(m.dark>=T.release){m.mode='return';m.last=null;m.cooldown=T.shy;m.dark=0;this.say(out,'灯灭了一会儿，贴在舷窗上的东西松开，缩回黑暗深处。');}
   return;
  }
  if(m.cooldown<=0&&this.lit(m,input,Math.min(T.cone,input.lampRange),T.near)){
   if(m.mode!=='seek')this.say(out,'舷窗外有什么转向了灯光，正慢慢靠过来。','creature.skitter');
   m.mode='seek';m.last=[...pod];m.lastSpace=livingSpaceAt(pod,m.space);
   m.glare+=dt;if(m.glare<T.notice)return;
   if(podHullGap(m.pos,pod,input.heading)<=T.cling){m.mode='cling';m.clock=0;m.dark=0;m.leg=[];m.legSpace=null;this.say(out,'有东西贴上了舷窗——镜头被遮住，机械臂伸不出去。','creature.breath-sync');return;}
   this.go(m,[pod[0],pod[1]+1,pod[2]],m.lastSpace,T.speed,dt);if(!m.leg.length)this.face(m,pod);return;
  }
  m.glare=0;
  if(m.mode==='seek'){m.mode='drift';m.timer=T.linger;}
  if(m.mode==='drift'){m.timer-=dt;if(m.timer<=0||!m.last){m.mode='return';m.cooldown=T.shy;return;}this.go(m,m.last,m.lastSpace,T.patrol,dt);return;}
  if(m.mode==='return'){if(this.go(m,m.spawn.home,m.spawn.space,T.returnSpeed,dt)){m.mode='idle';m.next=0;m.pause=2;}return;}
  this.patrol(m,T.patrol,dt);
 }
 private shade(m:Mob,dt:number,input:CreatureInput,out:CreatureResult){
  const T=LIVING_CREATURE_TUNING.shade,lit=this.lit(m,input,Math.min(T.range,input.lampRange),0);
  if(lit){m.dark=0;if(m.mode!=='recoil'){m.glare+=dt;if(m.glare>=T.glare){m.mode='recoil';m.glare=0;m.leg=[];m.legSpace=null;this.say(out,'门口那团东西在灯光里猛地缩紧，退进了库房深处。','creature.skitter');}}}
  else{m.glare=0;m.dark+=dt;if(m.mode==='recoil'&&m.dark>=T.dark){m.mode='return';this.say(out,'黑暗里，库房深处有东西重新游向门口。');}}
  if(m.mode==='recoil'){this.go(m,SHADE_RETREAT,'R4',T.speed,dt);return;}
  if(m.mode==='return'&&this.go(m,m.spawn.home,m.spawn.space,T.returnSpeed,dt))m.mode='idle';
  if(!lit&&m.cooldown<=0&&podHullGap(m.pos,input.pod,input.heading)<=T.bite){
   const dx=input.pod[0]-m.pos[0],dz=input.pod[2]-m.pos[2],d=Math.hypot(dx,dz)||1;
   m.cooldown=T.biteCooldown;out.damage+=T.biteDamage;out.shake=Math.max(out.shake,.6);
   out.push=[out.push[0]+dx/d*T.push,out.push[1],out.push[2]+dz/d*T.push];
   this.say(out,'门口的东西一口咬住艇壳，把你甩了出去！','hull.crack');
  }
 }
 /** Blind uses `dark` as seconds since it last heard the pod itself, `cooldown` as wash deafness, `clock` as brush cooldown. */
 private blind(m:Mob,dt:number,input:CreatureInput,first:boolean,out:CreatureResult){
  const T=LIVING_CREATURE_TUNING.blind,pod=input.pod;
  m.dark+=dt;m.clock=Math.max(0,m.clock-dt);
  let heard:V|null=null,space:string|null=null,fromPod=false;
  if(m.mode!=='recoil'&&!(m.mode==='return'&&m.cooldown>0)){
   const d=dist(m.pos,pod);
   if((first&&input.pulse&&d<=T.pulse)||(m.mode!=='sleep'&&m.cooldown<=0&&input.speed>T.washSpeed&&d<=T.wash)){heard=[...pod];space=livingSpaceAt(pod,m.space);fromPod=true;}
   if(!heard&&first)for(const b of input.noiseBursts??[]){if(!vec(b?.position)||!finite(b.loudness))continue;const s=livingSpaceAt(b.position);
    if(s&&dist(m.pos,b.position)<=b.loudness*T.noise&&(!heard||dist(m.pos,b.position)<dist(m.pos,heard))){heard=[...b.position];space=s;fromPod=dist(b.position,pod)<=T.podBurst;}}
  }
  if(heard&&space){
   if(m.mode!=='hunt')this.say(out,m.mode==='sleep'?'被动声纳：一个原本静止的声源醒了，正朝声音的方向游来。':'被动声纳：一个声源突然转向，朝声音的方向来了。','listener.call');
   if(m.mode!=='hunt')m.glare=0;
   m.mode='hunt';m.timer=T.memory;m.last=heard;m.lastSpace=space;if(fromPod)m.dark=0;
  }
  const gap=podHullGap(m.pos,pod,input.heading);
  if(m.mode==='hunt'){
   m.glare+=dt;
   m.timer-=dt;
   if(!heard&&m.timer<=0){m.mode='return';m.cooldown=T.rest;m.goal=null;return;}
   if(m.glare<T.notice)return;
   if(gap<=T.strike&&m.dark<=T.lock){
    out.damage+=T.strikeDamage;out.shake=Math.max(out.shake,1);this.say(out,'撞击！有东西从黑暗里狠狠撞上艇壳。','hull.crack');
    const dx=m.pos[0]-pod[0],dz=m.pos[2]-pod[2],d=Math.hypot(dx,dz)||1;
    m.mode='recoil';m.timer=T.recoil;m.cooldown=T.deaf;m.goal=inset(SPACES.get(m.space)!,[m.pos[0]+dx/d*6,m.pos[1],m.pos[2]+dz/d*6]);m.goalSpace=m.space;return;
   }
   if(gap<=T.brush&&m.dark>T.lock){this.brush(m,out);m.mode='sniff';m.timer=T.sniff;m.goal=null;return;}
   if(this.go(m,m.last!,m.lastSpace,T.speed,dt)&&!heard){m.mode='sniff';m.timer=T.sniff;m.goal=null;this.say(out,'追来的声源停在附近，来回搜索。');}
   return;
  }
  if(m.mode==='sniff'&&gap<=T.brush)this.brush(m,out);
  if(m.mode==='recoil'){m.timer-=dt;if(m.goal)this.go(m,m.goal,m.goalSpace,T.recoilSpeed,dt);if(m.timer<=0){m.mode='sniff';m.timer=T.sniff;m.goal=null;}return;}
  if(m.mode==='sniff'){
   m.timer-=dt;if(m.timer<=0){m.mode='return';m.cooldown=T.rest;m.goal=null;this.say(out,'那个声源慢慢游远了。');return;}
   if(m.pause>0){m.pause-=dt;return;}
   const c=m.last??m.pos,cs=m.lastSpace??m.space;
   if(!m.goal){
    // Searching never swims into the hull; with no clear spot it holds still this beat.
    for(let k=0;k<6&&!m.goal;k++){const a=this.random()*Math.PI*2,r=1+this.random()*(T.sniffRadius-1),g=inset(SPACES.get(cs)!,[c[0]+Math.sin(a)*r,c[1],c[2]+Math.cos(a)*r]);if(podHullGap(g,pod,input.heading)>T.brush)m.goal=g;}
    if(!m.goal){m.pause=.8;return;}
    m.goalSpace=cs;
   }
   if(this.go(m,m.goal,m.goalSpace,T.sniffSpeed,dt)){m.goal=null;m.pause=.8+this.random();}
   return;
  }
  if(m.mode==='return'){
   const target=m.spawn.sleeper?m.spawn.home:m.spawn.patrol[m.next%m.spawn.patrol.length]!;
   if(this.go(m,target,m.spawn.space,T.patrol,dt)){m.mode=m.spawn.sleeper?'sleep':'idle';m.pause=1;}
   return;
  }
  if(m.mode==='idle')this.patrol(m,T.patrol,dt);
 }
 private brush(m:Mob,out:CreatureResult){
  if(m.clock>0)return;
  m.clock=LIVING_CREATURE_TUNING.blind.brushCooldown;out.shake=Math.max(out.shake,.2);
  this.say(out,'有东西贴着艇壳滑了过去——它没撞。它在找声音。别推进，别发脉冲。','creature.skitter');
 }
 private swarm(m:Mob,dt:number,input:CreatureInput,out:CreatureResult){
  const T=LIVING_CREATURE_TUNING.swarm;
  if(input.lampOn&&dist(m.pos,input.pod)<=T.range&&livingLineOfSight(input.pod,m.pos)){
   if(m.mode!=='swarm')this.say(out,'一团细碎的影子从暗处涌出来，扑向探照灯。','creature.skitter');
   m.mode='swarm';m.dark=0;
   if(podHullGap(m.pos,input.pod,input.heading)>T.hover)this.go(m,input.pod,livingSpaceAt(input.pod,m.space),T.speed,dt);
   return;
  }
  if(m.mode==='swarm'){m.mode='drift';m.dark=0;this.say(out,'灯一灭，那团影子散开了。');}
  if(m.mode==='drift'){m.dark+=dt;if(m.leg.length)this.go(m,m.pos,m.space,T.speed,dt);if(m.dark>=T.dark)m.mode='return';return;}
  if(m.mode==='return'){if(this.go(m,m.spawn.home,m.spawn.space,T.speed,dt)){m.mode='idle';m.next=0;}return;}
  if(m.spawn.covers.length)this.go(m,m.spawn.home,m.spawn.space,T.speed*.5,dt);else this.patrol(m,T.speed*.4,dt);
 }
 snapshot():LivingCreaturesSnapshot{
  return structuredClone({version:1 as const,identified:[...this.identified],extra:this.extra,mobs:this.mobs.map(({spawn,...rest})=>({id:spawn.id,...rest}))});
 }
 restore(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;const s=value as LivingCreaturesSnapshot;
  if(s.version!==1||!Array.isArray(s.identified)||!s.identified.every(t=>t in MODES)||!Number.isInteger(s.extra)||s.extra<0||s.extra>EXTRA.length||!Array.isArray(s.mobs))return false;
  const spawns=[...BASE,...EXTRA.slice(0,s.extra)];if(s.mobs.length!==spawns.length)return false;
  const space=(v:unknown,nullable:boolean)=>v===null?nullable:typeof v==='string'&&SPACES.has(v);
  const mobs:Mob[]=[];
  for(let i=0;i<spawns.length;i++){
   const d=s.mobs[i] as Dynamic,spawn=spawns[i]!;
   if(!d||d.id!==spawn.id||!space(d.space,false)||!vec(d.pos)||!finite(d.heading)||!MODES[spawn.type].includes(d.mode))return false;
   if(!Number.isInteger(d.next)||d.next<0||!Array.isArray(d.leg)||d.leg.length>3||!d.leg.every(vec)||!space(d.legSpace,true)||(d.leg.length>0)!==(d.legSpace!==null))return false;
   if(!within(SPACES.get(d.space)!,d.pos)&&!(d.legSpace&&within(SPACES.get(d.legSpace)!,d.pos)))return false;
   if((d.goal!==null&&!vec(d.goal))||!space(d.goalSpace,true)||(d.last!==null&&!vec(d.last))||!space(d.lastSpace,true))return false;
   if(![d.timer,d.glare,d.dark,d.clock,d.cooldown,d.pause].every(finite)||[d.glare,d.dark,d.clock,d.cooldown].some(v=>v<0))return false;
   if((d.mode==='drift'&&spawn.type==='lumen'||d.mode==='hunt')&&!d.last)return false;
   const {id:_,...rest}=d;mobs.push({spawn,...structuredClone(rest)});
  }
  this.mobs=mobs;this.extra=s.extra;this.identified=new Set(s.identified);return true;
 }
}
