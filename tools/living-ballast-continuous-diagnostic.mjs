import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await browser.newPage();const blocked=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:5180'||u.pathname.startsWith('/api/')){blocked.push(u.href);return r.abort();}return r.continue();});
await page.addInitScript(()=>{const W=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new W(url,protocols);};window.WebSocket.prototype=W.prototype;});
let result;
try{
 await page.goto('http://127.0.0.1:5180/?level=2');await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('ironlung.'))localStorage.removeItem(k);});
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__living,null,{timeout:60000});await page.evaluate(()=>window.__living.world.ready);
 const setup=await page.evaluate(async()=>{
 const l=window.__living,r=window.__pod;window.GM.noVideo(true);r.gmLevelSession=true;r.at='camera';r.lamp=true;r.camPan=0;r.camTilt=0;r.power=1;
 const T=await import('/node_modules/three/build/three.module.js');const {harborHullClear}=await import('/src/pod/sim/harbor-navigation.ts');
 const p=new T.Vector3(112,0,29),h=90;const sources=[];
 for(const item of (await import('/src/pod/content/living-deck-layout.ts')).LIVING_ITEMS.filter(x=>x.kind==='box'))if(!harborHullClear(p,h,l.world.walkable,[l.boxBounds(item.id)]))sources.push('box:'+item.id);
 const solids=l.solids(p);const rejecting=solids.map((b,i)=>!harborHullClear(p,h,l.world.walkable,[b])?{i,min:b.min.toArray(),max:b.max.toArray()}:null).filter(Boolean);
 const start=l.diag.teleport(100,0,26,180);const rows=[];const move=(d)=>{let left=Math.abs(d),ok=true;while(left>1e-7){const n=Math.min(.04,left);if(!l.move(Math.sign(d)*n)){ok=false;break;}left-=n;}return ok;};
 const turn=(target)=>{for(let k=0;k<721;k++){const diff=(target-r.heading+540)%360-180;if(Math.abs(diff)<.001)return true;const step=Math.sign(diff)*Math.min(.5,Math.abs(diff)),next=l.turn(step);if(Math.abs((next-r.heading+540)%360-180)<.001)return false;r.heading=next;}return false;};
 rows.push({name:'start full site clear',pass:start});rows.push({name:'south west-lane segment',pass:move(6.5)});rows.push({name:'west corner real turn',pass:turn(90)});rows.push({name:'east approach to box',pass:move(12.5)});
 r.camTilt=Math.atan2(.6,3);l.pose();const aim=l.diag.aimed();rows.push({name:'actual ballast aimed',pass:aim?.id==='living.box.ballast'&&aim.distance<=3.4,aim});
 return {sources,rejecting,shellClear:harborHullClear(p,h,l.world.walkable,l.world.colliders),rows,pos:l.diag.state().pos};
 });
 for(let i=0;i<3;i++){await page.evaluate(()=>window.__living.interact());await page.waitForTimeout(5000);}
 const end=await page.evaluate(()=>{
 const l=window.__living,r=window.__pod;const rows=[{name:'real timed arm retrieved ballast',pass:l.survey.ballast&&l.cargo.has('living.box.ballast')&&r.arm.phase==='stowed',arm:r.arm.phase}];
 const move=d=>{let left=Math.abs(d),ok=true;while(left>1e-7){const n=Math.min(.04,left);if(!l.move(Math.sign(d)*n)){ok=false;break;}left-=n;}return ok;};
 const turn=target=>{for(let k=0;k<721;k++){const diff=(target-r.heading+540)%360-180;if(Math.abs(diff)<.001)return true;const next=l.turn(Math.sign(diff)*Math.min(.5,Math.abs(diff)));if(Math.abs((next-r.heading+540)%360-180)<.001)return false;r.heading=next;}return false;};
 rows.push({name:'reverse with retained heading',pass:move(-12.5)});rows.push({name:'west corner north turn',pass:turn(0)});rows.push({name:'west lane north exit',pass:move(15.5)});rows.push({name:'north corner east turn',pass:turn(90)});rows.push({name:'R4 through actual doorway to G',pass:move(28.5)});
 return {rows,pos:l.diag.state().pos,heading:r.heading};
 });result={setup,end,pass:[...setup.rows,...end.rows].every(x=>x.pass),method:'Full site solids incl shell, uncollected boxes and creatures; continuous move/turn API sweeps from one validated starting teleport; real timed interact arm cycle; no force-position between connected legs. GM no-video. Not human driving.'};
} catch(e){result={pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/ballast-continuous-diagnostic.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
