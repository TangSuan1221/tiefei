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
 const l=window.__living,r=window.__pod;window.GM.noVideo(true);const T=await import('/node_modules/three/build/three.module.js'),{harborHullClear,sweepHarborHeading}=await import('/src/pod/sim/harbor-navigation.ts');
 const rows=[];
 for(const c of [{name:'north wall recommends forward',p:[49.9,0,5.9],h:177,d:-20,key:'Space 前进'},{name:'south doorway wall recommends reverse',p:[50.1,0,9.1],h:177,d:-20,key:'N 倒车'},{name:'pitched down near floor must not suggest forward',p:[49.9,-1.49,5.9],h:177,d:-20,pitch:16,key:'检查门框'}]){
 r.pitch=c.pitch??0;if(!l.diag.teleport(...c.p,c.h))throw Error('bad pose '+c.name);r.heading=l.turn(c.d);const before=l.diag.state().pos,h=r.heading;l.elapsed+=4;l.turn(Math.sign(c.d)*.5);const text=l.feedbackText;rows.push({name:c.name,pass:text.includes(c.key)&&JSON.stringify(before)===JSON.stringify(l.diag.state().pos)&&r.heading===h,heading:h,text});
 }
 const position=new T.Vector3(0,0,0),walkable=[new T.Box3(new T.Vector3(-20,-5,-20),new T.Vector3(20,5,20))],solids=[new T.Box3(new T.Vector3(-20,-4,2.65),new T.Vector3(20,4,3)),new T.Box3(new T.Vector3(-20,-4,-3),new T.Vector3(20,4,-2.65))];
 const clear=(p,h)=>harborHullClear(p,h,walkable,solids),heading=sweepHarborHeading(0,20,h=>clear(position,h));
 const text=l.turnRecoveryHint.call({position,run:{heading,pitch:0},clear},.5,solids);
 rows.push({name:'both short translations blocked stays neutral',pass:!text.includes('Space')&&!text.includes('N 倒车')&&text.includes('Shift'),heading,text});
 return {rows,pass:rows.every(x=>x.pass),method:'Actual world north/south jam poses and production turn feedback; no movement triggered by hint. Final case bounded AABB pocket fixture using real harborHullClear and sweep; no runtime geometry mutation.'};
 });
} catch(e){result={pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/turn-recovery-hint-diagnostic.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;




