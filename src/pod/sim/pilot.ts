/** Tuned submerged handling, metres/seconds. Not a full hydrodynamics solver. */
export class PilotMotion {
  speed=0; yawRate=0; pitchRate=0;
  verticalSpeed=0;
  step(dt:number,thrust:number,yaw:number,pitch:number,brake=false,heave=0) {
    dt=Math.max(0,Math.min(dt,.05));
    this.speed+=(thrust*.48-this.speed*(brake?3.2:.18)-this.speed*Math.abs(this.speed)*.16)*dt;
    this.speed=Math.max(-.65,Math.min(1.6,this.speed));
    this.yawRate+=(yaw*36-this.yawRate*2.4)*dt;
    this.pitchRate+=(pitch*7-this.pitchRate*1.8)*dt;
    this.verticalSpeed+=(heave*.65-this.verticalSpeed*(brake?4:1.3))*dt;
    if(Math.abs(this.verticalSpeed)<.003&&!heave)this.verticalSpeed=0;
    if(Math.abs(this.speed)<.003 && !thrust)this.speed=0;
    return {distance:this.speed*dt,vertical:this.verticalSpeed*dt,yaw:this.yawRate*dt,pitch:this.pitchRate*dt};
  }
  stop(){this.speed=this.yawRate=this.pitchRate=this.verticalSpeed=0;}
}
