import {Box3,Vector3} from 'three';
export const SONAR_RANGE=24;
export const SONAR_STATIC='#edba73';
export const SONAR_THREAT='#ff5367';
export const SONAR_SWEEP_SECONDS=2.4;
export function sonarSweepAngle(time:number){return ((time%SONAR_SWEEP_SECONDS+SONAR_SWEEP_SECONDS)%SONAR_SWEEP_SECONDS)/SONAR_SWEEP_SECONDS*Math.PI*2;}
export function sonarEchoAlpha(time:number,bearing:number){
 const age=((sonarSweepAngle(time)-bearing)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)/(Math.PI*2)*SONAR_SWEEP_SECONDS;
 // Continuous low-gain safety channel stays readable between scans.
 return .25+.75*Math.exp(-age/.55);
}
/** First physical return, not a decorative/seeded radar silhouette. */
export function sonarRay(origin:Vector3,dx:number,dz:number,solids:readonly Box3[],range=SONAR_RANGE):number {
 let nearest=range;
 for(const b of solids){
  if(b.max.y<origin.y-1.5||b.min.y>origin.y+1.5)continue;
  let near=0,far=range;
  for(const [p,d,lo,hi] of [[origin.x,dx,b.min.x,b.max.x],[origin.z,dz,b.min.z,b.max.z]]){
   if(Math.abs(d)<1e-8){if(p<lo||p>hi){far=-1;break;}continue;}
   const a=(lo-p)/d,c=(hi-p)/d;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));
  }
  if(far>=near&&far>=0)nearest=Math.min(nearest,near);
 }
 return nearest;
}
export function scanNavigationSonar(origin:Vector3,heading:number,solids:readonly Box3[]){
 const h=heading*Math.PI/180;
 const nearby=solids.filter(b=>b.distanceToPoint(origin)<SONAR_RANGE+4);
 return Array.from({length:144},(_,i)=>{const bearing=i*Math.PI*2/144;return {bearing,distance:sonarRay(origin,Math.sin(h+bearing),-Math.cos(h+bearing),nearby)};});
}
