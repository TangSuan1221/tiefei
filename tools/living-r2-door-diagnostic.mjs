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
 result=await page.evaluate(async()=>{
 const l=window.__living,r=window.__pod;window.GM.noVideo(true);r.gmLevelSession=true;r.at='camera';r.power=1;
 const T=await import('/node_modules/three/build/three.module.js'),{harborHullClear,hullSamples}=await import('/src/pod/sim/harbor-navigation.ts');
 const probe=(x,z,h)=>{const p=new T.Vector3(x,0,z),solids=l.solids(p);return {x,z,h,clear:l.clear(p,h),outside:hullSamples(p,h).filter(v=>!l.world.walkable.some(b=>b.containsPoint(v))).map(v=>v.toArray()),reject:solids.filter(b=>!harborHullClear(p,h,[new T.Box3(new T.Vector3(-1e4,-1e4,-1e4),new T.Vector3(1e4,1e4,1e4))],[b])).map(b=>({min:b.min.toArray(),max:b.max.toArray()}))};};
 const probes=[];for(const [x,z] of [[49.9,5.9],[50.1,9.1]])for(const h of [176.5,177,177.5])probes.push(probe(x,z,h));
 const legal=l.diag.teleport(49.9,0,5.9,177);return {probes,legal,turnLeft:l.turn(-.5),turnRight:l.turn(.5),pos:l.diag.state().pos,heading:r.heading};
 });
 const snapshots=[];const snap=async label=>{snapshots.push(await page.evaluate(label=>({label,pos:window.__living.diag.state().pos,heading:window.__pod.heading,speed:window.__pod.pilot.speed,feedback:window.__living.feedbackText}),label));};
 const hold=async(key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
 await snap('diagnostic start');await hold('j',5800);await hold('Shift',500);await snap('J 5.8s reproducer');
 // Forward nudge restores clearance from the north wall; then use only actual keys.
 await hold(' ',1600);await hold('Shift',700);await snap('forward nudge');
 await page.keyboard.down('j');await page.waitForFunction(()=>window.__pod.heading<94,null,{timeout:15000}).finally(()=>page.keyboard.up('j'));await hold('Shift',700);await snap('turned east');
 await page.keyboard.down(' ');await page.waitForFunction(()=>window.__living.position.x>=52.9,null,{timeout:15000}).finally(()=>page.keyboard.up(' '));await hold('Shift',700);await snap('at doorway center x');
 await page.keyboard.down('l');await page.waitForFunction(()=>window.__pod.heading>=176,null,{timeout:15000}).finally(()=>page.keyboard.up('l'));await hold('Shift',700);await snap('turned south');
 await page.keyboard.down(' ');await page.waitForFunction(()=>window.__living.position.z>=15,null,{timeout:20000}).finally(()=>page.keyboard.up(' '));await hold('Shift',700);await snap('entered R2');
 result.snapshots=snapshots;result.pass=result.legal&&snapshots.at(-1).pos[2]>=15;
} catch(e){result={...result,pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/r2-door-diagnostic.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;
