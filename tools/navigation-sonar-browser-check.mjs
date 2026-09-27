import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();r.walkTo('camera');r.at='camera';r.lamp=false;r.footageSink=null;
  const s=r.authoredSite,before=s.position.clone();
  for(let i=0;i<60;i++){r.holdPilot(.5,0,0);r.frame(.05);}r.pilot.stop();
  const moved=s.position.distanceTo(before);if(moved<.2||r.lit)throw Error('Dark driving failed');
  const c=document.createElement('canvas');c.width=1024;c.height=720;const ctx=c.getContext('2d');
  const count=()=>{const p=ctx.getImageData(0,0,c.width,c.height).data;let amber=0,red=0;for(let i=0;i<p.length;i+=4){if(p[i]>180&&p[i+1]>130&&p[i+1]<210&&p[i+2]<140)amber++;if(p[i]>220&&p[i+1]<120&&p[i+2]>60)red++;}return{amber,red};};
  s.drawDrivingSonar(ctx,1024,720,r.clock);const calm=count();
  if(calm.amber<50)throw Error('No structural sonar returns');
  r.spawnThreat('cre.runner',32);ctx.clearRect(0,0,1024,720);s.drawDrivingSonar(ctx,1024,720,r.clock+.2);const threat=count();
  if(threat.red<=calm.red)throw Error('Threat not distinctly displayed');
  r.threat.phase='repelled';ctx.clearRect(0,0,1024,720);s.drawDrivingSonar(ctx,1024,720,r.clock+.4);const cleared=count();
  if(cleared.red!==calm.red)throw Error('Repelled marker remains');
  return{moved,lamp:r.lit,calm,threat,cleared,frame:c.toDataURL()};
 });
 await page.waitForTimeout(1500);await mkdir('qa/harbor/sonar',{recursive:true});await page.screenshot({path:'qa/harbor/sonar/dark-driving.png'});
 await writeFile('qa/harbor/sonar/instrument.png',Buffer.from(result.frame.split(',')[1],'base64'));
 delete result.frame;await writeFile('qa/harbor/sonar/result.json',JSON.stringify({result,errors,method:'Actual formal-entry renderer and pilot; short lamp-off drive, not full unassisted level'},null,2));
 assert.deepEqual(errors,[]);console.log(result);
}finally{await browser.close();}
