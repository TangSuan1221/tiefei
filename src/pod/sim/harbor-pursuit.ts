import {Vector3} from 'three';

/** Acoustic pursuit through the cargo doorway, never a timed arrival flag. */
export class HarborPursuit {
 readonly position=new Vector3(64,-1.2,9);
 private heard:Vector3|null=null;
 get inside(){return this.position.x>72.5&&this.position.x<81.7&&this.position.z<15.3;}
 tick(dt:number,player:Vector3,audible:boolean,gateOpen:boolean,isolated:boolean){
  if(isolated)return;
  if(audible)this.heard=player.clone().setY(-.5);
  if(!this.heard)return;
  let left=Math.min(dt,1);
  while(left>0){const step=Math.min(left,.025);left-=step;
   const target=this.heard,insideTarget=target.x>72.5&&target.x<81.7&&target.z<15.3;
   let waypoint=target;
   // Route around the west wall and through the full-width gate opening.
   if(this.position.x<72.5&&this.position.z<20)waypoint=new Vector3(64,-.5,21);
   else if(insideTarget&&!this.inside){
    if(this.position.z>18&&Math.abs(this.position.x-77)> .15)waypoint=new Vector3(77,-.5,21);
    else waypoint=gateOpen?target:new Vector3(77,-.5,19);
   }else if(this.inside&&!insideTarget)waypoint=gateOpen?new Vector3(77,-.5,21):this.position;
   else if(!insideTarget&&this.position.z<18)waypoint=new Vector3(77,-.5,21);
   const delta=waypoint.clone().sub(this.position),distance=delta.length();
   if(distance>.02)this.position.addScaledVector(delta,Math.min(distance,step*1.65)/distance);
  }
 }
 snapshot(){return {position:this.position.toArray(),heard:this.heard?.toArray()??null};}
 restore(s:ReturnType<HarborPursuit['snapshot']>){
  const valid=(a:unknown):a is number[]=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  if(!s||!valid(s.position)||(s.heard!==null&&!valid(s.heard)))return false;
  this.position.fromArray(s.position);this.heard=s.heard?new Vector3().fromArray(s.heard):null;return true;
 }
}
