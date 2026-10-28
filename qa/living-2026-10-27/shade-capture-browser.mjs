import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}});const out={method:'Legal diagnostic initialization; one synchronous evaluate, no elapsed simulation between cases; not blind play',blocked:[],errors:[]};
page.on('pageerror',e=>out.errors.push(String(e)));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||!['127.0.0.1','localhost'].includes(u.hostname)){out.blocked.push(u.origin+u.pathname);return route.abort();}return route.continue();});
try{
 await page.goto((process.env.LIVING_URL??'http://127.0.0.1:5192')+'/?level=2');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__living);await page.evaluate(()=>__living.world.ready);
 out.result=await page.evaluate(()=>{
  const l=__living,r=__pod;r.walkTo('camera');r.pilot.stop();r.lamp=true;r.camPan=0;r.camTilt=0;r.camZoom=1;
  l.survey.briefed=true; // Isolate geometric gate, not a completed campaign or persisted save.
  const rows=[];
  function take(name,x,y,z,heading,zoom,lamp){
   r.camZoom=zoom;r.lamp=lamp;r.camPan=0;r.camTilt=0;
   const legal=l.diag.teleport(x,y,z,heading);if(!legal){rows.push({name,legal});return;}
   const seen=l.computeSeen(),c=l.creatures.views.find(c=>c.id==='shade.r4'),p=l.position.clone().set(...c.position);
   const box=l.world.gate.bounds.clone().set(p.clone().add(p.clone().set(-1.2,-.75,-1.5)),p.clone().add(p.clone().set(1.2,.75,1.5))),rect=l.projectBox(box),fill=rect?(rect[2]-rect[0])*(rect[3]-rect[1])/4:0,heightPx=rect?(rect[3]-rect[1])*496/2:0;
   const evidence=l.captureEvidence();
   rows.push({name,legal,pose:l.vec(),heading:r.heading,zoom,lamp,creature:c,checks:{distance:p.distanceTo(l.position),range:p.distanceTo(l.position)<=26,inFrame:l.inFrame(p,1),lineOfSight:l.segmentClear(l.position,p),illuminated:l.illuminated(p),rect,fill,fillPass:fill>=.025,heightPx,heightPass:heightPx>=24,speed:r.pilot.speed,yawRate:r.pilot.yawRate,seen:seen.creatureIds.includes(c.id),rejected:seen.rejected.find(v=>v.id===c.id)},diagnostic:l.captureDiagnostic(seen),evidence,title:l.describeEvidence(evidence)});
  }
  take('lamp-off',100,0,26,90,1,false);
  take('reverse',100,0,26,270,1,true);
  take('small',100,0,26,90,1,true);
  take('zoom',100,0,26,90,2,true);
  take('near',103,0,26,90,1,true);
  return {rows,simulationTime:l.elapsed};
 });
}catch(e){out.error=String(e);}finally{writeFileSync('qa/living-2026-10-27/shade-capture-browser.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));await browser.close();}
