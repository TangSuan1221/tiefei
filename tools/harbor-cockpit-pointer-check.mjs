import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage({viewport:{width:1736,height:944}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());
 await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView);
 // Arrival is diagnostic setup; every cockpit action below uses real pointer/key events.
 await p.evaluate(()=>{window.__pod.receive();window.__pod.arrive();});
 await p.keyboard.down('w');await p.waitForTimeout(1500);await p.keyboard.up('w');assert(await p.locator('#cabin-interact').isVisible());await p.keyboard.press('e');await p.waitForTimeout(5000);
 const drag=async(dx,dy)=>{await p.mouse.move(850,400);await p.mouse.down({button:'right'});await p.mouse.move(850+dx,400+dy,{steps:24});await p.mouse.up({button:'right'});await p.waitForTimeout(1500);};
 const point=async(station,action)=>p.evaluate(({station,action})=>{const view=window.__podView,c=view.cabin,screen=c.screens.find(s=>s.id===station),r=screen.hits.rectOf(action);if(!r)throw Error('No hit rectangle '+action);const geo=screen.mesh.geometry.parameters,q=c.camera.position.clone().set(((r.x+r.w/2)/1024-.5)*geo.width,(.5-(r.y+r.h/2)/720)*geo.height,0).applyMatrix4(screen.mesh.matrixWorld).project(c.camera);const x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;for(const dy of [0,-2,2,-4,4,-8,8,-12,12,-20,20])for(const dx of [0,-2,2,-4,4,-8,8,-12,12,-20,20])if(x+dx>0&&x+dx<innerWidth&&y+dy>0&&y+dy<innerHeight&&view.pick(x+dx,y+dy)==='desk:'+station+':'+action)return{x:x+dx,y:y+dy};throw Error('Unreachable '+action);},{station,action});
 const click=async(station,action)=>{const q=await point(station,action);await p.mouse.click(q.x,q.y);await p.waitForTimeout(250);};
 await drag(-415,0);
 for(const [axis,digits] of [[0,'11'],[1,'16'],[2,'1012']]){await click('nav','sonar.axis.'+axis);for(const digit of digits)await click('nav','sonar.key.'+digit);}
 await click('nav','sonar.save');assert.deepEqual(await p.evaluate(()=>window.__pod.authoredSite.navigationConsole.target),[11,0,16]);
 await p.evaluate(()=>window.__pod.authoredSite.position.set(11,0,16));await p.waitForTimeout(250);await p.evaluate(()=>window.__pod.authoredSite.position.set(35,0,30));await p.waitForTimeout(500);
 await click('nav','sonar.tune.34');await click('nav','sonar.analyze');await click('nav','sonar.play');await click('nav','sonar.reply');assert(await p.evaluate(()=>window.__pod.authoredSite.rescue.state.replied));
 await click('nav','sonar.home');await click('nav','nav.active');assert(await p.evaluate(()=>window.__pod.activeSonarEnabled));await click('nav','nav.active');
 await p.screenshot({path:'qa/cockpit/formal-sonar-clicks.png'});
 await drag(830,0);await click('lab','lab.evidence');assert.equal(await p.evaluate(()=>window.__pod.at),'lab');
 await drag(-415,230);
 const physical=async(id)=>p.evaluate(id=>{const v=window.__podView;for(let y=80;y<innerHeight-30;y+=6)for(let x=60;x<innerWidth-60;x+=6)if(v.pick(x,y)==='desk:camera:'+id)return{x,y};throw Error('Unreachable physical '+id);},id);
 const lamp=await physical('camera.lamp'),was=await p.evaluate(()=>window.__pod.lamp);await p.mouse.click(lamp.x,lamp.y);assert.notEqual(await p.evaluate(()=>window.__pod.lamp),was);
 const stick=await physical('helm.stick');await p.mouse.move(stick.x,stick.y);await p.mouse.down();await p.mouse.move(stick.x+50,stick.y-55,{steps:10});await p.waitForTimeout(250);const axes=await p.evaluate(()=>({...window.__podView.cabin.helmInput}));assert(axes.thrust>0&&axes.yaw>0);await p.mouse.up();
 await p.screenshot({path:'qa/cockpit/formal-helm-clicks.png'});assert.deepEqual(errors,[]);
 console.log('PASS formal E, real XYZ keypad/save, tune/analyze/play/reply, active toggle, right look/lab click, lamp and joystick drag');
}finally{await b.close();}
