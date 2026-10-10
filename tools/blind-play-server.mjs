// Player-only browser driver for context-free playtests: screenshots and real keyboard/mouse input, no game state access.
// GET /goto?url=  /shot  /key?k=w&ms=800  /press?k=e  /click?x=&y=  /move?dx=&dy=  /wait?ms=  /errors
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const port=Number(process.env.BLIND_PORT??4290);
const dir=resolve(process.env.BLIND_DIR??'qa/blind-play');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await (await browser.newContext({viewport:{width:1600,height:900}})).newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let n=0;

const routes={
 async goto(q){await page.goto(q.get('url'));await page.waitForTimeout(2000);return 'ok';},
 async shot(){const p=`${dir}/shot-${String(++n).padStart(4,'0')}.png`;await page.screenshot({path:p});return p;},
 async key(q){const k=q.get('k'),ms=Number(q.get('ms')??500);await page.keyboard.down(k);await page.waitForTimeout(ms);await page.keyboard.up(k);return 'ok';},
 async press(q){await page.keyboard.press(q.get('k'));return 'ok';},
 async type(q){await page.keyboard.type(q.get('t')??'');return 'ok';},
 async click(q){await page.mouse.click(Number(q.get('x')),Number(q.get('y')));return 'ok';},
 async move(q){const dx=Number(q.get('dx')??0),dy=Number(q.get('dy')??0);await page.mouse.move(800,450);await page.mouse.down({button:q.get('button')??'left'}).catch(()=>{});await page.mouse.move(800+dx,450+dy,{steps:12});await page.mouse.up({button:q.get('button')??'left'}).catch(()=>{});return 'ok';},
 async wait(q){await page.waitForTimeout(Number(q.get('ms')??1000));return 'ok';},
 async errors(){return JSON.stringify(errors.slice(-20));},
};

createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x');const fn=routes[u.pathname.slice(1)];
 try{res.end(fn?String(await fn(u.searchParams)):'routes: '+Object.keys(routes).join(','));}
 catch(e){res.statusCode=500;res.end(String(e?.message??e));}
}).listen(port,'127.0.0.1',()=>console.log('blind play driver on http://127.0.0.1:'+port));
