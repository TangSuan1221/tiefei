import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const server=await createServer({server:{port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1024,height:720}});
 await page.route('**/api/**',r=>r.abort());await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
 const result=await page.evaluate(async()=>{
  const {PodRun}=await import('/src/pod/sim/run.ts');
  const {drawLabDesk,labDeskState,labDeskAction:action}=await import('/src/pod/view/lab-desk.ts');
  const {HitMap}=await import('/src/pod/view/chrome.ts');
  const run=new PodRun(42);run.at='lab';run.power=.5;run.hull=1;run.tapes=[];run.mode='cruise';
  run.stock.set('sup.cell',2);run.stock.set('sup.wax',1);run.bench=[];
  labDeskState(run).tab='cargo';
  document.body.innerHTML='<canvas width="1024" height="720"></canvas>';document.body.style.cssText='margin:0';
  const ctx=document.querySelector('canvas').getContext('2d'),hits=new HitMap();
  const draw=()=>{hits.clear();drawLabDesk(ctx,run,0,0,1024,720,hits,null,{controls:[],playback:()=>''});};
  const click=id=>{draw();const rect=hits.rectOf(id);if(!rect)throw Error('Missing '+id);return action(run,hits.pick(rect.x+rect.w/2,rect.y+rect.h/2));};
  click('lab.cargo:select:sup.cell');const selected=labDeskState(run).cargoSelected==='sup.cell';
  click('lab.cargo:use');const used=run.count('sup.cell')===1&&Math.abs(run.power-.92)<.001;
  click('lab.cargo:delete');const pending=run.count('sup.cell')===1;
  click('lab.cargo:cancel');const cancelled=run.count('sup.cell')===1;
  click('lab.cargo:delete');click('lab.cargo:confirm');const deleted=run.count('sup.cell')===0&&!labDeskState(run).cargoSelected;
  click('lab.cargo:select:sup.wax');draw();const blocked=hits.pick(550,590)==='lab.cargo:panel';
  return {selected,used,pending,cancelled,deleted,blocked};
 });assert(Object.values(result).every(Boolean),JSON.stringify(result));
 await mkdir('qa/cargo-menu',{recursive:true});await page.screenshot({path:'qa/cargo-menu/selected.png'});console.log(result);
}finally{await browser.close();await server.close();}
