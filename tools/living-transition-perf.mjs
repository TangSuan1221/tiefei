// Frame-time probe across the level 1 → level 2 hand-off. DIAGNOSTIC: harbor completion is forced (as in
// living-transition-browser-check); the departure is a real B press. Compares level-two frame cost with direct entry.
import {writeFile} from 'node:fs/promises';
import {openLevelTwo} from './living-browser-lib.mjs';

const dir=process.env.LIVING_QA_DIR?process.env.LIVING_QA_DIR+'/transition-perf':'qa/living/transition-perf';
const sample=page=>page.evaluate(async()=>{
 const long=[];const po=new PerformanceObserver(l=>{for(const e of l.getEntries())long.push(Math.round(e.duration));});try{po.observe({type:'longtask'});}catch{}
 const dts=[];let last=performance.now();await new Promise(res=>{const t0=last;const f=n=>{dts.push(n-last);last=n;if(n-t0<4000)requestAnimationFrame(f);else res();};requestAnimationFrame(f);});po.disconnect();
 dts.sort((a,b)=>a-b);
 return {frames:dts.length,p50:+dts[dts.length>>1].toFixed(1),p95:+dts[Math.floor(dts.length*.95)].toFixed(1),max:+dts[dts.length-1].toFixed(1),long,
  heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1e6):null,canvases:document.querySelectorAll('canvas').length,legIndex:window.__pod.legIndex};});
const out={};
const {browser,page}=await openLevelTwo(dir,{query:''});
try{
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>window.__pod?.authoredSite?.index===0&&!!window.__podView,null,{timeout:60000});
 await page.evaluate(()=>{const r=window.__pod;if(r.phase==='transit')r.beginHarborApproach?.();});
 await page.waitForFunction(()=>window.__pod.phase==='site',null,{timeout:20000});
 await page.evaluate(()=>window.__pod.walkTo('camera'));await page.waitForTimeout(3000);
 out.harbor=await sample(page);
 await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;Object.defineProperty(s,'complete',{get:()=>true,configurable:true});
  const has=r.campaign.has.bind(r.campaign);r.campaign.has=(leg,k)=>leg===0&&k==='film'?true:has(leg,k);});
 await page.keyboard.press('b');
 await page.waitForFunction(()=>window.__pod.legIndex===1&&!!window.__living,null,{timeout:60000});
 await page.waitForTimeout(5000);
 out.livingAfterHarbor=await sample(page);
 await page.waitForTimeout(20000);
 out.livingAfterHarbor20s=await sample(page);
 console.log('RESULT',JSON.stringify(out));
}finally{await writeFile(dir+'/results.json',JSON.stringify(out,null,2)).catch(()=>{});await browser.close();}
