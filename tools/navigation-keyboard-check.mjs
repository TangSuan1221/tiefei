// Navigation keypad check: Blender GLB loads, every cap is visible and ray-pickable in the
// left device close-up, clicking types into the waypoint fields, caps physically travel,
// and the click is voiced by the mechanical key cues instead of the generic UI beep.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const url=process.argv[2]??'http://127.0.0.1:5175/';
const out='qa/navigation-keyboard';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.abort());await page.goto(url);await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__podView&&!!window.__pod,null,{timeout:90000});
 await page.waitForFunction(()=>window.__podView.cabin.scene.getObjectByName('navigation-keyboard')?.userData.loaded,null,{timeout:30000});
 // Record cues the session asks for.
 await page.evaluate(()=>{const a=window.__podView.audio,orig=a.cue.bind(a);window.__cues=[];a.cue=(n,o)=>{window.__cues.push(n);orig(n,o);};});
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.walkTo('nav');});await page.waitForTimeout(4500);
 await page.evaluate(()=>{const c=window.__podView.cabin;c.deviceZoom='nav';});await page.waitForTimeout(2500);
 await page.screenshot({path:`${out}/game-closeup.png`});
 const locate=id=>page.evaluate(id=>{const v=window.__podView,c=v.cabin,k=c.scene.getObjectByName('navigation-keyboard');let o=null;k.traverse(m=>{if(m.userData.control===id&&m.isMesh)o=m;});if(!o)throw Error('missing cap '+id);
  const box=new o.geometry.boundingBox.constructor().setFromObject(o),q=box.getCenter(c.camera.position.clone()).project(c.pickingCamera),rect=document.getElementById('post-canvas').getBoundingClientRect();
  const x=rect.left+(q.x+1)*rect.width/2,y=rect.top+(1-q.y)*rect.height/2;return {x,y,pick:v.pick(x,y),inFrame:Math.abs(q.x)<.97&&Math.abs(q.y)<.97,rest:o.userData.__rest??o.position.y};},id);
 const ids=['1','2','3','4','5','6','7','8','9','-','0','.'].map(k=>'sonar.key.'+k).concat(['sonar.key.del','sonar.key.clear','sonar.next','sonar.save']);
 const keys=[];for(const id of ids){const k=await locate(id);keys.push({id,...k});assert.ok(k.inFrame,id+' clipped');assert.equal(k.pick,'desk:nav:'+id,id+' not pickable');}
 // Press-and-hold shows travel; release springs back.
 const p5=await locate('sonar.key.5');
 const depthOf=id=>page.evaluate(id=>{let o;window.__podView.cabin.scene.getObjectByName('navigation-keyboard').traverse(m=>{if(m.userData.control===id&&m.isMesh)o=m;});return o.position.y;},id);
 const rest=await depthOf('sonar.key.5');
 await page.mouse.move(p5.x,p5.y);await page.mouse.down();await page.waitForTimeout(120);const pressed=await depthOf('sonar.key.5');
 await page.screenshot({path:`${out}/game-pressed.png`});
 await page.mouse.up();await page.waitForTimeout(300);const back=await depthOf('sonar.key.5');
 assert.ok(rest-pressed>.0025,'cap did not travel: '+(rest-pressed));assert.ok(Math.abs(back-rest)<.0002,'cap did not return');
 // Type X 11 / Y 16 / DEPTH 1012 with the physical caps only (写入 advances the field).
 await page.evaluate(()=>{window.__cues.length=0;});
 const click=async id=>{const k=await locate(id);await page.mouse.click(k.x,k.y);await page.waitForTimeout(140);};
 for(const id of ['sonar.key.clear','sonar.key.5','sonar.key.del','sonar.key.1','sonar.key.1','sonar.next','sonar.key.1','sonar.key.6','sonar.next','sonar.key.1','sonar.key.0','sonar.key.1','sonar.key.2'])await click(id);
 const fields=await page.evaluate(async()=>{const m=await import(performance.getEntriesByType('resource').findLast(e=>/\/sonar-desk\.ts(?:\?|$)/.test(e.name)).name);return m.sonarDeskState(window.__pod).fields;});
 const cues=await page.evaluate(()=>window.__cues);
 const result={keys,rest,pressed,back,fields,cues,errors};await writeFile(`${out}/game-check.json`,JSON.stringify(result,null,2));
 assert.deepEqual(fields,['11','16','1012']);
 assert.equal(cues.filter(c=>c==='key.down').length,13);assert.equal(cues.filter(c=>c==='key.up').length,13);
 assert.ok(!cues.includes('ui.select'),'generic beep still plays on keypad');
 assert.deepEqual(errors,[]);
 // Close-up for visual review: the real nav device view, cropped to the keypad's projected bounds.
 const clip=await page.evaluate(async()=>{const T=await import(performance.getEntriesByType('resource').findLast(e=>/three\.js(?:\?|$)/.test(e.name)).name);const r=window.__pod;r.storyCaption='';Object.defineProperty(r,'storyCaptionLeft',{get:()=>0,set:()=>{},configurable:true});
  const c=window.__podView.cabin,b=new T.Box3().setFromObject(c.scene.getObjectByName('navigation-keyboard')),rect=document.getElementById('post-canvas').getBoundingClientRect();let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const q=new T.Vector3(x,y,z).project(c.pickingCamera);const px=rect.left+(q.x+1)*rect.width/2,py=rect.top+(1-q.y)*rect.height/2;x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);}
  const pad=24;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);return {x:x0,y:y0,width:Math.min(innerWidth,x1+pad)-x0,height:Math.min(innerHeight,y1+pad)-y0};});
 await page.waitForTimeout(600);await page.screenshot({path:`${out}/game-keypad.png`,clip});
 console.log('PASS 16 caps visible+pickable, travel',(rest-pressed).toFixed(4),'m, fields',fields.join('/'),', cues',cues.length);
}finally{await browser.close();}
