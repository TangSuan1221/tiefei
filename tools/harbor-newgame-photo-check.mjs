import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const dir='qa/harbor/newgame-photo';await mkdir(dir,{recursive:true});
const sourceFiles=['src/pod/view/session.ts','src/pod/view/deepsea/harbor-rescue-site.ts','src/pod/view/deepsea/harbor-rescue-world.ts','src/pod/view/present.ts'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const sourceHashes=await hashes();await writeFile(dir+'/source-hashes.json',JSON.stringify(sourceHashes,null,2));
const server=await chromium.launchServer({channel:'msedge',headless:true});const b=await chromium.connect(server.wsEndpoint());await writeFile(dir+'/browser-endpoint.txt',server.wsEndpoint());
const trace=[];let p;
try {
 p=await b.newPage({viewport:{width:1736,height:944}});await p.route('**/api/**',r=>r.abort());p.on('pageerror',e=>trace.push({error:e.message}));
 await p.addInitScript(()=>sessionStorage.setItem('ironlung.gm.novideo','1')); await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView&&!!window.__pod.authoredSite);
 const state=()=>p.evaluate(()=>{const r=window.__pod,s=r.authoredSite;return{phase:r.phase,legIndex:r.legIndex,position:s?.position.toArray()??null,heading:r.heading,camPan:r.camPan,camTilt:r.camTilt,at:r.at,opened:s?.base.state.opened??[],objective:s?.objective??null,caption:r.storyCaption,driveBlock:r.driveBlock,speed:r.pilot.speed,power:r.power,hull:r.hull,outcome:r.outcome.kind,rescue:s?.rescue?.state??null,entryReached:s?.snapshot().entryReached??false};});
 const record=async(label)=>{const s=await state();trace.push({label,...s});console.log(label,JSON.stringify(s));await writeFile(dir+'/results.json',JSON.stringify({method:'Real keyboard and mouse only; debug reads only; no game state mutation.',trace},null,2));return s;};
 const hold=async(key,ms)=>{await p.keyboard.down(key);await p.waitForTimeout(ms);await p.keyboard.up(key);};
 const drag=async(dx,dy)=>{await p.mouse.move(850,400);await p.mouse.down({button:'right'});await p.mouse.move(850+dx,400+dy,{steps:24});await p.mouse.up({button:'right'});await p.waitForTimeout(900);};
 const point=async(station,action)=>p.evaluate(({station,action})=>{const v=window.__podView,c=v.cabin,s=c.screens.find(s=>s.id===station),r=s.hits.rectOf(action);if(!r)throw Error('No hit '+action);const g=s.mesh.geometry.parameters,q=c.camera.position.clone().set(((r.x+r.w/2)/1024-.5)*g.width,(.5-(r.y+r.h/2)/720)*g.height,0).applyMatrix4(s.mesh.matrixWorld).project(c.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;for(const dy of [0,-1,1,-2,2,-3,3,-4,4,-6,6,-8,8,-12,12,-16,16,-20,20])for(const dx of [0,-1,1,-2,2,-3,3,-4,4,-6,6,-8,8,-12,12,-16,16,-20,20])if(x+dx>0&&x+dx<innerWidth&&y+dy>0&&y+dy<innerHeight&&(v.pick(x+dx,y+dy)==='desk:'+station+':'+action||(action==='sonar.tune.34'&&/^desk:nav:sonar\.tune\.(3[1-7])$/.test(v.pick(x+dx,y+dy)??''))))return{x:x+dx,y:y+dy};throw Error('Unreachable '+action);},{station,action});
 const click=async(s,a)=>{const q=await point(s,a);await p.mouse.click(q.x,q.y);await p.waitForTimeout(180);};
 await hold('w',1500);await p.keyboard.press('e');await p.waitForTimeout(2000);await drag(-415,0);
 for(const [axis,digits] of [[0,'11'],[1,'16'],[2,'1012']]){await click('nav','sonar.axis.'+axis);for(const d of digits)await click('nav','sonar.key.'+d);}
 await click('nav','sonar.save');await record('waypoint-set-via-keypad');
 await p.keyboard.down('Space');for(let i=0;i<120;i++){await p.waitForTimeout(250);const s=await state();if(s.position[2]>=17.9)break;if(i===119)throw Error('Unable to reach first door with Space');}await p.keyboard.up('Space');await hold('Shift',2000);
 await record('first-door-before-F');await p.keyboard.press('f');await p.waitForTimeout(1600);const after=await record('first-door-after-F');await p.screenshot({path:dir+'/first-door.png'});
 await writeFile(dir+'/results.json',JSON.stringify({method:'Only real keyboard/mouse inputs; debug reads only. No placement/state mutation.',trace},null,2));
 assert(after.opened.includes('harbor.edge.A-C'),'First A-C door did not open from navigation console with F');
 const angle=(h,t)=>(t-h+540)%360-180;
 const turn=async(target)=>{await hold('Shift',1200);for(let k=0;k<8;k++){let s=await state(),delta=angle(s.heading,target);if(Math.abs(delta)<1.5)break;const key=delta>0?'l':'j';await p.keyboard.down(key);let unchanged=0,previous=s.heading;for(let i=0;i<300;i++){await p.waitForTimeout(80);s=await state();if(Math.abs(angle(previous,s.heading))<.01)unchanged++;else unchanged=0;previous=s.heading;if(unchanged>30){await p.keyboard.up(key);await record('turn-blocked-'+target);await p.screenshot({path:dir+'/blocked-turn.png'});throw Error('Actual hull rotation blocked to '+target);}const rate=await p.evaluate(()=>window.__pod.pilot.yawRate);if(Math.abs(angle(s.heading,target))<Math.abs(rate)/2.4+.35||Math.sign(angle(s.heading,target))!==Math.sign(delta))break;}await p.keyboard.up(key);await p.waitForTimeout(1800);}await record('turn-'+target);};
 const drive=async(x,z)=>{let s=await state(),dx=x-s.position[0],dz=z-s.position[2],distance=Math.hypot(dx,dz);if(distance<.3)return;let desired=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;const reverse=Math.abs(angle(s.heading,desired))>100;await turn((desired+(reverse?180:0))%360);const key=reverse?'n':'Space';await p.keyboard.down(key);let stalled=0,last=s.position;for(let i=0;i<1400;i++){await p.waitForTimeout(150);s=await state();const remaining=((x-s.position[0])*dx+(z-s.position[2])*dz)/distance;if(remaining<Math.abs(s.speed)/3.2+.12)break;if(Math.hypot(s.position[0]-last[0],s.position[2]-last[2])<.001)stalled++;else stalled=0;if(stalled>30)throw Error('Driving blocked to '+x+','+z+' '+JSON.stringify(s));last=s.position;if(i===1399)throw Error('Drive timeout');}await p.keyboard.up(key);await hold('Shift',1700);await record('drive-'+x+','+z);};
 const path=await p.evaluate(()=>window.__pod.authoredSite.base.level.edges.find(e=>e.id==='harbor.edge.A-C').path);
 const operate=async(zone,expected)=>{for(let attempt=0;attempt<4;attempt++){const aim=await p.evaluate(zone=>{const s=window.__pod.authoredSite,g=s.visual.panels.get('harbor.rescue.'+zone),q=g.userData.lookAt;return (Math.atan2(q[0]-s.position.x,-(q[2]-s.position.z))*180/Math.PI+360)%360;},zone);await turn(aim);await p.keyboard.press('f');await p.waitForTimeout(250);const s=await record('operate-'+zone+'-'+attempt);if(s.rescue[expected])return;if(s.caption.includes('距艇')||s.caption.includes('3.4米')){await hold('Space',600);await hold('Shift',1200);}}throw Error('Panel interaction failed '+zone+' expected '+expected);};
 for(const q of path)await drive(q[0],q[2]);
 await drive(18,35);await drive(24,35);await turn(90);await p.keyboard.press('f');await p.waitForTimeout(1600);const second=await record('second-door-after-F');assert(second.opened.includes('harbor.edge.C-B'));
 await drive(32,35);await drive(60,35);await drive(60,27);await turn(0);await record('arrived-observation');
 await p.screenshot({path:dir+'/arrived-observation.png'});
 await click('nav','sonar.tune.34');await click('nav','sonar.analyze');await click('nav','sonar.play');await click('nav','sonar.reply');
 assert(await p.evaluate(()=>window.__pod.authoredSite.rescue.state.replied));
 for(const [axis,digits] of [[0,'60'],[1,'27'],[2,'1012']]){await click('nav','sonar.axis.'+axis);await click('nav','sonar.key.clear');for(const d of digits)await click('nav','sonar.key.'+d);}await click('nav','sonar.save');
 await drag(415,230);
 const physical=async(id)=>p.evaluate(id=>{const v=window.__podView;for(let y=80;y<innerHeight-30;y+=6)for(let x=60;x<innerWidth-60;x+=6)if(v.pick(x,y)==='desk:camera:'+id)return{x,y};throw Error('Unreachable physical '+id);},id);
 const physicalClick=async(id)=>{const q=await physical(id);await p.mouse.click(q.x,q.y);await p.waitForTimeout(200);};
 const photo=async(kind)=>{await physicalClick('camera.shoot');await p.waitForFunction(()=>window.__pod.shot.phase!=='exposing',null,{timeout:20000});if(kind==='lure'){await drag(-415,-230);await click('nav','nav.active');await drag(415,230);}await p.waitForFunction(()=>window.__pod.selectedTape?.ready,null,{timeout:80000});await drag(415,-230);await click('lab','lab.analyze');await p.waitForTimeout(500);const data=await p.evaluate(()=>{const r=window.__pod;return {evidence:r.selectedTape.siteEvidence,frames:r.selectedTape.sensorFrames?.length??0,boatHeading:r.heading,camPan:r.camPan,camTilt:r.camTilt,analyzed:r.selectedTape.analyzed,state:r.authoredSite.rescue.state};});trace.push({label:'photo-'+kind,...data});assert.equal(data.evidence.kind,kind);assert(data.evidence.visible&&data.analyzed&&data.frames>=3);await p.screenshot({path:dir+'/lab-'+kind+'-passed.png'});await drag(-415,230);await p.keyboard.press('6');await record('photo-'+kind+'-analyzed');};
 await turn(91); assert(Math.abs((await state()).heading-91)<2,'User heading not reproduced'); await photo('threat'); await p.screenshot({path:dir+'/photo-passed.png'});assert(await p.evaluate(()=>window.__pod.authoredSite.rescue.state.identified));
 await drive(60,32);await drive(42,32);await drive(42,28);await operate('power','powered');await record('power-restored');await p.screenshot({path:dir+'/power-restored.png'});assert(await p.evaluate(()=>window.__pod.authoredSite.rescue.state.powered));
 assert.deepEqual(await hashes(),sourceHashes,'Runtime source changed during playthrough');
} catch(error){trace.push({failure:String(error)});await p?.screenshot({path:dir+'/failure.png'}).catch(()=>{});console.error(error);} finally {await writeFile(dir+'/results.json',JSON.stringify({method:'Real keyboard and mouse only; debug reads only; no state mutation or teleport.',sourceHashes,passed:trace.at(-1)?.label==='power-restored',trace},null,2));if(trace.at(-1)?.label==='power-restored'){await b.close();await server.close();}else{await p.context().storageState({path:dir+'/actual-save-storage.json'});console.log('TEST FAILED: saved evidence');await b.close();await server.close();process.exitCode=1;}}












