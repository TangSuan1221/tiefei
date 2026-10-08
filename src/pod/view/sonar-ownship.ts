/** Head-up sonar: echoes rotate with heading; the ownship bow stays upward. */
export function drawSonarOwnship(ctx:CanvasRenderingContext2D,cx:number,cy:number,size=12){
 ctx.save();ctx.translate(cx,cy);ctx.fillStyle='#e9fff2';ctx.strokeStyle='#071713';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.60,size*.65);ctx.lineTo(0,size*.30);ctx.lineTo(-size*.60,size*.65);ctx.closePath();ctx.fill();ctx.stroke();
 ctx.strokeStyle='#e9fff2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-size-3);ctx.lineTo(0,-size-12);ctx.stroke();ctx.restore();
}
export function sonarHeading(heading:number){return ((heading%360+360)%360).toFixed(0).padStart(3,'0')+'°';}
