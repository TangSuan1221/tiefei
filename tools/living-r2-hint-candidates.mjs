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
 const l=window.__living;window.GM.noVideo(true);const T=await import('/node_modules/three/build/three.module.js'),{harborHullClear,sweepHarborHeading,hullSamples}=await import('/src/pod/sim/harbor-navigation.ts');
 const probe=(p,h)=>({pos:p.toArray(),h,clear:l.clear(p,h),reject:l.solids(p).filter(b=>!harborHullClear(p,h,[new T.Box3(new T.Vector3(-1e4,-1e4,-1e4),new T.Vector3(1e4,1e4,1e4))],[b])).map(b=>({min:b.min.toArray(),max:b.max.toArray()})),outside:hullSamples(p,h).filter(v=>!l.world.walkable.some(b=>b.containsPoint(v))).map(v=>v.toArray())});
 const h=175.6031479896776,p=new T.Vector3(49.9,0,5.9),dir=new T.Vector3(Math.sin(h*Math.PI/180),0,-Math.cos(h*Math.PI/180));
 const rows=[];for(const sign of [1,-1]){let q=p.clone(),distance=0,blocked;for(let i=0;i<25;i++){const n=q.clone().addScaledVector(dir,sign*.04);if(!l.clear(n,h)){blocked=probe(n,h);break;}q=n;distance+=.04;}const left=sweepHarborHeading(h,-90,a=>l.clear(q,a)),right=sweepHarborHeading(h,90,a=>l.clear(q,a));rows.push({direction:sign>0?'forward':'reverse',distance,end:q.toArray(),left,right,blocked});}
 return {blockedTurn:probe(p,h-.5),candidateRows:rows,doorForward:probe(new T.Vector3(50.1+Math.sin(177*Math.PI/180)*.1,0,9.1-Math.cos(177*Math.PI/180)*.1),177),method:'Full actual site solids; +/-1m candidate translations swept at .04m; heading sweeps .5deg. Pure read-only position probes, no state relocation.'};
 });
} catch(e){result={error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/r2-door-hint-candidates.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));
