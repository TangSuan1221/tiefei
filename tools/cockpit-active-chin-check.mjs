// Active CRT chin keys: real pointer clicks on the physical power/pulse keys toggle the sonar.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const url=process.env.URL??'http://127.0.0.1:5174/';
mkdirSync('qa/cockpit',{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:1920,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url);await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView);
 await p.waitForTimeout(800);
 for(let i=0;i<8&&await p.evaluate(()=>window.__pod.at)!=='nav';i++){await p.keyboard.down('w');await p.waitForTimeout(500);await p.keyboard.up('w');await p.keyboard.press('e');await p.waitForTimeout(1200);}
 const at=await p.evaluate(()=>window.__pod.at);assert.ok(['nav','camera','lab'].includes(at),'not in console interaction: '+at);
 // Look left and up toward the active CRT, then zoom into the left device by clicking its glass.
 await p.mouse.move(960,430);await p.mouse.down({button:'right'});await p.mouse.move(650,560,{steps:24});await p.mouse.up({button:'right'});await p.waitForTimeout(1400);
 const glass=await p.evaluate(()=>{const c=window.__podView.cabin,s=c.screens.find(s=>s.id==='nav'&&s.repeater),q=s.mesh.getWorldPosition(c.camera.position.clone()).project(c.camera);return{x:(q.x+1)*innerWidth/2,y:(1-q.y)*innerHeight/2};});
 await p.mouse.click(glass.x,glass.y);await p.waitForTimeout(1600);
 assert.equal(await p.evaluate(()=>window.__podView.cabin.deviceZoom),'nav','left device zoom');
 const press=async id=>{const q=await p.evaluate(id=>{const v=window.__podView,c=v.cabin,o=c.scene.getObjectByName('crt.'+id);if(!o)throw Error('missing '+id);const q=o.getWorldPosition(c.camera.position.clone()).project(c.camera);const x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;for(let r=0;r<40;r+=2)for(const [dx,dy] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]])if(v.pick(x+dx,y+dy)==='desk:nav:'+id)return{x:x+dx,y:y+dy};throw Error(id+' unreachable, hit '+v.pick(x,y));},id);await p.mouse.click(q.x,q.y);await p.waitForTimeout(400);};
 const state=()=>p.evaluate(()=>({power:window.__pod.activeSonarEnabled,pulse:window.__pod.sonarPulseEnabled}));
 const s0=await state();
 await p.screenshot({path:'qa/cockpit/active-chin-before.png'});
 await press('nav.ping1');const s1=await state();assert.equal(s1.pulse,!s0.pulse,'pulse key toggles');
 await press('nav.active');const s2=await state();assert.equal(s2.power,!s0.power,'power key toggles');
 await press('nav.active');await press('nav.ping1');if(!(await state()).pulse)await press('nav.ping1');
 const s3=await state();assert.ok(s3.power&&s3.pulse,'power and pulse back on');
 await p.waitForTimeout(500);await p.screenshot({path:'qa/cockpit/active-chin-on.png'});
 const chin=await p.evaluate(()=>{const c=window.__podView.cabin,o=c.scene.getObjectByName('crt.nav.active'),q=o.getWorldPosition(c.camera.position.clone()).project(c.camera);return{x:(q.x+1)*innerWidth/2,y:(1-q.y)*innerHeight/2};});
 await p.screenshot({path:'qa/cockpit/active-chin-closeup.png',clip:{x:Math.max(0,chin.x-160),y:Math.max(0,chin.y-330),width:520,height:400}});
 // Enter a waypoint on the physical keyboard so the info column shows its fullest state.
 const key=async id=>{const q=await p.evaluate(id=>{const v=window.__podView,c=v.cabin,o=c.scene.getObjectByName(id);const q=o.getWorldPosition(c.camera.position.clone()).project(c.camera);const x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;for(let r=0;r<50;r+=2)for(const [dx,dy] of [[0,0],[r,0],[-r,0],[0,r],[0,-r]])if(v.pick(x+dx,y+dy)==='desk:nav:'+id)return{x:x+dx,y:y+dy};throw Error(id+' unreachable');},id);await p.mouse.click(q.x,q.y);await p.waitForTimeout(250);};
 for(const id of ['sonar.axis.0','sonar.key.1','sonar.key.1','sonar.axis.1','sonar.key.0','sonar.axis.2','sonar.key.1','sonar.key.6','sonar.save'])await key(id);
 await p.waitForTimeout(500);
 await p.screenshot({path:'qa/cockpit/active-chin-waypoint.png',clip:{x:Math.max(0,chin.x-160),y:Math.max(0,chin.y-330),width:520,height:400}});
 const drawn=await p.evaluate(()=>{const s=window.__podView.cabin.screens.find(s=>s.id==='nav'&&s.repeater);return['nav.active','nav.ping1'].filter(id=>s.hits.rectOf(id));});
 assert.deepEqual(drawn,[],'screen must not draw power/pulse buttons');
 assert.deepEqual(errors,[]);
 console.log('PASS active CRT chin keys',JSON.stringify({at,s0,s1,s2,s3}));
}finally{await b.close();}
