import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {startNew,sit,siteShot} from './living-browser-lib.mjs';
const dir='qa/living-survey/round15-overall-independent';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1600,height:900}});const blocked=[],errors=[];
await context.route('**/*',r=>{const u=new URL(r.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname.startsWith('/api/')){blocked.push(u.href);return r.abort();}return r.continue();});
await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Native(url,protocols);};window.WebSocket.prototype=Native.prototype;});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{await page.goto((process.env.LIVING_URL??'http://127.0.0.1:5180')+'/?level=2');await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);
// Exact six camera fixtures from living-survey-art-check.mjs, no blind-play claim.
const cameras=[['entry',7,0,6,145],['repair-link',56,0,26,90],['supply',134,0,13.5,90],['password',128.5,0,35,180],['atrium',144,0,60,90],['exit',193,0,68,90]];
for(const [name,x,y,z,h]of cameras){await page.evaluate(([x,y,z,h])=>{window.__living.diag.teleport(x,y,z,h);window.__pod.lamp=true;},[x,y,z,h]);await page.waitForTimeout(500);await siteShot(page,dir+'/'+name+'-film.png',true);await siteShot(page,dir+'/'+name+'-live.png',false);}
await writeFile(dir+'/capture.json',JSON.stringify({base:process.env.LIVING_URL??'http://127.0.0.1:5180',method:'Independent local browser; original six fixed diagnostic cameras; API and external requests blocked; HMR disabled; not blind play.',cameras,blocked,errors},null,2));console.log({dir,errors,blocked});
}finally{await browser.close();}
