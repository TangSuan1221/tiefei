import * as T from 'three';
type V=[number,number,number];
export interface EliasArm{shoulder:T.Group;elbow:T.Group;hand:T.Group;side:number;upper:number;fore:number}
export interface EliasLeg{hip:T.Group;knee:T.Group;foot:T.Group;side:number;thigh:number;shin:number}
export interface EliasRig{root:T.Group;upper:T.Group;head:T.Group;arms:EliasArm[];legs:EliasLeg[]}
type Look='pod'|'door'|'gate'|'travel'|'ahead';
/** Wrist targets and poles are in hip-pivot (upper) space: +z forward, +x the figure's left. arms[0] is the right arm. */
interface Pose{yaw:number;back:number;door:number;crouch:number;torso:V;look:Look;head:V;shrug:number;r:V|null;l:V|null;rPole:V;lPole:V;rBend:number;lBend:number;sway:number;heave:number;walk:number}
const REST:Pose={yaw:0,back:0,door:0,crouch:.12,torso:[.03,0,0],look:'pod',head:[0,0,0],shrug:0,r:[-.14,.33,.26],l:null,rPole:[-.7,-.4,-.6],lPole:[.7,-.4,-.6],rBend:0,lBend:0,sway:1,heave:0,walk:0};
const WALK:Partial<Pose>={walk:1,look:'travel',r:null,crouch:.05,torso:[.06,0,0]};
const POSES:Record<string,Partial<Pose>>={
 injured:{crouch:.95,torso:[.55,0,.18],look:'pod',r:[-.2,-.18,.22],l:[.45,.3,.12],heave:1,sway:0},
 frozen:{back:.3,crouch:.1,torso:[-.07,0,0],head:[.14,0,0],shrug:.04,r:[-.07,.88,.37],rPole:[-1,-.3,.3],l:[.34,-.02,-.16],sway:0},
 signals_pod:{torso:[-.04,0,-.05],head:[-.12,0,0],l:[.36,1.12,.24],lPole:[1,-.2,-.3]},
 guarded:{yaw:-.35,back:.28,crouch:.18,torso:[.08,-.5,0],look:'ahead',head:[.2,-1.05,0],shrug:.05,r:[.13,.32,.22],l:[-.12,.28,.25],rPole:[-.8,-.6,0],lPole:[.8,-.6,0],sway:.4},
 listening:{yaw:.15,torso:[.02,.28,0],look:'door',head:[0,0,.24],l:[.30,.80,.08],lPole:[1,-.1,-.2],sway:.3},
 hidden:{back:.45,crouch:.72,torso:[.34,0,0],r:[-.16,.26,.32],l:[.16,.22,.32],rPole:[-.6,-.8,0],lPole:[.6,-.8,0],sway:.15},
 peeking:{yaw:.55,door:.42,crouch:.2,torso:[.12,.2,-.24],look:'door',r:[-.42,.42,-.05],rPole:[-.6,.3,-.8],sway:.4},
 palm_stay:{torso:[.06,0,-.04],l:[.6,.62,.45],lPole:[.6,-1,0],lBend:-1.4},
 watching:{},
 walking:WALK,
 rail:{...WALK,torso:[.04,0,.04],l:[.48,.3,.12],lPole:[.6,.2,-.8]},
 glance_back:WALK,
 trust_wave:{head:[-.1,0,0],torso:[-.03,0,.06],r:[-.36,1.1,.25],rPole:[-1,-.2,-.3],l:[.2,.3,.22]},
 wary:{yaw:Math.PI,crouch:.28,torso:[.12,0,0],look:'ahead',r:[-.2,.3,.25],l:[.2,.3,.25],sway:.3},
 still:{yaw:.3,crouch:.35,torso:[.42,0,0],look:'ahead',head:[.15,0,0],r:[-.19,-.13,.27],l:[.19,-.13,.27],rPole:[-.8,0,-.6],lPole:[.8,0,-.6],heave:1,sway:0},
};
const WALKING=new Set(['walking','rail','glance_back']);
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const yawTo=(from:T.Vector3,to:V)=>Math.atan2(to[0]-from.x,to[2]-from.z);
const _d=new T.Vector3(),_p=new T.Vector3(),_e=new T.Vector3(),_f=new T.Vector3(),_x=new T.Vector3(),_y=new T.Vector3(),_z=new T.Vector3(),_m=new T.Matrix4(),_t=new T.Vector3(),_pole=new T.Vector3();
/** Analytic two-bone IK: shoulder basis from the elbow plane, elbow hinge about its local x. */
function solveArm(arm:EliasArm,target:T.Vector3,pole:T.Vector3){
 const a=arm.upper,b=arm.fore,S=arm.shoulder.position;_d.copy(target).sub(S);
 const len=Math.min(Math.max(_d.length(),Math.abs(a-b)+.03),a+b-.002);_d.normalize();
 const cosA=(a*a+len*len-b*b)/(2*a*len),sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
 _p.copy(pole).addScaledVector(_d,-pole.dot(_d));if(_p.lengthSq()<1e-6)_p.set(0,0,-1).addScaledVector(_d,-_d.z);_p.normalize();
 _e.copy(_d).multiplyScalar(cosA).addScaledVector(_p,sinA);
 _f.copy(_d).multiplyScalar(len).addScaledVector(_e,-a).normalize();
 _y.copy(_e).negate();_x.crossVectors(_e,_f);if(_x.lengthSq()<1e-6)_x.crossVectors(_e,_p);_x.normalize();_z.crossVectors(_x,_y).normalize();
 arm.shoulder.quaternion.setFromRotationMatrix(_m.makeBasis(_x,_y,_z));
 arm.elbow.rotation.set(Math.atan2(-_f.dot(_z),-_f.dot(_y)),0,0);
}
const N=29;
/** Story-beat acting for the survivor. Visual only: offsets stay within 0.5 m of the logical position. */
export function createEliasPoser(rig:EliasRig,targets:{pod:V;door:V;gate:V}){
 const cur=new Float32Array(N),vel=new Float32Array(N),goal=new Float32Array(N);
 let yaw=0,yawVel=0,ready=false,phase=0,walkClock=0,lag=0,travelYaw=-Math.PI/2;const last=new T.Vector3(),shoulderRest=rig.arms.map(a=>a.shoulder.position.clone()),upperY=rig.upper.position.y;
 const omega=8.5;
 const damp=(x:number,v:number,g:number,dt:number):[number,number]=>{const k=omega*dt,e=1/(1+k+.48*k*k+.235*k*k*k),c=x-g,t=(v+omega*c)*dt;return [g+(c+t)*e,(v-omega*t)*e];};
 function update(position:V,walking:boolean,beat:string,time:number,dt:number){
  const p=new T.Vector3(...position),moved=ready?Math.hypot(p.x-last.x,p.z-last.z):0;
  if(moved>1e-4)travelYaw=Math.atan2(p.x-last.x,p.z-last.z);
  const speed=dt>0?Math.min(2,moved/dt):0;last.copy(p);
  const key=walking?(WALKING.has(beat)?beat:'walking'):(WALKING.has(beat)?'':beat);
  const railing=key==='rail'&&Math.abs(wrap(travelYaw+Math.PI/2))<.6;
  const pose:Pose={...REST,...(POSES[key==='rail'&&!railing?'walking':key]??{})};
  walkClock=walking?walkClock+Math.min(dt,.1):0;
  const podYaw=yawTo(p,targets.pod);
  let baseYaw=walking?travelYaw:podYaw,look:Look=pose.look,extraTorsoYaw=0;
  if(key==='glance_back'){const c=walkClock;if(c>1.7&&c<3.2)pose.walk=0;if(c>1.85&&c<3.1){baseYaw+=.7;extraTorsoYaw=.9;look='gate';}}
  if(key==='trust_wave')pose.r=[-.36+Math.sin(time*5.2)*.09,1.1,.25];
  const headYawScan=key==='wary'?Math.sin(time*.9)*1.0:0;
  const targetYaw=baseYaw+pose.yaw;
  const lookYaw=look==='pod'?podYaw:look==='door'?yawTo(p,targets.door):look==='gate'?yawTo(p,targets.gate):look==='travel'?travelYaw:null;
  const torsoYaw=pose.torso[1]+extraTorsoYaw;
  const headYaw=lookYaw===null?pose.head[1]+headYawScan:Math.max(-1.35,Math.min(1.35,wrap(lookYaw-targetYaw-torsoYaw)));
  const podDir=new T.Vector2(targets.pod[0]-p.x,targets.pod[2]-p.z).normalize(),doorDir=new T.Vector2(targets.door[0]-p.x,targets.door[2]-p.z).normalize();
  const off=walking?new T.Vector2():doorDir.multiplyScalar(pose.door).addScaledVector(podDir,-pose.back);
  const r=pose.r,l=pose.l;
  const values=[off.x,off.y,pose.crouch,pose.torso[0],torsoYaw,pose.torso[2],pose.head[0]-pose.torso[0]*.7,headYaw,pose.head[2],pose.shrug,
   r?1:0,...(r??[0,0,0]),l?1:0,...(l??[0,0,0]),pose.rBend,pose.lBend,pose.walk,pose.sway,pose.heave,...pose.rPole,...pose.lPole];
  for(let i=0;i<values.length;i++)goal[i]=values[i];
  if(!ready||dt>.5){cur.set(goal);vel.fill(0);yaw=targetYaw;yawVel=0;ready=true;lag=0;}
  else{for(let i=0;i<values.length;i++)[cur[i],vel[i]]=damp(cur[i],vel[i],goal[i],dt);const g=yaw+wrap(targetYaw-yaw);[yaw,yawVel]=damp(yaw,yawVel,g,dt);yaw=wrap(yaw);}
  const [ox,oz,crouch,tp,ty,tr,hp,hy,hr,shrug,rOn,rx,ry,rz,lOn,lx,ly,lz,rBend,lBend,walk,sway,heave,rpx,rpy,rpz,lpx,lpy,lpz]=cur;
  // A held stop during the walk: the logical position keeps moving, the body visibly waits and then catches up.
  if(walking&&key==='glance_back'&&walk<.5)lag=Math.min(.45,lag+speed*dt);else lag=Math.max(0,lag-.25*dt);
  phase+=dt*5*Math.min(1,walk+.02);
  const breathHz=.28+.47*heave,breath=Math.sin(time*Math.PI*2*breathHz);
  // Legs: crouch bends hip/knee symmetrically; walking swings them; the planted leg sets the pelvis height.
  let reach=0;
  for(const leg of rig.legs){const s=leg.side,ph=phase+(s<0?Math.PI:0),swing=Math.sin(ph)*.38*walk,lift=Math.max(0,Math.cos(ph))*.5*walk;
   const th=-crouch+swing,kn=2*crouch+.08+lift;leg.hip.rotation.set(th,0,s*.07);leg.knee.rotation.x=kn;leg.foot.rotation.x=-(th+kn);
   reach=Math.max(reach,leg.thigh*Math.cos(th)+leg.shin*Math.cos(th+kn));}
  const legLen=rig.legs[0].thigh+rig.legs[0].shin,drop=legLen-reach;
  const back=new T.Vector2(Math.sin(travelYaw),Math.cos(travelYaw)).multiplyScalar(-lag);
  const o=new T.Vector2(ox+back.x,oz+back.y);if(o.length()>.5)o.setLength(.5);
  rig.root.position.set(p.x+o.x,p.y-drop+.005*breath*(1-heave),p.z+o.y);
  rig.root.rotation.set(0,yaw+Math.sin(time*.35)*.055*sway,.035*sway+Math.sin(time*.9)*.012*sway,'YXZ');
  rig.upper.rotation.set(tp+breath*(.012+.1*heave),ty,tr+Math.sin(phase)*.03*walk,'YXZ');
  rig.upper.position.y=upperY+breath*(.004+.012*heave);
  rig.head.rotation.set(hp-breath*.05*heave,hy,hr,'YXZ');
  const heaveShrug=(breath*.5+.5)*.05*heave;
  rig.arms.forEach((arm,i)=>{const s=arm.side,on=i===0?rOn:lOn,want=i===0?[rx,ry,rz]:[lx,ly,lz];
   arm.shoulder.position.copy(shoulderRest[i]).setY(shoulderRest[i].y+shrug+heaveShrug);
   const ph=phase+(s<0?Math.PI:0);
   if(i===0)_pole.set(rpx,rpy,rpz);else _pole.set(lpx,lpy,lpz);
   const hang=_t.set(s*.29,-.08+Math.abs(Math.sin(ph))*.02*walk,.06+Math.sin(ph)*.17*walk);
   const target=hang.lerp(new T.Vector3(...want),on);solveArm(arm,target,_pole);arm.hand.rotation.x=i===0?rBend:lBend;});
 }
 return {update};
}
