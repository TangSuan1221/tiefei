// Keeps one level-two browser alive so a continuous run can be driven step by step (tools/living-continuous-step.mjs).
// API and external hosts are blocked; Vite HMR is disabled so source edits cannot restart the run mid-way.
import {chromium} from '@playwright/test';
const port=Number(process.env.CDP_PORT??9351),base=process.env.LIVING_URL??'http://127.0.0.1:5180';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`]});
const context=await browser.newContext({viewport:{width:1600,height:900}});
await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Native(url,protocols);};window.WebSocket.prototype=Native.prototype;Object.assign(window.WebSocket,{OPEN:1,CLOSED:3,CONNECTING:0,CLOSING:2});});
await context.route('**/*',r=>{const u=new URL(r.request().url());return !['127.0.0.1','localhost'].includes(u.hostname)||u.pathname.startsWith('/api')?r.abort():r.continue();});
const page=await context.newPage();
page.on('pageerror',e=>console.log('pageerror',e.message));
await page.goto(base+'/?level=2');
await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('ironlung.'))localStorage.removeItem(k);});
await page.reload();
console.log('host ready on',port);
await new Promise(()=>{});
