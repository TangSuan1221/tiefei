import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5180/?level=2');
 const data=await page.evaluate(async()=>{
  const {livingSealedReference}=await import('/src/pod/view/deepsea/living-task-player.ts');
  return livingSealedReference(await(await fetch('/assets/harbor/elias-task-reference.png')).blob());
 });
 writeFileSync('qa/living-2026-10-27/sealed-task-reference.png',Buffer.from(data.split(',')[1],'base64'));
 console.log('Saved runtime reference for visual inspection; no generation API invoked.');
}finally{await browser.close();}
