import {sonarSweepAngle,SONAR_STATIC} from '../sim/navigation-sonar';
/** Draw only inside the instrument's glass, with a narrow phosphor wake. */
export function drawSonarSweep(ctx:CanvasRenderingContext2D,cx:number,cy:number,radius:number,time:number){
 const angle=sonarSweepAngle(time)-Math.PI/2;
 ctx.save();
 for(let i=14;i>=0;i--){
  ctx.fillStyle=`rgba(237,186,115,${.009+(14-i)*.0015})`;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,radius,angle-(i+1)*.025,angle-i*.025);ctx.closePath();ctx.fill();
 }
 ctx.strokeStyle=SONAR_STATIC;ctx.lineWidth=1.5;ctx.shadowColor=SONAR_STATIC;ctx.shadowBlur=4;
 ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius);ctx.stroke();
 ctx.restore();
}
