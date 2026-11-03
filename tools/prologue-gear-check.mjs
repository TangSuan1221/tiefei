import assert from 'node:assert/strict';
import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/prologue-gear',{query:''});
const observations=[];
async function click(id){
 const point=await page.evaluate(id=>{
  const v=window.__podView,c=v.cabin;let p;
  if(id.startsWith('sonar.axis.')){
   const s=c.screens.find(s=>s.id==='nav'),r=s.hits.rectOf(id),g=s.mesh.geometry.parameters;
   if(!r)throw Error('Missing screen target '+id);
   p=c.camera.position.clone().set(((r.x+r.w/2)/1024-.5)*g.width,(.5-(r.y+r.h/2)/s.canvas.height)*g.height,0);s.mesh.localToWorld(p);
  }else{let o;c.scene.traverse(x=>{if(!o&&x.userData.control===id)o=x;});if(!o)throw Error('Missing control '+id);p=o.getWorldPosition(c.camera.position.clone());}
  p.project(c.camera);const x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;
  for(const dy of [0,-4,4,-8,8,-16,16,-24,24])for(const dx of [0,-4,4,-8,8,-16,16,-24,24])if(v.pick(x+dx,y+dy)?.endsWith(':'+id))return {x:x+dx,y:y+dy};
  throw Error('No rendered hit for '+id);
 },id);
 await page.evaluate(()=>{window.__pointerEvents=[];window.addEventListener('pointerdown',e=>window.__pointerEvents.push({target:e.target?.id,pick:window.__podView.pick(e.clientX,e.clientY),focused:window.__podView.cabin.lessonFocused,at:window.__pod.at}),{once:true});});
 await page.mouse.click(point.x,point.y);await page.waitForTimeout(250);
 const state=await page.evaluate(async()=>{const {sonarDeskState}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(u=>new URL(u).pathname==='/src/pod/view/sonar-desk.ts')??'/src/pod/view/sonar-desk.ts');const s=sonarDeskState(window.__pod);return {fields:[...s.fields],axis:s.axis,step:window.__pod.prologue.step,events:window.__pointerEvents};});
 observations.push({id,point,...state});return state;
}
try{
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__pod?.prologue?.active,null,{timeout:60000});await page.waitForFunction(()=>window.__pod.clock>5,null,{timeout:60000});
 // The introductory cut-in has ended: deliberately enter the navigation close-up.
 await click('sonar.axis.1');await page.waitForTimeout(1000);
 assert.equal((await click('sonar.axis.1')).axis,1,'a field click must reach the field, not be consumed by camera zoom');
 await click('sonar.key.1');assert.equal((await click('sonar.key.6')).fields[1],'16');
 await click('sonar.axis.0');await click('sonar.key.1');assert.equal((await click('sonar.key.1')).fields[0],'11');
 await click('sonar.axis.2');for(const k of ['1','0','1','2'])await click('sonar.key.'+k);
 assert.equal((await click('sonar.save')).step,1);
 await page.waitForFunction(()=>window.__pod.prologue.age>2);
 await click('camera.lamp');await page.waitForFunction(()=>window.__pod.prologue.step===2&&window.__pod.prologue.age>2);
 async function drag(steps){
  const p=await page.evaluate(steps=>{
   const v=window.__podView,c=v.cabin,o=c.scene.getObjectByName('helm-throttle-grip'),p=o.getWorldPosition(c.camera.position.clone()).project(c.camera);
   const x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;
   const desired=Math.max(0,Math.min(3,window.__pod.throttle+steps)),target=o.position.clone();target.y=-.145+desired*.095;o.parent.localToWorld(target);target.project(c.camera);const tx=(target.x+1)*innerWidth/2,ty=(1-target.y)*innerHeight/2;
   for(const dy of [0,-4,4,-8,8,-16,16])for(const dx of [0,-4,4,-8,8,-16,16])if(v.pick(x+dx,y+dy)?.endsWith(':helm.throttle'))return {x:x+dx,y:y+dy,tx,ty};
   throw Error('slider not reachable');
  },steps);
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.tx,p.ty,{steps:12});await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>window.__pod.prologue.step),2,'must release selector before advancing');
  await page.mouse.up();await page.waitForTimeout(700);
  return page.evaluate(()=>({gear:window.__pod.throttle,step:window.__pod.prologue.step,speed:window.__pod.pilot.speed,grip:window.__podView.cabin.scene.getObjectByName('helm-throttle-grip').position.y}));
 }
 const high=await drag(3);observations.push({high});assert.equal(high.gear,3);assert.equal(high.step,2);assert.equal(high.speed,0);
 const low=await drag(-2);observations.push({low});assert.equal(low.gear,1);assert.equal(low.step,3);assert.equal(low.speed,0);assert(Math.abs(low.grip-(-.05))<.001);
 await page.screenshot({path:'qa/prologue-gear/completed.png'});
 console.log('PASS mouse-only coordinates, lamp, slider 0→III→I; release advances; gear stays latched; no propulsion');
}finally{await page.screenshot({path:'qa/prologue-gear/last-frame.png'});await writeFile('qa/prologue-gear/result.json',JSON.stringify({observations,errors},null,2));await browser.close();}
